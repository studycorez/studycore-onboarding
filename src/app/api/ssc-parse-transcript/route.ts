/**
 * POST /api/ssc-parse-transcript
 *
 * Parses an onboarding call transcript with Claude to extract:
 * - Session schedule (days, times, duration, timezone, start date)
 * - Weekly check-in times for student and parent
 *
 * Body: { transcript: string }
 *
 * Response: {
 *   sessionDays: string[],
 *   sessionTimes: Record<string, string>,
 *   sessionDurationHrs: number,
 *   sessionTimezone: string,
 *   startDate: string | null,
 *   studentCheckinDay: string,
 *   studentCheckinTime: string,   // 24hr HH:MM
 *   parentCheckinDay: string,
 *   parentCheckinTime: string,    // 24hr HH:MM
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

const SYSTEM = `You extract scheduling information from onboarding call transcripts for a SAT tutoring company.
You return ONLY valid JSON — no markdown, no explanation, just the JSON object.`;

const PROMPT = (transcript: string) => `Extract scheduling information from this onboarding call transcript.

Return ONLY a JSON object with this exact structure:
{
  "sessionDays": ["Mon", "Wed"],
  "sessionTimes": { "Mon": "4:00 PM", "Wed": "4:00 PM" },
  "sessionDurationHrs": 1.5,
  "sessionTimezone": "America/New_York",
  "startDate": "2026-10-27",
  "studentCheckinDay": "Sun",
  "studentCheckinTime": "11:10",
  "parentCheckinDay": "Sun",
  "parentCheckinTime": "11:30"
}

Rules:
- sessionDays: only use Mon/Tue/Wed/Thu/Fri/Sat/Sun abbreviations
- sessionTimes: 12hr format with AM/PM per day; omit days where no time was confirmed
- sessionDurationHrs: 1, 1.5, or 2 — default 1.5 if not mentioned
- sessionTimezone: IANA timezone — default "America/New_York" if not mentioned; map Pacific→America/Los_Angeles, Mountain→America/Denver, Central→America/Chicago, Eastern→America/New_York
- startDate: YYYY-MM-DD if confirmed; null if not set
- studentCheckinDay / parentCheckinDay: day abbreviation, empty string if not set on call
- studentCheckinTime / parentCheckinTime: 24hr HH:MM format, empty string if not set on call

Transcript:
${transcript}`;

export async function POST(req: NextRequest) {
  const { transcript } = await req.json() as { transcript?: string };
  if (!transcript?.trim()) {
    return NextResponse.json({ error: 'transcript required' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system:     SYSTEM,
      messages:   [{ role: 'user', content: PROMPT(transcript) }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';

    // Strip any accidental markdown fences
    const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error('[ssc-parse-transcript] Failed to parse Claude JSON:', text);
      return NextResponse.json({ error: 'Could not parse Claude response', raw: text }, { status: 502 });
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error('[ssc-parse-transcript] Claude error:', err.message);
    return NextResponse.json({ error: 'Claude API error', detail: err.message }, { status: 502 });
  }
}
