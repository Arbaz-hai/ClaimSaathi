import 'server-only';

type Capability = 'stt' | 'translate' | 'tts' | 'generation';
export type SarvamError = Error & { fallback?: string; status?: number };

const base = () => process.env.SARVAM_BASE_URL ?? 'https://api.sarvam.ai';
const isConnected = () => process.env.AI_MODE === 'sarvam' && Boolean(process.env.SARVAM_API_KEY);
const enabled = (capability: Capability) => isConnected() && process.env[`SARVAM_ENABLE_${capability.toUpperCase()}`] !== 'false';
const buckets = new Map<string, number[]>();

function failure(message: string, fallback?: string, status?: number): SarvamError { const error = new Error(message) as SarvamError; error.fallback = fallback; error.status = status; return error; }

async function call(endpoint: string, init: RequestInit, capability: Capability, timeout: number): Promise<Response> {
  if (!enabled(capability)) throw failure('Sarvam is not configured for this capability.', 'Demo mode is active; no Sarvam request was made.');
  const stamps = (buckets.get(capability) ?? []).filter((at) => Date.now() - at < 60_000);
  if (stamps.length >= 20) throw failure('The local Sarvam request limit has been reached. Please wait a minute.', 'No request was sent after the rate limit was reached.');
  stamps.push(Date.now()); buckets.set(capability, stamps);
  const key = process.env.SARVAM_API_KEY!;
  let lastError: SarvamError | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`${base()}${endpoint}`, { ...init, headers: { 'api-subscription-key': key, ...(init.headers ?? {}) }, signal: controller.signal });
      if (response.ok) return response;
      const retry = [429, 500, 503].includes(response.status);
      if (!retry) throw failure(`Sarvam request failed (${response.status}).`, 'Use the labelled demo fallback or retry after checking your Sarvam configuration.', response.status);
      lastError = failure(`Sarvam temporarily unavailable (${response.status}).`, 'Demo fallback is available; no result was fabricated.', response.status);
    } catch (error) {
      lastError = error instanceof Error && 'fallback' in error ? error as SarvamError : failure('Sarvam could not be reached.', 'Demo fallback is available; no result was fabricated.');
    } finally { clearTimeout(timer); }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw lastError ?? failure('Sarvam request failed.', 'Demo fallback is available.');
}

export const sarvamStatus = () => ({ aiMode: isConnected() ? 'sarvam' : 'demo', capabilities: { stt: enabled('stt'), translate: enabled('translate'), tts: enabled('tts'), generation: enabled('generation') }, verified: { stt: 'saaras:v4', translate: 'sarvam-translate:v1', tts: 'bulbul:v4-flash', generation: 'sarvam-105b' } });

export async function transcribeAudio(audio: Buffer, mime: string, language = 'unknown'): Promise<{ transcript: string; language: string }> {
  if (audio.length > 10 * 1024 * 1024) throw failure('Audio exceeds the 10 MB limit.');
  const form = new FormData(); form.set('file', new Blob([new Uint8Array(audio)], { type: mime }), 'question.webm'); form.set('model', 'saaras:v4'); form.set('language_code', language);
  const response = await call('/speech-to-text', { method: 'POST', body: form }, 'stt', 20_000);
  const body = await response.json() as { transcript?: string; language_code?: string };
  if (!body.transcript) throw failure('Sarvam did not return a usable transcript.', 'Type your question instead.');
  return { transcript: body.transcript, language: body.language_code ?? language };
}

export async function translateText(input: string, source: string, target: string): Promise<{ translatedText: string }> {
  if (input.length > 2000) throw failure('Text exceeds the 2,000 character translation limit.');
  const response = await call('/translate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input, source_language_code: source, target_language_code: target, model: 'sarvam-translate:v1', mode: 'formal' }) }, 'translate', 15_000);
  const body = await response.json() as { translated_text?: string };
  if (!body.translated_text) throw failure('Sarvam did not return a translation.', 'Show the original evidence instead.');
  return { translatedText: body.translated_text };
}

export async function synthesizeSpeech(text: string, language: string): Promise<{ audioBase64: string }> {
  if (text.length > 2500) throw failure('Text exceeds the 2,500 character speech limit.');
  const response = await call('/text-to-speech', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, language_code: language, model: 'bulbul:v4-flash', speaker: language === 'hi-IN' ? 'simran' : 'sanchita_en_insurance', output_audio_codec: 'wav' }) }, 'tts', 20_000);
  const body = await response.json() as { audios?: string[] };
  if (!body.audios?.[0]) throw failure('Sarvam did not return playable audio.', 'Use device speech in demo mode.');
  return { audioBase64: body.audios[0] };
}

export async function generateGroundedResponse(prompt: string): Promise<{ text: string }> {
  const response = await call('/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'sarvam-105b', messages: [{ role: 'system', content: 'Return a concise, evidence-bound explanation. Never promise an insurance outcome or claim to have taken an action. You cannot approve or submit a claim, contact a hospital or insurer, or authorize a payment. Never invent missing facts. State that explicit user approval is required before any simulated outbound action.' }, { role: 'user', content: prompt }], max_tokens: 450, reasoning_effort: null }) }, 'generation', 45_000);
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw failure('Sarvam did not return an explanation.', 'Use the deterministic evidence-based answer.');
  return { text };
}
