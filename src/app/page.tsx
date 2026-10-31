// Placeholder shell — the frontend teammate replaces this with the real
// dashboard. Kept minimal so the build passes during scaffolding.
export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8">
      <div className="h-10 w-10 rounded-full bg-navy" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight text-navy">ClaimSaathi</h1>
      <p className="text-sm text-muted-foreground">
        Speak your language. Move your claim forward.
      </p>
      <p className="text-xs text-muted-foreground">Application initialising…</p>
    </main>
  );
}
