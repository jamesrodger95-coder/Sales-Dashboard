export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { generateWeeklyReport, sendGmailEmail } from '@/lib/weekly-report';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const weekParam = searchParams.get('week') || undefined;
    const send = searchParams.get('send') === 'true';

    const report = await generateWeeklyReport(weekParam);

    if (send) {
      const to = process.env.WEEKLY_REPORT_TO || 'neha@bryant.dental';
      const cc = process.env.WEEKLY_REPORT_CC || 'james@bryant.dental';
      const sent = await sendGmailEmail(to, cc, report.subject, report.body);
      return NextResponse.json({ ...report, emailSent: sent, to, cc });
    }

    return NextResponse.json(report);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Report failed';
    console.error('[Weekly Report]', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
