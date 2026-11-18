# Incheckning och röstlängd: MUF:s förbundsstämma

Samma upplägg som incheckningen för HK26, men en egen kopia med egen länk och egen PIN.

## Så läser systemet kalkylarket

| Flik | Används till |
|---|---|
| `Ombud` | **Facit.** Distrikt, antal mandat och namn i turordning. De första namnen (lika många som mandaten) är ombud, resten ersättare 1, 2, 3 ... |
| `Röstlängd` | FS-ledamöterna (rader med distrikt `FS`). Ombuden här kontrolleras mot fliken Ombud. |
| `Anmälan` | Alla anmälda. Dubbletter på för- och efternamn slås ihop. Personer som inte står i ombudslistan får rollen från kolumnen *Deltar som*. |
| `Incheckning` | Skapas av systemet. Här sparas vem som är på plats och när. |
| `Röstlängd 1 kl 10.30` m.fl. | Skapas när ni fastställer en röstlängd. |

Systemet ändrar aldrig flikarna Ombud, Röstlängd och Anmälan. Anteckningar inom parentes i
ombudslistan, t.ex. `Neo Sahlin (medlem i MUF örebro?)`, tas bort från namnet och visas under Kontroll.

Personnummer, e-post och telefon läses aldrig in i appen.

## Publicera

1. Öppna kalkylarket och välj **Tillägg > Apps Script**.
2. Markera allt i `Kod.gs` (Cmd/Ctrl + A), radera och klistra in hela [`Code.gs`](Code.gs).
   Kontrollera att rad 1 börjar med `/**`.
3. Ändra `const PIN = 'ÄNDRA';` till er PIN-kod.
4. Klicka **+** vid Filer > **HTML**, döp filen till `Index` och klistra in hela [`Index.html`](Index.html).
5. Spara. Välj **forbered** i rullistan och klicka **Kör**. Godkänn behörigheterna.
   Fliken `Incheckning` ska dyka upp i kalkylarket.
6. **Implementera > Ny implementering > Webbapp**. Kör som: **Jag**. Åtkomst: **Alla**.
7. Kopiera URL:en som slutar på `/exec` och lägg till `?admin=Namn` för varje admin.

## Inställningar överst i Code.gs

| Inställning | Standard | Betyder |
|---|---|---|
| `FS_ROSTRATT` | `true` | FS-ledamöter räknas i röstlängden. |
| `DUBBELROLL_RAKNAS_SOM` | `'FS'` | Står någon både som FS och ombud räknas hen som FS, och nästa ersättare i distriktet träder in. |
| `UTDELNING` | | Texten "Lämna ut" på personkortet, per roll. |
| `ROLLER_PA_PLATS` | Observatör, Gäst, Funktionär, Press | Roller som kan väljas vid *Lägg till*. |

Ändrar du något: spara och publicera en ny version (**Implementera > Hantera implementeringar > pennan > Ny version**).

## Under stämman

- **Checka in** = personen har fått röstkort, namnlapp osv.
- **Checka ut** = personen lämnar stämman. Ombudets plats blir ledig och nästa ersättare på plats träder in.
- **Ångra** = rättar ett felklick.
- **Distrikt** visar mandat, vilka ombud som saknas och vilka ersättare som träder in. Det är ett beslutsstöd.
- **Röstlängd > Fastställ** sparar röstlängden som en ny flik med tidpunkt, och visar vad som ändrats sedan förra.
- **Kontroll** listar avvikelser mot ombudslistan. Rätta i kalkylarket, så uppdateras appen inom några sekunder.
- Ändringar i fliken Ombud (t.ex. byte av ersättare) slår igenom direkt. Incheckningar ligger kvar.

## Säkerhet

- Delningen av kalkylarket ska stå på **Begränsad**. Fliken Anmälan innehåller personnummer.
- Skicka länk och PIN direkt till varje admin.
- Efter stämman: **Implementera > Hantera implementeringar > Arkivera**, och rensa exporterade filer.
