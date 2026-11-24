#!/usr/bin/env python3
"""LCNDA — 🏰 petit jeu de lieux GOV FABRIQUÉ pour les essais (tests/test-gov.js).

    python3 scripts/gov/make-fixture.py DOSSIER

Écrit DOSSIER/json/types.owl + objets.json (même forme que le service de GOV), puis lance build-gov.py --depuis-json :
DOSSIER/gov-pack.lcgov et DOSSIER/gov.sqlite. Les lieux sont inventés (Lacombsdorf, Kreis Durandsberg, Royaume de Durandie…) ;
seuls les types (Kirchspiel, Kreis, Provinz…) reprennent les mots de GOV.
"""
import json
import os
import subprocess
import sys

TYPES = [  # id, groupe principal, autres groupes, étiquettes
    (55, 8, [], {'de': 'Dorf', 'en': 'village'}),
    (29, 3, [], {'de': 'Kirchspiel', 'en': 'parish', 'pl': 'parafia'}),
    (27, 3, [], {'de': 'Kirchenkreis'}),
    (18, 1, [31], {'de': 'Gemeinde', 'pl': 'gmina'}),
    (32, 1, [29], {'de': 'Kreis', 'pl': 'powiat'}),
    (45, 1, [27, 28], {'de': 'Provinz', 'fr': 'province', 'en': 'province'}),
    (31, 1, [26], {'de': 'Königreich', 'fr': 'royaume', 'en': 'kingdom'}),
    (56, 1, [26], {'de': 'Republik', 'fr': 'république', 'en': 'republic'}),
    (103, 2, [], {'de': 'Standesamt', 'fr': 'état civil'}),
]


def types_owl():
    out = ['<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#" xmlns:j.1="http://gov.genealogy.net/types.owl#">']
    for tid, grp, more, labels in TYPES:
        out.append(f'  <j.1:group_{grp} rdf:about="http://gov.genealogy.net/types.owl#{tid}">')
        for g in more:
            out.append(f'    <rdf:type rdf:resource="http://gov.genealogy.net/types.owl#group_{g}"/>')
        for lang, text in labels.items():
            out.append(f'    <rdfs:label xml:lang="{lang}">{text}</rdfs:label>')
        out.append(f'  </j.1:group_{grp}>')
    out.append('</rdf:RDF>')
    return '\n'.join(out) + '\n'


def n(value, lang='deu', **k):
    return dict(value=value, lang=lang, **k)


def t(v, **k):
    return dict(value=str(v), **k)


OBJECTS = [
    {'id': 'object_900001', 'name': [n('Durandien'), n('Durandie', 'fra')], 'type': [t(31)]},
    {'id': 'object_900010', 'name': [n('Mazaudie', 'fra'), n('Mazaudia', 'pol')], 'type': [t(56)]},
    {'id': 'object_900002', 'name': [n('Lacombien'), n('Lacombie', 'fra')], 'type': [t(45)], 'partOf': [{'ref': 'object_900001', 'endYear': 1945}]},
    {'id': 'object_900003', 'name': [n('Durandsberg')], 'type': [t(32)], 'partOf': [{'ref': 'object_900002', 'beginYear': 1816, 'endYear': 1945}]},
    {'id': 'object_900011', 'name': [n('Powiat durandzki', 'pol')], 'type': [t(32)], 'partOf': [{'ref': 'object_900010', 'beginYear': 1999}]},
    {'id': 'object_900005', 'name': [n('Durandsberg')], 'type': [t(27)]},
    {'id': 'object_900004', 'name': [n('Lacombsdorf')], 'type': [t(29)], 'partOf': [{'ref': 'object_900005'}]},
    {'id': 'object_900006', 'name': [n('Lacombsdorf')], 'type': [t(103)], 'partOf': [{'ref': 'object_900003', 'year': 1880}]},
    {'id': 'LACORFJO70AA', 'name': [n('Lacombsdorf', endYear=1945), n('Lakomice', 'pol', beginYear=1945)], 'type': [t(55)],
     'position': {'lat': 50.80, 'lon': 15.60, 'type': 'p'}, 'postalCode': [{'value': '58-999', 'year': 2014}],
     'partOf': [{'ref': 'object_900004', 'endYear': 1945}, {'ref': 'object_900003', 'endYear': 1945}, {'ref': 'object_900006', 'year': 1880},
                {'ref': 'object_900011', 'beginYear': 1999}]},
    # un homonyme loin de là (pour « Plusieurs lieux portent ce nom »)
    {'id': 'object_900020', 'name': [n('Lurandien')], 'type': [t(45)]},
    {'id': 'LACORFJN47BB', 'name': [n('Lacombsdorf')], 'type': [t(55)], 'position': {'lat': 47.50, 'lon': 12.00, 'type': 'p'}, 'partOf': [{'ref': 'object_900020'}]},
]


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'gov-fixture'
    src = os.path.join(out, 'json')
    os.makedirs(src, exist_ok=True)
    with open(os.path.join(src, 'types.owl'), 'w', encoding='utf-8') as f:
        f.write(types_owl())
    with open(os.path.join(src, 'objets.json'), 'w', encoding='utf-8') as f:
        json.dump(OBJECTS, f, ensure_ascii=False)
    here = os.path.dirname(os.path.abspath(__file__))
    subprocess.run([sys.executable, '-I', os.path.join(here, 'build-gov.py'), '--depuis-json', src, '--dossier', out, '--sans-verif-licence'], check=True)


if __name__ == '__main__':
    main()
