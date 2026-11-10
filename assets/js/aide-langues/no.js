/* 📜 Aide à la lecture — Norvégien (kirkebøker luthériennes de Norvège ; écrites en danois jusqu'au début du XXe siècle).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const plain = s => [s.replace(/ø/g, 'o').replace(/Ø/g, 'O'), s.replace(/ø/g, 'oe').replace(/Ø/g, 'Oe')];
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: [...(alt || []), ...(/[øØ]/.test(t) ? plain(t) : [])]}));
    return {
        code: 'no', name: 'Norvégien', native: 'Norsk', icon: '🇳🇴', script: 'latine', dir: 'ltr', ocr: ['nor'],
        intro: 'Registres paroissiaux luthériens (kirkebøker) de Norvège, depuis la fin du XVIIe siècle. Jusque vers 1907 ils sont écrits en danois (même vocabulaire que l’onglet Danois), en écriture gothique jusque vers 1875. Particularité norvégienne : le nom de la ferme où l’on vit s’ajoute au patronyme et change quand on déménage (« Ole Olsen Haugen »).',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['født, fødte', 'né ; « Fødte » = les naissances'], ['døbt, døpt, døbte', 'baptisé ; « Døbte » = les baptêmes'], ['Daab, dåp', 'baptême'],
                ['hjemmedøbt', 'baptisé à la maison (ondoyé)'], ['fremstillet i Kirken', 'présenté à l’église après un baptême à la maison'],
                ['Faddere', 'parrains et marraines (souvent cinq ou plus)'], ['ægte, ekte', 'légitime'], ['uægte, uekte', 'illégitime, né hors mariage'],
                ['Tvillinger', 'jumeaux'], ['dødfødt', 'mort-né'], ['Jordemor, Jordemoder', 'sage-femme'], ['introduceret', 'relevailles (la mère revient à l’église)'],
                ['konfirmeret, konfirmert', 'confirmé (vers 14-15 ans ; registre des « Konfirmerede »)'],
            ]),
            ...R('mot', 'mariage', [
                ['viet, Viede', 'marié ; « Viede » = les mariages'], ['copuleret', 'marié (mot latin)'], ['Brudgom', 'le marié'], ['Brud', 'la mariée'],
                ['Forlovere', 'deux témoins garants du mariage'], ['Ungkarl', 'garçon, jamais marié'], ['Pige, Pike', 'jeune fille, jamais mariée'],
                ['Enkemand, Enkemann', 'veuf'], ['Enke', 'veuve'], ['Hustru', 'épouse'], ['lyst', 'bans publiés'],
            ]),
            ...R('mot', 'sepulture', [
                ['død, Døde', 'mort ; « Døde » = les décès'], ['begravet, jordfestet', 'enterré'], ['Jordfæstelse', 'mise en terre (par le pasteur)'],
                ['Kirkegaard', 'cimetière'], ['Dødsaarsag', 'cause de la mort'], ['Alderdom', 'vieillesse'], ['Brystsyge', 'maladie de poitrine'], ['Tæring', 'consomption'],
                ['Kopper', 'variole'], ['Barselseng', 'couches'], ['druknet', 'noyé (fréquent chez les pêcheurs)'], ['forulykket', 'mort par accident'], ['gammel', 'âgé de'],
            ]),
            ...R('mot', 'general', [
                ['Kirkebok, Kirkebog', 'registre paroissial'], ['Ministerialbok', 'registre officiel tenu par le pasteur'], ['Klokkerbok', 'double du registre tenu par le sacristain (klokker)'],
                ['Prestegjeld, Præstegjeld', 'grande paroisse (avec plusieurs églises annexes)'], ['Sogn', 'paroisse (d’une église)'],
                ['Gaard, Gård', 'ferme ; son nom sert de nom de famille'], ['Plads, Plass', 'petite tenure d’un husmand sur une ferme'], ['under', 'sous, dépendant de (« Husmand under Haugen »)'],
                ['Bygd', 'campagne, vallée habitée'], ['Utflyttede, Indflyttede', 'partis, arrivés (listes de la paroisse)'], ['Folketelling', 'recensement'],
                ['af, fra', 'de'], ['og', 'et'], ['paa, på', 'sur, à'],
            ]),
            ...R('parente', 'general', [
                ['Fader, Far', 'père'], ['Moder, Mor', 'mère'], ['Søn, Sønn', 'fils'], ['Datter', 'fille'], ['Broder, Bror', 'frère'], ['Søster', 'sœur'],
                ['Farfar, Morfar', 'grand-père paternel, maternel'], ['Farmor, Mormor', 'grand-mère paternelle, maternelle'],
                ['Farbror, Morbror', 'oncle paternel, maternel'], ['Faster, Moster', 'tante paternelle, maternelle'], ['Fætter, Fetter', 'cousin'], ['Kusine', 'cousine'],
                ['Svigerfar, Svigermor', 'beau-père, belle-mère (parents du conjoint)'], ['Svigersøn', 'gendre'], ['Svigerdatter', 'belle-fille'],
                ['Stedfar, Stedmor', 'beau-père, belle-mère (second mari, seconde femme)'], ['Barnebarn', 'petit-enfant'], ['Pleiebarn, Pleiesøn', 'enfant placé'],
                ['-sen, -søn, -datter', 'patronyme : « fils de », « fille de » (Ole Olsen = fils d’Ole ; Marte Larsdatter = fille de Lars), suivi du nom de la ferme'],
            ]),
            ...R('mois', 'general', [
                ['Januar, Januarii', 'janvier'], ['Februar, Februarii', 'février'], ['Marts, Mars, Martii', 'mars'], ['April, Aprilis', 'avril'], ['Mai, Maj', 'mai'], ['Juni', 'juin'],
                ['Juli', 'juillet'], ['August', 'août'], ['September, 7br.', 'septembre'], ['Oktober, October, Octbr., 8br.', 'octobre'], ['November, 9br.', 'novembre'], ['December, Desember, Xbr.', 'décembre'],
                ['Dom. … p. Trin.', 'tel dimanche après la Trinité (date donnée par les fêtes de l’Église)'],
            ]),
            ...R('nombre', 'general', [
                ['en, et', 'un'], ['to', 'deux'], ['tre', 'trois'], ['fire', 'quatre'], ['fem', 'cinq'], ['seks', 'six'], ['syv, sju', 'sept'], ['otte, åtte', 'huit'], ['ni', 'neuf'], ['ti', 'dix'],
                ['elleve', 'onze'], ['tolv', 'douze'], ['tyve, tjue', 'vingt'], ['tredive, tretti', 'trente'], ['førti, fyrretyve', 'quarante'], ['femti, halvtreds', 'cinquante'],
                ['seksti, tres', 'soixante'], ['sytti, halvfjerds', 'soixante-dix'], ['åtti, firs', 'quatre-vingts'], ['nitti, halvfems', 'quatre-vingt-dix'], ['hundrede, hundre', 'cent'],
                ['Aar, År', 'an, ans', '« 26 Aar » = 26 ans'], ['Maaneder, Uger, Dage', 'mois, semaines, jours'],
            ]),
            ...R('metier', 'general', [
                ['Gaardmand, Gårdbruker', 'fermier (exploite une ferme)'], ['Selveier, Selvejer', 'paysan propriétaire'], ['Leilending', 'fermier à bail'],
                ['Husmand, Husmann', 'petit tenancier sur la ferme d’un autre (avec ou sans terre : « med Jord », « uden Jord »)'],
                ['Inderst', 'logé chez un autre, sans maison à soi'], ['Strandsidder', 'habitant du rivage sans terre, qui vit de la pêche et de petits travaux'],
                ['Kaarmand, Føderaadsmand', 'paysan retiré qui vit de la pension (kår) donnée par la ferme qu’il a cédée'],
                ['Tjenestedreng, Dreng', 'valet de ferme'], ['Tjenestepige, Tjenestepike', 'servante'], ['Fisker', 'pêcheur'], ['Matros', 'matelot'], ['Skipper', 'patron de bateau'],
                ['Smed', 'forgeron'], ['Møller', 'meunier'], ['Skrædder', 'tailleur'], ['Skomager', 'cordonnier'], ['Snedker', 'menuisier'], ['Klokker', 'sacristain et chantre'], ['Skolelærer', 'instituteur'],
                ['Gaardmandssøn, Gaardmandsdatter', 'fils, fille de fermier'], ['Husmandssøn', 'fils de husmand'],
            ]),
            ...R('abrev', 'general', [
                ['d.', 'den : le (devant une date) ; ou død : mort'], ['f.', 'født : né'], ['aa', 'å (« Aar » = år, « Gaard » = gård)'],
            ]),
            ...R('formule', 'mariage', [
                ['Ungkarl … og Pige …', 'le garçon … et la jeune fille … (premier mariage des deux)'], ['Forlovere: …', 'témoins garants : …'],
            ]),
            ...R('formule', 'bapteme', [
                ['Husmand … under … og Hustru …', 'le petit tenancier … (sur la ferme …) et sa femme …'],
            ]),
            ...R('formule', 'sepulture', [
                ['… Aar gammel', 'âgé de … ans'],
            ]),
        ],
        glyphs: {
            no_e: ['M10 44 L13 30 L16 44', 'M16 44 L19 30 L22 44'],
            no_n: ['M8 44 L12 30 L17 44', 'M17 44 L21 30 L26 44'],
            no_aa: ['M17 34 C14 29 8 31 8 38 C8 45 15 46 17 40', 'M17 32 L17 46', 'M31 34 C28 29 22 31 22 38 C22 45 29 46 31 40', 'M31 32 L31 46'],
        },
        widths: {no_aa: 38},
        letters: [
            {id: 'no_e', name: 'e gothique', seen: ['no_e'], read: 'e', cmp: ['no_n'], note: 'Écriture gothique des kirkebøker (jusque vers 1875) : le e ressemble à un petit n pointu.', keys: 'gothique e n kurrent norvegien'},
            {id: 'no_aa', name: 'aa = å', seen: ['no_aa'], read: 'å', cmp: [], note: '« aa » s’écrit pour å jusqu’en 1917 (et dans beaucoup de noms de fermes jusqu’à aujourd’hui) : « Aasen » = Åsen.', keys: 'aa a rond ferme'},
        ],
        exercises: [
            {id: 'no_viede1845', icon: '💍', title: 'Un mariage de 1845', level: 'moyen', acte: 'mariage', year: 1845,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). Chaque nom = prénom + patronyme + ferme ; écrit en danois.',
                src: 'Viede 1845 d.=den 18 Octbr.=Octbr.|October|oktober Ungkarl Ole Olsen Haugen Gaardmandssøn=Gaardmandssøn|Gårdmandssøn|Gaardmandsson 26 Aar=Aar|År og Pige Marte Larsdatter Bakken 22 Aar=Aar|År Forlovere Lars Hansen Bakken og Peder Olsen Haugen',
                notes: {'Octbr.': 'Octbr. = October : octobre', Gaardmandssøn: 'fils de fermier (aa = å)', Aar: 'Aar = år : ans'}},
        ],
        numerals: null,
        sources: [
            {label: 'FamilySearch Research Wiki — Norwegian Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Norwegian_Genealogical_Word_List'},
            {label: 'FamilySearch Research Wiki — Norway Church Records', url: 'https://www.familysearch.org/en/wiki/Norway_Church_Records'},
            {label: 'Arkivverket — Digitalarkivet', url: 'https://www.digitalarkivet.no/'},
        ],
    };
})());
