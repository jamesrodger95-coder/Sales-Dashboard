export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { readAll, create, Debrief, resolveFollowUpDate, storageMode } from '@/lib/debriefs';
import { pushDebriefToZoho, CrmPushResult } from '@/lib/debrief-zoho';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const all = await readAll();

  const date = searchParams.get('date');
  const outcome = searchParams.get('outcome');
  const followUpDone = searchParams.get('followUpDone');
  const name = searchParams.get('name');
  const email = searchParams.get('email');

  let filtered = all;
  if (date) filtered = filtered.filter(d => d.callDate.startsWith(date));
  if (outcome) filtered = filtered.filter(d => d.outcome === outcome);
  if (followUpDone === 'true') filtered = filtered.filter(d => d.followUpDone);
  if (followUpDone === 'false') filtered = filtered.filter(d => !d.followUpDone);
  if (name) filtered = filtered.filter(d => d.name.toLowerCase().includes(name.toLowerCase()));
  if (email) filtered = filtered.filter(d => d.email?.toLowerCase() === email.toLowerCase());

  filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ debriefs: filtered, total: filtered.length });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
    console.log('[Debriefs POST]', { storage: storageMode(), name: body.name, outcome: body.outcome, hasEmail: !!body.email });

    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const followUpDate = (body.followUpDate as string | undefined)
      || resolveFollowUpDate(
        (body.followUpType as Debrief['followUpType']) || 'No Follow Up',
        body.followUpCustomDate as string | undefined,
      );

    const debrief = await create({
      name: (body.name as string).trim(),
      email: (body.email as string | null) || null,
      phone: (body.phone as string | null) || null,
      country: (body.country as string | null) || null,
      callDate: (body.callDate as string | undefined) || new Date().toISOString(),
      frame: (body.frame as Debrief['frame']) || null,
      magnification: (body.magnification as Debrief['magnification']) || null,
      px: !!body.px,
      headlight: (body.headlight as Debrief['headlight']) || null,
      outcome: (body.outcome as Debrief['outcome']) || null,
      notes: (body.notes as string) || '',
      followUpDate,
      followUpType: (body.followUpType as Debrief['followUpType']) || 'No Follow Up',
      source: (body.source as Debrief['source']) || 'dashboard',
    } as Omit<Debrief, 'id' | 'createdAt' | 'reminderSent' | 'followUpDone'>);

    // CRM push — non-blocking for the save, but include result in response.
    // 5-second hard cap so a slow Zoho doesn't keep the user waiting.
    let crm: CrmPushResult = { status: 'skipped' };
    if (body.pushToCrm !== false) {
      try {
        crm = await Promise.race([
          pushDebriefToZoho(debrief),
          new Promise<CrmPushResult>(resolve =>
            setTimeout(() => resolve({ status: 'failed' }), 5000)
          ),
        ]);
      } catch (err) {
        console.error('[Debriefs] CRM push threw:', err);
        crm = { status: 'failed' };
      }
    }

    return NextResponse.json({ debrief, crm });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Debriefs POST] save failed:', { storage: storageMode(), msg, body });
    return NextResponse.json(
      { error: `Save failed: ${msg}`, storage: storageMode() },
      { status: 500 },
    );
  }
}
