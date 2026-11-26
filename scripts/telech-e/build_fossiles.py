#!/usr/bin/env python3
"""🦴 Lot E — Fossiles trouvés près du village (assets/data/te-fossiles.json.gz).

Source : The Paleobiology Database (PBDB), API data1.2 (https://paleobiodb.org/data1.2/) : les gisements (« collections ») de
France, de Belgique, de Suisse et du Luxembourg, avec leur position, leur âge et les fossiles trouvés (nom accepté, classe).
Licence : les données de la PBDB sont sous Creative Commons Attribution 4.0 (CC BY 4.0). Le site paleobiodb.org n'était pas
joignable depuis l'atelier de développement le 2026-11-26 : le script LIT la licence au moment de fabriquer (la réponse
« datainfo » de l'API et la page de documentation) et s'arrête s'il n'y trouve pas une licence CC BY sans « NC ».
Gardé par gisement : n°, position (arrondie à 0,01°), nom, formation, intervalle et âge (millions d'années), nombre de
fossiles, les 8 noms les plus fréquents avec leur classe. Fabriqué seulement sur GitHub (workflow telech-e.yml).

Lancer : python3 -I scripts/telech-e/build_fossiles.py [dossier de sortie]   (TE_RAW = cache)
"""
import json, os, re, sys, time
from collections import Counter, defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
API = 'https://paleobiodb.org/data1.2'
CC = 'FR,BE,CH,LU'


def licence(*texts):
    """la phrase de licence trouvée (CC BY, pas NC), sinon arrêt"""
    for t in texts:
        flat = ' '.join(str(t).split())
        for m in re.finditer(r'[^.]{0,160}(?:Creative Commons|CC[- ]BY)[^.]{0,160}', flat, re.I):
            q = m.group(0).strip()
            if re.search(r'\bCC[- ]?BY\b|Attribution', q, re.I) and not re.search(r'\bNC\b|NonCommercial|Non-Commercial', q, re.I):
                return q
    for t in texts:  # l'adresse de la licence suffit aussi (creativecommons.org/licenses/by/…, sans « -nc »)
        m = re.search(r'creativecommons\.org/licenses/by/[0-9.]+/?', str(t))
        if m:
            return m.group(0)
    for t in texts:  # diagnostic dans le journal : ce que la PBDB a répondu
        print('réponse PBDB (début) :', ' '.join(str(t).split())[:600], file=sys.stderr)
    sys.exit('Licence CC BY introuvable dans les réponses de la PBDB : relire https://paleobiodb.org/ avant de fabriquer le fichier.')


def main():
    colls = json.loads(wm.get(f'{API}/colls/list.json?cc={CC}&show=loc,strat,time&limit=all&datainfo&vocab=pbdb'))
    occs = json.loads(wm.get(f'{API}/occs/list.json?cc={CC}&show=class&limit=all&datainfo&vocab=pbdb'))
    doc = wm.get(f'{API}/', 'text/html').decode('utf-8', 'replace')
    lic_info = {k: v for k, v in colls.items() if k != 'records'}
    quote = licence(json.dumps(lic_info, ensure_ascii=False), re.sub(r'<[^>]+>', ' ', doc))
    taxa = defaultdict(Counter)
    for o in occs.get('records', []):
        name = o.get('accepted_name') or o.get('identified_name') or ''
        if name:
            taxa[o.get('collection_no')][(name, o.get('class') or o.get('phylum') or '')] += 1
    out = []
    for c in colls.get('records', []):
        try:
            lat, lon = round(float(c['lat']), 2), round(float(c['lng']), 2)
        except (KeyError, TypeError, ValueError):
            continue
        no = c.get('collection_no')
        t = taxa.get(no, Counter())
        out.append([int(no), lat, lon, (c.get('collection_name') or '')[:120], (c.get('formation') or '')[:80], c.get('early_interval') or '', c.get('late_interval') or '',
                    c.get('max_ma'), c.get('min_ma'), sum(t.values()), [[n, k] for (n, k), _ in t.most_common(8)], (c.get('cc') or '').upper()])
    fields = ['no', 'lat', 'lon', 'name', 'formation', 'early', 'late', 'max_ma', 'min_ma', 'n', 'taxa', 'cc']
    meta = {'source': 'The Paleobiology Database (PBDB), API data1.2', 'licence': 'CC BY 4.0', 'licence_url': 'https://creativecommons.org/licenses/by/4.0/deed.fr', 'quote': quote,
            'url': 'https://paleobiodb.org/', 'item_url': 'https://paleobiodb.org/classic/basicCollectionSearch?collection_no={no}', 'built': time.strftime('%Y-%m-%d'),
            'cite': 'Données de la Paleobiology Database (paleobiodb.org), CC BY 4.0',
            'what': 'Gisements de fossiles de France, Belgique, Suisse et Luxembourg : position, âge, formation, les fossiles les plus fréquents',
            'fields': fields, 'rows': out}
    size = wm.write_gz(OUT, 'te-fossiles.json.gz', meta)
    print(f'te-fossiles : {len(out)} gisements, {sum(r[9] for r in out)} fossiles, {size} octets ; licence lue : {quote[:120]}')


if __name__ == '__main__':
    main()
