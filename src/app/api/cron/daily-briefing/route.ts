export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

// Vercel Cron Job — runs at 11:00 AM daily
// Configured in vercel.json: { "crons": [{ "path": "/api/cron/daily-briefing", "schedule": "0 11 * * *" }] }

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sets this header for cron jobs)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // In development, allow without secret
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    console.log('[Cron] Triggering daily briefing generation...');

    // Call the analyst POST endpoint internally
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const res = await fetch(`${baseUrl}/api/agents/analyst`, {
      method: 'POST',
      cache: 'no-store',
    });

    const data = await res.json();

    if (data.error) {
      console.error('[Cron] Briefing generation failed:', data.error);
      return NextResponse.json({ success: false, error: data.error }, { status: 500 });
    }

    console.log('[Cron] Daily briefing generated successfully');
    return NextResponse.json({ success: true, generatedAt: data.generatedAt });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Cron job failed';
    console.error('[Cron]', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
