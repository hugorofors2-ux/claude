/**
 * Stämma: incheckning, ersättare och röstlängd för stämmor.
 *
 * Fliken Röstlängd är facit: en rad per ombud med ombudsnummer, distrikt och
 * namn, och ersättarna i turordning från kolumnen Ersättare och åt höger.
 * Rader med distrikt FS är förbundsstyrelsen. Fliken Anmälan innehåller de
 * anmälda, och en eventuell flik Ombud används som kontroll.
 */

const Stamma = (function () {
  const FLIK_OMBUD = 'Ombud';
  const FLIK_ROSTLANGD = 'Röstlängd';
  const FLIK_ANMALAN = 'Anmälan';
  const FLIK_INCHECKNING = 'Incheckning';
  const FLIK_TJANSTGORING = 'Tjänstgöring';
  const FACIT = 'Röstlängd';
  const TIDSZON = 'Europe/Stockholm';
  const INCHECKNING_RUBRIKER = ['Nyckel', 'Namn', 'Distrikt', 'Roll', 'Status', 'Incheckad', 'Utcheckad', 'Tillagd på plats'];
  const TJANSTGORING_RUBRIKER = ['Ombudsnr', 'Distrikt', 'Ordinarie ombud', 'Tjänstgörande ersättare', 'Nyckel', 'Sedan'];
  const ROLLER_PA_PLATS = ['Observatör', 'Gäst', 'Funktionär', 'Press'];
  const STANDARD_UTDELNING = {
    'Ombud': 'Röstkort och namnlapp',
    'Ersättare': 'Namnlapp. Röstkort enligt rutin för ersättare.',
    'FS': 'Röstkort och namnlapp',
    'Övriga': 'Namnlapp'
  };

  // Sätts per anrop utifrån evenemangets inställningar.
  let EV = null;
  let ARK = null;
  let FS_ROSTRATT = true;
  let DUBBELROLL_RAKNAS_SOM = 'FS';
  let UTDELNING = STANDARD_UTDELNING;

  function init(ev) {
    EV = ev;
    ARK = null;
    const i = ev.inst || {};
    FS_ROSTRATT = i.fsRostratt !== false;
    DUBBELROLL_RAKNAS_SOM = i.dubbelroll === 'Ombud' ? 'Ombud' : 'FS';
    UTDELNING = Object.assign({}, STANDARD_UTDELNING, i.utdelning || {});
  }

  function ark() {
    return ARK || (ARK = SpreadsheetApp.openById(EV.arkId));
  }

  // ===== Anrop från gränssnittet =====

  function hamtaData(pin, kandVersion) {
    kontrolleraPin(pin);
    const v = version();
    if (kandVersion && kandVersion === v) return { andrad: false, version: v };
    return paket(bygg(ark()));
  }

  // status: 'inne' (på plats), 'ute' (har lämnat) eller '' (ångra, ej incheckad)
  function sattStatus(pin, id, status) {
    kontrolleraPin(pin);
    if (['inne', 'ute', ''].indexOf(status) < 0) throw new Error('Okänd status.');
    return medLas(() => {
      const ss = ark();
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
      m.platser.forEach(pl => {
        if (!pl.tilldelad) return;
        // Ombudet tar tillbaka sin plats direkt. En ersättare som lämnar frigör platsen.
        if ((status === 'inne' && pl.ombud === id && pl.giltig) || (status !== 'inne' && pl.tilldelad === id)) {
          skrivTjanstgoring(ss, m, pl, null);
        }
      });
      hojVersion();
      return paket(bygg(ss));
    });
  }

  // Sätter vilken ersättare som tjänstgör på en ombudsplats. Tomt ersId tar bort ersättaren.
  function sattErsattare(pin, nr, ersId) {
    kontrolleraPin(pin);
    return medLas(() => {
      const ss = ark();
      const m = bygg(ss);
      const pl = m.platser.filter(x => x.nr === Number(nr))[0];
      if (!pl) throw new Error('Plats ' + nr + ' finns inte.');
      if (pl.fs) throw new Error('FS-platser har inga ersättare.');
      let e = null;
      if (ersId) {
        e = m.perId[ersId];
        if (!e || e.roll !== 'Ersättare' || e.distrikt !== pl.distrikt) throw new Error('Välj en ersättare från ' + pl.distrikt + '.');
        if (e.status !== 'inne') throw new Error(e.namn + ' är inte incheckad.');
        if (pl.typ === 'ombud') throw new Error('Ombudet är på plats och har platsen.');
        const annan = m.platser.filter(x => x.nr !== pl.nr && x.tilldelad === ersId)[0];
        if (annan) throw new Error(e.namn + ' tjänstgör redan på plats ' + annan.nr + '.');
      }
      skrivTjanstgoring(ss, m, pl, e);
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
      const ss = ark();
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
      const ss = ark();
      const m = bygg(ss);
      const lista = sparadeRostlangder();
      const nr = lista.length + 1;
      const nu = new Date();
      const tid = Utilities.formatDate(nu, TIDSZON, 'yyyy-MM-dd HH:mm');
      const rader = m.rostlangd.map(r => [r.nr, r.distrikt, r.namn, r.grund]);
      const forra = lista.length ? hamtaRostlangd(lista[lista.length - 1].nr) : null;
      const diff = jamfor(forra, m.rostlangd);

      const fliknamn = 'Röstlängd ' + nr + ' kl ' + Utilities.formatDate(nu, TIDSZON, 'HH.mm');
      const sh = ss.insertSheet(fliknamn, ss.getSheets().length);
      const ut = [
        ['Röstlängd nr ' + nr, 'Fastställd ' + tid, '', ''],
        ['Röstberättigade', m.rostlangd.length, '', ''],
        ['', '', '', ''],
        ['Ombudsnr', 'Distrikt', 'Namn', 'Grund']
      ].concat(rader);
      if (forra) {
        ut.push(['', '', '', '']);
        ut.push(['Förändring mot röstlängd nr ' + forra.nr, '', '', '']);
        diff.tillkom.forEach(r => ut.push(['Tillkommit, plats ' + r.nr, r.distrikt, r.namn, r.grund || '']));
        diff.utgick.forEach(r => ut.push(['Utgått, plats ' + r.nr, r.distrikt, r.namn, r.grund || '']));
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
    const rl = lasRostlangdsflik(ss, FACIT !== 'Ombud');
    const om = lasOmbud(ss, FACIT === 'Ombud');
    const ombud = FACIT === 'Ombud' ? om : rl.distrikt;
    const jamforMed = FACIT === 'Ombud' ? rl.distrikt : om;
    const facitFlik = FACIT === 'Ombud' ? FLIK_OMBUD : FLIK_ROSTLANGD;
    const jamforFlik = FACIT === 'Ombud' ? FLIK_ROSTLANGD : FLIK_OMBUD;
    const anm = lasAnmalan(ss);
    const inch = lasIncheckning(ss);
    const kontroll = [];
    const P = {};
    const ordning = [];

    const person = (namn, notering, id) => {
      const k = id || nyckel(namn);
      if (!P[k]) {
        P[k] = { id: k, nyckel: nyckel(namn), namn: namn, distrikt: '', roller: [], anmald: false, anmaldSom: '', anmaldDistrikt: '', notering: '', flaggor: [] };
        ordning.push(k);
      }
      if (notering && P[k].notering.indexOf(notering) < 0) P[k].notering = (P[k].notering ? P[k].notering + '; ' : '') + notering;
      return P[k];
    };

    // Ombudslistan
    ombud.forEach(d => {
      d.platser.forEach((pl, i) => {
        const pos = i + 1;
        // Samma namn i ett annat distrikt är en annan person, t.ex. två "Anna Ek" i olika distrikt.
        let id = nyckel(pl.namn);
        const annan = P[id] && P[id].roller.filter(r => r.typ !== 'FS' && r.distrikt !== d.namn)[0];
        if (annan) {
          id = id + '@' + nyckel(d.namn);
          kontroll.push({ niva: 'info', typ: 'Samma namn i flera distrikt', text: pl.namn + ' (' + annan.distrikt + ' och ' + d.namn + ') hanteras som olika personer', id: id });
        }
        const p = person(pl.namn, pl.notering, id);
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
      p.fsNr = n.nr || 0;
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

    // Matchning mot anmälan. Först exakt namn, sedan med tolerans för stavning.
    const listKeys = ordning.slice();
    const ord = k => k.split(' ');
    const kandidat = (k, distr) => {
      const t = ord(k);
      const steg = [
        // Samma för- och efternamn, mellannamn ignoreras
        L => forstSist(L) === forstSist(k),
        // Det ena namnet ryms helt i det andra: "Anna Ek" / "Anna Ek Holm"
        L => { const u = ord(L); return t.length > 1 && u.length > 1 && (t.every(x => u.indexOf(x) >= 0) || u.every(x => t.indexOf(x) >= 0)); },
        // Samma förnamn, efternamn stavat nästan likadant: "Andersson" / "Andersosn"
        L => { const u = ord(L); const a = t[t.length - 1], b = u[u.length - 1]; return t.length > 1 && u.length > 1 && u[0] === t[0] && b.length >= 4 && lev(a, b) <= 2; },
        // Hela namnet stavat nästan likadant: "Natalie Ek" / "Nathalie Ek"
        L => k.length >= 8 && lev(k, L) <= 2
      ];
      for (let i = 0; i < steg.length; i++) {
        let c = listKeys.filter(L => steg[i](P[L].nyckel));
        if (c.length > 1) c = c.filter(L => sammaDistrikt(distr, P[L].distrikt));
        if (c.length === 1) return c[0];
        if (c.length > 1) return null;
      }
      return null;
    };
    const koppla = (p, a) => {
      p.anmald = true;
      p.anmaldSom = a.deltarSom;
      p.anmaldDistrikt = a.distrikt;
      if (!p.distrikt) p.distrikt = a.distrikt;
    };
    // Exakt namn. Finns namnet i flera distrikt avgör distriktet i anmälan.
    const exakt = a => {
      const k = nyckel(a.namn);
      const c = listKeys.filter(L => P[L].nyckel === k);
      if (c.length <= 1) return c[0];
      const d = c.filter(L => sammaDistrikt(a.distrikt, P[L].distrikt));
      return d.length === 1 ? d[0] : c.filter(L => !P[L].anmald)[0] || c[0];
    };
    const rest = [];
    anm.personer.forEach(a => {
      const L = exakt(a);
      if (L) koppla(P[L], a);
      else rest.push(a);
    });
    rest.forEach(a => {
      const L = kandidat(nyckel(a.namn), a.distrikt);
      if (!L) { koppla(person(a.namn), a); return; }
      const p = P[L];
      kontroll.push({ niva: 'info', typ: 'Kopplad trots olika stavning', text: 'Anmälan "' + a.namn + '" = "' + p.namn + '" i listan' + (p.anmald ? ' (dubblett, slogs ihop)' : ''), id: L });
      if (!p.anmald) koppla(p, a);
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
      if (!p.roller.length) p.distrikt = kanonisktDistrikt(p.distrikt, ombud);

      const f = inch[k] || {};
      p.status = f.status || '';
      p.tidIn = f.status ? tidText(f.inRa) : '';
      p.tidUt = f.status === 'ute' ? tidText(f.utRa) : '';
      p.tillagd = !!f.tillagd;

      if (p.roller.length && !p.anmald && !p.tillagd) {
        p.flaggor.push('Finns i ombudslistan men saknar anmälan.');
        const ombud = p.roll === 'Ombud';
        kontroll.push({ niva: ombud ? 'varning' : 'info', typ: ombud ? 'Ombud som inte är anmälda' : 'Ej anmäld', text: p.namn + ' (' + rollText(p.raknasPa || p.roller[0]) + ')', id: k });
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

    // Den andra fliken används som kontroll av facit
    ombud.forEach(d => (d.dubbletter || []).forEach(n => {
      kontroll.push({ niva: 'info', typ: 'Står två gånger i fliken ' + facitFlik, text: n + ' (' + d.namn + '), räknas en gång', id: nyckel(n) });
    }));
    if (jamforMed.length) {
      const platser = lista => {
        const m = {};
        lista.forEach(d => d.platser.forEach((pl, i) => {
          const k = nyckel(pl.namn);
          if (m[k]) return;
          const typ = i < d.mandat ? 'Ombud' : 'Ersättare';
          m[k] = { namn: pl.namn, distrikt: d.namn, typ: typ, txt: (typ === 'Ombud' ? 'Ombud' : 'Ersättare ' + (i + 1 - d.mandat)) + ', ' + d.namn };
        }));
        return m;
      };
      const a = platser(ombud), b = platser(jamforMed);
      const typ = 'Flikarna ' + facitFlik + ' och ' + jamforFlik + ' skiljer sig';
      Object.keys(a).forEach(k => {
        if (!b[k]) kontroll.push({ niva: 'varning', typ: typ, text: a[k].namn + ': ' + a[k].txt + ' i ' + facitFlik + ', saknas i ' + jamforFlik, id: k });
        else if (a[k].typ !== b[k].typ || !sammaDistrikt(a[k].distrikt, b[k].distrikt)) {
          kontroll.push({ niva: 'varning', typ: typ, text: a[k].namn + ': ' + a[k].txt + ' i ' + facitFlik + ', men ' + b[k].txt + ' i ' + jamforFlik, id: k });
        }
      });
      Object.keys(b).forEach(k => {
        if (!a[k]) kontroll.push({ niva: 'varning', typ: typ, text: b[k].namn + ': ' + b[k].txt + ' i ' + jamforFlik + ', saknas i ' + facitFlik + ' och räknas inte', id: P[k] ? k : '' });
      });
      jamforMed.forEach(d => (d.dubbletter || []).forEach(n => {
        kontroll.push({ niva: 'info', typ: 'Står två gånger i fliken ' + jamforFlik, text: n + ' (' + d.namn + ')', id: P[nyckel(n)] ? nyckel(n) : '' });
      }));
    }
    ordning.forEach(k => { if (P[k].notering) kontroll.push({ niva: 'info', typ: 'Anteckning i listan', text: P[k].namn + ': ' + P[k].notering, id: k }); });

    // Platser 1-113: ett ombud per plats, FS sist
    const inne = p => p.status === 'inne';
    const tj = lasTjanstgoring(ss);
    const platser = [];
    let lopnr = 0;
    const nyttNr = nr => { lopnr = nr ? Math.max(lopnr, nr) : lopnr + 1; return nr || lopnr; };
    ombud.forEach(d => d.platser.forEach(pl => {
      if (pl.plats.typ !== 'Ombud') return;
      platser.push({ nr: nyttNr(pl.nr), distrikt: d.namn, ombud: pl.person.id, giltig: pl.person.raknasPa === pl.plats, fs: false });
    }));
    const fsLista = ordning.filter(k => P[k].roll === 'FS');
    if (FS_ROSTRATT) fsLista.forEach(k => platser.push({ nr: nyttNr(P[k].fsNr), distrikt: 'FS', ombud: k, giltig: true, fs: true }));
    platser.sort((a, b) => a.nr - b.nr);

    // Vem har platsen just nu: ombudet, en bekräftad ersättare eller ingen
    const upptagen = {};
    platser.forEach(pl => {
      const o = P[pl.ombud];
      o.plats = pl.nr;
      const t = tj[pl.nr];
      pl.tilldelad = t && t.ersId && P[t.ersId] ? t.ersId : '';
      pl.sedan = t ? t.sedan : '';
      if (pl.giltig && inne(o)) { pl.innehavare = o.id; pl.typ = 'ombud'; return; }
      pl.innehavare = '';
      pl.typ = 'tom';
      if (pl.fs || !pl.tilldelad) return;
      const e = P[pl.tilldelad];
      if (e.roll !== 'Ersättare' || e.distrikt !== pl.distrikt) pl.problem = e.namn + ' är inte ersättare för ' + pl.distrikt + '.';
      else if (!inne(e)) pl.problem = e.namn + ' är inte på plats.';
      else if (upptagen[e.id]) pl.problem = e.namn + ' tjänstgör redan på plats ' + upptagen[e.id] + '.';
      else { pl.innehavare = e.id; pl.typ = 'ersattare'; upptagen[e.id] = pl.nr; }
    });

    // Förslag: nästa ersättare i turordning som är på plats och inte redan tjänstgör
    const distrikt = ombud.map(d => {
      const ombudPl = d.platser.filter(pl => pl.plats.typ === 'Ombud');
      const ersPl = d.platser.filter(pl => pl.plats.typ === 'Ersättare' && pl.person.raknasPa === pl.plats);
      const mina = platser.filter(pl => pl.distrikt === d.namn && !pl.fs);
      const lediga = ersPl.map(pl => pl.person.id).filter(id => inne(P[id]) && !upptagen[id]);
      mina.forEach(pl => {
        if (pl.typ !== 'tom' || !lediga.length) return;
        pl.forslag = lediga.shift();
        P[pl.forslag].forslagPlats = pl.nr;
      });
      return {
        namn: d.namn,
        mandat: d.mandat,
        ombudInne: mina.filter(pl => pl.typ === 'ombud').length,
        tjanstgor: mina.filter(pl => pl.typ === 'ersattare').map(pl => pl.innehavare),
        forslag: mina.filter(pl => pl.forslag).map(pl => pl.forslag),
        vakanta: mina.filter(pl => pl.typ === 'tom').length,
        saknas: ombudPl.filter(pl => pl.person.raknasPa !== pl.plats || !inne(pl.person)).map(pl => ({ id: pl.person.id, ejGiltig: pl.person.raknasPa !== pl.plats })),
        vantar: lediga,
        ersEj: ersPl.map(pl => pl.person.id).filter(id => !inne(P[id])),
        ombud: ombudPl.map(pl => pl.person.id),
        ersattare: ersPl.map(pl => pl.person.id)
      };
    });

    const rostlangd = [];
    platser.forEach(pl => {
      if (!pl.innehavare) return;
      const h = P[pl.innehavare];
      h.rost = true;
      if (pl.typ === 'ersattare') { h.tjanstgor = true; h.plats = pl.nr; }
      rostlangd.push({
        nr: pl.nr,
        id: h.id,
        distrikt: pl.distrikt,
        namn: h.namn,
        grund: pl.fs ? 'FS' : pl.typ === 'ombud' ? 'Ombud' : 'Ersättare ' + h.ersNr + ' för ' + P[pl.ombud].namn
      });
    });

    const personer = ordning.map(k => P[k]);
    const perId = {};
    personer.forEach(p => { perId[p.id] = p; });
    return {
      personer: personer,
      perId: perId,
      distrikt: distrikt,
      platser: platser,
      fs: { ids: fsLista, inne: fsLista.filter(k => inne(P[k])).length, rostratt: FS_ROSTRATT },
      totalMandat: platser.length,
      rostlangd: rostlangd,
      kontroll: kontroll,
      incheckning: inch,
      facit: facitFlik
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
        plats: p.plats || 0,
        forslagPlats: p.forslagPlats || 0,
        flaggor: p.flaggor
      })),
      distrikt: m.distrikt,
      fs: m.fs,
      totalMandat: m.totalMandat,
      rostlangd: m.rostlangd.map(r => ({ nr: r.nr, id: r.id, grund: r.grund })),
      platser: m.platser.map(pl => ({
        nr: pl.nr, distrikt: pl.distrikt, ombud: pl.ombud, giltig: pl.giltig, fs: pl.fs,
        typ: pl.typ, innehavare: pl.innehavare, tilldelad: pl.tilldelad, forslag: pl.forslag || '',
        problem: pl.problem || '', sedan: pl.sedan
      })),
      kontroll: m.kontroll,
      facit: m.facit,
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
  function lasOmbud(ss, kravs) {
    const sh = flik(ss, FLIK_OMBUD, kravs);
    if (!sh) return [];
    const v = sh.getDataRange().getDisplayValues();
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
      const platser = [], dubbletter = [];
      for (let j = start; j < v[r].length; j++) {
        const s = stada(v[r][j]);
        if (!s.namn) continue;
        if (platser.some(pl => nyckel(pl.namn) === nyckel(s.namn))) dubbletter.push(s.namn);
        else platser.push(s);
      }
      ut.push({ namn: namn, mandat: mandat, platser: platser, dubbletter: dubbletter });
    }
    return ut;
  }

  // Röstlängd: Nr | Distrikt | Namn | Ersättare ...
  // Varje rad är ett ombud. Ersättarna står i turordning från kolumnen Ersättare och
  // åt höger, på distriktets rader. FS-ledamöter har distrikt "FS".
  function lasRostlangdsflik(ss, kravs) {
    const tom = { distrikt: [], fs: [] };
    const sh = flik(ss, FLIK_ROSTLANGD, kravs);
    if (!sh) return tom;
    const v = sh.getDataRange().getDisplayValues();
    let hr = -1, dK = -1, nK = -1, eK = -1, nrK = -1;
    for (let r = 0; r < Math.min(5, v.length) && hr < 0; r++) {
      const h = v[r].map(nyckel);
      if (h.indexOf('distrikt') >= 0) {
        hr = r;
        dK = h.indexOf('distrikt');
        nK = h.indexOf('namn');
        eK = h.findIndex(c => c.indexOf('ersattare') === 0);
        nrK = h.findIndex(c => ['ombud', 'nr', 'ombudsnr', 'ombudsnummer', 'nummer'].indexOf(c) >= 0);
      }
    }
    if (hr < 0) {
      for (let r = 0; r < v.length && dK < 0; r++) dK = v[r].findIndex(c => text(c).toUpperCase() === 'FS');
    }
    if (dK < 0) {
      if (kravs) throw new Error('Hittar ingen kolumn "Distrikt" i fliken ' + FLIK_ROSTLANGD + '.');
      return tom;
    }
    if (nK < 0) nK = dK + 1;
    if (eK < 0) eK = nK + 1;

    const per = {}, ordn = [], fs = [];
    for (let r = hr + 1; r < v.length; r++) {
      const rad = v[r];
      const d = text(rad[dK]);
      if (!d) continue;
      const s = stada(rad[nK]);
      s.nr = nrK >= 0 ? parseInt(text(rad[nrK]), 10) || 0 : 0;
      if (d.toUpperCase() === 'FS') { if (s.namn) fs.push(s); continue; }
      if (!per[d]) { per[d] = { ombud: [], ers: [], dubbletter: [] }; ordn.push(d); }
      const x = per[d];
      const lagg = (lista, n) => {
        if (!n.namn) return;
        if (x.ombud.concat(x.ers).some(o => nyckel(o.namn) === nyckel(n.namn))) x.dubbletter.push(n.namn);
        else lista.push(n);
      };
      lagg(x.ombud, s);
      for (let j = eK; j < rad.length; j++) lagg(x.ers, stada(rad[j]));
    }
    return {
      distrikt: ordn.map(d => ({ namn: d, mandat: per[d].ombud.length, platser: per[d].ombud.concat(per[d].ers), dubbletter: per[d].dubbletter })),
      fs: fs
    };
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

  function lasTjanstgoring(ss) {
    const sh = flik(ss, FLIK_TJANSTGORING, false);
    const ut = {};
    if (!sh) return ut;
    const v = sh.getDataRange().getDisplayValues();
    for (let r = 1; r < v.length; r++) {
      const nr = parseInt(text(v[r][0]), 10);
      if (!nr) continue;
      ut[nr] = { rad: r + 1, ersId: text(v[r][4]) || nyckel(v[r][3]), sedan: tidText(v[r][5]) };
    }
    return ut;
  }

  function skrivTjanstgoring(ss, m, pl, e) {
    let sh = flik(ss, FLIK_TJANSTGORING, false);
    if (!sh) {
      sh = ss.insertSheet(FLIK_TJANSTGORING);
      sh.getRange(1, 1, 1, TJANSTGORING_RUBRIKER.length).setValues([TJANSTGORING_RUBRIKER]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    const nu = Utilities.formatDate(new Date(), TIDSZON, 'yyyy-MM-dd HH:mm');
    const rad = [[pl.nr, pl.distrikt, m.perId[pl.ombud].namn, e ? e.namn : '', e ? e.id : '', e ? nu : '']];
    const v = sh.getDataRange().getDisplayValues();
    let nr = -1;
    for (let r = 1; r < v.length; r++) if (parseInt(text(v[r][0]), 10) === pl.nr) nr = r + 1;
    if (nr < 0) nr = sh.getLastRow() + 1;
    sh.getRange(nr, 1, 1, rad[0].length).setNumberFormat('@').setValues(rad);
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
    const s = PropertiesService.getScriptProperties().getProperty('RL_LISTA_' + EV.id);
    return s ? JSON.parse(s) : [];
  }

  function hamtaRostlangd(nr) {
    const s = PropertiesService.getScriptProperties().getProperty('RL_' + EV.id + '_' + nr);
    if (!s) return null;
    const o = JSON.parse(s);
    o.nr = nr;
    return o;
  }

  function sparaRostlangd(nr, tid, flik, rostlangd) {
    const props = PropertiesService.getScriptProperties();
    props.setProperty('RL_' + EV.id + '_' + nr, JSON.stringify({ tid: tid, rader: rostlangd.map(r => [r.id, r.distrikt, r.namn, r.grund, r.nr]) }));
    const lista = sparadeRostlangder();
    lista.push({ nr: nr, tid: tid, flik: flik, antal: rostlangd.length });
    props.setProperty('RL_LISTA_' + EV.id, JSON.stringify(lista));
  }

  function jamfor(forra, nu) {
    if (!forra) return { tillkom: [], utgick: [] };
    const fore = {};
    forra.rader.forEach(r => { fore[r[0]] = r; });
    const efter = {};
    nu.forEach(r => { efter[r.id] = r; });
    return {
      tillkom: nu.filter(r => !fore[r.id]).map(r => ({ nr: r.nr, distrikt: r.distrikt, namn: r.namn, grund: r.grund })),
      utgick: forra.rader.filter(r => !efter[r[0]]).map(r => ({ nr: r[4] || '', distrikt: r[1], namn: r[2], grund: r[3] }))
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
    return !x || !y || x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0 || (x.length >= 6 && lev(x, y) <= 2);
  }

  // "Östergötland" i anmälan och "Östergörland" i listan blir samma distrikt.
  function kanonisktDistrikt(namn, distrikt) {
    const k = nyckel(namn);
    if (!k) return namn;
    const traff = distrikt.filter(d => nyckel(d.namn) === k || (k.length >= 6 && lev(k, nyckel(d.namn)) <= 2));
    return traff.length === 1 ? traff[0].namn : namn;
  }

  // Antal tecken som skiljer två strängar (Levenshtein).
  function lev(a, b) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 2) return 99;
    let fore = [];
    for (let j = 0; j <= b.length; j++) fore[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const nu = [i];
      for (let j = 1; j <= b.length; j++) {
        nu[j] = Math.min(fore[j] + 1, nu[j - 1] + 1, fore[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      fore = nu;
    }
    return fore[b.length];
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
    behorig(pin, EV);
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
    return PropertiesService.getScriptProperties().getProperty('V_' + EV.id) || '0';
  }

  function hojVersion() {
    hojVersionFor(EV.id);
  }

  // ===== Nytt evenemang =====

  // Behåller bara namn, distrikt och roll från anmälan. Personnummer, e-post
  // och telefon följer aldrig med in i evenemangets kalkylark.
  function stadaAnmalan(v) {
    const rubriker = ['Förnamn', 'Efternamn', 'Distrikt', 'Deltar som'];
    const rader = (v || []).filter(r => r && r.some(c => text(c)));
    let hr = -1;
    for (let r = 0; r < Math.min(5, rader.length) && hr < 0; r++) {
      if (rader[r].some(c => ['fornamn', 'namn'].indexOf(nyckel(c)) >= 0)) hr = r;
    }
    if (hr < 0) return rader.length ? null : [rubriker];
    const h = rader[hr].map(nyckel);
    const k = alias => h.findIndex(c => alias.indexOf(c) >= 0);
    const fK = k(['fornamn', 'first name']), eK = k(['efternamn', 'last name']), nK = k(['namn', 'fullstandigt namn']);
    const dK = k(['distrikt']);
    let sK = k(['deltar som', 'roll', 'kategori', 'deltagartyp']);
    if (sK < 0) sK = h.findIndex(c => c.indexOf('deltar') >= 0);
    const ut = [rubriker];
    for (let r = hr + 1; r < rader.length; r++) {
      const x = rader[r];
      let f = fK >= 0 ? text(x[fK]) : '', e = eK >= 0 ? text(x[eK]) : '';
      if (!f && !e && nK >= 0) { const d = text(x[nK]).split(/\s+/); f = d.shift() || ''; e = d.join(' '); }
      if (!f && !e) continue;
      ut.push([f, e, dK >= 0 ? text(x[dK]) : '', sK >= 0 ? text(x[sK]) : '']);
    }
    return ut;
  }

  function rektangel(v) {
    const rader = (v || []).filter(r => r && r.some(c => text(c)));
    const w = Math.max(1, ...rader.map(r => r.length));
    return rader.map(r => { const a = r.map(text); while (a.length < w) a.push(''); return a; });
  }

  // Ett kalkylark i minnet, så att samma kod kan förhandsgranska utan att spara något.
  function minnesArk(flikar) {
    const sheets = Object.keys(flikar).filter(n => flikar[n] && flikar[n].length).map(n => ({
      getName: () => n,
      getDataRange: () => ({ getDisplayValues: () => rektangel(flikar[n]) })
    }));
    return { getSheetByName: n => sheets.filter(s => s.getName() === n)[0] || null, getSheets: () => sheets };
  }

  function forhandsgranska(d) {
    init({ id: 'forhandsgranskning', inst: d.inst || {} });
    const t = d.tabeller || {};
    const anm = stadaAnmalan(t.anmalan);
    if (anm === null) throw new Error('Hittar inga rubriker i anmälan. Första raden ska innehålla Förnamn och Efternamn, eller Namn.');
    const flikar = {};
    flikar[FLIK_ROSTLANGD] = t.rostlangd;
    flikar[FLIK_ANMALAN] = anm;
    flikar[FLIK_OMBUD] = t.ombud;
    const m = bygg(minnesArk(flikar));
    if (!m.distrikt.length) throw new Error('Hittar inga ombud i röstlängden. Kontrollera att första raden har rubrikerna Ombud, Distrikt, Namn och Ersättare.');
    const roller = {};
    m.personer.forEach(p => { roller[p.roll] = (roller[p.roll] || 0) + 1; });
    return {
      platser: m.platser.length,
      distrikt: m.distrikt.map(x => ({ namn: x.namn, mandat: x.mandat, ersattare: x.ersattare.length })),
      fs: m.fs.ids.length,
      personer: m.personer.length,
      anmalda: m.personer.filter(p => p.anmald).length,
      roller: roller,
      varningar: m.kontroll.filter(k => k.niva === 'varning').map(k => k.typ + ': ' + k.text),
      info: m.kontroll.filter(k => k.niva !== 'varning').length
    };
  }

  function skapaArk(ss, ev, t) {
    init(ev);
    ARK = ss;
    const anm = stadaAnmalan(t.anmalan);
    if (anm === null) throw new Error('Hittar inga rubriker i anmälan.');
    const skriv = (sh, v) => {
      const r = rektangel(v);
      if (r.length) sh.getRange(1, 1, r.length, r[0].length).setNumberFormat('@').setValues(r);
      if (r.length) sh.getRange(1, 1, 1, r[0].length).setFontWeight('bold');
      sh.setFrozenRows(1);
    };
    const rl = ss.getSheets()[0];
    rl.setName(FLIK_ROSTLANGD);
    skriv(rl, t.rostlangd && t.rostlangd.length ? t.rostlangd : [['Ombud', 'Distrikt', 'Namn', 'Ersättare']]);
    skriv(ss.insertSheet(FLIK_ANMALAN), anm);
    if (t.ombud && t.ombud.length) skriv(ss.insertSheet(FLIK_OMBUD), t.ombud);
    incheckningsflik(ss, true);
    hojVersion();
  }

  const API = {
    hamtaData: hamtaData,
    sattStatus: sattStatus,
    sattErsattare: sattErsattare,
    laggTill: laggTill,
    faststallRostlangd: faststallRostlangd
  };

  function kor(pin, id, fn, args) {
    init(evenemangFor(pin, id, 'stamma'));
    return API[fn].apply(null, [pin].concat(args || []));
  }

  return { kor: kor, forhandsgranska: forhandsgranska, skapaArk: skapaArk };
})();

// Anrop från webbläsaren. Första argumenten är alltid PIN och evenemangets ID.
function stm_hamtaData(pin, ev, kandVersion) { return Stamma.kor(pin, ev, 'hamtaData', [kandVersion]); }
function stm_sattStatus(pin, ev, id, status) { return Stamma.kor(pin, ev, 'sattStatus', [id, status]); }
function stm_sattErsattare(pin, ev, nr, ersId) { return Stamma.kor(pin, ev, 'sattErsattare', [nr, ersId]); }
function stm_laggTill(pin, ev, d) { return Stamma.kor(pin, ev, 'laggTill', [d]); }
function stm_faststallRostlangd(pin, ev) { return Stamma.kor(pin, ev, 'faststallRostlangd', []); }
