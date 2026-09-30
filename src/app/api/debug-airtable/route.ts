import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const AIRTABLE_BASE = 'appTAp5csw4vqR6NA';
const AT_STUDENTS   = 'tbloSDTj4Edc7nPVs';

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name') ?? '';
  const formula = `LOWER({Name})=LOWER("${name.replace(/"/g, '')}")`;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AT_STUDENTS}?filterByFormula=${encodeURIComponent(formula)}&pageSize=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}` },
  });
  const data = await res.json();
  const fields = data.records?.[0]?.fields ?? {};
  return NextResponse.json({ fields, keys: Object.keys(fields) });
}
