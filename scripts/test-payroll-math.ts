import { computePayableMinutes, computeSessionPay } from '../src/lib/payroll';

const tests: Array<[number, number]> = [
  [14, 60],   // below floor → 60
  [56, 60],   // below floor → 60
  [60, 60],   // exact 60
  [73, 60],   // floor to 60
  [89, 60],   // floor to 60
  [90, 90],
  [110, 90],
  [120, 120],
  [127, 120],
  [149, 120],
  [150, 150],
];

let failed = 0;
for (const [actual, expected] of tests) {
  const got = computePayableMinutes(actual);
  if (got !== expected) {
    console.error(`FAIL: ${actual} min → expected ${expected}, got ${got}`);
    failed++;
  } else {
    console.log(`OK: ${actual} min → ${got}`);
  }
}

// Aggregate test: 5 sessions × 73 min each should NOT collapse to 365 then floor
const sessions = [73, 73, 73, 73, 73];
const totalPayable = sessions.reduce((sum, m) => sum + computePayableMinutes(m), 0);
if (totalPayable !== 300) {
  console.error(`FAIL: 5 sessions × 73 min → expected 300 payable, got ${totalPayable}`);
  failed++;
} else {
  console.log(`OK: 5 × 73 min sessions = ${totalPayable} payable min`);
}

// computeSessionPay sanity
const pay = computeSessionPay(73, 25);
if (pay.payableMinutes !== 60 || pay.payAmount !== 25.00) {
  console.error(`FAIL: 73 min @ $25 → expected (60, 25.00), got`, pay);
  failed++;
} else {
  console.log(`OK: computeSessionPay(73, 25) → { payableMinutes: ${pay.payableMinutes}, payAmount: ${pay.payAmount} }`);
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nAll payroll math tests passed');
