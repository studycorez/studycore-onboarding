import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyTutorJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: self } = await supabase.from('tutors').select('archived_at').eq('id', payload.tutorId).single();
  if (self?.archived_at !== null) {
    return NextResponse.json({ error: 'Account inactive. Contact your administrator.' }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'PDF files only' }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const path = `${payload.tutorId}/resume.pdf`;

  const { error: uploadError } = await supabase.storage
    .from('tutor-resumes')
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: urlData } = supabase.storage.from('tutor-resumes').getPublicUrl(path);
  const resumeUrl = urlData.publicUrl;
  const resumeFilename = file.name;

  await supabase
    .from('tutors')
    .update({ resume_url: resumeUrl, resume_filename: resumeFilename })
    .eq('id', payload.tutorId);

  return NextResponse.json({ resume_url: resumeUrl, resume_filename: resumeFilename });
}
