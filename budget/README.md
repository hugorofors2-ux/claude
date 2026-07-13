# Budget & utgiftsanalys

Ladda upp ditt kontoutdrag, få utgifterna kategoriserade automatiskt, sätt din egen
budget per kategori och månad, och följ upp utfall, trender och avvikelser.

## Installation & körning

```bash
pip install -r requirements.txt
streamlit run budget_app.py
```

Öppnas på `http://localhost:8501`. Allt körs och lagras lokalt på din dator –
inga bankdata skickas någonstans.

## Så funkar det

1. **Ladda upp** ett kontoutdrag som CSV eller Excel (fungerar med de flesta
   svenska bankers exportformat – datum-, beskrivnings- och beloppskolumner
   identifieras automatiskt utifrån vanliga kolumnnamn, med manuell mappning
   som fallback om något ser fel ut).
2. **Kategorisering** sker med en enkel, redigerbar regelbaserad modell:
   varje kategori har en lista nyckelord (t.ex. "ICA", "COOP" → *Mat &
   Livsmedel*) som matchas mot transaktionens beskrivning. Du kan:
   - rätta enskilda transaktioner direkt i tabellen (rättningen sparas och
     används automatiskt nästa gång samma beskrivning dyker upp), och
   - lägga till egna nyckelord per kategori under fliken **Regler**.
3. **Budget** sätts per kategori, månad för månad, med möjlighet att kopiera
   föregående månads budget som utgångspunkt.
4. **Uppföljning** visar budget vs. utfall, vilka kategorier som avviker
   (≥15 % över eller under budget), trender över tid per kategori och vilka
   kategorier som förändrats mest sedan föregående månad.

## Kategorialternativ

Standarduppsättningen (redigerbar via nyckelordsregler, se `categories.py`):

| Kategori | Exempel |
|---|---|
| Boende & Hyra | Hyra, BRF-avgift |
| Mat & Livsmedel | ICA, Coop, Willys, Lidl |
| Restaurang & Café | Restauranger, kaffe, matleverans |
| Transport | Kollektivtrafik, tank, parkering, taxi |
| Nöje & Fritid | Övrig underhållning |
| Abonnemang & Räkningar | El, bredband, mobil, streaming |
| Kläder & Skor | Klädkedjor |
| Hälsa & Sjukvård | Apotek, vårdcentral, tandläkare |
| Försäkring | Hem-, bil-, sjukförsäkring |
| Sparande & Investeringar | Avanza, Nordnet, sparkonto |
| Barn & Familj | Förskola, barnartiklar |
| Husdjur | Veterinär, djuraffär |
| Shopping & Hem | Amazon, IKEA, elektronik |
| Resor & Semester | Flyg, hotell, boende |
| Presenter & Välgörenhet | Gåvor, donationer |
| Lön & Inkomst | Lön och andra inkomster |
| Överföringar | Swish, autogiro, interna överföringar |
| Övrigt / Okategoriserat | Allt som inte matchar någon regel |

## Var sparas datan?

Allt sparas lokalt under `budget/data/` (gitignorat, checkas aldrig in):

- `transactions.csv` – all historik av inlästa transaktioner (deduplicerade).
- `budgets.json` – din budget per månad och kategori.
- `category_overrides.json` – dina manuella kategorirättningar per beskrivning.
- `custom_rules.json` – dina egna nyckelord per kategori.

## Tester

```bash
pytest tests/test_budget_parser.py tests/test_budget_categorizer.py tests/test_budget_analytics.py
```

## Möjliga vidareutvecklingar

- Koppla in en språkmodell (t.ex. via Anthropic API) för att kategorisera
  transaktioner som nyckelordsreglerna missar, som ett komplement till den
  regelbaserade motorn – bra för ovanliga eller nya köpställen. Lämnas
  utanför denna version för att hålla känsliga bankdata helt lokala som
  standard.
- Export till PDF/Excel-rapport för en vald period.
