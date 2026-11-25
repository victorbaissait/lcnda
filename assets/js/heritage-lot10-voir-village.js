/**
 * LCNDA — 🖼️ Voir son village comme il le voyait (lot 10).
 * Rien n'est livré avec l'app : tout est demandé en ligne pour UN lieu, à la demande, et gardé sur l'ordinateur (lib/lot10_voir_village.php) ;
 * les photos d'avion, le relief LiDAR et les cartes de 1850 sont des tuiles WMTS de la Géoplateforme affichées par l'écran (rien n'est copié).
 *   🖼️ tableaux   peintures qui représentent la commune (base Joconde, POP ; notice + lien, l'image n'est pas reprise : droits des musées)
 *   📷 photos     photos datées 1850–1950 de la commune (base Mémoire, POP ; notice + lien, la photo n'est pas reprise : droits réservés)
 *   ✈️ avion      le village vu d'avion vers 1950 (IGN, BD ORTHO® Historique) à côté de la photo d'aujourd'hui (IGN, BD ORTHO®)
 *   🏔 vue        sommets et clochers visibles depuis chez lui (Wikidata + relief IGN RGE ALTI®), calculé à la demande, gardé
 *   🔍 lidar      les traces cachées autour du hameau : relief LiDAR HD de l'IGN (ombrage), à la demande
 *   🌳 forets     les bois de 1850 : encore là, disparus ou nouveaux (IGN, BD Forêts anciennes), et la carte d'État-major
 *   🏠 maisons    les maisons du hameau qui existent encore, avec leur année (IGN, BD TOPO®), à la demande
 *   🗺 voisins    cartes anciennes des pays voisins : liens vers les sites officiels (licences pas assez ouvertes pour plus)
 * Où : fiche d'une personne, bloc « 🖼️ Son village comme il le voyait » (une phrase par sujet, le détail sous « ▸ plus », les calculs
 * lourds sous « 🔭 À la demande ») ; fiche d'un village ; Monographie de commune ; Listes (ce qui a déjà été cherché) ; cartes
 * (LCNDA_EXT.mapLayerSources) ; à la demande (LCNDA_EXT.dataSources) ; « Où chercher » (POP et cartes des pays voisins) ;
 * Réglages → « 🖼️ Voir son village » (chaque sujet s'éteint, fonds de carte IGN à ajouter, réponses gardées, À propos des données).
 * localStorage : « genealogie-lot10-voir-village » (sujets). Rien ne part sur Internet pour une fiche confidentielle ou une personne vivante.
 *   window.LCNDA_EXT.voirVillage = {…}   (Node : module.exports = le calcul)
 * Essai : tests/test-lot10-voir-village.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const llOf = p => { const lat = num(p?.lat ?? p?.latitude), lon = num(p?.lon ?? p?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    const isFrance = p => !p?.country || /^(france|fr|fra|republique francaise)$/.test(fold(p.country));
    /** dans la zone des données de l'IGN (France métropolitaine et Corse) */
    const inFrance = ll => !!ll && ll.lat >= 41.2 && ll.lat <= 51.2 && ll.lon >= -5.3 && ll.lon <= 9.7;
    const COUNTRY = [['be', /^(belgique|belgie|belgium|belgien|be)$/], ['ch', /^(suisse|schweiz|switzerland|svizzera|ch)$/], ['nl', /^(pays-bas|pays bas|nederland|netherlands|holland|hollande|nl)$/], ['lu', /^(luxembourg|luxemburg|letzebuerg|lu)$/]];
    const neighbourOf = p => (COUNTRY.find(([, re]) => re.test(fold(p?.country || ''))) || [''])[0];

    /* ── la vie ── */
    function lifeSpan(life) {
        const ys = (life?.events || []).map(e => num(e.year)).filter(y => y !== null);
        const b = num(life?.person?.birth), d = num(life?.person?.death);
        const from = b ?? (ys.length ? Math.min(...ys) : null);
        return {birth: b, death: d, from, to: d ?? (ys.length ? Math.max(...ys) : from)};
    }
    /** « chez lui » : le lieu de France (avec sa position) où on le trouve le plus longtemps, sinon celui de sa naissance, sinon le premier */
    function homeOf(life) {
        const pls = (life?.places || []).map(p => ({...p, ll: llOf(p), from: num(p.from), to: num(p.to)})).filter(p => p.ll && isFrance(p) && inFrance(p.ll));
        if (!pls.length) return null;
        const birth = (life.events || []).find(e => ['BIRT', 'BAPM', 'CHR'].includes(String(e.tag || '').toUpperCase()) && e.place_id);
        const span = p => (p.from !== null && p.to !== null ? p.to - p.from : -1);
        return [...pls].sort((a, b) => span(b) - span(a) || Number(b.id === birth?.place_id) - Number(a.id === birth?.place_id))[0];
    }
    const overlaps = (a0, a1, b0, b1) => a0 !== null && b0 !== null && (a1 ?? a0) >= b0 && a0 <= (b1 ?? b0);
    /** les années de sa vie (élargies de pad) */
    const lifeRange = (life, pad = 0) => { const s = lifeSpan(life); return s.from === null ? null : [s.from - pad, (s.to ?? s.from + 80) + pad]; };
    /** 🖼️ les tableaux de son vivant (±pad ans), le plus proche de ses 25 ans d'abord */
    function paintingsForLife(items, life, pad = 5) {
        const r = lifeRange(life, pad), b = lifeSpan(life).birth; if (!r) return [];
        const mid = (b ?? r[0]) + 25;
        return items.filter(x => x.from !== null && (x.to ?? x.from) - x.from <= 30 && overlaps(x.from, x.to, r[0], r[1]))
            .sort((a, c) => Math.abs((a.from + (a.to ?? a.from)) / 2 - mid) - Math.abs((c.from + (c.to ?? c.from)) / 2 - mid));
    }
    /** 📷 les photos de son vivant, la plus proche de ses 20 ans d'abord */
    function photosForLife(items, life, pad = 3) {
        const r = lifeRange(life, pad), b = lifeSpan(life).birth; if (!r) return [];
        const mid = (b ?? r[0]) + 20;
        return items.filter(x => overlaps(x.from, x.to, r[0], r[1])).sort((a, c) => Math.abs(a.from - mid) - Math.abs(c.from - mid));
    }
    /** ✈️ les photos de 1950-1965 lui parlent-elles ? (il a vécu entre 1935 et 1980) */
    const aerialFits = life => { const r = lifeRange(life); return !!r && r[1] >= 1935 && r[0] <= 1965; };
    /** 🌳 la carte de 1850 lui parle-t-elle ? (il a vécu avant 1920) */
    const forestFits = life => { const r = lifeRange(life); return !!r && r[0] <= 1920; };
    /** 🌳 ce que disent les pixels : {kind: 'lisiere'|'ancien'|'recul'|'avance'|'', …} */
    function forestStory(f) {
        if (!f?.ok || !f.ha) return {kind: ''};
        const H = f.ha, N = f.near || {};
        if (f.lisiere || (N.disparue !== null && N.disparue !== undefined && N.disparue <= 300)) return {kind: 'lisiere', m: N.disparue, dir: f.dir?.disparue, ha: H.disparue[2]};
        if (N.ancienne !== null && N.ancienne !== undefined && N.ancienne <= 600) return {kind: 'ancien', m: N.ancienne, dir: f.dir?.ancienne, ha: H.ancienne[2]};
        const was = (H.ancienne[2] || 0) + (H.disparue[2] || 0), now = (H.ancienne[2] || 0) + (H.recente[2] || 0);
        if (was >= 1 && was > now * 1.3) return {kind: 'recul', was, now};
        if (was >= 1 || now >= 1) return {kind: 'avance', was, now};
        return {kind: ''};
    }
    /** 🏠 les maisons debout de son vivant : bâties avant sa mort (ou la fin de ses années là) */
    function housesForLife(items, life, until = null) {
        const r = lifeRange(life); if (!r) return [];
        const end = until ?? r[1];
        return items.filter(x => x.year !== null && x.year <= end);
    }

    /* ── les tuiles (WMTS de la Géoplateforme, « PM » = Web Mercator) ── */
    const RAD = Math.PI / 180;
    function tileXY(lat, lon, z) { const n = 2 ** z; return {x: (lon + 180) / 360 * n, y: (1 - Math.log(Math.tan(lat * RAD) + 1 / Math.cos(lat * RAD)) / Math.PI) / 2 * n}; }
    /** les tuiles qui couvrent un cadre W×H centré sur le point : [{x, y, left, top}] */
    function mosaic(lat, lon, z, W, H) {
        const t = tileXY(lat, lon, z), px = t.x * 256, py = t.y * 256, out = [];
        for (let x = Math.floor((px - W / 2) / 256); x <= Math.floor((px + W / 2) / 256); x++) for (let y = Math.floor((py - H / 2) / 256); y <= Math.floor((py + H / 2) / 256); y++) out.push({x, y, left: Math.round(x * 256 - px + W / 2), top: Math.round(y * 256 - py + H / 2)});
        return out;
    }
    const LAYERS = {
        avion: {layer: 'ORTHOIMAGERY.ORTHOPHOTOS.1950-1965', fmt: 'image/png', z: [6, 18], label: 'Photographies aériennes 1950-1965 (IGN)'},
        today: {layer: 'HR.ORTHOIMAGERY.ORTHOPHOTOS', fmt: 'image/jpeg', z: [6, 19], label: 'Photographies aériennes d’aujourd’hui (IGN)'},
        lidar: {layer: 'IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW', fmt: 'image/png', z: [6, 18], label: 'Relief du terrain HD (MNT LiDAR HD, IGN)'},
        ombre: {layer: 'IGNF_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW', fmt: 'image/png', z: [6, 17], label: 'Estompage haute résolution (IGN)'},
        etatmajor: {layer: 'GEOGRAPHICALGRIDSYSTEMS.ETATMAJOR40', fmt: 'image/jpeg', z: [6, 15], label: 'Carte de l’état-major (1820-1866, IGN)'},
        forets: {layer: 'IGNF_FORETS-ANCIENNES', fmt: 'image/png', z: [6, 16], label: 'Forêts anciennes (IGN)'},
        plan: {layer: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', fmt: 'image/png', z: [6, 18], label: 'Plan IGN (aujourd’hui)'},
        ortho6580: {layer: 'ORTHOIMAGERY.ORTHOPHOTOS.1965-1980', fmt: 'image/png', z: [6, 18], label: 'Photographies aériennes 1965-1980 (IGN)'},
        ortho8095: {layer: 'ORTHOIMAGERY.ORTHOPHOTOS.1980-1995', fmt: 'image/png', z: [6, 18], label: 'Photographies aériennes 1980-1995 (IGN)'}};
    const wmts = (key, z, x, y) => { const L = LAYERS[key]; return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${encodeURIComponent(L.layer)}&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILECOL=${x}&TILEROW=${y}&FORMAT=${encodeURIComponent(L.fmt)}`; };
    const wmtsTemplate = key => wmts(key, '{z}', '{x}', '{y}');
    const DIRS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];
    const dirOf = b => DIRS[Math.round(((b % 360) + 360) % 360 / 45) % 8];

    const core = {num, fold, llOf, isFrance, inFrance, neighbourOf, lifeSpan, homeOf, paintingsForLife, photosForLife, aerialFits, forestFits, forestStory, housesForLife, tileXY, mosaic, wmts, wmtsTemplate, LAYERS, dirOf};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const KEY = 'genealogie-lot10-voir-village';
    const TAB = ['lot10_voir_village', '25l10', '🖼️ Voir son village'];
    const BLOCK = ['l10v_village', '🖼️ Son village comme il le voyait'];
    const PARTS = [
        ['tableaux', '🖼️ Les tableaux de son village', 'Les peintures des musées de France qui représentent la commune (base Joconde) ; sur sa fiche : celles peintes de son vivant.'],
        ['photos', '📷 Les photos anciennes de sa commune', 'Les photos datées de 1850 à 1950 de la Médiathèque du patrimoine (base Mémoire).'],
        ['avion', '✈️ Son village vu d’avion vers 1950', 'Les photos aériennes de l’IGN (1950-1965), avant le remembrement, à côté de celles d’aujourd’hui.'],
        ['forets', '🌳 Les forêts de 1850', 'Les bois de la carte d’État-major : encore là, disparus ou nouveaux. Vivait-il en lisière d’un bois disparu ?'],
        ['vue', '🏔 Ce qu’il voyait depuis chez lui', 'Les sommets et les clochers visibles, calculés avec le relief (à la demande).'],
        ['lidar', '🔍 Les traces cachées autour du hameau', 'Le relief laser LiDAR HD de l’IGN : anciens chemins, talus, mottes, charbonnières… (à la demande).'],
        ['maisons', '🏠 Les maisons de son temps encore debout', 'Les bâtiments du hameau qui existaient déjà, avec leur année (à la demande).'],
        ['voisins', '🗺 Les cartes anciennes des pays voisins', 'Pour un lieu de Belgique, de Suisse, des Pays-Bas ou du Luxembourg : les cartes anciennes officielles (liens).']];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
    const he = P => (P?.gender === 'female' ? T('elle') : P?.gender === 'male' ? T('il') : T('cette personne'));
    const He = P => cap(he(P));
    const ageTxt = n => (n <= 0 ? T('moins d’un an') : n === 1 ? T('1 an') : T('{n} ans', {n: String(n)}));
    const mTxt = m => (m >= 1000 ? T('{n} km', {n: String(Math.round(m / 100) / 10).replace('.', ',')}) : T('{n} m', {n: String(Math.round(m / 10) * 10)}));
    const haTxt = h => T('{n} ha', {n: String(Math.round(h * 10) / 10).replace('.', ',')});
    const link = (url, label) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label));
    const srcLink = (url, label = T('↗ source')) => (url ? `<a class="l10v-src" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(label)}</a>` : '');
    const row = (icon, html, src, extra = '', attrs = '') => `<div class="hist-row l10v-row"${attrs}><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n, attrs = '') => (html ? `<details class="l10v-more"${attrs}><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const hyp = t => `<small class="muted hist-hyp">${esc(t)}</small>`;
    const ageAt = (life, y) => { const b = lifeSpan(life).birth; return b !== null && y !== null && y >= b ? y - b : null; };

    /* ─────────── les sources (phrase courte + lien) ─────────── */
    const SRC = {
        tableaux: () => `${link('https://pop.culture.gouv.fr/donnees-ouvertes', T('base Joconde (POP, ministère de la Culture)'))} — ${esc(T('notices en Licence Ouverte 2.0 ; les images ne sont pas reprises (droits des musées)'))}`,
        photos: () => `${link('https://pop.culture.gouv.fr/donnees-ouvertes', T('base Mémoire, Médiathèque du patrimoine et de la photographie (POP)'))} — ${esc(T('notices en Licence Ouverte 2.0 ; les photos ne sont pas reprises (droits réservés)'))}`,
        avion: () => `${link('https://www.data.gouv.fr/datasets/bd-ortho-r-historique', T('IGN, BD ORTHO® Historique 1950-1965'))} ${esc(T('et BD ORTHO®'))} (${esc(T('Licence Ouverte 2.0'))})`,
        vue: () => `${link('https://www.wikidata.org', 'Wikidata')} (CC0) · ${link('https://www.data.gouv.fr/datasets/rge-alti-r', T('IGN, RGE ALTI®'))} (${esc(T('Licence Ouverte 2.0'))}) · ${esc(T('calcul de l’app'))}`,
        lidar: () => `${link('https://www.data.gouv.fr/datasets/mnt-lidar-hd', T('IGN, MNT LiDAR HD'))} (${esc(T('Licence Ouverte 2.0'))})`,
        forets: () => `${link('https://www.data.gouv.fr/datasets/bd-forets-anciennes', T('IGN, BD Forêts anciennes'))} ${esc(T('et carte d’État-major'))} (${esc(T('Licence Ouverte 2.0'))})`,
        maisons: () => `${link('https://www.data.gouv.fr/datasets/bd-topo-r', T('IGN, BD TOPO® (bâtiments)'))} (${esc(T('Licence Ouverte 2.0'))})`,
        voisins: () => esc(T('les sites officiels de chaque pays'))};
    const SRC_TXT = {tableaux: 'Base Joconde (POP) — notices Licence Ouverte 2.0', photos: 'Base Mémoire (POP) — notices Licence Ouverte 2.0', avion: 'IGN, BD ORTHO® Historique (Licence Ouverte 2.0)',
        vue: 'Wikidata (CC0) ; IGN RGE ALTI® (Licence Ouverte 2.0)', lidar: 'IGN, MNT LiDAR HD (Licence Ouverte 2.0)', forets: 'IGN, BD Forêts anciennes (Licence Ouverte 2.0)', maisons: 'IGN, BD TOPO® (Licence Ouverte 2.0)', voisins: 'Sites officiels (liens)'};

    /* ─────────── le serveur (réponses gardées) ─────────── */
    const memo = new Map();
    function ask(action, params) {
        const k = action + JSON.stringify(params);
        if (!memo.has(k)) memo.set(k, A().api(action, params).catch(e => { memo.delete(k); return {ok: false, message: e.message}; }));
        return memo.get(k);
    }
    const placeQ = (pl, pid) => {
        const ll = llOf(pl), q = {};
        if (pl?.id) q.place_id = pl.id; if (pl?.name) q.name = pl.name; if (pl?.insee) q.insee = pl.insee; if (pl?.county) q.county = pl.county; if (pl?.country) q.country = pl.country;
        if (ll) { q.lat = ll.lat; q.lon = ll.lon; } if (pid) q.pid = pid;
        return q;
    };
    const lifeMemo = new Map();
    const lifeOf = id => { if (!lifeMemo.has(id)) lifeMemo.set(id, A().api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };

    /* ─────────── 🖼️ les tableaux ─────────── */
    const who = x => (x.authors || []).slice(0, 2).join(', ');
    const paintLi = x => `<li><i>${esc(x.title)}</i>${who(x) ? ` — ${esc(who(x))}` : ''} <small class="muted">${esc([x.date, x.where].filter(Boolean).join(' · '))}</small> ${srcLink(x.url, T('↗ notice'))}</li>`;
    function tableauxHtml(R, life = null) {
        if (!R?.ok || !R.items?.length) return '';
        const name = R.place?.name || '', all = R.items;
        const hint = hyp(T('Les tableaux dont le titre, le sujet ou le lieu de création nomment {c} (base Joconde). Les images ont des droits : ouvre la notice pour les voir sur POP.', {c: name}));
        if (life) {
            const L = paintingsForLife(all, life); if (!L.length) return '';
            const x = L[0], a = ageAt(life, x.from), P = life.person;
            const lead = T('{c} peint de son vivant : {t}{w} ({d}){a}.', {c: esc(name), t: `<i>${esc(x.title)}</i>`, w: who(x) ? ` ${esc(T('par'))} ${esc(who(x))}` : '', d: esc(x.date),
                a: a !== null && a <= 110 ? ` — ${esc(T('{he} avait {n}', {he: he(P), n: ageTxt(a)}))}` : ''});
            return row('🖼️', `${lead} ${srcLink(x.url, T('↗ notice'))}`, SRC.tableaux(), more(`<ul class="hist-ul">${L.slice(1, 25).map(paintLi).join('')}</ul>${all.length > L.length ? `<p class="muted">${esc(T('{n} tableaux de {c} en tout, toutes époques.', {n: String(all.length), c: name}))} ${srcLink(R.search, T('↗ chercher sur POP'))}</p>` : ''}${hint}`, L.length > 1 ? L.length - 1 : null), ' data-l10v-part="tableaux"');
        }
        const first = all.find(x => x.from !== null) || all[0];
        const lead = all.length > 1 ? T('{n} tableaux des musées de France représentent {c} ; le plus ancien daté : {t}{w} ({d}).', {n: String(all.length), c: esc(name), t: `<i>${esc(first.title)}</i>`, w: who(first) ? ` ${esc(T('par'))} ${esc(who(first))}` : '', d: esc(first.date)})
            : T('Un tableau des musées de France représente {c} : {t}{w} ({d}).', {c: esc(name), t: `<i>${esc(first.title)}</i>`, w: who(first) ? ` ${esc(T('par'))} ${esc(who(first))}` : '', d: esc(first.date)});
        return row('🖼️', `${lead} ${srcLink(first.url, T('↗ notice'))}`, SRC.tableaux(), more(`<ul class="hist-ul">${all.slice(0, 80).map(paintLi).join('')}</ul>${srcLink(R.search, T('↗ chercher sur POP'))}${hint}`, all.length), ' data-l10v-part="tableaux"');
    }

    /* ─────────── 📷 les photos ─────────── */
    const photoLi = x => `<li>${esc(x.title)} <small class="muted">${esc([x.date, (x.authors || [])[0]].filter(Boolean).join(' · '))}</small> ${srcLink(x.url, T('↗ notice'))}</li>`;
    function photosHtml(R, life = null) {
        if (!R?.ok || !R.items?.length) return '';
        const name = R.place?.name || '', all = R.items;
        const hint = hyp(T('Photos de la Médiathèque du patrimoine et de la photographie : la notice (titre, date, photographe) est libre, la photo est sous droits — ouvre la notice pour la voir sur POP.'));
        if (life) {
            const L = photosForLife(all, life); if (!L.length) return '';
            const x = L[0], a = ageAt(life, x.from), P = life.person;
            const lead = T('{n} photo{s} de {c} prise{s} de son vivant ; la plus proche de ses 20 ans : « {t} » ({d}){a}.', {n: String(L.length), s: L.length > 1 ? 's' : '', c: esc(name), t: esc(x.title), d: esc(x.date),
                a: a !== null && a <= 110 ? ` — ${esc(T('{he} avait {n}', {he: he(P), n: ageTxt(a)}))}` : ''});
            return row('📷', `${lead} ${srcLink(x.url, T('↗ notice'))}`, SRC.photos(), more(`<ul class="hist-ul">${L.slice(1, 40).map(photoLi).join('')}</ul>${srcLink(R.search, T('↗ chercher sur POP'))}${hint}`, L.length > 1 ? L.length - 1 : null), ' data-l10v-part="photos"');
        }
        const lead = T('{n} photos anciennes de {c} (1850–1950) à la Médiathèque du patrimoine ; la plus ancienne : « {t} » ({d}).', {n: String(Math.max(all.length, R.total || 0)), c: esc(name), t: esc(all[0].title), d: esc(all[0].date)});
        return row('📷', `${lead} ${srcLink(all[0].url, T('↗ notice'))}`, SRC.photos(), more(`<ul class="hist-ul">${all.slice(0, 100).map(photoLi).join('')}</ul>${srcLink(R.search, T('↗ chercher sur POP'))}${hint}`, all.length), ' data-l10v-part="photos"');
    }

    /* ─────────── ✈️ 🔍 🌳 les tuiles côte à côte ─────────── */
    const W = 340, H = 230;
    function tilesBox(key, ll, z, under = '') {
        const tl = mosaic(ll.lat, ll.lon, z, W, H);
        const img = k => tl.map(t => `<img alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${esc(wmts(k, z, t.x, t.y))}" style="left:${t.left}px;top:${t.top}px" onerror="this.style.visibility='hidden'">`).join('');
        return `<div class="l10v-map" style="width:${W}px;height:${H}px">${under ? `<div class="l10v-under">${img(under)}</div>` : ''}${img(key)}<span class="l10v-pin" aria-hidden="true">＋</span></div>`;
    }
    const figure = (cap, body) => `<figure class="l10v-fig">${body}<figcaption>${cap}</figcaption></figure>`;
    const rltUrl = ll => `https://remonterletemps.ign.fr/comparer?lon=${ll.lon.toFixed(5)}&lat=${ll.lat.toFixed(5)}&z=16&layer1=ORTHOIMAGERY.ORTHOPHOTOS.1950-1965&layer2=ORTHOIMAGERY.ORTHOPHOTOS&mode=vSlider`;
    const gpUrl = (ll, z = 16) => `https://www.geoportail.gouv.fr/carte?c=${ll.lon.toFixed(5)},${ll.lat.toFixed(5)}&z=${z}&permalink=yes`;
    function avionPair(ll, z = 16) {
        return `<div class="l10v-pair">${figure(esc(T('Vers 1950 (IGN, 1950-1965)')), tilesBox('avion', ll, z))}${figure(esc(T('Aujourd’hui (IGN)')), tilesBox('today', ll, z))}</div>
            <p class="muted l10v-tools"><button type="button" class="button small secondary" data-l10v-zoom="-1">−</button> <button type="button" class="button small secondary" data-l10v-zoom="1">＋</button> ${srcLink(rltUrl(ll), T('↗ comparer sur « Remonter le temps » (IGN)'))}</p>`;
    }
    function avionHtml(ll, name, life = null) {
        if (!ll || !inFrance(ll)) return '';
        const P = life?.person;
        const lead = life ? T('{c} vu d’avion vers 1950, comme {he} l’a connu avant le remembrement : à côté de la photo d’aujourd’hui.', {c: esc(name), he: he(P)}) : T('{c} vu d’avion vers 1950, avant le remembrement, à côté de la photo d’aujourd’hui.', {c: esc(name)});
        return row('✈️', `${lead} ${srcLink(rltUrl(ll), T('↗ Remonter le temps'))}`, SRC.avion(), more(`<div data-l10v-tiles="avion" data-lat="${ll.lat}" data-lon="${ll.lon}" data-z="16"></div>${hyp(T('Les photos de 1950-1965 sont en noir et blanc ; la date exacte du vol de ta commune est sur « Remonter le temps ». Les haies, les petits champs, les chemins : c’est le paysage d’avant le remembrement.'))}`, 0, ' data-l10v-lazy'), ' data-l10v-part="avion"');
    }
    function lidarPair(ll, z = 16) {
        return `<div class="l10v-pair">${figure(esc(T('Relief laser (LiDAR HD, IGN)')), tilesBox('lidar', ll, z, 'ombre'))}${figure(esc(T('Photo d’aujourd’hui (IGN)')), tilesBox('today', ll, z))}</div>
            <p class="muted l10v-tools"><button type="button" class="button small secondary" data-l10v-zoom="-1">−</button> <button type="button" class="button small secondary" data-l10v-zoom="1">＋</button> ${srcLink(gpUrl(ll, 17), T('↗ Géoportail'))}</p>`;
    }
    function lidarHtml(ll) {
        if (!ll || !inFrance(ll)) return '';
        return row('🔍', esc(T('Le relief sans les arbres ni les maisons (laser LiDAR HD) : on y voit les anciens chemins creux, les talus, les mottes, les fossés, les charbonnières.')), SRC.lidar(),
            `<div data-l10v-tiles="lidar" data-lat="${ll.lat}" data-lon="${ll.lon}" data-z="16"></div>${hyp(T('Là où le LiDAR HD n’est pas encore livré, c’est l’ombrage du relief ordinaire qui apparaît (moins fin). Une forme sur l’image n’est qu’une piste : à vérifier sur place ou aux Archives.'))}`, ' data-l10v-part="lidar"');
    }
    function foretsPair(ll, z = 15) {
        return `<div class="l10v-pair">${figure(esc(T('La carte d’État-major (1820-1866)')), tilesBox('etatmajor', ll, z))}${figure(`${esc(T('Les bois :'))} <span class="l10v-sw" style="background:#458d4f"></span>${esc(T('déjà là vers 1850'))} <span class="l10v-sw" style="background:#ff59ec"></span>${esc(T('disparu'))} <span class="l10v-sw" style="background:#74f468"></span>${esc(T('nouveau'))}`, tilesBox('forets', ll, z, 'plan'))}</div>
            <p class="muted l10v-tools"><button type="button" class="button small secondary" data-l10v-zoom="-1">−</button> <button type="button" class="button small secondary" data-l10v-zoom="1">＋</button></p>`;
    }
    function foretsHtml(F, ll, life = null) {
        const s = forestStory(F); if (!s.kind || !ll) return '';
        const P = life?.person, dirT = d => (d ? T(' (au {d})', {d}) : '');
        let lead;
        if (s.kind === 'lisiere') lead = life ? T('{He} vivait en lisière d’un bois aujourd’hui disparu : à {m}{d} de chez {lui}, la carte de 1850 montre un bois qui n’existe plus.', {He: He(P), m: mTxt(s.m), d: dirT(s.dir), lui: P?.gender === 'female' ? T('elle') : T('lui')})
            : T('Un bois disparu à {m}{d} : il est sur la carte de 1850 mais n’existe plus.', {m: mTxt(s.m), d: dirT(s.dir)});
        else if (s.kind === 'ancien') lead = life ? T('Le bois à {m}{d} existait déjà vers 1850 : {he} l’a connu.', {m: mTxt(s.m), d: dirT(s.dir), he: he(P)}) : T('Le bois à {m}{d} existait déjà vers 1850 (forêt ancienne).', {m: mTxt(s.m), d: dirT(s.dir)});
        else if (s.kind === 'recul') lead = T('Vers 1850, {a} de bois à moins de 1,2 km ; aujourd’hui {b} : les bois ont reculé.', {a: haTxt(s.was), b: haTxt(s.now)});
        else lead = T('Vers 1850, {a} de bois à moins de 1,2 km ; aujourd’hui {b}.', {a: haTxt(s.was), b: haTxt(s.now)});
        const H = F.ha, tr = (k, l) => `<tr><td>${esc(l)}</td><td>${esc(haTxt(H[k][0]))}</td><td>${esc(haTxt(H[k][1]))}</td><td>${esc(haTxt(H[k][2]))}</td><td>${F.near?.[k] !== null && F.near?.[k] !== undefined ? esc(mTxt(F.near[k])) : '—'}</td></tr>`;
        const table = `<table class="data-table l10v-table"><thead><tr><th></th><th>${esc(T('< 300 m'))}</th><th>${esc(T('< 600 m'))}</th><th>${esc(T('< 1,2 km'))}</th><th>${esc(T('le plus proche'))}</th></tr></thead><tbody>${tr('ancienne', T('🌳 bois déjà là vers 1850'))}${tr('disparue', T('🪓 bois disparu depuis'))}${tr('recente', T('🌱 bois venu après 1850'))}</tbody></table>`;
        return row('🌳', `${lead} ${srcLink('https://www.data.gouv.fr/datasets/bd-forets-anciennes')}`, SRC.forets(),
            more(`${table}<div data-l10v-tiles="forets" data-lat="${ll.lat}" data-lon="${ll.lon}" data-z="15"></div>${hyp(T('Calcul de l’app sur la carte « Forêts anciennes » de l’IGN (bois de la carte d’État-major comparés aux bois d’aujourd’hui). Les petits bosquets et les haies n’y sont pas ; la position de « chez lui » est celle du lieu dans ta base.'))}`, 0, ' data-l10v-lazy'), ' data-l10v-part="forets"');
    }

    /* ─────────── 🏔 ce qu'il voyait ─────────── */
    const vueLi = x => `<li>${x.kind === 'pic' ? '⛰' : '⛪'} <b>${esc(x.name)}</b> <small class="muted">${esc([x.kind === 'pic' && x.elev ? T('{n} m', {n: nf(x.elev)}) : '', T('à {k} km au {d}', {k: String(x.km).replace('.', ','), d: x.dir})].filter(Boolean).join(' · '))}</small> ${srcLink(x.url, T('↗ Wikidata'))}</li>`;
    function vueHtml(R, life = null) {
        if (!R?.ok || R.notcached || R.nopoint) return '';
        const P = life?.person, pk = (R.items || []).filter(x => x.kind === 'pic'), tw = (R.items || []).filter(x => x.kind === 'clocher');
        const subj = life ? T('Depuis chez {lui}', {lui: P?.gender === 'female' ? T('elle') : T('lui')}) : T('Depuis le centre du lieu');
        let lead;
        if (!pk.length && !tw.length) lead = T('{s}, aucun sommet ni clocher connu de Wikidata n’est visible (le relief les cache).', {s: subj});
        else lead = [pk.length ? T('{s}, on voyait {n} sommet{x}, dont {p} ({e}, à {k} km au {d})', {s: subj, n: String(pk.length), x: pk.length > 1 ? 's' : '', p: `<b>${esc(pk[0].name)}</b>`, e: T('{n} m', {n: nf(pk[0].elev)}), k: String(pk[0].km).replace('.', ','), d: pk[0].dir}) : '',
            tw.length ? (pk.length ? T(' et {n} clocher{x}', {n: String(tw.length), x: tw.length > 1 ? 's' : ''}) : T('{s}, on voyait {n} clocher{x}, dont celui de {p} (à {k} km au {d})', {s: subj, n: String(tw.length), x: tw.length > 1 ? 's' : '', p: `<b>${esc(tw[0].name)}</b>`, k: String(tw[0].km).replace('.', ','), d: tw[0].dir})) : ''].join('') + '.';
        const top = pk[0] || tw[0];
        return row('🏔', `${lead} ${top ? srcLink(top.url, T('↗ Wikidata')) : ''}`, SRC.vue(), more(`${pk.length || tw.length ? `<ul class="hist-ul">${[...pk, ...tw].map(vueLi).join('')}</ul>` : ''}${hyp(T('Calcul de l’app : {n} sommets et clochers de Wikidata ({a} km et {b} km autour) testés avec le relief de l’IGN, la courbure de la Terre et un œil à 1,70 m ; un clocher compte 25 m. Les arbres, les maisons et la brume ne sont pas comptés.', {n: String(R.tested || 0), a: String(R.radius?.pic || 60), b: String(R.radius?.clocher || 12)}))}`, pk.length + tw.length || null), ' data-l10v-part="vue"');
    }

    /* ─────────── 🏠 les maisons ─────────── */
    const NAT = n => (/^indiff/i.test(n || '') ? '' : n);
    const houseLi = x => `<li><b>${esc(x.year)}</b> — ${esc([NAT(x.nature), x.usage && !/^indiff/i.test(x.usage) ? x.usage.toLowerCase() : '', x.logements ? T('{n} logement{s}', {n: String(x.logements), s: x.logements > 1 ? 's' : ''}) : ''].filter(Boolean).join(', ') || T('bâtiment'))} <small class="muted">${esc(T('à {m}', {m: mTxt(x.m)}))}</small> ${srcLink(x.map, T('↗ carte'))}${x.rnb ? ` <small class="muted">RNB ${esc(x.rnb)}</small>` : ''}</li>`;
    function maisonsHtml(R, life = null) {
        if (!R?.ok || R.notcached || R.nopoint) return '';
        const P = life?.person, end = life ? (lifeSpan(life).to ?? null) : null;
        const L = life ? housesForLife(R.items || [], life, end) : (R.items || []);
        const by = R.by || {};
        let lead;
        if (life) {
            if (!L.length) lead = T('Aucune maison datée d’avant {y} à moins de {r} m (la date manque pour {n} bâtiments sur {a}).', {y: String(end ?? ''), r: String(R.r), n: String((R.all || 0) - (R.dated || 0)), a: String(R.all || 0)});
            else lead = T('{n} bâtiment{s} à moins de {r} m de chez {lui} existaient déjà de son vivant (avant {y}) et sont encore debout ; le plus ancien : {o}.', {n: String(L.length), s: L.length > 1 ? 's' : '', r: String(R.r), lui: P?.gender === 'female' ? T('elle') : T('lui'), y: String(end), o: `<b>${esc(L[0].year)}</b>`});
        } else {
            const old = (by['avant 1800'] || 0) + (by['1800–1849'] || 0) + (by['1850–1899'] || 0) + (by['1900–1949'] || 0);
            if (!old) return '';
            lead = T('{n} bâtiments encore debout à moins de {r} m datent d’avant 1950 ; le plus ancien : {o}.', {n: String(old), r: String(R.r), o: `<b>${esc(R.items?.[0]?.year ?? '')}</b>`});
        }
        const per = Object.entries(by).map(([k, v]) => `${esc(T(k))} : ${nf(v)}`).join(' · ');
        return row('🏠', `${lead} ${srcLink('https://www.data.gouv.fr/datasets/bd-topo-r')}`, SRC.maisons(), more(`<p class="muted">${per}</p>${L.length ? `<ul class="hist-ul">${L.slice(0, 60).map(houseLi).join('')}</ul>` : ''}${hyp(T('L’année vient de la BD TOPO® de l’IGN (« date d’apparition » du bâtiment, souvent tirée des fichiers fonciers du cadastre) : c’est une indication, pas une preuve. Une maison très transformée garde sa date ; une maison rebâtie sur place en prend une nouvelle.'))}`, L.length || null), ' data-l10v-part="maisons"');
    }

    /* ─────────── 🗺 les pays voisins ─────────── */
    const NEIGHBOURS = {
        be: [['Ferraris (1771-1778) — Wallonie, WalOnMap', 'https://geoportail.wallonie.be/walonmap'], ['Ferraris, Vandermaelen, Popp — Flandre, Geopunt', 'https://www.vlaanderen.be/datavindplaats/catalogus/ferrariskaart-kabinetskaart-der-oostenrijkse-nederlanden-en-het-prinsbisdom-luik-1771-1778'], ['Cartesius (IGN Belgique)', 'https://www.cartesius.be/']],
        ch: [['Siegfried et Dufour — map.geo.admin.ch (swisstopo, « voyage dans le temps »)', 'https://map.geo.admin.ch/?lang=fr&layers=ch.swisstopo.zeitreihen']],
        nl: [['Topotijdreis (Kadaster) — 200 ans de cartes', 'https://www.topotijdreis.nl/']],
        lu: [['Géoportail du Luxembourg — carte de Ferraris', 'https://map.geoportail.lu/']]};
    function voisinsHtml(place) {
        const c = neighbourOf(place); if (!c) return '';
        const L = NEIGHBOURS[c];
        const inApp = {be: T('Dans l’app : Carte → fonds « Carte de Ferraris (Belgique, 1777) », « Vandermaelen », « Atlas Popp ».'), ch: T('Dans l’app : Carte → fonds « Swisstopo — Carte Siegfried » et « Carte Dufour ».'), nl: '', lu: ''}[c];
        return row('🗺', `${esc(T('Les cartes anciennes de {p} : {s}.', {p: place.name || '', s: L.map(x => x[0].split(' — ')[0]).join(', ')}))} ${srcLink(L[0][1])}`, SRC.voisins(),
            more(`<ul class="hist-ul">${L.map(([t, u]) => `<li>${link(u, t)}</li>`).join('')}</ul>${inApp ? `<p class="muted">${esc(inApp)}</p>` : ''}${hyp(T('Leurs conditions d’utilisation ne sont pas une licence ouverte claire (ou n’ont pas pu être lues) : l’app ne fait que donner le lien.'))}`), ' data-l10v-part="voisins"');
    }

    /* ─────────── 🔭 à la demande ─────────── */
    function demandRow(ll, pid, kinds) {
        const k = kinds.filter(on); if (!k.length || !ll || !inFrance(ll)) return '';
        const B = {vue: ['🏔', T('Ce qu’on voyait d’ici')], maisons: ['🏠', T('Les maisons de ce temps encore debout')], lidar: ['🔍', T('Les traces cachées (relief laser)')]};
        return `<div class="hist-row l10v-row l10v-demand" data-l10v-demand data-lat="${ll.lat}" data-lon="${ll.lon}"${pid ? ` data-pid="${Number(pid)}"` : ''}><span class="hist-i" aria-hidden="true">🔭</span><div class="hist-t"><p>${esc(T('À la demande :'))} ${k.map(x => `<button type="button" class="button small secondary" data-l10v-run="${x}">${B[x][0]} ${esc(B[x][1])}</button>`).join(' ')}</p><div data-l10v-out></div></div></div>`;
    }

    /* ─────────── 🖼️ la fiche d'une personne ─────────── */
    async function personInto(host, id, opts = {}) {
        const s = settings(), want = k => opts.force || s[k];
        let life; try { life = opts.life || await lifeOf(id); } catch (_) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const home = homeOf(life); if (!home) { host.innerHTML = ''; return 0; }
        const q = placeQ(home, id), ll = home.ll;
        // une fiche confidentielle ou vivante : le serveur répond « private » et rien n'est montré
        const [Tb, Ph, Fo, Vu, Ma] = await Promise.all([
            want('tableaux') ? ask('l10v_pop', {...q, kind: 'tableaux'}) : null, want('photos') ? ask('l10v_pop', {...q, kind: 'photos'}) : null,
            want('forets') && forestFits(life) ? ask('l10v_forets', {lat: ll.lat, lon: ll.lon, pid: id}) : null,
            ask('l10v_vue', {lat: ll.lat, lon: ll.lon, pid: id, cached_only: 1}), want('maisons') ? ask('l10v_maisons', {lat: ll.lat, lon: ll.lon, pid: id, cached_only: 1}) : null]);
        // (l10v_vue en « cached_only » ne part jamais sur Internet : il sert aussi à savoir si la fiche est confidentielle, avant d'afficher des tuiles)
        if ([Tb, Ph, Fo, Vu, Ma].some(r => r?.private) || !Vu?.ok) { host.innerHTML = ''; return 0; }
        const html = [tableauxHtml(Tb, life), photosHtml(Ph, life), want('avion') && aerialFits(life) ? avionHtml(ll, home.name, life) : '', foretsHtml(Fo, ll, life), want('vue') ? vueHtml(Vu, life) : '', maisonsHtml(Ma, life)].filter(Boolean);
        const dem = demandRow(ll, id, ['vue', 'maisons', 'lidar'].filter(k => !(k === 'vue' && !Vu.notcached) && !(k === 'maisons' && Ma?.ok && !Ma.notcached)));
        if (!host.isConnected && !opts.detached) return 0;
        // rien à montrer : pas de bloc (l'offre « à la demande » seule ne suffit pas ; elle reste dans le registre des données)
        host.innerHTML = html.length ? `<p class="muted l10v-where">${esc(T('Chez {lui} : {p}', {lui: life.person?.gender === 'female' ? T('elle') : T('lui'), p: home.name}))}${home.from !== null && home.to !== null ? ` <small>(${esc(home.from === home.to ? String(home.from) : `${home.from}–${home.to}`)})</small>` : ''}</p><div class="hist-life l10v-life" data-l10v-life="${Number(id)}">${html.join('')}${dem}</div>` : '';
        host.dataset.l10vPid = String(id);
        return html.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK[0]] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!PARTS.some(x => on(x[0]))) return '';
        return A().card(index, T(BLOCK[1]), '', `<div class="l10v-block" data-l10v-person="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-l10v-person]').forEach(async h => {
            const id = Number(h.dataset.l10vPerson); lifeMemo.delete(id);
            const n = await personInto(h, id);
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    /** le HTML d'un sujet pour un lieu ('' = rien à dire) */
    async function placePart(kind, place, opts = {}) {
        const ll = llOf(place), q = placeQ(place, opts.pid);
        if (kind === 'voisins') return voisinsHtml(place);
        if (!isFrance(place)) return '';
        if (kind === 'tableaux' || kind === 'photos') { const R = await ask('l10v_pop', {...q, kind}); return kind === 'tableaux' ? tableauxHtml(R) : photosHtml(R); }
        if (!ll || !inFrance(ll)) return '';
        if (kind === 'avion') return avionHtml(ll, place.name || '');
        if (kind === 'lidar') return lidarHtml(ll);
        if (kind === 'forets') return foretsHtml(await ask('l10v_forets', {lat: ll.lat, lon: ll.lon}), ll);
        if (kind === 'vue') return vueHtml(await ask('l10v_vue', {lat: ll.lat, lon: ll.lon, ...(opts.cachedOnly ? {cached_only: 1} : {})}));
        if (kind === 'maisons') return maisonsHtml(await ask('l10v_maisons', {lat: ll.lat, lon: ll.lon, ...(opts.cachedOnly ? {cached_only: 1} : {})}));
        return '';
    }
    const PLACE_AUTO = ['tableaux', 'photos', 'avion', 'forets', 'voisins'];
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || [...PLACE_AUTO, 'vue', 'maisons']).filter(k => opts.force || s[k]);
        const parts = await Promise.all(kinds.map(k => placePart(k, place, {cachedOnly: k === 'vue' || k === 'maisons'}).catch(() => '')));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean), ll = llOf(place);
        const dem = isFrance(place) ? demandRow(ll, 0, ['vue', 'maisons', 'lidar'].filter(k => kinds.includes(k) || k === 'lidar').filter(k => !(k !== 'lidar' && html.some(h => h.includes(`data-l10v-part="${k}"`))))) : '';
        host.innerHTML = html.length || dem ? `<section class="maintenance-panel cplus-panel l10v-panel"><h3>${esc(T('🖼️ Voir le village comme autrefois'))}</h3><div class="hist-life l10v-life">${html.join('')}${dem}</div></section>` : '';
        return html.length;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null, country: pli?.dataset.pliCountry || '',
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || village.querySelector('[data-cad-insee]')?.dataset.cadInsee || ''};
    }
    async function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-l10v])'); if (!village) return;
        village.dataset.l10v = '1';
        if (!PARTS.some(p => on(p[0]))) return;
        const anchor = village.querySelector('[data-l8c-host]') || village.querySelector('[data-et-host]') || village.querySelector('[data-ha-host]') || village.querySelector('[data-lp-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="l10v-place" data-l10v-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-l10v-host]'), villagePlace(village));
    }
    let pending = 0;
    if (typeof MutationObserver !== 'undefined' && root.document) new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate().catch(e => console.error(e)); }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── les clics : tuiles à l'ouverture, zoom, calculs à la demande ─────────── */
    const PAIR = {avion: avionPair, lidar: lidarPair, forets: foretsPair};
    const ZMAX = {avion: 18, lidar: 18, forets: 15};
    function paintTiles(box) {
        const k = box.dataset.l10vTiles, z = Number(box.dataset.z), ll = {lat: Number(box.dataset.lat), lon: Number(box.dataset.lon)};
        if (PAIR[k]) box.innerHTML = PAIR[k](ll, z);
    }
    async function runDemand(btn) {
        const box = btn.closest('[data-l10v-demand]'), out = box.querySelector('[data-l10v-out]'), k = btn.dataset.l10vRun;
        const ll = {lat: Number(box.dataset.lat), lon: Number(box.dataset.lon)}, pid = Number(box.dataset.pid) || 0;
        let life = null; if (pid) { try { life = await lifeOf(pid); } catch (_) {} }
        let html = '';
        btn.disabled = true; const label = btn.innerHTML; btn.innerHTML = `⏳ ${esc(T('Calcul…'))}`;
        try {
            if (k === 'lidar') html = lidarHtml(ll);
            else {
                const r = await A().api(k === 'vue' ? 'l10v_vue' : 'l10v_maisons', {lat: ll.lat, lon: ll.lon, ...(pid ? {pid} : {})});
                if (r?.private) html = emptyLine(T('Fiche confidentielle ou personne vivante : rien n’est envoyé sur Internet.'), '🔒');
                else if (r?.ok === false) html = emptyLine(r.message || T('Pas de réponse.'), '📡');
                else html = k === 'vue' ? vueHtml(r, life) : (maisonsHtml(r, life) || emptyLine(T('Aucun bâtiment daté ici.'), '🏠'));
                if (r?.ok) memo.clear();
            }
        } catch (e) { html = emptyLine(e.message, '📡'); }
        btn.remove();
        out.insertAdjacentHTML('beforeend', html);
        out.querySelectorAll('[data-l10v-tiles]:not([data-done])').forEach(b => { b.dataset.done = '1'; paintTiles(b); });
        if (!box.querySelector('[data-l10v-run]')) box.querySelector('.hist-t > p')?.remove();
    }
    if (root.document) {
        document.addEventListener('toggle', e => {
            const d = e.target; if (!d?.matches?.('details[data-l10v-lazy]') || !d.open) return;
            d.querySelectorAll('[data-l10v-tiles]:not([data-done])').forEach(b => { b.dataset.done = '1'; paintTiles(b); });
        }, true);
        document.addEventListener('click', e => {
            const z = e.target.closest?.('[data-l10v-zoom]');
            if (z) { const b = z.closest('[data-l10v-tiles]'); if (!b) return; const k = b.dataset.l10vTiles, n = Math.max(13, Math.min(ZMAX[k] || 17, Number(b.dataset.z) + Number(z.dataset.l10vZoom))); b.dataset.z = String(n); paintTiles(b); return; }
            const r = e.target.closest?.('[data-l10v-run]'); if (r) { e.preventDefault(); runDemand(r); return; }
            if (e.target.closest?.('[data-l10v-clear]')) { clearCache(); return; }
            const add = e.target.closest?.('[data-l10v-addtile]'); if (add) { addTile(add.dataset.l10vAddtile); }
        });
        document.addEventListener('change', e => {
            const t = e.target.closest?.('[data-l10v-tg]'); if (!t || !e.target.matches('input')) return;
            const s = settings(), k = t.dataset.l10vTg, was = s[k];
            s[k] = e.target.checked; saveSettings(s);
            A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }});
        });
    }

    /* ─────────── 📜 Monographie de commune ─────────── */
    const MONO = [['tableaux', 'l10v_tableaux', '🖼️', 'Les tableaux qui la représentent', true], ['photos', 'l10v_photos', '📷', 'Les photos anciennes (1850–1950)', true], ['avion', 'l10v_avion', '✈️', 'Vue d’avion vers 1950', true],
        ['forets', 'l10v_forets', '🌳', 'Les forêts de 1850', true], ['vue', 'l10v_vue', '🏔', 'Ce qu’on voyait d’ici', false], ['maisons', 'l10v_maisons', '🏠', 'Les maisons anciennes encore debout', false], ['lidar', 'l10v_lidar', '🔍', 'Les traces cachées (relief laser)', false]];
    const monoPlace = async (place, ctx) => {
        let pl = {...place, lat: place.latitude ?? place.lat, lon: place.longitude ?? place.lon};
        if (!pl.insee && ctx?.village) { try { const v = await ctx.village(); if (v?.insee) pl = {...pl, insee: v.insee}; } catch (_) {} }
        return pl;
    };
    (ext.monographSections = ext.monographSections || []).push(...MONO.map(([kind, id, icon, label, dflt]) => ({
        id, icon, label, group: 'Le lieu', defaultOn: dflt, enabled: () => on(kind), source: SRC_TXT[kind],
        render: async (place, host, ctx) => {
            const html = await placePart(kind, await monoPlace(place, ctx)); if (!html) return false;
            host.innerHTML = `<div class="hist-life l10v-life">${html}</div>`;
            host.querySelectorAll('[data-l10v-tiles]:not([data-done])').forEach(b => { b.dataset.done = '1'; paintTiles(b); });
            return true;
        }})));

    /* ─────────── 📋 Listes : ce qui a déjà été cherché (réponses gardées) ─────────── */
    const listRows = kind => A().api('l10v_list', {kind}).then(r => r?.rows || []).catch(() => []);
    const L = ext.dataLists = ext.dataLists || [];
    L.push(
        {id: 'l10v_tableaux', icon: '🖼️', label: T('Tableaux des communes déjà cherchées (Joconde)'), group: 'Le lieu', source: SRC_TXT.tableaux, sourceUrl: 'https://pop.culture.gouv.fr/donnees-ouvertes', enabled: () => on('tableaux'),
            load: async () => (await listRows('tableaux')).map(x => ({...x, author: who(x), src: x.url})),
            fields: [{key: 'title', label: T('Tableau'), type: 'text'}, {key: 'author', label: T('Peintre'), type: 'text'}, {key: 'date', label: T('Date'), type: 'text'}, {key: 'from', label: T('Année'), type: 'year'},
                {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'where', label: T('Musée'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: x => [x.from, x.to]},
        {id: 'l10v_photos', icon: '📷', label: T('Photos anciennes des communes déjà cherchées (Mémoire)'), group: 'Le lieu', source: SRC_TXT.photos, sourceUrl: 'https://pop.culture.gouv.fr/donnees-ouvertes', enabled: () => on('photos'),
            load: async () => (await listRows('photos')).map(x => ({...x, author: (x.authors || [])[0] || '', src: x.url})),
            fields: [{key: 'title', label: T('Photo'), type: 'text'}, {key: 'author', label: T('Photographe'), type: 'text'}, {key: 'date', label: T('Date'), type: 'text'}, {key: 'from', label: T('Année'), type: 'year'},
                {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: x => [x.from, x.to]},
        {id: 'l10v_vue', icon: '🏔', label: T('Sommets et clochers visibles (lieux déjà calculés)'), group: 'Le lieu', source: SRC_TXT.vue, sourceUrl: 'https://www.wikidata.org', enabled: () => on('vue'),
            load: async () => (await listRows('vue')).map(x => ({...x, kindTxt: x.kind === 'pic' ? T('sommet') : T('clocher'), src: x.url})),
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'kindTxt', label: T('Sorte'), type: 'enum', values: [T('sommet'), T('clocher')]}, {key: 'elev', label: T('Altitude (m)'), type: 'number'}, {key: 'km', label: T('Distance (km)'), type: 'number'},
                {key: 'dir', label: T('Direction'), type: 'enum'}, {key: 'src', label: T('Source'), type: 'url'}],
            geo: x => [x.lat, x.lon]},
        {id: 'l10v_maisons', icon: '🏠', label: T('Bâtiments anciens encore debout (lieux déjà cherchés)'), group: 'Le lieu', source: SRC_TXT.maisons, sourceUrl: 'https://www.data.gouv.fr/datasets/bd-topo-r', enabled: () => on('maisons'),
            load: async () => (await listRows('maisons')).map(x => ({...x, nature: NAT(x.nature) || T('bâtiment'), src: x.map})),
            fields: [{key: 'year', label: T('Année'), type: 'year'}, {key: 'nature', label: T('Sorte'), type: 'enum'}, {key: 'usage', label: T('Usage'), type: 'enum'}, {key: 'logements', label: T('Logements'), type: 'number'}, {key: 'rnb', label: T('Identifiant RNB'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: x => [x.year, null], geo: x => [x.lat, x.lon]},
        {id: 'l10v_forets', icon: '🌳', label: T('Forêts de 1850 autour des lieux déjà calculés'), group: 'Le lieu', source: SRC_TXT.forets, sourceUrl: 'https://www.data.gouv.fr/datasets/bd-forets-anciennes', enabled: () => on('forets'),
            load: async () => (await listRows('forets')).map(x => ({...x, src: 'https://www.data.gouv.fr/datasets/bd-forets-anciennes', lisiereTxt: x.lisiere ? T('oui') : T('non')})),
            fields: [{key: 'ancienne', label: T('Bois déjà là en 1850 (ha)'), type: 'number'}, {key: 'disparue', label: T('Bois disparus (ha)'), type: 'number'}, {key: 'recente', label: T('Bois nouveaux (ha)'), type: 'number'},
                {key: 'lisiereTxt', label: T('En lisière d’un bois disparu'), type: 'enum', values: [T('oui'), T('non')]}, {key: 'src', label: T('Source'), type: 'url'}],
            geo: x => [x.lat, x.lon]});

    /* ─────────── 🗺 sur les cartes ─────────── */
    (ext.mapLayerSources = ext.mapLayerSources || []).push(
        {id: 'l10v_maisons', icon: '🏠', label: T('Bâtiments anciens encore debout (déjà cherchés)'), group: 'Le lieu', kind: 'points', source: SRC_TXT.maisons,
            run: async ({from, to, bbox, max} = {}) => {
                const rows = (await listRows('maisons')).filter(x => (from == null || x.year >= from) && (to == null || x.year <= to) && (!bbox || (x.lon >= bbox[0] && x.lat >= bbox[1] && x.lon <= bbox[2] && x.lat <= bbox[3])));
                return {features: rows.slice(0, max || 3000).map(x => ({type: 'pt', lat: x.lat, lon: x.lon, label: `${x.year}`})), source: SRC_TXT.maisons};
            }},
        {id: 'l10v_vue', icon: '🏔', label: T('Sommets et clochers visibles (déjà calculés)'), group: 'Le lieu', kind: 'points', source: SRC_TXT.vue,
            run: async ({max} = {}) => ({features: (await listRows('vue')).slice(0, max || 3000).map(x => ({type: 'pt', lat: x.lat, lon: x.lon, label: x.name})), source: SRC_TXT.vue})});

    /* ─────────── 🧰 le registre commun : à la demande ─────────── */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', country: pl.country || '', county: pl.county || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
    const personOfCtx = ctx => Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0;
    async function runPlace(kind, ctx, host) {
        const pl = placeOfCtx(ctx.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return null; }
        const html = await placePart(kind, pl, {});
        host.innerHTML = html ? `<div class="hist-life l10v-life">${html}</div>` : '';
        host.querySelectorAll('[data-l10v-tiles]:not([data-done])').forEach(b => { b.dataset.done = '1'; paintTiles(b); });
        return !!html;
    }
    async function runPerson(ctx, host) {
        const id = personOfCtx(ctx); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
        host.innerHTML = '<div></div>';
        const n = await personInto(host.firstElementChild, id, {force: true, detached: true});
        return n;
    }
    const DS = ext.dataSources = ext.dataSources || [];
    DS.push({id: 'l10v_personne', icon: '🖼️', label: T('Son village comme il le voyait (tableaux, photos, vue d’avion, forêts de 1850)'), group: 'La personne', needs: ['person'], online: true, installed: () => true, run: (ctx, host) => runPerson(ctx, host)},
        ...MONO.map(([kind, id, icon, label]) => ({id, icon, label: T(label), group: 'Le lieu', needs: ['place'], online: true, installed: () => true, run: (ctx, host) => runPlace(kind, ctx, host)})),
        {id: 'l10v_voisins', icon: '🗺', label: T('Les cartes anciennes des pays voisins'), group: 'Chercher', needs: ['place'], installed: () => true, run: (ctx, host) => runPlace('voisins', ctx, host)});

    /* ─────────── 🌍 Où chercher : POP et les cartes des pays voisins ─────────── */
    function registerOuChercher() {
        const M = root.LCNDA_OUC_MONDE; if (!M || !Array.isArray(M.SITES) || M.SITES.some(s => s.key === 'l10v_pop_memoire')) return !!M;
        const enc = encodeURIComponent, pop = p => `https://pop.culture.gouv.fr/recherche?q=${enc(p.place || '')}`;
        M.SITES.push(
            {key: 'l10v_pop_memoire', icon: '📷', group: 'Monde', label: T('POP — photos anciennes de sa commune (base Mémoire, Médiathèque du patrimoine)'), cats: ['bibliotheques'], period: [1850, 1950], access: 'online', needs: 'place', url: pop,
                rel: {countries: ['fr'], from: 1850, to: 1950, base: 0.5, why: () => T('Des photographes du ministère sont passés dans beaucoup de communes entre 1850 et 1950 : église, rues, maisons, fêtes')}},
            {key: 'l10v_pop_joconde', icon: '🖼️', group: 'Monde', label: T('POP — tableaux et dessins qui représentent sa commune (base Joconde)'), cats: ['bibliotheques'], period: [1600, 1960], access: 'online', needs: 'place', url: pop,
                rel: {countries: ['fr'], from: 1700, to: 1960, base: 0.3, why: () => T('Un peintre est peut-être passé dans son village : les musées de France décrivent leurs tableaux sur POP')}},
            {key: 'l10v_ferraris', icon: '🗺', group: 'Monde', label: T('Carte de Ferraris (1771-1778) — WalOnMap, Wallonie'), cats: ['cartes'], period: [1770, 1800], access: 'online', url: () => 'https://geoportail.wallonie.be/walonmap',
                rel: {countries: ['be', 'lu'], from: 1700, to: 1850, base: 0.4, why: () => T('La carte de Ferraris montre chaque village des Pays-Bas autrichiens vers 1777, maison par maison')}},
            {key: 'l10v_siegfried', icon: '🗺', group: 'Monde', label: T('Cartes Siegfried et Dufour — map.geo.admin.ch (swisstopo)'), cats: ['cartes'], period: [1845, 1949], access: 'online', url: () => 'https://map.geo.admin.ch/?lang=fr&layers=ch.swisstopo.zeitreihen',
                rel: {countries: ['ch'], from: 1840, to: 1950, base: 0.4, why: () => T('Le « voyage dans le temps » de swisstopo : les cartes suisses depuis 1844')}},
            {key: 'l10v_topotijdreis', icon: '🗺', group: 'Monde', label: T('Topotijdreis — 200 ans de cartes des Pays-Bas (Kadaster)'), cats: ['cartes'], period: [1815, 2025], access: 'online', url: () => 'https://www.topotijdreis.nl/',
                rel: {countries: ['nl'], from: 1815, to: 2025, base: 0.4, why: () => T('Les cartes topographiques des Pays-Bas année par année depuis 1815')}});
        return true;
    }

    /* ─────────── ⚙️ Réglages → 🖼️ Voir son village ─────────── */
    const TILE_OFFERS = [['forets', 'IGN — Forêts anciennes (bois de 1850 et d’aujourd’hui)'], ['lidar', 'IGN — Relief du terrain HD (LiDAR HD)'], ['ortho6580', 'IGN — Photos aériennes 1965-1980'], ['ortho8095', 'IGN — Photos aériennes 1980-1995']];
    const userTiles = () => ext.userTiles?.list?.() || [];
    function addTile(k) {
        const U = ext.userTiles, o = TILE_OFFERS.find(x => x[0] === k); if (!U?.add || !o) return;
        try { const it = U.add({label: T(o[1]), url: wmtsTemplate(k)}); drawSettings(); A().undoToast?.(T('Fond « {n} » ajouté : il est dans tous les menus de fonds, rubrique « Mes fonds de carte ».', {n: it.label}), {undo: () => { U.remove(it.id); drawSettings(); }}); }
        catch (e) { A().toast?.(e.message, 'error'); }
    }
    async function clearCache() {
        try {
            const r = await A().api('l10v_cache_clear', {}, {method: 'POST', body: {}}); const R = r.result || r; memo.clear(); drawSettings();
            A().undoToast?.(T('{n} réponses oubliées.', {n: String(R.removed || 0)}), {undo: async () => { await A().api('l10v_cache_restore', {}, {method: 'POST', body: {token: R.token}}); memo.clear(); drawSettings(); }});
        } catch (e) { A().toast?.(e.message, 'error'); }
    }
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        let about = null; try { about = await A().api('l10v_about', {}); } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings(), have = new Set(userTiles().map(u => u.url));
        const tg = ([k, label, sub]) => `<label class="checkbox-line cplus-tg" data-l10v-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const src = (about?.sources || []).map(x => `<tr><td>${esc(PARTS.find(p => p[0] === x.id)?.[1] ? T(PARTS.find(p => p[0] === x.id)[1]) : x.id)}</td><td>${link(x.url, x.label)}<br><small class="muted">${esc(x.what || '')}</small>${x.quote ? `<br><small class="muted">« ${esc(x.quote)} » ${srcLink(x.quote_url)}</small>` : ''}</td><td>${esc(x.licence)}</td><td>${esc(x.online ? T('en ligne, gardé sur l’ordinateur') : T('tuiles affichées en ligne'))}</td></tr>`).join('');
        const offers = ext.userTiles?.add ? TILE_OFFERS.map(([k, l]) => `<li>${esc(T(l))} ${have.has(wmtsTemplate(k)) ? `<small class="muted">✓ ${esc(T('déjà dans « Mes fonds de carte »'))}</small>` : `<button type="button" class="button small secondary" data-l10v-addtile="${k}">＋ ${esc(T('Ajouter aux fonds de carte'))}</button>`}</li>`).join('') : '';
        const c = about?.cache || {count: 0, bytes: 0};
        ws.innerHTML = `<section class="page cplus-settings l10v-settings" data-l10v-settings>${UI().pageHeader ? UI().pageHeader({title: T('Voir son village'), icon: '🖼️', where: T('Réglages · Données'), help: esc(T('Les tableaux et les photos anciennes de sa commune, son village vu d’avion vers 1950, les forêts de 1850, ce qu’on voyait de chez lui, les traces cachées et les maisons de son temps. Rien n’est livré avec l’app : chaque lieu est demandé en ligne une fois, puis gardé sur l’ordinateur.'))}) : `<h2>🖼️ ${esc(T('Voir son village'))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’une personne (bloc « 🖼️ Son village comme il le voyait »), sur la fiche d’un village et dans la monographie de commune. Rien n’est demandé pour une fiche confidentielle ou une personne vivante.'))}</p>${PARTS.map(tg).join('')}</div>
            ${offers ? `<div class="maintenance-panel"><h3>${esc(T('Fonds de carte de l’IGN à ajouter (Licence Ouverte 2.0)'))}</h3><ul class="hist-ul">${offers}</ul></div>` : ''}
            <div class="maintenance-panel"><h3>${esc(T('Réponses gardées sur l’ordinateur'))}</h3><p>${esc(T('{n} lieux et recherches gardés ({k} Ko).', {n: String(c.count), k: nf(Math.round(c.bytes / 1024))}))} ${c.count ? `<button type="button" class="button small secondary" data-l10v-clear>🗑 ${esc(T('Tout oublier'))}</button>` : ''}</p></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><p class="muted">${esc(T('Licences lues le {d} sur la page officielle de chaque source.', {d: about?.read || ''}))}</p><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Comment'))}</th></tr></thead><tbody>${src}</tbody></table></div>
                <p class="muted">${esc(T('Les rapprochements (un tableau « de son vivant », la photo de ses 20 ans, un bois disparu près de chez lui, un clocher visible, une maison de son temps) sont faits par l’app d’après ses lieux et ses dates : ce sont des pistes.'))}</p></div></section>`;
    }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'lot8_monde_village'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire_autour'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK[0])) { let i = B.findIndex(b => b[0] === 'l8c_village'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire_autour'); if (i < 0) i = B.findIndex(b => b[0] === 'world'); B.splice(i < 0 ? B.length : i + 1, 0, [...BLOCK]); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK[0]] ||= '12';
        registerOuChercher();
        return !!tabs;
    }
    if (!register() && root.document) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.voirVillage = {...core, settings, personInto, placeInto, placePart, lifeOf, ask, tableauxHtml, photosHtml, foretsHtml, vueHtml, maisonsHtml, avionHtml, lidarHtml, voisinsHtml, registerOuChercher,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
