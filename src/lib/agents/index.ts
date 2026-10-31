import type { AgentModule } from '@/lib/types';
import { intakeAgent } from './intake';
import { policyEvidenceAgent } from './policy-evidence';
import { documentReadinessAgent } from './document-readiness';
import { coordinationAgent } from './coordination';
import { timelineDelayAgent } from './timeline-delay';
import { settlementAppealAgent } from './settlement-appeal';

export const agents: Record<string, AgentModule> = {
  [intakeAgent.name]: intakeAgent,
  [policyEvidenceAgent.name]: policyEvidenceAgent,
  [documentReadinessAgent.name]: documentReadinessAgent,
  [coordinationAgent.name]: coordinationAgent,
  [timelineDelayAgent.name]: timelineDelayAgent,
  [settlementAppealAgent.name]: settlementAppealAgent,
};
