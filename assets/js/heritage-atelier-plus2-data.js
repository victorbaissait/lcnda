/* LCNDA — 📜 Atelier de transcription, outils en plus (2) : les données et les calculs, sans page (aussi require() dans Node :
 * tests/test-atelier-plus2.js). L'écran : heritage-atelier-plus2.js.
 *  📖 MOTS      les mots d'autrefois des actes (laboureur, journalier, feu / feue, susdit…) : un sens sûr et sa source (CNRTL, Wikipédia)
 *               chacun ; scanMots(texte, monGlossaire) → les mots trouvés (mon glossaire passe avant : son mot n'est pas repris).
 *               Les « vieux mots » des Trésors (heritage-tresors-decouvrir.js) sont une autre liste, sans source : celle-ci ne la remplace pas.
 *  📖 scanGlo   mes mots (« 📖 Mon glossaire », genealogie-tx-glossaire) dans le texte : expliqués au survol, avant tout le reste.
 *  🏛 Latin     le latin des registres de l'Aide à la lecture (assets/js/aide-langues/la.js, avec ses sources) : latinIndex(entrées),
 *               scanLatin(texte, index, {force}) (les mots et courtes expressions : baptizavi, filius legitimus, sepultus est…),
 *               latinFormulas(texte, entrées) (les formules entières : « die … mensis … », « in matrimonium conjunxi »).
 *  🔊 readLines(texte)          les lignes à lire à voix haute (sans les lignes vides ni les repères « — page 2 — »)
 *  👥 packageText / parsePackage la fiche vierge d'une seconde lecture (.txt numérotée) et sa relecture
 *  🎯 goalStatus(objectif, journal, jour)   le petit objectif du jour
 *  🧾 summaryLines(résumé)      qui, quoi, quand · où en 3 lignes
 *  ✍️ habitsOf(textes, abbrevs) les abréviations les plus fréquentes d'une main (📚 registre entier)
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) { root.LCNDA_EXT = root.LCNDA_EXT || {}; root.LCNDA_EXT.txPlus2Data = api; }
})(typeof window !== 'undefined' ? window : null, function (root) {
    'use strict';
    const i18n = (s, v) => { const I = root?.LCNDA_I18N; return I ? I.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s); };
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ſ/g, 's').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/[’`]/g, "'");

    /* ═════════ 📖 Les mots d'autrefois : seulement des sens sûrs, une source par mot ═════════ */
    const CN = w => `https://www.cnrtl.fr/definition/${encodeURIComponent(w)}`;
    const WP = p => `https://fr.wikipedia.org/wiki/${encodeURIComponent(p)}`;
    const M = (forms, d, src, url) => ({forms, d, src, url});
    const MOTS = [
        M(['laboureur', 'laboureurs'], 'paysan qui possède son attelage (charrue et bêtes de trait) pour cultiver la terre ; souvent l’un des plus aisés du village sous l’Ancien Régime', 'Wikipédia', WP('Laboureur')),
        M(['manouvrier', 'manouvriers', 'manouvrière', 'manouvrieres', 'manœuvrier'], 'paysan sans attelage qui loue ses bras, à la journée', 'Wikipédia', WP('Manouvrier')),
        M(['journalier', 'journaliers', 'journalière', 'journalieres'], 'ouvrier (souvent agricole) payé à la journée', 'CNRTL', CN('journalier')),
        M(['brassier', 'brassiers'], 'ouvrier agricole qui travaille de ses bras, sans attelage', 'CNRTL', CN('brassier')),
        M(['ménager', 'ménagers'], 'paysan qui exploite son propre bien, proche du laboureur ; le sens change d’une région à l’autre', 'CNRTL', CN('ménager')),
        M(['métayer', 'métayers', 'métayère'], 'cultive la terre d’un propriétaire et partage avec lui les récoltes', 'CNRTL', CN('métayer')),
        M(['fermier', 'fermiers', 'fermière'], 'exploite la terre d’un autre contre un loyer fixe (le fermage)', 'CNRTL', CN('fermier')),
        M(['feu', 'feue', 'feus', 'feues'], 'défunt, défunte : « feu Pierre » = Pierre, qui est mort', 'CNRTL', CN('feu')),
        M(['défunt', 'défunte', 'défunts', 'défuntes', 'deffunt', 'deffunte'], 'qui est mort, morte', 'CNRTL', CN('défunt')),
        M(['veuf', 'veuve', 'veufs', 'veuves', 'veufve'], 'dont le conjoint est mort', 'CNRTL', CN('veuf')),
        M(['susdit', 'susdite', 'susdits', 'susdites'], 'nommé plus haut dans l’acte', 'CNRTL', CN('susdit')),
        M(['icelui', 'icelle', 'iceux', 'icelles'], 'celui-ci, celle-ci, ceux-ci (forme ancienne)', 'CNRTL', CN('icelui')),
        M(['cejourd\'hui', 'cejourdhui'], 'aujourd’hui, ce jour même', 'CNRTL', CN('cejourd\'hui')),
        M(['inhumé', 'inhumée', 'inhumés', 'inhumées'], 'enterré, enterrée', 'CNRTL', CN('inhumer')),
        M(['ondoyé', 'ondoyée', 'ondoyés'], 'baptisé en urgence (en danger de mort), sans les cérémonies du baptême', 'CNRTL', CN('ondoyer')),
        M(['posthume'], 'né après la mort de son père', 'CNRTL', CN('posthume')),
        M(['sieur', 'sr'], 'titre de politesse donné à un homme (« monsieur »)', 'CNRTL', CN('sieur')),
        M(['messire'], 'titre d’honneur donné aux nobles et aux prêtres', 'CNRTL', CN('messire')),
        M(['tabellion'], 'ancien nom du notaire', 'CNRTL', CN('tabellion')),
        M(['marguillier', 'marguilliers'], 'laïc chargé des biens et de l’entretien de l’église de la paroisse', 'CNRTL', CN('marguillier')),
        M(['natif', 'native'], 'né à : « natif de cette paroisse »', 'CNRTL', CN('natif')),
        M(['demeurant', 'demeurante', 'demeurants'], 'qui habite : « demeurant au village de… »', 'CNRTL', CN('demeurer')),
        M(['bans'], 'annonce publique d’un futur mariage, faite à la messe (en général trois dimanches)', 'CNRTL', CN('ban')),
        M(['légitime', 'légitimes'], 'né de parents mariés ensemble', 'CNRTL', CN('légitime')),
        M(['fils naturel', 'fille naturelle', 'enfant naturel'], 'né hors mariage', 'CNRTL', CN('naturel')),
        M(['relevailles'], 'bénédiction de la mère, à l’église, après l’accouchement', 'CNRTL', CN('relevailles')),
    ];
    let motsIdx = null;
    const motsIndex = () => { if (motsIdx) return motsIdx; const one = new Map(), many = []; MOTS.forEach(m => m.forms.forEach(f => { const k = fold(f); if (k.includes(' ')) many.push([k.split(' '), m, f]); else if (!one.has(k)) one.set(k, m); })); return (motsIdx = {one, many}); };
    /** les mots du texte, avec leur place : [{s, e, w, k}] (k : sans accents ni majuscules) */
    function words(text) {
        const out = [], rx = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)?/gu; let m;
        while ((m = rx.exec(String(text || '')))) out.push({s: m.index, e: m.index + m[0].length, w: m[0], k: fold(m[0])});
        return out;
    }
    const gloKey = w => fold(w).replace(/[.\s]+$/, '');
    /** 📖 mes mots dans le texte : [{s, e, word, glo: {w, m}}] */
    function scanGlo(text, glo = []) {
        const map = new Map((glo || []).filter(x => x && x.w && x.m).map(x => [gloKey(x.w), x])); if (!map.size) return [];
        const out = [], t = String(text || ''), rx = /[\p{L}\p{M}\p{N}ᵉʳˢᵗᵐᵇᵈⁿᵒᵃ°]+\.?/gu; let m;
        while ((m = rx.exec(t))) { const g = map.get(gloKey(m[0])) || map.get(gloKey(m[0].replace(/\.$/, ''))); if (g && !/[\p{L}]/u.test(t[m.index - 1] || '')) out.push({s: m.index, e: m.index + m[0].length, word: m[0], glo: g}); }
        return out;
    }
    /** 📖 les mots d'autrefois du texte : [{s, e, word, mot}] ; les mots de mon glossaire ne sont pas repris (le mien passe avant) */
    function scanMots(text, glo = []) {
        const {one, many} = motsIndex(), mine = new Set((glo || []).map(x => gloKey(x?.w || ''))), W = words(text), out = [], used = new Set();
        for (let i = 0; i < W.length; i++) {
            for (const [ks, m] of many) { if (ks.every((k, j) => W[i + j]?.k === k)) { const e = W[i + ks.length - 1].e; out.push({s: W[i].s, e, word: String(text).slice(W[i].s, e), mot: m}); for (let j = 0; j < ks.length; j++) used.add(i + j); break; } }
            if (used.has(i)) continue;
            const m = one.get(W[i].k); if (!m || mine.has(W[i].k)) continue;
            if (W[i].k === 'feu' && !/^\s+\p{Lu}/u.test(String(text).slice(W[i].e, W[i].e + 3)) && !/^\s+(?:son|sa|ses|mon|ma|maitre|maître|sieur|messire|monsieur|madame|dame)\b/i.test(String(text).slice(W[i].e, W[i].e + 12))) continue; // « le feu » (l'incendie) : seulement « feu Pierre », « feu son père »
            if (W[i].k === 'sr' && !/^\s+\p{Lu}/u.test(String(text).slice(W[i].e, W[i].e + 3))) continue;
            out.push({s: W[i].s, e: W[i].e, word: W[i].w, mot: m});
        }
        return out;
    }

    /* ═════════ 🏛 Le latin des registres (les mots de assets/js/aide-langues/la.js) ═════════ */
    const LAT_STOP = new Set(['est', 'die', 'in', 'et', 'de', 'cum', 'pro', 'non', 'ut', 'ad', 'qui', 'quae', 'quod', 'sunt', 'erat', 'fuit']);
    const formsOf = e => [...String(e.t || '').split(/\s*,\s*/), ...(Array.isArray(e.alt) ? e.alt : [])].map(f => fold(f).replace(/[.]/g, '').trim()).filter(f => f && !f.includes('…'));
    /** l'index des mots latins : {one: Map(mot → entrée), many: [[mots…], entrée]} (les expressions de 2 à 4 mots) */
    function latinIndex(entries) {
        const one = new Map(), many = [];
        (entries || []).filter(e => e && e.k !== 'formule' && !String(e.t || '').includes('…')).forEach(e => formsOf(e).forEach(f => {
            const ws = f.split(/\s+/);
            if (ws.length === 1) { if (f.length >= 4 && !LAT_STOP.has(f) && !one.has(f)) one.set(f, e); }
            else if (ws.length <= 4) many.push([ws, e]);
        }));
        many.sort((a, b) => b[0].length - a[0].length);
        return {one, many};
    }
    /**
     * 🏛 les mots latins du texte : [{s, e, word, item}]. force : le texte est en latin (langue choisie) ; sinon il en faut au moins
     * deux différents de 6 lettres ou plus (un texte français n'est pas souligné pour un mot qui ressemble).
     */
    function scanLatin(text, idx, {force = false} = {}) {
        if (!idx) return [];
        const W = words(String(text || '').replace(/ꝰ/g, 'us')), out = [];
        for (let i = 0; i < W.length; i++) {
            let hit = null;
            for (const [ks, e] of idx.many) { if (ks.every((k, j) => W[i + j]?.k === k)) { hit = {n: ks.length, e}; break; } }
            if (hit) { const e = W[i + hit.n - 1].e; out.push({s: W[i].s, e, word: String(text).slice(W[i].s, e), item: hit.e}); i += hit.n - 1; continue; }
            const e = idx.one.get(W[i].k); if (e) out.push({s: W[i].s, e: W[i].e, word: W[i].w, item: e});
        }
        if (force) return out;
        const strong = new Set(out.filter(h => fold(h.word).length >= 6 || /\s/.test(h.word)).map(h => fold(h.word)));
        return strong.size >= 2 ? out : [];
    }
    /** 🏛 les formules entières (« Anno Domini … die … mensis … baptizatus est … ») : leurs morceaux dans l'ordre, pas trop loin l'un de l'autre */
    function latinFormulas(text, entries) {
        const t = fold(String(text || '').replace(/ꝰ/g, 'us')).replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' '), out = [];
        (entries || []).filter(e => e && String(e.t || '').includes('…')).forEach(e => {
            const parts = fold(e.t).split('…').map(p => p.replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim()).filter(p => p.length >= 2);
            if (!parts.length) return;
            let at = -1, ok = true, first = -1;
            for (const p of parts) { const re = new RegExp(`(^|\\s)${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'g'); re.lastIndex = Math.max(0, at); const m = re.exec(t); if (!m || (at >= 0 && m.index - at > 160)) { ok = false; break; } if (first < 0) first = m.index; at = m.index + m[0].length; }
            if (ok) out.push({item: e, at: first});
        });
        return out.sort((a, b) => a.at - b.at).map(x => x.item);
    }

    /* ═════════ 🔊 Lire à voix haute : les lignes ═════════ */
    const PAGE_MARK = /^—[ \t]*[\p{L}.]+[ \t]+\d+[^\n—]*—[ \t]*$/u;
    function readLines(text) {
        const out = []; let pos = 0;
        for (const raw of String(text ?? '').split('\n')) { const s = pos; pos += raw.length + 1; const body = raw.trim(); if (!body || PAGE_MARK.test(raw)) continue; const lead = raw.length - raw.trimStart().length; out.push({s: s + lead, e: s + lead + body.length, text: body}); }
        return out;
    }
    /** ce qu'on dit d'une ligne : sans les crochets des mots douteux (« [?] » → « mot illisible »), ſ → s */
    const speakable = line => String(line || '').replace(/ſ/g, 's').replace(/\[\s*\?\s*\]|\[illisible\]/gi, ` ${i18n('mot illisible')} `).replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim();

    /* ═════════ 👥 La seconde lecture : la fiche vierge, numérotée ligne à ligne ═════════ */
    const SEP = '----------';
    function packageText({title = '', source = '', date = '', place = '', lines = 0, reader = ''} = {}) {
        const n = Math.max(1, Math.min(9999, Number(lines) || 1)), w = String(n).length < 3 ? 3 : String(n).length;
        const head = [`LCNDA — ${i18n('Seconde lecture')}`, `${i18n('Acte')} : ${title}`, source ? `${i18n('Source')} : ${source}` : '', [date, place].filter(Boolean).join(' · '),
            `${i18n('Lecteur')} : ${reader}`, i18n('Écris ta lecture après chaque « | », une ligne de l’acte par ligne. Ne regarde pas l’autre lecture avant d’avoir fini.'), SEP].filter(x => x !== '');
        return [...head, ...Array.from({length: n}, (_, i) => `${String(i + 1).padStart(w, '0')} | `)].join('\n') + '\n';
    }
    /** une fiche remplie (ou un texte collé) → {reader, body} : les lignes numérotées « 001 | … » ; sans numéros : tout le texte */
    function parsePackage(text) {
        const t = String(text || '').replace(/\r/g, ''), lines = t.split('\n'), labels = [fold(i18n('Lecteur')), 'lecteur', 'reader'];
        let reader = '';
        for (const l of lines) { const m = l.match(/^\s*([^:|]{2,30}?)\s*:\s*(.*)$/); if (m && labels.includes(fold(m[1]))) { reader = m[2].trim(); break; } }
        const num = lines.map(l => l.match(/^\s*\d{1,4}\s*\|\s?(.*)$/)).filter(Boolean);
        if (num.length) { const body = num.map(m => m[1].replace(/\s+$/, '')); while (body.length && !body[body.length - 1].trim()) body.pop(); return {reader: reader.slice(0, 60), body: body.join('\n')}; }
        const i = lines.findIndex(l => l.trim() === SEP);
        return {reader: reader.slice(0, 60), body: (i >= 0 ? lines.slice(i + 1) : lines).join('\n').trim()};
    }
    /** le nom de la lecture gardée : « reader:Anne DURAND » (lettres, chiffres, espaces, . _ - seulement : comme le serveur) */
    const readerSource = name => `reader:${String(name || '').replace(/[^\p{L}\p{N}._\- ]+/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60)}`;

    /* ═════════ 🎯 Le petit objectif du jour ═════════ */
    const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const GOAL_DEFAULT = {on: false, unit: 'line', n: 1, pile: 'todo'};
    const cleanGoal = g => { g = g && typeof g === 'object' ? g : {}; return {on: !!g.on, unit: g.unit === 'act' ? 'act' : 'line', n: Math.max(1, Math.min(50, Math.round(Number(g.n) || 1))), pile: g.pile === 'register' ? 'register' : 'todo', register: String(g.register || '').slice(0, 200)}; };
    /** {target, done, reached, unit} pour ce jour (journal : {jour: {l: {acte: lignes}, a: [actes]}}) */
    function goalStatus(goal, log, day = dayKey()) {
        const g = cleanGoal(goal), d = (log && log[day]) || {}, done = g.unit === 'act' ? new Set(d.a || []).size : Object.values(d.l || {}).reduce((x, y) => x + (Number(y) || 0), 0);
        return {unit: g.unit, target: g.n, done, reached: done >= g.n};
    }
    /** le journal gardé : les 60 derniers jours */
    const trimLog = log => Object.fromEntries(Object.entries(log && typeof log === 'object' ? log : {}).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 60));
    const countLines = text => readLines(text).length;

    /* ═════════ 🧾 Le résumé ═════════ */
    function summaryLines(s) {
        if (!s) return [];
        const when = [s.when, s.where].filter(Boolean).join(' · ');
        return [s.who ? `${i18n('Qui')} : ${s.who}` : '', s.what ? `${i18n('Quoi')} : ${s.what}` : '', when ? `${i18n('Quand, où')} : ${when}` : ''].filter(Boolean);
    }

    /* ═════════ ✍️ Les habitudes d'une main : ses abréviations les plus fréquentes ═════════ */
    function habitsOf(texts, abbrevs, max = 10) {
        const n = new Map();
        (texts || []).forEach(t => (abbrevs ? abbrevs(String(t || '')) : []).forEach(a => { const k = fold(a.word); const x = n.get(k) || {word: a.word, d: a.item?.d || '', n: 0}; x.n++; n.set(k, x); }));
        return [...n.values()].filter(x => x.n >= 2).sort((a, b) => b.n - a.n || a.word.localeCompare(b.word)).slice(0, max);
    }

    return {fold, MOTS, words, scanGlo, scanMots, latinIndex, scanLatin, latinFormulas, readLines, speakable, packageText, parsePackage, readerSource,
        dayKey, GOAL_DEFAULT, cleanGoal, goalStatus, trimLog, countLines, summaryLines, habitsOf};
});
