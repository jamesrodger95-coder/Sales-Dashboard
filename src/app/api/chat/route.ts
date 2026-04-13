export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { searchByName, getTodaySchedule, getTomorrowSchedule, getPipelineSummaryText, getManufacturingStatusText, getMonthStats, getFollowUpsText } from '@/lib/search';

const SYSTEM_PROMPT = `You are James Rodger's AI sales assistant at Bryant Dental — a UK dental MedTech company selling the world's lightest ergonomic loupes and headlights. James leads a 3-person sales team.

You have access to real-time data from Google Calendar and Zoho CRM. When data is provided to you, reference it directly with specific names and numbers. Be concise and direct — James checks you on his phone.

Products: Refractive Pro (2.9x, 3.8x, 5.7x, 7.8x) — 12 week mfg. MagniFlex (3-in-1) — 20 week mfg. Ignis 4 headlight. Halo headlight.

Rules:
- Be specific: use names, numbers, dates
- Be brief: 2-5 sentences for simple queries, bullet lists for data
- If data is provided, summarize it clearly
- If you can't find something, say so honestly
- Never make up data or people
- Phone numbers should be clickable
- Current context: always aware of today's date`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, history = [] } = body;

    if (!message) {
      return NextResponse.json({ reply: 'Please ask a question.' });
    }

    const q = message.toLowerCase();
    const now = new Date();

    // Determine what data to fetch based on the question
    let context = '';
    let dataFetched = false;

    try {
      // Schedule queries
      if (q.includes('today') || q.includes('schedule') || q.includes('calls today')) {
        context += 'TODAY\'S SCHEDULE:\n' + await getTodaySchedule() + '\n\n';
        dataFetched = true;
      }
      if (q.includes('tomorrow')) {
        context += 'TOMORROW\'S SCHEDULE:\n' + await getTomorrowSchedule() + '\n\n';
        dataFetched = true;
      }

      // Pipeline / stage queries
      if (q.includes('pipeline') || q.includes('stage') || q.includes('registered') || q.includes('contact') || q.includes('lead')) {
        context += 'PIPELINE:\n' + await getPipelineSummaryText() + '\n\n';
        dataFetched = true;
      }

      // Manufacturing queries
      if (q.includes('manufactur') || q.includes('production') || q.includes('delayed') || q.includes('overdue') || q.includes('magniflex') || q.includes('refractive')) {
        context += 'MANUFACTURING:\n' + await getManufacturingStatusText() + '\n\n';
        dataFetched = true;
      }

      // Follow-up queries
      if (q.includes('follow') || q.includes('chase') || q.includes('urgent') || q.includes('action') || q.includes('va ') || q.includes('team')) {
        context += 'FOLLOW-UPS:\n' + await getFollowUpsText() + '\n\n';
        dataFetched = true;
      }

      // Month stats
      if (q.includes('this month') || q.includes('stats') || q.includes('conversion') || q.includes('rate')) {
        context += 'THIS MONTH:\n' + await getMonthStats(now.getFullYear(), now.getMonth()) + '\n\n';
        dataFetched = true;
      }
      if (q.includes('last month')) {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        context += 'LAST MONTH:\n' + await getMonthStats(lm.getFullYear(), lm.getMonth()) + '\n\n';
        dataFetched = true;
      }

      // Name-based search (if none of the above matched, or if a name is detected)
      if (!dataFetched || /find|search|who is|status of|where|show me/i.test(q)) {
        // Extract potential name (words that aren't common query words)
        const stopWords = new Set(['find', 'search', 'show', 'me', 'who', 'is', 'the', 'of', 'has', 'did', 'what', 'when', 'where', 'how', 'my', 'all', 'any', 'a', 'an', 'in', 'for', 'to', 'from', 'with', 'about', 'ordered', 'status', 'stage', 'today', 'this', 'month', 'week']);
        const nameWords = message.split(/\s+/).filter((w: string) => !stopWords.has(w.toLowerCase()) && w.length > 2);
        const searchQuery = nameWords.join(' ');

        if (searchQuery.length > 2) {
          const results = await searchByName(searchQuery);
          if (results.length > 0) {
            context += `SEARCH RESULTS for "${searchQuery}":\n`;
            results.slice(0, 10).forEach(r => {
              context += `- ${r.name} | ${r.source} | ${r.extra || ''} | ${r.phone || 'no phone'} | ${r.email || ''}\n`;
            });
            context += '\n';
            dataFetched = true;
          } else {
            context += `No results found for "${searchQuery}"\n\n`;
          }
        }
      }
    } catch (fetchErr) {
      context += `Data fetch error: ${fetchErr instanceof Error ? fetchErr.message : 'unknown'}\n\n`;
    }

    // Build messages for Claude
    const messages = [
      ...history.slice(-8).map((h: { role: string; content: string }) => ({
        role: h.role, content: h.content,
      })),
      {
        role: 'user' as const,
        content: context
          ? `[DATA CONTEXT - today is ${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}]\n${context}\n[USER QUESTION]\n${message}`
          : message,
      },
    ];

    // Call Claude
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    const claudeData = await claudeRes.json();

    if (claudeData.error) {
      console.error('[Chat] Claude error:', claudeData.error);
      // Fallback: return raw context if we have it
      if (context) {
        return NextResponse.json({ reply: `I couldn't analyse that right now, but here's what I found:\n\n${context.substring(0, 500)}` });
      }
      return NextResponse.json({ reply: 'Sorry, I\'m having trouble right now. Try again in a moment.' });
    }

    const reply = claudeData.content?.[0]?.text || 'No response generated.';

    return NextResponse.json({ reply });
  } catch (error: unknown) {
    console.error('[Chat]', error);
    return NextResponse.json({ reply: 'Something went wrong. Please try again.' });
  }
}
