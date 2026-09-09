export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { buildDemoFollowUpReport } from '@/lib/demo-followups';
import { sendGmailEmail } from '@/lib/weekly-report';

// Vercel cron schedules are UTC, but James wants this at 10am *London* time,
// which is 09:00 UTC in summer and 10:00 UTC in winter. Rather than let the
// email drift by an hour every March and October, the cron fires at both hours
// and this guard drops the firing that isn't 10am locally.
const TARGET_LONDON_HOUR = 10;

function londonHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', hour: 'numeric', hour12: false,
    }).format(now),
  );
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  const dryRun = url.searchParams.get('dryRun') === '1';

  const now = new Date();
  const hour = londonHour(now);

  if (!force && !dryRun && hour !== TARGET_LONDON_HOUR) {
    console.log(`[Cron DemoFollowUps] Skipping — London hour is ${hour}, want ${TARGET_LONDON_HOUR}`);
    return NextResponse.json({ success: true, skipped: true, londonHour: hour });
  }

  try {
    const report = await buildDemoFollowUpReport(now);

    if (dryRun) {
      return NextResponse.json({
        success: true, dryRun: true, londonHour: hour,
        subject: report.subject,
        fresh: report.fresh.length, ageing: report.ageing.length,
        noPhone: report.skippedNoPhone,
        text: report.text,
      });
    }

    const to = process.env.DEMO_FOLLOWUP_TO || process.env.WEEKLY_REPORT_CC || 'james@bryant.dental';
    const cc = process.env.DEMO_FOLLOWUP_CC || '';
    const sent = await sendGmailEmail(to, cc, report.subject, report.text, report.html);

    console.log(`[Cron DemoFollowUps] ${sent ? 'sent' : 'FAILED'} to ${to} — ${report.fresh.length} fresh, ${report.ageing.length} ageing`);

    // Report a failed send as an actual failure. Returning 200 with
    // emailSent:false is how a broken mail path stays invisible — the cron
    // looks green in Vercel while no email ever arrives.
    return NextResponse.json({
      success: sent, emailSent: sent, to, cc,
      subject: report.subject,
      fresh: report.fresh.length, ageing: report.ageing.length,
      noPhone: report.skippedNoPhone,
      ...(sent ? {} : { error: 'Gmail send failed — check server logs (commonly missing gmail.send scope on GOOGLE_REFRESH_TOKEN)' }),
    }, { status: sent ? 200 : 502 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Cron failed';
    console.error('[Cron DemoFollowUps]', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
