/* 📜 Aide à la lecture — Ukrainien (registres de Galicie et de Bucovine autrichiennes, actes ukrainiens du XXe siècle).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    /* ── Lettres latines : [à la française, translittération officielle ukrainienne de 2010, à la russe (г = g, и = i)] ── */
    const TR = {
        'а': ['a', 'a', 'a'], 'б': ['b', 'b', 'b'], 'в': ['v', 'v', 'v'], 'г': ['h', 'h', 'g'], 'ґ': ['g', 'g', 'g'], 'д': ['d', 'd', 'd'], 'е': ['e', 'e', 'e'],
        'є': ['ie', 'ye', 'e'], 'ж': ['j', 'zh', 'zh'], 'з': ['z', 'z', 'z'], 'и': ['y', 'y', 'i'], 'і': ['i', 'i', 'i'], 'ї': ['ii', 'yi', 'i'], 'й': ['i', 'y', 'y'],
        'к': ['k', 'k', 'k'], 'л': ['l', 'l', 'l'], 'м': ['m', 'm', 'm'], 'н': ['n', 'n', 'n'], 'о': ['o', 'o', 'o'], 'п': ['p', 'p', 'p'], 'р': ['r', 'r', 'r'],
        'с': ['s', 's', 's'], 'т': ['t', 't', 't'], 'у': ['ou', 'u', 'u'], 'ф': ['f', 'f', 'f'], 'х': ['kh', 'kh', 'kh'], 'ц': ['ts', 'ts', 'ts'], 'ч': ['tch', 'ch', 'ch'],
        'ш': ['ch', 'sh', 'sh'], 'щ': ['chtch', 'shch', 'shch'], 'ь': ['', '', ''], 'ю': ['iou', 'yu', 'yu'], 'я': ['ia', 'ya', 'ya'], 'ъ': ['', '', ''], 'ѣ': ['i', 'i', 'e'],
        "'": ['', '', ''], '’': ['', '', ''], 'ʼ': ['', '', ''],
    };
    const translit = word => {
        const w = String(word || '').toLowerCase().normalize('NFC');
        if (!/[Ѐ-ӿ]/.test(w)) return [];
        const out = [0, 1, 2].map(i => [...w].map(c => (c in TR ? TR[c][i] : c)).join('').replace(/[^a-z0-9 -]/g, ''));
        return [...new Set(out.filter(Boolean))];
    };
    return {
        code: 'uk', name: 'Ukrainien', native: 'Українська', icon: '🇺🇦', script: 'cyrillique', dir: 'ltr', ocr: ['ukr'],
        intro: 'Dans l’Empire russe, les registres des paroisses d’Ukraine sont tenus en russe (choisis « Russe »). En Galicie et en Bucovine autrichiennes, les paroisses gréco-catholiques écrivent en latin, puis souvent en ukrainien à la fin du XIXe siècle ; l’état civil soviétique (à partir de 1919-1920) est en ukrainien. Lettres propres : ґ, є, і, ї.',
        translit,
        entries: [
            ...R('mot', 'bapteme', [
                ['народився, народилася', 'est né, est née'], ['народження', 'naissance'], ['хрещений, хрещена', 'baptisé(e) ; aussi parrain, marraine'],
                ['хрещення', 'baptême'], ['хресні батьки', 'parrain et marraine'], ['хрещений батько, хрещена мати', 'parrain, marraine'],
                ['кум, кума', 'parrain, marraine (entre eux et pour les parents de l’enfant)'], ['дитина', 'enfant'], ['немовля', 'nouveau-né'],
                ['законний, законна', 'légitime'], ['позашлюбний, позашлюбна', 'né(e) hors mariage'], ['близнята', 'jumeaux'],
            ]),
            ...R('mot', 'mariage', [
                ['шлюб', 'mariage'], ['вінчання', 'mariage à l’église (le « couronnement »)'], ['повінчані, вінчалися', 'mariés à l’église'],
                ['наречений, наречена', 'le fiancé, la fiancée'], ['молодий, молода', 'le marié, la mariée'], ['парубок', 'garçon, jeune homme jamais marié'],
                ['дівчина, дівиця', 'jeune fille jamais mariée'], ['вдова', 'veuve'], ['вдівець', 'veuf'], ['свідки', 'témoins'], ['оголошення', 'les bans, l’annonce'],
            ]),
            ...R('mot', 'deces', [
                ['помер, померла', 'est mort, est morte'], ['смерть', 'mort, décès'], ['похований, похована', 'enterré(e)'], ['похорон', 'enterrement'],
                ['цвинтар, кладовище', 'cimetière'], ['причина смерті', 'cause de la mort'], ['від старості', 'de vieillesse'], ['небіжчик, небіжчиця', 'le défunt, la défunte'],
            ]),
            ...R('mot', 'general', [
                ['парафія', 'paroisse'], ['церква', 'église'], ['священик', 'prêtre'], ['парох', 'curé (Galicie)'], ['греко-католицький', 'gréco-catholique'],
                ['православний', 'orthodoxe'], ['село', 'village'], ['місто', 'ville'], ['повіт', 'district'], ['губернія', 'gouvernement (province de l’Empire russe)'],
                ['хата', 'maison paysanne'], ['ч. хати, число хати', 'numéro de la maison (registres de Galicie)'], ['по батькові', 'patronyme (nom du père)'],
                ['РАЦС, ЗАГС', 'bureau de l’état civil soviétique'],
            ]),
            ...R('parente', 'general', [
                ['батько', 'père'], ['мати', 'mère'], ['батьки', 'parents'], ['син', 'fils'], ['дочка, донька', 'fille'], ['брат', 'frère'], ['сестра', 'sœur'],
                ['дід', 'grand-père'], ['баба', 'grand-mère'], ['онук, онука', 'petit-fils, petite-fille'], ['дядько', 'oncle'], ['тітка', 'tante'],
                ['чоловік', 'mari (aussi « homme »)'], ['дружина', 'épouse'], ['жінка', 'femme, épouse'], ['тесть, теща', 'beau-père, belle-mère (parents de l’épouse)'],
                ['свекор, свекруха', 'beau-père, belle-mère (parents du mari)'], ['зять', 'gendre'], ['невістка', 'belle-fille (épouse du fils)'], ['пасинок, падчерка', 'beau-fils, belle-fille (enfant du conjoint)'],
            ]),
            ...R('mois', 'general', [
                ['січень, січня', 'janvier'], ['лютий, лютого', 'février'], ['березень, березня', 'mars'], ['квітень, квітня', 'avril'], ['травень, травня', 'mai'],
                ['червень, червня', 'juin'], ['липень, липня', 'juillet'], ['серпень, серпня', 'août'], ['вересень, вересня', 'septembre'], ['жовтень, жовтня', 'octobre'],
                ['листопад, листопада', 'novembre'], ['грудень, грудня', 'décembre'], ['рік, року', 'année (« 1926 року » = en 1926)'], ['день, дня', 'jour'],
            ]),
            ...R('nombre', 'general', [
                ['один, одна', 'un, une'], ['два, дві', 'deux'], ['три', 'trois'], ['чотири', 'quatre'], ['п’ять', 'cinq', '', ["п'ять"]], ['шість', 'six'], ['сім', 'sept'],
                ['вісім', 'huit'], ['дев’ять', 'neuf', '', ["дев'ять"]], ['десять', 'dix'], ['двадцять', 'vingt'], ['тридцять', 'trente'], ['сорок', 'quarante'],
                ['п’ятдесят', 'cinquante', '', ["п'ятдесят"]], ['сто', 'cent'], ['тисяча', 'mille'], ['років, роки', 'ans (« 45 років » = 45 ans)'],
            ]),
            ...R('metier', 'general', [
                ['селянин, селянка', 'paysan, paysanne'], ['хлібороб', 'cultivateur'], ['міщанин', 'bourgeois d’une ville'], ['коваль', 'forgeron'], ['швець', 'cordonnier'],
                ['кравець', 'tailleur'], ['тесля', 'charpentier'], ['мельник', 'meunier'], ['ткач', 'tisserand'], ['козак', 'cosaque'], ['чумак', 'charretier qui transportait le sel et le poisson'],
                ['наймит', 'valet de ferme, ouvrier loué'], ['учитель', 'instituteur'],
            ]),
            ...R('formule', 'bapteme', [
                ['народився … син … та його дружини …', 'est né … fils de … et de son épouse …'],
            ]),
            ...R('formule', 'mariage', [
                ['взяли шлюб', 'se sont mariés'],
            ]),
            ...R('formule', 'deces', [
                ['помер … від …', 'est mort … de … (cause)'],
            ]),
        ],
        glyphs: {
            uk_y: ['M12 26 L12 40 C12 47 22 47 24 40', 'M24 26 L24 40 C24 47 30 47 31 44'],
            uk_yi: ['M20 26 L20 46', 'M15 18 L15 20', 'M25 18 L25 20'],
            uk_h: ['M14 26 L14 46', 'M14 26 L27 26'],
            uk_g: ['M14 26 L14 46', 'M14 26 L27 26 L27 19'],
            uk_ie: ['M27 30 C22 25 14 28 14 36 C14 44 22 47 27 42', 'M14 36 L24 36'],
        },
        letters: [
            {id: 'uk_i', name: 'и, і, ї ukrainiens', seen: ['uk_y', 'i', 'uk_yi'], read: 'и (y), і (i), ї (ï)', cmp: [], note: 'En ukrainien, и se lit « y » (un i dur), і se lit « i », ї se lit « ï ». Une lettre écrite і dans un acte russe d’avant 1918 se lit и.', keys: 'и і ї ukrainien y i'},
            {id: 'uk_g', name: 'г et ґ', seen: ['uk_h', 'uk_g'], read: 'г (h), ґ (g)', cmp: [], note: 'En ukrainien, г se lit « h » (Галина = Halyna) et ґ se lit « g ». Dans les documents en russe, le même nom s’écrit avec un g (Галина = Galina) : cherche les deux.', keys: 'г ґ h g ukrainien'},
            {id: 'uk_ie', name: 'є (ie) et е (e)', seen: ['uk_ie', 'e'], read: 'є (ie, ye), е (e)', cmp: [], note: 'є ressemble à un c barré au milieu : « Євдокія » = Yevdokiya. Le е ukrainien se lit « è » (jamais « ié » comme en russe).', keys: 'є е ie ye ukrainien'},
        ],
        exercises: [
            {id: 'uk_nar1926', icon: '👶', title: 'Une naissance de 1926', level: 'facile', acte: 'bapteme', year: 1926,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). Écris en cyrillique ou en lettres latines (г = h, и = y).',
                src: '1926 року березня 12 дня народився Іван син Петра Коваленка селянина та його дружини Марії',
                notes: {'березня': 'березня = de mars', 'селянина': 'селянин = paysan'}},
        ],
        numerals: null,
        sources: [
            {label: 'FamilySearch Research Wiki — Ukrainian Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Ukrainian_Genealogical_Word_List'},
            {label: 'FamilySearch Research Wiki — Ukraine Church Records', url: 'https://www.familysearch.org/en/wiki/Ukraine_Church_Records'},
            {label: 'Translittération officielle ukrainienne (résolution du Cabinet des ministres n° 55, 2010)', url: 'https://zakon.rada.gov.ua/laws/show/55-2010-%D0%BF'},
        ],
    };
})());
