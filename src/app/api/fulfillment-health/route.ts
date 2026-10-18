import { NextResponse } from 'next/server';
import { getMonthSessionStats } from '@/lib/airtable';
import { getSscStudents } from '@/lib/ghl-support';

export const dynamic = 'force-dynamic';

const STRIPE_BASE = 'https://api.stripe.com/v1';

function stripeHeaders() {
  return {
    Authorization: `Bearer ${process.env.STRIPE_RESTRICTED_KEY}`,
  };
}

async function getStripeRefundsThisMonth(): Promise<number> {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const created = Math.floor(monthStart.getTime() / 1000);
    // Fetch refunds created this month
    const res = await fetch(
      `${STRIPE_BASE}/refunds?created[gte]=${created}&limit=100`,
      { headers: stripeHeaders() },
    );
    if (!res.ok) {
      console.error('[stripe] getStripeRefundsThisMonth failed:', await res.text());
      return 0;
    }
    const data = await res.json();
    return (data.data ?? []).length;
  } catch (err) {
    console.error('[stripe] getStripeRefundsThisMonth error:', err);
    return 0;
  }
}

async function getStripeOpenDisputesCount(): Promise<number> {
  try {
    const res = await fetch(
      `${STRIPE_BASE}/disputes?status=needs_response&limit=100`,
      { headers: stripeHeaders() },
    );
    if (!res.ok) {
      console.error('[stripe] getStripeOpenDisputesCount failed:', await res.text());
      return 0;
    }
    const data = await res.json();
    return (data.data ?? []).length;
  } catch (err) {
    console.error('[stripe] getStripeOpenDisputesCount error:', err);
    return 0;
  }
}

export interface FulfillmentHealth {
  churnRate:       number;  // refunds this month / active students * 100
  deliveryRate:    number;  // held sessions / (held + no-show) * 100
  atRiskCount:     number;  // students with hoursRemaining <= 5
  openDisputes:    number;
  activeStudents:  number;
  refundsThisMonth: number;
  sessionsHeld:    number;
  sessionsNoShow:  number;
  asOf:            string;  // ISO timestamp
}

export async function GET() {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd   = now.toISOString().slice(0, 10);

  const [refundsThisMonth, openDisputes, sessionStats, students] = await Promise.all([
    getStripeRefundsThisMonth(),
    getStripeOpenDisputesCount(),
    getMonthSessionStats(monthStart, monthEnd),
    getSscStudents(),
  ]);

  const activeStudents = students.length;
  const atRiskCount    = students.filter(s => s.hoursRemaining > 0 && s.hoursRemaining <= 5).length;
  const churnRate      = activeStudents > 0
    ? Math.round((refundsThisMonth / activeStudents) * 100)
    : 0;

  const health: FulfillmentHealth = {
    churnRate,
    deliveryRate:    sessionStats.deliveryRate,
    atRiskCount,
    openDisputes,
    activeStudents,
    refundsThisMonth,
    sessionsHeld:    sessionStats.held,
    sessionsNoShow:  sessionStats.noShow,
    asOf:            now.toISOString(),
  };

  return NextResponse.json(health);
}
