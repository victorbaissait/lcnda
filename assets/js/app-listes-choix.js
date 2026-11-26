/* LCNDA — ☑ Prendre plusieurs lignes d'un coup, dans TOUTES les listes de données (moteur commun app-listes-donnees.js).
 * Maquette validée : docs/design/liste-choix-multiple.html (et docs/design/sport-tour-de-france.html, décisions du 2026-11-26).
 *
 *  - une case au début de chaque ligne (au survol sur un ordinateur, toujours au doigt) ; celle de l'en-tête = les lignes affichées ;
 *    « ☑ Tout cocher (N) » = TOUT ce qui correspond au filtre (même les lignes pas encore affichées) ; Maj+clic : toute une suite ;
 *  - une barre calme en bas, seulement quand au moins une ligne est cochée : « N choisis · 📎 Insérer… · 🧺 Mettre dans un panier…
 *    · ⤓ Exporter · ✕ » ;
 *  - 📎 et 🧺 restent au bout de chaque ligne (un seul élément en un clic) ;
 *  - 📎 sur plusieurs lignes : un seul bloc propre (liste ou tableau, chaque ligne avec sa source), par le 📎 « Insérer une info »
 *    (app-inserer.js : à l'endroit du curseur, ou « Mettre dans… », ou copié) ; 🧺 : le panier choisi, tout en une fois (un seul
 *    ↶ Annuler ; au-delà de 500 lignes, un seul « ensemble ») ; ⤓ : CSV ou Excel (une case « =… » reste du texte) ;
 *  - clavier : Espace coche la ligne, Maj+Espace toute une suite, Échap décoche tout ; le focus reste où il est ;
 *  - mode consultation, appareil invité du wifi : 📎 et 🧺 éteints, avec la raison ; ⤓ Exporter reste.
 *  Une liste peut dire : rowKey(row) (sinon row.id, sinon ses valeurs) ; itemOf(row, élément) (ex. 🔀 une ligne réunie et SES sources).
 *  Une sous-liste (d.sub, « ☑ Toutes ses étapes ») : le bouton du bandeau coche tout ce qu'elle montre.
 *  API : LCNDA_EXT.listesChoix = {listBar, rowsPainted, cellBefore, cellAfter, headBefore, headAfter, act(kind, rows, anchor), count(), clear()}
 *  Essai : tests/test-listes-choix-multiple.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const CX = () => ext.connexions || null;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const toast = (m, k) => A().toast?.(m, k);
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const RO = () => T('Mode consultation : rien ne peut être écrit.');

    /* ═════════════ ce qui est coché (une liste à la fois) ═════════════ */
    const S = {list: '', map: new Map(), all: null, except: new Set(), last: -1, api: null, page: null, bar: null};
    const filterSig = st => JSON.stringify([st.q || '', st.crit || [], st.period || null, st.near || null, st.chips || [], st.dview || '', st.inBase || false]);
    function rowKey(d, r) {
        try { const k = d.rowKey?.(r); if (k != null && k !== '') return String(k); } catch (_) {}
        if (r._k != null) return String(r._k);
        if (r.id != null && r.id !== '') return `id:${r.id}`;
        return JSON.stringify((d.fields || []).map(f => r[f.key] ?? null));
    }
    const count = () => (S.all ? Math.max(0, S.all.total - S.except.size) : S.map.size);
    const isOn = (d, r) => { const k = rowKey(d, r); return S.all ? !S.except.has(k) : S.map.has(k); };
    function setOn(d, r, on) { const k = rowKey(d, r); if (S.all) { if (on) S.except.delete(k); else S.except.add(k); } else if (on) S.map.set(k, r); else S.map.delete(k); }
    function clear() { S.map.clear(); S.all = null; S.except.clear(); S.last = -1; paint(); }

    /* ═════════════ les cases et les boutons des lignes (le moteur les pose) ═════════════ */
    // la case se pose au début de la 1re case de la ligne (le moteur l'y met) : les colonnes du tableau restent les mêmes
    const cellBefore = i => `<button type="button" class="ld-ck-b" role="checkbox" aria-checked="false" data-ld-ck="${i}" aria-label="${esc(T('Choisir cette ligne'))}"></button>`;
    const headBefore = () => `<button type="button" class="ld-ck-b" role="checkbox" aria-checked="false" data-ld-ckall aria-label="${esc(T('Cocher les lignes affichées'))}"></button>`;
    const cellAfter = i => { const ro = kiosk(), why = ro ? ` disabled title="${esc(RO())}"` : '';
        return `<td class="ld-acts"><button type="button" class="ld-act" data-ld-ins="${i}"${why || ` title="${esc(T('Insérer cette ligne (avec sa source)'))}"`} aria-label="${esc(T('Insérer cette ligne'))}">📎</button>${CX() ? `<button type="button" class="ld-act" data-ld-bk="${i}"${why || ` title="${esc(T('Mettre cette ligne au panier'))}"`} aria-label="${esc(T('Mettre cette ligne au panier'))}">🧺</button>` : ''}</td>`; };
    const headAfter = () => `<th class="ld-acts"><span class="sr-only">${esc(T('Prendre'))}</span></th>`;

    /** la page d'une liste : « ☑ Tout cocher (N) », la barre du bas, les clics et le clavier (une fois par page) */
    function listBar(page, api) {
        const id = api.base?.id || api.d?.id;
        if (S.list !== id) { S.map.clear(); S.all = null; S.except.clear(); S.last = -1; S.list = id; }
        S.api = api; S.page = page;
        const tools = document.createElement('div'); tools.className = 'ldc-tools'; tools.dataset.ldcTools = '';
        tools.innerHTML = `<button type="button" class="ldc-all" data-ldc-all title="${esc(T('Tout ce qui correspond au filtre, même les lignes pas encore affichées'))}">☑ <span data-ldc-all-t>${esc(T('Tout cocher'))}</span></button><span class="ldc-hint muted">${esc(T('Maj+clic : toute une suite'))}</span>`;
        page.querySelector('.ld-bar')?.appendChild(tools);
        const bar = S.bar = document.createElement('div'); bar.className = 'ldc-bar'; bar.hidden = true; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', T('Lignes choisies'));
        const ro = kiosk(), why = ro ? ` disabled title="${esc(RO())}"` : '';
        bar.innerHTML = `<span class="ldc-n" data-ldc-n aria-live="polite"></span><span class="ldc-acts"><button type="button" class="ldc-b" data-ldc-ins${why}>📎 <span>${esc(T('Insérer…'))}</span></button>${CX() ? `<button type="button" class="ldc-b" data-ldc-bk${why}>🧺 <span>${esc(T('Mettre dans un panier…'))}</span></button>` : ''}<button type="button" class="ldc-b" data-ldc-exp>⤓ <span>${esc(T('Exporter'))}</span></button></span><button type="button" class="ldc-x" data-ldc-x aria-label="${esc(T('Tout décocher (Échap)'))}" title="${esc(T('Tout décocher (Échap)'))}">✕</button>`;
        page.appendChild(bar);
        page.addEventListener('click', onClick);
        page.addEventListener('keydown', onKey);
        paint();
    }
    const rowsNow = () => S.api?.rows?.() || [];
    const dNow = () => S.api?.d || {};
    function onClick(e) {
        const t = e.target; let b;
        if ((b = t.closest('[data-ld-ck]'))) { e.preventDefault(); return toggle(Number(b.dataset.ldCk), e.shiftKey && e.detail !== 0); }
        if (t.closest('[data-ld-ckall]')) { const rs = rowsNow(), d = dNow(), allOn = rs.length && rs.every(r => isOn(d, r)); rs.forEach(r => setOn(d, r, !allOn)); S.last = -1; return paint(); }
        if (t.closest('[data-ldc-all]') || t.closest('[data-ld-pickall]')) return checkAll();
        if (t.closest('[data-ldc-x]')) { clear(); return; }
        if ((b = t.closest('[data-ld-ins]'))) { const r = rowsNow()[Number(b.dataset.ldIns)]; if (r) act('insert', [r], b); return; }
        if ((b = t.closest('[data-ld-bk]'))) { const r = rowsNow()[Number(b.dataset.ldBk)]; if (r) act('basket', [r], b); return; }
        if ((b = t.closest('[data-ldc-ins]'))) return actSel('insert', b);
        if ((b = t.closest('[data-ldc-bk]'))) return actSel('basket', b);
        if ((b = t.closest('[data-ldc-exp]'))) return actSel('export', b);
    }
    function onKey(e) {
        const ck = e.target.closest?.('[data-ld-ck]');
        if (ck && (e.key === ' ' || e.key === 'Spacebar')) { e.preventDefault(); toggle(Number(ck.dataset.ldCk), e.shiftKey); return; }
        if (e.key === 'Escape' && count() && !e.target.closest('.ld-ed-form, input, select, textarea, .ui-actmenu, dialog')) { e.preventDefault(); clear(); }
    }
    /** une case : Maj → toute la suite depuis la dernière cochée */
    function toggle(i, range) {
        const rs = rowsNow(), d = dNow(), r = rs[i]; if (!r) return;
        const on = !isOn(d, r);
        if (range && S.last >= 0 && S.last !== i) { const a = Math.min(S.last, i), b = Math.max(S.last, i); for (let x = a; x <= b; x++) if (rs[x]) setOn(d, rs[x], on); }
        else setOn(d, r, on);
        S.last = i; paint();
    }
    /** ☑ Tout cocher (N) : tout ce qui correspond au filtre */
    function checkAll() {
        const st = S.api?.state?.() || {}, total = S.api?.total?.() || 0;
        if (S.all && !S.except.size) { clear(); return; }
        S.map.clear(); S.except.clear(); S.all = {sig: filterSig(st), total, more: !!S.api?.more?.()}; paint();
        toast(T('{n} lignes cochées (tout ce qui correspond au filtre)', {n: nf(count())}));
    }
    /** après chaque dessin du tableau : l'état des cases (et « Tout cocher » oublié si le filtre a changé) */
    function rowsPainted(res, rows, api) {
        S.api = api;
        if (S.all && S.all.sig !== filterSig(api.state?.() || {})) { S.all = null; S.except.clear(); }
        paint();
    }
    function paint() {
        const page = S.page; if (!page?.isConnected) return;
        const d = dNow(), rs = rowsNow(), n = count();
        page.querySelectorAll('[data-ld-ck]').forEach(b => { const r = rs[Number(b.dataset.ldCk)], on = !!r && isOn(d, r); b.setAttribute('aria-checked', String(on)); b.closest('tr')?.classList.toggle('is-picked', on); });
        const head = page.querySelector('[data-ld-ckall]');
        if (head) { const k = rs.filter(r => isOn(d, r)).length; head.setAttribute('aria-checked', !k ? 'false' : k === rs.length ? 'true' : 'mixed'); }
        const total = S.api?.total?.() || 0, allT = page.querySelector('[data-ldc-all-t]');
        if (allT) allT.textContent = S.all && !S.except.size ? T('Tout décocher') : T('Tout cocher ({n})', {n: nf(total)});
        page.classList.toggle('ldc-has-sel', n > 0);
        const bar = S.bar; if (!bar) return;
        bar.hidden = !n;
        const lab = bar.querySelector('[data-ldc-n]'); if (lab) lab.textContent = n === 1 ? T('1 choisi') : T('{n} choisis', {n: nf(n)});
    }

    /* ═════════════ les lignes choisies → éléments, bloc, fichier ═════════════ */
    async function selectedRows() {
        if (!S.all) return [...S.map.values()];
        let rows = []; try { rows = await S.api.allRows(); } catch (e) { toast(e.message, 'error'); return []; }
        const d = dNow(); return rows.filter(r => !S.except.has(rowKey(d, r)));
    }
    const K = () => CX()?.kit || {};
    function itemOf(d, st, r) {
        let it = K().ldRowItem ? K().ldRowItem(d, st, r) : {kind: 'row', title: String(Object.values(r)[0] ?? ''), value: '', ref_id: 0, origin: {label: `${T('Listes')} · ${T(d.label)}`, url: d.sourceUrl || ''}};
        try { if (d.itemOf) it = d.itemOf(r, it) || it; } catch (_) {}
        return it;
    }
    const srcOf = it => String(it.origin?.label || '').replace(/^Listes · /, '').replace(new RegExp(`^${T('Listes')} · `), '');
    /** le bloc propre : un titre, puis une ligne par élément avec sa source (texte) ; un tableau avec une colonne Source (HTML) */
    function blockOf(d, items, t2) {
        const title = `${d.icon || '📋'} ${T(d.label)} — ${items.length === 1 ? T('1 ligne') : T('{n} lignes', {n: nf(items.length)})}`;
        const line = it => `${it.title}${it.value ? ` — ${it.value}` : ''}`;
        const text = items.length === 1 ? `${line(items[0])} [↗ ${srcOf(items[0])}]` : `${title}\n${items.map(it => `• ${line(it)} [↗ ${srcOf(it)}]`).join('\n')}`;
        const head = [...t2[0], T('Source')], body = t2.slice(1).map((r, i) => [...r, srcOf(items[i] || {})]);
        const url = it => (/^https?:\/\//i.test(it.origin?.url || '') ? it.origin.url : '');
        const html = items.length === 1 ? `${esc(line(items[0]))} ${url(items[0]) ? `<a href="${esc(url(items[0]))}" target="_blank" rel="noopener" class="cx-qi-src">[↗ ${esc(srcOf(items[0]))}]</a>` : `[↗ ${esc(srcOf(items[0]))}]`}`
            : `<p><b>${esc(title)}</b></p><table><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${body.map((r, i) => `<tr>${r.map((c, j) => `<td>${j === r.length - 1 && url(items[i]) ? `<a href="${esc(url(items[i]))}" target="_blank" rel="noopener">${esc(c)}</a>` : esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
        const set = {kind: 'set', title, value: '', data: {icon: d.icon || '📋', columns: head, rows: body, source: d.source || T(d.label), url: d.sourceUrl || '', taken: new Date().toISOString().slice(0, 10)},
            origin: {kind: 'list', id: d.id, label: `${T('Listes')} · ${T(d.label)}`, url: d.sourceUrl || ''}};
        return {text, html, items: items.length === 1 ? items : [set], title};
    }
    /** 📒 les mêmes lignes pour un bloc « Données » figé d'une Fiche (heritage-fiches.js : ext.fiches.addDataSnapshot) : colonnes, lignes
     *  (au plus 500), et pour chacune sa source ↗ ; la position et l'année (carte, frise) */
    function sheetSnap(d, rows, items, t2, api) {
        const E = ext.dataListsEngine || {}, http = u => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : '');
        return {at: new Date().toISOString().slice(0, 10), list: d._base?.id || d.id, label: T(d.label), icon: d.icon || '📋', source: d.source || '', sourceUrl: http(d.sourceUrl), licence: d.licence || d.license || '',
            crit: (() => { try { return api.critSummary?.() || ''; } catch (_) { return ''; } })(), total: rows.length, cols: t2[0].map((l, i) => ({k: 'c' + i, l: String(l)})),
            rows: t2.slice(1, 501).map((r, i) => { const g = E.geoOf?.(d, rows[i]), p = E.periodOf?.(d, rows[i]); return {c: r.map(v => String(v ?? '')), s: srcOf(items[i] || {}), u: http(items[i]?.origin?.url), g: g || null, y: p ? p[0] : null}; })};
    }
    async function act(kind, rows, anchor, api0 = null) { // api0 : une page qui n'est pas celle du moteur (ex. une réponse de 📊 Récap)
        const api = api0 || S.api || ext.dataListsEngine?.page?.(); if (!api) return;
        const d = api.d, st = api.state?.() || {};
        if (!rows.length) return;
        if ((kind === 'insert' || kind === 'basket') && kiosk()) return toast(RO());
        const items = rows.map(r => itemOf(d, st, r));
        if (kind === 'basket') {
            const cx = CX(); if (!cx?.take) return toast(T('Le panier n’est pas chargé.'), 'error');
            const its = items.length <= 500 ? items : [blockOf(d, items, api.table2d(rows)).items[0]]; // une seule écriture : au-delà de 500, un ensemble
            return cx.take(its, {anchor, ask: 'multi'}); // plusieurs lignes et plusieurs paniers : « Dans quel panier ? » ; une seule : le panier en cours, « Changer ▾ »
        }
        if (kind === 'insert') {
            const t2 = api.table2d(rows), b = blockOf(d, items, t2);
            try { b.sheet = sheetSnap(d, rows, items, t2, api); } catch (_) {} // 📒 « dans une fiche → nouveau bloc Données (figé) » (app-inserer.js)
            if (ext.insertInfo?.insertBlock) return ext.insertInfo.insertBlock(b, {anchor});
            return toast(T('« Insérer une info » n’est pas chargé.'), 'error');
        }
        if (kind === 'export') return exportRows(d, api, rows, anchor);
    }
    async function actSel(kind, anchor) {
        if ((kind === 'insert' || kind === 'basket') && kiosk()) return toast(RO());
        anchor.disabled = true;
        try { const rows = await selectedRows(); if (!rows.length) return toast(T('Aucune ligne choisie.')); await act(kind, rows, anchor); }
        finally { anchor.disabled = kiosk() && kind !== 'export'; }
    }
    /* ⤓ les lignes choisies : CSV (« ; », UTF-8) ou Excel ; une case qui commencerait une formule reste du texte */
    const safe = v => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) && !/^-?\d+([.,]\d+)?$/.test(v) ? "'" + v : v);
    function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    function exportRows(d, api, rows, anchor) {
        const t2 = api.table2d(rows), base = A().safeExportFilename ? A().safeExportFilename(T(d.label), 'liste') : 'liste', SH = window.LCNDA_SHEET;
        const csv = () => { const cell = A().csvCell ? (v => A().csvCell(v, {sep: ';'})) : (v => { const s = String(safe(v) ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; });
            download(new Blob(['﻿' + t2.map(r => r.map(cell).join(';')).join('\r\n')], {type: 'text/csv;charset=utf-8'}), `${base}.csv`); toast(T('{n} lignes exportées.', {n: nf(rows.length)})); };
        const xlsx = async () => { const wb = SH.newWorkbook(); wb.sheets[0].name = SH.cleanSheetName ? SH.cleanSheetName(T(d.label), []) : 'Liste'; wb.sheets[0].cells = SH.rowsToCells(t2.map(r => r.map(safe))); download(await SH.toXlsx(wb), `${base}.xlsx`); toast(T('{n} lignes exportées.', {n: nf(rows.length)})); };
        if (!SH?.toXlsx || !UI().menuAt) return csv();
        UI().menuAt(anchor, [{icon: '📄', label: T('CSV (tableur, Excel)'), run: csv}, {icon: '📊', label: T('Fichier Excel (.xlsx)'), run: xlsx}], {title: T('Exporter {n} lignes', {n: nf(rows.length)})});
    }

    ext.listesChoix = {listBar, rowsPainted, cellBefore, cellAfter, headBefore, headAfter, act, count, clear, rowKey, selectedRows};
})();
