/* 📜 Aide à la lecture — Danois (kirkebøger luthériennes du Danemark, du Schleswig et, jusqu'en 1814, de la Norvège).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    // ø ne perd pas son trait dans la recherche : on ajoute les formes « o » et « oe » (Søn → Son, Soen)
    const plain = s => [s.replace(/ø/g, 'o').replace(/Ø/g, 'O'), s.replace(/ø/g, 'oe').replace(/Ø/g, 'Oe')];
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: [...(alt || []), ...(/[øØ]/.test(t) ? plain(t) : [])]}));
    /* les nombres danois comptent par vingtaines au-delà de 40 : halvtreds = « la moitié de la troisième vingtaine » = 50 */
    const U = ['', 'en', 'to', 'tre', 'fire', 'fem', 'seks', 'syv', 'otte', 'ni'];
    const T = ['ti', 'elleve', 'tolv', 'tretten', 'fjorten', 'femten', 'seksten', 'sytten', 'atten', 'nitten'];
    const D = {2: 'tyve', 3: 'tredive', 4: 'fyrre', 5: 'halvtreds', 6: 'tres', 7: 'halvfjerds', 8: 'firs', 9: 'halvfems'};
    const DLONG = [['halvtredsindstyve', 5], ['halvfjerdsindstyve', 7], ['halvfemsindstyve', 9], ['tresindstyve', 6], ['firsindstyve', 8], ['fyrretyve', 4],
        ['halvfjerds', 7], ['halvtreds', 5], ['halvfems', 9], ['tredive', 3], ['fyrre', 4], ['tyve', 2], ['tres', 6], ['firs', 8]];
    const below1000 = n => {
        const h = Math.floor(n / 100), r = n % 100; let s = h ? `${h === 1 ? 'et' : U[h]} hundrede` : '';
        if (r) { if (h) s += ' og '; s += r < 10 ? U[r] : r < 20 ? T[r - 10] : `${r % 10 ? `${U[r % 10]}og` : ''}${D[Math.floor(r / 10)]}`; }
        return s;
    };
    /** 1–9999 → mots (1852 = « et tusinde otte hundrede og tooghalvtreds ») */
    const to = n => {
        n = Math.floor(Number(n)); if (!(n >= 1 && n <= 9999)) return '';
        const th = Math.floor(n / 1000), r = n % 1000;
        return th ? `${th === 1 ? 'et' : U[th]} tusinde${r ? (r < 100 ? ' og ' : ' ') + below1000(r) : ''}` : below1000(n);
    };
    const UNIT = w => (w === 'et' || w === 'en' ? 1 : U.indexOf(w));
    const tail = s => { // 1–99
        if (!s) return 0;
        const ti = T.indexOf(s); if (ti >= 0) return 10 + ti;
        const ui = U.indexOf(s); if (ui > 0) return ui;
        const m = s.match(/^(?:(en|et|to|tre|fire|fem|seks|syv|otte|ni)og)?(.+)$/); if (!m) return null;
        const d = DLONG.find(([w]) => w === m[2]); if (!d) return null;
        return d[1] * 10 + (m[1] ? UNIT(m[1]) : 0);
    };
    /** mots → nombre ; aussi les années dites « atten hundrede og tooghalvtreds » (1852) ; null si on ne comprend pas */
    const from = str => {
        let s = String(str || '').toLowerCase().replace(/[\s-]+/g, ''), n = 0;
        const tm = s.match(/^(et|en|to|tre|fire|fem|seks|syv|otte|ni)?tusinde(og)?/);
        if (tm) { n += 1000 * (tm[1] ? UNIT(tm[1]) : 1); s = s.slice(tm[0].length); }
        const hm = s.match(/^(elleve|tolv|tretten|fjorten|femten|seksten|sytten|atten|nitten|et|en|to|tre|fire|fem|seks|syv|otte|ni)?hundrede(og)?/);
        if (hm) { const w = hm[1]; n += 100 * (!w ? 1 : T.includes(w) ? 10 + T.indexOf(w) : UNIT(w)); s = s.slice(hm[0].length); }
        if (!s) return n || null;
        const t = tail(s); return t == null ? null : n + t;
    };
    return {
        code: 'da', name: 'Danois', native: 'Dansk', icon: '🇩🇰', script: 'latine', dir: 'ltr', ocr: ['dan'],
        intro: 'Registres paroissiaux luthériens (kirkebøger) du Danemark depuis le XVIIe siècle, du Schleswig, et de la Norvège jusqu’en 1814 (écrits en danois). Écriture gothique (comme la Kurrent allemande) jusque vers 1875, noms communs avec une majuscule, « aa » pour å jusqu’en 1948, mois souvent en latin. Les nombres comptent par vingtaines : halvtreds = 50.',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['født, fødte', 'né, née ; « Fødte » = les naissances'],
                ['døbt, døbte', 'baptisé ; « Døbte » = les baptêmes'], ['daab, dåb', 'baptême'],
                ['hjemmedøbt, hjemmedøbte', 'baptisé à la maison (ondoyé), souvent parce que l’enfant était faible'],
                ['fremstillet i Kirken, fremst.', 'présenté à l’église (le baptême à la maison est confirmé à l’église)'],
                ['Faddere, Fadderne, Vidner', 'parrains et marraines, témoins'], ['baaret af', 'porté (au baptême) par : la marraine qui tenait l’enfant'],
                ['ægte', 'légitime'], ['uægte', 'illégitime, né hors mariage'], ['udlagt Barnefader', 'père désigné (d’un enfant illégitime)'],
                ['Tvillinger', 'jumeaux'], ['dødfødt', 'mort-né'], ['Barn', 'enfant'], ['Dreng, Drengebørn', 'garçon, garçons'], ['Pige, Pigebørn', 'fille, filles'],
                ['Jordemoder', 'sage-femme'], ['introduceret, Kirkegang', 'relevailles : la mère revient à l’église après la naissance'],
                ['konfirmeret, Konfirmation', 'confirmé, confirmation (vers 14-15 ans)'],
            ]),
            ...R('mot', 'mariage', [
                ['viet, Viede, Vielse', 'marié ; « Viede » = les mariages ; la cérémonie'],
                ['copuleret, copulerede', 'mariés (mot latin des registres)'], ['trolovet, Trolovelse', 'fiancé, fiançailles'],
                ['Forlovere', 'témoins garants du mariage (deux hommes qui garantissent qu’il n’y a pas d’empêchement)'],
                ['lyst, Lysning', 'les bans publiés'], ['Brudgom', 'le marié'], ['Brud', 'la mariée'],
                ['Ungkarl', 'garçon, jamais marié'], ['Pige, Pigen', 'jeune fille, jamais mariée'], ['Enkemand', 'veuf'], ['Enke', 'veuve'],
                ['Hustru', 'épouse'], ['Ægtefolk', 'les époux'], ['Kongebrev', 'permission du roi (se marier sans bans, à la maison…)'],
            ]),
            ...R('mot', 'sepulture', [
                ['død, døde', 'mort ; « Døde » = les décès'], ['begravet, begraven, jordet', 'enterré'], ['Begravelse', 'enterrement'],
                ['Kirkegaard, Kirkegård', 'cimetière'], ['Dødsaarsag', 'cause de la mort'], ['Alderdom', 'vieillesse'],
                ['Brystsyge', 'maladie de poitrine'], ['Tæring', 'consomption (souvent la tuberculose)'], ['Kopper', 'variole'], ['Mæslinger', 'rougeole'],
                ['Barselseng', 'couches (la mère meurt de l’accouchement)'], ['druknet', 'noyé'], ['Slag', 'attaque, apoplexie'],
                ['salig, sal.', 'feu, défunt (« sal. Hans Jensen »)'], ['gammel, gl.', 'âgé de', '« 72 Aar gammel »'],
            ]),
            ...R('mot', 'general', [
                ['Kirkebog', 'registre paroissial'], ['Folketælling', 'recensement'], ['Sogn', 'paroisse'], ['Herred', 'canton'], ['Amt', 'département (comté)'],
                ['By, Byen', 'village, le village'], ['Gaard, Gård', 'ferme'], ['Hus', 'maison (petite, sans grande terre)'], ['Mark', 'champ'],
                ['af', 'de (« af Lunde » = de Lunde)'], ['og', 'et'], ['i', 'à, dans'], ['d., den', 'le (devant une date)'],
                ['tilgang, afgang', 'arrivés, partis (listes de la paroisse)'], ['Sognepræst, Præst', 'pasteur de la paroisse'], ['Degn', 'sacristain et chantre (souvent maître d’école)'],
            ]),
            ...R('parente', 'general', [
                ['Fader, Far', 'père'], ['Moder, Mor', 'mère'], ['Forældre', 'parents'], ['Søn', 'fils'], ['Datter, Daatter', 'fille'], ['Broder, Bror', 'frère'], ['Søster', 'sœur'],
                ['Farfader, Farfar', 'grand-père paternel'], ['Morfader, Morfar', 'grand-père maternel'], ['Farmoder, Farmor', 'grand-mère paternelle'], ['Mormoder, Mormor', 'grand-mère maternelle'],
                ['Farbroder, Farbror', 'oncle paternel'], ['Morbroder, Morbror', 'oncle maternel'], ['Faster', 'tante paternelle'], ['Moster', 'tante maternelle'],
                ['Barnebarn', 'petit-enfant'], ['Fætter', 'cousin'], ['Kusine', 'cousine'], ['Svigerfader, Svigerfar', 'beau-père (père du conjoint)'], ['Svigermoder, Svigermor', 'belle-mère'],
                ['Svigersøn', 'gendre'], ['Svigerdatter', 'belle-fille (épouse du fils)'], ['Svoger', 'beau-frère'], ['Svigerinde', 'belle-sœur'],
                ['Stedfader, Stedmoder', 'beau-père, belle-mère (second mari, seconde femme)'], ['Stedsøn, Steddatter', 'beau-fils, belle-fille'], ['Plejebarn', 'enfant placé'], ['Formynder, Værge', 'tuteur'],
                ['-sen, -datter', 'patronyme : « fils de », « fille de » (Hans Pedersen = fils de Peder ; Karen Hansdatter = fille de Hans), jusque vers 1850-1900'],
            ]),
            ...R('mois', 'general', [
                ['Januar, Januarii', 'janvier'], ['Februar, Februarii', 'février'], ['Marts, Martii', 'mars'], ['April, Aprilis', 'avril'], ['Maj, Maji', 'mai'], ['Juni, Junii', 'juin'],
                ['Juli, Julii', 'juillet'], ['August, Augusti', 'août'], ['September, Septbr., 7br.', 'septembre'], ['Oktober, October, Octbr., 8br.', 'octobre'],
                ['November, Novbr., 9br.', 'novembre'], ['December, Decbr., Xbr.', 'décembre'],
                ['Glugmaaned', 'janvier (ancien nom danois, rare dans les registres)'], ['Blidemaaned', 'février (ancien nom)'], ['Tormaaned', 'mars (ancien nom)'], ['Faaremaaned', 'avril (ancien nom)'],
                ['Skjærsommer, Skærsommer', 'juin (ancien nom)'], ['Ormemaaned', 'juillet (ancien nom)'], ['Høstmaaned', 'août (ancien nom)'], ['Fiskemaaned', 'septembre (ancien nom)'],
                ['Sædemaaned', 'octobre (ancien nom)'], ['Slagtemaaned', 'novembre (ancien nom)'], ['Julemaaned', 'décembre (ancien nom)'],
                ['Maaned, Måned', 'mois'], ['Uge', 'semaine'], ['Dag', 'jour'], ['Søndag', 'dimanche'],
                ['Dom. 3 p. Trin., 3 S. e. Trin.', 'le 3e dimanche après la Trinité (date donnée par les fêtes de l’Église : compte depuis Pâques)'],
            ]),
            ...R('nombre', 'general', [
                ['en, et', 'un'], ['to', 'deux'], ['tre', 'trois'], ['fire', 'quatre'], ['fem', 'cinq'], ['seks, sex', 'six'], ['syv', 'sept'], ['otte', 'huit'], ['ni', 'neuf'], ['ti', 'dix'],
                ['elleve', 'onze'], ['tolv', 'douze'], ['tyve', 'vingt'], ['tredive', 'trente'], ['fyrretyve, fyrre', 'quarante'],
                ['halvtredsindstyve, halvtreds', 'cinquante (deux vingtaines et demie)'], ['tresindstyve, tres', 'soixante (trois vingtaines)'],
                ['halvfjerdsindstyve, halvfjerds', 'soixante-dix (trois vingtaines et demie)'], ['firsindstyve, firs', 'quatre-vingts (quatre vingtaines)'],
                ['halvfemsindstyve, halvfems', 'quatre-vingt-dix (quatre vingtaines et demie)'], ['hundrede', 'cent'], ['tusinde', 'mille'],
                ['enogtyve, toogtredive', 'vingt et un, trente-deux : l’unité vient d’abord (« un et vingt »)'],
                ['Aar, År', 'an, ans', '« 72 Aar gammel » = âgé de 72 ans'], ['Maaneder, Uger, Dage', 'mois, semaines, jours'],
            ]),
            ...R('metier', 'general', [
                ['Gaardmand, Gårdmand', 'fermier d’une ferme (gaard)'], ['Selvejer', 'paysan propriétaire de sa ferme'], ['Fæster', 'fermier à bail (fæste) sur la terre d’un seigneur'],
                ['Husmand', 'petit paysan : une maison avec peu ou pas de terre'], ['Inderste, Indsidder', 'logé chez un autre, sans maison à soi'], ['Daglejer', 'journalier'],
                ['Tjenestekarl, Karl', 'valet de ferme'], ['Tjenestepige', 'servante'], ['Smed', 'forgeron'], ['Møller', 'meunier'], ['Skrædder', 'tailleur'], ['Skomager', 'cordonnier'],
                ['Tømrer', 'charpentier'], ['Snedker', 'menuisier'], ['Væver', 'tisserand'], ['Fisker', 'pêcheur'], ['Skolelærer, Skoleholder', 'instituteur'],
                ['Kromand', 'aubergiste'], ['Soldat', 'soldat'], ['Ladefoged', 'régisseur d’un domaine'], ['Hjulmand', 'charron'], ['Bødker', 'tonnelier'], ['Murer', 'maçon'],
            ]),
            ...R('abrev', 'general', [
                ['d.', 'den : le (devant une date) ; ou død : mort'], ['f.', 'født : né'], ['sal.', 'salig : feu, défunt'], ['gl.', 'gammel : âgé de'],
                ['aa', 'å (avant 1948 : « Aar » = år, « Gaard » = gård)'],
            ]),
            ...R('formule', 'bapteme', [
                ['hjemmedøbt og fremstillet i Kirken', 'baptisé à la maison puis présenté à l’église'],
                ['Gaardmand … og Hustru …s Søn', 'le fils du fermier … et de sa femme …'],
                ['Barnet blev baaret af …', 'l’enfant fut porté par … (la marraine)'],
            ]),
            ...R('formule', 'mariage', [
                ['Forlovere: …', 'témoins garants : …'], ['efter Lysning af Prædikestolen', 'après les bans publiés en chaire'],
            ]),
            ...R('formule', 'sepulture', [
                ['død d. … begravet d. …', 'mort le …, enterré le …'], ['… Aar gammel', 'âgé de … ans'],
            ]),
            ...R('formule', 'general', [
                ['Dom. … p. Trin.', 'tel dimanche après la Trinité : beaucoup de dates sont données par les dimanches de l’année religieuse'],
            ]),
        ],
        glyphs: {
            da_e: ['M10 44 L13 30 L16 44', 'M16 44 L19 30 L22 44'],
            da_n: ['M8 44 L12 30 L17 44', 'M17 44 L21 30 L26 44'],
            da_oslash: ['M19 30 C11 30 11 46 19 46 C27 46 27 30 19 30', 'M10 50 L28 26'],
            da_aa: ['M17 34 C14 29 8 31 8 38 C8 45 15 46 17 40', 'M17 32 L17 46', 'M31 34 C28 29 22 31 22 38 C22 45 29 46 31 40', 'M31 32 L31 46'],
        },
        widths: {da_aa: 38},
        letters: [
            {id: 'da_e', name: 'e gothique', seen: ['da_e'], read: 'e', cmp: ['da_n'], note: 'Dans l’écriture gothique des kirkebøger (jusque vers 1875), le e ressemble à un petit n pointu, comme dans la Kurrent allemande.', keys: 'gothique e n kurrent danois'},
            {id: 'da_aa', name: 'aa = å', seen: ['da_aa'], read: 'å', cmp: [], note: 'Jusqu’en 1948, å s’écrivait « aa » : « Aar » = år, « Gaard » = gård, « Daab » = dåb. Cherche les deux formes.', keys: 'aa a rond orthographe 1948'},
            {id: 'da_oslash', name: 'ø (o barré)', seen: ['da_oslash'], read: 'ø', cmp: ['o'], note: 'Le trait est parfois un petit tréma (ö) ou oublié. La recherche accepte « o » et « oe » : tape « son » ou « soen » pour « Søn ».', keys: 'o barre oe tréma'},
        ],
        exercises: [
            {id: 'da_daab1802', icon: '👶', title: 'Un baptême de 1802', level: 'moyen', acte: 'bapteme', year: 1802,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). L’enfant, baptisé à la maison, est ensuite présenté à l’église ; « aa » = å.',
                src: 'Den 7 Februarii=Februarii|februar hjemmedøbt=hjemmedøbt|hjemmedobt og d.=den 21 Martii=Martii|marts fremstillet i Kirken Gaardmand=Gaardmand|Gårdmand Niels Pedersens og Hustru Karen Hansdatters Søn=Søn|Son af Lunde kaldet Hans Faddere Peder Jensen og Ane Nielsdatter',
                notes: {Gaardmand: 'aa = å : Gaardmand = gårdmand, fermier', 'Søn': 'Søn = fils', kaldet: 'kaldet = appelé (le prénom donné)'}},
        ],
        numerals: {label: 'Nombres danois (par vingtaines)', to, from, examples: ['halvtredsindstyve', 'atten hundrede og tooghalvtreds', '1852']},
        sources: [
            {label: 'FamilySearch Research Wiki — Danish Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Danish_Genealogical_Word_List'},
            {label: 'FamilySearch Research Wiki — Denmark Church Records', url: 'https://www.familysearch.org/en/wiki/Denmark_Church_Records'},
            {label: 'Rigsarkivet (Archives nationales du Danemark) — Arkivalieronline', url: 'https://www.sa.dk/ao-soegesider/da/other/index'},
        ],
    };
})());
