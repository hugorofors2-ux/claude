# Utveckling

## Så hänger det ihop

```
Webbläsare                        Apps Script (körs som portalens ägare)       Google Drive
─────────                         ─────────────────────────────────────       ────────────
Portal.html      ── portal_* ──▶  Portal.gs     register, PIN, skapa      ──▶  Portalens ark (fliken Evenemang)
Utbildning.html  ── utb_*    ──▶  Utbildning.gs incheckning               ──▶  Ett ark per evenemang
Stamma.html      ── stm_*    ──▶  Stamma.gs     incheckning, röstlängd    ──▶  i mappen Incheckning evenemang
```

- `doGet` i `Portal.gs` visar portalen, eller ett evenemang när länken har `?e=<id>`.
  Evenemangets publika uppgifter skickas in i sidan via mallen `<?!= data ?>`.
- `Utbildning.gs` och `Stamma.gs` ligger i varsitt namnrum (`const Utbildning = (function () { ... })()`),
  så att deras interna funktioner inte krockar. Webbläsaren anropar tunna globala funktioner som
  `utb_checkaIn(pin, evenemangsId, deltagarId)`.
- Varje anrop kontrollerar PIN med `behorig(pin, ev)`: portalens PIN eller evenemangets PIN.
  Evenemangets PIN sparas som SHA-256 med salt.
- Skrivningar sker under `LockService`. En versionsnyckel per evenemang (`V_<id>` i Script Properties)
  gör att webbläsarna bara hämtar hela listan när något ändrats. Var femte hämtning läser ändå allt,
  så att ändringar direkt i kalkylarket också syns.
- Stämmans röstlängder sparas i Script Properties (`RL_<id>_<nr>`) och som flikar i arket.

## Lägga till en ny typ av evenemang

1. Skapa `Ny.gs` med ett namnrum som exporterar `kor`, `forhandsgranska` och `skapaArk`, och globala
   anrop med eget prefix.
2. Skapa `Ny.html`. Utgå från `Utbildning.html`: `var EV = <?!= data ?>;` och `api()` med prefixet.
3. I `Portal.gs`: lägg till typen i `EV_TYPER`, `modul()`, `rensaInst()` och `doGet`.
4. I `Portal.html`: lägg till typen i guiden (steg 1, 2 och 3) och i `forhandHtml`.

## Testa lokalt

Testerna kör den riktiga koden i Chromium mot en simulerad Google-miljö (`test/mock.js`) med
påhittad exempeldata i `test/exempel/`. Inga riktiga personuppgifter ska in i repot.

```bash
npm install playwright          # en gång, om den inte redan finns
npx playwright install chromium # en gång
python3 test/bygg_testsidor.py  # bygger test/ut/*.html från apps-script/
node test/e2e.mjs               # hela flödet på dator och mobil, skärmdumpar i test/ut/
```

Öppna `test/ut/Portal.html` i en webbläsare för att klicka runt själv. Portalens PIN i testet är `999999`.
Rensa testdatan med `localStorage.clear()` i webbläsarens konsol.

`python3 test/skapa_exempel.py` skapar ny exempeldata.

## Regler

- Inga personnummer, e-postadresser eller telefonnummer i evenemangens kalkylark eller i webbläsaren.
- Allt användargränssnitt på svenska.
- Kör testerna innan en ny version publiceras.
