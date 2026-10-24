/**
 * 🧾 Tableur — outils de données (branché sur heritage-tableur.js par ses crochets ext.sheetMenuExtra / ext.sheetCommands) :
 *  - ✨ Remplissage instantané : tape le résultat voulu sur une ou deux lignes (« Jean D. », « DUPONT Jean », « 1850 »…),
 *    l'app devine la règle à partir des autres colonnes de la ligne et remplit le reste de la colonne (↶ pour annuler) ;
 *  - Σ Sous-totaux : une nouvelle feuille rangée par groupe (commune, métier, décennie…), une ligne de total sous chaque groupe
 *    (formules, donc à jour) et le total général ; « ⊟ Plan » replie ou déplie le détail ;
 *  - 🎯 Valeur cible : quelle valeur mettre dans une case pour qu'une formule donne le résultat voulu ;
 *  - 📈 Mini-graphique : la formule MINIGRAPHIQUE(plage; type; couleur) posée dans les cases choisies (une par ligne).
 * Sans écran : ext.sheetTools.learnFill / applyFill (aussi require() dans Node, pour les essais).
 */
(function (root) {
    'use strict';
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const A = () => root.LCNDA_APP, X = () => root.LCNDA_SHEET;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (...a) => A()?.toast?.(...a);

    /* ═════════ ✨ Remplissage instantané (sans écran) ═════════
       Une ligne = les textes de ses autres colonnes ; un morceau = un mot d'une colonne (compté du début ou de la fin), ou toute la case,
       en l'état, EN MAJUSCULES, en minuscules, Avec Une Capitale, ou réduit à son initiale ; le reste est du texte écrit tel quel. */
    const SPLIT = /[\s,;/\-.()]+/;
    const TR = {id: s => s, up: s => s.toLocaleUpperCase('fr'), low: s => s.toLocaleLowerCase('fr'), cap: s => s.charAt(0).toLocaleUpperCase('fr') + s.slice(1).toLocaleLowerCase('fr'), ini: s => s.charAt(0).toLocaleUpperCase('fr')};
    const words = s => String(s ?? '').split(SPLIT).filter(Boolean);
    const pieceVal = (src, p) => { const s = String(src[p.j] ?? '').trim(); if (!s) return null; let w; if (p.t === 'all') w = s; else { const ws = words(s); w = p.t >= 0 ? ws[p.t] : ws[ws.length + p.t]; } return w == null ? null : TR[p.tr](w); };
    /** tous les programmes qui fabriquent « out » à partir de la ligne « src » (au plus « max ») */
    function programs(src, out, max = 400) {
        const pieces = [];
        src.forEach((v, j) => { const s = String(v ?? '').trim(); if (!s) return; const ws = words(s);
            for (const tr of Object.keys(TR)) { pieces.push({j, t: 'all', tr}); ws.forEach((_, i) => { pieces.push({j, t: i, tr}); pieces.push({j, t: i - ws.length, tr}); }); } });
        const res = [], memo = new Map();
        const go = pos => { if (pos === out.length) return [[]]; if (memo.has(pos)) return memo.get(pos); const acc = [];
            for (const p of pieces) { const v = pieceVal(src, p); if (!v || !out.startsWith(v, pos)) continue; for (const rest of go(pos + v.length)) { acc.push([p, ...rest]); if (acc.length > max) break; } if (acc.length > max) break; }
            if (acc.length < max) for (const rest of go(pos + 1)) { acc.push([{lit: out[pos]}, ...rest]); if (acc.length > max) break; }
            memo.set(pos, acc); return acc; };
        for (const pr of go(0)) { const merged = []; pr.forEach(x => { const last = merged[merged.length - 1]; if (x.lit != null && last?.lit != null) last.lit += x.lit; else merged.push(x.lit != null ? {lit: x.lit} : x); }); res.push(merged); }
        return res;
    }
    const run = (prog, src) => { let s = ''; for (const x of prog) { if (x.lit != null) s += x.lit; else { const v = pieceVal(src, x); if (v == null) return null; s += v; } } return s; };
    const cost = prog => prog.reduce((n, x) => n + (x.lit != null ? 3 * x.lit.length : x.tr === 'id' ? 1 : 1.2) + (x.t === 'all' ? 0 : typeof x.t === 'number' && x.t < 0 ? .1 : 0), 0);
    /** la règle qui marche pour tous les exemples [{src, out}] (la plus simple), ou null */
    function learnFill(examples) {
        if (!examples.length) return null; const first = examples[0];
        const cands = programs(first.src, String(first.out)).filter(p => p.some(x => x.lit == null)).filter(p => examples.every(e => run(p, e.src) === String(e.out)));
        return cands.sort((a, b) => cost(a) - cost(b))[0] || null;
    }
    const applyFill = (prog, src) => (prog ? run(prog, src) : null);
    ext.sheetTools = {learnFill, applyFill};
    if (typeof module === 'object' && module.exports) { module.exports = {learnFill, applyFill}; return; }

    /* ═════════ L'écran ═════════ */
    const rowVals = (ed, r, c0, c1, skip) => { const out = []; for (let c = c0; c <= c1; c++) out.push(c === skip ? null : (() => { const v = ed.calc.val(ed.si, r, c); return v == null || X().isErr(v) ? '' : X().formatValue(v, ed.wb.styles[ed.S().cells[X().addr(r, c)]?.s] || {}); })()); return out; };
    function flashFill(ed) {
        const S = X(), sh = ed.S(), c = ed.sel.c0, g = ed.region ? ed.region() : ed.selClip(), c0 = Math.min(g.c0, c), c1 = Math.max(g.c1, c), u = ed.calc.used(ed.si);
        const r0 = g.r0, r1 = Math.max(g.r1, Math.min(u.r - 1, r0 + 20000)), ex = [], todo = [];
        for (let r = r0; r <= r1; r++) { const raw = sh.cells[S.addr(r, c)]?.v, src = rowVals(ed, r, c0, c1, c); if (!src.some(Boolean)) continue;
            if (raw != null && raw !== '' && !S.isFormula(raw)) ex.push({r, src, out: String(raw)}); else if (raw == null || raw === '') todo.push({r, src}); }
        if (!ex.length) return toast('Écris le résultat voulu dans la première case de la colonne (par exemple « Jean D. »), puis relance ✨ Remplissage instantané.');
        // la ligne de titres ne sert pas d'exemple si une autre ligne en donne un
        const useEx = ex.length > 1 && ex[0].r === g.r0 ? ex.slice(1) : ex, prog = learnFill(useEx.slice(0, 4));
        if (!prog) return toast('Je ne trouve pas de règle qui marche pour tous les exemples : écris-en un de plus, ou un plus simple.', 'error');
        const plan = todo.filter(t => t.r > useEx[0].r - 1 || true).map(t => ({r: t.r, v: applyFill(prog, t.src)})).filter(x => x.v);
        if (!plan.length) return toast('Rien à remplir : la colonne est déjà pleine.');
        ed.begin('Remplissage instantané'); plan.forEach(({r, v}) => { const k = S.addr(r, c), old = sh.cells[k]; ed.put(sh, k, {...(old || {}), v}); }); ed.commit(); ed.render();
        const desc = prog.map(x => (x.lit != null ? `« ${x.lit} »` : `${x.tr === 'ini' ? 'initiale' : x.tr === 'up' ? 'MAJUSCULES' : x.tr === 'low' ? 'minuscules' : x.tr === 'cap' ? 'Capitale' : 'mot'} ${x.t === 'all' ? 'de' : `n°${x.t >= 0 ? x.t + 1 : `${-x.t} depuis la fin`} de`} ${S.colName(c0 + x.j)}`)).join(' + ');
        toast(`✨ ${A()?.plural ? A().plural(plan.length, 'case remplie', 'cases remplies') : plan.length + ' cases'} (règle : ${desc}). ↶ pour annuler.`, 'success');
    }

    /* ── Σ Sous-totaux et ⊟ plan ── */
    const FUNCS = [['SOMME', 'Somme'], ['NB', 'Nombre'], ['MOYENNE', 'Moyenne'], ['MIN', 'Plus petit'], ['MAX', 'Plus grand']];
    function subtotalDialog(ed) {
        const S = X(), g = ed.region ? ed.region() : ed.selClip(), m = S.matrix(ed.wb, ed.calc, ed.si, g); if (m.length < 3) return toast('Choisis un tableau avec une ligne de titres et des lignes de données.');
        const head = m[0].map((v, j) => (v == null || v === '' ? `Colonne ${S.colName(g.c0 + j)}` : String(v))), rows = m.slice(1);
        const numCols = head.map((_, j) => rows.some(r => typeof r[j] === 'number'));
        const groupGuess = head.findIndex((_, j) => !numCols[j] && new Set(rows.map(r => String(r[j] ?? ''))).size < rows.length);
        ext.openDialog({eyebrow: 'DONNÉES', title: 'Σ Sous-totaux', submitLabel: 'Créer les sous-totaux', wide: true,
            body: `<p class="muted">D’après <b>${esc(S.rangeStr(g))}</b>. Une nouvelle feuille : les lignes rangées par groupe, un total sous chaque groupe (formules), puis le total général. « ⊟ Plan » (menu Données) replie le détail.</p>
                <div class="form-grid"><label>À chaque changement de<select name="by">${head.map((h, j) => `<option value="${j}" ${j === Math.max(0, groupGuess) ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></label>
                <label>Calcul<select name="fn">${FUNCS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label></div>
                <fieldset><legend>Sur les colonnes</legend>${head.map((h, j) => `<label class="ui-check"><input type="checkbox" name="col" value="${j}" ${numCols[j] ? 'checked' : ''}> ${esc(h)}</label>`).join('')}</fieldset>`,
            onSubmit: f => {
                const by = Number(f.elements.by.value), fn = f.elements.fn.value, cols = [...f.querySelectorAll('[name=col]:checked')].map(x => Number(x.value)).filter(j => j !== by);
                if (!cols.length) { toast('Coche au moins une colonne à calculer.', 'error'); return false; }
                const groups = new Map(); rows.forEach(r => { const k = String(r[by] ?? '').trim() || '(vide)'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
                const keys = [...groups.keys()].sort((a, b) => (a === '(vide)') - (b === '(vide)') || a.localeCompare(b, 'fr', {numeric: true, sensitivity: 'base'}));
                ed.begin('Sous-totaux'); const names = ed.wb.sheets.map(s => s.name), sh = S.newSheet(S.cleanSheetName(`Sous-totaux ${head[by]}`.slice(0, 28), names)); ed.wb.sheets.splice(ed.si + 1, 0, sh); ed.meta(sh);
                const bold = S.styleId(ed.wb, {b: 1, fill: '#e8eefc'}), tot = S.styleId(ed.wb, {b: 1, fill: '#f3f4f6'}), grand = S.styleId(ed.wb, {b: 1, fill: '#dfe7f7'});
                head.forEach((h, j) => ed.put(sh, S.addr(0, j), {v: h, s: bold}));
                let r = 1; const detail = [], totRanges = cols.map(() => []);
                keys.forEach(k => { const list = groups.get(k), start = r; list.forEach(row => { row.forEach((v, j) => { if (v != null && v !== '') ed.put(sh, S.addr(r, j), {v: v instanceof S.SDate ? +v : v}); }); detail.push(r); r++; });
                    ed.put(sh, S.addr(r, by), {v: `Total ${k}`, s: tot}); cols.forEach((j, i) => { const rg = `${S.addr(start, j)}:${S.addr(r - 1, j)}`; totRanges[i].push(rg); ed.put(sh, S.addr(r, j), {v: `=${fn}(${rg})`, s: tot}); });
                    head.forEach((_, j) => { if (j !== by && !cols.includes(j)) ed.put(sh, S.addr(r, j), {v: null, s: tot}); }); r++; });
                ed.put(sh, S.addr(r, by), {v: 'Total général', s: grand}); cols.forEach((j, i) => ed.put(sh, S.addr(r, j), {v: totRanges[i].length <= 120 ? `=${fn}(${totRanges[i].join(';')})` : `=${fn}(${S.addr(1, j)}:${S.addr(r - 1, j)})`, s: grand}));
                sh.subtotal = {detail: detail.map(x => x + 1)}; sh.freeze = {r: 1, c: 0};
                ed.commit(); ed.showSheet(ed.si + 1); ed.render(); toast(`Σ ${keys.length} groupe${keys.length > 1 ? 's' : ''}. « ⊟ Plan » (menu Données) replie le détail.`, 'success');
            }});
    }
    function outlineToggle(ed) {
        const sh = ed.S(), d = sh.subtotal?.detail; if (!Array.isArray(d) || !d.length) return toast('Cette feuille n’a pas de sous-totaux : Données → Σ Sous-totaux… d’abord.');
        sh.rows = sh.rows || {}; const hide = !d.some(n => sh.rows[String(n)]?.hidden);
        ed.begin(hide ? 'Replier le détail' : 'Déplier le détail'); ed.meta(sh);
        d.forEach(n => { const k = String(n), x = {...(sh.rows[k] || {})}; if (hide) x.hidden = true; else delete x.hidden; if (Object.keys(x).length) sh.rows[k] = x; else delete sh.rows[k]; });
        ed.commit(); ed.render(); toast(hide ? '⊟ Détail replié : seuls les totaux restent.' : '⊞ Détail déplié.');
    }

    /* ── 🎯 Valeur cible ── */
    function goalSeek(ed) {
        const S = X(), sh = ed.S(), here = S.addr(ed.sel.r0, ed.sel.c0), isF = S.isFormula(sh.cells[here]?.v);
        ext.openDialog({eyebrow: 'DONNÉES', title: '🎯 Valeur cible', submitLabel: 'Chercher',
            body: `<p class="muted">L’app essaie des valeurs dans « la case à changer » jusqu’à ce que la formule donne le résultat voulu. Ex. : à quel âge s’est-il marié pour que la différence d’âge soit 7 ans ?</p>
                <div class="form-grid"><label>La formule de la case<input name="f" value="${esc(isF ? here : '')}" placeholder="C5"></label><label>Doit donner<input name="t" type="number" step="any" required></label>
                <label>En changeant la case<input name="x" value="${esc(isF ? '' : here)}" placeholder="B2"></label></div>`,
            onSubmit: f => {
                const pf = S.parseAddr(f.elements.f.value), px = S.parseAddr(f.elements.x.value), target = Number(String(f.elements.t.value).replace(',', '.'));
                if (!pf || !px || !Number.isFinite(target)) { toast('Écris deux adresses (ex. C5 et B2) et le résultat voulu.', 'error'); return false; }
                if (!S.isFormula(sh.cells[S.addr(...pf)]?.v)) { toast('La première case doit contenir une formule.', 'error'); return false; }
                const wb2 = JSON.parse(JSON.stringify(ed.wb)), kx = S.addr(...px), F = x => { wb2.sheets[ed.si].cells[kx] = {...(wb2.sheets[ed.si].cells[kx] || {}), v: x}; const v = new S.Calc(wb2).val(ed.si, pf[0], pf[1]); return typeof v === 'number' ? v - target : NaN; };
                const x0 = Number(ed.calc.val(ed.si, px[0], px[1])) || 0; let a = x0, b = x0 + (Math.abs(x0) > 1 ? x0 * .1 : 1), fa = F(a), fb = F(b), best = null;
                for (let i = 0; i < 80 && Number.isFinite(fa) && Number.isFinite(fb); i++) { if (Math.abs(fb) < 1e-9) { best = b; break; } const d = fb - fa; if (!d) { b += 1; fb = F(b); continue; } const c = b - fb * (b - a) / d; a = b; fa = fb; b = c; fb = F(b); }
                if (best == null && Number.isFinite(fb) && Math.abs(fb) < 1e-6 * Math.max(1, Math.abs(target))) best = b;
                if (best == null) { toast('Pas de valeur trouvée : la formule ne dépend peut-être pas de cette case, ou ne peut pas atteindre ce résultat.', 'error'); return false; }
                const val = Math.round(best * 1e9) / 1e9; ed.begin('Valeur cible'); ed.put(sh, kx, {...(sh.cells[kx] || {}), v: val}); ed.commit(); ed.render();
                toast(`🎯 ${S.addr(...px)} = ${String(val).replace('.', ',')} : la formule donne ${String(target).replace('.', ',')}. ↶ pour annuler.`, 'success');
            }});
    }

    /* ── 📈 Mini-graphique ── */
    function sparkDialog(ed) {
        const S = X(), s = ed.selClip(), sh = ed.S();
        // la plage proposée : les nombres à gauche de la case, sur la même ligne
        let c1 = s.c0 - 1; while (c1 >= 0 && typeof ed.calc.val(ed.si, s.r0, c1) !== 'number') c1--; let c0 = c1; while (c0 > 0 && typeof ed.calc.val(ed.si, s.r0, c0 - 1) === 'number') c0--;
        const guess = c1 >= 0 ? `${S.addr(s.r0, c0)}:${S.addr(s.r0, c1)}` : '';
        ext.openDialog({eyebrow: 'INSERTION', title: '📈 Mini-graphique', submitLabel: 'Poser',
            body: `<p class="muted">Un petit graphique dans la case, qui suit les chiffres. Plusieurs lignes choisies : un graphique par ligne (la plage descend avec elles).</p>
                <div class="form-grid"><label>Les nombres (plage de la 1re ligne)<input name="rg" value="${esc(guess)}" placeholder="B2:F2"></label>
                <label>Dessin<select name="k"><option value="courbe">〰 Courbe</option><option value="barres">▮ Barres</option><option value="gagné">± Gagné / perdu</option></select></label>
                <label>Couleur<input type="color" name="col" value="#0066cc"></label></div>`,
            onSubmit: f => { const g = S.parseRange(f.elements.rg.value); if (!g) { toast('Écris une plage, par exemple B2:F2.', 'error'); return false; }
                ed.begin('Mini-graphique'); for (let r = s.r0; r <= Math.min(s.r1, s.r0 + 2000); r++) { const d = r - s.r0, k = S.addr(r, s.c0); ed.put(sh, k, {...(sh.cells[k] || {}), v: `=MINIGRAPHIQUE(${S.rangeStr({r0: g.r0 + d, c0: g.c0, r1: g.r1 + d, c1: g.c1})};"${f.elements.k.value}";"${f.elements.col.value}")`}); }
                ed.commit(); ed.render(); }});
    }

    ext.sheetMenuExtra = ext.sheetMenuExtra || [];
    ext.sheetMenuExtra.push({menu: 'Données', cmd: 'flashfill', label: '✨ Remplissage instantané'}, {menu: 'Données', cmd: 'subtotals', label: 'Σ Sous-totaux…'}, {menu: 'Données', cmd: 'outline', label: '⊟ Plan : replier / déplier le détail'},
        {menu: 'Données', cmd: 'goalseek', label: '🎯 Valeur cible…'}, {menu: 'Insertion', cmd: 'sparkline', label: '📈 Mini-graphique…'});
    ext.sheetCommands = ext.sheetCommands || {};
    Object.assign(ext.sheetCommands, {flashfill: ed => flashFill(ed), subtotals: ed => subtotalDialog(ed), outline: ed => outlineToggle(ed), goalseek: ed => goalSeek(ed), sparkline: ed => sparkDialog(ed)});
})(typeof window !== 'undefined' ? window : globalThis);
