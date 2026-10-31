// ---------------------------------------------------------------------------
// Frontend label helpers: i18n dictionary first, shared constants as fallback.
// These cover UI chrome only — case facts are always rendered as stored.
// ---------------------------------------------------------------------------

import {
  ACTION_TYPE_LABELS,
  AGENT_LABELS,
  DOC_TYPE_LABELS,
  RESPONSIBLE_PARTY_LABELS,
  SCENARIO_LABELS,
} from '@/lib/constants';
import { tOr, type Lang } from '@/lib/i18n';

export function docTypeLabel(docType: string, lang: Lang): string {
  const fallback =
    DOC_TYPE_LABELS[docType as keyof typeof DOC_TYPE_LABELS] ?? docType;
  return tOr(lang, `doctype.${docType}`, fallback);
}

export function actionTypeLabel(actionType: string, lang: Lang): string {
  const fallback =
    ACTION_TYPE_LABELS[actionType as keyof typeof ACTION_TYPE_LABELS] ?? actionType;
  return tOr(lang, `actiontype.${actionType}`, fallback);
}

export function partyLabel(party: string, lang: Lang): string {
  const fallback =
    RESPONSIBLE_PARTY_LABELS[party as keyof typeof RESPONSIBLE_PARTY_LABELS] ?? party;
  return tOr(lang, `party.${party}`, fallback);
}

export function agentLabel(agent: string, lang: Lang): string {
  const fallback = AGENT_LABELS[agent as keyof typeof AGENT_LABELS] ?? agent;
  return tOr(lang, `agent.${agent}`, fallback);
}

export function scenarioLabel(scenario: string, lang: Lang): string {
  const fallback =
    SCENARIO_LABELS[scenario as keyof typeof SCENARIO_LABELS] ?? scenario;
  return tOr(lang, `scenario.${scenario}.label`, fallback);
}

export function stateLabel(state: string, lang: Lang): string {
  return tOr(lang, `states.${state}`, state);
}

export function routeLabel(route: string, lang: Lang): string {
  return tOr(lang, `route.${route}`, route);
}

/** Format a byte count without locale surprises (labels stay stable). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type ToolKind = 'localRule' | 'documentRetrieval' | 'sarvam' | 'mockInsurer';

/**
 * Heuristic classification of agent tool names into UI kind chips.
 * (AgentRun.toolsJson has no kind field in the contract, so we classify by name.)
 */
export function classifyTool(tool: string): ToolKind {
  const s = tool.toLowerCase();
  if (/sarvam|translate|transcrib|tts|speech|stt|nlp|generate/.test(s)) return 'sarvam';
  if (/mock|insurer|submit|send|adapter|outbound|email|sms|gate|approve/.test(s))
    return 'mockInsurer';
  if (/document|clause|search|read|field|extract|text|pdf|file/.test(s))
    return 'documentRetrieval';
  return 'localRule';
}

/** Compact duration for SLA timers, e.g. "2 h 15 min". */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** Allow only digits, commas, dots and spaces for rupee input (sanitise on change). */
export function sanitiseRupeeInput(raw: string): string {
  return raw.replace(/[^0-9.,\s]/g, '').slice(0, 14);
}
