/* LCNDA — 🔀 Listes réunies : une seule table pour plusieurs sources de la même sorte (ex. tous les séismes), sans doublons,
 * avec la source sur chaque ligne (maquette validée docs/design/listes-categories.html, § 3 à 5 et § 7).
 *
 *  Une liste réunie est une liste de données comme les autres (moteur commun app-listes-donnees.js : critères, 📅 Période,
 *  📍 Autour de, tri, 🗺 Carte, ⤓ Exporter, ☑ choix multiple) ; elle ne fait que DÉCLARER :
 *    (window.LCNDA_EXT.dataListMerges ||= []).push({
 *      id: 'seismes', theme: 'seismes', icon: '🌋', label: 'Séismes réunis', noun: ['séisme', 'séismes'],
 *      same: {km: 50, days: 1, yearOnly: true},   // même jour ± 1 ET moins de 50 km ; une source qui n'a que l'année : même année,
 *                                                 // moins de 50 km, et un seul candidat (sinon on ne réunit pas). Ou {by: 'qid'} : même valeur.
 *      fields: [...], hideCols: [...], period, geo, familyColumn, familyKm, chips, views,   // comme une liste
 *      diff: [{key: 'mag', abs: 0.5}, {key: 'dead', ratio: 2}],                             // « ⚖ 2 avis » quand les sources s'écartent
 *      detail: [{key, label, fmt?}],                                                         // ce que dit chaque source, ligne ouverte
 *      sources: [{list: 'hist_seismes', rank: 2, short: 'EPICA', sub: 'Europe 1000–1899', when?: r => bool, row: r => ({date, year, lat, lon, …, url})}],
 *    });
 *  Une liste peut aussi rejoindre une liste réunie d'elle-même : `merge: {into: 'seismes', rank: 1, short: 'SisFrance', when?, row}`
 *  (ou un tableau de merge, une par sorte : NOAA donne des séismes ET des éruptions).
 *  Pour chaque champ, la valeur montrée est celle de la source de meilleur rang qui en donne une (1 = la plus précise).
 *  Seules les sources installées comptent ; une liste réunie sans source installée propose de les installer.
 *  « ✂ Ce ne sont pas les mêmes » sépare une ligne réunie : retenu (localStorage « genealogie-listes-reunies-separes », gardé aussi
 *  dans la base), ↶ Annuler ; Réglages → 🧰 Listes de données → « ↺ Tout réunir à nouveau ».
 *  Rapide : une seule passe ; les candidats viennent d'un index par jour (± days) ou par année, puis la distance — jamais tout contre tout.
 *  Les listes réunies à venir (crues, batailles, édifices, anciens noms, soldats, prénoms, compétitions) : seulement une déclaration.
 *  API : LCNDA_EXT.listesReunies = {merge(M, sources) (sans écran, pour les essais), build(id), reset(), defs()}
 *  Essai : tests/test-listes-themes.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const E = () => ext.dataListsEngine || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const nf = (n, d = 0) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('fr-FR', {maximumFractionDigits: d}) : '');
    const toast = (m, k) => A().toast?.(m, k);
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const SPLIT = 'genealogie-listes-reunies-separes';
    const R = Math.PI / 180;
    const km = (a, b, c, d) => { const x = Math.sin((c - a) * R / 2) ** 2 + Math.cos(a * R) * Math.cos(c * R) * Math.sin((d - b) * R / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); };
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

    /* ═════════════ les dates ═════════════ */
    /** « 1887-02-23 », « 1887-02 », « 1887 » → {year, month, day, dn (jour numéroté, si la date est complète)} */
    function parseDate(s, year) {
        const m = String(s ?? '').trim().match(/^(-?\d{1,4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/);
        const y = m ? Number(m[1]) : num(year), mo = m && m[2] ? Number(m[2]) : null, d = m && m[3] ? Number(m[3]) : null;
        if (y == null) return {year: null, month: null, day: null, dn: null};
        let dn = null; if (mo && d) { const t = new Date(Date.UTC(2000, mo - 1, d)); t.setUTCFullYear(y); dn = Math.round(t.getTime() / 864e5); }
        return {year: y, month: mo, day: d, dn};
    }
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dateText = (s, year) => { const p = parseDate(s, year); if (p.year == null) return ''; return p.day ? `${p.day === 1 ? '1er' : p.day} ${T(MONTHS[p.month - 1])} ${p.year}` : p.month ? `${T(MONTHS[p.month - 1])} ${p.year}` : String(p.year); };
    const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    const roman = v => { const n = num(v); if (n == null) return ''; const a = Math.floor(n), b = Math.ceil(n); return a === b ? ROMAN[a] || String(n) : `${ROMAN[a] || a}–${ROMAN[b] || b}`; };

    /* ═════════════ les séparations (« ✂ Ce ne sont pas les mêmes ») ═════════════ */
    const readSplit = () => { try { const v = JSON.parse(localStorage.getItem(SPLIT) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
    const apartOf = id => new Set(Array.isArray(readSplit()[id]) ? readSplit()[id] : []);
    const pair = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

    /* ═════════════ réunir (sans écran) ═════════════
     * recs : [{src: {short, rank, …}, key, rec: {date, year, lat, lon, …}}] → [{_k, _members: [{src, key, rec}], …valeurs, sources, _diff}]
     * Une passe : on prend les lignes de la meilleure source d'abord ; chacune rejoint la ligne réunie la plus proche parmi celles
     * du même jour (± days) et à moins de km, qui n'a pas encore de ligne de la même source, et dont aucune n'en a été séparée. */
    function merge(M, recs, apart = new Set()) {
        const same = M.same || {}, KM = Number(same.km) || 50, DAYS = Number.isFinite(Number(same.days)) ? Number(same.days) : 1, BY = same.by || '';
        const prepared = recs.map(x => { const p = parseDate(x.rec.date, x.rec.year), lat = num(x.rec.lat), lon = num(x.rec.lon); return {...x, year: p.year, dn: p.dn, lat, lon, geo: lat != null && lon != null && !(lat === 0 && lon === 0)}; });
        prepared.sort((a, b) => (a.src.rank || 9) - (b.src.rank || 9) || (a.dn == null) - (b.dn == null) || (a.year ?? 0) - (b.year ?? 0));
        const clusters = [], byDay = new Map(), byYear = new Map(), byKey = new Map();
        const push = (m, k, i) => { const l = m.get(k); if (l) l.push(i); else m.set(k, [i]); };
        const okWith = (c, x) => !c.srcs.has(x.src.id) && !c.members.some(m => apart.has(pair(m.key, x.key)));
        const dist = (c, x) => (c.geo && x.geo ? km(c.lat, c.lon, x.lat, x.lon) : Infinity);
        for (const x of prepared) {
            let best = -1;
            if (BY) { const v = x.rec[BY]; if (v != null && v !== '') { const l = byKey.get(String(v)) || []; best = l.find(i => okWith(clusters[i], x)) ?? -1; } }
            else if (x.dn != null && x.geo) {
                let bd = Infinity;
                for (let d = x.dn - DAYS; d <= x.dn + DAYS; d++) for (const i of byDay.get(d) || []) { const c = clusters[i], k = dist(c, x); if (k < KM && k < bd && okWith(c, x)) { bd = k; best = i; } }
            } else if (same.yearOnly && x.year != null && x.geo) { // seulement l'année : un seul candidat, sinon on ne réunit pas
                const cands = (byYear.get(x.year) || []).filter(i => dist(clusters[i], x) < KM && okWith(clusters[i], x));
                if (cands.length === 1) best = cands[0];
            }
            if (best >= 0) { const c = clusters[best]; c.members.push(x); c.srcs.add(x.src.id); if (!c.geo && x.geo) Object.assign(c, {lat: x.lat, lon: x.lon, geo: true}); if (c.dn == null && x.dn != null) { c.dn = x.dn; push(byDay, x.dn, best); } continue; }
            const i = clusters.length;
            clusters.push({members: [x], srcs: new Set([x.src.id]), lat: x.lat, lon: x.lon, geo: x.geo, dn: x.dn, year: x.year});
            if (BY) { const v = x.rec[BY]; if (v != null && v !== '') push(byKey, String(v), i); }
            if (x.dn != null) push(byDay, x.dn, i);
            if (x.year != null) push(byYear, x.year, i);
        }
        const keys = [...new Set([...(M.fields || []).map(f => f.key), ...(M.keep || []), 'date', 'year', 'lat', 'lon', 'url'])].filter(k => k !== 'sources');
        return clusters.map(c => {
            const ms = c.members.sort((a, b) => (a.src.rank || 9) - (b.src.rank || 9)), out = {_k: ms[0].key, _members: ms.map(m => ({src: m.src, key: m.key, rec: m.rec}))};
            for (const k of keys) { const m = ms.find(x => x.rec[k] != null && x.rec[k] !== ''); out[k] = m ? m.rec[k] : null; }
            if (out.year == null && c.year != null) out.year = c.year; // l'année : celle de la date quand la source ne la donne pas à part
            out.sources = ms.map(m => m.src.short);
            out._diff = (M.diff || []).some(df => { const vs = ms.map(m => num(m.rec[df.key])).filter(v => v != null); if (vs.length < 2) return false; const lo = Math.min(...vs), hi = Math.max(...vs); return df.abs != null ? hi - lo > df.abs : df.ratio != null ? lo > 0 && hi / lo >= df.ratio : false; });
            try { M.finish?.(out); } catch (_) {}
            return out;
        });
    }

    /* ═════════════ les sources d'une liste réunie ═════════════ */
    const MERGES = () => (Array.isArray(ext.dataListMerges) ? ext.dataListMerges : []).filter(m => m && m.id && m.label);
    /** les sources déclarées par la liste réunie, et celles des listes qui disent `merge: {into}` */
    function sourcesOf(M) {
        const ds = E().list?.() || [], out = [];
        (M.sources || []).forEach(s => { const d = ds.find(x => x.id === s.list); if (d) out.push({...s, id: `${s.list}#${s.short || ''}`, d}); });
        ds.forEach(d => [].concat(d.merge || []).forEach((m, i) => { if (m && m.into === M.id && typeof m.row === 'function') out.push({rank: 5, short: d.label, ...m, list: d.id, id: `${d.id}#${i}`, d}); }));
        return out.sort((a, b) => (a.rank || 9) - (b.rank || 9));
    }
    async function activeSources(M) {
        const ss = sourcesOf(M).filter(s => E().shown?.(s.d) !== false);
        const ok = await Promise.all(ss.map(s => E().isInstalled?.(s.d) ?? true));
        return ss.filter((s, i) => ok[i]);
    }
    /** toutes les lignes d'une source (petites listes : load ; grandes : query, page après page) */
    const srcRows = new Map(); // source → Promise(lignes) : lues une fois (une séparation refait seulement la réunion)
    function rowsOfSource(s) {
        if (!srcRows.has(s.id)) { const pr = readSource(s); srcRows.set(s.id, pr); pr.catch(() => srcRows.delete(s.id)); }
        return srcRows.get(s.id);
    }
    async function readSource(s) {
        const d = s.d;
        if (!d.query) return E().loadAll(d);
        const st = {...E().blank(), ...(s.preset || {})}, out = []; let total = Infinity;
        while (out.length < Math.min(total, 200000)) { const p = await E().fetchPage(d, st, out.length, 5000); total = p.total; if (!p.rows.length) break; out.push(...p.rows); if (!p.more && out.length >= total) break; }
        return out;
    }
    const built = new Map(); // id → Promise({rows, stats})
    async function build(id) {
        const M = MERGES().find(m => m.id === id); if (!M) return {rows: [], stats: {}};
        if (built.has(id)) return built.get(id);
        const pr = (async () => {
            const ss = await activeSources(M), recs = [], per = {};
            // une source lente (lazy : ex. Wikidata, 400 petits fichiers) arrive après : la liste s'ouvre sans l'attendre, puis se complète
            const ready = await Promise.all(ss.map(s => (s.lazy ? Promise.race([rowsOfSource(s).then(() => true, () => true), new Promise(r => setTimeout(() => r(false), 0))]) : true)));
            const now = ss.filter((s, i) => ready[i]), later = ss.filter((s, i) => !ready[i]);
            if (later.length) Promise.all(later.map(s => rowsOfSource(s).catch(() => []))).then(() => { built.delete(id); E().forget?.(`reunie_${id}`); const pg = E().page?.(); if (pg?.base?.id === `reunie_${id}`) pg.refresh(); });
            await Promise.all(now.map(async s => {
                let rows = []; try { rows = await rowsOfSource(s); } catch (e) { console.error(e); }
                const src = {id: s.id, list: s.list, short: s.short || T(s.d.label), sub: s.sub || '', rank: s.rank || 9, label: T(s.d.label), url: s.d.sourceUrl || ''};
                let n = 0;
                rows.forEach((r, i) => { try { if (s.when && !s.when(r)) return; const rec = s.row(r); if (!rec) return; const key = `${s.list}:${rec.key ?? r.id ?? r.qid ?? `${rec.date ?? rec.year}|${num(rec.lat)?.toFixed(2)}|${num(rec.lon)?.toFixed(2)}|${i}`}`; recs.push({src, key, rec}); n++; } catch (_) {} });
                per[src.short] = n;
            }));
            const t0 = performance.now(), rows = merge(M, recs, apartOf(id));
            return {rows, stats: {sources: now.length, lines: recs.length, rows: rows.length, merged: recs.length - rows.length, per, ms: Math.round(performance.now() - t0), pending: later.map(s => s.short)}};
        })();
        built.set(id, pr); pr.catch(() => built.delete(id));
        return pr;
    }
    function reset(id = '') { for (const k of [...built.keys()]) if (!id || k === id) built.delete(k); MERGES().forEach(M => { if (!id || M.id === id) E().forget?.(`reunie_${M.id}`); }); }

    /* ═════════════ la liste (enregistrée dans le moteur commun) ═════════════ */
    const srcLinks = row => (row._members || []).map(m => { const u = m.rec.url || m.src.url; return `<span class="ldr-src">${u && /^https?:\/\//i.test(u) ? `<a href="${esc(A().safeUrl ? A().safeUrl(u) : u)}" target="_blank" rel="noopener noreferrer" title="${esc(T('La fiche de cette source'))} — ${esc(m.src.label)}">${esc(m.src.short)} ↗</a>` : esc(m.src.short)}</span>`; }).join(' ');
    function defOf(M) {
        const id = `reunie_${M.id}`;
        return {id, merged: true, mergeId: M.id, theme: M.theme, icon: M.icon || '🔀', label: M.label, group: M.group || 'Le monde', source: M.source || '', sourceUrl: M.sourceUrl || '',
            keywords: M.keywords || [], cards: true, familyColumn: M.familyColumn, familyKm: M.familyKm, familyBefore: M.familyBefore, defaultSort: M.defaultSort, hideCols: M.hideCols, chips: M.chips, views: M.views,
            fields: (M.fields || []).map(f => (f.key === 'sources' ? {type: 'enum', values: sourcesOf(M).map(s => s.short), html: srcLinks, ...f} : f)),
            period: M.period || (r => [r.year, r.year]), geo: M.geo || (r => [r.lat, r.lon]),
            rowKey: r => r._k, sourceCount: () => sourcesOf(M).length, mergeLine: () => T('{s}, sans doublons', {s: sourcesOf(M).map(s => s.short).join(' + ')}),
            installed: async () => (await activeSources(M)).length > 0,
            install: host => installOffer(M, host),
            load: async () => (await build(M.id)).rows,
            open: (row, ctx) => toggleDetail(M, row, ctx),
            itemOf: (row, it) => itemOf(M, row, it),
            painted: (res, o) => statsLine(M, res, o)};
    }
    /** une ligne réunie → un élément de panier ou d'insertion, avec SES sources (pas seulement la liste) */
    function itemOf(M, row, it) {
        const ms = row._members || [], srcs = ms.map(m => m.src.short).join(' ; ');
        const url = ms.map(m => m.rec.url).find(u => /^https?:\/\//i.test(u || '')) || ms[0]?.src.url || it.origin?.url || '';
        let title = it.title; try { title = M.title ? M.title(row) : it.title; } catch (_) {}
        return {...it, title: String(title || it.title).slice(0, 200), value: [it.value, srcs ? `${T('Sources :')} ${srcs}` : ''].filter(Boolean).join(' · ').slice(0, 2000),
            origin: {...it.origin, label: `${T('Listes')} · ${T(M.label)} — ${srcs}`, url}};
    }
    function installOffer(M, host) {
        const ss = sourcesOf(M); if (!host) return;
        host.insertAdjacentHTML('beforeend', `<div class="ldr-offer"><p>${esc(T('Cette liste réunit :'))}</p><ul>${ss.map(s => `<li><button type="button" class="link-button" data-ldr-src="${esc(s.list)}">${esc(s.d.icon || '📋')} ${esc(T(s.d.label))}</button>${s.sub ? ` <small class="muted">${esc(T(s.sub))}</small>` : ''}</li>`).join('')}</ul></div>`);
        host.querySelectorAll('[data-ldr-src]').forEach(b => b.addEventListener('click', () => E().open?.(b.dataset.ldrSrc)));
    }
    /** sous le tableau : « 5 séismes réunis (9 lignes dans les sources : 4 doublons fondus) » */
    async function statsLine(M, res) {
        const b = await build(M.id), host = res.parentElement?.querySelector('[data-ld-more-host]'); if (!res.isConnected) return;
        let line = res.parentElement.querySelector('[data-ldr-stats]');
        if (!line) { line = document.createElement('p'); line.className = 'ldr-stats muted'; line.dataset.ldrStats = ''; (host || res).after(line); }
        const s = b.stats, noun = M.noun || [T('ligne'), T('lignes')];
        line.textContent = (s.lines ? T('{n} {w} réunis ({l} lignes dans les sources : {m} doublons fondus) · {s} sources', {n: nf(s.rows), w: T(s.rows > 1 ? noun[1] : noun[0]), l: nf(s.lines), m: nf(s.merged), s: nf(s.sources)}) : '')
            + (s.pending?.length ? ` · ${T('{s} arrive…', {s: s.pending.join(', ')})}` : '');
    }

    /* ── une ligne ouverte : ce que dit chaque source ; 📎 · 🧺 · ✂ ── */
    function toggleDetail(M, row, ctx = {}) {
        const tr = ctx.tr; if (!tr) return;
        const next = tr.nextElementSibling;
        if (next?.classList.contains('ldr-detail-tr')) { next.remove(); tr.classList.remove('is-open'); tr.querySelector('[data-ld-open]')?.setAttribute('aria-expanded', 'false'); return; }
        tr.parentElement.querySelectorAll('.ldr-detail-tr').forEach(x => { x.previousElementSibling?.classList.remove('is-open'); x.remove(); });
        const det = M.detail || (M.fields || []).filter(f => f.key !== 'sources' && !f.html).map(f => ({key: f.key, label: f.label}));
        const ms = row._members || [], ro = kiosk();
        const cell = (m, c) => { const v = m.rec[c.key]; if (v == null || v === '') return '<td class="muted">—</td>'; let t = v; try { t = c.fmt ? c.fmt(v, m.rec, row) : v; } catch (_) {} return `<td>${esc(t)}</td>`; };
        const d0 = ms[0]?.rec || {};
        const where = m => (m.rec.lat != null && d0.lat != null && m !== ms[0] ? ` <small class="muted">(${nf(km(Number(d0.lat), Number(d0.lon), Number(m.rec.lat), Number(m.rec.lon)))} km)</small>` : '');
        const html = `<td colspan="${tr.children.length}"><div class="ldr-detail" role="region" aria-label="${esc(T('Ce que dit chaque source'))}">
            <div class="ldr-dhead"><b>${esc((() => { try { return M.title ? M.title(row) : row[M.fields?.[0]?.key]; } catch (_) { return ''; } })())}</b>${ms.length > 1 ? ` <small class="muted">${esc(T('{n} sources', {n: ms.length}))}</small>` : ''}</div>
            <div class="ld-table-wrap"><table class="data-table ldr-dtable"><thead><tr><th>${esc(T('Source'))}</th>${det.map(c => `<th>${esc(T(c.label))}</th>`).join('')}<th></th></tr></thead>
            <tbody>${ms.map(m => `<tr><td><b>${esc(m.src.short)}</b>${m.src.sub ? ` <small class="muted">${esc(T(m.src.sub))}</small>` : ''}${where(m)}</td>${det.map(c => cell(m, c)).join('')}<td>${(m.rec.url || m.src.url) && /^https?:\/\//i.test(m.rec.url || m.src.url) ? `<a href="${esc(m.rec.url || m.src.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(T('La fiche de cette source'))} — ${esc(m.src.short)}">↗</a>` : ''}</td></tr>`).join('')}</tbody></table></div>
            ${row._diff ? `<p class="ldr-note"><span class="ldr-diff">⚖</span> ${esc(T('Les sources ne donnent pas la même chose : la ligne réunie montre la source la plus précise ({s}). Rien n’est caché : tout est ici.', {s: ms[0]?.src.short || ''}))}</p>` : ''}
            <div class="ldr-dacts">${ext.listesChoix ? `<button type="button" class="button small secondary" data-ldr-ins ${ro ? `disabled title="${esc(T('Mode consultation : rien ne peut être écrit.'))}"` : ''}>📎 ${esc(T('Insérer'))}</button><button type="button" class="button small secondary" data-ldr-bk ${ro ? `disabled title="${esc(T('Mode consultation : rien ne peut être écrit.'))}"` : ''}>🧺 ${esc(T('Au panier'))}</button>` : ''}
            ${ms.length > 1 ? `<button type="button" class="button small ghost" data-ldr-split ${ro ? 'disabled' : ''}>✂ ${esc(T('Ce ne sont pas les mêmes'))}</button>` : ''}</div></div></td>`;
        const dtr = document.createElement('tr'); dtr.className = 'ldr-detail-tr'; dtr.innerHTML = html; tr.after(dtr); tr.classList.add('is-open');
        tr.querySelector('[data-ld-open]')?.setAttribute('aria-expanded', 'true');
        dtr.querySelector('[data-ldr-ins]')?.addEventListener('click', e => ext.listesChoix?.act?.('insert', [row], e.currentTarget));
        dtr.querySelector('[data-ldr-bk]')?.addEventListener('click', e => ext.listesChoix?.act?.('basket', [row], e.currentTarget));
        dtr.querySelector('[data-ldr-split]')?.addEventListener('click', () => split(M, row));
    }
    function split(M, row) {
        if (kiosk()) return toast(T('Mode consultation : rien ne peut être écrit.'));
        const keys = (row._members || []).map(m => m.key); if (keys.length < 2) return;
        const apply = () => { const v = readSplit(), set = new Set(Array.isArray(v[M.id]) ? v[M.id] : []); for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) set.add(pair(keys[i], keys[j])); v[M.id] = [...set]; try { localStorage.setItem(SPLIT, JSON.stringify(v)); } catch (_) {} };
        const after = () => { reset(M.id); E().page?.()?.refresh?.(); };
        const msg = T('✂ Séparée en {n} lignes', {n: keys.length});
        if (A().undoLocalChange) A().undoLocalChange(msg, [SPLIT], apply, after); else { apply(); toast(msg); }
        after();
    }

    /* ═════════════ 🌋 Séismes réunis : la première liste réunie ═════════════ */
    const mag = v => (num(v) == null ? '' : `M ${nf(v, 1)}`);
    const SEISMES = {id: 'seismes', theme: 'seismes', icon: '🌋', label: 'Séismes réunis', noun: ['séisme', 'séismes'], group: 'Le monde',
        source: 'EPICA (INGV, CC BY 4.0) · NOAA NCEI (domaine public) · Wikidata (CC0)', keywords: ['tremblement de terre', 'earthquake', 'sisme'],
        same: {km: 50, days: 1, yearOnly: true},
        fields: [{key: 'date', label: 'Date', type: 'date', html: r => esc(dateText(r.date, r.year))}, {key: 'year', label: 'Année', type: 'year'},
            {key: 'place', label: 'Où', type: 'text', html: r => `${esc(r.place || '—')}${r.country ? `<small class="ldr-sub">${esc(r.country)}</small>` : ''}`},
            {key: 'country', label: 'Pays', type: 'enum'},
            {key: 'force', label: 'Force', type: 'text', sort: false, html: r => `${esc([r.io != null ? roman(r.io) : '', r.mag != null ? mag(r.mag) : ''].filter(Boolean).join(' · ') || '—')}${r._diff ? ` <span class="ldr-diff" title="${esc(T('Les sources ne donnent pas la même force : voir la ligne ouverte'))}">⚖ ${esc(T('{n} avis', {n: r._members?.length || 2}))}</span>` : ''}`},
            {key: 'io', label: 'Intensité à l’épicentre', type: 'number'}, {key: 'mag', label: 'Magnitude', type: 'number'}, {key: 'dead', label: 'Morts', type: 'number'},
            {key: 'sources', label: 'Sources'}],
        hideCols: ['year', 'country', 'io', 'mag'], familyColumn: true, familyKm: 150, familyBefore: 'sources', defaultSort: ['date', 'desc'],
        diff: [{key: 'mag', abs: 0.5}, {key: 'io', abs: 0.5}, {key: 'dead', ratio: 2}],
        detail: [{key: 'date', label: 'Date', fmt: (v, r) => dateText(v, r.year)}, {key: 'place', label: 'Épicentre'}, {key: 'io', label: 'Intensité', fmt: v => roman(v)}, {key: 'mag', label: 'Magnitude', fmt: v => mag(v)}, {key: 'dead', label: 'Morts', fmt: v => nf(v)}],
        title: r => `${r.place || T('Séisme')}, ${dateText(r.date, r.year)}`,
        sources: [
            {list: 'hist_seismes', rank: 2, short: 'EPICA', sub: 'Europe 1000–1899', row: r => ({date: r.date, year: r.year, lat: r.lat, lon: r.lon, place: r.zone, io: r.intensity ?? r.io, mag: r.mw})},
            {list: 'ha_catastrophes', rank: 3, short: 'NOAA', sub: 'monde', when: r => r.k === 'eq', row: r => ({key: r.id, date: r.date || r.y, year: r.y ?? r.year, lat: r.lat, lon: r.lon, place: r.loc || r.place, country: r.country, io: r.int, mag: r.mag ?? r.magnitude, dead: r.deaths,
                url: r.id ? `https://www.ngdc.noaa.gov/hazel/view/hazards/earthquake/event-more-info/${encodeURIComponent(r.id)}` : ''})},
            {list: 'wikidata_evenements', rank: 4, short: 'Wikidata', lazy: true, when: r => /s[ée]isme|tremblement de terre|earthquake|terremoto|erdbeben|aardbeving|trz[ęe]sienie/i.test(String(r.name || '')),
                row: r => ({key: r.qid, date: r.date, year: r.year, lat: r.lat, lon: r.lon, place: r.name, url: r.url})}]};
    SEISMES.chips = [{id: 'famille', icon: '👪', label: 'Autour des lieux de la famille · 150 km', prepare: () => ext.listesFamille?.ready?.(), test: (row, {geo} = {}) => !!geo && !!ext.listesFamille && ext.listesFamille.nearKm(geo[0], geo[1], 150) <= 150}];

    /* le registre : ce que d'autres fichiers ont mis avant nous reste ; chaque liste réunie devient une liste du moteur */
    const push0 = Array.prototype.push;
    const adopt = arr => { if (!Array.isArray(arr)) arr = []; if (!arr.some(m => m && m.id === 'seismes')) arr.unshift(SEISMES);
        if (!arr.__ldr) { Object.defineProperty(arr, 'push', {value(...items) { const n = push0.apply(this, items); publish(); return n; }, configurable: true, writable: true}); Object.defineProperty(arr, '__ldr', {value: true}); }
        return arr; };
    let REGM = [];
    const publish = () => { const L = (ext.dataLists = ext.dataLists || []); REGM.forEach(M => { if (M && M.id && M.label && !L.some(d => d && d.id === `reunie_${M.id}`)) L.push(defOf(M)); }); };
    REGM = adopt(ext.dataListMerges);
    Object.defineProperty(ext, 'dataListMerges', {get: () => REGM, set: v => { REGM = adopt(v); publish(); }, configurable: true});
    publish();

    ext.listesReunies = {merge, build, reset, defs: () => REGM, sourcesOf, parseDate, dateText, roman};
})();
