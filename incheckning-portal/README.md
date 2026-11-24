# Incheckningsportal

Incheckning och röstlängd för utbildningar, konferenser och stämmor. Byggd för
Moderata Ungdomsförbundet, fri att använda och vidareutveckla.

Portalen är en webbapp i Google Apps Script. Admin loggar in på en länk, skapar
evenemang och checkar in deltagare från mobilen. Allt sparas i Google Kalkylark,
ett ark per evenemang, i en mapp på Google Drive.

## Vad den gör

**Portalen**
- Skapa evenemang i en guide: välj typ, namn, datum, färg och PIN, klistra in listan.
- Förhandsgranskning innan något sparas: antal deltagare, distrikt, mandat, dubbletter och varningar.
- Länkar per admin, en egen PIN per evenemang, avsluta och radera evenemang.

**Utbildning eller konferens**
- Sök på namn, checka in, ångra och lägg till på plats.
- Valbara uppgifter: distrikt, grupp, myndig (varning för under 18) och upp till fyra egna fält, t.ex. kost.
- Siffror för incheckade och saknade, filter, statistik per distrikt och grupp, export till Excel.

**Stämma**
- Röstlängd med ombudsnummer, ombud och ersättare i turordning per distrikt, och FS.
- Saknas ett ombud föreslås nästa ersättare. Förslaget räknas först när en admin bekräftat det.
- Ombud som kommer tillbaka tar sin plats direkt. Checka ut för den som lämnar.
- Fastställda röstlängder sparas som egna flikar med tidpunkt och ändringar sedan förra.
- Kontroll mot anmälan och ombudslista: dubbletter, stavningsskillnader, ombud utan anmälan med mera.

**Integritet**
- Personnummer, e-post och telefon sparas aldrig. Myndighet räknas fram och sparas som Ja eller Nej.
- Webbläsaren får bara namn, distrikt, roll och status.

## Kom igång

| Du vill | Läs |
|---|---|
| Sätta upp en portal | [docs/INSTALLATION.md](docs/INSTALLATION.md) |
| Använda portalen och skapa evenemang | [docs/ANVANDNING.md](docs/ANVANDNING.md) |
| Ta över portalen från någon annan | [docs/INSTALLATION.md#ta-över-portalen](docs/INSTALLATION.md#ta-över-portalen) |
| Ändra eller bygga vidare på koden | [docs/UTVECKLING.md](docs/UTVECKLING.md) |

## Filer

```
apps-script/      Koden som klistras in i Apps Script
  Portal.gs         Webbappen, evenemangsregistret och PIN
  Utbildning.gs     Utbildningar och konferenser
  Stamma.gs         Stämmor och röstlängd
  Portal.html       Portalens sidor
  Utbildning.html   Incheckning för utbildningar
  Stamma.html       Incheckning och röstlängd för stämmor
  appsscript.json   Projektinställningar (valfri)
docs/             Instruktioner
test/             Simulerad Google-miljö, exempeldata och test i webbläsaren
```
