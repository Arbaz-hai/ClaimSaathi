import type { AgentModule } from '@/lib/types';
import { action, empty, finding } from './helpers';

export const timelineDelayAgent: AgentModule = {
  name: 'TIMELINE_AND_DELAY_WATCH',
  run(ctx, tools) {
    tools.log('deadline-calculator', 'ok', 'Checked recorded workflow timestamps against configurable demo thresholds.');
    const output = empty('TIMELINE_AND_DELAY_WATCH', 'No overdue configured demo timer was found.');
    const start = ctx.events.find((event) => event.type === 'FINAL_AUTH_REQUEST_SENT');
    const done = ctx.events.find((event) => event.type === 'FINAL_AUTH_RESPONSE_RECEIVED');
    if (!start) { output.uncertainties.push('Start time unavailable for final authorisation timer.'); return output; }
    const elapsed = new Date(ctx.simulatedNow).getTime() - new Date(start.simulatedAt).getTime();
    if (!done && elapsed >= 180 * 60_000) {
      output.summary = 'The configurable three-hour demonstration threshold has been exceeded.';
      output.findings.push(finding('cashless-overdue', 'DEMO_SLA_OVERDUE', 'critical', 'Final authorisation is overdue under the configurable demo assumption.', 'This is not verified regulatory guidance and does not guarantee an entitlement.'));
      output.proposedActions.push(action('escalate-delay', 'ESCALATION', 'Prepare final-authorisation escalation', 'Prepare a factual reminder for the simulated insurer; approval is required before it is sent.', 'INSURER'));
    }
    return output;
  },
};
