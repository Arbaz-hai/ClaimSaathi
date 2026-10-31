import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import fs from 'fs/promises';
import { PassThrough } from 'stream';
import { z } from 'zod';
import { getOrCreateSession } from '@/lib/security/session';
import { sniffDocumentType, validateUploadMeta, validateUploadSize } from '@/lib/security/files';
import { hasConsent, consents, setConsent } from '@/lib/security/consent';
import { generateGroundedResponse, sarvamStatus, synthesizeSpeech, transcribeAudio, translateText } from '@/lib/providers/sarvam';
import { actionDraftPayloadSchema, actionEditPayloadSchema, advanceTimeSchema, assistantQuerySchema, consentPayloadSchema, demoTriggerSchema, fieldCorrectionSchema, translateRequestSchema, transcribeRequestSchema, ttsRequestSchema, wizardPayloadSchema } from '@/lib/types';
import { addDocument, addWalkthroughSampleDocument, advanceDemoRoleStep, advanceTime, analyze, answer, approveAction, cancelAction, createAction, createClaim, details, documentPath, downloadWalkthroughSampleDocument, evidence, logs, ownedCase, reset, seedScenario, summary, timeline, trigger, updateDocumentFields, activity, listClaims, nowFor } from '@/lib/claims/service';
import { createPdf, fixtureText } from '@/lib/fixtures/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ok = <T>(data: T) => NextResponse.json({ ok: true, data });
const fail = (error: unknown, status = 400) => {
  const item = error as Error & { code?: string; fallback?: string; status?: number };
  return NextResponse.json({ ok: false, error: { code: item.code ?? 'REQUEST_FAILED', message: item.message || 'The request could not be completed.', fallback: item.fallback } }, { status: item.status ?? status });
};
const body = async (request: Request, schema: z.ZodTypeAny): Promise<any> => schema.parse(await request.json());
const parts = (request: Request) => new URL(request.url).pathname.split('/').filter(Boolean).slice(1);

async function sampleZip(): Promise<Buffer> {
  const archiver = (await import('archiver')).default;
  const fixture = { customerName: 'Asha Sharma', policyNumber: 'AS-2025-887766', hospitalName: 'Greenleaf Multispeciality Hospital, Pune', treatment: 'Dengue fever inpatient treatment', admissionDate: '2026-10-20', dischargeDate: '2026-10-23', amount: 80000 };
  const archive = archiver('zip', { zlib: { level: 9 } }); const stream = new PassThrough(); const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk)); archive.pipe(stream);
  for (const [name, kind] of [['asha-policy.pdf', 'policy'], ['asha-itemised-bill.pdf', 'bill'], ['asha-payment-receipt.pdf', 'receipt'], ['asha-discharge-summary.pdf', 'discharge']] as const) archive.append(Buffer.from(await createPdf(fixtureText(kind, fixture))), { name });
  archive.append('All files are fictional samples for the ClaimSaathi local demo.\n', { name: 'README.txt' });
  const complete = new Promise<void>((resolve, reject) => { stream.on('end', resolve); archive.on('error', reject); }); await archive.finalize(); await complete; return Buffer.concat(chunks);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getOrCreateSession(); const path = parts(request); const query = new URL(request.url).searchParams;
    if (path.join('/') === 'session/ensure') return ok({ sessionId: session.id });
    if (path.join('/') === 'mode' || path.join('/') === 'sarvam/status') return ok({ ...sarvamStatus(), consent: await consents(session.id) });
    if (path.join('/') === 'claims') return ok(await listClaims(session.id));
    if (path.join('/') === 'samples/download') { const zip = await sampleZip(); return new Response(new Blob([new Uint8Array(zip)], { type: 'application/zip' }), { headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="claimsathi-sample-documents.zip"' } }); }
    if (path[0] === 'demo' && path[1] === 'logs') return ok(await logs(session.id, query.get('caseId') ?? ''));
    if (path[0] === 'claims' && path[2] === 'sample-discharge') {
      const pdf = await downloadWalkthroughSampleDocument(session.id, path[1]);
      const buffer = new ArrayBuffer(pdf.byteLength);
      new Uint8Array(buffer).set(pdf);
      return new Response(buffer, { headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="demo-discharge-summary.pdf"' } });
    }
    if (path[0] === 'claims' && path.length === 2) return ok(await details(session.id, path[1]));
    if (path[0] === 'claims' && path[2] === 'evidence') return ok(await evidence(session.id, path[1]));
    if (path[0] === 'claims' && path[2] === 'timeline') return ok(await timeline(session.id, path[1]));
    if (path[0] === 'claims' && path[2] === 'activity') return ok({ runs: await activity(session.id, path[1]), complete: true });
    if (path[0] === 'claims' && path[2] === 'assistant') {
      const input = assistantQuerySchema.parse({ q: query.get('q'), lang: query.get('lang') ?? 'en' });
      if (/(pending|clear|resolve|status|check|help me|लंबित|स्थिति|सुलझ|जांच|जाँच|ठीक कर)/i.test(input.q)) await analyze(session.id, path[1], 'ASSISTANT_REQUESTED');
      const item = await ownedCase(session.id, path[1]); const deterministic = answer(item, input.q, input.lang);
      if (sarvamStatus().capabilities.generation && await hasConsent(session.id, 'GROUNDED_GENERATION')) {
        try { const generated = await generateGroundedResponse(`Question: ${input.q}\nEvidence-bound answer: ${deterministic.answer}`); return ok({ ...deterministic, answer: generated.text, source: 'sarvam' }); } catch (error) { return ok({ ...deterministic, source: 'deterministic', fallbackReason: (error as Error).message }); }
      }
      return ok({ ...deterministic, source: 'deterministic' });
    }
    if (path[0] === 'claims' && path[2] === 'documents' && path[4] === 'download') {
      const file = await documentPath(session.id, path[1], path[3]); const contents = await fs.readFile(file.path); return new Response(contents, { headers: { 'content-type': file.mime, 'content-disposition': `attachment; filename="${file.name.replaceAll('"', '')}"` } });
    }
    if (path[0] === 'claims' && path[2] === 'documents' && path[4] === 'text') { const item = await ownedCase(session.id, path[1]); const doc = item.documents.find((entry: any) => entry.id === path[3]); if (!doc) throw new Error('Document not found.'); return ok({ text: doc.extractedText ?? '', extractionStatus: doc.extractionStatus }); }
    if (path[0] === 'claims' && path[2] === 'export') {
      const item = await ownedCase(session.id, path[1]); const kind = query.get('kind') === 'packet' ? 'claim packet' : 'claim summary'; const text = `CLAIMSAATHI ${kind.toUpperCase()}\nFictional prototype — simulated insurer only\n\nReference: ${item.reference}\nCustomer: ${item.customerName}\nPolicy: ${item.policyNumber}\nHospital: ${item.hospitalName}\nRoute: ${item.route}\nState: ${item.state}\nClaimed: ₹${(item.claimedAmountPaise / 100).toLocaleString('en-IN')}\nSettled: ${item.settledAmountPaise ? `₹${(item.settledAmountPaise / 100).toLocaleString('en-IN')}` : 'Not settled'}\n\nBlocker: ${item.currentBlocker ?? 'None recorded'}\nNext action: ${item.nextBestAction ?? 'None recorded'}\n\nDocuments:\n${item.documents.map((doc: any) => `- ${doc.originalName} (${doc.docType})`).join('\n')}`; const pdf = Uint8Array.from(await createPdf(text)); return new Response(new Blob([pdf], { type: 'application/pdf' }), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${item.reference}-${kind.replace(' ', '-')}.pdf"` } });
    }
    return fail(new Error('Route not found.'), 404);
  } catch (error) { return fail(error); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getOrCreateSession(); const path = parts(request);
    if (path.join('/') === 'session/ensure') return ok({ sessionId: session.id });
    if (path.join('/') === 'consent') { const input = await body(request, consentPayloadSchema); const record = await setConsent(session.id, input.purpose, input.grant); return ok({ purpose: record.purpose, status: record.status, detail: record.detail }); }
    if (path.join('/') === 'claims') { const input = await body(request, wizardPayloadSchema); return ok(await createClaim(session.id, input)); }
    if (path[0] === 'claims' && path[2] === 'analyze') return ok(await analyze(session.id, path[1]));
    if (path[0] === 'claims' && path[2] === 'documents' && path.length === 3) {
      const form = await request.formData(); const file = form.get('file'); const docType = String(form.get('docType') ?? 'OTHER'); if (!(file instanceof File)) throw new Error('Choose a document to upload.'); const buffer = Buffer.from(await file.arrayBuffer()); const sizeError = validateUploadSize(buffer.length); if (sizeError) throw new Error(sizeError); const sniffed = await sniffDocumentType(buffer); if (!sniffed) throw new Error('This file type is not supported.'); const metaError = validateUploadMeta(file.name, file.type || sniffed, sniffed); if (metaError) throw new Error(metaError); const document = await addDocument(session.id, path[1], { name: file.name, mime: sniffed, buffer, docType }); await analyze(session.id, path[1], 'DOCUMENT_ADDED'); return ok(document);
    }
    if (path[0] === 'claims' && path[2] === 'actions' && path.length === 3) { const input = await body(request, actionDraftPayloadSchema); return ok(await createAction(session.id, path[1], input)); }
    if (path[0] === 'claims' && path[2] === 'actions' && path[4] === 'approve') return ok(await approveAction(session.id, path[1], path[3]));
    if (path[0] === 'claims' && path[2] === 'actions' && path[4] === 'cancel') { await cancelAction(session.id, path[1], path[3]); return ok({ cancelled: true }); }
    if (path.join('/') === 'demo/seed-scenario') { const input = z.object({ scenario: z.literal('SCENARIO_E_END_TO_END') }).parse(await request.json()); return ok(await seedScenario(session.id, input.scenario)); }
    if (path.join('/') === 'demo/role-step') { const input = z.object({ caseId: z.string().min(1), step: z.enum(['SHARE_PACKET', 'HOSPITAL_VERIFY', 'CONSULTANT_SUBMIT', 'PAYOUT_CONFIRM']) }).parse(await request.json()); await advanceDemoRoleStep(session.id, input.caseId, input.step); return ok(await summary(session.id, input.caseId)); }
    if (path.join('/') === 'demo/add-sample-document') { const input = z.object({ caseId: z.string().min(1) }).parse(await request.json()); return ok(await addWalkthroughSampleDocument(session.id, input.caseId)); }
    if (path.join('/') === 'demo/advance-time') { const input = await body(request, advanceTimeSchema); await advanceTime(session.id, input.minutes); return ok({ simulatedNow: (await nowFor(session.id)).toISOString() }); }
    if (path.join('/') === 'demo/trigger') { const input = z.object({ caseId: z.string().min(1), kind: demoTriggerSchema.shape.kind }).parse(await request.json()); await trigger(session.id, input.caseId, input.kind); return ok(await summary(session.id, input.caseId)); }
    if (path.join('/') === 'demo/reset') { await reset(session.id); return ok({ reset: true }); }
    if (path.join('/') === 'assistant/confirm-transcript') { const input = z.object({ transcript: z.string().trim().min(1).max(500) }).parse(await request.json()); return ok({ confirmed: true, transcript: input.transcript }); }
    if (path.join('/') === 'sarvam/transcribe') {
      const input = await body(request, transcribeRequestSchema); if (sarvamStatus().aiMode === 'demo') { const samples: Record<string, string> = { missing: 'Which document is missing from my claim?', next: 'Who needs to act next on my claim?', deduction: 'Why was ten thousand rupees deducted?' }; return ok({ transcript: samples[input.sampleTranscriptId ?? 'missing'] ?? samples.missing, language: input.language, source: 'sample-demo', requiresConfirmation: true }); }
      if (!await hasConsent(session.id, 'VOICE_TRANSCRIPTION')) throw Object.assign(new Error('Grant voice-transcription consent before sending audio to Sarvam.'), { code: 'CONSENT_REQUIRED' }); if (!input.audioBase64) throw new Error('No audio was provided.'); const result = await transcribeAudio(Buffer.from(input.audioBase64, 'base64'), input.mime ?? 'audio/webm', input.language); return ok({ ...result, source: 'sarvam', requiresConfirmation: true });
    }
    if (path.join('/') === 'sarvam/translate') { const input = await body(request, translateRequestSchema); if (sarvamStatus().aiMode === 'demo') return ok({ translatedText: `Translation assistance (demo): ${input.text}`, source: 'demo' }); if (!await hasConsent(session.id, 'TRANSLATION')) throw Object.assign(new Error('Grant translation consent before sending text to Sarvam.'), { code: 'CONSENT_REQUIRED' }); try { return ok({ ...(await translateText(input.text, input.source, input.target)), source: 'sarvam' }); } catch (error) { return ok({ translatedText: input.text, source: 'original', fallbackReason: (error as Error).message }); } }
    if (path.join('/') === 'sarvam/tts') { const input = await body(request, ttsRequestSchema); if (sarvamStatus().aiMode === 'demo') return ok({ source: 'device-demo', transcript: input.text }); if (!await hasConsent(session.id, 'TEXT_TO_SPEECH')) throw Object.assign(new Error('Grant text-to-speech consent before sending text to Sarvam.'), { code: 'CONSENT_REQUIRED' }); try { return ok({ ...(await synthesizeSpeech(input.text, input.lang)), source: 'sarvam', transcript: input.text }); } catch (error) { return ok({ source: 'device-demo', transcript: input.text, fallbackReason: (error as Error).message }); } }
    return fail(new Error('Route not found.'), 404);
  } catch (error) { return fail(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getOrCreateSession(); const path = parts(request);
    if (path[0] === 'claims' && path[2] === 'documents' && path[4] === 'fields') { const input = await body(request, fieldCorrectionSchema); return ok(await updateDocumentFields(session.id, path[1], path[3], input.fields)); }
    if (path[0] === 'claims' && path[2] === 'actions' && path.length === 4) { const input = await body(request, actionEditPayloadSchema); const { editAction } = await import('@/lib/claims/service'); return ok(await editAction(session.id, path[1], path[3], input)); }
    return fail(new Error('Route not found.'), 404);
  } catch (error) { return fail(error); }
}
