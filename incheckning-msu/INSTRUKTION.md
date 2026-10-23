# Incheckning MSU Höstkonferens 2026: så publicerar du

Tar ungefär 10 minuter. Du behöver ett Google-konto och Excel-filen med deltagare.

## 1. Lägg in deltagarlistan i Google Kalkylark

1. Gå till [sheets.new](https://sheets.new) (öppnar ett nytt tomt kalkylark).
2. **Arkiv > Importera > Ladda upp** och välj Excel-filen. Välj **Ersätt kalkylark**.
3. Kontrollera att första raden är rubriker, till exempel `Namn`, `Distrikt`, `Myndig`, `Grupp`.
   Förnamn och efternamn i separata kolumner fungerar också. Myndig kan anges som Ja/Nej, X, ålder,
   födelseår, födelsedatum eller personnummer.
4. Döp kalkylarket till något tydligt, t.ex. *MSU HK26 Incheckning*.

## 2. Lägg in koden

1. I kalkylarket: **Tillägg > Apps Script**. En kodredigerare öppnas.
2. Filen `Kod.gs` (eller `Code.gs`) är öppen. Radera allt i den och klistra in hela innehållet från
   [`Code.gs`](Code.gs).
3. Ändra PIN-koden på raden `const PIN = '2026';` till den kod ni ska använda (gärna 6 siffror).
4. Klicka på **+** bredvid *Filer* > **HTML**. Döp filen till exakt `Index` (utan .html).
   Radera innehållet och klistra in hela [`Index.html`](Index.html).
5. Spara (Ctrl/Cmd + S).

## 3. Förbered och godkänn

1. Välj funktionen **forbered** i rullistan i verktygsfältet och klicka **Kör**.
2. Google ber om behörighet. Klicka **Granska behörigheter**, välj ditt konto.
   Om det står *Google har inte verifierat den här appen*: klicka **Avancerat** och sedan
   **Gå till ... (osäkert)**. Det är din egen kod, så det är tryggt.
3. Gå tillbaka till kalkylarket. Fyra nya kolumner ska ha dykt upp: `ID`, `Incheckad`,
   `Incheckad tid` och `Tillagd på plats`.

## 4. Publicera webbappen

1. I Apps Script: **Distribuera > Ny distribution**.
2. Klicka på kugghjulet vid *Välj typ* > **Webbapp**.
3. Beskrivning: *Incheckning*. **Kör som: Jag**. **Vem har åtkomst: Alla**.
4. Klicka **Distribuera** och kopiera **webbappens URL** (slutar på `/exec`).

Saknas alternativet *Alla* använder du ett jobbkonto som begränsar delning. Gör då om stegen med ett
privat Gmail-konto.

## 5. Länkar till admin

Lägg till `?admin=Namn` sist i URL:en, en länk per admin:

```
https://script.google.com/macros/s/XXXX/exec?admin=Hugo
https://script.google.com/macros/s/XXXX/exec?admin=Namn2
https://script.google.com/macros/s/XXXX/exec?admin=Namn3
```

Alla loggar in med samma PIN första gången. Telefonen kommer ihåg koden.

## Bra att veta under dagen

- **Kalkylarket är källan.** Allt som checkas in skrivs direkt dit. Det är också er export.
- Ni kan ändra direkt i kalkylarket (t.ex. skriva `Ja` i *Incheckad*). Ändringen syns i appen inom några sekunder.
- Sortera gärna, men ta inte bort kolumnen `ID`.
- Nya rader som läggs till direkt i kalkylarket får ett ID automatiskt.
- **Ändrar du koden** efter publicering: **Distribuera > Hantera distributioner > pennan > Version: Ny version**.
  Då behåller ni samma länk.
- **Byta PIN:** ändra raden i `Code.gs` och publicera ny version enligt ovan. Alla som är inloggade får logga in igen.
