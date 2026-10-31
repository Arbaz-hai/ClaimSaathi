import 'server-only';

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/db';
import { agents } from '@/lib/agents';
import { createPdf, clauses, fixtureText, type FixtureCase, type FixtureKind } from '@/lib/fixtures/content';
import { DOCUMENT_REQUIREMENTS, DOC_TYPE_LABELS, FICTIONAL_INSURER, FICTIONAL_PRODUCT, FICTIONAL_TPA, SLA_RULES, type ActionType, type ClaimRoute, type DocType } from '@/lib/constants';
import { ensureDataDirs, sanitizeFilename, uploadPathFor } from '@/lib/security/files';
import type { ActionDraftPayload, ActionEditPayload, AgentContext, AgentOutput, CaseSummaryDto, DocumentDto, EvidenceRef, MockLogDto, OutboundActionDto, ReadinessDto, TimelineItemDto, Toolbox, ToolLogEntry, WizardPayload } from '@/lib/types';

type AnyCase = Record<string, any>;

const nowFor = async (sessionId: string): Promise<Date> => (await prisma.demoSession.findUniqueOrThrow({ where: { id: sessionId } })).simulatedNow;
const json = <T>(value: string | null | undefined, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
const paise = (rupees: number) => Math.round(rupees * 100);
const ref = () => `CS-${new Date().getUTCFullYear()}-${crypto.randomInt(10000, 99999)}`;
const titleFor = (type: string) => DOC_TYPE_LABELS[type as DocType] ?? type.replaceAll('_', ' ');

async function ownedCase(sessionId: string, caseId: string): Promise<AnyCase> {
  const item = await prisma.claimCase.findFirst({
    where: { id: caseId, sessionId },
    include: { documents: { include: { fields: true } }, policyClauses: true, events: { orderBy: { simulatedAt: 'asc' } }, tasks: { orderBy: { createdAt: 'desc' } }, agentRuns: { include: { outputs: true }, orderBy: { startedAt: 'desc' } }, evidence: { orderBy: { createdAt: 'desc' } }, outboundActions: { include: { approvals: { orderBy: { createdAt: 'desc' } } }, orderBy: { createdAt: 'desc' } }, mockLogs: { orderBy: { createdAt: 'desc' } } },
  });
  if (!item) throw new Error('Claim not found or unavailable in this session.');
  return item;
}

function toDocument(doc: any, route: string): DocumentDto {
  return { id: doc.id, docType: doc.docType, originalName: doc.originalName, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes, extractionStatus: doc.extractionStatus, extractionMethod: doc.extractionMethod, pageCount: doc.pageCount, isFixture: doc.isFixture, createdAt: doc.createdAt.toISOString(), provenanceNote: doc.provenanceNote, fields: doc.fields.map((field: any) => ({ fieldKey: field.fieldKey, value: field.value, source: field.source, edited: field.edited })), isRequiredForRoute: (DOCUMENT_REQUIREMENTS[route as ClaimRoute] ?? []).includes(doc.docType) };
}

export function readiness(caseItem: AnyCase): ReadinessDto {
  const required = DOCUMENT_REQUIREMENTS[caseItem.route as ClaimRoute] ?? [];
  const present: string[] = [...new Set<string>(caseItem.documents.map((doc: any) => String(doc.docType)))];
  const missing = required.filter((type) => !present.includes(type));
  const failedChecks: ReadinessDto['failedChecks'] = missing.map((type) => ({ id: `missing-${type}`, type: 'MISSING_DOCUMENT', message: `${titleFor(type)} is required for this ${caseItem.route.toLowerCase()} packet.` }));
  const bill = caseItem.documents.find((doc: any) => doc.docType === 'ITEMISED_BILL');
  const receipt = caseItem.documents.find((doc: any) => doc.docType === 'PAYMENT_RECEIPT');
  const billAmount = bill?.fields.find((f: any) => f.fieldKey === 'totalAmountPaise')?.value;
  const receiptAmount = receipt?.fields.find((f: any) => f.fieldKey === 'totalAmountPaise')?.value;
  if (billAmount && receiptAmount && billAmount !== receiptAmount) failedChecks.push({ id: 'bill-receipt-mismatch', type: 'AMOUNT_MISMATCH', message: 'The itemised bill and payment receipt show different totals.' });
  const valid = required.length - missing.length;
  return { requiredDocTypes: required, present, missing, validRequiredCount: valid, totalRequiredCount: required.length, completenessPct: required.length ? Math.round((valid / required.length) * 100) : 0, failedChecks, note: 'This is document completeness, not an approval probability.' };
}

export async function summary(sessionId: string, caseId: string): Promise<CaseSummaryDto> {
  const item = await ownedCase(sessionId, caseId);
  const ready = readiness(item);
  return { id: item.id, reference: item.reference, customerName: item.customerName, insurerName: item.insurerName, hospitalName: item.hospitalName, route: item.route, state: item.state, scenario: item.scenario, currentBlocker: item.currentBlocker, nextBestAction: item.nextBestAction, responsibleParty: item.responsibleParty, claimedAmountPaise: item.claimedAmountPaise, settledAmountPaise: item.settledAmountPaise, mockExternalRef: item.mockExternalRef, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(), documentsRemaining: ready.missing.length, lastActivityAt: item.events.at(-1)?.simulatedAt?.toISOString() ?? null };
}

export async function listClaims(sessionId: string): Promise<CaseSummaryDto[]> {
  const cases = await prisma.claimCase.findMany({ where: { sessionId }, select: { id: true }, orderBy: { updatedAt: 'desc' } });
  return Promise.all(cases.map((item) => summary(sessionId, item.id)));
}

function context(caseItem: AnyCase, simulatedNow: Date): AgentContext {
  return {
    caseId: caseItem.id, reference: caseItem.reference, route: caseItem.route, scenario: caseItem.scenario, state: caseItem.state, customerName: caseItem.customerName, patientRelation: caseItem.patientRelation, policyHolderName: caseItem.policyHolderName, policyNumber: caseItem.policyNumber, insurerName: caseItem.insurerName, productName: caseItem.productName, hospitalName: caseItem.hospitalName, hospitalEmail: caseItem.hospitalEmail, treatmentDescription: caseItem.treatmentDescription, diagnosis: caseItem.diagnosis, admissionDate: caseItem.admissionDate?.toISOString() ?? null, dischargeDate: caseItem.dischargeDate?.toISOString() ?? null, icdCode: caseItem.icdCode, claimedAmountPaise: caseItem.claimedAmountPaise, settledAmountPaise: caseItem.settledAmountPaise, settlementSummary: caseItem.settlementSummary, mockExternalRef: caseItem.mockExternalRef, simulatedNow: simulatedNow.toISOString(),
    documents: caseItem.documents.map((doc: any) => ({ id: doc.id, docType: doc.docType, originalName: doc.originalName, mimeType: doc.mimeType, extractionStatus: doc.extractionStatus, pageCount: doc.pageCount, fields: Object.fromEntries(doc.fields.map((field: any) => [field.fieldKey, field.value])), extractedText: doc.extractedText })),
    clauses: caseItem.policyClauses.map((clause: any) => ({ id: clause.id, documentId: clause.documentId, clauseId: clause.clauseId, title: clause.title, text: clause.text, page: clause.page })),
    events: caseItem.events.map((event: any) => ({ id: event.id, type: event.type, summary: event.summary, actor: event.actor, simulatedAt: event.simulatedAt.toISOString() })),
    tasks: caseItem.tasks.map((task: any) => ({ id: task.id, title: task.title, description: task.description, status: task.status, responsibleParty: task.responsibleParty, dueAt: task.dueAt?.toISOString() ?? null })),
  };
}

function makeTools(ctx: AgentContext): { tools: Toolbox; refs: Array<Omit<EvidenceRef, 'id'> & { tempId: string }> } {
  const logs: ToolLogEntry[] = [];
  const refs: Array<Omit<EvidenceRef, 'id'> & { tempId: string }> = [];
  const tools: Toolbox = {
    log: (tool, status, detail) => logs.push({ tool, status, detail, at: new Date().toISOString() }),
    getDocumentText: (id) => ctx.documents.find((doc) => doc.id === id)?.extractedText ?? null,
    searchClauses: (query) => { const q = query.toLowerCase(); return ctx.clauses.filter((clause) => `${clause.title} ${clause.text} ${clause.clauseId}`.toLowerCase().includes(q)); },
    searchDocumentText: (query) => { const q = query.toLowerCase(); return ctx.documents.filter((doc) => doc.extractedText?.toLowerCase().includes(q)).map((doc) => ({ documentId: doc.id, snippet: doc.extractedText?.slice(Math.max(0, doc.extractedText.toLowerCase().indexOf(q) - 60), doc.extractedText.toLowerCase().indexOf(q) + 220) ?? '' })); },
    hasDocumentType: (type) => ctx.documents.some((doc) => doc.docType === type),
    documentsOfType: (type) => ctx.documents.filter((doc) => doc.docType === type),
    readField: (id, key) => ctx.documents.find((doc) => doc.id === id)?.fields[key] ?? null,
    recordEvidence: (input) => { const tempId = `evidence-${refs.length + 1}`; refs.push({ ...input, tempId }); return tempId; },
    toolLog: () => logs,
  };
  return { tools, refs };
}

async function event(caseId: string, sessionId: string, type: string, summaryText: string, actor = 'SYSTEM', metadata?: unknown): Promise<void> {
  await prisma.claimEvent.create({ data: { caseId, type, summary: summaryText, actor, simulatedAt: await nowFor(sessionId), metadataJson: metadata ? JSON.stringify(metadata) : null } });
}

function messageFor(action: any, item: AnyCase): string {
  if (action.type === 'DOCUMENT_REQUEST') return `Subject: Request for discharge summary\n\nDear ${item.hospitalName},\n\nPlease share the discharge summary for ${item.customerName} for the claim packet. This factual request is for a simulated ClaimSaathi demo.\n\nRegards,\n${item.customerName}`;
  if (action.type === 'CLAIM_SUBMISSION') return `Subject: Claim packet — ${item.reference}\n\nPlease review the attached fictional claim packet for ${item.customerName}. Claimed amount: ₹${(item.claimedAmountPaise / 100).toLocaleString('en-IN')}. This will be sent only to the simulated insurer after approval.`;
  if (action.type === 'ESCALATION' || action.type === 'REMINDER') return `Subject: Follow-up on final authorisation — ${item.reference}\n\nPlease provide an update on the recorded final-authorisation request. This is a configurable demo threshold, not a statement of entitlement.`;
  if (action.type === 'CLARIFICATION') return `Subject: Request for factual clarification — ${item.reference}\n\nPlease confirm the documents, dates and policy clause used in the simulated decision. This request does not assert that the decision is incorrect.`;
  return `Subject: ClaimSaathi factual representation — ${item.reference}\n\nPlease review the attached factual records for this simulated claim.`;
}

async function ensureProposedAction(item: AnyCase, proposal: any): Promise<void> {
  const existing = item.outboundActions.find((action: any) => action.type === proposal.type && action.title === proposal.title && !['CANCELLED', 'FAILED'].includes(action.status));
  if (existing) return;
  const attachments = item.documents.map((doc: any) => doc.id);
  await prisma.outboundAction.create({ data: { caseId: item.id, type: proposal.type, title: proposal.title, purpose: proposal.description, recipient: proposal.responsibleParty, recipientName: proposal.responsibleParty === 'HOSPITAL' ? item.hospitalName : proposal.responsibleParty === 'INSURER' ? item.insurerName : null, message: messageFor(proposal, item), dataSharedJson: JSON.stringify(['Claim reference', 'Policy number', 'Required document metadata']), attachmentDocIdsJson: JSON.stringify(attachments), status: 'READY_FOR_APPROVAL' } });
  if (!item.tasks.some((task: any) => task.title === proposal.title && task.status === 'OPEN')) await prisma.task.create({ data: { caseId: item.id, title: proposal.title, description: proposal.description, responsibleParty: proposal.responsibleParty, source: 'AGENT' } });
}

export async function analyze(sessionId: string, caseId: string, trigger = 'ANALYSIS_REQUESTED'): Promise<{ runIds: string[]; state: string; blocker: string | null; nextBestAction: string | null; responsibleParty: string | null }> {
  await ownedCase(sessionId, caseId);
  if (trigger === 'ANALYSIS_REQUESTED') await event(caseId, sessionId, trigger, 'User requested case analysis.', 'USER');
  let item = await ownedCase(sessionId, caseId);
  const names = trigger === 'SIMULATED_TIME_ADVANCED' ? ['TIMELINE_AND_DELAY_WATCH'] : trigger === 'DOCUMENT_ADDED' ? ['DOCUMENT_READINESS', 'POLICY_EVIDENCE', 'CLAIM_COORDINATION'] : item.state === 'PARTIALLY_SETTLED' || item.state === 'REJECTED' ? ['POLICY_EVIDENCE', 'SETTLEMENT_AND_APPEAL'] : ['INTAKE_AND_ROUTING', 'POLICY_EVIDENCE', 'DOCUMENT_READINESS', 'CLAIM_COORDINATION', 'TIMELINE_AND_DELAY_WATCH'];
  const runIds: string[] = [];
  const allOutputs: AgentOutput[] = [];
  for (const name of names) {
    const run = await prisma.agentRun.create({ data: { caseId, agentName: name, status: 'QUEUED', triggerEvent: trigger } });
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: 'RUNNING', startedAt: new Date() } });
    runIds.push(run.id);
    try {
      item = await ownedCase(sessionId, caseId);
      const { tools, refs } = makeTools(context(item, await nowFor(sessionId)));
      const output = await agents[name].run(context(item, await nowFor(sessionId)), tools);
      const created = new Map<string, string>();
      for (const pending of refs) {
        const persisted = await prisma.evidenceReference.create({ data: { caseId, agentRunId: run.id, kind: pending.kind, title: pending.title, documentId: pending.documentId ?? null, clauseId: pending.clauseId ?? null, page: pending.page ?? null, excerpt: pending.excerpt, extractionStatus: pending.extractionStatus } });
        created.set(pending.tempId, persisted.id);
      }
      output.evidenceReferences = output.evidenceReferences.map((reference) => ({ ...reference, id: created.get(reference.id) ?? reference.id }));
      output.proposedActions = output.proposedActions.map((proposal) => ({ ...proposal, evidenceRefIds: proposal.evidenceRefIds?.map((id) => created.get(id) ?? id) }));
      await prisma.agentOutput.create({ data: { runId: run.id, payloadJson: JSON.stringify(output) } });
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: output.status === 'blocked' ? 'BLOCKED' : 'COMPLETED', summary: output.summary, nextAgent: output.nextAgent, toolsJson: JSON.stringify(tools.toolLog()), endedAt: new Date() } });
      for (const proposal of output.proposedActions) await ensureProposedAction(item, proposal);
      allOutputs.push(output);
    } catch (error) {
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: 'FAILED', error: error instanceof Error ? error.message : 'Unexpected agent failure', endedAt: new Date() } });
    }
  }
  item = await ownedCase(sessionId, caseId);
  const r = readiness(item);
  if (!r.missing.includes('DISCHARGE_SUMMARY')) {
    await prisma.outboundAction.updateMany({ where: { caseId, type: 'DOCUMENT_REQUEST', title: 'Request discharge summary from hospital', status: { in: ['DRAFT', 'READY_FOR_APPROVAL'] } }, data: { status: 'CANCELLED' } });
    await prisma.task.updateMany({ where: { caseId, title: 'Request discharge summary from hospital', status: 'OPEN' }, data: { status: 'CANCELLED', completedAt: new Date() } });
    item = await ownedCase(sessionId, caseId);
  }
  const severe = allOutputs.flatMap((out) => out.findings).find((finding) => finding.severity === 'critical') ?? allOutputs.flatMap((out) => out.findings).find((finding) => finding.severity === 'warning');
  const next = item.outboundActions.find((action: any) => ['READY_FOR_APPROVAL', 'DRAFT'].includes(action.status));
  let state = item.state;
  if (!['SUBMITTED', 'QUERY_RECEIVED', 'UNDER_REVIEW', 'PARTIALLY_SETTLED', 'SETTLED', 'REJECTED', 'CLOSED'].includes(state)) state = r.missing.length ? 'DOCUMENTS_INCOMPLETE' : next ? 'AWAITING_USER_APPROVAL' : 'READY_FOR_REVIEW';
  if (item.state === 'UNDER_REVIEW' && next?.type === 'ESCALATION') state = 'UNDER_REVIEW';
  const blocker = severe?.message ?? (r.missing.length ? `${titleFor(r.missing[0])} is missing.` : next ? 'Required document types are present; the packet needs user review.' : null);
  await prisma.claimCase.update({ where: { id: caseId }, data: { state, currentBlocker: blocker ?? null, nextBestAction: next?.title ?? (r.missing.length ? 'Upload the missing required document.' : item.nextBestAction), responsibleParty: next?.recipient ?? (r.missing.length ? 'CUSTOMER' : item.responsibleParty) } });
  const result = await summary(sessionId, caseId);
  return { runIds, state: result.state, blocker: result.currentBlocker, nextBestAction: result.nextBestAction, responsibleParty: result.responsibleParty };
}

function fieldsFromText(text: string, docType: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const value = (label: string) => text.match(new RegExp(`${label}\\s*[:—-]\\s*([^\\n]+)`, 'i'))?.[1]?.trim();
  const patient = value('Patient') ?? value('Received from') ?? value('Policy holder');
  if (patient) fields.patientName = patient;
  const hospital = value('Hospital'); if (hospital) fields.hospitalName = hospital;
  const policy = value('Policy number'); if (policy) fields.policyNumber = policy;
  const admission = value('Admission(?: date)?'); if (admission) fields.admissionDate = admission;
  const discharge = value('Discharge(?: date)?'); if (discharge) fields.dischargeDate = discharge;
  const amount = text.match(/(?:TOTAL|Amount paid|Submitted bill)\s*[:—-]?\s*₹?\s*([\d,]+)/i)?.[1];
  if (amount && ['ITEMISED_BILL', 'PAYMENT_RECEIPT', 'SETTLEMENT_STATEMENT'].includes(docType)) fields.totalAmountPaise = String(paise(Number(amount.replaceAll(',', ''))));
  return fields;
}

async function extractPdf(buffer: Buffer): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, isEvalSupported: false }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    parts.push((content.items as Array<{ str?: string }>).map((entry) => entry.str ?? '').join(' '));
  }
  return { text: parts.join('\n\n'), pages: pdf.numPages };
}

export async function addDocument(sessionId: string, caseId: string, incoming: { name: string; mime: string; buffer: Buffer; docType: string; fixture?: boolean; fixtureText?: string }): Promise<DocumentDto> {
  const item = await ownedCase(sessionId, caseId);
  const clean = sanitizeFilename(incoming.name);
  if (!clean) throw new Error('Unsupported file type. Allowed: PDF, TXT, PNG, JPG.');
  if (incoming.buffer.length === 0 || incoming.buffer.length > 10 * 1024 * 1024) throw new Error('File must be between 1 byte and 10 MB.');
  const digest = crypto.createHash('sha256').update(incoming.buffer).digest('hex');
  const duplicate = item.documents.find((doc: any) => doc.sha256 === digest);
  if (duplicate) return toDocument(duplicate, item.route);
  const id = crypto.randomUUID();
  const ext = path.extname(clean).toLowerCase();
  await ensureDataDirs();
  const stored = uploadPathFor(sessionId, id, ext);
  await fs.mkdir(path.dirname(stored), { recursive: true });
  await fs.writeFile(stored, incoming.buffer);
  let text = incoming.fixtureText ?? '';
  let method: string | null = incoming.fixture ? 'SEED' : null;
  let status = incoming.fixture ? 'EXTRACTED' : 'NOT_ATTEMPTED';
  let pageCount: number | null = null;
  if (!incoming.fixture) {
    if (incoming.mime === 'text/plain') { text = incoming.buffer.toString('utf8'); method = 'TEXT'; status = 'EXTRACTED'; pageCount = 1; }
    else if (incoming.mime === 'application/pdf') {
      try { const extracted = await extractPdf(incoming.buffer); text = extracted.text; pageCount = extracted.pages; method = 'PDFJS'; status = text.trim() ? 'EXTRACTED' : 'MANUAL_ONLY'; }
      catch { status = 'MANUAL_ONLY'; method = 'NONE'; }
    } else { status = 'MANUAL_ONLY'; method = 'NONE'; }
  }
  const doc = await prisma.uploadedDocument.create({ data: { id, caseId, sessionId, originalName: clean, storedName: path.basename(stored), mimeType: incoming.mime, sizeBytes: incoming.buffer.length, docType: incoming.docType, sha256: digest, isFixture: Boolean(incoming.fixture), pageCount, extractionStatus: status, extractionMethod: method, extractedText: text || null, provenanceNote: incoming.fixture ? 'Synthetic fixture generated by ClaimSaathi.' : status === 'MANUAL_ONLY' ? 'No OCR is available for this file. Add a manual transcription if needed.' : 'Text extracted locally; review and correct fields before use.', fields: { create: Object.entries(fieldsFromText(text, incoming.docType)).map(([fieldKey, value]) => ({ fieldKey, value, source: incoming.fixture ? 'SEED' : 'EXTRACTED' })) } }, include: { fields: true } });
  await event(caseId, sessionId, 'DOCUMENT_ADDED', `${titleFor(incoming.docType)} added: ${clean}.`, 'USER');
  await prisma.approval.updateMany({ where: { caseId, scope: 'CLAIM_SUBMISSION', status: 'APPROVED' }, data: { status: 'SUPERSEDED' } });
  await prisma.outboundAction.updateMany({ where: { caseId, type: 'CLAIM_SUBMISSION', status: 'APPROVED' }, data: { status: 'DRAFT', draftVersion: { increment: 1 } } });
  return toDocument(doc, item.route);
}

async function fixtureDocument(sessionId: string, caseId: string, kind: FixtureKind, docType: string, information: FixtureCase, name: string): Promise<void> {
  const text = fixtureText(kind, information);
  await addDocument(sessionId, caseId, { name, mime: 'application/pdf', buffer: Buffer.from(await createPdf(text)), docType, fixture: true, fixtureText: text });
}

export async function seedScenario(sessionId: string, scenario: string): Promise<CaseSummaryDto> {
  const exists = await prisma.claimCase.findFirst({
    where: { sessionId, scenario, state: { notIn: ['SUBMITTED', 'SETTLED'] } },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });
  if (exists) return summary(sessionId, exists.id);
  const cases: Record<string, { customerName: string; policyNumber: string; hospitalName: string; treatmentDescription: string; route: ClaimRoute; amount: number; admission: string; discharge?: string }> = {
    SCENARIO_A: { customerName: 'Asha Sharma', policyNumber: 'AS-2025-887766', hospitalName: 'Greenleaf Multispeciality Hospital, Pune', treatmentDescription: 'Dengue fever inpatient treatment', route: 'REIMBURSEMENT', amount: 80000, admission: '2026-10-20', discharge: '2026-10-23' },
    SCENARIO_B: { customerName: 'Rohan Mehta', policyNumber: 'RM-2025-112233', hospitalName: 'Sunrise Multispeciality Hospital, Bengaluru', treatmentDescription: 'Appendicitis inpatient treatment', route: 'CASHLESS', amount: 60000, admission: '2026-10-30' },
    SCENARIO_C_PARTIAL: { customerName: 'Kavita Nair', policyNumber: 'KN-2025-998877', hospitalName: 'St. Mira Multispeciality Hospital, Kochi', treatmentDescription: 'Gall bladder surgery', route: 'REIMBURSEMENT', amount: 80000, admission: '2026-10-05', discharge: '2026-10-08' },
    SCENARIO_C_REJECTION: { customerName: 'Vikram Reddy', policyNumber: 'VR-2026-556677', hospitalName: 'CityCare Hospital, Hyderabad', treatmentDescription: 'Acute illness treatment', route: 'REIMBURSEMENT', amount: 52000, admission: '2026-09-18', discharge: '2026-09-20' },
    SCENARIO_D_QUERY: { customerName: 'Meera Iyer', policyNumber: 'MI-2025-445566', hospitalName: 'Harborview Hospital, Chennai', treatmentDescription: 'Pneumonia inpatient treatment', route: 'REIMBURSEMENT', amount: 72000, admission: '2026-10-12', discharge: '2026-10-15' },
    SCENARIO_E_END_TO_END: { customerName: 'Priya Menon', policyNumber: 'PM-2025-334455', hospitalName: 'Lotus Demo Hospital, Pune', treatmentDescription: 'Dengue fever inpatient treatment', route: 'REIMBURSEMENT', amount: 80000, admission: '2026-10-20', discharge: '2026-10-23' },
  };
  const definition = cases[scenario]; if (!definition) throw new Error('Unknown demo scenario.');
  const isQuery = scenario === 'SCENARIO_D_QUERY';
  const startsAsDraft = scenario === 'SCENARIO_A' || scenario === 'SCENARIO_E_END_TO_END';
  const claim = await prisma.claimCase.create({ data: { reference: ref(), sessionId, scenario, customerName: definition.customerName, patientRelation: 'Self', policyHolderName: definition.customerName, policyNumber: definition.policyNumber, insurerName: FICTIONAL_INSURER, productName: FICTIONAL_PRODUCT, route: definition.route, hospitalName: definition.hospitalName, hospitalEmail: 'billing@fictional-hospital.example', treatmentDescription: definition.treatmentDescription, admissionDate: new Date(`${definition.admission}T00:00:00.000Z`), dischargeDate: definition.discharge ? new Date(`${definition.discharge}T00:00:00.000Z`) : null, claimedAmountPaise: paise(definition.amount), state: startsAsDraft ? 'DRAFT' : isQuery ? 'QUERY_RECEIVED' : 'UNDER_REVIEW', currentBlocker: startsAsDraft ? null : scenario === 'SCENARIO_B' ? 'Waiting on final authorisation response.' : isQuery ? 'The insurer requested confirmation of hospital registration details.' : 'Awaiting simulated insurer outcome.', nextBestAction: scenario === 'SCENARIO_B' ? 'Advance simulated time to test delay watch.' : isQuery ? 'Review the insurer query and provide factual confirmation.' : startsAsDraft ? 'Ask the assistant to check this claim.' : 'Inspect or run the demo workflow.', responsibleParty: scenario === 'SCENARIO_B' ? 'INSURER' : 'CUSTOMER' } });
  const data: FixtureCase = { customerName: definition.customerName, policyNumber: definition.policyNumber, hospitalName: definition.hospitalName, treatment: definition.treatmentDescription, admissionDate: definition.admission, dischargeDate: definition.discharge, amount: definition.amount };
  await fixtureDocument(sessionId, claim.id, 'policy', 'POLICY', data, `${scenario.toLowerCase()}-policy.pdf`);
  const policy = await prisma.uploadedDocument.findFirstOrThrow({ where: { caseId: claim.id, docType: 'POLICY' } });
  await prisma.policyClause.createMany({ data: clauses.map((clause) => ({ caseId: claim.id, documentId: policy.id, clauseId: clause.id, title: clause.title, text: clause.text, page: clause.page })) });
  if (definition.route === 'REIMBURSEMENT') {
    await fixtureDocument(sessionId, claim.id, 'bill', 'ITEMISED_BILL', data, `${scenario.toLowerCase()}-itemised-bill.pdf`);
    await fixtureDocument(sessionId, claim.id, 'receipt', 'PAYMENT_RECEIPT', data, `${scenario.toLowerCase()}-payment-receipt.pdf`);
    if (scenario !== 'SCENARIO_A' && scenario !== 'SCENARIO_E_END_TO_END') await fixtureDocument(sessionId, claim.id, 'discharge', 'DISCHARGE_SUMMARY', data, `${scenario.toLowerCase()}-discharge-summary.pdf`);
    if (isQuery) await fixtureDocument(sessionId, claim.id, 'query', 'QUERY_LETTER', data, `${scenario.toLowerCase()}-insurer-query.pdf`);
  } else {
    await fixtureDocument(sessionId, claim.id, 'preauth', 'PRE_AUTH_REQUEST', data, `${scenario.toLowerCase()}-pre-authorisation.pdf`);
    await fixtureDocument(sessionId, claim.id, 'finalauth', 'FINAL_AUTH_REQUEST', data, `${scenario.toLowerCase()}-final-authorisation.pdf`);
  }
  await event(claim.id, sessionId, 'CASE_CREATED', `Loaded ${scenario.replaceAll('_', ' ')} fictional demo case.`, 'SYSTEM');
  if (scenario === 'SCENARIO_B') {
    const at = new Date((await nowFor(sessionId)).getTime() - 2 * 60 * 60_000);
    await prisma.claimEvent.create({ data: { caseId: claim.id, type: 'FINAL_AUTH_REQUEST_SENT', summary: 'Hospital final-authorisation request recorded.', actor: 'HOSPITAL', simulatedAt: at } });
  }
  if (scenario === 'SCENARIO_C_PARTIAL') await event(claim.id, sessionId, 'SUBMISSION_SENT', 'Fictional claim packet was previously submitted to simulated insurer.', 'SYSTEM');
  if (isQuery) await event(claim.id, sessionId, 'MOCK_STATUS_RECEIVED', 'Simulated insurer requested confirmation of hospital registration details.', 'MOCK_INSURER');
  return summary(sessionId, claim.id);
}

export async function addWalkthroughSampleDocument(sessionId: string, caseId: string): Promise<DocumentDto> {
  const item = await ownedCase(sessionId, caseId);
  if (item.scenario !== 'SCENARIO_E_END_TO_END') throw new Error('The sample document is available only in the end-to-end demo.');
  let document = item.documents.find((entry: any) => entry.docType === 'DISCHARGE_SUMMARY');
  if (!document) {
    const data: FixtureCase = {
      customerName: item.customerName,
      policyNumber: item.policyNumber,
      hospitalName: item.hospitalName,
      treatment: item.treatmentDescription,
      admissionDate: item.admissionDate?.toISOString().slice(0, 10),
      dischargeDate: item.dischargeDate?.toISOString().slice(0, 10),
      amount: item.claimedAmountPaise / 100,
    };
    await fixtureDocument(sessionId, caseId, 'discharge', 'DISCHARGE_SUMMARY', data, 'demo-discharge-summary.pdf');
    await analyze(sessionId, caseId, 'DOCUMENT_ADDED');
    document = (await ownedCase(sessionId, caseId)).documents.find((entry: any) => entry.docType === 'DISCHARGE_SUMMARY');
  }
  if (!document) throw new Error('The sample discharge summary could not be added.');
  return toDocument(document, item.route);
}

export async function downloadWalkthroughSampleDocument(sessionId: string, caseId: string): Promise<Uint8Array> {
  const item = await ownedCase(sessionId, caseId);
  if (item.scenario !== 'SCENARIO_E_END_TO_END') throw new Error('The sample document is available only in the single-journey demo.');
  if (item.documents.some((entry: any) => entry.docType === 'DISCHARGE_SUMMARY')) throw new Error('The discharge summary is already on this claim.');
  const data: FixtureCase = {
    customerName: item.customerName,
    policyNumber: item.policyNumber,
    hospitalName: item.hospitalName,
    treatment: item.treatmentDescription,
    admissionDate: item.admissionDate?.toISOString().slice(0, 10),
    dischargeDate: item.dischargeDate?.toISOString().slice(0, 10),
    amount: item.claimedAmountPaise / 100,
  };
  return createPdf(fixtureText('discharge', data));
}

export async function advanceDemoRoleStep(sessionId: string, caseId: string, step: string): Promise<void> {
  let item = await ownedCase(sessionId, caseId);
  if (item.scenario !== 'SCENARIO_E_END_TO_END') throw new Error('Role steps are available only in the single-journey demo.');

  const eventTypes = new Set(item.events.map((entry: any) => entry.type));
  const alreadyRecorded = (type: string) => eventTypes.has(type);
  const ready = readiness(item);

  if (step === 'SHARE_PACKET') {
    if (ready.missing.length || ready.failedChecks.length) throw new Error('Upload the missing discharge summary and pass document checks before sharing this demo packet.');
    if (!alreadyRecorded('DEMO_PACKET_SHARED')) await event(caseId, sessionId, 'DEMO_PACKET_SHARED', 'The customer shared the fictional claim packet with the hospital verifier and human claims reviewer screens.', 'USER');
    return;
  }

  if (step === 'HOSPITAL_VERIFY') {
    if (!alreadyRecorded('DEMO_PACKET_SHARED')) throw new Error('The customer must share the demo packet before the hospital can review it.');
    if (ready.missing.length || ready.failedChecks.length) throw new Error('The hospital review is blocked until all required demo documents are present.');
    if (!alreadyRecorded('DEMO_HOSPITAL_VERIFIED')) await event(caseId, sessionId, 'DEMO_HOSPITAL_VERIFIED', 'The hospital verifier confirmed receipt of the fictional discharge summary. No real hospital was contacted.', 'HOSPITAL');
    return;
  }

  if (step === 'CONSULTANT_SUBMIT') {
    if (!alreadyRecorded('DEMO_HOSPITAL_VERIFIED')) throw new Error('The hospital verifier must verify the packet before human review.');
    if (ready.missing.length || ready.failedChecks.length) throw new Error('The demo packet must pass document checks before simulated submission.');
    if (item.state === 'SUBMITTED' || item.state === 'SETTLED') return;

    await analyze(sessionId, caseId, 'ANALYSIS_REQUESTED');
    item = await ownedCase(sessionId, caseId);
    let action = item.outboundActions.find((entry: any) => entry.type === 'CLAIM_SUBMISSION' && entry.status === 'READY_FOR_APPROVAL');
    if (!action) {
      const created = await createAction(sessionId, caseId, {
        type: 'CLAIM_SUBMISSION',
        title: 'Submit demo claim packet for simulated insurer review',
        purpose: 'Forward the complete fictional packet to the simulated insurer adapter.',
        recipient: 'INSURER',
        message: `Fictional demo claim packet for ${item.customerName}. No real insurer is connected.`,
        attachmentDocIds: item.documents.map((doc: any) => doc.id),
      });
      action = { id: created.id };
    }
    await approveAction(sessionId, caseId, action.id);
    await event(caseId, sessionId, 'DEMO_CONSULTANT_REVIEWED', 'A human claims reviewer approved the complete fictional packet and submitted it to the simulated insurer. This is not a real claim decision.', 'HUMAN_REVIEWER');
    return;
  }

  if (step === 'PAYOUT_CONFIRM') {
    if (item.state !== 'SUBMITTED' || !alreadyRecorded('DEMO_CONSULTANT_REVIEWED')) throw new Error('Human review and simulated insurer receipt are required before a demo result can be shown.');
    await trigger(sessionId, caseId, 'DEMO_CREDIT');
    return;
  }

  throw new Error('Unsupported demo role step.');
}

export async function createClaim(sessionId: string, payload: WizardPayload): Promise<CaseSummaryDto> {
  const item = await prisma.claimCase.create({ data: { reference: ref(), sessionId, customerName: payload.customerName, patientRelation: payload.patientRelation || null, policyHolderName: payload.policyHolderName, policyNumber: payload.policyNumber, insurerName: payload.insurerName, productName: payload.productName, route: payload.route, hospitalName: payload.hospitalName, hospitalEmail: payload.hospitalEmail || null, treatmentDescription: payload.treatmentDescription, diagnosis: payload.diagnosis || null, admissionDate: payload.admissionDate ? new Date(payload.admissionDate) : null, dischargeDate: payload.dischargeDate ? new Date(payload.dischargeDate) : null, icdCode: payload.icdCode || null, claimedAmountPaise: paise(payload.claimedAmountRupees), state: 'DRAFT' } });
  await event(item.id, sessionId, 'CASE_CREATED', 'Claim created from supplied intake details.', 'USER');
  await analyze(sessionId, item.id, 'CASE_CREATED');
  return summary(sessionId, item.id);
}

export async function details(sessionId: string, caseId: string): Promise<any> {
  const item = await ownedCase(sessionId, caseId);
  const caseSummary = await summary(sessionId, caseId);
  return { case: caseSummary, readiness: readiness(item), documents: item.documents.map((doc: any) => toDocument(doc, item.route)), actions: item.outboundActions.map(actionDto), events: item.events.map((e: any) => ({ id: e.id, type: e.type, summary: e.summary, actor: e.actor, simulatedAt: e.simulatedAt.toISOString() })), settlement: { claimedAmountPaise: item.claimedAmountPaise, settledAmountPaise: item.settledAmountPaise, summary: item.settlementSummary, state: item.state }, simulatedNow: (await nowFor(sessionId)).toISOString(), clauses: item.policyClauses.map((clause: any) => ({ id: clause.id, clauseId: clause.clauseId, title: clause.title, text: clause.text, page: clause.page, documentId: clause.documentId })), tasks: item.tasks.map((task: any) => ({ ...task, createdAt: task.createdAt.toISOString(), dueAt: task.dueAt?.toISOString() ?? null })), evidence: item.evidence.map((e: any) => ({ ...e, createdAt: e.createdAt.toISOString() })) };
}

function actionDto(action: any): OutboundActionDto {
  const approval = action.approvals?.[0];
  return { id: action.id, type: action.type, title: action.title, purpose: action.purpose, recipient: action.recipient, recipientName: action.recipientName, message: action.message, dataShared: json(action.dataSharedJson, []), attachmentDocIds: json(action.attachmentDocIdsJson, []), draftVersion: action.draftVersion, status: action.status, idempotencyKey: action.idempotencyKey, mockRef: action.mockRef, sentAt: action.sentAt?.toISOString() ?? null, createdAt: action.createdAt.toISOString(), updatedAt: action.updatedAt.toISOString(), approval: approval ? { status: approval.status, draftVersion: approval.draftVersion, decidedAt: approval.decidedAt?.toISOString() ?? null } : null };
}

export async function activity(sessionId: string, caseId: string): Promise<any[]> {
  const item = await ownedCase(sessionId, caseId);
  return item.agentRuns.map((run: any) => ({ id: run.id, agentName: run.agentName, status: run.status, triggerEvent: run.triggerEvent, startedAt: run.startedAt?.toISOString() ?? null, endedAt: run.endedAt?.toISOString() ?? null, summary: run.summary, error: run.error, nextAgent: run.nextAgent, tools: json(run.toolsJson, []), evidenceRefs: item.evidence.filter((e: any) => e.agentRunId === run.id).map((e: any) => ({ id: e.id, title: e.title })) }));
}

export async function timeline(sessionId: string, caseId: string): Promise<TimelineItemDto[]> {
  const item = await ownedCase(sessionId, caseId);
  return item.events.map((e: any) => ({ id: e.id, type: e.type, summary: e.summary, actor: e.actor, simulatedAt: e.simulatedAt.toISOString(), evidenceIds: json(e.evidenceIds, []) }));
}

export async function evidence(sessionId: string, caseId: string): Promise<any[]> { return (await ownedCase(sessionId, caseId)).evidence.map((item: any) => ({ ...item, createdAt: item.createdAt.toISOString() })); }

export async function updateDocumentFields(sessionId: string, caseId: string, docId: string, fields: Record<string, string>): Promise<DocumentDto> {
  const item = await ownedCase(sessionId, caseId);
  const doc = item.documents.find((d: any) => d.id === docId); if (!doc) throw new Error('Document not found.');
  for (const [fieldKey, value] of Object.entries(fields)) {
    if (fieldKey === 'manualText') await prisma.uploadedDocument.update({ where: { id: docId }, data: { extractedText: value, extractionStatus: 'EXTRACTED', extractionMethod: 'MANUAL', provenanceNote: 'Manual transcription entered by the user.' } });
    else await prisma.extractedField.upsert({ where: { documentId_fieldKey: { documentId: docId, fieldKey } }, create: { documentId: docId, fieldKey, value, source: 'MANUAL', edited: true }, update: { value, source: 'MANUAL', edited: true } });
  }
  await event(caseId, sessionId, 'INFORMATION_UPDATED', 'Document fields were corrected manually.', 'USER');
  await analyze(sessionId, caseId, 'DOCUMENT_ADDED');
  const updated = await prisma.uploadedDocument.findUniqueOrThrow({ where: { id: docId }, include: { fields: true } });
  return toDocument(updated, item.route);
}

export async function documentPath(sessionId: string, caseId: string, docId: string): Promise<{ path: string; name: string; mime: string }> {
  const item = await ownedCase(sessionId, caseId); const doc = item.documents.find((d: any) => d.id === docId); if (!doc) throw new Error('Document not found.');
  const ext = path.extname(doc.originalName); return { path: uploadPathFor(sessionId, doc.id, ext), name: doc.originalName, mime: doc.mimeType };
}

export async function createAction(sessionId: string, caseId: string, payload: ActionDraftPayload): Promise<OutboundActionDto> {
  const item = await ownedCase(sessionId, caseId);
  const good = payload.attachmentDocIds.every((id) => item.documents.some((doc: any) => doc.id === id)); if (!good) throw new Error('An attachment is not available for this claim.');
  const action = await prisma.outboundAction.create({ data: { caseId, type: payload.type, title: payload.title, purpose: payload.purpose, recipient: payload.recipient, recipientName: payload.recipient === 'INSURER' ? item.insurerName : payload.recipient === 'HOSPITAL' ? item.hospitalName : null, message: payload.message, attachmentDocIdsJson: JSON.stringify(payload.attachmentDocIds), dataSharedJson: JSON.stringify(['Claim reference', 'Selected attachments']), status: 'READY_FOR_APPROVAL' }, include: { approvals: true } });
  return actionDto(action);
}

export async function editAction(sessionId: string, caseId: string, actionId: string, payload: ActionEditPayload): Promise<OutboundActionDto> {
  const item = await ownedCase(sessionId, caseId); const previous = item.outboundActions.find((action: any) => action.id === actionId); if (!previous) throw new Error('Action not found.'); if (['SENT', 'CANCELLED'].includes(previous.status)) throw new Error('This action cannot be edited after it was sent or cancelled.');
  if (payload.attachmentDocIds && !payload.attachmentDocIds.every((id) => item.documents.some((doc: any) => doc.id === id))) throw new Error('An attachment is not available for this claim.');
  await prisma.approval.updateMany({ where: { actionId, status: { in: ['PENDING', 'APPROVED'] } }, data: { status: 'SUPERSEDED' } });
  const action = await prisma.outboundAction.update({ where: { id: actionId }, data: { type: payload.type, title: payload.title, purpose: payload.purpose, recipient: payload.recipient, message: payload.message, attachmentDocIdsJson: payload.attachmentDocIds ? JSON.stringify(payload.attachmentDocIds) : undefined, draftVersion: { increment: 1 }, status: 'READY_FOR_APPROVAL' }, include: { approvals: { orderBy: { createdAt: 'desc' } } } });
  return actionDto(action);
}

async function mockSend(sessionId: string, item: AnyCase, action: any): Promise<{ mockRef: string; externalRef?: string }> {
  const started = Date.now();
  await prisma.mockIntegrationLog.create({ data: { caseId: item.id, direction: 'REQUEST', endpoint: `/simulated-insurer/${action.type.toLowerCase()}`, requestJson: JSON.stringify({ reference: item.reference, actionId: action.id }), statusCode: 202, latencyMs: 0, simulatedAt: await nowFor(sessionId) } });
  const mockRef = action.type === 'CLAIM_SUBMISSION' ? `SGIC-${new Date().getUTCFullYear()}-${crypto.randomInt(10000, 99999)}` : `SIM-${action.type}-${crypto.randomInt(1000, 9999)}`;
  await prisma.mockIntegrationLog.create({ data: { caseId: item.id, direction: 'RESPONSE', endpoint: `/simulated-insurer/${action.type.toLowerCase()}`, responseJson: JSON.stringify({ mockRef, status: action.type === 'CLAIM_SUBMISSION' ? 'UNDER_REVIEW' : 'DELIVERED', simulated: true }), statusCode: 200, latencyMs: Date.now() - started, simulatedAt: await nowFor(sessionId) } });
  return action.type === 'CLAIM_SUBMISSION' ? { mockRef, externalRef: mockRef } : { mockRef };
}

export async function approveAction(sessionId: string, caseId: string, actionId: string): Promise<OutboundActionDto> {
  const item = await ownedCase(sessionId, caseId); const action = item.outboundActions.find((itemAction: any) => itemAction.id === actionId); if (!action) throw new Error('Action not found.');
  if (action.status === 'SENT') return actionDto(action);
  if (action.type === 'CLAIM_SUBMISSION' && item.lastSubmittedActionId && item.lastSubmittedActionId !== actionId) throw new Error('A claim packet has already been submitted for this case.');
  if (action.status !== 'READY_FOR_APPROVAL') throw new Error('This draft must be ready for approval before it can be sent.');
  await prisma.approval.create({ data: { caseId, actionId, scope: action.type, draftVersion: action.draftVersion, status: 'APPROVED', decidedAt: new Date() } });
  const response = await mockSend(sessionId, item, action);
  await prisma.outboundAction.update({ where: { id: actionId }, data: { status: 'SENT', sentAt: new Date(), idempotencyKey: `${action.type.toLowerCase()}:${caseId}:${actionId}`, mockRef: response.mockRef } });
  await event(caseId, sessionId, 'ACTION_APPROVED', `${action.title} was approved and sent through a simulated channel.`, 'USER');
  if (action.type === 'CLAIM_SUBMISSION') {
    await prisma.claimCase.update({ where: { id: caseId }, data: { state: 'SUBMITTED', mockExternalRef: response.externalRef, lastSubmittedActionId: actionId, currentBlocker: 'Submitted to simulated insurer; assessment is pending.', nextBestAction: 'Track the simulated insurer response.', responsibleParty: 'INSURER' } });
    await event(caseId, sessionId, 'MOCK_STATUS_RECEIVED', `Simulated insurer accepted the packet. Reference: ${response.externalRef}.`, 'MOCK_INSURER');
  }
  const updated = await prisma.outboundAction.findUniqueOrThrow({ where: { id: actionId }, include: { approvals: { orderBy: { createdAt: 'desc' } } } });
  return actionDto(updated);
}

export async function cancelAction(sessionId: string, caseId: string, actionId: string): Promise<void> { const item = await ownedCase(sessionId, caseId); if (!item.outboundActions.some((action: any) => action.id === actionId)) throw new Error('Action not found.'); await prisma.outboundAction.update({ where: { id: actionId }, data: { status: 'CANCELLED' } }); await prisma.approval.updateMany({ where: { actionId, status: { in: ['PENDING', 'APPROVED'] } }, data: { status: 'CANCELLED' } }); await event(caseId, sessionId, 'ACTION_CANCELLED', 'Outbound action was cancelled before sending.', 'USER'); }

export async function advanceTime(sessionId: string, minutes: number): Promise<void> {
  const before = await nowFor(sessionId);
  const session = await prisma.demoSession.update({ where: { id: sessionId }, data: { simulatedNow: new Date(before.getTime() + minutes * 60_000) } });
  const claims = await prisma.claimCase.findMany({ where: { sessionId }, select: { id: true } });
  for (const claim of claims) { await prisma.claimEvent.create({ data: { caseId: claim.id, type: 'SIMULATED_TIME_ADVANCED', summary: `Simulated time advanced by ${minutes} minutes.`, actor: 'USER', simulatedAt: session.simulatedNow } }); await analyze(sessionId, claim.id, 'SIMULATED_TIME_ADVANCED'); }
}

export async function trigger(sessionId: string, caseId: string, kind: string): Promise<void> {
  const item = await ownedCase(sessionId, caseId); let state = item.state; let summaryText = '';
  if (kind === 'DEMO_CREDIT') {
    if (item.scenario !== 'SCENARIO_E_END_TO_END') throw new Error('Simulated credit is available only in the end-to-end demo.');
    if (item.state !== 'SUBMITTED' || !item.lastSubmittedActionId) throw new Error('Approve and submit the complete claim packet before simulating a credit.');
    const ready = readiness(item);
    if (ready.missing.length || ready.failedChecks.length) throw new Error('The claim packet must pass document checks before simulating a credit.');
    if (item.settledAmountPaise !== null) throw new Error('A simulated credit has already been recorded for this claim.');
    const creditRef = `DEMO-CREDIT-${crypto.randomInt(100000, 999999)}`;
    summaryText = `Simulated claim approval and credit recorded: ₹${(item.claimedAmountPaise / 100).toLocaleString('en-IN')} shown in the demo account. Reference: ${creditRef}. No real payment was made.`;
    const response = { status: 'SETTLED', settledAmountPaise: item.claimedAmountPaise, paymentReference: creditRef, simulated: true };
    await prisma.mockIntegrationLog.create({ data: { caseId, direction: 'RESPONSE', endpoint: '/simulated-payment/demo-credit', responseJson: JSON.stringify(response), statusCode: 200, latencyMs: 0, simulatedAt: await nowFor(sessionId) } });
    await prisma.claimCase.update({ where: { id: caseId }, data: { state: 'SETTLED', settledAmountPaise: item.claimedAmountPaise, settlementSummary: summaryText, currentBlocker: null, nextBestAction: 'No further action in this completed demo.', responsibleParty: 'CUSTOMER' } });
    await event(caseId, sessionId, 'MOCK_STATUS_RECEIVED', summaryText, 'MOCK_INSURER', response);
    await analyze(sessionId, caseId, 'MOCK_STATUS_RECEIVED');
    return;
  }
  if (kind === 'QUERY') { state = 'QUERY_RECEIVED'; summaryText = item.documents.some((doc: any) => doc.docType === 'DISCHARGE_SUMMARY') ? 'Simulated insurer requested hospital registration confirmation.' : 'Simulated insurer requested the discharge summary.'; }
  if (kind === 'STATUS_UPDATE') { state = 'UNDER_REVIEW'; summaryText = 'Simulated insurer status: claim is under review.'; }
  if (kind === 'PARTIAL_SETTLEMENT') { if (item.scenario !== 'SCENARIO_C_PARTIAL') throw new Error('Partial settlement is available for the partial-settlement demo only.'); state = 'PARTIALLY_SETTLED'; summaryText = 'Simulated settlement: ₹70,000 payable; ₹10,000 consumables deduction.'; }
  if (kind === 'REJECTION') { if (item.scenario !== 'SCENARIO_C_REJECTION') throw new Error('Rejection is available for the rejection demo only.'); state = 'REJECTED'; summaryText = 'Simulated rejection: initial waiting period cited.'; }
  if (!summaryText) throw new Error('Unsupported simulated update.');
  const response = kind === 'PARTIAL_SETTLEMENT' ? { status: state, settledAmountPaise: 7000000, deductionPaise: 1000000 } : { status: state, note: summaryText };
  await prisma.mockIntegrationLog.create({ data: { caseId, direction: 'RESPONSE', endpoint: `/simulated-insurer/status/${kind.toLowerCase()}`, responseJson: JSON.stringify(response), statusCode: 200, latencyMs: 0, simulatedAt: await nowFor(sessionId) } });
  await prisma.claimCase.update({ where: { id: caseId }, data: { state, currentBlocker: summaryText, settlementSummary: kind === 'PARTIAL_SETTLEMENT' ? '₹10,000 deducted for consumables and disposables beyond the fictional §7.4 cap.' : kind === 'REJECTION' ? 'Initial waiting period cited under fictional §4.1.' : item.settlementSummary, settledAmountPaise: kind === 'PARTIAL_SETTLEMENT' ? 7000000 : item.settledAmountPaise, nextBestAction: kind === 'PARTIAL_SETTLEMENT' ? 'Review the evidence-backed deduction explanation.' : kind === 'REJECTION' ? 'Review the waiting-period evidence and request factual clarification if needed.' : 'Prepare a factual response if more records are required.', responsibleParty: 'INSURER' } });
  await event(caseId, sessionId, 'MOCK_STATUS_RECEIVED', summaryText, 'MOCK_INSURER', response);
  await analyze(sessionId, caseId, 'MOCK_STATUS_RECEIVED');
}

export async function logs(sessionId: string, caseId: string): Promise<MockLogDto[]> { return (await ownedCase(sessionId, caseId)).mockLogs.map((log: any) => ({ ...log, simulatedAt: log.simulatedAt.toISOString(), createdAt: undefined })); }

export async function reset(sessionId: string): Promise<void> {
  const cases = await prisma.claimCase.findMany({ where: { sessionId }, include: { documents: true } });
  for (const caseItem of cases) for (const doc of caseItem.documents) { await fs.rm(uploadPathFor(sessionId, doc.id, path.extname(doc.originalName)), { force: true }); }
  await prisma.claimCase.deleteMany({ where: { sessionId } });
}

export function answer(item: AnyCase, question: string, lang: 'en' | 'hi'): { answer: string; evidenceIds: string[] } {
  const q = question.toLowerCase();
  const r = readiness(item);
  let response = 'I can only explain the supplied fictional case evidence. Run analysis after adding or correcting documents.';
  let evidenceIds: string[] = [];
  const asksMissing = /(missing|document|upload|दस्तावेज|कागज़|कौन सा)/.test(q);
  const asksNext = /(who|next|act|अगला|किसे|क्या करना|कदम)/.test(q);
  const asksDeduction = /(deduct|settle|कटौती|काटा|सेटल)/.test(q);
  const asksRejection = /(reject|waiting|अस्वीकार|अस्वीकृत|रिजेक्शन|प्रतीक्षा अवधि)/.test(q);
  const asksDelay = /(delay|overdue|authori[sz]|waiting|देरी|लंबित|प्रतीक्षा|मंजूरी)/.test(q);
  const asksQuery = /(query|asked|confirmation|registration|insurer|पूछा|क्वेरी|पंजीकरण|बीमा कंपनी)/.test(q);
  const asksPolicy = /(policy|clause|पॉलिसी|नीति|धारा|क्लॉज)/.test(q);
  const asksStatus = /(pending|status|progress|clear|resolve|स्थिति|लंबित|सुलझ|ठीक कर|साफ कर)/.test(q);
  if (asksMissing) response = r.missing.length ? `The missing required document is ${titleFor(r.missing[0])}. This blocks document completeness; it is not an approval probability.` : 'All route-required document types are present. Review the packet before simulated submission.';
  else if (asksNext) response = item.nextBestAction ? `${item.responsibleParty ?? 'The claim team'} should act next: ${item.nextBestAction}` : 'Run analysis to identify the next evidence-backed action.';
  else if (asksDeduction && item.state === 'PARTIALLY_SETTLED') { response = 'The simulated ₹10,000 deduction is for consumables above the fictional ₹5,000 cap. The sample bill records ₹15,000 in consumables; this explanation does not promise an outcome for a real claim.'; evidenceIds = item.evidence.filter((e: any) => e.clauseId === '§7.4').map((e: any) => e.id); }
  else if (asksRejection && item.state === 'REJECTED') { response = 'The simulated rejection cites the 30-day initial waiting period. The recorded admission date is within that period. Ask for clarification if a recorded fact is wrong; ClaimSaathi does not manufacture appeal grounds.'; evidenceIds = item.evidence.filter((e: any) => e.clauseId === '§4.1').map((e: any) => e.id); }
  else if (item.scenario === 'SCENARIO_B' && asksDelay) response = 'The recorded final-authorisation request is overdue under this fictional scenario’s configurable demo assumption. That does not establish a legal deadline or entitlement.';
  else if (item.scenario === 'SCENARIO_D_QUERY' && asksQuery) response = 'The simulated insurer asked us to confirm the hospital registration details recorded for this admission. My next step is to review the request and provide factual confirmation; I should not guess at missing details.';
  else if (asksStatus) response = `The current claim status is ${item.state.replaceAll('_', ' ').toLowerCase()}. ${item.currentBlocker ?? 'No blocker is recorded.'} ${r.missing.length ? `Missing document: ${titleFor(r.missing[0])}.` : ''} ${item.nextBestAction ? `Next step: ${item.nextBestAction}.` : ''} I cannot approve or guarantee a claim outcome.`;
  else if (asksPolicy) { const clause = item.policyClauses.find((c: any) => c.clauseId === (item.route === 'CASHLESS' ? '§6.3' : '§6.1')); if (clause) { response = `${clause.clauseId}: ${clause.text}`; evidenceIds = item.evidence.filter((e: any) => e.clauseId === clause.clauseId).map((e: any) => e.id); } }
  if (lang === 'hi') {
    if (asksMissing) response = r.missing.length
      ? `इस दावे के लिए ${({ POLICY: 'पॉलिसी दस्तावेज़', ITEMISED_BILL: 'अस्पताल का मदवार बिल', PAYMENT_RECEIPT: 'भुगतान रसीद', DISCHARGE_SUMMARY: 'डिस्चार्ज सारांश', PRE_AUTH_REQUEST: 'प्री-ऑथराइज़ेशन अनुरोध', FINAL_AUTH_REQUEST: 'अंतिम ऑथराइज़ेशन अनुरोध' } as Record<string, string>)[r.missing[0]] ?? 'आवश्यक दस्तावेज़'} की कमी है। इसे इस डेमो में दस्तावेज़ पूरा करने के लिए चाहिए; इससे मंज़ूरी की संभावना नहीं बताई जाती।`
      : 'दावे के लिए सभी आवश्यक दस्तावेज़ मौजूद हैं। पैकेट को जाँचकर ही सिम्युलेटेड बीमा कंपनी को भेजें।';
    else if (asksDeduction && item.state === 'PARTIALLY_SETTLED') response = 'इस काल्पनिक सेटलमेंट में ₹10,000 की कटौती उपभोग्य वस्तुओं की ₹5,000 की पॉलिसी सीमा से अधिक राशि के लिए है। नमूना बिल में ₹15,000 दर्ज हैं। यह वास्तविक दावे के परिणाम की गारंटी नहीं है।';
    else if (asksRejection && item.state === 'REJECTED') response = 'काल्पनिक अस्वीकृति में शुरुआती 30-दिन की प्रतीक्षा अवधि का उल्लेख है। दर्ज भर्ती की तारीख इसी अवधि में है। यदि कोई दर्ज तथ्य गलत है, तो स्पष्टीकरण माँगा जा सकता है; हम अपील का आधार नहीं गढ़ते।';
    else if (item.scenario === 'SCENARIO_B' && asksDelay) response = 'दर्ज अंतिम ऑथराइज़ेशन अनुरोध इस काल्पनिक डेमो की समय-सीमा के अनुसार लंबित है। यह कानूनी समय-सीमा या अधिकार का प्रमाण नहीं है।';
    else if (item.scenario === 'SCENARIO_D_QUERY' && asksQuery) response = 'काल्पनिक बीमा कंपनी ने अस्पताल के पंजीकरण विवरण की पुष्टि माँगी है। अगला कदम अनुरोध देखकर सही जानकारी देना है; जो जानकारी दर्ज नहीं है, उसका अनुमान नहीं लगाना चाहिए।';
    else if (asksStatus) {
      const missingHindi = r.missing.length
        ? r.missing[0] === 'DISCHARGE_SUMMARY' ? 'डिस्चार्ज सारांश' : r.missing[0] === 'POLICY' ? 'पॉलिसी दस्तावेज़' : r.missing[0] === 'ITEMISED_BILL' ? 'मदवार बिल' : r.missing[0] === 'PAYMENT_RECEIPT' ? 'भुगतान रसीद' : 'आवश्यक दस्तावेज़'
        : null;
      const stateHindi = item.state === 'DOCUMENTS_INCOMPLETE' ? 'दस्तावेज़ अधूरे' : item.state === 'AWAITING_USER_APPROVAL' ? 'आपकी मंज़ूरी की प्रतीक्षा' : item.state === 'SUBMITTED' ? 'जमा किया गया' : item.state === 'UNDER_REVIEW' ? 'समीक्षा में' : item.state === 'QUERY_RECEIVED' ? 'अतिरिक्त जानकारी का अनुरोध' : item.state === 'PARTIALLY_SETTLED' ? 'आंशिक भुगतान' : item.state === 'REJECTED' ? 'अस्वीकृत' : 'जाँच में';
      const blockerHindi = missingHindi
        ? `${missingHindi} अभी दावे के रिकॉर्ड में मौजूद नहीं है।`
        : item.state === 'QUERY_RECEIVED' ? 'बीमा कंपनी ने अस्पताल के पंजीकरण विवरण की पुष्टि माँगी है।'
          : item.state === 'REJECTED' ? 'अस्वीकृति में शुरुआती प्रतीक्षा अवधि का उल्लेख है।'
            : item.state === 'UNDER_REVIEW' ? 'दावा समीक्षा में है; अंतिम निर्णय लंबित है।'
              : item.state === 'SUBMITTED' ? 'दावा सिम्युलेटेड बीमा कंपनी को भेजा गया है; निर्णय लंबित है।'
                : 'कोई रुकावट दर्ज नहीं है।';
      const actionHindi = item.nextBestAction === 'Request discharge summary from hospital' ? 'अस्पताल से डिस्चार्ज सारांश माँगें।'
        : item.nextBestAction === 'Review and submit claim packet' ? 'दावा पैकेट की समीक्षा करें।'
          : item.nextBestAction === 'Request factual clarification' ? 'तथ्यात्मक स्पष्टीकरण माँगें।'
            : item.nextBestAction === 'Request clarification on deduction' ? 'कटौती के बारे में स्पष्टीकरण माँगें।'
              : item.nextBestAction === 'Review the insurer query and provide factual confirmation.' ? 'बीमा कंपनी के अनुरोध की समीक्षा करके सही जानकारी दें।'
                : item.nextBestAction === 'Upload the missing required document.' ? 'ज़रूरी दस्तावेज़ अपलोड करें।'
                  : null;
      response = `आपके दावे की मौजूदा स्थिति ${stateHindi} है। ${blockerHindi} ${missingHindi ? `ज़रूरी दस्तावेज़: ${missingHindi}।` : ''} ${actionHindi ? `अगला कदम: ${actionHindi}` : ''} मैं दावे को मंज़ूर या परिणाम की गारंटी नहीं दे सकता।`;
    }
    else if (asksNext) response = item.nextBestAction
      ? `अगला कदम ${item.responsibleParty === 'HOSPITAL' ? 'अस्पताल' : item.responsibleParty === 'INSURER' ? 'बीमा कंपनी' : 'दावा टीम'} का है: ${item.nextBestAction === 'Upload the missing required document.' ? 'ज़रूरी दस्तावेज़ अपलोड करें।' : item.nextBestAction === 'Review and submit claim packet' ? 'दावा पैकेट की समीक्षा करें।' : item.nextBestAction === 'Request factual clarification' ? 'तथ्यात्मक स्पष्टीकरण माँगें।' : 'दर्ज अगले कदम की समीक्षा करें।'}`
      : 'अगला कदम तय करने के लिए दावे का विश्लेषण चलाएँ।';
    else if (asksPolicy) response = response.startsWith('§') ? `नीति दस्तावेज़ का मूल पाठ: ${response}` : 'इस दावे में नीति की संबंधित धारा उपलब्ध नहीं है।';
    else response = 'मैं उपलब्ध दस्तावेज़ों और दावे के रिकॉर्ड की जाँच करूँगा। आवश्यक जानकारी मौजूद नहीं हुई तो आपसे पूछूँगा; मैं जानकारी का अनुमान नहीं लगाऊँगा।';
  }
  return { answer: response, evidenceIds };
}

export { ownedCase, nowFor, SLA_RULES, FICTIONAL_TPA };
