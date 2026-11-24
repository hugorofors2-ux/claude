// Hela flödet i en riktig webbläsare: portal, nya evenemang, incheckning och röstlängd.
// Kör: python3 test/bygg_testsidor.py && node test/e2e.mjs
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const HAR = path.dirname(fileURLToPath(import.meta.url));
const sida = (namn, q = '') => 'file://' + path.join(HAR, 'ut', namn + '.html') + q;
const las = f => fs.readFileSync(path.join(HAR, 'exempel', f), 'utf8');
const BILDER = process.env.BILDER || path.join(HAR, 'ut');

const fel = [];
let ok = 0;
function kolla(villkor, text) {
  if (villkor) { ok++; console.log('  ok   ' + text); } else { fel.push(text); console.log('  FEL  ' + text); }
}

const browser = await playwright.chromium.launch();
async function kor(vp, tag) {
  console.log('\n== ' + tag);
  const p = await browser.newPage({ viewport: vp });
  p.on('pageerror', e => fel.push(tag + ' sidfel: ' + e.message + ' @ ' + p.url().split('/').pop() + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
  p.on('console', m => { if (m.text().startsWith('SERVERFEL')) console.log('  (' + m.text() + ')'); });
  const bild = n => p.screenshot({ path: path.join(BILDER, tag + '-' + n + '.png') });

  await p.goto(sida('Portal'));
  await p.evaluate(() => { localStorage.clear(); });
  await p.goto(sida('Portal'));

  // Inloggning
  await p.fill('#pin', '1111'); await p.click('#loginBtn'); await p.waitForTimeout(250);
  kolla((await p.textContent('#loginErr')).includes('Fel PIN'), 'fel portal-PIN avvisas');
  await p.fill('#pin', '999999'); await p.click('#loginBtn'); await p.waitForTimeout(300);
  kolla(await p.isVisible('#app'), 'portalen öppnas med rätt PIN');
  await bild('1-tom');

  // Ny utbildning
  await p.click('#btnNytt');
  await p.click('[data-typ=utbildning]');
  await p.fill('#gNamn', 'Höstkonferens <test>');
  await p.fill('#gDatum', '2027-10-23');
  await p.fill('#gPin', '4321');
  await p.click('#gFarg button[data-f=bla]');
  await p.check('#gGrupp'); await p.check('#gMyndig');
  await p.fill('#gEgna', 'Kost');
  await p.click('#gNasta');
  await p.fill('#gDeltagare', las('utbildning-deltagare.tsv'));
  await p.click('#gGranska'); await p.waitForTimeout(300);
  const f1 = (await p.innerText('#gForhand')).replace(/\s+/g, ' ');
  kolla(f1.includes('48 deltagare') && f1.includes('1 dubbletter'), 'förhandsgranskning utbildning: ' + f1.slice(0, 90));
  kolla(!f1.includes('20101102'), 'personnummer visas inte i förhandsgranskningen');
  await bild('2-forhand-utb');
  await p.click('#gVidare');
  await p.click('#gSkapa'); await p.waitForTimeout(400);
  kolla((await p.textContent('#modal')).includes('Evenemanget är skapat'), 'utbildningen skapas');
  await p.fill('#lNamn', 'Hugo, CK');
  const lankar = await p.$$eval('#lLista input', i => i.map(x => x.value));
  kolla(lankar.length === 3 && lankar[1].endsWith('&admin=Hugo'), 'admin-länkar byggs: ' + lankar[1]);
  await bild('3-lankar');
  const utbId = new URL(lankar[0]).searchParams.get('e');
  const ark = await p.evaluate(() => JSON.stringify(window.__mockdb.ark));
  kolla(!ark.includes('20101102') && !ark.includes('@exempel.se'), 'personnummer och e-post sparas inte i kalkylarket');
  await p.click('[data-close]');

  // Ny stämma
  await p.click('#btnNytt');
  await p.click('[data-typ=stamma]');
  await p.fill('#gNamn', 'Förbundsstämma 2027');
  await p.fill('#gPin', '8765');
  await p.click('#gNasta');
  await p.fill('#gRostlangd', las('stamma-rostlangd.tsv'));
  await p.fill('#gAnmalan', las('stamma-anmalan.tsv'));
  await p.click('summary');
  await p.fill('#gOmbud', las('stamma-ombud.tsv'));
  await p.click('#gGranska'); await p.waitForTimeout(400);
  const f2 = (await p.innerText('#gForhand')).replace(/\s+/g, ' ');
  kolla(f2.includes('44 platser') && f2.includes('8 distrikt') && f2.includes('5 FS'), 'förhandsgranskning stämma: ' + f2.slice(0, 110));
  kolla(f2.includes('saker att kontrollera'), 'stämmans varningar visas');
  await bild('4-forhand-stamma');
  await p.click('#gVidare');
  await p.click('#gSkapa'); await p.waitForTimeout(400);
  const lankar2 = await p.$$eval('#lLista input', i => i.map(x => x.value));
  kolla(lankar2.some(l => l.endsWith('&vy=rostlangd')), 'stämman får en röstlängdslänk');
  const stmId = new URL(lankar2[0]).searchParams.get('e');
  await p.click('[data-close]');
  kolla(await p.locator('.evkort').count() === 2, 'båda evenemangen syns i listan');
  await bild('5-lista');

  // Utbildningen: logga in med evenemangets PIN
  await p.goto(sida('Utbildning', '?e=' + utbId + '&admin=Hugo')); await p.waitForTimeout(300);
  kolla((await p.textContent('h1[data-namn]')) === 'Höstkonferens <test>', 'evenemangets namn visas som text');
  kolla((await p.getAttribute('html', 'data-farg')) === 'bla', 'evenemangets färg används');
  await p.fill('#pin', '8765'); await p.click('#loginBtn'); await p.waitForTimeout(300);
  kolla((await p.textContent('#loginErr')).includes('Fel PIN'), 'stämmans PIN fungerar inte på utbildningen');
  await p.fill('#pin', '4321'); await p.click('#loginBtn'); await p.waitForTimeout(400);
  kolla((await p.textContent('#sTot')) === '48', 'utbildningen har 48 deltagare');
  await p.fill('#q', 'alice eriks'); await p.waitForTimeout(80);
  await p.locator('.row').first().click(); await p.waitForTimeout(80);
  const kort = (await p.textContent('#modal .sheet')).replace(/\s+/g, ' ');
  kolla(kort.includes('Kost') && kort.includes('Under 18'), 'personkort visar eget fält och omyndig: ' + kort.slice(0, 80));
  await bild('6-utb-kort');
  await p.click('#mIn'); await p.waitForTimeout(300);
  kolla((await p.textContent('#sIn')) === '1', 'incheckning räknas');

  // Stämman: portalens PIN fungerar
  await p.goto(sida('Stamma', '?e=' + stmId)); await p.waitForTimeout(300);
  await p.fill('#pin', '999999'); await p.click('#loginBtn'); await p.waitForTimeout(500);
  kolla((await p.textContent('#sRost')).replace(/\s+/g, ' ') === '0 / 44', 'stämman har 44 platser');
  await p.evaluate(id => {
    const d = stm_hamtaData('999999', id, null);
    d.personer.filter(x => x.distrikt === 'Stockholm' && x.roll !== 'Observatör').slice(0, 9).concat(d.personer.filter(x => x.roll === 'Ersättare' && x.distrikt === 'Stockholm'))
      .forEach(x => stm_sattStatus('999999', id, x.id, 'inne'));
  }, stmId);
  await p.waitForTimeout(3300);
  await p.click('#btnRL'); await p.waitForTimeout(200);
  const vantar = await p.locator('[data-bekrafta]').count();
  kolla(vantar >= 1, 'röstlängden föreslår ersättare (' + vantar + ')');
  await p.locator('[data-bekrafta]').first().click(); await p.waitForTimeout(400);
  kolla((await p.textContent('#toast')).includes('tjänstgör'), 'ersättare bekräftas');
  await bild('7-rostlangd');

  // Avsluta evenemang i portalen
  await p.goto(sida('Portal')); await p.waitForTimeout(400);
  await p.click('[data-inst="' + utbId + '"]');
  await p.click('#iStatus'); await p.waitForTimeout(300);
  kolla(await p.locator('.evkort').count() === 1, 'avslutat evenemang flyttas från listan');
  const stangt = await p.evaluate(id => { try { utb_hamtaData('4321', id, null); return 'öppet'; } catch (e) { return e.message; } }, utbId);
  kolla(stangt.includes('avslutat'), 'avslutat evenemang går inte att nå: ' + stangt);
  await p.click('#flikar button[data-v=arkiverad]');
  await p.click('[data-inst="' + utbId + '"]');
  await p.click('#modal summary');
  await p.fill('#iRadera', 'fel namn'); await p.click('#iRaderaBtn'); await p.waitForTimeout(200);
  kolla((await p.textContent('#iFel')).includes('exakt'), 'radering kräver rätt namn');
  await p.fill('#iRadera', 'Höstkonferens <test>'); await p.click('#iRaderaBtn'); await p.waitForTimeout(300);
  kolla(await p.evaluate(() => window.__mockdb.papperskorg.length) === 1, 'raderat evenemang läggs i papperskorgen');
  await p.close();
}

await kor({ width: 1280, height: 900 }, 'dator');
await kor({ width: 390, height: 844 }, 'mobil');
await browser.close();
console.log('\n' + ok + ' kontroller ok, ' + fel.length + ' fel');
fel.forEach(f => console.log('  - ' + f));
process.exit(fel.length ? 1 : 0);
