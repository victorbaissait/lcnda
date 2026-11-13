/* 📜 Aide à la lecture — Slovaque (matriky de la Haute-Hongrie, aujourd'hui la Slovaquie ; souvent en latin ou en hongrois).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    return {
        code: 'sk', name: 'Slovaque', native: 'Slovenčina', icon: '🇸🇰', script: 'latine', dir: 'ltr', ocr: ['slk'],
        intro: 'La Slovaquie faisait partie du royaume de Hongrie : les registres paroissiaux sont le plus souvent en latin, parfois en slovaque (surtout chez les protestants, qui écrivaient aussi en tchèque biblique), et l’état civil d’État (à partir d’octobre 1895) est en hongrois — passe aussi par les onglets Latin et Hongrois. Les noms ont parfois été écrits à la hongroise (Kovács pour Kováč).',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['narodený, narodená, nar.', 'né, née'], ['narodil sa, narodila sa', 'est né, est née'], ['pokrstený, pokrstená', 'baptisé, baptisée'], ['krst', 'baptême'],
                ['krstný otec', 'parrain'], ['krstná matka', 'marraine'], ['krstní rodičia, kmotor, kmotra', 'parrain et marraine'],
                ['manželský', 'légitime'], ['nemanželský', 'illégitime, né hors mariage'], ['pôrodná baba', 'sage-femme'], ['dvojčatá', 'jumeaux'], ['mŕtvo narodený', 'mort-né'],
                ['dieťa', 'enfant'], ['chlapec', 'garçon'], ['dievča', 'fille (enfant)'],
            ]),
            ...R('mot', 'mariage', [
                ['sobáš', 'mariage'], ['sobášený, sobášení', 'marié, mariés'], ['ženích', 'le marié'], ['nevesta', 'la mariée (aussi : belle-fille)'], ['svedok, svedkovia', 'témoin, témoins'],
                ['ohlášky', 'les bans'], ['slobodný, slobodná', 'célibataire (jamais marié)'], ['vdovec', 'veuf'], ['vdova', 'veuve'], ['manžel', 'mari'], ['manželka', 'épouse'],
            ]),
            ...R('mot', 'sepulture', [
                ['zomrel, zomrela', 'est mort, est morte'], ['úmrtie', 'décès'], ['smrť', 'la mort'], ['pochovaný, pochovaná', 'enterré, enterrée'], ['pohreb', 'enterrement'],
                ['cintorín', 'cimetière'], ['príčina smrti', 'cause de la mort'], ['staroba', 'vieillesse'], ['suchoty', 'tuberculose (consomption)'], ['kiahne', 'variole'], ['vek', 'âge'],
            ]),
            ...R('mot', 'general', [
                ['matrika', 'registre'], ['fara, farnosť', 'cure, paroisse'], ['farár', 'curé ou pasteur'], ['kaplán', 'vicaire'], ['obec', 'commune'], ['dedina', 'village'], ['mesto', 'ville'],
                ['číslo domu', 'numéro de la maison'], ['bydlisko', 'domicile'], ['náboženstvo', 'religion'], ['rímskokatolícky, rím. kat.', 'catholique romain'], ['gréckokatolícky, gr. kat.', 'gréco-catholique'],
                ['evanjelický, ev. a. v.', 'protestant luthérien (« augsburského vyznania »)'], ['a', 'et'], ['v, vo', 'à, dans'], ['z, zo', 'de'], ['dňa', 'le (devant une date : « dňa 8. marca »)'],
            ]),
            ...R('parente', 'general', [
                ['otec', 'père'], ['matka', 'mère'], ['rodičia', 'parents'], ['syn', 'fils'], ['dcéra', 'fille'], ['brat', 'frère'], ['sestra', 'sœur'],
                ['starý otec', 'grand-père'], ['stará matka', 'grand-mère'], ['vnuk', 'petit-fils'], ['vnučka', 'petite-fille'], ['strýko', 'oncle'], ['teta', 'tante'],
                ['synovec', 'neveu'], ['neter', 'nièce'], ['bratranec', 'cousin'], ['sesternica', 'cousine'], ['svokor', 'beau-père (père du conjoint)'], ['svokra', 'belle-mère'],
                ['zať', 'gendre'], ['švagor', 'beau-frère'], ['švagriná', 'belle-sœur'], ['sirota', 'orphelin'], ['poručník', 'tuteur'],
                ['-ová', 'nom de femme : Kováčová = femme ou fille de Kováč ; « rodená, rod. » = née'],
            ]),
            ...R('mois', 'general', [
                ['január, januára', 'janvier'], ['február, februára', 'février'], ['marec, marca', 'mars'], ['apríl, apríla', 'avril'], ['máj, mája', 'mai'], ['jún, júna', 'juin'],
                ['júl, júla', 'juillet'], ['august, augusta', 'août'], ['september, septembra', 'septembre'], ['október, októbra', 'octobre'], ['november, novembra', 'novembre'], ['december, decembra', 'décembre'],
                ['mesiac', 'mois'], ['týždeň', 'semaine'], ['deň', 'jour'], ['nedeľa', 'dimanche'],
            ]),
            ...R('nombre', 'general', [
                ['jeden, jedna', 'un, une'], ['dva, dve', 'deux'], ['tri', 'trois'], ['štyri', 'quatre'], ['päť', 'cinq'], ['šesť', 'six'], ['sedem', 'sept'], ['osem', 'huit'], ['deväť', 'neuf'], ['desať', 'dix'],
                ['jedenásť', 'onze'], ['dvanásť', 'douze'], ['dvadsať', 'vingt'], ['tridsať', 'trente'], ['štyridsať', 'quarante'], ['päťdesiat', 'cinquante'], ['šesťdesiat', 'soixante'],
                ['sedemdesiat', 'soixante-dix'], ['osemdesiat', 'quatre-vingts'], ['deväťdesiat', 'quatre-vingt-dix'], ['sto', 'cent'], ['tisíc', 'mille'],
                ['rokov, roky', 'ans', '« 60 rokov » = 60 ans'], ['mesiacov, týždňov, dní', 'mois, semaines, jours'],
            ]),
            ...R('metier', 'general', [
                ['roľník', 'cultivateur, paysan'], ['sedliak', 'paysan'], ['želiar', 'petit paysan qui n’a qu’une maison et presque pas de terre'], ['podruh', 'logé chez un autre, journalier'],
                ['nádenník', 'journalier'], ['sluha', 'valet'], ['slúžka', 'servante'], ['mlynár', 'meunier'], ['kováč', 'forgeron'], ['krajčír', 'tailleur'], ['obuvník, švec', 'cordonnier'],
                ['tkáč', 'tisserand'], ['tesár', 'charpentier'], ['stolár', 'menuisier'], ['murár', 'maçon'], ['mäsiar', 'boucher'], ['pekár', 'boulanger'], ['krčmár', 'aubergiste'],
                ['pastier', 'berger, pâtre'], ['učiteľ', 'instituteur'], ['richtár', 'maire du village'],
            ]),
            ...R('abrev', 'general', [
                ['nar.', 'narodený : né'], ['rod.', 'rodená : née (nom de jeune fille)'], ['rím. kat., r. k.', 'catholique romain'], ['ev. a. v.', 'luthérien'], ['č.', 'číslo : numéro'],
            ]),
            ...R('formule', 'bapteme', [
                ['narodil sa a pokrstený bol', 'est né et a été baptisé'], ['manželský syn …', 'fils légitime de …'], ['krstní rodičia: …', 'parrain et marraine : …'],
            ]),
            ...R('formule', 'mariage', [
                ['boli sobášení', 'ont été mariés'],
            ]),
            ...R('formule', 'sepulture', [
                ['zomrel a pochovaný bol', 'est mort et a été enterré'], ['vo veku … rokov', 'à l’âge de … ans'],
            ]),
        ],
        glyphs: {},
        widths: {},
        letters: [],
        exercises: [
            {id: 'sk_krst1860', icon: '👶', title: 'Un baptême de 1860', level: 'facile', acte: 'bapteme', year: 1860,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). « marca » = de mars ; « rodenej » = née ; la femme prend « -ová ». Tu peux taper sans accents.',
                src: 'Dňa 8. marca 1860 narodil sa a dňa 9. marca pokrstený bol Ján manželský syn Jozefa Kováča roľníka a Anny rodenej Hudecovej krstní rodičia Martin Benko a Zuzana Benková',
                notes: {marca: 'marca = de mars (génitif de marec)', rodenej: 'rodenej = née (son nom de jeune fille suit)', 'Benková': '-ová : la femme de Benko'}},
        ],
        numerals: null,
        sources: [
            {label: 'FamilySearch Research Wiki — Slovak Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Slovak_Genealogical_Word_List'},
            {label: 'FamilySearch Research Wiki — Slovakia Church Records', url: 'https://www.familysearch.org/en/wiki/Slovakia_Church_Records'},
        ],
    };
})());
