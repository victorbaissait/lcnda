/* LCNDA — 📜 Anciens noms, 🏘️ lieux-dits et ⛪ patrimoine de la commune (serveur : lib/lieux_patrimoine.php ; style : assets/css/lieux-patrimoine.css).
 *  · Fiche d'un village et Monographie de commune : trois parties, une phrase d'abord, le détail plié (« ▸ plus ») :
 *      📜 Anciens noms (DicoTopo, livré avec l'app : formes anciennes datées, avec leur source, lien vers dicotopo.cths.fr),
 *      🏘️ Lieux-dits de la commune (pack IGN du département : liste à chercher, « 🗺 Sur la carte » sur la carte du village),
 *      ⛪ Patrimoine de la commune (pack Mérimée + Palissy : l'église, ses cloches, ses fonts baptismaux… lien vers POP).
 *    Rien quand il n'y a rien ; un pack pas installé : une petite offre « ⤓ Installer … » (une fois, ✕ la cache pour de bon).
 *  · Atelier de transcription, « Ce que l'app a trouvé » → Lieux : un nom qui n'est pas dans ta base → « 💡 Ce serait peut-être … ».
 *  · Réglages → « 🏘️ Lieux-dits et patrimoine » (à côté de la météo) : chaque partie s'éteint ; les départements ; « ⤓ Installer »,
 *    « 🗑 Supprimer » (↶ Annuler) avec les tailles ; « À propos des données ».
 *  · Pour les autres outils : window.LCNDA_EXT.lieuxPatrimoine.suggest(lieu) → Promise {q, guesses: [{source, name, old, date, year,
 *    ref, insee, commune, dep, dep_name, desc, url, lat, lon}]} ; .placeInto(élément, lieu) ; et le registre LCNDA_EXT.dataSources.
 * Réglages : localStorage « genealogie-lieux-patrimoine » ; offres cachées : « genealogie-lieux-patrimoine-offres » ;
 * téléchargements en cours : « genealogie-lieux-patrimoine-dl ». Essai : tests/test-lieux-patrimoine.js
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const post = (a, b) => api(a, {}, {method: 'POST', body: b}).then(r => r.result || r);
    const KEY = 'genealogie-lieux-patrimoine', OFFER_KEY = 'genealogie-lieux-patrimoine-offres', DL_KEY = 'genealogie-lieux-patrimoine-dl';
    const TAB = ['lieux_patrimoine', '25k3', '🏘️ Lieux-dits et patrimoine'];
    const PARTS = [['dico', '📜 Anciens noms', 'Les formes anciennes du nom de la commune et de ses hameaux, datées, avec leur source (DicoTopo, livré avec l’app).'],
        ['lieuxdits', '🏘️ Lieux-dits de la commune', 'Hameaux, fermes, moulins et lieux-dits (IGN), à chercher et à montrer sur la carte du village.'],
        ['patrimoine', '⛪ Patrimoine de la commune', 'Monuments historiques et objets protégés : l’église, ses cloches, ses fonts baptismaux… (Mérimée, Palissy).'],
        ['atelier', '💡 Idées dans l’Atelier de transcription', 'Un lieu lu dans un acte et absent de ta base : « Ce serait peut-être … » (lieux-dits et anciens noms).']];
    const KINDS = {lieuxdits: ['🏘️', 'Lieux-dits (IGN)'], patrimoine: ['⛪', 'Monuments et objets (Mérimée, Palissy)']};
    const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    function settings() { const s = lsGet(KEY, {}) || {}; const o = {dico: true, lieuxdits: true, patrimoine: true, atelier: true, deps: null}; for (const k of Object.keys(o)) if (k in s) o[k] = s[k]; o.deps = Array.isArray(o.deps) ? o.deps.filter(d => /^(\d{2}|2A|2B|97\d)$/.test(d)) : null; return o; }
    const save = s => lsSet(KEY, s);
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.body.classList.contains('ms-on');
    const fmtSize = b => (b >= 1e9 ? `${String(Math.round(b / 1e8) / 10).replace('.', ',')} Go` : b >= 1e6 ? `${String(Math.round(b / 1e5) / 10).replace('.', ',')} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`);
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const plural = (n, w) => (A().plural ? A().plural(n, w) : `${nf(n)} ${w}${n > 1 ? 's' : ''}`);
    const link = (url, label) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label));
    const more = (html, n) => (html ? `<details class="lp-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');

    /* ═════════ les données d'une commune (gardées le temps de la session) ═════════ */
    const memo = new Map();
    function placeData(place) {
        const id = Number(place?.id) || 0, insee = String(place?.insee || '');
        const k = `${id}|${insee}`;
        if (!memo.has(k)) memo.set(k, api('lp_place', {id, insee}).then(r => r.result || r).catch(() => ({ok: false})));
        return memo.get(k);
    }
    let statusP = null;
    const status = (fresh = false) => { if (fresh || !statusP) statusP = api('lp_status').catch(() => ({packs: {}, dicotopo: {deps: {}}})); return statusP; };
    const offerHidden = kind => !!(lsGet(OFFER_KEY, {}) || {})[kind];
    function hideOffer(kind) { const o = lsGet(OFFER_KEY, {}) || {}; o[kind] = true; lsSet(OFFER_KEY, o); A().undoToast?.(T('Proposition cachée. Elle reste dans Réglages → 🏘️ Lieux-dits et patrimoine.'), {undo: () => { const p = lsGet(OFFER_KEY, {}) || {}; delete p[kind]; lsSet(OFFER_KEY, p); redrawPlaces(); }}); }
    function offerHtml(kind, dep, depName) {
        if (offerHidden(kind) || kiosk()) return '';
        const [ico, label] = KINDS[kind];
        return `<p class="lp-offer" data-lp-offer="${kind}"><button type="button" class="link-button" data-lp-install="${esc(kind)}-${esc(dep)}">⤓ ${esc(T('Installer {what} — {dep}', {what: T(label), dep: depName || dep}))}</button> <button type="button" class="icon-button lp-x" data-lp-hide-offer="${kind}" title="${esc(T('Ne plus proposer'))}" aria-label="${esc(T('Ne plus proposer'))}">✕</button></p>`.replace('⤓', `${ico} ⤓`);
    }

    /* ── 📜 anciens noms ── */
    const oldLine = o => `<li><b>${esc(o.label)}</b>${o.date ? ` <span class="lp-date">${esc(o.date)}</span>` : ''}${o.ref ? ` <small class="muted">— ${esc(o.ref)}</small>` : ''}</li>`;
    function dicoHtml(d) {
        const x = d?.dicotopo; if (!x?.found) return '';
        const c = x.commune, dated = (c?.old || []).filter(o => o.year != null).sort((a, b) => a.year - b.year);
        const first = dated[0] || c?.old?.[0];
        const lead = c && first ? T('{name} s’écrivait « {old} » en {date}.', {name: c.name, old: first.label, date: first.date || '?'}) : c ? T('{name} est dans le Dictionnaire topographique, sans forme ancienne.', {name: c.name}) : T('Le Dictionnaire topographique décrit {n} lieux de cette commune.', {n: nf(x.places_total)});
        const placeRow = p => `<li><b>${link(p.url, p.name)}</b>${p.desc ? ` <small class="muted">${esc(p.desc)}</small>` : ''}${p.old.length ? `<ul class="lp-old">${p.old.map(oldLine).join('')}</ul>` : ''}</li>`;
        const withOld = x.places.filter(p => p.old.length);
        const detail = `${c && c.old.length > 1 ? `<ul class="lp-old">${c.old.map(oldLine).join('')}</ul>` : ''}
            ${withOld.length ? `<h4>${esc(T('Les hameaux et lieux de la commune ({n})', {n: nf(withOld.length)}))}</h4><input type="search" class="lp-filter" data-lp-filter placeholder="${esc(T('Chercher un nom, ancien ou d’aujourd’hui…'))}"><ul class="lp-places">${withOld.map(placeRow).join('')}</ul>` : ''}`;
        const src = `<p class="lp-src">${esc(T('Source :'))} ${link(c?.url || 'https://dicotopo.cths.fr', 'DicoTopo')}${x.bibl?.bibl ? ` — ${esc(x.bibl.bibl)}` : ''} ${x.bibl?.gallica ? link(x.bibl.gallica, T('(le livre sur Gallica)')) : ''} · ${esc(T('Licence Ouverte 2.0'))}</p>`;
        return `<p class="lp-lead">📜 ${esc(lead)}${c ? ` ${link(c.url, T('voir sur DicoTopo ↗'))}` : ''}</p>${more(detail, (c?.old.length || 0) + withOld.length)}${src}`;
    }
    /* ── 🏘️ lieux-dits ── */
    function lieuxHtml(d) {
        const x = d?.lieuxdits; if (!x) return '';
        if (!x.installed) return offerHtml('lieuxdits', d.dep, d.dep_name);
        if (!x.list?.length) return '';
        const hab = x.list.filter(l => l.habite).length;
        const lead = T('{n} lieux-dits à {commune}, dont {h} habités.', {n: nf(x.list.length), commune: d.commune || x.commune || '', h: nf(hab)});
        const rows = x.list.map(l => `<li data-lp-name="${esc(l.nom.toLowerCase())}"><b>${esc(l.nom)}</b> <small class="muted">${esc(l.nature || '')}</small></li>`).join('');
        return `<p class="lp-lead">🏘️ ${esc(lead)} ${x.list.some(l => l.lat != null) ? `<button type="button" class="link-button" data-lp-pins>${esc(T('🗺 Sur la carte'))}</button>` : ''}</p>
            ${more(`<input type="search" class="lp-filter" data-lp-filter placeholder="${esc(T('Chercher un lieu-dit…'))}"><ul class="lp-ld">${rows}</ul>`, x.list.length)}
            <p class="lp-src">${esc(T('Source :'))} ${link('https://www.data.gouv.fr/datasets/bd-topo-r', '© IGN – BD TOPO®')} · ${esc(T('Licence Ouverte Etalab 2.0'))}${x.fixture ? ` · <b>${esc(T('données d’essai, inventées'))}</b>` : ''}</p>`;
    }
    /* ── ⛪ patrimoine ── */
    function patrimoineHtml(d) {
        const x = d?.patrimoine; if (!x) return '';
        if (!x.installed) return offerHtml('patrimoine', d.dep, d.dep_name);
        if (!x.list?.length) return '';
        const mon = x.list.filter(o => o.base !== 'palissy'), obj = x.list.filter(o => o.base === 'palissy');
        const church = mon.find(o => /église|eglise|chapelle/i.test(`${o.deno} ${o.nom}`));
        const lead = [mon.length ? T('{n} monument(s) protégé(s)', {n: nf(mon.length)}) : '', obj.length ? T('{n} objet(s) protégé(s)', {n: nf(obj.length)}) : ''].filter(Boolean).join(T(' et ')) + (church ? ` — ${church.nom}${church.siecle ? ` (${church.siecle})` : ''}` : '') + '.';
        const row = o => `<li><b>${link(o.url, o.nom)}</b> <small class="muted">${esc([o.deno, o.siecle || o.dates, o.edifice].filter(Boolean).join(' · '))}</small>${o.protection ? `<br><small>${esc(o.protection)}</small>` : ''}${o.resume ? `<br><small class="lp-resume">${esc(o.resume)}</small>` : ''}</li>`;
        const detail = `${mon.length ? `<h4>${esc(T('Monuments historiques'))}</h4><ul class="lp-mh">${mon.map(row).join('')}</ul>` : ''}${obj.length ? `<h4>${esc(T('Objets protégés (cloches, fonts baptismaux, tableaux…)'))}</h4><ul class="lp-mh">${obj.map(row).join('')}</ul>` : ''}`;
        return `<p class="lp-lead">⛪ ${esc(lead)}</p>${more(detail, x.list.length)}
            <p class="lp-src">${esc(T('Source :'))} ${link('https://pop.culture.gouv.fr', T('Ministère de la Culture, POP (bases Mérimée et Palissy)'))} · ${esc(T('Licence Ouverte'))}${x.fixture ? ` · <b>${esc(T('données d’essai, inventées'))}</b>` : ''}</p>`;
    }
    const RENDER = {dico: dicoHtml, lieuxdits: lieuxHtml, patrimoine: patrimoineHtml};
    const TITLE = {dico: '📜 Anciens noms', lieuxdits: '🏘️ Lieux-dits de la commune', patrimoine: '⛪ Patrimoine de la commune'};

    /** remplit un élément avec les parties allumées (rien du tout s'il n'y a rien à dire) ; place = {id?, insee?, name?, lat?, lon?} */
    async function placeInto(host, place, opts = {}) {
        if (!host) return null;
        if (opts.fresh) memo.delete(`${Number(place?.id) || 0}|${String(place?.insee || '')}`);
        const s = settings(), parts = (opts.parts || ['dico', 'lieuxdits', 'patrimoine']).filter(k => opts.force || s[k]);
        if (!parts.length) { host.innerHTML = ''; return null; }
        const d = await placeData(place);
        if (!host.isConnected && !opts.detached) return d;
        host.__lpData = d; host.__lpPlace = place;
        if (!d?.ok) { host.innerHTML = ''; return d; }
        host.innerHTML = parts.map(k => { const h = RENDER[k](d); return h ? `<section class="maintenance-panel cplus-panel lp-panel" data-lp-part="${k}"><h3>${esc(T(TITLE[k]))}</h3>${h}</section>` : ''; }).join('');
        host.classList.toggle('lp-place', !!host.innerHTML);
        return d;
    }

    /* ── les 🏘️ sur la carte du village (même calcul que les 🪦 de heritage-commune-plus.js) ── */
    function pinsOnMap(host) {
        const X = A(), d = host?.__lpData, pl = host?.__lpPlace, map = document.querySelector('#workspace .h-village-map');
        if (!map) { A().toast?.(T('La carte du village n’est pas affichée ici.'), 'info'); return; }
        if (!X.lngToX || !d?.lieuxdits?.list || pl?.lat == null || pl?.lon == null) return;
        map.querySelectorAll('.lp-pin').forEach(n => n.remove());
        const z = Number(X.state?.hVillageZoom) || 13, cx = X.lngToX(pl.lon, z), cy = X.latToY(pl.lat, z), w = map.clientWidth || 760, h = map.clientHeight || 420;
        let n = 0;
        d.lieuxdits.list.forEach(l => {
            if (l.lat == null) return;
            const dx = X.lngToX(l.lon, z) - cx, dy = X.latToY(l.lat, z) - cy;
            if (Math.abs(dx) > w / 2 - 6 || Math.abs(dy) > h / 2 - 6) return;
            n++; map.insertAdjacentHTML('beforeend', `<span class="lp-pin${l.habite ? ' is-hab' : ''}" style="left:calc(50% + ${Math.round(dx)}px);top:calc(50% + ${Math.round(dy)}px)" title="${esc(`${l.nom} · ${l.nature || ''}`)}">${esc(l.nom)}</span>`);
        });
        map.scrollIntoView?.({block: 'nearest', behavior: 'smooth'});
        A().toast?.(T('{n} lieux-dits sur la carte.', {n: nf(n)}), 'info');
    }

    /* ═════════ la fiche d'un village et la monographie de commune ═════════ */
    function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-lp])');
        if (village) {
            village.dataset.lp = '1';
            const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
            const place = {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || '', lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
                insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || village.querySelector('[data-cad-insee]')?.dataset.cadInsee || ''};
            if (!place.id && !place.insee) return;
            const anchor = village.querySelector('.cplus-place') || village.querySelector('.h-village-grid') || village.querySelector('[data-vsec="stats"]');
            const box = '<div class="lp-place" data-lp-host></div>';
            if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
            placeInto(village.querySelector('[data-lp-host]'), place, {fresh: true});
            return;
        }
        const mono = ws.querySelector('.place-monograph-sections:not([data-lp])');
        if (mono && !mono.closest('.h-village')) {
            mono.dataset.lp = '1';
            const pli = ws.querySelector('.place-monograph-images[data-pli-host]'), cpo = ws.querySelector('[data-cpo-place]');
            const place = {id: Number(pli?.dataset.pliPlace || cpo?.dataset.cpoPlace) || 0, name: pli?.dataset.pliName || '', lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null};
            if (!place.id) return;
            const anchor = mono.querySelector('.place-monograph-postcards');
            const box = '<div class="lp-place" data-lp-host></div>';
            if (anchor) anchor.insertAdjacentHTML('beforebegin', box); else mono.insertAdjacentHTML('beforeend', box);
            placeInto(mono.querySelector('[data-lp-host]'), place, {fresh: true});
        }
    }
    function redrawPlaces() { memo.clear(); document.querySelectorAll('[data-lp-host]').forEach(h => { if (h.__lpPlace) placeInto(h, h.__lpPlace); }); }

    /* ═════════ 💡 Atelier de transcription : un lieu lu, absent de la base ═════════ */
    const guessMemo = new Map();
    function suggest(place, opts = {}) {
        const q = String(typeof place === 'string' ? place : place?.name || place?.title || '').split(',')[0].trim();
        const deps = [...(opts.deps || []), place?.dep].filter(Boolean).join(',');
        if (q.length < 3) return Promise.resolve({q, guesses: []});
        const k = `${q.toLowerCase()}|${deps}|${opts.limit || 8}`;
        if (!guessMemo.has(k)) guessMemo.set(k, api('lp_suggest', {q, deps, limit: opts.limit || 8}).then(r => r.result || r).catch(() => ({q, guesses: []})));
        return guessMemo.get(k);
    }
    const guessText = g => `${g.name}${g.commune && g.commune !== g.name ? ` (${g.commune}` + (g.dep_name ? `, ${g.dep_name})` : ')') : g.dep_name ? ` (${g.dep_name})` : ''}`;
    const guessTitle = g => (g.source === 'dicotopo' ? [g.old ? T('« {old} » en {date}', {old: g.old, date: g.date || '?'}) : '', g.ref, g.desc, T('Source : DicoTopo')] : [g.desc, T('Source : IGN – BD TOPO®')]).filter(Boolean).join(' · ');
    function decorateAtelier() {
        if (!settings().atelier) return;
        document.querySelectorAll('[data-tf-sec="places"] [data-tf-item]:not([data-lp-g])').forEach(item => {
            item.dataset.lpG = '1';
            if (item.querySelector('.h-tf-base')) return; // déjà un lieu de la base
            const name = (item.querySelector('.h-tf-main')?.textContent || '').trim();
            suggest(name, {limit: 3}).then(r => {
                if (!item.isConnected || !r.guesses?.length || item.querySelector('.lp-guess')) return;
                const g = r.guesses;
                item.insertAdjacentHTML('beforeend', `<span class="lp-guess" title="${esc(guessTitle(g[0]))}">💡 ${esc(T('Ce serait peut-être'))} ${g.map(x => x.url ? link(x.url, guessText(x)) : `<b>${esc(guessText(x))}</b>`).join(` ${esc(T('ou'))} `)}</span>`);
            });
        });
    }

    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; try { decorate(); decorateAtelier(); } catch (e) { console.error(e); } }); }).observe(document.documentElement, {childList: true, subtree: true});

    document.addEventListener('input', e => {
        const f = e.target.closest?.('[data-lp-filter]'); if (!f) return;
        const q = f.value.trim().toLowerCase();
        f.parentElement.querySelectorAll('.lp-ld > li, .lp-places > li').forEach(li => { li.hidden = !!q && !li.textContent.toLowerCase().includes(q); });
    });
    document.addEventListener('click', e => {
        const t = e.target;
        if (t.closest?.('[data-lp-pins]')) { pinsOnMap(t.closest('[data-lp-host]')); return; }
        const h = t.closest?.('[data-lp-hide-offer]'); if (h) { hideOffer(h.dataset.lpHideOffer); h.closest('.lp-offer')?.remove(); return; }
        const i = t.closest?.('[data-lp-install]'); if (i && !t.closest('.lp-set')) { e.preventDefault(); installKeys([i.dataset.lpInstall]); }
    });

    /* ═════════ ⤓ installer, en un bouton, par tranches (lib/lieux_patrimoine.php : même façon que la météo) ═════════ */
    const DL = {online: null, err: '', run: null, queue: [], paused: {}};
    let setRedraw = () => {};
    const dlSaved = () => lsGet(DL_KEY, {}) || {};
    const dlRemember = (k, id) => { const v = dlSaved(); v[k] = id; lsSet(DL_KEY, v); };
    const dlForget = k => { const v = dlSaved(); delete v[k]; lsSet(DL_KEY, v); };
    async function loadOnline() {
        try { const r = await api('lp_dl_info'); DL.online = r.packs || {}; DL.err = r.error || ''; } catch (x) { DL.online = {}; DL.err = x.message; }
        return DL.online;
    }
    async function installKeys(keys) {
        if (kiosk()) return;
        if (DL.online === null) await loadOnline();
        const missing = keys.filter(k => !DL.online[k]);
        if (missing.length && missing.length === keys.length) { A().toast?.(DL.err ? T('Pas de connexion aux données en ligne.') : T('Ce pack n’est pas encore en ligne.'), 'error'); return; }
        keys.filter(k => DL.online[k] && !DL.queue.includes(k) && DL.run?.key !== k).forEach(k => DL.queue.push(k));
        setRedraw();
        if (!DL.run) runQueue();
    }
    async function runQueue() {
        const done = [];
        while (DL.queue.length) {
            const k = DL.queue.shift();
            const r = await dlRun(k);
            if (r) done.push(r); else if (DL.paused[k]) break;
        }
        DL.run = null; statusP = null; memo.clear(); setRedraw(); redrawPlaces();
        if (done.length) {
            const n = done.reduce((s, r) => s + (r.count || 0), 0);
            A().undoToast?.(T('⤓ {p} installé(s) ({n} lieux ou notices).', {p: done.map(r => `${KINDS[r.kind]?.[0] || ''} ${r.dep}`).join(', '), n: nf(n)}), {undo: async () => {
                for (const r of done) { try { await post('lp_pack_undo', {key: r.key}); } catch (_) {} }
                statusP = null; memo.clear(); setRedraw(); redrawPlaces();
            }});
        }
    }
    async function dlRun(k) {
        let id = DL.paused[k]?.id || dlSaved()[k] || '', run;
        try {
            if (id) { const r = await api('lp_dl_resume', {id}); if (!r.exists) id = ''; else run = {id, received: r.received, size: r.size}; }
            if (!id) { const r = await post('lp_dl_start', {key: k}); id = r.id; run = {id, received: 0, size: r.size}; }
        } catch (x) { A().toast?.(x.message, 'error'); return null; }
        dlRemember(k, id); delete DL.paused[k];
        DL.run = {...run, key: k, stop: false}; setRedraw();
        let fails = 0;
        while (!DL.run.stop) {
            try { const r = await post('lp_dl_step', {id}); DL.run.received = r.received; fails = 0; paintRun(); if (r.done) break; }
            catch (x) { if (++fails >= 3) { A().toast?.(T('Téléchargement arrêté : {e}', {e: x.message}), 'error'); DL.paused[k] = {id, received: DL.run.received, size: DL.run.size}; return null; } await new Promise(r => setTimeout(r, 1500 * fails)); }
        }
        if (DL.run.stop) { DL.paused[k] = {id, received: DL.run.received, size: DL.run.size}; DL.queue.length = 0; return null; }
        try { const r = await post('lp_pack_finish', {id}); dlForget(k); return r; }
        catch (x) { dlForget(k); A().toast?.(x.message, 'error'); return null; }
    }
    function paintRun() { const b = document.querySelector('[data-lp-prog]'); if (b && DL.run) { b.querySelector('i').style.width = `${DL.run.size ? Math.floor(DL.run.received / DL.run.size * 100) : 0}%`; b.querySelector('small').textContent = `${DL.run.key} · ${fmtSize(DL.run.received)} / ${fmtSize(DL.run.size)}`; } }
    async function removeKey(k) {
        try { await post('lp_pack_remove', {key: k}); } catch (x) { A().toast?.(x.message, 'error'); return; }
        statusP = null; memo.clear(); setRedraw(); redrawPlaces();
        A().undoToast?.(T('🗑 Pack {k} supprimé.', {k}), {undo: async () => { await post('lp_pack_restore', {key: k}); statusP = null; memo.clear(); setRedraw(); redrawPlaces(); }});
    }

    /* ═════════ Réglages → 🏘️ Lieux-dits et patrimoine ═════════ */
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = async token => {
        const ws = document.getElementById('workspace'); if (!ws) return;
        let st = await status(true), about = {sources: []};
        try { about = await api('lp_about'); } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        if (DL.online === null) loadOnline().then(() => setRedraw());
        const draw = () => {
            const s = settings(), names = st.dep_names || {}, packs = st.packs || {};
            const deps = s.deps || (st.wanted || []).slice(0, 8);
            const tg = ([k, label, sub]) => `<label class="checkbox-line cplus-tg" data-lp-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
            const cell = (kind, dep) => {
                const key = `${kind}-${dep}`, p = packs[key], on = DL.online?.[key];
                if (DL.run?.key === key) return `<td><small>${esc(T('en cours…'))}</small></td>`;
                if (DL.queue.includes(key)) return `<td><small class="muted">${esc(T('en attente'))}</small></td>`;
                if (p) return `<td>${UI().badge ? UI().badge(T('Installé'), 'green') : '✓'} <small>${esc(fmtSize(p.size))} · ${esc(nf(p.count))}</small>${kiosk() ? '' : ` <button type="button" class="icon-button" data-lp-remove="${esc(key)}" title="${esc(T('🗑 Supprimer'))}">🗑</button>`}</td>`;
                if (DL.paused[key]) return `<td><button type="button" class="button small" data-lp-install-one="${esc(key)}">▶ ${esc(T('Reprendre'))}</button></td>`;
                if (DL.online === null) return `<td><small class="muted">${esc(T('Recherche des données en ligne…'))}</small></td>`;
                if (!on) return `<td><small class="muted" title="${esc(DL.err)}">${esc(DL.err ? T('Pas de connexion') : T('Pas encore en ligne'))}</small></td>`;
                return `<td><button type="button" class="button small secondary" data-lp-install-one="${esc(key)}" ${kiosk() ? 'disabled' : ''}>⤓ ${esc(fmtSize(on.size))}</button></td>`;
            };
            const toGet = deps.flatMap(d => ['lieuxdits', 'patrimoine'].map(k => `${k}-${d}`)).filter(k => !packs[k] && DL.online?.[k]);
            const total = toGet.reduce((n, k) => n + DL.online[k].size, 0);
            const allDeps = Object.keys(names).sort((a, b) => a.localeCompare(b, 'fr', {numeric: true}));
            const installedDeps = [...new Set(Object.values(packs).map(p => p.dep))].filter(d => !deps.includes(d));
            const rows = [...deps, ...installedDeps].map(d => `<tr><th>${esc(d)} ${esc(names[d] || '')}${deps.includes(d) ? '' : ` <small class="muted">${esc(T('(hors de ta liste)'))}</small>`}${s.deps && deps.includes(d) ? ` <button type="button" class="icon-button" data-lp-dep-del="${esc(d)}" title="${esc(T('Retirer de la liste'))}">✕</button>` : ''}</th>${cell('lieuxdits', d)}${cell('patrimoine', d)}<td>${st.dicotopo?.deps?.[d] ? `✓ <small>${esc(fmtSize(st.dicotopo.deps[d].size))}</small>` : '<small class="muted">—</small>'}</td></tr>`).join('');
            const dico = st.dicotopo || {deps: {}}, dcount = Object.keys(dico.deps || {}).length;
            const srcRows = (about.sources || []).map(x => `<tr><td>${link(x.url, x.nom)}</td><td>${esc(x.what)}</td><td>${esc(x.in)}</td><td>${esc(x.licence)}</td><td>${esc(x.mention)}</td></tr>`).join('');
            const packSize = Object.values(packs).reduce((n, p) => n + (p.size || 0), 0);
            ws.innerHTML = `<section class="page lp-set">${UI().pageHeader ? UI().pageHeader({title: T('Lieux-dits et patrimoine'), icon: '🏘️', where: T('Réglages · Données'), help: esc(T('Les anciens noms, les lieux-dits et le patrimoine de la commune, sur la fiche d’un village et la monographie de commune. Tout marche sans Internet une fois installé.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
                <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3>${PARTS.map(tg).join('')}</div>
                <div class="maintenance-panel"><h3>${esc(T('Les données par département'))}</h3>
                    <p class="muted">${esc(s.deps ? T('Ta liste de départements.') : T('Au départ : les départements des lieux de ta famille.'))}</p>
                    <div class="lp-scroll"><table class="data-table lp-table"><thead><tr><th>${esc(T('Département'))}</th><th>🏘️ ${esc(T('Lieux-dits'))}</th><th>⛪ ${esc(T('Monuments et objets'))}</th><th>📜 ${esc(T('Anciens noms (livrés)'))}</th></tr></thead><tbody>${rows || `<tr><td colspan="4" class="muted">${esc(T('Aucun département : ajoutes-en un ci-dessous.'))}</td></tr>`}</tbody></table></div>
                    <div class="page-actions"><label>${esc(T('Ajouter un département'))} <select data-lp-dep-add><option value="">—</option>${allDeps.filter(d => !deps.includes(d)).map(d => `<option value="${esc(d)}">${esc(d)} ${esc(names[d])}</option>`).join('')}</select></label>
                        ${toGet.length && !kiosk() ? `<button type="button" class="button" data-lp-install-all>⤓ ${esc(T('Installer tout ({n} packs, {s})', {n: toGet.length, s: fmtSize(total)}))}</button>` : ''}
                        ${DL.run ? `<span class="lp-dl" data-lp-prog><span class="wx-prog"><i style="width:0%"></i></span><small></small><button type="button" class="button small secondary" data-lp-pause>⏸ ${esc(T('Pause'))}</button></span>` : ''}</div>
                    <p class="muted">${esc(T('Installés : {n} packs, {s} sur le disque.', {n: Object.keys(packs).length, s: fmtSize(packSize)}))} ${esc(T('📜 Anciens noms livrés avec l’app : {n} départements, {s}.', {n: dcount, s: fmtSize(dico.size || 0)}))}</p>
                    ${UI().notice ? UI().notice('info', T('Le téléchargement se fait une fois ; ensuite l’app n’a plus besoin d’Internet. Rien n’est envoyé.')) : ''}</div>
                <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="lp-scroll"><table class="data-table"><thead><tr><th>${esc(T('Source'))}</th><th>${esc(T('Ce qu’elle donne'))}</th><th>${esc(T('Où'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Mention'))}</th></tr></thead><tbody>${srcRows}</tbody></table></div>
                    ${Object.keys(lsGet(OFFER_KEY, {}) || {}).length ? `<p><button type="button" class="link-button" data-lp-offers-reset>${esc(T('Proposer à nouveau l’installation sur les fiches'))}</button></p>` : ''}</div></section>`;
            paintRun();
        };
        draw();
        setRedraw = async () => { if (!ws.querySelector('.lp-set')) return; st = await status(); draw(); };
        if (ws.__lpBound) return;
        ws.__lpBound = true;
        ws.addEventListener('change', e => {
            if (!ws.querySelector('.lp-set')) return;
            const t = e.target.closest?.('[data-lp-tg]');
            if (t) { const k = t.dataset.lpTg, s = settings(), was = s[k]; s[k] = e.target.checked; save(s); redrawPlaces();
                A().undoToast?.(s[k] ? T('{x} : affiché.', {x: T(PARTS.find(p => p[0] === k)[1])}) : T('{x} : masqué.', {x: T(PARTS.find(p => p[0] === k)[1])}), {undo: () => { const v = settings(); v[k] = was; save(v); setRedraw(); redrawPlaces(); }}); return; }
            const a = e.target.closest?.('[data-lp-dep-add]');
            if (a && a.value) { const s = settings(), before = s.deps; s.deps = [...(s.deps || (st.wanted || []).slice(0, 8)), a.value]; save(s); setRedraw();
                A().undoToast?.(T('Département {d} ajouté à ta liste.', {d: a.value}), {undo: () => { const v = settings(); v.deps = before; save(v); setRedraw(); }}); }
        });
        ws.addEventListener('click', e => {
            if (!ws.querySelector('.lp-set')) return;
            const t = e.target;
            const one = t.closest('[data-lp-install-one]'); if (one) return installKeys([one.dataset.lpInstallOne]);
            if (t.closest('[data-lp-install-all]')) { const s = settings(), deps = s.deps || (st.wanted || []).slice(0, 8); return installKeys(deps.flatMap(d => ['lieuxdits', 'patrimoine'].map(k => `${k}-${d}`)).filter(k => !st.packs?.[k])); }
            if (t.closest('[data-lp-pause]')) { if (DL.run) DL.run.stop = true; return; }
            const rm = t.closest('[data-lp-remove]'); if (rm) return removeKey(rm.dataset.lpRemove);
            const dd = t.closest('[data-lp-dep-del]'); if (dd) { const s = settings(), before = s.deps; s.deps = (s.deps || []).filter(d => d !== dd.dataset.lpDepDel); save(s); setRedraw();
                A().undoToast?.(T('Département {d} retiré de ta liste (ses packs restent installés).', {d: dd.dataset.lpDepDel}), {undo: () => { const v = settings(); v.deps = before; save(v); setRedraw(); }}); return; }
            if (t.closest('[data-lp-offers-reset]')) { const before = lsGet(OFFER_KEY, {}); lsSet(OFFER_KEY, {}); setRedraw(); redrawPlaces(); A().undoToast?.(T('Les propositions reviendront sur les fiches.'), {undo: () => { lsSet(OFFER_KEY, before); setRedraw(); }}); }
        });
    };
    function openSettings() { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }

    function register() {
        const tabs = A().defaultMaintenanceTabs;
        if (!Array.isArray(tabs)) return false;
        if (!tabs.some(t => t[0] === TAB[0])) { const j = ['histoire', 'meteo'].map(k => tabs.findIndex(t => t[0] === k)).find(i => i >= 0); tabs.splice(j === undefined ? tabs.length : j + 1, 0, TAB); }
        return true;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    /* ═════════ 🧰 le registre commun des données : à la demande, pour n'importe quel lieu ═════════ */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.title || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
    const installedKind = kind => status().then(s => Object.values(s.packs || {}).some(p => p.kind === kind));
    const emptyLine = (t, icon) => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    async function runPart(part, ctx, host) {
        const pl = placeOfCtx(ctx.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return; }
        host.innerHTML = '<div></div>';
        const d = await placeInto(host.firstElementChild, pl, {parts: [part], force: true, detached: true});
        if (!host.firstElementChild?.innerHTML.trim()) host.innerHTML = emptyLine(d?.ok ? T('Rien pour cette commune.') : T('Commune introuvable : ce lieu n’a pas de code INSEE ni de position en France.'), TITLE[part].split(' ')[0]);
        return d;
    }
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'lp_dicotopo', icon: '📜', label: T('Anciens noms de la commune (DicoTopo)'), group: 'Le lieu', needs: ['place'], installed: () => true, run: (ctx, host) => runPart('dico', ctx, host)},
        {id: 'lp_lieuxdits', icon: '🏘️', label: T('Lieux-dits de la commune (IGN)'), group: 'Le lieu', needs: ['place'], installed: () => installedKind('lieuxdits'), install: openSettings, run: (ctx, host) => runPart('lieuxdits', ctx, host)},
        {id: 'lp_patrimoine', icon: '⛪', label: T('Patrimoine de la commune (Mérimée, Palissy)'), group: 'Le lieu', needs: ['place'], installed: () => installedKind('patrimoine'), install: openSettings, run: (ctx, host) => runPart('patrimoine', ctx, host)},
        {id: 'lp_suggest', icon: '💡', label: T('Un nom de lieu inconnu : lieux-dits et anciens noms'), group: 'Chercher', needs: ['place'],
            run: async (ctx, host) => {
                const r = await suggest(ctx.place, {limit: 12});
                host.innerHTML = r.guesses?.length ? `<ul class="lp-guesses">${r.guesses.map(g => `<li>💡 ${g.url ? link(g.url, guessText(g)) : `<b>${esc(guessText(g))}</b>`} <small class="muted">${esc(guessTitle(g))}</small></li>`).join('')}</ul>` : emptyLine(T('Aucun lieu-dit ni ancien nom de ce nom dans les départements de ta famille.'), '💡');
                return r;
            }});

    ext.lieuxPatrimoine = {suggest, placeInto, placeData, settings, openSettings, install: installKeys, status, decorate, decorateAtelier, state: DL};
})();
