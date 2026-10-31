import type { AgentContext, AgentOutput, EvidenceRef, Finding, ProposedAction, Toolbox } from '@/lib/types';

export function empty(name: string, summary: string): AgentOutput {
  return { agentName: name, status: 'completed', summary, findings: [], evidenceReferences: [], uncertainties: [], proposedActions: [], nextAgent: null };
}

export function policyEvidence(ctx: AgentContext, tools: Toolbox, clauseId: string, title: string): EvidenceRef | null {
  const clause = ctx.clauses.find((item) => item.clauseId === clauseId);
  if (!clause) return null;
  const id = tools.recordEvidence({ kind: 'POLICY_CLAUSE', title, documentId: clause.documentId, clauseId, page: clause.page, excerpt: clause.text, extractionStatus: 'EXTRACTED' });
  return { id, kind: 'POLICY_CLAUSE', title, documentId: clause.documentId, clauseId, page: clause.page, excerpt: clause.text, extractionStatus: 'EXTRACTED' };
}

export function action(id: string, type: ProposedAction['type'], title: string, description: string, responsibleParty: ProposedAction['responsibleParty'], evidenceRefIds: string[] = []): ProposedAction {
  return { id, type, title, description, responsibleParty, requiresApproval: true, channel: type === 'CLAIM_SUBMISSION' ? 'MOCK_INSURER' : 'SIMULATED_EMAIL', evidenceRefIds };
}

export function finding(id: string, type: string, severity: Finding['severity'], message: string, detail?: string): Finding {
  return { id, type, severity, message, detail };
}
