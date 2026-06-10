// ⚠️ INTENTIONALLY DISABLED — 2026-06-10 ⚠️
//
// This endpoint was originally a bulk-recompute that overwrote every student's
// used_hours from scratch. It was converted to a read-only diagnostic in commit
// 5850b68 (forward-hours-enforcement), but the diagnostic itself produces
// misleading drift numbers because historical sessions' hours_attributed values
// (from the v3 backfill) don't perfectly match the old used_hours totals due to
// known attendance-matching limitations.
//
// The endpoint is now stubbed to return 503 until we have a strategy for
// improving historical attendance attribution. Forward-only hours are handled
// by applySessionHoursForStudent at each write site.

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    status: 'disabled',
    message: 'This diagnostic endpoint is temporarily disabled. The forward-hours-enforcement system (shipped 2026-06-10, commit 5850b68) writes used_hours per session via applySessionHoursForStudent. Historical sessions have hours_attributed set from the v3 backfill (with known matching limitations), which causes ~111 students to show drift between current used_hours and what would be recomputed from hours_attributed. This drift is cosmetic and not actionable until we have a strategy for improving historical attendance attribution.',
    shipped_at: '2026-06-10',
    last_updated: '2026-06-10',
  }, { status: 503 });
}
