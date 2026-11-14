/**
 * Γράφει την πολιτική απορρήτου και τους όρους σε markdown (docs/legal/) από την ίδια πηγή
 * που χρησιμοποιεί η εφαρμογή, για το δημόσιο URL που ζητούν App Store & Google Play.
 * Χρήση: npm run legal:export
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEGAL_DOCS, type LegalDoc } from '../apps/mobile/src/legal/content';

const out = join(import.meta.dirname, '..', 'docs', 'legal');
mkdirSync(out, { recursive: true });

const toMd = (d: LegalDoc) =>
  [`# ${d.title}`, '', ...d.sections.flatMap((s) => [`## ${s.h}`, '', ...s.p.flatMap((p) => [p, ''])])].join('\n');

for (const [id, doc] of Object.entries(LEGAL_DOCS)) {
  writeFileSync(join(out, `${id}.md`), toMd(doc), 'utf8');
  console.log(`✓ docs/legal/${id}.md`);
}
