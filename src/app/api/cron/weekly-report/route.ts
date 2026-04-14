export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';

async function sendGmailEmail(to: string, cc: string, subject: string, body: string): Promise<boolean> {
  try {
    // Get Gmail access token using the same Google OAuth credentials
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN || '',
        grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) { console.error('[Gmail] Token error:', tokenData); return false; }

    // Build MIME message
    const mime = [
      `To: ${to}`,
      `Cc: ${cc}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ].join('\r\n');

    // Base64url encode
    const encoded = Buffer.from(mime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    // Send via Gmail API
    const sendRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded }),
    });

    const sendData = await sendRes.json();
    if (sendData.error) {
      console.error('[Gmail] Send error:', sendData.error);
      return false;
    }

    console.log('[Gmail] Email sent, ID:', sendData.id);
    return true;
  } catch (err) {
    console.error('[Gmail] Error:', err);
    return false;
  }
}

export async function GET(request: NextRequest) {
  // Verify cron auth in production
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[Cron] Generating weekly report...');

    // Generate the report
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const reportRes = await fetch(`${baseUrl}/api/reports/weekly`, { cache: 'no-store' });
    const report = await reportRes.json();

    if (report.error) {
      return NextResponse.json({ success: false, error: report.error }, { status: 500 });
    }

    // Send email
    const to = process.env.WEEKLY_REPORT_TO || 'neha@bryant.dental';
    const cc = process.env.WEEKLY_REPORT_CC || 'james@bryant.dental';

    const sent = await sendGmailEmail(to, cc, report.subject, report.body);

    return NextResponse.json({
      success: true,
      emailSent: sent,
      to, cc,
      subject: report.subject,
      preview: report.body.substring(0, 300),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Cron failed';
    console.error('[Cron Weekly]', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
