import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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
    const { data: student, error: stuErr } = await supabase
      .from('students')
      .select('game_plan_url')
      .eq('id', id)
      .single();

    if (stuErr || !student?.game_plan_url) {
      return NextResponse.json({ error: 'No game plan uploaded for this student' }, { status: 400 });
    }

    // Download the PDF from Supabase storage
    const storagePath = `student-${id}/gameplan.pdf`;
    const { data: fileData, error: dlErr } = await supabase.storage
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
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 512,
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
              text: 'This is a StudyCore SAT tutoring game plan PDF. Extract the total number of tutoring hours committed to in this document. Look for things like "X hours per week for Y weeks", "total X hours", session counts multiplied by duration, etc. Respond with ONLY a JSON object: {"hours": number, "reasoning": string}',
            },
          ],
        },
      ],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse JSON from response (strip markdown fences if present)
    const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let parsed: { hours: number; reasoning: string };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({ hours: null, error: 'Could not parse AI response', raw });
    }

    if (typeof parsed.hours !== 'number' || isNaN(parsed.hours)) {
      return NextResponse.json({ hours: null, error: 'Could not extract hours', reasoning: parsed.reasoning });
    }

    return NextResponse.json({ hours: parsed.hours, reasoning: parsed.reasoning });
  } catch (err: any) {
    console.error('extract-hours error:', err);
    return NextResponse.json({ hours: null, error: err.message || 'Internal error' }, { status: 500 });
  }
}
