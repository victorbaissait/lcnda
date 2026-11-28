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
 *   - Vue « ⏳ Dans le temps » : une frise année par année (décennies repliées), données et famille mêlées, avec les mêmes filtres ;
 *   - Vue « ⚖️ Comparer » : un second lieu, deux colonnes côte à côte (même rayon, même période, mêmes pastilles), le compte par thème
 *     et par sorte, l'écart, ce qui n'existe que d'un côté en couleur (le ⚖️ Comparer des Données y renvoie pour « Deux lieux ») ;
 *   - la carte : un clic (ou Tab puis Entrée) sur un point ouvre sa petite fiche, sans quitter la carte (ext.carteFiche, app-carte-fiche.js) :
 *     ↗ Ouvrir (fiche, document, liste de données…), ☰ Voir la ligne ; le lieu choisi (◆) ne s'ouvre pas ;
 *   - 🖨 Fiche imprimable « Autour de Brive, 1850-1914 » : carte (dessinée sans tuiles), résumé par thème, faits marquants, décennies,
 *     les lignes (au choix) ; UI.openPrintDialog, ou ⤓ en HTML ; sans les vivants ni les fiches confidentielles (lv, lib/autour_lieu.php) ;
 *   - « Ma famille » : aussi 🕊 parrains et marraines et ✍️ témoins des événements du lieu (event_witnesses), une pastille chacun ;
 *   - ⚙️ Personnaliser : garder les lignes sans date quand une période est choisie, nombre de points sur la carte, décennies dépliées,
 *     comparer : seulement les différences.
 *  Réglages retenus : localStorage « genealogie-autour-lieu » (rayon, quoi selon l'onglet, vue, réglages ; aussi dans le défaut du site).
 *  API : LCNDA_EXT.autourLieu = {open(lieu, {from, view, other}), page(token), mount(hôte, {place, from, view, other}), sheetHtml}
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
        ['events', '📅', 'Autres événements', '#e8590c'], ['godparents', '🕊', 'Parrains et marraines', '#a61e4d'], ['witnesses', '✍️', 'Témoins', '#5c940d'], ['documents', '📄', 'Documents', '#364fc7'], ['photos', '📷', 'Photos', '#1098ad'], ['postcards', '🏞', 'Cartes postales', '#0ca678'],
        ['investigations', '🕵️', 'Enquêtes', '#7048e8'], ['photo_inquiries', '🔎', 'Enquêtes photo', '#862e9c']];
    const famOf = k => FAM.find(f => f[0] === k) || FAM[4];
    const MAP_CAPS = [500, 1500, 3000];
    const PAGE = 200;
    const VIEWS = [['map', '🗺 Carte'], ['table', '▤ Tableau'], ['time', '⏳ Dans le temps'], ['cmp', '⚖️ Comparer']];
    const TIME_MAX = 400; // lignes montrées dans une décennie dépliée
    /** l'année où ranger une ligne dans le temps : son début, ramené dans la période choisie (une ligne de 1630 à 1850 compte pour 1780 dans 1780-1799) */
    const yearIn = (r, y0, y1) => (r.y == null ? null : y0 !== '' && y0 != null && r.y < y0 && (r.y2 ?? r.y) >= y0 ? Number(y0) : r.y);
    const ySpan = r => (r.y != null ? (r.y2 && r.y2 !== r.y ? `${r.y}–${r.y2}` : String(r.y)) : '');
    let lastPlace = null, lastOther = null; // les derniers lieux choisis (cette séance seulement : rien n'est écrit)

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
    const okPlace = x => (x && Number.isFinite(Number(x.lat)) && Number.isFinite(Number(x.lon)) ? {...x, lat: Number(x.lat), lon: Number(x.lon), name: String(x.name || x.title || '')} : null);
    function mount(host, {place: p0 = null, from = 'donnees', view: v0 = '', other = null} = {}) {
        const pr = readP();
        const S = {place: okPlace(p0),
            km: Number(pr.km) >= 1 && Number(pr.km) <= 500 ? Math.round(Number(pr.km)) : (Number(P().opt?.('radius')) || 30),
            exact: !!pr.exact, quoi: (pr.quoi || {})[from] || (from === 'recherche' ? 'both' : 'donnees'), view: VIEWS.some(v => v[0] === v0) ? v0 : VIEWS.some(v => v[0] === pr.view) ? pr.view : 'map',
            y0: '', y1: '', off: new Set(), keepUndated: pr.keepUndated !== false, cap: MAP_CAPS.includes(Number(pr.cap)) ? Number(pr.cap) : 1500,
            data: null, fam: null, sig: {data: '', fam: ''}, shown: PAGE, sort: 'km', q: '', busy: 0,
            decOpen: !!pr.decOpen, openDec: new Set(), cmpDiff: !!pr.cmpDiff,
            cmp: {place: okPlace(other) || lastOther, data: null, fam: null, sig: {data: '', fam: ''}, busy: 0}};
        const seg = (attr, label, items, cur) => UI().segmented({cls: 'dp-seg', label, attrs: attr, items: items.map(([k, l]) => ({on: k === cur, attrs: `data-k="${k}"`, html: esc(T(l))}))});
        host.classList.add('al-tool');
        host.innerHTML = `<div class="dp-row dp-around-top al-top"><div class="dp-pbox" data-dp-ap></div>
                ${seg('data-al-zone', T('Où'), [['exact', 'Ce lieu seulement'], ['around', 'Autour']], S.exact ? 'exact' : 'around')}
                <label class="dp-o dp-num" data-al-kmbox${S.exact ? ' hidden' : ''}><span class="lbl">${esc(T('Rayon'))}</span><input type="number" min="1" max="500" step="1" data-dp-akm value="${S.km}" aria-label="${esc(T('Rayon en km'))}"><span>km</span></label></div>
            <div class="dp-row al-opts">
                <span class="dp-o"><span class="lbl">${esc(T('Quoi'))}</span>${seg('data-al-quoi', T('Quoi'), [['donnees', 'Les données'], ['famille', 'Ma famille'], ['both', 'Les deux']], S.quoi)}</span>
                <span class="dp-o al-period"><span class="lbl">${esc(T('Période'))}</span><input type="number" min="1" max="2200" step="1" data-al-y0 placeholder="${esc(T('de'))}" aria-label="${esc(T('Période : de l’année'))}"><span>–</span><input type="number" min="1" max="2200" step="1" data-al-y1 placeholder="${esc(T('à'))}" aria-label="${esc(T('Période : à l’année'))}"></span>
                <span class="dp-o">${seg('data-al-view', T('Vue'), VIEWS, S.view)}</span>
                <span class="al-acts"><button type="button" class="button small secondary" data-al-export>⤓ ${esc(T('Exporter'))}</button><button type="button" class="button small secondary" data-al-print aria-haspopup="true">🖨 ${esc(T('Fiche imprimable'))}</button><button type="button" class="button small secondary" data-al-custom aria-haspopup="true">⚙️ ${esc(T('Personnaliser'))}</button></span></div>
            <div class="dp-lyr" data-dp-lyr role="group" aria-label="${esc(T('Couches'))}"></div>
            <p class="al-note" data-al-note aria-live="polite" hidden></p>
            <div data-al-mapview><div class="dp-stage" data-dp-map></div><div class="dp-mlegend" data-dp-leg></div></div>
            <div class="al-table" data-al-table hidden></div>
            <div class="al-time" data-al-time hidden></div>
            <div class="al-cmpview" data-al-cmpview hidden><div class="dp-row al-cmp-top"><span class="lbl">${esc(T('Comparer avec'))}</span><div class="dp-pbox" data-al-cmp-pick></div>
                <button type="button" class="button small ghost" data-al-cmp-swap title="${esc(T('Échanger les deux lieux'))}" aria-label="${esc(T('Échanger les deux lieux'))}">⇄</button></div>
                <div data-al-cmp-out aria-live="polite"></div></div>`;
        const $ = s => host.querySelector(s);
        picker($('[data-dp-ap]'), x => { S.place = x; lastPlace = x; load(); }, S.place?.name || '');
        picker($('[data-al-cmp-pick]'), x => { S.cmp.place = x; lastOther = x; loadCmp(); }, S.cmp.place?.name || '');
        host.addEventListener('click', e => {
            const t = e.target;
            let b = t.closest('[data-al-zone] [data-k]'); if (b) { UI().segPick(b); S.exact = b.dataset.k === 'exact'; $('[data-al-kmbox]').hidden = S.exact; writeP(v => { v.exact = S.exact; }); load(); return; }
            b = t.closest('[data-al-quoi] [data-k]'); if (b) { UI().segPick(b); S.quoi = b.dataset.k; writeP(v => { v.quoi = {...(v.quoi || {}), [from]: S.quoi}; }); load(); return; }
            b = t.closest('[data-al-view] [data-k]'); if (b) { setView(b.dataset.k, b); return; }
            b = t.closest('[data-ly]'); if (b) { const k = b.dataset.ly; if (S.off.has(k)) S.off.delete(k); else S.off.add(k); S.shown = PAGE; paint(); host.querySelector(`[data-ly="${CSS.escape(k)}"]`)?.focus(); return; }
            if (t.closest('[data-al-totable]')) { setView('table'); return; }
            if (t.closest('[data-al-more]')) { S.shown += PAGE; paintTable(); return; }
            if (t.closest('[data-al-export]')) { exportNow(); return; }
            if (t.closest('[data-al-print]')) { printMenu(t.closest('[data-al-print]')); return; }
            if (t.closest('[data-al-cmp-swap]')) { swapCmp(); return; }
            b = t.closest('[data-al-tall]'); if (b) { const on = b.dataset.alTall === '1'; host.querySelectorAll('[data-al-time] details[data-al-dec]').forEach(d => { d.open = on; }); return; }
            if (t.closest('[data-al-custom]')) { custom(t.closest('[data-al-custom]')); return; }
            b = t.closest('[data-al-open]'); if (b) { openRow(rowByKey.get(b.dataset.alOpen)); }
        });
        $('[data-dp-akm]').addEventListener('change', e => { const n = Math.round(Number(e.target.value)); if (!(n >= 1 && n <= 500)) { e.target.value = S.km; return; } S.km = n; writeP(v => { v.km = n; }); load(); });
        const yIn = () => { const a = $('[data-al-y0]').value.trim(), z = $('[data-al-y1]').value.trim(); S.y0 = /^\d{1,4}$/.test(a) ? Number(a) : ''; S.y1 = /^\d{1,4}$/.test(z) ? Number(z) : ''; S.shown = PAGE; paint(); };
        $('[data-al-y0]').addEventListener('change', yIn); $('[data-al-y1]').addEventListener('change', yIn);
        host.addEventListener('toggle', e => { const d = e.target; if (!d?.matches?.('details[data-al-dec]')) return; const k = Number(d.dataset.alDec); if (d.open) { S.openDec.add(k); fillDecade(d); } else S.openDec.delete(k); }, true);
        function setView(v, btn) { S.view = VIEWS.some(x => x[0] === v) ? v : 'map'; const b = btn || host.querySelector(`[data-al-view] [data-k="${S.view}"]`); if (b) UI().segPick(b); writeP(x => { x.view = S.view; }); paint(); }
        function custom(btn) {
            UI().menuAt(btn, [
                {icon: S.keepUndated ? '☑' : '☐', label: T('Garder les lignes sans date quand une période est choisie'), run: () => { S.keepUndated = !S.keepUndated; writeP(v => { v.keepUndated = S.keepUndated; }); paint(); }},
                '-', ...MAP_CAPS.map(n => ({icon: S.cap === n ? '●' : '○', label: T('Carte : les {n} points les plus proches', {n: nf(n)}), run: () => { S.cap = n; writeP(v => { v.cap = n; }); paint(); }})),
                '-', {icon: S.decOpen ? '☑' : '☐', label: T('Dans le temps : décennies dépliées au départ'), run: () => { S.decOpen = !S.decOpen; S.openDec.clear(); writeP(v => { v.decOpen = S.decOpen; }); paint(); }},
                {icon: S.cmpDiff ? '☑' : '☐', label: T('Comparer : seulement les différences'), run: () => { S.cmpDiff = !S.cmpDiff; writeP(v => { v.cmpDiff = S.cmpDiff; }); paint(); }}], {title: T('Personnaliser')});
        }

        /* ── lire ── */
        const wantData = () => S.quoi !== 'famille', wantFam = () => S.quoi !== 'donnees';
        const radius = () => (S.exact ? 1 : S.km);
        /** ce qu'on sait autour d'un lieu (box : S ou S.cmp ; ce qui est déjà lu pour ce lieu et ce rayon n'est pas relu) */
        function fetchAt(pl, box) {
            const sig = `${pl.lat},${pl.lon}|${S.exact ? 'x' : S.km}`, my = ++box.busy, jobs = [];
            if (wantData() && box.sig.data !== sig) jobs.push((async () => { let rows = []; try { rows = P().collect ? await P().collect({places: [pl], km: () => radius()}) : []; } catch (_) { rows = []; } if (my === box.busy) { box.data = rows; box.sig.data = sig; } })());
            if (wantFam() && box.sig.fam !== sig) jobs.push((async () => {
                let r = null; try { r = await A().api('autour_lieu', {lat: pl.lat, lon: pl.lon, km: S.km, exact: S.exact ? 1 : 0, place_id: Number.isInteger(Number(pl.id)) && Number(pl.id) > 0 ? Number(pl.id) : 0}); } catch (e) { toast(e.message, 'error'); }
                if (my === box.busy) { box.fam = r?.items || []; box.sig.fam = sig; } })());
            return {jobs, done: () => my === box.busy};
        }
        async function load() {
            if (!S.place) { paint(); return; }
            const {jobs, done} = fetchAt(S.place, S);
            if (jobs.length) { const sp = UI().spinner ? UI().spinner(T('On cherche…')) : '…'; $('[data-dp-map]').innerHTML = sp; if (S.view === 'table') $('[data-al-table]').innerHTML = sp; if (S.view === 'time') $('[data-al-time]').innerHTML = sp; }
            await Promise.all(jobs);
            if (!done()) return;
            S.shown = PAGE; paint();
            if (S.view === 'cmp') loadCmp();
        }
        async function loadCmp() {
            if (!S.cmp.place) { paint(); return; }
            const {jobs, done} = fetchAt(S.cmp.place, S.cmp);
            if (jobs.length && S.view === 'cmp') $('[data-al-cmp-out]').innerHTML = UI().spinner ? UI().spinner(T('On compte…')) : '…';
            await Promise.all(jobs);
            if (done()) paint();
        }
        function swapCmp() {
            if (!S.cmp.place || !S.place) return;
            const keys = ['place', 'data', 'fam', 'sig'], a = Object.fromEntries(keys.map(k => [k, S[k]]));
            keys.forEach(k => { S[k] = S.cmp[k]; S.cmp[k] = a[k]; });
            S.busy++; S.cmp.busy++; lastPlace = S.place; lastOther = S.cmp.place;
            $('[data-dp-ap] input').value = S.place.name; $('[data-al-cmp-pick] input').value = S.cmp.place.name;
            S.shown = PAGE; paint(); load();
        }

        /* ── les lignes : une seule forme pour les données et la famille ── */
        let rowByKey = new Map(), dataCols = [];
        const placeField = d => (d.fields || []).find(f => f.type === 'place');
        function rowsAll(box = S) {
            const out = [];
            if (wantData() && box.data) {
                const ths = [...new Set(box.data.map(r => r.theme))]; if (box === S) dataCols = ths;
                box.data.forEach((x, i) => { const th = P().themeById?.(x.theme), pf = placeField(x.d);
                    out.push({src: 'data', layer: x.theme, key: `d${i}:${x.d.id}`, title: String(x.title || '—'), sub: T(x.d.label || ''), type: `${th?.icon || ''} ${T(th?.label || x.theme)}`.trim(),
                        y: x.y ?? null, y2: x.y2 ?? x.y ?? null, lat: x.g[0], lon: x.g[1], km: x.k, place: pf ? String(x.r[pf.key] ?? '') : '', color: COLORS[ths.indexOf(x.theme) % COLORS.length], raw: x}); });
            }
            if (wantFam() && box.fam) box.fam.forEach(x => { const f = famOf(x.k);
                out.push({src: 'fam', layer: `fam:${x.k}`, key: x.key, title: String(x.t || '—'), sub: String(x.s || ''), type: `${f[1]} ${x.tl ? T(x.tl) : T(f[2])}`, y: x.y ?? null, y2: x.y ?? null,
                    lat: Number(x.lat), lon: Number(x.lon), km: Number(x.km), place: String(x.pl || ''), color: f[3], raw: x}); });
            if (box === S) rowByKey = new Map(out.map(r => [r.key, r]));
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
            $('[data-al-mapview]').hidden = !isMap; $('[data-al-table]').hidden = S.view !== 'table'; $('[data-al-time]').hidden = S.view !== 'time'; $('[data-al-cmpview]').hidden = S.view !== 'cmp';
            const note = $('[data-al-note]');
            if (!S.place) {
                note.hidden = true; $('[data-dp-leg]').innerHTML = '';
                const msg = T('Choisis un lieu : tout ce qu’on sait autour de lui, sur une carte ou dans un tableau.');
                $('[data-dp-map]').innerHTML = `<p class="muted">${esc(msg)}</p>`; $('[data-al-table]').innerHTML = `<p class="muted">${esc(msg)}</p>`; $('[data-al-time]').innerHTML = `<p class="muted">${esc(msg)}</p>`;
                $('[data-al-cmp-out]').innerHTML = `<p class="muted">${esc(msg)}</p>`; tbl = null; return;
            }
            const capped = isMap && shown.length > S.cap;
            note.hidden = !capped;
            note.innerHTML = capped ? `ℹ️ ${esc(T('{a} premiers sur {n} — voir le tableau', {a: nf(S.cap), n: nf(shown.length)}))} <button type="button" class="link-button" data-al-totable>▤ ${esc(T('Tableau'))}</button>` : '';
            if (isMap) paintMap(shown); else if (S.view === 'time') paintTime(); else if (S.view === 'cmp') paintCmp(); else paintTable();
        }
        const zoneTxt = () => (S.exact ? T('{p} · ce lieu seulement', {p: S.place.name}) : T('Autour de {p} · {n} km', {p: S.place.name, n: S.km}));
        const emptyTxt = () => (S.quoi === 'donnees' ? (S.exact ? T('Rien dans les listes installées à ce lieu.') : T('Rien dans les listes installées à moins de {n} km.', {n: S.km}))
            : S.exact ? T('Rien à ce lieu, pour cette période.') : T('Rien à moins de {n} km, pour cette période.', {n: S.km}));
        let mapRows = [];
        function paintMap(shown) {
            mapRows = [...shown].filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon)).sort((a, b) => a.km - b.km).slice(0, S.cap);
            const pts = mapRows.map(r => ({lat: r.lat, lon: r.lon, label: `${r.title}${r.y != null ? ` (${r.y})` : ''}`, color: r.color}));
            pts.push({lat: S.place.lat, lon: S.place.lon, label: S.place.name, color: '#2b8a3e', n: '◆'});
            const stage = $('[data-dp-map]');
            stage.innerHTML = cur.period.length ? (ext.miniMap ? ext.miniMap(pts, [], {height: 420, circles: S.exact ? [] : [{lat: S.place.lat, lon: S.place.lon, km: S.km}]}) : '') : `<p class="muted">${esc(emptyTxt())}</p>`;
            if (cur.period.length) clickable(stage);
            const legend = new Map(); shown.forEach(r => { const l = legend.get(r.layer) || {r, n: 0}; l.n++; legend.set(r.layer, l); });
            $('[data-dp-leg]').innerHTML = cur.period.length ? `<b>${esc(zoneTxt())}</b>${[...legend.values()].map(({r, n}) => `<span><i style="background:${r.color}"></i>${esc(r.src === 'fam' ? T(famOf(r.raw.k)[2]) : T(P().themeById?.(r.layer)?.label || r.layer))} · ${nf(n)}</span>`).join('')}<span><i class="dp-fam-ic"></i>${esc(T('le lieu choisi'))}</span>` : '';
        }

        /** 🗺 un point de la carte s'ouvre : sa petite fiche (app-carte-fiche.js), sinon directement ce qu'il montre ; clavier : Tab, Entrée */
        const yTxt = ySpan;
        function clickable(stage) {
            const CF = ext.carteFiche, marks = [...stage.querySelectorAll('.h-map-point')];
            marks.forEach((m, i) => {
                const r = mapRows[i]; if (!r) return; // le dernier : le lieu choisi (◆), qui ne s'ouvre pas
                m.dataset.alPt = r.key; m.style.cursor = 'pointer'; m.setAttribute('tabindex', '0'); m.setAttribute('role', 'button');
                m.setAttribute('aria-label', T('Voir la fiche : {name}', {name: `${r.title}${r.y != null ? ` (${r.y})` : ''}`}));
                if (CF) { m.dataset.cfI = String(i); return; }
                const go = () => openRow(r);
                m.addEventListener('click', go); m.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
            });
            CF?.attach(stage, {
                card: i => { const r = mapRows[i]; if (!r) return null;
                    return {title: r.title, sub: r.type, at: {lat: r.lat, lon: r.lon}, open: true, line: true,
                        lines: [[T('Année'), esc(yTxt(r))], [T('Détail'), esc(r.sub)], [T('Lieu'), esc(r.place)], [T('Distance'), esc(kmTxt(r.km))]]}; },
                label: i => mapRows[i]?.title || '', sub: i => { const r = mapRows[i]; return r ? [r.type, yTxt(r)].filter(Boolean).join(' · ') : ''; },
                onAct: (k, i) => { const r = mapRows[i]; if (!r) return; if (k === 'open') openRow(r); else if (k === 'line') showLine(r); }});
        }
        /** ☰ Voir la ligne : le tableau, la ligne montrée et éclairée */
        function showLine(r) {
            ext.carteFiche?.close?.($('[data-dp-map]'));
            setView('table');
            const i = visible().findIndex(x => x.key === r.key);
            if (i >= S.shown) { S.shown = Math.ceil((i + 1) / PAGE) * PAGE; paintTable(); }
            const tr = host.querySelector(`[data-al-table] tr[data-al-row="${CSS.escape(r.key)}"]`); if (!tr) return;
            tr.classList.add('is-al-hi'); tr.scrollIntoView?.({block: 'center'}); (tr.querySelector('button.table-link') || tr).focus?.({preventScroll: true});
            setTimeout(() => tr.classList.remove('is-al-hi'), 2500);
        }

        /* ── ⏳ dans le temps : année par année, les décennies repliées ── */
        const decOf = y => Math.floor(y / 10) * 10;
        let timeRows = new Map();
        function paintTime() {
            const box = $('[data-al-time]'), rows = cur.shown;
            if (!cur.period.length) { box.innerHTML = A().empty ? A().empty(emptyTxt(), {icon: '⏳'}) : `<p class="muted">${esc(emptyTxt())}</p>`; return; }
            const ty = r => yearIn(r, S.y0, S.y1);
            const dated = rows.filter(r => r.y != null).map(r => ({r, y: ty(r)})).sort((a, b) => a.y - b.y || a.r.km - b.r.km), undated = rows.length - dated.length;
            timeRows = new Map();
            dated.forEach(({r, y}) => { const d = decOf(y); r._ty = y; if (!timeRows.has(d)) timeRows.set(d, []); timeRows.get(d).push(r); });
            const max = Math.max(1, ...[...timeRows.values()].map(l => l.length));
            const bar = list => { const by = new Map(); list.forEach(r => by.set(r.color, (by.get(r.color) || 0) + 1)); return `<span class="al-dec-bar" aria-hidden="true" style="width:${Math.max(4, Math.round(list.length / max * 100))}%">${[...by].map(([c, n]) => `<i style="background:${c};flex:${n}"></i>`).join('')}</span>`; };
            const decs = [...timeRows.keys()];
            box.innerHTML = `<div class="al-time-head"><p class="al-time-sum">${esc(dated.length ? T('{n} lignes datées, de {a} à {b}', {n: nf(dated.length), a: dated[0].y, b: dated[dated.length - 1].y}) : T('Aucune ligne datée.'))}${undated ? ` · ${esc(T('{n} sans date', {n: nf(undated)}))}` : ''}</p>
                <span class="al-acts"><button type="button" class="button small ghost" data-al-tall="1">${esc(T('Tout déplier'))}</button><button type="button" class="button small ghost" data-al-tall="0">${esc(T('Tout replier'))}</button></span></div>
                <div class="al-decs">${decs.map(d => { const l = timeRows.get(d), nf0 = l.filter(r => r.src === 'fam').length, open = S.openDec.has(d) || (S.decOpen && !S.openDec.size);
                    return `<details class="al-dec" data-al-dec="${d}"${open ? ' open' : ''}><summary><b class="al-dec-y">${d}–${d + 9}</b><span class="al-dec-n">${nf(l.length)}</span>${bar(l)}<small class="muted">${esc([nf0 ? T('{n} de la famille', {n: nf(nf0)}) : '', l.length - nf0 ? T('{n} des données', {n: nf(l.length - nf0)}) : ''].filter(Boolean).join(' · '))}</small></summary><div class="al-dec-body"></div></details>`; }).join('')}</div>`;
            box.querySelectorAll('details[open][data-al-dec]').forEach(fillDecade);
        }
        function fillDecade(det) {
            const body = det.querySelector('.al-dec-body'); if (!body || body.dataset.done) return;
            const list = timeRows.get(Number(det.dataset.alDec)) || [], years = new Map();
            list.slice(0, TIME_MAX).forEach(r => { const y = r._ty ?? r.y; if (!years.has(y)) years.set(y, []); years.get(y).push(r); });
            const item = r => { const person = r.src === 'fam' && r.raw.p && r.raw.e ? Number(r.raw.p) : 0;
                return `<li><i class="al-dot" style="background:${r.color}"></i>${person ? `<button type="button" class="table-link" data-open-person="${person}">${esc(r.title)}</button>` : `<button type="button" class="table-link" data-al-open="${esc(r.key)}">${esc(r.title)}</button>`} <small class="muted">${esc([r.type, r.y2 && r.y2 !== r.y ? ySpan(r) : '', r.sub, r.place, kmTxt(r.km)].filter(Boolean).join(' · '))}</small></li>`; };
            body.innerHTML = `<ol class="al-years">${[...years].map(([y, l]) => `<li><b class="al-y">${y}</b><ul>${l.map(item).join('')}</ul></li>`).join('')}</ol>${list.length > TIME_MAX ? `<p class="muted small">${esc(T('… et {n} de plus : voir le tableau', {n: nf(list.length - TIME_MAX)}))} <button type="button" class="link-button" data-al-totable>▤ ${esc(T('Tableau'))}</button></p>` : ''}`;
            body.dataset.done = '1';
        }

        /* ── ⚖️ comparer deux lieux : mêmes filtres, deux colonnes ── */
        const layerName = r => (r.src === 'fam' ? `${famOf(r.raw.k)[1]} ${T(famOf(r.raw.k)[2])}` : r.type);
        const famOrder = l => (l.startsWith('fam:') ? 100 + FAM.findIndex(f => `fam:${f[0]}` === l) : 0);
        function cmpCounts() {
            const side = box => { const m = new Map(); rowsAll(box).filter(inPeriod).filter(r => !S.off.has(r.layer)).forEach(r => { const c = m.get(r.layer) || {r, n: 0, y0: null, y1: null}; c.n++; if (r.y != null) { c.y0 = c.y0 == null ? r.y : Math.min(c.y0, r.y); c.y1 = c.y1 == null ? r.y : Math.max(c.y1, r.y); } m.set(r.layer, c); }); return m; };
            const a = side(S), b = side(S.cmp), keys = [...new Set([...a.keys(), ...b.keys()])];
            keys.sort((x, y) => famOrder(x) - famOrder(y) || ((b.get(y)?.n || 0) + (a.get(y)?.n || 0)) - ((b.get(x)?.n || 0) + (a.get(x)?.n || 0)));
            return keys.map(k => ({k, r: (a.get(k) || b.get(k)).r, a: a.get(k) || {n: 0}, b: b.get(k) || {n: 0}}));
        }
        const zoneOf = pl => (S.exact ? T('{p} · ce lieu seulement', {p: pl.name}) : T('Autour de {p} · {n} km', {p: pl.name, n: S.km}));
        const periodTxt = () => (S.y0 === '' && S.y1 === '' ? T('toutes les années') : `${S.y0 === '' ? '…' : S.y0}–${S.y1 === '' ? '…' : S.y1}`);
        function paintCmp() {
            const out = $('[data-al-cmp-out]');
            if (!S.cmp.place) { out.innerHTML = `<p class="muted">${esc(T('Choisis un second lieu : les deux côte à côte, avec le même rayon, la même période et les mêmes pastilles.'))}</p>`; return; }
            if ((wantData() && !S.cmp.data) || (wantFam() && !S.cmp.fam)) { loadCmp(); return; }
            const all = cmpCounts(), list = S.cmpDiff ? all.filter(x => x.a.n !== x.b.n) : all;
            const ta = all.reduce((s, x) => s + x.a.n, 0), tb = all.reduce((s, x) => s + x.b.n, 0);
            const span = c => (c.y0 != null ? `<small>${c.y0 === c.y1 ? c.y0 : `${c.y0}–${c.y1}`}</small>` : '');
            const cell = (c, o, side) => `<div class="al-c ${c.n && !o.n ? 'is-only' : ''}${c.n > o.n && o.n ? ' is-more' : ''}" data-al-cmp-cell="${side}">${c.n ? `<b>${nf(c.n)}</b>` : `<span class="dp-c0">${esc(T('aucune'))}</span>`}${span(c)}</div>`;
            const diff = (a, b) => { const d = a - b; return `<div class="al-d${d ? '' : ' is-eq'}">${d > 0 ? `+${nf(d)}` : d < 0 ? `−${nf(-d)}` : '='}</div>`; };
            const h = (pl, n) => `<div class="dp-h">${esc(pl.name)}<small>${esc(zoneOf(pl))} · ${esc(periodTxt())}</small><small>${esc(T('{n} lignes', {n: nf(n)}))}</small></div>`;
            out.innerHTML = all.length ? `<div class="dp-cmp al-cmp" role="table" aria-label="${esc(T('Comparer deux lieux'))}"><div class="dp-h dp-t">${esc(T('Thème'))}</div>${h(S.place, ta)}${h(S.cmp.place, tb)}<div class="dp-h al-d">${esc(T('Écart'))}</div>
                ${list.map(x => `<div class="dp-t" data-al-cmp-row="${esc(x.k)}"><i class="al-dot" style="background:${x.r.color}"></i>${esc(layerName(x.r))}</div>${cell(x.a, x.b, 'a')}${cell(x.b, x.a, 'b')}${diff(x.a.n, x.b.n)}`).join('')}
                <div class="dp-t al-tot">${esc(T('Total'))}</div><div class="al-c al-tot"><b>${nf(ta)}</b></div><div class="al-c al-tot"><b>${nf(tb)}</b></div>${diff(ta, tb)}</div>
                ${S.cmpDiff && list.length < all.length ? `<p class="muted small">${esc(T('{n} thèmes égaux des deux côtés ne sont pas montrés (⚙️ Personnaliser).', {n: nf(all.length - list.length)}))}</p>` : ''}
                <p class="muted small">${esc(T('En couleur : ce qui n’existe que d’un côté ; souligné : le côté qui en a le plus.'))}</p>`
                : `<p class="muted">${esc(emptyTxt())}</p>`;
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

        /* ── 🖨 la fiche imprimable « Autour de Brive, 1850-1914 » ── */
        const sheetTitle = () => { const base = S.exact ? S.place.name : T('Autour de {p}', {p: S.place.name}); return S.y0 === '' && S.y1 === '' ? base : `${base}, ${S.y0 === '' ? '…' : S.y0}-${S.y1 === '' ? '…' : S.y1}`; };
        function printMenu(btn) {
            if (!S.place) { toast(T('Choisis d’abord un lieu.')); return; }
            UI().menuAt(btn, [{icon: '🖨', label: T('Imprimer la fiche…'), run: printSheet}, {icon: '⤓', label: T('Télécharger la fiche (HTML)'), run: downloadSheet}], {title: T('Fiche imprimable')});
        }
        const sheetData = () => ({title: sheetTitle(), place: S.place, km: S.km, exact: S.exact, zone: zoneTxt(), period: periodTxt(), y0: S.y0, y1: S.y1, rows: cur.shown, layerName});
        function printSheet() {
            const opts = [{key: 'map', label: T('La carte'), checked: true}, {key: 'sum', label: T('Le résumé par thème'), checked: true}, {key: 'hi', label: T('Les faits marquants'), checked: true},
                {key: 'dec', label: T('Les décennies'), checked: true}, {key: 'rows', label: T('Toutes les lignes (tableau)'), checked: false}];
            if (!kiosk()) opts.push({key: 'priv', label: T('Sans les vivants ni les fiches confidentielles'), checked: true});
            UI().openPrintDialog?.({title: sheetTitle(), icon: '🗺', key: 'autour-lieu', photos: false, options: opts, html: c => sheetHtml(sheetData(), {...c, priv: kiosk() || c.priv !== false})});
        }
        function downloadSheet() {
            const html = sheetHtml(sheetData(), {map: true, sum: true, hi: true, dec: true, rows: true, priv: true});
            const name = `${fold(sheetTitle()).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'autour'}.html`;
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], {type: 'text/html'})); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
            toast(T('Fiche téléchargée : {f}', {f: name}));
        }

        if (S.place) load(); else paint();
        return {state: S, reload: load, get rows() { return cur; }, sheet: () => sheetHtml(sheetData(), {map: true, sum: true, hi: true, dec: true, rows: false, priv: true}), title: sheetTitle};
    }

    /** 🖨 la fiche, un document complet (imprimé par UI.openPrintDialog ou téléchargé) ; priv : sans ce qui montre un vivant ou une fiche confidentielle */
    function sheetHtml(d, o = {}) {
        const rows = d.rows.filter(r => !(o.priv && r.raw?.lv)), ty = r => yearIn(r, d.y0, d.y1), dated = rows.filter(r => r.y != null).sort((a, b) => ty(a) - ty(b) || a.km - b.km);
        const by = new Map(); rows.forEach(r => { const c = by.get(r.layer) || {r, n: 0, y0: null, y1: null}; c.n++; if (r.y != null) { c.y0 = c.y0 == null ? r.y : Math.min(c.y0, r.y); c.y1 = c.y1 == null ? r.y : Math.max(c.y1, r.y); } by.set(r.layer, c); });
        const layers = [...by.values()].sort((a, b) => b.n - a.n);
        const decs = new Map(); dated.forEach(r => { const k = Math.floor(ty(r) / 10) * 10; const c = decs.get(k) || {n: 0, f: 0}; c.n++; if (r.src === 'fam') c.f++; decs.set(k, c); });
        const years = new Map(); dated.forEach(r => years.set(ty(r), (years.get(ty(r)) || 0) + 1));
        const parts = [];
        parts.push(`<header><h1>🗺 ${esc(d.title)}</h1><p class="sub">${esc(d.zone)} · ${esc(d.period)} · ${esc(T('{n} lignes', {n: nf(rows.length)}))}</p></header>`);
        if (o.map !== false) {
            const W = 720, H = 400, lat0 = d.place.lat, lon0 = d.place.lon, cos = Math.cos(lat0 * Math.PI / 180);
            const xy = r => [(r.lon - lon0) * cos * 111.32, (lat0 - r.lat) * 110.57];
            const R = d.exact ? Math.max(1.5, ...rows.map(r => r.km || 0)) : d.km, k = (Math.min(W, H) / 2 - 14) / (R * 1.05);
            const dots = rows.filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon)).slice(0, 3000).map(r => { const [x, y] = xy(r); const X = W / 2 + x * k, Y = H / 2 + y * k; return X < 0 || X > W || Y < 0 || Y > H ? '' : `<circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="3.6" fill="${r.color}" stroke="#fff" stroke-width="1"/>`; }).join('');
            const bar = [1, 2, 5, 10, 20, 50, 100, 200].find(v => v * k >= 60) || 200;
            parts.push(`<section class="map"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T('La carte'))}"><rect width="${W}" height="${H}" fill="#fff" stroke="#111"/>${d.exact ? '' : `<circle cx="${W / 2}" cy="${H / 2}" r="${(R * k).toFixed(1)}" fill="rgba(212,56,13,.06)" stroke="#d4380d" stroke-width="1.5" stroke-dasharray="6 4"/>`}${dots}
                <path d="M${W / 2} ${H / 2 - 8}L${W / 2 + 8} ${H / 2}L${W / 2} ${H / 2 + 8}L${W / 2 - 8} ${H / 2}Z" fill="#2b8a3e" stroke="#fff" stroke-width="1.5"/><text x="${W / 2 + 12}" y="${H / 2 - 10}" font-size="13" font-weight="700" fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(d.place.name)}</text>
                <g transform="translate(14 ${H - 16})"><path d="M0 0h${(bar * k).toFixed(1)}" stroke="#111" stroke-width="2"/><text y="-5" font-size="11" fill="#111">${bar} km</text></g><text x="${W - 8}" y="16" text-anchor="end" font-size="13" font-weight="700" fill="#111">N ↑</text></svg>
                <p class="legend">${layers.map(c => `<span><i style="background:${c.r.color}"></i>${esc(d.layerName(c.r))} · ${nf(c.n)}</span>`).join('')}<span><i style="background:#2b8a3e"></i>${esc(T('le lieu choisi'))}</span></p></section>`);
        }
        if (o.sum !== false) parts.push(`<section><h2>${esc(T('Le résumé par thème'))}</h2>${layers.length ? `<table><thead><tr><th>${esc(T('Thème'))}</th><th class="n">${esc(T('Lignes'))}</th><th>${esc(T('Années'))}</th></tr></thead><tbody>${layers.map(c => `<tr><td><i class="dot" style="background:${c.r.color}"></i>${esc(d.layerName(c.r))}</td><td class="n">${nf(c.n)}</td><td>${c.y0 != null ? (c.y0 === c.y1 ? c.y0 : `${c.y0}–${c.y1}`) : '—'}</td></tr>`).join('')}<tr class="tot"><td>${esc(T('Total'))}</td><td class="n">${nf(rows.length)}</td><td></td></tr></tbody></table>` : `<p>${esc(T('Rien à cet endroit pour cette période.'))}</p>`}</section>`);
        if (o.hi !== false && rows.length) {
            const hi = [];
            if (dated.length) { const a = dated[0], z = dated[dated.length - 1]; hi.push(T('Le plus ancien : {t} ({y})', {t: `${a.title} — ${a.type}`, y: ySpan(a)})); if (z !== a) hi.push(T('Le plus récent : {t} ({y})', {t: `${z.title} — ${z.type}`, y: ySpan(z)})); }
            const by1 = [...years].sort((a, b) => b[1] - a[1])[0]; if (by1 && by1[1] > 1) hi.push(T('L’année la plus riche : {y} ({n} lignes)', {y: by1[0], n: nf(by1[1])}));
            const bd = [...decs].sort((a, b) => b[1].n - a[1].n)[0]; if (bd && decs.size > 1) hi.push(T('La décennie la plus riche : {a}–{b} ({n} lignes)', {a: bd[0], b: bd[0] + 9, n: nf(bd[1].n)}));
            const fam = rows.filter(r => r.src === 'fam'); if (fam.length) { const c = [...fam].sort((a, b) => a.km - b.km)[0]; hi.push(T('Le plus proche, dans la famille : {t} ({k})', {t: `${c.title} — ${c.type}`, k: kmTxt(c.km)})); }
            const people = new Set(fam.map(r => Number(r.raw?.p) || 0).filter(Boolean)); if (people.size) hi.push(T('{n} personnes de la famille', {n: nf(people.size)}));
            const top = layers[0]; if (top) hi.push(T('Le thème le plus présent : {t} ({n} lignes)', {t: d.layerName(top.r), n: nf(top.n)}));
            parts.push(`<section><h2>${esc(T('Les faits marquants'))}</h2><ul class="hi">${hi.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>`);
        }
        if (o.dec !== false && decs.size) parts.push(`<section><h2>${esc(T('Les décennies'))}</h2><table><thead><tr><th>${esc(T('Décennie'))}</th><th class="n">${esc(T('Lignes'))}</th><th class="n">${esc(T('Famille'))}</th><th class="n">${esc(T('Données'))}</th></tr></thead><tbody>${[...decs].sort((a, b) => a[0] - b[0]).map(([k, c]) => `<tr><td>${k}–${k + 9}</td><td class="n">${nf(c.n)}</td><td class="n">${nf(c.f)}</td><td class="n">${nf(c.n - c.f)}</td></tr>`).join('')}</tbody></table></section>`);
        if (o.rows && rows.length) parts.push(`<section><h2>${esc(T('Toutes les lignes'))}</h2><table class="rows"><thead><tr><th>${esc(T('Année'))}</th><th>${esc(T('Type'))}</th><th>${esc(T('Titre'))}</th><th>${esc(T('Lieu'))}</th><th class="n">${esc(T('Distance'))}</th></tr></thead><tbody>${[...rows].sort((a, b) => (a.y ?? 1e9) - (b.y ?? 1e9) || a.km - b.km).slice(0, 3000).map(r => `<tr><td>${r.y ?? '—'}</td><td>${esc(r.type)}</td><td>${esc(r.title)}${r.sub ? `<br><small>${esc(r.sub)}</small>` : ''}</td><td>${esc(r.place)}</td><td class="n">${esc(kmTxt(r.km))}</td></tr>`).join('')}</tbody></table></section>`);
        if (o.priv) parts.push(`<p class="foot">${esc(T('Sans les vivants ni les fiches confidentielles.'))}</p>`);
        const css = `body{font:13px/1.45 Helvetica,Arial,sans-serif;color:#111;background:#fff;margin:0;padding:14mm}h1{font-size:22px;margin:0 0 2px}h2{font-size:15px;margin:16px 0 6px;border-bottom:2px solid #111;padding-bottom:2px}.sub{margin:0 0 10px;color:#555}
svg{width:100%;height:auto;display:block}.legend{display:flex;flex-wrap:wrap;gap:2px 12px;font-size:11.5px;margin:6px 0}.legend i,.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:middle;-webkit-print-color-adjust:exact;print-color-adjust:exact}
table{border-collapse:collapse;width:100%;font-size:12px}th,td{border-bottom:1px solid #ccc;padding:3px 6px;text-align:left;vertical-align:top}th{border-bottom:2px solid #111}.n{text-align:right;font-variant-numeric:tabular-nums}.tot td{font-weight:700;border-top:2px solid #111}
.hi{margin:0;padding-left:18px}section{break-inside:avoid}table.rows{break-inside:auto}tr{break-inside:avoid}.foot{margin-top:14px;color:#555;font-size:11px}small{color:#555}`;
        return `<!doctype html><html lang="${esc(lang())}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(d.title)}</title><style>${css}</style></head><body>${parts.join('\n')}</body></html>`;
    }

    /** 📊 Données : dans une fenêtre */
    function open(p0 = null, {from = 'donnees', view = '', other = null} = {}) {
        ext.openDialog?.({eyebrow: T('Une seule carte de tout'), title: `🗺 ${T('Tout autour d’un lieu')}`, wide: true, submitLabel: 'Fermer',
            body: '<div data-al-host></div>', onOpen: dl => { dl.classList.add('al-dialog'); mount(dl.querySelector('[data-al-host]'), {place: p0, from, view, other}); }, onSubmit: () => true});
    }
    /** 🔍 Recherche → « 🗺 Tout autour d'un lieu » : une page */
    function page(token) {
        const st = A().state, ws = document.getElementById('workspace'); if (!ws || (token != null && st && token !== st.workspaceToken)) return;
        const sec = document.createElement('section'); sec.className = 'page al-page';
        sec.innerHTML = `${UI().pageHeader ? UI().pageHeader({where: T('Recherche'), icon: '🗺', title: T('Tout autour d’un lieu'), help: esc(T('Un lieu et un rayon : ta famille (naissances, mariages, décès, documents, photos, cartes postales, enquêtes) et les listes de données installées, sur une carte ou dans un tableau.'))}) : `<h2>🗺 ${esc(T('Tout autour d’un lieu'))}</h2>`}<div data-al-host></div>`;
        ws.replaceChildren(sec);
        mount(sec.querySelector('[data-al-host]'), {place: lastPlace, from: 'recherche'});
    }
    ext.autourLieu = {open, page, mount, sheetHtml, KEY, FAM};
})();
