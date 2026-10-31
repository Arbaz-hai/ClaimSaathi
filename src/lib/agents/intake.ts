import type { AgentModule } from '@/lib/types';
import { empty, finding } from './helpers';

export const intakeAgent: AgentModule = {
  name: 'INTAKE_AND_ROUTING',
  run(ctx, tools) {
    tools.log('case-fact-review', 'ok', 'Reviewed supplied intake facts without inferring unknown values.');
    const output = empty('INTAKE_AND_ROUTING', `Reviewed ${ctx.route.toLowerCase()} claim intake for ${ctx.customerName}.`);
    const missing = [ctx.customerName, ctx.policyNumber, ctx.hospitalName, ctx.treatmentDescription].filter((value) => !value.trim());
    if (missing.length) {
      output.status = 'blocked';
      output.summary = 'More intake information is needed before a claim route can be assessed.';
      output.findings.push(finding('intake-missing', 'MISSING_INFORMATION', 'warning', 'Some core intake details are missing.', 'Add the patient, policy, hospital and treatment details that are available.'));
      output.uncertainties.push('Cannot determine the appropriate route from available information.');
    }
    output.nextAgent = missing.length ? null : 'DOCUMENT_READINESS';
    return output;
  },
};
