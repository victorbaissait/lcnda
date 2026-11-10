/* 📜 Aide à la lecture — Basque (Pays basque français et espagnol : noms de maisons, lieux-dits, inscriptions, quelques notes).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    return {
        code: 'eu', name: 'Basque', native: 'Euskara', icon: '🏔', script: 'latine', dir: 'ltr', ocr: ['eus'],
        intro: 'Les registres du Pays basque sont presque toujours en français, en espagnol ou en latin : le basque y est rare. On le rencontre surtout dans les noms de maisons (la maison donnait son nom à la famille), les lieux-dits, les surnoms, les stèles et inscriptions funéraires, et parfois une note du curé. Écriture ancienne à la française ou à l’espagnole : « Etcheverry » ou « Echeverría » = Etxeberri (maison neuve).',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['jaio, jaioa', 'né'], ['sortu', 'né (dans les dialectes du nord : « sortua »)'], ['bataiatu, bataiatua', 'baptisé'], ['bataioa, bataio', 'baptême'],
                ['aitabitxi, aitabitxia', 'parrain'], ['amabitxi, amabitxia', 'marraine'], ['haurra, umea', 'enfant'], ['mutila', 'garçon'], ['neska, neskatxa', 'fille, jeune fille'],
            ]),
            ...R('mot', 'mariage', [
                ['ezkondu, ezkondua', 'marié'], ['ezkontza', 'mariage'], ['senarra', 'mari'], ['emaztea', 'épouse'], ['alarguna', 'veuf, veuve'], ['ezkongabea', 'célibataire'],
            ]),
            ...R('mot', 'sepulture', [
                ['hil, hila', 'mort'], ['hil zen', 'il est mort, elle est morte'], ['heriotza', 'la mort'], ['ehortzi, lurperatu', 'enterré'], ['hilerria, kanposantua', 'cimetière'],
                ['hilarria', 'pierre tombale, stèle'], ['Hemen datza', 'Ici repose (début d’une inscription funéraire)'], ['Goian bego, G. B.', 'Qu’il (elle) repose au ciel : l’équivalent de R.I.P.'],
            ]),
            ...R('mot', 'general', [
                ['etxe, etxea', 'maison, la maison (la maison donne souvent son nom à la famille)'], ['etxeko jauna', 'le maître de maison'], ['etxeko andrea', 'la maîtresse de maison'],
                ['etxeko primua, etxeko premua', 'l’héritier de la maison (l’aîné qui la reçoit entière)'], ['herria', 'le village, le pays'], ['eliza', 'église'], ['apeza, apaiza', 'prêtre'], ['erretora', 'curé'],
                ['eta', 'et'], ['-ko, -ekoa', 'de (« Etxeberriko » = de la maison Etxeberri)'], ['urtea, urtean', 'l’année ; en l’année'],
            ]),
            ...R('mot', 'general', [
                ['-berri, -berria', 'neuf, nouvelle (Etxeberri = maison neuve)'], ['-zahar', 'vieux (Etxezahar = vieille maison)'], ['-garai, -goien', 'du haut'], ['-behere, -barren', 'du bas'],
                ['-aga, -eta', 'le lieu de, l’endroit où (finales de noms de lieux)'], ['-mendi', 'montagne'], ['-ibar', 'vallée'], ['-iturri', 'source'], ['-zabal', 'large, plateau'],
                ['-alde', 'côté, quartier'], ['-borda', 'bergerie, grange (maison secondaire)'],
            ]),
            ...R('parente', 'general', [
                ['aita', 'père'], ['ama', 'mère'], ['gurasoak', 'parents'], ['semea', 'fils'], ['alaba', 'fille'], ['anaia', 'frère (d’un homme)'], ['arreba', 'sœur (d’un homme)'],
                ['neba', 'frère (d’une femme)'], ['ahizpa', 'sœur (d’une femme)'], ['aitona, aitatxi', 'grand-père'], ['amona, amatxi', 'grand-mère'], ['biloba', 'petit-enfant'],
                ['osaba', 'oncle'], ['izeba', 'tante'], ['iloba', 'neveu, nièce'], ['lehengusua', 'cousin'], ['lehengusina', 'cousine'], ['aitaginarreba', 'beau-père (père du conjoint)'], ['amaginarreba', 'belle-mère'],
                ['suhia', 'gendre'], ['errainua', 'belle-fille'], ['umezurtza', 'orphelin'],
            ]),
            ...R('mois', 'general', [
                ['urtarrila', 'janvier'], ['otsaila', 'février'], ['martxoa, martxoaren', 'mars ; de mars (« martxoaren 3an » = le 3 mars)'], ['apirila', 'avril'], ['maiatza', 'mai'], ['ekaina', 'juin'],
                ['uztaila', 'juillet'], ['abuztua, agorrila', 'août (agorrila dans le nord)'], ['iraila', 'septembre'], ['urria', 'octobre'], ['azaroa', 'novembre'], ['abendua', 'décembre'],
                ['hilabetea', 'mois'], ['astea', 'semaine'], ['eguna', 'jour'], ['igandea', 'dimanche'],
            ]),
            ...R('nombre', 'general', [
                ['bat', 'un'], ['bi', 'deux'], ['hiru', 'trois'], ['lau', 'quatre'], ['bost, bortz', 'cinq'], ['sei', 'six'], ['zazpi', 'sept'], ['zortzi', 'huit'], ['bederatzi', 'neuf'], ['hamar', 'dix'],
                ['hamaika', 'onze'], ['hamabi', 'douze'], ['hogei', 'vingt'], ['hogeita hamar', 'trente (vingt et dix)'], ['berrogei', 'quarante (deux vingt)'], ['hirurogei', 'soixante (trois vingt)'],
                ['laurogei', 'quatre-vingts (quatre vingt)'], ['ehun', 'cent'], ['mila', 'mille'], ['urte', 'an, ans', '« 70 urte zituela » = à 70 ans'],
            ]),
            ...R('metier', 'general', [
                ['laboraria, nekazaria', 'cultivateur'], ['artzaina', 'berger'], ['errementaria, arotza', 'forgeron (arotz : aussi charpentier selon les vallées)'], ['zurgina', 'charpentier'],
                ['errotaria, eihazaina', 'meunier'], ['ehulea', 'tisserand'], ['arrantzalea', 'pêcheur'], ['itsasgizona, marinela', 'marin'], ['jostuna', 'tailleur, couturière'], ['zapataria', 'cordonnier'],
                ['ostalera', 'aubergiste'], ['mutila, neskatoa', 'valet, servante (dans une maison)'], ['maisu, maisua', 'instituteur, maître'],
            ]),
            ...R('formule', 'sepulture', [
                ['Hemen datza …', 'Ici repose …'], ['… hil zen … urtean', '… est mort en l’année …'], ['… urte zituela', 'à l’âge de … ans'], ['Goian bego', 'Qu’il (elle) repose au ciel'],
            ]),
            ...R('formule', 'general', [
                ['… etxeko jauna', 'le maître de la maison … (un homme est souvent désigné par sa maison)'],
            ]),
            ...R('abrev', 'general', [
                ['tx, tch, ch', 'le son « tch » : Etxeberri, Etcheverry, Echeverría sont le même nom'], ['G. B.', 'Goian bego : qu’il repose au ciel'],
            ]),
        ],
        glyphs: {},
        widths: {},
        letters: [],
        exercises: [
            {id: 'eu_hilarri1850', icon: '⚱️', title: 'Une stèle de 1850', level: 'facile', acte: 'sepulture', year: 1850,
                tip: 'Texte modèle écrit pour l’exercice (personne d’exemple), comme sur une stèle discoïdale. L’homme est désigné par sa maison ; « Goian bego » = qu’il repose au ciel.',
                src: 'Hemen datza Joanes Etxeberri Etxeberriko etxeko jauna hil zen 1850 urteko martxoaren 3an 70 urte zituela Goian bego',
                notes: {Etxeberriko: '-ko : de (la maison) Etxeberri', 'martxoaren': 'martxoa = mars ; « martxoaren 3an » = le 3 mars', 'zituela': '« 70 urte zituela » = à 70 ans'}},
        ],
        numerals: null,
        sources: [
            {label: 'Euskaltzaindia (Académie de la langue basque) — dictionnaire et nomenclature des noms de lieux et de personnes', url: 'https://www.euskaltzaindia.eus/'},
            {label: 'FamilySearch Research Wiki — Basque Genealogy', url: 'https://www.familysearch.org/en/wiki/Basque_Genealogy'},
            {label: 'Elhuyar — dictionnaire basque', url: 'https://hiztegiak.elhuyar.eus/'},
        ],
    };
})());
