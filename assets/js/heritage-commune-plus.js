/* LCNDA — 🪦🖼️⛪📰 Autour du village (serveur : lib/commune_plus.php ; style : assets/css/commune-plus.css).
 * Quatre recherches EN LIGNE, faites seulement quand le bloc s'ouvre, puis gardées sur l'ordinateur (sans Internet : la réponse gardée,
 * ou un petit message). Chaque réponse montre sa source et un lien.
 *  1. 🪦 Cimetières autour du village (OpenStreetMap, © OpenStreetMap contributors, ODbL) : fiche d'un village et Monographie de commune
 *     (liste : nom, distance, religion ; 🪦 sur la carte du village ; « itinéraire » sur openstreetmap.org) ; et bloc de fiche
 *     « 🪦 Cimetières près de [lieu] » quand le lieu du décès ou de l'inhumation est placé sur la carte.
 *  2. 🖼️ Images anciennes de la commune (Wikimedia Commons) : bande datée « Le village en 1905 », auteur + licence de chaque image,
 *     lien vers Commons, « ＋ Garder dans les médias » (licence et auteur gardés dans la source du média) avec ↶.
 *  3. ⛪ Saint patron de l'église (Wikidata) : « ⛪ Église Saint-Martin (XIIe s.) — saint patron : Martin de Tours, fêté le 11 novembre ».
 *     Pour d'autres blocs (Patrimoine) : window.LCNDA_EXT.communePlus.church(place) → Promise {ok, churches, line, html}
 *     et .churchInto(élément, place).
 *  4. 📰 Journaux anciens libres à l'étranger : Chronicling America (États-Unis), Delpher (Pays-Bas), ANNO (Autriche).
 *     Pour « Où chercher » : window.LCNDA_EXT.communePlus.newspapers(person) → [{id, title, url, why}] (tout de suite, sans réseau) ;
 *     bloc de fiche « 📰 Journaux anciens à l'étranger » pour qui est mort ou a vécu hors de France.
 * Où : fiche d'un village (⛪ dans « Église et paroisse », 🪦 et 🖼️ sous la grille) ; Monographie de commune : 3 parties déclarées
 * (LCNDA_EXT.monographSections) ; fiche personne : 2 blocs dans la zone « contexte » (après « 🏘 Le lieu à son époque »).
 * Une phrase d'abord, le détail sous « ▸ plus » ; rien quand il n'y a rien (sauf « hors ligne », en une ligne).
 * À la demande : LCNDA_EXT.dataSources (4 entrées) ; Listes : LCNDA_EXT.dataLists (4 listes, depuis ce qui est gardé ; GET cplus_list).
 * Réglages → « 🪦 Autour du village (en ligne) » : chaque partie s'éteint ; localStorage « genealogie-commune-plus ».
 * Essai : tests/test-commune-plus.js
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const KEY = 'genealogie-commune-plus';
    const TAB = ['commune_plus', '25k4', '🪦 Autour du village (en ligne)'];
    const PARTS = [['cemeteries', '🪦 Cimetières autour du village', 'Sur la fiche d’un village et la monographie de commune : les cimetières à moins de 5 km (OpenStreetMap).'],
        ['images', '🖼️ Images anciennes de la commune', 'Cartes postales et photos d’avant 1960 (Wikimedia Commons), avec auteur et licence.'],
        ['church', '⛪ Saint patron de l’église', 'L’église de la commune, son âge et son saint patron (Wikidata).'],
        ['person_cemeteries', '🪦 Cimetières près du lieu de décès', 'Bloc de fiche, quand le lieu du décès ou de l’inhumation est placé sur la carte.'],
        ['newspapers', '📰 Journaux anciens à l’étranger', 'Bloc de fiche pour qui est mort ou a vécu hors de France : journaux des États-Unis, des Pays-Bas et d’Autriche.']];
    const DEF = Object.fromEntries(PARTS.map(p => [p[0], true]));
    function settings() { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...DEF, ...s}; }
    function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
    const on = k => settings()[k] !== false;
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.body.classList.contains('ms-on');
    const fmtKm = km => (km < 1 ? T('{n} m', {n: Math.round(km * 1000)}) : T('{n} km', {n: String(km).replace('.', ',')}));
    const fmtDate = ts => { try { return new Date(ts * 1000).toLocaleDateString('fr-FR'); } catch (_) { return ''; } };
    const ext_link = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;

    /* ═════════ commun : l'attente, hors ligne, la ligne de source ═════════ */
    const wait = t => (UI().spinner ? UI().spinner(t) : `<p class="muted">${esc(t)}</p>`);
    const emptyLine = (text, icon = 'ℹ️') => (A().emptyState ? A().emptyState({text, icon, size: 'small'}) : `<p class="muted">${esc(text)}</p>`);
    /** rien à montrer : le bloc s'efface (pas de bloc vide) — la carte de fiche, ou la partie de la page du lieu */
    function vanish(host) {
        const box = host?.closest?.('section.card[data-pblock], .cplus-panel, .cplus-inpanel'), wrap = box?.closest?.('.cplus-place');
        if (box) box.remove(); else if (host) host.innerHTML = '';
        if (wrap && !wrap.children.length) wrap.remove();
    }
    const more = (inner, n) => `<details class="cplus-more"><summary>${esc(n ? T('▸ plus ({n})', {n}) : T('▸ plus'))}</summary>${inner}</details>`;
    function failHtml(r, what) {
        if (r?.offline) return `<p class="cplus-off">📴 ${esc(T('Pas de connexion à Internet : {what} s’afficheront quand tu seras connecté.', {what}))}</p>`;
        return emptyLine(r?.message || T('Rien trouvé.'));
    }
    function sourceLine(r, src = r?.source) {
        if (!src) return '';
        const when = r.fetched_at ? (r.cached ? T('gardé sur l’ordinateur le {d}', {d: fmtDate(r.fetched_at)}) : T('lu en ligne le {d}', {d: fmtDate(r.fetched_at)})) : '';
        return `<p class="cplus-src">${T('Source :')} ${ext_link(src.url, src.label)}${src.licence ? ` — ${esc(src.licence)}` : ''}${when ? ` · <span>${esc(when)}</span>` : ''}${r.stale ? ` · <span class="cplus-stale">${esc(T('hors ligne : réponse gardée'))}</span>` : ''}</p>`;
    }
    const qs = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))));
    const placeQuery = p => qs({place_id: Number(p?.id || p?.place_id) || '', name: p?.name || '', lat: p?.lat ?? p?.latitude, lon: p?.lon ?? p?.longitude, insee: p?.insee || '', qid: p?.qid || '', country: p?.country || '', county: p?.county || ''});
    const memo = new Map(); // même question pendant la session : une seule demande au serveur
    function ask(action, q) { const k = action + JSON.stringify(q); if (!memo.has(k)) memo.set(k, api(action, q).catch(e => { memo.delete(k); return {ok: false, message: e.message}; })); return memo.get(k); }

    /* ═════════ 1. 🪦 cimetières ═════════ */
    const KIND = {war: '🎖', churchyard: '⛪', cemetery: '🪦'};
    function cemeteryRows(r) {
        return `<ul class="cplus-cem">${r.items.map(it => `<li><span class="cplus-ico" aria-hidden="true">${KIND[it.kind] || '🪦'}</span><div><b>${esc(it.name || (it.kind === 'churchyard' ? T('Cimetière autour de l’église (sans nom sur la carte)') : T('Cimetière (sans nom sur la carte)')))}</b>
            <small>${esc(fmtKm(it.km))}${it.religion_label ? ` · ${esc(T(it.religion_label))}` : ''}${it.kind === 'war' ? ` · ${esc(T('cimetière militaire'))}` : ''}</small></div>
            <span class="cplus-links">${ext_link(it.route, T('itinéraire ↗'))} · ${ext_link(it.url, T('carte ↗'))}</span></li>`).join('')}</ul>`;
    }
    async function fillCemeteries(host, place, {map = null} = {}) {
        host.innerHTML = wait(T('On cherche les cimetières autour…'));
        const r = await ask('cplus_cemeteries', placeQuery(place));
        if (!host.isConnected) return r;
        if (!r.ok) { if (r.offline) host.innerHTML = failHtml(r, T('les cimetières')); else vanish(host); return r; }
        if (!r.items.length) { vanish(host); return r; }
        const first = r.items[0], km = Math.round((r.radius || 5000) / 1000);
        const sentence = r.items.length === 1 ? T('Un cimetière à moins de {k} km : {n} ({d}).', {k: km, n: first.name || T('sans nom sur la carte'), d: fmtKm(first.km)})
            : T('{c} cimetières à moins de {k} km ; le plus proche : {n} ({d}).', {c: r.items.length, k: km, n: first.name || T('sans nom sur la carte'), d: fmtKm(first.km)});
        host.innerHTML = `<p class="cplus-lead">🪦 ${esc(sentence)} ${ext_link(first.route, T('itinéraire ↗'))}</p>${more(cemeteryRows(r) + sourceLine(r), r.items.length)}`;
        if (map) pinsOnMap(map, r);
        return r;
    }
    /** les 🪦 sur la carte du village (heritage-more.js : tuiles de 256 px centrées sur la commune, zoom de st.hVillageZoom) */
    function pinsOnMap(map, r) {
        const X = A(); if (!X.lngToX || !X.latToY || !r.place) return;
        map.querySelectorAll('.cplus-pin').forEach(n => n.remove());
        const z = Number(X.state?.hVillageZoom) || 13, cx = X.lngToX(r.place.lon, z), cy = X.latToY(r.place.lat, z);
        const w = map.clientWidth || 760, h = map.clientHeight || 420;
        r.items.forEach(it => {
            const dx = X.lngToX(it.lon, z) - cx, dy = X.latToY(it.lat, z) - cy;
            if (Math.abs(dx) > w / 2 - 6 || Math.abs(dy) > h / 2 - 6) return;
            map.insertAdjacentHTML('beforeend', `<a class="cplus-pin" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer" style="left:calc(50% + ${Math.round(dx)}px);top:calc(50% + ${Math.round(dy)}px)" title="${esc((it.name || T('Cimetière')) + ' · ' + fmtKm(it.km))}">🪦</a>`);
        });
    }

    /* ═════════ 2. 🖼️ images anciennes ═════════ */
    const imgCache = new Map();
    function imageCard(it, i, key) {
        const when = it.year ? T('Le village en {y}', {y: String(it.year)}) : T('Carte postale ancienne (sans date)');
        return `<figure class="cplus-img"><a href="${esc(it.page)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Voir sur Wikimedia Commons'))}"><img loading="lazy" alt="${esc(it.title)}" src="${esc(it.thumb)}" onerror="this.closest('figure').classList.add('is-noimg')"></a>
            <figcaption><b>${esc(when)}</b><span class="cplus-img-t">${esc(it.title)}</span><small>${it.author ? `${esc(it.author)} · ` : ''}${it.licence_url ? ext_link(it.licence_url, it.licence) : esc(it.licence)}</small>
            ${kiosk() ? '' : `<button type="button" class="button small secondary" data-cplus-keep="${i}" data-cplus-key="${esc(key)}">${esc(T('＋ Garder dans les médias'))}</button>`}</figcaption></figure>`;
    }
    async function fillImages(host, place) {
        host.innerHTML = wait(T('On cherche les images anciennes…'));
        const r = await ask('cplus_images', placeQuery(place));
        if (!host.isConnected) return r;
        if (!r.ok) { if (r.offline) host.innerHTML = failHtml(r, T('les images anciennes')); else vanish(host); return r; }
        if (!r.items.length) { vanish(host); return r; }
        const key = `${r.commune?.qid || ''}`; imgCache.set(key, {items: r.items, place});
        const old = r.items.find(x => x.year);
        const sentence = old ? T('{c} images anciennes libres de droits ; la plus ancienne : {y}.', {c: r.items.length, y: String(old.year)}) : T('{c} cartes postales anciennes libres de droits.', {c: r.items.length});
        const N = 6, cards = r.items.map((it, i) => imageCard(it, i, key));
        host.innerHTML = `<p class="cplus-lead">🖼️ ${esc(sentence)}</p><div class="cplus-strip">${cards.slice(0, N).join('')}</div>${more(`${cards.length > N ? `<div class="cplus-strip">${cards.slice(N).join('')}</div>` : ''}${sourceLine(r)}`, cards.length > N ? cards.length - N : 0)}`;
        return r;
    }
    async function keepImage(btn) {
        const g = imgCache.get(btn.dataset.cplusKey); const it = g?.items?.[Number(btn.dataset.cplusKeep)]; if (!it) return;
        btn.disabled = true; const label = btn.textContent; btn.textContent = T('…');
        try {
            const r = await api('cplus_keep', {}, {method: 'POST', body: {file: it.file, place_name: g.place?.name || ''}});
            const res = r.result || r;
            btn.textContent = T('✓ Dans les médias');
            const undo = async () => { await api('cplus_keep_undo', {}, {method: 'POST', body: {batch: res.batch}}); if (btn.isConnected) { btn.disabled = false; btn.textContent = label; } };
            A().undoToast ? A().undoToast(T('Image rangée dans les médias, avec son auteur et sa licence ({l}).', {l: res.licence || it.licence}), {undo, icon: '🖼️'}) : A().toast?.(T('Image rangée dans les médias.'));
        } catch (e) { btn.disabled = false; btn.textContent = label; A().toast?.(e.message, 'error'); }
    }

    /* ═════════ 3. ⛪ l'église et son saint patron ═════════ */
    function churchLine(c) {
        const saints = (c.saints || []).filter(s => s.label);
        const who = saints.map(s => `${s.label}${s.feast?.length ? T(', fêté le {d}', {d: s.feast[0]}) : ''}`).join(' ; ');
        return `⛪ ${c.label}${c.when ? ` (${c.when})` : ''}${c.gone ? ` ${T('(disparue)')}` : ''}${who ? ` — ${T(saints.length > 1 ? 'saints patrons :' : 'saint patron :')} ${who}` : ''}`;
    }
    function churchHtml(r) {
        if (!r.ok) return r.offline ? failHtml(r, T('l’église et son saint patron')) : '';
        if (!r.churches?.length) return '';
        const [first, ...rest] = r.churches;
        const row = (c, big) => `<div class="cplus-church${big ? ' is-main' : ''}">${big && c.thumb ? `<a href="${esc(c.image_page)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" alt="" src="${esc(c.thumb)}" onerror="this.remove()"></a>` : ''}
            <p>${esc(churchLine(c))} <small>${ext_link(c.url, T('Wikidata ↗'))}</small></p></div>`;
        return row(first, true) + more((rest.length ? `<p class="muted">${esc(T('Les autres églises et chapelles :'))}</p>${rest.map(c => row(c, false)).join('')}` : '') + sourceLine(r), rest.length);
    }
    /** pour les autres blocs (ex. « Patrimoine », lieux-patrimoine) : place = {id?, name, lat?, lon?, insee?, qid?} */
    async function church(place) {
        const r = await ask('cplus_church', placeQuery(place));
        return {...r, line: r.ok && r.churches?.length ? churchLine(r.churches[0]) : '', html: churchHtml(r)};
    }
    async function churchInto(host, place) { if (!host) return null; host.innerHTML = wait(T('On cherche l’église…')); const r = await church(place); if (host.isConnected) { if (r.html) host.innerHTML = r.html; else vanish(host); } return r; }

    /* ═════════ 4. 📰 journaux anciens à l'étranger ═════════ */
    const COUNTRY = [
        ['us', /^(us|usa|u\.s\.a?\.?|[ée]tats?[- ]unis|united states|am[ée]rique|america)\b/i, 'États-Unis'],
        ['nl', /^(nl|pays[- ]bas|netherlands|nederland|hollande)\b/i, 'Pays-Bas'],
        ['be', /^(be|belgique|belgium|belgi[eë])\b/i, 'Belgique'],
        ['at', /^(at|autriche|austria|[öo]sterreich)\b/i, 'Autriche'],
        ['de', /^(de|allemagne|germany|deutschland)\b/i, 'Allemagne'],
        ['cz', /^(cz|tch[ée]quie|r[ée]publique tch[eè]que|boh[êe]me|czech)/i, 'Bohême'],
        ['hu', /^(hu|hongrie|hungary)\b/i, 'Hongrie'],
        ['it', /^(it|italie|italy|italia)\b/i, 'Italie'],
        ['ca', /^(ca|canada)\b/i, 'Canada']];
    const isFrance = c => !c || /^(fr|france|fra)\b/i.test(String(c).trim());
    const countryOf = c => COUNTRY.find(x => x[1].test(String(c || '').trim()));
    /** la personne : {first, last, y1, y2, abroad:[{code, label, tag, place}]} depuis une fiche (detail) ou un objet personne */
    function personInfo(person) {
        const p = person?.person || person || {}, evs = person?.events || p.events || [];
        const yearOf = e => Number(e.year) || Number(String(e.sort_date || e.date_text || '').match(/\b(1[5-9]\d\d|20\d\d)\b/)?.[1]) || 0;
        const tag = e => String(e.gedcom_tag || e.tag || '').toUpperCase();
        const by = Number(p.birth_year) || yearOf(evs.find(e => ['BIRT', 'BAPM', 'CHR'].includes(tag(e))) || {}), dy = Number(p.death_year) || yearOf(evs.find(e => ['DEAT', 'BURI'].includes(tag(e))) || {});
        const abroad = [];
        evs.forEach(e => {
            if (!e.place_name && !e.country) return;
            if (isFrance(e.country)) return;
            const c = countryOf(e.country); abroad.push({code: c ? c[0] : 'xx', label: c ? c[2] : e.country, tag: tag(e), place: e.place_name || '', state: e.state || '', year: yearOf(e)});
        });
        return {first: String(p.first_name || '').trim().split(/\s+/)[0] || '', last: String(p.last_name || p.surname || '').trim(), y1: by, y2: dy, abroad, living: p.living_status === 'living', private: Number(p.is_private) === 1};
    }
    /** les liens de recherche (rien n'est envoyé tant qu'on ne clique pas) : [{id, title, url, why}] — les plus utiles d'abord */
    function newspapers(person) {
        const P = personInfo(person); if (!P.last) return [];
        const from = P.y1 ? Math.max(1756, P.y1 + 10) : 1756, to = P.y2 ? Math.min(1963, P.y2 + 2) : 1963;
        const name = `"${P.last.replace(/"/g, '')}"`, codes = new Set(P.abroad.map(a => a.code));
        const where = code => { const a = P.abroad.find(x => x.code === code); return a ? (a.place ? `${a.place}, ${T(a.label)}` : T(a.label)) : ''; };
        const out = [];
        const us = codes.has('us') || codes.has('ca');
        out.push({id: 'chronicling_america', title: T('🇺🇸 Chronicling America — journaux des États-Unis (1756–1963)'), rank: us ? 0 : 3,
            url: `https://www.loc.gov/collections/chronicling-america/?${new URLSearchParams({q: name, ...(from <= to ? {dates: `${from}/${to}`} : {})})}`,
            why: us ? T('A vécu ou est mort aux États-Unis ou au Canada ({w}) : les journaux locaux annonçaient arrivées, mariages, décès.', {w: where(codes.has('us') ? 'us' : 'ca')}) : T('Journaux américains numérisés et libres : les émigrés français y paraissent souvent (nom cherché entre guillemets).')});
        const nl = codes.has('nl') || codes.has('be');
        out.push({id: 'delpher', title: T('🇳🇱 Delpher — journaux des Pays-Bas'), rank: nl ? 0 : 4,
            url: `https://www.delpher.nl/nl/kranten/results?${new URLSearchParams({query: name, coll: 'ddd'})}`,
            why: nl ? T('A vécu aux Pays-Bas ou en Belgique ({w}) : les journaux néerlandais numérisés par la KB.', {w: where(codes.has('nl') ? 'nl' : 'be')}) : T('Journaux néerlandais numérisés par la Bibliothèque royale des Pays-Bas.')});
        const at = ['at', 'de', 'cz', 'hu', 'it'].some(c => codes.has(c));
        out.push({id: 'anno', title: T('🇦🇹 ANNO — journaux d’Autriche (Bibliothèque nationale)'), rank: at ? 0 : 5,
            url: `https://anno.onb.ac.at/anno-suche#searchMode=simple&query=${encodeURIComponent(name)}&from=1`,
            why: at ? T('A vécu dans l’ancien Empire d’Autriche ou près de lui ({w}) : journaux en allemand de Vienne et des provinces.', {w: where(['at', 'de', 'cz', 'hu', 'it'].find(c => codes.has(c)))}) : T('Journaux autrichiens numérisés, surtout en allemand.')});
        return out.sort((a, b) => a.rank - b.rank).map(({rank, ...e}) => e);
    }
    async function fillNewspapers(host, detail) {
        const pid = Number(detail?.person?.id) || 0, P = personInfo(detail);
        const links = newspapers(detail);
        const li = e => `<li data-cplus-news="${esc(e.id)}"><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(e.title)}</b> ↗</a><small>${esc(e.why)}</small>${e.id === 'chronicling_america' ? '<div class="cplus-hits" data-cplus-hits></div>' : ''}</li>`;
        const a = P.abroad.find(x => ['DEAT', 'BURI'].includes(x.tag)) || P.abroad[0];
        const lead = a ? T('{w} : ses traces sont peut-être dans les journaux anciens libres de ce pays.', {w: a.place ? `${a.place} (${T(a.label)})` : T(a.label)}) : '';
        host.innerHTML = `${lead ? `<p class="cplus-lead">📰 ${esc(lead)}</p>` : ''}<ul class="cplus-news">${li(links[0])}</ul>${more(`<ul class="cplus-news">${links.slice(1).map(li).join('')}</ul>`, links.length - 1)}`;
        const box = host.querySelector('[data-cplus-hits]'); if (!box || !pid || P.private) return;
        box.innerHTML = wait(T('On compte les pages où le nom paraît…'));
        const usState = P.abroad.find(a => a.code === 'us' && a.state)?.state || '';
        const r = await ask('cplus_newspapers', qs({person_id: pid, state: usState}));
        if (!box.isConnected) return;
        if (!r.ok) { box.innerHTML = r.offline ? `<p class="cplus-off">📴 ${esc(T('Pas de connexion : le nombre de pages s’affichera quand tu seras connecté. Les liens marchent dès que tu l’es.'))}</p>` : `<p class="muted">${esc(r.message || '')}</p>`; return; }
        if (r.out_of_range) { box.innerHTML = `<p class="muted">${esc(T('Sa vie est hors des années couvertes (1756–1963).'))}</p>`; return; }
        box.innerHTML = `<p>${esc(r.total ? T('Le nom « {n} » paraît sur {c} pages entre {a} et {b} (ce peut être un homonyme) :', {n: P.last, c: r.total.toLocaleString('fr-FR'), a: String(r.from), b: String(r.to)}) : T('Le nom « {n} » ne paraît sur aucune page entre {a} et {b}.', {n: P.last, a: String(r.from), b: String(r.to)}))}</p>
            ${r.items.length ? `<ul>${r.items.slice(0, 5).map(x => `<li>${ext_link(x.url, `${x.title}${x.date ? ', ' + x.date : ''}`)}${x.place ? ` <small class="muted">${esc(x.place)}</small>` : ''}</li>`).join('')}</ul>` : ''}${sourceLine(r)}`;
    }

    /* ═════════ les blocs de la fiche personne ═════════ */
    ext.personBlocks = ext.personBlocks || {};
    const placed = e => e && e.latitude != null && e.latitude !== '' && e.longitude != null && e.longitude !== '';
    const lastPlace = detail => {
        const evs = (detail?.events || []).filter(e => !e.is_private || !detail.person?.kiosk);
        const e = evs.find(x => /^(BURI|CREM)$/.test(x.gedcom_tag || '') && placed(x)) || evs.find(x => x.gedcom_tag === 'DEAT' && placed(x));
        return e ? {id: Number(e.place_id) || 0, name: e.place_name || '', lat: Number(e.latitude), lon: Number(e.longitude)} : null;
    };
    const details = new Map();
    ext.personBlocks.cplus_cemeteries = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !on('person_cemeteries')) return '';
        const pl = lastPlace(detail); if (!pl) return '';
        details.set(Number(p.id), detail);
        return A().card(index, T('🪦 Cimetières près de {p}', {p: pl.name || T('son dernier lieu')}), '', `<div class="cplus-block" data-cplus-pcem="${Number(p.id)}"></div>`, 'span-6');
    };
    ext.personBlocks.cplus_newspapers = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !on('newspapers')) return '';
        const P = personInfo(detail); if (!P.last || !P.abroad.some(a => ['DEAT', 'BURI', 'RESI', 'IMMI', 'CENS', 'NATU'].includes(a.tag))) return '';
        details.set(Number(p.id), detail);
        return A().card(index, T('📰 Journaux anciens à l’étranger'), '', `<div class="cplus-block" data-cplus-pnews="${Number(p.id)}"></div>`, 'span-6');
    };
    (ext.afterPerson = ext.afterPerson || []).push(detail => {
        const ws = document.getElementById('workspace'); if (!ws) return;
        ws.querySelectorAll('[data-cplus-pcem]').forEach(h => { const d = details.get(Number(h.dataset.cplusPcem)); const pl = d && lastPlace(d); if (pl) fillCemeteries(h, pl); });
        ws.querySelectorAll('[data-cplus-pnews]').forEach(h => { const d = details.get(Number(h.dataset.cplusPnews)); if (d) fillNewspapers(h, d); });
    });

    /* ═════════ la fiche d'un village et la monographie de commune ═════════ */
    function section(id, title, sub) { return `<section class="maintenance-panel cplus-panel" data-cplus-part="${id}"><h3>${esc(title)}${sub ? ` <small class="muted">${esc(sub)}</small>` : ''}</h3><div data-cplus-body></div></section>`; }
    function partsHtml({church = true} = {}) {
        const s = settings(), out = [];
        if (s.church && church) out.push(section('church', T('⛪ L’église et son saint patron'), ''));
        if (s.cemeteries) out.push(section('cemeteries', T('🪦 Cimetières autour du village'), T('à moins de 5 km')));
        if (s.images) out.push(section('images', T('🖼️ Images anciennes de la commune'), T('les plus anciennes d’abord')));
        return out.length ? `<div class="cplus-place">${out.join('')}</div>` : '';
    }
    function fillParts(box, place, map) {
        box.querySelectorAll('[data-cplus-part]').forEach(sec => {
            const body = sec.querySelector('[data-cplus-body]'), k = sec.dataset.cplusPart;
            if (k === 'church') churchInto(body, place); else if (k === 'cemeteries') fillCemeteries(body, place, {map}); else if (k === 'images') fillImages(body, place);
        });
    }
    function decorate(root = document) {
        const ws = root.querySelector?.('#workspace') || document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-cplus])');
        if (village) {
            village.dataset.cplus = '1';
            const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
            const name = pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim();
            const place = {id: Number(pli?.dataset.pliPlace) || 0, name, lat: pli?.dataset.pliLat !== '' ? Number(pli?.dataset.pliLat) : null, lon: pli?.dataset.pliLon !== '' ? Number(pli?.dataset.pliLon) : null,
                insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || village.querySelector('[data-cad-insee]')?.dataset.cadInsee || ''};
            if (!name) return;
            // ⛪ dans le panneau « Église et paroisse » de la fiche, là où l'on regarde déjà
            const churchPanel = village.querySelector('[data-vsec="church"]');
            if (churchPanel && on('church')) { churchPanel.insertAdjacentHTML('beforeend', `<div class="cplus-inpanel" data-cplus-church-in><h4>${esc(T('D’après Wikidata'))}</h4><div data-cplus-body></div></div>`); churchInto(churchPanel.querySelector('[data-cplus-church-in] [data-cplus-body]'), place); }
            const html = partsHtml({church: !churchPanel}); if (!html) return;
            const anchor = village.querySelector('.h-village-grid') || village.querySelector('[data-vsec="stats"]');
            if (anchor) anchor.insertAdjacentHTML('afterend', html); else village.insertAdjacentHTML('beforeend', html);
            fillParts(village.querySelector('.cplus-place'), place, village.querySelector('.h-village-map'));
            return;
        }
        // la Monographie de commune : des parties déclarées (LCNDA_EXT.monographSections, plus bas), pas d'insertion ici
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; try { decorate(); } catch (e) { console.error(e); } }); }).observe(document.documentElement, {childList: true, subtree: true});

    document.addEventListener('click', e => {
        const k = e.target.closest?.('[data-cplus-keep]'); if (k) { e.preventDefault(); keepImage(k); return; }
        if (e.target.closest?.('[data-cplus-clear]')) { clearCache(); }
    });
    document.addEventListener('change', e => { const t = e.target.closest?.('[data-cplus-tg]'); if (t && e.target.matches('input')) { const s = settings(); s[t.dataset.cplusTg] = e.target.checked; save(s); register(); } });

    /* ═════════ Réglages → 🪦 Autour du village (en ligne) ═════════ */
    async function clearCache() {
        try {
            const r = await api('cplus_cache_clear', {}, {method: 'POST', body: {}}); const res = r.result || r;
            memo.clear(); drawSettings();
            A().undoToast?.(T('Réponses gardées effacées ({n}).', {n: res.removed}), {undo: async () => { await api('cplus_cache_restore', {}, {method: 'POST', body: {token: res.token}}); drawSettings(); }});
        } catch (err) { A().toast?.(err.message, 'error'); }
    }
    ext.maintenance = ext.maintenance || {};
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        let about = {sources: [], cache: {count: 0, bytes: 0}};
        try { about = await api('cplus_about'); } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        if (A().state?.maintenanceTab !== TAB[0] && token === undefined && !ws.querySelector('[data-cplus-settings]')) return;
        const s = settings();
        const tg = ([k, label, sub]) => `<label class="checkbox-line cplus-tg" data-cplus-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const rows = about.sources.map(x => `<tr><td>${ext_link(x.url, x.label)}</td><td>${esc(x.what)}</td><td>${esc(x.licence)}</td><td>${esc(x.mention)}</td></tr>`).join('');
        const kb = Math.max(1, Math.round((about.cache?.bytes || 0) / 1024));
        ws.innerHTML = `<section class="page cplus-settings" data-cplus-settings>${UI().pageHeader ? UI().pageHeader({title: T('Autour du village (en ligne)'), help: esc(T('Des recherches sur Internet, faites seulement quand tu ouvres une fiche de village ou de personne, puis gardées sur l’ordinateur.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('Gardé sur l’ordinateur'))}</h3><p>${esc(T('{n} réponses gardées ({k} Ko). Sans Internet, ce sont elles qui s’affichent.', {n: about.cache?.count || 0, k: kb}))}</p>
                <div class="page-actions"><button type="button" class="button secondary" data-cplus-clear ${about.cache?.count && !kiosk() ? '' : 'disabled'}>${esc(T('🗑 Effacer les réponses gardées'))}</button></div></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Source'))}</th><th>${esc(T('Ce qu’elle donne'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Mention'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
                <p class="muted">${esc(T('Ce qui part sur Internet : le nom et la position du lieu ; pour les journaux, le nom de famille et les années (jamais pour une fiche confidentielle). Rien n’est envoyé tant que tu n’ouvres pas le bloc.'))}</p></div></section>`;
    }
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    /* ═════════ l'onglet des Réglages et les blocs de fiche ═════════ */
    function register() {
        const app = A();
        const tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { const i = tabs.findIndex(t => t[0] === 'histoire'); const j = i >= 0 ? i : tabs.findIndex(t => t[0] === 'meteo'); tabs.splice(j < 0 ? tabs.length : j + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B)) {
            [['cplus_cemeteries', '🪦 Cimetières près de son dernier lieu'], ['cplus_newspapers', '📰 Journaux anciens à l’étranger']].forEach(row => {
                if (B.some(b => b[0] === row[0])) return;
                // dans la zone « contexte » de la fiche, à côté de « 🌍 Le monde autour » et « 🏘 Le lieu à son époque »
                const after = ['cplus_cemeteries', 'histoire', 'world', 'lune', 'meteo'].map(k => B.findIndex(b => b[0] === k)).find(i => i >= 0);
                B.splice(after === undefined ? B.length : after + 1, 0, row);
            });
        }
        if (app.defaultPersonBlockSpans) { app.defaultPersonBlockSpans.cplus_cemeteries ||= '6'; app.defaultPersonBlockSpans.cplus_newspapers ||= '6'; }
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    /* ═════════ 📜 Monographie de commune : trois parties (ordre, affichage, impression gérés par heritage-monographie-plus.js) ═════════ */
    const monoPlace = pl => ({id: Number(pl?.id) || 0, name: pl?.name || '', lat: pl?.latitude ?? pl?.lat ?? null, lon: pl?.longitude ?? pl?.lon ?? null, country: pl?.country || '', county: pl?.county || ''});
    const monoRun = fill => async (place, host, ctx) => {
        let insee = ''; try { insee = (await ctx?.village?.())?.insee || ''; } catch (_) {}
        await fill(host, {...monoPlace(place), insee});
        return !!host.textContent.trim();
    };
    (ext.monographSections = ext.monographSections || []).push(
        {id: 'cplus_church', icon: '⛪', label: T('L’église et son saint patron'), group: 'Le lieu', defaultOn: true, enabled: () => on('church'), render: monoRun(churchInto)},
        {id: 'cplus_cemeteries', icon: '🪦', label: T('Cimetières autour du village'), group: 'Le lieu', defaultOn: true, enabled: () => on('cemeteries'), render: monoRun((h, pl) => fillCemeteries(h, pl))},
        {id: 'cplus_images', icon: '🖼️', label: T('Images anciennes de la commune'), group: 'Le lieu', defaultOn: true, enabled: () => on('images'), render: monoRun(fillImages)});

    /* ═════════ 🧰 le registre commun des données : à la demande, pour n'importe quel lieu ou personne ═════════ */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null, insee: pl.insee || pl.admin4_code || '', country: pl.country || ''} : null);
    async function personDetail(person) {
        if (person?.person && person?.events) return person;
        const id = Number(person?.id || person); if (!id) return null;
        try { return await api('person', {id}); } catch (_) { return null; }
    }
    const hostDiv = host => { host.innerHTML = '<div class="cplus-block"></div>'; return host.firstElementChild; };
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'commune_plus_cemeteries', icon: '🪦', label: T('Cimetières autour du village'), group: 'Le lieu', needs: ['place'], online: true,
            run: async (ctx, host) => { const r = await fillCemeteries(hostDiv(host), placeOfCtx(ctx.place)); if (host.isConnected && !host.textContent.trim()) host.innerHTML = emptyLine(r?.noplace ? r.message : T('Aucun cimetière connu d’OpenStreetMap à moins de 5 km.'), '🪦'); return r; }},
        {id: 'commune_plus_images', icon: '🖼️', label: T('Images anciennes de la commune'), group: 'Le lieu', needs: ['place'], online: true,
            run: async (ctx, host) => { const r = await fillImages(hostDiv(host), placeOfCtx(ctx.place)); if (host.isConnected && !host.textContent.trim()) host.innerHTML = emptyLine(T('Aucune image datée d’avant 1960 dans la catégorie Commons de la commune.'), '🖼️'); return r; }},
        {id: 'commune_plus_church', icon: '⛪', label: T('Saint patron de l’église'), group: 'Le lieu', needs: ['place'], online: true,
            run: async (ctx, host) => { const r = await churchInto(hostDiv(host), placeOfCtx(ctx.place)); if (host.isConnected && !host.textContent.trim()) host.innerHTML = emptyLine(T('Aucune église de cette commune n’est décrite sur Wikidata.'), '⛪'); return r; }},
        {id: 'commune_plus_newspapers', icon: '📰', label: T('Journaux anciens à l’étranger'), group: 'Chercher', needs: ['person'], online: true,
            run: async (ctx, host) => { const d = await personDetail(ctx.person); if (!d) { host.innerHTML = emptyLine(T('Choisis une personne.')); return; } return fillNewspapers(hostDiv(host), d); }});

    /* ═════════ 📋 Listes : les données gardées, en lignes (moteur commun app-listes-donnees.js) ═════════ */
    const listRows = async (kind, extra = {}) => { const r = await api('cplus_list', {kind, ...extra}); return r.rows || []; };
    const openUrl = row => { if (row?.url) window.open(row.url, '_blank', 'noopener'); };
    const geo = row => (row.lat != null && row.lon != null ? [Number(row.lat), Number(row.lon)] : null);
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'cplus_cemeteries', icon: '🪦', label: T('Cimetières autour des lieux de la famille'), group: 'Le lieu', source: '© OpenStreetMap contributors (ODbL 1.0)', sourceUrl: 'https://www.openstreetmap.org/copyright',
            load: async () => listRows('cemeteries', {fetch: 1}),
            fields: [{key: 'name', label: T('Cimetière'), type: 'text'}, {key: 'near', label: T('Près de'), type: 'place'}, {key: 'km', label: T('Distance (km)'), type: 'number'},
                {key: 'religion', label: T('Religion'), type: 'enum'}, {key: 'kind', label: T('Sorte'), type: 'enum'}],
            geo, open: openUrl},
        {id: 'cplus_images', icon: '🖼️', label: T('Images anciennes des communes'), group: 'Le lieu', source: 'Wikimedia Commons (licence de chaque image)', sourceUrl: 'https://commons.wikimedia.org/',
            load: async () => listRows('images'),
            fields: [{key: 'title', label: T('Image'), type: 'text'}, {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'year', label: T('Année'), type: 'year'},
                {key: 'postcard', label: T('Carte postale'), type: 'enum', values: [T('oui'), T('non')]}, {key: 'author', label: T('Auteur'), type: 'text'}, {key: 'licence', label: T('Licence'), type: 'enum'}],
            period: row => (row.year ? [row.year, row.year] : null), geo, open: openUrl},
        {id: 'cplus_churches', icon: '⛪', label: T('Églises et saints patrons'), group: 'Le lieu', source: 'Wikidata (CC0 1.0)', sourceUrl: 'https://www.wikidata.org/',
            load: async () => listRows('churches'),
            fields: [{key: 'name', label: T('Église'), type: 'text'}, {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'when', label: T('Époque'), type: 'text'},
                {key: 'saint', label: T('Saint patron'), type: 'text'}, {key: 'feast', label: T('Fêté le'), type: 'text'}, {key: 'gone', label: T('Disparue'), type: 'enum'}],
            period: row => (row.year ? [row.year, null] : null), geo, open: openUrl},
        {id: 'cplus_newspapers', icon: '📰', label: T('Journaux anciens à l’étranger (pages trouvées)'), group: 'Chercher', source: 'Chronicling America — Library of Congress', sourceUrl: 'https://www.loc.gov/collections/chronicling-america/',
            load: async () => listRows('newspapers'),
            fields: [{key: 'name', label: T('Nom cherché'), type: 'text'}, {key: 'title', label: T('Journal'), type: 'text'}, {key: 'date', label: T('Date'), type: 'text'}, {key: 'year', label: T('Année'), type: 'year'},
                {key: 'place', label: T('Ville'), type: 'text'}, {key: 'language', label: T('Langue'), type: 'enum'}],
            period: row => (row.year ? [row.year, row.year] : null), open: openUrl});

    ext.communePlus = {church, churchInto, churchLine, newspapers, personInfo, fillCemeteries, fillImages, settings, decorate};
})();
