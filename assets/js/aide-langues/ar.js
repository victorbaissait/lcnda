/* 📜 Aide à la lecture — Arabe (surtout les tombes et les documents : actes d’état civil et papiers d’Algérie, du Maroc, de Tunisie,
 * du Liban, de Syrie, d’Égypte ; formules, chiffres, mois de l’hégire). En plus du format commun : `alphabet` et `numerals` (abjad).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    /** sans voyelles brèves ni tatwil, alif à hamza = alif, ة = ه, ى = ي : la forme qu'on tape le plus souvent */
    const plainAr = s => String(s || '').normalize('NFC').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
    /* la prononciation en lettres latines (l'arabe s'écrit sans voyelles : on les donne ici pour chercher « marhoum », « rajab ») */
    const LAT = {
        'بسم الله الرحمن الرحيم': ['bismillah', 'bismi llahi rrahmani rrahim', 'basmala'], 'هذا قبر': ['hadha qabr', 'hada kabr'], 'هذا ضريح': ['hadha darih'],
        'المرحوم, المرحومة': ['al marhoum', 'el marhoum', 'almarhum', 'al marhouma', 'marhoum'], 'المغفور له, المغفور لها': ['al maghfour lahou', 'el maghfour lah'],
        'توفي, توفيت': ['tuwuffiya', 'touwouffiya', 'toufi'], 'انتقل إلى رحمة الله': ['intaqala ila rahmati llah'], 'رحمه الله, رحمها الله': ['rahimahou llah', 'rahimahullah'],
        'كل من عليها فان': ['kullu man alayha fan'], 'إنا لله وإنا إليه راجعون': ['inna lillahi wa inna ilayhi raji oun'], 'الفاتحة': ['al fatiha', 'fatiha'],
        'يا أيتها النفس المطمئنة': ['ya ayyatuha n nafs al moutma inna'], 'وفاة': ['wafat', 'wafa'], 'قبر': ['qabr', 'kabr'], 'مقبرة': ['maqbara', 'makbara'],
        'ولد, ولدت': ['wulida', 'oulida'], 'زواج': ['zawaj', 'zouaj'], 'عقد الزواج, عقد القران': ['aqd az zawaj', 'aqd al qiran'], 'الصداق, المهر': ['sadaq', 'mahr'],
        'ابن, بن': ['ibn', 'ben', 'bin'], 'بنت, ابنة': ['bint', 'bent'], 'أبو': ['abou', 'abu'], 'أم': ['oum', 'umm'], 'ولد (nom)': ['ould', 'walad'], 'آيت': ['ait', 'aït'],
        'الحاج, الحاجة': ['el hadj', 'al hajj', 'hadj', 'hadja'], 'السيد, سيدي': ['sayyid', 'sidi', 'si'], 'الشيخ': ['cheikh', 'sheikh', 'chikh'], 'لالة': ['lalla'],
        'محرم': ['mouharram', 'muharram'], 'صفر': ['safar'], 'ربيع الأول': ['rabi al awwal', 'rabia el ouel'], 'ربيع الثاني, ربيع الآخر': ['rabi al thani', 'rabi al akhir'],
        'جمادى الأولى': ['joumada al oula', 'jumada al ula'], 'جمادى الثانية, جمادى الآخرة': ['joumada al thania', 'jumada al akhira'], 'رجب': ['rajab', 'radjab'], 'شعبان': ['chaabane', 'shaaban'],
        'رمضان': ['ramadan', 'ramadhan'], 'شوال': ['chawwal', 'shawwal'], 'ذو القعدة': ['dhou al qiada', 'dhu al qadah'], 'ذو الحجة': ['dhou al hijja', 'dhu al hijjah'],
        'سنة': ['sana', 'sanat'], 'عام': ['am', 'aam'], 'هـ': ['h', 'hegire'], 'م': ['m'], 'الموافق': ['al mouwafiq', 'al muwafiq'],
        'فلاح': ['fellah', 'fallah'], 'تاجر': ['tajer', 'tajir'], 'خماس': ['khammes', 'khammas'], 'عدل': ['adel', 'adl'], 'قاضي, قاض': ['cadi', 'qadi'], 'إمام': ['imam'],
    };
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => {
        const plain = t.split(/\s*,\s*/).map(plainAr).filter(x => x && !t.includes(x));
        return {t, d, k, a, ex: ex || '', alt: [...(alt || []), ...plain, ...(LAT[t] || [])]};
    });
    /* ── Lettres latines des consonnes (à la française, à l'anglaise) ── */
    const TR = {'ا': ['a', 'a'], 'أ': ['a', 'a'], 'إ': ['i', 'i'], 'آ': ['a', 'a'], 'ء': ['', ''], 'ؤ': ['ou', 'u'], 'ئ': ['i', 'i'], 'ب': ['b', 'b'], 'ت': ['t', 't'], 'ث': ['th', 'th'],
        'ج': ['dj', 'j'], 'ح': ['h', 'h'], 'خ': ['kh', 'kh'], 'د': ['d', 'd'], 'ذ': ['dh', 'dh'], 'ر': ['r', 'r'], 'ز': ['z', 'z'], 'س': ['s', 's'], 'ش': ['ch', 'sh'], 'ص': ['s', 's'],
        'ض': ['d', 'd'], 'ط': ['t', 't'], 'ظ': ['z', 'z'], 'ع': ['', ''], 'غ': ['gh', 'gh'], 'ف': ['f', 'f'], 'ق': ['k', 'q'], 'ك': ['k', 'k'], 'ل': ['l', 'l'], 'م': ['m', 'm'],
        'ن': ['n', 'n'], 'ه': ['h', 'h'], 'ة': ['a', 'a'], 'و': ['ou', 'w'], 'ي': ['i', 'y'], 'ى': ['a', 'a'], 'پ': ['p', 'p'], 'چ': ['tch', 'ch'], 'ڤ': ['v', 'v'], 'گ': ['g', 'g']};
    const DIG = {'٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9, '۰': 0, '۱': 1, '۲': 2, '۳': 3, '۴': 4, '۵': 5, '۶': 6, '۷': 7, '۸': 8, '۹': 9};
    /* les mots dont on connaît la prononciation : elle passe en premier (c'est elle qu'on voit sous le mot) */
    const KEY = w => String(w || '').normalize('NFC').replace(/[\u064b-\u065f\u0670\u0640.]/g, '').replace(/[أإآٱ]/g, 'ا');
    const KNOWN = {};
    Object.entries(LAT).forEach(([t, lat]) => t.split(/\s*,\s*/).forEach((part, i) => {
        const ws = part.split(' '), same = x => x && x.split(' ').length === ws.length;
        const v = same(lat[i]) ? lat[i] : lat.find(same) || lat[Math.min(i, lat.length - 1)]; if (!v) return; const vs = v.split(' ');
        if (ws.length === vs.length) ws.forEach((w, j) => { const k = KEY(w); if (k && !KNOWN[k]) KNOWN[k] = vs[j]; });
        else if (ws.length === 1 && !KNOWN[KEY(part)]) KNOWN[KEY(part)] = v.replace(/ /g, '-');
    }));
    const translit = word => {
        const w = String(word || '').normalize('NFC').replace(/[ً-ٰٟـ]/g, '');
        if (!/[ؠ-ۿ]/.test(w)) return [];
        if ([...w].every(c => c in DIG)) return [[...w].map(c => DIG[c]).join('')];
        const kn = KNOWN[KEY(word)];
        return [...new Set([...(kn ? [kn] : []), ...[0, 1].map(v => [...w].map((c, i) => (c === 'ا' && w[i + 1] === 'ل' && i === 0 ? (v ? 'a' : 'e') : TR[c] ? TR[c][v] : /[a-z0-9]/i.test(c) ? c : '')).join(''))].filter(Boolean))];
    };
    /* ── Abjad (valeurs d'Orient) : أ = 1 … غ = 1000 ; et les chiffres ٠١٢٣٤٥٦٧٨٩ ── */
    const AB = [['ا', 1], ['ب', 2], ['ج', 3], ['د', 4], ['ه', 5], ['و', 6], ['ز', 7], ['ح', 8], ['ط', 9], ['ي', 10], ['ك', 20], ['ل', 30], ['م', 40], ['ن', 50], ['س', 60], ['ع', 70],
        ['ف', 80], ['ص', 90], ['ق', 100], ['ر', 200], ['ش', 300], ['ت', 400], ['ث', 500], ['خ', 600], ['ذ', 700], ['ض', 800], ['ظ', 900], ['غ', 1000]];
    const VAL = Object.fromEntries(AB); Object.assign(VAL, {'أ': 1, 'إ': 1, 'آ': 1});
    const LET = Object.fromEntries(AB.map(([c, v]) => [v, c]));
    function toAbjad(n) {
        n = Math.floor(Number(n)); if (!(n > 0 && n < 2000)) return '';
        let s = n >= 1000 ? 'غ' : ''; const r = n % 1000;
        [100, 10, 1].forEach(k => { const d = Math.floor(r / k) % 10; if (d) s += LET[d * k]; });
        return s;
    }
    function fromAbjad(s) {
        const t = String(s || '').normalize('NFC').replace(/[\sً-ٟـ.]/g, ''); if (!t) return null;
        if ([...t].every(c => c in DIG)) return Number([...t].map(c => DIG[c]).join(''));
        let sum = 0; for (const c of t) { if (!(c in VAL)) return null; sum += VAL[c]; } return sum || null;
    }
    /* dans un texte français, chaque morceau en écriture de droite à gauche est isolé (U+2068 … U+2069) : l'ordre des mots reste juste */
    const RTL_RUN = /[֐-׿؀-ۿיִ-ﭏ](?:[֐-׿؀-ۿיִ-ﭏً-ٟـ "'״׳]*[֐-׿؀-ۿיִ-ﭏ])?/g;
    const iso = s => (typeof s === 'string' ? s.replace(/[⁨⁩]/g, '').replace(RTL_RUN, m => `⁨${m}⁩`) : s);
    const bidi = def => {
        def.intro = iso(def.intro);
        def.entries.forEach(e => { e.d = iso(e.d); e.ex = iso(e.ex); });
        (def.letters || []).forEach(l => { l.name = iso(l.name); l.read = iso(l.read); l.note = iso(l.note); });
        (def.exercises || []).forEach(x => { x.tip = iso(x.tip); x.title = iso(x.title); Object.keys(x.notes || {}).forEach(k => { x.notes[k] = iso(x.notes[k]); }); });
        (def.alphabet || []).forEach(a => { a.latin = iso(a.latin); });
        if (def.numerals) def.numerals.label = iso(def.numerals.label);
        return def;
    };
    return bidi({
        code: 'ar', name: 'Arabe', native: 'العربية', icon: '🌙', script: 'arabe', dir: 'rtl', ocr: ['ara'],
        intro: 'Surtout les tombes et les documents (Algérie, Maroc, Tunisie, Liban, Syrie, Égypte…) : formules religieuses, noms « fils de », dates de l’hégire. L’arabe s’écrit de droite à gauche, sans voyelles, mais ses chiffres (١٢٣) se lisent de gauche à droite. Année de l’hégire → la nôtre : ≈ H − H/33 + 622 (1300 H ≈ 1882-1883).',
        translit,
        alphabet: [
            ['ا', 'ـا', 'alif', 'a', 1], ['ب', 'ـبـ', 'ba', 'b', 2], ['ت', 'ـتـ', 'ta', 't', 400], ['ث', 'ـثـ', 'tha', 'th', 500], ['ج', 'ـجـ', 'jim', 'dj, j', 3],
            ['ح', 'ـحـ', 'ha', 'h (fort)', 8], ['خ', 'ـخـ', 'kha', 'kh', 600], ['د', 'ـد', 'dal', 'd', 4], ['ذ', 'ـذ', 'dhal', 'dh', 700], ['ر', 'ـر', 'ra', 'r', 200],
            ['ز', 'ـز', 'zay', 'z', 7], ['س', 'ـسـ', 'sin', 's', 60], ['ش', 'ـشـ', 'chin', 'ch', 300], ['ص', 'ـصـ', 'sad', 's (fort)', 90], ['ض', 'ـضـ', 'dad', 'd (fort)', 800],
            ['ط', 'ـطـ', 'ta', 't (fort)', 9], ['ظ', 'ـظـ', 'dha', 'z (fort)', 900], ['ع', 'ـعـ', 'ayn', '’ (gorge)', 70], ['غ', 'ـغـ', 'ghayn', 'gh (r grasseyé)', 1000],
            ['ف', 'ـفـ', 'fa', 'f', 80], ['ق', 'ـقـ', 'qaf', 'q, k', 100], ['ك', 'ـكـ', 'kaf', 'k', 20], ['ل', 'ـلـ', 'lam', 'l', 30], ['م', 'ـمـ', 'mim', 'm', 40],
            ['ن', 'ـنـ', 'noun', 'n', 50], ['ه', 'ـهـ', 'ha', 'h', 5], ['و', 'ـو', 'waw', 'w, ou', 6], ['ي', 'ـيـ', 'ya', 'y, i', 10],
        ].map(([big, small, name, latin, value]) => ({big, small, name, latin, value})),
        entries: [
            ...R('formule', 'deces', [
                ['بسم الله الرحمن الرحيم', 'Au nom de Dieu, le Tout Miséricordieux, le Très Miséricordieux (en tête des tombes et des actes)'],
                ['هذا قبر', 'Ceci est la tombe de …'], ['هذا ضريح', 'Ceci est le mausolée de …'],
                ['المرحوم, المرحومة', 'le défunt, la défunte (« celui à qui Dieu a fait miséricorde »)'], ['المغفور له, المغفور لها', 'le défunt, la défunte (« celui qui a reçu le pardon »)'],
                ['توفي, توفيت', 'est décédé, est décédée'], ['انتقل إلى رحمة الله', 'est passé à la miséricorde de Dieu (est mort)'], ['رحمه الله, رحمها الله', 'que Dieu lui fasse miséricorde'],
                ['كل من عليها فان', '« Tout ce qui est sur la terre est périssable » (Coran 55, 26)'], ['إنا لله وإنا إليه راجعون', '« Nous sommes à Dieu et à Lui nous retournons » (Coran 2, 156)'],
                ['يا أيتها النفس المطمئنة', '« Ô toi, âme apaisée » (Coran 89, 27)'], ['الفاتحة', 'la Fatiha : « récitez la Fatiha » pour le défunt'],
                ['عن عمر يناهز', 'à l’âge d’environ …'],
            ]),
            ...R('mot', 'bapteme', [
                ['ولد, ولدت', 'est né, est née'], ['المولود, المولودة', 'né, née (le, la)'], ['تاريخ الولادة, تاريخ الميلاد', 'date de naissance'], ['مكان الولادة', 'lieu de naissance'],
            ]),
            ...R('mot', 'mariage', [
                ['زواج', 'mariage'], ['عقد الزواج, عقد القران', 'contrat de mariage'], ['الزوج', 'l’époux'], ['الزوجة', 'l’épouse'], ['عريس, عروس', 'le marié, la mariée'],
                ['شاهد, شهود', 'témoin, témoins'], ['الصداق, المهر', 'la dot versée à l’épouse (« sadaq » au Maghreb)'], ['طلاق', 'divorce'],
            ]),
            ...R('mot', 'deces', [
                ['وفاة', 'décès'], ['قبر', 'tombe'], ['مقبرة', 'cimetière'], ['دفن', 'enterré ; l’enterrement'], ['جنازة', 'les funérailles'],
            ]),
            ...R('mot', 'general', [
                ['الحاج, الحاجة', 'el-hadj, el-hadja : qui a fait le pèlerinage à La Mecque'], ['السيد, سيدي', 'Monsieur (« Sidi », « Si » au Maghreb)'], ['الشيخ', 'le cheikh : l’ancien, le chef, le maître'],
                ['الشريف, الشريفة', 'descendant(e) du Prophète'], ['لالة', 'Lalla : titre de respect pour une femme (Maghreb)'],
                ['هـ', 'de l’hégire (année musulmane)'], ['م', 'de l’ère chrétienne (année « milâdî »)'], ['الموافق', 'correspondant à (la date dans l’autre calendrier)'],
                ['سنة', 'année (« سنة ١٣٢٠ » = en l’an 1320)'], ['عام', 'année'], ['شهر', 'mois'], ['يوم', 'jour'], ['الحالة المدنية', 'l’état civil'],
                ['الأحد, الاثنين, الثلاثاء', 'dimanche, lundi, mardi'], ['الأربعاء, الخميس, الجمعة, السبت', 'mercredi, jeudi, vendredi, samedi'],
            ]),
            ...R('parente', 'general', [
                ['ابن, بن', 'fils, fils de (« محمد بن أحمد » = Mohamed fils d’Ahmed)'], ['بنت, ابنة', 'fille, fille de'], ['أب, والد', 'père'], ['أم, والدة', 'mère'],
                ['أبو', 'père de (surnom « Abou … » d’après le fils aîné)'], ['أم', 'mère de (« Oum … »)'], ['ولد (nom)', 'Ould : fils de (Mauritanie, Algérie)'], ['آيت', 'Aït : les gens de, la famille de (noms berbères)'],
                ['أخ', 'frère'], ['أخت', 'sœur'], ['جد', 'grand-père'], ['جدة', 'grand-mère'], ['حفيد, حفيدة', 'petit-fils, petite-fille'],
                ['عم, عمة', 'oncle, tante du côté du père'], ['خال, خالة', 'oncle, tante du côté de la mère'], ['زوج', 'mari'], ['زوجة', 'épouse'], ['أرمل, أرملة', 'veuf, veuve'],
            ]),
            ...R('mois', 'general', [
                ['محرم', 'Mouharram : 1er mois de l’hégire'], ['صفر', 'Safar : 2e mois'], ['ربيع الأول', 'Rabi‘ al-awwal : 3e mois'], ['ربيع الثاني, ربيع الآخر', 'Rabi‘ al-thani : 4e mois'],
                ['جمادى الأولى', 'Joumada al-oula : 5e mois'], ['جمادى الثانية, جمادى الآخرة', 'Joumada al-akhira : 6e mois'], ['رجب', 'Rajab : 7e mois'], ['شعبان', 'Cha‘bane : 8e mois'],
                ['رمضان', 'Ramadan : 9e mois'], ['شوال', 'Chawwal : 10e mois'], ['ذو القعدة', 'Dhou al-qi‘da : 11e mois'], ['ذو الحجة', 'Dhou al-hijja : 12e mois (pèlerinage)'],
                ['كانون الثاني, شباط, آذار, نيسان', 'janvier, février, mars, avril (Liban, Syrie, Irak)'], ['أيار, حزيران, تموز, آب', 'mai, juin, juillet, août (Liban, Syrie, Irak)'],
                ['أيلول, تشرين الأول, تشرين الثاني, كانون الأول', 'septembre, octobre, novembre, décembre (Liban, Syrie, Irak)'],
                ['جانفي, فيفري, مارس, أفريل', 'janvier, février, mars, avril (Algérie, Tunisie)'], ['ماي, جوان, جويلية, أوت', 'mai, juin, juillet, août (Algérie, Tunisie)'],
                ['سبتمبر, أكتوبر, نوفمبر, ديسمبر', 'septembre, octobre, novembre, décembre'], ['يناير, فبراير, أبريل', 'janvier, février, avril (Égypte, Maroc)'],
                ['يوليوز, غشت, شتنبر, نونبر, دجنبر', 'juillet, août, septembre, novembre, décembre (Maroc)'],
            ]),
            ...R('nombre', 'general', [
                ['٠ ١ ٢ ٣ ٤', '0 1 2 3 4 (chiffres d’Orient ; on les lit de gauche à droite)'], ['٥ ٦ ٧ ٨ ٩', '5 6 7 8 9 (٥ = 5 ressemble à un 0 ; ٠ = 0 est un point)'], ['۴ ۵ ۶', '4 5 6 (forme persane et ottomane)'],
                ['واحد', 'un'], ['اثنان, اثنين', 'deux'], ['ثلاثة', 'trois'], ['أربعة', 'quatre'], ['خمسة', 'cinq'], ['ستة', 'six'], ['سبعة', 'sept'], ['ثمانية', 'huit'], ['تسعة', 'neuf'], ['عشرة', 'dix'],
                ['عشرون, عشرين', 'vingt'], ['ثلاثون, ثلاثين', 'trente'], ['أربعون, أربعين', 'quarante'], ['خمسون, خمسين', 'cinquante'], ['ستون, ستين', 'soixante'], ['سبعون, سبعين', 'soixante-dix'],
                ['ثمانون, ثمانين', 'quatre-vingts'], ['تسعون, تسعين', 'quatre-vingt-dix'], ['مائة, مئة', 'cent'], ['ألف', 'mille'], ['سنة, سنوات', 'an, ans (âge)'], ['عمره, عمرها', 'son âge'],
            ]),
            ...R('metier', 'general', [
                ['فلاح', 'paysan, cultivateur (fellah)'], ['خماس', 'khammès : métayer payé au cinquième de la récolte (Maghreb)'], ['تاجر', 'commerçant'], ['نجار', 'menuisier'], ['حداد', 'forgeron'],
                ['خياط', 'tailleur'], ['إسكافي', 'cordonnier'], ['خباز', 'boulanger'], ['جزار', 'boucher'], ['بناء', 'maçon'], ['صياد', 'pêcheur, chasseur'], ['راعي', 'berger'],
                ['إمام', 'imam'], ['قاضي, قاض', 'cadi : juge'], ['عدل', 'adel : notaire, témoin officiel (Maghreb)'], ['معلم', 'maître (artisan ou d’école)'], ['جندي', 'soldat'],
            ]),
        ],
        glyphs: {
            ar_ba: ['M7 36 C9 46 31 46 33 36', 'M20 53 L20 53.5'],
            ar_ta: ['M7 36 C9 46 31 46 33 36', 'M16 27 L16 27.5', 'M24 27 L24 27.5'],
            ar_tha: ['M7 36 C9 46 31 46 33 36', 'M15 29 L15 29.5', 'M25 29 L25 29.5', 'M20 22 L20 22.5'],
            ar_nun: ['M9 32 C7 50 33 50 31 32', 'M20 24 L20 24.5'],
            ar_jim: ['M10 26 L28 26 C14 30 9 40 14 48 C19 55 29 54 33 50', 'M21 40 L21 40.5'],
            ar_ha: ['M10 26 L28 26 C14 30 9 40 14 48 C19 55 29 54 33 50'],
            ar_kha: ['M10 26 L28 26 C14 30 9 40 14 48 C19 55 29 54 33 50', 'M19 17 L19 17.5'],
            ar_d0: ['M20 36 L20 36.5'],
            ar_d5: ['M20 26 C12 26 12 46 20 46 C28 46 28 26 20 26'],
            ar_d7: ['M10 22 L20 46 L30 22'],
            ar_d8: ['M10 46 L20 22 L30 46'],
        },
        widths: {},
        letters: [
            {id: 'ar_points1', name: 'ب ت ث ن : seuls les points changent', seen: ['ar_ba', 'ar_ta', 'ar_tha', 'ar_nun'], read: 'b, t, th, n', cmp: [], note: 'La même forme porte un point dessous (ب = b), deux dessus (ت = t), trois dessus (ث = th) ; ن (n) est plus creux, un point dessus. Sur une pierre usée, compte les points (ou cherche le mot entier).', keys: 'points ba ta tha noun b t th n arabe'},
            {id: 'ar_points2', name: 'ج ح خ', seen: ['ar_jim', 'ar_ha', 'ar_kha'], read: 'dj, h, kh', cmp: [], note: 'Un point dedans : ج (dj) ; aucun : ح (h fort) ; un point dessus : خ (kh).', keys: 'jim ha kha dj h kh points arabe'},
            {id: 'ar_chiffres', name: 'chiffres d’Orient : ٠ ٥ ٧ ٨', seen: ['ar_d0', 'ar_d5', 'ar_d7', 'ar_d8'], read: '0, 5, 7, 8', cmp: [], note: '٠ (un point) = 0 ; ٥ (un rond) = 5 ; ٧ (en V) = 7 ; ٨ (en Λ) = 8. Les nombres se lisent de gauche à droite, même au milieu du texte arabe : ١٣٢٠ = 1320.', keys: 'chiffres orient zero cinq sept huit arabe hindi'},
            {id: 'ar_formes', name: 'une lettre, quatre formes', seen: ['ar_ba'], read: '—', cmp: [], note: 'Chaque lettre change de forme selon sa place : seule, au début, au milieu, à la fin du mot (le tableau 🔤 montre la forme du milieu du mot). Six lettres (ا د ذ ر ز و) ne s’attachent jamais à la suivante.', keys: 'formes initiale mediane finale arabe'},
        ],
        exercises: [
            {id: 'ar_tombe1902', icon: '🪦', title: 'Une tombe de 1320 de l’hégire (1902-1903)', level: 'moyen', acte: 'deces', year: 1902,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). Recopie en lettres arabes (sans les hamzas si tu veux) ou en lettres latines ; les chiffres ١٢ marchent aussi en 12.',
                src: 'بسم=بسم|bismi|bism الله=الله|allah الرحمن=الرحمن|arrahman|alrahman الرحيم=الرحيم|arrahim|alrahim هذا=هذا|hadha|hada قبر=قبر|qabr|kabr المرحوم=المرحوم|almarhum|almarhoum|elmarhoum محمد=محمد|mohamed|muhammad|mohammed بن=بن|ben|bin|ibn أحمد=أحمد|احمد|ahmed|ahmad توفي=توفي|tuwuffiya|toufi ١٢=١٢|12 رجب=رجب|rajab|radjab سنة=سنة|سنه|sana|sanat ١٣٢٠=١٣٢٠|1320 رحمه=رحمه|rahimahu|rahimahou الله=الله|allah',
                notes: {'بسم': 'bismi : « au nom de » (début de la basmala)', 'المرحوم': 'al-marhoum : le défunt', 'بن': 'ben : fils de', 'توفي': 'est décédé', '١٢': '١٢ = 12 (chiffres d’Orient, de gauche à droite)', '١٣٢٠': '١٣٢٠ = 1320 de l’hégire ≈ 1902-1903'}},
        ],
        numerals: {label: 'Abjad (lettres-nombres) et chiffres d’Orient', to: toAbjad, from: fromAbjad, examples: ['غش', '1300', '١٣٢٠']},
        sources: [
            {label: 'FamilySearch Research Wiki — Arabic Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Arabic_Genealogical_Word_List'},
            {label: 'Archives nationales d’outre-mer (ANOM) — état civil d’Algérie', url: 'https://recherche-anom.culture.gouv.fr/'},
            {label: 'Unicode — Arabic (U+0600–U+06FF), chiffres arabes orientaux', url: 'https://www.unicode.org/charts/PDF/U0600.pdf'},
        ],
    });
})());
