"""Standardkategorier och sökordsregler för automatisk kategorisering.

Reglerna är en enkel, redigerbar och helt lokal "modell": varje kategori har en
lista nyckelord som matchas mot transaktionens beskrivning (substräng,
skiftlägesokänsligt). Första träff vinner. Du kan lägga till egna nyckelord i
appen utan att röra dessa standardvärden.
"""

from __future__ import annotations

UNCATEGORIZED = "Övrigt / Okategoriserat"

# Kategorialternativ – används i UI:t för budgetsättning och manuell omkategorisering.
DEFAULT_CATEGORIES = [
    "Boende & Hyra",
    "Mat & Livsmedel",
    "Restaurang & Café",
    "Transport",
    "Nöje & Fritid",
    "Abonnemang & Räkningar",
    "Kläder & Skor",
    "Hälsa & Sjukvård",
    "Försäkring",
    "Sparande & Investeringar",
    "Barn & Familj",
    "Husdjur",
    "Shopping & Hem",
    "Resor & Semester",
    "Presenter & Välgörenhet",
    "Lön & Inkomst",
    "Överföringar",
    UNCATEGORIZED,
]

# Standardregler: kategori -> nyckelord som matchas mot transaktionsbeskrivningen.
DEFAULT_KEYWORD_RULES: dict[str, list[str]] = {
    "Mat & Livsmedel": [
        "ICA", "COOP", "WILLYS", "HEMKÖP", "LIDL", "CITY GROSS", "TEMPO",
        "MATSPAR", "MATHEM", "EASYFOOD",
    ],
    "Restaurang & Café": [
        "RESTAURANG", "CAFE", "KAFFE", "MCDONALD", "BURGER KING", "MAX HAMBURGER",
        "STARBUCKS", "ESPRESSO HOUSE", "PRESSBYRÅN", "SUBWAY", "FOODORA",
        "UBER EATS", "WOLT", "SUSHI",
    ],
    "Transport": [
        "SL RESOR", "SL AB", "VÄSTTRAFIK", "SKÅNETRAFIKEN", "SJ AB", "UBER",
        "BOLT", "TAXI", "PARKERING", "OKQ8", "CIRCLE K", "PREEM", "SHELL",
        "ST1", "FLYGBUSS",
    ],
    "Boende & Hyra": ["HYRA", "BRF ", "BOSTADSRÄTT", "HSB"],
    "Abonnemang & Räkningar": [
        "TELIA", "TELE2", "TELENOR", "COMVIQ", "HALEBOP", "VATTENFALL", "EON",
        "FORTUM", "BAHNHOF", "BREDBAND", "NETFLIX", "SPOTIFY", "HBO",
        "VIAPLAY", "DISNEY+", "APPLE.COM/BILL", "GOOGLE",
    ],
    "Kläder & Skor": ["H&M", "ZARA", "LINDEX", "KAPPAHL", "STADIUM", "INTERSPORT", "DRESSMANN"],
    "Hälsa & Sjukvård": ["APOTEK", "VÅRDCENTRAL", "TANDLÄKARE", "FYSIOTERAPEUT", "1177"],
    "Försäkring": ["FOLKSAM", "IF FÖRSÄKRING", "TRYGG HANSA", "LÄNSFÖRSÄKRINGAR", "MODERNA FÖRSÄKRINGAR"],
    "Sparande & Investeringar": ["AVANZA", "NORDNET", "SPARKONTO"],
    "Barn & Familj": ["FÖRSKOLA", "BARNOMSORG", "LEKSAK", "BVC"],
    "Husdjur": ["VETERINÄR", "DJURAFFÄR", "ANIMAL"],
    "Shopping & Hem": ["AMAZON", "IKEA", "ELGIGANTEN", "CLAS OHLSON", "BILTEMA", "JULA", "RUSTA"],
    "Resor & Semester": ["HOTEL", "HOTELL", "FLYG", "SAS ", "NORWEGIAN", "RYANAIR", "BOOKING.COM", "AIRBNB"],
    "Presenter & Välgörenhet": ["GÅVA", "UNICEF", "RÖDA KORSET", "VÄLGÖRENHET"],
    "Lön & Inkomst": ["LÖN", "SALARY", "LöN"],
    "Överföringar": ["ÖVERFÖRING", "SWISH", "AUTOGIRO"],
}
