/* LCNDA — 🎲 Jeux de la famille : le cœur commun de « 🕵️ Qui est-ce ? », « 🃏 Memory », « 📅 La bonne date » et « ❌ Morpion ».
 * Même page, même colonne de gauche, même allure noir et blanc que le jeu de l'oie, le puzzle et le labyrinthe (app-jeu.js).
 * Chaque jeu est dans son fichier (app-jeu-quiestce.js, app-jeu-memory.js, app-jeu-timeline.js, app-jeu-morpion.js) et s'inscrit ici
 * avec LCNDA_JEUX_FAMILLE.register({key, icon, label, desc, players, scope, defaults, fieldsHtml, bindFields, start, mount}).
 * La logique sans écran est dans app-jeu-famille-logique.js (LCNDA_JEUX_LOGIQUE, testée dans Node).
 * Les parties se gardent dans ce navigateur (localStorage) ; les données de la généalogie sont seulement LUES (GET mode_simple_data).
 * API (window.LCNDA_JEUX_FAMILLE), comme LCNDA_LABY : KEYS, owns(id), renderSetup(ws, ctx, key), render(ws, id, ctx), sidebarHtml(active),
 * bindSidebar(content, ctx, signal), stop(), gameCount(), register(def), debug().
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const L = () => window.LCNDA_JEUX_LOGIQUE;
    const PK = () => window.LCNDA_PICKER || A();
    const esc = v => (A()?.escapeHtml ? A().escapeHtml(v ?? '') : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const toast = (...a) => A()?.toast?.(...a);
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : s);
    const lab = def => i18n(def.label).replace(/^\S+\s/, ''); // le nom du jeu sans son icône, traduit
    const UP = s => s.toLocaleUpperCase(window.LCNDA_I18N?.locale?.() || 'fr-FR');
    // un nom de personne garde les capitales françaises (en turc, « i » deviendrait « İ ») : seul le texte de l’app suit la langue
    const UPN = sc => (sc?.kind === 'branch' && sc?.rootName ? UP(i18n('Les ancêtres de {name}', {name: '\u2063'})).replace('\u2063', String(sc.rootName).toLocaleUpperCase('fr-FR')) : UP(scopeLabel(sc)));
    const plural = (n, w, p) => (A()?.plural ? A().plural(n, w, p) : `${n} ${n > 1 ? (p || w + 's') : w}`);
    // les parties et les derniers réglages restent dans ce navigateur (« lcnda-… » : pas recopiés dans la base, comme le labyrinthe) ;
    // les 💾 réglages enregistrés suivent la base (« genealogie-… » : sauvegarde complète, autre ordinateur)
    const GAMES_KEY = 'lcnda-jeux-famille-v1', PREFS_KEY = 'lcnda-jeux-famille-prefs-v1', PRESETS_KEY = 'genealogie-jeux-famille-presets', MAX_GAMES = 10;
    const COLORS = ['#d93636', '#2878c8', '#198754', '#f2c230', '#7c3aed', '#e87818'];
    const ls = {get: (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { toast(i18n('Plus de place dans ce navigateur pour garder la partie.'), 'error'); return false; } }};
    const DEFS = new Map();
    const games = () => { const v = ls.get(GAMES_KEY, []); return Array.isArray(v) ? v.filter(g => g && typeof g.id === 'string' && DEFS.has(g.kind)).slice(0, MAX_GAMES) : []; };
    const saveGames = list => ls.set(GAMES_KEY, list.slice(0, MAX_GAMES));
    const gameById = id => games().find(g => g.id === id) || null;
    // 🗑 une partie supprimée ne revient pas : la partie encore ouverte (patience, échecs…) s'enregistre parfois une dernière fois
    // en se fermant (minuteur, fin d'animation, nettoyage) ; sans cette liste, cet enregistrement la remettait dans la liste
    const DELETED = new Set();
    const writeGame = g => { if (!g || DELETED.has(g.id)) return true; const l = games(), i = l.findIndex(x => x.id === g.id); g.updated = Date.now(); if (i >= 0) l[i] = g; else l.unshift(g); return saveGames(l); };
    const owns = id => typeof id === 'string' && id.startsWith('fam-') && !!gameById(id);
    const gameCount = () => games().length;
    let stopper = null, setupKey = 'quiz';
    function stop() { if (stopper) { try { stopper(); } catch (_) {} stopper = null; } }

    /* ═════ Les données de la généalogie (une lecture, gardée) ═════ */
    let DATA = null, loading = null;
    function loadData(force = false) {
        if (DATA && !force) return Promise.resolve(DATA);
        if (!loading) loading = A().api('mode_simple_data').then(r => { if (!r || !Array.isArray(r.persons)) throw new Error(r?.error || i18n('Données illisibles.')); DATA = r; return r; }).finally(() => { loading = null; });
        return loading;
    }
    /** les personnes jouables selon l'ensemble choisi (sans les vivants ni les fiches confidentielles) */
    async function peopleFor(cfg) {
        const data = await loadData();
        const sc = cfg.scope || {}, o = {scope: sc.kind || 'all', gen: sc.gen || 3, rootId: Number(sc.root) || 0, sosa: A().sosaMap?.() || {}};
        if (o.scope === 'branch' && !o.rootId) o.scope = 'all';
        return {data, people: L().pool(data, o)};
    }
    const scopeLabel = sc => ({sosa: i18n('Mes ancêtres (Sosa)'), gen: i18n('Génération {n}', {n: sc?.gen || 3}), branch: sc?.rootName ? i18n('Les ancêtres de {name}', {name: sc.rootName}) : i18n('Les ancêtres de la personne choisie'), all: i18n('Toute la généalogie')}[sc?.kind || 'all'] || i18n('Toute la généalogie'));

    /* ═════ Petits morceaux d'écran communs ═════ */
    const avatar = (p, size = 48) => (UI().avatar ? UI().avatar(L().avatarOf(p), size, {noSosa: true}) : `<span class="jf-ini">${esc((p.first || '?').charAt(0) + (p.last || '').charAt(0))}</span>`);
    const seg = (name, list, val, cls = '') => `<div class="segmented jf-seg ${cls}" role="radiogroup">${list.map(([v, t]) => `<button type="button" class="${String(v) === String(val) ? 'is-active' : ''}" aria-pressed="${String(v) === String(val)}" data-jf-seg="${esc(name)}" data-v="${esc(v)}">${t}</button>`).join('')}</div>`;
    const toggle = (attr, on, text) => (UI().toggleHtml ? UI().toggleHtml(text, {checked: on, attrs: attr}) : `<label class="ui-toggle"><input type="checkbox" ${attr} ${on ? 'checked' : ''}><i></i>${esc(text)}</label>`);
    const notice = (kind, text) => (UI().notice ? UI().notice(kind, text) : `<p class="muted">${esc(text)}</p>`);
    /** un curseur C3 posé dans `slot` ; onChange(v) */
    function range(slot, {label, min, max, step = 1, value, unit = '', def}, onChange) {
        if (!slot) return; slot.innerHTML = '';
        if (UI().rangeField) { const f = UI().rangeField({label, min, max, step, value, unit, default: def ?? value}); f.input.addEventListener('input', () => onChange(Number(f.input.value))); slot.appendChild(f); return; }
        slot.innerHTML = `<label>${esc(label)}<input type="number" min="${min}" max="${max}" step="${step}" value="${value}" data-unit="${esc(unit)}"></label>`;
        slot.querySelector('input').addEventListener('input', e => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min))));
    }
    const fmtTime = ms => { const s = Math.floor(ms / 1000); return UI().clock ? UI().clock(s) : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

    /* ═════ La préparation commune ═════ */
    const prefs = key => { const p = ls.get(PREFS_KEY, {}); return p && typeof p === 'object' ? p[key] : null; };
    const savePrefs = (key, cfg) => { const p = ls.get(PREFS_KEY, {}) || {}; p[key] = {...cfg, name: ''}; ls.set(PREFS_KEY, p); };
    function baseCfg(def) {
        const d = def.defaults(), n = Math.max(def.players.min, Math.min(def.players.max, def.players.def || def.players.min));
        return {...d, scope: d.scope || {kind: 'sosa', gen: 3}, players: Array.from({length: n}, (_, i) => ({name: i18n('Joueur {n}', {n: i + 1}), color: COLORS[i], ...(def.playerExtra ? def.playerExtra(i) : {})})), name: '', seed: L().newSeed()};
    }
    function cleanCfg(def, raw) {
        const base = baseCfg(def), c = {...base, ...(raw && typeof raw === 'object' ? raw : {})};
        c.scope = {...base.scope, ...(raw?.scope || {})};
        if (!['sosa', 'gen', 'branch', 'all'].includes(c.scope.kind)) c.scope.kind = 'sosa';
        c.scope.gen = Math.max(1, Math.min(15, Number(c.scope.gen) || 3));
        const pl = Array.isArray(raw?.players) ? raw.players : base.players;
        c.players = pl.slice(0, def.players.max).map((p, i) => ({...base.players[i], ...(def.playerExtra ? def.playerExtra(i) : {}), ...p, name: String(p?.name || i18n('Joueur {n}', {n: i + 1})).slice(0, 30), color: /^#[0-9a-f]{6}$/i.test(p?.color || '') ? p.color : COLORS[i % COLORS.length]}));
        while (c.players.length < def.players.min) c.players.push({name: i18n('Joueur {n}', {n: c.players.length + 1}), color: COLORS[c.players.length % COLORS.length], ...(def.playerExtra ? def.playerExtra(c.players.length) : {})});
        c.seed = String(c.seed || L().newSeed()).replace(/[^\w-]/g, '').slice(0, 24) || L().newSeed();
        return def.clean ? def.clean(c) : c;
    }
    let setup = null;
    function renderSetup(ws, ctx, key) {
        stop();
        if (key && DEFS.has(key)) setupKey = key;
        const def = DEFS.get(setupKey) || [...DEFS.values()][0]; if (!def) return false;
        if (!setup || setup.key !== def.key) setup = {key: def.key, cfg: cleanCfg(def, prefs(def.key))};
        const c = setup.cfg, full = gameCount() >= MAX_GAMES;
        const variants = (ctx.variants || [[def.key, def.label]]).map(([v, l]) => `<option value="${esc(v)}"${v === def.key ? ' selected' : ''}>${esc(l)}</option>`).join('');
        ws.innerHTML = `<section class="goose-page jf-page jf-${def.key}"><header class="goose-head"><span class="eyebrow">${esc(i18n('TABLE DE JEU · {what}', {what: def.eyebrow ? i18n(def.eyebrow) : UP(lab(def))}))}</span><h2>${def.icon} ${esc(def.title ? i18n(def.title) : lab(def))}</h2><p>${esc(i18n(def.desc))} ${esc(i18n('La partie se garde dans ce navigateur.'))}</p></header>
            ${full ? `<div class="jf-msg">${notice('warn', i18n('Les {n} parties de ces jeux sont gardées : supprimes-en une pour en commencer une autre.', {n: MAX_GAMES}))}</div>` : ''}
            <form class="goose-setup jf-setup" id="jf-setup-form" novalidate>
              <div class="jf-cols"><div class="jf-main">
                <div class="goose-setup-grid jf-top"><label>${esc(i18n('Jeu'))}<select name="variant" data-jf-variant>${variants}</select></label><label>${esc(i18n('Nom de la partie'))}<input name="name" value="${esc(c.name)}" placeholder="${esc(i18n(def.namePh || 'Ex : La partie du dimanche'))}" maxlength="80"></label></div>
                ${def.scope ? `<fieldset class="jf-fs"><legend>${esc(i18n('Les personnes du jeu'))}</legend>
                    ${seg('scope', [['sosa', esc(i18n('Mes ancêtres (Sosa)'))], ['gen', esc(i18n('Une génération'))], ['branch', esc(i18n('Les ancêtres d’une personne'))], ['all', esc(i18n('Toute la généalogie'))]], c.scope.kind)}
                    <div data-jf-gen ${c.scope.kind === 'gen' ? '' : 'hidden'}></div>
                    <div data-jf-root ${c.scope.kind === 'branch' ? '' : 'hidden'}><span class="pk-lab">${esc(i18n('Personne de départ'))}</span>${PK()?.pickerField ? PK().pickerField({name: 'root', kind: 'person', value: c.scope.root ? {id: c.scope.root, title: c.scope.rootName || ''} : null}) : ''}</div>
                    <p class="muted jf-small" data-jf-count>${esc(i18n('Les personnes vivantes et les fiches confidentielles ne sont jamais dans les jeux.'))}</p></fieldset>` : ''}
                <fieldset class="jf-fs"><legend>${esc(i18n(def.fieldsTitle || 'Les règles'))}</legend><div class="jf-fields" data-jf-fields>${def.fieldsHtml(c, {seg, toggle, esc, avatar})}</div></fieldset>
                <fieldset class="jf-fs"><legend>${esc(i18n('Les joueurs'))} <small>(${def.players.min === def.players.max ? def.players.min : esc(i18n('{a} à {b}', {a: String(def.players.min), b: String(def.players.max)}))})</small></legend><div class="jf-players" data-jf-players></div>
                    ${def.players.max > def.players.min ? `<button type="button" class="button small secondary" data-jf-padd ${c.players.length >= def.players.max ? 'disabled' : ''}>＋ ${esc(i18n('Ajouter un joueur'))}</button>` : ''}</fieldset>
              </div><aside class="jf-aside">
                <div class="jf-ready">${(def.ready || []).length ? `<strong>✨ ${esc(i18n('Ensembles prêts'))}</strong><div class="jf-ready-list">${def.ready.map(r => `<button type="button" class="jf-ready-b" data-jf-ready="${esc(r.k)}"><b>${esc(i18n(r.name))}</b><small>${esc(i18n(r.hint))}</small></button>`).join('')}</div>` : ''}</div>
                <div data-jf-presets></div>
              </aside></div>
              <div class="jf-err" data-jf-err></div>
              <footer><small class="muted">${esc(def.rulesHint ? i18n(def.rulesHint) : '')}</small><button type="submit" class="button" ${full ? 'disabled' : ''}>▶ ${esc(i18n('Commencer la partie'))}</button></footer>
            </form></section>`;
        bindSetup(ws, ctx, def);
        return true;
    }
    function bindSetup(ws, ctx, def) {
        const form = ws.querySelector('#jf-setup-form'); if (!form) return;
        const ac = new AbortController(); stopper = () => ac.abort(); const sig = {signal: ac.signal};
        const c = setup.cfg, q = s => form.querySelector(s), save = () => savePrefs(def.key, c);
        const drawPlayers = () => {
            const box = q('[data-jf-players]');
            box.innerHTML = c.players.map((p, i) => `<div class="jf-player" data-i="${i}"><span class="jf-dot" style="--pc:${esc(p.color)}" aria-hidden="true"></span><label>${esc(i18n('Joueur {n}', {n: i + 1}))}<input name="pname" value="${esc(p.name)}" maxlength="30"></label><span data-jf-pcolor="${i}"></span>${def.playerFields ? def.playerFields(p, i, {seg, toggle, esc, avatar}) : ''}${c.players.length > def.players.min ? `<button type="button" class="icon-button small" data-jf-pdel="${i}" aria-label="${esc(i18n('Retirer {name}', {name: p.name}))}" title="${esc(i18n('Retirer ce joueur'))}">×</button>` : ''}</div>`).join('');
            const CF = UI().colorField;
            box.querySelectorAll('[data-jf-pcolor]').forEach(slot => { if (!CF) return; const i = Number(slot.dataset.jfPcolor), f = CF({value: c.players[i].color, compact: true}); f.input.dataset.jfPc = i; slot.replaceChildren(f); });
            def.bindPlayers?.(box, c, save);
            const add = q('[data-jf-padd]'); if (add) add.disabled = c.players.length >= def.players.max;
        };
        const scopeView = () => { q('[data-jf-gen]') && (q('[data-jf-gen]').hidden = c.scope.kind !== 'gen'); q('[data-jf-root]') && (q('[data-jf-root]').hidden = c.scope.kind !== 'branch'); countView(); };
        let countT = 0;
        const countView = () => { const el = q('[data-jf-count]'); if (!el || !def.scope) return; clearTimeout(countT); countT = setTimeout(async () => { try { const {people} = await peopleFor(c); if (!el.isConnected) return; const n = def.usable ? def.usable(people, c) : people.length; el.textContent = i18n('{what} pour ce jeu · sans les vivants ni les fiches confidentielles.', {what: plural(n, def.unit || 'personne', def.unitP)}); el.classList.toggle('is-low', n < (def.minPeople || 2)); } catch (_) {} }, 120); };
        if (q('[data-jf-gen]')) range(q('[data-jf-gen]'), {label: i18n('Génération (1 = parents, 2 = grands-parents…)'), min: 1, max: 12, value: c.scope.gen, def: 3}, v => { c.scope.gen = v; save(); countView(); });
        drawPlayers(); scopeView(); def.bindFields?.(form, c, save, {range, countView});
        // 💾 Réglages enregistrés (le cadre commun) : les règles de ce jeu, sans les noms des joueurs
        const slot = q('[data-jf-presets]');
        if (slot && UI().presetsFrame) {
            const all = () => { const v = ls.get(PRESETS_KEY, {}); return v && typeof v === 'object' ? v : {}; };
            const list = () => (Array.isArray(all()[def.key]) ? all()[def.key] : []).filter(x => x && typeof x.name === 'string');
            const put = l => { const v = all(); v[def.key] = l.slice(0, 40); ls.set(PRESETS_KEY, v); };
            const data = () => { const {name, seed, ...rest} = c; return JSON.parse(JSON.stringify(rest)); };
            slot.appendChild(UI().presetsFrame({id: `jeu-${def.key}`, what: i18n('les réglages de ce jeu ({name})', {name: lab(def)}), list, quietApply: true,
                apply: i => { const x = list()[i]; if (!x) return false; setup.cfg = cleanCfg(def, {...x.data, name: c.name}); save(); renderSetup(ws, ctx); toast(i18n('Réglages « {name} » appliqués.', {name: x.name})); return false; },
                save: name => { const l = list(), it = {name, date: new Date().toISOString(), data: data()}, i = l.findIndex(x => x.name === name); if (i >= 0) l[i] = it; else l.push(it); put(l); },
                replace: i => { const l = list(); if (!l[i]) return false; l[i] = {...l[i], date: new Date().toISOString(), data: data()}; put(l); },
                rename: (i, name) => { const l = list(); if (!l[i]) return false; l[i].name = name; put(l); },
                duplicate: i => { const l = list(), x = l[i]; if (!x) return false; l.splice(i + 1, 0, {name: UI().freeName ? UI().freeName(x.name, l.map(y => y.name)) : x.name + ' (2)', date: new Date().toISOString(), data: JSON.parse(JSON.stringify(x.data))}); put(l); },
                exportOne: i => { const x = list()[i]; if (x) A().exportSettingFile?.(`jeu-${def.key}`, x.name, {data: x.data}); return false; },
                remove: i => { const l = list(), x = l[i]; if (!x) return false; l.splice(i, 1); put(l); toast(i18n('Réglage « {name} » supprimé.', {name: x.name})); },
                importOne: async () => { const got = await A().importSettingFile?.(`jeu-${def.key}`, {names: list().map(x => x.name), check: d => d && typeof d.data === 'object' && d.data}); if (!got) return false; const l = list(); l.push({name: got.nom, date: new Date().toISOString(), data: got.donnees.data}); put(l); }}));
        }
        form.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b || !form.contains(b)) return;
            if (b.dataset.jfSeg === 'scope') { e.preventDefault(); c.scope.kind = b.dataset.v; b.parentElement.querySelectorAll('button').forEach(x => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-pressed', String(x === b)); }); save(); scopeView(); return; }
            if (b.dataset.jfSeg) { e.preventDefault(); b.parentElement.querySelectorAll('button').forEach(x => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-pressed', String(x === b)); }); def.onSeg?.(b.dataset.jfSeg, b.dataset.v, c, form); save(); countView(); return; }
            if (b.matches('[data-jf-padd]')) { e.preventDefault(); if (c.players.length >= def.players.max) return; const i = c.players.length; c.players.push({name: i18n('Joueur {n}', {n: i + 1}), color: COLORS.find(x => !c.players.some(p => p.color === x)) || COLORS[i % COLORS.length], ...(def.playerExtra ? def.playerExtra(i) : {})}); save(); drawPlayers(); return; }
            if (b.dataset.jfPdel != null) { e.preventDefault(); c.players.splice(Number(b.dataset.jfPdel), 1); save(); drawPlayers(); return; }
            if (b.dataset.jfReady) { e.preventDefault(); const r = (def.ready || []).find(x => x.k === b.dataset.jfReady); if (!r) return; setup.cfg = cleanCfg(def, {...c, ...r.cfg, players: c.players, name: c.name}); save(); renderSetup(ws, ctx); toast(i18n('« {name} » appliqué.', {name: i18n(r.name)})); }
        }, sig);
        form.addEventListener('input', e => {
            const t = e.target;
            if (t.name === 'pname') { c.players[Number(t.closest('[data-i]').dataset.i)].name = t.value.slice(0, 30); save(); return; }
            if (t.dataset.jfPc != null) { const i = Number(t.dataset.jfPc); c.players[i].color = t.value || COLORS[i % COLORS.length]; t.closest('.jf-player')?.querySelector('.jf-dot')?.style.setProperty('--pc', c.players[i].color); save(); return; }
            if (t.name === 'name') { c.name = t.value.slice(0, 80); return; }
            def.onInput?.(t, c, form); save();
        }, sig);
        form.addEventListener('change', e => {
            const t = e.target;
            if (t.matches('[data-jf-variant]')) { const v = t.value; if (DEFS.has(v)) { setupKey = v; renderSetup(ws, ctx); } else ctx.onVariant?.(v); return; }
            const r = def.onChange?.(t, c, form); save(); if (r === 'players') drawPlayers(); countView();
        }, sig);
        form.addEventListener('picker-change', e => { const it = e.detail?.item || (e.detail?.items || [])[0]; if (e.target.closest('[data-jf-root]')) { c.scope.root = it && !it.free ? Number(it.id) : 0; c.scope.rootName = it?.title || ''; save(); countView(); return; } def.onPicker?.(e, c, form); save(); }, sig);
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const err = q('[data-jf-err]'); err.innerHTML = '';
            if (gameCount() >= MAX_GAMES) return toast(i18n('Supprime une partie avant d’en commencer une autre.'), 'error');
            if (def.scope && c.scope.kind === 'branch' && !c.scope.root) return UI().fail ? UI().fail(q('[data-jf-root] input, [data-jf-root] [tabindex], [data-jf-root]'), i18n('Choisis la personne dont on prend les ancêtres.')) : toast(i18n('Choisis la personne dont on prend les ancêtres.'), 'error');
            const names = c.players.map(p => p.name.trim());
            if (names.some(n => !n)) { const inp = [...form.querySelectorAll('[name="pname"]')].find(x => !x.value.trim()); return UI().fail ? UI().fail(inp, i18n('Donne un nom à ce joueur.')) : toast(i18n('Donne un nom à chaque joueur.'), 'error'); }
            const btn = form.querySelector('[type=submit]'); btn.disabled = true; const l0 = btn.textContent; btn.textContent = i18n('Préparation…');
            try {
                const src = def.scope ? await peopleFor(c) : {data: null, people: []};
                const res = await def.start(JSON.parse(JSON.stringify(c)), src);
                if (res?.error) { err.innerHTML = notice('warn', res.error); btn.disabled = false; btn.textContent = l0; return; }
                const g = {id: `fam-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, kind: def.key, name: (c.name || '').trim() || i18n('{game} du {date}', {game: def.short ? i18n(def.short) : lab(def), date: new Date().toLocaleDateString(window.LCNDA_I18N?.locale?.() || 'fr-FR')}), cfg: JSON.parse(JSON.stringify(c)), created: Date.now(), ...res};
                if (!writeGame(g)) { btn.disabled = false; btn.textContent = l0; return; }
                c.seed = L().newSeed(); c.name = ''; save(); setup = null;
                ctx.open?.(g.id);
            } catch (er) { toast(er?.message || String(er), 'error'); btn.disabled = false; btn.textContent = l0; }
        }, sig);
    }

    /* ═════ Une partie ═════ */
    /** l'en-tête : « PARTIE EN COURS · ÉCHECS », ou « PARTIE TERMINÉE · ÉCHECS » quand la partie est finie (mat, victoire…) */
    const eyebrow = (g, def) => esc(g.finished ? i18n('PARTIE TERMINÉE · {scope}', {scope: UP(lab(def))}) : i18n('PARTIE EN COURS · {scope}', {scope: UP(lab(def))})) + (g.cfg?.scope && def.scope ? ` · ${esc(UPN(g.cfg.scope))}` : '');
    function render(ws, id, ctx) {
        stop();
        const g = gameById(id), def = g && DEFS.get(g.kind); if (!def) return false;
        const ac = new AbortController(); let cleanup = null;
        stopper = () => { ac.abort(); try { cleanup?.(); } catch (_) {} };
        ws.innerHTML = `<section class="goose-page jf-page jf-${def.key}"><header class="goose-head goose-game-head jf-gamehead"><div><span class="eyebrow" data-jf-eyebrow>${eyebrow(g, def)}</span><h2>${def.icon} ${esc(g.name)}</h2><p data-jf-sub></p></div>
            <div class="page-actions"><button type="button" class="button small" data-jf-again title="${esc(i18n('Une nouvelle partie avec les mêmes réglages'))}">↻ ${esc(i18n('Rejouer'))}</button><button type="button" class="button small secondary" data-jf-new>＋ ${esc(i18n('Nouvelle partie', {ctx: 'jeu'}))}</button><button type="button" class="button small secondary" data-jf-del>🗑 ${esc(i18n('Supprimer'))}</button></div></header>
            <div class="jf-play" data-jf-play></div></section>`;
        const host = ws.querySelector('[data-jf-play]');
        try { ws.scrollTop = 0; ws.closest('.main, main')?.scrollTo?.(0, 0); window.scrollTo(0, 0); } catch (_) {}
        const api = {
            save: () => { const r = writeGame(g), el = ws.querySelector('[data-jf-eyebrow]'); if (el) { const h = eyebrow(g, def); if (el.innerHTML !== h) el.innerHTML = h; } return r; }, sub: t => { const el = ws.querySelector('[data-jf-sub]'); if (el) el.textContent = t; },
            signal: ac.signal, esc, avatar, PK, plural, toast, notice, seg, toggle, fmtTime, L: L(), A: A(), UI: UI(),
            onCleanup: fn => { cleanup = fn; }, sidebar: () => ctx.renderSidebar?.(), data: loadData,
        };
        ws.querySelector('[data-jf-new]').addEventListener('click', () => { setupKey = def.key; ctx.newGame?.(def.key); }, {signal: ac.signal});
        ws.querySelector('[data-jf-again]').addEventListener('click', async () => {
            const btn = ws.querySelector('[data-jf-again]'); btn.disabled = true;
            try {
                const c = {...g.cfg, seed: L().newSeed()}, src = def.scope ? await peopleFor(c) : {data: null, people: []}, res = await def.start(c, src, g);
                if (res?.error) { toast(res.error, 'error'); btn.disabled = false; return; }
                Object.keys(g).forEach(k => { if (!['id', 'kind', 'name', 'created', 'score'].includes(k)) delete g[k]; });
                Object.assign(g, res, {cfg: c, finished: false}); writeGame(g); ctx.open?.(g.id);
            } catch (er) { toast(er?.message || String(er), 'error'); btn.disabled = false; }
        }, {signal: ac.signal});
        ws.querySelector('[data-jf-del]').addEventListener('click', async () => {
            const ok = !A().confirmBox || await A().confirmBox(i18n('La partie et sa progression seront supprimées.'), {title: i18n('Supprimer « {name} » ?', {name: g.name}), okLabel: i18n('Supprimer la partie'), danger: true});
            if (!ok) return; DELETED.add(g.id); saveGames(games().filter(x => x.id !== g.id)); toast(i18n('« {name} » est supprimée.', {name: g.name})); setupKey = def.key; ctx.newGame?.(def.key);
        }, {signal: ac.signal});
        try { def.mount(host, g, api); } catch (er) { host.innerHTML = notice('error', i18n('Cette partie ne peut pas s’ouvrir : {err}', {err: er?.message || er})); }
        return true;
    }

    /* ═════ 🂠 Le dos des cartes (patiences, jeux de cartes à plusieurs) ═════
     * cfg.back : 'bleu' | 'rouge' | 'vert' | 'sepia' (les 4 d'avant) | 'couleur' (cfg.backColor, #rrggbb) | 'photo' (cfg.backMedia : un média de l'app,
     * jamais la photo d'une personne vivante ni d'une fiche confidentielle : la même règle que les portraits des jeux) | 'fichier' (une image de
     * l'ordinateur, réduite et gardée dans ce navigateur, une seule à la fois). La table reçoit data-back="…" et les variables --jb-c, --jb-line, --jb-img. */
    const BACK_KEY = 'lcnda-jeux-dos-image', BACK_MAX = 420 * 1024, BACK_FILE_MAX = 25 * 1024 * 1024;
    const BACK_PRESETS = [['bleu', 'Bleu'], ['rouge', 'Rouge'], ['vert', 'Vert'], ['sepia', 'Sépia']];
    const BACK_TYPES = /^image\/(jpeg|png|webp|gif|bmp|avif)$/i;
    const backImage = () => { try { const v = localStorage.getItem(BACK_KEY) || ''; return /^data:image\/(jpeg|png|webp);base64,/.test(v) ? v : ''; } catch (_) { return ''; } };
    const putBackImage = v => { try { if (v) localStorage.setItem(BACK_KEY, v); else localStorage.removeItem(BACK_KEY); return true; } catch (_) { toast(i18n('Plus de place dans ce navigateur pour garder cette image.'), 'error'); return false; } };
    const hexOk = v => /^#[0-9a-f]{6}$/i.test(String(v || ''));
    const mediaSrcOk = v => typeof v === 'string' && /^media\/[^"'()\\\s]+$/.test(v);
    function backClean(c) {
        const out = {back: 'bleu', backColor: hexOk(c?.backColor) ? c.backColor.toLowerCase() : '#6b3fa0', backMedia: null};
        const m = c?.backMedia; if (m && Number(m.id) > 0 && mediaSrcOk(m.src)) out.backMedia = {id: Number(m.id), src: m.src, title: String(m.title || '').slice(0, 120)};
        const b = String(c?.back || '');
        if (BACK_PRESETS.some(x => x[0] === b) || b === 'couleur' || (b === 'photo' && out.backMedia) || b === 'fichier') out.back = b;
        return out;
    }
    /** des rayures claires sur un fond foncé, foncées sur un fond clair : le motif reste visible */
    const backLine = hex => { const n = parseInt(hex.slice(1), 16), [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? 'rgba(0,0,0,.22)' : 'rgba(255,255,255,.2)'; };
    /** la clé posée sur la table (data-back) : 'image' quand l'image manque, on retombe sur le bleu */
    const backKey = c => { const b = c?.back || 'bleu'; if (b === 'couleur') return hexOk(c.backColor) ? 'couleur' : 'bleu'; if (b === 'photo') return mediaSrcOk(c.backMedia?.src) ? 'image' : 'bleu'; if (b === 'fichier') return backImage() ? 'image' : 'bleu'; return BACK_PRESETS.some(x => x[0] === b) ? b : 'bleu'; };
    /** les variables CSS du dos, posées une fois sur un élément (les tables se redessinent dedans) */
    function backApply(el, c) {
        if (!el?.style) return;
        ['--jb-c', '--jb-line', '--jb-img'].forEach(v => el.style.removeProperty(v));
        const k = backKey(c);
        if (k === 'couleur') { el.style.setProperty('--jb-c', c.backColor); el.style.setProperty('--jb-line', backLine(c.backColor)); }
        if (k === 'image') { const src = c.back === 'photo' ? c.backMedia.src : backImage(); el.style.setProperty('--jb-img', `url("${src.replace(/"/g, '%22')}")`); }
    }
    const backLabel = c => (c.back === 'couleur' ? i18n('une couleur au choix') : c.back === 'photo' ? i18n('la photo « {name} »', {name: c.backMedia?.title || i18n('sans titre')}) : c.back === 'fichier' ? i18n('une image de l’ordinateur') : i18n((BACK_PRESETS.find(x => x[0] === c.back) || BACK_PRESETS[0])[1]).toLocaleLowerCase(window.LCNDA_I18N?.locale?.() || 'fr-FR'));
    function backFieldHtml(c) {
        const b = backClean(c), btn = (k, t, title = '') => `<button type="button" class="${b.back === k ? 'is-active' : ''}" aria-pressed="${b.back === k}" data-jfb="${k}"${title ? ` title="${esc(title)}"` : ''}>${t}</button>`;
        return `<div class="jfp-backs jfb" data-jfb-box><span>${esc(i18n('Dos des cartes'))}</span>
            <span class="jfp jfb-prev" data-jfb-prev data-back="${esc(backKey(b))}" aria-hidden="true"><span class="pc-card is-back"></span></span>
            <div class="segmented jf-seg jfb-seg" role="radiogroup" aria-label="${esc(i18n('Dos des cartes'))}">${BACK_PRESETS.map(([k, l]) => btn(k, esc(i18n(l)))).join('')}${btn('couleur', `🎨 ${esc(i18n('Couleur'))}`, i18n('Une couleur au choix'))}${btn('photo', `🖼 ${esc(i18n('Photo de l’app'))}`, i18n('Une photo des médias de l’app'))}${btn('fichier', `📁 ${esc(i18n('Image de l’ordinateur'))}`, i18n('Une image choisie sur cet ordinateur, ou glissée ici'))}</div>
            <div class="jfb-more" data-jfb-more></div>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif" data-jfb-file hidden></div>`;
    }
    function backMoreHtml(c) {
        if (c.back === 'couleur') return `<label class="jfb-color">${esc(i18n('La couleur du dos'))} <input type="color" value="${esc(c.backColor)}" data-jfb-color></label>`;
        if (c.back === 'photo') return `<span class="jfb-what">🖼 ${esc(c.backMedia?.title || i18n('sans titre'))}</span><button type="button" class="button small secondary" data-jfb-act="photo">${esc(i18n('Choisir une autre photo…'))}</button>`;
        if (c.back === 'fichier') return `<button type="button" class="button small secondary" data-jfb-act="fichier">📁 ${esc(i18n('Choisir une autre image…'))}</button><small class="muted">${esc(i18n('ou glisse une image sur ce cadre · gardée dans ce navigateur'))}</small>`;
        return `<small class="muted">${esc(i18n('Glisse une image sur ce cadre pour en faire le dos des cartes.'))}</small>`;
    }
    /** une image de l'ordinateur → recadrée au format d'une carte, réduite (JPEG), au plus BACK_MAX */
    async function backFromFile(file) {
        if (!file || !BACK_TYPES.test(file.type || '')) throw new Error(i18n('Ce fichier n’est pas une image (JPEG, PNG, WebP, GIF…).'));
        if (file.size > BACK_FILE_MAX) throw new Error(i18n('Cette image est trop lourde (plus de {n} Mo).', {n: 25}));
        const url = URL.createObjectURL(file);
        try {
            const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error(i18n('Cette image ne peut pas être lue.'))); im.src = url; });
            const W = 300, H = 420, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            const x = cv.getContext('2d'), s = Math.max(W / img.naturalWidth, H / img.naturalHeight), w = img.naturalWidth * s, h = img.naturalHeight * s;
            x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
            for (const q of [0.85, 0.72, 0.6, 0.45]) { const d = cv.toDataURL('image/jpeg', q); if (d.length <= BACK_MAX) return d; }
            throw new Error(i18n('Cette image ne peut pas être lue.'));
        } finally { URL.revokeObjectURL(url); }
    }
    /** une photo des médias de l'app : jamais une personne vivante, une fiche confidentielle ni une fiche à respecter (comme les portraits des jeux) */
    async function backFromMedia(item) {
        const find = d => (d?.media || []).find(m => Number(m.id) === Number(item.id));
        let d = await loadData(), m = find(d); if (!m) { d = await loadData(true); m = find(d); }
        if (!m || !mediaSrcOk(m.src || m.thumb)) throw new Error(i18n('Cette image ne peut pas servir de dos de cartes.'));
        const byId = new Map((d.persons || []).map(p => [Number(p.id), p]));
        if ((m.people || []).some(id => { const p = byId.get(Number(id)); return p && (p.living || p.priv || p.mem); })) throw new Error(i18n('Cette photo montre une personne vivante ou une fiche confidentielle : elle ne peut pas servir de dos de cartes.'));
        return {id: Number(m.id), src: m.src || m.thumb, title: String(m.title || item.title || '').slice(0, 120)};
    }
    /** la préparation : boutons, aperçu, couleur, photo, fichier, glisser-déposer, ↶ Annuler */
    function backBind(form, c, save) {
        const box = form.querySelector('[data-jfb-box]'); if (!box) return;
        Object.assign(c, backClean(c));
        const prev = box.querySelector('[data-jfb-prev]'), more = box.querySelector('[data-jfb-more]'), file = box.querySelector('[data-jfb-file]');
        const paint = () => {
            prev.dataset.back = backKey(c); backApply(prev, c);
            box.querySelectorAll('[data-jfb]').forEach(b => { const on = b.dataset.jfb === c.back; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
            more.innerHTML = backMoreHtml(c);
        };
        const snap = () => ({back: c.back, backColor: c.backColor, backMedia: c.backMedia ? {...c.backMedia} : null, img: backImage()});
        const restore = s => { if (s.img !== backImage()) putBackImage(s.img); Object.assign(c, {back: s.back, backColor: s.backColor, backMedia: s.backMedia}); save(); if (box.isConnected) paint(); };
        const commit = before => { save(); paint(); const after = snap(); A()?.undoToast ? A().undoToast(i18n('Dos des cartes : {what}.', {what: backLabel(c)}), {undo: () => restore(before), redo: () => restore(after), icon: '🂠'}) : toast(i18n('Dos des cartes : {what}.', {what: backLabel(c)})); };
        const useFile = async f => {
            if (!f) return;
            try { const before = snap(), d = await backFromFile(f); if (!putBackImage(d)) return; c.back = 'fichier'; commit(before); }
            catch (er) { toast(er?.message || String(er), 'error'); }
        };
        const pickPhoto = async () => {
            const open = PK()?.openMediaPicker || window.LCNDA_MEDIA_PICKER?.openMediaPicker; if (!open) return toast(i18n('Le choix des médias n’est pas disponible.'), 'error');
            const it = await open({types: ['image'], title: i18n('🖼 Une photo pour le dos des cartes'), intro: i18n('Les photos d’une personne vivante ou d’une fiche confidentielle ne peuvent pas servir.'), value: c.backMedia ? [c.backMedia.id] : []});
            const one = Array.isArray(it) ? it[0] : it; if (!one) return;
            try { const before = snap(); c.backMedia = await backFromMedia(one); c.back = 'photo'; commit(before); } catch (er) { toast(er?.message || String(er), 'error'); }
        };
        let colorBefore = null;
        box.addEventListener('click', e => {
            const b = e.target.closest('[data-jfb],[data-jfb-act]'); if (!b) return; e.preventDefault();
            const k = b.dataset.jfb || b.dataset.jfbAct;
            if (k === 'photo' && (b.dataset.jfbAct || !c.backMedia)) return pickPhoto();
            if (k === 'fichier' && (b.dataset.jfbAct || !backImage())) { file.value = ''; return file.click(); }
            if (k === c.back) return;
            const before = snap(); c.back = k; commit(before);
        });
        box.addEventListener('input', e => { if (!e.target.matches('[data-jfb-color]')) return; e.stopPropagation(); colorBefore = colorBefore || snap(); if (hexOk(e.target.value)) { c.backColor = e.target.value.toLowerCase(); prev.dataset.back = backKey(c); backApply(prev, c); save(); } });
        box.addEventListener('change', e => {
            if (e.target.matches('[data-jfb-color]')) { e.stopPropagation(); const before = colorBefore || snap(); colorBefore = null; if (before.backColor !== c.backColor) commit(before); return; }
            if (e.target.matches('[data-jfb-file]')) { e.stopPropagation(); useFile(e.target.files?.[0]); }
        });
        box.addEventListener('dragover', e => { if (![...(e.dataTransfer?.types || [])].includes('Files')) return; e.preventDefault(); box.classList.add('is-drop'); });
        box.addEventListener('dragleave', e => { if (!box.contains(e.relatedTarget)) box.classList.remove('is-drop'); });
        box.addEventListener('drop', e => { const f = e.dataTransfer?.files?.[0]; box.classList.remove('is-drop'); if (!f) return; e.preventDefault(); useFile(f); });
        paint();
    }
    const cardBack = {PRESETS: BACK_PRESETS, clean: backClean, key: backKey, apply: backApply, fieldHtml: backFieldHtml, bind: backBind, fromFile: backFromFile, fromMedia: backFromMedia, image: backImage};

    /* ═════ Colonne de gauche ═════ */
    function sidebarHtml(active) {
        return games().map(g => { const def = DEFS.get(g.kind); return `<button class="side-button jf-side ${g.id === active ? 'is-active' : ''}" type="button" data-jf-open="${esc(g.id)}" data-jeu-type="${esc(g.kind)}" data-jeu-when="${Number(g.updated || g.created) || 0}" title="${esc(i18n('Reprendre cette partie'))}"><strong>${def.icon} ${esc(g.name)}</strong><small>${esc(lab(def))}${g.finished ? ` · 🏁 ${esc(i18n('terminée'))}` : ''}</small>${g.status ? `<small>${esc(i18n(g.status))}</small>` : ''}</button>`; }).join('');
    }
    function bindSidebar(content, ctx, signal) { content.querySelectorAll('[data-jf-open]').forEach(b => b.addEventListener('click', () => ctx.open?.(b.dataset.jfOpen), signal ? {signal} : undefined)); }

    function register(def) { DEFS.set(def.key, def); }
    window.LCNDA_JEUX_FAMILLE = {register, owns, renderSetup, render, sidebarHtml, bindSidebar, stop, gameCount, MAX_GAMES, cardBack,
        get KEYS() { return [...DEFS.keys()]; }, get VARIANTS() { return [...DEFS.values()].map(d => [d.key, i18n(d.label)]); },
        loadData, peopleFor, cleanCfg: (k, raw) => cleanCfg(DEFS.get(k), raw), _games: games, _write: writeGame,
        debug: () => ({setupKey, games: games().map(g => ({id: g.id, kind: g.kind, finished: !!g.finished}))})};
})();
