/* 📜 Aide à la lecture — Breton (Basse-Bretagne : noms de lieux, surnoms, inscriptions, quelques notes de recteur).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    // c’h (une seule lettre en breton) : on cherche aussi « ch » et « c'h » tapé au clavier
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: [...(alt || []), ...(/c’h/i.test(t) ? [t.replace(/c’h/gi, 'ch')] : [])]}));
    return {
        code: 'br', name: 'Breton', native: 'Brezhoneg', icon: '⚫', script: 'latine', dir: 'ltr', ocr: ['bre'],
        intro: 'Rare dans les actes : les registres de Basse-Bretagne sont en latin puis en français. Le breton se lit surtout dans les noms de lieux et de villages (Ker-, Plou-, Lan-, Loc-, Tre-), les surnoms, les inscriptions des tombes et des calvaires, quelques notes de recteur et les cantiques. Les mots changent de première lettre selon ce qui les précède (mutations : « tad » → « e dad », « bloaz » → « daou vloaz ») : cherche aussi la forme de base.',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['ganet, ganet eo', 'né ; il (elle) est né(e)'], ['badezet', 'baptisé'], ['badeziant', 'baptême'], ['paeron', 'parrain'], ['maeronez', 'marraine'],
                ['bugel, bugale', 'enfant, enfants'], ['paotr', 'garçon'], ['plac’h', 'fille, jeune fille'],
            ]),
            ...R('mot', 'mariage', [
                ['dimezet', 'marié'], ['dimeziñ', 'se marier'], ['eured', 'noces'], ['pried', 'époux, épouse'], ['gwreg', 'épouse, femme'], ['gwaz', 'homme, mari'],
                ['intañv', 'veuf'], ['intañvez', 'veuve'], ['dimezell', 'demoiselle'],
            ]),
            ...R('mot', 'sepulture', [
                ['marvet', 'mort, décédé'], ['maro', 'mort (la mort, ou mort)'], ['interet', 'enterré'], ['bez', 'tombe'], ['bered', 'cimetière'],
                ['Amañ e c’hourvez', 'Ici repose (début d’une inscription funéraire)'], ['Doue d’e bardono', 'Que Dieu lui pardonne (sur les tombes)'], ['Pedit evit e ene', 'Priez pour son âme'],
            ]),
            ...R('mot', 'general', [
                ['ker, kêr', 'village, hameau, lieu habité (Kerbiriou, Kermadec…) ; « kêr » = aussi la ville'], ['plou, plo, pleu, plu', 'paroisse (Plougastel, Pleumeur, Plumelec…)'],
                ['lann, lan', 'lieu consacré, ermitage (Landévennec, Lannion…)'], ['loc, lok', 'lieu saint, prieuré (Locronan, Locmaria…)'], ['tre, treo, tref', 'trève : partie d’une paroisse avec sa chapelle (Trégastel…)'],
                ['ti, ty', 'maison (Ty Nevez = maison neuve)'], ['koad, coat, goat', 'bois (Coatmeur, Penhoat)'], ['penn, pen', 'tête, bout (Penmarc’h, Penhoat)'], ['traon, traou', 'vallée, le bas'],
                ['menez', 'montagne'], ['poull', 'mare, trou d’eau'], ['feunteun', 'fontaine'], ['milin, vilin', 'moulin'], ['iliz', 'église'], ['chapel', 'chapelle'], ['parrez', 'paroisse'],
                ['person', 'recteur (le curé de la paroisse)'], ['kure', 'vicaire'], ['ha, hag', 'et'], ['ar, an, al', 'le, la, les'], ['a', 'de'], ['nevez', 'neuf, nouveau'], ['kozh, coz, goz', 'vieux'],
            ]),
            ...R('mot', 'general', [
                ['Bras, Braz', 'surnom : grand'], ['Bihan', 'surnom : petit'], ['Ruz, Rus', 'surnom : rouge, roux'], ['Du', 'surnom : noir'], ['Gwenn, Guen', 'surnom : blanc, blond'],
                ['Kozh, Coz', 'surnom : le vieux, l’aîné'], ['Yaouank', 'surnom : jeune'], ['Moal', 'surnom : chauve'], ['Floc’h', 'surnom : écuyer, page'], ['Gall', 'surnom : le Français (l’étranger, celui du pays gallo)'],
            ]),
            ...R('parente', 'general', [
                ['tad', 'père'], ['mamm', 'mère'], ['tud', 'parents, gens'], ['mab', 'fils'], ['merc’h', 'fille'], ['breur', 'frère'], ['c’hoar', 'sœur'],
                ['tad-kozh', 'grand-père'], ['mamm-gozh', 'grand-mère'], ['eontr', 'oncle'], ['moereb', 'tante'], ['niz', 'neveu'], ['nizez', 'nièce'], ['kenderv', 'cousin'], ['kiniterv', 'cousine'],
                ['tad-kaer', 'beau-père'], ['mamm-gaer', 'belle-mère'], ['mab-kaer', 'gendre'], ['merc’h-kaer', 'belle-fille'], ['emzivad', 'orphelin'],
            ]),
            ...R('mois', 'general', [
                ['Genver', 'janvier'], ['C’hwevrer', 'février'], ['Meurzh, Meurz', 'mars'], ['Ebrel', 'avril'], ['Mae, Mai', 'mai'], ['Mezheven', 'juin'], ['Gouere, Gouhere', 'juillet'],
                ['Eost', 'août (aussi : la moisson)'], ['Gwengolo', 'septembre'], ['Here', 'octobre'], ['Du', 'novembre (« le mois noir »)'], ['Kerzu', 'décembre'],
                ['miz', 'mois (« miz Mae » = le mois de mai ; « a viz Mae » = de mai)'], ['deiz', 'jour'], ['Sul', 'dimanche'], ['bloaz, bloavezh', 'an, année'],
            ]),
            ...R('nombre', 'general', [
                ['unan, un', 'un'], ['daou, div', 'deux'], ['tri, teir', 'trois'], ['pevar, peder', 'quatre'], ['pemp', 'cinq'], ['c’hwec’h', 'six'], ['seizh', 'sept'], ['eizh', 'huit'], ['nav', 'neuf'], ['dek', 'dix'],
                ['ugent', 'vingt'], ['tregont', 'trente'], ['daou-ugent', 'quarante (deux vingts)'], ['hanter-kant', 'cinquante (demi-cent)'], ['tri-ugent', 'soixante (trois vingts)'], ['kant', 'cent'], ['mil', 'mille'],
                ['bloaz, vloaz', 'an, ans (« daou vloaz » = deux ans)', '« en oad a 70 bloaz » = à l’âge de 70 ans'], ['oad', 'âge'],
            ]),
            ...R('metier', 'general', [
                ['labourer-douar', 'cultivateur'], ['merour', 'métayer, fermier'], ['kemener', 'tailleur (d’où Le Quéméner)'], ['gwiader', 'tisserand'], ['govel', 'forgeron (d’où Le Goff)'],
                ['miliner', 'meunier'], ['pesketaer', 'pêcheur'], ['martolod', 'marin, matelot'], ['mevel', 'valet de ferme'], ['matezh', 'servante'], ['kloer', 'clerc, séminariste'],
            ]),
            ...R('formule', 'sepulture', [
                ['Amañ e c’hourvez …', 'Ici repose …'], ['marvet d’an … a viz …', 'mort le … du mois de …'], ['en oad a … bloaz', 'à l’âge de … ans'], ['Doue d’e bardono', 'Que Dieu lui pardonne'],
            ]),
            ...R('formule', 'general', [
                ['d’an … a viz …', 'le … du mois de … (« d’an 3 a viz Meurzh » = le 3 mars)'],
            ]),
        ],
        glyphs: {},
        widths: {},
        letters: [],
        exercises: [
            {id: 'br_bez1890', icon: '⚱️', title: 'Une tombe de 1890', level: 'facile', acte: 'sepulture', year: 1890,
                tip: 'Texte modèle écrit pour l’exercice (personne d’exemple), comme sur une croix de cimetière. « a viz » = du mois de ; « bloaz » = ans.',
                src: 'Amañ e c’hourvez Yann Le Gall marvet d’an 3 a viz Meurzh 1890 en oad a 70 bloaz Doue d’e bardono',
                notes: {'c’hourvez': 'Amañ e c’hourvez = ici repose', viz: 'a viz = du mois de (miz après une mutation)', Meurzh: 'Meurzh = mars', bardono: 'Doue d’e bardono = Dieu lui pardonne'}},
        ],
        numerals: null,
        sources: [
            {label: 'Office public de la langue bretonne — TermOfis et KerOfis (noms de lieux)', url: 'https://www.fr.brezhoneg.bzh/'},
            {label: 'Dictionnaire Favereau (breton – français)', url: 'https://www.arkaevraz.net/dicobzh/'},
            {label: 'FamilySearch Research Wiki — France Languages', url: 'https://www.familysearch.org/en/wiki/France_Languages'},
        ],
    };
})());
