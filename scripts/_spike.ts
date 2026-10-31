// Temporary spike: verify pdf-lib (Helvetica, WinAnsi) + pdfjs-dist extraction round-trip.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';

async function main() {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  let y = 800;
  const lines = [
    'AarogyaShield Individual Health Policy',
    'Policy Number: AS-2025-887766',
    '§6.1 Documents for Reimbursement Claims: claim form, policy, itemised bill, payment receipt, discharge summary, investigation reports.',
    '§7.4 Consumables and Non-medical Items Cap: Rs 5,000 per hospitalisation.',
    'Total: Rs 80,000.00  |  Waiting period 30 days  |  dates 2026-10-20 to 2026-10-23',
  ];
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 9, font, color: rgb(0, 0, 0) });
    y -= 18;
  }
  const bytes = await pdfDoc.save();
  fs.writeFileSync('scripts/_spike.pdf', bytes);

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const pageObj = await doc.getPage(p);
    const content = await pageObj.getTextContent();
    const pageText = content.items.map((it: any) => it.str).join('');
    text += pageText + '\n';
  }
  console.log('EXTRACTED:\n' + text.trimEnd());
  console.log('MATCH:', text.trimEnd() === lines.join('\n'));
  // Also check the trailing-newline assumption per item
  const doc2 = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const p2 = await doc2.getPage(1);
  const c2 = await p2.getTextContent();
  const first = c2.items[0] as any;
  console.log('FIRST ITEM str JSON:', JSON.stringify(first.str.slice(0, 40)), 'hasEOL:', first.hasEOL);
  console.log('ITEM COUNT:', c2.items.length);
  for (const it of c2.items as any[]) {
    console.log(JSON.stringify(it.str.slice(0, 30)), 'y=', it.transform[5], 'x=', it.transform[4], 'w=', it.width, 'h=', it.height);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
