/**
 * 🧾 Tableur — lien avec la base (maquette validée « 🧾 Tableur », écran E « Lien avec la base — remplir, tenir à jour, envoyer »).
 * Branché sur l'éditeur (heritage-tableur.js) par ses crochets : menu Données (ext.sheetMenuExtra, ext.sheetCommands),
 * et ext.tableurInternals.Editor (bandeau 🔗 et relecture à l'ouverture). Serveur : lib/sheet_link.php.
 *  - « ⤒ Remplir depuis l'app » : 1. ce qu'on prend (Personnes et Événements avec la barre H10, Recensements, Relevés de
 *    dépouillement, Statistiques, Mes listes) · 2. les colonnes (⠿ à ranger, « ＋ Une colonne tirée des données ») ·
 *    3. aperçu, « Où : … », « ⤒ Remplir N lignes ». Une personne ou un lieu arrive en pastille (cell.ref) : la cellule se
 *    choisit ensuite avec le menu de choix unique (validation « personne » / « lieu » posée sur la colonne).
 *  - « Tenir à jour » : la plage est liée (sheet.link) ; bandeau 🔗 avec ↻, relue à l'ouverture ; les colonnes à soi
 *    ajoutées à droite suivent leur ligne (clé = numéro de la fiche).
 *  - Les noms des personnes et lieux choisis dans les cellules suivent les fiches (sheet_refs) ; une fiche supprimée
 *    redevient une pastille grise « ? ».
 *  - « 📤 Envoyer vers la base » : 1. les colonnes → les champs · 2. « Voilà ce qui va entrer » ligne par ligne (K8 :
 *    Déjà dans la base, Nouvelle fiche, À vérifier avec « choisis ▾ », Problème) · 3. « 📤 Créer N fiches et en relier N »,
 *    puis message H7 « ↶ Annuler » (sheet_push_undo : la base revient comme avant).
 *  - Modèle « Relevé de recensement » : les colonnes de l'année choisie (1836 → 1936), la commune ; ext.sheetBase.openFilled
 *    pour les Dépouillements (« Personnes et foyers de la page ») et l'Atelier.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const X = () => window.LCNDA_SHEET;
    const P = () => window.LCNDA_PICKER || A();
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => (A()?.escapeHtml ? A().escapeHtml(v ?? '') : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const toast = (...a) => A().toast(...a);
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const plural = (n, w, p) => (A()?.plural ? A().plural(n, w, p) : `${n} ${n > 1 ? p || w + 's' : w}`);
    const badge = (t, k) => (UI()?.badge ? UI().badge(t, k) : `<span class="ui-badge is-${k}">${esc(t)}</span>`);
    const notice = (k, t) => (UI()?.notice ? UI().notice(k, t) : `<p>${esc(t)}</p>`);
    const HEAD = {b: 1, fill: '#e8eef7'};
    const PREF = 'genealogie-tableur-base';
    const prefs = () => { try { const p = JSON.parse(localStorage.getItem(PREF) || '{}'); return p && typeof p === 'object' ? p : {}; } catch (_) { return {}; } };
    const setPref = (k, v) => { try { localStorage.setItem(PREF, JSON.stringify({...prefs(), [k]: v})); } catch (_) {} };
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const kiosk = () => document.body.classList.contains('is-kiosk');
    let SRC = null;
    const sources = async (force = false) => (SRC && !force ? SRC : (SRC = await api('sheet_sources')));

    /* ═════════ Écrire un bloc dans une feuille ═════════ */
    /** une valeur venue de la base → une cellule (une personne ou un lieu garde sa fiche ; un texte qui commence par « = » reste un texte) */
    function cellOf(v, type) {
        if (v == null || v === '') return null;
        if (typeof v === 'object' && v.ref && ['person', 'place'].includes(v.ref.kind) && Number(v.ref.id) > 0) return {v: String(v.v ?? '').slice(0, 2000), ref: {kind: v.ref.kind, id: Number(v.ref.id)}};
        if (typeof v === 'object') return {v: String(v.v ?? '')};
        if (typeof v === 'number') return Number.isFinite(v) ? {v} : null;
        const s = String(v);
        if (type === 'number') { const n = X().toNum(s); if (n !== null) return {v: n}; }
        return {v: /^[='+]/.test(s) ? "'" + s : s};
    }
    const WIDTH = {person: 170, place: 150, date: 125, text: 120, number: 80};
    /** l'en-tête et les lignes ; set(clé, cellule) écrit (dans une transaction de l'éditeur, ou directement dans un classeur neuf) */
    function writeBlock(wb, sh, r0, c0, cols, rows, set) {
        const S = X(), hs = S.styleId(wb, HEAD);
        cols.forEach((c, j) => { set(S.addr(r0, c0 + j), {v: c.label, s: hs}); sh.cols[S.colName(c0 + j)] = {...(sh.cols[S.colName(c0 + j)] || {}), w: Math.max(sh.cols[S.colName(c0 + j)]?.w || 0, WIDTH[c.type] || 110)}; });
        rows.forEach((row, i) => cols.forEach((c, j) => { const cell = cellOf(row.cells?.[c.k], c.type); set(S.addr(r0 + 1 + i, c0 + j), cell); }));
        return rows.map(r => r.key);
    }
    /** le menu de choix sur les colonnes « personne » et « lieu » du bloc (les nouvelles lignes aussi) */
    function blockDv(sh, r0, c0, cols, n) {
        const S = X(), mine = new Set(cols.map((c, j) => (['person', 'place'].includes(c.type) ? S.colName(c0 + j) : null)).filter(Boolean));
        sh.dv = (sh.dv || []).filter(d => { const g = S.parseRange(d.range); return !g || !(g.r0 > r0 && [...mine].some(col => S.colNum(col) >= g.c0 && S.colNum(col) <= g.c1)); });
        cols.forEach((c, j) => { if (['person', 'place'].includes(c.type)) sh.dv.push({range: `${S.colName(c0 + j)}${r0 + 2}:${S.colName(c0 + j)}${Math.min(S.LIMITS.rows, r0 + n + 5)}`, kind: c.type, allowFree: true}); });
        sh.dv = sh.dv.slice(-60);
    }
    const linkOf = (src, data, r0, c0, keys) => ({src, cols: data.columns, r0, c0, n: keys.length, keys: keys.slice(0, 20000), at: new Date().toISOString(), label: data.label || ''});
    const fillSpec = (src, cols) => ({source: src.source, filters: src.filters || {}, privacy: !!src.privacy, cols});
    const fetchFill = (src, cols) => api('sheet_fill', {spec: JSON.stringify(fillSpec(src, cols))});

    /** un classeur neuf déjà rempli (Dépouillements, Atelier…), ouvert dans le tableur, pas encore rangé */
    async function openFilled({src, cols = [], name = 'Classeur', keep = true, sheetName = ''} = {}) {
        if (!X() || !ext.openWorkbook) return toast('Le tableur n’est pas chargé.', 'error');
        let data; try { data = await fetchFill(src, cols); } catch (e) { return toast(e.message, 'error'); }
        const S = X(), wb = S.newWorkbook(), sh = wb.sheets[0]; sh.name = S.cleanSheetName(sheetName || data.label || name, []);
        const keys = writeBlock(wb, sh, 0, 0, data.columns, data.rows, (k, c) => { if (c) sh.cells[k] = c; else delete sh.cells[k]; });
        sh.freeze = {r: 1, c: 0}; blockDv(sh, 0, 0, data.columns, keys.length);
        if (keep) sh.link = linkOf(src, data, 0, 0, keys);
        return ext.openWorkbook({data: S.normalize(wb), name: String(name).slice(0, 180)});
    }

    /* ═════════ ⤒ Remplir depuis l'app ═════════ */
    const SRC_ORDER = ['persons', 'events', 'census', 'digest', 'stats', 'mylist'];
    async function fillDialog(ed, {edit = false} = {}) {
        let cat; try { cat = await sources(true); } catch (e) { return toast(e.message, 'error'); }
        const sh = ed.S(), L = edit && sh.link?.src ? sh.link : null, p0 = prefs();
        const st = {source: L?.src.source || p0.source || 'persons', filters: {...(L?.src.filters || {})}, privacy: L ? !!L.src.privacy : !!p0.privacy || kiosk() || !!cat.privacy_forced, keep: L ? true : p0.keep !== false,
            cols: {}, where: L ? 'same' : 'new', data: null, seq: 0};
        if (L) st.cols[st.source] = L.cols.map(c => c.k);
        const srcOf = k => cat.sources.find(s => s.key === k);
        const colsFor = k => st.cols[k] || (p0.cols?.[k]?.length ? p0.cols[k] : (srcOf(k)?.columns || []).filter(c => c.def).map(c => c.k));
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-l xl-base-dlg';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">TABLEUR · BASE</span><h2>⤒ Remplir depuis l’app</h2></div><button type="button" class="icon-button" data-bx aria-label="Fermer">×</button></div>
            <div class="h-dialog-body xl-base-body">
                <h3 class="xl-base-h">1 · Ce qu’on prend</h3>
                <div class="ui-filters xl-base-src" role="tablist" data-bsrc>${SRC_ORDER.map(k => { const s = srcOf(k); return s ? `<button type="button" data-bs="${k}" class="${k === st.source ? 'is-active' : ''}">${esc(s.icon)} ${esc(s.label)} (${Number(s.count).toLocaleString('fr-FR')})</button>` : ''; }).join('')}</div>
                <div class="xl-base-opts" data-bopts></div>
                <label class="checkbox-line xl-base-priv"><input type="checkbox" data-bpriv ${st.privacy ? 'checked' : ''} ${kiosk() || cat.privacy_forced ? 'disabled' : ''}> 🔒 Sans les vivants ni les fiches confidentielles <small class="muted">(comme l’export pour partager)</small></label>
                <h3 class="xl-base-h">2 · Les colonnes <small class="muted">(glisse ⠿ pour ranger)</small></h3>
                <div class="xl-base-cols" data-bcols></div>
                <div><button type="button" class="button small secondary" data-badd>＋ Une colonne tirée des données</button></div>
                <h3 class="xl-base-h">3 · Aperçu <small class="muted" data-bcount></small></h3>
                <div class="xl-base-prev" data-bprev></div>
                <label class="checkbox-line xl-base-keep"><input type="checkbox" data-bkeep ${st.keep ? 'checked' : ''}> 🔗 Tenir à jour <small class="muted">— les lignes changent quand la base change (à l’ouverture, ou avec ↻). Tes colonnes ajoutées à droite (formules, notes) restent sur la bonne ligne.</small></label>
            </div>
            <div class="modal-actions"><label class="xl-base-where">Où : <select data-bwhere>${L ? '<option value="same">à la même place (remplace la plage liée)</option>' : ''}<option value="new">à partir de A1 dans une nouvelle feuille</option><option value="here">à partir de ${esc(X().addr(...ed.act))} dans cette feuille</option></select></label><span class="spacer"></span><button type="button" class="button secondary" data-bx>Annuler</button><button type="submit" class="button" data-bgo disabled>⤒ Remplir</button></div></form>`;
        document.body.appendChild(dlg);
        const $ = s => dlg.querySelector(s);
        $('[data-bwhere]').value = st.where;
        let bar = null;
        const evTypes = () => (A().state?.bootstrap?.eventTypes || []).filter(t => Number(t.usage_count) > 0 || (st.filters.event_types || []).map(Number).includes(Number(t.id))).map(t => [String(t.id), t.label]);
        function optsHtml() {
            const f = st.filters, s = st.source;
            if (s === 'census') return `<div class="xl-base-row"><label>Commune <select data-bf="place_id"><option value="">Toutes</option>${cat.census.map(c => `<option value="${c.place_id}" ${String(f.place_id ?? '') === String(c.place_id) ? 'selected' : ''}>${esc(c.name)} (${plural(c.members, 'personne')})</option>`).join('')}</select></label>
                <label>Année <select data-bf="year"><option value="">Toutes</option>${[...new Set(cat.census.flatMap(c => c.years))].sort().map(y => `<option ${String(f.year ?? '') === String(y) ? 'selected' : ''}>${y}</option>`).join('')}</select></label></div>`;
            if (s === 'digest') return cat.digests.length ? `<div class="xl-base-row"><label>Dépouillement <select data-bf="digest_id">${cat.digests.map(d => `<option value="${d.id}" ${String(f.digest_id ?? '') === String(d.id) ? 'selected' : ''}>${esc(d.title)} (${plural(d.people, 'personne')})</option>`).join('')}</select></label><label>Page <input data-bf="page" value="${esc(f.page || '')}" placeholder="toutes" size="6"></label></div>` : A().empty('Pas encore de dépouillement : Listes → 📜 Dépouillements.', {icon: '📜'});
            if (s === 'stats') return `<div class="xl-base-row"><label>Statistique <select data-bf="stat">${cat.stats.map(x => `<option value="${x.key}" ${(f.stat || 'first_name') === x.key ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label><label class="checkbox-line"><input type="checkbox" data-bf="sex" ${f.sex ? 'checked' : ''}> Hommes et femmes à part</label></div>`;
            if (s === 'mylist') return cat.my_lists.length ? `<div class="xl-base-row"><label>Liste <select data-bf="list_id">${cat.my_lists.map(l => `<option value="${l.id}" ${String(f.list_id ?? '') === String(l.id) ? 'selected' : ''}>${esc(l.icon)} ${esc(l.name)}</option>`).join('')}</select></label></div>` : A().empty('Pas encore de liste à toi : Listes → Mes listes.', {icon: '📋'});
            return '<div data-bbar></div>';
        }
        function paintOpts() {
            const box = $('[data-bopts]'); box.innerHTML = optsHtml(); bar = null;
            const f = st.filters;
            if (['digest', 'stats', 'mylist'].includes(st.source)) { const k = {digest: 'digest_id', stats: 'stat', mylist: 'list_id'}[st.source], sel = box.querySelector(`[data-bf="${k}"]`); if (sel && !f[k]) f[k] = sel.value; }
            const host = box.querySelector('[data-bbar]'); if (!host || !UI()?.listBar) return;
            const filters = st.source === 'persons' ? [
                {id: 'gender', group: 'Genre', label: 'Genre', type: 'check', options: [['male', 'Hommes'], ['female', 'Femmes'], ['unknown', 'Inconnu']], value: f.gender || []},
                {id: 'sosa', group: 'Lignée', label: 'Sosa', type: 'check', text: 'Seulement mes ancêtres (Sosa)', chipLabel: 'Sosa', value: !!f.sosa},
                {id: 'birth_place', group: 'Lieu de naissance', label: 'Lieu de naissance', type: 'place', chipPrefix: 'Né(e) à', value: f.birth_place_id ? {id: f.birth_place_id, title: f.birth_place_title || ''} : (f.birth_place ? 'txt:' + f.birth_place : '')},
                {id: 'label_id', group: 'Étiquette', label: 'Étiquette', kind: 'label', chipPrefix: '🏷', value: f.label_id ? {id: f.label_id, title: f.label_title || ''} : ''},
                {id: 'born_from', group: 'Naissance', label: 'Nés à partir de', placeholder: '1700', chipPrefix: 'Nés à partir de', value: f.born_from || ''},
                {id: 'born_to', group: 'Naissance', label: 'Nés jusqu’à', placeholder: '1850', chipPrefix: 'Nés avant', value: f.born_to || ''},
            ] : [
                {id: 'event_types', group: 'Sorte', label: 'Sorte', type: 'check', options: evTypes(), value: (f.event_types || []).map(String)},
                {id: 'place', group: 'Lieu', label: 'Lieu', type: 'place', chipPrefix: '📍', value: f.place_id ? {id: f.place_id, title: f.place_title || ''} : (f.place ? 'txt:' + f.place : '')},
                {id: 'year_from', group: 'Années', label: 'À partir de', placeholder: '1700', chipPrefix: 'Depuis', value: f.year_from || ''},
                {id: 'year_to', group: 'Années', label: 'Jusqu’à', placeholder: '1900', chipPrefix: 'Jusqu’à', value: f.year_to || ''},
                {id: 'sosa', group: 'Lignée', label: 'Sosa', type: 'check', text: 'Seulement mes ancêtres (Sosa)', chipLabel: 'Sosa', value: !!f.sosa},
            ];
            bar = UI().listBar({key: '', remember: false, search: {placeholder: st.source === 'persons' ? 'Chercher… (nom, prénom)' : 'Chercher… (nom, sorte, lieu)', value: f.q || ''}, filters,
                onChange: s => { readBar(s); load(); }});
            host.appendChild(bar);
        }
        function readBar(s) {
            const f = {}, v = s.filters; if (s.q) f.q = s.q;
            const place = (key, idK, titleK, txtK) => { const x = v[key]; if (x && typeof x === 'object' && x.id) { f[idK] = Number(x.id); f[titleK] = x.title || ''; } else if (x) f[txtK] = String(x).replace(/^txt:/, ''); };
            if (st.source === 'persons') { if (v.gender?.length) f.gender = v.gender; if (v.sosa) f.sosa = 1; place('birth_place', 'birth_place_id', 'birth_place_title', 'birth_place'); if (v.label_id?.id) { f.label_id = Number(v.label_id.id); f.label_title = v.label_id.title || ''; } if (v.born_from) f.born_from = v.born_from; if (v.born_to) f.born_to = v.born_to; }
            else { if (v.event_types?.length) f.event_types = v.event_types.map(Number); if (v.sosa) f.sosa = 1; place('place', 'place_id', 'place_title', 'place'); if (v.year_from) f.year_from = v.year_from; if (v.year_to) f.year_to = v.year_to; }
            st.filters = f;
        }
        function allCols() { return st.data?.columns && ['stats', 'mylist'].includes(st.source) ? st.data.columns : (srcOf(st.source)?.columns || []); }
        function paintCols() {
            const box = $('[data-bcols]'), all = allCols(), keys = ['stats', 'mylist'].includes(st.source) ? all.map(c => c.k) : colsFor(st.source);
            const TYPE = {person: '👤 personne', place: '📍 lieu', date: '📅 date d’acte', number: 'nombre', text: ''};
            box.innerHTML = keys.map((k, i) => { const c = all.find(x => x.k === k); if (!c) return ''; return `<div class="xl-base-col" data-bk="${esc(k)}"><span class="xl-base-cl"><span class="xl-base-cn">${esc(X().colName(i))}</span><b>${esc(c.label)}</b>${TYPE[c.type] ? ` <small class="muted">(${esc(TYPE[c.type])})</small>` : ''}</span>${['stats', 'mylist'].includes(st.source) ? '' : `<button type="button" class="icon-button small" data-bmv="-1" title="Monter" aria-label="Monter">↑</button><button type="button" class="icon-button small" data-bmv="1" title="Descendre" aria-label="Descendre">↓</button><button type="button" class="icon-button small" data-brm title="Retirer la colonne" aria-label="Retirer la colonne">✕</button>`}</div>`; }).join('') || A().empty('Aucune colonne : ajoute-en une.', {icon: '▦'});
            $('[data-badd]').parentElement.hidden = ['stats', 'mylist'].includes(st.source);
        }
        function paintPrev() {
            const d = st.data, box = $('[data-bprev]'), go = $('[data-bgo]');
            if (!d) { box.innerHTML = UI()?.spinner ? UI().spinner('Lecture de la base…') : 'Lecture…'; go.disabled = true; return; }
            const n = d.rows.length;
            $('[data-bcount]').textContent = n ? `(${Math.min(12, n)} premières lignes sur ${n.toLocaleString('fr-FR')})` : '';
            const cell = (v, c) => { if (v && typeof v === 'object') { const ini = String(v.v || '?').split(/[\s-]+/).filter(Boolean).map(x => x[0]).join('').slice(0, 2).toUpperCase(); return `<span class="xl-chip"><span class="xl-av${c.type === 'place' ? ' is-place' : ''}">${c.type === 'place' ? '📍' : esc(ini)}</span>${esc(v.v)}</span>`; } return esc(typeof v === 'number' ? v.toLocaleString('fr-FR') : v ?? ''); };
            box.innerHTML = (n ? `<div class="xl-prev"><table><thead><tr>${d.columns.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${d.rows.slice(0, 12).map(r => `<tr>${d.columns.map(c => `<td>${cell(r.cells[c.k], c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : A().empty('Rien ne correspond : change les filtres.', {icon: '🔍'}))
                + (d.hidden ? notice('info', `${plural(d.hidden, 'ligne')} laissée${d.hidden > 1 ? 's' : ''} de côté (personnes vivantes ou fiches confidentielles).`) : '')
                + (d.truncated ? notice('warn', `Seules les ${n.toLocaleString('fr-FR')} premières lignes sont prises : précise les filtres.`) : '');
            go.disabled = !n || !d.columns.length; go.textContent = n ? `⤒ Remplir ${plural(n, 'ligne')}` : '⤒ Remplir';
        }
        let timer = 0;
        function load() {
            clearTimeout(timer); st.data = null; paintPrev();
            timer = setTimeout(async () => {
                const seq = ++st.seq, src = {source: st.source, filters: st.filters, privacy: st.privacy};
                try { const d = await fetchFill(src, ['stats', 'mylist'].includes(st.source) ? [] : colsFor(st.source)); if (seq !== st.seq || !dlg.open) return; st.data = d; paintCols(); paintPrev(); }
                catch (e) { if (seq === st.seq) $('[data-bprev]').innerHTML = notice('error', e.message); }
            }, 220);
        }
        const setCols = keys => { st.cols[st.source] = keys; setPref('cols', {...(prefs().cols || {}), [st.source]: keys}); paintCols(); load(); };
        dlg.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.matches('[data-bx]')) return dlg.close();
            if (b.dataset.bs) { st.source = b.dataset.bs; st.filters = {}; st.data = null; setPref('source', st.source); dlg.querySelectorAll('[data-bs]').forEach(x => x.classList.toggle('is-active', x === b)); paintOpts(); paintCols(); load(); return; }
            const row = b.closest('[data-bk]');
            if (row && b.dataset.bmv) { const keys = [...colsFor(st.source)], i = keys.indexOf(row.dataset.bk), j = i + Number(b.dataset.bmv); if (j < 0 || j >= keys.length) return; [keys[i], keys[j]] = [keys[j], keys[i]]; return setCols(keys); }
            if (row && b.matches('[data-brm]')) return setCols(colsFor(st.source).filter(k => k !== row.dataset.bk));
            if (b.matches('[data-badd]')) {
                const have = new Set(colsFor(st.source)), rest = allCols().filter(c => !have.has(c.k));
                if (!rest.length) return toast('Toutes les colonnes sont déjà là.');
                return UI().menuAt(b, rest.map(c => ({icon: c.type === 'person' ? '👤' : c.type === 'place' ? '📍' : c.k.includes(':') ? '⚙️' : '＋', label: c.label, run: () => setCols([...colsFor(st.source), c.k])})), {title: 'Une colonne tirée des données'});
            }
        });
        dlg.addEventListener('change', e => {
            const t = e.target;
            if (t.matches('[data-bpriv]')) { st.privacy = t.checked; setPref('privacy', t.checked); return load(); }
            if (t.matches('[data-bkeep]')) { st.keep = t.checked; setPref('keep', t.checked); return; }
            if (t.dataset.bf) { st.filters[t.dataset.bf] = t.type === 'checkbox' ? (t.checked ? 1 : 0) : t.value; return load(); }
        });
        dlg.addEventListener('input', e => { if (e.target.dataset?.bf === 'page') { st.filters.page = e.target.value.trim(); load(); } });
        $('form').addEventListener('submit', async e => {
            e.preventDefault(); const d = st.data; if (!d?.rows.length) return;
            dlg.close();
            fillInto(ed, {data: d, src: {source: st.source, filters: st.filters, privacy: st.privacy}, keep: st.keep, where: $('[data-bwhere]').value});
        });
        dlg.addEventListener('close', () => { dlg.remove(); ed.focusGrid?.(); });
        dlg.showModal();
        paintOpts(); paintCols(); load();
    }

    /** écrit les lignes dans le classeur (une transaction : ↶ défait tout) */
    function fillInto(ed, {data, src, keep, where}) {
        const S = X(); let sh = ed.S(), r0 = 0, c0 = 0, t;
        ed.begin('Remplir depuis l’app');
        if (where === 'new') {
            sh = S.newSheet(S.cleanSheetName(data.label || 'Depuis l’app', ed.wb.sheets.map(s => s.name)));
            ed.wb.sheets.splice(ed.si + 1, 0, sh); sh.freeze = {r: 1, c: 0};
        } else {
            ed.meta(sh);
            if (where === 'same' && sh.link) { r0 = sh.link.r0; c0 = sh.link.c0; const L = sh.link; for (let r = r0; r <= r0 + L.n; r++) for (let c = c0; c < c0 + L.cols.length; c++) ed.put(sh, S.addr(r, c), null); }
            else { [r0, c0] = ed.act; }
        }
        const keys = writeBlock(ed.wb, sh, r0, c0, data.columns, data.rows, (k, c) => ed.put(sh, k, c));
        blockDv(sh, r0, c0, data.columns, keys.length);
        if (keep) sh.link = linkOf(src, data, r0, c0, keys); else if (where !== 'new' && sh.link && where === 'same') delete sh.link;
        t = ed.commit();
        if (where === 'new') ed.showSheet(ed.wb.sheets.indexOf(sh));
        ed.select(r0, c0); ed.render();
        if (t) ed.undoable(`${plural(keys.length, 'ligne')} remplie${keys.length > 1 ? 's' : ''} depuis l’app${keep ? ' (tenue' + (keys.length > 1 ? 's' : '') + ' à jour)' : ''}`, t);
    }

    /* ═════════ ↻ Tenir à jour ═════════ */
    /** relit la plage liée ; les cellules à soi à droite (ou à gauche) du bloc suivent leur ligne, celles du dessous se décalent */
    async function refresh(ed, sh = ed.S(), {quiet = false} = {}) {
        const L = sh.link; if (!L?.src) { if (!quiet) toast('Cette feuille n’est pas liée à la base : Données → « ⤒ Remplir depuis l’app… ».'); return null; }
        let d; try { d = await fetchFill(L.src, ['stats', 'mylist'].includes(L.src.source) ? [] : L.cols.map(c => c.k)); } catch (e) { if (!quiet) toast(`Impossible de relire la base : ${e.message}`, 'error', {retry: () => refresh(ed, sh)}); return null; }
        if (!ed.wb.sheets.includes(sh)) return null;
        const S = X(), cols = d.columns, nc = Math.max(cols.length, L.cols.length), oldN = L.n, newN = d.rows.length, keys = d.rows.map(r => r.key);
        // rien n'a changé : la plage reste telle quelle (et le classeur n'est pas « modifié »)
        const sig = [], newSig = [];
        for (let i = 0; i < oldN; i++) for (let j = 0; j < L.cols.length; j++) { const c = sh.cells[S.addr(L.r0 + 1 + i, L.c0 + j)]; sig.push([L.keys[i], c?.v ?? null, c?.ref?.id || 0]); }
        d.rows.forEach((r, i) => cols.forEach(cdef => { const c = cellOf(r.cells[cdef.k], cdef.type); newSig.push([keys[i], c?.v ?? null, c?.ref?.id || 0]); }));
        const sameHead = JSON.stringify(L.cols.map(c => c.k)) === JSON.stringify(cols.map(c => c.k));
        if (sameHead && JSON.stringify(sig) === JSON.stringify(newSig)) { L.at = new Date().toISOString(); paintBar(ed); if (!quiet) toast('🔗 Déjà à jour : rien n’a changé dans la base.'); return {same: true}; }
        const extra = new Map(), next = {}, delta = newN - oldN;
        for (const k in sh.cells) {
            const p = S.parseAddr(k); if (!p) continue; const [r, c] = p, cell = sh.cells[k];
            const inCols = c >= L.c0 && c < L.c0 + nc;
            if (r < L.r0 || (r === L.r0 && !inCols)) { next[k] = cell; continue; }
            if (r === L.r0) continue;
            if (r <= L.r0 + oldN) { if (inCols) continue; const key = L.keys[r - L.r0 - 1]; if (!extra.has(key)) extra.set(key, []); extra.get(key).push({c, cell, r}); continue; }
            const nk = S.addr(r + delta, c); next[nk] = S.isFormula(cell?.v) && delta ? {...cell, v: S.shiftFormula(cell.v, delta, 0)} : cell;
        }
        const hs = S.styleId(ed.wb, HEAD);
        cols.forEach((cdef, j) => { next[S.addr(L.r0, L.c0 + j)] = {v: cdef.label, s: hs}; });
        let added = 0, kept = 0;
        d.rows.forEach((row, i) => {
            const r = L.r0 + 1 + i;
            cols.forEach((cdef, j) => { const c = cellOf(row.cells[cdef.k], cdef.type); if (c) next[S.addr(r, L.c0 + j)] = c; });
            const mine = extra.get(row.key);
            if (mine) { mine.forEach(x => { next[S.addr(r, x.c)] = S.isFormula(x.cell?.v) && r !== x.r ? {...x.cell, v: S.shiftFormula(x.cell.v, r - x.r, 0)} : x.cell; }); extra.delete(row.key); kept++; }
            if (!L.keys.includes(row.key)) added++;
        });
        const gone = L.keys.filter(k => !keys.includes(k)).length, lost = [...extra.values()].length;
        ed.begin('Relire depuis la base'); ed.meta(sh); ed.swap(sh, next);
        sh.link = {...L, cols, n: newN, keys: keys.slice(0, 20000), at: new Date().toISOString(), label: d.label || L.label};
        blockDv(sh, L.r0, L.c0, cols, newN);
        const t = ed.commit(); ed.render();
        const msg = `🔗 « ${sh.name} » relue : ${[added && `${plural(added, 'ligne')} de plus`, gone && `${plural(gone, 'ligne')} de moins`, !added && !gone && 'valeurs mises à jour'].filter(Boolean).join(', ')}${lost ? ` (${plural(lost, 'ligne')} à toi sans fiche : retirée${lost > 1 ? 's' : ''})` : ''}`;
        if (t) ed.undoable(msg, t);
        return {added, gone, kept};
    }

    /** les personnes et lieux choisis dans les cellules : nom d'aujourd'hui ; une fiche supprimée → pastille grise « ? » */
    async function relabel(ed) {
        const ids = {person: new Set(), place: new Set()}, spots = [];
        ed.wb.sheets.forEach(sh => { for (const k in sh.cells) { const c = sh.cells[k]; if (c?.ref && ids[c.ref.kind] && spots.length < 20000) { ids[c.ref.kind].add(c.ref.id); spots.push([sh, k]); } } });
        if (!spots.length) return 0;
        let r; try { r = await api('sheet_refs', {person: [...ids.person].slice(0, 5000).join(','), place: [...ids.place].slice(0, 5000).join(',')}); } catch (_) { return 0; }
        let n = 0; const gone = {person: new Set(r.gone?.person || []), place: new Set(r.gone?.place || [])};
        spots.forEach(([sh, k]) => {
            const c = sh.cells[k]; if (!c?.ref) return;
            if (gone[c.ref.kind]?.has(c.ref.id)) { const x = {...c}; delete x.ref; sh.cells[k] = x; n++; if (!ed.dvAt?.(...X().parseAddr(k), sh)) { sh.dv = [...(sh.dv || []), {range: k, kind: c.ref.kind, allowFree: true}].slice(-60); } return; }
            const name = r[c.ref.kind]?.[c.ref.id]; if (name && name !== c.v) { sh.cells[k] = {...c, v: name}; n++; }
        });
        if (n && ed.dlg?.open) { ed.calc.reset(); ed.render(); }
        return n;
    }

    /* ═════════ Le bandeau 🔗 (et celui du modèle « Relevé de recensement ») ═════════ */
    function paintBar(ed) {
        const dlg = ed.dlg; if (!dlg) return;
        let bar = dlg.querySelector('[data-xl-baselink]');
        const sh = ed.S(), L = sh?.link;
        if (!L || (!L.src && L.tpl !== 'census')) { if (bar) bar.hidden = true; return; }
        if (!bar) { bar = document.createElement('div'); bar.className = 'xl-baselink'; bar.dataset.xlBaselink = ''; bar.setAttribute('role', 'note'); dlg.querySelector('.xl-fbar')?.before(bar); bindBar(ed, bar); }
        bar.hidden = false;
        if (L.tpl === 'census') {
            const b1 = sh.cells.B1, place = b1?.ref?.kind === 'place' ? {id: b1.ref.id, title: String(b1.v ?? '')} : L.place?.id ? L.place : null, sig = `${sh.id}|${L.year}|${place?.id || ''}`; // la commune : celle de la case B1 (menu de choix), sinon celle du bandeau
            if (bar.dataset.mode === 'census' && bar.dataset.sheet === sig) return;
            bar.dataset.mode = 'census'; bar.dataset.sheet = sig;
            const yr = Number(L.year) || 1836;
            bar.innerHTML = `<span class="xl-baselink-t">🏠 <b>Relevé de recensement</b> · les colonnes de l’année :</span><label class="xl-baselink-y">Année <select data-bl-year aria-label="Année du recensement">${CENSUS_YEARS.map(y => `<option ${y === yr ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
                <span class="xl-baselink-pk"><span class="pk-lab">Commune</span>${P()?.pickerField ? P().pickerField({name: '', hiddenName: false, kind: 'place', inline: false, value: place ? {id: Number(place.id), title: place.title || ''} : null}) : ''}</span>
                <span class="spacer"></span><button type="button" class="button small" data-bl="push">📤 Envoyer vers la base…</button>`;
            return;
        }
        bar.dataset.mode = 'link'; bar.dataset.sheet = '';
        const when = UI()?.whenText ? UI().whenText(L.at, {}) : new Date(L.at).toLocaleDateString('fr-FR');
        bar.innerHTML = `<span class="xl-baselink-t">🔗 Tenue à jour : <b>${esc(L.label || 'la base')}</b> · ${esc(plural(L.n, 'ligne'))} · relue ${esc(when)}</span><span class="spacer"></span>
            <button type="button" class="button small secondary" data-bl="sync" title="Relire depuis la base">↻ Relire</button><button type="button" class="icon-button small" data-bl="more" title="Plus d’actions" aria-label="Plus d’actions">⋯</button>`;
    }
    function bindBar(ed, bar) {
        bar.addEventListener('click', e => {
            const b = e.target.closest('[data-bl]'); if (!b) return;
            const sh = ed.S();
            if (b.dataset.bl === 'sync') return refresh(ed, sh);
            if (b.dataset.bl === 'push') return pushDialog(ed);
            if (b.dataset.bl === 'more') return UI().menuAt(b, [{icon: '⤒', label: 'Changer la source ou les colonnes…', run: () => fillDialog(ed, {edit: true})}, {icon: '📤', label: 'Envoyer vers la base…', run: () => pushDialog(ed)}, '-',
                {icon: '×', label: 'Ne plus tenir à jour (garder les valeurs)', run: () => { ed.begin('Ne plus tenir à jour'); ed.meta(sh); delete sh.link; const t = ed.commit(); ed.render(); if (t) ed.undoable(`« ${sh.name} » n’est plus tenue à jour`, t); }}]);
        });
        bar.addEventListener('change', e => { if (e.target.matches('[data-bl-year]')) censusYear(ed, Number(e.target.value)); });
        bar.addEventListener('picker-change', e => {
            const sh = ed.S(); if (sh.link?.tpl !== 'census') return; const it = e.detail?.item;
            ed.begin('Commune'); ed.meta(sh); sh.link = {...sh.link, place: it?.id ? {id: Number(it.id), title: it.title || it.name || ''} : null};
            ed.put(sh, 'B1', it?.id ? {v: it.title || it.name || '', ref: {kind: 'place', id: Number(it.id)}} : null); bar.dataset.sheet = '';
            ed.commit(); ed.render();
        });
    }

    /* ═════════ 🏠 Modèle « Relevé de recensement » : les colonnes de l'année ═════════ */
    const CENSUS_YEARS = [1836, 1841, 1846, 1851, 1856, 1861, 1866, 1872, 1876, 1881, 1886, 1891, 1896, 1901, 1906, 1911, 1921, 1926, 1931, 1936];
    /** les colonnes des listes nominatives (simplifiées) : âge jusqu'en 1901, année et lieu de naissance ensuite */
    function censusCols(year) {
        if (year <= 1846) return ['N° maison', 'N° ménage', 'Nom', 'Prénoms', 'Profession', 'Âge', 'Né(e) vers', 'Situation', 'Observations'];
        if (year <= 1866) return ['N° maison', 'N° ménage', 'Nom', 'Prénoms', 'Profession', 'Âge', 'Né(e) vers', 'Situation', 'Nationalité', 'Observations'];
        if (year <= 1901) return ['Rue', 'N° maison', 'N° ménage', 'Nom', 'Prénoms', 'Âge', 'Né(e) vers', 'Nationalité', 'Profession', 'Lien avec le chef', 'Observations'];
        return ['Rue', 'N° maison', 'N° ménage', 'Nom', 'Prénoms', 'Année de naissance', 'Lieu de naissance', 'Nationalité', 'Lien avec le chef', 'Profession', 'Patron', 'Observations'];
    }
    const POSITIONS = ['chef', 'épouse', 'fils', 'fille', 'père', 'mère', 'beau-père', 'belle-mère', 'gendre', 'belle-fille', 'petit-fils', 'petite-fille', 'frère', 'sœur', 'neveu', 'nièce', 'domestique', 'pensionnaire', 'ouvrier'];
    /** la feuille du relevé (sans les lignes saisies) */
    function censusSheetParts(year) {
        const S = X(), cols = censusCols(year), ci = name => cols.indexOf(name), out = {cols, cells: {}, widths: {}, dv: [], formulas: {}};
        cols.forEach((c, j) => { out.widths[S.colName(j)] = /Nom|Prénoms|Profession|Observations|Rue|Lieu|Patron|Lien/.test(c) ? 140 : 92; });
        const age = ci('Âge'), vers = ci('Né(e) vers');
        if (age >= 0 && vers >= 0) for (let r = 4; r < 404; r++) out.formulas[`${S.colName(vers)}${r}`] = `=SI(${S.colName(age)}${r}="";"";$D$1-${S.colName(age)}${r})`;
        const pos = ci('Lien avec le chef'); if (pos >= 0) out.dv.push({range: `${S.colName(pos)}4:${S.colName(pos)}2000`, kind: 'list', list: POSITIONS});
        const sit = ci('Situation'); if (sit >= 0) out.dv.push({range: `${S.colName(sit)}4:${S.colName(sit)}2000`, kind: 'list', list: ['garçon', 'fille', 'marié', 'mariée', 'veuf', 'veuve']});
        out.dv.push({range: 'B1', kind: 'place', allowFree: true});
        return out;
    }
    function censusBook(year = Number(prefs().censusYear) || 1836) {
        const S = X(), wb = S.newWorkbook(), sh = wb.sheets[0], parts = censusSheetParts(year), hs = S.styleId(wb, HEAD), b = S.styleId(wb, {b: 1}), y = S.styleId(wb, {b: 1, fill: '#fff1a8'});
        sh.name = 'Relevé';
        Object.assign(sh.cells, {A1: {v: 'Commune', s: b}, C1: {v: 'Année', s: b}, D1: {v: year, s: y}});
        parts.cols.forEach((c, j) => { sh.cells[S.addr(2, j)] = {v: c, s: hs}; });
        Object.entries(parts.formulas).forEach(([k, f]) => { sh.cells[k] = {v: f}; });
        Object.assign(sh.cols, Object.fromEntries(Object.entries(parts.widths).map(([k, w]) => [k, {w}])));
        sh.freeze = {r: 3, c: 0}; sh.dv = parts.dv; sh.link = {tpl: 'census', year};
        return S.normalize(wb);
    }
    /** l'année change : les en-têtes et la formule « Né(e) vers » suivent, les colonnes déjà remplies gardent leurs valeurs sous leur nom */
    function censusYear(ed, year) {
        const S = X(), sh = ed.S(), L = sh.link; if (!L || L.tpl !== 'census' || !year) return;
        const oldCols = censusCols(Number(L.year) || 1836), parts = censusSheetParts(year), used = ed.calc.used(ed.si);
        const byName = new Map(); oldCols.forEach((c, j) => byName.set(c, j));
        const next = {}; const hs = S.styleId(ed.wb, HEAD);
        for (const k in sh.cells) { const p = S.parseAddr(k); if (p && p[0] < 2) next[k] = sh.cells[k]; }
        next.D1 = {...(sh.cells.D1 || {}), v: year};
        parts.cols.forEach((c, j) => { next[S.addr(2, j)] = {v: c, s: hs}; });
        for (let r = 3; r <= Math.max(3, used.r); r++) parts.cols.forEach((c, j) => {
            if (c === 'Né(e) vers') return; const from = byName.get(c); if (from === undefined) return; const cell = sh.cells[S.addr(r, from)]; if (cell) next[S.addr(r, j)] = cell;
        });
        Object.entries(parts.formulas).forEach(([k, f]) => { next[k] = {v: f}; });
        ed.begin('Année du relevé'); ed.meta(sh); ed.swap(sh, next);
        sh.cols = Object.fromEntries(Object.entries(parts.widths).map(([k, w]) => [k, {w}])); sh.dv = parts.dv; sh.link = {...L, year};
        const t = ed.commit(); setPref('censusYear', year); ed.dlg.querySelector('[data-xl-baselink]')?.setAttribute('data-sheet', ''); ed.render();
        if (t) ed.undoable(`Relevé : colonnes de ${year}`, t);
    }

    /* ═════════ 📤 Envoyer vers la base ═════════ */
    const FIELDS = [['', '— ne pas envoyer —'], ['name', 'Nom et prénom'], ['last_name', 'Nom'], ['first_name', 'Prénom(s)'], ['gender', 'Sexe'], ['birth', 'Naissance (date ou année)'], ['age', 'Âge'], ['birthplace', 'Lieu de naissance'],
        ['death', 'Décès (date)'], ['deathplace', 'Lieu de décès'], ['occupation', 'Métier'], ['nationality', 'Nationalité'], ['household', 'N° de foyer (ménage)'], ['house', 'N° de maison'], ['street', 'Rue, quartier'], ['position', 'Lien avec le chef'],
        ['employer', 'Patron, employeur'], ['status', 'Situation (marié, veuf…)'], ['notes', 'Observations, notes'], ['event_type', 'Sorte d’événement (acte)'], ['event_date', 'Date de l’événement'], ['event_place', 'Lieu de l’événement']];
    const FLABEL = Object.fromEntries(FIELDS);
    /** le champ d'un titre de colonne */
    function guessField(head, target) {
        const h = fold(head);
        const rules = [[/^(nom et prenoms?|nom prenoms?|prenom nom|personne|fiche|qui)$/, 'name'], [/^(nom|nom de famille|patronyme|noms?)$/, 'last_name'], [/^prenoms?$/, 'first_name'], [/^sexe$/, 'gender'],
            [/^(age|ages)$/, 'age'], [/(lieu de naissance|^ne e a$|^nee? a$|^a$|^origine$)/, 'birthplace'], [/(lieu de deces|^decede e a$)/, 'deathplace'], [/(naissance|^ne e vers$|^ne e le$|^ne le$)/, 'birth'], [/(deces|^mort)/, 'death'],
            [/^(profession|metier|etat|qualite)/, 'occupation'], [/^nationalite/, 'nationality'], [/(menage|foyer)/, 'household'], [/(maison|^n$|^numero$|^no$)/, 'house'], [/^(rue|adresse|quartier|hameau|lieu dit|village)/, 'street'],
            [/(lien|position|place dans le foyer|par rapport au chef)/, 'position'], [/^(patron|employeur)/, 'employer'], [/^(situation|etat civil)/, 'status'], [/^(observations?|notes?|remarques?)/, 'notes'],
            [/^(acte|sorte|evenement|type)$/, 'event_type'], [/^date$/, target === 'events' ? 'event_date' : ''], [/^lieu$/, target === 'events' ? 'event_place' : '']];
        for (const [rx, f] of rules) if (rx.test(h)) return f;
        return '';
    }
    /** le tableau à envoyer : la plage liée, la sélection, ou le bloc autour de la case choisie (avec sa ligne de titres) */
    function findTable(ed) {
        const S = X(), sh = ed.S(), s = ed.sel, u = ed.calc.used(ed.si);
        if (sh.link?.src) return {r0: sh.link.r0, c0: sh.link.c0, r1: sh.link.r0 + sh.link.n, c1: Math.max(sh.link.c0 + sh.link.cols.length - 1, ed.region(sh.link.r0, sh.link.c0).c1)};
        if (s.r1 > s.r0 && (s.c1 > s.c0 || true)) return {r0: s.r0, c0: s.c0, r1: Math.min(s.r1, u.r), c1: Math.min(s.c1, u.c)};
        const text = r => { let n = 0; for (let c = 0; c <= u.c; c++) { const v = ed.calc.val(ed.si, r, c); if (typeof v === 'string' && v.trim() && !/^\d/.test(v)) n++; } return n; };
        let g = ed.region(); if (g.r1 > g.r0 && text(g.r0) >= 2) return g;
        for (let r = 0; r <= Math.min(u.r, 40); r++) if (text(r) >= 3) { let c = 0; while (c <= u.c && (ed.calc.val(ed.si, r, c) ?? '') === '') c++; g = ed.region(r, c); if (g.r1 > r) return {...g, r0: r}; }
        return g;
    }
    /** l'année et la commune écrites au-dessus du tableau (« Année | 1836 », « Commune | Saint-Martin ») */
    function contextAbove(ed, g) {
        const S = X(), sh = ed.S(), out = {};
        if (sh.link?.tpl === 'census') { out.year = Number(sh.link.year) || 0; const b1 = sh.cells.B1; if (b1?.ref?.kind === 'place') out.place = {id: b1.ref.id, title: String(b1.v ?? '')}; else if (sh.link.place?.id) out.place = {id: Number(sh.link.place.id), title: sh.link.place.title || ''}; }
        for (let r = 0; r < Math.min(g.r0, 10); r++) for (let c = 0; c < 12; c++) {
            const v = ed.calc.val(ed.si, r, c), h = typeof v === 'string' ? fold(v) : ''; if (!h) continue;
            const nextCell = () => { const k = S.addr(r, c + 1), cell = sh.cells[k], vv = ed.calc.val(ed.si, r, c + 1); return vv != null && vv !== '' ? {cell, v: vv} : null; }; // la case juste à droite
            if (/^annee$/.test(h) && !out.year) { const n = nextCell(); if (n && Number(n.v) > 1600) out.year = Number(n.v); }
            if (/^(commune|lieu|paroisse|ville)$/.test(h) && !out.place) { const n = nextCell(); if (n) out.place = n.cell?.ref?.kind === 'place' ? {id: n.cell.ref.id, title: String(n.v)} : {title: String(n.v)}; }
        }
        if (!out.year) { const m = String(sh.link?.label || sh.name).match(/(1[6-9]\d\d)/) || String(sh.name).match(/(1[6-9]\d\d)/); if (m) out.year = Number(m[1]); }
        return out;
    }
    async function pushDialog(ed) {
        if (kiosk()) return toast('Mode consultation : rien ne peut être envoyé vers la base.', 'error');
        const S = X(), sh = ed.S(), g = findTable(ed);
        if (!g || g.r1 <= g.r0) return toast('Choisis le tableau à envoyer (sa ligne de titres et ses lignes), puis recommence.');
        const heads = []; for (let c = g.c0; c <= g.c1; c++) heads.push({c, head: S.toStr(ed.calc.val(ed.si, g.r0, c) ?? '').trim()});
        const refCol = c => { for (let r = g.r0 + 1; r <= Math.min(g.r1, g.r0 + 60); r++) { const cell = sh.cells[S.addr(r, c)]; if (cell?.ref) return cell.ref.kind; } return ''; };
        const ctx0 = contextAbove(ed, g);
        let target = sh.link?.tpl === 'census' || (ctx0.year && heads.some(h => ['household', 'position'].includes(guessField(h.head, 'census')))) ? 'census' : heads.some(h => guessField(h.head, 'events') === 'event_type') ? 'events' : 'persons';
        const map = () => heads.map(h => { const rk = refCol(h.c); if (rk === 'person' && !['last_name', 'first_name'].includes(guessField(h.head, target))) return 'name'; if (rk === 'place') { const f = guessField(h.head, target); return ['birthplace', 'deathplace', 'event_place'].includes(f) ? f : target === 'events' ? 'event_place' : 'birthplace'; } return guessField(h.head, target); });
        let fields = map(), analysis = null, decisions = {}, token = '', payload = null;
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-l xl-base-dlg xl-push-dlg';
        const range = `${S.addr(g.r0 + 1, g.c0)}:${S.addr(g.r1, g.c1)}`;
        dlg.innerHTML = `<form method="dialog" novalidate><div class="modal-head"><div><span class="eyebrow">TABLEUR · BASE</span><h2>📤 Envoyer vers la base — ${esc(sh.name)}, lignes ${g.r0 + 2} à ${g.r1 + 1}</h2></div><button type="button" class="icon-button" data-px aria-label="Fermer">×</button></div>
            <ol class="xl-steps" data-psteps><li class="is-active">1. Les colonnes</li><li>2. Voilà ce qui va entrer</li><li>3. Envoyer</li></ol>
            <div class="h-dialog-body xl-base-body" data-pbody></div>
            <div class="modal-actions"><button type="button" class="button secondary" data-pback hidden>← Retour</button><span class="xl-push-sum muted" data-psum></span><span class="spacer"></span><button type="button" class="button secondary" data-px>Annuler</button><button type="submit" class="button" data-pgo>Voir ce qui va entrer</button></div></form>`;
        document.body.appendChild(dlg);
        const $ = s => dlg.querySelector(s), body = $('[data-pbody]'), go = $('[data-pgo]');
        let step = 1;
        const setStep = n => { step = n; dlg.querySelectorAll('[data-psteps] li').forEach((li, i) => { li.classList.toggle('is-active', i === n - 1); li.classList.toggle('is-done', i < n - 1); li.textContent = (i < n - 1 ? '✓ ' : '') + ['1. Les colonnes', '2. Voilà ce qui va entrer', '3. Envoyer'][i]; }); $('[data-pback]').hidden = n !== 2; };
        const sample = c => { for (let r = g.r0 + 1; r <= Math.min(g.r1, g.r0 + 20); r++) { const v = ed.calc.val(ed.si, r, c); if (v != null && v !== '') return S.formatValue(v, ed.wb.styles[sh.cells[S.addr(r, c)]?.s] || {}); } return ''; };
        function step1() {
            setStep(1); go.textContent = 'Voir ce qui va entrer'; go.disabled = false; $('[data-psum]').textContent = `${plural(g.r1 - g.r0, 'ligne')} (${range})`;
            body.innerHTML = `<div class="xl-push-target"><span>Ce que ça crée :</span><div class="segmented" role="tablist">${[['persons', '👤 Des fiches'], ['census', '🏠 Un recensement (foyers)'], ['events', '📅 Des événements']].map(([k, l]) => `<button type="button" data-pt="${k}" class="${k === target ? 'is-active' : ''}" aria-pressed="${k === target}">${l}</button>`).join('')}</div></div>
                <div class="xl-push-ctx" data-pctx ${target === 'census' ? '' : 'hidden'}><label>Année du recensement <input type="number" name="year" min="1700" max="2100" value="${esc(ctx0.year || '')}" placeholder="1836"></label>
                    <span><span class="pk-lab">Commune</span>${P()?.pickerField ? P().pickerField({name: '', hiddenName: false, kind: 'place', value: ctx0.place?.id ? (ctx0.place.title ? {id: ctx0.place.id, title: ctx0.place.title} : ctx0.place.id) : ctx0.place?.title ? 'txt:' + ctx0.place.title : null, allowFree: true, inline: true}) : ''}</span></div>
                <table class="xl-prep-map xl-push-map"><thead><tr><th>Colonne</th><th>Exemple</th><th>Va dans</th></tr></thead><tbody>${heads.map((h, i) => `<tr><td><b>${esc(S.colName(h.c))}</b> · ${esc(h.head || '(sans titre)')}</td><td><small>${esc(sample(h.c))}</small></td><td><select data-pf="${i}" aria-label="Champ pour la colonne ${esc(S.colName(h.c))}">${FIELDS.map(([k, l]) => `<option value="${k}" ${fields[i] === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>
                <p class="muted xl-push-line" data-pline></p>`;
            paintLine();
        }
        const paintLine = () => { const l = $('[data-pline]'); if (l) l.textContent = 'Colonnes : ' + (heads.map((h, i) => (fields[i] ? `${S.colName(h.c)} → ${FLABEL[fields[i]]}` : '')).filter(Boolean).join(' · ') || 'aucune pour l’instant'); };
        const ctxNow = () => {
            const y = Number(dlg.querySelector('[name=year]')?.value || ctx0.year || 0), pk = dlg.querySelector('[data-pctx] .pk'), v = pk && P()?.pickerValue ? P().pickerValue(pk) : null;
            return {year: target === 'census' ? y : 0, place_id: typeof v === 'number' || /^\d+$/.test(String(v ?? '')) ? Number(v) : 0, place_name: typeof v === 'string' && v.startsWith('txt:') ? v.slice(4) : '', digest_id: sh.link?.src?.source === 'digest' ? Number(sh.link.src.filters?.digest_id) || 0 : 0};
        };
        /** les lignes, colonne par colonne → champs (une personne choisie dans la cellule garde sa fiche) */
        function rowsNow() {
            const out = [];
            for (let r = g.r0 + 1; r <= g.r1; r++) {
                if (ed.hiddenRows?.get(sh.id)?.has(r)) continue;
                const f = {}; let any = false;
                heads.forEach((h, i) => {
                    const k = fields[i]; if (!k) return; const cell = sh.cells[S.addr(r, h.c)], v = ed.calc.val(ed.si, r, h.c);
                    if (v == null || v === '' || S.isErr(v)) return; any = true;
                    let t = S.formatValue(v, ed.wb.styles[cell?.s] || {}); if (typeof v === 'number' && Number.isInteger(v)) t = String(v);
                    if (k === 'birth' && typeof v === 'number' && /vers/.test(fold(h.head))) t = 'vers ' + v;
                    if (cell?.ref?.kind === 'person' && (k === 'name' || k === 'last_name')) f.person_id = cell.ref.id;
                    if (cell?.ref?.kind === 'place' && ['birthplace', 'deathplace', 'event_place'].includes(k)) f[k + '_id'] = cell.ref.id;
                    f[k] = f[k] ? f[k] + ' ' + t : t;
                });
                if (!any) continue;
                const key = sh.link?.src && r > sh.link.r0 && r <= sh.link.r0 + sh.link.n ? sh.link.keys[r - sh.link.r0 - 1] : '';
                out.push({row: r + 1, key: key || '', f});
            }
            return out;
        }
        const BADGE = {linked: ['Déjà dans la base', 'green'], new: ['Nouvelle fiche', 'blue'], check: ['À vérifier', 'yellow'], problem: ['Problème', 'red'], skip: ['Laissée de côté', 'grey']};
        function counts() {
            const c = {new: 0, linked: 0, check: 0, problem: 0, skip: 0};
            analysis.rows.forEach(a => { const d = decisions[a.i]; const s = d ? (d.action === 'skip' ? 'skip' : d.action === 'new' ? 'new' : 'linked') : a.status; c[s]++; });
            return c;
        }
        function paintSum() {
            const c = counts(), left = c.check + c.problem + c.skip;
            $('[data-psum]').textContent = [c.new && plural(c.new, 'nouvelle fiche', 'nouvelles fiches'), c.linked && plural(c.linked, 'reliée', 'reliées'), target === 'census' && analysis.households && plural(analysis.households, 'foyer'), left && plural(left, 'laissée', 'laissées')].filter(Boolean).join(' · ');
            go.disabled = !c.new && !c.linked;
            go.textContent = target === 'persons' ? (c.new ? `📤 Créer ${plural(c.new, 'fiche')}` : '📤 Rien de nouveau') : `📤 ${c.new ? `Créer ${plural(c.new, 'fiche')}${c.linked ? ' et ' : ''}` : ''}${c.linked ? `${c.new ? 'en relier' : 'Relier'} ${c.linked}` : ''}`.trim();
            if (go.textContent === '📤') go.textContent = '📤 Envoyer';
        }
        async function step2() {
            const ctx = ctxNow();
            if (!fields.some(Boolean)) return UI()?.fail ? UI().fail(dlg.querySelector('[data-pf]'), 'Choisis au moins une colonne à envoyer (le nom, par exemple).') : toast('Choisis au moins une colonne.');
            if (target === 'census' && !(ctx.year >= 1700 && ctx.year <= 2100)) return UI()?.fail ? UI().fail(dlg.querySelector('[name=year]'), 'Donne l’année du recensement (par exemple 1836).') : toast('Donne l’année du recensement.');
            if (!fields.some(f => ['name', 'last_name', 'first_name'].includes(f))) return UI()?.fail ? UI().fail(dlg.querySelector('[data-pf]'), 'Il faut une colonne pour le nom (ou « Nom et prénom »).') : toast('Il faut une colonne pour le nom.');
            if (target === 'events' && !fields.includes('event_type')) return UI()?.fail ? UI().fail(dlg.querySelectorAll('[data-pf]')[fields.indexOf('') >= 0 ? fields.indexOf('') : 0], 'Choisis la colonne qui dit la sorte d’événement (Baptême, Décès…).') : toast('Il manque la sorte d’événement.');
            const rows = rowsNow(); if (!rows.length) return toast('Ces lignes sont vides.');
            payload = {target, rows, context: ctx, name: `${sh.name}${ed.name && ed.name !== sh.name ? ' (' + ed.name + ')' : ''}`, workbook_id: ed.id || 0};
            setStep(2); go.disabled = true; body.innerHTML = UI()?.spinner ? UI().spinner('Je compare avec ta base…') : 'Comparaison…';
            try { analysis = (await post('sheet_push', {...payload, dry: 1})).result; } catch (e) { body.innerHTML = notice('error', e.message); return; }
            decisions = {};
            const opt = (a) => a.status !== 'check' ? '' : `<select data-pd="${a.i}" aria-label="Choisir la fiche de la ligne ${a.row}"><option value="">choisis ▾</option>${a.candidates.map(c => `<option value="link:${c.id}">Relier à ${esc(c.title)} (${esc(c.meta)})</option>`).join('')}<option value="new">＋ Nouvelle fiche</option><option value="skip">Laisser de côté</option></select>`;
            body.innerHTML = `${analysis.rows.some(a => a.status === 'check') ? notice('warn', 'Des lignes ressemblent à plusieurs fiches : choisis la bonne (sinon elles sont laissées de côté).') : ''}
                <div class="xl-push-tablewrap"><table class="xl-prep-map xl-push-res"><thead><tr><th>Ligne</th><th>Ce qui va se passer</th><th></th></tr></thead><tbody>${analysis.rows.map(a => `<tr data-pr="${a.i}" data-ps="${a.status}"><td><b>${a.row}</b> <small>${esc(a.line)}</small></td><td>${esc(a.text)}${a.person && a.status === 'linked' ? ` <small class="muted">${esc(a.person.meta)}</small>` : ''} ${opt(a)}</td><td data-pb>${badge(...BADGE[a.status])}</td></tr>`).join('')}</tbody></table></div>`;
            paintSum();
        }
        async function step3() {
            setStep(3); const label = go.textContent; go.disabled = true; go.innerHTML = `<span class="ui-spin" aria-hidden="true"></span>${esc(label)}`;
            const send = async () => (await post('sheet_push', {...payload, decisions})).result;
            let r; try { r = await send(); } catch (e) { setStep(2); go.disabled = false; go.textContent = label; body.insertAdjacentHTML('afterbegin', notice('error', `Impossible d’envoyer : ${e.message}`)); return; }
            token = r.token; dlg.close();
            const again = () => { if (sh.link?.src && ed.dlg?.open) refresh(ed, sh, {quiet: true}); };
            again();
            A().undoToast(r.message, {icon: '📤', undo: async () => { await post('sheet_push_undo', {token}); again(); }, redo: async () => { const x = await send(); token = x.token; again(); }});
            ext.sheetBase.lastPush = {token, result: r};
        }
        dlg.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.matches('[data-px]')) return dlg.close();
            if (b.matches('[data-pback]')) return step1();
            if (b.dataset.pt) { const c = ctxNow(); if (c.year) ctx0.year = c.year; if (c.place_id || c.place_name) ctx0.place = c.place_id ? (ctx0.place?.id === c.place_id ? ctx0.place : {id: c.place_id}) : {title: c.place_name}; target = b.dataset.pt; fields = map(); return step1(); }
        });
        dlg.addEventListener('change', e => {
            const t = e.target;
            if (t.dataset.pf != null) { fields[Number(t.dataset.pf)] = t.value; paintLine(); }
            if (t.dataset.pd != null) {
                const i = Number(t.dataset.pd), v = t.value; if (!v) delete decisions[i]; else if (v.startsWith('link:')) decisions[i] = {action: 'link', person_id: Number(v.slice(5))}; else decisions[i] = {action: v};
                const s = decisions[i] ? (decisions[i].action === 'link' ? 'linked' : decisions[i].action) : 'check'; const cell = dlg.querySelector(`[data-pr="${i}"] [data-pb]`); if (cell) cell.innerHTML = badge(...BADGE[s]);
                paintSum();
            }
        });
        $('form').addEventListener('submit', e => { e.preventDefault(); if (go.disabled) return; if (step === 1) step2(); else if (step === 2) step3(); });
        dlg.addEventListener('close', () => { dlg.remove(); ed.focusGrid?.(); });
        dlg.showModal(); step1();
    }

    /* ═════════ Branchement sur l'éditeur ═════════ */
    function onOpen(ed) {
        if (ed.ctx?.back) return; // « 🧾 Modifier les données » d'un autre outil : pas de lien avec la base ici
        paintBar(ed);
        relabel(ed).then(() => Promise.all(ed.wb.sheets.filter(s => s.link?.src).map(s => refresh(ed, s, {quiet: true})))).then(() => paintBar(ed)).catch(() => {});
    }
    function hook() {
        const I = ext.tableurInternals; if (!I?.Editor) return false;
        const PR = I.Editor.prototype; if (PR._baseHooked) return true; PR._baseHooked = true;
        const render0 = PR.render; PR.render = function (...a) { const out = render0.apply(this, a); try { paintBar(this); } catch (e) { console.error(e); } return out; };
        const open0 = PR.open; PR.open = function (...a) { const out = open0.apply(this, a); setTimeout(() => onOpen(this), 0); return out; };
        // le modèle « Relevé de recensement » : les colonnes de l'année choisie (dernière année retenue)
        const tpl = (I.TEMPLATES || ext.sheetTemplates || []).find(t => t.key === 'census');
        if (tpl) { tpl.make = () => censusBook(); tpl.hint = 'colonnes de l’année (1836 → 1936) · foyers · 📤 vers la base'; }
        return true;
    }
    hook(); document.addEventListener('DOMContentLoaded', hook);
    ext.sheetMenuExtra = ext.sheetMenuExtra || [];
    ext.sheetMenuExtra.push({menu: 'Données', cmd: 'appfill', label: '⤒ Remplir depuis l’app…'}, {menu: 'Données', cmd: 'appsync', label: '↻ Relire depuis la base'}, {menu: 'Données', cmd: 'apppush', label: '📤 Envoyer vers la base…'});
    ext.sheetCommands = ext.sheetCommands || {};
    const run = (ed, cmd) => { hook(); if (cmd === 'appfill') return fillDialog(ed, {edit: !!ed.S().link?.src}); if (cmd === 'appsync') return refresh(ed); if (cmd === 'apppush') return pushDialog(ed); };
    ext.sheetCommands.appfill = ed => run(ed, 'appfill');
    ext.sheetCommands.appsync = ed => run(ed, 'appsync');
    ext.sheetCommands.apppush = ed => run(ed, 'apppush');
    ext.sheetBase = {run, fillDialog, pushDialog, refresh, relabel, openFilled, censusBook, censusCols, guessField, fillInto, CENSUS_YEARS, lastPush: null};
})();
