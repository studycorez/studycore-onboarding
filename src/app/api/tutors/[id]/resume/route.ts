import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'PDF files only' }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const path = `${id}/resume.pdf`;

  const { error: uploadError } = await getDb().storage
    .from('tutor-resumes')
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: urlData } = getDb().storage.from('tutor-resumes').getPublicUrl(path);
  const resumeUrl = urlData.publicUrl;
  const resumeFilename = file.name;

  await getDb().from('tutors').update({ resume_url: resumeUrl, resume_filename: resumeFilename }).eq('id', id);

  return NextResponse.json({ resume_url: resumeUrl, resume_filename: resumeFilename });
}
