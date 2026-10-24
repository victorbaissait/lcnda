/**
 * 🧾 Tableur : Listes → 🛠️ Outils de modification → « 🧾 Tableur » (maquette validée « 🧾 Tableur », écrans A, B, C, D, F, H, J).
 * Un classeur à plusieurs feuilles : barre E1 avec menus, barre d'outils réglable (⚙️ Personnaliser), barre de formule avec
 * la liste des fonctions et l'aide pendant la frappe, grille « virtuelle » (seules les cases visibles sont dessinées : 10 000
 * lignes défilent sans gel), panneau E2, onglets des feuilles en bas, barre d'état (somme, moyenne, nombre), ↶ ↷.
 * Le calcul, les fichiers (CSV, TSV, XLSX, ODS, JSON) et le ZIP sont dans le moteur commun : app-tableur-engine.js (LCNDA_SHEET).
 * Classeurs gardés en base : lib/workbooks.php (table workbooks). Styles : assets/css/tableur.css.
 * Vague 2 : « 🧾 Modifier les données » des autres outils, « 🎯 Préparer pour… », « 📊 Graphique ▾ » lié à une plage :
 * heritage-tableur-cibles.js (ext.sheetTargets, ext.openSheetEditor, ext.sheetLink) ; ici seulement ctx.back, ctx.select, les crochets
 * ext.sheetMenuExtra / ext.sheetCommands / ext.sheetChartMenu et l'évènement « lcnda:workbook-saved ».
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const X = () => window.LCNDA_SHEET;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => (A()?.escapeHtml ? A().escapeHtml(v ?? '') : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const toast = (...a) => A().toast(...a);
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const plural = (n, w) => (A()?.plural ? A().plural(n, w) : `${n} ${w}${n > 1 ? 's' : ''}`);
    const fmtN = n => (Number.isFinite(n) ? n.toLocaleString('fr-FR', {maximumFractionDigits: 2}) : '');
    const DEF_W = 92, DEF_H = 24, HH = 24, RW = 46;
    const PREF_KEY = 'genealogie-tableur';
    const prefs = () => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p && typeof p === 'object' ? p : {}; } catch (_) { return {}; } };
    const setPrefs = p => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (_) {} };
    const pref = (k, d) => { const v = prefs()[k]; return v === undefined ? d : v; };
    const cssFont = f => { const v = String(f || '').replace(/[^\w\s,'\-À-ÿ.]/g, '').trim(); return v ? `'${v.replace(/'/g, '')}', sans-serif` : ''; };
    const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    const kbd = k => (A()?.keys?.text ? A().keys.text(k) : k);
    const FORMATS = [['', 'Automatique'], ['num', 'Nombre 0,00'], ['int', 'Nombre entier'], ['eur', 'Monnaie (€)'], ['pct', 'Pourcentage'], ['date', 'Date courte'], ['actdate', 'Date d’acte'], ['text', 'Texte']];

    /* ═════════ Modèles de classeurs (écran H) ═════════ */
    const S = () => X();
    function bookFrom(sheets) {
        const wb = S().newWorkbook(); wb.sheets = [];
        sheets.forEach(def => {
            const sh = S().newSheet(def.name); sh.cells = S().rowsToCells(def.rows, {r0: def.r0 || 0});
            Object.entries(def.formulas || {}).forEach(([k, f]) => { sh.cells[k] = {v: f}; });
            (def.bold || []).forEach(k => { const c = sh.cells[k] = sh.cells[k] || {v: null}; c.s = S().styleId(wb, {...(wb.styles[c.s] || {}), b: 1}); });
            Object.entries(def.styles || {}).forEach(([rng, st]) => { const g = S().parseRange(rng); for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) { const k = S().addr(r, c), cell = sh.cells[k] = sh.cells[k] || {v: null}; cell.s = S().styleId(wb, {...(wb.styles[cell.s] || {}), ...st}); } });
            Object.assign(sh.cols, def.cols || {}); sh.freeze = def.freeze || {r: 0, c: 0}; sh.dv = def.dv || []; sh.cf = def.cf || []; if (def.zebra) sh.zebra = true;
            wb.sheets.push(sh);
        });
        return S().normalize(wb);
    }
    const head = cols => ({bold: cols.map((_, i) => S().addr(0, i)), styles: {[`A1:${S().addr(0, cols.length - 1)}`]: {fill: '#e8eef7', b: 1}}});
    const TEMPLATES = [
        {key: 'census', icon: '🏠', name: 'Relevé de recensement', hint: 'colonnes de l’année · foyers · « Né(e) vers » calculé', make: () => bookFrom([{name: 'Relevé', r0: 0,
            rows: [['Commune', '', 'Année', 1836], [], ['N° maison', 'N° foyer', 'Nom', 'Prénoms', 'Âge', 'Né(e) vers', 'Profession', 'Lien avec le chef', 'Nationalité', 'Observations']],
            formulas: Object.fromEntries(Array.from({length: 40}, (_, i) => [`F${i + 4}`, `=SI(E${i + 4}="";"";$D$1-E${i + 4})`])),
            bold: ['A1', 'C1'], styles: {'A3:J3': {fill: '#e8eef7', b: 1}, 'D1': {fill: '#fff1a8', b: 1}}, cols: {C: {w: 130}, D: {w: 130}, G: {w: 130}, H: {w: 130}, J: {w: 180}}, freeze: {r: 3, c: 0},
            dv: [{range: 'H4:H400', kind: 'list', list: ['chef', 'épouse', 'fils', 'fille', 'père', 'mère', 'domestique', 'pensionnaire', 'neveu', 'nièce']}]}])},
        {key: 'parish', icon: '⛪', name: 'Registre paroissial', hint: 'baptêmes, mariages, sépultures', make: () => { const cols = ['Date', 'Acte', 'Nom', 'Prénom', 'Père', 'Mère', 'Parrain / témoin', 'Marraine', 'Lieu', 'Cote', 'Notes']; return bookFrom([{name: 'Registre', rows: [cols], ...head(cols), cols: {A: {w: 120}, C: {w: 120}, E: {w: 140}, F: {w: 140}, G: {w: 140}, H: {w: 140}, K: {w: 200}}, freeze: {r: 1, c: 0}, dv: [{range: 'B2:B2000', kind: 'list', list: ['Baptême', 'Mariage', 'Sépulture', 'Naissance', 'Décès']}], zebra: true}]); }},
        {key: 'budget', icon: '💶', name: 'Budget de la recherche', hint: 'actes, déplacements, abonnements', make: () => bookFrom([{name: 'Budget', rows: [['Poste', 'Date', 'Montant', 'Catégorie', 'Remarque'], ['Acte de mariage (AD)', '', 4.5, 'Actes', ''], ['Abonnement en ligne', '', 119.9, 'Abonnements', ''], [], [], [], [], [], [], [], ['Total']],
            formulas: {C11: '=SOMME(C2:C10)', C12: '=SOMME.SI(D2:D10;"Actes";C2:C10)'}, ...head(['', '', '', '', '']), bold: ['A1', 'B1', 'C1', 'D1', 'E1', 'A11', 'C11'], styles: {'A1:E1': {fill: '#e8eef7', b: 1}, 'C2:C12': {fmt: 'eur'}, 'C11': {fmt: 'eur', b: 1, fill: '#fff1a8'}}, cols: {A: {w: 200}, B: {w: 110}, D: {w: 130}, E: {w: 200}}, freeze: {r: 1, c: 0},
            dv: [{range: 'D2:D10', kind: 'list', list: ['Actes', 'Déplacements', 'Abonnements', 'Copies', 'Livres', 'Autre']}]}])},
        {key: 'mail', icon: '✉️', name: 'Suivi des courriers', hint: 'envoyé, relancé, réponse', make: () => { const cols = ['Destinataire', 'Objet', 'Envoyé le', 'Relancé le', 'Réponse le', 'État', 'Coût', 'Notes']; return bookFrom([{name: 'Courriers', rows: [cols], ...head(cols), styles: {'A1:H1': {fill: '#e8eef7', b: 1}, 'G2:G200': {fmt: 'eur'}}, cols: {A: {w: 180}, B: {w: 200}, H: {w: 200}}, freeze: {r: 1, c: 0},
            dv: [{range: 'F2:F200', kind: 'list', list: ['Préparé', 'Envoyé', 'Relancé', 'Répondu', 'Sans réponse']}], cf: [{range: 'F2:F200', op: '=', v: 'Répondu', style: {fill: '#d8f3dc'}}, {range: 'F2:F200', op: '=', v: 'Sans réponse', style: {fill: '#ffd6d6'}}]}]); }},
        {key: 'tree', icon: '🌳', name: 'Arbre en tableau', hint: 'Sosa, génération, côté, âge', make: () => bookFrom([{name: 'Sosa', rows: [['Sosa', 'Génération', 'Côté', 'Nom', 'Prénom', 'Naissance', 'Lieu', 'Décès', 'Âge'], ...Array.from({length: 15}, (_, i) => [i + 1])],
            formulas: Object.fromEntries(Array.from({length: 15}, (_, i) => [[`B${i + 2}`, `=SOSA.GENERATION(A${i + 2})`], [`C${i + 2}`, `=SOSA.COTE(A${i + 2})`], [`I${i + 2}`, `=SI(OU(F${i + 2}="";H${i + 2}="");"";AGE(F${i + 2};H${i + 2}))`]]).flat()),
            ...head(['', '', '', '', '', '', '', '', '']), styles: {'A1:I1': {fill: '#e8eef7', b: 1}}, cols: {D: {w: 130}, E: {w: 130}, F: {w: 130}, G: {w: 140}, H: {w: 130}}, freeze: {r: 1, c: 1}}])},
        {key: 'probate', icon: '⚖️', name: 'Inventaire après décès', hint: 'objets, prix, total en livres', make: () => bookFrom([{name: 'Inventaire', rows: [['Objet', 'Pièce', 'Livres', 'Sols', 'Deniers', 'En deniers'], [], [], [], [], [], [], [], [], [], ['Total']],
            formulas: {...Object.fromEntries(Array.from({length: 9}, (_, i) => [`F${i + 2}`, `=SI(NBVAL(C${i + 2}:E${i + 2})=0;"";C${i + 2}*240+D${i + 2}*12+E${i + 2})`])), F11: '=SOMME(F2:F10)', C12: '=ENT(F11/240)', D12: '=ENT(MOD(F11;240)/12)', E12: '=MOD(F11;12)', A12: 'Soit (livres, sols, deniers)'},
            bold: ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'A11', 'F11'], styles: {'A1:F1': {fill: '#e8eef7', b: 1}}, cols: {A: {w: 220}, B: {w: 120}}, freeze: {r: 1, c: 0}}])},
        {key: 'matricule', icon: '🎖', name: 'Registre matricule', hint: 'classe, signalement, campagnes', make: () => { const cols = ['Classe', 'N° matricule', 'Nom', 'Prénoms', 'Né le', 'à', 'Taille', 'Cheveux', 'Yeux', 'Profession', 'Campagnes', 'Blessures', 'Décorations']; return bookFrom([{name: 'Matricules', rows: [cols], ...head(cols), styles: {'A1:M1': {fill: '#e8eef7', b: 1}}, cols: {C: {w: 120}, D: {w: 130}, F: {w: 130}, J: {w: 130}, K: {w: 200}}, freeze: {r: 1, c: 2}}]); }},
    ];
    ext.sheetTemplates = TEMPLATES; // vague 2 : « Préparer pour… » pourra en ajouter

    /* ═════════ Ouvrir un classeur ═════════ */
    /**
     * openWorkbook({id, data, name, kind, onSaved, onClose}) : le tableur en grand.
     * data : un classeur déjà prêt (modèle, import, vague 2 : données d'un autre outil) ; sinon id (lu en base) ; sinon un classeur vide.
     */
    async function openWorkbook(ctx = {}) {
        if (!X()) return toast('Le moteur du tableur n’est pas chargé.', 'error');
        let id = 0, name = ctx.name || 'Mon classeur', kind = ctx.kind === 'template' ? 'template' : 'book', wb;
        let rev = '';
        if (ctx.id) { try { const r = await api('workbook', {id: ctx.id}); id = r.id; name = r.name; kind = r.kind; rev = r.rev || ''; wb = X().normalize(r.data); } catch (e) { return toast(e.message, 'error'); } }
        else wb = X().normalize(ctx.data || X().newWorkbook());
        return new Editor({...ctx, id, name, kind, wb, rev}).open();
    }
    ext.openWorkbook = openWorkbook;
    ext.openSheetEditor = openWorkbook; // remplacé par heritage-tableur-cibles.js : openSheetEditor({target, data, onSave}) avec « ✓ Enregistrer et revenir »

    /* ═════════ L'éditeur ═════════ */
    class Editor {
        constructor(o) {
            Object.assign(this, {id: o.id, name: o.name, kind: o.kind, wb: o.wb, ctx: o, rev: o.rev || ''});
            this.si = Math.max(0, Math.min(this.wb.sheets.length - 1, this.wb.active || 0));
            this.calc = new (X().Calc)(this.wb);
            this.undoStack = []; this.redoStack = []; this.tx = null; this.dirty = !!o.data && !o.id && !o.back; this.savedAt = 0; // « Modifier les données » : rien de changé tant qu'on n'a rien tapé
            this.sel = {r0: 0, c0: 0, r1: 0, c1: 0}; this.act = [0, 0]; this.anchor = [0, 0];
            this.edit = null; this.refPick = null; this.clip = null; this.hiddenRows = new Map(); this.showFormulas = false;
            this.view = new Map(); this.win = null; this.geo = null;
        }
        S() { return this.wb.sheets[this.si]; }
        /* ── historique : chaque action est une « transaction » qui sait se défaire ── */
        begin(label) { if (this.tx) { this.tx.depth++; return this.tx; } this.tx = {label, depth: 1, cells: new Map(), swaps: new Map(), metas: new Map(), sheets: this.wb.sheets.slice(), names: JSON.stringify(this.wb.names || {}), si: this.si, sel: {...this.sel}, structural: false, changed: new Map()}; return this.tx; }
        note(sh, k) { const p = X().parseAddr(k); if (!p) return; const si = this.wb.sheets.indexOf(sh); if (si < 0) return; let l = this.tx.changed.get(sh); if (!l) this.tx.changed.set(sh, l = []); l.push(p); }
        put(sh, k, cell) { // une cellule (null = vide)
            const t = this.tx; const key = sh.id + '|' + k;
            if (!t.cells.has(key)) t.cells.set(key, {sh, k, before: sh.cells[k] ? {...sh.cells[k]} : null});
            if (cell == null || (cell.v == null && !cell.s && !cell.ref && !cell.note)) delete sh.cells[k]; else sh.cells[k] = cell;
            this.note(sh, k);
        }
        swap(sh, cells) { const t = this.tx; if (!t.swaps.has(sh)) t.swaps.set(sh, {before: sh.cells}); sh.cells = cells; t.structural = true; }
        meta(sh) { const t = this.tx; if (!t.metas.has(sh)) t.metas.set(sh, {before: metaOf(sh)}); return sh; }
        commit() {
            const t = this.tx; if (!t || --t.depth > 0) return;
            this.tx = null;
            t.cells.forEach(x => { x.after = x.sh.cells[x.k] ? {...x.sh.cells[x.k]} : null; });
            t.swaps.forEach((x, sh) => { x.after = sh.cells; });
            t.metas.forEach((x, sh) => { x.after = metaOf(sh); });
            t.sheetsAfter = this.wb.sheets.slice(); t.namesAfter = JSON.stringify(this.wb.names || {}); t.siAfter = this.si; t.selAfter = {...this.sel};
            const sheetsChanged = t.sheetsAfter.length !== t.sheets.length || t.sheetsAfter.some((s, i) => s !== t.sheets[i]);
            const namesChanged = t.namesAfter !== t.names || [...t.metas.values()].some(x => JSON.parse(x.before).name !== JSON.parse(x.after).name);
            t.structural = t.structural || sheetsChanged || namesChanged;
            if (!t.cells.size && !t.swaps.size && !sheetsChanged && !namesChanged && ![...t.metas.values()].some(x => x.before !== x.after)) return;
            this.undoStack.push(t); if (this.undoStack.length > 300) this.undoStack.shift(); this.redoStack = [];
            this.recalc(t); this.touch();
            return t;
        }
        /** recalcule ce qui a changé (tout, si les feuilles ont bougé) */
        recalc(t) {
            this.wb.sheets.forEach(sh => { sh._used = null; });
            if (t.structural) this.calc.reset();
            else t.changed.forEach((list, sh) => { const si = this.wb.sheets.indexOf(sh); if (si >= 0) this.calc.setCellChanged(si, list); });
            this.geo = null; this.win = null;
        }
        apply(t, dir) { // dir : 'before' (défaire) ou 'after' (refaire)
            const changed = new Map();
            t.swaps.forEach((x, sh) => { sh.cells = x[dir]; });
            t.cells.forEach(x => { if (x[dir]) x.sh.cells[x.k] = {...x[dir]}; else delete x.sh.cells[x.k]; const p = X().parseAddr(x.k); let l = changed.get(x.sh); if (!l) changed.set(x.sh, l = []); l.push(p); });
            t.metas.forEach((x, sh) => { Object.assign(sh, JSON.parse(x[dir])); if (!JSON.parse(x[dir]).filter) delete sh.filter; if (!JSON.parse(x[dir]).color) delete sh.color; if (!JSON.parse(x[dir]).link) delete sh.link; if (!JSON.parse(x[dir]).pivot) delete sh.pivot; });
            this.wb.sheets = (dir === 'before' ? t.sheets : t.sheetsAfter).slice();
            this.wb.names = JSON.parse(dir === 'before' ? t.names : t.namesAfter);
            this.si = Math.min(this.wb.sheets.length - 1, dir === 'before' ? t.si : t.siAfter);
            const s = dir === 'before' ? t.sel : t.selAfter; this.setSel(s.r0, s.c0, s.r1, s.c1, true);
            this.recalc({structural: t.structural, changed});
            this.touch(); this.hiddenRows.clear(); this.refreshFilter();
        }
        undo() { if (this.edit) return; const t = this.undoStack.pop(); if (!t) return toast('Rien à annuler.'); this.apply(t, 'before'); this.redoStack.push(t); this.render(); }
        redo() { if (this.edit) return; const t = this.redoStack.pop(); if (!t) return toast('Rien à rétablir.'); this.apply(t, 'after'); this.undoStack.push(t); this.render(); }
        /** H7 : un message avec « ↶ Annuler » pour la dernière action */
        undoable(msg, t) { A().undoToast(msg, {undo: () => { if (this.undoStack[this.undoStack.length - 1] !== t) throw new Error('d’autres changements ont suivi : utilise ↶ (' + kbd('⌘Z') + ')'); this.undo(); }, redo: () => this.redo()}); }
        touch() { this.dirty = true; UI()?.savedStatus?.(this.dlg, 'dirty'); this.histBtns(); }
        histBtns() { const u = this.$('[data-ui-cmd="undo"]'), r = this.$('[data-ui-cmd="redo"]'); if (u) u.disabled = !this.undoStack.length; if (r) r.disabled = !this.redoStack.length; }
        $(s) { return this.dlg?.querySelector(s); }

        /* ── géométrie : largeurs, hauteurs, lignes cachées (masquées ou filtrées) ── */
        colW(c) { const x = this.S().cols[X().colName(c)]; return x?.hidden ? 0 : (x?.w || DEF_W); }
        rowH(r) { if (this.hiddenRows.get(this.S().id)?.has(r)) return 0; const x = this.S().rows[String(r + 1)]; return x?.hidden ? 0 : (x?.h || DEF_H); }
        geometry() {
            if (this.geo && this.geo.si === this.si) return this.geo;
            const sh = this.S(), u = this.calc.used(this.si), nR = Math.min(X().LIMITS.rows, Math.max(u.r + 60, 120, this.act[0] + 30, this.sel.r1 + 30, this.extraR || 0)), nC = Math.min(X().LIMITS.cols, Math.max(u.c + 6, 26, this.act[1] + 6, this.sel.c1 + 6, this.extraC || 0));
            const colX = new Float64Array(nC + 1), rowY = new Float64Array(nR + 1);
            for (let c = 0; c < nC; c++) colX[c + 1] = colX[c] + this.colW(c);
            for (let r = 0; r < nR; r++) rowY[r + 1] = rowY[r] + this.rowH(r);
            const fz = sh.freeze || {r: 0, c: 0}, fr = Math.min(fz.r || 0, nR), fc = Math.min(fz.c || 0, nC);
            const merges = [], mAt = new Map(), covered = new Set();
            (sh.merges || []).forEach(m => { const g = X().parseRange(m); if (!g) return; merges.push(g); mAt.set(g.r0 + ':' + g.c0, g); for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) if (r !== g.r0 || c !== g.c0) covered.add(r + ':' + c); });
            this.geo = {si: this.si, nR, nC, colX, rowY, W: colX[nC], H: rowY[nR], fr, fc, frH: rowY[fr], fcW: colX[fc], merges, mAt, covered};
            return this.geo;
        }
        rowAt(y) { const a = this.geometry().rowY; let lo = 0, hi = a.length - 2; if (y <= 0) return 0; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m] <= y) lo = m; else hi = m - 1; } return lo; }
        colAt(x) { const a = this.geometry().colX; let lo = 0, hi = a.length - 2; if (x <= 0) return 0; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m] <= x) lo = m; else hi = m - 1; } return lo; }
        mergeOf(r, c) { const g = this.geometry(); for (const m of g.merges) if (r >= m.r0 && r <= m.r1 && c >= m.c0 && c <= m.c1) return m; return null; }
    }
    const metaOf = sh => JSON.stringify({name: sh.name, color: sh.color || '', cols: sh.cols, rows: sh.rows, merges: sh.merges, freeze: sh.freeze, cf: sh.cf, dv: sh.dv, filter: sh.filter || null, hidden: !!sh.hidden, zebra: !!sh.zebra, link: sh.link || null, pivot: sh.pivot || null}); // link : plage tenue à jour (heritage-tableur-base.js)

    /* ═════════ Les menus du haut (E1) : chaque ligne a sa commande (data-xl-cmd), réglable dans les raccourcis ═════════ */
    const M = (cmd, label, key = '') => ({cmd, label, key});
    const MENUS = [
        ['Fichier', [M('new', '＋ Nouveau classeur'), M('template', '📋 Partir d’un modèle…'), '-', M('save', '💾 Enregistrer', '⌘S'), M('saveas', 'Enregistrer une copie…'), M('savetpl', 'Enregistrer comme modèle…'), '-', M('import', '⤒ Importer un tableau…', '⌘O'), M('export', '⤓ Exporter…', '⇧⌘E'), M('print', '🖨 Imprimer…', '⌘P'), '-', M('settings', '⚙️ Réglages du tableur…'), M('close', 'Fermer')]],
        ['Édition', [M('undo', '↶ Annuler', '⌘Z'), M('redo', '↷ Rétablir', '⇧⌘Z'), '-', M('cut', 'Couper', '⌘X'), M('copy', 'Copier', '⌘C'), M('paste', 'Coller', '⌘V'), M('pastevalues', 'Coller les valeurs seulement', '⇧⌘V'), '-', M('clear', 'Effacer le contenu', '⌫'), M('clearall', 'Effacer tout (contenu et mise en forme)'), M('selectall', 'Tout sélectionner', '⌘A'), '-', M('filldown', 'Recopier vers le bas', '⌘D'), M('fillright', 'Recopier vers la droite', '⌘R'), M('find', '🔍 Rechercher et remplacer…', '⌘F')]],
        ['Insertion', [M('rowabove', 'Ligne au-dessus'), M('rowbelow', 'Ligne en dessous'), M('colleft', 'Colonne à gauche'), M('colright', 'Colonne à droite'), M('newsheet', '＋ Nouvelle feuille'), '-', M('fn', 'ƒ Fonction…', '⇧F3'), M('autosum', 'Σ Somme automatique', '⌥='), M('today', '📅 Date du jour', '⌘;'), M('name', 'Nom pour la plage…'), M('comment', '💬 Note sur la cellule…'), '-', M('person', '👤 Une personne de la base', '⌘K'), M('place', '📍 Un lieu de la base'), '-', M('chart', '📊 Graphique depuis la sélection')]],
        ['Format', [M('bold', 'Gras', '⌘B'), M('italic', 'Italique', '⌘I'), M('underline', 'Souligné', '⌘U'), M('strike', 'Barré'), '-', ...FORMATS.map(([k, l]) => M('fmt:' + k, l)), M('dec+', 'Une décimale de plus'), M('dec-', 'Une décimale de moins'), '-', M('wrap', '↵ Renvoi à la ligne'), M('merge', '⊞ Fusionner / séparer'), M('al:left', 'Aligner à gauche'), M('al:center', 'Centrer'), M('al:right', 'Aligner à droite'), '-', M('bd:all', '▦ Bordures : tout'), M('bd:out', '▭ Bordures : contour'), M('bd:bottom', '▁ Bordure du bas'), M('bd:none', 'Sans bordure'), '-', M('colwidth', 'Largeur de colonne…'), M('rowheight', 'Hauteur de ligne…'), M('autofit', 'Ajuster la largeur au contenu'), M('hiderows', 'Masquer les lignes'), M('hidecols', 'Masquer les colonnes'), M('showall', 'Tout remontrer'), '-', M('cf', 'Mise en forme conditionnelle…'), M('zebra', 'Une ligne sur deux'), M('clearfmt', 'Effacer la mise en forme')]],
        ['Données', [M('sortaz', '↕ Trier A → Z'), M('sortza', '↕ Trier Z → A'), M('sort', 'Trier sur plusieurs colonnes…'), M('filter', '⚲ Filtrer', '⇧⌘L'), '-', M('dedupe', 'Supprimer les doublons…'), M('split', 'Convertir le texte en colonnes…'), M('validate', 'Validation des données…'), M('trim', 'Retirer les espaces en trop')]],
        ['Affichage', [M('fz:row', 'Figer la 1re ligne'), M('fz:col', 'Figer la 1re colonne'), M('fz:here', 'Figer jusqu’à la cellule choisie'), M('fz:none', 'Libérer les volets'), '-', M('panel', 'Panneau de droite'), M('formulas', 'Montrer les formules', '⌘`'), M('gridlines', 'Quadrillage'), '-', M('keys', '⌨️ Raccourcis du tableur…'), M('help', '❓ Aide (FAQ)')]],
    ];
    // ext.sheetMenuExtra : [{menu: 'Données', cmd, label, key}] — des lignes ajoutées par d'autres fichiers (heritage-tableur-cibles.js…), leur commande dans ext.sheetCommands
    const menuItems = (title, base) => { const more = (ext.sheetMenuExtra || []).filter(x => x && x.menu === title && x.cmd); return more.length ? [...base, '-', ...more.map(x => M(x.cmd, x.label, x.key || ''))] : base; };
    const menusHtml = () => MENUS.map(([title, base]) => [title, menuItems(title, base)]).map(([title, items]) => `<details class="xl-menu" data-xl-menu="${esc(title)}"><summary>${esc(title)}</summary><div class="xl-menu-list" role="menu">${items.map(it => (it === '-' ? '<hr>' : `<button type="button" role="menuitem" data-xl-cmd="${esc(it.cmd)}"><span>${esc(it.label)}</span>${it.key ? `<kbd>${esc(kbd(it.key))}</kbd>` : ''}</button>`)).join('')}</div></details>`).join('');
    const toolsHtml = () => toolsHtml0().replace(/<span class="xl-g" data-tb="([\w-]+)" data-tb-label="([^"]*)"/g, (m, k, l) => `${m} data-tbg="xl-g-${k}" data-tbg-label="Barre d’outils · ${l}"`); // chaque bouton d'un groupe se range aussi un par un (⚙️ Personnaliser)
    const toolsHtml0 = () => `<div class="xl-tools" data-tbg="xl-tools" data-tbg-label="Barre d’outils">
        <span class="xl-g" data-tb="text" data-tb-label="Police et gras"><button type="button" class="icon-button small" data-xl-cmd="bold" title="Gras" data-shortcut="⌘B"><b>G</b></button><button type="button" class="icon-button small" data-xl-cmd="italic" title="Italique" data-shortcut="⌘I"><i>I</i></button><button type="button" class="icon-button small" data-xl-cmd="underline" title="Souligné" data-shortcut="⌘U"><u>S</u></button><button type="button" class="icon-button small" data-xl-cmd="wrap" title="Renvoi à la ligne">↵</button><button type="button" class="icon-button small" data-xl-cmd="merge" title="Fusionner / séparer">⊞</button><button type="button" class="icon-button small" data-xl-cmd="al:left" title="Aligner à gauche">⟸</button><button type="button" class="icon-button small" data-xl-cmd="al:center" title="Centrer">≡</button><button type="button" class="icon-button small" data-xl-cmd="al:right" title="Aligner à droite">⟹</button></span>
        <span class="xl-g" data-tb="colors" data-tb-label="Couleurs (C2)"><button type="button" class="icon-button small xl-colbtn" data-xl-cmd="color:color" title="Couleur du texte"><b>A</b><i data-xl-sw="color"></i></button><button type="button" class="icon-button small xl-colbtn" data-xl-cmd="color:fill" title="Couleur du fond">◧<i data-xl-sw="fill"></i></button></span>
        <span class="xl-g" data-tb="format" data-tb-label="Format de cellule"><select data-xl-fmt aria-label="Format de la cellule" title="Format de la cellule">${FORMATS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select><button type="button" class="icon-button small" data-xl-cmd="dec-" title="Une décimale de moins">.0</button><button type="button" class="icon-button small" data-xl-cmd="dec+" title="Une décimale de plus">.00</button></span>
        <span class="xl-g" data-tb="borders" data-tb-label="Bordures"><button type="button" class="icon-button small" data-xl-cmd="bd:all" title="Bordures : tout">▦</button><button type="button" class="icon-button small" data-xl-cmd="bd:out" title="Bordures : contour">▭</button><button type="button" class="icon-button small" data-xl-cmd="bd:bottom" title="Bordure du bas">▁</button><button type="button" class="icon-button small" data-xl-cmd="bd:none" title="Sans bordure">⊘</button></span>
        <span class="xl-g" data-tb="data" data-tb-label="Trier, filtrer, Σ"><button type="button" class="button small secondary" data-xl-cmd="sortmenu" title="Trier la plage">↕ Trier ▾</button><button type="button" class="button small secondary" data-xl-cmd="filter" title="Filtrer (barre de recherche et filtres au-dessus)" data-shortcut="⇧⌘L">⚲ Filtrer</button><button type="button" class="button small secondary" data-xl-cmd="summenu" title="Somme, moyenne, nombre…">Σ ▾</button></span>
        <span class="xl-g" data-tb="chart" data-tb-label="Graphique"><button type="button" class="button small secondary" data-xl-cmd="chart" title="Un diagramme avec les chiffres de la sélection : les types conseillés pour cette plage">📊 Graphique ▾</button><button type="button" class="button small secondary" data-xl-cmd="fn" title="Choisir une fonction">ƒ Fonction</button></span>
    </div>`;

    Object.assign(Editor.prototype, {
        open() {
            const U = UI(), dlg = this.dlg = document.createElement('dialog');
            dlg.className = 'modal xl-dlg'; dlg.dataset.ownClose = '1'; dlg.dataset.noFoot = '1'; dlg.setAttribute('data-no-foot', '');
            const top = U.editorTopbar({icon: '🧾', name: this.name, nameAttrs: 'data-xl-name', menus: [{html: `<nav class="xl-menus">${menusHtml()}</nav>`}], undo: true, status: this.id && !this.dirty ? 'saved' : '',
                buttons: {customize: ext.tbButton ? {html: '⚙️ Personnaliser', attrs: 'data-tb-config="sheet"'} : null, export: {attrs: 'data-xl-cmd="export"', title: 'XLSX, ODS, CSV, TSV, JSON, PDF, impression'}, save: this.ctx.back ? {attrs: 'data-xl-cmd="save" data-xl-back-save', html: '✓ Enregistrer et revenir', title: this.ctx.back.title || 'Renvoyer les données là d’où elles viennent'} : {attrs: 'data-xl-cmd="save"'}, full: ext.fullButton ? {attrs: 'data-full-toggle="sheet"', title: 'Plein écran (⛶)'} : null, close: {attrs: 'data-xl-cmd="close"'}}});
            // « 🧾 Modifier les données » d'un autre outil (vague 2) : le bandeau dit d'où viennent les données et ce qu'on y attend
            const back = this.ctx.back ? `<div class="xl-back" data-xl-backbar role="note"><span class="xl-back-txt">${this.ctx.back.html || esc(this.ctx.back.label || 'Données d’un autre outil')}</span><span class="xl-back-btns"><button type="button" class="button small secondary" data-xl-cmd="close">Annuler</button><button type="button" class="button small" data-xl-cmd="save">✓ Enregistrer et revenir</button></span></div>` : '';
            dlg.innerHTML = `<div class="xl">${top}${back}${toolsHtml()}
                <div class="xl-fbar"><input class="xl-nbox" data-xl-nbox aria-label="Adresse (tape D12 ou un nom pour y aller)" title="Tape une adresse (D12, B2:C9) ou un nom pour y aller" spellcheck="false"><span class="xl-fxlab" aria-hidden="true">fx</span><textarea class="xl-fx" data-xl-fx rows="1" aria-label="Contenu ou formule de la cellule" spellcheck="false"></textarea></div>
                <div class="xl-ac" data-xl-ac hidden role="listbox"></div>
                <div class="xl-help" data-xl-help aria-live="polite"></div>
                <div class="xl-filterbar" data-xl-filter hidden></div>
                <div class="xl-body${pref('panel', true) && innerWidth > 760 ? '' : ' no-panel'}"><div class="xl-vpwrap"><div class="xl-vp" data-xl-vp data-ui-off data-ctx-off tabindex="-1" role="grid" aria-label="Feuille de calcul"><div class="xl-inner" data-xl-inner></div></div><textarea class="xl-kbd" data-xl-kbd aria-label="Feuille de calcul : tape pour écrire dans la cellule choisie" autocomplete="off" spellcheck="false"></textarea><textarea class="xl-ed" data-xl-ed hidden rows="1" spellcheck="false" aria-label="Écrire dans la cellule"></textarea></div>
                    <aside class="xl-panel" data-xl-panel data-tbg="xl-panel" data-tbg-label="Panneau de droite"></aside></div>
                <div class="xl-bottom"><div class="xl-tabs" data-xl-tabs role="tablist" aria-label="Feuilles"></div><div class="xl-status" data-xl-status title="Clique pour choisir ce qu’on y voit"></div></div></div>`;
            document.body.appendChild(dlg);
            ext.fullInit?.(dlg, 'sheet', true);
            dlg.showModal();
            this.vp = this.$('[data-xl-vp]'); this.inner = this.$('[data-xl-inner]'); this.kb = this.$('[data-xl-kbd]'); this.ed = this.$('[data-xl-ed]'); this.fx = this.$('[data-xl-fx]'); this.ac = this.$('[data-xl-ac]'); this.help = this.$('[data-xl-help]');
            this.buildPanel();
            this.bind();
            ext.tbApply?.(dlg, 'sheet');
            ext.editorKeysAttach?.(dlg, 'sheet');
            this.histBtns();
            if (this.dirty) U.savedStatus?.(dlg, 'dirty');
            this.refreshFilter();
            this.render();
            if (this.ctx.select) this.selectRange(this.ctx.select); // ouvert sur une plage (plage liée d'un diagramme…)
            this.focusGrid();
            if (ext.tableurInternals) ext.tableurInternals.current = this; // pour les essais
            return this;
        },
        focusGrid() { if (!this.edit) this.kb.focus({preventScroll: true}); },
        /** {sheet: id ou nom, range: 'A1:C4'} : montre la feuille et choisit la plage */
        selectRange({sheet = '', range = ''} = {}) {
            const S = X(), i = this.wb.sheets.findIndex(x => x.id === sheet || S.fold(x.name) === S.fold(sheet)); if (i >= 0 && i !== this.si) this.showSheet(i);
            const g = S.parseRange(range); if (!g) return; this.select(g.r0, g.c0); this.setSel(g.r0, g.c0, g.r1, g.c1); this.paint(true);
        },

        /* ═════════ Dessin de la grille (seules les cases visibles) ═════════ */
        render() {
            const g = this.geometry(), sh = this.S();
            this.inner.style.width = `${RW + g.W}px`; this.inner.style.height = `${HH + g.H}px`;
            this.inner.classList.toggle('xl-nogrid', pref('grid', true) === false);
            this.win = null; this.paint(true); this.paintTabs(); this.paintStatus(); this.syncBar(); this.syncPanel(); this.syncTools();
            this.vp.setAttribute('aria-label', `Feuille « ${sh.name} »`);
        },
        /** dessine les volets ; force : même si la fenêtre visible n'a pas changé */
        paint(force = false) {
            const g = this.geometry(), vp = this.vp, sT = vp.scrollTop, sL = vp.scrollLeft, vw = vp.clientWidth || 800, vh = vp.clientHeight || 500;
            const rA = Math.max(g.fr, this.rowAt(sT + g.frH) - 2), rB = Math.min(g.nR - 1, this.rowAt(sT + vh) + 2);
            const cA = Math.max(g.fc, this.colAt(sL + g.fcW)), cB = Math.min(g.nC - 1, this.colAt(sL + vw) + 1);
            if (!force && this.win && rA >= this.win.rA && rB <= this.win.rB && cA >= this.win.cA && cB <= this.win.cB) return;
            const W = this.win = {rA: Math.max(g.fr, rA - 6), rB: Math.min(g.nR - 1, rB + 6), cA: Math.max(g.fc, cA - 1), cB: Math.min(g.nC - 1, cB + 1)};
            const ctx = this.paintCtx();
            const H = [];
            // le corps
            H.push(`<div class="xl-pane xl-p-body" style="width:${RW + g.W}px;height:${HH + g.H}px">${this.cellsHtml(W.rA, W.rB, W.cA, W.cB, RW, HH, ctx)}${this.overlay('body', RW, HH)}</div>`);
            if (g.fr) H.push(`<div class="xl-pane xl-p-frow has-fz" style="top:${HH}px;width:${RW + g.W}px;height:${g.frH}px">${this.cellsHtml(0, g.fr - 1, W.cA, W.cB, RW, 0, ctx)}${this.overlay('frow', RW, 0)}</div>`);
            if (g.fc) H.push(`<div class="xl-pane xl-p-fcol has-fz" style="left:${RW}px;width:${g.fcW}px;height:${HH + g.H}px">${this.cellsHtml(W.rA, W.rB, 0, g.fc - 1, 0, HH, ctx)}${this.overlay('fcol', 0, HH)}</div>`);
            // en-têtes de colonnes et de lignes
            const sel = this.sel, colh = [], rowh = [], filt = this.filterCols();
            for (let c = W.cA; c <= W.cB; c++) { const w = g.colX[c + 1] - g.colX[c]; if (!w) continue; colh.push(`<div class="xl-hc is-col${c >= sel.c0 && c <= sel.c1 ? ' is-sel' : ''}" style="left:${RW + g.colX[c]}px;top:0;width:${w}px;height:${HH}px">${X().colName(c)}${filt.has(c) ? '<span class="xl-flt">⚲</span>' : ''}</div>`); }
            for (let r = W.rA; r <= W.rB; r++) { const h = g.rowY[r + 1] - g.rowY[r]; if (!h) continue; rowh.push(`<div class="xl-hc is-row${r >= sel.r0 && r <= sel.r1 ? ' is-sel' : ''}" style="left:0;top:${HH + g.rowY[r]}px;width:${RW}px;height:${h}px">${r + 1}</div>`); }
            H.push(`<div class="xl-pane xl-p-colh" style="width:${RW + g.W}px;height:${HH}px">${colh.join('')}</div>`);
            H.push(`<div class="xl-pane xl-p-rowh" style="width:${RW}px;height:${HH + g.H}px">${rowh.join('')}</div>`);
            // le coin : coin, en-têtes des colonnes et lignes figées, cases figées des deux côtés
            const corner = [`<div class="xl-corner" data-xl-corner title="Tout sélectionner" style="width:${RW}px;height:${HH}px"></div>`];
            for (let c = 0; c < g.fc; c++) { const w = g.colX[c + 1] - g.colX[c]; if (w) corner.push(`<div class="xl-hc is-col${c >= sel.c0 && c <= sel.c1 ? ' is-sel' : ''}" style="left:${RW + g.colX[c]}px;top:0;width:${w}px;height:${HH}px">${X().colName(c)}${filt.has(c) ? '<span class="xl-flt">⚲</span>' : ''}</div>`); }
            for (let r = 0; r < g.fr; r++) { const h = g.rowY[r + 1] - g.rowY[r]; if (h) corner.push(`<div class="xl-hc is-row${r >= sel.r0 && r <= sel.r1 ? ' is-sel' : ''}" style="left:0;top:${HH + g.rowY[r]}px;width:${RW}px;height:${h}px">${r + 1}</div>`); }
            if (g.fr && g.fc) corner.push(this.cellsHtml(0, g.fr - 1, 0, g.fc - 1, RW, HH, ctx), this.overlay('corner', RW, HH));
            H.push(`<div class="xl-pane xl-p-corner" style="width:${RW + g.fcW}px;height:${HH + g.frH}px">${corner.join('')}</div>`);
            this.inner.innerHTML = H.join('');
            if (this.edit && !this.edit.hiddenEd) this.placeEditor();
        },
        /** ce qu'il faut pour dessiner : règles de mise en forme conditionnelle, validations */
        paintCtx() {
            const sh = this.S(), si = this.si, calc = this.calc;
            const cf = (sh.cf || []).map(rule => {
                const g = X().parseRange(rule.range); if (!g) return null; const out = {...rule, g};
                if (rule.op === 'dup') { const seen = new Map(), u = calc.used(si); for (let r = g.r0; r <= Math.min(g.r1, u.r); r++) for (let c = g.c0; c <= Math.min(g.c1, u.c); c++) { const v = calc.val(si, r, c); if (v == null || v === '') continue; const k = X().fold(X().toStr(v)); seen.set(k, (seen.get(k) || 0) + 1); } out.dups = seen; }
                if (rule.op === 'scale') { let mn = Infinity, mx = -Infinity; const u = calc.used(si); for (let r = g.r0; r <= Math.min(g.r1, u.r); r++) for (let c = g.c0; c <= Math.min(g.c1, u.c); c++) { const v = calc.val(si, r, c); if (typeof v === 'number') { mn = Math.min(mn, v); mx = Math.max(mx, v); } } out.mn = mn; out.mx = mx; }
                return out;
            }).filter(Boolean);
            const dv = (sh.dv || []).map(d => ({...d, g: X().parseRange(d.range)})).filter(d => d.g);
            return {cf, dv, sh, si};
        },
        cfMatch(rule, v) {
            const S = X(), n = typeof v === 'number' ? v : null, a = S.toNum(rule.v), b = S.toNum(rule.v2);
            switch (rule.op) {
                case '>': return n !== null && a !== null && n > a; case '<': return n !== null && a !== null && n < a;
                case '>=': return n !== null && a !== null && n >= a; case '<=': return n !== null && a !== null && n <= a;
                case '=': return a !== null && n !== null ? n === a : S.fold(S.toStr(v)) === S.fold(rule.v);
                case '<>': return a !== null && n !== null ? n !== a : S.fold(S.toStr(v)) !== S.fold(rule.v);
                case 'between': return n !== null && a !== null && b !== null && n >= Math.min(a, b) && n <= Math.max(a, b);
                case 'contains': return !!rule.v && S.fold(S.toStr(v)).includes(S.fold(rule.v));
                case 'empty': return v == null || v === ''; case 'notempty': return !(v == null || v === '');
                case 'dup': return v != null && v !== '' && (rule.dups?.get(S.fold(S.toStr(v))) || 0) > 1;
                case 'baddate': return typeof v === 'string' && /\d/.test(v) && !!S.readActDate(v)?.error || S.isErr(v) && v.code === '#DATE?';
            }
            return false;
        },
        cellsHtml(rA, rB, cA, cB, ox, oy, ctx) {
            const g = this.geometry(), sh = ctx.sh, S = X(), calc = this.calc, si = ctx.si, styles = this.wb.styles, out = [], fr = g.fr, zebra = sh.zebra;
            const drawn = new Set();
            const one = (r, c, w, h) => {
                const k = S.addr(r, c), cell = sh.cells[k], raw = cell == null ? null : cell.v, st = styles[cell?.s] || {}, v = calc.val(si, r, c);
                const cls = ['xl-c']; let txt = '', inner = '', css = '';
                if (this.showFormulas && typeof raw === 'string' && raw[0] === '=') txt = raw;
                else txt = S.formatValue(v, st, {approx: calc.isApprox(si, r, c)});
                if (typeof v === 'number' || v instanceof S.SDate) cls.push('is-num'); else if (typeof v === 'boolean') cls.push('is-bool');
                if (S.isErr(v)) cls.push('is-err');
                if (raw == null && v != null) cls.push('is-spill');
                let fill = st.fill, color = st.color, bold = st.b;
                for (const rule of ctx.cf) if (r >= rule.g.r0 && r <= rule.g.r1 && c >= rule.g.c0 && c <= rule.g.c1) {
                    if (rule.op === 'scale') { if (typeof v === 'number' && rule.mx > rule.mn) inner += `<span class="xl-bar" style="width:${Math.round(((v - rule.mn) / (rule.mx - rule.mn)) * 100)}%"></span>`; continue; }
                    if (this.cfMatch(rule, v)) { if (rule.style?.fill) fill = rule.style.fill; if (rule.style?.color) color = rule.style.color; if (rule.style?.b) bold = 1; }
                }
                if (bold) cls.push('is-b'); if (st.i) cls.push('is-i'); if (st.u) cls.push('is-u'); if (st.s) cls.push('is-s'); if (st.wrap) cls.push('is-wrap');
                if (r < fr && !fill) cls.push('is-fz'); else if (zebra && r % 2 === 1 && !fill) cls.push('is-zebra');
                if (fill) { css += `background-color:${S.safeCol(fill)};`; cls.push('has-fill'); }
                if (color) css += `color:${S.safeCol(color)};`;
                if (st.h) css += `text-align:${st.h};`; if (st.v) css += `align-items:${st.v};`;
                if (st.fs) css += `font-size:${st.fs}px;`; if (st.font) css += `font-family:${cssFont(st.font)};`;
                if (st.bd) { const b = `${st.bs === 'thick' ? 2 : st.bs === 'double' ? 3 : 1}px ${st.bs === 'double' ? 'double' : 'solid'} ${S.safeCol(st.bc) || 'currentColor'}`; if (st.bd.includes('t')) css += `border-top:${b};`; if (st.bd.includes('b')) css += `border-bottom:${b};`; if (st.bd.includes('l')) css += `border-left:${b};`; if (st.bd.includes('r')) css += `border-right:${b};`; }
                // une personne ou un lieu choisi avec le menu de choix
                const dv = ctx.dv.find(d => r >= d.g.r0 && r <= d.g.r1 && c >= d.g.c0 && c <= d.g.c1);
                if (cell?.ref) { const ini = String(raw || '?').split(/[\s-]+/).filter(Boolean).map(x => x[0]).join('').slice(0, 2).toUpperCase(); const icon = cell.ref.kind === 'place' ? '📍' : ini; inner += `<span class="xl-chip" data-xl-ref="${r}:${c}" title="Clic : ouvrir la fiche"><span class="xl-av${cell.ref.kind === 'place' ? ' is-place' : ''}">${esc(icon)}</span>${esc(txt)}</span>`; txt = ''; }
                else if (dv && (dv.kind === 'person' || dv.kind === 'place') && raw != null && raw !== '' && !S.isFormula(raw)) { inner += `<span class="xl-chip is-free" title="Pas encore relié à une fiche"><span class="xl-av is-free">?</span>${esc(txt)}</span>`; txt = ''; }
                else if (dv && (dv.kind === 'person' || dv.kind === 'place') && (raw == null || raw === '')) inner += `<span class="xl-pick">🔍 Choisir…</span>`;
                if (dv?.kind === 'list') inner += '<span class="xl-dd" aria-hidden="true">▾</span>';
                if (cell?.note) inner += '<span class="xl-note" aria-hidden="true"></span>';
                const tip = cell?.note ? ` title="${esc(cell.note)}"` : S.isErr(v) ? ` title="${esc(S.explain(v))}"` : '';
                out.push(`<div class="${cls.join(' ')}" style="left:${ox + g.colX[c]}px;top:${oy + g.rowY[r]}px;width:${w}px;height:${h}px;${css}"${tip}>${inner}${txt ? esc(txt) : ''}</div>`);
            };
            for (let r = rA; r <= rB; r++) {
                const h = g.rowY[r + 1] - g.rowY[r]; if (!h) continue;
                for (let c = cA; c <= cB; c++) {
                    const w = g.colX[c + 1] - g.colX[c]; if (!w) continue;
                    if (g.covered.size && g.covered.has(r + ':' + c)) continue;
                    const m = g.mAt.size ? g.mAt.get(r + ':' + c) : null;
                    if (m) { one(r, c, g.colX[m.c1 + 1] - g.colX[m.c0], g.rowY[m.r1 + 1] - g.rowY[m.r0]); drawn.add(m); }
                    else one(r, c, w, h);
                }
            }
            // une fusion dont la case du coin est hors de la fenêtre
            g.merges.forEach(m => { if (drawn.has(m) || m.r1 < rA || m.r0 > rB || m.c1 < cA || m.c0 > cB) return; one(m.r0, m.c0, g.colX[m.c1 + 1] - g.colX[m.c0], g.rowY[m.r1 + 1] - g.rowY[m.r0]); });
            return out.join('');
        },
        /** la sélection, la case active, la poignée de recopie, les cellules montrées par la formule en cours */
        overlay(pane, ox, oy) {
            const g = this.geometry(), out = [];
            const inPane = (r0, c0, r1, c1) => { // découpe un rectangle selon le volet
                const rr0 = pane === 'body' || pane === 'fcol' ? Math.max(r0, g.fr) : r0, rr1 = pane === 'frow' || pane === 'corner' ? Math.min(r1, g.fr - 1) : r1;
                const cc0 = pane === 'body' || pane === 'frow' ? Math.max(c0, g.fc) : c0, cc1 = pane === 'fcol' || pane === 'corner' ? Math.min(c1, g.fc - 1) : c1;
                if (rr0 > rr1 || cc0 > cc1) return null;
                return {x: ox + g.colX[cc0], y: oy + g.rowY[rr0], w: g.colX[cc1 + 1] - g.colX[cc0], h: g.rowY[rr1 + 1] - g.rowY[rr0], end: rr1 === r1 && cc1 === c1};
            };
            const box = (cls, rc, extra = '') => (rc && rc.w > 0 && rc.h > 0 ? `<div class="${cls}" style="left:${rc.x}px;top:${rc.y}px;width:${rc.w}px;height:${rc.h}px;${extra}"></div>` : '');
            if (this.edit?.refs) this.edit.refs.forEach((rf, i) => { if (rf.si !== this.si) return; out.push(box('xl-refbox', inPane(rf.r0, rf.c0, rf.r1, rf.c1), `outline-color:${REF_COLORS[i % REF_COLORS.length]}`)); });
            if (this.clip && this.clip.sheet === this.S()) { const q = this.clip.g; out.push(box('xl-copybox', inPane(q.r0, q.c0, q.r1, q.c1))); }
            if (this.fillTo) { const q = this.fillTo; out.push(box('xl-fillbox', inPane(q.r0, q.c0, q.r1, q.c1))); }
            const s = this.sel, one = s.r0 === s.r1 && s.c0 === s.c1 || (() => { const m = this.mergeOf(s.r0, s.c0); return m && m.r0 === s.r0 && m.c0 === s.c0 && m.r1 === s.r1 && m.c1 === s.c1; })();
            if (!one) out.push(box('xl-sel', inPane(s.r0, s.c0, s.r1, s.c1)));
            const m = this.mergeOf(this.act[0], this.act[1]) || {r0: this.act[0], c0: this.act[1], r1: this.act[0], c1: this.act[1]};
            out.push(box('xl-act', inPane(m.r0, m.c0, m.r1, m.c1)));
            const all = inPane(s.r0, s.c0, s.r1, s.c1);
            if (all?.end && !this.edit) out.push(`<span class="xl-handle" data-xl-handle style="left:${all.x + all.w - 5}px;top:${all.y + all.h - 5}px" title="Tire pour recopier ou continuer une suite"></span>`);
            return out.join('');
        },
        /** position d'une case à l'écran (dans .xl-vpwrap), en tenant compte des volets figés */
        cellRect(r, c) {
            const g = this.geometry(), m = this.mergeOf(r, c) || {r0: r, c0: c, r1: r, c1: c};
            const x = RW + g.colX[m.c0] - (m.c0 >= g.fc ? this.vp.scrollLeft : 0), y = HH + g.rowY[m.r0] - (m.r0 >= g.fr ? this.vp.scrollTop : 0);
            return {x, y, w: g.colX[m.c1 + 1] - g.colX[m.c0], h: g.rowY[m.r1 + 1] - g.rowY[m.r0]};
        },
        /** amène une case à l'écran */
        reveal(r, c) {
            const g = this.geometry(), vp = this.vp, vw = vp.clientWidth, vh = vp.clientHeight;
            if (r >= g.fr) { const top = g.rowY[r], bot = g.rowY[r + 1]; if (top - vp.scrollTop < g.frH) vp.scrollTop = top - g.frH; else if (HH + bot - vp.scrollTop > vh) vp.scrollTop = HH + bot - vh + 2; }
            if (c >= g.fc) { const l = g.colX[c], rr = g.colX[c + 1]; if (l - vp.scrollLeft < g.fcW) vp.scrollLeft = l - g.fcW; else if (RW + rr - vp.scrollLeft > vw) vp.scrollLeft = RW + rr - vw + 2; }
        },
    });
    const REF_COLORS = ['#055dff', '#d0182f', '#1a7f3c', '#b35c00', '#7b2fbf', '#008b8b'];

    /* ═════════ Choisir, écrire, se déplacer ═════════ */
    Object.assign(Editor.prototype, {
        /** la sélection (agrandie aux cases fusionnées qu'elle touche) */
        setSel(r0, c0, r1, c1, silent = false) {
            let g = {r0: Math.min(r0, r1), c0: Math.min(c0, c1), r1: Math.max(r0, r1), c1: Math.max(c0, c1)};
            const geo = this.geometry();
            for (let k = 0; k < 4; k++) { let grew = false; geo.merges.forEach(m => { if (m.r1 >= g.r0 && m.r0 <= g.r1 && m.c1 >= g.c0 && m.c0 <= g.c1 && (m.r0 < g.r0 || m.c0 < g.c0 || m.r1 > g.r1 || m.c1 > g.c1)) { g = {r0: Math.min(g.r0, m.r0), c0: Math.min(g.c0, m.c0), r1: Math.max(g.r1, m.r1), c1: Math.max(g.c1, m.c1)}; grew = true; } }); if (!grew) break; }
            this.sel = g;
            if (!silent) this.afterSel();
        },
        select(r, c, extend = false) {
            const L = X().LIMITS; r = Math.max(0, Math.min(L.rows - 1, r)); c = Math.max(0, Math.min(L.cols - 1, c));
            if (extend) { this.act = [...this.anchor]; this.setSel(this.anchor[0], this.anchor[1], r, c, true); this.cursor = [r, c]; }
            else { const m = this.mergeOf(r, c); if (m) { r = m.r0; c = m.c0; } this.act = [r, c]; this.anchor = [r, c]; this.cursor = [r, c]; this.setSel(r, c, r, c, true); }
            const g = this.geometry(); if (r + 30 > g.nR || c + 6 > g.nC) { this.extraR = Math.max(this.extraR || 0, r + 60); this.extraC = Math.max(this.extraC || 0, c + 8); this.geo = null; this.inner.style.width = `${RW + this.geometry().W}px`; this.inner.style.height = `${HH + this.geometry().H}px`; }
            this.reveal(...(extend ? this.cursor : this.act));
            this.afterSel();
        },
        afterSel() { this.paint(true); this.paintStatus(); if (!this.edit) this.syncBar(); this.syncPanel(); this.syncTools(); },
        /** déplacement au clavier ; jump : jusqu'au bord des données (⌘ + flèche) */
        move(dr, dc, extend = false, jump = false) {
            let [r, c] = extend ? (this.cursor || this.act) : this.act;
            const m = this.mergeOf(r, c); if (m && !extend) { if (dr > 0) r = m.r1; if (dc > 0) c = m.c1; }
            if (jump) { const filled = (rr, cc) => { const v = this.calc.val(this.si, rr, cc); return v != null && v !== ''; }, u = this.calc.used(this.si);
                const lim = dr ? Math.max(u.r, r + 1) : Math.max(u.c, c + 1); let n = 0;
                if (filled(r, c) && filled(r + dr, c + dc)) { while (n < 1e6 && filled(r + dr, c + dc) && r + dr >= 0 && c + dc >= 0 && (dr ? r + dr < lim : c + dc < lim)) { r += dr; c += dc; n++; } }
                else { r += dr; c += dc; while (n < 1e6 && r >= 0 && c >= 0 && !filled(r, c) && (dr ? r < lim : c < lim)) { r += dr; c += dc; n++; } if (r < 0 || c < 0) { r = Math.max(0, r); c = Math.max(0, c); } } }
            else { r += dr; c += dc; while (dr && r > 0 && this.rowH(r) === 0 && r < 1e6) r += dr; while (dc && c > 0 && this.colW(c) === 0 && c < 2e4) c += dc; }
            this.select(Math.max(0, r), Math.max(0, c), extend);
        },
        /** où tombe la souris : coin, en-tête de colonne ou de ligne, case ; le bord d'une colonne (pour la largeur) */
        hit(e) {
            const rc = this.vp.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top;
            if (x < 0 || y < 0 || x > this.vp.clientWidth || y > this.vp.clientHeight) return null;
            const g = this.geometry(), gx = x - RW, gy = y - HH;
            const cx = gx < g.fcW ? gx : gx + this.vp.scrollLeft, cy = gy < g.frH ? gy : gy + this.vp.scrollTop;
            const c = this.colAt(cx), r = this.rowAt(cy);
            if (x < RW && y < HH) return {zone: 'corner'};
            if (y < HH) { const edge = Math.abs(cx - g.colX[c + 1]) <= 4 ? c : Math.abs(cx - g.colX[c]) <= 4 && c > 0 ? c - 1 : -1; return {zone: 'colh', c, r: 0, edge}; }
            if (x < RW) { const edge = Math.abs(cy - g.rowY[r + 1]) <= 3 ? r : Math.abs(cy - g.rowY[r]) <= 3 && r > 0 ? r - 1 : -1; return {zone: 'rowh', r, c: 0, edge}; }
            return {zone: 'cell', r, c};
        },
        bind() {
            const dlg = this.dlg, vp = this.vp, kb = this.kb;
            dlg.addEventListener('cancel', e => { e.preventDefault(); if (this.pickBox) return this.closePicker(); if (this.edit) return this.cancelEdit(); if (this.clip) { this.clip = null; this.paint(true); } });
            dlg.addEventListener('close', () => { this.closed = true; ext.tbDefs; this.ctx.onClose?.(this.id); dlg.remove(); });
            vp.addEventListener('scroll', () => { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.paint(); if (this.edit && !this.edit.hiddenEd) this.placeEditor(); }); }, {passive: true});
            new ResizeObserver(() => { this.win = null; this.paint(true); }).observe(vp);
            // la souris
            vp.addEventListener('pointerdown', e => this.onDown(e));
            vp.addEventListener('dblclick', e => { const h = this.hit(e); if (!h) return; if (h.zone === 'colh' && h.edge >= 0) return this.autofit(h.edge); if (h.zone === 'cell') { e.preventDefault(); this.select(h.r, h.c); this.startEdit(null); } });
            vp.addEventListener('contextmenu', e => this.onContext(e));
            vp.addEventListener('mousemove', e => { if (this.drag) return; const h = this.hit(e); vp.style.cursor = h?.zone === 'colh' && h.edge >= 0 ? 'col-resize' : h?.zone === 'rowh' && h.edge >= 0 ? 'row-resize' : ''; });
            // le clavier : une case cachée reçoit les touches (et le copier-coller)
            kb.addEventListener('keydown', e => this.onKey(e));
            dlg.addEventListener('keydown', e => { if (e.target === kb || e.defaultPrevented || !(e.metaKey || e.ctrlKey) || e.altKey) return; const k = e.key.toLowerCase(); if (k === 's') { e.preventDefault(); if (e.target.matches?.('[data-xl-name]')) e.target.dispatchEvent(new Event('change')); this.run('save'); } else if (k === 'p' && !this.edit) { e.preventDefault(); this.run('print'); } });
            kb.addEventListener('input', () => { const v = kb.value; kb.value = ''; if (v && !this.edit) this.startEdit(v); });
            kb.addEventListener('copy', e => this.onCopy(e, false)); kb.addEventListener('cut', e => this.onCopy(e, true)); kb.addEventListener('paste', e => this.onPaste(e));
            // l'éditeur dans la case et la barre de formule
            this.ed.addEventListener('input', () => { this.fx.value = this.ed.value; this.refPick = null; this.onEditInput(this.ed); });
            this.fx.addEventListener('input', () => { if (!this.edit) this.startEdit(this.fx.value, {from: 'bar'}); this.ed.value = this.fx.value; this.refPick = null; this.onEditInput(this.fx); });
            this.fx.addEventListener('focus', () => { if (!this.edit) this.startEdit(null, {from: 'bar'}); });
            this.ed.addEventListener('keydown', e => this.onEditKey(e, this.ed)); this.fx.addEventListener('keydown', e => this.onEditKey(e, this.fx));
            [this.ed, this.fx].forEach(el => el.addEventListener('click', () => { this.refPick = null; this.sigHelp(el); }));
            this.ac.addEventListener('mousedown', e => { const it = e.target.closest('[data-fn]'); if (it) { e.preventDefault(); this.pickFn(it.dataset.fn); } });
            // la case d'adresse
            const nb = this.$('[data-xl-nbox]');
            nb.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.gotoName(nb.value); } if (e.key === 'Escape') { e.preventDefault(); this.syncBar(); this.focusGrid(); } });
            // les boutons et les menus
            dlg.addEventListener('click', e => {
                const b = e.target.closest('[data-xl-cmd], [data-ui-cmd]'); if (!b || b.disabled || !dlg.contains(b)) return;
                const cmd = b.dataset.xlCmd || ({undo: 'undo', redo: 'redo'}[b.dataset.uiCmd]); if (!cmd) return;
                b.closest('details')?.removeAttribute('open');
                e.preventDefault(); this.run(cmd, b);
            });
            dlg.addEventListener('toggle', e => { const d = e.target; if (d.matches?.('.xl-menu[open]')) dlg.querySelectorAll('.xl-menu[open]').forEach(x => { if (x !== d) x.removeAttribute('open'); }); }, true);
            document.addEventListener('pointerdown', this.outside = e => { if (!dlg.isConnected) return document.removeEventListener('pointerdown', this.outside); if (!e.target.closest?.('.xl-menu')) dlg.querySelectorAll('.xl-menu[open]').forEach(x => x.removeAttribute('open')); });
            this.$('[data-xl-fmt]').addEventListener('change', e => this.run('fmt:' + e.target.value));
            this.$('[data-xl-name]').addEventListener('change', e => { const n = e.target.value.trim().slice(0, 200) || 'Mon classeur'; if (n === this.name) return; this.name = n; this.touch(); });
            // les onglets des feuilles
            const tabs = this.$('[data-xl-tabs]');
            tabs.addEventListener('click', e => { const b = e.target.closest('[data-xl-sheet]'); if (!b) return; if (b.dataset.xlSheet === 'add') return this.addSheet(); this.showSheet(Number(b.dataset.xlSheet)); });
            tabs.addEventListener('dblclick', e => { const b = e.target.closest('[data-xl-sheet]'); if (b && b.dataset.xlSheet !== 'add') this.renameSheet(Number(b.dataset.xlSheet)); });
            tabs.addEventListener('contextmenu', e => { const b = e.target.closest('[data-xl-sheet]'); if (!b || b.dataset.xlSheet === 'add') return; e.preventDefault(); this.sheetMenu(Number(b.dataset.xlSheet), e); });
            tabs.addEventListener('dragstart', e => { const b = e.target.closest('[data-xl-sheet]'); if (!b) return; this.dragTab = Number(b.dataset.xlSheet); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', b.textContent); });
            tabs.addEventListener('dragover', e => { if (this.dragTab == null) return; e.preventDefault(); tabs.querySelectorAll('.is-drop').forEach(x => x.classList.remove('is-drop')); e.target.closest('[data-xl-sheet]')?.classList.add('is-drop'); });
            tabs.addEventListener('drop', e => { const b = e.target.closest('[data-xl-sheet]'); if (this.dragTab == null) return; e.preventDefault(); const to = b && b.dataset.xlSheet !== 'add' ? Number(b.dataset.xlSheet) : this.wb.sheets.length - 1; const from = this.dragTab; this.dragTab = null; if (from !== to) this.moveSheet(from, to); });
            tabs.addEventListener('dragend', () => { this.dragTab = null; tabs.querySelectorAll('.is-drop').forEach(x => x.classList.remove('is-drop')); });
            this.$('[data-xl-status]').addEventListener('click', e => this.statusMenu(e.currentTarget));
            // le panneau
            this.$('[data-xl-panel]').addEventListener('click', e => { const b = e.target.closest('[data-xl-pcmd]'); if (b) { e.preventDefault(); this.panelCmd(b.dataset.xlPcmd, b); } });
            this.$('[data-xl-panel]').addEventListener('change', e => { const t = e.target; if (t.matches('[data-xl-pfmt]')) this.run('fmt:' + t.value); if (t.matches('[data-xl-pdec]')) { const d = Math.max(0, Math.min(10, Math.round(Number(t.value) || 0))); this.styleSel(st => { st.dec = d; if (!st.fmt) st.fmt = 'num'; }, 'Décimales changées'); } });
        },
        onDown(e) {
            if (e.button !== 0) return;
            const h = this.hit(e); if (!h) return;
            const touch = e.pointerType === 'touch';
            if (e.target.closest('[data-xl-handle]')) { e.preventDefault(); this.drag = {kind: 'fill', from: {...this.sel}}; this.trackDrag(e); return; }
            if (h.zone === 'corner') { e.preventDefault(); this.commitIfEditing(); this.selectAll(); return; }
            if ((h.zone === 'colh' || h.zone === 'rowh') && h.edge >= 0 && !touch) { e.preventDefault(); this.drag = {kind: h.zone === 'colh' ? 'colw' : 'rowh', i: h.edge, start: h.zone === 'colh' ? e.clientX : e.clientY, size: h.zone === 'colh' ? this.colW(h.edge) : this.rowH(h.edge)}; this.trackDrag(e); return; }
            // une formule en cours : un clic met la référence
            if (this.edit && this.canPoint()) { e.preventDefault(); if (h.zone === 'cell') { this.pointAt = [h.r, h.c]; this.pointAnchor = [h.r, h.c]; this.insertRef(h.r, h.c, h.r, h.c); this.drag = {kind: 'ref', a: [h.r, h.c]}; this.trackDrag(e); } return; }
            if (touch) { this.touchStart = {x: e.clientX, y: e.clientY, h}; const up = ev => { window.removeEventListener('pointerup', up); if (Math.hypot(ev.clientX - this.touchStart.x, ev.clientY - this.touchStart.y) < 8) this.clickAt(this.touchStart.h, ev); }; window.addEventListener('pointerup', up); return; }
            e.preventDefault();
            this.clickAt(h, e);
            if (h.zone === 'cell' || h.zone === 'colh' || h.zone === 'rowh') { this.drag = {kind: 'sel', zone: h.zone}; this.trackDrag(e); }
        },
        clickAt(h, e) {
            this.commitIfEditing(); this.tabStart = null;
            const g = this.geometry();
            if (h.zone === 'colh') { if (e.shiftKey) { this.setSel(this.anchor[0] === 0 ? 0 : 0, this.anchor[1], g.nR - 1, h.c); } else { this.act = [0, h.c]; this.anchor = [0, h.c]; this.setSel(0, h.c, g.nR - 1, h.c, true); } this.colSel = true; this.afterSel(); }
            else if (h.zone === 'rowh') { if (e.shiftKey) { this.setSel(this.anchor[0], 0, h.r, g.nC - 1); } else { this.act = [h.r, 0]; this.anchor = [h.r, 0]; this.setSel(h.r, 0, h.r, g.nC - 1, true); } this.afterSel(); }
            else if (h.zone === 'cell') this.select(h.r, h.c, e.shiftKey);
            this.focusGrid();
        },
        trackDrag(e0) {
            let lastE = e0;
            const step = () => { // défile tout seul près des bords
                if (!this.drag) return; const rc = this.vp.getBoundingClientRect(), m = 24; let dx = 0, dy = 0;
                if (lastE.clientY > rc.bottom - m) dy = 20; else if (lastE.clientY < rc.top + HH + 4 && this.drag.kind !== 'colw') dy = -20;
                if (lastE.clientX > rc.right - m) dx = 20; else if (lastE.clientX < rc.left + RW + 4 && this.drag.kind !== 'rowh') dx = -20;
                if (dx || dy) { this.vp.scrollLeft += dx; this.vp.scrollTop += dy; mv(lastE); }
                this.dragTimer = setTimeout(step, 60);
            };
            const mv = ev => {
                lastE = ev; const d = this.drag; if (!d) return;
                if (d.kind === 'colw' || d.kind === 'rowh') { const v = Math.max(d.kind === 'colw' ? 24 : 14, Math.min(1200, d.size + (d.kind === 'colw' ? ev.clientX : ev.clientY) - d.start)); d.now = v; const sh = this.S(); const store = d.kind === 'colw' ? sh.cols : sh.rows, key = d.kind === 'colw' ? X().colName(d.i) : String(d.i + 1); d.orig = d.orig ?? JSON.stringify(store[key] || null); store[key] = {...(store[key] || {}), [d.kind === 'colw' ? 'w' : 'h']: Math.round(v)}; this.geo = null; this.render(); return; }
                const h = this.hit(ev); if (!h) return; const g = this.geometry();
                if (d.kind === 'sel') {
                    if (d.zone === 'colh') this.setSel(0, this.anchor[1], g.nR - 1, h.c); else if (d.zone === 'rowh') this.setSel(this.anchor[0], 0, h.r, g.nC - 1); else if (h.zone === 'cell') { this.cursor = [h.r, h.c]; this.setSel(this.anchor[0], this.anchor[1], h.r, h.c); }
                } else if (d.kind === 'ref' && h.zone === 'cell') { this.insertRef(d.a[0], d.a[1], h.r, h.c); }
                else if (d.kind === 'fill' && h.zone === 'cell') {
                    const f = d.from; let to = {...f};
                    const down = h.r - f.r1, up = f.r0 - h.r, right = h.c - f.c1, left = f.c0 - h.c, best = Math.max(down, up, right, left);
                    if (best > 0) { if (best === down) to.r1 = h.r; else if (best === up) to.r0 = h.r; else if (best === right) to.c1 = h.c; else to.c0 = h.c; }
                    this.fillTo = best > 0 ? to : null; this.paint(true); this.fillTip(ev, f, to);
                }
            };
            const up = () => {
                window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); clearTimeout(this.dragTimer);
                const d = this.drag; this.drag = null; this.$('.xl-tip')?.remove();
                if (d?.kind === 'colw' || d?.kind === 'rowh') { if (d.now != null) { const sh = this.S(), store = d.kind === 'colw' ? sh.cols : sh.rows, key = d.kind === 'colw' ? X().colName(d.i) : String(d.i + 1), now = store[key]; store[key] = JSON.parse(d.orig) || undefined; if (!store[key]) delete store[key]; this.begin(d.kind === 'colw' ? 'Largeur' : 'Hauteur'); this.meta(sh); store[key] = now; this.commit(); this.render(); } }
                if (d?.kind === 'fill') { const to = this.fillTo; this.fillTo = null; if (to) this.doFill(d.from, to); else this.paint(true); }
                if (d?.kind === 'ref') { const el = this.edit?.from === 'bar' ? this.fx : this.ed; el?.focus({preventScroll: true}); }
            };
            window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
            this.dragTimer = setTimeout(step, 120);
        },
        fillTip(ev, f, to) {
            let tip = this.$('.xl-tip'); if (!to) { tip?.remove(); return; }
            if (!tip) { tip = document.createElement('div'); tip.className = 'xl-tip'; this.$('.xl-vpwrap').appendChild(tip); }
            const plan = this.fillPlan(f, to), last = plan[plan.length - 1], rc = this.$('.xl-vpwrap').getBoundingClientRect();
            const v = last ? (typeof last.cell?.v === 'string' && last.cell.v[0] === '=' ? last.cell.v : X().formatValue(last.cell?.v ?? '', this.wb.styles[last.cell?.s] || {})) : '';
            tip.textContent = v === '' ? '' : `→ ${String(v).slice(0, 60)}`; tip.hidden = v === '';
            tip.style.left = `${ev.clientX - rc.left + 14}px`; tip.style.top = `${ev.clientY - rc.top + 14}px`;
        },
        selectAll() { const u = this.calc.used(this.si); const g = this.geometry(); this.act = [0, 0]; this.anchor = [0, 0]; this.setSel(0, 0, Math.max(u.r - 1, g.nR - 1), Math.max(u.c - 1, g.nC - 1)); },

        /* ── le clavier dans la grille ── */
        onKey(e) {
            const k = e.key, mod = e.metaKey || e.ctrlKey, sh = e.shiftKey;
            if (e.isComposing) return;
            const arrows = {ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1]};
            const go = (dr, dc, ext = false, jump = false) => { e.preventDefault(); this.move(dr, dc, ext, jump); };
            if (arrows[k] && e.altKey && k === 'ArrowDown') { e.preventDefault(); return this.listDrop(); }
            if (arrows[k]) { this.tabStart = null; return go(...arrows[k], sh, mod); }
            if (k === 'Enter') { e.preventDefault(); if (mod) return this.startEdit(null); if (this.tabStart != null && !sh) { const ts = this.tabStart; this.tabStart = null; return this.select(this.act[0] + 1, ts); } const s = this.sel, one = s.r0 === s.r1 && s.c0 === s.c1; if (!one) return this.cycleInSel(sh ? -1 : 1, pref('enter', 'down') === 'right'); return pref('enter', 'down') === 'right' ? this.move(0, sh ? -1 : 1) : this.move(sh ? -1 : 1, 0); }
            if (k === 'Tab') { e.preventDefault(); if (this.tabStart == null && !sh) this.tabStart = this.act[1]; const s = this.sel; if (s.r0 !== s.r1 || s.c0 !== s.c1) return this.cycleInSel(sh ? -1 : 1, true); return this.move(0, sh ? -1 : 1); }
            if (k === 'F2') { e.preventDefault(); return this.startEdit(null); }
            if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); return this.run('clear'); }
            if (k === 'Escape') { if (this.clip) { this.clip = null; this.paint(true); } return; }
            if (k === 'Home') { e.preventDefault(); return this.select(mod ? 0 : this.act[0], 0, sh); }
            if (k === 'End' && mod) { e.preventDefault(); const u = this.calc.used(this.si); return this.select(Math.max(0, u.r - 1), Math.max(0, u.c - 1), sh); }
            if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); const n = Math.max(1, Math.floor(this.vp.clientHeight / DEF_H) - 2); this.vp.scrollTop += (k === 'PageDown' ? 1 : -1) * n * DEF_H; return this.move(k === 'PageDown' ? n : -n, 0, sh); }
            if (k === 'F3' && sh) { e.preventDefault(); return this.run('fn'); }
            if (e.altKey && !mod && (k === '=' || e.code === 'Equal')) { e.preventDefault(); return this.run('autosum'); }
            if (!mod) return;
            const low = k.toLowerCase(), map = {a: 'selectall', z: sh ? 'redo' : 'undo', y: 'redo', b: 'bold', i: 'italic', u: 'underline', d: 'filldown', r: 'fillright', s: 'save', p: 'print', o: 'import', f: 'find', k: 'person', ';': 'today', '`': 'formulas'};
            if (sh && low === 'l') { e.preventDefault(); return this.run('filter'); }
            if (sh && low === 'e') { e.preventDefault(); return this.run('export'); }
            if (sh && low === 'v') { e.preventDefault(); return this.run('pastevalues'); }
            if (low === ',' || (e.code === 'Comma' && !sh)) { e.preventDefault(); return this.run('today'); }
            if (map[low] && !(low === 'r' && sh)) { e.preventDefault(); return this.run(map[low]); }
        },
        /** Entrée ou Tab dans une sélection : on avance dans la sélection */
        cycleInSel(dir, rowWise) {
            const s = this.sel; let [r, c] = this.act;
            if (rowWise) { c += dir; if (c > s.c1) { c = s.c0; r++; } if (c < s.c0) { c = s.c1; r--; } if (r > s.r1) r = s.r0; if (r < s.r0) r = s.r1; }
            else { r += dir; if (r > s.r1) { r = s.r0; c++; } if (r < s.r0) { r = s.r1; c--; } if (c > s.c1) c = s.c0; if (c < s.c0) c = s.c1; }
            this.act = [r, c]; this.reveal(r, c); this.afterSel();
        },

        /* ═════════ Écrire dans une case : dans la case ou dans la barre de formule ═════════ */
        dvAt(r, c, sh = this.S()) { for (const d of sh.dv || []) { const g = X().parseRange(d.range); if (g && X().inRange(g, r, c)) return d; } return null; },
        editText(cell) { const v = cell?.v; if (v == null) return ''; if (typeof v === 'number') return X().toStr(v); if (typeof v === 'boolean') return v ? 'VRAI' : 'FAUX'; return String(v); },
        startEdit(initial = null, {from = 'cell'} = {}) {
            if (this.edit) return;
            const [r, c] = this.act, sh = this.S(), dv = this.dvAt(r, c);
            if (dv && (dv.kind === 'person' || dv.kind === 'place') && from === 'cell') return this.openPicker(dv.kind, initial || '', dv.allowFree !== false);
            const text = initial ?? this.editText(sh.cells[X().addr(r, c)]);
            this.edit = {si: this.si, r, c, from, enterMode: initial !== null && from === 'cell', orig: this.editText(sh.cells[X().addr(r, c)]), refs: []};
            this.ed.value = text; this.fx.value = text;
            this.ed.hidden = false; this.placeEditor();
            const el = from === 'bar' ? this.fx : this.ed;
            el.focus({preventScroll: true}); if (from !== 'bar' || initial !== null) el.setSelectionRange(el.value.length, el.value.length);
            this.onEditInput(el); this.paint(true);
        },
        placeEditor() {
            const ed = this.ed, E = this.edit; if (!E) return;
            if (E.si !== this.si) { ed.hidden = true; E.hiddenEd = true; return; }
            ed.hidden = false; E.hiddenEd = false;
            const rc = this.cellRect(E.r, E.c), vw = this.vp.clientWidth;
            ed.style.left = `${Math.max(0, rc.x)}px`; ed.style.top = `${Math.max(0, rc.y)}px`; ed.style.height = 'auto'; ed.style.width = `${Math.max(rc.w, 40)}px`;
            const lines = (ed.value.match(/\n/g) || []).length + 1;
            ed.style.minHeight = `${Math.max(rc.h, lines * 19 + 6)}px`;
            ed.style.width = `${Math.min(Math.max(rc.w, ed.scrollWidth + 8), Math.max(rc.w, vw - rc.x - 4))}px`;
        },
        commitIfEditing() { if (this.edit) this.commitEdit(0, 0); },
        commitEdit(dr = 1, dc = 0) {
            const E = this.edit; if (!E) return true;
            const S = X(), sh = this.wb.sheets[E.si], k = S.addr(E.r, E.c), old = sh.cells[k], st = this.wb.styles[old?.s] || {};
            let text = this.ed.value;
            // « =SOMME(A2:A4 » : les parenthèses oubliées à la fin sont fermées, comme dans Excel et LibreOffice
            if (S.isFormula(text)) { let d = 0, q = false; for (const ch of text) { if (ch === '"') q = !q; else if (!q && ch === '(') d++; else if (!q && ch === ')') d--; } if (d > 0 && d < 20 && !q) text += ')'.repeat(d); }
            const dv = this.dvAt(E.r, E.c, sh);
            if (text !== '' && dv && !S.isFormula(text)) { // validation
                const bad = dv.kind === 'list' && dv.list?.length && !dv.allowFree && !dv.list.some(x => S.fold(x) === S.fold(text.trim())) ? `« ${text.trim()} » n’est pas dans la liste : ${dv.list.slice(0, 8).join(', ')}${dv.list.length > 8 ? '…' : ''}`
                    : dv.kind === 'number' && (S.toNum(text) === null || (dv.min != null && S.toNum(text) < dv.min) || (dv.max != null && S.toNum(text) > dv.max)) ? `Il faut un nombre${dv.min != null ? ` d’au moins ${dv.min}` : ''}${dv.max != null ? ` et au plus ${dv.max}` : ''}.`
                    : dv.kind === 'date' && (!S.readActDate(text) || S.readActDate(text).error) ? `Je ne comprends pas cette date (${S.readActDate(text)?.error || 'exemples : 7 mai 1925, vers 1784, an II'}).` : '';
                if (bad) { this.showHelp('err', `⛔ ${esc(bad)}`); (E.from === 'bar' ? this.fx : this.ed).focus(); return false; }
            }
            if (text !== E.orig || (text === '' && old)) {
                const p = S.parseInput(text, {fmt: st.fmt});
                if (p.v === null && !old?.s && !old?.note) { this.begin('Effacer'); this.put(sh, k, null); }
                else { this.begin('Saisie'); const cell = {...(old || {}), v: p.v}; if (old?.ref && text.trim() !== String(old.v ?? '').trim()) delete cell.ref; if (p.fmt && !st.fmt) cell.s = S.styleId(this.wb, {...st, fmt: p.fmt}); this.put(sh, k, cell); }
                this.commit();
            }
            this.endEdit();
            if (this.si !== E.si) this.showSheet(E.si, true);
            if (dr || dc) this.move(dr, dc); else this.render();
            return true;
        },
        cancelEdit() { this.endEdit(); this.render(); },
        endEdit() { this.edit = null; this.refPick = null; this.ed.hidden = true; this.ac.hidden = true; this.pointAt = null; this.pointAnchor = null; this.showHelp(); this.focusGrid(); },
        onEditKey(e, el) {
            const k = e.key, mod = e.metaKey || e.ctrlKey;
            if (!this.ac.hidden && this.acItems?.length) {
                if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); this.acIdx = (this.acIdx + (k === 'ArrowDown' ? 1 : this.acItems.length - 1)) % this.acItems.length; this.paintAc(); return; }
                if (k === 'Tab' || (k === 'Enter' && !e.shiftKey && !mod)) { e.preventDefault(); return this.pickFn(this.acItems[this.acIdx]); }
                if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); this.ac.hidden = true; return; }
            }
            if (k === 'Enter' && e.altKey) { e.preventDefault(); const p = el.selectionStart; el.setRangeText('\n', p, el.selectionEnd, 'end'); el.dispatchEvent(new Event('input')); return; }
            if (k === 'Enter') { e.preventDefault(); const right = pref('enter', 'down') === 'right', ts = this.tabStart, row = this.edit.r; if (ts != null && !right && !e.shiftKey) { this.tabStart = null; if (this.commitEdit(0, 0)) this.select(row + 1, ts); return; } return this.commitEdit(right ? 0 : e.shiftKey ? -1 : 1, right ? (e.shiftKey ? -1 : 1) : 0); }
            if (k === 'Tab') { e.preventDefault(); if (this.tabStart == null && !e.shiftKey) this.tabStart = this.edit.c; return this.commitEdit(0, e.shiftKey ? -1 : 1); }
            if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); return this.cancelEdit(); }
            if (k === 'F4') { e.preventDefault(); const r = X().cycleAbs(el.value, el.selectionStart); el.value = r.f; el.setSelectionRange(r.pos, r.pos); el.dispatchEvent(new Event('input')); return; }
            if (mod && k.toLowerCase() === 'z') return; // le ↶ du texte
            const arrows = {ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1]};
            if (arrows[k] && this.canPoint()) { e.preventDefault(); const [dr, dc] = arrows[k]; const p = this.pointAt || [this.edit.r, this.edit.c]; const r = Math.max(0, p[0] + dr), c = Math.max(0, p[1] + dc); const grow = e.shiftKey && this.pointAt && this.refPick && this.pointAnchor; if (!grow) this.pointAnchor = [r, c]; this.pointAt = [r, c]; const a = this.pointAnchor; this.insertRef(a[0], a[1], r, c); this.reveal(r, c); return; } // Maj + flèche : la plage s'agrandit (A2 → A2:A5)
            if (arrows[k] && el === this.ed && !String(el.value).startsWith('=') && this.edit?.enterMode) { e.preventDefault(); return this.commitEdit(...arrows[k]); }
        },
        onEditInput(el) {
            const v = el.value; this.placeEditor();
            this.edit && (this.edit.refs = v.startsWith('=') ? X().refsOf(v).map(rf => { const si = rf.sheet == null ? this.edit.si : this.wb.sheets.findIndex(s => X().fold(s.name) === X().fold(rf.sheet)); return {si, r0: rf.r0, c0: rf.c0, r1: Math.min(rf.r1, this.geometry().nR - 1), c1: Math.min(rf.c1, this.geometry().nC - 1)}; }) : []);
            this.autocomplete(el); this.sigHelp(el); this.paint(true);
        },
        /** un clic ou une flèche met une référence dans la formule (après « = ( ; + … ») */
        canPoint() {
            const E = this.edit; if (!E) return false; const el = E.from === 'bar' ? this.fx : this.ed, v = el.value;
            if (!v.startsWith('=')) return false;
            if (this.refPick && el.selectionStart === this.refPick.end) return true;
            return /[=(;,+\-*/^&<>:]\s*$/.test(v.slice(0, el.selectionStart));
        },
        insertRef(r0, c0, r1, c1) {
            const E = this.edit, el = E.from === 'bar' ? this.fx : this.ed, S = X();
            const g = {r0: Math.min(r0, r1), c0: Math.min(c0, c1), r1: Math.max(r0, r1), c1: Math.max(c0, c1)};
            const t = (this.si !== E.si ? S.quoteSheet(this.S().name) + '!' : '') + S.rangeStr(g);
            const v = el.value, start = this.refPick ? this.refPick.start : el.selectionStart, end = this.refPick ? this.refPick.end : el.selectionEnd;
            el.value = v.slice(0, start) + t + v.slice(end); this.refPick = {start, end: start + t.length};
            el.setSelectionRange(this.refPick.end, this.refPick.end);
            (el === this.ed ? this.fx : this.ed).value = el.value;
            const pick = this.refPick; this.onEditInput(el); this.refPick = pick;
        },
        /* ── liste des fonctions pendant la frappe ── */
        autocomplete(el) {
            const S = X(), v = el.value, before = v.slice(0, el.selectionStart), m = /(^=|[=(;,+\-*/^&<> ])([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.]*)$/.exec(before);
            if (!v.startsWith('=') || !m) { this.ac.hidden = true; this.acItems = []; return; }
            const q = S.fold(m[2]).toUpperCase(), names = Object.keys(S.FN);
            const hits = names.filter(n => S.fold(n).toUpperCase().startsWith(q)), en = names.filter(n => S.FN[n].en && S.FN[n].en.startsWith(q) && !hits.includes(n));
            this.acItems = [...hits, ...en].slice(0, 8); this.acIdx = 0; this.acWord = m[2];
            if (!this.acItems.length) { this.ac.hidden = true; return; }
            const rc = el.getBoundingClientRect(), base = this.$('.xl').getBoundingClientRect();
            this.ac.style.left = `${Math.max(4, Math.min(rc.left - base.left, base.width - 450))}px`; this.ac.style.top = `${rc.bottom - base.top + 2}px`;
            this.ac.hidden = false; this.paintAc();
        },
        paintAc() {
            const S = X(), w = this.acWord || '';
            this.ac.innerHTML = `<div class="xl-ac-head"><span>${plural(this.acItems.length, 'fonction')}</span><span>Tab = compléter</span></div>` + this.acItems.map((n, i) => { const f = S.FN[n], cut = S.fold(n).toUpperCase().startsWith(S.fold(w).toUpperCase()) ? w.length : 0; return `<div class="xl-ac-item${i === this.acIdx ? ' is-on' : ''}" data-fn="${esc(n)}" role="option" aria-selected="${i === this.acIdx}"><b><mark>${esc(n.slice(0, cut))}</mark>${esc(n.slice(cut))}</b>${f.en && f.en !== n ? ` <small style="display:inline">· ${esc(f.en)}</small>` : ''}<small>${esc(f.desc)}</small></div>`; }).join('');
            this.ac.querySelector('.is-on')?.scrollIntoView({block: 'nearest'});
        },
        pickFn(name) {
            const el = this.edit?.from === 'bar' ? this.fx : this.ed; if (!el) return;
            const before = el.value.slice(0, el.selectionStart), after = el.value.slice(el.selectionStart), m = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.]*)$/.exec(before);
            const nb = before.slice(0, before.length - (m ? m[1].length : 0)) + name + '(';
            el.value = nb + after.replace(/^\(/, ''); el.focus(); el.setSelectionRange(nb.length, nb.length);
            (el === this.ed ? this.fx : this.ed).value = el.value; this.ac.hidden = true; this.refPick = null; this.onEditInput(el);
        },
        /** l'aide de la fonction en cours (le morceau en cours souligné) */
        sigHelp(el) {
            const S = X(), v = el.value;
            if (!v.startsWith('=')) {
                if (!v) return this.showHelp();
                const d = /\d|\ban\s/i.test(v) && S.toNum(v) === null ? S.readActDate(v) : null;
                if (d?.error) return this.showHelp('err', `⚠️ ${esc(d.error)}`);
                if (d) return this.showHelp('ok', `✓ Compris comme une date d’acte : <b>${esc(d.label)}</b>${d.approx ? ' (approximative : les calculs montreront ≈)' : ''}`);
                return this.showHelp('', 'Texte ou nombre. Commence par <b>=</b> pour calculer.');
            }
            const before = v.slice(0, el.selectionStart), stack = []; let q = false;
            for (let i = 0; i < before.length; i++) { const ch = before[i]; if (ch === '"') q = !q; if (q) continue; if (ch === '(') { const m = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.]*)$/.exec(before.slice(0, i)); stack.push({name: m ? m[1] : '', arg: 0}); } else if (ch === ')') stack.pop(); else if ((ch === ';' || ch === ',') && stack.length) stack[stack.length - 1].arg++; }
            const top = stack[stack.length - 1], key = top && S.fnKey(top.name);
            if (key) { const f = S.FN[key], sig = f.sig, inner = sig.slice(sig.indexOf('(') + 1, -1).split(';'); const parts = inner.map((p, i) => (i === Math.min(top.arg, inner.length - 1) ? `<u><b>${esc(p.trim())}</b></u>` : esc(p.trim()))); return this.showHelp('sig', `<span class="xl-sig">${esc(key)}(${parts.join(' ; ')})</span><span>— ${esc(f.desc)}</span><button type="button" class="link-button" data-xl-cmd="fnhelp:${esc(key)}">?</button>`); }
            this.showHelp('sig', 'ƒ Formule : clique ou glisse sur des cellules pour les mettre, ou tape le nom d’une fonction (en français ou en anglais). <kbd>F4</kbd> : $A$1.');
        },
        showHelp(kind = '', html = null) {
            const h = this.help; h.className = `xl-help${kind ? ' is-' + kind : ''}`;
            if (html !== null) { h.innerHTML = html; return; }
            const S = X(), [r, c] = this.act, v = this.calc.val(this.si, r, c);
            if (S.isErr(v)) { h.className = 'xl-help is-err'; h.innerHTML = `<b>⛔ ${esc(v.code)}</b> <span>→ ${esc(S.explain(v))}</span>${v.code === '#NOM?' && v.info?.sugg ? ` <button type="button" class="link-button" data-xl-cmd="fixname">Corriger en ${esc(v.info.sugg)}</button>` : ''}`; return; }
            if (this.calc.isApprox(this.si, r, c)) { h.className = 'xl-help is-sig'; h.innerHTML = '≈ <span>Résultat approché : une des dates est approximative (« vers », « avant », « an … » sans jour).</span>'; return; }
            h.innerHTML = `<span>Astuce : tape <b>=</b> puis les premières lettres d’une fonction ; pendant une formule, clique ou glisse sur des cellules pour les y mettre. <kbd>Entrée</kbd> valide, <kbd>Échap</kbd> annule.</span>`;
        },
        /** la barre de formule et la case d'adresse suivent la case choisie */
        syncBar() {
            const S = X(), [r, c] = this.act, s = this.sel, cell = this.S().cells[S.addr(r, c)];
            const nb = this.$('[data-xl-nbox]'); if (nb && document.activeElement !== nb) nb.value = s.r0 === s.r1 && s.c0 === s.c1 ? S.addr(r, c) : S.rangeStr(s);
            if (!this.edit && document.activeElement !== this.fx) this.fx.value = cell?.v == null ? '' : this.editText(cell);
            if (!this.edit) this.showHelp();
        },
        gotoName(t) {
            const S = X(), s = String(t || '').trim(); if (!s) return;
            let m = /^(?:'((?:[^']|'')+)'|([^'!]+))!(.+)$/.exec(s), sheet = m ? (m[1] || m[2]) : null, ref = m ? m[3] : s;
            const named = !S.parseRange(ref) && Object.entries(this.wb.names || {}).find(([k]) => S.fold(k) === S.fold(ref));
            if (named) { m = /^(?:'((?:[^']|'')+)'|([^'!]+))!(.+)$/.exec(named[1]); sheet = m ? (m[1] || m[2]) : null; ref = m ? m[3] : named[1]; }
            const g = S.parseRange(String(ref).replace(/\$/g, ''));
            if (!g) { if (/^[A-Za-zÀ-ÿ_][\wÀ-ÿ.]{0,60}$/.test(s)) { this.defineName(s); return; } return toast(`« ${s} » : ni une adresse (D12, B2:C9), ni un nom du classeur.`, 'error'); }
            if (sheet) { const i = this.wb.sheets.findIndex(x => S.fold(x.name) === S.fold(sheet.replace(/''/g, "'"))); if (i < 0) return toast(`Pas de feuille « ${sheet} ».`, 'error'); if (i !== this.si) this.showSheet(i); }
            this.act = [g.r0, g.c0]; this.anchor = [g.r0, g.c0]; this.setSel(g.r0, g.c0, g.r1, g.c1, true); this.reveal(g.r0, g.c0); this.afterSel(); this.focusGrid();
        },
    });

    /* ═════════ Les commandes (menus, boutons, raccourcis) ═════════ */
    const cellsOf = (g, cap = 400000) => { const out = []; for (let r = g.r0; r <= g.r1 && out.length < cap; r++) for (let c = g.c0; c <= g.c1 && out.length < cap; c++) out.push([r, c]); return out; };
    Object.assign(Editor.prototype, {
        /** la sélection, bornée à ce qui existe (une colonne entière = jusqu'à la dernière ligne remplie) */
        selClip() { const u = this.calc.used(this.si), s = this.sel; return {r0: s.r0, c0: s.c0, r1: Math.max(s.r0, Math.min(s.r1, Math.max(u.r - 1, s.r0 + 0))), c1: Math.max(s.c0, Math.min(s.c1, Math.max(u.c - 1, s.c0)))}; },
        styleSel(fn, label = 'Mise en forme', g = this.sel) {
            const S = X(), sh = this.S(); this.begin(label);
            const geo = this.geometry(), gg = {r0: g.r0, c0: g.c0, r1: Math.min(g.r1, Math.max(geo.nR - 1, g.r0)), c1: Math.min(g.c1, Math.max(geo.nC - 1, g.c0))};
            cellsOf(gg).forEach(([r, c]) => { const k = S.addr(r, c), old = sh.cells[k], st = {...(this.wb.styles[old?.s] || {})}; fn(st, r, c, gg); const s = S.styleId(this.wb, st); if ((old?.s || 0) === s) return; this.put(sh, k, {...(old || {v: null}), s}); });
            this.commit(); this.render();
        },
        curStyle() { const c = this.S().cells[X().addr(...this.act)]; return this.wb.styles[c?.s] || {}; },
        async run(cmd, btn) {
            const S = X(), sh = this.S(), st = this.curStyle();
            if (cmd !== 'save' && cmd !== 'close' && this.edit && !['undo', 'redo'].includes(cmd) && !cmd.startsWith('fnhelp')) { if (!this.commitEdit(0, 0)) return; }
            const [p, arg] = cmd.split(':');
            switch (p) {
                case 'undo': return this.edit ? null : this.undo();
                case 'redo': return this.edit ? null : this.redo();
                case 'save': if (this.edit && !this.commitEdit(0, 0)) return; return this.save();
                case 'saveas': return this.saveAs();
                case 'savetpl': return this.saveAs(true);
                case 'close': return this.close();
                case 'new': return this.close(() => openWorkbook({onSaved: this.ctx.onSaved, onClose: this.ctx.onClose}));
                case 'template': return chooseTemplate(this.ctx);
                case 'import': return this.importFile();
                case 'export': return this.exportDialog();
                case 'print': return this.printDialog();
                case 'settings': return this.settingsDialog();
                case 'cut': case 'copy': return toast(`Utilise ${kbd(p === 'cut' ? '⌘X' : '⌘C')} dans la grille (le navigateur ne laisse pas un bouton écrire dans le presse-papiers).`);
                case 'paste': case 'pastevalues': return this.pasteFromButton(p === 'pastevalues');
                case 'clear': return this.clearSel(false);
                case 'clearall': return this.clearSel(true);
                case 'selectall': return this.selectAll();
                case 'filldown': { const s = this.sel; if (s.r1 === s.r0) { if (s.r0 === 0) return; return this.doFill({...s, r0: s.r0 - 1, r1: s.r0 - 1}, {...s, r0: s.r0 - 1}); } return this.doFill({...s, r1: s.r0}, s); }
                case 'fillright': { const s = this.sel; if (s.c1 === s.c0) { if (s.c0 === 0) return; return this.doFill({...s, c0: s.c0 - 1, c1: s.c0 - 1}, {...s, c0: s.c0 - 1}); } return this.doFill({...s, c1: s.c0}, s); }
                case 'find': return this.findDialog();
                case 'rowabove': return this.shiftSheet('row', this.sel.r0, this.sel.r1 - this.sel.r0 + 1);
                case 'rowbelow': return this.shiftSheet('row', this.sel.r1 + 1, this.sel.r1 - this.sel.r0 + 1);
                case 'colleft': return this.shiftSheet('col', this.sel.c0, this.sel.c1 - this.sel.c0 + 1);
                case 'colright': return this.shiftSheet('col', this.sel.c1 + 1, this.sel.c1 - this.sel.c0 + 1);
                case 'delrows': return this.shiftSheet('row', this.sel.r0, -(Math.min(this.sel.r1, this.geometry().nR) - this.sel.r0 + 1));
                case 'delcols': return this.shiftSheet('col', this.sel.c0, -(Math.min(this.sel.c1, this.geometry().nC) - this.sel.c0 + 1));
                case 'newsheet': return this.addSheet();
                case 'fn': return this.fnDialog();
                case 'fnhelp': return this.fnDialog(arg);
                case 'fixname': { const v = this.calc.val(this.si, ...this.act); const k = S.addr(...this.act), raw = sh.cells[k]?.v; if (!S.isErr(v) || !v.info?.sugg || typeof raw !== 'string') return; this.begin('Corriger'); this.put(sh, k, {...sh.cells[k], v: raw.replace(new RegExp(v.info.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(', 'i'), v.info.sugg + '(')}); this.commit(); return this.render(); }
                case 'autosum': return this.autoFn('SOMME');
                case 'sumfn': return this.autoFn(arg);
                case 'today': { const d = new Date(), q = n => String(n).padStart(2, '0'); const k = S.addr(...this.act); this.begin('Date du jour'); this.put(sh, k, {...(sh.cells[k] || {}), v: `${q(d.getDate())}/${q(d.getMonth() + 1)}/${d.getFullYear()}`}); this.commit(); return this.render(); }
                case 'name': return this.defineName();
                case 'comment': return this.noteDialog();
                case 'person': case 'place': return this.openPicker(p, '', true);
                case 'chart': return ext.sheetChartMenu ? ext.sheetChartMenu(this, btn) : this.chartMenu(btn); // heritage-tableur-cibles.js : types conseillés, plage liée
                case 'bold': return this.styleSel(s => { if (st.b) delete s.b; else s.b = 1; }, 'Gras');
                case 'italic': return this.styleSel(s => { if (st.i) delete s.i; else s.i = 1; }, 'Italique');
                case 'underline': return this.styleSel(s => { if (st.u) delete s.u; else s.u = 1; }, 'Souligné');
                case 'strike': return this.styleSel(s => { if (st.s) delete s.s; else s.s = 1; }, 'Barré');
                case 'wrap': return this.styleSel(s => { if (st.wrap) delete s.wrap; else s.wrap = 1; }, 'Renvoi à la ligne');
                case 'fmt': return this.styleSel(s => { if (arg) s.fmt = arg; else delete s.fmt; if (arg === 'text' || !arg) delete s.dec; }, 'Format');
                case 'dec+': case 'dec-': return this.styleSel(s => { const d = Number.isInteger(s.dec) ? s.dec : s.fmt === 'pct' || s.fmt === 'int' ? 0 : s.fmt ? 2 : (() => { const v = this.calc.val(this.si, ...this.act); return typeof v === 'number' ? Math.min(6, (String(v).split('.')[1] || '').length) : 0; })(); s.dec = Math.max(0, Math.min(10, d + (p === 'dec+' ? 1 : -1))); if (s.fmt === 'int') s.fmt = 'num'; }, 'Décimales');
                case 'al': return this.styleSel(s => { if (st.h === arg) delete s.h; else s.h = arg; }, 'Alignement');
                case 'bd': return this.styleSel((s, r, c, g) => { let b = s.bd || ''; if (arg === 'all') b = 'tblr'; else if (arg === 'none') b = ''; else if (arg === 'bottom') { if (r === g.r1) b += 'b'; } else if (arg === 'out') { if (r === g.r0) b += 't'; if (r === g.r1) b += 'b'; if (c === g.c0) b += 'l'; if (c === g.c1) b += 'r'; } b = [...new Set(b)].join(''); if (b) s.bd = b; else { delete s.bd; delete s.bs; } }, 'Bordures');
                case 'color': return this.colorBox(arg, btn);
                case 'merge': return this.toggleMerge();
                case 'colwidth': case 'rowheight': return this.sizeDialog(p === 'colwidth');
                case 'autofit': { const s = this.sel; this.begin('Largeur'); for (let c = s.c0; c <= Math.min(s.c1, s.c0 + 60); c++) this.autofit(c, true); this.commit(); return this.render(); }
                case 'hiderows': case 'hidecols': { const s = this.selClip(), rows = p === 'hiderows'; this.begin('Masquer'); this.meta(sh); if (rows) for (let r = s.r0; r <= Math.min(s.r1, s.r0 + 5000); r++) sh.rows[String(r + 1)] = {...(sh.rows[String(r + 1)] || {}), hidden: true}; else for (let c = s.c0; c <= Math.min(s.c1, s.c0 + 500); c++) sh.cols[S.colName(c)] = {...(sh.cols[S.colName(c)] || {}), hidden: true}; const t = this.commit(); this.render(); return t && this.undoable(rows ? 'Lignes masquées (Format → Tout remontrer)' : 'Colonnes masquées (Format → Tout remontrer)', t); }
                case 'showall': { this.begin('Tout remontrer'); this.meta(sh); Object.values(sh.rows).forEach(x => delete x.hidden); Object.values(sh.cols).forEach(x => delete x.hidden); this.commit(); return this.render(); }
                case 'cf': return this.cfDialog();
                case 'zebra': { this.begin('Une ligne sur deux'); this.meta(sh); if (sh.zebra) delete sh.zebra; else sh.zebra = true; this.commit(); return this.render(); }
                case 'clearfmt': return this.styleSel(s => { Object.keys(s).forEach(k => delete s[k]); }, 'Mise en forme effacée');
                case 'sortaz': case 'sortza': return this.quickSort(p === 'sortza');
                case 'sortmenu': return UI().menuAt(btn, [{icon: '↕', label: 'Trier A → Z (sur la colonne choisie)', run: () => this.quickSort(false)}, {icon: '↕', label: 'Trier Z → A', run: () => this.quickSort(true)}, '-', {icon: '⚙️', label: 'Trier sur plusieurs colonnes…', run: () => this.sortDialog()}]);
                case 'summenu': return UI().menuAt(btn, [['SOMME', 'Σ Somme'], ['MOYENNE', 'Moyenne'], ['NB', 'Nombre'], ['MIN', 'Minimum'], ['MAX', 'Maximum']].map(([f, l]) => ({label: l, run: () => this.autoFn(f)})));
                case 'sort': return this.sortDialog();
                case 'filter': return this.toggleFilter();
                case 'dedupe': return this.dedupeDialog();
                case 'split': return this.splitDialog();
                case 'validate': return this.validateDialog();
                case 'trim': { const s = this.selClip(); this.begin('Espaces'); cellsOf(s).forEach(([r, c]) => { const k = S.addr(r, c), cell = sh.cells[k]; if (typeof cell?.v === 'string' && !S.isFormula(cell.v)) { const t = cell.v.replace(/\s+/g, ' ').trim(); if (t !== cell.v) this.put(sh, k, {...cell, v: t}); } }); const t = this.commit(); this.render(); return t ? toast('Espaces en trop retirés.') : toast('Rien à retirer.'); }
                case 'fz': { this.begin('Volets'); this.meta(sh); sh.freeze = arg === 'row' ? {r: 1, c: 0} : arg === 'col' ? {r: 0, c: 1} : arg === 'here' ? {r: this.act[0], c: this.act[1]} : {r: 0, c: 0}; this.commit(); this.vp.scrollTop = 0; this.vp.scrollLeft = 0; return this.render(); }
                case 'panel': { const on = this.$('.xl-body').classList.toggle('no-panel'); setPrefs({...prefs(), panel: !on}); this.win = null; return this.render(); }
                case 'formulas': this.showFormulas = !this.showFormulas; return this.render();
                case 'gridlines': setPrefs({...prefs(), grid: pref('grid', true) === false}); return this.render();
                case 'keys': return this.keysDialog();
                case 'help': return ext.faqPopup?.('Comment se servir du tableur ?') || UI().openFaq?.('Comment se servir du tableur ?');
                case 'delsheet': return this.deleteSheet(this.si);
                default: { const fn = ext.sheetCommands?.[p]; if (typeof fn === 'function') return fn(this, arg, btn); } // commandes ajoutées par d'autres fichiers (Préparer pour…)
            }
        },
        clearSel(all) {
            const S = X(), sh = this.S(), s = this.selClip(); this.begin(all ? 'Effacer tout' : 'Effacer');
            cellsOf(s).forEach(([r, c]) => { const k = S.addr(r, c), cell = sh.cells[k]; if (!cell) return; if (all) this.put(sh, k, null); else if (cell.v != null || cell.ref) { const n = {...cell, v: null}; delete n.ref; this.put(sh, k, n); } });
            const t = this.commit(); this.render(); return t;
        },
        colorBox(kind, btn) {
            const st = this.curStyle();
            UI().openColorBox(btn, {allowNone: true, get: () => st[kind] || '', set: (v, final) => { if (!final) return; this.styleSel(s => { if (v) s[kind] = v.slice(0, 7); else delete s[kind]; }, kind === 'fill' ? 'Fond' : 'Couleur du texte'); }});
        },
        toggleMerge() {
            const S = X(), sh = this.S(), s = this.sel, inter = (sh.merges || []).filter(m => { const g = S.parseRange(m); return g.r1 >= s.r0 && g.r0 <= s.r1 && g.c1 >= s.c0 && g.c0 <= s.c1; });
            this.begin('Fusion'); this.meta(sh);
            if (inter.length) { sh.merges = sh.merges.filter(m => !inter.includes(m)); this.commit(); return this.render(); }
            if (s.r0 === s.r1 && s.c0 === s.c1) { this.commit(); return toast('Choisis d’abord plusieurs cases à fusionner.'); }
            let lost = 0; cellsOf(s, 20000).forEach(([r, c]) => { if (r === s.r0 && c === s.c0) return; const k = S.addr(r, c); if (sh.cells[k]?.v != null) { lost++; this.put(sh, k, null); } });
            sh.merges = [...(sh.merges || []), S.rangeStr(s)];
            const t = this.commit(); this.render();
            if (lost && t) this.undoable(`Cases fusionnées : ${plural(lost, 'valeur')} en plus de la première retirée${lost > 1 ? 's' : ''}`, t);
        },
        sizeDialog(col) {
            const S = X(), sh = this.S(), s = this.sel, cur = col ? this.colW(s.c0) : this.rowH(s.r0);
            A().askText({title: col ? 'Largeur de colonne' : 'Hauteur de ligne', message: `En pixels (${col ? '16 à 1200' : '12 à 600'}) :`, value: String(cur), okLabel: 'Enregistrer'}).then(v => {
                const n = Math.round(Number(String(v ?? '').replace(',', '.'))); if (!v || !Number.isFinite(n)) return;
                this.begin(col ? 'Largeur' : 'Hauteur'); this.meta(sh);
                if (col) for (let c = s.c0; c <= Math.min(s.c1, s.c0 + 500); c++) sh.cols[S.colName(c)] = {...(sh.cols[S.colName(c)] || {}), w: Math.max(16, Math.min(1200, n))};
                else for (let r = s.r0; r <= Math.min(s.r1, s.r0 + 5000); r++) sh.rows[String(r + 1)] = {...(sh.rows[String(r + 1)] || {}), h: Math.max(12, Math.min(600, n))};
                this.commit(); this.render();
            });
        },
        autofit(c, inTx = false) {
            const S = X(), sh = this.S(), u = this.calc.used(this.si), ctx = (this.measure = this.measure || document.createElement('canvas').getContext('2d'));
            ctx.font = `13px ${getComputedStyle(this.dlg).fontFamily || 'Arial'}`; let w = 30;
            for (let r = 0; r < Math.min(u.r, 3000); r++) { const cell = sh.cells[S.addr(r, c)]; const v = this.calc.val(this.si, r, c); if (v == null || v === '') continue; const st = this.wb.styles[cell?.s] || {}; ctx.font = `${st.b ? 'bold ' : ''}${st.fs || 13}px ${getComputedStyle(this.dlg).fontFamily || 'Arial'}`; w = Math.max(w, ctx.measureText(S.formatValue(v, st)).width + (cell?.ref ? 34 : 14)); }
            if (!inTx) this.begin('Largeur'); this.meta(sh); sh.cols[S.colName(c)] = {...(sh.cols[S.colName(c)] || {}), w: Math.max(30, Math.min(600, Math.ceil(w)))}; if (!inTx) { this.commit(); this.render(); }
        },
        autoFn(fn) {
            const S = X(), sh = this.S(), s = this.sel, num = (r, c) => typeof this.calc.val(this.si, r, c) === 'number';
            this.begin(fn);
            if (s.r0 === s.r1 && s.c0 === s.c1) { // une case : la colonne au-dessus (ou la ligne à gauche)
                const [r, c] = this.act; let a = r - 1; while (a >= 0 && num(a, c)) a--;
                if (a < r - 1) this.put(sh, S.addr(r, c), {...(sh.cells[S.addr(r, c)] || {}), v: `=${fn}(${S.addr(a + 1, c)}:${S.addr(r - 1, c)})`});
                else { let b = c - 1; while (b >= 0 && num(r, b)) b--; this.put(sh, S.addr(r, c), {...(sh.cells[S.addr(r, c)] || {}), v: b < c - 1 ? `=${fn}(${S.addr(r, b + 1)}:${S.addr(r, c - 1)})` : `=${fn}()`}); }
                this.commit(); if (/\(\)$/.test(sh.cells[S.addr(...this.act)]?.v || '')) { this.render(); return this.startEdit(`=${fn}(`); }
                return this.render();
            }
            const g = this.selClip(); for (let c = g.c0; c <= g.c1; c++) { const k = S.addr(g.r1 + 1, c); if (sh.cells[k]?.v != null) continue; this.put(sh, k, {...(sh.cells[k] || {}), v: `=${fn}(${S.addr(g.r0, c)}:${S.addr(g.r1, c)})`}); }
            this.commit(); this.render();
        },
        defineName(given) {
            const S = X(), ref = `${S.quoteSheet(this.S().name)}!${S.rangeStr(this.sel)}`;
            const go = n => { n = String(n || '').trim(); if (!n) return; if (!/^[A-Za-zÀ-ÿ_][\wÀ-ÿ.]{0,60}$/.test(n) || S.parseAddr(n)) return toast('Un nom commence par une lettre, sans espace (ex. Total, Âges_1836).', 'error'); this.begin('Nom'); this.wb.names = {...(this.wb.names || {}), [n]: ref}; this.commit(); toast(`Nom « ${n} » = ${ref} : tape =SOMME(${n}) dans une formule.`); this.render(); };
            if (given) return go(given);
            A().askText({title: 'Nom pour la plage', message: `Un nom pour ${ref} (pour écrire =SOMME(Total) au lieu de =SOMME(D2:D40)) :`, value: '', okLabel: 'Enregistrer'}).then(go);
        },
        noteDialog() {
            const S = X(), sh = this.S(), k = S.addr(...this.act), cell = sh.cells[k];
            A().askText({title: `💬 Note sur ${k}`, message: 'La note s’affiche au survol de la case (un petit coin orange). Vide = pas de note.', value: cell?.note || '', okLabel: 'Enregistrer'}).then(v => { if (v == null) return; this.begin('Note'); const n = {...(cell || {v: null})}; if (String(v).trim()) n.note = String(v).slice(0, 2000); else delete n.note; this.put(sh, k, n); this.commit(); this.render(); });
        },
        keysDialog() {
            try { localStorage.setItem('genealogie-editor-shortcuts-tab', 'sheet'); } catch (_) {}
            ext.openDialog({eyebrow: 'TABLEUR', title: '⌨️ Raccourcis du tableur', wide: true, body: '<div data-xl-keys></div>', onOpen: d => { const box = d.querySelector('[data-xl-keys]'); if (ext.editorKeysPanel) ext.editorKeysPanel(box); else box.innerHTML = A().empty('Raccourcis indisponibles.'); }});
        },
        settingsDialog() {
            const p = prefs();
            ext.openDialog({eyebrow: 'TABLEUR', title: '⚙️ Réglages du tableur', submitLabel: 'Enregistrer', body: `<label class="field">Après <kbd>Entrée</kbd>, aller<select name="enter"><option value="down"${p.enter !== 'right' ? ' selected' : ''}>vers le bas</option><option value="right"${p.enter === 'right' ? ' selected' : ''}>vers la droite (saisie de relevés en ligne)</option></select></label>
                <label class="field">Séparateur des fichiers CSV<select name="csv"><option value=";"${(p.csv || ';') === ';' ? ' selected' : ''}>point-virgule « ; » (Excel en français)</option><option value=","${p.csv === ',' ? ' selected' : ''}>virgule « , »</option><option value="\t"${p.csv === '\t' ? ' selected' : ''}>tabulation</option></select></label>
                <label class="field">Largeur des colonnes d’une feuille neuve<input type="number" data-unit="px" name="colw" min="40" max="300" value="${esc(p.colw || DEF_W)}"></label>
                <label class="checkbox-line"><input type="checkbox" name="grid"${p.grid === false ? '' : ' checked'}> Quadrillage</label>
                <label class="checkbox-line"><input type="checkbox" name="panel"${p.panel === false ? '' : ' checked'}> Panneau de droite ouvert</label>`,
                onSubmit: f => { setPrefs({...prefs(), enter: f.elements.enter.value, csv: f.elements.csv.value, colw: Math.max(40, Math.min(300, Number(f.elements.colw.value) || DEF_W)), grid: f.elements.grid.checked, panel: f.elements.panel.checked}); this.$('.xl-body').classList.toggle('no-panel', !f.elements.panel.checked); this.render(); UI()?.savedStatus && toast('Réglages enregistrés.', 'success'); }});
        },

        /* ── recopie (poignée, ⌘D, ⌘R) ── */
        fillPlan(f, to) {
            const S = X(), sh = this.S(), out = [];
            const vertical = to.r0 !== f.r0 || to.r1 !== f.r1, n = vertical ? f.r1 - f.r0 + 1 : f.c1 - f.c0 + 1, fwd = vertical ? to.r1 > f.r1 : to.c1 > f.c1;
            const count = vertical ? (fwd ? to.r1 - f.r1 : f.r0 - to.r0) : (fwd ? to.c1 - f.c1 : f.c0 - to.c0);
            if (count <= 0) return out;
            const lines = vertical ? [f.c0, f.c1] : [f.r0, f.r1];
            for (let l = lines[0]; l <= lines[1]; l++) {
                const at = i => (vertical ? [i, l] : [l, i]), first = vertical ? f.r0 : f.c0, last = vertical ? f.r1 : f.c1;
                const seeds = []; for (let i = first; i <= last; i++) seeds.push(sh.cells[S.addr(...at(i))] || null);
                const raws = seeds.map(c => c?.v ?? null), consts = raws.every(v => !S.isFormula(v));
                const series = consts ? S.fillSeries(fwd ? raws.filter(v => v != null) : raws.filter(v => v != null).reverse(), count) : null;
                for (let j = 1; j <= count; j++) {
                    const pos = fwd ? last + j : first - j, srcIdx = fwd ? (j - 1) % n : (n - 1) - ((j - 1) % n), src = seeds[srcIdx], srcPos = first + srcIdx;
                    let v = src?.v ?? null;
                    if (S.isFormula(v)) v = vertical ? S.shiftFormula(v, pos - srcPos, 0) : S.shiftFormula(v, 0, pos - srcPos);
                    else if (series && raws.some(x => x != null)) v = series[j - 1];
                    const cell = {v}; if (src?.s) cell.s = src.s;
                    out.push({k: S.addr(...at(pos)), cell});
                }
            }
            return out;
        },
        doFill(f, to) {
            const sh = this.S(), plan = this.fillPlan(f, to); if (!plan.length) return this.paint(true);
            this.begin('Recopie'); plan.forEach(({k, cell}) => this.put(sh, k, cell.v == null && !cell.s ? null : cell)); this.commit();
            this.act = [to.r0, to.c0]; this.anchor = [to.r0, to.c0]; this.setSel(to.r0, to.c0, to.r1, to.c1, true); this.render();
        },

        /* ── lignes et colonnes insérées / supprimées : les formules suivent ── */
        shiftSheet(axis, at, n) {
            const S = X(), sh = this.S(), name = sh.name; if (!n) return;
            if (n < 0 && axis === 'row' && -n > 100000 || n < 0 && axis === 'col' && -n > 5000) return toast('Trop de lignes ou de colonnes d’un coup.', 'error');
            const pos = p => { if (n > 0) return p >= at ? p + n : p; if (p >= at && p < at - n) return null; return p >= at - n ? p + n : p; };
            const adj = f => S.adjustFormula(f, {own: name, target: name, axis, at, n});
            this.begin(n > 0 ? 'Insertion' : 'Suppression');
            const cells = {};
            for (const k in sh.cells) { const p = S.parseAddr(k); const q = axis === 'row' ? pos(p[0]) : pos(p[1]); if (q === null) continue; const nk = axis === 'row' ? S.addr(q, p[1]) : S.addr(p[0], q); const cell = {...sh.cells[k]}; if (S.isFormula(cell.v)) cell.v = adj(cell.v); cells[nk] = cell; }
            this.swap(sh, cells);
            this.wb.sheets.forEach(o => { if (o === sh) return; for (const k in o.cells) { const v = o.cells[k]?.v; if (S.isFormula(v)) { const w = S.adjustFormula(v, {own: o.name, target: name, axis, at, n}); if (w !== v) this.put(o, k, {...o.cells[k], v: w}); } } });
            this.meta(sh);
            const rng = r => { const w = adj('=' + r); return /#REF!/.test(w) ? null : w.slice(1); };
            if (axis === 'col') { const cols = {}; Object.entries(sh.cols).forEach(([k, v]) => { const q = pos(S.colNum(k)); if (q !== null) cols[S.colName(q)] = v; }); sh.cols = cols; }
            else { const rows = {}; Object.entries(sh.rows).forEach(([k, v]) => { const q = pos(Number(k) - 1); if (q !== null) rows[String(q + 1)] = v; }); sh.rows = rows; }
            sh.merges = sh.merges.map(rng).filter(Boolean); sh.cf = sh.cf.map(x => ({...x, range: rng(x.range)})).filter(x => x.range); sh.dv = sh.dv.map(x => ({...x, range: rng(x.range)})).filter(x => x.range);
            if (sh.filter) { const r = rng(sh.filter.range); if (r) sh.filter = {range: r}; else delete sh.filter; }
            Object.entries(this.wb.names || {}).forEach(([k, v]) => { const m = /^(?:'((?:[^']|'')+)'|([^'!]+))!(.+)$/.exec(v); if (m && S.fold((m[1] || m[2]).replace(/''/g, "'")) === S.fold(name)) { const r = rng(m[3]); if (r) this.wb.names[k] = `${S.quoteSheet(name)}!${r}`; else delete this.wb.names[k]; } });
            const t = this.commit(); this.hiddenRows.delete(sh.id); this.refreshFilter(); this.render();
            if (t && n < 0) this.undoable(`${plural(-n, axis === 'row' ? 'ligne' : 'colonne')} supprimée${-n > 1 ? 's' : ''}`, t);
        },

        /* ── trier ── */
        region(r = this.act[0], c = this.act[1]) { // le bloc de cases remplies autour de la case choisie
            const filled = (rr, cc) => { if (rr < 0 || cc < 0) return false; const v = this.calc.val(this.si, rr, cc); return v != null && v !== ''; };
            let g = {r0: r, c0: c, r1: r, c1: c}, grew = true, n = 0;
            while (grew && n++ < 2000) { grew = false;
                if (g.r0 > 0) for (let cc = g.c0 - 1; cc <= g.c1 + 1; cc++) if (filled(g.r0 - 1, cc)) { g.r0--; grew = true; break; }
                for (let cc = g.c0 - 1; cc <= g.c1 + 1; cc++) if (filled(g.r1 + 1, cc)) { g.r1++; grew = true; break; }
                if (g.c0 > 0) for (let rr = g.r0 - 1; rr <= g.r1 + 1; rr++) if (filled(rr, g.c0 - 1)) { g.c0--; grew = true; break; }
                for (let rr = g.r0 - 1; rr <= g.r1 + 1; rr++) if (filled(rr, g.c1 + 1)) { g.c1++; grew = true; break; }
                if (g.r1 - g.r0 > 200000) break; }
            return g;
        },
        sortTarget() { const s = this.sel; return s.r0 === s.r1 && s.c0 === s.c1 ? this.region() : this.selClip(); },
        hasHeader(g) { const S = X(); if (g.r1 <= g.r0) return false; let txt = 0, nums = 0, cells = 0; for (let c = g.c0; c <= g.c1; c++) { const a = this.calc.val(this.si, g.r0, c), b = this.calc.val(this.si, g.r0 + 1, c); if (a == null || a === '') continue; cells++; if (typeof a === 'string') txt++; if (typeof b === 'number' && typeof a === 'string') nums++; } const st = this.wb.styles[this.S().cells[S.addr(g.r0, g.c0)]?.s] || {}; return cells > 0 && (txt === cells && (nums > 0 || st.b || (this.S().freeze?.r || 0) > g.r0)); },
        sortRange(g, keys, header) {
            const S = X(), sh = this.S(), r0 = g.r0 + (header ? 1 : 0); if (r0 >= g.r1 + 1) return;
            const rows = []; for (let r = r0; r <= g.r1; r++) rows.push({r, k: keys.map(x => S.sortKey(this.calc.val(this.si, r, x.c)))});
            rows.sort((a, b) => { for (let i = 0; i < keys.length; i++) { const d = S.compareKeys(a.k[i], b.k[i]); if (d) { const emptyA = a.k[i][0] === 3, emptyB = b.k[i][0] === 3; if (emptyA || emptyB) return emptyA ? 1 : -1; return keys[i].desc ? -d : d; } } return a.r - b.r; });
            this.begin('Tri');
            const snap = {}; for (let r = r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) { const k = S.addr(r, c); if (sh.cells[k]) snap[k] = sh.cells[k]; }
            rows.forEach((row, i) => { const to = r0 + i; for (let c = g.c0; c <= g.c1; c++) { const src = snap[S.addr(row.r, c)]; let cell = src ? {...src} : null; if (cell && S.isFormula(cell.v) && to !== row.r) cell.v = S.shiftFormula(cell.v, to - row.r, 0); const k = S.addr(to, c); if ((sh.cells[k] || null) !== (src || null) || to !== row.r) this.put(sh, k, cell); } });
            this.commit(); this.render();
        },
        quickSort(desc) { const g = this.sortTarget(), c = this.act[1]; if (c < g.c0 || c > g.c1) return; this.sortRange(g, [{c, desc}], this.hasHeader(g)); toast(`Trié ${desc ? 'Z → A' : 'A → Z'} sur la colonne ${X().colName(c)}${this.hasHeader(g) ? ' (la 1re ligne, ce sont les titres)' : ''}.`); },
        sortDialog() {
            const S = X(), g = this.sortTarget(), header = this.hasHeader(g), cols = []; for (let c = g.c0; c <= g.c1; c++) cols.push([c, header ? S.toStr(this.calc.val(this.si, g.r0, c)) || S.colName(c) : `Colonne ${S.colName(c)}`]);
            const sel = (n, v) => `<select name="k${n}"><option value="">—</option>${cols.map(([c, l]) => `<option value="${c}"${v === c ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select><select name="d${n}"><option value="">A → Z (croissant)</option><option value="1">Z → A (décroissant)</option></select>`;
            ext.openDialog({eyebrow: 'DONNÉES', title: 'Trier', submitLabel: 'Trier', body: `<p class="muted">Plage ${S.rangeStr(g)} · les dates d’actes (« vers 1784 », « an II ») se rangent à leur date.</p><label class="checkbox-line"><input type="checkbox" name="h"${header ? ' checked' : ''}> La première ligne, ce sont les titres</label><div class="field">Trier par ${sel(1, this.act[1])}</div><div class="field">Puis par ${sel(2)}</div><div class="field">Puis par ${sel(3)}</div>`,
                onSubmit: f => { const keys = [1, 2, 3].map(i => ({c: f.elements['k' + i].value === '' ? null : Number(f.elements['k' + i].value), desc: !!f.elements['d' + i].value})).filter(x => x.c !== null); if (!keys.length) return UI().fail(f.elements.k1, 'Choisis au moins une colonne.'); this.sortRange(g, keys, f.elements.h.checked); }});
        },

        /* ── filtrer : la barre H10 au-dessus de la grille ── */
        filterCols() { const g = this.S().filter ? X().parseRange(this.S().filter.range) : null; const s = new Set(); if (g) for (let c = g.c0; c <= g.c1; c++) s.add(c); return s; },
        toggleFilter() {
            const sh = this.S(); this.begin('Filtre'); this.meta(sh);
            if (sh.filter) { delete sh.filter; this.hiddenRows.delete(sh.id); }
            else { const g = this.sel.r0 !== this.sel.r1 ? this.selClip() : this.region(); if (g.r1 <= g.r0) { this.commit(); return toast('Choisis un tableau avec une ligne de titres et des lignes en dessous.'); } sh.filter = {range: X().rangeStr(g)}; }
            this.commit(); this.refreshFilter(); this.render();
        },
        refreshFilter() {
            const box = this.$('[data-xl-filter]'); if (!box) return;
            const S = X(), sh = this.S(), g = sh.filter ? S.parseRange(sh.filter.range) : null;
            box.innerHTML = ''; box.hidden = !g; if (!g) return;
            const cols = [], filters = [];
            for (let c = g.c0; c <= g.c1; c++) {
                const label = S.toStr(this.calc.val(this.si, g.r0, c)) || `Colonne ${S.colName(c)}`, count = new Map();
                for (let r = g.r0 + 1; r <= g.r1; r++) { const v = S.formatValue(this.calc.val(this.si, r, c), this.wb.styles[sh.cells[S.addr(r, c)]?.s] || {}); count.set(v, (count.get(v) || 0) + 1); }
                const opts = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([v, n]) => [v === '' ? '∅' : v, `${v === '' ? '(vide)' : v} (${n})`]);
                cols.push([c, label]); if (opts.length > 1) filters.push({id: 'c' + c, label, type: 'check', options: opts, chip: v => `${label} : ${[].concat(v).map(x => (x === '∅' ? '(vide)' : x)).join(', ')}`});
            }
            const bar = this.fbar = UI().listBar({key: `tableur:${this.id || 'nouveau'}:${sh.id}`, search: {placeholder: 'Chercher dans le tableau… (nom, métier)'}, filters,
                sort: {options: [['', 'Dans l’ordre du tableau'], ...cols.flatMap(([c, l]) => [[`${c}:a`, `${l}, A → Z`], [`${c}:z`, `${l}, Z → A`]])], value: ''}, count: {n: 0, label: 'ligne'},
                onChange: (st, {what} = {}) => { if (what === 'sort' && st.sort) { const [c, d] = st.sort.split(':'); this.sortRange(S.parseRange(sh.filter.range), [{c: Number(c), desc: d === 'z'}], true); } this.applyFilter(st); }});
            box.appendChild(bar); this.applyFilter(bar.state, false);
        },
        applyFilter(st, draw = true) {
            const S = X(), sh = this.S(), g = sh.filter ? S.parseRange(sh.filter.range) : null; if (!g) return;
            const words = S.fold(st.q || '').split(/\s+/).filter(Boolean), hidden = new Set(); let shown = 0;
            for (let r = g.r0 + 1; r <= g.r1; r++) {
                let ok = true; const texts = [];
                for (let c = g.c0; c <= g.c1; c++) { const v = S.formatValue(this.calc.val(this.si, r, c), this.wb.styles[sh.cells[S.addr(r, c)]?.s] || {}); texts.push(v); const f = st.filters?.['c' + c]; if (ok && Array.isArray(f) && f.length && !f.includes(v === '' ? '∅' : v)) ok = false; }
                if (ok && words.length) { const t = S.fold(texts.join(' ')); ok = words.every(w => t.includes(w)); }
                if (ok) shown++; else hidden.add(r);
            }
            this.hiddenRows.set(sh.id, hidden); this.geo = null;
            this.fbar?.setCount?.(`${plural(shown, 'ligne')} sur ${g.r1 - g.r0}`);
            if (draw) this.render();
        },

        /* ── nettoyer : doublons, texte → colonnes, validation, mise en forme conditionnelle, chercher ── */
        dedupeDialog() {
            const S = X(), sh = this.S(), g = this.sortTarget(), header = this.hasHeader(g), r0 = g.r0 + (header ? 1 : 0);
            const cols = []; for (let c = g.c0; c <= g.c1; c++) cols.push([c, header ? S.toStr(this.calc.val(this.si, g.r0, c)) : `Colonne ${S.colName(c)}`]);
            const dups = keep => { const seen = new Set(), out = []; for (let r = r0; r <= g.r1; r++) { const k = keep.map(c => S.fold(S.toStr(this.calc.val(this.si, r, c)).trim())).join('\u0001'); if (seen.has(k)) out.push(r); else seen.add(k); } return out; };
            ext.openDialog({eyebrow: 'DONNÉES', title: 'Supprimer les doublons', submitLabel: 'Supprimer les doublons',
                body: `<p class="muted">Plage ${S.rangeStr(g)}${header ? ' · la 1re ligne, ce sont les titres' : ''}. La première ligne de chaque groupe reste.</p><div class="xl-cols">Compare les colonnes : ${cols.map(([c, l]) => `<label class="checkbox-line"><input type="checkbox" name="c${c}" checked> ${esc(l)}</label>`).join('')}</div><div data-xl-dn></div>`,
                onOpen: d => { const upd = () => { const keep = cols.filter(([c]) => d.querySelector(`[name=c${c}]`).checked).map(([c]) => c), list = keep.length ? dups(keep) : []; d.querySelector('[data-xl-dn]').innerHTML = UI().notice(list.length ? 'info' : 'ok', list.length ? `${plural(list.length, 'ligne')} en double (ligne${list.length > 1 ? 's' : ''} ${list.slice(0, 12).map(r => r + 1).join(', ')}${list.length > 12 ? '…' : ''}).` : 'Aucune ligne en double.'); const b = d.querySelector('[type=submit]'); b.textContent = list.length ? `Supprimer ${plural(list.length, 'ligne')}` : 'Supprimer les doublons'; b.disabled = !list.length; }; d.addEventListener('change', upd); upd(); },
                onSubmit: f => {
                    const keep = cols.filter(([c]) => f.elements['c' + c].checked).map(([c]) => c); if (!keep.length) return UI().fail(f.elements['c' + cols[0][0]], 'Coche au moins une colonne.');
                    const drop = new Set(dups(keep)); if (!drop.size) return;
                    this.begin('Doublons'); const snap = {}; for (let r = r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) snap[S.addr(r, c)] = sh.cells[S.addr(r, c)] || null;
                    let to = r0; for (let r = r0; r <= g.r1; r++) { if (drop.has(r)) continue; for (let c = g.c0; c <= g.c1; c++) { let cell = snap[S.addr(r, c)]; if (cell && S.isFormula(cell.v) && to !== r) cell = {...cell, v: S.shiftFormula(cell.v, to - r, 0)}; if (to !== r) this.put(sh, S.addr(to, c), cell ? {...cell} : null); } to++; }
                    for (let r = to; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) this.put(sh, S.addr(r, c), null);
                    const t = this.commit(); this.render(); if (t) this.undoable(`${plural(drop.size, 'ligne')} en double supprimée${drop.size > 1 ? 's' : ''}`, t);
                }});
        },
        splitDialog() {
            const S = X(), sh = this.S(), s = this.selClip(), c = this.act[1], rows = [];
            for (let r = s.r0; r <= s.r1; r++) { const v = sh.cells[S.addr(r, c)]?.v; if (typeof v === 'string' && !S.isFormula(v)) rows.push([r, v]); }
            if (!rows.length) return toast('Choisis des cases de texte dans une colonne (ex. « MARTIN Jean, 34 ans, laboureur »).');
            let sep = ',';
            const cut = (v, f) => { let parts = sep === 'space' ? v.trim().split(/\s+/) : v.split(sep === 'tab' ? '\t' : sep === 'other' ? (f.elements.other.value || '|') : sep); parts = parts.map(x => x.trim()); if (f.elements.ans.checked) parts = parts.map(x => x.replace(/^(\d+)\s*ans?$/i, '$1')); if (f.elements.caps.checked && parts.length) { const m = /^((?:[A-ZÀ-Ý][A-ZÀ-Ý'’-]+\s*)+)\s+(.+)$/.exec(parts[0]); if (m) parts.splice(0, 1, m[1].trim(), m[2].trim()); } return parts; };
            const prev = f => { const data = rows.slice(0, 8).map(([, v]) => cut(v, f)), w = Math.max(...data.map(p => p.length)); return `<div class="xl-prev"><table><tbody>${data.map(p => `<tr>${Array.from({length: w}, (_, i) => `<td>${esc(p[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; };
            ext.openDialog({eyebrow: 'DONNÉES', title: 'Convertir le texte en colonnes', submitLabel: 'Convertir',
                body: `<div class="field">Couper à :<div class="xl-seps">${[[',', ', virgule'], [';', '; point-virgule'], ['space', 'espace'], ['tab', 'tabulation'], ['other', 'Autre…']].map(([k, l]) => `<button type="button" class="button small secondary${k === ',' ? ' is-active' : ''}" data-sep="${k}">${esc(l)}</button>`).join('')}<input name="other" placeholder="|" maxlength="5" style="width:70px"></div></div>
                    <label class="checkbox-line"><input type="checkbox" name="ans" checked> « 34 ans » devient 34</label><label class="checkbox-line"><input type="checkbox" name="caps" checked> Le nom en capitales devient une colonne à part (« MARTIN Jean » → MARTIN | Jean)</label><div data-xl-sp></div><p class="muted">Les morceaux vont dans la colonne ${S.colName(c)} et les suivantes (ce qui s’y trouve est remplacé ; ↶ pour revenir).</p>`,
                onOpen: d => { const f = d.querySelector('form'), up = () => { d.querySelector('[data-xl-sp]').innerHTML = prev(f); }; d.addEventListener('click', e => { const b = e.target.closest('[data-sep]'); if (!b) return; sep = b.dataset.sep; d.querySelectorAll('[data-sep]').forEach(x => x.classList.toggle('is-active', x === b)); up(); }); d.addEventListener('input', up); d.addEventListener('change', up); up(); },
                onSubmit: f => { this.begin('Texte en colonnes'); rows.forEach(([r, v]) => cut(v, f).forEach((part, i) => { const k = S.addr(r, c + i), old = sh.cells[k]; this.put(sh, k, {...(old || {}), v: S.parseInput(part).v}); })); const t = this.commit(); this.render(); if (t) this.undoable(`${plural(rows.length, 'ligne')} coupée${rows.length > 1 ? 's' : ''} en colonnes`, t); }});
        },
        validateDialog() {
            const S = X(), sh = this.S(), s = this.sel.r1 - this.sel.r0 > 100000 ? this.selClip() : this.sel, range = S.rangeStr(s), cur = this.dvAt(...this.act);
            ext.openDialog({eyebrow: 'DONNÉES', title: 'Validation des données', submitLabel: 'Enregistrer', onDelete: cur ? () => { this.begin('Validation'); this.meta(sh); sh.dv = sh.dv.filter(d => d !== cur); this.commit(); this.render(); } : null,
                body: `<p class="muted">Pour ${esc(range)} : ce qu’on peut écrire dans ces cases.</p>
                    <label class="field">Autoriser<select name="kind"><option value="list">Une liste de choix (menu ▾)</option><option value="person">👤 Une personne de la base (menu de choix)</option><option value="place">📍 Un lieu de la base (menu de choix)</option><option value="number">Un nombre entre…</option><option value="date">Une date d’acte (vers 1784, an II…)</option></select></label>
                    <label class="field" data-k="list">Les choix (un par ligne)<textarea name="list" rows="5">${esc((cur?.list || []).join('\n'))}</textarea></label>
                    <div data-k="number" class="field">Entre <input type="number" name="min" value="${esc(cur?.min ?? '')}" style="width:100px"> et <input type="number" name="max" value="${esc(cur?.max ?? '')}" style="width:100px"></div>
                    <label class="checkbox-line" data-k="free"><input type="checkbox" name="free"${cur?.allowFree ? ' checked' : ''}> Garder aussi un texte libre (sans fiche, ou hors de la liste)</label>`,
                onOpen: d => { const k = d.querySelector('[name=kind]'); if (cur) k.value = cur.kind; const up = () => { d.querySelectorAll('[data-k]').forEach(x => { x.hidden = !(x.dataset.k === k.value || (x.dataset.k === 'free' && ['list', 'person', 'place'].includes(k.value))); }); }; k.addEventListener('change', up); up(); },
                onSubmit: f => {
                    const kind = f.elements.kind.value, d = {range, kind}; if (f.elements.free.checked) d.allowFree = true;
                    if (kind === 'list') { d.list = f.elements.list.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 300); if (!d.list.length) return UI().fail(f.elements.list, 'Écris au moins un choix.'); }
                    if (kind === 'number') { if (f.elements.min.value !== '') d.min = Number(f.elements.min.value); if (f.elements.max.value !== '') d.max = Number(f.elements.max.value); }
                    this.begin('Validation'); this.meta(sh); sh.dv = [...(sh.dv || []).filter(x => x.range !== range && x !== cur), d].slice(-60); this.commit(); this.render();
                }});
        },
        listDrop() {
            const S = X(), dv = this.dvAt(...this.act); if (!dv) return;
            if (dv.kind === 'person' || dv.kind === 'place') return this.openPicker(dv.kind, '', dv.allowFree !== false);
            if (dv.kind !== 'list') return;
            const rc = this.cellRect(...this.act), box = this.vp.getBoundingClientRect();
            UI().menuAt({x: box.left + rc.x, y: box.top + rc.y + rc.h}, dv.list.map(v => ({label: v, run: () => { const sh = this.S(), k = S.addr(...this.act); this.begin('Choix'); this.put(sh, k, {...(sh.cells[k] || {}), v: S.parseInput(v).v}); this.commit(); this.render(); this.focusGrid(); }})), {title: 'Choisir'});
        },
        cfDialog() {
            const S = X(), sh = this.S(), range = S.rangeStr(this.sel.r1 - this.sel.r0 > 100000 ? this.selClip() : this.sel);
            const OPS = [['>', 'plus grande que'], ['<', 'plus petite que'], ['>=', 'au moins'], ['<=', 'au plus'], ['=', 'égale à'], ['<>', 'différente de'], ['between', 'entre'], ['contains', 'contient le texte'], ['empty', 'est vide'], ['notempty', 'n’est pas vide'], ['dup', 'est en double'], ['baddate', 'est une date impossible'], ['scale', 'barres dans la cellule']];
            const FILLS = [['#fff1a8', 'Jaune'], ['#ffd6d6', 'Rouge'], ['#d8f3dc', 'Vert'], ['#dbe8ff', 'Bleu'], ['#ffe2bf', 'Orange'], ['#ead9ff', 'Violet']];
            ext.openDialog({eyebrow: 'FORMAT', title: 'Mise en forme conditionnelle', submitLabel: 'Ajouter la règle', wide: true,
                body: `<p class="muted">Une couleur quand la valeur le demande : l’erreur ou la valeur étrange saute aux yeux.</p>
                    <div class="xl-cols">Prêtes à l’emploi : <button type="button" class="button small secondary" data-pre="age">« âge > 100 ans »</button><button type="button" class="button small secondary" data-pre="bad">« date impossible »</button><button type="button" class="button small secondary" data-pre="dup">« doublons »</button><button type="button" class="button small secondary" data-pre="bars">« barres »</button></div>
                    <label class="field">Plage<input name="range" value="${esc(range)}" required></label>
                    <div class="field">Si la valeur <select name="op">${OPS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select> <input name="v" style="width:120px"> <span data-two hidden>et <input name="v2" style="width:120px"></span></div>
                    <div class="field">alors <select name="fill">${FILLS.map(([c, l]) => `<option value="${c}">fond ${esc(l.toLowerCase())}</option>`).join('')}</select> <label class="checkbox-line" style="display:inline-flex"><input type="checkbox" name="b"> en gras</label></div>`,
                onOpen: d => { const f = d.querySelector('form'), up = () => { const op = f.elements.op.value; d.querySelector('[data-two]').hidden = op !== 'between'; f.elements.v.hidden = ['empty', 'notempty', 'dup', 'baddate', 'scale'].includes(op); };
                    f.elements.op.addEventListener('change', up); up();
                    d.addEventListener('click', e => { const b = e.target.closest('[data-pre]'); if (!b) return; const p = {age: ['>', '100', '#fff1a8'], bad: ['baddate', '', '#ffd6d6'], dup: ['dup', '', '#ffe2bf'], bars: ['scale', '', '#dbe8ff']}[b.dataset.pre]; f.elements.op.value = p[0]; f.elements.v.value = p[1]; f.elements.fill.value = p[2]; up(); }); },
                onSubmit: f => { const g = S.parseRange(f.elements.range.value); if (!g) return UI().fail(f.elements.range, 'Une plage comme D2:D40.'); const op = f.elements.op.value; if (['>', '<', '>=', '<=', 'between'].includes(op) && S.toNum(f.elements.v.value) === null) return UI().fail(f.elements.v, 'Écris un nombre.');
                    this.begin('Règle'); this.meta(sh); sh.cf = [...(sh.cf || []), {range: S.rangeStr(g), op, v: f.elements.v.value, v2: f.elements.v2.value, style: {fill: f.elements.fill.value, color: '', b: f.elements.b.checked ? 1 : 0}}].slice(-60); this.commit(); this.render(); }});
        },
        findDialog() {
            const S = X();
            ext.openDialog({eyebrow: 'ÉDITION', title: '🔍 Rechercher et remplacer', submitLabel: 'Remplacer tout',
                body: `<label class="field">Chercher<input name="q" type="text" required data-ui-off></label><label class="field">Remplacer par<input name="to" type="text"></label><label class="checkbox-line"><input type="checkbox" name="all"> Dans toutes les feuilles</label><label class="checkbox-line"><input type="checkbox" name="case"> Respecter les capitales</label><button type="button" class="button small secondary" data-next>Chercher le suivant</button> <span class="muted" data-found></span>`,
                onOpen: d => { const f = d.querySelector('form'); d.querySelector('[data-next]').addEventListener('click', () => { const hit = this.findNext(f.elements.q.value, f.elements.case.checked, f.elements.all.checked); d.querySelector('[data-found]').textContent = hit ? `Trouvé en ${hit}` : 'Rien trouvé.'; }); },
                onSubmit: f => {
                    const q = f.elements.q.value; if (!q) return UI().fail(f.elements.q, 'Écris ce qu’il faut chercher.');
                    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), f.elements.case.checked ? 'g' : 'gi'); let n = 0;
                    this.begin('Remplacer'); (f.elements.all.checked ? this.wb.sheets : [this.S()]).forEach(sh => { for (const k in sh.cells) { const v = sh.cells[k]?.v; if (typeof v === 'string' && rx.test(v)) { rx.lastIndex = 0; const w = v.replace(rx, f.elements.to.value); if (w !== v) { n++; this.put(sh, k, {...sh.cells[k], v: w}); } } rx.lastIndex = 0; } });
                    const t = this.commit(); this.render(); if (t) this.undoable(`${plural(n, 'case')} modifiée${n > 1 ? 's' : ''}`, t); else toast('Rien à remplacer.');
                }});
        },
        findNext(q, cs, all) {
            if (!q) return null; const S = X(), want = cs ? q : S.fold(q), list = all ? this.wb.sheets.map((s, i) => i) : [this.si];
            const order = []; list.forEach(si => { const sh = this.wb.sheets[si]; Object.keys(sh.cells).map(k => [S.parseAddr(k), k]).sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1]).forEach(([p, k]) => order.push([si, p, k])); });
            const cur = order.findIndex(([si, p]) => si === this.si && (p[0] > this.act[0] || (p[0] === this.act[0] && p[1] > this.act[1])));
            for (let i = 0; i < order.length; i++) { const [si, p, k] = order[(Math.max(0, cur) + i) % order.length]; const v = S.formatValue(this.calc.val(si, p[0], p[1])) + ' ' + String(this.wb.sheets[si].cells[k]?.v ?? ''); if ((cs ? v : S.fold(v)).includes(want)) { if (si !== this.si) this.showSheet(si); this.select(p[0], p[1]); return `${this.wb.sheets[si].name} ! ${k}`; } }
            return null;
        },
        fnDialog(focus = '') {
            const S = X(), fams = [...new Set(Object.values(S.FN).map(f => f.fam))];
            const list = q => { const w = S.fold(q); return fams.map(fam => { const items = Object.values(S.FN).filter(f => f.fam === fam && (!w || S.fold(`${f.name} ${f.en} ${f.desc}`).includes(w))); return items.length ? `<div class="xl-fam">${esc(fam)}</div>${items.map(f => `<button type="button" data-fn="${esc(f.name)}"><b>${esc(f.sig)}</b>${f.en ? ` <span class="muted">· ${esc(f.en)}</span>` : ''}<small>${esc(f.desc)}</small></button>`).join('')}` : ''; }).join('') || A().empty('Aucune fonction ne correspond.'); };
            ext.openDialog({eyebrow: 'INSERTION', title: 'ƒ Choisir une fonction', body: `<input type="search" name="q" placeholder="Chercher… (âge, somme, recherche)" value="${esc(focus)}"><div class="xl-fnlist" data-fl>${list(focus)}</div>`,
                onOpen: d => { d.querySelector('[name=q]').addEventListener('input', e => { d.querySelector('[data-fl]').innerHTML = list(e.target.value); }); d.addEventListener('click', e => { const b = e.target.closest('[data-fn]'); if (!b) return; d.close(); if (this.edit) { const el = this.edit.from === 'bar' ? this.fx : this.ed; el.focus(); el.setRangeText(b.dataset.fn + '(', el.selectionStart, el.selectionEnd, 'end'); el.dispatchEvent(new Event('input')); } else this.startEdit('=' + b.dataset.fn + '('); }); }});
        },

        /* ── une personne ou un lieu dans une cellule : le menu de choix unique (pickerField), tel quel ── */
        openPicker(kind, initial = '', allowFree = true) {
            this.closePicker();
            const P = window.LCNDA_PICKER || A(); if (!P?.pickerField) return toast('Le menu de choix n’est pas chargé.', 'error');
            const S = X(), [r, c] = this.act, k = S.addr(r, c), rc = this.cellRect(r, c), wrap = this.$('.xl-vpwrap');
            const box = this.pickBox = document.createElement('div'); box.className = 'xl-pickbox';
            box.innerHTML = `<div class="xl-pick-h"><span>${kind === 'place' ? '📍 Un lieu' : '👤 Une personne'} pour ${esc(k)}</span><button type="button" class="icon-button small" data-xl-pickx aria-label="Fermer">×</button></div>${P.pickerField({name: '', hiddenName: false, kind, allowFree, inline: true})}`;
            box.style.left = `${Math.max(4, Math.min(rc.x, wrap.clientWidth - 370))}px`; box.style.top = `${Math.max(4, Math.min(rc.y + rc.h, wrap.clientHeight - 60))}px`;
            wrap.appendChild(box);
            box.addEventListener('click', e => { if (e.target.closest('[data-xl-pickx]')) this.closePicker(); });
            box.addEventListener('keydown', e => { if (e.key === 'Escape' && !box.querySelector('.pk-list:not([hidden]), [role=listbox]:not([hidden])')) { e.preventDefault(); e.stopPropagation(); this.closePicker(); } });
            box.addEventListener('picker-open', e => e.preventDefault());
            box.addEventListener('picker-change', e => {
                const d = e.detail || {}, v = d.value; if (v == null || v === '') return;
                const sh = this.S(), old = sh.cells[k], cell = {...(old || {})};
                if (typeof v === 'string' && v.startsWith('txt:')) { cell.v = v.slice(4); delete cell.ref; }
                else { cell.v = d.item?.title || d.item?.name || String(v); cell.ref = {kind, id: Number(d.item?.id ?? v)}; }
                this.begin(kind === 'place' ? 'Lieu' : 'Personne'); this.put(sh, k, cell); this.commit();
                this.closePicker(); this.move(1, 0);
            });
            setTimeout(() => { const inp = box.querySelector('input:not([type=hidden])'); if (!inp) return; inp.focus(); if (initial) { inp.value = initial; inp.dispatchEvent(new Event('input', {bubbles: true})); } }, 30);
        },
        closePicker() { if (!this.pickBox) return; this.pickBox.remove(); this.pickBox = null; this.focusGrid(); },
    });

    /* ═════════ Panneau E2, barre d'outils, onglets, barre d'état ═════════ */
    const OPL = {'>': 'plus grande que', '<': 'plus petite que', '>=': 'au moins', '<=': 'au plus', '=': 'égale à', '<>': 'différente de', between: 'entre', contains: 'contient', empty: 'vide', notempty: 'pas vide', dup: 'en double', baddate: 'date impossible', scale: 'barres'};
    Object.assign(Editor.prototype, {
        buildPanel() {
            const U = UI(), sec = (key, title, body, open = true) => U.panelSection({title, key: 'xl-' + key, open, body}).replace('<details', `<details data-tb="${key}" data-tb-label="${esc(title)}"`);
            this.$('[data-xl-panel]').innerHTML = sec('cell', 'Cellule', '<div data-xl-p="cell"></div>') + sec('num', 'Nombre et date', '<div data-xl-p="num"></div>') + sec('color', 'Couleur et bordures', '<div data-xl-p="color"></div>', false) + sec('cf', 'Mise en forme conditionnelle', '<div data-xl-p="cf"></div>') + sec('dv', 'Validation', '<div data-xl-p="dv"></div>', false);
        },
        syncPanel() {
            const P = s => this.$(`[data-xl-p="${s}"]`); if (!P('cell')) return;
            const S = X(), sh = this.S(), [r, c] = this.act, k = S.addr(r, c), cell = sh.cells[k], raw = cell?.v ?? null, v = this.calc.val(this.si, r, c), st = this.wb.styles[cell?.s] || {};
            const row = (l, h) => `<div class="xl-r"><span>${esc(l)}</span><span>${h}</span></div>`;
            P('cell').innerHTML = row('Adresse', `<b>${esc(sh.name)} ! ${esc(k)}</b>`) + row('Valeur', esc(v == null ? '—' : S.formatValue(v, st, {approx: this.calc.isApprox(this.si, r, c)}))) + row('Formule', S.isFormula(raw) ? `<code>${esc(raw)}</code>` : '—') + row('Sorte', esc(cell?.ref ? (cell.ref.kind === 'place' ? '📍 Lieu de la base' : '👤 Personne de la base') : S.kindOf(raw, v)))
                + (S.isErr(v) ? `<p class="xl-help is-err" style="margin:6px 0 0">${esc(S.explain(v))}</p>` : '') + (cell?.note ? row('Note', esc(cell.note)) : '')
                + (cell?.ref ? `<button type="button" class="button small secondary" data-xl-pcmd="openref">↗ ${cell.ref.kind === 'place' ? 'Lieu' : 'Fiche'}</button>` : '');
            const dateOk = typeof raw === 'string' && /\d|\ban\s/i.test(raw) && !S.isFormula(raw) ? S.readActDate(raw) : null;
            P('num').innerHTML = row('Format', `<select data-xl-pfmt aria-label="Format">${FORMATS.map(([f, l]) => `<option value="${f}"${(st.fmt || '') === f ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`) + row('Décimales', `<input type="number" min="0" max="10" data-xl-pdec value="${Number.isInteger(st.dec) ? st.dec : ''}" placeholder="auto" aria-label="Décimales">`)
                + (dateOk ? row('Date d’acte', dateOk.error ? `⚠️ ${esc(dateOk.error)}` : `✓ « ${esc(raw)} » est comprise${dateOk.approx ? ' (≈)' : ''}`) : '');
            const sw = c2 => `<span class="xl-sw" style="display:inline-block;width:14px;height:14px;vertical-align:middle;border:1.5px solid currentColor;${c2 ? `background:${S.safeCol(c2)}` : 'background:repeating-linear-gradient(45deg,transparent 0 3px,#999 3px 4px)'}"></span>`;
            P('color').innerHTML = row('Texte', `<button type="button" class="button small secondary" data-xl-cmd="color:color">${sw(st.color || '#000000')} ${esc(st.color || 'Noir')}</button>`) + row('Fond', `<button type="button" class="button small secondary" data-xl-cmd="color:fill">${sw(st.fill)} ${esc(st.fill || 'Aucune')}</button>`)
                + row('Bordures', `<span class="xl-bd"><button type="button" class="icon-button small" data-xl-cmd="bd:all" title="Tout">▦</button><button type="button" class="icon-button small" data-xl-cmd="bd:out" title="Contour">▭</button><button type="button" class="icon-button small" data-xl-cmd="bd:bottom" title="En bas">▁</button><button type="button" class="icon-button small" data-xl-cmd="bd:none" title="Aucune">⊘</button></span>`);
            P('cf').innerHTML = ((sh.cf || []).map((x, i) => `<div class="xl-rule"><span class="xl-sw" style="background:${S.safeCol(x.style?.fill) || 'transparent'}"></span><span>${esc(x.range)} : ${esc(OPL[x.op] || x.op)}${x.v !== '' && !['empty', 'notempty', 'dup', 'baddate', 'scale'].includes(x.op) ? ' ' + esc(x.v) : ''}${x.op === 'between' ? ' et ' + esc(x.v2) : ''}</span><button type="button" class="icon-button small" data-xl-pcmd="cfdel:${i}" title="Retirer la règle" aria-label="Retirer la règle">✕</button></div>`).join('') || A().empty('Aucune règle sur cette feuille.', {icon: '🎨'})) + '<button type="button" class="button small secondary" data-xl-cmd="cf">＋ Ajouter une règle…</button>';
            const dv = this.dvAt(r, c);
            P('dv').innerHTML = (dv ? row('Autorise', esc({list: 'Une liste : ' + (dv.list || []).slice(0, 6).join(', '), person: '👤 Une personne de la base', place: '📍 Un lieu de la base', number: `Un nombre${dv.min != null ? ' ≥ ' + dv.min : ''}${dv.max != null ? ' ≤ ' + dv.max : ''}`, date: 'Une date d’acte'}[dv.kind])) + row('Plage', esc(dv.range)) + (dv.allowFree ? row('Sinon', 'Garder le texte') : '') : A().empty('Pas de validation ici.', {icon: '✓'})) + '<button type="button" class="button small secondary" data-xl-cmd="validate">Validation des données…</button>';
        },
        panelCmd(cmd) {
            const S = X(), sh = this.S(), cell = sh.cells[S.addr(...this.act)];
            if (cmd === 'openref' && cell?.ref) { if (cell.ref.kind === 'person') { if (this.dirty) return toast('Enregistre d’abord le classeur (💾), puis ouvre la fiche.'); this.dlg.close(); A().openPersonById?.(cell.ref.id); } else toast(`${cell.v} : lieu n° ${cell.ref.id} de ta base.`); return; }
            const m = /^cfdel:(\d+)$/.exec(cmd); if (m) { this.begin('Règle retirée'); this.meta(sh); const rule = sh.cf[Number(m[1])]; sh.cf = sh.cf.filter((_, i) => i !== Number(m[1])); const t = this.commit(); this.render(); if (t) this.undoable(`Règle « ${rule.range} » retirée`, t); }
        },
        syncTools() {
            const st = this.curStyle(), on = (cmd, v) => this.dlg.querySelectorAll(`.xl-tools [data-xl-cmd="${cmd}"]`).forEach(b => b.classList.toggle('is-on', !!v));
            on('bold', st.b); on('italic', st.i); on('underline', st.u); on('wrap', st.wrap); on('al:left', st.h === 'left'); on('al:center', st.h === 'center'); on('al:right', st.h === 'right');
            on('merge', !!this.mergeOf(...this.act)); on('filter', !!this.S().filter);
            const f = this.$('[data-xl-fmt]'); if (f) f.value = st.fmt || '';
            const sw = k => { const i = this.$(`[data-xl-sw="${k}"]`); if (i) i.style.background = X().safeCol(st[k]) || (k === 'color' ? '#000' : 'transparent'); }; sw('color'); sw('fill');
            const p = this.$('[data-xl-cmd="panel"]'); if (p) p.querySelector('span').textContent = this.$('.xl-body').classList.contains('no-panel') ? 'Panneau de droite : montrer' : 'Panneau de droite : cacher';
        },
        paintTabs() {
            const box = this.$('[data-xl-tabs]');
            box.innerHTML = this.wb.sheets.map((s, i) => `<button type="button" role="tab" draggable="true" aria-selected="${i === this.si}" class="xl-tab${i === this.si ? ' is-active' : ''}" data-xl-sheet="${i}" title="Double-clic : renommer · clic droit : plus d’actions"${s.color ? ` style="border-bottom-color:${X().safeCol(s.color)}"` : ''}>${esc(s.name)}</button>`).join('') + '<button type="button" class="xl-tab-add" data-xl-sheet="add" title="Ajouter une feuille" aria-label="Ajouter une feuille">＋</button>';
            box.querySelector('.is-active')?.scrollIntoView({block: 'nearest', inline: 'nearest'});
        },
        showSheet(i, keepEdit = false) {
            if (i === this.si || !this.wb.sheets[i]) return;
            if (this.edit && !keepEdit && !this.canPoint()) { if (!this.commitEdit(0, 0)) return; }
            this.view.set(this.S().id, {t: this.vp.scrollTop, l: this.vp.scrollLeft, act: this.act, sel: this.sel});
            this.si = i; this.geo = null; this.win = null; this.wb.active = i;
            const v = this.view.get(this.S().id); this.act = v?.act || [0, 0]; this.anchor = [...this.act]; this.sel = v?.sel || {r0: 0, c0: 0, r1: 0, c1: 0};
            this.refreshFilter(); this.render(); this.vp.scrollTop = v?.t || 0; this.vp.scrollLeft = v?.l || 0; this.paint(true);
            if (this.edit) { this.placeEditor(); (this.edit.hiddenEd ? this.fx : this.ed).focus({preventScroll: true}); } else this.focusGrid();
        },
        addSheet() {
            this.begin('Nouvelle feuille'); const sh = X().newSheet(X().cleanSheetName(`Feuille ${this.wb.sheets.length + 1}`, this.wb.sheets.map(s => s.name)));
            const w = pref('colw', DEF_W); if (w !== DEF_W) for (let c = 0; c < 26; c++) sh.cols[X().colName(c)] = {w};
            this.wb.sheets.splice(this.si + 1, 0, sh); this.commit(); this.showSheet(this.si + 1); this.render();
        },
        renameSheet(i) {
            const S = X(), sh = this.wb.sheets[i];
            A().askText({title: 'Renommer la feuille', message: 'Nouveau nom :', value: sh.name, okLabel: 'Renommer'}).then(n => {
                n = String(n || '').trim(); if (!n || n === sh.name) return;
                const name = S.cleanSheetName(n, this.wb.sheets.filter(s => s !== sh).map(s => s.name)), old = sh.name;
                this.begin('Renommer'); this.meta(sh); sh.name = name;
                this.wb.sheets.forEach(o => { for (const k in o.cells) { const v = o.cells[k]?.v; if (S.isFormula(v)) { const w = S.renameInFormula(v, old, name); if (w !== v) this.put(o, k, {...o.cells[k], v: w}); } } });
                Object.entries(this.wb.names || {}).forEach(([k, v]) => { const m = /^(?:'((?:[^']|'')+)'|([^'!]+))!(.+)$/.exec(v); if (m && S.fold((m[1] || m[2]).replace(/''/g, "'")) === S.fold(old)) this.wb.names[k] = `${S.quoteSheet(name)}!${m[3]}`; });
                this.commit(); this.render();
            });
        },
        dupSheet(i) {
            const S = X(), src = this.wb.sheets[i], copy = JSON.parse(JSON.stringify({...src, _used: undefined}));
            copy.id = S.newSheet().id; copy.name = S.cleanSheetName(`${src.name} (copie)`, this.wb.sheets.map(s => s.name));
            this.begin('Dupliquer'); this.wb.sheets.splice(i + 1, 0, copy); this.commit(); this.showSheet(i + 1); this.render();
        },
        deleteSheet(i) {
            if (this.wb.sheets.length < 2) return toast('Un classeur garde au moins une feuille.');
            const name = this.wb.sheets[i].name; this.begin('Supprimer la feuille'); this.wb.sheets.splice(i, 1); this.si = Math.max(0, Math.min(this.si >= i ? this.si - (this.si > i ? 1 : 0) : this.si, this.wb.sheets.length - 1)); if (this.si >= this.wb.sheets.length) this.si = this.wb.sheets.length - 1;
            const t = this.commit(); this.geo = null; this.refreshFilter(); this.render(); if (t) this.undoable(`Feuille « ${name} » supprimée`, t);
        },
        moveSheet(from, to) { this.begin('Ranger les feuilles'); const [sh] = this.wb.sheets.splice(from, 1); this.wb.sheets.splice(to, 0, sh); const cur = this.S(); this.si = this.wb.sheets.indexOf(this.si === from ? sh : cur); if (this.si < 0) this.si = to; this.commit(); this.si = this.wb.sheets.indexOf(sh); this.geo = null; this.render(); },
        sheetMenu(i, e) {
            const sh = this.wb.sheets[i];
            UI().contextMenu(e, [{icon: '✎', label: 'Renommer', run: () => this.renameSheet(i)}, {icon: '⧉', label: 'Dupliquer', run: () => this.dupSheet(i)}, {icon: '🎨', label: 'Couleur de l’onglet…', run: () => { const b = this.$(`[data-xl-sheet="${i}"]`); UI().openColorBox(b, {allowNone: true, get: () => sh.color || '', set: (v, fin) => { if (!fin) return; this.begin('Couleur'); this.meta(sh); if (v) sh.color = v.slice(0, 7); else delete sh.color; this.commit(); this.render(); }}); }},
                {icon: '←', label: 'Déplacer à gauche', disabled: i === 0, run: () => this.moveSheet(i, i - 1)}, {icon: '→', label: 'Déplacer à droite', disabled: i === this.wb.sheets.length - 1, run: () => this.moveSheet(i, i + 1)}, '-', {icon: '🗑', label: 'Supprimer la feuille', danger: true, disabled: this.wb.sheets.length < 2, run: () => this.deleteSheet(i)}], {title: `« ${sh.name} »`});
        },
        paintStatus() {
            const S = X(), s = this.sel, n = (s.r1 - s.r0 + 1) * (s.c1 - s.c0 + 1), want = pref('status', ['sum', 'avg', 'count']);
            let sum = 0, cnt = 0, min = Infinity, max = -Infinity, vals = 0; const g = n > 1 ? this.selClip() : s;
            if (n > 1 || true) for (let r = g.r0; r <= g.r1 && vals < 600000; r++) { if (this.hiddenRows.get(this.S().id)?.has(r)) continue; for (let c = g.c0; c <= g.c1; c++) { vals++; const v = this.calc.val(this.si, r, c); const x = typeof v === 'number' ? v : v instanceof S.SDate ? v.serial : null; if (x !== null) { sum += x; cnt++; if (x < min) min = x; if (x > max) max = x; } } }
            const where = n > 1 ? `${S.rangeStr(s)} · ${plural(n, 'cellule')}` : `${S.addr(...this.act)} · 1 cellule`;
            const parts = cnt ? [want.includes('sum') ? `Somme <b>${fmtN(sum)}</b>` : '', want.includes('avg') ? `Moyenne <b>${fmtN(sum / cnt)}</b>` : '', want.includes('count') ? `Nb <b>${cnt}</b>` : '', want.includes('min') ? `Min <b>${fmtN(min)}</b>` : '', want.includes('max') ? `Max <b>${fmtN(max)}</b>` : ''].filter(Boolean) : [];
            this.$('[data-xl-status]').innerHTML = [where, ...parts].join(' · ');
        },
        statusMenu(el) {
            const want = pref('status', ['sum', 'avg', 'count']), tog = k => { const w = want.includes(k) ? want.filter(x => x !== k) : [...want, k]; setPrefs({...prefs(), status: w}); this.paintStatus(); };
            UI().menuAt(el, [['sum', 'Somme'], ['avg', 'Moyenne'], ['count', 'Nombre'], ['min', 'Minimum'], ['max', 'Maximum']].map(([k, l]) => ({icon: want.includes(k) ? '✓' : ' ', label: l, run: () => tog(k)})), {title: 'Dans la barre d’état'});
        },
        onContext(e) {
            const h = this.hit(e); if (!h) return; e.preventDefault(); e.stopPropagation();
            if (h.zone === 'cell' && !(X().inRange(this.sel, h.r, h.c))) this.select(h.r, h.c);
            const rows = h.zone === 'rowh', cols = h.zone === 'colh';
            if (rows && !(h.r >= this.sel.r0 && h.r <= this.sel.r1 && this.sel.c1 - this.sel.c0 > 20)) this.clickAt(h, {shiftKey: false});
            if (cols && !(h.c >= this.sel.c0 && h.c <= this.sel.c1 && this.sel.r1 - this.sel.r0 > 100)) this.clickAt(h, {shiftKey: false});
            const items = [
                {icon: '📋', label: 'Copier', shortcut: '⌘C', run: () => toast(`Utilise ${kbd('⌘C')} : le navigateur ne laisse pas un menu écrire dans le presse-papiers.`)},
                {icon: '📋', label: 'Coller les valeurs seulement', shortcut: '⇧⌘V', run: () => this.run('pastevalues')}, '-',
                ...(cols ? [] : [{icon: '＋', label: 'Insérer une ligne au-dessus', run: () => this.run('rowabove')}, {icon: '＋', label: 'Insérer une ligne en dessous', run: () => this.run('rowbelow')}]),
                ...(rows ? [] : [{icon: '＋', label: 'Insérer une colonne à gauche', run: () => this.run('colleft')}, {icon: '＋', label: 'Insérer une colonne à droite', run: () => this.run('colright')}]), '-',
                {icon: '↕', label: 'Trier A → Z', run: () => this.run('sortaz')}, {icon: '⚲', label: this.S().filter ? 'Retirer le filtre' : 'Filtrer', run: () => this.run('filter')},
                {icon: '💬', label: 'Note…', run: () => this.run('comment')}, {icon: '👤', label: 'Une personne de la base', shortcut: '⌘K', run: () => this.run('person')},
                ...(rows ? [{icon: '🙈', label: 'Masquer les lignes', run: () => this.run('hiderows')}] : cols ? [{icon: '🙈', label: 'Masquer les colonnes', run: () => this.run('hidecols')}, {icon: '↔', label: 'Ajuster la largeur', run: () => this.run('autofit')}] : []), '-',
                {icon: '⌫', label: 'Effacer le contenu', shortcut: '⌫', run: () => this.run('clear')},
                ...(cols ? [] : [{icon: '🗑', label: 'Supprimer les lignes', danger: true, run: () => this.run('delrows')}]),
                ...(rows ? [] : [{icon: '🗑', label: 'Supprimer les colonnes', danger: true, run: () => this.run('delcols')}]),
            ];
            UI().contextMenu(e, items);
        },

        /* ═════════ Copier, couper, coller (aussi depuis Excel ou Google Sheets : TSV et HTML) ═════════ */
        onCopy(e, cut) {
            const S = X(), sh = this.S(), g = this.selClip(), rows = [], html = [], cells = [];
            if ((g.r1 - g.r0 + 1) * (g.c1 - g.c0 + 1) > 500000) { e.preventDefault(); return toast('Sélection trop grande pour le presse-papiers.', 'error'); }
            for (let r = g.r0; r <= g.r1; r++) { const tr = [], th = []; if (this.hiddenRows.get(sh.id)?.has(r)) continue; for (let c = g.c0; c <= g.c1; c++) { const k = S.addr(r, c), cell = sh.cells[k], st = this.wb.styles[cell?.s] || {}, v = this.calc.val(this.si, r, c), t = S.formatValue(v, st); tr.push(/[\t\n"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t); th.push(`<td style="${st.b ? 'font-weight:bold;' : ''}${st.i ? 'font-style:italic;' : ''}${st.fill ? `background:${S.safeCol(st.fill)};` : ''}${st.color ? `color:${S.safeCol(st.color)};` : ''}${st.h ? `text-align:${st.h};` : ''}">${esc(t)}</td>`); if (cell) cells.push({dr: r - g.r0, dc: c - g.c0, cell: {...cell}, r, c}); } rows.push(tr.join('\t')); html.push(`<tr>${th.join('')}</tr>`); }
            const tsv = rows.join('\n');
            e.preventDefault(); e.clipboardData.setData('text/plain', tsv); e.clipboardData.setData('text/html', `<table>${html.join('')}</table>`);
            this.clip = {sheet: sh, g, tsv, cells, cut}; this.paint(true);
            toast(cut ? 'Coupé : choisis où coller, puis ' + kbd('⌘V') + '.' : `${plural((g.r1 - g.r0 + 1) * (g.c1 - g.c0 + 1), 'cellule')} copiée${(g.r1 - g.r0 + 1) * (g.c1 - g.c0 + 1) > 1 ? 's' : ''}.`);
        },
        onPaste(e) {
            const text = e.clipboardData?.getData('text/plain') || '', html = e.clipboardData?.getData('text/html') || '';
            const files = [...(e.clipboardData?.files || [])];
            e.preventDefault();
            if (!text && files.length) return this.importFile(files[0]);
            this.pasteData(text, html, false);
        },
        async pasteFromButton(valuesOnly) {
            let text = ''; try { text = await navigator.clipboard.readText(); } catch (_) { return toast(`Utilise ${kbd('⌘V')} dans la grille pour coller.`); }
            this.pasteData(text, '', valuesOnly);
        },
        pasteData(text, html, valuesOnly) {
            const S = X(), sh = this.S(), [r0, c0] = this.act, norm = t => String(t || '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
            this.begin('Coller');
            if (this.clip && norm(text) === norm(this.clip.tsv) && !valuesOnly) { // dans l'app : formules recopiées, mise en forme gardée
                const cl = this.clip, dr0 = r0 - cl.g.r0, dc0 = c0 - cl.g.c0;
                if (cl.cut) cl.cells.forEach(x => { const k = S.addr(x.r, x.c); if (cl.sheet.cells[k] && !(sh === cl.sheet && X().inRange({r0, c0, r1: r0 + cl.g.r1 - cl.g.r0, c1: c0 + cl.g.c1 - cl.g.c0}, x.r, x.c))) this.put(cl.sheet, k, null); });
                for (let r = 0; r <= cl.g.r1 - cl.g.r0; r++) for (let c = 0; c <= cl.g.c1 - cl.g.c0; c++) { const x = cl.cells.find(y => y.dr === r && y.dc === c), k = S.addr(r0 + r, c0 + c); if (!x) { this.put(sh, k, null); continue; } const cell = {...x.cell}; if (S.isFormula(cell.v) && !cl.cut) cell.v = S.shiftFormula(cell.v, dr0, dc0); this.put(sh, k, cell); }
                if (cl.cut) this.clip = null;
                this.commit(); this.setSel(r0, c0, r0 + cl.g.r1 - cl.g.r0, c0 + cl.g.c1 - cl.g.c0, true); return this.render();
            }
            const {rows, styles} = S.parseClipboard(text, valuesOnly ? '' : html);
            if (!rows.length) { this.commit(); return; }
            if (rows.length * Math.max(...rows.map(x => x.length)) > S.LIMITS.cells) { this.commit(); return toast('Trop de cellules à coller.', 'error'); }
            const wide = Math.max(...rows.map(x => x.length));
            rows.forEach((row, i) => row.forEach((t, j) => { const k = S.addr(r0 + i, c0 + j), old = sh.cells[k], ost = this.wb.styles[old?.s] || {}; const p = valuesOnly && this.clip ? {v: (() => { const v = this.calc.val(this.si, r0 + i, c0 + j); return v; })()} : S.parseInput(t, {fmt: ost.fmt}); const cell = {...(old || {}), v: valuesOnly ? S.parseInput(t, {fmt: ost.fmt}).v : p.v}; delete cell.ref; const st = styles?.[i]?.[j]; if (st || p.fmt) cell.s = S.styleId(this.wb, {...ost, ...(st || {}), ...(p.fmt && !ost.fmt ? {fmt: p.fmt} : {})}); this.put(sh, k, cell.v == null && !cell.s ? null : cell); }));
            const t = this.commit(); this.setSel(r0, c0, r0 + rows.length - 1, c0 + wide - 1, true); this.render();
            if (t && rows.length * wide > 1) toast(`${plural(rows.length, 'ligne')} collée${rows.length > 1 ? 's' : ''}${styles?.length ? ' (avec le gras et les couleurs)' : ''}.`);
        },

        /* ═════════ 📊 Graphique depuis la sélection : l'éditeur de diagrammes existant, avec les données ═════════ */
        chartData() {
            const S = X(), g = this.sel.r0 === this.sel.r1 && this.sel.c0 === this.sel.c1 ? this.region() : this.selClip();
            const m = []; for (let r = g.r0; r <= g.r1 && m.length < 400; r++) { if (this.hiddenRows.get(this.S().id)?.has(r)) continue; const row = []; for (let c = g.c0; c <= g.c1; c++) row.push(this.calc.val(this.si, r, c)); m.push(row); }
            if (!m.length) return null;
            const isN = v => typeof v === 'number', head = m.length > 1 && m[0].some(v => typeof v === 'string' && v !== '') && m[1].some(isN);
            const body = head ? m.slice(1) : m, cols = m[0].length;
            const labelCol = body.every(r => !isN(r[0]) || (r[0] > 1000 && r[0] < 2200 && Number.isInteger(r[0]))) && cols > 1 ? 0 : -1;
            const serCols = []; for (let c = 0; c < cols; c++) if (c !== labelCol && body.some(r => isN(r[c]))) serCols.push(c);
            if (!serCols.length) return null;
            const series = serCols.map(c => ({name: head ? S.toStr(m[0][c]) : `Série ${serCols.indexOf(c) + 1}`}));
            const rows = body.map((r, i) => { const o = {label: labelCol >= 0 ? S.toStr(r[labelCol]) : String(i + 1)}; serCols.forEach((c, j) => { o['s' + j] = isN(r[c]) ? r[c] : 0; }); return o; });
            return {series, rows, title: head && labelCol >= 0 ? S.toStr(m[0][labelCol]) : this.S().name, range: S.rangeStr(g)};
        },
        chartMenu(btn) {
            const d = this.chartData(); if (!d) return toast('Choisis une plage avec des nombres (par exemple : Décennie, Hommes, Femmes).');
            if (!ext.openDiagramEditor) return toast('L’éditeur de diagrammes n’est pas chargé.', 'error');
            const open = kind => ext.openDiagramEditor(null, {spec: {kind, o: {title: d.title}, series: d.series, rows: d.rows}, name: `${d.title} (${this.S().name} ! ${d.range})`});
            const items = [{icon: '📊', label: d.series.length > 1 ? 'Colonnes groupées' : 'Colonnes', run: () => open('columns')}, {icon: '📶', label: 'Barres horizontales', run: () => open('bars')}, {icon: '📈', label: 'Courbe', run: () => open('line')}];
            if (d.series.length === 1) items.push({icon: '🥧', label: 'Camembert', run: () => open('pie')});
            const anchor = btn && btn.isConnected && btn.offsetParent ? btn : this.$('[data-xl-cmd="chart"]');
            UI().menuAt(anchor || {x: innerWidth / 2, y: 120}, items, {title: `Conseillés pour ${d.range}`});
        },

        /* ═════════ Importer (K13), exporter (E3), imprimer (K13) ═════════ */
        importFile(file) {
            const S = X(), ACCEPT = '.csv,.tsv,.txt,.xlsx,.ods,.json,.lcnda-tableur';
            const kinds = {csv: 'CSV', tsv: 'TSV (tabulations)', xlsx: 'Excel (.xlsx)', ods: 'LibreOffice (.ods)', json: 'JSON'};
            const go = files => UI().openImportDialog({title: '⤒ Importer un tableau', accept: ACCEPT, noun: 'ligne', feminine: true, files,
                analyze: async files => {
                    const f = files[0], r = await S.readFile(f.name, await f.arrayBuffer());
                    const sh0 = r.wb.sheets[0], g = S.usedRange(sh0), rowsN = r.wb.sheets.reduce((n, s) => n + ((S.usedRange(s)?.r1 ?? -1) + 1), 0);
                    const calc = new S.Calc(r.wb), m = g ? S.matrix(r.wb, calc, 0, {r0: 0, c0: 0, r1: Math.min(g.r1, 7), c1: Math.min(g.c1, 7)}, {display: true}) : [];
                    const accents = (() => { const t = Object.values(sh0.cells).map(c => (typeof c.v === 'string' ? c.v : '')).join(' '); return [...new Set((t.match(/[\p{L}-]*[àâäéèêëîïôöùûüçœÀÂÉÈÊÎÔÛÇ][\p{L}-]*/gu) || []))].slice(0, 3); })();
                    const notices = [];
                    if (r.kind === 'csv' || r.kind === 'tsv') notices.push({kind: 'info', text: `Séparateur deviné : ${r.sep === ';' ? 'point-virgule (;)' : r.sep === ',' ? 'virgule (,)' : r.sep === '\t' ? 'tabulation' : r.sep} · Encodage : ${S.ENC_LABEL[r.encoding] || r.encoding}`});
                    if (accents.length) notices.push({kind: 'ok', text: `✓ Accents corrects : « ${accents.join(' », « ')} ».`});
                    return {count: rowsN, summaryHtml: `<b>${plural(rowsN, 'ligne')}</b> dans ${plural(r.wb.sheets.length, 'feuille')} · ${esc(kinds[r.kind] || r.kind)}`, notices,
                        preview: m.length ? `<div class="xl-prev"><table><tbody>${m.map((row, i) => `<tr>${row.map(v => `<${i ? 'td' : 'th'}>${esc(v)}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</tbody></table></div>` : '', data: r};
                },
                run: async an => {
                    const src = an.data.wb, added = [];
                    this.begin('Importer');
                    src.sheets.forEach(s => { const sh = {...s, cells: {}}; for (const k in s.cells) { const c = {...s.cells[k]}; if (c.s) c.s = S.styleId(this.wb, src.styles[c.s] || {}); sh.cells[k] = c; } sh.id = S.newSheet().id; sh.name = S.cleanSheetName(s.name, this.wb.sheets.map(x => x.name)); this.wb.sheets.push(sh); added.push(sh); });
                    // une feuille renommée (le nom était déjà pris) : les formules du fichier la suivent ; les noms (Insertion → Nom pour la plage) du fichier arrivent aussi
                    added.forEach((sh, i) => { const was = src.sheets[i].name; if (was === sh.name) return; added.forEach(o => { for (const k in o.cells) { const v = o.cells[k]?.v; if (S.isFormula(v)) o.cells[k] = {...o.cells[k], v: S.renameInFormula(v, was, sh.name)}; } }); Object.keys(src.names || {}).forEach(n => { const m = /^(?:'((?:[^']|'')+)'|([^'!]+))!(.+)$/.exec(src.names[n]); if (m && S.fold((m[1] || m[2]).replace(/''/g, "'")) === S.fold(was)) src.names[n] = `${S.quoteSheet(sh.name)}!${m[3]}`; }); });
                    Object.entries(src.names || {}).forEach(([n, v]) => { if (!(this.wb.names || {})[n]) this.wb.names = {...(this.wb.names || {}), [n]: v}; });
                    if (this.wb.sheets.length > S.LIMITS.sheets) { this.wb.sheets.splice(S.LIMITS.sheets); }
                    // un classeur vide au départ : on garde seulement ce qui arrive
                    const first = this.wb.sheets[0]; if (this.wb.sheets.length > added.length && !Object.keys(first.cells).length && this.wb.sheets.indexOf(first) === 0 && !this.id && !this.undoStack.length) this.wb.sheets.splice(0, 1);
                    const t = this.commit(); this.showSheet(this.wb.sheets.indexOf(added[0])); this.render();
                    return {message: `${plural(added.length, 'feuille')} importée${added.length > 1 ? 's' : ''} (${plural(an.count, 'ligne')})`, undo: () => { if (this.undoStack[this.undoStack.length - 1] === t) this.undo(); }};
                }});
            go(file ? [file] : undefined); // un fichier collé ou déposé : la même fenêtre, déjà à l'étape 2
        },
        exportDialog() {
            const S = X(), base = A().safeExportFilename ? A().safeExportFilename(this.name, 'classeur') : 'classeur', sep = pref('csv', ';');
            const sheetRows = () => S.matrix(this.wb, this.calc, this.si);
            const text = (name, t, type) => download(new Blob([t], {type}), name);
            UI().openExportDialog({title: this.name, defaultName: this.name, quality: false, info: 'CSV et TSV : la feuille ouverte. Les autres : tout le classeur. Une cellule qui commence par « = » est protégée dans un CSV (pas de formule glissée).',
                formats: [
                    {id: 'xlsx', label: '📗 XLSX', hint: 'Excel, Numbers', ext: 'xlsx', run: async o => download(await S.toXlsx(this.wb, this.calc), o.filename)},
                    {id: 'ods', label: '📘 ODS', hint: 'LibreOffice', ext: 'ods', run: async o => download(await S.toOds(this.wb, this.calc), o.filename)},
                    {id: 'csv', label: '🧾 CSV', hint: 'tout tableur', ext: 'csv', run: async o => text(o.filename, S.toCSV(sheetRows(), {sep}), 'text/csv;charset=utf-8')},
                    {id: 'tsv', label: '⇥ TSV', hint: 'tabulations', ext: 'tsv', run: async o => text(o.filename, S.toCSV(sheetRows(), {sep: '\t', bom: false}), 'text/tab-separated-values;charset=utf-8')},
                    {id: 'json', label: '{ } JSON', hint: 'données', ext: 'json', run: async o => text(o.filename, JSON.stringify(S.toJsonData(this.wb, this.calc), null, 1), 'application/json')},
                    {id: 'pdf', label: '📄 PDF', hint: 'à lire', ext: '', quality: false, run: async () => this.printDialog()},
                    {id: 'print', run: async () => UI().printDocument ? UI().printDocument(this.printHtml({all: false, grid: true})) : this.printDialog()},
                    {id: 'file', label: '💾 Fichier de l’outil', hint: '.lcnda-tableur', ext: 'lcnda-tableur', run: async o => text(o.filename, JSON.stringify({format: 'lcnda-tableur', name: this.name, workbook: S.compact(this.wb)}), 'application/json')},
                ]}).then(r => { if (r && !['pdf', 'print'].includes(r.format)) toast(`Exporté : ${r.filename || base}`); });
        },
        printHtml({all = false, grid = true} = {}) {
            const S = X(), sheets = all ? this.wb.sheets.map((s, i) => i) : [this.si];
            const parts = sheets.map(si => {
                const sh = this.wb.sheets[si], g = S.usedRange(sh); if (!g) return `<h2>${esc(sh.name)}</h2><p>(feuille vide)</p>`;
                const merges = new Map(), cov = new Set(); (sh.merges || []).forEach(m => { const q = S.parseRange(m); merges.set(q.r0 + ':' + q.c0, q); for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) if (r !== q.r0 || c !== q.c0) cov.add(r + ':' + c); });
                const hidC = c => sh.cols[S.colName(c)]?.hidden, fr = sh.freeze?.r || 0, hidR = r => sh.rows[String(r + 1)]?.hidden || this.hiddenRows.get(sh.id)?.has(r);
                const rowHtml = r => `<tr>${Array.from({length: g.c1 + 1}, (_, c) => { if (hidC(c) || cov.has(r + ':' + c)) return ''; const k = S.addr(r, c), cell = sh.cells[k], st = this.wb.styles[cell?.s] || {}, v = this.calc.val(si, r, c), m = merges.get(r + ':' + c); const css = `${st.b || r < fr ? 'font-weight:bold;' : ''}${st.i ? 'font-style:italic;' : ''}${st.fill ? `background:${S.safeCol(st.fill)};` : ''}${st.color ? `color:${S.safeCol(st.color)};` : ''}text-align:${st.h || (typeof v === 'number' ? 'right' : 'left')};${st.wrap ? 'white-space:pre-wrap;' : ''}`; return `<td${m ? ` colspan="${m.c1 - m.c0 + 1}" rowspan="${m.r1 - m.r0 + 1}"` : ''} style="${css}">${esc(S.formatValue(v, st, {approx: this.calc.isApprox(si, r, c)}))}</td>`; }).join('')}</tr>`;
                const head = []; const body = []; for (let r = 0; r <= g.r1; r++) { if (hidR(r)) continue; (r < fr ? head : body).push(rowHtml(r)); }
                const widths = Array.from({length: g.c1 + 1}, (_, c) => (hidC(c) ? '' : `<col style="width:${sh.cols[S.colName(c)]?.w || DEF_W}px">`)).join('');
                return `<h2>${esc(sh.name)}</h2><table><colgroup>${widths}</colgroup>${head.length ? `<thead>${head.join('')}</thead>` : ''}<tbody>${body.join('')}</tbody></table>`;
            });
            return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(this.name)}</title><style>body{font:11px Arial,sans-serif;color:#111}h2{font-size:14px;margin:14px 0 6px}table{border-collapse:collapse;table-layout:fixed}td{${grid ? 'border:1px solid #bbb;' : ''}padding:2px 4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;vertical-align:top}thead td{background:#e8eef7}thead{display:table-header-group}tr{page-break-inside:avoid}</style></head><body><h1 style="font-size:16px">${esc(this.name)}</h1>${parts.join('')}</body></html>`;
        },
        printDialog() {
            UI().openPrintDialog({title: this.name, html: (o = {}) => this.printHtml({all: !!o.all, grid: o.grid !== false}),
                options: [{key: 'all', label: 'Toutes les feuilles', checked: false}, {key: 'grid', label: 'Quadrillage', checked: true}]});
        },

        /* ═════════ Enregistrer, fermer ═════════ */
        async save({asNew = false, kind = this.kind, name = this.name, force = false} = {}) {
            const S = X(); this.wb.active = this.si;
            // « ✓ Enregistrer et revenir » : les données repartent dans l'outil qui les a confiées (rien n'est rangé dans le Tableur, sauf « Enregistrer une copie… »)
            if (this.ctx.back && !asNew) {
                if (this.edit && !this.commitEdit(0, 0)) return 0;
                try { if (await this.ctx.back.save(this) === false) return 0; } catch (e) { toast(e.message || String(e), 'error'); return 0; }
                this.dirty = false; this.dlg.close(); return 0;
            }
            UI()?.savedStatus?.(this.dlg, 'saving');
            try {
                const own = !asNew && this.id;
                const r = await post('save_workbook', {id: asNew ? 0 : this.id, name, kind, data: S.compact(this.wb), ...(own && this.rev ? {base_rev: this.rev} : {}), ...(force ? {force: 1} : {})}), id = Number(r.result?.id || 0);
                if (!asNew) { const first = !this.id; this.id = id; this.rev = r.result?.rev || ''; this.dirty = false; UI()?.savedStatus?.(this.dlg, 'saved'); if (first) toast('Rangé dans Listes → Outils de modification → 🧾 Tableur.'); }
                else { UI()?.savedStatus?.(this.dlg, this.dirty ? 'dirty' : 'saved'); toast(kind === 'template' ? `Modèle « ${name} » enregistré (Partir d’un modèle → Mes modèles).` : `Copie « ${name} » enregistrée.`); }
                this.ctx.onSaved?.(this.id);
                document.dispatchEvent(new CustomEvent('lcnda:workbook-saved', {detail: {id: this.id || id}})); // les diagrammes liés à une plage se redessinent
                return id;
            } catch (e) {
                UI()?.savedStatus?.(this.dlg, 'error');
                if (e.conflict && !asNew) { // un autre onglet a enregistré ce classeur entre-temps
                    const choice = await (A().conflictBox?.({what: 'Ce classeur'}) ?? Promise.resolve(null));
                    if (choice === 'overwrite') return this.save({asNew, kind, name, force: true});
                    if (choice === 'reload') { const keep = this.id; this.dirty = false; this.dlg.close(); setTimeout(() => openWorkbook({...this.ctx, id: keep, data: undefined}), 50); }
                    return 0;
                }
                toast(`Impossible d’enregistrer : ${e.message}`, 'error', {retry: () => this.save({asNew, kind, name})}); return 0;
            }
        },
        saveAs(template = false) {
            A().askText({title: template ? 'Enregistrer comme modèle' : 'Enregistrer une copie', message: template ? 'Le nom du modèle (les données restent : vide-les avant si tu veux un modèle vierge) :' : 'Le nom de la copie :', value: template ? this.name : `${this.name} (copie)`, okLabel: 'Enregistrer'}).then(n => { n = String(n || '').trim(); if (n) this.save({asNew: true, kind: template ? 'template' : 'book', name: n.slice(0, 200)}); });
        },
        async close(after) {
            if (this.edit && !this.commitEdit(0, 0)) return;
            if (this.dirty && !await A().confirmBox('Les changements faits depuis le dernier enregistrement seront perdus.', {title: 'Fermer sans enregistrer ?', okLabel: 'Fermer sans enregistrer', danger: true})) return;
            this.dlg.close(); after?.();
        },
    });

    /* ═════════ « 📋 Partir d'un modèle » (modèles fournis + Mes modèles) ═════════ */
    async function chooseTemplate(ctx = {}) {
        let mine = []; try { mine = (await api('workbooks', {kind: 'template'})).items || []; } catch (_) {}
        ext.openDialog({eyebrow: 'TABLEUR', title: '📋 Partir d’un modèle', wide: true,
            body: `<div class="xl-tpls">${TEMPLATES.map(t => `<button type="button" class="xl-tpl" data-tpl="${t.key}"><b>${t.icon} ${esc(t.name)}</b><small>${esc(t.hint)}</small></button>`).join('')}</div>
                <h4>Mes modèles</h4>${mine.length ? `<div class="xl-tpls">${mine.map(t => `<button type="button" class="xl-tpl" data-mine="${t.id}"><b>🧾 ${esc(t.name)}</b><small>${esc(plural(t.info?.sheets || 1, 'feuille'))} · ${UI()?.whenText ? esc(UI().whenText(t.updated_at, {label: 'Modifié'})) : ''}</small></button>`).join('')}</div>` : A().empty('Pas encore de modèle à toi : dans un classeur, Fichier → « Enregistrer comme modèle… ».', {icon: '📋'})}`,
            onOpen: d => d.addEventListener('click', async e => {
                const b = e.target.closest('[data-tpl], [data-mine]'); if (!b) return; d.close();
                if (b.dataset.tpl) { const t = TEMPLATES.find(x => x.key === b.dataset.tpl); return openWorkbook({...ctx, id: 0, data: t.make(), name: t.name}); }
                try { const r = await api('workbook', {id: Number(b.dataset.mine)}); openWorkbook({...ctx, id: 0, data: r.data, name: r.name}); } catch (err) { toast(err.message, 'error'); }
            })});
    }
    ext.chooseSheetTemplate = chooseTemplate;
    /** ⤒ Importer… depuis la liste : un nouveau classeur fait du fichier, rangé tout de suite */
    function importNew(again) {
        const S = X();
        UI().openImportDialog({title: '⤒ Importer un tableau', accept: '.csv,.tsv,.txt,.xlsx,.ods,.json,.lcnda-tableur', noun: 'ligne', feminine: true,
            analyze: async files => { const f = files[0], r = await S.readFile(f.name, await f.arrayBuffer()), n = r.wb.sheets.reduce((k, s) => k + ((S.usedRange(s)?.r1 ?? -1) + 1), 0); return {count: n, summaryHtml: `<b>${plural(n, 'ligne')}</b> dans ${plural(r.wb.sheets.length, 'feuille')} (${esc(f.name)})${r.kind === 'csv' ? ` · séparateur « ${r.sep === '\t' ? 'tabulation' : r.sep} » · ${esc(S.ENC_LABEL[r.encoding] || r.encoding)}` : ''}`, data: {wb: r.wb, name: f.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'Classeur importé'}}; },
            run: async an => { const r = await post('save_workbook', {name: an.data.name, kind: 'book', data: S.compact(an.data.wb)}), id = Number(r.result?.id || 0); again?.(); setTimeout(() => openWorkbook({id, onSaved: again, onClose: again}), 50); return {message: `Classeur « ${an.data.name} » créé (${plural(an.count, 'ligne')})`, undo: async () => { await post('delete_workbook', {id}); again?.(); }}; }});
    }

    /* ═════════ Dans 🛠️ Outils de modification (écran J) ═════════ */
    const mini = p => (Array.isArray(p) && p.some(r => r.some(v => v !== '' && v != null)) ? `<span class="xl-mini"><table>${p.map(r => `<tr>${r.map(v => `<td>${esc(typeof v === 'number' ? v.toLocaleString('fr-FR') : v)}</td>`).join('')}</tr>`).join('')}</table></span>` : '<span class="h-et-ico">🧾</span>');
    ext.editToolsExtra = ext.editToolsExtra || [];
    ext.editToolsExtra.push({key: 'sheet', icon: '🧾', label: 'Tableur', what: 'classeur',
        load: async () => ((await api('workbooks')).items || []).map(w => ({id: w.id, name: w.name, date: w.updated_at, thumb: mini(w.info?.preview), info: [plural(w.info?.sheets || 1, 'feuille'), plural(w.info?.rows || 0, 'ligne'), (w.info?.names || []).slice(0, 3).join(', ')].filter(Boolean).join(' · ')})),
        open: (id, again) => openWorkbook({id, onSaved: again, onClose: again}),
        create: again => openWorkbook({onSaved: again, onClose: again}),
        rename: (id, name) => post('rename_workbook', {id, name}),
        remove: id => post('delete_workbook', {id}), createLabel: '＋ Nouveau classeur',
        extra: '<button type="button" class="button secondary" data-et-x="tpl" title="Relevé de recensement, registre paroissial, budget de la recherche, suivi des courriers…">📋 Partir d’un modèle</button><button type="button" class="button secondary" data-et-x="import" title="CSV, TSV, Excel (.xlsx), LibreOffice (.ods), JSON">⤒ Importer…</button>',
        onExtra: (k, again) => { if (k === 'tpl') return chooseTemplate({onSaved: again, onClose: again}); if (k === 'import') return importNew(again); }});
    ext.tableurInternals = {Editor, TEMPLATES, openWorkbook, chooseTemplate}; // pour les essais
})();
