import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');

export function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(here, 'fixtures', name + '.json'), 'utf8'));
}

// assets/shape/*.js 는 전역 MesShape 에 등록하는 평범한 스크립트다. 존재하는 파일만 순서대로 로드한다.
export async function loadShape() {
  for (const f of ['shape-model.js', 'shape-svg.js', 'shape-widget.js']) {
    const p = path.join(ROOT, 'assets', 'shape', f);
    if (fs.existsSync(p)) await import(pathToFileURL(p).href);
  }
  return globalThis.MesShape;
}
