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
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

async function main() {
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(path.join(dataDir, 'uploads'), { recursive: true });
  await fs.mkdir(path.join(dataDir, 'audio'), { recursive: true });
  await promisify(execFile)(process.execPath, [require.resolve('tsx/cli'), 'scripts/generate-fixtures.ts'], { cwd: process.cwd() });
  console.log('[seed] data directories ensured (uploads, audio).');
  console.log('[seed] fixture documents generated. Scenarios are seeded per private browser session.');
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
