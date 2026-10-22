/**
 * 🌐 Mon site web : Listes → 🛠️ Outils de modification → « 🌐 Mon site web ».
 * Un éditeur à deux faces qui se suivent :
 *  - ✨ Visuel : l'aperçu du site (iframe sandbox « allow-scripts », origine opaque : tes scripts n'y voient que ton site,
 *    jamais l'app) ; on y clique un élément (« Ceci est : header.site-entete »), on lui donne un nom, une balise, une classe,
 *    un id, des couleurs, des marges ; on y écrit le texte (T Écrire) ; on y glisse des blocs ; ▶ Tester fait tourner tes
 *    scripts et suivre les liens ; aperçu ordinateur / tablette / téléphone ;
 *  - </> Code : HTML de la page, CSS et JS du site, avec coloration, complétion et Emmet (heritage-site-web-code.js) ;
 *    taper dans le code met l'aperçu à jour tout de suite ; un clic dans le code choisit l'élément dans l'aperçu et
 *    inversement (comme l'aperçu en direct de Phoenix Code).
 * Blocs, modèles, pont de l'aperçu : heritage-site-web-blocs.js. Base, nettoyage, blocs de la généalogie, export :
 * lib/website.php (tables websites, website_versions). Styles : assets/css/site-web.css.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const K = () => ext.siteKit;
    const CODE = () => ext.siteCode;
    const esc = v => (A()?.escapeHtml ? A().escapeHtml(v ?? '') : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const toast = (...a) => A().toast(...a);
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const plural = (n, w) => (A()?.plural ? A().plural(n, w) : `${n} ${w}${n > 1 ? 's' : ''}`);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
    const PREF_KEY = 'genealogie-site-web';
    const prefs = () => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p && typeof p === 'object' && !Array.isArray(p) ? p : {}; } catch (_) { return {}; } };
    const pref = (k, d) => { const v = prefs()[k]; return v === undefined ? d : v; };
    const setPref = (k, v) => { try { localStorage.setItem(PREF_KEY, JSON.stringify({...prefs(), [k]: v})); } catch (_) {} };
    const DEVICES = {desktop: [1280, '🖥', 'Ordinateur'], tablet: [820, '💻', 'Tablette'], phone: [390, '📱', 'Téléphone']};
    const TAG_CHOICES = ['div', 'header', 'nav', 'main', 'section', 'article', 'aside', 'footer', 'figure', 'p', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol', 'li', 'span', 'a'];
    const ROLES = [['header', 'En-tête', 'site-entete'], ['nav', 'Menu', 'site-menu'], ['main', 'Contenu principal', 'contenu'], ['section', 'Section', 'section'], ['footer', 'Pied de page', 'site-pied'], ['div', 'Carte', 'carte']];
    const NAMES = ['En-tête', 'Menu', 'Bandeau', 'Contenu principal', 'Section', 'Texte', 'Carte', 'Galerie', 'Image', 'Colonne', 'Citation', 'Contact', 'Pied de page'];
    const HELP = {select: 'Clic : choisir un élément (« Ceci est… ») · double-clic sur un texte : l’écrire · glisse un bloc depuis ＋ Blocs', text: 'Clic dans un texte pour l’écrire · Échap : fini · le code suit tout seul', play: '▶ Ton site comme un visiteur : tes scripts tournent, les liens entre pages marchent'};
    const KIND_LABEL = {menu: 'Menu (tenu à jour)', person: 'Fiche', tree: 'Arbre', timeline: 'Frise', map: 'Carte', chart: 'Chiffres', photos: 'Photos d’une personne', place: 'Gens d’un lieu'};
    const MAX_HTML = 2000000;

    const themeCss = t => { const f = x => `'${String(x || 'Georgia').replace(/'/g, '')}', Georgia, serif`; return `:root{--lc-principale:${t.primary};--lc-accent:${t.accent};--lc-fond:${t.bg};--lc-texte:${t.text};--lc-police:${f(t.font)};--lc-police-titres:${f(t.headFont)};--lc-largeur:${t.width}px;--lc-arrondi:${t.radius}px;--lc-taille:${t.size}px}`; };
    const styleMap = s => { const m = new Map(); String(s || '').split(';').forEach(d => { const i = d.indexOf(':'); if (i > 0) { const k = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim(); if (k && v) m.set(k, v); } }); return m; };
    const styleStr = m => [...m].map(([k, v]) => `${k}: ${v}`).join('; ');
    const rgbHex = c => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c || ''); if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return ''; return '#' + [m[1], m[2], m[3]].map(x => Number(x).toString(16).padStart(2, '0')).join(''); };
    const px = v => Math.round(parseFloat(v) || 0);
    const newId = () => 'p' + Math.random().toString(36).slice(2, 9);
    const slugOf = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'page';

    /** un site vide (forme attendue par lib/website.php) */
    function blankSite() {
        const k = K(); const ctx = {title: 'Mon site'};
        return {v: 1, settings: {lang: 'fr', title: 'Mon site', desc: '', tpl: 'blank', credit: true}, theme: {primary: '#7a2a2a', accent: '#c8a45c', bg: '#fbf8f3', text: '#2b2420', font: 'Georgia', headFont: 'Georgia', width: 1100, radius: 8, size: 17}, css: k.BASE_CSS, js: '',
            pages: [{id: newId(), name: 'Accueil', slug: 'index', title: '', desc: '', html: ['header', 'text', 'footer'].map(b => k.BLOCKS.find(x => x.key === b).html(ctx)).join('\n\n') + '\n'}]};
    }
    function normalizeSite(d) {
        const b = blankSite(); d = d && typeof d === 'object' ? d : {};
        const pages = Array.isArray(d.pages) && d.pages.length ? d.pages.map((p, i) => ({id: String(p.id || newId()), name: String(p.name || (i ? `Page ${i + 1}` : 'Accueil')), slug: i ? String(p.slug || slugOf(p.name)) : 'index', title: String(p.title || ''), desc: String(p.desc || ''), html: String(p.html || '')})) : b.pages;
        return {v: 1, settings: {...b.settings, ...(d.settings || {})}, theme: {...b.theme, ...(d.theme || {})}, css: typeof d.css === 'string' ? d.css : b.css, js: typeof d.js === 'string' ? d.js : '', pages};
    }

    class Editor {
        constructor(o = {}) {
            this.ctx = o; this.id = Number(o.id || 0); this.name = o.name || 'Mon site'; this.rev = o.rev || '';
            this.site = normalizeSite(o.data); this.pageIdx = 0; this.sel = null; this.mode = 'select'; this.dirty = !!o.dirty;
            this.blockCache = new Map(); this.blocksCss = ''; this.ready = false; this.codeTab = pref('codeTab', 'html');
            this.view = innerWidth < 760 ? 'visual' : pref('view', innerWidth < 900 ? 'visual' : 'split'); this.device = innerWidth < 760 ? 'phone' : pref('device', 'desktop'); this.zoom = 1; this.zoomMode = 'fit'; this.left = pref('left', 'blocks');
        }
        $(s) { return this.dlg?.querySelector(s); }
        $$(s) { return [...(this.dlg?.querySelectorAll(s) || [])]; }
        page() { return this.site.pages[this.pageIdx] || this.site.pages[0]; }
        get mediaBase() { return new URL('media/', location.href).href; }

        open() {
            const U = UI();
            const dlg = this.dlg = document.createElement('dialog');
            dlg.className = 'modal sw-dlg'; dlg.dataset.ownClose = '1'; dlg.setAttribute('data-no-foot', '');
            const top = U.editorTopbar({icon: '🌐', name: this.name, nameAttrs: 'data-sw-name', menus: [{html: '<nav data-sw-menus></nav>'}], undo: true, status: this.id && !this.dirty ? 'saved' : '',
                buttons: {export: {attrs: 'data-sw-cmd="export"', title: 'Le site entier (.zip, à mettre en ligne) ou une page seule (.html)'}, save: {attrs: 'data-sw-cmd="save"'}, full: ext.fullButton ? {attrs: 'data-full-toggle="website"', title: 'Plein écran (⛶)'} : null, close: {attrs: 'data-sw-cmd="close"'}}});
            const dev = Object.entries(DEVICES).map(([k, [w, ic, lab]]) => `<button type="button" data-sw-device="${k}" title="${esc(lab)} (${w} px)" aria-label="${esc(lab)}">${ic}</button>`).join('');
            dlg.innerHTML = `<div class="sw">${top}
                <div class="sw-main">
                    <nav class="sw-rail" data-sw-rail aria-label="Outils">
                        <button type="button" class="ed-tool" data-sw-mode="select" data-shortcut="V" title="Choisir un élément de la page" aria-label="Choisir">↖</button>
                        <button type="button" class="ed-tool" data-sw-mode="text" data-shortcut="T" title="Écrire le texte dans la page" aria-label="Écrire">T</button>
                        <button type="button" class="ed-tool" data-sw-mode="play" data-shortcut="P" title="▶ Tester : comme un visiteur (tes scripts tournent, les liens marchent)" aria-label="Tester">▶</button>
                        <button type="button" class="ed-tool" data-sw-left="blocks" data-shortcut="B" title="＋ Blocs : glisse-les dans la page" aria-label="Blocs">＋</button>
                        <button type="button" class="ed-tool" data-sw-left="pages" title="📄 Les pages du site" aria-label="Pages">📄</button>
                        <button type="button" class="ed-tool" data-sw-left="styles" title="🎨 Couleurs, polices, largeur du site" aria-label="Styles">🎨</button>
                        <button type="button" class="ed-tool" data-sw-view-toggle title="</> Montrer ou cacher le code" aria-label="Code">&lt;/&gt;</button>
                    </nav>
                    <aside class="sw-left" data-sw-leftpane aria-label="Panneau de gauche"></aside>
                    <section class="sw-center">
                        <div class="sw-bar">
                            <label class="sw-pagepick">📄 <select data-sw-page aria-label="Page"></select></label>
                            <div class="segmented sw-views" role="tablist" aria-label="Affichage">${[['visual', '✨ Visuel'], ['split', '◫ Les deux'], ['code', '</> Code']].map(([k, l]) => `<button type="button" data-sw-view="${k}">${esc(l)}</button>`).join('')}</div>
                            <div class="segmented sw-devices" role="tablist" aria-label="Taille de l’écran">${dev}</div>
                            <span class="spacer"></span>
                            <button type="button" class="button small secondary" data-sw-cmd="browser" title="Ouvrir cette page dans un onglet du navigateur, comme un visiteur (isolée de l’app)">↗ Aperçu</button>
                        </div>
                        <div class="sw-work" data-sw-work>
                            <div class="sw-stage" data-sw-stage data-ctx-off><div class="sw-sizer" data-sw-sizer><div class="sw-device" data-sw-devbox><iframe class="sw-frame" data-sw-frame title="Aperçu du site" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe></div></div></div>
                            <div class="sw-code" data-sw-code>
                                <div class="sw-codebar"><div class="segmented sw-codetabs" role="tablist" aria-label="Fichier">${[['html', 'HTML de la page'], ['css', 'CSS du site'], ['js', 'JS du site']].map(([k, l]) => `<button type="button" data-sw-tab="${k}">${esc(l)}</button>`).join('')}</div><span class="sw-codehelp" data-sw-codehelp></span></div>
                                <div class="sw-codehost" data-sw-codehost></div>
                            </div>
                        </div>
                    </section>
                    <aside class="sw-panel" data-sw-panel aria-label="Ceci est…"></aside>
                </div></div>`;
            document.body.appendChild(dlg);
            ext.fullInit?.(dlg, 'website', true);
            dlg.showModal();
            this.frame = this.$('[data-sw-frame]'); this.stage = this.$('[data-sw-stage]'); this.devbox = this.$('[data-sw-devbox]'); this.sizer = this.$('[data-sw-sizer]');
            U.editorRail?.(this.$('[data-sw-rail]'), {breaks: ['[data-sw-left="blocks"]', '[data-sw-view-toggle]']});
            this.status = U.editorStatus({where: '', help: HELP.select, zoom: {get: () => this.zoom, set: k => { this.zoomMode = 'manual'; this.setZoom(k); }, fit: () => { this.zoomMode = 'fit'; this.fit(); }, min: 0.25, max: 2}, wheel: this.stage});
            this.$('.sw').appendChild(this.status);
            U.saveMenu?.(this.$('.ui-topbar [data-sw-cmd="save"]'), () => [{icon: '⧉', label: 'Enregistrer une copie…', run: () => this.saveAs()}, {icon: '🕘', label: 'Enregistrer comme nouvelle version', run: () => this.saveVersion()}, '-', {icon: '↗', label: 'Ouvrir l’aperçu dans le navigateur', run: () => this.openBrowser()}]);
            U.editorMenus?.(this.$('[data-sw-menus]'), this.menus());
            this.code = CODE().create(this.$('[data-sw-codehost]'), {lang: this.codeTab, value: this.codeValue(), label: 'Code du site', onChange: v => this.codeChanged(v), onCursor: p => this.codeCursor(p)});
            this.hist = U.editorHistory({get: () => JSON.stringify({site: this.site, page: this.pageIdx}), set: s => { this.site = normalizeSite(s.site); this.pageIdx = clamp(s.page, 0, this.site.pages.length - 1); this.sel = null; this.afterRestore(); }, onChange: h => this.histButtons(h)});
            this.onMsg = e => this.message(e); window.addEventListener('message', this.onMsg);
            this.ro = new ResizeObserver(() => { if (this.zoomMode === 'fit') this.fit(); }); this.ro.observe(this.stage);
            if (matchMedia('(max-width: 760px)').matches) this.$('[data-sw-leftpane]').hidden = true; // téléphone : le panneau s'ouvre par la colonne d'outils
            this.bind();
            this.paintLeft(); this.paintPages(); this.paintPanel(); this.applyView(); this.applyDevice(); this.setMode('select', true);
            this.reload();
            if (!this.blocksCss) api('website_render', {blocks: '[]'}).then(r => { if (r?.css && !this.blocksCss) { this.blocksCss = r.css; this.pushCss(); } }).catch(() => {}); // les styles des blocs (menu…), même sans bloc de la généalogie
            this.hist.reset();
            if (this.dirty) U.savedStatus?.(dlg, 'dirty');
            ext.siteWeb.current = this;
            return this;
        }

        /* ── menus E1 ── */
        menus() {
            const k = K();
            return {
                Fichier: () => [{icon: '＋', label: 'Nouveau site…', run: () => chooseTemplate(this.ctx)}, {icon: '💾', label: 'Enregistrer', shortcut: '⌘S', run: () => this.save()}, {icon: '⧉', label: 'Enregistrer une copie…', run: () => this.saveAs()},
                    {icon: '🕘', label: 'Enregistrer comme nouvelle version', run: () => this.saveVersion()}, {icon: '🕘', label: 'Versions du site…', run: () => this.versions()}, '-',
                    {icon: '⤓', label: 'Exporter…', run: () => this.exportDialog()}, {icon: '↗', label: 'Ouvrir l’aperçu dans le navigateur', run: () => this.openBrowser()}, '-', {icon: '×', label: 'Fermer', run: () => this.close()}],
                Édition: () => [{icon: '↶', label: 'Annuler', shortcut: '⌘Z', disabled: !this.hist.canUndo(), run: () => this.undo()}, {icon: '↷', label: 'Rétablir', shortcut: '⇧⌘Z', disabled: !this.hist.canRedo(), run: () => this.redo()}, '-',
                    {icon: '↑', label: 'Monter l’élément', disabled: !this.sel, run: () => this.move(-1)}, {icon: '↓', label: 'Descendre l’élément', disabled: !this.sel, run: () => this.move(1)}, {icon: '⧉', label: 'Dupliquer l’élément', disabled: !this.sel, run: () => this.duplicate()},
                    {icon: '</>', label: 'Voir l’élément dans le code', disabled: !this.sel, run: () => this.revealInCode(true)}, '-', {icon: '🗑', label: 'Supprimer l’élément', danger: true, disabled: !this.sel, run: () => this.remove()}],
                Insertion: () => [...k.GROUPS.flatMap(([g, gl], gi) => [...(gi ? ['-'] : []), ...k.BLOCKS.filter(b => b.group === g).map(b => ({icon: b.icon, label: b.label, run: () => this.insertBlock(b.key)}))]), '-', {icon: '📄', label: 'Nouvelle page…', run: () => this.addPage()}],
                Affichage: () => [...[['visual', '✨ Visuel'], ['split', '◫ Visuel et code'], ['code', '</> Code']].map(([v, l]) => ({label: l, checked: this.view === v, run: () => this.setView(v)})), '-',
                    ...Object.entries(DEVICES).map(([d, [w, ic, l]]) => ({icon: ic, label: `${l} (${w} px)`, checked: this.device === d, run: () => this.setDevice(d)})), '-',
                    {icon: '⤢', label: 'Ajuster à la fenêtre', shortcut: '⌘0', run: () => { this.zoomMode = 'fit'; this.fit(); }}, {label: '100 % (taille réelle)', shortcut: '⌘1', run: () => { this.zoomMode = 'manual'; this.setZoom(1); }}, '-',
                    {icon: '⟳', label: 'Relire les blocs de la généalogie', run: () => { this.blockCache.clear(); this.reload(); }}],
            };
        }

        bind() {
            const d = this.dlg;
            d.addEventListener('cancel', e => { e.preventDefault(); this.close(); });
            d.addEventListener('click', e => {
                const b = e.target.closest('button, [data-sw-open-page]'); if (!b || !d.contains(b)) return;
                const c = b.dataset;
                if (c.uiCmd === 'undo') return this.undo();
                if (c.uiCmd === 'redo') return this.redo();
                if (c.swCmd === 'save') return this.save();
                if (c.swCmd === 'close') return this.close();
                if (c.swCmd === 'export') return this.exportDialog();
                if (c.swCmd === 'browser') return this.openBrowser();
                if (c.swMode) return this.setMode(c.swMode);
                if (c.swLeft) { const pane = this.$('[data-sw-leftpane]'); if (b.closest('.sw-rail') && this.left === c.swLeft && !pane.hidden) { pane.hidden = true; return; } this.left = c.swLeft; setPref('left', this.left); this.paintLeft(); pane.hidden = false; return; }
                if (b.matches('[data-sw-view-toggle]')) return this.setView(this.view === 'visual' ? 'split' : 'visual');
                if (c.swView) return this.setView(c.swView);
                if (c.swDevice) return this.setDevice(c.swDevice);
                if (c.swTab) return this.setCodeTab(c.swTab);
                if (c.swBlock) return this.insertBlock(c.swBlock);
                if (c.swOpenPage) return this.goPage(Number(c.swOpenPage));
                if (c.swPage) return this.pageAction(c.swPage, Number(c.swPi));
                if (c.swAct) return this.panelAction(c.swAct, b);
                if (c.swRole) return this.setRole(Number(c.swRole));
                if (c.swFont) return this.pickFont(c.swFont);
            });
            d.querySelector('[data-sw-name]').addEventListener('input', e => { this.name = e.target.value.trim() || 'Mon site'; this.changed(); });
            d.querySelector('[data-sw-page]').addEventListener('change', e => this.goPage(Number(e.target.value)));
            // ⌘S, ⌘Z, V / T / P / B (hors des cases de saisie)
            // ⌘S et ⌘Z même quand le curseur est hors de l'éditeur (après une petite fenêtre) : seulement si l'éditeur est au premier plan
            this.onDocKey = e => {
                if (!(e.metaKey || e.ctrlKey) || d.contains(e.target) || !d.open) return;
                const top = [...document.querySelectorAll('dialog[open]')].pop(); if (top !== d) return;
                const k = e.key.toLowerCase(); if (k === 's') { e.preventDefault(); e.stopPropagation(); this.save(); } else if (k === 'z' && !e.target.closest?.('input, textarea, [contenteditable]')) { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) this.redo(); else this.undo(); }
            };
            document.addEventListener('keydown', this.onDocKey, true);
            d.addEventListener('keydown', e => {
                const mod = e.metaKey || e.ctrlKey, typing = e.target.closest?.('input, textarea, select, [contenteditable]');
                if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); return this.save(); }
                if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); return e.shiftKey ? this.redo() : this.undo(); }
                if (typing || mod || e.altKey) return;
                const k = e.key.toLowerCase();
                if (k === 'v') this.setMode('select'); else if (k === 't') this.setMode('text'); else if (k === 'p') this.setMode('play'); else if (k === 'b') { this.left = 'blocks'; this.paintLeft(); }
                else if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel) { e.preventDefault(); this.remove(); }
            });
            // panneau de droite et de gauche : les champs
            d.addEventListener('input', e => this.fieldInput(e, false));
            d.addEventListener('change', e => this.fieldInput(e, true));
            // glisser un bloc depuis ＋ Blocs vers l'aperçu (le bloc est retenu ici : le cadre isolé ne reçoit que la position)
            d.addEventListener('dragstart', e => { const b = e.target.closest?.('[data-sw-block]'); if (!b) return; this.dragKey = b.dataset.swBlock; e.dataTransfer.setData('text/plain', `bloc:${this.dragKey}`); e.dataTransfer.effectAllowed = 'copy'; this.stage.classList.add('is-drop'); });
            d.addEventListener('dragend', () => { this.stage.classList.remove('is-drop'); setTimeout(() => { this.dragKey = ''; }, 200); });
            this.frame.addEventListener('load', () => { this.ready = false; });
        }

        /* ── l'aperçu ── */
        fillBlocks(html) {
            const k = K(), doc = k.parse(html), missing = [];
            doc.querySelectorAll('[data-lc-block]').forEach(el => {
                const a = k.blockAttrs(el);
                if (a.kind === 'menu') { el.innerHTML = `<ul class="lc-menu-list">${this.site.pages.map(p => `<li><a href="${esc(p.slug)}.html"${p === this.page() ? ' aria-current="page"' : ''}>${esc(p.name)}</a></li>`).join('')}</ul>`; return; }
                const key = k.blockKey(a);
                if (this.blockCache.has(key)) { el.innerHTML = this.blockCache.get(key); return; }
                el.innerHTML = '<p class="lc-note">⏳ Je remplis ce bloc avec ta généalogie…</p>'; missing.push([key, a]);
            });
            if (missing.length) this.fetchBlocks(missing);
            const base = this.mediaBase;
            return doc.body.innerHTML.replace(/(\s(?:src|href|poster)\s*=\s*["'])media\//gi, `$1${base}`).replace(/url\(\s*(["']?)media\//gi, `url($1${base}`);
        }
        async fetchBlocks(list) {
            const todo = list.filter(([key]) => !this.pending?.has(key)); if (!todo.length) return;
            this.pending = this.pending || new Set(); todo.forEach(([key]) => this.pending.add(key));
            try {
                const r = await api('website_render', {blocks: JSON.stringify(todo.map(([, a]) => a))});
                todo.forEach(([key], i) => this.blockCache.set(key, String(r.html?.[i] ?? '')));
                if (r.css) this.blocksCss = r.css;
            } catch (e) { todo.forEach(([key]) => this.blockCache.set(key, `<p class="lc-note">⚠️ Bloc impossible à remplir : ${esc(e.message)}</p>`)); }
            todo.forEach(([key]) => this.pending.delete(key));
            this.pushHtml(); this.pushCss();
        }
        cssFor() { const base = this.mediaBase; return this.site.css.replace(/url\(\s*(["']?)media\//gi, `url($1${base}`); }
        themeFull() { return `${themeCss(this.site.theme)}\n${this.blocksCss}`; }
        srcdoc() {
            const k = K(), origin = location.origin, play = this.mode === 'play';
            const csp = `default-src 'none'; img-src data: blob: https: ${origin}; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; object-src 'none'`;
            const safe = s => String(s).replace(/<\/(style|script)/gi, '<\\/$1');
            return `<!doctype html><html lang="${esc(this.site.settings.lang || 'fr')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${esc(csp)}">`
                + `<style id="lcb-theme">${safe(this.themeFull())}</style><style id="lcb-user">${safe(this.cssFor())}</style><style id="lcb-bridge">${k.BRIDGE_CSS}</style></head><body>${this.fillBlocks(this.page().html)}`
                + `<script data-lcb>${k.BRIDGE}<\/script>${play && this.site.js.trim() ? `<script data-lcb>${safe(this.site.js)}<\/script>` : ''}</body></html>`;
        }
        reload() { this.ready = false; this.frame.srcdoc = this.srcdoc(); }
        post(m) { try { this.frame.contentWindow?.postMessage(m, '*'); } catch (_) {} }
        pushHtml() { if (!this.ready || this.mode === 'play') return this.reload(); this.post({type: 'set', html: this.fillBlocks(this.page().html), sel: this.sel?.path || null, mode: this.mode}); }
        pushCss() { if (!this.ready) return; this.post({type: 'css', css: this.cssFor(), theme: this.themeFull()}); }
        message(e) {
            if (!this.frame || e.source !== this.frame.contentWindow) return; // seulement l'aperçu de cet éditeur
            const m = e.data; if (!m || typeof m !== 'object' || m.lcSite !== 1 || typeof m.type !== 'string') return;
            switch (m.type) {
                case 'ready': this.ready = true; this.post({type: 'mode', mode: this.mode}); this.pushCss(); if (this.sel?.path) this.post({type: 'select', path: this.sel.path, report: true}); return;
                case 'select': return this.selected(m.info, 'frame');
                case 'html': {
                    if (typeof m.html !== 'string' || m.html.length > MAX_HTML) return;
                    this.page().html = m.html; this.changed(); if (this.codeTab === 'html') this.code.value = m.html;
                    if (Array.isArray(m.sel)) this.post({type: 'info'});
                    return;
                }
                case 'drop': { const key = this.dragKey; this.dragKey = ''; this.stage.classList.remove('is-drop'); if (key) this.insertBlock(key, {path: Array.isArray(m.path) ? m.path.map(Number) : null, where: m.where === 'before' ? 'before' : 'after'}); return; }
                case 'goto': { const i = this.site.pages.findIndex(p => p.slug === String(m.slug || '')); if (i >= 0) this.goPage(i); return; }
                case 'external': return toast(`Ce lien mène hors du site (${String(m.href || '').slice(0, 80)}) : il marchera dans le site exporté.`);
                case 'want-text': return this.setMode('text');
                case 'key': if (m.key === 's') return this.save(); if (m.key === 'z') return m.shift ? this.redo() : this.undo(); if (m.key === 'y') return this.redo(); if (m.key === 'delete') return this.remove(); return;
            }
        }
        setMode(mode, quiet = false) {
            const was = this.mode; this.mode = mode;
            this.$$('[data-sw-mode]').forEach(b => b.classList.toggle('is-active', b.dataset.swMode === mode));
            this.status?.setHelp?.(HELP[mode]);
            if (quiet) return;
            if (mode === 'play' || was === 'play') return this.reload(); // tes scripts : seulement en ▶ Tester, sur une page fraîche
            this.post({type: 'mode', mode});
        }

        /* ── la mise en page de l'éditeur ── */
        setView(v) { this.view = v; setPref('view', v); this.applyView(); }
        applyView() {
            this.$('[data-sw-work]').dataset.view = this.view;
            this.$$('[data-sw-view]').forEach(b => b.classList.toggle('is-active', b.dataset.swView === this.view));
            this.$('[data-sw-view-toggle]')?.classList.toggle('is-active', this.view !== 'visual');
            this.setCodeTab(this.codeTab, true);
            setTimeout(() => { if (this.zoomMode === 'fit') this.fit(); }, 30);
        }
        setDevice(d) { if (!DEVICES[d]) return; this.device = d; setPref('device', d); this.applyDevice(); }
        applyDevice() {
            this.$$('[data-sw-device]').forEach(b => b.classList.toggle('is-active', b.dataset.swDevice === this.device));
            this.devbox.dataset.device = this.device; this.devbox.style.width = `${DEVICES[this.device][0]}px`;
            this.zoomMode = 'fit'; this.fit(); this.whereText();
        }
        fit() { const w = DEVICES[this.device][0], avail = Math.max(200, (this.stage?.clientWidth || w) - 32); this.setZoom(Math.min(1, avail / w)); }
        setZoom(k) {
            this.zoom = clamp(k, 0.25, 2);
            const w = DEVICES[this.device][0], h = Math.max(300, ((this.stage?.clientHeight || 600) - 32) / this.zoom);
            this.devbox.style.height = `${h}px`; this.devbox.style.transform = `scale(${this.zoom})`;
            this.sizer.style.width = `${w * this.zoom}px`; this.sizer.style.height = `${h * this.zoom}px`;
            this.status?.sync?.();
        }
        whereText() { const s = this.sel; this.status?.setWhere?.(`${this.page().name} · ${DEVICES[this.device][2]}${s ? ` · ${this.label(s)}` : ''}`); }
        label(s) { return `${s.tag}${s.id ? '#' + s.id : ''}${s.cls ? '.' + s.cls.split(/\s+/).slice(0, 3).join('.') : ''}`; }

        /* ── le panneau de gauche : blocs, pages, styles ── */
        paintLeft() {
            const pane = this.$('[data-sw-leftpane]'), k = K(), t = this.site.theme, s = this.site.settings;
            this.$$('[data-sw-left]').forEach(b => b.classList.toggle('is-active', b.dataset.swLeft === this.left));
            const tabs = `<div class="segmented sw-lefttabs" role="tablist">${[['blocks', '＋ Blocs'], ['pages', '📄 Pages'], ['styles', '🎨 Styles']].map(([v, l]) => `<button type="button" data-sw-left="${v}" class="${v === this.left ? 'is-active' : ''}">${esc(l)}</button>`).join('')}</div>`;
            if (this.left === 'blocks') {
                pane.innerHTML = tabs + `<p class="sw-hint">Glisse un bloc dans l’aperçu, ou clique pour l’ajouter après l’élément choisi.</p>` + k.GROUPS.map(([g, gl]) => `<h4>${esc(gl)}</h4><div class="sw-blocks">${k.BLOCKS.filter(b => b.group === g).map(b => `<button type="button" class="sw-block" draggable="true" data-sw-block="${b.key}" title="${esc(b.hint)}"><span aria-hidden="true">${b.icon}</span>${esc(b.label)}</button>`).join('')}</div>`).join('')
                    + '<p class="sw-hint">Les blocs « Ma généalogie » sont remplis par l’app et figés à l’export : jamais de personne vivante ni de fiche confidentielle.</p>';
            } else if (this.left === 'pages') {
                const p = this.page();
                pane.innerHTML = tabs + `<div class="sw-pages">${this.site.pages.map((x, i) => `<div class="sw-pagerow${i === this.pageIdx ? ' is-active' : ''}"><button type="button" class="sw-pagename" data-sw-open-page="${i}"><b>${esc(x.name)}</b><small>${esc(i ? `${x.slug}.html` : 'index.html')}</small></button>
                    <span class="sw-pageacts"><button type="button" class="icon-button small" data-sw-page="up" data-sw-pi="${i}" title="Monter" aria-label="Monter" ${i <= 1 ? 'disabled' : ''}>↑</button><button type="button" class="icon-button small" data-sw-page="down" data-sw-pi="${i}" title="Descendre" aria-label="Descendre" ${!i || i === this.site.pages.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="icon-button small" data-sw-page="rename" data-sw-pi="${i}" title="Renommer" aria-label="Renommer">✎</button><button type="button" class="icon-button small" data-sw-page="dup" data-sw-pi="${i}" title="Dupliquer" aria-label="Dupliquer">⧉</button>${i ? `<button type="button" class="icon-button small" data-sw-page="del" data-sw-pi="${i}" title="Supprimer la page" aria-label="Supprimer la page">🗑</button>` : ''}</span></div>`).join('')}</div>
                    <button type="button" class="button small" data-sw-page="add" data-sw-pi="0">＋ Nouvelle page</button>
                    <h4>Cette page : « ${esc(p.name)} »</h4><div class="form-grid one-column sw-form">
                    <label>Titre dans l’onglet du navigateur<input type="text" data-sw-pf="title" maxlength="160" value="${esc(p.title)}" placeholder="${esc(p.name)}"></label>
                    <label>Description (pour les moteurs de recherche)<textarea data-sw-pf="desc" rows="2" maxlength="300">${esc(p.desc)}</textarea></label>
                    ${this.pageIdx ? `<label>Adresse<input type="text" data-sw-pf="slug" maxlength="60" value="${esc(p.slug)}" pattern="[a-z0-9-]+"></label>` : ''}</div>`;
            } else {
                const col = (k2, l) => `<label class="sw-color">${esc(l)}<input type="color" data-sw-th="${k2}" value="${esc(t[k2])}"></label>`;
                const range = (k2, l, a, b, unit, def) => `<label class="sw-range">${esc(l)}<input type="range" min="${a}" max="${b}" step="1" value="${Number(t[k2])}" data-sw-th="${k2}" data-unit="${unit}" data-default="${def}"></label>`;
                pane.innerHTML = tabs + `<p class="sw-hint">Ces réglages remplissent les variables <code>--lc-…</code> de ta feuille de styles (onglet CSS).</p>
                    <h4>Couleurs</h4><div class="sw-colors">${col('primary', 'Principale')}${col('accent', 'Accent')}${col('bg', 'Fond')}${col('text', 'Texte')}</div>
                    <h4>Polices</h4><div class="sw-fonts"><button type="button" class="button small secondary" data-sw-font="font" style="font-family:'${esc(t.font)}'">Aa · ${esc(t.font)}</button><small>texte</small><button type="button" class="button small secondary" data-sw-font="headFont" style="font-family:'${esc(t.headFont)}'">Aa · ${esc(t.headFont)}</button><small>titres</small></div>
                    <h4>Mesures</h4>${range('size', 'Taille du texte', 11, 28, 'px', 17)}${range('width', 'Largeur du contenu', 480, 2000, 'px', 1100)}${range('radius', 'Arrondi des coins', 0, 40, 'px', 8)}
                    <h4>Le site</h4><div class="form-grid one-column sw-form"><label>Nom du site<input type="text" data-sw-sf="title" maxlength="120" value="${esc(s.title)}"></label>
                    <label>Description<textarea data-sw-sf="desc" rows="2" maxlength="300">${esc(s.desc)}</textarea></label>
                    <label>Langue<select data-sw-sf="lang">${[['fr', 'Français'], ['en', 'Anglais'], ['de', 'Allemand'], ['es', 'Espagnol'], ['it', 'Italien'], ['oc', 'Occitan'], ['br', 'Breton']].map(([v, l]) => `<option value="${v}"${s.lang === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>`;
            }
            UI()?.scan?.(pane);
        }
        paintPages() {
            const sel = this.$('[data-sw-page]'); sel.innerHTML = this.site.pages.map((p, i) => `<option value="${i}"${i === this.pageIdx ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
            if (this.left === 'pages') this.paintLeft();
        }
        goPage(i) { if (i < 0 || i >= this.site.pages.length) return; this.pageIdx = i; this.sel = null; this.paintPages(); this.paintPanel(); if (this.codeTab === 'html') this.code.value = this.page().html; this.reload(); this.whereText(); }
        async pageAction(act, i) {
            const pages = this.site.pages, p = pages[i];
            if (act === 'add') return this.addPage();
            if (act === 'rename') { const n = await A().askText({title: '✎ Renommer la page', message: 'Le nom de la page (il apparaît dans le menu) :', value: p.name, okLabel: 'Enregistrer'}); if (!n?.trim()) return; p.name = n.trim().slice(0, 80); if (i) p.slug = this.uniqueSlug(slugOf(p.name), i); this.changed(true); this.paintPages(); return this.pushHtml(); }
            if (act === 'up' || act === 'down') { const j = act === 'up' ? i - 1 : i + 1; if (j < 1 || j >= pages.length || i < 1) return; [pages[i], pages[j]] = [pages[j], pages[i]]; if (this.pageIdx === i) this.pageIdx = j; else if (this.pageIdx === j) this.pageIdx = i; this.changed(true); this.paintPages(); return this.pushHtml(); }
            if (act === 'dup') { const c = {...p, id: newId(), name: `${p.name} (copie)`}; c.slug = this.uniqueSlug(slugOf(c.name), -1); pages.splice(i + 1, 0, c); this.changed(true); return this.goPage(i + 1); }
            if (act === 'del' && i > 0) {
                const gone = pages.splice(i, 1)[0]; if (this.pageIdx >= pages.length) this.pageIdx = pages.length - 1; else if (this.pageIdx === i) this.pageIdx = Math.max(0, i - 1);
                this.changed(true); this.goPage(this.pageIdx);
                A().undoToast?.(`Page « ${gone.name} » supprimée`, {undo: () => { pages.splice(i, 0, gone); this.changed(true); this.goPage(i); }});
            }
        }
        uniqueSlug(s, self) { let out = s === 'index' ? 'page' : s, k = 2; while (this.site.pages.some((p, j) => j !== self && p.slug === out)) out = `${s}-${k++}`; return out; }
        async addPage() {
            const n = await A().askText({title: '📄 Nouvelle page', message: 'Le nom de la page (il apparaît dans le menu) :', value: '', okLabel: 'Créer la page'}); if (!n?.trim()) return;
            const name = n.trim().slice(0, 80), k = K(), doc = k.parse(this.page().html);
            const head = doc.body.querySelector(':scope > header')?.outerHTML || k.BLOCKS.find(b => b.key === 'header').html({title: this.site.settings.title});
            const foot = [...doc.body.querySelectorAll(':scope > footer')].pop()?.outerHTML || k.BLOCKS.find(b => b.key === 'footer').html({title: this.site.settings.title});
            const text = k.BLOCKS.find(b => b.key === 'text').html({}).replace('Un titre', esc(name));
            this.site.pages.push({id: newId(), name, slug: this.uniqueSlug(slugOf(name), -1), title: '', desc: '', html: `${head}\n\n${text}\n\n${foot}\n`});
            this.changed(true); this.goPage(this.site.pages.length - 1);
            toast(`Page « ${name} » créée : elle est dans le menu de toutes les pages.`);
        }
        async pickFont(key) {
            const f = await UI()?.openFontPicker?.({value: this.site.theme[key], sample: this.site.settings.title || 'Mon site'}); if (!f) return;
            this.site.theme[key] = String(f).replace(/[^\p{L}\p{N} \-'.,]/gu, '').slice(0, 80); this.changed(true); this.pushCss(); this.paintLeft();
        }

        /* ── les champs (panneaux de gauche et de droite) ── */
        fieldInput(e, final) {
            const t = e.target; if (!this.dlg.contains(t)) return;
            if (t.dataset.swTh) { const k2 = t.dataset.swTh; this.site.theme[k2] = t.type === 'range' ? Number(t.value) : t.value; this.changed(final); this.pushCss(); return; }
            if (t.dataset.swSf) { this.site.settings[t.dataset.swSf] = t.value; this.changed(final); if (t.dataset.swSf === 'lang' && final) this.reload(); return; }
            if (t.dataset.swPf) { const p = this.page(); if (t.dataset.swPf === 'slug') { if (!final) return; p.slug = this.uniqueSlug(slugOf(t.value), this.pageIdx); t.value = p.slug; this.pushHtml(); } else p[t.dataset.swPf] = t.value; this.changed(final); return; }
            if (t.dataset.swSt && this.sel) return this.setStyle(t.dataset.swSt, t, final);
            if (t.dataset.swAt && this.sel && final) return this.setAttr(t.dataset.swAt, t.value);
            if (t.dataset.swBa && this.sel && final) return this.setBlockAttr(t.dataset.swBa, t.value);
        }

        /* ── la page comme DOM (DOMParser : rien ne s'exécute) ── */
        mutate(fn, {push = true} = {}) {
            const k = K(), p = this.page(), doc = k.parse(p.html), el = this.sel?.path ? k.elByPath(doc, this.sel.path) : null;
            const r = fn(doc, el); if (r === false) return false;
            p.html = doc.body.innerHTML; this.changed(true);
            if (this.codeTab === 'html') this.code.value = p.html;
            if (push) this.pushHtml();
            return r;
        }
        setStyle(prop, input, final) {
            const unit = input.dataset.unit || '', raw = input.type === 'checkbox' ? (input.checked ? input.value : '') : input.value;
            const val = raw === '' || (unit && Number(raw) === 0 && input.dataset.zeroOff) ? '' : `${raw}${unit && /^-?[\d.]+$/.test(raw) ? unit : ''}`;
            let style = '';
            this.mutate((doc, el) => { if (!el) return false; const m = styleMap(el.getAttribute('style')); if (val) m.set(prop, val); else m.delete(prop); style = styleStr(m); if (style) el.setAttribute('style', style); else el.removeAttribute('style'); }, {push: false});
            this.sel.style = style;
            this.post({type: 'attr', path: this.sel.path, name: 'style', value: style || null});
            if (final) { this.hist.commit(); this.post({type: 'info'}); }
        }
        setAttr(name, value) {
            if (!/^(id|class|data-lc-name|alt|href|src|title)$/.test(name)) return;
            value = String(value || '').trim();
            if (name === 'id') value = value.replace(/[^\w-]/g, '-').replace(/^-+/, '');
            if (name === 'class') value = value.split(/\s+/).map(c => c.replace(/[^\w-]/g, '')).filter(Boolean).join(' ');
            if ((name === 'href' || name === 'src') && /^\s*(javascript|vbscript|data):/i.test(value) && !/^data:image\/(png|jpe?g|gif|webp);/i.test(value)) return toast('Cette adresse n’est pas permise (javascript:, data:…).', 'error');
            this.mutate((doc, el) => { if (!el) return false; if (value) el.setAttribute(name, value); else el.removeAttribute(name); });
            this.sel = {...this.sel, [{class: 'cls', 'data-lc-name': 'name'}[name] || name]: value}; this.paintPanel(); this.whereText();
            this.hist.commit(); setTimeout(() => this.revealInCode(false), 30);
        }
        setBlockAttr(name, value) {
            if (!/^[a-z][a-z0-9-]*$/.test(name)) return;
            this.mutate((doc, el) => { if (!el || !el.hasAttribute('data-lc-block')) return false; el.setAttribute(`data-${name}`, String(value).slice(0, 80)); });
            this.hist.commit(); this.post({type: 'info'});
        }
        setTag(tag) {
            if (!K().parse('').createElement(tag) || !/^[a-z][a-z0-9]*$/.test(tag)) return;
            const path = this.sel.path;
            this.mutate((doc, el) => { if (!el || el.tagName.toLowerCase() === tag) return false; const n = doc.createElement(tag); [...el.attributes].forEach(a => n.setAttribute(a.name, a.value)); n.append(...el.childNodes); el.replaceWith(n); });
            this.sel = {...this.sel, tag, path}; this.hist.commit(); this.paintPanel(); this.whereText();
        }
        setRole(i) {
            const [tag, name, cls] = ROLES[i] || []; if (!tag) return;
            const path = this.sel.path;
            this.mutate((doc, el) => {
                if (!el) return false;
                let n = el;
                if (el.tagName.toLowerCase() !== tag) { n = doc.createElement(tag); [...el.attributes].forEach(a => n.setAttribute(a.name, a.value)); n.append(...el.childNodes); el.replaceWith(n); }
                n.setAttribute('data-lc-name', name);
                if (!(n.getAttribute('class') || '').trim()) n.setAttribute('class', cls);
            });
            this.sel = {...this.sel, tag, name, path}; this.post({type: 'select', path, report: true}); this.hist.commit();
            toast(`C’est ton ${name.toLowerCase()} : <${tag}>${this.sel.cls ? '' : ` class="${cls}"`}, nommé « ${name} ».`);
        }
        move(dir) {
            if (!this.sel) return; let np = null;
            this.mutate((doc, el) => { if (!el) return false; const sib = dir < 0 ? el.previousElementSibling : el.nextElementSibling; if (!sib) return false; if (dir < 0) sib.before(el); else sib.after(el); np = K().pathOf(el); });
            if (np) { this.sel.path = np; this.post({type: 'select', path: np}); this.hist.commit(); }
        }
        duplicate() {
            if (!this.sel) return; let np = null;
            this.mutate((doc, el) => { if (!el) return false; const c = el.cloneNode(true); if (c.id) c.id = `${c.id}-2`; el.after(doc.createTextNode('\n'), c); np = K().pathOf(c); });
            if (np) { this.sel.path = np; this.post({type: 'select', path: np, report: true}); this.hist.commit(); }
        }
        remove() {
            if (!this.sel) return; const what = this.sel.name || this.label(this.sel); const before = this.page().html, pi = this.pageIdx;
            this.mutate((doc, el) => { if (!el) return false; el.remove(); });
            this.sel = null; this.paintPanel(); this.whereText(); this.hist.commit();
            A().undoToast?.(`« ${what} » retiré de la page`, {undo: () => { this.site.pages[pi].html = before; this.goPage(pi); this.changed(true); this.hist.commit(); }});
        }
        async insertBlock(key, at = null) {
            const k = K(), b = k.BLOCKS.find(x => x.key === key); if (!b) return;
            let o = {};
            if (b.ask) { try { o = await b.ask(); } catch (e) { return toast(e.message, 'error'); } if (!o) return; }
            if (matchMedia('(max-width: 760px)').matches) this.$('[data-sw-leftpane]').hidden = true;
            const html = b.html({title: this.site.settings.title}, o);
            const r = k.insertHtml(this.page().html, html, at || {path: this.sel?.path || null, where: 'after'});
            this.page().html = r.html; this.changed(true);
            if (this.codeTab === 'html') this.code.value = this.page().html;
            this.sel = r.path ? {path: r.path, tag: '', cls: '', id: '', name: b.label} : null;
            this.pushHtml(); this.hist.commit();
            if (r.path) setTimeout(() => this.post({type: 'select', path: r.path, report: true}), 120);
        }

        /* ── le panneau de droite : « Ceci est… » ── */
        selected(info, from) {
            if (!info || typeof info !== 'object' || !Array.isArray(info.path)) return;
            const s = v => String(v ?? '').slice(0, 400);
            this.sel = {path: info.path.map(Number).filter(n => Number.isInteger(n) && n >= 0).slice(0, 60), tag: s(info.tag).toLowerCase().replace(/[^a-z0-9-]/g, ''), id: s(info.id), cls: s(info.cls), name: s(info.name), block: s(info.block), text: s(info.text), src: s(info.src), href: s(info.href), alt: s(info.alt), style: s(info.style), cs: info.cs && typeof info.cs === 'object' ? Object.fromEntries(Object.entries(info.cs).map(([k2, v]) => [k2, s(v)])) : {}};
            if (this.sel.block) { const doc = K().parse(this.page().html), el = K().elByPath(doc, this.sel.path); this.sel.battrs = el ? K().blockAttrs(el) : {}; }
            this.paintPanel(); this.whereText();
            if (from === 'frame') this.revealInCode(false);
        }
        paintPanel() {
            const pane = this.$('[data-sw-panel]'), U = UI(), s = this.sel;
            if (!s) {
                pane.innerHTML = `<div class="sw-this is-none"><b>Ceci est…</b></div>${A().empty('Clique sur un élément de l’aperçu (ou dans le code) : il dira ce qu’il est, par exemple « header.site-entete ». Tu pourras lui donner un nom, une classe, un id, des couleurs.', {icon: '↖'})}
                    <div class="sw-tips"><h4>Astuces</h4><ul><li><b>T Écrire</b> : clique dans un texte pour le changer, le code suit tout seul.</li><li>Dans le code, <kbd>Tab</kbd> déplie une abréviation : <code>ul&gt;li*3</code>, <code>div.carte&gt;h2+p</code>, <code>m10</code>.</li><li><b>▶ Tester</b> fait tourner tes scripts (JS) dans l’aperçu isolé.</li></ul></div>`;
                return;
            }
            const st = styleMap(s.style), cs = s.cs || {};
            const range = (prop, label, min, max, cur, def = 0) => `<label class="sw-range">${esc(label)}<input type="range" min="${min}" max="${max}" step="1" value="${clamp(cur, min, max)}" data-sw-st="${prop}" data-unit="px" data-default="${def}"></label>`;
            const color = (prop, label, cur) => `<label class="sw-color">${esc(label)}<input type="color" data-sw-st="${prop}" value="${esc(rgbHex(st.get(prop) || '') || rgbHex(cur) || '#ffffff')}"></label>`;
            const blockOpts = () => {
                if (!s.block) return '';
                const a = s.battrs || {}, opts = [];
                if (s.block === 'menu') opts.push('<p class="sw-hint">Le menu se fait tout seul avec les pages du site (📄 Pages).</p>');
                if (['person', 'tree', 'timeline', 'map', 'photos'].includes(s.block)) opts.push(`<label>Personne<span class="sw-pick">${esc(a.person ? (s.name || '').replace(/^(Arbre|Fiche|Frise|Carte|Photos) de /, '') || `n° ${a.person}` : '—')} <button type="button" class="button small secondary" data-sw-act="block-person">Changer…</button></span></label>`);
                if (s.block === 'tree') opts.push(`<label>Générations<select data-sw-ba="gens">${[2, 3, 4, 5].map(n => `<option${Number(a.gens) === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`);
                if (s.block === 'map') opts.push(`<label>Lieux de<select data-sw-ba="scope"><option value="person"${a.scope !== 'ancestors' ? ' selected' : ''}>la personne seule</option><option value="ancestors"${a.scope === 'ancestors' ? ' selected' : ''}>la personne et ses ancêtres</option></select></label>`);
                if (s.block === 'chart') opts.push(`<label>Chiffres<select data-sw-ba="chart"><option value="naissances"${a.chart !== 'prenoms' ? ' selected' : ''}>Naissances par décennie</option><option value="prenoms"${a.chart === 'prenoms' ? ' selected' : ''}>Prénoms les plus portés</option></select></label>`);
                if (s.block === 'photos') opts.push(`<label>Au plus<select data-sw-ba="max">${[6, 12, 24, 48].map(n => `<option${Number(a.max) === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`);
                if (s.block === 'place') opts.push(`<label>Lieu<span class="sw-pick">${esc(a.place ? (s.name || '').replace(/^Gens de /, '') || `n° ${a.place}` : '—')} <button type="button" class="button small secondary" data-sw-act="block-place">Changer…</button></span></label>`);
                return U.panelSection({title: `🌳 Bloc de la généalogie : ${KIND_LABEL[s.block] || s.block}`, key: 'sw-block', open: true, body: `<div class="form-grid one-column sw-form">${opts.join('')}</div><p class="sw-hint">Rempli avec ta base, figé à l’export, sans personne vivante ni fiche confidentielle.</p>`});
            };
            const content = s.tag === 'img' ? U.panelSection({title: 'Image', key: 'sw-img', open: true, body: `<div class="form-grid one-column sw-form"><button type="button" class="button small secondary" data-sw-act="image">🖼 Changer l’image…</button><label>Texte de remplacement (pour qui ne voit pas l’image)<input type="text" data-sw-at="alt" value="${esc(s.alt)}" maxlength="200"></label></div>`})
                : s.tag === 'a' ? U.panelSection({title: 'Lien', key: 'sw-link', open: true, body: `<div class="form-grid one-column sw-form"><label>Adresse<input type="text" data-sw-at="href" value="${esc(s.href)}" placeholder="page.html, https://…, mailto:…" maxlength="300"></label><div class="sw-chips">${this.site.pages.map(p => `<button type="button" class="sw-chip" data-sw-act="link" data-v="${esc(p.slug)}.html">📄 ${esc(p.name)}</button>`).join('')}</div></div>`}) : '';
            pane.innerHTML = `<div class="sw-this"><small>Ceci est</small><b>${esc(s.name || (s.block ? KIND_LABEL[s.block] : '') || s.tag)}</b><code>${esc(this.label(s))}</code>${s.text ? `<span class="sw-this-txt">« ${esc(s.text.slice(0, 70))}${s.text.length > 70 ? '…' : ''} »</span>` : ''}</div>
                <div class="sw-acts"><button type="button" class="icon-button small" data-sw-act="up" title="Monter" aria-label="Monter">↑</button><button type="button" class="icon-button small" data-sw-act="down" title="Descendre" aria-label="Descendre">↓</button><button type="button" class="icon-button small" data-sw-act="dup" title="Dupliquer" aria-label="Dupliquer">⧉</button><button type="button" class="icon-button small" data-sw-act="code" title="Voir dans le code" aria-label="Voir dans le code">&lt;/&gt;</button><button type="button" class="icon-button small" data-sw-act="parent" title="Choisir l’élément qui le contient" aria-label="Choisir le parent">⤴</button><span class="spacer"></span><button type="button" class="icon-button small danger" data-sw-act="del" title="Supprimer l’élément" aria-label="Supprimer l’élément">🗑</button></div>
                ${U.panelSection({title: 'Ceci est… (nom, balise, classe, id)', key: 'sw-what', open: true, body: `<p class="sw-hint">Dis ce que c’est : « c’est mon en-tête, mon menu… »</p><div class="sw-chips">${ROLES.map(([tag, name], i) => `<button type="button" class="sw-chip${s.tag === tag && s.name === name ? ' is-active' : ''}" data-sw-role="${i}" title="&lt;${tag}&gt;, nommé « ${esc(name)} »">${esc(name)}</button>`).join('')}</div>
                    <div class="form-grid one-column sw-form"><label>Nom (pour toi)<input type="text" list="sw-names" data-sw-at="data-lc-name" value="${esc(s.name)}" maxlength="60" placeholder="En-tête, carte de la famille…"></label><datalist id="sw-names">${NAMES.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
                    <label>Balise<select data-sw-tag>${[...new Set([s.tag, ...TAG_CHOICES])].filter(Boolean).map(t => `<option value="${esc(t)}"${t === s.tag ? ' selected' : ''}>&lt;${esc(t)}&gt;</option>`).join('')}</select></label>
                    <label>Classe(s)<input type="text" data-sw-at="class" value="${esc(s.cls)}" maxlength="200" placeholder="carte-famille" spellcheck="false"></label>
                    <label>id<input type="text" data-sw-at="id" value="${esc(s.id)}" maxlength="60" placeholder="haut-de-page" spellcheck="false"></label></div>`})}
                ${blockOpts()}${content}
                ${U.panelSection({title: 'Position et taille', key: 'sw-pos', open: false, body: range('margin-top', 'Marge en haut', 0, 160, px(cs.mt)) + range('margin-bottom', 'Marge en bas', 0, 160, px(cs.mb)) + range('padding', 'Espace intérieur', 0, 120, px(cs.pt)) + range('max-width', 'Largeur au plus (0 = toute)', 0, 1600, px(st.get('max-width') || 0)) + range('border-radius', 'Arrondi', 0, 60, px(cs.radius))})}
                ${U.panelSection({title: 'Couleur', key: 'sw-color', open: false, body: `<div class="sw-colors">${color('color', 'Texte', cs.color)}${color('background-color', 'Fond', cs.bg)}</div><button type="button" class="button small secondary" data-sw-act="nobg">Sans fond</button>`})}
                ${U.panelSection({title: 'Texte', key: 'sw-text', open: false, body: `<div class="sw-fonts"><button type="button" class="button small secondary" data-sw-act="font">Aa · ${esc((st.get('font-family') || cs.font || '').split(',')[0].replace(/["']/g, '') || 'Police')}</button></div>${range('font-size', 'Taille', 10, 96, px(cs.size), 17)}
                    <div class="segmented sw-align">${[['left', '⟸ Gauche'], ['center', '≡ Centré'], ['right', 'Droite ⟹']].map(([v, l]) => `<button type="button" data-sw-act="align" data-v="${v}" class="${(st.get('text-align') || cs.align) === v ? 'is-active' : ''}">${l}</button>`).join('')}</div>
                    <label class="ui-toggle"><input type="checkbox" data-sw-st="font-weight" value="bold"${/^(bold|700|800|900)$/.test(st.get('font-weight') || '') ? ' checked' : ''}><i></i>Gras</label>`})}`;
            pane.querySelector('[data-sw-tag]')?.addEventListener('change', e => this.setTag(e.target.value));
            pane.querySelectorAll('input[type=range][data-sw-st="max-width"]').forEach(r => { r.dataset.zeroOff = '1'; });
            U.scan?.(pane);
        }
        async panelAction(act, b) {
            const s = this.sel; if (!s) return;
            if (act === 'up') return this.move(-1); if (act === 'down') return this.move(1); if (act === 'dup') return this.duplicate(); if (act === 'del') return this.remove();
            if (act === 'code') return this.revealInCode(true);
            if (act === 'parent') { if (s.path.length > 1) this.post({type: 'select', path: s.path.slice(0, -1), report: true}); return; }
            if (act === 'nobg') { const m = styleMap(s.style); m.delete('background-color'); m.delete('background'); return this.setAttrStyle(styleStr(m)); }
            if (act === 'align') { const m = styleMap(s.style); m.set('text-align', b.dataset.v); this.setAttrStyle(styleStr(m)); return this.paintPanel(); }
            if (act === 'link') return this.setAttr('href', b.dataset.v);
            if (act === 'font') { const f = await UI()?.openFontPicker?.({value: (s.cs?.font || '').split(',')[0].replace(/["']/g, ''), sample: s.text?.slice(0, 30) || 'Mon site'}); if (!f) return; const m = styleMap(s.style); m.set('font-family', `'${String(f).replace(/[^\p{L}\p{N} \-.]/gu, '')}', sans-serif`); this.setAttrStyle(styleStr(m)); return this.post({type: 'info'}); }
            if (act === 'image') { const l = await K().pickImages(false, 'Une autre image'); if (!l?.[0]) return; this.setAttr('src', K().mediaSrc(l[0])); if (!s.alt) this.setAttr('alt', l[0].title || ''); return; }
            if (act === 'block-person') { const p = await K().pickPerson('Quelle personne ?'); if (!p) return; this.setBlockAttr('person', String(p.id)); const w = {tree: 'Arbre', person: 'Fiche', timeline: 'Frise', map: 'Carte', photos: 'Photos'}[s.block]; if (w && p.name) this.setAttr('data-lc-name', `${w} de ${p.name}`); return; }
            if (act === 'block-place') { const p = await K().pickPlace('Quel lieu ?'); if (!p) return; this.setBlockAttr('place', String(p.id)); if (p.name) this.setAttr('data-lc-name', `Gens de ${p.name}`); }
        }
        setAttrStyle(style) {
            this.mutate((doc, el) => { if (!el) return false; if (style) el.setAttribute('style', style); else el.removeAttribute('style'); }, {push: false});
            this.sel.style = style; this.post({type: 'attr', path: this.sel.path, name: 'style', value: style || null}); this.hist.commit();
        }

        /* ── le code ── */
        codeValue() { return this.codeTab === 'css' ? this.site.css : this.codeTab === 'js' ? this.site.js : this.page().html; }
        setCodeTab(tab, quiet = false) {
            if (!['html', 'css', 'js'].includes(tab)) tab = 'html';
            this.codeTab = tab; setPref('codeTab', tab);
            this.$$('[data-sw-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.swTab === tab));
            if (!this.code) return;
            this.code.setLang(tab); this.code.value = this.codeValue();
            const help = {html: `HTML de « ${this.page().name} » · Tab : Emmet (ul>li*3) · les blocs data-lc-block sont remplis tout seuls`, css: 'CSS de tout le site · Tab : m10 → margin: 10px; · les couleurs de 🎨 : var(--lc-principale)…', js: 'JS de tout le site · il tourne seulement en ▶ Tester, dans l’aperçu isolé, et dans le site exporté'};
            this.$('[data-sw-codehelp]').textContent = help[tab];
            if (!quiet) this.code.focus();
        }
        codeChanged(v) {
            if (this.codeTab === 'html') { if (v.length > MAX_HTML) return; this.page().html = v; clearTimeout(this.codeT); this.codeT = setTimeout(() => { this.checkSel(); this.pushHtml(); }, 220); }
            else if (this.codeTab === 'css') { this.site.css = v; clearTimeout(this.codeT); this.codeT = setTimeout(() => this.pushCss(), 120); }
            else { this.site.js = v; if (this.mode === 'play') { clearTimeout(this.codeT); this.codeT = setTimeout(() => this.reload(), 900); } }
            this.changed();
        }
        /** après un changement du code, l'élément choisi est-il toujours au même endroit ? sinon on ne choisit plus rien */
        checkSel() {
            if (!this.sel?.path) return;
            const el = K().elByPath(K().parse(this.page().html), this.sel.path);
            if (!el || el.tagName.toLowerCase() !== this.sel.tag || (el.getAttribute('class') || '').trim() !== (this.sel.cls || '').trim()) { this.sel = null; this.paintPanel(); this.whereText(); this.code.mark(null); }
        }
        /** un clic dans le HTML : l'élément qui est là devient l'élément choisi de l'aperçu */
        codeCursor(pos) {
            if (this.codeTab !== 'html') return;
            const text = this.code.value; let at = pos;
            const before = text.slice(0, pos), lt = before.lastIndexOf('<'), gt = before.lastIndexOf('>');
            if (lt > gt) { if (text[lt + 1] === '/' || text[lt + 1] === '!') at = lt; else { const e = text.indexOf('>', pos); at = e < 0 ? lt : e + 1; } }
            const doc = K().parse(text.slice(0, at) + '<!--lcb-caret-->' + text.slice(at));
            const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT); let c = null; while (w.nextNode()) { if (w.currentNode.data === 'lcb-caret') { c = w.currentNode; break; } }
            let el = c?.parentElement; if (!el || el.tagName === 'BODY') return;
            el = el.closest('[data-lc-block]') || el;
            this.post({type: 'select', path: K().pathOf(el), report: true});
        }
        /** l'élément choisi, dans le code : sa balise d'ouverture est surlignée */
        revealInCode(force) {
            if (!this.sel?.path) return;
            if (force && this.view === 'visual') this.setView('split');
            if (this.view === 'visual') return;
            if (this.codeTab !== 'html') { if (!force) return; this.setCodeTab('html', true); }
            const k = K(), doc = k.parse(this.page().html), el = k.elByPath(doc, this.sel.path); if (!el) return;
            const tag = el.tagName.toLowerCase(), nth = [...doc.body.querySelectorAll(tag)].indexOf(el), text = this.code.value;
            const re = new RegExp(`<${tag}(?=[\\s>/])`, 'gi'); let m, k2 = 0, start = -1;
            while ((m = re.exec(text))) { if (k2++ === nth) { start = m.index; break; } }
            if (start < 0) return;
            const end = text.indexOf('>', start);
            const close = this.closeOf(text, start, tag);
            this.code.mark(start, close);
            if (force) this.code.reveal(start, end < 0 ? start : end + 1);
        }

        /** la fin de l'élément qui commence à « start » dans le texte (sa balise fermante), pour surligner tout le bloc */
        closeOf(text, start, tag) {
            if (/^(img|br|hr|input|source|meta|link|wbr)$/.test(tag)) return text.indexOf('>', start);
            const re = new RegExp(`<(/?)${tag}(?=[\\s>/])`, 'gi'); re.lastIndex = start; let depth = 0, m;
            while ((m = re.exec(text))) { depth += m[1] ? -1 : 1; if (depth === 0) return m.index; }
            return text.indexOf('>', start);
        }

        /* ── historique, état ── */
        changed(commit = false) {
            this.dirty = true; UI()?.savedStatus?.(this.dlg, 'dirty');
            clearTimeout(this.histT); if (commit) this.hist?.commit(); else this.histT = setTimeout(() => this.hist?.commit(), 600);
        }
        histButtons(h) { const u = this.$('.ui-topbar [data-ui-cmd="undo"]'), r = this.$('.ui-topbar [data-ui-cmd="redo"]'); if (u) u.disabled = !h.canUndo(); if (r) r.disabled = !h.canRedo(); }
        undo() { clearTimeout(this.histT); this.hist.commit(); if (this.hist.undo()) this.flash('↶ Annulé'); }
        redo() { if (this.hist.redo()) this.flash('↷ Rétabli'); }
        flash(t) { this.status?.flash?.(t); }
        afterRestore() { this.dirty = true; UI()?.savedStatus?.(this.dlg, 'dirty'); this.paintPages(); this.paintLeft(); this.paintPanel(); this.code.value = this.codeValue(); this.reload(); this.whereText(); }

        /* ── enregistrer, versions, exporter ── */
        async save({asNew = false, name = this.name, quiet = false, force = false} = {}) {
            clearTimeout(this.histT);
            UI()?.savedStatus?.(this.dlg, 'saving');
            try {
                const r = await post('save_website', {id: asNew ? 0 : this.id, name, data: this.site, rev: asNew ? '' : this.rev, force}), res = r.result || r, id = Number(res.id || 0);
                if (!asNew) {
                    const first = !this.id; this.id = id; this.rev = res.rev || ''; this.dirty = false; UI()?.savedStatus?.(this.dlg, 'saved');
                    if (res.data && JSON.stringify(res.data.pages.map(p => p.html)) !== JSON.stringify(this.site.pages.map(p => p.html))) { this.site = normalizeSite({...this.site, ...res.data}); this.afterRestore(); this.dirty = false; UI()?.savedStatus?.(this.dlg, 'saved'); }
                    if (res.removed) toast(`${plural(res.removed, 'chose')} retirée${res.removed > 1 ? 's' : ''} du HTML (scripts, cadres, attributs on…, liens javascript:) : mets ton JavaScript dans l’onglet JS.`, 'warning');
                    else if (first && !quiet) toast('Rangé dans Listes → 🛠️ Outils de modification → 🌐 Mon site web.');
                } else { UI()?.savedStatus?.(this.dlg, this.dirty ? 'dirty' : 'saved'); toast(`Copie « ${name} » enregistrée.`); }
                this.ctx.onSaved?.(this.id);
                return id;
            } catch (e) {
                UI()?.savedStatus?.(this.dlg, 'error');
                if (/modifié ailleurs/.test(e.message || '')) { if (await A().confirmBox('Une autre fenêtre a enregistré ce site entre-temps. Garder ta version effacera la sienne.', {title: 'Site modifié ailleurs', okLabel: 'Garder ma version', danger: true})) return this.save({asNew, name, quiet, force: true}); return 0; }
                toast(`Impossible d’enregistrer : ${e.message}`, 'error', {retry: () => this.save({asNew, name})}); return 0;
            }
        }
        async ensureSaved() { if (this.id && !this.dirty) return true; return !!await this.save({quiet: true}); }
        saveAs() { A().askText({title: '⧉ Enregistrer une copie', message: 'Le nom de la copie :', value: `${this.name} (copie)`, okLabel: 'Enregistrer'}).then(n => { n = String(n || '').trim(); if (n) this.save({asNew: true, name: n.slice(0, 200)}); }); }
        async saveVersion() {
            if (!await this.ensureSaved()) return;
            const label = await A().askText({title: '🕘 Nouvelle version', message: 'Un nom pour cette version (facultatif) :', value: `Version du ${new Date().toLocaleDateString('fr-FR')}`, okLabel: 'Enregistrer'}); if (label === null) return;
            try { await post('save_website_version', {site_id: this.id, label: String(label || '').trim().slice(0, 120), data: this.site}); toast('Version enregistrée (Fichier → 🕘 Versions du site).', 'success'); } catch (e) { toast(e.message, 'error'); }
        }
        async versions() {
            if (!this.id) return toast('Enregistre d’abord le site (💾) : ses versions seront gardées avec lui.');
            let items = []; try { items = (await api('website_versions', {site_id: this.id})).items || []; } catch (e) { return toast(e.message, 'error'); }
            ext.openDialog({eyebrow: 'MON SITE WEB', title: '🕘 Versions du site', wide: true, submitLabel: 'Fermer', body: '<div class="sw-row"><button type="button" class="button" data-v-new>＋ Enregistrer la version actuelle</button></div><div data-v-list></div>',
                onOpen: d => {
                    const paint = () => { d.querySelector('[data-v-list]').innerHTML = items.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Version</th><th>Enregistrée</th><th></th></tr></thead><tbody>${items.map(v => `<tr><td>${esc(v.label)}</td><td>${UI()?.when ? UI().when(v.created_at) : esc(v.created_at)}</td><td><div class="sw-row"><button type="button" class="button small secondary" data-v-back="${v.id}">↺ Reprendre</button><button type="button" class="icon-button small" data-v-del="${v.id}" title="Supprimer la version" aria-label="Supprimer la version">🗑</button></div></td></tr>`).join('')}</tbody></table></div>` : A().empty('Pas encore de version : « ＋ Enregistrer la version actuelle » garde le site tel qu’il est, pour y revenir plus tard.', {icon: '🕘', action: {label: '＋ Enregistrer la version actuelle', attrs: 'data-v-new'}}); };
                    paint();
                    d.addEventListener('click', async e => { const b = e.target.closest('button'); if (!b) return;
                        try {
                            if (b.matches('[data-v-new]')) { await post('save_website_version', {site_id: this.id, label: `Version du ${new Date().toLocaleDateString('fr-FR')}`, data: this.site}); items = (await api('website_versions', {site_id: this.id})).items || []; return paint(); }
                            const vid = Number(b.dataset.vBack || b.dataset.vDel); if (!vid) return;
                            if (b.dataset.vBack) { const v = await api('website_version', {id: vid}); this.hist.commit(); this.site = normalizeSite(v.data); this.pageIdx = 0; this.sel = null; this.afterRestore(); this.hist.commit(); d.close(); return A().undoToast?.(`Version « ${v.label} » reprise`, {undo: () => this.undo()}); }
                            if (b.dataset.vDel) { const r = await post('delete_website_version', {id: vid}); items = items.filter(x => x.id !== vid); paint(); A().undoToast?.('Version supprimée', {undo: async () => { await post('restore_website_version', {version: (r.result || r).version}); items = (await api('website_versions', {site_id: this.id})).items || []; if (d.isConnected) paint(); }}); }
                        } catch (err) { toast(err.message, 'error'); } });
                }, onSubmit: () => {}});
        }
        async openBrowser() {
            if (!await this.ensureSaved()) return;
            const url = new URL('api.php', location.href); url.searchParams.set('action', 'website_preview'); url.searchParams.set('id', String(this.id)); url.searchParams.set('page', this.page().slug);
            window.open(url.href, '_blank', 'noopener'); // une page isolée (CSP sandbox) : elle ne voit ni l'app ni ta base
        }
        async download(format) {
            const url = new URL('api.php', location.href); url.searchParams.set('action', 'website_export'); url.searchParams.set('id', String(this.id)); url.searchParams.set('format', format); if (format === 'html') url.searchParams.set('page', this.page().slug);
            const r = await fetch(url, {credentials: 'same-origin'});
            const type = r.headers.get('content-type') || '';
            if (!r.ok || !(format === 'zip' ? /zip/ : /html/).test(type)) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Le site n’a pas pu être fabriqué.'); }
            const name = (/filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '') || [])[1] || (format === 'zip' ? 'site.zip' : 'page.html');
            const blob = await r.blob(), a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
            toast(format === 'zip' ? `Site prêt : ${name}. Décompresse-le et ouvre index.html ; pour le mettre en ligne, envoie tout le dossier chez ton hébergeur.` : `Page prête : ${name} (tout est dedans, à ouvrir d’un double-clic).`, 'success');
        }
        async exportDialog() {
            if (!await this.ensureSaved()) return;
            let s = {}; try { s = (await api('website_export_check', {id: this.id})).summary || {}; } catch (e) { return toast(e.message, 'error'); }
            const bits = [plural(s.pages || 0, 'page'), plural(s.images || 0, 'image') + ' réduite' + ((s.images || 0) > 1 ? 's' : '') + ' (sans GPS ni appareil)'];
            if (s.refused) bits.push(`⚠️ ${plural(s.refused, 'image')} pas mise${s.refused > 1 ? 's' : ''} (une personne vivante ou confidentielle dessus${s.refused_titles?.length ? ' : ' + s.refused_titles.join(', ') : ''})`);
            if (s.names) bits.push(`⚠️ ${plural(s.names, 'nom')} de personne vivante remplacé${s.names > 1 ? 's' : ''} par « [nom retiré] »`);
            if (s.missing) bits.push(`${plural(s.missing, 'image')} introuvable${s.missing > 1 ? 's' : ''} dans tes médias`);
            await UI().openExportDialog({title: 'Exporter le site', defaultName: `site-${this.name}`, quality: false, info: bits.join(' · ') + '. Le site a sa politique de sécurité (CSP) : ses scripts viennent seulement de ses fichiers.',
                formats: [{id: 'zip', label: '🗜 Site complet', hint: 'index.html, pages, css, js, images', ext: 'zip', run: () => this.download('zip'), goLabel: '⤓ Exporter le site (.zip)'},
                    {id: 'html', label: '🌐 Cette page seule', hint: 'un seul fichier .html', ext: 'html', run: () => this.download('html'), goLabel: '⤓ Exporter la page (.html)'}]});
        }
        async close() {
            if (this.dirty && !await A().confirmBox('Les changements faits depuis le dernier enregistrement seront perdus.', {title: 'Fermer sans enregistrer ?', okLabel: 'Fermer sans enregistrer', danger: true})) return;
            window.removeEventListener('message', this.onMsg); document.removeEventListener('keydown', this.onDocKey, true); this.ro?.disconnect();
            this.dlg.close(); this.dlg.remove(); this.closed = true;
            if (ext.siteWeb.current === this) ext.siteWeb.current = null;
            this.ctx.onClose?.();
        }
    }

    /* ═════ Ouvrir, créer, modèles ═════ */
    async function openSite(ctx = {}) {
        if (!K() || !CODE()) return toast('Mon site web n’est pas chargé : recharge la page.', 'error');
        let id = 0, name = ctx.name || 'Mon site', data = ctx.data || null, rev = '';
        if (ctx.id) { try { const r = await api('website', {id: ctx.id}); id = r.id; name = r.name; data = r.data; rev = r.rev; } catch (e) { return toast(e.message, 'error'); } }
        return new Editor({...ctx, id, name, data, rev, dirty: !!ctx.data && !ctx.id}).open();
    }
    async function chooseTemplate(ctx = {}) {
        const k = K();
        ext.openDialog({eyebrow: 'MON SITE WEB', title: '＋ Nouveau site : par où commencer ?', wide: true, submitLabel: 'Fermer',
            body: `<p class="muted">Choisis un modèle : tu pourras tout changer ensuite, en glissant des blocs ou dans le code.</p><div class="sw-tpls">${k.TEMPLATES.map(t => `<button type="button" class="sw-tpl" data-tpl="${t.key}"><span class="sw-tpl-ico" aria-hidden="true">${t.icon}</span><b>${esc(t.name)}</b><small>${esc(t.hint)}</small></button>`).join('')}</div>`,
            onOpen: d => d.addEventListener('click', async e => {
                const b = e.target.closest('[data-tpl]'); if (!b) return; d.close();
                try { const t = k.TEMPLATES.find(x => x.key === b.dataset.tpl); const data = await t.make(); if (!data) return; return openSite({...ctx, data, name: data.settings?.title || t.name}); } catch (err) { toast(err.message, 'error'); }
            }), onSubmit: () => {}});
    }
    ext.siteWeb = {Editor, open: openSite, chooseTemplate, normalizeSite, blankSite, themeCss, current: null};
    ext.openWebsite = openSite;

    /* ═════ Dans 🛠️ Outils de modification ═════ */
    const mini = d => { const c = (d.info?.colors || []).map(x => (/^#[0-9a-f]{6}$/i.test(x) ? x : '#888888')); return `<span class="sw-mini" style="--a:${c[0] || '#7a2a2a'};--b:${c[1] || '#fbf8f3'};--c:${c[2] || '#c8a45c'}"><i></i><b>${esc(d.info?.head || d.name)}</b><i></i><i></i></span>`; };
    ext.editToolsExtra = ext.editToolsExtra || [];
    ext.editToolsExtra.push({key: 'website', icon: '🌐', label: 'Mon site web', what: 'site',
        load: async () => ((await api('websites')).items || []).map(d => ({id: d.id, name: d.name, date: d.updated_at, thumb: mini(d), info: [plural(d.info?.pages || 1, 'page'), d.info?.blocks ? plural(d.info.blocks, 'bloc') + ' de la base' : '', d.info?.js ? 'JS' : ''].filter(Boolean).join(' · ')})),
        open: (id, again) => openSite({id, onSaved: again, onClose: again}),
        create: again => chooseTemplate({onSaved: again, onClose: again}),
        rename: (id, name) => post('rename_website', {id, name}),
        remove: id => post('delete_website', {id}), createLabel: '＋ Nouveau site'});
})();
