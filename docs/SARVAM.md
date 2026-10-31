# Sarvam AI Integration — Verified Facts & Configuration

> Status: **verified against official documentation on 2026-10-31.**
> Sources: [Authentication](https://docs.sarvam.ai/api-reference/authentication),
> [Speech-to-Text](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe),
> [Text-to-Speech](https://docs.sarvam.ai/api-reference/text-to-speech/convert),
> [Translate](https://docs.sarvam.ai/api-reference/text/translate-text),
> [Chat Completions](https://docs.sarvam.ai/api/token-factory/chat-completions).

## Authentication (verified)

- Header: `api-subscription-key: <key>` on every endpoint.
- `Authorization: Bearer <key>` is also accepted (useful for OpenAI-compatible tooling).
- Key management: <https://indus.sarvam.ai/key-management>.
- Auth failures return **403** with error code `invalid_api_key_error` (not 401).
- **Keys live only server-side** (`process.env.SARVAM_API_KEY`). Never expose to the browser.

## Capabilities (verified)

### A. Speech-to-text — `POST https://api.sarvam.ai/speech-to-text`

- Multipart form: `file` (required), plus optional `model`, `language_code`, `with_timestamps`, `input_audio_codec`, `keyterms` (array as JSON-encoded form field, saaras:v4 only), `mode` (saaras:v3 only).
- Models: `saaras:v4` (default, recommended), `saaras:v3`.
- `language_code` (BCP-47): `unknown` (auto-detect), `hi-IN`, `en-IN`, `bn-IN`, `gu-IN`, `kn-IN`, `ml-IN`, `mr-IN`, `od-IN`, `pa-IN`, `ta-IN`, `te-IN`, `as-IN`, `ur-IN`, `ne-IN`, `kok-IN`, `ks-IN`, `sd-IN`, `sa-IN`, `sat-IN`, `mni-IN`, `brx-IN`, `mai-IN`, `doi-IN`.
- Accepted audio formats: WAV, MP3, AAC, AIFF, OGG, OPUS, FLAC, MP4/M4A, AMR, WMA, WebM, PCM (PCM requires `input_audio_codec`, 16 kHz only). Best at 16 kHz.
- Response 200: `{ request_id, transcript, language_code }` (+ optional `timestamps`, `language_probability`).
- Errors: 400/403/422/429/500/503 with `{ error: { request_id, message, code } }`.

### B. Translation — `POST https://api.sarvam.ai/translate`

- JSON body: `input` (required; max **1000 chars** for `mayura:v1`, **2000** for `sarvam-translate:v1`), `source_language_code`, `target_language_code`, optional `model`, `mode`, `speaker_gender`, `output_script`, `numerals_format`.
- Models: `mayura:v1` (12 languages, modes formal/classic-colloquial/modern-colloquial/code-mixed, `auto` source detection), `sarvam-translate:v1` (22 languages, formal only).
- Languages: `en-IN`, `hi-IN`, `bn-IN`, `gu-IN`, `kn-IN`, `ml-IN`, `mr-IN`, `od-IN`, `pa-IN`, `ta-IN`, `te-IN` + `as-IN`, `brx-IN`, `doi-IN`, `kok-IN`, `ks-IN`, `mai-IN`, `mni-IN`, `ne-IN`, `sa-IN`, `sat-IN`, `sd-IN`, `ur-IN`.
- Response 200: `{ request_id, translated_text, source_language_code }`.

### C. Text-to-speech — `POST https://api.sarvam.ai/text-to-speech`

- JSON body: `text` (required; max **2500 chars** for bulbul:v3/v4-flash), `language_code` (required: `en-IN`, `hi-IN`, `bn-IN`, `gu-IN`, `kn-IN`, `ml-IN`, `mr-IN`, `od-IN`, `pa-IN`, `ta-IN`, `te-IN`), optional `model`, `speaker`, `pace` (0.5–2.0 v3/v4), `speech_sample_rate` (8000–48000), `output_audio_codec` (`wav` default; with v3/v4 use wav/mp3/aac/flac/linear16 — opus errors), `temperature` (0.01–1.0, v3/v4).
- Models: `bulbul:v4-flash` (recommended), `bulbul:v3` (API default), `bulbul:v2` (legacy).
- Speakers are **case-sensitive lowercase**. Good safe defaults: `meera` is NOT in the list — use v3 speakers e.g. `shubh`, `simran`, `rohan`; for insurance-style English `sanchita_en_insurance` exists for v4 personas.
- Response 200: `{ request_id, audios: [base64 wav] }`.
- Numbers > 4 digits should use commas (e.g. "10,000") for correct pronunciation.

### D. Grounded generation — `POST https://api.sarvam.ai/v1/chat/completions`

- OpenAI-compatible. Models: `sarvam-105b` (flagship, 128K ctx), `sarvam-105b-conversations` (32K ctx). (V2 endpoint `/v2/chat/completions` adds open-weight models; we use V1 Sarvam models.)
- Supports **tool calling** (`tools`, `tool_choice`), **structured outputs** (`response_format: {type:'json_schema', json_schema:{name, schema, strict}}`), streaming.
- Thinking mode is **on by default** (`reasoning_effort` low/medium/high) — for short grounded answers pass `reasoning_effort: null` to disable, and set `max_tokens` explicitly (default 2048).
- Response: OpenAI `chat.completion` shape; content in `choices[0].message.content`.
- **Always Zod-validate** any structured output before acting on it (docs explicitly recommend this).

## Provider reliability requirements (implemented in `src/lib/providers/sarvam/`)

- Per-request timeout (AbortController, e.g. 20s STT / 15s translate / 20s TTS / 45s chat).
- Bounded retries: max 2 retries, only for 429, 500, 503, network errors; exponential backoff; honor `Retry-After` when present.
- In-process token-bucket rate limiter (configurable, default e.g. 20 requests/minute per capability).
- Size limits enforced before any network call: audio ≤ 10 MB, translation input ≤ 2000 chars, TTS ≤ 2500 chars.
- Log request metadata only (endpoint, size, duration, status). Never log audio payloads, transcripts, or API keys.
- Friendly errors surfaced to the UI, with `fallback` field when demo processing is used instead.

## Consent (implemented in `src/lib/security/consent.ts`)

- Before ANY external Sarvam call, the session must have a GRANTED `ConsentRecord` for the matching purpose (VOICE_TRANSCRIPTION | TRANSLATION | TEXT_TO_SPEECH | GROUNDED_GENERATION).
- Withdrawal blocks all future provider requests for that purpose.
- Temporary audio files under `data/audio/` are deleted after processing (no opt-in retention in v1).
- Consent copy explains what is shared; do not promise anything about provider retention.

## Demo mode (AI_MODE=demo, default)

- **No** Sarvam HTTP calls are made, ever.
- Voice input shows clearly labelled **sample transcripts** (prepared, not live STT).
- Translation uses prepared, human-written dictionary translations of the standard explanations.
- TTS in demo mode is unavailable from the backend; the frontend may use the browser's device speech synthesis labelled "device speech (demo)" — never presented as Sarvam audio.
- UI labels the mode: "Demo mode: rule-based agent simulation".
- `GET /api/sarvam/status` reports the real mode and capabilities.

## Connected mode (AI_MODE=sarvam + SARVAM_API_KEY)

- Real calls for enabled capabilities; per-capability toggles `SARVAM_ENABLE_STT|TRANSLATE|TTS|GENERATION` default to true.
- Any failure falls back to demo behaviour with an explicit `fallback` reason shown to the user.
- Insurer integration remains simulated in BOTH modes.
- **No live-credential test has been performed for this project** (no key available). Automated tests mock the provider responses; a manual smoke-test procedure is documented in the README.

## Language support decision (product)

- Ship English + Hindi now (both fully supported across STT/Translate/TTS/chat).
- Other Sarvam languages are *documented* but NOT enabled in the UI until feature-specific support is verified end-to-end.
