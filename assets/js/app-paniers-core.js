/* LCNDA — 🧺 l'onglet « Paniers » : la logique sans écran (maquette validée docs/design/onglet-paniers.html).
 * Utilisé par assets/js/app-paniers.js ; essayé seul par tests/test-onglet-paniers.js (node).
 *  - les 6 statuts d'un élément (à chercher → à demander → trouvé → vérifié → utilisé → à revoir ; un nouvel élément arrive « trouvé ») ;
 *  - « ↕ Ranger » : un seul contrôle (À la main, Nom, Catégorie, Date de l'élément, Date d'ajout, Lieu, Personne, Source, Distance, Utilisé,
 *    Taille ; « puis par… » ; ↑↓) ; groupes repliables (Catégorie, Lieu, Personne, Source, Utilisé) ; l'ordre à la main n'est jamais touché ;
 *  - le résumé en une ligne, la recherche dans un panier, les doublons, « ⇄ Comparer », « Qu'est-ce qui manque ? » ;
 *  - la recherche qui crée un panier : une phrase → ce que j'ai compris (Qui · Quand / âge · Où + rayon · Quoi · Sources), ce que je n'ai pas
 *    compris ; les catégories ciel / terre / eau / mer / militaire / patrimoine → les listes de données de l'app (LCNDA_EXT.dataLists) ;
 *    chaque sorte a son thème des listes (theme : LCNDA_EXT.dataListThemes — themeOf, byTheme) et, s'il y en a une, sa liste réunie (merged :
 *    prise quand aucune des listes de la sorte n'est installée).
 */
(function (root, factory) {
    const m = factory();
    if (typeof module === 'object' && module.exports) module.exports = m;
    if (root) { root.LCNDA_EXT = root.LCNDA_EXT || {}; root.LCNDA_EXT.paniersCore = m; }
})(typeof window !== 'undefined' ? window : null, () => {
    'use strict';
    const TT = (s, v) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'");

    /* ═════ les statuts ═════ */
    const STATUSES = [['chercher', '🔍', 'à chercher'], ['demander', '✉', 'à demander'], ['trouve', '📌', 'trouvé'], ['verifie', '☑', 'vérifié'], ['utilise', '✓', 'utilisé'], ['revoir', '↺', 'à revoir']];
    const statusOf = it => (STATUSES.some(s => s[0] === it?.status) ? it.status : Number(it?.done) ? 'utilise' : 'trouve');
    const nextStatus = s => STATUSES[(STATUSES.findIndex(x => x[0] === s) + 1) % STATUSES.length][0];

    /* ═════ ce qu'on sait d'un élément ═════ */
    const CATS = [['fiche', '📒', 'Fiches'], ['evt', '📅', 'Événements'], ['acte', '📜', 'Actes'], ['pers', '👤', 'Personnes'], ['media', '🖼', 'Médias'], ['lieu', '📍', 'Lieux et édifices'], ['donnee', '📋', 'Données'], ['note', '📝', 'Notes']];
    const KIND_CAT = {person: 'pers', event: 'evt', act: 'acte', source: 'acte', citation: 'acte', courrier: 'acte', media: 'media', place: 'lieu', note: 'note', text: 'note', reminder: 'note',
        investigation: 'fiche', atelier: 'fiche', digest: 'fiche', row: 'donnee', set: 'donnee', data: 'donnee', datum: 'donnee'};
    const catOf = it => it?.data?.cat && CATS.some(c => c[0] === it.data.cat) ? it.data.cat : KIND_CAT[it?.kind] || 'donnee';
    const YEAR = /(?:^|[^\d])(1[0-9]\d\d|20[0-4]\d)(?!\d)/;
    function yearOf(it) {
        const d = it?.data || {};
        if (Number.isFinite(Number(d.y)) && d.y !== null && d.y !== '') return Number(d.y);
        if (Number.isFinite(Number(d.year)) && d.year) return Number(d.year);
        const m = String(`${it?.title || ''} ${it?.value || ''}`).match(YEAR);
        return m ? Number(m[1]) : null;
    }
    const placeOf = it => String(it?.data?.place || it?.data?.pl || '').trim() || '';
    function personOf(it) {
        if (it?.kind === 'person') return String(it.title || '').replace(/\s*\(.*$/, '').trim();
        return String(it?.data?.who || '').trim();
    }
    const sourceOf = it => String(it?.origin?.label || it?.data?.source || '').trim();
    const kmOf = it => { const k = it?.data?.km ?? it?.data?._km; return Number.isFinite(Number(k)) && k !== null && k !== '' ? Number(k) : null; };
    const sizeOf = it => (Array.isArray(it?.data?.rows) ? it.data.rows.length : Number(it?.data?.size) || String(it?.value || '').length / 1000);
    const addedOf = it => String(it?.created_at || '') + String(1e9 + Number(it?.id || 0));

    /* ═════ « ↕ Ranger » ═════ */
    const SORTS = [['main', 'À la main'], ['nom', 'Nom A→Z'], ['cat', 'Catégorie'], ['date', 'Date de l’élément'], ['ajout', 'Date d’ajout'], ['lieu', 'Lieu'], ['pers', 'Personne'], ['src', 'Source'], ['dist', 'Distance'], ['used', 'Utilisé'], ['taille', 'Taille']];
    const KEY = {nom: it => fold(it.title), cat: it => CATS.findIndex(c => c[0] === catOf(it)), date: it => yearOf(it) ?? 99999, ajout: addedOf, lieu: it => fold(placeOf(it) || '~'), pers: it => fold(personOf(it) || '~'),
        src: it => fold(sourceOf(it) || '~'), dist: it => kmOf(it) ?? 99999, used: it => (statusOf(it) === 'utilise' ? 0 : 1), taille: it => -sizeOf(it)};
    const GROUP = {cat: it => { const c = CATS.find(x => x[0] === catOf(it)) || CATS[6]; return `${c[1]} ${c[2]}`; }, lieu: it => (placeOf(it) ? `📍 ${placeOf(it)}` : 'Sans lieu'),
        pers: it => (personOf(it) ? `👤 ${personOf(it)}` : 'Personne en particulier'), src: it => sourceOf(it) || 'Sans source', used: it => (statusOf(it) === 'utilise' ? '✓ Utilisés' : 'Pas encore utilisés')};
    const normSort = s => ({k: SORTS.some(x => x[0] === s?.k) ? s.k : 'main', then: SORTS.some(x => x[0] === s?.then) && s.then !== 'main' && s.then !== s?.k ? s.then : '', dir: Number(s?.dir) < 0 ? -1 : 1, closed: Array.isArray(s?.closed) ? s.closed.slice(0, 50) : []});
    /** les éléments rangés (sans toucher à leur ordre à la main : on rend une copie) → [{key, items}] (key '' : pas de groupes) */
    function arrange(items, sort) {
        const s = normSort(sort), list = [...(items || [])].sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0));
        if (s.k === 'main') return [{key: '', items: list}];
        const cmp = k => (a, b) => { const x = KEY[k](a), y = KEY[k](b); return x < y ? -1 : x > y ? 1 : 0; };
        // les « sans date / sans lieu… » restent en bas, même ↓
        const arr = list.sort((a, b) => (cmp(s.k)(a, b) * (s.dir < 0 && !(KEY[s.k](a) === 99999 || KEY[s.k](b) === 99999) ? -1 : 1)) || (s.then ? cmp(s.then)(a, b) * s.dir : 0));
        if (!GROUP[s.k]) return [{key: '', items: arr}];
        const out = []; arr.forEach(it => { const g = GROUP[s.k](it); let b = out.find(x => x.key === g); if (!b) out.push(b = {key: g, items: []}); b.items.push(it); });
        return out;
    }
    const sortLabel = (sort, T = TT) => { const s = normSort(sort), L = k => T((SORTS.find(x => x[0] === k) || SORTS[0])[1]); return s.k === 'main' ? T('À la main') : `${L(s.k)}${s.then ? ', ' + T('puis') + ' ' + L(s.then) : ''} ${s.dir > 0 ? '↑' : '↓'}`; };

    /* ═════ le résumé, la recherche, les doublons, comparer, ce qui manque ═════ */
    function summary(items, T = TT) {
        const ys = items.map(yearOf).filter(y => y != null), pl = new Set(items.map(placeOf).filter(Boolean)), sr = new Set(items.map(sourceOf).filter(Boolean)), u = items.filter(i => statusOf(i) === 'utilise').length;
        return [T('{n} éléments', {n: items.length}), ys.length ? `${Math.min(...ys)}–${Math.max(...ys)}` : '', pl.size ? T('{n} lieux', {n: pl.size}) : '', sr.size ? T('{n} sources', {n: sr.size}) : '', T('{n} utilisés', {n: u})].filter(Boolean).join(' · ');
    }
    const hay = it => fold([it.title, it.value, it.note, placeOf(it), personOf(it), sourceOf(it)].join(' '));
    const findIn = (items, q) => { const w = fold(q).split(/\s+/).filter(Boolean); return w.length ? items.filter(it => { const h = hay(it); return w.every(x => h.includes(x)); }) : items; };
    const dupKey = it => `${fold(it.title).replace(/\s+/g, ' ').trim()}|${fold(it.value).replace(/\s+/g, ' ').trim()}`;
    const sameKey = it => (it.ref_id && it.kind ? `${it.kind}#${it.ref_id}` : dupKey(it));
    function compare(a, b) {
        const ka = new Map(a.map(x => [sameKey(x), x])), kb = new Map(b.map(x => [sameKey(x), x]));
        return {onlyA: a.filter(x => !kb.has(sameKey(x))), both: a.filter(x => kb.has(sameKey(x))), onlyB: b.filter(x => !ka.has(sameKey(x)))};
    }
    /** « Qu'est-ce qui manque ? » : des pistes simples, honnêtes, d'après ce qu'il y a déjà dedans */
    function missing(items, basket = {}, T = TT) {
        const out = [], st = s => items.filter(i => statusOf(i) === s);
        if (!items.length) return [{k: 'vide', t: T('Le panier est vide : commence par « 🔍 Créer un panier par une recherche… » ou « ＋ Ajouter ».')}];
        if (st('chercher').length) out.push({k: 'chercher', t: T('{n} éléments sont encore « à chercher ».', {n: st('chercher').length})});
        if (st('demander').length) out.push({k: 'demander', t: T('{n} éléments sont « à demander » : prépare les lettres de demande ou la fiche de sortie aux archives.', {n: st('demander').length})});
        const noSrc = items.filter(i => !sourceOf(i) && i.kind !== 'note'); if (noSrc.length) out.push({k: 'source', t: T('{n} éléments n’ont pas de source.', {n: noSrc.length})});
        const noDate = items.filter(i => yearOf(i) == null); if (noDate.length && noDate.length < items.length) out.push({k: 'date', t: T('{n} éléments n’ont pas de date (ils manquent sur la frise).', {n: noDate.length})});
        const noPlace = items.filter(i => !placeOf(i) && !(i.data?.lat != null)); if (noPlace.length && noPlace.length < items.length) out.push({k: 'lieu', t: T('{n} éléments n’ont pas de lieu (ils manquent sur la carte).', {n: noPlace.length})});
        const persons = items.filter(i => i.kind === 'person'), acts = items.filter(i => ['act', 'source', 'citation'].includes(i.kind));
        if (persons.length && !acts.length) out.push({k: 'acte', t: T('Des personnes, mais aucun acte ni source : un acte de naissance ou de mariage ?')});
        if (/mariage/.test(fold(basket.name)) && !items.some(i => /contrat/.test(fold(i.title)))) out.push({k: 'contrat', t: T('Un mariage sans contrat de mariage : cherche chez le notaire (série E).')});
        if (/mariage/.test(fold(basket.name)) && !items.some(i => /ban/.test(fold(i.title)))) out.push({k: 'bans', t: T('Les publications des bans (quelques semaines avant le mariage).')});
        if (!(basket.dests || []).length) out.push({k: 'dest', t: T('Ce panier ne va encore nulle part : choisis ses destinations habituelles.')});
        return out;
    }

    /* ═════ la recherche qui crée un panier ═════ */
    /* chaque sorte : son monde, son icône, ses mots, ses listes (LCNDA_EXT.dataLists : la première installée sert), local (autour du lieu) ou non */
    const SMART = [
        {k: 'bat', theme: 'guerres', merged: 'reunie_batailles', w: 'militaire', icon: '⚔️', label: 'batailles et sièges', re: /bataill|siege|combat|guerre/, lists: ['ha_batailles'], local: true},
        {k: 'reg', theme: 'guerres', w: 'militaire', icon: '🎖️', label: 'régiments, gardes', re: /regiment|garnison|garde nationale|soldat/, lists: ['l8b_regiments_ville', 'l8b_regiments'], local: true},
        {k: 'cas', theme: 'guerres', w: 'militaire', icon: '🪖', label: 'casernes, fortifications', re: /caserne|fortif|rempart|citadelle/, lists: ['lp_merimee'], local: true, q: 'caserne fort tour rempart'},
        {k: 'mon', theme: 'guerres', w: 'militaire', icon: '🪦', label: 'monuments aux morts', re: /monument.{0,6}morts/, lists: ['pm_monuments'], local: true},
        {k: 'com', theme: 'ciel', w: 'ciel', icon: '☄️', label: 'comètes', re: /comete/, lists: ['ciel_cometes'], only: {kind: 'comète'}},
        {k: 'aur', theme: 'ciel', w: 'ciel', icon: '🌌', label: 'aurores', re: /aurore/, lists: ['ciel_cometes'], only: {kind: 'aurore'}},
        {k: 'ecl', theme: 'ciel', w: 'ciel', icon: '🌒', label: 'éclipses', re: /eclipse/, lists: ['eclipses'], near: true},
        {k: 'cie', theme: 'ciel', w: 'ciel', icon: '🌅', label: 'ciels étranges', re: /ciels? etrange|coucher/, lists: ['l8a_ciels']},
        {k: 'sei', theme: 'seismes', merged: 'reunie_seismes', w: 'terre', icon: '🌍', label: 'séismes', re: /seisme|tremblement/, lists: ['hist_seismes'], local: true, km: 150},
        {k: 'vol', theme: 'seismes', merged: 'reunie_eruptions', w: 'terre', icon: '🌋', label: 'éruptions', re: /eruption|volcan/, lists: ['l10t_volcans']},
        {k: 'tem', theme: 'ciel', w: 'terre', icon: '🌪', label: 'tempêtes', re: /tempete|ouragan/, lists: ['hist_tempetes'], missingText: 'Les tempêtes : il n’y a pas encore de liste des tempêtes anciennes dans l’app.'},
        {k: 'inn', theme: 'eaux', merged: 'reunie_crues', w: 'eau', icon: '🌊', label: 'inondations, crues', re: /inondation|crue/, lists: ['hist_crues'], local: true, km: 30},
        {k: 'mar', theme: 'eaux', w: 'mer', icon: '🌊', label: 'grandes marées', re: /maree/, lists: ['l8a_marees', 'l8a_maree'], local: true, km: 30},
        {k: 'chat', theme: 'monuments', w: 'patrimoine', icon: '🏰', label: 'châteaux', re: /chateau/, lists: ['chateaux', 'cht_chateaux'], local: true},
        {k: 'mh', theme: 'monuments', merged: 'reunie_monuments', w: 'patrimoine', icon: '🏛', label: 'monuments historiques', re: /monument historique|merimee|eglise/, lists: ['lp_merimee'], local: true},
    ];
    /** 🗂 le thème d'une sorte (LCNDA_EXT.dataListThemes, app-listes-themes.js) : {id, icon, label} ; themes : le registre (sinon celui de la page) */
    function themeOf(k, themes = null) {
        const c = SMART.find(x => x.k === k); if (!c || !c.theme) return null;
        const reg = Array.isArray(themes) ? themes : (typeof window !== 'undefined' && Array.isArray(window.LCNDA_EXT?.dataListThemes) ? window.LCNDA_EXT.dataListThemes : []);
        const t = reg.find(x => x && x.id === c.theme);
        return t ? {id: t.id, icon: t.icon, label: t.label} : {id: c.theme, icon: '', label: ''};
    }
    /** les sortes rangées par thème (l'ordre des thèmes du registre) : [{theme, kinds: [k…]}] */
    function byTheme(themes = null) {
        const out = [];
        SMART.forEach(c => { const t = themeOf(c.k, themes) || {id: '', icon: '', label: ''}; let g = out.find(x => x.theme.id === t.id); if (!g) out.push(g = {theme: t, kinds: []}); g.kinds.push(c.k); });
        return out;
    }
    const WORLDS = {militaire: /milit|guerre|armee/, ciel: /\bciel\b|dans le ciel/, terre: /sur terre|\bterre\b/, eau: /\beau\b|riviere/, mer: /\bmer\b|ocean/, patrimoine: /patrimoine/};
    const TREE = [['nai', /naissance|bapteme|\bnes\b|\bnee?s?\b/, ['BIRT', 'BAPM', 'CHR'], '👶 naissances, baptêmes'], ['mar', /mariage|maries/, ['MARR'], '💍 mariages'], ['dec', /deces|morts?\b|sepulture|inhum/, ['DEAT', 'BURI'], '🕯 décès, sépultures']];
    const STOPW = new Set('de du des la le les l d a au aux en et ou dans sur pour avec autour pres km entre ans an annee annees ce qu qui que quoi a pu voir vu enfant famille naissances naissance mariages deces les evenements evenement militaires militaire ciel mer terre chateau'.split(' '));

    /** une phrase → ce que j'ai compris : {text, who, age, years, km, around, place, surname, tree, cats, nope} */
    function parseSmart(q) {
        const text = String(q || '').trim(), f = ' ' + fold(text).replace(/[’']/g, ' ').replace(/[,;:!?()]/g, ' ').replace(/\s+/g, ' ') + ' ';
        const u = {text, who: null, age: null, years: null, km: null, around: null, place: null, surname: '', tree: null, cats: [], nope: []};
        let m;
        // « à 4 km autour du château de Rochefière », « dans un rayon de 5 km de Treignac », « à moins de 3 km du bourg »
        if ((m = f.match(/ (\d+(?:[.,]\d+)?) ?km (?:autour |pres |de |d |du |des |de la |a |a la |au |autour de |autour du |autour des |autour de la |autour d )*([a-z][a-z' -]*?)(?= entre | de \d| en \d| depuis | pendant | avant | apres | dans | $)/))) {
            u.km = Number(m[1].replace(',', '.')); u.around = {name: restore(text, m[2].trim())};
        } else if ((m = f.match(/ autour (?:du |de la |des |de |d )([a-z][a-z' -]*?)(?= entre | de \d| en \d| $)/))) { u.around = {name: restore(text, m[1].trim())}; }
        // « entre 10 et 12 ans », « de 10 à 12 ans », « à 10 ans », « enfant »
        if ((m = f.match(/ (?:entre|de) (\d{1,3}) (?:et|a) (\d{1,3}) ans /))) u.age = [Number(m[1]), Number(m[2])];
        else if ((m = f.match(/ (?:a|vers) (\d{1,3}) ans /))) u.age = [Number(m[1]), Number(m[1])];
        else if (/ enfant /.test(f)) u.age = [5, 12];
        if ((m = f.match(/ (?:entre|de) (\d{4}) (?:et|a) (\d{4}) /))) u.years = [Number(m[1]), Number(m[2])].sort((a, b) => a - b);
        else if ((m = f.match(/ (?:en|annee) (\d{4}) /))) u.years = [Number(m[1]), Number(m[1])];
        // qui : « Jean MAZAUD » (un nom en capitales, et son prénom avant)
        const caps = [...text.matchAll(/((?:[A-ZÀ-Ý][a-zà-ÿ'-]+\s+){0,2})([A-ZÀ-Ý][A-ZÀ-Ý'-]{2,}(?:\s+[A-ZÀ-Ý][A-ZÀ-Ý'-]{2,})?)/g)];
        const treeKind = TREE.find(t => t[1].test(f));
        if (caps.length) {
            const c = caps[0], first = c[1].trim(), last = c[2].trim();
            if (first && !/^(Les|La|Le|De|Du|Des)$/i.test(first.split(/\s+/)[0])) u.who = {name: `${first} ${last}`.trim()};
            if (treeKind || !first) u.surname = last;
            if (treeKind && first && /famille/i.test(text)) { u.surname = last; u.who = null; }
        }
        if (treeKind) u.tree = {k: treeKind[0], tags: treeKind[2], label: treeKind[3]};
        // où : « à Treignac », « de Treignac » (pas le centre d'un rayon)
        if (!u.around && (m = text.match(/(?:^|\s)(?:à|a|dans|sur la commune de)\s+((?:[A-ZÀ-Ý][\wÀ-ÿ'-]*)(?:[\s-](?:sur|en|de|la|le|les|d'|du)?\s*[A-ZÀ-Ý][\wÀ-ÿ'-]*)*)/))) { if (!/^\d/.test(m[1]) && m[1] !== u.surname) u.place = {name: m[1].trim()}; }
        // quoi
        const words = new Set();
        Object.entries(WORLDS).forEach(([w, re]) => { if (re.test(f)) SMART.filter(c => c.w === w || (w === 'terre' && c.k === 'inn')).forEach(c => words.add(c.k)); });
        SMART.forEach(c => { if (c.re.test(f)) words.add(c.k); });
        if (/ (pu voir|a vu|aurait vu|a pu vivre|a vecu) /.test(f) && !words.size) ['com', 'aur', 'ecl', 'cie', 'sei', 'vol', 'inn', 'mar'].forEach(k => words.add(k));
        if (u.around && /chateau/.test(fold(u.around.name)) && !/chateau/.test(f.replace(fold(u.around.name).replace(/'/g, ' '), ''))) words.delete('chat'); // le centre, pas ce qu'on cherche
        u.cats = SMART.filter(c => words.has(c.k)).map(c => c.k);
        // ce que je n'ai pas compris (dit honnêtement)
        if (u.cats.includes('tem')) u.nope.push(SMART.find(c => c.k === 'tem').missingText);
        if (u.around && /chateau|eglise|abbaye|moulin|tour/.test(fold(u.around.name))) u.nope.push(`« autour ${u.around.name} » : je prends ${u.around.name} comme centre, pas le bourg voisin.`);
        if (u.tree && u.surname) u.nope.push(`« la famille ${u.surname} » : je prends le nom ${u.surname} et ses variantes, pas les enfants des filles ${u.surname} (ils portent un autre nom).`);
        if (u.cats.some(k => SMART.find(c => c.k === k).w === 'militaire')) u.nope.push('« événements militaires » : il n’y a pas de liste des combats de maquis (1943–1944) ; ils peuvent manquer.');
        if (!u.cats.length && !u.tree && !u.who && !u.surname) u.nope.push('Je n’ai pas compris quoi chercher : essaie « les batailles à 10 km de Tulle », « ce qu’a pu voir Jean MAZAUD à 10 ans », « les naissances LACOMBE à Treignac entre 1780 et 1800 ».');
        const left = fold(text).split(/[^a-z0-9-]+/).filter(w => w.length > 3 && !STOPW.has(w) && !/^\d+$/.test(w) && ![u.surname, u.who?.name, u.place?.name, u.around?.name].some(x => x && fold(x).includes(w)) && !SMART.some(c => c.re.test(' ' + w + ' ')) && !Object.values(WORLDS).some(re => re.test(' ' + w + ' ')) && !TREE.some(t => t[1].test(' ' + w + ' ')));
        if (left.length) u.nope.push(`Mots pas utilisés : ${left.slice(0, 6).join(', ')}.`);
        return u;
    }
    /** le texte d'origine (avec ses majuscules et ses accents) pour un morceau trouvé dans la version pliée */
    function restore(text, folded) {
        const words = folded.split(/\s+/).length, f = fold(text).replace(/[’']/g, ' ');
        const i = f.indexOf(folded); if (i < 0) return folded;
        return text.slice(i, i + folded.length).trim() || text.split(/\s+/).slice(0, words).join(' ');
    }
    /** les années d'un âge : du jour de ses a ans à la veille de ses b+1 ans */
    function ageSpan(birth, age) {
        if (!birth || !age) return null;
        const [y, m = 1, d = 1] = String(birth).split('-').map(Number);
        const from = `${y + age[0]}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const end = new Date(Date.UTC(y + age[1] + 1, m - 1, d) - 864e5);
        return {from, to: end.toISOString().slice(0, 10), y1: y + age[0], y2: end.getUTCFullYear()};
    }
    /* ═════ 📊 la question sur les données (app-donnees-accueil.js) : la même lecture de la phrase, élargie aux mots des 20 thèmes ═════
     * parseData(q, {themes}) → ce que parseSmart comprend (qui, âge, années, km, autour de…) et en plus :
     *   themes [{id, word}] (les thèmes nommés, le plus sûr d'abord), kmTyped, family (« près des lieux de la famille »), life (« pendant
     *   sa vie »), wedding (« le jour de son mariage »), familyOnly (une question sur la famille seulement : à poser dans 🔍 Recherche),
     *   left (les mots qui comptent et que je n'ai pas lus), nope (dit honnêtement). Rien n'est cherché ici. */
    const KIN_RE = / (?:enfants?|fils|filles?|freres?|soeurs?|parents|peres?|meres?|cousins?|cousines?|oncles?|tantes?|neveux?|nieces?|ancetres|descendants?|epoux|epouse|mari|femme|grands?-parents|petits?-enfants|parrain|marraine|heritiers) (?:de|du|des|d) /;
    const DATA_STOP = new Set(('quel quels quelle quelles quand qui quoi comment combien pourquoi est il elle ils elles son sa ses leur leurs avait avaient etait etaient vivait vivaient lieux lieu vie vivant jour moins plus tous toutes tout '
        + 'les une un mon ma mes notre nos votre vos ont fait faisait passe passes gens montre montrer liste listes donnees cherche chercher trouve trouver voir depuis apres avant vers pendant durant '
        + 'janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre siecle cette annee celle celui ceux celles').split(' '));
    function parseData(q, {themes = []} = {}) {
        const u = parseSmart(q), text = u.text;
        const f = ' ' + fold(text).replace(/[’']/g, ' ').replace(/[,;:!?()«»"]/g, ' ').replace(/\s+/g, ' ') + ' ';
        let m;
        u.kmTyped = u.km != null;
        if (!u.age && (m = f.match(/ (?:avait|avaient|a eu|ayant|aura) (\d{1,3}) ans /))) u.age = [Number(m[1]), Number(m[1])];
        if (!u.years && (m = f.match(/ vers (\d{4}) /))) u.years = [Number(m[1]) - 5, Number(m[1]) + 5];
        if (!u.years && (m = f.match(/ (?:depuis|apres) (\d{4}) /))) u.years = [Number(m[1]), new Date().getFullYear()];
        if (!u.years && (m = f.match(/ avant (\d{4}) /))) u.years = [Math.max(0, Number(m[1]) - 200), Number(m[1])];
        u.family = / lieux de (?:la |ma |notre |leur )?famille | (?:pres|autour) de (?:ma|notre) famille /.test(f);
        if (u.family && u.around && /famille|lieux/.test(fold(u.around.name))) u.around = null;
        if (u.family && u.place && /famille|lieux/.test(fold(u.place.name))) u.place = null;
        if (!u.around && !u.family && (m = f.match(/ (?:pres|aupres|non loin|tout pres) (?:de la |de l |du |des |de |d )([a-z][a-z' -]*?)(?= entre | en \d| de \d| depuis | pendant | quand | avant | apres | vers | du vivant | dans | $)/))) u.around = {name: restore(text, m[1].trim())};
        u.life = / (?:pendant|durant|de) (?:la|sa|toute sa|leur) vie | du vivant | de son vivant /.test(f);
        u.wedding = / (?:jour|date) (?:du|de son|de leur) mariage /.test(f);
        if (u.wedding) u.tree = null;
        // les noms (personne, lieu) ne comptent pas comme des mots de thème
        const names = [u.who?.name, u.surname, u.place?.name, u.around?.name].filter(Boolean).map(x => fold(x).replace(/[’']/g, ' '));
        let g = f; names.forEach(n => { g = g.split(` ${n} `).join(' · '); });
        const hits = [];
        (Array.isArray(themes) ? themes : []).forEach((t, ti) => {
            if (!t || !t.id) return;
            let best = '';
            for (const w0 of t.words || []) {
                const w = fold(w0).replace(/[’']/g, ' ').trim(); if (w.length < 3) continue;
                const ok = w.length <= 4 ? new RegExp(` ${w}s? `).test(g) : g.includes(` ${w}`);
                if (ok && w.length > best.length) best = w;
            }
            if (best) hits.push({id: t.id, word: best, ti});
        });
        u.themes = hits.sort((a, b) => b.word.length - a.word.length || a.ti - b.ti).map(({id, word}) => ({id, word}));
        if (!u.themes.length) u.cats.forEach(k => { const c = SMART.find(x => x.k === k); if (c?.theme && !u.themes.some(x => x.id === c.theme)) u.themes.push({id: c.theme, word: c.label}); });
        u.familyOnly = !u.themes.length && (KIN_RE.test(f) || !!u.tree || ((!!u.who || !!u.surname) && !u.around && !u.family));
        const used = u.themes.map(x => x.word);
        u.left = fold(text).replace(/[’']/g, ' ').split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOPW.has(w) && !DATA_STOP.has(w) && !/^\d+$/.test(w) && !(u.wedding && /^mariage/.test(w))
            && !names.some(n => n.split(/[\s-]+/).includes(w)) && !used.some(x => x.split(' ').some(p => p.length > 3 && (w.startsWith(p) || p.startsWith(w))))
            && !(themes || []).some(t => (t?.words || []).some(x => { const p = fold(x); return p.length > 3 && !p.includes(' ') && w.startsWith(p); })) && !/^(km|ans?)$/.test(w));
        u.nope = [];
        if (u.left.length && !u.familyOnly) u.nope.push({k: 'left', words: u.left.slice(0, 6)});
        if (!u.themes.length && !u.familyOnly) u.nope.push({k: 'what'});
        return u;
    }
    /** un nom et ses variantes simples (LACOMBE, LACOMBES, LA COMBE) */
    const nameKey =s => fold(s).replace(/[^a-z]/g, '').replace(/s$/, '');
    const nameMatch = (a, b) => { const x = nameKey(a), y = nameKey(b); return !!x && !!y && (x === y || (x.length > 4 && (x.startsWith(y) || y.startsWith(x)) && Math.abs(x.length - y.length) <= 1)); };
    const km = (a, b, c, d) => { const R = Math.PI / 180, x = Math.sin((c - a) * R / 2) ** 2 + Math.cos(a * R) * Math.cos(c * R) * Math.sin((d - b) * R / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };

    return {fold, STATUSES, statusOf, nextStatus, CATS, catOf, yearOf, placeOf, personOf, sourceOf, kmOf, sizeOf, SORTS, normSort, arrange, sortLabel, GROUP,
        summary, findIn, dupKey, sameKey, compare, missing, SMART, WORLDS, TREE, parseSmart, ageSpan, nameMatch, km, themeOf, byTheme, parseData};
});
