#!/usr/bin/env python3
"""LCNDA lot 10 — 🌋 « Les volcans lointains qui ont gâché ses récoltes » : assets/data/l10t-volcans.json.gz.
Liste faite à la main : chaque phrase est recopiée EXACTEMENT de l'article de Wikipédia cité (CC BY-SA 4.0) ; le script relit
l'article et refuse d'écrire si une phrase n'y est plus. La date, l'indice d'explosivité (VEI) et le nombre de morts viennent de
la base des éruptions de la NOAA (NCEI, domaine public), déjà livrée dans l'app (assets/data/ha-catastrophes.json.gz).
Usage : python3 -I scripts/lot10-terre-gens/volcans.py"""
import gzip, json, os, sys, time, urllib.parse, urllib.request, datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
UA = 'LCNDA-genealogie/1.0 (application de genealogie ; construction de donnees, usage poli)'
WP = lambda t: 'https://fr.wikipedia.org/wiki/' + urllib.parse.quote(t.replace(' ', '_'))
NOAA = 'https://www.ngdc.noaa.gov/hazel/view/hazards/volcano/event-more-info/{id}'
EVENTS = [
    {'id': 'huaynaputina', 'volcano': 'Huaynaputina', 'where': 'Pérou', 'date': '1600-02-19', 'noaa': 4052, 'effect': [1601, 1601], 'when': 'l’été 1601',
     'what': 'l’éruption du Huaynaputina, au Pérou, a refroidi l’hémisphère nord',
     'quotes': [['Huaynaputina', "L'explosion a des effets sur le climat dans l'hémisphère nord."]]},
    {'id': 'laki', 'volcano': 'Laki (Lakagígar)', 'where': 'Islande', 'date': '1783-06-08', 'noaa': None, 'effect': [1783, 1785], 'when': '1783-1785',
     'what': 'les gaz du volcan Laki, en Islande, ont gâché les récoltes et amené des hivers terribles',
     'quotes': [['Lakagígar', "Cet hiver a là aussi un impact sur les récoltes qui entraîne à partir de 1784 des années de disette et de misère pour la population essentiellement paysanne de l’Europe."],
                ['Lakagígar', "L’impact météorologique des éruptions du Laki se fait sentir les années suivantes avec plusieurs hivers très rigoureux en Europe."]]},
    {'id': 'tambora', 'volcano': 'Tambora', 'where': 'Indonésie', 'date': '1815-04-10', 'noaa': 367, 'effect': [1816, 1817], 'when': '1816, l’« année sans été »',
     'what': 'l’éruption du Tambora, en Indonésie (avril 1815), a détruit les récoltes : le prix du blé a doublé',
     'quotes': [['Année sans été', "L’année sans été désigne l'année 1816, pendant laquelle des perturbations sévères du climat détruisent les récoltes en Europe occidentale et centrale, dans l'Est du Canada et dans le Nord-Est des États-Unis, et dans une grande partie de la Chine."],
                ['Année sans été', "En Europe, la France est le pays le plus touché avec une baisse de température de 3 °C sur l'été 1816."],
                ['Année sans été', "Les pénuries et la hausse des prix (le prix du blé double entre 1815 et 1817) entraînent les grandes crises alimentaires de 1816-1817 en Europe avec leurs émeutes de la faim en France, Angleterre, Irlande, Allemagne."]]},
    {'id': 'krakatoa', 'volcano': 'Krakatoa', 'where': 'Indonésie', 'date': '1883-08-27', 'noaa': 2429, 'effect': [1884, 1884], 'when': '1884',
     'what': 'les cendres du Krakatoa, en Indonésie (août 1883), ont un peu refroidi la Terre l’année suivante',
     'quotes': [['Éruption du Krakatoa en 1883', "Le panache de cendres volcaniques est monté à quatre-vingts kilomètres dans l'atmosphère et a répandu suffisamment de particules pour abaisser la température mondiale moyenne de 0,25 °C l'année suivante, avec une amplitude allant d'approximativement 0,18 à 1,3 °C."]]},
    {'id': 'pinatubo', 'volcano': 'Pinatubo', 'where': 'Philippines', 'date': '1991-06-15', 'noaa': 4428, 'effect': [1992, 1993], 'when': '1992-1993',
     'what': 'l’éruption du Pinatubo, aux Philippines (juin 1991), a refroidi l’hémisphère nord d’un demi-degré',
     'quotes': [['Éruption du Pinatubo en 1991', "Il se produit alors un refroidissement à l'échelle mondiale : en 1992-1993, on estime la diminution de la température moyenne au sol entre 0,5 et 0,6 °C dans l'hémisphère nord et 0,4 °C sur tout le globe."]]},
]


def extract(title):
    for i in range(5):
        try:
            u = 'https://fr.wikipedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'prop': 'extracts', 'explaintext': 1, 'format': 'json', 'redirects': 1, 'titles': title})
            with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': UA}), timeout=60) as r:
                d = json.load(r)
            time.sleep(4)
            return list(d['query']['pages'].values())[0].get('extract', '')
        except urllib.error.HTTPError as e:
            wait = int(e.headers.get('Retry-After') or 20); print('  HTTP', e.code, '→ pause', wait, file=sys.stderr); time.sleep(wait)
    raise SystemExit('Wikipédia ne répond pas')


def main():
    cat = json.load(gzip.open(os.path.join(ROOT, 'assets/data/ha-catastrophes.json.gz')))
    noaa = {r[1]: r for r in cat['rows'] if r[0] == 'vo'}
    texts = {}
    for ev in EVENTS:
        for i, (title, q) in enumerate(ev['quotes']):
            if title not in texts: texts[title] = extract(title)
            if q not in texts[title]: raise SystemExit(f'phrase introuvable dans « {title} » : {q[:80]}…')
            ev['quotes'][i] = {'q': q, 'title': f'Wikipédia — {title}', 'url': WP(title)}
        if ev['noaa']:
            r = noaa.get(ev['noaa']); assert r, ev['id']
            ev['vei'] = r[9]; ev['deaths'] = r[11]; ev['noaa_url'] = NOAA.format(id=ev['noaa'])
    out = {'title': 'Les volcans lointains qui ont gâché les récoltes', 'version': 1, 'built': datetime.date.today().isoformat(),
           'source': 'Wikipédia en français (une phrase exacte par fait) ; NOAA NCEI, Global Significant Volcanic Eruptions Database (doi:10.7289/V5JW8BSH)',
           'licence': 'CC BY-SA 4.0 (phrases de Wikipédia) ; domaine public (NOAA)', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'url': 'https://fr.wikipedia.org/wiki/Hiver_volcanique',
           'note': 'Seulement les grandes éruptions dont Wikipédia dit l’effet sur le climat ou les récoltes en Europe. Les ciels étranges (brouillard sec, couchers de soleil) sont dans « 🌅 Les ciels étranges de sa vie ».',
           'rows': EVENTS}
    p = os.path.join(ROOT, 'assets/data/l10t-volcans.json.gz')
    with gzip.open(p, 'wt', encoding='utf-8', compresslevel=9) as f: json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('volcans :', len(EVENTS), 'éruptions,', os.path.getsize(p), 'octets')


if __name__ == '__main__':
    main()
