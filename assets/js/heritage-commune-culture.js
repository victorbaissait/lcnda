/* LCNDA — 🎬📜🛡️🏷️🍲 Le village dans la culture (serveur : lib/commune_culture.php ; style : assets/css/commune-culture.css ;
 * données : assets/data/cc-*.json.gz, refaites par scripts/commune-culture/build-commune-culture.py).
 *  1. 🎬 Le village dans les œuvres : films tournés dans la commune (Wikidata P915), livres, chansons, tableaux qui s'y passent
 *     (P840) ou qui en parlent (P921) — fiche d'un village, monographie, ligne de fiche, liste « 🎬 Films et œuvres des communes ».
 *  2. 📜 Origine du nom et histoire : début des parties « Toponymie » et « Histoire » de l'article Wikipédia (en ligne, gardé),
 *     « lire la suite sur Wikipédia », licence CC BY-SA 4.0 — fiche d'un village et monographie.
 *  3. 🛡️ Armoiries de la commune : image (Wikidata → Commons, auteur et licence) et blasonnement (Wikipédia, « Armorial des
 *     communes de … ») — fiche d'un village, monographie, ligne de fiche, liste « 🛡️ Armoiries des communes ».
 *  4. 🛡️ Un blason à son nom (Rietstap) : seulement si la transcription est livrée (aucune source libre trouvée pour l'instant).
 *  5. 🏷️ Des rues à son nom : Base Adresse Nationale (en ligne, gardé) — ligne de fiche, « une rue porte peut-être le nom de ton
 *     ancêtre » quand prénom + nom font une rue d'une commune de sa vie ; liste « 🏷️ Rues à tes noms ».
 *  6. 🍲 Le plat de sa région (Wikidata) — ligne de fiche (« ＋ Ajouter au livre de recettes » de la Mémoire familiale, ↶),
 *     fiche d'un village, monographie, liste « 🍲 Plats des régions ».
 * Tout se règle dans Réglages → « 🎬 Le village dans la culture » (localStorage « genealogie-commune-culture »).
 * Registres communs : LCNDA_EXT.monographSections, .dataSources, .dataLists. Pour d'autres fichiers : LCNDA_EXT.communeCulture.
 * Essai : tests/test-commune-culture.js
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
    const KEY = 'genealogie-commune-culture';
    const TAB = ['commune_culture', '25k6', '🎬 Le village dans la culture'];
    const PARTS = [
        ['wiki', '📜 Origine du nom et histoire', 'Fiche d’un village et monographie : le début des parties « Toponymie » et « Histoire » de l’article Wikipédia (en ligne).'],
        ['arms', '🛡️ Armoiries de la commune', 'Fiche d’un village, monographie et fiche de personne : le blason de ses communes et son blasonnement.'],
        ['works', '🎬 Le village dans les œuvres', 'Films tournés dans la commune ; livres, chansons et tableaux qui s’y passent ou qui en parlent (Wikidata).'],
        ['dish', '🍲 Le plat de sa région', 'Fiche de personne, fiche d’un village et monographie : un plat ou un produit de la région (Wikidata).'],
        ['rues', '🏷️ Des rues à son nom', 'Fiche de personne : les rues et lieux-dits de France qui portent son nom de famille (Base Adresse Nationale, en ligne).'],
        ['rietstap', '🛡️ Un blason à son nom (Rietstap)', 'Fiche de personne : les familles du même nom dans l’Armorial général de Rietstap (1884).']];
    const DEF = Object.fromEntries(PARTS.map(p => [p[0], true]));
    function settings() { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...DEF, ...s}; }
    function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
    const on = k => settings()[k] !== false;
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.body.classList.contains('ms-on');
    const link = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
    const fmtDate = ts => { try { return new Date(ts * 1000).toLocaleDateString('fr-FR'); } catch (_) { return ''; } };
    const wait = t => (UI().spinner ? UI().spinner(t) : `<p class="muted">${esc(t)}</p>`);
    const emptyLine = (text, icon = 'ℹ️') => (A().emptyState ? A().emptyState({text, icon, size: 'small'}) : `<p class="muted">${esc(text)}</p>`);
    const more = (inner, n) => `<details class="cplus-more cc-more"><summary>${esc(n ? T('▸ plus ({n})', {n}) : T('▸ plus'))}</summary>${inner}</details>`;
    const offline = what => `<p class="cplus-off">📴 ${esc(T('Pas de connexion à Internet : {what} s’afficheront quand tu seras connecté.', {what}))}</p>`;
    const memo = new Map();
    let aboutCache = null; // cc_about : savoir si l'armorial de Rietstap est livré
    function ask(action, q) { const k = action + JSON.stringify(q); if (!memo.has(k)) memo.set(k, api(action, q).catch(e => { memo.delete(k); return {ok: false, message: e.message}; })); return memo.get(k); }
    const qs = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))));
    const placeQuery = p => qs({place_id: Number(p?.id || p?.place_id) || '', name: p?.name || p?.place_name || '', lat: p?.lat ?? p?.latitude, lon: p?.lon ?? p?.longitude, insee: p?.insee || p?.admin4_code || '', country: p?.country || '', county: p?.county || ''});
    const srcLine = (label, licence, url, extra = '') => `<p class="cplus-src cc-src">${esc(T('Source :'))} ${url ? link(url, label) : esc(label)}${licence ? ` — ${esc(licence)}` : ''}${extra}</p>`;
    const when = r => (r?.fetched_at ? ` · <span>${esc(r.cached ? T('gardé sur l’ordinateur le {d}', {d: fmtDate(r.fetched_at)}) : T('lu en ligne le {d}', {d: fmtDate(r.fetched_at)}))}</span>${r.stale ? ` · <span class="cplus-stale">${esc(T('hors ligne : réponse gardée'))}</span>` : ''}` : '');
    const listFr = arr => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} ${T('et')} ${arr[arr.length - 1]}`);

    /* ═════════ 🎬 le village dans les œuvres ═════════ */
    const workLine = w => `${w.icon} <b>${esc(w.title)}</b>${w.year ? ` (${esc(w.year)})` : ''}${w.by ? ` — ${esc(w.by)}` : ''}`;
    function workRow(w) {
        const where = w.where ? ` · ${esc(T('lieu : {w}', {w: w.where}))}` : '';
        return `<li class="cc-work">${w.thumb ? `<a class="cc-thumb" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" alt="" src="${esc(w.thumb)}" onerror="this.parentNode.remove()"></a>` : ''}
            <div><span>${workLine(w)}</span><small>${esc(T(w.kind_label))} · ${esc(T(w.rel_label))}${where} · ${w.wp ? `${link(w.wp, T('Wikipédia ↗'))} · ` : ''}${link(w.url, T('Wikidata ↗'))}</small></div></li>`;
    }
    function worksSentence(works, commune) {
        const films = works.filter(w => w.rel === 'tourne'), set = works.filter(w => w.rel !== 'tourne');
        const parts = [];
        if (films.length) parts.push(films.length === 1 ? T('un film y a été tourné : « {t} »{y}', {t: films[0].title, y: films[0].year ? ` (${films[0].year})` : ''}) : T('{n} films y ont été tournés, dont « {t} »{y}', {n: films.length, t: films[0].title, y: films[0].year ? ` (${films[0].year})` : ''}));
        if (set.length) parts.push(set.length === 1 ? T('une œuvre s’y passe ou en parle : « {t} »', {t: set[0].title}) : T('{n} œuvres s’y passent ou en parlent', {n: set.length}));
        return `${commune ? `${commune} : ` : ''}${parts.join(' ; ')}.`;
    }
    function worksHtml(works, commune) {
        if (!works?.length) return '';
        const N = 3;
        return `<p class="cplus-lead">🎬 ${esc(worksSentence(works, commune))}</p><ul class="cc-works">${works.slice(0, N).map(workRow).join('')}</ul>
            ${works.length > N ? more(`<ul class="cc-works">${works.slice(N).map(workRow).join('')}</ul>`, works.length - N) : ''}${srcLine('Wikidata', 'CC0 1.0', 'https://www.wikidata.org/', ` · <small>${esc(T('ce qui est noté sur Wikidata : la liste n’est pas complète'))}</small>`)}`;
    }

    /* ═════════ 🛡️ armoiries ═════════ */
    const credit = a => `${a.author ? `${esc(a.author)} · ` : ''}${a.licence ? (a.licence_url ? link(a.licence_url, a.licence) : esc(a.licence)) : esc(T('licence : voir la page de l’image'))} · ${link(a.image_page, T('Wikimedia Commons ↗'))}`;
    function armsHtml(a, {small = false} = {}) {
        if (!a || (!a.image && !a.blazon)) return '';
        return `<div class="cc-arms${small ? ' is-small' : ''}">${a.image ? `<figure><a href="${esc(a.image_page)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" alt="${esc(T('Armoiries de {c}', {c: a.commune}))}" src="${esc(a.thumb)}" onerror="this.closest('figure').remove()"></a><figcaption>${credit(a)}</figcaption></figure>` : ''}
            <div><p class="cplus-lead">🛡️ ${esc(T('Les armoiries de {c}', {c: a.commune}))}${a.blazon ? ` : <i class="cc-blazon">${esc(a.blazon)}</i>` : ''}</p>
            ${a.blazon ? srcLine(T('Wikipédia, « {p} »', {p: a.blazon_page}), 'CC BY-SA 4.0', a.blazon_url, ` · <small>${esc(T('les contributeurs de Wikipédia'))}</small>`) : ''}</div></div>`;
    }

    /* ═════════ 🍲 le plat de la région ═════════ */
    const dishWhere = d => (d.level === 'commune' ? T('de la commune') : d.origin ? d.origin : '');
    function dishRow(d, pid) {
        return `<li class="cc-dish">${d.thumb ? `<a class="cc-thumb" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" alt="" src="${esc(d.thumb)}" onerror="this.parentNode.remove()"></a>` : ''}
            <div><span>🍲 <b>${esc(d.name)}</b>${d.origin ? ` <small class="muted">(${esc(d.cuisine || d.origin)})</small>` : ''}</span>${d.desc ? `<small>${esc(d.desc)}</small>` : ''}
            <small>${d.wp ? `${link(d.wp, T('Wikipédia ↗'))} · ` : ''}${link(d.url, T('Wikidata ↗'))}${pid && !kiosk() ? ` · <button type="button" class="h-tr-link cc-linkbtn" data-cc-recipe="${esc(d.qid)}" data-cc-pid="${Number(pid)}">${esc(T('＋ Ajouter au livre de recettes'))}</button>` : ''}</small></div></li>`;
    }
    const dishCache = new Map();
    function dishesHtml(items, {lead, pid = 0} = {}) {
        if (!items?.length) return '';
        items.forEach(d => dishCache.set(d.qid, d));
        const [first, ...rest] = items;
        return `<p class="cplus-lead">${esc(lead || T('Plat typique de la région : {d}.', {d: first.name}))}</p><ul class="cc-dishes">${dishRow(first, pid)}</ul>${rest.length ? more(`<ul class="cc-dishes">${rest.map(d => dishRow(d, pid)).join('')}</ul>`, rest.length) : ''}
            ${srcLine('Wikidata', 'CC0 1.0', 'https://www.wikidata.org/', ` · <small>${esc(T('lieu d’origine ou cuisine régionale notés sur Wikidata'))}</small>`)}`;
    }
    async function addRecipe(btn) {
        const d = dishCache.get(btn.dataset.ccRecipe); if (!d) return;
        btn.disabled = true;
        try {
            const story = T('Plat typique de sa région ({o}). D’après Wikidata : {u}', {o: d.cuisine || d.origin || '', u: d.url});
            const r = await post('tresor_memory_write', {op: 'save', item: {kind: 'recipe', title: d.name, body: '', data: {dish: 'plat', from: String(btn.dataset.ccPid || ''), story}}});
            btn.textContent = T('✓ Dans le livre de recettes');
            const undo = async () => { await post('tresor_memory_write', {op: 'delete', id: r.id}); if (btn.isConnected) { btn.disabled = false; btn.textContent = T('＋ Ajouter au livre de recettes'); } };
            A().undoToast ? A().undoToast(T('« {d} » ajouté au livre de recettes (Trésors → Mémoire familiale) : écris-y la recette de la famille.', {d: d.name}), {undo, icon: '🍲'}) : A().toast?.(T('Ajouté au livre de recettes.'));
        } catch (e) { btn.disabled = false; A().toast?.(e.message, 'error'); }
    }

    /* ═════════ 📜 origine du nom et histoire (Wikipédia, en ligne) ═════════ */
    const paras = list => (list || []).map(p => (p.t === 'h' ? `<h5>${esc(p.x)}</h5>` : `<p>${esc(p.x)}</p>`)).join('');
    function wikiPart(r, k) {
        const s = r?.[k]; if (!s) return '';
        const longer = s.chars > (s.lead || []).reduce((n, p) => n + p.x.length, 0) + 40;
        const src = r.source || {};
        return `<div class="cc-wiki">${paras(s.lead)}${longer ? more(`<div class="cc-wiki-more">${paras(s.more)}</div>`) : ''}
            <p class="cc-readmore">${link(s.url, T('📖 lire la suite sur Wikipédia ↗'))}</p>
            <p class="cplus-src cc-src">${esc(T('Extrait de l’article « {t} » de Wikipédia en français, écrit par {a}', {t: r.title, a: src.authors || T('les contributeurs de Wikipédia')}))} (${link(r.history_url || src.url, T('historique'))}) — ${link(src.licence_url || 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', src.licence || 'CC BY-SA 4.0')}${when(r)}</p></div>`;
    }
    async function fillWiki(host, place, k) {
        host.innerHTML = wait(T('On lit l’article Wikipédia de la commune…'));
        const r = await ask('cc_wiki', placeQuery(place));
        if (!host.isConnected) return r;
        if (!r.ok) { host.innerHTML = r.offline ? offline(T('l’origine du nom et l’histoire')) : ''; return r; }
        host.innerHTML = wikiPart(r, k);
        return r;
    }

    /* ═════════ 🏷️ rues à son nom (en ligne) ═════════ */
    function ruesHtml(r, P) {
        if (!r?.ok || !r.items?.length) return '';
        const name = (P?.last || r.name || '').toUpperCase(), voies = r.items.filter(x => x.kind === 'voie'), lieux = r.items.filter(x => x.kind !== 'voie');
        const cities = [...new Set(r.items.map(x => x.city))];
        const n = r.items.length, many = r.capped ? T('au moins {n}', {n}) : String(n);
        let lead = voies.length && !lieux.length ? T(voies.length === 1 ? 'Il existe une rue {name} en France : {c}.' : 'Il existe {n} rues {name} en France, à {c}.', {n: r.capped ? many : voies.length, name, c: listFr(cities.slice(0, 3)) + (cities.length > 3 ? '…' : '')})
            : T(n === 1 ? 'Une rue ou un lieu-dit porte le nom {name} en France : {c}.' : '{n} rues ou lieux-dits portent le nom {name} en France, à {c}.', {n: many, name, c: listFr(cities.slice(0, 3)) + (cities.length > 3 ? '…' : '')});
        const anc = (r.ancestor || [])[0];
        const ancLine = anc ? `<p class="cplus-lead cc-anc">🏷️ ${esc(T('Une rue porte peut-être le nom de ton ancêtre : « {s} », à {c} — une commune de sa vie.', {s: anc.name, c: anc.city}))} ${anc.map ? link(anc.map, T('carte ↗')) : ''}</p>` : '';
        const row = x => `<li>${x.kind === 'voie' ? '🛣️' : '📍'} <b>${esc(x.name)}</b> — ${esc(x.city)}${x.postcode ? ` (${esc(x.postcode)})` : ''}${x.his ? ` <span class="cc-pill">${esc(T('commune de sa vie'))}</span>` : ''} ${x.map ? `<small>${link(x.map, T('carte ↗'))}</small>` : ''}</li>`;
        const pins = r.items.filter(x => x.lat != null);
        return `${ancLine}<p class="cplus-lead">🏷️ ${esc(lead)}</p>${more(`${pins.length ? miniMap(pins) : ''}<ul class="cc-rues">${r.items.map(row).join('')}</ul>
            <p class="muted"><small>${esc(T('Même nom ne veut pas dire même famille : la rue peut honorer quelqu’un d’autre, ou venir d’un lieu-dit.'))}</small></p>${srcLine(r.source?.label || 'Base Adresse Nationale', r.source?.licence || 'Licence Ouverte 2.0', r.source?.url || 'https://adresse.data.gouv.fr/', when(r))}`, n)}`;
    }
    /** une petite carte de France (sans tuiles : un contour simple et des points) */
    function miniMap(pins) {
        const W = 220, H = 220, x = lon => (lon + 5.5) / 15.2 * W, y = lat => (51.3 - lat) / 9.2 * H;
        const pts = pins.filter(p => p.lat > 41 && p.lat < 51.5 && p.lon > -5.5 && p.lon < 10).map(p => `<circle cx="${x(p.lon).toFixed(1)}" cy="${y(p.lat).toFixed(1)}" r="4"><title>${esc(`${p.name} — ${p.city}`)}</title></circle>`).join('');
        if (!pts) return '';
        const fr = [[51.1, 2.5], [50.1, 4.2], [49.5, 6.4], [48.9, 8.2], [47.6, 7.6], [46.4, 6.1], [45.9, 7.0], [44.1, 7.6], [43.7, 7.5], [43.1, 6.2], [43.5, 4.0], [42.4, 3.1], [42.8, -0.2], [43.4, -1.8], [44.6, -1.2], [46.2, -1.2], [47.3, -2.5], [47.8, -4.6], [48.6, -4.7], [48.7, -1.6], [49.7, -1.9], [49.4, 0.2], [50.0, 1.5], [51.1, 2.5]];
        return `<svg class="cc-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T('Carte de France : où sont ces rues'))}"><polygon points="${fr.map(([la, lo]) => `${x(lo).toFixed(1)},${y(la).toFixed(1)}`).join(' ')}" class="cc-map-fr"/>${pts}</svg>`;
    }

    /* ═════════ 🛡️ Rietstap (si livré) ═════════ */
    function rietstapHtml(list, last) {
        if (!list?.length) return '';
        const f = list[0];
        return `<p class="cplus-lead">🛡️ ${esc(T('Une famille {n} porte « {b} » (Rietstap, Armorial général, 1884) — même nom ne veut pas dire même famille.', {n: String(last || f.name).toUpperCase(), b: f.blazon}))}</p>
            ${list.length > 1 ? more(`<ul>${list.slice(1).map(x => `<li><b>${esc(x.name)}</b>${x.where ? ` (${esc(x.where)})` : ''} : <i>${esc(x.blazon)}</i></li>`).join('')}</ul>`, list.length - 1) : ''}`;
    }

    /* ═════════ la fiche d'une personne : un bloc « 🏷️ Son nom et ses villages » ═════════ */
    ext.personBlocks = ext.personBlocks || {};
    const anyPersonPart = () => ['arms', 'works', 'dish', 'rues', 'rietstap'].some(on);
    ext.personBlocks.commune_culture = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !anyPersonPart()) return '';
        return A().card(index, T('🏷️ Son nom et ses villages'), '', `<div class="cc-block" data-cc-person="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    async function fillPerson(host, id, only = null) {
        const on = k => (only ? only.includes(k) : settings()[k] !== false);
        const r = await ask('cc_person', {id});
        if (!host.isConnected || !r?.ok) return r;
        const out = [];
        if (on('arms') && r.arms?.length) out.push(`<div class="cc-line" data-cc-line="arms">${armsHtml(r.arms[0], {small: true})}${r.arms.length > 1 ? more(r.arms.slice(1).map(a => armsHtml(a, {small: true})).join(''), r.arms.length - 1) : ''}</div>`);
        if (on('works') && r.works?.length) {
            const by = new Map(); r.works.forEach(w => { const k = w.commune || w.place; if (!by.has(k)) by.set(k, []); by.get(k).push(w); });
            const groups = [...by.entries()];
            out.push(`<div class="cc-line" data-cc-line="works">${worksHtml(groups[0][1], groups[0][0])}${groups.length > 1 ? more(groups.slice(1).map(([c, ws]) => worksHtml(ws, c)).join(''), groups.length - 1) : ''}</div>`);
        }
        if (on('dish') && r.dishes?.items?.length) {
            const d = r.dishes.items[0], where = r.dishes.dep_name || r.dishes.place;
            out.push(`<div class="cc-line" data-cc-line="dish">${dishesHtml(r.dishes.items, {pid: id, lead: T('🍲 Plat typique de sa région ({w}) : {d}.', {w: where, d: d.name})})}</div>`);
        }
        if (on('rietstap') && r.rietstap?.length) out.push(`<div class="cc-line" data-cc-line="rietstap">${rietstapHtml(r.rietstap, r.last)}</div>`);
        if (on('rues') && r.last && !r.private) out.push('<div class="cc-line" data-cc-line="rues" hidden></div>');
        host.innerHTML = out.join('');
        const card = host.closest('section.card');
        if (card && host.querySelector('.cc-line:not([hidden])')) card.hidden = false;
        const rb = host.querySelector('[data-cc-line="rues"]');
        if (rb) {
            const rr = await ask('cc_rues', {id});
            if (rb.isConnected && rr?.ok && rr.items?.length) { rb.innerHTML = ruesHtml(rr, r); rb.hidden = false; if (card) card.hidden = false; }
            else if (rb.isConnected) rb.remove();
        }
        return r;
    }
    (ext.afterPerson = ext.afterPerson || []).push(() => { document.querySelectorAll('#workspace [data-cc-person]').forEach(h => fillPerson(h, Number(h.dataset.ccPerson))); });

    /* ═════════ la fiche d'un village ═════════ */
    const panel = (id, title, body = '<div data-cc-body></div>') => `<section class="maintenance-panel cplus-panel cc-panel" data-cc-part="${id}"><h3>${esc(title)}</h3>${body}</section>`;
    /** les parties d'un lieu dans host (fiche d'un village, ou à la demande) ; parts = celles à montrer */
    async function placeInto(host, place, {parts = null} = {}) {
        const want = k => (parts ? parts.includes(k) : on(k === 'toponymie' || k === 'histoire' ? 'wiki' : k));
        const r = await ask('cc_place', placeQuery(place));
        if (!host.isConnected) return r;
        if (!r?.ok) { host.innerHTML = ''; return r; }
        const pl = {...place, insee: place.insee || r.commune.insee, name: place.name || r.commune.name};
        const out = [];
        if (want('toponymie')) out.push(panel('toponymie', T('📜 Origine du nom')));
        if (want('histoire')) out.push(panel('histoire', T('📜 Son histoire en bref')));
        if (want('arms') && r.arms) out.push(panel('arms', T('🛡️ Armoiries'), armsHtml(r.arms)));
        if (want('works') && r.works?.length) out.push(panel('works', T('🎬 Le village dans les œuvres'), worksHtml(r.works)));
        if (want('dish') && r.dishes?.length) out.push(panel('dish', T('🍲 Le plat de la région'), dishesHtml(r.dishes, {lead: T('Plat typique de la région ({w}) : {d}.', {w: r.dishes[0].cuisine || r.dishes[0].origin || r.commune.dep_name, d: r.dishes[0].name})})));
        host.innerHTML = out.join('');
        const jobs = ['toponymie', 'histoire'].map(k => { const b = host.querySelector(`[data-cc-part="${k}"] [data-cc-body]`); return b ? fillWiki(b, pl, k).then(() => { if (!b.innerHTML.trim()) b.closest('[data-cc-part]')?.remove(); }) : null; }).filter(Boolean);
        await Promise.all(jobs);
        return r;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(), lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || village.querySelector('[data-cad-insee]')?.dataset.cadInsee || ''};
    }
    function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-cc])');
        if (!village) return;
        village.dataset.cc = '1';
        if (!['wiki', 'arms', 'works', 'dish'].some(on)) return;
        const place = villagePlace(village); if (!place.id && !place.insee && !place.name) return;
        const anchor = village.querySelector('[data-mr-host]') || village.querySelector('[data-lp-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid') || village.querySelector('[data-vsec="stats"]');
        const box = '<div class="cc-place" data-cc-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-cc-host]'), place);
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; try { decorate(); } catch (e) { console.error(e); } }); }).observe(document.documentElement, {childList: true, subtree: true});

    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-cc-recipe]'); if (b) { e.preventDefault(); addRecipe(b); return; }
        if (e.target.closest?.('[data-cc-clear]')) clearCache();
    });
    document.addEventListener('change', e => { const t = e.target.closest?.('[data-cc-tg]'); if (t && e.target.matches('input')) { const s = settings(); s[t.dataset.ccTg] = e.target.checked; save(s); memo.clear(); } });

    /* ═════════ 📜 Monographie de commune : des parties déclarées (heritage-monographie-plus.js) ═════════ */
    const monoPlace = pl => ({id: Number(pl?.id) || 0, name: pl?.name || '', lat: pl?.latitude ?? pl?.lat ?? null, lon: pl?.longitude ?? pl?.lon ?? null, country: pl?.country || '', county: pl?.county || ''});
    const monoRun = part => async (place, host, ctx) => {
        let insee = ''; try { insee = (await ctx?.village?.())?.insee || ''; } catch (_) {}
        host.innerHTML = '<div></div>';
        await placeInto(host.firstElementChild, {...monoPlace(place), insee}, {parts: [part]});
        const body = host.querySelector('[data-cc-part]');
        if (!body || !body.textContent.trim()) { host.innerHTML = ''; return false; }
        host.innerHTML = body.innerHTML.replace(/^<h3>.*?<\/h3>/s, ''); // le titre est celui de la partie
        return true;
    };
    (ext.monographSections = ext.monographSections || []).push(
        {id: 'cc_toponymie', icon: '📜', label: T('Origine du nom'), group: 'Le lieu', defaultOn: true, enabled: () => on('wiki'), render: monoRun('toponymie')},
        {id: 'cc_histoire', icon: '📜', label: T('Son histoire en bref (Wikipédia)'), group: 'Le lieu', defaultOn: true, enabled: () => on('wiki'), render: monoRun('histoire')},
        {id: 'cc_armoiries', icon: '🛡️', label: T('Armoiries de la commune'), group: 'Le lieu', defaultOn: true, enabled: () => on('arms'), render: monoRun('arms')},
        {id: 'cc_oeuvres', icon: '🎬', label: T('Le village dans les œuvres'), group: 'Le lieu', defaultOn: true, enabled: () => on('works'), render: monoRun('works')},
        {id: 'cc_plat', icon: '🍲', label: T('Le plat de la région'), group: 'Le lieu', defaultOn: true, enabled: () => on('dish'), render: monoRun('dish')});

    /* ═════════ 🧰 à la demande : le registre commun des données ═════════ */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null, county: pl.county || '', country: pl.country || ''} : null);
    const personId = ctx => Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0;
    async function runPlace(part, ctx, host, empty) {
        const pl = placeOfCtx(ctx.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return null; }
        host.innerHTML = '<div class="cc-place"></div>';
        const r = await placeInto(host.firstElementChild, pl, {parts: [part]});
        if (!host.textContent.trim()) host.innerHTML = emptyLine(r?.ok === false ? (r.message || empty) : empty, 'ℹ️');
        return r;
    }
    async function runPerson(ctx, host, only) {
        const id = personId(ctx); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
        host.innerHTML = '<div class="cc-block"></div>';
        return fillPerson(host.firstElementChild, id, only);
    }
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'cc_toponymie', icon: '📜', label: T('Origine du nom de la commune'), group: 'Le lieu', needs: ['place'], online: true, run: (ctx, host) => runPlace('toponymie', ctx, host, T('Pas de partie « Toponymie » dans l’article Wikipédia de cette commune.'))},
        {id: 'cc_histoire', icon: '📜', label: T('Histoire de la commune en bref'), group: 'Le lieu', needs: ['place'], online: true, run: (ctx, host) => runPlace('histoire', ctx, host, T('Pas de partie « Histoire » dans l’article Wikipédia de cette commune.'))},
        {id: 'cc_armoiries', icon: '🛡️', label: T('Armoiries de la commune'), group: 'Le lieu', needs: ['place'], installed: () => true, run: (ctx, host) => runPlace('arms', ctx, host, T('Pas d’armoiries connues pour cette commune.'))},
        {id: 'cc_oeuvres', icon: '🎬', label: T('Le village dans les œuvres (films, livres…)'), group: 'Le lieu', needs: ['place'], installed: () => true, run: (ctx, host) => runPlace('works', ctx, host, T('Aucun film ni aucune œuvre de cette commune sur Wikidata.'))},
        {id: 'cc_plat', icon: '🍲', label: T('Le plat de la région'), group: 'Le lieu', needs: ['place'], installed: () => true, run: (ctx, host) => runPlace('dish', ctx, host, T('Aucun plat de cette région sur Wikidata.'))},
        {id: 'cc_rues', icon: '🏷️', label: T('Des rues à son nom'), group: 'La personne', needs: ['person'], online: true,
            run: async (ctx, host) => { const id = personId(ctx); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; } const r = await ask('cc_rues', {id}); host.innerHTML = ruesHtml(r, {last: r.name}) || emptyLine(r?.message || T('Aucune rue ni aucun lieu-dit de France ne porte ce nom.'), '🏷️'); return r; }},
        {id: 'cc_nom_villages', icon: '🏷️', label: T('Son nom et ses villages (armoiries, œuvres, plat)'), group: 'La personne', needs: ['person'], installed: () => true,
            run: async (ctx, host) => { const r = await runPerson(ctx, host, ['arms', 'works', 'dish', 'rietstap']); if (!host.textContent.trim()) host.innerHTML = emptyLine(T('Rien de connu pour ses communes.'), '🏷️'); return r; }});

    /* ═════════ 🧰 Listes → Données ═════════ */
    const KIND_VALUES = ['Film', 'Série ou téléfilm', 'Livre', 'Chanson ou musique', 'Tableau ou image', 'Jeu', 'Autre œuvre'];
    const openUrl = u => { if (u) window.open(u, '_blank', 'noopener'); };
    const loadList = kind => api('cc_list', {kind}).then(r => r.rows || []);
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'cc_oeuvres', icon: '🎬', label: T('Films et œuvres des communes'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/', enabled: () => on('works'),
            load: async () => (await loadList('oeuvres')).map(r => ({...r, kind_label: T(r.kind_label), rel_label: T(r.rel_label)})),
            fields: [{key: 'title', label: T('Titre'), type: 'text'}, {key: 'kind_label', label: T('Sorte'), type: 'enum', values: KIND_VALUES.map(T)}, {key: 'year', label: T('Année'), type: 'year'},
                {key: 'by', label: T('Réalisateur ou auteur'), type: 'text'}, {key: 'rel_label', label: T('Lien avec la commune'), type: 'enum', values: [T('tourné ici'), T('l’histoire se passe ici'), T('parle de la commune')]},
                {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'where', label: T('Lieu précis'), type: 'text'}, {key: 'dep', label: T('Département'), type: 'enum'}, {key: 'url', label: 'Wikidata', type: 'url'}],
            period: r => [r.year || null, null], geo: r => (r.lat != null ? [r.lat, r.lon] : null), open: r => openUrl(r.wp || r.url)},
        {id: 'cc_armoiries', icon: '🛡️', label: T('Armoiries des communes'), group: 'Le lieu', source: T('Wikidata (CC0), images Wikimedia Commons (licence de chaque fichier), blasonnements Wikipédia (CC BY-SA 4.0)'), sourceUrl: 'https://fr.wikipedia.org/wiki/Armorial_des_communes_de_France', enabled: () => on('arms'),
            load: () => loadList('armoiries'),
            fields: [{key: 'commune', label: T('Commune'), type: 'place'}, {key: 'dep_name', label: T('Département'), type: 'enum'}, {key: 'blazon', label: T('Blasonnement'), type: 'text'},
                {key: 'author', label: T('Auteur de l’image'), type: 'text'}, {key: 'licence', label: T('Licence de l’image'), type: 'enum'}, {key: 'image_page', label: T('Image'), type: 'url'}, {key: 'insee', label: 'INSEE', type: 'text'}],
            geo: r => (r.lat != null ? [r.lat, r.lon] : null), open: r => openUrl(r.image_page || r.blazon_url)},
        {id: 'cc_plats', icon: '🍲', label: T('Plats des régions'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/', enabled: () => on('dish'),
            load: () => loadList('plats'),
            fields: [{key: 'name', label: T('Plat ou produit'), type: 'text'}, {key: 'origin', label: T('Origine'), type: 'text'}, {key: 'cuisine', label: T('Cuisine'), type: 'enum'}, {key: 'dep_names', label: T('Départements'), type: 'text'},
                {key: 'desc', label: T('Description'), type: 'text'}, {key: 'url', label: 'Wikidata', type: 'url'}],
            geo: r => (r.lat != null ? [r.lat, r.lon] : null), open: r => openUrl(r.wp || r.url)},
        {id: 'cc_rues', icon: '🏷️', label: T('Rues à tes noms de famille (en ligne)'), group: 'Chercher', source: T('Base Adresse Nationale (Licence Ouverte 2.0)'), sourceUrl: 'https://adresse.data.gouv.fr/', enabled: () => on('rues'),
            load: () => loadList('rues'),
            fields: [{key: 'surname', label: T('Nom de famille'), type: 'enum'}, {key: 'name', label: T('Rue ou lieu-dit'), type: 'text'}, {key: 'kind_label', label: T('Sorte'), type: 'enum', values: [T('rue'), T('lieu-dit')]},
                {key: 'city', label: T('Commune'), type: 'place'}, {key: 'postcode', label: T('Code postal'), type: 'text'}, {key: 'context', label: T('Département, région'), type: 'text'}, {key: 'map', label: T('Carte'), type: 'url'}],
            geo: r => (r.lat != null ? [r.lat, r.lon] : null), open: r => openUrl(r.map)},
        {id: 'cc_rietstap', icon: '🛡️', label: T('Blasons à tes noms (Rietstap)'), group: 'La personne', source: 'J.-B. Rietstap, Armorial général (1884-1887), domaine public', enabled: () => on('rietstap') && !!aboutCache?.rietstap,
            load: () => loadList('rietstap'),
            fields: [{key: 'surname', label: T('Ton nom'), type: 'enum'}, {key: 'name', label: T('Famille'), type: 'text'}, {key: 'where', label: T('Pays ou région'), type: 'text'}, {key: 'blazon', label: T('Blason'), type: 'text'}, {key: 'people', label: T('Personnes de ce nom'), type: 'number'}]});

    /* ═════════ Réglages → 🎬 Le village dans la culture ═════════ */
    setTimeout(() => { try { A().api?.('cc_about').then(r => { aboutCache = r; }).catch(() => {}); } catch (_) {} }, 1500);
    async function clearCache() {
        try {
            const res = await post('cc_cache_clear', {});
            memo.clear(); drawSettings();
            A().undoToast?.(T('Réponses gardées effacées ({n}).', {n: res.removed}), {undo: async () => { await post('cc_cache_restore', {token: res.token}); drawSettings(); }});
        } catch (err) { A().toast?.(err.message, 'error'); }
    }
    const fmtSize = b => (b >= 1e6 ? `${String(Math.round(b / 1e5) / 10).replace('.', ',')} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`);
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        let about = {sources: [], cache: {count: 0, bytes: 0}};
        try { about = await api('cc_about'); aboutCache = about; } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        if (A().state?.maintenanceTab !== TAB[0] && token === undefined && !ws.querySelector('[data-cc-settings]')) return;
        const s = settings();
        const tg = ([k, label, sub]) => (k === 'rietstap' && !about.rietstap ? '' : `<label class="checkbox-line cplus-tg" data-cc-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`);
        const rows = about.sources.map(x => `<tr><td>${link(x.url, x.label)}</td><td>${esc(x.what)}${x.count ? ` <small class="muted">(${esc(Number(x.count).toLocaleString('fr-FR'))})</small>` : ''}</td><td>${esc(x.online ? T('en ligne, gardé') : x.bytes ? T('dans l’app ({s})', {s: fmtSize(x.bytes)}) : T('dans l’app'))}</td><td>${esc(x.licence)}</td><td>${esc(x.mention)}</td></tr>`).join('');
        const kb = Math.max(1, Math.round((about.cache?.bytes || 0) / 1024));
        ws.innerHTML = `<section class="page cplus-settings cc-settings" data-cc-settings>${UI().pageHeader ? UI().pageHeader({title: T('Le village dans la culture'), icon: '🎬', where: T('Réglages · Données'), help: esc(T('Les films, livres et chansons de tes villages, leurs armoiries, l’origine de leur nom, les rues à ton nom et le plat de la région.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('Gardé sur l’ordinateur'))}</h3><p>${esc(T('L’origine du nom, l’histoire et les rues viennent d’Internet, une fois : {n} réponses gardées ({k} Ko).', {n: about.cache?.count || 0, k: kb}))}</p>
                <div class="page-actions"><button type="button" class="button secondary" data-cc-clear ${about.cache?.count && !kiosk() ? '' : 'disabled'}>${esc(T('🗑 Effacer les réponses gardées'))}</button></div></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Source'))}</th><th>${esc(T('Ce qu’elle donne'))}</th><th>${esc(T('Où'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Mention'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
                ${about.rietstap ? '' : `<p class="muted">🛡️ ${esc(about.rietstap_note || '')}</p>`}
                <p class="muted">${esc(T('Ce qui part sur Internet : le nom de la commune (Wikipédia, Wikidata) et le nom de famille seul (rues ; jamais pour une fiche confidentielle ou une personne vivante). Rien n’est envoyé tant que tu n’ouvres pas la fiche.'))}</p></div></section>`;
    }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'metiers_rivieres'); if (i < 0) i = tabs.findIndex(t => t[0] === 'commune_plus'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === 'commune_culture')) {
            // dans la zone « contexte » de la fiche, après « 🏘 Le lieu à son époque » et ses voisins
            const after = ['mr_metier', 'histoire', 'cplus_newspapers', 'cplus_cemeteries', 'world'].map(k => B.findIndex(b => b[0] === k)).find(i => i >= 0);
            B.splice(after === undefined ? B.length : after + 1, 0, ['commune_culture', '🏷️ Son nom et ses villages']);
        }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans.commune_culture ||= '12';
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.communeCulture = {settings, placeInto, fillPerson, worksHtml, armsHtml, dishesHtml, ruesHtml, decorate,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})();
