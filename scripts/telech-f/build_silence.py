#!/usr/bin/env python3
"""🔔 Lot F — Le silence d'autrefois : ce qu'on entendait au village (assets/data/tf-silence.json.gz).

Pas un mot inventé : chaque phrase est recopiée de l'article de Wikipédia cité (CC BY-SA 4.0, les contributeurs de Wikipédia) ; le
script relit l'article (action=raw → texte sans balises) et REFUSE d'écrire si une phrase n'y est plus.
Le bruit d'aujourd'hui (cartes de bruit stratégiques, plans d'exposition au bruit des aérodromes) : seulement des LIENS dans l'app —
les cartes sont publiées département par département (data.gouv.fr, Licence Ouverte 2.0) et le service national de la Géoplateforme
(DGAC, PEB) n'affiche pas de licence dans sa fiche (lue le 2026-11-26) : rien n'est copié.
Lancer : python3 -I scripts/telech-f/build_silence.py [dossier de sortie]
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wm

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'data')
# [sujet, icône, article, phrase exacte, quand (années où ça vaut), « besoin » (ce qui doit exister près du lieu : '' = partout)]
QUOTES = [
    ['angelus', '🔔', 'Angélus', 'Elle est sonnée trois fois par jour par les cloches (sauf pendant le triduum pascal), à six heures du matin, midi et six heures du soir.', [1500, 1960], ''],
    ['angelus', '🔔', 'Angélus', 'Dans une société sans horloge individuelle, cette annonce rythme la vie au travail, tandis que réciter l\'Angélus consacre à Dieu la journée.', [1500, 1960], ''],
    ['horloge', '🕰', 'Cloche', 'Alors que l\'usage des cloches était laissé à la discrétion des desservants religieux et de leur tradition locale (d\'où la souplesse des règlements de sonneries établis par les évêques), le XIXe siècle voit l\'acquisition massive par les villages d\'horloges mécaniques installées dans les clochers ou plus rarement dans les beffrois communaux.', [1800, 1914], ''],
    ['paysage', '🔔', 'Cloche', 'Le paysage sonore est encore à cette époque marqué par des sonneries religieuses issues d\'églises ou de monastères (la journée horaire étant rythmée par l\'angélus sonné matin, midi et soir), et des sonneries civiles actionnées par les horloges publiques qui annoncent le début de la journée, le midi, le début et la fin des travaux et le couvre-feu.', [1800, 1914], ''],
    ['tocsin', '🚨', 'Tocsin', 'Le tocsin est une sonnerie de cloche civile pour alerter la population d\'un danger imminent tel qu\'un incendie, une invasion, une catastrophe naturelle, un naufrage, mais aussi pour rassembler la population en urgence.', [1500, 1970], ''],
    ['tocsin', '🚨', 'Tocsin', 'Son utilisation a perduré dans les zones rurales jusqu’au milieu du XXe siècle, certains villages l’utilisant encore dans les années 1960, voire plus tard (jusqu’au début des années 1970 à Hessenheim dans le Bas-Rhin).', [1900, 1975], ''],
    ['tocsin14', '🚨', 'Tocsin', 'Le 1 août 1914, le tocsin a retenti à travers la France pour annoncer à la population l’ordre de mobilisation générale.', [1914, 1914], ''],
]


def main():
    texts, rows = {}, []
    for k, icon, title, q, when, need in QUOTES:
        if title not in texts:
            texts[title] = ' '.join(wm.plain(wm.wp_raw(title)).split())
        if ' '.join(q.split()) not in texts[title]:
            raise SystemExit(f'phrase introuvable dans « {title} » : {q[:80]}…')
        rows.append([k, icon, title, wm.wp_url(title), q, when[0], when[1], need])
    meta = {'source': 'Wikipédia (articles Angélus, Cloche, Tocsin)', 'licence': 'CC BY-SA 4.0 (les contributeurs de Wikipédia)', 'licence_url': 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
            'url': wm.wp_url('Cloche'), 'built': wm.today(), 'what': 'Ce qu’on entendait au village : des phrases de Wikipédia, recopiées telles quelles et relues à chaque fabrication',
            'noise': {'map': 'https://www.geoportail.gouv.fr/carte?c={lon},{lat}&z=14&permalink=yes',
                      'cbs': 'https://www.data.gouv.fr/datasets/?q={q}', 'about': 'https://www.data.gouv.fr/datasets/?q=carte%20de%20bruit%20strat%C3%A9gique'},
            'fields': ['k', 'icon', 'title', 'url', 'q', 'from', 'to', 'need'], 'rows': rows}
    size = wm.write_gz(OUT, 'tf-silence.json.gz', meta)
    print(f'tf-silence : {len(rows)} phrases vérifiées, {size} octets')


if __name__ == '__main__':
    main()
