import fs from 'fs/promises';
import path from 'path';
import { createPdf, fixtureText, type FixtureCase, type FixtureKind } from '../src/lib/fixtures/content';

const root = path.join(process.cwd(), 'fixtures', 'generated');
const asha: FixtureCase = { customerName: 'Asha Sharma', policyNumber: 'AS-2025-887766', hospitalName: 'Greenleaf Multispeciality Hospital, Pune', treatment: 'Dengue fever inpatient treatment', admissionDate: '2026-10-20', dischargeDate: '2026-10-23', amount: 80000 };
const files: Array<[string, FixtureKind, FixtureCase]> = [
  ['asha-policy.pdf', 'policy', asha], ['asha-itemised-bill.pdf', 'bill', asha], ['asha-payment-receipt.pdf', 'receipt', asha], ['asha-discharge-summary.pdf', 'discharge', asha],
  ['insurer-query.pdf', 'query', asha], ['settlement-statement.pdf', 'settlement', asha], ['rejection-letter.pdf', 'rejection', { ...asha, customerName: 'Vikram Reddy', policyNumber: 'VR-2026-556677', admissionDate: '2026-09-18', dischargeDate: '2026-09-20', amount: 52000 }],
];

async function main() {
  await fs.mkdir(root, { recursive: true });
  for (const [name, kind, info] of files) await fs.writeFile(path.join(root, name), await createPdf(fixtureText(kind, info)));
  await fs.writeFile(path.join(root, 'README.txt'), 'These documents are fictional ClaimSaathi samples for the local demo. Do not use them for a real insurance claim.\n');
  console.log(`[fixtures] generated ${files.length} PDFs in ${root}`);
}
main().catch((error) => { console.error(error); process.exit(1); });
