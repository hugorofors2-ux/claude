# Använda portalen

## Logga in

Öppna portalens länk och logga in med portalens PIN. Telefonen kommer ihåg koden tills du loggar ut.

Det finns två sorters PIN:

| PIN | Ger tillgång till |
|---|---|
| Portalens PIN | Alla evenemang, skapa nya, ändra och radera |
| Evenemangets PIN | Bara det evenemanget, för de som checkar in |

Ge evenemangets PIN till de som jobbar i entrén. Portalens PIN stannar hos de som ansvarar.

## Skapa ett evenemang

Klicka **Nytt evenemang** och följ guiden.

1. **Typ.** *Utbildning eller konferens* för vanlig incheckning. *Stämma* för röstlängd med ombud och ersättare.
2. **Uppgifter.** Namn, datum, färg och evenemangets PIN (ett förslag är ifyllt).
   - Utbildning: välj om distrikt, grupp och myndighet ska visas, och lägg till egna fält som *Kost, Boende*.
   - Stämma: välj om FS har rösträtt och hur en person som är både FS och ombud räknas.
3. **Listan.** Markera tabellen i Excel eller Google Kalkylark, kopiera och klistra in. Ta med rubrikraden.
   Klicka **Förhandsgranska** och kontrollera siffrorna innan du går vidare.
   Du kan också hoppa över och fylla i kalkylarket senare.
4. **Skapa.** Skriv upp evenemangets PIN, den visas inte igen.

Efteråt visas länkarna. Skriv admins namn med komma emellan, så får var och en en egen länk som hälsar dem med namn.

### Listor för utbildningar

Rubriker som känns igen (stora och små bokstäver spelar ingen roll):

| Uppgift | Rubriker |
|---|---|
| Namn | Namn, eller Förnamn och Efternamn |
| Distrikt | Distrikt, Region |
| Grupp | Grupp, Gruppnummer, Basgrupp |
| Myndig | Myndig, Är du myndig?, Ålder, Födelseår, Födelsedatum, Personnummer |
| Egna fält | Exakt samma rubrik som fältets namn |

Myndig kan vara Ja/Nej, X, ålder, födelseår, födelsedatum eller personnummer. Åldern räknas vid
evenemangets datum. Personnummer sparas aldrig, bara Ja eller Nej. Dubbletter med samma namn och distrikt slås ihop.

### Listor för stämmor

**Röstlängd** (krävs). En rad per ombud:

| Ombud | Distrikt | Namn | Ersättare | | |
|---|---|---|---|---|---|
| 1 | Blekinge | Anna Ek | Erik Holm | Sara Lund | |
| 2 | Blekinge | Olle Falk | | | |
| 3 | Dalarna | ... | | | |
| 44 | FS | Maja Berg | | | |

- *Ombud* är ombudsnumret. Platserna visas i den ordningen.
- Ersättarna står i turordning från kolumnen *Ersättare* och åt höger, på distriktets första rad.
- Rader med distrikt `FS` är förbundsstyrelsen.

**Anmälan** (valfri). Förnamn, Efternamn, Distrikt och Deltar som. Övriga kolumner tas bort.
Personer som inte står i röstlängden får rollen från *Deltar som*, t.ex. Observatör eller Gäst.

**Ombudslista** (valfri). Distrikt, Antal, Protokoll, och namnen i turordning. Används bara som kontroll
mot röstlängden.

## Under evenemanget

Allt ändras direkt i appen, och alla admin ser samma läge inom några sekunder.
Ändringar gjorda direkt i kalkylarket syns inom ungefär 15 sekunder.

**Utbildning:** sök, tryck på personen, **Checka in**. **Ångra** finns i notisen och på personkortet.
**Lägg till** för den som saknas i listan. **Statistik** visar läget per distrikt och grupp.

**Stämma:**
- **Checka in** = personen har fått röstkort och namnlapp. **Checka ut** när någon lämnar stämman.
- **Distrikt** visar mandat, ombud som saknas och vilka ersättare som tjänstgör eller föreslås.
- **Röstlängd** visar plats 1 och framåt. Saknas ett ombud föreslås nästa ersättare som är på plats.
  Klicka **Bekräfta**, eller välj en annan ersättare. Bara bekräftade ersättare räknas.
- **Fastställ röstlängd** sparar en ny flik i kalkylarket med ombudsnummer och tidpunkt.
- **Kontroll** listar avvikelser: anmälda utan plats, ombud utan anmälan, dubbletter med mera.
  Rätta i kalkylarket, så uppdateras appen.
- Lägg till `&vy=rostlangd` i länken för en skärm som bara visar röstlängden.

### Ändra i röstlängden under stämman

Skriv in nya ersättare i fliken *Röstlängd* i evenemangets kalkylark, sist på distriktets första rad.
Byt inte namn på någon som redan är incheckad, då tappar personen sin incheckning.

## Efter evenemanget

1. **Exportera** listan om ni behöver spara den.
2. I portalen: **Inställningar > Avsluta evenemanget**. Länkarna slutar fungera direkt.
3. När uppgifterna inte behövs längre: **Inställningar > Radera evenemanget**. Kalkylarket läggs i papperskorgen.
4. Radera exporterade filer från telefoner och datorer.

## Säkerhet

- Skicka länk och PIN direkt till varje admin, inte i en stor grupp.
- Kalkylarken ska inte delas med länk. Appen fungerar ändå, eftersom den körs som portalens ägare.
- Telefoner kommer ihåg PIN-koden. Logga ut om en telefon lämnas obevakad.
- Byt evenemangets PIN under Inställningar om den spridits för långt.
