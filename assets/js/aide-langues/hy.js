/* 📜 Aide à la lecture — Arménien (tombes, registres de l’Église arménienne, papiers des familles arrivées en France après 1915-1923).
 * En plus du format commun : `alphabet` et `numerals` (lettres-nombres : Ա = 1 … Ք = 9 000).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    /* ── L'alphabet : [majuscule, minuscule, nom, se lit (arménien oriental ; occidental entre parenthèses), nombre] ── */
    const ALPHA = [
        ['Ա', 'ա', 'ayb', 'a', 1], ['Բ', 'բ', 'ben', 'b (occidental : p)', 2], ['Գ', 'գ', 'gim', 'g (occ. : k)', 3], ['Դ', 'դ', 'da', 'd (occ. : t)', 4], ['Ե', 'ե', 'yetch', 'e, ye au début', 5],
        ['Զ', 'զ', 'za', 'z', 6], ['Է', 'է', 'é', 'é', 7], ['Ը', 'ը', 'ët', 'e muet (ë)', 8], ['Թ', 'թ', 'to', 't', 9], ['Ժ', 'ժ', 'jé', 'j', 10], ['Ի', 'ի', 'ini', 'i', 20],
        ['Լ', 'լ', 'lioun', 'l', 30], ['Խ', 'խ', 'khé', 'kh', 40], ['Ծ', 'ծ', 'tsa', 'ts (occ. : dz)', 50], ['Կ', 'կ', 'ken', 'k (occ. : g)', 60], ['Հ', 'հ', 'ho', 'h', 70],
        ['Ձ', 'ձ', 'dza', 'dz (occ. : ts)', 80], ['Ղ', 'ղ', 'ghat', 'gh (r grasseyé)', 90], ['Ճ', 'ճ', 'tché', 'tch (occ. : dj)', 100], ['Մ', 'մ', 'men', 'm', 200], ['Յ', 'յ', 'hi', 'y ; h au début d’un mot', 300],
        ['Ն', 'ն', 'nou', 'n', 400], ['Շ', 'շ', 'cha', 'ch', 500], ['Ո', 'ո', 'vo', 'o ; vo au début', 600], ['Չ', 'չ', 'tcha', 'tch', 700], ['Պ', 'պ', 'pé', 'p (occ. : b)', 800],
        ['Ջ', 'ջ', 'djé', 'dj (occ. : tch)', 900], ['Ռ', 'ռ', 'ra', 'r roulé', 1000], ['Ս', 'ս', 'sé', 's', 2000], ['Վ', 'վ', 'vev', 'v', 3000], ['Տ', 'տ', 'tioun', 't (occ. : d)', 4000],
        ['Ր', 'ր', 'ré', 'r', 5000], ['Ց', 'ց', 'tso', 'ts', 6000], ['Ւ', 'ւ', 'hioun', 'v ; ու = ou', 7000], ['Փ', 'փ', 'piour', 'p', 8000], ['Ք', 'ք', 'ké', 'k', 9000],
        ['Օ', 'օ', 'o', 'o', 0], ['Ֆ', 'ֆ', 'fé', 'f', 0],
    ];
    /* ── Lettres latines : [oriental à la française, oriental à l'anglaise, occidental (diaspora de France)] ── */
    const TR = {'ա': ['a', 'a', 'a'], 'բ': ['b', 'b', 'p'], 'գ': ['g', 'g', 'k'], 'դ': ['d', 'd', 't'], 'ե': ['e', 'e', 'e'], 'զ': ['z', 'z', 'z'], 'է': ['e', 'e', 'e'], 'ը': ['e', 'e', 'e'],
        'թ': ['t', 't', 't'], 'ժ': ['j', 'zh', 'j'], 'ի': ['i', 'i', 'i'], 'լ': ['l', 'l', 'l'], 'խ': ['kh', 'kh', 'kh'], 'ծ': ['ts', 'ts', 'dz'], 'կ': ['k', 'k', 'g'], 'հ': ['h', 'h', 'h'],
        'ձ': ['dz', 'dz', 'ts'], 'ղ': ['gh', 'gh', 'gh'], 'ճ': ['tch', 'ch', 'dj'], 'մ': ['m', 'm', 'm'], 'յ': ['y', 'y', 'y'], 'ն': ['n', 'n', 'n'], 'շ': ['ch', 'sh', 'ch'], 'ո': ['o', 'o', 'o'],
        'չ': ['tch', 'ch', 'tch'], 'պ': ['p', 'p', 'b'], 'ջ': ['dj', 'j', 'tch'], 'ռ': ['r', 'r', 'r'], 'ս': ['s', 's', 's'], 'վ': ['v', 'v', 'v'], 'տ': ['t', 't', 'd'], 'ր': ['r', 'r', 'r'],
        'ց': ['ts', 'ts', 'ts'], 'ւ': ['v', 'v', 'v'], 'փ': ['p', 'p', 'p'], 'ք': ['k', 'k', 'k'], 'օ': ['o', 'o', 'o'], 'ֆ': ['f', 'f', 'f'], 'և': ['ev', 'yev', 'yev']};
    const PAIRS = {'ու': ['ou', 'u', 'ou'], 'եա': ['ia', 'ya', 'ia'], 'իւ': ['iou', 'yu', 'iou'], 'եւ': ['ev', 'ev', 'ev']};
    const translit = word => {
        const w = String(word || '').toLowerCase().normalize('NFC').replace(/[՛՜՞՟՚]/g, '');
        if (!/[Ա-և]/.test(w)) return [];
        return [...new Set([0, 1, 2].map(v => {
            let s = '';
            for (let i = 0; i < w.length; i++) {
                const two = w.slice(i, i + 2), start = i === 0 || !/[ա-և]/.test(w[i - 1]);
                if (PAIRS[two]) { s += PAIRS[two][v]; i++; continue; }
                const c = w[i];
                if (start && c === 'ե') { s += 'ye'; continue; }
                if (start && c === 'ո') { s += 'vo'; continue; }
                if (start && c === 'յ') { s += 'h'; continue; }
                s += TR[c] ? TR[c][v] : /[a-z0-9 -]/.test(c) ? c : '';
            }
            return s;
        }).filter(Boolean))];
    };
    /* ── Lettres-nombres : Ա = 1 … Թ = 9, Ժ = 10 … Ղ = 90, Ճ = 100 … Ջ = 900, Ռ = 1 000 … Ք = 9 000 ── */
    const NUM = ALPHA.filter(a => a[4]).map(a => [a[0], a[1], a[4]]);
    const BY = {}; NUM.forEach(([B, s, v]) => { BY[B] = v; BY[s] = v; });
    const letterFor = v => (NUM.find(x => x[2] === v) || [''])[0];
    function toHy(n) {
        n = Math.floor(Number(n)); if (!(n > 0 && n < 10000)) return '';
        let s = '', k = 1000; while (k >= 1) { const d = Math.floor(n / k) % 10; if (d) s += letterFor(d * k); k /= 10; } return s;
    }
    function fromHy(s) {
        const t = String(s || '').replace(/[\s.՟]/g, ''); if (!t) return null;
        let sum = 0; for (const c of t) { if (!(c in BY)) return null; sum += BY[c]; } return sum || null;
    }
    return {
        code: 'hy', name: 'Arménien', native: 'Հայերեն', icon: '🇦🇲', script: 'armenienne', dir: 'ltr', ocr: ['hye'],
        intro: 'Tombes et papiers des familles arméniennes (Marseille, Lyon, Valence, Alfortville… après 1915-1923), registres de l’Église arménienne. Deux prononciations : l’arménien occidental (Turquie, diaspora de France : Bedros, Krikor, Hagop) et l’oriental (Arménie, Iran : Petros, Grigor, Hakob) ; l’orthographe ancienne (-եան = -ian) reste celle de la diaspora. Les nombres s’écrivent aussi avec des lettres (🔢 ci-dessous).',
        translit,
        alphabet: ALPHA.map(([big, small, name, latin, value]) => ({big, small, name, latin, value: value || ''})),
        entries: [
            ...R('mot', 'bapteme', [
                ['ծնունդ', 'naissance'], ['ծնած, ծնված', 'né, née (ծնած : occidental ; ծնված : oriental)'], ['մկրտութիւն, մկրտություն', 'baptême (orthographe ancienne, puis réformée)'],
                ['մկրտուած, մկրտված', 'baptisé(e)'], ['կնքահայր', 'parrain'], ['կնքամայր', 'marraine'], ['կնունք', 'baptême (la fête)'], ['երեխայ, երեխա', 'enfant'],
                ['զաւակ, զավակ', 'enfant, descendant'], ['տղայ, տղա', 'garçon, fils'], ['աղջիկ', 'fille'],
            ]),
            ...R('mot', 'mariage', [
                ['ամուսնութիւն, ամուսնություն', 'mariage'], ['պսակ', 'le mariage à l’église (« la couronne »)'], ['պսակուած, պսակված', 'marié(e) à l’église'],
                ['հարսանիք', 'les noces'], ['փեսայ, փեսա', 'le marié ; aussi le gendre'], ['հարս', 'la mariée ; aussi la belle-fille (épouse du fils)'],
                ['այրի', 'veuf, veuve'], ['ամուսին', 'époux, mari'], ['կին', 'femme, épouse'],
            ]),
            ...R('mot', 'deces', [
                ['մահ', 'mort, décès'], ['մահացած, մահացել', 'mort, décédé'], ['հանգուցեալ, հանգուցյալ', 'le défunt, la défunte (« feu »)'], ['թաղում', 'enterrement'],
                ['թաղուած, թաղված', 'enterré(e)'], ['գերեզման', 'tombe'], ['գերեզմանատուն', 'cimetière'], ['տապան', 'tombeau, sépulture'], ['շիրիմ', 'tombe (mot littéraire)'],
                ['յիշատակ, հիշատակ', 'souvenir, mémoire'],
            ]),
            ...R('mot', 'general', [
                ['եկեղեցի', 'église'], ['քահանայ, քահանա', 'prêtre'], ['Տէր, Տեր', 'titre d’un prêtre marié (« Տէր Յովհաննէս ») ; dans un nom de famille (Տէր-Պետրոսեան), descendant d’un prêtre'],
                ['գիւղ, գյուղ', 'village'], ['քաղաք', 'ville'], ['տուն', 'maison, famille'], ['ազգանուն', 'nom de famille'], ['անուն', 'prénom, nom'],
                ['Մահտեսի', 'titre d’un pèlerin revenu de Jérusalem (comme « hadji »)'], ['Պարոն', 'Monsieur'], ['Տիկին', 'Madame'], ['Օրիորդ', 'Mademoiselle'],
                ['-եան, -յան', 'fin des noms de famille : « fils de, de la famille de » (Պետրոսեան = Petrossian, Bedrossian)'],
                ['թուին, թվին, ԹՎ', 'en l’année (devant une date en lettres-nombres)'],
            ]),
            ...R('parente', 'general', [
                ['հայր', 'père'], ['մայր', 'mère'], ['ծնողներ', 'parents'], ['որդի', 'fils (« Յովհաննէսի որդի » = fils de Hovhannès)'], ['դուստր', 'fille (de quelqu’un)'],
                ['եղբայր', 'frère'], ['քոյր, քույր', 'sœur'], ['պապ', 'grand-père'], ['տատ', 'grand-mère'], ['թոռ', 'petit-fils, petite-fille'],
                ['հօրեղբայր, հորեղբայր', 'oncle (frère du père)'], ['մօրեղբայր, մորեղբայր', 'oncle (frère de la mère)'], ['հօրաքոյր, հորաքույր', 'tante (sœur du père)'], ['մօրաքոյր, մորաքույր', 'tante (sœur de la mère)'],
                ['զարմիկ', 'cousin'], ['սկեսրայր, սկեսուր', 'beau-père, belle-mère (parents du mari)'], ['աներ, զոքանչ', 'beau-père, belle-mère (parents de l’épouse)'],
            ]),
            ...R('mois', 'general', [
                ['յունուար, հունվար', 'janvier'], ['փետրուար, փետրվար', 'février'], ['մարտ', 'mars'], ['ապրիլ', 'avril'], ['մայիս', 'mai'], ['յունիս, հունիս', 'juin'],
                ['յուլիս, հուլիս', 'juillet'], ['օգոստոս', 'août'], ['սեպտեմբեր', 'septembre'], ['հոկտեմբեր', 'octobre'], ['նոյեմբեր', 'novembre'], ['դեկտեմբեր', 'décembre'],
                ['ամիս', 'mois'], ['օր', 'jour'], ['տարի', 'année, an'],
                ['ère arménienne', 'une année écrite en lettres-nombres compte souvent depuis 552 : ajoute 551 (ՌՄԾ = 1250 → 1801)'],
            ]),
            ...R('nombre', 'general', [
                ['մէկ, մեկ', 'un'], ['երկու', 'deux'], ['երեք', 'trois'], ['չորս', 'quatre'], ['հինգ', 'cinq'], ['վեց', 'six'], ['եօթը, յոթ', 'sept'], ['ութ, ութը', 'huit'],
                ['ինը', 'neuf'], ['տասը', 'dix'], ['քսան', 'vingt'], ['երեսուն', 'trente'], ['քառասուն', 'quarante'], ['յիսուն, հիսուն', 'cinquante'], ['վաթսուն', 'soixante'],
                ['եօթանասուն, յոթանասուն', 'soixante-dix'], ['ութսուն', 'quatre-vingts'], ['իննսուն', 'quatre-vingt-dix'], ['հարիւր, հարյուր', 'cent'], ['հազար', 'mille'],
                ['տարեկան', 'âgé de … ans (« 50 տարեկան »)'], ['Ա, Բ, Գ… (lettres-nombres)', '1, 2, 3… : 🔢 convertisseur ci-dessous'],
            ]),
            ...R('metier', 'general', [
                ['երկրագործ, հողագործ', 'cultivateur'], ['արհեստաւոր, արհեստավոր', 'artisan'], ['վաճառական', 'marchand, négociant'], ['դերձակ', 'tailleur'], ['կոշկակար', 'cordonnier'],
                ['դարբին', 'forgeron'], ['ատաղձագործ', 'menuisier, charpentier'], ['ոսկերիչ', 'orfèvre, bijoutier'], ['հացթուխ', 'boulanger'], ['բժիշկ', 'médecin'],
                ['ուսուցիչ, վարժապետ', 'instituteur, maître d’école'], ['քահանայ', 'prêtre'],
            ]),
            ...R('formule', 'deces', [
                ['Այս է տապան', 'Ceci est le tombeau de … (début d’une tombe)'], ['Աստուած հոգին լուսաւորէ, Աստված հոգին լուսավորի', 'Que Dieu illumine son âme']
            ]),
        ],
        glyphs: {
            hy_vo: ['M12 26 L12 46', 'M12 33 C14 26 24 26 24 33 L24 46'],
            hy_se: ['M12 26 L12 40 C12 47 22 47 24 40', 'M24 26 L24 40'],
            hy_ayp: ['M7 26 L7 40 C7 47 15 47 17 40 L17 26', 'M17 40 C17 47 27 47 27 40 L27 26', 'M27 40 C27 46 31 47 33 44'],
            hy_pativ: ['M8 18 C12 12 16 22 20 16 C24 10 28 20 32 14', 'M12 46 L12 26', 'M24 46 L24 26'],
        },
        widths: {hy_ayp: 40},
        letters: [
            {id: 'hy_vose', name: 'ո (o) et ս (s)', seen: ['hy_vo', 'hy_se'], read: 'ո = o / vo, ս = s', cmp: ['n', 'u'], note: 'ո ressemble à un n latin et ս à un u : ne les lis pas comme des lettres latines ! « ու » se lit « ou ».', keys: 'vo se o s n u armenien'},
            {id: 'hy_ayp', name: 'ա (a)', seen: ['hy_ayp'], read: 'a', cmp: ['m'], note: 'Le ա ressemble à un w (ou à un m à l’envers) avec une petite queue.', keys: 'ayp a armenien w'},
            {id: 'hy_pativ', name: 'signe d’abréviation (՟)', seen: ['hy_pativ'], read: 'mot abrégé', cmp: [], note: 'Un trait ondulé au-dessus d’un mot marque une abréviation des noms sacrés : « Ա՟ծ » = Աստուած (Dieu). Il sert aussi au-dessus des lettres-nombres.', keys: 'pativ abreviation titlo armenien'},
        ],
        exercises: [
            {id: 'hy_tombe1932', icon: '🪦', title: 'Une tombe de 1932 (Marseille)', level: 'moyen', acte: 'deces', year: 1932,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple), en orthographe ancienne de la diaspora. Recopie en lettres arméniennes ou latines (Bedrossian ou Petrossian : les deux marchent).',
                src: 'Այս է տապան Գրիգորի Պետրոսեանի=Պետրոսեանի|Պետրոսյանի|bedrosiani|bedrossiani|petrosiani 1875 1932 Աստուած=Աստուած|Աստված|asdvadz|astvats հոգին լուսաւորէ=լուսաւորէ|լուսավորի',
                notes: {'Այս': 'ays : ceci', 'տապան': 'tombeau', 'Գրիգորի': 'de Krikor (Grigor) : le -ի final = « de »', 'Պետրոսեանի': '-եան = -ian (orthographe ancienne) ; -ի = « de »', 'Աստուած': 'Dieu (ու = ou)'}},
        ],
        numerals: {label: 'Lettres-nombres arméniennes', to: toHy, from: fromHy, examples: ['ՌՄԾ', '1250', 'ՌՋԺԵ', '1915']},
        sources: [
            {label: 'FamilySearch Research Wiki — Armenian Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Armenian_Genealogical_Word_List'},
            {label: 'FamilySearch Research Wiki — Armenia Genealogy (records and language)', url: 'https://www.familysearch.org/en/wiki/Armenia_Genealogy'},
            {label: 'Unicode — Armenian (U+0530–U+058F), lettres et valeurs numériques', url: 'https://www.unicode.org/charts/PDF/U0530.pdf'},
        ],
    };
})());
