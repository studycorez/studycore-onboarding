import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET() {
  const { data, error } = await supabase
    .from('resources')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const title       = form.get('title') as string;
  const description = form.get('description') as string | null;
  const type        = form.get('type') as string;
  const category    = form.get('category') as string;
  const url         = form.get('url') as string | null;
  const file        = form.get('file') as File | null;

  if (!title || !type || !category) {
    return NextResponse.json({ error: 'title, type, and category are required' }, { status: 400 });
  }

  let file_url: string | null = null;

  if (file && file.size > 0) {
    const ext = file.name.split('.').pop();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from('resources')
      .upload(path, buffer, { contentType: file.type });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
    const { data: { publicUrl } } = supabase.storage.from('resources').getPublicUrl(path);
    file_url = publicUrl;
  }

  const { data, error } = await supabase.from('resources').insert({
    title,
    description: description || null,
    type,
    category,
    url: url || null,
    file_url,
    uploaded_by: 'admin',
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
