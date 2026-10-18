/* LCNDA — 🔎 Vérifier les faits d'un texte : quand un texte (livre, mise en page) cite une personne de la base avec une naissance,
 * un baptême, un décès, une inhumation ou un mariage, la date et le lieu écrits sont comparés à ceux de la fiche.
 * « Jean MARTIN, né le 28 août 1923 à Tulle » → la fiche dit 1922 : signalé. Rien n'est changé : on corrige le texte ou la fiche.
 * Aussi : les âges impossibles ou qui contredisent la fiche (« mort à 140 ans », « marié à 9 ans »), les noms mal écrits
 * (« Jean MARTAIN » → « MARTIN ? »), les lieux inconnus de la base (le plus proche est proposé), les numéros Sosa faux,
 * les dates impossibles (« 30 février »). Serveur : person_names&facts=1, sosa_map, layout_check_data (lib/layout_extra.php).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’‘]/g, "'");
    const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
    const GED_M = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const WHAT = {BIRT: 'naissance', BAPM: 'baptême', DEAT: 'décès', BURI: 'inhumation', MARR: 'mariage'}, FEM = {BIRT: 1, BURI: 1};
    const the = t => (FEM[t] ? 'la ' : 'le ') + WHAT[t], an = t => (FEM[t] ? 'une ' : 'un ') + WHAT[t];
    // les mots qui annoncent un fait (texte sans accents, en minuscules)
    const KEYS = [
        ['BIRT', /\b(nee?s?|nait|naquit|naissance|vient au monde|vint au monde|voit le jour|vit le jour)\b/g],
        ['BAPM', /\b(baptisee?s?|bapteme|ondoiee?)\b/g],
        ['DEAT', /\b(decedee?s?|decede|deces|morte?s?|meurt|mourut|s'eteint|s'eteignit|disparait|disparut)\b/g],
        ['BURI', /\b(inhumee?s?|inhumation|enterree?s?|obseques)\b/g],
        ['MARR', /\b(epouse|epousa|epousent|epouserent|mariee?s?|mariage|se marie|se marient|se marierent|unis?)\b/g],
    ];
    const APPROX = /\b(vers|environ|abt|est|cal|avant|apres|bef|aft|entre|bet|and|circa|ca)\b|~|\?/i;

    let cache = null, loading = null;
    const sosaMaps = new Map(), placeCache = new Map(); // numéros Sosa (par personne de départ) ; lieux déjà vérifiés auprès du serveur
    async function facts() {
        if (cache) return cache; if (loading) return loading;
        loading = A().api('person_names', {facts: 1}).then(r => {
            const byKey = new Map(), add = (k, p) => { if (!k || k.split(' ').length < 2) return; const l = byKey.get(k) || []; if (!l.includes(p)) l.push(p); byKey.set(k, l); };
            (r.persons || []).forEach(p => { const f = norm(p.f).trim(), l = norm(p.l).trim(); if (!l) return; const f1 = f.split(/[\s-]+/)[0];
                add(`${f} ${l}`, p); add(`${f1} ${l}`, p); if (p.m) add(`${f} ${norm(p.m)} ${l}`, p); add(`${l} ${f}`, p); add(`${l} ${f1}`, p); });
            // pour les noms mal écrits : les noms de famille connus, et les prénoms portés avec chacun
            const lasts = new Map(); (r.persons || []).forEach(p => { const l = norm(p.l).trim(); if (!l) return; const e = lasts.get(l) || {raw: String(p.l || '').trim(), firsts: new Map()}; const f = norm(p.f).trim().split(/[\s-]+/)[0]; if (f) e.firsts.set(f, String(p.f || '').trim().split(/[\s-]+/)[0]); lasts.set(l, e); });
            cache = {byKey, lasts, maxWords: Math.max(2, ...[...byKey.keys()].map(k => k.split(' ').length))}; loading = null; return cache;
        }).catch(e => { loading = null; throw e; });
        return loading;
    }
    ext.factsReset = () => { cache = null; sosaMaps.clear(); placeCache.clear(); };

    /** Une date écrite en français : {y, m, d} (m et d facultatifs) */
    function readDate(s) {
        let m = s.match(/\b(1er|\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{3,4})\b/);
        if (m) return {y: +m[3], m: MONTHS.indexOf(m[2]) + 1, d: m[1] === '1er' ? 1 : +m[1], at: m.index, len: m[0].length};
        m = s.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/); if (m) return {y: +m[3], m: +m[2], d: +m[1], at: m.index, len: m[0].length};
        m = s.match(/\b(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{3,4})\b/); if (m) return {y: +m[2], m: MONTHS.indexOf(m[1]) + 1, at: m.index, len: m[0].length};
        m = s.match(/\b(1[0-9]{3}|20[0-9]{2})\b/); if (m) return {y: +m[1], at: m.index, len: m[0].length};
        return null;
    }
    /** La date d'une fiche (texte libre ou GEDCOM) */
    function dbDate(ev) {
        const t = norm(ev[1]); let d = null, mo = null;
        let m = t.match(/\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/); if (m) { d = +m[1]; mo = MONTHS.indexOf(m[2]) + 1; }
        else if ((m = t.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/))) { d = +m[1]; mo = GED_M.indexOf(m[2]) + 1; }
        else if ((m = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-]\d{4}\b/))) { d = +m[1]; mo = +m[2]; }
        else if ((m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) { d = +m[3]; mo = +m[2]; }
        else if ((m = t.match(/\b(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/))) mo = MONTHS.indexOf(m[1]) + 1;
        const y = ev[2] || +(t.match(/\b(\d{4})\b/) || [])[1] || null;
        return {y, m: mo, d, approx: APPROX.test(ev[1] || '')};
    }
    const placeIn = s => { const m = s.match(/^[^.;]{0,40}?(?:^|[\s,(])(?:à|a|au|aux|en)\s+((?:la |le |les |l['’])?\p{Lu}[\p{L}'’-]+(?:[\s-](?:sur|sous|en|le|la|les|de|du|des|d['’]|l['’]|\p{Lu}[\p{L}'’-]+))*)/u); return m ? m[1].replace(/[\s-]+(?:sur|sous|en|le|la|les|de|du|des)$/, '') : ''; };
    const samePlace = (a, b) => { const x = norm(a).replace(/[^a-z0-9]+/g, ' ').trim(), y = norm(b).split(',')[0].replace(/[^a-z0-9]+/g, ' ').trim(); return !x || !y || x.includes(y) || y.includes(x); };
    const fmt = ev => [ev[1] || (ev[2] ? String(ev[2]) : ''), ev[3] ? `à ${ev[3]}` : ''].filter(Boolean).join(' ');


    /* ── les autres vérifications : dates et âges impossibles, noms mal écrits, lieux inconnus, numéros Sosa ── */
    const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const DIM = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    /** Les dates qui n'existent pas : « 30 février 1850 », « 31/04/1902 », « 12/13/1900 » */
    function badDates(low, raw) {
        const out = [], said = m => raw.substr(m.index, m[0].length).trim();
        for (const m of low.matchAll(/\b(1er|\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(\d{3,4}))?\b/g)) {
            const d = m[1] === '1er' ? 1 : +m[1], mo = MONTHS.indexOf(m[2]) + 1, y = m[3] ? +m[3] : 0, max = mo === 2 ? (y && !leap(y) ? 28 : 29) : DIM[mo - 1];
            if (d < 1 || d > max) out.push({at: m.index, said: said(m), why: d === 29 && mo === 2 ? `${y} n’est pas une année bissextile (février n’a que 28 jours)` : d < 1 ? 'il n’y a pas de jour 0' : `${MONTHS_FR[mo - 1]} n’a que ${max} jours`});
        }
        for (const m of low.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g)) {
            const d = +m[1], mo = +m[2], y = +m[3];
            if (mo < 1 || mo > 12) { out.push({at: m.index, said: said(m), why: 'il n’y a que 12 mois'}); continue; }
            const max = mo === 2 ? (leap(y) ? 29 : 28) : DIM[mo - 1];
            if (d < 1 || d > max) out.push({at: m.index, said: said(m), why: `${MONTHS_FR[mo - 1]} ${y} n’a que ${max} jours`});
        }
        return out;
    }
    /** Distance d'édition (lettres ajoutées, enlevées, changées ; deux lettres inversées comptent pour une) */
    function lev(a, b) {
        if (a === b) return 0; const m = a.length, n = b.length; if (!m || !n) return m || n;
        let p2 = null, p = Array.from({length: n + 1}, (_, j) => j);
        for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) { c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) c[j] = Math.min(c[j], p2[j - 2] + 1); } p2 = p; p = c; }
        return p[n];
    }
    const near = (a, b) => lev(a, b) <= (a.length >= 7 ? 2 : 1);
    /** L'âge à un événement d'après la fiche : [au moins, au plus] (null si une date manque) */
    function ageRange(evB, evE) {
        const b = dbDate(evB), e = dbDate(evE); if (!b.y || !e.y) return null;
        const a = e.y - b.y; let r = b.m && e.m && b.d && e.d ? [a - ((e.m < b.m || (e.m === b.m && e.d < b.d)) ? 1 : 0)] : [a - 1, a];
        if (r.length === 1) r = [r[0], r[0]];
        if (b.approx || e.approx) r = [r[0] - 2, r[1] + 2];
        return r;
    }
    const yearOf = ev => ev ? (dbDate(ev).y || '?') : '?';
    async function sosaMapFor(root) {
        if (!root) return null; if (sosaMaps.has(root)) return sosaMaps.get(root);
        const pr = A().api('sosa_map', {root_id: root}).then(r => (r?.root_id ? {root: Number(r.root_id), name: r.root_name || '', map: r.map || {}, multi: r.multi && !Array.isArray(r.multi) ? r.multi : {}} : null)).catch(() => null);
        sosaMaps.set(root, pr); return pr;
    }
    const sosaOf = (sm, id) => { const l = sm.multi[String(id)]; return Array.isArray(l) && l.length ? l.map(Number) : sm.map[String(id)] ? [Number(sm.map[String(id)])] : []; };

    /**
     * blocks : [{page, id, text}] → [{lvl, page, id, text, person}]
     * Le sujet d'un fait est la dernière personne nommée avant le mot (« Jean MARTIN … il naquit en 1922 » aussi).
     */
    async function check(blocks) {
        const {byKey, lasts, maxWords} = await facts(), out = [], seen = new Set();
        const allFirsts = new Set(); lasts.forEach(e => e.firsts.forEach((_, f) => allFirsts.add(f)));
        const findNames = (words, raw) => { const ms = []; for (let i = 0; i < words.length; i++) for (let n = Math.min(maxWords, words.length - i); n >= 2; n--) {
            const ps = byKey.get(words.slice(i, i + n).map(x => x.w).join(' '));
            if (ps) { ms.push({at: words[i].at, end: words[i + n - 1].end, ps: [...ps], name: raw.slice(words[i].at, words[i + n - 1].end)}); i += n - 1; break; } } return ms; };
        const placeAsk = [], sosaClaims = [];
        for (const b of blocks) {
            const raw = String(b.text || ''); if (!raw.trim()) continue;
            const low = norm(raw);
            // 0. les dates qui n'existent pas (30 février…)
            badDates(low, raw).forEach(x => { const key = `${b.id}|bd|${x.at}`; if (seen.has(key)) return; seen.add(key); out.push({lvl: 'err', page: b.page, id: b.id, text: `📅 Date impossible : « ${x.said} » — ${x.why}.`}); });
            // 0 bis. les noms mal écrits : « Prénom NOM » qui ressemble à une fiche sans y être (« Jean MARTAIN » → « MARTIN ? »)
            for (const m of raw.matchAll(/(?<![\p{L}'’-])(\p{Lu}[\p{Ll}'’]+(?:-\p{Lu}[\p{Ll}'’]+)?)\s+(\p{Lu}{2}[\p{Lu}'’-]*(?:\s\p{Lu}{2}[\p{Lu}'’-]*)?)(?![\p{L}'’-])/gu)) {
                const f = norm(m[1]).split('-')[0], l = norm(m[2]).trim(); if (l.length < 3) continue;
                const e = lasts.get(l); let fix = '';
                if (e) { if (e.firsts.has(f) || allFirsts.has(f) || f.length < 3) continue; const g = [...e.firsts.keys()].filter(x => near(f, x)).sort((x, y) => lev(f, x) - lev(f, y))[0]; if (g) fix = `${e.firsts.get(g)} ${e.raw}`; }
                else if (l.length >= 4 && allFirsts.has(f)) { const c = [...lasts.keys()].filter(x => Math.abs(x.length - l.length) <= 2 && near(l, x)).sort((x, y) => (lasts.get(y).firsts.has(f) - lasts.get(x).firsts.has(f)) || lev(l, x) - lev(l, y))[0]; if (c) fix = `${m[1]} ${lasts.get(c).raw}`; }
                if (!fix) continue; const key = `${b.id}|nm|${norm(m[0])}`; if (seen.has(key)) continue; seen.add(key);
                out.push({lvl: 'warn', page: b.page, id: b.id, text: `✍️ « ${m[0].replace(/\s+/g, ' ')} » : aucune fiche à ce nom. Tu voulais écrire « ${fix} » ?`});
            }
            // 1. les personnes nommées (deux ou trois mots de suite qui forment un nom connu)
            const words = [...low.matchAll(/[a-z0-9'-]+/g)].map(m => ({w: m[0], at: m.index, end: m.index + m[0].length}));
            const mentions = findNames(words, raw);
            // le nom en titre de la page (une fiche par page) : sujet des lignes « Naissance — Tulle » qui ne nomment personne
            const ctx = (b.ctx || []).map(t => { const lw = norm(t), ws = [...lw.matchAll(/[a-z0-9'-]+/g)].map(m => ({w: m[0], at: m.index, end: m.index + m[0].length})), ms = findNames(ws, t); return ms.length === 1 && ms[0].end - ms[0].at >= lw.trim().length * .6 ? ms[0] : null; }).find(Boolean);
            const lineOf = i => [raw.lastIndexOf('\n', i - 1) + 1, (raw.indexOf('\n', i) + 1 || raw.length + 1) - 1];
            // un nom seul sur sa ligne (le titre d'un bloc « Jean MARTIN / 1802 – 1871 · Sosa 8 ») vaut pour les lignes suivantes du bloc
            const titleLine = i => mentions.filter(x => x.end <= i).reverse().find(x => { const [a, z] = lineOf(x.at); return (x.end - x.at) >= raw.slice(a, z).trim().length * .6; });
            // le sujet : la dernière personne nommée dans le même paragraphe ; « il », « elle » renvoient au paragraphe d'avant ;
            // une ligne qui ne nomme personne renvoie au nom en titre (du bloc ou de la page) ; sinon, on ne devine pas
            const subjectAt = (i, withTitle = false) => {
                const [ps0, pe0] = lineOf(i), before = mentions.filter(x => x.end <= i);
                const sentence = low.slice(Math.max(ps0, low.lastIndexOf('. ', i) + 1), i).trim();
                const alone = !mentions.some(x => x.at >= ps0 && x.at < pe0);
                return before.filter(x => x.at >= ps0).at(-1) || (/^(il|elle|ils|elles)\b/.test(sentence) ? before.filter(x => i - x.end < 400).at(-1) : null) || (alone && withTitle ? titleLine(i) : null) || (alone ? ctx : null) || null;
            };
            // les lieux écrits après un fait (« né à Tull ») : vérifiés auprès de la base, ensemble, à la fin
            const hits = KEYS.flatMap(([tag, re]) => [...low.matchAll(re)].map(m => ({tag, m}))).sort((x, y) => x.m.index - y.m.index);
            for (const {m} of hits) { const [, pe0] = lineOf(m.index), rawAfter = raw.slice(m.index + m[0].length, Math.min(pe0, m.index + m[0].length + 90)), dash = (rawAfter.match(/^\s*[—–]\s*(\p{Lu}[^,(\n—]*)/u) || [])[1]?.trim(); const pl = (placeIn(rawAfter) || dash || '').trim(); if (pl.length >= 3 && pl.length <= 60 && !/\d/.test(pl) && !/(?<![\p{L}])\p{Lu}{2,}(?![\p{Ll}])/u.test(pl)) placeAsk.push({b, place: pl}); } // un NOM en capitales : une personne, pas un lieu
            // les numéros Sosa cités (« Jean MARTIN, Sosa 12 ») : comparés à la fin, d'après la personne de départ
            for (const m of low.matchAll(/\bsosa\s*(?:n[°o]\s*)?(\d{1,7}(?:\s*(?:,|et|&)\s*\d{1,7})*)/g)) { const subj = subjectAt(m.index, true); if (subj) sosaClaims.push({b, subj, nums: (m[1].match(/\d+/g) || []).map(Number), said: raw.substr(m.index, m[0].length).trim()}); }
            if (!mentions.length && !ctx) {
                // sans personne nommée : seulement les âges qui ne peuvent pas exister
                for (const m of low.matchAll(/\b(?:a|au)\s+(?:l'age\s+de\s+)?(\d{1,3})\s+ans\b|\bagee?s?\s+de\s+(\d{1,3})\s+ans\b/g)) { const n = +(m[1] || m[2]); if (n > 120) out.push({lvl: 'err', page: b.page, id: b.id, text: `🎂 Âge impossible : « ${raw.substr(m.index, m[0].length).trim()} » (personne n’a vécu plus de 122 ans).`}); }
                continue;
            }
            // 1 bis. les âges écrits (« mort à 45 ans », « marié à 9 ans ») : possibles ? d'accord avec la fiche ?
            for (const m of low.matchAll(/\b(?:a|au)\s+(?:l'age\s+de\s+)?(\d{1,3})\s+ans\b|\bagee?s?\s+de\s+(\d{1,3})\s+ans\b/g)) {
                const n = +(m[1] || m[2]), said0 = raw.substr(m.index, m[0].length).trim();
                const sStart = Math.max(lineOf(m.index)[0], low.lastIndexOf('. ', m.index) + 1), sEnd = (() => { const k = low.indexOf('. ', m.index); return k < 0 ? lineOf(m.index)[1] : Math.min(k, lineOf(m.index)[1]); })();
                const near0 = hits.filter(h => h.m.index >= sStart && h.m.index < sEnd && Math.abs(h.m.index - m.index) <= 60 && ['DEAT', 'BURI', 'MARR'].includes(h.tag)).sort((x, y) => Math.abs(x.m.index - m.index) - Math.abs(y.m.index - m.index))[0];
                const tag = near0 ? (near0.tag === 'BURI' ? 'DEAT' : near0.tag) : '';
                const said = near0 ? raw.slice(Math.min(near0.m.index, m.index), Math.max(near0.m.index + near0.m[0].length, m.index + m[0].length)).replace(/\s+/g, ' ').trim().slice(0, 100) : said0;
                const key = `${b.id}|age|${m.index}`; if (seen.has(key)) continue; seen.add(key);
                if (n > 120) { out.push({lvl: 'err', page: b.page, id: b.id, text: `🎂 Âge impossible : « ${said} » (personne n’a vécu plus de 122 ans).`}); continue; }
                if (tag === 'MARR' && n < 12) { out.push({lvl: 'err', page: b.page, id: b.id, text: `🎂 Âge impossible pour un mariage : « ${said} ».`}); continue; }
                if (!tag) continue;
                const subj = subjectAt(near0.m.index, true) || subjectAt(m.index, true); if (!subj) continue;
                const res = subj.ps.map(p => { const bev = p.ev.find(e => e[0] === 'BIRT') || p.ev.find(e => e[0] === 'BAPM'); const evs = tag === 'DEAT' ? [p.ev.find(e => e[0] === 'DEAT') || p.ev.find(e => e[0] === 'BURI')].filter(Boolean) : p.ev.filter(e => e[0] === 'MARR');
                    if (!bev || !evs.length) return {p, kind: 'none'}; const rs = evs.map(e => ({e, r: ageRange(bev, e)})).filter(x => x.r); if (!rs.length) return {p, kind: 'none'};
                    const ok = rs.find(x => n >= x.r[0] && n <= x.r[1]); return ok ? {p, kind: 'ok'} : {p, kind: 'bad', bev, e: rs[0].e, r: rs[0].r}; });
                if (res.some(r => r.kind === 'ok') || !res.some(r => r.kind === 'bad')) continue;
                const bad = res.find(r => r.kind === 'bad'), unsure = subj.ps.length > 1, age = bad.r[0] === bad.r[1] ? `${bad.r[0]} ans` : `${bad.r[0]} ou ${bad.r[1]} ans`;
                out.push({lvl: unsure ? 'warn' : 'err', page: b.page, id: b.id, person: bad.p.id, text: `🎂 ${subj.name.replace(/\s+/g, ' ')} : le texte dit « ${said} », d’après la fiche (° ${yearOf(bad.bev)}, ${tag === 'DEAT' ? '†' : 'mariage'} ${yearOf(bad.e)}) ${bad.p.g === 'female' ? 'elle' : 'il'} avait ${age}${unsure ? ` (${subj.ps.length} fiches portent ce nom)` : ''}.`});
            }
            // 2. chaque mot de fait, avec sa date et son lieu juste après
            // dans l'ordre du texte : un fait qui colle à une seule des fiches homonymes la désigne pour la suite
            for (const {tag, m} of hits) {
                const [ps0, pe0] = lineOf(m.index);
                const subj = subjectAt(m.index);
                if (!subj) continue;
                // la date : dans les 70 lettres qui suivent (même paragraphe), sans passer un autre fait ni une autre personne ;
                // sinon en tête de ligne (« 28 août 1922 Naissance — Tulle »)
                let after = low.slice(m.index + m[0].length, Math.min(pe0, m.index + m[0].length + 70)); const cut = Math.min(...[after.search(/[.;]\s/), ...KEYS.map(([, r]) => after.search(new RegExp(r.source)))].filter(x => x > 0), after.length);
                const nextMen = mentions.find(x => x.at > m.index); if (tag !== 'MARR' && nextMen && nextMen.at - (m.index + m[0].length) < cut) after = after.slice(0, nextMen.at - (m.index + m[0].length)); else after = after.slice(0, cut);
                let dt = readDate(after), lead = false;
                if (!dt) { const h = readDate(low.slice(ps0, m.index)); if (h && h.at <= 2 && /^\W*$/.test(low.slice(ps0 + h.at + h.len, m.index))) { dt = h; lead = true; } }
                if (!dt) continue;
                const rawAfter = raw.slice(m.index + m[0].length, Math.min(pe0, m.index + m[0].length + 90)), dash = (rawAfter.match(/^\s*[—–]\s*(\p{Lu}[^,(\n—]*)/u) || [])[1]?.trim();
                const place = lead ? (dash || placeIn(rawAfter)) : (placeIn(rawAfter.slice(dt.at + dt.len)) || placeIn(rawAfter.slice(0, dt.at)) || dash || '');
                // 3. comparer avec la ou les fiches qui portent ce nom
                const res = subj.ps.map(p => { const evs = p.ev.filter(e => e[0] === tag); if (!evs.length) return {p, kind: 'none'};
                    let best = null; for (const ev of evs) { const d = dbDate(ev); if (!d.y) continue; const tol = d.approx ? 2 : 0, dy = Math.abs(d.y - dt.y);
                        const ok = dy <= tol && (d.approx || !dt.m || !d.m || (d.m === dt.m && (!dt.d || !d.d || d.d === dt.d))); const placeOk = !place || !ev[3] || samePlace(place, ev[3]);
                        const r = {p, ev, d, kind: ok ? (placeOk ? 'ok' : 'place') : 'date'}; if (!best || ['ok', 'place', 'date'].indexOf(r.kind) < ['ok', 'place', 'date'].indexOf(best.kind)) best = r; }
                    return best || {p, kind: 'none'}; });
                const oks = res.filter(r => r.kind === 'ok'); if (oks.length) { if (oks.length < subj.ps.length) subj.ps = oks.map(r => r.p); continue; }
                const unsure = subj.ps.length > 1 && res.some(r => r.kind === 'none');
                const name = subj.name.replace(/\s+/g, ' '), said = (lead ? raw.slice(ps0, pe0) : raw.slice(m.index, m.index + m[0].length + dt.at + dt.len)).replace(/\s+/g, ' ').trim().slice(0, 120);
                const key = `${b.id}|${tag}|${subj.at}|${dt.y}`; if (seen.has(key)) continue; seen.add(key);
                const multi = subj.ps.length > 1 ? ` (${subj.ps.length} fiches portent ce nom)` : '';
                const pl = res.find(r => r.kind === 'place'), dd = res.filter(r => r.kind === 'date').sort((x, y) => Math.abs(x.d.y - dt.y) - Math.abs(y.d.y - dt.y))[0];
                if (dd) out.push({lvl: dd.d.approx || unsure ? 'warn' : 'err', page: b.page, id: b.id, person: dd.p.id, text: `🔎 ${name} : le texte dit « ${said} », la fiche dit ${WHAT[tag]} ${fmt(dd.ev)}${multi}.`});
                else if (pl) out.push({lvl: 'warn', page: b.page, id: b.id, person: pl.p.id, text: `🔎 ${name} : le texte place ${the(tag)} à « ${place} », la fiche dit ${fmt(pl.ev)}${multi}.`});
                else out.push({lvl: 'info', page: b.page, id: b.id, person: res[0].p.id, text: `🔎 ${name} : le texte parle d’${an(tag)} (« ${said} ») que la fiche n’a pas encore${multi} — à ajouter ?`});
            }
        }
        // 3. les lieux : connus de la base ? sinon, le plus proche (une seule question au serveur pour tous les nouveaux noms)
        const askNew = [...new Set(placeAsk.map(x => x.place))].filter(n => !placeCache.has(n)).slice(0, 60);
        if (askNew.length) { try { const r = await A().api('layout_check_data', {places: askNew.join('|')}); askNew.forEach(n => placeCache.set(n, r.places?.[n] || {known: true})); } catch (_) { askNew.forEach(n => placeCache.delete(n)); } }
        placeAsk.forEach(({b, place}) => { const r = placeCache.get(place); if (!r || r.known) return; const key = `${b.id}|pl|${norm(place)}`; if (seen.has(key)) return; seen.add(key);
            out.push(r.near ? {lvl: 'warn', page: b.page, id: b.id, text: `📍 « ${place} » n’est pas un lieu de ta base : tu voulais dire « ${r.near.label || r.near.name} » ?`} : {lvl: 'info', page: b.page, id: b.id, text: `📍 « ${place} » n’est pas encore dans les lieux de ta base.`}); });
        // 4. les numéros Sosa : d'après la personne « Sosa 1 » du texte, sinon la personne de départ de l'app
        if (sosaClaims.length) {
            // la numérotation du texte : celle de la personne de départ de l'app, ou d'une personne que le texte dit « Sosa 1 » (la meilleure des deux)
            const appRoot = (() => { try { return Number(A().sosaRootId?.() || localStorage.getItem('genealogie-sosa-root') || 0); } catch (_) { return 0; } })();
            const roots = [...new Set([appRoot, ...sosaClaims.filter(c => c.nums.includes(1)).flatMap(c => c.subj.ps.map(p => p.id))].filter(Boolean))].slice(0, 6);
            const fits = sm => sosaClaims.filter(c => c.subj.ps.some(p => sosaOf(sm, p.id).some(n => c.nums.includes(n)))).length;
            let sm = null, best = -1; for (const r of roots) { const m = await sosaMapFor(r); if (!m) continue; const f = fits(m); if (f > best) { best = f; sm = m; } }
            if (sm) sosaClaims.forEach(c => {
                const got = c.subj.ps.map(p => ({p, nums: sosaOf(sm, p.id)})); if (got.some(g => g.nums.some(n => c.nums.includes(n)))) return;
                const key = `${c.b.id}|sosa|${c.said}|${c.subj.at}`; if (seen.has(key)) return; seen.add(key);
                const g = got.find(x => x.nums.length) || got[0], name = c.subj.name.replace(/\s+/g, ' '), multi = c.subj.ps.length > 1 ? ` (${c.subj.ps.length} fiches portent ce nom)` : '';
                out.push(g.nums.length ? {lvl: multi ? 'warn' : 'err', page: c.b.page, id: c.b.id, person: g.p.id, text: `🔢 ${name} : le texte dit « ${c.said} », la fiche a le Sosa ${g.nums.join(' et ')}${sm.name ? ` (ancêtres de ${sm.name})` : ''}${multi}.`}
                    : {lvl: 'warn', page: c.b.page, id: c.b.id, person: g.p.id, text: `🔢 ${name} : le texte dit « ${c.said} », mais la fiche n’a pas de numéro Sosa${sm.name ? ` (ce n’est pas un ancêtre direct de ${sm.name})` : ''}${multi}.`});
            });
        }
        return out;
    }
    ext.factCheck = check;
    ext.factInternals = {readDate, dbDate, placeIn, samePlace, norm, badDates, lev, ageRange};
})();
