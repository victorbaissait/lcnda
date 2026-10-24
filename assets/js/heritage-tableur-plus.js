/**
 * 🧮 Tableur — en plus (branché sur heritage-tableur.js par ses crochets ext.sheetMenuExtra / ext.sheetCommands) :
 *  - 🔀 Tableau croisé dynamique : une plage avec des titres → une nouvelle feuille « lignes × colonnes » (nombre, somme,
 *    moyenne, plus petit, plus grand, nombre de valeurs différentes ; en % de la ligne, de la colonne ou du tout ; totaux).
 *    La feuille garde d'où elle vient (sheet.pivot) : « ↻ Actualiser le tableau croisé » la refait d'après les données du moment.
 *  - 📊 Graphique vivant : une petite fenêtre posée sur la feuille, qui redessine le diagramme de la sélection à chaque
 *    changement (de sélection ou de chiffres) ; type au choix, « ↗ En faire un diagramme » (lié à la plage).
 * Sans écran : ext.sheetPivot.compute (aussi require() dans Node, pour les essais).
 */
(function (root) {
    'use strict';
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const A = () => root.LCNDA_APP, X = () => root.LCNDA_SHEET;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (...a) => A()?.toast?.(...a);
    const AGG = [['count', 'Nombre de lignes'], ['sum', 'Somme'], ['avg', 'Moyenne'], ['min', 'Plus petit'], ['max', 'Plus grand'], ['distinct', 'Nombre de valeurs différentes']];
    const PCT = [['', 'Les chiffres'], ['row', 'En % de la ligne'], ['col', 'En % de la colonne'], ['all', 'En % du tout']];
    const EMPTY = '(vide)';

    /* ═════════ Le calcul (sans écran) ═════════
       header : [titre…] ; rows : [[valeur…]] ; o : {rows: index, cols: index | -1, val: index | -1, agg, totals, pct}
       → {matrix: [[…]], nRowHead: 1, nColHead: 1 | 2, totalRow, totalCol, pct, title} */
    const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(v) ? Number(v.replace(',', '.')) : null);
    const keyOf = v => (v == null || String(v).trim() === '' ? EMPTY : typeof v === 'number' ? v : String(v).trim());
    const sortKeys = keys => { const all = [...keys]; const nums = all.every(k => typeof k === 'number' || k === EMPTY);
        return all.sort((a, b) => (a === EMPTY) - (b === EMPTY) || (nums ? a - b : String(a).localeCompare(String(b), 'fr', {numeric: true, sensitivity: 'base'}))); };
    function compute(header, rows, o = {}) {
        const ri = Number(o.rows), ci = Number.isInteger(o.cols) ? o.cols : -1, vi = Number.isInteger(o.val) ? o.val : -1;
        let agg = AGG.some(a => a[0] === o.agg) ? o.agg : 'count'; if (vi < 0 && agg !== 'count') agg = 'count';
        const cells = new Map(), rk = new Set(), ck = new Set(), bucket = () => ({n: 0, sum: 0, cnt: 0, min: null, max: null, set: new Set()});
        const put = (a, b, v) => { const k = `${typeof a}:${a}\u0001${typeof b}:${b}`; let x = cells.get(k); if (!x) cells.set(k, x = bucket()); x.n++; if (agg === 'distinct') { if (v != null && String(v).trim() !== '') x.set.add(String(v).trim().toLowerCase()); return; } const n = num(v); if (n !== null) { x.sum += n; x.cnt++; x.min = x.min === null ? n : Math.min(x.min, n); x.max = x.max === null ? n : Math.max(x.max, n); } };
        const ALL = '\u0002tout';
        for (const r of (Array.isArray(rows) ? rows : []).slice(0, 200000)) {
            if (!Array.isArray(r) || r.every(v => v == null || v === '')) continue;
            const a = keyOf(r[ri]), b = ci >= 0 ? keyOf(r[ci]) : ALL, v = vi >= 0 ? r[vi] : 1;
            rk.add(a); if (ci >= 0) ck.add(b);
            put(a, b, v); if (ci >= 0) { put(a, ALL, v); put(ALL, b, v); } put(ALL, ALL + '#', v);
        }
        const R = sortKeys(rk).slice(0, 2000), Cs = ci >= 0 ? sortKeys(ck).slice(0, 200) : [];
        const valOf = (a, b) => { const x = cells.get(`${typeof a}:${a}\u0001${typeof b}:${b}`); if (!x) return null;
            return agg === 'count' ? x.n : agg === 'distinct' ? x.set.size : agg === 'sum' ? x.sum : !x.cnt ? null : agg === 'avg' ? Math.round(x.sum / x.cnt * 100) / 100 : agg === 'min' ? x.min : x.max; };
        const grand = valOf(ALL, ALL + '#'), totalsOk = o.totals !== false && agg !== 'distinct' && agg !== 'avg' && agg !== 'min' && agg !== 'max';
        const cols = ci >= 0 ? Cs : [ALL], colTotal = a => (a === ALL ? grand : valOf(a, ALL)), rowTotal = b => valOf(ALL, b);
        const pct = ['row', 'col', 'all'].includes(o.pct) && ['count', 'sum'].includes(agg) ? o.pct : '';
        const div = (v, a, b) => { if (v == null || !pct) return v; const d = pct === 'row' ? colTotal(a) : pct === 'col' ? (b === ALL ? grand : rowTotal(b)) : grand; return d ? Math.round(v / d * 10000) / 10000 : null; };
        const aggName = (AGG.find(x => x[0] === agg) || AGG[0])[1], valName = vi >= 0 ? String(header?.[vi] ?? `Colonne ${vi + 1}`) : '';
        const title = `${aggName}${vi >= 0 && agg !== 'count' ? ` de « ${valName} »` : ''}`;
        const head = [String(header?.[ri] ?? 'Lignes'), ...(ci >= 0 ? Cs.map(String) : [title]), ...(ci >= 0 && totalsOk ? ['Total'] : [])];
        const body = R.map(a => [a, ...cols.map(b => div(valOf(a, b), a, b)), ...(ci >= 0 && totalsOk ? [div(colTotal(a), a, ALL)] : [])]);
        const out = [head, ...body];
        if (totalsOk) out.push(['Total', ...cols.map(b => div(ci >= 0 ? rowTotal(b) : grand, ALL, b)), ...(ci >= 0 ? [div(grand, ALL, ALL)] : [])]);
        return {matrix: out, title, colTitle: ci >= 0 ? String(header?.[ci] ?? '') : '', totalRow: totalsOk, totalCol: ci >= 0 && totalsOk, pct, rows: R.length, cols: cols.length};
    }
    ext.sheetPivot = {compute, AGG, PCT};
    if (typeof module === 'object' && module.exports) { module.exports = {compute, AGG, PCT}; return; }

    /* ═════════ L'écran ═════════ */
    const UI = () => root.LCNDA_UI;
    /** la plage : la sélection si elle a plusieurs lignes, sinon le bloc rempli autour de la case choisie */
    const rangeOf = ed => { const s = ed.sel; if (s.r1 > s.r0) return ed.selClip(); return ed.sortTarget ? ed.sortTarget() : ed.selClip(); };
    function readTable(ed, g, si = ed.si) {
        const m = X().matrix(ed.wb, ed.calc, si, g).map(r => r.map(v => (v === '' ? null : v)));
        while (m.length && m[m.length - 1].every(v => v == null)) m.pop();
        return {header: (m[0] || []).map((v, j) => (v == null || v === '' ? `Colonne ${X().colName(g.c0 + j)}` : String(v))), rows: m.slice(1)};
    }
    /** écrit le résultat dans la feuille sh (vidée d'abord), titres en gras et teintés, totaux en gras, % au format pourcentage */
    function writePivot(ed, sh, res, def) {
        const S = X(), bold = S.styleId(ed.wb, {b: 1, fill: '#e8eefc'}), tot = S.styleId(ed.wb, {b: 1, fill: '#f3f4f6'}), pct = S.styleId(ed.wb, {fmt: 'pct', dec: 1}), pctTot = S.styleId(ed.wb, {fmt: 'pct', dec: 1, b: 1, fill: '#f3f4f6'});
        ed.meta(sh); Object.keys(sh.cells).forEach(k => ed.put(sh, k, null));
        const top = 2, n = res.matrix.length;
        ed.put(sh, 'A1', {v: `🔀 ${res.title}${res.colTitle ? ` · par « ${res.matrix[0][0]} » et « ${res.colTitle} »` : ` · par « ${res.matrix[0][0]} »`} — d’après ${def.srcName}!${def.range}`, s: S.styleId(ed.wb, {b: 1})});
        res.matrix.forEach((row, i) => row.forEach((v, j) => {
            const isHead = i === 0 || j === 0, isTot = (res.totalRow && i === n - 1) || (res.totalCol && j === row.length - 1 && i > 0);
            const st = isHead ? (isTot ? tot : bold) : res.pct ? (isTot ? pctTot : pct) : isTot ? tot : 0;
            if (v == null && !st) return; ed.put(sh, S.addr(top + i - 1 + 1, j), {v: v == null ? null : v, ...(st ? {s: st} : {})});
        }));
        sh.pivot = {src: def.src, range: def.range, rows: def.rows, cols: def.cols, val: def.val, agg: def.agg, totals: def.totals, pct: def.pct};
        sh.freeze = {r: top + 1, c: 1}; sh.cols = sh.cols || {}; sh.cols.A = {...(sh.cols.A || {}), w: Math.min(260, Math.max(120, ...res.matrix.map(r => String(r[0] ?? '').length * 8)))};
    }
    function pivotDialog(ed) {
        const S = X(), g = rangeOf(ed), t = readTable(ed, g);
        if (t.header.length < 1 || !t.rows.length) return toast('Choisis une plage avec une ligne de titres et des lignes de données (par exemple : Nom, Commune, Année, Âge).');
        const opts = (sel, none) => `${none ? `<option value="-1">${esc(none)}</option>` : ''}${t.header.map((h, j) => `<option value="${j}" ${j === sel ? 'selected' : ''}>${esc(h)}</option>`).join('')}`;
        const firstNum = t.header.findIndex((h, j) => t.rows.some(r => num(r[j]) !== null)), firstText = (() => { // en lignes : la colonne de mots qui se répètent le plus (commune, métier…), pas celle des noms tous différents
            let best = 0, bestN = Infinity; t.header.forEach((h, j) => { const vals = t.rows.map(r => r[j]).filter(v => typeof v === 'string' && v.trim()); if (vals.length < t.rows.length / 2) return; const n = new Set(vals.map(v => v.trim().toLowerCase())).size; if (n > 1 && n < bestN) { best = j; bestN = n; } }); return best; })();
        ext.openDialog({eyebrow: 'DONNÉES', title: '🔀 Tableau croisé dynamique', submitLabel: 'Créer le tableau croisé', wide: true,
            body: `<p class="muted">D’après <b>${esc(S.rangeStr(g))}</b> (${esc(A()?.plural ? A().plural(t.rows.length, 'ligne') : t.rows.length + ' lignes')}). Le résultat va dans une nouvelle feuille ; « ↻ Actualiser le tableau croisé » (menu Données) le refait si les données changent.</p>
                <div class="form-grid xl-pv-grid"><label>En lignes<select name="rows">${opts(firstText)}</select></label><label>En colonnes (facultatif)<select name="cols">${opts(-2, '— rien —')}</select></label>
                <label>Calcul<select name="agg">${AGG.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label><label>Sur la colonne<select name="val">${opts(firstNum, '— (compter les lignes) —')}</select></label>
                <label>Afficher<select name="pct">${PCT.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label><label class="checkbox-line"><input type="checkbox" name="totals" checked> Totaux</label></div>
                <div class="xl-pv-prev" data-pv-prev></div>`,
            onOpen: d => { const f = d.querySelector('form') || d, prev = d.querySelector('[data-pv-prev]');
                const read = () => ({rows: Number(f.querySelector('[name=rows]').value), cols: Number(f.querySelector('[name=cols]').value), val: Number(f.querySelector('[name=val]').value), agg: f.querySelector('[name=agg]').value, pct: f.querySelector('[name=pct]').value, totals: f.querySelector('[name=totals]').checked});
                const draw = () => { const r = compute(t.header, t.rows, read()), m = r.matrix.slice(0, 12).map(row => row.slice(0, 8));
                    prev.innerHTML = `<p class="muted">Aperçu : ${r.rows} ligne${r.rows > 1 ? 's' : ''} × ${r.cols} colonne${r.cols > 1 ? 's' : ''}</p><table class="xl-pv-table">${m.map((row, i) => `<tr>${row.map((v, j) => `<${i === 0 || j === 0 ? 'th' : 'td'}>${esc(v == null ? '' : r.pct && i && j ? `${Math.round(v * 1000) / 10} %` : typeof v === 'number' ? v.toLocaleString('fr-FR') : v)}</${i === 0 || j === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</table>`; };
                f.addEventListener('change', draw); draw(); },
            onSubmit: f => {
                const o = {rows: Number(f.elements.rows.value), cols: Number(f.elements.cols.value), val: Number(f.elements.val.value), agg: f.elements.agg.value, pct: f.elements.pct.value, totals: f.elements.totals.checked};
                if (o.cols === o.rows) o.cols = -1; const src = ed.S(), res = compute(t.header, t.rows, o);
                ed.begin('Tableau croisé dynamique');
                const names = ed.wb.sheets.map(s => s.name), sh = S.newSheet(S.cleanSheetName(`TCD ${t.header[o.rows]}`.slice(0, 28), names));
                ed.wb.sheets.splice(ed.si + 1, 0, sh); writePivot(ed, sh, res, {...o, src: src.id, srcName: src.name, range: S.rangeStr(g)});
                ed.commit(); ed.showSheet(ed.si + 1); ed.render(); toast(`Tableau croisé créé : ${res.rows} × ${res.cols}. Données → « ↻ Actualiser le tableau croisé » pour le refaire.`);
            }});
    }
    function pivotRefresh(ed) {
        const S = X(), sh = ed.S(), pv = sh.pivot; if (!pv) return toast('Cette feuille n’est pas un tableau croisé : va sur sa feuille « TCD … ».');
        const si = ed.wb.sheets.findIndex(s => s.id === pv.src); if (si < 0) return toast('La feuille des données n’existe plus.', 'error');
        let g = S.parseRange(pv.range); const used = ed.calc.used(si); if (g && g.r1 < used.r - 1) g = {...g, r1: used.r - 1}; // des lignes ajoutées en bas comptent aussi
        const t = readTable(ed, g, si), res = compute(t.header, t.rows, pv);
        ed.begin('Actualiser le tableau croisé'); writePivot(ed, sh, res, {...pv, srcName: ed.wb.sheets[si].name, range: S.rangeStr(g)}); ed.commit(); ed.render();
        toast(`Tableau croisé actualisé (${res.rows} × ${res.cols}).`);
    }

    /* ── 📊 Graphique vivant : suit la sélection ── */
    const live = new WeakMap();
    function liveToggle(ed) {
        const old = live.get(ed); if (old) { old.box.remove(); live.delete(ed); return; }
        const host = ed.$('.xl-vpwrap') || ed.dlg; if (!host) return;
        const box = document.createElement('div'); box.className = 'xl-live'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Graphique vivant');
        box.innerHTML = `<div class="xl-live-h"><b>📊 Graphique vivant</b><select data-live-kind aria-label="Type de graphique"></select><button type="button" class="icon-button small" data-live-make title="En faire un diagramme lié à la plage">↗</button><button type="button" class="icon-button small" data-live-x title="Fermer" aria-label="Fermer">×</button></div><div class="xl-live-b" data-live-body></div><small class="muted" data-live-range></small>`;
        host.appendChild(box); const st = {box, kind: '', t: 0}; live.set(ed, st);
        box.addEventListener('click', e => { if (e.target.closest('[data-live-x]')) return liveToggle(ed); if (e.target.closest('[data-live-make]')) return ext.sheetChartMenu?.(ed, e.target.closest('button')); });
        box.addEventListener('change', e => { if (e.target.matches('[data-live-kind]')) { st.kind = e.target.value; liveDraw(ed); } });
        // déplacer la fenêtre en tirant sa barre
        box.querySelector('.xl-live-h').addEventListener('pointerdown', e => { if (e.target.closest('button, select')) return; const r0 = box.getBoundingClientRect(), p0 = host.getBoundingClientRect(), dx = e.clientX - r0.left, dy = e.clientY - r0.top;
            const mv = ev => { box.style.left = `${Math.max(0, Math.min(p0.width - 120, ev.clientX - p0.left - dx))}px`; box.style.top = `${Math.max(0, Math.min(p0.height - 60, ev.clientY - p0.top - dy))}px`; box.style.right = 'auto'; };
            const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); });
        liveDraw(ed);
    }
    function liveDraw(ed) {
        const st = live.get(ed); if (!st || !st.box.isConnected) { live.delete(ed); return; }
        clearTimeout(st.t); st.t = setTimeout(() => {
            const r = ext.sheetChartLive?.(ed, st.kind), body = st.box.querySelector('[data-live-body]'), sel = st.box.querySelector('[data-live-kind]');
            if (!r) { body.innerHTML = '<p class="muted">Choisis des cases avec des nombres (et leurs noms à gauche ou en haut) : le graphique se dessine ici.</p>'; st.box.querySelector('[data-live-range]').textContent = ''; return; }
            sel.innerHTML = r.kinds.map(k => `<option value="${esc(k.kind)}" ${k.kind === r.kind ? 'selected' : ''}>${esc(k.icon || '')} ${esc(k.label)}</option>`).join('');
            body.innerHTML = ext.diagramRender?.svg ? ext.diagramRender.svg({...r.spec, o: {...(r.spec.o || {}), title: '', source: ''}}, 360) : '';
            st.box.querySelector('[data-live-range]').textContent = `Plage ${r.range} · suit la sélection`;
        }, 120);
    }
    // la sélection et les chiffres qui changent : le graphique suit
    const hook = () => { const E = ext.tableurInternals?.Editor; if (!E || E.prototype.__livePlus) return !!E; E.prototype.__livePlus = true;
        const aS = E.prototype.afterSel, cm = E.prototype.commit;
        E.prototype.afterSel = function (...a) { const r = aS.apply(this, a); if (live.has(this)) liveDraw(this); return r; };
        E.prototype.commit = function (...a) { const r = cm.apply(this, a); if (live.has(this) && !this.tx) liveDraw(this); return r; };
        return true; };
    if (!hook()) document.addEventListener('DOMContentLoaded', hook, {once: true}); setTimeout(hook, 0);

    ext.sheetMenuExtra = ext.sheetMenuExtra || [];
    ext.sheetMenuExtra.push({menu: 'Données', cmd: 'pivot', label: '🔀 Tableau croisé dynamique…'}, {menu: 'Données', cmd: 'pivotrefresh', label: '↻ Actualiser le tableau croisé'}, {menu: 'Insertion', cmd: 'livechart', label: '📊 Graphique vivant (suit la sélection)'}, {menu: 'Affichage', cmd: 'livechart', label: '📊 Graphique vivant'});
    ext.sheetCommands = ext.sheetCommands || {};
    ext.sheetCommands.pivot = ed => pivotDialog(ed);
    ext.sheetCommands.pivotrefresh = ed => pivotRefresh(ed);
    ext.sheetCommands.livechart = ed => liveToggle(ed);
    void UI;
})(typeof window !== 'undefined' ? window : globalThis);
