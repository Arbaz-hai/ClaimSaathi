import type { AgentModule } from '@/lib/types';
import { action, empty, finding, policyEvidence } from './helpers';

export const settlementAppealAgent: AgentModule = {
  name: 'SETTLEMENT_AND_APPEAL',
  run(ctx, tools) {
    tools.log('settlement-comparison', 'ok', 'Compared the simulated settlement outcome with locally indexed policy evidence.');
    const output = empty('SETTLEMENT_AND_APPEAL', 'No settlement or rejection outcome needs review yet.');
    if (ctx.state === 'PARTIALLY_SETTLED') {
      const ref = policyEvidence(ctx, tools, '§7.4', 'Consumables cap');
      if (ref) output.evidenceReferences.push(ref);
      output.summary = 'The ₹10,000 simulated deduction is explained by the supplied itemised bill and policy cap.';
      output.findings.push(finding('deduction-explained', 'DEDUCTION', 'info', '₹10,000 was deducted for consumables above the policy cap.', 'The sample bill lists ₹15,000 and the fictional policy cap is ₹5,000. This is not a promise that any real insurer would decide the same way.'));
      output.proposedActions.push(action('clarify-deduction', 'CLARIFICATION', 'Request clarification on deduction', 'Prepare a factual clarification request; it does not claim that the deduction is incorrect.', 'INSURER', ref ? [ref.id] : []));
    }
    if (ctx.state === 'REJECTED') {
      const ref = policyEvidence(ctx, tools, '§4.1', 'Initial waiting period');
      if (ref) output.evidenceReferences.push(ref);
      output.summary = 'The available fictional policy supports the stated waiting-period reason based on the recorded dates.';
      output.findings.push(finding('rejection-explained', 'REJECTION', 'warning', 'The recorded admission date falls within the policy waiting period.', 'Ask for clarification if the dates or diagnosis are inaccurate; no appeal ground is manufactured.'));
      output.proposedActions.push(action('clarify-rejection', 'CLARIFICATION', 'Request factual clarification', 'Ask the simulated insurer to confirm the dates and policy clause used in the decision.', 'INSURER', ref ? [ref.id] : []));
    }
    return output;
  },
};
