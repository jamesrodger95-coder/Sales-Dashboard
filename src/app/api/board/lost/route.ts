export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { lostThisMonth } from '@/lib/board';

export async function GET() {
  const cards = await lostThisMonth();
  return NextResponse.json({ cards, count: cards.length });
}
