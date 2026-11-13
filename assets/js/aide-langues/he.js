/* 📜 Aide à la lecture — Hébreu (tombes juives, registres des communautés, ketoubot ; dates du calendrier hébreu, lettres-nombres).
 * En plus du format commun : `alphabet` et `numerals` (lettres-nombres : א = 1 … ת = 400).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    /* la prononciation usuelle en lettres latines (pour chercher « nifter », « tichri ») */
    const LAT = {'פ״נ': ['po nikbar', 'po nikbara'], 'פ״ט': ['po tamun', 'po temuna'], 'תנצב״ה': ['tehi nishmato tsrura bitsror hahayim'], 'ז״ל': ['zikhrono livrakha', 'zal'],
        'ע״ה': ['alav hashalom', 'aleha hashalom'], 'נפטר, נפטרה, נפ׳': ['nifter', 'niftera', 'niftar', 'nifteret'], 'נקבר, נקברה': ['nikbar', 'nikbara'], 'מצבה': ['matseva', 'matzeva'],
        'נולד, נולדה': ['nolad', 'nolda'], 'ברית מילה': ['brit mila', 'bris'], 'כתובה': ['ketouba', 'ketubah', 'ketuba'], 'חתונה': ['hatouna', 'chasene', 'khasene'], 'חופה': ['houppa', 'chuppah', 'huppa'],
        'תשרי': ['tichri', 'tishri', 'tishrei'], 'חשון, מרחשון': ['heshvan', 'hechvan', 'cheshvan', 'marheshvan'], 'כסלו': ['kislev'], 'טבת': ['tevet', 'teves'], 'שבט': ['chevat', 'shevat', 'shvat'],
        'אדר': ['adar'], 'ניסן': ['nissan', 'nisan'], 'אייר': ['iyar', 'iyyar'], 'סיון, סיוון': ['sivan'], 'תמוז': ['tamouz', 'tammuz', 'tamuz'], 'אב, מנחם אב': ['av', 'menahem av'], 'אלול': ['eloul', 'elul'],
        'הכהן, כ״ץ': ['cohen', 'kohen', 'hakohen', 'katz'], 'הלוי, סג״ל': ['levi', 'halevi', 'segal'], 'הרב': ['rav', 'harav', 'rabbin'], 'החזן': ['hazan', 'hazzan', 'chazan'], 'השוחט': ['shohet', 'shochet'],
        'בן': ['ben'], 'בת': ['bat', 'bas'], 'ר׳': ['reb', 'rabbi'], 'מרת, מ׳': ['marat'], 'יום': ['yom'], 'שנת': ['shnat', 'chnat']};
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => {
        // les mêmes mots tapés sans les signes : « פ"נ » ou « פנ » pour פ״נ
        const plain = t.split(/\s*,\s*/).flatMap(x => [x.replace(/[״]/g, '"').replace(/[׳]/g, "'"), x.replace(/[״׳"'.]/g, '')]).filter(x => x && !t.includes(x));
        return {t, d, k, a, ex: ex || '', alt: [...(alt || []), ...plain, ...(LAT[t] || [])]};
    });
    /* ── Lettres latines : on écrit l'hébreu sans voyelles ; deux lectures des consonnes (moderne, ancienne / ashkénaze) ── */
    const TR = {'א': ['', 'a'], 'ב': ['v', 'b'], 'ג': ['g', 'g'], 'ד': ['d', 'd'], 'ה': ['h', 'h'], 'ו': ['v', 'o'], 'ז': ['z', 'z'], 'ח': ['kh', 'h'], 'ט': ['t', 't'],
        'י': ['y', 'i'], 'כ': ['kh', 'k'], 'ך': ['kh', 'k'], 'ל': ['l', 'l'], 'מ': ['m', 'm'], 'ם': ['m', 'm'], 'נ': ['n', 'n'], 'ן': ['n', 'n'], 'ס': ['s', 's'], 'ע': ['', 'a'],
        'פ': ['f', 'p'], 'ף': ['f', 'f'], 'צ': ['ts', 'tz'], 'ץ': ['ts', 'tz'], 'ק': ['k', 'k'], 'ר': ['r', 'r'], 'ש': ['sh', 's'], 'ת': ['t', 's']};
    /* les mots dont on connaît la prononciation : elle passe en premier (c'est elle qu'on voit sous le mot) */
    const KEY = w => String(w || '').normalize('NFD').replace(/[֑-ׇ׳״"'.]/g, '');
    const KNOWN = {};
    Object.entries(LAT).forEach(([t, lat]) => t.split(/\s*,\s*/).forEach((part, i) => {
        const ws = part.split(' '), same = x => x && x.split(' ').length === ws.length;
        const v = same(lat[i]) ? lat[i] : lat.find(same) || lat[Math.min(i, lat.length - 1)]; if (!v) return; const vs = v.split(' ');
        if (ws.length === vs.length) ws.forEach((w, j) => { const k = KEY(w); if (k && !KNOWN[k]) KNOWN[k] = vs[j]; });
        else if (ws.length === 1 && !KNOWN[KEY(part)]) KNOWN[KEY(part)] = v.replace(/ /g, '-');
    }));
    const translit = word => {
        const w = String(word || '').normalize('NFD').replace(/[֑-ׇ]/g, '');
        if (!/[א-ת]/.test(w)) return [];
        const kn = KNOWN[KEY(word)];
        return [...new Set([...(kn ? [kn] : []), ...[0, 1].map(i => [...w].map(c => (TR[c] ? TR[c][i] : /[a-z0-9]/i.test(c) ? c : '')).join(''))].filter(Boolean))];
    };
    /* ── Lettres-nombres : א = 1 … ט = 9, י = 10 … צ = 90, ק = 100 … ת = 400 ; 15 = ט״ו, 16 = ט״ז ── */
    const U = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'], T = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
    const VAL = {'ך': 20, 'ם': 40, 'ן': 50, 'ף': 80, 'ץ': 90, 'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400};
    U.forEach((c, i) => c && (VAL[c] = i)); T.forEach((c, i) => c && (VAL[c] = i * 10));
    const part = n => { // 1 … 999
        let s = '', h = Math.floor(n / 100); const r = n % 100;
        while (h >= 4) { s += 'ת'; h -= 4; } s += ['', 'ק', 'ר', 'ש'][h];
        if (r === 15) return s + 'טו'; if (r === 16) return s + 'טז';
        return s + T[Math.floor(r / 10)] + U[r % 10];
    };
    const marks = s => (s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1));
    function toHeb(n) {
        n = Math.floor(Number(n)); if (!(n > 0 && n < 10000)) return '';
        const th = Math.floor(n / 1000), rest = n % 1000;
        return (th ? U[th] + '׳' : '') + (rest ? marks(part(rest)) : '');
    }
    function fromHeb(s) {
        const t = String(s || '').normalize('NFD').replace(/[֑-ׇ\s.]/g, '').replace(/["״]/g, '״').replace(/['׳]/g, '׳');
        if (!t || /[^א-ת״׳]/.test(t)) return null;
        let th = 0, body = t;
        if (t.length > 2 && t[1] === '׳' && VAL[t[0]] < 10) { th = VAL[t[0]] * 1000; body = t.slice(2); }
        let sum = 0; for (const c of body.replace(/[״׳]/g, '')) { if (!(c in VAL)) return null; sum += VAL[c]; }
        return th + sum || null;
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
        code: 'he', name: 'Hébreu', native: 'עברית', icon: '✡️', script: 'hebraique', dir: 'rtl', ocr: ['heb'],
        intro: 'Tombes juives (en hébreu presque toujours, même en France), registres des communautés, ketoubot (contrats de mariage), livres de circoncision. L’hébreu s’écrit de droite à gauche, sans voyelles ; les dates suivent le calendrier hébreu et les nombres s’écrivent avec des lettres (onglet 🔢 ci-dessous). Les années omettent souvent les milliers : l’année 5655 (1894-1895) s’écrit seulement 655, en lettres תרנ״ה.',
        translit,
        alphabet: [
            ['א', '', 'alef', '(muet) ou a', 1], ['ב', '', 'beth', 'b, v', 2], ['ג', '', 'guimel', 'g', 3], ['ד', '', 'daleth', 'd', 4], ['ה', '', 'hé', 'h', 5], ['ו', '', 'vav', 'v, o, ou', 6],
            ['ז', '', 'zayin', 'z', 7], ['ח', '', 'heth', 'kh (h rauque)', 8], ['ט', '', 'teth', 't', 9], ['י', '', 'yod', 'y, i', 10], ['כ', 'ך', 'kaf', 'k, kh (ך en fin de mot)', 20],
            ['ל', '', 'lamed', 'l', 30], ['מ', 'ם', 'mem', 'm (ם en fin de mot)', 40], ['נ', 'ן', 'noun', 'n (ן en fin de mot)', 50], ['ס', '', 'samekh', 's', 60], ['ע', '', 'ayin', '(muet) ou a, è', 70],
            ['פ', 'ף', 'pé', 'p, f (ף en fin de mot)', 80], ['צ', 'ץ', 'tsadi', 'ts (ץ en fin de mot)', 90], ['ק', '', 'qof', 'k', 100], ['ר', '', 'resh', 'r', 200], ['ש', '', 'shin', 'ch, s', 300], ['ת', '', 'tav', 't (s chez les Ashkénazes)', 400],
        ].map(([big, small, name, latin, value]) => ({big, small, name, latin, value})),
        entries: [
            ...R('formule', 'deces', [
                ['פ״נ', 'פה נקבר / פה נקברה : ici est enterré(e) (début de la tombe)', '« פ״נ האשה מרת שרה »'], ['פ״ט', 'פה טמון / פה טמונה : ici repose (« est caché »)'],
                ['תנצב״ה', 'תהא נשמתו (נשמתה) צרורה בצרור החיים : que son âme soit liée au faisceau de la vie (fin de la tombe)'],
                ['ז״ל', 'זכרונו (זכרונה) לברכה : que son souvenir soit une bénédiction (après le nom d’un défunt)'], ['זצ״ל', 'souvenir du juste, pour bénédiction (après le nom d’un rabbin, d’un sage)'],
                ['ע״ה', 'עליו (עליה) השלום : que la paix soit sur lui (sur elle)'], ['נ״ע', 'נוחו עדן : son repos est en Éden (après le nom d’un défunt)'],
                ['נפטר, נפטרה, נפ׳', 'est décédé, est décédée'], ['נקבר, נקברה', 'a été enterré(e)'], ['ב״ר', 'בן ר׳ / בת ר׳ : fils de / fille de Monsieur (« reb »)'],
                ['איש תם וישר', 'homme intègre et droit (éloge sur la tombe)'], ['אשת חיל', 'femme vaillante (éloge, d’après les Proverbes)'], ['האשה החשובה', 'la femme respectée (éloge)'],
                ['הבחור', 'le jeune homme (célibataire)'], ['הבתולה', 'la jeune fille (célibataire)'], ['הילד, הילדה', 'l’enfant (garçon, fille)'],
                ['מצבה', 'la pierre tombale'], ['בית עלמין, בית הקברות', 'cimetière'], ['לזכרון עולם', 'en souvenir éternel'],
            ]),
            ...R('mot', 'bapteme', [
                ['נולד, נולדה', 'est né, est née'], ['לידה', 'naissance'], ['ברית מילה', 'la circoncision (le 8e jour)'], ['מוהל', 'celui qui fait la circoncision'],
                ['סנדק', 'le parrain de la circoncision (il tient l’enfant)'], ['ונקרא שמו בישראל', 'et il a reçu le nom en Israël (son nom hébreu)'],
            ]),
            ...R('mot', 'mariage', [
                ['כתובה', 'ketouba : le contrat de mariage'], ['חתונה', 'mariage (la fête)'], ['חתן', 'le marié'], ['כלה', 'la mariée'], ['חופה', 'le dais nuptial ; le mariage'],
                ['עד, עדים', 'témoin, témoins'], ['בתולתא', 'jeune fille (en araméen, dans la ketouba)'], ['ארמלתא', 'veuve (en araméen, dans la ketouba)'],
                ['גט', 'acte de divorce'],
            ]),
            ...R('mot', 'general', [
                ['שם', 'nom ; « ר׳ » devant un nom : Monsieur (reb)'], ['ר׳', 'רבי : Monsieur, Rabbi (titre de respect devant le prénom d’un homme)'], ['מרת, מ׳', 'Madame (devant le prénom d’une femme)'],
                ['הכהן, כ״ץ', 'le Cohen : descendant des prêtres (sur la tombe : deux mains qui bénissent)'], ['הלוי, סג״ל', 'le Lévi : descendant des Lévites (sur la tombe : une cruche)'],
                ['קהלה, ק״ק', 'communauté ; « ק״ק » = sainte communauté (devant un nom de ville)'], ['יום', 'jour (« יום ג׳ » = mardi, 3e jour)'], ['ש״ק', 'שבת קודש : le saint sabbat (samedi)'],
                ['ער״ש', 'ערב שבת : veille du sabbat (vendredi)'], ['לפ״ק', 'לפרט קטן : année écrite sans les milliers (« תרנ״ה לפ״ק » = 5655)'], ['שנת', 'l’année (« בשנת » = en l’an)'],
            ]),
            ...R('parente', 'general', [
                ['בן', 'fils de (« שמעון בן יעקב » = Simon fils de Jacob)'], ['בת', 'fille de'], ['אב, אבי, אבינו', 'père, mon père, notre père'], ['אם, אמי, אמנו', 'mère, ma mère, notre mère'],
                ['אשת', 'épouse de'], ['אלמנת', 'veuve de'], ['בעל, בעלי', 'mari, mon mari'], ['אח, אחות', 'frère, sœur'], ['סבא, סבתא', 'grand-père, grand-mère'], ['נכד, נכדה', 'petit-fils, petite-fille'],
                ['בננו, בתנו', 'notre fils, notre fille (tombe d’un enfant)'],
            ]),
            ...R('mois', 'general', [
                ['תשרי', 'Tichri (septembre-octobre) : 1er mois de l’année (Roch Hachana)'], ['חשון, מרחשון', 'Heshvan (octobre-novembre)'], ['כסלו', 'Kislev (novembre-décembre)'],
                ['טבת', 'Tevet (décembre-janvier)'], ['שבט', 'Chevat (janvier-février)'], ['אדר', 'Adar (février-mars)'], ['אדר א׳, אדר ב׳', 'Adar I, Adar II (les années de 13 mois)'],
                ['ניסן', 'Nissan (mars-avril, Pâque)'], ['אייר', 'Iyar (avril-mai)'], ['סיון, סיוון', 'Sivan (mai-juin)'], ['תמוז', 'Tamouz (juin-juillet)'], ['אב, מנחם אב', 'Av (juillet-août)'], ['אלול', 'Eloul (août-septembre)'],
                ['ר״ח', 'ראש חודש : premier jour du mois (néoménie)'], ['לחודש', 'du mois (« כ״ה לחודש » = le 25 du mois)'],
                ['année hébraïque → la nôtre', 'de Tichri à décembre : année − 3761 ; de janvier à Eloul : année − 3760 (תרנ״ה = 5655 → 1894 ou 1895)'],
            ]),
            ...R('nombre', 'general', [
                ['א׳ … ט׳', '1 à 9 (une lettre suivie de ׳)'], ['י׳, כ׳, ל׳', '10, 20, 30'], ['ט״ו, ט״ז', '15 et 16 (jamais י״ה, י״ו : ce serait le nom de Dieu)'],
                ['כ״ה', '25 (20 + 5)'], ['ק׳, ר׳, ש׳, ת׳', '100, 200, 300, 400'], ['תר״ן', '650'], ['ה׳תש״ה', '5705 (le ה׳ = 5 000) = 1944-1945'],
                ['שנה, שנים', 'an, ans (« בן ע׳ שנה » = âgé de 70 ans)'], ['בן, בת (âge)', 'âgé de, âgée de (« בת ס״ב שנים » = âgée de 62 ans)'],
                ['אחד, שנים, שלש', 'un, deux, trois (en toutes lettres)'], ['ארבע, חמש, שש', 'quatre, cinq, six'], ['שבע, שמונה, תשע, עשר', 'sept, huit, neuf, dix'],
                ['עשרים, שלשים, ארבעים', 'vingt, trente, quarante'], ['מאה, אלף', 'cent, mille'],
            ]),
            ...R('metier', 'general', [
                ['הרב', 'le rabbin'], ['החזן', 'le chantre (hazzan)'], ['השוחט', 'l’abatteur rituel (shohet)'], ['המוהל', 'celui qui fait les circoncisions'],
                ['הגבאי', 'l’administrateur de la synagogue'], ['המלמד', 'le maître d’école (enfants)'], ['הסוחר', 'le marchand'],
            ]),
        ],
        // l'hébreu gravé ou imprimé : les lettres qui se ressemblent (dessins maison)
        glyphs: {
            he_bet: ['M9 22 L27 22 L27 46', 'M7 46 L32 46'],
            he_kaf: ['M9 22 L21 22 C27 22 29 27 29 34 C29 41 27 46 21 46 L9 46'],
            he_dalet: ['M8 22 L31 22', 'M26 22 L26 46'],
            he_resh: ['M8 22 L19 22 C24 22 27 25 27 30 L27 46'],
            he_he: ['M8 22 L28 22 L28 46', 'M12 31 L12 46'],
            he_het: ['M10 46 L10 22 L28 22 L28 46'],
            he_tav: ['M8 22 L28 22 L28 46', 'M13 22 L13 43 C13 47 10 47 7 46'],
            he_vav: ['M15 23 L21 22 L21 46'],
            he_zayin: ['M12 22 L28 22', 'M20 22 L20 46'],
            he_nunf: ['M15 23 L21 22 L21 58'],
            he_samekh: ['M8 22 L23 22 C29 22 30 28 30 34 C30 42 25 46 19 46 C13 46 10 41 10 34 L10 22'],
            he_memf: ['M8 22 L30 22 L30 46 L10 46 Z'],
            he_gersh: ['M14 14 L11 22', 'M22 14 L19 22', 'M28 46 L28 22 L10 22', 'M14 31 L14 46'],
        },
        widths: {},
        letters: [
            {id: 'he_bk', name: 'ב et כ', seen: ['he_bet', 'he_kaf'], read: 'b/v, k/kh', cmp: [], note: 'ב a un coin carré en bas à droite et son trait du bas dépasse ; כ est tout arrondi. Lis toujours de droite à gauche.', keys: 'beth kaf b k hebreu'},
            {id: 'he_dr', name: 'ד et ר', seen: ['he_dalet', 'he_resh'], read: 'd, r', cmp: [], note: 'ד a un coin pointu et un petit bout qui dépasse à droite ; ר a le coin arrondi. Sur une pierre usée, c’est la confusion la plus fréquente.', keys: 'daleth resh d r hebreu'},
            {id: 'he_hht', name: 'ה, ח et ת', seen: ['he_he', 'he_het', 'he_tav'], read: 'h, kh, t', cmp: [], note: 'ה a la jambe gauche détachée du toit ; ח est fermé en haut ; ת a un petit pied à gauche.', keys: 'he heth tav h kh t hebreu'},
            {id: 'he_vzn', name: 'ו, ז et ן', seen: ['he_vav', 'he_zayin', 'he_nunf'], read: 'v/o, z, n final', cmp: [], note: 'ו a une petite tête à gauche ; ז a une tête des deux côtés ; ן (noun de fin de mot) descend sous la ligne.', keys: 'vav zayin noun final v z n hebreu'},
            {id: 'he_sm', name: 'ס et ם', seen: ['he_samekh', 'he_memf'], read: 's, m final', cmp: [], note: 'ס est arrondi en bas ; ם (mem de fin de mot) est carré. Cinq lettres changent de forme à la fin du mot : ך ם ן ף ץ.', keys: 'samekh mem final s m hebreu'},
            {id: 'he_gershayim', name: '״ et ׳ : abréviation ou nombre', seen: ['he_gersh'], read: 'abréviation, nombre', cmp: [], note: 'Deux petits traits (״) avant la dernière lettre : un mot abrégé (פ״נ) ou un nombre (כ״ה = 25). Un seul trait (׳) après une lettre : un nombre (ה׳ = 5) ou un mot coupé (ר׳ = rabbi).', keys: 'gershayim geresh guillemets abreviation nombre'},
        ],
        exercises: [
            {id: 'he_tombe1895', icon: '🪦', title: 'Une tombe de 1895', level: 'moyen', acte: 'deces', year: 1895,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). Recopie en lettres hébraïques (sans les ״ si tu veux) ; pour les nombres, les chiffres marchent aussi : ט״ו = 15.',
                src: 'פ״נ=פ״נ|פנ האשה החשובה מרת שרה=שרה|sarah|sara בת ר׳=ר׳|ר|רבי|reb אברהם=אברהם|avraham|abraham נפטרה ט״ו=ט״ו|טו|15 אדר=אדר|adar תרנ״ה=תרנ״ה|תרנה|655|5655|1895 תנצב״ה=תנצב״ה|תנצבה',
                notes: {'פ״נ': 'פ״נ = פה נקברה : ici est enterrée', 'ר׳': 'ר׳ = רבי : Monsieur (reb), devant le prénom du père', 'ט״ו': 'ט״ו = 9 + 6 = 15', 'תרנ״ה': 'ת 400 + ר 200 + נ 50 + ה 5 = 655 → 5655 = 1895 (en Adar)', 'תנצב״ה': 'que son âme soit liée au faisceau de la vie'}},
        ],
        numerals: {label: 'Lettres-nombres hébraïques', to: toHeb, from: fromHeb, examples: ['תרנ״ה', '655', 'ט״ו', 'ה׳תש״ה']},
        sources: [
            {label: 'FamilySearch Research Wiki — Hebrew Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Hebrew_Genealogical_Word_List'},
            {label: 'Steinheim-Institut — Epidat, base des inscriptions des cimetières juifs (formules et abréviations)', url: 'https://www.steinheim-institut.de/cgi-bin/epidat'},
            {label: 'JewishGen — Hebrew calendar / Jewish calendar conversions', url: 'https://www.jewishgen.org/jos/josdates.htm'},
        ],
    });
})());
