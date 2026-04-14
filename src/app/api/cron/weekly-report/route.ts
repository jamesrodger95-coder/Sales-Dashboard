export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { generateWeeklyReport, sendGmailEmail } from '@/lib/weekly-report';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[Cron] Generating weekly report...');
    const report = await generateWeeklyReport();
    const to = process.env.WEEKLY_REPORT_TO || 'neha@bryant.dental';
    const cc = process.env.WEEKLY_REPORT_CC || 'james@bryant.dental';
    const sent = await sendGmailEmail(to, cc, report.subject, report.body);
    console.log(`[Cron] Weekly report ${sent ? 'sent' : 'FAILED'} to ${to}`);
    return NextResponse.json({ success: true, emailSent: sent, to, cc, subject: report.subject });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Cron failed';
    console.error('[Cron Weekly]', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
