/* LCNDA — 🔎 Vérifier les faits d'un texte : quand un texte (livre, mise en page) cite une personne de la base avec une naissance,
 * un baptême, un décès, une inhumation ou un mariage, la date et le lieu écrits sont comparés à ceux de la fiche.
 * « Jean MARTIN, né le 28 août 1923 à Tulle » → la fiche dit 1922 : signalé. Rien n'est changé : on corrige le texte ou la fiche.
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
    async function facts() {
        if (cache) return cache; if (loading) return loading;
        loading = A().api('person_names', {facts: 1}).then(r => {
            const byKey = new Map(), add = (k, p) => { if (!k || k.split(' ').length < 2) return; const l = byKey.get(k) || []; if (!l.includes(p)) l.push(p); byKey.set(k, l); };
            (r.persons || []).forEach(p => { const f = norm(p.f).trim(), l = norm(p.l).trim(); if (!l) return; const f1 = f.split(/[\s-]+/)[0];
                add(`${f} ${l}`, p); add(`${f1} ${l}`, p); if (p.m) add(`${f} ${norm(p.m)} ${l}`, p); add(`${l} ${f}`, p); add(`${l} ${f1}`, p); });
            cache = {byKey, maxWords: Math.max(2, ...[...byKey.keys()].map(k => k.split(' ').length))}; loading = null; return cache;
        }).catch(e => { loading = null; throw e; });
        return loading;
    }
    ext.factsReset = () => { cache = null; };

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

    /**
     * blocks : [{page, id, text}] → [{lvl, page, id, text, person}]
     * Le sujet d'un fait est la dernière personne nommée avant le mot (« Jean MARTIN … il naquit en 1922 » aussi).
     */
    async function check(blocks) {
        const {byKey, maxWords} = await facts(), out = [], seen = new Set();
        const findNames = (words, raw) => { const ms = []; for (let i = 0; i < words.length; i++) for (let n = Math.min(maxWords, words.length - i); n >= 2; n--) {
            const ps = byKey.get(words.slice(i, i + n).map(x => x.w).join(' '));
            if (ps) { ms.push({at: words[i].at, end: words[i + n - 1].end, ps: [...ps], name: raw.slice(words[i].at, words[i + n - 1].end)}); i += n - 1; break; } } return ms; };
        for (const b of blocks) {
            const raw = String(b.text || ''); if (!raw.trim()) continue;
            const low = norm(raw);
            // 1. les personnes nommées (deux ou trois mots de suite qui forment un nom connu)
            const words = [...low.matchAll(/[a-z0-9'-]+/g)].map(m => ({w: m[0], at: m.index, end: m.index + m[0].length}));
            const mentions = findNames(words, raw);
            // le nom en titre de la page (une fiche par page) : sujet des lignes « Naissance — Tulle » qui ne nomment personne
            const ctx = (b.ctx || []).map(t => { const lw = norm(t), ws = [...lw.matchAll(/[a-z0-9'-]+/g)].map(m => ({w: m[0], at: m.index, end: m.index + m[0].length})), ms = findNames(ws, t); return ms.length === 1 && ms[0].end - ms[0].at >= lw.trim().length * .6 ? ms[0] : null; }).find(Boolean);
            if (!mentions.length && !ctx) continue;
            // 2. chaque mot de fait, avec sa date et son lieu juste après
            // dans l'ordre du texte : un fait qui colle à une seule des fiches homonymes la désigne pour la suite
            const hits = KEYS.flatMap(([tag, re]) => [...low.matchAll(re)].map(m => ({tag, m}))).sort((x, y) => x.m.index - y.m.index);
            for (const {tag, m} of hits) {
                // le sujet : la dernière personne nommée dans le même paragraphe ; « il », « elle » renvoient au paragraphe d'avant ;
                // une ligne qui ne nomme personne renvoie au nom en titre de la page ; sinon, on ne devine pas
                const ps0 = raw.lastIndexOf('\n', m.index - 1) + 1, pe0 = (raw.indexOf('\n', m.index) + 1 || raw.length + 1) - 1;
                const before = mentions.filter(x => x.end <= m.index);
                const sentence = low.slice(Math.max(ps0, low.lastIndexOf('. ', m.index) + 1), m.index).trim();
                const subj = before.filter(x => x.at >= ps0).at(-1) || (/^(il|elle|ils|elles)\b/.test(sentence) ? before.filter(x => m.index - x.end < 400).at(-1) : null) || (!mentions.some(x => x.at >= ps0 && x.at < pe0) ? ctx : null);
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
        return out;
    }
    ext.factCheck = check;
    ext.factInternals = {readDate, dbDate, placeIn, samePlace, norm};
})();
