/**
 * Deterministic phase-hour allocation shared by BOTH PDF builders
 * (game plan and presentation) so the hours they display are always identical
 * and always sum to the program's total hours — regardless of what numbers
 * Claude wrote into the phase titles.
 */

// Weeks covered by a phase, parsed from its title's week range.
// "PHASE 4 — ... | Weeks 19–25 | 7 hours" → 7 weeks. A single "Week 9" → 1.
export function phaseWeekCount(title) {
  const span = (title || '').match(/[Ww]eeks?\s*(\d+)\s*[–\-—]\s*(\d+)/);
  if (span) return Math.max(1, parseInt(span[2]) - parseInt(span[1]) + 1);
  return 1;
}

// Allocate `totalHours` across phases in proportion to their week counts,
// returning an integer for each phase whose sum equals totalHours EXACTLY
// (largest-remainder method). Every phase gets at least 1 hour when possible.
export function allocatePhaseHours(phaseTitles, totalHours) {
  const n = phaseTitles.length;
  if (n === 0) return [];
  const total = parseInt(totalHours) || 0;
  const weeks = phaseTitles.map(phaseWeekCount);
  const sumWeeks = weeks.reduce((a, b) => a + b, 0) || n;

  // Degenerate: fewer total hours than phases — spread as evenly as possible.
  if (total < n) {
    const base = Math.floor(total / n);
    const res = weeks.map(() => base);
    let rem = total - base * n;
    for (let i = 0; i < n && rem > 0; i++, rem--) res[i]++;
    return res;
  }

  const exact = weeks.map(w => (w / sumWeeks) * total);
  const res   = exact.map(v => Math.max(1, Math.floor(v)));
  let diff = total - res.reduce((a, b) => a + b, 0);

  if (diff > 0) {
    // Hand out the leftover to the phases with the largest fractional parts.
    const order = exact
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < diff; k++) res[order[k % n].i]++;
  } else if (diff < 0) {
    // Over-allocated by the min-1 floor; trim from the largest phases (never below 1).
    const order = res.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v);
    let need = -diff, k = 0;
    while (need > 0 && k < 100000) {
      const idx = order[k % n].i;
      if (res[idx] > 1) { res[idx]--; need--; }
      k++;
    }
  }
  return res;
}

// Replace (or append) the "| N hours" segment of a phase title with the
// authoritative computed value, leaving the rest of the title untouched.
export function rewriteTitleHours(title, hours) {
  const t = title || '';
  if (/\|\s*\d+(?:\.\d+)?\s*(?:hours?|hrs?)\b/i.test(t)) {
    return t.replace(/\|\s*\d+(?:\.\d+)?\s*(?:hours?|hrs?)\b/i, `| ${hours} hours`);
  }
  if (/\d+(?:\.\d+)?\s*(?:hours?|hrs?)\b/i.test(t)) {
    return t.replace(/\d+(?:\.\d+)?\s*(?:hours?|hrs?)\b/i, `${hours} hours`);
  }
  return `${t} | ${hours} hours`;
}
