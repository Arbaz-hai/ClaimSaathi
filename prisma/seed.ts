/**
 * ClaimSaathi seed script (idempotent).
 *
 * PLACEHOLDER — the qa teammate replaces this with the real implementation:
 * regenerate fixture PDFs (scripts/generate-fixtures.ts) and print a report.
 * Per-session demo scenarios are seeded via POST /api/demo/seed-scenario at
 * runtime, so this script intentionally inserts no case rows.
 */
import fs from 'fs/promises';
import path from 'path';

async function main() {
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(path.join(dataDir, 'uploads'), { recursive: true });
  await fs.mkdir(path.join(dataDir, 'audio'), { recursive: true });
  console.log('[seed] data directories ensured (uploads, audio).');
  console.log(
    '[seed] PLACEHOLDER: scenario fixtures will be generated here by the qa teammate.'
  );
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
