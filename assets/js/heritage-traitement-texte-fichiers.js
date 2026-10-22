/**
 * 📝 Traitement de texte — enregistrer (base : lib/textdocs.php), fermer, copies et modèles, versions et comparaison,
 * importer (.docx, .odt, .rtf, .md, .txt, .html : fenêtre K13 en 3 étapes), exporter (fenêtre E3 : Word, LibreOffice, PDF,
 * impression page par page comme à l'écran, RTF, Markdown, texte, HTML, fichier de l'outil), ranger une copie dans les médias,
 * envoyer vers la mise en page, partir d'un modèle (et « Mes modèles »), la liste dans 🛠️ Outils de modification, et les liens
 * depuis le reste de l'app : « 📝 Écrire sur cette personne » (fiche), biographie F5, Journal des recherches et visites.
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
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const plural = (n, w) => (A()?.plural ? A().plural(n, w) : `${n} ${w}${n > 1 ? 's' : ''}`);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
    const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    const tools = ext.textDocTools = ext.textDocTools || {};
    const ACCEPT = '.docx,.odt,.rtf,.md,.markdown,.txt,.text,.html,.htm,.lcnda-texte';
    const wait = setInterval(() => { if (!ext.textDocKit?.Editor || !tools.installed) return; clearInterval(wait); install(); }, 30);

    /* ═════════ Ce qui est gardé : le HTML de chaque section, sans ce qui ne sert qu'à l'écran ═════════ */
    function cleanForSave(body) {
        const c = body.cloneNode(true);
        c.querySelectorAll('.wp-endnotes, .wp-h').forEach(x => x.remove());
        c.querySelectorAll('[data-wp-push]').forEach(x => { x.removeAttribute('data-wp-push'); x.style.removeProperty('--wp-push'); if (!x.getAttribute('style')) x.removeAttribute('style'); });
        c.querySelectorAll('.is-picked, .is-sel, .is-cur, .wp-read').forEach(x => { x.classList.remove('is-picked', 'is-sel', 'is-cur', 'wp-read'); if (!x.getAttribute('class')) x.removeAttribute('class'); });
        c.querySelectorAll('.wp-gen').forEach(x => { x.innerHTML = ''; });
        return c.innerHTML.replace(/​/g, '');
    }
    const firstText = ed => ed.bodies().map(b => b.textContent).join(' ').replace(/\s+/g, ' ').trim();
    function install() {
        const {Editor, cleanHtml, blocksOfEl, pref} = K();
        Object.assign(Editor.prototype, {
            docData() {
                const d = this.doc;
                return {v: 1, page: d.page, sections: this.secs.map(s => ({html: cleanForSave(s.body), ...(s.page ? {page: s.page} : {})})), header: d.header, footer: d.footer, styles: d.styles, comments: d.comments.filter(c => this.docEl.querySelector(`.wp-cm[data-cm="${CSS.escape(c.id)}"]`)),
                    lang: d.lang, set: d.set, track: !!d.track, meta: d.meta, tab: d.tab, pages: this.totalPages || 1};
            },
            async save({asNew = false, kind = this.kind, name = this.name, quiet = false, force = false} = {}) {
                if (this.typeT) this.commit();
                UI()?.savedStatus?.(this.dlg, 'saving');
                try {
                    const r = await post('save_textdoc', {id: asNew ? 0 : this.id, name, kind, data: this.docData(), rev: asNew ? '' : this.rev, force}), res = r.result || r, id = Number(res.id || 0);
                    if (!asNew) { const first = !this.id; this.id = id; this.rev = res.rev || ''; this.dirty = false; this.savedAt = Date.now(); UI()?.savedStatus?.(this.dlg, 'saved'); if (first && !quiet) toast('Rangé dans Listes → 🛠️ Outils de modification → 📝 Traitement de texte.'); }
                    else { UI()?.savedStatus?.(this.dlg, this.dirty ? 'dirty' : 'saved'); toast(kind === 'template' ? `Modèle « ${name} » enregistré (Partir d’un modèle → Mes modèles).` : `Copie « ${name} » enregistrée.`); }
                    this.ctx.onSaved?.(this.id);
                    return id;
                } catch (e) {
                    UI()?.savedStatus?.(this.dlg, 'error');
                    if (/modifié ailleurs/.test(e.message || '')) { if (await A().confirmBox('Une autre fenêtre a enregistré ce document entre-temps. Garder ta version effacera la sienne.', {title: 'Document modifié ailleurs', okLabel: 'Garder ma version', danger: true})) return this.save({asNew, kind, name, quiet, force: true}); return 0; }
                    toast(`Impossible d’enregistrer : ${e.message}`, 'error', {retry: () => this.save({asNew, kind, name})}); return 0;
                }
            },
            async close() {
                if (this.typeT) this.commit();
                if (this.dirty && !await A().confirmBox('Les changements faits depuis le dernier enregistrement seront perdus.', {title: 'Fermer sans enregistrer ?', okLabel: 'Fermer sans enregistrer', danger: true})) return;
                this.dlg.close();
            },
            /** le document neutre (pour les fichiers et la mise en page) */
            imOf() {
                const hf = html => { const d = document.createElement('div'); d.innerHTML = cleanHtml(html || '').html; return blocksOfEl(d); };
                return {title: this.name, meta: {...this.doc.meta}, lang: this.doc.lang, set: this.doc.set, page: {...this.doc.page, cols: 1}, styles: this.doc.styles, comments: this.doc.comments, track: !!this.doc.track,
                    header: {blocks: hf(this.doc.header.html), first: !!this.doc.header.first, firstBlocks: hf(this.doc.header.firstHtml)}, footer: {blocks: hf(this.doc.footer.html), first: !!this.doc.footer.first, firstBlocks: hf(this.doc.footer.firstHtml)},
                    sections: this.secs.map(s => { const c = s.body.cloneNode(true); c.querySelectorAll('.wp-endnotes, .wp-h').forEach(x => x.remove()); return {page: s.page ? {...s.page, cols: 1} : null, blocks: blocksOfEl(c)}; })};
            },
            /** les images du document en octets (Word et LibreOffice les rangent dans le fichier) */
            async imagesOf(im) {
                const srcs = new Set(), walk = bs => (bs || []).forEach(b => { if (b.t === 'img') srcs.add(b.src); (b.runs || []).forEach(r => { if (r.img) srcs.add(r.img.src); }); (b.rows || []).forEach(row => row.forEach(c => walk(c.blocks))); walk(b.blocks); });
                im.sections.forEach(s => walk(s.blocks)); walk(im.header.blocks); walk(im.footer.blocks);
                const out = new Map();
                for (const src of srcs) { if (!/^media\//.test(src)) continue; try { const u8 = new Uint8Array(await (await fetch(src)).arrayBuffer()); let t = T().sniffImage(u8);
                    if (['png', 'jpeg', 'gif'].includes(t)) out.set(src, {data: u8, type: t, ...(T().imageSize(u8) || {})});
                    else if (t === 'webp' || t === 'bmp') { const png = await toPng(new Blob([u8], {type: `image/${t}`})); if (png) out.set(src, {data: png.data, type: 'png', w: png.w, h: png.h}); } } catch (_) {} }
                return out;
            },
            async fileOf(fmt) {
                const im = this.imOf();
                if (fmt === 'docx') return T().toDocx(im, {images: await this.imagesOf(im)});
                if (fmt === 'odt') return T().toOdt(im, {images: await this.imagesOf(im)});
                if (fmt === 'rtf') { const imgs = await this.imagesOf(im); const fix = bs => (bs || []).forEach(b => { if (b.t === 'img' && imgs.get(b.src)) b.src = T().dataUrl(imgs.get(b.src).data, imgs.get(b.src).type); (b.runs || []).forEach(r => { if (r.img && imgs.get(r.img.src)) r.img.src = T().dataUrl(imgs.get(r.img.src).data, imgs.get(r.img.src).type); }); (b.rows || []).forEach(row => row.forEach(c => fix(c.blocks))); fix(b.blocks); }); im.sections.forEach(s => fix(s.blocks)); return new Blob([T().toRtf(im)], {type: 'application/rtf'}); }
                if (fmt === 'md') return new Blob([T().toMarkdown(im)], {type: 'text/markdown;charset=utf-8'});
                if (fmt === 'txt') return new Blob([T().toText(im)], {type: 'text/plain;charset=utf-8'});
                if (fmt === 'html') return new Blob([await this.htmlFile()], {type: 'text/html;charset=utf-8'});
                if (fmt === 'file') return new Blob([JSON.stringify({format: 'lcnda-texte', version: 1, name: this.name, data: this.docData()})], {type: 'application/json'});
                throw new Error('format inconnu');
            },
            exportDialog(value = '') {
                const base = A().safeExportFilename ? A().safeExportFilename(this.name, 'document') : 'document';
                UI().openExportDialog({title: this.name, defaultName: this.name, quality: false, saveCopy: true, value, info: `${plural(this.totalPages || 1, 'page')} · ${plural(this.wordCount(), 'mot')}. Word et LibreOffice gardent les styles, les listes, les tableaux, les images, les notes, l’en-tête et le pied, les commentaires et les modifications suivies.`,
                    formats: [
                        {id: 'docx', label: '📘 Word (.docx)', hint: 'Word, Pages, Google Docs', ext: 'docx', run: async o => { const b = await this.fileOf('docx'); download(b, o.filename); if (o.saveCopy) await this.toMedia(b, 'docx'); }},
                        {id: 'odt', label: '📗 LibreOffice (.odt)', hint: 'LibreOffice, OpenOffice', ext: 'odt', run: async o => { const b = await this.fileOf('odt'); download(b, o.filename); if (o.saveCopy) await this.toMedia(b, 'odt'); }},
                        {id: 'pdf', label: '📄 PDF', hint: 'à lire, à envoyer', ext: '', copy: false, run: async () => { toast('Dans la fenêtre d’impression, choisis « Enregistrer au format PDF ».'); return UI().printDocument(await this.pagedHtml()); }},
                        {id: 'print', copy: false, run: async () => UI().printDocument(await this.pagedHtml())},
                        {id: 'rtf', label: '📝 RTF', hint: 'tous les traitements de texte', ext: 'rtf', copy: false, run: async o => download(await this.fileOf('rtf'), o.filename)},
                        {id: 'md', label: '✳️ Markdown (.md)', hint: 'texte avec les titres', ext: 'md', copy: false, run: async o => download(await this.fileOf('md'), o.filename)},
                        {id: 'txt', label: '🧾 Texte (.txt)', hint: 'le texte seul', ext: 'txt', copy: false, run: async o => download(await this.fileOf('txt'), o.filename)},
                        {id: 'html', label: '🌐 Page web (.html)', hint: 'à ouvrir dans un navigateur', ext: 'html', copy: false, run: async o => download(await this.fileOf('html'), o.filename)},
                        {id: 'file', label: '💾 Fichier de l’outil', hint: '.lcnda-texte (tout est gardé)', ext: 'lcnda-texte', copy: false, run: async o => download(await this.fileOf('file'), o.filename)},
                    ]}).then(r => { if (r && !['pdf', 'print'].includes(r.format)) toast(`Exporté : ${r.filename || base}`); });
            },
            /** pour imprimer et le PDF : chaque page comme à l'écran (en-tête, pied, notes, filigrane) */
            async pagedHtml() {
                this.layout();
                const css = await cssText(), rules = [], pages = [];
                this.secs.forEach((sec, si) => {
                    const g = sec.geo, pitch = g.H + K().GAP, cw = g.W - g.ml - g.mr, ch = g.H - g.mt - g.mb;
                    rules.push(`@page s${si}{size:${Math.round(g.wmm * 10) / 10}mm ${Math.round(g.hmm * 10) / 10}mm;margin:0}.pg.s${si}{page:s${si};width:${g.W}px;height:${g.H}px}`);
                    const sheets = [...sec.sheets.querySelectorAll('.wp-sheet')];
                    for (let k = 0; k < sec.pages; k++) {
                        const sh = sheets[k]?.cloneNode(true); sh?.querySelector('.wp-sheet-num')?.remove(); if (sh) { sh.style.top = '0'; sh.style.left = '0'; }
                        const body = sec.body.cloneNode(true); body.removeAttribute('contenteditable'); body.querySelectorAll('[contenteditable]').forEach(x => x.removeAttribute('contenteditable')); body.querySelectorAll('.wp-h').forEach(x => x.remove());
                        body.style.cssText = `position:absolute;left:0;top:${-k * pitch}px;width:${cw}px;tab-size:${body.style.tabSize || '4'}`;
                        pages.push(`<div class="pg s${si}">${sh ? sh.outerHTML : ''}<div class="pg-clip" style="left:${g.ml}px;top:${g.mt}px;width:${cw}px;height:${ch}px">${body.outerHTML}</div></div>`);
                    }
                });
                return `<!doctype html><html lang="${esc(this.doc.lang)}"><head><meta charset="utf-8"><title>${esc(this.name)}</title><style>${css}\n${this.styleTag.textContent.replace(/\.wp-dlg \.wp-body/g, '.wp-body').replace(/\.wp-dlg \.wp-sheet/g, '.wp-sheet')}\nhtml,body{margin:0;background:#fff}.pg{position:relative;overflow:hidden;break-after:page;page-break-after:always}.pg:last-child{break-after:auto}.pg-clip{position:absolute;overflow:hidden}.wp-sheet{box-shadow:none!important;position:absolute}.wp-sheet-hd:hover,.wp-sheet-ft:hover{outline:0}.wp-doc .wp-body .wp-cm{background:none;border:0}${rules.join('')}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body><div class="wp-dlg"><div class="wp-doc no-marks${this.tcShow !== 'all' ? ' tc-' + this.tcShow : ''}">${pages.join('')}</div></div></body></html>`;
            },
            /** une page web à part : le texte suivi, les notes à la fin, les images dans le fichier */
            async htmlFile() {
                const css = await cssText(), parts = [];
                for (const sec of this.secs) { const c = sec.body.cloneNode(true); c.removeAttribute('contenteditable'); c.querySelectorAll('[contenteditable]').forEach(x => x.removeAttribute('contenteditable')); c.querySelectorAll('.wp-h').forEach(x => x.remove()); c.querySelectorAll('[data-wp-push]').forEach(x => { x.removeAttribute('data-wp-push'); x.style.removeProperty('--wp-push'); });
                    for (const im of c.querySelectorAll('img[src^="media/"]')) { try { const b = await (await fetch(im.getAttribute('src'))).blob(); im.src = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); } catch (_) {} }
                    c.querySelectorAll('hr.wp-pb').forEach(x => { x.style.breakAfter = 'page'; });
                    c.style.cssText = 'position:static;width:auto'; parts.push(c.outerHTML); }
                const notes = this.bodies().flatMap(b => [...b.querySelectorAll('sup.wp-fn[data-kind="foot"]')]);
                return `<!doctype html><html lang="${esc(this.doc.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(this.name)}</title><style>${css}\n${this.styleTag.textContent.replace(/\.wp-dlg \.wp-body/g, '.wp-body')}\nbody{margin:0;background:#f3f4f6}main{max-width:${Math.round((this.doc.page.w || 210) - (this.doc.page.m?.l || 25) - (this.doc.page.m?.r || 25))}mm;margin:30px auto;background:#fff;padding:20mm;box-shadow:0 1px 4px rgba(0,0,0,.2)}.wp-body{position:static}.wp-endnotes,.wp-fnlist{border-top:1px solid #888;margin-top:14pt;padding-top:6pt;font-size:10pt}</style></head><body><main class="wp-dlg"><div class="wp-doc no-marks">${parts.join('')}${notes.length ? `<div class="wp-body"><div class="wp-fnlist">${notes.map(s => `<p><sup>${esc(s.textContent)}</sup> ${esc(s.dataset.note || '')}</p>`).join('')}</div></div>` : ''}</div></main></body></html>`;
            },
            /** 📁 une copie (.docx) rangée dans les médias, avec sa première page en vignette */
            async toMedia(blob, fmt = 'docx') {
                try { const b = blob || await this.fileOf('docx'); const u8 = new Uint8Array(await b.arrayBuffer());
                    const r = await post('textdoc_to_media', {file: T().toB64(u8), format: fmt, title: this.name, thumb: this.thumbPng()}); const res = r.result || r;
                    toast(`Copie rangée dans les médias (${fmt.toUpperCase()}).`, '', {action: {label: '↗ Ouvrir', run: () => A().openMedia?.(res.media_id) || window.LCNDA_PICKER?.openMedia?.(res.media_id)}}); return res;
                } catch (e) { toast(`Copie impossible : ${e.message}`, 'error'); return null; }
            },
            thumbPng() {
                try { const c = document.createElement('canvas'), g = this.secs[0]?.geo || {W: 794, H: 1123}, k = 300 / g.W; c.width = 300; c.height = Math.round(g.H * k); const x = c.getContext('2d'); x.fillStyle = this.doc.page.color || '#fff'; x.fillRect(0, 0, c.width, c.height);
                    let y = 30; x.fillStyle = '#1f3a5f'; x.font = 'bold 14px Georgia, serif'; x.fillText(this.name.slice(0, 32), 22, y); y += 22; x.fillStyle = '#333'; x.font = '9px Georgia, serif';
                    const words = firstText(this).split(' '); let line = ''; for (const w of words) { if (x.measureText(line + w).width > 256) { x.fillText(line, 22, y); y += 12; line = ''; if (y > c.height - 24) break; } line += w + ' '; } if (y <= c.height - 24) x.fillText(line, 22, y);
                    return c.toDataURL('image/png'); } catch (_) { return ''; }
            },
            /** remettre tout le document (une version reprise) */
            restoreData(d) {
                const P0 = T().PAGE0; this.doc = {...this.doc, ...d, page: {...P0, ...(d.page || {}), m: {...P0.m, ...(d.page?.m || {})}}, header: {html: '', first: false, firstHtml: '', ...(d.header || {})}, footer: {html: '', first: false, firstHtml: '', ...(d.footer || {})}, comments: Array.isArray(d.comments) ? d.comments : [], styles: (Array.isArray(d.styles) && d.styles.length ? d.styles : this.doc.styles).map(T().cleanStyle).filter(Boolean)};
                this.docEl.innerHTML = ''; this.secs = []; this.measureBox = null; (d.sections || [{html: ''}]).forEach(s => this.addSection(s, null)); this.applyStyles(); this.layout(); this.paintPanel?.();
            },
            saveAs(template = false) {
                A().askText({title: template ? 'Enregistrer comme modèle' : 'Enregistrer une copie', message: template ? 'Le nom du modèle (le texte reste : vide-le avant si tu veux un modèle vierge) :' : 'Le nom de la copie :', value: template ? this.name : `${this.name} (copie)`, okLabel: 'Enregistrer'}).then(n => { n = String(n || '').trim(); if (n) this.save({asNew: true, kind: template ? 'template' : 'doc', name: n.slice(0, 200)}); });
            },
        });
    }

    let cssCache = '';
    async function cssText() { if (cssCache) return cssCache; const href = document.querySelector('link[href*="traitement-texte.css"]')?.getAttribute('href') || 'assets/css/traitement-texte.css'; try { cssCache = (await (await fetch(href)).text()).replace(/@media \(max-width: 760px\)[\s\S]*?\n}\n/, '').replace(/\/\* ═════ Mode sombre[\s\S]*$/, ''); } catch (_) { cssCache = ''; } return cssCache; }
    const toPng = blob => new Promise(res => { const img = new Image(), u = URL.createObjectURL(blob); img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); URL.revokeObjectURL(u); const d = T().fromDataUrl(c.toDataURL('image/png')); res(d ? {data: d.data, w: c.width, h: c.height} : null); }; img.onerror = () => { URL.revokeObjectURL(u); res(null); }; img.src = u; });

    /* ═════════ Les commandes « fichiers » ═════════ */
    tools.filesRun = async (ed, cmd, arg) => {
        switch (String(cmd).split(':')[0]) {
            case 'new': return openDoc({onSaved: ed.ctx.onSaved, onClose: ed.ctx.onClose});
            case 'template': return chooseTemplate({onSaved: ed.ctx.onSaved, onClose: ed.ctx.onClose});
            case 'import': return importDialog(ed.ctx.onSaved);
            case 'saveas': return ed.saveAs(false); case 'savetpl': return ed.saveAs(true);
            case 'version': return saveVersion(ed);
            case 'versions': return versionsDialog(ed);
            case 'compare': return compareDialog(ed);
            case 'export': return ed.exportDialog();
            case 'print': return ed.exportDialog('print');
            case 'tomedia': return ed.toMedia();
            case 'tolayout': return toLayout(ed);
            default: toast(`Commande inconnue : ${cmd}`, 'error');
        }
    };

    /* ═════════ Versions et comparaison ═════════ */
    async function saveVersion(ed, label = '') {
        if (!ed.id) { const id = await ed.save(); if (!id) return; }
        const name = label || await A().askText({title: '🕘 Nouvelle version', message: 'Un nom pour cette version (facultatif) :', value: `Version du ${new Date().toLocaleDateString('fr-FR')}`, okLabel: 'Enregistrer'}); if (name === null) return;
        try { await post('save_textdoc_version', {doc_id: ed.id, label: String(name || '').trim().slice(0, 120), data: ed.docData()}); toast('Version enregistrée (Fichier → 🕘 Versions du document).'); } catch (e) { toast(e.message, 'error'); }
    }
    const textOfData = data => { const d = document.createElement('div'); d.innerHTML = (data?.sections || []).map(s => K().cleanHtml(s.html || '').html).join(''); d.querySelectorAll('del, sup.wp-fn').forEach(x => x.remove()); d.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, tr').forEach(x => x.append('\n\n')); return d.textContent.replace(/\n{3,}/g, '\n\n').trim(); };
    async function versionsDialog(ed) {
        if (!ed.id) return toast('Enregistre d’abord le document (💾) : ses versions seront gardées avec lui.');
        let items = []; try { items = (await api('textdoc_versions', {doc_id: ed.id})).items || []; } catch (e) { return toast(e.message, 'error'); }
        const dlg = ext.openDialog({eyebrow: 'DOCUMENT', title: '🕘 Versions du document', wide: true, submitLabel: 'Fermer', body: `<div class="wp-row"><button type="button" class="button" data-v-new>＋ Enregistrer la version actuelle</button><button type="button" class="button secondary" data-v-cmp>⇄ Comparer deux versions…</button></div><div data-v-list></div>`,
            onOpen: d => {
                const paint = () => { d.querySelector('[data-v-list]').innerHTML = items.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Version</th><th>Mots</th><th>Enregistrée</th><th></th></tr></thead><tbody>${items.map(v => `<tr><td>${esc(v.label)}</td><td>${v.words.toLocaleString('fr-FR')}</td><td>${UI().when ? UI().when(v.created_at) : esc(v.created_at)}</td><td><div class="wp-row"><button type="button" class="button small secondary" data-v-see="${v.id}">↗ Voir</button><button type="button" class="button small secondary" data-v-diff="${v.id}">⇄ Avec maintenant</button><button type="button" class="button small secondary" data-v-back="${v.id}">↺ Reprendre</button><button type="button" class="icon-button small" data-v-del="${v.id}" title="Supprimer la version" aria-label="Supprimer la version">🗑</button></div></td></tr>`).join('')}</tbody></table></div>` : A().empty('Pas encore de version : « ＋ Enregistrer la version actuelle » garde le texte tel qu’il est, pour y revenir ou comparer plus tard.', {icon: '🕘', action: {label: '＋ Enregistrer la version actuelle', attrs: 'data-v-new'}}); };
                paint();
                d.addEventListener('click', async e => { const b = e.target.closest('button'); if (!b) return;
                    try {
                        if (b.matches('[data-v-new]')) { await saveVersion(ed); items = (await api('textdoc_versions', {doc_id: ed.id})).items || []; return paint(); }
                        if (b.matches('[data-v-cmp]')) { d.close(); return compareDialog(ed); }
                        const vid = Number(b.dataset.vSee || b.dataset.vDiff || b.dataset.vBack || b.dataset.vDel); if (!vid) return; const v = await api('textdoc_version', {id: vid});
                        if (b.dataset.vSee) return ext.openDialog({eyebrow: 'VERSION', title: v.label, wide: true, submitLabel: 'Fermer', body: `<div class="wp-diff">${esc(textOfData(v.data))}</div>`, onSubmit: () => {}});
                        if (b.dataset.vDiff) return showDiff(`${v.label} → maintenant`, textOfData(v.data), textOfData(ed.docData()));
                        if (b.dataset.vBack) { ed.commit(); ed.restoreData(v.data); ed.commit(); d.close(); return ed.undoable(`Version « ${v.label} » reprise`); }
                        if (b.dataset.vDel) { const r = await post('delete_textdoc_version', {id: vid}); items = items.filter(x => x.id !== vid); paint(); A().undoToast?.(`Version « ${v.label} » supprimée`, {undo: async () => { await post('restore_textdoc_version', {version: (r.result || r).version}); items = (await api('textdoc_versions', {doc_id: ed.id})).items || []; if (d.isConnected) paint(); }}); }
                    } catch (err) { toast(err.message, 'error'); } });
            }, onSubmit: () => {}});
        void dlg;
    }
    async function compareDialog(ed) {
        if (!ed.id) return toast('Enregistre d’abord le document, puis ses versions (Fichier → 🕘 Enregistrer comme nouvelle version).');
        const items = (await api('textdoc_versions', {doc_id: ed.id}).catch(() => ({items: []}))).items || [];
        if (!items.length) return toast('Pas encore de version à comparer : Fichier → 🕘 Enregistrer comme nouvelle version.');
        const opts = sel => `<option value="now" ${sel === 'now' ? 'selected' : ''}>Maintenant (le texte à l’écran)</option>${items.map((v, i) => `<option value="${v.id}" ${sel === i ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}`;
        ext.openDialog({eyebrow: 'DOCUMENT', title: '⇄ Comparer deux versions', submitLabel: 'Comparer', body: `<div class="form-grid"><label>Avant<select name="a">${opts(0)}</select></label><label>Après<select name="b">${opts('now')}</select></label></div><p class="muted">Les mots ajoutés sont en vert, ceux retirés en rouge barré.</p>`,
            onSubmit: async f => { const get = async v => (v === 'now' ? {label: 'Maintenant', text: textOfData(ed.docData())} : (x => ({label: x.label, text: textOfData(x.data)}))(await api('textdoc_version', {id: v}))); const a = await get(f.elements.a.value), b = await get(f.elements.b.value); setTimeout(() => showDiff(`${a.label} → ${b.label}`, a.text, b.text), 30); }});
    }
    function showDiff(title, a, b) {
        const d = ext.biography?.diffHtml ? ext.biography.diffHtml(a, b) : {html: `<del>${esc(a)}</del><ins>${esc(b)}</ins>`};
        ext.openDialog({eyebrow: 'COMPARER', title: `⇄ ${title}`, wide: true, submitLabel: 'Fermer', body: `<p class="muted">${d.added != null ? `${plural(d.added, 'mot')} ajouté${d.added > 1 ? 's' : ''}, ${plural(d.removed || 0, 'mot')} retiré${d.removed > 1 ? 's' : ''}.` : ''}</p><div class="wp-diff">${d.html || d}</div>`, onSubmit: () => {}});
    }

    /* ═════════ Ouvrir, créer, modèles ═════════ */
    async function openDoc(ctx = {}) {
        if (!T() || !K()) return toast('Le traitement de texte n’est pas chargé.', 'error');
        let id = 0, name = ctx.name || 'Mon document', kind = 'doc', data = ctx.data || null, rev = '';
        if (ctx.id) { try { const r = await api('textdoc', {id: ctx.id}); id = r.id; name = r.name; kind = r.kind; data = r.data; rev = r.rev; } catch (e) { return toast(e.message, 'error'); } }
        return new (K().Editor)({...ctx, id, name, kind, data, rev, dirty: !!ctx.data && !ctx.id}).open();
    }
    ext.openTextDoc = openDoc;
    /** un document tout neuf fait d'un HTML (modèle, compte rendu, récit) */
    function dataOf(html, extra = {}) { const ed0 = new (K().Editor)({data: null}); const d = ed0.doc; return {...d, sections: [{html}], ...extra}; }
    tools.dataOf = dataOf;
    async function chooseTemplate(ctx = {}) {
        let mine = []; try { mine = (await api('textdocs', {kind: 'template'})).items || []; } catch (_) {}
        ext.openDialog({eyebrow: 'TRAITEMENT DE TEXTE', title: '📋 Partir d’un modèle', wide: true, submitLabel: 'Fermer',
            body: `<div class="wp-tpls">${tools.TEMPLATES.map(t => `<button type="button" class="wp-tpl" data-tpl="${t.key}"><b>${t.icon} ${esc(t.name)}</b><small>${esc(t.hint)}</small></button>`).join('')}</div>
                <h4>Mes modèles</h4>${mine.length ? `<div class="wp-tpls">${mine.map(t => `<button type="button" class="wp-tpl" data-mine="${t.id}"><b>📝 ${esc(t.name)}</b><small>${esc(plural(t.info?.words || 0, 'mot'))} · ${UI()?.whenText ? esc(UI().whenText(t.updated_at, {label: 'Modifié'})) : ''}</small></button>`).join('')}</div>` : A().empty('Pas encore de modèle à toi : dans un document, Fichier → « Enregistrer comme modèle… ».', {icon: '📋'})}`,
            onOpen: d => d.addEventListener('click', async e => {
                const b = e.target.closest('[data-tpl], [data-mine]'); if (!b) return; d.close();
                try {
                    if (b.dataset.mine) { const r = await api('textdoc', {id: Number(b.dataset.mine)}); return openDoc({...ctx, data: r.data, name: r.name}); }
                    const t = tools.TEMPLATES.find(x => x.key === b.dataset.tpl); let pid = ctx.personId || 0;
                    if (t.person && !pid) { const it = await (window.LCNDA_PICKER || A()).openPicker({kind: 'person', title: 'Le récit de qui ?'}); if (!it) return; pid = it.id; }
                    const html = await t.html(pid); return openDoc({...ctx, data: dataOf(html, {tpl: t.key}), name: t.key === 'blank' ? 'Mon document' : t.name});
                } catch (err) { toast(err.message, 'error'); }
            }), onSubmit: () => {}});
    }
    tools.chooseTemplate = chooseTemplate;
    /** depuis une fiche : « 📝 Écrire sur cette personne » (la biographie F5 déjà posée) */
    tools.writeAbout = async (pid, ctx = {}) => { try { const t = tools.TEMPLATES.find(x => x.key === 'recit'); const html = await t.html(pid); const ppl = await api('textdoc_people', {ids: String(pid)}).catch(() => ({people: {}})); return openDoc({...ctx, data: dataOf(html, {tpl: 'recit'}), name: `Récit — ${ppl.people?.[pid]?.name || 'un ancêtre'}`}); } catch (e) { toast(e.message, 'error'); } };

    /* ═════════ ⤒ Importer (K13) : un nouveau document fait du fichier ═════════ */
    async function readAny(file) {
        const buf = await file.arrayBuffer();
        if (/\.lcnda-texte$/i.test(file.name)) { const j = JSON.parse(new TextDecoder().decode(buf)); if (j?.format !== 'lcnda-texte' || !j.data?.sections) throw new Error('ce n’est pas un fichier du traitement de texte'); return {kind: 'lcnda', data: j.data, name: j.name, notices: []}; }
        const r = await T().readFile(file.name, buf);
        if (r.kind === 'html') { const c = K().cleanHtml(r.html.replace(/^[\s\S]*?<body[^>]*>|<\/body>[\s\S]*$/gi, '')); const notes = []; if (c.dropped) notes.push(`${plural(c.dropped, 'élément')} du fichier (scripts, formulaires, cadres…) retiré${c.dropped > 1 ? 's' : ''} : ils ne sont jamais lancés.`); if (c.extImg) notes.push(`${plural(c.extImg, 'image')} du web non reprise${c.extImg > 1 ? 's' : ''}.`); return {kind: 'html', data: dataOf(c.html), notices: notes}; }
        const im = r.doc, ed0 = new (K().Editor)({data: null}), base = ed0.doc;
        const data = {...base, page: {...base.page, ...im.page, cols: 1, size: undefined}, sections: im.sections.map(s => ({html: T().htmlOf(s), ...(s.page ? {page: {...s.page, cols: 1}} : {})})),
            header: {html: T().blocksHtml(im.header?.blocks || []), first: !!im.header?.first, firstHtml: T().blocksHtml(im.header?.firstBlocks || [])}, footer: {html: T().blocksHtml(im.footer?.blocks || []), first: !!im.footer?.first, firstHtml: T().blocksHtml(im.footer?.firstBlocks || [])},
            styles: im.styles, comments: im.comments || [], lang: (im.lang || 'fr').slice(0, 2), track: !!im.track, meta: {author: im.meta?.author || '', subject: ''}};
        return {kind: r.kind, data, name: im.title, notices: r.notices || [], im};
    }
    tools.readAny = readAny;
    function importDialog(again, file) {
        const KINDS = {docx: 'Word (.docx)', odt: 'LibreOffice (.odt)', rtf: 'RTF', md: 'Markdown', txt: 'texte', html: 'page web', lcnda: 'fichier du traitement de texte'};
        return UI().openImportDialog({title: '⤒ Importer un document', accept: ACCEPT, noun: 'mot', what: 'Word, LibreOffice, RTF, Markdown, texte, HTML', files: file ? [file] : undefined,
            analyze: async files => {
                const f = files[0]; const r = await readAny(f); const d = document.createElement('div'); d.innerHTML = r.data.sections.map(s => K().cleanHtml(s.html).html).join('');
                const words = T().wordCount(d.textContent), notes = d.querySelectorAll('sup.wp-fn').length, imgs = d.querySelectorAll('img').length, tables = d.querySelectorAll('table').length, heads = d.querySelectorAll('h1, h2, h3').length, tc = d.querySelectorAll('ins[data-tc], del[data-tc]').length;
                const notices = (r.notices || []).map(t => ({kind: 'warn', text: t}));
                const bits = [heads && plural(heads, 'titre'), tables && plural(tables, 'tableau'), imgs && plural(imgs, 'image'), notes && plural(notes, 'note'), r.data.comments?.length && plural(r.data.comments.length, 'commentaire'), tc && plural(tc, 'modification suivie'), r.data.sections.length > 1 && plural(r.data.sections.length, 'section')].filter(Boolean);
                if (bits.length) notices.push({kind: 'ok', text: `✓ Repris : ${bits.join(', ')}.`});
                if (r.data.header?.html || r.data.footer?.html) notices.push({kind: 'ok', text: '✓ En-tête et pied de page repris.'});
                return {count: words, allowEmpty: true, summaryHtml: `<b>${plural(words, 'mot')}</b> · ${esc(KINDS[r.kind] || r.kind)}${r.encoding ? ` · ${esc(window.LCNDA_SHEET?.ENC_LABEL?.[r.encoding] || r.encoding)}` : ''}`, notices, preview: `<div class="wp-diff" style="max-height:200px">${esc(d.textContent.trim().slice(0, 800))}${d.textContent.length > 800 ? '…' : ''}</div>`, data: {...r, name: (r.name || f.name.replace(/\.[^.]+$/, '')).slice(0, 160) || 'Document importé'}, goLabel: '⤒ Importer le document'};
            },
            run: async an => {
                const r = await post('save_textdoc', {name: an.data.name, kind: 'doc', data: an.data.data}), id = Number((r.result || r).id || 0);
                again?.(); setTimeout(() => openDoc({id, onSaved: again, onClose: again}).then(ed => ed && tools.adoptImages?.(ed)), 50);
                return {message: `Document « ${an.data.name} » importé (${plural(an.count, 'mot')})`, undo: async () => { await post('delete_textdoc', {id}); again?.(); }};
            }});
    }
    tools.importDialog = importDialog;

    /* ═════════ 📐 Envoyer vers la mise en page : le document devient des pages d'un livre ═════════ */
    const LY_PS = {title: 'ps-title', subtitle: 'ps-subtitle', h1: 'ps-chapter', h2: 'ps-head', h3: 'ps-name', h4: 'ps-head', h5: 'ps-head', h6: 'ps-head', quote: 'ps-quote', caption: 'ps-caption'};
    function lyRuns(runs, notes) {
        return T().mergeRuns(runs).map(r => {
            if (r.br) return '<br>'; if (r.tab) return ' '; if (r.tc?.k === 'del') return '';
            if (r.note) { notes.push(r.note.text || ''); return `<sup>${notes.length}</sup>`; }
            if (r.img || r.field && !r.fieldText) return '';
            let h = esc(r.x || r.fieldText || ''); if (!h) return '';
            if (r.sub) h = `<sub>${h}</sub>`; if (r.sup) h = `<sup>${h}</sup>`; if (r.s) h = `<s>${h}</s>`; if (r.u) h = `<u>${h}</u>`; if (r.i) h = `<i>${h}</i>`; if (r.b) h = `<b>${h}</b>`;
            if (r.href && /^https?:/i.test(r.href)) h = `<a href="${esc(r.href)}">${h}</a>`;
            return h;
        }).join('');
    }
    async function toLayout(ed) {
        const Kit = ext.layoutKit; if (!Kit) return toast('La mise en page n’est pas chargée.', 'error');
        const dlg = ext.openDialog({eyebrow: 'MISE EN PAGE', title: '📐 Envoyer vers la mise en page', submitLabel: 'Envoyer', body: `<p class="muted">Le texte devient des pages d’un livre (Mise en page) : les titres 1 deviennent des chapitres, les images des pages d’images avec leur légende, les notes une partie « Notes » à la fin. Ton document reste tel quel ici.</p>
            <div class="form-grid one-column"><label class="checkbox-line"><input type="radio" name="to" value="new" checked> Un nouveau livre</label><label class="checkbox-line"><input type="radio" name="to" value="end"> À la fin d’un livre existant</label><div data-ly-pick hidden>${(window.LCNDA_PICKER || A()).pickerField({name: 'ly', kind: 'layout', inline: true})}</div>
            <label>Design<select name="th">${(Kit.THEMES || []).map(t => `<option value="${esc(t.id)}">${esc(t.name || t.id)}</option>`).join('')}</select></label></div>`,
            onOpen: d => d.addEventListener('change', e => { if (e.target.name === 'to') d.querySelector('[data-ly-pick]').hidden = e.target.value !== 'end'; }),
            onSubmit: async f => {
                const toEnd = f.elements.to.value === 'end'; let lyId = 0, doc, name = ed.name, rev;
                if (toEnd) { lyId = Number(f.elements.ly.value); if (!lyId) return UI().fail(f.querySelector('[data-ly-pick] input') || f.elements.ly, 'Choisis le livre.'); const r = await api('layout_doc', {id: lyId}); doc = r.doc; name = r.name; rev = r.rev; }
                else { const th = Kit.THEMES.find(t => t.id === f.elements.th.value) || Kit.THEMES[0], g = ed.secs[0].geo; doc = Kit.themeDoc(th, '', {w: Math.round(g.wmm), h: Math.round(g.hmm)}); doc.title = ed.name; doc.pages = []; Kit.baseStyles({titleFont: th.titleFont, bodyFont: th.bodyFont, bodySize: 11}).forEach(s => { if (!doc.paraStyles.some(x => x.id === s.id)) doc.paraStyles.push(s); }); }
                const im = ed.imOf(), notes = [], all = im.sections.flatMap(s => s.blocks);
                let chunk = [], n = 0;
                const page = () => { const pg = {id: Kit.nid('p'), master: 'A', items: []}; doc.pages.push(pg); return pg; };
                const flushText = () => { if (!chunk.length) return; const pg = page(); Kit.flow(doc, chunk, {first: pg}); chunk = []; };
                const paraOf = (b, extra = {}) => ({ps: LY_PS[b.st] || (b.list ? 'ps-list' : 'ps-body'), text: T().plainOf(b.runs), html: (b.list ? (b.list.k === 'ol' ? '' : '• ') : '') + lyRuns(b.runs, notes), ...extra});
                const walk = bs => bs.forEach(b => {
                    if (b.t === 'p') { if (b.st === 'h1' && chunk.length) flushText(); if (T().plainOf(b.runs).trim() || b.runs.some(r => r.note)) chunk.push(paraOf(b)); n++; }
                    else if (b.t === 'pb') flushText();
                    else if (b.t === 'img') { flushText(); const pg = page(), bx = Kit.box(doc, doc.pages.length - 1); pg.items.push(Kit.shapeItem('frame', {x: bx.x, y: bx.y, w: bx.w, h: bx.h - (b.cap ? 12 : 0), src: /^media\//.test(b.src) ? b.src : '', mediaId: b.mid || undefined, srcName: b.cap || b.alt || '', fit: 'fit', fill: 'none', stroke: {c: 'none', w: 0}, name: 'Image'})); if (b.cap) pg.items.push(Kit.textItem({x: bx.x, y: bx.y + bx.h - 10, w: bx.w, h: 8, html: `<p data-ps="ps-caption">${esc(b.cap)}</p>`, name: 'Légende'})); }
                    else if (b.t === 'table') b.rows.forEach(row => chunk.push({ps: 'ps-list', text: row.map(c => (c.blocks || []).map(T().blockText).join(' ')).join(' · '), html: row.map(c => esc((c.blocks || []).map(T().blockText).join(' '))).join(' · ')}));
                    else if (b.blocks) walk(b.blocks);
                });
                walk(all); flushText();
                if (notes.length) { const pg = page(), bx = Kit.box(doc, doc.pages.length - 1); pg.items.push(Kit.textItem({x: bx.x, y: bx.y, w: bx.w, h: 18, html: '<p data-ps="ps-chapter">Notes</p>', name: 'Chapitre'})); pg.flowTop = bx.y + 20; Kit.flow(doc, notes.map((t, i) => ({ps: 'ps-list', lead: `${i + 1}.`, text: t})), {first: pg}); delete pg.flowTop; }
                Kit.openEditor({id: lyId, name, doc, rev});
                toast(`${plural(n, 'paragraphe')} envoyé${n > 1 ? 's' : ''} vers la mise en page : vérifie, puis enregistre le livre.`);
            }});
        void dlg;
    }

    /* ═════════ Dans 🛠️ Outils de modification ═════════ */
    const mini = d => `<span class="wp-mini${d.info?.page?.orient === 'landscape' ? ' is-land' : ''}"><b>${esc((d.info?.heads || [])[0] || d.name)}</b>${esc(String(d.info?.preview || '').slice(0, 260))}</span>`;
    ext.editToolsExtra = ext.editToolsExtra || [];
    ext.editToolsExtra.push({key: 'textdoc', icon: '📝', label: 'Traitement de texte', what: 'document',
        load: async () => ((await api('textdocs')).items || []).map(d => ({id: d.id, name: d.name, date: d.updated_at, thumb: mini(d), info: [plural(d.info?.words || 0, 'mot'), plural(d.info?.pages || 1, 'page'), d.info?.comments ? plural(d.info.comments, 'commentaire') : '', d.info?.tracked ? '✍ modifications à relire' : ''].filter(Boolean).join(' · ')})),
        open: (id, again) => openDoc({id, onSaved: again, onClose: again}),
        create: again => openDoc({onSaved: again, onClose: again}),
        rename: (id, name) => post('rename_textdoc', {id, name}),
        remove: id => post('delete_textdoc', {id}), createLabel: '＋ Nouveau document',
        extra: '<button type="button" class="button secondary" data-et-x="tpl" title="Lettre aux archives, demande d’acte, récit d’un ancêtre, compte rendu de visite, rapport de recherche…">📋 Partir d’un modèle</button><button type="button" class="button secondary" data-et-x="import" title="Word (.docx), LibreOffice (.odt), RTF, Markdown, texte, HTML">⤒ Importer…</button>',
        onExtra: (k, again) => { if (k === 'tpl') return chooseTemplate({onSaved: again, onClose: again}); if (k === 'import') return importDialog(again); }});

    /* ═════════ Les liens depuis le reste de l'app ═════════ */
    // 📝 sur la fiche d'une personne : « Écrire sur cette personne » (sans toucher app.js)
    ext.afterPerson = ext.afterPerson || [];
    ext.afterPerson.push(detail => {
        const p = detail?.person; if (!p?.id) return;
        const row = document.querySelector('#workspace .person-hero-actions'); if (!row || row.querySelector('[data-wp-write]')) return;
        row.insertAdjacentHTML('afterbegin', `<button type="button" class="icon-action" data-wp-write="${Number(p.id)}" title="📝 Écrire sur cette personne : un document du traitement de texte, avec sa biographie déjà posée" aria-label="Écrire sur cette personne">📝</button>`);
    });
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-wp-write]'); if (!b) return; e.preventDefault(); tools.writeAbout(Number(b.dataset.wpWrite)); });
    /** 🗓 un compte rendu fait des lignes du Journal des recherches (celles qui sont montrées) */
    tools.reportFromJournal = (rows = [], kinds = {}) => {
        const res = {found: 'Trouvé', none: 'Rien trouvé', partial: 'En partie', not_consulted: 'Pas consulté'};
        const tr = r => `<tr><td>${esc(String(r.date || '').slice(0, 10))}</td><td>${esc(kinds[r.kind]?.[1] || r.kind || '')}</td><td>${esc(r.title || '')}${r.cote ? `<br><small>${esc(r.cote)}</small>` : ''}</td><td>${esc(res[r.result] || r.result_label || '')}</td><td>${esc((r.people || []).map(p => p.title).join(', '))}</td></tr>`;
        const found = rows.filter(r => r.result === 'found'), html = `<p data-st="title">Compte rendu de recherche</p><p data-st="subtitle">${esc(new Date().toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'}))} — ${esc(plural(rows.length, 'recherche'))}</p><h1 data-st="h1">Ce qui a été cherché</h1><table class="wp-table"><thead><tr><th>Date</th><th>Sorte</th><th>Quoi</th><th>Résultat</th><th>Pour</th></tr></thead><tbody>${rows.slice(0, 600).map(tr).join('')}</tbody></table><h1 data-st="h1">Ce qui a été trouvé</h1>${found.length ? `<ul>${found.map(r => `<li data-st="normal">${esc(r.title)}${r.note ? ` — ${esc(r.note)}` : ''}</li>`).join('')}</ul>` : '<p data-st="normal">Rien de trouvé pour l’instant.</p>'}<h1 data-st="h1">La suite</h1><p data-st="normal"><span class="wp-ph">Ce qu’il reste à chercher, où, et les lettres à écrire…</span></p>`;
        return openDoc({data: dataOf(html, {tpl: 'rapport'}), name: 'Compte rendu de recherche'});
    };
    /** 🗄️ un compte rendu de visite d'archives (feuille de mission) */
    tools.reportFromVisit = plan => {
        const res = {found: 'Trouvé', none: 'Rien trouvé', partial: 'En partie', not_consulted: 'Pas consulté'};
        const html = `<p data-st="title">Compte rendu de visite</p><p data-st="subtitle">${esc(plan.archive_center || 'Archives')} — ${esc(String(plan.done_at || plan.visit_date || '').slice(0, 10) || new Date().toLocaleDateString('fr-FR'))}</p><h1 data-st="h1">${esc(plan.title || 'Feuille de mission')}</h1>${plan.notes ? `<p data-st="normal">${esc(plan.notes)}</p>` : ''}<h1 data-st="h1">Les cotes consultées</h1><table class="wp-table"><thead><tr><th>Cote</th><th>Ce que c’est</th><th>Résultat</th><th>Notes</th></tr></thead><tbody>${(plan.items || []).map(it => `<tr><td>${esc(it.archive_reference || '')}</td><td>${esc(it.title || it.label || '')}</td><td>${esc(res[it.result] || (Number(it.checked) ? 'Vu' : ''))}</td><td>${esc(it.notes || it.note || '')}</td></tr>`).join('') || '<tr><td><br></td><td><br></td><td><br></td><td><br></td></tr>'}</tbody></table><h1 data-st="h1">Ce que j’ai trouvé</h1><p data-st="normal"><span class="wp-ph">Les actes, les photos prises, les surprises…</span></p><h1 data-st="h1">La suite</h1><p data-st="normal"><span class="wp-ph">Prochaines cotes, lettres à écrire…</span></p>`;
        return openDoc({data: dataOf(html, {tpl: 'visite'}), name: `Visite — ${plan.archive_center || plan.title || 'archives'}`});
    };
    // le planificateur de visites (app-listes.js) : « 📝 Compte rendu » sur chaque feuille de mission
    const addVisitButtons = () => document.querySelectorAll('#workspace .archive-visit-plan[data-archive-visit-plan]').forEach(card => {
        if (card.querySelector('[data-wp-visit]')) return; const host = card.querySelector('header .page-actions, header > div:last-child, header') || card;
        const b = document.createElement('button'); b.type = 'button'; b.className = 'button small secondary'; b.dataset.wpVisit = card.dataset.archiveVisitPlan; b.textContent = '📝 Compte rendu'; b.title = 'Un compte rendu de cette visite dans le traitement de texte (cotes, résultats, la suite)'; host.appendChild(b);
    });
    let visitT = 0; new MutationObserver(() => { if (visitT) return; visitT = requestAnimationFrame(() => { visitT = 0; if (document.querySelector('#workspace .archive-visit-plan[data-archive-visit-plan]:not(:has([data-wp-visit]))')) addVisitButtons(); }); }).observe(document.getElementById('workspace') || document.body, {childList: true, subtree: true});
    document.addEventListener('click', async e => { const b = e.target.closest?.('[data-wp-visit]'); if (!b) return; e.preventDefault(); try { const d = await api('archive_visit_plans'); const plan = (d.plans || []).find(p => Number(p.id) === Number(b.dataset.wpVisit)); if (plan) tools.reportFromVisit(plan); } catch (err) { toast(err.message, 'error'); } });
})();
