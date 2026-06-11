export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { wonThisMonth, totalValue } from '@/lib/board';

export async function GET() {
  const cards = await wonThisMonth();
  return NextResponse.json({ cards, count: cards.length, value: totalValue(cards) });
}
