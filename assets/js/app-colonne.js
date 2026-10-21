/* LCNDA — ▤ K15 : la colonne de gauche réglable, et le cadre « Portraits et colonne de gauche » de l'Apparence.
 *
 * 1. Colonne de gauche (toutes les colonnes : Personnes, Graphiques, Carte, Listes, Recherche, Enquêtes, Comparaison,
 *    Chronologie, Fiches, ADN, Maintenance, Tableau de bord…)
 *    localStorage['genealogie-left-column'] = {mode: 'avant'|'nouveau', style: 'boutons'|'continue'|'aeree', nums,
 *      numstyle: 'origine'|'suite', tabs: 'avant'|'ligne'|'dessus'|'texte', size: 'normale'|'compacte', width (240–420), lf: 'bas'|'barre'}
 *    « Comme avant » (par défaut) : rien ne change. Sinon des attributs sur :root (data-lc-col-*) pour les styles (app.css),
 *    et un petit passage sur #sidebar-content après chaque dessin de la colonne : numéros qui se suivent, onglets
 *    « icône + nom », « Liste | Fiches » posé dans la barre au-dessus de la liste (le bouton d'origine reste caché dans
 *    la colonne et reçoit le clic : l'outil ne voit aucune différence).
 * 2. Maintenance → Apparence : onglets « 👤 Portraits » (K7, app-portraits.js) et « ▤ Colonne de gauche » (K15),
 *    d'après la maquette validée (grandes cartes à choisir, « Réglages en plus » avec leur « Pourquoi ? », aperçu, ↺).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const P = () => window.LCNDA_PORTRAITS;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k) => (A().toast ? A().toast(m, k) : console.info(m));
    const fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

    /* ═════════════════════════ 1. La colonne de gauche ═════════════════════════ */
    const KEY = 'genealogie-left-column';
    const PRESETS = {
        avant: {style: 'boutons', nums: true, numstyle: 'origine', tabs: 'avant', size: 'normale', width: 320, lf: 'bas'},
        nouveau: {style: 'continue', nums: true, numstyle: 'suite', tabs: 'ligne', size: 'normale', width: 320, lf: 'barre'},
    };
    const CKEYS = Object.keys(PRESETS.avant);
    function clean(raw) {
        const r = raw && typeof raw === 'object' ? raw : {};
        const mode = r.mode === 'nouveau' ? 'nouveau' : 'avant', b = PRESETS[mode];
        const w = Number(r.width);
        return {mode,
            style: ['boutons', 'continue', 'aeree'].includes(r.style) ? r.style : b.style,
            nums: typeof r.nums === 'boolean' ? r.nums : b.nums,
            numstyle: ['origine', 'suite'].includes(r.numstyle) ? r.numstyle : b.numstyle,
            tabs: ['avant', 'ligne', 'dessus', 'texte'].includes(r.tabs) ? r.tabs : b.tabs,
            size: r.size === 'compacte' ? 'compacte' : 'normale',
            width: Number.isFinite(w) ? Math.round(Math.max(240, Math.min(420, w)) / 10) * 10 : b.width,
            lf: ['bas', 'barre'].includes(r.lf) ? r.lf : b.lf};
    }
    function read() { try { return clean(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (_) { return clean(null); } }
    function write(s) { try { localStorage.setItem(KEY, JSON.stringify(clean(s))); } catch (_) { toast('Enregistrement impossible : la place du navigateur est pleine ?', 'error'); } apply(); }

    /** les onglets écrits sans icône : leur icône quand on choisit « icône + nom » */
    const TAB_ICONS = {personnes: '👤', animaux: '🐾', signets: '🔖', diagrammes: '🌳', enregistres: '💾', enregistrees: '💾', cartes: '🗺', images: '🖼', graphiques: '📊', statistiques: '📊', tous: '☰', toutes: '☰', liste: '☰', fiches: '🗂', medias: '🖼', lieux: '📍', sources: '📚', evenements: '📅', notes: '📝', tableaux: '🧩'};
    const EMOJI_START = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍|\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*(.*)$/u;
    const LF_SEL = '.segmented.investigation-display, .segmented.result-display';
    const NUM_SEL = '.side-number, .dashboard-widget-catalog-item > div:first-child > span';

    function apply() {
        const S = read(), root = document.documentElement, on = S.mode !== 'avant' || CKEYS.some(k => S[k] !== PRESETS.avant[k]);
        const set = (n, v) => (v ? root.setAttribute(n, v) : root.removeAttribute(n));
        set('data-lc-col-style', on && S.style !== 'boutons' ? S.style : '');
        set('data-lc-col-nums', on && !S.nums ? 'off' : '');
        set('data-lc-col-tabs', on && S.tabs !== 'avant' ? S.tabs : '');
        set('data-lc-col-size', on && S.size === 'compacte' ? 'compacte' : '');
        if (on && S.width !== 320) root.style.setProperty('--sidebar', `${S.width}px`); else root.style.removeProperty('--sidebar');
        decorate();
        return S;
    }

    /** Après chaque dessin de la colonne : numéros, onglets, « Liste | Fiches ». Ne réécrit que ce qui change (pas de boucle). */
    function decorate() {
        const content = document.getElementById('sidebar-content'); if (!content) return;
        const S = read();
        // numéros : ceux d'origine gardés dans data-lc-num, réécrits 01, 02… si « qui se suivent »
        let n = 0;
        content.querySelectorAll(NUM_SEL).forEach(el => {
            if (el.dataset.lcNum === undefined) el.dataset.lcNum = el.textContent;
            const want = S.numstyle === 'suite' ? String(++n).padStart(2, '0') : el.dataset.lcNum;
            if (el.textContent !== want) el.textContent = want;
        });
        // onglets du haut
        content.querySelectorAll('.segmented').forEach(seg => {
            if (seg.matches(LF_SEL)) return;
            seg.querySelectorAll(':scope > button').forEach(b => {
                if (S.tabs === 'avant') { if (b.dataset.lcTab !== undefined) { b.innerHTML = b.dataset.lcTab; delete b.dataset.lcTab; if (b.dataset.lcTabTitle === '1') { b.removeAttribute('title'); delete b.dataset.lcTabTitle; } } return; }
                if (b.dataset.lcTab !== undefined) return;
                const icEl = b.querySelector(':scope > .enquetes-tab-icon');
                const others = [...b.children].filter(c => c !== icEl);
                if (others.some(c => c.children.length || !/^(SPAN|B|SMALL|EM)$/.test(c.tagName))) return; // un onglet avec autre chose dedans : laissé tel quel
                let ic = '', tx = '';
                if (icEl) { ic = icEl.textContent.trim(); tx = others.map(c => c.textContent).join(' ').replace(/\s+/g, ' ').trim() || [...b.childNodes].filter(c => c !== icEl).map(c => c.textContent).join(' ').trim(); }
                else { const t = b.textContent.replace(/\s+/g, ' ').trim(), m = t.match(EMOJI_START); if (m && m[2]) { ic = m[1]; tx = m[2]; } else { tx = t; ic = TAB_ICONS[fold(t).replace(/[^a-z]/g, '')] || ''; } }
                if (!tx) return;
                b.dataset.lcTab = b.innerHTML;
                if (!b.hasAttribute('title')) { b.title = tx; b.dataset.lcTabTitle = '1'; }
                b.innerHTML = `${ic ? `<span class="lc-tab-ic" aria-hidden="true">${esc(ic)}</span>` : ''}<span class="lc-tab-tx">${esc(tx)}</span>`;
            });
            seg.classList.toggle('lc-tabs', S.tabs !== 'avant');
        });
        placeListToggle(content, S);
    }
    /** « Liste | Fiches » dans la barre au-dessus de la liste (H10) : une copie qui clique sur le bouton d'origine */
    function placeListToggle(content, S) {
        const ws = document.getElementById('workspace');
        const src = content.querySelector(LF_SEL);
        const old = ws?.querySelector('.lc-lf-moved');
        if (!src || S.lf !== 'barre' || (S.mode === 'avant' && S.lf === PRESETS.avant.lf)) { old?.remove(); if (src) src.classList.remove('lc-lf-src'); return; }
        const head = ws?.querySelector('.page > .page-header, .page-header');
        if (!head) { old?.remove(); src.classList.remove('lc-lf-src'); return; } // pas de barre : il reste en bas de la colonne
        const sig = [...src.querySelectorAll('button')].map(b => `${b.textContent}:${b.classList.contains('is-active')}`).join('|');
        if (old && old.dataset.sig === sig && head.contains(old)) { src.classList.add('lc-lf-src'); return; }
        old?.remove();
        const box = document.createElement('div');
        box.className = 'segmented lc-lf-moved'; box.dataset.sig = sig; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Affichage');
        [...src.querySelectorAll('button')].forEach((b, i) => {
            const c = document.createElement('button'); c.type = 'button'; c.textContent = b.textContent.trim();
            if (b.classList.contains('is-active')) c.classList.add('is-active');
            c.addEventListener('click', () => { const s = document.querySelector(`#sidebar-content :is(${LF_SEL})`); s?.querySelectorAll('button')[i]?.click(); });
            box.appendChild(c);
        });
        const sort = [...head.querySelectorAll('select')].find(s => /sort|tri/i.test(s.id + ' ' + s.name))?.closest('label') || head.querySelector('.ui-sortbar');
        if (sort && sort.parentNode) sort.before(box); else head.appendChild(box);
        head.classList.add('lc-lf-head');
        src.classList.add('lc-lf-src');
    }
    let queued = false;
    const schedule = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; if (document.documentElement.hasAttribute('data-lc-col-style') || document.documentElement.hasAttribute('data-lc-col-tabs') || read().mode !== 'avant' || read().numstyle !== 'origine' || read().lf !== 'bas' || document.querySelector('[data-lc-tab], .lc-lf-moved, .lc-lf-src')) decorate(); }); };
    function watch() {
        const content = document.getElementById('sidebar-content'), ws = document.getElementById('workspace');
        if (!content || !ws) return false;
        const mo = new MutationObserver(schedule);
        mo.observe(content, {childList: true, subtree: true});
        mo.observe(ws, {childList: true});
        new MutationObserver(() => { if (ws.querySelector(':scope > .page > .page-header') && !ws.querySelector('.lc-lf-moved')) schedule(); }).observe(ws, {childList: true, subtree: true});
        return true;
    }
    if (!watch()) document.addEventListener('DOMContentLoaded', watch, {once: true});

    window.LCNDA_COLUMN = {KEY, PRESETS, read, write, clean, apply, decorate};
    apply();

    /* ═════════════════ 2. Maintenance → Apparence : « 👤 Portraits » et « ▤ Colonne de gauche » ═════════════════ */
    const TAB_KEY = 'lcnda-apparence-k-tab';
    const tabNow = () => { try { return localStorage.getItem(TAB_KEY) === 'colonne' ? 'colonne' : 'portraits'; } catch (_) { return 'portraits'; } };
    const PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9b48a"/><stop offset="1" stop-color="#7d6440"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><circle cx="50" cy="40" r="19" fill="#5b4428"/><path d="M14 100c4-24 18-34 36-34s32 10 36 34z" fill="#3e2d1a"/><path d="M31 37c2-16 36-16 38 0c-6-8-32-8-38 0z" fill="#2c1f12"/></svg>').replace(/\(/g, '%28').replace(/\)/g, '%29');
    const PEOPLE = {
        joseph: {first_name: 'Joseph', last_name: 'MARTIN', gender: 'male', y: '1952–2010', sosa: 1, meta: '° 25 mai 1952 Naves · † 24 avril 2010'},
        louise: {first_name: 'Louise', last_name: 'BORIE', gender: 'female', y: '1922–1999', sosa: 3, photo: PHOTO, meta: '° 9 mars 1922 Tulle · † 9 déc. 1999'},
        marie: {first_name: 'Marie', last_name: 'LEROY', gender: 'female', y: '1937–?', sosa: 2, meta: '° 20 juin 1937 Brive'},
        camille: {first_name: 'Camille', last_name: 'DURAND', gender: '', y: '1871–?', meta: '° vers 1871'},
        pompon: {first_name: 'Pompon', last_name: '', kind: 'animal', y: '2009–2021', meta: 'chat · 2009–2021'},
    };
    const pname = p => esc(p.first_name) + (p.last_name ? ' ' + esc(p.last_name) : '');
    /** aperçu avec un réglage donné (variables posées sur le portrait lui-même) */
    const av = (k, size, S) => P().avatar({...PEOPLE[k], name: [PEOPLE[k].first_name, PEOPLE[k].last_name].join(' ')}, size, {settings: S});
    /** « Comme avant » : le dessin d'aujourd'hui de chaque endroit */
    function avOld(k, place, big) {
        const p = PEOPLE[k], ini = p.kind === 'animal' ? '🐾' : (p.first_name[0] + (p.last_name ? p.last_name[0] : '')).toUpperCase(), g = p.kind === 'animal' ? 'a' : p.gender === 'male' ? 'm' : p.gender === 'female' ? 'f' : 'u';
        if (place === 'fiche') { const s = big || 88; return `<span class="lck-old lck-old-fiche" style="width:${s}px;height:${s}px;font-size:${Math.round(s * .32)}px${p.photo ? `;background-image:url('${esc(p.photo)}')` : ''}">${p.photo ? '' : esc(ini)}</span>`; }
        if (place === 'liste') return `<span class="lck-old lck-old-liste is-${g}">${esc(ini)}</span>`;
        if (place === 'picker') return `<span class="lck-old lck-old-picker is-${g}"${p.photo ? ` style="background-image:url('${esc(p.photo)}')"` : ''}>${p.photo ? '' : esc(ini)}</span>`;
        if (place === 'pastille') return `<span class="lck-old lck-old-pastille">${esc(ini)}</span>`;
        return '';
    }
    function placesHtml(S, old) {
        const X = (k, size, place) => (old ? avOld(k, place) : av(k, size, S));
        const fiche = `<div class="lck-place"><span>Fiche · 88 px</span><div class="lck-f-hero">${X('joseph', 88, 'fiche')}<div style="min-width:0"><div class="lck-eb">FICHE INDIVIDUELLE · #1</div><h4>Joseph MARTIN</h4><p>25 mai 1952 — 24 avril 2010</p></div></div></div>`;
        const liste = `<div class="lck-place"><span>Liste · 34 px</span><div class="lck-f-rows">${['joseph', 'louise', 'camille', 'pompon'].map(k => `<div class="lck-f-row">${X(k, 34, 'liste')}<b>${pname(PEOPLE[k])}</b><small>${PEOPLE[k].y}</small></div>`).join('')}</div></div>`;
        const picker = `<div class="lck-place"><span>Menu de choix · 34 px</span><div class="lck-f-pick"><div class="lck-ph">3 fiches trouvées</div>${['louise', 'marie', 'joseph'].map((k, i) => { const p = PEOPLE[k]; return `<div class="lck-pi${i === 0 ? ' on' : ''}">${X(k, 34, 'picker')}<div><b>${pname(p)}</b><small>${esc(p.meta)}</small></div>${p.sosa ? `<span class="lck-sosa-b">Sosa ${p.sosa}</span>` : ''}</div>`; }).join('')}</div></div>`;
        const tbox = k => { const p = PEOPLE[k]; return `<div class="lck-f-box">${old ? '' : av(k, 48, S)}<div><b>${pname(p)}</b><small>${p.y}</small></div></div>`; };
        const arbre = `<div class="lck-place"><span>Arbre · 48 px</span><div class="lck-f-tree"><div class="lck-lvl">${tbox('joseph')}</div><div class="lck-vline"></div><div class="lck-lvl">${tbox('marie')}${tbox('louise')}</div></div>${old ? '<span class="lck-none-note">Aujourd’hui, pas de portrait dans les cases de l’arbre.</span>' : ''}</div>`;
        const pastille = `<div class="lck-place"><span>Pastille · 22 px</span><div class="lck-f-chips">${['joseph', 'louise', 'camille', 'pompon'].map(k => `<span class="lck-f-chip">${X(k, 22, 'pastille')}${pname(PEOPLE[k])} <small>${PEOPLE[k].y.split('–')[0]}</small><span class="lck-x">×</span></span>`).join('')}</div></div>`;
        return fiche + liste + picker + arbre + pastille;
    }
    const P_CARDS = [
        {k: 'avant', t: 'Comme avant', tag: 'Par défaut', tagc: '', why: [['👍', '<b>Rien ne bouge</b> : chaque écran garde le dessin que tu connais.'], ['👎', '7 dessins différents ; tes couleurs homme / femme et ta forme d’avatar ne s’y appliquent pas.']]},
        {k: 'rond', t: 'Rond unique', tag: 'Nouveau', tagc: 'new', why: [['👍', '<b>Un seul dessin partout</b>, à la couleur du genre : homme, femme, animal se voient d’un coup d’œil.'], ['👍', 'Léger dans les listes serrées et le menu de choix (c’est déjà le modèle validé du menu).']]},
        {k: 'carre', t: 'Le carré de la fiche, partout', tag: 'Nouveau', tagc: 'new', why: [['👍', '<b>Le style « archive »</b> de ta fiche : bord noir, photo en noir et blanc, comme une photo d’identité collée.'], ['👍', 'Va avec les blocs de l’app (traits noirs, coins droits). Plus sobre, moins coloré.']]},
    ];
    const SHAPES = [['rond', 'Rond', 'border-radius:50%'], ['arrondi', 'Carré arrondi', 'border-radius:22%'], ['carre', 'Carré', ''], ['penche', 'Carré penché', 'transform:rotate(-6deg)']];
    const PKEYS = () => Object.keys(P().PRESETS.rond);
    const isModP = (S, D) => PKEYS().some(k => S[k] !== D[k]);
    const why = t => `<p class="lck-why"><b>Pourquoi ?</b> ${t}</p>`;
    const tog = (id, label) => `<label class="ui-toggle lck-tog"><input type="checkbox" id="${id}"><i></i><span>${label}</span></label>`;
    const range = (id, min, max, step, unit, def) => `<div class="lck-c3"><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" data-unit="${unit}" data-default="${def}" aria-label="${unit}"></div>`;
    const color = (key, label) => `<label class="lck-c2"><span>${label}</span><input type="color" data-lck-color="${key}" aria-label="${esc(label)}"></label>`;

    function portraitsPageHtml() {
        return `<div class="lck-panel"><div class="lck-panel-head"><div><h3><span class="lck-step">1</span>Quel portrait veux-tu ?</h3><p class="muted">Le rond ou carré qui montre une personne : sur sa fiche, dans les listes, le menu de choix, l’arbre et les pastilles.</p></div><span class="lck-saved" data-lck-saved="p"></span></div>
            <div class="lck-choices" id="lck-p-choices"></div>
            <div class="lck-settings" id="lck-p-settings"><div>
                <h3 class="lck-h"><span class="lck-step">2</span>Réglages en plus</h3>
                <div class="ui-notice ui-notice-info lck-off-note" id="lck-p-off" role="status"><span class="ui-notice-ic" aria-hidden="true">ℹ️</span><span>Avec « Comme avant », chaque endroit garde son propre dessin : ces réglages ne s’appliquent pas. Choisis le rond unique ou le carré de la fiche pour les utiliser.</span></div>
                <div class="lck-set-list" id="lck-p-list">
                    <div class="lck-set"><div class="lck-row"><span class="lck-lab">Forme</span><div class="lck-shapes" id="lck-p-shape"></div></div>${why('Le rond est doux et se repère vite dans une liste serrée. Le carré rappelle une photo d’identité collée sur une fiche d’archive. Le carré penché reprend le style des numéros de l’app.')}</div>
                    <div class="lck-set" id="lck-p-radius-set"><div class="lck-row"><label for="lck-p-radius">Arrondi des coins</label>${range('lck-p-radius', 0, 45, 1, '%', 20)}</div>${why('Un peu d’arrondi adoucit le carré sans le confondre avec un rond. Seulement pour « Carré arrondi ». Double-clic sur le curseur : valeur de départ.')}</div>
                    <div class="lck-set"><div class="lck-row"><label for="lck-p-init">Taille des initiales</label>${range('lck-p-init', 28, 60, 1, '%', 40)}</div>${why('Plus grandes, elles se lisent mieux de loin et sur les petits ronds ; plus petites, le portrait paraît plus calme. Le chiffre est une part de la taille du portrait, donc ça reste juste aux 4 tailles.')}</div>
                    <div class="lck-set"><div class="lck-row"><label for="lck-p-bw">Bord</label><div class="lck-stack">${range('lck-p-bw', 0, 4, .5, 'px', 0)}<div id="lck-p-bc-slot">${color('bc', 'Couleur du bord')}</div></div></div>${why('Un bord noir va avec les blocs de l’app (tous ont un trait noir de 2 px) ; sans bord, c’est plus léger. Sur les plus petits portraits, le bord s’affine tout seul.')}</div>
                    <div class="lck-set"><div class="lck-row"><label for="lck-p-cmode">Couleurs</label><select id="lck-p-cmode"><option value="plein">Couleur du genre, fond plein (lettres blanches)</option><option value="pale">Couleur du genre, fond pâle (lettres de couleur)</option><option value="unique">Une seule couleur pour tous (comme la fiche)</option></select></div>
                        <div class="lck-row"><span></span><div class="lck-c2s" id="lck-p-colors">${color('m', 'Homme')}${color('f', 'Femme')}${color('u', 'Inconnu')}${color('a', '🐾 Animal')}${color('one', 'Tout le monde')}</div></div>${why('Avec la couleur du genre, tu sais d’un coup d’œil si c’est un homme, une femme ou un animal, partout pareil. Une seule couleur, c’est plus sobre et plus « archive », comme le carré actuel de la fiche.')}</div>
                    <div class="lck-set"><div class="lck-row"><span class="lck-lab">Photo</span><div class="lck-stack">${tog('lck-p-photo', 'Montrer la photo de la fiche quand elle existe')}<span id="lck-p-bwphoto-l">${tog('lck-p-bwphoto', 'Photos en noir et blanc')}</span></div></div>${why('Une photo, c’est plus parlant que deux lettres. Les initiales toujours, c’est plus régulier quand certaines photos sont floues ou mal cadrées. Le noir et blanc donne le même ton à toutes les photos, anciennes comme récentes (c’est ce que fait la fiche aujourd’hui).')}</div>
                    <div class="lck-set"><div class="lck-row"><label for="lck-p-letters">Initiales</label><select id="lck-p-letters"><option value="deux">Prénom + nom (JM)</option><option value="une">Une seule lettre, celle du nom (M)</option></select></div>${why('Deux lettres distinguent Joseph et Jean MARTIN. Une seule lettre est plus lisible sur les petits ronds de 22 px et met la famille en avant.')}</div>
                    <div class="lck-set"><div class="lck-row"><span class="lck-lab">Badge Sosa</span>${tog('lck-p-sosa', 'Mettre le numéro Sosa sur le portrait')}</div>${why('Tu repères tes ancêtres directs sans lire la ligne. Si tu trouves que ça charge trop, laisse-le éteint : le Sosa reste écrit à droite des listes. Il n’apparaît pas sur les portraits de 22 px, trop petits.')}</div>
                </div></div>
                <aside class="lck-preview" id="lck-p-preview"><div class="lck-preview-head"><b>👁 Aperçu : le même réglage partout</b>${tog('lck-p-dark', 'Mode sombre')}</div><div class="lck-preview-body" id="lck-p-prev"></div></aside>
            </div>
            <div class="lck-foot"><button type="button" class="button secondary" id="lck-p-reset">↺ Remettre comme au départ</button><span class="lck-legend">4 tailles seulement : 22 px (dans une ligne), 34 px (listes, menu de choix), 48 px (arbre, vignettes), 88 px (fiche).</span></div></div>`;
    }

    /* ── colonne : aperçus ── */
    const TOOLS = {
        carte: {eb: '04 — LOCALISER', h: 'Carte', tabs: [['🗺', 'Cartes'], ['💾', 'Enregistrées']], oldTabs: 'texte', first: 'Ce que la carte montre', groups: [
            ['', [['01', 'Tous les événements', 1], ['02', 'Recensement']]],
            ['Mode', [['A', 'Carte', 1], ['B', 'Superposition'], ['C', 'Animation'], ['D', 'Itinéraire'], ['E', 'Cimetières'], ['H', '📸 Cartes de photos']]],
            ['Affichage', [['F', 'Marqueurs', 1], ['G', 'Carte thermique']]]], list: false},
        graph: {eb: '03 — VISUALISER', h: 'Graphiques', tabs: [['🌳', 'Diagrammes'], ['💾', 'Enregistrés']], oldTabs: 'texte', first: 'Diagrammes', groups: [
            ['', [['01', 'Arbre des ascendants', 1], ['02', 'Arbre des descendants'], ['03', 'Sablier familial'], ['04', 'Éventail des générations'], ['05', 'Liens de parenté']]],
            ['Statistiques', [['S1', 'Naissances par décennie'], ['S2', 'Prénoms les plus donnés'], ['S3', 'Âge au mariage']]]], more: '… jusqu’à S36', moreNew: '… jusqu’à 46', list: false},
        enq: {eb: '08 — ENQUÊTER', h: 'Enquêtes', tabs: [['🔍', 'Enquêtes'], ['🧭', 'Battue'], ['📚', 'Atelier'], ['🧩', 'Tableaux']], oldTabs: 'dessus', first: 'Où en est l’enquête', groups: [
            ['', [['01', 'Toutes', 1], ['02', 'En cours'], ['03', 'En pause'], ['04', 'Terminées']]]], list: true},
    };
    function sidebarHtml(S, t, scale = 1) {
        const T = TOOLS[t], tabsMode = S.tabs === 'avant' ? T.oldTabs : S.tabs, st = S.style || 'boutons';
        const tabs = `<div class="lck-c-tabs${tabsMode === 'dessus' ? ' over' : tabsMode === 'ligne' ? ' line' : ''}" style="grid-template-columns:repeat(${T.tabs.length},1fr)">${T.tabs.map(([i, nm], x) => `<span class="${x === 0 ? 'is-active' : ''}" title="${nm}">${tabsMode === 'texte' ? nm : tabsMode === 'dessus' ? `<em>${i}</em>${nm}` : `<em>${i}</em><b>${nm}</b>`}</span>`).join('')}</div>`;
        let n = 0, body = '';
        T.groups.forEach(([g, items]) => {
            const gl = g || (st !== 'boutons' ? T.first : ''); if (gl) body += `<div class="lck-c-sec">${esc(gl)}</div>`;
            items.forEach(([orig, label, act]) => { n++; const num = S.numstyle === 'suite' ? String(n).padStart(2, '0') : orig; body += `<div class="lck-c-item${act ? ' is-active' : ''}">${S.nums ? `<i>${num}</i>` : ''}<span>${esc(label)}</span></div>`; });
        });
        if (T.more) body += `<div class="lck-c-more">${S.numstyle === 'suite' ? T.moreNew : T.more}</div>`;
        const lf = T.list && S.lf === 'bas' ? '<div class="lck-c-lf"><span>Liste</span><span class="is-active">Fiches</span></div>' : '';
        return `<div class="lck-c-side st-${st}${S.size === 'compacte' ? ' compact' : ''}" style="width:${Math.round(S.width * scale)}px"><div class="lck-hd"><div><div class="lck-eb">${T.eb}</div><h4>${T.h}</h4></div><span class="lck-back">←</span></div>${tabs}${t === 'enq' ? '<div class="lck-h10" style="border:0;padding:0"><span class="lck-s">🔍 Chercher une enquête…</span></div>' : ''}<div class="lck-c-list">${body}</div>${lf}</div>`;
    }
    function mainHtml(S, t) {
        const T = TOOLS[t];
        if (!T.list) return `<div class="lck-c-main">${t === 'carte' ? '<div class="lck-c-map"><b style="left:30%;top:40%"></b><b style="left:55%;top:28%"></b><b style="left:68%;top:62%"></b><b style="left:40%;top:70%"></b></div>' : '<div class="lck-c-map is-tree"><span>arbre</span></div>'}</div>`;
        return `<div class="lck-c-main"><div class="lck-h10"><span class="lck-s">🔍 Chercher…</span><span class="lck-b">Filtrer ▾</span>${S.lf === 'barre' ? '<span class="lck-lf"><span>Liste</span><span class="is-active">Fiches</span></span>' : ''}<span class="lck-b">Trier : récentes ▾</span></div><div class="lck-c-cards"><div></div><div></div><div></div><div></div><div></div><div></div></div></div>`;
    }
    const C_CARDS = [
        {k: 'avant', t: 'Comme avant', tag: 'Par défaut', tagc: '', why: [['👍', '<b>Rien ne bouge</b> : tes repères restent (lettres A, B…, S1…, onglets de chaque outil).'], ['👎', 'Numéros dans le désordre sur la Carte (H avant F), onglets dessinés de 3 façons, « Liste | Fiches » loin de la liste.']]},
        {k: 'nouveau', t: 'Nouveau', tag: 'Nouveau', tagc: 'new', why: [['👍', '<b>Une liste continue dans un seul cadre</b>, comme un sommaire : lignes collées, entrée choisie en bandeau bleu, numéros qui se suivent (01, 02, 03…).'], ['👍', 'Mêmes onglets dans tous les outils (icône + nom sur une ligne) ; « Liste | Fiches » dans la barre au-dessus de la liste, comme dans les Listes.']]},
    ];
    function columnPageHtml() {
        return `<div class="lck-panel"><div class="lck-panel-head"><div><h3><span class="lck-step">1</span>Quelle colonne de gauche veux-tu ?</h3><p class="muted">La colonne des outils Graphiques, Carte, Enquêtes, Recherche, Personnes, Comparaison…</p></div><span class="lck-saved" data-lck-saved="c"></span></div>
            <div class="lck-choices two" id="lck-c-choices"></div>
            <div class="lck-settings"><div>
                <h3 class="lck-h"><span class="lck-step">2</span>Réglages en plus</h3>
                <p class="muted lck-sub">Ils marchent avec les deux choix. Si tu en changes un, la carte choisie affiche « retouché ».</p>
                <div class="lck-set-list">
                    <div class="lck-set"><div class="lck-row"><label for="lck-c-style">Style des entrées</label><select id="lck-c-style"><option value="boutons">Boutons encadrés (comme avant)</option><option value="continue">Liste continue (nouveau)</option><option value="aeree">Liste aérée</option></select></div>${why('Les boutons encadrés se cliquent comme des touches, mais chaque entrée prend de la place et la colonne paraît chargée. La liste continue tient dans un seul cadre, comme un sommaire : plus d’entrées visibles d’un coup, et la ligne bleue de l’entrée choisie saute aux yeux. La liste aérée enlève aussi les traits et laisse plus d’espace : c’est la plus calme à lire, mais il faut un peu plus faire défiler.')}</div>
                    <div class="lck-set"><div class="lck-row"><span class="lck-lab">Numéros</span>${tog('lck-c-nums', 'Afficher les numéros devant les entrées')}</div>${why('Les numéros aident à se parler (« prends le 04 ») et à retrouver une entrée dans une longue liste. Sans eux, la colonne est plus épurée.')}</div>
                    <div class="lck-set" id="lck-c-numstyle-set"><div class="lck-row"><label for="lck-c-numstyle">Façon de numéroter</label><select id="lck-c-numstyle"><option value="origine">Lettres d’origine (01, A, B… S1, S2…)</option><option value="suite">Numéros qui se suivent (01, 02, 03…)</option></select></div>${why('Les numéros qui se suivent ne sautent jamais (plus de « H » avant « F »), même dans la partie Statistiques. Les lettres d’origine gardent tes repères si tu les connais par cœur.')}</div>
                    <div class="lck-set"><div class="lck-row"><label for="lck-c-tabs">Onglets du haut</label><select id="lck-c-tabs"><option value="avant">Comme avant (chaque outil le sien)</option><option value="ligne">Icône + nom sur une ligne (rétrécit si la place manque)</option><option value="dessus">Icône au-dessus du nom</option><option value="texte">Nom seul, sans icône</option></select></div>${why('Le même dessin partout évite de chercher. Sur une ligne, c’est plus bas et ça laisse de la place à la liste ; si la colonne est trop étroite, le nom rétrécit puis seule l’icône reste (le nom s’affiche en bulle). L’icône au-dessus se lit mieux quand il y a 4 onglets dans une colonne étroite.')}</div>
                    <div class="lck-set"><div class="lck-row"><label for="lck-c-size">Taille des entrées</label><select id="lck-c-size"><option value="normale">Normale</option><option value="compacte">Compacte</option></select></div>${why('Compacte : on voit toutes les entrées sans faire défiler (pratique pour les 36 graphiques ou sur un petit écran). Normale : plus facile à cliquer et à lire.')}</div>
                    <div class="lck-set"><div class="lck-row"><label for="lck-c-width">Largeur de la colonne</label>${range('lck-c-width', 240, 420, 10, 'px', 320)}</div>${why('Plus étroite, l’arbre ou la carte ont plus de place ; plus large, les noms longs (« Ascendants et descendants (liste) ») tiennent sur une ligne. Double-clic : 320 px, la valeur de départ.')}</div>
                    <div class="lck-set"><div class="lck-row"><label for="lck-c-lf">« Liste | Fiches »</label><select id="lck-c-lf"><option value="bas">En bas de la colonne</option><option value="barre">Dans la barre au-dessus de la liste</option></select></div>${why('Dans la barre du haut, il est juste au-dessus de ce qu’il change, au même endroit que dans les Listes (barre H10). En bas de la colonne, c’est là où tu as l’habitude de le trouver dans Recherche et Enquêtes.')}</div>
                </div></div>
                <aside class="lck-preview"><div class="lck-preview-head"><b>👁 Aperçu</b><div class="ui-tabs lck-mini-tabs" id="lck-c-tool" role="tablist"><button type="button" data-tool="carte" class="is-active">Carte</button><button type="button" data-tool="graph">Graphiques</button><button type="button" data-tool="enq">Enquêtes</button></div></div><div class="lck-preview-body"><div id="lck-c-prev"></div><p class="lck-legend" id="lck-c-prev-note"></p></div></aside>
            </div>
            <div class="lck-foot"><button type="button" class="button secondary" id="lck-c-reset">↺ Remettre comme au départ</button><span class="lck-legend">Au départ : « Comme avant ».</span></div></div>`;
    }

    function panelHtml() {
        const t = tabNow();
        return `<section class="person-block-config lck-k" id="lc-portraits-colonne"><header><span class="eyebrow">APPARENCE</span><h3>Portraits et colonne de gauche</h3><p>Pour chacun, tu choisis ce que tu préfères en cliquant sur une grande carte, puis tu peux affiner en dessous. Tant que tu ne touches à rien, <b>tout reste comme avant</b>.</p></header>
            <div class="segmented lck-pagetabs" role="tablist"><button type="button" role="tab" data-lck-page="portraits" class="${t === 'portraits' ? 'is-active' : ''}">👤 Portraits</button><button type="button" role="tab" data-lck-page="colonne" class="${t === 'colonne' ? 'is-active' : ''}">▤ Colonne de gauche</button></div>
            <div data-lck-pane="portraits" ${t === 'portraits' ? '' : 'hidden'}>${portraitsPageHtml()}</div>
            <div data-lck-pane="colonne" ${t === 'colonne' ? '' : 'hidden'}>${columnPageHtml()}</div></section>`;
    }

    /** ce qui a changé ailleurs que dans ce cadre se redessine (fiche ouverte, colonne) */
    const refreshApp = () => { try { A().renderSidebar?.(); } catch (_) {} };
    function bindPanel(box) {
        if (!box || box.dataset.lckBound) return; box.dataset.lckBound = '1';
        const $ = s => box.querySelector(s);
        const flash = w => { const s = box.querySelector(`[data-lck-saved="${w}"]`); if (!s) return; s.textContent = '✓ Enregistré'; s.animate?.([{opacity: .2}, {opacity: 1}], {duration: 500}); };
        let tool = 'carte';
        /* ── portraits ── */
        const syncRange = (id, v) => { const r = $('#' + id); if (r && String(r.value) !== String(v)) r.value = v; }; // la case chiffrée (C3) suit toute seule
        const syncColor = (key, v) => { const i = box.querySelector(`[data-lck-color="${key}"]`); if (i && i.value !== v) i.value = v; }; // la pastille (C2) aussi
        function renderP() {
            const S = P().read(), off = S.mode === 'avant';
            $('#lck-p-choices').innerHTML = P_CARDS.map(c => {
                const on = S.mode === c.k, D = P().PRESETS[c.k], show = on && c.k !== 'avant' ? S : {...P().PRESETS.rond, ...D};
                const mod = on && c.k !== 'avant' && isModP(S, D);
                const stage = c.k === 'avant'
                    ? `${avOld('joseph', 'fiche', 64)}${avOld('joseph', 'picker')}${avOld('louise', 'liste')}${avOld('marie', 'pastille')}`
                    : `${av('joseph', 88, show).replace('--av:88px', '--av:64px')}${av('louise', 48, show)}${av('marie', 34, show)}${av('pompon', 34, show)}${av('camille', 22, show)}`;
                return `<button type="button" class="lck-choice${on ? ' is-active' : ''}" data-lck-pmode="${c.k}" aria-pressed="${on}"><div class="lck-choice-top"><span class="lck-radio"></span><b>${esc(c.t)}</b><span class="lck-tag ${c.tagc}">${c.tag}</span>${mod ? '<span class="lck-tag mod">retouché</span>' : ''}</div><div class="lck-stage">${stage}</div><ul class="lck-why-list">${c.why.map(([i, t]) => `<li><span>${i}</span><span>${t}</span></li>`).join('')}</ul></button>`;
            }).join('');
            $('#lck-p-settings').classList.toggle('is-off', off);
            $('#lck-p-off').hidden = !off;
            $('#lck-p-shape').innerHTML = SHAPES.map(([k, l, st]) => `<button type="button" class="lck-shape${S.shape === k ? ' is-active' : ''}" data-lck-shape="${k}" aria-pressed="${S.shape === k}"><i style="${st}"></i>${l}</button>`).join('');
            $('#lck-p-radius-set').classList.toggle('is-dis', S.shape !== 'arrondi'); $('#lck-p-radius').disabled = S.shape !== 'arrondi';
            syncRange('lck-p-radius', S.radius); syncRange('lck-p-init', S.init); syncRange('lck-p-bw', S.bw);
            $('#lck-p-cmode').value = S.cmode; $('#lck-p-letters').value = S.letters;
            ['m', 'f', 'u', 'a', 'one', 'bc'].forEach(k => syncColor(k, S[k]));
            box.querySelectorAll('#lck-p-colors .lck-c2').forEach(l => { const k = l.querySelector('[data-lck-color]').dataset.lckColor; l.hidden = S.cmode === 'unique' ? k !== 'one' : k === 'one'; });
            $('#lck-p-bc-slot').classList.toggle('is-dis', !S.bw);
            $('#lck-p-photo').checked = S.photo; $('#lck-p-bwphoto').checked = S.bwphoto; $('#lck-p-bwphoto-l').classList.toggle('is-dis', !S.photo); $('#lck-p-sosa').checked = S.sosa;
            $('#lck-p-prev').innerHTML = placesHtml(S, off);
        }
        const setP = patch => { P().write({...P().read(), ...patch}); renderP(); flash('p'); };
        const undoP = (msg, change) => { if (A().undoLocalChange) A().undoLocalChange(msg, [P().KEY], () => { change(); renderP(); flash('p'); }, () => { P().apply(); renderP(); }); else { change(); renderP(); flash('p'); } };
        box.addEventListener('click', e => {
            const pg = e.target.closest('[data-lck-page]');
            if (pg) { const t = pg.dataset.lckPage; try { localStorage.setItem(TAB_KEY, t); } catch (_) {} box.querySelectorAll('[data-lck-page]').forEach(b => b.classList.toggle('is-active', b === pg)); box.querySelectorAll('[data-lck-pane]').forEach(p => { p.hidden = p.dataset.lckPane !== t; }); UI().scan?.(box); return; }
            const pm = e.target.closest('[data-lck-pmode]');
            if (pm) { const k = pm.dataset.lckPmode; if (k === P().read().mode) return; const c = P_CARDS.find(x => x.k === k); undoP(`Portraits : « ${c.t} »`, () => P().write(k === 'avant' ? {...P().read(), mode: 'avant'} : {mode: k, ...P().PRESETS[k]})); return; }
            const sh = e.target.closest('[data-lck-shape]'); if (sh) { setP({shape: sh.dataset.lckShape}); return; }
            if (e.target.closest('#lck-p-reset')) { undoP('Portraits remis comme au départ', () => P().write({mode: 'avant'})); return; }
            const cm = e.target.closest('[data-lck-cmode]');
            if (cm) { const k = cm.dataset.lckCmode; if (k === read().mode) return; undoC(`Colonne de gauche : « ${k === 'avant' ? 'Comme avant' : 'Nouveau'} »`, () => write({mode: k, ...PRESETS[k]})); return; }
            const tl = e.target.closest('[data-tool]'); if (tl) { tool = tl.dataset.tool; renderC(); return; }
            if (e.target.closest('#lck-c-reset')) { undoC('Colonne de gauche remise comme au départ', () => write({mode: 'avant', ...PRESETS.avant})); }
        });
        const onRange = (id, fn) => $('#' + id).addEventListener('input', e => fn(Number(e.target.value)));
        onRange('lck-p-radius', v => setP({radius: v})); onRange('lck-p-init', v => setP({init: v})); onRange('lck-p-bw', v => setP({bw: v}));
        $('#lck-p-cmode').addEventListener('change', e => setP({cmode: e.target.value}));
        $('#lck-p-letters').addEventListener('change', e => setP({letters: e.target.value}));
        ['photo', 'bwphoto', 'sosa'].forEach(k => $(`#lck-p-${k}`).addEventListener('change', e => setP({[k]: e.target.checked})));
        $('#lck-p-dark').addEventListener('change', e => $('#lck-p-preview').classList.toggle('is-dark', e.target.checked));
        box.querySelectorAll('[data-lck-color]').forEach(i => i.addEventListener('change', e => { const v = e.target.value; if (/^#[0-9a-f]{6}$/i.test(v) && P().read()[i.dataset.lckColor] !== v.toLowerCase()) setP({[i.dataset.lckColor]: v}); }));
        /* ── colonne ── */
        function renderC() {
            const S = read();
            $('#lck-c-choices').innerHTML = C_CARDS.map(c => {
                const on = S.mode === c.k, show = on ? S : PRESETS[c.k], mod = on && CKEYS.some(k => S[k] !== PRESETS[c.k][k]);
                const mini = t => sidebarHtml({...show, size: 'compacte'}, t, 0).replace(/width:\d+px/, 'width:min(200px,100%)');
                return `<button type="button" class="lck-choice${on ? ' is-active' : ''}" data-lck-cmode="${c.k}" aria-pressed="${on}"><div class="lck-choice-top"><span class="lck-radio"></span><b>${c.t}</b><span class="lck-tag ${c.tagc}">${c.tag}</span>${mod ? '<span class="lck-tag mod">retouché</span>' : ''}</div><div class="lck-stage is-top">${mini('carte')}${mini('enq')}</div><ul class="lck-why-list">${c.why.map(([i, t]) => `<li><span>${i}</span><span>${t}</span></li>`).join('')}</ul></button>`;
            }).join('');
            $('#lck-c-nums').checked = S.nums;
            $('#lck-c-numstyle').value = S.numstyle; $('#lck-c-numstyle-set').classList.toggle('is-dis', !S.nums); $('#lck-c-numstyle').disabled = !S.nums;
            $('#lck-c-style').value = S.style; $('#lck-c-tabs').value = S.tabs; $('#lck-c-size').value = S.size; $('#lck-c-lf').value = S.lf;
            syncRange('lck-c-width', S.width);
            $('#lck-c-prev').innerHTML = `<div class="lck-colprev">${sidebarHtml(S, tool, .72)}${mainHtml(S, tool)}</div>`;
            $('#lck-c-prev-note').textContent = TOOLS[tool].list ? (S.lf === 'barre' ? '« Liste | Fiches » est dans la barre au-dessus des enquêtes.' : '« Liste | Fiches » est en bas de la colonne.') : 'Ici pas de liste : « Liste | Fiches » ne concerne que Recherche, Enquêtes et les autres listes.';
            box.querySelectorAll('#lck-c-tool [data-tool]').forEach(b => b.classList.toggle('is-active', b.dataset.tool === tool));
        }
        const setC = patch => { write({...read(), ...patch}); renderC(); flash('c'); refreshApp(); };
        const undoC = (msg, change) => { if (A().undoLocalChange) A().undoLocalChange(msg, [KEY], () => { change(); renderC(); flash('c'); refreshApp(); }, () => { apply(); renderC(); refreshApp(); }); else { change(); renderC(); flash('c'); } };
        ['style', 'numstyle', 'tabs', 'size', 'lf'].forEach(k => $(`#lck-c-${k}`).addEventListener('change', e => setC({[k]: e.target.value})));
        $('#lck-c-nums').addEventListener('change', e => setC({nums: e.target.checked}));
        $('#lck-c-width').addEventListener('change', e => setC({width: Number(e.target.value)}));
        $('#lck-c-width').addEventListener('input', e => { const S = {...read(), width: Number(e.target.value)}; $('#lck-c-prev').innerHTML = `<div class="lck-colprev">${sidebarHtml(S, tool, .72)}${mainHtml(S, tool)}</div>`; });
        box.lckRender = () => { renderP(); renderC(); };
        renderP(); renderC();
        UI().scan?.(box);
    }

    ext.designPanels = ext.designPanels || [];
    ext.designPanels.push(() => (P() ? panelHtml() : ''));
    ext.afterDesign = ext.afterDesign || [];
    ext.afterDesign.push(() => {
        const box = document.getElementById('lc-portraits-colonne'); if (!box) return;
        const form = document.getElementById('design-form');
        if (form && form.parentNode === box.parentNode) form.after(box); // juste sous le formulaire de l'Apparence
        bindPanel(box);
    });
    /** pour les « 💾 Réglages enregistrés » de l'Apparence (designs) : les deux réglages en valeurs simples */
    ext.lookFlat = () => ({k7_portraits: localStorage.getItem(P()?.KEY || 'genealogie-portraits') || '', k15_colonne: localStorage.getItem(KEY) || ''});
    ext.lookFromFlat = d => {
        if (!d || typeof d !== 'object') return;
        const take = (field, key, cl, ap) => { if (typeof d[field] !== 'string') return; if (!d[field]) { try { localStorage.removeItem(key); } catch (_) {} ap(); return; } try { localStorage.setItem(key, JSON.stringify(cl(JSON.parse(d[field])))); } catch (_) {} ap(); };
        if (P()) take('k7_portraits', P().KEY, P().clean, P().apply);
        take('k15_colonne', KEY, clean, apply);
    };
})();
