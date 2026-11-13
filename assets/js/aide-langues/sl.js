/* 📜 Aide à la lecture — Slovène (matične knjige de Carniole, de Styrie, de Carinthie et du Littoral autrichiens).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    return {
        code: 'sl', name: 'Slovène', native: 'Slovenščina', icon: '🇸🇮', script: 'latine', dir: 'ltr', ocr: ['slv'],
        intro: 'Registres paroissiaux catholiques des pays slovènes de l’Autriche (Carniole, Basse-Styrie, Carinthie, Littoral). Ils sont longtemps en latin et en allemand (onglets Latin et Allemand, écriture Kurrent) ; le slovène s’y répand dans la seconde moitié du XIXe siècle, avec parfois les anciens noms slovènes des mois. Les maisons sont numérotées.',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['rojen, rojena', 'né, née'], ['rojstvo', 'naissance'], ['krščen, krščena', 'baptisé, baptisée'], ['krst', 'baptême'], ['boter', 'parrain'], ['botra', 'marraine'],
                ['zakonski', 'légitime'], ['nezakonski', 'illégitime, né hors mariage'], ['babica', 'sage-femme (aussi : grand-mère)'], ['dvojčka', 'jumeaux'], ['mrtvorojen', 'mort-né'],
                ['otrok', 'enfant'], ['deček', 'garçon'], ['deklica', 'fille (enfant)'],
            ]),
            ...R('mot', 'mariage', [
                ['poročen, poročena, poročila', 'marié, mariée ; se sont mariés'], ['poroka', 'mariage'], ['ženin', 'le marié'], ['nevesta', 'la mariée'], ['priča, priči', 'témoin, témoins'],
                ['oklici', 'les bans'], ['samski', 'célibataire'], ['vdovec', 'veuf'], ['vdova', 'veuve'], ['mož', 'mari'], ['žena', 'épouse'],
            ]),
            ...R('mot', 'sepulture', [
                ['umrl, umrla', 'est mort, est morte'], ['smrt', 'la mort'], ['pokopan, pokopana', 'enterré, enterrée'], ['pogreb', 'enterrement'], ['pokopališče', 'cimetière'],
                ['vzrok smrti', 'cause de la mort'], ['starost', 'vieillesse ; âge'], ['jetika', 'tuberculose'], ['koze', 'variole'], ['rajni, rajna', 'feu, défunt'],
            ]),
            ...R('mot', 'general', [
                ['matična knjiga, matice', 'registre paroissial'], ['župnija, fara', 'paroisse'], ['župnik', 'curé'], ['kaplan', 'vicaire'], ['vas', 'village'], ['mesto', 'ville'], ['občina', 'commune'],
                ['hišna številka, h. št.', 'numéro de la maison'], ['in', 'et'], ['v', 'à, dans'], ['iz', 'de'], ['dne', 'le (devant une date)'], ['leta', 'de l’année'],
            ]),
            ...R('parente', 'general', [
                ['oče', 'père'], ['mati', 'mère'], ['starši', 'parents'], ['sin', 'fils'], ['hči', 'fille'], ['brat', 'frère'], ['sestra', 'sœur'],
                ['ded, stari oče', 'grand-père'], ['stara mati, babica', 'grand-mère'], ['vnuk', 'petit-fils'], ['vnukinja', 'petite-fille'], ['stric', 'oncle'], ['teta', 'tante'],
                ['nečak', 'neveu'], ['nečakinja', 'nièce'], ['bratranec', 'cousin'], ['sestrična', 'cousine'], ['tast', 'beau-père (père de l’épouse)'], ['tašča', 'belle-mère (mère de l’épouse)'],
                ['zet', 'gendre'], ['snaha', 'belle-fille'], ['svak', 'beau-frère'], ['svakinja', 'belle-sœur'], ['sirota', 'orphelin'], ['varuh', 'tuteur'],
            ]),
            ...R('mois', 'general', [
                ['januar', 'janvier'], ['februar', 'février'], ['marec', 'mars'], ['april', 'avril'], ['maj', 'mai'], ['junij', 'juin'], ['julij', 'juillet'], ['avgust', 'août'],
                ['september', 'septembre'], ['oktober', 'octobre'], ['november', 'novembre'], ['december', 'décembre'],
                ['prosinec', 'janvier (ancien nom slovène ; en croate, prosinac = décembre !)'], ['svečan', 'février (ancien nom)'], ['sušec', 'mars (ancien nom)'], ['mali traven', 'avril (ancien nom)'],
                ['veliki traven', 'mai (ancien nom)'], ['rožnik', 'juin (ancien nom)'], ['mali srpan', 'juillet (ancien nom)'], ['veliki srpan', 'août (ancien nom)'],
                ['kimavec', 'septembre (ancien nom)'], ['vinotok', 'octobre (ancien nom)'], ['listopad', 'novembre (ancien nom ; en croate, listopad = octobre !)'], ['gruden', 'décembre (ancien nom)'],
                ['mesec', 'mois'], ['teden', 'semaine'], ['dan', 'jour'], ['nedelja', 'dimanche'],
            ]),
            ...R('nombre', 'general', [
                ['en, ena', 'un, une'], ['dva, dve', 'deux'], ['tri', 'trois'], ['štiri', 'quatre'], ['pet', 'cinq'], ['šest', 'six'], ['sedem', 'sept'], ['osem', 'huit'], ['devet', 'neuf'], ['deset', 'dix'],
                ['enajst', 'onze'], ['dvanajst', 'douze'], ['dvajset', 'vingt'], ['trideset', 'trente'], ['štirideset', 'quarante'], ['petdeset', 'cinquante'], ['šestdeset', 'soixante'],
                ['sedemdeset', 'soixante-dix'], ['osemdeset', 'quatre-vingts'], ['devetdeset', 'quatre-vingt-dix'], ['sto', 'cent'], ['tisoč', 'mille'],
                ['let', 'ans', '« 68 let » = 68 ans'], ['mesecev, tednov, dni', 'mois, semaines, jours'],
            ]),
            ...R('metier', 'general', [
                ['kmet', 'paysan, fermier'], ['kajžar', 'petit paysan (une maisonnette et peu de terre)'], ['gostač', 'logé chez un autre, sans maison à soi'], ['hlapec', 'valet de ferme'],
                ['dekla', 'servante'], ['dninar', 'journalier'], ['kovač', 'forgeron'], ['mlinar', 'meunier'], ['krojač', 'tailleur'], ['čevljar', 'cordonnier'], ['tkalec', 'tisserand'],
                ['tesar', 'charpentier'], ['mizar', 'menuisier'], ['zidar', 'maçon'], ['mesar', 'boucher'], ['pek', 'boulanger'], ['gostilničar, krčmar', 'aubergiste'], ['pastir', 'berger'],
                ['viničar', 'vigneron (qui travaille la vigne d’un autre)'], ['učitelj', 'instituteur'], ['duhovnik', 'prêtre'], ['trgovec', 'marchand'],
            ]),
            ...R('abrev', 'general', [
                ['ſh, sh, zh, z, s (avant 1850)', 'ancienne orthographe (bohoričica) : ſh = š, sh = ž, zh = č, z = c, s = z (« zhevljar » = čevljar)'],
                ['h. št.', 'hišna številka : numéro de la maison'], ['roj.', 'rojena : née (nom de jeune fille)'],
            ]),
            ...R('formule', 'bapteme', [
                ['je bil rojen in krščen', 'est né et a été baptisé'], ['zakonski sin …', 'fils légitime de …'],
            ]),
            ...R('formule', 'sepulture', [
                ['star … let', 'âgé de … ans'],
            ]),
        ],
        glyphs: {},
        widths: {},
        letters: [
            {id: 'sl_bohoric', name: 'ſh = š, zh = č (bohoričica, avant 1850 environ)', seen: ['slong', 'h'], read: 'š', cmp: [], note: 'Ancienne orthographe slovène (bohoričica) : ſh = š, sh = ž, zh = č, z = c, s = z, ſ = s. « zhevljar » = čevljar (cordonnier), « Lublana » = Ljubljana.', keys: 'bohoric ancienne orthographe sh zh s long'},
        ],
        exercises: [
            {id: 'sl_krst1855', icon: '👶', title: 'Un baptême de 1855', level: 'moyen', acte: 'bapteme', year: 1855,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). « svečana » = de février (ancien nom slovène) ; « št. » = numéro de maison.',
                src: 'Dne 2. svečana=svečana|februarja 1855 je bil rojen in krščen Janez zakonski sin Jožefa Novaka kmeta v Dolenji vasi št.=številka|št. 7 in Marije rojene Kos boter Anton Zupan',
                notes: {'svečana': 'svečan = février (ancien nom slovène)', 'št.': 'št. = številka : numéro (de la maison)', kmeta: 'kmet = paysan'}},
        ],
        numerals: null,
        sources: [
            {label: 'FamilySearch Research Wiki — Slovenian Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Slovenian_Genealogical_Word_List'},
            {label: 'FamilySearch Research Wiki — Slovenia Church Records', url: 'https://www.familysearch.org/en/wiki/Slovenia_Church_Records'},
        ],
    };
})());
