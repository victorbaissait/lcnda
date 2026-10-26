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
        ['tr_aton', '🎂 À ton âge…', '6', 'Ce que faisaient tes ancêtres à ton âge (ou à l’âge d’une personne choisie) : un ancêtre par jour.'],
        ['tr_coinc', '🎯 La coïncidence du jour', '4', 'Un hasard de l’arbre : nés le même jour, mort le jour de son anniversaire…'],
        ['tr_mystery', '🕵️ L’ancêtre mystère du jour', '4', 'Trois indices pour deviner l’ancêtre du jour ; la réponse d’hier.'],
        ['tr_candles', '🕯️ Bougies allumées', '4', 'Les bougies qui brûlent cette semaine, avec le mot laissé.'],
        ['tr_letter', '✉️ Prochaine lettre à ouvrir', '4', 'La prochaine lettre scellée et le temps qu’il reste avant de l’ouvrir.'],
        ['tr_word', '📜 Le vieux mot du jour', '4', 'Un mot des actes anciens et ce qu’il veut dire.'],
        ['tr_money', '💰 Le prix d’autrefois', '4', 'Ce que valait l’argent d’une année : en euros d’aujourd’hui, en kilos de pain.'],
        ['tr_gaps', '🏛️ Actes manquants', '6', 'Combien d’actes manquent à la lignée, et les premiers à chercher.'],
        ['tr_world', '🌍 Le tour du monde des ancêtres', '4', 'Les kilomètres parcourus par la famille, de lieu en lieu.'],
        ['tr_stamps', '📍 Passeport des lieux', '4', 'Les lieux de l’arbre visités, et le prochain à voir.'],
        ['tr_wallpaper', '🖥️ L’ancêtre du jour', '4', 'L’ancêtre du fond d’écran du jour, et pourquoi lui aujourd’hui.'],
        ['tr_grow', '🌳 L’arbre qui pousse', '4', 'La descendance du plus ancien ancêtre, génération par génération.'],
        ['tr_ambiance', '🔊 L’ambiance d’époque', '4', 'Un bouton pour écouter la veillée, le village, la forge… (sons fabriqués, libres de droits).'],
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

    /* ═════════ Les autres widgets des Trésors ═════════ */
    const todayIso = () => new Date().toISOString().slice(0, 10);
    const dayN = () => Math.floor(Date.now() / 864e5);
    const card = (index, w, dflt, body, span, actions = '') => A().card(index, titleOf(w, dflt), '', body, span, actions);
    const open = (key, label = 'Ouvrir') => `<button type="button" class="button small secondary" data-trw-open="${esc(key)}">${esc(label)}</button>`;
    document.addEventListener('click', e => { const b = e.target.closest('[data-trw-open]'); if (b) { e.preventDefault(); ext.tresors?.open(b.dataset.trwOpen); } });
    const W = (key, dflt, render, extra = {}) => { ext.dashboard[key] = {load: extra.load || load, render: (index, w, span, D) => { try { if (!D || !T()) return card(index, w, dflt, off('Les Trésors n’ont pas pu se charger.'), span); return render(index, w, span, D); } catch (err) { console.warn(err); return card(index, w, dflt, off('Ce widget n’a pas pu se dessiner.'), span); } }}; };
    const personCfg = (label, extraHtml = '') => ({
        html: w => { const c = w?.config || {}; return `<fieldset class="h-trw-cfg"><legend>${esc(label)}</legend><div data-trw-person><span class="pk-lab">La personne <small>(vide = la personne de départ)</small></span>${P()?.pickerField?.({name: 'trw_person', hiddenName: false, kind: 'person', animals: false, value: Number(c.person) || null}) || ''}<input type="hidden" data-trw="person" value="${Number(c.person) || ''}"></div>${extraHtml}</fieldset>`; },
        read: ed => ({person: Number(ed.querySelector('[data-trw=person]')?.value) || 0})});
    const who = (tr, c) => tr.byId.get(Number(c?.person)) || T().start(tr);

    /* 🎂 À ton âge */
    W('tr_aton', '🎂 À ton âge…', (index, w, span, tr) => {
        const me = who(tr, w.config), ref = Number(w.config?.age) || (me?.by ? new Date().getFullYear() - me.by - (me.dy ? 0 : 0) : 0);
        if (!me || !ref) return card(index, w, '🎂 À ton âge…', off('Il faut l’année de naissance de la personne choisie.'), span);
        const anc = T().ancestors(tr, me.id, 12).map(a => tr.byId.get(a.id)).filter(p => p?.by && (!p.dy || p.dy - p.by >= ref));
        const facts = ext.tresorKin?.factsAt; if (!anc.length || !facts) return card(index, w, '🎂 À ton âge…', off('Pas encore d’ancêtres datés à comparer.'), span);
        const start = dayN() % anc.length; let p = null, list = [];
        for (let k = 0; k < anc.length && !list.length; k++) { p = anc[(start + k) % anc.length]; list = facts(T(), tr, p, ref).filter(x => !/^vivait sans doute|^n’était plus là/.test(x)); }
        if (!list.length) { p = anc[start]; list = facts(T(), tr, p, ref); }
        return card(index, w, '🎂 À ton âge…', `<p class="h-trw-big">À <b>${ref} ans</b>${me.id !== p.id ? `, comme ${esc(me.first || T().name(me))}` : ''}…</p><p><button type="button" class="table-link" data-h-person="${p.id}">${esc(T().name(p))}</button> ${esc(list.slice(0, 2).join(' ; '))}.</p>`, span, open('aton-age', 'D’autres ancêtres'));
    });
    ext.dashboardConfig.tr_aton = {html: w => personCfg('À ton âge').html(w) + `<label>Ou un âge précis<input type="number" data-trw="age" min="1" max="110" value="${esc(w?.config?.age || '')}" data-unit="ans" style="width:6em"></label>`, read: ed => ({...personCfg('').read(ed), age: Number(ed.querySelector('[data-trw=age]')?.value) || 0})};

    /* 🎯 La coïncidence du jour */
    W('tr_coinc', '🎯 La coïncidence du jour', (index, w, span, tr) => {
        const all = ext.tresorCoinc?.coincidences ? ext.tresorCoinc.coincidences(T(), tr) : [];
        if (!all.length) return card(index, w, '🎯 La coïncidence du jour', off('Pas encore de coïncidence : il faut des dates complètes.'), span);
        const c = all[dayN() % all.length];
        return card(index, w, '🎯 La coïncidence du jour', `<p class="h-trw-big">${esc(c.ic || '🎯')}</p><p>${esc(String(c.text || '').replace(/<[^>]+>/g, ''))}</p><p class="muted">${all.length} coïncidence${all.length > 1 ? 's' : ''} dans l’arbre</p>`, span, open('coincidences', 'Toutes'));
    });

    /* 🕵️ L'ancêtre mystère du jour */
    W('tr_mystery', '🕵️ L’ancêtre mystère du jour', (index, w, span, tr) => {
        const M = ext.tresorMystery; if (!M) return card(index, w, '🕵️ L’ancêtre mystère du jour', off('Le jeu n’est pas là.'), span);
        const p = M.mysteryOf(T(), tr, todayIso()); if (!p) return card(index, w, '🕵️ L’ancêtre mystère du jour', off('Il faut des ancêtres avec un prénom et une date.'), span);
        const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10), py = M.mysteryOf(T(), tr, y), cl = M.clues(T(), tr, p).slice(0, 3);
        return card(index, w, '🕵️ L’ancêtre mystère du jour', `<ol class="h-trw-clues">${cl.map(x => `<li>${esc(x)}</li>`).join('')}</ol>${py && py.id !== p.id ? `<details><summary>La réponse d’hier</summary><button type="button" class="table-link" data-h-person="${py.id}">${esc(T().name(py))}</button></details>` : ''}`, span, open('mystere', 'Deviner'));
    });

    /* 🕯️ Bougies allumées */
    W('tr_candles', '🕯️ Bougies allumées', (index, w, span, D) => {
        const {tr, list} = D, days = ext.tresorCandle?.LIT_DAYS || 7, lit = list.filter(c => (Date.now() - new Date(String(c.created_at).replace(' ', 'T') + 'Z').getTime()) / 864e5 < days);
        return card(index, w, '🕯️ Bougies allumées', lit.length ? `<ul class="h-trw-list">${lit.slice(0, 6).map(c => { const p = tr.byId.get(c.person_id); return `<li>🕯️ ${p ? `<button type="button" class="table-link" data-h-person="${p.id}">${esc(T().name(p))}</button>` : esc(c.title)}${c.body ? ` <small class="muted">« ${esc(c.body)} »</small>` : ''}</li>`; }).join('')}</ul>`
            : A().empty('Aucune bougie allumée cette semaine.', {icon: '🕯️'}), span, open('bougie', '🕯️ Allumer'));
    }, {load: async () => { try { const [tr, list] = await Promise.all([T().tree(), T().items('candle')]); return {tr, list}; } catch (_) { return null; } }});

    /* ✉️ Prochaine lettre à ouvrir */
    W('tr_letter', '✉️ Prochaine lettre à ouvrir', (index, w, span, list) => {
        const next = list.filter(x => x.sealed && x.open_at).sort((a, b) => a.open_at.localeCompare(b.open_at))[0];
        if (!next) return card(index, w, '✉️ Prochaine lettre à ouvrir', A().empty('Aucune lettre scellée.', {icon: '✉️'}), span, open('lettres', '✉️ Écrire une lettre'));
        const [y, m, d] = next.open_at.split('-').map(Number), now = new Date(), to = new Date(y, m - 1, d); let yy = to.getFullYear() - now.getFullYear(), mm = to.getMonth() - now.getMonth(); if (to.getDate() < now.getDate()) mm--; if (mm < 0) { yy--; mm += 12; }
        const left = yy > 0 ? `${yy} an${yy > 1 ? 's' : ''}${mm ? ` et ${mm} mois` : ''}` : mm > 0 ? `${mm} mois` : `${Math.max(0, Math.ceil((to - now) / 864e5))} jour${Math.ceil((to - now) / 864e5) > 1 ? 's' : ''}`;
        return card(index, w, '✉️ Prochaine lettre à ouvrir', `<p class="h-trw-big">🔒 Dans ${esc(left)}</p><p><b>${esc(next.title)}</b>${next.data?.to ? ` · pour ${esc(next.data.to)}` : ''}<br><small class="muted">s’ouvrira le ${esc(T().dateFr(next.open_at))}</small></p>`, span, open('lettres', 'Les lettres'));
    }, {load: async () => { try { return await T().items('letter'); } catch (_) { return null; } }});

    /* 📜 Le vieux mot du jour */
    W('tr_word', '📜 Le vieux mot du jour', (index, w, span) => {
        const WD = ext.tresorWords?.WORDS || []; if (!WD.length) return card(index, w, '📜 Le vieux mot du jour', off('Le dictionnaire n’est pas là.'), span);
        const [mot, sens] = WD[dayN() % WD.length];
        return card(index, w, '📜 Le vieux mot du jour', `<p class="h-trw-big h-trw-serif">${esc(mot)}</p><p>${esc(sens)}</p>`, span, open('vieux-mots', 'Tous les mots'));
    }, {load: async () => true});

    /* 💰 Le prix d'autrefois */
    W('tr_money', '💰 Le prix d’autrefois', (index, w, span, tr) => {
        const M = ext.tresorMoney; if (!M) return card(index, w, '💰 Le prix d’autrefois', off('Le calcul n’est pas là.'), span);
        const ys = [...new Set(tr.events.map(e => e.y).filter(y => y >= 1700 && y <= 2000))].sort((a, b) => a - b), c = w.config || {};
        const Y = Number(c.year) || (ys.length ? ys[dayN() % ys.length] : 1900), v = M.worth(1, '', Y), unit = Y < 1795 ? 'livre' : Y < 2002 ? 'franc' : 'euro';
        const kg = v.bread ? (v.bread >= 10 ? Math.round(v.bread) : Math.round(v.bread * 10) / 10) : null;
        return card(index, w, '💰 Le prix d’autrefois', `<p class="h-trw-big">1 ${unit} en ${Y}</p><p>≈ <b>${v.euros >= 10 ? Math.round(v.euros) : (Math.round(v.euros * 100) / 100).toString().replace('.', ',')} €</b> d’aujourd’hui${kg ? `<br>≈ <b>${String(kg).replace('.', ',')} kg</b> de pain` : ''}${v.days ? `<br>≈ ${(Math.round(v.days * 10) / 10).toString().replace('.', ',')} jour${v.days >= 2 ? 's' : ''} de travail d’un journalier` : ''}</p>`, span, open('pouvoir-achat', 'Calculer'));
    });
    ext.dashboardConfig.tr_money = {html: w => `<fieldset class="h-trw-cfg"><legend>Le prix d’autrefois</legend><label>L’année <small>(vide = une année de l’arbre, chaque jour)</small><input type="number" data-trw="year" min="1700" max="2001" value="${esc(w?.config?.year || '')}" style="width:7em"></label></fieldset>`, read: ed => ({year: Number(ed.querySelector('[data-trw=year]')?.value) || ''})};

    /* 🏛️ Actes manquants */
    W('tr_gaps', '🏛️ Actes manquants', (index, w, span, d) => {
        const items = d.items || [], KIND = {birth: 'naissance', marriage: 'mariage', death: 'décès'};
        if (!d.root_id) return card(index, w, '🏛️ Actes manquants', off('Choisis d’abord une personne de départ.'), span);
        return card(index, w, '🏛️ Actes manquants', items.length ? `<p class="h-trw-big">${d.total} à chercher</p><ul class="h-trw-list">${items.slice(0, 3).map(it => `<li>${esc(KIND[it.kind] || it.what || '')} de <button type="button" class="table-link" data-h-person="${Number(it.person_id)}">${esc(it.name || '')}</button>${it.place ? ` <small class="muted">${esc(it.place)}</small>` : ''}</li>`).join('')}</ul>`
            : A().empty('Rien ne manque sur 5 générations.', {icon: '🏛️'}), span, '<button type="button" class="button small secondary" data-trw-gaps>Voir tout</button>');
    }, {load: async () => { try { return await A().api('research_gaps', {gen: 5}); } catch (_) { return null; } }});
    document.addEventListener('click', e => { if (e.target.closest('[data-trw-gaps]')) { e.preventDefault(); A().state.listType = 'tr_gaps'; A().setModule('listes'); } });

    /* 🌍 Le tour du monde */
    W('tr_world', '🌍 Le tour du monde des ancêtres', (index, w, span, tr) => {
        const s = ext.tresorWorld?.travelStats?.(T(), tr); if (!s?.per.length) return card(index, w, '🌍 Le tour du monde des ancêtres', off('Il faut des lieux placés sur la carte et datés.'), span);
        const km = n => `${Math.round(n).toLocaleString('fr-FR')} km`, tour = s.total / 40075;
        return card(index, w, '🌍 Le tour du monde des ancêtres', `<p class="h-trw-big">${km(s.total)}</p><p>${tour >= 1 ? `${tour.toFixed(1).replace('.', ',')} fois le tour de la Terre` : `${Math.round(tour * 100)} % du tour de la Terre`}${s.far ? `<br><small class="muted">le plus loin : ${esc(T().name(s.far.p))}, ${km(s.far.km)}</small>` : ''}</p>`, span, open('tour-du-monde', 'Le détail'));
    });

    /* 📍 Passeport des lieux */
    W('tr_stamps', '📍 Passeport des lieux', (index, w, span, D) => {
        const pls = ext.tresorStamps?.treePlaces?.(T(), D.tr) || [], v = new Set(D.list.map(x => x.place_id)), n = pls.filter(p => v.has(p.id)).length;
        if (!pls.length) return card(index, w, '📍 Passeport des lieux', off('Aucun lieu dans l’arbre.'), span);
        const next = pls.filter(p => !v.has(p.id)).sort((a, b) => (b.people?.size || 0) - (a.people?.size || 0))[0];
        return card(index, w, '📍 Passeport des lieux', `<p class="h-trw-big">${n} / ${pls.length}</p><div class="h-tr-bar"><i style="width:${Math.round(n / pls.length * 100)}%"></i></div>${next ? `<p><small class="muted">Prochain à voir :</small> <b>${esc(next.name)}</b></p>` : '<p>🎉 Tous les lieux sont visités !</p>'}`, span, open('passeport-lieux', 'Le carnet'));
    }, {load: async () => { try { const [tr, list] = await Promise.all([T().tree(), T().items('stamp')]); return {tr, list}; } catch (_) { return null; } }});

    /* 🖥️ L'ancêtre du jour (celui du fond d'écran) */
    W('tr_wallpaper', '🖥️ L’ancêtre du jour', (index, w, span, tr) => {
        const a = ext.tresorWallpaper?.ancestorOfDay?.(T(), tr, todayIso()); if (!a) return card(index, w, '🖥️ L’ancêtre du jour', off('Il faut des ancêtres datés.'), span);
        const img = T().portraitUrl(a.p);
        return card(index, w, '🖥️ L’ancêtre du jour', `<div class="h-trw-day">${img ? `<img src="${esc(img)}" alt="">` : '<span class="h-trw-noimg">👤</span>'}<div><button type="button" class="table-link" data-h-person="${a.p.id}"><b>${esc(T().name(a.p))}</b></button><br><small class="muted">${esc(T().life(a.p))}</small><p>${esc(a.why || '')}</p></div></div>`, span, open('fond-ecran', '🖥️ Le fond d’écran'));
    });

    /* 🌳 L'arbre qui pousse */
    W('tr_grow', '🌳 L’arbre qui pousse', (index, w, span, tr) => {
        const G = ext.tresorGrow, root = G?.oldestRoot?.(T(), tr); if (!root) return card(index, w, '🌳 L’arbre qui pousse', off('Choisis d’abord une personne de départ.'), span);
        const gens = new Map(); T().descendants(tr, [root.id], 12).forEach(d => gens.set(d.gen, (gens.get(d.gen) || 0) + 1)); const max = Math.max(1, ...gens.values());
        return card(index, w, '🌳 L’arbre qui pousse', `<p><small class="muted">Depuis</small> <b>${esc(T().name(root))}</b> <small class="muted">${esc(T().life(root))}</small></p><div class="h-trw-grow">${[...gens].sort((a, b) => a[0] - b[0]).map(([g, n]) => `<div title="Génération ${g} : ${n}"><i style="height:${Math.max(6, Math.round(n / max * 60))}px"></i><small>${n}</small></div>`).join('')}</div>`, span, open('arbre-pousse', '▶ Voir pousser'));
    });

    /* 🔊 L'ambiance d'époque */
    let amb = null;
    W('tr_ambiance', '🔊 L’ambiance d’époque', (index, w, span) => {
        const AM = ext.tresorAmbiance; if (!AM) return card(index, w, '🔊 L’ambiance d’époque', off('L’ambiance n’est pas là.'), span);
        const k = AM.SCENES[w.config?.scene] ? w.config.scene : 'veillee';
        return card(index, w, '🔊 L’ambiance d’époque', `<div class="h-trw-amb"><select data-trw-scene aria-label="L’ambiance">${Object.entries(AM.SCENES).map(([v, [l]]) => `<option value="${v}" ${v === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select><button type="button" class="button small" data-trw-play>▶ Écouter</button><button type="button" class="button small secondary" data-trw-stop>⏹</button></div><p class="muted"><small>Sons fabriqués par l’ordinateur, libres de droits.</small></p>`, span, open('ambiance', 'Régler les couches'));
    }, {load: async () => true});
    ext.dashboardConfig.tr_ambiance = {html: w => { const AM = ext.tresorAmbiance; return AM ? `<fieldset class="h-trw-cfg"><legend>L’ambiance</legend><label>Au départ<select data-trw="scene">${Object.entries(AM.SCENES).map(([v, [l]]) => `<option value="${v}" ${w?.config?.scene === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></fieldset>` : ''; }, read: ed => ({scene: ed.querySelector('[data-trw=scene]')?.value || 'veillee'})};
    document.addEventListener('click', e => {
        const play = e.target.closest('[data-trw-play]'), stop = e.target.closest('[data-trw-stop]'); if (!play && !stop) return; e.preventDefault();
        amb?.stop(); amb = null; if (stop) return;
        const AM = ext.tresorAmbiance, k = play.closest('.h-trw-amb')?.querySelector('[data-trw-scene]')?.value || 'veillee'; if (!AM || !(window.AudioContext || window.webkitAudioContext)) return A().toast?.('Ce navigateur ne sait pas jouer de sons.', 'error');
        amb = AM.playScene({...AM.SCENES[k][1]});
        const watch = () => { if (!play.isConnected) { amb?.stop(); amb = null; } else setTimeout(watch, 1000); }; setTimeout(watch, 1000); // on quitte le tableau de bord : le son s'arrête
    });

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
