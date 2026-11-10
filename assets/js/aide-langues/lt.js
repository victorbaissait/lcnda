/* 📜 Aide à la lecture — Lituanien (registres catholiques de Lituanie ; avant 1918 surtout en polonais, en latin ou en russe).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    return {
        code: 'lt', name: 'Lituanien', native: 'Lietuvių', icon: '🇱🇹', script: 'latine', dir: 'ltr', ocr: ['lit'],
        intro: 'Les registres de Lituanie sont surtout en latin et en polonais (jusqu’en 1868 environ), puis en russe dans l’Empire russe (onglets Latin, Polonais, Russe). Le lituanien apparaît surtout après 1918, et en Prusse orientale (Petite Lituanie). Un même nom change de forme : Kazlauskas (le mari), Kazlauskienė (son épouse), Kazlauskaitė (sa fille non mariée) ; en polonais : Kozłowski.',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['gimęs, gimusi', 'né, née'], ['gimė', 'est né, est née'], ['gimimas', 'naissance'], ['krikštytas, pakrikštytas', 'baptisé'], ['krikštas', 'baptême'],
                ['krikštatėvis, kūmas', 'parrain'], ['krikštamotė, kūma', 'marraine'], ['krikštatėviai', 'parrain et marraine'], ['teisėtas', 'légitime'], ['neteisėtas', 'illégitime'],
                ['pribuvėja', 'sage-femme'], ['dvyniai', 'jumeaux'], ['vaikas', 'enfant'], ['berniukas', 'garçon'], ['mergaitė', 'fille (enfant)'],
            ]),
            ...R('mot', 'mariage', [
                ['santuoka', 'mariage'], ['susituokė, sutuokti', 'se sont mariés ; mariés'], ['jungtuvės', 'noces'], ['jaunikis', 'le marié'], ['nuotaka', 'la mariée'], ['liudininkas, liudininkai', 'témoin, témoins'],
                ['užsakai', 'les bans'], ['nevedęs', 'célibataire (homme)'], ['netekėjusi', 'célibataire (femme)'], ['našlys', 'veuf'], ['našlė', 'veuve'], ['vyras', 'mari (aussi : homme)'], ['žmona', 'épouse'],
            ]),
            ...R('mot', 'sepulture', [
                ['mirė', 'est mort, est morte'], ['miręs, mirusi', 'mort, morte'], ['mirtis', 'la mort'], ['palaidotas, palaidota', 'enterré, enterrée'], ['laidotuvės', 'enterrement'],
                ['kapinės', 'cimetière'], ['mirties priežastis', 'cause de la mort'], ['senatvė', 'vieillesse'], ['džiova', 'tuberculose'], ['raupai', 'variole'], ['amžius', 'âge'], ['velionis, velionė', 'le défunt, la défunte'],
            ]),
            ...R('mot', 'general', [
                ['metrikų knyga', 'registre (des naissances, mariages, décès)'], ['parapija', 'paroisse'], ['klebonas', 'curé'], ['kunigas', 'prêtre'], ['vikaras', 'vicaire'], ['bažnyčia', 'église'],
                ['kaimas', 'village'], ['miestas', 'ville'], ['valsčius', 'canton rural (volost)'], ['dvaras', 'domaine seigneurial, manoir'], ['ir', 'et'], ['iš', 'de'], ['m.', 'metais : en l’année'], ['d.', 'dieną : le jour'],
            ]),
            ...R('parente', 'general', [
                ['tėvas', 'père'], ['motina', 'mère'], ['tėvai', 'parents'], ['sūnus', 'fils'], ['duktė', 'fille'], ['brolis', 'frère'], ['sesuo', 'sœur'], ['senelis', 'grand-père'], ['senelė', 'grand-mère'],
                ['anūkas', 'petit-fils'], ['anūkė', 'petite-fille'], ['dėdė', 'oncle'], ['teta', 'tante'], ['sūnėnas', 'neveu'], ['dukterėčia', 'nièce'], ['pusbrolis', 'cousin'], ['pusseserė', 'cousine'],
                ['uošvis, uošvė', 'beau-père, belle-mère (parents de l’épouse)'], ['šešuras, anyta', 'beau-père, belle-mère (parents du mari)'], ['žentas', 'gendre'], ['marti', 'belle-fille'],
                ['našlaitis', 'orphelin'], ['globėjas', 'tuteur'],
                ['-ienė', 'épouse de : Kazlauskienė = Madame Kazlauskas'], ['-aitė, -ytė, -utė, -ūtė', 'fille (non mariée) de : Kazlauskaitė, Petraitytė'],
            ]),
            ...R('mois', 'general', [
                ['sausis, sausio', 'janvier (« sausio 12 d. » = le 12 janvier)'], ['vasaris, vasario', 'février'], ['kovas, kovo', 'mars'], ['balandis, balandžio', 'avril'], ['gegužė, gegužės', 'mai'],
                ['birželis, birželio', 'juin'], ['liepa, liepos', 'juillet'], ['rugpjūtis, rugpjūčio', 'août'], ['rugsėjis, rugsėjo', 'septembre'], ['spalis, spalio', 'octobre'],
                ['lapkritis, lapkričio', 'novembre'], ['gruodis, gruodžio', 'décembre'], ['mėnuo', 'mois'], ['savaitė', 'semaine'], ['diena', 'jour'], ['sekmadienis', 'dimanche'],
            ]),
            ...R('nombre', 'general', [
                ['vienas, viena', 'un, une'], ['du, dvi', 'deux'], ['trys', 'trois'], ['keturi', 'quatre'], ['penki', 'cinq'], ['šeši', 'six'], ['septyni', 'sept'], ['aštuoni', 'huit'], ['devyni', 'neuf'], ['dešimt', 'dix'],
                ['vienuolika', 'onze'], ['dvylika', 'douze'], ['dvidešimt', 'vingt'], ['trisdešimt', 'trente'], ['keturiasdešimt', 'quarante'], ['penkiasdešimt', 'cinquante'], ['šešiasdešimt', 'soixante'],
                ['septyniasdešimt', 'soixante-dix'], ['aštuoniasdešimt', 'quatre-vingts'], ['devyniasdešimt', 'quatre-vingt-dix'], ['šimtas', 'cent'], ['tūkstantis', 'mille'],
                ['metai, metų', 'an, ans', '« 70 metų » = 70 ans'], ['mėnesių, savaičių, dienų', 'mois, semaines, jours'],
            ]),
            ...R('metier', 'general', [
                ['ūkininkas', 'fermier, paysan propriétaire'], ['valstietis', 'paysan'], ['kumetis', 'ouvrier agricole d’un domaine (logé et payé en nature)'], ['bernas', 'valet de ferme'], ['tarnaitė, mergė', 'servante'],
                ['kalvis', 'forgeron'], ['malūnininkas', 'meunier'], ['siuvėjas', 'tailleur'], ['batsiuvys', 'cordonnier'], ['audėjas', 'tisserand'], ['dailidė', 'charpentier'], ['stalius', 'menuisier'],
                ['mūrininkas', 'maçon'], ['smuklininkas', 'aubergiste'], ['piemuo', 'berger, pâtre'], ['mokytojas', 'instituteur'], ['bajoras', 'noble'], ['eigulys', 'garde forestier'],
            ]),
            ...R('abrev', 'general', [
                ['m.', 'metais, metų : en l’année, ans'], ['d.', 'dieną : le jour'],
            ]),
            ...R('formule', 'bapteme', [
                ['gimė ir pakrikštytas', 'est né et a été baptisé'], ['teisėtas sūnus …', 'fils légitime de …'],
            ]),
            ...R('formule', 'general', [
                ['… m. … mėn. … d.', 'l’année …, le mois …, le jour … (« 1890 m. sausio 12 d. » = le 12 janvier 1890)'],
            ]),
            ...R('formule', 'sepulture', [
                ['… metų amžiaus', 'âgé de … ans'],
            ]),
        ],
        glyphs: {},
        widths: {},
        letters: [],
        exercises: [
            {id: 'lt_krikst1925', icon: '👶', title: 'Un baptême de 1925', level: 'moyen', acte: 'bapteme', year: 1925,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). « m. » = metais (en l’année), « d. » = dieną (le jour). Les noms sont au génitif (Petro = de Petras). Tu peux taper sans accents.',
                src: '1925 m.=m.|metais sausio 12 d.=d.|diena gimė ir pakrikštytas Jonas teisėtas sūnus ūkininko Petro Kazlausko ir Onos Jankauskaitės krikštatėviai Antanas Petrauskas ir Marijona Petrauskienė',
                notes: {'m.': 'm. = metais : en l’année', 'd.': 'd. = dieną : le jour', 'Jankauskaitės': '-aitė : nom de jeune fille', 'Petrauskienė': '-ienė : la femme de Petrauskas'}},
        ],
        numerals: null,
        sources: [
            {label: 'FamilySearch Research Wiki — Lithuanian Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Lithuanian_Genealogical_Word_List'},
            {label: 'FamilySearch Research Wiki — Lithuania Church Records', url: 'https://www.familysearch.org/en/wiki/Lithuania_Church_Records'},
            {label: 'Archives historiques de Lituanie — epaveldas.lt (registres numérisés)', url: 'https://www.epaveldas.lt/'},
        ],
    };
})());
