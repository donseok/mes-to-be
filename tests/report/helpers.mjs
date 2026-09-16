import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');

// assets/report/*.js 는 전역 MesReport 에 등록하는 평범한 스크립트다(DOM 은 함수 안에서만 만진다).
export async function loadReport() {
  for (const f of ['report-model.js', 'report-doc.js']) {
    const p = path.join(ROOT, 'assets', 'report', f);
    if (fs.existsSync(p)) await import(pathToFileURL(p).href);
  }
  return globalThis.MesReport;
}

// modules/quality-certificate.html 의 ROWS 시드에서 한 행을 꺼낸다(모듈과 같은 데이터로 테스트).
export function seedRows() {
  const html = fs.readFileSync(path.join(ROOT, 'modules', 'quality-certificate.html'), 'utf8');
  const m = html.match(/var ROWS=(\[[\s\S]*?\]);/);
  if (!m) throw new Error('quality-certificate.html 에서 ROWS 시드를 찾지 못했다');
  return JSON.parse(m[1]);
}

// 한 페이지가 실제로 몇 mm(px) 를 쓰는지 되계산한다 — 분할 결과가 용량을 넘지 않는지 검증용.
export function pageHeight(page, blocks) {
  const by = Object.fromEntries(blocks.map(b => [b.id, b]));
  let h = 0;
  for (const piece of page) {
    const b = by[piece.id];
    if (piece.kind === 'table') {
      h += b.headH + b.footH;
      for (let i = piece.from; i < piece.to; i++) h += b.rowHs[i];
    } else h += b.h;
  }
  return h;
}
