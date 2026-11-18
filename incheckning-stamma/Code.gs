/**
 * Incheckning och röstlängd – MUF:s förbundsstämma
 *
 * Serverdel för Google Apps Script, kopplad till kalkylarket med flikarna
 * Ombud, Röstlängd och Anmälan. Se INSTRUKTION.md.
 *
 * Ombudsfliken är facit: den avgör mandat, ombud och ersättarordning.
 * Skriptet ändrar aldrig era flikar. Incheckningar sparas i en egen flik
 * och varje fastställd röstlängd blir en ny flik.
 *
 * @OnlyCurrentDoc
 */

// ===== Inställningar =====

// Gemensam PIN-kod för admin. Byt innan publicering.
const PIN = 'ÄNDRA';

// Fliknamn i kalkylarket.
const FLIK_OMBUD = 'Ombud';
const FLIK_ROSTLANGD = 'Röstlängd';
const FLIK_ANMALAN = 'Anmälan';
const FLIK_INCHECKNING = 'Incheckning';

// FS-ledamöter i röstlängdsfliken räknas som röstberättigade.
const FS_ROSTRATT = true;

// Står en person både som FS och som ombud/ersättare räknas hen som FS.
// Distriktets plats behandlas då som ledig och nästa ersättare träder in.
// Sätt till 'Ombud' för att i stället räkna personen på distriktets mandat.
const DUBBELROLL_RAKNAS_SOM = 'FS';

// Vad som lämnas ut vid incheckning, per roll.
const UTDELNING = {
  'Ombud': 'Röstkort och namnlapp',
  'Ersättare': 'Namnlapp. Röstkort enligt rutin för ersättare.',
  'FS': 'Röstkort och namnlapp',
  'Övriga': 'Namnlapp'
};

// Roller som kan väljas när någon läggs till på plats.
const ROLLER_PA_PLATS = ['Observatör', 'Gäst', 'Funktionär', 'Press'];

const TIDSZON = 'Europe/Stockholm';
const TITEL = 'MUF Förbundsstämma';

const INCHECKNING_RUBRIKER = ['Nyckel', 'Namn', 'Distrikt', 'Roll', 'Status', 'Incheckad', 'Utcheckad', 'Tillagd på plats'];

// ===== Webbapp =====

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(TITEL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

// Körs en gång från editorn: godkänner behörigheter och skapar incheckningsfliken.
function forbered() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  incheckningsflik(ss, true);
  const m = bygg(ss);
  Logger.log('Klart. Distrikt: ' + m.distrikt.length + ', mandat: ' + m.totalMandat +
    ', personer: ' + m.personer.length + ', kontrollpunkter: ' + m.kontroll.length);
}

function onEdit() {
  hojVersion();
}

// ===== Anrop från gränssnittet =====

function hamtaData(pin, kandVersion) {
  kontrolleraPin(pin);
  const v = version();
  if (kandVersion && kandVersion === v) return { andrad: false, version: v };
  return paket(bygg(SpreadsheetApp.getActiveSpreadsheet()));
}

// status: 'inne' (på plats), 'ute' (har lämnat) eller '' (ångra, ej incheckad)
function sattStatus(pin, id, status) {
  kontrolleraPin(pin);
  if (['inne', 'ute', ''].indexOf(status) < 0) throw new Error('Okänd status.');
  return medLas(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const m = bygg(ss);
    const p = m.perId[id];
    if (!p) throw new Error('Personen finns inte längre i listorna. Ladda om sidan.');
    const nu = Utilities.formatDate(new Date(), TIDSZON, 'yyyy-MM-dd HH:mm');
    const f = m.incheckning[id] || {};
    let inTid = f.inRa || '';
    let utTid = f.utRa || '';
    // Den som kommer tillbaka behåller sin första incheckningstid.
    if (status === 'inne') { if (!f.status || !inTid) inTid = nu; utTid = ''; }
    if (status === 'ute') { if (!inTid) inTid = nu; utTid = nu; }
    if (status === '') { inTid = ''; utTid = ''; }
    skrivIncheckning(ss, m, p, statusText(status), inTid, utTid, f.tillagd ? 'Ja' : '');
    hojVersion();
    return paket(bygg(ss));
  });
}

function laggTill(pin, d) {
  kontrolleraPin(pin);
  const namn = stada(d && d.namn).namn;
  if (!namn) throw new Error('Namn saknas.');
  const roll = ROLLER_PA_PLATS.indexOf(d.roll) >= 0 ? d.roll : 'Observatör';
  return medLas(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const m = bygg(ss);
    const id = nyckel(namn);
    if (m.perId[id]) throw new Error(namn + ' finns redan i listan. Sök på namnet i stället.');
    const nu = Utilities.formatDate(new Date(), TIDSZON, 'yyyy-MM-dd HH:mm');
    const p = { id: id, namn: namn, distrikt: text(d.distrikt), roll: roll };
    skrivIncheckning(ss, m, p, d.checkaIn ? statusText('inne') : '', d.checkaIn ? nu : '', '', 'Ja');
    hojVersion();
    const svar = paket(bygg(ss));
    svar.nyttId = id;
    return svar;
  });
}

// Sparar röstlängden som den ser ut just nu i en ny flik och jämför med förra.
function faststallRostlangd(pin) {
  kontrolleraPin(pin);
  return medLas(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const m = bygg(ss);
    const lista = sparadeRostlangder();
    const nr = lista.length + 1;
    const nu = new Date();
    const tid = Utilities.formatDate(nu, TIDSZON, 'yyyy-MM-dd HH:mm');
    const rader = m.rostlangd.map((r, i) => [i + 1, r.distrikt, r.namn, r.grund]);
    const forra = lista.length ? hamtaRostlangd(lista[lista.length - 1].nr) : null;
    const diff = jamfor(forra, m.rostlangd);

    const fliknamn = 'Röstlängd ' + nr + ' kl ' + Utilities.formatDate(nu, TIDSZON, 'HH.mm');
    const sh = ss.insertSheet(fliknamn, ss.getSheets().length);
    const ut = [
      ['Röstlängd nr ' + nr, 'Fastställd ' + tid, '', ''],
      ['Röstberättigade', m.rostlangd.length, '', ''],
      ['', '', '', ''],
      ['Nr', 'Distrikt', 'Namn', 'Grund']
    ].concat(rader);
    if (forra) {
      ut.push(['', '', '', '']);
      ut.push(['Förändring mot röstlängd nr ' + forra.nr, '', '', '']);
      diff.tillkom.forEach(r => ut.push(['Tillkommit', r.distrikt, r.namn, r.grund || '']));
      diff.utgick.forEach(r => ut.push(['Utgått', r.distrikt, r.namn, r.grund || '']));
      if (!diff.tillkom.length && !diff.utgick.length) ut.push(['Inga förändringar', '', '', '']);
    }
    sh.getRange(1, 1, ut.length, 4).setValues(ut);
    sh.getRange(1, 1, 2, 1).setFontWeight('bold');
    sh.getRange(4, 1, 1, 4).setFontWeight('bold');
    sh.setFrozenRows(4);
    sh.autoResizeColumns(1, 4);

    sparaRostlangd(nr, tid, fliknamn, m.rostlangd);
    hojVersion();
    const svar = paket(bygg(ss));
    svar.faststalld = { nr: nr, tid: tid, flik: fliknamn, antal: m.rostlangd.length, tillkom: diff.tillkom, utgick: diff.utgick };
    return svar;
  });
}

// ===== Modell =====

function bygg(ss) {
  const ombud = lasOmbud(ss);
  const rl = lasRostlangdsflik(ss);
  const anm = lasAnmalan(ss);
  const inch = lasIncheckning(ss);
  const kontroll = [];
  const P = {};
  const ordning = [];

  const person = (namn, notering) => {
    const k = nyckel(namn);
    if (!P[k]) {
      P[k] = { id: k, namn: namn, distrikt: '', roller: [], anmald: false, anmaldSom: '', anmaldDistrikt: '', notering: '', flaggor: [] };
      ordning.push(k);
    }
    if (notering && P[k].notering.indexOf(notering) < 0) P[k].notering = (P[k].notering ? P[k].notering + '; ' : '') + notering;
    return P[k];
  };

  // Ombudslistan
  ombud.forEach(d => {
    d.platser.forEach((pl, i) => {
      const pos = i + 1;
      const p = person(pl.namn, pl.notering);
      const plats = pos <= d.mandat
        ? { typ: 'Ombud', distrikt: d.namn, nr: pos }
        : { typ: 'Ersättare', distrikt: d.namn, nr: pos - d.mandat };
      p.roller.push(plats);
      pl.person = p;
      pl.plats = plats;
      if (!p.distrikt) p.distrikt = d.namn;
    });
  });

  // FS
  rl.fs.forEach(n => {
    const p = person(n.namn, n.notering);
    p.roller.push({ typ: 'FS' });
    if (!p.distrikt) p.distrikt = 'FS';
  });

  // Personer som står flera gånger i listorna
  ordning.forEach(k => {
    const p = P[k];
    const listplatser = p.roller.filter(r => r.typ !== 'FS');
    const fs = p.roller.some(r => r.typ === 'FS');
    if (listplatser.length > 1 || (fs && listplatser.length)) {
      const txt = p.roller.map(rollText).join(' och ');
      p.flaggor.push('Står flera gånger i listorna: ' + txt + '.');
      kontroll.push({ niva: 'varning', typ: 'Dubbla roller', text: p.namn + ': ' + txt, id: k });
    }
  });

  // Matchning mot anmälan, på för- och efternamn
  const listIndex = {};
  ordning.forEach(k => {
    const fl = forstSist(k);
    (listIndex[fl] = listIndex[fl] || []).push(k);
  });
  anm.personer.forEach(a => {
    const k = nyckel(a.namn);
    let p = P[k] && P[k].roller.length ? P[k] : null;
    if (!p) {
      const kand = listIndex[forstSist(k)] || [];
      if (kand.length === 1 && !P[kand[0]].anmald) {
        p = P[kand[0]];
        kontroll.push({ niva: 'info', typ: 'Matchad på för- och efternamn', text: 'Anmälan "' + a.namn + '" kopplad till "' + p.namn + '" i ombudslistan', id: p.id });
      }
    }
    if (!p) p = person(a.namn);
    if (p.anmald) return;
    p.anmald = true;
    p.anmaldSom = a.deltarSom;
    p.anmaldDistrikt = a.distrikt;
    if (!p.distrikt) p.distrikt = a.distrikt;
  });
  anm.dubbletter.forEach(d => {
    kontroll.push({ niva: 'info', typ: 'Dubbletter i anmälan', text: d.namn + ' (' + d.antal + ' anmälningar, slogs ihop)' + (d.olika ? '. Uppgifterna skiljer sig: ' + d.olika : ''), id: nyckel(d.namn) });
  });

  // Tillagda på plats
  Object.keys(inch).forEach(k => {
    const f = inch[k];
    if (P[k] || !f.tillagd) return;
    const p = person(f.namn);
    p.distrikt = f.distrikt;
    p.tillagdRoll = f.roll;
  });

  // Roll, status och kontroller per person
  ordning.forEach(k => {
    const p = P[k];
    const listplats = p.roller.filter(r => r.typ !== 'FS');
    const fs = p.roller.some(r => r.typ === 'FS');
    const forsta = listplats[0];
    if (fs && (DUBBELROLL_RAKNAS_SOM === 'FS' || !forsta)) p.roll = 'FS';
    else if (forsta) p.roll = forsta.typ;
    else p.roll = p.tillagdRoll || ovrigRoll(p.anmaldSom);
    p.raknasPa = p.roll === 'FS' ? null : forsta || null;
    if (p.roll === 'Ersättare') p.ersNr = forsta.nr;
    if (p.roll === 'Ombud' || p.roll === 'Ersättare') p.distrikt = forsta.distrikt;
    if (p.roll === 'FS') p.distrikt = 'FS';

    const f = inch[k] || {};
    p.status = f.status || '';
    p.tidIn = f.status ? tidText(f.inRa) : '';
    p.tidUt = f.status === 'ute' ? tidText(f.utRa) : '';
    p.tillagd = !!f.tillagd;

    if (p.roller.length && !p.anmald && !p.tillagd) {
      p.flaggor.push('Finns i ombudslistan men saknar anmälan.');
      kontroll.push({ niva: 'info', typ: 'Ej anmäld', text: p.namn + ' (' + rollText(p.roller[0]) + ')', id: k });
    }
    const som = nyckel(p.anmaldSom);
    if (!p.roller.length && (som.indexOf('ombud') >= 0 || som.indexOf('ersattare') >= 0)) {
      p.flaggor.push('Anmäld som ' + p.anmaldSom + ' men finns inte i ombudslistan. Ingen rösträtt.');
      kontroll.push({ niva: 'varning', typ: 'Anmäld som ombud/ersättare utan plats i ombudslistan', text: p.namn + ' (' + (p.anmaldDistrikt || 'okänt distrikt') + ', anmäld som ' + p.anmaldSom + ')', id: k });
    } else if (p.roller.length && p.anmaldSom && som && som !== nyckel(p.roll) && !(p.roll === 'FS' && (som + ' ' + nyckel(p.anmaldDistrikt)).indexOf('fs') >= 0)) {
      p.flaggor.push('Anmäld som ' + p.anmaldSom + ', men är ' + rollLang(p) + ' enligt listorna.');
      kontroll.push({ niva: 'info', typ: 'Annan roll i anmälan', text: p.namn + ': anmäld som ' + p.anmaldSom + ', är ' + rollLang(p), id: k });
    }
    if (p.raknasPa && p.anmaldDistrikt && !sammaDistrikt(p.anmaldDistrikt, p.raknasPa.distrikt)) {
      kontroll.push({ niva: 'info', typ: 'Annat distrikt i anmälan', text: p.namn + ': anmäld för ' + p.anmaldDistrikt + ', står på ' + p.raknasPa.distrikt, id: k });
    }
  });

  // Röstlängdsfliken ska stämma med ombudsfliken
  if (rl.ombud.length) {
    const iRl = {};
    rl.ombud.forEach(o => { iRl[nyckel(o.namn)] = o; });
    const ombudKeys = {};
    ombud.forEach(d => d.platser.forEach(pl => { if (pl.plats.typ === 'Ombud') ombudKeys[pl.person.id] = d.namn; }));
    Object.keys(ombudKeys).forEach(k => {
      if (!iRl[k]) kontroll.push({ niva: 'varning', typ: 'Röstlängdsfliken skiljer sig', text: P[k].namn + ' är ombud för ' + ombudKeys[k] + ' men saknas i fliken ' + FLIK_ROSTLANGD, id: k });
    });
    Object.keys(iRl).forEach(k => {
      if (!ombudKeys[k]) kontroll.push({ niva: 'varning', typ: 'Röstlängdsfliken skiljer sig', text: iRl[k].namn + ' står i fliken ' + FLIK_ROSTLANGD + ' (' + iRl[k].distrikt + ') men är inte ombud i fliken ' + FLIK_OMBUD, id: P[k] ? k : '' });
    });
  }
  ordning.forEach(k => { if (P[k].notering) kontroll.push({ niva: 'info', typ: 'Anteckning i listan', text: P[k].namn + ': ' + P[k].notering, id: k }); });

  // Mandat och ersättare per distrikt
  const inne = p => p.status === 'inne';
  const giltig = pl => pl.person.raknasPa === pl.plats;
  const rostlangd = [];
  const distrikt = ombud.map(d => {
    const ombudPl = d.platser.filter(pl => pl.plats.typ === 'Ombud');
    const ersPl = d.platser.filter(pl => pl.plats.typ === 'Ersättare');
    const pa = ombudPl.filter(pl => giltig(pl) && inne(pl.person));
    let lediga = d.mandat - pa.length;
    const tjanst = [], vantar = [], ersEj = [];
    ersPl.forEach(pl => {
      if (!giltig(pl)) return;
      if (!inne(pl.person)) ersEj.push(pl.person.id);
      else if (tjanst.length < lediga) tjanst.push(pl.person.id);
      else vantar.push(pl.person.id);
    });
    pa.forEach(pl => { pl.person.rost = true; rostlangd.push({ id: pl.person.id, distrikt: d.namn, namn: pl.person.namn, grund: 'Ombud' }); });
    tjanst.forEach(id => { P[id].rost = true; P[id].tjanstgor = true; rostlangd.push({ id: id, distrikt: d.namn, namn: P[id].namn, grund: 'Ersättare ' + P[id].ersNr }); });
    return {
      namn: d.namn,
      mandat: d.mandat,
      ombudInne: pa.length,
      tjanstgor: tjanst,
      vakanta: Math.max(0, d.mandat - pa.length - tjanst.length),
      saknas: ombudPl.filter(pl => !giltig(pl) || !inne(pl.person)).map(pl => ({ id: pl.person.id, ejGiltig: !giltig(pl) })),
      vantar: vantar,
      ersEj: ersEj,
      ombud: ombudPl.map(pl => pl.person.id),
      ersattare: ersPl.map(pl => pl.person.id)
    };
  });
  const fsLista = ordning.filter(k => P[k].roll === 'FS');
  if (FS_ROSTRATT) {
    fsLista.forEach(k => { if (inne(P[k])) { P[k].rost = true; rostlangd.push({ id: k, distrikt: 'FS', namn: P[k].namn, grund: 'FS' }); } });
  }

  const personer = ordning.map(k => P[k]);
  const perId = {};
  personer.forEach(p => { perId[p.id] = p; });
  return {
    personer: personer,
    perId: perId,
    distrikt: distrikt,
    fs: { ids: fsLista, inne: fsLista.filter(k => inne(P[k])).length, rostratt: FS_ROSTRATT },
    totalMandat: ombud.reduce((s, d) => s + d.mandat, 0) + (FS_ROSTRATT ? fsLista.length : 0),
    rostlangd: rostlangd,
    kontroll: kontroll,
    incheckning: inch
  };
}

// Skickar bara det gränssnittet behöver. Aldrig personnummer, e-post eller telefon.
function paket(m) {
  const lista = sparadeRostlangder();
  const senaste = lista.length ? hamtaRostlangd(lista[lista.length - 1].nr) : null;
  return {
    andrad: true,
    version: version(),
    personer: m.personer.map(p => ({
      id: p.id,
      namn: p.namn,
      distrikt: p.distrikt,
      roll: p.roll,
      ersNr: p.ersNr || 0,
      rollText: rollLang(p),
      listroller: p.roller.map(rollText),
      anmald: p.anmald,
      anmaldSom: p.anmaldSom,
      status: p.status,
      tidIn: p.tidIn,
      tidUt: p.tidUt,
      tillagd: p.tillagd,
      rost: !!p.rost,
      tjanstgor: !!p.tjanstgor,
      flaggor: p.flaggor
    })),
    distrikt: m.distrikt,
    fs: m.fs,
    totalMandat: m.totalMandat,
    rostlangd: m.rostlangd.map(r => r.id),
    kontroll: m.kontroll,
    rostlangder: lista,
    senaste: senaste,
    utdelning: UTDELNING,
    rollerPaPlats: ROLLER_PA_PLATS
  };
}

// ===== Läsa flikarna =====

function flik(ss, namn, kravs) {
  let sh = ss.getSheetByName(namn);
  if (!sh) {
    const k = nyckel(namn);
    sh = ss.getSheets().filter(s => nyckel(s.getName()) === k)[0] || null;
  }
  if (!sh && kravs) throw new Error('Hittar inte fliken "' + namn + '".');
  return sh;
}

// Ombud: Distrikt | Antal | Protokoll | 1 | 2 | 3 ... (namn i turordning)
function lasOmbud(ss) {
  const v = flik(ss, FLIK_OMBUD, true).getDataRange().getDisplayValues();
  let hr = -1, antalK = -1;
  for (let r = 0; r < Math.min(10, v.length) && hr < 0; r++) {
    const i = v[r].findIndex(c => nyckel(c) === 'antal' || nyckel(c) === 'mandat');
    if (i >= 0) { hr = r; antalK = i; }
  }
  if (hr < 0) throw new Error('Hittar ingen kolumn "Antal" i fliken ' + FLIK_OMBUD + '.');
  const h = v[hr];
  const dK = Math.max(0, h.findIndex(c => nyckel(c) === 'distrikt'));
  let start = h.findIndex((c, j) => j > antalK && text(c) === '1');
  if (start < 0) {
    const p = h.findIndex(c => nyckel(c) === 'protokoll');
    start = Math.max(antalK, p) + 1;
  }
  const ut = [];
  for (let r = hr + 1; r < v.length; r++) {
    const namn = text(v[r][dK]);
    const mandat = parseInt(text(v[r][antalK]), 10);
    if (!namn || isNaN(mandat) || /totalt/i.test(namn)) continue;
    const platser = [];
    for (let j = start; j < v[r].length; j++) {
      const s = stada(v[r][j]);
      if (s.namn) platser.push(s);
    }
    ut.push({ namn: namn, mandat: mandat, platser: platser });
  }
  return ut;
}

// Röstlängd: Nr | Distrikt | Namn ... FS-ledamöter har distrikt "FS".
function lasRostlangdsflik(ss) {
  const sh = flik(ss, FLIK_ROSTLANGD, false);
  if (!sh) return { fs: [], ombud: [] };
  const v = sh.getDataRange().getDisplayValues();
  let dK = -1;
  for (let r = 0; r < v.length && dK < 0; r++) {
    dK = v[r].findIndex(c => text(c).toUpperCase() === 'FS');
  }
  if (dK < 0) {
    for (let r = 0; r < Math.min(5, v.length) && dK < 0; r++) dK = v[r].findIndex(c => nyckel(c) === 'distrikt');
  }
  if (dK < 0) return { fs: [], ombud: [] };
  const fs = [], ombud = [];
  v.forEach(rad => {
    const d = text(rad[dK]);
    const s = stada(rad[dK + 1]);
    if (!d || !s.namn || nyckel(d) === 'distrikt') return;
    if (d.toUpperCase() === 'FS') fs.push(s);
    else ombud.push({ distrikt: d, namn: s.namn });
  });
  return { fs: fs, ombud: ombud };
}

// Anmälan: Förnamn | Efternamn | ... | Distrikt | Deltar som
function lasAnmalan(ss) {
  const sh = flik(ss, FLIK_ANMALAN, false);
  if (!sh) return { personer: [], dubbletter: [] };
  const v = sh.getDataRange().getDisplayValues();
  let hr = -1;
  for (let r = 0; r < Math.min(5, v.length) && hr < 0; r++) {
    if (v[r].some(c => ['fornamn', 'namn'].indexOf(nyckel(c)) >= 0)) hr = r;
  }
  if (hr < 0) return { personer: [], dubbletter: [] };
  const h = v[hr].map(nyckel);
  const k = alias => h.findIndex(c => alias.indexOf(c) >= 0);
  const fK = k(['fornamn', 'first name']);
  const eK = k(['efternamn', 'last name']);
  const nK = k(['namn', 'fullstandigt namn']);
  const dK = k(['distrikt']);
  let sK = k(['deltar som', 'roll', 'kategori', 'deltagartyp']);
  if (sK < 0) sK = h.findIndex(c => c.indexOf('deltar') >= 0);

  const map = {}, ordning = [];
  for (let r = hr + 1; r < v.length; r++) {
    const rad = v[r];
    const namn = stada(nK >= 0 && text(rad[nK]) ? rad[nK] : [fK >= 0 ? rad[fK] : '', eK >= 0 ? rad[eK] : ''].join(' ')).namn;
    if (!namn) continue;
    const a = { namn: namn, distrikt: dK >= 0 ? text(rad[dK]) : '', deltarSom: sK >= 0 ? text(rad[sK]) : '' };
    const key = nyckel(namn);
    if (!map[key]) { map[key] = { forsta: a, antal: 1, olika: [] }; ordning.push(key); continue; }
    const m = map[key];
    m.antal++;
    if (a.distrikt && nyckel(a.distrikt) !== nyckel(m.forsta.distrikt)) m.olika.push('distrikt ' + a.distrikt);
    if (a.deltarSom && nyckel(a.deltarSom) !== nyckel(m.forsta.deltarSom)) m.olika.push('deltar som ' + a.deltarSom);
  }
  return {
    personer: ordning.map(key => map[key].forsta),
    dubbletter: ordning.filter(key => map[key].antal > 1).map(key => ({ namn: map[key].forsta.namn, antal: map[key].antal, olika: map[key].olika.join(', ') }))
  };
}

function incheckningsflik(ss, skapa) {
  let sh = flik(ss, FLIK_INCHECKNING, false);
  if (!sh && skapa) {
    sh = ss.insertSheet(FLIK_INCHECKNING);
    sh.getRange(1, 1, 1, INCHECKNING_RUBRIKER.length).setValues([INCHECKNING_RUBRIKER]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function lasIncheckning(ss) {
  const sh = incheckningsflik(ss, false);
  const ut = {};
  if (!sh) return ut;
  const v = sh.getDataRange().getDisplayValues();
  for (let r = 1; r < v.length; r++) {
    const k = text(v[r][0]) || nyckel(v[r][1]);
    if (!k) continue;
    ut[k] = {
      rad: r + 1,
      namn: text(v[r][1]),
      distrikt: text(v[r][2]),
      roll: text(v[r][3]),
      status: tolkaStatus(v[r][4]),
      inRa: text(v[r][5]),
      utRa: text(v[r][6]),
      tillagd: ['ja', 'x', 'true'].indexOf(nyckel(v[r][7])) >= 0
    };
  }
  return ut;
}

function skrivIncheckning(ss, m, p, status, inTid, utTid, tillagd) {
  const sh = incheckningsflik(ss, true);
  const rad = [[p.id, p.namn, p.distrikt, rollLang(p), status, inTid, utTid, tillagd]];
  const f = m.incheckning[p.id];
  const nr = f ? f.rad : sh.getLastRow() + 1;
  sh.getRange(nr, 1, 1, rad[0].length).setNumberFormat('@').setValues(rad);
}

// ===== Röstlängder =====

function sparadeRostlangder() {
  const s = PropertiesService.getScriptProperties().getProperty('RL_LISTA');
  return s ? JSON.parse(s) : [];
}

function hamtaRostlangd(nr) {
  const s = PropertiesService.getScriptProperties().getProperty('RL_' + nr);
  if (!s) return null;
  const o = JSON.parse(s);
  o.nr = nr;
  return o;
}

function sparaRostlangd(nr, tid, flik, rostlangd) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('RL_' + nr, JSON.stringify({ tid: tid, rader: rostlangd.map(r => [r.id, r.distrikt, r.namn, r.grund]) }));
  const lista = sparadeRostlangder();
  lista.push({ nr: nr, tid: tid, flik: flik, antal: rostlangd.length });
  props.setProperty('RL_LISTA', JSON.stringify(lista));
}

function jamfor(forra, nu) {
  if (!forra) return { tillkom: [], utgick: [] };
  const fore = {};
  forra.rader.forEach(r => { fore[r[0]] = { distrikt: r[1], namn: r[2], grund: r[3] }; });
  const efter = {};
  nu.forEach(r => { efter[r.id] = r; });
  return {
    tillkom: nu.filter(r => !fore[r.id]).map(r => ({ distrikt: r.distrikt, namn: r.namn, grund: r.grund })),
    utgick: forra.rader.filter(r => !efter[r[0]]).map(r => ({ distrikt: r[1], namn: r[2], grund: r[3] }))
  };
}

// ===== Hjälpfunktioner =====

// Tar bort anteckningar inom parentes och skräptecken: "Neo Sahlin (medlem i örebro?)"
function stada(v) {
  const s = text(v);
  const m = s.match(/\(([^)]*)\)?/);
  const namn = s.replace(/\(.*$/, '').replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { namn: namn, notering: m ? m[1].trim() : '' };
}

function nyckel(s) {
  return text(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function forstSist(k) {
  const d = k.split(' ');
  return d.length > 1 ? d[0] + ' ' + d[d.length - 1] : k;
}

function sammaDistrikt(a, b) {
  const x = nyckel(a), y = nyckel(b);
  return !x || !y || x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0;
}

function ovrigRoll(som) {
  const s = text(som);
  const k = nyckel(s);
  if (!k || k.indexOf('ombud') >= 0 || k.indexOf('ersattare') >= 0) return 'Observatör';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function rollText(r) {
  if (r.typ === 'FS') return 'FS';
  return r.typ + (r.typ === 'Ersättare' ? ' ' + r.nr : '') + ', ' + r.distrikt;
}

function rollLang(p) {
  if (p.roll === 'Ersättare') return 'Ersättare ' + p.ersNr + ', ' + p.distrikt;
  if (p.roll === 'Ombud') return 'Ombud, ' + p.distrikt;
  return p.roll;
}

function statusText(s) {
  return s === 'inne' ? 'På plats' : s === 'ute' ? 'Lämnat' : '';
}

function tolkaStatus(v) {
  const k = nyckel(v);
  if (['pa plats', 'inne', 'ja', 'x', 'incheckad'].indexOf(k) >= 0) return 'inne';
  if (['lamnat', 'ute', 'utcheckad'].indexOf(k) >= 0) return 'ute';
  return '';
}

function tidText(v) {
  const m = text(v).match(/(\d{1,2}:\d{2})/);
  return m ? m[1] : text(v);
}

function text(v) {
  if (v == null) return '';
  return String(v).trim();
}

// ===== Säkerhet, lås och version =====

function kontrolleraPin(pin) {
  if (PIN === 'ÄNDRA') throw new Error('PIN är inte satt. Ändra raden const PIN i Code.gs.');
  if (text(pin) !== text(PIN)) throw new Error('FEL_PIN');
}

function medLas(fn) {
  const las = LockService.getScriptLock();
  if (!las.tryLock(20000)) throw new Error('Systemet är upptaget, försök igen.');
  try {
    return fn();
  } finally {
    SpreadsheetApp.flush();
    las.releaseLock();
  }
}

function version() {
  return PropertiesService.getScriptProperties().getProperty('VERSION') || '0';
}

function hojVersion() {
  PropertiesService.getScriptProperties().setProperty('VERSION', String(Date.now()) + Math.floor(Math.random() * 1000));
}
