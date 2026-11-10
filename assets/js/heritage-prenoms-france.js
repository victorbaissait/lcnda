/* LCNDA — Graphiques → Statistiques : 👶 Transmission des prénoms et 📊 Ta famille et l'histoire de France.
 * Données : lib/prenoms_france.php (GET prenoms_transmis, famille_france ; POST name_origin_set) ; repères français :
 * assets/data/moyennes-france.json (sourcé). Dessins des chiffres : le moteur commun des diagrammes (ext.diagramRender) ;
 * les flèches de transmission : un SVG à part (une ligne par prénom, les années en travers).
 * Sur la fiche : la petite ligne « 👶 Prénom reçu de… » (bloc Identité) et son ⋯ (C’est bien ça, Ce n’est pas ça,
 * Choisir la personne… par le menu de choix, ↶ Annuler). Rien n’est écrit sans une action ; rien en mode consultation.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.graphStats = ext.graphStats || {};
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI;
    const S = () => A().state;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const fmt = (n, d = 1) => n === null || n === undefined ? '—' : Number(n).toLocaleString('fr-FR', {maximumFractionDigits: d});
    const plural = (n, w, p) => A().plural ? A().plural(n, w, p) : `${n} ${w}`;
    const ro = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('ms-open');
    const KIND = {godparent: ['🎀', 'Parrain ou marraine', '#2a6fdb'], sibling: ['🕯', 'Frère ou sœur mort avant', '#8e44ad'], grandparent: ['👴', 'Grand-parent', '#2e8b57'],
        parent: ['👪', 'Père ou mère', '#c27c0e'], uncle: ['🧑‍🤝‍🧑', 'Oncle ou tante', '#d1495b'], saint: ['✶', 'Saint du jour', '#8a8f98'], manual: ['✎', 'Choisi à la main', '#1d1d1f'], none: ['·', 'Pas trouvé', '#c9ced6']};
    const LEVEL = {forte: 'green', moyenne: 'yellow', faible: 'grey'};
    const badge = (t, k, title = '') => UI()?.badge ? UI().badge(t, k, {title}) : `<span class="ui-badge is-${k}">${esc(t)}</span>`;
    const confBadge = o => o.manual ? badge(o.manual === 'chosen' ? 'choisi à la main' : 'vérifié', 'green', 'Corrigé ou confirmé à la main') : badge('confiance ' + o.level, LEVEL[o.level] || 'grey', `Indice de confiance : ${o.score} sur 100`);
    const SVG = spec => { try { return ext.diagramRender?.svg ? ext.diagramRender.svg(spec) : ''; } catch (e) { console.error(e); return ''; } };

    /* ── les deux statistiques, juste après « Moyennes de la famille » ── */
    const addStats = (force = false) => {
        const list = A()?.defaultGraphStatsItems; if (!list) return false;
        const at = list.findIndex(x => x[0] === 'family_averages');
        const mine = [['name_transmission', 'Transmission des prénoms'], ['family_vs_france', 'Ta famille et l’histoire de France']].filter(([k]) => !list.some(x => x[0] === k));
        if (!mine.length) return true;
        if (at < 0) { if (!force) return false; list.push(...mine); } else list.splice(at + 1, 0, ...mine);
        return true;
    };
    if (!addStats()) { let n = 0; const t = setInterval(() => { n++; if (addStats(n > 60) || n > 100) clearInterval(t); }, 50); }

    /* ── filtres communs : groupe de personnes (branche) et période ── */
    const POPS = [['', 'Toute la base'], ['anc', 'Mes ancêtres'], ['pat', 'Ma branche paternelle'], ['mat', 'Ma branche maternelle']];
    const filt = () => { const st = S(); st.pfFilter = st.pfFilter || {pop: '', from: '', to: ''}; return st.pfFilter; };
    const filterQuery = () => { const f = filt(), q = {}; if (f.pop) q.dg_pop = f.pop; if (f.from) q.dg_from = f.from; if (f.to) q.dg_to = f.to; return q; };
    const filtersHtml = (extra = '') => { const f = filt(); return `<div class="pf-filters" role="group" aria-label="Filtres">
        <label>Branche <select data-pf-pop>${POPS.map(([v, l]) => `<option value="${v}"${f.pop === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <label>De <input data-pf-from type="text" inputmode="numeric" maxlength="4" placeholder="Année" value="${esc(f.from)}"></label>
        <label>à <input data-pf-to type="text" inputmode="numeric" maxlength="4" placeholder="Année" value="${esc(f.to)}"></label>${extra}
        ${f.pop || f.from || f.to ? '<button type="button" class="button small secondary" data-pf-reset>↺ Remettre comme au départ</button>' : ''}</div>`; };
    const bindFilters = (root, redraw) => {
        let timer = 0;
        root.querySelector('[data-pf-pop]')?.addEventListener('change', e => { filt().pop = e.target.value; A().persistUiState?.(); redraw(); });
        root.querySelectorAll('[data-pf-from],[data-pf-to]').forEach(inp => inp.addEventListener('input', e => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 4); if (v !== e.target.value) e.target.value = v;
            filt()[e.target.matches('[data-pf-from]') ? 'from' : 'to'] = v;
            clearTimeout(timer); timer = setTimeout(() => { if (!v || v.length === 4) redraw(); }, 450);
        }));
        root.querySelector('[data-pf-reset]')?.addEventListener('click', () => { Object.assign(filt(), {pop: '', from: '', to: ''}); redraw(); });
    };
    const current = (token, key) => token === S().workspaceToken && S().module === 'graphiques' && S().graphStatsType === key;
    const showError = (e, key) => { A().$('#workspace').innerHTML = `<section class="page">${A().emptyState({icon: '⛔', text: 'Lecture impossible', hint: esc(e.message || '')})}</section>`; console.warn(key, e); };

    /* ═════════ 👶 Transmission des prénoms ═════════ */
    ext.graphStats.name_transmission = async token => {
        const st = S(), name = st.pfName || '';
        let d;
        try { d = await api('prenoms_transmis', {...filterQuery(), ...(name ? {name} : {})}); } catch (e) { if (current(token, 'name_transmission')) showError(e, 'prenoms_transmis'); return; }
        if (!current(token, 'name_transmission')) return;
        const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
        const names = Object.keys(d.names || {});
        if (name && !names.includes(name)) names.unshift(name);
        const kinds = Object.keys(KIND).filter(k => k !== 'none');
        const periods = d.periods || [];
        // le moteur commun : colonnes empilées, d’où vient le prénom, époque par époque
        const used = kinds.filter(k => periods.some(p => p[k] > 0));
        const stack = periods.length ? SVG({kind: 'stacked', o: {title: 'D’où vient le prénom, par époque', unit: 'enfants', height: 260}, series: [...used, 'none'].map(k => ({name: KIND[k][1], color: KIND[k][2]})),
            rows: periods.map(p => { const r = {label: p.label}; [...used, 'none'].forEach((k, i) => { r['s' + i] = p[k] || 0; }); return r; })}) : '';
        const share = periods.filter(p => p.with_godparents > 0);
        const shareSvg = share.length ? SVG({kind: 'columns', o: {title: 'Enfants qui portent le prénom de leur parrain ou marraine', unit: '%', height: 200, max: 100}, series: [{name: '% des enfants qui ont un parrain ou une marraine notés', color: KIND.godparent[2]}],
            rows: share.map(p => ({label: p.label, s0: pct(p.named_godparent, p.with_godparents)}))}) : '';
        const rows = d.rows || [];
        const nameSel = `<label>Prénom <select data-pf-name><option value="">Tous les prénoms</option>${names.map(n => `<option value="${esc(n)}"${n === name ? ' selected' : ''}>${esc(n)}${d.names?.[n] ? ` (${d.names[n]})` : ''}</option>`).join('')}</select></label>`;
        const head = UI().pageHeader({where: 'Graphiques · Statistiques', title: 'Transmission des prénoms', icon: '👶',
            help: 'Pour chaque enfant, d’où vient probablement son prénom : parrain, marraine, grand-parent, frère ou sœur mort avant (prénom « relevé »), oncle, tante, saint du jour. Chaque piste a sa règle et un indice de confiance ; tu peux la corriger sur la fiche ou ici avec ⋯. Sans les personnes en vie ni les fiches confidentielles.',
            actions: [A().graphExportToolbarHtml?.() || '']});
        A().$('#workspace').innerHTML = `<section class="page pf-page">${head}${filtersHtml(nameSel)}
            <div class="stats-stage pf-stage">
            ${d.total ? `<div class="pf-sum">
                <div class="pf-tile"><b>${fmt(d.found, 0)}</b><span>${d.found > 1 ? 'prénoms expliqués' : 'prénom expliqué'} sur ${plural(d.total, 'enfant')}</span></div>
                <div class="pf-tile"><b>${pct(d.named_godparent, d.with_godparents)} %</b><span>des enfants qui ont un parrain ou une marraine notés portent son prénom (${fmt(d.named_godparent, 0)} sur ${fmt(d.with_godparents, 0)})</span></div>
                ${kinds.filter(k => d.by_kind?.[k]).map(k => `<div class="pf-tile is-kind"><b style="color:${KIND[k][2]}">${KIND[k][0]} ${fmt(d.by_kind[k], 0)}</b><span>${esc(KIND[k][1])}</span></div>`).join('')}</div>
            <section class="pf-block"><h3>🌳 Les flèches de transmission</h3><p class="ui-hint">Une ligne par prénom, les années en travers : chaque flèche va de la personne qui transmet à l’enfant. Clique sur un rond pour ouvrir la fiche.</p>
                <div class="pf-chains">${chainsSvg(rows, name)}</div>
                <div class="pf-legend">${kinds.filter(k => rows.some(r => r.kind === k)).map(k => `<span><i style="background:${KIND[k][2]}"></i>${esc(KIND[k][1])}</span>`).join('')}</div></section>
            <section class="pf-block pf-charts">${stack ? `<div>${stack}</div>` : ''}${shareSvg ? `<div>${shareSvg}</div>` : ''}</section>
            <section class="pf-block"><h3>Chaque enfant</h3><div data-pf-sortbar></div><div class="data-table-wrap"><table class="data-table pf-table"><thead><tr><th>Enfant</th><th>Prénom reçu de</th><th>Pourquoi</th><th>Confiance</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody data-pf-tbody></tbody></table></div><div data-pf-more-rows></div>
                ${d.truncated ? `<p class="ui-hint">La liste s’arrête à ${fmt(d.max_rows, 0)} enfants (les prénoms les plus transmis d’abord) ; les chiffres du haut comptent tout le monde. Choisis un prénom pour voir les autres.</p>` : ''}</section>`
            : A().emptyState({icon: '👶', text: name ? `Aucun enfant prénommé ${name}` : 'Rien à comparer pour l’instant', hint: 'Il faut des enfants reliés à leurs parents (ou des parrains et marraines notés comme témoins « parrain », « marraine » de la naissance ou du baptême).'})}
            </div></section>`;
        const root = A().$('#workspace > .pf-page');
        A().bindGraphExportControls?.();
        bindFilters(root, () => ext.graphStats.name_transmission(++S().workspaceToken));
        root.querySelector('[data-pf-name]')?.addEventListener('change', e => { S().pfName = e.target.value; ext.graphStats.name_transmission(++S().workspaceToken); });
        // C6 : « N enfants · Trier : … » et « Voir les 100 suivants ↓ »
        const tbody = root.querySelector('[data-pf-tbody]');
        if (tbody) {
            const SORTS = {name: (a, b) => a.child_name.localeCompare(b.child_name, 'fr'), za: (a, b) => b.child_name.localeCompare(a.child_name, 'fr'), old: (a, b) => (a.year ?? 9999) - (b.year ?? 9999), recent: (a, b) => (b.year ?? -9999) - (a.year ?? -9999), sure: (a, b) => b.score - a.score, unsure: (a, b) => a.score - b.score};
            let sort = UI().sortOf ? UI().sortOf('prenoms-transmis', 'old') : 'old'; if (!SORTS[sort]) sort = 'old';
            let shown = 100, list = [];
            const more = UI().moreButton?.({remaining: 0, step: 100, onClick: () => { shown += 100; paint(); }});
            const paint = () => {
                list = rows.map((r, i) => ({...r, i})).sort(SORTS[sort]);
                tbody.innerHTML = list.slice(0, shown).map(r => `<tr data-pf-row="${r.i}">
                <td><button type="button" class="link-button" data-pf-open="${r.child}">${esc(r.child_name)}</button> <small class="muted">${r.year ?? ''}</small></td>
                <td>${r.source ? `<button type="button" class="link-button" data-pf-open="${r.source}">${esc(r.source_name)}</button>` : esc(r.source_name)} <small class="muted">${esc(r.rel)}</small></td>
                <td><small>${esc(r.rule)}</small></td><td>${confBadge(r)}</td>
                <td>${ro() ? '' : `<button type="button" class="icon-button small" data-pf-row-more="${r.i}" title="Plus d’actions" aria-label="Plus d’actions">⋯</button>`}</td></tr>`).join('');
                more?.update(list.length - shown);
            };
            const bar = UI().sortBar?.({count: rows.length, label: 'enfant', value: sort, options: [['old', 'Les plus anciens'], ['recent', 'Les plus récents'], ['name', 'A → Z'], ['za', 'Z → A'], ['sure', 'Les plus sûrs d’abord'], ['unsure', 'Les moins sûrs d’abord']],
                onChange: v => { sort = v; shown = 100; try { localStorage.setItem('lcnda-sort:prenoms-transmis', v); } catch (_) {} paint(); }});
            if (bar) root.querySelector('[data-pf-sortbar]').appendChild(bar);
            if (more) root.querySelector('[data-pf-more-rows]').appendChild(more);
            paint();
        }
        root.addEventListener('click', e => {
            const o = e.target.closest('[data-pf-open]'); if (o) { A().openPersonById(Number(o.dataset.pfOpen)); return; }
            const m = e.target.closest('[data-pf-row-more]'); if (m) { const r = rows[Number(m.dataset.pfRowMore)]; if (r) originMenu(m, r.child, {origin: {...r, id: r.source, name: r.source_name}}, () => ext.graphStats.name_transmission(++S().workspaceToken)); }
        });
        root.querySelector('.pf-chains')?.addEventListener('keydown', e => { const o = e.target.closest('[data-pf-open]'); if (o && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); A().openPersonById(Number(o.dataset.pfOpen)); } });
    };

    /** les flèches : une ligne par prénom (les plus transmis d’abord, 14 au plus), x = l’année de naissance */
    function chainsSvg(rows, only) {
        const list = rows.filter(r => r.source > 0 && r.year && r.source_year);
        if (!list.length) return A().empty ? A().empty('Aucune transmission entre deux fiches datées (le saint du jour n’a pas de flèche).', {icon: '🌳'}) : '';
        const by = new Map(); list.forEach(r => { if (!by.has(r.first)) by.set(r.first, []); const l = by.get(r.first); if (l.length < 150) l.push(r); }); // 150 flèches par ligne au plus : la ligne reste lisible
        const lanes = [...by.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, only ? 1 : 14);
        const ys = lanes.flatMap(([, l]) => l.flatMap(r => [r.year, r.source_year]));
        const y0 = Math.floor(Math.min(...ys) / 10) * 10, y1 = Math.ceil((Math.max(...ys) + 1) / 10) * 10;
        const W = 960, labW = 110, padR = 20, laneH = 64, top = 26;
        const X = y => labW + (y - y0) / ((y1 - y0) || 1) * (W - labW - padR);
        let svg = '', axis = '';
        const step = (y1 - y0) > 200 ? 50 : (y1 - y0) > 80 ? 20 : 10;
        for (let y = y0; y <= y1; y += step) axis += `<line x1="${X(y)}" x2="${X(y)}" y1="${top - 6}" y2="${top + lanes.length * laneH}" stroke="currentColor" stroke-opacity=".1"/><text x="${X(y)}" y="${top - 10}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".7">${y}</text>`;
        lanes.forEach(([first, l], i) => {
            const cy = top + i * laneH + laneH / 2;
            svg += `<text x="6" y="${cy}" font-size="13" font-weight="600" dominant-baseline="middle" fill="currentColor">${esc(first)}</text><line x1="${labW}" x2="${W - padR}" y1="${cy}" y2="${cy}" stroke="currentColor" stroke-opacity=".15" stroke-dasharray="3 3"/>`;
            const nodes = new Map();
            l.forEach(r => { nodes.set(r.source, {id: r.source, y: r.source_year, name: r.source_name}); nodes.set(r.child, {id: r.child, y: r.year, name: r.child_name, g: r.gender}); });
            // deux personnes nées presque la même année : l’une au-dessus, l’autre au-dessous
            const sorted = [...nodes.values()].sort((a, b) => a.y - b.y); let last = -1e9, flip = 1;
            sorted.forEach(n => { if (X(n.y) - last < 24) { flip = -flip; n.dy = flip * 13; } else { n.dy = 0; flip = 1; } last = X(n.y); });
            l.forEach(r => {
                const a = nodes.get(r.source), b = nodes.get(r.child), xa = X(a.y), xb = X(b.y), ya = cy + a.dy, yb = cy + b.dy, mid = (xa + xb) / 2, lift = Math.min(26, 8 + Math.abs(xb - xa) / 6);
                const col = KIND[r.kind]?.[2] || '#888', dir = xb >= xa ? 1 : -1, near = Math.abs(xb - xa) < 24;
                svg += `<path d="M${xa.toFixed(1)} ${ya} Q${mid.toFixed(1)} ${(Math.min(ya, yb) - (near ? 22 : lift)).toFixed(1)} ${(xb - (near ? 0 : 7 * dir)).toFixed(1)} ${(yb - (near ? 7 : 0)).toFixed(1)}" fill="none" stroke="${col}" stroke-width="2" marker-end="url(#pf-arrow-${r.kind})"><title>${esc(`${r.source_name} → ${r.child_name} : ${r.rule}`)}</title></path>`;
            });
            nodes.forEach(n => {
                const x = X(n.y), y = cy + n.dy;
                svg += `<g class="pf-node" data-pf-open="${n.id}" tabindex="0" role="button" aria-label="${esc(`${n.name} (${n.y}) : ouvrir la fiche`)}"><circle cx="${x.toFixed(1)}" cy="${y}" r="6" fill="var(--pf-node, #fff)" stroke="currentColor" stroke-width="1.6"/><title>${esc(`${n.name} (${n.y})`)}</title></g>`;
            });
        });
        const markers = Object.entries(KIND).map(([k, v]) => `<marker id="pf-arrow-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${v[2]}"/></marker>`).join('');
        const H = top + lanes.length * laneH + 6;
        const more = !only && by.size > lanes.length ? `<p class="ui-hint">Les ${lanes.length} prénoms les plus transmis ; choisis un prénom dans « Prénom » pour le voir seul.</p>` : '';
        return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Flèches de transmission des prénoms" class="pf-chains-svg"><defs>${markers}</defs>${axis}${svg}</svg>${more}`;
    }

    /* ── corriger à la main : le même ⋯ sur la fiche et dans la liste ── */
    async function setOrigin(child, source, verdict, msg, after) {
        let r;
        try { r = await api('name_origin_set', {}, {method: 'POST', body: {child, source, verdict}}); } catch (e) { A().toast(e.message || 'Enregistrement impossible.', 'error'); return; }
        const before = (r.result || r).before || [];
        await after?.();
        const undo = async () => { await api('name_origin_set', {}, {method: 'POST', body: {child, source: 0, verdict: 'reset', rows: before}}); await after?.(); };
        const redo = async () => { await api('name_origin_set', {}, {method: 'POST', body: {child, source, verdict}}); await after?.(); };
        if (A().undoToast) A().undoToast(msg, {undo, redo}); else A().toast(msg);
    }
    function originMenu(btn, child, info, after) {
        if (ro()) return;
        const o = info.origin, items = [];
        if (o && !o.manual && o.id > 0) items.push({icon: '✓', label: 'C’est bien ça', help: 'Garder cette piste comme sûre', run: () => setOrigin(child, o.id, 'yes', `Prénom reçu de ${o.name} : confirmé.`, after)});
        if (o) items.push({icon: '✕', label: 'Ce n’est pas ça', help: 'Écarter cette piste', run: () => setOrigin(child, o.id, o.manual === 'chosen' ? 'clear' : 'no', 'Piste écartée.', after)});
        (info.others || []).slice(0, 3).forEach(x => items.push({icon: KIND[x.kind]?.[0] || '•', label: `Plutôt : ${x.rel.replace(/\s*\(.*$/, '')} ${x.id ? x.name : ''}`.trim(), help: x.rule, run: () => x.id > 0 ? setOrigin(child, x.id, 'yes', `Prénom reçu de ${x.name}.`, after) : setOrigin(child, o?.id || 0, 'no', 'Piste écartée.', after)}));
        items.push({icon: '👤', label: 'Choisir la personne…', help: 'Celle dont il ou elle tient son prénom', run: async () => {
            const it = await A().openPicker?.({kind: 'person', title: 'De qui tient-il son prénom ?'}); if (!it?.id) return;
            if (Number(it.id) === Number(child)) { A().toast('Choisis une autre personne que l’enfant.', 'error'); return; }
            setOrigin(child, Number(it.id), 'yes', `Prénom reçu de ${it.title || 'la personne choisie'}.`, after);
        }});
        if (o?.manual || (info.rejected || []).length) items.push('-', {icon: '↺', label: 'Remettre comme au départ', help: 'Oublier les corrections à la main', run: () => setOrigin(child, 0, 'clear', 'Corrections oubliées : le calcul de l’app revient.', after)});
        items.push('-', {icon: '↗', label: 'Voir la transmission de ce prénom', run: () => { const st = S(); st.graphMode = 'stats'; st.graphStatsType = 'name_transmission'; st.pfName = info.firstDisplay || ''; A().persistUiState?.(); A().setModule('graphiques'); }});
        UI().menuAt(btn, items, {title: 'Prénom reçu de…'});
    }

    /* ── la fiche : « 👶 Prénom reçu de… » sous l’identité ── */
    ext.afterPerson = ext.afterPerson || [];
    ext.afterPerson.push(detail => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !String(p.first_name || '').trim()) return;
        const id = Number(p.id);
        api('prenoms_transmis', {person: id}).then(info => {
            if (Number(S().currentPersonId) !== id && Number(S().currentPerson?.person?.id) !== id) return;
            const cardBody = [...document.querySelectorAll('#workspace .person-page .card')].find(c => /^Identité/.test(c.querySelector('.card-title h3')?.textContent?.trim() || ''))?.querySelector('.card-body');
            if (!cardBody) return;
            cardBody.querySelector('.pf-line')?.remove();
            const o = info.origin; if (!o) return;
            const first = String(p.first_name).trim().split(/[\s,]+/)[0];
            info.firstDisplay = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
            const who = o.id > 0 ? `<button type="button" class="link-button" data-pf-open="${o.id}">${esc(o.name)}</button>` : `<b>${esc(o.name)}</b>`;
            const rel = o.kind === 'saint' ? 'saint du jour : ' : o.kind === 'manual' && o.rel === 'choisi à la main' ? '' : esc(o.rel.replace(/\s*\(.*$/, '').replace(/, mort.*$/, '')) + ' ';
            const line = document.createElement('div'); line.className = 'pf-line';
            line.innerHTML = `<span class="pf-line-ico" aria-hidden="true">👶</span><span class="pf-line-text">Prénom reçu de ${rel}${who} ${confBadge(o)}<small class="ui-hint">${esc(o.rule)}${o.manual ? '' : ' · indice ' + o.score + ' sur 100'}</small></span>${ro() ? '' : '<button type="button" class="icon-button small" data-pf-more title="Plus d’actions" aria-label="Plus d’actions">⋯</button>'}`;
            const after = cardBody.querySelector('.person-saint') || cardBody.querySelector('.data-list');
            if (after) after.insertAdjacentElement('afterend', line); else cardBody.prepend(line);
            line.addEventListener('click', e => {
                const op = e.target.closest('[data-pf-open]'); if (op) { A().openPersonById(Number(op.dataset.pfOpen)); return; }
                const m = e.target.closest('[data-pf-more]'); if (m) originMenu(m, id, info, () => ext.afterPerson.find(f => f._pf)?.(detail));
            });
        }).catch(() => {});
    });
    ext.afterPerson[ext.afterPerson.length - 1]._pf = true;

    /* ═════════ 📊 Ta famille et l'histoire de France ═════════ */
    const range = v => !v ? null : v[0] === v[1] ? fmt(v[0]) : `${fmt(v[0])}–${fmt(v[1])}`;
    const mid = v => !v ? null : Math.round((Number(v[0]) + Number(v[1])) * 5) / 10; // le milieu de la fourchette, au dixième
    ext.graphStats.family_vs_france = async token => {
        let d;
        try { d = await api('famille_france', filterQuery()); } catch (e) { if (current(token, 'family_vs_france')) showError(e, 'famille_france'); return; }
        if (!current(token, 'family_vs_france')) return;
        const src = d.sources || {}, used = new Set();
        const head = UI().pageHeader({where: 'Graphiques · Statistiques', title: 'Ta famille et l’histoire de France', icon: '📊',
            help: 'Les moyennes de ta famille à côté des moyennes françaises de la même époque (≈ : des ordres de grandeur, avec leur source). Une famille compte quelques dizaines d’actes : la comparaison se lit en gros. Sans les personnes en vie ni les fiches confidentielles.',
            actions: [A().graphExportToolbarHtml?.() || '']});
        const sexName = {h: 'Hommes', f: 'Femmes', all: 'Tous'};
        const blocks = (d.indicators || []).filter(ind => ind.rows.length).map(ind => {
            const lines = [];
            ind.rows.forEach(r => {
                used.add(r.source);
                const sx = ['h', 'f'].filter(s => r.france[s]).length ? ['h', 'f'] : ['all'];
                // une espérance de vie sans détail par sexe en France : on compare à toute la famille
                sx.forEach(s => lines.push({r, s, fr: r.france[s] || r.france.all, fam: r.family[s], n: r.n[s], ids: r.ids[s]}));
            });
            const unit = ind.unit === '%' || ind.unit === '‰' ? ind.unit : ' ' + ind.unit;
            const spec = {kind: 'dumbbell', o: {title: '', unit: ind.unit === 'ans' ? 'ans' : ind.unit, showGap: true, values: true}, series: [{name: 'Ta famille', color: '#d9480f'}, {name: 'France ≈', color: '#2a6fdb'}],
                rows: lines.map(l => ({label: `${l.r.label}${l.s !== 'all' ? ' · ' + sexName[l.s] : ''}`, s0: l.fam === null || l.n < 1 ? '' : l.fam, s1: mid(l.fr)}))};
            const svg = lines.some(l => l.fam !== null) ? SVG(spec) : '';
            return `<section class="pf-block ff-ind" data-ff-key="${esc(ind.key)}"><h3>${esc(ind.icon)} ${esc(ind.label)}</h3><p class="ui-hint">${esc(ind.family_text)}</p>
                ${svg ? `<div class="ff-chart">${svg}</div>` : ''}
                <div class="data-table-wrap"><table class="data-table ff-table"><thead><tr><th>Époque</th><th>Ta famille</th><th>France</th><th>Source</th></tr></thead><tbody>${lines.map((l, i) => `<tr>
                    <td>${esc(l.r.label)}${l.s !== 'all' ? ` · ${sexName[l.s]}` : ''}${l.r.who_text ? `<br><small class="muted">personnes ${esc(l.r.who_text)}</small>` : ''}</td>
                    <td>${l.fam === null ? '<span class="muted">pas de données</span>' : `<b>${fmt(l.fam)}${unit}</b> ${(() => { const t = ind.key === 'infant' ? `${fmt(l.r.extra?.dead ?? l.ids.length, 0)} sur ${plural(l.n, 'naissance')}` : ind.key === 'farm' ? `${fmt(l.ids.length, 0)} sur ${plural(l.n, 'personne')}` : plural(l.n, ind.key === 'children' ? 'couple' : 'personne');
                        return l.ids.length ? `<button type="button" class="link-button" data-ff-who="${esc(ind.key)}|${i}" title="Voir les personnes">${t}</button>` : `<small class="muted">(${t})</small>`; })()}${l.n > 0 && l.n < 10 ? ' <small class="muted" title="Moins de 10 : à lire avec prudence">⚠️ peu</small>' : ''}`}</td>
                    <td>≈ ${range(l.fr)}${unit}</td><td><small>${esc(src[l.r.source]?.label?.split(',')[0] || l.r.source)}</small></td></tr>`).join('')}</tbody></table></div></section>`;
        });
        A().$('#workspace').innerHTML = `<section class="page pf-page ff-page">${head}${filtersHtml()}
            <div class="stats-stage pf-stage">${blocks.length ? blocks.join('') : A().emptyState({icon: '📊', text: 'Aucune époque dans cette période', hint: 'Les repères français vont de 1686 à 1999 : élargis la période.'})}
            <section class="pf-block ff-sources"><h3>📚 D’où viennent les chiffres de la France</h3><p class="ui-hint">${esc(d.note)}</p><ul>${[...used].filter(k => src[k]).map(k => `<li>${esc(src[k].label)}${src[k].url ? ` · <a href="${esc(src[k].url)}" target="_blank" rel="noopener noreferrer">${esc(new URL(src[k].url).hostname)} ↗</a>` : ''}</li>`).join('')}</ul></section></div></section>`;
        const root = A().$('#workspace > .ff-page');
        A().bindGraphExportControls?.();
        bindFilters(root, () => ext.graphStats.family_vs_france(++S().workspaceToken));
        root.addEventListener('click', async e => {
            const b = e.target.closest('[data-ff-who]'); if (!b) return;
            const [key, i] = b.dataset.ffWho.split('|'), ind = d.indicators.find(x => x.key === key); if (!ind) return;
            const lines = ind.rows.flatMap(r => (['h', 'f'].filter(s => r.france[s]).length ? ['h', 'f'] : ['all']).map(s => ({r, s})));
            const l = lines[Number(i)]; if (!l) return;
            const ids = l.r.ids[l.s];
            try {
                const res = await api('diagram_cartes2', {what: 'people', ids: ids.join(',')});
                ext.whoDialog?.({eyebrow: 'TA FAMILLE ET LA FRANCE', label: `${ind.label} · ${l.r.label}${l.s !== 'all' ? ' · ' + sexName[l.s] : ''}`, n: ids.length, total: l.r.n[l.s] || ids.length, color: '#d9480f', res: {people: res.people || [], truncated: ids.length >= 400}, csvName: `${ind.label} ${l.r.label}`});
            } catch (err) { A().toast(err.message || 'Lecture impossible.', 'error'); }
        });
    };
})();
