import type { AgentModule } from '@/lib/types';
import { empty, finding, policyEvidence } from './helpers';

export const policyEvidenceAgent: AgentModule = {
  name: 'POLICY_EVIDENCE',
  run(ctx, tools) {
    tools.log('clause-retrieval', 'ok', 'Searched the local policy-clause index.');
    const clauseId = ctx.route === 'CASHLESS' ? '§6.3' : '§6.1';
    const ref = policyEvidence(ctx, tools, clauseId, ctx.route === 'CASHLESS' ? 'Cashless document requirement' : 'Reimbursement document requirement');
    const output = empty('POLICY_EVIDENCE', ref ? `Retrieved ${clauseId} from the supplied fictional policy.` : 'Cannot determine the policy requirement from available documents.');
    if (ref) output.evidenceReferences.push(ref);
    else output.uncertainties.push('No indexed policy clause is available for this case.');
    if (ctx.state === 'REJECTED') {
      const waiting = policyEvidence(ctx, tools, '§4.1', 'Initial waiting period');
      if (waiting) { output.evidenceReferences.push(waiting); output.findings.push(finding('waiting-period', 'POLICY_INTERPRETATION', 'warning', 'The rejection cites the initial waiting period.', 'The available fictional policy supports the cited reason when the recorded dates are correct.')); }
    }
    if (ctx.state === 'PARTIALLY_SETTLED') {
      const consumables = policyEvidence(ctx, tools, '§7.4', 'Consumables cap');
      if (consumables) { output.evidenceReferences.push(consumables); output.findings.push(finding('consumables-cap', 'POLICY_INTERPRETATION', 'info', 'The available policy limits consumables to ₹5,000 per hospitalisation.', 'This explains a deduction only when the settlement statement and itemised bill support it.')); }
    }
    output.nextAgent = 'DOCUMENT_READINESS';
    return output;
  },
};
