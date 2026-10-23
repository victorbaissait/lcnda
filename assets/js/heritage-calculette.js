/**
 * 🧮 Calculette : une petite fenêtre flottante, appelable de partout (bouton 🧮 en haut, ⇧⌘Y, widget Raccourcis,
 * Listes → 🛠️ Outils de modification), qui reste ouverte au-dessus de l'app — et au-dessus d'une fenêtre ouverte
 * (elle passe dans la fenêtre du dessus, pour qu'on puisse calculer pendant qu'on remplit une fiche).
 *  - 🔢 Simple : grosses touches, ruban (historique) cliquable, 📋 copier le résultat, mémoire MC MR M+ M− ;
 *  - 🧪 Scientifique : rubriques de touches (fonctions, complexes, arithmétique, bases, statistiques, matrices,
 *    équations, analyse, unités et mesures anciennes, dates des actes), angle DEG / RAD / GRAD ;
 *  - 📈 Courbes : plusieurs y = f(x), glisser pour se déplacer, molette ou [− 100 % +] pour zoomer, lecture au survol.
 * Le calcul tapé est redessiné joliment (fractions, puissances, racines) ; les erreurs sont dites en français.
 * Moteur : app-calculette-engine.js (window.LCNDA_CALC, sans eval). Réglages : localStorage['genealogie-calculette']
 * (K2 dans ⚙️, 💾 Réglages enregistrés) ; ruban, mémoire et place de la fenêtre : sur cet appareil (lcnda-calculette-*).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const C = () => window.LCNDA_CALC;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (...a) => A()?.toast?.(...a);
    const KEY = 'genealogie-calculette', PRESETS = 'genealogie-calculette-presets';
    const TAPE = 'lcnda-calculette-ruban', MEM = 'lcnda-calculette-memoire', PLACE = 'lcnda-calculette-place', CURVES = 'lcnda-calculette-courbes', OPEN = 'lcnda-calculette-ouverte';
    const ls = {get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }, del(k) { try { localStorage.removeItem(k); } catch (_) {} }};
    const DEF = {mode: 'simple', theme: 'app', angle: 'deg', digits: 10, dec: ',', frac: true, region: 'paris', topButton: true, group: 'fn'};
    const clean = s => {
        s = s && typeof s === 'object' ? s : {};
        return {mode: ['simple', 'sci', 'plot'].includes(s.mode) ? s.mode : DEF.mode, theme: ['app', 'light', 'dark'].includes(s.theme) ? s.theme : DEF.theme,
            angle: ['deg', 'rad', 'grad'].includes(s.angle) ? s.angle : DEF.angle, digits: Math.max(4, Math.min(15, Math.round(Number(s.digits) || DEF.digits))),
            dec: s.dec === '.' ? '.' : ',', frac: s.frac !== false, region: /^[a-z]{2,20}$/.test(String(s.region || '')) ? s.region : DEF.region,
            topButton: s.topButton !== false, group: /^[a-z]{1,10}$/.test(String(s.group || '')) ? s.group : DEF.group};
    };
    const settings = () => clean(ls.get(KEY, {}));
    const saveSettings = s => ls.set(KEY, clean(s));
    const K = () => window.LCNDA_APP?.keys;
    const kbd = k => (K()?.html ? K().html(k) : `<kbd>${esc(k)}</kbd>`);
    const ANGLES = [['deg', 'DEG', 'Degrés (un tour = 360°)'], ['rad', 'RAD', 'Radians (un tour = 2π)'], ['grad', 'GRAD', 'Grades (un tour = 400 gr)']];
    const COLORS = ['#055dff', '#d0182f', '#1a7f3c', '#b35c00', '#7b3fd1', '#008b8b'];

    /* ═════════ Les rubriques du mode scientifique ═════════ */
    // [libellé, texte inséré (| = place du curseur), bulle]
    const k = (label, ins, tip = '') => ({label, ins: ins ?? label, tip});
    const GROUPS = [
        {id: 'fn', label: 'Fonctions', keys: [k('sin', 'sin(|)', 'Sinus'), k('cos', 'cos(|)', 'Cosinus'), k('tan', 'tan(|)', 'Tangente'), k('x²', '^2', 'Au carré'), k('xʸ', '^', 'Puissance'), k('√', '√(|)', 'Racine carrée'),
            k('asin', 'asin(|)', 'Arc sinus'), k('acos', 'acos(|)', 'Arc cosinus'), k('atan', 'atan(|)', 'Arc tangente'), k('x³', '^3', 'Au cube'), k('ⁿ√', 'root(|; )', 'Racine n-ième : root(x ; n)'), k('∛', 'cbrt(|)', 'Racine cubique'),
            k('sinh', 'sinh(|)', 'Sinus hyperbolique'), k('cosh', 'cosh(|)', 'Cosinus hyperbolique'), k('tanh', 'tanh(|)', 'Tangente hyperbolique'), k('ln', 'ln(|)', 'Logarithme népérien'), k('log', 'log(|)', 'Logarithme décimal ; log(x ; b) en base b'), k('eˣ', 'exp(|)', 'Exponentielle'),
            k('x!', '!', 'Factorielle'), k('|x|', 'abs(|)', 'Valeur absolue'), k('1/x', '1/(|)', 'Inverse'), k('π', 'π', 'Pi = 3,14159…'), k('e', 'e', 'e = 2,71828…'), k('φ', 'φ', 'Nombre d’or = 1,61803…'),
            k('10ˣ', '10^', 'Puissance de 10'), k('mod', ' mod ', 'Reste de la division'), k('%', '%', 'Pour cent (200 + 10 % = 220)'), k('°', '°', 'Degrés, même en mode RAD'), k(';', ' ; ', 'Sépare les nombres d’une fonction'), k('ans', 'ans', 'Le résultat précédent')],
            ex: ['sin(30)² + cos(30)²', '√2 × √8', '2^10', 'ln(e^3)', '5!']},
        {id: 'cx', label: 'Complexes', keys: [k('i', 'i', 'i² = −1'), k('re', 're(|)', 'Partie réelle'), k('im', 'im(|)', 'Partie imaginaire'), k('module', 'module(|)', 'Module |z|'), k('arg', 'arg(|)', 'Argument (angle)'), k('conj', 'conj(|)', 'Conjugué')],
            ex: ['(1 + 2i)(3 − i)', '√(−4)', 'module(3 + 4i)', 'e^(iπ)', '1/(1 + i)'], help: 'Écris un complexe a + bi : (3 + 4i) × 2, √(−9), i^2.'},
        {id: 'ar', label: 'Arithmétique', keys: [k('pgcd', 'pgcd(|; )', 'Plus grand commun diviseur'), k('ppcm', 'ppcm(|; )', 'Plus petit commun multiple'), k('C', 'C(|; )', 'Combinaisons : C(n ; k)'), k('A', 'A(|; )', 'Arrangements : A(n ; k)'),
            k('premier', 'premier(|)', 'Est-ce un nombre premier ?'), k('facteurs', 'facteurs(|)', 'Décomposition en facteurs premiers'), k('arrondi', 'arrondi(|; 2)', 'Arrondi à 2 chiffres après la virgule'), k('ent', 'ent(|)', 'Partie entière'),
            k('plafond', 'plafond(|)', 'Arrondi vers le haut'), k('frac', 'frac(|)', 'En fraction'), k('dec', 'dec(|)', 'En nombre à virgule'), k('quotient', 'quotient(|; )', 'Quotient entier')],
            ex: ['1/3 + 1/6', 'pgcd(84 ; 120)', 'facteurs(360)', 'C(49 ; 6)', 'frac(0,875)']},
        {id: 'base', label: 'Bases', keys: [k('bin', 'bin(|)', 'En binaire'), k('oct', 'oct(|)', 'En octal'), k('hex', 'hex(|)', 'En hexadécimal'), k('base', 'base(|; )', 'Dans une base de 2 à 36'), k('0b', '0b', 'Un nombre binaire : 0b1010'), k('0x', '0x', 'Un nombre hexadécimal : 0xFF')],
            ex: ['hex(255)', 'bin(42)', '0xFF + 0b11', '255 en binaire', 'base(100 ; 3)']},
        {id: 'st', label: 'Statistiques', keys: [k('[ ]', '[|]', 'Une liste : [12 ; 15 ; 9]'), k(';', ' ; ', 'Sépare les nombres'), k('moyenne', 'moyenne(|)', 'Moyenne'), k('médiane', 'mediane(|)', 'Médiane'), k('σ', 'ecarttype(|)', 'Écart-type (population)'), k('s', 'ecarttype_e(|)', 'Écart-type d’un échantillon'),
            k('variance', 'variance(|)', 'Variance'), k('somme', 'somme(|)', 'Somme'), k('min', 'min(|)', 'Le plus petit'), k('max', 'max(|)', 'Le plus grand'), k('Q1', 'q1(|)', '1er quartile'), k('Q3', 'q3(|)', '3e quartile')],
            ex: ['moyenne([12 ; 15 ; 9 ; 18])', 'mediane([3 ; 1 ; 4 ; 1 ; 5])', 'ecarttype([2 ; 4 ; 4 ; 4 ; 5 ; 5 ; 7 ; 9])'], help: 'Mets tes nombres entre crochets, séparés par « ; ».'},
        {id: 'mat', label: 'Matrices', keys: [k('▦', '', 'Écrire une matrice dans une grille'), k('[[ ]]', '[[|]]', 'Une matrice : [[1 ; 2] ; [3 ; 4]]'), k('det', 'det(|)', 'Déterminant'), k('inverse', 'inverse(|)', 'Matrice inverse'), k('transp', 'transp(|)', 'Transposée'), k('trace', 'trace(|)', 'Trace'),
            k('identité', 'identite(|)', 'Matrice identité'), k('rang', 'rang(|)', 'Rang'), k('×', ' × ', 'Produit de deux matrices'), k('^−1', '^-1', 'Inverse')],
            ex: ['det([[1 ; 2] ; [3 ; 4]])', 'inverse([[2 ; 1] ; [1 ; 1]])', '[[1 ; 2] ; [3 ; 4]] × [[5 ; 6] ; [7 ; 8]]'], help: 'Une matrice = des lignes entre crochets : [[1 ; 2] ; [3 ; 4]].', grid: true},
        {id: 'eq', label: 'Équations', keys: [k('x', 'x'), k('y', 'y'), k('z', 'z'), k('=', ' = ', 'Le signe égal d’une équation'), k('résoudre', 'resoudre(|)', 'Résout une équation ou un système'), k('racines', 'racines(|; ; )', 'Racines d’un polynôme : ses coefficients'), k('système', 'systeme(|; )', 'Système A·X = B')],
            ex: ['x^2 − 3x + 2 = 0', 'x^3 − 6x^2 + 11x − 6 = 0', 'resoudre(2x + y = 3 ; x − y = 0)', 'resoudre(cos(x) = x)', 'racines(1 ; 0 ; 1)'], help: 'Tape l’équation avec « = » : la calculette la résout (jusqu’au 4e degré exactement).'},
        {id: 'an', label: 'Analyse', keys: [k('dérivée', 'derivee(|; )', 'Nombre dérivé : derivee(f(x) ; a)'), k('intégrale', 'integrale(|; ; )', 'Intégrale : integrale(f(x) ; a ; b)'), k('limite', 'limite(|; )', 'Limite : limite(f(x) ; a)'), k('Σ', 'somme(|; k; 1; 10)', 'Somme d’une suite'), k('x', 'x')],
            ex: ['derivee(x^3 ; 2)', 'integrale(x^2 ; 0 ; 3)', 'integrale(sin(x) ; 0 ; π)', 'limite(sin(x)/x ; 0)', 'somme(k^2 ; k ; 1 ; 10)'], help: 'Les dérivées, intégrales et limites se calculent en radians.'},
        {id: 'un', label: 'Unités', units: true, ex: ['3 toises en m', '5 arpents en ha', '12 pieds en m', '785 deniers en livres', '3 livres 5 sous en deniers', '1 livre poids en g', '100 °F en °C'], help: 'Écris « 3 toises en m » ; les mesures anciennes suivent la région choisie dans ⚙️.'},
        {id: 'dt', label: 'Dates', dates: true, ex: ['3 frimaire an XII', '14 juillet 1794 en républicain', '7 mai 1925 → 8 décembre 1960', 'du 1er mars 1802 au 12/06/1851'], help: 'Les dates s’écrivent comme dans un acte (C4) : 7 mai 1925, 14/07/1789, vers 1784, 3 frimaire an XII.'},
    ];
    const SIMPLE_KEYS = [
        ['C', 'clear', 'Tout effacer (Échap)', 'fn'], ['(', '(', '', 'op'], [')', ')', '', 'op'], ['⌫', 'back', 'Effacer le dernier signe', 'fn'],
        ['7', '7'], ['8', '8'], ['9', '9'], ['÷', '/', 'Diviser', 'op'],
        ['4', '4'], ['5', '5'], ['6', '6'], ['×', '*', 'Multiplier', 'op'],
        ['1', '1'], ['2', '2'], ['3', '3'], ['−', '-', 'Soustraire', 'op'],
        ['0', '0'], [',', 'DEC', 'Virgule', ''], ['%', '%', 'Pour cent', 'op'], ['+', '+', 'Ajouter', 'op'],
        ['±', 'neg', 'Changer le signe', 'fn'], ['x²', '^2', 'Au carré', 'op'], ['√', '√(', 'Racine carrée', 'op'], ['=', 'eval', 'Calculer (Entrée)', 'eq'],
    ];

    /* ═════════ La fenêtre ═════════ */
    let win = null, st = null, input = null, last = null, tapeIdx = -1, draft = '', previewT = 0;
    const place = () => ls.get(PLACE, null);
    const tape = () => { const t = ls.get(TAPE, []); return Array.isArray(t) ? t.filter(x => x && typeof x.e === 'string').slice(-100) : []; };
    const memText = () => { const m = ls.get(MEM, ''); return typeof m === 'string' ? m : ''; };
    const evalOpts = () => ({angle: st.angle, digits: st.digits, dec: st.dec, frac: st.frac, region: st.region, ans: last?.value ?? ansFromTape()});
    function ansFromTape() { const t = tape().at(-1); if (!t?.v) return undefined; const r = C().evaluate(t.v, {dec: '.', angle: 'rad'}); return r.ok ? C().reusable(r.value) : undefined; }
    const isPhone = () => window.matchMedia?.('(max-width: 600px)').matches;

    function build() {
        st = settings();
        win = document.createElement('div');
        win.className = 'cm-win'; win.id = 'calculette'; win.setAttribute('role', 'dialog'); win.setAttribute('aria-label', 'Calculette'); win.tabIndex = -1;
        win.dataset.ctxOff = ''; // les cases du calcul ont data-ui-off ; les dates (C4) sont habillées
        win.innerHTML = `
            <header class="cm-head" data-cm-drag>
                <span class="cm-title" title="Glisser pour déplacer la calculette"><span aria-hidden="true">🧮</span> Calculette</span>
                <div class="segmented cm-tabs" role="tablist" aria-label="Mode de la calculette">
                    <button type="button" role="tab" data-cm-tab="simple" title="Grosses touches, ruban, mémoire">🔢 Simple</button>
                    <button type="button" role="tab" data-cm-tab="sci" title="Fonctions, complexes, matrices, équations, unités, dates">🧪 Scientifique</button>
                    <button type="button" role="tab" data-cm-tab="plot" title="Tracer des courbes y = f(x)">📈 Courbes</button>
                </div>
                <span class="cm-head-sp"></span>
                <button type="button" class="icon-button small cm-ib" data-cm-settings title="Réglages de la calculette" aria-label="Réglages de la calculette">⚙️</button>
                <button type="button" class="icon-button small cm-ib" data-cm-close title="Fermer la calculette" aria-label="Fermer la calculette" data-shortcut="Échap">×</button>
            </header>
            <div class="cm-body">
                <section class="cm-calc" data-cm-calc>
                    <div class="cm-tape-wrap">
                        <div class="cm-tape-bar"><span class="cm-tape-t">Ruban</span><span class="cm-tape-n" data-cm-tape-n></span><span class="cm-head-sp"></span><button type="button" class="link-button cm-tape-clear" data-cm-tape-clear title="Vider le ruban (on peut l’annuler juste après)">🗑 Vider</button></div>
                        <ol class="cm-tape" data-cm-tape aria-label="Calculs déjà faits : un clic reprend le résultat"></ol>
                    </div>
                    <div class="cm-screen">
                        <div class="cm-pretty" data-cm-pretty aria-hidden="true"></div>
                        <div class="cm-line"><input type="text" class="cm-input" data-cm-input data-ui-off autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text" aria-label="Calcul à faire" placeholder="Tape un calcul…"></div>
                        <div class="cm-result" data-cm-result>
                            <output class="cm-out" data-cm-out aria-live="polite"></output>
                            <button type="button" class="icon-button small cm-ib cm-copy" data-cm-copy title="Copier le résultat" aria-label="Copier le résultat" data-shortcut="⌘C">📋</button>
                        </div>
                        <div class="cm-alt" data-cm-alt></div>
                        <div class="cm-err" data-cm-err role="alert" hidden></div>
                    </div>
                    <div class="cm-row cm-memrow">
                        <div class="cm-mem" role="group" aria-label="Mémoire">
                            <button type="button" class="cm-mk" data-cm-mem="mc" title="Effacer la mémoire">MC</button><button type="button" class="cm-mk" data-cm-mem="mr" title="Reprendre le nombre gardé en mémoire">MR</button><button type="button" class="cm-mk" data-cm-mem="m+" title="Ajouter le résultat à la mémoire">M+</button><button type="button" class="cm-mk" data-cm-mem="m-" title="Retirer le résultat de la mémoire">M−</button>
                        </div>
                        <span class="cm-memv" data-cm-memv></span>
                        <span class="cm-head-sp"></span>
                        <div class="segmented cm-angle" role="radiogroup" aria-label="Unité des angles" data-cm-angle>${ANGLES.map(([kk, l, t]) => `<button type="button" data-cm-ang="${kk}" title="${esc(t)}">${l}</button>`).join('')}</div>
                    </div>
                    <div class="cm-sci" data-cm-sci>
                        <div class="cm-groups" role="tablist" aria-label="Rubriques">${GROUPS.map(g => `<button type="button" class="cm-chip" data-cm-group="${g.id}">${esc(g.label)}</button>`).join('')}</div>
                        <div class="cm-gbody" data-cm-gbody></div>
                    </div>
                    <div class="cm-pad" data-cm-pad>${SIMPLE_KEYS.map(([l, v, t, cls]) => `<button type="button" class="cm-key${cls ? ' is-' + cls : ''}" data-cm-key="${esc(v)}"${t ? ` title="${esc(t)}"` : ''}>${l === ',' ? '<span data-cm-dec>,</span>' : esc(l)}</button>`).join('')}</div>
                </section>
                <section class="cm-plot" data-cm-plot hidden>
                    <div class="cm-curves" data-cm-curves></div>
                    <div class="cm-plotbar"><button type="button" class="button small secondary" data-cm-curve-add>＋ Ajouter une courbe</button><span class="cm-head-sp"></span><span data-cm-zoom></span><button type="button" class="icon-button small cm-ib" data-cm-png title="Exporter l’image du graphique (PNG)" aria-label="Exporter en PNG">⤓</button></div>
                    <div class="cm-canvas-wrap" data-cm-cw><canvas class="cm-canvas" data-cm-canvas aria-label="Graphique des courbes"></canvas><div class="cm-trace" data-cm-trace hidden></div></div>
                    <p class="cm-plot-help">Glisse pour te déplacer · molette pour zoomer · survole une courbe pour lire ses valeurs · x en radians.</p>
                </section>
            </div>
            <span class="cm-grip" data-cm-resize title="Glisser pour agrandir ou réduire" aria-hidden="true"></span>`;
        input = win.querySelector('[data-cm-input]');
        bind();
        document.body.appendChild(win);
        applyPlace(); applyState(); drawTape(); drawMem();
        follow();
    }
    function applyPlace() {
        if (!win) return;
        if (isPhone()) { win.style.left = win.style.top = win.style.width = win.style.height = ''; win.classList.add('is-phone'); return; }
        win.classList.remove('is-phone');
        const p = place() || {}, W = window.innerWidth, H = window.innerHeight;
        const w = Math.max(300, Math.min(W - 16, Number(p.w) || (st.mode === 'simple' ? 360 : 460))), h = Math.max(380, Math.min(H - 16, Number(p.h) || Math.min(H - 80, st.mode === 'simple' ? 600 : 680)));
        const x = Math.max(8, Math.min(W - w - 8, Number.isFinite(p.x) ? p.x : W - w - 24)), y = Math.max(8, Math.min(H - Math.min(h, H - 16) - 8, Number.isFinite(p.y) ? p.y : 70));
        Object.assign(win.style, {left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`});
    }
    const savePlace = () => { if (!win || isPhone()) return; const r = win.getBoundingClientRect(); ls.set(PLACE, {x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height)}); };
    function applyState() {
        if (!win) return;
        win.dataset.cmMode = st.mode;
        win.dataset.cmTheme = st.theme;
        win.querySelectorAll('[data-cm-tab]').forEach(b => { const on = b.dataset.cmTab === st.mode; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); });
        win.querySelectorAll('[data-cm-ang]').forEach(b => { const on = b.dataset.cmAng === st.angle; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', String(on)); });
        win.querySelector('[data-cm-sci]').hidden = st.mode !== 'sci';
        win.querySelector('[data-cm-calc]').hidden = st.mode === 'plot';
        win.querySelector('[data-cm-plot]').hidden = st.mode !== 'plot';
        win.querySelector('[data-cm-angle]').hidden = st.mode !== 'sci';
        win.querySelectorAll('[data-cm-dec]').forEach(s => { s.textContent = st.dec; });
        win.querySelector('[data-cm-key="DEC"]')?.setAttribute('title', st.dec === ',' ? 'Virgule' : 'Point décimal');
        if (st.mode === 'sci') drawGroup();
        if (st.mode === 'plot') { drawCurves(); requestAnimationFrame(plotDraw); }
        topButton();
    }
    const setState = patch => { st = clean({...st, ...patch}); saveSettings(st); applyState(); preview(); };

    /* ─── écrire dans la case ─── */
    function insert(text) {
        if (!input) return;
        if (text === 'DEC') text = st.dec;
        // après un résultat : un opérateur continue le calcul (« ans + … »), un chiffre en commence un nouveau
        if (last?.fresh && !input.value) { if (/^[+\-*/^!%]|^ mod |^\^/.test(text)) input.value = 'ans'; last.fresh = false; }
        const caret = text.indexOf('|'); text = text.replace('|', '');
        const s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? s;
        input.setRangeText(text, s, e, 'end');
        if (caret >= 0) { const pos = s + caret; input.setSelectionRange(pos, pos); }
        input.focus({preventScroll: true}); tapeIdx = -1; preview();
    }
    function backspace() { const s = input.selectionStart, e = input.selectionEnd; if (s !== e) input.setRangeText('', s, e, 'end'); else if (s > 0) input.setRangeText('', s - 1, s, 'end'); input.focus(); preview(); }
    function clearAll() { input.value = ''; last = null; showResult(null); showError(null); preview(); input.focus(); }
    function negate() { const v = input.value.trim(); if (!v) { if (last?.value !== undefined) { input.value = `-(ans)`; } else input.value = '-'; } else input.value = /^-\((.*)\)$/.test(v) ? v.replace(/^-\((.*)\)$/, '$1') : `-(${v})`; input.focus(); preview(); }

    /* ─── calculer ─── */
    function preview() {
        clearTimeout(previewT);
        previewT = setTimeout(() => {
            if (!win || !input) return;
            const src = input.value.trim(), pretty = win.querySelector('[data-cm-pretty]');
            if (!src) { pretty.innerHTML = last ? `<span class="cm-was">${last.inputHtml || ''}</span>` : ''; if (!last) showResult(null); return; }
            const r = C().evaluate(src, evalOpts());
            pretty.innerHTML = r.inputHtml || esc(src);
            if (r.ok) { showResult(r, true); showError(null); } else { win.querySelector('[data-cm-out]').innerHTML = ''; win.querySelector('[data-cm-alt]').innerHTML = ''; win.querySelector('[data-cm-result]').classList.add('is-empty'); }
        }, 90);
    }
    function showResult(r, isPreview = false) {
        const out = win.querySelector('[data-cm-out]'), alt = win.querySelector('[data-cm-alt]'), box = win.querySelector('[data-cm-result]');
        box.classList.toggle('is-preview', !!isPreview); box.classList.toggle('is-empty', !r);
        if (!r) { out.innerHTML = ''; alt.innerHTML = ''; return; }
        out.innerHTML = `<span class="cm-eq" aria-hidden="true">${r.approx ? '≈' : '='}</span> ${r.html}`;
        alt.innerHTML = r.alt || '';
        fitOut();
    }
    const fitOut = () => { const out = win.querySelector('[data-cm-out]'); out.classList.remove('is-small', 'is-tiny'); if (out.scrollWidth > out.clientWidth + 2) out.classList.add('is-small'); if (out.scrollWidth > out.clientWidth + 2) out.classList.add('is-tiny'); };
    function showError(r) {
        const box = win.querySelector('[data-cm-err]');
        if (!r) { box.hidden = true; box.innerHTML = ''; input.classList.remove('is-invalid'); input.removeAttribute('aria-invalid'); return; }
        box.hidden = false; input.classList.add('is-invalid'); input.setAttribute('aria-invalid', 'true');
        box.innerHTML = `<span class="cm-err-t">⛔ ${esc(r.error)}</span>${r.hint ? `<span class="cm-err-h">${esc(r.hint)}</span>` : ''}`;
        if (r.pos >= 0 && r.pos <= input.value.length) { input.focus(); input.setSelectionRange(r.pos, Math.min(input.value.length, r.pos + 1)); }
    }
    function compute() {
        let src = input.value.trim();
        if (!src && last) return; // Entrée deux fois : rien à refaire
        if (!src) { showError({error: 'Tape un calcul.', hint: 'Par exemple 12 × 3,5, ou 1/3 + 1/6.'}); return; }
        const r = C().evaluate(src, evalOpts());
        win.querySelector('[data-cm-pretty]').innerHTML = r.inputHtml || esc(src);
        if (!r.ok) { showResult(null); showError(r); return; }
        showError(null); showResult(r);
        const v = C().reusable(r.value);
        last = {value: v ?? undefined, inputHtml: r.inputHtml, text: r.text, fresh: true};
        const t = tape(); t.push({e: src, h: r.inputHtml, r: r.html, a: r.alt || '', t: r.text, v: v != null ? C().asInput(v, {dec: '.'}) : '', x: r.approx ? 1 : 0}); ls.set(TAPE, t.slice(-100));
        drawTape(true); input.value = ''; tapeIdx = -1; draft = '';
    }

    /* ─── ruban ─── */
    function drawTape(scroll = false) {
        const box = win.querySelector('[data-cm-tape]'), t = tape();
        win.querySelector('[data-cm-tape-n]').textContent = t.length ? `· ${A()?.plural ? A().plural(t.length, 'calcul') : t.length + ' calculs'}` : '';
        win.querySelector('[data-cm-tape-clear]').hidden = !t.length;
        box.innerHTML = t.length ? t.map((x, i) => `<li class="cm-tr"><button type="button" class="cm-tr-main" data-cm-reuse="${i}" title="Reprendre ce résultat dans le calcul"><span class="cm-tr-e">${x.h || esc(x.e)}</span><span class="cm-tr-r">${x.x ? '≈' : '='} ${x.r}</span></button><span class="cm-tr-act"><button type="button" class="icon-button small cm-ib" data-cm-redo="${i}" title="Reprendre ce calcul pour le modifier" aria-label="Reprendre ce calcul">✎</button><button type="button" class="icon-button small cm-ib" data-cm-tcopy="${i}" title="Copier ce résultat" aria-label="Copier ce résultat">📋</button></span></li>`).join('')
            : `<li class="empty-line cm-tape-empty"><span class="empty-line-ico" aria-hidden="true">🧾</span><span class="empty-line-text">Tes calculs s’écriront ici.</span></li>`;
        if (scroll || !box.dataset.scrolled) { box.scrollTop = box.scrollHeight; box.dataset.scrolled = '1'; }
    }
    function clearTape() {
        const doClear = () => ls.set(TAPE, []);
        if (A()?.undoLocalChange) A().undoLocalChange('Ruban de la calculette vidé', [TAPE], doClear, () => win && drawTape());
        else doClear();
        drawTape();
    }
    async function copy(text, what = 'Résultat copié') {
        if (!text) { toast('Il n’y a pas encore de résultat à copier.'); return; }
        try { await navigator.clipboard.writeText(text); toast(`📋 ${what} : ${text.length > 60 ? text.slice(0, 60) + '…' : text}`); }
        catch (_) { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; win.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(`📋 ${what}.`); } catch (__) { toast('La copie n’a pas marché : choisis le résultat et copie-le à la main.', 'error'); } ta.remove(); input.focus(); }
    }
    const copyText = () => (last?.text ? (st.dec === ',' ? last.text : last.text) : (() => { const src = input.value.trim(); if (!src) return ''; const r = C().evaluate(src, evalOpts()); return r.ok ? r.text : ''; })());

    /* ─── mémoire ─── */
    function drawMem() {
        const m = memText(), el = win.querySelector('[data-cm-memv]');
        win.querySelectorAll('[data-cm-mem="mc"], [data-cm-mem="mr"]').forEach(b => { b.disabled = !m; });
        if (!m) { el.innerHTML = ''; return; }
        const r = C().evaluate(m, {...evalOpts(), dec: '.'});
        el.innerHTML = r.ok ? `<span class="cm-memb" title="Nombre gardé en mémoire">M</span> ${r.html}` : '';
    }
    function memory(op) {
        const m = memText();
        if (op === 'mc') { ls.del(MEM); drawMem(); return; }
        if (op === 'mr') { if (!m) return; const r = C().evaluate(m, {...evalOpts(), dec: '.'}); if (r.ok) insert(C().asInput(r.value, {dec: st.dec})); return; }
        let v = null; const src = input.value.trim();
        if (src) { const r = C().evaluate(src, evalOpts()); if (!r.ok) { showError(r); return; } v = C().reusable(r.value); } else v = last?.value ?? null;
        if (v == null) { toast('Calcule d’abord un nombre à garder en mémoire.'); return; }
        const cur = m ? C().evaluate(m, {...evalOpts(), dec: '.'}) : null, base = cur?.ok ? C().reusable(cur.value) : null;
        try { const nv = base == null ? (op === 'm-' ? C().mul(v, C().fr(-1)) : v) : (op === 'm+' ? C().add(base, v) : C().sub(base, v)); ls.set(MEM, C().asInput(nv, {dec: '.'})); }
        catch (e) { showError({error: e.message, hint: e.hint || ''}); return; }
        drawMem(); // le nombre gardé s'affiche à côté des touches (pas de message en plus)
    }

    /* ─── rubriques du mode scientifique ─── */
    function drawGroup() {
        const g = GROUPS.find(x => x.id === st.group) || GROUPS[0], body = win.querySelector('[data-cm-gbody]');
        win.querySelectorAll('[data-cm-group]').forEach(b => { const on = b.dataset.cmGroup === g.id; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); });
        let html = '';
        if (g.keys) html += `<div class="cm-fkeys">${g.keys.map((x, i) => `<button type="button" class="cm-fk" data-cm-fk="${i}"${x.tip ? ` title="${esc(x.tip)}"` : ''}>${esc(x.label)}</button>`).join('')}</div>`;
        if (g.grid) html += matrixHelper();
        if (g.units) html += unitsHelper();
        if (g.dates) html += datesHelper();
        if (g.help) html += `<p class="cm-ghelp">${esc(g.help)}</p>`;
        if (g.ex) html += `<div class="cm-ex"><span class="cm-ex-t">Exemples :</span>${g.ex.map(e => `<button type="button" class="cm-exb" data-cm-ex="${esc(e)}" title="Calculer cet exemple">${esc(e)}</button>`).join('')}</div>`;
        body.innerHTML = html;
        body.dataset.group = g.id;
        if (g.units) fillUnits();
        UI()?.scan?.(body);
    }
    const matrixHelper = () => `<details class="cm-mx" data-cm-mx><summary>▦ Écrire une matrice dans une grille</summary><div class="cm-mx-in"><label>Lignes <select data-cm-mx-r>${[1, 2, 3, 4, 5].map(n => `<option${n === 2 ? ' selected' : ''}>${n}</option>`).join('')}</select></label><label>Colonnes <select data-cm-mx-c>${[1, 2, 3, 4, 5].map(n => `<option${n === 2 ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div><div class="cm-mx-grid" data-cm-mx-grid></div><button type="button" class="button small" data-cm-mx-ins>＋ Ajouter au calcul</button></details>`;
    function drawMatrixGrid() {
        const box = win.querySelector('[data-cm-mx-grid]'); if (!box) return;
        const r = Number(win.querySelector('[data-cm-mx-r]').value), c = Number(win.querySelector('[data-cm-mx-c]').value), old = [...box.querySelectorAll('input')].map(x => x.value);
        box.style.gridTemplateColumns = `repeat(${c}, minmax(40px, 1fr))`;
        box.innerHTML = Array.from({length: r * c}, (_, i) => `<input type="text" inputmode="decimal" class="cm-mx-cell" data-ui-off aria-label="Ligne ${Math.floor(i / c) + 1}, colonne ${(i % c) + 1}" value="${esc(old[i] ?? (Math.floor(i / c) === i % c ? '1' : '0'))}">`).join('');
    }
    const unitsHelper = () => `<form class="cm-conv" data-cm-conv><label class="cm-conv-v">Valeur<input type="text" inputmode="decimal" data-cm-cv value="1" data-ui-off></label><label>De<select data-cm-cfrom></select></label><label>En<select data-cm-cto></select></label><button type="submit" class="button small">Convertir</button></form><p class="cm-ghelp" data-cm-region></p>`;
    function fillUnits() {
        const list = C().unitList(st.region).filter(u => u.kind !== 'temp' || true), kinds = {};
        list.forEach(u => { (kinds[u.kind] = kinds[u.kind] || []).push(u); });
        const order = ['long', 'surf', 'vol', 'mass', 'money', 'time', 'temp'];
        const opt = u => `<option value="${esc(u.id)}" data-kind="${u.kind}" data-name="${esc(u.name)}">${esc(u.label)}${u.approx ? ' ≈' : ''}${u.region && u.region !== list.find(x => x.region)?.region ? '' : ''}</option>`;
        const from = win.querySelector('[data-cm-cfrom]'), to = win.querySelector('[data-cm-cto]');
        from.innerHTML = order.filter(kk => kinds[kk]).map(kk => `<optgroup label="${esc(C().KIND_LABEL[kk].replace(/^./, c => c.toUpperCase()))}">${kinds[kk].map(opt).join('')}</optgroup>`).join('');
        const pick = (sel, id) => { const o = [...sel.options].find(x => x.value.endsWith(':' + id) || x.value === id); if (o) sel.value = o.value; };
        pick(from, 'toise');
        const syncTo = () => { const kind = from.selectedOptions[0]?.dataset.kind; const keep = to.value; to.innerHTML = (kinds[kind] || []).map(opt).join(''); if ([...to.options].some(o => o.value === keep)) to.value = keep; else { const m = [...to.options].find(o => /^b:(m|ha|l|g|denier|s)$/.test(o.value) || o.value === 't:c'); if (m) to.value = m.value; } };
        from.onchange = syncTo; syncTo();
        const cm = window.LCNDA_EXT?.calendarMore, reg = cm?.REGIONS?.find(r => r.id === st.region);
        win.querySelector('[data-cm-region]').textContent = reg ? `Mesures anciennes : ${reg.label} (à changer dans ⚙️). Pour les mesures et monnaies d’autres régions : Maintenance → Calendrier / mesures.` : '';
    }
    const datesHelper = () => `<div class="cm-dates"><form class="cm-dform" data-cm-age><span class="cm-dt">🎂 Âge ou écart entre deux dates</span><label>De<input name="a" data-ui-date="nocal" placeholder="7 mai 1925" autocomplete="off"></label><label>À<input name="b" data-ui-date="nocal" placeholder="8 décembre 1960" autocomplete="off"></label><button type="submit" class="button small">Calculer l’écart</button></form>
        <form class="cm-dform" data-cm-rep><span class="cm-dt">🗓 Calendrier républicain ↔ grégorien</span><label>Date<input name="d" data-ui-date="nocal" placeholder="3 frimaire an XII ou 14/07/1794" autocomplete="off"></label><button type="submit" class="button small">Convertir</button></form></div>`;

    /* ─── 📈 Courbes ─── */
    let view = null, plotFns = [];
    const curves = () => { const c = ls.get(CURVES, null); return Array.isArray(c) && c.length ? c.filter(x => typeof x === 'string').slice(0, 6) : ['sin(x)', 'x^2/4 - 1']; };
    const saveCurves = list => ls.set(CURVES, list.slice(0, 6));
    function drawCurves() {
        const box = win.querySelector('[data-cm-curves]'), list = curves();
        box.innerHTML = list.map((f, i) => `<div class="cm-cv"><span class="cm-cv-dot" style="background:${COLORS[i % COLORS.length]}" aria-hidden="true"></span><label class="cm-cv-l"><span>y =</span><input type="text" data-cm-cv-in="${i}" value="${esc(f)}" data-ui-off autocomplete="off" spellcheck="false" aria-label="Courbe ${i + 1} : y ="></label><button type="button" class="icon-button small cm-ib" data-cm-cv-del="${i}" title="Retirer cette courbe" aria-label="Retirer cette courbe">×</button><div class="cm-cv-err" data-cm-cv-err="${i}" hidden></div></div>`).join('')
            || '<div class="empty-line"><span class="empty-line-ico">📈</span><span class="empty-line-text">Aucune courbe.</span></div>';
        win.querySelector('[data-cm-curve-add]').disabled = list.length >= 6;
        compileCurves();
    }
    function compileCurves() {
        plotFns = curves().map((f, i) => {
            const errBox = win.querySelector(`[data-cm-cv-err="${i}"]`), inp = win.querySelector(`[data-cm-cv-in="${i}"]`);
            if (!f.trim()) { if (errBox) errBox.hidden = true; return null; }
            try { const fn = C().compile(f, {angle: 'rad', dec: st.dec}); if (errBox) errBox.hidden = true; inp?.classList.remove('is-invalid'); return {fn, color: COLORS[i % COLORS.length], src: f}; }
            catch (e) { if (errBox) { errBox.hidden = false; errBox.textContent = `⛔ ${e.message}`; } inp?.classList.add('is-invalid'); return null; }
        });
    }
    const defaultView = () => ({cx: 0, cy: 0, sx: 40});  // centre et pixels par unité
    function niceStep(px) { const raw = 60 / px, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
    const fmtAxis = v => { const s = Math.abs(v) < 1e-10 ? '0' : Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3 ? v.toExponential(0) : String(Number(v.toPrecision(6))); return st.dec === ',' ? s.replace('.', ',').replace('-', '−') : s.replace('-', '−'); };
    function plotDraw() {
        const cv = win?.querySelector('[data-cm-canvas]'); if (!cv || win.querySelector('[data-cm-plot]').hidden) return;
        const wrap = cv.parentElement, W = Math.max(50, wrap.clientWidth), H = Math.max(50, wrap.clientHeight), dpr = window.devicePixelRatio || 1;
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
        view = view || defaultView();
        const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const css = getComputedStyle(win), col = n => css.getPropertyValue(n).trim();
        const bg = col('--cm-screen') || '#fff', ink = col('--cm-ink') || '#111', grid = col('--cm-grid') || '#e5e7eb', muted = col('--cm-muted') || '#666';
        g.fillStyle = bg; g.fillRect(0, 0, W, H);
        const X = x => W / 2 + (x - view.cx) * view.sx, Y = y => H / 2 - (y - view.cy) * view.sx;
        const x0 = view.cx - W / 2 / view.sx, x1 = view.cx + W / 2 / view.sx, y0 = view.cy - H / 2 / view.sx, y1 = view.cy + H / 2 / view.sx, step = niceStep(view.sx);
        g.lineWidth = 1; g.strokeStyle = grid; g.beginPath();
        for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { g.moveTo(Math.round(X(x)) + .5, 0); g.lineTo(Math.round(X(x)) + .5, H); }
        for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { g.moveTo(0, Math.round(Y(y)) + .5); g.lineTo(W, Math.round(Y(y)) + .5); }
        g.stroke();
        g.strokeStyle = ink; g.lineWidth = 1.5; g.beginPath(); const ax = Math.round(Math.min(W - 1, Math.max(0, X(0)))) + .5, ay = Math.round(Math.min(H - 1, Math.max(0, Y(0)))) + .5; g.moveTo(ax, 0); g.lineTo(ax, H); g.moveTo(0, ay); g.lineTo(W, ay); g.stroke();
        g.fillStyle = muted; g.font = '11px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
        for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { if (Math.abs(x) < step / 2) continue; g.fillText(fmtAxis(x), X(x), Math.min(H - 14, ay + 4)); }
        g.textAlign = 'right'; g.textBaseline = 'middle';
        for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { if (Math.abs(y) < step / 2) continue; g.fillText(fmtAxis(y), Math.max(30, ax - 4), Y(y)); }
        // les courbes
        plotFns.forEach(p => {
            if (!p) return; g.strokeStyle = p.color; g.lineWidth = 2.2; g.beginPath(); let pen = false, prevY = null;
            for (let px = 0; px <= W; px += 1) {
                const x = x0 + px / view.sx, y = p.fn(x);
                if (!Number.isFinite(y)) { pen = false; prevY = null; continue; }
                const py = Y(y);
                if (pen && prevY !== null && Math.abs(py - prevY) > H * 2) pen = false; // asymptote (tan, 1/x)
                const cy = Math.max(-H, Math.min(2 * H, py));
                if (!pen) { g.moveTo(px, cy); pen = true; } else g.lineTo(px, cy); prevY = py;
            }
            g.stroke();
        });
        zoomBar?.sync?.();
    }
    let zoomBar = null;
    function setupZoom() {
        const slot = win.querySelector('[data-cm-zoom]'); if (!slot) return;
        const get = () => (view || defaultView()).sx / 40, set = z => { view = view || defaultView(); view.sx = Math.max(0.04, Math.min(40000, 40 * z)); plotDraw(); };
        if (UI()?.zoomControl) { zoomBar = UI().zoomControl({get, set, fit: () => { view = defaultView(); plotDraw(); }, min: 0.001, max: 1000, fitLabel: 'Revenir à la vue de départ'}); slot.appendChild(zoomBar); }
        else { slot.innerHTML = '<button type="button" class="icon-button small" data-z="-">−</button><button type="button" class="icon-button small" data-z="+">+</button>'; slot.addEventListener('click', e => { const b = e.target.closest('[data-z]'); if (b) set(get() * (b.dataset.z === '+' ? 1.25 : 0.8)); }); }
    }
    function bindPlot() {
        const cv = win.querySelector('[data-cm-canvas]'), trace = win.querySelector('[data-cm-trace]');
        let drag = null;
        cv.addEventListener('pointerdown', e => { view = view || defaultView(); drag = {x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy}; cv.setPointerCapture(e.pointerId); cv.classList.add('is-drag'); });
        cv.addEventListener('pointermove', e => {
            const r = cv.getBoundingClientRect();
            if (drag) { view.cx = drag.cx - (e.clientX - drag.x) / view.sx; view.cy = drag.cy + (e.clientY - drag.y) / view.sx; plotDraw(); trace.hidden = true; return; }
            view = view || defaultView();
            const x = view.cx + (e.clientX - r.left - r.width / 2) / view.sx, yMouse = view.cy - (e.clientY - r.top - r.height / 2) / view.sx;
            let best = null; plotFns.forEach((p, i) => { if (!p) return; const y = p.fn(x); if (!Number.isFinite(y)) return; const d = Math.abs(y - yMouse) * view.sx; if (d < 40 && (!best || d < best.d)) best = {d, y, i, p}; });
            if (!best) { trace.hidden = true; return; }
            const f = v => C().formatValue(v, {digits: 6, dec: st.dec}).html;
            trace.hidden = false; trace.innerHTML = `<span class="cm-cv-dot" style="background:${best.p.color}"></span><i>x</i> = ${f(x)} · <i>y</i> = ${f(best.y)}`;
            trace.style.left = `${Math.min(r.width - 160, Math.max(4, e.clientX - r.left + 12))}px`; trace.style.top = `${Math.max(4, r.height / 2 - (best.y - view.cy) * view.sx - 34)}px`;
        });
        const end = () => { drag = null; cv.classList.remove('is-drag'); };
        cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
        cv.addEventListener('pointerleave', () => { trace.hidden = true; });
        cv.addEventListener('wheel', e => {
            e.preventDefault(); view = view || defaultView(); const r = cv.getBoundingClientRect();
            const mx = view.cx + (e.clientX - r.left - r.width / 2) / view.sx, my = view.cy - (e.clientY - r.top - r.height / 2) / view.sx, k = Math.exp(-e.deltaY * 0.0015);
            view.sx = Math.max(0.04, Math.min(40000, view.sx * k)); view.cx = mx - (e.clientX - r.left - r.width / 2) / view.sx; view.cy = my + (e.clientY - r.top - r.height / 2) / view.sx; plotDraw();
        }, {passive: false});
        cv.tabIndex = 0;
        cv.addEventListener('keydown', e => { view = view || defaultView(); const d = 40 / view.sx; const mv = {ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d]}[e.key]; if (mv) { e.preventDefault(); view.cx += mv[0]; view.cy += mv[1]; plotDraw(); } else if (e.key === '+' || e.key === '=') { view.sx *= 1.25; plotDraw(); } else if (e.key === '-') { view.sx /= 1.25; plotDraw(); } else if (e.key === '0') { view = defaultView(); plotDraw(); } });
        if (window.ResizeObserver) new ResizeObserver(() => requestAnimationFrame(plotDraw)).observe(win.querySelector('[data-cm-cw]'));
        setupZoom();
    }
    function exportPng() {
        const cv = win.querySelector('[data-cm-canvas]'); plotDraw();
        const name = (A()?.safeExportFilename ? A().safeExportFilename('Courbes') : 'Courbes') + '.png';
        cv.toBlob(b => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast(`⤓ Image « ${name} » téléchargée.`); }, 'image/png');
    }

    /* ─── déplacer, agrandir ─── */
    function bindMove() {
        const head = win.querySelector('[data-cm-drag]'), grip = win.querySelector('[data-cm-resize]');
        let mv = null;
        head.addEventListener('pointerdown', e => { if (isPhone() || e.button !== 0 || e.target.closest('button, input, select')) return; const r = win.getBoundingClientRect(); mv = {dx: e.clientX - r.left, dy: e.clientY - r.top}; head.setPointerCapture(e.pointerId); win.classList.add('is-moving'); });
        head.addEventListener('pointermove', e => { if (!mv) return; const W = window.innerWidth, H = window.innerHeight, r = win.getBoundingClientRect(); win.style.left = `${Math.max(0, Math.min(W - 80, e.clientX - mv.dx))}px`; win.style.top = `${Math.max(0, Math.min(H - 40, e.clientY - mv.dy))}px`; void r; });
        const stop = () => { if (!mv) return; mv = null; win.classList.remove('is-moving'); savePlace(); };
        head.addEventListener('pointerup', stop); head.addEventListener('pointercancel', stop);
        head.addEventListener('dblclick', e => { if (e.target.closest('button')) return; ls.del(PLACE); applyPlace(); });
        let rs = null;
        grip.addEventListener('pointerdown', e => { if (isPhone()) return; e.preventDefault(); const r = win.getBoundingClientRect(); rs = {x: e.clientX, y: e.clientY, w: r.width, h: r.height}; grip.setPointerCapture(e.pointerId); win.classList.add('is-moving'); });
        grip.addEventListener('pointermove', e => { if (!rs) return; const r = win.getBoundingClientRect(); win.style.width = `${Math.max(300, Math.min(window.innerWidth - r.left - 4, rs.w + e.clientX - rs.x))}px`; win.style.height = `${Math.max(380, Math.min(window.innerHeight - r.top - 4, rs.h + e.clientY - rs.y))}px`; fitOut(); });
        const stopR = () => { if (!rs) return; rs = null; win.classList.remove('is-moving'); savePlace(); requestAnimationFrame(plotDraw); };
        grip.addEventListener('pointerup', stopR); grip.addEventListener('pointercancel', stopR);
        window.addEventListener('resize', () => { if (win && !win.hidden) { applyPlace(); requestAnimationFrame(plotDraw); } });
    }

    /* ─── clavier ─── */
    const isMod = e => (K()?.isMac ? e.metaKey : e.ctrlKey);
    function onKey(e) {
        const inCalc = e.target === input, inField = e.target.matches?.('input, select, textarea') && !inCalc;
        if (e.key === 'Escape') {
            e.preventDefault(); e.stopPropagation();
            if (inField) { e.target.blur(); input.focus(); return; }
            if (input.value) { input.value = ''; showError(null); preview(); return; }
            close(); return;
        }
        if (inField) { if (e.key === 'Enter' && e.target.matches('[data-cm-cv-in]')) { e.preventDefault(); e.target.blur(); } return; }
        if (st.mode === 'plot') return;
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); compute(); return; }
        if (isMod(e) && (e.key === 'c' || e.key === 'C') && !e.shiftKey && !e.altKey) { if (inCalc && input.selectionStart !== input.selectionEnd) return; e.preventDefault(); e.stopPropagation(); copy(copyText()); return; }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            const t = tape(); if (!t.length || !inCalc) return; e.preventDefault();
            if (tapeIdx === -1) { if (e.key === 'ArrowDown') return; draft = input.value; tapeIdx = t.length - 1; }
            else tapeIdx += e.key === 'ArrowUp' ? -1 : 1;
            if (tapeIdx < 0) tapeIdx = 0;
            if (tapeIdx >= t.length) { tapeIdx = -1; input.value = draft; } else input.value = t[tapeIdx].e;
            win.querySelectorAll('.cm-tr').forEach((li, i) => li.classList.toggle('is-key', i === tapeIdx));
            win.querySelector('.cm-tr.is-key')?.scrollIntoView({block: 'nearest'});
            input.setSelectionRange(input.value.length, input.value.length); preview(); return;
        }
        if (inCalc && e.key === '=' && !/[a-zA-Zπ]/.test(input.value.replace(/\b(ans|pi|e|phi|i)\b/g, '')) && !e.shiftKey) { e.preventDefault(); compute(); return; }
        // une touche tapée hors de la case (après un clic sur une touche) : elle va dans la case
        if (!inCalc && !isMod(e) && !e.altKey && e.key.length === 1 && !e.target.closest?.('[data-cm-plot]')) { e.preventDefault(); if (e.key === '=') { compute(); return; } insert(e.key === ',' || e.key === '.' ? 'DEC' : e.key); return; }
        if (!inCalc && e.key === 'Backspace') { e.preventDefault(); backspace(); return; }
        // après un résultat, un opérateur tapé continue le calcul
        if (inCalc && last?.fresh && !input.value && /^[+\-*/^!%×÷]$/.test(e.key)) { input.value = 'ans'; last.fresh = false; input.setSelectionRange(3, 3); }
        if (inCalc && e.key.length === 1) { last && (last.fresh = false); }
    }

    function bind() {
        win.addEventListener('keydown', onKey);
        win.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b || !win.contains(b)) return;
            const d = b.dataset;
            if (d.cmClose !== undefined) return close();
            if (d.cmSettings !== undefined) return openSettings();
            if (d.cmTab) { setState({mode: d.cmTab}); applyPlace(); if (d.cmTab !== 'plot') input.focus(); return; }
            if (d.cmAng) return setState({angle: d.cmAng});
            if (d.cmGroup) { st.group = d.cmGroup; saveSettings(st); drawGroup(); return; }
            if (d.cmKey) { const v = d.cmKey; if (v === 'eval') return compute(); if (v === 'clear') return clearAll(); if (v === 'back') return backspace(); if (v === 'neg') return negate(); return insert(v); }
            if (d.cmFk) { const g = GROUPS.find(x => x.id === st.group) || GROUPS[0], kk = g.keys[Number(d.cmFk)]; if (!kk) return; if (!kk.ins) { const m = win.querySelector('[data-cm-mx]'); if (m) { m.open = true; drawMatrixGrid(); m.querySelector('input')?.focus(); } return; } return insert(kk.ins); }
            if (d.cmEx) { input.value = d.cmEx; compute(); return; }
            if (d.cmMem) return memory(d.cmMem);
            if (d.cmCopy !== undefined) return copy(copyText());
            if (d.cmTapeClear !== undefined) return clearTape();
            if (d.cmReuse) { const x = tape()[Number(d.cmReuse)]; if (!x) return; if (!x.v) { toast('Ce résultat ne se reprend pas dans un calcul (c’est un texte).'); return; } const r = C().evaluate(x.v, {dec: '.', angle: 'rad'}); if (r.ok) { if (last) last.fresh = false; insert(C().asInput(r.value, {dec: st.dec})); } return; }
            if (d.cmRedo) { const x = tape()[Number(d.cmRedo)]; if (!x) return; input.value = x.e; if (last) last.fresh = false; input.focus(); input.setSelectionRange(x.e.length, x.e.length); preview(); return; }
            if (d.cmTcopy) { const x = tape()[Number(d.cmTcopy)]; if (x) copy(x.t); return; }
            if (d.cmMxIns !== undefined) { const r = Number(win.querySelector('[data-cm-mx-r]').value), c = Number(win.querySelector('[data-cm-mx-c]').value), cells = [...win.querySelectorAll('.cm-mx-cell')].map(x => x.value.trim() || '0'); const rows = Array.from({length: r}, (_, i) => `[${cells.slice(i * c, i * c + c).join(' ; ')}]`); insert(r === 1 ? rows[0] : `[${rows.join(' ; ')}]`); return; }
            if (d.cmCurveAdd !== undefined) { const l = curves(); l.push(''); saveCurves(l); drawCurves(); win.querySelector(`[data-cm-cv-in="${l.length - 1}"]`)?.focus(); plotDraw(); return; }
            if (d.cmCvDel !== undefined) { const l = curves(), i = Number(d.cmCvDel), old = l.slice(); l.splice(i, 1); saveCurves(l.length ? l : ['']); drawCurves(); plotDraw(); (A()?.undoToast || toast)?.('Courbe retirée.', {undo: () => { saveCurves(old); drawCurves(); plotDraw(); }}); return; }
            if (d.cmPng !== undefined) return exportPng();
        });
        win.addEventListener('input', e => {
            if (e.target === input) { tapeIdx = -1; if (input.value) showError(null); preview(); return; }
            if (e.target.matches('[data-cm-cv-in]')) { const l = curves(); l[Number(e.target.dataset.cmCvIn)] = e.target.value.slice(0, 300); saveCurves(l); compileCurves(); plotDraw(); }
        });
        win.addEventListener('change', e => { if (e.target.matches('[data-cm-mx-r], [data-cm-mx-c]')) drawMatrixGrid(); });
        win.addEventListener('toggle', e => { if (e.target.matches?.('[data-cm-mx]') && e.target.open) drawMatrixGrid(); }, true);
        win.addEventListener('submit', e => {
            e.preventDefault(); const f = e.target;
            if (f.matches('[data-cm-conv]')) { const v = f.querySelector('[data-cm-cv]').value.trim() || '1', a = f.querySelector('[data-cm-cfrom]').selectedOptions[0], b = f.querySelector('[data-cm-cto]').selectedOptions[0]; if (!a || !b) return; input.value = `${v} ${a.dataset.name} en ${b.dataset.name}`; compute(); return; }
            if (f.matches('[data-cm-age]')) { const a = f.a.value.trim(), b = f.b.value.trim(); if (!a) return UI()?.fail ? UI().fail(f.a, 'Écris la première date.') : null; if (!b) return UI()?.fail ? UI().fail(f.b, 'Écris la deuxième date.') : null; input.value = `${a} → ${b}`; compute(); return; }
            if (f.matches('[data-cm-rep]')) { const d = f.d.value.trim(); if (!d) return UI()?.fail ? UI().fail(f.d, 'Écris une date.') : null; input.value = /\ban\s+[ivx\d]+/i.test(d) ? `${d} en grégorien` : `${d} en républicain`; compute(); return; }
        });
        win.addEventListener('pointerdown', () => win.classList.add('is-front'));
        bindMove(); bindPlot();
    }

    /* ─── au-dessus de tout : la calculette suit la fenêtre (dialog) ouverte au-dessus ─── */
    let mo = null;
    function topModal() { return [...document.querySelectorAll('dialog[open]')].filter(d => { try { return d.matches(':modal'); } catch (_) { return false; } }).at(-1) || null; }
    function follow() {
        if (!win) return;
        const host = topModal() || document.body;
        if (win.parentElement !== host) { const had = win.contains(document.activeElement); host.appendChild(win); if (had) input?.focus({preventScroll: true}); }
        if (!mo) { let queued = false; mo = new MutationObserver(() => { if (queued || !win || win.hidden) return; queued = true; requestAnimationFrame(() => { queued = false; follow(); }); }); mo.observe(document.body, {subtree: true, attributes: true, attributeFilter: ['open'], childList: true}); }
    }

    /* ─── ⚙️ Réglages (K2 dans la fenêtre) et 💾 Réglages enregistrés ─── */
    function openSettings() {
        if (!ext.openDialog) return;
        const cm = window.LCNDA_EXT?.calendarMore, s = settings(), T = UI()?.toggleHtml;
        const sel = (name, opts, v) => `<select name="${name}">${opts.map(([kk, l]) => `<option value="${kk}"${kk === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
        const body = `<div class="form-grid cm-set">
            <label>Thème${sel('theme', [['app', 'Comme l’app (clair ou sombre)'], ['light', 'Toujours clair'], ['dark', 'Toujours sombre']], s.theme)}</label>
            <label>Unité des angles${sel('angle', ANGLES.map(([kk, , t]) => [kk, t]), s.angle)}</label>
            <label>Chiffres affichés<input type="number" name="digits" min="4" max="15" step="1" value="${s.digits}" data-unit="chiffres"></label>
            <label>Séparateur décimal${sel('dec', [[',', 'Virgule : 2,5 (et « ; » entre les nombres)'], ['.', 'Point : 2.5 (et « , » ou « ; » entre les nombres)']], s.dec)}</label>
            <label class="span-2">Mesures anciennes${sel('region', (cm?.REGIONS || [{id: 'paris', label: 'Paris, Île-de-France (mesures du roi)'}]).map(r => [r.id, r.label]), s.region)}</label>
            <div class="span-2">${T ? T('Fractions exactes quand c’est possible (1/3 au lieu de 0,333…)', {checked: s.frac, attrs: 'name="frac"'}) : `<label class="ui-toggle"><input type="checkbox" name="frac"${s.frac ? ' checked' : ''}><i></i>Fractions exactes</label>`}</div>
            <div class="span-2">${T ? T('Bouton 🧮 dans la barre du haut', {checked: s.topButton, attrs: 'name="topButton"', sub: `La calculette s’ouvre aussi avec ${kbd('⇧⌘Y')} (à changer dans Maintenance → Raccourcis).`, html: true}) : ''}</div>
            </div>
            <div class="cm-set-foot"><button type="button" class="button small secondary" data-ui-reset>↺ Remettre comme au départ</button></div>
            <div data-cm-presets></div>`;
        ext.openDialog({eyebrow: 'CALCULETTE', title: '⚙️ Réglages de la calculette', body, onOpen: dg => {
            const f = dg.querySelector('form');
            const read = () => ({...settings(), theme: f.theme.value, angle: f.angle.value, digits: Number(f.digits.value) || 10, dec: f.dec.value, region: f.region.value, frac: f.frac.checked, topButton: f.topButton ? f.topButton.checked : true});
            const fill = () => { const v = settings(); f.theme.value = v.theme; f.angle.value = v.angle; f.digits.value = v.digits; f.digits.dispatchEvent(new Event('lcnda:sync')); f.dec.value = v.dec; f.region.value = v.region; f.frac.checked = v.frac; if (f.topButton) f.topButton.checked = v.topButton; };
            UI()?.autoSaveDialog?.(dg, {keys: [KEY], label: 'Réglage de la calculette', save: () => saveSettings(read()), reload: fill, reset: () => ls.set(KEY, {...DEF, mode: settings().mode}), onChange: () => { st = settings(); unitCacheReset(); applyState(); preview(); drawMem(); }});
            presets(dg.querySelector('[data-cm-presets]'), fill);
        }});
    }
    const unitCacheReset = () => C()?._reset?.();
    function presets(slot, fill) {
        const U = UI(); if (!slot || !U?.presetsFrame) return;
        const list = () => { const v = ls.get(PRESETS, []); return Array.isArray(v) ? v.filter(x => x && typeof x.name === 'string').slice(0, 60) : []; };
        const put = l => ls.set(PRESETS, l.slice(0, 60)), today = () => new Date().toISOString();
        const now = () => { const s = settings(); return {theme: s.theme, mode: s.mode, angle: s.angle, digits: s.digits, dec: s.dec, frac: s.frac, region: s.region}; };
        const use = data => { saveSettings({...settings(), ...clean({...settings(), ...data})}); st = settings(); unitCacheReset(); applyState(); fill(); preview(); };
        const frame = U.presetsFrame({id: 'calculette', what: 'les réglages de la calculette (thème, mode, angle, précision)', list: () => list().map(x => ({name: x.name, date: x.date})),
            apply: i => { const x = list()[i]; if (!x) return false; use(x.data); },
            save: name => { const l = list(), it = {name, date: today(), data: now()}, i = l.findIndex(x => x.name === name); if (i >= 0) l[i] = it; else l.push(it); put(l); },
            replace: i => { const l = list(); if (!l[i]) return false; l[i] = {...l[i], date: today(), data: now()}; put(l); },
            rename: (i, name) => { const l = list(); if (!l[i]) return false; l[i].name = name; put(l); },
            duplicate: i => { const l = list(), x = l[i]; if (!x) return false; l.splice(i + 1, 0, {name: U.freeName ? U.freeName(x.name, l.map(y => y.name)) : `${x.name} (copie)`, date: today(), data: x.data}); put(l); },
            exportOne: i => { const x = list()[i]; if (x) A()?.exportSettingFile?.('calculette', x.name, {data: x.data}); return false; },
            remove: i => { const l = list(), x = l[i]; if (!x) return false; if (A()?.undoLocalChange) A().undoLocalChange(`Réglage « ${x.name} » supprimé`, [PRESETS], () => { l.splice(i, 1); put(l); }, () => frame.isConnected && frame.refresh()); else { l.splice(i, 1); put(l); } },
            importOne: async () => { const got = await A()?.importSettingFile?.('calculette', {names: list().map(x => x.name), check: dd => dd && typeof dd.data === 'object'}); if (!got) return false; const l = list(); l.push({name: got.nom, date: today(), data: clean(got.donnees.data)}); put(l); toast(`Réglage « ${got.nom} » importé : clique « Appliquer » pour t’en servir.`); },
        });
        slot.appendChild(frame);
    }

    /* ─── le bouton 🧮 de la barre du haut ─── */
    function topButton() {
        const show = settings().topButton;
        let b = document.getElementById('calculette-open');
        if (!show) { b?.remove(); return; }
        if (!b) {
            const anchor = document.getElementById('genealogy-switch'); if (!anchor) return;
            b = document.createElement('button'); b.type = 'button'; b.id = 'calculette-open'; b.className = 'screen-tool cm-entry'; b.setAttribute('aria-label', 'Calculette');
            b.title = 'Calculette : simple, scientifique, courbes, mesures anciennes, dates'; b.dataset.shortcut = shortcutLabel();
            b.innerHTML = '<span aria-hidden="true">🧮</span>'; anchor.before(b);
        }
        b.classList.toggle('is-on', !!(win && !win.hidden));
        b.setAttribute('aria-pressed', String(!!(win && !win.hidden)));
    }
    const shortcutLabel = () => { try { const o = JSON.parse(localStorage.getItem('genealogie-shortcuts') || '{}'); if (Object.prototype.hasOwnProperty.call(o, 'calculator')) { const c = String(o.calculator || ''); return c ? (A()?.shortcutKit?.comboLabel?.(c) || c) : ''; } } catch (_) {} return A()?.shortcutKit?.comboLabel?.('Mod+Shift+Y') || '⇧⌘Y'; };

    /* ─── ouvrir, fermer ─── */
    function open({expr = '', mode = null} = {}) {
        if (document.documentElement.classList.contains('ms-open')) return; // 🧓 mode simple : jamais de fenêtre par-dessus
        if (!C()) { toast('La calculette n’est pas encore chargée. Réessaie dans un instant.', 'error'); return; }
        if (!win) build(); else { win.hidden = false; st = settings(); applyState(); }
        if (mode) setState({mode});
        follow(); win.classList.add('is-open'); ls.set(OPEN, 1);
        if (expr) { input.value = String(expr); preview(); }
        requestAnimationFrame(() => { if (st.mode === 'plot') win.querySelector('[data-cm-cv-in="0"]')?.focus(); else input.focus({preventScroll: true}); });
        topButton();
        return win;
    }
    function close() {
        if (!win) return; win.hidden = true; win.classList.remove('is-open'); ls.del(OPEN); topButton();
        if (win.parentElement !== document.body) document.body.appendChild(win);
        document.getElementById('calculette-open')?.focus({preventScroll: true});
    }
    const toggle = () => (win && !win.hidden ? close() : open());
    ext.calculator = {open, close, toggle, isOpen: () => !!(win && !win.hidden), compute: (expr, o) => C()?.evaluate(expr, {...evalOptsSafe(), ...o})};
    const evalOptsSafe = () => { const s = settings(); return {angle: s.angle, digits: s.digits, dec: s.dec, frac: s.frac, region: s.region}; };
    ext.openCalculator = open;

    /* ─── 🧮 Widget du tableau de bord (et du Suivi) : une ligne de calcul, le résultat, les derniers calculs, « ⛶ Ouvrir la calculette » ─── */
    try { const a0 = A(); if (a0?.defaultDashboardBlocks && !a0.defaultDashboardBlocks.some(x => x[0] === 'calc_widget')) { a0.defaultDashboardBlocks.push(['calc_widget', '🧮 Calculette']); if (a0.defaultDashboardBlockSpans) a0.defaultDashboardBlockSpans.calc_widget = '6'; } } catch (_) {}
    ext.dashboard = ext.dashboard || {};
    const WTAPE = 'lcnda-calculette-widget';
    const wHist = () => (ls.get(WTAPE, []) || []).filter(h => Array.isArray(h) && h.length === 2).slice(0, 5);
    const wHistHtml = () => wHist().map((h, i) => `<li><button type="button" class="link-button" data-cw-reuse="${i}">${esc(h[0])} = <b>${esc(h[1])}</b></button></li>`).join('');
    ext.dashboard.calc_widget = {load: () => Promise.resolve(null), render: (index, widget, span) => A().card(index, '🧮 Calculette', '',
        `<form class="cw-form" data-cw autocomplete="off"><input name="q" class="cw-q" aria-label="Calcul" placeholder="2 × (3 + 4), 15 % × 80, 2/3 + 1/6…" spellcheck="false">
            <output class="cw-out" aria-live="polite"></output><ul class="cw-hist">${wHistHtml()}</ul>
            <div class="cw-ft"><span class="muted">Entrée : calculer · ↑ : reprendre le dernier</span><button type="button" class="button small secondary" data-calculette-open>⛶ Ouvrir la calculette</button></div></form>`, span)};
    document.addEventListener('submit', e => {
        const f = e.target.closest?.('form[data-cw]'); if (!f) return; e.preventDefault();
        const q = f.querySelector('.cw-q'), out = f.querySelector('.cw-out'), s0 = q.value.trim(); if (!s0) return;
        let r; try { r = ext.calculator.compute(s0); } catch (x) { r = {ok: false, error: String(x?.message || x)}; }
        if (r?.ok) { out.className = 'cw-out'; out.textContent = '= ' + r.text; ls.set(WTAPE, [[s0, r.text], ...wHist().filter(h => h[0] !== s0)].slice(0, 5)); document.querySelectorAll('form[data-cw] .cw-hist').forEach(u => { u.innerHTML = wHistHtml(); }); }
        else { out.className = 'cw-out is-err'; out.textContent = '⚠️ ' + (r?.error || 'Je ne comprends pas ce calcul.'); }
    });
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-cw-reuse]'); if (!b) return; const h = wHist()[Number(b.dataset.cwReuse)], q = b.closest('form[data-cw]')?.querySelector('.cw-q'); if (h && q) { q.value = h[0]; q.focus(); } });
    document.addEventListener('keydown', e => { if (e.key !== 'ArrowUp' || !e.target.matches?.('form[data-cw] .cw-q') || e.target.value) return; const h = wHist()[0]; if (h) { e.preventDefault(); e.target.value = h[0]; } });

    document.addEventListener('click', e => { if (e.target.closest?.('#calculette-open, [data-calculette-open]')) { e.preventDefault(); toggle(); } });
    const boot = () => { topButton(); if (ls.get(OPEN, 0) && !isPhone()) setTimeout(() => { if (!document.documentElement.classList.contains('ms-open')) open(); }, 400); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})();
