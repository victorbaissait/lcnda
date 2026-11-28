#!/usr/bin/env python3
"""🌐 Traduction hors ligne (lot D) : petit programme lancé par l'app avec le Python de l'environnement « traduction »
(SHARED_DATA_DIR/traduction/venv), où Argos Translate est installé (pip, licence MIT / CC0).

  python argos_translate.py --check                 → {"ok", "version", "installed": [{from, to, version, licence}]}
  python argos_translate.py --install de en         → télécharge et installe le modèle de → en (index officiel d'Argos)
  python argos_translate.py --remove de en          → retire le modèle
  python argos_translate.py --translate de fr       → lit {"text": "…"} sur l'entrée, écrit {"ok", "text", "route"}
Tout se passe sur cet ordinateur : le texte à traduire n'est envoyé nulle part. Les modèles vont dans ARGOS_PACKAGES_DIR
(défini par l'app). Pas de modèle direct vers le français : on passe par l'anglais (de → en → fr), comme Argos le fait lui-même.
"""
import json, os, re, sys


def out(obj, code=0):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.stdout.flush()
    sys.exit(code)


def licence_of(pkg_dir):
    """la licence et les crédits écrits dans le paquet (README.md, metadata.json), tels quels (300 caractères au plus)"""
    txt = ''
    for name in ('README.md', 'README', 'metadata.json'):
        p = os.path.join(pkg_dir, name)
        if os.path.isfile(p):
            try:
                t = open(p, encoding='utf-8', errors='replace').read()
            except OSError:
                continue
            m = re.search(r'(?is)(licen[cs]e[^\n]*\n?.{0,260})', t)
            if m:
                return re.sub(r'\s+', ' ', m.group(1)).strip()[:300]
            if not txt:
                txt = re.sub(r'\s+', ' ', t).strip()[:300]
    return txt


def main():
    a = sys.argv[1:]
    try:
        import argostranslate.package as P
        import argostranslate.translate as T
        try:
            from importlib.metadata import version
            ver = version('argostranslate')
        except Exception:  # noqa
            ver = '?'
    except Exception as e:  # noqa
        out({'ok': False, 'code': 'no_engine', 'message': f'Argos Translate n’est pas installé ({e}).'}, 2)
    if not a or a[0] == '--check':
        inst = []
        for p in P.get_installed_packages():
            inst.append({'from': p.from_code, 'to': p.to_code, 'version': str(getattr(p, 'package_version', '')), 'licence': licence_of(str(getattr(p, 'package_path', '')))})
        out({'ok': True, 'version': ver, 'installed': inst})
    if a[0] == '--install' and len(a) == 3:
        P.update_package_index()
        avail = [p for p in P.get_available_packages() if p.from_code == a[1] and p.to_code == a[2]]
        if not avail:
            out({'ok': False, 'code': 'no_model', 'message': f'Aucun modèle {a[1]} → {a[2]} dans l’index d’Argos Translate.'}, 3)
        path = avail[0].download()
        P.install_from_path(path)
        try:
            os.remove(path)
        except OSError:
            pass
        out({'ok': True, 'from': a[1], 'to': a[2], 'version': str(getattr(avail[0], 'package_version', ''))})
    if a[0] == '--remove' and len(a) == 3:
        for p in P.get_installed_packages():
            if p.from_code == a[1] and p.to_code == a[2]:
                P.uninstall(p)
        out({'ok': True})
    if a[0] == '--translate' and len(a) == 3:
        data = json.loads(sys.stdin.read() or '{}')
        text = str(data.get('text') or '')[:20000]
        src, dst = a[1], a[2]
        langs = {l.code: l for l in T.get_installed_languages()}
        def one(t, f, to):
            if f not in langs or to not in langs:
                raise RuntimeError(f'modèle {f} → {to} absent')
            tr = langs[f].get_translation(langs[to])
            if tr is None:
                raise RuntimeError(f'modèle {f} → {to} absent')
            return tr.translate(t)
        route = [src, dst]
        try:
            res = one(text, src, dst)
        except RuntimeError:
            if src == 'en' or dst == 'en':
                out({'ok': False, 'code': 'no_model', 'message': f'Il manque le modèle {src} → {dst}.'}, 3)
            res = one(one(text, src, 'en'), 'en', dst)
            route = [src, 'en', dst]
        out({'ok': True, 'text': res, 'route': route, 'version': ver})
    out({'ok': False, 'message': 'Commande inconnue.'}, 2)


if __name__ == '__main__':
    main()
