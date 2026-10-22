/* LCNDA — K14 « ⋯ » et clic droit : toujours le même menu d'actions de l'app (UI.menuAt, maquette harmonisation K14, validée).
 * - « ⋯ » fait d'un <details> (en-têtes de page, vignettes…) : un clic ouvre UI.menuAt avec les mêmes boutons (cliqués pour de vrai :
 *   leurs écouteurs ne changent pas).
 * - Clic droit sur une ligne de liste, une vignette, une carte : le menu de son « ⋯ » à l'endroit de la souris, sinon un menu fait
 *   de ses boutons (↗ Ouvrir d'abord, 🗑 Supprimer en rouge en bas).
 * - Clic droit sur un objet d'un éditeur (dessin, mise en page, présentation, tableau, maison) : Couper, Copier, Coller, Dupliquer,
 *   Premier plan…, Grouper…, Supprimer, avec leurs touches (les commandes de l'éditeur, cliquées pour de vrai).
 * - Maj + clic droit, ou clic droit dans une case de texte : le menu du navigateur (copier, coller, orthographe…).
 * - data-ctx-off sur un élément ou un parent : pas de menu de l'app ; data-ctx-menu : la ligne a un menu même hors des listes connues.
 * API : LCNDA_UI.contextMenu(e, items, {title}) — pour un outil qui a son propre menu (clic droit d'un repère, d'un point…).
 */
(() => {
    'use strict';
    const UI = window.LCNDA_UI = window.LCNDA_UI || {};
    const A = () => window.LCNDA_APP || {};
    const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
    const EMO = /^((?:\p{Extended_Pictographic}|[↗↶↷✎✕×＋⤓⤒⧉↻↺⇄⌫🗑★☆⭐▶⏵⏸⊞⊟←→↑↓]|\p{Regional_Indicator})(?:[️‍⃣]|\p{Extended_Pictographic})*)\s*/u;
    const visible = el => el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

    /** le menu à l'endroit de la souris (clic droit) */
    UI.contextMenu = (e, items, o = {}) => { e?.preventDefault?.(); return UI.menuAt({x: e.clientX, y: e.clientY}, items, o); };

    /* ── un bouton (ou un lien) → une ligne de menu ── */
    const shortcutOf = b => b.querySelector('kbd')?.dataset.k || b.querySelector('kbd')?.textContent?.trim() || b.dataset.shortcut || ((b.getAttribute('title') || '').match(/\(([^()]{1,12})\)/)?.[1] || '').replace(/^(?!.*[⌘⇧⌥⌃]|Ctrl|Maj).*$/, '');
    function itemOf(b) {
        let label = '';
        const span = b.querySelector(':scope > span:not(.ui-actmenu-ico)');
        const txt = clean([...b.childNodes].filter(n => n.nodeType === 3 || (n.nodeType === 1 && !n.matches('kbd, svg, img, .k-keys, small'))).map(n => n.textContent).join(' '));
        label = clean(span?.textContent) || txt;
        const name = clean(b.getAttribute('aria-label') || b.getAttribute('title') || b.dataset.tbLabel || '').replace(/\s*\([^()]*\)\s*$/, '');
        let icon = '';
        const m = label.match(EMO); if (m) { icon = m[1]; label = clean(label.slice(m[0].length)); }
        // un bouton icône, des initiales (« JM ») : son nom (bulle) à la place
        if (!label || label.length <= 1 || /^[\p{Lu}?]{1,3}$/u.test(label)) { label = name; if (!icon && b.matches('.icon-delete')) icon = '🗑'; if (!icon && b.matches('.icon-edit')) icon = '✎'; }
        if (!label) return null;
        // un lien vers une fiche (le nom) : « ↗ Ouvrir « nom » »
        if (b.matches('a, .table-link, [class*="-link"]') && !/^(ouvrir|voir|afficher|modifier|supprimer|retirer|ajouter|nouve|＋|aller)/i.test(label)) { label = `Ouvrir « ${label.slice(0, 40)} »`; icon = icon || '↗'; }
        label = label.replace(/\s*▾$/, '');
        const danger = b.matches('.is-danger, .danger, .icon-delete, [data-danger]') || /^(supprimer|effacer|mettre à la corbeille)/i.test(label) || icon === '🗑';
        if (danger && !icon) icon = '🗑';
        return {icon, label: label.slice(0, 60), danger, shortcut: shortcutOf(b), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true', run: () => b.click(), el: b};
    }
    const order = it => (/^(ouvrir|voir|afficher|↗)/i.test(it.label) || it.icon === '↗' ? 0 : /^(modifier|renommer|✎)/i.test(it.label) || it.icon === '✎' ? 1 : 2);
    function itemsOf(buttons) {
        const seen = new Set(), out = [];
        buttons.forEach(b => { const it = itemOf(b); if (!it) return; const k = it.label.toLowerCase(); if (seen.has(k)) return; seen.add(k); out.push(it); });
        return out.sort((a, b) => order(a) - order(b));
    }

    /* ── « ⋯ » fait d'un <details> : le menu de l'app ── */
    const MORE_DETAILS = 'details.ui-ph-more, details.ui-more, details.ui-card-more';
    function detailsItems(d) {
        const menu = d.querySelector(':scope > :not(summary)'); if (!menu) return [];
        return itemsOf([...menu.querySelectorAll('button, a[href], label.button, label[for], label:has(input[type=file])')].filter(b => !b.closest('summary') && b.closest('details') === d));
    }
    function openDetailsMenu(d, at = null) {
        const sum = d.querySelector(':scope > summary'), items = detailsItems(d); if (!items.length) return false;
        d.removeAttribute('open');
        UI.menuAt(at ? {x: at.x, y: at.y} : sum, items);
        return true;
    }
    document.addEventListener('click', e => {
        const sum = e.target.closest?.('summary'); if (!sum) return;
        const d = sum.parentElement; if (!d?.matches?.(MORE_DETAILS) || d.closest('[data-ctx-off]')) return;
        if (!detailsItems(d).length) return;
        e.preventDefault(); e.stopPropagation();
        openDetailsMenu(d);
    }, true);

    /* ── clic droit ── */
    const MORE_BTN = '[data-ps-more], .ui-presets-more, button[data-more], button[aria-label="Plus d’actions"], button[aria-label="Plus d\'actions"]';
    const isMoreBtn = b => b.matches(MORE_BTN) || clean(b.textContent) === '⋯';
    const ROW = '[data-ctx-menu], .ui-row, .ui-card, .ui-presets-list > li, tbody > tr, .dashboard-row, .media-card, .media-tile, .media-thumb, .h-hs-card, article[class*="card"], li[class*="card"], div[class*="-card"]:not([class*="-cards"]):not([class*="ui-card-"]), li[class*="-item"], div[class*="-item"][data-id], .list-row, .result-row, [class*="-row"][data-id]';
    const NOT_ITEM = 'input[type=checkbox], input[type=radio], select, summary, [data-ctx-skip], .drag-handle, [draggable="true"] > .order-grip';
    function rowMenu(row, at) {
        // son « ⋯ » d'abord (le même menu, à l'endroit de la souris)
        const d = [...row.querySelectorAll(MORE_DETAILS)].find(x => x.closest(ROW) === row);
        const more = [...row.querySelectorAll('button')].find(b => isMoreBtn(b) && b.closest(ROW) === row && visible(b));
        const btns = [...row.querySelectorAll('button, a[href]')].filter(b => b.closest(ROW) === row && !b.closest('summary, details:not([open]) > :not(summary)') && !isMoreBtn(b) && !b.matches(NOT_ITEM) && visible(b));
        if (more) { UI._menuPoint = {x: at.x, y: at.y, t: Date.now()}; more.click(); if (UI._menuPoint) UI._menuPoint = null; return true; }
        let items = itemsOf(btns);
        if (d) { const extra = detailsItems(d); const have = new Set(items.map(i => i.label.toLowerCase())); items = [...items, '-', ...extra.filter(i => !have.has(i.label.toLowerCase()))]; }
        // une ligne qui s'ouvre d'un clic (data-…-open) sans bouton « Ouvrir »
        const opener = [...row.attributes].some(a => /^data-[a-z-]*open$/.test(a.name)) || row.matches('.is-click, [role="button"], [data-open]');
        if (opener && !items.some(i => /^ouvrir$/i.test(i.label))) items.unshift({icon: '↗', label: 'Ouvrir', run: () => row.click()});
        items = items.filter((it, i, arr) => it !== '-' || (i > 0 && i < arr.length - 1));
        if (!items.filter(i => i !== '-').length) return false;
        const title = clean(row.querySelector('.table-link, strong, b, h3, h4, .ui-row-name, .ui-card-name')?.textContent || '').slice(0, 50);
        UI.menuAt({x: at.x, y: at.y}, items, {title});
        return true;
    }

    /* objets d'un éditeur : ses propres commandes, rangées comme dans la maquette */
    const ED_STAGE = '.vx-stage, .ly-canvas, .kn-stage, .h-board-stage, .h-hs-stage';
    const ED_CMDS = [
        [/^couper\b/i, '✂'], [/^copier\b(?! le style| la mise)/i, '⧉'], [/^coller\b(?! le style| la mise)/i, '📋'], [/^coller sur place/i, '📋'], [/^dupliquer\b/i, '⧉'], '-',
        [/^(premier plan|tout devant|au premier plan)/i, '⇈'], [/^avancer\b/i, '↑'], [/^reculer\b/i, '↓'], [/^(arrière-plan|tout derrière|à l’arrière-plan)/i, '⇊'], '-',
        [/^grouper\b/i, '⊞'], [/^dissocier\b/i, '⊟'], [/^(verrouiller|déverrouiller)/i, '🔒'], '-',
        [/^supprimer\b/i, '🗑'],
    ];
    function editorItems(dlg) {
        const btns = [...dlg.querySelectorAll('button')].filter(b => !b.closest('.ui-actmenu') && [...b.attributes].some(a => /^data-[a-z]+-(cmd|act)$/.test(a.name)));
        const label = b => clean(b.querySelector(':scope > span')?.textContent || (b.textContent || '').replace(EMO, '') || b.dataset.tbLabel || b.title || '').replace(/\s*\([^()]*\)\s*$/, '');
        const out = [];
        ED_CMDS.forEach(c => {
            if (c === '-') { out.push('-'); return; }
            const [rx, icon] = c;
            // celle d'un menu d'abord (elle a sa touche), sinon un bouton de la barre
            // l'objet choisi d'abord : pas « Dupliquer la diapositive », « Supprimer la page »… s'il y a mieux ; puis celle qui a sa touche
            const OTHER = /diapositive|\bpage\b|étage|projet|calque|dossier|piste|réglage/i, score = x => (OTHER.test(label(x) + ' ' + (x.title || '')) ? 0 : 4) + (x.querySelector('kbd') ? 2 : 0) + (x.disabled ? 0 : 1);
            const b = btns.filter(x => rx.test(label(x)) || rx.test(clean(x.dataset.tbLabel || '').replace(EMO, '')) || rx.test(clean(x.title || ''))).sort((x, y) => score(y) - score(x))[0];
            if (!b || out.some(o => o !== '-' && o.el === b)) return;
            const it = itemOf(b) || {}; const name = label(b) || it.label;
            out.push({icon, label: name.replace(/\s*[—–-]\s.*$/, '').slice(0, 40), shortcut: shortcutOf(b), disabled: b.disabled, danger: /^supprimer/i.test(name), run: () => { b.closest('details')?.removeAttribute('open'); b.click(); }, el: b});
        });
        return out;
    }
    // un objet du dessin (pas le fond) : il est choisi d'abord, comme dans les autres logiciels
    const isObject = (t, stage) => { for (let el = t; el && el !== stage; el = el.parentElement) { if ([...el.attributes].some(a => /^data-(vx|([a-z]+-)?(o|id|obj|item|el))$/.test(a.name)) || el.matches?.('.ly-item, .h-bd-item, .kn-o')) return el; } return null; };
    function selectFirst(obj, e) {
        const dlg = obj.closest('dialog');
        const tool = dlg?.querySelector('[data-vx-tool].is-on, [data-vx-tool].is-active, [data-ly-tool].is-on, [data-ly-tool].is-active, [data-hs-tool].is-on, [data-hs-tool].is-active, [data-bd-tool].is-on, [data-bd-tool].is-active');
        const tv = tool ? Object.entries(tool.dataset).find(([k]) => /Tool$/.test(k))?.[1] : 'select';
        if (!/^(select|sel|v|move|pointer)$/i.test(tv || '')) return;
        if (obj.matches('.is-selected, .is-sel, .is-on, [aria-selected="true"]')) return;
        const o = {bubbles: true, cancelable: true, composed: true, clientX: e.clientX, clientY: e.clientY, button: 0, pointerId: e.pointerId || 1, pointerType: 'mouse', isPrimary: true, view: window};
        try { e.target.dispatchEvent(new PointerEvent('pointerdown', {...o, buttons: 1})); e.target.dispatchEvent(new MouseEvent('mousedown', {...o, buttons: 1})); e.target.dispatchEvent(new PointerEvent('pointerup', {...o, buttons: 0})); e.target.dispatchEvent(new MouseEvent('mouseup', {...o, buttons: 0})); window.dispatchEvent(new PointerEvent('pointerup', {...o, buttons: 0})); } catch (_) {}
    }

    document.addEventListener('contextmenu', e => {
        if (e.defaultPrevented || e.shiftKey) return; // l'outil a son propre menu, ou Maj : celui du navigateur
        const t = e.target; if (!(t instanceof Element)) return;
        if (t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-ctx-off], .leaflet-container, video, audio, iframe, .ui-actmenu, .k-tip')) return;
        if (window.getSelection?.()?.toString()) return; // du texte choisi : copier avec le menu du navigateur
        const at = {x: e.clientX, y: e.clientY};
        // dans un éditeur
        const stage = t.closest(ED_STAGE);
        if (stage) {
            const dlg = stage.closest('dialog') || document;
            if (!editorItems(dlg).some(i => i !== '-')) return; // un éditeur sans ces commandes : rien à proposer
            e.preventDefault();
            const obj = isObject(t, stage); if (obj) selectFirst(obj, e);
            setTimeout(() => { const items = editorItems(dlg); if (items.some(i => i !== '-')) UI.menuAt(at, items); }, obj ? 30 : 0);
            return;
        }
        const row = t.closest(ROW); if (!row || row.closest('thead')) return;
        // les lignes d'un tableau à remplir (cases, menus) ne sont pas des lignes de liste
        if (row.matches('tr') && row.querySelector('input:not([type=checkbox]):not([type=radio]), textarea, select')) return;
        if (rowMenu(row, at)) e.preventDefault();
    });

    /* ═════════════ K13 🖨 Imprimer et ⤒ Importer : une fenêtre chacun, partout la même ═════════════ */
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k, o) => (A().toast ? A().toast(m, k, o) : console.info(m));
    const plural = (n, one, many) => (A().plural ? A().plural(n, one, many) : `${n} ${Math.abs(n) < 2 ? one : (many || one + 's')}`);
    const PAPER = {A4: [210, 297], A5: [148, 210], A3: [297, 420], Lettre: [216, 279]};
    const MM = 96 / 25.4;
    const F = () => window.LCNDA_FORMATS;
    /** les règles @media print de l'app, réécrites pour l'aperçu (on voit ce qui sera imprimé) */
    function printRules() {
        const out = [];
        const walk = rules => [...rules].forEach(r => { if (r.media && /print/.test(r.media.mediaText) && !/not\s+print/.test(r.media.mediaText)) out.push([...r.cssRules].map(x => x.cssText).join('\n')); else if (r.cssRules && !r.media) { try { walk(r.cssRules); } catch (_) {} } });
        [...document.styleSheets].forEach(sh => { try { if (sh.media?.mediaText && !/all|screen|print/.test(sh.media.mediaText)) return; walk(sh.cssRules); } catch (_) {} });
        return out.join('\n');
    }
    /** l'écran affiché, copié pour l'aperçu (sans fenêtres, scripts ni bulles ; les dessins <canvas> deviennent des images) */
    function pageSnapshot(bodyClass = '', element = null) {
        const root = (typeof element === 'string' ? document.querySelector(element) : element) || document.querySelector('#workspace') || document.body;
        const body = root.cloneNode(true), src = [...root.querySelectorAll('canvas')], dst = [...body.querySelectorAll('canvas')];
        dst.forEach((c, i) => { try { const im = document.createElement('img'); im.src = src[i].toDataURL(); im.style.cssText = c.style.cssText; im.className = c.className; im.width = src[i].width; c.replaceWith(im); } catch (_) {} });
        body.querySelectorAll('input, textarea, select').forEach((el, i) => { const o = root.querySelectorAll('input, textarea, select')[i]; if (!o) return; if (el.type === 'checkbox' || el.type === 'radio') el.toggleAttribute('checked', o.checked); else if (el.tagName === 'TEXTAREA') el.textContent = o.value; else if (el.tagName === 'SELECT') [...el.options].forEach((op, k) => op.toggleAttribute('selected', k === o.selectedIndex)); else el.setAttribute('value', o.value); });
        body.querySelectorAll('script, dialog, template, .k-tip, #toast-region, .ui-pop, .ui-actmenu, iframe, video, audio').forEach(x => x.remove());
        const links = [...document.querySelectorAll('link[rel="stylesheet"], style')].filter(l => !l.media || l.media !== 'not all').map(l => l.outerHTML).join('');
        const html = document.documentElement, cls = [...html.classList].join(' ');
        return `<!doctype html><html lang="fr" class="${esc(cls)}" data-theme="light"><head><meta charset="utf-8"><base href="${esc(location.href)}">${links}<style>${printRules()}</style></head><body class="${esc(document.body.className)} ${esc(bodyClass)} k-print-doc">${root === document.body ? body.innerHTML : body.outerHTML}</body></html>`;
    }
    /** 📐 un format libre (« ✎ Autre format… », liste commune app-formats.js) : [largeur, hauteur] en mm, en portrait */
    const paperMm = o => (o.paper === 'custom' && Array.isArray(o.size) ? [Math.min(...o.size), Math.max(...o.size)] : PAPER[o.paper] || PAPER.A4);
    const pageSize = o => { if (o.paper !== 'custom') return `${o.paper} ${o.orientation === 'landscape' ? 'landscape' : 'portrait'}`; const [w, h] = paperMm(o), land = o.orientation === 'landscape'; return `${Math.round((land ? h : w) * 10) / 10}mm ${Math.round((land ? w : h) * 10) / 10}mm`; };
    const pageCss = o => `@page{size:${pageSize(o)}}${o.photos === false ? 'img,picture,svg image,.media-thumb,.person-photo,[class*="photo"] img{display:none!important}' : ''}`;
    const withPageCss = (doc, o) => { const css = `<style data-k-print>${pageCss(o)}@media screen{html{background:#fff}body{margin:0}}</style>`; return /<\/head>/i.test(doc) ? doc.replace(/<\/head>/i, css + '</head>') : /^\s*<!doctype[^>]*>/i.test(doc) ? doc.replace(/^\s*<!doctype[^>]*>/i, m => m + css) : `<!doctype html><html lang="fr"><head><meta charset="utf-8"><base href="${esc(location.href)}">${css}</head><body>${doc}</body></html>`; };
    const imagesReady = doc => Promise.all([...(doc?.images || [])].map(im => (im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; setTimeout(r, 4000); }))));
    /** la page imprimée d'un document (dans un cadre caché, sans scripts) */
    function printDoc(doc) {
        return new Promise(res => {
            const fr = document.createElement('iframe'); fr.setAttribute('sandbox', 'allow-same-origin allow-modals'); fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1;
            fr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
            fr.onload = async () => { await imagesReady(fr.contentDocument); try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast(`Impression impossible : ${e.message}`, 'error'); } setTimeout(() => fr.remove(), 60000); res(); };
            fr.srcdoc = doc; document.body.appendChild(fr);
        });
    }
    /** K13 — UI.openPrintDialog({title, icon, page, html, bodyClass, options, paper, orientation, pdf}) → Promise<choix|null>
     *  page: true → le contenu de l'écran affiché (#workspace, ou element ; sans menus ni barres ; bodyClass ajoutée) ; html: texte ou (choix) => texte (un document à part).
     *  options : [{key, label, checked}] (cases « ce qu'on inclut ») ; une case « Photos » existe d'office (photos: false pour l'enlever). */
    UI.openPrintDialog = (o = {}) => new Promise(resolve => {
        const st = {paper: o.paper || 'A4', orientation: o.orientation || 'portrait'};
        const opts = [...(o.photos === false ? [] : [{key: 'photos', label: 'Photos', checked: true}]), ...(o.options || [])];
        opts.forEach(x => { st[x.key] = x.checked !== false; });
        const dlg = document.createElement('dialog'); dlg.className = 'modal ui-export k-print';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">IMPRIMER</span><h2>🖨 ${esc(o.title || 'Imprimer')}</h2></div><button type="button" class="icon-button" data-k-x aria-label="Fermer">×</button></div>
            <div class="ui-export-body k-print-body"><div class="ui-export-main">
                <div class="k-print-row"><div class="segmented k-seg" role="radiogroup" aria-label="Format du papier">${(o.papers || ['A4', 'A5']).map(p => `<button type="button" role="radio" data-k-paper="${p}">${p}</button>`).join('')}${F() ? '<button type="button" role="radio" data-k-paper="custom" title="Un autre format de la liste, ou un format libre (gardé dans « Mes formats »)">✎ Autre…</button>' : ''}</div>
                <div class="segmented k-seg" role="radiogroup" aria-label="Sens"><button type="button" role="radio" data-k-or="portrait">Portrait</button><button type="button" role="radio" data-k-or="landscape">Paysage</button></div></div>
                ${F() ? `<div class="k-print-custom" data-k-custom hidden>${F().boxHtml({value: F().last('impression') || F().preset('A3', {unit: 'cm'}), units: ['mm', 'cm', 'in'], dpi: false, orientation: false, title: 'Format du papier'})}</div>` : ''}
                ${opts.length ? `<div class="k-print-opts"><span class="ui-export-lab">Ce qu’on imprime</span>${opts.map(x => `<label class="checkbox-line ui-export-check"><input type="checkbox" data-k-opt="${esc(x.key)}"${st[x.key] ? ' checked' : ''}> ${esc(x.label)}</label>`).join('')}</div>` : ''}
                ${o.info ? `<small class="ui-export-info">${esc(o.info)}</small>` : ''}
                <small class="ui-export-info" data-k-pdfhint hidden>Dans la fenêtre qui s’ouvre, choisis « Enregistrer au format PDF » comme imprimante.</small>
            </div><div class="ui-export-side"><div class="k-print-prev" data-k-prev aria-label="Aperçu">${UI.spinner ? UI.spinner('Aperçu…') : 'Aperçu…'}</div></div></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-k-x>Annuler</button>${o.pdf === false ? '' : '<button type="button" class="button secondary" data-k-pdf>⤓ PDF</button>'}<button type="submit" class="button" data-k-go>🖨 Imprimer</button></div></form>`;
        document.body.appendChild(dlg);
        const $ = s => dlg.querySelector(s), prev = $('[data-k-prev]');
        const cbox = F() ? F().bindBox(dlg.querySelector('[data-k-custom] [data-fmt-box]'), {onChange: v => { const [w, h] = F().inMm(v); st.size = [w, h]; if (st.paper === 'custom') later(); }}) : null;
        if (cbox) { const [w, h] = F().inMm(cbox.get()); st.size = [w, h]; }
        const paint = () => { const cu = dlg.querySelector('[data-k-custom]'); if (cu) cu.hidden = st.paper !== 'custom'; dlg.querySelectorAll('[data-k-paper]').forEach(b => { const on = b.dataset.kPaper === st.paper; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on); }); dlg.querySelectorAll('[data-k-or]').forEach(b => { const on = b.dataset.kOr === st.orientation; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on); }); };
        let snap = null, t = 0;
        const docFor = async () => (o.page ? (snap = snap || pageSnapshot(o.bodyClass, o.element)) : typeof o.html === 'function' ? await o.html({...st}) : String(o.html || ''));
        async function preview() {
            const [w0, h0] = paperMm(st), land = st.orientation === 'landscape', pw = (land ? h0 : w0) * MM, ph = (land ? w0 : h0) * MM;
            let doc; try { doc = withPageCss(await docFor(), st); } catch (e) { prev.textContent = 'Pas d’aperçu'; return; }
            const boxW = prev.clientWidth || 240, k = boxW / pw;
            prev.style.aspectRatio = `${pw} / ${ph}`;
            const fr = document.createElement('iframe'); fr.setAttribute('sandbox', 'allow-same-origin'); fr.setAttribute('title', 'Aperçu de l’impression'); fr.tabIndex = -1;
            fr.style.cssText = `width:${pw}px;height:${ph}px;transform:scale(${k});transform-origin:0 0;border:0;background:#fff;pointer-events:none`;
            fr.srcdoc = doc; prev.innerHTML = ''; prev.appendChild(fr);
            fr.onload = () => { try { const d = fr.contentDocument, mm = 12 * MM; d.documentElement.style.background = '#fff'; d.body.style.padding = `${mm}px`; d.body.style.boxSizing = 'border-box'; const pages = Math.max(1, Math.ceil((d.body.getBoundingClientRect().height + 2 * mm) / ph - 0.02)); prev.dataset.pages = pages > 1 ? `1 / ${pages} pages` : '1 page'; } catch (_) {} };
        }
        const later = () => { clearTimeout(t); t = setTimeout(preview, 120); };
        dlg.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.matches('[data-k-x]')) { dlg.close(); return; }
            if (b.dataset.kPaper) { st.paper = b.dataset.kPaper; paint(); later(); }
            if (b.dataset.kOr) { st.orientation = b.dataset.kOr; paint(); later(); }
            if (b.matches('[data-k-pdf]')) { st.pdf = true; $('[data-k-pdfhint]').hidden = false; go(); }
        });
        dlg.addEventListener('change', e => { const c = e.target.closest('[data-k-opt]'); if (c) { st[c.dataset.kOpt] = c.checked; later(); } });
        let result = null;
        async function go() {
            const btn = $('[data-k-go]'); btn.disabled = true;
            try {
                if (st.pdf) toast('Dans la fenêtre d’impression, choisis « Enregistrer au format PDF ».');
                result = {...st};
                if (st.paper === 'custom' && cbox) F().use('impression', cbox.get());
                const doc = withPageCss(await docFor(), st); dlg.close(); await printDoc(doc); // l'écran affiché : seulement son contenu (sans menus ni barres)
                o.onPrint?.(result);
            } catch (e) { btn.disabled = false; toast(`Impression impossible : ${e?.message || e}`, 'error'); }
        }
        $('form').addEventListener('submit', e => { e.preventDefault(); st.pdf = false; go(); });
        dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
        paint(); dlg.showModal(); $('[data-k-go]').focus();
        requestAnimationFrame(preview);
    });
    /** un document imprimé tout de suite (dans un cadre caché) : pour « 🖨 Imprimer » de la fenêtre d'export E3 */
    UI.printDocument = doc => printDoc(String(doc || ''));
    /** raccourci : l'écran affiché (fiche, livret, animal, relevé…) */
    UI.printPage = (title, o = {}) => UI.openPrintDialog({...o, title: title || clean(document.querySelector('#workspace .page-header h1, #workspace .page-header h2, #workspace h1, #workspace h2')?.textContent) || 'L’écran affiché', page: true});

    /** K13 — UI.openImportDialog({title, accept, multiple, text, hint, files, analyze, run, noun, many, feminine, goLabel})
     *  1. déposer le fichier (zone E4) · 2. « Voilà ce qui va entrer » (analyze(files) → {count, summary, notices:[{kind,text}], preview, data, ok})
     *  · 3. « ⤒ Importer N … » (run(analyse, files) → {message, undo} : message H7, avec « ↶ Annuler » si undo).
     *  Pour un import qui a déjà sa propre fenêtre (GEDCOM, base…) : analyze rend {count, summary} et run lance l'outil existant. */
    UI.openImportDialog = (o = {}) => new Promise(resolve => {
        const dlg = document.createElement('dialog'); dlg.className = 'modal ui-export k-import';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow" data-k-step>IMPORTER · ÉTAPE 1 SUR 3</span><h2>⤒ ${esc(o.title || 'Importer')}</h2></div><button type="button" class="icon-button" data-k-x aria-label="Fermer">×</button></div>
            <div class="k-import-body" data-k-body></div>
            <div class="modal-actions"><button type="button" class="button secondary" data-k-back hidden>← Retour</button><span class="spacer"></span><button type="button" class="button secondary" data-k-x>Annuler</button><button type="submit" class="button" data-k-go hidden></button></div></form>`;
        document.body.appendChild(dlg);
        const $ = s => dlg.querySelector(s), body = $('[data-k-body]'), go = $('[data-k-go]');
        let files = null, an = null, result = null, step = 1;
        const setStep = n => { step = n; $('[data-k-step]').textContent = `IMPORTER · ÉTAPE ${n} SUR 3`; $('[data-k-back]').hidden = n !== 2; };
        function step1() {
            setStep(1); go.hidden = true; an = null;
            body.innerHTML = o.intro ? `<p class="k-import-intro">${esc(o.intro)}</p>` : '';
            const z = UI.dropZone({accept: o.accept || '', multiple: !!o.multiple, text: o.text || `📁 Glisse ici ${o.multiple ? 'les fichiers' : 'le fichier'}${o.what ? ` (${o.what})` : ''}, colle-le (⌘V) ou choisis-le sur l’ordinateur`, hint: o.hint ?? '', onFiles: f => { files = o.multiple ? f : f.slice(0, 1); step2(); }});
            body.appendChild(z); setTimeout(() => z.focus(), 30);
        }
        async function step2() {
            setStep(2); go.hidden = false; go.disabled = true; go.textContent = '⤒ Importer';
            const names = (files || []).map(f => f.name).join(', ');
            body.innerHTML = `<p class="k-import-file">📄 <b>${esc(names || 'fichier')}</b></p>${UI.spinner ? UI.spinner('Lecture du fichier…') : 'Lecture du fichier…'}`;
            try { an = (await o.analyze?.(files)) || {count: files.length}; }
            catch (e) { body.innerHTML = `<p class="k-import-file">📄 <b>${esc(names)}</b></p>${UI.notice('error', `Ce fichier ne peut pas être importé : ${e?.message || e}`)}`; return; }
            if (step !== 2) return;
            const n = Number(an.count) || 0, noun = an.noun || o.noun || 'élément', many = an.many || o.many;
            const sum = an.summaryHtml || (an.summary ? esc(an.summary) : `<b>${esc(plural(n, noun, many))}</b>`);
            body.innerHTML = `<p class="k-import-file">📄 <b>${esc(names)}</b></p>${UI.notice(an.ok === false ? 'warn' : 'info', '')}${(an.notices || []).map(x => UI.notice(x.kind || 'warn', x.text)).join('')}${an.preview ? `<div class="k-import-prev">${an.preview}</div>` : ''}${an.extra || ''}`;
            const first = body.querySelector('.ui-notice'); const txt = first?.querySelector('.ui-notice-t, span:last-child') || first; if (txt) txt.innerHTML = an.ok === false ? sum : `Voilà ce qui va entrer : ${sum}.`;
            go.disabled = an.ok === false || (!n && an.count !== undefined && !an.allowEmpty);
            go.textContent = typeof o.goLabel === 'function' ? o.goLabel(n, an) : an.goLabel || `⤒ Importer ${n ? plural(n, noun, many) : ''}`.trim();
            an.onShow?.(body);
            go.focus();
        }
        dlg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.matches('[data-k-x]')) dlg.close(); if (b.matches('[data-k-back]')) step1(); });
        $('form').addEventListener('submit', async e => {
            e.preventDefault(); if (step !== 2 || go.disabled) return;
            setStep(3); const label = go.textContent; go.disabled = true; $('[data-k-back]').hidden = true; go.innerHTML = `<span class="ui-spin" aria-hidden="true"></span>${esc(label)}`;
            try {
                const r = (await o.run?.(an, files, body)) || {};
                if (r === false || r.keepOpen) { go.disabled = false; go.textContent = label; setStep(2); return; }
                result = {analysis: an, files, ...r}; dlg.close();
                const msg = r.message ?? (an.count ? `${plural(an.count, an.noun || o.noun || 'élément', an.many || o.many)} ${an.feminine || o.feminine ? (an.count > 1 ? 'importées' : 'importée') : (an.count > 1 ? 'importés' : 'importé')}.` : 'Import terminé.');
                if (msg) { if (r.undo && A().undoToast) A().undoToast(msg, {undo: r.undo, redo: r.redo || null, icon: '⤒'}); else toast(msg, r.kind || ''); }
            } catch (x) { setStep(2); go.disabled = false; go.textContent = label; body.insertAdjacentHTML('beforeend', UI.notice('error', `Impossible d’importer : ${x?.message || x}`)); }
        });
        dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
        dlg.showModal();
        if (o.files?.length) { files = [...o.files]; step2(); } else step1();
    });

    /* ── K13 : tous les boutons « Importer… » de l'app passent par la même fenêtre (sans toucher à leur logique) ──
     * Un bouton dont le nom dit « Importer » (ou ⤒, 📥) qui ouvre le choix de fichier de l'ordinateur ouvre à la place
     * UI.openImportDialog ; le fichier choisi est ensuite remis à l'outil (comme s'il venait du choix de fichier) : son import,
     * ses vérifications et ses messages restent les mêmes. Les formulaires d'import de Maintenance (form[id^="import-"]) aussi.
     * data-k-direct sur un champ fichier : le choix de fichier de l'ordinateur, sans la fenêtre. */
    const IMPORT_RX = /(^|[\s(«“"'])(importer|réimporter)\b|^\s*(⤒|📥)/i;
    let lastAct = {el: null, t: 0};
    const actEl = t => t?.closest?.('button, a, label, summary, [role="button"], [role="menuitem"], .ui-actmenu-i');
    ['pointerdown', 'click'].forEach(ty => document.addEventListener(ty, e => { const el = actEl(e.target); if (el) lastAct = {el, t: Date.now()}; }, true));
    document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && actEl(e.target)) lastAct = {el: actEl(e.target), t: Date.now()}; }, true);
    const nameOf = el => clean([el?.textContent, el?.getAttribute?.('title'), el?.getAttribute?.('aria-label'), el?.dataset?.tbLabel].filter(Boolean).join(' '));
    const isImportTrigger = el => !!el && IMPORT_RX.test(clean(el.textContent)) || !!el && IMPORT_RX.test(clean(el.getAttribute?.('aria-label') || el.dataset?.tbLabel || ''));
    const importForm = inp => inp.closest?.('form[id^="import-"], form[data-k-import]');
    function shouldFront(inp) {
        if (inp.type !== 'file' || inp.dataset.kDirect !== undefined || inp.closest('.k-import, [data-k-direct]') || !UI.openImportDialog) return false;
        if (importForm(inp)) return true;
        return Date.now() - lastAct.t < 1500 && isImportTrigger(lastAct.el) && !lastAct.el.closest('.k-import');
    }
    const human = n => (n >= 1048576 ? `${(n / 1048576).toLocaleString('fr-FR', {maximumFractionDigits: 1})} Mo` : `${Math.max(1, Math.round(n / 1024)).toLocaleString('fr-FR')} Ko`);
    /** un coup d'œil au fichier : combien de personnes (GEDCOM), de lignes (CSV), d'éléments (JSON)… */
    async function quickLook(files) {
        const f = files[0], ext = (f.name.split('.').pop() || '').toLowerCase(), size = files.reduce((a, x) => a + x.size, 0);
        const many = files.length > 1, base = {notices: [], extra: `<p class="k-import-meta">${esc(plural(files.length, 'fichier'))} · ${esc(human(size))}</p>`};
        if (many) { const kinds = new Set(files.map(x => (x.type || '').split('/')[0])); const noun = kinds.size === 1 && kinds.has('image') ? 'image' : kinds.size === 1 && kinds.has('audio') ? 'son' : kinds.size === 1 && kinds.has('video') ? 'vidéo' : 'fichier'; return {...base, count: files.length, noun, feminine: ['image', 'vidéo'].includes(noun)}; }
        if (/^(image|audio|video)\//.test(f.type)) { const noun = f.type.startsWith('image') ? 'image' : f.type.startsWith('audio') ? 'son' : 'vidéo'; return {...base, count: 1, noun, feminine: noun !== 'son'}; }
        if (f.size < 40e6 && /^(ged|gedcom|csv|tsv|txt|json|ris|bib|md|svg)$/.test(ext)) {
            let t = ''; try { t = await f.text(); } catch (_) {}
            if (/^ged(com)?$/.test(ext)) { const n = (t.match(/^\s*0\s+@[^@]+@\s+INDI\b/gm) || []).length, fam = (t.match(/^\s*0\s+@[^@]+@\s+FAM\b/gm) || []).length; return {...base, count: n, noun: 'personne', feminine: true, summaryHtml: `<b>${esc(plural(n, 'personne'))}</b>${fam ? `, ${esc(plural(fam, 'famille'))}` : ''}`}; }
            if (/^(csv|tsv|txt)$/.test(ext)) { const lines = t.split(/\r?\n/).filter(l => l.trim()); const n = Math.max(0, lines.length - 1); const head = lines[0] || ''; const sep = (head.match(/;/g) || []).length > (head.match(/,/g) || []).length ? ';' : ext === 'tsv' || head.includes('\t') ? '\t' : ',';
                const rows = lines.slice(0, 6).map(l => l.split(sep).slice(0, 8));
                return {...base, count: n, noun: 'ligne', feminine: true, summaryHtml: `<b>${esc(plural(n, 'ligne'))}</b> (sans la ligne des titres)`, preview: rows.length ? `<table><thead><tr>${rows[0].map(c => `<th>${esc(c.replace(/^"|"$/g, ''))}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(r => `<tr>${r.map(c => `<td>${esc(c.replace(/^"|"$/g, ''))}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}; }
            if (ext === 'json') { let j = null; try { j = JSON.parse(t); } catch (_) { return {...base, ok: false, count: 0, summaryHtml: 'Ce fichier .json est abîmé : il ne peut pas être lu.'}; }
                if (j?.lcnda === 'reglage') return {...base, count: 1, noun: 'réglage', summaryHtml: `le réglage <b>« ${esc(j.nom || 'sans nom')} »</b>`};
                const arr = Array.isArray(j) ? j : Object.values(j || {}).find(Array.isArray);
                const nm = j?.title || j?.name || j?.nom || j?.label;
                return {...base, count: arr ? arr.length : 1, noun: 'élément', summaryHtml: nm ? `<b>« ${esc(String(nm).slice(0, 80))} »</b>${arr ? ` (${esc(plural(arr.length, 'élément'))})` : ''}` : arr ? `<b>${esc(plural(arr.length, 'élément'))}</b>` : '<b>un fichier de réglages ou de données</b>'}; }
        }
        return {...base, count: 1, noun: 'fichier', summaryHtml: `<b>« ${esc(f.name)} »</b>`};
    }
    function frontImport(inp, trigger) {
        const form = importForm(inp), sub = form?.querySelector('button[type="submit"], button:not([type])');
        let title = clean(nameOf(trigger).replace(EMO, '').replace(/[…:]+\s*$/, '').replace(/\s*\(.*?\)\s*$/, m => m)) || '';
        if (form) { const h3 = form.closest('section')?.querySelector('h3'), h = clean(h3 ? [...h3.childNodes].filter(x => x.nodeType === 3).map(x => x.textContent).join(' ') : '').replace(/\s*[—-]\s*Import\s*$/i, ''); const h2 = clean(form.closest('dialog')?.querySelector('.modal-head h2')?.textContent || ''); title = h ? `Importer : ${h}` : h2 && /^importer/i.test(h2) ? h2 : h2 ? `Importer : ${h2}` : 'Importer un fichier'; }
        if (!/^(importer|réimporter)/i.test(title)) title = title ? `Importer — ${title}` : 'Importer un fichier';
        let chosen = false;
        UI.openImportDialog({title: title.replace(/^importer\b/i, 'Importer').slice(0, 80), accept: inp.accept || '', multiple: inp.multiple,
            analyze: files => quickLook(files),
            goLabel: sub ? () => `⤒ ${clean(sub.textContent).replace(EMO, '')}` : undefined,
            run: async (an, files) => {
                chosen = true;
                const dt = new DataTransfer(); files.forEach(f => dt.items.add(f)); inp.files = dt.files;
                inp.dispatchEvent(new Event('input', {bubbles: true})); inp.dispatchEvent(new Event('change', {bubbles: true}));
                if (form) form.requestSubmit ? form.requestSubmit(sub || undefined) : form.dispatchEvent(new Event('submit', {cancelable: true, bubbles: true}));
                return {message: ''}; // l'outil dit lui-même ce qui est entré
            }}).then(() => { if (!chosen) inp.dispatchEvent(new Event('cancel')); });
    }
    const nativeClick = HTMLInputElement.prototype.click, nativePicker = HTMLInputElement.prototype.showPicker;
    HTMLInputElement.prototype.click = function () { if (this.type === 'file' && shouldFront(this)) { frontImport(this, lastAct.el); return; } return nativeClick.call(this); };
    if (nativePicker) HTMLInputElement.prototype.showPicker = function () { if (this.type === 'file' && shouldFront(this)) { frontImport(this, lastAct.el); return; } return nativePicker.call(this); };
    // un clic sur une étiquette « Importer… » qui contient le champ fichier (ou un champ fichier visible d'un formulaire d'import)
    document.addEventListener('click', e => {
        const lab = e.target.closest?.('label'); const inp = e.target.matches?.('input[type=file]') ? e.target : lab ? (lab.control?.type === 'file' ? lab.control : lab.querySelector('input[type=file]')) : null;
        if (!inp || inp.closest('.k-import') || inp.dataset.kDirect !== undefined || !UI.openImportDialog) return;
        if (!(importForm(inp) || isImportTrigger(lab || inp))) return;
        e.preventDefault(); e.stopPropagation(); frontImport(inp, lab || inp);
    }, true);
    const app = window.LCNDA_APP = window.LCNDA_APP || {};
    app.openPrintDialog = (...a) => UI.openPrintDialog(...a); app.printPage = (...a) => UI.printPage(...a); app.openImportDialog = (...a) => UI.openImportDialog(...a);
})();
