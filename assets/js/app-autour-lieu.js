/* LCNDA — 🗺 Tout autour d'un lieu : un lieu, un rayon (ou « Ce lieu seulement »), et tout ce qu'on sait autour.
 *  Ouvert depuis 📊 Données (fenêtre ; ext.donneesPlusOutils.around, « Les données » au départ) et depuis 🔍 Recherche
 *  (« 🗺 Tout autour d'un lieu », à côté de « Proximité géographique et temporelle », qui ne change pas ; « Les deux » au départ).
 *   - Quoi : « Les données » (les listes installées : ext.donneesPlus.collect, une pastille par thème) · « Ma famille » (les événements,
 *     documents, photos, cartes postales, enquêtes et enquêtes photo placés : api.php?action=autour_lieu, lib/autour_lieu.php ;
 *     en consultation, jamais un vivant ni une fiche confidentielle) · « Les deux » ;
 *   - Période (de, à ; facultative) pour les deux ; une pastille par sorte (allumer / éteindre) ;
 *   - Vue : « Carte » (la petite carte de l'app, le cercle du rayon ; les 1 500 plus proches, dit en clair) · « Tableau » (tout : la barre
 *     commune des listes, tri par colonne, 200 lignes puis « Voir plus », ☑ la barre de sélection avec 🧺 Au panier et 📍 Mettre dans…,
 *     ⤓ Exporter par la fenêtre commune) ; une ligne s'ouvre d'un clic (fiche, document, carte postale, enquête, liste de données) ;
 *   - ⚙️ Personnaliser : garder les lignes sans date quand une période est choisie, nombre de points sur la carte.
 *  Réglages retenus : localStorage « genealogie-autour-lieu » (rayon, quoi selon l'onglet, vue, réglages ; aussi dans le défaut du site).
 *  API : LCNDA_EXT.autourLieu = {open(lieu, {from}), page(token), mount(hôte, {place, from})}
 *  Essai : tests/test-autour-lieu.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const E = () => ext.dataListsEngine || {};
    const P = () => ext.donneesPlus || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const lang = () => (window.LCNDA_I18N?.lang || document.documentElement.lang || 'fr');
    const loc = () => (lang() === 'fr' ? 'fr-FR' : lang());
    const nf = n => Number(n || 0).toLocaleString(loc());
    const kmTxt = k => (k == null ? '' : `${Number(k) < 10 ? String(Math.round(Number(k) * 10) / 10).replace('.', lang() === 'fr' ? ',' : '.') : nf(Math.round(Number(k)))} km`);
    const toast = (m, k) => A().toast?.(m, k);
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const KEY = 'genealogie-autour-lieu';
    const readP = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
    const writeP = mut => { if (kiosk()) return; const v = readP(); mut(v); try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {} };
    const COLORS = ['#0066cc', '#c62828', '#0f9bb4', '#6929c4', '#d4a800', '#1a7f37', '#d9480f', '#555555', '#b0007a', '#00806b', '#8a5a00', '#3355aa'];
    /** les sortes de « Ma famille » : clé, icône, nom, couleur */
    const FAM = [['births', '👶', 'Naissances', '#2b8a3e'], ['marriages', '💍', 'Mariages', '#c2255c'], ['deaths', '✝', 'Décès', '#495057'], ['residences', '🏠', 'Résidences', '#1971c2'],
        ['events', '📅', 'Autres événements', '#e8590c'], ['documents', '📄', 'Documents', '#364fc7'], ['photos', '📷', 'Photos', '#1098ad'], ['postcards', '🏞', 'Cartes postales', '#0ca678'],
        ['investigations', '🕵️', 'Enquêtes', '#7048e8'], ['photo_inquiries', '🔎', 'Enquêtes photo', '#862e9c']];
    const famOf = k => FAM.find(f => f[0] === k) || FAM[4];
    const MAP_CAPS = [500, 1500, 3000];
    const PAGE = 200;
    let lastPlace = null; // le dernier lieu choisi (cette séance seulement : rien n'est écrit)

    async function findPlaces(q, n = 6) { try { const r = await A().api('picker_search', {kind: 'place', q, limit: n}); return (r.groups || []).flatMap(g => g.items || []).filter(x => x.lat != null && x.lon != null).map(x => ({name: String(x.title || x.name || q).replace(/\s*\(.*$/, ''), full: String(x.title || x.name || q), lat: Number(x.lat), lon: Number(x.lon), id: x.id})).slice(0, n); } catch (_) { return []; } }
    /** le champ « Un lieu » et ses résultats (le même que les autres outils des données) */
    function picker(box, onPick, value = '') {
        box.innerHTML = `<input type="search" class="dp-pin" value="${esc(value)}" placeholder="${esc(T('Un lieu'))}" aria-label="${esc(T('Un lieu'))}" autocomplete="off"><ul class="dp-pres"></ul>`;
        const inp = box.querySelector('input'), ul = box.querySelector('ul'); let tq = 0, my = 0;
        const run = () => { clearTimeout(tq); tq = setTimeout(async () => { const q = inp.value.trim(), n = ++my; if (q.length < 2) { ul.innerHTML = ''; return; }
            const its = await findPlaces(q); if (n !== my) return;
            ul.innerHTML = its.length ? its.map((x, i) => `<li><button type="button" class="dp-pick" data-i="${i}">📍 ${esc(x.full)}</button></li>`).join('') : `<li class="is-empty">${A().empty ? A().empty(T('Rien trouvé'), {icon: '🔍'}) : esc(T('Rien trouvé'))}</li>`;
            ul.__its = its; }, 220); };
        inp.addEventListener('input', run);
        ul.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const x = ul.__its[Number(b.dataset.i)]; ul.innerHTML = ''; inp.value = x.name; onPick(x); });
        return inp;
    }

    /** l'outil, dans n'importe quel hôte (fenêtre des Données, page de la Recherche) */
    function mount(host, {place: p0 = null, from = 'donnees'} = {}) {
        const pr = readP();
        const S = {place: p0 && Number.isFinite(Number(p0.lat)) ? {...p0, lat: Number(p0.lat), lon: Number(p0.lon)} : null,
            km: Number(pr.km) >= 1 && Number(pr.km) <= 500 ? Math.round(Number(pr.km)) : (Number(P().opt?.('radius')) || 30),
            exact: !!pr.exact, quoi: (pr.quoi || {})[from] || (from === 'recherche' ? 'both' : 'donnees'), view: pr.view === 'table' ? 'table' : 'map',
            y0: '', y1: '', off: new Set(), keepUndated: pr.keepUndated !== false, cap: MAP_CAPS.includes(Number(pr.cap)) ? Number(pr.cap) : 1500,
            data: null, fam: null, sig: {data: '', fam: ''}, shown: PAGE, sort: 'km', q: '', busy: 0};
        const seg = (attr, label, items, cur) => UI().segmented({cls: 'dp-seg', label, attrs: attr, items: items.map(([k, l]) => ({on: k === cur, attrs: `data-k="${k}"`, html: esc(T(l))}))});
        host.classList.add('al-tool');
        host.innerHTML = `<div class="dp-row dp-around-top al-top"><div class="dp-pbox" data-dp-ap></div>
                ${seg('data-al-zone', T('Où'), [['exact', 'Ce lieu seulement'], ['around', 'Autour']], S.exact ? 'exact' : 'around')}
                <label class="dp-o dp-num" data-al-kmbox${S.exact ? ' hidden' : ''}><span class="lbl">${esc(T('Rayon'))}</span><input type="number" min="1" max="500" step="1" data-dp-akm value="${S.km}" aria-label="${esc(T('Rayon en km'))}"><span>km</span></label></div>
            <div class="dp-row al-opts">
                <span class="dp-o"><span class="lbl">${esc(T('Quoi'))}</span>${seg('data-al-quoi', T('Quoi'), [['donnees', 'Les données'], ['famille', 'Ma famille'], ['both', 'Les deux']], S.quoi)}</span>
                <span class="dp-o al-period"><span class="lbl">${esc(T('Période'))}</span><input type="number" min="1" max="2200" step="1" data-al-y0 placeholder="${esc(T('de'))}" aria-label="${esc(T('Période : de l’année'))}"><span>–</span><input type="number" min="1" max="2200" step="1" data-al-y1 placeholder="${esc(T('à'))}" aria-label="${esc(T('Période : à l’année'))}"></span>
                <span class="dp-o">${seg('data-al-view', T('Vue'), [['map', '🗺 Carte'], ['table', '▤ Tableau']], S.view)}</span>
                <span class="al-acts"><button type="button" class="button small secondary" data-al-export>⤓ ${esc(T('Exporter'))}</button><button type="button" class="button small secondary" data-al-custom aria-haspopup="true">⚙️ ${esc(T('Personnaliser'))}</button></span></div>
            <div class="dp-lyr" data-dp-lyr role="group" aria-label="${esc(T('Couches'))}"></div>
            <p class="al-note" data-al-note aria-live="polite" hidden></p>
            <div data-al-mapview><div class="dp-stage" data-dp-map></div><div class="dp-mlegend" data-dp-leg></div></div>
            <div class="al-table" data-al-table hidden></div>`;
        const $ = s => host.querySelector(s);
        picker($('[data-dp-ap]'), x => { S.place = x; lastPlace = x; load(); }, S.place?.name || '');
        host.addEventListener('click', e => {
            const t = e.target;
            let b = t.closest('[data-al-zone] [data-k]'); if (b) { UI().segPick(b); S.exact = b.dataset.k === 'exact'; $('[data-al-kmbox]').hidden = S.exact; writeP(v => { v.exact = S.exact; }); load(); return; }
            b = t.closest('[data-al-quoi] [data-k]'); if (b) { UI().segPick(b); S.quoi = b.dataset.k; writeP(v => { v.quoi = {...(v.quoi || {}), [from]: S.quoi}; }); load(); return; }
            b = t.closest('[data-al-view] [data-k]'); if (b) { setView(b.dataset.k, b); return; }
            b = t.closest('[data-ly]'); if (b) { const k = b.dataset.ly; if (S.off.has(k)) S.off.delete(k); else S.off.add(k); S.shown = PAGE; paint(); host.querySelector(`[data-ly="${CSS.escape(k)}"]`)?.focus(); return; }
            if (t.closest('[data-al-totable]')) { setView('table'); return; }
            if (t.closest('[data-al-more]')) { S.shown += PAGE; paintTable(); return; }
            if (t.closest('[data-al-export]')) { exportNow(); return; }
            if (t.closest('[data-al-custom]')) { custom(t.closest('[data-al-custom]')); return; }
            b = t.closest('[data-al-open]'); if (b) { openRow(rowByKey.get(b.dataset.alOpen)); }
        });
        $('[data-dp-akm]').addEventListener('change', e => { const n = Math.round(Number(e.target.value)); if (!(n >= 1 && n <= 500)) { e.target.value = S.km; return; } S.km = n; writeP(v => { v.km = n; }); load(); });
        const yIn = () => { const a = $('[data-al-y0]').value.trim(), z = $('[data-al-y1]').value.trim(); S.y0 = /^\d{1,4}$/.test(a) ? Number(a) : ''; S.y1 = /^\d{1,4}$/.test(z) ? Number(z) : ''; S.shown = PAGE; paint(); };
        $('[data-al-y0]').addEventListener('change', yIn); $('[data-al-y1]').addEventListener('change', yIn);
        function setView(v, btn) { S.view = v === 'table' ? 'table' : 'map'; const b = btn || host.querySelector(`[data-al-view] [data-k="${S.view}"]`); if (b) UI().segPick(b); writeP(x => { x.view = S.view; }); paint(); }
        function custom(btn) {
            UI().menuAt(btn, [
                {icon: S.keepUndated ? '☑' : '☐', label: T('Garder les lignes sans date quand une période est choisie'), run: () => { S.keepUndated = !S.keepUndated; writeP(v => { v.keepUndated = S.keepUndated; }); paint(); }},
                '-', ...MAP_CAPS.map(n => ({icon: S.cap === n ? '●' : '○', label: T('Carte : les {n} points les plus proches', {n: nf(n)}), run: () => { S.cap = n; writeP(v => { v.cap = n; }); paint(); }}))], {title: T('Personnaliser')});
        }

        /* ── lire ── */
        const wantData = () => S.quoi !== 'famille', wantFam = () => S.quoi !== 'donnees';
        const radius = () => (S.exact ? 1 : S.km);
        async function load() {
            if (!S.place) { paint(); return; }
            const sig = `${S.place.lat},${S.place.lon}|${S.exact ? 'x' : S.km}`, my = ++S.busy, jobs = [];
            if (wantData() && S.sig.data !== sig) jobs.push((async () => { let rows = []; try { rows = P().collect ? await P().collect({places: [S.place], km: () => radius()}) : []; } catch (_) { rows = []; } if (my === S.busy) { S.data = rows; S.sig.data = sig; } })());
            if (wantFam() && S.sig.fam !== sig) jobs.push((async () => {
                let r = null; try { r = await A().api('autour_lieu', {lat: S.place.lat, lon: S.place.lon, km: S.km, exact: S.exact ? 1 : 0, place_id: Number.isInteger(Number(S.place.id)) && Number(S.place.id) > 0 ? Number(S.place.id) : 0}); } catch (e) { toast(e.message, 'error'); }
                if (my === S.busy) { S.fam = r?.items || []; S.sig.fam = sig; } })());
            if (jobs.length) { $('[data-dp-map]').innerHTML = UI().spinner ? UI().spinner(T('On cherche…')) : '…'; if (S.view === 'table') $('[data-al-table]').innerHTML = UI().spinner ? UI().spinner(T('On cherche…')) : '…'; }
            await Promise.all(jobs);
            if (my !== S.busy) return;
            S.shown = PAGE; paint();
        }

        /* ── les lignes : une seule forme pour les données et la famille ── */
        let rowByKey = new Map(), dataCols = [];
        const placeField = d => (d.fields || []).find(f => f.type === 'place');
        function rowsAll() {
            const out = [];
            if (wantData() && S.data) {
                const ths = [...new Set(S.data.map(r => r.theme))]; dataCols = ths;
                S.data.forEach((x, i) => { const th = P().themeById?.(x.theme), pf = placeField(x.d);
                    out.push({src: 'data', layer: x.theme, key: `d${i}:${x.d.id}`, title: String(x.title || '—'), sub: T(x.d.label || ''), type: `${th?.icon || ''} ${T(th?.label || x.theme)}`.trim(),
                        y: x.y ?? null, y2: x.y2 ?? x.y ?? null, lat: x.g[0], lon: x.g[1], km: x.k, place: pf ? String(x.r[pf.key] ?? '') : '', color: COLORS[ths.indexOf(x.theme) % COLORS.length], raw: x}); });
            }
            if (wantFam() && S.fam) S.fam.forEach(x => { const f = famOf(x.k);
                out.push({src: 'fam', layer: `fam:${x.k}`, key: x.key, title: String(x.t || '—'), sub: String(x.s || ''), type: `${f[1]} ${x.tl ? T(x.tl) : T(f[2])}`, y: x.y ?? null, y2: x.y ?? null,
                    lat: Number(x.lat), lon: Number(x.lon), km: Number(x.km), place: String(x.pl || ''), color: f[3], raw: x}); });
            rowByKey = new Map(out.map(r => [r.key, r]));
            return out;
        }
        const inPeriod = r => { if (S.y0 === '' && S.y1 === '') return true; if (r.y == null) return S.keepUndated; const a = r.y, z = r.y2 ?? r.y; return !(S.y0 !== '' && z < S.y0) && !(S.y1 !== '' && a > S.y1); };
        const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const SORTS = {km: (a, b) => a.km - b.km, y: (a, b) => (a.y ?? 1e9) - (b.y ?? 1e9), type: (a, b) => a.type.localeCompare(b.type, 'fr'), title: (a, b) => a.title.localeCompare(b.title, 'fr', {sensitivity: 'base'}), place: (a, b) => a.place.localeCompare(b.place, 'fr', {sensitivity: 'base'})};
        const sorted = rows => { const [k, dir] = S.sort.split('-'), f = SORTS[k] || SORTS.km; return [...rows].sort((a, b) => (dir === 'desc' ? -1 : 1) * (f(a, b) || a.km - b.km)); };
        const matchQ = r => { const w = fold(S.q).split(/\s+/).filter(Boolean); if (!w.length) return true; const s = fold(`${r.title} ${r.sub} ${r.type} ${r.place} ${r.y ?? ''}`); return w.every(x => s.includes(x)); };
        let cur = {all: [], period: [], shown: []};
        function paint() {
            const all = rowsAll(), period = all.filter(inPeriod), shown = period.filter(r => !S.off.has(r.layer));
            cur = {all, period, shown};
            // les pastilles : un thème des données, une sorte de la famille
            const layers = []; const seen = new Map();
            period.forEach(r => { if (!seen.has(r.layer)) { seen.set(r.layer, 0); layers.push(r); } seen.set(r.layer, seen.get(r.layer) + 1); });
            const famOrder = l => (l.startsWith('fam:') ? 100 + FAM.findIndex(f => `fam:${f[0]}` === l) : 0);
            layers.sort((a, b) => famOrder(a.layer) - famOrder(b.layer));
            $('[data-dp-lyr]').innerHTML = layers.map(r => { const o = !S.off.has(r.layer), lbl = r.src === 'fam' ? `${famOf(r.raw.k)[1]} ${T(famOf(r.raw.k)[2])}` : r.type;
                return `<button type="button" class="ui-listbar-chip dp-chip${o ? '' : ' off'}" data-ly="${esc(r.layer)}" aria-pressed="${o}"><i style="background:${r.color}"></i>${esc(lbl)} · ${nf(seen.get(r.layer))}</button>`; }).join('');
            const isMap = S.view === 'map';
            $('[data-al-mapview]').hidden = !isMap; $('[data-al-table]').hidden = isMap;
            const note = $('[data-al-note]');
            if (!S.place) {
                note.hidden = true; $('[data-dp-leg]').innerHTML = '';
                const msg = T('Choisis un lieu : tout ce qu’on sait autour de lui, sur une carte ou dans un tableau.');
                $('[data-dp-map]').innerHTML = `<p class="muted">${esc(msg)}</p>`; $('[data-al-table]').innerHTML = `<p class="muted">${esc(msg)}</p>`; return;
            }
            const capped = isMap && shown.length > S.cap;
            note.hidden = !capped;
            note.innerHTML = capped ? `ℹ️ ${esc(T('{a} premiers sur {n} — voir le tableau', {a: nf(S.cap), n: nf(shown.length)}))} <button type="button" class="link-button" data-al-totable>▤ ${esc(T('Tableau'))}</button>` : '';
            if (isMap) paintMap(shown); else paintTable();
        }
        const zoneTxt = () => (S.exact ? T('{p} · ce lieu seulement', {p: S.place.name}) : T('Autour de {p} · {n} km', {p: S.place.name, n: S.km}));
        const emptyTxt = () => (S.quoi === 'donnees' ? (S.exact ? T('Rien dans les listes installées à ce lieu.') : T('Rien dans les listes installées à moins de {n} km.', {n: S.km}))
            : S.exact ? T('Rien à ce lieu, pour cette période.') : T('Rien à moins de {n} km, pour cette période.', {n: S.km}));
        function paintMap(shown) {
            const pts = [...shown].sort((a, b) => a.km - b.km).slice(0, S.cap).map(r => ({lat: r.lat, lon: r.lon, label: `${r.title}${r.y != null ? ` (${r.y})` : ''}`, color: r.color}));
            pts.push({lat: S.place.lat, lon: S.place.lon, label: S.place.name, color: '#2b8a3e', n: '◆'});
            $('[data-dp-map]').innerHTML = cur.period.length ? (ext.miniMap ? ext.miniMap(pts, [], {height: 420, circles: S.exact ? [] : [{lat: S.place.lat, lon: S.place.lon, km: S.km}]}) : '') : `<p class="muted">${esc(emptyTxt())}</p>`;
            const legend = new Map(); shown.forEach(r => { const l = legend.get(r.layer) || {r, n: 0}; l.n++; legend.set(r.layer, l); });
            $('[data-dp-leg]').innerHTML = cur.period.length ? `<b>${esc(zoneTxt())}</b>${[...legend.values()].map(({r, n}) => `<span><i style="background:${r.color}"></i>${esc(r.src === 'fam' ? T(famOf(r.raw.k)[2]) : T(P().themeById?.(r.layer)?.label || r.layer))} · ${nf(n)}</span>`).join('')}<span><i class="dp-fam-ic"></i>${esc(T('le lieu choisi'))}</span>` : '';
        }

        /* ── ▤ le tableau ── */
        let bar = null, sel = null, tbl = null;
        const SORT_OPTS = () => [['km', T('Distance (la plus proche)')], ['km-desc', T('Distance (la plus loin)')], ['y', T('Année (la plus ancienne)')], ['y-desc', T('Année (la plus récente)')], ['type', T('Type (A → Z)')], ['type-desc', T('Type (Z → A)')],
            ['title', T('Titre (A → Z)')], ['title-desc', T('Titre (Z → A)')], ['place', T('Lieu (A → Z)')], ['place-desc', T('Lieu (Z → A)')]];
        function ensureTable() {
            const box = $('[data-al-table]');
            if (tbl && box.contains(tbl)) return;
            box.innerHTML = '';
            bar = UI().listBar ? UI().listBar({key: 'autour-lieu', search: {placeholder: T('Chercher dans ces lignes…')}, sort: {options: SORT_OPTS(), value: 'km'}, count: {label: T('ligne'), many: T('lignes')},
                onChange: st => { S.q = st.q; S.sort = st.sort || 'km'; S.shown = PAGE; paintTable(); }}) : null;
            if (bar) { box.appendChild(bar); S.q = bar.state.q || ''; S.sort = bar.state.sort || 'km'; }
            const wrap = document.createElement('div'); wrap.className = 'data-table-wrap';
            wrap.innerHTML = `<table class="data-table al-tbl"><thead><tr><th><button type="button" data-sort-column="0" data-sort-key="km">${esc(T('Distance'))}</button></th><th><button type="button" data-sort-column="1" data-sort-key="y">${esc(T('Année'))}</button></th><th><button type="button" data-sort-column="2" data-sort-key="type">${esc(T('Type'))}</button></th><th><button type="button" data-sort-column="3" data-sort-key="title">${esc(T('Titre'))}</button></th><th><button type="button" data-sort-column="4" data-sort-key="place">${esc(T('Lieu'))}</button></th></tr></thead><tbody></tbody></table>`;
            box.appendChild(wrap);
            const more = document.createElement('div'); more.className = 'al-more'; more.dataset.alMorebox = ''; box.appendChild(more);
            tbl = wrap.querySelector('table');
            bar?.sortColumns?.(tbl, {km: ['km', 'km-desc'], y: ['y', 'y-desc'], type: ['type', 'type-desc'], title: ['title', 'title-desc'], place: ['place', 'place-desc']});
            if (ext.selectionBar) sel = ext.selectionBar({host: wrap, rowSelector: '[data-sel-id]', what: [T('ligne cochée'), T('lignes cochées')], key: 'autour-lieu', place: wrap,
                itemsOf: keys => keys.map(k => itemOf(rowByKey.get(k))).filter(Boolean),
                actions: [ext.selectionBar.exportAction?.({name: T('Tout autour d’un lieu'), rowsOf: keys => [HEAD(), ...keys.map(k => rowByKey.get(k)).filter(Boolean).map(line)]})].filter(Boolean)});
        }
        const HEAD = () => [T('Distance (km)'), T('Année'), T('Type'), T('Titre'), T('Détail'), T('Lieu'), T('Latitude'), T('Longitude')];
        const line = r => [r.km, r.y ?? '', r.type, r.title, r.sub, r.place, r.lat, r.lon];
        const visible = () => sorted(cur.shown.filter(matchQ));
        function paintTable() {
            if (!S.place) return;
            ensureTable();
            const list = visible(), body = tbl.tBodies[0], n = Math.min(S.shown, list.length);
            bar?.setCount?.(list.length, T('ligne'), T('lignes'));
            body.innerHTML = list.length ? list.slice(0, n).map(r => {
                const person = r.src === 'fam' && r.raw.p && r.raw.e ? Number(r.raw.p) : 0;
                const title = person ? `<button type="button" class="table-link" data-open-person="${person}">${esc(r.title)}</button>` : `<button type="button" class="table-link" data-al-open="${esc(r.key)}">${esc(r.title)}</button>`;
                return `<tr data-sel-id="${esc(r.key)}" data-al-row="${esc(r.key)}"><td data-sort-value="${r.km}">${esc(kmTxt(r.km))}</td><td data-sort-value="${r.y ?? ''}">${r.y != null ? esc(r.y2 && r.y2 !== r.y ? `${r.y}–${r.y2}` : String(r.y)) : '—'}</td><td><i class="al-dot" style="background:${r.color}"></i>${esc(r.type)}</td><td>${title}${r.sub ? `<small class="muted al-sub">${esc(r.sub)}</small>` : ''}</td><td>${esc(r.place)}</td></tr>`; }).join('')
                : `<tr><td colspan="5">${A().empty ? A().empty(emptyTxt(), {icon: '🗺'}) : esc(emptyTxt())}</td></tr>`;
            const left = list.length - n;
            host.querySelector('[data-al-morebox]').innerHTML = left > 0 ? `<button type="button" class="button small secondary" data-al-more>${esc(T('Voir {n} de plus ({m} restants)', {n: nf(Math.min(PAGE, left)), m: nf(left)}))}</button>` : '';
            sel?.refresh?.();
        }
        async function exportNow() {
            if (!S.place) { toast(T('Choisis d’abord un lieu.')); return; }
            const name = `${T('Tout autour d’un lieu')} — ${S.place.name}`;
            UI().exportRows?.({title: name, name, info: zoneTxt(), rows: () => [HEAD(), ...visible().map(line)], all: () => [HEAD(), ...sorted(cur.all).map(line)]});
        }

        /* ── ouvrir une ligne, la mettre au panier ── */
        function openRow(r) {
            if (!r) return;
            const x = r.raw, close = () => { host.closest('dialog[open]')?.close(); };
            if (r.src === 'data') { close(); E().open?.(x.d.id, {q: '', near: {lat: S.place.lat, lon: S.place.lon, km: Math.max(1, radius()), title: S.place.name}, sort: '_km'}); return; }
            if (x.inv) { close(); const st = A().state; st.currentInvestigationId = Number(x.inv); st.enquetesTab = 'enquetes'; A().setModule?.('enquetes'); return; }
            if (x.ep) { if (ext.enquetePhoto?.open) { close(); ext.enquetePhoto.open(Number(x.ep)); } return; }
            if (x.m) { const m = {id: Number(x.m), filename: x.f || x.th || '', thumbnail: x.th || '', title: r.title, media_type: x.mt || 'image', date_text: r.sub};
                if (m.filename && A().openLightbox) A().openLightbox([m], 0, true); else toast(T('Ce document n’a pas de fichier à montrer.')); return; }
            if (x.p) { close(); const st = A().state; st.currentPersonId = Number(x.p); A().setModule?.('personnes'); }
        }
        function itemOf(r) {
            if (!r) return null;
            const origin = {kind: 'tool', label: `🗺 ${T('Tout autour d’un lieu')} · ${zoneTxt()}`, url: ''}, x = r.raw, value = [r.y ?? '', r.place, kmTxt(r.km)].filter(v => v !== '' && v != null).join(' · ');
            if (r.src === 'data') { const it = ext.connexions?.kit?.ldRowItem ? ext.connexions.kit.ldRowItem(x.d, E().stateOf ? E().stateOf(x.d.id, x.d) : {}, x.r) : null;
                return it || {kind: 'row', ref_id: 0, title: r.title, value, data: {columns: HEAD(), row: line(r)}, origin}; }
            if (x.e) return {kind: 'event', ref_id: Number(x.e), title: `${r.sub ? `${r.sub} — ` : ''}${r.title}`, value, origin};
            if (x.m) return {kind: 'media', ref_id: Number(x.m), title: r.title, value, origin};
            if (x.inv) return {kind: 'investigation', ref_id: Number(x.inv), title: r.title, value, origin};
            return {kind: 'datum', ref_id: 0, title: r.title, value: [r.sub, value].filter(Boolean).join(' · '), origin};
        }

        if (S.place) load(); else paint();
        return {state: S, reload: load, get rows() { return cur; }};
    }

    /** 📊 Données : dans une fenêtre */
    function open(p0 = null, {from = 'donnees'} = {}) {
        ext.openDialog?.({eyebrow: T('Une seule carte de tout'), title: `🗺 ${T('Tout autour d’un lieu')}`, wide: true, submitLabel: 'Fermer',
            body: '<div data-al-host></div>', onOpen: dl => { dl.classList.add('al-dialog'); mount(dl.querySelector('[data-al-host]'), {place: p0, from}); }, onSubmit: () => true});
    }
    /** 🔍 Recherche → « 🗺 Tout autour d'un lieu » : une page */
    function page(token) {
        const st = A().state, ws = document.getElementById('workspace'); if (!ws || (token != null && st && token !== st.workspaceToken)) return;
        const sec = document.createElement('section'); sec.className = 'page al-page';
        sec.innerHTML = `${UI().pageHeader ? UI().pageHeader({where: T('Recherche'), icon: '🗺', title: T('Tout autour d’un lieu'), help: esc(T('Un lieu et un rayon : ta famille (naissances, mariages, décès, documents, photos, cartes postales, enquêtes) et les listes de données installées, sur une carte ou dans un tableau.'))}) : `<h2>🗺 ${esc(T('Tout autour d’un lieu'))}</h2>`}<div data-al-host></div>`;
        ws.replaceChildren(sec);
        mount(sec.querySelector('[data-al-host]'), {place: lastPlace, from: 'recherche'});
    }
    ext.autourLieu = {open, page, mount, KEY, FAM};
})();
