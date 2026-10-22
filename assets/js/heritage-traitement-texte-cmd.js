/**
 * 📝 Traitement de texte — les commandes : clavier, souris, collage nettoyé, mise en forme (caractère, paragraphe, styles,
 * listes, casse), tableaux (lignes, colonnes, fusion, en-tête répété, tri), suivi des modifications (insertions et
 * suppressions de chacun, accepter, refuser), commentaires (répondre, résoudre), panneau E2, barre du bas (K18).
 * L'éditeur est dans heritage-traitement-texte.js ; les insertions, outils et fichiers dans heritage-traitement-texte-outils.js.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const T = () => window.LCNDA_TEXT;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const K = () => ext.textDocKit;
    const esc = v => A().escapeHtml(v ?? '');
    const toast = (...a) => A().toast(...a);
    const kbd = k => (A()?.keys?.text ? A().keys.text(k) : k);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
    const nid = p => T().nid(p);
    const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const wait = setInterval(() => { if (!ext.textDocKit?.Editor) return; clearInterval(wait); install(); }, 30);

    function install() {
        const {Editor, cleanHtml, pref, prefs, setPrefs, blockOf, LANGS, FONTS, SIZES} = K();
        Object.assign(Editor.prototype, {
            /* ═════════ Écouter ═════════ */
            bind() {
                const dlg = this.dlg;
                dlg.addEventListener('cancel', e => { e.preventDefault(); if (this.picked) return this.unpick(); if (!this.$('[data-wp-findbar]').hidden) return this.run('findclose'); if (this.reading) return this.run('stopread'); });
                dlg.addEventListener('close', () => { this.closed = true; clearInterval(this.autosaveTimer); try { speechSynthesis.cancel(); } catch (_) {} this.ctx.onClose?.(this.id); dlg.remove(); const k = K(); k.open = (k.open || []).filter(x => x !== this && !x.closed); if (k.current === this) k.current = k.open[k.open.length - 1] || null; });
                dlg.addEventListener('click', e => {
                    const b = e.target.closest('[data-wp-cmd], [data-ui-cmd]'); if (!b || b.disabled) return;
                    if (b.closest('.wp-body')) return;
                    e.preventDefault();
                    b.closest('details')?.removeAttribute('open');
                    if (b.dataset.uiCmd === 'undo') return this.undo(); if (b.dataset.uiCmd === 'redo') return this.redo();
                    if (b.dataset.wpCmd) this.run(b.dataset.wpCmd, b);
                });
                // les menus du haut : un seul ouvert à la fois, fermés par un clic ailleurs
                dlg.addEventListener('toggle', e => { if (e.target.matches?.('details.wp-menu[open]')) this.$$('details.wp-menu[open]').forEach(d => { if (d !== e.target) d.removeAttribute('open'); }); }, true);
                dlg.addEventListener('pointerdown', e => { if (!e.target.closest('details.wp-menu')) this.$$('details.wp-menu[open]').forEach(d => d.removeAttribute('open')); });
                // garder la sélection quand on clique dans une barre (sinon les boutons ne savent plus sur quoi agir)
                this.$('.wp-tools').addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
                this.$('[data-wp-name]').addEventListener('change', e => { const v = e.target.value.trim().slice(0, 200) || 'Mon document'; if (v === this.name) return; this.name = v; this.touch(); this.paintSheets(); });
                this.$('[data-wp-style]').addEventListener('change', e => { this.restoreSel(); const v = e.target.value; if (v.startsWith('c:')) this.charStyle(v.slice(2)); else this.setStyle(v); this.focusBack(); });
                this.$('[data-wp-size]').addEventListener('change', e => { this.restoreSel(); this.styleRange(sp => { sp.style.fontSize = `${clamp(e.target.value, 4, 144)}pt`; }); this.focusBack(); });
                const scroll = this.scroll;
                scroll.addEventListener('scroll', () => { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.paintStatus(); }); }, {passive: true});
                new ResizeObserver(() => { if (this.zoomMode === 'fit') this.layoutSoon(60); }).observe(scroll);
                // le texte
                this.docEl.addEventListener('beforeinput', e => this.onBeforeInput(e));
                this.docEl.addEventListener('input', e => this.onInput(e));
                this.docEl.addEventListener('paste', e => this.onPaste(e));
                this.docEl.addEventListener('click', e => this.onClick(e));
                this.docEl.addEventListener('dblclick', e => { const hf = e.target.closest('[data-wp-hf]'); if (hf) { e.preventDefault(); this.run('headfoot'); } });
                this.docEl.addEventListener('contextmenu', e => this.onContext(e));
                this.docEl.addEventListener('mousedown', e => this.onDown(e));
                this.docEl.addEventListener('focusin', e => { const b = e.target.closest('.wp-body'); if (b) this.lastBody = b; });
                this.docEl.addEventListener('load', e => { if (e.target.tagName === 'IMG') this.layoutSoon(60); }, true);
                dlg.addEventListener('keydown', e => this.onKey(e));
                this.onSel = () => { const r = this.sel(); if (!r) return; this.lastRange = r.cloneRange(); this.lastBody = this.secOf(r.startContainer)?.body || this.lastBody; clearTimeout(this.syncT); this.syncT = setTimeout(() => { this.syncTools(); this.paintStatus(); this.syncPanel?.(); }, 60); };
                document.addEventListener('selectionchange', this.onSel);
                dlg.addEventListener('close', () => document.removeEventListener('selectionchange', this.onSel));
            },
            restoreSel() { if (this.sel() || !this.lastRange) return; try { const s = getSelection(); s.removeAllRanges(); s.addRange(this.lastRange); } catch (_) {} },
            focusBack() { const b = this.lastBody || this.secs[0]?.body; if (!b) return; b.focus({preventScroll: true}); this.restoreSel(); },
            onBeforeInput(e) {
                const t = e.inputType;
                if (t === 'historyUndo') { e.preventDefault(); return this.undo(); }
                if (t === 'historyRedo') { e.preventDefault(); return this.redo(); }
                if (this.typeT && /^(insertParagraph|deleteByCut|insertFromDrop)/.test(t)) this.commit();
                if (this.doc.track && e.target.closest?.('.wp-body')) this.trackInput(e);
            },
            onInput(e) {
                const r = this.sel(), body = r ? this.secOf(r.startContainer)?.body : null;
                if (body) {
                    // un paragraphe tout neuf : un style ; après un titre, le paragraphe suivant reprend « Normal »
                    body.querySelectorAll('p:not([data-st]), h1:not([data-st]), h2:not([data-st]), h3:not([data-st]), li:not([data-st]), div:not([class])').forEach(p => { if (p.tagName === 'DIV') { const np = this.retag(p, 'P'); np.dataset.st = 'normal'; return; } p.dataset.st = /^H[1-6]$/.test(p.tagName) ? p.tagName.toLowerCase() : 'normal'; });
                    if (e.inputType === 'insertParagraph') { const cur = blockOf(r.startContainer, body), prev = cur?.previousElementSibling; if (cur && prev && /^(h[1-6]|title|subtitle|caption)$/.test(cur.dataset.st || '') && !cur.textContent.trim()) { const np = cur.tagName === 'LI' ? cur : this.retag(cur, 'P'); np.dataset.st = 'normal'; np.removeAttribute('data-keep'); const rr = document.createRange(); rr.setStart(np, 0); rr.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(rr); } if (cur?.dataset.drop && prev?.dataset.drop) cur.removeAttribute('data-drop'); }
                    body.querySelectorAll(':scope > br, :scope > span, :scope > b, :scope > i').forEach(n => { const p = document.createElement('p'); p.dataset.st = 'normal'; n.before(p); p.appendChild(n); });
                    if (!body.firstElementChild) body.innerHTML = '<p data-st="normal"><br></p>';
                    body.querySelectorAll('ul > ul, ul > ol, ol > ul, ol > ol').forEach(x => { const prev = x.previousElementSibling; if (prev?.tagName === 'LI') prev.appendChild(x); });
                    body.querySelectorAll('p > ul, p > ol').forEach(l => { const p = l.parentElement; p.after(l); if (!p.textContent.trim() && !p.querySelector('img, sup')) p.remove(); });
                    body.querySelectorAll('li > li').forEach(li => li.parentElement.after(li));
                    body.querySelectorAll('font').forEach(f => { const s = document.createElement('span'); if (f.color) s.style.color = f.color; if (f.face) s.style.fontFamily = f.face; s.append(...f.childNodes); f.replaceWith(s); });
                }
                if (/^(insertParagraph|insertFromPaste|deleteByCut|insertFromDrop|formatSetBlockTextDirection)$/.test(e.inputType) || /^delete/.test(e.inputType) && !this.sel()?.collapsed) this.commit(); else this.commitSoon();
                this.touch(); this.layoutSoon(90);
            },
            /* ═════════ Le clavier ═════════ */
            onKey(e) {
                const mod = e.metaKey || e.ctrlKey, k = e.key.length === 1 ? e.key.toLowerCase() : e.key, inBody = !!e.target.closest?.('.wp-body'), inField = !inBody && e.target.matches?.('input, textarea, select, [contenteditable]');
                const go = (cmd, arg) => { e.preventDefault(); e.stopPropagation(); this.run(cmd, arg); };
                if (mod && e.shiftKey && (k === 'v')) { this.plainPaste = true; setTimeout(() => { this.plainPaste = false; }, 400); return; }
                if (mod && !e.altKey) {
                    if (k === 's') return go('save'); if (k === 'p') return go('print'); if (k === 'o') return go('import');
                    if (k === 'z' && !inField) return go(e.shiftKey ? 'redo' : 'undo'); if (k === 'y' && !inField) return go('redo');
                    if (inField) return;
                    if (k === 'f') return go('find'); if (k === 'h' && e.shiftKey) return go('replace');
                    if (k === 'b') return go('bold'); if (k === 'i') return go('italic'); if (k === 'u') return go('underline'); if (k === 'k') return go(e.shiftKey ? 'smallcaps' : 'link');
                    if (k === 'x' && e.shiftKey) return go('strike'); if (k === '.') return go('sup'); if (k === ',') return go('sub'); if (k === '\\') return go('clearfmt');
                    if (k === ']') return go('indent'); if (k === '[') return go('outdent');
                    if (k === 'Enter') return go('pagebreak');
                    if (e.shiftKey && (e.code === 'Digit8' || k === '*')) return go('ul'); if (e.shiftKey && (e.code === 'Digit7' || k === '/')) return go('ol');
                    if (e.shiftKey && k === 'l') return go('al:left'); if (e.shiftKey && k === 'e') return go('al:center'); if (e.shiftKey && k === 'r') return go('al:right'); if (e.shiftKey && k === 'j') return go('al:justify');
                    if (e.shiftKey && k === 'p') return go('person');
                }
                if (mod && e.altKey && !inField) {
                    const d = /^Digit([0-6])$/.exec(e.code); if (d) return go('style', d[1] === '0' ? 'normal' : 'h' + d[1]);
                    if (e.code === 'KeyF') return go('footnote'); if (e.code === 'KeyD') return go('endnote'); if (e.code === 'KeyM') return go('comment'); if (e.code === 'KeyT') return go('track'); if (e.code === 'KeyE') return go('export'); if (e.code === 'KeyG') return go('goto'); if (e.code === 'Digit8') return go('marks');
                }
                if (!inBody) return;
                if (this.picked && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); const f = this.picked; this.unpick(); f.remove(); this.commit(); this.layoutSoon(0); return; }
                if ((e.key === 'Enter' && !e.shiftKey && !mod) || (e.key === 'Backspace' && !mod)) {
                    const r = this.sel(); const li = r && r.collapsed ? blockOf(r.startContainer, this.secOf(r.startContainer).body) : null;
                    if (li?.tagName === 'LI') { const own = li.cloneNode(true); own.querySelectorAll('ul, ol').forEach(x => x.remove()); const empty = !own.textContent.replace(/\u200b/g, '').trim() && !own.querySelector('img, sup');
                        const atStart = (() => { const rr = document.createRange(); rr.setStart(li, 0); rr.setEnd(r.startContainer, r.startOffset); return !rr.toString().length; })();
                        if ((e.key === 'Enter' && empty) || (e.key === 'Backspace' && atStart && !this.doc.track)) { e.preventDefault(); this.commit(); const out = this.outdentLi(li) || li; const rr = document.createRange(); rr.selectNodeContents(out); rr.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(rr); this.lastRange = rr; this.normalize(this.secOf(out).body); this.commit(); this.layoutSoon(0); return; } }
                }
                if (e.key === 'Tab') {
                    const cell = this.cell();
                    if (cell) { e.preventDefault(); return this.moveCell(e.shiftKey ? -1 : 1); }
                    const b = this.selBlocks()[0]; if (b?.tagName === 'LI') { e.preventDefault(); return this.run(e.shiftKey ? 'outdent' : 'indent'); }
                    if (!e.shiftKey) { e.preventDefault(); document.execCommand('insertText', false, '\t'); }
                }
            },
            /* ═════════ La souris ═════════ */
            onClick(e) {
                const fn = e.target.closest('sup.wp-fn'); if (fn) { e.preventDefault(); return this.editNote(fn); }
                const go = e.target.closest('[data-goto-fn]'); if (go) { const s = this.docEl.querySelector(`sup.wp-fn[data-fn="${CSS.escape(go.dataset.gotoFn)}"]`); if (s) { s.scrollIntoView({block: 'center'}); this.editNote(s); } return; }
                const gl = e.target.closest('.wp-gen-l[data-goto]'); if (gl) { const h = this.headings?.[Number(gl.dataset.goto)]; if (h?.el) { h.el.scrollIntoView({block: 'start'}); } return; }
                const a = e.target.closest('.wp-body a'); if (a) { e.preventDefault(); if (e.metaKey || e.ctrlKey) return this.openLink(a); return this.linkMenu(a, e); }
                const fig = e.target.closest('figure.wp-fig, img.wp-inl'); if (fig && !e.target.closest('figcaption')) { e.preventDefault(); return this.pick(fig.closest('figure.wp-fig') || fig); }
                const cm = e.target.closest('.wp-cm'); if (cm) this.showComment(cm.dataset.cm);
                if (this.picked && !e.target.closest('.wp-h')) this.unpick();
            },
            openLink(a) {
                if (a.dataset.wpPerson) { this.dlg.close; return ext.textDocTools?.openPerson?.(Number(a.dataset.wpPerson)); }
                if (a.dataset.wpPlace) return ext.textDocTools?.openPlace?.(Number(a.dataset.wpPlace));
                const h = a.getAttribute('href') || ''; if (/^https?:\/\/|^mailto:/i.test(h)) window.open(h, '_blank', 'noopener');
            },
            linkMenu(a, e) {
                const items = [{icon: '↗', label: a.dataset.wpPerson ? 'Ouvrir la fiche' : a.dataset.wpPlace ? 'Ouvrir le lieu' : 'Ouvrir le lien', shortcut: '⌘Clic', run: () => this.openLink(a)}];
                if (!a.dataset.wpPerson && !a.dataset.wpPlace) items.push({icon: '✎', label: 'Modifier le lien…', run: () => { const r = document.createRange(); r.selectNodeContents(a); getSelection().removeAllRanges(); getSelection().addRange(r); this.lastRange = r; this.run('link'); }});
                if (a.dataset.wpPerson) items.push({icon: '#', label: 'Afficher : nom, dates, naissance…', run: () => ext.textDocTools?.personPart?.(this, a)});
                items.push('-', {icon: '×', label: 'Retirer le lien (garder le texte)', run: () => { a.replaceWith(...a.childNodes); this.commit(); }});
                UI().contextMenu({clientX: e.clientX, clientY: e.clientY, preventDefault() {}}, items, {title: a.textContent.trim().slice(0, 40)});
            },
            onContext(e) {
                if (e.shiftKey) return;
                const fig = e.target.closest('figure.wp-fig, img.wp-inl'); if (!fig) return; // le texte garde le menu du navigateur (orthographe)
                e.preventDefault(); const f = fig.closest('figure.wp-fig') || fig; this.pick(f);
                const wrap = w => () => { if (f.tagName !== 'FIGURE') return; f.dataset.wrap = w; if (w === 'square' && f.dataset.align === 'center') f.dataset.align = 'left'; this.commit(); this.layoutSoon(0); };
                const al = a => () => { if (f.tagName !== 'FIGURE') return; f.dataset.align = a; this.commit(); this.layoutSoon(0); };
                UI().contextMenu(e, [
                    {icon: '▣', label: 'Aligné sur le texte (seul sur sa ligne)', disabled: f.tagName !== 'FIGURE', run: wrap('topbottom')}, {icon: '◧', label: 'Carré (le texte autour)', disabled: f.tagName !== 'FIGURE', run: wrap('square')},
                    {icon: '⟸', label: 'À gauche', run: al('left')}, {icon: '≡', label: 'Centré', run: al('center')}, {icon: '⟹', label: 'À droite', run: al('right')}, '-',
                    {icon: '✎', label: f.querySelector?.('figcaption') ? 'Retirer la légende' : 'Ajouter une légende', disabled: f.tagName !== 'FIGURE', run: () => { const c = f.querySelector('figcaption'); if (c) c.remove(); else { const fc = document.createElement('figcaption'); fc.setAttribute('contenteditable', 'true'); fc.textContent = 'Légende'; f.appendChild(fc); } this.commit(); this.layoutSoon(0); }},
                    {icon: '↔', label: 'Taille…', run: () => this.imageSize(f)}, {icon: '🖼', label: 'Changer l’image…', run: () => ext.textDocTools?.run(this, 'image', {replace: f})}, '-',
                    {icon: '🗑', label: 'Supprimer l’image', danger: true, shortcut: '⌫', run: () => { this.unpick(); f.remove(); this.commit(); this.layoutSoon(0); this.undoable('Image supprimée'); }}]);
            },
            /** une image choisie : poignées pour la taille (carrés blancs au bord bleu, K20) */
            pick(f) {
                this.unpick(); this.picked = f; f.classList.add('is-picked');
                if (f.tagName === 'FIGURE') { ['se', 'sw', 'e'].forEach(h => { const d = document.createElement('span'); d.className = 'wp-h'; d.dataset.h = h; d.contentEditable = 'false'; f.appendChild(d); }); }
                this.status?.flash('Image choisie : tire un coin pour la taille, clic droit pour l’habillage, ⌫ pour la supprimer.');
            },
            unpick() { const f = this.picked; if (!f) return; f.classList.remove('is-picked'); f.querySelectorAll?.('.wp-h').forEach(x => x.remove()); if (!f.getAttribute('class')) f.removeAttribute('class'); this.picked = null; },
            onDown(e) {
                const h = e.target.closest('.wp-h');
                if (h && this.picked) { e.preventDefault(); const f = this.picked, x0 = e.clientX, w0 = f.getBoundingClientRect().width / this.zoom, max = f.closest('.wp-body').clientWidth, dir = h.dataset.h === 'sw' ? -1 : 1;
                    const mv = ev => { f.style.width = `${Math.round(clamp(w0 + dir * (ev.clientX - x0) / this.zoom, 24, max))}px`; };
                    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); this.commit(); this.layoutSoon(0); };
                    addEventListener('pointermove', mv); addEventListener('pointerup', up); return; }
                // plusieurs cases d'un tableau : glisser de l'une à l'autre
                const td = e.target.closest('.wp-body td, .wp-body th');
                this.docEl.querySelectorAll('.is-sel').forEach(c => c.classList.remove('is-sel'));
                if (td && !e.shiftKey) { this.cellStart = td; const mv = ev => { const o = ev.target.closest?.('td, th'); if (!o || o === this.cellStart || o.closest('table') !== td.closest('table')) return; this.selectCells(td, o); };
                    const up = () => { this.docEl.removeEventListener('mouseover', mv); removeEventListener('mouseup', up); }; this.docEl.addEventListener('mouseover', mv); addEventListener('mouseup', up); }
            },
            /* ═════════ Coller (nettoyé) ═════════ */
            async onPaste(e) {
                const body = e.target.closest?.('.wp-body'); if (!body) return;
                e.preventDefault();
                const cd = e.clipboardData, html = cd.getData('text/html'), text = cd.getData('text/plain'), files = [...(cd.files || [])].filter(f => /^image\//.test(f.type));
                if (files.length && !text) { for (const f of files) await ext.textDocTools?.insertImageFile?.(this, f); return; }
                this.commit();
                if (html && !this.plainPaste && pref('pasteMode', 'keep') !== 'text') {
                    const src = /urn:schemas-microsoft-com:office|class="?Mso|mso-/i.test(html) ? 'word' : /docs-internal-guid|id="docs-internal/i.test(html) ? 'gdocs' : /data-st="|class="wp-/.test(html) ? '' : /<meta name="?generator"? content="?LibreOffice/i.test(html) ? 'gdocs' : 'web';
                    const c = cleanHtml(html.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '').replace(/^[\s\S]*?<body[^>]*>|<\/body>[\s\S]*$/gi, ''), {paste: src});
                    this.insertHtml(c.html);
                    if (c.extImg) toast(`${c.extImg > 1 ? `${c.extImg} images du web n’ont pas été reprises` : 'Une image du web n’a pas été reprise'} : enregistre-la sur l’ordinateur, puis glisse-la ici.`);
                } else this.insertText(text);
                this.commit(); this.layoutSoon(0);
                ext.textDocTools?.adoptImages?.(this);
            },
            insertText(text) {
                const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
                if (lines.length === 1) { if (this.doc.track) return this.trackInsert(lines[0]); document.execCommand('insertText', false, lines[0]); return; }
                this.insertHtml(lines.map(l => `<p data-st="normal">${l ? esc(l) : '<br>'}</p>`).join(''));
            },
            /** pose du HTML (déjà nettoyé) au curseur : des paragraphes coupent le paragraphe en deux */
            insertHtml(html) {
                this.restoreSel(); const r = this.sel(); if (!r) return; const sec = this.secOf(r.startContainer), body = sec.body;
                if (!r.collapsed) { if (this.doc.track) { this.markDeleted(r); r.collapse(false); } else r.deleteContents(); }
                const tpl = document.createElement('template'); tpl.innerHTML = html;
                const frag = tpl.content; if (this.doc.track) frag.querySelectorAll('*').forEach(() => {});
                if (this.doc.track) { const ins = document.createElement('ins'); ins.className = 'wp-ins'; Object.assign(ins.dataset, {tc: nid('t'), a: this.author, t: now()}); }
                const blocks = [...frag.childNodes].some(n => n.nodeType === 1 && /^(P|H[1-6]|UL|OL|TABLE|FIGURE|HR|DIV|BLOCKQUOTE|PRE)$/.test(n.tagName));
                const host = blockOf(r.startContainer, body);
                if (blocks && host && /^(TD|TH|FIGCAPTION|LI)$/.test(host.tagName) && [...frag.childNodes].some(n => n.nodeType === 1 && /^(TABLE|FIGURE|HR|DIV)$/.test(n.tagName))) {
                    let top = host; while (top.parentNode && top.parentNode !== body && !top.parentNode.matches?.('.wp-cols')) top = top.parentNode;
                    let ref = top; [...frag.childNodes].forEach(n => { if (n.nodeType === 3 && !n.data.trim()) return; let x = n; if (n.nodeType !== 1 || !/^(P|H[1-6]|UL|OL|TABLE|FIGURE|HR|DIV)$/.test(n.tagName)) { x = document.createElement('p'); x.dataset.st = 'normal'; x.appendChild(n); } ref.after(x); ref = x; });
                    const p2 = document.createElement('p'); p2.dataset.st = 'normal'; p2.innerHTML = '<br>'; if (!ref.nextElementSibling) ref.after(p2);
                    const rr = document.createRange(); const cell = ref.matches?.('table') ? ref.querySelector('td, th') : ref; rr.selectNodeContents(cell || ref); rr.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(rr); this.lastRange = rr; this.normalize(body); return;
                }
                if (!blocks || !host || /^(TD|TH|FIGCAPTION|LI)$/.test(host.tagName)) {
                    const inline = blocks ? [...frag.childNodes].map(n => (n.nodeType === 1 && /^(P|H[1-6]|LI|DIV)$/.test(n.tagName) ? n.innerHTML : n.nodeType === 1 ? n.textContent : esc(n.textContent))).join('<br>') : html;
                    const t2 = document.createElement('template'); t2.innerHTML = this.doc.track ? `<ins class="wp-ins" data-tc="${nid('t')}" data-a="${esc(this.author)}" data-t="${now()}">${inline}</ins>` : inline;
                    const last = t2.content.lastChild; r.insertNode(t2.content); if (last) { const rr = document.createRange(); rr.setStartAfter(last); rr.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(rr); }
                    this.normalize(body); return;
                }
                // couper le paragraphe au curseur
                const after = document.createRange(); after.setStart(r.startContainer, r.startOffset); after.setEnd(host, host.childNodes.length);
                const tail = after.extractContents(); const host2 = host.cloneNode(false); host2.appendChild(tail);
                const nodes = [...frag.childNodes]; let ref = host;
                nodes.forEach(n => { if (n.nodeType === 3 && !n.data.trim()) return; let x = n; if (n.nodeType !== 1 || !/^(P|H[1-6]|UL|OL|TABLE|FIGURE|HR|DIV|BLOCKQUOTE|PRE)$/.test(n.tagName)) { x = document.createElement('p'); x.dataset.st = 'normal'; x.appendChild(n); } if (this.doc.track && /^(P|H[1-6])$/.test(x.tagName)) { const ins = document.createElement('ins'); ins.className = 'wp-ins'; Object.assign(ins.dataset, {tc: nid('t'), a: this.author, t: now()}); ins.append(...x.childNodes); x.appendChild(ins); } ref.after(x); ref = x; });
                if (host2.textContent.trim() || host2.querySelector('img, sup')) ref.after(host2);
                if (!host.textContent.trim() && !host.querySelector('img, sup, br + *')) host.remove();
                const isT = ref.matches?.('table, figure, hr'), lastEl = ref.matches?.('table') ? ref.querySelector('td, th') : isT ? (ref.nextElementSibling || ref) : ref; const rr = document.createRange(); rr.selectNodeContents(lastEl); rr.collapse(!!ref.matches?.('table')); getSelection().removeAllRanges(); getSelection().addRange(rr); this.lastRange = rr;
                this.normalize(body);
            },
            /* ═════════ Les commandes ═════════ */
            run(cmd, arg) {
                const [c, v] = String(cmd).split(':');
                const exec = (name, val = null) => { this.restoreSel(); this.focusBack(); if (this.doc.track && /^(bold|italic|underline|strikeThrough|superscript|subscript)$/.test(name)) { /* la mise en forme n'est pas suivie : elle s'applique */ } document.execCommand('styleWithCSS', false, false); document.execCommand(name, false, val); this.commit(); this.syncTools(); this.layoutSoon(); };
                switch (c) {
                    case 'undo': return this.undo(); case 'redo': return this.redo();
                    case 'bold': return exec('bold'); case 'italic': return exec('italic'); case 'underline': return exec('underline'); case 'strike': return exec('strikeThrough');
                    case 'sup': return exec('superscript'); case 'sub': return exec('subscript');
                    case 'smallcaps': return this.styleRange(sp => { sp.style.fontVariant = sp.style.fontVariant === 'small-caps' ? '' : 'small-caps'; }, {toggle: 'fontVariant'});
                    case 'cut': this.focusBack(); return document.execCommand('cut') || toast(`Utilise ${kbd('⌘X')}.`);
                    case 'copy': this.focusBack(); return document.execCommand('copy') || toast(`Utilise ${kbd('⌘C')}.`);
                    case 'paste': case 'pasteplain': this.focusBack(); return navigator.clipboard?.readText ? navigator.clipboard.readText().then(t => { this.commit(); this.insertText(t); this.commit(); this.layoutSoon(0); }).catch(() => toast(`Utilise ${kbd(c === 'paste' ? '⌘V' : '⇧⌘V')} dans le texte.`)) : toast(`Utilise ${kbd('⌘V')}.`);
                    case 'selectall': { this.focusBack(); const b = this.curBody(); const r = document.createRange(); r.selectNodeContents(b); getSelection().removeAllRanges(); getSelection().addRange(r); return; }
                    case 'al': return this.paraStyle(p => { p.style.textAlign = v === 'left' ? '' : v; });
                    case 'ul': return exec('insertUnorderedList'); case 'ol': return exec('insertOrderedList');
                    case 'indent': case 'outdent': { const bs = this.selBlocks(); if (bs.some(b => b.tagName === 'LI')) { const pos = this.selPos(); bs.filter(b => b.tagName === 'LI').forEach(li => (c === 'indent' ? this.indentLi(li) : this.outdentLi(li))); this.normalize(this.curBody() || this.secs[0].body); this.setSelPos(pos); this.commit(); return this.layoutSoon(0); } return this.paraStyle(p => { const m = parseFloat(p.style.marginLeft) || 0, mm = p.style.marginLeft.endsWith('mm') ? m : m / K().MM; const n = Math.max(0, Math.round((mm + (c === 'indent' ? 12.5 : -12.5)) * 10) / 10); p.style.marginLeft = n ? `${n}mm` : ''; }); }
                    case 'style': return this.setStyle(v || arg);
                    case 'clearfmt': { this.restoreSel(); this.focusBack(); document.execCommand('removeFormat'); const r = this.sel(); if (r) this.secOf(r.startContainer).body.querySelectorAll('span[data-cs], span[style]').forEach(s => { if (r.intersectsNode(s) && !s.matches('.wp-field, .wp-cm')) s.replaceWith(...s.childNodes); }); this.selBlocks().forEach(p => { p.removeAttribute('style'); p.removeAttribute('data-drop'); }); this.commit(); this.layoutSoon(); this.syncTools(); return; }
                    case 'font': return UI().openFontPicker({value: this.curFont(), sample: this.sel()?.toString().trim().slice(0, 40) || 'Louise Borie, née en 1850'}).then(f => { if (!f) return; this.focusBack(); this.styleRange(sp => { sp.style.fontFamily = `'${T().fontOk(f)}'`; }); });
                    case 'color': case 'highlight': return this.colorBox(c, arg);
                    case 'case': return this.changeCase(v);
                    case 'dropcap': return this.paraStyle(p => { if (p.dataset.drop) p.removeAttribute('data-drop'); else p.dataset.drop = '1'; });
                    case 'linemenu': return UI().menuAt(arg && arg.isConnected ? arg : this.$('[data-wp-cmd="linemenu"]'), [...[1, 1.15, 1.4, 1.5, 2, 2.5, 3].map(n => ({icon: ' ', label: `Interligne ${String(n).replace('.', ',')}`, run: () => this.paraStyle(p => { p.style.lineHeight = String(n); })})), '-', {icon: '＋', label: 'Espace avant le paragraphe', run: () => this.paraStyle(p => { p.style.marginTop = `${(parseFloat(p.style.marginTop) || 0) + 6}pt`; })}, {icon: '−', label: 'Retirer l’espace avant', run: () => this.paraStyle(p => { p.style.marginTop = '0pt'; })}, {icon: '＋', label: 'Espace après le paragraphe', run: () => this.paraStyle(p => { p.style.marginBottom = `${(parseFloat(p.style.marginBottom) || 6) + 6}pt`; })}, {icon: '−', label: 'Retirer l’espace après', run: () => this.paraStyle(p => { p.style.marginBottom = '0pt'; })}, '-', {icon: '¶', label: 'Paragraphe…', run: () => this.run('paragraph')}], {title: 'Interligne et espacement'});
                    case 'track': this.doc.track = !this.doc.track; this.applyView(); this.touch(); this.paintPanel?.(); this.status?.flash(this.doc.track ? '✍ Les modifications sont suivies : chaque ajout et chaque suppression restent visibles.' : 'Les modifications ne sont plus suivies.'); return;
                    case 'tcshow': return UI().menuAt(arg && arg.isConnected ? arg : {x: innerWidth / 2, y: 140}, [['all', 'Tout montrer (ajouts et suppressions)'], ['simple', 'Simple (une marge à côté des ajouts)'], ['none', 'Rien (le texte comme s’il était accepté)']].map(([k, l]) => ({icon: this.tcShow === k ? '✓' : ' ', label: l, run: () => { this.tcShow = k; setPrefs({...prefs(), tcShow: k}); this.layout(); }})), {title: 'Montrer les modifications'});
                    case 'accept': case 'reject': return this.resolveChange(c === 'accept', false);
                    case 'acceptall': case 'rejectall': return this.resolveChange(c === 'acceptall', true);
                    case 'tcnext': case 'tcprev': return this.gotoChange(c === 'tcnext' ? 1 : -1);
                    case 'comment': return this.addComment();
                    case 'comments': case 'panel': if (v) return this.showPanel(v); return this.showPanel(this.$('[data-wp-panel]').hidden ? (this.panelTab || 'format') : null);
                    case 'nav': return this.toggleNav();
                    case 'view': this.view = v === 'draft' ? 'draft' : 'page'; setPrefs({...prefs(), view: this.view}); this.applyView(); return this.layout();
                    case 'ribbon': setPrefs({...prefs(), ribbon: !pref('ribbon', false)}); this.$('.wp').classList.toggle('is-ribbon', !!pref('ribbon', false)); this.applyView(); return this.layoutSoon(0);
                    case 'marks': setPrefs({...prefs(), marks: !pref('marks', false)}); this.applyView(); return this.layout();
                    case 'showcm': setPrefs({...prefs(), showcm: pref('showcm', true) === false}); this.applyView(); return this.layout();
                    case 'spell': setPrefs({...prefs(), spell: pref('spell', true) === false}); this.bodies().forEach(b => this.spellOn(b)); this.applyView(); return this.status?.flash(pref('spell', true) !== false ? 'Les mots mal écrits sont soulignés en rouge (clic droit pour les corrections).' : 'Vérification de l’orthographe arrêtée.');
                    case 'zoomfit': return this.setZoom(0, 'fit'); case 'zoom100': return this.setZoom(1, 'manual');
                    case 'help': return A().openFaq ? A().openFaq('traitement de texte') : (window.location.hash = '#faq');
                    case 'close': return this.close();
                    case 'save': return this.save();
                    case 'headrow': case 'tborders': case 'rowabove': case 'rowbelow': case 'colleft': case 'colright': case 'delrow': case 'delcol': case 'deltable': case 'merge': case 'split': case 'cellbg': case 'sortaz': case 'sortza': return this.tableCmd(c, arg);
                    case 'paragraph': return this.paraDialog();
                    case 'border': return this.borderDialog();
                    case 'styles': return this.showPanel('format', 'styles');
                    default: return ext.textDocTools?.run(this, cmd, arg);
                }
            },
            /** les niveaux d'une liste, sans compter sur le navigateur */
            indentLi(li) {
                const prev = li.previousElementSibling; if (!prev || prev.tagName !== 'LI') return;
                let sub = [...prev.children].reverse().find(x => /^(UL|OL)$/.test(x.tagName)); if (!sub) { sub = document.createElement(li.parentElement.tagName); prev.appendChild(sub); }
                sub.appendChild(li);
            },
            outdentLi(li) {
                const list = li.parentElement, parentLi = list.parentElement?.closest('li');
                const rest = []; let n = li.nextElementSibling; while (n) { rest.push(n); n = n.nextElementSibling; }
                if (rest.length) { const sub = document.createElement(list.tagName); rest.forEach(x => sub.appendChild(x)); li.appendChild(sub); }
                if (parentLi && list.closest('.wp-body')?.contains(parentLi)) { parentLi.after(li); if (!list.children.length) list.remove(); return li; }
                // en haut : le paragraphe sort de la liste
                const p = document.createElement('p'); [...li.attributes].forEach(a => p.setAttribute(a.name, a.value)); p.append(...[...li.childNodes].filter(x => !(x.nodeType === 1 && /^(UL|OL)$/.test(x.tagName)))); const subs = [...li.children].filter(x => /^(UL|OL)$/.test(x.tagName));
                list.after(p); subs.forEach(x => p.after(x)); li.remove(); if (!list.children.length) list.remove();
                if (!p.firstChild) p.innerHTML = '<br>';
                return p;
            },
            curFont() { const r = this.sel() || this.lastRange; const el = r ? (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement) : null; return el ? getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '') : 'Georgia'; },
            /** une forme posée sur les lettres choisies (police, taille, couleur…) : des <span> autour de chaque morceau de texte */
            styleRange(fn, {toggle = ''} = {}) {
                this.restoreSel(); const r = this.sel() || this.lastRange; if (!r) return toast('Choisis d’abord du texte.');
                const body = this.secOf(r.startContainer)?.body; if (!body) return;
                if (r.collapsed) { // rien de choisi : ce qui sera tapé ensuite
                    const sp = document.createElement('span'); fn(sp); sp.textContent = '​'; r.insertNode(sp); const rr = document.createRange(); rr.setStart(sp.firstChild, 1); rr.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(rr); this.lastRange = rr; return;
                }
                if (r.startContainer.nodeType === 3 && r.startOffset > 0) { const t = r.startContainer.splitText(r.startOffset); r.setStart(t, 0); }
                if (r.endContainer.nodeType === 3 && r.endOffset < r.endContainer.data.length) { r.endContainer.splitText(r.endOffset); }
                const w = document.createTreeWalker(r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer, NodeFilter.SHOW_TEXT), nodes = []; let n;
                while ((n = w.nextNode())) if (r.intersectsNode(n) && n.data.length && !n.parentElement.closest('[contenteditable="false"]')) nodes.push(n);
                if (!nodes.length) return;
                const on = toggle && nodes.every(t => getComputedStyle(t.parentElement)[toggle] === 'small-caps');
                nodes.forEach(t => { let sp = t.parentElement; if (!(sp.tagName === 'SPAN' && sp.childNodes.length === 1 && !sp.className)) { sp = document.createElement('span'); t.before(sp); sp.appendChild(t); } if (on) sp.style[toggle] = 'normal'; fn(sp); if (on && toggle) sp.style[toggle] = ''; if (!sp.getAttribute('style')) { sp.removeAttribute('style'); if (!sp.attributes.length) sp.replaceWith(...sp.childNodes); } });
                const rr = document.createRange(); rr.setStartBefore(nodes[0].parentElement.tagName === 'SPAN' ? nodes[0].parentElement : nodes[0]); rr.setEndAfter(nodes[nodes.length - 1].parentElement.tagName === 'SPAN' ? nodes[nodes.length - 1].parentElement : nodes[nodes.length - 1]);
                getSelection().removeAllRanges(); getSelection().addRange(rr); this.lastRange = rr;
                this.commit(); this.layoutSoon(); this.syncTools();
            },
            charStyle(id) { this.styleRange(sp => { if (sp.dataset.cs === id) delete sp.dataset.cs; else sp.dataset.cs = id; }); },
            changeCase(how) {
                this.restoreSel(); const r = this.sel() || this.lastRange; if (!r || r.collapsed) return toast('Choisis d’abord le texte à changer.');
                const w = document.createTreeWalker(r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer, NodeFilter.SHOW_TEXT), nodes = []; let n;
                while ((n = w.nextNode())) if (r.intersectsNode(n)) nodes.push(n);
                let startSentence = true, startWord = true;
                nodes.forEach(t => { const a = t === r.startContainer ? r.startOffset : 0, b = t === r.endContainer ? r.endOffset : t.data.length; let out = '';
                    for (const ch of t.data.slice(a, b)) { let c2 = ch; if (how === 'upper') c2 = ch.toLocaleUpperCase('fr'); else if (how === 'lower') c2 = ch.toLocaleLowerCase('fr'); else if (how === 'sentence') { c2 = startSentence && /\p{L}/u.test(ch) ? ch.toLocaleUpperCase('fr') : ch.toLocaleLowerCase('fr'); } else if (how === 'title') { c2 = startWord && /\p{L}/u.test(ch) ? ch.toLocaleUpperCase('fr') : ch.toLocaleLowerCase('fr'); }
                        if (/\p{L}/u.test(ch)) { startSentence = false; startWord = false; } if (/[.!?]/.test(ch)) startSentence = true; if (/[\s\-'’]/.test(ch)) startWord = true; out += c2; }
                    t.data = t.data.slice(0, a) + out + t.data.slice(b); });
                this.commit();
            },
            /** une forme posée sur les paragraphes choisis */
            paraStyle(fn) { this.restoreSel(); const bs = this.selBlocks(); if (!bs.length) return toast('Place le curseur dans un paragraphe.'); bs.forEach(p => { fn(p); if (!p.getAttribute('style')) p.removeAttribute('style'); }); this.commit(); this.layoutSoon(); this.syncTools(); this.syncPanel?.(); },
            setStyle(id) {
                this.restoreSel(); const st = this.doc.styles.find(s => s.id === id && s.kind !== 'c'); if (!st) return;
                const bs = this.selBlocks(); if (!bs.length) return;
                bs.forEach(p => { let el = p; if (p.tagName !== 'LI' && !/^(TD|TH)$/.test(p.tagName)) { const want = /^h[1-6]$/.test(id) ? id.toUpperCase() : 'P'; if (p.tagName !== want) el = this.retag(p, want); } el.dataset.st = id; if (st.keep) el.dataset.keep = '1'; else el.removeAttribute('data-keep'); });
                this.commit(); this.layoutSoon(0); this.syncTools(); this.status?.flash(`Style « ${st.name} »`);
            },
            colorBox(which, anchor) {
                this.restoreSel(); const r = this.sel() || this.lastRange; const b = anchor && anchor.isConnected ? anchor : this.$(`[data-wp-cmd="${which}"]`);
                UI().openColorBox(b, {allowNone: true, get: () => (which === 'color' ? this.lastColor || '#c00000' : this.lastHl || '#fff176'), set: (val, fin) => { if (!fin) return; this.lastRange = r; this.focusBack();
                    if (which === 'color') { this.lastColor = val; this.$('[data-wp-sw="color"]')?.style.setProperty('--c', val || '#000'); this.styleRange(sp => { sp.style.color = val || ''; }); }
                    else { this.lastHl = val; this.$('[data-wp-sw="hl"]')?.style.setProperty('--c', val || 'transparent'); this.styleRange(sp => { sp.style.backgroundColor = val || ''; }); } }});
            },
            /* ═════════ La barre d'outils suit le curseur ═════════ */
            syncTools() {
                if (!this.dlg) return; const r = this.sel(); if (!r) return;
                const q = n => { try { return document.queryCommandState(n); } catch (_) { return false; } };
                [['bold', 'bold'], ['italic', 'italic'], ['underline', 'underline'], ['strike', 'strikeThrough'], ['sup', 'superscript'], ['sub', 'subscript'], ['ul', 'insertUnorderedList'], ['ol', 'insertOrderedList']].forEach(([c, n]) => this.$$(`.wp-tools [data-wp-cmd="${c}"]`).forEach(b => b.classList.toggle('is-on', q(n))));
                const el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement, cs = getComputedStyle(el), blk = blockOf(r.startContainer, this.secOf(r.startContainer).body);
                this.$$('.wp-tools [data-wp-cmd="smallcaps"]').forEach(b => b.classList.toggle('is-on', /small-caps/.test(cs.fontVariant)));
                const al = blk ? getComputedStyle(blk).textAlign : 'left'; ['left', 'center', 'right', 'justify'].forEach(a => this.$$(`.wp-tools [data-wp-cmd="al:${a}"]`).forEach(b => b.classList.toggle('is-on', al === a || (a === 'left' && al === 'start'))));
                const sel = this.$('[data-wp-style]'); if (sel && blk && document.activeElement !== sel) sel.value = blk.dataset.st || 'normal';
                const fb = this.$('.wp-fontbtn'); if (fb) { const f = cs.fontFamily.split(',')[0].replace(/["']/g, ''); fb.textContent = f; fb.style.fontFamily = cs.fontFamily; }
                const sz = this.$('[data-wp-size]'); if (sz && document.activeElement !== sz) sz.value = String(Math.round(parseFloat(cs.fontSize) / K().PT * 2) / 2);
                this.$$('[data-wp-cmd="track"]').forEach(b => b.classList.toggle('is-on', !!this.doc.track));
            },
            paintStatus() {
                if (!this.status) return;
                const words = this.wordCount(), lang = (LANGS.find(l => l[0] === this.doc.lang) || ['', this.doc.lang])[1];
                const sc = this.scroll, mid = sc.scrollTop + sc.clientHeight / 3; let page = 1, acc = 24 * this.zoom;
                for (const s of this.secs) { const h = (parseFloat(s.el.style.height) || 0) * this.zoom, ppx = ((s.geo?.H || 1000) + K().GAP) * this.zoom; if (mid < acc + h + 24 * this.zoom) { page = s.first + 1 + Math.max(0, Math.min(s.pages - 1, Math.floor((mid - acc) / ppx))); break; } acc += h + 24 * this.zoom; page = s.first + s.pages; }
                const box = document.createElement('span'); box.className = 'wp-where';
                box.innerHTML = `<span>Page ${page} / ${this.totalPages || 1}</span><button type="button" data-wp-cmd="words" title="Nombre de mots, de caractères, de paragraphes">${esc(A().plural ? A().plural(words, 'mot') : words + ' mots')}</button><button type="button" data-wp-cmd="lang" title="Langue du document (orthographe, lecture à voix haute)">${esc(lang)}</button>${this.doc.track ? '<span title="Les modifications sont suivies">✍ Suivi</span>' : ''}`;
                const key = box.innerHTML; if (this.whereKey !== key) { this.whereKey = key; this.status.setWhere(box); }
            },
            wordCount() { clearTimeout(this.wcT); if (this.wcCache && Date.now() - this.wcAt < 800) { this.wcT = setTimeout(() => this.paintStatus(), 900); return this.wcCache; } let n = 0; this.bodies().forEach(b => { const c = b.cloneNode(true); c.querySelectorAll('del, .wp-endnotes, sup.wp-fn, .wp-gen').forEach(x => x.remove()); n += T().wordCount(c.textContent); }); this.wcCache = n; this.wcAt = Date.now(); return n; },

            /* ═════════ Suivi des modifications ═════════ */
            mkTc(tag) { const el = document.createElement(tag); el.className = `wp-${tag}`; Object.assign(el.dataset, {tc: nid('t'), a: this.author, t: now()}); return el; },
            trackInsert(text) {
                const s = getSelection(); if (!s.rangeCount) return; let r = s.getRangeAt(0);
                if (!r.collapsed) { this.markDeleted(r); r = s.getRangeAt(0); r.collapse(false); }
                const node = r.startContainer, own = (node.nodeType === 3 ? node.parentElement : node)?.closest('ins.wp-ins');
                if (own && own.dataset.a === this.author && !own.closest('del')) { const t = document.createTextNode(text); r.insertNode(t); r.setStartAfter(t); r.collapse(true); s.removeAllRanges(); s.addRange(r); t.parentNode.normalize(); return; }
                // juste après une insertion à moi : on la continue
                const prev = node.nodeType === 3 && r.startOffset === 0 ? node.previousSibling : node.nodeType === 3 ? null : node.childNodes[r.startOffset - 1];
                if (prev?.nodeType === 1 && prev.matches('ins.wp-ins') && prev.dataset.a === this.author && (node.nodeType !== 3 || r.startOffset === 0)) { prev.appendChild(document.createTextNode(text)); prev.normalize(); const rr = document.createRange(); rr.selectNodeContents(prev); rr.collapse(false); s.removeAllRanges(); s.addRange(rr); return; }
                const ins = this.mkTc('ins'); ins.textContent = text; r.insertNode(ins); const rr = document.createRange(); rr.selectNodeContents(ins); rr.collapse(false); s.removeAllRanges(); s.addRange(rr);
            },
            trackInput(e) {
                const t = e.inputType, s = getSelection(); if (!s.rangeCount) return;
                if (t === 'insertText' || t === 'insertReplacementText') { if (e.data == null && !e.dataTransfer) return; e.preventDefault(); this.trackInsert(e.data ?? e.dataTransfer.getData('text/plain')); this.commitSoon(); this.touch(); this.layoutSoon(); return; }
                if (/^delete(Content|Word|SoftLine|HardLine)(Backward|Forward)$|^deleteByCut$/.test(t)) {
                    const back = /Backward/.test(t); let r = s.getRangeAt(0);
                    if (r.collapsed) { s.modify('extend', back ? 'backward' : 'forward', /Word/.test(t) ? 'word' : /Line/.test(t) ? 'lineboundary' : 'character'); r = s.getRangeAt(0); }
                    if (r.collapsed) return;
                    // passer d'un paragraphe à l'autre : la fusion n'est pas suivie
                    const body = this.secOf(r.startContainer)?.body; if (blockOf(r.startContainer, body) !== blockOf(r.endContainer, body) && r.toString().length <= 1) { if (!back) s.collapseToStart(); else s.collapseToEnd(); return; }
                    e.preventDefault();
                    if (t === 'deleteByCut') { try { navigator.clipboard?.writeText(r.toString()); } catch (_) {} }
                    this.markDeleted(r); const rr = this.lastMark; if (rr) { s.removeAllRanges(); s.addRange(rr); back ? s.collapseToStart() : s.collapseToEnd(); }
                    this.commit(); this.touch(); this.layoutSoon();
                }
            },
            /** les lettres du passage deviennent « supprimées » (barrées) ; celles que j'avais ajoutées partent vraiment */
            markDeleted(r) {
                if (r.startContainer.nodeType === 3 && r.startOffset > 0) { const t = r.startContainer.splitText(r.startOffset); r.setStart(t, 0); }
                if (r.endContainer.nodeType === 3 && r.endOffset < r.endContainer.data.length) r.endContainer.splitText(r.endOffset);
                const root = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer, w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = []; let n;
                while ((n = w.nextNode())) if (r.intersectsNode(n) && n.data.length) nodes.push(n);
                let first = null, last = null;
                nodes.forEach(t => {
                    if (t.parentElement.closest('[contenteditable="false"]')) return;
                    if (t.parentElement.closest('del.wp-del')) { first = first || t; last = t; return; }
                    const ins = t.parentElement.closest('ins.wp-ins'); if (ins && ins.dataset.a === this.author) { const p = t.parentNode; t.remove(); if (!ins.textContent) ins.remove(); void p; return; }
                    const prev = t.previousSibling; let del;
                    if (prev?.nodeType === 1 && prev.matches('del.wp-del') && prev.dataset.a === this.author) { del = prev; del.appendChild(t); } else { del = this.mkTc('del'); t.before(del); del.appendChild(t); }
                    first = first || del; last = del;
                });
                if (first) { const rr = document.createRange(); rr.setStartBefore(first.nodeType === 3 ? first : first); rr.setEndAfter(last); this.lastMark = rr; } else this.lastMark = null;
            },
            changes() { return this.bodies().flatMap(b => [...b.querySelectorAll('ins.wp-ins[data-tc], del.wp-del[data-tc]')]); },
            resolveChange(accept, all) {
                let list;
                if (all) list = this.changes();
                else { const r = this.sel() || this.lastRange; list = r ? this.changes().filter(x => r.intersectsNode(x) || x.contains(r.startContainer)) : []; }
                if (!list.length) return toast(all ? 'Aucune modification suivie dans le document.' : 'Place le curseur dans une modification (texte vert ou barré rouge).');
                list.forEach(x => { const keep = (x.tagName === 'INS') === accept; if (keep) x.replaceWith(...x.childNodes); else x.remove(); });
                this.bodies().forEach(b => b.normalize());
                this.commit(); this.layoutSoon(0); this.paintPanel?.();
                this.undoable(`${list.length > 1 ? `${list.length} modifications` : 'Modification'} ${accept ? (list.length > 1 ? 'acceptées' : 'acceptée') : (list.length > 1 ? 'refusées' : 'refusée')}`);
            },
            gotoChange(dir) {
                const list = this.changes(); if (!list.length) return toast('Aucune modification suivie.');
                const r = this.sel() || this.lastRange; let i = list.findIndex(x => r && (x.compareDocumentPosition(r.startContainer) & Node.DOCUMENT_POSITION_PRECEDING ? false : true) && !(x.contains(r.startContainer)));
                if (dir > 0) { i = list.findIndex(x => r && (r.startContainer.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING) && !x.contains(r.startContainer)); if (i < 0) i = 0; }
                else { const before = list.filter(x => r && (x.compareDocumentPosition(r.startContainer) & Node.DOCUMENT_POSITION_FOLLOWING) && !x.contains(r.startContainer)); i = before.length ? list.indexOf(before[before.length - 1]) : list.length - 1; }
                this.selectNode(list[i]);
            },
            selectNode(x) { const rr = document.createRange(); rr.selectNodeContents(x); const b = x.closest('.wp-body'); b?.focus({preventScroll: true}); getSelection().removeAllRanges(); getSelection().addRange(rr); this.lastRange = rr; x.scrollIntoView({block: 'center'}); },

            /* ═════════ Commentaires ═════════ */
            addComment() {
                this.restoreSel(); let r = this.sel() || this.lastRange; if (!r) return toast('Choisis le passage à commenter.');
                if (r.collapsed) { const s = getSelection(); s.modify('move', 'backward', 'word'); s.modify('extend', 'forward', 'word'); r = s.getRangeAt(0); }
                if (r.collapsed || !r.toString().trim()) return toast('Choisis le passage à commenter.');
                const id = nid('c');
                if (r.startContainer.nodeType === 3 && r.startOffset > 0) { const t = r.startContainer.splitText(r.startOffset); r.setStart(t, 0); }
                if (r.endContainer.nodeType === 3 && r.endOffset < r.endContainer.data.length) r.endContainer.splitText(r.endOffset);
                const root = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer, w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = []; let n;
                while ((n = w.nextNode())) if (r.intersectsNode(n) && n.data.length && !n.parentElement.closest('[contenteditable="false"]')) nodes.push(n);
                nodes.forEach(t => { const sp = document.createElement('span'); sp.className = 'wp-cm'; sp.dataset.cm = id; t.before(sp); sp.appendChild(t); });
                this.doc.comments.push({id, text: '', author: this.author, at: now(), done: false, replies: []});
                this.commit(); this.showPanel('comments'); this.paintPanel(); setTimeout(() => { const ta = this.$(`[data-wp-cmt="${id}"] textarea`); ta?.focus(); }, 30);
            },
            showComment(id) { this.showPanel('comments'); this.$$('.wp-cm.is-cur, .wp-cmt.is-cur').forEach(x => x.classList.remove('is-cur')); this.docEl.querySelectorAll(`.wp-cm[data-cm="${CSS.escape(id)}"]`).forEach(x => x.classList.add('is-cur')); const c = this.$(`[data-wp-cmt="${CSS.escape(id)}"]`); c?.classList.add('is-cur'); c?.scrollIntoView({block: 'nearest'}); },
            commentAct(id, act, val) {
                const c = this.doc.comments.find(x => x.id === id); if (!c) return;
                if (act === 'text') c.text = String(val || '').slice(0, 4000);
                if (act === 'reply' && String(val || '').trim()) c.replies = [...(c.replies || []), {text: String(val).trim().slice(0, 4000), author: this.author, at: now()}];
                if (act === 'done') { c.done = !c.done; this.docEl.querySelectorAll(`.wp-cm[data-cm="${CSS.escape(id)}"]`).forEach(x => x.classList.toggle('is-done', c.done)); }
                if (act === 'delete') { this.docEl.querySelectorAll(`.wp-cm[data-cm="${CSS.escape(id)}"]`).forEach(x => x.replaceWith(...x.childNodes)); this.doc.comments = this.doc.comments.filter(x => x.id !== id); this.commit(); this.paintPanel(); this.undoable('Commentaire supprimé'); return; }
                this.commit(); this.paintPanel();
            },

            /* ═════════ Tableaux ═════════ */
            cell() { const r = this.sel() || this.lastRange; const n = r?.startContainer; const el = n?.nodeType === 3 ? n.parentElement : n; return el?.closest?.('.wp-body td, .wp-body th') || null; },
            grid(t) { const g = [], pos = new Map(); [...t.rows].forEach((tr, ri) => { g[ri] = g[ri] || []; let ci = 0; [...tr.cells].forEach(c => { while (g[ri][ci]) ci++; for (let y = 0; y < c.rowSpan; y++) for (let x = 0; x < c.colSpan; x++) { g[ri + y] = g[ri + y] || []; g[ri + y][ci + x] = c; } pos.set(c, {r: ri, c: ci}); ci += c.colSpan; }); }); return {g, pos, w: Math.max(...g.map(r => r.length))}; },
            selectCells(a, b) { const t = a.closest('table'), {g, pos} = this.grid(t), p = pos.get(a), q = pos.get(b); const r0 = Math.min(p.r, q.r), r1 = Math.max(p.r, q.r), c0 = Math.min(p.c, q.c), c1 = Math.max(p.c, q.c); t.querySelectorAll('.is-sel').forEach(c => c.classList.remove('is-sel')); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r]?.[c]?.classList.add('is-sel'); },
            moveCell(dir) {
                const c = this.cell(), t = c.closest('table'), cells = [...t.querySelectorAll('td, th')], i = cells.indexOf(c);
                let n = cells[i + dir]; if (!n && dir > 0) { this.tableCmd('rowbelow'); n = [...t.querySelectorAll('td, th')][i + 1]; }
                if (!n) return; const rr = document.createRange(); rr.selectNodeContents(n); getSelection().removeAllRanges(); getSelection().addRange(rr); this.lastRange = rr;
            },
            tableCmd(cmd, arg) {
                this.restoreSel(); const c = this.cell(); if (!c) return toast('Place le curseur dans un tableau.');
                const t = c.closest('table'), {g, pos, w} = this.grid(t), p = pos.get(c), mk = (tag = 'td') => { const x = document.createElement(tag); x.innerHTML = '<br>'; return x; };
                const done = msg => { this.commit(); this.layoutSoon(0); if (msg) this.status?.flash(msg); };
                if (cmd === 'rowabove' || cmd === 'rowbelow') {
                    const at = cmd === 'rowabove' ? p.r : p.r + c.rowSpan, tr = document.createElement('tr'), ref = t.rows[at] || null;
                    for (let ci = 0; ci < w; ci++) { const above = g[at - 1]?.[ci], here = g[at]?.[ci]; if (above && above === here) { if (pos.get(above).c === ci) above.rowSpan++; continue; } tr.appendChild(mk(ref?.parentElement?.tagName === 'THEAD' ? 'th' : 'td')); }
                    if (ref) ref.before(tr); else (t.tBodies[0] || t).appendChild(tr); return done('Ligne ajoutée');
                }
                if (cmd === 'colleft' || cmd === 'colright') {
                    const at = cmd === 'colleft' ? p.c : p.c + c.colSpan;
                    [...t.rows].forEach((tr, ri) => { const left = g[ri][at - 1], here = g[ri][at]; if (left && left === here) { if (pos.get(left).r === ri) left.colSpan++; return; } const cell = mk(tr.parentElement.tagName === 'THEAD' ? 'th' : 'td'); const next = [...tr.cells].find(x => pos.get(x).c >= at); if (next) next.before(cell); else tr.appendChild(cell); });
                    t.querySelectorAll('col').forEach(x => x.remove()); return done('Colonne ajoutée');
                }
                if (cmd === 'delrow') { if (t.rows.length < 2) return this.tableCmd('deltable'); const ri = p.r, tr = t.rows[ri];
                    for (let ci = 0; ci < w; ci++) { const x = g[ri][ci]; if (!x || (ci > 0 && g[ri][ci - 1] === x)) continue; const ps = pos.get(x); if (ps.r < ri) x.rowSpan--; else if (x.rowSpan > 1) { x.rowSpan--; const nr = t.rows[ri + 1]; const next = [...nr.cells].find(y => pos.get(y).c > ci); if (next) next.before(x); else nr.appendChild(x); } }
                    tr.remove(); return done('Ligne supprimée'); }
                if (cmd === 'delcol') { if (w < 2) return this.tableCmd('deltable'); const ci = p.c; [...t.rows].forEach((tr, ri) => { const x = g[ri][ci]; if (!x || (ri > 0 && g[ri - 1][ci] === x)) return; if (x.colSpan > 1) x.colSpan--; else x.remove(); }); t.querySelectorAll('col').forEach(x => x.remove()); return done('Colonne supprimée'); }
                if (cmd === 'deltable') { const p2 = document.createElement('p'); p2.dataset.st = 'normal'; p2.innerHTML = '<br>'; t.after(p2); t.remove(); done(); return this.undoable('Tableau supprimé'); }
                if (cmd === 'merge') { const sel = [...t.querySelectorAll('.is-sel')]; if (sel.length < 2) return toast('Glisse la souris d’une case à l’autre pour en choisir plusieurs, puis « Fusionner ».');
                    const ps = sel.map(x => pos.get(x)), r0 = Math.min(...ps.map(q => q.r)), c0 = Math.min(...ps.map(q => q.c)), r1 = Math.max(...sel.map(x => pos.get(x).r + x.rowSpan - 1)), c1 = Math.max(...sel.map(x => pos.get(x).c + x.colSpan - 1));
                    const first = g[r0][c0]; const all = new Set(); for (let r = r0; r <= r1; r++) for (let cc = c0; cc <= c1; cc++) all.add(g[r][cc]);
                    if ([...all].some(x => { const q = pos.get(x); return q.r < r0 || q.c < c0 || q.r + x.rowSpan - 1 > r1 || q.c + x.colSpan - 1 > c1; })) return toast('Choisis un rectangle de cases (sans morceau d’une autre fusion).');
                    all.forEach(x => { if (x !== first) { if (x.textContent.trim()) { first.appendChild(document.createElement('br')); first.append(...x.childNodes); } x.remove(); } });
                    first.colSpan = c1 - c0 + 1; first.rowSpan = r1 - r0 + 1; first.classList.remove('is-sel'); t.querySelectorAll('.is-sel').forEach(x => x.classList.remove('is-sel')); [...t.rows].forEach(tr => { if (!tr.cells.length) tr.remove(); }); return done('Cases fusionnées'); }
                if (cmd === 'split') { if (c.colSpan < 2 && c.rowSpan < 2) return toast('Cette case n’est pas fusionnée.'); const cs = c.colSpan, rs = c.rowSpan; c.colSpan = 1; c.rowSpan = 1;
                    for (let y = 0; y < rs; y++) { const tr = t.rows[p.r + y]; for (let x = (y ? 0 : 1); x < cs; x++) { const cell = mk(c.tagName.toLowerCase()); const next = [...tr.cells].find(z => z !== c && pos.get(z)?.c > p.c + x - (y ? 0 : 0)); if (y === 0) c.after(cell); else if (next) next.before(cell); else tr.appendChild(cell); } } return done('Case séparée'); }
                if (cmd === 'headrow') { if (t.tHead) { const tb = t.tBodies[0] || t.createTBody(); [...t.tHead.rows].reverse().forEach(tr => { [...tr.cells].forEach(x => { if (x.tagName === 'TH') { const td = document.createElement('td'); [...x.attributes].forEach(a => td.setAttribute(a.name, a.value)); td.append(...x.childNodes); x.replaceWith(td); } }); tb.prepend(tr); }); t.tHead.remove(); return done('Plus de ligne d’en-tête'); }
                    const tr = t.rows[0], th = t.createTHead(); [...tr.cells].forEach(x => { const h = document.createElement('th'); [...x.attributes].forEach(a => h.setAttribute(a.name, a.value)); h.append(...x.childNodes); x.replaceWith(h); }); th.appendChild(tr); return done('La première ligne est répétée en haut de chaque page'); }
                if (cmd === 'tborders') { if (t.dataset.bd === '0') delete t.dataset.bd; else t.dataset.bd = '0'; return done(); }
                if (cmd === 'cellbg') { const sel = t.querySelectorAll('.is-sel').length ? [...t.querySelectorAll('.is-sel')] : [c]; return UI().openColorBox(arg && arg.isConnected ? arg : c, {allowNone: true, get: () => c.style.backgroundColor ? T().col(c.style.backgroundColor) : '#eef2f8', set: (val, fin) => { sel.forEach(x => { x.style.backgroundColor = val || ''; if (!x.getAttribute('style')) x.removeAttribute('style'); }); if (fin) done(); }}); }
                if (cmd === 'sortaz' || cmd === 'sortza') { const tb = t.tBodies[0]; if (!tb) return; const rows = [...tb.rows]; if (rows.some(tr => [...tr.cells].some(x => x.rowSpan > 1 || x.colSpan > 1))) return toast('Le tri ne marche pas avec des cases fusionnées : sépare-les d’abord.');
                    const ci = p.c, key = tr => tr.cells[ci]?.textContent.trim() || ''; const sorted = rows.slice().sort((a, b) => key(a).localeCompare(key(b), 'fr', {numeric: true, sensitivity: 'base'}) * (cmd === 'sortaz' ? 1 : -1)); sorted.forEach(tr => tb.appendChild(tr)); done(); return this.undoable(`Tableau trié ${cmd === 'sortaz' ? 'de A à Z' : 'de Z à A'}`); }
            },
            imageSize(f) {
                const cw = f.closest('.wp-body').clientWidth;
                ext.openDialog({eyebrow: 'IMAGE', title: 'Taille de l’image', submitLabel: 'Enregistrer', body: `<div class="form-grid one-column"><label>Largeur<input type="number" name="w" data-unit="px" min="16" max="${Math.round(cw)}" value="${Math.round(parseFloat(f.style.width) || f.getBoundingClientRect().width / this.zoom)}"></label><p class="muted">Toute la largeur du texte : ${Math.round(cw)} px. La hauteur suit (pas de déformation).</p><div class="wp-row"><button type="button" class="button small secondary" data-w="${Math.round(cw / 4)}">¼</button><button type="button" class="button small secondary" data-w="${Math.round(cw / 3)}">⅓</button><button type="button" class="button small secondary" data-w="${Math.round(cw / 2)}">½</button><button type="button" class="button small secondary" data-w="${Math.round(cw)}">Toute la largeur</button></div></div>`,
                    onOpen: d => d.addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (b) d.querySelector('[name=w]').value = b.dataset.w; }),
                    onSubmit: form => { const v = Number(form.elements.w.value); if (!(v >= 16)) return UI().fail(form.elements.w, 'Une largeur de 16 px au moins.'); f.style.width = `${Math.round(clamp(v, 16, cw))}px`; this.commit(); this.layoutSoon(0); }});
            },
            editNote(s) {
                const end = s.dataset.kind === 'end';
                ext.openDialog({eyebrow: end ? 'NOTE DE FIN' : 'NOTE DE BAS DE PAGE', title: `Note ${s.textContent}`, submitLabel: 'Enregistrer',
                    body: `<label class="field">Texte de la note<textarea name="t" rows="4" spellcheck="true" lang="${esc(this.doc.lang)}">${esc(s.dataset.note || '')}</textarea></label><label class="checkbox-line"><input type="checkbox" name="end" ${end ? 'checked' : ''}> Note de fin (à la fin du document)</label>`,
                    onDelete: () => { s.remove(); this.commit(); this.layoutSoon(0); this.undoable('Note supprimée'); },
                    onSubmit: form => { s.dataset.note = form.elements.t.value.trim().slice(0, 4000); s.dataset.kind = form.elements.end.checked ? 'end' : 'foot'; this.commit(); this.layoutSoon(0); }});
            },
            paraDialog() {
                this.restoreSel(); const p = this.selBlocks()[0]; if (!p) return toast('Place le curseur dans un paragraphe.'); const cs = getComputedStyle(p), r1 = v => Math.round(v * 10) / 10;
                const pt = v => r1(parseFloat(v) / K().PT), mm = v => r1(parseFloat(v) / K().MM), lh = /^[\d.]+$/.test(p.style.lineHeight) ? p.style.lineHeight : r1(parseFloat(cs.lineHeight) / parseFloat(cs.fontSize)) || 1.4;
                const ranges = this.selBlocks();
                ext.openDialog({eyebrow: 'FORMAT', title: '¶ Paragraphe', submitLabel: 'Enregistrer', body: `<div class="form-grid">
                    <label>Alignement<select name="al">${[['left', 'À gauche'], ['center', 'Centré'], ['right', 'À droite'], ['justify', 'Justifié']].map(([k, l]) => `<option value="${k}" ${(cs.textAlign === k || (k === 'left' && cs.textAlign === 'start')) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                    <label>Interligne<input type="number" name="lh" step="0.05" min="0.6" max="4" value="${lh}"></label>
                    <label>Espace avant<input type="number" name="sb" data-unit="pt" step="1" min="0" value="${pt(cs.marginTop)}"></label><label>Espace après<input type="number" name="sa" data-unit="pt" step="1" min="0" value="${pt(cs.marginBottom)}"></label>
                    <label>Retrait à gauche<input type="number" name="il" data-unit="mm" step="1" value="${mm(cs.marginLeft)}"></label><label>Retrait à droite<input type="number" name="ir" data-unit="mm" step="1" value="${mm(cs.marginRight)}"></label>
                    <label>1re ligne (négatif : en saillie)<input type="number" name="fi" data-unit="mm" step="1" value="${mm(cs.textIndent)}"></label>
                    <label class="checkbox-line"><input type="checkbox" name="keep" ${p.dataset.keep ? 'checked' : ''}> Garder avec le paragraphe suivant</label>
                    <label class="checkbox-line"><input type="checkbox" name="pb" ${p.style.breakBefore === 'page' ? 'checked' : ''}> Commencer sur une nouvelle page</label></div>`,
                    onSubmit: form => { const v = n => form.elements[n].value; ranges.forEach(b => { b.style.textAlign = v('al') === 'left' ? '' : v('al'); b.style.lineHeight = v('lh'); b.style.marginTop = `${clamp(v('sb'), 0, 200)}pt`; b.style.marginBottom = `${clamp(v('sa'), 0, 200)}pt`; b.style.marginLeft = Number(v('il')) ? `${clamp(v('il'), -50, 200)}mm` : ''; b.style.marginRight = Number(v('ir')) ? `${clamp(v('ir'), 0, 200)}mm` : ''; b.style.textIndent = Number(v('fi')) ? `${clamp(v('fi'), -100, 100)}mm` : ''; if (form.elements.keep.checked) b.dataset.keep = '1'; else b.removeAttribute('data-keep'); });
                        if (form.elements.pb.checked && ranges[0] && ranges[0].previousElementSibling && !ranges[0].previousElementSibling.matches('hr.wp-pb')) { const hr = document.createElement('hr'); hr.className = 'wp-pb'; hr.dataset.break = 'page'; hr.setAttribute('contenteditable', 'false'); ranges[0].before(hr); }
                        this.commit(); this.layoutSoon(0); }});
            },
            borderDialog() {
                this.restoreSel(); const ps = this.selBlocks(); if (!ps.length) return toast('Place le curseur dans un paragraphe.'); const p = ps[0];
                ext.openDialog({eyebrow: 'FORMAT', title: 'Bordure et trame', submitLabel: 'Enregistrer', body: `<div class="form-grid one-column"><label class="checkbox-line"><input type="checkbox" name="bd" ${p.style.border ? 'checked' : ''}> Un cadre autour du paragraphe</label><label class="checkbox-line"><input type="checkbox" name="bot" ${/solid/.test(p.style.borderBottom) && !p.style.borderTop ? 'checked' : ''}> Seulement un trait dessous</label><div class="wp-row"><span class="wp-lab">Trame (fond)</span><button type="button" class="button small secondary" data-bg>🎨 Choisir…</button><span data-bgv>${esc(p.style.backgroundColor ? T().col(p.style.backgroundColor) : 'Aucune')}</span></div></div>`,
                    onOpen: d => { let bg = p.style.backgroundColor ? T().col(p.style.backgroundColor) : ''; d._bg = () => bg; d.querySelector('[data-bg]').addEventListener('click', e => UI().openColorBox(e.target, {allowNone: true, get: () => bg || '#fff3c4', set: (v) => { bg = v || ''; d.querySelector('[data-bgv]').textContent = bg || 'Aucune'; }})); },
                    onSubmit: form => { const bg = form.closest('dialog')._bg(); ps.forEach(b => { b.style.border = ''; b.style.borderBottom = ''; b.style.padding = ''; if (form.elements.bd.checked) { b.style.border = '1px solid #444'; b.style.padding = '4pt 6pt'; } else if (form.elements.bot.checked) { b.style.borderBottom = '1px solid #444'; } b.style.backgroundColor = bg || ''; if (!b.getAttribute('style')) b.removeAttribute('style'); }); this.commit(); this.layoutSoon(0); }});
            },
        });
    }
})();
