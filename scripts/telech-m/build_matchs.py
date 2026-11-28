#!/usr/bin/env python3
"""⚽ Lot M — les matchs internationaux de football depuis 1872 → ts-matchs.json.gz.

Source : Mart Jürisoo, « International football results from 1872 to … » (https://github.com/martj42/international_results),
fichier LICENSE = « CC0 1.0 Universal » (lu le jour de la fabrication ; le script s'arrête si ce n'est plus CC0).
On garde chaque match : date, équipes (nom français pour les plus courantes), score, tournoi, ville, pays, terrain neutre, vainqueur
aux tirs au but (shootouts.csv). Les villes de France sont placées sur la commune du même nom (assets/data/cc-communes.json.gz,
Licence Ouverte, déjà dans l'app) quand ce nom est porté par une seule commune (ou par la grande ville listée ci-dessous).
Lancer : python3 -I scripts/telech-m/build_matchs.py [dossier de sortie]
"""
import csv, io, os, re, sys, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
BASE = 'https://raw.githubusercontent.com/martj42/international_results/master/'
FR = {'France': 'France', 'England': 'Angleterre', 'Scotland': 'Écosse', 'Wales': 'Pays de Galles', 'Northern Ireland': 'Irlande du Nord', 'Republic of Ireland': 'Irlande',
      'Germany': 'Allemagne', 'Belgium': 'Belgique', 'Switzerland': 'Suisse', 'Italy': 'Italie', 'Spain': 'Espagne', 'Portugal': 'Portugal', 'Netherlands': 'Pays-Bas',
      'Luxembourg': 'Luxembourg', 'Austria': 'Autriche', 'Hungary': 'Hongrie', 'Czech Republic': 'Tchéquie', 'Czechoslovakia': 'Tchécoslovaquie', 'Poland': 'Pologne',
      'Russia': 'Russie', 'Soviet Union': 'URSS', 'Yugoslavia': 'Yougoslavie', 'Serbia': 'Serbie', 'Croatia': 'Croatie', 'Romania': 'Roumanie', 'Bulgaria': 'Bulgarie',
      'Greece': 'Grèce', 'Turkey': 'Turquie', 'Denmark': 'Danemark', 'Sweden': 'Suède', 'Norway': 'Norvège', 'Finland': 'Finlande', 'Iceland': 'Islande',
      'Ukraine': 'Ukraine', 'Morocco': 'Maroc', 'Algeria': 'Algérie', 'Tunisia': 'Tunisie', 'Senegal': 'Sénégal', 'Ivory Coast': 'Côte d’Ivoire', 'Cameroon': 'Cameroun',
      'Egypt': 'Égypte', 'Brazil': 'Brésil', 'Argentina': 'Argentine', 'Uruguay': 'Uruguay', 'Chile': 'Chili', 'Mexico': 'Mexique', 'United States': 'États-Unis',
      'Canada': 'Canada', 'Japan': 'Japon', 'South Korea': 'Corée du Sud', 'Australia': 'Australie', 'Saarland': 'Sarre', 'German DR': 'RDA', 'Ireland': 'Irlande',
      'Colombia': 'Colombie', 'Peru': 'Pérou', 'Paraguay': 'Paraguay', 'Nigeria': 'Nigeria', 'Ghana': 'Ghana', 'Mali': 'Mali', 'Andorra': 'Andorre', 'Monaco': 'Monaco',
      'Malta': 'Malte', 'Cyprus': 'Chypre', 'Israel': 'Israël', 'Slovakia': 'Slovaquie', 'Slovenia': 'Slovénie', 'Bosnia and Herzegovina': 'Bosnie-Herzégovine',
      'Albania': 'Albanie', 'Georgia': 'Géorgie', 'Armenia': 'Arménie', 'Lithuania': 'Lituanie', 'Latvia': 'Lettonie', 'Estonia': 'Estonie', 'Belarus': 'Biélorussie',
      'New Zealand': 'Nouvelle-Zélande', 'Saudi Arabia': 'Arabie saoudite', 'Qatar': 'Qatar', 'Iran': 'Iran', 'China PR': 'Chine', 'South Africa': 'Afrique du Sud',
      'North Macedonia': 'Macédoine du Nord', 'Montenegro': 'Monténégro', 'Faroe Islands': 'Îles Féroé', 'Liechtenstein': 'Liechtenstein', 'San Marino': 'Saint-Marin',
      'Kosovo': 'Kosovo', 'Azerbaijan': 'Azerbaïdjan', 'Kazakhstan': 'Kazakhstan', 'Moldova': 'Moldavie', 'Haiti': 'Haïti', 'Martinique': 'Martinique',
      'Guadeloupe': 'Guadeloupe', 'French Guiana': 'Guyane', 'Réunion': 'La Réunion', 'New Caledonia': 'Nouvelle-Calédonie', 'Tahiti': 'Tahiti'}
TOURN = {'Friendly': 'Match amical', 'FIFA World Cup': 'Coupe du monde', 'FIFA World Cup qualification': 'Éliminatoires de la Coupe du monde', 'UEFA Euro': 'Euro',
         'UEFA Euro qualification': 'Éliminatoires de l’Euro', 'UEFA Nations League': 'Ligue des nations', 'British Home Championship': 'Championnat britannique',
         'Olympic Games': 'Jeux olympiques', 'Copa América': 'Copa América', 'African Cup of Nations': 'Coupe d’Afrique des nations', 'Confederations Cup': 'Coupe des confédérations'}
# villes de France dont le nom est porté par plusieurs communes : celle du match
PICK = {'paris': '75056', 'colombes': '92025', 'saint denis': '93066', 'lyon': '69123', 'marseille': '13055', 'bordeaux': '33063', 'toulouse': '31555', 'nantes': '44109',
        'lille': '59350', 'lens': '62498', 'strasbourg': '67482', 'saint etienne': '42218', 'montpellier': '34172', 'nice': '06088', 'rennes': '35238', 'metz': '57463',
        'reims': '51454', 'le havre': '76351', 'rouen': '76540', 'nancy': '54395', 'toulon': '83137', 'brest': '29019', 'auxerre': '89024', 'sochaux': '25547',
        'villeneuve d ascq': '59009', 'grenoble': '38185', 'le mans': '72181', 'caen': '14118', 'tours': '37261', 'dijon': '21231', 'angers': '49007', 'nimes': '30189',
        'valenciennes': '59606', 'amiens': '80021', 'guingamp': '22070', 'lorient': '56121', 'clermont ferrand': '63113', 'ajaccio': '2A004', 'bastia': '2B033'}


def fold(s):
    return re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()).strip()


def main():
    lic = wm.get(BASE + 'LICENSE', 'text/plain').decode('utf-8', 'replace')
    assert 'CC0 1.0 Universal' in lic[:200], 'la licence de martj42/international_results n’est plus CC0 : on s’arrête'
    res = list(csv.DictReader(io.StringIO(wm.get(BASE + 'results.csv', 'text/csv').decode('utf-8'))))
    sho = {(r['date'], r['home_team'], r['away_team']): r['winner'] for r in csv.DictReader(io.StringIO(wm.get(BASE + 'shootouts.csv', 'text/csv').decode('utf-8')))}
    com = wm.communes(ROOT)
    by_name = {}
    for ins, (n, la, lo) in com.items():
        by_name.setdefault(fold(n), []).append(ins)
    teams, tours, countries = {}, {}, {}
    idx = lambda d, v: d.setdefault(v, len(d))
    rows, placed = [], 0
    for r in res:
        if r['home_score'] in ('', 'NA'):
            continue   # matchs à venir (sans score)
        la = lo = None
        ins = ''
        if r['country'] == 'France':
            f = fold(r['city'])
            ins = PICK.get(f) or (by_name[f][0] if len(by_name.get(f, [])) == 1 else '')
            if ins:
                _, la, lo = com[ins]
                placed += 1
        so = sho.get((r['date'], r['home_team'], r['away_team']), '')
        rows.append([r['date'], idx(teams, FR.get(r['home_team'], r['home_team'])), idx(teams, FR.get(r['away_team'], r['away_team'])), int(r['home_score']), int(r['away_score']),
                     idx(tours, TOURN.get(r['tournament'], r['tournament'])), r['city'], idx(countries, FR.get(r['country'], r['country'])), 1 if r['neutral'] == 'TRUE' else 0,
                     idx(teams, FR.get(so, so)) if so else -1, la, lo, ins])
    meta = {'source': 'martj42/international_results (Mart Jürisoo)', 'licence': 'CC0 1.0', 'licence_url': 'https://github.com/martj42/international_results/blob/master/LICENSE',
            'url': 'https://github.com/martj42/international_results', 'built': wm.today(),
            'what': 'Les matchs internationaux de football (hommes, équipes A) depuis 1872 : date, score, tournoi, ville ; les villes de France placées sur leur commune',
            'teams': list(teams), 'tournaments': list(tours), 'countries': list(countries),
            'fields': ['d', 'h', 'a', 'hs', 'as', 't', 'city', 'cty', 'neutral', 'so', 'lat', 'lon', 'ins'], 'rows': rows}
    size = wm.write_gz(OUT, 'ts-matchs.json.gz', meta)
    print(f'ts-matchs : {len(rows)} matchs ({rows[0][0]} → {rows[-1][0]}), {placed} placés en France, {size} octets')


if __name__ == '__main__':
    main()
