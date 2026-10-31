import { DOCUMENT_REQUIREMENTS, type ClaimRoute } from '@/lib/constants';

export type RuleDocument = { id: string; docType: string; fields?: Record<string, string> };

/** Pure readiness calculation shared by tests and documentation examples. */
export function calculateReadiness(route: ClaimRoute, documents: RuleDocument[]) {
  const required = DOCUMENT_REQUIREMENTS[route];
  const present = [...new Set(documents.map((document) => document.docType))];
  const missing = required.filter((type) => !present.includes(type));
  const bill = documents.find((document) => document.docType === 'ITEMISED_BILL');
  const receipt = documents.find((document) => document.docType === 'PAYMENT_RECEIPT');
  const billAmount = bill?.fields?.totalAmountPaise;
  const receiptAmount = receipt?.fields?.totalAmountPaise;
  return {
    required,
    present,
    missing,
    validRequiredCount: required.length - missing.length,
    totalRequiredCount: required.length,
    completenessPct: Math.round(((required.length - missing.length) / required.length) * 100),
    failedChecks: [
      ...missing.map((type) => ({ type: 'MISSING_DOCUMENT', value: type })),
      ...(billAmount && receiptAmount && billAmount !== receiptAmount ? [{ type: 'AMOUNT_MISMATCH', value: 'bill-receipt' }] : []),
    ],
  };
}

export function delayStatus(startedAt: Date | null, now: Date, thresholdMinutes: number, completedAt: Date | null = null) {
  if (!startedAt) return { status: 'START_TIME_UNAVAILABLE' as const, elapsedMinutes: null };
  const elapsedMinutes = Math.max(0, Math.floor(((completedAt ?? now).getTime() - startedAt.getTime()) / 60_000));
  return { status: completedAt ? 'COMPLETED' as const : elapsedMinutes >= thresholdMinutes ? 'OVERDUE' as const : 'PENDING' as const, elapsedMinutes };
}

export function canSend(action: { status: string; draftVersion: number }, approval: { status: string; draftVersion: number } | null, alreadySubmitted: boolean) {
  return action.status === 'READY_FOR_APPROVAL' && approval?.status === 'APPROVED' && approval.draftVersion === action.draftVersion && !alreadySubmitted;
}

export function validEvidence(reference: { documentId?: string | null; clauseId?: string | null; page?: number | null; excerpt: string }, documents: Array<{ id: string }>, clauses: Array<{ documentId: string; clauseId: string; page: number; text: string }>) {
  if (!reference.excerpt.trim()) return false;
  if (reference.documentId && !documents.some((document) => document.id === reference.documentId)) return false;
  if (reference.clauseId) return clauses.some((clause) => clause.documentId === reference.documentId && clause.clauseId === reference.clauseId && clause.page === reference.page && clause.text.includes(reference.excerpt));
  return true;
}
