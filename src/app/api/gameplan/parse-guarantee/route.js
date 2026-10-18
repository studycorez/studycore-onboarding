import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 90;

export async function POST(request) {
  try {
    const formData = await request.formData();

    const scoreReportFile = formData.get('scoreReport');
    if (!scoreReportFile) {
      return Response.json({ error: 'No score report provided' }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Build score report content block
    const srBuffer = await scoreReportFile.arrayBuffer();
    const srBase64 = Buffer.from(srBuffer).toString('base64');
    const srMime = scoreReportFile.type || 'image/jpeg';

    let scoreReportBlock;
    if (srMime === 'application/pdf') {
      scoreReportBlock = {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: srBase64 },
      };
    } else {
      // image
      const imageMediaType = ['image/jpeg','image/png','image/webp','image/gif'].includes(srMime)
        ? srMime : 'image/jpeg';
      scoreReportBlock = {
        type: 'image',
        source: { type: 'base64', media_type: imageMediaType, data: srBase64 },
      };
    }

    // Collect all portal files (PDF or image, no cap)
    const portalBlocks = [];
    for (let i = 0; ; i++) {
      const pf = formData.get(`portalScreenshot_${i}`);
      if (!pf) break; // stop when no more files
      const pBuffer = await pf.arrayBuffer();
      const pBase64 = Buffer.from(pBuffer).toString('base64');
      const pMime = pf.type || 'application/pdf';
      if (pMime === 'application/pdf') {
        portalBlocks.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pBase64 },
        });
      } else {
        const pMediaType = ['image/jpeg','image/png','image/webp','image/gif'].includes(pMime)
          ? pMime : 'image/jpeg';
        portalBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: pMediaType, data: pBase64 },
        });
      }
    }

    const hasPortal = portalBlocks.length > 0;

    // Parse score report
    const scoreReportPromise = client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          scoreReportBlock,
          {
            type: 'text',
            text: `Parse this official SAT score report and return ONLY valid JSON with this exact structure, no explanation:
{
  "studentName": "string or null",
  "totalScore": number or null,
  "rwScore": number or null,
  "mathScore": number or null,
  "testDate": "string or null",
  "domains": {
    "cs": "band or null",
    "ii": "band or null",
    "eoi": "band or null",
    "sec": "band or null",
    "alg": "band or null",
    "am": "band or null",
    "psda": "band or null",
    "gt": "band or null"
  }
}

Domain keys:
- cs = Craft and Structure
- ii = Information and Ideas
- eoi = Expression of Ideas
- sec = Standard English Conventions
- alg = Algebra
- am = Advanced Math
- psda = Problem-Solving and Data Analysis
- gt = Geometry and Trigonometry

Band values MUST be one of these exact strings (use en-dashes \u2013):
"Below 400" | "400\u2013450" | "450\u2013500" | "490\u2013540" | "500\u2013550" | "550\u2013600" | "610\u2013670" | "680\u2013760" | "680\u2013800" | "N/A"

If a domain is not shown or not applicable, use null.
testDate: extract the date if visible (e.g. "March 2025"), else null.`,
          }
        ]
      }]
    });

    // Parse portal screenshot(s) if provided
    let portalPromise = null;
    if (hasPortal) {
      portalPromise = client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            ...portalBlocks,
            {
              type: 'text',
              text: `This is a StudyCore platform report showing a student's test scores and topic performance. Extract the following and return ONLY valid JSON, no explanation:
{
  "topicsCovered": ["array of topic name strings that the student has completed or studied"],
  "sessionsCompleted": number or null
}

For topicsCovered, list the exact topic names shown as completed, mastered, or studied in the report.
For sessionsCompleted, extract the number of sessions the student has completed if shown, else null.`,
            }
          ]
        }]
      });
    }

    // Run in parallel if portal provided
    const [srResponse, portalResponse] = await Promise.all([
      scoreReportPromise,
      portalPromise || Promise.resolve(null),
    ]);

    // Parse score report response
    let scoreReportData;
    try {
      let srText = srResponse.content[0].text.trim();
      if (srText.startsWith('```')) srText = srText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      scoreReportData = JSON.parse(srText);
    } catch {
      return Response.json({ error: 'Failed to parse score report response as JSON' }, { status: 500 });
    }

    // Parse portal response
    let portalData = null;
    if (portalResponse) {
      try {
        let pText = portalResponse.content[0].text.trim();
        if (pText.startsWith('```')) pText = pText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        portalData = JSON.parse(pText);
      } catch {
        portalData = { topicsCovered: [], sessionsCompleted: null };
      }
    }

    return Response.json({
      scoreReport: scoreReportData,
      portal: portalData,
    });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
