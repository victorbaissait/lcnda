/* 📜 Aide à la lecture — Occitan (langue d'oc : Gascogne, Languedoc, Provence, Limousin, Auvergne, vallées alpines).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    return {
        code: 'oc', name: 'Occitan', native: 'Occitan, lenga d’òc', icon: '🌞', script: 'latine', dir: 'ltr', ocr: ['oci'],
        intro: 'Rare dans les registres paroissiaux, qui sont en latin puis en français (après 1539). On rencontre l’occitan dans les actes de notaires et les registres consulaires du Moyen Âge (jusqu’au XVIe siècle), puis dans les surnoms, les noms de lieux-dits et de maisons, quelques notes de curé et les mots régionaux glissés dans les actes en français (brassier, bordier, mas…). Orthographe ancienne : « Johan », « Peyre », « filh », « molher ».',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['nascut, nascuda', 'né, née'], ['batejat, batejada', 'baptisé, baptisée'], ['batisme, baptisme', 'baptême'], ['pairin', 'parrain'], ['mairina', 'marraine'],
                ['enfant, nenon', 'enfant, petit enfant'], ['dròlle, dròlla', 'garçon, fille (Rouergue, Limousin, Gascogne)'],
            ]),
            ...R('mot', 'mariage', [
                ['maridatge', 'mariage'], ['maridat, maridada', 'marié, mariée'], ['nòvi, nòvia', 'le marié, la mariée'], ['molher, molhèr', 'épouse, femme'], ['òme', 'homme, mari'],
                ['veuse, veusa', 'veuf, veuve'], ['dòt, verquièra', 'dot (verquièra : la dot de la mariée, en Languedoc)'],
            ]),
            ...R('mot', 'sepulture', [
                ['mòrt, mòrta', 'mort, morte'], ['defunt, defunta', 'défunt'], ['sebelit, enterrat', 'enterré'], ['cementèri, cemetèri', 'cimetière'], ['testament', 'testament'],
            ]),
            ...R('mot', 'general', [
                ['mas', 'ferme, domaine agricole (Languedoc, Provence) ; devient souvent un nom de lieu-dit'], ['bòria, bòrda, bordaria', 'ferme, métairie'], ['casal, cazal', 'maison avec son jardin, emplacement d’une maison'],
                ['ostal, ostau', 'maison, la maison familiale (et la famille qui y vit)'], ['puèg, puèch, puy', 'colline, sommet'], ['comba', 'vallon'], ['font', 'source, fontaine'],
                ['prat', 'pré'], ['sèrre, serre', 'crête, colline allongée'], ['ribièra', 'rivière, vallée'], ['bòsc', 'bois'], ['castèl', 'château'], ['glèisa', 'église'],
                ['capelan', 'prêtre, curé'], ['parròquia', 'paroisse'], ['notari', 'notaire'], ['testimòni, testimònis', 'témoin, témoins'], ['vilatge', 'village'], ['vila', 'ville'], ['cònsol', 'consul (magistrat de la ville ou du village sous l’Ancien Régime)'], ['e, et', 'et'], ['de, del, dels', 'de, du, des'], ['dich, dit', 'dit (surnom)'],
            ]),
            ...R('mot', 'general', [
                ['lo Ros, la Rossa', 'surnom : le roux, la rousse'], ['lo Pichon, Pichòt', 'surnom : le petit'], ['lo Gròs', 'surnom : le gros'], ['lo Nègre', 'surnom : le noir (de cheveux, de peau)'],
                ['lo Blanc', 'surnom : le blanc'], ['lo Long', 'surnom : le grand'], ['lo Vièlh', 'surnom : le vieux, l’aîné'], ['lo Jove', 'surnom : le jeune, le cadet'],
            ]),
            ...R('parente', 'general', [
                ['paire', 'père'], ['maire', 'mère'], ['filh', 'fils'], ['filha', 'fille'], ['fraire', 'frère'], ['sòrre, sòr', 'sœur'], ['grand, grand paire', 'grand-père'],
                ['grand, grand maire', 'grand-mère'], ['oncle', 'oncle'], ['tanta, tatà', 'tante'], ['nebot', 'neveu'], ['neboda', 'nièce'], ['cosin, cosina', 'cousin, cousine'],
                ['gendre', 'gendre'], ['nòra', 'belle-fille (épouse du fils)'], ['sògre, sògra', 'beau-père, belle-mère'], ['cunhat, cunhada', 'beau-frère, belle-sœur'], ['pairastre, mairastra', 'beau-père, belle-mère (second mari, seconde femme)'],
                ['eiretièr, eretier', 'héritier'],
            ]),
            ...R('mois', 'general', [
                ['genièr', 'janvier'], ['febrièr', 'février'], ['març', 'mars'], ['abril', 'avril'], ['mai', 'mai'], ['junh', 'juin'], ['julhet', 'juillet'], ['agost', 'août'],
                ['setembre', 'septembre'], ['octòbre', 'octobre'], ['novembre', 'novembre'], ['decembre', 'décembre'], ['mes', 'mois'], ['jorn', 'jour'], ['dimenge', 'dimanche'], ['an', 'an, année'],
            ]),
            ...R('nombre', 'general', [
                ['un, una', 'un, une'], ['dos, doas', 'deux'], ['tres', 'trois'], ['quatre', 'quatre'], ['cinc', 'cinq'], ['sièis', 'six'], ['sèt', 'sept'], ['uèch', 'huit'], ['nòu', 'neuf'], ['dètz', 'dix'],
                ['vint', 'vingt'], ['trenta', 'trente'], ['quaranta', 'quarante'], ['cinquanta', 'cinquante'], ['seissanta', 'soixante'], ['cent', 'cent'], ['mila', 'mille'],
                ['ans', 'ans', '« de setanta ans »'],
            ]),
            ...R('metier', 'general', [
                ['brassièr, brassier', 'journalier (qui n’a que ses bras) : courant dans les actes en français du Sud-Ouest'], ['bordièr, bordier', 'métayer'], ['pagès', 'paysan'],
                ['pastre', 'berger'], ['boièr, bouvier', 'bouvier, laboureur avec des bœufs'], ['fabre, faure', 'forgeron (d’où les noms Fabre, Faure)'], ['molinièr', 'meunier'],
                ['teissièr, teisseire', 'tisserand (d’où Teissier, Teisseire)'], ['sabatièr', 'cordonnier (d’où Sabatier)'], ['fustièr', 'charpentier (d’où Fustier)'], ['sartre, sartor', 'tailleur (d’où Sartre)'],
                ['ostalièr', 'aubergiste'], ['mèstre', 'maître (artisan)'], ['vaquièr', 'vacher (d’où Vaquier)'],
            ]),
            ...R('formule', 'general', [
                ['En nom de Dieu, amen', 'Au nom de Dieu, amen (début d’un acte de notaire ou d’un testament)'],
                ['Conoguda causa sia a totz', 'Chose connue soit à tous (début d’un acte médiéval)'],
                ['presens e endevenidors', 'présents et à venir'],
            ]),
            ...R('formule', 'general', [
                ['… dich lo …', '… dit le … (le surnom qui suit le nom)'],
            ]),
        ],
        glyphs: {},
        widths: {},
        letters: [],
        exercises: [
            {id: 'oc_carta1450', icon: '🖋', title: 'Un début d’acte de notaire (XVe siècle)', level: 'moyen', acte: 'notaire', year: 1450,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple), dans la langue des notaires du Moyen Âge. « dich lo Ros » = dit le Roux (surnom).',
                src: 'En nom de Dieu amen Conoguda causa sia a totz que Johan Fabre dich lo Ros pastre del mas de la Comba a vendut a Peyre Teyssier un prat',
                notes: {Conoguda: '« Conoguda causa sia » = chose connue soit', 'Ros': 'lo Ros = le roux (surnom)', pastre: 'pastre = berger', prat: 'prat = pré'}},
        ],
        numerals: null,
        sources: [
            {label: 'Congrès permanent de la lenga occitana — dictionnaires (Dicod’Òc)', url: 'https://www.locongres.org/'},
            {label: 'Lexique roman de Raynouard (vocabulaire de l’ancien occitan)', url: 'https://gallica.bnf.fr/'},
            {label: 'FamilySearch Research Wiki — France Languages', url: 'https://www.familysearch.org/en/wiki/France_Languages'},
        ],
    };
})());
