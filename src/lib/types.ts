import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared contracts: agent outputs, API payloads, DTOs.
// Both the backend (src/lib/agents, src/app/api) and the frontend
// (src/components, src/app) import from this file. Do not break these shapes.
// ---------------------------------------------------------------------------

// --------------------------- Agent output ---------------------------

export const FINDING_SEVERITIES = ['info', 'warning', 'critical'] as const;

export const findingSchema = z.object({
  id: z.string(),
  type: z.string(),
  severity: z.enum(FINDING_SEVERITIES),
  message: z.string(),
  detail: z.string().optional(),
});

export const proposedActionSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  description: z.string(),
  responsibleParty: z.enum(['CUSTOMER', 'HOSPITAL', 'INSURER', 'TPA', 'BROKER']),
  requiresApproval: z.boolean(),
  channel: z.enum(['LOCAL', 'MOCK_INSURER', 'SIMULATED_EMAIL', 'SIMULATED_SMS']).optional(),
  evidenceRefIds: z.array(z.string()).optional(),
});

export const evidenceRefSchema = z.object({
  id: z.string(),
  kind: z.enum(['POLICY_CLAUSE', 'DOCUMENT_FIELD', 'SYSTEM_RULE', 'EXTERNAL_RECORD']),
  title: z.string(),
  documentId: z.string().nullable().optional(),
  clauseId: z.string().nullable().optional(),
  page: z.number().int().nullable().optional(),
  excerpt: z.string(),
  extractionStatus: z.string(),
});

export const agentOutputSchema = z.object({
  agentName: z.string(),
  status: z.enum(['completed', 'blocked', 'failed']),
  summary: z.string(),
  findings: z.array(findingSchema),
  evidenceReferences: z.array(evidenceRefSchema),
  uncertainties: z.array(z.string()),
  proposedActions: z.array(proposedActionSchema),
  nextAgent: z.string().nullable(),
});

export type Finding = z.infer<typeof findingSchema>;
export type ProposedAction = z.infer<typeof proposedActionSchema>;
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;
export type AgentOutput = z.infer<typeof agentOutputSchema>;

// --------------------------- Agent context & toolbox ---------------------------

export type CaseDocumentView = {
  id: string;
  docType: string;
  originalName: string;
  mimeType: string;
  extractionStatus: string;
  pageCount: number | null;
  fields: Record<string, string>;
  extractedText: string | null;
};

export type ClauseView = {
  id: string;
  documentId: string;
  clauseId: string;
  title: string;
  text: string;
  page: number;
};

export type CaseEventView = {
  id: string;
  type: string;
  summary: string;
  actor: string;
  simulatedAt: string;
};

export type TaskView = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  responsibleParty: string;
  dueAt: string | null;
};

export type AgentContext = {
  caseId: string;
  reference: string;
  route: string;
  scenario: string | null;
  state: string;
  customerName: string;
  patientRelation: string | null;
  policyHolderName: string;
  policyNumber: string;
  insurerName: string;
  productName: string;
  hospitalName: string;
  hospitalEmail: string | null;
  treatmentDescription: string;
  diagnosis: string | null;
  admissionDate: string | null;
  dischargeDate: string | null;
  icdCode: string | null;
  claimedAmountPaise: number;
  settledAmountPaise: number | null;
  settlementSummary: string | null;
  mockExternalRef: string | null;
  simulatedNow: string;
  documents: CaseDocumentView[];
  clauses: ClauseView[];
  events: CaseEventView[];
  tasks: TaskView[];
};

export type ToolLogEntry = {
  tool: string;
  status: 'ok' | 'error' | 'not_found' | 'noop';
  detail: string;
  at: string;
};

/**
 * Tools handed to an agent. Agents MUST stay pure: no Prisma imports, no
 * filesystem, no network. All data arrives via AgentContext; all side effects
 * (evidence persistence, tool log persistence, task creation) are performed by
 * the orchestrator after the agent returns its validated AgentOutput.
 */
export type Toolbox = {
  log(tool: string, status: ToolLogEntry['status'], detail: string): void;
  getDocumentText(documentId: string): string | null;
  searchClauses(query: string): ClauseView[];
  searchDocumentText(query: string): { documentId: string; snippet: string }[];
  hasDocumentType(docType: string): boolean;
  documentsOfType(docType: string): CaseDocumentView[];
  readField(documentId: string, fieldKey: string): string | null;
  /** Collects an evidence reference (persisted later by the orchestrator). */
  recordEvidence(ref: Omit<EvidenceRef, 'id'>): string;
  toolLog(): ToolLogEntry[];
};

export type AgentModule = {
  name: string;
  run(ctx: AgentContext, tools: Toolbox): AgentOutput | Promise<AgentOutput>;
};

// --------------------------- API payloads ---------------------------

export const wizardPayloadSchema = z.object({
  customerName: z.string().trim().min(1, 'Customer name is required'),
  patientRelation: z.string().trim().optional().default(''),
  policyHolderName: z.string().trim().min(1, 'Policy holder name is required'),
  policyNumber: z.string().trim().min(1, 'Policy number is required'),
  insurerName: z.string().trim().min(1, 'Insurer name is required'),
  productName: z.string().trim().min(1, 'Policy/product name is required'),
  route: z.enum(['REIMBURSEMENT', 'CASHLESS']),
  hospitalName: z.string().trim().min(1, 'Hospital name is required'),
  hospitalEmail: z.string().trim().optional().default(''),
  treatmentDescription: z.string().trim().min(1, 'Treatment description is required'),
  diagnosis: z.string().trim().optional().default(''),
  admissionDate: z.string().trim().optional().default(''),
  dischargeDate: z.string().trim().optional().default(''),
  icdCode: z.string().trim().optional().default(''),
  claimedAmountRupees: z.number().positive('Claimed amount must be positive'),
});
export type WizardPayload = z.infer<typeof wizardPayloadSchema>;

export const fieldCorrectionSchema = z.object({
  fields: z.record(z.string().trim().max(500)),
});
export type FieldCorrectionPayload = z.infer<typeof fieldCorrectionSchema>;

export const actionDraftPayloadSchema = z.object({
  type: z.enum(['DOCUMENT_REQUEST', 'CLAIM_SUBMISSION', 'REMINDER', 'ESCALATION', 'CLARIFICATION', 'GRIEVANCE']),
  title: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(1000),
  recipient: z.enum(['CUSTOMER', 'HOSPITAL', 'INSURER', 'TPA', 'BROKER']),
  message: z.string().trim().min(1).max(8000),
  attachmentDocIds: z.array(z.string()).default([]),
});
export type ActionDraftPayload = z.infer<typeof actionDraftPayloadSchema>;

export const actionEditPayloadSchema = actionDraftPayloadSchema.partial();
export type ActionEditPayload = z.infer<typeof actionEditPayloadSchema>;

export const demoTriggerSchema = z.object({
  kind: z.enum(['QUERY', 'STATUS_UPDATE', 'PARTIAL_SETTLEMENT', 'REJECTION', 'DEMO_CREDIT']),
});
export type DemoTriggerPayload = z.infer<typeof demoTriggerSchema>;

export const advanceTimeSchema = z.object({
  minutes: z.number().int().min(1).max(60 * 24 * 7),
});
export type AdvanceTimePayload = z.infer<typeof advanceTimeSchema>;

export const consentPayloadSchema = z.object({
  purpose: z.enum(['VOICE_TRANSCRIPTION', 'TRANSLATION', 'TEXT_TO_SPEECH', 'GROUNDED_GENERATION']),
  grant: z.boolean(),
});
export type ConsentPayload = z.infer<typeof consentPayloadSchema>;

export const transcribeRequestSchema = z.object({
  // audioBase64 only used in connected (sarvam) mode
  audioBase64: z.string().optional(),
  mime: z.string().optional(),
  language: z.enum(['hi-IN', 'en-IN', 'unknown']).default('unknown'),
  // demo mode: one of the prepared sample transcript ids
  sampleTranscriptId: z.string().optional(),
});
export type TranscribeRequest = z.infer<typeof transcribeRequestSchema>;

export const translateRequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  source: z.string().default('en-IN'),
  target: z.string().default('hi-IN'),
});
export type TranslateRequest = z.infer<typeof translateRequestSchema>;

export const ttsRequestSchema = z.object({
  text: z.string().trim().min(1).max(2500),
  lang: z.enum(['en-IN', 'hi-IN']).default('en-IN'),
});
export type TtsRequest = z.infer<typeof ttsRequestSchema>;

export const assistantQuerySchema = z.object({
  q: z.string().trim().min(1).max(500),
  lang: z.enum(['en', 'hi']).default('en'),
});
export type AssistantQuery = z.infer<typeof assistantQuerySchema>;

// --------------------------- API envelopes & DTOs ---------------------------

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: string; message: string; fallback?: string } };
export type ApiResult<T> = ApiOk<T> | ApiErr;

export type DocumentDto = {
  id: string;
  docType: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  extractionStatus: string;
  extractionMethod: string | null;
  pageCount: number | null;
  isFixture: boolean;
  createdAt: string;
  provenanceNote: string | null;
  fields: { fieldKey: string; value: string; source: string; edited: boolean }[];
  isRequiredForRoute: boolean;
};

export type ReadinessDto = {
  requiredDocTypes: string[];
  present: string[];
  missing: string[];
  validRequiredCount: number;
  totalRequiredCount: number;
  completenessPct: number;
  failedChecks: { id: string; type: string; message: string }[];
  note: string;
};

export type CaseSummaryDto = {
  id: string;
  reference: string;
  customerName: string;
  insurerName: string;
  hospitalName: string;
  route: string;
  state: string;
  scenario: string | null;
  currentBlocker: string | null;
  nextBestAction: string | null;
  responsibleParty: string | null;
  claimedAmountPaise: number;
  settledAmountPaise: number | null;
  mockExternalRef: string | null;
  createdAt: string;
  updatedAt: string;
  documentsRemaining: number;
  lastActivityAt: string | null;
};

export type ActivityItemDto = {
  id: string;
  agentName: string;
  status: string;
  triggerEvent: string;
  startedAt: string | null;
  endedAt: string | null;
  summary: string | null;
  error: string | null;
  nextAgent: string | null;
  tools: ToolLogEntry[];
  evidenceRefs: { id: string; title: string }[];
};

export type TimelineItemDto = {
  id: string;
  type: string;
  summary: string;
  actor: string;
  simulatedAt: string;
  evidenceIds: string[];
};

export type OutboundActionDto = {
  id: string;
  type: string;
  title: string;
  purpose: string;
  recipient: string;
  recipientName: string | null;
  message: string;
  dataShared: string[];
  attachmentDocIds: string[];
  draftVersion: number;
  status: string;
  idempotencyKey: string | null;
  mockRef: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  approval: { status: string; draftVersion: number; decidedAt: string | null } | null;
};

export type MockLogDto = {
  id: string;
  direction: string;
  endpoint: string;
  requestJson: string | null;
  responseJson: string | null;
  statusCode: number | null;
  latencyMs: number | null;
  simulatedAt: string;
};
