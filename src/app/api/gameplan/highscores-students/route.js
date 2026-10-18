export const maxDuration = 30;

const HIGHSCORES_API = 'https://api.highscores.ai/public/graphql';

export async function GET() {
  const apiKey = process.env.HISCORES_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'HISCORES_API_KEY not configured.' }, { status: 500 });
  }

  const query = `{
    studentReport(limit: 100) {
      student { id name }
      topicAccuracy { topicName correct total accuracyPercent }
      assignmentCompletion { total completed completionPercent }
    }
  }`;

  const res = await fetch(HIGHSCORES_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    return Response.json({ error: `HighScores API returned ${res.status}` }, { status: 502 });
  }

  const json = await res.json();
  if (json.errors?.length) {
    return Response.json({ error: json.errors[0].message }, { status: 502 });
  }

  const students = (json.data?.studentReport || []).map(r => ({
    id: r.student.id,
    name: r.student.name,
    topicAccuracy: r.topicAccuracy || [],
    assignmentCompletion: r.assignmentCompletion || null,
  })).sort((a, b) => a.name.localeCompare(b.name));

  return Response.json({ students });
}
