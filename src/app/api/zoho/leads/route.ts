import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    message: 'Zoho CRM integration coming soon',
    status: 'not_connected',
    leads: [],
  });
}
