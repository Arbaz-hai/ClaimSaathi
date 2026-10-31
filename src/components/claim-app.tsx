'use client';
/* eslint-disable @next/next/no-html-link-for-pages */

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, ArrowLeft, ArrowRight, Bot, CheckCircle2, ChevronRight, CircleHelp, ClipboardCheck, Clock3, Download, FileCheck2, FileText, Headphones, Hospital, Languages, Loader2, Mic, Pause, Send, ShieldCheck, Sparkles, Upload, UserRound, WalletCards, X } from 'lucide-react';
import { apiGet, apiPatch, apiPost, apiPostForm, errorMessage, useFetch, usePolling } from '@/hooks/use-api';
import { formatINR, formatIST, DOC_TYPES, DOC_TYPE_LABELS } from '@/lib/constants';
import type { CaseSummaryDto, DocumentDto, OutboundActionDto, ReadinessDto } from '@/lib/types';

type Mode = { aiMode: 'demo' | 'sarvam'; capabilities: Record<string, boolean>; consent: Record<string, { status: string; detail: string }> };
type CaseDetails = { case: CaseSummaryDto; readiness: ReadinessDto; documents: DocumentDto[]; actions: OutboundActionDto[]; events: Array<{ id: string; type: string; summary: string; actor: string; simulatedAt: string }>; clauses: Array<{ id: string; clauseId: string; title: string; text: string; page: number; documentId: string }>; tasks: Array<{ id: string; title: string; description?: string; responsibleParty: string; status: string }>; evidence: Array<{ id: string; title: string; clauseId?: string | null; page?: number | null; excerpt: string; documentId?: string | null; extractionStatus: string }>; settlement: { claimedAmountPaise: number; settledAmountPaise: number | null; summary: string | null; state: string }; simulatedNow: string };
type ActivityRun = { id: string; agentName: string; status: string; summary: string | null; startedAt: string | null; endedAt: string | null; tools: Array<{ tool: string; detail: string }>; evidenceRefs: Array<{ id: string; title: string }> };

function Chip({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'cyan' | 'amber' | 'green' | 'red' }) {
  const styles = { slate: 'bg-slate-100 text-slate-700', cyan: 'bg-cyan-100 text-cyan-800', amber: 'bg-amber-100 text-amber-900', green: 'bg-emerald-100 text-emerald-800', red: 'bg-red-100 text-red-800' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${styles[tone]}`}>{children}</span>;
}

function stateTone(state: string): 'slate' | 'cyan' | 'amber' | 'green' | 'red' { if (/SETTLED|SUBMITTED|REVIEW/.test(state)) return 'cyan'; if (/REJECTED/.test(state)) return 'red'; if (/INCOMPLETE|AWAITING|QUERY/.test(state)) return 'amber'; return 'slate'; }
function Button({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-navy px-4 py-2 text-sm font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-navy/90 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${className}`} {...props}>{children}</button>; }

function Header({ mode, language, setLanguage, showLanguage = true, onVoiceClick }: { mode: Mode | null; language: string; setLanguage: (value: string) => void; showLanguage?: boolean; onVoiceClick?: () => void }) {
  return <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <Link href="/" className="group flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-cyan-600 text-lg font-black text-navy shadow-lg shadow-cyan-500/20 transition group-hover:rotate-[-6deg]">C</span>
        <span><span className="block text-lg font-bold tracking-tight text-navy">ClaimSaathi</span><span className="block text-xs text-slate-500">Clear next steps for every claim</span></span>
      </Link>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href="/claims/new" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-navy sm:inline-flex">New claim</Link>
        <button type="button" onClick={onVoiceClick ?? (() => { const btn = document.querySelector('[data-voice-btn]') as HTMLButtonElement | null; btn?.click(); })} className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-300 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-900 transition hover:bg-cyan-100 shadow-sm"><Mic size={15} className="text-cyan-700" /> Voice AI</button>
        {showLanguage && <select aria-label="Language" value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-700 shadow-sm"><option value="en">English</option><option value="hi">हिन्दी</option></select>}
        <Chip tone={mode?.aiMode === 'sarvam' ? 'green' : 'cyan'}>{mode?.aiMode === 'sarvam' ? 'Sarvam enabled' : 'Demo workspace'}</Chip>
      </div>
    </div>
  </header>;
}

export function Dashboard() {
  const { data: mode } = useFetch<Mode>('/api/mode');
  const [language, setLanguage] = useState('en'); const [working, setWorking] = useState(false); const [message, setMessage] = useState('');
  async function startDemo() { setWorking(true); setMessage(''); try { const claim = await apiPost<CaseSummaryDto>('/api/demo/seed-scenario', { scenario: 'SCENARIO_E_END_TO_END' }); location.href = `/claims/${claim.id}?demo=1&role=customer`; } catch (cause) { setMessage(errorMessage(cause)); setWorking(false); } }
  const journey = [
    { icon: CircleHelp, label: 'Ask', copy: 'Understand what is holding up the claim.' },
    { icon: FileCheck2, label: 'Add', copy: 'Attach the clearly labelled missing sample.' },
    { icon: WalletCards, label: 'Follow', copy: 'See each fictional review and result.' },
  ];
  return <><Header mode={mode} language={language} setLanguage={setLanguage} /><main className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-6 sm:pt-12">
    <section className="landing-glow relative overflow-hidden rounded-[2rem] bg-navy px-6 py-8 text-white shadow-2xl shadow-navy/15 sm:px-10 sm:py-12">
      <div className="relative grid items-center gap-10 lg:grid-cols-[1.1fr_.9fr]">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-cyan-100"><Sparkles size={14} /> Guided, fictional demo</div>
          <h1 className="mt-6 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Know what your claim needs <span className="text-cyan-300">next.</span></h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-200">ClaimSaathi turns a confusing claim into one clear action at a time. Try the complete customer-to-reviewer journey using safe fictional records.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button className="bg-cyan-400 text-navy hover:bg-cyan-300" disabled={working} onClick={() => void startDemo()}>{working ? <><Loader2 className="animate-spin" size={17} />Preparing demo…</> : <><Sparkles size={17} />Start the demo <ArrowRight size={17} /></>}</Button>
            <button type="button" onClick={() => { const btn = document.querySelector('[data-voice-btn]') as HTMLButtonElement | null; btn?.click(); }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-cyan-300/40 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"><Mic size={17} className="text-cyan-300" /> Ask with Voice</button>
            <Link href="/claims/new" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">Create a claim <ChevronRight size={16} /></Link>
          </div>
          <p className="mt-5 flex items-center gap-2 text-xs text-slate-300"><ShieldCheck size={15} className="text-cyan-300" /> No real insurer, hospital, payment provider, or personal records are used.</p>
        </div>
        <div className="relative mx-auto w-full max-w-md rounded-[1.65rem] border border-white/15 bg-white/[0.08] p-3 backdrop-blur-sm">
          <div className="rounded-[1.25rem] bg-white p-5 text-slate-900 shadow-xl">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-50 text-cyan-700"><UserRound size={18} /></span><div><p className="text-sm font-bold text-navy">Priya Menon</p><p className="text-xs text-slate-500">Demo claim · CLM-2026-1048</p></div></div><Chip tone="amber">1 item needed</Chip></div>
            <div className="mt-6 rounded-2xl bg-slate-50 p-4"><div className="flex items-center justify-between text-xs font-semibold text-slate-500"><span>DOCUMENT READINESS</span><span className="text-amber-700">75%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-3/4 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400" /></div><p className="mt-3 text-sm font-semibold text-navy">Add the discharge summary</p><p className="mt-1 text-xs leading-5 text-slate-500">Everything else is ready for the fictional review.</p></div>
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-white text-cyan-700 shadow-sm"><ClipboardCheck size={16} /></span><p className="text-xs font-medium leading-5 text-cyan-950">One guided action. One clear next step.</p></div>
          </div>
        </div>
      </div>
    </section>
    {message && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</p>}
    <section className="mt-8 grid gap-4 md:grid-cols-3">{journey.map(({ icon: Icon, label, copy }, index) => <article key={label} className="surface-card group relative overflow-hidden p-5"><span className="absolute right-4 top-4 text-5xl font-bold tracking-tighter text-slate-100">0{index + 1}</span><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-cyan-700 transition group-hover:-translate-y-0.5 group-hover:bg-cyan-100"><Icon size={19} /></span><h2 className="mt-5 font-bold text-navy">{label} what to do</h2><p className="mt-2 max-w-xs text-sm leading-6 text-slate-600">{copy}</p></article>)}</section>
    <section className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
      <article className="surface-card p-6 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">What the demo includes</p><h2 className="mt-2 text-2xl font-bold tracking-tight text-navy">A complete, safe walkthrough</h2></div><Chip tone="cyan">About 2 minutes</Chip></div><div className="mt-6 grid gap-4 sm:grid-cols-3"><DemoFeature icon={UserRound} title="Customer" copy="Ask what is missing and upload the sample." /><DemoFeature icon={Hospital} title="Hospital" copy="Confirm that the sample packet is ready." /><DemoFeature icon={WalletCards} title="Review" copy="Record a clearly labelled simulated result." /></div></article>
      <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-6"><div className="flex items-center gap-2 font-bold text-amber-950"><CircleHelp size={18} /> Demo, not a real claim</div><p className="mt-3 text-sm leading-6 text-amber-900">The people, records, insurer decision, and payout are fictional. Role switches are for one local walkthrough; they are not secure accounts and no money moves.</p></aside>
    </section>
  </main><FloatingVoiceButton mode={mode} /></>;
}

function DemoFeature({ icon: Icon, title, copy }: { icon: React.ComponentType<{ size?: number; className?: string }>; title: string; copy: string }) { return <div className="rounded-2xl bg-slate-50 p-4"><Icon size={18} className="text-cyan-700" /><p className="mt-3 text-sm font-bold text-navy">{title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{copy}</p></div>; }

export function NewClaim() {
  const [step, setStep] = useState(1); const [language, setLanguage] = useState('en'); const { data: mode } = useFetch<Mode>('/api/mode'); const [files, setFiles] = useState<File[]>([]); const [working, setWorking] = useState(false); const [error, setError] = useState('');
  const [form, setForm] = useState({ route: 'REIMBURSEMENT', customerName: '', patientRelation: 'Self', policyHolderName: '', policyNumber: '', insurerName: '', productName: '', hospitalName: '', hospitalEmail: '', treatmentDescription: '', diagnosis: '', admissionDate: '', dischargeDate: '', icdCode: '', claimedAmountRupees: '' });
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function create() { setWorking(true); setError(''); try { const claim = await apiPost<CaseSummaryDto>('/api/claims', { ...form, claimedAmountRupees: Number(form.claimedAmountRupees) }); for (const file of files) { const fd = new FormData(); fd.append('file', file); fd.append('docType', guessType(file.name)); await apiPostForm(`/api/claims/${claim.id}/documents`, fd); } location.href = `/claims/${claim.id}`; } catch (e) { setError(errorMessage(e)); } finally { setWorking(false); } }
  return <><Header mode={mode} language={language} setLanguage={setLanguage} /><main className="mx-auto max-w-3xl px-4 py-8 sm:px-6"><Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-700"><ArrowLeft size={16} />Dashboard</Link><h1 className="mt-5 text-3xl font-semibold text-navy">New claim</h1><p className="mt-2 text-slate-600">You can leave unknown details blank. ClaimSaathi will not invent them.</p><div className="mt-6 flex gap-2">{['Route', 'Patient & policy', 'Hospital', 'Documents', 'Review'].map((name, index) => <div key={name} className={`h-2 flex-1 rounded-full ${step >= index + 1 ? 'bg-cyan-600' : 'bg-slate-200'}`} aria-label={`Step ${index + 1}: ${name}`} />)}</div><section className="mt-7 rounded-2xl border bg-white p-5 shadow-sm">{step === 1 && <><h2 className="font-semibold text-navy">How will this claim be paid?</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{[['REIMBURSEMENT', 'Reimbursement', 'You paid the hospital and seek repayment.'], ['CASHLESS', 'Cashless', 'The hospital coordinates authorisation with the insurer.']].map(([value, title, copy]) => <button key={value} onClick={() => update('route', value)} className={`rounded-xl border p-4 text-left ${form.route === value ? 'border-cyan-600 bg-cyan-50 ring-1 ring-cyan-600' : 'hover:bg-slate-50'}`}><span className="font-semibold text-navy">{title}</span><span className="mt-1 block text-sm text-slate-600">{copy}</span></button>)}</div></>}{step === 2 && <div className="grid gap-4 sm:grid-cols-2"><Field label="Customer name" value={form.customerName} onChange={(v) => update('customerName', v)} /><Field label="Patient relation" value={form.patientRelation} onChange={(v) => update('patientRelation', v)} /><Field label="Policy holder name" value={form.policyHolderName} onChange={(v) => update('policyHolderName', v)} /><Field label="Policy number" value={form.policyNumber} onChange={(v) => update('policyNumber', v)} /><Field label="Insurer name" value={form.insurerName} onChange={(v) => update('insurerName', v)} /><Field label="Policy / product" value={form.productName} onChange={(v) => update('productName', v)} /></div>}{step === 3 && <div className="grid gap-4 sm:grid-cols-2"><Field label="Hospital name" value={form.hospitalName} onChange={(v) => update('hospitalName', v)} /><Field label="Hospital email (optional)" value={form.hospitalEmail} onChange={(v) => update('hospitalEmail', v)} /><Field label="Admission date" type="date" value={form.admissionDate} onChange={(v) => update('admissionDate', v)} /><Field label="Discharge date" type="date" value={form.dischargeDate} onChange={(v) => update('dischargeDate', v)} /><Field label="Claimed amount (₹)" value={form.claimedAmountRupees} onChange={(v) => update('claimedAmountRupees', v)} /><Field label="Diagnosis (optional)" value={form.diagnosis} onChange={(v) => update('diagnosis', v)} /><label className="sm:col-span-2 text-sm font-medium text-navy">Treatment description<textarea value={form.treatmentDescription} onChange={(e) => update('treatmentDescription', e.target.value)} className="mt-1 min-h-24 w-full rounded-lg border p-3 font-normal" /></label></div>}{step === 4 && <><h2 className="font-semibold text-navy">Documents (optional for now)</h2><p className="mt-1 text-sm text-slate-600">PDF, TXT, PNG or JPG, up to 10 MB. Scanned files will be marked for manual transcription because OCR is not included.</p><input className="mt-4 block w-full text-sm" type="file" multiple accept=".pdf,.txt,.png,.jpg,.jpeg" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /><ul className="mt-3 space-y-2 text-sm text-slate-700">{files.map((file) => <li key={file.name} className="flex justify-between rounded bg-slate-50 p-2"><span>{file.name}</span><span>{Math.ceil(file.size / 1024)} KB</span></li>)}</ul></>}{step === 5 && <><h2 className="font-semibold text-navy">Review & create</h2><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><Info label="Route" value={form.route} /><Info label="Customer" value={form.customerName || 'Not provided'} /><Info label="Policy" value={form.policyNumber || 'Not provided'} /><Info label="Hospital" value={form.hospitalName || 'Not provided'} /><Info label="Amount" value={form.claimedAmountRupees ? `₹${form.claimedAmountRupees}` : 'Not provided'} /><Info label="Documents" value={`${files.length} queued`} /></dl><p className="mt-5 rounded-lg bg-cyan-50 p-3 text-xs leading-5 text-cyan-950">In connected mode, consent is requested only before a Sarvam feature sends the minimum required text or audio. This claim workflow always uses a simulated insurer.</p></>}{error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}<div className="mt-6 flex justify-between border-t pt-5">{step > 1 ? <Button className="bg-white text-navy ring-1 ring-slate-200 hover:bg-slate-50" onClick={() => setStep(step - 1)}>Back</Button> : <span />}{step < 5 ? <Button onClick={() => setStep(step + 1)}>Continue</Button> : <Button disabled={working} onClick={() => void create()}>{working ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}Create claim</Button>}</div></section></main><FloatingVoiceButton mode={mode} /></>;
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="text-sm font-medium text-navy">{label}<input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border p-2.5 font-normal" /></label>; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 font-medium text-slate-800">{value}</dd></div>; }
function guessType(name: string): string { const value = name.toLowerCase(); if (value.includes('discharge')) return 'DISCHARGE_SUMMARY'; if (value.includes('bill')) return 'ITEMISED_BILL'; if (value.includes('receipt')) return 'PAYMENT_RECEIPT'; if (value.includes('policy')) return 'POLICY'; return 'OTHER'; }

type DemoRole = 'customer' | 'hospital' | 'reviewer';

function speakDemo(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-IN';
  window.speechSynthesis.speak(utterance);
}

function DemoAccounts({ caseId, data, reload }: { caseId: string; data: CaseDetails; reload: () => Promise<void> }) {
  const { data: mode, reload: reloadMode } = useFetch<Mode>('/api/mode');
  const [role, setRole] = useState<DemoRole>('customer');
  const [question, setQuestion] = useState('I need my claim. What document do I need to add?');
  const [answerText, setAnswerText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [voiceMessage, setVoiceMessage] = useState('');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  usePolling(reload, 4000, true);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get('role');
    if (selected === 'customer' || selected === 'hospital' || selected === 'reviewer') setRole(selected);
  }, []);

  const eventTypes = new Set(data.events.map((item) => item.type));
  const hasDischarge = !data.readiness.missing.includes('DISCHARGE_SUMMARY');
  const packetShared = eventTypes.has('DEMO_PACKET_SHARED');
  const hospitalVerified = eventTypes.has('DEMO_HOSPITAL_VERIFIED');
  const consultantReviewed = eventTypes.has('DEMO_CONSULTANT_REVIEWED');
  const isCredited = data.case.state === 'SETTLED';

  function switchRole(selected: DemoRole) {
    setRole(selected);
    const url = new URL(window.location.href);
    url.searchParams.set('demo', '1');
    url.searchParams.set('role', selected);
    window.history.replaceState(null, '', url);
    setMessage('');
  }

  async function speakResponse(text: string) {
    setVoiceMessage('');
    audioRef.current?.pause();
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    if (mode?.aiMode === 'sarvam' && mode.capabilities.tts) {
      try {
        if (mode.consent.TEXT_TO_SPEECH?.status !== 'GRANTED') {
          await apiPost('/api/consent', { purpose: 'TEXT_TO_SPEECH', grant: true });
        }
        const result = await apiPost<{ source: string; audioBase64?: string; transcript?: string; fallbackReason?: string }>('/api/sarvam/tts', { text, lang: 'en-IN' });
        if (result.source === 'sarvam' && result.audioBase64) {
          const bytes = Uint8Array.from(atob(result.audioBase64), (character) => character.charCodeAt(0));
          const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
          audioUrlRef.current = url;
          const audio = new Audio(url);
          audioRef.current = audio;
          await audio.play();
          setVoiceMessage('Speaking reply with Sarvam AI voice (bulbul:v4-flash).');
          audio.onended = () => {
            URL.revokeObjectURL(url);
            if (audioUrlRef.current === url) audioUrlRef.current = null;
          };
          return;
        }
        setVoiceMessage(result.fallbackReason ? `Sarvam voice unavailable: ${result.fallbackReason} Using device voice.` : 'Sarvam voice unavailable. Using device voice.');
      } catch (cause) {
        setVoiceMessage(`${errorMessage(cause)} Using device voice.`);
      }
    } else {
      setVoiceMessage('Speaking with device voice.');
    }

    speakDemo(text);
  }

  async function startRecording() {
    setVoiceMessage('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceMessage('Microphone access is not supported in this browser.');
      return;
    }
    try {
      await apiPost('/api/consent', { purpose: 'VOICE_TRANSCRIPTION', grant: true });
      await apiPost('/api/consent', { purpose: 'TEXT_TO_SPEECH', grant: true });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const media = new MediaRecorder(stream);
      recorderRef.current = media;
      media.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      media.onstop = () => void finishRecording();
      media.start();
      setRecording(true);
      setVoiceMessage('Listening to your microphone… Speak your question, then click Stop Recording.');
    } catch (cause) {
      setVoiceMessage(errorMessage(cause));
      setRecording(false);
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setRecording(false);
  }

  async function finishRecording() {
    setRecording(false);
    const media = recorderRef.current;
    media?.stream?.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunksRef.current, { type: media?.mimeType || 'audio/webm' });
    if (!blob.size) {
      setVoiceMessage('No audio was captured. Please speak into your microphone and try again.');
      return;
    }
    setTranscribing(true);
    setVoiceMessage('Transcribing your speech with Sarvam AI (saaras:v4)…');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(new Error('Audio read error'));
        reader.readAsDataURL(blob);
      });
      const result = await apiPost<{ transcript: string }>('/api/sarvam/transcribe', {
        audioBase64: base64,
        mime: blob.type || 'audio/webm',
        language: 'en-IN'
      });
      if (result.transcript) {
        setQuestion(result.transcript);
        setVoiceMessage(`Recognized: "${result.transcript}". Querying claim assistant…`);
        await askForClaim(result.transcript);
      } else {
        setVoiceMessage('Sarvam AI could not detect speech. Please try speaking closer to the microphone.');
      }
    } catch (cause) {
      setVoiceMessage(errorMessage(cause));
    } finally {
      setTranscribing(false);
    }
  }

  async function enableSarvamVoice() {
    setBusy('voice-consent');
    try {
      await apiPost('/api/consent', { purpose: 'TEXT_TO_SPEECH', grant: true });
      await reloadMode();
      setVoiceMessage('Sarvam AI voice enabled for this browser session.');
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy('');
    }
  }

  async function askForClaim(overrideQuestion?: string) {
    const q = overrideQuestion ?? question;
    if (!q.trim()) return;
    setBusy('ask');
    setMessage('');
    try {
      const result = await apiGet<{ answer: string }>(`/api/claims/${caseId}/assistant?q=${encodeURIComponent(q)}&lang=en`);
      setAnswerText(result.answer);
      await speakResponse(result.answer);
      await reload();
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy('');
    }
  }

  async function uploadDocument(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setMessage('Choose the sample discharge summary you downloaded.');
      return;
    }
    setBusy('upload');
    setMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('docType', 'DISCHARGE_SUMMARY');
      await apiPostForm(`/api/claims/${caseId}/documents`, form);
      setFile(null);
      await reload();
      const response = 'The discharge summary is uploaded. All four required document types are now being checked.';
      setAnswerText(response);
      setMessage(response);
      await speakResponse(response);
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy('');
    }
  }

  async function advance(step: string, success: string) {
    setBusy(step);
    setMessage('');
    try {
      await apiPost('/api/demo/role-step', { caseId, step });
      await reload();
      setMessage(success);
      await speakResponse(success);
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy('');
    }
  }

  const notifications = [
    { done: hasDischarge, text: hasDischarge ? 'Missing discharge summary received and document checks refreshed.' : 'Customer action needed: add the missing discharge summary.' },
    { done: packetShared, text: packetShared ? 'Demo packet shared with the hospital and payout-review screens.' : 'Waiting for the customer to share the completed demo packet.' },
    { done: hospitalVerified, text: hospitalVerified ? 'Hospital demo account confirmed receipt of the sample document.' : 'Hospital demo review is waiting.' },
    { done: consultantReviewed, text: consultantReviewed ? 'Packet forwarded to the simulated insurer; no real insurer was contacted.' : 'Payout consultant demo review is waiting.' },
    { done: isCredited, text: isCredited ? 'Fictional payout result recorded. No payment was made.' : 'No payout result has been recorded.' },
  ];

  const demoSteps = [
    { label: 'Ask', complete: Boolean(answerText), detail: 'Understand the blocker' },
    { label: 'Add', complete: hasDischarge, detail: 'Add the sample document' },
    { label: 'Review', complete: consultantReviewed, detail: 'Complete the role checks' },
    { label: 'Result', complete: isCredited, detail: 'View the simulated outcome' },
  ];
  const currentStep = isCredited ? 4 : consultantReviewed ? 4 : hospitalVerified ? 3 : hasDischarge ? 3 : answerText ? 2 : 1;
  const roleMeta: Record<DemoRole, { title: string; copy: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
    customer: { title: 'Customer', copy: 'Ask, add the missing sample, then share the packet.', icon: UserRound },
    hospital: { title: 'Hospital verifier', copy: 'Confirm the sample packet is ready for review.', icon: Hospital },
    reviewer: { title: 'Human claims reviewer', copy: 'Review the packet and explicitly approve its simulated submission.', icon: WalletCards },
  };
  const CurrentRoleIcon = roleMeta[role].icon;

  return <><Header mode={mode} language="en" setLanguage={() => undefined} showLanguage={false} /><main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
    <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-700 transition hover:text-cyan-900"><ArrowLeft size={16} />Exit demo</Link><Chip tone="cyan">Fictional walkthrough · {currentStep} of 4</Chip></div>
    <section className="mt-5 overflow-hidden rounded-3xl bg-gradient-to-br from-navy to-[#124665] px-6 py-7 text-white shadow-xl shadow-navy/10 sm:px-8"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">One claim · {data.case.reference}</p><h1 className="mt-2 text-3xl font-bold tracking-tight">{data.case.customerName}&apos;s claim journey</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">A clear, shared walkthrough from missing document to a safely simulated result.</p></div><div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm"><p className="text-xs font-semibold uppercase tracking-wide text-cyan-100">Document readiness</p><p className="mt-1 text-lg font-bold">{data.readiness.validRequiredCount} of {data.readiness.totalRequiredCount} checked</p></div></div>
      <ol className="mt-7 grid gap-3 sm:grid-cols-4">{demoSteps.map((step, index) => <li key={step.label} className={`rounded-xl border px-3 py-3 ${step.complete ? 'border-emerald-300/30 bg-emerald-400/10' : currentStep === index + 1 ? 'border-cyan-300/50 bg-white/10' : 'border-white/10 bg-black/10'}`}><div className="flex items-center gap-2"><span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${step.complete ? 'bg-emerald-400 text-emerald-950' : currentStep === index + 1 ? 'bg-cyan-300 text-navy' : 'bg-white/10 text-slate-300'}`}>{step.complete ? '✓' : index + 1}</span><span className="text-sm font-semibold">{step.label}</span></div><p className="mt-2 text-xs leading-4 text-slate-300">{step.detail}</p></li>)}</ol>
    </section>
    <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Fictional role-play only.</strong> Customer, hospital verifier, and human claims reviewer share one local demo claim; they are not secure separate accounts. The reviewer must explicitly approve the simulated submission. No real hospital, insurer, payment provider, or bank is connected.</section>
    <div className="mt-5 grid gap-5 lg:grid-cols-[.72fr_1.28fr]">
      <aside className="surface-card h-fit p-4" aria-label="Demo accounts"><p className="px-2 pb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Choose a demo role</p>{([
        ['customer', 'Customer', UserRound],
        ['hospital', 'Hospital verifier', Hospital],
        ['reviewer', 'Human claims reviewer', WalletCards],
      ] as const).map(([id, label, Icon]) => <button key={id} aria-pressed={role === id} onClick={() => switchRole(id)} className={`mb-2 flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${role === id ? 'border-cyan-300 bg-cyan-50 text-cyan-950 shadow-sm' : 'border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50'}`}><span className={`grid h-9 w-9 place-items-center rounded-lg ${role === id ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Icon size={17} /></span><span><span className="block text-sm font-bold">{label}</span><span className="block text-xs text-slate-500">{role === id ? 'Current screen' : 'Switch role'}</span></span></button>)} )</aside>
      <section className="surface-card overflow-hidden"><div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-100 text-cyan-800"><CurrentRoleIcon size={19} /></span><div><h2 className="font-bold text-navy">{roleMeta[role].title} workspace</h2><p className="mt-0.5 text-sm text-slate-600">{roleMeta[role].copy}</p></div></div></div><div className="p-5 sm:p-6">
        {role === 'customer' && <>
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-navy">Start with one question</p>
                <p className="mt-0.5 text-sm leading-6 text-slate-600">Ask what is holding up the fictional claim. The answer tells you the next safe step.</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300 bg-white px-2.5 py-1 text-xs font-semibold text-cyan-900 shadow-sm">
                <Mic size={13} className="text-cyan-600" /> Sarvam Voice Active
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                aria-label="Your claim question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask about this claim or click Speak (Voice)..."
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm"
              />
              <button
                type="button"
                aria-label={recording ? 'Stop voice recording' : 'Speak your question with Sarvam AI'}
                onClick={() => recording ? stopRecording() : void startRecording()}
                disabled={busy !== '' || transcribing}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition shadow-sm ${
                  recording
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 animate-pulse'
                    : 'border-2 border-cyan-500 bg-cyan-600 text-white hover:bg-cyan-700'
                }`}
              >
                {transcribing ? (
                  <><Loader2 className="animate-spin text-white" size={17} /> Transcribing…</>
                ) : recording ? (
                  <><Pause size={17} /> Stop Recording</>
                ) : (
                  <><Mic size={17} /> Speak (Voice)</>
                )}
              </button>
              <Button disabled={busy !== '' || recording || transcribing} onClick={() => void askForClaim()}>
                {busy === 'ask' ? <><Loader2 className="animate-spin" size={16} />Checking…</> : <><CircleHelp size={16} />Ask about my claim</>}
              </Button>
            </div>
            {recording && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                <span className="h-2.5 w-2.5 rounded-full bg-red-600 animate-ping" />
                Listening to your microphone… Speak your question now, then click &quot;Stop Recording&quot;.
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="self-center font-medium text-slate-500">Quick voice queries:</span>
              {[
                'Which document is missing from my claim?',
                'Why is my claim delayed?',
                'When will I receive my cashless approval?'
              ].map((queryText) => (
                <button
                  key={queryText}
                  type="button"
                  onClick={() => {
                    setQuestion(queryText);
                    void askForClaim(queryText);
                  }}
                  className="rounded-lg bg-white px-2.5 py-1 text-slate-700 border border-slate-200 hover:bg-slate-50 transition font-medium"
                >
                  {queryText}
                </button>
              ))}
            </div>
          </div>
          {answerText && (
            <div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50 p-4 text-sm leading-6 text-cyan-950">
              <div className="flex items-start justify-between gap-3">
                <p className="flex-1">{answerText}</p>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-cyan-900 shadow-sm hover:bg-cyan-100 transition"
                  onClick={() => void speakResponse(answerText)}
                >
                  <Headphones size={15} className="text-cyan-700" /> Listen with Sarvam AI
                </button>
              </div>
            </div>
          )}
          {!hasDischarge && <><div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={18} /><div><p className="font-bold text-amber-950">One document is missing: discharge summary</p><p className="mt-1 text-sm leading-6 text-amber-900">The policy, hospital bill, and payment receipt are already in this fictional claim.</p><a className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-100" href={`/api/claims/${caseId}/sample-discharge`} download><Download size={15} className="mr-1.5" />Download the sample discharge summary</a></div></div></div>
          <form onSubmit={(event) => void uploadDocument(event)} className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4"><label className="block text-sm font-bold text-navy" htmlFor="demo-discharge">Upload the missing document</label><p className="mt-1 text-xs text-slate-500">Use the sample you just downloaded or another fictional PDF.</p><input id="demo-discharge" className="mt-3 block w-full text-sm" type="file" accept=".pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><Button className="mt-4 w-full" disabled={busy !== ''}>{busy === 'upload' ? <><Loader2 className="animate-spin" size={16} />Uploading and checking…</> : <><Upload size={16} />Upload discharge summary</>}</Button></form></>}
          {hasDischarge && !packetShared && <div className="mt-5 rounded-xl border border-cyan-200 bg-cyan-50 p-4"><p className="text-sm font-bold text-navy">Your demo packet is ready</p><p className="mt-1 text-sm text-slate-600">Share it with the hospital verifier and human claims reviewer.</p><Button className="mt-4 w-full" disabled={busy !== '' || data.readiness.failedChecks.length > 0} onClick={() => void advance('SHARE_PACKET', 'The fictional packet is ready for the hospital verifier and human claims reviewer.')}><ArrowRight size={16} />Share packet with demo reviewers</Button></div>}
          {isCredited && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Simulated result · no real payment</p><p className="mt-1 text-2xl font-bold text-navy">{formatINR(data.case.settledAmountPaise ?? 0)} shown as credited</p><p className="mt-2 text-sm text-slate-700">{data.settlement.summary}</p></div>}
        </>}

        {role === 'hospital' && <><p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-800">Notification: {packetShared ? 'A demo packet is ready for review.' : 'Waiting for the customer to upload the document and share the packet.'}</p>{packetShared && !hospitalVerified && <Button className="mt-4 w-full" disabled={busy !== ''} onClick={() => void advance('HOSPITAL_VERIFY', 'Hospital demo verification complete. The human claims reviewer has been notified.')}>{busy === 'HOSPITAL_VERIFY' ? <><Loader2 className="animate-spin" size={16} />Saving verification…</> : <><CheckCircle2 size={16} />Verify sample document received</>}</Button>}{hospitalVerified && <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-900">Verified in this demo. No real hospital system was contacted.</p>}</>}

        {role === 'reviewer' && <><p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-800">Notification: {hospitalVerified ? 'Hospital verification is complete. You can now review and approve the packet for a simulated insurer submission.' : 'Waiting for the hospital verifier to complete the document check.'}</p>{hospitalVerified && !consultantReviewed && <Button className="mt-4 w-full" disabled={busy !== ''} onClick={() => void advance('CONSULTANT_SUBMIT', 'Human review recorded. The packet was approved and sent to the simulated insurer; this is not a real claim approval.')}>{busy === 'CONSULTANT_SUBMIT' ? <><Loader2 className="animate-spin" size={16} />Approving simulated submission…</> : <><ShieldCheck size={16} />Human review: approve and send to simulated insurer</>}</Button>}{consultantReviewed && !isCredited && <><p className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50 p-4 text-sm text-cyan-950">Simulated insurer acknowledgement received after human review. It is not a real decision.</p><Button className="mt-3 w-full" disabled={busy !== ''} onClick={() => void advance('PAYOUT_CONFIRM', 'The fictional insurer approval and payout result are shown. No real money moved.')}>{busy === 'PAYOUT_CONFIRM' ? <><Loader2 className="animate-spin" size={16} />Recording demo result…</> : <><CheckCircle2 size={16} />Show simulated approval and payout</>}</Button></>}{isCredited && <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-900">Demo payout result recorded only. No real transfer occurred.</p>}</>}
      </div></section>
    </div>
    {message && <div role="status" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-100 bg-cyan-50 p-4 text-sm text-cyan-950"><span>{message}</span><button className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-bold text-cyan-900 shadow-sm" onClick={() => void speakResponse(message)}>Listen to notification</button></div>}
    {voiceMessage && <p role="status" className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50 p-3 text-sm text-cyan-950">{voiceMessage}</p>}
    {mode?.aiMode === 'sarvam' && mode.capabilities.tts && mode.consent.TEXT_TO_SPEECH?.status !== 'GRANTED' && <section className="mt-5 rounded-2xl border border-cyan-200 bg-cyan-50 p-5"><h2 className="font-bold text-navy">Sarvam AI voice</h2><p className="mt-1 text-sm leading-6 text-slate-700">Optional: send only the response text to Sarvam AI to create spoken audio. Until enabled, replies use your device voice.</p><Button className="mt-3" disabled={busy !== ''} onClick={() => void enableSarvamVoice()}>{busy === 'voice-consent' ? 'Enabling…' : 'Enable Sarvam voice'}</Button></section>}
    <section className="surface-card mt-5 p-5"><h2 className="font-bold text-navy">Live demo progress</h2><ol className="mt-4 grid gap-3 md:grid-cols-5">{notifications.map((item, index) => <li key={item.text} className={`rounded-xl p-3 text-sm ${item.done ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50 text-slate-700'}`}><span className={`mb-2 grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${item.done ? 'bg-emerald-200' : 'bg-slate-200 text-slate-600'}`}>{item.done ? '✓' : index + 1}</span>{item.text}</li>)}</ol><p className="mt-4 text-xs text-slate-500">Demo notifications update when this shared local claim is refreshed; they are not sent as real SMS, email, or push alerts.</p></section>
  </main><FloatingVoiceButton mode={mode} /></>;
}

export function Workspace({ caseId }: { caseId: string }) {
  const { data, loading, error, reload } = useFetch<CaseDetails>(`/api/claims/${caseId}`, [caseId]); const { data: mode } = useFetch<Mode>('/api/mode');
  const [language, setLanguage] = useState('en'); const [tab, setTab] = useState('overview'); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(''); const [evidenceId, setEvidenceId] = useState<string | null>(null); const [activityOpen, setActivityOpen] = useState(false); const [walkthrough, setWalkthrough] = useState(false); const [journeyAsked, setJourneyAsked] = useState(false); const [demoPortal, setDemoPortal] = useState(false);
  useEffect(() => { const query = new URLSearchParams(window.location.search); setWalkthrough(query.get('walkthrough') === '1'); setDemoPortal(query.get('demo') === '1'); }, []);
  async function analyse() { setBusy('analyse'); try { await apiPost(`/api/claims/${caseId}/analyze`); setMessage('Analysis complete. Specialist activity is saved below.'); await reload(); } catch (e) { setMessage(errorMessage(e)); } finally { setBusy(''); } }
  async function demo(action: 'advance' | 'QUERY' | 'STATUS_UPDATE' | 'PARTIAL_SETTLEMENT' | 'REJECTION' | 'DEMO_CREDIT', minutes?: number) { setBusy(action); try { if (action === 'advance') await apiPost('/api/demo/advance-time', { minutes }); else await apiPost('/api/demo/trigger', { caseId, kind: action }); await reload(); setMessage(action === 'advance' ? `Simulated time advanced by ${minutes} minutes.` : action === 'DEMO_CREDIT' ? 'The fictional demo payment result is recorded. No real money moved.' : 'Simulated insurer update recorded.'); } catch (e) { setMessage(errorMessage(e)); } finally { setBusy(''); } }
  async function addSampleDocument() { setBusy('sample-document'); try { await apiPost('/api/demo/add-sample-document', { caseId }); await reload(); setMessage('Fictional discharge summary added and document checks rerun.'); } catch (e) { setMessage(errorMessage(e)); } finally { setBusy(''); } }
  async function approve(action: OutboundActionDto) { setBusy(action.id); try { await apiPost(`/api/claims/${caseId}/actions/${action.id}/approve`); setMessage('Action approved and sent through the simulated channel.'); await reload(); } catch (e) { setMessage(errorMessage(e)); } finally { setBusy(''); } }
  async function cancel(action: OutboundActionDto) { setBusy(action.id); try { await apiPost(`/api/claims/${caseId}/actions/${action.id}/cancel`); await reload(); } catch (e) { setMessage(errorMessage(e)); } finally { setBusy(''); } }
  if (loading && !data) return <><Header mode={mode} language={language} setLanguage={setLanguage} /><main className="mx-auto max-w-7xl p-8 text-slate-600">Loading claim workspace…</main></>;
  if (!data) return <><Header mode={mode} language={language} setLanguage={setLanguage} /><main className="mx-auto max-w-7xl p-8"><p className="rounded-xl bg-red-50 p-5 text-red-800">{error ?? 'Claim unavailable.'}</p></main></>;
  if (demoPortal && data.case.scenario === 'SCENARIO_E_END_TO_END') return <DemoAccounts caseId={caseId} data={data} reload={reload} />;
  const selectedEvidence = data.evidence.find((item) => item.id === evidenceId); const c = data.case;
  const isEndToEnd = walkthrough && c.scenario === 'SCENARIO_E_END_TO_END';
  const hasDischargeSummary = !data.readiness.missing.includes('DISCHARGE_SUMMARY');
  const isSubmitted = c.state === 'SUBMITTED';
  const isCredited = c.state === 'SETTLED';
  return <><Header mode={mode} language={language} setLanguage={setLanguage} /><main className="mx-auto max-w-7xl px-4 py-7 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-3"><Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-700"><ArrowLeft size={16} />Dashboard</Link><div className="flex gap-2"><a className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-navy" href={`/api/claims/${caseId}/export?kind=summary`}><Download className="mr-1 inline" size={15} />Summary</a><Button className="bg-white text-navy ring-1 ring-slate-200 hover:bg-slate-50" onClick={() => setActivityOpen(true)}><Activity size={16} />Agent activity</Button></div></div><section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold text-navy">{c.reference}</h1><Chip tone={stateTone(c.state)}>{c.state.replaceAll('_', ' ')}</Chip></div><p className="mt-1 text-sm text-slate-500">{c.customerName} · {c.route} · Simulated time {formatIST(data.simulatedNow)}</p></div><Button disabled={busy === 'analyse'} onClick={() => void analyse()}>{busy === 'analyse' ? <Loader2 className="animate-spin" size={16} /> : <Bot size={16} />}Run analysis</Button></div><div className="mt-5 grid gap-3 border-t pt-5 md:grid-cols-4"><Info label="Current blocker" value={c.currentBlocker ?? 'No blocker recorded'} /><Info label="Next best action" value={c.nextBestAction ?? 'Run analysis'} /><Info label="Responsible" value={c.responsibleParty ?? 'Not assigned'} /><Info label="Claimed / settled" value={`${formatINR(c.claimedAmountPaise)} / ${c.settledAmountPaise ? formatINR(c.settledAmountPaise) : 'Not settled'}`} /></div></section>{isEndToEnd && <section className="mt-5 rounded-2xl border border-cyan-200 bg-cyan-50 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><Chip tone="cyan">Fictional end-to-end walkthrough</Chip><h2 className="mt-2 text-lg font-semibold text-navy">Follow Priya’s claim from missing document to simulated credit</h2><p className="mt-1 text-sm text-slate-700">Every insurer response and payment below is synthetic. No real account or payment network is connected.</p></div>{isCredited && <Chip tone="green">SIMULATED CREDIT</Chip>}</div><ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['1', 'Ask why the claim is pending', journeyAsked], ['2', 'Add the missing discharge summary', hasDischargeSummary], ['3', 'Review and submit the packet', isSubmitted || isCredited], ['4', 'See the simulated credit', isCredited]].map(([number, label, complete]) => <li key={String(number)} className={`rounded-xl border p-3 text-sm ${complete ? 'border-emerald-200 bg-white text-emerald-900' : 'border-cyan-100 bg-white text-slate-700'}`}><span className="font-semibold">{complete ? '✓ ' : `${number}. `}{label}</span></li>)}</ol><div className="mt-4 flex flex-wrap gap-2">{!journeyAsked && <a href="#assistant" className="inline-flex min-h-10 items-center rounded-lg border border-cyan-700 px-4 py-2 text-sm font-semibold text-cyan-900">Ask about the missing document</a>}{!hasDischargeSummary && <Button disabled={Boolean(busy)} onClick={() => setTab('documents')}>Open documents</Button>}{hasDischargeSummary && !isSubmitted && !isCredited && <Button disabled={Boolean(busy)} onClick={() => setTab('actions')}>Review claim packet</Button>}{isSubmitted && <Button disabled={Boolean(busy)} onClick={() => void demo('DEMO_CREDIT')}>{busy === 'DEMO_CREDIT' ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}Simulate approval and credit</Button>}</div>{!hasDischargeSummary && <p className="mt-3 text-xs text-slate-600">The current blocker is the missing discharge summary. Open Documents to add the clearly labelled sample or upload your own synthetic file.</p>}{isCredited && <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Demo result · no real payment made</p><p className="mt-1 text-2xl font-bold text-navy">{formatINR(c.settledAmountPaise ?? 0)} shown as credited</p><p className="mt-1 text-sm text-slate-700">{data.settlement.summary}</p><p className="mt-2 text-xs text-slate-600">This is a fictional simulation only. No bank account was accessed and no money moved.</p></div>}</section>}{error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}{message && <p role="status" className="mt-4 rounded-lg bg-cyan-50 p-3 text-sm text-cyan-950">{message}</p>}<nav className="mt-6 flex gap-1 overflow-x-auto rounded-xl border bg-white p-1">{[['overview', 'Overview'], ['documents', 'Documents'], ['policy', 'Policy Evidence'], ['timeline', 'Timeline'], ['actions', 'Actions & Approvals'], ['settlement', 'Settlement / Appeal']].map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${tab === id ? 'bg-navy text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</button>)}</nav><div className="mt-5">{tab === 'overview' && <Overview data={data} />}{tab === 'documents' && <Documents caseId={caseId} data={data} reload={reload} notify={setMessage} walkthrough={isEndToEnd} addSampleDocument={addSampleDocument} sampleWorking={busy === 'sample-document'} />}{tab === 'policy' && <PolicyEvidence clauses={data.clauses} mode={mode} onEvidence={setEvidenceId} />}{tab === 'timeline' && <Timeline caseId={caseId} simulatedNow={data.simulatedNow} />}{tab === 'actions' && <Actions caseId={caseId} actions={data.actions} busy={busy} approve={approve} cancel={cancel} reload={reload} notify={setMessage} />}{tab === 'settlement' && <Settlement caseId={caseId} data={data} reload={reload} notify={setMessage} onEvidence={setEvidenceId} />}</div><Assistant caseId={caseId} scenario={c.scenario} language={language as 'en' | 'hi'} mode={mode} onEvidence={setEvidenceId} reload={reload} guided={isEndToEnd} onGuidedQuestionAnswered={() => setJourneyAsked(true)} /><section className="mt-6 rounded-2xl border border-dashed border-cyan-300 bg-cyan-50/60 p-5"><div className="flex items-center gap-2"><Clock3 size={18} className="text-cyan-800" /><h2 className="font-semibold text-navy">Demo control panel</h2><Chip tone="amber">Separate from customer actions</Chip></div><p className="mt-1 text-sm text-slate-600">Insurer interactions here are simulated. The cashless timer is an unverified, configurable demonstration assumption—not a legal entitlement.</p><div className="mt-4 flex flex-wrap gap-2"><Button className="bg-cyan-700" disabled={Boolean(busy)} onClick={() => void demo('advance', 30)}>+30 min</Button><Button className="bg-cyan-700" disabled={Boolean(busy)} onClick={() => void demo('advance', 120)}>+2 h</Button><Button className="bg-cyan-700" disabled={Boolean(busy)} onClick={() => void demo('QUERY')}>Trigger document query</Button><Button className="bg-cyan-700" disabled={Boolean(busy)} onClick={() => void demo('STATUS_UPDATE')}>Trigger status update</Button>{c.scenario === 'SCENARIO_C_PARTIAL' && <Button className="bg-cyan-700" disabled={Boolean(busy)} onClick={() => void demo('PARTIAL_SETTLEMENT')}>Trigger partial settlement</Button>}{c.scenario === 'SCENARIO_C_REJECTION' && <Button className="bg-cyan-700" disabled={Boolean(busy)} onClick={() => void demo('REJECTION')}>Trigger rejection</Button>}<a href={`/api/claims/${caseId}/export?kind=packet`} className="inline-flex items-center gap-2 rounded-lg border border-cyan-300 bg-white px-4 py-2 text-sm font-semibold text-cyan-900"><Download size={16} />Claim packet</a></div></section></main>{activityOpen && <ActivityDrawer caseId={caseId} close={() => setActivityOpen(false)} onEvidence={setEvidenceId} />}{selectedEvidence && <EvidenceModal item={selectedEvidence} close={() => setEvidenceId(null)} />}<FloatingVoiceButton mode={mode} /></>;
}

function Overview({ data }: { data: CaseDetails }) { const r = data.readiness; return <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold text-navy">Document readiness</h2><div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-600" style={{ width: `${r.completenessPct}%` }} /></div><div className="mt-3 flex items-center justify-between"><p className="font-semibold text-navy">{r.validRequiredCount} of {r.totalRequiredCount} required document types verified</p><Chip tone={r.completenessPct === 100 ? 'green' : 'amber'}>{r.completenessPct}%</Chip></div><p className="mt-2 text-xs text-slate-500">{r.note}</p>{r.failedChecks.length > 0 && <ul className="mt-5 space-y-2">{r.failedChecks.map((check) => <li key={check.id} className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{check.message}</li>)}</ul>}</section><section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold text-navy">Open tasks</h2>{data.tasks.length ? <ul className="mt-3 space-y-3">{data.tasks.map((task) => <li key={task.id} className="rounded-lg bg-slate-50 p-3"><p className="text-sm font-medium text-slate-800">{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.responsibleParty} · {task.status}</p></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">No open tasks right now.</p>}<p className="mt-6 rounded-lg bg-cyan-50 p-3 text-xs leading-5 text-cyan-950">The app does not send anything to an insurer without an explicit approval. A saved draft is not sent.</p></section></div>; }

function Documents({ caseId, data, reload, notify, walkthrough = false, addSampleDocument, sampleWorking = false }: { caseId: string; data: CaseDetails; reload: () => Promise<void>; notify: (value: string) => void; walkthrough?: boolean; addSampleDocument?: () => Promise<void>; sampleWorking?: boolean }) {
  const [file, setFile] = useState<File | null>(null); const [docType, setDocType] = useState('DISCHARGE_SUMMARY'); const [working, setWorking] = useState(false); const [openDoc, setOpenDoc] = useState<string | null>(null); const [text, setText] = useState(''); const [fields, setFields] = useState<Record<string, string>>({});
  async function upload(event: FormEvent) { event.preventDefault(); if (!file) return notify('Choose a document first.'); setWorking(true); try { const fd = new FormData(); fd.append('file', file); fd.append('docType', docType); await apiPostForm(`/api/claims/${caseId}/documents`, fd); await reload(); notify('Document uploaded. Agent checks have been refreshed.'); setFile(null); } catch (e) { notify(errorMessage(e)); } finally { setWorking(false); } }
  async function inspect(doc: DocumentDto) { setOpenDoc(doc.id); const result = await apiGet<{ text: string }>(`/api/claims/${caseId}/documents/${doc.id}/text`); setText(result.text); setFields(Object.fromEntries(doc.fields.map((f) => [f.fieldKey, f.value]))); }
  async function save(docId: string) { try { await apiPatch(`/api/claims/${caseId}/documents/${docId}/fields`, { fields }); await reload(); notify('Manual corrections saved and readiness refreshed.'); } catch (e) { notify(errorMessage(e)); } }
  return <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><form onSubmit={upload} className="h-fit rounded-2xl border bg-white p-5"><h2 className="font-semibold text-navy">Upload a document</h2><p className="mt-1 text-sm text-slate-600">PDF, TXT, PNG or JPG · max 10 MB.</p><label className="mt-4 block text-sm font-medium text-navy">Document type<select value={docType} onChange={(e) => setDocType(e.target.value)} className="mt-1 w-full rounded-lg border p-2.5">{DOC_TYPES.map((value) => <option key={value} value={value}>{DOC_TYPE_LABELS[value]}</option>)}</select></label><input className="mt-4 block w-full text-sm" type="file" accept=".pdf,.txt,.png,.jpg,.jpeg" onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)} /><Button className="mt-4 w-full" disabled={working}>{working ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}Upload and analyse</Button>{walkthrough && addSampleDocument && <button type="button" disabled={sampleWorking} onClick={() => void addSampleDocument()} className="mt-3 w-full rounded-lg border border-cyan-700 px-3 py-2 text-sm font-semibold text-cyan-900 disabled:opacity-50">{sampleWorking ? 'Adding sample and checking…' : 'Add fictional discharge summary sample'}</button>}</form><section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold text-navy">Documents</h2><div className="mt-4 space-y-3">{data.documents.map((doc) => <article key={doc.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium text-navy">{doc.originalName}</p><p className="mt-1 text-xs text-slate-500">{DOC_TYPE_LABELS[doc.docType as keyof typeof DOC_TYPE_LABELS] ?? doc.docType} · {doc.extractionStatus.replaceAll('_', ' ')}</p></div><div className="flex gap-2"><a href={`/api/claims/${caseId}/documents/${doc.id}/download`} className="rounded-md border px-2 py-1 text-xs font-semibold text-cyan-700">Download</a><button onClick={() => void inspect(doc)} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-navy">Inspect</button></div></div>{doc.provenanceNote && <p className="mt-3 text-xs text-slate-500">{doc.provenanceNote}</p>}</article>)}</div>{openDoc && <div className="mt-4 rounded-xl border bg-slate-50 p-4"><div className="flex justify-between"><h3 className="font-semibold text-navy">Extracted text & corrections</h3><button onClick={() => setOpenDoc(null)}><X size={18} /></button></div><pre className="document-text mt-3 max-h-52 overflow-auto rounded bg-white p-3 text-xs text-slate-700">{text || 'Manual transcription required — text extraction unavailable.'}</pre><div className="mt-4 grid gap-3 sm:grid-cols-2">{Object.entries(fields).map(([key, value]) => <label key={key} className="text-xs font-medium text-slate-600">{key}<input value={value} onChange={(e) => setFields((current) => ({ ...current, [key]: e.target.value }))} className="mt-1 w-full rounded border p-2 text-sm" /></label>)}</div><label className="mt-3 block text-xs font-medium text-slate-600">Manual transcription (for scanned/image documents)<textarea value={fields.manualText ?? ''} onChange={(e) => setFields((current) => ({ ...current, manualText: e.target.value }))} className="mt-1 min-h-20 w-full rounded border p-2 text-sm" /></label><Button className="mt-3" onClick={() => void save(openDoc)}>Save corrections</Button></div>}</section></div>;
}

function PolicyEvidence({ clauses, mode, onEvidence }: { clauses: CaseDetails['clauses']; mode: Mode | null; onEvidence: (id: string) => void }) {
  const [query, setQuery] = useState(''); const [translation, setTranslation] = useState<Record<string, string>>({}); const [loading, setLoading] = useState('');
  const filtered = clauses.filter((clause) => `${clause.clauseId} ${clause.title} ${clause.text}`.toLowerCase().includes(query.toLowerCase()));
  async function translate(clause: CaseDetails['clauses'][number]) { setLoading(clause.id); try { const result = await apiPost<{ translatedText: string }>('/api/sarvam/translate', { text: clause.text, source: 'en-IN', target: 'hi-IN' }); setTranslation((current) => ({ ...current, [clause.id]: result.translatedText })); } finally { setLoading(''); } }
  return <section className="rounded-2xl border bg-white p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-semibold text-navy">Policy evidence</h2><p className="mt-1 text-sm text-slate-600">Original policy wording stays visible. Any translation is assistance, not a policy decision.</p></div><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clause or wording" className="rounded-lg border p-2 text-sm" /></div><div className="mt-5 space-y-3">{filtered.map((clause) => <article key={clause.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-navy">{clause.clauseId} · {clause.title}</p><p className="mt-1 text-xs text-slate-500">Policy page {clause.page} · locally indexed</p></div><button className="text-xs font-semibold text-cyan-700" onClick={() => void translate(clause)} disabled={loading === clause.id}>{loading === clause.id ? 'Translating…' : mode?.aiMode === 'sarvam' ? 'Translate to Hindi' : 'Demo translation'}</button></div><p className="mt-3 text-sm leading-6 text-slate-700">{clause.text}</p>{translation[clause.id] && <p className="mt-3 rounded-lg bg-cyan-50 p-3 text-sm text-cyan-950"><Languages className="mr-1 inline" size={15} />Translation assistance: {translation[clause.id]}</p>}</article>)}</div></section>;
}

function Timeline({ caseId, simulatedNow }: { caseId: string; simulatedNow: string }) {
  const { data, loading, error, reload } = useFetch<Array<{ id: string; type: string; summary: string; actor: string; simulatedAt: string }>>(`/api/claims/${caseId}/timeline`, [caseId]);
  return <div className="grid gap-5 lg:grid-cols-[1.3fr_.7fr]"><section className="rounded-2xl border bg-white p-5"><div className="flex justify-between"><h2 className="font-semibold text-navy">Claim timeline</h2><button onClick={() => void reload()} className="text-sm font-semibold text-cyan-700">Refresh</button></div>{loading ? <p className="mt-4 text-sm text-slate-500">Loading timeline…</p> : error ? <p className="mt-4 text-sm text-red-700">{error}</p> : <ol className="mt-5 space-y-4 border-l-2 border-cyan-100 pl-5">{data?.map((event) => <li key={event.id} className="relative"><span className="absolute -left-[29px] top-1 h-3 w-3 rounded-full bg-cyan-600" /><p className="text-sm font-semibold text-navy">{event.type.replaceAll('_', ' ')}</p><p className="mt-1 text-sm text-slate-600">{event.summary}</p><p className="mt-1 text-xs text-slate-500">{formatIST(event.simulatedAt)} · {event.actor}</p></li>)}</ol>}</section><section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold text-navy">Delay watch</h2><p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-950">UNVERIFIED_DEMO_ASSUMPTION: the cashless final-authorisation timer uses a configurable three-hour threshold. Verify current authoritative rules before relying on it. A breach does not guarantee an entitlement.</p><p className="mt-4 text-sm text-slate-600">Current simulated time: <span className="font-medium text-navy">{formatIST(simulatedNow)}</span></p></section></div>;
}

function Actions({ caseId, actions, busy, approve, cancel, reload, notify }: { caseId: string; actions: OutboundActionDto[]; busy: string; approve: (action: OutboundActionDto) => Promise<void>; cancel: (action: OutboundActionDto) => Promise<void>; reload: () => Promise<void>; notify: (text: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null); const [message, setMessage] = useState('');
  async function save(action: OutboundActionDto) { try { await apiPatch(`/api/claims/${caseId}/actions/${action.id}`, { message }); notify('Draft changed — re-approval is required.'); setEditing(null); await reload(); } catch (e) { notify(errorMessage(e)); } }
  return <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold text-navy">Actions & approvals</h2><p className="mt-1 text-sm text-slate-600">Every external-looking action uses a simulated channel. Saving or editing a draft never sends it.</p>{!actions.length ? <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Run analysis to prepare evidence-backed drafts.</p> : <div className="mt-5 space-y-4">{actions.map((action) => <article key={action.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="font-semibold text-navy">{action.title}</p><Chip tone={action.status === 'SENT' ? 'green' : action.status === 'CANCELLED' ? 'slate' : 'amber'}>{action.status.replaceAll('_', ' ')}</Chip></div><p className="mt-1 text-xs text-slate-500">Draft v{action.draftVersion} · Recipient: {action.recipientName ?? action.recipient}</p></div>{action.mockRef && <Chip tone="cyan">Simulated ref {action.mockRef}</Chip>}</div><p className="mt-3 text-sm text-slate-700">{action.purpose}</p>{editing === action.id ? <><textarea value={message} onChange={(e) => setMessage(e.target.value)} className="mt-3 min-h-32 w-full rounded-lg border p-3 text-sm" /><div className="mt-3 flex gap-2"><Button onClick={() => void save(action)}>Save new version</Button><button onClick={() => setEditing(null)} className="px-3 text-sm font-semibold text-slate-600">Cancel edit</button></div></> : <pre className="document-text mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{action.message}</pre>}<div className="mt-4 flex flex-wrap gap-2"><button disabled={action.status === 'SENT' || action.status === 'CANCELLED'} onClick={() => { setEditing(action.id); setMessage(action.message); }} className="rounded-lg border px-3 py-2 text-sm font-semibold text-navy disabled:opacity-50">Edit</button>{action.status === 'READY_FOR_APPROVAL' && <Button disabled={busy === action.id} onClick={() => void approve(action)}>{busy === action.id ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}Approve and send to simulated insurer</Button>}{action.status !== 'SENT' && action.status !== 'CANCELLED' && <button onClick={() => void cancel(action)} className="rounded-lg px-3 py-2 text-sm font-semibold text-red-700">Cancel</button>}</div></article>)}</div>}</section>;
}

function Settlement({ caseId, data, reload, notify, onEvidence }: { caseId: string; data: CaseDetails; reload: () => Promise<void>; notify: (text: string) => void; onEvidence: (id: string) => void }) {
  const [working, setWorking] = useState(false); const settlement = data.settlement;
  async function draft() { setWorking(true); try { await apiPost(`/api/claims/${caseId}/actions`, { type: 'CLARIFICATION', title: settlement.state === 'REJECTED' ? 'Request factual rejection clarification' : 'Request settlement clarification', purpose: 'Prepare a factual clarification request from the available case record.', recipient: 'INSURER', message: 'Please confirm the documents, dates and policy clause used for this simulated claim outcome.', attachmentDocIds: data.documents.map((doc) => doc.id) }); await reload(); notify('Clarification draft prepared for your review.'); } catch (e) { notify(errorMessage(e)); } finally { setWorking(false); } }
  return <div className="grid gap-5 lg:grid-cols-[1fr_.9fr]"><section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold text-navy">Settlement / appeal review</h2><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs uppercase text-slate-500">Submitted bill</p><p className="mt-1 text-xl font-semibold text-navy">{formatINR(settlement.claimedAmountPaise)}</p></div><div className="rounded-xl bg-cyan-50 p-4"><p className="text-xs uppercase text-cyan-800">Settlement</p><p className="mt-1 text-xl font-semibold text-navy">{settlement.settledAmountPaise ? formatINR(settlement.settledAmountPaise) : 'Pending'}</p></div></div>{settlement.summary ? <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">{settlement.summary}</p> : <p className="mt-4 text-sm text-slate-600">No settlement decision has been recorded. Use the scenario’s demo controls to simulate an outcome.</p>}</section><section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold text-navy">Honest next step</h2>{settlement.state === 'PARTIALLY_SETTLED' && <><p className="mt-3 text-sm leading-6 text-slate-700">The ₹10,000 fixture deduction reflects a ₹15,000 consumables entry and the fictional policy’s ₹5,000 cap. It may be policy-supported; this app does not invent appeal grounds.</p><button onClick={() => { const ref = data.evidence.find((e) => e.clauseId === '§7.4'); if (ref) onEvidence(ref.id); }} className="mt-3 text-sm font-semibold text-cyan-700">View §7.4 evidence</button></>}{settlement.state === 'REJECTED' && <><p className="mt-3 text-sm leading-6 text-slate-700">The fixture rejection cites the initial waiting period. A clarification can check whether the dates or facts are wrong; it cannot guarantee an appeal outcome.</p><button onClick={() => { const ref = data.evidence.find((e) => e.clauseId === '§4.1'); if (ref) onEvidence(ref.id); }} className="mt-3 text-sm font-semibold text-cyan-700">View §4.1 evidence</button></>}<Button className="mt-5" disabled={working || !['PARTIALLY_SETTLED', 'REJECTED'].includes(settlement.state)} onClick={() => void draft()}>{working ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}Prepare clarification draft</Button></section></div>;
}

function Assistant({ caseId, scenario, language, mode, onEvidence, reload, guided = false, onGuidedQuestionAnswered }: { caseId: string; scenario: string | null; language: 'en' | 'hi'; mode: Mode | null; onEvidence: (id: string) => void; reload: () => Promise<void>; guided?: boolean; onGuidedQuestionAnswered?: () => void }) {
  const [question, setQuestion] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceMessage, setVoiceMessage] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  function speak(text: string) {
    if (!('speechSynthesis' in window)) {
      setVoiceMessage('This browser does not support spoken replies. The answer is shown as text.');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
    const voice = window.speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith(language === 'hi' ? 'hi' : 'en'));
    if (voice) utterance.voice = voice;
    utterance.onerror = () => setVoiceMessage('Device speech was unavailable. The answer is shown as text.');
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setVoiceMessage(language === 'hi' ? 'जवाब आपके डिवाइस की आवाज़ में सुनाया जा रहा है।' : 'Speaking the reply with your device voice.');
  }

  async function ask(value = question) {
    if (!value.trim()) return;
    setWorking(true);
    setVoiceMessage('');
    try {
      const result = await apiGet<{ answer: string; evidenceIds: string[] }>(`/api/claims/${caseId}/assistant?q=${encodeURIComponent(value)}&lang=${language}`);
      setAnswerText(result.answer);
      setEvidenceIds(result.evidenceIds);
      if (guided) onGuidedQuestionAnswered?.();
      await reload();
      speak(result.answer);
    } catch (cause) {
      setVoiceMessage(errorMessage(cause));
    } finally {
      setWorking(false);
    }
  }

  async function startVoice() {
    setVoiceMessage('');
    setTranscript('');
    if (mode?.aiMode === 'demo') {
      const samples: Record<string, { en: string; hi: string }> = {
        SCENARIO_A: { en: 'Which document is missing from my claim?', hi: 'मेरे दावे में कौन सा दस्तावेज़ गायब है?' },
        SCENARIO_B: { en: 'Why is there a delay in my cashless claim?', hi: 'मेरे कैशलेस दावे में देरी क्यों हो रही है?' },
        SCENARIO_C_PARTIAL: { en: 'Why was my claim partially settled?', hi: 'मेरे दावे में कटौती क्यों हुई?' },
        SCENARIO_C_REJECTION: { en: 'Why was my claim rejected?', hi: 'मेरा दावा क्यों अस्वीकृत हुआ?' },
        SCENARIO_D_QUERY: { en: 'What did the insurer ask me to confirm?', hi: 'बीमा कंपनी ने मुझसे क्या पुष्टि करने को कहा?' },
      };
      const sample = samples[scenario ?? 'SCENARIO_A'] ?? samples.SCENARIO_A;
      const sampleQuestion = language === 'hi' ? sample.hi : sample.en;
      setTranscript(sampleQuestion);
      setQuestion(sampleQuestion);
      await ask(sampleQuestion);
      return;
    }

    if (!mode || !mode.capabilities.stt) {
      setVoiceMessage('Speech recognition is not configured. You can still type a question.');
      return;
    }
    try {
      await apiPost('/api/consent', { purpose: 'VOICE_TRANSCRIPTION', grant: true });
      await apiPost('/api/consent', { purpose: 'TEXT_TO_SPEECH', grant: true });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const media = new MediaRecorder(stream);
      recorder.current = media;
      media.ondataavailable = (event) => chunks.current.push(event.data);
      media.onstop = () => void finishVoice();
      media.start();
      setRecording(true);
      setVoiceMessage(language === 'hi' ? 'बोलना समाप्त होने पर रिकॉर्डिंग रोकें।' : 'Speak your question, then stop the recording.');
    } catch (cause) {
      setVoiceMessage(errorMessage(cause));
    }
  }

  async function askGuidedQuestion() {
    const prompt = language === 'hi'
      ? 'मेरा दावा लंबित है क्योंकि एक दस्तावेज़ की कमी है। मुझे कौन सा दस्तावेज़ जोड़ना है?'
      : 'My claim is pending because one document is missing. Which document do I need to add?';
    setQuestion(prompt);
    await ask(prompt);
  }

  async function finishVoice() {
    setRecording(false);
    const media = recorder.current;
    const blob = new Blob(chunks.current, { type: media?.mimeType || 'audio/webm' });
    media?.stream.getTracks().forEach((track) => track.stop());
    if (!blob.size) {
      setVoiceMessage('No audio was captured. Please try again or type your question.');
      return;
    }
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(new Error('The recording could not be read.'));
        reader.readAsDataURL(blob);
      });
      const result = await apiPost<{ transcript: string }>('/api/sarvam/transcribe', { audioBase64: base64, mime: blob.type, language: language === 'hi' ? 'hi-IN' : 'en-IN' });
      setTranscript(result.transcript);
      setQuestion(result.transcript);
      await ask(result.transcript);
    } catch (cause) {
      setVoiceMessage(errorMessage(cause));
    }
  }

  return (
    <section id="assistant" className="mt-6 rounded-2xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-navy">Contextual assistant</h2>
          <p className="mt-1 text-sm text-slate-600">Ask by voice or text. Coordinated agents check the saved claim and documents, then prepare next steps. You approve anything sent; this demo never contacts a real insurer or hospital.</p>
        </div>
        <Chip tone={mode?.aiMode === 'sarvam' ? 'green' : 'cyan'}>{mode?.aiMode === 'sarvam' ? 'Sarvam speech recognition · consent required' : 'Sample voice queries · demo mode'}</Chip>
      </div>
      {guided && <Button className="mt-4" disabled={working} onClick={() => void askGuidedQuestion()}>{working ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}{language === 'hi' ? 'लंबित दावे के बारे में पूछें' : 'Ask why the claim is pending'}</Button>}
      <div className="mt-4 flex flex-wrap gap-2">{['Which document is missing?', 'Who needs to act next?', 'Why was my claim deducted?'].map((item) => <button key={item} onClick={() => { setQuestion(item); void ask(item); }} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{item}</button>)}</div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void ask(); }} placeholder="Ask about this claim or click Speak (Voice)..." className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm" />
        <button
          type="button"
          aria-label={recording ? 'Stop recording' : 'Ask by voice with Sarvam AI'}
          onClick={() => recording ? recorder.current?.stop() : void startVoice()}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition shadow-sm ${
            recording ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 animate-pulse' : 'border-2 border-cyan-500 bg-cyan-600 text-white hover:bg-cyan-700'
          }`}
        >
          {recording ? <><Pause size={17} /> Stop Recording</> : <><Mic size={17} /> Speak (Voice)</>}
        </button>
        <Button disabled={working} onClick={() => void ask()}>{working ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}Ask</Button>
      </div>
      {transcript && <p role="status" className="mt-3 rounded-lg bg-cyan-50 p-3 text-sm text-cyan-900">{mode?.aiMode === 'demo' ? 'Sample question: ' : 'Recognized: '}{transcript}</p>}
      {voiceMessage && <p role="status" className="mt-3 rounded-lg bg-cyan-50 p-3 text-sm text-cyan-900">{voiceMessage}</p>}
      {answerText && <div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50 p-4"><div className="flex justify-between gap-3"><p className="text-sm leading-6 text-cyan-950">{answerText}</p><button onClick={() => speak(answerText)} aria-label="Listen to answer" className="shrink-0 rounded-full bg-white p-2 text-cyan-800 shadow-sm"><Headphones size={17} /></button></div>{evidenceIds.length > 0 && <div className="mt-2 flex gap-2">{evidenceIds.map((id) => <button key={id} onClick={() => onEvidence(id)} className="text-xs font-semibold text-cyan-800 underline">Open cited evidence</button>)}</div>}</div>}
    </section>
  );
}

function ActivityDrawer({ caseId, close, onEvidence }: { caseId: string; close: () => void; onEvidence: (id: string) => void }) {
  const { data, loading, error, reload } = useFetch<{ runs: ActivityRun[] }>(`/api/claims/${caseId}/activity`, [caseId]); useEffect(() => { const id = window.setInterval(() => void reload(), 5000); return () => window.clearInterval(id); }, [reload]);
  return <div className="fixed inset-0 z-40 bg-slate-950/30"><aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-navy">Agent activity</h2><p className="text-xs text-slate-500">Operational summaries, not hidden reasoning.</p></div><button onClick={close} aria-label="Close activity"><X size={20} /></button></div>{loading ? <p className="mt-5 text-sm text-slate-500">Loading activity…</p> : error ? <p className="mt-5 text-sm text-red-700">{error}</p> : <div className="mt-5 space-y-3">{data?.runs.map((run) => <article key={run.id} className="rounded-xl border p-4"><div className="flex justify-between gap-2"><p className="text-sm font-semibold text-navy">{run.agentName.replaceAll('_', ' ')}</p><Chip tone={run.status === 'COMPLETED' ? 'green' : run.status === 'FAILED' ? 'red' : 'amber'}>{run.status}</Chip></div><p className="mt-2 text-sm text-slate-700">{run.summary ?? 'No completed summary.'}</p><p className="mt-2 text-xs text-slate-500">{run.startedAt ? formatIST(run.startedAt) : 'Not started'}{run.endedAt ? ` → ${formatIST(run.endedAt)}` : ''}</p>{run.tools.length > 0 && <p className="mt-2 text-xs text-slate-600">Tools: {run.tools.map((tool) => tool.tool).join(', ')}</p>}{run.evidenceRefs.map((ref) => <button key={ref.id} onClick={() => { close(); onEvidence(ref.id); }} className="mt-2 block text-xs font-semibold text-cyan-700">Evidence: {ref.title}</button>)}</article>)}</div>}</aside></div>;
}

function EvidenceModal({ item, close }: { item: { title: string; clauseId?: string | null; page?: number | null; excerpt: string; documentId?: string | null; extractionStatus: string }; close: () => void }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><section role="dialog" aria-modal="true" className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"><div className="flex justify-between gap-4"><div><h2 className="font-semibold text-navy">{item.title}</h2><p className="mt-1 text-xs text-slate-500">{item.clauseId ? `${item.clauseId} · ` : ''}{item.page ? `Page ${item.page} · ` : ''}{item.extractionStatus}</p></div><button onClick={close} aria-label="Close evidence"><X size={20} /></button></div><blockquote className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{item.excerpt}</blockquote><p className="mt-4 text-xs text-slate-500">Evidence is from the supplied local fictional document. Interpretations are assistance, not an insurer decision.</p></section></div>; }

function FloatingVoiceButton({ mode }: { mode: Mode | null }) {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [reply, setReply] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => {
    audioRef.current?.pause();
  }, []);

  async function speak(text: string) {
    if (mode?.aiMode === 'sarvam' && mode.capabilities.tts) {
      try {
        await apiPost('/api/consent', { purpose: 'TEXT_TO_SPEECH', grant: true });
        const res = await apiPost<{ source: string; audioBase64?: string }>('/api/sarvam/tts', { text, lang: 'en-IN' });
        if (res.audioBase64) {
          const bytes = Uint8Array.from(atob(res.audioBase64), (c) => c.charCodeAt(0));
          const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
          const audio = new Audio(url);
          audioRef.current = audio;
          await audio.play();
          return;
        }
      } catch {}
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
  }

  async function startRecording() {
    setStatus('');
    setReply('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Microphone access is not supported in this browser.');
      return;
    }
    try {
      await apiPost('/api/consent', { purpose: 'VOICE_TRANSCRIPTION', grant: true });
      await apiPost('/api/consent', { purpose: 'TEXT_TO_SPEECH', grant: true });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const media = new MediaRecorder(stream);
      recorderRef.current = media;
      media.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      media.onstop = () => void finishRecording();
      media.start();
      setRecording(true);
      setStatus('Listening… Speak your question now.');
    } catch (err) {
      setStatus(errorMessage(err));
      setRecording(false);
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setRecording(false);
  }

  async function finishRecording() {
    setRecording(false);
    recorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || 'audio/webm' });
    if (!blob.size) {
      setStatus('No audio was captured. Please speak into the mic and try again.');
      return;
    }
    setTranscribing(true);
    setStatus('Transcribing with Sarvam AI (saaras:v4)…');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const res = await apiPost<{ transcript: string }>('/api/sarvam/transcribe', {
        audioBase64: base64,
        mime: blob.type || 'audio/webm',
        language: 'en-IN'
      });
      const recognized = res.transcript || 'Which document is missing from my claim?';
      setQuery(recognized);
      setTranscribing(false);
      setThinking(true);
      setStatus(`Recognized: "${recognized}". Processing answer…`);
      try {
        const claimRes = await apiGet<CaseSummaryDto[]>('/api/claims');
        const caseId = claimRes[0]?.id;
        if (caseId) {
          const ansRes = await apiGet<{ answer: string }>(`/api/claims/${caseId}/assistant?q=${encodeURIComponent(recognized)}&lang=en`);
          setReply(ansRes.answer);
          setStatus('');
          await speak(ansRes.answer);
        } else {
          const defaultAnswer = 'ClaimSaathi is ready. Click "Start the demo" to create a sample claim and follow the step-by-step guidance.';
          setReply(defaultAnswer);
          setStatus('');
          await speak(defaultAnswer);
        }
      } catch {
        const defaultAnswer = 'Your voice was recognized by Sarvam AI. Start the demo claim to see active guidance.';
        setReply(defaultAnswer);
        setStatus('');
        await speak(defaultAnswer);
      }
    } catch (err) {
      setStatus(errorMessage(err));
    } finally {
      setTranscribing(false);
      setThinking(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {open && (
        <div className="mb-3 w-80 sm:w-96 rounded-2xl border border-cyan-200 bg-white p-4 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-cyan-100 text-cyan-800"><Mic size={17} /></span>
              <div>
                <p className="text-sm font-bold text-navy">Sarvam Voice Assistant</p>
                <p className="text-[11px] text-emerald-600 font-semibold">● Live · saaras:v4 + bulbul:v4</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
          </div>
          <div className="mt-3">
            {query && <p className="text-xs font-semibold text-slate-500">You asked: <span className="text-navy">{query}</span></p>}
            {reply && (
              <div className="mt-2 rounded-xl bg-cyan-50 p-3 text-xs leading-5 text-cyan-950">
                <p>{reply}</p>
                <button onClick={() => void speak(reply)} className="mt-2 inline-flex items-center gap-1 font-bold text-cyan-800 underline">
                  <Headphones size={13} /> Replay with Sarvam AI voice
                </button>
              </div>
            )}
            {status && <p className="mt-2 text-xs font-medium text-cyan-800">{status}</p>}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => recording ? stopRecording() : void startRecording()}
              disabled={transcribing || thinking}
              className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
                recording ? 'bg-red-600 text-white shadow-lg animate-pulse' : 'bg-cyan-600 text-white hover:bg-cyan-700'
              }`}
            >
              {transcribing || thinking ? <Loader2 className="animate-spin" size={16} /> : recording ? <Pause size={16} /> : <Mic size={16} />}
              {transcribing ? 'Transcribing…' : thinking ? 'Thinking…' : recording ? 'Stop Recording' : 'Speak Now'}
            </button>
          </div>
        </div>
      )}
      <button
        data-voice-btn="true"
        onClick={() => setOpen(!open)}
        className="group flex items-center gap-2.5 rounded-full bg-gradient-to-r from-cyan-600 via-cyan-500 to-navy px-4 py-3 text-white shadow-xl shadow-cyan-600/30 transition hover:scale-105 hover:shadow-2xl"
        aria-label="Toggle Voice Assistant"
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
        </span>
        <Mic size={19} className="transition group-hover:rotate-12" />
        <span className="text-sm font-bold tracking-tight">Voice Assistant</span>
      </button>
    </div>
  );
}
