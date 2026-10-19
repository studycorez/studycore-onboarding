import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const AIRTABLE_BASE = 'appTAp5csw4vqR6NA';
const AIRTABLE_API  = 'https://api.airtable.com/v0';
const AT_STUDENTS   = 'tbloSDTj4Edc7nPVs';

const GHL_BASE            = 'https://services.leadconnectorhq.com';
const SUPPORT_LOCATION_ID = 'T4M5UHtoDZkcVAK31IFA';

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_SUPPORT_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

async function airtableQuery(formula: string) {
  const url = `${AIRTABLE_API}/${AIRTABLE_BASE}/${AT_STUDENTS}?filterByFormula=${encodeURIComponent(formula)}&pageSize=5`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return { error: await res.text() };
  const data = await res.json();
  return {
    count: data.records?.length ?? 0,
    records: (data.records ?? []).map((r: any) => ({
      id: r.id,
      Name: r.fields?.['Name'],
      'Parent Name': r.fields?.['Parent Name'],
      'Total Purchased hours': r.fields?.['Total Purchased hours'],
      'Total Purchased Hours': r.fields?.['Total Purchased Hours'],
    })),
  };
}

export async function GET(req: NextRequest) {
  const name       = req.nextUrl.searchParams.get('name') ?? '';
  const parentName = req.nextUrl.searchParams.get('parentName') ?? '';
  const oppId      = req.nextUrl.searchParams.get('oppId') ?? '';

  const result: Record<string, any> = { name, parentName, oppId };

  // 1. Airtable: search by student name
  if (name) {
    result.airtable_by_name = await airtableQuery(`LOWER({Name})=LOWER("${name.replace(/"/g, '')}")`);
  }

  // 2. Airtable: search by parent name
  if (parentName) {
    result.airtable_by_parent = await airtableQuery(`LOWER({Parent Name})=LOWER("${parentName.replace(/"/g, '')}")`);
  }

  // 3. GHL: fetch opportunity + contact if oppId provided
  if (oppId) {
    try {
      const res = await fetch(`${GHL_BASE}/opportunities/${oppId}`, { headers: ghlHeaders(), cache: 'no-store' });
      const data = res.ok ? await res.json() : null;
      const opp = data?.opportunity ?? data;
      const contact = opp?.contact ?? {};
      const contactId = contact?.id;

      result.ghl_opp = {
        id: opp?.id,
        name: opp?.name,
        contact_firstName: contact?.firstName,
        contact_lastName: contact?.lastName,
        contact_id: contactId,
      };

      // Fetch contact directly for fresh custom fields
      if (contactId) {
        const cRes = await fetch(`${GHL_BASE}/contacts/${contactId}`, { headers: ghlHeaders(), cache: 'no-store' });
        const cData = cRes.ok ? await cRes.json() : null;
        const cf = cData?.contact?.customFields ?? [];
        result.ghl_contact_custom_fields = cf.map((f: any) => ({
          id: f.id,
          fieldValueString: f.fieldValueString,
          value: f.value,
        }));
      }
    } catch (err: any) {
      result.ghl_error = err.message;
    }
  }

  // 4. List all contacts in support account named "Alexis" or "Ron"
  if (name || parentName) {
    try {
      const searchName = name || parentName;
      const searchRes = await fetch(
        `${GHL_BASE}/contacts/?locationId=${SUPPORT_LOCATION_ID}&query=${encodeURIComponent(searchName)}&limit=5`,
        { headers: ghlHeaders() },
      );
      if (searchRes.ok) {
        const sData = await searchRes.json();
        result.ghl_contacts_search = (sData.contacts ?? []).map((c: any) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
        }));
      }
    } catch (err: any) {
      result.ghl_search_error = err.message;
    }
  }

  return NextResponse.json(result, { status: 200 });
}
