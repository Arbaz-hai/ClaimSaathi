import type { AgentModule } from '@/lib/types';
import { action, empty, finding } from './helpers';

export const coordinationAgent: AgentModule = {
  name: 'CLAIM_COORDINATION',
  run(ctx, tools) {
    tools.log('packet-builder', 'ok', 'Checked packet readiness and approval gate requirements.');
    const output = empty('CLAIM_COORDINATION', 'No outbound action was sent automatically.');
    const required = ctx.route === 'CASHLESS' ? ['POLICY', 'PRE_AUTH_REQUEST', 'FINAL_AUTH_REQUEST'] : ['POLICY', 'ITEMISED_BILL', 'PAYMENT_RECEIPT', 'DISCHARGE_SUMMARY'];
    const missing = required.filter((type) => !tools.hasDocumentType(type));
    if (!missing.length && !ctx.mockExternalRef && !['PARTIALLY_SETTLED', 'REJECTED'].includes(ctx.state)) {
      output.summary = 'A complete packet can be reviewed before simulated submission.';
      output.findings.push(finding('packet-ready', 'PACKET_READY', 'info', 'The required document types are present.', 'Approval is still required before any simulated insurer submission.'));
      output.proposedActions.push(action('submit-claim', 'CLAIM_SUBMISSION', 'Review and submit claim packet', 'Review the packet and explicitly approve the simulated insurer submission.', 'INSURER'));
    }
    if (ctx.state === 'QUERY_RECEIVED') output.proposedActions.push(action('reply-query', 'DOCUMENT_REQUEST', 'Prepare response to insurer query', 'Prepare a factual response with the requested supporting document.', 'CUSTOMER'));
    return output;
  },
};
