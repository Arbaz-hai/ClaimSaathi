import { DOCUMENT_REQUIREMENTS } from '@/lib/constants';
import type { AgentModule } from '@/lib/types';
import { action, empty, finding, policyEvidence } from './helpers';

export const documentReadinessAgent: AgentModule = {
  name: 'DOCUMENT_READINESS',
  run(ctx, tools) {
    tools.log('document-inventory', 'ok', 'Compared document types with route-specific requirements.');
    const required = DOCUMENT_REQUIREMENTS[ctx.route as keyof typeof DOCUMENT_REQUIREMENTS] ?? [];
    const missing = required.filter((type) => !tools.hasDocumentType(type));
    const output = empty('DOCUMENT_READINESS', missing.length ? `${missing.length} required document type${missing.length > 1 ? 's are' : ' is'} missing.` : 'All required document types are present.');
    if (missing.length) {
      const policy = policyEvidence(ctx, tools, ctx.route === 'CASHLESS' ? '§6.3' : '§6.1', 'Required claim documents');
      if (policy) output.evidenceReferences.push(policy);
      for (const type of missing) output.findings.push(finding(`missing-${type}`, 'MISSING_DOCUMENT', 'critical', `${type.replaceAll('_', ' ')} is required before this packet can be complete.`, 'Document completeness is not an approval probability.'));
      if (missing.includes('DISCHARGE_SUMMARY')) output.proposedActions.push(action('request-discharge', 'DOCUMENT_REQUEST', 'Request discharge summary from hospital', 'Prepare a factual request for the missing discharge summary.', 'HOSPITAL', policy ? [policy.id] : []));
    }
    const bill = ctx.documents.find((doc) => doc.docType === 'ITEMISED_BILL');
    const receipt = ctx.documents.find((doc) => doc.docType === 'PAYMENT_RECEIPT');
    if (bill && receipt) {
      const billAmount = bill.fields.totalAmountPaise;
      const receiptAmount = receipt.fields.totalAmountPaise;
      if (billAmount && receiptAmount && billAmount !== receiptAmount) output.findings.push(finding('amount-mismatch', 'BILL_ARITHMETIC', 'warning', 'The bill and receipt amounts do not match.', `Bill: ${billAmount}; receipt: ${receiptAmount}.`));
    }
    output.nextAgent = missing.length ? 'CLAIM_COORDINATION' : 'CLAIM_COORDINATION';
    return output;
  },
};
