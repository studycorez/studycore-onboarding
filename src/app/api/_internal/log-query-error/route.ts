import { NextRequest, NextResponse } from 'next/server';
import { postToSlack } from '@/lib/slack';

export const dynamic = 'force-dynamic';

// Origin allowlist
const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_APP_URL,
  'https://app.studycore.net',
  'https://studycore-eight.vercel.app',
  'http://localhost:3000',
].filter(Boolean) as string[];

function checkOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // some browsers omit Origin on keepalive
  return ALLOWED_ORIGINS.some(allowed => origin === allowed);
}

// In-memory rate limit: max 10 reports per IP per 5 minutes
const rateMap = new Map<string, { count: number; windowStart: number }>();
const MAX_PER_WINDOW = 10;
const WINDOW_MS = 5 * 60 * 1000;

function checkRate(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    rateMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= MAX_PER_WINDOW) return false;
  entry.count++;
  return true;
}

// Periodic cleanup of stale entries (every 100 requests)
let cleanupCounter = 0;
function maybeCleanup() {
  cleanupCounter++;
  if (cleanupCounter < 100) return;
  cleanupCounter = 0;
  const now = Date.now();
  for (const [ip, entry] of rateMap) {
    if (now - entry.windowStart > WINDOW_MS) rateMap.delete(ip);
  }
}

export async function POST(req: NextRequest) {
  if (!checkOrigin(req)) {
    return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 });
  }

  maybeCleanup();

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';

  if (!checkRate(ip)) {
    return NextResponse.json({ ok: false, reason: 'rate_limited' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const { table, operation, errorCode, errorMessage, errorHint, pageUrl, timestamp } = body;

  if (!table || !operation || !errorMessage) {
    return NextResponse.json({ ok: false, reason: 'missing_fields' }, { status: 400 });
  }

  const lines = [
    `🚨 *Silent Supabase error* in \`${table}.${operation}\``,
    `\`${errorCode || '???'}\`: ${errorMessage}`,
  ];
  if (errorHint) lines.push(`Hint: ${errorHint}`);
  if (pageUrl) lines.push(`Page: ${pageUrl}`);
  if (timestamp) lines.push(`Time: ${timestamp}`);

  console.error(`[log-query-error] ${table}.${operation}: ${errorCode} ${errorMessage}`);

  postToSlack(lines.join('\n')).catch(err =>
    console.error('[log-query-error] Slack failed:', err)
  );

  return NextResponse.json({ ok: true });
}
