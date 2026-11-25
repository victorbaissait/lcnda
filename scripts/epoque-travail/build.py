#!/usr/bin/env python3
"""LCNDA — 🕰 Son époque et son travail : fabrique les fichiers assets/data/et-*.json.gz.

  python3 scripts/epoque-travail/build.py --cache DOSSIER [--only fleaux,greves,ouvrages,nouveautes,livres,mode]

Sources (toutes téléchargées, licence lue) :
  🐛 fléaux (phylloxéra, oïdium, mildiou, pébrine…), 💡 nouveautés, 📷 formats de photos : Wikipédia (CC BY-SA 4.0) —
     la page est téléchargée et la PHRASE qui donne la date y est cherchée ; elle est gardée mot pour mot avec son lien ;
     une ligne dont la phrase n'est pas trouvée n'est pas livrée (scripts/epoque-travail/curated.py) ;
  ✊ grèves, 🌉 ponts, canaux, écluses, tunnels, aqueducs, 📚 livres : Wikidata (CC0 1.0), requêtes SPARQL de wd_queries.py
     (les grèves aussi par les catégories « Grève en France »… de Wikipédia, lues par le service MWAPI de Wikidata) ;
  👗 la mode : Wikimedia Commons, catégories « 1860s fashion plates »… (chaque image garde son auteur, sa licence, son lien ;
     on ne livre PAS les images, seulement leur fiche : l'app les montre depuis Commons quand Internet est là).
Le cache garde chaque téléchargement (les serveurs de Wikimedia limitent les requêtes : la première fabrication est lente).
"""
import argparse
import datetime
import json
import math
import os
import re
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from et_common import cached, http, mw, qid, sparql, wd_year, wkt_point, write_gz  # noqa: E402
import curated as CU  # noqa: E402
import wd_queries as W  # noqa: E402

TODAY = datetime.date.today().isoformat()
WD = {'source': 'Wikidata', 'licence': 'CC0 1.0', 'url': 'https://www.wikidata.org', 'built': TODAY}
WP = {'source': 'Wikipédia', 'licence': 'CC BY-SA 4.0', 'url': 'https://fr.wikipedia.org', 'mention': 'Contributeurs de Wikipédia', 'built': TODAY}


# ═════════ Wikipédia : le texte d'une page, et la phrase qui contient la date ═════════
def page_url(page):
    lang, title = page.split(':', 1)
    return f'https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(title.replace(" ", "_"))}'


def wikitext(cache, page, depth=0):
    """« fr:Titre » → (titre final, wikitexte) ; suit les redirections (index.php?action=raw : moins limité que l'API)"""
    lang, title = page.split(':', 1)
    url = f'https://{lang}.wikipedia.org/w/index.php?' + urllib.parse.urlencode({'title': title, 'action': 'raw'})
    try:
        raw = cached(cache, 'raw-' + re.sub(r'[^\w.-]+', '_', page)[:120] + '.wiki', lambda: http(url)).decode('utf-8')
    except RuntimeError as e:
        print(f'  ⚠️ {page} : {e}', flush=True)
        return title, ''
    m = re.match(r'\s*#(?:REDIRECT\w*)\s*\[\[([^\]|#]+)', raw, re.I)
    if m and depth < 3:
        return wikitext(cache, f'{lang}:{m.group(1).strip()}', depth + 1)
    return title, raw


ROMAN = r'[IVXL]+'


def _template(body):
    parts = [p.strip() for p in body.split('|')]
    name = parts[0].lower()
    if name in ('s-', 's', 'siècle', 's2-', 'sp-'):
        return f'{parts[1]}e siècle' if len(parts) > 1 else ''
    if name in ('unité', 'nombre', 'nb', 'formatnum', 'nobr', 'lang', 'langue', 'date', 'date-', 'lien', 'citation', 'japonais', 'quoi', 'abréviation', 'abr', 'euro', 'heure', 'm', 'lien web'):
        if name in ('lang', 'langue') and len(parts) > 2:
            return parts[-1]
        if name == 'euro':
            return (parts[1] + ' €') if len(parts) > 1 else ''
        vals = [p for p in parts[1:] if '=' not in p]
        return ' '.join(vals)
    if name in ('1er', 'er', 'e', 'ers', 'ère', 'nd', 'nde', 'xe', '1re', 'ier'):
        return {'1er': '1er', '1re': '1re'}.get(name, name)
    if re.fullmatch(r'(\d+)(er|e|re)', name):
        return name
    if len(parts) == 1 and re.fullmatch(r'[A-ZÉ][\wéèêëïî-]+ [IVX]+(?:e|er)?', parts[0]):  # {{Napoléon III}}, {{Louis XIV}}
        return parts[0]
    if name in ('colonnes', 'colonne', 'multicol', 'boîte déroulante', 'liste en colonnes'):
        return '\n'.join(p for p in body.split('|')[1:] if not re.match(r'^\s*\w+\s*=[^\n]*$', p))
    return ''


def plain(w):
    w = re.sub(r'<!--.*?-->', '', w, flags=re.S)
    w = re.sub(r'<ref[^>/]*/>', '', w)
    w = re.sub(r'<ref[^>]*>.*?</ref>', '', w, flags=re.S)
    w = re.sub(r'\[\[(?:Fichier|File|Image|Catégorie|Category):[^\[\]]*(?:\[\[[^\]]*\]\][^\[\]]*)*\]\]', '', w, flags=re.I)
    w = re.sub(r'\[\[[^\]|]*\|([^\]]*)\]\]', r'\1', w)
    w = re.sub(r'\[\[([^\]]*)\]\]', r'\1', w)
    for _ in range(8):  # modèles, du plus intérieur au plus extérieur
        n = re.sub(r'\{\{([^{}]*)\}\}', lambda m: _template(m.group(1)), w)
        if n == w:
            break
        w = n
    w = re.sub(r'\{\|.*?\|\}', '', w, flags=re.S)
    w = re.sub(r'\[https?://\S+ ([^\]]*)\]', r'\1', w)
    w = re.sub(r'(?im)^[^|\n]*\.(?:jpe?g|png|svg|gif|tiff?)\|', '', w)  # légendes des galeries
    w = re.sub(r"'''?", '', w)
    w = re.sub(r'<[^>]+>', '', w)
    w = w.replace('&nbsp;', ' ').replace(' ', ' ')
    return w


def sentences(text):
    out = []
    for line in text.split('\n'):
        line = line.strip().lstrip('*#:; ').strip()
        if not line or line.startswith('==') or line.startswith('|') or line.startswith('!'):
            continue
        for s in re.split(r'(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ«])', line):
            s = re.sub(r'\s+', ' ', s).strip()
            if len(s) > 20:
                out.append(s)
    return out


def find_sentence(cache, page, rx, kw=None, year=None):
    """la première phrase de la page qui a `rx` (et le mot `kw`) → {sentence, url, title} ou None.
    Si la phrase ne dit pas l'année `year` (« La même année… », « Quatre ans plus tard… »), on y joint la ou les deux phrases d'avant."""
    title, w = wikitext(cache, page)
    if not w:
        return None
    lang = page.split(':', 1)[0]
    ss = sentences(plain(w))
    for i, s in enumerate(ss):
        if re.search(rx, s) and (not kw or re.search(kw, s, re.I)):
            txt = s
            if year is not None and str(year) not in txt:
                for k in (1, 2, 3):
                    if i - k >= 0 and str(year) in ss[i - k]:
                        txt = ' '.join(ss[i - k:i + 1])
                        break
            return {'sentence': txt[:900], 'url': page_url(f'{lang}:{title}'), 'title': f'Wikipédia ({lang}) : {title}'}
    return None


# ═════════ 🐛 les fléaux ═════════
def build_fleaux(cache):
    out = []
    for fid, icon, name, jobs, page, rows in CU.FLEAUX:
        for y, prec, deps, zone, rx, *own in rows:
            pg = next((o for o in own if isinstance(o, str)), page)
            need = next((o for o in own if isinstance(o, int)), y)  # l'année que la phrase (ou celle d'avant) doit dire
            hit = find_sentence(cache, pg, rx, None, need)
            if not hit:
                print(f'  ⚠️ fléau {fid} {y} : phrase introuvable ({rx}) dans {pg}', flush=True)
                continue
            ok = str(need) in hit['sentence'] or (prec == 'decennie' and re.search(rf'années {y}|{y}-{y + 10}', hit['sentence']))
            if not ok:
                print(f'  ⚠️ fléau {fid} {y} : la phrase ne dit pas l’année → écartée : {hit["sentence"][:160]}', flush=True)
                continue
            out.append({'f': fid, 'y': y, 'prec': prec, 'deps': deps, 'zone': zone, **hit})
    meta = {fid: {'icon': icon, 'name': name, 'jobs': jobs, 'url': page_url(page)} for fid, icon, name, jobs, page, _ in CU.FLEAUX}
    print(f'  fléaux : {len(out)} lignes', flush=True)
    return {**WP, 'note': 'Phrases recopiées mot pour mot des pages Wikipédia (et de leurs sources citées). Les départements de chaque zone sont lus par l’app d’après les lieux que la phrase nomme.', 'fleaux': meta, 'rows': out}


# ═════════ 💡 les nouveautés ═════════
def build_nouveautes(cache):
    rows = []
    for nid, icon, name, y, scope, page, rx, kw in CU.NOUVEAUTES:
        hit = find_sentence(cache, page, rx, kw, y)
        if not hit:
            print(f'  ⚠️ nouveauté {nid} : phrase introuvable', flush=True)
            continue
        if y is None:
            m = re.search(rx, hit['sentence'])
            y = int(m.group(0)) if m else None
        if y is None or str(y) not in hit['sentence']:
            print(f'  ⚠️ nouveauté {nid} : l’année {y} n’est pas dans la phrase → écartée : {hit["sentence"][:160]}', flush=True)
            continue
        rows.append({'id': nid, 'icon': icon, 'n': name, 'y': y, 'scope': scope, **hit})
    rows.sort(key=lambda r: r['y'])
    print(f'  nouveautés : {len(rows)} sur {len(CU.NOUVEAUTES)}', flush=True)
    return {**WP, 'rows': rows}


# ═════════ 📷 formats de photos ═════════
def build_photos(cache):
    rows = []
    for pid, name, page, start, end in CU.PHOTOS:
        hit = find_sentence(cache, page, start[0], start[1])
        if not hit:
            print(f'  ⚠️ photo {pid} : phrase du début introuvable', flush=True)
            continue
        y0 = int(re.search(start[0], hit['sentence']).group(0))
        row = {'id': pid, 'n': name, 'from': y0, 'to': None, **hit}
        if end:
            h2 = find_sentence(cache, page, end[0], end[1])
            if h2 and h2['sentence'] != hit['sentence']:
                y1 = int(re.search(end[0], h2['sentence']).group(0))
                if y1 > y0:
                    row.update({'to': y1, 'sentence_to': h2['sentence']})
            elif h2:
                y1 = int(re.search(end[0], h2['sentence']).group(0))
                if y1 > y0:
                    row['to'] = y1
        rows.append(row)
    print(f'  formats de photos : {len(rows)} sur {len(CU.PHOTOS)} ({sum(1 for r in rows if r["to"])} avec une fin sourcée)', flush=True)
    return rows


# ═════════ ✊ les grèves ═════════
IND = [('mine', r'mineur|mines?\b|houill|charbon|ardois|coron|bassin minier|miner|colliery|coal'),
       ('rail', r'cheminot|chemins? de fer|ferroviaire|sncf|railway|railroad|\brail'),
       ('port', r'docker|portuaire|dock|port autonome|longshore'),
       ('textile', r'tisser|tisseu|tissag|textile|canut|soie|ovalist|filature|fileu|bonnet|dentel|teintur|lain|coton|weaver|mill'),
       ('metal', r'm[ée]tallurg|sid[ée]rurg|forge|fonderie|acier|steel|usine|automobile|renault|peugeot|citro|chantier naval|arsenal|shipyard'),
       ('peche', r'p[êe]cheu?r|sardin|conserve|marin-p'),
       ('agri', r'vigneron|viticult|paysan|agricol|ouvrier agricole|b[ûu]cheron|r[ée]sinier|ferme|farm'),
       ('batiment', r'ma[çc]on|b[âa]timent|terrassier|charpentier|construction'),
       ('verre', r'verrier|verrerie|glass'),
       ('poste', r'postier|\bpostes?\b|ptt|facteur'),
       ('transport', r'tramway|omnibus|m[ée]tro|taxi|routier|chauffeur|camionneur|transport'),
       ('vetement', r'midinette|couturi|modiste|chapeli|cordonn|chaussure|ganti'),
       ('tabac', r'tabac|cigari|allumette'),
       ('enseignement', r'instituteur|enseignant|lyc[ée]en|[ée]tudiant|universit|[ée]cole'),
       ('sante', r'infirmi|h[ôo]pital|m[ée]decin'),
       ('imprimerie', r'typograph|imprim|livre|presse')]


def ind_of(*texts):
    t = ' '.join(x or '' for x in texts).lower()
    for k, rx in IND:
        if re.search(rx, t):
            return k
    return ''


def title_year(t):
    m = re.search(r'\b(1[6-9]\d\d|20[0-2]\d)\b', t or '')
    return int(m.group(1)) if m else None


def build_greves(cache):
    base = sparql(cache, 'strikes', W.STRIKES)
    extra = []
    try:
        vals = ' '.join(f'"{c}"' for c in W.STRIKE_CATS)
        cats = sparql(cache, 'cats1', W.CATMEMBERS % vals)
        subs = sorted({x['title'] for x in cats if x.get('ns') == '14'} - set(W.STRIKE_CATS))
        if subs:
            cats += sparql(cache, 'cats2', W.CATMEMBERS % ' '.join(f'"{c}"' for c in subs))
        have = {qid(r['s']) for r in base}
        ids = sorted({qid(x['item']) for x in cats if x.get('ns') == '0' and x.get('item')} - have)
        catof = {}
        for x in cats:
            if x.get('item'):
                catof.setdefault(qid(x['item']), x['cat'])
        for k in range(0, len(ids), 300):
            extra += sparql(cache, f'facts{k // 300}', W.FACTS % ' '.join(f'wd:{q}' for q in ids[k:k + 300]))
        print(f'  grèves : {len(ids)} articles en plus par les catégories de Wikipédia', flush=True)
    except RuntimeError as e:
        print(f'  ⚠️ catégories de Wikipédia : {e}', flush=True)
        catof = {}
    base_ids = {qid(r['s']) for r in base}
    by = {}
    for r in base + extra:
        by.setdefault(qid(r['s']), []).append(r)
    rows = []
    skipped = 0
    for q, rs in by.items():
        r0 = rs[0]
        name = r0.get('sLabel', '')
        if re.match(r'^Q\d+$', name):
            continue
        # les catégories ramènent aussi des lois, des syndicats, des catastrophes : on garde ce qui est une grève ou une révolte
        types = ' '.join(r.get('typeLabel', '') for r in rs).lower()
        # les catégories ramènent aussi des émeutes politiques, des lois, des syndicats : on garde les conflits du TRAVAIL
        if q in catof and q not in base_ids and not re.search(r'gr[èe]ve|strike|lock-out|conflit du travail|conflit social|labou?r|ouvri|canut|mineur|houill|fusillade|cheminot|docker|midinette|sardini|vigneron|tisser|travailleu|salari', name.lower() + ' ' + types):
            skipped += 1
            continue
        ys = [wd_year(r.get('st')) or wd_year(r.get('d')) for r in rs if r.get('st') or r.get('d')]
        y = min([v for v in ys if v] or [title_year(name)] or [None]) if ys or title_year(name) else None
        if y is None or y > 2026:
            continue
        y2 = max([wd_year(r.get('end')) for r in rs if r.get('end')] or [y])
        d = ''
        for r in rs:
            v = r.get('st') or r.get('d') or ''
            if v and not v.startswith('-') and not v[5:10] == '01-01':
                d = v[:10]
                break
        lat = lon = None
        radius = 0
        place = ''
        for r in rs:
            if r.get('coord'):
                lat, lon = wkt_point(r['coord']) or (None, None)
                place = r.get('locLabel') or r.get('admLabel') or ''
                break
        if lat is None:
            for r in sorted(rs, key=lambda r: float(r.get('larea') or 0)):
                if r.get('lcoord'):
                    lat, lon = wkt_point(r['lcoord']) or (None, None)
                    area = float(r.get('larea') or 0)
                    radius = 0 if area <= 1500 else (-1 if area > 150000 else min(200, round(math.sqrt(area / math.pi))))
                    place = r.get('locLabel', '')
                    break
        if lat is None:
            for r in rs:
                if r.get('acoord'):
                    lat, lon = wkt_point(r['acoord']) or (None, None)
                    place = r.get('admLabel', '')
                    break
        country = next((r.get('cLabel') for r in rs if r.get('cLabel')), '')
        fr = next((urllib.parse.unquote(r['frwiki'].rsplit('/', 1)[-1]).replace('_', ' ') for r in rs if r.get('frwiki')), '')
        ind_lab = ' '.join(sorted({r.get('indLabel', '') for r in rs}))
        rows.append([q, name, y, y2 if y2 != y else None, d, lat, lon, radius, place if not re.match(r'^Q\d+$', place) else '', country, ind_of(name, ind_lab, fr), fr, int(r0.get('sl') or 0)])
    rows.sort(key=lambda r: (r[2], r[1]))
    print(f'  grèves : {len(rows)} (dont {sum(1 for r in rows if r[5] is not None)} placées ; {skipped} articles des catégories écartés : ni grève ni révolte)', flush=True)
    return {**WD, 'note': 'Grèves et conflits du travail de Wikidata (classe « grève » et ses sous-classes), et les articles des catégories « Grève en France », « Grève en Belgique »… de Wikipédia. Lieu : les coordonnées de la grève, sinon celles de son lieu (P276) ou de sa commune (P131). r = rayon (km) quand le lieu est une région (0 = un point, -1 = tout un pays).',
            'fields': ['q', 'n', 'y', 'y2', 'd', 'lat', 'lon', 'r', 'place', 'country', 'ind', 'frwiki', 'sl'], 'rows': rows}


# ═════════ 🌉 ponts, canaux, écluses, tunnels, aqueducs ═════════
KIND_ORDER = ['ecluse', 'canal', 'tunnel', 'aqueduc', 'pont']


def build_ouvrages(cache):
    by = {}
    for q, k in W.OUVRAGE_KINDS.items():
        try:
            rs = sparql(cache, 'ouv-' + k, W.OUVRAGES % q)
        except RuntimeError as e:
            print(f'  ⚠️ {k} : {e}', flush=True)
            continue
        for r in rs:
            it = qid(r['it'])
            cur = by.setdefault(it, {'kinds': set(), 'rs': []})
            cur['kinds'].add(k)
            cur['rs'].append(r)
    rows = []
    for it, x in by.items():
        rs = x['rs']
        name = rs[0].get('itLabel', '')
        if re.match(r'^Q\d+$', name):
            continue
        ys = [wd_year(r.get('inc')) for r in rs if r.get('inc')] + [wd_year(r.get('open')) for r in rs if r.get('open')]
        ys = [v for v in ys if v is not None and v <= 2026]
        if not ys:
            continue
        pt = wkt_point(rs[0]['coord'])
        if not pt:
            continue
        kind = next(k for k in KIND_ORDER if k in x['kinds'])
        cross = next((r.get('crossLabel') for r in rs if r.get('crossLabel') and not re.match(r'^Q\d+$', r.get('crossLabel'))), '')
        mat = next((r.get('matLabel') for r in rs if r.get('matLabel') and not re.match(r'^Q\d+$', r.get('matLabel'))), '')
        fr = next((urllib.parse.unquote(r['frwiki'].rsplit('/', 1)[-1]).replace('_', ' ') for r in rs if r.get('frwiki')), '')
        rows.append([it, name, kind, min(ys), pt[0], pt[1], rs[0].get('cLabel', ''), cross, mat, fr, int(rs[0].get('sl') or 0)])
    rows.sort(key=lambda r: (r[3], r[1]))
    print(f'  ouvrages : {len(rows)} ({", ".join(f"{k} {sum(1 for r in rows if r[2] == k)}" for k in KIND_ORDER)})', flush=True)
    return {**WD, 'note': 'Ponts, canaux, écluses, tunnels et aqueducs de France, Belgique, Suisse, Luxembourg et Monaco, datés (création P571 ou mise en service P1619) et placés (P625).',
            'fields': ['q', 'n', 'k', 'y', 'lat', 'lon', 'country', 'cross', 'mat', 'frwiki', 'sl'], 'rows': rows}


# ═════════ 📚 les livres ═════════
FRLANG = re.compile(r'^(français|french)$', re.I)
FRCOUNTRY = re.compile(r'France|Belgique|Suisse|Royaume de France|Second Empire|Troisième République|Monarchie de Juillet|Premier Empire|Restauration', re.I)


def build_livres(cache, per_year=15):
    by = {}
    for a, b in W.BOOK_SPANS:
        try:
            rs = sparql(cache, f'books-{a}', W.BOOKS % (30, a, b))
        except RuntimeError as e:
            print(f'  ⚠️ livres {a}–{b} : {e}', flush=True)
            continue
        for r in rs:
            by.setdefault(qid(r['w']), []).append(r)
    rows = []
    for q, rs in by.items():
        t = next((r['wfr'] for r in rs if r.get('wfr')), '') or next((r['wen'] for r in rs if r.get('wen')), '')
        if not t or re.match(r'^Q\d+$', t):
            continue
        ys = [wd_year(r['d']) for r in rs if r.get('d')]
        ys = [v for v in ys if v]
        if not ys:
            continue
        y = min(ys)
        auth = []
        for r in rs:
            al = r.get('afr') or r.get('aen') or ''
            if al and al not in auth:
                auth.append(al)
        langs = {qid(r['lang']) for r in rs if r.get('lang')}
        origs = {qid(r['orig']) for r in rs if r.get('orig')}
        fr = W.FR_LANG in langs or (not langs and bool(origs & W.FR_COUNTRIES))
        d = next((r['d'][:10] for r in rs if r.get('d') and wd_year(r['d']) == y and r['d'][5:10] != '01-01'), '')
        rows.append([q, t, ', '.join(auth[:3]), y, d, 1 if fr else 0, int(rs[0].get('sl') or 0), 1 if any(r.get('frwiki') for r in rs) else 0])
    keep = []
    yrs = {}
    for r in rows:
        yrs.setdefault(r[3], []).append(r)
    for y, lst in yrs.items():
        lst.sort(key=lambda r: -r[6])
        frs = [r for r in lst if r[5]][:per_year // 2]
        keep += frs + [r for r in lst if r not in frs][:per_year - len(frs)]
    keep.sort(key=lambda r: (r[3], -r[6]))
    print(f'  livres : {len(keep)} gardés sur {len(rows)} (au plus {per_year} par an ; {sum(r[5] for r in keep)} en français)', flush=True)
    return {**WD, 'note': f'Œuvres littéraires (roman, pièce, poème, recueil, nouvelle, essai…) de Wikidata avec une date de parution (P577) et au moins 30 articles dans les Wikipédias du monde ; au plus {per_year} par année, les plus connues.',
            'fields': ['q', 't', 'a', 'y', 'd', 'fr', 'sl', 'frwiki'], 'rows': keep}


# ═════════ 👗 la mode (Wikimedia Commons) ═════════
OK_LIC = re.compile(r'^(public domain|pd|cc0|cc[ -]by(?:[ -]sa)?[ -]?\d|cc-by|cc-by-sa|no restrictions|attribution)', re.I)


def strip_html(s):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', s or '')).strip()


def commons_files(cache, cat, limit=40):
    d = mw(cache, 'commons.wikimedia.org', {'action': 'query', 'generator': 'categorymembers', 'gcmtitle': cat, 'gcmtype': 'file', 'gcmlimit': limit,
                                             'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size', 'iiurlwidth': 240,
                                             'iiextmetadatafilter': 'Artist|LicenseShortName|LicenseUrl|DateTimeOriginal|ObjectName|ImageDescription|Credit'}, 'cm')
    out = []
    for p in (d.get('query', {}).get('pages') or []):
        ii = (p.get('imageinfo') or [{}])[0]
        md = ii.get('extmetadata') or {}
        g = lambda k: strip_html((md.get(k) or {}).get('value', ''))  # noqa: E731
        lic = g('LicenseShortName')
        if not ii.get('thumburl') or not OK_LIC.search(lic or ''):
            continue
        if not re.search(r'\.(jpe?g|png|tiff?|gif|webp)$', p['title'], re.I):
            continue
        out.append({'f': p['title'][5:], 't': ii['thumburl'], 'w': ii.get('thumbwidth'), 'h': ii.get('thumbheight'), 'page': ii.get('descriptionurl'),
                    'artist': g('Artist')[:120], 'lic': lic, 'licurl': (md.get('LicenseUrl') or {}).get('value', ''), 'date': g('DateTimeOriginal')[:40],
                    'title': (g('ObjectName') or p['title'][5:])[:140], 'cat': cat})
    return out


def build_mode(cache, photos):
    decades = {}
    gaps = []
    for dd in range(1780, 1961, 10):
        imgs = []
        for cat, who in [(f'Category:{dd}s fashion plates', 'gravure'), (f'Category:Male fashion in the {dd}s', 'hommes')]:
            try:
                got = commons_files(cache, cat)
            except RuntimeError as e:
                print(f'  ⚠️ {cat} : {e}', flush=True)
                got = []
            for g in got:
                g['who'] = who
            imgs += got[:14]
        seen = set()
        uniq = [g for g in imgs if not (g['f'] in seen or seen.add(g['f']))]
        if uniq:
            decades[str(dd)] = uniq
        else:
            gaps.append(dd)
        print(f'  mode {dd}s : {len(uniq)} images', flush=True)
    return {'source': 'Wikimedia Commons', 'licence': 'chaque image a sa licence (domaine public, CC BY, CC BY-SA)', 'url': 'https://commons.wikimedia.org', 'built': TODAY,
            'note': 'Gravures de mode et photos de Wikimedia Commons, rangées par décennie (catégories « 1860s fashion plates », « Male fashion in the 1860s »). Les images ne sont pas dans l’app : elles s’affichent depuis Commons quand Internet est là.',
            'gaps': gaps, 'decades': decades, 'photos': photos, 'photos_source': WP}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', required=True)
    ap.add_argument('--only', default='fleaux,nouveautes,greves,ouvrages,livres,mode')
    a = ap.parse_args()
    only = set(a.only.split(','))
    if 'fleaux' in only:
        write_gz('et-fleaux.json.gz', build_fleaux(a.cache))
    if 'nouveautes' in only:
        write_gz('et-nouveautes.json.gz', build_nouveautes(a.cache))
    if 'greves' in only:
        write_gz('et-greves.json.gz', build_greves(a.cache))
    if 'ouvrages' in only:
        write_gz('et-ouvrages.json.gz', build_ouvrages(a.cache))
    if 'livres' in only:
        write_gz('et-livres.json.gz', build_livres(a.cache))
    if 'mode' in only:
        write_gz('et-mode.json.gz', build_mode(a.cache, build_photos(a.cache)))


if __name__ == '__main__':
    main()
