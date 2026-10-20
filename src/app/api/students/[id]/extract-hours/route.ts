import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;

  try {
    // Fetch the student to get game_plan_url / storage path
    const { data: student, error: stuErr } = await getDb()
      .from('students')
      .select('game_plan_url')
      .eq('id', id)
      .single();

    if (stuErr || !student?.game_plan_url) {
      return NextResponse.json({ error: 'No game plan uploaded for this student' }, { status: 400 });
    }

    // Download the PDF from Supabase storage
    const storagePath = `student-${id}/gameplan.pdf`;
    const { data: fileData, error: dlErr } = await getDb().storage
      .from('game-plans')
      .download(storagePath);

    if (dlErr || !fileData) {
      return NextResponse.json({ error: 'Could not download game plan from storage' }, { status: 500 });
    }

    // Convert to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    // Call Anthropic with the PDF as a document block
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            } as any,
            {
              type: 'text',
              text: 'This is a StudyCore SAT tutoring game plan PDF. Extract the following:\n1. Total tutoring hours (look for "X hours per week for Y weeks", "total X hours", session counts × duration, etc.)\n2. Target SAT score (look for "goal score", "target score", "achieve X", "reach X", etc.)\n3. Test date (look for a specific SAT test date; format as YYYY-MM-DD if found)\n4. Weak areas (list subject areas needing improvement such as Math, Reading, Writing, Grammar, Algebra, etc.)\n\nRespond with ONLY a JSON object: {"hours": number|null, "target_score": number|null, "test_date": "YYYY-MM-DD"|null, "weak_areas": string[]|null, "reasoning": string}',
            },
          ],
        },
      ],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse JSON from response (strip markdown fences if present)
    const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let parsed: { hours: number | null; target_score: number | null; test_date: string | null; weak_areas: string[] | null; reasoning: string };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({ hours: null, error: 'Could not parse AI response', raw });
    }

    // Update the student record with any extracted fields
    const updatePayload: Record<string, any> = {};
    if (typeof parsed.hours === 'number' && !isNaN(parsed.hours)) updatePayload.purchased_hours = parsed.hours;
    if (typeof parsed.target_score === 'number' && !isNaN(parsed.target_score)) updatePayload.target_score = parsed.target_score;
    if (parsed.test_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.test_date)) updatePayload.test_date = parsed.test_date;
    if (Array.isArray(parsed.weak_areas) && parsed.weak_areas.length > 0) updatePayload.weak_areas = parsed.weak_areas;

    if (Object.keys(updatePayload).length > 0) {
      await getDb().from('students').update(updatePayload).eq('id', id);
    }

    return NextResponse.json({
      hours: parsed.hours ?? null,
      target_score: parsed.target_score ?? null,
      test_date: parsed.test_date ?? null,
      weak_areas: parsed.weak_areas ?? null,
      reasoning: parsed.reasoning,
    });
  } catch (err: any) {
    console.error('extract-hours error:', err);
    return NextResponse.json({ hours: null, error: err.message || 'Internal error' }, { status: 500 });
  }
}
