/* 📜 Aide à la lecture — Yiddish (lettres de famille, livres du souvenir « yizker-bikher », sociétés d’originaires, actes et
 * journaux des Juifs d’Europe de l’Est et des émigrés ; écriture hébraïque, de droite à gauche).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    /* ── Lettres latines (YIVO, et à la française) : le yiddish écrit ses voyelles, la lecture est presque sûre ── */
    const P = {patah: 'ַ', kamatz: 'ָ', hiriq: 'ִ', dagesh: 'ּ', rafe: 'ֿ', shin: 'ׁ', sin: 'ׂ'};
    const VOWEL_NEXT = /^(א[ַָ]|ע|ו|ױ|ײ|י)/;
    function tokens(word) {
        const w = String(word || '').normalize('NFD').replace(/[֑-ֽ֯ׄ-ׇ]/g, '')
            .replace(/װ/g, 'וו').replace(/ױ/g, 'וי').replace(/ײ/g, 'יי');
        const out = []; let i = 0;
        const at = k => w[i + k] || '', mk = k => /[ְ-ׂ]/.test(at(k)) ? at(k) : '';
        while (i < w.length) {
            const c = w[i], m = mk(1);
            const adv = n => { i += n; };
            if (c === 'ד' && at(1) === 'ז' && at(2) === 'ש') { out.push(['dzh', 'dj']); adv(3); continue; }
            if (c === 'ז' && at(1) === 'ש') { out.push(['zh', 'j']); adv(2); continue; }
            if (c === 'ט' && at(1) === 'ש') { out.push(['tsh', 'tch']); adv(2); continue; }
            if (c === 'ו' && at(1) === 'ו') { out.push(['v', 'v']); adv(2); continue; }
            if (c === 'ו' && at(1) === 'י' && mk(2) !== P.hiriq) { out.push(['oy', 'oi']); adv(2); continue; }
            if (c === 'י' && at(1) === 'י') { if (mk(2) === P.hiriq) { out.push(['y', 'y'], ['i', 'i']); adv(3); } else if (mk(2) === P.patah) { out.push(['ay', 'aï']); adv(3); } else { out.push(['ey', 'ei']); adv(2); } continue; }
            const one = {
                'א': m === P.patah ? ['a', 'a'] : m === P.kamatz ? ['o', 'o'] : ['', ''], 'ב': m === P.rafe ? ['v', 'v'] : ['b', 'b'], 'ג': ['g', 'g'], 'ד': ['d', 'd'], 'ה': ['h', 'h'],
                'ו': ['u', 'ou'], 'ז': ['z', 'z'], 'ח': ['kh', 'kh'], 'ט': ['t', 't'], 'כ': m === P.dagesh ? ['k', 'k'] : ['kh', 'kh'], 'ך': ['kh', 'kh'], 'ל': ['l', 'l'],
                'מ': ['m', 'm'], 'ם': ['m', 'm'], 'נ': ['n', 'n'], 'ן': ['n', 'n'], 'ס': ['s', 's'], 'ע': ['e', 'e'], 'פ': m === P.dagesh ? ['p', 'p'] : m === P.rafe ? ['f', 'f'] : ['p', 'f'],
                'ף': ['f', 'f'], 'צ': ['ts', 'ts'], 'ץ': ['ts', 'ts'], 'ק': ['k', 'k'], 'ר': ['r', 'r'], 'ש': m === P.sin ? ['s', 's'] : ['sh', 'ch'], 'ת': m === P.dagesh ? ['t', 't'] : ['s', 's'],
                'י': ['i', 'i'],
            }[c];
            if (c === 'י') { i++; const rest = w.slice(i).replace(/^[ְ-ׂ]/, ''); out.push(m === P.hiriq ? ['i', 'i'] : VOWEL_NEXT.test(rest) ? ['y', 'y'] : ['i', 'i']); if (m) i++; continue; }
            if (one) out.push(one); else if (/[a-z0-9]/i.test(c)) out.push([c, c]);
            i += 1 + (m ? 1 : 0);
        }
        return out;
    }
    const translit = word => {
        if (!/[א-ײ]/.test(String(word || ''))) return [];
        const t = tokens(word); return [...new Set([0, 1].map(k => t.map(x => x[k]).join('')).filter(Boolean))];
    };
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => {
        // le même mot sans les points (souvent écrit ainsi) : « געשטארבן » pour געשטאָרבן
        const plain = t.split(/\s*,\s*/).map(x => x.normalize('NFD').replace(/[֑-ׇ]/g, '').normalize('NFC')).filter(x => x && !t.includes(x));
        return {t, d, k, a, ex: ex || '', alt: [...(alt || []), ...plain]};
    });
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
        code: 'yi', name: 'Yiddish', native: 'ייִדיש', icon: '🕯️', script: 'hebraique', dir: 'rtl', ocr: ['yid'],
        intro: 'Langue des Juifs d’Europe de l’Est et des émigrés (Paris, New York, Buenos Aires…) : lettres de famille, livres du souvenir (yizker-bikher), papiers des sociétés d’originaires (landsmanshaftn), journaux. Lettres hébraïques de droite à gauche, mais les voyelles sont écrites : on peut lire presque sûrement en lettres latines. Les tombes, elles, sont surtout en hébreu (choisis « Hébreu »).',
        translit,
        entries: [
            ...R('mot', 'bapteme', [
                ['געבוירן, געבױרן', 'né, née (geboyrn)'], ['געבורט', 'naissance (geburt)'], ['ברית', 'la circoncision (bris)'], ['קינד', 'enfant (kind)'],
                ['ייִנגל', 'garçon (yingl)'], ['מיידל, מיידעלע', 'fille, fillette (meydl)'], ['צווילינגען', 'jumeaux (tsvilingen)'],
            ]),
            ...R('mot', 'mariage', [
                ['חתונה', 'mariage, noces (khasene)'], ['חתונה געהאַט', 's’est marié(e) (khasene gehat)'], ['חתן', 'le fiancé, le marié (khosn)'], ['כּלה', 'la fiancée, la mariée (kale)'],
                ['שידוך', 'mariage arrangé, accord entre les familles (shidekh)'], ['שדכן', 'marieur (shadkhn)'], ['אַלמנה', 'veuve (almone)'], ['אַלמן', 'veuf (almen)'],
                ['גט', 'divorce religieux (get)'], ['כּתובה', 'contrat de mariage (ksube)'],
            ]),
            ...R('mot', 'deces', [
                ['געשטאָרבן', 'mort, décédé (geshtorbn)'], ['שטאַרבן', 'mourir (shtarbn)'], ['באַגראָבן', 'enterré (bagrobn)'], ['טויט', 'la mort (toyt)'],
                ['בית־עולם', 'cimetière (beys-oylem)'], ['מצבֿה', 'pierre tombale (matseyve)'], ['יאָרצײַט', 'anniversaire de la mort (yortsayt)'],
                ['אומגעקומען', 'mort, tué (dans la Shoah : « umgekumen »)'], ['קדיש', 'la prière des morts (kadish)'],
            ]),
            ...R('mot', 'general', [
                ['שטעטל', 'bourgade juive (shtetl)'], ['שטאָט', 'ville (shtot)'], ['דאָרף', 'village (dorf)'], ['לאַנדסמאַנשאַפֿט', 'société des gens venus du même endroit (landsmanshaft)'],
                ['לאַנדסמאַן', 'compatriote, quelqu’un du même village (landsman)'], ['יזכּור־בוך', 'livre du souvenir d’une communauté détruite (yizker-bukh)'], ['קהילה', 'la communauté (kehile)'],
                ['שול', 'synagogue (shul)'], ['נאָמען', 'nom (nomen)'], ['פֿאַמיליע', 'nom de famille, famille (familye)'], ['צום אייביקן אָנדענק', 'en souvenir éternel (tsum eybikn ondenk)'],
            ]),
            ...R('parente', 'general', [
                ['טאַטע, פֿאָטער', 'père (tate, foter)'], ['מאַמע, מוטער', 'mère (mame, muter)'], ['עלטערן', 'parents (eltern)'], ['זון', 'fils (zun)'], ['טאָכטער', 'fille (tokhter)'],
                ['ברודער', 'frère (bruder)'], ['שוועסטער', 'sœur (shvester)'], ['זיידע', 'grand-père (zeyde)'], ['באָבע', 'grand-mère (bobe)'], ['אייניקל', 'petit-enfant (eynikl)'],
                ['פֿעטער', 'oncle (feter)'], ['מומע', 'tante (mume)'], ['פּלימעניק, פּלימעניצע', 'neveu, nièce (plimenik, plimenitse)'], ['קוזין, קוזינע', 'cousin, cousine (kuzin, kuzine)'],
                ['מאַן', 'mari (man)'], ['ווײַב', 'épouse (vayb)'], ['פֿרוי', 'femme, épouse (froy)'], ['שווער', 'beau-père (shver)'], ['שוויגער', 'belle-mère (shviger)'],
                ['איידעם', 'gendre (eydem)'], ['שנור', 'belle-fille, épouse du fils (shnur)'], ['שוואָגער', 'beau-frère (shvoger)'], ['מחותּן', 'le père du conjoint de son enfant (mekhutn)'],
            ]),
            ...R('mois', 'general', [
                ['יאַנואַר', 'janvier'], ['פֿעברואַר', 'février'], ['מערץ', 'mars'], ['אַפּריל', 'avril'], ['מײַ', 'mai'], ['יוני', 'juin'], ['יולי', 'juillet'], ['אויגוסט', 'août'],
                ['סעפּטעמבער', 'septembre'], ['אָקטאָבער', 'octobre'], ['נאָוועמבער', 'novembre'], ['דעצעמבער', 'décembre'],
                ['תּשרי, חשוון, כּסלו, טבֿת', 'mois hébreux, dits « tishre, kheshvn, kislev, teyves » (voir Hébreu)', '', ['tishre', 'kheshvn', 'kislev', 'teyves']],
                ['שבֿט, אָדר, ניסן, אייר', '« shvat, oder, nisn, iyer »', '', ['shvat', 'oder', 'nisn', 'iyer']], ['סיוון, תּמוז, אָב, אלול', '« sivn, tamez, ov (menakhem-ov), elul »', '', ['sivn', 'tamez', 'elul']],
                ['חודש', 'mois (khoydesh)'], ['יאָר', 'année, an (yor)'], ['טאָג', 'jour (tog)'],
            ]),
            ...R('nombre', 'general', [
                ['איינס, איין', 'un (eyns)'], ['צוויי', 'deux (tsvey)'], ['דרײַ', 'trois (dray)'], ['פֿיר', 'quatre (fir)'], ['פֿינף', 'cinq (finf)'], ['זעקס', 'six (zeks)'],
                ['זיבן', 'sept (zibn)'], ['אַכט', 'huit (akht)'], ['נײַן', 'neuf (nayn)'], ['צען', 'dix (tsen)'], ['עלף', 'onze (elf)'], ['צוועלף', 'douze (tsvelf)'],
                ['צוואַנציק', 'vingt (tsvantsik)'], ['דרײַסיק', 'trente (draysik)'], ['פֿערציק', 'quarante (fertsik)'], ['פֿופֿציק', 'cinquante (fuftsik)'], ['הונדערט', 'cent (hundert)'], ['טויזנט', 'mille (toyznt)'],
                ['אַלט', 'âgé de (« 70 יאָר אַלט » = 70 ans)'], ['יאָר', 'ans (yor)'],
            ]),
            ...R('metier', 'general', [
                ['שנײַדער', 'tailleur (shnayder)'], ['שוסטער', 'cordonnier (shuster)'], ['סוחר', 'marchand (soykher)'], ['קרעמער', 'boutiquier (kremer)'], ['בעקער', 'boulanger (beker)'],
                ['סטאָליער', 'menuisier (stolyer)'], ['שמיד', 'forgeron (shmid)'], ['קצבֿ', 'boucher (katsev)'], ['בעל־עגלה', 'charretier, voiturier (balegole)'],
                ['מלמד', 'maître d’école des petits (melamed)'], ['שוחט', 'abatteur rituel (shoykhet)'], ['חזן', 'chantre (khazn)'], ['רבֿ', 'rabbin (rov)'], ['פֿעלדשער', 'aide-médecin (feldsher)'],
            ]),
            ...R('formule', 'general', [
                ['איז געבוירן געוואָרן אין', 'est né(e) à (iz geboyrn gevorn in)'], ['איז געשטאָרבן', 'est mort(e) (iz geshtorbn)'], ['זײַן ווײַב', 'sa femme (zayn vayb)'],
                ['זייער זון, זייער טאָכטער', 'leur fils, leur fille (zeyer zun, zeyer tokhter)'],
            ]),
            ...R('formule', 'deces', [
                ['איז אומגעקומען אין', 'a péri à (dans la Shoah : iz umgekumen in)'],
            ]),
        ],
        glyphs: {
            yi_alef: ['M10 22 L29 46', 'M27 22 C27 28 25 32 21 34', 'M15 34 L12 46'],
            yi_pasekh: ['M10 22 L29 46', 'M27 22 C27 28 25 32 21 34', 'M15 34 L12 46', 'M12 53 L28 53'],
            yi_komets: ['M10 22 L29 46', 'M27 22 C27 28 25 32 21 34', 'M15 34 L12 46', 'M12 53 L28 53', 'M20 53 L20 58'],
            yi_tsvey_vov: ['M9 23 L14 22 L14 46', 'M22 23 L27 22 L27 46'],
            yi_tsvey_yud: ['M10 22 L16 22 L16 31', 'M23 22 L29 22 L29 31'],
            yi_vov_yud: ['M11 23 L16 22 L16 46', 'M23 22 L29 22 L29 31'],
            yi_ayin: ['M10 22 L20 42', 'M29 22 L22 42 C20 46 14 47 9 46'],
        },
        widths: {},
        letters: [
            {id: 'yi_alef', name: 'אַ, אָ et א muet', seen: ['yi_pasekh', 'yi_komets', 'yi_alef'], read: 'a, o, (rien)', cmp: [], note: 'Un trait sous le alef (אַ) = a ; un petit T dessous (אָ) = o ; le alef seul, au début d’un mot devant une voyelle, ne se lit pas (« אין » = in).', keys: 'alef pasekh komets a o shtumer yiddish'},
            {id: 'yi_ayin', name: 'ע = e', seen: ['yi_ayin'], read: 'e', cmp: [], note: 'En yiddish, ע est la voyelle e : « זעקס » = zeks (six), « מומע » = mume (tante).', keys: 'ayin e yiddish'},
            {id: 'yi_vv', name: 'וו = v, ױ = oy, ײ = ey', seen: ['yi_tsvey_vov', 'yi_vov_yud', 'yi_tsvey_yud'], read: 'v, oy, ey (ay avec un trait dessous)', cmp: [], note: 'Deux vav (וו) = v ; vav + yod (ױ) = oy ; deux yod (ײ) = ey, et ay avec un trait dessous (ײַ) : « מײַן » = mayn (mon).', keys: 'vov yud tsvey v oy ey ay yiddish'},
        ],
        exercises: [
            {id: 'yi_zeyde1910', icon: '✉️', title: 'Une lettre de famille (1925)', level: 'facile', acte: 'general', year: 1925,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). Recopie en lettres hébraïques ou en lettres latines (YIVO) : « mayn zeyde… ».',
                src: 'מײַן זיידע משה=משה|moyshe|moshe איז געבוירן אין ווילנע אין יאָר 1870 און איז געשטאָרבן אין 1910',
                notes: {'מײַן': 'ײַ = ay : mayn (mon)', 'משה': 'mot d’origine hébraïque, écrit sans voyelles : Moyshe (Moïse)', 'ווילנע': 'Vilne : Vilnius', 'געשטאָרבן': 'geshtorbn : mort'}},
        ],
        numerals: null,
        sources: [
            {label: 'FamilySearch Research Wiki — Yiddish Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Yiddish_Genealogical_Word_List'},
            {label: 'YIVO Institute — Yiddish alphabet and transliteration (romanisation YIVO)', url: 'https://www.yivo.org/Yiddish-Alphabet'},
            {label: 'JewishGen — Yizkor Book Project (livres du souvenir)', url: 'https://www.jewishgen.org/yizkor/'},
        ],
    });
})());
