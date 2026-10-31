// ---------------------------------------------------------------------------
// ClaimSaathi shared constants.
// All money is integer PAISE. Dates are ISO strings. UI times show IST.
// ---------------------------------------------------------------------------

export const APP_NAME = 'ClaimSaathi';
export const APP_TAGLINE = 'Speak your language. Move your claim forward.';

// ---------------------------------------------------------------------------
// Workflow states & events
// ---------------------------------------------------------------------------

export const CLAIM_STATES = [
  'DRAFT',
  'NEEDS_INFORMATION',
  'DOCUMENTS_INCOMPLETE',
  'READY_FOR_REVIEW',
  'AWAITING_USER_APPROVAL',
  'SUBMITTED',
  'QUERY_RECEIVED',
  'UNDER_REVIEW',
  'PARTIALLY_SETTLED',
  'REJECTED',
  'CLOSED',
] as const;
export type ClaimState = (typeof CLAIM_STATES)[number];

export const ORCHESTRATOR_EVENTS = [
  'CASE_CREATED',
  'DOCUMENT_ADDED',
  'INFORMATION_UPDATED',
  'ANALYSIS_REQUESTED',
  'ACTION_APPROVED',
  'ACTION_CANCELLED',
  'MOCK_STATUS_RECEIVED',
  'SIMULATED_TIME_ADVANCED',
] as const;
export type OrchestratorEvent = (typeof ORCHESTRATOR_EVENTS)[number];

export const MOCK_STATUS_KINDS = [
  'SUBMISSION_ACK',
  'QUERY',
  'STATUS_UPDATE',
  'PARTIAL_SETTLEMENT',
  'REJECTION',
  'AUTH_UPDATE',
] as const;
export type MockStatusKind = (typeof MOCK_STATUS_KINDS)[number];

// ---------------------------------------------------------------------------
// Claims, documents, parties
// ---------------------------------------------------------------------------

export const CLAIM_ROUTES = ['REIMBURSEMENT', 'CASHLESS'] as const;
export type ClaimRoute = (typeof CLAIM_ROUTES)[number];

export const DOC_TYPES = [
  'POLICY',
  'ITEMISED_BILL',
  'PAYMENT_RECEIPT',
  'DISCHARGE_SUMMARY',
  'PRE_AUTH_REQUEST',
  'FINAL_AUTH_REQUEST',
  'SETTLEMENT_STATEMENT',
  'REJECTION_LETTER',
  'QUERY_LETTER',
  'CLAIM_FORM',
  'ID_PROOF',
  'OTHER',
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  POLICY: 'Policy document',
  ITEMISED_BILL: 'Itemised hospital bill',
  PAYMENT_RECEIPT: 'Payment receipt',
  DISCHARGE_SUMMARY: 'Discharge summary',
  PRE_AUTH_REQUEST: 'Pre-authorisation request',
  FINAL_AUTH_REQUEST: 'Final authorisation request',
  SETTLEMENT_STATEMENT: 'Settlement statement',
  REJECTION_LETTER: 'Rejection letter',
  QUERY_LETTER: 'Insurer query letter',
  CLAIM_FORM: 'Claim form',
  ID_PROOF: 'ID proof',
  OTHER: 'Other document',
};

/** Route-specific REQUIRED document types (completeness denominator). */
export const DOCUMENT_REQUIREMENTS: Record<ClaimRoute, DocType[]> = {
  REIMBURSEMENT: ['POLICY', 'ITEMISED_BILL', 'PAYMENT_RECEIPT', 'DISCHARGE_SUMMARY'],
  CASHLESS: ['POLICY', 'PRE_AUTH_REQUEST', 'FINAL_AUTH_REQUEST'],
};

export const RESPONSIBLE_PARTIES = ['CUSTOMER', 'HOSPITAL', 'INSURER', 'TPA', 'BROKER'] as const;
export type ResponsibleParty = (typeof RESPONSIBLE_PARTIES)[number];

export const RESPONSIBLE_PARTY_LABELS: Record<ResponsibleParty, string> = {
  CUSTOMER: 'You (customer)',
  HOSPITAL: 'Hospital',
  INSURER: 'Insurer',
  TPA: 'TPA',
  BROKER: 'Broker / assistant',
};

export const ACTION_TYPES = [
  'DOCUMENT_REQUEST',
  'CLAIM_SUBMISSION',
  'REMINDER',
  'ESCALATION',
  'CLARIFICATION',
  'GRIEVANCE',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  DOCUMENT_REQUEST: 'Document request',
  CLAIM_SUBMISSION: 'Claim submission',
  REMINDER: 'Reminder',
  ESCALATION: 'Escalation request',
  CLARIFICATION: 'Clarification request',
  GRIEVANCE: 'Grievance representation',
};

export const AGENT_NAMES = [
  'INTAKE_AND_ROUTING',
  'POLICY_EVIDENCE',
  'DOCUMENT_READINESS',
  'CLAIM_COORDINATION',
  'TIMELINE_AND_DELAY_WATCH',
  'SETTLEMENT_AND_APPEAL',
] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

export const AGENT_LABELS: Record<AgentName, string> = {
  INTAKE_AND_ROUTING: 'Intake & Routing',
  POLICY_EVIDENCE: 'Policy Evidence',
  DOCUMENT_READINESS: 'Document Readiness',
  CLAIM_COORDINATION: 'Claim Coordination',
  TIMELINE_AND_DELAY_WATCH: 'Timeline & Delay Watch',
  SETTLEMENT_AND_APPEAL: 'Settlement & Appeal',
};

export const EVIDENCE_KINDS = ['POLICY_CLAUSE', 'DOCUMENT_FIELD', 'SYSTEM_RULE', 'EXTERNAL_RECORD'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const EXTRACTION_STATUSES = ['NOT_ATTEMPTED', 'EXTRACTED', 'FAILED', 'MANUAL_ONLY'] as const;

export const CONSENT_PURPOSES = [
  'VOICE_TRANSCRIPTION',
  'TRANSLATION',
  'TEXT_TO_SPEECH',
  'GROUNDED_GENERATION',
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

// ---------------------------------------------------------------------------
// Regulatory / SLA configuration.
// These are DEMO ASSUMPTIONS: clearly labelled, configurable, and explicitly
// NOT verified against current authoritative regulatory sources.
// ---------------------------------------------------------------------------

export type SlaRule = {
  id: string;
  label: string;
  thresholdMinutes: number;
  startsOnEventType: string;
  endsOnEventType: string | null;
  verificationStatus: 'UNVERIFIED_DEMO_ASSUMPTION';
  sourceNote: string;
};

export const SLA_RULES: SlaRule[] = [
  {
    id: 'casHLESS_FINAL_AUTH_RESPONSE',
    label: 'Cashless final authorisation response',
    thresholdMinutes: 180, // 3 hours — demo threshold, configurable
    startsOnEventType: 'FINAL_AUTH_REQUEST_SENT',
    endsOnEventType: 'FINAL_AUTH_RESPONSE_RECEIVED',
    verificationStatus: 'UNVERIFIED_DEMO_ASSUMPTION',
    sourceNote:
      'Demonstration threshold only. This is not a verified IRDAI timeline; verify against current authoritative regulatory sources before relying on it. A timer breach does not guarantee any entitlement.',
  },
  {
    id: 'INSURER_QUERY_RESPONSE',
    label: 'Response to insurer document query',
    thresholdMinutes: 60, // 1 hour demo threshold for responding to queries
    startsOnEventType: 'QUERY_RECEIVED',
    endsOnEventType: null,
    verificationStatus: 'UNVERIFIED_DEMO_ASSUMPTION',
    sourceNote:
      'Demonstration threshold for customer-side action. Regulatory timelines for insurers are separate and must be verified independently.',
  },
];

// ---------------------------------------------------------------------------
// Currency & time formatting (UI-safe; no locale surprises)
// ---------------------------------------------------------------------------

export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: rupees % 1 === 0 ? 0 : 2,
    minimumFractionDigits: rupees % 1 === 0 ? 0 : 2,
  }).format(rupees);
}

export function formatIST(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d)} IST`;
}

export function formatISTDateOnly(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Parse a user-entered amount like "80,000" or "80000.50" to paise. */
export function parseINRInput(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

// ---------------------------------------------------------------------------
// Demo scenarios (ids referenced by the seed/demo panel)
// ---------------------------------------------------------------------------

export const SCENARIO_IDS = [
  'SCENARIO_A',
  'SCENARIO_B',
  'SCENARIO_C_PARTIAL',
  'SCENARIO_C_REJECTION',
] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export const SCENARIO_LABELS: Record<ScenarioId, string> = {
  SCENARIO_A: 'A · Missing document → mock submission (Asha Sharma)',
  SCENARIO_B: 'B · Cashless discharge delay (Rohan Mehta)',
  SCENARIO_C_PARTIAL: 'C · Partial settlement ₹70,000 / ₹80,000 (Kavita Nair)',
  SCENARIO_C_REJECTION: 'C · Optional rejection fixture — waiting period (Vikram Reddy)',
};

// Fictional parties (do NOT change without updating fixtures).
export const FICTIONAL_INSURER = 'Suraksha General Insurance Co. Ltd.';
export const FICTIONAL_TPA = 'MediAssist TPA Services Pvt. Ltd.';
export const FICTIONAL_BROKER = 'PolicyWise Brokers';
export const FICTIONAL_PRODUCT = 'AarogyaShield Individual Health Policy';
export const SUM_INSURED_PAISE = 500_000_00; // ₹5,00,000

// Fixture policy clause ids (must match scripts/generate-fixtures.ts content).
export const POLICY_CLAUSE_IDS = {
  DEFINITIONS: '§1.1',
  SUM_INSURED: '§3.2',
  WAITING_PERIOD: '§4.1',
  ROOM_RENT_LIMIT: '§5.4',
  CONSUMABLES_CAP: '§7.4',
  REIMBURSEMENT_DOCS: '§6.1',
  CASHLESS_DOCS: '§6.3',
  CASHLESS_TIMELINES: '§8.2',
  GRIEVANCE: '§9.1',
} as const;
