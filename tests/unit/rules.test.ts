import { describe, expect, it } from 'vitest';
import { calculateReadiness, canSend, delayStatus, validEvidence } from '@/lib/claims/rules';

describe('claim readiness', () => {
  it('identifies a missing discharge summary without double-counting duplicates', () => {
    const result = calculateReadiness('REIMBURSEMENT', [
      { id: 'p', docType: 'POLICY' }, { id: 'b1', docType: 'ITEMISED_BILL' }, { id: 'b2', docType: 'ITEMISED_BILL' }, { id: 'r', docType: 'PAYMENT_RECEIPT' },
    ]);
    expect(result.missing).toEqual(['DISCHARGE_SUMMARY']);
    expect(result.validRequiredCount).toBe(3);
    expect(result.completenessPct).toBe(75);
  });

  it('surfaces bill and receipt arithmetic mismatch', () => {
    const result = calculateReadiness('REIMBURSEMENT', [
      { id: 'p', docType: 'POLICY' }, { id: 'b', docType: 'ITEMISED_BILL', fields: { totalAmountPaise: '8000000' } }, { id: 'r', docType: 'PAYMENT_RECEIPT', fields: { totalAmountPaise: '7000000' } }, { id: 'd', docType: 'DISCHARGE_SUMMARY' },
    ]);
    expect(result.failedChecks).toContainEqual({ type: 'AMOUNT_MISMATCH', value: 'bill-receipt' });
  });
});

describe('workflow safety rules', () => {
  it('only triggers a delay after a recorded start time and threshold', () => {
    expect(delayStatus(null, new Date('2026-10-31T00:00:00Z'), 180).status).toBe('START_TIME_UNAVAILABLE');
    expect(delayStatus(new Date('2026-10-31T00:00:00Z'), new Date('2026-10-31T02:59:00Z'), 180).status).toBe('PENDING');
    expect(delayStatus(new Date('2026-10-31T00:00:00Z'), new Date('2026-10-31T03:00:00Z'), 180).status).toBe('OVERDUE');
  });

  it('enforces approval versioning and duplicate-submission protection', () => {
    expect(canSend({ status: 'READY_FOR_APPROVAL', draftVersion: 2 }, { status: 'APPROVED', draftVersion: 1 }, false)).toBe(false);
    expect(canSend({ status: 'READY_FOR_APPROVAL', draftVersion: 2 }, { status: 'APPROVED', draftVersion: 2 }, true)).toBe(false);
    expect(canSend({ status: 'READY_FOR_APPROVAL', draftVersion: 2 }, { status: 'APPROVED', draftVersion: 2 }, false)).toBe(true);
  });

  it('rejects evidence whose clause/page/excerpt do not match the source', () => {
    const docs = [{ id: 'policy' }]; const clauses = [{ documentId: 'policy', clauseId: '§6.1', page: 6, text: 'A reimbursement claim must include a discharge summary.' }];
    expect(validEvidence({ documentId: 'policy', clauseId: '§6.1', page: 6, excerpt: 'must include a discharge summary' }, docs, clauses)).toBe(true);
    expect(validEvidence({ documentId: 'policy', clauseId: '§6.1', page: 4, excerpt: 'must include a discharge summary' }, docs, clauses)).toBe(false);
  });
});
