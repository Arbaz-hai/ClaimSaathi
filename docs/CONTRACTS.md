# ClaimSaathi — Team Contracts

This document is the source of truth for the three build teammates. Read it
fully before writing code. The Lead owns the foundation (already in the repo),
reviews diffs, and fixes integration issues.

## 0. Environment (IMPORTANT — read first)

- Working directory: `C:\Users\arbaz\OneDrive\Desktop\ClaimIT` (shared by all teammates).
- **Node/npm are NOT on PATH in shells.** Use the bundled runtime:
  - Node: `C:\Users\arbaz\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`
  - pnpm: `C:\Users\arbaz\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs`
  - In PowerShell: `$node='…\node.exe'; $pnpm='…\pnpm.mjs'; & $node $pnpm <args>`
  - Examples: `& $node $pnpm exec tsc --noEmit`, `& $node $pnpm exec vitest run`.
- Do NOT edit `package.json`, `pnpm-lock.yaml`, `prisma/schema.prisma`,
  `.env*`, `next.config.mjs`, `tsconfig.json`, `tailwind.config.ts`,
  `src/lib/types.ts`, `src/lib/constants.ts`, `src/lib/db.ts`,
  `src/lib/utils.ts`, or anything under `src/lib/security/`.
  If you need a dependency or a schema change, message the Lead (target
  `lead`) with an exact request instead of editing.
- If an existing file needs a cross-scope change, message the Lead.
- Prefer `read`/`edit`/`write` tools; do not run long polling loops.

## 1. Write scopes (advisory)

- **backend** teammate: `src/lib/agents/`, `src/lib/orchestration/`,
  `src/lib/evidence/`, `src/lib/integrations/`, `src/lib/providers/`,
  `src/lib/documents/`, `src/app/api/`, `src/lib/i18n-messages/` (server-side
  prepared translations only if backend needs them; frontend owns UI strings).
- **frontend** teammate: `src/components/`, `src/app/page.tsx`,
  `src/app/claims/`, `src/app/layout.tsx`, `src/app/globals.css`,
  `src/lib/i18n.ts`, `src/hooks/`.
- **qa** teammate: `scripts/`, `prisma/seed.ts`, `fixtures/`,
  `src/lib/fixtures/`, `tests/`, `vitest.config.ts`, `playwright.config.ts`,
  `docs/DEMO_SCRIPT.md`, `README.md`, `.eslintrc.json` (only if lint config
  needs the test/script dirs added).

## 2. Conventions already decided (do not redesign)

- **Money**: integer paise everywhere in code/DB/API (`claimedAmountPaise`).
  UI input/output converts via `formatINR` / `parseINRInput` in
  `src/lib/constants.ts`.
- **Time**: DB stores Date; API returns ISO strings; UI renders with
  `formatIST()` (IST + label). The app has a **simulated clock** per session
  (`DemoSession.simulatedNow`); all case timeline events use it.
- **Session isolation**: every route handler / action must resolve the session
  via `requireSession()` and scope every query by `sessionId`. Never query
  across sessions. Cookie name `claimsathi_sid` (HTTP-only).
- **Pages are dynamic**: all pages must include `export const dynamic =
  'force-dynamic'` (session cookie + DB). Never statically pre-render DB data.
- **Agents are pure**: no Prisma/filesystem/network inside agent modules.
  Orchestrator loads context, hands a Toolbox, validates the Zod output, and
  persists everything (AgentRun, AgentOutput, EvidenceReference, Task).
- **Route handlers**, not Server Actions, for all mutations (upload, analyze,
  actions, demo triggers, Sarvam). JSON responses use the `ApiOk/ApiErr`
  envelope from `src/lib/types.ts`.
- **No next/font/google** (builds must work offline). System font stack.
- **No fake activity**: the Activity drawer shows persisted AgentRun rows with
  real tool logs. Agents are fast; no artificial delays needed.
- **No canned answers for arbitrary documents**: extraction is generic
  (pdfjs-dist for text-based PDFs, plain text for .txt; PNG/JPG are
  `MANUAL_ONLY` with an honest label). Fixture-specific logic lives in the
  scenario definitions and mock insurer only.

## 3. Data model

`prisma/schema.prisma` (already written — read it). Key points:
- `ClaimCase.state` ∈ CLAIM_STATES, `route` ∈ REIMBURSEMENT|CASHLESS.
- `UploadedDocument` has `@@unique([caseId, sha256])` — duplicate uploads are
  rejected with a friendly message and never affect completeness.
- `AgentRun.status` ∈ QUEUED|RUNNING|COMPLETED|BLOCKED|FAILED, plus
  `triggerEvent`, `toolsJson` (array of `{tool,status,detail,at}`),
  `nextAgent`, `summary`.
- `OutboundAction.status` ∈ DRAFT|READY_FOR_APPROVAL|APPROVED|CANCELLED|SENT|FAILED,
  `draftVersion` (int), `idempotencyKey`, `mockRef`, `dataSharedJson`,
  `attachmentDocIdsJson`.
- `Approval.status` ∈ PENDING|APPROVED|CANCELLED|SUPERSEDED, `draftVersion`.
- `ConsentRecord` per session per purpose ∈ GRANTED|WITHDRAWN.
- `MockIntegrationLog` for every simulated insurer request/response.
- `ClaimEvent.type` values include the orchestrator events plus domain events:
  `FINAL_AUTH_REQUEST_SENT`, `FINAL_AUTH_RESPONSE_RECEIVED`, `QUERY_RECEIVED`,
  `SUBMISSION_SENT`, `SETTLEMENT_RECEIVED`, `REJECTION_RECEIVED`, etc.

## 4. Agents (backend)

Implement six modules under `src/lib/agents/` plus a registry. Signature:

```ts
export type AgentModule = {
  name: string; // one of AGENT_NAMES in src/lib/constants.ts
  run(ctx: AgentContext, tools: Toolbox): AgentOutput | Promise<AgentOutput>;
};
```

`AgentContext`, `Toolbox`, `AgentOutput` (Zod) are in `src/lib/types.ts`.
Output must satisfy `agentOutputSchema` — validate with `agentOutputSchema.safeParse`
inside the orchestrator before persisting; on validation failure mark the run FAILED.

Agent responsibilities:

1. **INTAKE_AND_ROUTING** — check required facts (customer, policy number,
   insurer, route, hospital, treatment, dates, claimed amount). Missing →
   `NEEDS_INFORMATION`-shaped output with targeted questions. Never invent
   facts. Suggest route only when facts support it.
2. **POLICY_EVIDENCE** — search `ctx.clauses` (keyword scoring over
   title+text); explain waiting periods, exclusions, copay/deductible,
   sublimits, document requirements. Cite documentId + page + clauseId +
   excerpt. Separate facts from interpretation (`SYSTEM_RULE` evidence for
   interpretation). Say "Cannot determine from available documents" when
   absent. Never promise approval.
3. **DOCUMENT_READINESS** — route requirements from
   `DOCUMENT_REQUIREMENTS`; detect missing docs, duplicate uploads (should not
   exist thanks to unique constraint — still check), name mismatches (extracted
   `patientName`/`policyHolderName` fields vs case facts; normalise spaces/
   case; flag only when confident), date inconsistencies (admission ≤
   discharge; bill date within admission..discharge+grace; receipt date ≥ bill
   date), bill arithmetic (sum of extracted line items vs total from the bill
   doc; and receipt amount vs claimed). Completeness =
   validRequiredTypes/totalRequiredTypes*100 (integer %). Output numerator,
   denominator, failed checks. Explain it is NOT an approval probability.
4. **CLAIM_COORDINATION** — assemble packet drafts (`CLAIM_SUBMISSION` with
   attachment list = required docs present), `DOCUMENT_REQUEST` drafts (e.g. to
   hospital for a missing discharge summary), replies to insurer queries.
   Assign responsibility (CUSTOMER/HOSPITAL/INSURER/TPA/BROKER). Never send
   anything itself — it proposes drafts; sending happens only through the
   orchestrator's approval gate + adapter.
5. **TIMELINE_AND_DELAY_WATCH** — read `ctx.events` + `SLA_RULES` (in
   constants, labelled UNVERIFIED_DEMO_ASSUMPTION). Detect overdue (elapsed >
   threshold) and approaching (≥80%). Timers start ONLY from the recorded
   start event; if missing, output "Start time unavailable" and do not compute
   a deadline. Draft `REMINDER` (to hospital) and `ESCALATION` (to insurer)
   actions; require approval. Clearly state a timer breach is not an
   entitlement.
6. **SETTLEMENT_AND_APPEAL** — compare bill line items vs settlement summary;
   explain deductions with clause citations (e.g. §7.4 consumables cap); extract
   rejection reasons (e.g. §4.1 waiting period); propose `CLARIFICATION` or
   `GRIEVANCE` drafts only when evidence supports a factual representation;
   if the policy supports the deduction/rejection, say so honestly and do not
   manufacture appeal grounds.

Common rules: findings carry evidence; every claim about the policy must have
a POLICY_CLAUSE evidence ref; every claim about a document must have a
DOCUMENT_FIELD ref; system rules cite SYSTEM_RULE; mock insurer outputs cite
EXTERNAL_RECORD.

Also implement `src/lib/agents/assistant.ts`: a deterministic Q&A over the
latest case state + outputs ("which document is missing?", "who must act
next?", "why was my claim deducted?", "what does my policy say about X?").
Pure function: `answerAssistant(ctx, lastOutputs, question, lang)` → answer
string + optional evidence refs. Backend route `/api/claims/[id]/assistant`
wires it. In connected mode the route MAY use Sarvam generation to rephrase,
but only with consent + grounded context, and the fallback is deterministic.

## 5. Orchestrator (backend)

`src/lib/orchestration/` — state machine + event routing + persistence.

Transitions (guard conditions in brackets):

```
DRAFT                  --CASE_CREATED--> NEEDS_INFORMATION | DOCUMENTS_INCOMPLETE | READY_FOR_REVIEW
NEEDS_INFORMATION      --INFORMATION_UPDATED/ANALYSIS_REQUESTED--> (re-evaluate) DRAFT | DOCUMENTS_INCOMPLETE | READY_FOR_REVIEW
DOCUMENTS_INCOMPLETE   --DOCUMENT_ADDED/ANALYSIS_REQUESTED--> DOCUMENTS_INCOMPLETE | READY_FOR_REVIEW
READY_FOR_REVIEW       --ACTION_APPROVED(CLAIM_SUBMISSION)--> AWAITING_USER_APPROVAL --(adapter ack)--> SUBMITTED
SUBMITTED              --MOCK_STATUS_RECEIVED(kind)--> QUERY_RECEIVED | UNDER_REVIEW | PARTIALLY_SETTLED | REJECTED
QUERY_RECEIVED         --DOCUMENT_ADDED/ACTION_APPROVED(reply)--> UNDER_REVIEW
UNDER_REVIEW           --MOCK_STATUS_RECEIVED--> PARTIALLY_SETTLED | REJECTED | UNDER_REVIEW
PARTIALLY_SETTLED|REJECTED --(user closes)--> CLOSED
```

Routing (only run the agents the event needs):
- `CASE_CREATED` → intake; if facts complete → policy-evidence + readiness (parallel).
- `DOCUMENT_ADDED` → readiness (+ policy-evidence if the new doc is POLICY).
- `INFORMATION_UPDATED` → intake (+ readiness when doc-adjacent facts change).
- `ANALYSIS_REQUESTED` → by state: NEEDS_INFORMATION→intake; DOCUMENTS_INCOMPLETE→readiness; READY_FOR_REVIEW→coordination (+parallel policy-evidence if policy changed); QUERY_RECEIVED→readiness+coordination; overdue events→delay-watch; REJECTED/PARTIALLY_SETTLED→settlement+policy-evidence (parallel).
- `ACTION_APPROVED` → coordination sends via adapter (see §6), then processes the mock response as MOCK_STATUS_RECEIVED.
- `MOCK_STATUS_RECEIVED` → coordination (interpret response, tasks) + delay-watch if overdue; PARTIAL_SETTLEMENT/REJECTION → settlement.
- `SIMULATED_TIME_ADVANCED` → delay-watch for cases with pending timers.

Persistence pattern: `AgentRun` created QUEUED → RUNNING → COMPLETED/BLOCKED/FAILED
(each transition persisted immediately), `AgentOutput.payloadJson` = validated
JSON, `toolsJson` from the toolbox, evidence refs upserted into
`EvidenceReference`. On completion, update `ClaimCase.currentBlocker`,
`nextBestAction`, `responsibleParty` from the highest-severity open
finding/action. Draft `Task` rows from proposedActions.

Draft versioning & approval gate (coordination + routes):
- Editing a draft (`message`, attachments, purpose) bumps `draftVersion` and
  moves status back to DRAFT; any prior Approval for that action becomes
  SUPERSEDED. Attaching/changing any case document also invalidates
  CLAIM_SUBMISSION approvals (material change).
- Approve → status APPROVED → the gate calls the mock adapter with an
  idempotency key `submission:<caseId>:<actionId>`; a repeated approve or a
  second CLAIM_SUBMISSION with status SENT/APPROVED is rejected as duplicate.
- Only CLAIM_SUBMISSION, REMINDER, ESCALATION, DOCUMENT_REQUEST,
  CLARIFICATION, GRIEVANCE may be sent; everything else is local.

## 6. Mock insurer adapter (backend)

`src/lib/integrations/mock-insurer/` — deterministic, latency 300–800 ms,
logs every REQUEST/RESPONSE row to `MockIntegrationLog`. It is the ONLY
component that "sends" outbound actions (all labelled simulated in UI).

Behaviours:
- `submitClaim(case)` → ack `{ externalRef: 'SGIC-2026-<5 digits>', status: 'UNDER_REVIEW' }`.
- Trigger QUERY (demo panel): if discharge summary missing → query letter for
  it; else query for an optional doc ("hospital registration certificate").
- Trigger STATUS_UPDATE: `{ status: 'UNDER_REVIEW', note: 'Claim under process' }` or, for SCENARIO_B, final auth approved (₹60,000).
- Trigger PARTIAL_SETTLEMENT (SCENARIO_C_PARTIAL only): `{ settledAmountPaise: 70_000_00, deduction: [{label:'Consumables & disposables beyond cap (§7.4)', amountPaise: 10_000_00}] }`.
- Trigger REJECTION (SCENARIO_C_REJECTION only): rejection letter citing §4.1 waiting period, dates consistent with the fixture.
- Sending a REMINDER/ESCALATION → `{ mockRef: 'EMAIL-<id>' }` recorded as SENT (simulated channel).

## 7. API surface (backend implements; frontend consumes)

All JSON routes under `src/app/api/`. Use `runtime = 'nodejs'` for upload,
download, export, and sample-zip routes. Envelope: `{ok:true,data}|{ok:false,error:{code,message,fallback?}}`.

- `POST /api/session/ensure` → `{sessionId}`
- `GET /api/mode` → `{ aiMode:'demo'|'sarvam', capabilities:{stt,translate,tts,generation}, consent:{purpose:{status,detail}} }`
- `POST /api/consent` `{purpose,grant}`
- `GET /api/claims` → `CaseSummaryDto[]`
- `POST /api/claims` (WizardPayload) → creates case, emits CASE_CREATED, runs intake analysis → `CaseSummaryDto`
- `GET /api/claims/[id]` → `{ case: CaseSummaryDto, readiness: ReadinessDto, documents: DocumentDto[], actions: OutboundActionDto[], events: ClaimEvent[], settlement: {...} }`
- `POST /api/claims/[id]/analyze` `{trigger?: 'ANALYSIS_REQUESTED'}` → `{state, blocker, nextBestAction, responsibleParty, runIds}`
- `POST /api/claims/[id]/documents` multipart (`file`, `docType`) → extraction + DOCUMENT_ADDED routing → `DocumentDto`
- `PATCH /api/claims/[id]/documents/[docId]/fields` (FieldCorrectionPayload) → marks edited, reruns readiness
- `GET /api/claims/[id]/documents/[docId]/download` (session-checked)
- `GET /api/claims/[id]/sample-discharge` → separate fictional missing-document PDF, only for the end-to-end demo claim
- `GET /api/claims/[id]/documents/[docId]/text` → extracted text (for inspection)
- `GET /api/claims/[id]/evidence` → evidence refs
- `GET /api/claims/[id]/timeline` → `TimelineItemDto[]`
- `GET /api/claims/[id]/activity?since=<runId>` → `{runs: ActivityItemDto[], complete:boolean}` (polling; frontend polls ~1.5s while runs are QUEUED/RUNNING)
- `GET /api/claims/[id]/assistant?q=&lang=` → deterministic answer `{answer, evidenceIds, source:'deterministic'|'sarvam', fallbackReason?}`
- `POST /api/claims/[id]/actions` (ActionDraftPayload) → creates draft (READY_FOR_APPROVAL), bumps version, invalidates stale approvals
- `PATCH /api/claims/[id]/actions/[actionId]` (ActionEditPayload) → edit draft
- `POST /api/claims/[id]/actions/[actionId]/approve` → approval gate + adapter send
- `POST /api/claims/[id]/actions/[actionId]/cancel`
- `GET /api/claims/[id]/export?kind=summary|packet` → generated PDF (actual case data; use pdf-lib)
- `POST /api/demo/advance-time` `{minutes}` → advances session simulated clock, emits SIMULATED_TIME_ADVANCED for all session cases, runs delay-watch
- `POST /api/demo/trigger` `{caseId, kind}` → mock insurer response + MOCK_STATUS_RECEIVED routing
- `GET /api/demo/logs?caseId=` → `MockLogDto[]`
- `POST /api/demo/seed-scenario` `{scenario: SCENARIO_E_END_TO_END}` → seeds the single user-facing demo into the current session
- `POST /api/demo/role-step` `{caseId, step}` → advances the fictional packet share, hospital check, simulated submission, or simulated payout in order
- `POST /api/demo/reset` → deletes ALL session data (cases, files) and reseeds nothing
- `GET /api/samples/download` → legacy zip of generated fixture PDFs (not linked from the simplified demo UI)
- `POST /api/sarvam/transcribe|translate|tts` (zod-validated; demo-mode behaviour per docs/SARVAM.md)
- `GET /api/sarvam/status`
- `POST /api/assistant/confirm-transcript` — in demo mode a sample transcript is NOT an instruction until the user confirms; in connected mode the confirmed transcript can be sent to `/api/claims/[id]/assistant`.

The single user-facing demo is `SCENARIO_E_END_TO_END`: the fictional claim
starts with its policy, itemised bill, and payment receipt already stored in
the current session; only the discharge-summary sample is missing. Other
scenario fixtures remain internal test/legacy data and are not offered by the
demo seed API or dashboard.

## 8. Frontend pages & controls (frontend)

Navbar: logo "ClaimSaathi", tagline, language switcher (English/हिन्दी — UI
strings only; never translate case facts), Sarvam status indicator chip
("Demo mode · rule-based agent simulation" / "Sarvam connected"), session
menu (Delete my demo data → confirm dialog → POST /api/demo/reset).

### `/` Dashboard
- Simple "I need my claim" entry point and one "Start the demo" action.
- The single demo opens a customer role with one missing synthetic document.
- The missing discharge-summary sample is downloaded separately from the
  session-scoped claim sample endpoint.
- Role tabs are Customer, Hospital, and Paytm payout consultant. They share
  the same local demo session and are not authenticated accounts. UI
  notifications are derived from saved events; no real messages are sent.

### `/claims/new` Wizard (5 steps)
1. Claim route (reimbursement/cashless cards with explanations).
2. Patient & policy info (all fields optional except the ones backend requires;
   "I don't know" toggles set values to "").
3. Hospital & treatment info (dates, description, claimed amount in ₹).
4. Documents (optional uploads with docType picker; size/type validation;
   extracted-field preview with correction inputs; provenance + edited badges).
5. Consent + review (provider consent explainer — only matters in connected
   mode; review summary; Create claim → POST /api/claims → redirect to
   workspace).

### `/claims/[id]` Workspace
Header: reference, state badge, current blocker, next best action,
responsible party, claimed vs settled amounts (`formatINR`), simulated time
chip, "Run analysis" button (disabled while running).
Tabs: Overview | Documents | Policy Evidence | Timeline | Actions & Approvals
| Settlement / Appeal.
- Overview: readiness meter (numerator/denominator, "not an approval
  probability"), open tasks, latest agent summaries, demo scenario progress
  hints (scenario-specific).
- Documents: upload (PDF/TXT/PNG/JPG ≤10 MB), list with extraction status,
  per-doc extracted-field editor (PATCH), "Download" button, text preview
  (`.document-text`, escaped), provenance note. Scanned/image docs show
  "Manual transcription required — text extraction unavailable" with a
  textarea to enter a manual transcript (PATCH fields + stores manual text).
- Policy Evidence: clause list with page/clause/excerpt; search box (backend
  `/assistant` or a local filter); "translated explanation" toggle —
  demo mode uses prepared translations, connected mode uses Sarvam translate
  with consent; always labelled "translation assistance".
- Timeline: ClaimEvent list (IST), plus SLA rule cards with
  "UNVERIFIED_DEMO_ASSUMPTION" labels and elapsed/remaining timers.
- Actions & Approvals: drafts list with status/draftVersion; review modal:
  purpose, recipient, message, attachments, data being shared, draft version;
  Edit / "Approve and send to simulated insurer" (exact label) / Cancel.
  Editing invalidates approval (UI must show "draft changed — re-approval
  required"). Saving a draft never sends.
- Settlement / Appeal: bill vs settlement comparison, deduction breakdown with
  evidence citations (click citation → evidence panel opens the actual
  reference), rejection reason extraction, clarification/grievance draft
  buttons, honest "the policy supports this deduction" notes.

### Cross-cutting components
- **Agent Activity drawer** (right side, toggle button): polling
  `/api/claims/[id]/activity`; rows show agent name, status
  (queued/running/completed/blocked/failed), start/end IST, tools used,
  concise result, evidence links (click opens Evidence panel), next handoff.
  Kind chips: local rule | document retrieval | Sarvam API | simulated insurer.
- **Evidence panel** (dialog/drawer): full citation (document, page, clause
  id, excerpt, extraction status) + "Open document" (download link).
- **Assistant panel**: typed question → `/api/claims/[id]/assistant`; quick
  question chips; "Ask by voice": MediaRecorder (webm/opus) with recording
  indicator; demo mode → clearly labelled sample transcripts with editable
  transcript + explicit Confirm before it is treated as an instruction;
  connected mode → real STT after consent. "Listen" buttons on short
  explanations: connected → Sarvam TTS; demo → device speech synthesis
  labelled "device speech (demo)". Play/pause/replay + transcript visible.
  No autoplay of sensitive content.
- **Demo control panel** (workspace, separate section): Advance simulated time
  (+30m/+2h/+4h), Trigger document query / status update / partial settlement /
  rejection (buttons enabled per scenario), Inspect mock request/response logs
  (table from `/api/demo/logs`).
- Loading/error/empty/retry states on every data view; toasts via sonner;
  accessible labels/aria on all controls; mobile-first layouts.

## 9. Fixtures & scenarios (qa)

`scripts/generate-fixtures.ts` writes text-based PDFs to `fixtures/generated/`
(pdf-lib, Helvetica — extractable by pdfjs-dist). Idempotent (overwrite).
`src/lib/fixtures/scenarios.ts` exports pure scenario definitions + PDF bytes
loader used by seeding.

Shared fictional world (single insurer/product so clause ids stay consistent):

- Insurer: Suraksha General Insurance Co. Ltd.; TPA: MediAssist TPA Services
  Pvt. Ltd.; Broker: PolicyWise Brokers.
- Product: AarogyaShield Individual Health Policy, sum insured ₹5,00,000.
- Clause ids (page numbers in parens): §1.1 Definitions (1); §3.2 Sum Insured
  (2); §4.1 Initial Waiting Period — 30 days (4); §5.4 Room Category Limit —
  semi-private, 1% SI/day (5); §6.1 Documents for Reimbursement Claims (6);
  §6.3 Documents for Cashless Claims (6); §7.4 Consumables & Non-medical Items
  Cap — ₹5,000 per hospitalisation (7); §8.2 Cashless Authorisation
  Timelines (8); §9.1 Grievance Redressal (9).
- Policy PDF is generated per case (holder name substituted); clause TEXT is
  identical across cases.

SCENARIO_A — Asha Sharma, reimbursement, claimed ₹80,000. Policy
AS-2025-887766, inception 2025-04-01. Admission 2026-10-20 → discharge
2026-10-23, Greenleaf Multispeciality Hospital, Pune. Seeded documents:
policy, itemised bill, payment receipt. MISSING: discharge summary.
Bill line items must sum exactly to 80,000: Room 3×4,500=13,500; ICU
2×9,000=18,000; Surgery 32,000; Anaesthesia 6,500; Pharmacy & consumables
4,000; Diagnostics 6,000. Receipt: ₹80,000. Sample discharge summary PDF
(provided in fixtures) is for the user to upload in step 7 of the golden path.

SCENARIO_B — Rohan Mehta, cashless. Policy RM-2025-112233, inception
2025-02-10. Sunrise Multispeciality Hospital, Bengaluru. Admission 2026-10-30.
Seeded: policy, pre-auth request (approved ₹60,000), final-auth request with
event `FINAL_AUTH_REQUEST_SENT` recorded at (seed-time − 2 hours). SLA rule
`casHLESS_FINAL_AUTH_RESPONSE` = 180 minutes. Advancing time +2h makes it
overdue → delay-watch drafts REMINDER (hospital) + ESCALATION (insurer).

SCENARIO_C_PARTIAL — Kavita Nair, reimbursement, claimed ₹80,000. Policy
KN-2025-998877, inception 2025-06-15. St. Mira Multispeciality Hospital,
Kochi. Admission 2026-10-05 → 2026-10-08. Seeded: policy, bill, receipt,
discharge summary + mock SUBMISSION_SENT + UNDER_REVIEW state. Bill items sum
to 80,000: Room 3×4,500=13,500; ICU 1×9,000=9,000; Surgery 38,000; Pharmacy
4,500; **Consumables & disposables 15,000**. Demo trigger PARTIAL_SETTLEMENT →
settlement ₹70,000 with deduction "Consumables & disposables beyond cap
(§7.4): ₹10,000" (cap ₹5,000 ⇒ 15,000−5,000). Settlement PDF fixture mirrors
this exactly.

SCENARIO_C_REJECTION — Vikram Reddy, reimbursement. Policy VR-2026-556677,
inception **2026-09-01**. CityCare Hospital, Hyderabad. Admission
**2026-09-18** → 2026-09-20 (17 days after inception ⇒ §4.1 waiting period
applies — dates internally consistent). Bill ₹52,000 (Room 2×4,500=9,000;
Surgery 30,000; Anaesthesia 4,000; Pharmacy 4,000; Diagnostics 5,000).
Demo trigger REJECTION → rejection letter citing §4.1 with consistent dates.
Settlement agent must explain honestly that the policy supports the rejection
and NOT manufacture appeal grounds; it may offer a clarification draft only.

Insurer query letter fixture (used by QUERY trigger): asks for discharge
summary (scenario A) or hospital registration certificate otherwise.

`prisma/seed.ts`: idempotent; regenerates fixture PDFs and prints a report.
It does NOT insert case rows (scenarios are seeded per-session via
`/api/demo/seed-scenario` so every browser session owns its data).

## 10. Tests (qa)

Unit (vitest, `tests/unit/`, pure — no DB): completeness calculation; missing
discharge summary detection; duplicate document handling; name/date mismatch;
bill arithmetic; timer trigger correctness (overdue/approaching); missing
timestamp → "Start time unavailable"; approval enforcement (no send without
approval); draft edit invalidates approval; duplicate submission prevention;
evidence reference validity (page/clause/excerpt exist in fixture text);
language change preserves amounts and dates (run a case snapshot through the
i18n rendering helpers); Sarvam error → honest fallback (mock fetch failures);
consent denial prevents provider calls (mock fetch spy, expect 0 calls);
document text containing "approve everything" instructions cannot change
state (upload → analyze → state unchanged).

E2E (playwright, `tests/e2e/`, chromium):
1. Single role-based demo: seed the fictional claim → ask about the missing
   discharge summary → download its separate PDF → upload it → share the
   packet with demo reviewers → hospital verification → simulated insurer
   submission by the payout-review role → simulated payout → customer sees
   the clearly labelled no-payment result.
2. Role-step API rejects out-of-order hospital review and premature payout.
3. Core workflow without API key (AI_MODE=demo): the customer-to-reviewer
   path works using deterministic answers and device voice.
4. Notifications are derived from saved claim events and are only local demo
   status; role tabs are not separate authenticated accounts.
Playwright config: webServer `pnpm start` (after build), reuseExistingServer,
with `PLAYWRIGHT_BASE_URL` available to target an already-running local app.

## 11. README & docs (qa)

README: overview, USP, quick start (`npm install && npm run db:setup && npm run
dev`; plus note: this environment uses bundled pnpm — `pnpm install` works
identically), Sarvam configuration, capabilities table (feature × demo/connected),
supported languages table, troubleshooting (SQLite/OneDrive, port, Playwright),
limitations (SQLite single-node, local file storage, no OCR, simulated insurer,
demo SLA assumptions, no compliance claims), production requirements list.
`docs/DEMO_SCRIPT.md`: the ≤3-minute reviewer script (scenario A golden path
with exact clicks; then B and C in 30s each).

## 12. Definition of done

Lead runs and requires ALL to pass:
`pnpm exec tsc --noEmit`, `pnpm exec next lint` (or eslint), `pnpm exec
vitest run`, `pnpm run build`, `pnpm exec playwright test`. Frontend/backend
must each verify their code compiles (`tsc`) before marking tasks complete.
QA runs unit + e2e and fixes test-only failures; product bugs get reported to
the Lead with repro steps.
