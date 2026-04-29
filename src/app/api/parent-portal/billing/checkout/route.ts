import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyParentJWT, PARENT_COOKIE_NAME } from '@/lib/parent-auth';
import stripe from '@/lib/stripe';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PACKAGES = [
  { hours: 10, price_cents: 35000, label: '10-Hour Package' },
  { hours: 20, price_cents: 64000, label: '20-Hour Package' },
  { hours: 30, price_cents: 90000, label: '30-Hour Package' },
] as const;

export async function POST(req: NextRequest) {
  const token = req.cookies.get(PARENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyParentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { student_id, hours } = await req.json();
  const pkg = PACKAGES.find(p => p.hours === hours);
  if (!student_id || !pkg) {
    return NextResponse.json({ error: 'Invalid student or package' }, { status: 400 });
  }

  // Verify student belongs to this parent
  const { data: student } = await supabase
    .from('students')
    .select('id, name, email')
    .eq('id', student_id)
    .ilike('parent_email', payload.parentEmail)
    .single();

  if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: payload.parentEmail,
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `StudyCore — ${pkg.label}`,
          description: `${pkg.hours} tutoring hours for ${student.name}`,
        },
        unit_amount: pkg.price_cents,
      },
      quantity: 1,
    }],
    metadata: {
      student_id: student.id,
      student_name: student.name,
      hours: String(pkg.hours),
      parent_email: payload.parentEmail,
    },
    success_url: `${appUrl}/parent-portal/billing?success=1&hours=${pkg.hours}`,
    cancel_url:  `${appUrl}/parent-portal/billing`,
  });

  return NextResponse.json({ url: session.url });
}
