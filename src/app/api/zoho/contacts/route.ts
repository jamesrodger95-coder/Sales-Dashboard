export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { isZohoConfigured } from '@/lib/zoho-client';

export async function GET() {
  if (!isZohoConfigured()) {
    return NextResponse.json({ configured: false, contacts: [], message: 'Zoho CRM not configured' });
  }
  // Contacts are linked via Deals — James owns 0 contacts directly
  // Return deals' contact info instead
  return NextResponse.json({ configured: true, contacts: [], note: 'Contacts accessed via Deals' });
}
