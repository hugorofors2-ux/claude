# Installation

Portalen körs med Google-kontot som publicerar den. Det kontot äger alla evenemangens
kalkylark. Använd därför ett konto som förbundet äger, eller som ska finnas kvar länge.

Det finns två sätt att komma igång:

- **Från mallen (enklast).** Någon har redan en mall. Du gör en kopia, och koden följer med.
- **Från koden.** Du klistrar in filerna själv. Behövs första gången, eller för att skapa en mall.

## Från mallen

1. Öppna mallens kopieringslänk (den slutar på `/copy`) och klicka **Gör en kopia**.
   Döp kopian till t.ex. *Incheckningsportal*.
2. I kopian: **Tillägg > Apps Script**.
3. Öppna `Portal.gs` och byt `const PORTAL_PIN = 'ÄNDRA';` mot en egen PIN, gärna 6 siffror eller fler. Spara.
4. Fortsätt med [Godkänn och publicera](#godkänn-och-publicera).

## Från koden

1. Gå till [sheets.new](https://sheets.new) och döp arket till *Incheckningsportal*.
2. **Tillägg > Apps Script**. Döp projektet till *Incheckningsportal* uppe till vänster.
3. Skapa filerna. Klicka **+** vid *Filer*, välj **Skript** eller **HTML** och skriv namnet utan filändelse:

   | Typ | Namn | Innehåll |
   |---|---|---|
   | Skript | `Portal` | [apps-script/Portal.gs](../apps-script/Portal.gs) (ersätt innehållet i `Kod.gs` och byt namn, eller skapa ny) |
   | Skript | `Utbildning` | [apps-script/Utbildning.gs](../apps-script/Utbildning.gs) |
   | Skript | `Stamma` | [apps-script/Stamma.gs](../apps-script/Stamma.gs) |
   | HTML | `Portal` | [apps-script/Portal.html](../apps-script/Portal.html) |
   | HTML | `Utbildning` | [apps-script/Utbildning.html](../apps-script/Utbildning.html) |
   | HTML | `Stamma` | [apps-script/Stamma.html](../apps-script/Stamma.html) |

   Markera allt i varje fil (Cmd/Ctrl + A), radera och klistra in. Rad 1 i skriptfilerna ska börja med `/**`.
   Står det `function myFunction() {` överst ligger koden inuti Googles standardfunktion och fungerar inte.
4. Byt `const PORTAL_PIN = 'ÄNDRA';` i `Portal.gs` mot en egen PIN. Spara.

## Godkänn och publicera

1. Klicka på `Portal.gs`. I rullistan bredvid **Kör** och **Felsök**, välj **installera** och klicka **Kör**.
2. Google ber om behörighet: **Granska behörigheter**, välj kontot. Om Google varnar att appen inte är
   verifierad: **Avancerat**, sedan länken längst ner. Kryssa i alla rutor och klicka **Tillåt**.
   Portalen behöver komma åt kalkylark och Drive för att skapa ett ark per evenemang.
3. Körningsloggen visar `Klart. Evenemang sparas i mappen "Incheckning evenemang"`.
   I kalkylarket finns nu fliken **Evenemang**.
4. **Implementera > Ny implementering**. Kugghjulet vid *Välj typ* > **Webbapp**.
   **Kör som: Jag**. **Vem har åtkomst: Alla**. Klicka **Implementera**.
5. Kopiera webbappens URL (slutar på `/exec`). Det är portalens länk. Logga in med `PORTAL_PIN`.

Saknas *Alla* under åtkomst begränsar kontots organisation delning. Använd då ett annat konto.

## Uppdatera koden

Byt innehållet i de filer som ändrats och spara. Publicera sedan en ny version på samma länk:
**Implementera > Hantera implementeringar > pennan > Version: Ny version > Implementera**.

Evenemang, länkar och incheckningar påverkas inte.

## Skapa en mall att dela

En mall är ett kalkylark med koden i, men utan PIN och utan evenemang.

1. Gör stegen under [Från koden](#från-koden), men låt `PORTAL_PIN` stå kvar som `'ÄNDRA'`. Publicera inte.
2. Döp arket till *Incheckningsportal (mall)*.
3. **Dela > Allmän åtkomst: Alla som har länken > Läsare**. Kopiera länken.
4. Byt `/edit...` i slutet av länken mot `/copy`. Den som öppnar länken får frågan **Gör en kopia**.

Dela aldrig din egen portal som mall. Koden innehåller portalens PIN.

## Ta över portalen

Portalen och alla evenemangens kalkylark tillhör kontot som publicerade den. När någon slutar:

**Om ni har Google Workspace (samma organisation)**
1. Den som slutar överför ägarskapet för portalens kalkylark och mappen *Incheckning evenemang*
   till den som tar över: **Dela > personen > Överför ägarskap**.
2. Den nya ägaren öppnar **Tillägg > Apps Script**, kör **installera** och gör en **Ny implementering**.
   Det ger en ny länk som körs som den nya ägaren. Skicka ut den nya länken.
3. Den gamla implementeringen arkiveras: **Implementera > Hantera implementeringar > Arkivera**.

**Om ni använder privata Gmail-konton**
1. Den som slutar delar portalens kalkylark och mappen med den som tar över, som **Redigerare**.
2. Den nya ägaren gör en kopia av portalen (**Arkiv > Gör en kopia**), sätter `PORTAL_PIN`, kör
   **installera** och publicerar. Det blir en ny portal med en ny tom evenemangslista.
3. Avslutade evenemang finns kvar som kalkylark i den gamla mappen. Exportera det ni behöver spara.

Oavsett väg: byt `PORTAL_PIN` när ansvaret byter person.

## Felsökning

| Fel | Orsak och lösning |
|---|---|
| *Det gick inte att hitta skriptfunktionen: doGet* | Koden ligger inuti `function myFunction() {`, eller publiceringen gjordes innan koden sparades. Klistra in igen och publicera en ny version. |
| *Portalens PIN är inte satt* | Byt `'ÄNDRA'` i `Portal.gs` och publicera en ny version. |
| *Fel PIN-kod* trots rätt kod | PIN ändrades i koden men ingen ny version publicerades. |
| Rullistan visar inte **installera** | Klicka på `Portal.gs` i fillistan och spara. |
| *Evenemanget finns inte* | Evenemanget är avslutat eller raderat. Öppna det igen under Inställningar i portalen. |
