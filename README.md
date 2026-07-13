## Verktyg i det här repot

Detta repo innehåller två fristående Streamlit-verktyg:

- **Fantasy FIFA VM 2026** (`app.py`) – beskrivs nedan.
- **Budget & utgiftsanalys** (`budget_app.py`) – ladda upp kontoutdrag, få utgifterna
  automatiskt kategoriserade, sätt egen budget månad för månad och följ upp utfall,
  trender och avvikelser. Se [`budget/README.md`](budget/README.md) för detaljer.

---

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
| `teams.csv` | Alla 48 VM-lag, grupp och lagstyrka (rankingpoäng) |
| `fixtures.csv` | Officiellt VM-schema: 72 gruppmatcher i matchdag 1–3 (FIFA Fantasy-omgångar) |
| `odds.csv` | En rad per match; fyll i 1X2/Over-Under eller färdig `home_xg`/`away_xg` (tomt = ranking-fallback) |
| `players.csv` | Alla 1248 spelare: officiell position, pris, ägarandel m.m. |
| `my_squad.csv` | Dina 15 spelare (`id`) samt kapten/vice |

### Officiell data

`players.csv` och `teams.csv` är genererade från det officiella FIFA World Cup
Fantasy-datat (1248 spelare, 48 lag) via
[fifa-wc2026-fantasy-analytics](https://github.com/jlbgouveia/fifa-wc2026-fantasy-analytics)
(ögonblicksbild 5 juni 2026). Direkt från FIFA kommer: **position, pris (`price`),
ägarandel (`ownership`), startsannolikhet (`start_prob`)** och poängfälten
`avg_points`/`total_points` (= 0 före turneringsstart).

Modellinputs som FIFA inte publicerar är **härledda** och kan förfinas:
- `goal_share`/`assist_share` – andel av lagets mål/assist, från spelarens mål- och
  assist-takt över 4 år (klubb + landslag); position-prior där statistik saknas.
- `start_prob` – mappad från FIFA:s "Likely/Maybe/Unlikely Starter".
- `teams.csv: ranking_points` – lagstyrka härledd ur de officiella priserna
  (medel av lagets 11 dyraste). Används bara som fallback när odds saknas.

Schemat (`fixtures.csv`) och matchdagarna är det officiella gruppspelet. Motståndare
och datum kommer alltid därifrån; odds är bara en override för xG.

**Dag för dag:** fyll i matchdagens odds i `odds.csv` (frivilligt – utan odds används
ranking-fallback), justera ev. `start_prob` efter laguppställningar, och kör kommandona
ovan. `my_squad.csv` listar bara spelar-`id` – bank/budget räknas automatiskt från priserna.

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
