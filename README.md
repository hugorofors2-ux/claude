# Fantasy FIFA VM 2026 – Expected Points-modell

Ett verktyg som räknar **förväntade fantasypoäng (xP)** per spelare för officiella
*FIFA World Cup Fantasy 2026* – analogt med xG fast för poäng. Modellen drivs av
bettingodds (med FIFA-ranking som fallback) och ger kaptenstips, optimal startelva
ur din trupp samt transferförslag, dag för dag.

## Hur modellen tänker

1. **Odds → lag-xG** (`odds_model.py`): 1X2-odds normaliseras (vigorish bort) och
   kombineras med Over/Under-totalen för att härleda förväntade mål per lag.
   Saknas odds används FIFA-rankingpoäng. Clean sheet-sannolikhet = `exp(-motståndar_xG)`
   (Poisson).
2. **Lag-xG → spelar-xG/xA** (`player_model.py`): fördelas via spelarens målandel,
   assistandel och startsannolikhet.
3. **Händelser → xP** (`scoring.py`): poängreglerna i `config/scoring.yaml` appliceras
   på väntevärdena. Kapten ger x2 och lågägda spelare (<5 %) får ett scouting-bonusvärde.

## Installation

```bash
pip install -r requirements.txt
```

## Interaktiv webb-dashboard (rekommenderas)

```bash
streamlit run app.py
```

Öppnas på `http://localhost:8501` i din webbläsare (ingen domän eller hosting behövs –
den kör lokalt på din dator). I gränssnittet kan du:

- **Bygga ditt lag** genom att söka och välja 15 spelare per position, med automatisk
  budget- och positionskontroll.
- Välja **matchdag** och se varje spelares **motståndare, hemma/borta och matchdatum**.
- Se **xP per spelare**, **optimal startelva + formation**, **kaptens-/vicekaptenstips**
  och **transferförslag** – allt för den valda matchdagen.
- Ladda ner laget som `my_squad.csv` för att återanvända i CLI:t.

> Vill du nå appen utanför din egen dator kan du gratis-deploya till
> [Streamlit Community Cloud](https://streamlit.io/cloud).

## Användning (CLI)

```bash
python -m fantasy_wc xp --matchday 1            # xP per spelare (--detail för komponenter)
python -m fantasy_wc lineup --matchday 1        # optimal startelva ur din trupp
python -m fantasy_wc captain --matchday 1       # kaptens-/vicekaptenstips
python -m fantasy_wc transfers --matchday 1     # in/ut-förslag inom budget
python -m fantasy_wc fetch                       # försök hämta odds automatiskt
```

## Data (CSV i `data/`)

| Fil | Innehåll |
|-----|----------|
| `teams.csv` | Lag, grupp, FIFA-ranking och rankingpoäng |
| `fixtures.csv` | Matchschema per matchdag |
| `odds.csv` | 1X2-odds, Over/Under och (valfritt) färdig `home_xg`/`away_xg` |
| `players.csv` | Spelare: position, pris, `start_prob`, `goal_share`, `assist_share`, m.m. |
| `my_squad.csv` | Dina 15 spelare (`id`) samt kapten/vice |

**Dag för dag:** lägg in/uppdatera matchdagens odds i `odds.csv`, justera spelarnas
`start_prob` efter laguppställningar, och kör kommandona ovan för den matchdagen.
`my_squad.csv` listar bara spelar-`id` – bank/budget räknas automatiskt från priserna.

## Datahämtning

`python -m fantasy_wc fetch` hämtar VM-odds via [The Odds API](https://the-odds-api.com)
om miljövariabeln `ODDS_API_KEY` är satt och nätet tillåter det – annars skrivs
instruktioner för manuell ifyllnad. Hämtad data hamnar i `data/odds_fetched.csv` i
samma format som `odds.csv`.

## Konfiguration

- `config/scoring.yaml` – alla poängvärden. Värden märkta `verify` är vanliga
  fantasyvärden; justera om de officiella reglerna skiljer.
- `config/settings.yaml` – truppregler, formationer, budget och modellparametrar.

## Tester

```bash
pytest
```
