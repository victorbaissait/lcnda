/* LCNDA — ＋ Créer ma liste : une liste à soi, faite avec des données qu'on importe simplement (Listes → 🧰 Données).
 *
 *  1. Importer : déposer ou choisir un fichier (CSV, TSV, XLSX, ODS, JSON ; 50 Mo et 500 000 lignes au plus), coller un tableau
 *     (copié d'un tableur ou d'une page web), ou l'adresse https:// d'un fichier CSV / JSON (lue par le serveur : cx_write fetch_url,
 *     adresse publique seulement, 10 Mo au plus).
 *  2. Vérifier : les colonnes sont comprises toutes seules (texte, catégorie, nombre, date « 12 mars 1813 », année, lieu / commune
 *     reconnue dans la base avec son code Insee, latitude, longitude, lien, personne) ; un menu par colonne pour corriger, son titre,
 *     « — ne pas prendre — » ; « La première ligne contient les titres » ; séparateur et encodage devinés.
 *  3. Créer : nom, icône, « D'où viennent ces données ? » (source, licence, lien ↗). Rangée dans « Mes listes ».
 * Ensuite c'est une liste comme les autres (moteur app-listes-donnees.js) : recherche, critères, 📅 Période (dates), 📍 Autour de… /
 * 🗺 Carte / 📍 GPS (communes ou coordonnées), ⤓ Exporter (cases protégées contre les formules), 🧺 Prendre… / Mettre dans…,
 * 📎 Insérer une info, 👤 noms reliés aux fiches (colonne « personne »).
 * Gérer (barre de la liste) : ✎ Modifier (nom, icône, source, colonnes), ＋ Ajouter une ligne, ⤒ Remplacer par un fichier, ⊕ Ajouter
 * un fichier (fusion), ⇪ Partager (fichier, après confirmation), 🗑 Supprimer — chaque fois ↶ Annuler.
 * Gardée dans la base (lib/listes_perso.php : tables ulist_lists, ulist_rows) ; en consultation, lecture seule.
 * API : LCNDA_EXT.listesPerso = {create({rows | file | text | url, name, source, licence, source_url}), open(id), lists(), reload(id), listBar}
 * Calcul : app-listes-perso-core.js. Essai : tests/test-listes-perso.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const C = () => window.LCNDA_LISTES_PERSO_CORE;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const toast = (m, k) => A().toast?.(m, k);
    const undoToast = (m, undo, icon = '') => (A().undoToast ? A().undoToast(m, {undo, icon}) : toast(m));
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const api = (a, q = {}) => A().api(a, q);
    const post = b => A().api('ulist_write', {}, {method: 'POST', body: b});
    const ws = () => document.getElementById('workspace');
    const KEY = 'perso_new', GROUP = 'Mes listes', PREFIX = 'perso_';
    const ensureCss = () => { if (document.querySelector('link[href*="listes-perso.css"]')) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'assets/css/listes-perso.css?v=1'; document.head.appendChild(l); };
    const TYPE_LABELS = () => [['text', T('Texte')], ['enum', T('Catégorie (choix)')], ['number', T('Nombre')], ['date', T('Date')], ['year', T('Année')], ['place', T('Lieu / commune')],
        ['lat', T('Latitude')], ['lon', T('Longitude')], ['url', T('Lien internet')], ['person', T('Personne (nom)')]];
    const LICENCES = ['Licence Ouverte / Etalab', 'CC0', 'CC BY 4.0', 'CC BY-SA 4.0', 'ODbL', 'Domaine public', 'Usage personnel'];
    const fmtSize = b => (b >= 1048576 ? `${(b / 1048576).toLocaleString('fr-FR', {maximumFractionDigits: 1})} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);

    /* ═════════════ les listes enregistrées : une par liste de la base ═════════════ */
    const STORE = new Map(); // id → {meta, rows (le même tableau rendu au moteur), places, loading}
    const regOf = id => (ext.dataLists || []).find(d => d && d.id === PREFIX + id);
    function describe(meta) {
        const cols = meta.columns || [], core = C();
        const has = t => cols.some(c => c.type === t && !c.hidden);
        const urlCol = cols.find(c => c.type === 'url');
        const d = regOf(meta.id) || {id: PREFIX + meta.id};
        Object.assign(d, {icon: meta.icon || '📋', label: meta.name, group: GROUP, perso: meta.id,
            source: [meta.source, meta.licence].filter(Boolean).join(' · ') || T('Mes données'), sourceUrl: meta.source_url || '',
            fields: core.fieldsOf(cols), load: () => loadRows(meta.id)});
        d.period = has('date') || has('year') ? r => (r._y1 != null ? [r._y1, r._y2] : null) : undefined;
        d.geo = (has('lat') && has('lon')) || has('place') ? r => (r._lat != null ? [r._lat, r._lon] : null) : undefined;
        d.open = urlCol ? r => { const u = String(r[urlCol.key] || ''); if (/^https?:\/\//i.test(u)) window.open(u, '_blank', 'noopener'); } : undefined;
        const pm = core.personMatchOf(cols); if (pm) d.personMatch = {...pm, role: () => meta.name}; else delete d.personMatch;
        return d;
    }
    function register(meta) {
        const st = STORE.get(meta.id) || {rows: [], places: {}, loaded: false}; st.meta = meta; STORE.set(meta.id, st);
        const before = regOf(meta.id), was = before ? `${before.icon}|${before.label}` : null;
        const d = describe(meta);
        // le moteur relit l'annuaire (et repeint le menu, ce qui est long) seulement pour une liste nouvelle, renommée ou d'une autre icône
        if (!before) (ext.dataLists = ext.dataLists || []).push(d); else if (was !== `${d.icon}|${d.label}`) ext.dataLists = ext.dataLists;
        return d;
    }
    function unregister(id) { const arr = ext.dataLists || []; const i = arr.findIndex(d => d && d.id === PREFIX + id); if (i >= 0) arr.splice(i, 1); ext.dataLists = arr; }
    async function loadRows(id, force = false) {
        const st = STORE.get(id); if (!st) return [];
        if (st.loaded && !force) return st.rows;
        if (st.loading && !force) return st.loading;
        st.loading = (async () => {
            const raw = []; let places = {}, total = Infinity;
            for (let off = 0; off < total && off < 600000; off += 20000) {
                const r = await api('ulist_rows', {id, offset: off, limit: 20000});
                if (off === 0) { places = r.places || {}; total = Number(r.total) || 0; }
                raw.push(...(r.rows || [])); if (!(r.rows || []).length) break;
            }
            const rd = C().dateReader(), cols = st.meta.columns || [];
            st.rows.length = 0; // le même tableau : le moteur des Listes le garde en mémoire
            for (let i = 0; i < raw.length; i += 10000) st.rows.push(...raw.slice(i, i + 10000).map(x => C().buildRow(x, cols, places, rd)));
            st.places = places; st.loaded = true; st.loading = null;
            return st.rows;
        })().catch(e => { st.loading = null; throw e; });
        return st.loading;
    }
    async function boot() {
        let r; try { r = await api('ulist_index'); } catch (_) { return; }
        const ids = new Set();
        for (const m of r.lists || []) { ids.add(m.id); register(m); }
        for (const id of [...STORE.keys()]) if (!ids.has(id)) { STORE.delete(id); unregister(id); }
    }
    /** après une modification : relire la liste et repeindre si elle est à l'écran */
    async function reload(id, meta = null) {
        if (!meta) { const r = await api('ulist_index'); meta = (r.lists || []).find(m => m.id === id); }
        if (!meta) { STORE.delete(id); unregister(id); return null; }
        const d = register(meta); await loadRows(id, true);
        const st = A().state, k = ext.dataListsEngine?.keyOf?.(d);
        if (st?.module === 'listes' && st.listType === k) { try { await ext.lists?.[k]?.(++st.workspaceToken); } catch (e) { console.error(e); } }
        return d;
    }
    const openList = id => { const d = regOf(id); if (d && ext.dataListsEngine?.open) ext.dataListsEngine.open(d.id); };

    /* ═════════════ lire ce qu'on importe ═════════════ */
    const isZip = u8 => u8[0] === 0x50 && u8[1] === 0x4b;
    async function readInput(input) {
        const core = C(), L = core.LIMITS;
        if (input.rows) return {rows: input.rows, header: input.header ?? null, info: {kind: T('tableau')}};
        if (input.text != null) {
            const h = input.html ? core.fromHtml(input.html) : null;
            if (h && h.rows.length) return {rows: h.rows, header: h.header, info: {kind: T('page web')}};
            const r = core.fromText(input.text);
            return {rows: r.rows, header: r.header ?? null, shared: r.shared, info: {kind: r.sep === '\t' ? T('tableur (collé)') : 'CSV', sep: r.sep, more: r.more}};
        }
        let name = 'donnees', buf = null, url = '';
        if (input.file) {
            if (input.file.size > L.bytes) throw new Error(T('Ce fichier est trop gros : {max} au plus (il fait {n}).', {max: fmtSize(L.bytes), n: fmtSize(input.file.size)}));
            name = input.file.name || name; buf = await input.file.arrayBuffer();
        } else if (input.url) {
            url = String(input.url).trim();
            if (!/^https:\/\//i.test(url)) throw new Error(T('Donne une adresse qui commence par https://'));
            const r = await A().api('cx_write', {}, {method: 'POST', body: {op: 'fetch_url', url}});
            const x = r?.result || r; buf = Uint8Array.from(atob(x.base64 || ''), c => c.charCodeAt(0)).buffer; name = x.name || name; url = x.url || url;
        } else if (input.buffer) { buf = input.buffer; name = input.name || name; }
        if (!buf) throw new Error(T('Rien à lire.'));
        const u8 = new Uint8Array(buf);
        if (u8.length > L.bytes) throw new Error(T('Ce fichier est trop gros : {max} au plus (il fait {n}).', {max: fmtSize(L.bytes), n: fmtSize(u8.length)}));
        const low = name.toLowerCase();
        if (isZip(u8)) {
            const SH = window.LCNDA_SHEET; if (!SH?.readFile) throw new Error(T('Les classeurs (.xlsx, .ods) ne peuvent pas être lus ici : enregistre-le en .csv.'));
            const r = await SH.readFile(name, buf);
            const i = Math.max(0, r.wb.sheets.findIndex(s => Object.keys(s.cells || {}).length));
            const rows = SH.matrix(r.wb, null, i, null, {display: true}).map(row => row.map(v => (v == null ? '' : String(v))));
            return {rows, header: null, info: {kind: r.kind === 'ods' ? 'LibreOffice (.ods)' : 'Excel (.xlsx)', name, url, sheet: r.wb.sheets[i]?.name || ''}};
        }
        if (/\.(xls|doc|docx|pdf)$/.test(low)) throw new Error(T('Ce n’est pas un tableau lisible : enregistre-le en .csv, .xlsx ou .ods.'));
        const d = core.decodeBytes(u8);
        const head = d.text.slice(0, 400).trim();
        if (/^</.test(head)) { const h = /<table/i.test(d.text) ? core.fromHtml(d.text) : null; if (h && h.rows.length) return {rows: h.rows, header: h.header, info: {kind: T('page web'), name, url}}; throw new Error(T('C’est une page web, pas un fichier de données.')); }
        if (/\.json$/.test(low) || /^[\[{]/.test(head)) { try { const j = core.fromJson(d.text); return {rows: j.rows, header: j.header, shared: j.shared, info: {kind: 'JSON', name, url, encoding: d.encoding}}; } catch (_) { if (/\.json$/.test(low)) throw new Error(T('Ce JSON n’est pas un tableau lisible.')); } }
        const sep = /\.tsv$/.test(low) ? '\t' : core.sniffSep(d.text);
        const rows = core.parseDelimited(d.text, {sep});
        return {rows, header: null, info: {kind: sep === '\t' ? 'TSV' : 'CSV', name, url, sep, encoding: d.encoding, more: rows.more}};
    }
    /** {rows, header} → l'aperçu : titres, lignes, colonnes devinées (les communes demandées à la base) */
    async function understand(got, header = got.header) {
        const core = C(), L = core.LIMITS;
        if ((got.rows?.length || 0) > L.rows + 1 || got.info?.more) throw new Error(T('Trop de lignes : {n} au plus dans une liste.', {n: nf(L.rows)}));
        const sh = core.shape(got.rows, header, {});
        if (!sh.head.length || !sh.body.length) throw new Error(T('Pas de tableau lisible (il faut au moins une ligne).'));
        if (sh.body.length > L.rows) throw new Error(T('Trop de lignes : {n} au plus dans une liste.', {n: nf(L.rows)}));
        const placeHits = {};
        const asks = sh.head.map((_, j) => core.placeCandidates(sh.body.slice(0, 300).map(r => r[j]), 30));
        const all = [...new Set(asks.flat())];
        if (all.length && !kiosk()) {
            try {
                const r = await post({op: 'places', values: all.slice(0, 2000)}); const P = r.places || {};
                asks.forEach((vals, j) => { if (vals.length >= 2 || (vals.length && sh.body.length < 4)) placeHits[j] = vals.filter(v => P[v]).length / vals.length; });
            } catch (_) {}
        }
        let cols = core.guessColumns(sh.head, sh.body, {placeHits});
        if (got.shared?.types) cols = cols.map((c, j) => ({...c, type: got.shared.types[j] || c.type}));
        return {...sh, cols, info: got.info || {}, shared: got.shared || null, raw: got.rows, placeHits};
    }

    /* ═════════════ « ＋ Créer ma liste » : Importer → Vérifier → Créer ═════════════ */
    let W = null; // l'assistant en cours : {step, got, view (understand), meta}
    let pending = null; // ext.listesPerso.create(…) avant que la page soit là
    const STEPS = () => [T('Importer'), T('Vérifier'), T('Créer')];
    function renderNew(token) {
        const host = ws(); if (!host) return; ensureCss();
        if (!W || W.done || (W.step > 1 && !W.view)) W = {step: 1, got: null, view: null, meta: {name: '', icon: '📋', source: '', licence: '', source_url: ''}};
        const head = UI().pageHeader ? UI().pageHeader({where: `${T('Listes')} · 🧰 ${T('Données')} · ${T(GROUP)}`, icon: '＋', title: T('Créer ma liste'),
            help: esc(T('Tes propres données, en trois étapes : on importe, on vérifie, on crée. Elles restent sur cet ordinateur, dans ta base.'))}) : `<h2>${esc(T('Créer ma liste'))}</h2>`;
        host.innerHTML = `<section class="page collection-page lpx-page" data-lpx-page>${head}
            <ol class="lpx-steps" aria-label="${esc(T('Étapes'))}">${STEPS().map((s, i) => `<li class="${W.step === i + 1 ? 'is-on' : W.step > i + 1 ? 'is-done' : ''}"${W.step === i + 1 ? ' aria-current="step"' : ''}><span>${i + 1}</span>${esc(s)}</li>`).join('')}</ol>
            <div class="lpx-body" data-lpx-body></div></section>`;
        if (kiosk()) { host.querySelector('[data-lpx-body]').innerHTML = `<p class="lpx-note">${esc(T('Mode consultation : on ne peut pas créer de liste.'))}</p>`; return; }
        paintStep();
        if (pending) { const p = pending; pending = null; ingest(p); }
        void token;
    }
    const body = () => ws()?.querySelector('[data-lpx-body]');
    function setStep(n) { W.step = n; const ol = ws()?.querySelector('.lpx-steps'); if (ol) [...ol.children].forEach((li, i) => { li.className = n === i + 1 ? 'is-on' : n > i + 1 ? 'is-done' : ''; if (n === i + 1) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); }); paintStep(); }
    function paintStep() { const b = body(); if (!b) return; if (W.step === 1) paintImport(b); else if (W.step === 2) paintCheck(b); else paintCreate(b); }

    function importHtml(compact = false) {
        return `<div class="lpx-import">
            <label class="lpx-drop" data-lpx-drop tabindex="0">
                <span class="lpx-drop-ico" aria-hidden="true">📄</span>
                <b>${esc(T('Dépose un fichier ici'))}</b>
                <span class="button small secondary">${esc(T('ou choisis-le…'))}</span>
                <input type="file" data-lpx-file accept=".csv,.tsv,.txt,.json,.xlsx,.ods,text/csv,application/json" hidden>
                <small class="muted">${esc(T('CSV, TSV, Excel (.xlsx), LibreOffice (.ods), JSON — jusqu’à 50 Mo et 500 000 lignes'))}</small>
            </label>
            ${compact ? '' : `<p class="lpx-or"><span>${esc(T('ou'))}</span></p>
            <label class="lpx-field"><span>${esc(T('Colle un tableau'))} <small class="muted">${esc(T('(copié d’un tableur ou d’une page web)'))}</small></span>
                <textarea data-lpx-paste rows="4" placeholder="${esc(T('Colle ici (Ctrl+V)…'))}" data-no-insert></textarea></label>
            <div class="lpx-row"><button type="button" class="button small secondary" data-lpx-paste-go>${esc(T('Lire ce tableau'))}</button></div>
            <p class="lpx-or"><span>${esc(T('ou'))}</span></p>
            <label class="lpx-field"><span>${esc(T('L’adresse d’un fichier en ligne'))} <small class="muted">${esc(T('(.csv ou .json, public)'))}</small></span>
                <span class="lpx-url"><input type="url" inputmode="url" data-lpx-url placeholder="https://…" autocomplete="off"><button type="button" class="button small secondary" data-lpx-url-go>⤓ ${esc(T('Lire'))}</button></span></label>`}
            <p class="lpx-msg" data-lpx-msg aria-live="polite"></p></div>`;
    }
    /** relie la zone d'import ; onGot({…}) reçoit ce qui est lu */
    function bindImport(root, onGot) {
        const msg = t => { const m = root.querySelector('[data-lpx-msg]'); if (m) { m.textContent = t || ''; m.classList.toggle('is-error', !!t && !/…$/.test(t)); } };
        const run = async input => { msg(T('Lecture…')); try { await onGot(input); } catch (e) { msg(e.message || String(e)); } };
        const drop = root.querySelector('[data-lpx-drop]'), file = root.querySelector('[data-lpx-file]');
        file?.addEventListener('change', () => { const f = file.files?.[0]; if (f) run({file: f}); file.value = ''; });
        drop?.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file?.click(); } });
        drop?.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-over'); });
        drop?.addEventListener('dragleave', () => drop.classList.remove('is-over'));
        drop?.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('is-over'); const f = e.dataTransfer?.files?.[0]; if (f) run({file: f}); });
        const ta = root.querySelector('[data-lpx-paste]');
        ta?.addEventListener('paste', e => {
            const html = e.clipboardData?.getData('text/html') || '', text = e.clipboardData?.getData('text/plain') || '';
            if (html && /<table/i.test(html)) { e.preventDefault(); ta.value = text; run({text, html}); }
            else if (text && /\t|\n.*[;,]/.test(text)) setTimeout(() => run({text: ta.value}), 0);
        });
        root.querySelector('[data-lpx-paste-go]')?.addEventListener('click', () => { if (ta?.value.trim()) run({text: ta.value}); else msg(T('Colle d’abord un tableau.')); });
        const url = root.querySelector('[data-lpx-url]');
        const goUrl = () => { const u = url?.value.trim(); if (!u) return msg(T('Écris l’adresse du fichier.')); run({url: u}); };
        root.querySelector('[data-lpx-url-go]')?.addEventListener('click', goUrl);
        url?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); goUrl(); } });
        return msg;
    }
    function paintImport(b) { b.innerHTML = importHtml(); bindImport(b, ingest); }
    async function ingest(input) {
        if (!W) W = {step: 1, meta: {name: '', icon: '📋', source: '', licence: '', source_url: ''}};
        const got = await readInput(input);
        W.got = got; W.view = await understand(got);
        const m = W.meta;
        for (const k of ['name', 'icon', 'source', 'licence', 'source_url']) if (input[k]) m[k] = String(input[k]);
        if (W.view.shared) Object.assign(m, Object.fromEntries(Object.entries(W.view.shared).filter(([k, v]) => k !== 'types' && v)));
        if (!m.name && got.info?.name) m.name = got.info.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 80);
        if (!m.source_url && got.info?.url) m.source_url = got.info.url;
        if (body()) setStep(2);
    }

    function paintCheck(b) {
        const v = W.view, core = C(), types = TYPE_LABELS(), i = v.info || {};
        const sepName = {'\t': T('tabulation'), ';': '« ; »', ',': '« , »', '|': '« | »'}[i.sep] || '';
        const bits = [i.name, i.kind, sepName && T('séparateur {s}', {s: sepName}), i.encoding && i.encoding.toUpperCase().replace('WINDOWS-1252', 'Windows (vieil Excel)'), i.sheet && T('feuille « {s} »', {s: i.sheet})].filter(Boolean);
        const sample = j => v.body.slice(0, 3).map(r => r[j]).filter(Boolean).join(' · ');
        const prev = v.body.slice(0, 5), shownCols = v.cols.filter(c => c.type !== 'skip');
        b.innerHTML = `<div class="lpx-check">
            <p class="lpx-sum"><b>${esc(T('{n} lignes', {n: nf(v.body.length)}))}</b> · ${esc(T('{n} colonnes', {n: v.cols.length}))}${bits.length ? ` <small class="muted">· ${esc(bits.join(' · '))}</small>` : ''}</p>
            ${v.stats?.formulas ? `<p class="lpx-note">⚠️ ${esc(T('{n} cases qui ressemblaient à des formules de tableur ont été vidées (par sécurité).', {n: nf(v.stats.formulas)}))}</p>` : ''}
            <label class="checkbox-line lpx-headtog"><input type="checkbox" data-lpx-header ${v.header ? 'checked' : ''}> ${esc(T('La première ligne contient les titres des colonnes'))}</label>
            <p class="lpx-hint muted">${esc(T('Chaque colonne a été comprise toute seule : corrige si besoin.'))}</p>
            <ul class="lpx-cols" data-lpx-cols>${v.cols.map((c, j) => `<li class="lpx-col${c.type === 'skip' ? ' is-skip' : ''}" data-lpx-col="${j}">
                <input class="lpx-col-lab" data-lpx-lab="${j}" value="${esc(c.label)}" aria-label="${esc(T('Titre de la colonne {n}', {n: j + 1}))}" maxlength="120">
                <select data-lpx-type="${j}" aria-label="${esc(T('Sorte de la colonne {n}', {n: j + 1}))}">${types.map(([k, l]) => `<option value="${k}" ${c.type === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}<option value="skip" ${c.type === 'skip' ? 'selected' : ''}>${esc(T('— ne pas prendre —'))}</option></select>
                <small class="lpx-col-ex muted">${esc(sample(j).slice(0, 90)) || '—'}</small></li>`).join('')}</ul>
            <details class="lpx-prev" open><summary>${esc(T('Aperçu'))}</summary><div class="lpx-prev-wrap"><table class="lpx-table"><thead><tr>${shownCols.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
                <tbody>${prev.map(r => { const row = core.buildRow(Object.fromEntries(v.cols.map(c => [c.key, r[c.src] ?? ''])), shownCols, {}); return `<tr>${shownCols.map(c => `<td>${esc(String(row[c.key] ?? '').slice(0, 80))}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div></details>
            <div class="lpx-actions"><button type="button" class="button secondary" data-lpx-back>← ${esc(T('Retour'))}</button><button type="button" class="button" data-lpx-next>${esc(T('Continuer'))} →</button></div></div>`;
        b.querySelector('[data-lpx-header]')?.addEventListener('change', async e => { try { W.view = await understand(W.got, e.target.checked); paintCheck(b); } catch (x) { toast(x.message, 'error'); } });
        b.querySelectorAll('[data-lpx-type]').forEach(s => s.addEventListener('change', () => { const c = W.view.cols[Number(s.dataset.lpxType)]; c.type = s.value; paintCheck(b); }));
        b.querySelectorAll('[data-lpx-lab]').forEach(inp => inp.addEventListener('input', () => { W.view.cols[Number(inp.dataset.lpxLab)].label = inp.value.trim() || `Colonne ${Number(inp.dataset.lpxLab) + 1}`; }));
        b.querySelector('[data-lpx-back]')?.addEventListener('click', () => setStep(1));
        b.querySelector('[data-lpx-next]')?.addEventListener('click', () => { if (!W.view.cols.some(c => c.type !== 'skip')) return toast(T('Garde au moins une colonne.'), 'error'); setStep(3); });
    }

    function metaFields(m, {withName = true} = {}) {
        return `${withName ? `<div class="lpx-namerow"><button type="button" class="lpx-icon" data-lpx-icon aria-label="${esc(T('Choisir une icône'))}" title="${esc(T('Choisir une icône'))}">${esc(m.icon || '📋')}</button>
            <label class="lpx-field lpx-grow"><span>${esc(T('Nom de la liste'))}</span><input name="name" data-lpx-name value="${esc(m.name)}" maxlength="120" required placeholder="${esc(T('ex. Soldats de ma commune'))}"></label></div>
            <p class="lpx-hint muted">${esc(T('Rangée dans : {g}', {g: T(GROUP)}))}</p>` : ''}
            <fieldset class="lpx-src"><legend>${esc(T('D’où viennent ces données ?'))}</legend>
                <label class="lpx-field"><span>${esc(T('Source'))}</span><input name="source" value="${esc(m.source)}" maxlength="300" placeholder="${esc(T('ex. Archives de la Corrèze, relevé de l’association…'))}"></label>
                <label class="lpx-field"><span>${esc(T('Licence'))}</span><input name="licence" value="${esc(m.licence)}" maxlength="120" list="lpx-licences" placeholder="${esc(T('ex. Licence Ouverte'))}"></label>
                <datalist id="lpx-licences">${LICENCES.map(l => `<option value="${esc(T(l))}">`).join('')}</datalist>
                <label class="lpx-field"><span>${esc(T('Lien ↗'))}</span><input name="source_url" type="url" inputmode="url" value="${esc(m.source_url)}" maxlength="1000" placeholder="https://…"></label>
            </fieldset>`;
    }
    function bindIcon(root, m) {
        const b = root.querySelector('[data-lpx-icon]'); if (!b) return;
        b.addEventListener('click', () => {
            if (UI().iconPicker) UI().iconPicker({anchor: b, emoji: true, value: m.icon, title: T('Choisir une icône'), onPick: v => { if (v) { m.icon = String(v).slice(0, 16); b.textContent = m.icon; } }});
            else { const v = prompt(T('Choisir une icône'), m.icon); if (v) { m.icon = v.slice(0, 16); b.textContent = m.icon; } }
        });
    }
    const readMeta = (form, m) => { for (const k of ['name', 'source', 'licence', 'source_url']) if (form.elements[k]) m[k] = form.elements[k].value.trim(); return m; };
    function paintCreate(b) {
        const m = W.meta, v = W.view;
        b.innerHTML = `<form class="lpx-create" data-lpx-form novalidate>${metaFields(m)}
            <p class="lpx-sum muted">${esc(T('{n} lignes, {c} colonnes', {n: nf(v.body.length), c: v.cols.filter(c => c.type !== 'skip').length}))}</p>
            <div class="lpx-progress" data-lpx-progress hidden><progress max="100" value="0"></progress><span data-lpx-progress-t></span></div>
            <div class="lpx-actions"><button type="button" class="button secondary" data-lpx-back>← ${esc(T('Retour'))}</button><button type="submit" class="button" data-lpx-create>✓ ${esc(T('Créer la liste'))}</button></div></form>`;
        const form = b.querySelector('form');
        bindIcon(b, m);
        b.querySelector('[data-lpx-back]')?.addEventListener('click', () => { readMeta(form, m); setStep(2); });
        form.addEventListener('submit', async e => {
            e.preventDefault(); readMeta(form, m);
            if (!m.name) { form.elements.name.focus(); return toast(T('Donne un nom à la liste.'), 'error'); }
            if (m.source_url && !/^https?:\/\//i.test(m.source_url)) return toast(T('Le lien doit commencer par https://'), 'error');
            const btn = b.querySelector('[data-lpx-create]'); btn.disabled = true;
            try { const id = await save(m, v, prog(b)); W.done = true; toast(T('Liste créée : {n}', {n: m.name}), 'success'); openList(id); }
            catch (x) { toast(x.message, 'error'); btn.disabled = false; }
        });
    }
    const prog = root => (done, total) => { const p = root.querySelector('[data-lpx-progress]'); if (!p) return; p.hidden = false; const pc = total ? Math.round(done * 100 / total) : 0; p.querySelector('progress').value = pc; p.querySelector('[data-lpx-progress-t]').textContent = T('{a} / {b} lignes', {a: nf(done), b: nf(total)}); };
    const colsOut = view => view.cols.filter(c => c.type !== 'skip').map(c => ({key: c.key, label: c.label, type: c.type}));
    const rowsOut = (view, map = null) => view.body.map(r => { const o = {}; if (map) map.forEach(x => { o[x.key] = r[x.src] ?? ''; }); else view.cols.forEach(c => { if (c.type !== 'skip') o[c.key] = r[c.src] ?? ''; }); return o; });
    async function sendRows(id, stage, rows, onProg, columns) {
        const N = C().LIMITS.chunk;
        for (let i = 0; i < rows.length; i += N) { await post({op: 'append', id, stage, rows: rows.slice(i, i + N), ...(columns ? {columns} : {})}); onProg?.(Math.min(rows.length, i + N), rows.length); }
    }
    /** créer la liste dans la base, puis la ranger dans Listes ; → id */
    async function save(meta, view, onProg) {
        const cols = colsOut(view), rows = rowsOut(view);
        const c = await post({op: 'create', ...meta, columns: cols});
        try { await sendRows(c.id, c.stage, rows, onProg); await post({op: 'commit', id: c.id, stage: c.stage}); }
        catch (e) { try { await post({op: 'abort', id: c.id, stage: c.stage}); } catch (_) {} throw e; }
        await reload(c.id);
        return c.id;
    }

    /* ═════════════ gérer une liste (la barre en haut de la liste) ═════════════ */
    function listBar(page, d) {
        if (!d?.perso || !page) return; ensureCss();
        const id = d.perso, meta = STORE.get(id)?.meta; if (!meta) return;
        const bar = document.createElement('div'); bar.className = 'lpx-bar'; bar.setAttribute('data-lpx-bar', String(id));
        bar.innerHTML = kiosk() ? `<small class="muted">${esc(T('Ma liste · {n} lignes', {n: nf(meta.row_count)}))}</small>` : `<span class="lpx-bar-lab">${esc(T('Ma liste'))}</span>
            <button type="button" class="ui-listbar-btn" data-lpx-act="edit">✎ ${esc(T('Modifier'))}</button>
            <button type="button" class="ui-listbar-btn" data-lpx-act="add">＋ ${esc(T('Ajouter une ligne'))}</button>
            <button type="button" class="ui-listbar-btn" data-lpx-act="replace">⤒ ${esc(T('Remplacer par un fichier'))}</button>
            <button type="button" class="ui-listbar-btn" data-lpx-act="merge">⊕ ${esc(T('Ajouter un fichier'))}</button>
            <button type="button" class="ui-listbar-btn" data-lpx-act="share">⇪ ${esc(T('Partager'))}</button>
            <button type="button" class="ui-listbar-btn lpx-danger" data-lpx-act="delete">🗑 ${esc(T('Supprimer'))}</button>`;
        const anchor = page.querySelector('.ld-source') || page.querySelector('.ld-saved');
        if (anchor) anchor.after(bar); else page.prepend(bar);
        bar.addEventListener('click', e => { const b = e.target.closest('[data-lpx-act]'); if (!b) return; ACT[b.dataset.lpxAct]?.(id).catch?.(x => toast(x.message, 'error')); });
    }
    const typeSelect = (name, v) => `<select name="${esc(name)}">${TYPE_LABELS().map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const dialog = o => (ext.openDialog ? ext.openDialog(o) : null);
    const ACT = {
        async edit(id) {
            const meta = STORE.get(id).meta, m = {...meta};
            dialog({eyebrow: T('Ma liste'), title: T('Modifier la liste'), submitLabel: T('Enregistrer'), wide: true,
                body: `<div class="lpx-dlg">${metaFields(m)}<h4>${esc(T('Colonnes'))}</h4><ul class="lpx-cols lpx-cols-edit">${(meta.columns || []).map((c, j) => `<li class="lpx-col">
                    <input class="lpx-col-lab" name="lab_${j}" value="${esc(c.label)}" maxlength="120" aria-label="${esc(T('Titre de la colonne {n}', {n: j + 1}))}">${typeSelect('type_' + j, c.type)}
                    <label class="checkbox-line"><input type="checkbox" name="show_${j}" ${c.hidden ? '' : 'checked'}> ${esc(T('montrer'))}</label></li>`).join('')}</ul></div>`,
                onSubmit: async form => {
                    readMeta(form, m); if (!m.name) { toast(T('Donne un nom à la liste.'), 'error'); return false; }
                    const columns = (meta.columns || []).map((c, j) => ({key: c.key, label: form.elements['lab_' + j].value.trim() || c.label, type: form.elements['type_' + j].value, hidden: !form.elements['show_' + j].checked}));
                    const r = await post({op: 'meta', id, name: m.name, icon: m.icon, source: m.source, licence: m.licence, source_url: m.source_url, columns});
                    await reload(id);
                    const b = r.before;
                    undoToast(T('Liste modifiée'), async () => { await post({op: 'meta', id, name: b.name, icon: b.icon, source: b.source, licence: b.licence, source_url: b.source_url, columns: b.columns}); await reload(id); }, '✎');
                },
                onOpen: dlg => bindIcon(dlg, m)});
        },
        async add(id) {
            const meta = STORE.get(id).meta, cols = (meta.columns || []);
            dialog({eyebrow: T('Ma liste'), title: T('Ajouter une ligne'), submitLabel: T('Ajouter'),
                body: `<div class="lpx-dlg lpx-addrow">${cols.map((c, j) => `<label class="lpx-field"><span>${esc(c.label)}</span><input name="v_${j}" maxlength="5000" ${c.type === 'url' ? 'type="url" placeholder="https://…"' : c.type === 'date' ? `placeholder="${esc(T('ex. 12 mars 1813'))}"` : ''}></label>`).join('')}</div>`,
                onSubmit: async form => {
                    const row = Object.fromEntries(cols.map((c, j) => [c.key, form.elements['v_' + j].value.trim()]));
                    if (!Object.values(row).some(Boolean)) { toast(T('Remplis au moins une case.'), 'error'); return false; }
                    const r = await post({op: 'add_rows', id, rows: [row]}); await reload(id);
                    undoToast(T('Ligne ajoutée'), async () => { await post({op: 'remove_batch', id, batch: r.batch}); await reload(id); }, '＋');
                }});
        },
        replace: id => fileThen(id, 'replace'),
        merge: id => fileThen(id, 'merge'),
        async share(id) {
            const meta = STORE.get(id).meta;
            const ok = await (A().confirmBox ? A().confirmBox({title: T('Partager « {n} » ?', {n: meta.name}), message: T('Ces données peuvent-elles être partagées ? Vérifie que la licence le permet et qu’il n’y a rien de privé (personnes vivantes, adresses…).'), okLabel: T('Oui, je peux les partager'), danger: false}) : Promise.resolve(confirm(T('Ces données peuvent-elles être partagées ?'))));
            if (!ok) return;
            const rows = await loadRowsRaw(id);
            const blob = new Blob([C().shareJson(meta, meta.columns || [], rows)], {type: 'application/json'});
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${(A().safeExportFilename || (s => s))(meta.name, 'ma-liste')}.lcnda-liste.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            toast(T('Fichier prêt : on peut le relire avec « ＋ Créer ma liste ».'), 'success');
        },
        async delete(id) {
            const meta = STORE.get(id).meta;
            const ok = await (A().confirmBox ? A().confirmBox({title: T('Supprimer « {n} » ?', {n: meta.name}), message: T('La liste et ses {n} lignes. ↶ Annuler reste possible.', {n: nf(meta.row_count)}), okLabel: T('Supprimer')}) : Promise.resolve(confirm(T('Supprimer « {n} » ?', {n: meta.name}))));
            if (!ok) return;
            await post({op: 'delete', id}); STORE.delete(id); unregister(id);
            const st = A().state; if (st) { st.listType = 'donnees'; if (st.module === 'listes') ext.lists?.donnees?.(++st.workspaceToken); }
            undoToast(T('Liste supprimée : {n}', {n: meta.name}), async () => { await post({op: 'restore', id}); await reload(id); openList(id); }, '🗑');
        },
    };
    /** les lignes telles qu'enregistrées (pour partager) */
    async function loadRowsRaw(id) {
        const out = []; let total = Infinity;
        for (let off = 0; off < total; off += 20000) { const r = await api('ulist_rows', {id, offset: off, limit: 20000}); if (off === 0) total = Number(r.total) || 0; out.push(...(r.rows || [])); if (!(r.rows || []).length) break; }
        return out;
    }
    /** ⤒ Remplacer / ⊕ Ajouter un fichier : choisir, lire, envoyer, ↶ */
    function fileThen(id, mode) {
        const meta = STORE.get(id).meta;
        return new Promise(resolve => {
            dialog({eyebrow: meta.name, title: mode === 'replace' ? T('Remplacer par un fichier') : T('Ajouter les lignes d’un fichier'), submitLabel: T('Fermer'),
                body: `<div class="lpx-dlg" data-lpx-filedlg><p class="muted">${esc(mode === 'replace' ? T('Les lignes actuelles sont remplacées par celles du fichier (↶ Annuler possible). Les colonnes de même titre sont reprises.') : T('Les lignes du fichier s’ajoutent à la fin. Les colonnes de même titre sont reprises, les autres ajoutées.'))}</p>${importHtml(false)}
                    <div class="lpx-progress" data-lpx-progress hidden><progress max="100" value="0"></progress><span data-lpx-progress-t></span></div></div>`,
                onSubmit: () => { resolve(); }});
            const root = document.querySelector('[data-lpx-filedlg]'); if (!root) return resolve();
            bindImport(root, async input => {
                const got = await readInput(input), view = await understand(got, input.text != null ? null : got.header);
                const n = await applyFile(id, mode, view, prog(root));
                root.closest('dialog')?.close(); resolve();
                return n;
            });
        });
    }
    async function applyFile(id, mode, view, onProg) {
        const meta = STORE.get(id).meta, core = C();
        const {map, added} = core.mapMerge(meta.columns || [], view.head);
        added.forEach(a => { const j = map.find(x => x.key === a.key)?.src; const g = view.cols[j]; if (g && g.type !== 'skip') a.type = g.type; });
        const columns = [...(meta.columns || []), ...added];
        const rows = view.body.map(r => Object.fromEntries(map.map(x => [x.key, r[x.src] ?? ''])));
        const b = await post({op: 'begin', id, mode});
        try { await sendRows(id, b.stage, rows, onProg, columns); var c = await post({op: 'commit', id, stage: b.stage, columns}); }
        catch (e) { try { await post({op: 'abort', id, stage: b.stage}); } catch (_) {} throw e; }
        await reload(id);
        const prevCols = c.prev_columns || meta.columns;
        undoToast(mode === 'replace' ? T('Liste remplacée : {n} lignes', {n: nf(c.row_count)}) : T('{n} lignes ajoutées', {n: nf(rows.length)}),
            async () => { await post({op: 'revert', id, columns: prevCols}); await reload(id); }, mode === 'replace' ? '⤒' : '⊕');
        return c.row_count;
    }

    /* ═════════════ dans Listes : l'entrée « ＋ Créer ma liste » et le groupe « Mes listes » ═════════════ */
    function hook() {
        const L = A().defaultListTypes;
        if (!Array.isArray(L)) return false;
        if (!L.some(x => x[0] === KEY)) L.push([KEY, '90a', T('＋ Créer ma liste')]);
        ext.lists = ext.lists || {}; ext.lists[KEY] = token => renderNew(token);
        ext.dataToolKeys = ext.dataToolKeys || []; if (!ext.dataToolKeys.includes(KEY)) ext.dataToolKeys.unshift(KEY);
        const G = (ext.listGroupDefaults || []).find(g => g[0] === 'g_data'); if (G && Array.isArray(G[3]) && !G[3].includes(KEY)) G[3].splice(Math.min(1, G[3].length), 0, KEY);
        return true;
    }
    /** ouvrir l'assistant, déjà rempli (« Prendre depuis… → De l'extérieur », un autre outil) */
    function create(input = {}) {
        if (kiosk()) { toast(T('Mode consultation : on ne peut pas créer de liste.'), 'error'); return Promise.resolve(false); }
        const st = A().state; if (!st || !hook()) return Promise.resolve(false);
        const hasData = !!(input.rows || input.file || input.text != null || input.url || input.buffer);
        W = {step: 1, got: null, view: null, meta: {name: input.name || '', icon: input.icon || '📋', source: input.source || '', licence: input.licence || '', source_url: input.source_url || ''}};
        pending = hasData ? input : null;
        st.listType = KEY;
        if (st.module !== 'listes') { A().setModule?.('listes'); st.listType = KEY; }
        A().renderSidebar?.(); renderNew(++st.workspaceToken);
        return Promise.resolve(true);
    }
    ext.listesPerso = {create, open: openList, lists: () => [...STORE.values()].map(s => s.meta), reload, listBar, applyFile, readInput, understand, save, _store: STORE};

    let tries = 0;
    const start = () => { if (!hook() && tries++ < 100) return setTimeout(start, 100); boot(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    window.addEventListener('lcnda:genealogy-changed', () => { for (const id of [...STORE.keys()]) { STORE.delete(id); unregister(id); } boot(); });
})();
