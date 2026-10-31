import 'server-only';
import { prisma } from '@/lib/db';

const DETAILS: Record<string, string> = {
  VOICE_TRANSCRIPTION: 'A short voice recording is shared with Sarvam AI to produce an editable transcript.',
  TRANSLATION: 'Only the text selected for translation is shared with Sarvam AI.',
  TEXT_TO_SPEECH: 'Only the short explanation selected for speech is shared with Sarvam AI.',
  GROUNDED_GENERATION: 'The minimum selected case context is shared with Sarvam AI to rephrase a grounded explanation.',
};

export async function setConsent(sessionId: string, purpose: string, grant: boolean) {
  return prisma.consentRecord.upsert({ where: { sessionId_purpose: { sessionId, purpose } }, create: { sessionId, purpose, status: grant ? 'GRANTED' : 'WITHDRAWN', detail: DETAILS[purpose] ?? 'External-provider consent.' }, update: { status: grant ? 'GRANTED' : 'WITHDRAWN' } });
}
export async function hasConsent(sessionId: string, purpose: string): Promise<boolean> { return (await prisma.consentRecord.findUnique({ where: { sessionId_purpose: { sessionId, purpose } } }))?.status === 'GRANTED'; }
export async function consents(sessionId: string) { const records = await prisma.consentRecord.findMany({ where: { sessionId } }); return Object.fromEntries(Object.entries(DETAILS).map(([purpose, detail]) => { const record = records.find((item) => item.purpose === purpose); return [purpose, { status: record?.status ?? 'WITHDRAWN', detail }]; })); }
