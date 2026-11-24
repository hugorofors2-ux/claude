"""Skapar påhittad exempeldata för tester och för den som vill prova portalen."""
import random
random.seed(7)
FN = ['Anna','Erik','Sara','Oskar','Ebba','Hugo','Maja','Ludvig','Wilma','Axel','Alice','Elias','Freja','Ville','Ella','Åsa','Örjan','Linnéa','Malte','Tilda','Noah','Saga','Liam','Vera','Olle','Stina','Isak','Moa','Leo','Juni']
EN = ['Andersson','Johansson','Karlsson','Nilsson','Eriksson','Larsson','Olsson','Persson','Svensson','Gustafsson','Lindqvist','Öberg','Åkesson','Bergström','Holm','Lund','Sjöberg','Wallin','Ek','Falk']
DISTRIKT = [('Blekinge',2),('Dalarna',2),('Göteborg',6),('Skåne',8),('Stockholm',10),('Uppsala',4),('Västerbotten',2),('Östergötland',5)]
anvanda = set()
def namn():
    while True:
        n = (random.choice(FN), random.choice(EN))
        if n not in anvanda:
            anvanda.add(n); return n
def pnr(myndig):
    ar = random.randint(1998, 2007) if myndig else random.randint(2009, 2011)
    return '%d%02d%02d-%04d' % (ar, random.randint(1,12), random.randint(1,28), random.randint(0,9999))

# Utbildning
rader = [['Förnamn','Efternamn','E-post','Personnummer','Distrikt','Grupp','Kost']]
for i in range(48):
    f, e = namn()
    rader.append([f, e, (f+'.'+e).lower()+'@exempel.se', pnr(i % 4 != 0), random.choice(DISTRIKT)[0], str(i % 6 + 1), random.choice(['','','Vegetarisk','Glutenfri','Vegan'])])
rader.append(rader[5][:])  # en dubblett
open('exempel/utbildning-deltagare.tsv','w').write('\n'.join('\t'.join(r) for r in rader)+'\n')

# Stämma: röstlängd, anmälan och ombudslista
anvanda.clear()
rl = [['OMBUD','DISTRIKT','NAMN','Ersättare']]
om = [['','Antal','Protokoll'] + [str(i) for i in range(1, 21)]]
anm = [['Förnamn','Efternamn','E-post','Telefonnummer','Personnummer','Distrikt','Deltar som']]
nr = 1
for d, mandat in DISTRIKT:
    ombud = [' '.join(namn()) for _ in range(mandat)]
    ers = [' '.join(namn()) for _ in range(random.randint(1, 5))]
    for i, o in enumerate(ombud):
        rl.append([str(nr), d, o] + (ers if i == 0 else [])); nr += 1
    om.append([d, str(mandat), d + ' protokoll.pdf'] + ombud + ers)
    for o in ombud[:-1] if d == 'Skåne' else ombud:   # ett ombud i Skåne har inte anmält sig
        f, e = o.split(' ', 1); anm.append([f, e, '', '', pnr(True), d, 'Ombud'])
    for x in ers[:3]:
        f, e = x.split(' ', 1); anm.append([f, e, '', '', pnr(True), d, 'Ersättare'])
fs = [' '.join(namn()) for _ in range(5)]
for f in fs:
    rl.append([str(nr), 'FS', f]); nr += 1
    a, b = f.split(' ', 1); anm.append([a, b, '', '', pnr(True), 'FS', 'Ombud'])
for _ in range(6):
    f, e = namn(); anm.append([f, e, '', '', pnr(True), random.choice(DISTRIKT)[0], 'Observatör'])
f, e = namn(); anm.append([f, e, '', '', pnr(True), 'Göteborg', 'Ombud'])   # anmäld som ombud utan plats
anm.append(anm[3][:])                                                       # dubblett
om.append(['', str(sum(m for _, m in DISTRIKT)), 'Totalt:'])
for fil, r in [('stamma-rostlangd.tsv', rl), ('stamma-anmalan.tsv', anm), ('stamma-ombud.tsv', om)]:
    open('exempel/' + fil, 'w').write('\n'.join('\t'.join(x) for x in r) + '\n')
print('Klart:', len(rader)-1, 'deltagare,', nr-1, 'platser,', len(anm)-1, 'anmälda')
