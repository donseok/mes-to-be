/* modules/order-consistency.html 의 마커 구역을 잘라 Node에서 로드한다.
   브라우저 전용 코드(DOM·localStorage)는 구역 밖이라 딸려오지 않는다. */
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(ROOT, 'modules/order-consistency.html'), 'utf8');

function region(startMark, endMark) {
  const a = HTML.indexOf(startMark);
  if (a < 0) throw new Error('마커 없음: ' + startMark);
  if (HTML.indexOf(startMark, a + 1) >= 0) throw new Error('마커 중복: ' + startMark);
  const b = HTML.indexOf(endMark, a);
  if (b < 0) throw new Error('마커 없음: ' + endMark);
  return HTML.slice(a + startMark.length, b);
}

const seedSrc = region('/*__OC_SEED_START__*/', '/*__OC_SEED_END__*/');
export const pureSrc = region('/*__OC_PURE_START__*/', '/*__OC_PURE_END__*/');
const loaded = new Function("'use strict';\n" + seedSrc + '\n' + pureSrc + '\nreturn {OC_SEED:OC_SEED, OC_PURE:OC_PURE};')();

export const seed = loaded.OC_SEED;
export const pure = loaded.OC_PURE;
export const rules = seed.rules;
export const dict = {fields: seed.fields, valueLabels: seed.value_labels};
