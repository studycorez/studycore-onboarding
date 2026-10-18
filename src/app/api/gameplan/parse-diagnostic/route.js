import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('pdf');
    if (!file) return Response.json({ error: 'No PDF provided' }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          },
          {
            type: 'text',
            text: `Extract the diagnostic test data from this StudyCore SAT report. Return ONLY valid JSON with this exact structure, no explanation:
{
  "studentName": "string",
  "baselineScore": number,
  "rwScore": number,
  "mathScore": number,
  "blanks": number,
  "testDate": "YYYY-MM-DD or empty string",
  "diagnosticEntries": [
    { "platformName": "exact topic name as shown in report", "qs": number, "mastery": number, "avgTimeSecs": number }
  ]
}

Rules:
- platformName must be the EXACT topic name from the Unit/Topic Performance Analysis (e.g. "Words in context", "Linear Equation (Word Problems)", "Boundaries", "Rhetorical Synthesis")
- mastery is the integer percentage (e.g. 50 for 50%)
- blanks = number of omitted/blank questions shown (0 if not stated)
- avgTimeSecs is the "Time Per Questions" value in seconds (number)
- Include ALL subtopics shown (not the domain-level summaries like "Algebra 17 Qs 59%")
- testDate: extract the date the test was taken if shown (format YYYY-MM-DD), else empty string`
          }
        ]
      }]
    });

    let text = response.content[0].text.trim();
    if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    const data = JSON.parse(text);
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
