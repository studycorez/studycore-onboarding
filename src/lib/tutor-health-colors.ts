export type HealthColor = 'green' | 'yellow' | 'red' | 'gray';

export function getNoShowColor(rate: number): HealthColor {
  if (rate === 0) return 'green';
  if (rate <= 0.05) return 'yellow';
  return 'red';
}

export function getFilingLagColor(hours: number | null): HealthColor {
  if (hours === null) return 'gray';
  if (hours < 4) return 'green';
  if (hours < 24) return 'yellow';
  return 'red';
}

export function getRatingColor(rating: number | null): HealthColor {
  if (rating === null) return 'gray';
  if (rating >= 4.5) return 'green';
  if (rating >= 4.0) return 'yellow';
  return 'red';
}

export function getScoreImprovementColor(improvement: number | null): HealthColor {
  if (improvement === null) return 'gray';
  if (improvement >= 100) return 'green';
  if (improvement >= 50) return 'yellow';
  return 'red';
}

// NPS surveys use 0–10 scale
export function getNpsColor(nps: number | null): HealthColor {
  if (nps === null) return 'gray';
  if (nps >= 8) return 'green';
  if (nps >= 6) return 'yellow';
  return 'red';
}

export function getAttestationRateColor(rate: number | null): HealthColor {
  if (rate === null) return 'gray';
  if (rate >= 0.8) return 'green';
  if (rate >= 0.5) return 'yellow';
  return 'red';
}

export function getPendingAttestationsColor(count: number): HealthColor {
  if (count === 0) return 'green';
  if (count <= 3) return 'yellow';
  return 'red';
}

export function getLastLoginColor(iso: string | null): HealthColor {
  if (iso === null) return 'gray';
  const daysSince = (Date.now() - new Date(iso).getTime()) / (24 * 3600 * 1000);
  if (daysSince < 7) return 'green';
  if (daysSince < 30) return 'yellow';
  return 'red';
}

export function colorToTextClass(color: HealthColor): string {
  switch (color) {
    case 'green':  return 'text-green-700';
    case 'yellow': return 'text-amber-600';
    case 'red':    return 'text-red-600';
    case 'gray':   return 'text-gray-400';
  }
}

export function colorToBgClass(color: HealthColor): string {
  switch (color) {
    case 'green':  return 'bg-green-50 text-green-700';
    case 'yellow': return 'bg-amber-50 text-amber-700';
    case 'red':    return 'bg-red-50 text-red-600 font-semibold';
    case 'gray':   return 'bg-gray-50 text-gray-400';
  }
}

export interface RedCountInput {
  no_show_rate: number;
  avg_filing_lag_hours: number | null;
  avg_session_rating: number | null;
  avg_engagement_rating: number | null;
  avg_nps: number | null;
  avg_score_improvement: number | null;
  pending_attestations: number;
  attestation_rate: number | null;
}

export function countRedMetrics(m: RedCountInput): number {
  return [
    getNoShowColor(m.no_show_rate) === 'red',
    getFilingLagColor(m.avg_filing_lag_hours) === 'red',
    getRatingColor(m.avg_session_rating) === 'red',
    getRatingColor(m.avg_engagement_rating) === 'red',
    getNpsColor(m.avg_nps) === 'red',
    getScoreImprovementColor(m.avg_score_improvement) === 'red',
    getPendingAttestationsColor(m.pending_attestations) === 'red',
    getAttestationRateColor(m.attestation_rate) === 'red',
  ].filter(Boolean).length;
}
