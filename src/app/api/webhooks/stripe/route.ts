import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import stripe from '@/lib/stripe';
import { postToSlack } from '@/lib/slack';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret || !sig) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const { student_id, student_name, hours, parent_email } = session.metadata ?? {};

    if (!student_id || !hours) {
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
    }

    const hoursNum = parseInt(hours);

    // Add hours to student
    const { data: student } = await supabase
      .from('students')
      .select('purchased_hours')
      .eq('id', student_id)
      .single();

    const newHours = (student?.purchased_hours ?? 0) + hoursNum;
    await supabase.from('students').update({ purchased_hours: newHours }).eq('id', student_id);

    // Create an invoice record
    const amountDollars = (session.amount_total ?? 0) / 100;
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('invoices').insert({
      student_id,
      period_start: today,
      period_end:   today,
      amount:       amountDollars,
      status:       'paid',
      paid_at:      new Date().toISOString(),
      notes:        `Stripe payment: ${hoursNum} hours. Session: ${session.id}`,
    });

    await postToSlack(
      `💳 *Payment received!* $${amountDollars.toFixed(2)} from ${parent_email ?? 'parent'} for ${student_name ?? 'student'} (${hoursNum} hrs)\nNew total: ${newHours} hrs purchased`,
    ).catch(() => {});
  }

  return NextResponse.json({ received: true });
}
