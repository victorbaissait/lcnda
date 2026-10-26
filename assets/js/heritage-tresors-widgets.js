/* LCNDA — ✨ Trésors sur le tableau de bord et dans les Listes :
 *  - widget « 🌌 Le ciel de naissance » (une personne au choix, l'heure) ;
 *  - widget « 📰 La gazette de l'année » (une année au choix, une année au hasard chaque jour, ou il y a 100 ans) ;
 *  - Listes › 📰 Gazettes : une ligne par année de la famille, « Lire » ouvre la gazette.
 * Les calculs viennent de heritage-tresors-ciel.js (ext.tresorSky) et heritage-tresors-ateliers.js (ext.tresorGazette).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.dashboard = ext.dashboard || {};
    ext.dashboardConfig = ext.dashboardConfig || {};
    ext.lists = ext.lists || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const P = () => window.LCNDA_PICKER;
    const T = () => ext.tresors?.T;
    const titleOf = (w, dflt) => String(w?.config?.title || '').trim() || dflt;

    /* ═════════ Les widgets ═════════ */
    const WIDGETS = [
        ['tr_sky', '🌌 Le ciel de naissance', '4', 'Les étoiles, la Lune et les planètes au-dessus du village, la nuit de la naissance d’une personne au choix.'],
        ['tr_gazette', '📰 La gazette de l’année', '6', 'La une du journal de la famille pour une année : au choix, une année au hasard chaque jour, ou il y a 100 ans.'],
    ];
    function register() {
        const app = A(); if (!app?.defaultDashboardBlocks) return;
        WIDGETS.forEach(([k, l, w, info]) => {
            if (!app.defaultDashboardBlocks.some(x => x[0] === k)) app.defaultDashboardBlocks.push([k, l]);
            if (app.defaultDashboardBlockSpans) app.defaultDashboardBlockSpans[k] = w;
            if (app.dashboardWidgetInfo) app.dashboardWidgetInfo[k] = info;
        });
        if (app.defaultListTypes && !app.defaultListTypes.some(x => x[0] === 'gazettes')) app.defaultListTypes.push(['gazettes', '37c', '📰 Gazettes']);
    }
    register(); document.addEventListener('DOMContentLoaded', register, {once: true});
    const load = async () => { try { return await T()?.tree(); } catch (_) { return null; } };
    const off = msg => A().empty(msg, {icon: '✨'});

    /* ── 🌌 le ciel ── */
    let skyN = 0;
    ext.dashboard.tr_sky = {load, render: (index, widget, span, tr) => {
        const S = ext.tresorSky; if (!tr || !S || !T()) return A().card(index, titleOf(widget, '🌌 Le ciel de naissance'), '', off('Les Trésors n’ont pas pu se charger.'), span);
        const c = widget.config || {}, p = tr.byId.get(Number(c.person)) || T().start(tr), b = p && S.birthOf(T(), tr, p), hour = Number.isFinite(Number(c.hour)) && c.hour !== '' ? Number(c.hour) : 22;
        if (!b) return A().card(index, titleOf(widget, '🌌 Le ciel de naissance'), '', off(p ? `Il faut au moins l’année de naissance de ${T().name(p)} pour voir son ciel.` : 'Choisis une personne dans les réglages du widget.'), span);
        const id = `tr-sky-${++skyN}`;
        setTimeout(() => { const el = document.getElementById(id); if (!el) return; const s = S.sky({date: b.date, hour, lat: b.lat, lng: b.lng}); S.drawSky(el.querySelector('canvas'), s, S.caption(T(), p, b, s, hour));
            el.querySelector('[data-sky-txt]').textContent = `${s.moon.phase}${s.planets.some(x => x.alt > 0) ? ' · ' + s.planets.filter(x => x.alt > 0).map(x => x.n).join(', ') : ''}${b.exact ? '' : ' · date exacte inconnue'}`; }, 0);
        return A().card(index, titleOf(widget, `🌌 Le ciel de naissance de ${p.first || T().name(p)}`), '', `<div class="h-tr-skyblock" id="${id}"><canvas width="600" height="670"></canvas><p class="muted" data-sky-txt></p></div>`, span,
            `<button type="button" class="button small secondary" data-sky-big="${p.id}">Agrandir</button>`);
    }};
    ext.dashboardConfig.tr_sky = {
        html: w => { const c = w?.config || {};
            return `<fieldset class="h-trw-cfg"><legend>Le ciel de naissance</legend><div data-trw-person><span class="pk-lab">De qui ? <small>(vide = la personne de départ)</small></span>${P()?.pickerField?.({name: 'trw_person', hiddenName: false, kind: 'person', animals: false, value: Number(c.person) || null}) || ''}<input type="hidden" data-trw="person" value="${Number(c.person) || ''}"></div>
                <label>L’heure<select data-trw="hour">${[[20, '20 h'], [22, '22 h (la nuit tombée)'], [0, 'minuit'], [3, '3 h du matin'], [5, '5 h, avant l’aube']].map(([v, l]) => `<option value="${v}" ${Number(c.hour ?? 22) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></fieldset>`; },
        read: ed => ({person: Number(ed.querySelector('[data-trw=person]')?.value) || 0, hour: Number(ed.querySelector('[data-trw=hour]')?.value ?? 22)}),
    };
    document.addEventListener('picker-change', e => { const box = e.target.closest?.('[data-trw-person]'); if (!box) return; const it = e.detail?.item; box.querySelector('[data-trw=person]').value = it && !it.free ? Number(it.id) || '' : ''; });

    /* ── 📰 la gazette ── */
    /** les années où il s'est passé quelque chose dans la famille, les plus remplies d'abord pour le hasard */
    const yearsOf = tr => [...new Set(tr.events.map(e => e.y).filter(Boolean))].sort((a, b) => a - b);
    function yearFor(tr, c) {
        const ys = yearsOf(tr), now = new Date();
        if (c.mode === 'fixe' && Number(c.year)) return Number(c.year);
        if (c.mode === 'cent') return now.getFullYear() - 100;
        if (!ys.length) return now.getFullYear();
        const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5); return ys[day % ys.length]; // une année au hasard, la même toute la journée
    }
    ext.dashboard.tr_gazette = {load, render: (index, widget, span, tr) => {
        const G = ext.tresorGazette; if (!tr || !G || !T()) return A().card(index, titleOf(widget, '📰 La gazette de l’année'), '', off('Les Trésors n’ont pas pu se charger.'), span);
        const c = widget.config || {}, Y = yearFor(tr, c), g = G.gazette(T(), tr, Y), fam = T().start(tr)?.last || 'nôtres';
        const line = (l, n) => (n ? `<li><b>${n}</b> ${esc(l)}${n > 1 ? 's' : ''}</li>` : '');
        const body = `<article class="h-trw-gz"><header><small>Année ${Y}</small><b>La Gazette des ${esc(fam)}</b></header><h4>${esc(g.headline)}</h4>
            <ul>${line('naissance', g.born.length)}${line('mariage', g.wed.length)}${line('décès', g.dead.length)}${line('autre nouvelle', g.other.length)}</ul>
            ${g.born.length + g.wed.length + g.dead.length + g.other.length ? '' : '<p class="muted">Une année tranquille dans la famille.</p>'}</article>`;
        return A().card(index, titleOf(widget, '📰 La gazette de l’année'), '', body, span, `<button type="button" class="button small secondary" data-trw-gz="${Y}">Lire la gazette</button>`);
    }};
    ext.dashboardConfig.tr_gazette = {
        html: w => { const c = {mode: 'jour', year: '', ...(w?.config || {})};
            return `<fieldset class="h-trw-cfg"><legend>La gazette</legend><label>Quelle année<select data-trw="mode">${[['jour', 'Une année de la famille au hasard, chaque jour'], ['cent', 'Il y a 100 ans'], ['fixe', 'Une année précise']].map(([v, l]) => `<option value="${v}" ${c.mode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label>L’année précise<input type="number" data-trw="year" min="1000" max="${new Date().getFullYear()}" value="${esc(c.year || '')}" style="width:7em"></label></fieldset>`; },
        read: ed => ({mode: ed.querySelector('[data-trw=mode]')?.value || 'jour', year: Number(ed.querySelector('[data-trw=year]')?.value) || ''}),
    };
    const openGazette = y => { if (!ext.tresorGazette) return; ext.tresorGazette.pending = Number(y) || null; ext.tresors?.open('gazette'); };
    document.addEventListener('click', e => { const b = e.target.closest('[data-trw-gz]'); if (b) { e.preventDefault(); openGazette(b.dataset.trwGz); } });

    /* ═════════ Listes › 📰 Gazettes ═════════ */
    ext.lists.gazettes = async token => {
        const S = A().state, ok = () => token === S.workspaceToken && S.module === 'listes', ws = A().$('#workspace');
        if (!T() || !ext.tresorGazette) { ws.innerHTML = `<section class="page">${A().empty('Les Trésors n’ont pas pu se charger.')}</section>`; return; }
        let tr; try { tr = await T().tree(); } catch (err) { if (ok()) ws.innerHTML = `<section class="page">${A().empty(err.message || 'L’arbre n’a pas pu être lu.')}</section>`; return; }
        if (!ok()) return;
        const rows = yearsOf(tr).map(y => ({y, g: ext.tresorGazette.gazette(T(), tr, y)})).filter(r => r.g.born.length + r.g.wed.length + r.g.dead.length + r.g.other.length).reverse();
        ws.innerHTML = `<section class="page collection-page h-gz-list">${window.LCNDA_UI.pageHeader({icon: '📰', title: 'Gazettes', help: 'Une gazette pour chaque année où il s’est passé quelque chose dans la famille : le gros titre, les naissances, les mariages, les décès. « Lire » ouvre la une du journal, à imprimer.'})}
            ${rows.length ? `<div class="data-table-wrap"><table class="data-table sortable-table" data-sortbar="gazette"><thead><tr>${['Année', 'Gros titre', 'Naissances', 'Mariages', 'Décès', 'Autres nouvelles'].map((h, i) => `<th><button data-sort-column="${i}">${h}</button></th>`).join('')}<th></th></tr></thead><tbody>
                ${rows.map(({y, g}) => `<tr><td data-sort-value="${y}"><b>${y}</b></td><td>${esc(g.headline)}</td><td data-sort-value="${g.born.length}">${g.born.length || ''}</td><td data-sort-value="${g.wed.length}">${g.wed.length || ''}</td><td data-sort-value="${g.dead.length}">${g.dead.length || ''}</td><td data-sort-value="${g.other.length}">${g.other.length || ''}</td><td><button type="button" class="button small secondary" data-trw-gz="${y}">Lire</button></td></tr>`).join('')}</tbody></table></div>`
                : A().emptyState({icon: '📰', text: 'Aucune gazette pour l’instant', hint: 'Il faut des dates dans l’arbre : une naissance, un mariage, un décès…'})}</section>`;
        A().bindTableLinks?.();
    };
})();
