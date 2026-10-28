/**
 * 📐 Atelier de mise en page (Réglages → Export propre → Livre de famille → « 📐 Mise en page ») : un petit InDesign
 * pour faire le livre de sa généalogie. Des documents faits de pages (simples ou en vis-à-vis), de gabarits (folios,
 * en-têtes), de calques ; des blocs de texte (caractère, paragraphe, styles, colonnes, habillage), des formes
 * (rectangle, ellipse, polygone, étoile, ligne, plume), des cadres d'images, un nuancier et des dégradés, des contours,
 * des effets (opacité, fusion, ombre, contour progressif, angles arrondis), un Pathfinder (ajouter, soustraire,
 * intersection, exclure), l'alignement, les liens (images placées). On part d'une page blanche, des données de la
 * famille ou d'un design (modèle) ; on enregistre, on exporte (PDF par l'impression, HTML, fichier du document).
 * Serveur : lib/layout_docs.php (table layout_documents) et layout_family_data (même contenu que le livre de famille).
 * Tout texte riche et toute image venant d'un document sont nettoyés avant d'être montrés (sanitizeHtml, srcOk).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => A().escapeHtml(v ?? '');
    const toast = (...a) => A().toast(...a);
    // Electron ne fournit pas window.prompt() : fenêtre de saisie de l’application
    const ask = async (message, value = '') => { const v = await A().askText({message, value: value ?? ''}); return v === null ? null : String(v); };
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});

    /* ═════════════ Unités, constantes ═════════════ */
    const MM = 96 / 25.4, PT = 96 / 72; // px par millimètre, px par point
    const px = mm => Math.round((Number(mm) || 0) * MM * 100) / 100;
    const r1 = v => Math.round((Number(v) || 0) * 10) / 10;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, Number(v) || 0));
    let seq = 0; const nid = p => p + Date.now().toString(36).slice(-5) + (++seq).toString(36) + Math.floor(Math.random() * 1296).toString(36);
    const DEF_KEY = 'genealogie-layout-defaults', FONTS_KEY = 'genealogie-layout-fonts';
    const SIZES = [['A4', 'A4 (21 × 29,7 cm)', 210, 297], ['A5', 'A5 (14,8 × 21 cm)', 148, 210], ['B5', 'B5 (17,6 × 25 cm)', 176, 250], ['royal', 'Livre (15,6 × 23,4 cm)', 156, 234],
        ['us6x9', 'Livre US (6 × 9 in)', 152.4, 228.6], ['letter', 'Lettre US', 215.9, 279.4], ['square', 'Carré (21 × 21 cm)', 210, 210], ['A4L', 'A4 à l’italienne', 297, 210], ['album', 'Album photo (28 × 21,6 cm)', 280, 216]];
    /* Formats à soi (« Enregistrer ce format » dans Nouveau document), proposés partout avec ceux de l'app */
    const FORMATS_KEY = 'genealogie-layout-formats';
    const myFormats = () => { let v = []; try { v = JSON.parse(localStorage.getItem(FORMATS_KEY) || '[]'); } catch (_) {} return (Array.isArray(v) ? v : []).filter(f => f && /^my_[a-z0-9]{1,24}$/.test(String(f.k)) && Number(f.w) >= 30 && Number(f.h) >= 30).slice(0, 60).map(f => ({k: f.k, name: String(f.name || 'Mon format').replace(/[<>"`]/g, '').slice(0, 60), w: clamp(f.w, 30, 1500), h: clamp(f.h, 30, 1500)})); };
    // (plus ceux de « Mes formats », la liste commune des outils : app-formats.js)
    const commonMine = () => { const F = window.LCNDA_FORMATS; return F?.own ? F.own().filter(m => m.unit !== 'px').map(m => { const [w, h] = F.inMm(m); return [m.id, `★ ${m.name}`, r1(w), r1(h)]; }).filter(x => x[2] >= 30 && x[3] >= 30) : []; };
    const allSizes = () => [...SIZES, ...myFormats().map(f => [f.k, `★ ${f.name} (${String(r1(f.w / 10)).replace('.', ',')} × ${String(r1(f.h / 10)).replace('.', ',')} cm)`, f.w, f.h]), ...commonMine()];
    const UNITS = [['mm', 'mm', 1], ['cm', 'cm', 10], ['in', 'pouces', 25.4], ['pt', 'points', 25.4 / 72]];
    /** Le choix du format : ceux de l'app, les miens, ou à mes mesures (unité, portrait / paysage), et l'enregistrer pour la prochaine fois */
    function formatFieldsHtml(w, h, {designOwn = false} = {}) {
        const match = allSizes().find(x => Math.abs(x[2] - w) < 0.2 && Math.abs(x[3] - h) < 0.2);
        return `<fieldset class="span-2 ly-format"><legend>Format de la page</legend><div class="ly-formatrow">
            <label>Format <select name="size">${designOwn ? '<option value="design" selected>Celui du design</option>' : ''}${allSizes().map(([k, l]) => `<option value="${esc(k)}" ${!designOwn && match?.[0] === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}<option value="custom" ${!designOwn && !match ? 'selected' : ''}>✏️ Personnalisé (à mes mesures)</option></select></label>
            <label>Largeur <input type="number" step="any" min="0" name="fw" value="${r1(w)}"></label><label>Hauteur <input type="number" step="any" min="0" name="fh" value="${r1(h)}"></label>
            <label>Unité <select name="unit">${UNITS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
            <div class="ly-orient"><button type="button" class="button small secondary" data-orient="portrait" title="Portrait (plus haut que large)">▯ Portrait</button><button type="button" class="button small secondary" data-orient="landscape" title="Paysage (plus large que haut)">▭ Paysage</button></div>
            <div class="ly-orient"><button type="button" class="button small secondary" data-fmt-save>＋ Enregistrer ce format</button><button type="button" class="button small secondary" data-fmt-del title="Supprimer ce format à moi" hidden>🗑</button></div></div>
            <p class="muted" data-fmt-info></p></fieldset>`;
    }
    function bindFormatFields(dg) {
        const sel = dg.querySelector('[name=size]'), fw = dg.querySelector('[name=fw]'), fh = dg.querySelector('[name=fh]'), unit = dg.querySelector('[name=unit]'), info = dg.querySelector('[data-fmt-info]'), del = dg.querySelector('[data-fmt-del]');
        if (!sel || !fw) return;
        let u = 1; // mm par unité affichée
        const mmW = () => (Number(fw.value) || 0) * u, mmH = () => (Number(fh.value) || 0) * u;
        const show = (w, h) => { fw.value = Math.round(w / u * 100) / 100; fh.value = Math.round(h / u * 100) / 100; };
        const note = () => { const w = mmW(), h = mmH(); info.textContent = sel.value === 'design' ? 'La page garde le format du design.' : w >= 30 && h >= 30 && w <= 1500 && h <= 1500 ? `${String(r1(w)).replace('.', ',')} × ${String(r1(h)).replace('.', ',')} mm — ${w > h ? 'paysage' : w < h ? 'portrait' : 'carré'}` : '⚠️ Entre 3 cm et 1,5 m de côté.'; del.hidden = !String(sel.value).startsWith('my_'); fw.disabled = fh.disabled = sel.value === 'design'; };
        sel.addEventListener('change', () => { const s0 = allSizes().find(x => x[0] === sel.value); if (s0) show(s0[2], s0[3]); note(); });
        [fw, fh].forEach(el => el.addEventListener('input', () => { const m = allSizes().find(x => Math.abs(x[2] - mmW()) < 0.2 && Math.abs(x[3] - mmH()) < 0.2); sel.value = m ? m[0] : 'custom'; note(); }));
        unit.addEventListener('change', () => { const w = mmW(), h = mmH(); u = (UNITS.find(x => x[0] === unit.value) || UNITS[0])[2]; show(w, h); note(); });
        dg.querySelectorAll('[data-orient]').forEach(b => b.addEventListener('click', () => { const w = mmW(), h = mmH(), land = b.dataset.orient === 'landscape'; if ((land && h > w) || (!land && w > h)) { show(h, w); fw.dispatchEvent(new Event('input')); } }));
        dg.querySelector('[data-fmt-save]').addEventListener('click', async () => {
            const w = mmW(), h = mmH(); if (!(w >= 30 && h >= 30 && w <= 1500 && h <= 1500)) return toast('Format entre 3 cm et 1,5 m de côté.', 'error');
            const name = (await ask('Nom de ce format (ex. Mon carnet 17 × 24) :', `${String(r1(w / 10)).replace('.', ',')} × ${String(r1(h / 10)).replace('.', ',')} cm`) || '').replace(/[<>"`]/g, '').trim().slice(0, 60); if (!name) return;
            const list = myFormats(), k = 'my_' + Date.now().toString(36); list.push({k, name, w: r1(w), h: r1(h)});
            try { localStorage.setItem(FORMATS_KEY, JSON.stringify(list)); } catch (_) {}
            sel.insertBefore(new Option(allSizes().find(x => x[0] === k)[1], k), sel.querySelector('option[value="custom"]')); sel.value = k; note(); toast(`Format « ${name} » enregistré : il est proposé pour les prochains documents.`);
        });
        del.addEventListener('click', async () => { const k = sel.value, f = myFormats().find(x => x.k === k); if (!f) return;
            // H7 : supprimé tout de suite, « ↶ Annuler » le remet (gardé sur cet ordinateur)
            const opt = sel.querySelector(`option[value="${k}"]`), optAt = opt?.nextSibling || null, optParent = opt?.parentNode;
            A().undoLocalChange(`Format « ${f.name} » supprimé`, [FORMATS_KEY], () => { try { localStorage.setItem(FORMATS_KEY, JSON.stringify(myFormats().filter(x => x.k !== k))); } catch (_) {} }, what => { if (!sel.isConnected || !opt || !optParent) return; if (what === 'undo') { optParent.insertBefore(opt, optAt && optAt.parentNode === optParent ? optAt : null); sel.value = k; } else { opt.remove(); sel.value = 'custom'; } note(); });
            opt?.remove(); sel.value = 'custom'; note(); });
        dg._formatMm = () => sel.value === 'design' ? null : {w: clamp(mmW(), 30, 1500), h: clamp(mmH(), 30, 1500)};
        note();
    }
    const BASE_FONTS = ['Georgia', 'Garamond', 'EB Garamond', 'Palatino', 'Book Antiqua', 'Baskerville', 'Times New Roman', 'Didot', 'Bodoni 72', 'Cochin', 'Hoefler Text', 'Big Caslon', 'Constantia', 'Cambria',
        'Helvetica Neue', 'Helvetica', 'Arial', 'Avenir', 'Avenir Next', 'Futura', 'Gill Sans', 'Optima', 'Verdana', 'Trebuchet MS', 'Segoe UI', 'Calibri', 'Candara', 'Franklin Gothic Medium', 'Courier New', 'American Typewriter',
        'Copperplate', 'Brush Script MT', 'Snell Roundhand', 'Savoye LET', 'Zapfino', 'Apple Chancery', 'Lucida Handwriting', 'Papyrus', 'Impact', 'Rockwell', 'serif', 'sans-serif', 'monospace', 'cursive'];
    const BLENDS = [['normal', 'Normal'], ['multiply', 'Produit'], ['screen', 'Superposition (écran)'], ['overlay', 'Incrustation'], ['soft-light', 'Lumière tamisée'], ['hard-light', 'Lumière crue'], ['darken', 'Obscurcir'], ['lighten', 'Éclaircir'], ['color-dodge', 'Densité couleur −'], ['color-burn', 'Densité couleur +'], ['difference', 'Différence'], ['exclusion', 'Exclusion'], ['hue', 'Teinte'], ['saturation', 'Saturation'], ['color', 'Couleur'], ['luminosity', 'Luminosité']];
    const DASHES = [['solid', 'Plein'], ['dash', 'Tirets'], ['dot', 'Pointillés'], ['dashdot', 'Tiret-point'], ['long', 'Tirets longs']];
    const WRAPS = [['none', 'Aucun habillage'], ['box', 'Autour du cadre'], ['shape', 'Autour de la forme (ellipse)'], ['jump', 'Saut d’objet (rien à côté)']];
    const FITS = [['fill', 'Remplir le cadre proportionnellement'], ['fit', 'Ajuster le contenu proportionnellement'], ['stretch', 'Ajuster le contenu au cadre (déformé)'], ['none', 'Taille d’origine (centrée)']];
    const SHAPES = ['rect', 'ellipse', 'polygon', 'star', 'line', 'path', 'frame', 'compound'];
    const hexOk = c => /^#[0-9a-f]{6}$/i.test(String(c || ''));
    const fontOk = f => String(f || '').replace(/[^\w\s\-'.,À-ÿ]/g, '').slice(0, 80);
    const srcOk = s => s === '' || /^media\/[A-Za-z0-9._%\-]{1,240}$/.test(s) || /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(s);

    /* ═════════════ Texte riche : seulement ce qui est prévu (contre le code glissé dans un fichier) ═════════════ */
    const TAGS = new Set(['P', 'DIV', 'SPAN', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SUB', 'SUP', 'A', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'SMALL']);
    const CSS_PROPS = new Set(['font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-variant-caps', 'font-stretch', 'font-kerning', 'line-height', 'letter-spacing', 'word-spacing', 'color', 'background-color', 'text-decoration', 'text-decoration-line', 'text-transform', 'text-align', 'text-align-last', 'text-indent', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'padding-left', 'vertical-align', 'position', 'top', 'hyphens', 'white-space']);
    function cleanStyle(st) {
        const out = new Map(); // une propriété n'apparaît qu'une fois : la dernière gagne
        String(st || '').split(';').forEach(d => { const i = d.indexOf(':'); if (i < 0) return; const k = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim(); if (!CSS_PROPS.has(k) || !v) return; if (/url\s*\(|expression|javascript:|@import|[<>\\]/i.test(v) || v.length > 200) return; if (k === 'position' && v !== 'relative') return; out.delete(k); out.set(k, v); });
        return [...out].map(([k, v]) => `${k}:${v}`).join(';');
    }
    function sanitizeHtml(html) {
        const doc = new DOMParser().parseFromString(`<div>${String(html || '').slice(0, 400000)}</div>`, 'text/html'), root = doc.body.firstElementChild;
        const walk = node => [...node.childNodes].forEach(n => {
            if (n.nodeType === 3) return;
            if (n.nodeType !== 1) { n.remove(); return; }
            if (!TAGS.has(n.tagName)) { if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|SVG|MATH|TEMPLATE|NOSCRIPT|LINK|META)$/.test(n.tagName)) { n.remove(); return; } walk(n); n.replaceWith(...n.childNodes); return; }
            [...n.attributes].forEach(a => {
                const k = a.name.toLowerCase();
                if (k === 'style') { const v = cleanStyle(a.value); if (v) n.setAttribute('style', v); else n.removeAttribute('style'); }
                else if ((k === 'data-ps' || k === 'data-cs') && /^[a-z0-9_-]{1,40}$/i.test(a.value)) { /* style de paragraphe / de caractère */ }
                else if (k === 'data-fn' && n.tagName === 'SUP' && /^[a-z0-9_-]{1,40}$/i.test(a.value)) { /* appel de note (numéroté à l'affichage) */ }
                else if (k === 'data-cm' && n.tagName === 'SPAN' && /^[a-z0-9_-]{1,40}$/i.test(a.value)) { /* passage commenté (relecture) */ }
                else if (k === 'href' && n.tagName === 'A' && /^(https?:\/\/|mailto:|#)/i.test(a.value.trim())) { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); }
                else if (k === 'target' || k === 'rel') { /* posés ci-dessus */ }
                else n.removeAttribute(a.name);
            });
            walk(n);
        });
        walk(root);
        return root.innerHTML;
    }
    const textToHtml = (t, ps) => String(t || '').split(/\n{2,}|\r?\n/).filter(x => x.trim() !== '').map(x => `<p${ps ? ` data-ps="${ps}"` : ''}>${esc(x)}</p>`).join('') || `<p${ps ? ` data-ps="${ps}"` : ''}><br></p>`;

    /* ═════════════ Réglages par défaut (Réglages : « Réglages par défaut » de l'atelier) ═════════════ */
    const DEFAULTS0 = {size: 'A4', w: 210, h: 297, facing: true, mt: 20, mb: 24, mi: 22, mo: 17, columns: 1, gutter: 5, bleed: 3, slug: 0, titleFont: 'Didot', bodyFont: 'Georgia', bodySize: 11, lead: 15, accent: '#7a2e2e', paper: '#ffffff', startPage: 1, folio: true};
    function defaults() {
        let v = {}; try { v = JSON.parse(localStorage.getItem(DEF_KEY) || '{}') || {}; } catch (_) {}
        const d = {...DEFAULTS0, ...v}, num = (k, a, b) => { d[k] = clamp(d[k], a, b); };
        num('w', 50, 1200); num('h', 50, 1200); ['mt', 'mb', 'mi', 'mo'].forEach(k => num(k, 0, 200)); num('columns', 1, 12); num('gutter', 0, 50); num('bleed', 0, 20); num('slug', 0, 60); num('bodySize', 5, 72); num('lead', 5, 120); num('startPage', 1, 9999);
        d.titleFont = fontOk(d.titleFont) || 'Georgia'; d.bodyFont = fontOk(d.bodyFont) || 'Georgia'; if (!hexOk(d.accent)) d.accent = DEFAULTS0.accent; if (!hexOk(d.paper)) d.paper = '#ffffff';
        d.facing = d.facing !== false; d.folio = d.folio !== false;
        return d;
    }

    /* ═════════════ Le document ═════════════ */
    const STYLE_IDS = ['ps-title', 'ps-subtitle', 'ps-author', 'ps-chapter', 'ps-name', 'ps-dates', 'ps-head', 'ps-body', 'ps-list', 'ps-quote', 'ps-caption', 'ps-folio', 'ps-running'];
    function baseStyles(t) {
        const T = t.titleFont, B = t.bodyFont, s = t.bodySize || 11, l = t.lead || Math.round(s * 1.38);
        return [
            {id: 'ps-body', name: 'Texte courant', font: B, size: s, lead: l, color: 'sw-text', align: 'justify', after: 2.5, indent: 0, hyph: true},
            {id: 'ps-title', name: 'Titre du livre', font: T, size: 40, lead: 46, color: 'sw-accent', align: 'center', after: 6, weight: 700},
            {id: 'ps-subtitle', name: 'Sous-titre', font: T, size: 18, lead: 24, color: 'sw-text', align: 'center', after: 4, italic: true},
            {id: 'ps-author', name: 'Auteur', font: B, size: 13, lead: 18, color: 'sw-soft', align: 'center', caps: 'small', track: 80},
            {id: 'ps-chapter', name: 'Chapitre', font: T, size: 28, lead: 34, color: 'sw-accent', align: 'left', after: 8, weight: 700},
            {id: 'ps-name', name: 'Nom d’une personne', font: T, size: 22, lead: 27, color: 'sw-accent', align: 'left', after: 1, weight: 700},
            {id: 'ps-dates', name: 'Dates et numéro', font: B, size: 10.5, lead: 14, color: 'sw-soft', align: 'left', after: 5, italic: true},
            {id: 'ps-head', name: 'Intertitre', font: T, size: 13, lead: 17, color: 'sw-accent', align: 'left', before: 4, after: 1.5, weight: 700, caps: 'small', track: 40},
            {id: 'ps-list', name: 'Liste', font: B, size: s - 0.5, lead: l - 1, color: 'sw-text', align: 'left', after: 0.8, left: 4, indent: -4},
            {id: 'ps-quote', name: 'Citation', font: T, size: s + 2, lead: l + 3, color: 'sw-text', align: 'center', before: 3, after: 3, italic: true, left: 10, right: 10},
            {id: 'ps-caption', name: 'Légende', font: B, size: 8.5, lead: 11, color: 'sw-soft', align: 'center', italic: true},
            {id: 'ps-folio', name: 'Folio (numéro de page)', font: B, size: 9, lead: 11, color: 'sw-soft', align: 'center'},
            {id: 'ps-running', name: 'Titre courant', font: B, size: 8, lead: 10, color: 'sw-soft', align: 'center', caps: 'all', track: 120},
        ];
    }
    function baseSwatches(t) {
        return [{id: 'sw-paper', name: 'Papier', type: 'color', c: t.paper || '#ffffff'}, {id: 'sw-black', name: 'Noir', type: 'color', c: '#111111'}, {id: 'sw-text', name: 'Texte', type: 'color', c: t.text || '#222222'},
            {id: 'sw-accent', name: 'Couleur du livre', type: 'color', c: t.accent || '#7a2e2e'}, {id: 'sw-soft', name: 'Gris doux', type: 'color', c: t.soft || '#6b6b6b'}, {id: 'sw-light', name: 'Fond léger', type: 'color', c: t.light || '#f3ece4'},
            {id: 'gr-accent', name: 'Dégradé du livre', type: 'grad', kind: 'linear', angle: 90, stops: [{c: t.accent || '#7a2e2e', p: 0}, {c: t.light || '#f3ece4', p: 100}]}];
    }
    function folioMaster(d, t) {
        const items = [];
        if (d.folio) {
            items.push(textItem({x: d.mo, y: d.h - d.mb + 7, w: d.w - d.mi - d.mo, h: 7, html: '<p data-ps="ps-folio">{page}</p>', name: 'Folio'}));
            items.push(textItem({x: d.mo, y: Math.max(4, d.mt - 11), w: d.w - d.mi - d.mo, h: 6, html: '<p data-ps="ps-running">{titre}</p>', name: 'Titre courant'}));
            if (t.rule !== false) items.push(shapeItem('line', {x: d.mo + (d.w - d.mi - d.mo) / 2 - 15, y: Math.max(4, d.mt - 4), w: 30, h: 0, stroke: {c: 'sw-accent', w: 0.6}, name: 'Filet'}));
        }
        return {id: 'A', name: 'A-Gabarit', items};
    }
    function newDoc(opts = {}) {
        const d = {...defaults(), ...opts};
        const t = {titleFont: d.titleFont, bodyFont: d.bodyFont, bodySize: d.bodySize, lead: d.lead, accent: d.accent, paper: d.paper, ...(opts.theme || {})};
        return {type: 'lcnda-mise-en-page', version: 1, title: opts.title || '',
            page: {w: d.w, h: d.h, facing: !!d.facing, margin: {t: d.mt, b: d.mb, i: d.mi, o: d.mo}, columns: d.columns, gutter: d.gutter, bleed: d.bleed, slug: d.slug, paper: 'sw-paper', start: d.startPage},
            swatches: baseSwatches(t), paraStyles: baseStyles(t), charStyles: [{id: 'cs-em', name: 'Accent', color: 'sw-accent', italic: true}, {id: 'cs-caps', name: 'Petites capitales', caps: 'small', track: 40}, {id: 'cs-bold', name: 'Gras', weight: 700}],
            layers: [{id: 'L1', name: 'Calque 1', visible: true, locked: false, color: '#4a7dff'}],
            masters: [folioMaster(d, t), {id: 'B', name: 'B-Sans folio', items: []}],
            pages: [{id: nid('p'), master: 'A', items: []}], uid: nid('d'), fn: {place: 'block', restart: 'none'}, notes: {}, review: {comments: []}};
    }
    function textItem(o) { return {id: nid('t'), type: 'text', layer: 'L1', x: 20, y: 20, w: 100, h: 30, rot: 0, html: '<p data-ps="ps-body"><br></p>', inset: 0, columns: 1, gutter: 4, valign: 'top', fill: 'none', stroke: {c: 'none', w: 0}, opacity: 100, ...o}; }
    function shapeItem(type, o) { return {id: nid('s'), type, layer: 'L1', x: 20, y: 20, w: 50, h: 50, rot: 0, fill: type === 'line' || type === 'frame' ? 'none' : 'sw-light', stroke: {c: type === 'frame' ? 'none' : 'sw-black', w: type === 'line' ? 1 : 0.5}, opacity: 100, ...o}; }

    /** Un document reçu (serveur ou fichier) remis d'aplomb : rien d'inconnu n'est gardé, les textes sont nettoyés */
    function cleanDoc(raw) {
        const d = raw && typeof raw === 'object' ? raw : {}, P = d.page || {}, M = P.margin || {};
        const out = {type: 'lcnda-mise-en-page', version: 1, title: String(d.title || '').slice(0, 200),
            page: {w: clamp(P.w || 210, 30, 1500), h: clamp(P.h || 297, 30, 1500), facing: !!P.facing, margin: {t: clamp(M.t, 0, 300), b: clamp(M.b, 0, 300), i: clamp(M.i, 0, 300), o: clamp(M.o, 0, 300)}, columns: clamp(P.columns || 1, 1, 12), gutter: clamp(P.gutter, 0, 60), bleed: clamp(P.bleed, 0, 30), slug: clamp(P.slug, 0, 80), paper: paintOk(P.paper) ? P.paper : 'sw-paper', start: clamp(P.start || 1, 1, 9999)}};
        const idOk = v => /^[a-z0-9_-]{1,40}$/i.test(String(v || ''));
        out.swatches = (Array.isArray(d.swatches) ? d.swatches : []).filter(s => s && idOk(s.id)).slice(0, 300).map(s => s.type === 'grad'
            ? {id: s.id, name: String(s.name || 'Dégradé').slice(0, 60), type: 'grad', kind: s.kind === 'radial' ? 'radial' : 'linear', angle: clamp(s.angle, -360, 360), stops: (Array.isArray(s.stops) ? s.stops : []).filter(x => x && hexOk(x.c)).slice(0, 8).map(x => ({c: x.c, p: clamp(x.p, 0, 100)}))}
            : {id: s.id, name: String(s.name || 'Couleur').slice(0, 60), type: 'color', c: hexOk(s.c) ? s.c : '#000000'});
        if (!out.swatches.some(s => s.id === 'sw-paper')) out.swatches.unshift({id: 'sw-paper', name: 'Papier', type: 'color', c: '#ffffff'});
        const style = s => { const o = {id: s.id, name: String(s.name || 'Style').slice(0, 60)}; if (s.font) o.font = fontOk(s.font); ['size', 'lead', 'before', 'after', 'indent', 'left', 'right', 'track', 'weight', 'drop', 'shift'].forEach(k => { if (s[k] !== undefined && s[k] !== '') o[k] = clamp(s[k], -2000, 2000); }); if (paintOk(s.color)) o.color = s.color; if (['left', 'center', 'right', 'justify', 'justify-all'].includes(s.align)) o.align = s.align; ['italic', 'hyph', 'underline', 'strike'].forEach(k => { if (s[k]) o[k] = true; }); if (['small', 'all', 'none'].includes(s.caps)) o.caps = s.caps; if (['sup', 'sub'].includes(s.pos)) o.pos = s.pos; return o; };
        out.paraStyles = (Array.isArray(d.paraStyles) ? d.paraStyles : []).filter(s => s && idOk(s.id)).slice(0, 200).map(style);
        out.charStyles = (Array.isArray(d.charStyles) ? d.charStyles : []).filter(s => s && idOk(s.id)).slice(0, 200).map(style);
        out.layers = (Array.isArray(d.layers) ? d.layers : []).filter(l => l && idOk(l.id)).slice(0, 60).map(l => ({id: l.id, name: String(l.name || 'Calque').slice(0, 60), visible: l.visible !== false, locked: !!l.locked, color: hexOk(l.color) ? l.color : '#4a7dff'}));
        if (!out.layers.length) out.layers = [{id: 'L1', name: 'Calque 1', visible: true, locked: false, color: '#4a7dff'}];
        const items = list => (Array.isArray(list) ? list : []).slice(0, 3000).map(cleanItem).filter(Boolean).map(it => { if (!out.layers.some(l => l.id === it.layer)) it.layer = out.layers[0].id; return it; });
        out.masters = (Array.isArray(d.masters) ? d.masters : []).filter(m => m && idOk(m.id)).slice(0, 40).map(m => ({id: m.id, name: String(m.name || 'Gabarit').slice(0, 60), items: items(m.items)}));
        out.pages = (Array.isArray(d.pages) ? d.pages : []).slice(0, 2000).map(p => ({id: idOk(p?.id) ? p.id : nid('p'), master: out.masters.some(m => m.id === p?.master) ? p.master : '', items: items(p?.items), ...(p?.size && Number(p.size.w) > 0 && Number(p.size.h) > 0 ? {size: {w: clamp(p.size.w, 30, 1500), h: clamp(p.size.h, 30, 1500)}} : {})}));
        if (!out.pages.length) out.pages.push({id: nid('p'), master: out.masters[0]?.id || '', items: []});
        // l'identité du document (relecture), ses notes de bas de page et les commentaires des relecteurs
        out.uid = /^[a-z0-9]{6,40}$/i.test(String(d.uid || '')) ? d.uid : nid('d');
        out.fn = {place: d.fn?.place === 'chapter' ? 'chapter' : 'block', restart: ['none', 'chapter', 'page'].includes(d.fn?.restart) ? d.fn.restart : (d.fn?.place === 'chapter' ? 'chapter' : 'none')};
        out.notes = {}; Object.entries(d.notes && typeof d.notes === 'object' ? d.notes : {}).slice(0, 5000).forEach(([k, n]) => { if (!idOk(k) || !n || typeof n !== 'object') return; const o = {text: String(n.text || '').slice(0, 3000)}; if (Number(n.src) > 0) { o.src = Math.round(Number(n.src)); o.srcLabel = String(n.srcLabel || '').slice(0, 400); } out.notes[k] = o; });
        out.review = cleanReview(d.review);
        // ℹ️ Fichier → Informations du document (titre, auteur, sujet, mots-clés, langue, ISBN) : vont dans le PDF et l'ePub
        const info = window.LCNDA_FORMATS?.cleanInfo ? window.LCNDA_FORMATS.cleanInfo(d.info, ['title', 'author', 'subject', 'desc', 'keywords', 'lang', 'isbn']) : {}; if (Object.keys(info).length) out.info = info;
        if (/^[A-Za-z0-9_:-]{1,40}$/.test(String(P.fmt || ''))) out.page.fmt = String(P.fmt);
        if (['mm', 'cm', 'in'].includes(P.unit)) out.page.unit = P.unit;
        return out;
    }
    /** Les commentaires de relecture : texte, auteur, réponses, résolu, suggestion de changement (remplacer « … » par « … ») */
    function cleanReview(rv) {
        const txt = (v, n) => String(v ?? '').slice(0, n), when = v => /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(String(v || '')) ? String(v) : new Date().toISOString();
        const list = (Array.isArray(rv?.comments) ? rv.comments : []).slice(0, 3000).filter(c => c && /^[a-z0-9_-]{1,40}$/i.test(String(c.id || ''))).map(c => {
            const o = {id: c.id, text: txt(c.text, 4000), author: txt(c.author, 80) || 'Moi', at: when(c.at), resolved: !!c.resolved, item: /^[a-z0-9_-]{1,40}$/i.test(String(c.item || '')) ? c.item : '', quote: txt(c.quote, 600), page: clamp(c.page ?? -1, -1, 5000)};
            if (c.status && ['accepted', 'refused'].includes(c.status)) o.status = c.status;
            if (c.suggest && typeof c.suggest === 'object') o.suggest = {from: txt(c.suggest.from, 2000), to: txt(c.suggest.to, 2000)};
            o.replies = (Array.isArray(c.replies) ? c.replies : []).slice(0, 200).filter(r => r && r.text).map(r => ({id: /^[a-z0-9_-]{1,40}$/i.test(String(r.id || '')) ? r.id : nid('r'), text: txt(r.text, 4000), author: txt(r.author, 80) || 'Moi', at: when(r.at)}));
            return o;
        });
        return {comments: list};
    }
    const AUTO_KINDS = ['toc', 'index', 'places', 'jobs', 'notes', 'biblio'];
    const TREE_MODES = [['asc', 'Ascendance (les ancêtres)'], ['desc', 'Descendance (les enfants, petits-enfants…)'], ['both', 'Sablier (ancêtres en haut, descendants en bas)'], ['fan', 'Éventail (roue des ancêtres)']];
    const TREE_STYLES = [['classic', 'Classique (cases arrondies, couleur du livre)'], ['color', 'Couleurs (bleu les hommes, rose les femmes)'], ['plain', 'Sobre (simple trait)'], ['cartouche', 'Cartouche (double filet)']];
    const cleanTree = t => ({root: Math.round(Number(t.root)), mode: TREE_MODES.some(m => m[0] === t.mode) ? t.mode : 'asc', gens: clamp(Math.round(Number(t.gens) || 4), 2, 10), style: TREE_STYLES.some(m => m[0] === t.style) ? t.style : 'classic', photos: !!t.photos, dates: t.dates !== false, places: !!t.places, at: String(t.at || '').slice(0, 40)});
    function paintOk(f) { return f === 'none' || hexOk(f) || /^(sw|gr)-[a-z0-9_-]{1,36}$/i.test(String(f || '')); }
    function cleanItem(it) {
        if (!it || typeof it !== 'object' || !['text', ...SHAPES, 'image'].includes(it.type)) return null;
        const o = {id: /^[a-z0-9_-]{1,40}$/i.test(String(it.id || '')) ? it.id : nid('x'), type: it.type, layer: String(it.layer || 'L1').slice(0, 40), name: String(it.name || '').slice(0, 80),
            x: clamp(it.x, -2000, 4000), y: clamp(it.y, -2000, 4000), w: clamp(it.w, 0, 4000), h: clamp(it.h, 0, 4000), rot: clamp(it.rot, -360, 360), opacity: clamp(it.opacity ?? 100, 0, 100)};
        ['locked', 'hidden', 'flipX', 'flipY', 'smooth', 'closed', 'lockRatio'].forEach(k => { if (it[k]) o[k] = true; });
        o.fill = paintOk(it.fill) ? it.fill : 'none';
        o.stroke = {c: paintOk(it.stroke?.c) ? it.stroke.c : 'none', w: clamp(it.stroke?.w, 0, 100), dash: DASHES.some(x => x[0] === it.stroke?.dash) ? it.stroke.dash : 'solid', cap: ['butt', 'round', 'square'].includes(it.stroke?.cap) ? it.stroke.cap : 'butt', join: ['miter', 'round', 'bevel'].includes(it.stroke?.join) ? it.stroke.join : 'miter'};
        if (BLENDS.some(b => b[0] === it.blend)) o.blend = it.blend;
        if (it.shadow && typeof it.shadow === 'object') o.shadow = {on: !!it.shadow.on, x: clamp(it.shadow.x, -50, 50), y: clamp(it.shadow.y, -50, 50), blur: clamp(it.shadow.blur, 0, 50), c: hexOk(it.shadow.c) ? it.shadow.c : '#000000', o: clamp(it.shadow.o ?? 50, 0, 100)};
        ['feather', 'radius', 'sides', 'inner', 'inset', 'columns', 'gutter', 'imgX', 'imgY', 'imgS'].forEach(k => { if (it[k] !== undefined) o[k] = clamp(it[k], -1000, 1000); });
        if (it.wrap && WRAPS.some(w => w[0] === it.wrap.mode)) o.wrap = {mode: it.wrap.mode, off: clamp(it.wrap.off, 0, 100)};
        if (it.type === 'text') { o.html = sanitizeHtml(it.html); o.valign = ['top', 'middle', 'bottom', 'justify'].includes(it.valign) ? it.valign : 'top'; }
        if (typeof it.src === 'string') o.src = srcOk(it.src) ? it.src : '';
        if (typeof it.srcName === 'string') o.srcName = it.srcName.slice(0, 200);
        if (FITS.some(f => f[0] === it.fit)) o.fit = it.fit;
        if (['rect', 'ellipse', 'polygon', 'star'].includes(it.shape)) o.shape = it.shape;
        if (Array.isArray(it.points)) o.points = it.points.slice(0, 2000).filter(p => Array.isArray(p)).map(p => [clamp(p[0], -10, 10), clamp(p[1], -10, 10)]);
        if (it.type === 'compound') { o.op = ['union', 'subtract', 'intersect', 'exclude'].includes(it.op) ? it.op : 'union'; o.parts = (Array.isArray(it.parts) ? it.parts : []).slice(0, 40).map(cleanItem).filter(p => p && p.type !== 'text' && p.type !== 'compound'); }
        if (typeof it.link === 'string' && /^(https?:\/\/|mailto:)/i.test(it.link)) o.link = it.link.slice(0, 1000);
        // texte chaîné, sommaire et index automatiques, objets dynamiques (média de l'app, texte d'une fiche)
        if (it.type === 'text' && /^[a-z0-9_-]{1,40}$/i.test(String(it.next || ''))) o.next = it.next;
        if (it.type === 'text' && AUTO_KINDS.includes(it.auto)) { o.auto = it.auto; o.autoStyles = (Array.isArray(it.autoStyles) ? it.autoStyles : []).filter(x => /^[a-z0-9_-]{1,40}$/i.test(String(x))).slice(0, 12); o.autoPs = /^[a-z0-9_-]{1,40}$/i.test(String(it.autoPs || '')) ? it.autoPs : 'ps-body'; o.autoDots = it.autoDots !== false;
            if (Array.isArray(it.names)) o.names = it.names.filter(n => typeof n === 'string').slice(0, 20000).map(n => n.slice(0, 160));
            if (Array.isArray(it.terms)) o.terms = it.terms.filter(n => typeof n === 'string' && n.trim()).slice(0, 20000).map(n => n.slice(0, 120)); }
        if (it.type === 'frame' && it.tree && Number(it.tree.root) > 0) o.tree = cleanTree(it.tree);
        if (it.type === 'frame' && it.qr && typeof it.qr === 'object' && String(it.qr.text || '').trim()) o.qr = {kind: ['person', 'url', 'text'].includes(it.qr.kind) ? it.qr.kind : 'text', text: String(it.qr.text).slice(0, 600), person: Math.max(0, Math.round(Number(it.qr.person) || 0)), dark: hexOk(it.qr.dark) ? it.qr.dark : '#000000', light: it.qr.light === 'none' ? 'none' : hexOk(it.qr.light) ? it.qr.light : '#ffffff', quiet: clamp(it.qr.quiet ?? 4, 0, 10)}; // ▦ QR code (redessiné d'après ces réglages)
        if (Number(it.mediaId) > 0) o.mediaId = Math.round(Number(it.mediaId));
        if (it.type === 'frame' && Number(it.diagramId) > 0) o.diagramId = Math.round(Number(it.diagramId));
        if (it.type === 'text' && it.dyn?.type === 'person' && Number(it.dyn.id) > 0) o.dyn = {type: 'person', id: Math.round(Number(it.dyn.id)), fields: (Array.isArray(it.dyn.fields) ? it.dyn.fields : []).filter(f => DYN_FIELDS.some(d => d[0] === f)), at: String(it.dyn.at || '').slice(0, 40)};
        if (it.type === 'text' && it.dyn?.type === 'meteo' && Number(it.dyn.id) > 0) o.dyn = {type: 'meteo', id: Math.round(Number(it.dyn.id)), at: String(it.dyn.at || '').slice(0, 40)}; // 🌦 encadré météo d'un événement (heritage-meteo.js)
        if (it.type === 'text' && it.dyn?.type === 'art' && Number(it.dyn.id) > 0) o.dyn = {type: 'art', id: Math.round(Number(it.dyn.id)), fields: (Array.isArray(it.dyn.fields) ? it.dyn.fields : []).map(String).slice(0, 60), part: String(it.dyn.part || '').slice(0, 20), at: String(it.dyn.at || '').slice(0, 40)}; // 🎨 notice qui suit sa fiche
        return o;
    }

    /* ═════════════ Couleurs et dégradés ═════════════ */
    const swatch = (doc, id) => doc.swatches.find(s => s.id === id);
    function colorOf(doc, f, fallback = 'none') { if (!f || f === 'none') return fallback; if (hexOk(f)) return f; const s = swatch(doc, f); return s ? (s.type === 'grad' ? (s.stops[0]?.c || fallback) : s.c) : fallback; }
    function cssPaint(doc, f) {
        if (!f || f === 'none') return 'transparent'; if (hexOk(f)) return f;
        const s = swatch(doc, f); if (!s) return 'transparent'; if (s.type !== 'grad') return s.c;
        const stops = (s.stops.length ? s.stops : [{c: '#000', p: 0}, {c: '#fff', p: 100}]).map(x => `${x.c} ${x.p}%`).join(',');
        return s.kind === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${90 - (s.angle || 0) + 90}deg, ${stops})`;
    }
    /** Peinture SVG : une couleur, ou un dégradé ajouté aux définitions de l'objet */
    function svgPaint(doc, f, defs, key) {
        if (!f || f === 'none') return 'none'; if (hexOk(f)) return f;
        const s = swatch(doc, f); if (!s) return 'none'; if (s.type !== 'grad') return s.c;
        const id = `g${key}`, stops = s.stops.map(x => `<stop offset="${x.p}%" stop-color="${x.c}"/>`).join('');
        defs.push(s.kind === 'radial' ? `<radialGradient id="${id}">${stops}</radialGradient>` : `<linearGradient id="${id}" gradientTransform="rotate(${-(s.angle || 0)} .5 .5)">${stops}</linearGradient>`);
        return `url(#${id})`;
    }

    /* ═════════════ Formes ═════════════ */
    function shapePath(it, w, h) {
        const kind = it.type === 'frame' || it.type === 'image' ? (it.shape || 'rect') : it.type;
        if (kind === 'rect') { const r = Math.min(px(it.radius || 0), w / 2, h / 2); return r > 0 ? `M${r},0H${w - r}A${r},${r} 0 0 1 ${w},${r}V${h - r}A${r},${r} 0 0 1 ${w - r},${h}H${r}A${r},${r} 0 0 1 0,${h - r}V${r}A${r},${r} 0 0 1 ${r},0Z` : `M0,0H${w}V${h}H0Z`; }
        if (kind === 'ellipse') return `M0,${h / 2}A${w / 2},${h / 2} 0 1 0 ${w},${h / 2}A${w / 2},${h / 2} 0 1 0 0,${h / 2}Z`;
        if (kind === 'polygon' || kind === 'star') {
            const n = Math.round(clamp(it.sides || (kind === 'star' ? 5 : 6), 3, 60)), inner = clamp(it.inner || 45, 5, 100) / 100, pts = [];
            for (let i = 0; i < (kind === 'star' ? n * 2 : n); i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / (kind === 'star' ? n * 2 : n), rr = kind === 'star' && i % 2 ? inner : 1; pts.push(`${r1(w / 2 + Math.cos(a) * w / 2 * rr)},${r1(h / 2 + Math.sin(a) * h / 2 * rr)}`); }
            return `M${pts.join('L')}Z`;
        }
        if (kind === 'line') return it.flipLine ? `M0,${h}L${w},0` : `M0,0L${w},${h}`;
        if (kind === 'path') {
            const P = (it.points || []).map(([x, y]) => [x * w, y * h]); if (P.length < 2) return '';
            if (!it.smooth) return `M${P.map(p => p.map(r1).join(',')).join('L')}${it.closed ? 'Z' : ''}`;
            // courbe douce qui passe par les points (Catmull-Rom → Bézier)
            const Q = it.closed ? [P.at(-1), ...P, P[0], P[1]] : [P[0], ...P, P.at(-1)]; let d = `M${r1(P[0][0])},${r1(P[0][1])}`;
            for (let i = 1; i < Q.length - 2; i++) { const [p0, p1, p2, p3] = [Q[i - 1], Q[i], Q[i + 1], Q[i + 2]]; d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)},${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)},${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])},${r1(p2[1])}`; }
            return d + (it.closed ? 'Z' : '');
        }
        return `M0,0H${w}V${h}H0Z`;
    }
    const dashArray = (dash, w) => ({dash: `${w * 4} ${w * 2.5}`, dot: `0 ${w * 2.2}`, dashdot: `${w * 4} ${w * 2} 0 ${w * 2}`, long: `${w * 9} ${w * 3}`}[dash] || '');
    function strokeAttrs(doc, it, defs, key) {
        const s = it.stroke || {}; if (!s.c || s.c === 'none' || !(s.w > 0)) return 'stroke="none"';
        const w = s.w * PT, da = dashArray(s.dash, w);
        return `stroke="${svgPaint(doc, s.c, defs, key + 's')}" stroke-width="${r1(w)}" stroke-linecap="${s.dash === 'dot' ? 'round' : s.cap || 'butt'}" stroke-linejoin="${s.join || 'miter'}"${da ? ` stroke-dasharray="${da}"` : ''}`;
    }
    /** Partie d'un objet composé (Pathfinder), dans le repère de l'objet */
    const partPath = (p) => { const w = px(p.w), h = px(p.h), cx = px(p.x) + w / 2, cy = px(p.y) + h / 2; return {d: shapePath(p, w, h), tr: `translate(${r1(px(p.x))},${r1(px(p.y))})${p.rot ? ` rotate(${p.rot} ${r1(w / 2)} ${r1(h / 2)})` : ''}`, cx, cy}; };
    function compoundSvg(doc, it, w, h, key) {
        const defs = [], parts = (it.parts || []).map(partPath); if (!parts.length) return '';
        const fill = svgPaint(doc, it.fill, defs, key + 'f'), stroke = strokeAttrs(doc, it, defs, key), sw = (it.stroke?.c && it.stroke.c !== 'none' ? (it.stroke.w || 0) * PT : 0);
        const el = (p, extra) => `<path d="${p.d}" transform="${p.tr}" ${extra}/>`;
        let body = '';
        if (it.op === 'exclude') body = `<path d="${parts.map(transformD).join(' ')}" fill-rule="evenodd" fill="${fill}" ${stroke}/>`;
        else if (it.op === 'union') body = (sw ? parts.map(p => el(p, `fill="none" ${stroke.replace(/stroke-width="[^"]*"/, `stroke-width="${r1(sw * 2)}"`)}`)).join('') : '') + parts.map(p => el(p, `fill="${fill === 'none' && sw ? '#fff' : fill}" stroke="none"`)).join('');
        else if (it.op === 'intersect') { let g = el(parts[0], `fill="${fill}" ${stroke}`); parts.slice(1).forEach((p, i) => { defs.push(`<clipPath id="c${key}${i}">${el(p, '')}</clipPath>`); g = `<g clip-path="url(#c${key}${i})">${g}</g>`; }); body = g; }
        else { defs.push(`<mask id="m${key}" maskUnits="userSpaceOnUse" x="-5000" y="-5000" width="10000" height="10000"><rect x="-5000" y="-5000" width="10000" height="10000" fill="#fff"/>${parts.slice(1).map(p => el(p, 'fill="#000"')).join('')}</mask>`); body = `<g mask="url(#m${key})">${el(parts[0], `fill="${fill}" ${stroke}`)}</g>`; }
        return `<svg class="ly-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="visible"><defs>${defs.join('')}</defs>${body}</svg>`;
    }
    /** Le tracé d'une partie, ses points passés dans le repère de l'objet (pour « Exclure » : un seul tracé pair-impair) */
    function transformD(p) {
        const m = /translate\(([-\d.]+),([-\d.]+)\)(?: rotate\(([-\d.]+) ([-\d.]+) ([-\d.]+)\))?/.exec(p.tr); if (!m) return p.d;
        const tx = +m[1], ty = +m[2], a = (+m[3] || 0) * Math.PI / 180, ox = +m[4] || 0, oy = +m[5] || 0, cos = Math.cos(a), sin = Math.sin(a);
        const T = (x, y) => { const X = ox + (x - ox) * cos - (y - oy) * sin, Y = oy + (x - ox) * sin + (y - oy) * cos; return `${r1(X + tx)},${r1(Y + ty)}`; };
        // les arcs (ellipses) sont remplacés par des segments pour pouvoir être tournés
        const pts = samplePath(p.d); return pts.length ? `M${pts.map(([x, y]) => T(x, y)).join('L')}Z` : p.d;
    }
    function samplePath(d) {
        try { const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), path = document.createElementNS(NS, 'path'); path.setAttribute('d', d); svg.appendChild(path); svg.style.cssText = 'position:absolute;visibility:hidden'; document.body.appendChild(svg); const L = path.getTotalLength(), n = Math.min(240, Math.max(16, Math.round(L / 4))), out = []; for (let i = 0; i < n; i++) { const q = path.getPointAtLength(L * i / n); out.push([q.x, q.y]); } svg.remove(); return out; } catch (_) { return []; }
    }

    /* ═════════════ Styles de paragraphe et de caractère → CSS ═════════════ */
    function styleCss(doc, s, para) {
        const out = [];
        if (s.font) out.push(`font-family:"${fontOk(s.font)}",serif`);
        if (s.size) out.push(`font-size:${r1(s.size * PT)}px`);
        if (s.lead) out.push(`line-height:${r1(s.lead * PT)}px`);
        if (s.color) out.push(`color:${colorOf(doc, s.color, '#111')}`);
        if (s.weight) out.push(`font-weight:${clamp(s.weight, 100, 900)}`);
        if (s.italic) out.push('font-style:italic');
        if (s.caps === 'small') out.push('font-variant-caps:small-caps'); if (s.caps === 'all') out.push('text-transform:uppercase');
        if (s.track) out.push(`letter-spacing:${r1(s.track / 1000)}em`);
        if (s.underline || s.strike) out.push(`text-decoration:${[s.underline && 'underline', s.strike && 'line-through'].filter(Boolean).join(' ')}`);
        if (s.pos) out.push(`vertical-align:${s.pos === 'sup' ? 'super' : 'sub'};font-size:70%`);
        if (s.shift) out.push(`position:relative;top:${r1(-s.shift * PT)}px`);
        if (para) {
            if (s.align) out.push(s.align === 'justify-all' ? 'text-align:justify;text-align-last:justify' : `text-align:${s.align}`);
            if (s.before) out.push(`margin-top:${px(s.before)}px`); out.push(`margin-bottom:${px(s.after || 0)}px`);
            if (s.left) out.push(`margin-left:${px(s.left)}px`); if (s.right) out.push(`margin-right:${px(s.right)}px`);
            if (s.indent) out.push(`text-indent:${px(s.indent)}px`);
            if (s.hyph) out.push('hyphens:auto;-webkit-hyphens:auto');
        }
        return out.join(';');
    }
    function docCss(doc, scope) {
        const S = `${scope} `;
        return [...doc.paraStyles.map(s => `${S}[data-ps="${s.id}"]{${styleCss(doc, s, true)}}${s.drop ? `${S}[data-ps="${s.id}"]::first-letter{float:left;font-size:${r1(clamp(s.drop, 2, 8) * (s.lead || 14) * PT * 0.95)}px;line-height:1;margin:${r1(PT * 2)}px ${r1(PT * 4)}px 0 0;font-weight:700;color:${colorOf(doc, s.dropColor || s.color, 'inherit')}}` : ''}`),
            ...doc.charStyles.map(s => `${S}[data-cs="${s.id}"]{${styleCss(doc, s, false)}}`),
            // les notes en bas des blocs : le texte courant, plus petit
            (() => { const b = doc.paraStyles.find(x => x.id === 'ps-body') || {}; return `${S}.ly-fnotes{${styleCss(doc, {font: b.font, size: r1((b.size || 11) * 0.78), lead: r1((b.lead || 15) * 0.78), color: b.color}, false)};text-align:left}`; })()].join('\n');
    }

    /* ═════════════ Rendu (en texte HTML : le même pour l'écran, l'impression et le fichier HTML) ═════════════ */
    const isLeftPage = (doc, i) => doc.page.facing && (i + (doc.page.start || 1)) % 2 === 0;
    const pageMargins = (doc, i) => { const m = doc.page.margin, left = isLeftPage(doc, i); return {t: m.t, b: m.b, l: doc.page.facing ? (left ? m.o : m.i) : m.i, r: doc.page.facing ? (left ? m.i : m.o) : m.o}; };
    const layerOf = (doc, it) => doc.layers.find(l => l.id === it.layer) || doc.layers[0];
    function tokens(html, ctx) { return html.replace(/\{chapitre\}/g, esc(ctx.chapter || '')).replace(/\{page\}/g, String(ctx.pageNo)).replace(/\{pages\}/g, String(ctx.pages)).replace(/\{titre\}/g, esc(ctx.title || '')).replace(/\{date\}/g, new Date().toLocaleDateString('fr-FR')); }
    /** Habillage : les objets voisins repoussent le texte (zones taillées en flotteurs CSS shape-outside, d'un côté ou des deux) */
    function wrapFloats(doc, it, others) {
        const ins = it.inset || 0, W = px(it.w) - px(ins) * 2, H = px(it.h) - px(ins) * 2; if (W <= 4 || H <= 4) return '';
        const left = [], right = [];
        others.forEach(o => {
            const mode = o.wrap?.mode; if (!mode || mode === 'none' || o === it || o.hidden) return;
            const off = px(o.wrap.off || 0), x1 = px(o.x - it.x - ins) - off, x2 = px(o.x + o.w - it.x - ins) + off, y1 = px(o.y - it.y - ins) - off, y2 = px(o.y + o.h - it.y - ins) + off;
            if (x2 <= 0 || x1 >= W || y2 <= 0 || y1 >= H) return;
            const shape = mode === 'shape' && (o.type === 'ellipse' || (o.shape === 'ellipse')), steps = shape ? 18 : 1, bands = [];
            for (let k = 0; k < steps; k++) {
                const a = y1 + (y2 - y1) * k / steps, b = y1 + (y2 - y1) * (k + 1) / steps;
                let bx1 = x1, bx2 = x2;
                if (shape) { const cy = (y1 + y2) / 2, ry = (y2 - y1) / 2, yy = Math.min(Math.abs(a - cy), Math.abs(b - cy)), f = Math.sqrt(Math.max(0, 1 - (yy / ry) ** 2)), cx = (x1 + x2) / 2, rx = (x2 - x1) / 2; bx1 = cx - rx * f; bx2 = cx + rx * f; }
                bands.push([Math.max(0, a), Math.min(H, b), Math.max(0, bx1), Math.min(W, bx2)]);
            }
            const roomL = x1, roomR = W - x2;
            if (mode === 'jump') bands.forEach(bd => left.push([bd[0], bd[1], W]));
            else if (roomR >= roomL) bands.forEach(bd => left.push([bd[0], bd[1], bd[3]]));   // le texte passe à droite
            else bands.forEach(bd => right.push([bd[0], bd[1], W - bd[2]]));                                               // le texte passe à gauche
        });
        // un flotteur par côté, aussi large que la plus grande avancée : sa forme (shape-outside) ne laisse passer le texte qu'à côté des objets
        const poly = (bands, side) => {
            if (!bands.length) return '';
            bands.sort((a, b) => a[0] - b[0]);
            const FW = Math.max(1, ...bands.map(b => b[2]));
            const pts = [[0, 0]]; bands.forEach(([a, b, x]) => { pts.push([0, a], [x, a], [x, b], [0, b]); }); pts.push([0, H]);
            const P = pts.map(([x, y]) => side === 'left' ? `${r1(x)}px ${r1(y)}px` : `${r1(FW - x)}px ${r1(y)}px`).join(',');
            return `<div class="ly-wrapf" contenteditable="false" aria-hidden="true" style="float:${side};width:${r1(FW)}px;height:${r1(H)}px;shape-outside:polygon(${P})"></div>`;
        };
        return poly(left, 'left') + poly(right, 'right');
    }
    function itemHtml(doc, it, ctx) {
        if (it.hidden) return '';
        const L = layerOf(doc, it); if (L && !L.visible && !ctx.print) return '';
        const w = px(it.w), h = Math.max(px(it.h), it.type === 'line' ? 0 : 0), key = (ctx.keyPrefix || '') + it.id;
        const fx = [];
        if (it.shadow?.on) { const c = it.shadow.c || '#000000', o = clamp(it.shadow.o ?? 50, 0, 100) / 100, rgb = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)).join(','); fx.push(`drop-shadow(${px(it.shadow.x)}px ${px(it.shadow.y)}px ${px(it.shadow.blur)}px rgba(${rgb},${o}))`); }
        if (it.feather > 0) fx.push(`blur(${px(it.feather) / 3}px)`);
        const tr = `rotate(${it.rot || 0}deg)${it.flipX || it.flipY ? ` scale(${it.flipX ? -1 : 1},${it.flipY ? -1 : 1})` : ''}`;
        const style = `left:${px(it.x)}px;top:${px(it.y)}px;width:${w}px;height:${h}px;transform:${tr};opacity:${clamp(it.opacity ?? 100, 0, 100) / 100}${it.blend && it.blend !== 'normal' ? `;mix-blend-mode:${it.blend}` : ''}${fx.length ? `;filter:${fx.join(' ')}` : ''}`;
        const attrs = `class="ly-item ly-${it.type}${ctx.master ? ' ly-from-master' : ''}${L?.locked || it.locked ? ' is-locked' : ''}${it.next ? ' ly-has-next' : ''}${it._follow ? ' ly-follow' : ''}${it.auto ? ' ly-auto' : ''}${it.mediaId || it.dyn ? ' ly-dyn' : ''}" data-id="${esc(it.id)}" style="${style}"`;
        let inner = '';
        if (it.type === 'compound') inner = compoundSvg(doc, it, w, h, key);
        else if (it.type === 'text') {
            const defs = [], back = it.fill !== 'none' || (it.stroke?.c && it.stroke.c !== 'none' && it.stroke.w > 0) ? `<svg class="ly-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="visible"><path d="${shapePath({type: 'rect', radius: it.radius}, w, h)}" fill="${svgPaint(doc, it.fill, defs, key + 'f')}" ${strokeAttrs(doc, it, defs, key)}/><defs>${defs.join('')}</defs></svg>` : '';
            const ins = px(it.inset || 0), cols = clamp(it.columns || 1, 1, 12), jc = {top: 'flex-start', middle: 'center', bottom: 'flex-end', justify: 'space-between'}[it.valign || 'top'];
            const editing = ctx.editingId === it.id;
            const body = editing ? it.html : tokens(it.html, ctx);
            inner = `${back}<div class="ly-txtbox" style="padding:${ins}px;justify-content:${jc}"><div class="ly-txt" ${editing ? 'contenteditable="true" spellcheck="true"' : ''} style="column-count:${cols};column-gap:${px(it.gutter ?? 4)}px">${wrapFloats(doc, it, ctx.others || [])}${body}</div>${it._fn && !editing ? `<div class="ly-fnotes">${it._fn}</div>` : ''}</div>`;
        } else {
            const defs = [], d = shapePath(it, w, h), sAttr = strokeAttrs(doc, it, defs, key), fillP = svgPaint(doc, it.fill, defs, key + 'f');
            if (it.type === 'frame' || it.type === 'image') {
                let img = '';
                if (it.src && srcOk(it.src)) {
                    const fit = it.fit || 'fill', par = fit === 'stretch' ? 'none' : fit === 'fit' ? 'xMidYMid meet' : fit === 'none' ? 'xMidYMid meet' : 'xMidYMid slice';
                    const s = clamp(it.imgS || 100, 5, 2000) / 100, ox = px(it.imgX || 0), oy = px(it.imgY || 0), iw = w * s, ih = h * s;
                    defs.push(`<clipPath id="k${key}"><path d="${d}"/></clipPath>`);
                    img = `<g clip-path="url(#k${key})"><image href="${esc(it.src)}" x="${r1((w - iw) / 2 + ox)}" y="${r1((h - ih) / 2 + oy)}" width="${r1(iw)}" height="${r1(ih)}" preserveAspectRatio="${par}"/></g>`;
                } else if (!ctx.print) img = `<path d="M0,0L${w},${h}M${w},0L0,${h}" stroke="#9aa3b5" stroke-width="0.8" fill="none" class="ly-guide-only"/>`;
                inner = `<svg class="ly-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="visible"><defs>${defs.join('')}</defs><path d="${d}" fill="${fillP}" stroke="none"/>${img}<path d="${d}" fill="none" ${sAttr}/></svg>`;
            } else {
                inner = `<svg class="ly-svg" width="${Math.max(w, 1)}" height="${Math.max(h, 1)}" viewBox="0 0 ${Math.max(w, 1)} ${Math.max(h, 1)}" overflow="visible"><path d="${d}" fill="${it.type === 'line' || (it.type === 'path' && !it.closed) ? 'none' : fillP}" ${sAttr}/><defs>${defs.join('')}</defs></svg>`;
            }
        }
        const linkWrap = it.link && ctx.print ? s => `<a href="${esc(A().safeUrl?.(it.link) || '#')}" target="_blank" rel="noopener noreferrer">${s}</a>` : s => s;
        return `<div ${attrs}>${linkWrap(inner)}</div>`;
    }
    /** Les objets d'une page dans l'ordre d'affichage : calque du bas d'abord */
    const ordered = (doc, items) => doc.layers.slice().reverse().flatMap(l => items.filter(it => it.layer === l.id)).concat(items.filter(it => !doc.layers.some(l => l.id === it.layer)));
    /** 📐 la taille d'une page : celle du document, ou la sienne (Fichier → Format du document → « certaines pages ») */
    const pageSize = (doc, i) => { const s = doc.pages[i]?.size; return s && s.w > 0 && s.h > 0 ? {w: s.w, h: s.h} : {w: doc.page.w, h: doc.page.h}; };
    function pageHtml(doc, i, ctx = {}) {
        const pg = doc.pages[i], master = doc.masters.find(m => m.id === pg.master), PS = pageSize(doc, i), W = px(PS.w), H = px(PS.h), m = pageMargins(doc, i);
        const c = {...ctx, pageNo: i + (doc.page.start || 1), pages: doc.pages.length + (doc.page.start || 1) - 1, title: doc.title};
        if (master?.items.some(x => (x.html || '').includes('{chapitre}'))) c.chapter = chapterAt(doc, i);
        // une page à sa propre taille : les objets du gabarit (numéro, titre courant…) suivent ses bords
        const kx = PS.w / doc.page.w, ky = PS.h / doc.page.h, fitM = it => (kx === 1 && ky === 1 ? it : {...it, x: r1(it.x * kx), y: r1(it.y * ky), w: r1(it.w * kx), h: r1(it.h * ky)});
        const masterItems = master && !ctx.editMaster ? ordered(doc, master.items).map(fitM) : [];
        const all = [...masterItems, ...pg.items];
        const guides = ctx.print || ctx.preview ? '' : `<div class="ly-margins" style="left:${px(m.l)}px;top:${px(m.t)}px;right:${px(m.r)}px;bottom:${px(m.b)}px">${doc.page.columns > 1 ? Array.from({length: doc.page.columns - 1}, (_, k) => { const cw = (PS.w - m.l - m.r - doc.page.gutter * (doc.page.columns - 1)) / doc.page.columns; const x = (cw + doc.page.gutter) * (k + 1); return `<i style="left:${px(x - doc.page.gutter)}px;width:${px(doc.page.gutter)}px"></i>`; }).join('') : ''}</div>`;
        const items = ordered(doc, pg.items);
        const outer = ctx.print || ctx.preview ? '' : `${doc.page.bleed ? `<div class="ly-bleed" style="inset:-${px(doc.page.bleed)}px"></div>` : ''}${doc.page.slug ? `<div class="ly-slug" style="inset:-${px((doc.page.bleed || 0) + doc.page.slug)}px"></div>` : ''}`;
        return `<div class="ly-page${isLeftPage(doc, i) ? ' is-left' : ''}" data-page="${i}" style="width:${W}px;height:${H}px;background:${cssPaint(doc, doc.page.paper)}">${outer}${guides}${masterItems.map(it => itemHtml(doc, it, {...c, master: true, others: all})).join('')}${items.map(it => itemHtml(doc, it, {...c, others: all})).join('')}${ctx.annot?.size ? items.filter(it => ctx.annot.has(it.id)).map(it => `<span class="ly-cmark" style="left:${px(it.x + it.w) - 7}px;top:${Math.max(0, px(it.y) - 7)}px">${ctx.annot.get(it.id).join(',')}</span>`).join('') : ''}${ctx.print ? '' : `<span class="ly-pageno">${c.pageNo}${master ? ` · ${esc(master.name.split('-')[0])}` : ''}</span>`}</div>`;
    }
    /** Le titre du dernier chapitre (style « Chapitre ») commencé sur cette page ou avant : pour le titre courant {chapitre} */
    let chapCache = {sig: '', list: []};
    function chapterAt(doc, i) {
        const sig = doc.pages.length + ':' + doc.pages.reduce((n, p) => n + p.items.reduce((m, it) => m + (it.html || '').length, 0), 0);
        if (chapCache.sig !== sig || chapCache.doc !== doc) { let last = ''; chapCache = {sig, doc, list: doc.pages.map(p => { [...p.items].filter(x => x.type === 'text').sort((a, b) => a.y - b.y).forEach(t => { const m = [...(t.html || '').matchAll(/data-ps="ps-chapter"[^>]*>([\s\S]*?)<\/(p|h\d)>/g)].pop(); if (m) last = plainOf(m[1]).trim(); }); return last; })}; }
        return chapCache.list[i] || '';
    }
    function masterHtml(doc, m, ctx = {}) {
        const W = px(doc.page.w), H = px(doc.page.h), mm = doc.page.margin;
        return `<div class="ly-page is-master" data-master="${esc(m.id)}" style="width:${W}px;height:${H}px;background:${cssPaint(doc, doc.page.paper)}"><div class="ly-margins" style="left:${px(mm.o)}px;top:${px(mm.t)}px;right:${px(mm.i)}px;bottom:${px(mm.b)}px"></div>${ordered(doc, m.items).map(it => itemHtml(doc, it, {...ctx, pageNo: '#', pages: '#', title: doc.title || 'Titre', others: m.items})).join('')}<span class="ly-pageno">${esc(m.name)}</span></div>`;
    }
    /** Planches : en vis-à-vis, la première page seule à droite */
    function spreads(doc) {
        const n = doc.pages.length; if (!doc.page.facing) return Array.from({length: n}, (_, i) => [i]);
        const out = []; let i = 0; if (isLeftPage(doc, 0) === false) { out.push([0]); i = 1; }
        for (; i < n; i += 2) out.push(i + 1 < n ? [i, i + 1] : [i]);
        return out;
    }
    const BASE_CSS = `.ly-page{position:relative;overflow:hidden;flex:none;color:#111}.ly-item{position:absolute;transform-origin:50% 50%;box-sizing:border-box}.ly-svg{position:absolute;left:0;top:0;overflow:visible}.ly-txtbox{position:absolute;inset:0;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden}.ly-txt{outline:none;column-fill:auto;height:auto;max-height:100%;overflow-wrap:break-word}.ly-txt p,.ly-txt h1,.ly-txt h2,.ly-txt h3,.ly-txt h4{margin:0}.ly-txt ul,.ly-txt ol{margin:0;padding-left:1.4em}.ly-txt a{color:inherit}.ly-wrapf{pointer-events:none}.ly-toc{display:flex;align-items:baseline;gap:.35em}.ly-toc .ly-tl{flex:1;min-width:1em;border-bottom:1px dotted currentColor;transform:translateY(-.3em)}.ly-toc .ly-tsp{flex:1}[data-cont]{text-indent:0!important}.ly-fnotes{margin-top:auto;padding-top:1mm;border-top:.5pt solid currentColor;flex:none}.ly-fnotes p,.ly-fnote{margin:0 0 .6mm;text-indent:0}.ly-fnote sup,.ly-fnotes sup{font-size:70%}sup[data-fn]{font-size:65%;line-height:0}`;
    /* ═════════════ Designs (modèles de départ) : intégrés à l'app, ou enregistrés par soi (is_design) ═════════════ */
    const THEMES = [
        {id: 'classique', name: 'Classique', titleFont: 'Garamond', bodyFont: 'Georgia', accent: '#7a2e2e', paper: '#fffdf8', text: '#2a2522', soft: '#7a6f66', light: '#f1e7dc', cover: 'frame', person: 'side', ornament: '❦'},
        {id: 'moderne', name: 'Moderne', titleFont: 'Avenir Next', bodyFont: 'Helvetica Neue', accent: '#0b5cad', paper: '#ffffff', text: '#1d1d1f', soft: '#6e6e73', light: '#e8f0fb', cover: 'band', person: 'side', ornament: ''},
        {id: 'elegant', name: 'Élégant', titleFont: 'Didot', bodyFont: 'Baskerville', accent: '#9a7b3c', paper: '#fdfbf6', text: '#262421', soft: '#8a8072', light: '#f3ecdc', cover: 'center', person: 'side', ornament: '✦'},
        {id: 'sepia', name: 'Sépia', titleFont: 'Palatino', bodyFont: 'Book Antiqua', accent: '#6b4226', paper: '#f4ead8', text: '#3b2a1a', soft: '#7d6650', light: '#e8d9bd', cover: 'photo', person: 'side', ornament: '❧'},
        {id: 'album', name: 'Album photo', titleFont: 'Futura', bodyFont: 'Gill Sans', accent: '#2f5d50', paper: '#ffffff', text: '#1f2a27', soft: '#5f6f6a', light: '#e3efe9', cover: 'photo', person: 'top', ornament: ''},
        {id: 'sobre', name: 'Sobre', titleFont: 'Helvetica Neue', bodyFont: 'Helvetica Neue', accent: '#333333', paper: '#ffffff', text: '#222222', soft: '#777777', light: '#f0f0f0', cover: 'center', person: 'side', ornament: '—'},
        // l'allure de l'application : bleu, papier blanc, traits noirs, ombres bleues décalées, titre en tampon penché comme le logo
        {id: 'site', name: 'Comme le site', titleFont: 'Arial', bodyFont: 'Arial', accent: '#0066cc', paper: '#ffffff', text: '#111111', soft: '#6e6e73', light: '#e6f0fb', cover: 'site', person: 'side', ornament: ''},
    ];
    const themeDoc = (th, size, pageOpts = {}) => {
        const d = defaults(), sz = SIZES.find(x => x[0] === size);
        return newDoc({...pageOpts, w: sz ? sz[2] : (pageOpts.w || d.w), h: sz ? sz[3] : (pageOpts.h || d.h), titleFont: th.titleFont, bodyFont: th.bodyFont, accent: th.accent, paper: th.paper, theme: th});
    };
    const box = (doc, i) => { const m = pageMargins(doc, i), PS = pageSize(doc, i); return {x: m.l, y: m.t, w: PS.w - m.l - m.r, h: PS.h - m.t - m.b}; };
    /** Couverture d'après le design */
    function coverItems(doc, th, info) {
        const W = doc.page.w, H = doc.page.h, b = box(doc, 0), items = [], photo = info.photo || '';
        const title = textItem({x: b.x, y: H * 0.38, w: b.w, h: H * 0.16, html: `<p data-ps="ps-title">${esc(info.title || 'Notre famille')}</p>`, valign: 'bottom', name: 'Titre'});
        const sub = textItem({x: b.x, y: H * 0.55, w: b.w, h: H * 0.08, html: `<p data-ps="ps-subtitle">${esc(info.subtitle || '')}</p>`, name: 'Sous-titre'});
        const author = textItem({x: b.x, y: H - b.y - 22, w: b.w, h: 16, html: `<p data-ps="ps-author">${esc(info.author || '')}</p><p data-ps="ps-caption">{date}</p>`, valign: 'bottom', name: 'Auteur'});
        if (th.cover === 'band') {
            items.push(shapeItem('rect', {x: -3, y: -3, w: W + 6, h: H * 0.62 + 3, fill: 'gr-accent', stroke: {c: 'none', w: 0}, name: 'Bandeau'}));
            if (photo) items.push(shapeItem('frame', {shape: 'ellipse', x: W / 2 - 32, y: H * 0.1, w: 64, h: 64, src: photo, fit: 'fill', stroke: {c: 'sw-paper', w: 3}, name: 'Portrait'}));
            title.y = H * 0.36; title.html = title.html.replace('data-ps="ps-title"', 'data-ps="ps-title" style="color:#ffffff"'); sub.y = H * 0.66; items.push(title, sub, author);
        } else if (th.cover === 'frame') {
            items.push(shapeItem('rect', {x: 12, y: 12, w: W - 24, h: H - 24, fill: 'none', stroke: {c: 'sw-accent', w: 1.5}, name: 'Cadre'}), shapeItem('rect', {x: 15, y: 15, w: W - 30, h: H - 30, fill: 'none', stroke: {c: 'sw-accent', w: 0.5}, name: 'Cadre fin'}));
            if (th.ornament) items.push(textItem({x: b.x, y: H * 0.22, w: b.w, h: 20, html: `<p data-ps="ps-title" style="font-size:36px">${esc(th.ornament)}</p>`, name: 'Ornement'}));
            if (photo) { items.push(shapeItem('frame', {shape: 'ellipse', x: W / 2 - 25, y: H * 0.64, w: 50, h: 60, src: photo, fit: 'fill', stroke: {c: 'sw-accent', w: 1}, name: 'Portrait'})); author.y = H - 40; }
            items.push(title, sub, author);
        } else if (th.cover === 'site') {
            const cx = b.x, cy = H * 0.18, cw = b.w, ch = H * 0.52;
            items.push(shapeItem('rect', {x: cx + 5, y: cy + 5, w: cw, h: ch, fill: '#bfd8f2', stroke: {c: 'none', w: 0}, name: 'Ombre bleue'}),
                shapeItem('rect', {x: cx, y: cy, w: cw, h: ch, fill: 'sw-paper', stroke: {c: 'sw-black', w: 1}, name: 'Carte'}),
                textItem({x: cx + 8, y: cy + 7, w: cw - 16, h: 9, html: `<p data-ps="ps-running" style="color:${th.accent};text-align:left;font-weight:700">Livre de famille</p>`, name: 'Sur-titre'}),
                shapeItem('rect', {x: cx + cw * 0.08, y: cy + ch * 0.28, w: cw * 0.84, h: ch * 0.3, rot: -5, fill: 'sw-accent', stroke: {c: 'none', w: 0}, name: 'Tampon'}));
            Object.assign(title, {x: cx + cw * 0.1, w: cw * 0.8, y: cy + ch * 0.28, h: ch * 0.3, rot: -5, valign: 'middle'});
            title.html = title.html.replace('data-ps="ps-title"', 'data-ps="ps-title" style="color:#ffffff;text-transform:uppercase"');
            Object.assign(sub, {x: cx + 8, w: cw - 16, y: cy + ch * 0.66, h: ch * 0.14});
            if (photo) items.push(shapeItem('frame', {x: W / 2 - 22, y: cy + ch + 14, w: 44, h: 44, rot: -5, src: photo, fit: 'fill', stroke: {c: 'sw-accent', w: 1.5}, name: 'Portrait'}));
            items.push(title, sub, author);
        } else if (th.cover === 'photo') {
            items.push(shapeItem('frame', {x: -3, y: -3, w: W + 6, h: H * 0.6 + 3, src: photo, fit: 'fill', fill: photo ? 'none' : 'sw-light', stroke: {c: 'none', w: 0}, name: 'Photo de couverture'}));
            title.y = H * 0.63; title.h = H * 0.13; title.valign = 'top'; sub.y = H * 0.77; items.push(title, sub, author);
        } else {
            items.push(shapeItem('line', {x: W / 2 - 30, y: H * 0.36, w: 60, h: 0, stroke: {c: 'sw-accent', w: 0.8}, name: 'Filet haut'}), shapeItem('line', {x: W / 2 - 30, y: H * 0.64, w: 60, h: 0, stroke: {c: 'sw-accent', w: 0.8}, name: 'Filet bas'}));
            title.y = H * 0.4; sub.y = H * 0.56; items.push(title, sub, author);
            if (th.ornament) items.push(textItem({x: b.x, y: H * 0.68, w: b.w, h: 14, html: `<p data-ps="ps-subtitle">${esc(th.ornament)}</p>`, name: 'Ornement'}));
        }
        return items;
    }
    /** Un design tout fait : la couverture, une page « personne » d'exemple et une page de texte, sur ses gabarits et ses styles */
    function builtinDesign(th, size) {
        const doc = themeDoc(th, size); doc.title = 'Notre famille';
        doc.pages = [{id: nid('p'), master: 'B', items: coverItems(doc, th, {title: 'Notre famille', subtitle: 'Trois siècles d’histoire', author: 'Par …'})}];
        const p2 = {id: nid('p'), master: 'A', items: []}; doc.pages.push(p2); personPage(doc, 1, th, {name: 'Jean MARTIN', life: '1802 – 1871', number: 'Sosa 8', photos: [], portrait: ''}, [{ps: 'ps-body', text: 'Jean naît à Tours en 1802, fils de Pierre, laboureur, et de Marie… Ici vient la biographie : le texte habille la photo.'}, {ps: 'ps-head', text: 'Famille'}, {ps: 'ps-list', text: '• Épouse : Anne DURAND (1805 – 1880)'}, {ps: 'ps-list', text: '• Enfants : Louis, Marie, Joseph'}], p2);
        doc.pages.push({id: nid('p'), master: 'A', items: [textItem({...box(doc, 2), html: `<p data-ps="ps-chapter">Préface</p><p data-ps="ps-body" style="text-indent:0">Un chapitre commence ici. Change les styles dans l’onglet « Texte » : tout le livre suit.</p>`, name: 'Texte'})]});
        return doc;
    }

    /* ═════════════ Mesurer un texte (pour répartir un long texte sur plusieurs pages) ═════════════ */
    let measureHost = null;
    function measureOverflow(doc, it, others) {
        if (!measureHost) { measureHost = document.createElement('div'); measureHost.className = 'ly-measure'; measureHost.style.cssText = 'position:absolute;left:-30000px;top:0;visibility:hidden;pointer-events:none'; document.body.appendChild(measureHost); }
        measureHost.innerHTML = `<style>${BASE_CSS}${docCss(doc, '.ly-measure')}</style><div class="ly-page" style="width:${px(doc.page.w)}px;height:${px(doc.page.h)}px">${itemHtml(doc, {...it, x: 0, y: 0, rot: 0}, {pageNo: 1, pages: 1, others: (others || []).map(o => ({...o, x: o.x - it.x, y: o.y - it.y}))})}</div>`;
        const t = measureHost.querySelector('.ly-txt'), bx = measureHost.querySelector('.ly-txtbox'); if (!t || !bx) return false;
        // le texte est toujours en colonnes (même une seule) : ce qui ne tient pas part dans une colonne de plus, sur le côté
        const fnH = measureHost.querySelector('.ly-fnotes')?.offsetHeight || 0; // les notes en bas du bloc prennent leur place
        t.style.height = bx.clientHeight - px(it.inset || 0) * 2 - fnH + 'px';
        return t.scrollWidth > t.clientWidth + 2 || t.scrollHeight > bx.clientHeight - px(it.inset || 0) * 2 - fnH + 1;
    }
    const paraHtml = p => `<p data-ps="${p.ps}">${p.lead ? `<b>${esc(p.lead)}</b> ` : ''}${p.html != null ? sanitizeHtml(p.html) : esc(p.text)}</p>`; // html : un paragraphe déjà mis en forme (📝 Traitement de texte → « Envoyer vers la mise en page »)
    /** Combien de paragraphes tiennent dans ce cadre (un paragraphe trop long est coupé entre deux mots) */
    function fill(doc, frame, paras, others) {
        const fits = list => !measureOverflow(doc, {...frame, html: list.map(paraHtml).join('')}, others);
        let lo = 0, hi = paras.length;
        while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (fits(paras.slice(0, mid))) lo = mid; else hi = mid - 1; }
        if (lo < paras.length) { // une partie du paragraphe suivant, mot à mot
            const p = paras[lo], words = String(p.text).split(/\s+/); let a = 0, b = words.length - 1;
            while (a < b) { const mid = Math.ceil((a + b) / 2); if (fits([...paras.slice(0, lo), {...p, html: undefined, text: words.slice(0, mid).join(' ')}])) a = mid; else b = mid - 1; }
            if (a >= 3) return {html: [...paras.slice(0, lo), {...p, html: undefined, text: words.slice(0, a).join(' ')}].map(paraHtml).join(''), rest: [{...p, html: undefined, lead: '', text: words.slice(a).join(' ')}, ...paras.slice(lo + 1)]};
            if (lo === 0) return {html: paraHtml(p), rest: paras.slice(1)}; // rien ne tient : on le pose quand même
        }
        return {html: paras.slice(0, lo).map(paraHtml).join(''), rest: paras.slice(lo)};
    }
    /** Pose des paragraphes de page en page (de nouvelles pages sont ajoutées tant qu'il reste du texte) */
    function flow(doc, paras, {first = null, others = [], columns = 1, master = 'A'} = {}) {
        let rest = paras.slice(), k = 0;
        while (rest.length && k < 400) {
            let pg; if (k === 0 && first) pg = first; else { pg = {id: nid('p'), master, items: []}; doc.pages.push(pg); }
            const i = doc.pages.indexOf(pg), b = box(doc, i), top = k === 0 && first?.flowTop ? first.flowTop : b.y;
            const frame = textItem({x: b.x, y: top, w: b.w, h: b.y + b.h - top, columns, gutter: doc.page.gutter || 5, name: 'Texte'});
            const ob = k === 0 ? others : [];
            const r = fill(doc, frame, rest, ob); frame.html = r.html; pg.items.push(frame); rest = r.rest; k++;
        }
    }
    function personPage(doc, i, th, p, paras, pg) {
        const b = box(doc, i), items = pg.items, photo = p.portrait ? `media/${p.portrait}` : (p.photos?.[0]?.file ? `media/${p.photos[0].file}` : '');
        items.push(textItem({x: b.x, y: b.y, w: b.w, h: 22, html: `<p data-ps="ps-name">${esc(p.name)}</p><p data-ps="ps-dates">${esc([p.life, p.number].filter(Boolean).join(' · '))}</p>`, name: 'Nom'}));
        items.push(shapeItem('line', {x: b.x, y: b.y + 23, w: b.w, h: 0, stroke: {c: 'sw-accent', w: 0.5}, name: 'Filet'}));
        let others = [], top = b.y + 27;
        if (th.person === 'top') {
            const ph = shapeItem('frame', {x: b.x, y: top, w: b.w, h: b.h * 0.42, src: photo, fit: 'fill', fill: photo ? 'none' : 'sw-light', stroke: {c: 'none', w: 0}, name: 'Photo'});
            items.push(ph); top += b.h * 0.42 + 4;
        } else if (photo || !p.id) {
            const fw = Math.min(60, b.w * 0.38), fh = fw * 1.25;
            const ph = shapeItem('frame', {x: b.x + b.w - fw, y: top, w: fw, h: fh, src: photo, fit: 'fill', fill: photo ? 'none' : 'sw-light', stroke: {c: 'sw-accent', w: 0.5}, wrap: {mode: 'box', off: 4}, name: 'Portrait'});
            items.push(ph); others = [ph];
        }
        pg.flowTop = top;
        flow(doc, paras, {first: pg, others});
        delete pg.flowTop;
        // les autres photos de la personne : une page de photos si elle en a plusieurs
        const more = (p.photos || []).slice(photo && !p.portrait ? 1 : 0, 4);
        if (more.length > 1) {
            const pg2 = {id: nid('p'), master: 'A', items: []}; doc.pages.push(pg2); const b2 = box(doc, doc.pages.length - 1), n = more.length, cols = n > 2 ? 2 : 1, rows = Math.ceil(n / cols), gw = (b2.w - (cols - 1) * 5) / cols, gh = (b2.h - 14 - (rows - 1) * 12) / rows;
            pg2.items.push(textItem({x: b2.x, y: b2.y, w: b2.w, h: 10, html: `<p data-ps="ps-head">${esc(p.name)} — photos</p>`, name: 'Titre'}));
            more.forEach((m, k) => { const cx = b2.x + (k % cols) * (gw + 5), cy = b2.y + 14 + Math.floor(k / cols) * (gh + 12); pg2.items.push(shapeItem('frame', {x: cx, y: cy, w: gw, h: gh - 7, src: `media/${m.file}`, srcName: m.title, fit: 'fit', fill: 'none', stroke: {c: 'none', w: 0}, name: 'Photo'}), textItem({x: cx, y: cy + gh - 6.5, w: gw, h: 6, html: `<p data-ps="ps-caption">${esc(m.title || '')}</p>`, name: 'Légende'})); });
        }
    }
    /** Un livre entier d'après les données de la famille et un design */
    function familyDoc(data, th, o) {
        const doc = o.designDoc ? cleanDoc(JSON.parse(JSON.stringify(o.designDoc))) : themeDoc(th, o.size, o.pageOpts || {});
        // un design à soi : on garde ses gabarits, styles et couleurs ; les styles qui manquent viennent du design « Classique »
        const base = baseStyles({titleFont: th.titleFont, bodyFont: th.bodyFont, bodySize: 11}); base.forEach(s => { if (!doc.paraStyles.some(x => x.id === s.id)) doc.paraStyles.push(s); });
        baseSwatches(th).forEach(s => { if (!doc.swatches.some(x => x.id === s.id)) doc.swatches.push(s); });
        if (!doc.masters.some(m => m.id === 'A')) doc.masters.unshift(folioMaster({...defaults(), w: doc.page.w, h: doc.page.h, mt: doc.page.margin.t, mb: doc.page.margin.b, mi: doc.page.margin.i, mo: doc.page.margin.o}, th));
        if (!doc.masters.some(m => m.id === 'B')) doc.masters.push({id: 'B', name: 'B-Sans folio', items: []});
        doc.title = o.title || data.title || 'Notre famille';
        doc.pages = [];
        const chapter = (title, paras, opt = {}) => { const pg = {id: nid('p'), master: 'A', items: []}; doc.pages.push(pg); const i = doc.pages.length - 1, b = box(doc, i); pg.items.push(textItem({x: b.x, y: b.y, w: b.w, h: 18, html: `<p data-ps="ps-chapter">${esc(title)}</p>`, name: 'Chapitre'})); pg.flowTop = b.y + 20; flow(doc, paras, {first: pg, columns: opt.columns || 1}); delete pg.flowTop; };
        const first = data.persons?.[0];
        (o.sections || ['cover', 'preface', 'people']).forEach(sec => {
            if (sec === 'cover') doc.pages.push({id: nid('p'), master: 'B', items: coverItems(doc, th, {title: doc.title, subtitle: o.subtitle || data.subtitle, author: o.author || data.author, photo: first?.portrait ? `media/${first.portrait}` : (first?.photos?.[0] ? `media/${first.photos[0].file}` : '')})});
            if (sec === 'preface' && o.preface) chapter('Préface', String(o.preface).split(/\n+/).filter(Boolean).map(t => ({ps: 'ps-body', text: t})));
            if (sec === 'stats' && data.stats) { const s = data.stats; chapter('La famille en chiffres', [{ps: 'ps-body', text: `${A().plural(s.people, 'personne')}, ${A().plural(s.men, 'homme')} et ${A().plural(s.women, 'femme')}${s.from ? `, nées entre ${s.from} et ${s.to}` : ''}.`}, s.age ? {ps: 'ps-body', text: `Âge moyen au décès : ${s.age} ans.`} : null, {ps: 'ps-body', text: `${s.places} lieux, ${s.events} événements datés.`}, {ps: 'ps-head', text: 'Les noms les plus portés'}, ...Object.entries(s.surnames || {}).map(([n, c]) => ({ps: 'ps-list', text: `• ${n} — ${c}`}))].filter(Boolean)); }
            if (sec === 'tree' && data.tree) { const paras = []; Object.entries(data.tree.ancestors || {}).forEach(([g, rows]) => { paras.push({ps: 'ps-head', text: `Génération ${g}`}); Object.values(rows).forEach(([n, name, life]) => paras.push({ps: 'ps-list', lead: String(n), text: `${name} (${life})`})); }); Object.values(data.tree.descendants || {}).forEach(([n, name, life]) => paras.push({ps: 'ps-list', lead: String(n), text: `${name} (${life})`})); if (paras.length) chapter('L’arbre', paras); }
            if (sec === 'people') (data.persons || []).forEach(p => {
                const paras = [];
                if (p.bio) String(p.bio).split(/\n+/).filter(Boolean).forEach(t => paras.push({ps: 'ps-body', text: t}));
                const fam = [p.parents?.length && `Parents : ${p.parents.join(', ')}`, p.partners?.length && `${p.partners.length > 1 ? 'Conjoints' : 'Conjoint'} : ${p.partners.join(', ')}`, p.children?.length && `Enfants : ${p.children.join(', ')}`].filter(Boolean);
                if (fam.length) { paras.push({ps: 'ps-head', text: 'Famille'}); fam.forEach(t => paras.push({ps: 'ps-list', text: `• ${t}`})); }
                if (p.events?.length) { paras.push({ps: 'ps-head', text: 'Repères'}); p.events.forEach(e => paras.push({ps: 'ps-list', lead: e.date || '?', text: `${e.type}${e.place ? ' — ' + e.place : ''}`})); }
                if (p.notes?.length) { paras.push({ps: 'ps-head', text: 'Notes'}); p.notes.forEach(n => paras.push({ps: 'ps-body', text: [n.title, n.body].filter(Boolean).join(' — ')})); }
                if (!paras.length) paras.push({ps: 'ps-body', text: ' '});
                const pg = {id: nid('p'), master: 'A', items: []}; doc.pages.push(pg); personPage(doc, doc.pages.length - 1, th, p, paras, pg);
            });
            if (sec === 'chronology' && data.chronology?.length) chapter('Chronologie', data.chronology.map(e => ({ps: 'ps-list', lead: e.date, text: `${e.type} — ${e.who}${e.place ? ` (${e.place})` : ''}`})));
            if (sec === 'places' && data.places?.length) chapter('Les lieux de la famille', data.places.map(pl => ({ps: 'ps-list', lead: pl.place, text: `${A().plural(pl.events, 'événement')}, ${A().plural(pl.people, 'personne')}${pl.from ? `, de ${pl.from} à ${pl.to}` : ''}`})));
            if (sec === 'index' && data.index?.length) chapter('Index des noms', data.index.map(x => ({ps: 'ps-list', text: `${x.name} (${x.life})${x.number ? ' — ' + x.number : ''}`})), {columns: 2});
            if (sec === 'epilogue' && o.epilogue) chapter('Mot de la fin', String(o.epilogue).split(/\n+/).filter(Boolean).map(t => ({ps: 'ps-body', text: t})));
        });
        if (!doc.pages.length) doc.pages.push({id: nid('p'), master: 'A', items: []});
        return doc;
    }
    /* ═════════════ 📚 Gabarits de livre de famille prêts à l'emploi : remplis avec une personne (objets dynamiques) ═════════════ */
    const BOOK_TEMPLATES = [['bio', '📜 Biographie d’un ancêtre', 'Page de titre, portrait, repères en frise, sa vie racontée, ses sources.'], ['tree2', '🌳 Arbre en double page', 'Son arbre étalé sur deux pages en vis-à-vis.'],
        ['gallery', '🖼️ Galerie de photos', 'Des pages de photos, remplies avec celles de la personne ou de sa famille proche.'], ['chronicle', '📗 Livret de famille / chronique', 'Le couple, les enfants, et les événements de la famille au fil des années.'],
        ['cousinade', '🎉 Carnet de cousinade', 'L’ancêtre commun, ses descendants branche par branche, « qui est qui », des pages de souvenirs.']];
    const lookOfDoc = doc => { const st = id => doc.paraStyles.find(x => x.id === id) || {}; return {accent: colorOf(doc, 'sw-accent', '#7a2e2e'), text: colorOf(doc, 'sw-text', '#222222'), soft: colorOf(doc, 'sw-soft', '#6b6b6b'), light: colorOf(doc, 'sw-light', '#f3ece4'), paper: colorOf(doc, 'sw-paper', '#ffffff'), font: fontOk(st('ps-body').font) || 'Georgia', title: fontOk(st('ps-name').font || st('ps-title').font) || 'Georgia'}; };
    async function templateDoc(kind, {root, th, pageOpts = {}, gens = 4, photosOf = 'person', title = '', author = ''}) {
        const doc = themeDoc(th, '', {...pageOpts, facing: kind === 'tree2' ? true : pageOpts.facing});
        doc.pages = [];
        const now = () => new Date().toISOString().slice(0, 16);
        const page = (master = 'A') => { const pg = {id: nid('p'), master, items: []}; doc.pages.push(pg); const i = doc.pages.length - 1; return {pg, i, b: box(doc, i)}; };
        const head = (b, text, ps = 'ps-chapter') => textItem({x: b.x, y: b.y, w: b.w, h: 16, html: `<p data-ps="${ps}">${esc(text)}</p>`, name: 'Titre'});
        const chapter = (t, paras, columns = 1) => { if (!paras.length) return; const {pg, b} = page(); pg.items.push(head(b, t)); pg.flowTop = b.y + 20; flow(doc, paras, {first: pg, columns}); delete pg.flowTop; };
        const dyn = async (id, fields, o) => textItem({...o, html: await personDynHtml(id, fields), name: 'Texte lié à une fiche', dyn: {type: 'person', id, fields, at: now()}});
        const portrait = (p, o) => { const f = p?.portrait_full || p?.portrait || p?.photos?.[0]?.full || ''; return shapeItem('frame', {fit: 'fill', fill: f ? 'none' : 'sw-light', stroke: {c: 'sw-accent', w: 0.5}, name: 'Portrait', ...o, ...(f ? {src: `media/${f}`, srcName: p.name, mediaId: p.portrait_id || p.photos?.[0]?.id || undefined} : {})}); };
        const fam = (scope, g, extra = {}) => api('layout_family_data', {scope, root_id: String(root), generations: String(g), order: 'book', photo_count: '12', event_count: '60', sections: 'people', parts: 'bio,family,events,photos,notes', ...extra});
        const photoPages = (photos, label) => { // 6 photos par page (2 × 3), avec leur légende
            for (let k = 0; k < photos.length; k += 6) {
                const {pg, b} = page(), chunk = photos.slice(k, k + 6), top = k ? b.y : b.y + 20, cols = 2, rows = 3, gw = (b.w - 6) / cols, gh = (b.y + b.h - top - 2 * 6) / rows;
                if (!k) pg.items.push(head(b, label));
                chunk.forEach((m, j) => { const x = b.x + (j % cols) * (gw + 6), y = top + Math.floor(j / cols) * (gh + 6);
                    pg.items.push(shapeItem('frame', {x: r1(x), y: r1(y), w: r1(gw), h: r1(gh - 8), src: `media/${m.full || m.file}`, srcName: m.title, mediaId: m.id || undefined, fit: 'fit', fill: 'none', stroke: {c: 'none', w: 0}, name: 'Photo'}),
                        textItem({x: r1(x), y: r1(y + gh - 7.5), w: r1(gw), h: 7, html: `<p data-ps="ps-caption">${esc(m.title || '')}</p>`, name: 'Légende'})); });
            }
        };
        const treePage = async (cfg, b, pg, spread = null) => { // un arbre dynamique ; spread : la page de droite, l'arbre passe de l'une à l'autre
            const r = await treeSvg(cfg, lookOfDoc(doc)), src = svgData(r.svg), W = doc.page.w;
            const fr = spread ? {x: b.x, y: b.y + 18, w: r1(W + spread.b.x + spread.b.w - b.x), h: r1(b.h - 18)} : {x: b.x, y: b.y + 18, w: b.w, h: r1(b.h - 18)};
            pg.items.push(shapeItem('frame', {...fr, src, srcName: r.name, tree: {...cfg, at: now()}, fit: 'fit', fill: 'none', stroke: {c: 'none', w: 0}, name: 'Arbre'}));
            if (spread) spread.pg.items.push(shapeItem('frame', {...fr, x: r1(fr.x - W), src, srcName: r.name, tree: {...cfg, at: now()}, fit: 'fit', fill: 'none', stroke: {c: 'none', w: 0}, name: 'Arbre (suite)'}));
        };
        const data = await fam(kind === 'cousinade' || kind === 'chronicle' ? 'descendants' : photosOf === 'family' && kind === 'gallery' ? 'both' : 'ancestors', kind === 'cousinade' ? gens : kind === 'chronicle' || (kind === 'gallery' && photosOf === 'family') ? 2 : 1);
        const p = (data.persons || []).find(x => Number(x.id) === Number(root)) || data.persons?.[0];
        if (!p) throw new Error('Personne introuvable (ou cachée à l’export).');
        doc.title = title || {bio: `Vie de ${p.name}`, tree2: `L’arbre de ${p.name}`, gallery: `Album de ${p.name}`, chronicle: 'Livret de famille', cousinade: `Cousinade des descendants de ${p.name}`}[kind];
        const cover = (sub) => doc.pages.push({id: nid('p'), master: 'B', items: coverItems(doc, th, {title: doc.title, subtitle: sub, author, photo: p.portrait_full || p.portrait ? `media/${p.portrait_full || p.portrait}` : (p.photos?.[0] ? `media/${p.photos[0].full || p.photos[0].file}` : '')})});
        if (kind === 'bio') {
            cover(p.life);
            { const {pg, b} = page(); pg.items.push(head(b, p.name, 'ps-name')); const fw = Math.min(b.w * 0.55, b.h * 0.42), fh = fw * 1.25; pg.items.push(portrait(p, {x: r1(b.x + (b.w - fw) / 2), y: b.y + 20, w: r1(fw), h: r1(fh)}));
                pg.items.push(await dyn(p.id, ['life', 'occupation', 'parents', 'partners', 'children'], {x: b.x, y: r1(b.y + 26 + fh), w: b.w, h: r1(b.h - 26 - fh)})); }
            const evs = p.events || [], per = Math.max(4, Math.floor((box(doc, 0).h - 22) / 14));
            for (let k = 0; k < evs.length; k += per) {
                const {pg, b} = page(), chunk = evs.slice(k, k + per), x0 = b.x + 30, top = b.y + 22;
                pg.items.push(head(b, k ? 'Repères (suite)' : 'Repères'), shapeItem('line', {x: x0, y: top - 2, w: 0, h: r1(chunk.length * 14), stroke: {c: 'sw-accent', w: 0.8}, name: 'Frise'}));
                chunk.forEach((e, j) => { const y = top + j * 14; pg.items.push(shapeItem('ellipse', {x: x0 - 2, y: y + 1, w: 4, h: 4, fill: 'sw-accent', stroke: {c: 'none', w: 0}, name: 'Point'}),
                    textItem({x: b.x, y, w: 26, h: 12, html: `<p data-ps="ps-dates" style="text-align:right">${esc(e.date || '?')}</p>`, name: 'Date'}),
                    textItem({x: x0 + 6, y, w: r1(b.w - 36), h: 12, html: `<p data-ps="ps-body" style="text-indent:0;text-align:left"><b>${esc(e.type)}</b>${e.place ? ` — ${esc(e.place)}` : ''}</p>`, name: 'Événement'})); });
            }
            chapter('Sa vie', String(p.bio || '').split(/\n+/).filter(Boolean).map(t => ({ps: 'ps-body', text: t})));
            let sources = []; try { sources = (await api('person', {id: p.id})).sources || []; } catch (_) {}
            chapter('Sources', sources.length ? sources.map(s => ({ps: 'ps-list', text: `• ${[s.title || s.name || 'Source', s.author, s.citation || s.page || s.reference].filter(Boolean).join(' — ')}`})) : [{ps: 'ps-body', text: 'Aucune source rattachée à la fiche pour l’instant : ajoute-les dans la fiche, ou écris-les ici.'}]);
            if ((p.photos || []).length > 1) photoPages(p.photos, 'Photos');
        } else if (kind === 'tree2') {
            { const {pg, b} = page(); pg.items.push(textItem({x: b.x, y: b.y + b.h * 0.35, w: b.w, h: 30, html: `<p data-ps="ps-title">${esc(doc.title)}</p><p data-ps="ps-subtitle">${esc(A().plural(clamp(gens, 2, 6), 'génération'))}</p>`, name: 'Titre'})); }
            const L = page(), R = page();
            L.pg.items.push(head(L.b, `Les ancêtres de ${p.name}`));
            await treePage({root: p.id, mode: 'asc', gens: clamp(gens, 2, 6), style: 'classic', photos: true, dates: true, places: false}, L.b, L.pg, R);
        } else if (kind === 'gallery') {
            const seen = new Set(), photos = []; (data.persons || []).forEach(x => (x.photos || []).forEach(m => { const k = m.id || m.full; if (!seen.has(k)) { seen.add(k); photos.push(m); } }));
            if (!photos.length) throw new Error(photosOf === 'family' ? 'Aucune photo rattachée à cette personne ni à sa famille proche.' : 'Aucune photo rattachée à cette personne (essaie « sa famille proche »).');
            cover(photosOf === 'family' ? 'La famille en photos' : p.life);
            photoPages(photos, photosOf === 'family' ? `${p.name} et sa famille` : p.name);
        } else if (kind === 'chronicle') {
            let full = {}; try { full = await api('person', {id: p.id}); } catch (_) {}
            const partners = (full.partners || []).filter(x => Number(x.id) > 0), children = (full.children || []).filter(x => Number(x.id) > 0), nm = x => [x.first_name, x.last_name].filter(Boolean).join(' ');
            cover([p.name, ...partners.map(nm)].filter(Boolean).join(' et '));
            { const {pg, b} = page(); pg.items.push(head(b, partners.length ? 'Les époux' : 'Le chef de famille')); const fw = Math.min(42, b.w * 0.3), half = (b.h - 24) / 2;
                pg.items.push(portrait(p, {x: b.x, y: b.y + 22, w: fw, h: r1(fw * 1.25)}), await dyn(p.id, ['name', 'life', 'occupation', 'parents'], {x: r1(b.x + fw + 6), y: b.y + 22, w: r1(b.w - fw - 6), h: r1(half - 4)}));
                if (partners[0]) pg.items.push(await dyn(Number(partners[0].id), ['name', 'life', 'occupation', 'parents'], {x: r1(b.x + fw + 6), y: r1(b.y + 24 + half), w: r1(b.w - fw - 6), h: r1(half - 4)})); }
            for (let k = 0; k < children.length; k += 3) {
                const {pg, b} = page(), chunk = children.slice(k, k + 3), hh = (b.h - 22) / 3; pg.items.push(head(b, k ? 'Les enfants (suite)' : 'Les enfants'));
                for (let j = 0; j < chunk.length; j++) pg.items.push(await dyn(Number(chunk[j].id), ['name', 'life', 'partners'], {x: b.x, y: r1(b.y + 22 + j * hh), w: b.w, h: r1(hh - 4)}));
            }
            chapter('Chronique de la famille', (data.chronology || []).map(e => ({ps: 'ps-list', lead: e.date, text: `${e.type} — ${e.who}${e.place ? ` (${e.place})` : ''}`})));
            if (!(data.chronology || []).length) chapter('Chronique de la famille', [{ps: 'ps-body', text: 'Les événements de la famille (naissances, mariages, décès…) viendront ici quand ils seront datés dans les fiches.'}]);
        } else if (kind === 'cousinade') {
            cover('{date}');
            { const {pg, b} = page(); pg.items.push(head(b, 'Notre ancêtre commun')); const fw = Math.min(b.w * 0.5, b.h * 0.38), fh = fw * 1.25; pg.items.push(portrait(p, {x: r1(b.x + (b.w - fw) / 2), y: b.y + 20, w: r1(fw), h: r1(fh)}));
                pg.items.push(await dyn(p.id, ['name', 'life', 'occupation', 'partners', 'children'], {x: b.x, y: r1(b.y + 26 + fh), w: b.w, h: r1(b.h - 26 - fh)})); }
            { const {pg, b} = page(); pg.items.push(head(b, 'L’arbre des descendants')); await treePage({root: p.id, mode: 'desc', gens: clamp(Math.min(gens, 4), 2, 4), style: 'color', photos: false, dates: true, places: false}, b, pg); }
            const branches = new Map(); Object.values(data.tree?.descendants || {}).forEach(([n, name, life]) => { const k = String(n).split('.').slice(0, 2).join('.'); if (!branches.has(k)) branches.set(k, []); branches.get(k).push({n, name, life}); });
            [...branches.entries()].filter(([k]) => k.includes('.')).forEach(([k, list]) => chapter(`Branche ${k} : ${list.find(x => String(x.n) === k)?.name || ''}`, list.map(x => ({ps: 'ps-list', lead: String(x.n), text: `${x.name} (${x.life})`}))));
            chapter('Qui est qui ?', (data.index || []).map(x => ({ps: 'ps-list', text: `${x.name} (${x.life})${x.number ? ' — ' + x.number : ''}`})), 2);
            for (const t of ['Souvenirs de la journée', 'Autographes des cousins']) { const {pg, b} = page(); pg.items.push(head(b, t)); for (let y = b.y + 26; y < b.y + b.h - 4; y += 9) pg.items.push(shapeItem('line', {x: b.x, y: r1(y), w: b.w, h: 0, stroke: {c: 'sw-soft', w: 0.25}, name: 'Ligne'})); }
        }
        if (!doc.pages.length) page();
        return doc;
    }
    /** 📚 Nouveau livre d'après un gabarit prêt à l'emploi */
    function templateWizard(onSaved, kind = 'bio', root0 = 0) {
        const d = defaults(), start = Number(root0) || A().state.bootstrap?.startPersonId, P = window.LCNDA_PICKER || A();
        ext.openDialog({eyebrow: 'NOUVEAU DOCUMENT', title: '📚 Un livre de famille prêt à l’emploi', wide: true, submitLabel: 'Créer le livre',
            body: `<div class="ly-tplpick">${BOOK_TEMPLATES.map(([k, l, h]) => `<label class="ly-tplcard"><input type="radio" name="tpl" value="${k}" ${k === kind ? 'checked' : ''}><b>${l}</b><small>${esc(h)}</small></label>`).join('')}</div>
                <div class="form-grid"><div><span class="pk-lab" data-tplwho>Personne</span>${P.pickerField({name: 'tpl_root', kind: 'person', value: start || null})}</div>
                <label>Nom du document <input name="name" maxlength="160" placeholder="automatique si vide"></label>
                <label>Design <select name="design">${THEMES.map(th => `<option value="${th.id}">${esc(th.name)}</option>`).join('')}</select></label>
                <label data-tplopt="gens">Générations <input type="number" name="gens" min="2" max="8" value="4"></label>
                <label data-tplopt="photos">Les photos <select name="photos"><option value="person">de la personne</option><option value="family">de la personne et de sa famille proche</option></select></label>
                <label>Auteur <input name="author" maxlength="200"></label>
                ${formatFieldsHtml(d.w, d.h)}</div>
                <p class="muted">Tout se modifie ensuite. Les textes des fiches sont des objets dynamiques : « ↻ Mettre à jour » les refait si la fiche change.</p>`,
            onOpen: dg => { bindFormatFields(dg); const sync = () => { const k = dg.querySelector('[name=tpl]:checked')?.value; dg.querySelector('[data-tplopt=gens]').hidden = !['tree2', 'cousinade'].includes(k); dg.querySelector('[data-tplopt=photos]').hidden = k !== 'gallery'; dg.querySelector('[data-tplwho]').textContent = k === 'cousinade' ? 'L’ancêtre commun' : k === 'chronicle' ? 'Le chef de famille (ou l’un des époux)' : 'Personne'; }; dg.addEventListener('change', sync); sync(); },
            onSubmit: async f => {
                const v = Object.fromEntries(new FormData(f)), root = Number(f.elements.tpl_root?.value) || 0;
                if (!root) return window.LCNDA_UI.fail(f.elements.tpl_root, 'Choisis la personne.');
                const fm = f.closest('dialog')._formatMm?.(); if (fm && (fm.w < 30 || fm.h < 30)) { toast('Format entre 3 cm et 1,5 m de côté.', 'error'); return false; }
                const th = THEMES.find(t => t.id === v.design) || THEMES[0];
                toast('Le livre se prépare…');
                let doc; try { doc = await templateDoc(v.tpl || 'bio', {root, th, pageOpts: fm ? {w: fm.w, h: fm.h} : {}, gens: clamp(v.gens, 2, 8), photosOf: v.photos, author: v.author || ''}); } catch (err) { toast(err.message, 'error'); return false; }
                openEditor({id: 0, name: (v.name || doc.title || 'Mon livre').slice(0, 160), doc, onSaved});
            }});
    }
    ext.layoutTemplates = {list: BOOK_TEMPLATES, build: templateDoc, wizard: templateWizard};
    /* ═════════════ L'éditeur ═════════════ */
    const TOOLS = [['select', '➤', 'Sélection (V)', 'v'], ['text', 'T', 'Texte (T)', 't'], ['frame', '⊠', 'Cadre d’image (F)', 'f'], ['rect', '▭', 'Rectangle (M)', 'm'], ['ellipse', '◯', 'Ellipse (L)', 'l'], ['polygon', '⬡', 'Polygone (Y)', 'y'], ['star', '☆', 'Étoile (E)', 'e'], ['line', '╲', 'Ligne (\\)', '\\'], ['pen', '✒︎', 'Plume (P) : clic = point, double-clic ou Entrée = fini', 'p'], ['hand', '✋', 'Main (H)', 'h'], ['zoom', '🔍', 'Zoom (Z) — Alt pour reculer', 'z']];
    const TOOL_HELP = {select: 'Clic : choisir (⇧ : en plus) · glisser : déplacer · poignées : agrandir · double-clic : écrire ou placer une image',
        text: 'Glisse pour tracer un bloc de texte, puis écris', frame: 'Glisse pour tracer un cadre, puis double-clic pour y placer une image',
        rect: 'Glisse pour dessiner (⇧ : un carré)', ellipse: 'Glisse pour dessiner (⇧ : un cercle)', polygon: 'Glisse pour dessiner un polygone', star: 'Glisse pour dessiner une étoile', line: 'Glisse pour tracer une ligne (⇧ : droite ou à 45°)',
        pen: 'Clic : un point · glisser : une courbe · double-clic ou Entrée : fini', hand: 'Glisse pour déplacer la vue (ou barre d’espace)', zoom: 'Clic : zoomer · Alt + clic : reculer'};
    const PANELS = [['pages', '📄', 'Pages'], ['layers', '🗂', 'Calques'], ['obj', '🔧', 'Objet'], ['text', '🅰', 'Texte'], ['color', '🎨', 'Couleur'], ['links', '🔗', 'Liens'], ['review', '💬', 'Relecture'], ['history', '🕘', 'Historique'], ['doc', '⚙️', 'Document']];
    let localFonts = null;
    const fontList = () => { let mine = []; try { mine = JSON.parse(localStorage.getItem(FONTS_KEY) || '[]'); } catch (_) {} return [...new Set([...(Array.isArray(mine) ? mine : []).map(fontOk).filter(Boolean), ...(localFonts || []), ...BASE_FONTS])]; };
    /* E5 : choix d'une police — la case garde le nom (on peut le taper) ; « Aa ▾ » ouvre la liste commune (récentes, de l'app, de l'ordinateur, chacune dans son dessin) */
    const fontPickHtml = (attrs, value = '', placeholder = 'Georgia…') => `<span class="ly-fontpick"><input ${attrs} value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" data-fontpick><button type="button" class="ly-fontpick-open" aria-label="Choisir la police dans la liste" title="Choisir la police dans la liste" data-fontpick-open>Aa ▾</button></span>`;
    function bindFontPick(root) {
        if (root.dataset.fontpickBound) return; root.dataset.fontpickBound = '1';
        const pick = (inp, f) => { inp.value = fontOk(f); inp.dispatchEvent(new Event('change', {bubbles: true})); };
        root.addEventListener('mousedown', e => { if (e.target.closest('[data-fontpick-open]')) e.preventDefault(); }); // le texte choisi reste choisi
        root.addEventListener('click', async e => {
            const o = e.target.closest('[data-fontpick-open]'); if (!o) return; e.preventDefault();
            const inp = o.parentElement.querySelector('[data-fontpick]'), UI = window.LCNDA_UI;
            if (!UI?.openFontPicker) { inp.focus(); return; }
            const sample = (getSelection()?.toString() || '').trim().slice(0, 40) || 'Notre famille';
            const f = await UI.openFontPicker({value: inp.value, sample}); if (f) pick(inp, f);
        });
        root.addEventListener('keydown', e => { const inp = e.target.closest?.('[data-fontpick]'); if (inp && e.key === 'Enter') { e.preventDefault(); if (inp.value.trim()) pick(inp, inp.value.trim()); } });
    }

    async function openEditor({id = 0, name = 'Sans titre', doc, isDesign = false, onSaved, rev = ''}) {
        let docRev = rev || ''; // deux onglets : la version lue ici (le serveur refuse si elle a changé ailleurs)
        let D = cleanDoc(doc), docId = id, docName = name, design = !!isDesign, dirty = false;
        let cur = 0, editMaster = null, sel = [], editingId = null, tool = 'select', zoom = 0.75, fillTarget = 'fill', guides = true, snapOn = true, preview = false, panel = 'pages', clip = null, savedRange = null, lastTextColor = '#111111';
        let act = ''; // ce qu'on vient de faire, pour l'historique
        const dl = document.createElement('dialog'); dl.className = 'modal ly-editor'; dl.dataset.dndOff = ''; dl.dataset.ownClose = '1'; // l'atelier a ses propres flèches : pas de poignée ⠿ de l'app (elle cassait la grille avec un seul calque)
        dl.innerHTML = `<div class="ly-top">
                <span class="ly-brand">📐</span><input class="ly-name" data-ly-name value="${esc(docName)}" aria-label="Nom du document"><span class="ly-kind" data-ly-kind></span>
                <span class="ly-menus" data-tbg="ly-menus" data-tbg-label="Menus du haut">${menu('Fichier', [['save', '💾 Enregistrer', '⌘S'], ['saveas', 'Enregistrer une copie…'], ['savedesign', '🎨 Enregistrer comme design…'], ['-'], ['docformat', '📐 Format du document…'], ['docinfo', 'ℹ️ Informations du document…'], ['-'], ['export', '⤓ Exporter (PDF, ePub, HTML, fichier)…'], ['-'], ['preflight', '✅ Contrôle avant impression…'], ['relink', '↻ Mettre à jour les objets dynamiques (photos, fiches, arbres)'], ['stylelib', '🎨 Mes styles (pour tous mes documents)…'], ['-'], ['close', 'Fermer']])}
                ${menu('Édition', [['undo', '↶ Annuler', '⌘Z'], ['redo', '↷ Rétablir', '⇧⌘Z'], ['-'], ['cut', 'Couper', '⌘X'], ['copy', 'Copier', '⌘C'], ['paste', 'Coller', '⌘V'], ['dup', 'Dupliquer', '⌘D'], ['del', 'Supprimer', '⌫'], ['-'], ['all', 'Tout sélectionner', '⌘A'], ['none', 'Désélectionner', 'Échap']])}
                ${menu('Objet', [['front', 'Premier plan', '⇧⌘]'], ['fwd', 'Avancer', '⌘]'], ['back', 'Reculer', '⌘['], ['bottom', 'Arrière-plan', '⇧⌘['], ['-'], ['lock', '🔒 Verrouiller / déverrouiller'], ['hide', '🙈 Masquer'], ['showall', '👁 Tout afficher'], ['-'], ['fitframe', 'Ajuster le cadre au contenu'], ['place', '🖼️ Placer une image (liée si elle vient de l’app)…'], ['-'], ['chain', '➜ Chaîner le bloc de texte vers un autre…'], ['autoflow', '⤵ Faire couler le texte sur de nouvelles pages'], ['unchain', 'Couper le chaînage'], ['-'], ['toc', '📑 Insérer une table des matières'], ['index', '🔤 Insérer un index des noms'], ['idxplaces', '📍 Insérer un index des lieux'], ['idxjobs', '🔨 Insérer un index des métiers'], ['-'], ['fnote', '¹ Insérer une note de bas de page…'], ['cite', '📚 Citer une source (en note)…'], ['notesblock', '🗒 Insérer les notes du chapitre'], ['biblio', '📚 Insérer la bibliographie'], ['-'], ['tree', '🌳 Insérer un arbre généalogique (objet dynamique)…'], ['dynperson', '👤 Insérer le texte d’une fiche (objet dynamique)…'], ['dynmeteo', '🌦 Encadré météo d’un événement…'], ['dyndiagram', '📊 Insérer un diagramme (objet dynamique)…'], ['-'], ['qr', '▦ Insérer un QR code (fiche, adresse, texte)…']])}
                ${menu('Page', [['addend', '＋ Ajouter une page à la fin'], ['insert', '＋ Insérer des pages…'], ['duppage', 'Dupliquer la page'], ['delpage', '🗑 Supprimer la page'], ['-'], ['masters', '📄 Gabarit de plusieurs pages…'], ['-'], ['merge', '📨 Publipostage : une page par personne…'], ['mergesample', '📨 Page modèle de publipostage (avec des champs)'], ['-'], ['goto', 'Aller à la page…', '⌘J'], ['first', '⏮ Première page'], ['prev', '‹ Page précédente', 'Pg↑'], ['next', 'Page suivante ›', 'Pg↓'], ['last', 'Dernière page ⏭']])}
                ${menu('Relecture', [['comment', '💬 Commenter le passage ou l’objet choisi…'], ['suggest', '✎ Suggérer une modification du texte choisi…'], ['reviewpanel', '🗂 Voir les commentaires'], ['-'], ['sendreview', '📨 Envoyer à un cousin (fichier de relecture)…'], ['importreview', '⤒ Importer les commentaires d’un cousin…'], ['annot', '📝 PDF annoté (avec les commentaires)…']])}
                ${menu('Affichage', [['zin', 'Zoom avant', '⌘+'], ['zout', 'Zoom arrière', '⌘−'], ['zfit', '⤢ Ajuster à la fenêtre', '⌘0'], ['z100', '100 % (taille réelle)', '⌘1'], ['-'], ['guides', '📏 Repères et marges'], ['snap', '🧲 Aimanter'], ['preview', 'Aperçu (sans repères)', 'W']])}</span>
                <span class="ly-hbtns" data-tbg="ly-hist" data-tbg-label="Annuler / rétablir (en haut)"><button type="button" class="ly-hbtn" data-ly-cmd="undo" title="Annuler (⌘Z)">↶</button><button type="button" class="ly-hbtn" data-ly-cmd="redo" title="Rétablir (⇧⌘Z)">↷</button></span><span class="ly-spacer"></span><span class="ly-state" data-ly-state data-ui-status></span>${ext.tbButton ? ext.tbButton('layout') : ''}<button type="button" class="button small secondary" data-ly-cmd="export" title="Exporter : PDF, ePub, HTML, impression, fichier du document">⤓ Exporter ▾</button><button type="button" class="button small" data-ly-cmd="save" title="Enregistrer" data-shortcut="⌘S">💾 Enregistrer</button>${ext.fullButton ? ext.fullButton('layout') : ''}<button type="button" class="icon-button" data-ly-cmd="close" aria-label="Fermer">×</button></div>
            <div class="ly-main"><div class="ly-tools" data-tbg="ly-tools" data-tbg-label="Outils (colonne de gauche)">${TOOLS.map(([k, ic, l, key]) => `<button type="button" data-ly-tool="${k}" title="${esc(l.replace(` (${String(key || '').toUpperCase()})`, ''))}" data-shortcut="${esc(String(key || '').toUpperCase())}" class="${k === 'select' ? 'is-on' : ''}">${ic}</button>`).join('')}<div class="ly-fs" title="Fond et contour de l’objet choisi : clic = choisir la couleur" data-shortcut="X"><button type="button" data-ly-target="fill" class="ly-fs-fill" title="Fond : clic pour choisir la couleur"></button><button type="button" data-ly-target="stroke" class="ly-fs-stroke" title="Contour : clic pour choisir la couleur"></button><button type="button" class="ly-fs-swap" data-ly-fsswap title="Intervertir fond et contour (⇧X)" data-shortcut="⇧X">⇄</button><button type="button" class="ly-fs-none" data-ly-fsnone title="Aucune couleur pour le fond ou le contour choisi (/)" data-shortcut="/">⧄</button><input type="color" data-ly-fspick tabindex="-1" aria-hidden="true"></div></div>
                <div class="ly-canvas" data-ly-canvas tabindex="0"><div class="ly-board" data-ly-board></div></div>
                <aside class="ly-panels"><span class="ly-resize" data-ly-resize title="Glisser pour élargir ou rétrécir le panneau (double-clic : taille de départ)"></span><div class="ly-ptabs" data-tbg="ly-tabs" data-tbg-label="Onglets du panneau de droite">${PANELS.map(([k, ic, l]) => `<button type="button" data-ly-panel="${k}" class="${k === panel ? 'is-on' : ''}" title="${l}" data-tb-label="${ic} ${l}">${ic}<span>${l}</span></button>`).join('')}</div><div class="ly-pbody" data-ly-pbody data-dnd-off></div></aside></div>
            <div class="ly-status" data-tbg="ly-status" data-tbg-label="Barre du bas"><button type="button" data-ly-cmd="first" title="Première page">⏮</button><button type="button" data-ly-cmd="prev" title="Page précédente">‹</button><span data-tb="page" data-tb-label="Numéro de la page">Page <input type="number" min="1" data-ly-goto> / <b data-ly-total></b></span><button type="button" data-ly-cmd="next" title="Page suivante">›</button><button type="button" data-ly-cmd="last" title="Dernière page">⏭</button>
                <span class="ly-pos" data-ly-pos data-tb-label="Position du pointeur (mm)"></span><button type="button" class="ly-light" data-ly-light data-ly-cmd="preflight" data-tb-label="Voyant des erreurs (contrôle en direct)" title="Contrôle en direct"><i></i><span>…</span></button><span class="ly-msg" data-ly-msg data-tb-label="Messages"></span></div>
            <style data-ly-css></style>`;
        document.body.appendChild(dl);
        ext.tbApply?.(dl, 'layout');
        window.LCNDA_UI?.harmonizeTopbar?.(dl.querySelector('.ly-top')); // E1 : ✓ Enregistré · ⚙️ · ⤓ Exporter · 💾 · ⛶ · ×
        window.LCNDA_UI?.editorRail?.(dl.querySelector('.ly-tools'), {breaks: ['[data-ly-tool=text]', '[data-ly-tool=rect]', '[data-ly-tool=hand]', '.ly-fs']}); // K19
        ext.editorKeysAttach?.(dl, 'layout'); // ⌨️ raccourcis à soi // menus, outils, onglets et barre du bas rangés ou cachés à sa façon (⚙️ Personnaliser, ou Réglages)
        const $ = q => dl.querySelector(q), board = $('[data-ly-board]'), canvas = $('[data-ly-canvas]'), pbody = $('[data-ly-pbody]');
        bindFontPick(pbody);
        // le panneau de droite s'élargit ou se rétrécit en tirant sa bordure (gardé pour la prochaine fois)
        const PW_KEY = 'genealogie-layout-panel-w', main = $('.ly-main');
        const setPanelW = w => { w = Math.round(clamp(w, 260, Math.max(320, window.innerWidth - 420))); main.style.gridTemplateColumns = `36px minmax(0,1fr) ${w}px`; return w; };
        try { const w0 = Number(localStorage.getItem(PW_KEY)); if (w0) setPanelW(w0); } catch (_) {}
        $('[data-ly-resize]').addEventListener('pointerdown', e => {
            e.preventDefault(); const x0 = e.clientX, w0 = $('.ly-panels').getBoundingClientRect().width; let w = w0;
            const mv = ev => { w = setPanelW(w0 + (x0 - ev.clientX)); };
            const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); try { localStorage.setItem(PW_KEY, String(w)); } catch (_) {} };
            addEventListener('pointermove', mv); addEventListener('pointerup', up);
        });
        $('[data-ly-resize]').addEventListener('dblclick', () => { main.style.gridTemplateColumns = ''; try { localStorage.removeItem(PW_KEY); } catch (_) {} });
        function menu(label, items) { return `<details class="ly-menu" data-tb="menu-${esc(label)}" data-tb-label="Menu ${esc(label)}"><summary>${label}</summary><div class="ly-menu-list">${items.map(([k, l, sc]) => k === '-' ? '<hr>' : `<button type="button" data-ly-cmd="${k}"><span>${l}</span>${sc ? `<kbd>${sc}</kbd>` : ''}</button>`).join('')}</div></details>`; }
        let sbar = null; // K18 : la barre du bas commune (page · aide de l'outil · 🧲 📏 · zoom)
        const msg = t => { if (sbar) sbar.flash(t || ''); else { const m = $('[data-ly-msg]'); if (m) m.textContent = t || ''; } };
        // « quitter la page ? » seulement s'il reste des changements pas enregistrés (pas après un zoom ou un document enregistré)
        ['input', 'change'].forEach(t => dl.addEventListener(t, () => queueMicrotask(() => { dl.dataset.dirty = dirty ? '1' : ''; })));
        const status = st => { const el = $('[data-ly-state]'); if (!el) return; if (window.LCNDA_UI?.savedStatus) window.LCNDA_UI.savedStatus(el, st); else el.textContent = {saved: '✓ Enregistré', dirty: '• modifié', saving: 'Enregistrement…', error: '⚠️ Pas enregistré'}[st] || st; };
        const setDirty = (v = true) => { dirty = v; dl.dataset.dirty = dirty ? '1' : ''; status(dirty || !docId ? 'dirty' : 'saved'); $('[data-ly-kind]').textContent = design ? '🎨 design' : ''; };
        /* Historique : chaque modification est une étape nommée ; ↶ ↷ (⌘Z, ⇧⌘Z) ou un clic sur une étape y revient */
        const snapshot = () => JSON.stringify({D, cur});
        let timeline = [{snap: snapshot(), label: 'Ouverture du document', at: new Date()}], pos = 0;
        const commit = (label = '') => {
            const snap = snapshot(); if (snap === timeline[pos].snap) { act = ''; return; }
            timeline = timeline.slice(0, pos + 1); timeline.push({snap, label: label || act || 'Modification', at: new Date()}); act = '';
            if (timeline.length > 150) timeline.shift(); pos = timeline.length - 1; setDirty(); syncHistory();
        };
        const goTo = i => { if (i < 0 || i >= timeline.length) return; if (editingId) stopEditing(); const o = JSON.parse(timeline[i].snap); D = o.D; cur = Math.min(o.cur, D.pages.length - 1); sel = []; editingId = null; pos = i; setDirty(); render(); syncHistory(); };
        const undo = () => { if (editingId) stopEditing(); if (pos <= 0) return msg('Rien à annuler.'); msg(`Annulé : ${timeline[pos].label}`); goTo(pos - 1); };
        const redo = () => { if (pos >= timeline.length - 1) return msg('Rien à rétablir.'); goTo(pos + 1); msg(`Rétabli : ${timeline[pos].label}`); };
        // H7 : une suppression faite sans question ; « ↶ Annuler » dans le message en bas à gauche (tant que rien d'autre n'a changé depuis)
        const undoable = message => { const at = pos; A().undoToast?.(message, {undo: () => { if (!dl.isConnected) throw new Error('la mise en page est fermée'); if (pos !== at) throw new Error('d’autres changements ont suivi : utilise ↶ dans la barre de l’outil'); undo(); }, redo: () => { if (dl.isConnected && pos === at - 1) redo(); }}); };
        function syncHistory() {
            const u = dl.querySelector('[data-ly-cmd="undo"].ly-hbtn'), r = dl.querySelector('[data-ly-cmd="redo"].ly-hbtn');
            if (u) { u.disabled = pos <= 0; u.title = pos > 0 ? `Annuler : ${timeline[pos].label} (⌘Z)` : 'Rien à annuler'; }
            if (r) { r.disabled = pos >= timeline.length - 1; r.title = pos < timeline.length - 1 ? `Rétablir : ${timeline[pos + 1].label} (⇧⌘Z)` : 'Rien à rétablir'; }
            if (panel === 'history') renderPanel();
        }

        /* — où sont les objets : la page courante, ou le gabarit modifié — */
        const curList = () => editMaster ? (D.masters.find(m => m.id === editMaster)?.items || []) : (D.pages[cur]?.items || []);
        const findItem = idv => { for (const [li, list] of [[cur, curList()], ...D.pages.map((p, i) => [i, p.items]), ...D.masters.map(m => ['m' + m.id, m.items])]) { const it = list.find(x => x.id === idv); if (it) return {it, list, where: li}; } return null; };
        const selected = () => sel.map(i => curList().find(x => x.id === i)).filter(Boolean);
        const one = () => { const s = selected(); return s.length === 1 ? s[0] : null; };
        const pageEl = () => board.querySelector(editMaster ? '.ly-page.is-master' : `.ly-page[data-page="${cur}"]`);
        const locked = it => it.locked || layerOf(D, it)?.locked;

        /* — dessin — */
        function render() {
            chapCache = {sig: ''}; // le chapitre en cours ({chapitre}) se recalcule à chaque dessin
            $('[data-ly-css]').textContent = BASE_CSS + docCss(D, '.ly-editor .ly-board') + `.ly-editor .ly-board{--ly-zoom:${zoom}}`;
            const ctx = {editingId, preview: preview || !guides};
            if (editMaster) { const m = D.masters.find(x => x.id === editMaster); board.innerHTML = m ? `<div class="ly-spread is-master-edit"><div class="ly-master-banner">Gabarit « ${esc(m.name)} » — ce qui est posé ici apparaît sur toutes ses pages. <button type="button" class="button small secondary" data-ly-cmd="mfolio">＋ Numéro de page</button><button type="button" class="button small secondary" data-ly-cmd="mrunning">＋ Titre du livre en haut</button><button type="button" class="button small secondary" data-ly-cmd="mchapter">＋ Chapitre en cours en haut</button><button type="button" class="button small secondary" data-ly-cmd="mfooter">＋ Pied de page</button><button type="button" class="button small" data-ly-cmd="endmaster">Revenir aux pages</button></div>${masterHtml(D, m, ctx)}</div>` : ''; }
            else { const V = resolveDoc(D, {editingId}); board.innerHTML = spreads(V).map(sp => `<div class="ly-spread${sp.includes(cur) ? ' is-cur' : ''}">${sp.map(i => pageHtml(V, i, ctx)).join('')}</div>`).join(''); }
            if (linkFrom) board.classList.add('is-linking'); else board.classList.remove('is-linking');
            board.style.zoom = zoom; board.classList.toggle('no-guides', !guides || preview);
            drawSel(); syncChrome(); renderPanel();
            if (editingId) { const t = board.querySelector(`.ly-item[data-id="${CSS.escape(editingId)}"] .ly-txt`); if (t) { bindEditing(t); } }
            markOverflow(); drawBubbles();
        }
        /** Un texte qui ne tient pas dans son cadre : petit ⊞ rouge, comme dans InDesign */
        function markOverflow() { board.querySelectorAll('.ly-text').forEach(el => { const t = el.querySelector('.ly-txt'), bx = el.querySelector('.ly-txtbox'); if (!t || !bx) return; const over = t.scrollHeight > bx.clientHeight + 2 || t.scrollWidth > bx.clientWidth + 2; el.classList.toggle('is-over', over); }); scheduleLight(); }
        function drawSel() {
            board.querySelectorAll('.ly-selbox,.ly-snapline').forEach(x => x.remove());
            const pe = pageEl(); if (!pe) return;
            selected().forEach(it => {
                const b = document.createElement('div'); b.className = 'ly-selbox' + (locked(it) ? ' is-locked' : '') + (sel.length > 1 ? ' is-multi' : ''); b.dataset.for = it.id;
                b.style.cssText = `left:${px(it.x)}px;top:${px(it.y)}px;width:${px(it.w)}px;height:${Math.max(px(it.h), 1)}px;transform:rotate(${it.rot || 0}deg)`;
                if (sel.length === 1 && !locked(it) && it.id !== editingId) b.innerHTML = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(h => `<i class="ly-h ly-h-${h}" data-h="${h}"></i>`).join('') + '<i class="ly-h ly-h-rot" data-h="rot" title="Faire tourner"></i>';
                pe.appendChild(b);
            });
        }
        function syncChrome() {
            $('[data-ly-total]').textContent = D.pages.length; const g = $('[data-ly-goto]'); if (document.activeElement !== g) g.value = cur + 1; g.max = D.pages.length;
            dl.querySelectorAll('[data-ly-tool]').forEach(b => b.classList.toggle('is-on', b.dataset.lyTool === tool)); canvas.dataset.tool = tool;
            sbar?.sync(); sbar?.setHelp(TOOL_HELP[tool] || '');
            const it = one(); const fs = dl.querySelector('.ly-fs-fill'), ss = dl.querySelector('.ly-fs-stroke');
            fs.style.background = it ? cssPaint(D, it.fill) : '#fff'; ss.style.borderColor = it ? colorOf(D, it.stroke?.c, 'transparent') : '#111';
            fs.classList.toggle('is-on', fillTarget === 'fill'); ss.classList.toggle('is-on', fillTarget === 'stroke');
            dl.querySelectorAll('[data-ly-cmd="guides"],[data-ly-cmd="snap"],[data-ly-cmd="preview"]').forEach(b => b.classList.toggle('is-checked', {guides, snap: snapOn, preview}[b.dataset.lyCmd]));
        }
        const goPage = (i, scroll = true) => { if (editingId) stopEditing(); cur = clamp(Math.round(i), 0, D.pages.length - 1); sel = []; editMaster = null; render(); if (scroll) pageEl()?.scrollIntoView({block: 'center', inline: 'center', behavior: 'smooth'}); };
        const setZoom = z => { const cx = canvas.scrollLeft + canvas.clientWidth / 2, cy = canvas.scrollTop + canvas.clientHeight / 2, k = z / zoom; zoom = clamp(z, 0.1, 8); board.style.zoom = zoom; canvas.scrollLeft = cx * k - canvas.clientWidth / 2; canvas.scrollTop = cy * k - canvas.clientHeight / 2; syncChrome(); };
        const zoomFit = () => { const W = px(D.page.w) * (D.page.facing ? 2 : 1) + 60, H = px(D.page.h) + 60; setZoom(Math.min(canvas.clientWidth / W, canvas.clientHeight / H)); pageEl()?.scrollIntoView({block: 'center', inline: 'center'}); };
        if (window.LCNDA_UI?.editorStatus) { // K18 : à gauche la page (et la position), au milieu l'aide de l'outil, à droite 🧲 📏 et le zoom
            sbar = window.LCNDA_UI.editorStatus({magnetTitle: 'Aimanter : les objets se collent aux marges, aux repères et aux autres objets',
                magnet: {get: () => snapOn, set: v => { snapOn = !!v; syncChrome(); }},
                rulersTitle: 'Repères et marges : montrer ou cacher', rulers: {get: () => guides, set: v => { guides = !!v; render(); }},
                zoom: {get: () => zoom, set: k => setZoom(k), fit: () => zoomFit(), min: 0.1, max: 8}});
            const old = $('.ly-status'), wh = document.createDocumentFragment(); old.querySelector('[data-ly-msg]')?.remove(); wh.append(...old.childNodes); sbar.setWhere(wh); sbar.querySelector('[data-ed-where]').classList.add('ly-status-where'); sbar.querySelector('[data-ed-help]').setAttribute('data-ly-msg', ''); old.replaceWith(sbar);
        }

        /* — coordonnées : millimètres de la page sous la souris — */
        const mmAt = (e, pe = pageEl()) => { const r = pe.getBoundingClientRect(), k = r.width / (pe.classList.contains('is-master') ? D.page.w : pageSize(D, Number(pe.dataset.page) || 0).w); return {x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k, k}; };
        const pageOfEvent = e => e.target.closest?.('.ly-page');

        /* — texte : édition dans le cadre — */
        function startEditing(it) {
            if (it.auto) { panel = 'obj'; sel = [it.id]; render(); return msg(`${({toc: 'Le sommaire', index: 'L’index des noms', places: 'L’index des lieux', jobs: 'L’index des métiers', notes: 'Le bloc des notes', biblio: 'La bibliographie'})[it.auto] || 'Ce bloc'} se remplit tout seul (réglages dans Objet).`); }
            const head = chainHead(it);
            if (head !== it) { if (head.auto) return msg('Ce bloc est la suite d’un sommaire ou d’un index automatique.'); const pi = pageOfItem(head.id); if (pi >= 0 && pi !== cur) { cur = pi; } msg('Texte chaîné : il s’écrit dans son premier bloc (la suite se remplit toute seule).'); it = head; }
            if (it.dyn) { // la question d'abord, puis on revient ici sans l'objet dynamique
                A().confirmBox('Ce texte suit une fiche de la généalogie (objet dynamique). L’écrire à la main le détache de la fiche.', {title: 'Détacher le texte de la fiche ?', okLabel: 'Détacher et écrire'}).then(ok => { if (!ok) return; delete it.dyn; commit('Texte détaché de la fiche'); startEditing(it); });
                return;
            }
            if (locked(it)) return msg('Objet verrouillé.'); editingId = it.id; sel = [it.id]; render(); const t = board.querySelector(`.ly-item[data-id="${CSS.escape(it.id)}"] .ly-txt`); if (t) { t.focus(); const r = document.createRange(); r.selectNodeContents(t); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } panel = 'text'; renderPanel(); }
        const readEditing = el => { const c = el.cloneNode(true); c.querySelectorAll('.ly-wrapf').forEach(x => x.remove()); return c.innerHTML; };
        function bindEditing(t) {
            if (t.dataset.bound) return; t.dataset.bound = '1';
            t.addEventListener('input', () => { const f = findItem(editingId); if (f) { f.it.html = readEditing(t); setDirty(); markOverflow(); } });
            t.addEventListener('paste', e => { e.preventDefault(); const txt = e.clipboardData.getData('text/plain'); document.execCommand('insertText', false, txt); });
            t.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopEditing(); } });
        }
        function stopEditing(label = 'Texte modifié') {
            if (!editingId) return; const f = findItem(editingId), t = board.querySelector(`.ly-item[data-id="${CSS.escape(editingId)}"] .ly-txt`);
            if (f && t) f.it.html = sanitizeHtml(readEditing(t)) || '<p data-ps="ps-body"><br></p>';
            editingId = null; savedRange = null; commit(label); render();
        }
        document.addEventListener('selectionchange', () => { if (!editingId || !dl.isConnected) return; const s = getSelection(); if (!s.rangeCount) return; const r = s.getRangeAt(0), t = board.querySelector('.ly-txt[contenteditable="true"]'); if (t && t.contains(r.commonAncestorContainer)) savedRange = r.cloneRange(); });
        const editEl = () => board.querySelector('.ly-txt[contenteditable="true"]');
        const restoreRange = () => { const t = editEl(); if (!t || !savedRange) return null; const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); return savedRange; };
        const blocksOf = (t, r) => { const all = [...t.children].filter(c => !c.classList.contains('ly-wrapf')); if (!r || r.collapsed && false) return all; return all.filter(b => r.intersectsNode(b)); };
        /** Mise en forme des caractères : la sélection dans le texte, sinon tout le cadre */
        // enlève les attributs style vides et les <span> devenus inutiles
        const tidySpans = root => { root.querySelectorAll?.('[style=""]').forEach(e => e.removeAttribute('style')); root.querySelectorAll?.('span:not([style]):not([data-cs])').forEach(e => e.replaceWith(...e.childNodes)); };
        function applyChar(props) {
            const t = editEl(), css = Object.entries(props).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}:${v}`).join(';');
            const clean = el => Object.keys(props).forEach(k => el.style?.removeProperty(k));
            if (t) {
                const r = restoreRange();
                if (r && !r.collapsed) {
                    const blocks = blocksOf(t, r);
                    const spans = [];
                    blocks.forEach(b => { const rr = document.createRange(); rr.selectNodeContents(b); if (b.contains(r.startContainer) || b === r.startContainer) rr.setStart(r.startContainer, r.startOffset); if (b.contains(r.endContainer) || b === r.endContainer) rr.setEnd(r.endContainer, r.endOffset); if (rr.collapsed) return; const frag = rr.extractContents(); frag.querySelectorAll('[style]').forEach(clean); tidySpans(frag); const sp = document.createElement('span'); sp.setAttribute('style', cleanStyle(css)); sp.appendChild(frag); rr.insertNode(sp); spans.push(sp); });
                    // les mots restent choisis : on peut enchaîner couleur, gras, taille…
                    if (spans.length) { const nr = document.createRange(); nr.setStartBefore(spans[0]); nr.setEndAfter(spans[spans.length - 1]); savedRange = nr; const sl = getSelection(); sl.removeAllRanges(); sl.addRange(nr); }
                    const f = findItem(editingId); if (f) f.it.html = readEditing(t); setDirty(); markOverflow(); return;
                }
                blocksOf(t, null).forEach(b => { b.querySelectorAll('[style]').forEach(clean); tidySpans(b); b.setAttribute('style', cleanStyle([b.getAttribute('style') || '', css].join(';'))); });
                const f = findItem(editingId); if (f) f.it.html = readEditing(t); setDirty(); markOverflow(); return;
            }
            const items = selected().filter(x => x.type === 'text'); if (!items.length) return msg('Choisis un bloc de texte (ou du texte dedans).');
            items.forEach(it => { const box0 = document.createElement('div'); box0.innerHTML = it.html; [...box0.children].forEach(b => { b.querySelectorAll('[style]').forEach(clean); tidySpans(b); b.setAttribute('style', cleanStyle([b.getAttribute('style') || '', css].join(';'))); }); it.html = sanitizeHtml(box0.innerHTML); });
            commit(); render();
        }
        /** Mise en forme des paragraphes (ceux de la sélection, ou tous ceux du cadre) */
        function applyPara(fn) {
            const t = editEl();
            if (t) { blocksOf(t, restoreRange()).forEach(fn); const f = findItem(editingId); if (f) f.it.html = readEditing(t); setDirty(); markOverflow(); return; }
            const items = selected().filter(x => x.type === 'text'); if (!items.length) return msg('Choisis un bloc de texte.');
            items.forEach(it => { const b0 = document.createElement('div'); b0.innerHTML = it.html; [...b0.children].forEach(fn); it.html = sanitizeHtml(b0.innerHTML); });
            commit(); render();
        }
        const paraCss = (b, k, v) => { b.style.setProperty(k, v); if (!b.getAttribute('style')) b.removeAttribute('style'); };

        /* — créer, déplacer, transformer à la souris — */
        let drag = null, pen = null;
        canvas.addEventListener('pointerdown', e => {
            const bub = e.target.closest('.ly-cbub'); if (bub) { e.preventDefault(); e.stopPropagation(); focusCm = bub.dataset.lyCgo; panel = 'review'; drawBubbles(); renderPanel(); pbody.querySelector('.ly-cm.is-focus')?.scrollIntoView({block: 'nearest'}); return; }
            if (e.button === 1 || tool === 'hand' || e.target.closest('.ly-master-banner')) { if (e.target.closest('.ly-master-banner')) return; const sx = canvas.scrollLeft, sy = canvas.scrollTop, x0 = e.clientX, y0 = e.clientY; const mv = ev => { canvas.scrollLeft = sx - (ev.clientX - x0); canvas.scrollTop = sy - (ev.clientY - y0); }; const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); return; }
            { // le petit + rouge d'un texte qui déborde : un clic dessus, puis un clic sur un autre bloc, et la suite y continue (comme dans InDesign)
                const ov = !linkFrom && e.target.closest('.ly-item.ly-text.is-over:not(.ly-has-next):not(.ly-from-master)');
                if (ov) { const r = ov.getBoundingClientRect(); if (e.clientX > r.right - 12 && e.clientY > r.bottom - 12) { e.preventDefault(); e.stopPropagation(); sel = [ov.dataset.id]; return exec('chain'); } }
            }
            if (linkFrom) { // ➜ chaîner : le prochain clic choisit le bloc qui reçoit la suite
                e.preventDefault(); const el = e.target.closest('.ly-item.ly-text:not(.ly-from-master)'), from = findItem(linkFrom)?.it; linkFrom = null; canvas.classList.remove('is-linking');
                if (!el || !from) { render(); return msg('Chaînage annulé.'); }
                const to = findItem(el.dataset.id)?.it; if (to) setLink(from, to); else render(); return;
            }
            // tracer en partant de la table de montage (hors de la page, dans le fond perdu) : sur la page courante
            const pe = pageOfEvent(e) || (!['select', 'hand', 'zoom'].includes(tool) ? pageEl() : null);
            if (editingId) { if (e.target.closest('.ly-txt[contenteditable="true"]')) return; stopEditing(); }
            if (!pe) { if (tool === 'select') { sel = []; drawSel(); renderPanel(); } return; }
            // une autre page : elle devient la page courante
            if (!editMaster && pe.dataset.page !== undefined && Number(pe.dataset.page) !== cur) { cur = Number(pe.dataset.page); sel = []; render(); }
            const P = mmAt(e, pageEl()); canvas.focus({preventScroll: true});
            if (tool === 'zoom') { setZoom(zoom * (e.altKey ? 1 / 1.5 : 1.5)); return; }
            if (tool === 'pen') { e.preventDefault(); penClick(P, e); return; }
            if (tool !== 'select') { e.preventDefault(); createDrag(P, e); return; }
            const h = e.target.closest('[data-h]'), itemEl = e.target.closest('.ly-item:not(.ly-from-master)');
            if (h && one()) { e.preventDefault(); transformDrag(one(), h.dataset.h, P, e); return; }
            if (itemEl) {
                const it = curList().find(x => x.id === itemEl.dataset.id); if (!it) return;
                if (locked(it)) { sel = [it.id]; drawSel(); renderPanel(); msg('Objet verrouillé (Objet → Verrouiller pour le libérer).'); return; }
                if (e.shiftKey) { sel = sel.includes(it.id) ? sel.filter(x => x !== it.id) : [...sel, it.id]; drawSel(); renderPanel(); return; }
                if (!sel.includes(it.id)) sel = [it.id];
                e.preventDefault(); moveDrag(P, e); return;
            }
            if (e.target.closest('.ly-from-master')) msg('Élément du gabarit : Pages → gabarit → « Modifier », ou « Détacher les éléments du gabarit ».');
            e.preventDefault(); marquee(P, e);
        });
        canvas.addEventListener('dblclick', e => {
            const itemEl = e.target.closest('.ly-item:not(.ly-from-master)'); if (!itemEl) return;
            const it = curList().find(x => x.id === itemEl.dataset.id); if (!it) return;
            if (tool === 'pen') return;
            if (it.type === 'text') startEditing(it); else if (it.type === 'frame' && it.qr) qrDialog(it); else if (it.type === 'frame') placeImage(it);
        });
        canvas.addEventListener('pointermove', e => { const pe = pageEl(); if (!pe || !pe.contains(e.target) && !pageOfEvent(e)) return; const P = mmAt(e, pe); $('[data-ly-pos]').textContent = `x ${r1(P.x)} · y ${r1(P.y)} mm`; if (pen) drawPen(P); });
        canvas.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, {passive: false});
        /** Repères aimantés : bords et milieux de la page, marges, autres objets */
        function snapLines(skip) {
            const m = editMaster ? {t: D.page.margin.t, b: D.page.margin.b, l: D.page.margin.o, r: D.page.margin.i} : pageMargins(D, cur), W = editMaster ? D.page.w : pageSize(D, cur).w, H = editMaster ? D.page.h : pageSize(D, cur).h;
            const xs = [0, W, W / 2, m.l, W - m.r], ys = [0, H, H / 2, m.t, H - m.b];
            curList().forEach(o => { if (skip.includes(o.id) || o.hidden) return; xs.push(o.x, o.x + o.w, o.x + o.w / 2); ys.push(o.y, o.y + o.h, o.y + o.h / 2); });
            return {xs, ys};
        }
        function snapBox(b, lines, k) {
            if (!snapOn) return {dx: 0, dy: 0, gx: null, gy: null};
            const tol = 6 / k; let best = {dx: 0, gx: null, d: tol}, bestY = {dy: 0, gy: null, d: tol};
            [b.x, b.x + b.w / 2, b.x + b.w].forEach(v => lines.xs.forEach(L => { const d = Math.abs(L - v); if (d < best.d) best = {dx: L - v, gx: L, d}; }));
            [b.y, b.y + b.h / 2, b.y + b.h].forEach(v => lines.ys.forEach(L => { const d = Math.abs(L - v); if (d < bestY.d) bestY = {dy: L - v, gy: L, d}; }));
            return {dx: best.dx, dy: bestY.dy, gx: best.gx, gy: bestY.gy};
        }
        const showSnap = (gx, gy) => { const pe = pageEl(); pe.querySelectorAll('.ly-snapline').forEach(x => x.remove()); if (gx !== null) { const l = document.createElement('i'); l.className = 'ly-snapline is-v'; l.style.left = px(gx) + 'px'; pe.appendChild(l); } if (gy !== null) { const l = document.createElement('i'); l.className = 'ly-snapline is-h'; l.style.top = px(gy) + 'px'; pe.appendChild(l); } };
        function moveDrag(P0, e) {
            let items = selected().filter(x => !locked(x)), moved = false;
            const dup = e.altKey; const start = items.map(it => ({it, x: it.x, y: it.y}));
            const bb = bounds(items), lines = snapLines(items.map(x => x.id));
            const mv = ev => {
                const P = mmAt(ev); let dx = P.x - P0.x, dy = P.y - P0.y; if (!moved && Math.hypot(dx, dy) * P.k < 3) return;
                if (!moved && dup) { const copies = relink(items, items.map(it => ({...JSON.parse(JSON.stringify(it)), id: nid('c')}))); curList().push(...copies); items = copies; sel = copies.map(c => c.id); start.splice(0, start.length, ...copies.map(it => ({it, x: it.x, y: it.y}))); render(); }
                moved = true; if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
                const sn = snapBox({x: bb.x + dx, y: bb.y + dy, w: bb.w, h: bb.h}, lines, P.k); dx += sn.dx; dy += sn.dy;
                start.forEach(s => { s.it.x = r1(s.x + dx); s.it.y = r1(s.y + dy); const el = board.querySelector(`.ly-item[data-id="${CSS.escape(s.it.id)}"]`); if (el) { el.style.left = px(s.it.x) + 'px'; el.style.top = px(s.it.y) + 'px'; } });
                drawSel(); showSnap(sn.gx, sn.gy);
            };
            const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) { commit(dup ? 'Copie déplacée' : `Déplacement (${start.length} objet${start.length > 1 ? 's' : ''})`); render(); } else { drawSel(); renderPanel(); } };
            addEventListener('pointermove', mv); addEventListener('pointerup', up); drawSel(); renderPanel();
        }
        function transformDrag(it, h, P0, e) {
            const s0 = {x: it.x, y: it.y, w: it.w, h: it.h, rot: it.rot || 0}, a = s0.rot * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a), cx0 = s0.x + s0.w / 2, cy0 = s0.y + s0.h / 2;
            const mv = ev => {
                const P = mmAt(ev);
                if (h === 'rot') { let ang = Math.atan2(P.y - cy0, P.x - cx0) * 180 / Math.PI + 90; if (ev.shiftKey) ang = Math.round(ang / 15) * 15; it.rot = r1(((ang + 540) % 360) - 180); }
                else {
                    const dx = P.x - P0.x, dy = P.y - P0.y, lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
                    const sx = h.includes('e') ? 1 : h.includes('w') ? -1 : 0, sy = h.includes('s') ? 1 : h.includes('n') ? -1 : 0;
                    let w = s0.w + sx * lx, hh = s0.h + sy * ly;
                    if ((ev.shiftKey || it.lockRatio) && sx && sy && s0.w && s0.h) { const k = Math.max(w / s0.w, hh / s0.h); w = s0.w * k; hh = s0.h * k; }
                    w = Math.max(it.type === 'line' ? 0 : 1, w); hh = Math.max(it.type === 'line' ? 0 : 1, hh);
                    const dw = (w - s0.w) * sx / 2, dh = (hh - s0.h) * sy / 2, ncx = cx0 + dw * cos - dh * sin, ncy = cy0 + dw * sin + dh * cos;
                    it.w = r1(w); it.h = r1(hh); it.x = r1(ncx - w / 2); it.y = r1(ncy - hh / 2);
                }
                const el = board.querySelector(`.ly-item[data-id="${CSS.escape(it.id)}"]`); if (el) el.outerHTML = itemHtml(D, it, {pageNo: cur + 1, pages: D.pages.length, title: D.title, others: curList()});
                drawSel();
            };
            const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); commit(h === 'rot' ? 'Rotation' : 'Taille changée'); render(); };
            addEventListener('pointermove', mv); addEventListener('pointerup', up);
        }
        function marquee(P0, e) {
            const pe = pageEl(), m = document.createElement('div'); m.className = 'ly-marquee'; pe.appendChild(m); let moved = false;
            const mv = ev => { const P = mmAt(ev); moved = true; const x = Math.min(P.x, P0.x), y = Math.min(P.y, P0.y), w = Math.abs(P.x - P0.x), h = Math.abs(P.y - P0.y); m.style.cssText = `left:${px(x)}px;top:${px(y)}px;width:${px(w)}px;height:${px(h)}px`; m.dataset.r = JSON.stringify([x, y, w, h]); };
            const up = ev => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); m.remove(); if (!moved || !m.dataset.r) { if (!ev.shiftKey) sel = []; drawSel(); renderPanel(); return; } const [x, y, w, h] = JSON.parse(m.dataset.r); const hit = curList().filter(o => !o.hidden && layerOf(D, o)?.visible !== false && o.x < x + w && o.x + o.w > x && o.y < y + h && o.y + o.h > y).map(o => o.id); sel = ev.shiftKey ? [...new Set([...sel, ...hit])] : hit; drawSel(); renderPanel(); };
            addEventListener('pointermove', mv); addEventListener('pointerup', up);
        }
        const activeLayer = () => (D.layers.find(l => l.id === dl.dataset.layer && l.visible && !l.locked) || D.layers.find(l => l.visible && !l.locked) || D.layers[0]).id;
        function createDrag(P0, e) {
            const pe = pageEl(), ghost = document.createElement('div'); ghost.className = 'ly-ghost'; pe.appendChild(ghost); let P1 = P0;
            const mv = ev => { P1 = mmAt(ev); let w = P1.x - P0.x, h = P1.y - P0.y; if (ev.shiftKey && tool !== 'line') { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; } P1 = {...P1, x: P0.x + w, y: P0.y + h}; ghost.style.cssText = `left:${px(Math.min(P0.x, P1.x))}px;top:${px(Math.min(P0.y, P1.y))}px;width:${px(Math.abs(w))}px;height:${px(Math.abs(h))}px${tool === 'ellipse' ? ';border-radius:50%' : ''}`; };
            const up = () => {
                removeEventListener('pointermove', mv); removeEventListener('pointerup', up); ghost.remove();
                let x = Math.min(P0.x, P1.x), y = Math.min(P0.y, P1.y), w = Math.abs(P1.x - P0.x), h = Math.abs(P1.y - P0.y);
                const small = w < 2 && h < 2; if (small) { w = tool === 'text' ? 80 : 40; h = tool === 'text' ? 30 : tool === 'line' ? 0 : 40; }
                const layer = activeLayer(); let it;
                if (tool === 'text') it = textItem({x, y, w, h, layer});
                else if (tool === 'frame') it = shapeItem('frame', {x, y, w, h, layer, fit: 'fill'});
                else if (tool === 'line') { it = shapeItem('line', {x, y, w, h: small ? 0 : h, layer}); if (P1.x < P0.x !== P1.y < P0.y) it.flipLine = true; }
                else it = shapeItem(tool, {x, y, w, h, layer, ...(tool === 'polygon' ? {sides: 6} : tool === 'star' ? {sides: 5, inner: 45} : {})});
                curList().push(it); sel = [it.id]; commit(`Nouveau : ${({text: 'bloc de texte', frame: 'cadre d’image', rect: 'rectangle', ellipse: 'ellipse', polygon: 'polygone', star: 'étoile', line: 'ligne'})[tool] || tool}`);
                if (tool === 'text') { tool = 'select'; startEditing(it); return; }
                tool = 'select'; render();
                if (it.type === 'frame') msg('Cadre d’image : double-clic pour y placer une image.');
            };
            addEventListener('pointermove', mv); addEventListener('pointerup', up);
        }
        /* plume : des points, puis un tracé (fermé si on revient au premier point) */
        function penClick(P, e) {
            if (!pen) pen = {pts: []};
            const first = pen.pts[0]; if (first && pen.pts.length > 2 && Math.hypot(P.x - first[0], P.y - first[1]) * P.k < 8) return finishPen(true);
            pen.pts.push([P.x, P.y]); drawPen(P);
            if (e.detail >= 2) finishPen(false);
        }
        function drawPen(P) {
            const pe = pageEl(); if (!pe || !pen) return; let g = pe.querySelector('.ly-penline'); if (!g) { g = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); g.setAttribute('class', 'ly-penline'); pe.appendChild(g); }
            g.setAttribute('width', px(pageSize(D, cur).w)); g.setAttribute('height', px(pageSize(D, cur).h));
            g.innerHTML = `<polyline points="${[...pen.pts, [P.x, P.y]].map(([x, y]) => `${px(x)},${px(y)}`).join(' ')}" fill="none" stroke="#2f6bff" stroke-width="1.2"/>${pen.pts.map(([x, y]) => `<rect x="${px(x) - 3}" y="${px(y) - 3}" width="6" height="6" fill="#fff" stroke="#2f6bff"/>`).join('')}`;
        }
        function finishPen(closed) {
            const pts = pen?.pts || []; pen = null; pageEl()?.querySelector('.ly-penline')?.remove();
            const uniq = pts.filter((p, i) => !i || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.3);
            if (uniq.length < 2) { render(); return; }
            const xs = uniq.map(p => p[0]), ys = uniq.map(p => p[1]), x = Math.min(...xs), y = Math.min(...ys), w = Math.max(0.5, Math.max(...xs) - x), h = Math.max(0.5, Math.max(...ys) - y);
            const it = shapeItem('path', {x, y, w, h, layer: activeLayer(), closed, fill: closed ? 'sw-light' : 'none', points: uniq.map(([px0, py0]) => [r1((px0 - x) / w * 1000) / 1000, r1((py0 - y) / h * 1000) / 1000])});
            curList().push(it); sel = [it.id]; tool = 'select'; commit('Tracé à la plume'); render();
        }
        const bounds = items => { if (!items.length) return {x: 0, y: 0, w: 0, h: 0}; const x = Math.min(...items.map(i => i.x)), y = Math.min(...items.map(i => i.y)); return {x, y, w: Math.max(...items.map(i => i.x + i.w)) - x, h: Math.max(...items.map(i => i.y + i.h)) - y}; };

        /* — commandes — */
        function arrange(kind) { const list = curList(), its = selected(); if (!its.length) return; its.forEach(it => { const i = list.indexOf(it); list.splice(i, 1); const n = list.length; const j = kind === 'front' ? n : kind === 'bottom' ? 0 : kind === 'fwd' ? Math.min(n, i + 1) : Math.max(0, i - 1); list.splice(j, 0, it); }); commit(); render(); }
        function del() { if (!sel.length) return; const list = curList(); let n = 0; sel.forEach(i => { const k = list.findIndex(x => x.id === i); if (k >= 0 && !locked(list[k])) { list.splice(k, 1); n++; } }); if (!n) return msg('Objet verrouillé : déverrouille-le d’abord (Objet → 🔒 Verrouiller / déverrouiller).'); const what = n > 1 ? `${n} objets supprimés` : 'Objet supprimé'; sel = []; commit(what); render(); undoable(what); } // H7 : supprimé sans question, « ↶ Annuler » dans le message
        function copy(cut = false) { if (!sel.length) return; clip = JSON.stringify(selected()); try { navigator.clipboard?.writeText?.('')?.catch?.(() => {}); } catch (_) {} if (cut) del(); msg(`${A().plural(JSON.parse(clip).length, 'objet copié', 'objets copiés')}.`); }
        /** Des copies : un chaînage vers un bloc copié avec elles suit la copie ; vers un bloc qui n'est pas copié, il est coupé */
        const relink = (orig, copies) => { const map = new Map(orig.map((o, k) => [o.id, copies[k].id])); copies.forEach(c => { if (c.next) { if (map.has(c.next)) c.next = map.get(c.next); else delete c.next; } }); return copies; };
        function paste(inPlace = false) { if (!clip) return msg('Rien à coller.'); const src0 = JSON.parse(clip), its = relink(src0, src0.map(it => ({...it, id: nid('c'), x: it.x + (inPlace ? 0 : 5), y: it.y + (inPlace ? 0 : 5)}))); curList().push(...its); sel = its.map(i => i.id); commit(); render(); }
        function dup() { copy(); paste(); }
        const addPages = (n, at, master) => { const pages = Array.from({length: clamp(n, 1, 500)}, () => ({id: nid('p'), master: master ?? (D.pages[cur]?.master || 'A'), items: []})); D.pages.splice(clamp(at, 0, D.pages.length), 0, ...pages); commit(); goPage(at); msg(`${A().plural(pages.length, 'page ajoutée', 'pages ajoutées')}.`); };
        function insertPagesDialog() {
            ext.openDialog({eyebrow: 'PAGES', title: 'Insérer des pages', submitLabel: 'Insérer',
                body: `<div class="form-grid"><label>Nombre de pages <input type="number" name="n" min="1" max="500" value="1"></label>
                    <label>Où <select name="where"><option value="after">après la page</option><option value="before">avant la page</option><option value="start">au début du document</option><option value="end">à la fin du document</option></select></label>
                    <label>Page <input type="number" name="page" min="1" max="${D.pages.length}" value="${cur + 1}"></label>
                    <label>Gabarit <select name="master">${D.masters.map(m => `<option value="${esc(m.id)}" ${m.id === (D.pages[cur]?.master || 'A') ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}<option value="">Aucun</option></select></label></div>`,
                onSubmit: f => { const n = Number(f.n.value) || 1, p = clamp(Number(f.page.value) || 1, 1, D.pages.length) - 1, w = f.where.value; addPages(n, w === 'start' ? 0 : w === 'end' ? D.pages.length : w === 'before' ? p : p + 1, f.master.value); }});
        }
        /** 📐 Fichier → Format du document (comme InDesign) : format de page (liste commune ou format libre), sens, pages en vis-à-vis, marges, fond perdu, colonnes ;
         *  à toutes les pages ou à certaines ; les objets restent en place ou sont remis à l'échelle ; une seule étape de l'historique (↶) */
        const pagesOfText = (t, n) => { const out = new Set(); String(t || '').split(/[,;]+/).forEach(part => { const m = part.trim().match(/^(\d+)\s*(?:[-–à]\s*(\d+))?$/); if (!m) return; const a = Number(m[1]), b = Number(m[2] || m[1]); for (let k = Math.min(a, b); k <= Math.max(a, b) && k - 1 < n; k++) if (k >= 1) out.add(k - 1); }); return [...out].sort((x, y) => x - y); };
        function docFormatDialog() {
            const F = window.LCNDA_FORMATS; if (!F) return msg('La liste des formats n’est pas chargée.');
            if (editingId) stopEditing();
            const P = D.page, M = P.margin, PS = pageSize(D, cur), st0 = P.start || 1;
            const v0 = F.fromSize(PS.w, PS.h, 'mm', 300, P.unit || 'cm');
            const n3 = (name, label, v, min = 0, max = 300, step = 0.5, unit = 'mm') => `<label><span>${label}</span><input type="number" name="${name}" value="${r1(v)}" min="${min}" max="${max}" step="${step}"${unit ? ` data-unit="${unit}"` : ''}></label>`; // K17 : l'unité dans la case
            const dlg0 = ext.openDialog({eyebrow: 'DOCUMENT', title: '📐 Format du document', wide: true, submitLabel: 'Enregistrer',
                body: `<div class="fmt-dlg-grid"><div>
                    <fieldset><legend>Format de page</legend>${F.boxHtml({value: v0, units: ['mm', 'cm', 'in'], dpi: false})}
                        <label class="checkbox-line"><input type="checkbox" name="ly_facing"${P.facing ? ' checked' : ''}> Pages en vis-à-vis (livre)</label></fieldset>
                    <fieldset><legend>Appliquer le format à</legend><div class="fmt-pagesel">
                        <label class="checkbox-line"><input type="radio" name="ly_to" value="all" checked> Toutes les pages (${A().plural(D.pages.length, 'page')})</label>
                        <label class="checkbox-line"><input type="radio" name="ly_to" value="cur"> La page ${cur + st0} seulement</label>
                        <label class="checkbox-line"><input type="radio" name="ly_to" value="some"> Les pages : <input type="text" name="ly_pages" placeholder="2-5, 8" aria-label="Numéros des pages" value="${cur + st0}"></label></div>
                        <p class="muted">Les marges, colonnes et le fond perdu valent pour tout le document.</p></fieldset>
                    <fieldset><legend>Les objets</legend><label class="checkbox-line"><input type="radio" name="ly_objs" value="keep" checked> Restent en place</label><label class="checkbox-line"><input type="radio" name="ly_objs" value="scale"> Sont remis à l’échelle (agrandis ou réduits avec la page)</label></fieldset>
                </div><div>
                    <fieldset><legend>Marges</legend><div class="fmt-row">${n3('ly_mt', 'Haut', M.t)}${n3('ly_mb', 'Bas', M.b)}${n3('ly_mi', P.facing ? 'Petit fond (intérieur)' : 'Gauche', M.i)}${n3('ly_mo', P.facing ? 'Grand fond (extérieur)' : 'Droite', M.o)}</div></fieldset>
                    <fieldset><legend>Colonnes et fond perdu</legend><div class="fmt-row">${n3('ly_cols', 'Colonnes', P.columns, 1, 12, 1, '')}${n3('ly_gut', 'Gouttière', P.gutter, 0, 60)}${n3('ly_bleed', 'Fond perdu', P.bleed, 0, 30)}</div></fieldset>
                    <dl class="fmt-before-after"><dt>Maintenant</dt><dd>${String(r1(PS.w / 10)).replace('.', ',')} × ${String(r1(PS.h / 10)).replace('.', ',')} cm</dd><dt>Après</dt><dd data-ly-fafter>—</dd></dl><p class="muted">↶ Annuler (⌘Z) revient au format d’avant.</p>
                </div></div>`,
                onOpen: d => {
                    const box = F.bindBox(d.querySelector('[data-fmt-box]'), {onChange: () => after()});
                    const after = () => { const [w, h] = F.inMm(box.get()); d.querySelector('[data-ly-fafter]').textContent = `${String(r1(w / 10)).replace('.', ',')} × ${String(r1(h / 10)).replace('.', ',')} cm`; }; after();
                    d.querySelector('[name=ly_pages]').addEventListener('focus', () => { d.querySelector('[name=ly_to][value=some]').checked = true; });
                },
                onSubmit: f => {
                    const box = F.bindBox(f.querySelector('[data-fmt-box]')), v = box.get(), [w0, h0] = F.inMm(v), W = r1(w0), H = r1(h0);
                    if (W < 30 || H < 30 || W > 1500 || H > 1500) return window.LCNDA_UI?.fail ? window.LCNDA_UI.fail(f.querySelector('[data-fmt-w]'), 'Choisis une page entre 3 cm et 1,5 m de côté.') : false;
                    const to = f.querySelector('[name=ly_to]:checked').value, list = to === 'all' ? D.pages.map((_, i) => i) : to === 'cur' ? [cur] : pagesOfText(f.ly_pages.value, D.pages.length + st0 - 1).map(k => k - (st0 - 1)).filter(k => k >= 0 && k < D.pages.length);
                    if (!list.length) return window.LCNDA_UI?.fail ? window.LCNDA_UI.fail(f.ly_pages, `Écris les numéros des pages, par exemple « ${st0 + 1}-${st0 + 3}, ${st0 + 5} ».`) : false;
                    const scale = f.querySelector('[name=ly_objs]:checked').value === 'scale';
                    const fit = (items, ow, oh) => { const k = Math.min(W / ow, H / oh), dx = (W - ow * k) / 2, dy = (H - oh * k) / 2; items.forEach(it => { it.x = r1(it.x * k + dx); it.y = r1(it.y * k + dy); it.w = r1(it.w * k); it.h = r1(it.h * k); }); };
                    if (to === 'all') {
                        D.pages.forEach((pg, i) => { const o = pageSize(D, i); if (scale && (o.w !== W || o.h !== H)) fit(pg.items, o.w, o.h); delete pg.size; });
                        if (scale && (P.w !== W || P.h !== H)) D.masters.forEach(m => fit(m.items, P.w, P.h));
                        P.w = W; P.h = H; P.fmt = v.id;
                    } else list.forEach(i => { const pg = D.pages[i], o = pageSize(D, i); if (scale && (o.w !== W || o.h !== H)) fit(pg.items, o.w, o.h); if (W === P.w && H === P.h) delete pg.size; else pg.size = {w: W, h: H}; });
                    P.unit = v.unit; P.facing = f.ly_facing.checked;
                    P.margin = {t: clamp(Number(f.ly_mt.value), 0, 300), b: clamp(Number(f.ly_mb.value), 0, 300), i: clamp(Number(f.ly_mi.value), 0, 300), o: clamp(Number(f.ly_mo.value), 0, 300)};
                    P.columns = clamp(Math.round(Number(f.ly_cols.value) || 1), 1, 12); P.gutter = clamp(Number(f.ly_gut.value), 0, 60); P.bleed = clamp(Number(f.ly_bleed.value), 0, 30);
                    const used = F.use('mise-en-page', v);
                    commit(`Format du document : ${F.label(used || v)}${to === 'all' ? '' : ` (${A().plural(list.length, 'page')})`}`); render(); zoomFit();
                }});
            return dlg0;
        }
        /** ℹ️ Fichier → Informations du document : titre, auteur, sujet, mots-clés, langue, ISBN (dans le PDF et l'ePub exportés) */
        async function docInfoDialog() {
            const F = window.LCNDA_FORMATS; if (!F) return;
            if (editingId) stopEditing();
            const v = await F.openInfoDialog({value: {title: D.title || docName, lang: 'fr', ...(D.info || {})}, keys: ['title', 'author', 'subject', 'desc', 'keywords', 'lang', 'isbn'], what: 'Ces informations vont dans le PDF (titre du fichier, auteur, sujet, mots-clés) et dans l’ePub exportés (la description aussi).'});
            if (!v) return;
            D.info = v; if (!Object.keys(v).length) delete D.info; if (v.title) D.title = v.title;
            commit('Informations du document'); render();
        }
        /** Mettre, enlever ou remplacer un gabarit sur plusieurs pages */
        function mastersDialog() {
            const st0 = D.page.start || 1, here = D.pages[cur]?.master || '';
            const opts = (v, none) => `<option value="">${none}</option>${D.masters.map(m => `<option value="${esc(m.id)}" ${m.id === v ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}`;
            ext.openDialog({eyebrow: 'GABARITS', title: 'Gabarit de plusieurs pages', submitLabel: 'Appliquer',
                body: `<div class="form-grid"><label class="span-2">Mettre le gabarit <select name="to">${opts(D.masters[0]?.id || '', 'Aucun (enlever le gabarit)')}</select></label>
                    <label class="span-2">Sur <select name="which"><option value="here">la page ${cur + st0} seulement</option><option value="all">toutes les pages</option><option value="range">les pages de … à …</option><option value="uses">les pages qui ont le gabarit… (remplacer)</option>${D.page.facing ? '<option value="left">les pages de gauche</option><option value="right">les pages de droite</option>' : ''}</select></label>
                    <label data-w="range">De la page <input type="number" name="a" min="${st0}" max="${D.pages.length + st0 - 1}" value="${cur + st0}"></label><label data-w="range">à la page <input type="number" name="b" min="${st0}" max="${D.pages.length + st0 - 1}" value="${D.pages.length + st0 - 1}"></label>
                    <label class="span-2" data-w="uses">Gabarit à remplacer <select name="from">${opts(here, 'les pages sans gabarit')}</select></label></div>`,
                onOpen: dg => { const sync = () => { const w = dg.querySelector('[name=which]').value; dg.querySelectorAll('[data-w]').forEach(x => { x.style.display = x.dataset.w === w ? '' : 'none'; }); }; dg.querySelector('[name=which]').addEventListener('change', sync); sync(); },
                onSubmit: f => {
                    const to = f.to.value, w = f.which.value, a = clamp(Number(f.a.value) - st0, 0, D.pages.length - 1), b = clamp(Number(f.b.value) - st0, 0, D.pages.length - 1), from = f.from.value;
                    let k = 0;
                    D.pages.forEach((p, i) => {
                        const ok = w === 'here' ? i === cur : w === 'all' ? true : w === 'range' ? i >= Math.min(a, b) && i <= Math.max(a, b) : w === 'uses' ? (p.master || '') === from : w === 'left' ? isLeftPage(D, i) : w === 'right' ? !isLeftPage(D, i) : false;
                        if (ok && (p.master || '') !== to) { p.master = to; k++; }
                    });
                    const m = D.masters.find(x => x.id === to);
                    if (!k) { msg('Rien à changer : ces pages ont déjà ce gabarit.'); return; }
                    const what = m ? `Gabarit « ${m.name} » sur ${k} page${k > 1 ? 's' : ''}` : `Gabarit enlevé de ${k} page${k > 1 ? 's' : ''}`; commit(what); render(); msg(what + '.'); // (commit vide « act » : le message garde son texte)
                }});
        }
        async function gotoDialog() { const v = await ask(`Aller à la page (1 à ${D.pages.length}) :`, String(cur + 1)); if (v) goPage(Number(v) - 1); }
        async function delPage() { if (D.pages.length < 2) return msg('Il faut garder au moins une page.'); const n = cur + 1; D.pages.splice(cur, 1); cur = Math.min(cur, D.pages.length - 1); sel = []; commit(`Page ${n} supprimée`); render(); undoable(`Page ${n} supprimée`); }
        function dupPage() { const p = JSON.parse(JSON.stringify(D.pages[cur])); p.id = nid('p'); const orig = D.pages[cur].items; p.items.forEach(it => { it.id = nid('c'); }); relink(orig, p.items); D.pages.splice(cur + 1, 0, p); commit(); goPage(cur + 1); }
        function lockToggle() { const its = selected(); if (!its.length) return; const v = !its.every(x => x.locked); its.forEach(x => { x.locked = v; }); commit(); render(); }
        function fitFrame() { const it = one(); if (!it) return; if (it.type === 'text') { const el = board.querySelector(`.ly-item[data-id="${CSS.escape(it.id)}"] .ly-txt`); if (el) { it.h = r1(el.scrollHeight / MM + (it.inset || 0) * 2 + 0.5); commit(); render(); } return; } if (it.src) { const im = new Image(); im.onload = () => { it.h = r1(it.w * im.naturalHeight / im.naturalWidth); it.imgS = 100; it.imgX = 0; it.imgY = 0; commit(); render(); }; im.src = it.src; } }
        async function placeImage(target = null) {
            const res = await pickImage(); if (!res) return;
            await placeSrc(res, target && (target.type === 'frame') ? target : one()?.type === 'frame' ? one() : null); commit(); render();
        }
        /** Une image dans un cadre (celui donné, sinon un nouveau dans les marges, décalé de k fois 8 mm) */
        async function placeSrc(res, target = null, k = 0) {
            let it = target;
            if (!it) { const b = box(D, cur); const im = await new Promise(r => { const x = new Image(); x.onload = () => r(x); x.onerror = () => r(null); x.src = res.src; }); const ratio = im ? im.naturalHeight / im.naturalWidth : 0.75, w = Math.min(b.w, 100); it = shapeItem('frame', {x: r1(b.x + k * 8), y: r1(b.y + k * 8), w, h: r1(w * ratio), layer: activeLayer(), fit: 'fill'}); curList().push(it); }
            it.src = res.src; it.srcName = res.name; if (res.mediaId) it.mediaId = res.mediaId; else delete it.mediaId; delete it.tree; it.fill = it.fill === 'sw-light' ? 'none' : it.fill; sel = [it.id]; return it;
        }
        /* ─── Texte chaîné : un texte qui continue d'un bloc à l'autre, sur plusieurs pages ─── */
        let linkFrom = null;
        const allText = () => D.pages.flatMap(p => p.items.filter(it => it.type === 'text'));
        const pageOfItem = idv => D.pages.findIndex(p => p.items.some(x => x.id === idv));
        const chainHead = it => { let h = it; for (let g = 0; g < 2000; g++) { const prev = allText().find(x => x.next === h.id); if (!prev || prev === it) return h; h = prev; } return h; };
        const chainList = head => { const out = [], seen = new Set(); let c = head; while (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); c = c.next ? findItem(c.next)?.it : null; } return out; };
        async function setLink(from, to) {
            if (to === from) { render(); return msg('Choisis un autre bloc.'); }
            if (to.auto) { render(); return msg('Un sommaire ou un index ne peut pas recevoir la suite d’un texte.'); }
            if (allText().some(x => x.next === to.id)) { render(); return msg('Ce bloc reçoit déjà la suite d’un autre texte.'); }
            const head = chainHead(from);
            if (chainList(to).includes(from) || chainHead(to) === head) { render(); return msg('Ce chaînage ferait une boucle.'); }
            if (plainOf(to.html).trim() && !await A().confirmBox('Ce bloc contient déjà du texte : il sera ajouté à la fin du texte chaîné.', {title: 'Chaîner vers ce bloc ?', okLabel: 'Chaîner'})) { render(); return; }
            if (plainOf(to.html).trim()) head.html = (head.html || '') + to.html;
            to.html = '<p data-ps="ps-body"><br></p>'; from.next = to.id;
            commit('Blocs de texte chaînés'); render(); msg(`➜ Chaîné : la suite va dans le bloc de la page ${pageOfItem(to.id) + (D.page.start || 1)}.`);
        }
        /** Faire couler : tant que le dernier bloc déborde, une page de plus (même gabarit) avec un bloc dans ses marges, chaîné */
        async function autoflow() {
            const it0 = one(); if (it0?.type !== 'text') return msg('Choisis d’abord un bloc de texte.');
            let last = chainList(chainHead(it0)).at(-1), made = 0;
            msg('Je répartis le texte…'); await new Promise(r => setTimeout(r, 20));
            for (let k = 0; k < 300; k++) {
                const V = resolveDoc(D), pi = pageOfItem(last.id), vl = V.pages[pi]?.items.find(x => x.id === last.id); if (!vl) break;
                if (!measureOverflow(V, vl, V.pages[pi].items.filter(o => o !== vl))) break;
                const np = {id: nid('p'), master: D.pages[pi].master, items: []}; D.pages.splice(pi + 1, 0, np);
                const b = box(D, pi + 1), f = textItem({x: b.x, y: b.y, w: b.w, h: b.h, columns: last.columns || 1, gutter: last.gutter ?? 4, inset: last.inset || 0, layer: last.layer, name: 'Suite du texte'});
                np.items.push(f); const prev = last; last.next = f.id; last = f; made++;
                const V2 = resolveDoc(D), got = V2.pages[pi + 1]?.items.find(x => x.id === f.id)?.html || '';
                if (!plainOf(got).trim()) { delete prev.next; D.pages.splice(pi + 1, 1); made--; break; } // plus rien ne passe : on s'arrête
            }
            if (!made) return msg('Le texte tient déjà dans ses blocs.');
            commit(`Texte réparti sur ${made} nouvelle${made > 1 ? 's' : ''} page${made > 1 ? 's' : ''}`); render(); msg(`${made} page${made > 1 ? 's' : ''} ajoutée${made > 1 ? 's' : ''} : le texte continue de bloc en bloc.`);
        }
        /** Gabarit : numéro de page, titre courant, chapitre en cours, pied de page */
        function masterAdd(kind) {
            const m = D.masters.find(x => x.id === editMaster); if (!m) return msg('Ouvre d’abord un gabarit (Pages → Modifier).');
            const mm = D.page.margin, x = mm.o, w = D.page.w - mm.i - mm.o, top = Math.max(4, mm.t - 11), bottom = D.page.h - mm.b + 6;
            const html = {folio: '<p data-ps="ps-folio">{page}</p>', running: '<p data-ps="ps-running">{titre}</p>', chapter: '<p data-ps="ps-running">{chapitre}</p>', footer: '<p data-ps="ps-folio">{titre} — {page} / {pages}</p>'}[kind];
            const it = textItem({x, y: ['folio', 'footer'].includes(kind) ? bottom : top, w, h: 7, html, layer: activeLayer(), name: {folio: 'Folio', running: 'Titre courant', chapter: 'Chapitre courant', footer: 'Pied de page'}[kind]});
            m.items.push(it); sel = [it.id]; commit(`Gabarit : ${it.name}`); render();
        }
        /** Table des matières ou index des noms, qui se remplissent tout seuls */
        const AUTO_NAMES = {toc: 'Table des matières', index: 'Index des noms', places: 'Index des lieux', jobs: 'Index des métiers', notes: 'Notes du chapitre', biblio: 'Bibliographie'};
        async function insertAuto(kind) {
            if (editMaster) return msg('Pas dans un gabarit : sur une page.');
            if (editingId) stopEditing();
            const b = box(D, cur), it = textItem({x: b.x, y: b.y, w: b.w, h: b.h, layer: activeLayer(), name: AUTO_NAMES[kind], auto: kind,
                autoStyles: kind === 'toc' ? D.paraStyles.filter(s => ['ps-chapter'].includes(s.id)).map(s => s.id) : [], autoPs: kind === 'toc' ? 'ps-body' : 'ps-list', columns: ['index', 'places', 'jobs'].includes(kind) ? 2 : 1, gutter: 6});
            if (kind === 'notes' || kind === 'biblio') {
                if (kind === 'notes') { it.h = Math.min(b.h, 60); it.y = r1(b.y + b.h - it.h); if (D.fn?.place !== 'chapter' && await A().confirmBox('Les notes du chapitre se rangeront dans ce bloc au lieu du bas de chaque texte (Document → Notes de bas de page).', {title: 'Mettre les notes en fin de chapitre ?', okLabel: 'Oui, en fin de chapitre', cancelLabel: 'Non, garder en bas des blocs', danger: false})) D.fn = {place: 'chapter', restart: 'chapter'}; }
                curList().push(it); sel = [it.id]; panel = 'obj'; commit(AUTO_NAMES[kind]); render();
                return msg(kind === 'notes' ? '🗒 Les notes du chapitre se rangent ici toutes seules.' : '📚 La bibliographie se remplit avec les sources citées en note.');
            }
            if (kind === 'places' || kind === 'jobs') {
                const cs = kind === 'places' ? {id: 'cs-index-place', name: 'Lieu à indexer'} : {id: 'cs-index-job', name: 'Métier à indexer'};
                if (!D.charStyles.some(c => c.id === cs.id)) D.charStyles.push(cs);
                if (await A().confirmBox(`Sinon : seulement les mots marqués avec le style de caractère « ${cs.name} ».`, {title: kind === 'places' ? 'Chercher aussi les lieux de ta généalogie ?' : 'Chercher aussi les métiers de ta généalogie ?', okLabel: 'Oui, les chercher', cancelLabel: 'Non, seulement les mots marqués', danger: false})) {
                    try { const r = await api('layout_index_terms'); it.terms = (kind === 'places' ? r.places : r.jobs) || []; } catch (err) { toast(err.message, 'error'); }
                }
                curList().push(it); sel = [it.id]; panel = 'obj'; commit(AUTO_NAMES[kind]); render();
                return msg(`${AUTO_NAMES[kind]} : rangé de A à Z, avec les pages. S’il est long : Objet → Faire couler le texte.`);
            }
            if (kind === 'index') {
                if (!D.charStyles.some(c => c.id === 'cs-index')) D.charStyles.push({id: 'cs-index', name: 'Nom à indexer'});
                if (await A().confirmBox('Sinon : seulement les noms marqués avec le style de caractère « Nom à indexer ».', {title: 'Chercher aussi les noms des personnes de la généalogie ?', okLabel: 'Oui, chercher les noms', cancelLabel: 'Non, seulement les noms marqués', danger: false})) {
                    try { const r = await api('person_names'); it.names = (r.persons || []).map(p => `${p.first_name || ''}|${p.last_name || ''}`); } catch (err) { toast(err.message, 'error'); }
                }
            }
            curList().push(it); sel = [it.id]; panel = 'obj'; commit(kind === 'toc' ? 'Table des matières' : 'Index des noms'); render();
            msg(kind === 'toc' ? 'Sommaire : il suit les paragraphes en style « Chapitre » (d’autres styles dans Objet). S’il est long : Objet → Faire couler le texte.' : 'Index : rangé par nom, avec les pages. S’il est long : Objet → Faire couler le texte.');
        }
        /* ─── Objets dynamiques : photos de l'app (liées) et textes de fiches ─── */
        let linkState = {}, mediaRows = null;
        async function refreshLinks(silent = true) {
            if (editingId) { if (!silent) msg('Termine d’abord le texte en cours (Échap), puis recommence.'); return; }
            const frames = [...D.pages.flatMap(p => p.items), ...D.masters.flatMap(m => m.items)].filter(it => it.type === 'frame' && (it.mediaId || /^media\//.test(it.src || '')));
            const dyn = [...D.pages.flatMap(p => p.items), ...D.masters.flatMap(m => m.items)].filter(it => it.dyn);
            const dgs = [...D.pages.flatMap(p => p.items), ...D.masters.flatMap(m => m.items)].filter(it => it.type === 'frame' && it.diagramId);
            const trees = [...D.pages.flatMap(p => p.items), ...D.masters.flatMap(m => m.items)].filter(it => it.type === 'frame' && it.tree);
            if (!frames.length && !dyn.length && !dgs.length && !trees.length) { if (!silent) msg('Aucun objet dynamique dans ce document (photos liées, textes de fiches, diagrammes, arbres).'); return; }
            let changed = 0;
            if (frames.length) {
                try { mediaRows = (await api('media_av_list', {kind: 'image'})).items || []; } catch (_) { mediaRows = mediaRows || []; }
                const byId = new Map(mediaRows.map(r => [Number(r.id), r])), byFile = new Map(mediaRows.map(r => [r.filename, r]));
                frames.forEach(it => {
                    if (!it.mediaId) { const r0 = byFile.get(String(it.src).replace(/^media\//, '')); if (r0) { it.mediaId = Number(r0.id); changed++; } }
                    const r = byId.get(Number(it.mediaId)); if (!r || r.exists === false) { linkState[it.id] = 'missing'; return; }
                    const want = `media/${r.filename}`; if (it.src !== want) { it.src = want; it.srcName = r.title || r.filename; linkState[it.id] = 'updated'; changed++; } else linkState[it.id] = linkState[it.id] === 'updated' ? 'updated' : 'ok';
                });
            }
            for (const it of dyn) { try { const h = await dynHtmlOf(it.dyn); if (h !== it.html) { it.html = h; changed++; linkState[it.id] = 'updated'; } else linkState[it.id] = 'ok'; it.dyn.at = new Date().toISOString().slice(0, 16); } catch (_) { linkState[it.id] = 'missing'; } }
            for (const it of trees) { try { const r = await treeSvg(it.tree, lookOf()), src = svgSrc(r.svg); if (src !== it.src) { it.src = src; it.srcName = r.name; it.tree.at = new Date().toISOString().slice(0, 16); changed++; linkState[it.id] = 'updated'; } else linkState[it.id] = linkState[it.id] === 'updated' ? 'updated' : 'ok'; } catch (_) { linkState[it.id] = 'missing'; } }
            for (const it of dgs) { try { const svg = ext.diagramSvg ? await ext.diagramSvg(it.diagramId) : ''; if (!svg) { linkState[it.id] = 'missing'; continue; } const src = svgSrc(svg); if (src !== it.src) { it.src = src; changed++; linkState[it.id] = 'updated'; } else linkState[it.id] = linkState[it.id] === 'updated' ? 'updated' : 'ok'; } catch (_) { linkState[it.id] = 'missing'; } }
            if (changed) { commit('Objets dynamiques mis à jour'); render(); }
            const miss = Object.values(linkState).filter(v => v === 'missing').length;
            if (!silent || changed || miss) msg(`↻ Objets dynamiques : ${changed ? `${changed} mis à jour` : 'tout est à jour'}${miss ? `, ${miss} introuvable${miss > 1 ? 's' : ''}` : ''}.`);
            if (panel === 'links') renderPanel();
        }
        /** ✎ Modifier l'original : la photo s'ouvre dans la retouche ; à la fermeture, le cadre se met à jour */
        async function editOriginal(it) {
            if (!it?.mediaId) return msg('Cette image n’est pas liée à une photo de l’app.');
            if (!mediaRows) { try { mediaRows = (await api('media_av_list', {kind: 'image'})).items || []; } catch (_) { mediaRows = []; } }
            const r = mediaRows.find(x => Number(x.id) === Number(it.mediaId)); if (!r || !ext.openRetouch) return msg('Photo introuvable dans l’app.');
            const before = new Set(document.querySelectorAll('dialog')), lb0 = A().state.lightboxMedia, li0 = A().state.lightboxIndex;
            A().state.lightboxMedia = [{...r, media_type: 'image'}]; A().state.lightboxIndex = 0;
            try { await ext.openRetouch(); } finally { A().state.lightboxMedia = lb0; A().state.lightboxIndex = li0; }
            let seen = false, n = 0; const t = setInterval(() => { n++; const fresh = [...document.querySelectorAll('dialog')].filter(d => !before.has(d)); if (fresh.length) seen = true; else if (seen || !dl.isConnected || n > 10) { clearInterval(t); if (dl.isConnected && seen) refreshLinks(false); } }, 600);
        }
        /** 📊 un de « Mes diagrammes », en image nette (SVG) qui suit le diagramme : « Mettre à jour les liens » le redessine */
        const svgSrc = svg => 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
        async function insertDiagram() {
            if (!ext.pickDiagram) return msg('Diagrammes indisponibles.');
            const id = await ext.pickDiagram({title: 'Insérer un diagramme'}); if (!id) return;
            const svg = await ext.diagramSvg(id); if (!svg) return msg('Diagramme introuvable.');
            const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/), ratio = m ? Number(m[2]) / Number(m[1]) : .6;
            const b = box(D, cur), w = Math.min(b.w, 140), it = shapeItem('frame', {x: b.x, y: b.y, w, h: r1(w * ratio), layer: activeLayer(), fit: 'fit'});
            Object.assign(it, {src: svgSrc(svg), srcName: 'Diagramme', diagramId: id, fill: 'none', name: 'Diagramme'}); curList().push(it); sel = [it.id];
            commit('Diagramme inséré'); render();
        }
        /** le texte d'un objet dynamique : fiche, notice d'œuvre (🎨) ou encadré météo (🌦) */
        const dynHtmlOf = d => (d.type === 'art' ? ext.artistCatalogue.noticeHtml(d) : d.type === 'meteo' ? ext.meteo.noticeHtml(d) : personDynHtml(d.id, d.fields));
        /** 🌦 Encadré météo (heritage-meteo.js) : le temps qu'il faisait le jour d'un événement (icône, phrase, source) — objet dynamique */
        function meteoDialog(it = null) {
            if (!ext.meteo?.noticeHtml) return msg('La météo d’autrefois n’est pas prête.');
            let chosen = it?.dyn?.type === 'meteo' ? Number(it.dyn.id) : 0;
            ext.openDialog({eyebrow: 'OBJET DYNAMIQUE', title: it ? 'Encadré météo' : 'Insérer un encadré météo', submitLabel: it ? 'Mettre à jour' : 'Insérer',
                body: `<p class="muted">L’encadré dit le temps qu’il faisait le jour de l’événement (icône, phrase et source, qui suit à l’export). « ↻ Mettre à jour les objets dynamiques » le refait.</p>
                    <div><span class="pk-lab">Événement</span>${(window.LCNDA_PICKER || A()).pickerField({name: 'ly_wx', kind: 'event', value: chosen || null})}</div>`,
                onOpen: dg => { if (!chosen) setTimeout(() => dg.querySelector('.pk-input')?.focus(), 30); },
                onSubmit: async f => { chosen = Number(f.elements.ly_wx?.value) || 0;
                    if (!chosen) return window.LCNDA_UI.fail(f.elements.ly_wx, 'Choisis un événement.');
                    const dyn = {type: 'meteo', id: chosen, at: new Date().toISOString().slice(0, 16)}, html = await ext.meteo.noticeHtml(dyn);
                    if (it) { it.dyn = dyn; it.html = html; }
                    else { const b = box(D, cur); const n = textItem({x: b.x, y: b.y, w: Math.min(b.w, 62), h: 34, html, layer: activeLayer(), name: 'Encadré météo', dyn}); curList().push(n); sel = [n.id]; }
                    commit('Encadré météo'); render();
                }});
        }
        function dynPersonDialog(it = null) {
            const f0 = it?.dyn?.fields || ['name', 'life', 'parents', 'partners'];
            let chosen = it?.dyn?.id || 0;
            ext.openDialog({eyebrow: 'OBJET DYNAMIQUE', title: it ? 'Texte lié à une fiche' : 'Insérer le texte d’une fiche', submitLabel: it ? 'Mettre à jour' : 'Insérer',
                body: `<p class="muted">Le texte suit la fiche : si elle change dans la généalogie, « 🔗 Mettre à jour les liens » (ou la réouverture du document) le refait.</p>
                    <div><span class="pk-lab">Personne</span>${(window.LCNDA_PICKER || A()).pickerField({name: 'ly_dyn', kind: 'person', value: chosen || null})}</div>
                    <fieldset><legend>Ce qu’il faut montrer</legend>${DYN_FIELDS.map(([k, l]) => `<label class="checkbox-line"><input type="checkbox" name="f_${k}" ${f0.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</fieldset>`,
                onOpen: dg => { if (!chosen) setTimeout(() => dg.querySelector('.pk-input')?.focus(), 30); }, // la fiche déjà liée est relue par le menu
                onSubmit: async f => { chosen = Number(f.elements.ly_dyn?.value) || 0;
                    if (!chosen) return window.LCNDA_UI.fail(f.elements.ly_dyn, 'Choisis une personne.');
                    const fields = DYN_FIELDS.map(([k]) => k).filter(k => f.elements['f_' + k]?.checked); if (!fields.length) return window.LCNDA_UI.fail(f.elements['f_' + DYN_FIELDS[0][0]], 'Coche au moins une chose à montrer.');
                    const html = await personDynHtml(chosen, fields);
                    if (it) { it.dyn = {type: 'person', id: chosen, fields, at: new Date().toISOString().slice(0, 16)}; it.html = html; }
                    else { const b = box(D, cur); const n = textItem({x: b.x, y: b.y, w: Math.min(b.w, 90), h: 50, html, layer: activeLayer(), name: 'Texte lié à une fiche', dyn: {type: 'person', id: chosen, fields, at: new Date().toISOString().slice(0, 16)}}); curList().push(n); sel = [n.id]; }
                    commit('Texte lié à une fiche'); render();
                }});
        }
        /* ─── ▦ QR code : vers une fiche (ses fiches en ligne, FamilySearch, ou son identité en texte), une adresse web, un texte ─── */
        function qrDialog(it = null) {
            if (!ext.qr) return msg('Le générateur de QR codes n’est pas encore prêt.');
            const q0 = it?.qr || {kind: 'person', text: '', person: 0, dark: '#000000', light: '#ffffff', quiet: 4};
            let choices = [], loadedFor = 0;
            const P = window.LCNDA_PICKER || A();
            ext.openDialog({eyebrow: 'QR CODE', title: it ? '▦ Modifier le QR code' : '▦ Insérer un QR code', submitLabel: it ? 'Mettre à jour' : 'Insérer', wide: true,
                body: `<div class="ly-qrdlg"><div class="ly-qrform">
                    <fieldset><legend>Ce que le QR code ouvre</legend>${[['person', '👤 Une fiche de la généalogie'], ['url', '🌐 Une adresse web'], ['text', '🔤 Un texte']].map(([k, l]) => `<label class="checkbox-line"><input type="radio" name="qkind" value="${k}" ${q0.kind === k ? 'checked' : ''}> ${l}</label>`).join('')}</fieldset>
                    <div data-q="person"><span class="pk-lab">Personne</span>${P.pickerField({name: 'ly_qrp', kind: 'person', value: q0.person || null})}
                        <label>Le contenu <select name="qchoice"><option value="">(choisis d’abord la personne)</option></select></label>
                        <p class="muted">Les fiches de l’app restent sur cet ordinateur : le QR code mène aux fiches en ligne de la personne (Geneanet, Filae…, notées dans sa fiche) ou à FamilySearch ; sinon, il contient son identité en texte (lisible par n’importe quel téléphone).</p></div>
                    <label data-q="url">Adresse <input name="qurl" type="url" placeholder="https://…" value="${esc(q0.kind === 'url' ? q0.text : '')}"></label>
                    <label data-q="text">Texte <textarea name="qtext" rows="3" maxlength="600">${esc(q0.kind === 'text' ? q0.text : '')}</textarea></label>
                    <div class="form-grid"><label>Couleur <input type="color" name="qdark" value="${esc(q0.dark)}"></label><label>Fond <input type="color" name="qlight" value="${esc(q0.light === 'none' ? '#ffffff' : q0.light)}"></label>
                        <label class="checkbox-line"><input type="checkbox" name="qnobg" ${q0.light === 'none' ? 'checked' : ''}> fond transparent</label>
                        <label><span data-help="La marge claire autour du code : 4 modules d’après la norme, pour que les téléphones le lisent bien.">Marge (modules)</span> <input type="number" name="qquiet" min="0" max="10" value="${q0.quiet}"></label>
                        ${it ? '' : '<label>Taille<input data-unit="mm" type="number" name="qsize" min="10" max="200" value="30"></label>'}</div></div>
                    <figure class="ly-qrprev"><div data-qprev></div><figcaption data-qinfo class="muted"></figcaption></figure></div>`,
                onOpen: dg => {
                    const f = dg.querySelector('form') || dg, kind = () => dg.querySelector('[name=qkind]:checked')?.value || 'text';
                    const sync = () => { dg.querySelectorAll('[data-q]').forEach(el => { el.hidden = el.dataset.q !== kind(); }); prev(); };
                    const content = () => kind() === 'url' ? String(dg.querySelector('[name=qurl]').value).trim() : kind() === 'text' ? String(dg.querySelector('[name=qtext]').value).trim() : dg.querySelector('[name=qchoice]').value;
                    const prev = () => { const t = content(), box0 = dg.querySelector('[data-qprev]'), info = dg.querySelector('[data-qinfo]'); if (!t) { box0.innerHTML = ''; info.textContent = 'Rien à coder pour l’instant.'; return; }
                        try { const r = ext.qr.svg(t, {dark: dg.querySelector('[name=qdark]').value, light: dg.querySelector('[name=qnobg]').checked ? 'none' : dg.querySelector('[name=qlight]').value, quiet: Number(dg.querySelector('[name=qquiet]').value)}); box0.innerHTML = r.svg; info.textContent = `${new TextEncoder().encode(t).length} octets · version ${r.version} (${r.size} × ${r.size} modules) · correction d’erreurs M`; }
                        catch (err) { box0.innerHTML = ''; info.textContent = '⚠️ ' + err.message; } };
                    const load = async id => { id = Number(id) || 0; if (!id || id === loadedFor) return; loadedFor = id; const sel0 = dg.querySelector('[name=qchoice]'); sel0.innerHTML = '<option value="">Chargement…</option>';
                        try { choices = await personQrChoices(id); } catch (err) { choices = []; toast(err.message, 'error'); }
                        sel0.innerHTML = choices.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(''); if (q0.kind === 'person' && q0.text && choices.some(c => c[0] === q0.text)) sel0.value = q0.text; prev(); };
                    dg._qrContent = content; dg._qrLoad = load;
                    dg.addEventListener('cp-pick', e => { if (e.detail?.field === 'ly_qrp') load(e.detail.id); });
                    dg.addEventListener('input', prev); dg.addEventListener('change', e => { if (e.target.name === 'qkind') sync(); else prev(); });
                    sync(); if (q0.person) load(q0.person); void f;
                },
                onSubmit: async f => {
                    const dg = f.closest('dialog'), kind = f.elements.qkind.value || 'text';
                    if (kind === 'person') await dg._qrLoad?.(f.elements.ly_qrp?.value);
                    const text = dg._qrContent?.() || '';
                    if (!text) { toast(kind === 'person' ? 'Choisis la personne (et ce que le QR code contient).' : 'Écris ce que le QR code doit contenir.', 'error'); return false; }
                    const cfg = {kind, text: text.slice(0, 600), person: kind === 'person' ? Number(f.elements.ly_qrp?.value) || 0 : 0, dark: f.elements.qdark.value, light: f.elements.qnobg.checked ? 'none' : f.elements.qlight.value, quiet: clamp(f.elements.qquiet.value, 0, 10)};
                    let src; try { src = qrSrc(cfg); } catch (err) { toast(err.message, 'error'); return false; }
                    if (it) { it.qr = cfg; it.src = src; it.srcName = 'QR code'; }
                    else { const size = clamp(f.elements.qsize?.value || 30, 10, 200), b = box(D, cur); const n = shapeItem('frame', {x: r1(b.x + b.w - size), y: b.y, w: size, h: size, src, srcName: 'QR code', fit: 'fit', fill: 'none', stroke: {c: 'none', w: 0}, lockRatio: true, layer: activeLayer(), name: 'QR code', qr: cfg}); curList().push(n); sel = [n.id]; }
                    commit(it ? 'QR code modifié' : 'QR code inséré'); render(); msg('▦ QR code : tire un coin pour la taille (il reste carré) ; double-clic pour le modifier.');
                }});
        }
        async function personQrChoices(id) {
            const r = await api('person', {id}), p = r.person || {}, nm = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Fiche';
            const ev = r.events || [], find = re => ev.find(e => re.test(String(e.type_label || e.type || e.event_type || ''))), when = e => String(e?.date_text || e?.year || '');
            const b = find(/naiss|birth|bapt/i), d = find(/décè|deces|death|inhum|sépult/i);
            const life = [b && `° ${[when(b), b.place_name || b.place].filter(Boolean).join(' ')}`, d && `† ${[when(d), d.place_name || d.place].filter(Boolean).join(' ')}`].filter(Boolean).join(' ');
            const ident = [nm, life, p.reference_number ? `réf. ${p.reference_number}` : ''].filter(Boolean).join(' — ');
            const out = (r.onlineSheets || []).filter(s => /^https?:\/\//i.test(String(s.url || ''))).map(s => [s.url, `🌐 ${s.label || s.site || 'Fiche en ligne'} — ${s.url}`]);
            if (p.familysearch_id) out.push([`https://www.familysearch.org/tree/person/details/${encodeURIComponent(p.familysearch_id)}`, `🌳 FamilySearch (${p.familysearch_id})`]);
            out.push([ident, `🪪 Son identité en texte : « ${ident} »`]);
            return out;
        }
        /* ─── 📨 Publipostage : une page modèle (ou un gabarit) avec des champs {prénom}, {nom}…, une page par personne ─── */
        function mergeSample() {
            const b = box(D, cur), pg = {id: nid('p'), master: D.pages[cur]?.master || 'A', items: []}, fw = Math.min(55, b.w * 0.4);
            pg.items.push(textItem({x: b.x, y: b.y, w: b.w, h: 24, html: '<p data-ps="ps-name">{prénom} {nom}</p><p data-ps="ps-dates">{dates} · Sosa {sosa}</p>', name: 'Nom', layer: activeLayer()}));
            pg.items.push(shapeItem('frame', {x: b.x, y: b.y + 28, w: fw, h: fw * 1.25, fit: 'fill', fill: 'sw-light', stroke: {c: 'sw-accent', w: 0.5}, name: '{portrait}', layer: activeLayer()}));
            pg.items.push(textItem({x: b.x + fw + 6, y: b.y + 28, w: b.w - fw - 6, h: fw * 1.25, html: '<p data-ps="ps-head">Naissance</p><p data-ps="ps-body">{naissance}, {lieu de naissance}</p><p data-ps="ps-head">Décès</p><p data-ps="ps-body">{décès}, {lieu de décès}</p><p data-ps="ps-head">Métier</p><p data-ps="ps-body">{métier}</p><p data-ps="ps-head">Famille</p><p data-ps="ps-body">Parents : {parents}</p><p data-ps="ps-body">Conjoint : {conjoints}</p>', name: 'Repères', layer: activeLayer()}));
            pg.items.push(textItem({x: b.x, y: b.y + 34 + fw * 1.25, w: b.w, h: b.h - 34 - fw * 1.25, html: '<p data-ps="ps-body">{biographie}</p>', name: 'Biographie', layer: activeLayer()}));
            D.pages.splice(cur + 1, 0, pg); commit('Page modèle de publipostage'); goPage(cur + 1);
            msg('📨 Page modèle posée : change la mise en forme à ton goût, puis Page → « Publipostage ».');
        }
        function mergeDialog() {
            const sources = [...D.pages.map((p, i) => [`p:${i}`, `Page ${i + (D.page.start || 1)}${i === cur ? ' (celle-ci)' : ''}`, p.items]), ...D.masters.map(m => [`m:${m.id}`, `Gabarit « ${m.name} »`, m.items])];
            const P = window.LCNDA_PICKER || A(), start = A().state.bootstrap?.startPersonId;
            let data = null, dataKey = '', labels = [];
            ext.openDialog({eyebrow: 'PUBLIPOSTAGE', title: '📨 Une page par personne', submitLabel: 'Créer les pages', wide: true,
                body: `<p class="muted">La page modèle contient des champs entre accolades, remplacés pour chaque personne : ${MERGE_FIELDS.map(([k]) => `<code>{${esc(k)}}</code>`).join(' ')}. Un cadre d’image nommé <code>{portrait}</code> (onglet Objet → Nom) reçoit son portrait.</p>
                    <div class="form-grid"><label>Page modèle <select name="msrc">${sources.map(([v, l]) => `<option value="${v}" ${v === `p:${cur}` ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><p class="muted span-2" data-mfound></p>
                    <label>Les personnes <select name="mscope"><option value="ancestors">les ancêtres de…</option><option value="descendants">les descendants de…</option><option value="both">ancêtres et descendants de…</option><option value="list">une liste de fiches</option><option value="label">les fiches d’une étiquette</option><option value="all">toute la base</option></select></label>
                    <div data-mw="root"><span class="pk-lab">Personne de départ</span>${P.pickerField({name: 'mroot', kind: 'person', value: start || null})}</div>
                    <label data-mw="gens">Générations <input type="number" name="mgens" min="1" max="30" value="4"></label>
                    <div data-mw="list" class="span-2"><span class="pk-lab">Les fiches</span>${P.pickerField({name: 'mlist', kind: 'person', multiple: true})}</div>
                    <label data-mw="label">Étiquette <select name="mlabel"><option value="">Chargement…</option></select></label>
                    <label>Ordre <select name="morder"><option value="book">celui de l’arbre (Sosa, d’Aboville)</option><option value="generation">par génération</option><option value="birth">par naissance</option><option value="name">par nom</option></select></label>
                    <label>Où <select name="mwhere"><option value="after">après la page modèle</option><option value="end">à la fin du document</option></select></label>
                    <label class="checkbox-line"><input type="checkbox" name="mdrop"> retirer la page modèle ensuite</label></div>
                    <p class="ly-mcount" data-mcount>…</p>`,
                onOpen: dg => {
                    const v = n => dg.querySelector(`[name=${n}]`)?.value || '';
                    const showFound = () => { const s = sources.find(x => x[0] === v('msrc')), r = mergeScan(s?.[2] || []); dg.querySelector('[data-mfound]').innerHTML = r.keys.length || r.portrait ? `Champs trouvés : ${r.keys.map(k => `<code>{${esc(k)}}</code>`).join(' ')}${r.portrait ? ' · cadre {portrait}' : ''}` : '⚠️ Aucun champ sur cette page : Page → « Page modèle de publipostage » en pose une toute prête.'; };
                    const showWho = () => { const sc = v('mscope'); dg.querySelector('[data-mw=root]').hidden = !['ancestors', 'descendants', 'both'].includes(sc); dg.querySelector('[data-mw=gens]').hidden = !['ancestors', 'descendants', 'both'].includes(sc); dg.querySelector('[data-mw=list]').hidden = sc !== 'list'; dg.querySelector('[data-mw=label]').hidden = sc !== 'label'; };
                    let tm = 0;
                    const count = () => { clearTimeout(tm); tm = setTimeout(async () => { const el = dg.querySelector('[data-mcount]'); try { const d = await mergeData(dg); el.textContent = d ? `→ ${A().plural(d.persons.length, 'page sera créée', 'pages seront créées')}${d.persons.length > MERGE_MAX ? ` (seulement les ${MERGE_MAX} premières)` : ''}.` : 'Choisis les personnes.'; el.dataset.n = String(d ? Math.min(MERGE_MAX, d.persons.length) : 0); } catch (err) { el.textContent = '⚠️ ' + err.message; } }, 250); };
                    dg._mergeData = () => mergeData(dg);
                    dg.addEventListener('change', e => { if (e.target.name === 'msrc') showFound(); if (e.target.name === 'mscope') showWho(); count(); });
                    dg.addEventListener('input', e => { if (e.target.name === 'mgens') count(); });
                    dg.addEventListener('cp-pick', count); dg.addEventListener('cp-change', count);
                    new MutationObserver(count).observe(dg.querySelector('[data-mw=list]'), {subtree: true, childList: true});
                    api('labels').then(r => { labels = r.labels || []; dg.querySelector('[name=mlabel]').innerHTML = labels.length ? labels.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('') : '<option value="">(aucune étiquette)</option>'; }).catch(() => {});
                    showFound(); showWho(); count();
                },
                onSubmit: async f => {
                    const dg = f.closest('dialog'); let d; try { d = await dg._mergeData(); } catch (err) { toast(err.message, 'error'); return false; }
                    if (!d?.persons?.length) { toast('Aucune personne dans ce choix.', 'error'); return false; }
                    const sv = f.elements.msrc.value, s = sources.find(x => x[0] === sv); if (!s) return false;
                    const fromMaster = sv.startsWith('m:'), srcPage = fromMaster ? null : D.pages[Number(sv.slice(2))];
                    const people = d.persons.slice(0, MERGE_MAX);
                    const pages = people.map(p => ({id: nid('p'), master: fromMaster ? '' : (srcPage.master || ''), items: mergeFill(s[2], p)}));
                    let at = f.elements.mwhere.value === 'end' || fromMaster ? D.pages.length : D.pages.indexOf(srcPage) + 1;
                    D.pages.splice(at, 0, ...pages);
                    if (f.elements.mdrop.checked && srcPage) { const k = D.pages.indexOf(srcPage); D.pages.splice(k, 1); if (k < at) at--; }
                    commit(`Publipostage : ${A().plural(pages.length, 'page')}`); goPage(at);
                    msg(`📨 ${A().plural(pages.length, 'page créée', 'pages créées')} (une par personne). ↶ pour tout défaire.`);
                    toast(`Publipostage : ${A().plural(pages.length, 'page créée', 'pages créées')}.`);
                }});
            async function mergeData(dg) {
                const v = n => dg.querySelector(`[name=${n}]`)?.value || '', sc = v('mscope');
                const q = {scope: ['ancestors', 'descendants', 'both'].includes(sc) ? sc : 'all', root_id: v('mroot'), generations: String(clamp(v('mgens'), 1, 30)), order: v('morder') || 'book', photo_count: '1', event_count: '0', sections: 'people', parts: 'bio,family,photos'};
                if (['ancestors', 'descendants', 'both'].includes(sc) && !Number(q.root_id)) return null;
                if (sc === 'list') { q.ids = v('mlist'); if (!q.ids) return null; }
                if (sc === 'label') { q.label_id = v('mlabel'); if (!Number(q.label_id)) return null; }
                const key = JSON.stringify(q); if (key === dataKey && data) return data;
                data = await api('layout_family_data', q); dataKey = key;
                if (sc === 'list') { const order = q.ids.split(',').map(Number); data.persons.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); }
                return data;
            }
        }
        /* ─── ¹ Notes de bas de page et 📚 citations : l'appel <sup data-fn> est numéroté tout seul (resolveDoc), le texte est dans D.notes ─── */
        const askBox = (title, message, value = '', okLabel = 'Valider') => A().askText({title, message, value, okLabel}).then(v => (v === null || v === undefined ? null : String(v)));
        function caretBlock() { const t = editEl(); if (!t) { msg('Double-clic dans un bloc de texte, place le curseur où va l’appel de note, puis recommence.'); return null; } return t; }
        function putNote(text, extra = {}) {
            const t = editEl(); if (!t) return;
            const r = restoreRange() || (() => { const rr = document.createRange(); rr.selectNodeContents(t.lastElementChild || t); rr.collapse(false); return rr; })();
            r.collapse(false);
            if (r.startContainer === t) { const prev = t.childNodes[r.startOffset - 1], next = t.childNodes[r.startOffset], blk = prev?.nodeType === 1 ? prev : next?.nodeType === 1 ? next : null; if (blk && /^(P|H\d|LI|UL|OL|DIV|BLOCKQUOTE)$/.test(blk.tagName)) { const inner = blk.matches('ul,ol') ? (blk === prev ? blk.lastElementChild : blk.firstElementChild) || blk : blk; r.selectNodeContents(inner); r.collapse(blk !== prev); } } // le curseur entre deux paragraphes : l'appel va à la fin du paragraphe d'avant (pas tout seul sur une ligne)
            const k = nid('n'); D.notes = D.notes || {}; D.notes[k] = {text: String(text).slice(0, 3000), ...extra};
            const sup = document.createElement('sup'); sup.setAttribute('data-fn', k); sup.textContent = String((board.querySelectorAll('sup[data-fn]').length || 0) + 1);
            r.insertNode(sup); const after = document.createRange(); after.setStartAfter(sup); after.collapse(true); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(after); savedRange = after;
            const f = findItem(editingId); if (f) f.it.html = readEditing(t); setDirty(); markOverflow();
            msg('¹ Note ajoutée : tous les numéros se remettent dans l’ordre quand tu sors du texte (Échap).');
        }
        async function insertNote() { if (!caretBlock()) return; const v = await askBox('¹ Note de bas de page', 'Texte de la note (il s’écrit en bas du bloc, ou en fin de chapitre) :', '', 'Ajouter la note'); if (v && v.trim()) putNote(v.trim()); }
        const folioTxt = v => { v = String(v || '').trim(); return /^\d+\s*[rv°]?$/i.test(v) ? `f° ${v.replace(/\s+/g, '')}` : v; };
        const citeText = (f, src) => [f.agency.value.trim() || (src?.title || ''), f.cote.value.trim() || (!f.agency.value.trim() ? '' : src?.title || ''), folioTxt(f.folio.value), f.date.value.trim(), f.extra.value.trim()].filter(Boolean).join(', ');
        const biblioLabel = (f, src) => `${[f.agency.value.trim(), src?.title || '', f.cote.value.trim() ? `cote ${f.cote.value.trim().replace(/^cote\s+/i, '')}` : ''].filter(Boolean).join(', ')}${src?.author ? ` — ${src.author}` : ''}.`;
        function citeDialog() {
            if (!caretBlock()) return;
            const P = window.LCNDA_PICKER || A(); let src = null;
            // ❝ F4 : le style de la note (heritage-citations.js, lib/citation_styles.php) ; « Comme les archives » = la forme courte d'avant
            const CS = ext.citations, STY = {archives: 'Comme les archives (« AD Corrèze, 3 E 123, f° 12 »)', ...(CS?.STYLES || {})};
            let style = 'archives'; try { const v = localStorage.getItem('lcnda-layout-cite-style') || (CS ? CS.preferred() : ''); if (STY[v]) style = v; } catch (_) {}
            let styled = null, pending = null, seq = 0, timer = 0;
            ext.openDialog({eyebrow: 'NOTE · SOURCE', title: '📚 Citer une source', submitLabel: 'Écrire la note',
                body: `<p class="muted">La référence s’écrit en note, à l’endroit du curseur, dans le style choisi ; la source entre dans la bibliographie (Objet → Insérer la bibliographie).</p>
                    <div><span class="pk-lab">Source</span>${P.pickerField({name: 'ly_src', kind: 'source'})}</div>
                    <div class="form-grid"><label class="span-2">Style <select name="style">${Object.entries(STY).map(([k, l]) => `<option value="${k}"${k === style ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                    <label>Dépôt (archives) <input name="agency" placeholder="AD Corrèze" maxlength="200"></label><label>Cote <input name="cote" placeholder="3 E 123" maxlength="200"></label>
                    <label><span data-help="Le numéro de la feuille (f° 12, f° 12 v° pour le verso), de la page ou de la vue en ligne.">Folio, page ou vue</span> <input name="folio" placeholder="12" maxlength="60"></label><label>Date de l’acte <input name="date" data-ui-date="nocal" placeholder="7 mai 1850" maxlength="80"></label>
                    <label class="span-2">À ajouter (facultatif) <input name="extra" placeholder="acte de baptême de Jean" maxlength="300"></label></div>
                    <p class="ly-citeprev" data-cite-prev></p>`,
                onOpen: dg => {
                    const f = dg.querySelector('form'), prev = dg.querySelector('[data-cite-prev]');
                    const draw = () => { const t = !src ? '' : style === 'archives' ? citeText(f, src) : (styled?.note || '…'); prev.textContent = t ? `Note : ${t}` : 'Choisis une source : la note s’écrit ici.'; };
                    const refetch = () => {
                        clearTimeout(timer); if (!src || style === 'archives' || !CS) { styled = null; pending = null; draw(); return; }
                        const my = ++seq;
                        pending = new Promise(res => { timer = setTimeout(async () => {
                            try { const r = await CS.load({source_id: src.id, only: 1, archive: f.agency.value, cote: f.cote.value, folio: f.folio.value, date: f.date.value, extra: f.extra.value}); if (my === seq) styled = r.items?.[0]?.styles?.[style] || null; }
                            catch (err) { if (my === seq) styled = null; }
                            if (my === seq) draw(); res();
                        }, 250); });
                        draw();
                    };
                    dg.addEventListener('picker-change', async e => {
                        if (e.detail?.name !== 'ly_src') return; const id = Number(e.detail.value) || 0; src = null;
                        if (id) { try { const r = await api('layout_source', {id}); src = r.source; f.agency.value = src.agency || ''; f.cote.value = src.cote || ''; const c = (r.citations || []).find(x => x.folio || x.date); if (c && !f.folio.value) f.folio.value = c.folio || ''; } catch (err) { toast(err.message, 'error'); } }
                        refetch();
                    });
                    f.elements.style.addEventListener('change', () => { style = f.elements.style.value; try { localStorage.setItem('lcnda-layout-cite-style', style); } catch (_) {} refetch(); });
                    dg.addEventListener('input', e => { if (e.target.name !== 'style') refetch(); }); draw(); setTimeout(() => dg.querySelector('.pk-input')?.focus(), 30);
                },
                onSubmit: async f => {
                    if (!src) return window.LCNDA_UI.fail(f.querySelector('.pk'), 'Choisis une source.');
                    if (style !== 'archives' && pending) await pending;
                    if (style !== 'archives' && styled?.note) putNote(styled.note, {src: src.id, srcLabel: styled.biblio || styled.note, style});
                    else putNote(citeText(f, src), {src: src.id, srcLabel: biblioLabel(f, src)});
                    msg('📚 Citation ajoutée en note (et dans la bibliographie).'); }});
        }
        /** Les appels de note d'un bloc, dans le texte qu'on écrit ou dans le document */
        function editNote(k, remove = false) {
            const t = editEl(), it = t ? findItem(editingId)?.it : chainHead(one() || {});
            if (remove) {
                if (t) { t.querySelectorAll(`sup[data-fn="${CSS.escape(k)}"]`).forEach(x => x.remove()); if (it) it.html = readEditing(t); setDirty(); }
                else if (it?.html) { const d = document.createElement('div'); d.innerHTML = it.html; d.querySelectorAll(`sup[data-fn="${CSS.escape(k)}"]`).forEach(x => x.remove()); it.html = sanitizeHtml(d.innerHTML); }
                delete D.notes[k]; if (t) { renderPanel(); return; } commit('Note retirée'); render(); return;
            }
            askBox('¹ Modifier la note', 'Texte de la note :', D.notes?.[k]?.text || '', 'Enregistrer').then(v => { if (v === null || !D.notes?.[k]) return; D.notes[k].text = v.trim().slice(0, 3000); if (t) { setDirty(); renderPanel(); } else { commit('Note modifiée'); render(); } });
        }

        /* ─── 🌳 Arbre généalogique : un cadre d'image qui suit la base (objet dynamique), dessiné en SVG ─── */
        const lookOf = () => { const st = id => D.paraStyles.find(x => x.id === id) || {}; return {accent: colorOf(D, 'sw-accent', '#7a2e2e'), text: colorOf(D, 'sw-text', '#222222'), soft: colorOf(D, 'sw-soft', '#6b6b6b'), light: colorOf(D, 'sw-light', '#f3ece4'), paper: colorOf(D, 'sw-paper', '#ffffff'), font: fontOk(st('ps-body').font) || 'Georgia', title: fontOk(st('ps-name').font || st('ps-title').font) || 'Georgia'}; };
        function treeDialog(it = null) {
            const S = A().state, t0 = it?.tree || {root: Number(S.currentPersonId) || Number(S.bootstrap?.startPersonId) || 0, mode: 'asc', gens: 4, style: 'classic', photos: true, dates: true, places: false};
            const P = window.LCNDA_PICKER || A();
            ext.openDialog({eyebrow: 'OBJET DYNAMIQUE', title: it ? '🌳 Modifier l’arbre' : '🌳 Insérer un arbre généalogique', submitLabel: it ? 'Mettre à jour l’arbre' : 'Insérer l’arbre',
                body: `<p class="muted">L’arbre est dessiné d’après la base : il se refait tout seul à l’ouverture du document et avec « ↻ Mettre à jour les objets dynamiques ». Il s’imprime et passe dans le PDF comme une image nette.</p>
                    <div><span class="pk-lab">Personne</span>${P.pickerField({name: 'ly_tree', kind: 'person', value: t0.root || null})}</div>
                    <div class="form-grid"><label>Forme <select name="mode">${TREE_MODES.map(([k, l]) => `<option value="${k}" ${k === t0.mode ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                    <label><span data-help="Combien de rangées : 2 = la personne et ses parents (ou ses enfants), 4 = jusqu’aux arrière-grands-parents. Au-delà de 6, les cases deviennent petites.">Générations</span> <input type="range" name="gens" min="2" max="8" step="1" value="${t0.gens}" data-unit=""></label>
                    <label>Style des cases <select name="tstyle">${TREE_STYLES.map(([k, l]) => `<option value="${k}" ${k === t0.style ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><span></span>
                    <label class="ui-toggle"><input type="checkbox" name="photos" ${t0.photos ? 'checked' : ''}><i></i>Photos des fiches</label><label class="ui-toggle"><input type="checkbox" name="dates" ${t0.dates !== false ? 'checked' : ''}><i></i>Dates</label><label class="ui-toggle"><input type="checkbox" name="places" ${t0.places ? 'checked' : ''}><i></i>Lieux</label></div>`,
                onSubmit: async f => {
                    const root = Number(f.elements.ly_tree?.value) || 0; if (!root) return window.LCNDA_UI.fail(f.elements.ly_tree, 'Choisis la personne de l’arbre.');
                    const cfg = cleanTree({root, mode: f.mode.value, gens: f.gens.value, style: f.tstyle.value, photos: f.photos.checked, dates: f.dates.checked, places: f.places.checked});
                    msg('🌳 Je dessine l’arbre…'); const r = await treeSvg(cfg, lookOf()); cfg.at = new Date().toISOString().slice(0, 16);
                    const src = svgSrc(r.svg);
                    if (it) { const ratio = r.h / r.w; it.tree = cfg; it.src = src; it.srcName = r.name; it.h = r1(it.w * ratio); }
                    else { const b = box(D, cur), ratio = r.h / r.w; let w = b.w, h = w * ratio; if (h > b.h) { h = b.h; w = h / ratio; } const n = shapeItem('frame', {x: r1(b.x + (b.w - w) / 2), y: b.y, w: r1(w), h: r1(h), layer: activeLayer(), fit: 'fit', fill: 'none', stroke: {c: 'none', w: 0}, name: 'Arbre'}); Object.assign(n, {src, srcName: r.name, tree: cfg}); curList().push(n); sel = [n.id]; }
                    linkState[(it || one())?.id] = 'ok'; commit(it ? 'Arbre modifié' : 'Arbre inséré'); render(); msg(`🌳 ${r.name} : ${A().plural(r.count, 'personne')}.`);
                }});
        }

        /* ─── 💬 Relecture : commentaires ancrés à un passage (<span data-cm>) ou à un objet, réponses, résolu, suggestions ─── */
        const REVIEWER_KEY = 'genealogie-layout-reviewer';
        const reviewerName = () => { try { return localStorage.getItem(REVIEWER_KEY) || ''; } catch (_) { return ''; } };
        const reviewer = async () => { let n = reviewerName(); if (n) return n; n = String(await askBox('💬 Ton nom', 'Ton prénom (il signe tes commentaires) :', '', 'Valider') || '').trim().slice(0, 60); if (n) { try { localStorage.setItem(REVIEWER_KEY, n); } catch (_) {} } return n || 'Moi'; };
        const comments = () => { D.review = D.review || {comments: []}; D.review.comments = D.review.comments || []; return D.review.comments; };
        let focusCm = '';
        const wrapRange = (t, r, id) => blocksOf(t, r).forEach(b => { const rr = document.createRange(); rr.selectNodeContents(b); if (b.contains(r.startContainer) || b === r.startContainer) rr.setStart(r.startContainer, r.startOffset); if (b.contains(r.endContainer) || b === r.endContainer) rr.setEnd(r.endContainer, r.endOffset); if (rr.collapsed) return; const sp = document.createElement('span'); sp.setAttribute('data-cm', id); sp.appendChild(rr.extractContents()); rr.insertNode(sp); });
        const textItems = () => [...D.pages.flatMap(p => p.items), ...D.masters.flatMap(m => m.items)].filter(x => x.type === 'text');
        function unwrapCm(id) { textItems().forEach(it => { if (!String(it.html || '').includes(`data-cm="${id}"`)) return; const d = document.createElement('div'); d.innerHTML = it.html; d.querySelectorAll(`[data-cm="${CSS.escape(id)}"]`).forEach(x => x.replaceWith(...x.childNodes)); it.html = sanitizeHtml(d.innerHTML); }); }
        /** Remettre le surlignage d'après les mots cités (commentaire importé, ou rouvert) */
        function wrapQuote(it, quote, id) {
            if (!it || it.type !== 'text' || !quote) return false; const d = document.createElement('div'); d.innerHTML = it.html || '';
            const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const k = n.data.indexOf(quote); if (k < 0) continue; const r = document.createRange(); r.setStart(n, k); r.setEnd(n, k + quote.length); const sp = document.createElement('span'); sp.setAttribute('data-cm', id); sp.appendChild(r.extractContents()); r.insertNode(sp); it.html = sanitizeHtml(d.innerHTML); return true; }
            return false;
        }
        async function addComment(suggest) {
            const t = editEl(), r = t ? restoreRange() : null, range = r && !r.collapsed ? r.cloneRange() : null;
            const quote = range ? range.toString().replace(/\s+/g, ' ').trim().slice(0, 600) : '';
            if (suggest && !quote) return msg('Choisis d’abord les mots à changer : double-clic dans le texte, puis sélectionne-les.');
            const target = t ? findItem(editingId)?.it : one();
            if (!target) return msg('Choisis un objet, ou des mots dans un texte (double-clic), puis « 💬 Commenter ».');
            const v = suggest ? await askBox('✎ Suggérer une modification', `Remplacer « ${quote.slice(0, 120)} » par :`, quote, 'Suggérer') : await askBox('💬 Commentaire', quote ? `Ton commentaire sur « ${quote.slice(0, 120)} » :` : 'Ton commentaire sur cet objet :', '', 'Ajouter le commentaire');
            if (v === null || (!suggest && !v.trim()) || (suggest && v === quote)) return;
            const author = await reviewer();
            const c = {id: nid('c'), text: suggest ? '' : v.trim().slice(0, 4000), author, at: new Date().toISOString(), resolved: false, item: target.id, quote, page: pageOfItem(target.id), replies: []};
            if (suggest) c.suggest = {from: quote, to: v.slice(0, 2000)};
            if (range && editEl()) { wrapRange(editEl(), range, c.id); const f = findItem(editingId); if (f) f.it.html = readEditing(editEl()); }
            comments().push(c); focusCm = c.id; panel = 'review';
            if (editingId) stopEditing(suggest ? 'Suggestion ajoutée' : 'Commentaire ajouté'); else { commit(suggest ? 'Suggestion ajoutée' : 'Commentaire ajouté'); render(); } // l'historique dit ce qu'on a fait (pas « Texte modifié »)
            msg(suggest ? '✎ Suggestion notée : elle s’accepte ou se refuse dans Relecture.' : '💬 Commentaire ajouté.');
        }
        function applySuggestion(c, accept) {
            if (editingId) stopEditing();
            const it = findItem(c.item)?.it; let done = !accept;
            if (it?.type === 'text') {
                const d = document.createElement('div'); d.innerHTML = it.html || ''; const sp = [...d.querySelectorAll(`[data-cm="${CSS.escape(c.id)}"]`)];
                if (accept && sp.length) { sp[0].replaceWith(document.createTextNode(c.suggest.to)); sp.slice(1).forEach(x => x.remove()); done = true; }
                else if (accept) { const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); let n; while (!done && (n = w.nextNode())) { const k = n.data.indexOf(c.suggest.from); if (k >= 0) { n.data = n.data.slice(0, k) + c.suggest.to + n.data.slice(k + c.suggest.from.length); done = true; } } }
                else sp.forEach(x => x.replaceWith(...x.childNodes));
                it.html = sanitizeHtml(d.innerHTML);
            }
            if (!done) return msg('Le passage a changé depuis : la suggestion ne peut plus s’appliquer toute seule. Change le texte à la main, puis « Résoudre ».');
            c.resolved = true; c.status = accept ? 'accepted' : 'refused'; commit(accept ? 'Suggestion acceptée' : 'Suggestion refusée'); render();
        }
        function drawBubbles() {
            board.querySelectorAll('.ly-cbub').forEach(x => x.remove()); if (preview || editMaster) return;
            comments().filter(c => !c.resolved).forEach(c => {
                let pe = null, top = 0; const span = board.querySelector(`[data-cm="${CSS.escape(c.id)}"]`);
                if (span) { pe = span.closest('.ly-page'); if (!pe) return; const r = span.getBoundingClientRect(), pr = pe.getBoundingClientRect(), k = pr.height / px(D.page.h) || 1; top = (r.top - pr.top) / k; }
                else { const pi = pageOfItem(c.item); if (pi < 0) return; pe = board.querySelector(`.ly-page[data-page="${pi}"]`); const it = D.pages[pi].items.find(x => x.id === c.item); top = it ? px(it.y) : 0; }
                if (!pe) return;
                const b = document.createElement('button'); b.type = 'button'; b.className = `ly-cbub${pe.classList.contains('is-left') ? ' is-left' : ''}${c.id === focusCm ? ' is-focus' : ''}`; b.dataset.lyCgo = c.id;
                // deux bulles à la même hauteur : la suivante se pose dessous
                let y = Math.max(0, r1(top)); const used = [...pe.querySelectorAll('.ly-cbub')].map(x => parseFloat(x.style.top) || 0); while (used.some(u => Math.abs(u - y) < 28 / (zoom || 1))) y += 28 / (zoom || 1);
                b.title = `${c.author} : ${c.suggest ? `remplacer « ${c.suggest.from} » par « ${c.suggest.to} »` : c.text}`.slice(0, 300); b.textContent = c.suggest ? '✎' : '💬'; b.style.top = `${y}px`; pe.appendChild(b);
            });
        }
        const pickFile = accept => new Promise(res => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.hidden = true; inp.dataset.uiOff = ''; inp.addEventListener('change', () => { res(inp.files?.[0] || null); inp.remove(); }); document.body.appendChild(inp); inp.click(); setTimeout(() => { if (!inp.files?.length) { /* fenêtre fermée sans choix */ } }, 0); });
        function exportReview(file) {
            let name = file || `${slug(docName)}-relecture.json`; if (!/relecture/i.test(name)) name = name.replace(/\.json$/i, '') + '-relecture.json';
            download(name, new Blob([JSON.stringify({lcnda: 'relecture', version: 1, outil: 'mise-en-page', name: docName, uid: D.uid, from: reviewerName(), at: new Date().toISOString(), doc: D})], {type: 'application/json'}));
            toast('📨 Fichier de relecture prêt : envoie-le à ton cousin. Il l’importe dans 📐 Mise en page, commente, puis te renvoie le sien (Relecture → Importer).');
        }
        async function importReview() {
            const f = await pickFile('.json,application/json'); if (!f) return;
            if (f.size > 40e6) return toast('Fichier trop gros.', 'error');
            let data; try { data = JSON.parse(await f.text()); } catch (_) { return toast('Ce fichier n’est pas un fichier de relecture LCNDA.', 'error'); }
            const list = data?.doc?.review?.comments || data?.comments;
            if (data?.lcnda !== 'relecture' || !Array.isArray(list)) return toast(data?.lcnda === 'reglage' ? 'C’est un fichier de réglage, pas un fichier de relecture.' : 'Ce fichier n’est pas un fichier de relecture LCNDA (📨 Envoyer à un cousin).', 'error');
            if (data.uid && D.uid && data.uid !== D.uid && !await A().confirmBox('Ce fichier de relecture a été fait pour un autre document. Importer quand même ses commentaires ?', {title: 'Un autre document ?', okLabel: 'Importer quand même'})) return;
            if (editingId) stopEditing();
            const incoming = cleanReview({comments: list}).comments; let added = 0, replies = 0, closed = 0;
            incoming.forEach(c => {
                const mine = comments().find(x => x.id === c.id);
                if (!mine) { comments().push(c); added++; if (!c.resolved && c.quote) wrapQuote(findItem(c.item)?.it, c.quote, c.id); return; }
                c.replies.forEach(r => { if (!mine.replies.some(x => x.id === r.id)) { mine.replies.push(r); replies++; } });
                if (c.resolved && !mine.resolved) { mine.resolved = true; if (c.status) mine.status = c.status; unwrapCm(c.id); closed++; }
            });
            if (!added && !replies && !closed) return toast('Rien de nouveau dans ce fichier : ses commentaires sont déjà là.');
            commit('Commentaires importés'); panel = 'review'; render();
            toast(`${A().plural(added, 'commentaire ajouté', 'commentaires ajoutés')}, ${A().plural(replies, 'réponse ajoutée', 'réponses ajoutées')}${closed ? `, ${A().plural(closed, 'résolu', 'résolus')}` : ''}${data.from ? ` (de ${data.from})` : ''}.`);
        }
        function panelReview() {
            const all = comments(), f = dl.dataset.cmf || 'open', list = all.filter(c => f === 'all' || (f === 'open' ? !c.resolved : c.resolved));
            const cnt = k => k === 'all' ? all.length : all.filter(c => (k === 'open' ? !c.resolved : c.resolved)).length;
            const when = d => window.LCNDA_UI?.when?.(d) || ''; // K4
            const card = c => { const pi = pageOfItem(c.item); return `<article class="ly-cm${c.resolved ? ' is-done' : ''}${c.id === focusCm ? ' is-focus' : ''}" data-ly-cm="${esc(c.id)}"><header><b>${esc(c.author)}</b><small>${when(c.at)}${pi >= 0 ? ` · page ${pi + (D.page.start || 1)}` : ''}</small>${c.status ? `<span class="ly-cmst">${c.status === 'accepted' ? '✓ acceptée' : '✕ refusée'}</span>` : c.resolved ? '<span class="ly-cmst">✓ résolu</span>' : ''}</header>
                ${c.quote ? `<blockquote>« ${esc(c.quote)} »</blockquote>` : '<small class="ly-help">sur un objet de la page</small>'}${c.text ? `<p>${esc(c.text)}</p>` : ''}
                ${c.suggest ? `<p class="ly-cmsug">✎ Remplacer par « <b>${esc(c.suggest.to)}</b> »</p>${!c.resolved ? '<div class="ly-row"><button type="button" class="button small" data-ly-cmacc>✓ Accepter</button><button type="button" class="button small secondary" data-ly-cmref>✕ Refuser</button></div>' : ''}` : ''}
                ${c.replies.map(r => `<div class="ly-cmrep"><b>${esc(r.author)}</b> <small>${esc(when(r.at))}</small><p>${esc(r.text)}</p></div>`).join('')}
                <div class="ly-row"><button type="button" class="button small secondary" data-ly-cmreply>↩ Répondre</button><button type="button" class="button small secondary" data-ly-cmres>${c.resolved ? '↺ Rouvrir' : '✓ Résoudre'}</button>${pi >= 0 ? '<button type="button" class="button small secondary" data-ly-cmgo>Aller</button>' : ''}<button type="button" class="icon-button small" data-ly-cmdel title="Supprimer le commentaire">🗑</button></div></article>`; };
            return sec('Commentaires', `<p class="ly-help">Choisis des mots (double-clic dans un texte) ou un objet, puis « 💬 Commenter » ou « ✎ Suggérer ». Les bulles au bord des pages montrent où ils sont.</p>
                    <div class="ly-row"><button type="button" class="button small" data-ly-cmd="comment">💬 Commenter</button><button type="button" class="button small secondary" data-ly-cmd="suggest">✎ Suggérer</button></div>
                    <div class="ui-filters ly-cmfilters">${[['open', 'Ouverts'], ['done', 'Résolus'], ['all', 'Tout']].map(([k, l]) => `<button type="button" class="${k === f ? 'is-active' : ''}" data-ly-cmf="${k}">${l} (${cnt(k)})</button>`).join('')}</div>
                    <div class="ly-cms">${list.map(card).join('') || (A().emptyState ? A().emptyState({icon: '💬', text: f === 'done' ? 'Aucun commentaire résolu' : 'Aucun commentaire', hint: 'Choisis des mots dans un texte, puis « 💬 Commenter ».'}) : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📝</span><span class="empty-line-text">Aucun commentaire.</span></p>')}</div>`)
                + sec('Envoyer à un cousin', `<p class="ly-help">Le fichier de relecture contient le livre : ton cousin l’importe dans son LCNDA (📐 Mise en page → Importer), ajoute ses commentaires, puis te renvoie le sien. Ou envoie-lui le PDF annoté, à lire sur papier.</p>
                    <div class="ly-row"><button type="button" class="button small" data-ly-cmd="sendreview">📨 Fichier de relecture…</button><button type="button" class="button small secondary" data-ly-cmd="importreview">⤒ Importer ses commentaires…</button><button type="button" class="button small secondary" data-ly-cmd="annot">📝 PDF annoté…</button></div>
                    <label class="ly-f"><span>Ton nom</span><input type="text" data-ly-reviewer value="${esc(reviewerName())}" maxlength="60" placeholder="il signe tes commentaires"></label>`);
        }
        /* ─── E4 : une image glissée (ou collée) sur la table de montage entre dans les médias et se place, liée ─── */
        async function dropImages(files) {
            const MP = window.LCNDA_MEDIA_PICKER; if (!MP?.importMediaFile) return toast('L’envoi des images n’est pas encore prêt. Réessaie dans un instant.', 'error');
            if (editingId) stopEditing();
            const list = files.filter(f => /^image\//.test(f.type)).slice(0, 20); if (!list.length) return toast('Seules les images se posent sur la page.', 'error');
            msg(`Envoi de ${A().plural(list.length, 'image')} dans les médias…`); let k = 0;
            for (const f of list) {
                try { const m = await MP.importMediaFile(f, ['image']); await placeSrc({src: `media/${m.filename}`, name: m.title || m.filename, mediaId: m.id}, k === 0 && one()?.type === 'frame' && !one().src ? one() : null, k); k++; }
                catch (err) { toast(err.message, 'error'); }
            }
            if (k) { commit(`${A().plural(k, 'image déposée', 'images déposées')}`); render(); msg(`🖼️ ${A().plural(k, 'image')} dans les médias et sur la page (liée${k > 1 ? 's' : ''}).`); } else msg('');
        }
        /* ─── 🎨 Mes styles : gardés pour tous les documents ─── */
        const SL_KEY = 'genealogie-layout-stylesets';
        function styleLibrary() {
            const sets = () => { try { const v = JSON.parse(localStorage.getItem(SL_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
            const saveSets = l => { try { localStorage.setItem(SL_KEY, JSON.stringify(l)); return true; } catch (_) { toast('Plus de place : supprime un ensemble.', 'error'); return false; } };
            const UI = window.LCNDA_UI, today = () => new Date().toLocaleDateString('fr-FR');
            const mine = () => { const used = new Set(JSON.stringify([D.paraStyles, D.charStyles]).match(/(sw|gr)-[a-z0-9_-]+/gi) || []); return {paraStyles: D.paraStyles, charStyles: D.charStyles, swatches: D.swatches.filter(x => used.has(x.id))}; };
            const frame = UI.presetsFrame({id: 'mise-en-page-styles', what: 'les styles de ce document', open: true, quietApply: true, defaultName: () => docName,
                list: () => sets().map(x => ({name: x.name, date: [`${A().plural(x.paraStyles.length, 'style')} de paragraphe · ${x.charStyles.length} de caractère`, x.date].filter(Boolean).join(' · ')})),
                apply: i => { const x = sets()[i]; if (!x) return false; const merge = (arr, add) => { add.forEach(s0 => { const k = arr.findIndex(y => y.id === s0.id); if (k >= 0) arr[k] = JSON.parse(JSON.stringify(s0)); else arr.push(JSON.parse(JSON.stringify(s0))); }); };
                    merge(D.paraStyles, x.paraStyles); merge(D.charStyles, x.charStyles); merge(D.swatches, x.swatches || []); commit(`Styles « ${x.name} » mis dans le document`); render(); toast('Styles mis dans le document : tout le texte qui les utilise suit.'); dg.close(); return false; },
                save: name => { const l = sets(), k = l.findIndex(x => x.name === name), it = {name, date: today(), ...mine()}; if (k >= 0) l[k] = it; else l.push(it); return saveSets(l); },
                replace: i => { const l = sets(); l[i] = {...l[i], date: today(), ...mine()}; return saveSets(l); },
                rename: (i, name) => { const l = sets(); l[i] = {...l[i], name}; return saveSets(l); },
                duplicate: i => { const l = sets(), name = UI.freeName(l[i].name, l.map(x => x.name)); l.splice(i + 1, 0, {...JSON.parse(JSON.stringify(l[i])), name, date: today()}); if (!saveSets(l)) return false; toast(`Copie « ${name} » créée.`); },
                exportOne: i => { const x = sets()[i]; if (x) reglageExport('mise-en-page', x.name, {paraStyles: x.paraStyles, charStyles: x.charStyles, swatches: x.swatches || []}); return false; },
                remove: i => { const l = sets(), x = l[i]; A().undoLocalChange(`Styles « ${x.name} » supprimés`, [SL_KEY], () => { l.splice(i, 1); saveSets(l); }, () => { if (frame.isConnected) frame.refresh(); }); },
                importOne: async () => { const r = await reglageImport('mise-en-page', 'les styles de la mise en page', sets().map(x => x.name)); if (!r) return false;
                    const tmp = cleanDoc({paraStyles: r.donnees.paraStyles, charStyles: r.donnees.charStyles, swatches: r.donnees.swatches}); if (!tmp.paraStyles.length && !tmp.charStyles.length) { toast('Ce réglage ne contient aucun style.', 'error'); return false; }
                    const l = sets(); l.push({name: r.nom, date: today(), paraStyles: tmp.paraStyles, charStyles: tmp.charStyles, swatches: tmp.swatches.filter(x => x.id !== 'sw-paper' || (r.donnees.swatches || []).some(y => y?.id === 'sw-paper'))}); if (!saveSets(l)) return false; toast(`Réglage « ${r.nom} » importé.`); }});
            const dg = ext.openDialog({eyebrow: 'STYLES', title: '🎨 Mes styles, pour tous mes documents', wide: true,
                body: `<p class="muted">Garde les styles de paragraphe et de caractère (et les couleurs du nuancier qu’ils utilisent) de ce document, pour les remettre dans un autre (« Appliquer »). Les styles du même nom sont remplacés, les autres ajoutés.</p><div data-presets-slot="styles"></div>`,
                onOpen: d => { d.querySelector('[data-presets-slot="styles"]')?.replaceWith(frame); }});
        }
        /* ─── ✅ Contrôle avant impression ─── */
        const textOf = html => plainOf(String(html || '').replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6])>/gi, '$&\n'));
        // chaque bloc, ses paragraphes séparés ; les titres courts de la page (le nom d'une fiche) servent de sujet aux lignes sans nom
        const textBlocks = V => V.pages.flatMap((pg, i) => { const items = pg.items.filter(it => it.type === 'text' && !it.hidden && !it.auto), ctx = items.map(it => plainOf(it.html).trim()).filter(t => t && t.length <= 80);
            return items.map(it => ({page: i, id: it.id, text: textOf(it.html), ctx})); });
        /** 🟢🔴 Le voyant du bas, comme dans InDesign : vert s'il n'y a rien à corriger, rouge avec le nombre d'erreurs (texte qui déborde, fait contredit par une fiche) ; un clic ouvre le contrôle */
        let lightTimer = 0, lightRun = 0;
        function scheduleLight() { clearTimeout(lightTimer); lightTimer = setTimeout(updateLight, 900); }
        async function updateLight() {
            const el = $('[data-ly-light]'); if (!el || !dl.isConnected) return; const run = ++lightRun;
            let over = 0, factErr = 0, factWarn = 0; const V = resolveDoc(D, {editingId});
            V.pages.forEach(pg => pg.items.forEach(it => { if (it.type === 'text' && !it.hidden && measureOverflow(V, it, pg.items.filter(o => o !== it))) over++; }));
            if (ext.factCheck) { try { const f = await ext.factCheck(textBlocks(V)); factErr = f.filter(x => x.lvl === 'err').length; factWarn = f.filter(x => x.lvl === 'warn').length; } catch (_) {} }
            if (run !== lightRun) return;
            const n = over + factErr, parts = [over ? `${over} texte${over > 1 ? 's' : ''} qui déborde${over > 1 ? 'nt' : ''}` : '', factErr ? `${factErr} fait${factErr > 1 ? 's' : ''} contredit${factErr > 1 ? 's' : ''} par les fiches` : '', factWarn ? `${factWarn} à vérifier` : ''].filter(Boolean);
            el.classList.toggle('is-err', n > 0); el.classList.toggle('is-warn', !n && factWarn > 0);
            el.querySelector('span').textContent = n ? `${n} erreur${n > 1 ? 's' : ''}` : factWarn ? `${factWarn} à vérifier` : 'Aucune erreur';
            el.title = (parts.length ? parts.join(' · ') : 'Aucun texte ne déborde, aucun fait contredit par les fiches') + '. Clic : le contrôle détaillé.';
        }
        const fontOkHere = f => { const c = document.createElement('canvas').getContext('2d'), t = 'mmmmmmmmmmlliWWQ@#'; return ['monospace', 'serif', 'sans-serif'].some(base => { c.font = `72px ${base}`; const w0 = c.measureText(t).width; c.font = `72px "${f}", ${base}`; return c.measureText(t).width !== w0; }); };
        async function preflight() {
            if (editingId) stopEditing();
            msg('Contrôle en cours…'); await new Promise(r => setTimeout(r, 20));
            const V = resolveDoc(D), st0 = D.page.start || 1, issues = [], add = (lvl, page, id, text) => issues.push({lvl, page, id, text});
            const sizes = new Map();
            const natural = src => sizes.has(src) ? sizes.get(src) : new Promise(r => { const im = new Image(); im.onload = () => { const v = [im.naturalWidth, im.naturalHeight]; sizes.set(src, v); r(v); }; im.onerror = () => { sizes.set(src, null); r(null); }; im.src = src; });
            for (const [i, pg] of V.pages.entries()) {
                const m = pageMargins(D, i), B = D.page.bleed || 0, master = D.masters.find(x => x.id === pg.master);
                if (!pg.items.length && !master?.items.length) add('info', i, '', 'Page vide.');
                for (const it of pg.items) {
                    if (it.hidden) continue;
                    if (it.type === 'text') {
                        if (measureOverflow(V, it, pg.items.filter(o => o !== it))) add('err', i, it.id, it.next ? 'Texte qui déborde (alors qu’il est chaîné : vérifie le bloc suivant).' : 'Texte qui déborde de son bloc (⊞) : agrandis le bloc, chaîne-le, ou « Faire couler le texte ».');
                        if (it.x < m.l - 0.5 || it.y < m.t - 0.5 || it.x + it.w > pageSize(D, i).w - m.r + 0.5 || it.y + it.h > pageSize(D, i).h - m.b + 0.5) add('warn', i, it.id, 'Texte hors des marges : il risque d’être coupé ou trop près du bord.');
                        if (!plainOf(it.html).trim() && !it._follow) add('info', i, it.id, 'Bloc de texte vide.');
                    }
                    if (it.type === 'frame') {
                        if (!it.src) { add('warn', i, it.id, 'Cadre d’image vide.'); continue; }
                        if (it.mediaId && linkState[it.id] === 'missing') add('err', i, it.id, 'Photo liée introuvable dans l’app.');
                        const vector = it.tree || it.qr || it.diagramId || /^data:image\/svg\+xml|\.svg(\?|$)/i.test(it.src); // un dessin (arbre, QR code, diagramme, SVG) reste net à toutes les tailles : pas de points par pouce
                        const n = await natural(it.src);
                        if (!n) add('err', i, it.id, 'Image illisible.');
                        else if (!vector) { const ar = n[0] / n[1], s = (it.imgS || 100) / 100, fit = it.fit || 'fill', wmm = (fit === 'fit' ? Math.min(it.w, it.h * ar) : fit === 'stretch' ? it.w : Math.max(it.w, it.h * ar)) * s, ppi = Math.round(n[0] / (wmm / 25.4));
                            if (ppi < 150) add(ppi < 96 ? 'err' : 'warn', i, it.id, `Image trop petite pour l’impression : ${ppi} points par pouce à cette taille (il en faut 300 pour une belle impression, 150 au minimum).`); }
                    }
                    if (it.type !== 'text' && B > 0) { // touche le bord sans aller jusqu'au fond perdu
                        const near = (a, b) => Math.abs(a - b) < 1;
                        if ((near(it.x, 0) && it.x > -B + 0.2) || (near(it.y, 0) && it.y > -B + 0.2) || (near(it.x + it.w, pageSize(D, i).w) && it.x + it.w < pageSize(D, i).w + B - 0.2) || (near(it.y + it.h, pageSize(D, i).h) && it.y + it.h < pageSize(D, i).h + B - 0.2)) add('warn', i, it.id, `Touche le bord de la page sans aller jusqu’au fond perdu (${B} mm) : un liseré blanc peut apparaître à la coupe.`);
                    }
                }
            }
            // 🔎 ce que dit le texte, comparé aux fiches (dates et lieux de naissance, baptême, décès, inhumation, mariage)
            if (ext.factCheck) { try { issues.push(...await ext.factCheck(textBlocks(V))); } catch (_) { add('info', -1, '', 'Vérification des faits impossible pour le moment (la base ne répond pas).'); } }
            // ¹ notes : un appel sans texte, ou des notes « en fin de chapitre » sans bloc pour les recevoir
            V.pages.forEach((pg, i) => pg.items.forEach(it => { if (it.type !== 'text') return; [...String(it.html || '').matchAll(/data-fn="([a-z0-9_-]+)"/gi)].forEach(m => { if (!D.notes?.[m[1]]?.text?.trim()) add('warn', i, it.id, 'Appel de note sans texte : Texte → « Notes de ce bloc » pour l’écrire.'); }); }));
            if (D.fn?.place === 'chapter' && Object.keys(D.notes || {}).length && !D.pages.some(p => p.items.some(it => it.auto === 'notes'))) add('warn', -1, '', 'Les notes vont « en fin de chapitre », mais aucun bloc ne les reçoit : Objet → « Insérer les notes du chapitre » (ou Document → Notes : en bas du bloc).');
            const openCm = (D.review?.comments || []).filter(c => !c.resolved).length; if (openCm) add('info', -1, '', `${A().plural(openCm, 'commentaire de relecture', 'commentaires de relecture')} pas encore ${openCm > 1 ? 'résolus' : 'résolu'} (onglet 💬 Relecture). Ils ne s’impriment pas.`);
            const fonts = new Set([...D.paraStyles, ...D.charStyles].map(x => x.font).filter(Boolean)); D.pages.forEach(p => p.items.forEach(it => { (String(it.html || '').match(/font-family:\s*([^;"]+)/g) || []).forEach(x => fonts.add(x.replace(/font-family:\s*/, '').split(',')[0].replace(/&quot;|['"]/g, '').trim())); }));
            [...fonts].filter(f => f && !/^(serif|sans-serif|monospace|cursive|system-ui)$/i.test(f) && !fontOkHere(f)).forEach(f => add('warn', -1, '', `Police « ${f} » absente de cet ordinateur : une autre la remplace à l’impression.`));
            if (!D.page.bleed) add('info', -1, '', 'Pas de fond perdu (Document → Fond perdu, 3 à 5 mm) : nécessaire si des images ou couleurs vont jusqu’au bord.');
            const ico = {err: '⛔', warn: '⚠️', info: 'ℹ️'}, n = k => issues.filter(x => x.lvl === k).length;
            msg('');
            ext.openDialog({eyebrow: 'CONTRÔLE AVANT IMPRESSION', title: issues.some(x => x.lvl === 'err') ? `${A().plural(n('err'), 'problème')} à corriger` : 'Prêt pour l’impression' + (n('warn') ? ` (${A().plural(n('warn'), 'avertissement')})` : ' ✓'), wide: true,
                body: `<p class="muted">${A().plural(n('err'), 'erreur')} · ${A().plural(n('warn'), 'avertissement')} · ${A().plural(n('info'), 'remarque')}. Clique sur « Aller » pour voir l’objet. Pour l’imprimeur : Fichier → « PDF avec fond perdu et traits de coupe ».</p>
                    <ol class="ly-preflight">${issues.sort((a, b) => ['err', 'warn', 'info'].indexOf(a.lvl) - ['err', 'warn', 'info'].indexOf(b.lvl) || a.page - b.page).map(x => `<li class="is-${x.lvl}">${ico[x.lvl]} ${x.page >= 0 ? `<b>Page ${x.page + st0}</b> — ` : ''}${esc(x.text)}${x.page >= 0 ? ` <button type="button" class="link-button" data-pfgo="${x.page}:${esc(x.id)}">Aller</button>` : ''}</li>`).join('') || '<li>✅ Rien à signaler.</li>'}</ol>`,
                onOpen: dg => { const x = dg.querySelector('.modal-actions [data-h-close]'); if (x) x.textContent = 'Fermer'; /* rien à annuler : la fenêtre ne fait que montrer */ dg.addEventListener('click', e => { const b = e.target.closest('[data-pfgo]'); if (!b) return; const [pi, idv] = b.dataset.pfgo.split(':'); dg.close(); goPage(Number(pi)); if (idv) { sel = [idv]; drawSel(); panel = 'obj'; renderPanel(); } }); }});
        }
        const CMD_LABELS = {cut: 'Couper', paste: 'Coller', dup: 'Dupliquer', del: 'Supprimer', front: 'Premier plan', fwd: 'Avancer', back: 'Reculer', bottom: 'Arrière-plan', lock: 'Verrouiller / déverrouiller', hide: 'Masquer', showall: 'Tout afficher', fitframe: 'Ajuster le cadre', place: 'Placer une image', addend: 'Page ajoutée à la fin', insert: 'Pages insérées', duppage: 'Page dupliquée', delpage: 'Page supprimée'};
        async function exec(cmd) {
            if (CMD_LABELS[cmd]) act = CMD_LABELS[cmd];
            dl.querySelectorAll('details.ly-menu[open]').forEach(d => d.removeAttribute('open'));
            const C = {
                save: () => save(), saveas: () => save({copy: true}), savedesign: () => save({design: true}), export: () => exportDialog(), pdf: () => exportDialog('pdf'), pdfbleed: () => exportDialog('pdf'), html: () => exportDialog('html'), json: () => exportDialog('file'), close: () => close(),
                undo, redo, cut: () => copy(true), copy: () => copy(), paste: () => paste(), dup, del, all: () => { sel = curList().filter(x => !x.hidden && !locked(x)).map(x => x.id); drawSel(); renderPanel(); }, none: () => { sel = []; drawSel(); renderPanel(); },
                front: () => arrange('front'), fwd: () => arrange('fwd'), back: () => arrange('back'), bottom: () => arrange('bottom'), lock: lockToggle, hide: () => { selected().forEach(x => { x.hidden = true; }); sel = []; commit(); render(); }, showall: () => { curList().forEach(x => { delete x.hidden; }); commit(); render(); }, fitframe: fitFrame, place: () => placeImage(),
                addend: () => addPages(1, D.pages.length), insert: insertPagesDialog, masters: () => mastersDialog(), duppage: dupPage, delpage: delPage, goto: gotoDialog, first: () => goPage(0), prev: () => goPage(cur - 1), next: () => goPage(cur + 1), last: () => goPage(D.pages.length - 1),
                zin: () => setZoom(zoom * 1.25), zout: () => setZoom(zoom / 1.25), zfit: zoomFit, z100: () => setZoom(1), guides: () => { guides = !guides; render(); }, snap: () => { snapOn = !snapOn; syncChrome(); msg(snapOn ? '🧲 Aimanter : oui.' : '🧲 Aimanter : arrêté.'); }, preview: () => { preview = !preview; render(); },
                endmaster: () => { editMaster = null; sel = []; render(); },
                docformat: () => docFormatDialog(), docinfo: () => docInfoDialog(), preflight: () => preflight(), relink: () => refreshLinks(false), stylelib: () => styleLibrary(), toc: () => insertAuto('toc'), index: () => insertAuto('index'), idxplaces: () => insertAuto('places'), idxjobs: () => insertAuto('jobs'), notesblock: () => insertAuto('notes'), biblio: () => insertAuto('biblio'), dynperson: () => dynPersonDialog(), dynmeteo: () => meteoDialog(), dyndiagram: () => insertDiagram(),
                tree: () => treeDialog(), fnote: () => insertNote(), cite: () => citeDialog(), qr: () => qrDialog(), merge: () => mergeDialog(), mergesample: () => mergeSample(),
                comment: () => addComment(false), suggest: () => addComment(true), reviewpanel: () => { panel = 'review'; renderPanel(); }, sendreview: () => exportDialog('review'), importreview: () => importReview(), annot: () => exportDialog('annot'),
                chain: () => { const it = one(); if (it?.type !== 'text') return msg('Choisis d’abord un bloc de texte.'); if (it.next) return msg('Ce bloc est déjà chaîné (« Couper le chaînage » d’abord).'); linkFrom = it.id; canvas.classList.add('is-linking'); render(); msg('➜ Clique sur le bloc de texte qui reçoit la suite (sur n’importe quelle page). Échap : annuler.'); },
                unchain: () => { const it = one(); if (!it?.next) return msg('Ce bloc n’est pas chaîné vers un autre.'); delete it.next; commit('Chaînage coupé'); render(); },
                autoflow: () => autoflow(),
                mfolio: () => masterAdd('folio'), mrunning: () => masterAdd('running'), mchapter: () => masterAdd('chapter'), mfooter: () => masterAdd('footer'),
            };
            await C[cmd]?.();
        }
        dl.addEventListener('click', e => {
            const c = e.target.closest('[data-ly-cmd]'); if (c) { e.preventDefault(); exec(c.dataset.lyCmd); return; }
            const t = e.target.closest('[data-ly-tool]'); if (t) { if (editingId) stopEditing(); tool = t.dataset.lyTool; pen = null; syncChrome(); return; }
            const pt = e.target.closest('[data-ly-panel]'); if (pt) { panel = pt.dataset.lyPanel; dl.querySelectorAll('[data-ly-panel]').forEach(b => b.classList.toggle('is-on', b === pt)); renderPanel(); return; }
            if (e.target.closest('[data-ly-fsswap]')) { swapPaint(); return; }
            if (e.target.closest('[data-ly-fsnone]')) { if (!selected().length) return msg('Choisis un objet.'); applyPaint('none'); return; }
            const tg0 = e.target.closest('.ly-fs [data-ly-target]'); if (tg0) { const it = one(), pk = dl.querySelector('[data-ly-fspick]'), c0 = it ? colorOf(D, tg0.dataset.lyTarget === 'fill' ? it.fill : it.stroke?.c, '') : ''; pk.value = hexOk(c0) ? c0 : (tg0.dataset.lyTarget === 'fill' ? '#ffffff' : '#111111'); pk.dataset.for = tg0.dataset.lyTarget; if (selected().length) { const UI = window.LCNDA_UI, tgt = tg0.dataset.lyTarget; // C2 : la fenêtre des couleurs de l'app (jamais celle du système)
                if (UI?.openColorBox) setTimeout(() => UI.openColorBox(tg0, {get: () => pk.value, allowNone: true, set: (v, final) => { if (!final) return; const keep = fillTarget; fillTarget = tgt; applyPaint(v ? v.slice(0, 7) : 'none'); fillTarget = keep; syncChrome(); }}), 0);
                else setTimeout(() => { try { pk.showPicker ? pk.showPicker() : pk.click(); } catch { pk.click(); } }, 0); } }
            const tg = e.target.closest('[data-ly-target]'); if (tg) { fillTarget = tg.dataset.lyTarget; panel = 'color'; dl.querySelectorAll('[data-ly-panel]').forEach(b => b.classList.toggle('is-on', b.dataset.lyPanel === 'color')); syncChrome(); renderPanel(); }
            if (!e.target.closest('details.ly-menu')) dl.querySelectorAll('details.ly-menu[open]').forEach(d => d.removeAttribute('open'));
        });
        dl.addEventListener('toggle', e => { if (e.target.matches?.('details.ly-menu[open]')) dl.querySelectorAll('details.ly-menu[open]').forEach(d => { if (d !== e.target) d.removeAttribute('open'); }); }, true);
        $('[data-ly-goto]').addEventListener('change', e => goPage(Number(e.target.value) - 1));
        $('[data-ly-name]').addEventListener('input', e => { docName = e.target.value.slice(0, 160); setDirty(); });
        // raccourcis clavier (quand la fenêtre est au premier plan)
        const keyAc = new AbortController();
        document.addEventListener('keydown', e => {
            if (!dl.open || [...document.querySelectorAll('dialog[open]')].at(-1) !== dl) return;
            const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase(), inField = e.target.closest?.('input, textarea, select') || (e.target.isContentEditable);
            if (mod && k === 's') { e.preventDefault(); save(); return; }
            if (inField) { if (editingId && mod && k === 'z') return; return; }
            if (pen && e.key === 'Enter') { e.preventDefault(); finishPen(false); return; }
            if (pen && e.key === 'Escape') { e.preventDefault(); pen = null; pageEl()?.querySelector('.ly-penline')?.remove(); return; }
            if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; } if (mod && k === 'y') { e.preventDefault(); redo(); return; }
            if (mod && k === 'v' && !clip) return; // rien de copié ici : on laisse coller une image de l'ordinateur (E4)
            if (mod && ['c', 'x', 'v', 'd', 'a', 'j', '0', '1', '=', '+', '-', ']', '['].includes(k)) {
                e.preventDefault(); ({c: () => copy(), x: () => copy(true), v: () => paste(e.shiftKey || e.altKey), d: dup, a: () => exec('all'), j: gotoDialog, 0: zoomFit, 1: () => setZoom(1), '=': () => setZoom(zoom * 1.25), '+': () => setZoom(zoom * 1.25), '-': () => setZoom(zoom / 1.25), ']': () => arrange(e.shiftKey ? 'front' : 'fwd'), '[': () => arrange(e.shiftKey ? 'bottom' : 'back')})[k]?.(); return;
            }
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); return; }
            if (e.key === 'Escape' && linkFrom) { e.preventDefault(); linkFrom = null; canvas.classList.remove('is-linking'); render(); msg('Chaînage annulé.'); return; }
            if (e.key === 'Escape' && sel.length) { e.preventDefault(); sel = []; drawSel(); renderPanel(); return; } // Échap désélectionne d'abord (la fenêtre ne se ferme qu'au suivant)
            if (e.key === 'PageDown') { e.preventDefault(); goPage(cur + 1); return; } if (e.key === 'PageUp') { e.preventDefault(); goPage(cur - 1); return; }
            if (e.key.startsWith('Arrow') && sel.length) { e.preventDefault(); const d = e.shiftKey ? 5 : 1, dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0; selected().filter(x => !locked(x)).forEach(x => { x.x = r1(x.x + dx); x.y = r1(x.y + dy); }); commit('Déplacement au clavier'); render(); return; }
            if (k === 'w') { preview = !preview; render(); return; }
            if (k === 'x' && !mod && e.shiftKey) { swapPaint(); return; }
            if (k === 'x' && !mod) { fillTarget = fillTarget === 'fill' ? 'stroke' : 'fill'; syncChrome(); if (panel === 'color') renderPanel(); return; }
            if (e.key === '/' && !mod) { if (selected().length) applyPaint('none'); return; }
            const t = TOOLS.find(x => x[3] === k); if (t && !mod) { tool = t[0]; pen = null; syncChrome(); }
        }, {signal: keyAc.signal});

        /* — enregistrer, exporter, fermer — */
        async function save({copy: asCopy = false, design: asDesign = false, force = false} = {}) {
            if (editingId) stopEditing();
            let name = String(docName || '').trim() || 'Sans titre';
            if (asCopy || asDesign) { const n = await ask(asDesign ? 'Nom du design (il sera proposé pour les prochains livres) :' : 'Nom de la copie :', asDesign ? `${name} (design)` : `${name} (copie)`); if (!n) return; name = n.trim().slice(0, 160); }
            if (!asCopy && !asDesign) status('saving');
            try {
                const own = !asCopy && !asDesign;
                const res = (await post('save_layout_doc', {id: own ? docId : 0, name, is_design: asDesign ? 1 : (asCopy ? 0 : (design ? 1 : 0)), doc: D, ...(own && docId && docRev ? {base_rev: docRev} : {}), ...(force ? {force: 1} : {})})).result;
                if (own) { docId = res.id; docName = res.name; if (res.rev) docRev = res.rev; setDirty(false); } // « ✓ Enregistré » en haut, sans message
                else toast(asDesign ? `Design « ${res.name} » enregistré : il est proposé pour les nouveaux livres.` : `Copie « ${res.name} » enregistrée.`);
                onSaved?.();
            } catch (err) {
                if (!asCopy && !asDesign) status('error');
                if (!err.conflict || asCopy || asDesign) { toast(err.message, 'error'); return; }
                const choice = await (A().conflictBox?.({what: 'Ce document'}) ?? Promise.resolve(null));
                if (choice === 'overwrite') return save({force: true});
                if (choice === 'reload') { const keepId = docId; setDirty(false); keyAc.abort(); dl.close(); ext.openLayoutDoc?.(keepId, onSaved); }
            }
        }
        async function close() { if (editingId) stopEditing(); if (dirty && !await A().confirmBox('Les dernières modifications seront perdues.', {title: 'Fermer sans enregistrer ?', okLabel: 'Fermer sans enregistrer', danger: true})) return; keyAc.abort(); dl.close(); }
        dl.addEventListener('cancel', e => { if (e.target !== dl) return; e.preventDefault(); const om = dl.querySelectorAll('details.ly-menu[open]'); if (om.length) { om.forEach(d => d.removeAttribute('open')); return; } if (editingId) { stopEditing(); return; } if (pen) { pen = null; render(); return; } close(); });
        dl.addEventListener('close', () => { keyAc.abort(); dl.remove(); onSaved?.(); });
        const docForExport = () => { if (editingId) stopEditing(); return D; };
        function exportPrint(bleed = false, {annot = false, autoPrint = false} = {}) {
            if (bleed && !D.page.bleed) toast('Le document n’a pas de fond perdu (Document → Fond perdu) : seuls les traits de coupe sont ajoutés.');
            const html = printHtml(docForExport(), docName, true, {bleed, annot, autoPrint}); const w = window.open('', '_blank');
            if (!w) throw new Error('fenêtre bloquée : autorise les fenêtres pour cette page.');
            w.document.open(); w.document.write(html); w.document.close(); toast(autoPrint ? 'Le livre s’ouvre et l’impression se lance.' : 'Le livre s’ouvre : « Imprimer », puis « Enregistrer en PDF ».');
        }
        async function exportHtml(file) { msg('Préparation du fichier HTML (les images sont intégrées)…'); const html = await inlineImages(printHtml(docForExport(), docName, false)); download(file || `${slug(docName)}.html`, new Blob([html], {type: 'text/html'})); msg(''); }
        function exportJson(file) { download(file || `${slug(docName)}.json`, new Blob([JSON.stringify({type: 'lcnda-mise-en-page-livre', version: 1, name: docName, is_design: design ? 1 : 0, doc: docForExport()}, null, 1)], {type: 'application/json'})); }
        async function exportEpub(file) { msg('Préparation du livre numérique (ePub)…'); try { const blob = await buildEpub(docForExport(), docName); download(file || `${slug(docName)}.epub`, blob); msg(`📱 ePub prêt (${Math.max(1, Math.round(blob.size / 1024))} Ko) : il s’ouvre dans Livres, Kobo, Calibre…`); } catch (err) { msg(''); throw err; } }
        /** 🗄️ PDF/A : chaque page dessinée en image (300 points par pouce), profil sRGB et métadonnées intégrés (heritage-layout-pdfa.js) */
        async function exportPdfA(file) { msg('🗄️ PDF/A : dessin des pages…'); try { const blob = await ext.layoutPdfA.fromDoc(docForExport(), docName, {dpi: 300, onStep: p => msg(`🗄️ PDF/A : dessin des pages… ${Math.round(p * 100)} %`)}); download(file || `${slug(docName)}.pdf`, blob); msg(`🗄️ PDF/A prêt (${(blob.size / 1048576).toFixed(1).replace('.', ',')} Mo) : fait pour être gardé longtemps (archives, notaire, dépôt).`); } catch (err) { msg(''); throw err; } }
        /** E3 : une seule fenêtre pour tous les exports */
        function exportDialog(value = 'pdf') {
            if (editingId) stopEditing();
            const UI = window.LCNDA_UI; if (!UI?.openExportDialog) return exportPrint();
            const open = (D.review?.comments || []).filter(c => !c.resolved).length;
            return UI.openExportDialog({title: docName || 'Mon livre', defaultName: docName || 'livre', bleed: true, quality: false, value,
                info: `${A().plural(D.pages.length, 'page')} · ${String(r1(D.page.w)).replace('.', ',')} × ${String(r1(D.page.h)).replace('.', ',')} mm${D.page.bleed ? ` · fond perdu ${String(D.page.bleed).replace('.', ',')} mm` : ''}`,
                preview: () => { const el = document.createElement('div'); el.className = 'ly-expprev'; el.innerHTML = coverHtml(D, 170); return el; },
                formats: [
                    {id: 'pdf', ext: '', hint: 'par l’impression', run: o => exportPrint(o.bleed)},
                    {id: 'print', run: o => exportPrint(o.bleed, {autoPrint: true})},
                    ...(ext.layoutBooklet ? [{id: 'booklet', label: '📖 Livret à plier', hint: 'pages remises dans l’ordre, 2 par face', ext: '', quality: false, run: () => { ext.layoutBooklet.open(docForExport(), docName || 'Mon livre'); toast('Le livret s’ouvre : imprime en recto verso (retournement sur le petit côté), plie, agrafe.'); }}] : []),
                    ...(ext.layoutPdfA ? [{id: 'pdfa', label: '🗄️ PDF/A', hint: 'archivage (ISO 19005), pages en image', ext: 'pdf', quality: false, run: o => exportPdfA(o.filename)}] : []),
                    {id: 'epub', label: '📱 ePub', hint: 'liseuse, téléphone, tablette', ext: 'epub', quality: false, run: o => exportEpub(o.filename)},
                    {id: 'html', label: '🌐 HTML', hint: 'une page, photos comprises', ext: 'html', quality: false, run: o => exportHtml(o.filename)},
                    {id: 'annot', label: '📝 PDF annoté', hint: open ? `avec ${A().plural(open, 'commentaire')}` : 'avec les commentaires', ext: '', run: o => exportPrint(o.bleed, {annot: true})},
                    {id: 'review', label: '💬 Relecture', hint: 'à envoyer à un cousin', ext: 'json', quality: false, run: o => exportReview(o.filename)},
                    {id: 'file', hint: 'le document (.json)', ext: 'json', run: o => exportJson(o.filename)},
                ]});
        }

        /* — panneaux de droite — */
        const pid = () => 'p' + Math.random().toString(36).slice(2, 7);
        const num = (k, label, v, {min = -9999, max = 9999, step = 0.1, unit = 'mm', attr = 'data-ly-set'} = {}) => `<label class="ly-f"><span>${label}</span><input type="number" ${attr}="${k}" value="${v === '' ? '' : r1(v)}" min="${min}" max="${max}" step="${step}"><em>${unit}</em></label>`;
        const sel2 = (k, label, opts, v, attr = 'data-ly-set') => `<label class="ly-f"><span>${label}</span><select ${attr}="${k}">${opts.map(([a, b]) => `<option value="${esc(a)}" ${String(a) === String(v) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
        const paintSel = (k, label, v) => `<label class="ly-f"><span>${label}</span><select data-ly-set="${k}"><option value="none" ${v === 'none' ? 'selected' : ''}>Aucun</option>${D.swatches.map(s => `<option value="${esc(s.id)}" ${s.id === v ? 'selected' : ''}>${s.type === 'grad' ? '▤ ' : '■ '}${esc(s.name)}</option>`).join('')}${hexOk(v) ? `<option value="${v}" selected>${v}</option>` : ''}</select><i class="ly-chip" style="background:${cssPaint(D, v)}"></i></label>`;
        // E2 : sections repliables communes, ouvertes ou fermées comme la dernière fois (le titre est écrit tel quel, sans code)
        const secKey = t => 'ly-' + fold(t).replace(/\([^)]*\)/g, '').replace(/[^a-z]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
        const sec = (title, body, open = true) => window.LCNDA_UI?.panelSection ? window.LCNDA_UI.panelSection({title, key: secKey(title), open, body}) : `<details class="ly-sec" ${open ? 'open' : ''}><summary>${esc(title)}</summary><div class="ly-secb">${body}</div></details>`;
        const help = (label, phrase, faq = '') => `<span data-help="${esc(phrase)}"${faq ? ` data-help-faq="${esc(faq)}"` : ''}>${label}</span>`;
        function renderPanel() {
            if (!pbody.isConnected) return;
            dl.querySelectorAll('[data-ly-panel]').forEach(b => b.classList.toggle('is-on', b.dataset.lyPanel === panel)); // l'onglet suit toujours le panneau montré
            const keepScroll = pbody.scrollTop;
            pbody.innerHTML = ({pages: panelPages, layers: panelLayers, obj: panelObj, text: panelText, color: panelColor, links: panelLinks, review: panelReview, history: panelHistory, doc: panelDoc}[panel] || panelPages)();
            if (panel === 'history') pbody.querySelector('.is-current')?.scrollIntoView({block: 'nearest'});
            pbody.scrollTop = keepScroll;
            // vignette : réduite, avec un contour à son échelle (sinon une page blanche disparaît sur le panneau blanc)
            const thumbZoom = (pg, w) => { const z = w / Math.max(1, parseFloat(pg.style.width) || px(D.page.w)); pg.style.zoom = String(z); pg.style.outline = `${(1 / z).toFixed(1)}px solid #b9b9c3`; };
            pbody.querySelectorAll('.ly-thumb .ly-page').forEach(p => thumbZoom(p, 120));
            // Beaucoup de pages : petites vignettes, dessinées seulement quand elles arrivent à l'écran
            const lazy = pbody.querySelectorAll('.ly-thumb[data-ly-lazy]');
            if (lazy.length) {
                const io = new IntersectionObserver(entries => entries.forEach(en => {
                    if (!en.isIntersecting) return;
                    const b = en.target, i = Number(b.dataset.lyPage); io.unobserve(b); b.removeAttribute('data-ly-lazy');
                    if (!D.pages[i]) return;
                    b.querySelector('.ly-tph')?.insertAdjacentHTML('afterend', pageHtml(resolveDoc(D), i, {preview: true, keyPrefix: 't' + i}));
                    b.querySelector('.ly-tph')?.remove();
                    const pg = b.querySelector('.ly-page'); if (pg) thumbZoom(pg, 48);
                }), {root: pbody, rootMargin: '200px'});
                lazy.forEach(b => io.observe(b));
            }
        }
        function panelPages() {
            const many = D.pages.length > 120;
            const mopts = sel0 => `<option value="" ${!sel0 ? 'selected' : ''}>Aucun gabarit</option>${D.masters.map(m => `<option value="${esc(m.id)}" ${m.id === sel0 ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}`;
            return sec('Gabarits', `<div class="ly-row ly-pmaster"><label class="ly-f ly-inline">${help(`Page ${cur + (D.page.start || 1)} :`, 'Le gabarit est un fond commun à plusieurs pages (numéro de page, titre courant, filets) : ce qui est posé sur le gabarit apparaît sur toutes ses pages.', 'gabarit')}<select data-ly-pmaster title="Ajouter, enlever ou remplacer le gabarit de cette page">${mopts(D.pages[cur]?.master || '')}</select></label><button type="button" class="button small secondary" data-ly-mmulti title="Mettre, enlever ou remplacer un gabarit sur plusieurs pages">Plusieurs pages…</button></div>
                <div class="ly-masters">${D.masters.map(m => `<div class="ly-mrow"><b>${esc(m.name)}</b><span>${D.pages.filter(p => p.master === m.id).length} p.</span><button type="button" class="button small secondary" data-ly-medit="${esc(m.id)}">Modifier</button><button type="button" class="button small secondary" data-ly-mapply="${esc(m.id)}" title="Appliquer à la page ${cur + 1}">→ p. ${cur + 1}</button><button type="button" class="icon-button small" data-ly-mren="${esc(m.id)}" title="Renommer">✎</button><button type="button" class="icon-button small" data-ly-mdel="${esc(m.id)}" title="Supprimer">🗑</button></div>`).join('')}</div>
                <div class="ly-row"><button type="button" class="button small secondary" data-ly-mnew>＋ Nouveau gabarit</button><button type="button" class="button small secondary" data-ly-mnone>Page sans gabarit</button><button type="button" class="button small secondary" data-ly-mdetach title="Les éléments du gabarit deviennent modifiables sur cette page">Détacher les éléments</button></div>`)
                + sec(`Pages (${D.pages.length})`, `<div class="ly-row"><button type="button" class="button small" data-ly-cmd="addend">＋ Page à la fin</button><button type="button" class="button small secondary" data-ly-cmd="insert">＋ Insérer…</button><button type="button" class="button small secondary" data-ly-cmd="duppage">Dupliquer</button><button type="button" class="button small secondary" data-ly-cmd="delpage">🗑</button></div>
                <div class="ly-row"><button type="button" class="button small secondary" data-ly-pmove="-1" title="Avancer la page">↑ Avancer</button><button type="button" class="button small secondary" data-ly-pmove="1" title="Reculer la page">↓ Reculer</button><label class="ly-f ly-inline"><span>Aller à</span><input type="number" min="1" max="${D.pages.length}" data-ly-goto2 value="${cur + 1}"></label></div>
                <div class="ly-thumbs${many ? ' is-many' : ''}${D.page.facing ? ' is-facing' : ''}">${spreads(D).map(sp => `<div class="ly-tspread">${sp.map(i => `<button type="button" class="ly-thumb${i === cur ? ' is-cur' : ''}" data-ly-page="${i}" ${many ? 'data-ly-lazy' : ''} title="Page ${i + (D.page.start || 1)}">${many ? '<i class="ly-tph"></i>' : pageHtml(resolveDoc(D), i, {preview: true, keyPrefix: 't' + i})}<span>${i + (D.page.start || 1)}${D.pages[i].master ? ' · ' + esc(D.pages[i].master) : ''}</span></button>`).join('')}</div>`).join('')}</div>`);
        }
        function panelLayers() {
            const counts = Object.fromEntries(D.layers.map(l => [l.id, curList().filter(i => i.layer === l.id).length]));
            return sec('Calques', `<p class="ly-help">Le calque du haut est devant. Nouveaux objets : calque choisi (●).</p><div class="ly-layers">${D.layers.map((l, i) => `<div class="ly-lrow${(dl.dataset.layer || D.layers[0].id) === l.id ? ' is-cur' : ''}" data-ly-layer="${esc(l.id)}"><i style="background:${l.color}"></i><button type="button" class="icon-button small" data-ly-lvis title="${l.visible ? 'Cacher' : 'Montrer'}">${l.visible ? '👁' : '🙈'}</button><button type="button" class="icon-button small" data-ly-llock title="${l.locked ? 'Déverrouiller' : 'Verrouiller'}">${l.locked ? '🔒' : '🔓'}</button><b data-ly-lpick title="Double-clic : renommer">${esc(l.name)}</b><small>${counts[l.id]}</small><button type="button" class="icon-button small" data-ly-lup ${i ? '' : 'disabled'}>↑</button><button type="button" class="icon-button small" data-ly-ldown ${i < D.layers.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="icon-button small" data-ly-ldel title="Supprimer">🗑</button></div>`).join('')}</div>
                <div class="ly-row"><button type="button" class="button small" data-ly-lnew>＋ Nouveau calque</button>${sel.length ? `<label class="ly-f ly-inline"><span>Sélection vers</span><select data-ly-lmove>${D.layers.map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></label>` : ''}</div>`)
                + sec('Objets de la page', `<div class="ly-objlist">${curList().slice().reverse().map(it => `<button type="button" class="ly-orow${sel.includes(it.id) ? ' is-sel' : ''}" data-ly-pickobj="${esc(it.id)}"><i style="background:${layerOf(D, it)?.color}"></i>${it.hidden ? '🙈 ' : ''}${it.locked ? '🔒 ' : ''}${esc(it.name || ({text: 'Texte', frame: 'Cadre d’image', rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygone', star: 'Étoile', line: 'Ligne', path: 'Tracé', compound: 'Forme composée'}[it.type] || it.type))}</button>`).join('') || '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🗂️</span><span class="empty-line-text">Aucun objet sur cette page.</span></p>'}</div>`);
        }
        function panelObj() {
            const its = selected(), it = one();
            if (!its.length) return `<p class="ly-help">Choisis un objet sur la page (outil ➤). Double-clic sur un texte pour l’écrire, sur un cadre pour y placer une image.</p>` + sec('Outils', `<div class="ly-row"><button type="button" class="button small" data-ly-cmd="place">🖼️ Placer une image</button></div>`);
            let h = '';
            if (it) {
                h += sec('Position et taille', `<div class="ly-grid2">${num('x', 'X', it.x)}${num('y', 'Y', it.y)}${num('w', 'L', it.w, {min: 0})}${num('h', 'H', it.h, {min: 0})}${num('rot', 'Angle', it.rot || 0, {min: -360, max: 360, step: 1, unit: '°'})}<label class="ui-toggle ly-f ly-check"><input type="checkbox" data-ly-set="lockRatio" ${it.lockRatio ? 'checked' : ''}><i></i>Proportions</label></div>
                    <div class="ly-row"><button type="button" class="button small secondary" data-ly-flip="flipX">⇋ Miroir H</button><button type="button" class="button small secondary" data-ly-flip="flipY">⇵ Miroir V</button></div><label class="ly-f"><span>Nom</span><input type="text" data-ly-set="name" value="${esc(it.name || '')}" placeholder="(dans Calques)"></label>`);
            }
            const f0 = its[0];
            h += sec('Couleur', `${paintSel('fill', 'Fond', f0.fill)}${paintSel('stroke.c', 'Contour', f0.stroke?.c || 'none')}<div class="ly-grid2">${num('stroke.w', 'Épaisseur', f0.stroke?.w || 0, {min: 0, max: 100, step: 0.25, unit: 'pt'})}${sel2('stroke.dash', 'Type', DASHES, f0.stroke?.dash || 'solid')}${sel2('stroke.cap', 'Bouts', [['butt', 'Droits'], ['round', 'Arrondis'], ['square', 'Carrés']], f0.stroke?.cap || 'butt')}${sel2('stroke.join', 'Angles', [['miter', 'Pointus'], ['round', 'Arrondis'], ['bevel', 'Biseautés']], f0.stroke?.join || 'miter')}</div>${['rect', 'frame', 'text'].includes(f0.type) ? num('radius', 'Angles arrondis', f0.radius || 0, {min: 0, max: 500, step: 0.5}) : ''}`);
            h += sec('Effets', `<div class="ly-grid2">${num('opacity', 'Opacité', f0.opacity ?? 100, {min: 0, max: 100, step: 1, unit: '%'})}${sel2('blend', help('Fusion', 'Comment la couleur de l’objet se mélange à ce qui est dessous : « Produit » assombrit, « Superposition » éclaircit.'), BLENDS, f0.blend || 'normal')}${num('feather', help('Contour progressif', 'Adoucit les bords de l’objet sur cette largeur, comme un flou du pourtour.'), f0.feather || 0, {min: 0, max: 50, step: 0.5})}</div>
                <label class="ui-toggle ly-f ly-check"><input type="checkbox" data-ly-set="shadow.on" ${f0.shadow?.on ? 'checked' : ''}><i></i>Ombre portée</label>${f0.shadow?.on ? `<div class="ly-grid2">${num('shadow.x', 'Décalage X', f0.shadow.x ?? 1.5)}${num('shadow.y', 'Décalage Y', f0.shadow.y ?? 1.5)}${num('shadow.blur', 'Flou', f0.shadow.blur ?? 2, {min: 0, max: 50})}${num('shadow.o', 'Opacité', f0.shadow.o ?? 50, {min: 0, max: 100, step: 1, unit: '%'})}<label class="ly-f"><span>Couleur</span><input type="color" data-ly-set="shadow.c" value="${esc(f0.shadow.c || '#000000')}"></label></div>` : ''}`, false);
            if (it) {
                if (it.type === 'polygon' || it.type === 'star') h += sec('Forme', `${num('sides', it.type === 'star' ? 'Branches' : 'Côtés', it.sides || (it.type === 'star' ? 5 : 6), {min: 3, max: 60, step: 1, unit: ''})}${it.type === 'star' ? num('inner', 'Creux', it.inner || 45, {min: 5, max: 100, step: 1, unit: '%'}) : ''}`);
                if (it.type === 'path') h += sec('Tracé', `<label class="ui-toggle ly-f ly-check"><input type="checkbox" data-ly-set="smooth" ${it.smooth ? 'checked' : ''}><i></i>Courbe douce</label><label class="ui-toggle ly-f ly-check"><input type="checkbox" data-ly-set="closed" ${it.closed ? 'checked' : ''}><i></i>Fermé</label>`);
                if (['rect', 'ellipse', 'polygon', 'star', 'frame'].includes(it.type)) h += sec('Convertir la forme', `<div class="ly-row">${[['rect', '▭'], ['ellipse', '◯'], ['polygon', '⬡'], ['star', '☆']].map(([k, ic]) => `<button type="button" class="button small secondary" data-ly-convert="${k}" title="En ${k}">${ic}</button>`).join('')}</div>`, false);
            }
            if (it && it.type !== 'text') h += sec('Habillage du texte', `${sel2('wrap.mode', help('Le texte voisin', 'Les blocs de texte posés sous cet objet le contournent au lieu de passer dessous.', 'habillage'), WRAPS, it.wrap?.mode || 'none')}${num('wrap.off', 'Distance', it.wrap?.off ?? 3, {min: 0, max: 100, step: 0.5})}<p class="ly-help">Les blocs de texte de la page contournent cet objet.</p>`, !!it.wrap?.mode && it.wrap.mode !== 'none');
            if (it?.type === 'frame' && it.tree) h += sec('🌳 Arbre (objet dynamique)', `<p class="ly-help">${esc(TREE_MODES.find(m => m[0] === it.tree.mode)?.[1] || '')} · ${A().plural(it.tree.gens, 'génération')}${it.tree.at ? ` · ${esc(window.LCNDA_UI?.whenText?.(it.tree.at, {label: 'mis à jour'}) || it.tree.at)}` : ''}${linkState[it.id] === 'missing' ? ' — ⛔ personne introuvable' : ''}. Il suit la base : il se refait à l’ouverture du document et avec « ↻ Mettre à jour ».</p><div class="ly-row"><button type="button" class="button small" data-ly-treeedit>✎ Modifier l’arbre…</button><button type="button" class="button small secondary" data-ly-treeupd>↻ Mettre à jour</button><button type="button" class="button small secondary" data-ly-treeopen>↗ Fiche</button><button type="button" class="button small secondary" data-ly-treedetach title="L’arbre reste tel quel et ne suit plus la base">Détacher</button></div>`);
            else if (it?.type === 'frame' && it.qr) h += sec('▦ QR code', `<p class="ly-help">Il contient : « ${esc(it.qr.text.length > 120 ? it.qr.text.slice(0, 119) + '…' : it.qr.text)} ». Il se redessine net à toutes les tailles (PDF, ePub, HTML).</p><div class="ly-row"><button type="button" class="button small" data-ly-qredit>▦ Modifier le QR code…</button></div>`);
            else if (it?.type === 'frame' && it.src) h += sec('🔗 Objet dynamique', it.diagramId ? `<p class="ly-help">📊 Diagramme <b>lié</b>${linkState[it.id] === 'missing' ? ' — ⛔ introuvable' : ''} : modifié dans Graphiques → Mes diagrammes, il se redessine ici (« Mettre à jour »).</p><div class="ly-row"><button type="button" class="button small" data-ly-editdg>✎ Modifier le diagramme</button><button type="button" class="button small secondary" data-ly-cmd="relink">↻ Mettre à jour</button></div>` : it.mediaId ? `<p class="ly-help">Image <b>liée</b> à une photo de l’app${linkState[it.id] === 'missing' ? ' — ⛔ introuvable' : linkState[it.id] === 'updated' ? ' — mise à jour' : ''} : elle reste en pleine qualité (rien n’est réduit), et toute retouche faite dans l’app arrive ici.</p><div class="ly-row"><button type="button" class="button small" data-ly-editorig>✎ Modifier l’original (retouche)</button><button type="button" class="button small secondary" data-ly-cmd="relink">↻ Mettre à jour</button><button type="button" class="button small secondary" data-ly-unlinkimg title="L’image ne suit plus la photo de l’app">Incorporer (ne plus suivre)</button></div>`
                : '<p class="ly-help">Image incorporée au document. Pour qu’elle suive une photo de l’app (et ses retouches) : « Remplacer l’image » et choisis-la dans la base.</p>');
            if (it?.type === 'frame') h += sec('Cadre d’image', `<div class="ly-row"><button type="button" class="button small" data-ly-cmd="place">🖼️ ${it.src ? 'Remplacer' : 'Placer'} l’image</button>${it.src ? '<button type="button" class="button small secondary" data-ly-imgclear>Vider</button><button type="button" class="button small secondary" data-ly-cmd="fitframe">Cadre au contenu</button>' : ''}</div>${sel2('fit', 'Ajustement', FITS, it.fit || 'fill')}<div class="ly-grid2">${num('imgS', 'Échelle', it.imgS || 100, {min: 5, max: 2000, step: 1, unit: '%'})}${num('imgX', 'Décalage X', it.imgX || 0)}${num('imgY', 'Décalage Y', it.imgY || 0)}</div>`);
            if (it?.type === 'text') h += sec('Bloc de texte', `<div class="ly-grid2">${num('columns', 'Colonnes', it.columns || 1, {min: 1, max: 12, step: 1, unit: ''})}${num('gutter', 'Gouttière', it.gutter ?? 4, {min: 0, max: 50, step: 0.5})}${num('inset', 'Marge intérieure', it.inset || 0, {min: 0, max: 100, step: 0.5})}${sel2('valign', 'Vertical', [['top', 'En haut'], ['middle', 'Au milieu'], ['bottom', 'En bas'], ['justify', 'Justifié']], it.valign || 'top')}</div><div class="ly-row"><button type="button" class="button small secondary" data-ly-cmd="fitframe">Ajuster la hauteur au texte</button></div>`);
            if (it?.type === 'text' && !editMaster) {
                const head = chainHead(it), list = chainList(head), k = list.indexOf(it), pg = idv => pageOfItem(idv) + (D.page.start || 1);
                h += sec('➜ Texte chaîné', `${list.length > 1 ? `<p class="ly-help">Bloc ${k + 1} sur ${list.length} : ${list.map((x, j) => `<button type="button" class="link-button" data-ly-chaingo="${esc(x.id)}">${j === k ? '<b>' : ''}p. ${pg(x.id)}${j === k ? '</b>' : ''}</button>`).join(' → ')}</p>` : '<p class="ly-help">Un texte peut continuer d’un bloc à l’autre, sur d’autres pages : il passe tout seul à la suite quand le premier est plein.</p>'}
                    <div class="ly-row">${it.next ? '<button type="button" class="button small secondary" data-ly-cmd="unchain">Couper après ce bloc</button>' : '<button type="button" class="button small secondary" data-ly-cmd="chain">➜ Chaîner vers un bloc…</button>'}<button type="button" class="button small secondary" data-ly-cmd="autoflow" title="Ajoute des pages (même gabarit) et des blocs chaînés jusqu’à ce que tout le texte tienne">⤵ Faire couler sur de nouvelles pages</button></div>`, list.length > 1 || !!it.auto);
                if (['places', 'jobs'].includes(it.auto)) h += sec(it.auto === 'places' ? '📍 Index des lieux' : '🔨 Index des métiers', `<p class="ly-help">Mots marqués avec le style de caractère « ${it.auto === 'places' ? 'Lieu' : 'Métier'} à indexer »${it.terms?.length ? `, et ${A().plural(it.terms.length, it.auto === 'places' ? 'lieu' : 'métier', it.auto === 'places' ? 'lieux' : 'métiers')} de ta base ${it.terms.length > 1 ? 'cherchés' : 'cherché'} dans le texte` : ''}. Rangé de A à Z, avec les pages.</p>${sel2('autoPs', 'Style des lignes', D.paraStyles.map(s0 => [s0.id, s0.name]), it.autoPs || 'ps-list')}<div class="ly-row"><button type="button" class="button small secondary" data-ly-idxterms>${it.terms?.length ? '↻ Recharger ceux de la base' : '＋ Chercher ceux de la base'}</button>${it.terms?.length ? '<button type="button" class="button small secondary" data-ly-idxtermsnone>Seulement les mots marqués</button>' : ''}</div>`);
                else if (['notes', 'biblio'].includes(it.auto)) h += sec(it.auto === 'notes' ? '🗒 Notes du chapitre' : '📚 Bibliographie', `<p class="ly-help">${it.auto === 'notes' ? 'Les notes appelées dans le chapitre où se trouve ce bloc s’y rangent toutes seules, numérotées (Document → Notes de bas de page).' : 'Les sources citées en note (« 📚 Citer une source ») s’y rangent toutes seules, de A à Z.'}</p>${sel2('autoPs', 'Style des lignes', D.paraStyles.map(s0 => [s0.id, s0.name]), it.autoPs || 'ps-list')}`);
                else if (it.auto) h += sec(it.auto === 'toc' ? '📑 Table des matières' : '🔤 Index des noms', it.auto === 'toc'
                    ? `<p class="ly-help">Elle reprend, dans l’ordre des pages, les paragraphes de ces styles (le 1er au premier niveau, les suivants en retrait) :</p><div class="ly-autost">${D.paraStyles.map(s0 => `<label class="ly-f ly-check"><input type="checkbox" data-ly-autost="${esc(s0.id)}" ${(it.autoStyles || []).includes(s0.id) ? 'checked' : ''}> ${esc(s0.name)}${(it.autoStyles || []).includes(s0.id) ? ` <small>(niveau ${(it.autoStyles || []).indexOf(s0.id) + 1})</small>` : ''}</label>`).join('')}</div>${sel2('autoPs', 'Style des lignes', D.paraStyles.map(s0 => [s0.id, s0.name]), it.autoPs || 'ps-body')}<label class="ui-toggle ly-f ly-check"><input type="checkbox" data-ly-set="autoDots" ${it.autoDots !== false ? 'checked' : ''}><i></i>Points de conduite (……… 12)</label>`
                    : `<p class="ly-help">Noms marqués avec le style de caractère « Nom à indexer »${it.names?.length ? `, et ${A().plural(it.names.length, 'personne')} de la généalogie ${it.names.length > 1 ? 'cherchées' : 'cherchée'} dans le texte` : ''}. Rangé par nom de famille, avec les pages.</p>${sel2('autoPs', 'Style des lignes', D.paraStyles.map(s0 => [s0.id, s0.name]), it.autoPs || 'ps-list')}<div class="ly-row"><button type="button" class="button small secondary" data-ly-idxnames>${it.names?.length ? '↻ Recharger les noms de la généalogie' : '＋ Chercher les noms de la généalogie'}</button>${it.names?.length ? '<button type="button" class="button small secondary" data-ly-idxnone>Seulement les noms marqués</button>' : ''}</div>`);
                if (it.dyn?.type === 'meteo') h += sec('🌦 Objet dynamique : météo', `<p class="ly-help">Cet encadré suit la météo d’un événement${it.dyn.at ? ` (${window.LCNDA_UI?.whenText?.(it.dyn.at, {label: 'mis à jour'}) || esc(it.dyn.at)})` : ''}. L’écrire à la main le détache.</p><div class="ly-row"><button type="button" class="button small" data-ly-dynupd>↻ Mettre à jour</button><button type="button" class="button small secondary" data-ly-dynedit>Changer l’événement…</button><button type="button" class="button small secondary" data-ly-dyndetach>Détacher</button></div>`);
                else if (it.dyn) h += sec('👤 Objet dynamique : fiche', `<p class="ly-help">Ce texte suit une fiche de la généalogie${it.dyn.at ? ` (${window.LCNDA_UI?.whenText?.(it.dyn.at, {label: 'mis à jour'}) || esc(it.dyn.at)})` : ''}. L’écrire à la main le détache.</p><div class="ly-row"><button type="button" class="button small" data-ly-dynupd>↻ Mettre à jour</button><button type="button" class="button small secondary" data-ly-dynedit>Changer la fiche ou ce qu’on montre…</button><button type="button" class="button small secondary" data-ly-dynopen>↗ Ouvrir la fiche</button><button type="button" class="button small secondary" data-ly-dyndetach>Détacher</button></div>`);
            }
            if (it) h += sec('Lien', `<label class="ly-f"><span>Adresse</span><input type="url" data-ly-set="link" value="${esc(it.link || '')}" placeholder="https://… (cliquable dans le PDF et le HTML)"></label>`, !!it.link);
            h += sec('Aligner et répartir', `<div class="ly-row">${[['l', '⇤', 'À gauche'], ['ch', '↔', 'Centrer'], ['r', '⇥', 'À droite'], ['t', '⤒', 'En haut'], ['cv', '↕', 'Au milieu'], ['b', '⤓', 'En bas']].map(([k, ic, t]) => `<button type="button" class="button small secondary" data-ly-align="${k}" title="${t}">${ic}</button>`).join('')}</div><div class="ly-row">${sel2('alignTo', 'Par rapport à', [['sel', 'la sélection'], ['margins', 'aux marges'], ['page', 'à la page']], dl.dataset.alignTo || (its.length > 1 ? 'sel' : 'margins'), 'data-ly-alignto')}</div>${its.length > 2 ? `<div class="ly-row"><button type="button" class="button small secondary" data-ly-dist="h">Répartir ↔</button><button type="button" class="button small secondary" data-ly-dist="v">Répartir ↕</button></div>` : ''}`, its.length > 1);
            const shp = its.filter(x => ['rect', 'ellipse', 'polygon', 'star', 'path', 'frame'].includes(x.type));
            h += sec('Pathfinder', shp.length >= 2 ? `<div class="ly-row">${[['union', '＋ Ajouter'], ['subtract', '⊖ Soustraire'], ['intersect', '⊗ Intersection'], ['exclude', '⊘ Exclure']].map(([k, l]) => `<button type="button" class="button small secondary" data-ly-pf="${k}">${l}</button>`).join('')}</div><p class="ly-help">Soustraire : les formes de devant découpent celle du fond.</p>` : (it?.type === 'compound' ? '<div class="ly-row"><button type="button" class="button small secondary" data-ly-pf="release">Décomposer</button></div>' : '<p class="ly-help">Choisis au moins deux formes (Maj + clic).</p>'), false);
            h += sec('Disposition', `<div class="ly-row"><button type="button" class="button small secondary" data-ly-cmd="front">Premier plan</button><button type="button" class="button small secondary" data-ly-cmd="fwd">Avancer</button><button type="button" class="button small secondary" data-ly-cmd="back">Reculer</button><button type="button" class="button small secondary" data-ly-cmd="bottom">Arrière-plan</button></div><div class="ly-row"><button type="button" class="button small secondary" data-ly-cmd="lock">${its.every(x => x.locked) ? '🔓 Déverrouiller' : '🔒 Verrouiller'}</button><button type="button" class="button small secondary" data-ly-cmd="dup">Dupliquer</button><button type="button" class="button small secondary danger" data-ly-cmd="del">Supprimer</button></div>`, false);
            return h;
        }
        function panelText() {
            const it = one(), ed = !!editingId, fonts = fontList();
            const fontPick = `<label class="ly-f ly-f-font"><span>Police</span>${fontPickHtml('data-ly-char="font-family"')}</label>`;
            const charSec = sec('Caractère', `${fontPick}<div class="ly-grid2">${sel2('font-weight', 'Graisse', [['', '—'], ['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold'], ['900', 'Black']], '', 'data-ly-char')}${sel2('font-style', 'Style', [['', '—'], ['normal', 'Romain'], ['italic', 'Italique']], '', 'data-ly-char')}${num('font-size', 'Corps', '', {min: 3, max: 400, step: 0.5, unit: 'pt', attr: 'data-ly-char'})}${num('line-height', 'Interlignage', '', {min: 3, max: 400, step: 0.5, unit: 'pt', attr: 'data-ly-char'})}${num('letter-spacing', 'Approche', '', {min: -200, max: 1000, step: 5, unit: '‰', attr: 'data-ly-char'})}${num('top', 'Ligne de base', '', {min: -100, max: 100, step: 0.5, unit: 'pt', attr: 'data-ly-char'})}${sel2('caps', 'Capitales', [['', '—'], ['none', 'Normales'], ['small', 'Petites capitales'], ['all', 'Toutes capitales']], '', 'data-ly-char')}${sel2('font-kerning', 'Crénage', [['', '—'], ['auto', 'Automatique'], ['none', 'Aucun']], '', 'data-ly-char')}</div>
                <div class="ly-row ly-tbtns"><button type="button" data-ly-exec="bold" title="Gras"><b>G</b></button><button type="button" data-ly-exec="italic" title="Italique"><i>I</i></button><button type="button" data-ly-exec="underline" title="Souligné"><u>S</u></button><button type="button" data-ly-exec="strikeThrough" title="Barré"><s>B</s></button><button type="button" data-ly-exec="superscript" title="Exposant">x²</button><button type="button" data-ly-exec="subscript" title="Indice">x₂</button><button type="button" data-ly-exec="removeFormat" title="Enlever la mise en forme">⌫</button></div>
                <label class="ly-f"><span>Couleur</span><select data-ly-char="color"><option value="">Nuancier…</option>${D.swatches.filter(s => s.type !== 'grad').map(s => `<option value="${esc(s.c)}">■ ${esc(s.name)}</option>`).join('')}</select></label>
                <div class="ly-colorfree"><span>Couleur libre</span><input type="color" data-ly-char="color" value="${esc(lastTextColor)}" title="Choisir n’importe quelle couleur"><input type="text" data-ly-hex value="${esc(lastTextColor)}" maxlength="7" spellcheck="false" title="Code couleur, ex. #7a2e2e"><div class="ly-swmini">${D.swatches.filter(s => s.type !== 'grad').map(s => `<button type="button" data-ly-tcol="${esc(s.c)}" title="${esc(s.name)}" style="background:${esc(s.c)}"></button>`).join('')}</div></div>`);
            const paraSec = sec('Paragraphe', `<div class="ly-row ly-tbtns">${[['left', '⯇', 'À gauche'], ['center', '≡', 'Centré'], ['right', '⯈', 'À droite'], ['justify', '☰', 'Justifié'], ['justify-all', '▤', 'Justifié, dernière ligne aussi']].map(([k, ic, t]) => `<button type="button" data-ly-palign="${k}" title="${t}">${ic}</button>`).join('')}</div>
                <div class="ly-grid2">${num('margin-left', 'Retrait gauche', '', {attr: 'data-ly-para'})}${num('margin-right', 'Retrait droit', '', {attr: 'data-ly-para'})}${num('text-indent', '1re ligne', '', {attr: 'data-ly-para'})}${num('margin-top', 'Espace avant', '', {attr: 'data-ly-para'})}${num('margin-bottom', 'Espace après', '', {attr: 'data-ly-para'})}${sel2('hyphens', 'Césure', [['', '—'], ['auto', 'Oui'], ['manual', 'Non']], '', 'data-ly-para')}</div>
                <div class="ly-row"><button type="button" class="button small secondary" data-ly-exec="insertUnorderedList">• Liste</button><button type="button" class="button small secondary" data-ly-exec="insertOrderedList">1. Liste</button><button type="button" class="button small secondary" data-ly-link>🔗 Lien</button></div>
                <div class="ly-row"><button type="button" class="button small secondary" data-ly-cmd="fnote" title="Une note numérotée toute seule, à l’endroit du curseur">¹ Note</button><button type="button" class="button small secondary" data-ly-cmd="cite" title="La référence d’une source de ta base, en note">📚 Citer une source</button><button type="button" class="button small secondary" data-ly-cmd="comment" title="Un commentaire de relecture sur les mots choisis">💬 Commenter</button><button type="button" class="button small secondary" data-ly-cmd="suggest" title="Proposer un autre texte à la place des mots choisis">✎ Suggérer</button></div>
                <div class="ly-row"><span class="ly-help">Insérer :</span>${[['{page}', 'n° de page'], ['{pages}', 'nb de pages'], ['{titre}', 'titre'], ['—', 'tiret'], ['« ', '«'], [' »', '»'], [' ', 'espace insécable'], ['…', '…'], ['❦', '❦']].map(([v, l]) => `<button type="button" class="button small secondary" data-ly-ins="${esc(v)}" title="${esc(l)}">${esc(l.length > 3 ? l : v.trim() || l)}</button>`).join('')}</div>`);
            const styles = sec('Styles de paragraphe', `<div class="ly-styles">${D.paraStyles.map(s => `<div class="ly-srow"><button type="button" data-ly-pstyle="${esc(s.id)}" style="font-family:'${fontOk(s.font)}';color:${colorOf(D, s.color, '#111')}">${esc(s.name)}</button><button type="button" class="icon-button small" data-ly-pstedit="${esc(s.id)}" title="Modifier le style (tout le livre suit)">✎</button></div>`).join('')}</div><div class="ly-row"><button type="button" class="button small secondary" data-ly-psnew>＋ Nouveau style</button></div>`)
                + sec('Styles de caractère', `<div class="ly-styles">${D.charStyles.map(s => `<div class="ly-srow"><button type="button" data-ly-cstyle="${esc(s.id)}">${esc(s.name)}</button><button type="button" class="icon-button small" data-ly-cstedit="${esc(s.id)}" title="Modifier">✎</button></div>`).join('')}<div class="ly-srow"><button type="button" data-ly-cstyle="">Aucun (enlever)</button></div></div><div class="ly-row"><button type="button" class="button small secondary" data-ly-csnew>＋ Nouveau style</button></div>`, false);
            const intro = ed ? '<p class="ly-help">✏️ Tu écris dans un bloc : les réglages s’appliquent au texte choisi (sinon au paragraphe ou à tout le bloc). Échap pour sortir.</p>' : it?.type === 'text' ? '<p class="ly-help">Bloc choisi : les réglages s’appliquent à tout son texte. Double-clic pour écrire dedans.</p>' : '<p class="ly-help">Choisis un bloc de texte (outil T pour en tracer un).</p>';
            // les notes appelées dans ce bloc : les relire, les changer, les retirer
            const tgt = ed ? findItem(editingId)?.it : it?.type === 'text' ? chainHead(it) : null, ids = tgt ? [...String((ed ? editEl()?.innerHTML : tgt.html) || '').matchAll(/data-fn="([a-z0-9_-]+)"/gi)].map(m => m[1]) : [];
            const notesSec = ids.length ? sec(`Notes de ce bloc (${ids.length})`, `<ol class="ly-fnlist">${ids.map(k => `<li><span>${esc(D.notes?.[k]?.text || '…')}${D.notes?.[k]?.src ? ' <small>📚</small>' : ''}</span><button type="button" class="icon-button small" data-ly-fnedit="${esc(k)}" title="Modifier la note">✎</button><button type="button" class="icon-button small" data-ly-fndel="${esc(k)}" title="Retirer la note">✕</button></li>`).join('')}</ol>`) : '';
            return intro + charSec + paraSec + notesSec + styles;
        }
        function panelColor() {
            const it = one(), target = fillTarget, cur0 = it ? (target === 'fill' ? it.fill : it.stroke?.c) : '';
            const gr = D.swatches.find(s => s.id === dl.dataset.grad && s.type === 'grad');
            return `<div class="ly-row"><button type="button" class="button small ${target === 'fill' ? '' : 'secondary'}" data-ly-target="fill">■ Fond</button><button type="button" class="button small ${target === 'stroke' ? '' : 'secondary'}" data-ly-target="stroke">□ Contour</button><button type="button" class="button small ${target === 'text' ? '' : 'secondary'}" data-ly-target="text">A Texte</button></div>`
                + sec('Nuancier', `<div class="ly-swatches"><button type="button" class="ly-sw is-none${cur0 === 'none' ? ' is-cur' : ''}" data-ly-sw="none" title="Aucun"></button>${D.swatches.map(s => `<button type="button" class="ly-sw${cur0 === s.id ? ' is-cur' : ''}" data-ly-sw="${esc(s.id)}" title="${esc(s.name)}" style="background:${cssPaint(D, s.id)}"></button>`).join('')}</div>
                    <div class="ly-swlist">${D.swatches.map(s => `<div class="ly-swrow"><i style="background:${cssPaint(D, s.id)}"></i><span>${esc(s.name)}</span>${s.type === 'grad' ? `<button type="button" class="icon-button small" data-ly-gedit="${esc(s.id)}" title="Modifier le dégradé">✎</button>` : `<input type="color" value="${esc(s.c)}" data-ly-swc="${esc(s.id)}" title="Changer la couleur (tout le livre suit)">`}<button type="button" class="icon-button small" data-ly-swren="${esc(s.id)}" title="Renommer">Aa</button>${s.id === 'sw-paper' ? '' : `<button type="button" class="icon-button small" data-ly-swdel="${esc(s.id)}" title="Supprimer">🗑</button>`}</div>`).join('')}</div>
                    <div class="ly-row"><input type="color" data-ly-newc value="#336699"><button type="button" class="button small secondary" data-ly-swnew>＋ Ajouter la couleur</button><button type="button" class="button small secondary" data-ly-grnew>＋ Nouveau dégradé</button></div>`)
                + (gr ? sec(`Dégradé « ${gr.name} »`, `${sel2('kind', 'Type', [['linear', 'Linéaire'], ['radial', 'Radial']], gr.kind, 'data-ly-gset')}${num('angle', 'Angle', gr.angle || 0, {min: -360, max: 360, step: 1, unit: '°', attr: 'data-ly-gset'})}<div class="ly-gbar" style="background:${cssPaint(D, gr.id)}"></div>${gr.stops.map((st, i) => `<div class="ly-grow"><input type="color" value="${st.c}" data-ly-gstop="${i}" data-k="c"><input type="range" min="0" max="100" value="${st.p}" data-ly-gstop="${i}" data-k="p"><span>${st.p} %</span>${gr.stops.length > 2 ? `<button type="button" class="icon-button small" data-ly-gdel="${i}">✕</button>` : ''}</div>`).join('')}<div class="ly-row"><button type="button" class="button small secondary" data-ly-gadd>＋ Arrêt de couleur</button></div>`) : '')
                + sec('Couleur libre', `<div class="ly-row"><input type="color" data-ly-free value="${hexOk(cur0) ? cur0 : '#888888'}"><span class="ly-help">pour l’objet choisi, sans l’ajouter au nuancier</span></div>`, false);
        }
        function panelLinks() {
            const rows = []; D.pages.forEach((p, i) => p.items.forEach(it => { if (it.src !== undefined && it.type === 'frame') rows.push({i, it}); })); D.masters.forEach(m => m.items.forEach(it => { if (it.type === 'frame') rows.push({i: -1, m, it}); }));
            const dyn = [], trs = []; D.pages.forEach((p, i) => p.items.forEach(it => { if (it.dyn) dyn.push({i, it}); if (it.tree) trs.push({i, it}); }));
            return `<div class="ly-row"><button type="button" class="button small" data-ly-cmd="relink">↻ Mettre à jour les objets dynamiques</button></div>` + (trs.length ? sec(`Arbres (${trs.length})`, `<div class="ly-links">${trs.map(({i, it}) => `<div class="ly-linkrow"><span class="ly-noimg">🌳</span><span><b>${esc(it.srcName || 'Arbre')}</b><small>page ${i + (D.page.start || 1)} · ${linkState[it.id] === 'missing' ? '⛔ personne introuvable' : 'suit la base'}</small></span><button type="button" class="button small secondary" data-ly-linkgo="${i}:${esc(it.id)}">Aller</button></div>`).join('')}</div>`) : '') + (dyn.length ? sec(`Textes liés à des fiches (${dyn.length})`, `<div class="ly-links">${dyn.map(({i, it}) => `<div class="ly-linkrow"><span class="ly-noimg">👤</span><span><b>${esc(plainOf(it.html).slice(0, 60))}</b><small>page ${i + (D.page.start || 1)} · ${linkState[it.id] === 'missing' ? '⛔ fiche introuvable' : 'suit la fiche'}</small></span><button type="button" class="button small secondary" data-ly-linkgo="${i}:${esc(it.id)}">Aller</button></div>`).join('')}</div>`) : '') + sec(`Liens — images placées (${rows.filter(r => r.it.src).length})`, rows.length ? `<div class="ly-links">${rows.map(({i, m, it}) => `<div class="ly-linkrow">${it.src ? `<img src="${esc(it.src)}" alt="">` : '<span class="ly-noimg">vide</span>'}<span><b>${esc(it.srcName || (it.src?.startsWith('data:') ? 'Image intégrée' : it.src?.replace('media/', '') || 'Cadre vide'))}</b><small>${m ? esc(m.name) : `page ${i + (D.page.start || 1)}`} · ${it.src?.startsWith('data:') ? 'intégrée au document' : it.mediaId ? ({missing: '⛔ introuvable', updated: '🔗 liée · mise à jour'}[linkState[it.id]] || '🔗 liée · à jour') : it.src ? 'photo de la base' : '—'}</small></span>${it.mediaId && !m ? `<button type="button" class="button small secondary" data-ly-editorig2="${esc(it.id)}" title="Retoucher la photo de l’app">✏️</button>` : ''}${m ? '' : `<button type="button" class="button small secondary" data-ly-linkgo="${i}:${esc(it.id)}">Aller</button><button type="button" class="button small secondary" data-ly-linkrep="${i}:${esc(it.id)}">Remplacer</button>`}</div>`).join('')}</div>` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🖼️</span><span class="empty-line-text">Aucun cadre d’image : outil ⊠ ou Objet → Placer une image.</span></p>');
        }
        function panelHistory() {
            const t = d => d.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
            return sec(`Historique (${timeline.length} étape${timeline.length > 1 ? 's' : ''})`, `<div class="ly-row"><button type="button" class="button small secondary" data-ly-cmd="undo" ${pos <= 0 ? 'disabled' : ''}>↶ Annuler</button><button type="button" class="button small secondary" data-ly-cmd="redo" ${pos >= timeline.length - 1 ? 'disabled' : ''}>↷ Rétablir</button></div>
                <p class="ly-help">Clique sur une étape pour revenir à ce moment-là. Les étapes d’après restent (en gris) tant que tu ne modifies rien d’autre.</p>
                <ol class="ly-history">${timeline.map((h, i) => `<li class="${i === pos ? 'is-current' : i > pos ? 'is-future' : ''}"><button type="button" data-ly-hist="${i}"><span>${esc(h.label)}</span><small>${t(h.at)}</small></button></li>`).join('')}</ol>`);
        }
        function panelDoc() {
            const P = D.page, M = P.margin;
            return sec('Format du document', `<label class="ly-f"><span>Titre du livre ({titre})</span><input type="text" data-ly-doc="title" value="${esc(D.title || '')}"></label>
                <p class="ly-help"><button type="button" class="button small secondary" data-ly-cmd="docformat">📐 Format du document…</button> <button type="button" class="button small secondary" data-ly-cmd="docinfo">ℹ️ Informations…</button></p>
                <label class="ly-f"><span>Format</span><select data-ly-doc="size"><option value="">Personnalisé</option>${allSizes().map(([k, l, w, h]) => `<option value="${k}" ${Math.abs(P.w - w) < 0.2 && Math.abs(P.h - h) < 0.2 ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <div class="ly-grid2">${num('w', 'Largeur', P.w, {min: 30, max: 1500, attr: 'data-ly-doc'})}${num('h', 'Hauteur', P.h, {min: 30, max: 1500, attr: 'data-ly-doc'})}${num('m.t', 'Haut', M.t, {min: 0, max: 300, attr: 'data-ly-doc'})}${num('m.b', 'Bas', M.b, {min: 0, max: 300, attr: 'data-ly-doc'})}${num('m.i', P.facing ? 'Petit fond' : 'Gauche', M.i, {min: 0, max: 300, attr: 'data-ly-doc'})}${num('m.o', P.facing ? 'Grand fond' : 'Droite', M.o, {min: 0, max: 300, attr: 'data-ly-doc'})}${num('columns', 'Colonnes', P.columns, {min: 1, max: 12, step: 1, unit: '', attr: 'data-ly-doc'})}${num('gutter', 'Gouttière', P.gutter, {min: 0, max: 60, attr: 'data-ly-doc'})}${num('bleed', help('Fond perdu', 'La marge de 3 à 5 mm autour de la page, coupée par l’imprimeur : les images qui vont jusqu’au bord doivent la remplir.', 'fond perdu'), P.bleed, {min: 0, max: 30, attr: 'data-ly-doc'})}${num('slug', help('Ligne-bloc', 'Une bande en dehors du fond perdu pour les notes à l’imprimeur (titre, date) ; elle ne s’imprime qu’avec les traits de coupe.'), P.slug || 0, {min: 0, max: 80, attr: 'data-ly-doc'})}${num('start', '1re page n°', P.start || 1, {min: 1, max: 9999, step: 1, unit: '', attr: 'data-ly-doc'})}</div>
                <label class="ui-toggle ly-f ly-check"><input type="checkbox" data-ly-doc="facing" ${P.facing ? 'checked' : ''}><i></i>Pages en vis-à-vis (livre)</label>${paintSel('paper', 'Papier', P.paper).replace('data-ly-set="paper"', 'data-ly-doc="paper"')}
                <p class="ly-help">Les nouveaux documents partent des <button type="button" class="link-button" data-ly-defaults>réglages par défaut</button>.</p>`)
                + sec('Notes de bas de page', `${sel2('fnplace', help('Les notes vont', 'En bas du bloc : chaque note s’écrit sous le texte qui l’appelle. En fin de chapitre : toutes les notes du chapitre se rangent dans le bloc « Notes du chapitre » (Objet → Insérer les notes du chapitre).', 'notes de bas de page'), [['block', 'en bas du bloc de texte'], ['chapter', 'en fin de chapitre']], D.fn?.place || 'block', 'data-ly-fn')}${sel2('fnrestart', 'Numéros', [['none', 'qui se suivent dans tout le livre'], ['chapter', 'qui recommencent à 1 à chaque chapitre'], ['page', 'qui recommencent à 1 à chaque page']], D.fn?.restart || 'none', 'data-ly-fn')}
                    <p class="ly-help">${A().plural(Object.keys(D.notes || {}).length, 'note')} dans le document. Pour en ajouter une : double-clic dans un texte, place le curseur, puis Texte → « ¹ Note » ou « 📚 Citer une source ».</p>`, false);
        }

        /* — panneaux : ce qu'on change — */
        const setPath = (o, k, v) => { const ks = k.split('.'); let t = o; ks.slice(0, -1).forEach(x => { t[x] = t[x] && typeof t[x] === 'object' ? t[x] : {}; t = t[x]; }); t[ks.at(-1)] = v; };
        const labelOfField = el => (el.closest('label')?.querySelector('span')?.textContent || el.closest('label')?.firstChild?.textContent || '').trim();
        pbody.addEventListener('change', async e => {
            if (e.target.matches('[data-ly-fn]')) { D.fn = {place: 'block', restart: 'none', ...(D.fn || {})}; if (e.target.dataset.lyFn === 'fnplace') D.fn.place = e.target.value; else D.fn.restart = e.target.value; commit('Notes de bas de page : réglage'); render(); return; }
            if (e.target.matches('[data-ly-reviewer]')) { try { localStorage.setItem(REVIEWER_KEY, e.target.value.trim().slice(0, 60)); } catch (_) {} return; }
            if (e.target.matches('[data-ly-autost]')) { const it = one(); if (!it) return; const k = e.target.dataset.lyAutost; it.autoStyles = (it.autoStyles || []).filter(x => x !== k); if (e.target.checked) it.autoStyles.push(k); commit('Sommaire : styles'); render(); return; }
            if (e.target.matches('[data-ly-pmaster]')) { const v = e.target.value, m = D.masters.find(x => x.id === v); D.pages[cur].master = m ? m.id : ''; act = m ? `Gabarit « ${m.name} » sur la page ${cur + 1}` : `Gabarit enlevé de la page ${cur + 1}`; commit(); render(); return; }
            const el = e.target; act = labelOfField(el) ? `${labelOfField(el)} changé` : '';
            if (el.matches('[data-ly-set]')) {
                const k = el.dataset.lySet; let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
                if (el.type === 'number' && (el.value.trim() === '' || !Number.isFinite(v))) { renderPanel(); return; } // case vidée : on garde la valeur d'avant (pas 0)
                if (el.type === 'number') v = clamp(v, el.min === '' ? -1e5 : Number(el.min), el.max === '' ? 1e5 : Number(el.max)); // pas de taille négative, d'opacité à 500 %…
                const its = selected().filter(x => !locked(x)); if (!its.length) return;
                its.forEach(it => {
                    if (k === 'shadow.on' && v && !it.shadow) it.shadow = {on: true, x: 1.5, y: 1.5, blur: 2, c: '#000000', o: 50};
                    else if (k === 'wrap.mode' && !it.wrap) it.wrap = {mode: v, off: 3};
                    else if (k === 'w' && it.lockRatio && it.w) { it.h = r1(it.h * v / it.w); it.w = v; }
                    else if (k === 'h' && it.lockRatio && it.h) { it.w = r1(it.w * v / it.h); it.h = v; }
                    else if (k === 'link') { if (v && !/^(https?:\/\/|mailto:)/i.test(v)) { toast('Une adresse commence par https:// ou mailto:', 'error'); return; } if (v) it.link = v; else delete it.link; }
                    else setPath(it, k, v);
                });
                commit(); render(); return;
            }
            if (el.matches('[data-ly-doc]')) {
                const k = el.dataset.lyDoc, v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
                if (el.type === 'number' && (el.value.trim() === '' || !Number.isFinite(v))) { renderPanel(); return; }
                if (k === 'w' || k === 'h') { D.page[k] = clamp(v, 30, 1500); commit(); render(); return; } // une page de 0 mm casserait tout l'atelier
                if (k === 'size') { const s0 = allSizes().find(x => x[0] === v); if (s0) { D.page.w = s0[2]; D.page.h = s0[3]; } }
                else if (k === 'title') D.title = String(v).slice(0, 200);
                else if (k.startsWith('m.')) D.page.margin[k.slice(2)] = clamp(v, 0, 300);
                else D.page[k] = k === 'facing' ? !!v : k === 'paper' ? v : clamp(v, k === 'columns' || k === 'start' ? 1 : 0, 1500);
                commit(); render(); return;
            }
            if (el.matches('[data-ly-char]')) { // caractère
                const k = el.dataset.lyChar, v = el.value; if (v === '') return;
                const map = {'font-family': `"${fontOk(v)}"`, 'font-size': `${r1(Number(v) * PT)}px`, 'line-height': `${r1(Number(v) * PT)}px`, 'letter-spacing': `${Number(v) / 1000}em`, top: `${r1(-Number(v) * PT)}px`};
                if (k === 'caps') return applyChar(v === 'small' ? {'font-variant-caps': 'small-caps', 'text-transform': 'none'} : v === 'all' ? {'text-transform': 'uppercase', 'font-variant-caps': 'normal'} : {'text-transform': 'none', 'font-variant-caps': 'normal'});
                if (k === 'top') return applyChar({position: 'relative', top: map.top});
                if (k === 'color') { if (!hexOk(v)) return; lastTextColor = v; pbody.querySelectorAll('[data-ly-hex]').forEach(x => { x.value = v; }); pbody.querySelectorAll('input[type=color][data-ly-char=color]').forEach(x => { x.value = v; }); }
                if (k === 'font-family') { try { const mine = JSON.parse(localStorage.getItem(FONTS_KEY) || '[]'); if (!fontList().includes(v)) localStorage.setItem(FONTS_KEY, JSON.stringify([...new Set([fontOk(v), ...mine])].slice(0, 60))); } catch (_) {} }
                return applyChar({[k]: map[k] || v});
            }
            if (el.matches('[data-ly-hex]')) { let v = el.value.trim(); if (!v.startsWith('#')) v = '#' + v; if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + [...v.slice(1)].map(c => c + c).join(''); if (!hexOk(v)) return msg('Code couleur : # suivi de 6 chiffres ou lettres (ex. #7a2e2e).'); v = v.toLowerCase(); lastTextColor = v; el.value = v; const c = pbody.querySelector('input[type=color][data-ly-char=color]'); if (c) c.value = v; return applyChar({color: v}); }
            if (el.matches('[data-ly-para]')) { const k = el.dataset.lyPara, v = el.value; if (v === '') return; applyPara(b => paraCss(b, k, k === 'hyphens' ? v : `${px(Number(v))}px`)); return; }
            if (el.matches('[data-ly-gset]')) { const g = D.swatches.find(s => s.id === dl.dataset.grad); if (!g) return; g[el.dataset.lyGset] = el.type === 'number' ? Number(el.value) : el.value; commit(); render(); return; }
            if (el.matches('[data-ly-gstop]')) { const g = D.swatches.find(s => s.id === dl.dataset.grad); if (!g) return; const st = g.stops[Number(el.dataset.lyGstop)]; if (!st) return; st[el.dataset.k] = el.dataset.k === 'p' ? Number(el.value) : el.value; g.stops.sort((a, b) => a.p - b.p); commit(); render(); return; }
            if (el.matches('[data-ly-swc]')) { const s0 = swatch(D, el.dataset.lySwc); if (s0) { s0.c = el.value; commit(); render(); } return; }
            if (el.matches('[data-ly-free]')) { applyPaint(el.value); return; }
            if (el.matches('[data-ly-lmove]')) { selected().forEach(it => { it.layer = el.value; }); commit(); render(); return; }
            if (el.matches('[data-ly-alignto]')) { dl.dataset.alignTo = el.value; return; }
            if (el.matches('[data-ly-goto2]')) { goPage(Number(el.value) - 1); }
        });
        pbody.addEventListener('mousedown', e => { if (e.target.closest('[data-ly-exec],[data-ly-palign],[data-ly-ins],[data-ly-pstyle],[data-ly-cstyle],[data-ly-link],[data-ly-tcol]')) e.preventDefault(); }); // garder la sélection du texte
        pbody.addEventListener('click', async e => {
            const ch = e.target.closest('[data-ly-chaingo]'); if (ch) { const pi = pageOfItem(ch.dataset.lyChaingo); goPage(pi); sel = [ch.dataset.lyChaingo]; drawSel(); renderPanel(); return; }
            if (e.target.closest('[data-ly-editorig]')) return editOriginal(one());
            const eo2 = e.target.closest('[data-ly-editorig2]'); if (eo2) return editOriginal(findItem(eo2.dataset.lyEditorig2)?.it);
            if (e.target.closest('[data-ly-editdg]')) { const it = one(); if (it?.diagramId) ext.openDiagramEditor?.(it.diagramId, {onSave: () => refreshLinks(false)}); return; }
            if (e.target.closest('[data-ly-unlinkimg]')) { const it = one(); if (it) { delete it.mediaId; commit('Image incorporée'); render(); } return; }
            if (e.target.closest('[data-ly-dynupd]')) { const it = one(); if (it?.dyn) { it.html = await dynHtmlOf(it.dyn); it.dyn.at = new Date().toISOString().slice(0, 16); commit('Texte de la fiche mis à jour'); render(); } return; }
            if (e.target.closest('[data-ly-dynedit]')) return one()?.dyn?.type === 'meteo' ? meteoDialog(one()) : dynPersonDialog(one());
            if (e.target.closest('[data-ly-dynopen]')) { const it = one(); if (it?.dyn) { A().state.currentPersonId = it.dyn.id; if (!dirty || await A().confirmBox('Les dernières modifications ne sont pas enregistrées (enregistre d’abord si besoin).', {title: 'Fermer la mise en page pour ouvrir la fiche ?', okLabel: 'Fermer sans enregistrer', danger: true})) { keyAc.abort(); dl.close(); A().setModule('personnes'); } } return; }
            if (e.target.closest('[data-ly-dyndetach]')) { const it = one(); if (it) { delete it.dyn; commit('Texte détaché de la fiche'); render(); } return; }
            if (e.target.closest('[data-ly-idxnames]')) { const it = one(); try { const r = await api('person_names'); it.names = (r.persons || []).map(p => `${p.first_name || ''}|${p.last_name || ''}`); commit('Index : noms de la généalogie'); render(); } catch (err) { toast(err.message, 'error'); } return; }
            if (e.target.closest('[data-ly-idxnone]')) { const it = one(); delete it.names; commit('Index : noms marqués seulement'); render(); return; }
            const fe = e.target.closest('[data-ly-fnedit]'); if (fe) return editNote(fe.dataset.lyFnedit);
            const fdl = e.target.closest('[data-ly-fndel]'); if (fdl) return editNote(fdl.dataset.lyFndel, true);
            if (e.target.closest('[data-ly-idxterms]')) { const it = one(); if (!it) return; try { const r = await api('layout_index_terms'); it.terms = (it.auto === 'places' ? r.places : r.jobs) || []; commit('Index : mots de la base'); render(); } catch (err) { toast(err.message, 'error'); } return; }
            if (e.target.closest('[data-ly-idxtermsnone]')) { const it = one(); if (it) { delete it.terms; commit('Index : mots marqués seulement'); render(); } return; }
            if (e.target.closest('[data-ly-treeedit]')) return treeDialog(one());
            if (e.target.closest('[data-ly-qredit]')) return qrDialog(one());
            if (e.target.closest('[data-ly-treeupd]')) { const it = one(); if (!it?.tree) return; msg('🌳 Je redessine l’arbre…'); try { const r = await treeSvg(it.tree, lookOf()); it.src = svgSrc(r.svg); it.srcName = r.name; it.tree.at = new Date().toISOString().slice(0, 16); linkState[it.id] = 'ok'; commit('Arbre mis à jour'); render(); msg('🌳 Arbre à jour d’après la base.'); } catch (err) { linkState[it.id] = 'missing'; msg(''); toast(err.message, 'error'); } return; }
            if (e.target.closest('[data-ly-treedetach]')) { const it = one(); if (it?.tree) { delete it.tree; commit('Arbre détaché de la base'); render(); } return; }
            if (e.target.closest('[data-ly-treeopen]')) { const it = one(); if (!it?.tree) return; if (!dirty || await A().confirmBox('Les dernières modifications ne sont pas enregistrées (enregistre d’abord si besoin).', {title: 'Fermer la mise en page pour ouvrir la fiche ?', okLabel: 'Fermer sans enregistrer', danger: true})) { A().state.currentPersonId = it.tree.root; keyAc.abort(); dl.close(); A().setModule('personnes'); } return; }
            const cmf = e.target.closest('[data-ly-cmf]'); if (cmf) { dl.dataset.cmf = cmf.dataset.lyCmf; renderPanel(); return; }
            const cmEl = e.target.closest('[data-ly-cm]'), cB = e.target.closest('button');
            if (cmEl && cB) {
                const c = comments().find(x => x.id === cmEl.dataset.lyCm); if (!c) return;
                if (cB.matches('[data-ly-cmacc]')) return applySuggestion(c, true);
                if (cB.matches('[data-ly-cmref]')) return applySuggestion(c, false);
                if (cB.matches('[data-ly-cmreply]')) { const v = await askBox('↩ Répondre', `Ta réponse à ${c.author} :`, '', 'Répondre'); if (!v || !v.trim()) return; c.replies.push({id: nid('r'), text: v.trim().slice(0, 4000), author: await reviewer(), at: new Date().toISOString()}); focusCm = c.id; commit('Réponse ajoutée'); render(); return; }
                if (cB.matches('[data-ly-cmres]')) { if (editingId) stopEditing(); c.resolved = !c.resolved; if (c.resolved) unwrapCm(c.id); else { delete c.status; wrapQuote(findItem(c.item)?.it, c.quote, c.id); } focusCm = c.id; commit(c.resolved ? 'Commentaire résolu' : 'Commentaire rouvert'); render(); return; }
                if (cB.matches('[data-ly-cmgo]')) { const pi = pageOfItem(c.item); if (pi >= 0) { focusCm = c.id; goPage(pi); sel = [c.item]; drawSel(); } return; }
                if (cB.matches('[data-ly-cmdel]')) { if (editingId) stopEditing(); unwrapCm(c.id); D.review.comments = comments().filter(x => x !== c); commit('Commentaire supprimé'); render(); undoable('Commentaire supprimé'); return; }
            }
            const b = e.target.closest('button, [data-ly-lpick]'); if (!b) return; const d = b.dataset;
            // double-clic sur le nom d'un calque : le renommer (le premier clic redessine la liste, le dblclick natif se perd)
            if (d.lyLpick !== undefined && e.detail === 2) { const l = D.layers.find(x => x.id === b.closest('[data-ly-layer]')?.dataset.lyLayer), v = await ask('Nom du calque :', l?.name); if (l && v) { l.name = v.slice(0, 60); commit(); renderPanel(); } return; }
            act = (b.title || b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50);
            if (d.lyHist !== undefined) return goTo(Number(d.lyHist));
            if (d.lyPage !== undefined) return goPage(Number(d.lyPage));
            if (d.lyExec) { if (!editEl()) { if (one()?.type === 'text') { startEditing(one()); msg('Choisis du texte, puis le bouton.'); } return; } restoreRange(); document.execCommand('styleWithCSS', false, true); document.execCommand(d.lyExec, false, null); const f = findItem(editingId); if (f) f.it.html = readEditing(editEl()); setDirty(); return; }
            if (d.lyTcol) { lastTextColor = d.lyTcol; pbody.querySelectorAll('[data-ly-hex], input[type=color][data-ly-char=color]').forEach(x => { x.value = d.lyTcol; }); return applyChar({color: d.lyTcol}); }
            if (d.lyLink !== undefined) { if (!editEl()) return msg('Choisis du texte dans un bloc.'); const u = await ask('Adresse du lien (https://…) :', 'https://'); if (!u || !/^(https?:\/\/|mailto:)/i.test(u)) return; restoreRange(); document.execCommand('createLink', false, u); const f = findItem(editingId); if (f) f.it.html = readEditing(editEl()); setDirty(); return; }
            if (d.lyIns !== undefined) { if (!editEl()) return msg('Double-clic dans un bloc de texte d’abord.'); restoreRange(); document.execCommand('insertText', false, d.lyIns); return; }
            if (d.lyPalign) return applyPara(bk => { paraCss(bk, 'text-align', d.lyPalign === 'justify-all' ? 'justify' : d.lyPalign); if (d.lyPalign === 'justify-all') paraCss(bk, 'text-align-last', 'justify'); else bk.style.removeProperty('text-align-last'); });
            if (d.lyPstyle) return applyPara(bk => { bk.setAttribute('data-ps', d.lyPstyle); });
            if (d.lyCstyle !== undefined) { const t = editEl(), r = restoreRange(); if (!t || !r || r.collapsed) return msg('Choisis des mots dans un bloc de texte.'); if (!d.lyCstyle) { t.querySelectorAll('[data-cs]').forEach(x => { if (r.intersectsNode(x)) x.replaceWith(...x.childNodes); }); } else { const frag = r.extractContents(); const sp = document.createElement('span'); sp.setAttribute('data-cs', d.lyCstyle); sp.appendChild(frag); r.insertNode(sp); } const f = findItem(editingId); if (f) f.it.html = readEditing(t); setDirty(); return; }
            if (d.lyPstedit || d.lyPsnew !== undefined) return editStyle('para', d.lyPstedit);
            if (d.lyCstedit || d.lyCsnew !== undefined) return editStyle('char', d.lyCstedit);
            if (d.lyLocalfonts !== undefined) { if (typeof window.queryLocalFonts !== 'function') return toast('Ce navigateur ne sait pas lister les polices de l’ordinateur : tape le nom de la police.', 'error'); try { localFonts = [...new Set((await window.queryLocalFonts()).map(f => f.family))].sort((a, c) => a.localeCompare(c, 'fr')); toast(`${A().plural(localFonts.length, 'police')} de l’ordinateur ${localFonts.length > 1 ? 'ajoutées' : 'ajoutée'} à la liste.`); renderPanel(); } catch (_) { toast('Accès aux polices refusé.', 'error'); } return; }
            if (d.lySw) return applyPaint(d.lySw);
            if (d.lySwnew !== undefined) { const c = pbody.querySelector('[data-ly-newc]').value, n = await ask('Nom de la couleur :', c); if (n === null) return; D.swatches.push({id: nid('sw-'), name: n.slice(0, 60) || c, type: 'color', c}); commit(); renderPanel(); return; }
            if (d.lyGrnew !== undefined) { const g = {id: nid('gr-'), name: 'Dégradé', type: 'grad', kind: 'linear', angle: 90, stops: [{c: '#ffffff', p: 0}, {c: colorOf(D, 'sw-accent', '#7a2e2e'), p: 100}]}; D.swatches.push(g); dl.dataset.grad = g.id; commit(); renderPanel(); return; }
            if (d.lyGedit) { dl.dataset.grad = d.lyGedit; renderPanel(); return; }
            if (d.lyGadd !== undefined) { const g = D.swatches.find(s => s.id === dl.dataset.grad); if (g && g.stops.length < 8) { g.stops.push({c: '#888888', p: 50}); g.stops.sort((a, c) => a.p - c.p); commit(); render(); } return; }
            if (d.lyGdel !== undefined) { const g = D.swatches.find(s => s.id === dl.dataset.grad); if (g && g.stops.length > 2) { g.stops.splice(Number(d.lyGdel), 1); commit(); render(); } return; }
            if (d.lySwren) { const s0 = swatch(D, d.lySwren), n = await ask('Nom :', s0?.name); if (s0 && n) { s0.name = n.slice(0, 60); commit(); renderPanel(); } return; }
            if (d.lySwdel) { const used = JSON.stringify(D).split(`"${d.lySwdel}"`).length - 2; D.swatches = D.swatches.filter(s => s.id !== d.lySwdel); const txt = JSON.stringify(D).split(`"${d.lySwdel}"`).join('"sw-black"'); D = JSON.parse(txt); commit('Nuance supprimée'); render(); undoable(used > 0 ? `Nuance supprimée (${used} objet${used > 1 ? 's passent' : ' passe'} en noir)` : 'Nuance supprimée'); return; }
            if (d.lyFlip) { selected().forEach(it => { it[d.lyFlip] = !it[d.lyFlip]; }); commit(); render(); return; }
            if (d.lyConvert) { selected().forEach(it => { if (it.type === 'frame') it.shape = d.lyConvert; else it.type = d.lyConvert; }); commit(); render(); return; }
            if (d.lyImgclear !== undefined) { const it = one(); if (it) { it.src = ''; delete it.srcName; commit(); render(); } return; }
            if (d.lyAlign) return align(d.lyAlign);
            if (d.lyDist) return distribute(d.lyDist);
            if (d.lyPf) return pathfinder(d.lyPf);
            if (d.lyPmove) { const j = cur + Number(d.lyPmove); if (j < 0 || j >= D.pages.length) return; [D.pages[cur], D.pages[j]] = [D.pages[j], D.pages[cur]]; cur = j; commit(); render(); return; }
            if (d.lyMedit) { if (editingId) stopEditing(); editMaster = d.lyMedit; sel = []; render(); return; }
            if (d.lyMapply) { D.pages[cur].master = d.lyMapply; commit(); render(); return; }
            if (d.lyMnone !== undefined) { D.pages[cur].master = ''; commit(); render(); return; }
            if (d.lyMnew !== undefined) { const ids = D.masters.map(m => m.id); let c = 'C'; while (ids.includes(c)) c = String.fromCharCode(c.charCodeAt(0) + 1); const n = await ask('Nom du gabarit :', `${c}-Gabarit`); if (!n) return; D.masters.push({id: ids.includes(c) ? nid('M') : c, name: n.slice(0, 60), items: []}); commit(); renderPanel(); return; }
            if (d.lyMren) { const m = D.masters.find(x => x.id === d.lyMren), n = await ask('Nom du gabarit :', m?.name); if (m && n) { m.name = n.slice(0, 60); commit(); render(); } return; }
            if (d.lyMmulti !== undefined) return mastersDialog();
            if (d.lyMdel) { // ses pages prennent le gabarit choisi à la place (ou aucun)
                const m = D.masters.find(x => x.id === d.lyMdel); if (!m) return; const n = D.pages.filter(p => p.master === m.id).length;
                ext.openDialog({eyebrow: 'GABARITS', title: `Supprimer « ${m.name} »`, submitLabel: 'Supprimer le gabarit',
                    body: `<p>${n ? `${n} page${n > 1 ? 's utilisent' : ' utilise'} ce gabarit.` : 'Aucune page n’utilise ce gabarit.'}</p>${n ? `<label>Ces pages prennent à la place <select name="to"><option value="">Aucun gabarit</option>${D.masters.filter(x => x !== m).map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label>` : ''}`,
                    onSubmit: f => { const to = f.to?.value || ''; D.masters = D.masters.filter(x => x !== m); D.pages.forEach(p => { if (p.master === m.id) p.master = to; }); if (editMaster === m.id) editMaster = null; act = `Gabarit « ${m.name} » supprimé`; commit(); render(); }});
                return;
            }
            if (d.lyMdetach !== undefined) { const m = D.masters.find(x => x.id === D.pages[cur].master); if (!m) return msg('Cette page n’a pas de gabarit.'); D.pages[cur].items.unshift(...JSON.parse(JSON.stringify(m.items)).map(it => ({...it, id: nid('c')}))); D.pages[cur].master = ''; commit(); render(); msg('Éléments du gabarit détachés : modifiables sur cette page.'); return; }
            const lrow = e.target.closest('[data-ly-layer]');
            if (lrow) { const l = D.layers.find(x => x.id === lrow.dataset.lyLayer), i = D.layers.indexOf(l); if (!l) return;
                if (d.lyLvis !== undefined) { l.visible = !l.visible; commit(); render(); return; }
                if (d.lyLlock !== undefined) { l.locked = !l.locked; commit(); render(); return; }
                if (d.lyLup !== undefined && i > 0) { [D.layers[i - 1], D.layers[i]] = [D.layers[i], D.layers[i - 1]]; commit(); render(); return; }
                if (d.lyLdown !== undefined && i < D.layers.length - 1) { [D.layers[i + 1], D.layers[i]] = [D.layers[i], D.layers[i + 1]]; commit(); render(); return; }
                if (d.lyLdel !== undefined) { if (D.layers.length < 2) return msg('Il faut au moins un calque.'); D.layers.splice(i, 1); [...D.pages.map(p => p.items), ...D.masters.map(m => m.items)].forEach(list => { for (let k = list.length - 1; k >= 0; k--) if (list[k].layer === l.id) list.splice(k, 1); }); commit(`Calque « ${l.name} » supprimé`); render(); undoable(`Calque « ${l.name} » supprimé`); return; }
                dl.dataset.layer = l.id; renderPanel(); return; }
            if (d.lyLnew !== undefined) { const n = await ask('Nom du calque :', `Calque ${D.layers.length + 1}`); if (!n) return; const colors = ['#4a7dff', '#ff4a6e', '#2bb673', '#f5a623', '#9b59b6', '#00b3c7']; const l = {id: nid('L'), name: n.slice(0, 60), visible: true, locked: false, color: colors[D.layers.length % colors.length]}; D.layers.unshift(l); dl.dataset.layer = l.id; commit(); renderPanel(); return; }
            if (d.lyPickobj) { sel = [d.lyPickobj]; drawSel(); renderPanel(); return; }
            if (d.lyLinkgo || d.lyLinkrep) { const [i, idv] = (d.lyLinkgo || d.lyLinkrep).split(':'); goPage(Number(i)); sel = [idv]; drawSel(); if (d.lyLinkrep) { const it = curList().find(x => x.id === idv); if (it) await placeImage(it); } return; }
            if (d.lyDefaults !== undefined) return defaultsDialog();
        });
        pbody.addEventListener('input', e => { if (e.target.matches('[data-ly-gstop][type=range]')) e.target.nextElementSibling.textContent = e.target.value + ' %'; });
        // ⇄ : le fond devient le contour et inversement (comme InDesign)
        { const pk = dl.querySelector('[data-ly-fspick]'); pk.addEventListener('change', () => { const keep = fillTarget; fillTarget = pk.dataset.for || fillTarget; applyPaint(pk.value); fillTarget = keep === 'text' ? keep : fillTarget; syncChrome(); }); }
        function swapPaint() {
            const its = selected().filter(x => !locked(x)); if (!its.length) return msg('Choisis un objet pour intervertir son fond et son contour.');
            its.forEach(it => { const f = it.fill || 'none', s0 = it.stroke?.c || 'none'; it.fill = s0; it.stroke = it.stroke || {}; it.stroke.c = swatch(D, f)?.type === 'grad' ? colorOf(D, f, 'none') : f; if (it.stroke.c !== 'none' && !(it.stroke.w > 0)) it.stroke.w = 1; });
            commit(); render();
        }
        function applyPaint(v) {
            if (fillTarget === 'text') { const c = colorOf(D, v, ''); if (!c || c === 'none') return; return applyChar({color: c}); }
            const its = selected().filter(x => !locked(x)); if (!its.length) return msg('Choisis un objet.');
            its.forEach(it => { if (fillTarget === 'fill') it.fill = v; else { it.stroke = it.stroke || {}; it.stroke.c = v; if (v !== 'none' && !(it.stroke.w > 0)) it.stroke.w = 1; } });
            commit(); render();
        }
        function align(k) {
            const its = selected().filter(x => !locked(x)); if (!its.length) return;
            const to = dl.dataset.alignTo || (its.length > 1 ? 'sel' : 'margins'), m = pageMargins(D, cur), PS = editMaster ? {w: D.page.w, h: D.page.h} : pageSize(D, cur);
            const ref = to === 'sel' && its.length > 1 ? bounds(its) : to === 'page' ? {x: 0, y: 0, w: PS.w, h: PS.h} : {x: m.l, y: m.t, w: PS.w - m.l - m.r, h: PS.h - m.t - m.b};
            its.forEach(it => { if (k === 'l') it.x = ref.x; if (k === 'r') it.x = r1(ref.x + ref.w - it.w); if (k === 'ch') it.x = r1(ref.x + (ref.w - it.w) / 2); if (k === 't') it.y = ref.y; if (k === 'b') it.y = r1(ref.y + ref.h - it.h); if (k === 'cv') it.y = r1(ref.y + (ref.h - it.h) / 2); });
            commit(); render();
        }
        function distribute(axis) {
            const its = selected().filter(x => !locked(x)).sort((a, b) => axis === 'h' ? a.x - b.x : a.y - b.y); if (its.length < 3) return;
            const total = axis === 'h' ? its.reduce((s, i) => s + i.w, 0) : its.reduce((s, i) => s + i.h, 0), b = bounds(its), gap = ((axis === 'h' ? b.w : b.h) - total) / (its.length - 1);
            let at = axis === 'h' ? b.x : b.y; its.forEach(it => { if (axis === 'h') { it.x = r1(at); at += it.w + gap; } else { it.y = r1(at); at += it.h + gap; } });
            commit(); render();
        }
        function pathfinder(op) {
            const list = curList();
            if (op === 'release') { const it = one(); if (it?.type !== 'compound') return; const parts = it.parts.map(p => ({...p, id: nid('s'), x: r1(it.x + p.x), y: r1(it.y + p.y), layer: it.layer, fill: it.fill, stroke: {...it.stroke}})); list.splice(list.indexOf(it), 1, ...parts); sel = parts.map(p => p.id); commit(); render(); return; }
            const its = list.filter(x => sel.includes(x.id) && ['rect', 'ellipse', 'polygon', 'star', 'path', 'frame'].includes(x.type)); if (its.length < 2) return;
            const b = bounds(its), back = its[0]; // l'ordre de la page : le premier est au fond
            const it = {id: nid('k'), type: 'compound', op, layer: back.layer, x: b.x, y: b.y, w: b.w, h: b.h, rot: 0, fill: back.fill === 'none' ? 'sw-light' : back.fill, stroke: {...back.stroke}, opacity: back.opacity ?? 100, parts: its.map(p => ({...JSON.parse(JSON.stringify(p)), x: r1(p.x - b.x), y: r1(p.y - b.y), type: p.type === 'frame' ? (p.shape || 'rect') : p.type}))};
            const at = list.indexOf(back); its.forEach(p => list.splice(list.indexOf(p), 1)); list.splice(Math.min(at, list.length), 0, it); sel = [it.id]; commit(); render();
        }
        function editStyle(kind, sid) {
            const list = kind === 'para' ? D.paraStyles : D.charStyles, s0 = list.find(x => x.id === sid) || {id: nid(kind === 'para' ? 'ps-' : 'cs-'), name: kind === 'para' ? 'Nouveau style' : 'Nouveau style de caractère', ...(kind === 'para' ? {font: D.paraStyles.find(x => x.id === 'ps-body')?.font, size: D.paraStyles.find(x => x.id === 'ps-body')?.size} : {})}; // un nouveau style de paragraphe part du texte courant (police et corps), pas de la police du système
            const fonts = fontList();
            ext.openDialog({eyebrow: kind === 'para' ? 'STYLE DE PARAGRAPHE' : 'STYLE DE CARACTÈRE', title: s0.name, wide: true, submitLabel: 'Enregistrer le style', onOpen: bindFontPick, onDelete: sid && !STYLE_IDS.includes(sid) ? () => { const i = list.indexOf(s0); if (i >= 0) list.splice(i, 1); commit(); render(); } : undefined,
                body: `<div class="form-grid"><label>Nom <input name="name" value="${esc(s0.name)}" maxlength="60"></label><label>Police ${fontPickHtml('name="font"', s0.font || '')}</label>
                    <label>Corps<input data-unit="pt" type="number" step="0.5" name="size" value="${s0.size ?? ''}"></label><label>Interlignage<input data-unit="pt" type="number" step="0.5" name="lead" value="${s0.lead ?? ''}"></label>
                    <label>Graisse <select name="weight"><option value="">—</option>${[300, 400, 500, 600, 700, 900].map(w => `<option ${Number(s0.weight) === w ? 'selected' : ''}>${w}</option>`).join('')}</select></label><label>Couleur <select name="color"><option value="">—</option>${D.swatches.filter(x => x.type !== 'grad').map(x => `<option value="${esc(x.id)}" ${s0.color === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
                    <label>Approche (‰) <input type="number" step="5" name="track" value="${s0.track ?? ''}"></label><label>Capitales <select name="caps"><option value="">—</option><option value="small" ${s0.caps === 'small' ? 'selected' : ''}>Petites capitales</option><option value="all" ${s0.caps === 'all' ? 'selected' : ''}>Toutes capitales</option></select></label>
                    <label class="checkbox-line"><input type="checkbox" name="italic" ${s0.italic ? 'checked' : ''}> Italique</label><label class="checkbox-line"><input type="checkbox" name="underline" ${s0.underline ? 'checked' : ''}> Souligné</label>
                    ${kind === 'para' ? `<label>Alignement <select name="align">${[['left', 'À gauche'], ['center', 'Centré'], ['right', 'À droite'], ['justify', 'Justifié'], ['justify-all', 'Justifié (tout)']].map(([k, l]) => `<option value="${k}" ${s0.align === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                    <label>Espace avant<input data-unit="mm" type="number" step="0.5" name="before" value="${s0.before ?? ''}"></label><label>Espace après<input data-unit="mm" type="number" step="0.5" name="after" value="${s0.after ?? ''}"></label>
                    <label>Retrait gauche<input data-unit="mm" type="number" step="0.5" name="left" value="${s0.left ?? ''}"></label><label>Retrait droit<input data-unit="mm" type="number" step="0.5" name="right" value="${s0.right ?? ''}"></label>
                    <label>Retrait 1re ligne<input data-unit="mm" type="number" step="0.5" name="indent" value="${s0.indent ?? ''}"></label><label>Lettrine (lignes, 0 = aucune) <input type="number" min="0" max="8" name="drop" value="${s0.drop ?? 0}"></label>
                    <label class="checkbox-line"><input type="checkbox" name="hyph" ${s0.hyph ? 'checked' : ''}> Césure</label>` : ''}</div><p class="muted">Tous les paragraphes${kind === 'char' ? ' (mots)' : ''} qui ont ce style changent dans tout le livre.</p>`,
                onSubmit: f => {
                    const v = Object.fromEntries(new FormData(f)); const o = {id: s0.id, name: (v.name || 'Style').slice(0, 60)};
                    if (v.font) o.font = fontOk(v.font); ['size', 'lead', 'weight', 'track', 'before', 'after', 'left', 'right', 'indent', 'drop'].forEach(k => { if (v[k] !== undefined && v[k] !== '' && Number(v[k])) o[k] = Number(v[k]); });
                    if (v.color) o.color = v.color; if (v.caps) o.caps = v.caps; if (v.align) o.align = v.align; ['italic', 'underline', 'hyph'].forEach(k => { if (v[k]) o[k] = true; });
                    const i = list.findIndex(x => x.id === s0.id); if (i >= 0) list[i] = o; else list.push(o); commit(); render();
                }});
        }

        window.LCNDA_UI?.bindFileDrop?.(canvas, files => dropImages(files), {accept: 'image/*'}); // E4 : glisser ou coller une image
        setDirty(!id); render(); syncHistory(); requestAnimationFrame(() => zoomFit());
        ext.fullInit?.(dl, 'layout', true); // plein écran par défaut ; ⛶ pour passer en fenêtre (retenu)
        dl.showModal(); canvas.focus({preventScroll: true}); // les raccourcis (V, T, M…) marchent tout de suite
        setTimeout(() => refreshLinks(true).catch(() => {}), 300); // objets dynamiques : photos retouchées, fiches changées
        return dl;
    }
    /* ═════════════ Images : une photo de la base, ou un fichier de l'ordinateur (intégré, réduit) ═════════════ */
    async function pickImage() {
        // la fenêtre unique des médias : la photo reste liée (objet dynamique) ; une image de l'ordinateur entre dans les Médias
        const P = window.LCNDA_PICKER; if (!P?.openMediaPicker) { toast('La fenêtre des images n’est pas encore prête. Réessaie dans un instant.', 'error'); return null; }
        const r = await P.openMediaPicker({types: ['image'], eyebrow: 'PLACER UNE IMAGE', title: 'Choisir une image', okLabel: 'Placer cette image',
            intro: 'Elle reste liée (objet dynamique) : retouchée dans l’app, elle se met à jour ici.'});
        return r ? {src: `media/${r.filename}`, name: r.title || r.filename, mediaId: r.id} : null;
    }

    /* ═════════════ Texte chaîné, sommaire, index : ce qu'affiche chaque bloc (calculé, jamais enregistré) ═════════════ */
    /** Ce qui tient dans ce cadre : la coupe se fait n'importe où dans le texte (entre deux mots), en gardant la mise en forme */
    function splitFit(doc, frame, html, others) {
        if (!measureOverflow(doc, {...frame, html}, others)) return {fit: html, rest: ''};
        const src = document.createElement('div'); src.innerHTML = html;
        const texts = []; const w = document.createTreeWalker(src, NodeFilter.SHOW_TEXT); let n, total = 0; while ((n = w.nextNode())) { texts.push([n, total]); total += n.data.length; }
        const at = k => { let i = texts.length - 1; while (i > 0 && texts[i][1] > k) i--; const [node, off] = texts[i] || [src, 0]; return [node, Math.min(node.data?.length ?? 0, k - off)]; };
        const part = (a, b) => { const r = document.createRange(); if (a === null) r.setStart(src, 0); else r.setStart(...at(a)); if (b === null) r.setEnd(src, src.childNodes.length); else r.setEnd(...at(b)); const d = document.createElement('div'); d.appendChild(r.cloneContents()); return d.innerHTML; };
        if (!total) return {fit: html, rest: ''}; // pas de texte à couper (lignes vides) : tout reste ici, le bloc déborde
        const plain = texts.map(t => t[0].data).join('');
        let lo = 0, hi = total;
        while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (!measureOverflow(doc, {...frame, html: part(null, mid)}, others)) lo = mid; else hi = mid - 1; }
        let k = lo; while (k > 0 && k < total && !/\s/.test(plain[k - 1]) && !/\s/.test(plain[k])) k--; // entre deux mots
        if (k <= 0) k = Math.max(1, lo);
        let rest = part(k, null).replace(/^(\s*<(p|h\d|li|div)\b)/i, '$1 data-cont="1"'); // la suite d'un paragraphe coupé : pas de retrait de 1re ligne
        return {fit: part(null, k), rest};
    }
    const plainOf = html => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent || ''; };
    const fold = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    let resolveCache = {key: '', out: null};
    /** Le document tel qu'il s'affiche : textes chaînés répartis de cadre en cadre, sommaires et index remplis */
    function resolveDoc(doc, {editingId = null} = {}) {
        const all = []; doc.pages.forEach((p, i) => p.items.forEach(it => all.push({it, i})));
        const special = all.some(({it}) => it.next || it.auto || (it.type === 'text' && String(it.html || '').includes('data-fn'))); if (!special) return doc;
        const key = editingId + '|' + JSON.stringify([doc.page, doc.paraStyles, doc.charStyles, doc.fn, doc.notes, doc.pages.map(p => p.items.filter(it => it.type === 'text').map(it => [it.id, it.html, it.x, it.y, it.w, it.h, it.next, it.auto, it.autoStyles, it.autoPs, it.columns, it.inset, it.gutter, (it.names || []).length, (it.terms || []).length]).concat(p.items.filter(it => it.wrap && it.wrap.mode !== 'none').map(it => [it.id, it.x, it.y, it.w, it.h, it.wrap.mode, it.wrap.off, it.hidden])))]);
        // seuls les textes sont recalculés (et gardés en mémoire) ; les autres objets viennent toujours du document, tels quels
        const live = V0 => { const tx = new Map(); V0.pages.forEach(p => p.items.forEach(x => { if (x.type === 'text') tx.set(x.id, x); })); return {...doc, pages: doc.pages.map(p => ({...p, items: p.items.map(x => { const c = x.type === 'text' && tx.get(x.id); return c ? {...x, html: c.html, ...(c._follow !== undefined ? {_follow: c._follow} : {}), ...(c._fn ? {_fn: c._fn} : {})} : x; })}))}; };
        if (resolveCache.key === key) return live(resolveCache.out);
        const V = JSON.parse(JSON.stringify(doc)), byId = new Map(); V.pages.forEach((p, i) => p.items.forEach(it => byId.set(it.id, {it, i, p})));
        const targets = new Set(); byId.forEach(({it}) => { if (it.next && byId.has(it.next)) targets.add(it.next); });
        const chainOf = head => { const out = [], seen = new Set(); let c = head; while (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); c = c.next ? byId.get(c.next)?.it : null; if (c && c.type !== 'text') break; } return out; };
        const runChain = (head, html) => { const frames = chainOf(head); let rest = html;
            frames.forEach((f, k) => { const pg = byId.get(f.id).p, others = pg.items.filter(o => o !== f); if (k > 0) f._follow = true;
                if (editingId && f.id === editingId) { f.html = rest; rest = ''; return; } // le bloc qu'on écrit montre tout son texte
                if (k === frames.length - 1 || !rest) { f.html = rest || ''; rest = ''; return; }
                const r = splitFit(V, f, rest, others); f.html = r.fit; rest = r.rest; }); };
        // 1. les textes ordinaires chaînés
        byId.forEach(({it}) => { if (it.type === 'text' && it.next && !targets.has(it.id) && !it.auto) runChain(it, it.html); });
        // 2. sommaires et index, d'après les pages telles qu'elles sont maintenant
        const start = V.page.start || 1, pageTexts = V.pages.map(p => [...p.items].filter(x => x.type === 'text' && !x.auto).sort((a, b) => a.y - b.y || a.x - b.x));
        byId.forEach(({it}) => {
            if (!it.auto || targets.has(it.id) || ['notes', 'biblio'].includes(it.auto)) return;
            let html = '';
            if (it.auto === 'toc') {
                const want = it.autoStyles?.length ? it.autoStyles : ['ps-chapter'], rows = [];
                pageTexts.forEach((list, i) => list.forEach(t => { const d = document.createElement('div'); d.innerHTML = t.html || ''; d.querySelectorAll('[data-ps]').forEach(b => { const lvl = want.indexOf(b.dataset.ps); const txt = (b.textContent || '').replace(/\s+/g, ' ').trim(); if (lvl >= 0 && txt && !b.hasAttribute('data-cont')) rows.push({txt, lvl, page: i + start}); }); }));
                html = rows.map(r => `<p data-ps="${esc(it.autoPs || 'ps-body')}" class="ly-toc" style="margin-left:${r.lvl * 5}mm"><span>${esc(r.txt)}</span>${it.autoDots !== false ? '<i class="ly-tl"></i>' : '<i class="ly-tsp"></i>'}<span>${r.page}</span></p>`).join('') || '<p data-ps="ps-body"><em>(Le sommaire se remplit avec les paragraphes en style « Chapitre », ou ceux choisis dans Objet.)</em></p>';
            } else html = indexHtml(it, pageTexts, start);
            if (it.next) runChain(it, html); else it.html = html;
        });
        // 3. les notes de bas de page : numérotées dans l'ordre de lecture (à 1 à chaque chapitre ou page si demandé), en bas du bloc ou en fin de chapitre
        const fnPlace = V.fn?.place || 'block', restart = V.fn?.restart || 'none', refs = [], notesAt = new Map();
        let n = 0, chap = 0;
        V.pages.forEach((p, i) => {
            if (restart === 'page') n = 0;
            [...p.items].filter(x => x.type === 'text' && (!x.auto || x.auto === 'notes')).sort((a, b) => a.y - b.y || a.x - b.x).forEach(f => {
                if (f.auto === 'notes') { if (!f._follow) notesAt.set(f.id, chap); return; }
                if (!String(f.html || '').includes('data-fn') && !String(f.html || '').includes('ps-chapter')) return;
                const d = document.createElement('div'); d.innerHTML = f.html || ''; let touched = false; const mine = [];
                d.querySelectorAll('[data-ps="ps-chapter"], sup[data-fn]').forEach(el => {
                    if (el.tagName !== 'SUP') { if (!el.hasAttribute('data-cont')) { chap++; if (restart === 'chapter') n = 0; } return; }
                    n++; if (el.textContent !== String(n)) { el.textContent = String(n); touched = true; }
                    const r = {id: el.dataset.fn, n, chap, page: i}; refs.push(r); mine.push(r);
                });
                if (touched) f.html = d.innerHTML;
                if (fnPlace === 'block' && mine.length) f._fn = mine.map(r => `<p class="ly-fnote"><sup>${r.n}</sup> ${esc(V.notes?.[r.id]?.text || '…')}</p>`).join('');
            });
        });
        byId.forEach(({it}) => {
            if (!['notes', 'biblio'].includes(it.auto) || targets.has(it.id)) return;
            let html;
            if (it.auto === 'notes') {
                const c0 = notesAt.get(it.id) ?? 0, mine = refs.filter(r => r.chap === c0);
                html = fnPlace !== 'chapter' ? '<p data-ps="ps-body"><em>(Les notes sont en bas de chaque bloc de texte. Pour les avoir ici, en fin de chapitre : Document → Notes de bas de page.)</em></p>'
                    : mine.map(r => `<p data-ps="${esc(it.autoPs || 'ps-list')}" class="ly-fnote"><sup>${r.n}</sup> ${esc(V.notes?.[r.id]?.text || '…')}</p>`).join('') || '<p data-ps="ps-body"><em>(Aucune note dans ce chapitre : elles se rangent ici toutes seules.)</em></p>';
            } else {
                const seen = new Map(); refs.forEach(r => { const nt = V.notes?.[r.id]; if (nt?.src && !seen.has(nt.src)) seen.set(nt.src, nt.srcLabel || nt.text); });
                html = [...seen.values()].sort((a, b) => fold(a).localeCompare(fold(b))).map(t => `<p data-ps="${esc(it.autoPs || 'ps-list')}">${esc(t)}</p>`).join('') || '<p data-ps="ps-body"><em>(La bibliographie se remplit avec les sources citées en note : Texte → « 📚 Citer une source ».)</em></p>';
            }
            if (it.next) runChain(it, html); else it.html = html;
        });
        resolveCache = {key, out: V};
        return live(V);
    }
    /** Index des noms, des lieux ou des métiers : les mots marqués (style de caractère) et ceux de la base trouvés dans le texte, avec les pages */
    const INDEX_MARK = {index: 'cs-index', places: 'cs-index-place', jobs: 'cs-index-job'};
    const INDEX_EMPTY = {index: '(L’index se remplit avec les noms marqués en style de caractère « Nom à indexer », et les personnes de la généalogie trouvées dans le texte.)',
        places: '(L’index des lieux se remplit avec les mots marqués « Lieu à indexer », et les lieux de ta base trouvés dans le texte.)', jobs: '(L’index des métiers se remplit avec les mots marqués « Métier à indexer », et les métiers de ta base trouvés dans le texte.)'};
    function indexHtml(it, pageTexts, start) {
        const kind = it.auto, map = new Map(), add = (name, page) => { const k = fold(name); if (!map.has(k)) map.set(k, {name, pages: new Set()}); map.get(k).pages.add(page); };
        const key = t => fold(t).split(/[^a-z0-9'-]+/).filter(Boolean).join(' ');
        const names = kind !== 'index' ? [] : (it.names || []).map(n => { const [f, l] = n.split('|'); return {f: f || '', l: l || '', k: key(`${f} ${l}`), r: key(`${l} ${f}`)}; }).filter(n => n.k.includes(' ') && n.k.length > 4);
        const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
        const terms = kind === 'index' ? [] : (it.terms || []).map(t => ({label: kind === 'jobs' ? cap(t.trim()) : t.trim(), k: key(t)})).filter(t => t.k.length >= 3);
        pageTexts.forEach((list, i) => {
            const page = i + start, d = document.createElement('div'); d.innerHTML = list.map(t => String(t.html || '').replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, '$& ')).join(' '); // un espace entre deux paragraphes : « deux » et « Naves » restent deux mots
            d.querySelectorAll(`[data-cs="${INDEX_MARK[kind]}"]`).forEach(sp => { const t = (sp.textContent || '').replace(/\s+/g, ' ').trim(); if (t) add(kind === 'jobs' ? cap(t) : t, page); });
            if (!names.length && !terms.length) return;
            // tous les groupes de 1 à 4 mots de la page, pour trouver vite « prénom nom », « nom prénom », un lieu, un métier
            const toks = fold(d.textContent || '').split(/[^a-z0-9'-]+/).filter(Boolean), grams = new Set();
            for (let a = 0; a < toks.length; a++) for (let m = 1; m <= 4 && a + m <= toks.length; m++) grams.add(toks.slice(a, a + m).join(' '));
            names.forEach(nm => { if (grams.has(nm.k) || grams.has(nm.r)) add(`${nm.l.toUpperCase()} ${nm.f}`.trim(), page); });
            terms.forEach(t => { if (grams.has(t.k) || (kind === 'jobs' && (grams.has(t.k + 's') || grams.has(t.k + 'x') || grams.has(t.k + 'e') || grams.has(t.k + 'es')))) add(t.label, page); });
        });
        const rows = [...map.values()].sort((a, b) => fold(a.name).localeCompare(fold(b.name)));
        let letter = '';
        const pagesTxt = set => { const ps = [...set].sort((a, b) => a - b), out = []; for (let k = 0; k < ps.length; k++) { let j = k; while (j + 1 < ps.length && ps[j + 1] === ps[j] + 1) j++; out.push(j > k + 1 ? `${ps[k]}–${ps[j]}` : j === k + 1 ? `${ps[k]}, ${ps[j]}` : String(ps[k])); k = j; } return out.join(', '); };
        return rows.map(r => { const l = fold(r.name)[0]?.toUpperCase() || '#'; const head = l !== letter ? `<p data-ps="ps-head">${esc(l)}</p>` : ''; letter = l; return `${head}<p data-ps="${esc(it.autoPs || 'ps-list')}">${esc(r.name)}, ${pagesTxt(r.pages)}</p>`; }).join('') || `<p data-ps="ps-body"><em>${esc(INDEX_EMPTY[kind] || '')}</em></p>`;
    }
    /* ── Objets dynamiques : le texte d'une fiche de la généalogie ── */
    /* ═════════════ ▦ QR codes (heritage-qr.js) et 📨 publipostage ═════════════ */
    const svgData = svg => 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    /** L'image (SVG) d'un QR code d'après ses réglages {text, dark, light, quiet} */
    const qrSrc = cfg => svgData(ext.qr.svg(cfg.text, {dark: cfg.dark, light: cfg.light, quiet: cfg.quiet}).svg);
    const MERGE_MAX = 500;
    const MERGE_FIELDS = [['prénom', 'first_name'], ['nom', 'last_name'], ['nom complet', 'name'], ['naissance', 'birth'], ['lieu de naissance', 'birth_place'], ['décès', 'death'], ['lieu de décès', 'death_place'], ['dates', 'life'], ['métier', 'occupation'], ['sosa', 'sosa'], ['numéro', 'number'], ['parents', 'parents'], ['conjoints', 'partners'], ['enfants', 'children'], ['biographie', 'bio']];
    const foldKey = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
    const MERGE_KEY = new Map([...MERGE_FIELDS.map(([k, f]) => [foldKey(k), f]), ['profession', 'occupation'], ['conjoint', 'partners'], ['nom de famille', 'last_name'], ['prenoms', 'first_name'], ['bio', 'bio']]);
    const isPortraitFrame = it => it.type === 'frame' && /\{\s*(portrait|photo)\s*\}/i.test(it.name || '');
    /** Les champs d'une page modèle */
    function mergeScan(items) {
        const keys = new Set(); let portrait = false;
        (items || []).forEach(it => { if (it.type === 'text') for (const m of String(it.html || '').matchAll(/\{([^{}<>]{2,40})\}/g)) { if (MERGE_KEY.has(foldKey(m[1]))) keys.add(m[1]); } if (isPortraitFrame(it)) portrait = true; });
        return {keys: [...keys], portrait};
    }
    /** Une copie des objets de la page modèle, champs remplis pour une personne (données de layout_family_data) */
    function mergeFill(items, p) {
        const val = f => { const v = p[f]; return Array.isArray(v) ? v.join(', ') : String(v ?? '').trim(); };
        const copy = JSON.parse(JSON.stringify(items || [])), map = new Map();
        copy.forEach(it => { const old = it.id; it.id = nid('c'); map.set(old, it.id); });
        copy.forEach(it => {
            if (it.next) { if (map.has(it.next)) it.next = map.get(it.next); else delete it.next; }
            if (it.type === 'text') it.html = String(it.html || '').replace(/\{([^{}<>]{2,40})\}/g, (m, k) => { const f = MERGE_KEY.get(foldKey(k)); return f ? esc(val(f)) : m; })
                .replace(/(?:\s*[,·–—]\s*)+(<\/(?:p|li|h\d|div)>)/g, '$1').replace(/(<(?:p|li|h\d|div)\b[^>]*>)(?:\s*[,·]\s*)+/g, '$1'); // pas de virgule orpheline quand un champ est vide
            if (isPortraitFrame(it)) { const file = p.portrait_full || p.portrait || p.photos?.[0]?.full || ''; it.name = `Portrait — ${p.name || ''}`.slice(0, 80); if (file) { it.src = `media/${file}`; it.srcName = p.name || ''; if (p.portrait_id && (p.portrait_full || p.portrait)) it.mediaId = p.portrait_id; else if (p.photos?.[0]?.id) it.mediaId = p.photos[0].id; } else { delete it.src; delete it.mediaId; } }
        });
        return copy;
    }
    ext.layoutMerge = {mergeScan, mergeFill, MERGE_FIELDS};
    const DYN_FIELDS = [['name', 'Nom complet'], ['life', 'Naissance et décès (dates et lieux)'], ['parents', 'Parents'], ['partners', 'Conjoints'], ['children', 'Enfants'], ['occupation', 'Profession'], ['events', 'Tous les événements'], ['notes', 'Notes']];
    async function personDynHtml(id, fields) {
        const r = await api('person', {id}), p = r.person || {}, nm = x => [x?.first_name, x?.last_name].filter(Boolean).join(' ') || x?.name || '';
        const ev = (r.events || []), find = re => ev.find(e => re.test(String(e.type || e.type_label || e.event_type || '')));
        const evTxt = e => e ? [e.date_text || e.year, e.place_name || e.place].filter(Boolean).join(', ') : '';
        const out = [];
        if (fields.includes('name')) out.push(`<p data-ps="ps-name">${esc(nm(p))}</p>`);
        if (fields.includes('life')) { const b = find(/naiss|birth|bapt/i), d = find(/décè|deces|death|inhum|sépult/i); const t = [b && `° ${evTxt(b)}`, d && `† ${evTxt(d)}`].filter(Boolean).join(' — '); if (t) out.push(`<p data-ps="ps-dates">${esc(t)}</p>`); }
        if (fields.includes('occupation') && (p.occupation || p.profession)) out.push(`<p data-ps="ps-body">${esc(p.occupation || p.profession)}</p>`);
        const list = (label, arr) => { const names = (arr || []).map(nm).filter(Boolean); if (names.length) out.push(`<p data-ps="ps-body"><b>${label} :</b> ${esc(names.join(', '))}</p>`); };
        if (fields.includes('parents')) list('Parents', r.parents);
        if (fields.includes('partners')) list((r.partners || []).length > 1 ? 'Conjoints' : 'Conjoint', r.partners);
        if (fields.includes('children')) list('Enfants', r.children);
        if (fields.includes('events')) ev.forEach(e => out.push(`<p data-ps="ps-list">${esc(e.type_label || e.type || 'Événement')} : ${esc(evTxt(e))}</p>`));
        if (fields.includes('notes')) (r.notes || []).slice(0, 10).forEach(n => { const t = plainOf(n.content || n.text || n.note || ''); if (t.trim()) out.push(`<p data-ps="ps-body">${esc(t.trim())}</p>`); });
        return out.join('') || `<p data-ps="ps-body">${esc(nm(p) || 'Fiche')}</p>`;
    }

    /* ═════════════ 🌳 L'arbre généalogique dynamique : dessiné en SVG d'après la base (lib/layout_extra.php → layout_tree_data) ═════════════ */
    const photoCache = new Map();
    /** La photo d'une fiche, réduite et rangée dans le dessin (une image SVG ne charge rien d'autre qu'elle-même) */
    function photoData(file) {
        if (!file || !/^[A-Za-z0-9._%\-/]{1,240}$/.test(file)) return Promise.resolve('');
        if (photoCache.has(file)) return photoCache.get(file);
        const pr = new Promise(res => { const im = new Image(); im.onload = () => { try { const S = 96, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), k = Math.max(S / im.naturalWidth, S / im.naturalHeight), w = im.naturalWidth * k, h = im.naturalHeight * k; g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); g.drawImage(im, (S - w) / 2, (S - h) / 3, w, h); res(c.toDataURL('image/jpeg', 0.82)); } catch (_) { res(''); } }; im.onerror = () => res(''); im.src = `media/${file}`; });
        photoCache.set(file, pr); return pr;
    }
    let measureCtx = null;
    const textW = (t, size, family, weight = 400) => { measureCtx = measureCtx || document.createElement('canvas').getContext('2d'); measureCtx.font = `${weight} ${size}px "${family}", serif`; return measureCtx.measureText(String(t)).width; };
    const fitTxt = (t, max, size, family, weight) => { t = String(t || ''); if (textW(t, size, family, weight) <= max) return t; while (t.length > 1 && textW(t + '…', size, family, weight) > max) t = t.slice(0, -1); return t.trimEnd() + '…'; };
    async function treeSvg(cfg, look) {
        const data = await api('layout_tree_data', {root_id: cfg.root, mode: cfg.mode === 'fan' ? 'asc' : cfg.mode, gens: cfg.gens});
        const people = []; const walk = n => { if (!n?.p) return; people.push(n.p); (n.families || []).forEach(f => { if (f.spouse) people.push(f.spouse); f.children.forEach(walk); }); };
        people.push(data.root, ...Object.values(data.ancestors || {})); if (data.descendants) walk(data.descendants);
        const photos = new Map(); if (cfg.photos) await Promise.all([...new Set(people.map(p => p?.photo).filter(Boolean))].map(async f => photos.set(f, await photoData(f))));
        const F = look.font, FT = look.title, st = cfg.style, out = [], defs = [];
        const GEN = {male: ['#e3edfb', '#5b86c5'], female: ['#fbe4ee', '#c96b8f'], unknown: ['#eeeeee', '#9a9a9a']};
        const life = p => !cfg.dates ? '' : p.by && p.dy ? `${p.by} – ${p.dy}` : p.by ? `° ${p.by}` : p.dy ? `† ${p.dy}` : '';
        const W = 168, H0 = 40 + (cfg.dates ? 12 : 0) + (cfg.places ? 11 : 0), PH = cfg.photos ? 44 : 0;
        let clipN = 0;
        /** Une case : style, photo ou initiales, prénom, NOM, dates (et lieux), numéro */
        const card = (x, y, p, {w = W, h = Math.max(H0, PH + 10), num = '', root = false, spouse = ''} = {}) => {
            if (!p) return '';
            const [gf, gs] = GEN[p.gender] || GEN.unknown, sw = root ? 2 : 1.1;
            const fill = st === 'color' ? gf : st === 'plain' || st === 'cartouche' ? look.paper : look.light, stroke = st === 'color' ? gs : st === 'plain' ? look.soft : look.accent;
            let g = st === 'cartouche' ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="${sw + 0.6}"/><rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" rx="1" fill="none" stroke="${stroke}" stroke-width="0.6"/>`
                : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${st === 'plain' ? 0 : 7}" fill="${fill}" stroke="${stroke}" stroke-width="${st === 'plain' ? 0.8 : sw}"/>`;
            let tx = x + 9;
            if (cfg.photos) {
                const cx = x + 8 + 20, cy = y + h / 2, ph = photos.get(p.photo);
                if (ph) { const id = `tc${++clipN}`; defs.push(`<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="20"/></clipPath>`); g += `<image x="${cx - 20}" y="${cy - 20}" width="40" height="40" href="${ph}" xlink:href="${ph}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/><circle cx="${cx}" cy="${cy}" r="20" fill="none" stroke="${stroke}" stroke-width="0.8"/>`; }
                else { const ini = ((p.first || '').trim()[0] || '') + ((p.last || '').trim()[0] || ''); g += `<circle cx="${cx}" cy="${cy}" r="20" fill="${gf}" stroke="${gs}" stroke-width="0.8"/><text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="${gs}">${esc(ini.toUpperCase() || '?')}</text>`; }
                tx = x + 8 + 40 + 7;
            }
            const maxW = x + w - 7 - tx, lines = [];
            const nameColor = st === 'classic' || st === 'cartouche' ? look.accent : look.text;
            lines.push([fitTxt(p.first || ' ', maxW, 10.5, F), 10.5, 400, look.text, F]);
            lines.push([fitTxt(String(p.last || '').toUpperCase(), maxW, 11.5, FT, 700), 11.5, 700, nameColor, FT]);
            if (cfg.dates && life(p)) lines.push([fitTxt(life(p), maxW, 9, F), 9, 400, look.soft, F]);
            if (cfg.places && (p.bp || p.dp)) lines.push([fitTxt([p.bp && `° ${p.bp}`, p.dp && `† ${p.dp}`].filter(Boolean).join(' · '), maxW, 8, F), 8, 400, look.soft, F]);
            if (spouse) lines.push([fitTxt(spouse, maxW, 8, F), 8, 400, look.soft, F]);
            const total = lines.reduce((a, l) => a + l[1] * 1.22, 0); let yy = y + (h - total) / 2;
            lines.forEach(([t, sz, wt, col, fam]) => { yy += sz * 1.22; g += `<text x="${r1(tx)}" y="${r1(yy - sz * 0.25)}" font-size="${sz}" font-weight="${wt}" fill="${col}" font-family="${esc(fam)}, serif">${esc(t)}</text>`; });
            if (num) g += `<text x="${x + w - 5}" y="${y + 10}" text-anchor="end" font-size="7.5" fill="${look.soft}">${esc(num)}</text>`;
            return g;
        };
        const line = d => `<path d="${d}" fill="none" stroke="${st === 'color' ? '#8a8a8a' : look.soft}" stroke-width="1"/>`;
        const anc = data.ancestors || {}, G = cfg.gens, CH = Math.max(H0, PH + 10);
        let minX = 0, minY = 0, maxX = 0, maxY = 0; const grow = (x, y, w, h) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h); };
        const spouseTxt = n => (n.families || []).map(f => f.spouse ? `∞ ${[f.spouse.first, String(f.spouse.last || '').toUpperCase()].filter(Boolean).join(' ')}` : '').filter(Boolean).join(' · ');
        /** La descendance, de haut en bas : les feuilles côte à côte, chaque parent au milieu de ses enfants */
        const descLayout = (root, y0) => {
            let next = 0; const GAPX = 14, GAPY = 46, H = CH + (cfg.dates ? 0 : 0) + 10;
            const place = (n, d) => { const kids = (n.families || []).flatMap(f => f.children); n._d = d; if (!kids.length) { n._x = next; next += W + GAPX; } else { kids.forEach(k => place(k, d + 1)); n._x = (kids[0]._x + kids.at(-1)._x) / 2; } n._kids = kids; };
            place(root, 0);
            const draw = n => { const x = n._x, y = y0 + n._d * (H + GAPY); grow(x, y, W, H);
                out.push(card(x, y, n.p, {h: H, root: n === root, spouse: spouseTxt(n)}));
                if (n._kids.length) { const my = y + H + GAPY / 2; out.push(line(`M${x + W / 2},${y + H}V${my}`)); out.push(line(`M${n._kids[0]._x + W / 2},${my}H${n._kids.at(-1)._x + W / 2}`)); n._kids.forEach(k => { out.push(line(`M${k._x + W / 2},${my}V${y0 + k._d * (H + GAPY)}`)); draw(k); }); } };
            draw(root); return root._x;
        };
        if (cfg.mode === 'asc') { // de gauche à droite : la personne, puis ses parents, ses grands-parents…
            const GX = 34, rows = 2 ** (G - 1), RH = CH + 10, tot = rows * RH;
            const pos = n => { const g = Math.floor(Math.log2(n)), i = n - 2 ** g; return {x: g * (W + GX), y: (i + 0.5) * tot / 2 ** g - CH / 2}; };
            Object.keys(anc).map(Number).sort((a, b) => a - b).forEach(n => { const c = pos(n), ch = pos(n >> 1); out.push(line(`M${ch.x + W},${ch.y + CH / 2}H${ch.x + W + GX / 2}V${c.y + CH / 2}H${c.x}`)); });
            const r = pos(1); out.push(card(r.x, r.y, data.root, {root: true, num: '1'})); grow(r.x, r.y, W, CH);
            Object.entries(anc).forEach(([n, p]) => { const c = pos(Number(n)); out.push(card(c.x, c.y, p, {num: n})); grow(c.x, c.y, W, CH); });
        } else if (cfg.mode === 'desc') descLayout(data.descendants || {p: data.root}, 0);
        else if (cfg.mode === 'both') { // sablier : les ancêtres au-dessus, les descendants dessous, la personne au milieu
            const GX = 12, GY = 40, slots = 2 ** (G - 1), tot = slots * (W + GX);
            const pos = n => { const g = Math.floor(Math.log2(n)), i = n - 2 ** g; return {x: (i + 0.5) * tot / 2 ** g - W / 2, y: -g * (CH + GY)}; };
            const rootX = descLayout(data.descendants || {p: data.root}, 0), dx = rootX - pos(1).x;
            Object.keys(anc).map(Number).forEach(n => { const c = pos(n), ch = pos(n >> 1), my = ch.y - GY / 2; out.push(line(`M${ch.x + dx + W / 2},${ch.y}V${my}H${c.x + dx + W / 2}V${c.y + CH}`)); });
            Object.entries(anc).forEach(([n, p]) => { const c = pos(Number(n)); out.push(card(c.x + dx, c.y, p, {num: n})); grow(c.x + dx, c.y, W, CH); });
        } else { // éventail : une roue des ancêtres, la personne au centre
            const R0 = 62, DR = 74, P2 = Math.PI;
            const pt = (r, a) => [r1(r * Math.cos(a)), r1(r * Math.sin(a))];
            const seg = (r1_, r2, a1, a2) => { const [x1, y1] = pt(r2, a1), [x2, y2] = pt(r2, a2), [x3, y3] = pt(r1_, a2), [x4, y4] = pt(r1_, a1), big = a2 - a1 > P2 ? 1 : 0; return `M${x1},${y1}A${r2},${r2} 0 ${big} 1 ${x2},${y2}L${x3},${y3}A${r1_},${r1_} 0 ${big} 0 ${x4},${y4}Z`; };
            const colorOfP = (p, g) => st === 'color' ? (GEN[p.gender] || GEN.unknown) : st === 'plain' ? [look.paper, look.soft] : [g % 2 ? look.light : look.paper, look.accent];
            for (let g = 1; g < G; g++) for (let i = 0; i < 2 ** g; i++) { const n = 2 ** g + i, p = anc[n], a1 = P2 + i * P2 / 2 ** g, a2 = a1 + P2 / 2 ** g, ri = R0 + (g - 1) * DR, ro = ri + DR;
                const [fl, sk] = p ? colorOfP(p, g) : ['none', look.soft]; out.push(`<path d="${seg(ri, ro, a1, a2)}" fill="${fl}" stroke="${sk}" stroke-width="${st === 'cartouche' ? 1.6 : 0.9}"${p ? '' : ' stroke-dasharray="3 3"'}/>`);
                if (!p) continue;
                const am = (a1 + a2) / 2, rm = ri + DR / 2, deg = am * 180 / P2, arc = (ri + 6) * (a2 - a1);
                const ls = [[p.first || '', 400, F], [String(p.last || '').toUpperCase(), 700, FT], ...(cfg.dates && life(p) ? [[life(p), 400, F]] : [])];
                if (g <= 2) { // le texte suit le cercle
                    const sz = g === 1 ? 11 : 9.5, [cx, cy] = pt(rm, am), rot = deg + 90; let yy = -((ls.length - 1) * sz * 1.2) / 2;
                    out.push(`<g transform="translate(${cx},${cy}) rotate(${r1(rot)})">${ls.map(([t, wt, fam]) => { const y = yy; yy += sz * 1.2; return `<text x="0" y="${r1(y + sz * 0.35)}" text-anchor="middle" font-size="${sz}" font-weight="${wt}" fill="${wt === 700 && st !== 'color' ? look.accent : look.text}" font-family="${esc(fam)}, serif">${esc(fitTxt(t, Math.min(arc * 0.92, 150), sz, fam, wt))}</text>`; }).join('')}</g>`);
                } else { // le texte rayonne
                    const sz = Math.max(5, Math.min(9, arc / (ls.length * 1.25))), flip = deg > 270 ? 0 : 180, [cx, cy] = pt(rm, am); let yy = -((ls.length - 1) * sz * 1.2) / 2;
                    out.push(`<g transform="translate(${cx},${cy}) rotate(${r1(deg + flip)})">${ls.map(([t, wt, fam]) => { const y = yy; yy += sz * 1.2; return `<text x="0" y="${r1(y + sz * 0.35)}" text-anchor="middle" font-size="${r1(sz)}" font-weight="${wt}" fill="${look.text}" font-family="${esc(fam)}, serif">${esc(fitTxt(t, DR - 8, sz, fam, wt))}</text>`; }).join('')}</g>`);
                }
            }
            const p = data.root, [fl, sk] = colorOfP(p, 0); out.push(`<path d="M${-R0},0A${R0},${R0} 0 0 1 ${R0},0Z" fill="${fl}" stroke="${sk}" stroke-width="1.6"/>`);
            const ph = cfg.photos && photos.get(p.photo); if (ph) { defs.push('<clipPath id="tcroot"><circle cx="0" cy="-41" r="17"/></clipPath>'); out.push(`<image x="-17" y="-58" width="34" height="34" href="${ph}" xlink:href="${ph}" clip-path="url(#tcroot)" preserveAspectRatio="xMidYMid slice"/>`); }
            out.push(`<text x="0" y="${ph ? -14 : -24}" text-anchor="middle" font-size="10" fill="${look.text}" font-family="${esc(F)}, serif">${esc(fitTxt(p.first, 104, 10, F))}</text><text x="0" y="${ph ? -3 : -10}" text-anchor="middle" font-size="11" font-weight="700" fill="${st === 'color' ? look.text : look.accent}" font-family="${esc(FT)}, serif">${esc(fitTxt(String(p.last || '').toUpperCase(), 104, 11, FT, 700))}</text>${!ph && cfg.dates && life(p) ? `<text x="0" y="4" text-anchor="middle" font-size="9" fill="${look.soft}" font-family="${esc(F)}, serif">${esc(life(p))}</text>` : ''}`);
            const R = R0 + (G - 1) * DR; grow(-R, -R, 2 * R, R + 4);
        }
        const pad = 8, w = r1(maxX - minX + pad * 2), h = r1(maxY - minY + pad * 2);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="${esc(F)}, serif"><defs>${defs.join('')}</defs><g transform="translate(${r1(pad - minX)},${r1(pad - minY)})">${out.join('')}</g></svg>`;
        const kind = {asc: 'Ascendance', desc: 'Descendance', both: 'Arbre', fan: 'Éventail'}[cfg.mode] || 'Arbre';
        return {svg, w, h, name: `${kind} de ${data.root?.name || 'la personne'}`, count: new Set(people.filter(Boolean).map(p => p.id)).size};
    }
    /* ═════════════ 📱 ePub (EPUB 3) : fabriqué dans le navigateur, un petit ZIP (« stored », ou deflate si le navigateur sait) ═════════════ */
    /** files : [{name, data (Uint8Array ou texte), store}] → Blob ZIP (le premier fichier tel quel : le « mimetype » de l'ePub) */
    const makeZip = (files, type = 'application/zip') => window.LCNDA_SHEET.makeZip(files, type); // le fabricant commun (app-tableur-engine.js)
    const xmlEsc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    /** Le livre en ePub : un fichier XHTML par chapitre (style « Chapitre »), les images, les notes à la fin de chaque chapitre, la couverture, la table des matières */
    async function buildEpub(doc0, name) {
        const V = resolveDoc(doc0), INF = doc0.info || {}, title = String(INF.title || doc0.title || name || 'Mon livre').trim() || 'Mon livre', enc = new TextEncoder();
        const images = [], imgBySrc = new Map();
        const addImage = async src => {
            if (imgBySrc.has(src)) return imgBySrc.get(src);
            let bytes = null, mt = '';
            try {
                if (src.startsWith('data:')) { const m = /^data:(image\/[a-z+]+);base64,(.*)$/.exec(src); if (m) { mt = m[1]; const bin = atob(m[2]); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); } }
                else if (srcOk(src)) { const r = await fetch(src); if (r.ok) { const b = await r.blob(); mt = b.type || ''; bytes = new Uint8Array(await b.arrayBuffer()); } }
            } catch (_) { bytes = null; }
            const ext = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg'}[mt];
            if (!bytes || !ext) { imgBySrc.set(src, null); return null; }
            const file = `images/img${String(images.length + 1).padStart(3, '0')}.${ext}`; images.push({file, mt, bytes}); imgBySrc.set(src, file); return file;
        };
        // 1. tout le texte et les images dans l'ordre de lecture (page après page, de haut en bas) ; sommaires et index sont remplacés par la table de l'ePub
        const flow = [], start = V.page.start || 1; let coverPage = -1;
        V.pages.forEach((p, i) => { if (coverPage < 0 && i === 0 && p.items.some(it => it.type === 'text' && /data-ps="ps-title"/.test(it.html || ''))) coverPage = 0; });
        for (const [i, p] of V.pages.entries()) {
            if (i === coverPage) continue;
            for (const it of [...p.items].filter(x => !x.hidden).sort((a, b) => a.y - b.y || a.x - b.x)) {
                if (it.type === 'text') { if (['toc', 'index', 'places', 'jobs', 'notes'].includes(it.auto)) continue; flow.push({kind: 'text', html: tokens(it.html || '', {pageNo: '', pages: '', title, chapter: ''}), page: i + start}); }
                else if ((it.type === 'frame' || it.type === 'image') && it.src) { const f = await addImage(it.src); if (f) flow.push({kind: 'img', file: f, alt: it.srcName || it.name || 'Image'}); }
            }
        }
        // 2. les paragraphes en XHTML (styles → classes), coupés en chapitres
        const chapters = []; let curCh = null, fnK = 0;
        const newChapter = t => { curCh = {title: t, body: [], notes: []}; chapters.push(curCh); };
        const ser = new XMLSerializer(), toX = el => ser.serializeToString(el).replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
        for (const b of flow) {
            if (b.kind === 'img') { if (!curCh) newChapter(title); curCh.body.push(`<figure class="img"><img src="${b.file}" alt="${xmlEsc(b.alt)}"/></figure>`); continue; }
            const d = document.createElement('div'); d.innerHTML = b.html; d.querySelectorAll('.ly-wrapf').forEach(x => x.remove()); d.querySelectorAll('[data-cm]').forEach(x => x.replaceWith(...x.childNodes));
            [...d.children].forEach(el => {
                const ps = el.getAttribute('data-ps') || '', txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
                const head = (ps === 'ps-chapter' || ps === 'ps-name') && !el.hasAttribute('data-cont') && txt; // un chapitre, ou la page d'une personne
                if (head) newChapter(txt); else if (!curCh) newChapter(title);
                el.querySelectorAll('sup[data-fn]').forEach(s => { const k = ++fnK, id = s.dataset.fn, nShown = (s.textContent || String(k)).trim(); curCh.notes.push({k, n: nShown, text: V.notes?.[id]?.text || ''}); s.removeAttribute('data-fn'); s.innerHTML = ''; const a = document.createElement('a'); a.setAttribute('epub:type', 'noteref'); a.setAttribute('href', `#fn${k}`); a.setAttribute('id', `fnref${k}`); a.textContent = nShown; s.appendChild(a); });
                el.querySelectorAll('[data-ps],[data-cs]').forEach(x => { const c = [x.getAttribute('data-ps'), x.getAttribute('data-cs')].filter(Boolean).join(' '); x.removeAttribute('data-ps'); x.removeAttribute('data-cs'); if (c) x.setAttribute('class', c); });
                const c = [ps, el.getAttribute('data-cs')].filter(Boolean).join(' '); el.removeAttribute('data-ps'); el.removeAttribute('data-cs'); el.removeAttribute('data-cont'); if (c) el.setAttribute('class', c);
                el.querySelectorAll('[contenteditable],[spellcheck]').forEach(x => { x.removeAttribute('contenteditable'); x.removeAttribute('spellcheck'); });
                let x = toX(el); if (head && curCh.body.length === 0) x = x.replace(/^<p\b/, '<h1').replace(/<\/p>$/, '</h1>');
                curCh.body.push(x);
            });
        }
        if (!chapters.length) newChapter(title);
        // 3. la couverture : une image (la photo de la couverture, le titre, le sous-titre)
        const cov = coverPage >= 0 ? V.pages[coverPage] : null, covText = id => { const it = cov?.items.find(x => x.type === 'text' && (x.html || '').includes(`data-ps="${id}"`)); if (!it) return ''; const d = document.createElement('div'); d.innerHTML = it.html; return (d.querySelector(`[data-ps="${id}"]`)?.textContent || '').trim(); };
        const subtitle = covText('ps-subtitle'), author = INF.author || covText('ps-author').replace(/^par\s+/i, ''), look = {accent: colorOf(V, 'sw-accent', '#7a2e2e'), paper: colorOf(V, 'sw-paper', '#ffffff'), text: colorOf(V, 'sw-text', '#222')};
        let photo = ''; const ph = cov?.items.find(x => (x.type === 'frame' || x.type === 'image') && x.src && !x.tree); if (ph) { try { photo = ph.src.startsWith('data:') ? ph.src : await new Promise(res => { const im = new Image(); im.onload = () => { try { const c = document.createElement('canvas'), k = Math.min(1, 1200 / im.naturalWidth); c.width = im.naturalWidth * k; c.height = im.naturalHeight * k; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.85)); } catch (_) { res(''); } }; im.onerror = () => res(''); im.src = ph.src; }); } catch (_) { photo = ''; } }
        const wrapT = (t, n) => { const w = String(t).split(/\s+/), out = []; let l = ''; w.forEach(x => { if ((l + ' ' + x).trim().length > n && l) { out.push(l); l = x; } else l = (l + ' ' + x).trim(); }); if (l) out.push(l); return out.slice(0, 4); };
        const tl = wrapT(title, 18), coverSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 600 900" width="600" height="900"><rect width="600" height="900" fill="${xmlEsc(look.paper)}"/>${photo ? `<image x="0" y="0" width="600" height="520" preserveAspectRatio="xMidYMid slice" href="${photo}" xlink:href="${photo}"/>` : `<rect x="40" y="40" width="520" height="820" fill="none" stroke="${xmlEsc(look.accent)}" stroke-width="3"/>`}
            ${tl.map((l, k) => `<text x="300" y="${(photo ? 610 : 380) + k * 62}" text-anchor="middle" font-family="Georgia, serif" font-size="54" font-weight="700" fill="${xmlEsc(look.accent)}">${xmlEsc(l)}</text>`).join('')}${subtitle ? `<text x="300" y="${(photo ? 610 : 380) + tl.length * 62 + 20}" text-anchor="middle" font-family="Georgia, serif" font-size="28" font-style="italic" fill="${xmlEsc(look.text)}">${xmlEsc(subtitle.slice(0, 50))}</text>` : ''}${author ? `<text x="300" y="840" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="${xmlEsc(look.text)}">${xmlEsc(author.slice(0, 60))}</text>` : ''}</svg>`;
        images.unshift({file: 'images/cover.svg', mt: 'image/svg+xml', bytes: enc.encode(coverSvg), cover: true});
        // 4. les styles : ceux du livre, en tailles relatives (la liseuse choisit la taille du texte)
        const body = V.paraStyles.find(x => x.id === 'ps-body') || {size: 11}, bs = body.size || 11;
        const css = `body{margin:0 4%;font-family:"${fontOk(body.font) || 'Georgia'}",serif;line-height:1.45}p{margin:0 0 .5em}h1{margin:1.2em 0 .8em;page-break-after:avoid}figure.img{margin:1em 0;text-align:center}figure.img img{max-width:100%;height:auto}sup{font-size:.7em;line-height:0}a[epub|type="noteref"]{text-decoration:none}aside.notes{margin-top:2em;border-top:1px solid #999;padding-top:.6em;font-size:.85em}aside.notes p{margin:0 0 .4em}.cover{margin:0;padding:0;text-align:center}.cover img{max-width:100%;max-height:100vh}
${V.paraStyles.map(s0 => `.${s0.id}{${[s0.font && `font-family:"${fontOk(s0.font)}",serif`, s0.size && `font-size:${r1(s0.size / bs * 100) / 100}em`, s0.weight && `font-weight:${clamp(s0.weight, 100, 900)}`, s0.italic && 'font-style:italic', s0.caps === 'small' && 'font-variant:small-caps', s0.caps === 'all' && 'text-transform:uppercase', s0.align && `text-align:${s0.align === 'justify-all' ? 'justify' : s0.align}`, s0.color && `color:${colorOf(V, s0.color, '#111')}`, s0.indent && `text-indent:${r1(s0.indent / 4)}em`].filter(Boolean).join(';')}}`).join('\n')}
${V.charStyles.map(s0 => `.${s0.id}{${[s0.weight && `font-weight:${clamp(s0.weight, 100, 900)}`, s0.italic && 'font-style:italic', s0.caps === 'small' && 'font-variant:small-caps', s0.color && `color:${colorOf(V, s0.color, 'inherit')}`].filter(Boolean).join(';')}}`).join('\n')}`;
        // 5. les fichiers de l'ePub
        const xhtml = (t, inner, extra = '') => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="fr" xml:lang="fr"><head><meta charset="UTF-8"/><title>${xmlEsc(t)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body${extra}>${inner}</body></html>`;
        const chFiles = chapters.map((c, k) => ({file: `chap${String(k + 1).padStart(3, '0')}.xhtml`, title: c.title,
            data: xhtml(c.title, `<section epub:type="chapter">${c.body[0]?.startsWith('<h1') ? '' : `<h1 class="ps-chapter">${xmlEsc(c.title)}</h1>`}${c.body.join('\n')}</section>${c.notes.length ? `<aside class="notes" epub:type="footnotes">${c.notes.map(n => `<aside epub:type="footnote" id="fn${n.k}"><p><a href="#fnref${n.k}">${xmlEsc(n.n)}</a>. ${xmlEsc(n.text)}</p></aside>`).join('')}</aside>` : ''}`)}));
        const uid = INF.isbn ? `urn:isbn:${INF.isbn.replace(/[\s-]/g, '')}` : `urn:lcnda:${doc0.uid || nid('d')}`, epLang = /^[a-z]{2,3}$/.test(INF.lang || '') ? INF.lang : 'fr';
        const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
        const nav = xhtml('Table des matières', `<nav epub:type="toc" id="toc"><h1>Table des matières</h1><ol>${chFiles.map(c => `<li><a href="${c.file}">${xmlEsc(c.title)}</a></li>`).join('')}</ol></nav><nav epub:type="landmarks" hidden="hidden"><ol><li><a epub:type="cover" href="cover.xhtml">Couverture</a></li><li><a epub:type="bodymatter" href="${chFiles[0].file}">Début du livre</a></li></ol></nav>`);
        const ncx = `<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${xmlEsc(uid)}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head><docTitle><text>${xmlEsc(title)}</text></docTitle><navMap>${chFiles.map((c, k) => `<navPoint id="np${k + 1}" playOrder="${k + 1}"><navLabel><text>${xmlEsc(c.title)}</text></navLabel><content src="${c.file}"/></navPoint>`).join('')}</navMap></ncx>`;
        const coverX = xhtml(title, '<div class="cover"><img src="images/cover.svg" alt="Couverture"/></div>', ' epub:type="cover"');
        const opf = `<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${xmlEsc(epLang)}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${xmlEsc(uid)}</dc:identifier><dc:title>${xmlEsc(title)}</dc:title><dc:language>${xmlEsc(epLang)}</dc:language>${author ? `<dc:creator>${xmlEsc(author)}</dc:creator>` : ''}${INF.desc || INF.subject ? `<dc:description>${xmlEsc(INF.desc || INF.subject)}</dc:description>` : ''}${(INF.keywords || '').split(/[,;]/).map(k => k.trim()).filter(Boolean).slice(0, 30).map(k => `<dc:subject>${xmlEsc(k)}</dc:subject>`).join('')}<dc:publisher>LCNDA</dc:publisher><meta property="dcterms:modified">${modified}</meta><meta name="cover" content="cover-image"/></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="style.css" media-type="text/css"/><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
${images.map((im, k) => `<item id="${im.cover ? 'cover-image' : `img${k}`}" href="${im.file}" media-type="${im.mt}"${im.cover ? ' properties="cover-image"' : ''}/>`).join('\n')}
${chFiles.map((c, k) => `<item id="ch${k + 1}" href="${c.file}" media-type="application/xhtml+xml"/>`).join('\n')}</manifest>
<spine toc="ncx"><itemref idref="cover" linear="yes"/>${chFiles.map((c, k) => `<itemref idref="ch${k + 1}"/>`).join('')}</spine></package>`;
        const container = '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
        return makeZip([{name: 'mimetype', data: 'application/epub+zip', store: true}, {name: 'META-INF/container.xml', data: container}, {name: 'OEBPS/content.opf', data: opf}, {name: 'OEBPS/nav.xhtml', data: nav}, {name: 'OEBPS/toc.ncx', data: ncx}, {name: 'OEBPS/style.css', data: css}, {name: 'OEBPS/cover.xhtml', data: coverX},
            ...chFiles.map(c => ({name: `OEBPS/${c.file}`, data: c.data})), ...images.map(im => ({name: `OEBPS/${im.file}`, data: im.bytes, store: /jpe?g|png|gif|webp/.test(im.mt)}))], 'application/epub+zip');
    }
    /* ═════════════ Exports ═════════════ */
    const slug = n => String(n || 'livre').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'livre';
    const download = (name, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
    function printHtml(doc0, name, withButton, {bleed = false, annot = false, autoPrint = false} = {}) {
        const doc = resolveDoc(doc0);
        // 📝 PDF annoté : les passages commentés surlignés, un numéro au bord de chaque objet commenté, la liste des commentaires à la fin
        const cms = annot ? (doc.review?.comments || []) : [], num = new Map(cms.map((c, k) => [c.id, k + 1]));
        const pageOfCm = c => { const k = doc.pages.findIndex(p => p.items.some(it => it.id === c.item || String(it.html || '').includes(`data-cm="${c.id}"`))); return k >= 0 ? k : c.page; };
        const annotMap = new Map(); cms.forEach(c => { if (c.item && !c.quote) { const l = annotMap.get(c.item) || []; l.push(num.get(c.id)); annotMap.set(c.item, l); } });
        const annotCss = annot ? `[data-cm]{background:#fff0a0;box-shadow:0 0 0 1px #f0c419}${cms.map(c => `[data-cm="${c.id}"]::after{content:"[${num.get(c.id)}]";color:#c4161c;font:700 8px/1 Arial,sans-serif;vertical-align:super}`).join('')}.ly-cmark{position:absolute;z-index:9;min-width:14px;height:14px;padding:0 3px;border-radius:7px;background:#c4161c;color:#fff;font:700 9px/14px Arial,sans-serif;text-align:center}
            .ly-annot{margin:12px auto;padding:14mm;background:#fff;box-sizing:border-box;font:11pt/1.45 Georgia,serif;color:#111;break-before:page;page-break-before:always}.ly-annot h1{font-size:18pt;margin:0 0 4mm}.ly-annot li{margin:0 0 3mm}.ly-annot .q{background:#fff0a0}.ly-annot small{color:#666}.ly-annot .s{color:#0b5cad}` : '';
        const annotList = annot ? `<section class="ly-annot" style="width:${px(doc.page.w)}px"><h1>💬 Commentaires de relecture (${cms.length})</h1>${cms.length ? `<ol>${cms.map(c => { const pg = pageOfCm(c); return `<li><b>[${num.get(c.id)}]</b> ${pg >= 0 ? `<small>page ${pg + (doc.page.start || 1)} · </small>` : ''}<small>${esc(c.author)} · ${window.LCNDA_UI?.when?.(c.at) || esc(new Date(c.at).toLocaleDateString('fr-FR'))}${c.resolved ? ` · ${c.status === 'accepted' ? 'acceptée' : c.status === 'refused' ? 'refusée' : 'résolu'}` : ''}</small><br>${c.quote ? `<span class="q">« ${esc(c.quote)} »</span><br>` : ''}${esc(c.text)}${c.suggest ? `<br><span class="s">✎ Remplacer « ${esc(c.suggest.from)} » par « ${esc(c.suggest.to)} »</span>` : ''}${c.replies.map(r => `<br>↳ <small>${esc(r.author)} :</small> ${esc(r.text)}`).join('')}</li>`; }).join('')}</ol>` : '<p>Aucun commentaire.</p>'}</section>` : '';
        // avec fond perdu : la feuille est agrandie du fond perdu et d'une bande pour les traits de coupe (la ligne-bloc, sinon 8 mm)
        const B = bleed ? doc.page.bleed || 0 : 0, M = bleed ? Math.max(8, doc.page.slug || 0) : 0, W = doc.page.w + 2 * (B + M), H = doc.page.h + 2 * (B + M);
        // traits de coupe, repères de montage (cibles), gamme de couleurs et ligne d'informations, comme pour un imprimeur
        const marks = i => { const PS = pageSize(doc, i), W = PS.w + 2 * (B + M), H = PS.h + 2 * (B + M), pw = px(PS.w), ph = px(PS.h), o = px(B + M), L = px(Math.max(3, M - 2)), g = px(B + 1), mid = px(M / 2); const ln = (x1, y1, x2, y2) => `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}"/>`;
            const reg = (cx, cy) => { const r = px(2.2); return `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="none"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r / 2.2)}" fill="#000"/>${ln(cx - r * 1.6, cy, cx + r * 1.6, cy)}${ln(cx, cy - r * 1.6, cx, cy + r * 1.6)}`; };
            const bar = ['#00aeef', '#ec008c', '#fff200', '#000000', '#00a651', '#ed1c24', '#2e3192', '#808080', '#bfbfbf'].map((c, k) => `<rect x="${r1(o + px(6) + k * px(4))}" y="${r1(mid - px(1.6))}" width="${r1(px(4))}" height="${r1(px(3.2))}" fill="${c}" stroke="none"/>`).join('');
            const info = `<text x="${r1(o)}" y="${r1(px(H) - mid + px(1))}" font-size="${r1(px(2.2))}" font-family="Arial, sans-serif" fill="#000" stroke="none">${esc(name)} · page ${i + (doc.page.start || 1)} · ${r1(PS.w)} × ${r1(PS.h)} mm · fond perdu ${r1(B)} mm · ${new Date().toLocaleString('fr-FR')}</text>`;
            return `<svg class="ly-marks" width="${px(W)}" height="${px(H)}" stroke="#000" stroke-width="0.5">${[[o, o], [o + pw, o], [o, o + ph], [o + pw, o + ph]].map(([x, y], k) => { const sx = k % 2 ? 1 : -1, sy = k > 1 ? 1 : -1; return ln(x + sx * g, y, x + sx * (g + L), y) + ln(x, y + sy * g, x, y + sy * (g + L)); }).join('')}${M >= 6 ? reg(o + pw / 2, mid) + reg(o + pw / 2, px(H) - mid) + reg(mid, o + ph / 2) + reg(px(W) - mid, o + ph / 2) + bar + info : ''}</svg>`; };
        // 📐 une page qui a sa propre taille s'imprime sur une feuille à sa taille (pages nommées @page)
        const sizes = [], sizeName = i => { const PS = pageSize(doc, i); if (PS.w === doc.page.w && PS.h === doc.page.h) return ''; let k = sizes.findIndex(z => z.w === PS.w && z.h === PS.h); if (k < 0) { sizes.push(PS); k = sizes.length - 1; } return 'lysz' + k; };
        const named = (html, i) => { const n = sizeName(i); return n ? html.replace(/^<div class="(ly-sheet|ly-page)/, `<div class="$1 ${n}`) : html; };
        const pages = doc.pages.map((_, i) => { const PS = pageSize(doc, i), pg = pageHtml(doc, i, {print: true, preview: true, keyPrefix: 'p' + i, annot: annotMap}); return named(bleed ? `<div class="ly-sheet" style="width:${px(PS.w + 2 * (B + M))}px;height:${px(PS.h + 2 * (B + M))}px">${marks(i)}<div class="ly-bleedclip" style="left:${px(M)}px;top:${px(M)}px;width:${px(PS.w + 2 * B)}px;height:${px(PS.h + 2 * B)}px;background:${cssPaint(doc, doc.page.paper)}"><div style="position:absolute;left:${px(B)}px;top:${px(B)}px">${pg.replace('class="ly-page', 'class="ly-page is-bleed')}</div></div></div>` : pg, i); }).join('');
        const sizeCss = sizes.map((z, k) => `@page lysz${k}{size:${r1(z.w + 2 * (B + M))}mm ${r1(z.h + 2 * (B + M))}mm;margin:0}.lysz${k}{page:lysz${k}}`).join('');
        // ℹ️ les informations du document : titre (le titre du PDF), auteur, sujet, mots-clés, langue
        const info = doc.info || {}, docTitle = info.title || name, lang = /^[a-z]{2,3}$/.test(info.lang || '') ? info.lang : 'fr';
        const metas = [['author', info.author], ['description', info.desc || info.subject], ['keywords', info.keywords], ['dcterms.identifier', info.isbn ? `urn:isbn:${info.isbn.replace(/[\s-]/g, '')}` : ''], ['generator', 'LCNDA']].filter(([, v]) => v).map(([k, v]) => `<meta name="${k}" content="${esc(v)}">`).join('');
        return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(docTitle)}</title>${metas}<base href="${esc(location.href.replace(/[^/]*$/, ''))}"><style>${BASE_CSS}${docCss(doc, 'body')}
            @page{size:${W}mm ${H}mm;margin:0}${sizeCss}html,body{margin:0;padding:0;background:#888}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
            .ly-page{margin:12px auto;box-shadow:0 2px 12px rgba(0,0,0,.35)}.ly-page.is-bleed{overflow:visible;margin:0;box-shadow:none}.ly-sheet{position:relative;margin:12px auto;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.35)}.ly-bleedclip{position:absolute;overflow:hidden}.ly-marks{position:absolute;left:0;top:0}.ly-bar{position:sticky;top:0;z-index:9;display:flex;gap:10px;align-items:center;padding:10px 16px;background:#111;color:#fff;font:14px system-ui}.ly-bar button{font:inherit;padding:6px 14px;border-radius:6px;border:0;background:#2f6bff;color:#fff;cursor:pointer}
            @media print{html,body{background:none}.ly-bar{display:none}.ly-page,.ly-sheet{margin:0;box-shadow:none;break-after:page;page-break-after:always}.ly-sheet .ly-page{break-after:auto;page-break-after:auto}.ly-annot{margin:0}}${annotCss}</style></head><body>${withButton ? `<div class="ly-bar"><b>${esc(name)}</b> · ${A().plural(doc.pages.length, 'page')} · ${r1(W)} × ${r1(H)} mm${bleed ? ` (page ${r1(doc.page.w)} × ${r1(doc.page.h)} + fond perdu ${r1(B)} mm et traits de coupe)` : ''}${annot ? ` · ${A().plural(cms.length, 'commentaire')}` : ''}<span style="flex:1"></span><button onclick="print()">🖨 Imprimer / enregistrer en PDF</button></div>` : ''}${pages}${annotList}${autoPrint ? '<script>addEventListener("load",()=>setTimeout(()=>print(),400))<\/script>' : ''}</body></html>`;
    }
    /** Fichier HTML autonome : les photos de la base sont intégrées */
    async function inlineImages(html) {
        const srcs = [...new Set([...html.matchAll(/href="(media\/[^"]+)"/g)].map(m => m[1]))], map = {};
        await Promise.all(srcs.map(async s0 => { try { const r = await fetch(s0.replace(/&amp;/g, '&')); if (!r.ok) return; const b = await r.blob(); if (!/^image\//.test(b.type)) return; map[s0] = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); } catch (_) {} }));
        return html.replace(/<base [^>]*>/, '').replace(/href="(media\/[^"]+)"/g, (m0, s0) => map[s0] ? `href="${map[s0]}"` : m0);
    }

    /* ═════════════ Réglages enregistrés : ⤓ un fichier .json à garder ou à passer à un autre ordinateur, ⤒ et le remettre ═════════════ */
    const chooseFile = accept => new Promise(res => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.hidden = true; inp.dataset.uiOff = ''; inp.addEventListener('change', () => { res(inp.files?.[0] || null); inp.remove(); }); document.body.appendChild(inp); inp.click(); });
    const reglageExport = (outil, nom, donnees) => download(`lcnda-reglage-${outil}-${slug(nom).toLowerCase()}.json`, new Blob([JSON.stringify({lcnda: 'reglage', outil, nom, version: 1, donnees}, null, 1)], {type: 'application/json'}));
    /** Lire un fichier de réglage de cet outil ; un autre outil ou un autre fichier est refusé avec un message clair ; un nom déjà pris est redemandé */
    async function reglageImport(outil, label, taken = []) {
        const f = await chooseFile('.json,application/json'); if (!f) return null;
        if (f.size > 5e6) { toast('Fichier trop gros pour un réglage.', 'error'); return null; }
        let data; try { data = JSON.parse(await f.text()); } catch (_) { toast('Ce fichier n’est pas un réglage LCNDA (il n’est pas lisible).', 'error'); return null; }
        if (data?.lcnda !== 'reglage' || !data.donnees || typeof data.donnees !== 'object') { toast('Ce fichier n’est pas un réglage LCNDA.', 'error'); return null; }
        if (data.outil !== outil) { toast(`Ce réglage vient d’un autre outil (« ${String(data.outil || '?').slice(0, 40)} ») : il ne va pas dans ${label}.`, 'error'); return null; }
        let nom = String(data.nom || 'Réglage importé').replace(/[<>"`]/g, '').trim().slice(0, 60) || 'Réglage importé';
        while (taken.includes(nom)) { const v = await A().askText({title: 'Ce nom est déjà pris', message: `Tu as déjà un réglage « ${nom} ». Nom pour celui-ci :`, value: `${nom} (importé)`, okLabel: 'Importer'}); if (v === null || v === undefined) return null; nom = String(v).replace(/[<>"`]/g, '').trim().slice(0, 60) || nom; }
        return {nom, donnees: data.donnees};
    }

    /* ═════════════ Réglages par défaut ═════════════ */
    function defaultsDialog(onDone) {
        const d = defaults(), fonts = fontList();
        ext.openDialog({eyebrow: 'MISE EN PAGE', title: 'Réglages par défaut des nouveaux documents', wide: true, // K2 : chaque changement est gardé tout de suite (« ✓ Enregistré », « ↶ Annuler »), « Fermer » seul en bas
            body: `<div class="form-grid"><label>Format <select name="size">${allSizes().map(([k, l, w, h]) => `<option value="${k}" ${Math.abs(d.w - w) < 0.2 && Math.abs(d.h - h) < 0.2 ? 'selected' : ''}>${esc(l)}</option>`).join('')}<option value="custom" ${allSizes().some(x => Math.abs(d.w - x[2]) < 0.2 && Math.abs(d.h - x[3]) < 0.2) ? '' : 'selected'}>Personnalisé</option></select></label>
                <label>Largeur<input data-unit="mm" type="number" name="w" value="${d.w}" step="0.1"></label><label>Hauteur<input data-unit="mm" type="number" name="h" value="${d.h}" step="0.1"></label>
                <label class="checkbox-line"><input type="checkbox" name="facing" ${d.facing ? 'checked' : ''}> Pages en vis-à-vis (livre)</label>
                <label>Marge haut<input data-unit="mm" type="number" name="mt" value="${d.mt}"></label><label>Marge bas<input data-unit="mm" type="number" name="mb" value="${d.mb}"></label><label>Petit fond / intérieur<input data-unit="mm" type="number" name="mi" value="${d.mi}"></label><label>Grand fond / extérieur<input data-unit="mm" type="number" name="mo" value="${d.mo}"></label>
                <label>Colonnes <input type="number" name="columns" min="1" max="12" value="${d.columns}"></label><label>Gouttière<input data-unit="mm" type="number" name="gutter" value="${d.gutter}"></label>
                <label>Fond perdu<input data-unit="mm" type="number" name="bleed" min="0" max="20" step="0.5" value="${d.bleed}"></label><label>Ligne-bloc<input data-unit="mm" type="number" name="slug" min="0" max="60" step="0.5" value="${d.slug}"></label>
                <label>Police des titres ${fontPickHtml('name="titleFont"', d.titleFont)}</label><label>Police du texte ${fontPickHtml('name="bodyFont"', d.bodyFont)}</label>
                <label>Corps du texte<input data-unit="pt" type="number" step="0.5" name="bodySize" value="${d.bodySize}"></label><label>Interlignage<input data-unit="pt" type="number" step="0.5" name="lead" value="${d.lead}"></label>
                <label>Couleur du livre <input type="color" name="accent" value="${d.accent}"></label><label>Papier <input type="color" name="paper" value="${d.paper}"></label>
                <label>Numéro de la 1re page <input type="number" name="startPage" min="1" value="${d.startPage}"></label><label class="checkbox-line"><input type="checkbox" name="folio" ${d.folio ? 'checked' : ''}> Folio et titre courant sur le gabarit</label></div>
                <p><button type="button" class="link-button" data-ui-reset>↺ Remettre comme au départ</button></p>`,
            onOpen: dg => { bindFontPick(dg); dg.querySelector('[name=size]').addEventListener('change', e => { const s0 = allSizes().find(x => x[0] === e.target.value); if (s0) { dg.querySelector('[name=w]').value = s0[2]; dg.querySelector('[name=h]').value = s0[3]; } }); const form = dg.querySelector('form') || dg;
                const fill = () => { const d1 = defaults(); Object.entries(d1).forEach(([k, v]) => { const el = form.querySelector(`[name="${k}"]`); if (!el) return; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; }); };
                window.LCNDA_UI?.autoSaveDialog?.(dg, {keys: [DEF_KEY], label: 'Réglages par défaut des livres',
                    save: () => { const v = Object.fromEntries(new FormData(form)); const o = {}; ['w', 'h', 'mt', 'mb', 'mi', 'mo', 'columns', 'gutter', 'bleed', 'slug', 'bodySize', 'lead', 'startPage'].forEach(k => { o[k] = Number(v[k]); }); o.facing = !!v.facing; o.folio = !!v.folio; o.titleFont = fontOk(v.titleFont); o.bodyFont = fontOk(v.bodyFont); o.accent = v.accent; o.paper = v.paper; o.size = v.size; try { localStorage.setItem(DEF_KEY, JSON.stringify(o)); } catch (_) {} },
                    reload: fill, reset: () => { try { localStorage.removeItem(DEF_KEY); } catch (_) {} }});
                dg.addEventListener('close', () => onDone?.()); },});
    }

    /* ═════════════ La bibliothèque : mes livres, mes designs, ceux de l'app ═════════════ */
    const coverHtml = (doc, w = 100) => { try { const d = resolveDoc(cleanDoc(doc)); if (!d.pages.length) return ''; const k = w / px(d.page.w); return `<div class="ly-cover" style="width:${w}px;height:${r1(px(d.page.h) * k)}px"><style>${docCss(d, '.ly-cover')}</style><div style="zoom:${k}">${pageHtml(d, 0, {preview: true, keyPrefix: 'cv' + Math.random().toString(36).slice(2, 6)})}</div></div>`; } catch (_) { return '<div class="ly-cover is-empty">📕</div>'; } };
    let builtinCache = null;
    const builtins = () => builtinCache || (builtinCache = THEMES.map(th => ({th, doc: builtinDesign(th, 'A4')})));
    async function openLibrary() {
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal h-modal-wide ly-lib'; dlg.dataset.dndOff = '';
        document.body.appendChild(dlg);
        dlg.addEventListener('close', () => dlg.remove());
        const draw = async () => {
            let docs = []; try { docs = (await api('layout_docs')).docs; } catch (err) { toast(err.message, 'error'); }
            const mine = docs.filter(x => !x.is_design), designs = docs.filter(x => x.is_design);
            const card = (x, kind) => `<article class="ly-card">${coverHtml(x.cover)}<div><b>${esc(x.name)}</b><small>${A().plural(x.pages, 'page')} · ${window.LCNDA_UI?.when?.(x.updated_at, {label: 'Modifié'}) || ''}</small><div class="ly-cardbtns">${kind === 'doc' ? `<button type="button" class="button small" data-open="${x.id}">Ouvrir</button>` : `<button type="button" class="button small" data-usedesign="${x.id}">Utiliser</button><button type="button" class="button small secondary" data-open="${x.id}">Modifier</button>`}<button type="button" class="button small secondary" data-dup="${x.id}">Dupliquer</button><button type="button" class="button small secondary" data-ren="${x.id}">Renommer</button><button type="button" class="button small secondary" data-exp="${x.id}">Exporter</button><button type="button" class="button small secondary danger" data-del="${x.id}">🗑</button></div></div></article>`;
            dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">LIVRE DE FAMILLE</span><h2>📐 Mise en page</h2><p>Un atelier façon InDesign : pages, gabarits, calques, textes, formes, images, nuancier… Pars d’une page blanche, des données de la famille ou d’un design.</p></div><button class="icon-button" type="button" data-close aria-label="Fermer">×</button></div>
                <div class="ly-libbody"><div class="ly-row ly-libtop"><button type="button" class="button" data-new="family">＋ Nouveau livre d’après la famille</button><button type="button" class="button secondary" data-new="template">📚 Livre prêt à l’emploi</button><button type="button" class="button secondary" data-new="catalogue">🖼 Catalogue raisonné</button><button type="button" class="button secondary" data-new="discography">💿 Discographie</button><button type="button" class="button secondary" data-new="design">＋ Nouveau depuis un design</button><button type="button" class="button secondary" data-new="blank">📄 Page blanche</button><label class="button secondary">⤒ Importer un document<input type="file" accept=".json,application/json" data-import hidden></label><button type="button" class="button secondary" data-defaults>⚙️ Réglages par défaut</button></div>
                <h3>📚 Livres de famille prêts à l’emploi</h3><div class="ly-tplrow">${BOOK_TEMPLATES.map(([k, l, h]) => `<button type="button" class="ly-tplbtn" data-tpl="${k}" title="${esc(h)}"><b>${l}</b><small>${esc(h)}</small></button>`).join('')}</div>
                <h3>📚 Mes livres (${mine.length})</h3><div class="ly-cards">${mine.map(x => card(x, 'doc')).join('') || A().emptyState({icon: '📚', text: 'Aucun livre pour l’instant', hint: 'Commence par un livre fait d’après la famille : il se remplit avec les fiches.', action: {label: '＋ Nouveau livre d’après la famille', attrs: 'data-new="family"'}})}</div>
                <h3>🎨 Mes designs (${designs.length})</h3><div class="ly-cards">${designs.map(x => card(x, 'design')).join('') || '<p class="muted">Un design est un modèle : ouvre un livre, puis Fichier → « Enregistrer comme design ». Les designs de l’app (ci-dessous) peuvent aussi être modifiés et enregistrés à ton nom.</p>'}</div>
                <h3>✨ Designs de l’app</h3><div class="ly-cards">${builtins().map(({th, doc}) => `<article class="ly-card">${coverHtml(doc)}<div><b>${esc(th.name)}</b><small>${esc(th.titleFont)} · ${esc(th.bodyFont)}</small><div class="ly-cardbtns"><button type="button" class="button small" data-builtin="${th.id}">Utiliser</button><button type="button" class="button small secondary" data-editbuiltin="${th.id}">Modifier (à mon nom)</button></div></div></article>`).join('')}</div></div>
                <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-close>Fermer</button></div>`;
        };
        await draw();
        const reopen = () => draw();
        dlg.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
            try {
                if (d.close !== undefined) return dlg.close();
                if (d.defaults !== undefined) return defaultsDialog();
                if (d.new) return newDocWizard(d.new, reopen);
                if (d.tpl) return templateWizard(reopen, d.tpl);
                if (d.open) { const r = await api('layout_doc', {id: Number(d.open)}); return openEditor({id: r.id, name: r.name, doc: r.doc, isDesign: !!r.is_design, onSaved: reopen, rev: r.rev}); }
                if (d.usedesign) { const r = await api('layout_doc', {id: Number(d.usedesign)}); return newDocWizard('design', reopen, {designId: r.id}); }
                if (d.builtin) return newDocWizard('design', reopen, {builtin: d.builtin});
                if (d.editbuiltin) { const x = builtins().find(y => y.th.id === d.editbuiltin); return openEditor({id: 0, name: `Design ${x.th.name}`, doc: JSON.parse(JSON.stringify(x.doc)), isDesign: true, onSaved: reopen}); }
                if (d.dup) { const r = await api('layout_doc', {id: Number(d.dup)}); await post('save_layout_doc', {name: `${r.name} (copie)`.slice(0, 160), is_design: r.is_design, doc: r.doc}); toast('Copie faite.'); return draw(); }
                if (d.ren) { const r = await api('layout_doc', {id: Number(d.ren)}), n = await ask('Nouveau nom :', r.name); if (!n) return; await post('save_layout_doc', {id: r.id, name: n, is_design: r.is_design, doc: r.doc}); return draw(); }
                if (d.exp) { const r = await api('layout_doc', {id: Number(d.exp)}); return download(`${slug(r.name)}.json`, new Blob([JSON.stringify({type: 'lcnda-mise-en-page-livre', version: 1, name: r.name, is_design: r.is_design, doc: r.doc})], {type: 'application/json'})); }
                if (d.del) { if (!await A().confirmBox('Exporte-le d’abord si tu veux le garder.', {title: 'Supprimer ce document ?', okLabel: 'Supprimer le document'})) return; await post('delete_layout_doc', {id: Number(d.del)}); toast('Document supprimé.'); return draw(); }
            } catch (err) { toast(err.message, 'error'); }
        });
        dlg.addEventListener('change', async e => {
            if (!e.target.matches('[data-import]')) return; const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
            if (f.size > 30e6) return toast('Fichier trop gros.', 'error');
            let data; try { data = JSON.parse(await f.text()); } catch (_) { return toast('Ce fichier n’est pas un document de mise en page LCNDA.', 'error'); }
            if (data?.lcnda === 'relecture' && data.doc) { // 📨 un livre envoyé pour relecture : il devient un document, à commenter puis à renvoyer
                try { const doc = cleanDoc(data.doc); await post('save_layout_doc', {name: `Relecture — ${String(data.name || 'livre')}`.slice(0, 160), is_design: 0, doc}); toast(`Livre à relire importé${data.from ? ` (de ${data.from})` : ''} : ouvre-le, commente (menu Relecture), puis « 📨 Envoyer à un cousin » pour renvoyer tes commentaires.`); draw(); } catch (err) { toast(err.message, 'error'); }
                return;
            }
            if (data?.lcnda === 'reglage') return toast('C’est un fichier de réglage : il s’importe dans le document ouvert, Fichier → « Mes styles » → « Importer un réglage ».', 'error');
            if (data?.type !== 'lcnda-mise-en-page-livre' || !data.doc) return toast('Ce fichier n’est pas un document de mise en page LCNDA.', 'error');
            try { const doc = cleanDoc(data.doc); await post('save_layout_doc', {name: String(data.name || 'Document importé').slice(0, 160), is_design: data.is_design ? 1 : 0, doc}); toast('Document importé.'); draw(); } catch (err) { toast(err.message, 'error'); }
        });
        dlg.showModal();
    }
    /** Nouveau document : page blanche, d'après un design, ou d'après la famille (avec un design) */
    async function newDocWizard(mode, onSaved, {designId = 0, builtin = ''} = {}) {
        if ((mode === 'catalogue' || mode === 'discography') && ext.artistCatalogue?.wizard) return ext.artistCatalogue.wizard({mode, onSaved}); // 🎨
        if (mode === 'template') return templateWizard(onSaved, builtin || 'bio'); // 📚 gabarits de livre de famille
        let mineDesigns = []; try { mineDesigns = (await api('layout_docs')).docs.filter(x => x.is_design); } catch (_) {}
        const d = defaults(), S = A().state, start = S.bootstrap?.startPersonId;
        const designOpts = [...THEMES.map(th => [`b:${th.id}`, `✨ ${th.name}`]), ...mineDesigns.map(x => [`m:${x.id}`, `🎨 ${x.name}`])];
        const chosen = designId ? `m:${designId}` : builtin ? `b:${builtin}` : 'b:classique';
        const SECS = [['cover', 'Couverture'], ['preface', 'Préface'], ['stats', 'La famille en chiffres'], ['tree', 'L’arbre'], ['people', 'Une page par personne'], ['chronology', 'Chronologie'], ['places', 'Les lieux'], ['index', 'Index des noms'], ['epilogue', 'Mot de la fin']];
        ext.openDialog({eyebrow: 'NOUVEAU DOCUMENT', title: mode === 'family' ? '👪 Un livre d’après la famille' : mode === 'design' ? '🎨 Depuis un design' : '📄 Page blanche', wide: true, submitLabel: mode === 'family' ? 'Créer le livre' : 'Créer le document',
            body: `<div class="form-grid"><label>Nom du document <input name="name" value="${mode === 'family' ? 'Livre de famille' : 'Mon livre'}" maxlength="160"></label>
                ${mode !== 'blank' ? `<label>Design <select name="design">${designOpts.map(([k, l]) => `<option value="${k}" ${k === chosen ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : ''}
                ${formatFieldsHtml(d.w, d.h, {designOwn: mode === 'design'})}
                ${mode === 'blank' ? `<label>Nombre de pages <input type="number" name="pages" min="1" max="500" value="1"></label>` : ''}
                ${mode !== 'design' ? `<fieldset class="span-2 ly-newpage"><legend>Pages, marges et colonnes</legend><div class="ly-newgrid">
                    <label class="checkbox-line"><input type="checkbox" name="facing" ${d.facing ? 'checked' : ''}> Pages en vis-à-vis (livre)</label>
                    <label>Marge haut <input type="number" step="0.5" min="0" name="mt" value="${d.mt}"></label><label>Marge bas <input type="number" step="0.5" min="0" name="mb" value="${d.mb}"></label><label data-in>Petit fond (intérieur) <input type="number" step="0.5" min="0" name="mi" value="${d.mi}"></label><label data-out>Grand fond (extérieur) <input type="number" step="0.5" min="0" name="mo" value="${d.mo}"></label>
                    <label>Colonnes <input type="number" min="1" max="12" name="columns" value="${d.columns}"></label><label>Gouttière<input data-unit="mm" type="number" step="0.5" min="0" name="gutter" value="${d.gutter}"></label>
                    <label>Fond perdu<input data-unit="mm" type="number" step="0.5" min="0" max="20" name="bleed" value="${d.bleed}"></label><label>Ligne-bloc<input data-unit="mm" type="number" step="0.5" min="0" max="60" name="slug" value="${d.slug}"></label></div>
                    <p class="muted">Marges en millimètres. Le fond perdu (trait rouge) dépasse de la page pour les images à bord perdu ; la ligne-bloc (trait bleu) garde la place des notes pour l’imprimeur. Les deux s’impriment avec « PDF avec fond perdu et traits de coupe ».</p></fieldset>` : ''}
                ${mode === 'family' ? `<label>Qui <select name="scope"><option value="ancestors">les ancêtres de…</option><option value="descendants">les descendants de…</option><option value="both">ancêtres et descendants de…</option><option value="all">toute la base</option></select></label>
                <div><span class="pk-lab">Personne de départ</span>${(window.LCNDA_PICKER || A()).pickerField({name: 'book_root', kind: 'person', value: start || null})}</div>
                <label>Générations <input type="number" name="generations" min="1" max="30" value="5"></label><label>Ordre des fiches <select name="order"><option value="book">celui de l’arbre</option><option value="generation">par génération</option><option value="birth">par naissance</option><option value="name">par nom</option></select></label>
                <label>Titre <input name="title" placeholder="automatique si vide"></label><label>Sous-titre <input name="subtitle"></label><label>Auteur <input name="author"></label><label>Photos par personne <input type="number" name="photo_count" min="0" max="8" value="3"></label>
                <label class="span-2">Préface <textarea name="preface" rows="3" maxlength="8000"></textarea></label><label class="span-2">Mot de la fin <textarea name="epilogue" rows="2" maxlength="8000"></textarea></label>
                <fieldset class="span-2"><legend>Les parties du livre</legend>${SECS.map(([k, l]) => `<label class="checkbox-line"><input type="checkbox" name="sec_${k}" ${['cover', 'preface', 'stats', 'people', 'chronology', 'index'].includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</fieldset>` : ''}</div>
                ${mode === 'design' ? '<p class="muted">Le design est copié : couverture, pages d’exemple, gabarits, styles et couleurs — tout se modifie.</p>' : mode === 'family' ? '<p class="muted">Le livre est fait page par page (les textes trop longs continuent sur la page suivante) ; tout se modifie ensuite. Les personnes cachées à l’export restent cachées.</p>' : ''}`,
            onOpen: dg => { bindFormatFields(dg); const fc = dg.querySelector('[name=facing]'); const lab = () => { const on = fc?.checked; const a = dg.querySelector('[data-in]'), b = dg.querySelector('[data-out]'); if (a) a.firstChild.textContent = on ? 'Petit fond (intérieur) ' : 'Marge gauche '; if (b) b.firstChild.textContent = on ? 'Grand fond (extérieur) ' : 'Marge droite '; }; fc?.addEventListener('change', lab); lab(); },
            onSubmit: async f => {
                const v = Object.fromEntries(new FormData(f));
                const fm = f.closest('dialog')._formatMm?.();
                if (fm && (fm.w < 30 || fm.h < 30)) { toast('Format entre 3 cm et 1,5 m de côté.', 'error'); return false; }
                const pageOpts = mode !== 'design' ? {w: fm.w, h: fm.h, facing: !!v.facing, mt: clamp(v.mt, 0, 300), mb: clamp(v.mb, 0, 300), mi: clamp(v.mi, 0, 300), mo: clamp(v.mo, 0, 300), columns: clamp(v.columns, 1, 12), gutter: clamp(v.gutter, 0, 60), bleed: clamp(v.bleed, 0, 30), slug: clamp(v.slug, 0, 80)} : null;
                let doc, th = THEMES[0], designDoc = null;
                if (v.design?.startsWith('m:')) { const r = await api('layout_doc', {id: Number(v.design.slice(2))}); designDoc = r.doc; th = THEMES.find(t => t.titleFont === designDoc.paraStyles?.find(s => s.id === 'ps-title')?.font) || THEMES[0]; }
                else if (v.design?.startsWith('b:')) th = THEMES.find(t => t.id === v.design.slice(2)) || THEMES[0];
                if (mode === 'blank') { doc = newDoc(pageOpts || {}); for (let i = 1; i < clamp(v.pages, 1, 500); i++) doc.pages.push({id: nid('p'), master: 'A', items: []}); }
                else if (mode === 'design') { doc = designDoc ? cleanDoc(designDoc) : builtinDesign(th, 'A4'); if (fm) { doc.page.w = r1(fm.w); doc.page.h = r1(fm.h); } }
                else {
                    const root = f.elements.book_root?.value || String(start || '');
                    if (v.scope !== 'all' && !Number(root)) return window.LCNDA_UI.fail(f.elements.book_root || f.querySelector('.pk'), 'Choisis la personne de départ.');
                    toast('Le livre se prépare…');
                    const data = await api('layout_family_data', {scope: v.scope, root_id: root, generations: String(clamp(v.generations, 1, 30)), order: v.order, photo_count: String(clamp(v.photo_count, 0, 8)), event_count: '20', sections: 'cover,tree,people,chronology,places,index,stats', parts: 'bio,family,events,photos,notes', title: v.title || '', subtitle: v.subtitle || '', author: v.author || ''});
                    const sections = SECS.map(x => x[0]).filter(k => v['sec_' + k]);
                    doc = familyDoc(data, th, {size: '', pageOpts, sections, title: v.title || data.title, subtitle: v.subtitle, author: v.author, preface: v.preface, epilogue: v.epilogue, designDoc});
                }
                openEditor({id: 0, name: (v.name || 'Mon livre').slice(0, 160), doc, onSaved});
            }});
    }
    ext.openLayoutStudio = openLibrary;
    /* Listes → 📐 Livres de famille : ce qu'on a fait dans l'atelier (livres et designs), pour les ouvrir, en créer, régler */
    ext.lists = ext.lists || {};
    // pour Listes → 🛠️ Outils de modification
    ext.openLayoutDoc = async (id, onSaved) => { const r = await api('layout_doc', {id}); return openEditor({id: r.id, name: r.name, doc: r.doc, isDesign: !!r.is_design, onSaved, rev: r.rev}); };
    ext.newLayoutDoc = (mode, onSaved) => newDocWizard(mode, onSaved);
    // 🎨 pour heritage-artist-catalogue.js : fabriquer un livre (catalogue raisonné, discographie) avec les mêmes briques que le livre de famille
    ext.layoutKit = {SIZES, THEMES, themeDoc, baseStyles, baseSwatches, folioMaster, defaults, cleanDoc, nid, box, flow, textItem, shapeItem, coverItems, openEditor, printHtml, buildEpub, resolveDoc, pageHtml, pageSize, docCss, BASE_CSS, px}; // les cinq derniers : ⤓ PDF/A (heritage-layout-pdfa.js)
    ext.layoutCoverHtml = (cover, w) => coverHtml(cover, w);
    ext.lists.layout_books = async token => {
        const S = A().state, ws = A().$('#workspace'), UI = window.LCNDA_UI;
        // H10 : « N documents · [Liste | Fiches] · Trier : … », retenus pour cette liste
        const KEY = 'listes:layout_books';
        let sort = UI?.sortOf ? UI.sortOf(KEY) : 'recent', view = UI?.viewOf ? UI.viewOf(KEY) : 'list';
        // H10 : la barre commune (🔍 Chercher · Filtrer ▾ Sorte · Liste | Fiches · Trier), retenue pour cette liste
        let all = null, q = '', kinds = [];
        const fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const draw = async (refetch = true) => {
            if (refetch || !all) { all = []; try { all = (await api('layout_docs')).docs || []; } catch (err) { toast(err.message, 'error'); } }
            if (token !== S.workspaceToken || S.module !== 'listes') return;
            const saved = UI?.listBarState?.(KEY); if (saved) { q = saved.q || ''; kinds = saved.f?.kind || []; sort = saved.sort || sort; }
            const words = fold(q).split(/\s+/).filter(Boolean);
            let docs = all.filter(x => words.every(w => fold(x.name).includes(w)) && (!kinds.length || kinds.includes(x.is_design ? 'design' : 'book')));
            if (UI?.sortItems) docs = UI.sortItems(docs, sort, {name: x => x.name, date: x => x.updated_at});
            const fmtDate = d => window.LCNDA_UI?.when?.(d) || ''; // K4
            const row = x => `<tr><td class="ly-listcover">${coverHtml(x.cover, 46)}</td><td><button type="button" class="table-link" data-lyl-open="${x.id}">${esc(x.name)}</button></td><td>${x.is_design ? '🎨 Design' : '📖 Livre'}</td><td>${x.pages}</td><td>${fmtDate(x.updated_at)}</td>
                <td><div class="ly-listact"><button type="button" class="button small" data-lyl-open="${x.id}">${x.is_design ? 'Modifier' : 'Ouvrir'}</button>${x.is_design ? `<button type="button" class="button small secondary" data-lyl-use="${x.id}">Utiliser</button>` : ''}<button type="button" class="button small secondary" data-lyl-dup="${x.id}">Dupliquer</button><button type="button" class="button small secondary" data-lyl-ren="${x.id}">Renommer</button><button type="button" class="button small secondary" data-lyl-exp="${x.id}">Exporter</button><button type="button" class="button small secondary danger" data-lyl-del="${x.id}">🗑</button></div></td></tr>`;
            const books = docs.filter(x => !x.is_design), designs = docs.filter(x => x.is_design);
            const acts = x => `<button type="button" class="button small" data-lyl-open="${x.id}">${x.is_design ? 'Modifier' : 'Ouvrir'}</button>${x.is_design ? `<button type="button" class="button small secondary" data-lyl-use="${x.id}">Utiliser</button>` : ''}<button type="button" class="icon-button small" data-lyl-dup="${x.id}" title="Dupliquer" aria-label="Dupliquer">⧉</button><button type="button" class="icon-button small" data-lyl-ren="${x.id}" title="Renommer" aria-label="Renommer">✎</button><button type="button" class="icon-button small" data-lyl-exp="${x.id}" title="Exporter" aria-label="Exporter">⤓</button><button type="button" class="icon-button small" data-lyl-del="${x.id}" title="Supprimer" aria-label="Supprimer">🗑</button>`;
            const table = (list, empty) => list.length && view === 'cards' && UI?.cardsHtml ? UI.cardsHtml(list.map(x => ({thumb: coverHtml(x.cover, 96) || `<span class="ui-card-ico">${x.is_design ? '🎨' : '📕'}</span>`, name: x.name, open: `data-lyl-open="${x.id}"`, lines: [`${x.is_design ? '🎨 Design' : '📖 Livre'} · ${x.pages} page${x.pages > 1 ? 's' : ''}`], when: x.updated_at, whenLabel: 'Modifié', openLabel: x.is_design ? 'Modifier' : 'Ouvrir', quick: x.is_design ? `<button type="button" class="button small secondary" data-lyl-use="${x.id}">Utiliser</button>` : '', actions: acts(x).replace(/^<button type="button" class="button small" data-lyl-open="\d+">[^<]*<\/button>/, '').replace(/<button type="button" class="button small secondary" data-lyl-use="\d+">Utiliser<\/button>/, '')}))) : list.length ? `<div class="data-table-wrap"><table class="data-table ly-listtable"><thead><tr><th></th><th>Nom</th><th>Sorte</th><th>Pages</th><th>Modifié</th><th></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>` : A().empty(empty);
            ws.innerHTML = `<section class="page collection-page ly-listpage" data-dnd-off><header class="page-header"><div><span class="eyebrow">LISTES</span><h2>📐 Livres de famille</h2><p>Les livres faits dans l’atelier de mise en page (façon InDesign) et tes designs : ouvre-les, crée-en un, règle les réglages par défaut.</p></div>
                <div class="page-actions"><button type="button" class="button" data-lyl-new="family">＋ Nouveau livre d’après la famille</button><button type="button" class="button secondary" data-lyl-new="template">📚 Livre prêt à l’emploi</button><button type="button" class="button secondary" data-lyl-new="design">🎨 Depuis un design</button><button type="button" class="button secondary" data-lyl-new="blank">📄 Page blanche</button><button type="button" class="button secondary" data-lyl-defaults>⚙️ Réglages par défaut</button><button type="button" class="button secondary" data-lyl-studio>↗ Ouvrir l’atelier</button></div></header>
                ${all.length ? '<div data-lyl-bar></div>' : ''}${!kinds.length || kinds.includes('book') ? `<h3>📖 Livres (${books.length})</h3>${table(books, q.trim() ? `Aucun livre pour « ${q.trim()} ».` : 'Aucun livre pour l’instant : « ＋ Nouveau livre d’après la famille ».')}` : ''}
                ${!kinds.length || kinds.includes('design') ? `<h3>🎨 Mes designs (${designs.length})</h3>${table(designs, q.trim() ? `Aucun design pour « ${q.trim()} ».` : 'Aucun design à toi : dans un livre, Fichier → « Enregistrer comme design », ou « ↗ Ouvrir l’atelier » → Designs de l’app → « Modifier (à mon nom) ».')}` : ''}</section>`;
            const slot = ws.querySelector('[data-lyl-bar]');
            if (slot && UI?.listBar) {
                const bar = UI.listBar({key: KEY, search: {placeholder: 'Chercher un livre ou un design… (nom)'}, filters: [{id: 'kind', label: 'Sorte', type: 'check', options: [['book', '📖 Livres'], ['design', '🎨 Designs']]}],
                    view: {what: 'documents', onChange: v => { view = v; draw(false); }}, sort: {options: [['recent', 'Les plus récents'], ['old', 'Les plus anciens'], ['az', 'A → Z'], ['za', 'Z → A']], value: sort},
                    onChange: (b, {what}) => { sort = b.sort; UI.setSort(KEY, sort); if (what !== 'view') draw(false); }});
                bar.setCount(`${A().plural(docs.length, 'document')}${docs.length !== all.length ? ` sur ${all.length}` : ''}`);
                slot.replaceWith(bar);
            }
        };
        await draw();
        const again = () => { if (S.module === 'listes' && S.listType === 'layout_books') draw(); };
        ws.onclick = async e => {
            const b = e.target.closest('button'); if (!b || !ws.querySelector('.ly-listpage')) return; const d = b.dataset;
            try {
                if (d.lylNew) return newDocWizard(d.lylNew, again);
                if (d.lylDefaults !== undefined) return defaultsDialog();
                if (d.lylStudio !== undefined) return openLibrary();
                if (d.lylOpen) { const r = await api('layout_doc', {id: Number(d.lylOpen)}); return openEditor({id: r.id, name: r.name, doc: r.doc, isDesign: !!r.is_design, onSaved: again, rev: r.rev}); }
                if (d.lylUse) return newDocWizard('design', again, {designId: Number(d.lylUse)});
                if (d.lylDup) { const r = await api('layout_doc', {id: Number(d.lylDup)}); await post('save_layout_doc', {name: `${r.name} (copie)`.slice(0, 160), is_design: r.is_design, doc: r.doc}); toast('Copie faite.'); return draw(); }
                if (d.lylRen) { const r = await api('layout_doc', {id: Number(d.lylRen)}), n = await ask('Nouveau nom :', r.name); if (!n) return; await post('save_layout_doc', {id: r.id, name: n, is_design: r.is_design, doc: r.doc}); return draw(); }
                if (d.lylExp) { const r = await api('layout_doc', {id: Number(d.lylExp)}); return download(`${slug(r.name)}.json`, new Blob([JSON.stringify({type: 'lcnda-mise-en-page-livre', version: 1, name: r.name, is_design: r.is_design, doc: r.doc})], {type: 'application/json'})); }
                if (d.lylDel) { if (!await A().confirmBox('Exporte-le d’abord si tu veux le garder.', {title: 'Supprimer ce document ?', okLabel: 'Supprimer le document'})) return; await post('delete_layout_doc', {id: Number(d.lylDel)}); toast('Document supprimé.'); return draw(); }
            } catch (err) { toast(err.message, 'error'); }
        };
    };
    // le bouton dans Export propre → Livre de famille
    document.addEventListener('click', e => { if (e.target.closest('[data-open-layout-studio]')) { e.preventDefault(); openLibrary(); } });
})();
