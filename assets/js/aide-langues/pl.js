/* 📜 Aide à la lecture — Polonais (actes paroissiaux-civils du royaume de Pologne 1808-1867, registres de Galicie, état civil).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    return {
        code: 'pl', name: 'Polonais', native: 'Polski', icon: '🇵🇱', script: 'latine', dir: 'ltr', ocr: ['pol'],
        intro: 'De 1808 à 1867, les actes du royaume de Pologne sont écrits en polonais, en phrases toujours pareilles (« Działo się… ») ; avant, souvent en latin ; après 1868, souvent en russe. La recherche trouve ł, ż, ą, ę… même tapés sans accents (« malzonkowie » → małżonkowie).',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['urodzony, urodzona', 'né, née', '', ['urodzone', 'urodzonego']], ['urodził się, urodziła się', 'est né, est née'], ['ochrzczony, ochrzczona', 'baptisé, baptisée'], ['chrzest', 'baptême', '« na chrzcie świętym » = au saint baptême', ['chrzcie']],
                ['ojciec chrzestny', 'parrain'], ['matka chrzestna', 'marraine'], ['rodzice chrzestni, chrzestni', 'parrain et marraine'], ['dziecię, dziecko', 'enfant', '', ['dziecięciu']],
                ['płci męskiej', 'de sexe masculin (un garçon)'], ['płci żeńskiej', 'de sexe féminin (une fille)'], ['z prawego łoża, ślubny', 'légitime (enfant de parents mariés)'], ['nieślubny', 'illégitime, né hors mariage'],
                ['bliźnięta', 'jumeaux'], ['akuszerka, położna', 'sage-femme'], ['imię', 'prénom'], ['nazwisko', 'nom de famille'],
            ]),
            ...R('mot', 'mariage', [
                ['ślub', 'mariage (à l’église)'], ['małżeństwo', 'mariage'], ['małżonkowie', 'les époux, le couple'], ['małżonek, małżonka', 'époux, épouse', '« z jego małżonki » = de son épouse', ['małżonki']],
                ['kawaler', 'célibataire (homme jamais marié)'], ['panna', 'célibataire (jeune fille jamais mariée)'], ['wdowiec', 'veuf'], ['wdowa', 'veuve'],
                ['zapowiedzi', 'les bans (annonces du mariage)'], ['narzeczeni', 'les fiancés'], ['żona', 'épouse'], ['mąż', 'mari'], ['świadkowie', 'témoins', '', ['świadków', 'świadkom']],
            ]),
            ...R('mot', 'sepulture', [
                ['zmarł, zmarła', 'est mort, est morte'], ['zmarły, zmarła', 'défunt, défunte'], ['umarł, umarła', 'est mort, est morte'], ['śmierć', 'la mort'],
                ['pochowany, pochowana', 'enterré, enterrée'], ['pogrzeb', 'enterrement'], ['cmentarz', 'cimetière'], ['martwo urodzony', 'mort-né'],
                ['ś.p., świętej pamięci', 'feu (« de sainte mémoire »)'], ['pozostawił po sobie owdowiałą żonę', 'a laissé une veuve'],
            ]),
            ...R('mot', 'general', [
                ['działo się', 'cela s’est passé, fait à (début de chaque acte)'], ['wieś, we wsi', 'village, au village'], ['miasto, w mieście', 'ville, en ville'], ['parafia', 'paroisse'], ['gmina', 'commune'],
                ['zamieszkały, zamieszkała', 'domicilié, domiciliée', '', ['zamieszkałych']], ['stawił się, stawili się', 'a comparu, ont comparu'], ['stawający', 'le comparant (celui qui déclare)', '', ['stawającemu']],
                ['w obecności', 'en présence de'], ['świadek', 'témoin'], ['okazał nam', 'nous a présenté (l’enfant)'], ['akt', 'acte'], ['proboszcz', 'curé'], ['ksiądz, ks.', 'prêtre, abbé'],
                ['Urzędnik Stanu Cywilnego', 'officier de l’état civil'], ['pisać nie umieją, nie umie', 'ne savent pas écrire, ne sait pas écrire'], ['przeczytany', 'lu (à haute voix)'], ['podpisany', 'signé'],
                ['mający, mająca', 'ayant, âgé(e) de (« lat 30 mający » = âgé de 30 ans)', '', ['mającej', 'mających']], ['tamże', 'au même endroit'],
                ['z domu', 'née (nom de jeune fille)'], ['z Kowalskich', 'née Kowalska (« z » + le nom au pluriel = son nom de jeune fille)'], ['syn, córka', 'fils, fille'],
            ]),
            ...R('parente', 'general', [
                ['ojciec', 'père'], ['matka', 'mère'], ['rodzice', 'parents (le père et la mère)'], ['syn', 'fils'], ['córka', 'fille'], ['brat', 'frère'], ['siostra', 'sœur'],
                ['dziadek', 'grand-père'], ['babka', 'grand-mère'], ['wnuk, wnuczka', 'petit-fils, petite-fille'], ['stryj', 'oncle paternel'], ['wuj', 'oncle maternel'], ['ciotka', 'tante'],
                ['teść, teściowa', 'beau-père, belle-mère (parents du conjoint)'], ['zięć', 'gendre'], ['synowa', 'belle-fille (épouse du fils)'], ['szwagier', 'beau-frère'],
                ['ojczym', 'beau-père (second mari de la mère)'], ['macocha', 'belle-mère (seconde femme du père)'], ['pasierb, pasierbica', 'beau-fils, belle-fille (enfant du conjoint)'], ['sierota', 'orphelin'],
            ]),
            ...R('mois', 'general', [
                ['styczeń, stycznia', 'janvier, de janvier'], ['luty, lutego', 'février, de février'], ['marzec, marca', 'mars, de mars'], ['kwiecień, kwietnia', 'avril, d’avril'], ['maj, maja', 'mai, de mai'],
                ['czerwiec, czerwca', 'juin, de juin'], ['lipiec, lipca', 'juillet, de juillet'], ['sierpień, sierpnia', 'août, d’août'], ['wrzesień, września', 'septembre, de septembre'],
                ['październik, października', 'octobre, d’octobre'], ['listopad, listopada', 'novembre, de novembre'], ['grudzień, grudnia', 'décembre, de décembre'],
                ['dnia', 'le (jour) : « dnia piątego marca » = le 5 mars'], ['roku', 'de l’année'], ['miesiąc', 'mois'],
            ]),
            ...R('nombre', 'general', [
                ['jeden', 'un'], ['dwa', 'deux'], ['trzy', 'trois'], ['cztery', 'quatre'], ['pięć', 'cinq'], ['sześć', 'six'], ['siedem', 'sept'], ['osiem', 'huit'], ['dziewięć', 'neuf'], ['dziesięć', 'dix'],
                ['jedenaście', 'onze'], ['dwanaście', 'douze'], ['dwadzieścia', 'vingt'], ['trzydzieści', 'trente'], ['czterdzieści', 'quarante'], ['pięćdziesiąt', 'cinquante'],
                ['sześćdziesiąt', 'soixante'], ['siedemdziesiąt', 'soixante-dix'], ['osiemdziesiąt', 'quatre-vingts'], ['dziewięćdziesiąt', 'quatre-vingt-dix'], ['sto', 'cent'], ['tysiąc', 'mille'],
                ['osiemset, ośmset', 'huit cents (ośmset : forme ancienne ; « tysiąc ośmset » = 1800)'],
                ['pierwszego, drugiego, trzeciego', 'le premier, le deuxième, le troisième'], ['czwartego, piątego, szóstego', 'le quatrième, le cinquième, le sixième'],
                ['siódmego, ósmego, dziewiątego', 'le septième, le huitième, le neuvième'], ['dziesiątego, dwudziestego, trzydziestego', 'le dixième, le vingtième, le trentième'],
                ['lat', 'ans (« lat 30 » = 30 ans)'], ['godzina, o godzinie', 'heure, à … heures'], ['rano', 'du matin'], ['po południu', 'de l’après-midi'],
            ]),
            ...R('metier', 'general', [
                ['rolnik', 'cultivateur'], ['gospodarz', 'fermier (chef d’une exploitation)'], ['włościanin', 'paysan'], ['chałupnik', 'petit paysan qui a une maison mais presque pas de terre'],
                ['komornik', 'paysan sans terre logé chez un autre (en ville : huissier)'], ['parobek', 'valet de ferme'], ['służąca', 'servante'], ['wyrobnik', 'journalier'],
                ['kowal', 'forgeron'], ['młynarz', 'meunier'], ['szewc', 'cordonnier'], ['krawiec', 'tailleur'], ['tkacz', 'tisserand'], ['cieśla', 'charpentier'], ['stolarz', 'menuisier'],
                ['karczmarz', 'aubergiste'], ['kupiec', 'marchand'], ['owczarz', 'berger'], ['organista', 'organiste'], ['nauczyciel', 'instituteur'], ['szlachcic', 'noble'],
            ]),
            ...R('formule', 'bapteme', [
                ['Działo się we wsi … dnia … roku … o godzinie …', 'Fait au village de …, le … de l’an …, à … heures'],
                ['Stawił się … lat … mający, … zamieszkały', 'A comparu …, âgé de … ans, domicilié à …'],
                ['i okazał nam dziecię płci męskiej, urodzone …, z jego małżonki … lat … mającej', 'et nous a présenté un enfant de sexe masculin, né …, de son épouse …, âgée de … ans'],
                ['Dziecięciu temu na chrzcie świętym nadane zostało imię …', 'À cet enfant, au saint baptême, a été donné le prénom …'],
                ['a rodzicami jego chrzestnymi byli …', 'et ses parrain et marraine furent …'],
            ]),
            ...R('formule', 'mariage', [['zawarte zostało religijne małżeństwo pomiędzy …', 'a été conclu le mariage religieux entre …']]),
            ...R('formule', 'sepulture', [['stawili się … i oświadczyli, że … zmarł', 'ont comparu … et ont déclaré que … est mort']]),
            ...R('formule', 'general', [
                ['Roku Pańskiego …', 'En l’an du Seigneur …'], ['w obecności świadków …', 'en présence des témoins …'],
                ['Akt ten stawającemu i świadkom przeczytany, przez Nas tylko podpisany został, gdyż stawający i świadkowie pisać nie umieją', 'Cet acte, lu au comparant et aux témoins, a été signé par Nous seul, car le comparant et les témoins ne savent pas écrire'],
            ]),
        ],
        glyphs: {pl_l: ['M18 8 L18 41 C18 47 24 47 27 43', 'M11 31 L25 21']},
        letters: [
            {id: 'pl_l', name: 'ł (l barré)', seen: ['pl_l'], read: 'ł (se dit comme « w » anglais)', cmp: ['l', 't'], note: 'Le l barré en biais n’est pas un t : la barre est penchée et le trait monte plus haut. Dans la recherche, ł et l sont pareils.', keys: 'l barré ł polonais t'},
        ],
        exercises: [
            {id: 'pl_ur1835', icon: '👶', title: 'Une naissance de 1835 (akt urodzenia)', level: 'moyen', acte: 'bapteme', year: 1835,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple, village imaginaire). « ośmset » = osiemset (800) ; « z Zielińskich » = née Zielińska.',
                src: 'Działo się we wsi Nowa Wola dnia piątego Marca tysiąc ośmset=ośmset|osiemset trzydziestego piątego roku o godzinie dziesiątej rano Stawił się Jan Kowalski rolnik lat trzydzieści mający w Nowej Woli zamieszkały w obecności Wojciecha Nowaka i Józefa Wiśniewskiego rolników i okazał nam dziecię płci męskiej urodzone wczoraj z jego małżonki Marianny z Zielińskich Dziecięciu temu nadane zostało imię Antoni',
                notes: {'ośmset': 'ośmset = osiemset : huit cents (forme ancienne)', Zielińskich: '« z Zielińskich » = née Zielińska (son nom de jeune fille)', 'małżonki': 'małżonka = épouse'}},
        ],
        numerals: null,
        sources: [
            {label: 'FamilySearch Research Wiki — Polish Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Polish_Genealogical_Word_List'},
            {label: 'J. Shea et F. Hoffman, « In Their Words : A Genealogist’s Translation Guide to Polish, German, Latin, and Russian Documents », vol. I : Polish', url: 'https://www.familysearch.org/en/wiki/Poland_Language_and_Languages'},
        ],
    };
})());
