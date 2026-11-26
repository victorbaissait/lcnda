/* LCNDA — 📊 Diagrammes « Partir des données » (maquette validée : docs/design/diagrammes-donnees.html, partie « Décisions »).
 *
 *  L'onglet « Depuis l'app » de l'éditeur (heritage-diagrams.js) s'appelle « 📊 Partir des données » ; il commence par trois sources :
 *   · 🌳 Mon arbre   : EXACTEMENT ce qu'il y avait (🧮 Compter dans ma base, Graphique, groupe, période, « Tenir à jour ») — rien n'est changé ;
 *   · 🧰 Une liste   : une liste de données (LCNDA_EXT.dataLists, thèmes, listes réunies 🔀) choisie avec le choix commun
 *                      LCNDA_EXT.dataListPicker (app-listes-themes.js) ; lignes lues par le moteur commun (LCNDA_EXT.dataListsEngine) ;
 *   · 💬 Une question : la même lecture que le récap (LCNDA_EXT.dataAsk, app-donnees-accueil.js) → pastilles « J'ai compris ».
 *  Puis « Ne garder que… » (📅 période, 📍 près des lieux de la famille ± km — le rayon par liste : d.familyKm, sinon selon le thème,
 *  modifiable et retenu —, 👪 seulement quand la famille y vivait, une colonne de la liste), « Qui va où » (X, Y, couleur : ✨ proposé ;
 *  replié : taille, étiquette, groupe, temps), « Le bon dessin » (N types conseillés d'abord — Réglages « Diagrammes : nombre de types
 *  conseillés », genealogie-diagrammes-conseilles, 5 au départ, 3 à 12 ou « Tous » — puis « Tous » à un clic) et « Utiliser ».
 *  Deux séries différentes (prix du pain et naissances) : deux panneaux l'un sous l'autre, même frise des années (petites courbes,
 *  échelles à elles) ; le deuxième axe à droite reste dans ⚙️ Personnaliser.
 *  Tenu à jour dans l'app (« Tenir à jour », la même case que l'arbre) ; ce qui SORT (PNG, SVG, PDF, fichier, Studio, Présentation)
 *  est figé, daté, et calculé sans les personnes vivantes (GET ld_famille?share=1, lib/listes_famille.php). Une fiche ou un événement
 *  confidentiel n'entre jamais dans le calcul (ld_famille). En mode consultation : lecture seule, seulement les données présentes ici.
 *  Rapide : rien n'est lu avant qu'on choisisse une liste ; au-delà de 50 000 lignes, le calcul avance par morceaux (la page ne gèle pas).
 *  ⚙️ Personnaliser gagne (ext.diagramPersoExtra) : 🖼 Format (écran, 16:9, A4, carré), 📝 note posée d'un clic sur une colonne,
 *  ⭐ Enregistrer comme modèle (la mise en forme et la recette : jamais un chiffre ni un nom ; partageable en fichier).
 *  API : LCNDA_EXT.diagramData = {mount, resolve, frozen, compute, suggestFields, suggestKinds, profileOf, modelOf, applyModel, GALLERY,
 *        suggestN, settingHtml, galleryTileHtml, afterEmbed, kmFor, finish}
 *  Essai : tests/test-diagrammes-donnees.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const R = () => ext.diagramRender;
    const E = () => ext.dataListsEngine || {};
    const LF = () => ext.listesFamille || null;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").trim();
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const clone = v => JSON.parse(JSON.stringify(v ?? null));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const toast = (m, k) => A().toast?.(m, k);
    const readLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const kiosk = () => typeof document !== 'undefined' && !!document.body && (document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly'));
    const tick = () => new Promise(r => setTimeout(r, 0));
    const CHUNK = 10000, BIG = 50000, MAX_ROWS = 200000;
    const K_N = 'genealogie-diagrammes-conseilles', K_KM = 'genealogie-diagrammes-km', K_MOD = 'genealogie-diagrammes-modeles', K_RECAP = 'genealogie-diagrammes-recap';

    /* ═════════ Réglages : combien de types conseillés ═════════ */
    /** 3 à 12, ou 'all' (pas d'étape « conseillés ») ; 5 au départ */
    function suggestN() { const v = String(readLS(K_N, '') || ''); if (v === 'all') return 'all'; const n = Math.round(Number(v)); return n >= 3 && n <= 12 ? n : 5; }
    const settingHtml = () => {
        const v = String(suggestN()), opts = [...Array.from({length: 10}, (_, i) => [String(i + 3), String(i + 3)]), ['all', T('Tous')]];
        return `<label class="dgd-setting">${esc(T('Diagrammes : nombre de types conseillés'))}<select data-dgd-conseilles>${opts.map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select><small class="muted">${esc(T('Dans « 📊 Partir des données », les dessins qui vont le mieux avec la source d’abord ; « Tous » : toute la galerie tout de suite.'))}</small></label>`;
    };
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('change', e => {
        const s = e.target?.closest?.('[data-dgd-conseilles]'); if (!s) return;
        try { localStorage.setItem(K_N, s.value); } catch (_) {}
        toast(T('Réglage enregistré.'));
    });

    /* ═════════ Les dessins : les 14 qui servent le plus avec des données (tous déjà dans le catalogue) ═════════ */
    // need : time (des dates), month (un jour précis), geo (des positions), cat (une colonne à choix), cat2 (deux), num (un chiffre)
    const GALLERY = [
        ['bars', '📊', 'Barres et colonnes', 'Empilées, groupées, à 100 % ; couchées pour les noms longs.', []],
        ['lines', '📈', 'Lignes et aires', 'Une évolution : prix, températures, nombre par année.', ['time']],
        ['scatter', '🫧', 'Nuage de points, bulles', 'Deux chiffres à la fois : magnitude × année.', ['num']],
        ['map', '📍', 'Carte', 'Un point par ligne, à sa place ; les lieux de la famille autour.', ['geo']],
        ['frise', '📅', 'Frise chronologique', 'Les événements d’une liste, dans l’ordre.', ['time']],
        ['cal', '🟧', 'Calendrier (année × mois)', 'Les mois qui reviennent : crues, mariages, épidémies.', ['month']],
        ['tree', '🟪', 'Rectangles (treemap)', 'Des parts emboîtées.', ['cat']],
        ['sun', '🌞', 'Soleil (anneaux)', 'Comme le soleil des lignées, pour n’importe quelles données.', ['cat2']],
        ['sankey', '🔀', 'Flux (Sankey)', 'D’où vers où : métiers → communes.', ['cat2']],
        ['net', '🕸️', 'Réseau', 'Les événements reliés aux lieux de la famille.', ['geo']],
        ['radar', '🕸', 'Radar', 'Plusieurs chiffres par lieu ou par sorte.', ['cat2']],
        ['pyr', '📶', 'Histogramme', 'Des valeurs rangées par tranches.', ['numtime']],
        ['multi', '🔲', 'Petits multiples', 'Un petit dessin par lieu ou par sorte, même échelle.', ['time', 'cat']],
        ['life', '🎸', 'Vie d’un ancêtre', 'Sa vie, et ce qui se passait autour (guerres, séismes, prix).', ['time']],
    ].map(([id, icon, label, help, need]) => ({id, icon, label, help, need}));
    const KIND_OF = {lines: 'line', scatter: 'scatter', map: 'dotmap', frise: 'chrono', cal: 'heatmap', tree: 'treemap', sun: 'sunburst', sankey: 'sankey', net: 'network', radar: 'radar', pyr: 'histogram', multi: 'smallmult', life: 'timeline'};
    const kindOf = (gal, cfg) => (gal === 'bars' || !KIND_OF[gal] ? (cfg?.color ? 'stacked' : 'columns') : KIND_OF[gal]);

    /* ═════════ Une liste : ses champs, son profil ═════════ */
    const eligible = d => !!d && !d.link && !d.online && !d.needsInternet && (typeof d.load === 'function' || typeof d.query === 'function') && E().shown?.(d) !== false;
    const listById = id => (E().list?.() || []).find(d => d.id === id) || null;
    const fieldsOf = d => (d?.fields || []).filter(f => f && f.key && f.type !== 'url' && !f.hidden && f.key !== 'sources');
    const catFields = d => fieldsOf(d).filter(f => ['enum', 'place', 'bool'].includes(f.type));
    const numFields = d => fieldsOf(d).filter(f => f.type === 'number');
    const textFields = d => fieldsOf(d).filter(f => ['text', 'place'].includes(f.type || 'text'));
    const dateField = d => fieldsOf(d).find(f => f.type === 'date');
    function profileOf(d, cfg = {}) {
        const p = {time: !!d?.period, geo: !!d?.geo, month: !!dateField(d), cat: catFields(d).length >= 1 || (!!d?.geo && !!cfg.fam), num: numFields(d).length >= 1, fam: !!cfg.fam && !!d?.geo};
        p.cat2 = catFields(d).length >= 2 || (catFields(d).length >= 1 && p.fam) || (p.cat && !!cfg.color);
        p.numtime = p.num || p.time;
        return p;
    }
    const fits = (g, p) => g.need.every(n => p[n]);
    /** les dessins conseillés pour ce profil, dans l'ordre (les autres restent derrière « Tous ») */
    function suggestKinds(p, n = suggestN()) {
        const order = p.time && p.geo ? ['bars', 'map', 'lines', 'frise', 'multi', 'cal', 'life', 'scatter', 'pyr', 'net', 'tree', 'sun', 'sankey', 'radar']
            : p.time ? ['bars', 'lines', 'frise', 'cal', 'multi', 'life', 'pyr', 'scatter', 'tree', 'sun', 'sankey', 'radar']
                : p.geo ? ['map', 'bars', 'tree', 'sun', 'net', 'sankey', 'radar', 'scatter', 'pyr']
                    : ['bars', 'tree', 'sun', 'sankey', 'radar', 'scatter', 'pyr'];
        const ok = order.map(id => GALLERY.find(g => g.id === id)).filter(g => g && fits(g, p)).map(g => g.id);
        return n === 'all' ? ok : ok.slice(0, n);
    }
    /** X, Y, couleur… proposés pour une liste (cfg : les filtres déjà choisis ; rows : quelques lignes pour juger les colonnes) */
    function suggestFields(d, cfg = {}, rows = []) {
        const out = {x: '', y: '_count', color: '', size: '', label: '', group: '', time: ''};
        out.x = d?.period ? '_time' : (catFields(d)[0]?.key || (d?.geo && cfg.fam ? '_fam' : fieldsOf(d)[0]?.key || ''));
        const few = catFields(d).find(f => { if (f.key === out.x) return false; const s = new Set(); for (const r of rows.slice(0, 3000)) { s.add(String(r[f.key] ?? '')); if (s.size > 8) return false; } return s.size >= 2; });
        out.color = d?.geo && cfg.fam ? '_fam' : few?.key || '';
        out.size = numFields(d)[0]?.key || '';
        out.label = textFields(d)[0]?.key || '';
        out.group = catFields(d).find(f => f.key !== out.x && f.key !== out.color)?.key || '';
        out.time = d?.period ? '_time' : '';
        return out;
    }

    /* ═════════ Le rayon autour des lieux de la famille : par liste ═════════ */
    const KM_THEME = {seismes: 150, guerres: 150, evenements: 150, ciel: 100, prix: 100, eaux: 30, sport: 15, monuments: 15, village: 15, lieux: 15, routes: 15};
    function kmFor(d) {
        const mine = Number(readJ(K_KM, {})?.[d?.id]); if (mine > 0) return clamp(mine, 1, 2000);
        if (Number(d?.familyKm) > 0) return Number(d.familyKm);
        const t = d?.theme || ext.listesThemes?.themeOf?.(d); if (KM_THEME[t]) return KM_THEME[t];
        if (/tour de france|etape|monument|chateau/.test(fold(d?.label))) return 15;
        return LF()?.km?.() || 15;
    }
    const setKm = (d, km) => { const v = readJ(K_KM, {}) || {}; v[d.id] = km; writeJ(K_KM, v); };
    const STEPS = [1, 2, 5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500, 1000, 2000];
    const stepKm = (k, dir) => (dir > 0 ? STEPS.find(s => s > k) || 2000 : [...STEPS].reverse().find(s => s < k) || 1);

    /* ═════════ La famille : lieux placés et qui y vivait (ld_famille) ═════════ */
    const RAD = Math.PI / 180;
    const kmBetween = (a, b, c, d) => { const x = Math.sin((c - a) * RAD / 2) ** 2 + Math.cos(a * RAD) * Math.cos(c * RAD) * Math.sin((d - b) * RAD / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); };
    function buildFam(r) {
        const places = (r.places || []).map(([lat, lon, name]) => ({lat: Number(lat), lon: Number(lon), name: String(name || '')}));
        const people = (r.people || []).map(([n, b, d, pl, a]) => ({n: String(n), b: b == null ? null : Number(b), d: d == null ? null : Number(d), pl: pl || [], a: !!a}));
        const at = places.map(() => []), grid = new Map();
        people.forEach((p, i) => p.pl.forEach(([pl, y]) => { if (at[pl]) at[pl].push([i, y == null ? null : Number(y)]); }));
        places.forEach((p, i) => { const k = `${Math.floor(p.lat)}:${Math.floor(p.lon)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
        return {places, people, at, grid};
    }
    let shareFam = null, shareAt = 0;
    /** share : sans les vivants (un export, un envoi, la consultation) ; sinon les données de « Dans la famille » (app-listes-famille.js) */
    async function famData(share) {
        if (!share && LF()) { await LF().ready(); const F = LF().data(); if (F) return F; }
        if (shareFam && Date.now() - shareAt < 600000) return shareFam;
        let r = {}; try { r = await A().api('ld_famille', {share: 1}); } catch (_) { r = {}; }
        shareFam = buildFam(r || {}); shareAt = Date.now(); return shareFam;
    }
    function nearest(F, lat, lon, max) {
        if (!F || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const dl = Math.ceil(max / 111), dn = Math.ceil(max / (111 * Math.max(0.05, Math.cos(lat * RAD)))), la = Math.floor(lat), lo = Math.floor(lon); let best = null;
        for (let i = la - dl; i <= la + dl; i++) for (let j = lo - dn; j <= lo + dn; j++) {
            const c = F.grid.get(`${i}:${j}`); if (!c) continue;
            for (const pi of c) { const p = F.places[pi], k = kmBetween(lat, lon, p.lat, p.lon); if (k <= max && (!best || k < best[1])) best = [pi, k]; }
        }
        return best;
    }
    /** quelqu'un de la famille vivait-il à moins de max km cette année-là ? */
    function lived(F, lat, lon, year, max) {
        if (!F || !Number.isFinite(year)) return false;
        const dl = Math.ceil(max / 111), dn = Math.ceil(max / (111 * Math.max(0.05, Math.cos(lat * RAD)))), la = Math.floor(lat), lo = Math.floor(lon);
        for (let i = la - dl; i <= la + dl; i++) for (let j = lo - dn; j <= lo + dn; j++) {
            const c = F.grid.get(`${i}:${j}`); if (!c) continue;
            for (const pi of c) { const p = F.places[pi]; if (kmBetween(lat, lon, p.lat, p.lon) > max) continue;
                for (const [ix, ey] of F.at[pi]) { const q = F.people[ix], b = q.b, d = q.d; const alive = (b == null || b <= year) && (d != null ? year <= d : b != null ? year - b <= 100 : true); if (alive && (ey == null || Math.abs(ey - year) <= 50) && !(b == null && d == null && ey == null)) return true; } }
        }
        return false;
    }

    /* ═════════ Les lignes d'une liste, filtrées ═════════ */
    const rowsMem = new Map();
    const rowTitle = (d, r) => { const fs = fieldsOf(d), f = fs.find(x => ['text', 'place', 'enum'].includes(x.type || 'text') && r[x.key] != null && r[x.key] !== '') || fs.find(x => r[x.key] != null && r[x.key] !== ''); const v = f ? r[f.key] : r.title || r.name || r.label || ''; return String(Array.isArray(v) ? v.join(', ') : v).slice(0, 80); };
    const val = (r, k) => { const v = r?.[k]; return Array.isArray(v) ? (v[0] ?? '') : v ?? ''; };
    async function listRows(cfg, share) {
        const d = listById(cfg.list);
        if (!d) return {rows: [], note: T('Cette liste n’existe plus.')};
        if (!eligible(d)) return {d, rows: [], note: T('Cette liste n’est pas disponible ici.')};
        if (!(await E().isInstalled?.(d))) return {d, rows: [], notInstalled: true, note: T('{l} : pas encore téléchargée sur cet ordinateur.', {l: T(d.label)})};
        const st = {...(E().blank?.() || {}), q: '', crit: []};
        const from = Number(cfg.from), to = Number(cfg.to), hasF = cfg.from !== '' && cfg.from != null && Number.isFinite(from), hasT = cfg.to !== '' && cfg.to != null && Number.isFinite(to);
        if (d.period && (hasF || hasT)) st.period = {from: hasF ? from : -9999, to: hasT ? to : 9999, mode: 'overlap', label: `📅 ${hasF ? from : '…'} → ${hasT ? to : '…'}`};
        (cfg.filt || []).forEach(f => { if (f && f.key && Array.isArray(f.values) && f.values.length) st.crit.push({kind: 'enum', key: f.key, values: f.values.slice(0, 50)}); });
        if (cfg.near && Number.isFinite(Number(cfg.near.lat))) st.near = {lat: Number(cfg.near.lat), lon: Number(cfg.near.lon), km: clamp(Number(cfg.near.km) || 30, 1, 2000), title: String(cfg.near.title || '')};
        const key = JSON.stringify([d.id, st.period, st.crit, st.near]);
        let hit = rowsMem.get(key);
        if (!hit || Date.now() - hit.t > 60000) {
            hit = {t: Date.now(), p: (async () => {
                if (d.query) { // grandes données : le serveur filtre, par pages de 2 000
                    const got = []; let total = Infinity;
                    while (got.length < Math.min(total, MAX_ROWS)) { const p = await E().fetchPage(d, st, got.length, 2000); const rows = p.rows || []; total = Number(p.total) || rows.length; if (!rows.length) break; got.push(...rows); if (!p.more && got.length >= total) break; }
                    return got;
                }
                const p = await E().fetchPage(d, st, 0, MAX_ROWS); return p.all || p.rows || [];
            })()};
            rowsMem.set(key, hit);
        }
        let rows;
        try { rows = await hit.p; } catch (e) { rowsMem.delete(key); return {d, rows: [], note: e.message || String(e)}; }
        // 👪 près des lieux de la famille, quand la famille y vivait : calculé ici (rien ne part sur Internet)
        if ((cfg.fam || cfg.famOnly) && d.geo) {
            const F = await famData(share), km = clamp(Number(cfg.km) || kmFor(d), 1, 2000), out = [];
            for (let i = 0; i < rows.length; i++) {
                if (i && i % CHUNK === 0 && rows.length > BIG) await tick();
                const r = rows[i], g = E().geoOf?.(d, r); if (!g) continue;
                const n = nearest(F, g[0], g[1], km); if (!n) continue;
                if (cfg.famOnly) { const y = E().periodOf?.(d, r)?.[0]; if (!lived(F, g[0], g[1], y, km)) continue; }
                out.push(r);
            }
            rows = out;
        }
        return {d, rows};
    }

    /* ═════════ Le calcul : lignes → chiffres du diagramme ═════════ */
    const autoBin = span => (span <= 30 ? 1 : span <= 200 ? 10 : span <= 500 ? 20 : 50);
    const binLabel = (b, step) => (step === 1 || step === 10 ? String(b) : `${b}–${String(b + step - 1).slice(-2)}`);
    const MONTHS = () => ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'].map(m => T(m));
    /** chaque ligne → {r, y, m, g, fam} (par morceaux au-delà de 50 000 lignes) */
    async function prepare(d, rows, cfg, F) {
        const km = clamp(Number(cfg.km) || kmFor(d), 1, 2000), needFam = [cfg.x, cfg.color, cfg.group].includes('_fam') || cfg.gal === 'net', df = dateField(d), out = new Array(rows.length);
        for (let i = 0; i < rows.length; i++) {
            if (i && i % CHUNK === 0 && rows.length > BIG) await tick();
            const r = rows[i], p = E().periodOf?.(d, r), g = d.geo ? E().geoOf?.(d, r) : null;
            const t = {r, y: p ? p[0] : null, m: null, g, fam: ''};
            if (df) { const m = String(r[df.key] ?? '').match(/^-?\d{3,4}-(\d{2})/); if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) t.m = Number(m[1]) - 1; }
            if (needFam && g && F) { const n = nearest(F, g[0], g[1], km); t.fam = n ? T('Autour de {p}', {p: F.places[n[0]].name}) : ''; }
            out[i] = t;
        }
        return out;
    }
    const keyOf = (t, k, step) => (k === '_time' ? (Number.isFinite(t.y) ? Math.floor(t.y / step) * step : null) : k === '_fam' ? t.fam || null : k === '_month' ? t.m : (v => (v === '' || v == null ? null : String(v)))(val(t.r, k)));
    const yOf = (t, y) => { if (!y || y === '_count') return 1; const n = Number(val(t.r, y.replace(/^(sum|avg):/, ''))); return Number.isFinite(n) ? n : null; };
    /** les catégories (X) × les séries (couleur) → {cats: [[clé, libellé]], series: [nom], vals: Map(cat → Map(série → [somme, n]))} */
    function crossTab(tuples, cfg, step, {maxCats = 24, maxSer = 6} = {}) {
        const xs = new Map(), sers = new Map(), cell = new Map(), y = cfg.y || '_count';
        for (const t of tuples) {
            const x = keyOf(t, cfg.x, step); if (x == null) continue;
            const v = yOf(t, y); if (v == null) continue;
            const s = cfg.color ? keyOf(t, cfg.color, step) ?? T('Inconnu') : '';
            xs.set(x, (xs.get(x) || 0) + v); sers.set(s, (sers.get(s) || 0) + v);
            const k = x + '\u0001' + s, c = cell.get(k) || [0, 0]; c[0] += v; c[1]++; cell.set(k, c);
        }
        let cats;
        if (cfg.x === '_time' && xs.size) { const ks = [...xs.keys()].map(Number), lo = Math.min(...ks), hi = Math.max(...ks); cats = []; for (let b = lo; b <= hi && cats.length < 400; b += step) cats.push([b, binLabel(b, step)]); }
        else cats = [...xs.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => [k, String(k)]);
        let others = false; if (cfg.x !== '_time' && cats.length > maxCats) { cats = cats.slice(0, maxCats - 1); others = true; }
        let sNames = [...sers.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k), sOthers = false;
        if (sNames.length > maxSer) { sNames = sNames.slice(0, maxSer - 1); sOthers = true; }
        const avg = /^avg:/.test(y), get = (x, s) => { const c = cell.get(x + '\u0001' + s); return c ? (avg ? c[0] / c[1] : c[0]) : 0; };
        const catKeys = new Set(cats.map(c => String(c[0])));
        const rows = cats.map(([k, label]) => { const row = {label}; sNames.forEach((s, j) => { row['s' + j] = round(get(k, s)); }); if (sOthers) row['s' + sNames.length] = round([...sers.keys()].filter(s => !sNames.includes(s)).reduce((a, s) => a + get(k, s), 0)); return row; });
        if (others) { const row = {label: T('Autres')}; sNames.forEach((s, j) => { row['s' + j] = round([...xs.keys()].filter(x => !catKeys.has(String(x))).reduce((a, x) => a + get(x, s), 0)); }); rows.push(row); }
        const names = sNames.map(s => s || yLabel(cfg)); if (sOthers) names.push(T('Autres'));
        return {rows, series: names.map(name => ({name}))};
    }
    const round = v => Math.round(v * 100) / 100;
    const fieldLabel = (d, k) => (k === '_time' ? T('Date') : k === '_fam' ? T('Lieu de la famille le plus proche') : k === '_month' ? T('Mois') : T(fieldsOf(d).find(f => f.key === k)?.label || k));
    let curD = null;
    const yLabel = cfg => (!cfg.y || cfg.y === '_count' ? T('Nombre') : (/^avg:/.test(cfg.y) ? T('Moyenne de {f}', {f: fieldLabel(curD, cfg.y.slice(4))}) : T('Somme de {f}', {f: fieldLabel(curD, cfg.y.slice(4))})));

    /** le diagramme d'une configuration : {spec, sum, n, d, note} (base : le diagramme d'avant, dont on garde la mise en forme) */
    async function compute(cfg0, base = {}, {share = false} = {}) {
        const cfg = {...cfg0};
        if (cfg.src === 'ask' && cfg.ask && !cfg.list) { const u = await understand(cfg.ask); Object.assign(cfg, u.cfg); }
        const res = await listRows(cfg, share), d = res.d; curD = d;
        if (!d || res.note) return {d, n: 0, note: res.note || T('Choisis une liste.'), notInstalled: !!res.notInstalled};
        const F = (cfg.fam || cfg.famOnly || [cfg.x, cfg.color].includes('_fam') || ['life', 'net'].includes(cfg.gal)) ? await famData(share) : null;
        const sug = suggestFields(d, cfg, res.rows);
        ['x', 'y', 'color'].forEach(k => { if (cfg[k] === undefined) cfg[k] = sug[k]; });
        if (!cfg.gal) cfg.gal = suggestKinds(profileOf(d, cfg), 'all')[0] || 'bars';
        const tuples = await prepare(d, res.rows, cfg, F);
        const ys = tuples.map(t => t.y).filter(Number.isFinite), span = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
        const step = Number(cfg.bin) > 0 ? Number(cfg.bin) : autoBin(span);
        const kind = cfg.two ? (base.kind === 'line' && base.o?.y2 ? 'line' : 'smallmult') : kindOf(cfg.gal, cfg);
        const o = {...(base.o || {})};
        const s = {kind, o};
        const title = (d.icon ? '' : '') + T(d.label);
        if (!o.title || o.title === base.__auto || o.title === R()?.KINDS?.[base.kind]?.sample?.()?.o?.title) o.title = title;
        const pickTitle = t => rowTitle(d, t.r);
        const sortT = arr => arr.filter(t => Number.isFinite(t.y)).sort((a, b) => a.y - b.y);
        if (cfg.two) { // deux séries : la même frise des années, deux panneaux (ou un seul dessin avec un deuxième axe)
            const a = crossTab(tuples, {...cfg, x: '_time', color: ''}, step), other = await secondSeries(cfg.two, step, share);
            const map = new Map(a.rows.map(r => [r.label, r])); other.rows.forEach(r => { if (!map.has(r.label)) map.set(r.label, {label: r.label, s0: 0}); map.get(r.label).s1 = r.s0; });
            const lab = l => Number(String(l).slice(0, 5)); s.rows = [...map.values()].sort((x, y) => lab(x.label) - lab(y.label)).map(r => ({label: r.label, s0: r.s0 ?? 0, s1: r.s1 ?? 0}));
            s.series = [{name: `${T(d.label)} · ${yLabel(cfg)}`}, {name: other.name}];
            if (kind === 'smallmult') { o.sameScale = false; o.cols = 1; } else o.y2 = '1';
        } else if (['columns', 'stacked', 'line', 'radar', 'smallmult', 'treemap'].includes(kind)) {
            const c = crossTab(tuples, kind === 'treemap' ? {...cfg, color: ''} : cfg, step, {maxCats: kind === 'radar' ? 12 : 24});
            s.rows = c.rows; s.series = c.series;
            if (kind === 'treemap') { s.rows = s.rows.filter(r => r.s0 > 0); s.series = s.series.slice(0, 1); }
        } else if (kind === 'heatmap') {
            const by = new Map();
            tuples.forEach(t => { if (!Number.isFinite(t.y) || t.m == null) return; const b = Math.floor(t.y / step) * step; if (!by.has(b)) by.set(b, new Array(12).fill(0)); by.get(b)[t.m] += yOf(t, cfg.y) || 0; });
            s.rows = [...by.keys()].sort((a, b) => a - b).slice(-60).map(b => { const row = {label: binLabel(b, step)}; by.get(b).forEach((v, j) => { row['s' + j] = round(v); }); return row; });
            s.series = MONTHS().map(name => ({name}));
        } else if (kind === 'scatter') {
            const nk = numFields(d).find(f => `avg:${f.key}` === cfg.y || `sum:${f.key}` === cfg.y)?.key || numFields(d)[0]?.key, sz = cfg.size && cfg.size !== nk ? cfg.size : '';
            s.rows = tuples.filter(t => Number.isFinite(t.y) && nk && Number.isFinite(Number(val(t.r, nk)))).slice(0, 1500).map(t => ({label: (cfg.label ? String(val(t.r, cfg.label)) : pickTitle(t)).slice(0, 60), x: t.y, y: Number(val(t.r, nk)), ...(sz && Number.isFinite(Number(val(t.r, sz))) ? {size: Number(val(t.r, sz))} : {})}));
            o.xLabel = o.xLabel || T('Année'); o.yLabel = o.yLabel || fieldLabel(d, nk);
        } else if (kind === 'dotmap') {
            s.places = {}; const seen = new Map();
            s.rows = tuples.filter(t => t.g).slice(0, 3000).map(t => { let lab = (cfg.label ? String(val(t.r, cfg.label)) : pickTitle(t)).slice(0, 60) || T('Sans nom'); const k0 = fold(lab); const n = (seen.get(k0) || 0) + 1; seen.set(k0, n); if (n > 1) lab = `${lab} (${n})`;
                s.places[fold(lab)] = {lat: t.g[0], lon: t.g[1], n: lab}; return {label: lab, date: Number.isFinite(t.y) ? String(t.y) : '', kind: cfg.color ? String(keyOf(t, cfg.color, step) ?? '') : T(d.label), name: ''}; });
            o.colorBy = cfg.color ? 'kind' : o.colorBy || 'one';
        } else if (kind === 'chrono') {
            s.rows = sortT(tuples).slice(0, 120).map(t => ({date: String(val(t.r, dateField(d)?.key) || t.y), label: (cfg.label ? String(val(t.r, cfg.label)) : pickTitle(t)).slice(0, 60)}));
        } else if (kind === 'histogram') {
            const nk = numFields(d).find(f => `avg:${f.key}` === cfg.y || `sum:${f.key}` === cfg.y || f.key === cfg.size)?.key || numFields(d)[0]?.key;
            s.rows = tuples.map(t => (nk ? Number(val(t.r, nk)) : t.y)).filter(Number.isFinite).slice(0, 20000).map(value => ({value}));
            o.unit = o.unit || (nk ? '' : T('ans'));
        } else if (kind === 'sunburst' || kind === 'sankey') {
            const inner = cfg.color || cfg.group || catFields(d).find(f => f.key !== cfg.x)?.key || '', outer = cfg.x;
            const c = new Map(); tuples.forEach(t => { const a = keyOf(t, inner, step), b = keyOf(t, outer, step); if (a == null || b == null) return; const k = a + '\u0001' + b; c.set(k, (c.get(k) || 0) + (yOf(t, cfg.y) || 0)); });
            const top = [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, kind === 'sankey' ? 40 : 80);
            if (kind === 'sankey') s.rows = top.map(([k, v]) => { const [a, b] = k.split('\u0001'); return {from: a, to: outer === '_time' ? binLabel(Number(b), step) : b, value: round(v)}; });
            else { const parents = [...new Set(top.map(([k]) => k.split('\u0001')[0]))]; s.rows = [...parents.map(p => ({name: p, parent: ''})), ...top.map(([k, v]) => { const [a, b] = k.split('\u0001'); return {name: `${outer === '_time' ? binLabel(Number(b), step) : b} · ${a}`.slice(0, 80), parent: a, value: round(v)}; })]; o.sizeBy = 'value'; }
        } else if (kind === 'network') {
            const links = new Map(), nodes = new Map();
            sortT(tuples).filter(t => t.fam || keyOf(t, cfg.color || cfg.x, step) != null).slice(-150).forEach(t => {
                const a = `${pickTitle(t)}${Number.isFinite(t.y) ? ` (${t.y})` : ''}`.slice(0, 60), b = t.fam || String(keyOf(t, cfg.color || cfg.x, step));
                nodes.set(a, {name: a, group: T(d.label)}); nodes.set(b, {name: b, group: t.fam ? T('Lieux de la famille') : fieldLabel(d, cfg.color || cfg.x)});
                links.set(a + '\u0001' + b, {a, b, kind: T(d.label), weight: 1});
            });
            s.rows = [...links.values()]; s.nodes = [...nodes.values()]; s.kinds = [];
        } else if (kind === 'timeline') { // 🎸 la vie des ancêtres et, par-dessus, les lignes de la liste
            const ppl = (F?.people || []).filter(p => Number.isFinite(p.b) && Number.isFinite(p.d) && p.d >= p.b && p.d - p.b < 120);
            const ev = sortT(tuples);
            const score = p => ev.reduce((a, t) => a + (t.y >= p.b && t.y <= p.d ? 1 : 0), 0);
            const chosen = (ppl.some(p => p.a) ? ppl.filter(p => p.a) : ppl).map(p => [p, score(p)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1] || a[0].b - b[0].b).slice(0, 6).map(x => x[0]).sort((a, b) => a.b - b.b);
            s.rows = chosen.map(p => ({name: p.n, roles: T('Vie'), start: String(p.b), end: String(p.d)}));
            s.roles = [{role: T('Vie'), color: '#4e79a7'}];
            const lo = Math.min(...chosen.map(p => p.b)), hi = Math.max(...chosen.map(p => p.d));
            s.events = (chosen.length ? ev.filter(t => t.y >= lo && t.y <= hi) : ev).slice(0, 40).map(t => ({date: String(t.y), label: pickTitle(t).slice(0, 40), kind: 'autre'}));
            if (!chosen.length) s.rows = [];
            o.order = o.order || 'start';
        }
        o.source = sourcesText(d, cfg, share);
        s.__auto = title;
        const n = res.rows.length;
        return {spec: s, d, n, cfg, sum: summary(d, cfg, n), step};
    }
    async function secondSeries(two, step, share) {
        if (two.src === 'births') { // 🌳 les naissances des personnes placées de la généalogie (sans les vivants quand ça sort)
            const F = await famData(share), by = new Map();
            (F?.people || []).forEach(p => { if (!Number.isFinite(p.b)) return; const b = Math.floor(p.b / step) * step; by.set(b, (by.get(b) || 0) + 1); });
            return {name: T('Naissances dans ma famille'), rows: [...by.entries()].map(([b, n]) => ({label: binLabel(b, step), s0: n}))};
        }
        const d = listById(two.list); if (!d) return {name: '—', rows: []};
        const r = await listRows({list: two.list, from: two.from, to: two.to}, share), tuples = await prepare(d, r.rows || [], {}, null);
        const y = two.y || (numFields(d)[0] ? 'avg:' + numFields(d)[0].key : '_count'), prev = curD; curD = d;
        const c = crossTab(tuples, {x: '_time', y, color: ''}, step); const name = `${T(d.label)} · ${yLabel({y})}`; curD = prev;
        return {name, rows: c.rows};
    }
    function sourcesText(d, cfg, share) {
        const tree = cfg.fam || cfg.famOnly || [cfg.x, cfg.color].includes('_fam') || ['life', 'net'].includes(cfg.gal) || cfg.two?.src === 'births';
        const two = cfg.two?.list ? listById(cfg.two.list) : null;
        const parts = [d, two].filter(Boolean).map(x => x.source || T(x.label)).filter((v, i, a) => a.indexOf(v) === i);
        if (tree) parts.push(T('Ta généalogie (privée)'));
        let t = T('Sources : {s}', {s: parts.join(' ; ')});
        if (share) t += ' · ' + T('chiffres du {d}', {d: new Date().toLocaleDateString('fr-FR')});
        return t;
    }
    function summary(d, cfg, n) {
        const p = [];
        if (cfg.from || cfg.to) p.push(`${cfg.from || '…'}–${cfg.to || '…'}`);
        if (cfg.fam) p.push(T('à moins de {km} km des lieux de la famille', {km: cfg.km || kmFor(d)}));
        if (cfg.near?.title) p.push(T('à moins de {km} km de {p}', {km: cfg.near.km, p: cfg.near.title}));
        if (cfg.famOnly) p.push(T('quand la famille y vivait'));
        return T('{n} lignes de « {l} »', {n: nf(n), l: T(d.label)}) + (p.length ? ', ' + p.join(', ') : '') + '.';
    }

    /* ═════════ 💬 Une question → une liste et ses filtres ═════════ */
    async function understand(q) {
        if (!ext.dataAsk) throw new Error(T('La question en français n’est pas chargée.'));
        const r = await ext.dataAsk(q), u = r.u || {}, d = r.d || u.d;
        const cfg = {list: d && eligible(d) ? d.id : ''};
        if (Array.isArray(u.years)) { cfg.from = String(u.years[0] ?? ''); cfg.to = String(u.years[1] ?? ''); }
        if (u.where === 'family') { cfg.fam = true; cfg.km = Number(u.km) || (d ? kmFor(d) : 15); }
        else if (u.where === 'place' && u.center && Number.isFinite(Number(u.center.lat))) cfg.near = {lat: Number(u.center.lat), lon: Number(u.center.lon), km: Number(u.km) || 30, title: String(u.center.title || '')};
        const th = (ext.dataListThemes || []).find(t => t.id === u.themes?.[0]?.id);
        const chips = [[T('Quoi'), `${th ? th.icon + ' ' + T(th.label) : ''}${d ? ` › ${T(d.label)}` : ''}` || '—'], [T('Où'), cfg.fam ? `📍 ${T('les lieux de la famille')}, ${cfg.km} km` : cfg.near ? `📍 ${cfg.near.title}, ${cfg.near.km} km` : `📍 ${T('partout')}`], [T('Quand'), cfg.from || cfg.to ? `📅 ${cfg.from || '…'}–${cfg.to || '…'}` : T('toutes les années')]];
        return {cfg, chips, d};
    }

    /* ═════════ Tenu à jour (dans l'app) / figé (ce qui sort) ═════════ */
    const liveMem = new Map();
    /** spec.live.data → le diagramme recalculé ; ro.share (export, envoi) ou la consultation : sans les vivants, daté */
    async function resolve(spec, ro = {}) {
        const cfg = spec.live?.data; if (!cfg) return spec;
        const share = !!ro.share || kiosk(), key = JSON.stringify([cfg, share, spec.kind, spec.o?.y2 || '']);
        let hit = liveMem.get(key);
        if (!hit || Date.now() - hit.t > 60000) { hit = {t: Date.now(), p: compute(cfg, spec, {share})}; liveMem.set(key, hit); }
        let r; try { r = await hit.p; } catch (_) { liveMem.delete(key); return spec; }
        if (!r.spec) return spec;
        const out = {...clone(r.spec), live: spec.live}; out.o = {...out.o, title: spec.o?.title || out.o.title, subtitle: spec.o?.subtitle ?? out.o.subtitle};
        delete out.__auto; return out;
    }
    /** ce qui part dans un fichier : les chiffres d'aujourd'hui, sans les vivants, sans la recette « tenue à jour » */
    async function frozen(spec) { const s = await resolve(spec, {share: true}); const out = clone(s); delete out.live; delete out.dataRecipe; return out; }

    /* ═════════ ⭐ Modèles : la mise en forme et la recette, jamais un chiffre ni un nom ═════════ */
    const FORMAT_KEYS = ['palette', 'colors', 'font', 'bg', 'bgColor', 'fg', 'lineW', 'radius', 'scale', 'grid', 'style', 'legend', 'titleAlign', 'width', 'height', 'format', 'log', 'y2', 'facet', 'facetCols', 'values', 'sameScale', 'cols', 'chartHeight', 'colorBy', 'labels', 'sort', 'angle', 'hole', 'dotSize', 'opacity'];
    const RECIPE_KEYS = ['src', 'list', 'from', 'to', 'fam', 'km', 'famOnly', 'x', 'y', 'color', 'size', 'label', 'group', 'time', 'bin', 'gal', 'live'];
    function modelOf(spec, name = '') {
        const o = spec?.o || {}, fo = {};
        FORMAT_KEYS.forEach(k => { const v = o[k]; if (v === undefined || v === '' || v === null) return; if (typeof v === 'number' || typeof v === 'boolean') fo[k] = v; else if (k === 'colors' && Array.isArray(v)) fo[k] = v.filter(c => /^#[0-9a-f]{3,8}$/i.test(String(c))).slice(0, 16); else if (typeof v === 'string' && v.length <= 40 && /^[\p{L}\p{N} #._:-]*$/u.test(v)) fo[k] = v; });
        const data = {}, c = spec?.live?.data || {};
        RECIPE_KEYS.forEach(k => { const v = c[k]; if (v === undefined || v === null || v === '') return; if (['fam', 'famOnly', 'live'].includes(k)) data[k] = !!v; else if (k === 'km' || k === 'bin') data[k] = Number(v) || 0; else if (['from', 'to'].includes(k)) { if (/^-?\d{1,4}$/.test(String(v))) data[k] = String(v); } else if (/^[a-z0-9_:.-]{1,80}$/i.test(String(v))) data[k] = String(v); });
        if (data.src === 'ask') data.src = 'list'; // la question peut contenir un lieu, un nom : seulement la liste trouvée
        return {lcnda_diagram_model: 1, name: String(name || '').replace(/[<>]/g, '').slice(0, 60), kind: String(spec?.kind || 'columns').replace(/[^a-z0-9_]/gi, ''), o: fo, data};
    }
    const models = () => (Array.isArray(readJ(K_MOD, [])) ? readJ(K_MOD, []) : []);
    function saveModel(spec, name) { const m = modelOf(spec, name); const all = models().filter(x => x.name !== m.name); all.unshift(m); writeJ(K_MOD, all.slice(0, 40)); return m; }
    /** un modèle → un diagramme (il se remplit avec MES données) */
    function applyModel(m, base = {}) {
        if (!m || m.lcnda_diagram_model !== 1) throw new Error(T('Ce fichier n’est pas un modèle de diagramme.'));
        const k = R()?.KINDS?.[m.kind] ? m.kind : 'columns', clean = modelOf({kind: k, o: m.o || {}, live: {data: m.data || {}}});
        return {kind: k, o: {...(base.o || {}), ...clean.o}, rows: [], live: clean.data.list ? {data: {...clean.data, live: clean.data.live !== false}, label: ''} : undefined};
    }

    /* ═════════ 🖼 Format : écran, 16:9, A4, carré (le dessin est centré, le fond suit) ═════════ */
    const RATIOS = {'169': 16 / 9, a4: 297 / 210, carre: 1};
    function finish(svg, spec) {
        const r = RATIOS[spec?.o?.format]; if (!r || typeof svg !== 'string') return svg;
        const m = svg.match(/^<svg\b[^>]*viewBox="0 0 ([\d.]+) ([\d.]+)"/); if (!m) return svg;
        const W = Number(m[1]), H = Number(m[2]); let W2 = W, H2 = H;
        if (W / H > r) H2 = W / r; else W2 = H * r;
        const dx = (W2 - W) / 2, dy = (H2 - H) / 2, bg = (svg.match(/<rect class="dg-bg"[^>]*fill="([^"]+)"/) || [])[1] || (spec.o?.bg === 'transparent' ? '' : '#ffffff');
        const W3 = Math.ceil(W2), H3 = Math.ceil(H2);
        return svg.replace(/viewBox="0 0 [\d.]+ [\d.]+" width="[\d.]+" height="[\d.]+"/, `viewBox="0 0 ${W3} ${H3}" width="${W3}" height="${H3}"`)
            .replace(/(<svg\b[^>]*>)/, `$1${bg ? `<rect class="dgd-frame" width="${W3}" height="${H3}" fill="${esc(bg)}"/>` : ''}<g class="dgd-fmt" transform="translate(${dx.toFixed(1)} ${dy.toFixed(1)})">`).replace(/<\/svg>\s*$/, '</g></svg>');
    }
    const prevFinish = R()?.finish;
    const installFinish = () => { const DR = R(); if (DR && !DR.finish?.__dgd) { const before = typeof DR.finish === 'function' ? DR.finish : null; DR.finish = (svg, spec) => finish(before ? before(svg, spec) : svg, spec); DR.finish.__dgd = true; } };
    if (!prevFinish?.__dgd) { if (R()) installFinish(); else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', installFinish); }

    /* ═════════ ⚙️ Personnaliser : format, note d'un clic, ⭐ modèle, deux panneaux / deuxième axe ═════════ */
    const FORMATS = () => [['', T('Écran')], ['169', '16:9'], ['a4', 'A4'], ['carre', T('Carré (réseaux)')]];
    let armedNote = null;
    (ext.diagramPersoExtra = ext.diagramPersoExtra || []).push({
        id: 'dgd-format', title: `🖼 ${T('Format, note, modèle')}`, hint: T('Le format change la forme de l’image (le dessin est centré). La note se pose d’un clic sur une colonne de l’aperçu. Un modèle garde la mise en forme et la recette, jamais les chiffres ni les noms.'),
        html: s => `<div class="dgd-perso"><span class="h-dgp-row"><span>${esc(T('Format'))}</span><span class="segmented sm" role="group" aria-label="${esc(T('Format'))}">${FORMATS().map(([k, l]) => `<button type="button" data-dgd-format="${k}" aria-pressed="${String((s.o?.format || '') === k)}">${esc(l)}</button>`).join('')}</span></span>
            ${s.live?.data?.two ? `<span class="h-dgp-row"><span>${esc(T('Deux séries'))}</span><span class="segmented sm" role="group"><button type="button" data-dgd-two="panels" aria-pressed="${String(s.kind !== 'line')}">${esc(T('Deux panneaux'))}</button><button type="button" data-dgd-two="axis" aria-pressed="${String(s.kind === 'line')}">${esc(T('Deuxième axe à droite'))}</button></span></span>` : ''}
            <div class="dgd-perso-act"><button type="button" class="button small secondary" data-dgd-note>＋ ${esc(T('Ajouter une note'))}</button>${kiosk() ? '' : `<button type="button" class="button small secondary" data-dgd-model>⭐ ${esc(T('Enregistrer comme modèle'))}</button>`}</div></div>`,
        bind: (el, api, sig) => el.addEventListener('click', e => {
            const b = e.target.closest?.('button'); if (!b || !el.contains(b)) return;
            const s = api.spec(); s.o = s.o || {};
            if (b.dataset.dgdFormat !== undefined) { if (b.dataset.dgdFormat) s.o.format = b.dataset.dgdFormat; else delete s.o.format; return api.changed(); }
            if (b.dataset.dgdTwo) { s.kind = b.dataset.dgdTwo === 'axis' ? 'line' : 'smallmult'; if (s.kind === 'line') { s.o.y2 = '1'; } else { delete s.o.y2; s.o.sameScale = false; s.o.cols = 1; } return api.changed(); }
            if (b.hasAttribute('data-dgd-note')) { armedNote = api; toast(T('Clique sur une colonne de l’aperçu pour y poser la note.')); return; }
            if (b.hasAttribute('data-dgd-model')) return askModelName(s);
        }, sig),
    });
    async function askModelName(spec) {
        const done = name => { name = String(name || '').trim(); if (!name) return false; saveModel(spec, name); toast(T('⭐ Modèle « {n} » enregistré : la mise en forme et la recette, sans chiffres ni noms.', {n: name.slice(0, 60)})); return true; };
        if (!ext.openDialog) return done(T('Mon modèle'));
        ext.openDialog({eyebrow: T('Diagramme'), title: `⭐ ${T('Enregistrer comme modèle')}`, submitLabel: T('Enregistrer'),
            body: `<label>${esc(T('Nom du modèle'))}<input name="dgd_model" maxlength="60" value="${esc(T('Mon modèle'))}" data-dgd-modelname></label><p class="ui-hint">${esc(T('Seulement la mise en forme et la recette (liste, filtres, champs) : un cousin l’ouvre et il se remplit avec son arbre.'))}</p>`,
            onSubmit: form => done(form.querySelector('[name=dgd_model]')?.value)});
    }
    // 📝 la note d'un clic : le point cliqué de l'aperçu (en part de la largeur et de la hauteur), avec une flèche vers la colonne
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('click', e => {
        if (!armedNote) return; const svg = e.target.closest?.('.h-dg-dlg [data-dg-preview] svg'); if (!svg) return;
        const vb = svg.viewBox.baseVal, pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const m = svg.getScreenCTM(); if (!m || !vb?.width) return;
        const q = pt.matrixTransform(m.inverse()), x = clamp((q.x - vb.x) / vb.width, 0, 1), y = clamp((q.y - vb.y) / vb.height, 0, 1);
        const api = armedNote; armedNote = null; const s = api.spec(); s.o = s.o || {}; s.o.notes = Array.isArray(s.o.notes) ? s.o.notes : [];
        const hit = e.target.closest('[data-tip], rect, path, circle'), label = hit?.querySelector?.('title')?.textContent || '';
        s.o.notes.push({t: 'arrow', text: (label || T('Ma note')).slice(0, 60), x1: clamp(x + .08, .02, .98), y1: clamp(y - .18, .04, .96), x2: x, y2: y, color: '#1d1d1f'});
        api.changed(); toast(T('Note posée : retouche son texte dans « ✏️ Annotations ».'));
    }, true);

    /* ═════════ L'onglet « 📊 Partir des données » ═════════ */
    const SRC = () => [['tree', '🌳', T('Mon arbre')], ['list', '🧰', T('Une liste')], ['ask', '💬', T('Une question')]];
    const step = (n, title, body, extra = '') => `<section class="dgd-step" data-dgd-step="${n}"><h4><span class="dgd-n" aria-hidden="true">${n}</span>${esc(title)}</h4>${extra}${body}</section>`;
    function mount(pane, api) {
        if (!pane || pane.querySelector('[data-dgd]')) return;
        const tree = document.createElement('div'); tree.className = 'dgd-tree'; tree.dataset.dgdTree = '';
        while (pane.firstChild) tree.appendChild(pane.firstChild);
        const box = document.createElement('div'); box.className = 'dgd'; box.dataset.dgd = '';
        pane.appendChild(box); pane.appendChild(tree);
        const st = pane.__dgd || (pane.__dgd = {});
        const start = api.start?.(); const live = api.spec().live?.data || api.spec().dataRecipe;
        st.cfg = st.cfg || (live ? clone(live) : {src: start?.src || 'tree', live: true, ...(start || {})});
        if (start) Object.assign(st.cfg, start);
        if (st.cfg.list && !st.cfg.km) { const d = listById(st.cfg.list); if (d) st.cfg.km = kmFor(d); }
        st.galAll = st.galAll ?? (suggestN() === 'all');
        const ro = kiosk();
        const paint = () => {
            const c = st.cfg, src = c.src || 'tree';
            tree.hidden = src !== 'tree';
            const sw = `<div class="dgd-head"><span class="dgd-lab">${esc(T('D’où viennent les données ?'))}</span><span class="segmented sm dgd-src" role="group" aria-label="${esc(T('D’où viennent les données ?'))}">${SRC().map(([k, ic, l]) => `<button type="button" data-dgd-src="${k}" aria-pressed="${String(src === k)}"${ro && k !== src ? ' disabled' : ''}>${ic} ${esc(l)}</button>`).join('')}</span></div>`;
            if (src === 'tree') { box.innerHTML = sw + `<p class="ui-hint dgd-hint">${esc(T('Les réglages de « 🧮 Compter dans ma base » restent : groupe de personnes, période, regroupement, « Tenir à jour ».'))}</p>`; return; }
            if (ro) { box.innerHTML = sw + `<p class="dgd-ro">🖥 ${esc(T('Mode consultation : lecture seule. On regarde, on survole ; pas de modification, pas d’export, pas d’envoi.'))}</p>`; return; }
            const d = c.list ? listById(c.list) : null;
            const one = src === 'list' ? `${d ? `<div class="dgd-chosen"><b>${esc(d.icon || '📋')} ${esc(T(d.label))}</b><button type="button" class="link-button" data-dgd-change>${esc(T('Changer'))}</button></div>` : ''}<div data-dgd-picker${d ? ' hidden' : ''}></div>`
                : `<form class="dgd-ask" data-dgd-askform><span aria-hidden="true">💬</span><input type="search" data-dgd-ask value="${esc(c.ask || '')}" placeholder="${esc(T('ex. les séismes près de Tulle 1700–1900'))}" aria-label="${esc(T('Ta question'))}"><button type="submit" class="button small">${esc(T('Comprendre'))}</button></form>${st.chips ? `<div class="dgd-understood"><span class="dgd-lab">${esc(T('J’ai compris'))}</span>${st.chips.map(([k, v]) => `<button type="button" class="ui-listbar-chip" data-dgd-fix>${esc(k)} : ${esc(v)}</button>`).join('')}</div>` : ''}`;
            const models0 = models();
            const head = sw + (models0.length ? `<details class="dgd-models"><summary>⭐ ${esc(T('Mes modèles'))} (${models0.length})</summary><div>${models0.map((m, i) => `<button type="button" class="ui-listbar-chip" data-dgd-usemodel="${i}">⭐ ${esc(m.name || T('Sans nom'))}</button>`).join('')}<button type="button" class="link-button" data-dgd-modexp>⤓ ${esc(T('Partager (fichier)'))}</button><label class="link-button dgd-imp">⤒ ${esc(T('Ouvrir un modèle'))}<input type="file" accept=".json,application/json" data-dgd-modimp hidden></label></div></details>` : `<label class="link-button dgd-imp">⤒ ${esc(T('Ouvrir un modèle'))}<input type="file" accept=".json,application/json" data-dgd-modimp hidden></label>`);
            let html = head + step(1, T('Choisir'), one);
            if (d) {
                html += step(2, T('Ne garder que…'), `<div class="dgd-chips" data-dgd-chips>${chipsHtml(d, c)}</div><div data-dgd-addf hidden></div>`, `<p class="ui-hint">${esc(T('Un clic sur × retire une pastille ; le rayon se règle avec − / +.'))}</p>`);
                html += step(3, T('Qui va où'), mapHtml(d, c, st));
                html += step(4, T('Le bon dessin'), galHtml(d, c, st));
                html += step(5, T('Utiliser ce diagramme'), useHtml(c));
                html += `<p class="dgd-src-line" data-dgd-srcline>${srcLinks(d, c)}</p>`;
            }
            box.innerHTML = html;
            const pk = box.querySelector('[data-dgd-picker]');
            if (pk && !pk.hidden) {
                if (ext.dataListPicker) ext.dataListPicker(pk, {compact: true, onlyInstalled: true, filter: eligible, selected: c.list, onPick: dd => { setList(dd); }});
                else pk.innerHTML = `<p class="muted">${esc(T('Chargement…'))}</p>`;
            }
        };
        const setList = dd => { const c = st.cfg; c.list = dd.id; c.km = kmFor(dd); c.fam = !!dd.geo && !!(LF()); c.famOnly = false; c.filt = []; delete c.x; delete c.y; delete c.color; delete c.gal; delete c.two; delete c.near; st.sug = null; paint(); run(); };
        let t0 = 0, seq = 0;
        const run = () => { clearTimeout(t0); t0 = setTimeout(async () => {
            const c = st.cfg, my = ++seq; if (!c.list || c.src === 'tree') return;
            const line = box.querySelector('[data-dgd-srcline]'); if (line) line.classList.add('is-busy');
            try {
                const r = await compute(c, api.spec());
                if (my !== seq || !box.isConnected) return;
                if (r.note) { api.setSum(r.note); toast(r.note, r.notInstalled ? '' : 'error'); return; }
                ['x', 'y', 'color', 'gal'].forEach(k => { if (c[k] === undefined) c[k] = r.cfg[k]; });
                st.sug = suggestFields(r.d, c, []); st.sug.gal = suggestKinds(profileOf(r.d, c), 'all')[0];
                const s = r.spec; delete s.__auto;
                if (c.live) s.live = {data: clone(c), label: T(r.d.label), sum: r.sum}; else delete s.live;
                s.dataRecipe = clone(c); // la recette (sans chiffres) : « 📊 Partir des données » se rouvre sur la même source, même figé
                api.setSpec(s); api.setSum(r.sum + (c.live ? ' ' + T('Tenu à jour.') : ''));
                paint();
            } catch (e) { toast(e.message || String(e), 'error'); }
        }, 120); };
        box.addEventListener('click', async e => {
            const b = e.target.closest('button, [data-dgd-fix]'); if (!b) return;
            const c = st.cfg, d = c.list ? listById(c.list) : null;
            if (b.dataset.dgdSrc) { if (b.dataset.dgdSrc === c.src) return; c.src = b.dataset.dgdSrc; paint(); if (c.src !== 'tree' && c.list) run(); return; }
            if (b.hasAttribute('data-dgd-change')) { const p = box.querySelector('[data-dgd-picker]'); p.hidden = false; box.querySelector('.dgd-chosen')?.remove(); if (ext.dataListPicker) ext.dataListPicker(p, {compact: true, onlyInstalled: true, filter: eligible, selected: c.list, onPick: dd => setList(dd)}); p.querySelector('[data-ld-ov-q]')?.focus(); return; }
            if (b.hasAttribute('data-dgd-fix')) { box.querySelector('[data-dgd-step="2"]')?.scrollIntoView({block: 'nearest'}); return; }
            if (b.dataset.dgdX !== undefined) { const k = b.dataset.dgdX; if (k === 'period') { c.from = ''; c.to = ''; } else if (k === 'fam') c.fam = false; else if (k === 'famOnly') c.famOnly = false; else if (k === 'near') delete c.near; else if (k.startsWith('f:')) c.filt = (c.filt || []).filter(f => f.key !== k.slice(2)); paint(); run(); return; }
            if (b.dataset.dgdOn) { const k = b.dataset.dgdOn; if (k === 'fam') c.fam = true; if (k === 'famOnly') { c.famOnly = true; } paint(); run(); return; }
            if (b.dataset.dgdKm) { const dir = Number(b.dataset.dgdKm), tgt = b.closest('[data-dgd-kmfor]')?.dataset.dgdKmfor; if (tgt === 'near' && c.near) c.near.km = stepKm(c.near.km, dir); else { c.km = stepKm(Number(c.km) || kmFor(d), dir); if (d) setKm(d, c.km); } paint(); run(); return; }
            if (b.hasAttribute('data-dgd-addfilter')) { const h = box.querySelector('[data-dgd-addf]'); h.hidden = false; h.innerHTML = await addFilterHtml(d, c); return; }
            if (b.hasAttribute('data-dgd-addok')) { const h = box.querySelector('[data-dgd-addf]'), key = h.querySelector('[data-dgd-fkey]')?.value, v = h.querySelector('[data-dgd-fval]')?.value; if (key && v) { c.filt = [...(c.filt || []).filter(f => f.key !== key), {key, values: [v]}]; paint(); run(); } return; }
            if (b.dataset.dgdGal) { c.gal = b.dataset.dgdGal; if (c.gal !== 'bars' && c.two) delete c.two; run(); return; }
            if (b.dataset.dgdGalall !== undefined) { st.galAll = b.dataset.dgdGalall === '1'; paint(); return; }
            if (b.hasAttribute('data-dgd-alltypes')) { api.dlg?.querySelector('[data-dg-type]')?.click(); return; }
            if (b.dataset.dgdBin !== undefined) { c.bin = Number(b.dataset.dgdBin) || 0; run(); return; }
            if (b.hasAttribute('data-dgd-two-x')) { delete c.two; run(); return; }
            if (b.hasAttribute('data-dgd-more')) { st.more = !st.more; paint(); return; }
            if (b.dataset.dgdUsemodel !== undefined) { const m = models()[Number(b.dataset.dgdUsemodel)]; if (!m) return; try { const s = applyModel(m, api.spec()); if (s.live?.data) { st.cfg = {...s.live.data, src: 'list'}; api.setSpec(s); paint(); run(); } else { api.setSpec(s); toast(T('Mise en forme appliquée.')); } } catch (err) { toast(err.message, 'error'); } return; }
            if (b.hasAttribute('data-dgd-modexp')) { const blob = new Blob([JSON.stringify({lcnda_diagram_models: 1, models: models()}, null, 1)], {type: 'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'modeles-diagrammes.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return; }
            if (b.hasAttribute('data-dgd-export')) { api.dlg?.querySelector('[data-dg-expdlg]')?.click(); return; }
            if (b.dataset.dgdSend) return send(api, b.dataset.dgdSend, b);
            if (b.hasAttribute('data-dgd-poser')) return poser(api, b);
            if (b.dataset.dgdOpenlist) { const dd = listById(b.dataset.dgdOpenlist); if (dd) { document.querySelectorAll('dialog[open]').forEach(x => { try { x.close(); } catch (_) {} }); E().open?.(dd.id); } return; }
        });
        box.addEventListener('change', async e => {
            const t = e.target, c = st.cfg;
            if (t.dataset.dgdF) { const v = t.value.trim(); if (v && !/^-?\d{1,4}$/.test(v)) { t.setCustomValidity(T('Une année, ex. 1789')); t.reportValidity(); return; } t.setCustomValidity(''); c[t.dataset.dgdF] = v; run(); return; }
            if (t.dataset.dgdMap) { c[t.dataset.dgdMap] = t.value; if (t.dataset.dgdMap === 'color' && c.gal === 'bars') run(); else run(); return; }
            if (t.dataset.dgdTwo !== undefined) { const v = t.value; if (!v) delete c.two; else c.two = v === 'births' ? {src: 'births'} : {src: 'list', list: v}; if (c.two) c.gal = 'lines'; run(); return; }
            if (t.hasAttribute('data-dgd-live')) { c.live = t.checked; run(); return; }
            if (t.hasAttribute('data-dgd-modimp') && t.files?.[0]) { try { const j = JSON.parse(await t.files[0].text()); const list = j.lcnda_diagram_models === 1 ? j.models : [j]; let n = 0; list.forEach(m => { if (m?.lcnda_diagram_model === 1) { const clean = modelOf({kind: m.kind, o: m.o, live: {data: m.data}}, m.name); const all = models().filter(x => x.name !== clean.name); all.unshift(clean); writeJ(K_MOD, all.slice(0, 40)); n++; } }); if (!n) throw new Error(T('Ce fichier n’est pas un modèle de diagramme.')); toast(T('Modèles ajoutés à ⭐ Mes modèles : {n}.', {n})); paint(); } catch (err) { toast(err.message || String(err), 'error'); } }
            if (t.dataset.dgdFkey !== undefined) { const h = box.querySelector('[data-dgd-addf]'); h.innerHTML = await addFilterHtml(listById(c.list), c, t.value); }
        });
        box.addEventListener('submit', async e => {
            if (!e.target.matches('[data-dgd-askform]')) return; e.preventDefault();
            const c = st.cfg, q = e.target.querySelector('[data-dgd-ask]').value.trim(); if (!q) return;
            const btn = e.target.querySelector('button'); btn.disabled = true;
            try { const u = await understand(q); st.chips = u.chips; ['from', 'to', 'fam', 'km', 'near', 'filt', 'famOnly', 'x', 'y', 'color', 'gal', 'two'].forEach(k => delete c[k]); Object.assign(c, u.cfg, {ask: q}); if (!c.list) { paint(); toast(T('Je n’ai pas trouvé de liste pour cette question.'), 'error'); return; } paint(); run(); }
            catch (err) { toast(err.message || String(err), 'error'); } finally { btn.disabled = false; }
        });
        paint();
        if (st.cfg.list && st.cfg.src !== 'tree' && !ro) run();
    }
    function chipsHtml(d, c) {
        const x = (k, lab) => `<button type="button" class="mini chip-x" data-dgd-x="${esc(k)}" aria-label="${esc(T('Retirer : {f}', {f: lab}))}">×</button>`;
        const out = [];
        if (d.period) out.push(`<span class="ui-listbar-chip dgd-chip">📅 <input type="text" inputmode="numeric" data-dgd-f="from" value="${esc(c.from || '')}" placeholder="${esc(T('de'))}" aria-label="${esc(T('De l’an'))}" size="5">–<input type="text" inputmode="numeric" data-dgd-f="to" value="${esc(c.to || '')}" placeholder="${esc(T('à'))}" aria-label="${esc(T('À l’an'))}" size="5">${c.from || c.to ? x('period', T('Période')) : ''}</span>`);
        if (d.geo) {
            const km = Number(c.km) || kmFor(d);
            out.push(c.fam ? `<span class="ui-listbar-chip dgd-chip" data-dgd-kmfor="fam">📍 ${esc(T('Près de la famille'))} · <button type="button" class="mini" data-dgd-km="-1" aria-label="${esc(T('moins loin'))}">−</button>${esc(nf(km))} km<button type="button" class="mini" data-dgd-km="1" aria-label="${esc(T('plus loin'))}">+</button>${x('fam', T('Près de la famille'))}</span>`
                : `<button type="button" class="ui-listbar-chip dgd-chip off" data-dgd-on="fam">📍 ${esc(T('Près de la famille'))}</button>`);
            if (c.near) out.push(`<span class="ui-listbar-chip dgd-chip" data-dgd-kmfor="near">📍 ${esc(T('Autour de {p}', {p: c.near.title}))} · <button type="button" class="mini" data-dgd-km="-1" aria-label="${esc(T('moins loin'))}">−</button>${esc(nf(c.near.km))} km<button type="button" class="mini" data-dgd-km="1" aria-label="${esc(T('plus loin'))}">+</button>${x('near', c.near.title)}</span>`);
            if (d.period) out.push(c.famOnly ? `<span class="ui-listbar-chip dgd-chip">👪 ${esc(T('Seulement quand la famille y vivait'))}${x('famOnly', T('quand la famille y vivait'))}</span>` : `<button type="button" class="ui-listbar-chip dgd-chip off" data-dgd-on="famOnly">👪 ${esc(T('Seulement quand la famille y vivait'))}</button>`);
        }
        (c.filt || []).forEach(f => out.push(`<span class="ui-listbar-chip dgd-chip">🏷 ${esc(fieldLabel(d, f.key))} : ${esc(f.values.join(', '))}${x('f:' + f.key, fieldLabel(d, f.key))}</span>`));
        if (catFields(d).length) out.push(`<button type="button" class="link-button" data-dgd-addfilter>＋ ${esc(T('Filtre'))}</button>`);
        return out.join('');
    }
    async function addFilterHtml(d, c, key = '') {
        const fs = catFields(d); key = key || fs[0]?.key || ''; let vals = [];
        try { const r = await listRows({...c, filt: (c.filt || []).filter(f => f.key !== key)}, false); const n = new Map(); (r.rows || []).forEach(row => { const v = String(val(row, key) ?? ''); if (v) n.set(v, (n.get(v) || 0) + 1); }); vals = [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40); } catch (_) {}
        return `<div class="dgd-addf"><select data-dgd-fkey aria-label="${esc(T('Colonne'))}">${fs.map(f => `<option value="${esc(f.key)}"${f.key === key ? ' selected' : ''}>${esc(T(f.label))}</option>`).join('')}</select><select data-dgd-fval aria-label="${esc(T('Valeur'))}">${vals.map(([v, n]) => `<option value="${esc(v)}">${esc(v)} (${nf(n)})</option>`).join('')}</select><button type="button" class="button small" data-dgd-addok>${esc(T('Ajouter'))}</button></div>`;
    }
    function mapHtml(d, c, st) {
        const sug = st.sug || suggestFields(d, c, []);
        const xs = [...(d.period ? [['_time', T('Date → regroupée')]] : []), ...(d.geo && LF() ? [['_fam', T('Lieu de la famille le plus proche')]] : []), ...catFields(d).map(f => [f.key, T(f.label)])];
        const ys = [['_count', T('Nombre de lignes')], ...numFields(d).flatMap(f => [['avg:' + f.key, T('Moyenne de {f}', {f: T(f.label)})], ['sum:' + f.key, T('Somme de {f}', {f: T(f.label)})]])];
        const cs = [['', '—'], ...(d.geo && LF() ? [['_fam', T('Lieu de la famille le plus proche')]] : []), ...catFields(d).map(f => [f.key, T(f.label)])];
        const sel = (k, lab, opts) => `<span class="dgd-lab">${esc(lab)}</span><select data-dgd-map="${k}" aria-label="${esc(lab)}">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(c[k] ?? '') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${c[k] !== undefined && String(c[k] ?? '') === String(sug[k] ?? '') && sug[k] ? `<span class="dgd-sug">✨ ${esc(T('proposé'))}</span>` : '<span></span>'}`;
        const nums = [['', '—'], ...numFields(d).map(f => [f.key, T(f.label)])], txts = [['', T('Le nom de la ligne')], ...textFields(d).map(f => [f.key, T(f.label)])], grps = [['', '—'], ...catFields(d).map(f => [f.key, T(f.label)])];
        const bin = Number(c.bin) || 0;
        const bins = c.x === '_time' ? `<span class="segmented sm dgd-bins" role="group" aria-label="${esc(T('Regrouper les dates'))}">${[[0, T('Auto')], [1, T('Année')], [10, T('Décennie')], [20, T('20 ans')], [50, T('50 ans')]].map(([v, l]) => `<button type="button" data-dgd-bin="${v}" aria-pressed="${String(bin === v)}">${esc(l)}</button>`).join('')}</span>` : '';
        const others = (E().list?.() || []).filter(x => eligible(x) && x.period && x.id !== d.id).slice(0, 400);
        const two = c.x === '_time' ? `<label class="dgd-two">${esc(T('＋ Une 2e série (même frise des années)'))}<select data-dgd-two><option value="">—</option><option value="births"${c.two?.src === 'births' ? ' selected' : ''}>🌳 ${esc(T('Naissances dans ma famille'))}</option>${others.map(x => `<option value="${esc(x.id)}"${c.two?.list === x.id ? ' selected' : ''}>${esc(x.icon || '📋')} ${esc(T(x.label))}</option>`).join('')}</select></label>${c.two ? `<p class="ui-hint">${esc(T('Deux panneaux l’un sous l’autre, même frise des années ; le deuxième axe à droite est dans ⚙️ Personnaliser.'))}</p>` : ''}` : '';
        return `<div class="dgd-map">${sel('x', 'X', xs)}${sel('y', 'Y', ys)}${sel('color', T('Couleur'), cs)}</div>${bins}
            <details class="dgd-more"${st.more ? ' open' : ''}><summary>＋ ${esc(T('Taille, étiquette, groupe, temps'))}</summary><div class="dgd-map">${sel('size', T('Taille'), nums)}${sel('label', T('Étiquette'), txts)}${sel('group', T('Groupe'), grps)}${sel('time', T('Temps'), [['', '—'], ...(d.period ? [['_time', T('Date (pour ▶ lire dans le temps)')]] : [])])}</div></details>${two}`;
    }
    function galHtml(d, c, st) {
        const p = profileOf(d, c), N = suggestN(), sug = suggestKinds(p, N), all = N === 'all' || st.galAll;
        const list = all ? GALLERY : GALLERY.filter(g => sug.includes(g.id)).sort((a, b) => sug.indexOf(a.id) - sug.indexOf(b.id));
        const cur = c.gal || sug[0];
        const seg = N === 'all' ? '' : `<span class="segmented sm" role="group" aria-label="${esc(T('Dessins'))}"><button type="button" data-dgd-galall="0" aria-pressed="${String(!all)}">✨ ${esc(T('Conseillés'))} (${sug.length})</button><button type="button" data-dgd-galall="1" aria-pressed="${String(all)}">${esc(T('Tous'))} (${GALLERY.length})</button></span>`;
        return `<div class="dgd-galbar">${seg}<button type="button" class="link-button" data-dgd-alltypes>${esc(T('Tous les types du catalogue ▾'))}</button></div>
            <div class="dgd-gal" data-dgd-gal>${list.map(g => { const ok = fits(g, p); return `<button type="button" class="dgd-gt${g.id === cur ? ' is-current' : ''}" data-dgd-gal="${g.id}"${ok ? '' : ' disabled'} aria-pressed="${String(g.id === cur)}"><span class="dgd-gi" aria-hidden="true">${g.icon}</span><b>${esc(T(g.label))}</b><small>${esc(T(g.help))}</small>${sug.includes(g.id) ? `<span class="ui-badge is-green">✨ ${esc(T('conseillé'))}</span>` : ''}</button>`; }).join('')}</div>`;
    }
    function useHtml(c) {
        return `<label class="ui-toggle"><input type="checkbox" data-dgd-live${c.live !== false ? ' checked' : ''}><i></i>${esc(T('Tenir à jour'))}</label><p class="ui-hint">${esc(T('Dans l’app, il suit tes nouvelles données. Ce qui part (PNG, SVG, PDF, Studio, présentation) garde ses chiffres et sa date, sans les personnes vivantes.'))}</p>
            <div class="dgd-use"><button type="button" class="button small secondary" data-dgd-poser>📄 ${esc(T('Poser dans…'))}</button><button type="button" class="button small secondary" data-dgd-export>⤓ ${esc(T('Exporter'))}</button><button type="button" class="button small secondary" data-dgd-send="anim-new">🎬 ${esc(T('Studio'))}</button><button type="button" class="button small secondary" data-dgd-send="keynote">🖥 ${esc(T('Présentation'))}</button><button type="button" class="button small secondary" data-dgd-send="">📤 ${esc(T('Envoyer vers…'))}</button></div>`;
    }
    function srcLinks(d, c) {
        const two = c.two?.list ? listById(c.two.list) : null;
        const one = x => `<span>${esc(x.source || T(x.label))} <button type="button" class="link-button" data-dgd-openlist="${esc(x.id)}" title="${esc(T('Ouvrir la liste d’origine'))}" aria-label="${esc(T('Ouvrir la liste d’origine'))}">↗</button></span>`;
        const tree = c.fam || c.famOnly || [c.x, c.color].includes('_fam') || ['life', 'net'].includes(c.gal) || c.two?.src === 'births';
        return `<span class="dgd-lab">${esc(T('Sources :'))}</span> ${[d, two].filter(Boolean).map(one).join(' · ')}${tree ? ` · <span>${esc(T('Ta généalogie (privée)'))}</span>` : ''}`;
    }

    /* ─── poser, envoyer ─── */
    async function pngOf(svg) {
        const m = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/), w = Number(m?.[3]) || 900, h = Number(m?.[4]) || 600;
        return new Promise((ok, ko) => { const img = new Image(), url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
            img.onload = () => { const c = document.createElement('canvas'); c.width = Math.round(w * 2); c.height = Math.round(h * 2); const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); c.toBlob(b => (b ? ok(b) : ko(new Error(T('Image impossible.')))), 'image/png'); };
            img.onerror = () => { URL.revokeObjectURL(url); ko(new Error(T('Image impossible.'))); }; img.src = url; });
    }
    async function send(api, to, anchor) {
        if (kiosk()) return toast(T('Mode consultation : rien ne sort.'), 'error');
        if (!ext.sendTo) return toast(T('« Envoyer vers… » n’est pas chargé.'), 'error');
        try { const s = await frozen(api.spec()), blob = await pngOf(R().svg(s)); return ext.sendTo('image', {blob}, {to, anchor, title: s.o?.title || T('Diagramme')}); }
        catch (e) { toast(e.message || String(e), 'error'); }
    }
    function poser(api, anchor) {
        const go = where => {
            if (where === 'fiche') return api.goTab?.('links');
            const id = Number(api.id?.()) || 0; if (!id) return toast(T('Enregistre d’abord le diagramme (💾), puis pose-le.'), 'error');
            if (where === 'recap') { const l = readJ(K_RECAP, []); if (!l.includes(id)) { l.push(id); writeJ(K_RECAP, l.slice(-12)); } return toast(T('Posé dans le récap des données (Listes → 🧰 Données).')); }
            if (where === 'dash') return toast(T('Pour le tableau de bord : Réglages → Éditeur de widgets → « Diagramme ».'));
        };
        const items = [{icon: '👤', label: T('Une fiche (onglet « Relier »)'), run: () => go('fiche')}, {icon: '📊', label: T('Le récap des données'), run: () => go('recap')}, {icon: '🏠', label: T('Le tableau de bord'), run: () => go('dash')}];
        if (window.LCNDA_UI?.menuAt) window.LCNDA_UI.menuAt(anchor, items, {title: T('Poser dans…')}); else go('recap');
    }

    /* ═════════ Sous le diagramme posé : les sources et leurs licences, ↗ vers la liste ═════════ */
    function afterEmbed(box, shown) {
        const c = shown?.live?.data; if (!c || !box || box.querySelector('.dgd-src-line')) return;
        const d = listById(c.list); if (!d) return;
        const p = document.createElement('p'); p.className = 'dgd-src-line'; p.innerHTML = srcLinks(d, c);
        p.addEventListener('click', e => { const b = e.target.closest('[data-dgd-openlist]'); if (b) E().open?.(b.dataset.dgdOpenlist); });
        box.appendChild(p);
    }

    /* ═════════ La tuile de la galerie, le bouton des listes, le récap ═════════ */
    const galleryTileHtml = () => `<div class="dgd-tile-wrap"><button type="button" class="h-dg-tile is-new dgd-tile" data-dg-fromdata><span class="h-dg-mini h-dg-plus" aria-hidden="true">📊</span><span><b>${esc(T('Partir des données'))}</b><small>${esc(T('Mon arbre, une liste de données ou une question'))}</small></span></button></div>`;
    function listButton() {
        if (typeof document === 'undefined' || kiosk()) return;
        const page = document.querySelector('#workspace .ld-page:not(.ld-overview)'); if (!page || page.querySelector('[data-dgd-fromlist]')) return;
        const pa = E().page?.(); if (!pa?.d || !ext.openDiagramEditor) return;
        const anchor = page.querySelector('[data-ld-send]') || page.querySelector('[data-ld-export]'); if (!anchor) return;
        anchor.insertAdjacentHTML('afterend', `<button type="button" class="button small secondary" data-dgd-fromlist title="${esc(T('Cette liste, avec ses filtres, dans un diagramme'))}">📊 ${esc(T('Faire un diagramme'))}</button>`);
    }
    if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('click', e => {
            if (!e.target.closest?.('[data-dgd-fromlist]')) return;
            const pa = E().page?.(); const d = pa?.d?._base || pa?.d; if (!d) return;
            const s0 = pa.state?.() || {}, start = {src: 'list', list: d.id, km: kmFor(d), fam: !!d.geo && !!LF(), live: true};
            if (s0.period) { start.from = s0.period.from > -9999 ? String(s0.period.from) : ''; start.to = s0.period.to < 9999 ? String(s0.period.mode === 'in' ? s0.period.from : s0.period.to) : ''; }
            if (s0.near) { start.near = {lat: s0.near.lat, lon: s0.near.lon, km: s0.near.km, title: s0.near.title || ''}; start.fam = false; }
            ext.openDiagramEditor(null, {kind: 'stacked', data: start});
        });
        let mt = 0;
        const watch = () => { clearTimeout(mt); mt = setTimeout(() => { try { listButton(); recapBlock(); } catch (_) {} }, 80); };
        const boot = () => { const ws = document.getElementById('workspace'); if (ws) new MutationObserver(watch).observe(ws, {childList: true, subtree: true}); installFinish(); };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
    }
    function recapBlock() {
        const ids = readJ(K_RECAP, []); if (!Array.isArray(ids) || !ids.length || !ext.diagramEmbedHtml) return;
        const grid = document.querySelector('#workspace [data-dr] [data-dp-grid], #workspace [data-dr] .dr-fam'); if (!grid || document.querySelector('#workspace [data-dgd-recap]')) return;
        const s = document.createElement('section'); s.className = 'dr-box dgd-recap'; s.dataset.dgdRecap = '';
        s.innerHTML = `<div class="dp-bh"><h3>📊 ${esc(T('Mes diagrammes'))}</h3></div><div class="dgd-recap-list">${ids.map(id => `<div class="dgd-recap-it">${ext.diagramEmbedHtml(id)}<button type="button" class="link-button" data-dgd-unrecap="${Number(id)}">${esc(T('Retirer du récap'))}</button></div>`).join('')}</div>`;
        (grid.closest('[data-dp-grid]') || grid).after(s);
        s.addEventListener('click', e => { const b = e.target.closest('[data-dgd-unrecap]'); if (!b) return; const id = Number(b.dataset.dgdUnrecap), before = readJ(K_RECAP, []); writeJ(K_RECAP, before.filter(x => x !== id)); b.closest('.dgd-recap-it')?.remove(); A().undoToast?.(T('Retiré du récap'), {undo: () => { writeJ(K_RECAP, before); s.remove(); recapBlock(); }}); });
    }

    ext.diagramData = {mount, resolve, frozen, compute, suggestFields, suggestKinds, profileOf, modelOf, applyModel, saveModel, models, GALLERY, kindOf, suggestN, settingHtml, galleryTileHtml, afterEmbed, kmFor, finish, understand, listRows, crossTab, famData, KEYS: {suggest: K_N, km: K_KM, models: K_MOD, recap: K_RECAP}};
})();
