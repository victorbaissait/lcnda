/**
 * 📐 Atelier de mise en page (Maintenance → Export propre → Livre de famille → « 📐 Mise en page ») : un petit InDesign
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
    const allSizes = () => [...SIZES, ...myFormats().map(f => [f.k, `★ ${f.name} (${String(r1(f.w / 10)).replace('.', ',')} × ${String(r1(f.h / 10)).replace('.', ',')} cm)`, f.w, f.h])];
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
        del.addEventListener('click', () => { const k = sel.value, f = myFormats().find(x => x.k === k); if (!f || !confirm(`Supprimer le format « ${f.name} » ?`)) return; try { localStorage.setItem(FORMATS_KEY, JSON.stringify(myFormats().filter(x => x.k !== k))); } catch (_) {} sel.querySelector(`option[value="${k}"]`)?.remove(); sel.value = 'custom'; note(); });
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

    /* ═════════════ Réglages par défaut (Maintenance : « Réglages par défaut » de l'atelier) ═════════════ */
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
            pages: [{id: nid('p'), master: 'A', items: []}]};
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
        out.pages = (Array.isArray(d.pages) ? d.pages : []).slice(0, 2000).map(p => ({id: idOk(p?.id) ? p.id : nid('p'), master: out.masters.some(m => m.id === p?.master) ? p.master : '', items: items(p?.items)}));
        if (!out.pages.length) out.pages.push({id: nid('p'), master: out.masters[0]?.id || '', items: []});
        return out;
    }
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
        if (it.type === 'text' && ['toc', 'index'].includes(it.auto)) { o.auto = it.auto; o.autoStyles = (Array.isArray(it.autoStyles) ? it.autoStyles : []).filter(x => /^[a-z0-9_-]{1,40}$/i.test(String(x))).slice(0, 12); o.autoPs = /^[a-z0-9_-]{1,40}$/i.test(String(it.autoPs || '')) ? it.autoPs : 'ps-body'; o.autoDots = it.autoDots !== false;
            if (Array.isArray(it.names)) o.names = it.names.filter(n => typeof n === 'string').slice(0, 20000).map(n => n.slice(0, 160)); }
        if (Number(it.mediaId) > 0) o.mediaId = Math.round(Number(it.mediaId));
        if (it.type === 'frame' && Number(it.diagramId) > 0) o.diagramId = Math.round(Number(it.diagramId));
        if (it.type === 'text' && it.dyn?.type === 'person' && Number(it.dyn.id) > 0) o.dyn = {type: 'person', id: Math.round(Number(it.dyn.id)), fields: (Array.isArray(it.dyn.fields) ? it.dyn.fields : []).filter(f => DYN_FIELDS.some(d => d[0] === f)), at: String(it.dyn.at || '').slice(0, 40)};
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
            ...doc.charStyles.map(s => `${S}[data-cs="${s.id}"]{${styleCss(doc, s, false)}}`)].join('\n');
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
            inner = `${back}<div class="ly-txtbox" style="padding:${ins}px;justify-content:${jc}"><div class="ly-txt" ${editing ? 'contenteditable="true" spellcheck="true"' : ''} style="column-count:${cols};column-gap:${px(it.gutter ?? 4)}px">${wrapFloats(doc, it, ctx.others || [])}${body}</div></div>`;
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
        const linkWrap = it.link && ctx.print ? s => `<a href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">${s}</a>` : s => s;
        return `<div ${attrs}>${linkWrap(inner)}</div>`;
    }
    /** Les objets d'une page dans l'ordre d'affichage : calque du bas d'abord */
    const ordered = (doc, items) => doc.layers.slice().reverse().flatMap(l => items.filter(it => it.layer === l.id)).concat(items.filter(it => !doc.layers.some(l => l.id === it.layer)));
    function pageHtml(doc, i, ctx = {}) {
        const pg = doc.pages[i], master = doc.masters.find(m => m.id === pg.master), W = px(doc.page.w), H = px(doc.page.h), m = pageMargins(doc, i);
        const c = {...ctx, pageNo: i + (doc.page.start || 1), pages: doc.pages.length + (doc.page.start || 1) - 1, title: doc.title};
        if (master?.items.some(x => (x.html || '').includes('{chapitre}'))) c.chapter = chapterAt(doc, i);
        const masterItems = master && !ctx.editMaster ? ordered(doc, master.items) : [];
        const all = [...masterItems, ...pg.items];
        const guides = ctx.print || ctx.preview ? '' : `<div class="ly-margins" style="left:${px(m.l)}px;top:${px(m.t)}px;right:${px(m.r)}px;bottom:${px(m.b)}px">${doc.page.columns > 1 ? Array.from({length: doc.page.columns - 1}, (_, k) => { const cw = (doc.page.w - m.l - m.r - doc.page.gutter * (doc.page.columns - 1)) / doc.page.columns; const x = (cw + doc.page.gutter) * (k + 1); return `<i style="left:${px(x - doc.page.gutter)}px;width:${px(doc.page.gutter)}px"></i>`; }).join('') : ''}</div>`;
        const items = ordered(doc, pg.items);
        const outer = ctx.print || ctx.preview ? '' : `${doc.page.bleed ? `<div class="ly-bleed" style="inset:-${px(doc.page.bleed)}px"></div>` : ''}${doc.page.slug ? `<div class="ly-slug" style="inset:-${px((doc.page.bleed || 0) + doc.page.slug)}px"></div>` : ''}`;
        return `<div class="ly-page${isLeftPage(doc, i) ? ' is-left' : ''}" data-page="${i}" style="width:${W}px;height:${H}px;background:${cssPaint(doc, doc.page.paper)}">${outer}${guides}${masterItems.map(it => itemHtml(doc, it, {...c, master: true, others: all})).join('')}${items.map(it => itemHtml(doc, it, {...c, others: all})).join('')}${ctx.print ? '' : `<span class="ly-pageno">${c.pageNo}${master ? ` · ${esc(master.name.split('-')[0])}` : ''}</span>`}</div>`;
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
    const BASE_CSS = `.ly-page{position:relative;overflow:hidden;flex:none}.ly-item{position:absolute;transform-origin:50% 50%;box-sizing:border-box}.ly-svg{position:absolute;left:0;top:0;overflow:visible}.ly-txtbox{position:absolute;inset:0;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden}.ly-txt{outline:none;column-fill:auto;height:auto;max-height:100%;overflow-wrap:break-word}.ly-txt p,.ly-txt h1,.ly-txt h2,.ly-txt h3,.ly-txt h4{margin:0}.ly-txt ul,.ly-txt ol{margin:0;padding-left:1.4em}.ly-txt a{color:inherit}.ly-wrapf{pointer-events:none}.ly-toc{display:flex;align-items:baseline;gap:.35em}.ly-toc .ly-tl{flex:1;min-width:1em;border-bottom:1px dotted currentColor;transform:translateY(-.3em)}.ly-toc .ly-tsp{flex:1}[data-cont]{text-indent:0!important}`;
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
    const box = (doc, i) => { const m = pageMargins(doc, i); return {x: m.l, y: m.t, w: doc.page.w - m.l - m.r, h: doc.page.h - m.t - m.b}; };
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
        t.style.height = bx.clientHeight - px(it.inset || 0) * 2 + 'px';
        return t.scrollWidth > t.clientWidth + 2 || t.scrollHeight > bx.clientHeight - px(it.inset || 0) * 2 + 1;
    }
    const paraHtml = p => `<p data-ps="${p.ps}">${p.lead ? `<b>${esc(p.lead)}</b> ` : ''}${esc(p.text)}</p>`;
    /** Combien de paragraphes tiennent dans ce cadre (un paragraphe trop long est coupé entre deux mots) */
    function fill(doc, frame, paras, others) {
        const fits = list => !measureOverflow(doc, {...frame, html: list.map(paraHtml).join('')}, others);
        let lo = 0, hi = paras.length;
        while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (fits(paras.slice(0, mid))) lo = mid; else hi = mid - 1; }
        if (lo < paras.length) { // une partie du paragraphe suivant, mot à mot
            const p = paras[lo], words = String(p.text).split(/\s+/); let a = 0, b = words.length - 1;
            while (a < b) { const mid = Math.ceil((a + b) / 2); if (fits([...paras.slice(0, lo), {...p, text: words.slice(0, mid).join(' ')}])) a = mid; else b = mid - 1; }
            if (a >= 3) return {html: [...paras.slice(0, lo), {...p, text: words.slice(0, a).join(' ')}].map(paraHtml).join(''), rest: [{...p, lead: '', text: words.slice(a).join(' ')}, ...paras.slice(lo + 1)]};
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
            if (sec === 'stats' && data.stats) { const s = data.stats; chapter('La famille en chiffres', [{ps: 'ps-body', text: `${s.people} personnes, ${s.men} hommes et ${s.women} femmes${s.from ? `, nées entre ${s.from} et ${s.to}` : ''}.`}, s.age ? {ps: 'ps-body', text: `Âge moyen au décès : ${s.age} ans.`} : null, {ps: 'ps-body', text: `${s.places} lieux, ${s.events} événements datés.`}, {ps: 'ps-head', text: 'Les noms les plus portés'}, ...Object.entries(s.surnames || {}).map(([n, c]) => ({ps: 'ps-list', text: `• ${n} — ${c}`}))].filter(Boolean)); }
            if (sec === 'tree' && data.tree) { const paras = []; Object.entries(data.tree.ancestors || {}).forEach(([g, rows]) => { paras.push({ps: 'ps-head', text: `Génération ${g}`}); Object.values(rows).forEach(([n, name, life]) => paras.push({ps: 'ps-list', lead: String(n), text: `${name} (${life})`})); }); Object.values(data.tree.descendants || {}).forEach(([n, name, life]) => paras.push({ps: 'ps-list', lead: String(n), text: `${name} (${life})`})); if (paras.length) chapter('L’arbre', paras); }
            if (sec === 'people') (data.persons || []).forEach(p => {
                const paras = [];
                if (p.bio) String(p.bio).split(/\n+/).filter(Boolean).forEach(t => paras.push({ps: 'ps-body', text: t}));
                const fam = [p.parents?.length && `Parents : ${p.parents.join(', ')}`, p.partners?.length && `Conjoint(s) : ${p.partners.join(', ')}`, p.children?.length && `Enfants : ${p.children.join(', ')}`].filter(Boolean);
                if (fam.length) { paras.push({ps: 'ps-head', text: 'Famille'}); fam.forEach(t => paras.push({ps: 'ps-list', text: `• ${t}`})); }
                if (p.events?.length) { paras.push({ps: 'ps-head', text: 'Repères'}); p.events.forEach(e => paras.push({ps: 'ps-list', lead: e.date || '?', text: `${e.type}${e.place ? ' — ' + e.place : ''}`})); }
                if (p.notes?.length) { paras.push({ps: 'ps-head', text: 'Notes'}); p.notes.forEach(n => paras.push({ps: 'ps-body', text: [n.title, n.body].filter(Boolean).join(' — ')})); }
                if (!paras.length) paras.push({ps: 'ps-body', text: ' '});
                const pg = {id: nid('p'), master: 'A', items: []}; doc.pages.push(pg); personPage(doc, doc.pages.length - 1, th, p, paras, pg);
            });
            if (sec === 'chronology' && data.chronology?.length) chapter('Chronologie', data.chronology.map(e => ({ps: 'ps-list', lead: e.date, text: `${e.type} — ${e.who}${e.place ? ` (${e.place})` : ''}`})));
            if (sec === 'places' && data.places?.length) chapter('Les lieux de la famille', data.places.map(pl => ({ps: 'ps-list', lead: pl.place, text: `${pl.events} événement(s), ${pl.people} personne(s)${pl.from ? `, de ${pl.from} à ${pl.to}` : ''}`})));
            if (sec === 'index' && data.index?.length) chapter('Index des noms', data.index.map(x => ({ps: 'ps-list', text: `${x.name} (${x.life})${x.number ? ' — ' + x.number : ''}`})), {columns: 2});
            if (sec === 'epilogue' && o.epilogue) chapter('Mot de la fin', String(o.epilogue).split(/\n+/).filter(Boolean).map(t => ({ps: 'ps-body', text: t})));
        });
        if (!doc.pages.length) doc.pages.push({id: nid('p'), master: 'A', items: []});
        return doc;
    }
    /* ═════════════ L'éditeur ═════════════ */
    const TOOLS = [['select', '➤', 'Sélection (V)', 'v'], ['text', 'T', 'Texte (T)', 't'], ['frame', '⊠', 'Cadre d’image (F)', 'f'], ['rect', '▭', 'Rectangle (M)', 'm'], ['ellipse', '◯', 'Ellipse (L)', 'l'], ['polygon', '⬡', 'Polygone (Y)', 'y'], ['star', '☆', 'Étoile (E)', 'e'], ['line', '╲', 'Ligne (\\)', '\\'], ['pen', '✒︎', 'Plume (P) : clic = point, double-clic ou Entrée = fini', 'p'], ['hand', '✋', 'Main (H)', 'h'], ['zoom', '🔍', 'Zoom (Z) — Alt pour reculer', 'z']];
    const PANELS = [['pages', '📄', 'Pages'], ['layers', '🗂', 'Calques'], ['obj', '🔧', 'Objet'], ['text', '🅰', 'Texte'], ['color', '🎨', 'Couleur'], ['links', '🔗', 'Liens'], ['history', '🕘', 'Historique'], ['doc', '⚙️', 'Document']];
    let localFonts = null;
    const fontList = () => { let mine = []; try { mine = JSON.parse(localStorage.getItem(FONTS_KEY) || '[]'); } catch (_) {} return [...new Set([...(Array.isArray(mine) ? mine : []).map(fontOk).filter(Boolean), ...(localFonts || []), ...BASE_FONTS])]; };
    /* Choix d'une police : un champ et une liste à nous (celle du système ne défile pas dans l'app de bureau) — on tape pour filtrer, chaque police est montrée dans son dessin */
    const fontPickHtml = (attrs, value = '', placeholder = 'Georgia…') => `<span class="ly-fontpick"><input ${attrs} value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" data-fontpick><button type="button" class="ly-fontpick-open" tabindex="-1" aria-label="Toutes les polices" data-fontpick-open>▾</button><div class="ly-fontlist" hidden role="listbox"></div></span>`;
    function bindFontPick(root) {
        if (root.dataset.fontpickBound) return; root.dataset.fontpickBound = '1';
        const listOf = inp => inp.closest('.ly-fontpick')?.querySelector('.ly-fontlist');
        const fill = (inp, all = false) => {
            const box = listOf(inp); if (!box) return;
            const q = all ? '' : inp.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
            const fonts = fontList().filter(f => !q || f.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
            box.innerHTML = fonts.length ? fonts.map(f => `<button type="button" role="option" data-fp="${esc(f)}" style="font-family:'${fontOk(f)}',sans-serif">${esc(f)}</button>`).join('') : '<p class="ly-help">Aucune police de ce nom. « 🖥 Polices de l’ordinateur » pour toutes les voir, ou tape son nom exact puis Entrée.</p>';
            box.hidden = false; box.scrollTop = 0;
        };
        const close = () => root.querySelectorAll('.ly-fontlist').forEach(b => { b.hidden = true; });
        const pick = (inp, f) => { inp.value = f; close(); inp.dispatchEvent(new Event('change', {bubbles: true})); };
        root.addEventListener('focusin', e => { if (e.target.matches?.('[data-fontpick]')) fill(e.target, true); });
        root.addEventListener('input', e => { if (e.target.matches?.('[data-fontpick]')) fill(e.target); });
        root.addEventListener('mousedown', e => { if (e.target.closest('.ly-fontlist, [data-fontpick-open]')) e.preventDefault(); }); // le texte choisi reste choisi
        root.addEventListener('click', e => {
            const o = e.target.closest('[data-fontpick-open]'); if (o) { const inp = o.parentElement.querySelector('[data-fontpick]'); const box = listOf(inp); if (box.hidden) fill(inp, true); else close(); return; }
            const b = e.target.closest('[data-fp]'); if (b) { e.stopPropagation(); pick(b.closest('.ly-fontpick').querySelector('[data-fontpick]'), b.dataset.fp); return; }
            if (!e.target.closest('.ly-fontpick')) close();
        });
        root.addEventListener('keydown', e => {
            const inp = e.target.closest?.('[data-fontpick]'); if (!inp) return; const box = listOf(inp), items = [...box.querySelectorAll('[data-fp]')];
            if (e.key === 'Escape') { if (!box.hidden) { e.preventDefault(); e.stopPropagation(); close(); } return; }
            if (e.key === 'Enter') { e.preventDefault(); const cur = box.querySelector('.is-cur') || (box.hidden ? null : items[0]); if (cur && !box.hidden) pick(inp, cur.dataset.fp); else if (inp.value.trim()) pick(inp, fontOk(inp.value.trim())); return; }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (box.hidden) fill(inp, true); const its = [...box.querySelectorAll('[data-fp]')]; let k = its.findIndex(x => x.classList.contains('is-cur')); its[k]?.classList.remove('is-cur'); k = Math.max(0, Math.min(its.length - 1, k + (e.key === 'ArrowDown' ? 1 : -1))); its[k]?.classList.add('is-cur'); its[k]?.scrollIntoView({block: 'nearest'}); }
        });
        root.addEventListener('focusout', e => { if (e.target.matches?.('[data-fontpick]')) setTimeout(() => { if (!root.contains(document.activeElement) || !document.activeElement.closest('.ly-fontpick')) close(); }, 150); });
    }

    async function openEditor({id = 0, name = 'Sans titre', doc, isDesign = false, onSaved}) {
        let D = cleanDoc(doc), docId = id, docName = name, design = !!isDesign, dirty = false;
        let cur = 0, editMaster = null, sel = [], editingId = null, tool = 'select', zoom = 0.75, fillTarget = 'fill', guides = true, snapOn = true, preview = false, panel = 'pages', clip = null, savedRange = null, lastTextColor = '#111111';
        let act = ''; // ce qu'on vient de faire, pour l'historique
        const dl = document.createElement('dialog'); dl.className = 'modal ly-editor'; dl.dataset.dndOff = ''; dl.dataset.ownClose = '1'; // l'atelier a ses propres flèches : pas de poignée ⠿ de l'app (elle cassait la grille avec un seul calque)
        dl.innerHTML = `<div class="ly-top">
                <span class="ly-brand">📐</span><input class="ly-name" data-ly-name value="${esc(docName)}" aria-label="Nom du document"><span class="ly-kind" data-ly-kind></span>
                <span class="ly-menus" data-tbg="ly-menus" data-tbg-label="Menus du haut">${menu('Fichier', [['save', '💾 Enregistrer', '⌘S'], ['saveas', 'Enregistrer une copie…'], ['savedesign', '🎨 Enregistrer comme design…'], ['-'], ['pdf', '📄 Exporter en PDF (imprimer)…'], ['pdfbleed', '📄 PDF avec fond perdu et traits de coupe…'], ['html', '🌐 Exporter en page HTML'], ['json', '⬇️ Exporter le fichier du document (.json)'], ['-'], ['preflight', '✅ Contrôle avant impression…'], ['relink', '🔗 Mettre à jour les liens (photos, fiches)'], ['stylelib', '🎨 Mes styles (pour tous mes documents)…'], ['-'], ['close', 'Fermer']])}
                ${menu('Édition', [['undo', '↶ Annuler', '⌘Z'], ['redo', '↷ Rétablir', '⇧⌘Z'], ['-'], ['cut', 'Couper', '⌘X'], ['copy', 'Copier', '⌘C'], ['paste', 'Coller', '⌘V'], ['dup', 'Dupliquer', '⌘D'], ['del', 'Supprimer', '⌫'], ['-'], ['all', 'Tout sélectionner', '⌘A'], ['none', 'Désélectionner', 'Échap']])}
                ${menu('Objet', [['front', 'Premier plan', '⇧⌘]'], ['fwd', 'Avancer', '⌘]'], ['back', 'Reculer', '⌘['], ['bottom', 'Arrière-plan', '⇧⌘['], ['-'], ['lock', '🔒 Verrouiller / déverrouiller'], ['hide', '🙈 Masquer'], ['showall', '👁 Tout afficher'], ['-'], ['fitframe', 'Ajuster le cadre au contenu'], ['place', '🖼️ Placer une image (liée si elle vient de l’app)…'], ['-'], ['chain', '➜ Chaîner le bloc de texte vers un autre…'], ['autoflow', '⤵ Faire couler le texte sur de nouvelles pages'], ['unchain', 'Couper le chaînage'], ['-'], ['toc', '📑 Insérer une table des matières'], ['index', '🔤 Insérer un index des noms'], ['dynperson', '👤 Insérer le texte d’une fiche (objet dynamique)…'], ['dyndiagram', '📊 Insérer un diagramme (objet dynamique)…']])}
                ${menu('Page', [['addend', '➕ Ajouter une page à la fin'], ['insert', '➕ Insérer des pages…'], ['duppage', 'Dupliquer la page'], ['delpage', '🗑 Supprimer la page'], ['-'], ['masters', '📄 Gabarit de plusieurs pages…'], ['-'], ['goto', 'Aller à la page…', '⌘J'], ['first', '⏮ Première page'], ['prev', '‹ Page précédente', 'Pg↑'], ['next', 'Page suivante ›', 'Pg↓'], ['last', 'Dernière page ⏭']])}
                ${menu('Affichage', [['zin', 'Zoom avant', '⌘+'], ['zout', 'Zoom arrière', '⌘−'], ['zfit', 'Page entière', '⌘0'], ['z100', 'Taille réelle (100 %)', '⌘1'], ['-'], ['guides', 'Repères et marges'], ['snap', 'Magnétisme'], ['preview', 'Aperçu (sans repères)', 'W']])}</span>
                <span class="ly-hbtns" data-tbg="ly-hist" data-tbg-label="Annuler / rétablir (en haut)"><button type="button" class="ly-hbtn" data-ly-cmd="undo" title="Annuler (⌘Z)">↶</button><button type="button" class="ly-hbtn" data-ly-cmd="redo" title="Rétablir (⇧⌘Z)">↷</button></span><span class="ly-spacer"></span><span class="ly-state" data-ly-state></span>${ext.tbButton ? ext.tbButton('layout') : ''}<button type="button" class="button small" data-ly-cmd="save">💾 Enregistrer</button>${ext.fullButton ? ext.fullButton('layout') : ''}<button type="button" class="icon-button" data-ly-cmd="close" aria-label="Fermer">×</button></div>
            <div class="ly-main"><div class="ly-tools" data-tbg="ly-tools" data-tbg-label="Outils (colonne de gauche)">${TOOLS.map(([k, ic, l]) => `<button type="button" data-ly-tool="${k}" title="${esc(l)}" class="${k === 'select' ? 'is-on' : ''}">${ic}</button>`).join('')}<div class="ly-fs" title="Fond et contour de l’objet choisi : clic = choisir la couleur"><button type="button" data-ly-target="fill" class="ly-fs-fill" title="Fond : clic pour choisir la couleur"></button><button type="button" data-ly-target="stroke" class="ly-fs-stroke" title="Contour : clic pour choisir la couleur"></button><button type="button" class="ly-fs-swap" data-ly-fsswap title="Intervertir fond et contour (⇧X)">⇄</button><button type="button" class="ly-fs-none" data-ly-fsnone title="Aucune couleur pour le fond ou le contour choisi (/)">⧄</button><input type="color" data-ly-fspick tabindex="-1" aria-hidden="true"></div></div>
                <div class="ly-canvas" data-ly-canvas tabindex="0"><div class="ly-board" data-ly-board></div></div>
                <aside class="ly-panels"><span class="ly-resize" data-ly-resize title="Glisser pour élargir ou rétrécir le panneau (double-clic : taille de départ)"></span><div class="ly-ptabs" data-tbg="ly-tabs" data-tbg-label="Onglets du panneau de droite">${PANELS.map(([k, ic, l]) => `<button type="button" data-ly-panel="${k}" class="${k === panel ? 'is-on' : ''}" title="${l}">${ic}<span>${l}</span></button>`).join('')}</div><div class="ly-pbody" data-ly-pbody data-dnd-off></div></aside></div>
            <div class="ly-status" data-tbg="ly-status" data-tbg-label="Barre du bas"><button type="button" data-ly-cmd="first" title="Première page">⏮</button><button type="button" data-ly-cmd="prev" title="Page précédente">‹</button><span data-tb="page" data-tb-label="Numéro de la page">Page <input type="number" min="1" data-ly-goto> / <b data-ly-total></b></span><button type="button" data-ly-cmd="next" title="Page suivante">›</button><button type="button" data-ly-cmd="last" title="Dernière page">⏭</button>
                <select data-ly-zoom aria-label="Zoom" data-tb-label="Zoom">${[25, 33, 50, 66, 75, 100, 125, 150, 200, 300, 400].map(z => `<option value="${z / 100}">${z} %</option>`).join('')}<option value="fit">Page entière</option></select><span class="ly-pos" data-ly-pos data-tb-label="Position du pointeur (mm)"></span><span class="ly-msg" data-ly-msg data-tb-label="Messages"></span></div>
            <style data-ly-css></style>`;
        document.body.appendChild(dl);
        ext.tbApply?.(dl, 'layout');
        ext.editorKeysAttach?.(dl, 'layout'); // ⌨️ raccourcis à soi // menus, outils, onglets et barre du bas rangés ou cachés à sa façon (⚙️ Personnaliser, ou Maintenance)
        const $ = q => dl.querySelector(q), board = $('[data-ly-board]'), canvas = $('[data-ly-canvas]'), pbody = $('[data-ly-pbody]');
        bindFontPick(pbody);
        // le panneau de droite s'élargit ou se rétrécit en tirant sa bordure (gardé pour la prochaine fois)
        const PW_KEY = 'genealogie-layout-panel-w', main = $('.ly-main');
        const setPanelW = w => { w = Math.round(clamp(w, 260, Math.max(320, window.innerWidth - 420))); main.style.gridTemplateColumns = `46px minmax(0,1fr) ${w}px`; return w; };
        try { const w0 = Number(localStorage.getItem(PW_KEY)); if (w0) setPanelW(w0); } catch (_) {}
        $('[data-ly-resize]').addEventListener('pointerdown', e => {
            e.preventDefault(); const x0 = e.clientX, w0 = $('.ly-panels').getBoundingClientRect().width; let w = w0;
            const mv = ev => { w = setPanelW(w0 + (x0 - ev.clientX)); };
            const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); try { localStorage.setItem(PW_KEY, String(w)); } catch (_) {} };
            addEventListener('pointermove', mv); addEventListener('pointerup', up);
        });
        $('[data-ly-resize]').addEventListener('dblclick', () => { main.style.gridTemplateColumns = ''; try { localStorage.removeItem(PW_KEY); } catch (_) {} });
        function menu(label, items) { return `<details class="ly-menu" data-tb="menu-${esc(label)}" data-tb-label="Menu ${esc(label)}"><summary>${label}</summary><div class="ly-menu-list">${items.map(([k, l, sc]) => k === '-' ? '<hr>' : `<button type="button" data-ly-cmd="${k}"><span>${l}</span>${sc ? `<kbd>${sc}</kbd>` : ''}</button>`).join('')}</div></details>`; }
        const msg = t => { $('[data-ly-msg]').textContent = t || ''; };
        const setDirty = (v = true) => { dirty = v; $('[data-ly-state]').textContent = dirty ? '● modifié' : (docId ? '✓ enregistré' : 'pas encore enregistré'); $('[data-ly-kind]').textContent = design ? '🎨 design' : ''; };
        /* Historique : chaque modification est une étape nommée ; ↶ ↷ (⌘Z, ⇧⌘Z) ou un clic sur une étape y revient */
        const snapshot = () => JSON.stringify({D, cur});
        let timeline = [{snap: snapshot(), label: 'Ouverture du document', at: new Date()}], pos = 0;
        const commit = (label = '') => {
            const snap = snapshot(); if (snap === timeline[pos].snap) { act = ''; return; }
            timeline = timeline.slice(0, pos + 1); timeline.push({snap, label: label || act || 'Modification', at: new Date()}); act = '';
            if (timeline.length > 150) timeline.shift(); pos = timeline.length - 1; setDirty(); syncHistory();
        };
        const goTo = i => { if (i < 0 || i >= timeline.length) return; if (editingId) stopEditing(); const o = JSON.parse(timeline[i].snap); D = o.D; cur = Math.min(o.cur, D.pages.length - 1); sel = []; editingId = null; pos = i; setDirty(); render(); };
        const undo = () => { if (editingId) stopEditing(); if (pos <= 0) return msg('Rien à annuler.'); msg(`Annulé : ${timeline[pos].label}`); goTo(pos - 1); };
        const redo = () => { if (pos >= timeline.length - 1) return msg('Rien à rétablir.'); goTo(pos + 1); msg(`Rétabli : ${timeline[pos].label}`); };
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
            markOverflow();
        }
        /** Un texte qui ne tient pas dans son cadre : petit ⊞ rouge, comme dans InDesign */
        function markOverflow() { board.querySelectorAll('.ly-text').forEach(el => { const t = el.querySelector('.ly-txt'), bx = el.querySelector('.ly-txtbox'); if (!t || !bx) return; const over = t.scrollHeight > bx.clientHeight + 2 || t.scrollWidth > bx.clientWidth + 2; el.classList.toggle('is-over', over); }); }
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
            const z = $('[data-ly-zoom]'); z.value = [...z.options].some(o => o.value === String(zoom)) ? String(zoom) : 'fit';
            const it = one(); const fs = dl.querySelector('.ly-fs-fill'), ss = dl.querySelector('.ly-fs-stroke');
            fs.style.background = it ? cssPaint(D, it.fill) : '#fff'; ss.style.borderColor = it ? colorOf(D, it.stroke?.c, 'transparent') : '#111';
            fs.classList.toggle('is-on', fillTarget === 'fill'); ss.classList.toggle('is-on', fillTarget === 'stroke');
            dl.querySelectorAll('[data-ly-cmd="guides"],[data-ly-cmd="snap"],[data-ly-cmd="preview"]').forEach(b => b.classList.toggle('is-checked', {guides, snap: snapOn, preview}[b.dataset.lyCmd]));
        }
        const goPage = (i, scroll = true) => { if (editingId) stopEditing(); cur = clamp(Math.round(i), 0, D.pages.length - 1); sel = []; editMaster = null; render(); if (scroll) pageEl()?.scrollIntoView({block: 'center', inline: 'center', behavior: 'smooth'}); };
        const setZoom = z => { const cx = canvas.scrollLeft + canvas.clientWidth / 2, cy = canvas.scrollTop + canvas.clientHeight / 2, k = z / zoom; zoom = clamp(z, 0.1, 8); board.style.zoom = zoom; canvas.scrollLeft = cx * k - canvas.clientWidth / 2; canvas.scrollTop = cy * k - canvas.clientHeight / 2; syncChrome(); };
        const zoomFit = () => { const W = px(D.page.w) * (D.page.facing ? 2 : 1) + 60, H = px(D.page.h) + 60; setZoom(Math.min(canvas.clientWidth / W, canvas.clientHeight / H)); pageEl()?.scrollIntoView({block: 'center', inline: 'center'}); };

        /* — coordonnées : millimètres de la page sous la souris — */
        const mmAt = (e, pe = pageEl()) => { const r = pe.getBoundingClientRect(), k = r.width / D.page.w; return {x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k, k}; };
        const pageOfEvent = e => e.target.closest?.('.ly-page');

        /* — texte : édition dans le cadre — */
        function startEditing(it) {
            if (it.auto) { panel = 'obj'; sel = [it.id]; render(); return msg(it.auto === 'toc' ? 'Le sommaire se remplit tout seul (réglages dans Objet).' : 'L’index se remplit tout seul (réglages dans Objet).'); }
            const head = chainHead(it);
            if (head !== it) { if (head.auto) return msg('Ce bloc est la suite d’un sommaire ou d’un index automatique.'); const pi = pageOfItem(head.id); if (pi >= 0 && pi !== cur) { cur = pi; } msg('Texte chaîné : il s’écrit dans son premier bloc (la suite se remplit toute seule).'); it = head; }
            if (it.dyn && !confirm('Ce texte suit une fiche de la généalogie (objet dynamique). L’écrire à la main le détache de la fiche : continuer ?')) return;
            if (it.dyn) { delete it.dyn; commit('Texte détaché de la fiche'); }
            if (locked(it)) return msg('Objet verrouillé.'); editingId = it.id; sel = [it.id]; render(); const t = board.querySelector(`.ly-item[data-id="${CSS.escape(it.id)}"] .ly-txt`); if (t) { t.focus(); const r = document.createRange(); r.selectNodeContents(t); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } panel = 'text'; renderPanel(); }
        const readEditing = el => { const c = el.cloneNode(true); c.querySelectorAll('.ly-wrapf').forEach(x => x.remove()); return c.innerHTML; };
        function bindEditing(t) {
            if (t.dataset.bound) return; t.dataset.bound = '1';
            t.addEventListener('input', () => { const f = findItem(editingId); if (f) { f.it.html = readEditing(t); setDirty(); markOverflow(); } });
            t.addEventListener('paste', e => { e.preventDefault(); const txt = e.clipboardData.getData('text/plain'); document.execCommand('insertText', false, txt); });
            t.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopEditing(); } });
        }
        function stopEditing() {
            if (!editingId) return; const f = findItem(editingId), t = board.querySelector(`.ly-item[data-id="${CSS.escape(editingId)}"] .ly-txt`);
            if (f && t) f.it.html = sanitizeHtml(readEditing(t)) || '<p data-ps="ps-body"><br></p>';
            editingId = null; savedRange = null; commit('Texte modifié'); render();
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
            if (e.button === 1 || tool === 'hand' || e.target.closest('.ly-master-banner')) { if (e.target.closest('.ly-master-banner')) return; const sx = canvas.scrollLeft, sy = canvas.scrollTop, x0 = e.clientX, y0 = e.clientY; const mv = ev => { canvas.scrollLeft = sx - (ev.clientX - x0); canvas.scrollTop = sy - (ev.clientY - y0); }; const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); return; }
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
            if (it.type === 'text') startEditing(it); else if (it.type === 'frame') placeImage(it);
        });
        canvas.addEventListener('pointermove', e => { const pe = pageEl(); if (!pe || !pe.contains(e.target) && !pageOfEvent(e)) return; const P = mmAt(e, pe); $('[data-ly-pos]').textContent = `x ${r1(P.x)} · y ${r1(P.y)} mm`; if (pen) drawPen(P); });
        canvas.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, {passive: false});
        /** Repères aimantés : bords et milieux de la page, marges, autres objets */
        function snapLines(skip) {
            const m = editMaster ? {t: D.page.margin.t, b: D.page.margin.b, l: D.page.margin.o, r: D.page.margin.i} : pageMargins(D, cur), W = D.page.w, H = D.page.h;
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
            g.setAttribute('width', px(D.page.w)); g.setAttribute('height', px(D.page.h));
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
        function del() { if (!sel.length) return; const list = curList(); sel.forEach(i => { const k = list.findIndex(x => x.id === i); if (k >= 0 && !locked(list[k])) list.splice(k, 1); }); sel = []; commit(); render(); }
        function copy(cut = false) { if (!sel.length) return; clip = JSON.stringify(selected()); try { navigator.clipboard?.writeText?.('')?.catch?.(() => {}); } catch (_) {} if (cut) del(); msg(`${JSON.parse(clip).length} objet(s) copié(s).`); }
        /** Des copies : un chaînage vers un bloc copié avec elles suit la copie ; vers un bloc qui n'est pas copié, il est coupé */
        const relink = (orig, copies) => { const map = new Map(orig.map((o, k) => [o.id, copies[k].id])); copies.forEach(c => { if (c.next) { if (map.has(c.next)) c.next = map.get(c.next); else delete c.next; } }); return copies; };
        function paste(inPlace = false) { if (!clip) return msg('Rien à coller.'); const src0 = JSON.parse(clip), its = relink(src0, src0.map(it => ({...it, id: nid('c'), x: it.x + (inPlace ? 0 : 5), y: it.y + (inPlace ? 0 : 5)}))); curList().push(...its); sel = its.map(i => i.id); commit(); render(); }
        function dup() { copy(); paste(); }
        const addPages = (n, at, master) => { const pages = Array.from({length: clamp(n, 1, 500)}, () => ({id: nid('p'), master: master ?? (D.pages[cur]?.master || 'A'), items: []})); D.pages.splice(clamp(at, 0, D.pages.length), 0, ...pages); commit(); goPage(at); msg(`${pages.length} page(s) ajoutée(s).`); };
        function insertPagesDialog() {
            ext.openDialog({eyebrow: 'PAGES', title: 'Insérer des pages', submitLabel: 'Insérer',
                body: `<div class="form-grid"><label>Nombre de pages <input type="number" name="n" min="1" max="500" value="1"></label>
                    <label>Où <select name="where"><option value="after">après la page</option><option value="before">avant la page</option><option value="start">au début du document</option><option value="end">à la fin du document</option></select></label>
                    <label>Page <input type="number" name="page" min="1" max="${D.pages.length}" value="${cur + 1}"></label>
                    <label>Gabarit <select name="master">${D.masters.map(m => `<option value="${esc(m.id)}" ${m.id === (D.pages[cur]?.master || 'A') ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}<option value="">Aucun</option></select></label></div>`,
                onSubmit: f => { const n = Number(f.n.value) || 1, p = clamp(Number(f.page.value) || 1, 1, D.pages.length) - 1, w = f.where.value; addPages(n, w === 'start' ? 0 : w === 'end' ? D.pages.length : w === 'before' ? p : p + 1, f.master.value); }});
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
                    act = m ? `Gabarit « ${m.name} » sur ${k} page${k > 1 ? 's' : ''}` : `Gabarit enlevé de ${k} page${k > 1 ? 's' : ''}`; commit(); render(); msg(act + '.');
                }});
        }
        async function gotoDialog() { const v = await ask(`Aller à la page (1 à ${D.pages.length}) :`, String(cur + 1)); if (v) goPage(Number(v) - 1); }
        function delPage() { if (D.pages.length < 2) return msg('Il faut garder au moins une page.'); if (D.pages[cur].items.length && !confirm(`Supprimer la page ${cur + 1} et ce qu’elle contient ?`)) return; D.pages.splice(cur, 1); cur = Math.min(cur, D.pages.length - 1); sel = []; commit(); render(); }
        function dupPage() { const p = JSON.parse(JSON.stringify(D.pages[cur])); p.id = nid('p'); const orig = D.pages[cur].items; p.items.forEach(it => { it.id = nid('c'); }); relink(orig, p.items); D.pages.splice(cur + 1, 0, p); commit(); goPage(cur + 1); }
        function lockToggle() { const its = selected(); if (!its.length) return; const v = !its.every(x => x.locked); its.forEach(x => { x.locked = v; }); commit(); render(); }
        function fitFrame() { const it = one(); if (!it) return; if (it.type === 'text') { const el = board.querySelector(`.ly-item[data-id="${CSS.escape(it.id)}"] .ly-txt`); if (el) { it.h = r1(el.scrollHeight / MM + (it.inset || 0) * 2 + 0.5); commit(); render(); } return; } if (it.src) { const im = new Image(); im.onload = () => { it.h = r1(it.w * im.naturalHeight / im.naturalWidth); it.imgS = 100; it.imgX = 0; it.imgY = 0; commit(); render(); }; im.src = it.src; } }
        async function placeImage(target = null) {
            const res = await pickImage(); if (!res) return;
            let it = target && (target.type === 'frame') ? target : one()?.type === 'frame' ? one() : null;
            if (!it) { const b = box(D, cur); const im = await new Promise(r => { const x = new Image(); x.onload = () => r(x); x.onerror = () => r(null); x.src = res.src; }); const ratio = im ? im.naturalHeight / im.naturalWidth : 0.75, w = Math.min(b.w, 100); it = shapeItem('frame', {x: b.x, y: b.y, w, h: r1(w * ratio), layer: activeLayer(), fit: 'fill'}); curList().push(it); }
            it.src = res.src; it.srcName = res.name; if (res.mediaId) it.mediaId = res.mediaId; else delete it.mediaId; it.fill = it.fill === 'sw-light' ? 'none' : it.fill; sel = [it.id]; commit(); render();
        }
        /* ─── Texte chaîné : un texte qui continue d'un bloc à l'autre, sur plusieurs pages ─── */
        let linkFrom = null;
        const allText = () => D.pages.flatMap(p => p.items.filter(it => it.type === 'text'));
        const pageOfItem = idv => D.pages.findIndex(p => p.items.some(x => x.id === idv));
        const chainHead = it => { let h = it; for (let g = 0; g < 2000; g++) { const prev = allText().find(x => x.next === h.id); if (!prev || prev === it) return h; h = prev; } return h; };
        const chainList = head => { const out = [], seen = new Set(); let c = head; while (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); c = c.next ? findItem(c.next)?.it : null; } return out; };
        function setLink(from, to) {
            if (to === from) { render(); return msg('Choisis un autre bloc.'); }
            if (to.auto) { render(); return msg('Un sommaire ou un index ne peut pas recevoir la suite d’un texte.'); }
            if (allText().some(x => x.next === to.id)) { render(); return msg('Ce bloc reçoit déjà la suite d’un autre texte.'); }
            const head = chainHead(from);
            if (chainList(to).includes(from) || chainHead(to) === head) { render(); return msg('Ce chaînage ferait une boucle.'); }
            if (plainOf(to.html).trim() && !confirm('Ce bloc contient déjà du texte : il sera ajouté à la fin du texte chaîné. Continuer ?')) { render(); return; }
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
        async function insertAuto(kind) {
            if (editMaster) return msg('Pas dans un gabarit : sur une page.');
            const b = box(D, cur), it = textItem({x: b.x, y: b.y, w: b.w, h: b.h, layer: activeLayer(), name: kind === 'toc' ? 'Table des matières' : 'Index des noms', auto: kind,
                autoStyles: kind === 'toc' ? D.paraStyles.filter(s => ['ps-chapter'].includes(s.id)).map(s => s.id) : [], autoPs: kind === 'toc' ? 'ps-body' : 'ps-list', columns: kind === 'index' ? 2 : 1, gutter: 6});
            if (kind === 'index') {
                if (!D.charStyles.some(c => c.id === 'cs-index')) D.charStyles.push({id: 'cs-index', name: 'Nom à indexer'});
                if (confirm('Chercher aussi dans le texte les noms des personnes de la généalogie ? (Sinon : seulement les noms marqués avec le style de caractère « Nom à indexer ».)')) {
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
            if (!frames.length && !dyn.length && !dgs.length) { if (!silent) msg('Aucun objet lié dans ce document.'); return; }
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
            for (const it of dyn) { try { const h = await personDynHtml(it.dyn.id, it.dyn.fields); if (h !== it.html) { it.html = h; changed++; linkState[it.id] = 'updated'; } else linkState[it.id] = 'ok'; it.dyn.at = new Date().toISOString().slice(0, 16); } catch (_) { linkState[it.id] = 'missing'; } }
            for (const it of dgs) { try { const svg = ext.diagramSvg ? await ext.diagramSvg(it.diagramId) : ''; if (!svg) { linkState[it.id] = 'missing'; continue; } const src = svgSrc(svg); if (src !== it.src) { it.src = src; changed++; linkState[it.id] = 'updated'; } else linkState[it.id] = linkState[it.id] === 'updated' ? 'updated' : 'ok'; } catch (_) { linkState[it.id] = 'missing'; } }
            if (changed) { commit('Liens mis à jour'); render(); }
            const miss = Object.values(linkState).filter(v => v === 'missing').length;
            if (!silent || changed || miss) msg(`🔗 Liens : ${changed ? `${changed} mis à jour` : 'tout est à jour'}${miss ? `, ${miss} introuvable${miss > 1 ? 's' : ''}` : ''}.`);
            if (panel === 'links') renderPanel();
        }
        /** ✏️ Modifier l'original : la photo s'ouvre dans la retouche ; à la fermeture, le cadre se met à jour */
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
        function dynPersonDialog(it = null) {
            const f0 = it?.dyn?.fields || ['name', 'life', 'parents', 'partners'];
            let chosen = it?.dyn?.id || 0;
            ext.openDialog({eyebrow: 'OBJET DYNAMIQUE', title: it ? 'Texte lié à une fiche' : 'Insérer le texte d’une fiche', submitLabel: it ? 'Mettre à jour' : 'Insérer',
                body: `<p class="muted">Le texte suit la fiche : si elle change dans la généalogie, « 🔗 Mettre à jour les liens » (ou la réouverture du document) le refait.</p>
                    <label>Personne <input type="search" data-q placeholder="Nom, prénom…" autocomplete="off"></label><div class="ly-dynres" data-res>${chosen ? '<p class="muted">Fiche déjà choisie (cherche pour en changer).</p>' : ''}</div>
                    <fieldset><legend>Ce qu’il faut montrer</legend>${DYN_FIELDS.map(([k, l]) => `<label class="checkbox-line"><input type="checkbox" name="f_${k}" ${f0.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</fieldset>`,
                onOpen: dg => { const q = dg.querySelector('[data-q]'), res = dg.querySelector('[data-res]'); let t = 0;
                    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(async () => { const rows = (await api('search', {type: 'persons', q: q.value.trim(), limit: 12}).catch(() => ({data: []}))).data || [];
                        res.innerHTML = rows.map(p => `<label class="checkbox-line"><input type="radio" name="pick" value="${p.id}"> ${esc(A().personName ? A().personName(p) : `${p.first_name || ''} ${p.last_name || ''}`)}</label>`).join('') || '<p class="muted">Personne trouvée.</p>';
                        res.querySelectorAll('[name=pick]').forEach(r => r.addEventListener('change', () => { chosen = Number(r.value); })); }, 220); }); },
                onSubmit: async f => {
                    if (!chosen) { toast('Choisis une personne.', 'error'); return false; }
                    const fields = DYN_FIELDS.map(([k]) => k).filter(k => f.elements['f_' + k]?.checked); if (!fields.length) { toast('Coche au moins une chose à montrer.', 'error'); return false; }
                    const html = await personDynHtml(chosen, fields);
                    if (it) { it.dyn = {type: 'person', id: chosen, fields, at: new Date().toISOString().slice(0, 16)}; it.html = html; }
                    else { const b = box(D, cur); const n = textItem({x: b.x, y: b.y, w: Math.min(b.w, 90), h: 50, html, layer: activeLayer(), name: 'Texte lié à une fiche', dyn: {type: 'person', id: chosen, fields, at: new Date().toISOString().slice(0, 16)}}); curList().push(n); sel = [n.id]; }
                    commit('Texte lié à une fiche'); render();
                }});
        }
        /* ─── 🎨 Mes styles : gardés pour tous les documents ─── */
        const SL_KEY = 'genealogie-layout-stylesets';
        function styleLibrary() {
            const sets = () => { try { const v = JSON.parse(localStorage.getItem(SL_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
            const saveSets = l => { try { localStorage.setItem(SL_KEY, JSON.stringify(l)); return true; } catch (_) { toast('Plus de place : supprime un ensemble.', 'error'); return false; } };
            const dg = ext.openDialog({eyebrow: 'STYLES', title: '🎨 Mes styles, pour tous mes documents', wide: true,
                body: `<p class="muted">Garde les styles de paragraphe et de caractère (et les couleurs du nuancier qu’ils utilisent) de ce document, pour les remettre dans un autre. Les styles du même nom sont remplacés, les autres ajoutés.</p>
                    <div class="ly-row"><input data-slname placeholder="Nom de l’ensemble (ex. « Mon livre classique »)" maxlength="60"><button type="button" class="button small" data-sladd>＋ Garder les styles de ce document</button></div><div data-sllist></div>`,
                onOpen: d => {
                    const draw = () => { const l = sets(); d.querySelector('[data-sllist]').innerHTML = l.length ? `<ol class="ly-sllist">${l.map((x, i) => `<li><b>${esc(x.name)}</b> <small class="muted">${x.paraStyles.length} styles de paragraphe · ${x.charStyles.length} de caractère</small><span><button type="button" class="button small" data-slput="${i}">Mettre dans ce document</button><button type="button" class="icon-button" data-sldel="${i}" title="Supprimer">🗑</button></span></li>`).join('')}</ol>` : '<p class="muted">Aucun ensemble gardé.</p>'; };
                    draw();
                    d.addEventListener('click', e => {
                        if (e.target.closest('[data-sladd]')) { const name = d.querySelector('[data-slname]').value.trim() || docName; const used = new Set(JSON.stringify([D.paraStyles, D.charStyles]).match(/(sw|gr)-[a-z0-9_-]+/gi) || []); const l = sets(); l.push({name, paraStyles: D.paraStyles, charStyles: D.charStyles, swatches: D.swatches.filter(x => used.has(x.id))}); if (saveSets(l)) { toast(`Styles gardés : « ${name} ».`); draw(); } return; }
                        const put = e.target.closest('[data-slput]'); if (put) { const x = sets()[Number(put.dataset.slput)]; if (!x) return; const merge = (arr, add) => { add.forEach(s0 => { const k = arr.findIndex(y => y.id === s0.id); if (k >= 0) arr[k] = JSON.parse(JSON.stringify(s0)); else arr.push(JSON.parse(JSON.stringify(s0))); }); };
                            merge(D.paraStyles, x.paraStyles); merge(D.charStyles, x.charStyles); merge(D.swatches, x.swatches || []); commit(`Styles « ${x.name} » mis dans le document`); render(); toast('Styles mis dans le document : tout le texte qui les utilise suit.'); dg.close(); return; }
                        const del = e.target.closest('[data-sldel]'); if (del) { const l = sets(); l.splice(Number(del.dataset.sldel), 1); saveSets(l); draw(); }
                    });
                }});
        }
        /* ─── ✅ Contrôle avant impression ─── */
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
                        if (it.x < m.l - 0.5 || it.y < m.t - 0.5 || it.x + it.w > D.page.w - m.r + 0.5 || it.y + it.h > D.page.h - m.b + 0.5) add('warn', i, it.id, 'Texte hors des marges : il risque d’être coupé ou trop près du bord.');
                        if (!plainOf(it.html).trim() && !it._follow) add('info', i, it.id, 'Bloc de texte vide.');
                    }
                    if (it.type === 'frame') {
                        if (!it.src) { add('warn', i, it.id, 'Cadre d’image vide.'); continue; }
                        if (it.mediaId && linkState[it.id] === 'missing') add('err', i, it.id, 'Photo liée introuvable dans l’app.');
                        const n = await natural(it.src);
                        if (!n) add('err', i, it.id, 'Image illisible.');
                        else { const ar = n[0] / n[1], s = (it.imgS || 100) / 100, fit = it.fit || 'fill', wmm = (fit === 'fit' ? Math.min(it.w, it.h * ar) : fit === 'stretch' ? it.w : Math.max(it.w, it.h * ar)) * s, ppi = Math.round(n[0] / (wmm / 25.4));
                            if (ppi < 150) add(ppi < 96 ? 'err' : 'warn', i, it.id, `Image trop petite pour l’impression : ${ppi} points par pouce à cette taille (il en faut 300 pour une belle impression, 150 au minimum).`); }
                    }
                    if (it.type !== 'text' && B > 0) { // touche le bord sans aller jusqu'au fond perdu
                        const near = (a, b) => Math.abs(a - b) < 1;
                        if ((near(it.x, 0) && it.x > -B + 0.2) || (near(it.y, 0) && it.y > -B + 0.2) || (near(it.x + it.w, D.page.w) && it.x + it.w < D.page.w + B - 0.2) || (near(it.y + it.h, D.page.h) && it.y + it.h < D.page.h + B - 0.2)) add('warn', i, it.id, `Touche le bord de la page sans aller jusqu’au fond perdu (${B} mm) : un liseré blanc peut apparaître à la coupe.`);
                    }
                }
            }
            const fonts = new Set([...D.paraStyles, ...D.charStyles].map(x => x.font).filter(Boolean)); D.pages.forEach(p => p.items.forEach(it => { (String(it.html || '').match(/font-family:\s*([^;"]+)/g) || []).forEach(x => fonts.add(x.replace(/font-family:\s*/, '').split(',')[0].replace(/&quot;|['"]/g, '').trim())); }));
            [...fonts].filter(f => f && !/^(serif|sans-serif|monospace|cursive|system-ui)$/i.test(f) && !fontOkHere(f)).forEach(f => add('warn', -1, '', `Police « ${f} » absente de cet ordinateur : une autre la remplace à l’impression.`));
            if (!D.page.bleed) add('info', -1, '', 'Pas de fond perdu (Document → Fond perdu, 3 à 5 mm) : nécessaire si des images ou couleurs vont jusqu’au bord.');
            const ico = {err: '⛔', warn: '⚠️', info: 'ℹ️'}, n = k => issues.filter(x => x.lvl === k).length;
            msg('');
            ext.openDialog({eyebrow: 'CONTRÔLE AVANT IMPRESSION', title: issues.some(x => x.lvl === 'err') ? `${n('err')} problème(s) à corriger` : 'Prêt pour l’impression' + (n('warn') ? ` (${n('warn')} avertissement(s))` : ' ✓'), wide: true,
                body: `<p class="muted">${n('err')} erreur(s) · ${n('warn')} avertissement(s) · ${n('info')} remarque(s). Clique sur « Aller » pour voir l’objet. Pour l’imprimeur : Fichier → « PDF avec fond perdu et traits de coupe ».</p>
                    <ol class="ly-preflight">${issues.sort((a, b) => ['err', 'warn', 'info'].indexOf(a.lvl) - ['err', 'warn', 'info'].indexOf(b.lvl) || a.page - b.page).map(x => `<li class="is-${x.lvl}">${ico[x.lvl]} ${x.page >= 0 ? `<b>Page ${x.page + st0}</b> — ` : ''}${esc(x.text)}${x.page >= 0 ? ` <button type="button" class="link-button" data-pfgo="${x.page}:${esc(x.id)}">Aller</button>` : ''}</li>`).join('') || '<li>✅ Rien à signaler.</li>'}</ol>`,
                onOpen: dg => dg.addEventListener('click', e => { const b = e.target.closest('[data-pfgo]'); if (!b) return; const [pi, idv] = b.dataset.pfgo.split(':'); dg.close(); goPage(Number(pi)); if (idv) { sel = [idv]; drawSel(); panel = 'obj'; renderPanel(); } })});
        }
        const CMD_LABELS = {cut: 'Couper', paste: 'Coller', dup: 'Dupliquer', del: 'Supprimer', front: 'Premier plan', fwd: 'Avancer', back: 'Reculer', bottom: 'Arrière-plan', lock: 'Verrouiller / déverrouiller', hide: 'Masquer', showall: 'Tout afficher', fitframe: 'Ajuster le cadre', place: 'Placer une image', addend: 'Page ajoutée à la fin', insert: 'Pages insérées', duppage: 'Page dupliquée', delpage: 'Page supprimée'};
        async function exec(cmd) {
            if (CMD_LABELS[cmd]) act = CMD_LABELS[cmd];
            dl.querySelectorAll('details.ly-menu[open]').forEach(d => d.removeAttribute('open'));
            const C = {
                save: () => save(), saveas: () => save({copy: true}), savedesign: () => save({design: true}), pdf: () => exportPrint(), pdfbleed: () => exportPrint(true), html: () => exportHtml(), json: () => exportJson(), close: () => close(),
                undo, redo, cut: () => copy(true), copy: () => copy(), paste: () => paste(), dup, del, all: () => { sel = curList().filter(x => !x.hidden && !locked(x)).map(x => x.id); drawSel(); renderPanel(); }, none: () => { sel = []; drawSel(); renderPanel(); },
                front: () => arrange('front'), fwd: () => arrange('fwd'), back: () => arrange('back'), bottom: () => arrange('bottom'), lock: lockToggle, hide: () => { selected().forEach(x => { x.hidden = true; }); sel = []; commit(); render(); }, showall: () => { curList().forEach(x => { delete x.hidden; }); commit(); render(); }, fitframe: fitFrame, place: () => placeImage(),
                addend: () => addPages(1, D.pages.length), insert: insertPagesDialog, masters: () => mastersDialog(), duppage: dupPage, delpage: delPage, goto: gotoDialog, first: () => goPage(0), prev: () => goPage(cur - 1), next: () => goPage(cur + 1), last: () => goPage(D.pages.length - 1),
                zin: () => setZoom(zoom * 1.25), zout: () => setZoom(zoom / 1.25), zfit: zoomFit, z100: () => setZoom(1), guides: () => { guides = !guides; render(); }, snap: () => { snapOn = !snapOn; syncChrome(); msg(snapOn ? 'Magnétisme activé.' : 'Magnétisme coupé.'); }, preview: () => { preview = !preview; render(); },
                endmaster: () => { editMaster = null; sel = []; render(); },
                preflight: () => preflight(), relink: () => refreshLinks(false), stylelib: () => styleLibrary(), toc: () => insertAuto('toc'), index: () => insertAuto('index'), dynperson: () => dynPersonDialog(), dyndiagram: () => insertDiagram(),
                chain: () => { const it = one(); if (it?.type !== 'text') return msg('Choisis d’abord un bloc de texte.'); if (it.next) return msg('Ce bloc est déjà chaîné (« Couper le chaînage » d’abord).'); linkFrom = it.id; canvas.classList.add('is-linking'); render(); msg('➜ Clique sur le bloc de texte qui reçoit la suite (sur n’importe quelle page). Échap : annuler.'); },
                unchain: () => { const it = one(); if (!it?.next) return msg('Ce bloc n’est pas chaîné vers un autre.'); delete it.next; commit('Chaînage coupé'); render(); },
                autoflow: () => autoflow(),
                mfolio: () => masterAdd('folio'), mrunning: () => masterAdd('running'), mchapter: () => masterAdd('chapter'), mfooter: () => masterAdd('footer'),
            };
            await C[cmd]?.();
        }
        dl.addEventListener('click', e => {
            const c = e.target.closest('[data-ly-cmd]'); if (c) { e.preventDefault(); exec(c.dataset.lyCmd); return; }
            const t = e.target.closest('[data-ly-tool]'); if (t) { if (editingId) stopEditing(); tool = t.dataset.lyTool; pen = null; syncChrome(); msg(TOOLS.find(x => x[0] === tool)?.[2] || ''); return; }
            const pt = e.target.closest('[data-ly-panel]'); if (pt) { panel = pt.dataset.lyPanel; dl.querySelectorAll('[data-ly-panel]').forEach(b => b.classList.toggle('is-on', b === pt)); renderPanel(); return; }
            if (e.target.closest('[data-ly-fsswap]')) { swapPaint(); return; }
            if (e.target.closest('[data-ly-fsnone]')) { if (!selected().length) return msg('Choisis un objet.'); applyPaint('none'); return; }
            const tg0 = e.target.closest('.ly-fs [data-ly-target]'); if (tg0) { const it = one(), pk = dl.querySelector('[data-ly-fspick]'), c0 = it ? colorOf(D, tg0.dataset.lyTarget === 'fill' ? it.fill : it.stroke?.c, '') : ''; pk.value = hexOk(c0) ? c0 : (tg0.dataset.lyTarget === 'fill' ? '#ffffff' : '#111111'); pk.dataset.for = tg0.dataset.lyTarget; if (selected().length) setTimeout(() => { try { pk.showPicker ? pk.showPicker() : pk.click(); } catch { pk.click(); } }, 0); }
            const tg = e.target.closest('[data-ly-target]'); if (tg) { fillTarget = tg.dataset.lyTarget; panel = 'color'; dl.querySelectorAll('[data-ly-panel]').forEach(b => b.classList.toggle('is-on', b.dataset.lyPanel === 'color')); syncChrome(); renderPanel(); }
            if (!e.target.closest('details.ly-menu')) dl.querySelectorAll('details.ly-menu[open]').forEach(d => d.removeAttribute('open'));
        });
        dl.addEventListener('toggle', e => { if (e.target.matches?.('details.ly-menu[open]')) dl.querySelectorAll('details.ly-menu[open]').forEach(d => { if (d !== e.target) d.removeAttribute('open'); }); }, true);
        $('[data-ly-goto]').addEventListener('change', e => goPage(Number(e.target.value) - 1));
        $('[data-ly-zoom]').addEventListener('change', e => { if (e.target.value === 'fit') zoomFit(); else setZoom(Number(e.target.value)); });
        $('[data-ly-name]').addEventListener('input', e => { docName = e.target.value.slice(0, 160); setDirty(); });
        // raccourcis clavier (quand la fenêtre est au premier plan)
        const keyAc = new AbortController();
        document.addEventListener('keydown', e => {
            if (!dl.open || [...document.querySelectorAll('dialog[open]')].at(-1) !== dl) return;
            const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase(), inField = e.target.closest?.('input, textarea, select') || (e.target.isContentEditable);
            if (mod && k === 's') { e.preventDefault(); save(); return; }
            if (inField) { if (editingId && mod && k === 'z') return; return; }
            if (pen && e.key === 'Enter') { e.preventDefault(); finishPen(false); return; }
            if (pen && e.key === 'Escape') { pen = null; pageEl()?.querySelector('.ly-penline')?.remove(); return; }
            if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; } if (mod && k === 'y') { e.preventDefault(); redo(); return; }
            if (mod && ['c', 'x', 'v', 'd', 'a', 'j', '0', '1', '=', '+', '-', ']', '['].includes(k)) {
                e.preventDefault(); ({c: () => copy(), x: () => copy(true), v: () => paste(e.shiftKey || e.altKey), d: dup, a: () => exec('all'), j: gotoDialog, 0: zoomFit, 1: () => setZoom(1), '=': () => setZoom(zoom * 1.25), '+': () => setZoom(zoom * 1.25), '-': () => setZoom(zoom / 1.25), ']': () => arrange(e.shiftKey ? 'front' : 'fwd'), '[': () => arrange(e.shiftKey ? 'bottom' : 'back')})[k]?.(); return;
            }
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); return; }
            if (e.key === 'Escape' && linkFrom) { linkFrom = null; canvas.classList.remove('is-linking'); render(); msg('Chaînage annulé.'); return; }
            if (e.key === 'Escape') { sel = []; drawSel(); renderPanel(); return; }
            if (e.key === 'PageDown') { e.preventDefault(); goPage(cur + 1); return; } if (e.key === 'PageUp') { e.preventDefault(); goPage(cur - 1); return; }
            if (e.key.startsWith('Arrow') && sel.length) { e.preventDefault(); const d = e.shiftKey ? 5 : 1, dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0; selected().filter(x => !locked(x)).forEach(x => { x.x = r1(x.x + dx); x.y = r1(x.y + dy); }); commit('Déplacement au clavier'); render(); return; }
            if (k === 'w') { preview = !preview; render(); return; }
            if (k === 'x' && !mod && e.shiftKey) { swapPaint(); return; }
            if (k === 'x' && !mod) { fillTarget = fillTarget === 'fill' ? 'stroke' : 'fill'; syncChrome(); if (panel === 'color') renderPanel(); return; }
            if (e.key === '/' && !mod) { if (selected().length) applyPaint('none'); return; }
            const t = TOOLS.find(x => x[3] === k); if (t && !mod) { tool = t[0]; pen = null; syncChrome(); msg(t[2]); }
        }, {signal: keyAc.signal});

        /* — enregistrer, exporter, fermer — */
        async function save({copy: asCopy = false, design: asDesign = false} = {}) {
            if (editingId) stopEditing();
            let name = String(docName || '').trim() || 'Sans titre';
            if (asCopy || asDesign) { const n = await ask(asDesign ? 'Nom du design (il sera proposé pour les prochains livres) :' : 'Nom de la copie :', asDesign ? `${name} (design)` : `${name} (copie)`); if (!n) return; name = n.trim().slice(0, 160); }
            try {
                const res = (await post('save_layout_doc', {id: asCopy || asDesign ? 0 : docId, name, is_design: asDesign ? 1 : (asCopy ? 0 : (design ? 1 : 0)), doc: D})).result;
                if (!asCopy && !asDesign) { docId = res.id; docName = res.name; setDirty(false); toast(`« ${res.name} » enregistré.`); }
                else toast(asDesign ? `Design « ${res.name} » enregistré : il est proposé pour les nouveaux livres.` : `Copie « ${res.name} » enregistrée.`);
                onSaved?.();
            } catch (err) { toast(err.message, 'error'); }
        }
        function close() { if (editingId) stopEditing(); if (dirty && !confirm('Fermer sans enregistrer les dernières modifications ?')) return; keyAc.abort(); dl.close(); }
        dl.addEventListener('cancel', e => { if (e.target !== dl) return; e.preventDefault(); const om = dl.querySelectorAll('details.ly-menu[open]'); if (om.length) { om.forEach(d => d.removeAttribute('open')); return; } if (editingId) { stopEditing(); return; } if (pen) { pen = null; render(); return; } close(); });
        dl.addEventListener('close', () => { keyAc.abort(); dl.remove(); onSaved?.(); });
        const docForExport = () => { if (editingId) stopEditing(); return D; };
        function exportPrint(bleed = false) { if (bleed && !D.page.bleed) toast('Le document n’a pas de fond perdu (Document → Fond perdu) : seuls les traits de coupe sont ajoutés.'); const html = printHtml(docForExport(), docName, true, {bleed}); const w = window.open('', '_blank'); if (!w) return toast('Fenêtre bloquée : autorise les fenêtres pour cette page.', 'error'); w.document.open(); w.document.write(html); w.document.close(); toast('Le livre s’ouvre : « Imprimer », puis « Enregistrer en PDF ».'); }
        async function exportHtml() { msg('Préparation du fichier HTML (les images sont intégrées)…'); const html = await inlineImages(printHtml(docForExport(), docName, false)); download(`${slug(docName)}.html`, new Blob([html], {type: 'text/html'})); msg(''); }
        function exportJson() { download(`${slug(docName)}.json`, new Blob([JSON.stringify({type: 'lcnda-mise-en-page-livre', version: 1, name: docName, is_design: design ? 1 : 0, doc: docForExport()}, null, 1)], {type: 'application/json'})); }

        /* — panneaux de droite — */
        const pid = () => 'p' + Math.random().toString(36).slice(2, 7);
        const num = (k, label, v, {min = -9999, max = 9999, step = 0.1, unit = 'mm', attr = 'data-ly-set'} = {}) => `<label class="ly-f"><span>${label}</span><input type="number" ${attr}="${k}" value="${r1(v)}" min="${min}" max="${max}" step="${step}"><em>${unit}</em></label>`;
        const sel2 = (k, label, opts, v, attr = 'data-ly-set') => `<label class="ly-f"><span>${label}</span><select ${attr}="${k}">${opts.map(([a, b]) => `<option value="${esc(a)}" ${String(a) === String(v) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
        const paintSel = (k, label, v) => `<label class="ly-f"><span>${label}</span><select data-ly-set="${k}"><option value="none" ${v === 'none' ? 'selected' : ''}>Aucun</option>${D.swatches.map(s => `<option value="${esc(s.id)}" ${s.id === v ? 'selected' : ''}>${s.type === 'grad' ? '▤ ' : '■ '}${esc(s.name)}</option>`).join('')}${hexOk(v) ? `<option value="${v}" selected>${v}</option>` : ''}</select><i class="ly-chip" style="background:${cssPaint(D, v)}"></i></label>`;
        const sec = (title, body, open = true) => `<details class="ly-sec" ${open ? 'open' : ''}><summary>${title}</summary><div class="ly-secb">${body}</div></details>`;
        function renderPanel() {
            if (!pbody.isConnected) return;
            dl.querySelectorAll('[data-ly-panel]').forEach(b => b.classList.toggle('is-on', b.dataset.lyPanel === panel)); // l'onglet suit toujours le panneau montré
            const keepScroll = pbody.scrollTop;
            pbody.innerHTML = ({pages: panelPages, layers: panelLayers, obj: panelObj, text: panelText, color: panelColor, links: panelLinks, history: panelHistory, doc: panelDoc}[panel] || panelPages)();
            if (panel === 'history') pbody.querySelector('.is-current')?.scrollIntoView({block: 'nearest'});
            pbody.scrollTop = keepScroll;
            // vignette : réduite, avec un contour à son échelle (sinon une page blanche disparaît sur le panneau blanc)
            const thumbZoom = (pg, w) => { const z = w / px(D.page.w); pg.style.zoom = String(z); pg.style.outline = `${(1 / z).toFixed(1)}px solid #b9b9c3`; };
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
            return sec('Gabarits', `<div class="ly-row ly-pmaster"><label class="ly-f ly-inline"><span>Page ${cur + (D.page.start || 1)} :</span><select data-ly-pmaster title="Ajouter, enlever ou remplacer le gabarit de cette page">${mopts(D.pages[cur]?.master || '')}</select></label><button type="button" class="button small secondary" data-ly-mmulti title="Mettre, enlever ou remplacer un gabarit sur plusieurs pages">Plusieurs pages…</button></div>
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
                + sec('Objets de la page', `<div class="ly-objlist">${curList().slice().reverse().map(it => `<button type="button" class="ly-orow${sel.includes(it.id) ? ' is-sel' : ''}" data-ly-pickobj="${esc(it.id)}"><i style="background:${layerOf(D, it)?.color}"></i>${it.hidden ? '🙈 ' : ''}${it.locked ? '🔒 ' : ''}${esc(it.name || ({text: 'Texte', frame: 'Cadre d’image', rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygone', star: 'Étoile', line: 'Ligne', path: 'Tracé', compound: 'Forme composée'}[it.type] || it.type))}</button>`).join('') || '<p class="ly-help">Aucun objet sur cette page.</p>'}</div>`);
        }
        function panelObj() {
            const its = selected(), it = one();
            if (!its.length) return `<p class="ly-help">Choisis un objet sur la page (outil ➤). Double-clic sur un texte pour l’écrire, sur un cadre pour y placer une image.</p>` + sec('Outils', `<div class="ly-row"><button type="button" class="button small" data-ly-cmd="place">🖼️ Placer une image</button></div>`);
            let h = '';
            if (it) {
                h += sec('Transformation', `<div class="ly-grid2">${num('x', 'X', it.x)}${num('y', 'Y', it.y)}${num('w', 'L', it.w, {min: 0})}${num('h', 'H', it.h, {min: 0})}${num('rot', 'Angle', it.rot || 0, {min: -360, max: 360, step: 1, unit: '°'})}<label class="ly-f ly-check"><input type="checkbox" data-ly-set="lockRatio" ${it.lockRatio ? 'checked' : ''}> Proportions</label></div>
                    <div class="ly-row"><button type="button" class="button small secondary" data-ly-flip="flipX">⇋ Miroir H</button><button type="button" class="button small secondary" data-ly-flip="flipY">⇵ Miroir V</button></div><label class="ly-f"><span>Nom</span><input type="text" data-ly-set="name" value="${esc(it.name || '')}" placeholder="(dans Calques)"></label>`);
                if (it.type === 'polygon' || it.type === 'star') h += sec('Forme', `${num('sides', it.type === 'star' ? 'Branches' : 'Côtés', it.sides || (it.type === 'star' ? 5 : 6), {min: 3, max: 60, step: 1, unit: ''})}${it.type === 'star' ? num('inner', 'Creux', it.inner || 45, {min: 5, max: 100, step: 1, unit: '%'}) : ''}`);
                if (it.type === 'path') h += sec('Tracé', `<label class="ly-f ly-check"><input type="checkbox" data-ly-set="smooth" ${it.smooth ? 'checked' : ''}> Courbe douce</label><label class="ly-f ly-check"><input type="checkbox" data-ly-set="closed" ${it.closed ? 'checked' : ''}> Fermé</label>`);
                if (['rect', 'ellipse', 'polygon', 'star', 'frame'].includes(it.type)) h += sec('Convertir la forme', `<div class="ly-row">${[['rect', '▭'], ['ellipse', '◯'], ['polygon', '⬡'], ['star', '☆']].map(([k, ic]) => `<button type="button" class="button small secondary" data-ly-convert="${k}" title="En ${k}">${ic}</button>`).join('')}</div>`, false);
            }
            const f0 = its[0];
            h += sec('Fond et contour', `${paintSel('fill', 'Fond', f0.fill)}${paintSel('stroke.c', 'Contour', f0.stroke?.c || 'none')}<div class="ly-grid2">${num('stroke.w', 'Épaisseur', f0.stroke?.w || 0, {min: 0, max: 100, step: 0.25, unit: 'pt'})}${sel2('stroke.dash', 'Type', DASHES, f0.stroke?.dash || 'solid')}${sel2('stroke.cap', 'Bouts', [['butt', 'Droits'], ['round', 'Arrondis'], ['square', 'Carrés']], f0.stroke?.cap || 'butt')}${sel2('stroke.join', 'Angles', [['miter', 'Pointus'], ['round', 'Arrondis'], ['bevel', 'Biseautés']], f0.stroke?.join || 'miter')}</div>${['rect', 'frame', 'text'].includes(f0.type) ? num('radius', 'Angles arrondis', f0.radius || 0, {min: 0, max: 500, step: 0.5}) : ''}`);
            h += sec('Effets', `<div class="ly-grid2">${num('opacity', 'Opacité', f0.opacity ?? 100, {min: 0, max: 100, step: 1, unit: '%'})}${sel2('blend', 'Fusion', BLENDS, f0.blend || 'normal')}${num('feather', 'Contour progressif', f0.feather || 0, {min: 0, max: 50, step: 0.5})}</div>
                <label class="ly-f ly-check"><input type="checkbox" data-ly-set="shadow.on" ${f0.shadow?.on ? 'checked' : ''}> Ombre portée</label>${f0.shadow?.on ? `<div class="ly-grid2">${num('shadow.x', 'Décalage X', f0.shadow.x ?? 1.5)}${num('shadow.y', 'Décalage Y', f0.shadow.y ?? 1.5)}${num('shadow.blur', 'Flou', f0.shadow.blur ?? 2, {min: 0, max: 50})}${num('shadow.o', 'Opacité', f0.shadow.o ?? 50, {min: 0, max: 100, step: 1, unit: '%'})}<label class="ly-f"><span>Couleur</span><input type="color" data-ly-set="shadow.c" value="${esc(f0.shadow.c || '#000000')}"></label></div>` : ''}`, false);
            if (it && it.type !== 'text') h += sec('Habillage du texte', `${sel2('wrap.mode', 'Le texte voisin', WRAPS, it.wrap?.mode || 'none')}${num('wrap.off', 'Distance', it.wrap?.off ?? 3, {min: 0, max: 100, step: 0.5})}<p class="ly-help">Les blocs de texte de la page contournent cet objet.</p>`, !!it.wrap?.mode && it.wrap.mode !== 'none');
            if (it?.type === 'frame' && it.src) h += sec('🔗 Objet dynamique', it.diagramId ? `<p class="ly-help">📊 Diagramme <b>lié</b>${linkState[it.id] === 'missing' ? ' — ⛔ introuvable' : ''} : modifié dans Graphiques → Mes diagrammes, il se redessine ici (« Mettre à jour »).</p><div class="ly-row"><button type="button" class="button small" data-ly-editdg>✏️ Modifier le diagramme</button><button type="button" class="button small secondary" data-ly-cmd="relink">↻ Mettre à jour</button></div>` : it.mediaId ? `<p class="ly-help">Image <b>liée</b> à une photo de l’app${linkState[it.id] === 'missing' ? ' — ⛔ introuvable' : linkState[it.id] === 'updated' ? ' — mise à jour' : ''} : elle reste en pleine qualité (rien n’est réduit), et toute retouche faite dans l’app arrive ici.</p><div class="ly-row"><button type="button" class="button small" data-ly-editorig>✏️ Modifier l’original (retouche)</button><button type="button" class="button small secondary" data-ly-cmd="relink">↻ Mettre à jour</button><button type="button" class="button small secondary" data-ly-unlinkimg title="L’image ne suit plus la photo de l’app">Incorporer (ne plus suivre)</button></div>`
                : '<p class="ly-help">Image incorporée au document. Pour qu’elle suive une photo de l’app (et ses retouches) : « Remplacer l’image » et choisis-la dans la base.</p>');
            if (it?.type === 'frame') h += sec('Cadre d’image', `<div class="ly-row"><button type="button" class="button small" data-ly-cmd="place">🖼️ ${it.src ? 'Remplacer' : 'Placer'} l’image</button>${it.src ? '<button type="button" class="button small secondary" data-ly-imgclear>Vider</button><button type="button" class="button small secondary" data-ly-cmd="fitframe">Cadre au contenu</button>' : ''}</div>${sel2('fit', 'Ajustement', FITS, it.fit || 'fill')}<div class="ly-grid2">${num('imgS', 'Échelle', it.imgS || 100, {min: 5, max: 2000, step: 1, unit: '%'})}${num('imgX', 'Décalage X', it.imgX || 0)}${num('imgY', 'Décalage Y', it.imgY || 0)}</div>`);
            if (it?.type === 'text') h += sec('Bloc de texte', `<div class="ly-grid2">${num('columns', 'Colonnes', it.columns || 1, {min: 1, max: 12, step: 1, unit: ''})}${num('gutter', 'Gouttière', it.gutter ?? 4, {min: 0, max: 50, step: 0.5})}${num('inset', 'Marge intérieure', it.inset || 0, {min: 0, max: 100, step: 0.5})}${sel2('valign', 'Vertical', [['top', 'En haut'], ['middle', 'Au milieu'], ['bottom', 'En bas'], ['justify', 'Justifié']], it.valign || 'top')}</div><div class="ly-row"><button type="button" class="button small secondary" data-ly-cmd="fitframe">Ajuster la hauteur au texte</button></div>`);
            if (it?.type === 'text' && !editMaster) {
                const head = chainHead(it), list = chainList(head), k = list.indexOf(it), pg = idv => pageOfItem(idv) + (D.page.start || 1);
                h += sec('➜ Texte chaîné', `${list.length > 1 ? `<p class="ly-help">Bloc ${k + 1} sur ${list.length} : ${list.map((x, j) => `<button type="button" class="link-button" data-ly-chaingo="${esc(x.id)}">${j === k ? '<b>' : ''}p. ${pg(x.id)}${j === k ? '</b>' : ''}</button>`).join(' → ')}</p>` : '<p class="ly-help">Un texte peut continuer d’un bloc à l’autre, sur d’autres pages : il passe tout seul à la suite quand le premier est plein.</p>'}
                    <div class="ly-row">${it.next ? '<button type="button" class="button small secondary" data-ly-cmd="unchain">Couper après ce bloc</button>' : '<button type="button" class="button small secondary" data-ly-cmd="chain">➜ Chaîner vers un bloc…</button>'}<button type="button" class="button small secondary" data-ly-cmd="autoflow" title="Ajoute des pages (même gabarit) et des blocs chaînés jusqu’à ce que tout le texte tienne">⤵ Faire couler sur de nouvelles pages</button></div>`, list.length > 1 || !!it.auto);
                if (it.auto) h += sec(it.auto === 'toc' ? '📑 Table des matières' : '🔤 Index des noms', it.auto === 'toc'
                    ? `<p class="ly-help">Elle reprend, dans l’ordre des pages, les paragraphes de ces styles (le 1er au premier niveau, les suivants en retrait) :</p><div class="ly-autost">${D.paraStyles.map(s0 => `<label class="ly-f ly-check"><input type="checkbox" data-ly-autost="${esc(s0.id)}" ${(it.autoStyles || []).includes(s0.id) ? 'checked' : ''}> ${esc(s0.name)}${(it.autoStyles || []).includes(s0.id) ? ` <small>(niveau ${(it.autoStyles || []).indexOf(s0.id) + 1})</small>` : ''}</label>`).join('')}</div>${sel2('autoPs', 'Style des lignes', D.paraStyles.map(s0 => [s0.id, s0.name]), it.autoPs || 'ps-body')}<label class="ly-f ly-check"><input type="checkbox" data-ly-set="autoDots" ${it.autoDots !== false ? 'checked' : ''}> Points de conduite (……… 12)</label>`
                    : `<p class="ly-help">Noms marqués avec le style de caractère « Nom à indexer »${it.names?.length ? `, et ${it.names.length} personnes de la généalogie cherchées dans le texte` : ''}. Rangé par nom de famille, avec les pages.</p>${sel2('autoPs', 'Style des lignes', D.paraStyles.map(s0 => [s0.id, s0.name]), it.autoPs || 'ps-list')}<div class="ly-row"><button type="button" class="button small secondary" data-ly-idxnames>${it.names?.length ? '↻ Recharger les noms de la généalogie' : '＋ Chercher les noms de la généalogie'}</button>${it.names?.length ? '<button type="button" class="button small secondary" data-ly-idxnone>Seulement les noms marqués</button>' : ''}</div>`);
                if (it.dyn) h += sec('👤 Objet dynamique : fiche', `<p class="ly-help">Ce texte suit une fiche de la généalogie${it.dyn.at ? ` (mis à jour le ${esc(it.dyn.at.replace('T', ' à '))})` : ''}. L’écrire à la main le détache.</p><div class="ly-row"><button type="button" class="button small" data-ly-dynupd>↻ Mettre à jour</button><button type="button" class="button small secondary" data-ly-dynedit>Changer la fiche ou ce qu’on montre…</button><button type="button" class="button small secondary" data-ly-dynopen>↗ Ouvrir la fiche</button><button type="button" class="button small secondary" data-ly-dyndetach>Détacher</button></div>`);
            }
            if (it) h += sec('Lien', `<label class="ly-f"><span>Adresse</span><input type="url" data-ly-set="link" value="${esc(it.link || '')}" placeholder="https://… (cliquable dans le PDF et le HTML)"></label>`, !!it.link);
            h += sec('Aligner et répartir', `<div class="ly-row">${[['l', '⇤', 'À gauche'], ['ch', '↔', 'Centrer'], ['r', '⇥', 'À droite'], ['t', '⤒', 'En haut'], ['cv', '↕', 'Au milieu'], ['b', '⤓', 'En bas']].map(([k, ic, t]) => `<button type="button" class="button small secondary" data-ly-align="${k}" title="${t}">${ic}</button>`).join('')}</div><div class="ly-row">${sel2('alignTo', 'Par rapport à', [['sel', 'la sélection'], ['margins', 'aux marges'], ['page', 'à la page']], dl.dataset.alignTo || (its.length > 1 ? 'sel' : 'margins'), 'data-ly-alignto')}</div>${its.length > 2 ? `<div class="ly-row"><button type="button" class="button small secondary" data-ly-dist="h">Répartir ↔</button><button type="button" class="button small secondary" data-ly-dist="v">Répartir ↕</button></div>` : ''}`, its.length > 1);
            const shp = its.filter(x => ['rect', 'ellipse', 'polygon', 'star', 'path', 'frame'].includes(x.type));
            h += sec('Pathfinder', shp.length >= 2 ? `<div class="ly-row">${[['union', '⊕ Ajouter'], ['subtract', '⊖ Soustraire'], ['intersect', '⊗ Intersection'], ['exclude', '⊘ Exclure']].map(([k, l]) => `<button type="button" class="button small secondary" data-ly-pf="${k}">${l}</button>`).join('')}</div><p class="ly-help">Soustraire : les formes de devant découpent celle du fond.</p>` : (it?.type === 'compound' ? '<div class="ly-row"><button type="button" class="button small secondary" data-ly-pf="release">Décomposer</button></div>' : '<p class="ly-help">Choisis au moins deux formes (Maj + clic).</p>'), false);
            h += sec('Disposition', `<div class="ly-row"><button type="button" class="button small secondary" data-ly-cmd="front">Premier plan</button><button type="button" class="button small secondary" data-ly-cmd="fwd">Avancer</button><button type="button" class="button small secondary" data-ly-cmd="back">Reculer</button><button type="button" class="button small secondary" data-ly-cmd="bottom">Arrière-plan</button></div><div class="ly-row"><button type="button" class="button small secondary" data-ly-cmd="lock">${its.every(x => x.locked) ? '🔓 Déverrouiller' : '🔒 Verrouiller'}</button><button type="button" class="button small secondary" data-ly-cmd="dup">Dupliquer</button><button type="button" class="button small secondary danger" data-ly-cmd="del">Supprimer</button></div>`, false);
            return h;
        }
        function panelText() {
            const it = one(), ed = !!editingId, fonts = fontList();
            const fontPick = `<label class="ly-f ly-f-font"><span>Police</span>${fontPickHtml('data-ly-char="font-family"')}</label><div class="ly-row"><button type="button" class="button small secondary" data-ly-localfonts>🖥 Polices de l’ordinateur</button></div>`;
            const charSec = sec('Caractère', `${fontPick}<div class="ly-grid2">${sel2('font-weight', 'Graisse', [['', '—'], ['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold'], ['900', 'Black']], '', 'data-ly-char')}${sel2('font-style', 'Style', [['', '—'], ['normal', 'Romain'], ['italic', 'Italique']], '', 'data-ly-char')}${num('font-size', 'Corps', '', {min: 3, max: 400, step: 0.5, unit: 'pt', attr: 'data-ly-char'})}${num('line-height', 'Interlignage', '', {min: 3, max: 400, step: 0.5, unit: 'pt', attr: 'data-ly-char'})}${num('letter-spacing', 'Approche', '', {min: -200, max: 1000, step: 5, unit: '‰', attr: 'data-ly-char'})}${num('top', 'Ligne de base', '', {min: -100, max: 100, step: 0.5, unit: 'pt', attr: 'data-ly-char'})}${sel2('caps', 'Capitales', [['', '—'], ['none', 'Normales'], ['small', 'Petites capitales'], ['all', 'Toutes capitales']], '', 'data-ly-char')}${sel2('font-kerning', 'Crénage', [['', '—'], ['auto', 'Automatique'], ['none', 'Aucun']], '', 'data-ly-char')}</div>
                <div class="ly-row ly-tbtns"><button type="button" data-ly-exec="bold" title="Gras"><b>G</b></button><button type="button" data-ly-exec="italic" title="Italique"><i>I</i></button><button type="button" data-ly-exec="underline" title="Souligné"><u>S</u></button><button type="button" data-ly-exec="strikeThrough" title="Barré"><s>B</s></button><button type="button" data-ly-exec="superscript" title="Exposant">x²</button><button type="button" data-ly-exec="subscript" title="Indice">x₂</button><button type="button" data-ly-exec="removeFormat" title="Enlever la mise en forme">⌫</button></div>
                <label class="ly-f"><span>Couleur</span><select data-ly-char="color"><option value="">Nuancier…</option>${D.swatches.filter(s => s.type !== 'grad').map(s => `<option value="${esc(s.c)}">■ ${esc(s.name)}</option>`).join('')}</select></label>
                <div class="ly-colorfree"><span>Couleur libre</span><input type="color" data-ly-char="color" value="${esc(lastTextColor)}" title="Choisir n’importe quelle couleur"><input type="text" data-ly-hex value="${esc(lastTextColor)}" maxlength="7" spellcheck="false" title="Code couleur, ex. #7a2e2e"><div class="ly-swmini">${D.swatches.filter(s => s.type !== 'grad').map(s => `<button type="button" data-ly-tcol="${esc(s.c)}" title="${esc(s.name)}" style="background:${esc(s.c)}"></button>`).join('')}</div></div>`);
            const paraSec = sec('Paragraphe', `<div class="ly-row ly-tbtns">${[['left', '⯇', 'À gauche'], ['center', '≡', 'Centré'], ['right', '⯈', 'À droite'], ['justify', '☰', 'Justifié'], ['justify-all', '▤', 'Justifié, dernière ligne aussi']].map(([k, ic, t]) => `<button type="button" data-ly-palign="${k}" title="${t}">${ic}</button>`).join('')}</div>
                <div class="ly-grid2">${num('margin-left', 'Retrait gauche', '', {attr: 'data-ly-para'})}${num('margin-right', 'Retrait droit', '', {attr: 'data-ly-para'})}${num('text-indent', '1re ligne', '', {attr: 'data-ly-para'})}${num('margin-top', 'Espace avant', '', {attr: 'data-ly-para'})}${num('margin-bottom', 'Espace après', '', {attr: 'data-ly-para'})}${sel2('hyphens', 'Césure', [['', '—'], ['auto', 'Oui'], ['manual', 'Non']], '', 'data-ly-para')}</div>
                <div class="ly-row"><button type="button" class="button small secondary" data-ly-exec="insertUnorderedList">• Liste</button><button type="button" class="button small secondary" data-ly-exec="insertOrderedList">1. Liste</button><button type="button" class="button small secondary" data-ly-link>🔗 Lien</button></div>
                <div class="ly-row"><span class="ly-help">Insérer :</span>${[['{page}', 'n° de page'], ['{pages}', 'nb de pages'], ['{titre}', 'titre'], ['—', 'tiret'], ['« ', '«'], [' »', '»'], [' ', 'espace insécable'], ['…', '…'], ['❦', '❦']].map(([v, l]) => `<button type="button" class="button small secondary" data-ly-ins="${esc(v)}" title="${esc(l)}">${esc(l.length > 3 ? l : v.trim() || l)}</button>`).join('')}</div>`);
            const styles = sec('Styles de paragraphe', `<div class="ly-styles">${D.paraStyles.map(s => `<div class="ly-srow"><button type="button" data-ly-pstyle="${esc(s.id)}" style="font-family:'${fontOk(s.font)}';color:${colorOf(D, s.color, '#111')}">${esc(s.name)}</button><button type="button" class="icon-button small" data-ly-pstedit="${esc(s.id)}" title="Modifier le style (tout le livre suit)">✎</button></div>`).join('')}</div><div class="ly-row"><button type="button" class="button small secondary" data-ly-psnew>＋ Nouveau style</button></div>`)
                + sec('Styles de caractère', `<div class="ly-styles">${D.charStyles.map(s => `<div class="ly-srow"><button type="button" data-ly-cstyle="${esc(s.id)}">${esc(s.name)}</button><button type="button" class="icon-button small" data-ly-cstedit="${esc(s.id)}" title="Modifier">✎</button></div>`).join('')}<div class="ly-srow"><button type="button" data-ly-cstyle="">Aucun (enlever)</button></div></div><div class="ly-row"><button type="button" class="button small secondary" data-ly-csnew>＋ Nouveau style</button></div>`, false);
            const intro = ed ? '<p class="ly-help">✏️ Tu écris dans un bloc : les réglages s’appliquent au texte choisi (sinon au paragraphe ou à tout le bloc). Échap pour sortir.</p>' : it?.type === 'text' ? '<p class="ly-help">Bloc choisi : les réglages s’appliquent à tout son texte. Double-clic pour écrire dedans.</p>' : '<p class="ly-help">Choisis un bloc de texte (outil T pour en tracer un).</p>';
            return intro + charSec + paraSec + styles;
        }
        function panelColor() {
            const it = one(), target = fillTarget, cur0 = it ? (target === 'fill' ? it.fill : it.stroke?.c) : '';
            const gr = D.swatches.find(s => s.id === dl.dataset.grad && s.type === 'grad');
            return `<div class="ly-row"><button type="button" class="button small ${target === 'fill' ? '' : 'secondary'}" data-ly-target="fill">■ Fond</button><button type="button" class="button small ${target === 'stroke' ? '' : 'secondary'}" data-ly-target="stroke">□ Contour</button><button type="button" class="button small ${target === 'text' ? '' : 'secondary'}" data-ly-target="text">A Texte</button></div>`
                + sec('Nuancier', `<div class="ly-swatches"><button type="button" class="ly-sw is-none${cur0 === 'none' ? ' is-cur' : ''}" data-ly-sw="none" title="Aucun"></button>${D.swatches.map(s => `<button type="button" class="ly-sw${cur0 === s.id ? ' is-cur' : ''}" data-ly-sw="${esc(s.id)}" title="${esc(s.name)}" style="background:${cssPaint(D, s.id)}"></button>`).join('')}</div>
                    <div class="ly-swlist">${D.swatches.map(s => `<div class="ly-swrow"><i style="background:${cssPaint(D, s.id)}"></i><span>${esc(s.name)}</span>${s.type === 'grad' ? `<button type="button" class="icon-button small" data-ly-gedit="${esc(s.id)}" title="Modifier le dégradé">✎</button>` : `<input type="color" value="${esc(s.c)}" data-ly-swc="${esc(s.id)}" title="Changer la couleur (tout le livre suit)">`}<button type="button" class="icon-button small" data-ly-swren="${esc(s.id)}" title="Renommer">Aa</button>${s.id === 'sw-paper' ? '' : `<button type="button" class="icon-button small" data-ly-swdel="${esc(s.id)}" title="Supprimer">🗑</button>`}</div>`).join('')}</div>
                    <div class="ly-row"><input type="color" data-ly-newc value="#336699"><button type="button" class="button small secondary" data-ly-swnew>＋ Ajouter la couleur</button><button type="button" class="button small secondary" data-ly-grnew>＋ Nouveau dégradé</button></div>`)
                + (gr ? sec(`Dégradé « ${esc(gr.name)} »`, `${sel2('kind', 'Type', [['linear', 'Linéaire'], ['radial', 'Radial']], gr.kind, 'data-ly-gset')}${num('angle', 'Angle', gr.angle || 0, {min: -360, max: 360, step: 1, unit: '°', attr: 'data-ly-gset'})}<div class="ly-gbar" style="background:${cssPaint(D, gr.id)}"></div>${gr.stops.map((st, i) => `<div class="ly-grow"><input type="color" value="${st.c}" data-ly-gstop="${i}" data-k="c"><input type="range" min="0" max="100" value="${st.p}" data-ly-gstop="${i}" data-k="p"><span>${st.p} %</span>${gr.stops.length > 2 ? `<button type="button" class="icon-button small" data-ly-gdel="${i}">✕</button>` : ''}</div>`).join('')}<div class="ly-row"><button type="button" class="button small secondary" data-ly-gadd>＋ Arrêt de couleur</button></div>`) : '')
                + sec('Couleur libre', `<div class="ly-row"><input type="color" data-ly-free value="${hexOk(cur0) ? cur0 : '#888888'}"><span class="ly-help">pour l’objet choisi, sans l’ajouter au nuancier</span></div>`, false);
        }
        function panelLinks() {
            const rows = []; D.pages.forEach((p, i) => p.items.forEach(it => { if (it.src !== undefined && it.type === 'frame') rows.push({i, it}); })); D.masters.forEach(m => m.items.forEach(it => { if (it.type === 'frame') rows.push({i: -1, m, it}); }));
            const dyn = []; D.pages.forEach((p, i) => p.items.forEach(it => { if (it.dyn) dyn.push({i, it}); }));
            return `<div class="ly-row"><button type="button" class="button small" data-ly-cmd="relink">↻ Mettre à jour tous les liens</button></div>` + (dyn.length ? sec(`Textes liés à des fiches (${dyn.length})`, `<div class="ly-links">${dyn.map(({i, it}) => `<div class="ly-linkrow"><span class="ly-noimg">👤</span><span><b>${esc(plainOf(it.html).slice(0, 60))}</b><small>page ${i + (D.page.start || 1)} · ${linkState[it.id] === 'missing' ? '⛔ fiche introuvable' : 'suit la fiche'}</small></span><button type="button" class="button small secondary" data-ly-linkgo="${i}:${esc(it.id)}">Aller</button></div>`).join('')}</div>`) : '') + sec(`Liens — images placées (${rows.filter(r => r.it.src).length})`, rows.length ? `<div class="ly-links">${rows.map(({i, m, it}) => `<div class="ly-linkrow">${it.src ? `<img src="${esc(it.src)}" alt="">` : '<span class="ly-noimg">vide</span>'}<span><b>${esc(it.srcName || (it.src?.startsWith('data:') ? 'Image intégrée' : it.src?.replace('media/', '') || 'Cadre vide'))}</b><small>${m ? esc(m.name) : `page ${i + (D.page.start || 1)}`} · ${it.src?.startsWith('data:') ? 'intégrée au document' : it.mediaId ? ({missing: '⛔ introuvable', updated: '🔗 liée · mise à jour'}[linkState[it.id]] || '🔗 liée · à jour') : it.src ? 'photo de la base' : '—'}</small></span>${it.mediaId && !m ? `<button type="button" class="button small secondary" data-ly-editorig2="${esc(it.id)}" title="Retoucher la photo de l’app">✏️</button>` : ''}${m ? '' : `<button type="button" class="button small secondary" data-ly-linkgo="${i}:${esc(it.id)}">Aller</button><button type="button" class="button small secondary" data-ly-linkrep="${i}:${esc(it.id)}">Remplacer</button>`}</div>`).join('')}</div>` : '<p class="ly-help">Aucun cadre d’image : outil ⊠ ou Objet → Placer une image.</p>');
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
                <label class="ly-f"><span>Format</span><select data-ly-doc="size"><option value="">Personnalisé</option>${allSizes().map(([k, l, w, h]) => `<option value="${k}" ${Math.abs(P.w - w) < 0.2 && Math.abs(P.h - h) < 0.2 ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <div class="ly-grid2">${num('w', 'Largeur', P.w, {min: 30, max: 1500, attr: 'data-ly-doc'})}${num('h', 'Hauteur', P.h, {min: 30, max: 1500, attr: 'data-ly-doc'})}${num('m.t', 'Haut', M.t, {min: 0, max: 300, attr: 'data-ly-doc'})}${num('m.b', 'Bas', M.b, {min: 0, max: 300, attr: 'data-ly-doc'})}${num('m.i', P.facing ? 'Petit fond' : 'Gauche', M.i, {min: 0, max: 300, attr: 'data-ly-doc'})}${num('m.o', P.facing ? 'Grand fond' : 'Droite', M.o, {min: 0, max: 300, attr: 'data-ly-doc'})}${num('columns', 'Colonnes', P.columns, {min: 1, max: 12, step: 1, unit: '', attr: 'data-ly-doc'})}${num('gutter', 'Gouttière', P.gutter, {min: 0, max: 60, attr: 'data-ly-doc'})}${num('bleed', 'Fond perdu', P.bleed, {min: 0, max: 30, attr: 'data-ly-doc'})}${num('slug', 'Ligne-bloc', P.slug || 0, {min: 0, max: 80, attr: 'data-ly-doc'})}${num('start', '1re page n°', P.start || 1, {min: 1, max: 9999, step: 1, unit: '', attr: 'data-ly-doc'})}</div>
                <label class="ly-f ly-check"><input type="checkbox" data-ly-doc="facing" ${P.facing ? 'checked' : ''}> Pages en vis-à-vis (livre)</label>${paintSel('paper', 'Papier', P.paper).replace('data-ly-set="paper"', 'data-ly-doc="paper"')}
                <p class="ly-help">Les nouveaux documents partent des <button type="button" class="link-button" data-ly-defaults>réglages par défaut</button>.</p>`);
        }

        /* — panneaux : ce qu'on change — */
        const setPath = (o, k, v) => { const ks = k.split('.'); let t = o; ks.slice(0, -1).forEach(x => { t[x] = t[x] && typeof t[x] === 'object' ? t[x] : {}; t = t[x]; }); t[ks.at(-1)] = v; };
        const labelOfField = el => (el.closest('label')?.querySelector('span')?.textContent || el.closest('label')?.firstChild?.textContent || '').trim();
        pbody.addEventListener('change', async e => {
            if (e.target.matches('[data-ly-autost]')) { const it = one(); if (!it) return; const k = e.target.dataset.lyAutost; it.autoStyles = (it.autoStyles || []).filter(x => x !== k); if (e.target.checked) it.autoStyles.push(k); commit('Sommaire : styles'); render(); return; }
            if (e.target.matches('[data-ly-pmaster]')) { const v = e.target.value, m = D.masters.find(x => x.id === v); D.pages[cur].master = m ? m.id : ''; act = m ? `Gabarit « ${m.name} » sur la page ${cur + 1}` : `Gabarit enlevé de la page ${cur + 1}`; commit(); render(); return; }
            const el = e.target; act = labelOfField(el) ? `${labelOfField(el)} changé` : '';
            if (el.matches('[data-ly-set]')) {
                const k = el.dataset.lySet, v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
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
            if (e.target.closest('[data-ly-dynupd]')) { const it = one(); if (it?.dyn) { it.html = await personDynHtml(it.dyn.id, it.dyn.fields); it.dyn.at = new Date().toISOString().slice(0, 16); commit('Texte de la fiche mis à jour'); render(); } return; }
            if (e.target.closest('[data-ly-dynedit]')) return dynPersonDialog(one());
            if (e.target.closest('[data-ly-dynopen]')) { const it = one(); if (it?.dyn) { A().state.currentPersonId = it.dyn.id; if (!dirty || confirm('Fermer la mise en page pour ouvrir la fiche ? (enregistre d’abord si besoin)')) { keyAc.abort(); dl.close(); A().setModule('personnes'); } } return; }
            if (e.target.closest('[data-ly-dyndetach]')) { const it = one(); if (it) { delete it.dyn; commit('Texte détaché de la fiche'); render(); } return; }
            if (e.target.closest('[data-ly-idxnames]')) { const it = one(); try { const r = await api('person_names'); it.names = (r.persons || []).map(p => `${p.first_name || ''}|${p.last_name || ''}`); commit('Index : noms de la généalogie'); render(); } catch (err) { toast(err.message, 'error'); } return; }
            if (e.target.closest('[data-ly-idxnone]')) { const it = one(); delete it.names; commit('Index : noms marqués seulement'); render(); return; }
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
            if (d.lyLocalfonts !== undefined) { if (typeof window.queryLocalFonts !== 'function') return toast('Ce navigateur ne sait pas lister les polices de l’ordinateur : tape le nom de la police.', 'error'); try { localFonts = [...new Set((await window.queryLocalFonts()).map(f => f.family))].sort((a, c) => a.localeCompare(c, 'fr')); toast(`${localFonts.length} polices de l’ordinateur ajoutées à la liste.`); renderPanel(); } catch (_) { toast('Accès aux polices refusé.', 'error'); } return; }
            if (d.lySw) return applyPaint(d.lySw);
            if (d.lySwnew !== undefined) { const c = pbody.querySelector('[data-ly-newc]').value, n = await ask('Nom de la couleur :', c); if (n === null) return; D.swatches.push({id: nid('sw-'), name: n.slice(0, 60) || c, type: 'color', c}); commit(); renderPanel(); return; }
            if (d.lyGrnew !== undefined) { const g = {id: nid('gr-'), name: 'Dégradé', type: 'grad', kind: 'linear', angle: 90, stops: [{c: '#ffffff', p: 0}, {c: colorOf(D, 'sw-accent', '#7a2e2e'), p: 100}]}; D.swatches.push(g); dl.dataset.grad = g.id; commit(); renderPanel(); return; }
            if (d.lyGedit) { dl.dataset.grad = d.lyGedit; renderPanel(); return; }
            if (d.lyGadd !== undefined) { const g = D.swatches.find(s => s.id === dl.dataset.grad); if (g && g.stops.length < 8) { g.stops.push({c: '#888888', p: 50}); g.stops.sort((a, c) => a.p - c.p); commit(); render(); } return; }
            if (d.lyGdel !== undefined) { const g = D.swatches.find(s => s.id === dl.dataset.grad); if (g && g.stops.length > 2) { g.stops.splice(Number(d.lyGdel), 1); commit(); render(); } return; }
            if (d.lySwren) { const s0 = swatch(D, d.lySwren), n = await ask('Nom :', s0?.name); if (s0 && n) { s0.name = n.slice(0, 60); commit(); renderPanel(); } return; }
            if (d.lySwdel) { const used = JSON.stringify(D).split(`"${d.lySwdel}"`).length - 2; if (!confirm(used > 0 ? `Cette nuance sert ${used} fois : ces objets passeront en noir. Supprimer ?` : 'Supprimer cette nuance ?')) return; D.swatches = D.swatches.filter(s => s.id !== d.lySwdel); const txt = JSON.stringify(D).split(`"${d.lySwdel}"`).join('"sw-black"'); D = JSON.parse(txt); commit(); render(); return; }
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
                if (d.lyLdel !== undefined) { if (D.layers.length < 2) return msg('Il faut au moins un calque.'); if (!confirm(`Supprimer le calque « ${l.name} » et ses objets ?`)) return; D.layers.splice(i, 1); [...D.pages.map(p => p.items), ...D.masters.map(m => m.items)].forEach(list => { for (let k = list.length - 1; k >= 0; k--) if (list[k].layer === l.id) list.splice(k, 1); }); commit(); render(); return; }
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
            const to = dl.dataset.alignTo || (its.length > 1 ? 'sel' : 'margins'), m = pageMargins(D, cur);
            const ref = to === 'sel' && its.length > 1 ? bounds(its) : to === 'page' ? {x: 0, y: 0, w: D.page.w, h: D.page.h} : {x: m.l, y: m.t, w: D.page.w - m.l - m.r, h: D.page.h - m.t - m.b};
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
            const list = kind === 'para' ? D.paraStyles : D.charStyles, s0 = list.find(x => x.id === sid) || {id: nid(kind === 'para' ? 'ps-' : 'cs-'), name: kind === 'para' ? 'Nouveau style' : 'Nouveau style de caractère'};
            const fonts = fontList();
            ext.openDialog({eyebrow: kind === 'para' ? 'STYLE DE PARAGRAPHE' : 'STYLE DE CARACTÈRE', title: s0.name, wide: true, submitLabel: 'Enregistrer le style', onOpen: bindFontPick, onDelete: sid && !STYLE_IDS.includes(sid) ? () => { const i = list.indexOf(s0); if (i >= 0) list.splice(i, 1); commit(); render(); } : undefined,
                body: `<div class="form-grid"><label>Nom <input name="name" value="${esc(s0.name)}" maxlength="60"></label><label>Police ${fontPickHtml('name="font"', s0.font || '')}</label>
                    <label>Corps (pt) <input type="number" step="0.5" name="size" value="${s0.size ?? ''}"></label><label>Interlignage (pt) <input type="number" step="0.5" name="lead" value="${s0.lead ?? ''}"></label>
                    <label>Graisse <select name="weight"><option value="">—</option>${[300, 400, 500, 600, 700, 900].map(w => `<option ${Number(s0.weight) === w ? 'selected' : ''}>${w}</option>`).join('')}</select></label><label>Couleur <select name="color"><option value="">—</option>${D.swatches.filter(x => x.type !== 'grad').map(x => `<option value="${esc(x.id)}" ${s0.color === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
                    <label>Approche (‰) <input type="number" step="5" name="track" value="${s0.track ?? ''}"></label><label>Capitales <select name="caps"><option value="">—</option><option value="small" ${s0.caps === 'small' ? 'selected' : ''}>Petites capitales</option><option value="all" ${s0.caps === 'all' ? 'selected' : ''}>Toutes capitales</option></select></label>
                    <label class="checkbox-line"><input type="checkbox" name="italic" ${s0.italic ? 'checked' : ''}> Italique</label><label class="checkbox-line"><input type="checkbox" name="underline" ${s0.underline ? 'checked' : ''}> Souligné</label>
                    ${kind === 'para' ? `<label>Alignement <select name="align">${[['left', 'À gauche'], ['center', 'Centré'], ['right', 'À droite'], ['justify', 'Justifié'], ['justify-all', 'Justifié (tout)']].map(([k, l]) => `<option value="${k}" ${s0.align === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                    <label>Espace avant (mm) <input type="number" step="0.5" name="before" value="${s0.before ?? ''}"></label><label>Espace après (mm) <input type="number" step="0.5" name="after" value="${s0.after ?? ''}"></label>
                    <label>Retrait gauche (mm) <input type="number" step="0.5" name="left" value="${s0.left ?? ''}"></label><label>Retrait droit (mm) <input type="number" step="0.5" name="right" value="${s0.right ?? ''}"></label>
                    <label>Retrait 1re ligne (mm) <input type="number" step="0.5" name="indent" value="${s0.indent ?? ''}"></label><label>Lettrine (lignes, 0 = aucune) <input type="number" min="0" max="8" name="drop" value="${s0.drop ?? 0}"></label>
                    <label class="checkbox-line"><input type="checkbox" name="hyph" ${s0.hyph ? 'checked' : ''}> Césure</label>` : ''}</div><p class="muted">Tous les paragraphes${kind === 'char' ? ' (mots)' : ''} qui ont ce style changent dans tout le livre.</p>`,
                onSubmit: f => {
                    const v = Object.fromEntries(new FormData(f)); const o = {id: s0.id, name: (v.name || 'Style').slice(0, 60)};
                    if (v.font) o.font = fontOk(v.font); ['size', 'lead', 'weight', 'track', 'before', 'after', 'left', 'right', 'indent', 'drop'].forEach(k => { if (v[k] !== undefined && v[k] !== '' && Number(v[k])) o[k] = Number(v[k]); });
                    if (v.color) o.color = v.color; if (v.caps) o.caps = v.caps; if (v.align) o.align = v.align; ['italic', 'underline', 'hyph'].forEach(k => { if (v[k]) o[k] = true; });
                    const i = list.findIndex(x => x.id === s0.id); if (i >= 0) list[i] = o; else list.push(o); commit(); render();
                }});
        }

        setDirty(!id); render(); syncHistory(); requestAnimationFrame(() => zoomFit());
        ext.fullInit?.(dl, 'layout', true); // plein écran par défaut ; ⛶ pour passer en fenêtre (retenu)
        dl.showModal(); canvas.focus({preventScroll: true}); // les raccourcis (V, T, M…) marchent tout de suite
        setTimeout(() => refreshLinks(true).catch(() => {}), 300); // objets dynamiques : photos retouchées, fiches changées
        return dl;
    }
    /* ═════════════ Images : une photo de la base, ou un fichier de l'ordinateur (intégré, réduit) ═════════════ */
    function pickImage() {
        return new Promise(async resolve => {
            let rows = []; try { rows = (await api('media_av_list', {kind: 'image'})).items.filter(i => i.exists); } catch (_) {}
            let done = false;
            const dlg = ext.openDialog({eyebrow: 'PLACER UNE IMAGE', title: 'Choisir une image', wide: true, submitLabel: 'Placer',
                body: `<label class="h-rc-drop"><input type="file" name="file" accept="image/png,image/jpeg,image/webp,image/gif"><span>📁 Une image de l’ordinateur (intégrée au document)…</span></label>
                    <p class="muted">… ou une photo de la base : elle reste <b>liée</b> (objet dynamique) — retouchée dans l’app, elle se met à jour ici.</p><input type="search" data-q placeholder="Chercher…">
                    <div class="ly-imgpick" data-list>${rows.map(r => `<label title="${esc(r.title || r.filename)}"><input type="radio" name="pick" value="${r.id}"><img src="media/${encodeURIComponent(r.filename)}" alt="" loading="lazy"><span>${esc(r.title || r.filename)}</span></label>`).join('') || '<p class="muted">Aucune photo dans la base.</p>'}</div>`,
                onOpen: d => d.querySelector('[data-q]').addEventListener('input', e => { const q = e.target.value.toLowerCase(); d.querySelectorAll('[data-list] label').forEach(l => { l.hidden = !l.textContent.toLowerCase().includes(q); }); }),
                onSubmit: async f => {
                    const file = f.file.files[0], pick = f.querySelector('[name=pick]:checked');
                    if (file) { if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) { toast('Image PNG, JPEG, WebP ou GIF seulement.', 'error'); return false; } const src = await shrink(file); done = true; resolve({src, name: file.name}); return; }
                    if (pick) { const r = rows.find(x => x.id === Number(pick.value)); done = true; resolve({src: `media/${r.filename}`, name: r.title || r.filename, mediaId: r.id}); return; }
                    toast('Choisis une image.', 'error'); return false;
                }});
            dlg.addEventListener('close', () => { if (!done) resolve(null); });
        });
    }
    /** Une image de l'ordinateur, réduite (2 400 px au plus) pour garder le document léger */
    function shrink(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file), im = new Image();
            im.onload = () => { const k = Math.min(1, 2400 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL(file.type === 'image/png' || file.type === 'image/gif' ? 'image/png' : 'image/jpeg', 0.88)); };
            im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible.')); }; im.src = url;
        });
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
        const special = all.some(({it}) => it.next || it.auto); if (!special) return doc;
        const key = editingId + '|' + JSON.stringify([doc.page, doc.paraStyles, doc.charStyles, doc.pages.map(p => p.items.filter(it => it.type === 'text').map(it => [it.id, it.html, it.x, it.y, it.w, it.h, it.next, it.auto, it.autoStyles, it.autoPs, it.columns, it.inset, it.gutter, (it.names || []).length]).concat(p.items.filter(it => it.wrap && it.wrap.mode !== 'none').map(it => [it.id, it.x, it.y, it.w, it.h, it.wrap.mode, it.wrap.off, it.hidden])))]);
        // seuls les textes sont recalculés (et gardés en mémoire) ; les autres objets viennent toujours du document, tels quels
        const live = V0 => { const tx = new Map(); V0.pages.forEach(p => p.items.forEach(x => { if (x.type === 'text') tx.set(x.id, x); })); return {...doc, pages: doc.pages.map(p => ({...p, items: p.items.map(x => x.type === 'text' ? tx.get(x.id) || x : x)}))}; };
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
            if (!it.auto || targets.has(it.id)) return;
            let html = '';
            if (it.auto === 'toc') {
                const want = it.autoStyles?.length ? it.autoStyles : ['ps-chapter'], rows = [];
                pageTexts.forEach((list, i) => list.forEach(t => { const d = document.createElement('div'); d.innerHTML = t.html || ''; d.querySelectorAll('[data-ps]').forEach(b => { const lvl = want.indexOf(b.dataset.ps); const txt = (b.textContent || '').replace(/\s+/g, ' ').trim(); if (lvl >= 0 && txt && !b.hasAttribute('data-cont')) rows.push({txt, lvl, page: i + start}); }); }));
                html = rows.map(r => `<p data-ps="${esc(it.autoPs || 'ps-body')}" class="ly-toc" style="margin-left:${r.lvl * 5}mm"><span>${esc(r.txt)}</span>${it.autoDots !== false ? '<i class="ly-tl"></i>' : '<i class="ly-tsp"></i>'}<span>${r.page}</span></p>`).join('') || '<p data-ps="ps-body"><em>(Le sommaire se remplit avec les paragraphes en style « Chapitre », ou ceux choisis dans Objet.)</em></p>';
            } else {
                const map = new Map(), add = (name, page) => { const k = fold(name); if (!map.has(k)) map.set(k, {name, pages: new Set()}); map.get(k).pages.add(page); };
                const key = t => fold(t).split(/[^a-z0-9'-]+/).filter(Boolean).join(' ');
                const names = (it.names || []).map(n => { const [f, l] = n.split('|'); return {f: f || '', l: l || '', k: key(`${f} ${l}`), r: key(`${l} ${f}`)}; }).filter(n => n.k.includes(' ') && n.k.length > 4);
                pageTexts.forEach((list, i) => {
                    const page = i + start, d = document.createElement('div'); d.innerHTML = list.map(t => t.html || '').join(' ');
                    d.querySelectorAll('[data-cs="cs-index"]').forEach(sp => { const t = (sp.textContent || '').replace(/\s+/g, ' ').trim(); if (t) add(t, page); });
                    if (names.length) { // tous les groupes de 2 à 4 mots de la page, pour trouver vite « prénom nom » et « nom prénom »
                        const toks = fold(d.textContent || '').split(/[^a-z0-9'-]+/).filter(Boolean), grams = new Set();
                        for (let a = 0; a < toks.length; a++) for (let n = 2; n <= 4 && a + n <= toks.length; n++) grams.add(toks.slice(a, a + n).join(' '));
                        names.forEach(n => { if (grams.has(n.k) || grams.has(n.r)) add(`${n.l.toUpperCase()} ${n.f}`.trim(), page); }); }
                });
                const rows = [...map.values()].sort((a, b) => fold(a.name).localeCompare(fold(b.name)));
                let letter = '';
                const pagesTxt = set => { const ps = [...set].sort((a, b) => a - b), out = []; for (let k = 0; k < ps.length; k++) { let j = k; while (j + 1 < ps.length && ps[j + 1] === ps[j] + 1) j++; out.push(j > k + 1 ? `${ps[k]}–${ps[j]}` : j === k + 1 ? `${ps[k]}, ${ps[j]}` : String(ps[k])); k = j; } return out.join(', '); };
                html = rows.map(r => { const l = fold(r.name)[0]?.toUpperCase() || '#'; const head = l !== letter ? `<p data-ps="ps-head">${esc(l)}</p>` : ''; letter = l; return `${head}<p data-ps="${esc(it.autoPs || 'ps-list')}">${esc(r.name)}, ${pagesTxt(r.pages)}</p>`; }).join('') || '<p data-ps="ps-body"><em>(L’index se remplit avec les noms marqués en style de caractère « Nom à indexer », et les personnes de la généalogie trouvées dans le texte.)</em></p>';
            }
            if (it.next) runChain(it, html); else it.html = html;
        });
        resolveCache = {key, out: V};
        return live(V);
    }
    /* ── Objets dynamiques : le texte d'une fiche de la généalogie ── */
    const DYN_FIELDS = [['name', 'Nom complet'], ['life', 'Naissance et décès (dates et lieux)'], ['parents', 'Parents'], ['partners', 'Conjoint(s)'], ['children', 'Enfants'], ['occupation', 'Profession'], ['events', 'Tous les événements'], ['notes', 'Notes']];
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
        if (fields.includes('partners')) list('Conjoint(s)', r.partners);
        if (fields.includes('children')) list('Enfants', r.children);
        if (fields.includes('events')) ev.forEach(e => out.push(`<p data-ps="ps-list">${esc(e.type_label || e.type || 'Événement')} : ${esc(evTxt(e))}</p>`));
        if (fields.includes('notes')) (r.notes || []).slice(0, 10).forEach(n => { const t = plainOf(n.content || n.text || n.note || ''); if (t.trim()) out.push(`<p data-ps="ps-body">${esc(t.trim())}</p>`); });
        return out.join('') || `<p data-ps="ps-body">${esc(nm(p) || 'Fiche')}</p>`;
    }

    /* ═════════════ Exports ═════════════ */
    const slug = n => String(n || 'livre').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'livre';
    const download = (name, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
    function printHtml(doc0, name, withButton, {bleed = false} = {}) {
        const doc = resolveDoc(doc0);
        // avec fond perdu : la feuille est agrandie du fond perdu et d'une bande pour les traits de coupe (la ligne-bloc, sinon 8 mm)
        const B = bleed ? doc.page.bleed || 0 : 0, M = bleed ? Math.max(8, doc.page.slug || 0) : 0, W = doc.page.w + 2 * (B + M), H = doc.page.h + 2 * (B + M);
        // traits de coupe, repères de montage (cibles), gamme de couleurs et ligne d'informations, comme pour un imprimeur
        const marks = i => { const pw = px(doc.page.w), ph = px(doc.page.h), o = px(B + M), L = px(Math.max(3, M - 2)), g = px(B + 1), mid = px(M / 2); const ln = (x1, y1, x2, y2) => `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}"/>`;
            const reg = (cx, cy) => { const r = px(2.2); return `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="none"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r / 2.2)}" fill="#000"/>${ln(cx - r * 1.6, cy, cx + r * 1.6, cy)}${ln(cx, cy - r * 1.6, cx, cy + r * 1.6)}`; };
            const bar = ['#00aeef', '#ec008c', '#fff200', '#000000', '#00a651', '#ed1c24', '#2e3192', '#808080', '#bfbfbf'].map((c, k) => `<rect x="${r1(o + px(6) + k * px(4))}" y="${r1(mid - px(1.6))}" width="${r1(px(4))}" height="${r1(px(3.2))}" fill="${c}" stroke="none"/>`).join('');
            const info = `<text x="${r1(o)}" y="${r1(px(H) - mid + px(1))}" font-size="${r1(px(2.2))}" font-family="Arial, sans-serif" fill="#000" stroke="none">${esc(name)} · page ${i + (doc.page.start || 1)} · ${r1(doc.page.w)} × ${r1(doc.page.h)} mm · fond perdu ${r1(B)} mm · ${new Date().toLocaleString('fr-FR')}</text>`;
            return `<svg class="ly-marks" width="${px(W)}" height="${px(H)}" stroke="#000" stroke-width="0.5">${[[o, o], [o + pw, o], [o, o + ph], [o + pw, o + ph]].map(([x, y], k) => { const sx = k % 2 ? 1 : -1, sy = k > 1 ? 1 : -1; return ln(x + sx * g, y, x + sx * (g + L), y) + ln(x, y + sy * g, x, y + sy * (g + L)); }).join('')}${M >= 6 ? reg(o + pw / 2, mid) + reg(o + pw / 2, px(H) - mid) + reg(mid, o + ph / 2) + reg(px(W) - mid, o + ph / 2) + bar + info : ''}</svg>`; };
        const pages = doc.pages.map((_, i) => { const pg = pageHtml(doc, i, {print: true, preview: true, keyPrefix: 'p' + i}); return bleed ? `<div class="ly-sheet" style="width:${px(W)}px;height:${px(H)}px">${marks(i)}<div class="ly-bleedclip" style="left:${px(M)}px;top:${px(M)}px;width:${px(doc.page.w + 2 * B)}px;height:${px(doc.page.h + 2 * B)}px;background:${cssPaint(doc, doc.page.paper)}"><div style="position:absolute;left:${px(B)}px;top:${px(B)}px">${pg.replace('class="ly-page', 'class="ly-page is-bleed')}</div></div></div>` : pg; }).join('');
        return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(name)}</title><base href="${esc(location.href.replace(/[^/]*$/, ''))}"><style>${BASE_CSS}${docCss(doc, 'body')}
            @page{size:${W}mm ${H}mm;margin:0}html,body{margin:0;padding:0;background:#888}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
            .ly-page{margin:12px auto;box-shadow:0 2px 12px rgba(0,0,0,.35)}.ly-page.is-bleed{overflow:visible;margin:0;box-shadow:none}.ly-sheet{position:relative;margin:12px auto;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.35)}.ly-bleedclip{position:absolute;overflow:hidden}.ly-marks{position:absolute;left:0;top:0}.ly-bar{position:sticky;top:0;z-index:9;display:flex;gap:10px;align-items:center;padding:10px 16px;background:#111;color:#fff;font:14px system-ui}.ly-bar button{font:inherit;padding:6px 14px;border-radius:6px;border:0;background:#2f6bff;color:#fff;cursor:pointer}
            @media print{html,body{background:none}.ly-bar{display:none}.ly-page,.ly-sheet{margin:0;box-shadow:none;break-after:page;page-break-after:always}.ly-sheet .ly-page{break-after:auto;page-break-after:auto}}</style></head><body>${withButton ? `<div class="ly-bar"><b>${esc(name)}</b> · ${doc.pages.length} page(s) · ${r1(W)} × ${r1(H)} mm${bleed ? ` (page ${r1(doc.page.w)} × ${r1(doc.page.h)} + fond perdu ${r1(B)} mm et traits de coupe)` : ''}<span style="flex:1"></span><button onclick="print()">🖨 Imprimer / enregistrer en PDF</button></div>` : ''}${pages}</body></html>`;
    }
    /** Fichier HTML autonome : les photos de la base sont intégrées */
    async function inlineImages(html) {
        const srcs = [...new Set([...html.matchAll(/href="(media\/[^"]+)"/g)].map(m => m[1]))], map = {};
        await Promise.all(srcs.map(async s0 => { try { const b = await (await fetch(s0.replace(/&amp;/g, '&'))).blob(); map[s0] = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); } catch (_) {} }));
        return html.replace(/<base [^>]*>/, '').replace(/href="(media\/[^"]+)"/g, (m0, s0) => map[s0] ? `href="${map[s0]}"` : m0);
    }

    /* ═════════════ Réglages par défaut ═════════════ */
    function defaultsDialog(onDone) {
        const d = defaults(), fonts = fontList();
        ext.openDialog({eyebrow: 'MISE EN PAGE', title: 'Réglages par défaut des nouveaux documents', wide: true, submitLabel: 'Enregistrer',
            body: `<div class="form-grid"><label>Format <select name="size">${allSizes().map(([k, l, w, h]) => `<option value="${k}" ${Math.abs(d.w - w) < 0.2 && Math.abs(d.h - h) < 0.2 ? 'selected' : ''}>${esc(l)}</option>`).join('')}<option value="custom" ${allSizes().some(x => Math.abs(d.w - x[2]) < 0.2 && Math.abs(d.h - x[3]) < 0.2) ? '' : 'selected'}>Personnalisé</option></select></label>
                <label>Largeur (mm) <input type="number" name="w" value="${d.w}" step="0.1"></label><label>Hauteur (mm) <input type="number" name="h" value="${d.h}" step="0.1"></label>
                <label class="checkbox-line"><input type="checkbox" name="facing" ${d.facing ? 'checked' : ''}> Pages en vis-à-vis (livre)</label>
                <label>Marge haut (mm) <input type="number" name="mt" value="${d.mt}"></label><label>Marge bas (mm) <input type="number" name="mb" value="${d.mb}"></label><label>Petit fond / intérieur (mm) <input type="number" name="mi" value="${d.mi}"></label><label>Grand fond / extérieur (mm) <input type="number" name="mo" value="${d.mo}"></label>
                <label>Colonnes <input type="number" name="columns" min="1" max="12" value="${d.columns}"></label><label>Gouttière (mm) <input type="number" name="gutter" value="${d.gutter}"></label>
                <label>Fond perdu (mm) <input type="number" name="bleed" min="0" max="20" step="0.5" value="${d.bleed}"></label><label>Ligne-bloc (mm) <input type="number" name="slug" min="0" max="60" step="0.5" value="${d.slug}"></label>
                <label>Police des titres ${fontPickHtml('name="titleFont"', d.titleFont)}</label><label>Police du texte ${fontPickHtml('name="bodyFont"', d.bodyFont)}</label>
                <label>Corps du texte (pt) <input type="number" step="0.5" name="bodySize" value="${d.bodySize}"></label><label>Interlignage (pt) <input type="number" step="0.5" name="lead" value="${d.lead}"></label>
                <label>Couleur du livre <input type="color" name="accent" value="${d.accent}"></label><label>Papier <input type="color" name="paper" value="${d.paper}"></label>
                <label>Numéro de la 1re page <input type="number" name="startPage" min="1" value="${d.startPage}"></label><label class="checkbox-line"><input type="checkbox" name="folio" ${d.folio ? 'checked' : ''}> Folio et titre courant sur le gabarit</label></div>
                <p><button type="button" class="link-button" data-reset>Revenir aux réglages de départ</button></p>`,
            onOpen: dg => { bindFontPick(dg); dg.querySelector('[name=size]').addEventListener('change', e => { const s0 = allSizes().find(x => x[0] === e.target.value); if (s0) { dg.querySelector('[name=w]').value = s0[2]; dg.querySelector('[name=h]').value = s0[3]; } }); dg.querySelector('[data-reset]').addEventListener('click', () => { try { localStorage.removeItem(DEF_KEY); } catch (_) {} toast('Réglages de départ remis.'); dg.close(); onDone?.(); }); },
            onSubmit: f => { const v = Object.fromEntries(new FormData(f)); const o = {}; ['w', 'h', 'mt', 'mb', 'mi', 'mo', 'columns', 'gutter', 'bleed', 'slug', 'bodySize', 'lead', 'startPage'].forEach(k => { o[k] = Number(v[k]); }); o.facing = !!v.facing; o.folio = !!v.folio; o.titleFont = fontOk(v.titleFont); o.bodyFont = fontOk(v.bodyFont); o.accent = v.accent; o.paper = v.paper; o.size = v.size; try { localStorage.setItem(DEF_KEY, JSON.stringify(o)); } catch (_) {} toast('Réglages par défaut enregistrés : ils servent aux nouveaux documents.'); onDone?.(); }});
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
            const card = (x, kind) => `<article class="ly-card">${coverHtml(x.cover)}<div><b>${esc(x.name)}</b><small>${x.pages} page(s) · ${esc(String(x.updated_at || '').slice(0, 16).replace('T', ' '))}</small><div class="ly-cardbtns">${kind === 'doc' ? `<button type="button" class="button small" data-open="${x.id}">Ouvrir</button>` : `<button type="button" class="button small" data-usedesign="${x.id}">Utiliser</button><button type="button" class="button small secondary" data-open="${x.id}">Modifier</button>`}<button type="button" class="button small secondary" data-dup="${x.id}">Dupliquer</button><button type="button" class="button small secondary" data-ren="${x.id}">Renommer</button><button type="button" class="button small secondary" data-exp="${x.id}">Exporter</button><button type="button" class="button small secondary danger" data-del="${x.id}">🗑</button></div></div></article>`;
            dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">LIVRE DE FAMILLE</span><h2>📐 Mise en page</h2><p>Un atelier façon InDesign : pages, gabarits, calques, textes, formes, images, nuancier… Pars d’une page blanche, des données de la famille ou d’un design.</p></div><button class="icon-button" type="button" data-close aria-label="Fermer">×</button></div>
                <div class="ly-libbody"><div class="ly-row ly-libtop"><button type="button" class="button" data-new="family">👪 Nouveau livre d’après la famille</button><button type="button" class="button secondary" data-new="design">🎨 Nouveau depuis un design</button><button type="button" class="button secondary" data-new="blank">📄 Page blanche</button><label class="button secondary">⬆️ Importer un document<input type="file" accept=".json,application/json" data-import hidden></label><button type="button" class="button secondary" data-defaults>⚙️ Réglages par défaut</button></div>
                <h3>📚 Mes livres (${mine.length})</h3><div class="ly-cards">${mine.map(x => card(x, 'doc')).join('') || '<p class="muted">Aucun livre pour l’instant : commence par « Nouveau livre d’après la famille ».</p>'}</div>
                <h3>🎨 Mes designs (${designs.length})</h3><div class="ly-cards">${designs.map(x => card(x, 'design')).join('') || '<p class="muted">Un design est un modèle : ouvre un livre, puis Fichier → « Enregistrer comme design ». Les designs de l’app (ci-dessous) peuvent aussi être modifiés et enregistrés à ton nom.</p>'}</div>
                <h3>✨ Designs de l’app</h3><div class="ly-cards">${builtins().map(({th, doc}) => `<article class="ly-card">${coverHtml(doc)}<div><b>${esc(th.name)}</b><small>${esc(th.titleFont)} · ${esc(th.bodyFont)}</small><div class="ly-cardbtns"><button type="button" class="button small" data-builtin="${th.id}">Utiliser</button><button type="button" class="button small secondary" data-editbuiltin="${th.id}">Modifier (à mon nom)</button></div></div></article>`).join('')}</div></div>`;
        };
        await draw();
        const reopen = () => draw();
        dlg.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
            try {
                if (d.close !== undefined) return dlg.close();
                if (d.defaults !== undefined) return defaultsDialog();
                if (d.new) return newDocWizard(d.new, reopen);
                if (d.open) { const r = await api('layout_doc', {id: Number(d.open)}); return openEditor({id: r.id, name: r.name, doc: r.doc, isDesign: !!r.is_design, onSaved: reopen}); }
                if (d.usedesign) { const r = await api('layout_doc', {id: Number(d.usedesign)}); return newDocWizard('design', reopen, {designId: r.id}); }
                if (d.builtin) return newDocWizard('design', reopen, {builtin: d.builtin});
                if (d.editbuiltin) { const x = builtins().find(y => y.th.id === d.editbuiltin); return openEditor({id: 0, name: `Design ${x.th.name}`, doc: JSON.parse(JSON.stringify(x.doc)), isDesign: true, onSaved: reopen}); }
                if (d.dup) { const r = await api('layout_doc', {id: Number(d.dup)}); await post('save_layout_doc', {name: `${r.name} (copie)`.slice(0, 160), is_design: r.is_design, doc: r.doc}); toast('Copie faite.'); return draw(); }
                if (d.ren) { const r = await api('layout_doc', {id: Number(d.ren)}), n = await ask('Nouveau nom :', r.name); if (!n) return; await post('save_layout_doc', {id: r.id, name: n, is_design: r.is_design, doc: r.doc}); return draw(); }
                if (d.exp) { const r = await api('layout_doc', {id: Number(d.exp)}); return download(`${slug(r.name)}.json`, new Blob([JSON.stringify({type: 'lcnda-mise-en-page-livre', version: 1, name: r.name, is_design: r.is_design, doc: r.doc})], {type: 'application/json'})); }
                if (d.del) { if (!confirm('Supprimer ce document ? (Exporte-le d’abord si tu veux le garder.)')) return; await post('delete_layout_doc', {id: Number(d.del)}); toast('Document supprimé.'); return draw(); }
            } catch (err) { toast(err.message, 'error'); }
        });
        dlg.addEventListener('change', async e => {
            if (!e.target.matches('[data-import]')) return; const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
            if (f.size > 30e6) return toast('Fichier trop gros.', 'error');
            let data; try { data = JSON.parse(await f.text()); } catch (_) { return toast('Ce fichier n’est pas un document de mise en page LCNDA.', 'error'); }
            if (data?.type !== 'lcnda-mise-en-page-livre' || !data.doc) return toast('Ce fichier n’est pas un document de mise en page LCNDA.', 'error');
            try { const doc = cleanDoc(data.doc); await post('save_layout_doc', {name: String(data.name || 'Document importé').slice(0, 160), is_design: data.is_design ? 1 : 0, doc}); toast('Document importé.'); draw(); } catch (err) { toast(err.message, 'error'); }
        });
        dlg.showModal();
    }
    /** Nouveau document : page blanche, d'après un design, ou d'après la famille (avec un design) */
    async function newDocWizard(mode, onSaved, {designId = 0, builtin = ''} = {}) {
        let mineDesigns = []; try { mineDesigns = (await api('layout_docs')).docs.filter(x => x.is_design); } catch (_) {}
        const d = defaults(), S = A().state, start = S.bootstrap?.startPersonId;
        const designOpts = [...THEMES.map(th => [`b:${th.id}`, `✨ ${th.name}`]), ...mineDesigns.map(x => [`m:${x.id}`, `🎨 ${x.name}`])];
        const chosen = designId ? `m:${designId}` : builtin ? `b:${builtin}` : 'b:classique';
        const SECS = [['cover', 'Couverture'], ['preface', 'Préface'], ['stats', 'La famille en chiffres'], ['tree', 'L’arbre'], ['people', 'Une page par personne'], ['chronology', 'Chronologie'], ['places', 'Les lieux'], ['index', 'Index des noms'], ['epilogue', 'Mot de la fin']];
        ext.openDialog({eyebrow: 'NOUVEAU DOCUMENT', title: mode === 'family' ? '👪 Un livre d’après la famille' : mode === 'design' ? '🎨 Depuis un design' : '📄 Page blanche', wide: true, submitLabel: mode === 'family' ? 'Faire le livre' : 'Créer',
            body: `<div class="form-grid"><label>Nom du document <input name="name" value="${mode === 'family' ? 'Livre de famille' : 'Mon livre'}" maxlength="160"></label>
                ${mode !== 'blank' ? `<label>Design <select name="design">${designOpts.map(([k, l]) => `<option value="${k}" ${k === chosen ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : ''}
                ${formatFieldsHtml(d.w, d.h, {designOwn: mode === 'design'})}
                ${mode === 'blank' ? `<label>Nombre de pages <input type="number" name="pages" min="1" max="500" value="1"></label>` : ''}
                ${mode !== 'design' ? `<fieldset class="span-2 ly-newpage"><legend>Pages, marges et colonnes</legend><div class="ly-newgrid">
                    <label class="checkbox-line"><input type="checkbox" name="facing" ${d.facing ? 'checked' : ''}> Pages en vis-à-vis (livre)</label>
                    <label>Marge haut <input type="number" step="0.5" min="0" name="mt" value="${d.mt}"></label><label>Marge bas <input type="number" step="0.5" min="0" name="mb" value="${d.mb}"></label><label data-in>Petit fond (intérieur) <input type="number" step="0.5" min="0" name="mi" value="${d.mi}"></label><label data-out>Grand fond (extérieur) <input type="number" step="0.5" min="0" name="mo" value="${d.mo}"></label>
                    <label>Colonnes <input type="number" min="1" max="12" name="columns" value="${d.columns}"></label><label>Gouttière (mm) <input type="number" step="0.5" min="0" name="gutter" value="${d.gutter}"></label>
                    <label>Fond perdu (mm) <input type="number" step="0.5" min="0" max="20" name="bleed" value="${d.bleed}"></label><label>Ligne-bloc (mm) <input type="number" step="0.5" min="0" max="60" name="slug" value="${d.slug}"></label></div>
                    <p class="muted">Marges en millimètres. Le fond perdu (trait rouge) dépasse de la page pour les images à bord perdu ; la ligne-bloc (trait bleu) garde la place des notes pour l’imprimeur. Les deux s’impriment avec « PDF avec fond perdu et traits de coupe ».</p></fieldset>` : ''}
                ${mode === 'family' ? `<label>Qui <select name="scope"><option value="ancestors">les ancêtres de…</option><option value="descendants">les descendants de…</option><option value="both">ancêtres et descendants de…</option><option value="all">toute la base</option></select></label>
                <label>Personne de départ ${A().collectionPersonField('book_root', start ? {id: start, first_name: localStorage.getItem('genealogie-sosa-root-name') || ('Personne #' + start), last_name: ''} : null, 'Le de cujus par défaut')}</label>
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
                    if (v.scope !== 'all' && !Number(root)) { toast('Choisis la personne de départ.', 'error'); return false; }
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
    ext.openLayoutDoc = async (id, onSaved) => { const r = await api('layout_doc', {id}); return openEditor({id: r.id, name: r.name, doc: r.doc, isDesign: !!r.is_design, onSaved}); };
    ext.newLayoutDoc = (mode, onSaved) => newDocWizard(mode, onSaved);
    ext.layoutCoverHtml = (cover, w) => coverHtml(cover, w);
    ext.lists.layout_books = async token => {
        const S = A().state, ws = A().$('#workspace');
        const draw = async () => {
            let docs = []; try { docs = (await api('layout_docs')).docs; } catch (err) { toast(err.message, 'error'); }
            if (token !== S.workspaceToken || S.module !== 'listes') return;
            const fmtDate = d => { const x = new Date(String(d || '').replace(' ', 'T')); return isNaN(x) ? '' : x.toLocaleDateString('fr-FR'); };
            const row = x => `<tr><td class="ly-listcover">${coverHtml(x.cover, 46)}</td><td><button type="button" class="table-link" data-lyl-open="${x.id}">${esc(x.name)}</button></td><td>${x.is_design ? '🎨 Design' : '📖 Livre'}</td><td>${x.pages}</td><td>${esc(fmtDate(x.updated_at))}</td>
                <td><div class="ly-listact"><button type="button" class="button small" data-lyl-open="${x.id}">${x.is_design ? 'Modifier' : 'Ouvrir'}</button>${x.is_design ? `<button type="button" class="button small secondary" data-lyl-use="${x.id}">Utiliser</button>` : ''}<button type="button" class="button small secondary" data-lyl-dup="${x.id}">Dupliquer</button><button type="button" class="button small secondary" data-lyl-ren="${x.id}">Renommer</button><button type="button" class="button small secondary" data-lyl-exp="${x.id}">Exporter</button><button type="button" class="button small secondary danger" data-lyl-del="${x.id}">🗑</button></div></td></tr>`;
            const books = docs.filter(x => !x.is_design), designs = docs.filter(x => x.is_design);
            const table = (list, empty) => list.length ? `<div class="data-table-wrap"><table class="data-table ly-listtable"><thead><tr><th></th><th>Nom</th><th>Sorte</th><th>Pages</th><th>Modifié le</th><th></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>` : A().empty(empty);
            ws.innerHTML = `<section class="page collection-page ly-listpage" data-dnd-off><header class="page-header"><div><span class="eyebrow">LISTES</span><h2>📐 Livres de famille</h2><p>Les livres faits dans l’atelier de mise en page (façon InDesign) et tes designs : ouvre-les, crée-en un, règle les réglages par défaut.</p></div>
                <div class="page-actions"><button type="button" class="button" data-lyl-new="family">👪 Nouveau livre d’après la famille</button><button type="button" class="button secondary" data-lyl-new="design">🎨 Depuis un design</button><button type="button" class="button secondary" data-lyl-new="blank">📄 Page blanche</button><button type="button" class="button secondary" data-lyl-defaults>⚙️ Réglages par défaut</button><button type="button" class="button secondary" data-lyl-studio>📐 Ouvrir l’atelier</button></div></header>
                <h3>📖 Livres (${books.length})</h3>${table(books, 'Aucun livre pour l’instant : « 👪 Nouveau livre d’après la famille ».')}
                <h3>🎨 Mes designs (${designs.length})</h3>${table(designs, 'Aucun design à toi : dans un livre, Fichier → « Enregistrer comme design », ou « 📐 Ouvrir l’atelier » → Designs de l’app → « Modifier (à mon nom) ».')}</section>`;
        };
        await draw();
        const again = () => { if (S.module === 'listes' && S.listType === 'layout_books') draw(); };
        ws.onclick = async e => {
            const b = e.target.closest('button'); if (!b || !ws.querySelector('.ly-listpage')) return; const d = b.dataset;
            try {
                if (d.lylNew) return newDocWizard(d.lylNew, again);
                if (d.lylDefaults !== undefined) return defaultsDialog();
                if (d.lylStudio !== undefined) return openLibrary();
                if (d.lylOpen) { const r = await api('layout_doc', {id: Number(d.lylOpen)}); return openEditor({id: r.id, name: r.name, doc: r.doc, isDesign: !!r.is_design, onSaved: again}); }
                if (d.lylUse) return newDocWizard('design', again, {designId: Number(d.lylUse)});
                if (d.lylDup) { const r = await api('layout_doc', {id: Number(d.lylDup)}); await post('save_layout_doc', {name: `${r.name} (copie)`.slice(0, 160), is_design: r.is_design, doc: r.doc}); toast('Copie faite.'); return draw(); }
                if (d.lylRen) { const r = await api('layout_doc', {id: Number(d.lylRen)}), n = await ask('Nouveau nom :', r.name); if (!n) return; await post('save_layout_doc', {id: r.id, name: n, is_design: r.is_design, doc: r.doc}); return draw(); }
                if (d.lylExp) { const r = await api('layout_doc', {id: Number(d.lylExp)}); return download(`${slug(r.name)}.json`, new Blob([JSON.stringify({type: 'lcnda-mise-en-page-livre', version: 1, name: r.name, is_design: r.is_design, doc: r.doc})], {type: 'application/json'})); }
                if (d.lylDel) { if (!confirm('Supprimer ce document ? (Exporte-le d’abord si tu veux le garder.)')) return; await post('delete_layout_doc', {id: Number(d.lylDel)}); toast('Document supprimé.'); return draw(); }
            } catch (err) { toast(err.message, 'error'); }
        };
    };
    // le bouton dans Export propre → Livre de famille
    document.addEventListener('click', e => { if (e.target.closest('[data-open-layout-studio]')) { e.preventDefault(); openLibrary(); } });
})();
