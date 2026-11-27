/* LCNDA — 📍 Les lieux encore à placer (maquette validée : docs/design/cartes-nouvelles.html, partie 6 ; serveur : lib/lieux_a_placer.php).
 * Toutes les cartes perdent les lieux sans position (« ⚠ Lieux sans position ») : cet outil les rassemble, les regroupe par
 * commune probable grâce au référentiel des communes livré avec l'app (sans Internet), et les place en un clic, ou en lot
 * après une revue. Rien n'est placé sans ta confirmation ; aucun service en ligne n'est appelé sans ton choix, lieu par lieu.
 * Entrées : Carte → « 📍 Lieux à placer » (la carte suit le lieu choisi), Tableau de bord → « Communes à compléter » → 📍 Placer…,
 * Listes → Lieux → « 📍 Lieux à placer… », le bandeau « ⚠ Lieux sans position » des cartes de Graphiques (seulement leurs lieux).
 * Un seul message « ↶ Annuler » (H7) remet les anciennes valeurs, pour un lieu comme pour un lot. Mode consultation : la liste
 * se lit, aucun bouton « Placer ». Réglages : « ⚙️ Réglages » du panneau (gardés dans ce navigateur : lcnda-lieux-a-placer).
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['mapSetup', 'mapDraw']) ext[key] = ext[key] || [];
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const pl = (n, one, many = '') => A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? many || one + 's' : one}`;
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const KEY = 'lcnda-lieux-a-placer';
    /** les réglages (Réglages · 6), l'option conseillée d'abord */
    const DEF = {check: 'sure', lieudit: 'spot', several: 'nearest', spelling: 'norm', what: 'all', online: 'off', alert: 200};
    const CHOICES = {
        check: ['Cochés au départ dans la revue', [['sure', 'Seulement les « sûrs »'], ['probable', 'Les sûrs et les probables'], ['none', 'Rien']]],
        lieudit: ['Un lieu-dit', [['spot', 'Au lieu-dit s’il est connu, sinon au centre de sa commune marqué « approché »'], ['center', 'Toujours au centre de la commune'], ['skip', 'Ne pas le placer']]],
        several: ['Plusieurs communes du même nom', [['nearest', 'Proposer la plus proche des autres lieux, jamais cochée'], ['ask', 'Toujours me demander sans proposer']]],
        spelling: ['Orthographes', [['norm', 'Rapprocher St / Saint, accents, tirets, majuscules'], ['fuzzy', 'Aussi les fautes proches, proposées seulement'], ['exact', 'Le nom exact seulement']]],
        what: ['Ce qui est repris', [['all', 'Position, code INSEE et département'], ['pos', 'La position seulement']]],
        online: ['Recherche en ligne', [['off', 'Jamais : le bouton est caché'], ['on', 'Un bouton « 🌐 En ligne… » par lieu, avec le message à chaque fois (jamais en lot, jamais toute seule)']]],
        alert: ['Alerte « loin du reste »', [['200', 'À partir de 200 km'], ['50', '50 km'], ['100', '100 km'], ['500', '500 km']]],
    };
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } const out = {...DEF}; for (const k of Object.keys(DEF)) if (s[k] != null && CHOICES[k][1].some(([v]) => String(v) === String(s[k]))) out[k] = k === 'alert' ? Number(s[k]) : s[k]; return out; };
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const STATUS = {sure: ['✓', 'Sûr', 'green'], probable: ['?', 'Probable', 'yellow'], several: ['?', 'Plusieurs communes', 'yellow'], old: ['🕰', 'Ancienne commune', 'violet'], abroad: ['🌍', 'Hors de France', 'blue'], none: ['✕', 'Rien trouvé', 'red']};
    const badge = st => { const [ic, l, c] = STATUS[st] || STATUS.none; return UI()?.badge ? UI().badge(`${ic} ${i18n(l)}`, c) : `<span class="lap-badge is-${c}">${esc(ic)} ${esc(i18n(l))}</span>`; };
    const WHY = {
        name_dept: 'Même nom et même département que dans le référentiel des communes : une seule commune « {name} ». Centre de la commune, code INSEE et département repris.',
        national: 'Une seule commune « {name} » en France, mais pas de département écrit.',
        several: '{n} communes de ce nom en France. Les plus proches des autres lieux de ces événements sont proposées, jamais cochées toutes seules.',
        several_ask: '{n} communes de ce nom en France : choisis la bonne.',
        lieudit: 'Lieu-dit connu dans le référentiel (GeoNames) dans la commune de {name}.',
        lieudit_center: 'Lieu-dit inconnu du référentiel : au centre de {name}, marqué « position approchée ».',
        old: 'Pas une commune d’aujourd’hui ; l’historique INSEE (🏛 Frontières anciennes) dit : réunie à {to} en {year}.',
        abroad: 'Ville du monde livrée avec l’app, départagée par le pays écrit ({country}).',
        abroad_none: 'Pas trouvé parmi les villes du monde livrées pour ce pays ({country}).',
        fuzzy: 'Pas de commune à ce nom. Orthographe proche proposée. Rien n’est cherché en ligne.',
        none: 'Pas de commune à ce nom. Rien n’est cherché en ligne.',
    };
    const whyText = (it, s) => { const w = it.why || {code: 'none'}, code = w.code === 'several' && s.several === 'ask' ? 'several_ask' : w.code; return i18n(WHY[code] || WHY.none, {name: w.name || '', n: String(w.n || ''), to: w.to || '?', year: w.year || '?', country: w.country || ''}); };
    const api = (action, q = {}, o) => A().api(action, q, o);
    const post = (action, body) => api(action, {}, {method: 'POST', body});

    let D = null; // l'état du panneau ouvert
    let pin = null; // le point montré sur la Carte : {lat, lon, label}
    let picking = null; // « 📍 Sur la carte » : le lieu qui attend un clic

    /* ═════════ Le panneau ═════════ */
    async function open({ids = []} = {}) {
        close();
        const onMap = A()?.state?.module === 'carte';
        const dlg = document.createElement('dialog'); dlg.className = 'lap-dlg' + (onMap ? ' is-side' : '');
        dlg.setAttribute('aria-label', i18n('Lieux à placer'));
        dlg.innerHTML = `<header class="lap-head"><div><span class="eyebrow">${esc(i18n('PLACER SUR LA CARTE'))}</span><h2>📍 ${esc(i18n('Lieux à placer'))} <small data-lap-n></small></h2></div>
            <div class="lap-acts">${kiosk() ? '' : `<button type="button" class="button small" data-lap-review>☑ ${esc(i18n('Revoir et placer en lot…'))}</button>`}<button type="button" class="button small secondary" data-lap-settings>⚙️ ${esc(i18n('Réglages'))}</button><button type="button" class="icon-button" data-lap-close aria-label="${esc(i18n('Fermer'))}">×</button></div></header>
            ${ids.length ? `<p class="lap-only">${esc(i18n('Seulement les lieux de cette carte ({n}).', {n: String(ids.length)}))} <button type="button" class="link-button" data-lap-all>${esc(i18n('Voir tous les lieux à placer'))}</button></p>` : ''}
            <div class="lap-bar"></div><div class="lap-chips" role="group" aria-label="${esc(i18n('Filtrer'))}"></div><p class="lap-sum muted" role="status"></p><div class="lap-list"><div class="loading-block">${esc(i18n('Lecture des lieux…'))}</div></div>`;
        document.body.appendChild(dlg);
        D = {dlg, ids, items: [], status: '', q: '', sort: 'events', s: settings(), onMap};
        if (onMap && !document.querySelector('dialog[open]:modal')) dlg.show(); else dlg.showModal();
        dlg.addEventListener('close', () => { if (D?.dlg === dlg) { D = null; pin = null; picking = null; redraw(); } dlg.remove(); });
        dlg.addEventListener('click', onClick);
        const bar = UI()?.listBar?.({key: 'lieux-a-placer', search: {placeholder: i18n('Chercher un lieu…')}, sort: {value: 'events', options: [['events', i18n('Le plus d’événements')], ['az', i18n('De A à Z')], ['far', i18n('Le plus loin du reste')]]},
            onChange: st => { D.q = st.q || ''; D.sort = st.sort || 'events'; paint(); }});
        if (bar) { dlg.querySelector('.lap-bar').appendChild(bar); D.q = bar.state.q || ''; D.sort = bar.state.sort || 'events'; }
        await load();
    }
    function close() { if (D?.dlg?.open) D.dlg.close(); }
    async function load() {
        if (!D) return; const s = D.s;
        try {
            const r = await api('lieux_a_placer', {spelling: s.spelling, lieudit: s.lieudit, several: s.several, ids: D.ids.join(',')});
            if (!D) return; D.items = r.items || []; D.counts = r.counts || {}; paint();
        } catch (e) { if (D) D.dlg.querySelector('.lap-list').innerHTML = `<p class="c2-msg">⚠️ ${esc(e.message || e)}</p>`; }
    }
    const far = (p, s) => p && p.km != null && p.km > s.alert;
    function shown() {
        const q = String(D.q || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        let list = D.items.filter(it => (!D.status || it.status === D.status) && (!q || (window.LCNDA_UI?.listMatch?.text || ((q, ...h) => h.join(' ').toLowerCase().includes(String(q).toLowerCase())))(q, it.name, (it.props || []).map(p => p.label))));
        const by = {events: (a, b) => b.events - a.events, az: (a, b) => a.name.localeCompare(b.name, 'fr'), far: (a, b) => (b.props?.[0]?.km ?? -1) - (a.props?.[0]?.km ?? -1)}[D.sort] || ((a, b) => b.events - a.events);
        return list.sort(by);
    }
    function paint() {
        if (!D) return; const {dlg, s} = D, items = D.items, ro = kiosk();
        dlg.querySelector('[data-lap-n]').textContent = `· ${items.length}`;
        const cnt = st => items.filter(i => i.status === st).length;
        dlg.querySelector('.lap-chips').innerHTML = [['', i18n('Tous'), items.length], ...Object.keys(STATUS).map(k => [k, `${STATUS[k][0]} ${i18n(STATUS[k][1])}`, cnt(k)])].filter(([k, , n]) => !k || n)
            .map(([k, l, n]) => `<button type="button" class="lap-chip${D.status === k ? ' is-on' : ''}" data-lap-st="${k}" aria-pressed="${D.status === k}">${esc(l)} <b>${n}</b></button>`).join('');
        const list = shown(), ev = list.reduce((a, i) => a + i.events, 0);
        dlg.querySelector('.lap-sum').textContent = i18n('{a} · {b} concernés', {a: pl(list.length, 'lieu', 'lieux'), b: pl(ev, 'événement')});
        // les lieux qui vont à la même commune : « 🧩 Placer les N ensemble »
        const groups = new Map(); items.forEach(i => { if (i.group) groups.set(i.group, [...(groups.get(i.group) || []), i]); });
        const box = dlg.querySelector('.lap-list');
        if (!list.length) { box.innerHTML = A()?.empty ? A().empty(items.length ? i18n('Aucun lieu pour ce choix.') : i18n('Tous les lieux de ta base ont une position.'), {icon: '📍'}) : `<p>${esc(i18n('Tous les lieux de ta base ont une position.'))}</p>`; return; }
        box.innerHTML = list.slice(0, 300).map(it => {
            const p0 = it.props?.[0], g = it.group ? groups.get(it.group) : null, years = it.years?.[0] ? ` (${it.years[0]}${it.years[1] && it.years[1] !== it.years[0] ? '–' + it.years[1] : ''})` : '';
            const sub = [it.county, it.country].filter(Boolean).join(', ');
            const props = (it.props || []).map((p, j) => `<button type="button" class="button small ${j === 0 && ['sure', 'probable', 'old', 'abroad'].includes(it.status) ? '' : 'secondary'}${far(p, s) ? ' is-far' : ''}" data-lap-put="${it.id}:${j}" title="${esc(p.label)}${p.km != null ? ' · ' + esc(i18n('à {km} km du reste', {km: String(p.km)})) : ''}">${j === 0 && ['sure', 'probable', 'old', 'abroad'].includes(it.status) ? '✓ ' + esc(i18n('Placer ici')) + ' · ' : ''}${esc(p.label)}${p.approx ? ' ≈' : ''}</button>`).join('');
            const warn = p0 && far(p0, s) ? `<p class="lap-far">⚠ ${esc(i18n('À {km} km des autres lieux de ces événements : vérifie avant de placer.', {km: String(p0.km)}))}</p>` : '';
            return `<article class="lap-item" data-lap-id="${it.id}" tabindex="0"><header><b>${esc(it.name)}</b>${sub ? ` <small class="muted">${esc(sub)}</small>` : ''} ${badge(it.status)}<small class="lap-ev">${esc(pl(it.events, 'événement'))}${esc(years)}</small></header>
                <p class="muted lap-why">${esc(whyText(it, s))}</p>${warn}
                ${ro ? '' : `<div class="lap-btns">${props}${g && g.length > 1 && p0 ? `<button type="button" class="button small secondary" data-lap-group="${esc(it.group)}">🧩 ${esc(i18n('Placer les {n} ensemble', {n: String(g.length)}))}</button>` : ''}
                    <button type="button" class="button small secondary" data-lap-choose="${it.id}">${esc(i18n('Choisir…'))}</button><button type="button" class="button small secondary" data-lap-map="${it.id}">📍 ${esc(i18n('Sur la carte'))}</button>
                    ${s.online === 'on' ? `<button type="button" class="button small secondary" data-lap-online="${it.id}">🌐 ${esc(i18n('En ligne…'))}</button>` : ''}<button type="button" class="button small secondary" data-lap-ignore="${it.id}">✕ ${esc(i18n('Pas un lieu'))}</button></div>`}</article>`;
        }).join('') + (list.length > 300 ? `<p class="muted">${esc(i18n('Les 300 premiers ; cherche un nom pour voir les autres.'))}</p>` : '');
    }
    const itemOf = id => D?.items.find(i => i.id === Number(id));

    /* ═════════ Placer (un lieu, un groupe, un lot) — une seule annulation ═════════ */
    async function place(list, msg) {
        if (kiosk()) return A().toast(i18n('Mode consultation : rien ne peut être modifié.'));
        const s = D?.s || settings();
        const items = list.map(({it, p}) => ({id: it.id, lat: p.lat, lon: p.lon, insee: p.insee || '', dept: p.dept || '', approx: !!p.approx}));
        try {
            const r = (await post('lieux_place', {items, what: s.what})).result || {};
            const before = r.before || [];
            A().undoToast(msg || '✓ ' + i18n('{a} placés ({b}) · ils apparaissent sur toutes les cartes', {a: pl(r.n || items.length, 'lieu', 'lieux'), b: pl(r.events || 0, 'événement')}), {
                undo: async () => { await post('lieux_undo', {items: before}); await after(); },
                redo: async () => { await post('lieux_place', {items, what: s.what}); await after(); }});
            await after();
        } catch (e) { A().toast(e.message || String(e), 'error'); }
    }
    async function after() { if (D) await load(); if (A()?.state?.module === 'carte') { A().state.mapKeepCenter = true; try { A().drawMap?.(); } catch (_) {} } }
    function show(it, p) { if (!p) return; pin = {lat: p.lat, lon: p.lon, label: p.label}; if (A()?.state?.module === 'carte') { const st = A().state; st.mapCenter = {lat: p.lat, lon: p.lon}; st.mapZoom = Math.max(Number(st.mapZoom) || 0, 11); try { A().drawMap(); } catch (_) {} } }

    async function onClick(e) {
        const t = e.target.closest('button,[data-lap-id]'); if (!t || !D) return;
        const ds = t.dataset;
        if (ds.lapClose !== undefined) return close();
        if (ds.lapAll !== undefined) { D.ids = []; t.closest('.lap-only')?.remove(); return load(); }
        if (ds.lapSt !== undefined) { D.status = ds.lapSt; return paint(); }
        if (ds.lapSettings !== undefined) return openSettings();
        if (ds.lapReview !== undefined) return review();
        if (ds.lapPut) { const [id, j] = ds.lapPut.split(':').map(Number), it = itemOf(id), p = it?.props?.[j]; if (!p) return; show(it, p);
            if (far(p, D.s) && !(await confirmFar(it, p))) return;
            return place([{it, p}], '✓ ' + i18n('{name} placé ({n}) · {where}', {name: it.name, n: pl(it.events, 'événement'), where: p.label})); }
        if (ds.lapGroup) { const g = D.items.filter(i => i.group === ds.lapGroup && i.props?.[0]); return place(g.map(it => ({it, p: it.props[0]})), '✓ ' + i18n('{name} placé ({a}, {b})', {name: g[0].props[0].label, a: pl(g.length, 'lieu', 'lieux'), b: pl(g.reduce((x, i) => x + i.events, 0), 'événement')})); }
        if (ds.lapChoose) { const it = itemOf(ds.lapChoose); if (!it) return;
            const c = await (window.LCNDA_PICKER || A()).openPicker?.({kind: 'place', title: i18n('La bonne commune pour « {name} »', {name: it.name}), eyebrow: 'PLACER SUR LA CARTE', label: 'Choisis la commune : ses coordonnées seront reprises'});
            if (!c) return; if (c.lat == null || c.lon == null) return A().toast(i18n('Ce lieu n’a pas de coordonnées : choisis une commune de la liste.'), 'error');
            return place([{it, p: {lat: Number(c.lat), lon: Number(c.lon), label: c.title || c.name || ''}}], '✓ ' + i18n('{name} placé ({n}) · {where}', {name: it.name, n: pl(it.events, 'événement'), where: c.title || c.name || ''})); }
        if (ds.lapMap) return pickOnMap(itemOf(ds.lapMap));
        if (ds.lapOnline) return online(itemOf(ds.lapOnline));
        if (ds.lapIgnore) { const it = itemOf(ds.lapIgnore); if (!it) return;
            try { await post('fix_place', {id: it.id, ignore: 1}); A().undoToast(i18n('« {name} » mis de côté (pas un lieu)', {name: it.name}), {undo: async () => { await post('controle_undismiss', {key: 'place:' + it.id}); await load(); }, undoneText: i18n('« {name} » remis dans la liste', {name: it.name})}); await load(); } catch (err) { A().toast(err.message, 'error'); }
            return; }
        if (ds.lapId && !e.target.closest('button')) { const it = itemOf(ds.lapId); show(it, it?.props?.[0]); }
    }
    function confirmFar(it, p) {
        return new Promise(ok => { const box = ext.openDialog?.({eyebrow: i18n('LOIN DU RESTE'), title: i18n('Placer « {name} » si loin ?', {name: it.name}), body: `<p>${esc(i18n('« {where} » est à {km} km des autres lieux de ces événements. C’est souvent un homonyme.', {where: p.label, km: String(p.km)}))}</p>`, submitLabel: i18n('Placer quand même'), onSubmit: () => { ok(true); return true; }});
            if (!box) return ok(window.confirm(i18n('Placer quand même'))); box.addEventListener?.('close', () => ok(false), {once: true}); });
    }

    /* ═════════ 📍 Sur la carte : un clic pose le point (« position approchée ») ═════════ */
    function pickOnMap(it) {
        if (!it) return;
        picking = it;
        if (A()?.state?.module !== 'carte') { A().setModule('carte'); setTimeout(() => open({ids: [it.id]}).then(() => { picking = it; hint(); }), 400); return; }
        hint();
    }
    function hint() { if (!picking) return; A().toast(i18n('Clique sur la carte à l’endroit de « {name} » (Échap pour laisser).', {name: picking.name})); document.getElementById('map-stage')?.classList.add('is-lap-pick'); }
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && picking) { picking = null; document.getElementById('map-stage')?.classList.remove('is-lap-pick'); } });
    document.addEventListener('click', e => {
        const op = e.target.closest?.('[data-lap-open]'); if (op) { e.preventDefault(); return open({ids: String(op.dataset.lapOpen || '').split(',').map(Number).filter(Boolean)}); }
        if (!picking) return; const st = e.target.closest?.('#map-stage'); if (!st || e.target.closest('button,a,input,.lap-dlg')) return;
        const l = last; if (!l || !A()?.xToLng) return;
        const r = st.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        const lon = A().xToLng(l.left + x, l.z), lat = A().yToLat(l.top + y, l.z), it = picking; picking = null; st.classList.remove('is-lap-pick');
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        pin = {lat, lon, label: it.name};
        place([{it, p: {lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, approx: true, label: it.name}}], '✓ ' + i18n('{name} placé à la main (position approchée)', {name: it.name}));
    }, true);

    /* ═════════ 🌐 En ligne : rien ne part sans ce message, et seul le nom du lieu ═════════ */
    async function online(it) {
        if (!it || kiosk()) return;
        let skip = false; try { skip = sessionStorage.getItem('lcnda-lap-online-ok') === '1'; } catch (_) {}
        const go = async () => {
            try { const r = (await post('lieux_online', {q: it.name})).result || {};
                if (!r.ok) return A().toast(i18n('Pas de réseau : rien n’a été envoyé.'), 'error');
                if (!r.props?.length) return A().toast(i18n('Le service en ligne n’a rien trouvé pour « {name} ».', {name: it.name}));
                it.props = [...(it.props || []), ...r.props.map(p => ({...p, km: it.rest ? Math.round(km(it.rest, [p.lat, p.lon])) : null}))]; paint();
                A().toast(i18n('{n} de plus pour « {name} » : à toi de choisir.', {n: pl(r.props.length, 'proposition'), name: it.name}));
            } catch (e) { A().toast(e.message || String(e), 'error'); } };
        if (skip) return go();
        ext.openDialog?.({eyebrow: i18n('EN LIGNE'), title: '🌐 ' + i18n('Chercher « {name} » en ligne ?', {name: it.name}),
            body: `<p>${esc(i18n('Seul le nom du lieu « {name} » est envoyé au service de recherche d’adresses de l’IGN (Géoplateforme). Aucun nom de personne, aucune date.', {name: it.name}))}</p><p class="muted">${esc(i18n('La réponse est une proposition de plus dans la liste ; tu la choisis ou non. Sans internet : « Pas de réseau : rien n’a été envoyé ».'))}</p>
                <label class="checkbox-line"><input type="checkbox" data-lap-sess> ${esc(i18n('Ne plus me demander pour cette séance'))}</label>`,
            submitLabel: '🌐 ' + i18n('Chercher'), onSubmit: f => { if (f?.querySelector?.('[data-lap-sess]')?.checked || document.querySelector('[data-lap-sess]')?.checked) { try { sessionStorage.setItem('lcnda-lap-online-ok', '1'); } catch (_) {} } go(); return true; }});
    }
    const km = (a, b) => { const R = 6371, d1 = (b[0] - a[0]) * Math.PI / 180, d2 = (b[1] - a[1]) * Math.PI / 180; const x = Math.sin(d1 / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(d2 / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); };

    /* ═════════ ☑ Revoir et placer en lot ═════════ */
    function review() {
        if (!D || kiosk()) return; const s = D.s;
        const cand = D.items.filter(i => i.props?.[0]);
        const checked = it => { const p = it.props[0]; if (far(p, s) || s.check === 'none') return false; return s.check === 'probable' ? ['sure', 'probable', 'old', 'abroad'].includes(it.status) : it.status === 'sure'; };
        const WHYS = {sure: 'sûr', probable: 'probable', several: 'le plus proche', old: 'ancienne commune', abroad: 'hors de France'};
        const body = `<div class="lap-review"><div class="lap-scroll"><table class="lap-tab"><thead><tr><th></th><th>${esc(i18n('Lieu tapé'))}</th><th>${esc(i18n('Placé à'))}</th><th>${esc(i18n('Pourquoi'))}</th><th class="num">${esc(i18n('Distance au reste'))}</th><th class="num">${esc(i18n('Év.'))}</th></tr></thead><tbody>
            ${cand.map((it, k) => { const p = it.props[0]; return `<tr class="${far(p, s) ? 'is-far' : ''}"><td><input type="checkbox" data-lap-ck="${k}" ${checked(it) ? 'checked' : ''} aria-label="${esc(it.name)}"></td><td>${esc(it.name)}</td><td>${esc(p.label)}${p.approx ? ' ≈' : ''}</td><td>${badge(it.status)} <small>${esc(i18n(WHYS[it.status] || ''))}</small></td><td class="num">${p.km == null ? '—' : esc(i18n('{n} km', {n: String(p.km)}))}</td><td class="num">${it.events}</td></tr>`; }).join('')}
            </tbody></table></div><p class="muted">${esc(i18n('Les « rien trouvé » ne sont pas dans la revue. Un lieu à plus de {km} km du reste n’est jamais coché tout seul.', {km: String(s.alert)}))}</p>
            <div class="lap-rv-acts"><button type="button" class="button small secondary" data-lap-rv="all">${esc(i18n('Tout cocher'))}</button><button type="button" class="button small secondary" data-lap-rv="sure">${esc(i18n('Seulement les sûrs'))}</button><button type="button" class="button small secondary" data-lap-rv="none">${esc(i18n('Rien'))}</button></div></div>`;
        const dlg = ext.openDialog?.({eyebrow: i18n('PLACER SUR LA CARTE'), title: i18n('Revoir avant de placer'), body, submitLabel: i18n('Placer les cochés'),
            onSubmit: () => { const picked = [...document.querySelectorAll('[data-lap-ck]:checked')].map(c => cand[Number(c.dataset.lapCk)]).filter(Boolean); if (!picked.length) { A().toast(i18n('Coche au moins un lieu.')); return false; } place(picked.map(it => ({it, p: it.props[0]}))); return true; }});
        const root = dlg?.querySelector ? dlg : document.querySelector('dialog[open] .lap-review')?.closest('dialog');
        const sync = () => { const n = root?.querySelectorAll('[data-lap-ck]:checked').length || 0, b = root?.querySelector('button[type=submit], [data-submit], .dialog-actions .button:not(.secondary)'); if (b) b.textContent = i18n('Placer les {n} cochés', {n: String(n)}); };
        root?.addEventListener('change', sync);
        root?.addEventListener('click', e => { const b = e.target.closest('[data-lap-rv]'); if (!b) return; root.querySelectorAll('[data-lap-ck]').forEach(c => { const it = cand[Number(c.dataset.lapCk)]; c.checked = b.dataset.lapRv === 'all' ? true : b.dataset.lapRv === 'sure' ? it.status === 'sure' && !far(it.props[0], s) : false; }); sync(); });
        sync();
    }

    /* ═════════ ⚙️ Réglages ═════════ */
    function openSettings() {
        const s = settings();
        const body = `<div class="lap-set">${Object.entries(CHOICES).map(([k, [label, list]]) => `<fieldset><legend>${esc(i18n(label))}</legend>${list.map(([v, l], i) => `<label class="checkbox-line"><input type="radio" name="lap_${k}" value="${esc(v)}" ${String(s[k]) === String(v) ? 'checked' : ''}> ${esc(i18n(l))}${i === 0 ? ` <span class="lap-rec">${esc(i18n('conseillé'))}</span>` : ''}</label>`).join('')}</fieldset>`).join('')}</div>`;
        ext.openDialog?.({eyebrow: i18n('PLACER SUR LA CARTE'), title: i18n('Réglages'), body, submitLabel: i18n('Enregistrer'), onSubmit: f => {
            const root = f?.querySelector?.('.lap-set') || document.querySelector('dialog[open] .lap-set'); if (!root) return true;
            const prev = settings(), next = {...prev};
            for (const k of Object.keys(CHOICES)) { const v = root.querySelector(`input[name="lap_${k}"]:checked`)?.value; if (v != null) next[k] = k === 'alert' ? Number(v) : v; }
            saveSettings(next); if (D) { D.s = next; load(); }
            A().undoToast(i18n('Réglages des lieux à placer enregistrés'), {undo: async () => { saveSettings(prev); if (D) { D.s = prev; await load(); } }, redo: async () => { saveSettings(next); if (D) { D.s = next; await load(); } }});
            return true; }});
    }

    /* ═════════ Dans la Carte : le bouton, et le lieu choisi montré ═════════ */
    let last = null;
    ext.mapSetup.push(() => {
        const strip = document.querySelector('.map-layout .tool-strip'); if (!strip || strip.querySelector('[data-lap-open]')) return;
        const b = document.createElement('button'); b.type = 'button'; b.className = 'button small secondary'; b.dataset.lapOpen = ''; b.textContent = '📍 ' + i18n('Lieux à placer');
        b.title = i18n('Les lieux sans position, regroupés par commune probable : les placer en un clic');
        strip.insertBefore(b, strip.querySelector('.spacer'));
    });
    function redraw() {
        const st = document.getElementById('map-stage'); let svg = document.getElementById('lap-pin');
        if (!pin || !last || !st || !A()?.lngToX) { svg?.remove(); return; }
        if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'lap-pin'; svg.setAttribute('class', 'lap-pin'); st.appendChild(svg); }
        const x = A().lngToX(pin.lon, last.z) - last.left, y = A().latToY(pin.lat, last.z) - last.top;
        svg.setAttribute('viewBox', `0 0 ${last.width} ${last.height}`);
        svg.innerHTML = `<g transform="translate(${Math.round(x)},${Math.round(y)})"><circle r="14" fill="#055dff" fill-opacity=".18" stroke="#055dff" stroke-width="2"/><circle r="4" fill="#055dff"/><text y="-20" text-anchor="middle" font-size="13" font-weight="700" fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(pin.label)}</text></g>`;
    }
    ext.mapDraw.push(({left, top, z, width, height}) => { last = {left, top, z, width, height}; redraw(); });

    ext.lieuxAPlacer = {open, close, settings, DEF, CHOICES, get state() { return D; }};
})();
