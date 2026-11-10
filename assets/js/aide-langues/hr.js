/* 📜 Aide à la lecture — Croate (matične knjige de Croatie, de Slavonie, de Dalmatie et d'Istrie ; souvent en latin ou en italien).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    // đ garde son trait dans la recherche : on ajoute les formes « dj » et « d » (rođen → rodjen, roden)
    const plain = s => [s.replace(/đ/g, 'dj').replace(/Đ/g, 'Dj'), s.replace(/đ/g, 'd').replace(/Đ/g, 'D')];
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: [...(alt || []), ...(/[đĐ]/.test(t) ? plain(t) : [])]}));
    return {
        code: 'hr', name: 'Croate', native: 'Hrvatski', icon: '🇭🇷', script: 'latine', dir: 'ltr', ocr: ['hrv'],
        intro: 'Registres paroissiaux catholiques (matične knjige) de Croatie, de Slavonie, de Dalmatie et d’Istrie. Longtemps en latin (onglet Latin), en Dalmatie et en Istrie souvent en italien ; le croate se répand au XIXe siècle. Dans quelques paroisses de la côte, les plus anciens sont en écriture glagolitique (non traitée ici : demande l’aide des archives). Attention aux mois : les noms croates ne ressemblent pas aux nôtres, et « listopad » veut dire octobre (novembre en tchèque).',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['rođen, rođena', 'né, née'], ['rođenje', 'naissance'], ['kršten, krštena', 'baptisé, baptisée'], ['krštenje', 'baptême'],
                ['kum', 'parrain (et témoin du mariage)'], ['kuma', 'marraine'], ['zakonit, zakoniti', 'légitime'], ['nezakonit', 'illégitime, né hors mariage'],
                ['primalja, babica', 'sage-femme'], ['blizanci', 'jumeaux'], ['mrtvorođen', 'mort-né'], ['dijete', 'enfant'], ['sin', 'fils'], ['kći, kćer', 'fille'],
            ]),
            ...R('mot', 'mariage', [
                ['vjenčan, vjenčani', 'marié, mariés'], ['vjenčanje', 'mariage (la cérémonie)'], ['ženik', 'le marié'], ['nevjesta', 'la mariée (aussi : belle-fille)'],
                ['svjedok, svjedoci', 'témoin, témoins'], ['navještaji, oglasi', 'les bans'], ['neoženjen', 'célibataire (homme)'], ['neudana', 'célibataire (femme)'],
                ['udovac', 'veuf'], ['udovica', 'veuve'], ['muž, suprug', 'mari'], ['žena, supruga', 'épouse'], ['oprost', 'dispense'],
            ]),
            ...R('mot', 'sepulture', [
                ['umro, umrla', 'est mort, est morte'], ['smrt', 'la mort'], ['pokopan, pokopana', 'enterré, enterrée'], ['ukop, pokop', 'enterrement'], ['groblje', 'cimetière'],
                ['uzrok smrti', 'cause de la mort'], ['starost', 'vieillesse'], ['sušica', 'tuberculose (consomption)'], ['boginje', 'variole'], ['ospice', 'rougeole'], ['dob', 'âge'],
                ['pokojni, pok.', 'feu, défunt (« pok. Ivana » = de feu Ivan)'],
            ]),
            ...R('mot', 'general', [
                ['matična knjiga, matice', 'registre paroissial'], ['župa', 'paroisse'], ['župnik', 'curé'], ['kapelan', 'vicaire'], ['selo', 'village'], ['grad', 'ville'], ['općina', 'commune'],
                ['kućni broj', 'numéro de la maison'], ['zadruga', 'grande famille vivant et travaillant ensemble sous un chef'], ['i', 'et'], ['u', 'à, dans'], ['iz', 'de'], ['dana', 'le (devant une date)'], ['godine, god.', 'de l’année'],
            ]),
            ...R('parente', 'general', [
                ['otac', 'père'], ['majka, mati', 'mère'], ['roditelji', 'parents'], ['brat', 'frère'], ['sestra', 'sœur'], ['djed', 'grand-père'], ['baka', 'grand-mère'],
                ['unuk', 'petit-fils'], ['unuka', 'petite-fille'], ['stric', 'oncle paternel (frère du père)'], ['ujak', 'oncle maternel (frère de la mère)'], ['tetak', 'oncle par alliance (mari de la tante)'],
                ['teta, tetka', 'tante'], ['nećak', 'neveu'], ['nećakinja', 'nièce'], ['bratić', 'cousin'], ['sestrična', 'cousine'],
                ['svekar, svekrva', 'beau-père, belle-mère (parents du mari)'], ['tast, punica', 'beau-père, belle-mère (parents de l’épouse)'], ['zet', 'gendre'], ['snaha', 'belle-fille'],
                ['šurjak', 'beau-frère (frère de l’épouse)'], ['djever', 'beau-frère (frère du mari)'], ['očuh', 'beau-père (second mari de la mère)'], ['maćeha', 'belle-mère (seconde femme du père)'],
                ['siroče, sirota', 'orphelin'], ['skrbnik', 'tuteur'],
            ]),
            ...R('mois', 'general', [
                ['siječanj, siječnja', 'janvier'], ['veljača, veljače', 'février'], ['ožujak, ožujka', 'mars'], ['travanj, travnja', 'avril'], ['svibanj, svibnja', 'mai'], ['lipanj, lipnja', 'juin'],
                ['srpanj, srpnja', 'juillet'], ['kolovoz, kolovoza', 'août'], ['rujan, rujna', 'septembre'], ['listopad, listopada', 'octobre (attention : en tchèque, listopad = novembre)'],
                ['studeni, studenoga', 'novembre'], ['prosinac, prosinca', 'décembre'], ['mjesec', 'mois'], ['tjedan', 'semaine'], ['dan', 'jour'], ['nedjelja', 'dimanche'],
            ]),
            ...R('nombre', 'general', [
                ['jedan, jedna', 'un, une'], ['dva, dvije', 'deux'], ['tri', 'trois'], ['četiri', 'quatre'], ['pet', 'cinq'], ['šest', 'six'], ['sedam', 'sept'], ['osam', 'huit'], ['devet', 'neuf'], ['deset', 'dix'],
                ['jedanaest', 'onze'], ['dvanaest', 'douze'], ['dvadeset', 'vingt'], ['trideset', 'trente'], ['četrdeset', 'quarante'], ['pedeset', 'cinquante'], ['šezdeset', 'soixante'],
                ['sedamdeset', 'soixante-dix'], ['osamdeset', 'quatre-vingts'], ['devedeset', 'quatre-vingt-dix'], ['sto', 'cent'], ['tisuća', 'mille'],
                ['godina, godine', 'an, ans', '« 70 godina » = 70 ans'], ['mjeseci, tjedana, dana', 'mois, semaines, jours'],
            ]),
            ...R('metier', 'general', [
                ['seljak', 'paysan'], ['težak', 'cultivateur, ouvrier agricole (Dalmatie)'], ['kmet', 'paysan tenancier, serf (avant 1848)'], ['ratar', 'laboureur'], ['nadničar', 'journalier'],
                ['sluga', 'valet'], ['sluškinja', 'servante'], ['kovač', 'forgeron'], ['mlinar', 'meunier'], ['krojač', 'tailleur'], ['postolar, čizmar', 'cordonnier'], ['tkalac', 'tisserand'],
                ['tesar', 'charpentier'], ['stolar', 'menuisier'], ['zidar', 'maçon'], ['mesar', 'boucher'], ['pekar', 'boulanger'], ['krčmar', 'aubergiste'], ['pastir', 'berger'],
                ['ribar', 'pêcheur'], ['mornar', 'marin'], ['učitelj', 'instituteur'], ['svećenik', 'prêtre'], ['trgovac', 'marchand'], ['vinogradar', 'vigneron'],
            ]),
            ...R('abrev', 'general', [
                ['pok.', 'pokojni : feu, défunt'], ['god.', 'godine : de l’année'], ['rođ.', 'rođena : née (nom de jeune fille)'],
            ]),
            ...R('formule', 'bapteme', [
                ['rođen je i kršten', 'est né et a été baptisé'], ['zakoniti sin …', 'fils légitime de …'],
            ]),
            ...R('formule', 'mariage', [
                ['vjenčani su', 'ont été mariés'],
            ]),
            ...R('formule', 'sepulture', [
                ['umro je u dobi od … godina', 'est mort à l’âge de … ans'],
            ]),
        ],
        glyphs: {
            hr_dj: ['M26 30 C22 25 13 27 13 37 C13 46 24 46 26 38', 'M26 8 L26 46', 'M20 15 L32 15'],
        },
        widths: {},
        letters: [
            {id: 'hr_dj', name: 'đ (d barré)', seen: ['hr_dj'], read: 'đ (dj)', cmp: ['d'], note: 'Le trait est souvent oublié ; on écrivait aussi « dj » ou « gj ». La recherche accepte « dj » et « d » : tape « rodjen » pour « rođen ».', keys: 'd barre dj gj'},
        ],
        exercises: [
            {id: 'hr_krst1862', icon: '👶', title: 'Un baptême de 1862', level: 'facile', acte: 'bapteme', year: 1862,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). « svibnja » = de mai ; « rođene » = née. Tu peux taper sans accents (đ = dj).',
                src: 'Dana 10. svibnja 1862. rođen=rođen|rodjen je i kršten Ivan zakoniti sin Josipa Horvata težaka i Mare rođene=rođene|rodjene Babić kum Petar Kovačević',
                notes: {svibnja: 'svibanj = mai (génitif : svibnja)', 'težaka': 'težak = cultivateur', 'rođene': 'rođene = née'}},
        ],
        numerals: null,
        sources: [
            {label: 'FamilySearch Research Wiki — Croatian Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Croatian_Genealogical_Word_List'},
            {label: 'FamilySearch Research Wiki — Croatia Church Records', url: 'https://www.familysearch.org/en/wiki/Croatia_Church_Records'},
        ],
    };
})());
