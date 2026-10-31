import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { POLICY_CLAUSE_IDS } from '@/lib/constants';

export type FixtureKind =
  | 'policy'
  | 'bill'
  | 'receipt'
  | 'discharge'
  | 'preauth'
  | 'finalauth'
  | 'query'
  | 'settlement'
  | 'rejection';

export type FixtureCase = {
  customerName: string;
  policyNumber: string;
  hospitalName: string;
  treatment: string;
  admissionDate?: string;
  dischargeDate?: string;
  amount: number;
};

export const clauses = [
  { id: POLICY_CLAUSE_IDS.DEFINITIONS, title: 'Definitions', page: 1, text: 'Hospitalisation means admission to a registered hospital for medically necessary treatment.' },
  { id: POLICY_CLAUSE_IDS.SUM_INSURED, title: 'Sum insured', page: 2, text: 'The sum insured under this fictional policy is Rupees five lakh for the policy period.' },
  { id: POLICY_CLAUSE_IDS.WAITING_PERIOD, title: 'Initial waiting period', page: 4, text: 'Expenses arising from any illness during the first 30 days from policy inception are not payable, except accidental injury.' },
  { id: POLICY_CLAUSE_IDS.ROOM_RENT_LIMIT, title: 'Room category limit', page: 5, text: 'Room rent is limited to a semi-private room and one percent of sum insured per day.' },
  { id: POLICY_CLAUSE_IDS.REIMBURSEMENT_DOCS, title: 'Documents for reimbursement claims', page: 6, text: 'A reimbursement claim must include the policy document, itemised hospital bill, payment receipt and discharge summary. The insurer may ask for reasonable supporting records.' },
  { id: POLICY_CLAUSE_IDS.CASHLESS_DOCS, title: 'Documents for cashless claims', page: 6, text: 'Cashless authorisation requires a pre-authorisation request and a final authorisation request submitted by the network hospital.' },
  { id: POLICY_CLAUSE_IDS.CONSUMABLES_CAP, title: 'Consumables and non-medical items cap', page: 7, text: 'Consumables and disposables are payable up to Rupees 5,000 per hospitalisation. Amounts above this cap are not payable.' },
  { id: POLICY_CLAUSE_IDS.CASHLESS_TIMELINES, title: 'Cashless authorisation timelines', page: 8, text: 'The hospital and insurer should coordinate promptly on final authorisation. This fictional policy does not create a guaranteed payment timeline.' },
  { id: POLICY_CLAUSE_IDS.GRIEVANCE, title: 'Grievance redressal', page: 9, text: 'A policyholder may seek a factual review by writing to the insurer grievance cell with relevant claim records.' },
] as const;

export function fixtureText(kind: FixtureKind, data: FixtureCase): string {
  const header = `CLAIMSAATHI SAMPLE — FICTIONAL ONLY\n`;
  if (kind === 'policy') return `${header}AarogyaShield Individual Health Policy\nPolicy holder: ${data.customerName}\nPolicy number: ${data.policyNumber}\nInsurer: Suraksha General Insurance Co. Ltd.\n\n${clauses.map((c) => `Page ${c.page} — ${c.id} ${c.title}\n${c.text}`).join('\n\n')}`;
  if (kind === 'bill') return `${header}ITEMISED HOSPITAL BILL\nPatient: ${data.customerName}\nHospital: ${data.hospitalName}\nTreatment: ${data.treatment}\nAdmission: ${data.admissionDate ?? 'not recorded'}\nDischarge: ${data.dischargeDate ?? 'not recorded'}\n\nRoom charges: ₹13,500\nICU: ₹18,000\nSurgery: ₹32,000\nAnaesthesia: ₹6,500\nPharmacy & consumables: ₹4,000\nDiagnostics: ₹6,000\nTOTAL: ₹${data.amount.toLocaleString('en-IN')}`;
  if (kind === 'receipt') return `${header}PAYMENT RECEIPT\nReceived from: ${data.customerName}\nHospital: ${data.hospitalName}\nAmount paid: ₹${data.amount.toLocaleString('en-IN')}\nStatus: Paid in full`;
  if (kind === 'discharge') return `${header}DISCHARGE SUMMARY\nPatient: ${data.customerName}\nHospital: ${data.hospitalName}\nTreatment: ${data.treatment}\nAdmission date: ${data.admissionDate ?? 'not recorded'}\nDischarge date: ${data.dischargeDate ?? 'not recorded'}\nOutcome: Discharged with follow-up advice.`;
  if (kind === 'preauth') return `${header}CASHLESS PRE-AUTHORISATION REQUEST\nPatient: ${data.customerName}\nHospital: ${data.hospitalName}\nRequested amount: ₹60,000\nDecision: Approved for demonstration.`;
  if (kind === 'finalauth') return `${header}FINAL AUTHORISATION REQUEST\nPatient: ${data.customerName}\nHospital: ${data.hospitalName}\nRequested amount: ₹60,000\nStatus: Awaiting simulated insurer response.`;
  if (kind === 'query') return `${header}SIMULATED INSURER DOCUMENT QUERY\nPlease confirm the hospital registration details recorded for this admission before assessment continues.`;
  if (kind === 'settlement') return `${header}SIMULATED SETTLEMENT STATEMENT\nSubmitted bill: ₹80,000\nPayable: ₹70,000\nDeduction: Consumables & disposables beyond cap (${POLICY_CLAUSE_IDS.CONSUMABLES_CAP}) — ₹10,000\nReason: Policy cap is ₹5,000; the itemised bill lists ₹15,000.`;
  return `${header}SIMULATED REJECTION LETTER\nClaim: ${data.policyNumber}\nReason: ${POLICY_CLAUSE_IDS.WAITING_PERIOD} Initial waiting period. Admission occurred within 30 days of policy inception.\nThis is a fictional demonstration letter.`;
}

export async function createPdf(text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  // Standard PDF Helvetica is WinAnsi-only. Keep fixture PDFs extractable and
  // portable by representing the rupee sign as plain text inside the file;
  // the application UI continues to render INR with the ₹ symbol.
  const lines = text.replaceAll('₹', 'Rs. ').replaceAll('—', '-').replaceAll('·', '-').split('\n');
  let page = pdf.addPage([595, 842]);
  let y = 800;
  for (const raw of lines) {
    const words = raw.split(' ');
    let line = '';
    const flush = () => {
      page.drawText(line || ' ', { x: 48, y, size: 10.5, font, color: rgb(0.05, 0.12, 0.24) });
      y -= 16;
    };
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, 10.5) > 495) { flush(); line = word; }
      else line = candidate;
      if (y < 56) { page = pdf.addPage([595, 842]); y = 800; }
    }
    flush();
    if (y < 56) { page = pdf.addPage([595, 842]); y = 800; }
  }
  return pdf.save();
}
