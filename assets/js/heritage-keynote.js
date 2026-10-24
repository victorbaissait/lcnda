/* LCNDA — 🎤 Présentation (façon Keynote) : l'autre sorte de « 🎞️ Présentation et diaporama ». Des diapositives où l'on pose
 * librement des objets : textes riches, images (recadrées, dans une forme), formes, tableaux, graphiques (Mes diagrammes),
 * fiches de la généalogie (carte d'une personne, portrait, petit arbre, frise de sa vie), vidéos et sons des médias.
 * Thèmes et dispositions (titre, titre et texte, photo pleine page, deux colonnes, citation…), fonds (couleur, dégradé,
 * image), transitions (fondu, pousser, zoom, retourner, cube, déplacement magique…), animations des objets (apparition,
 * fondu, arrivée, machine à écrire…) dans un ordre et un minutage, mode présentateur (notes, diapositive suivante,
 * chronomètre dans une deuxième fenêtre, pointeur laser). Import : PowerPoint (.pptx), OpenDocument (.odp), PDF (les
 * images qu'il contient), images, Markdown / texte, JSON de l'app. Export : PDF / impression, PNG, JSON, vidéo.
 * Enregistré dans la même table que les diaporamas (lib/slideshows.php, mode « keynote »), nettoyé côté serveur.
 * Boutons rangés, montrés ou cachés : « ⚙️ Personnaliser » ou Réglages → Montage, retouche, mise en page et son.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const toast = (...a) => A().toast(...a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const num = (v, d = 0) => { const n = Number(v); return v !== null && v !== '' && Number.isFinite(n) ? n : d; };
    const r1 = v => Math.round(num(v) * 10) / 10;
    let seq = 0; const uid = (p = 'o') => p + Date.now().toString(36) + (++seq).toString(36) + Math.random().toString(36).slice(2, 5);
    const mediaUrl = f => `media/${encodeURIComponent(f)}`;
    const hexOk = c => /^#[0-9a-f]{3,8}$/i.test(String(c || ''));
    const col = (c, d = 'transparent') => hexOk(c) ? c : d;
    const fontOk = f => String(f || '').replace(/[^\p{L}\p{N}\s\-'",.]/gu, '').slice(0, 120);
    const fontCss = f => { const s = fontOk(f).trim(); return !s ? '' : /[,"']/.test(s) || /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/.test(s) ? s : `"${s}"`; };
    const dataOk = s => typeof s === 'string' && s.length < 2e6 && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s);
    const fileOk = f => typeof f === 'string' && /^[A-Za-z0-9._%\-/]{1,240}$/.test(f) && !f.includes('..');
    const srcOf = o => o && fileOk(o.filename) ? mediaUrl(o.filename) : o && dataOk(o.src) ? o.src : '';
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { toast('Plus de place pour enregistrer ce réglage.', 'error'); return false; } };
    const PREF = 'genealogie-keynote-prefs', FONTS_KEY = 'genealogie-layout-fonts';
    const UI = () => window.LCNDA_UI || {};
    /* les sections repliables du panneau de droite (E2) : l'état ouvert / fermé est retenu ; la clé data-kn-… reste la première (⚙️ Personnaliser) */
    const isec = (attr, key, label, html, open = true) => { const body = typeof html === 'function' ? html() : html;
        if (!UI().panelSection) return `<section class="kn-is" ${attr}="${key}" data-tb-label="${esc(label)}"><h4>${esc(label)}</h4>${body}</section>`;
        return UI().panelSection({title: label, key: `kn-${attr.slice(8)}-${key}`, open, body}).replace('<details class="ui-section"', `<details class="ui-section kn-is" ${attr}="${key}" data-tb-label="${esc(label)}"`); };
    const KN_CSS = `.kn-is.ui-section{display:block;padding:0}.kn-is.ui-section>summary{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--kn-mute);padding:8px 0;cursor:pointer}
.kn-is.ui-section>.ui-section-body{display:grid;gap:6px;padding:0 0 8px}.kn-is .ui-section-body>textarea{width:100%;min-width:0;font:12.5px inherit;padding:4px 6px;border:1px solid var(--kn-line);border-radius:5px;background:var(--kn-field);color:var(--kn-ink)}
.kn-fontbtn{width:100%;text-align:left;justify-content:space-between;display:flex;gap:6px;align-items:center;font-size:14px;padding:4px 8px;border:1px solid var(--kn-line);border-radius:5px;background:var(--kn-field);color:var(--kn-ink);cursor:pointer}
.kn-top .kn-state{font-size:12px}@media (min-width:1001px){.kn-top>.kn-state{flex:0 0 96px;width:96px;display:inline-flex;justify-content:flex-end;overflow:visible}}.kn-canvas.is-drag-over{outline:3px dashed #2a7de1;outline-offset:-6px}`;
    const knCss = () => { if (document.getElementById('kn-css2')) return; const st = document.createElement('style'); st.id = 'kn-css2'; st.textContent = KN_CSS; document.head.appendChild(st); };
    const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const safeName = n => (A().safeExportFilename ? A().safeExportFilename(n, 'presentation') : String(n || 'presentation').replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'presentation');
    const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); };

    /* ═════════ Formats, thèmes, dispositions ═════════ */
    const ASPECTS = {'16:9': [1920, 1080, 'Large (16:9)'], '4:3': [1440, 1080, 'Standard (4:3)'], '16:10': [1920, 1200, '16:10'], '1:1': [1080, 1080, 'Carré'], '9:16': [1080, 1920, 'Vertical (téléphone)'], 'a4': [1754, 1240, 'A4 à l’italienne'], custom: [0, 0, 'Sur mesure…']};
    const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif', SERIF = 'Georgia, "Times New Roman", serif', PALA = '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
    const THEMES = {
        lcnda: {label: 'Comme l’application', bg: {type: 'color', c1: '#ffffff'}, fg: '#080808', accent: '#055dff', tf: 'Arial, Helvetica, sans-serif', bf: 'Arial, Helvetica, sans-serif', tw: 800},
        blanc: {label: 'Blanc', bg: {type: 'color', c1: '#ffffff'}, fg: '#1d1d1f', accent: '#0a84ff', tf: SANS, bf: SANS, tw: 700},
        noir: {label: 'Noir', bg: {type: 'color', c1: '#000000'}, fg: '#f5f5f7', accent: '#ff9f0a', tf: SANS, bf: SANS, tw: 700, dark: true},
        ardoise: {label: 'Ardoise', bg: {type: 'gradient', c1: '#34495e', c2: '#1a242f', angle: 160}, fg: '#f5f5f7', accent: '#64d2ff', tf: '"Avenir Next", Avenir, "Segoe UI", sans-serif', bf: '"Avenir Next", Avenir, "Segoe UI", sans-serif', tw: 600, dark: true},
        parchemin: {label: 'Parchemin', bg: {type: 'radial', c1: '#fbf3df', c2: '#e3cfa2'}, fg: '#3b2a1a', accent: '#8a5a2b', tf: PALA, bf: SERIF, tw: 700},
        album: {label: 'Album ancien', bg: {type: 'gradient', c1: '#3a2e20', c2: '#1f1810', angle: 180}, fg: '#f3e6c8', accent: '#c9a25a', tf: PALA, bf: PALA, tw: 400, dark: true},
        moderne: {label: 'Moderne', bg: {type: 'gradient', c1: '#0e1a2b', c2: '#16324f', angle: 135}, fg: '#ffffff', accent: '#5ec2ff', tf: 'Futura, "Avenir Next", "Trebuchet MS", sans-serif', bf: '"Avenir Next", Avenir, "Segoe UI", sans-serif', tw: 700, dark: true},
        aurore: {label: 'Aurore', bg: {type: 'gradient', c1: '#ff7e5f', c2: '#6a3093', angle: 135}, fg: '#ffffff', accent: '#ffe29a', tf: SANS, bf: SANS, tw: 800, dark: true},
        nature: {label: 'Nature', bg: {type: 'gradient', c1: '#f3f7ec', c2: '#d5e5c0', angle: 180}, fg: '#23361f', accent: '#4f7f31', tf: 'Optima, Candara, "Segoe UI", sans-serif', bf: 'Optima, Candara, "Segoe UI", sans-serif', tw: 600},
        craie: {label: 'Tableau noir', bg: {type: 'radial', c1: '#3a4a3f', c2: '#222c25'}, fg: '#f0efe6', accent: '#f5d76e', tf: '"Chalkboard SE", "Comic Sans MS", "Segoe Print", cursive', bf: '"Chalkboard SE", "Comic Sans MS", "Segoe Print", cursive', tw: 700, dark: true},
        journal: {label: 'Journal', bg: {type: 'color', c1: '#f4f1ea'}, fg: '#111111', accent: '#b3261e', tf: '"Bodoni 72", Didot, "Times New Roman", serif', bf: SERIF, tw: 700},
    };
    const themeOf = show => { const t = THEMES[show.theme] || THEMES.blanc; return {...t, fg: col(show.colors?.fg, t.fg), accent: col(show.colors?.accent, t.accent), tf: fontCss(show.fonts?.title) || t.tf, bf: fontCss(show.fonts?.body) || t.bf}; };
    const LAYOUTS = [['title', 'Titre'], ['title-content', 'Titre et texte'], ['title-photo', 'Titre et photo'], ['photo', 'Photo pleine page'], ['photo-text', 'Photo et texte'], ['two', 'Deux colonnes'], ['quote', 'Citation'], ['section', 'Section'], ['statement', 'Chiffre clé'], ['person', 'Une personne'], ['blank', 'Vide']];
    const PH = {title: 'Titre', sub: 'Sous-titre', body: 'Double-clique pour écrire', caption: 'Légende de la photo', quote: '« Une phrase qui compte »', number: '1789'};
    function layoutObjs(kind, W, H, th) {
        const T = (role, x, y, w, h, size, o = {}) => ({id: uid(), t: 'text', role, x: x * W, y: y * H, w: w * W, h: h * H, size: Math.round(size * H), html: '', ...o});
        const I = (x, y, w, h) => ({id: uid(), t: 'image', role: 'photo', x: x * W, y: y * H, w: w * W, h: h * H, fit: 'cover'});
        const title = (size = .062) => T('title', .06, .05, .88, .15, size, {valign: 'middle'});
        switch (kind) {
            case 'title': return [T('title', .08, .24, .84, .28, .085, {align: 'center', valign: 'bottom'}), T('sub', .12, .55, .76, .14, .038, {align: 'center', acc: true})];
            case 'title-content': return [title(), T('body', .06, .23, .88, .68, .04)];
            case 'title-photo': return [title(.058), I(.06, .22, .88, .72)];
            case 'photo': return [I(0, 0, 1, 1), T('caption', .05, .78, .9, .15, .04, {color: '#ffffff', shadow: true, valign: 'bottom'})];
            case 'photo-text': return [I(0, 0, .5, 1), T('title', .55, .08, .4, .24, .058, {valign: 'bottom'}), T('body', .55, .36, .4, .54, .034)];
            case 'two': return [title(), T('body', .06, .23, .42, .68, .036), T('body', .52, .23, .42, .68, .036)];
            case 'quote': return [T('quote', .1, .2, .8, .42, .06, {align: 'center', valign: 'middle', italic: true}), T('sub', .1, .65, .8, .1, .034, {align: 'center', acc: true})];
            case 'section': return [T('title', .08, .34, .84, .22, .09, {valign: 'bottom'}), {id: uid(), t: 'shape', kind: 'rect', x: .08 * W, y: .59 * H, w: .14 * W, h: Math.max(6, .012 * H), fill: th.accent}];
            case 'statement': return [T('number', .1, .14, .8, .44, .24, {align: 'center', valign: 'bottom', acc: true, weight: 800}), T('sub', .15, .62, .7, .18, .045, {align: 'center'})];
            case 'person': return [title(), {id: uid(), t: 'person', view: 'card', x: .14 * W, y: .26 * H, w: .72 * W, h: .62 * H, size: Math.round(.034 * H)}];
            default: return [];
        }
    }
    const SHAPES = [['rect', 'Rectangle'], ['rounded', 'Rectangle arrondi'], ['ellipse', 'Ellipse'], ['triangle', 'Triangle'], ['rtriangle', 'Triangle rectangle'], ['diamond', 'Losange'], ['pentagon', 'Pentagone'], ['hexagon', 'Hexagone'], ['octagon', 'Octogone'], ['star', 'Étoile'], ['arrow', 'Flèche'], ['darrow', 'Double flèche'], ['chevron', 'Chevron'], ['callout', 'Bulle'], ['heart', 'Cœur'], ['cross', 'Croix'], ['line', 'Ligne'], ['arrowline', 'Ligne fléchée']];
    const MASKS = [['none', 'Aucun (rectangle)'], ['rounded', 'Coins arrondis'], ['circle', 'Cercle / ovale'], ['arch', 'Arche (portrait ancien)'], ['hex', 'Hexagone'], ['diamond', 'Losange'], ['triangle', 'Triangle'], ['star', 'Étoile']];
    const TRANS = [['none', 'Aucune'], ['fade', 'Fondu enchaîné'], ['dissolve', 'Dissoudre'], ['black', 'Fondu par le noir'], ['push', 'Pousser'], ['movein', 'Glisser par-dessus'], ['reveal', 'Révéler'], ['wipe', 'Balayage'], ['zoom', 'Zoom'], ['swap', 'Échanger'], ['flip', 'Retourner'], ['cube', 'Cube'], ['magic', 'Déplacement magique']];
    const FX = [['appear', 'Apparition'], ['fade', 'Fondu'], ['fly', 'Arrivée (glisser)'], ['scale', 'Agrandir'], ['pop', 'Rebond'], ['drop', 'Chute'], ['wipe', 'Balayage'], ['blur', 'Flou'], ['spin', 'Tourbillon'], ['type', 'Machine à écrire (textes)'], ['path', 'Trajectoire (déplacement)']];
    const DIRS = [['l', 'depuis la gauche'], ['r', 'depuis la droite'], ['t', 'depuis le haut'], ['b', 'depuis le bas']];
    const STARTS = [['click', 'Au clic'], ['with', 'Avec la précédente'], ['after', 'Après la précédente']];
    const prefs = () => ({aspect: '16:9', w: 1920, h: 1080, theme: 'blanc', trans: 'dissolve', transDur: .8, snap: true, layout: 'title-content', laser: '#ff2d2d', ...readJ(PREF, {})});
    const CHART_KINDS = ['columns', 'bars', 'stacked', 'stacked100', 'line', 'area', 'radar', 'pie', 'donut', 'halfdonut']; // ceux qui se remplissent avec « Catégorie ; Série 1 ; Série 2… »
    const TYPE_LABEL = {text: 'Texte', image: 'Image', shape: 'Forme', table: 'Tableau', chart: 'Graphique', person: 'Généalogie', video: 'Vidéo', audio: 'Son', link: 'Liaison'};
    const TYPE_ICON = {text: 'T', image: '🖼️', shape: '◆', table: '▦', chart: '📊', person: '👤', video: '🎬', audio: '🔊', link: '↔'};
    const LINK_KINDS = [['straight', 'Droite'], ['elbow', 'En équerre'], ['curve', 'Courbe']], LINK_ARROWS = [['end', 'Flèche au bout'], ['both', 'Flèches aux deux bouts'], ['none', 'Sans flèche']];
    const PATHS = [['line', 'Ligne droite'], ['arc', 'Arc'], ['wave', 'Vague'], ['zigzag', 'Zigzag'], ['loop', 'Boucle']];
    const MERGE_OPS = [['union', 'Union (les deux réunies)'], ['subtract', 'Soustraire (la 1re moins la 2e)'], ['intersect', 'Intersection (ce qu’elles ont en commun)']];

    /* ═════════ Texte riche : quelques balises et un style limité (comme le serveur) ═════════ */
    const TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'BR', 'DIV', 'P', 'UL', 'OL', 'LI', 'SPAN', 'SUP', 'SUB']);
    const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'TEXTAREA', 'TITLE', 'NOSCRIPT', 'HEAD', 'META', 'LINK', 'IMG', 'VIDEO', 'AUDIO', 'INPUT', 'BUTTON', 'SELECT', 'FORM']);
    const STYLE_OK = ['color', 'background-color', 'font-size', 'font-weight', 'font-style', 'font-family', 'text-decoration', 'text-decoration-line', 'text-align', 'line-height', 'letter-spacing', 'vertical-align'];
    const cleanStyle = st => String(st || '').split(';').map(d => { const i = d.indexOf(':'); if (i < 0) return ''; const k = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim(); return STYLE_OK.includes(k) && v && v.length <= 120 && !/url|expression|javascript|[<>\\{}@]/i.test(v) && /^[#\p{L}\p{N} .,%'"\-()]+$/u.test(v) ? `${k}: ${v}` : ''; }).filter(Boolean).slice(0, 12).join('; ');
    const htmlCache = new Map();
    function cleanHtml(h) {
        h = String(h ?? ''); if (!h) return ''; if (htmlCache.has(h)) return htmlCache.get(h);
        const doc = new DOMParser().parseFromString(`<body>${h.slice(0, 30000)}</body>`, 'text/html');
        const walk = node => [...node.childNodes].forEach(n => {
            if (n.nodeType === 3) return;
            if (n.nodeType !== 1) { n.remove(); return; }
            if (!TAGS.has(n.tagName)) { if (DROP.has(n.tagName)) n.remove(); else { walk(n); n.replaceWith(...n.childNodes); } return; }
            [...n.attributes].forEach(a => { if (a.name !== 'style') n.removeAttribute(a.name); });
            const s = cleanStyle(n.getAttribute('style')); if (s) n.setAttribute('style', s); else n.removeAttribute('style');
            walk(n);
        });
        walk(doc.body); const out = doc.body.innerHTML;
        if (htmlCache.size > 600) htmlCache.clear(); htmlCache.set(h, out); return out;
    }
    const textToHtml = t => String(t || '').split('\n').map(l => `<div>${esc(l) || '<br>'}</div>`).join('');
    const htmlToText = h => { const d = document.createElement('div'); d.innerHTML = cleanHtml(h); d.querySelectorAll('br').forEach(b => b.replaceWith('\n')); d.querySelectorAll('div,p,li').forEach(b => b.append('\n')); return d.textContent.replace(/\n{3,}/g, '\n\n').trim(); };

    /* ═════════ Le dessin d'une diapositive (HTML, styles en ligne : sert aussi aux images, au PDF et à la vidéo) ═════════ */
    const dims = show => [clamp(Math.round(num(show.w, 1920)), 320, 4000), clamp(Math.round(num(show.h, 1080)), 240, 4000)];
    const VAL = {top: 'flex-start', middle: 'center', bottom: 'flex-end'};
    const ALIGNS = ['left', 'center', 'right', 'justify'];
    const textStyle = (o, th) => `font-family:${fontCss(o.font) || (['title', 'number'].includes(o.role) ? th.tf : th.bf)};font-size:${num(o.size, 40)}px;color:${col(o.color, o.acc ? th.accent : th.fg)};line-height:${num(o.lh, 1.2)};letter-spacing:${num(o.ls)}px;text-align:${ALIGNS.includes(o.align) ? o.align : 'left'};font-weight:${num(o.weight, ['title', 'number'].includes(o.role) ? th.tw : 400)};font-style:${o.italic ? 'italic' : 'normal'}`;
    function bgCss(s, th) {
        const b = s.bg && s.bg.type && s.bg.type !== 'theme' ? s.bg : th.bg, c1 = col(b.c1, '#ffffff'), c2 = col(b.c2, c1);
        if (b.type === 'gradient') return `background:linear-gradient(${num(b.angle, 135)}deg, ${c1}, ${c2})`;
        if (b.type === 'radial') return `background:radial-gradient(circle at 50% 40%, ${c1}, ${c2})`;
        return `background:${b.type === 'image' ? col(b.c1, '#000000') : c1}`;
    }
    const bgImg = s => { const b = s.bg || {}; if (b.type !== 'image') return ''; const src = srcOf(b); if (!src) return '';
        return `<img src="${esc(src)}" alt="" draggable="false" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:${b.fit === 'contain' ? 'contain' : 'cover'};pointer-events:none">${num(b.dim) ? `<div style="position:absolute;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,${clamp(num(b.dim), 0, 90) / 100})"></div>` : ''}`; };
    const MASK_CSS = {rounded: o => `border-radius:${num(o.radius, 28)}px;`, circle: () => 'border-radius:50%;', arch: () => 'border-radius:50% 50% 0 0 / 34% 34% 0 0;', hex: () => 'clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%);',
        diamond: () => 'clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);', triangle: () => 'clip-path:polygon(50% 0,100% 100%,0 100%);', star: () => 'clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);'};
    function poly(n, w, h, inner = 0) { const pts = []; const m = inner ? n * 2 : n; for (let i = 0; i < m; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / m, r = inner && i % 2 ? inner : 1; pts.push(`${r1(w / 2 + Math.cos(a) * w / 2 * r)},${r1(h / 2 + Math.sin(a) * h / 2 * r)}`); } return pts.join(' '); }
    function shapeSvg(o, th) {
        const w = Math.max(1, num(o.w, 100)), h = Math.max(1, num(o.h, 100)), k = o.kind || 'rect', line = k === 'line' || k === 'arrowline';
        const fill = o.nofill ? 'none' : col(o.fill, th.accent), stroke = line ? col(o.stroke, col(o.fill, th.accent)) : o.stroke ? col(o.stroke, 'none') : 'none', sw = line ? num(o.sw, 6) : o.stroke ? num(o.sw, 3) : 0;
        const dash = {dash: `${sw * 3} ${sw * 2}`, dot: `${Math.max(1, sw * .2)} ${sw * 1.8}`}[o.dash] || '';
        const at = `fill="${line ? 'none' : fill}" stroke="${stroke}" stroke-width="${r1(sw)}"${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linejoin="round"${o.dash === 'dot' ? ' stroke-linecap="round"' : ''}`;
        let body = '';
        const P = d => `<path d="${d}" ${at}/>`, G = pts => `<polygon points="${pts}" ${at}/>`;
        const rr = Math.min(num(o.radius, Math.min(w, h) * .18), w / 2, h / 2);
        switch (k) {
            case 'ellipse': body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" ${at}/>`; break;
            case 'rounded': body = `<rect x="0" y="0" width="${w}" height="${h}" rx="${r1(rr)}" ry="${r1(rr)}" ${at}/>`; break;
            case 'triangle': body = G(`${w / 2},0 ${w},${h} 0,${h}`); break;
            case 'rtriangle': body = G(`0,0 ${w},${h} 0,${h}`); break;
            case 'diamond': body = G(`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`); break;
            case 'pentagon': body = G(poly(5, w, h)); break;
            case 'hexagon': body = G(poly(num(o.points, 6), w, h)); break;
            case 'octagon': body = G(poly(8, w, h)); break;
            case 'star': body = G(poly(clamp(Math.round(num(o.points, 5)), 3, 40), w, h, clamp(num(o.inner, 45), 5, 95) / 100)); break;
            case 'arrow': { const a = Math.min(w * .45, h * .6); body = G(`0,${h * .28} ${w - a},${h * .28} ${w - a},0 ${w},${h / 2} ${w - a},${h} ${w - a},${h * .72} 0,${h * .72}`); break; }
            case 'darrow': { const a = Math.min(w * .3, h * .6); body = G(`0,${h / 2} ${a},0 ${a},${h * .28} ${w - a},${h * .28} ${w - a},0 ${w},${h / 2} ${w - a},${h} ${w - a},${h * .72} ${a},${h * .72} ${a},${h}`); break; }
            case 'chevron': { const a = Math.min(w * .35, h * .5); body = G(`0,0 ${w - a},0 ${w},${h / 2} ${w - a},${h} 0,${h} ${a},${h / 2}`); break; }
            case 'callout': { const b = h * .78, r = Math.min(w, b) * .12; body = P(`M${r} 0H${w - r}Q${w} 0 ${w} ${r}V${b - r}Q${w} ${b} ${w - r} ${b}H${w * .38}L${w * .18} ${h}L${w * .22} ${b}H${r}Q0 ${b} 0 ${b - r}V${r}Q0 0 ${r} 0Z`); break; }
            case 'heart': body = P(`M${w / 2} ${h * .28}C${w / 2} ${h * .05} ${w * .1} ${h * -.04} ${w * .02} ${h * .28}C${w * -.03} ${h * .52} ${w * .3} ${h * .74} ${w / 2} ${h}C${w * .7} ${h * .74} ${w * 1.03} ${h * .52} ${w * .98} ${h * .28}C${w * .9} ${h * -.04} ${w / 2} ${h * .05} ${w / 2} ${h * .28}Z`); break;
            case 'cross': { const t = Math.min(w, h) / 3, x0 = (w - t) / 2, y0 = (h - t) / 2; body = G(`${x0},0 ${x0 + t},0 ${x0 + t},${y0} ${w},${y0} ${w},${y0 + t} ${x0 + t},${y0 + t} ${x0 + t},${h} ${x0},${h} ${x0},${y0 + t} 0,${y0 + t} 0,${y0} ${x0},${y0}`); break; }
            case 'line': case 'arrowline': {
                const ar = k === 'arrowline' ? (o.arrow || 'end') : (o.arrow || 'none'), hl = Math.max(10, sw * 3.2), y = h / 2, s = /start|both/.test(ar), e = /end|both/.test(ar);
                body = `<line x1="${s ? hl * .8 : 0}" y1="${y}" x2="${e ? w - hl * .8 : w}" y2="${y}" ${at} stroke-linecap="${o.dash === 'dot' ? 'round' : 'butt'}"/>`;
                if (e) body += `<polygon points="${w},${y} ${w - hl},${y - hl * .6} ${w - hl},${y + hl * .6}" fill="${stroke}"/>`;
                if (s) body += `<polygon points="0,${y} ${hl},${y - hl * .6} ${hl},${y + hl * .6}" fill="${stroke}"/>`;
                break;
            }
            case 'combo': { // ⊕ deux formes fusionnées (union, soustraction, intersection), gardées à part pour rester modifiables
                const parts = (Array.isArray(o.parts) ? o.parts : []).slice(0, 2), mid = `knm${String(o.id || '').replace(/[^a-z0-9]/gi, '')}`;
                const one = (q, f) => { const inner = shapeSvg({...q, fill: f, nofill: false, stroke: '', text: ''}, th).replace(/^<svg[^>]*>|<\/svg>$/g, ''); return `<svg x="${r1(num(q.x))}" y="${r1(num(q.y))}" width="${r1(Math.max(1, num(q.w, 10)))}" height="${r1(Math.max(1, num(q.h, 10)))}" viewBox="0 0 ${r1(Math.max(1, num(q.w, 10)))} ${r1(Math.max(1, num(q.h, 10)))}" preserveAspectRatio="none" overflow="visible">${inner}</svg>`; };
                if (parts.length < 2) { body = parts.map(q => one(q, fill)).join(''); break; }
                if (o.mop === 'subtract') body = `<defs><mask id="${mid}" maskUnits="userSpaceOnUse" x="-10" y="-10" width="${w + 20}" height="${h + 20}"><rect x="-10" y="-10" width="${w + 20}" height="${h + 20}" fill="#fff"/>${one(parts[1], '#000')}</mask></defs><g mask="url(#${mid})">${one(parts[0], fill)}</g>`;
                else if (o.mop === 'intersect') body = `<defs><mask id="${mid}" maskUnits="userSpaceOnUse" x="-10" y="-10" width="${w + 20}" height="${h + 20}">${one(parts[1], '#fff')}</mask></defs><g mask="url(#${mid})">${one(parts[0], fill)}</g>`;
                else body = `<g>${one(parts[0], fill)}${one(parts[1], fill)}</g>`;
                break;
            }
            default: body = `<rect x="0" y="0" width="${w}" height="${h}" ${at}/>`;
        }
        const flip = o.flipH || o.flipV ? `transform:scale(${o.flipH ? -1 : 1},${o.flipV ? -1 : 1});` : '';
        return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${r1(w)} ${r1(h)}" preserveAspectRatio="none" style="position:absolute;left:0;top:0;overflow:visible;${flip}">${body}</svg>`;
    }
    /* ─── la généalogie : fiche, portrait, petit arbre, frise d'une vie (d'après une photo des données, gardée dans l'objet) ─── */
    const inkOn = c => { const m = String(c).match(/^#([0-9a-f]{6}|[0-9a-f]{3})/i); if (!m) return '#ffffff'; const h = m[1].length === 3 ? m[1].replace(/./g, x => x + x) : m[1], [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#1d1d1f' : '#ffffff'; };
    const cut = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
    function personHtml(o, th, mode) {
        const d = o.data || {}, fs = num(o.size, 30), fg = col(o.color, '#1d1d1f'), fill = o.nofill ? 'transparent' : col(o.fill, '#fffffff0'), view = o.view || 'card', tf = th.tf;
        const portrait = fileOk(d.portrait) ? mediaUrl(d.portrait) : '';
        if (!d.name) return mode === 'edit' ? `<div style="${esc(`width:100%;height:100%;display:flex;align-items:center;justify-content:center;text-align:center;border:2px dashed rgba(127,127,127,.6);border-radius:16px;color:#888;background:rgba(127,127,127,.12);font:600 ${Math.max(14, fs * .8)}px sans-serif;padding:10px;box-sizing:border-box`)}">👤<br>Choisis une personne (à droite, onglet Format)</div>` : '';
        const ini = esc(String(d.name).split(/\s+/).map(x => x[0] || '').join('').slice(0, 2).toUpperCase());
        if (view === 'photo') return `<div style="${esc(`position:relative;width:100%;height:100%;overflow:hidden;border-radius:${num(o.radius, 12)}px;background:#222;${o.border ? `border:${num(o.bw, 6)}px solid ${col(o.border)};box-sizing:border-box;` : ''}`)}">${portrait ? `<img src="${esc(portrait)}" alt="" draggable="false" style="width:100%;height:100%;object-fit:cover;display:block">` : `<div style="${esc(`width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#aaa;font:700 ${fs * 3}px ${tf}`)}">${ini}</div>`}
            <div style="${esc(`position:absolute;left:0;right:0;bottom:0;padding:${fs * .6}px ${fs * .7}px ${fs * .5}px;background:linear-gradient(transparent, rgba(0,0,0,.78));color:#fff;font-family:${tf}`)}"><div style="${esc(`font-size:${fs * 1.1}px;font-weight:700;line-height:1.1`)}">${esc(d.name)}</div><div style="${esc(`font-size:${fs * .75}px;opacity:.9`)}">${esc(d.years || '')}</div></div></div>`;
        if (view === 'tree') {
            const VW = 1000, VH = 600, bw = n => Math.min(300, (VW - 40) / Math.max(1, n) - 20), box = (x, y, w, p, me) => `<g><rect x="${r1(x)}" y="${y}" width="${r1(w)}" height="96" rx="14" fill="${me ? th.accent : '#ffffff'}" stroke="${me ? th.accent : '#9a9a9a'}" stroke-width="2"/><text x="${r1(x + w / 2)}" y="${y + 42}" text-anchor="middle" font-size="${w < 160 ? 20 : 26}" font-weight="700" fill="${me ? inkOn(th.accent) : '#1d1d1f'}">${esc(cut(p.name, w < 160 ? 16 : 24))}</text><text x="${r1(x + w / 2)}" y="${y + 74}" text-anchor="middle" font-size="20" fill="${me ? inkOn(th.accent) : '#666666'}">${esc(cut(p.years || '', 20))}</text></g>`;
            const row = (list, y, me) => { const w = bw(list.length), tot = list.length * (w + 20) - 20, x0 = (VW - tot) / 2; return {svg: list.map((p, i) => box(x0 + i * (w + 20), y, w, p, me && i === 0)).join(''), xs: list.map((_, i) => x0 + i * (w + 20) + w / 2)}; };
            const par = (d.parents || []).slice(0, 2), mid = [{name: d.name, years: d.years}, ...(d.partners || []).slice(0, 2)], kids = (d.children || []).slice(0, 8);
            const R1 = row(par, 30), R2 = row(mid, 250, true), R3 = row(kids, 470);
            let lines = '';
            if (par.length) { const mx = R1.xs.reduce((a, b) => a + b, 0) / R1.xs.length; lines += `<path d="M${r1(R1.xs[0])} 126V178H${r1(R1.xs[R1.xs.length - 1])}V126M${r1(mx)} 178V214H${r1(R2.xs[0])}V250" fill="none" stroke="#9a9a9a" stroke-width="3"/>`; }
            if (kids.length) { const from = R2.xs.length > 1 ? (R2.xs[0] + R2.xs[1]) / 2 : R2.xs[0]; lines += `<path d="M${r1(from)} 346V410M${r1(Math.min(from, ...R3.xs))} 410H${r1(Math.max(from, ...R3.xs))}${R3.xs.map(x => `M${r1(x)} 410V470`).join('')}" fill="none" stroke="#9a9a9a" stroke-width="3"/>`; }
            if (R2.xs.length > 1) lines += `<path d="M${r1(R2.xs[0])} 298H${r1(R2.xs[1])}" stroke="${th.accent}" stroke-width="4" stroke-dasharray="8 6"/>`;
            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" font-family="${esc(th.bf)}" style="display:block">${o.nofill ? '' : `<rect width="${VW}" height="${VH}" rx="24" fill="${fill}"/>`}${lines}${R1.svg}${R2.svg}${R3.svg}</svg>`;
        }
        if (view === 'timeline') {
            const ev = (d.events || []).slice(0, 12), VW = 1000, VH = 320, n = ev.length, X = i => n < 2 ? VW / 2 : 70 + i * (VW - 140) / (n - 1);
            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" font-family="${esc(th.bf)}" style="display:block">${o.nofill ? '' : `<rect width="${VW}" height="${VH}" rx="24" fill="${fill}"/>`}<text x="${VW / 2}" y="44" text-anchor="middle" font-size="30" font-weight="700" fill="${fg}">${esc(cut(d.name, 50))}${d.years ? ` <tspan fill="${th.accent}" font-weight="400">${esc(d.years)}</tspan>` : ''}</text><line x1="40" y1="170" x2="${VW - 40}" y2="170" stroke="${th.accent}" stroke-width="5" stroke-linecap="round"/>${ev.map((e, i) => { const up = i % 2 === 0; return `<circle cx="${r1(X(i))}" cy="170" r="11" fill="${th.accent}" stroke="#ffffff" stroke-width="3"/><text x="${r1(X(i))}" y="${up ? 128 : 222}" text-anchor="middle" font-size="24" font-weight="700" fill="${fg}">${esc(e.year || '')}</text><text x="${r1(X(i))}" y="${up ? 100 : 252}" text-anchor="middle" font-size="${n > 8 ? 15 : 18}" fill="${fg}" opacity=".85">${esc(cut(e.label, n > 8 ? 18 : 26))}</text>`; }).join('')}${n ? '' : `<text x="${VW / 2}" y="230" text-anchor="middle" font-size="22" fill="#888">Aucun événement daté</text>`}</svg>`;
        }
        return `<div style="${esc(`width:100%;height:100%;box-sizing:border-box;display:flex;gap:${fs * .8}px;align-items:center;padding:${fs * .8}px;background:${fill};color:${fg};border-radius:${num(o.radius, 18)}px;overflow:hidden;font-family:${th.bf};${o.border ? `border:${num(o.bw, 3)}px solid ${col(o.border)};` : ''}`)}">
            ${portrait ? `<img src="${esc(portrait)}" alt="" draggable="false" style="${esc(`height:100%;max-height:100%;aspect-ratio:3/4;max-width:42%;object-fit:cover;border-radius:${fs * .4}px;flex:0 0 auto;display:block`)}">` : `<div style="${esc(`flex:0 0 auto;width:${fs * 4}px;height:${fs * 4}px;border-radius:50%;background:${th.accent};color:${inkOn(th.accent)};display:flex;align-items:center;justify-content:center;font:700 ${fs * 1.5}px ${tf}`)}">${ini}</div>`}
            <div style="min-width:0;flex:1"><div style="${esc(`font:${num(o.weight, 700)} ${fs * 1.35}px ${tf};line-height:1.1`)}">${esc(d.name)}</div>${d.years ? `<div style="${esc(`font-size:${fs * .9}px;color:${th.accent};margin-top:.25em;font-weight:600`)}">${esc(d.years)}</div>` : ''}${d.occ ? `<div style="${esc(`font-size:${fs * .8}px;font-style:italic;margin-top:.3em`)}">${esc(d.occ)}</div>` : ''}
            <div style="${esc(`font-size:${fs * .72}px;line-height:1.45;margin-top:.6em`)}">${d.birth ? `° ${esc(d.birth)}<br>` : ''}${d.marriage ? `⚭ ${esc(d.marriage)}<br>` : ''}${d.death ? `† ${esc(d.death)}` : ''}</div></div></div>`;
    }
    function inner(o, show, th, mode) {
        const ed = mode === 'edit';
        if (o.t === 'text') {
            const html = cleanHtml(o.html), empty = !html.replace(/<[^>]*>|&nbsp;|\s/g, '');
            return `<div class="kn-tx" style="${esc(`width:100%;height:100%;box-sizing:border-box;padding:${num(o.pad, 8)}px;display:flex;flex-direction:column;justify-content:${VAL[o.valign] || 'flex-start'};background:${o.fill ? col(o.fill) : 'transparent'};border-radius:${num(o.radius)}px;${o.stroke ? `border:${num(o.sw, 2)}px solid ${col(o.stroke)};` : ''}overflow:visible;overflow-wrap:break-word;list-style-position:${['center', 'right'].includes(o.align) ? 'inside' : 'outside'};${textStyle(o, th)}`)}"><div class="kn-txi" style="min-height:1em">${empty ? (ed ? `<span class="kn-ph" style="opacity:.42">${esc(PH[o.role] || PH.body)}</span>` : '') : html}</div></div>`;
        }
        if (o.t === 'image') {
            const src = srcOf(o), wrap = `width:100%;height:100%;overflow:hidden;box-sizing:border-box;${(MASK_CSS[o.mask] || (() => ''))(o)}${o.border ? `border:${num(o.bw, 6)}px solid ${col(o.border)};` : ''}`;
            if (!src) return ed ? `<div style="${esc(`${wrap}display:flex;align-items:center;justify-content:center;background:rgba(127,127,127,.16);border:2px dashed rgba(127,127,127,.6);color:#888;font:600 ${clamp(Math.min(o.w, o.h) / 12, 12, 40)}px sans-serif;text-align:center;padding:8px`)}">🖼️<br>Double-clique pour choisir une image</div>` : '';
            const fit = ['cover', 'contain', 'fill'].includes(o.fit) ? o.fit : 'cover', z = clamp(num(o.zoom, 1), 1, 8), px = clamp(num(o.px, 50), 0, 100), py = clamp(num(o.py, 50), 0, 100);
            const filt = [num(o.bright, 100) !== 100 ? `brightness(${num(o.bright)}%)` : '', num(o.contrast, 100) !== 100 ? `contrast(${num(o.contrast)}%)` : '', num(o.sat, 100) !== 100 ? `saturate(${num(o.sat)}%)` : '', num(o.sepia) ? `sepia(${num(o.sepia)}%)` : '', num(o.gray) ? `grayscale(${num(o.gray)}%)` : '', num(o.blur) ? `blur(${num(o.blur)}px)` : ''].filter(Boolean).join(' ');
            const flip = o.flipH || o.flipV ? `scale(${o.flipH ? -1 : 1},${o.flipV ? -1 : 1}) ` : '';
            return `<div style="${esc(wrap)}"><img src="${esc(src)}" alt="" draggable="false" style="${esc(`display:block;width:100%;height:100%;object-fit:${fit};object-position:${px}% ${py}%;transform:${flip}scale(${z});transform-origin:${px}% ${py}%;${filt ? `filter:${filt};` : ''}`)}"></div>`;
        }
        if (o.t === 'shape') return shapeSvg(o, th) + (o.text || (ed && o._editing) ? `<div class="kn-stx" style="${esc(`position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:8%;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:break-word;${textStyle({...o, align: o.align || 'center'}, th)};color:${col(o.color, o.nofill ? th.fg : inkOn(col(o.fill, th.accent)))}`)}">${esc(o.text || '')}</div>` : '');
        if (o.t === 'table') {
            const rows = Array.isArray(o.rows) && o.rows.length ? o.rows : [['']], nc = Math.max(1, ...rows.map(r => (Array.isArray(r) ? r : []).length)), bd = col(o.stroke, '#9a9a9a');
            const cell = (v, i, j) => { const head = o.head && i === 0, tag = head ? 'th' : 'td';
                return `<${tag} data-kn-cell="${i}:${j}" style="${esc(`border:${num(o.sw, 1)}px solid ${bd};padding:.25em .45em;vertical-align:middle;overflow:hidden;overflow-wrap:break-word;${head ? `background:${col(o.headFill, th.accent)};color:${col(o.headColor, inkOn(col(o.headFill, th.accent)))};font-weight:700;` : `background:${o.fill ? col(o.fill) : i % 2 ? 'rgba(127,127,127,.10)' : 'transparent'};`}`)}">${esc(v ?? '').replace(/\n/g, '<br>')}</${tag}>`; };
            return `<table style="${esc(`width:100%;height:100%;border-collapse:collapse;table-layout:fixed;${textStyle({...o, size: num(o.size, 26)}, th)}`)}">${rows.map((r, i) => `<tr>${Array.from({length: nc}, (_, j) => cell((Array.isArray(r) ? r : [])[j], i, j)).join('')}</tr>`).join('')}</table>`;
        }
        if (o.t === 'chart') {
            const R = ext.diagramRender, fg = col(o.color, th.fg);
            if (!R) return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:48px">📊</div>`;
            const s = R.svg({...(o.spec || {}), o: {...(o.spec?.o || {}), bg: 'transparent', fg, width: Math.round(clamp(o.w / 1.7, 280, 1600))}}, Math.round(clamp(o.w / 1.7, 280, 1600))).replace(/^(<svg[^>]*?) width="[^"]*" height="[^"]*"/, '$1 width="100%" height="100%" preserveAspectRatio="xMidYMid meet"');
            return `<div style="${esc(`width:100%;height:100%;color:${fg};background:${o.fill ? col(o.fill) : 'transparent'};border-radius:${num(o.radius)}px;overflow:hidden`)}">${s}</div>`;
        }
        if (o.t === 'person') return personHtml(o, th, mode);
        if (o.t === 'link') return linkSvg(o, th);
        if (o.t === 'video') {
            const src = fileOk(o.filename) ? mediaUrl(o.filename) : '';
            if (!src || mode === 'raster' || mode === 'print' || mode === 'thumb') return `<div style="${esc(`width:100%;height:100%;background:#111 ${fileOk(o.poster) ? `url('${mediaUrl(o.poster)}') center/cover` : ''};color:#fff;display:flex;align-items:center;justify-content:center;font-size:${clamp(Math.min(o.w, o.h) / 4, 14, 200)}px;border-radius:${num(o.radius)}px`)}">${src ? '▶' : ed ? '🎬' : ''}</div>`;
            return `<video src="${esc(src)}" ${mode === 'play' ? `${o.controls ? 'controls' : ''} ${o.loop ? 'loop' : ''} ${o.muted ? 'muted' : ''} data-kn-auto="${o.autoplay ? 1 : 0}" data-kn-start="${num(o.start)}" data-kn-vol="${clamp(num(o.vol, 1), 0, 1)}"` : 'muted'} preload="metadata" playsinline style="${esc(`width:100%;height:100%;object-fit:contain;background:#000;display:block;border-radius:${num(o.radius)}px`)}"></video>`;
        }
        if (o.t === 'audio') {
            const src = fileOk(o.filename) ? mediaUrl(o.filename) : '';
            if (mode === 'play' && src) return `<audio src="${esc(src)}" ${o.controls ? 'controls' : ''} ${o.loop ? 'loop' : ''} data-kn-auto="${o.autoplay ? 1 : 0}" data-kn-start="${num(o.start)}" data-kn-vol="${clamp(num(o.vol, 1), 0, 1)}" style="${o.controls ? 'width:100%;height:100%' : 'display:none'}"></audio>`;
            return mode === 'edit' || o.controls ? `<div style="${esc(`width:100%;height:100%;display:flex;align-items:center;justify-content:center;gap:.3em;border-radius:12px;background:${col(o.fill, '#00000099')};color:#fff;font:600 ${clamp(Math.min(o.w, o.h) / 3, 12, 80)}px sans-serif;overflow:hidden;white-space:nowrap`)}">🔊${o.name ? `<small style="font-size:.4em">${esc(cut(o.name, 30))}</small>` : ''}</div>` : '';
        }
        return '';
    }
    function objHtml(o, show, th, mode) {
        if (o.hide && mode !== 'edit') return '';
        let st = `position:absolute;left:${r1(o.x)}px;top:${r1(o.y)}px;width:${r1(o.w)}px;height:${r1(o.h)}px;transform:rotate(${r1(o.rot)}deg);opacity:${o.hide ? .25 : clamp(num(o.op, 1), 0, 1)};box-sizing:border-box`;
        if (o.shadow) st += `;filter:drop-shadow(0 ${r1(num(o.shBlur, 16) / 3)}px ${r1(num(o.shBlur, 16))}px ${col(o.shColor, '#000000aa')})`;
        return `<div class="kn-o" data-kn-o="${esc(o.id)}" style="${esc(st)}">${inner(o, show, th, mode)}</div>`;
    }
    /* ─── ↔ liaisons : un trait qui reste accroché à deux objets (il suit quand on les déplace) ─── */
    const edgePt = (o, tx, ty) => { const cx = o.x + o.w / 2, cy = o.y + o.h / 2, dx = tx - cx, dy = ty - cy; if (!dx && !dy) return [cx, cy]; const k = Math.min(Math.abs(o.w / 2 / (dx || 1e-9)), Math.abs(o.h / 2 / (dy || 1e-9))); return [cx + dx * k, cy + dy * k]; };
    /** la place d'une liaison d'après ses deux objets (x, y, w, h = le cadre du trait, ax… = ses bouts dans ce cadre) ; false si un des deux manque */
    function linkGeom(o, objs) {
        const A0 = objs.find(x => x.id === o.from), B0 = objs.find(x => x.id === o.to); if (!A0 || !B0) return false;
        const a = edgePt(A0, B0.x + B0.w / 2, B0.y + B0.h / 2), b = edgePt(B0, A0.x + A0.w / 2, A0.y + A0.h / 2), m = 30;
        o.x = Math.min(a[0], b[0]) - m; o.y = Math.min(a[1], b[1]) - m; o.w = Math.abs(b[0] - a[0]) + 2 * m; o.h = Math.abs(b[1] - a[1]) + 2 * m; o.rot = 0;
        o._a = [a[0] - o.x, a[1] - o.y]; o._b = [b[0] - o.x, b[1] - o.y]; return true;
    }
    function linkSvg(o, th) {
        const a = o._a || [0, 0], b = o._b || [o.w, o.h], c = col(o.stroke, th.fg), sw = num(o.sw, 4), hl = Math.max(10, sw * 3.2), ar = o.arrow || 'end';
        const dash = {dash: `${sw * 3} ${sw * 2}`, dot: `${Math.max(1, sw * .2)} ${sw * 1.8}`}[o.dash] || '';
        const d = o.kind === 'elbow' ? `M${r1(a[0])} ${r1(a[1])}H${r1((a[0] + b[0]) / 2)}V${r1(b[1])}H${r1(b[0])}` : o.kind === 'curve' ? `M${r1(a[0])} ${r1(a[1])}C${r1((a[0] + b[0]) / 2)} ${r1(a[1])} ${r1((a[0] + b[0]) / 2)} ${r1(b[1])} ${r1(b[0])} ${r1(b[1])}` : `M${r1(a[0])} ${r1(a[1])}L${r1(b[0])} ${r1(b[1])}`;
        // la pointe suit la dernière direction du trait
        const head = (p, q) => { const L = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1, ux = (p[0] - q[0]) / L, uy = (p[1] - q[1]) / L; return `<polygon points="${r1(p[0])},${r1(p[1])} ${r1(p[0] - ux * hl - uy * hl * .6)},${r1(p[1] - uy * hl + ux * hl * .6)} ${r1(p[0] - ux * hl + uy * hl * .6)},${r1(p[1] - uy * hl - ux * hl * .6)}" fill="${c}"/>`; };
        const nearB = o.kind === 'elbow' ? [b[0] - Math.sign(b[0] - a[0] || 1) * 10, b[1]] : o.kind === 'curve' ? [(a[0] + b[0]) / 2, b[1]] : a, nearA = o.kind === 'elbow' ? [a[0] + Math.sign(b[0] - a[0] || 1) * 10, a[1]] : o.kind === 'curve' ? [(a[0] + b[0]) / 2, a[1]] : b;
        return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${r1(o.w)} ${r1(o.h)}" style="position:absolute;left:0;top:0;overflow:visible"><path d="${d}" fill="none" stroke="${c}" stroke-width="${r1(sw)}"${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linejoin="round"/>${/end|both/.test(ar) ? head(b, nearB) : ''}${/both/.test(ar) ? head(a, nearA) : ''}</svg>`;
    }
    /** 🗂 le masque des diapositives : des objets montrés sous toutes les diapositives (logo, pied de page, « {n} / {total} ») */
    function masterHtml(show, s, th, mode) {
        const m = show.master?.objs; if (!Array.isArray(m) || !m.length || s.noMaster) return '';
        const n = (show.slides || []).indexOf(s) + 1, tot = (show.slides || []).length, fill = h => String(h || '').replace(/\{n\}/g, String(Math.max(1, n))).replace(/\{total\}/g, String(tot));
        return `<div class="kn-mst" style="position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none">${m.map(o => objHtml(o.t === 'text' ? {...o, html: fill(o.html)} : o.t === 'shape' ? {...o, text: fill(o.text)} : o, show, th, mode).replace(/ data-kn-o="/g, ' data-kn-m="')).join('')}</div>`;
    }
    function renderSlide(show, s, mode = 'edit') {
        const [W, H] = dims(show), th = themeOf(show), objs = s.objs || [];
        const vis = objs.filter(o => o.t !== 'link' || linkGeom(o, objs));
        return `<div class="kn-sl" style="${esc(`position:relative;width:${W}px;height:${H}px;overflow:hidden;${bgCss(s, th)};color:${th.fg};font-family:${th.bf}`)}">${bgImg(s)}${masterHtml(show, s, th, mode)}${vis.map(o => objHtml(o, show, th, mode)).join('')}</div>`;
    }
    /** l'état « tout est construit » ou « au début » d'une diapositive : quels objets sont cachés par leurs animations */
    function hiddenAt(s, at) {
        const first = new Map(), last = new Map();
        (s.builds || []).filter(b => b.fx !== 'path').forEach(b => { if (!first.has(b.obj)) first.set(b.obj, b.kind); last.set(b.obj, b.kind); }); // une trajectoire ne cache pas l'objet
        return new Set([...(at === 'start' ? first : last)].filter(([, k]) => at === 'start' ? k === 'in' : k === 'out').map(([id]) => id));
    }
    const renderBuilt = (show, s, mode, at = 'end') => { const hid = hiddenAt(s, at); return renderSlide(show, hid.size ? {...s, objs: (s.objs || []).filter(o => !hid.has(o.id))} : s, mode); };

    /* ═════════ Une diapositive en image (SVG foreignObject, images intégrées) : PNG, vidéo ═════════ */
    const dataUrlCache = new Map();
    const toDataUrl = async url => { if (url.startsWith('data:')) return url; if (dataUrlCache.has(url)) return dataUrlCache.get(url);
        const p = fetch(url).then(r => r.ok ? r.blob() : null).then(b => b ? new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => res(''); fr.readAsDataURL(b); }) : '').catch(() => '');
        dataUrlCache.set(url, p); if (dataUrlCache.size > 300) dataUrlCache.delete(dataUrlCache.keys().next().value); return p; };
    async function slideCanvas(show, s, scale = 1, at = 'end') {
        const [W, H] = dims(show), host = document.createElement('div'); host.innerHTML = renderBuilt(show, s, 'raster', at);
        const el = host.firstElementChild;
        await Promise.all([...el.querySelectorAll('img')].map(async im => { const u = im.getAttribute('src'); const d = u ? await toDataUrl(u) : ''; if (d) im.setAttribute('src', d); else im.remove(); }));
        await Promise.all([...el.querySelectorAll('[style*="url("]')].map(async x => { const m = x.style.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/); if (m) { const d = await toDataUrl(m[1]); x.style.backgroundImage = d ? `url("${d}")` : 'none'; } }));
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">${new XMLSerializer().serializeToString(el)}</foreignObject></svg>`;
        const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        await img.decode().catch(() => new Promise(r => { img.onload = r; img.onerror = r; }));
        const c = document.createElement('canvas'); c.width = Math.round(W * scale); c.height = Math.round(H * scale);
        const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); try { g.drawImage(img, 0, 0, c.width, c.height); } catch (_) {}
        return c;
    }

    /* ═════════ Animations des objets (entrée, sortie) ═════════ */
    const revFrames = fr => fr.slice().reverse().map(f => { const g = {...f}; if (f.offset !== undefined) g.offset = 1 - f.offset; return g; });
    function fxFrames(b, o, W, H, el) {
        const base = `rotate(${r1(o.rot)}deg)`, op = clamp(num(o.op, 1), 0, 1), f0 = el.style.filter || '';
        const off = {l: [-(o.x + o.w) - 40, 0], r: [W - o.x + 40, 0], t: [0, -(o.y + o.h) - 40], b: [0, H - o.y + 40]}[b.dir] || [-(o.x + o.w) - 40, 0];
        switch (b.fx) {
            case 'appear': return [{opacity: 0, offset: 0}, {opacity: 0, offset: .99}, {opacity: op, offset: 1}];
            case 'fly': return [{transform: `translate(${r1(off[0])}px,${r1(off[1])}px) ${base}`, opacity: op}, {transform: `translate(0px,0px) ${base}`, opacity: op}];
            case 'scale': return [{transform: `${base} scale(.15)`, opacity: 0}, {transform: `${base} scale(1)`, opacity: op}];
            case 'pop': return [{transform: `${base} scale(0)`, opacity: 0}, {transform: `${base} scale(1.12)`, opacity: op, offset: .7}, {transform: `${base} scale(1)`, opacity: op}];
            case 'drop': return [{transform: `translate(0px,${r1(-(o.y + o.h) - 40)}px) ${base}`, opacity: op}, {transform: `translate(0px,${r1(H * .02)}px) ${base}`, opacity: op, offset: .78}, {transform: `translate(0px,0px) ${base}`, opacity: op}];
            case 'wipe': return [{clipPath: {l: 'inset(0 100% 0 0)', r: 'inset(0 0 0 100%)', t: 'inset(0 0 100% 0)', b: 'inset(100% 0 0 0)'}[b.dir] || 'inset(0 100% 0 0)', opacity: op}, {clipPath: 'inset(0 0 0 0)', opacity: op}];
            case 'blur': return [{filter: `${f0} blur(24px)`, opacity: 0}, {filter: `${f0} blur(0px)`, opacity: op}];
            case 'spin': return [{transform: `${base} rotate(-360deg) scale(.2)`, opacity: 0}, {transform: `${base} rotate(0deg) scale(1)`, opacity: op}];
            case 'path': { // 〰 trajectoire : de sa place jusqu'au décalage choisi, en ligne, arc, vague, zigzag ou boucle (et il y reste)
                const dx = num(b.dx, 400), dy = num(b.dy, 0), L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, N = 24;
                return Array.from({length: N + 1}, (_, i) => { const t = i / N; let px = dx * t, py = dy * t, k = 0;
                    if (b.pk === 'arc') k = Math.sin(Math.PI * t) * L * .3; else if (b.pk === 'wave') k = Math.sin(Math.PI * 4 * t) * L * .08; else if (b.pk === 'zigzag') k = ((Math.floor(t * 8) % 2 ? 1 : -1) * (t * 8 % 1 - .5) * 2) * L * .06 * (t > 0 && t < 1 ? 1 : 0);
                    else if (b.pk === 'loop') { const a = t * Math.PI * 2, r = L * .15; px += Math.sin(a) * r * (t > .3 && t < .7 ? 1 : 0); k = (1 - Math.cos(a)) * r * (t > .3 && t < .7 ? 1 : 0); }
                    return {transform: `translate(${r1(px + nx * k)}px,${r1(py + ny * k)}px) ${base}`, opacity: op, offset: t}; }); }
            default: return [{opacity: 0}, {opacity: op}];
        }
    }
    function typewriter(el, dur, delay, out) {
        const nodes = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); while (w.nextNode()) nodes.push(w.currentNode);
        const full = nodes.map(n => n.nodeValue), N = full.reduce((a, s) => a + s.length, 0);
        const set = k => { let left = k; nodes.forEach((n, i) => { n.nodeValue = left >= full[i].length ? full[i] : full[i].slice(0, Math.max(0, left)); left -= full[i].length; }); };
        let raf = 0, tm = 0, done = false;
        const fin = () => { if (done) return; done = true; cancelAnimationFrame(raf); clearTimeout(tm); set(out ? 0 : N); if (out) el.style.visibility = 'hidden'; };
        set(out ? N : 0); el.style.visibility = 'visible';
        tm = setTimeout(() => { const t0 = performance.now(); const step = () => { if (done) return; const p = clamp((performance.now() - t0) / (dur * 1000), 0, 1); set(Math.round((out ? 1 - p : p) * N)); if (p < 1) raf = requestAnimationFrame(step); else fin(); }; step(); }, delay * 1000);
        return {finish: fin, isDone: () => done};
    }
    const stepsOf = s => { const out = []; (s.builds || []).forEach(b => { if (!out.length || b.start === 'click') out.push([]); out[out.length - 1].push(b); }); return out; };
    /** une étape d'animations (« au clic », puis celles « avec » et « après ») ; renvoie de quoi les finir d'un coup */
    function runBuilds(layer, s, list, W, H) {
        const handles = []; let prevStart = 0, prevEnd = 0;
        list.forEach((b, i) => {
            const el = layer.querySelector(`[data-kn-o="${CSS.escape(b.obj)}"]`), o = (s.objs || []).find(x => x.id === b.obj); if (!el || !o) return;
            const dur = b.fx === 'appear' ? .05 : clamp(num(b.dur, .6), .05, 20), start = i === 0 ? num(b.delay) : b.start === 'after' ? prevEnd + num(b.delay) : prevStart + num(b.delay);
            prevStart = start; prevEnd = start + dur;
            el.getAnimations().forEach(a => { try { a.commitStyles?.(); } catch (_) {} a.cancel(); });
            el.style.visibility = 'visible';
            if (b.fx === 'type' && o.t === 'text') { handles.push(typewriter(el, dur, start, b.kind === 'out')); return; }
            let fr = fxFrames(b, o, W, H, el); if (b.kind === 'out') fr = revFrames(fr);
            const an = el.animate(fr, {duration: dur * 1000, delay: start * 1000, fill: 'both', easing: ['fly', 'drop', 'wipe'].includes(b.fx) ? 'cubic-bezier(.2,.75,.2,1)' : 'ease-out'});
            handles.push({finish: () => { try { an.finish(); } catch (_) {} }, isDone: () => an.playState === 'finished'});
        });
        return handles;
    }

    /* ═════════ Transitions entre diapositives (deux calques, Web Animations) ═════════ */
    function transition(type, oldL, newL, dur, dir, W, H, stage, sOld, sNew) {
        const ms = Math.max(1, dur * 1000), ease = 'cubic-bezier(.4,0,.2,1)', anims = [], undo = [];
        const go = (el, fr, o = {}) => anims.push(el.animate(fr, {duration: ms, easing: ease, fill: 'both', ...o}));
        const dx = dir === 'r' ? W : dir === 'l' ? -W : 0, dy = dir === 't' ? -H : dir === 'b' ? H : 0;
        oldL.style.zIndex = 1; newL.style.zIndex = 2;
        switch (type) {
            case 'fade': go(newL, [{opacity: 0}, {opacity: 1}]); break;
            case 'dissolve': go(newL, [{opacity: 0, filter: 'blur(12px)'}, {opacity: 1, filter: 'blur(0px)'}]); go(oldL, [{opacity: 1}, {opacity: 0}]); break;
            case 'black': go(oldL, [{opacity: 1}, {opacity: 0, offset: .5}, {opacity: 0}]); go(newL, [{opacity: 0}, {opacity: 0, offset: .5}, {opacity: 1}]); break;
            case 'push': go(oldL, [{transform: 'translate(0px,0px)'}, {transform: `translate(${dx}px,${dy}px)`}]); go(newL, [{transform: `translate(${-dx}px,${-dy}px)`}, {transform: 'translate(0px,0px)'}]); break;
            case 'movein': go(newL, [{transform: `translate(${-dx}px,${-dy}px)`}, {transform: 'translate(0px,0px)'}]); break;
            case 'reveal': oldL.style.zIndex = 3; go(oldL, [{transform: 'translate(0px,0px)'}, {transform: `translate(${dx}px,${dy}px)`}]); break;
            case 'wipe': go(newL, [{clipPath: {l: 'inset(0 0 0 100%)', r: 'inset(0 100% 0 0)', t: 'inset(100% 0 0 0)', b: 'inset(0 0 100% 0)'}[dir] || 'inset(0 0 0 100%)'}, {clipPath: 'inset(0 0 0 0)'}]); break;
            case 'zoom': go(oldL, [{transform: 'scale(1)', opacity: 1}, {transform: 'scale(1.6)', opacity: 0}]); go(newL, [{transform: 'scale(.35)', opacity: 0}, {transform: 'scale(1)', opacity: 1}]); break;
            case 'swap': go(oldL, [{transform: 'translateX(0px) scale(1)', opacity: 1}, {transform: `translateX(${dir === 'r' ? W * .3 : -W * .3}px) scale(.72)`, opacity: 0}]); go(newL, [{transform: `translateX(${dir === 'r' ? -W * .3 : W * .3}px) scale(.72)`, opacity: 0}, {transform: 'translateX(0px) scale(1)', opacity: 1}]); break;
            case 'flip': case 'cube': {
                stage.style.perspective = `${W * (type === 'cube' ? 1.7 : 2.4)}px`; const sg = dir === 'r' ? -1 : 1, z = W / 2;
                [oldL, newL].forEach(l => { l.style.backfaceVisibility = 'hidden'; });
                if (type === 'flip') { go(oldL, [{transform: 'rotateY(0deg)'}, {transform: `rotateY(${-180 * sg}deg)`}]); go(newL, [{transform: `rotateY(${180 * sg}deg)`}, {transform: 'rotateY(0deg)'}]); }
                else { go(oldL, [{transform: `translateZ(${-z}px) rotateY(0deg) translateZ(${z}px)`}, {transform: `translateZ(${-z}px) rotateY(${-90 * sg}deg) translateZ(${z}px)`}]); go(newL, [{transform: `translateZ(${-z}px) rotateY(${90 * sg}deg) translateZ(${z}px)`}, {transform: `translateZ(${-z}px) rotateY(0deg) translateZ(${z}px)`}]); }
                undo.push(() => { stage.style.perspective = ''; });
                break;
            }
            case 'magic': {
                // « déplacement magique » : les objets communs aux deux diapositives (même objet dupliqué, ou même nom) glissent d'une place à l'autre
                const fly = document.createElement('div'); fly.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;z-index:4;pointer-events:none`; stage.appendChild(fly);
                const flySl = newL.firstElementChild.cloneNode(false); flySl.style.background = 'transparent'; fly.appendChild(flySl);
                oldL.style.zIndex = 3; newL.style.zIndex = 2;
                const moved = [];
                (sNew.objs || []).forEach(n => {
                    const el = newL.querySelector(`[data-kn-o="${CSS.escape(n.id)}"]`); if (!el || el.style.visibility === 'hidden') return;
                    const o = (sOld.objs || []).find(x => x.id === n.id && x.t === n.t) || (n.name ? (sOld.objs || []).find(x => x.name === n.name && x.t === n.t) : null);
                    if (!o) { go(el, [{opacity: 0}, {opacity: 0, offset: .45}, {opacity: clamp(num(n.op, 1), 0, 1)}]); return; }
                    const oe = oldL.querySelector(`[data-kn-o="${CSS.escape(o.id)}"]`); if (oe) oe.style.visibility = 'hidden';
                    const ph = document.createComment('kn'); el.replaceWith(ph); flySl.appendChild(el); moved.push([el, ph]);
                    const dx2 = (o.x + o.w / 2) - (n.x + n.w / 2), dy2 = (o.y + o.h / 2) - (n.y + n.h / 2);
                    go(el, [{transform: `translate(${r1(dx2)}px,${r1(dy2)}px) rotate(${r1(o.rot)}deg) scale(${(o.w / n.w).toFixed(4)},${(o.h / n.h).toFixed(4)})`, opacity: clamp(num(o.op, 1), 0, 1)}, {transform: `translate(0px,0px) rotate(${r1(n.rot)}deg) scale(1,1)`, opacity: clamp(num(n.op, 1), 0, 1)}], {easing: 'cubic-bezier(.45,0,.2,1)'});
                });
                go(oldL, [{opacity: 1}, {opacity: 0}], {duration: ms * .7});
                undo.push(() => { moved.forEach(([el, ph]) => { ph.replaceWith(el); el.getAnimations().forEach(a => a.cancel()); }); fly.remove(); });
                break;
            }
            default: break;
        }
        let done = false, resolve;
        const promise = new Promise(r => { resolve = r; });
        const finish = () => { if (done) return; done = true; anims.forEach(a => { try { a.finish(); } catch (_) {} }); [oldL, newL].forEach(l => { l.getAnimations().forEach(a => a.cancel()); l.style.zIndex = ''; l.style.backfaceVisibility = ''; }); undo.forEach(f => f()); newL.querySelectorAll('.kn-o').forEach(el => { if (!el.dataset.knKeep) el.getAnimations().forEach(a => a.cancel()); }); resolve(); };
        if (!anims.length) finish(); else Promise.all(anims.map(a => a.finished.catch(() => {}))).then(finish);
        return {finish, promise, isDone: () => done};
    }

    /* ═════════ La lecture en plein écran, le présentateur, le pointeur laser ═════════ */
    const PRESENTER_CSS = `*{box-sizing:border-box}html,body{margin:0;height:100%;background:#1c1c1e;color:#f2f2f7;font:15px -apple-system,"Segoe UI",Helvetica,Arial,sans-serif}
.pp{display:grid;grid-template-rows:auto 1fr auto;height:100%}.pp header,.pp footer{display:flex;gap:10px;align-items:center;padding:8px 14px;background:#2c2c2e;flex-wrap:wrap}
.pp header b{font-size:26px;font-variant-numeric:tabular-nums}.pp .sp{flex:1}.pp button{font:inherit;background:#3a3a3c;color:#fff;border:1px solid #48484a;border-radius:8px;padding:6px 12px;cursor:pointer}.pp button:hover{background:#48484a}
.pp main{display:grid;grid-template-columns:1.6fr 1fr;gap:14px;padding:14px;min-height:0}.pp .col{display:grid;grid-template-rows:auto 1fr;gap:6px;min-height:0}.pp .col2{display:grid;grid-template-rows:auto minmax(0,.9fr) auto minmax(0,1.1fr);gap:6px;min-height:0}
.pp .lbl{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#8e8e93}.pp .box{position:relative;overflow:hidden;background:#000;border-radius:8px;min-height:0}
.pp .notes{overflow:auto;background:#2c2c2e;border-radius:8px;padding:12px 14px;line-height:1.45;white-space:normal}.pp .muted{color:#8e8e93}
.pp ul{list-style:disc;padding-left:1.2em;margin:.2em 0}.pp ol{padding-left:1.4em;margin:.2em 0}`;
    function openPlayer(show, {start = 0, name = '', onExit, presenter = false} = {}) {
        const [W, H] = dims(show), order = show.slides.map((s, i) => i).filter(i => !show.slides[i].skip);
        if (!order.length) { toast('Aucune diapositive à montrer (toutes sont sautées ?).', 'error'); return; }
        let pos = order.findIndex(i => i >= start); if (pos < 0) pos = 0;
        const P = prefs();
        const dlg = document.createElement('dialog'); dlg.className = 'kn-play-dlg';
        dlg.innerHTML = `<div class="kn-pv" data-pv><div class="kn-pst" data-pst></div><div class="kn-pcover" data-cover hidden></div><div class="kn-laser" data-laser hidden></div>
            <div class="kn-phud" data-hud><button type="button" data-p="prev" title="Précédente (←)">‹</button><span data-pidx></span><button type="button" data-p="next" title="Suivante (→ ou espace)">›</button><button type="button" data-p="presenter" title="Fenêtre du présentateur : notes, suivante, chronomètre (P)">🎤</button><button type="button" data-p="laser" title="Pointeur laser (L)">🔴</button><button type="button" data-p="help" title="Les touches (?)">?</button><button type="button" data-p="exit" title="Quitter (Échap)">×</button></div>
            <div class="kn-phelp" data-help hidden><h3>Touches</h3><p><kbd>→</kbd> <kbd>espace</kbd> <kbd>clic</kbd> suivante · <kbd>←</kbd> précédente · <kbd>Début</kbd> <kbd>Fin</kbd> · un numéro puis <kbd>Entrée</kbd> : aller à la diapositive · <kbd>B</kbd> écran noir · <kbd>W</kbd> écran blanc · <kbd>L</kbd> pointeur laser · <kbd>P</kbd> présentateur · <kbd>Échap</kbd> quitter</p></div></div>`;
        document.body.appendChild(dlg); dlg.showModal();
        dlg.requestFullscreen?.().catch(() => {});
        const $ = s => dlg.querySelector(s), pv = $('[data-pv]'), stage = $('[data-pst]'), cover = $('[data-cover]'), laserEl = $('[data-laser]'), hud = $('[data-hud]');
        stage.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;transform-origin:0 0;background:#000`;
        laserEl.style.background = col(P.laser, '#ff2d2d');
        const fit = () => { const vw = pv.clientWidth, vh = pv.clientHeight, k = Math.min(vw / W, vh / H); stage.style.transform = `translate(${(vw - W * k) / 2}px,${(vh - H * k) / 2}px) scale(${k})`; };
        let layer = null, steps = [], si = 0, running = [], transH = null, ended = false, autoT = 0, typed = '', hudT = 0, laser = false, pw = null, pTimer = 0, pStart = Date.now(), pPause = 0, notesSize = 20;
        let music = null; if (show.music?.filename && fileOk(show.music.filename)) { music = new Audio(mediaUrl(show.music.filename)); music.loop = true; music.volume = clamp(num(show.musicVol, .5), 0, 1); music.play().catch(() => {}); }
        const mediaStart = L => L.querySelectorAll('video,audio').forEach(m => { m.volume = clamp(num(m.dataset.knVol, 1), 0, 1); if (m.dataset.knAuto === '1') { try { m.currentTime = num(m.dataset.knStart); } catch (_) {} m.play().catch(() => {}); } });
        const mediaStop = L => L?.querySelectorAll('video,audio').forEach(m => m.pause());
        const mount = (i, at) => { const s = show.slides[order[i]], L = document.createElement('div'); L.className = 'kn-player-layer'; L.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px`; L.innerHTML = renderSlide(show, s, 'play');
            hiddenAt(s, at).forEach(id => { const el = L.querySelector(`[data-kn-o="${CSS.escape(id)}"]`); if (el) el.style.visibility = 'hidden'; }); L._idx = order[i]; return L; };
        const finishAll = () => { transH?.finish(); transH = null; running.forEach(h => h.finish()); running = []; };
        const cur = () => show.slides[order[pos]];
        function armAuto() { clearTimeout(autoT); const s = cur(); if (!s?.auto) return; autoT = setTimeout(() => next(), Math.max(.3, num(s.dur, 5)) * 1000 / (steps.length - si + 1)); }
        function runStep() { running = runBuilds(layer, cur(), steps[si], W, H); si++; armAuto(); presenterUpdate(); }
        function afterEnter() { if (si === 0 && steps.length && steps[0][0].start !== 'click') runStep(); else armAuto(); }
        function enter(i, {at = 'start', trans = true} = {}) {
            finishAll(); clearTimeout(autoT); ended = false; cover.hidden = true; cover.className = 'kn-pcover';
            const prevL = layer, prevS = prevL ? show.slides[prevL._idx] : null, s = show.slides[order[i]];
            pos = i; layer = mount(i, at); stage.appendChild(layer); steps = stepsOf(s); si = at === 'end' ? steps.length : 0;
            mediaStop(prevL); mediaStart(layer);
            const t = s.trans || {};
            if (prevL && trans && t.type && t.type !== 'none') { const h = transH = transition(t.type, prevL, layer, clamp(num(t.dur, .8), .1, 5), t.dir || 'l', W, H, stage, prevS, s); h.promise.then(() => { prevL.remove(); if (transH === h) transH = null; afterEnter(); }); }
            else { prevL?.remove(); afterEnter(); }
            $('[data-pidx]').textContent = `${pos + 1} / ${order.length}`;
            presenterUpdate();
        }
        function next() {
            if (transH) { transH.finish(); return; }
            if (running.some(h => !h.isDone())) { running.forEach(h => h.finish()); return; }
            if (ended) return exit();
            if (si < steps.length) return runStep();
            if (pos < order.length - 1) return enter(pos + 1);
            if (show.loop) return enter(0);
            ended = true; clearTimeout(autoT); cover.hidden = false; cover.className = 'kn-pcover is-end'; cover.textContent = 'Fin de la présentation — clic ou → pour quitter'; presenterUpdate();
        }
        function prev() { if (ended) { ended = false; cover.hidden = true; return; } if (transH) transH.finish(); enter(Math.max(0, pos - 1), {at: pos > 0 ? 'end' : 'start', trans: false}); }
        function setCover(kind) { if (!cover.hidden && cover.classList.contains('is-' + kind)) { cover.hidden = true; return; } cover.hidden = false; cover.className = `kn-pcover is-${kind}`; cover.textContent = ''; }
        function exit() {
            finishAll(); clearTimeout(autoT); clearInterval(pTimer); mediaStop(layer); music?.pause();
            window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', fit);
            try { if (pw && !pw.closed) pw.close(); } catch (_) {}
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            dlg.close(); dlg.remove(); onExit?.(order[pos]);
        }
        /* ─── la fenêtre du présentateur (deuxième écran) ─── */
        const fitBox = (box, html) => { if (!box) return; const bw = box.clientWidth, bh = box.clientHeight, k = Math.min(bw / W, bh / H) || .1; box.innerHTML = `<div style="position:absolute;width:${W}px;height:${H}px;left:${(bw - W * k) / 2}px;top:${(bh - H * k) / 2}px;transform:scale(${k});transform-origin:0 0">${html}</div>`; };
        function presenterUpdate() {
            if (!pw || pw.closed) return; const d = pw.document, s = cur(), nx = order[pos + 1] !== undefined ? show.slides[order[pos + 1]] : null;
            fitBox(d.getElementById('cur'), renderBuilt(show, s, 'thumb', si >= steps.length ? 'end' : 'start'));
            fitBox(d.getElementById('next'), si < steps.length ? `<div style="width:${W}px;height:${H}px;display:flex;align-items:center;justify-content:center;background:#222;color:#ddd;font:600 ${H / 12}px sans-serif">✨ Encore ${steps.length - si} animation${steps.length - si > 1 ? 's' : ''} sur cette diapositive</div>` : nx ? renderBuilt(show, nx, 'thumb', 'end') : `<div style="width:${W}px;height:${H}px;display:flex;align-items:center;justify-content:center;background:#111;color:#888;font:600 ${H / 10}px sans-serif">Fin</div>`);
            const n = d.getElementById('notes'); n.style.fontSize = notesSize + 'px'; n.innerHTML = s.notes ? esc(s.notes).replace(/\n/g, '<br>') : '<span class="empty-line"><span class="empty-line-ico" aria-hidden="true">📝</span><span class="empty-line-text">Pas de notes pour cette diapositive (onglet 📝 Notes sous la diapositive).</span></span>';
            d.getElementById('idx').textContent = ended ? 'Fin' : `Diapositive ${pos + 1} / ${order.length}`;
        }
        const tick = () => { if (!pw || pw.closed) { clearInterval(pTimer); return; } const d = pw.document, el = (Date.now() - pStart - (pPause ? Date.now() - pPause : 0)) / 1000; d.getElementById('timer').textContent = `${Math.floor(el / 3600) ? Math.floor(el / 3600) + ':' : ''}${String(Math.floor(el / 60) % 60).padStart(2, '0')}:${String(Math.floor(el % 60)).padStart(2, '0')}`; d.getElementById('clock').textContent = new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'}); };
        function openPresenter() {
            if (pw && !pw.closed) { pw.focus(); return; }
            pw = window.open('', 'lcnda-kn-presenter', 'width=1180,height=760');
            if (!pw) { toast('La fenêtre du présentateur a été bloquée : autorise les fenêtres surgissantes pour cette page.', 'error'); return; }
            const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
            pw.document.open(); pw.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>🎤 Présentateur — ${esc(name || 'Présentation')}</title><base href="${esc(base)}"><style>${PRESENTER_CSS}</style></head><body><div class="pp">
                <header><b id="timer">00:00</b><button type="button" data-a="pause" title="Arrêter / reprendre le chronomètre">⏸</button><button type="button" data-a="reset" title="Remettre le chronomètre à zéro">↺</button><span class="sp"></span><span id="idx"></span><span class="sp"></span><span class="muted">Heure :</span> <b id="clock" style="font-size:18px"></b></header>
                <main><div class="col"><div class="lbl">Maintenant</div><div class="box" id="cur"></div></div><div class="col2"><div class="lbl">Ensuite</div><div class="box" id="next"></div><div class="lbl">Notes <button type="button" data-a="smaller" title="Plus petit">A−</button> <button type="button" data-a="bigger" title="Plus grand">A+</button></div><div class="notes" id="notes"></div></div></main>
                <footer><button type="button" data-a="prev">‹ Précédente</button><button type="button" data-a="next">Suivante ›</button><button type="button" data-a="black">Écran noir</button><button type="button" data-a="white">Écran blanc</button><span class="sp"></span><span class="muted">Touches : → ← espace, B, W, Échap</span><button type="button" data-a="exit">Terminer</button></footer></div></body></html>`);
            pw.document.close();
            pw.addEventListener('keydown', onKey, true);
            pw.addEventListener('resize', () => presenterUpdate());
            pw.document.addEventListener('click', e => { const a = e.target.closest?.('[data-a]')?.dataset.a; if (!a) return;
                if (a === 'next') next(); if (a === 'prev') prev(); if (a === 'black') setCover('black'); if (a === 'white') setCover('white'); if (a === 'exit') exit();
                if (a === 'reset') { pStart = Date.now(); pPause = pPause ? Date.now() : 0; } if (a === 'pause') { if (pPause) { pStart += Date.now() - pPause; pPause = 0; } else pPause = Date.now(); e.target.textContent = pPause ? '▶' : '⏸'; }
                if (a === 'bigger' || a === 'smaller') { notesSize = clamp(notesSize + (a === 'bigger' ? 2 : -2), 12, 48); presenterUpdate(); } tick(); });
            pStart = Date.now(); pPause = 0; clearInterval(pTimer); pTimer = setInterval(tick, 500); tick();
            setTimeout(presenterUpdate, 60);
        }
        /* ─── touches, souris, pointeur laser ─── */
        function onKey(e) {
            if (e.target?.closest?.('input,textarea,select')) return;
            const k = e.key; let used = true;
            if (/^[0-9]$/.test(k)) typed = (typed + k).slice(-4);
            else if (k === 'Enter' && typed) { enter(clamp(Number(typed) - 1, 0, order.length - 1), {trans: false}); typed = ''; }
            else if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter', 'n', 'N'].includes(k)) next();
            else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) prev();
            else if (k === 'Home') enter(0, {trans: false});
            else if (k === 'End') enter(order.length - 1, {trans: false, at: 'end'});
            else if (k === 'b' || k === 'B' || k === '.') setCover('black');
            else if (k === 'w' || k === 'W' || k === ',') setCover('white');
            else if (k === 'l' || k === 'L') toggleLaser();
            else if (k === 'p' || k === 'P' || k === 's' || k === 'S') openPresenter();
            else if (k === '?' || k === 'h' || k === 'H') $('[data-help]').hidden = !$('[data-help]').hidden;
            else if (k === 'Escape') exit();
            else used = false;
            if (!/^[0-9]$/.test(k) && k !== 'Enter') typed = '';
            if (used) { e.preventDefault(); e.stopPropagation(); }
        }
        const toggleLaser = () => { laser = !laser; laserEl.hidden = !laser; pv.classList.toggle('is-laser', laser); };
        window.addEventListener('keydown', onKey, true); window.addEventListener('resize', fit);
        dlg.dataset.ownClose = '1'; // Échap : l'outil demande lui-même s'il faut (une seule question « Fermer sans enregistrer ? »)
        dlg.addEventListener('cancel', e => { e.preventDefault(); exit(); });
        pv.addEventListener('pointermove', e => { if (laser) { laserEl.style.left = e.clientX + 'px'; laserEl.style.top = e.clientY + 'px'; } hud.classList.add('is-on'); clearTimeout(hudT); hudT = setTimeout(() => hud.classList.remove('is-on'), 1800); });
        pv.addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) { const a = b.dataset.p; if (a === 'next') next(); if (a === 'prev') prev(); if (a === 'exit') exit(); if (a === 'laser') toggleLaser(); if (a === 'presenter') openPresenter(); if (a === 'help') $('[data-help]').hidden = !$('[data-help]').hidden; return; }
            if (e.target.closest('video[controls],audio[controls],[data-help]')) return; next(); });
        pv.addEventListener('contextmenu', e => { e.preventDefault(); if (!window.LCNDA_UI?.contextMenu) return prev(); window.LCNDA_UI.contextMenu(e, [{icon: '←', label: 'Diapositive précédente', shortcut: 'ArrowLeft', run: prev}, {icon: '→', label: 'Diapositive suivante', shortcut: 'ArrowRight', run: next}, '-', {icon: '×', label: 'Quitter la présentation', shortcut: 'Échap', run: exit}]); }); // K14 : le menu de l'app (plus de « clic droit = diapo précédente »)
        fit(); requestAnimationFrame(fit); setTimeout(fit, 250);
        enter(pos, {trans: false});
        if (presenter) openPresenter();
        return {next, prev, exit, get pos() { return order[pos]; }, get step() { return si; }};
    }

    /* ═════════ Les données ═════════ */
    const KN_CLIP = {objs: null, slides: null}; // le presse-papiers (aussi d'une présentation à l'autre)
    function normalize(show) {
        const p = prefs();
        const s = {mode: 'keynote', aspect: show.aspect || p.aspect, w: num(show.w, 1920), h: num(show.h, 1080), theme: THEMES[show.theme] ? show.theme : p.theme, colors: show.colors && typeof show.colors === 'object' ? show.colors : {}, fonts: show.fonts && typeof show.fonts === 'object' ? show.fonts : {}, music: show.music || null, musicVol: num(show.musicVol, .5), loop: !!show.loop};
        s.slides = (Array.isArray(show.slides) ? show.slides : []).filter(x => x && typeof x === 'object').map(x => ({id: x.id || uid('s'), type: 'kn', layout: x.layout || 'blank', bg: x.bg && typeof x.bg === 'object' ? x.bg : {type: 'theme'}, trans: x.trans && typeof x.trans === 'object' ? x.trans : {type: p.trans, dur: p.transDur, dir: 'l'}, dur: num(x.dur, 5),
            objs: (Array.isArray(x.objs) ? x.objs : []).filter(o => o && TYPE_LABEL[o.t]).map(o => ({...o, id: o.id || uid(), x: num(o.x), y: num(o.y), w: Math.max(1, num(o.w, 100)), h: Math.max(1, num(o.h, 100))})),
            builds: (Array.isArray(x.builds) ? x.builds : []).filter(b => b && b.obj).map(b => ({id: b.id || uid('b'), ...b})), notes: String(x.notes || ''), section: String(x.section || ''), skip: !!x.skip, auto: !!x.auto, noMaster: !!x.noMaster}));
        s.master = {objs: (Array.isArray(show.master?.objs) ? show.master.objs : []).filter(o => o && TYPE_LABEL[o.t] && o.t !== 'link').map(o => ({...o, id: o.id || uid()}))};
        return s;
    }
    function newShowFrom(p = prefs(), over = {}) { const [w, h] = p.aspect === 'custom' ? [clamp(num(p.w, 1920), 320, 4000), clamp(num(p.h, 1080), 240, 4000)] : ASPECTS[p.aspect] || ASPECTS['16:9']; return {mode: 'keynote', aspect: ASPECTS[p.aspect] ? p.aspect : '16:9', w, h, theme: THEMES[p.theme] ? p.theme : 'blanc', colors: {}, fonts: {}, music: null, musicVol: .5, slides: [], ...over}; }
    const newSlide = (show, layout) => { const [W, H] = dims(show), p = prefs(); return {id: uid('s'), type: 'kn', layout, bg: {type: 'theme'}, trans: {type: p.trans, dur: p.transDur, dir: 'l'}, dur: 5, objs: layoutObjs(layout, W, H, themeOf(show)), builds: [], notes: '', section: ''}; };
    const cloneObj = o => { const c = JSON.parse(JSON.stringify(o)); c.id = uid(); delete c._editing; return c; };
    /** une photo des données d'une personne, gardée dans l'objet (la présentation se lit sans la base) */
    async function personData(pid) {
        const r = await api('person', {id: pid}), p = r.person || {}, ev = r.events || [];
        const nm = x => A().personName(x), yr = x => A().years?.(x) || '';
        const evOf = tags => ev.find(e => tags.includes(e.gedcom_tag)), fE = e => e ? [e.date_text, e.place_name].filter(Boolean).join(' · ') : '';
        return {name: nm(p), years: yr(p), occ: p.occupation || '', portrait: fileOk(p.portrait) ? p.portrait : '', sex: p.gender || '', birth: fE(evOf(['BIRT', 'BAPM', 'CHR'])), marriage: fE(evOf(['MARR'])), death: fE(evOf(['DEAT', 'BURI'])),
            parents: (r.parents || []).slice(0, 2).map(x => ({name: nm(x), years: yr(x)})), partners: (r.partners || []).slice(0, 3).map(x => ({name: nm(x), years: yr(x)})), children: (r.children || []).slice(0, 12).map(x => ({name: nm(x), years: yr(x)})),
            events: ev.filter(e => e.year).sort((a, b) => a.year - b.year).slice(0, 14).map(e => ({year: e.year, label: [e.type_label, e.place_name].filter(Boolean).join(' · ')})), at: new Date().toISOString().slice(0, 10)};
    }
    async function uploadBlob(blob, filename, kind = 'image', title = '') {
        const fd = new FormData(); fd.append('file', blob, filename); fd.append('kind', kind); fd.append('title', (title || filename.replace(/\.[^.]+$/, '')).slice(0, 280)); fd.append('csrf', A().state.csrf);
        const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}}), j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(j.error || 'Envoi impossible.');
        return {media_id: Number(j.result.media_id), filename: j.result.filename};
    }
    const imgSize = src => new Promise(res => { const im = new Image(); im.onload = () => res([im.naturalWidth || 1, im.naturalHeight || 1]); im.onerror = () => res([4, 3]); im.src = src; });
    function askPerson(title) {
        const cp = Number(A().state.currentPersonId) || 0;
        return new Promise(res => { let done = false;
            ext.openDialog({eyebrow: 'PRÉSENTATION', title, submitLabel: 'Choisir',
                body: `<div class="h-pk-solo"><span class="pk-lab">Personne</span>${(window.LCNDA_PICKER || A()).pickerField({name: 'kn_pick', kind: 'person', value: cp || null})}</div>${cp ? '<p class="muted">La personne affichée en ce moment, ou × pour en chercher une autre.</p>' : ''}`,
                onOpen: dg => { setTimeout(() => (dg.querySelector('.pk-search:not([hidden]) .pk-input') || dg.querySelector('.pk-chosen .go'))?.focus(), 30);
                    dg.addEventListener('close', () => { if (!done) res(0); }, {once: true}); },
                onSubmit: f => { const v = Number(f.elements.kn_pick?.value) || 0; if (!v) return window.LCNDA_UI.fail(f.elements.kn_pick, 'Choisis une personne.'); done = true; res(v); }}); });
    }
    /** une vidéo ou un son : la fenêtre unique des médias (un fichier de l'ordinateur y entre et se coche) */
    async function pickAV(title = 'Une vidéo ou un son', types = ['video', 'audio']) {
        const P = window.LCNDA_PICKER; if (!P?.openMediaPicker) { toast('La fenêtre des médias n’est pas encore prête. Réessaie dans un instant.', 'error'); return null; }
        const m = await P.openMediaPicker({types, eyebrow: 'PRÉSENTATION', title, okLabel: 'Choisir'});
        return m ? {media_id: Number(m.id), filename: m.filename, kind: m.media_type === 'video' ? 'video' : 'audio', title: m.title || ''} : null;
    }
    const BASE_FONTS = ['Helvetica Neue', 'Helvetica', 'Arial', 'Avenir Next', 'Futura', 'Gill Sans', 'Optima', 'Verdana', 'Trebuchet MS', 'Segoe UI', 'Calibri', 'Candara', 'Georgia', 'Garamond', 'EB Garamond', 'Palatino', 'Book Antiqua', 'Baskerville', 'Times New Roman', 'Didot', 'Bodoni 72', 'Cochin', 'Hoefler Text', 'Rockwell', 'Courier New', 'American Typewriter', 'Copperplate', 'Brush Script MT', 'Snell Roundhand', 'Zapfino', 'Apple Chancery', 'Lucida Handwriting', 'Papyrus', 'Impact', 'Chalkboard SE', 'Comic Sans MS', 'serif', 'sans-serif', 'monospace', 'cursive'];
    let localFonts = null;
    const fontList = () => { const mine = readJ(FONTS_KEY, []); return [...new Set([...(Array.isArray(mine) ? mine : []).map(fontOk).filter(Boolean), ...(localFonts || []), ...BASE_FONTS])]; };
    async function loadLocalFonts() {
        if (typeof window.queryLocalFonts !== 'function') { const n = ((await A().askText({title: 'Police de l’ordinateur', message: 'Ce navigateur ne sait pas lister les polices : tape le nom exact d’une police installée (ex. Garamond) :', okLabel: 'Ajouter'})) || '').trim(); if (!n) return false; const mine = readJ(FONTS_KEY, []); writeJ(FONTS_KEY, [...new Set([fontOk(n), ...(Array.isArray(mine) ? mine : [])])].slice(0, 200)); return true; }
        try { const all = await Promise.race([window.queryLocalFonts(), new Promise((_, no) => setTimeout(() => no(new Error('lent')), 8000))]); localFonts = [...new Set(all.map(f => f.family))].sort((a, b) => a.localeCompare(b, 'fr')); if (!localFonts.length) { toast('L’ordinateur n’a donné aucune police : tape son nom dans la fenêtre.', 'error'); localFonts = null; } return true; } catch (_) { toast('Les polices de l’ordinateur ne sont pas lisibles ici : tape le nom d’une police dans la fenêtre.', 'error'); return true; }
    }
    /** 🖥 choisir une police (celles de l'ordinateur en tête), vue dans sa propre forme ; resolve({font, to: 'title' | 'body' | 'sel'}) */
    function pickFont(hasSel) {
        return new Promise(res => { let done = false, chosen = '';
            const all = () => [...new Set([...(localFonts || []), ...fontList()])];
            ext.openDialog({eyebrow: 'PRÉSENTATION', title: '🖥 Choisir une police', submitLabel: 'Pour les titres', wide: true,
                body: `<p class="muted">${localFonts ? `${A().plural(localFonts.length, 'police')} de cet ordinateur, puis celles de l’app.` : 'Les polices de l’app ; une autre police installée : tape son nom exact puis Entrée.'} Clique sur une police, puis dis où elle va.</p>
                    <input type="search" data-kf-q placeholder="Chercher une police, ou taper son nom…" autocomplete="off" style="width:100%">
                    <div class="kn-fontpick" data-kf-list></div><p class="kn-fontprev" data-kf-prev>Choisis une police</p>
                    <div class="kn-row"><button type="button" class="button secondary" data-kf-to="body">Pour les textes</button>${hasSel ? '<button type="button" class="button secondary" data-kf-to="sel">Pour le texte choisi</button>' : ''}</div>`,
                onOpen: dg => { const q = dg.querySelector('[data-kf-q]'), box = dg.querySelector('[data-kf-list]'), prev = dg.querySelector('[data-kf-prev]');
                    const draw = () => { const v = q.value.trim().toLowerCase(), list = all().filter(f => !v || f.toLowerCase().includes(v)).slice(0, 400);
                        box.innerHTML = list.map(f => `<button type="button" class="kn-fontitem${f === chosen ? ' is-on' : ''}" data-kf="${esc(f)}" style="font-family:'${esc(f).replace(/'/g, '')}',sans-serif">${esc(f)}</button>`).join('') || `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔤</span><span class="empty-line-text">Aucune police « ${esc(q.value)} » dans la liste : Entrée pour la prendre telle quelle.</span></p>`; };
                    const pick = f => { chosen = fontOk(f) || ''; prev.textContent = chosen ? `${chosen} : Portez ce vieux whisky au juge blond qui fume` : 'Choisis une police'; prev.style.fontFamily = chosen ? `'${chosen.replace(/'/g, '')}', sans-serif` : ''; box.querySelectorAll('[data-kf]').forEach(b => b.classList.toggle('is-on', b.dataset.kf === chosen)); };
                    q.addEventListener('input', draw); q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (q.value.trim()) pick(q.value.trim()); } });
                    box.addEventListener('click', e => { const b = e.target.closest('[data-kf]'); if (b) pick(b.dataset.kf); });
                    dg.addEventListener('click', e => { const b = e.target.closest('[data-kf-to]'); if (!b) return; if (!chosen) return toast('Clique d’abord sur une police.', 'error'); done = true; res({font: chosen, to: b.dataset.kfTo}); dg.close(); });
                    dg.addEventListener('close', () => { if (!done) res(null); }, {once: true}); draw(); setTimeout(() => q.focus(), 30); },
                onSubmit: () => { if (!chosen) { toast('Clique d’abord sur une police.', 'error'); return false; } done = true; res({font: chosen, to: 'title'}); }}); });
    }
    const shapeIcon = k => `<span class="kn-shico">${shapeSvg({kind: k, w: 34, h: k === 'line' || k === 'arrowline' ? 20 : 26, sw: 3}, {accent: 'currentColor'})}</span>`;

    /* ═════════ L'éditeur ═════════ */
    const HANDLES = [['nw', -1, -1], ['n', 0, -1], ['ne', 1, -1], ['e', 1, 0], ['se', 1, 1], ['s', 0, 1], ['sw', -1, 1], ['w', -1, 0]];
    const opt = (list, v) => list.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('');
    // la touche écrite à la fin de la bulle (« Grouper (⌘G) ») va aussi dans data-shortcut
    const tbtn = (attr, icon, label, title = label) => { const sc = (String(title).match(/\(([⌘⇧⌥][^()]{0,8})\)$/) || [])[1] || ''; return `<button type="button" class="kn-tb" ${attr} title="${esc(title)}" data-tb-label="${esc(`${icon} ${title}`)}"${sc ? ` data-shortcut="${esc(sc)}"` : ''}><b>${icon}</b><span class="kn-tbl">${esc(label)}</span></button>`; };
    async function openEditor(ctx = {}) {
        let id = 0, name = ctx.name || 'Ma présentation', show;
        try {
            if (ctx.preload) { id = ctx.preload.id; name = ctx.preload.name; show = normalize(ctx.preload.show || {}); }
            else if (ctx.id) { const r = await api('slideshow', {id: ctx.id}); id = r.id; name = r.name; show = normalize(r.show || {}); }
            else show = normalize(ctx.show || newShowFrom());
        } catch (e) { return toast(e.message, 'error'); }
        if (!show.slides.length) show.slides.push(newSlide(show, 'title'));
        let cur = 0, sel = new Set(), editing = null, dirty = !!ctx.dirty, zoom = 'fit', K = .5, tab = 'format', hist = [], hi = -1, navFocus = false, snap = prefs().snap !== false, savedRange = null, escUsed = false, closed = false;
        const collapsed = new Set(), docAc = new AbortController(); // les écoutes sur la page s'arrêtent à la fermeture
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal kn-dlg';
        const fileMenu = [['import', '⤒ Importer (PowerPoint, OpenDocument, PDF, images, texte, JSON)…'], ['-'], ['exp_pdf', '🖨 PDF / imprimer (une diapositive par page)'], ['exp_pdfnotes', '🖨 PDF avec les notes de l’orateur'], ['exp_png', '🖼️ Cette diapositive en PNG'], ['exp_pngall', '🗂️ Toutes les diapositives en PNG (.zip)'], ['exp_video', '⏺ Vidéo (WebM)'], ['exp_json', '⤓ Fichier de la présentation (.json)']];
        dlg.innerHTML = `<div class="kn">
            <header class="kn-top"><span class="kn-logo">🎤</span><input class="kn-name" data-kn-name value="${esc(name)}" maxlength="200" aria-label="Nom de la présentation">
                <span class="kn-grp" data-tbg="kn-hist" data-tbg-label="Annuler / rétablir"><button type="button" class="kn-tb" data-kn-cmd="undo" title="Annuler (⌘Z)" data-tb-label="↶ Annuler (⌘Z)" data-shortcut="⌘Z"><b>↶</b><span class="kn-tbl">Annuler</span></button><button type="button" class="kn-tb" data-kn-cmd="redo" title="Rétablir (⇧⌘Z)" data-tb-label="↷ Rétablir (⇧⌘Z)" data-shortcut="⇧⌘Z"><b>↷</b><span class="kn-tbl">Rétablir</span></button></span>
                <span class="kn-grp" data-tbg="kn-insert" data-tbg-label="Insérer (barre du haut)">
                    ${tbtn('data-kn-ins="text"', 'T', 'Texte', 'Une zone de texte')}
                    <details class="kn-dd" data-kn-dd="shape" data-tb-label="◆ Formes"><summary class="kn-tb" title="Une forme"><b>◆</b><span class="kn-tbl">Forme</span></summary><div class="kn-ddl kn-shapes">${SHAPES.map(([k, l]) => `<button type="button" data-kn-ins="shape:${k}" title="${esc(l)}">${shapeIcon(k)}</button>`).join('')}</div></details>
                    ${tbtn('data-kn-ins="image"', '🖼️', 'Image', 'Une photo des médias ou de l’ordinateur')}
                    ${tbtn('data-kn-ins="table"', '▦', 'Tableau', 'Un tableau')}
                    ${tbtn('data-kn-ins="chart"', '📊', 'Graphique', 'Un graphique (colonnes, camembert, courbe…)')}
                    <details class="kn-dd" data-kn-dd="person" data-tb-label="👤 Généalogie (fiche, portrait, arbre, frise)"><summary class="kn-tb" title="La généalogie : une personne de la base"><b>👤</b><span class="kn-tbl">Généalogie</span></summary><div class="kn-ddl">${[['card', '🪪 Fiche d’une personne'], ['photo', '🖼️ Portrait d’une personne'], ['tree', '🌳 Petit arbre (parents, couple, enfants)'], ['timeline', '🗓️ Frise de sa vie']].map(([k, l]) => `<button type="button" data-kn-ins="person:${k}">${l}</button>`).join('')}</div></details>
                    ${tbtn('data-kn-ins="media"', '🎬', 'Vidéo / son', 'Une vidéo ou un son des médias')}
                </span>
                <span class="kn-grp" data-tbg="kn-arrange" data-tbg-label="Disposer (barre du haut)">
                    <details class="kn-dd" data-kn-dd="align" data-tb-label="⇤⇥ Aligner et répartir"><summary class="kn-tb" title="Aligner et répartir"><b>⇤⇥</b><span class="kn-tbl">Aligner</span></summary><div class="kn-ddl">${[['left', '⇤ À gauche'], ['hcenter', '↔ Au centre'], ['right', '⇥ À droite'], ['top', '⤒ En haut'], ['vcenter', '↕ Au milieu'], ['bottom', '⤓ En bas'], ['-'], ['dist-h', '⟷ Répartir horizontalement'], ['dist-v', '⟷ Répartir verticalement']].map(([k, l]) => k === '-' ? '<hr>' : `<button type="button" data-kn-cmd="align:${k}">${l}</button>`).join('')}</div></details>
                    <details class="kn-dd" data-kn-dd="order" data-tb-label="⧉ Ordre (devant, derrière)"><summary class="kn-tb" title="Devant, derrière"><b>⧉</b><span class="kn-tbl">Ordre</span></summary><div class="kn-ddl">${[['front', 'Tout devant (⇧⌘])'], ['forward', 'Avancer (⌘])'], ['backward', 'Reculer (⌘[)'], ['back', 'Tout derrière (⇧⌘[)']].map(([k, l]) => `<button type="button" data-kn-cmd="order:${k}">${l}</button>`).join('')}</div></details>
                    ${tbtn('data-kn-cmd="group"', '⊞', 'Grouper', 'Grouper (⌘G) — ⇧⌘G pour dissocier')}${tbtn('data-kn-cmd="ungroup"', '⊟', 'Dissocier', 'Dissocier (⇧⌘G)')}${tbtn('data-kn-cmd="lock"', '🔒', 'Verrouiller', 'Verrouiller / déverrouiller (⌘L)')}${tbtn('data-kn-cmd="connect"', '↔', 'Relier', 'Relier deux objets par un trait qui les suit (choisis-en deux)')}${tbtn('data-kn-cmd="merge"', '⊕', 'Fusionner', 'Fusionner deux formes : union, soustraction, intersection')}${tbtn('data-kn-cmd="master"', '🗂', 'Masque', 'Masque des diapositives : mettre les objets choisis sur toutes les diapositives, ou modifier le masque')}
                </span>
                <span class="kn-grp" data-tbg="kn-play" data-tbg-label="Lecture">${tbtn('data-kn-cmd="play"', '▶', 'Lire', 'Lire en plein écran depuis le début (⌥⌘↩)')}${tbtn('data-kn-cmd="playhere"', '⏵', 'D’ici', 'Lire depuis cette diapositive (⌘↩)')}${tbtn('data-kn-cmd="presenter"', '🎤', 'Présentateur', 'Plein écran + fenêtre du présentateur (notes, suivante, chronomètre)')}</span>
                <span class="kn-grp" data-tbg="kn-file" data-tbg-label="Fichier">${tbtn('data-kn-cmd="import"', '⤒', 'Importer', 'PowerPoint, OpenDocument, PDF, images, Markdown, texte, JSON')}${tbtn('data-kn-cmd="story"', '✨', 'Récit', 'Récit d’une vie : des diapositives toutes faites à partir de la fiche d’une personne')}</span>
                <span class="kn-spacer"></span><span class="kn-state" data-kn-state data-ui-status></span>
                ${ext.tbButton ? ext.tbButton('keynote') : ''}<button type="button" class="button small secondary" data-kn-cmd="export" title="PDF, impression, images, vidéo, fichier de la présentation">⤓ Exporter ▾</button><button type="button" class="button small" data-kn-cmd="save" data-shortcut="⌘S" title="Enregistrer">💾 Enregistrer</button>${ext.fullButton ? ext.fullButton('keynote') : ''}<button type="button" class="icon-button" data-kn-cmd="close" aria-label="Fermer">×</button></header>
            <div class="kn-main">
                <nav class="kn-rail" data-kn-rail aria-label="Outils">${[['data-kn-ins="text"', 'T', 'Une zone de texte'], ['data-kn-ins="shape:rect"', '◆', 'Une forme (les autres : menu ◆ Forme en haut)'], ['data-kn-ins="image"', '🖼️', 'Une image (médias ou ordinateur)'], ['data-kn-ins="table"', '▦', 'Un tableau'], ['data-kn-ins="chart"', '📊', 'Un graphique'], ['data-kn-ins="person:card"', '👤', 'La fiche d’une personne'], ['data-kn-ins="media"', '🎬', 'Une vidéo ou un son'], ['data-kn-cmd="playhere"', '⏵', 'Lire depuis cette diapositive (⌘↩)'], ['data-kn-cmd="presenter"', '🎤', 'Présentateur : plein écran, notes, chronomètre']].map(([a, i, t]) => `<button type="button" ${a} title="${esc(t)}" aria-label="${esc(t)}">${i}</button>`).join('')}</nav>
                <aside class="kn-nav"><div class="kn-navbar" data-tbg="kn-navbar" data-tbg-label="Diapositives (au-dessus de la liste)"><span class="kn-split"><button type="button" class="kn-nb is-main" data-kn-cmd="newslide" title="Nouvelle diapositive">＋ Diapositive</button><details class="kn-dd" data-kn-dd="layouts" data-tb-label="▾ Choisir la disposition"><summary class="kn-nb" title="Choisir la disposition">▾</summary><div class="kn-ddl kn-lays" data-kn-lays></div></details></span><button type="button" class="kn-nb" data-kn-cmd="dupslide" title="Dupliquer la diapositive (pour un déplacement magique)">⧉</button><button type="button" class="kn-nb" data-kn-cmd="skipslide" title="Sauter / ne plus sauter à la lecture">👁</button><button type="button" class="kn-nb" data-kn-cmd="section" title="Commencer une section (un groupe de diapositives) ici">§</button><button type="button" class="kn-nb" data-kn-cmd="delslide" title="Supprimer la diapositive">🗑</button></div><ol class="kn-nlist" data-kn-slides></ol></aside>
                <section class="kn-center"><div class="kn-canvas" data-kn-canvas><div class="kn-stage" data-kn-stage><div class="kn-slidebox" data-kn-slide></div><div class="kn-ov" data-kn-ov></div></div></div>
                    <div class="kn-status" data-tbg="kn-status" data-tbg-label="Barre du bas"><button type="button" class="kn-sb" data-kn-cmd="prevslide" title="Diapositive précédente (Page précédente)">‹</button><span class="kn-sbi" data-kn-idx></span><button type="button" class="kn-sb" data-kn-cmd="nextslide" title="Diapositive suivante (Page suivante)">›</button><label class="kn-sbi ed-old-hidden" data-kn-zoomw>Zoom <select data-kn-zoom>${opt([['fit', 'Ajuster'], ['.25', '25 %'], ['.5', '50 %'], ['.75', '75 %'], ['1', '100 %'], ['1.5', '150 %'], ['2', '200 %']], 'fit')}</select></label><label class="ui-toggle kn-sbi ed-old-hidden" data-kn-snapw title="Les objets se calent sur les bords, le centre et les autres objets (⌘ en glissant : sans aimant)"><input type="checkbox" data-kn-snap ${snap ? 'checked' : ''}><i></i>Aimanter</label><button type="button" class="kn-sb" data-kn-cmd="notes" title="Notes de l’orateur">📝 Notes</button><span class="kn-sbi kn-pos" data-kn-pos></span></div>
                    <div class="kn-notes" data-kn-notesbox hidden><textarea data-kn-notes placeholder="Notes de l’orateur : ce que tu veux dire sur cette diapositive (vues seulement dans la fenêtre du présentateur, et dans le PDF avec notes)…"></textarea></div></section>
                <aside class="kn-insp"><nav class="kn-tabs" data-tbg="kn-tabs" data-tbg-label="Onglets de l’inspecteur (à droite)">${[['format', '🖌', 'Format', 'Format de l’objet choisi'], ['anim', '✨', 'Animer', 'Transition et animations'], ['slide', '🖼', 'Diapo', 'La diapositive : disposition, fond, durée, notes'], ['objs', '🗂', 'Objets', 'Les objets de la diapositive (devant, derrière, cacher, verrouiller)'], ['doc', '⚙️', 'Document', 'Thème, polices, format, musique']].map(([k, i, l, t]) => `<button type="button" data-kn-tab="${k}" title="${esc(t)}" data-tb-label="${esc(`${i} ${l}`)}"><span>${i}</span>${esc(l)}</button>`).join('')}</nav><div class="kn-ibody" data-kn-ibody data-dnd-off></div></aside>
            </div></div>`;
        document.body.appendChild(dlg); dlg.showModal();
        ext.fullInit?.(dlg, 'keynote', true); knCss();
        const $ = s => dlg.querySelector(s), canvasEl = $('[data-kn-canvas]'), stage = $('[data-kn-stage]'), slideBox = $('[data-kn-slide]'), ov = $('[data-kn-ov]'), navList = $('[data-kn-slides]'), ibody = $('[data-kn-ibody]');
        // K19 : la colonne d'outils (insérer) ; K18 : la barre du bas commune — la diapositive et ses boutons à gauche, l'aide au milieu, 🧲 et le zoom à droite
        UI().editorRail?.($('[data-kn-rail]'), {breaks: ['[data-kn-cmd="playhere"]']});
        const knBar = UI().editorStatus?.({help: 'Clic : choisir un objet (⇧ : en plus) · double-clic : écrire dedans · glisser : déplacer · poignées : agrandir · rond : tourner',
            magnetTitle: 'Aimanter : les objets se calent sur les bords, le centre et les autres objets (⌘ en glissant : sans aimant)',
            magnet: {get: () => snap, set: v => { const c = $('[data-kn-snap]'); c.checked = !!v; c.dispatchEvent(new Event('change', {bubbles: true})); }},
            zoom: {get: () => K, set: k => { zoom = String(k); fitZoom(); }, fit: () => { zoom = 'fit'; fitZoom(); }, min: .1, max: 4}, wheel: canvasEl});
        if (knBar) { const st0 = $('.kn-status'); $('.kn-main').after(knBar); knBar.setWhere(st0); st0.classList.add('kn-status-in'); }
        const S = () => show.slides[cur], WH = () => dims(show), obj = oid => S()?.objs.find(o => o.id === oid), selObjs = () => (S()?.objs || []).filter(o => sel.has(o.id));
        const STATES = {'modifié': 'dirty', '✓ Enregistré': 'saved', 'Enregistrement…': 'saving'};
        const status = s => { const el = $('[data-kn-state]'); if (STATES[s] && UI().savedStatus) UI().savedStatus(el, STATES[s]); else el.textContent = s || ''; };
        /* ─── l'historique (annuler / rétablir) ─── */
        const snapOf = () => JSON.stringify({show, cur});
        let commitT = 0;
        function commit(now = true) { clearTimeout(commitT); if (!now) { commitT = setTimeout(() => commit(true), 450); return; } const s = snapOf(); if (hist[hi] === s) return; hist = hist.slice(0, hi + 1); hist.push(s); if (hist.length > 120) hist.shift(); hi = hist.length - 1; dirty = true; status('modifié'); }
        function restore(s) { const v = JSON.parse(s); show = v.show; cur = clamp(v.cur, 0, show.slides.length - 1); sel = new Set([...sel].filter(i => obj(i))); editing = null; paintAll(); dirty = true; status('modifié'); }
        const undo = () => { if (editing) stopEdit(); clearTimeout(commitT); if (hist[hi] !== snapOf()) commit(); if (hi > 0) { hi--; restore(hist[hi]); } };
        const redo = () => { if (hi < hist.length - 1) { hi++; restore(hist[hi]); } };
        /* ─── le zoom de la diapositive ─── */
        // 🤏 téléphone : zoom à deux doigts sur la diapositive (la page ne s'agrandit plus)
        try { window.LCNDA_UI?.bindPinch?.(canvasEl, f => { zoom = String(Math.max(.1, Math.min(4, K * f))); fitZoom(); }, {touchAction: 'pan-x pan-y'}); } catch (_) {} // un doigt fait défiler, deux doigts zooment
        function fitZoom() {
            const [W, H] = WH();
            K = zoom === 'fit' ? Math.max(.05, Math.min((canvasEl.clientWidth - 48) / W, (canvasEl.clientHeight - 48) / H)) : Number(zoom);
            stage.style.width = `${Math.round(W * K)}px`; stage.style.height = `${Math.round(H * K)}px`;
            slideBox.style.cssText = `width:${W}px;height:${H}px;transform:scale(${K});transform-origin:0 0`;
            paintOverlay(); knBar?.sync();
        }
        let navW = 0, navT = 0;
        const ro = new ResizeObserver(() => { if (zoom === 'fit') fitZoom(); const w = navList.clientWidth; if (navW && Math.abs(w - navW) > 8) { clearTimeout(navT); navT = setTimeout(paintNav, 120); } navW = w; }); ro.observe(canvasEl); ro.observe(navList);
        /* ─── dessiner ─── */
        function paintSlide() {
            const s = S(); if (!s) { slideBox.innerHTML = ''; return; }
            slideBox.innerHTML = renderSlide(show, s, 'edit');
            if (editing) { const o = obj(editing); if (o) enableEdit(o); else editing = null; }
            paintOverlay();
        }
        const TW = () => clamp((navList.clientWidth || 190) - 40, 80, 260);
        const thumbHtml = s => { const [W, H] = WH(), tw = TW(), k = tw / W; return `<div class="kn-nth" style="width:${tw}px;height:${Math.round(H * k)}px"><div class="kn-nthin" style="width:${W}px;height:${H}px;transform:scale(${k})">${renderBuilt(show, s, 'thumb')}</div></div>`; };
        function paintNav() {
            let html = '', hide = false;
            show.slides.forEach((s, i) => {
                if (s.section) { hide = collapsed.has(s.id); html += `<li class="kn-nsec" data-kn-navsec="${i}"><button type="button" class="kn-nsec-t" data-kn-fold="${esc(s.id)}" title="Replier / déplier la section">${hide ? '▸' : '▾'}</button><span>${esc(s.section)}</span><small>${(() => { let n = 1; for (let j = i + 1; j < show.slides.length && !show.slides[j].section; j++) n++; return n; })()}</small></li>`; }
                const folded = hide && !s.section;
                html += `<li class="kn-ni${i === cur ? ' is-cur' : ''}${s.skip ? ' is-skip' : ''}${folded ? ' is-folded' : ''}" data-kn-i="${i}" draggable="true"><span class="kn-nnum">${i + 1}</span>${thumbHtml(s)}<span class="kn-nbadge">${s.skip ? '<i title="Sautée à la lecture">⤼</i>' : ''}${s.builds?.length ? '<i title="Animations">✨</i>' : ''}${s.trans?.type && s.trans.type !== 'none' ? `<i title="Transition : ${esc((TRANS.find(t => t[0] === s.trans.type) || [])[1] || '')}">◧</i>` : ''}${s.notes ? '<i title="Notes de l’orateur">📝</i>' : ''}</span></li>`;
            });
            navList.innerHTML = html;
            $('[data-kn-idx]').textContent = `${cur + 1} / ${show.slides.length}`;
            navList.querySelector('.is-cur')?.scrollIntoView({block: 'nearest'});
        }
        let thumbT = 0;
        const paintThumb = () => { clearTimeout(thumbT); thumbT = setTimeout(() => { const li = navList.querySelector(`[data-kn-i="${cur}"] .kn-nth`); if (li && S()) li.outerHTML = thumbHtml(S()); }, 250); };
        function bbox(list) { const xs = list.flatMap(o => [o.x, o.x + o.w]), ys = list.flatMap(o => [o.y, o.y + o.h]); const x = Math.min(...xs), y = Math.min(...ys); return {x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y}; }
        let guides = [], marquee = null;
        function paintOverlay() {
            const objs = selObjs(); let h = '';
            const box = (o, cls, inner = '') => `<div class="${cls}" style="left:${r1(o.x * K)}px;top:${r1(o.y * K)}px;width:${r1(o.w * K)}px;height:${r1(o.h * K)}px;transform:rotate(${r1(o.rot)}deg)">${inner}</div>`;
            const handles = () => HANDLES.map(([k]) => `<span class="kn-h kn-h-${k}" data-kn-h="${k}"></span>`).join('');
            objs.forEach(o => { h += box(o, `kn-selbox${o.lock ? ' is-lock' : ''}${editing === o.id ? ' is-edit' : ''}`, o.lock ? '<span class="kn-lockb">🔒</span>' : ''); });
            if (!editing && objs.length === 1 && !objs[0].lock) h += box(objs[0], 'kn-handles', handles() + '<span class="kn-h kn-h-rot" data-kn-h="rot" title="Tourner (⇧ : de 15° en 15°)"></span>');
            else if (!editing && objs.length > 1 && objs.every(o => !o.lock)) h += box({...bbox(objs), rot: 0}, 'kn-handles is-multi', handles());
            guides.forEach(g => { h += g.x !== undefined ? `<div class="kn-guide is-v" style="left:${r1(g.x * K)}px"></div>` : `<div class="kn-guide is-h" style="top:${r1(g.y * K)}px"></div>`; });
            if (marquee) h += `<div class="kn-marquee" style="left:${r1(marquee.x * K)}px;top:${r1(marquee.y * K)}px;width:${r1(marquee.w * K)}px;height:${r1(marquee.h * K)}px"></div>`;
            ov.innerHTML = h;
            const o = objs[0]; $('[data-kn-pos]').textContent = objs.length === 1 ? `x ${Math.round(o.x)} · y ${Math.round(o.y)} · ${Math.round(o.w)} × ${Math.round(o.h)}${o.rot ? ` · ${Math.round(o.rot)}°` : ''}` : objs.length ? `${objs.length} objets` : '';
        }
        function paintAll() { fitZoom(); paintSlide(); paintNav(); paintInsp(); $('[data-kn-notes]').value = S()?.notes || ''; }
        const afterSel = () => { paintOverlay(); paintInsp(); };
        const touch = (deep = false) => { paintSlide(); paintThumb(); commit(false); if (deep) paintInsp(); };
        /* ─── écrire dans un texte, une forme, un tableau ─── */
        const objEl = oid => slideBox.querySelector(`[data-kn-o="${CSS.escape(oid)}"]`);
        function enableEdit(o) {
            const el = objEl(o.id); if (!el) return null; el.classList.add('is-editing');
            if (o.t === 'table') { el.querySelectorAll('[data-kn-cell]').forEach(c => { c.contentEditable = 'true'; }); return el.querySelector('[data-kn-cell]'); }
            const t = o.t === 'text' ? el.querySelector('.kn-txi') : el.querySelector('.kn-stx'); if (!t) return null;
            t.querySelector('.kn-ph')?.remove();
            if (o.t === 'shape') { try { t.contentEditable = 'plaintext-only'; } catch (_) { t.contentEditable = 'true'; } } else t.contentEditable = 'true';
            return t;
        }
        const editTarget = () => { const el = editing ? objEl(editing) : null; return el?.querySelector('[contenteditable="true"], [contenteditable="plaintext-only"]') || null; };
        function startEdit(o, ev) {
            if (!o || o.lock || !['text', 'shape', 'table'].includes(o.t)) return;
            if (editing && editing !== o.id) stopEdit();
            sel = new Set([o.id]); editing = o.id; if (o.t === 'shape') o._editing = true;
            paintSlide();
            const el = objEl(o.id); let t = editTarget(); if (!t) return;
            if (o.t === 'table' && ev) { const c = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-kn-cell]'); if (c && el.contains(c)) t = c; }
            t.focus();
            const s = getSelection(); let r = ev && document.caretRangeFromPoint ? document.caretRangeFromPoint(ev.clientX, ev.clientY) : null;
            if (!r || !t.contains(r.startContainer)) { r = document.createRange(); r.selectNodeContents(t); if (ev) r.collapse(false); }
            s.removeAllRanges(); s.addRange(r); savedRange = r.cloneRange();
            paintInsp();
        }
        function stopEdit() {
            const o = obj(editing), el = o ? objEl(o.id) : null; editing = null;
            if (o && el) {
                if (o.t === 'text') { const t = el.querySelector('.kn-txi'); if (t) { const h = cleanHtml(t.innerHTML); o.html = h.replace(/<[^>]*>|&nbsp;|\s/g, '') ? h : ''; const need = t.offsetHeight + 2 * num(o.pad, 8); if (need > o.h + 1) o.h = Math.round(need); } }
                if (o.t === 'shape') { const t = el.querySelector('.kn-stx'); if (t) o.text = t.innerText.replace(/\n+$/, '').slice(0, 4000); }
                if (o.t === 'table') { o.rows = Array.isArray(o.rows) ? o.rows : []; el.querySelectorAll('[data-kn-cell]').forEach(c => { const [i, j] = c.dataset.knCell.split(':').map(Number); o.rows[i] = Array.isArray(o.rows[i]) ? o.rows[i] : []; o.rows[i][j] = c.innerText.replace(/\n$/, '').slice(0, 600); }); }
            }
            if (o) delete o._editing;
            savedRange = null; try { getSelection()?.removeAllRanges(); } catch (_) {}
            paintSlide(); paintThumb(); commit(); paintInsp();
        }
        document.addEventListener('selectionchange', () => { if (!editing || closed) return; const t = editTarget(), s = getSelection(); if (t && s.rangeCount && t.contains(s.getRangeAt(0).commonAncestorContainer)) savedRange = s.getRangeAt(0).cloneRange(); }, {signal: docAc.signal});
        function execRich(cmd, val) {
            document.execCommand('styleWithCSS', false, true);
            if (cmd === 'fontSize') { document.execCommand('fontSize', false, '7'); slideBox.querySelectorAll('font[size="7"], [style*="xxx-large"]').forEach(x => { if (x.tagName === 'FONT') { const sp = document.createElement('span'); sp.style.fontSize = val + 'px'; sp.append(...x.childNodes); x.replaceWith(sp); } else x.style.fontSize = val + 'px'; }); return; }
            document.execCommand(cmd, false, val ?? null);
        }
        function rich(cmd, val) {
            if (editing && obj(editing)?.t === 'text') { const t = editTarget(); if (!t) return; t.focus(); if (savedRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); } execRich(cmd, val); return; }
            const list = selObjs().filter(o => o.t === 'text'); if (!list.length) return toast('Choisis une zone de texte.');
            list.forEach(o => { const t = objEl(o.id)?.querySelector('.kn-txi'); if (!t) return; t.querySelector('.kn-ph')?.remove(); if (!t.textContent.trim()) return; t.contentEditable = 'true'; t.focus(); const r = document.createRange(); r.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(r); execRich(cmd, val); o.html = cleanHtml(t.innerHTML); t.contentEditable = 'false'; });
            try { getSelection().removeAllRanges(); } catch (_) {} touch();
        }
        const stripStyle = (o, prop) => { if (!o.html) return; const d = document.createElement('div'); d.innerHTML = cleanHtml(o.html); d.querySelectorAll('[style]').forEach(x => { x.style.removeProperty(prop); if (!x.getAttribute('style')) x.removeAttribute('style'); }); o.html = cleanHtml(d.innerHTML); };
        /* ─── choisir, déplacer, agrandir, tourner (avec l'aimant) ─── */
        const pt = e => { const r = stage.getBoundingClientRect(); return {x: (e.clientX - r.left) / K, y: (e.clientY - r.top) / K}; };
        const groupIds = o => o.g ? S().objs.filter(x => x.g === o.g).map(x => x.id) : [o.id];
        const moveEl = o => { const el = objEl(o.id); if (el) { el.style.left = o.x + 'px'; el.style.top = o.y + 'px'; el.style.width = o.w + 'px'; el.style.height = o.h + 'px'; el.style.transform = `rotate(${o.rot || 0}deg)`; } };
        function snapBox(b, others, axes = 'xy') {
            const [W, H] = WH(), thr = 7 / K, xs = [0, W / 2, W], ys = [0, H / 2, H];
            others.forEach(o => { xs.push(o.x, o.x + o.w / 2, o.x + o.w); ys.push(o.y, o.y + o.h / 2, o.y + o.h); });
            const best = (vals, cands) => { let r = null; vals.forEach(v => cands.forEach(c => { const d = c - v; if (Math.abs(d) <= thr && (!r || Math.abs(d) < Math.abs(r.d))) r = {d, at: c}; })); return r; };
            const bx = axes.includes('x') ? best([b.x, b.x + b.w / 2, b.x + b.w], xs) : null, by = axes.includes('y') ? best([b.y, b.y + b.h / 2, b.y + b.h], ys) : null;
            return {dx: bx ? bx.d : 0, dy: by ? by.d : 0, guides: [...(bx ? [{x: bx.at}] : []), ...(by ? [{y: by.at}] : [])]};
        }
        function drag(e, onMove, onUp) {
            e.preventDefault(); const pid = e.pointerId; try { stage.setPointerCapture(pid); } catch (_) {}
            const mv = ev => onMove(ev), up = ev => { stage.removeEventListener('pointermove', mv); stage.removeEventListener('pointerup', up); stage.removeEventListener('pointercancel', up); try { stage.releasePointerCapture(pid); } catch (_) {} guides = []; marquee = null; onUp(ev); };
            stage.addEventListener('pointermove', mv); stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
        }
        function startMove(e, p0) {
            let objs = selObjs().filter(o => !o.lock); if (!objs.length) return;
            let start = objs.map(o => [o, o.x, o.y]), moved = false; const bb0 = bbox(objs);
            drag(e, ev => {
                const p = pt(ev); let dx = p.x - p0.x, dy = p.y - p0.y;
                if (!moved && Math.hypot(dx, dy) * K < 3) return;
                if (!moved) { moved = true; if (e.altKey) { const s = S(), map = new Map(); const cl = objs.map(o => { const c = cloneObj(o); map.set(o.id, c.id); return c; }); s.objs.push(...cl); sel = new Set(cl.map(c => c.id)); objs = cl; start = cl.map(o => [o, o.x, o.y]); paintSlide(); } }
                if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
                guides = [];
                if (snap && !(ev.metaKey || ev.ctrlKey)) { const r = snapBox({x: bb0.x + dx, y: bb0.y + dy, w: bb0.w, h: bb0.h}, S().objs.filter(o => !sel.has(o.id) && !o.hide)); dx += r.dx; dy += r.dy; guides = r.guides; }
                start.forEach(([o, x, y]) => { o.x = Math.round(x + dx); o.y = Math.round(y + dy); moveEl(o); });
                paintOverlay();
            }, () => { if (moved) { paintSlide(); paintThumb(); commit(); paintInsp(); } else paintOverlay(); });
        }
        function startHandle(e, k, p0) {
            const objs = selObjs().filter(o => !o.lock); if (!objs.length) return;
            if (k === 'rot') {
                const o = objs[0], c = {x: o.x + o.w / 2, y: o.y + o.h / 2}, a0 = Math.atan2(p0.y - c.y, p0.x - c.x), r0 = num(o.rot);
                return drag(e, ev => { const p = pt(ev); let r = r0 + (Math.atan2(p.y - c.y, p.x - c.x) - a0) * 180 / Math.PI; r = ((r % 360) + 540) % 360 - 180; if (ev.shiftKey) r = Math.round(r / 15) * 15; else if (Math.abs(r - Math.round(r / 90) * 90) < 3) r = Math.round(r / 90) * 90; o.rot = Math.round(r * 10) / 10; moveEl(o); paintOverlay(); }, () => { paintSlide(); paintThumb(); commit(); paintInsp(); });
            }
            const [, sx, sy] = HANDLES.find(h => h[0] === k);
            if (objs.length === 1) {
                const o = objs[0], rad = num(o.rot) * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad), w0 = o.w, h0 = o.h, c0 = {x: o.x + w0 / 2, y: o.y + h0 / 2}, ratio = w0 / h0;
                const keepDef = ['image', 'person', 'video', 'chart'].includes(o.t) && sx && sy;
                return drag(e, ev => {
                    const p = pt(ev), dx = p.x - p0.x, dy = p.y - p0.y, lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos, fromC = ev.altKey ? 2 : 1;
                    let nw = Math.max(6, w0 + sx * lx * fromC), nh = Math.max(6, h0 + sy * ly * fromC);
                    if (ev.shiftKey !== keepDef && sx && sy) { const f = Math.max(nw / w0, nh / h0); nw = w0 * f; nh = h0 * f; } else if (ev.shiftKey && !sy) nh = nw / ratio; else if (ev.shiftKey && !sx) nw = nh * ratio;
                    const cl = ev.altKey ? 0 : sx * (nw - w0) / 2, ct = ev.altKey ? 0 : sy * (nh - h0) / 2, cx = c0.x + cl * cos - ct * sin, cy = c0.y + cl * sin + ct * cos;
                    o.w = Math.round(nw); o.h = Math.round(nh); o.x = Math.round(cx - nw / 2); o.y = Math.round(cy - nh / 2); moveEl(o); paintOverlay();
                }, () => { paintSlide(); paintThumb(); commit(); paintInsp(); });
            }
            const b0 = bbox(objs), st = objs.map(o => [o, {...o}]);
            drag(e, ev => {
                const p = pt(ev), dx = p.x - p0.x, dy = p.y - p0.y; let nb = {...b0};
                if (sx > 0) nb.w = b0.w + dx; if (sx < 0) { nb.x = b0.x + dx; nb.w = b0.w - dx; } if (sy > 0) nb.h = b0.h + dy; if (sy < 0) { nb.y = b0.y + dy; nb.h = b0.h - dy; }
                nb.w = Math.max(10, nb.w); nb.h = Math.max(10, nb.h); if (ev.shiftKey) { const f = Math.max(nb.w / b0.w, nb.h / b0.h); nb.w = b0.w * f; nb.h = b0.h * f; if (sx < 0) nb.x = b0.x + b0.w - nb.w; if (sy < 0) nb.y = b0.y + b0.h - nb.h; }
                const fx = nb.w / b0.w, fy = nb.h / b0.h;
                st.forEach(([o, o0]) => { o.x = Math.round(nb.x + (o0.x - b0.x) * fx); o.y = Math.round(nb.y + (o0.y - b0.y) * fy); o.w = Math.max(4, Math.round(o0.w * fx)); o.h = Math.max(4, Math.round(o0.h * fy)); moveEl(o); }); paintOverlay();
            }, () => { paintSlide(); paintThumb(); commit(); paintInsp(); });
        }
        function startMarquee(e, p0) {
            const add = e.shiftKey || e.metaKey || e.ctrlKey, before = new Set(sel); let moved = false;
            drag(e, ev => { const p = pt(ev); if (!moved && Math.hypot(p.x - p0.x, p.y - p0.y) * K < 4) return; moved = true;
                marquee = {x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y)};
                sel = new Set(add ? before : []); S().objs.forEach(o => { if (o.x < marquee.x + marquee.w && o.x + o.w > marquee.x && o.y < marquee.y + marquee.h && o.y + o.h > marquee.y) groupIds(o).forEach(i => sel.add(i)); }); paintOverlay(); },
            () => { if (!moved && !add) sel = new Set(); afterSel(); });
        }
        stage.addEventListener('pointerdown', e => {
            if (e.button !== 0) return; navFocus = false;
            dlg.querySelectorAll('details.kn-dd[open]').forEach(d => d.removeAttribute('open'));
            if (editing) { if (e.target.closest(`[data-kn-o="${CSS.escape(editing)}"]`)) return; stopEdit(); }
            const p0 = pt(e), h = e.target.closest('[data-kn-h]');
            if (h) return startHandle(e, h.dataset.knH, p0);
            const oEl = e.target.closest('[data-kn-o]'), o = oEl && obj(oEl.dataset.knO);
            if (o) {
                const ids = groupIds(o);
                if (e.shiftKey || e.metaKey || e.ctrlKey) { const all = ids.every(i => sel.has(i)); ids.forEach(i => all ? sel.delete(i) : sel.add(i)); afterSel(); return; }
                if (!sel.has(o.id)) { sel = new Set(ids); afterSel(); }
                if (o.lock) { e.preventDefault(); return; }
                return startMove(e, p0);
            }
            startMarquee(e, p0);
        });
        const hitObj = e => (e.target.closest?.('[data-kn-o]') && slideBox.contains(e.target)) ? e.target.closest('[data-kn-o]') : document.elementsFromPoint(e.clientX, e.clientY).map(x => x.closest?.('[data-kn-o]')).find(x => x && slideBox.contains(x)) || null; // le pointeur capturé fait arriver le double-clic sur la scène
        stage.addEventListener('dblclick', e => {
            const oEl = hitObj(e), o = oEl && obj(oEl.dataset.knO); if (!o || o.lock) return;
            if (['text', 'shape', 'table'].includes(o.t)) return startEdit(o, e);
            if (o.t === 'image') return insertImage(o);
            if (o.t === 'person') return repickPerson(o);
            if (['video', 'audio'].includes(o.t)) return replaceAV(o);
            if (o.t === 'chart') { tab = 'format'; paintInsp(); ibody.querySelector('[data-kn-x="cdata"]')?.focus(); }
        });
        /* ─── insérer ─── */
        const center = (w, h) => { const [W, H] = WH(); return {x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w: Math.round(w), h: Math.round(h)}; };
        function addObj(o, edit = false) { S().objs.push(o); sel = new Set([o.id]); canvasEl.focus({preventScroll: true}); if (tab !== 'format' && tab !== 'anim') tab = 'format'; paintSlide(); paintThumb(); commit(); paintInsp(); if (edit) startEdit(o); }
        async function insertImage(target) {
            const m = await ext.pickImage?.({eyebrow: 'PRÉSENTATION', title: 'Choisir une image', filters: false}); if (!m) return;
            const filename = m.filename, [nw, nh] = await imgSize(mediaUrl(filename)), [W, H] = WH();
            const one = selObjs().length === 1 ? selObjs()[0] : null;
            const ph = target || (one?.t === 'image' && !srcOf(one) ? one : null) || (!sel.size ? S().objs.find(o => o.t === 'image' && !srcOf(o)) : null);
            if (ph) { ph.filename = filename; ph.media_id = Number(m.id) || 0; delete ph.src; ph.name = ph.name || m.title || ''; sel = new Set([ph.id]); touch(true); return; }
            const k = Math.min(W * .6 / nw, H * .7 / nh); addObj({id: uid(), t: 'image', filename, media_id: Number(m.id) || 0, name: m.title || '', fit: 'cover', ...center(nw * k, nh * k)});
        }
        async function repickPerson(o) { const pid = await askPerson('Quelle personne ?'); if (!pid) return; await setPerson(o, pid); }
        async function setPerson(o, pid) { status('Lecture de la fiche…'); try { o.pid = pid; o.data = await personData(pid); if (!o.name || o.name === o._oldName) o.name = o.data.name; status(''); touch(true); } catch (e) { status(''); toast(e.message, 'error'); } }
        async function replaceAV(o) { const m = await pickAV('Changer la vidéo ou le son'); if (!m) return; o.t = m.kind; o.filename = m.filename; o.media_id = m.media_id; o.name = m.title || o.name; touch(true); }
        async function insert(k) {
            if (editing) stopEdit();
            const [W, H] = WH();
            if (k === 'text') return addObj({id: uid(), t: 'text', role: 'body', ...center(W * .5, H * .14), size: Math.round(H * .045), html: ''}, true);
            if (k.startsWith('shape:')) { const kind = k.slice(6), line = kind === 'line' || kind === 'arrowline'; return addObj({id: uid(), t: 'shape', kind, ...center(line ? W * .3 : H * .3, line ? 40 : H * .3), size: Math.round(H * .04), ...(line ? {sw: 6} : {})}); }
            if (k === 'image') return insertImage();
            if (k === 'table') return addObj({id: uid(), t: 'table', ...center(W * .6, H * .36), head: true, size: Math.round(H * .03), rows: [['Année', 'Lieu', 'Événement'], ['1850', 'Tulle', 'Naissance'], ['1875', 'Brive', 'Mariage'], ['1920', 'Tulle', 'Décès']]});
            if (k === 'chart') { const R = ext.diagramRender, smp = R?.KINDS?.columns?.sample?.() || {rows: [], series: []}; return addObj({id: uid(), t: 'chart', ...center(W * .6, H * .58), spec: {kind: 'columns', ...smp}}); }
            if (k.startsWith('person:')) {
                const view = k.slice(7), pid = await askPerson(view === 'tree' ? 'Le petit arbre de quelle personne ?' : view === 'timeline' ? 'La frise de la vie de qui ?' : 'Quelle personne ?'); if (!pid) return;
                status('Lecture de la fiche…');
                try { const data = await personData(pid), g = view === 'photo' ? center(H * .45, H * .6) : view === 'tree' ? center(W * .7, W * .42) : view === 'timeline' ? center(W * .84, W * .27) : center(W * .58, H * .42); status(''); addObj({id: uid(), t: 'person', view, pid, data, name: data.name, size: Math.round(H * .03), ...g}); }
                catch (e) { status(''); toast(e.message, 'error'); } return;
            }
            if (k === 'media') { const m = await pickAV(); if (!m) return; return addObj({id: uid(), t: m.kind, filename: m.filename, media_id: m.media_id, name: m.title || '', controls: m.kind === 'video', autoplay: m.kind === 'audio', ...(m.kind === 'video' ? center(W * .6, W * .6 * 9 / 16) : center(H * .14, H * .14))}); }
        }
        /* ─── disposer ─── */
        function align(k) {
            const objs = selObjs().filter(o => !o.lock); if (!objs.length) return toast('Choisis un ou plusieurs objets.');
            const [W, H] = WH(), b = objs.length === 1 ? {x: 0, y: 0, w: W, h: H} : bbox(objs);
            if (k.startsWith('dist')) { if (objs.length < 3) return toast('Choisis au moins trois objets pour les répartir.'); const hz = k === 'dist-h', list = objs.slice().sort((a, c) => hz ? a.x - c.x : a.y - c.y), tot = list.reduce((a, o) => a + (hz ? o.w : o.h), 0), gap = ((hz ? b.w : b.h) - tot) / (list.length - 1); let p = hz ? b.x : b.y; list.forEach(o => { if (hz) o.x = Math.round(p); else o.y = Math.round(p); p += (hz ? o.w : o.h) + gap; }); }
            else objs.forEach(o => { if (k === 'left') o.x = b.x; if (k === 'right') o.x = b.x + b.w - o.w; if (k === 'hcenter') o.x = Math.round(b.x + (b.w - o.w) / 2); if (k === 'top') o.y = b.y; if (k === 'bottom') o.y = b.y + b.h - o.h; if (k === 'vcenter') o.y = Math.round(b.y + (b.h - o.h) / 2); });
            touch(true);
        }
        function order(k) {
            const s = S(); if (!sel.size) return; const inSel = s.objs.filter(o => sel.has(o.id)), rest = s.objs.filter(o => !sel.has(o.id));
            if (k === 'front') s.objs = [...rest, ...inSel]; else if (k === 'back') s.objs = [...inSel, ...rest];
            else { const a = s.objs.slice(), step = k === 'forward' ? 1 : -1, idx = a.map((o, i) => sel.has(o.id) ? i : -1).filter(i => i >= 0); (step > 0 ? idx.reverse() : idx).forEach(i => { const j = i + step; if (j < 0 || j >= a.length || sel.has(a[j].id)) return; [a[i], a[j]] = [a[j], a[i]]; }); s.objs = a; }
            touch(true);
        }
        function delSel() { if (!sel.size) return; const s = S(); s.objs = s.objs.filter(o => !sel.has(o.id)); s.builds = (s.builds || []).filter(b => !sel.has(b.obj)); sel = new Set(); touch(true); }
        function copySel(cut = false) { if (!sel.size) return; KN_CLIP.objs = JSON.parse(JSON.stringify(selObjs())); KN_CLIP.slides = null; KN_CLIP.from = S().id; if (cut) delSel(); else toast(`${KN_CLIP.objs.length} objet${KN_CLIP.objs.length > 1 ? 's' : ''} copié${KN_CLIP.objs.length > 1 ? 's' : ''}.`); }
        function paste() {
            if (KN_CLIP.slides) { const cl = KN_CLIP.slides.map(s => ({...JSON.parse(JSON.stringify(s)), id: uid('s')})); show.slides.splice(cur + 1, 0, ...cl); cur++; sel = new Set(); paintAll(); commit(); return; }
            if (!KN_CLIP.objs?.length) return;
            const same = KN_CLIP.from === S().id, gmap = new Map(), cl = KN_CLIP.objs.map(o => { const c = cloneObj(o); if (same) { c.x += 24; c.y += 24; } if (c.g) { if (!gmap.has(c.g)) gmap.set(c.g, uid('g')); c.g = gmap.get(c.g); } return c; });
            S().objs.push(...cl); sel = new Set(cl.map(c => c.id)); if (same) KN_CLIP.objs = JSON.parse(JSON.stringify(cl)); touch(true);
        }
        function dupSel() { if (!sel.size) return; const cl = selObjs().map(o => { const c = cloneObj(o); c.x += 24; c.y += 24; return c; }); S().objs.push(...cl); sel = new Set(cl.map(c => c.id)); touch(true); }
        function group(on) { const objs = selObjs(); if (on) { if (objs.length < 2) return toast('Choisis au moins deux objets à grouper.'); const g = uid('g'); objs.forEach(o => { o.g = g; }); } else objs.forEach(o => { delete o.g; }); touch(true); }
        function connectSel() { const objs = selObjs().filter(o => o.t !== 'link'); if (objs.length !== 2) return toast('Choisis deux objets (⇧ clic) : un trait les reliera, et les suivra quand tu les déplaces.');
            const l = {id: uid(), t: 'link', from: objs[0].id, to: objs[1].id, kind: 'straight', arrow: 'end', sw: 4, x: 0, y: 0, w: 10, h: 10}; S().objs.unshift(l); sel = new Set([l.id]); touch(true); }
        async function mergeSel() { const objs = selObjs().filter(o => o.t === 'shape' && o.kind !== 'line' && o.kind !== 'arrowline'); if (objs.length !== 2) return toast('Choisis deux formes (⇧ clic) à fusionner.');
            const op = await new Promise(res => ext.openDialog({eyebrow: 'FORMES', title: '⊕ Fusionner deux formes', submitLabel: 'Fusionner', body: `<p class="muted">La 1re forme est celle du dessous. Les deux restent gardées dans la nouvelle forme.</p><label>Comment<select name="op">${MERGE_OPS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>`, onSubmit: f => res(f.elements.op.value)}));
            if (!op) return; const s = S(), [a, b] = objs.sort((p, q) => s.objs.indexOf(p) - s.objs.indexOf(q)), x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x + a.w, b.x + b.w), y1 = Math.max(a.y + a.h, b.y + b.h);
            const part = o => ({kind: o.kind || 'rect', x: o.x - x0, y: o.y - y0, w: o.w, h: o.h, ...(o.points ? {points: o.points} : {}), ...(o.inner ? {inner: o.inner} : {}), ...(o.radius ? {radius: o.radius} : {})});
            const c = {id: uid(), t: 'shape', kind: 'combo', mop: op, parts: [part(a), part(b)], x: x0, y: y0, w: x1 - x0, h: y1 - y0, ...(a.fill ? {fill: a.fill} : {})};
            const i = s.objs.indexOf(a); s.objs = s.objs.filter(o => o !== a && o !== b); s.objs.splice(Math.min(i, s.objs.length), 0, c);
            s.builds = (s.builds || []).filter(x => x.obj !== a.id && x.obj !== b.id); sel = new Set([c.id]); touch(true); }
        async function masterCmd() {
            const objs = selObjs().filter(o => o.t !== 'link'); show.master = show.master && Array.isArray(show.master.objs) ? show.master : {objs: []};
            if (objs.length) { const ids = new Set(objs.map(o => o.id)); show.master.objs.push(...objs.map(o => { const c = JSON.parse(JSON.stringify(o)); delete c._editing; return c; })); S().objs = S().objs.filter(o => !ids.has(o.id)); S().builds = (S().builds || []).filter(b => !ids.has(b.obj)); sel = new Set(); touch(true);
                return toast(`🗂 Sur toutes les diapositives (masque). Dans un texte, « {n} » donne le numéro de la diapositive et « {total} » leur nombre. 🗂 sans rien choisir : le modifier.`, 'success'); }
            if (!show.master.objs.length) return toast('Le masque est vide : choisis des objets (logo, pied de page, numéro « {n} »…) puis 🗂 pour les mettre sur toutes les diapositives.');
            const what = await new Promise(res => ext.openDialog({eyebrow: 'PRÉSENTATION', title: '🗂 Masque des diapositives', submitLabel: 'OK', body: `<p class="muted">${show.master.objs.length} objet${show.master.objs.length > 1 ? 's' : ''} sur toutes les diapositives.</p><label>Que faire<select name="w"><option value="edit">Les ramener sur cette diapositive pour les modifier (puis 🗂 pour les remettre)</option><option value="skip">${S().noMaster ? 'Remontrer le masque sur cette diapositive' : 'Ne pas montrer le masque sur cette diapositive'}</option><option value="clear">Vider le masque</option></select></label>`, onSubmit: f => res(f.elements.w.value)}));
            if (what === 'edit') { const back = show.master.objs.map(o => ({...o})); show.master.objs = []; S().objs.push(...back); sel = new Set(back.map(o => o.id)); }
            else if (what === 'skip') S().noMaster = !S().noMaster; else if (what === 'clear') show.master.objs = []; else return;
            touch(true); }
        function lockSel() { const objs = selObjs(); if (!objs.length) return; const on = objs.some(o => !o.lock); objs.forEach(o => { if (on) o.lock = true; else delete o.lock; }); touch(true); }
        /* ─── les diapositives ─── */
        function goSlide(i) { if (editing) stopEdit(); cur = clamp(i, 0, show.slides.length - 1); sel = new Set(); paintSlide(); paintNav(); paintInsp(); $('[data-kn-notes]').value = S()?.notes || ''; }
        function addSlide(layout) { if (editing) stopEdit(); const s = newSlide(show, layout || prefs().layout || 'title-content'); show.slides.splice(cur + 1, 0, s); goSlide(cur + 1); commit(); }
        function dupSlide() { const s = JSON.parse(JSON.stringify(S())); s.id = uid('s'); s.section = ''; s.builds = (s.builds || []).map(b => ({...b, id: uid('b')})); show.slides.splice(cur + 1, 0, s); goSlide(cur + 1); commit(); toast('Diapositive dupliquée : déplace les objets puis choisis la transition « Déplacement magique » (onglet ✨ Animer).'); }
        function delSlide() { if (show.slides.length <= 1) { show.slides = [newSlide(show, 'blank')]; cur = 0; } else { show.slides.splice(cur, 1); cur = Math.min(cur, show.slides.length - 1); } sel = new Set(); paintAll(); commit(); }
        /* ─── l'inspecteur (à droite) : Format, Animer, Diapositive, Objets, Document ─── */
        const hex6 = c => { c = String(c || ''); if (/^#[0-9a-f]{6}$/i.test(c)) return c; if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).replace(/./g, x => x + x); if (/^#[0-9a-f]{8}$/i.test(c)) return c.slice(0, 7); if (/^#[0-9a-f]{4}$/i.test(c)) return '#' + c.slice(1, 4).replace(/./g, x => x + x); return '#000000'; };
        const F = (label, html, cls = '') => `<label class="kn-f${cls ? ' ' + cls : ''}"><span>${label}</span>${html}</label>`;
        // C8 : un réglage difficile, avec sa bulle « ? » (une div, pas un label : la bulle ne prend pas le clic du champ)
        const FH = (label, html, tip) => `<div class="kn-f"><span data-help="${esc(tip)}" data-help-faq="présentation">${label}</span>${html}</div>`;
        const of = (k, kind = '') => `data-kn-f="${k}"${kind ? ` data-kn-k="${kind}"` : ''}`;
        const iNum = (attr, v, a = '') => `<input type="number" ${attr} data-kn-k="num" value="${esc(v === undefined || v === null ? '' : r1(v))}" ${a}>`;
        const iRange = (attr, v, min, max, step = 1) => `<span class="kn-rng"><input type="range" ${attr} data-kn-k="num" min="${min}" max="${max}" step="${step}" value="${esc(v)}"><output>${esc(v)}</output></span>`;
        const iColor = (attr, v, clear = '') => `<span class="kn-colw"><input type="color" ${attr} value="${esc(hex6(v))}">${clear ? `<button type="button" class="kn-ib" data-kn-x="${clear}" title="Aucune couleur">∅</button>` : ''}</span>`;
        const iChk = (attr, v, label) => `<label class="ui-toggle kn-chk"><input type="checkbox" ${attr} data-kn-k="bool" ${v ? 'checked' : ''}><i></i>${label}</label>`;
        const iSel = (attr, list, v) => `<select ${attr}>${opt(list, v)}</select>`;
        const iTxt = (attr, v, ph = '') => `<input type="text" ${attr} data-kn-k="text" value="${esc(v ?? '')}" placeholder="${esc(ph)}" maxlength="200">`;
        const B = (x, label, title = '') => `<button type="button" class="kn-ib" data-kn-x="${esc(x)}" title="${esc(title || label.replace(/<[^>]+>/g, ''))}">${label}</button>`;
        const fontBtn = (to, v, ph) => `<button type="button" class="kn-fontbtn" data-kn-x="fontpick:${to}" title="Choisir la police (recherche, récentes, polices de l’ordinateur)" style="${esc(v ? `font-family:${fontCss(v)}` : '')}"><span>${esc(v ? fontOk(v) : ph)}</span><span aria-hidden="true">▾</span></button>`;
        const C = (cmd, label, title = '') => `<button type="button" class="kn-ib" data-kn-cmd="${esc(cmd)}" title="${esc(title || label)}">${label}</button>`;
        const objLabel = o => !o ? '?' : o.name || (o.t === 'text' ? cut(htmlToText(o.html), 40) || PH[o.role] || 'Texte' : o.t === 'shape' ? `${(SHAPES.find(x => x[0] === o.kind) || SHAPES[0])[1]}${o.text ? ` « ${cut(o.text, 20)} »` : ''}` : o.t === 'person' ? o.data?.name || 'Personne' : TYPE_LABEL[o.t]);
        const fxL = k => (FX.find(x => x[0] === k) || FX[1])[1], startL = k => (STARTS.find(x => x[0] === k) || STARTS[0])[1];
        const chartText = sp => { const se = (sp?.series?.length ? sp.series : [{name: 'Valeur'}]).map(s => s.name || 'Valeur'); return [['Catégorie', ...se].join(' ; '), ...(sp?.rows || []).map(r => [r.label ?? '', ...se.map((_, j) => r['s' + j] ?? '')].join(' ; '))].join('\n'); };
        function paneFormat() {
            const objs = selObjs(), o = objs[0], one = objs.length === 1, types = new Set(objs.map(x => x.t)), th = themeOf(show);
            const has = (...t) => objs.length > 0 && [...types].every(x => t.includes(x));
            const sec = (key, label, ok, html) => ok ? isec('data-kn-isec', key, label, html) : `<section class="kn-is is-na" data-kn-isec="${key}" data-tb-label="${esc(label)}"><h4>${esc(label)}</h4></section>`;
            const line = o && o.t === 'shape' && ['line', 'arrowline'].includes(o.kind);
            const h = [
                sec('geom', 'Position et taille', one, () => `<div class="kn-g4">${F('X', iNum(of('x'), o.x))}${F('Y', iNum(of('y'), o.y))}${F('Largeur', iNum(of('w'), o.w, 'min="4"'))}${F('Hauteur', iNum(of('h'), o.h, 'min="4"'))}</div><div class="kn-g2">${F('Rotation', iNum(of('rot'), o.rot || 0, 'min="-180" max="180" data-unit="°"'))}${F('Nom (pour le déplacement magique)', iTxt(of('name'), o.name, objLabel(o)))}</div>${['image', 'shape'].includes(o.t) ? `<div class="kn-row">${B('flipH', '⇋ Miroir', 'Retourner de gauche à droite')}${B('flipV', '⇵ Miroir', 'Retourner de haut en bas')}${o.t === 'image' ? B('natural', '⤢ Proportions de la photo') : ''}</div>` : ''}`),
                sec('arrange', 'Disposition', objs.length > 0, () => `<div class="kn-row kn-icons">${[['left', '⇤', 'À gauche'], ['hcenter', '↔', 'Au centre'], ['right', '⇥', 'À droite'], ['top', '⤒', 'En haut'], ['vcenter', '↕', 'Au milieu'], ['bottom', '⤓', 'En bas'], ['dist-h', '⟷', 'Répartir horizontalement'], ['dist-v', '⇳', 'Répartir verticalement']].map(([k, i, t]) => C(`align:${k}`, i, `${t}${one ? ' (sur la diapositive)' : ''}`)).join('')}</div>
                    <div class="kn-row kn-icons">${C('order:front', '⏫', 'Tout devant')}${C('order:forward', '🔼', 'Avancer')}${C('order:backward', '🔽', 'Reculer')}${C('order:back', '⏬', 'Tout derrière')}${C('group', '⊞', 'Grouper (⌘G)')}${C('ungroup', '⊟', 'Dissocier (⇧⌘G)')}${C('lock', o.lock ? '🔒' : '🔓', o.lock ? 'Déverrouiller (⌘L)' : 'Verrouiller (⌘L)')}${C('duplicate', '⧉', 'Dupliquer (⌘D)')}${C('delete', '🗑', 'Supprimer (⌫)')}</div>`),
                sec('text', 'Texte', has('text', 'shape', 'table', 'person'), () => `${F('Police', `<span class="kn-fontw">${fontBtn('sel', o.font, 'Police du thème')}${o.font ? B('fontclear:sel', '∅', 'Revenir à la police du thème') : ''}</span>`)}
                    <div class="kn-g3">${F('Taille', `<input type="number" data-kn-x="size" min="4" max="600" value="${esc(num(o.size, 40))}">`)}${F('Graisse', iSel(of('weight', 'num'), [['', 'Selon le rôle'], ['300', 'Légère'], ['400', 'Normale'], ['500', 'Moyenne'], ['600', 'Demi-grasse'], ['700', 'Grasse'], ['800', 'Extra-grasse'], ['900', 'Noire']], o.weight ?? ''))}${F('Couleur', `<input type="color" data-kn-x="color" value="${esc(hex6(o.color || (o.acc ? th.accent : o.t === 'shape' ? '#ffffff' : o.t === 'person' ? '#1d1d1f' : th.fg)))}">`)}</div>
                    ${has('text') ? `<div class="kn-row kn-icons">${B('rich:bold', '<b>G</b>', 'Gras (⌘B)')}${B('rich:italic', '<i>I</i>', 'Italique (⌘I)')}${B('rich:underline', '<u>S</u>', 'Souligné (⌘U)')}${B('rich:strikeThrough', '<s>B</s>', 'Barré')}${B('rich:superscript', 'x²', 'Exposant (1<sup>er</sup>)')}${B('rich:insertUnorderedList', '•≡', 'Liste à puces')}${B('rich:insertOrderedList', '1≡', 'Liste numérotée')}${B('rich:indent', '⇥', 'Retrait (sous-liste)')}${B('rich:outdent', '⇤', 'Moins de retrait')}${B('rich:removeFormat', '⌫A', 'Enlever la mise en forme')}</div>` : ''}
                    <div class="kn-row kn-icons">${[['left', '⯇≡', 'Aligné à gauche'], ['center', '≡', 'Centré'], ['right', '≡⯈', 'Aligné à droite'], ['justify', '☰', 'Justifié']].map(([k, i, t]) => `<button type="button" class="kn-ib${(o.align || (o.t === 'shape' ? 'center' : 'left')) === k ? ' is-on' : ''}" data-kn-x="align:${k}" title="${t}">${i}</button>`).join('')}${has('text') ? [['top', '⤒', 'En haut de la zone'], ['middle', '↕', 'Au milieu de la zone'], ['bottom', '⤓', 'En bas de la zone']].map(([k, i, t]) => `<button type="button" class="kn-ib${(o.valign || 'top') === k ? ' is-on' : ''}" data-kn-x="valign:${k}" title="${t}">${i}</button>`).join('') : ''}</div>
                    ${has('text', 'shape') ? `<div class="kn-g3">${F('Interligne', iNum(of('lh'), o.lh ?? 1.2, 'step="0.05" min="0.6" max="4"'))}${F('Lettres', iNum(of('ls'), o.ls ?? 0, 'step="0.5" min="-20" max="100"'))}${has('text') ? F('Marge', iNum(of('pad'), o.pad ?? 8, 'min="0" max="400"')) : ''}</div>` : ''}
                    <div class="kn-row">${iChk(of('acc'), o.acc, 'Couleur d’accent du thème')}${iChk(of('italic'), o.italic, 'Italique')}</div>
                    ${one && o.t === 'shape' ? F('Texte dans la forme', `<textarea rows="2" ${of('text', 'text')}>${esc(o.text || '')}</textarea>`) : ''}
                    ${editing ? '<p class="muted">Les réglages vont au texte sélectionné (sinon à tout le texte).</p>' : has('text') ? '<p class="muted">Double-clic dans le texte pour l’écrire ; les réglages vont à tout le texte, ou au morceau sélectionné.</p>' : ''}`),
                sec('fill', 'Couleur (fond et bordure)', has('text', 'shape', 'table', 'chart', 'person', 'audio'), () => `<div class="kn-g2">${F('Fond', iColor('data-kn-x="fill"', o.t === 'shape' && !o.nofill ? o.fill || th.accent : o.fill || '#ffffff', 'clear:fill'))}${F('Bordure', iColor('data-kn-x="stroke"', o.stroke || (line ? o.fill || th.accent : '#000000'), 'clear:stroke'))}</div>
                    <div class="kn-g3">${F('Épaisseur', iNum(of('sw'), o.sw ?? (o.stroke || line ? (line ? 6 : 3) : 0), 'min="0" max="200"'))}${F('Trait', iSel(of('dash'), [['solid', 'Plein'], ['dash', 'Tirets'], ['dot', 'Points']], o.dash || 'solid'))}${F('Coins', iNum(of('radius'), o.radius ?? '', 'min="0" placeholder="auto"'))}</div>
                    <p class="muted">${o.t === 'shape' ? (o.nofill ? 'Forme sans fond.' : '') : o.fill ? '' : 'Pas de fond (∅).'} ${o.stroke || line ? '' : 'Pas de bordure (∅).'}</p>`),
                sec('image', 'Image', one && o.t === 'image', () => `<div class="kn-row">${B('replace', '🖼️ Changer l’image…')}${srcOf(o) ? B('tobg', '🖼 En fond de diapositive') : ''}</div>
                    <div class="kn-g2">${F('Cadrage', iSel(of('fit'), [['cover', 'Remplir (rogner)'], ['contain', 'Photo entière'], ['fill', 'Étirer']], o.fit || 'cover'))}${FH('Masque (forme)', iSel(of('mask') + ' data-kn-re="1"', MASKS, o.mask || 'none'), 'La photo est découpée dans cette forme : rond, arrondi, étoile, cœur… sans toucher à la photo d’origine.')}</div>
                    ${o.mask === 'rounded' ? F('Arrondi', iRange(of('radius'), o.radius ?? 28, 0, 400)) : ''}
                    ${FH('Zoom (rogner)', iRange(of('zoom'), o.zoom ?? 1, 1, 4, .05), 'Agrandit la photo dans son cadre ; « Cadrer ↔ ↕ » choisit ensuite quelle partie on voit.')}<div class="kn-g2">${F('Cadrer ↔', iRange(of('px'), o.px ?? 50, 0, 100))}${F('Cadrer ↕', iRange(of('py'), o.py ?? 50, 0, 100))}</div>
                    <details class="kn-sub" ${['bright', 'contrast', 'sat', 'sepia', 'gray', 'blur'].some(k => o[k] !== undefined) ? 'open' : ''}><summary>🎚️ Retouche</summary>${F('Luminosité', iRange(of('bright'), o.bright ?? 100, 0, 200))}${F('Contraste', iRange(of('contrast'), o.contrast ?? 100, 0, 200))}${F('Saturation', iRange(of('sat'), o.sat ?? 100, 0, 200))}${F('Sépia', iRange(of('sepia'), o.sepia ?? 0, 0, 100))}${F('Noir et blanc', iRange(of('gray'), o.gray ?? 0, 0, 100))}${F('Flou', iRange(of('blur'), o.blur ?? 0, 0, 20))}${B('imgreset', '↺ Remettre comme au départ')}</details>
                    <div class="kn-g2">${F('Cadre', iColor('data-kn-x="border"', o.border || '#ffffff', 'clear:border'))}${F('Épaisseur du cadre', iNum(of('bw'), o.bw ?? 6, 'min="0" max="100"'))}</div>`),
                sec('link', 'Liaison', one && o.t === 'link', () => `<div class="kn-g2">${F('Trait', iSel(of('kind') + ' data-kn-re="1"', LINK_KINDS, o.kind || 'straight'))}${F('Bouts', iSel(of('arrow'), LINK_ARROWS, o.arrow || 'end'))}</div><div class="kn-g2">${F('Couleur', `<input type="color" ${of('stroke')} value="${esc(col(o.stroke, '#333333'))}">`)}${F('Épaisseur', `<input type="number" ${of('sw', 'num')} min="1" max="40" value="${num(o.sw, 4)}">`)}</div><p class="muted">Le trait suit les deux objets quand on les déplace.</p>`),
                sec('shape', 'Forme', one && o.t === 'shape' && o.kind !== 'combo', () => `${F('Forme', iSel(of('kind') + ' data-kn-re="1"', SHAPES, o.kind || 'rect'))}${o.kind === 'star' ? `<div class="kn-g2">${F('Branches', iNum(of('points'), o.points ?? 5, 'min="3" max="40"'))}${F('Creux', iRange(of('inner') + ' data-unit="%"', o.inner ?? 45, 5, 95))}</div>` : ''}${o.kind === 'hexagon' ? F('Côtés', iNum(of('points'), o.points ?? 6, 'min="3" max="40"')) : ''}${line ? F('Flèches', iSel(of('arrow'), [['none', 'Aucune'], ['end', 'Au bout'], ['start', 'Au début'], ['both', 'Aux deux bouts']], o.arrow || (o.kind === 'arrowline' ? 'end' : 'none'))) : ''}`),
                sec('table', 'Tableau', one && o.t === 'table', () => `${ext.openSheetEditor ? `<div class="kn-row">${B('sheet', '🧾 Modifier les données', 'Le tableur en grand : formules, tri, coller depuis Excel… puis « ✓ Enregistrer et revenir »')}</div>` : ''}<div class="kn-row">${B('trow+', '＋ Ligne')}${B('trow-', '− Ligne')}${B('tcol+', '＋ Colonne')}${B('tcol-', '− Colonne')}</div>${iChk(of('head') + ' data-kn-re="1"', o.head, 'Première ligne en en-tête')}
                    <div class="kn-g2">${F('En-tête : fond', iColor(of('headFill', 'color'), o.headFill || th.accent))}${F('En-tête : texte', iColor(of('headColor', 'color'), o.headColor || '#ffffff'))}</div>
                    ${F('Contenu (une ligne par rangée, cases séparées par « ; » ou une tabulation — se colle d’un tableur)', `<textarea rows="5" data-kn-x="tdata">${esc((o.rows || []).map(r => (r || []).join(' ; ')).join('\n'))}</textarea>`)}<p class="muted">Double-clic sur une case du tableau pour l’écrire directement.</p>`),
                sec('chart', 'Graphique', one && o.t === 'chart', () => { const R = ext.diagramRender, kinds = CHART_KINDS.map(k => [k, R?.KINDS?.[k]]).filter(([, v]) => v);
                    return `${F('Sorte', `<select data-kn-x="ckind">${kinds.map(([k, v]) => `<option value="${esc(k)}" ${o.spec?.kind === k ? 'selected' : ''}>${esc(`${v.icon || ''} ${v.label}`)}</option>`).join('')}</select>`)}${F('Titre', `<input type="text" data-kn-x="ctitle" value="${esc(o.spec?.o?.title || '')}" maxlength="200">`)}
                    ${ext.openSheetEditor ? `<div class="kn-row">${B('sheet', '🧾 Modifier les données', 'Le tableur en grand, préparé « Catégorie + séries » : formules, tri, coller depuis Excel… puis « ✓ Enregistrer et revenir »')}</div>` : ''}${F(ext.openSheetEditor ? 'Ou ici, en secours (1re ligne : Catégorie ; Série 1 ; Série 2…)' : 'Les chiffres (1re ligne : Catégorie ; Série 1 ; Série 2…)', `<textarea rows="6" data-kn-x="cdata">${esc(chartText(o.spec))}</textarea>`)}
                    <div class="kn-g2">${F('Couleurs', `<select data-kn-x="cpal">${opt([['', 'Vives'], ['pastel', 'Pastel'], ['terre', 'Terre'], ['mer', 'Mer'], ['sepia', 'Sépia (ancien)'], ['gris', 'Gris']], o.spec?.o?.palette || '')}</select>`)}${F('Légende', `<select data-kn-x="cleg">${opt([['', 'Selon la sorte'], ['bottom', 'En bas'], ['right', 'À droite'], ['none', 'Aucune']], o.spec?.o?.legend || '')}</select>`)}</div>${F('Couleur des textes', iColor(of('color', 'color'), o.color || th.fg))}`; }),
                sec('person', 'Généalogie', one && o.t === 'person', () => `<div class="kn-f"><span>Personne</span>${(window.LCNDA_PICKER || A()).pickerField({name: 'kn_person', kind: 'person', value: o.pid ? (o.data?.name ? {id: o.pid, title: o.data.name} : o.pid) : null})}</div>
                    ${F('Montrer', iSel(of('view') + ' data-kn-re="1"', [['card', '🪪 La fiche'], ['photo', '🖼️ Le portrait'], ['tree', '🌳 Petit arbre'], ['timeline', '🗓️ Frise de sa vie']], o.view || 'card'))}
                    <div class="kn-row">${o.pid ? B('prefresh', '🔄 Relire la fiche') : ''}</div>${o.data?.at ? `<p class="muted">Ce qui est montré vient de la fiche (relue le ${esc(o.data.at)}) : la présentation se lit même sans la base. « Relire la fiche » la met à jour.</p>` : ''}`),
                sec('media', 'Vidéo / son', one && ['video', 'audio'].includes(o.t), () => `<div class="kn-row">${B('avreplace', '🎬 Changer…')}</div><div class="kn-row">${iChk(of('autoplay'), o.autoplay, 'Lecture automatique')}${iChk(of('loop'), o.loop, 'En boucle')}${o.t === 'video' ? iChk(of('muted'), o.muted, 'Sans le son') : ''}${iChk(of('controls'), o.controls, 'Boutons de lecture visibles')}</div><div class="kn-g2">${F('Volume', iRange(of('vol'), o.vol ?? 1, 0, 1, .05))}${F('Commencer à', iNum(of('start'), o.start ?? 0, 'min="0" data-ui-duration="s"'))}</div>`),
                sec('effects', 'Effets (ombre et opacité)', objs.length > 0, () => `${F('Opacité', iRange(of('op'), o.op ?? 1, 0, 1, .05))}${iChk(of('shadow') + ' data-kn-re="1"', o.shadow, 'Ombre portée')}${o.shadow ? `<div class="kn-g2">${F('Flou', iRange(of('shBlur'), o.shBlur ?? 16, 0, 80))}${F('Couleur', iColor(of('shColor', 'color'), o.shColor || '#000000'))}</div>` : ''}`),
            ];
            // l'ordre des éditeurs (E2) : Position et taille · Couleur · Texte · Effets, puis le reste
            const ORDER = ['geom', 'fill', 'text', 'effects', 'arrange', 'image', 'shape', 'table', 'chart', 'person', 'media'], keyOf = x => (String(x).match(/data-kn-isec="([^"]+)"/) || [])[1];
            h.sort((a, b) => ORDER.indexOf(keyOf(a)) - ORDER.indexOf(keyOf(b)));
            return `${objs.length ? (one ? `<p class="kn-ihead">${TYPE_ICON[o.t]} ${esc(cut(objLabel(o), 40))}${o.lock ? ' 🔒' : ''}${o.g ? ' <small>(groupe)</small>' : ''}</p>` : `<p class="kn-ihead">${objs.length} objets</p>`) : '<p class="muted kn-hint">Choisis un objet sur la diapositive (clic) ou insère-en un (barre du haut). ⇧ clic : en choisir plusieurs ; glisser sur le fond : un rectangle de sélection ; double-clic : écrire dans un texte, changer une image ; ⌥ en glissant : copier.</p>'}<div data-tbg="kn-format" data-tbg-label="Inspecteur : sections de « Format »">${h.join('')}</div>`;
        }
        const buildRow = (b, i) => `<div class="kn-brow"><div class="kn-g3">${F(b.kind === 'out' ? 'Sortie' : 'Entrée', iSel(`data-kn-b="${i}:fx" data-kn-re="1"`, FX, b.fx))}${['fly', 'wipe'].includes(b.fx) ? F('Sens', iSel(`data-kn-b="${i}:dir"`, DIRS, b.dir || 'l')) : ''}${b.fx === 'path' ? F('Chemin', iSel(`data-kn-b="${i}:pk"`, PATHS, b.pk || 'line')) : ''}${F('Début', iSel(`data-kn-b="${i}:start" data-kn-re="1"`, STARTS, b.start))}</div><div class="kn-g3">${F('Durée', `<input data-ui-duration="s" type="number" data-kn-b="${i}:dur" data-kn-k="num" min="0.05" max="20" step="0.1" value="${num(b.dur, .6)}">`)}${F('Attendre', `<input data-ui-duration="s" type="number" data-kn-b="${i}:delay" data-kn-k="num" min="0" max="60" step="0.1" value="${num(b.delay)}">`)}${B(`bdel:${i}`, '× Retirer')}</div>${b.fx === 'path' ? `<div class="kn-g3">${F('Vers la droite (px)', `<input type="number" data-kn-b="${i}:dx" data-kn-k="num" min="-4000" max="4000" step="10" value="${num(b.dx, 400)}">`)}${F('Vers le bas (px)', `<input type="number" data-kn-b="${i}:dy" data-kn-k="num" min="-4000" max="4000" step="10" value="${num(b.dy, 0)}">`)}</div>` : ''}</div>`;
        function paneAnim() {
            const s = S(), t = s.trans || {}, objs = selObjs(), o = objs.length === 1 ? objs[0] : null, bl = s.builds || [];
            const sec = (key, label, html) => isec('data-kn-asec', key, label, html);
            return `<div data-tbg="kn-anim" data-tbg-label="Inspecteur : sections de « Animer »">${[
                sec('trans', 'Transition', `${cur ? '' : '<p class="muted">C’est la première diapositive : sa transition ne joue que si la lecture recommence en boucle.</p>'}<div class="kn-g2">${FH('Effet (en arrivant sur cette diapositive)', iSel('data-kn-s="trans.type" data-kn-re="1"', TRANS, t.type || 'none'), 'L’effet joue en passant de la diapositive d’avant à celle-ci. « Déplacement magique » fait glisser les objets présents sur les deux.')}${F('Durée', `<input data-ui-duration="s" type="number" data-kn-s="trans.dur" data-kn-k="num" min="0.1" max="5" step="0.1" value="${num(t.dur, .8)}">`)}</div>
                    ${['push', 'movein', 'reveal', 'wipe', 'swap', 'flip', 'cube'].includes(t.type) ? F('Sens', iSel('data-kn-s="trans.dir"', [['l', 'Vers la gauche'], ['r', 'Vers la droite'], ['t', 'Vers le haut'], ['b', 'Vers le bas']], t.dir || 'l')) : ''}
                    ${t.type === 'magic' ? '<p class="muted">✨ Les objets présents sur la diapositive d’avant et sur celle-ci (diapositive dupliquée avec ⧉, ou objets portant le même nom) glissent, grandissent et tournent d’une place à l’autre ; les autres apparaissent ou s’effacent.</p>' : ''}
                    <div class="kn-row">${B('ptrans', '▶ Aperçu')}${B('transall', 'Pour toutes les diapositives')}</div>`),
                sec('obj', 'Animations de l’objet choisi', o ? `<p class="kn-ihead">${TYPE_ICON[o.t]} ${esc(cut(objLabel(o), 34))}</p>${bl.map((b, i) => b.obj === o.id ? buildRow(b, i) : '').join('') || '<p class="muted">Aucune : il est là dès l’arrivée de la diapositive.</p>'}<div class="kn-row">${B('badd:in', '＋ Entrée')}${B('badd:out', '＋ Sortie')}</div>` : '<p class="muted">Choisis un objet sur la diapositive pour le faire apparaître (entrée) ou disparaître (sortie), au clic ou tout seul.</p>'),
                sec('order', 'Ordre des animations', bl.length ? `<ol class="kn-blist">${bl.map((b, i) => `<li class="${o && b.obj === o.id ? 'is-cur' : ''}"><button type="button" class="kn-blab" data-kn-x="bsel:${i}"><b>${i + 1}.</b> ${esc(cut(objLabel(obj(b.obj)), 24))}<small>${b.kind === 'out' ? '⬅ Sortie' : '➡ Entrée'} · ${esc(fxL(b.fx))} · ${esc(startL(b.start))}</small></button>${B(`bup:${i}`, '↑', 'Plus tôt')}${B(`bdown:${i}`, '↓', 'Plus tard')}${B(`bdel:${i}`, '×', 'Retirer')}</li>`).join('')}</ol><div class="kn-row">${B('pbuilds', '▶ Aperçu des animations')}</div>` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">✨</span><span class="empty-line-text">Pas encore d’animation sur cette diapositive.</span></p>'),
            ].join('')}</div>`;
        }
        function paneSlide() {
            const s = S(), b = s.bg || {type: 'theme'}, th = themeOf(show), bt = b.type || 'theme';
            const sec = (key, label, html) => isec('data-kn-ssec', key, label, html);
            const base = th.bg;
            return `<div data-tbg="kn-slide" data-tbg-label="Inspecteur : sections de « Diapositive »">${[
                sec('layout', 'Disposition', `${FH('Disposition (place les titres, textes, photos)', `<select data-kn-x="layout">${opt(LAYOUTS, s.layout || 'blank')}</select>`, 'Un plan tout fait (titre, titre et texte, photo pleine page…) : les textes déjà écrits sont gardés et changent de place.')}<p class="muted">Changer de disposition replace les objets « titre », « texte », « photo » ; ce que tu as écrit est gardé.</p>`),
                sec('bg', 'Fond', `${F('Fond', iSel('data-kn-s="bg.type" data-kn-re="1"', [['theme', 'Celui du thème'], ['color', 'Couleur'], ['gradient', 'Dégradé'], ['radial', 'Dégradé rond'], ['image', 'Image']], bt))}
                    ${bt === 'color' || bt === 'image' ? F(bt === 'image' ? 'Couleur autour de l’image' : 'Couleur', iColor('data-kn-s="bg.c1"', b.c1 || base.c1 || '#ffffff')) : ''}
                    ${bt === 'gradient' || bt === 'radial' ? `<div class="kn-g2">${F('De', iColor('data-kn-s="bg.c1"', b.c1 || base.c1 || '#ffffff'))}${F('À', iColor('data-kn-s="bg.c2"', b.c2 || base.c2 || '#888888'))}</div>${bt === 'gradient' ? F('Angle', iRange('data-kn-s="bg.angle"', b.angle ?? 135, 0, 360)) : ''}` : ''}
                    ${bt === 'image' ? `<div class="kn-row">${B('bgimg', srcOf(b) ? '🖼️ Changer l’image…' : '🖼️ Choisir l’image…')}</div><div class="kn-g2">${F('Cadrage', iSel('data-kn-s="bg.fit"', [['cover', 'Remplir'], ['contain', 'Entière']], b.fit || 'cover'))}${F('Assombrir', iRange('data-kn-s="bg.dim" data-unit="%"', b.dim ?? 0, 0, 90))}</div>` : ''}
                    <div class="kn-row">${B('bgall', 'Ce fond pour toutes les diapositives')}</div>`),
                sec('play', 'Lecture', `<div class="kn-g2">${FH('Durée — lecture seule et vidéo', `<input data-ui-duration="s" type="number" data-kn-s="dur" data-kn-k="num" min="1" max="600" step="0.5" value="${num(s.dur, 5)}">`, 'Le temps passé sur cette diapositive quand la présentation avance toute seule et dans la vidéo exportée.')}</div>${iChk('data-kn-s="auto"', s.auto, 'Passer toute seule à la suivante (après la durée)')}${iChk('data-kn-s="skip" data-kn-re="1"', s.skip, 'Sauter cette diapositive à la lecture')}`),
                sec('section', 'Section', `${F('Titre de la section (un groupe de diapositives qui commence ici)', iTxt('data-kn-s="section"', s.section, 'ex. Les années de guerre'))}`),
                sec('notes', 'Notes de l’orateur', `<textarea rows="6" data-kn-s="notes" data-kn-k="text" placeholder="Ce que tu veux dire sur cette diapositive (vu dans la fenêtre du présentateur)…">${esc(s.notes || '')}</textarea>`),
            ].join('')}</div>`;
        }
        function paneObjs() {
            const list = S().objs.slice().reverse();
            return `<div data-tbg="kn-objs" data-tbg-label="Inspecteur : « Objets »"><section class="kn-is" data-kn-osec="list" data-tb-label="Objets de la diapositive"><h4>Objets (le premier est devant)</h4>${list.length ? `<ol class="kn-layers">${list.map(o => `<li class="${sel.has(o.id) ? 'is-cur' : ''}${o.hide ? ' is-hid' : ''}"><button type="button" class="kn-lname" data-kn-x="osel:${esc(o.id)}"><span class="kn-lico">${TYPE_ICON[o.t]}</span><span>${esc(cut(objLabel(o), 34))}</span>${o.g ? '<small title="Dans un groupe">⊞</small>' : ''}</button>${B(`ohide:${o.id}`, o.hide ? '🙈' : '👁', o.hide ? 'Montrer' : 'Cacher')}${B(`olock:${o.id}`, o.lock ? '🔒' : '🔓', o.lock ? 'Déverrouiller' : 'Verrouiller')}${B(`oup:${o.id}`, '↑', 'Vers le devant')}${B(`odown:${o.id}`, '↓', 'Vers le fond')}</li>`).join('')}</ol>` : A().emptyState({icon: '🧩', text: 'Aucun objet sur cette diapositive pour l’instant', hint: 'Insère un texte, une image… avec la barre du haut.'})}</section></div>`;
        }
        function paneDoc() {
            const th = themeOf(show), [W, H] = WH(), fonts = fontList(), tot = show.slides.filter(s => !s.skip).reduce((a, s) => a + num(s.dur, 5), 0);
            const sec = (key, label, html) => isec('data-kn-dsec', key, label, html);
            return `<div data-tbg="kn-doc" data-tbg-label="Inspecteur : sections de « Document »">${[
                sec('theme', 'Thème', `<div class="kn-themes">${Object.entries(THEMES).map(([k, t]) => `<button type="button" class="kn-theme${show.theme === k ? ' is-cur' : ''}" data-kn-x="theme:${k}" title="${esc(t.label)}"><span style="${esc(`${bgCss({}, t)};color:${t.fg}`)}"><b style="${esc(`font-family:${t.tf};font-weight:${t.tw}`)}">Aa</b><i style="background:${t.accent}"></i></span><small>${esc(t.label)}</small></button>`).join('')}</div>`),
                sec('colors', 'Couleurs et polices', `<div class="kn-g2">${F('Texte', iColor('data-kn-d="colors.fg"', th.fg, 'dclear:colors.fg'))}${F('Accent', iColor('data-kn-d="colors.accent"', th.accent, 'dclear:colors.accent'))}</div>${F('Police des titres', `<span class="kn-fontw">${fontBtn('title', show.fonts?.title, `Celle du thème (${th.tf.split(',')[0].replace(/"/g, '')})`)}${show.fonts?.title ? B('fontclear:title', '∅', 'Revenir à la police du thème') : ''}</span>`)}${F('Police des textes', `<span class="kn-fontw">${fontBtn('body', show.fonts?.body, `Celle du thème (${th.bf.split(',')[0].replace(/"/g, '')})`)}${show.fonts?.body ? B('fontclear:body', '∅', 'Revenir à la police du thème') : ''}</span>`)}`),
                sec('format', 'Format', `${F('Format des diapositives', `<select data-kn-x="aspect">${opt(Object.entries(ASPECTS).map(([k, v]) => [k, v[2]]), show.aspect)}</select>`)}${show.aspect === 'custom' ? `<div class="kn-g2">${F('Largeur (points)', `<input type="number" data-kn-x="cw" min="320" max="4000" value="${W}">`)}${F('Hauteur (points)', `<input type="number" data-kn-x="ch" min="240" max="4000" value="${H}">`)}</div>` : ''}<p class="muted">${W} × ${H} points. En changeant de format, les objets sont agrandis ou réduits ensemble.</p>`),
                sec('sound', 'Musique', `${show.music ? `<p>🎵 ${esc(show.music.title || 'Musique')}</p><div class="kn-row">${B('music', 'Changer…')}${B('nomusic', 'Retirer')}</div>${F('Volume', iRange('data-kn-d="musicVol"', show.musicVol ?? .5, 0, 1, .05))}` : `<div class="kn-row">${B('music', '🎵 Une musique pendant la lecture…')}</div>`}`),
                sec('loop', 'Lecture', `${iChk('data-kn-d="loop"', show.loop, 'Recommencer au début à la fin (borne, exposition)')}<p class="muted">${show.slides.length} diapositive${show.slides.length > 1 ? 's' : ''}${show.slides.some(s => s.skip) ? ` dont ${A().plural(show.slides.filter(s => s.skip).length, 'sautée')}` : ''} · ${fmt(tot)} en lecture toute seule (durées des diapositives).</p>`),
            ].join('')}</div>`;
        }
        function paintInsp() {
            dlg.querySelectorAll('[data-kn-tab]').forEach(b => b.classList.toggle('is-cur', b.dataset.knTab === tab));
            ibody.innerHTML = [['format', paneFormat], ['anim', paneAnim], ['slide', paneSlide], ['objs', paneObjs], ['doc', paneDoc]].map(([k, f]) => `<div class="kn-pane" data-kn-pane="${k}" ${k === tab ? '' : 'hidden'}>${f()}</div>`).join('');
            ext.tbApply?.(dlg, 'keynote');
        }
        /* ─── les réglages de l'inspecteur ─── */
        const setPath = (o, path, v) => { const ks = path.split('.'); let t = o; ks.slice(0, -1).forEach(k => { if (!t[k] || typeof t[k] !== 'object') t[k] = {}; t = t[k]; }); const last = ks[ks.length - 1]; if (v === undefined || v === false || v === '') delete t[last]; else t[last] = v; };
        function applyLayout(layout) {
            const s = S(), [W, H] = WH(), fresh = layoutObjs(layout, W, H, themeOf(show)), used = new Set(), same = s.layout === layout;
            const fam = r => r === 'number' || r === 'quote' ? 'title' : r === 'caption' ? 'sub' : r;
            fresh.forEach(n => { if (!n.role) return; const old = s.objs.find(o => !used.has(o.id) && o.role && o.t === n.t && fam(o.role) === fam(n.role)); if (old) { used.add(old.id); Object.assign(old, {x: n.x, y: n.y, w: n.w, h: n.h, rot: 0}); n.used = true; } });
            s.objs = s.objs.filter(o => !o.role || used.has(o.id) || (o.t === 'text' ? htmlToText(o.html) : o.t === 'image' ? srcOf(o) : true));
            fresh.forEach(n => { if (!n.used && (n.role || !same)) s.objs.push(n); delete n.used; });
            s.layout = layout; sel = new Set(); touch(true);
        }
        function resizeDoc(nw, nh, aspect) {
            const [W, H] = WH(); nw = clamp(Math.round(nw), 320, 4000); nh = clamp(Math.round(nh), 240, 4000); if (nw === W && nh === H) { show.aspect = aspect; paintInsp(); return; }
            const f = Math.min(nw / W, nh / H), ox = (nw - W * f) / 2, oy = (nh - H * f) / 2;
            show.slides.forEach(s => s.objs.forEach(o => { if (o.x <= 1 && o.y <= 1 && o.w >= W - 1 && o.h >= H - 1) { o.x = 0; o.y = 0; o.w = nw; o.h = nh; return; } o.x = Math.round(o.x * f + ox); o.y = Math.round(o.y * f + oy); o.w = Math.round(o.w * f); o.h = Math.round(o.h * f); ['size', 'pad', 'radius', 'bw'].forEach(k => { if (o[k]) o[k] = Math.max(1, Math.round(o[k] * f)); }); if (o.sw) o.sw = r1(o.sw * f); }));
            show.w = nw; show.h = nh; show.aspect = aspect; paintAll(); commit();
        }
        function special(x, el, isChange) {
            const objs = selObjs(), v = el.value, th = themeOf(show);
            if (x === 'font' && isChange) { if (editing && obj(editing)?.t === 'text') { if (v) rich('fontName', v); return; } objs.forEach(o => { if (v) o.font = v; else delete o.font; if (o.t === 'text') stripStyle(o, 'font-family'); }); return touch(); }
            if (x === 'size' && isChange) { const n = clamp(num(v, 40), 4, 600); if (editing && obj(editing)?.t === 'text') return rich('fontSize', n); objs.forEach(o => { o.size = n; if (o.t === 'text') stripStyle(o, 'font-size'); }); return touch(); }
            if (x === 'color') { if (editing && obj(editing)?.t === 'text') { if (isChange) rich('foreColor', v); return; } objs.forEach(o => { o.color = v; delete o.acc; if (o.t === 'text' && isChange) stripStyle(o, 'color'); }); paintSlide(); paintThumb(); commit(false); return; }
            if (x === 'fill') { objs.forEach(o => { o.fill = v; delete o.nofill; }); paintSlide(); paintThumb(); commit(false); return; }
            if (x === 'stroke') { objs.forEach(o => { o.stroke = v; if (!num(o.sw)) o.sw = o.t === 'shape' && ['line', 'arrowline'].includes(o.kind) ? 6 : 3; }); paintSlide(); paintThumb(); commit(false); if (isChange) paintInsp(); return; }
            if (x === 'border') { objs.forEach(o => { o.border = v; if (!num(o.bw)) o.bw = 6; }); paintSlide(); paintThumb(); commit(false); return; }
            if (!isChange) return;
            const o = objs[0];
            if (x === 'tdata' && o?.t === 'table') { o.rows = v.split('\n').slice(0, 40).map(l => l.split(/\t|;/).slice(0, 16).map(c => c.trim())); if (!o.rows.length) o.rows = [['']]; return touch(); }
            if (o?.t === 'chart' && ['cdata', 'ctitle', 'ckind', 'cpal', 'cleg'].includes(x)) {
                o.spec = o.spec || {kind: 'columns', rows: [], series: []}; o.spec.o = o.spec.o || {};
                if (x === 'ckind') o.spec.kind = v; if (x === 'ctitle') o.spec.o.title = v.slice(0, 200); if (x === 'cpal') o.spec.o.palette = v; if (x === 'cleg') o.spec.o.legend = v;
                if (x === 'cdata') { const lines = v.split('\n').map(l => l.split(/\t|;/).map(c => c.trim())).filter(l => l.some(Boolean)); const head = lines.shift() || ['Catégorie', 'Valeur']; o.spec.series = head.slice(1, 11).map(n => ({name: n || 'Valeur'})); if (!o.spec.series.length) o.spec.series = [{name: 'Valeur'}]; o.spec.rows = lines.slice(0, 200).map(l => { const r = {label: l[0] || ''}; o.spec.series.forEach((_, j) => { r['s' + j] = num(String(l[j + 1] ?? '').replace(/\s/g, '').replace(',', '.'), 0); }); return r; }); }
                return touch();
            }
            if (x === 'aspect') { if (v === 'custom') { show.aspect = 'custom'; paintInsp(); return; } const a = ASPECTS[v]; if (a) resizeDoc(a[0], a[1], v); return; }
            if (x === 'cw' || x === 'ch') { const [W, H] = WH(); return resizeDoc(x === 'cw' ? num(v, W) : W, x === 'ch' ? num(v, H) : H, 'custom'); }
            if (x === 'layout') return applyLayout(v);
        }
        function onField(e, isChange) {
            const el = e.target; if (!el.matches?.('input, select, textarea')) return;
            if (el.type === 'range' && el.nextElementSibling?.tagName === 'OUTPUT') el.nextElementSibling.textContent = el.value;
            if (el.tagName === 'SELECT' && !isChange) return;
            if (el.type === 'checkbox' && !isChange) return;
            const kind = el.dataset.knK, val = el.type === 'checkbox' ? el.checked : kind === 'num' ? (el.value === '' ? undefined : Number(el.value)) : el.value;
            if (el.dataset.knX) return special(el.dataset.knX, el, isChange);
            if (el.name === 'kn_person' || el.closest('.pk')) return; // le menu de choix : écouté par cp-pick
            if (el.dataset.knF) {
                const k = el.dataset.knF, objs = selObjs(); if (!objs.length) return;
                objs.forEach(o => { if (['x', 'y', 'w', 'h'].includes(k)) { if (val === undefined || !Number.isFinite(val)) return; o[k] = k === 'w' || k === 'h' ? Math.max(4, val) : val; } else if (val === undefined || val === false || (val === '' && k !== 'text')) delete o[k]; else o[k] = val; if (k === 'kind' && ['line', 'arrowline'].includes(val) && o.h > 80) o.h = 40; });
                paintSlide(); paintThumb(); commit(!!isChange || false); if (el.dataset.knRe && isChange) paintInsp(); return;
            }
            if (el.dataset.knS) {
                const p = el.dataset.knS; setPath(S(), p, val);
                if (p === 'bg.type' && ['color', 'gradient', 'radial', 'image'].includes(val)) { const b = S().bg, base = themeOf(show).bg; if (!hexOk(b.c1)) b.c1 = val === 'image' ? '#000000' : base.c1 || '#ffffff'; if (!hexOk(b.c2)) b.c2 = base.c2 || '#888888'; if (b.angle === undefined) b.angle = base.angle ?? 135; } // on part du fond du thème
                if (p === 'notes') $('[data-kn-notes]').value = S().notes || '';
                paintSlide(); paintThumb(); commit(false);
                if (isChange && (el.dataset.knRe || ['skip', 'section', 'trans.type', 'notes'].includes(p))) { paintNav(); if (el.dataset.knRe) paintInsp(); }
                return;
            }
            if (el.dataset.knD) {
                const p = el.dataset.knD; setPath(show, p, val); commit(false);
                if (['musicVol', 'loop'].includes(p)) return;
                paintSlide(); if (isChange) { paintNav(); paintInsp(); }
                return;
            }
            if (el.dataset.knB) { const [i, k] = el.dataset.knB.split(':'), b = S().builds?.[Number(i)]; if (!b) return; b[k] = ['dur', 'delay'].includes(k) ? clamp(num(val, k === 'dur' ? .6 : 0), 0, 60) : ['dx', 'dy'].includes(k) ? clamp(num(val), -4000, 4000) : val; commit(false); if (el.dataset.knRe && isChange) paintInsp(); }
        }
        ibody.addEventListener('input', e => onField(e, false));
        ibody.addEventListener('change', e => onField(e, true));
        ibody.addEventListener('mousedown', e => { if (editing && e.target.closest('button')) e.preventDefault(); }); // garder le texte sélectionné
        ibody.addEventListener('cp-pick', e => { const o = selObjs()[0]; if (o?.t === 'person' && e.detail?.id) setPerson(o, e.detail.id); });
        $('[data-kn-notes]').addEventListener('input', e => { if (!S()) return; S().notes = e.target.value; commit(false); });
        $('[data-kn-notes]').addEventListener('change', () => { paintNav(); if (tab === 'slide') paintInsp(); });
        $('[data-kn-name]').addEventListener('input', () => { dirty = true; status('modifié'); });
        $('[data-kn-zoom]').addEventListener('change', e => { zoom = e.target.value; fitZoom(); });
        $('[data-kn-snap]').addEventListener('change', e => { snap = e.target.checked; const p = readJ(PREF, {}); p.snap = snap; writeJ(PREF, p); });
        /* ─── aperçus dans la diapositive (animations, transition) ─── */
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const waitDone = hs => new Promise(r => { const t = setInterval(() => { if (closed || hs.every(h => h.isDone())) { clearInterval(t); r(); } }, 60); });
        async function previewBuilds() {
            if (editing) stopEdit(); const s = S(), [W, H] = WH(), steps = stepsOf(s); if (!steps.length) return;
            slideBox.innerHTML = renderSlide(show, s, 'play'); hiddenAt(s, 'start').forEach(oid => { const el = objEl(oid); if (el) el.style.visibility = 'hidden'; }); ov.innerHTML = '';
            for (const st of steps) { const hs = runBuilds(slideBox, s, st, W, H); await waitDone(hs); await sleep(500); if (closed || S() !== s) return; }
            await sleep(600); if (!closed && S() === s) paintSlide();
        }
        function previewTrans() {
            const s = S(), prevS = show.slides[cur - 1] || (show.loop ? show.slides[show.slides.length - 1] : null), t = s.trans || {};
            if (!prevS || prevS === s) return toast('Il n’y a pas de diapositive avant celle-ci.');
            if (!t.type || t.type === 'none') return toast('Choisis d’abord un effet de transition.');
            if (editing) stopEdit(); const [W, H] = WH(), box = document.createElement('div'); box.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;background:#000`;
            const mk = (sl, at) => { const L = document.createElement('div'); L.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px`; L.innerHTML = renderSlide(show, sl, 'thumb'); hiddenAt(sl, at).forEach(oid => { const el = L.querySelector(`[data-kn-o="${CSS.escape(oid)}"]`); if (el) el.style.visibility = 'hidden'; }); return L; };
            slideBox.innerHTML = ''; slideBox.appendChild(box); ov.innerHTML = ''; const a = mk(prevS, 'end'), b = mk(s, 'start'); box.append(a, b);
            transition(t.type, a, b, clamp(num(t.dur, .8), .1, 5), t.dir || 'l', W, H, box, prevS, s).promise.then(() => setTimeout(() => { if (!closed && S() === s && !editing) paintSlide(); }, 500));
        }
        /* ─── lire, enregistrer, fermer ─── */
        function play(start, presenter = false) { if (editing) stopEdit(); openPlayer(show, {start, presenter, name: $('[data-kn-name]').value, onExit: i => { if (!closed && Number.isInteger(i)) goSlide(i); }}); }
        const forSave = () => JSON.parse(JSON.stringify(show, (k, v) => k === '_editing' ? undefined : v));
        async function save() {
            if (editing) stopEdit();
            name = $('[data-kn-name]').value.trim() || 'Ma présentation'; status('Enregistrement…');
            try { const r = await post('save_slideshow', {id, name, show: forSave()}); id = r.result.id; dirty = false; status('✓ Enregistré'); ctx.onSaved?.(id); }
            catch (e) { if (UI().savedStatus) UI().savedStatus($('[data-kn-state]'), 'error'); else status(''); toast(e.message, 'error'); }
        }
        async function close() { if (editing) stopEdit(); if (dirty && !await A().confirmBox('Les dernières modifications de la présentation seront perdues.', {title: 'Fermer sans enregistrer la présentation ?', okLabel: 'Fermer sans enregistrer', danger: true})) return; closed = true; ro.disconnect(); docAc.abort(); dlg.close(); dlg.remove(); ctx.onClose?.(); }
        const ctl = {get show() { return show; }, get cur() { return cur; }, select(ids) { if (editing) stopEdit(); sel = new Set(ids); paintSlide(); paintInsp(); }, run: k => runCmd(k), get name() { return $('[data-kn-name]').value || name; },
            addSlides(list, {replace = false, meta = null} = {}) {
                if (editing) stopEdit();
                const [W, H] = WH(), adopt = replace || (show.slides.length === 1 && !show.slides[0].objs.some(o => o.t !== 'text' || htmlToText(o.html))); // une présentation vide prend le format du fichier
                if (meta?.w && meta?.h) { if (adopt) { show.w = meta.w; show.h = meta.h; show.aspect = Object.keys(ASPECTS).find(k => ASPECTS[k][0] === meta.w && ASPECTS[k][1] === meta.h) || (Math.abs(meta.w / meta.h - 16 / 9) < .01 ? '16:9' : 'custom'); } else scaleSlides(list, meta.w, meta.h, W, H); }
                const n = normalize({...show, slides: list}).slides; if (adopt) { show.slides = n; cur = 0; } else { show.slides.splice(cur + 1, 0, ...n); cur = cur + n.length; } // la suite d'un import se range après
                sel = new Set(); paintAll(); commit(); }};
        ext.keynoteCurrent = ctl; // l'éditeur ouvert (pour les essais et les autres outils)
        /* ─── E3 : une seule fenêtre d'export ─── */
        async function exportDialog() {
            if (editing) stopEdit();
            if (!UI().openExportDialog) return toast('La fenêtre d’export n’est pas chargée.', 'error');
            const n = ctl.name, [W, H] = WH();
            await UI().openExportDialog({title: n, defaultName: n, quality: false, saveCopy: true, info: `${A().plural(show.slides.length, 'diapositive')} · ${W} × ${H} points`,
                preview: async () => (await slideCanvas(show, S(), Math.min(1, 480 / W))).toDataURL('image/jpeg', .85),
                formats: [
                    {id: 'pdf', hint: 'une diapositive par page (« Enregistrer en PDF »)', ext: '', run: async () => exportPrint(show, n, false)},
                    {id: 'pdfnotes', label: '📝 PDF + notes', hint: 'avec les notes de l’orateur', ext: '', run: async () => exportPrint(show, n, true)},
                    {id: 'png', hint: 'cette diapositive', run: o => exportPng(show, n, [cur], {...o, direct: true})},
                    {id: 'zip', label: '🗂 Toutes en PNG', hint: 'un fichier .zip', ext: 'zip', run: o => exportPng(show, n, null, {...o, direct: true, saveCopy: false})},
                    {id: 'video', label: '🎬 Vidéo', hint: 'WebM, avec la musique', ext: 'webm', run: o => exportVideo(show, n, status, {...o, direct: true, alive: () => dlg.isConnected})},
                    {id: 'print', hint: 'tout de suite', run: async () => exportPrint(show, n, false)},
                    {id: 'file', hint: 'pour la rouvrir ou la partager', ext: 'json', run: async o => download(new Blob([JSON.stringify({type: 'lcnda-presentation', version: 1, name: n, show: forSave()}, null, 1)], {type: 'application/json'}), o.filename)},
                ]});
        }
        /* ─── ✨ Récit d'une vie (heritage-slideshow.js) : les diapositives arrivent après celle affichée ─── */
        async function storyHere() {
            if (editing) stopEdit();
            if (!ext.storyOptions || !ext.lifeStory) return toast('Le diaporama n’est pas chargé.', 'error');
            const o = await ext.storyOptions({eyebrow: 'PRÉSENTATION', submitLabel: 'Ajouter le récit'}); if (!o) return;
            status('✨ Préparation du récit…');
            try {
                const st = await ext.lifeStory(o), list = fromDiaporama(st.show, show); status('');
                if (!list.length) return toast('Rien à raconter pour cette personne.', 'error');
                if (!show.music && st.show.music) { show.music = st.show.music; show.musicVol = st.show.musicVol; }
                ctl.addSlides(list);
                toast(`✨ ${A().plural(list.length, 'diapositive ajoutée', 'diapositives ajoutées')} : chaque texte vient de la fiche. Les cartes animées restent dans le diaporama.`);
            } catch (e) { status(''); toast(e.message, 'error'); }
        }
        async function runCmd(k) {
            if (k.startsWith('align:')) return align(k.slice(6));
            if (k.startsWith('order:')) return order(k.slice(6));
            switch (k) {
                case 'undo': return undo(); case 'redo': return redo();
                case 'play': return play(0); case 'playhere': return play(cur); case 'presenter': return play(cur, true);
                case 'save': return save(); case 'close': return close();
                case 'import': return openImport(ctl);
                case 'exp_pdf': return exportPrint(show, ctl.name, false); case 'exp_pdfnotes': return exportPrint(show, ctl.name, true);
                case 'exp_png': return exportPng(show, ctl.name, [cur]); case 'exp_pngall': return exportPng(show, ctl.name, null);
                case 'exp_json': return download(new Blob([JSON.stringify({type: 'lcnda-presentation', version: 1, name: ctl.name, show: forSave()}, null, 1)], {type: 'application/json'}), `${safeName(ctl.name)}.json`);
                case 'exp_video': return exportVideo(show, ctl.name, status, {alive: () => dlg.isConnected});
                case 'export': return exportDialog();
                case 'story': return storyHere();
                case 'newslide': return addSlide();
                case 'dupslide': return dupSlide(); case 'delslide': return delSlide();
                case 'skipslide': S().skip = !S().skip; paintNav(); paintInsp(); return commit();
                case 'section': { const n = await A().askText({title: 'Section', message: 'Titre de la section qui commence à cette diapositive (vide : pas de section) :', value: S().section || '', okLabel: 'OK'}); if (n === null) return; S().section = String(n).trim().slice(0, 80); paintNav(); paintInsp(); return commit(); }
                case 'prevslide': return goSlide(cur - 1); case 'nextslide': return goSlide(cur + 1);
                case 'notes': { const b = $('[data-kn-notesbox]'); b.hidden = !b.hidden; if (!b.hidden) b.querySelector('textarea').focus(); setTimeout(fitZoom, 30); return; }
                case 'group': return group(true); case 'ungroup': return group(false); case 'lock': return lockSel();
                case 'connect': return connectSel(); case 'merge': return mergeSel(); case 'master': return masterCmd();
                case 'duplicate': return dupSel(); case 'delete': return delSel(); case 'copy': return copySel(); case 'paste': return paste();
            }
        }
        async function runX(x, btn) {
            const objs = selObjs(), o = objs[0], [k, arg] = [x.split(':')[0], x.slice(x.indexOf(':') + 1)];
            switch (k) {
                case 'clear': objs.forEach(q => { if (arg === 'fill') { delete q.fill; if (q.t === 'shape') q.nofill = true; } if (arg === 'stroke') { delete q.stroke; delete q.sw; } if (arg === 'border') { delete q.border; delete q.bw; } }); return touch(true);
                case 'flipH': case 'flipV': objs.forEach(q => { q[k] = !q[k]; if (!q[k]) delete q[k]; }); return touch();
                case 'natural': if (o?.t === 'image' && srcOf(o)) { const [nw, nh] = await imgSize(srcOf(o)); o.h = Math.round(o.w * nh / nw); touch(true); } return;
                case 'fontpick': case 'fontclear': {
                    const cur0 = arg === 'sel' ? (o?.font || '') : (show.fonts?.[arg] || '');
                    let f = '';
                    if (k === 'fontpick') { if (!UI().openFontPicker) return runX('localfonts'); f = await UI().openFontPicker({value: fontOk(cur0), sample: cut(htmlToText(o?.html || '') || ctl.name, 40) || 'Ma présentation'}); if (!f) return; f = fontOk(f); if (!f) return; }
                    if (arg === 'sel') { if (editing && obj(editing)?.t === 'text') { if (f) rich('fontName', f); return; } objs.forEach(q => { if (f) q.font = f; else delete q.font; if (q.t === 'text') stripStyle(q, 'font-family'); }); return touch(true); }
                    show.fonts = {...(show.fonts || {})}; if (f) show.fonts[arg] = f; else delete show.fonts[arg]; paintAll(); return commit(); }
                case 'localfonts': { if (typeof window.queryLocalFonts === 'function' && !localFonts) await loadLocalFonts();
                    const r = await pickFont(objs.some(q => ['text', 'shape', 'table', 'person'].includes(q.t))); if (!r) return paintInsp();
                    const mine = readJ(FONTS_KEY, []); if (!(localFonts || []).includes(r.font) && !BASE_FONTS.includes(r.font)) writeJ(FONTS_KEY, [...new Set([r.font, ...(Array.isArray(mine) ? mine : [])])].slice(0, 200)); // une police tapée à la main reste dans la liste
                    if (r.to === 'sel') { objs.forEach(q => { q.font = r.font; if (q.t === 'text') stripStyle(q, 'font-family'); }); toast(`Police « ${r.font} » pour le texte choisi.`); return touch(true); }
                    show.fonts = {...(show.fonts || {}), [r.to]: r.font}; paintAll(); toast(`Police « ${r.font} » pour ${r.to === 'title' ? 'les titres' : 'les textes'}.`); return commit(); }
                case 'rich': return rich(arg);
                case 'align': objs.forEach(q => { q.align = arg; }); return touch(true);
                case 'valign': objs.forEach(q => { q.valign = arg; }); return touch(true);
                case 'replace': return insertImage(o);
                case 'tobg': if (o?.t === 'image') { S().bg = {type: 'image', filename: o.filename, src: o.src, fit: 'cover', c1: '#000000'}; if (!S().bg.src) delete S().bg.src; S().objs = S().objs.filter(q => q !== o); S().builds = (S().builds || []).filter(b => b.obj !== o.id); sel = new Set(); touch(true); toast('L’image est maintenant le fond de la diapositive (onglet 🖼 Diapositive).'); } return;
                case 'imgreset': objs.forEach(q => ['bright', 'contrast', 'sat', 'sepia', 'gray', 'blur', 'zoom', 'px', 'py'].forEach(f => delete q[f])); return touch(true);
                case 'trow+': case 'trow-': case 'tcol+': case 'tcol-': if (o?.t === 'table') { const rows = o.rows = (o.rows || [['']]).map(r => Array.isArray(r) ? r : []), nc = Math.max(1, ...rows.map(r => r.length));
                    if (k === 'trow+') rows.push(Array(nc).fill('')); if (k === 'trow-' && rows.length > 1) rows.pop(); if (k === 'tcol+') rows.forEach(r => { while (r.length < nc) r.push(''); r.push(''); }); if (k === 'tcol-' && nc > 1) rows.forEach(r => { r.length = Math.min(r.length, nc - 1); });
                    const rh = o.h / Math.max(1, rows.length + (k === 'trow+' ? -1 : k === 'trow-' ? 1 : 0)); if (k === 'trow+') o.h = Math.round(o.h + rh); if (k === 'trow-') o.h = Math.max(20, Math.round(o.h - rh)); touch(true); } return;
                case 'prefresh': if (o?.pid) await setPerson(o, o.pid); return;
                case 'sheet': if (o && (o.t === 'table' || o.t === 'chart') && ext.openSheetEditor) { const oid = o.id; // 🧾 le tableur commun (heritage-tableur-cibles.js), puis retour ici
                    ext.openSheetEditor({target: 'keynote', data: JSON.parse(JSON.stringify(o)), name: objLabel(o), onSave: v => { const q = obj(oid); if (!q) return; if (q.t === 'chart') { q.spec = {...v, kind: v.kind || q.spec?.kind || 'columns'}; delete q.spec.live; } else q.rows = Array.isArray(v) && v.length ? v : [['']]; touch(true); toast('Données reprises du tableur.'); }}); } return;
                case 'avreplace': if (o) await replaceAV(o); return;
                case 'badd': if (o) { S().builds = S().builds || []; S().builds.push({id: uid('b'), obj: o.id, kind: arg === 'out' ? 'out' : 'in', fx: arg === 'out' ? 'fade' : o.t === 'text' ? 'fly' : 'fade', dir: arg === 'out' ? 'r' : 'b', dur: .6, delay: 0, start: 'click'}); paintNav(); paintInsp(); commit(); } return;
                case 'bsel': { const b = S().builds?.[Number(arg)]; if (b && obj(b.obj)) { sel = new Set([b.obj]); afterSel(); } return; }
                case 'bup': case 'bdown': { const bl = S().builds || [], i = Number(arg), j = i + (k === 'bup' ? -1 : 1); if (j < 0 || j >= bl.length) return; [bl[i], bl[j]] = [bl[j], bl[i]]; paintInsp(); return commit(); }
                case 'bdel': S().builds.splice(Number(arg), 1); paintNav(); paintInsp(); return commit();
                case 'pbuilds': return previewBuilds();
                case 'ptrans': return previewTrans();
                case 'transall': { const t = JSON.stringify(S().trans || {}); show.slides.forEach(s => { s.trans = JSON.parse(t); }); paintNav(); commit(); return toast('Cette transition va maintenant à toutes les diapositives.'); }
                case 'bgimg': { const m = await ext.pickImage?.({eyebrow: 'PRÉSENTATION', title: 'L’image du fond', filters: false}); if (!m) return; S().bg = {...(S().bg || {}), type: 'image', filename: m.filename}; delete S().bg.src; return touch(true); }
                case 'bgall': { const b = JSON.stringify(S().bg || {type: 'theme'}); show.slides.forEach(s => { s.bg = JSON.parse(b); }); paintAll(); commit(); return toast('Ce fond va maintenant à toutes les diapositives.'); }
                case 'theme': show.theme = THEMES[arg] ? arg : show.theme; paintAll(); return commit();
                case 'dclear': setPath(show, arg, undefined); paintAll(); return commit();
                case 'music': { const m = await pickAV('Une musique pendant la lecture', ['audio']); if (!m) return; if (m.kind !== 'audio') return toast('Choisis un son (MP3, M4A, WAV…).', 'error'); show.music = {media_id: m.media_id, filename: m.filename, title: m.title || 'Musique'}; paintInsp(); return commit(); }
                case 'nomusic': show.music = null; paintInsp(); return commit();
                case 'osel': { const q = obj(arg); if (q) { sel = new Set([q.id]); afterSel(); } return; }
                case 'ohide': { const q = obj(arg); if (q) { if (q.hide) delete q.hide; else q.hide = true; touch(true); } return; }
                case 'olock': { const q = obj(arg); if (q) { if (q.lock) delete q.lock; else q.lock = true; touch(true); } return; }
                case 'oup': case 'odown': { const a = S().objs, i = a.findIndex(q => q.id === arg), j = i + (k === 'oup' ? 1 : -1); if (i < 0 || j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; return touch(true); }
            }
        }
        dlg.addEventListener('click', e => {
            const c = e.target.closest('[data-kn-cmd], [data-kn-ins], [data-kn-tab], [data-kn-x], [data-kn-fold], [data-kn-lay], [data-kn-i]'); if (!c || !dlg.contains(c)) return;
            if (c.closest('details.kn-dd') && !c.matches('summary')) c.closest('details.kn-dd').removeAttribute('open');
            const d = c.dataset;
            if (d.knCmd) return runCmd(d.knCmd);
            if (d.knIns) return insert(d.knIns);
            if (d.knTab) { tab = d.knTab; return paintInsp(); }
            if (d.knX && c.tagName === 'BUTTON') return runX(d.knX, c);
            if (d.knFold) { if (collapsed.has(d.knFold)) collapsed.delete(d.knFold); else collapsed.add(d.knFold); return paintNav(); }
            if (d.knLay) return addSlide(d.knLay);
            if (d.knI !== undefined && c.matches('li')) { navFocus = true; navList.focus({preventScroll: true}); if (Number(d.knI) !== cur) goSlide(Number(d.knI)); }
        });
        // les menus déroulants : un seul ouvert ; le choix des dispositions se dessine en l'ouvrant
        dlg.addEventListener('toggle', e => {
            const dd = e.target; if (!dd.matches?.('details.kn-dd') || !dd.open) return;
            dlg.querySelectorAll('details.kn-dd[open]').forEach(x => { if (x !== dd) x.removeAttribute('open'); });
            if (dd.dataset.knDd === 'layouts') { const [W, H] = WH(), k = 110 / W; dd.querySelector('[data-kn-lays]').innerHTML = LAYOUTS.map(([key, l]) => `<button type="button" data-kn-lay="${key}" title="${esc(l)}"><span class="kn-layth" style="width:110px;height:${Math.round(H * k)}px"><span style="width:${W}px;height:${H}px;transform:scale(${k})">${renderSlide(show, {objs: layoutObjs(key, W, H, themeOf(show)), bg: {type: 'theme'}}, 'edit')}</span></span><small>${esc(l)}</small></button>`).join(''); }
        }, true);
        document.addEventListener('pointerdown', e => { if (closed || e.target.closest?.('details.kn-dd')) return; dlg.querySelectorAll('details.kn-dd[open]').forEach(x => x.removeAttribute('open')); }, {capture: true, signal: docAc.signal});
        /* ─── glisser une diapositive dans la liste, une photo de l'ordinateur sur la diapositive ─── */
        let dragI = -1;
        navList.addEventListener('dragstart', e => { const li = e.target.closest?.('[data-kn-i]'); if (!li) return; dragI = Number(li.dataset.knI); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'kn-slide'); });
        navList.addEventListener('dragover', e => { if (dragI >= 0 && e.target.closest('[data-kn-i]')) { e.preventDefault(); navList.querySelectorAll('.is-drop').forEach(x => x.classList.remove('is-drop')); e.target.closest('[data-kn-i]').classList.add('is-drop'); } });
        navList.addEventListener('drop', e => { const li = e.target.closest('[data-kn-i]'); if (dragI < 0 || !li) return; e.preventDefault(); const to = Number(li.dataset.knI), [m] = show.slides.splice(dragI, 1); show.slides.splice(to, 0, m); cur = to; dragI = -1; paintAll(); commit(); });
        navList.addEventListener('dragend', () => { dragI = -1; navList.querySelectorAll('.is-drop').forEach(x => x.classList.remove('is-drop')); });
        async function addFile(f, at) {
            const [W, H] = WH(), kind = /^image\//.test(f.type) ? 'image' : /^video\//.test(f.type) ? 'video' : /^audio\//.test(f.type) ? 'audio' : '';
            if (!kind) return toast(`${f.name} : ni une image, ni une vidéo, ni un son.`, 'error');
            status(`Envoi de ${f.name}…`);
            try { const u = await uploadBlob(f, f.name || `image.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, kind); status('');
                if (kind === 'image') { const [nw, nh] = await imgSize(mediaUrl(u.filename)), k = Math.min(W * .5 / nw, H * .6 / nh), w = nw * k, h = nh * k; return addObj({id: uid(), t: 'image', ...u, fit: 'cover', name: f.name.replace(/\.[^.]+$/, ''), x: Math.round((at?.x ?? W / 2) - w / 2), y: Math.round((at?.y ?? H / 2) - h / 2), w: Math.round(w), h: Math.round(h)}); }
                addObj({id: uid(), t: kind, ...u, name: f.name.replace(/\.[^.]+$/, ''), controls: kind === 'video', autoplay: kind === 'audio', ...(kind === 'video' ? center(W * .6, W * .6 * 9 / 16) : center(H * .14, H * .14))});
            } catch (err) { status(''); toast(`${f.name} : ${err.message}`, 'error'); }
        }
        let dropAt = null;
        canvasEl.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) dropAt = pt(e); });
        if (UI().bindFileDrop) UI().bindFileDrop(canvasEl, async files => { const at = dropAt; for (const f of files.slice(0, 20)) await addFile(f, at); }, {accept: 'image/*,video/*,audio/*', paste: false}); // ⌘V : le collage de l'éditeur (plus bas)
        else {
            canvasEl.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); canvasEl.classList.add('is-drop'); } });
            canvasEl.addEventListener('dragleave', () => canvasEl.classList.remove('is-drop'));
            canvasEl.addEventListener('drop', async e => { const files = [...(e.dataTransfer?.files || [])]; canvasEl.classList.remove('is-drop'); if (!files.length) return; e.preventDefault(); const at = pt(e); for (const f of files.slice(0, 20)) await addFile(f, at); });
        }
        /* ─── le clavier, coller ─── */
        canvasEl.tabIndex = -1; navList.tabIndex = -1;
        stage.addEventListener('pointerdown', () => { if (!editing) canvasEl.focus({preventScroll: true}); }, true);
        const isTop = () => [...document.querySelectorAll('dialog[open]')].pop() === dlg;
        document.addEventListener('keydown', e => {
            if (!isTop() || e.defaultPrevented) return; // les touches arrivent aussi quand le bouton cliqué a disparu (menu refermé)
            const mod = e.metaKey || e.ctrlKey, k = e.key, kl = k.toLowerCase(), typing = e.target.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]');
            if (mod && kl === 's') { e.preventDefault(); save(); return; }
            if (k === 'Escape' && editing) { e.preventDefault(); escUsed = true; stopEdit(); return; }
            if (typing || e.isComposing) return;
            const done = () => { e.preventDefault(); e.stopPropagation(); };
            if (mod && kl === 'z') { done(); return e.shiftKey ? redo() : undo(); }
            if (mod && kl === 'y') { done(); return redo(); }
            if (mod && kl === 'c') { done(); if (navFocus && !sel.size) { KN_CLIP.slides = [JSON.parse(JSON.stringify(S()))]; KN_CLIP.objs = null; return toast('Diapositive copiée : ⌘V pour la coller.'); } return copySel(); }
            if (mod && kl === 'x') { done(); return copySel(true); }
            if (mod && kl === 'd') { done(); return navFocus && !sel.size ? dupSlide() : dupSel(); }
            if (mod && kl === 'a') { done(); sel = new Set(S().objs.map(o => o.id)); return afterSel(); }
            if (mod && kl === 'g') { done(); return group(!e.shiftKey); }
            if (mod && kl === 'l') { done(); return lockSel(); }
            if (mod && (k === ']' || k === '}')) { done(); return order(e.shiftKey ? 'front' : 'forward'); }
            if (mod && (k === '[' || k === '{')) { done(); return order(e.shiftKey ? 'back' : 'backward'); }
            if (mod && k === 'Enter') { done(); return play(e.altKey ? 0 : cur); }
            if (k === 'Delete' || k === 'Backspace') { done(); return sel.size ? delSel() : navFocus ? delSlide() : null; }
            if (k === 'Enter' && sel.size === 1) { done(); return startEdit(selObjs()[0]); }
            if (k === 'Escape' && sel.size) { done(); escUsed = true; sel = new Set(); return afterSel(); }
            if (k === 'PageDown' || (!sel.size && (k === 'ArrowDown' || k === 'ArrowRight'))) { done(); return goSlide(cur + 1); }
            if (k === 'PageUp' || (!sel.size && (k === 'ArrowUp' || k === 'ArrowLeft'))) { done(); return goSlide(cur - 1); }
            if (k.startsWith('Arrow') && sel.size) { done(); const d = e.shiftKey ? 10 : 1; selObjs().filter(o => !o.lock).forEach(o => { if (k === 'ArrowLeft') o.x -= d; if (k === 'ArrowRight') o.x += d; if (k === 'ArrowUp') o.y -= d; if (k === 'ArrowDown') o.y += d; moveEl(o); }); paintOverlay(); paintThumb(); commit(false); }
        }, {signal: docAc.signal});
        document.addEventListener('paste', async e => {
            if (!isTop()) return;
            const t = e.target.closest?.('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]');
            if (t) { if (t.isContentEditable && editing && obj(editing)?.t === 'text') { const html = e.clipboardData?.getData('text/html'), txt = e.clipboardData?.getData('text/plain') || ''; e.preventDefault(); document.execCommand('insertHTML', false, html ? cleanHtml(html) : esc(txt).replace(/\n/g, '<br>')); } return; }
            const files = [...(e.clipboardData?.files || [])].filter(f => /^image\//.test(f.type));
            if (files.length) { e.preventDefault(); for (const f of files) await addFile(f); return; }
            if (KN_CLIP.objs?.length || KN_CLIP.slides?.length) { e.preventDefault(); paste(); return; }
            const txt = e.clipboardData?.getData('text/plain'); if (txt?.trim()) { e.preventDefault(); const [W, H] = WH(); addObj({id: uid(), t: 'text', role: 'body', ...center(W * .6, H * .3), size: Math.round(H * .04), html: textToHtml(txt.slice(0, 5000))}); }
        }, {signal: docAc.signal});
        dlg.dataset.ownClose = '1'; // Échap : l'outil demande lui-même s'il faut (une seule question « Fermer sans enregistrer ? »)
        dlg.addEventListener('cancel', e => { if (e.target !== dlg) return; e.preventDefault(); if (escUsed) { escUsed = false; return; } const om = dlg.querySelectorAll('details.kn-dd[open]'); if (om.length) { om.forEach(d => d.removeAttribute('open')); return; } if (document.fullscreenElement) return; close(); });
        /* ─── c'est parti ─── */
        ext.editorKeysAttach?.(dlg, 'keynote');
        hist = [snapOf()]; hi = 0;
        paintAll(); requestAnimationFrame(fitZoom);
        if (ctx.importFiles?.length) setTimeout(() => importFiles(ctx.importFiles, ctl), 50);
        if (ctx.openImport) setTimeout(() => openImport(ctl), 50);
        return ctl;
    }

    /* ═════════ Mettre à l'échelle des diapositives (changement de format, import) ═════════ */
    function scaleSlides(slides, W, H, nw, nh) {
        if (W === nw && H === nh) return slides;
        const f = Math.min(nw / W, nh / H), ox = (nw - W * f) / 2, oy = (nh - H * f) / 2;
        slides.forEach(s => (s.objs || []).forEach(o => { if (o.x <= 1 && o.y <= 1 && o.w >= W - 1 && o.h >= H - 1) { o.x = 0; o.y = 0; o.w = nw; o.h = nh; return; } o.x = Math.round(o.x * f + ox); o.y = Math.round(o.y * f + oy); o.w = Math.round(o.w * f); o.h = Math.round(o.h * f); ['size', 'pad', 'radius', 'bw'].forEach(k => { if (o[k]) o[k] = Math.max(1, Math.round(o[k] * f)); }); if (o.sw) o.sw = r1(o.sw * f); if (o.html && f !== 1) o.html = o.html.replace(/font-size:\s*([\d.]+)px/g, (m, n) => `font-size: ${Math.max(4, Math.round(n * f))}px`); }));
        return slides;
    }

    /* ═════════ Lire un fichier zip (pptx, odp) : sans bibliothèque, avec DecompressionStream ═════════ */
    async function unzip(buf) {
        const u8 = new Uint8Array(buf), dv = new DataView(buf); let e = -1;
        for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65600); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
        if (e < 0) throw new Error('ce n’est pas un fichier zip valide (pptx, odp)');
        const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const files = new Map(), dec = new TextDecoder();
        for (let k = 0; k < n && k < 20000; k++) {
            if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) break;
            const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
            files.set(dec.decode(u8.subarray(p + 46, p + 46 + nl)), {method, csize, usize, off}); p += 46 + nl + xl + cl;
        }
        const read = async name => {
            const f = files.get(name); if (!f || f.off + 30 > u8.length || dv.getUint32(f.off, true) !== 0x04034b50) return null;
            const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true), data = u8.subarray(start, start + f.csize);
            if (f.method === 0) return data;
            if (f.method !== 8) throw new Error('compression inconnue dans le fichier');
            if (f.usize > 400e6) throw new Error('un élément du fichier est trop gros');
            if (typeof DecompressionStream !== 'function') throw new Error('ce navigateur ne sait pas ouvrir les fichiers zip (mets-le à jour)');
            return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
        };
        return {names: [...files.keys()], has: n2 => files.has(n2), read, text: async n2 => { const b = await read(n2); return b ? new TextDecoder().decode(b) : null; }};
    }
    /* ─── écrire un zip (sans compression) : les PNG de toutes les diapositives ─── */
    const crc32 = u8 => window.LCNDA_SHEET.crc32(u8); // le fabricant de ZIP commun (app-tableur-engine.js)
    /** ZIP sans compression : le fabricant commun (app-tableur-engine.js, LCNDA_SHEET.zipStore) */
    const zipStore = files => window.LCNDA_SHEET.zipStore(files);

    /* ═════════ Importer ═════════ */
    const parseXml = s => { if (/<!DOCTYPE|<!ENTITY/i.test(String(s || ''))) throw new Error('fichier refusé : il contient des déclarations XML (DOCTYPE ou ENTITY)'); const d = new DOMParser().parseFromString(String(s || ''), 'application/xml'); if (d.getElementsByTagName('parsererror').length) throw new Error('XML illisible dans le fichier'); return d; };
    const kids = (el, l) => el ? [...el.children].filter(c => c.localName === l) : [];
    const kid = (el, l) => el ? [...el.children].find(c => c.localName === l) || null : null;
    const desc = (el, l) => el ? [...el.getElementsByTagNameNS('*', l)] : [];
    const desc1 = (el, l) => el ? el.getElementsByTagNameNS('*', l)[0] || null : null;
    const relPath = (base, target) => { if (/^[a-z]+:/i.test(target)) return null; if (target.startsWith('/')) return target.slice(1); const parts = base.split('/').slice(0, -1); target.split('/').forEach(p => { if (p === '..') parts.pop(); else if (p && p !== '.') parts.push(p); }); return parts.join('/'); };
    const IMG_MIME = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', svg: 'image/svg+xml'};
    /** une image du fichier importé va dans les médias (BMP, TIFF… passent en PNG si le navigateur sait les lire) */
    async function storeImage(bytes, name, title) {
        let ext2 = (name.split('.').pop() || '').toLowerCase(), blob = new Blob([bytes], {type: IMG_MIME[ext2] || 'application/octet-stream'});
        if (!['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext2)) {
            try { const bm = await createImageBitmap(blob), c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d').drawImage(bm, 0, 0); blob = await new Promise(r => c.toBlob(r, 'image/png')); if (!blob) return null; name = name.replace(/\.[^.]+$/, '') + '.png'; } catch (_) { return null; }
        }
        return (await uploadBlob(blob, name.split('/').pop(), 'image', title)).filename;
    }
    const photoSlide = (show, filename, caption = '') => { const s = newSlide(show, 'photo'); const im = s.objs.find(o => o.t === 'image'); im.filename = filename; const tx = s.objs.find(o => o.t === 'text'); if (caption) tx.html = `<div>${esc(caption)}</div>`; else s.objs = s.objs.filter(o => o !== tx); s.layout = 'photo'; return s; };
    /* ─── PowerPoint (.pptx) ─── */
    const PPT_SHAPES = {rect: 'rect', roundRect: 'rounded', snipRoundRect: 'rounded', ellipse: 'ellipse', triangle: 'triangle', rtTriangle: 'rtriangle', diamond: 'diamond', pentagon: 'pentagon', homePlate: 'chevron', hexagon: 'hexagon', octagon: 'octagon', star5: 'star', star4: 'star', star6: 'star', star8: 'star', rightArrow: 'arrow', leftRightArrow: 'darrow', chevron: 'chevron', wedgeRectCallout: 'callout', wedgeRoundRectCallout: 'callout', wedgeEllipseCallout: 'callout', heart: 'heart', plus: 'cross', mathPlus: 'cross', line: 'line', straightConnector1: 'line', flowChartProcess: 'rect', flowChartAlternateProcess: 'rounded', flowChartDecision: 'diamond', flowChartTerminator: 'rounded', flowChartConnector: 'ellipse'};
    const PPT_TRANS = {fade: 'fade', dissolve: 'dissolve', push: 'push', wipe: 'wipe', zoom: 'zoom', cover: 'movein', pull: 'reveal', split: 'wipe', cut: 'none', randomBar: 'wipe', blinds: 'wipe', checker: 'dissolve', circle: 'zoom', morph: 'magic', flip: 'flip', cube: 'cube', box: 'cube', rotate: 'flip', gallery: 'swap', conveyor: 'push', reveal: 'reveal', ferris: 'swap', flythrough: 'zoom', prism: 'cube', doors: 'wipe', window: 'zoom', vortex: 'dissolve', ripple: 'dissolve', honeycomb: 'dissolve', glitter: 'dissolve', shred: 'dissolve', switch: 'flip', flash: 'black', curtains: 'wipe', wind: 'push', airplane: 'swap', origami: 'flip', fracture: 'dissolve', crush: 'zoom', peelOff: 'reveal', pageCurlDouble: 'reveal', pageCurlSingle: 'reveal', drape: 'wipe', prestige: 'fade'};
    async function importPptx(buf, fname, show) {
        const zip = await unzip(buf), name = fname.replace(/\.[^.]+$/, '');
        const presTxt = await zip.text('ppt/presentation.xml'); if (!presTxt) throw new Error('ce n’est pas une présentation PowerPoint (.pptx)');
        const pres = parseXml(presTxt), sz = desc1(pres, 'sldSz'), cx = Number(sz?.getAttribute('cx')) || 12192000, cy = Number(sz?.getAttribute('cy')) || 6858000;
        const W = 1920, H = clamp(Math.round(1920 * cy / cx), 240, 4000), k = W / cx;
        const relsCache = new Map(), xmlCache = new Map();
        const getXml = async path => { if (!path) return null; if (xmlCache.has(path)) return xmlCache.get(path); const t = await zip.text(path); const d = t ? parseXml(t) : null; xmlCache.set(path, d); return d; };
        const rels = async path => { if (relsCache.has(path)) return relsCache.get(path); const m = new Map(), t = await zip.text(path.replace(/([^/]+)$/, '_rels/$1.rels')); if (t) desc(parseXml(t), 'Relationship').forEach(r => m.set(r.getAttribute('Id'), {target: r.getAttribute('TargetMode') === 'External' ? null : relPath(path, r.getAttribute('Target') || ''), type: r.getAttribute('Type') || ''})); relsCache.set(path, m); return m; };
        const relOf = async (path, type) => [...(await rels(path)).values()].find(r => r.type.endsWith('/' + type))?.target || null;
        const presRels = await rels('ppt/presentation.xml');
        const slidePaths = desc(pres, 'sldId').map(e => presRels.get(e.getAttribute('r:id') || e.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'))?.target).filter(Boolean);
        // le thème : ses couleurs et ses polices
        const master0 = slidePaths[0] ? await relOf(await relOf(slidePaths[0], 'slideLayout') || '', 'slideMaster') : null;
        const theme = await getXml(master0 ? await relOf(master0, 'theme') : 'ppt/theme/theme1.xml');
        const scheme = {}; desc1(theme, 'clrScheme') && [...desc1(theme, 'clrScheme').children].forEach(c => { const v = kid(c, 'srgbClr')?.getAttribute('val') || kid(c, 'sysClr')?.getAttribute('lastClr'); if (v) scheme[c.localName] = '#' + v.toLowerCase(); });
        const MAP = {tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2'};
        const majorFont = desc1(desc1(theme, 'majorFont'), 'latin')?.getAttribute('typeface') || '', minorFont = desc1(desc1(theme, 'minorFont'), 'latin')?.getAttribute('typeface') || '';
        const colorOf = el => { if (!el) return ''; const s = kid(el, 'srgbClr')?.getAttribute('val'); if (s && /^[0-9a-f]{6}$/i.test(s)) return '#' + s.toLowerCase(); const sc = kid(el, 'schemeClr')?.getAttribute('val'); if (sc) return scheme[MAP[sc] || sc] || ''; const sy = kid(el, 'sysClr')?.getAttribute('lastClr'); return sy ? '#' + sy.toLowerCase() : ''; };
        const fillOf = spPr => { if (!spPr) return undefined; if (kid(spPr, 'noFill')) return null; const sf = kid(spPr, 'solidFill'); if (sf) return colorOf(sf) || undefined; const gf = kid(spPr, 'gradFill'); if (gf) return colorOf(desc1(gf, 'gs')) || undefined; return undefined; };
        const imgCache = new Map(); let nImg = 0, skippedImg = 0;
        const imageFor = async (path, title) => { if (!path) return null; if (imgCache.has(path)) return imgCache.get(path); const b = await zip.read(path); let f = null; if (b) { try { f = await storeImage(b, path.split('/').pop(), `${name} — image ${++nImg}`); } catch (e) { f = null; } } if (!f) skippedImg++; imgCache.set(path, f); return f; };
        const fontOf = (latin, fb) => { const t = latin && !latin.startsWith('+') ? latin : latin === '+mj-lt' ? majorFont : latin === '+mn-lt' ? minorFont : fb; return fontOk(t); };
        // les « placeholders » : leur place et leur taille par défaut (disposition, puis masque)
        const phList = doc => desc(desc1(doc, 'spTree'), 'sp').map(sp => { const ph = desc1(kid(sp, 'nvSpPr'), 'ph'); return ph ? {type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx'), sp} : null; }).filter(Boolean);
        const phFind = (list, type, idx) => list.find(p => idx != null && p.idx === idx) || list.find(p => p.type === type || (['title', 'ctrTitle'].includes(type) && ['title', 'ctrTitle'].includes(p.type))) || null;
        const xfOf = el => { const xf = kid(kid(el, 'spPr'), 'xfrm') || kid(el, 'xfrm') || kid(kid(el, 'grpSpPr'), 'xfrm'); if (!xf) return null; const off = kid(xf, 'off'), ex = kid(xf, 'ext'); if (!off || !ex) return null; return {x: +off.getAttribute('x') || 0, y: +off.getAttribute('y') || 0, cx: +ex.getAttribute('cx') || 0, cy: +ex.getAttribute('cy') || 0, rot: (+xf.getAttribute('rot') || 0) / 60000, flipH: xf.getAttribute('flipH') === '1', flipV: xf.getAttribute('flipV') === '1', xf}; };
        const defSize = (doc, kind) => { const st = desc1(desc1(doc, 'txStyles'), kind === 'title' ? 'titleStyle' : kind === 'body' ? 'bodyStyle' : 'otherStyle'); const sz = Number(desc1(desc1(st, 'lvl1pPr'), 'defRPr')?.getAttribute('sz') || 0); return sz; };
        const defColor = (doc, kind) => colorOf(kid(desc1(desc1(desc1(doc, 'txStyles'), kind === 'title' ? 'titleStyle' : 'bodyStyle'), 'defRPr'), 'solidFill'));
        const bgOf = async (doc, path) => { const bg = desc1(desc1(doc, 'cSld'), 'bg'); if (!bg) return null; const pr = kid(bg, 'bgPr'), ref = kid(bg, 'bgRef');
            if (pr) { const sf = kid(pr, 'solidFill'); if (sf) return {type: 'color', c1: colorOf(sf) || '#ffffff'}; const gf = kid(pr, 'gradFill'); if (gf) { const gs = desc(gf, 'gs'); return {type: 'gradient', c1: colorOf(gs[0]) || '#ffffff', c2: colorOf(gs[gs.length - 1]) || '#cccccc', angle: Math.round((Number(desc1(gf, 'lin')?.getAttribute('ang') || 5400000) / 60000 + 90) % 360)}; }
                const bf = kid(pr, 'blipFill'); if (bf) { const rid = desc1(bf, 'blip')?.getAttribute('r:embed'), f = rid ? await imageFor((await rels(path)).get(rid)?.target) : null; if (f) return {type: 'image', filename: f, fit: 'cover', c1: '#000000'}; } }
            if (ref) { const c = colorOf(ref); if (c) return {type: 'color', c1: c}; }
            return null; };
        const slides = []; let nSkip = 0;
        for (const [si, path] of slidePaths.slice(0, 500).entries()) {
            const doc = await getXml(path); if (!doc) continue;
            const layoutPath = await relOf(path, 'slideLayout'), layout = await getXml(layoutPath), masterPath = layoutPath ? await relOf(layoutPath, 'slideMaster') : null, master = await getXml(masterPath);
            const lph = layout ? phList(layout) : [], mph = master ? phList(master) : [], sRels = await rels(path);
            const s = {id: uid('s'), type: 'kn', layout: 'blank', bg: (await bgOf(doc, path)) || (layout && await bgOf(layout, layoutPath)) || (master && await bgOf(master, masterPath)) || {type: 'theme'}, trans: {type: 'none', dur: .8, dir: 'l'}, dur: 5, objs: [], builds: [], notes: '', section: '', skip: desc1(doc, 'sld')?.getAttribute('show') === '0' || doc.documentElement.getAttribute('show') === '0'};
            if (s.bg.type === 'theme') s.bg = {type: 'color', c1: scheme.lt1 || '#ffffff'};
            const tr = desc1(doc, 'transition');
            if (tr) { const eff = [...tr.children].find(c => c.localName !== 'sndAc' && c.localName !== 'extLst'); const t = eff ? PPT_TRANS[eff.localName] || 'dissolve' : 'fade'; const d = Number(tr.getAttribute('p14:dur') || tr.getAttributeNS('*', 'dur') || 0) / 1000 || ({slow: 1, med: .75, fast: .5}[tr.getAttribute('spd')] || .8); const dir = eff?.getAttribute('dir'); s.trans = {type: t, dur: clamp(d, .1, 5), dir: {l: 'l', r: 'r', u: 't', d: 'b'}[dir] || 'l'}; const adv = Number(tr.getAttribute('advTm') || 0); if (adv) { s.auto = true; s.dur = clamp(adv / 1000, 1, 600); } }
            const walk = async (node, tf) => {
                for (const el of [...node.children]) {
                    const ln = el.localName;
                    if (ln === 'grpSp') { const g = xfOf(el); const ch = kid(g?.xf, 'chOff'), ce = kid(g?.xf, 'chExt'); if (g && ch && ce) { const ox = +ch.getAttribute('x') || 0, oy = +ch.getAttribute('y') || 0, ex = +ce.getAttribute('cx') || 1, ey = +ce.getAttribute('cy') || 1, sx = g.cx / ex, sy = g.cy / ey; await walk(el, p => tf({x: g.x + (p.x - ox) * sx, y: g.y + (p.y - oy) * sy, cx: p.cx * sx, cy: p.cy * sy, rot: p.rot, flipH: p.flipH, flipV: p.flipV})); } else await walk(el, tf); continue; }
                    if (!['sp', 'pic', 'graphicFrame', 'cxnSp'].includes(ln)) continue;
                    const nv = [...el.children].find(c => /^nv/.test(c.localName)), ph = desc1(nv, 'ph'), phType = ph ? ph.getAttribute('type') || 'body' : '', phIdx = ph?.getAttribute('idx') ?? null;
                    if (['dt', 'ftr', 'sldNum', 'hdr'].includes(phType)) continue; // date, pied de page, numéro
                    let g = xfOf(el); const lp = ph ? phFind(lph, phType, phIdx) : null, mp = ph ? phFind(mph, phType, phIdx) : null;
                    if (!g && lp) g = xfOf(lp.sp); if (!g && mp) g = xfOf(mp.sp); if (!g) continue;
                    g = tf(g);
                    const geo = {x: Math.round(g.x * k), y: Math.round(g.y * k), w: Math.max(4, Math.round(g.cx * k)), h: Math.max(4, Math.round(g.cy * k)), ...(g.rot ? {rot: Math.round(g.rot * 10) / 10} : {})};
                    const nm = nv && desc1(nv, 'cNvPr')?.getAttribute('name') || '';
                    if (ln === 'pic') {
                        const blip = desc1(el, 'blip'), rid = blip?.getAttribute('r:embed') || blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'), f = rid ? await imageFor(sRels.get(rid)?.target) : null; if (!f) continue;
                        const o = {id: uid(), t: 'image', filename: f, fit: 'fill', ...geo}; if (g.flipH) o.flipH = true; if (g.flipV) o.flipV = true;
                        const sr = desc1(kid(el, 'blipFill'), 'srcRect'); if (sr) { const l = +sr.getAttribute('l') || 0, r = +sr.getAttribute('r') || 0, t = +sr.getAttribute('t') || 0, b = +sr.getAttribute('b') || 0; if (l + r + t + b > 0) { o.fit = 'cover'; o.zoom = clamp(1 / Math.max(.15, Math.min(1 - (l + r) / 1e5, 1 - (t + b) / 1e5)), 1, 4); o.px = l + r ? Math.round(l / (l + r) * 100) : 50; o.py = t + b ? Math.round(t / (t + b) * 100) : 50; } }
                        s.objs.push(o); continue;
                    }
                    if (ln === 'graphicFrame') {
                        const tbl = desc1(el, 'tbl');
                        if (tbl) { const rows = kids(tbl, 'tr').slice(0, 40).map(tr2 => kids(tr2, 'tc').slice(0, 16).map(tc => desc(tc, 'p').map(p => desc(p, 't').map(t => t.textContent).join('')).join('\n'))); const fs = Number(desc1(tbl, 'rPr')?.getAttribute('sz') || 1800); s.objs.push({id: uid(), t: 'table', rows, head: desc1(tbl, 'tblPr')?.getAttribute('firstRow') === '1', size: Math.round(fs * 127 * k), ...geo}); continue; }
                        const chartRef = desc1(el, 'chart'), cid = chartRef?.getAttribute('r:id') || chartRef?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
                        if (cid) { const cdoc = await getXml(sRels.get(cid)?.target); const spec = cdoc ? chartSpec(cdoc) : null; if (spec) s.objs.push({id: uid(), t: 'chart', spec, ...geo}); }
                        continue;
                    }
                    const spPr = kid(el, 'spPr'), prst = kid(spPr, 'prstGeom')?.getAttribute('prst') || (kid(spPr, 'custGeom') ? 'rect' : 'rect'), style = kid(el, 'style');
                    let fill = fillOf(spPr); if (fill === undefined && !ph && style) fill = colorOf(kid(style, 'fillRef')) || undefined;
                    const lnEl = kid(spPr, 'ln'); let stroke = lnEl ? (kid(lnEl, 'noFill') ? null : colorOf(kid(lnEl, 'solidFill')) || undefined) : undefined; if (stroke === undefined && !ph && style && Number(kid(style, 'lnRef')?.getAttribute('idx') || 0) > 0) stroke = colorOf(kid(style, 'lnRef')) || undefined;
                    const sw = lnEl?.getAttribute('w') ? Math.max(1, Math.round(+lnEl.getAttribute('w') * k)) : undefined;
                    if (ln === 'cxnSp' || prst === 'line' || prst === 'straightConnector1') { const ar = (lnEl && kid(lnEl, 'tailEnd') && kid(lnEl, 'tailEnd').getAttribute('type') !== 'none') ? (kid(lnEl, 'headEnd') && kid(lnEl, 'headEnd').getAttribute('type') !== 'none' ? 'both' : 'end') : kid(lnEl, 'headEnd') && kid(lnEl, 'headEnd').getAttribute('type') !== 'none' ? 'start' : 'none';
                        const len = Math.max(8, Math.round(Math.hypot(g.cx * k, g.cy * k))), ang = Math.atan2(g.cy * (g.flipV ? -1 : 1), g.cx * (g.flipH ? -1 : 1)) * 180 / Math.PI + (geo.rot || 0), cxp = geo.x + geo.w / 2, cyp = geo.y + geo.h / 2, th2 = Math.max(20, (sw || 3) * 6);
                        s.objs.push({id: uid(), t: 'shape', kind: 'line', arrow: ar, stroke: stroke || colorOf(kid(style, 'lnRef')) || '#000000', sw: sw || 3, x: Math.round(cxp - len / 2), y: Math.round(cyp - th2 / 2), w: len, h: Math.round(th2), rot: Math.round(ang * 10) / 10}); continue; }
                    const txBody = kid(el, 'txBody'), kindTx = ['title', 'ctrTitle'].includes(phType) ? 'title' : phType ? 'body' : 'other';
                    const defSz = Number(desc1(desc1(desc1(lp?.sp, 'lstStyle'), 'lvl1pPr'), 'defRPr')?.getAttribute('sz') || 0) || defSize(master, kindTx) || (kindTx === 'title' ? 4400 : kindTx === 'body' ? 2800 : 1800);
                    const tx = txBody ? pptxText(txBody, k, phType, kindTx, colorOf, fontOf) : {html: '', plain: ''};
                    const bodyPr = kid(txBody, 'bodyPr'), anchor = bodyPr?.getAttribute('anchor') || desc1(kid(lp?.sp, 'txBody'), 'bodyPr')?.getAttribute('anchor') || (phType === 'ctrTitle' ? 'b' : phType === 'title' ? 'ctr' : !ph && prst !== 'rect' ? 'ctr' : 't');
                    const valign = {t: 'top', ctr: 'middle', b: 'bottom'}[anchor] || 'top', size = Math.round(defSz * 127 * k), color = defColor(master, kindTx) || undefined, font = fontOf(null, kindTx === 'title' ? majorFont : minorFont);
                    const hasText = !!tx.plain.trim(), shapeKind = PPT_SHAPES[prst] || 'rect';
                    if (hasText && (shapeKind === 'rect' || shapeKind === 'rounded') && (fill === undefined || fill === null || ph)) {
                        const o = {id: uid(), t: 'text', html: tx.html, size, valign, pad: Math.round(91440 * k * .8), ...geo}; if (tx.align) o.align = tx.align; if (color && !tx.color) o.color = color; if (font) o.font = font; if (fill) o.fill = fill; if (stroke) { o.stroke = stroke; o.sw = sw || 2; } if (shapeKind === 'rounded') o.radius = Math.round(Math.min(geo.w, geo.h) * .15);
                        if (phType) o.role = kindTx === 'title' ? 'title' : phType === 'subTitle' ? 'sub' : 'body'; if (nm && !phType) o.name = nm.slice(0, 80);
                        s.objs.push(o); continue;
                    }
                    if (fill === null && !stroke && !hasText) continue;
                    if (fill === undefined && stroke === undefined && !hasText) continue;
                    const o = {id: uid(), t: 'shape', kind: shapeKind, ...geo}; if (fill) o.fill = fill; else if (fill === null) o.nofill = true; else o.fill = scheme.accent1 || '#4472c4';
                    if (stroke) { o.stroke = stroke; o.sw = sw || 2; } if (g.flipH) o.flipH = true; if (g.flipV) o.flipV = true;
                    if (prst === 'star4') o.points = 4; if (prst === 'star6') o.points = 6; if (prst === 'star8') o.points = 8;
                    if (hasText) { o.text = tx.plain.slice(0, 4000); o.size = tx.size || size; if (tx.color) o.color = tx.color; else o.color = colorOf(kid(style, 'fontRef')) || '#ffffff'; if (font) o.font = font; }
                    s.objs.push(o);
                }
            };
            const tree = desc1(desc1(doc, 'cSld'), 'spTree'); if (tree) await walk(tree, p => p);
            const notesPath = [...sRels.values()].find(r => r.type.endsWith('/notesSlide'))?.target;
            if (notesPath) { const nd = await getXml(notesPath); const body = desc(nd, 'sp').find(sp => desc1(sp, 'ph')?.getAttribute('type') === 'body'); if (body) s.notes = desc(body, 'p').map(p => desc(p, 't').map(t => t.textContent).join('')).join('\n').trim().slice(0, 20000); }
            if (s.skip) nSkip++;
            const t0 = s.objs.find(o => o.role === 'title'); s.layout = t0 && s.objs.some(o => o.role === 'body') ? 'title-content' : t0 && s.objs.some(o => o.role === 'sub') ? 'title' : s.objs.some(o => o.t === 'image' && o.w >= W * .9) ? 'photo' : 'blank';
            slides.push(s); if (si % 5 === 4) await new Promise(r => setTimeout(r, 0));
        }
        if (!slides.length) throw new Error('aucune diapositive trouvée');
        return {slides, meta: {w: W, h: H}, notes: [...(skippedImg ? [`${A().plural(skippedImg, 'image')} dans un format que le navigateur ne lit pas (EMF, WMF…) ont été laissées de côté.`] : [])]};
    }
    function pptxText(txBody, k, phType, kindTx, colorOf, fontOf) {
        let html = '', plain = '', listOpen = '', firstSize = 0, firstColor = '', align = '';
        const ps = kids(txBody, 'p'); while (ps.length && !desc(ps[ps.length - 1], 't').some(t => t.textContent)) ps.pop();
        const close = () => { if (listOpen) { html += `</${listOpen}>`; listOpen = ''; } };
        const isBody = kindTx === 'body' && phType !== 'subTitle';
        ps.forEach(p => {
            const pPr = kid(p, 'pPr'), al = pPr?.getAttribute('algn'); if (!align && al) align = {l: 'left', ctr: 'center', r: 'right', just: 'justify', dist: 'justify'}[al] || '';
            const bullet = !kid(pPr, 'buNone') && (!!kid(pPr, 'buChar') || !!kid(pPr, 'buAutoNum') || isBody), num2 = !!kid(pPr, 'buAutoNum');
            let inner = '', line = '';
            [...p.children].forEach(r => {
                if (r.localName === 'br') { inner += '<br>'; line += '\n'; return; }
                if (r.localName !== 'r' && r.localName !== 'fld') return;
                const t = kid(r, 't')?.textContent || ''; if (!t) return; line += t;
                const rPr = kid(r, 'rPr'), st = [], szv = Number(rPr?.getAttribute('sz') || 0);
                if (szv) { const px = Math.max(4, Math.round(szv * 127 * k)); st.push(`font-size: ${px}px`); if (!firstSize) firstSize = px; }
                if (rPr?.getAttribute('b') === '1') st.push('font-weight: 700'); if (rPr?.getAttribute('i') === '1') st.push('font-style: italic');
                const deco = [rPr?.getAttribute('u') && rPr.getAttribute('u') !== 'none' ? 'underline' : '', rPr?.getAttribute('strike') && rPr.getAttribute('strike') !== 'noStrike' ? 'line-through' : ''].filter(Boolean).join(' '); if (deco) st.push(`text-decoration: ${deco}`);
                const c = colorOf(kid(rPr, 'solidFill')); if (c) { st.push(`color: ${c}`); if (!firstColor) firstColor = c; }
                const lat = kid(rPr, 'latin')?.getAttribute('typeface'); if (lat) { const f = fontCss(fontOf(lat, '')); if (f) st.push(`font-family: ${f}`); }
                inner += st.length ? `<span style="${esc(st.join('; '))}">${esc(t)}</span>` : esc(t);
            });
            plain += (plain ? '\n' : '') + line;
            if (bullet && line.trim()) { const tag = num2 ? 'ol' : 'ul'; if (listOpen !== tag) { close(); html += `<${tag}>`; listOpen = tag; } html += `<li>${inner}</li>`; }
            else { close(); html += `<div>${inner || '<br>'}</div>`; }
        });
        close();
        return {html: cleanHtml(html), plain, size: firstSize, color: firstColor, align};
    }
    /** un graphique PowerPoint (DrawingML chart) → un graphique de l'app */
    function chartSpec(cdoc) {
        const plot = desc1(cdoc, 'plotArea'); if (!plot) return null;
        const ch = [...plot.children].find(c => /Chart$/.test(c.localName)); if (!ch) return null;
        const t = ch.localName, dir = desc1(ch, 'barDir')?.getAttribute('val'), grp = desc1(ch, 'grouping')?.getAttribute('val');
        const kind = t === 'pieChart' || t === 'pie3DChart' || t === 'ofPieChart' ? 'pie' : t === 'doughnutChart' ? 'donut' : t === 'lineChart' || t === 'line3DChart' || t === 'scatterChart' ? 'line' : t === 'areaChart' || t === 'area3DChart' ? 'area' : t === 'radarChart' ? 'radar' : dir === 'bar' ? 'bars' : grp === 'percentStacked' ? 'stacked100' : grp === 'stacked' ? 'stacked' : 'columns';
        const sers = kids(ch, 'ser').slice(0, 10); if (!sers.length) return null;
        const pts = el => { const m = new Map(); desc(el, 'pt').forEach(p => m.set(Number(p.getAttribute('idx')), desc1(p, 'v')?.textContent ?? '')); return m; };
        const cats = pts(desc1(sers[0], 'cat')), n = Math.max(cats.size, ...sers.map(s => pts(desc1(s, 'val')).size));
        const rows = Array.from({length: Math.min(n, 200)}, (_, i) => { const r = {label: String(cats.get(i) ?? i + 1)}; sers.forEach((s, j) => { r['s' + j] = num(pts(desc1(s, 'val')).get(i), 0); }); return r; });
        const title = desc(desc1(cdoc, 'title'), 't').map(x => x.textContent).join('').slice(0, 200);
        return {kind, o: title ? {title} : {}, series: sers.map((s, j) => ({name: desc(desc1(s, 'tx'), 'v').map(x => x.textContent).join('') || `Série ${j + 1}`})), rows};
    }
    /* ─── OpenDocument (.odp : LibreOffice Impress, Keynote → exporté…) ─── */
    const ODF_SHAPES = {rectangle: 'rect', 'round-rectangle': 'rounded', ellipse: 'ellipse', circle: 'ellipse', 'isosceles-triangle': 'triangle', 'right-triangle': 'rtriangle', diamond: 'diamond', pentagon: 'pentagon', hexagon: 'hexagon', octagon: 'octagon', star5: 'star', star4: 'star', star8: 'star', 'right-arrow': 'arrow', 'left-right-arrow': 'darrow', chevron: 'chevron', heart: 'heart', cross: 'cross', 'round-rectangular-callout': 'callout', 'rectangular-callout': 'callout'};
    async function importOdp(buf, fname, show) {
        const zip = await unzip(buf), name = fname.replace(/\.[^.]+$/, ''), ctTxt = await zip.text('content.xml'); if (!ctTxt) throw new Error('ce n’est pas un fichier OpenDocument (.odp)');
        const content = parseXml(ctTxt), stylesDoc = parseXml(await zip.text('styles.xml') || '<x/>');
        const cm = v => { const m = String(v || '').trim().match(/^(-?[\d.]+)\s*(cm|mm|in|inch|pt|pc|px)?$/); if (!m) return 0; const n = Number(m[1]); return n * ({cm: 1, mm: .1, in: 2.54, inch: 2.54, pt: 2.54 / 72, pc: 2.54 / 6, px: 2.54 / 96}[m[2] || 'cm']); };
        const attr = (el, local) => { if (!el) return null; for (const a of el.attributes) if (a.localName === local) return a.value; return null; };
        const styles = new Map(); [...desc(content, 'style'), ...desc(stylesDoc, 'style')].forEach(s => { const n = attr(s, 'name'); if (n && !styles.has(n)) styles.set(n, s); });
        const props = (sname, local, depth = 0) => { const s = styles.get(sname); if (!s || depth > 8) return {}; const par = attr(s, 'parent-style-name'), base = par ? props(par, local, depth + 1) : {}, el = kid(s, local); const out = {...base}; if (el) for (const a of el.attributes) out[a.localName] = a.value; return out; };
        // la taille des pages (celle du masque de la première page)
        const pages = desc(content, 'page').filter(p => p.namespaceURI?.includes('drawing'));
        const mpName = attr(pages[0], 'master-page-name'), mp = desc(stylesDoc, 'master-page').find(m => attr(m, 'name') === mpName) || desc(stylesDoc, 'master-page')[0], plName = attr(mp, 'page-layout-name');
        const pl = desc(stylesDoc, 'page-layout').find(p => attr(p, 'name') === plName) || desc(stylesDoc, 'page-layout')[0], plp = kid(pl, 'page-layout-properties');
        const pw = cm(attr(plp, 'page-width')) || 28, phh = cm(attr(plp, 'page-height')) || 15.75, W = 1920, H = clamp(Math.round(1920 * phh / pw), 240, 4000), k = W / pw;
        const imgCache = new Map(); let nImg = 0, skipped = 0;
        const imageFor = async href => { if (!href || /^[a-z]+:/i.test(href)) return null; const p = href.replace(/^\.\//, ''); if (imgCache.has(p)) return imgCache.get(p); const b = await zip.read(p); let f = null; if (b) { try { f = await storeImage(b, p.split('/').pop(), `${name} — image ${++nImg}`); } catch (_) { f = null; } } if (!f) skipped++; imgCache.set(p, f); return f; };
        const pt2px = v => Math.max(4, Math.round(cm(v) * k));
        const spanStyle = sn => { const tp = props(sn, 'text-properties'), st = []; if (tp['font-size'] && !/%/.test(tp['font-size'])) st.push(`font-size: ${pt2px(tp['font-size'])}px`); if (tp['font-weight'] === 'bold' || Number(tp['font-weight']) >= 600) st.push('font-weight: 700'); if (tp['font-style'] === 'italic') st.push('font-style: italic'); if (hexOk(tp.color)) st.push(`color: ${tp.color.toLowerCase()}`); if (tp['text-underline-style'] && tp['text-underline-style'] !== 'none') st.push('text-decoration: underline'); const fn = tp['font-name'] || tp['font-family']; if (fn) st.push(`font-family: ${fontCss(fn.replace(/'/g, ''))}`); return st.join('; '); };
        const runs = p => { let h = '', t = ''; p.childNodes.forEach(n => { if (n.nodeType === 3) { h += esc(n.nodeValue); t += n.nodeValue; return; } if (n.nodeType !== 1) return; const l = n.localName; if (l === 'line-break') { h += '<br>'; t += '\n'; return; } if (l === 's') { const c = Number(attr(n, 'c') || 1); h += ' '.repeat(c); t += ' '.repeat(c); return; } if (l === 'tab') { h += ' '; t += ' '; return; } const r = runs(n); if (l === 'span') { const st = spanStyle(attr(n, 'style-name')); h += st ? `<span style="${esc(st)}">${r.h}</span>` : r.h; } else h += r.h; t += r.t; }); return {h, t}; };
        const textOf = box => { let html = '', plain = '', size = 0, align = '';
            const para = p => { const r = runs(p), ps = attr(p, 'style-name'); if (!size) { const tp = props(ps, 'text-properties'); if (tp['font-size'] && !/%/.test(tp['font-size'])) size = pt2px(tp['font-size']); } if (!align) align = {start: 'left', left: 'left', center: 'center', end: 'right', right: 'right', justify: 'justify'}[props(ps, 'paragraph-properties')['text-align']] || ''; const st = spanStyle(ps); plain += (plain ? '\n' : '') + r.t; return st ? `<span style="${esc(st)}">${r.h}</span>` : r.h; };
            const list = (l, depth = 0) => { html += '<ul>'; kids(l, 'list-item').forEach(li => { [...li.children].forEach(c => { if (c.localName === 'p' || c.localName === 'h') html += `<li>${para(c) || '<br>'}</li>`; if (c.localName === 'list' && depth < 4) list(c, depth + 1); }); }); html += '</ul>'; };
            [...box.children].forEach(c => { if (c.localName === 'p' || c.localName === 'h') html += `<div>${para(c) || '<br>'}</div>`; else if (c.localName === 'list') list(c); });
            return {html: cleanHtml(html), plain, size, align}; };
        const geoOf = el => { let x = cm(attr(el, 'x')), y = cm(attr(el, 'y')), rot = 0; const w = cm(attr(el, 'width')), h = cm(attr(el, 'height')); const tfm = attr(el, 'transform');
            if (tfm) { const r = tfm.match(/rotate\s*\(\s*(-?[\d.e-]+)\s*\)/), tr = tfm.match(/translate\s*\(\s*(-?[\d.]+\w*)\s+(-?[\d.]+\w*)\s*\)/); if (r) rot = -Number(r[1]) * 180 / Math.PI; if (tr) { const tx = cm(tr[1]), ty = cm(tr[2]); if (r) { const a = Number(r[1]), cx = w / 2, cy = h / 2; x = tx + cx * Math.cos(a) + cy * Math.sin(a) - cx; y = ty - cx * Math.sin(a) + cy * Math.cos(a) - cy; } else { x = tx; y = ty; } } }
            return {x: Math.round(x * k), y: Math.round(y * k), w: Math.max(4, Math.round(w * k)), h: Math.max(4, Math.round(h * k)), ...(rot ? {rot: Math.round(((rot % 360) + 540) % 360 - 180)} : {})}; };
        const gfx = el => { const gp = props(attr(el, 'style-name'), 'graphic-properties'); return {fill: gp.fill === 'none' ? null : hexOk(gp['fill-color']) ? gp['fill-color'].toLowerCase() : undefined, stroke: gp.stroke === 'none' ? null : hexOk(gp['stroke-color']) ? gp['stroke-color'].toLowerCase() : undefined, sw: gp['stroke-width'] ? Math.max(1, Math.round(cm(gp['stroke-width']) * k)) : undefined}; };
        const slides = [];
        for (const page of pages.slice(0, 500)) {
            const s = {id: uid('s'), type: 'kn', layout: 'blank', bg: {type: 'color', c1: '#ffffff'}, trans: {type: 'none', dur: .8, dir: 'l'}, dur: 5, objs: [], builds: [], notes: '', section: ''};
            const dp = props(attr(page, 'style-name'), 'drawing-page-properties'); if (dp.fill === 'solid' && hexOk(dp['fill-color'])) s.bg = {type: 'color', c1: dp['fill-color'].toLowerCase()};
            if (dp['transition-type'] || dp.type) s.trans = {type: {fade: 'fade', pushWipe: 'push', barWipe: 'wipe', slideWipe: 'movein', irisWipe: 'zoom', zoom: 'zoom'}[dp.type] || 'dissolve', dur: clamp(cm(dp.dur?.replace('s', 'cm') || '') || .8, .1, 5), dir: 'l'};
            if (attr(page, 'display') === 'false' || dp.visibility === 'hidden') s.skip = true;
            const walk = async node => { for (const el of [...node.children]) {
                const l = el.localName, cls = attr(el, 'class');
                if (l === 'g') { await walk(el); continue; }
                if (l === 'notes') { const tb = desc1(el, 'text-box'); if (tb) s.notes = textOf(tb).plain.slice(0, 20000); continue; }
                if (l === 'frame') {
                    if (['page-number', 'footer', 'date-time', 'header'].includes(cls)) continue;
                    const geo = geoOf(el), img = kid(el, 'image'), tb = kid(el, 'text-box'), tbl = desc1(el, 'table');
                    // un tableau d'abord : son cadre porte aussi une image d'aperçu (TablePreview.svm) qu'un navigateur ne sait pas lire
                    if (tbl) { const rows = desc(tbl, 'table-row').slice(0, 40).map(r => kids(r, 'table-cell').slice(0, 16).map(c => desc(c, 'p').map(p => p.textContent).join('\n'))); s.objs.push({id: uid(), t: 'table', rows, head: true, size: Math.round(H * .028), ...geo}); continue; }
                    if (img && !tb) { const f = await imageFor(attr(img, 'href')); if (f) s.objs.push({id: uid(), t: 'image', filename: f, fit: 'fill', ...geo}); continue; }
                    if (tb) { const tx = textOf(tb); if (!tx.plain.trim() && !['title', 'subtitle', 'outline'].includes(cls)) continue; const g2 = gfx(el), o = {id: uid(), t: 'text', html: tx.html, size: tx.size || Math.round(H * (cls === 'title' ? .07 : .04)), ...geo}; if (tx.align) o.align = tx.align; if (g2.fill) o.fill = g2.fill; if (cls === 'title') { o.role = 'title'; o.valign = 'middle'; } if (cls === 'subtitle') o.role = 'sub'; if (cls === 'outline') { o.role = 'body'; if (!/<ul|<ol/.test(o.html)) o.html = cleanHtml(`<ul>${tx.plain.split('\n').filter(Boolean).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`); } s.objs.push(o); }
                    continue;
                }
                if (['custom-shape', 'rect', 'ellipse', 'circle', 'polygon', 'regular-polygon'].includes(l)) {
                    const geo = geoOf(el), g2 = gfx(el), type = attr(desc1(el, 'enhanced-geometry'), 'type'), kind = l === 'ellipse' || l === 'circle' ? 'ellipse' : l === 'rect' ? 'rect' : ODF_SHAPES[type] || 'rect';
                    const txt = desc(el, 'p').map(p => p.textContent).join('\n').trim();
                    if (g2.fill === null && !g2.stroke && !txt) continue;
                    const o = {id: uid(), t: 'shape', kind, ...geo}; if (g2.fill) o.fill = g2.fill; else if (g2.fill === null) o.nofill = true; else o.fill = '#729fcf'; if (g2.stroke) { o.stroke = g2.stroke; o.sw = g2.sw || 2; }
                    if (txt) { o.text = txt.slice(0, 4000); o.size = Math.round(H * .035); o.color = '#000000'; } s.objs.push(o); continue;
                }
                if (l === 'line' || l === 'connector') { const x1 = cm(attr(el, 'x1')) * k, y1 = cm(attr(el, 'y1')) * k, x2 = cm(attr(el, 'x2')) * k, y2 = cm(attr(el, 'y2')) * k, g2 = gfx(el), len = Math.max(8, Math.hypot(x2 - x1, y2 - y1)), sw = g2.sw || 3, th2 = Math.max(20, sw * 6);
                    s.objs.push({id: uid(), t: 'shape', kind: 'line', stroke: g2.stroke || '#000000', sw, x: Math.round((x1 + x2) / 2 - len / 2), y: Math.round((y1 + y2) / 2 - th2 / 2), w: Math.round(len), h: Math.round(th2), rot: Math.round(Math.atan2(y2 - y1, x2 - x1) * 1800 / Math.PI) / 10}); }
            } };
            await walk(page);
            const t0 = s.objs.find(o => o.role === 'title'); s.layout = t0 && s.objs.some(o => o.role === 'body') ? 'title-content' : t0 ? 'title' : 'blank';
            slides.push(s);
        }
        if (!slides.length) throw new Error('aucune diapositive trouvée');
        return {slides, meta: {w: W, h: H}, notes: skipped ? [`${A().plural(skipped, 'image illisible laissée', 'images illisibles laissées')} de côté.`] : []};
    }
    /* ─── PDF : les images qu'il contient (scans, photos), une par diapositive ─── */
    const ascii85 = str => { let t = str.replace(/\s/g, ''); if (t.startsWith('<~')) t = t.slice(2); const e = t.indexOf('~>'); if (e >= 0) t = t.slice(0, e); const out = []; let i = 0;
        while (i < t.length && out.length < 60e6) { if (t[i] === 'z') { out.push(0, 0, 0, 0); i++; continue; } let ch = t.slice(i, i + 5); i += 5; const pad = 5 - ch.length; ch += 'uuuu'.slice(0, pad); let v = 0; for (const c of ch) v = v * 85 + (c.charCodeAt(0) - 33); out.push(...[v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255].slice(0, 4 - pad)); }
        return new Uint8Array(out); };
    async function importPdf(buf, fname, show) {
        const u8 = new Uint8Array(buf), s = new TextDecoder('latin1').decode(u8), out = [];
        if (!s.startsWith('%PDF')) throw new Error('ce n’est pas un PDF');
        const re = /stream\r?\n/g; let m;
        while ((m = re.exec(s)) && out.length < 300) {
            const objStart = s.lastIndexOf(' obj', m.index); if (objStart < 0 || m.index - objStart > 4000) continue;
            const dict = s.slice(objStart, m.index);
            if (!/\/Subtype\s*\/Image/.test(dict) || !/\/DCTDecode/.test(dict) || /\/FlateDecode|\/LZWDecode|\/ASCIIHex/.test(dict)) continue;
            const a85 = /\/ASCII85Decode/.test(dict);
            const w = Number(dict.match(/\/Width\s+(\d+)/)?.[1] || 0), h = Number(dict.match(/\/Height\s+(\d+)/)?.[1] || 0); if (w && h && (w < 160 || h < 160)) continue;
            const start = m.index + m[0].length; let len = Number(dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/)?.[1] || 0);
            if (!len || start + len > u8.length) { const e = s.indexOf('endstream', start); if (e < 0) continue; len = e - start; }
            const data = a85 ? ascii85(s.slice(start, start + len)) : u8.subarray(start, start + len); if (data[0] !== 0xff || data[1] !== 0xd8) continue;
            out.push(data.slice()); re.lastIndex = start + len;
        }
        if (!out.length) throw new Error('aucune image (scan, photo) n’a été trouvée dans ce PDF. Son texte et ses dessins ne peuvent pas être lus ici : exporte-le plutôt en images, ou en PowerPoint depuis le logiciel qui l’a fait');
        const slides = []; let i = 0; for (const d of out) { const f = await storeImage(d, `page-${++i}.jpg`, `${fname.replace(/\.[^.]+$/, '')} — image ${i}`); if (f) slides.push(photoSlide(show, f)); }
        return {slides, notes: [`PDF : ${A().plural(slides.length, 'image reprise', 'images reprises')} ; le texte et les dessins du PDF ne sont pas lus.`]};
    }
    /* ─── Markdown, texte : « # » = une diapositive, « - » = une puce, « --- » sépare, « > » une citation ─── */
    function importText(txt, show, md = true) {
        const [W, H] = dims(show), th = themeOf(show), lines = String(txt || '').replace(/\r\n?/g, '\n').split('\n').slice(0, 20000), list = [];
        let cur = null, fence = false, pendingNew = false;
        const inline = x => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/__(.+?)__/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<i>$2</i>').replace(/~~(.+?)~~/g, '<s>$1</s>').replace(/`([^`]+)`/g, '<span style="font-family: monospace">$1</span>').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
        const start = title => { cur = {title, sub: '', body: [], quote: [], notes: [], inNotes: false}; list.push(cur); pendingNew = false; };
        const empty = c => c && !c.title && !c.body.length && !c.quote.length && !c.sub;
        if (md && lines.some(l => /^#{1,6}\s|^---+\s*$|^\s*[-*+]\s/.test(l))) {
            lines.forEach(l => {
                if (/^```/.test(l)) { fence = !fence; return; }
                if (!cur) start('');
                if (fence) { cur.body.push({t: 'p', h: `<span style="font-family: monospace">${esc(l)}</span>`}); return; }
                if (/^(---+|\*\*\*+)\s*$/.test(l)) { pendingNew = true; return; }
                if (pendingNew && l.trim() && !empty(cur)) start('');
                if (cur.inNotes && !/^#{1,2}\s/.test(l)) { cur.notes.push(l); return; }
                cur.inNotes = false;
                const hm = l.match(/^(#{1,6})\s+(.*)$/);
                if (hm) { const lv = hm[1].length; if (lv <= 2 && (cur.title || cur.body.length || cur.quote.length) && !(lv === 2 && cur.title && !cur.sub && !cur.body.length)) start(hm[2].trim()); else if (lv <= 2 && !cur.title) cur.title = hm[2].trim(); else if (lv === 2 && !cur.sub && !cur.body.length) cur.sub = hm[2].trim(); else cur.body.push({t: 'p', h: `<b>${inline(hm[2])}</b>`}); return; }
                const nm = l.match(/^\s*(?:Notes?|\^)\s*:?\s?(.*)$/i); if (/^\s*(Notes?\s*:|\^\s)/i.test(l)) { cur.inNotes = true; if (nm[1]) cur.notes.push(nm[1]); return; }
                const li = l.match(/^(\s*)([-*+•]|\d+[.)])\s+(.*)$/); if (li) { cur.body.push({t: /\d/.test(li[2]) ? 'ol' : 'ul', h: inline(li[3]), lvl: Math.min(3, Math.floor(li[1].replace(/\t/g, '  ').length / 2))}); return; }
                const q = l.match(/^>\s?(.*)$/); if (q) { cur.quote.push(q[1]); return; }
                if (l.trim()) cur.body.push({t: 'p', h: inline(l.trim())});
            });
        } else String(txt || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).slice(0, 400).forEach(b => { const ls = b.split('\n'); start(ls[0].replace(/^#+\s*/, '')); ls.slice(1).forEach(x => { const li = x.match(/^\s*[-*•]\s+(.*)$/); cur.body.push(li ? {t: 'ul', h: inline(li[1]), lvl: 0} : {t: 'p', h: inline(x)}); }); });
        const bodyHtml = items => { let h = ''; const stack = [], closeTo = d => { while (stack.length > d) h += `</${stack.pop()}>`; };
            items.forEach(it => { if (it.t === 'p') { closeTo(0); h += `<div>${it.h || '<br>'}</div>`; return; } const d = Math.min(stack.length + 1, (it.lvl || 0) + 1); closeTo(d); if (stack.length === d && stack[d - 1] !== it.t) closeTo(d - 1); while (stack.length < d) { h += `<${it.t}>`; stack.push(it.t); } h += `<li>${it.h}</li>`; }); closeTo(0); return h; };
        return list.filter(c => !empty(c) || c.notes.length).slice(0, 500).map((c, i) => {
            const quoteOnly = c.quote.length && !c.body.length, layout = quoteOnly ? 'quote' : c.body.length ? 'title-content' : i === 0 ? 'title' : 'section';
            const s = newSlide(show, layout), T = s.objs.find(o => ['title', 'quote'].includes(o.role)), Sb = s.objs.find(o => o.role === 'sub'), Bd = s.objs.find(o => o.role === 'body');
            if (quoteOnly) { T.html = `<div>« ${inline(c.quote.join(' '))} »</div>`; if (Sb) Sb.html = c.title ? `<div>${inline(c.title)}</div>` : ''; }
            else { if (T) T.html = c.title ? `<div>${inline(c.title)}</div>` : ''; if (Sb) Sb.html = c.sub ? `<div>${inline(c.sub)}</div>` : ''; if (Bd) { Bd.html = cleanHtml(bodyHtml(c.body) + (c.quote.length ? `<div><i>« ${inline(c.quote.join(' '))} »</i></div>` : '')); const n = c.body.length; if (n > 7) Bd.size = Math.max(14, Math.round(Bd.size * Math.max(.5, 7 / n))); } }
            if (!c.title && T && layout === 'title-content') { s.objs = s.objs.filter(o => o !== T); Bd.y = Math.round(H * .08); Bd.h = Math.round(H * .84); }
            s.notes = c.notes.join('\n').trim().slice(0, 20000);
            s.objs = s.objs.filter(o => o.t !== 'text' || o.html || o.role === 'title');
            return s;
        });
    }
    /** un diaporama simple (photos, titres, cartes) → des diapositives de présentation */
    function fromDiaporama(src, show) {
        return (Array.isArray(src.slides) ? src.slides : []).filter(x => x && typeof x === 'object').map(x => {
            const notes = typeof x.notes === 'string' ? x.notes.slice(0, 4000) : '', tr = {fade: 'dissolve', black: 'black', slide: 'push'}[x.trans];
            const fin = s => { if (notes) s.notes = [s.notes, notes].filter(Boolean).join('\n'); if (tr) s.trans = {type: tr, dur: .8}; return s; };
            if (x.type === 'photo' && fileOk(x.filename)) { const s = photoSlide(show, x.filename, x.text || ''); s.dur = num(x.dur, 6); return fin(s); }
            // un titre avec un portrait (récit d'une vie) : la photo et le nom en légende
            if (x.type === 'title' && fileOk(x.filename)) { const s = photoSlide(show, x.filename, [x.title, x.sub].filter(Boolean).join(' — ')); s.dur = num(x.dur, 5); return fin(s); }
            const s = newSlide(show, 'title'), T = s.objs.find(o => o.role === 'title'), Sb = s.objs.find(o => o.role === 'sub');
            T.html = x.title ? `<div>${esc(x.title)}</div>` : ''; Sb.html = x.sub || x.text ? String(x.sub || x.text).split('\n').map(l => `<div>${esc(l)}</div>`).join('') : '';
            if (x.type === 'map') { Sb.html = `<div>${esc(x.text || (x.route || []).map(p => p.label || p.name).filter(Boolean).join(' → ') || '')}</div>`; s.notes = 'Carte du diaporama : le trajet animé reste dans le diaporama.'; }
            if (hexOk(x.bg)) s.bg = {type: 'color', c1: x.bg}; s.dur = num(x.dur, 5);
            return fin(s);
        });
    }
    function importJson(txt, show) {
        let d; try { d = JSON.parse(txt); } catch (_) { throw new Error('JSON illisible'); }
        const sh = d?.type === 'lcnda-presentation' ? d.show : d?.show && typeof d.show === 'object' ? d.show : d;
        if (!sh || !Array.isArray(sh.slides)) throw new Error('ce n’est pas une présentation de l’app');
        if (sh.mode !== 'keynote') return {slides: fromDiaporama(sh, show)};
        const n = normalize(sh); n.slides.forEach(s => { s.id = uid('s'); });
        return {slides: n.slides, meta: {w: n.w, h: n.h}};
    }
    async function importFiles(files, ctl, {replace = false} = {}) {
        const all = [], notes = []; let meta = null;
        toast(`Import de ${files.length} fichier${files.length > 1 ? 's' : ''}…`);
        for (const f of files.slice(0, 200)) {
            const ex = (f.name.split('.').pop() || '').toLowerCase();
            try {
                if (ex === 'key') { notes.push(`${f.name} : Keynote garde ses fichiers dans un format fermé. Dans Keynote : Fichier → Exporter vers → PowerPoint (ou PDF, ou Images), puis importe ce fichier ici.`); continue; }
                if (['ppt', 'pps', 'pot'].includes(ex)) { notes.push(`${f.name} : l’ancien format PowerPoint (avant 2007) ne se lit pas ici ; ouvre-le et enregistre-le en .pptx.`); continue; }
                if (f.size > 400e6) throw new Error('fichier trop gros (400 Mo au plus)');
                let r = null;
                if (['pptx', 'potx', 'ppsx', 'pptm'].includes(ex)) r = await importPptx(await f.arrayBuffer(), f.name, ctl.show);
                else if (['odp', 'otp', 'fodp'].includes(ex)) r = await importOdp(await f.arrayBuffer(), f.name, ctl.show);
                else if (ex === 'pdf') r = await importPdf(await f.arrayBuffer(), f.name, ctl.show);
                else if (['md', 'markdown', 'txt', 'text'].includes(ex)) r = {slides: importText(await f.text(), ctl.show, ex !== 'txt')};
                else if (ex === 'json') r = importJson(await f.text(), ctl.show);
                else if (/^image\//.test(f.type) || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff'].includes(ex)) { const fn = await storeImage(new Uint8Array(await f.arrayBuffer()), f.name, f.name.replace(/\.[^.]+$/, '')); if (!fn) { notes.push(`${f.name} : image illisible.`); continue; } r = {slides: [photoSlide(ctl.show, fn)]}; }
                else { notes.push(`${f.name} : format non reconnu.`); continue; }
                if (!r.slides?.length) { notes.push(`${f.name} : rien à importer.`); continue; }
                if (r.meta && !(replace || all.length === 0) && meta && (r.meta.w !== meta.w || r.meta.h !== meta.h)) scaleSlides(r.slides, r.meta.w, r.meta.h, meta.w, meta.h);
                else if (r.meta && !meta) meta = r.meta;
                all.push(...r.slides); (r.notes || []).forEach(n => notes.push(`${f.name} : ${n}`));
            } catch (e) { notes.push(`${f.name} : ${e.message}`); }
        }
        if (all.length) ctl.addSlides(all, {replace, meta});
        const s = all.length > 1 ? 's' : '';
        if (notes.length) ext.openDialog({eyebrow: 'IMPORT', title: all.length ? `${all.length} diapositive${s} importée${s}` : 'Rien n’a été importé', body: `<ul>${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`}); // un compte rendu : « Fermer » seul (K3)
        else toast(`${all.length} diapositive${s} importée${s}.`);
    }
    function openImport(ctl) {
        ext.openDialog({eyebrow: 'PRÉSENTATION', title: '⤒ Importer', submitLabel: 'Importer', wide: true,
            body: `${IMPORT_HELP}<label>Fichiers<input type="file" name="kn_files" multiple accept=".pptx,.potx,.ppsx,.odp,.otp,.key,.pdf,.md,.markdown,.txt,.json,image/*"></label><label class="checkbox-line"><input type="checkbox" name="kn_replace"> Remplacer les diapositives actuelles (sinon : ajoutées après la diapositive affichée)</label>`,
            onSubmit: f => { const files = [...(f.elements.kn_files.files || [])]; if (!files.length) return window.LCNDA_UI.fail(f.elements.kn_files, 'Choisis au moins un fichier.'); importFiles(files, ctl, {replace: !!f.elements.kn_replace?.checked}); }});
    }
    const IMPORT_HELP = `<ul class="kn-implist"><li><b>PowerPoint (.pptx)</b> et <b>OpenDocument / LibreOffice Impress (.odp)</b> : chaque diapositive avec ses textes (à leur place, taille, gras, couleur, listes), ses images, ses formes simples, ses tableaux, ses graphiques, ses notes et ses transitions.</li>
        <li><b>Keynote (.key)</b> : le format d’Apple est fermé. Dans Keynote : Fichier → Exporter vers → <b>PowerPoint</b> (ou PDF, ou Images), puis importe ce fichier ici.</li>
        <li><b>PDF</b> : les images qu’il contient (scans, photos) deviennent des diapositives, une par image. Le texte et les dessins d’un PDF ne se lisent pas ici : pour une présentation, exporte-la plutôt en PowerPoint ou en images.</li>
        <li><b>Images</b> (JPG, PNG, WEBP, GIF, BMP…), plusieurs à la fois : une diapositive « photo pleine page » par image.</li>
        <li><b>Markdown (.md) ou texte (.txt)</b> : « # Titre » commence une diapositive, « - » fait une puce, « --- » sépare deux diapositives, « > » une citation, « Notes: » les notes de l’orateur. Un texte simple : un paragraphe par diapositive.</li>
        <li><b>JSON</b> : une présentation (ou un diaporama) exportée par l’app.</li></ul>`;

    /* ═════════ Exporter : PDF / impression, PNG, vidéo ═════════ */
    const PRINT_CSS = '*{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}ul{list-style:disc;padding-left:1.2em;margin:.15em 0}ol{padding-left:1.4em;margin:.15em 0}li{margin:.1em 0}';
    function exportPrint(show, name, withNotes) {
        const [W, H] = dims(show), list = show.slides.filter(s => !s.skip); if (!list.length) return toast('Aucune diapositive à imprimer.', 'error');
        const w = window.open('', '_blank'); if (!w) return toast('Fenêtre bloquée : autorise les fenêtres surgissantes pour cette page.', 'error');
        const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, ''), k = 700 / W;
        const page = (s, i) => withNotes ? `<div class="pg n"><div class="nb">${i + 1}</div><div class="sl" style="width:${Math.round(W * k)}px;height:${Math.round(H * k)}px"><div style="width:${W}px;height:${H}px;transform:scale(${k});transform-origin:0 0">${renderBuilt(show, s, 'print')}</div></div><div class="notes">${s.notes ? esc(s.notes).replace(/\n/g, '<br>') : '<i>Pas de notes.</i>'}</div></div>` : `<div class="pg">${renderBuilt(show, s, 'print')}</div>`;
        const css = withNotes ? '@page{size:A4 portrait;margin:14mm}body{margin:0;font:14px/1.5 Georgia,serif;color:#222}.pg{page-break-after:always;break-after:page;padding-top:4px}.sl{overflow:hidden;border:1px solid #bbb;margin:6px 0 14px}.nb{font:600 12px sans-serif;color:#888}'
            : `@page{size:${W}px ${H}px;margin:0}html,body{margin:0;background:#fff}.pg{width:${W}px;height:${H}px;overflow:hidden;page-break-after:always;break-after:page;position:relative}`;
        w.document.open(); w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(name || 'Présentation')}</title><base href="${esc(base)}"><style>${PRINT_CSS}${css}</style></head><body>${list.map(page).join('')}</body></html>`); w.document.close();
        const imgs = [...w.document.images], go = () => { try { w.focus(); w.print(); } catch (_) {} };
        Promise.race([Promise.all(imgs.map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))), new Promise(r => setTimeout(r, 8000))]).then(() => setTimeout(go, 300));
    }
    /** o (fenêtre d'export) : {direct, filename, saveCopy} — direct : les erreurs remontent à la fenêtre */
    async function exportPng(show, name, which, o = {}) {
        const idx = which || show.slides.map((s, i) => i).filter(i => !show.slides[i].skip); if (!idx.length) { if (o.direct) throw new Error('aucune diapositive'); return toast('Aucune diapositive.', 'error'); }
        if (!o.direct) toast(idx.length > 1 ? `Préparation de ${idx.length} images…` : 'Préparation de l’image…');
        try {
            const blobs = []; for (const i of idx) { const c = await slideCanvas(show, show.slides[i], 1); blobs.push([i, await new Promise((r, j) => { try { c.toBlob(b => b ? r(b) : j(new Error('image vide')), 'image/png'); } catch (e) { j(e); } })]); }
            if (blobs.length === 1) { const fn = o.filename || `${safeName(name)}-${blobs[0][0] + 1}.png`; download(blobs[0][1], fn); if (o.saveCopy) await uploadBlob(blobs[0][1], fn, 'image', `${name} — diapositive ${blobs[0][0] + 1}`); return; }
            const files = []; for (const [i, b] of blobs) files.push({name: `${safeName(name)}-${String(i + 1).padStart(3, '0')}.png`, data: new Uint8Array(await b.arrayBuffer())});
            download(zipStore(files), o.filename || `${safeName(name)}-diapositives.zip`);
        } catch (e) { if (o.direct) throw e; toast(`Export impossible : ${e.message}`, 'error'); }
    }
    async function exportVideo(show, name, status = () => {}, o = {}) {
        const list = show.slides.filter(s => !s.skip); if (!list.length) { if (o.direct) throw new Error('aucune diapositive'); return toast('Aucune diapositive.', 'error'); }
        if (typeof MediaRecorder !== 'function') { if (o.direct) throw new Error('ce navigateur ne sait pas enregistrer de vidéo'); return toast('Ce navigateur ne sait pas enregistrer de vidéo.', 'error'); }
        const [W, H] = dims(show), sc = Math.min(1, 1280 / W), cw = Math.round(W * sc / 2) * 2, chh = Math.round(H * sc / 2) * 2, durs = list.map(s => clamp(num(s.dur, 5), 1, 600)), total = durs.reduce((a, b) => a + b, 0);
        if (!o.direct && !await A().confirmBox(`La vidéo rejoue la présentation en entier (${fmt(total)}, durées de l’onglet 🖼 Diapositive) et l’enregistre. Laisse la fenêtre ouverte.`, {title: 'Fabriquer la vidéo ?', okLabel: 'Fabriquer la vidéo'})) return;
        try {
            const frames = []; for (const [i, s] of list.entries()) { status(`⏺ Préparation : ${i + 1} / ${list.length}`); frames.push(await slideCanvas(show, s, sc)); }
            const c = document.createElement('canvas'); c.width = cw; c.height = chh; const g = c.getContext('2d'), vs = c.captureStream(30);
            const ac = new AudioContext(), dest = ac.createMediaStreamDestination(); let mus = null;
            if (show.music?.filename && fileOk(show.music.filename)) { const a = new Audio(); a.crossOrigin = 'anonymous'; a.src = mediaUrl(show.music.filename); a.loop = true; const gn = ac.createGain(); gn.gain.value = clamp(num(show.musicVol, .5), 0, 1); ac.createMediaElementSource(a).connect(gn).connect(dest); mus = a; const o = ac.createConstantSource(), z = ac.createGain(); z.gain.value = 0; o.connect(z).connect(dest); o.start(); await ac.resume().catch(() => {}); }
            const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
            const mr = new MediaRecorder(new MediaStream([...vs.getVideoTracks(), ...(mus ? dest.stream.getAudioTracks() : [])]), mime ? {mimeType: mime, videoBitsPerSecond: 6e6} : {}), chunks = [];
            mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); }; const done = new Promise(r => { mr.onstop = r; });
            const starts = []; durs.reduce((a, d) => { starts.push(a); return a + d; }, 0);
            const draw = t => { let i = starts.findIndex((a, k2) => t >= a && (k2 === starts.length - 1 || t < starts[k2 + 1])); if (i < 0) i = list.length - 1; const local = t - starts[i], tr = list[i].trans || {}, td = Math.min(clamp(num(tr.dur, .8), .1, 2), durs[i] / 2);
                g.fillStyle = '#000'; g.fillRect(0, 0, cw, chh);
                if (i > 0 && local < td && tr.type && tr.type !== 'none') { const a = local / td, prev = frames[i - 1], nxt = frames[i];
                    if (['push', 'movein', 'reveal', 'swap', 'cube'].includes(tr.type)) { const sg = tr.dir === 'r' ? 1 : -1; g.drawImage(prev, sg * a * cw, 0); g.drawImage(nxt, sg * (a - 1) * cw, 0); }
                    else if (tr.type === 'black') { g.globalAlpha = a < .5 ? 1 - a * 2 : (a - .5) * 2; g.drawImage(a < .5 ? prev : nxt, 0, 0); g.globalAlpha = 1; }
                    else { g.drawImage(prev, 0, 0); g.globalAlpha = a; g.drawImage(nxt, 0, 0); g.globalAlpha = 1; } }
                else g.drawImage(frames[i], 0, 0); return i; };
            draw(0); mr.start(500); mus?.play().catch(() => {});
            const t0 = performance.now();
            // la présentation fermée pendant l'enregistrement : on arrête là, sans téléchargement surprise plus tard
            let stopped = false;
            await new Promise(res => { const step = () => { if (o.alive && !o.alive()) { stopped = true; return res(); } const t = (performance.now() - t0) / 1000; if (t >= total) { draw(total - .01); return res(); } draw(t); status(`⏺ Vidéo : ${Math.round(t / total * 100)} %`); requestAnimationFrame(step); }; step(); });
            mr.stop(); mus?.pause(); await done; ac.close().catch(() => {}); status('');
            if (stopped) { toast('Vidéo arrêtée : la présentation a été fermée pendant l’enregistrement.'); return; }
            const blob = new Blob(chunks, {type: 'video/webm'}); if (!blob.size) { if (o.direct) throw new Error('la vidéo est vide : l’enregistrement n’a pas pu se faire dans ce navigateur'); return toast('La vidéo est vide : l’enregistrement n’a pas pu se faire dans ce navigateur.', 'error'); }
            if (o.direct) { download(blob, o.filename || `${safeName(name)}.webm`); if (o.saveCopy) await uploadBlob(blob, o.filename || 'presentation.webm', 'video', name || 'Présentation'); toast(o.saveCopy ? 'Vidéo téléchargée et rangée dans les Médias.' : 'Vidéo téléchargée.'); return; }
            if (await A().confirmBox('Tu peux l’ajouter aux Médias de l’app, ou seulement la télécharger.', {title: 'Vidéo prête', okLabel: 'Ajouter aux Médias', cancelLabel: 'Télécharger seulement', danger: false})) { const u = await uploadBlob(blob, 'presentation.webm', 'video', name || 'Présentation'); toast(u ? 'Vidéo ajoutée aux Médias.' : 'Envoi impossible.'); }
            else download(blob, `${safeName(name)}.webm`);
        } catch (e) { status(''); if (o.direct) throw e; toast(`Vidéo impossible : ${e.message}`, 'error'); }
    }

    /* ═════════ Commencer : choisir un thème et un format ; importer ═════════ */
    function newPresentation(ctx = {}) {
        const p = prefs(), sample = t => { const sh = newShowFrom({...p, theme: t, aspect: '16:9'}), [W, H] = dims(sh), o = layoutObjs('title', W, H, themeOf(sh)); o[0].html = '<div>Titre</div>'; o[1].html = '<div>Sous-titre</div>'; return `<span class="kn-newprev"><span style="width:${W}px;height:${H}px;transform:scale(${150 / W})">${renderSlide(sh, {objs: o, bg: {type: 'theme'}}, 'thumb')}</span></span>`; };
        ext.openDialog({eyebrow: 'NOUVELLE PRÉSENTATION', title: '🎤 Choisis un thème', submitLabel: 'Créer la présentation', wide: true,
            body: `<div class="kn-newgrid">${Object.entries(THEMES).map(([k, t]) => `<label class="kn-newth"><input type="radio" name="kn_theme" value="${k}" ${p.theme === k ? 'checked' : ''}>${sample(k)}<small>${esc(t.label)}</small></label>`).join('')}</div>
                <div class="form-grid"><label>Nom<input name="kn_name" value="Ma présentation" maxlength="200"></label><label>Format<select name="kn_aspect">${opt(Object.entries(ASPECTS).filter(([k]) => k !== 'custom' || p.aspect === 'custom').map(([k, v]) => [k, v[2]]), p.aspect)}</select></label></div>
                <p class="muted">Le thème, les couleurs, les polices et le format se changent ensuite (onglet ⚙️ Document). Pour partir d’un PowerPoint, d’un OpenDocument, d’un PDF ou de photos : « ⤒ Importer ».</p>`,
            onSubmit: f => { const theme = f.elements.kn_theme?.value || p.theme, aspect = f.elements.kn_aspect.value, show = newShowFrom({...p, theme, aspect}); show.slides = [newSlide(show, 'title')]; openEditor({...ctx, show, name: f.elements.kn_name.value.trim() || 'Ma présentation'}); }});
    }
    function importNew(ctx = {}) {
        ext.openDialog({eyebrow: 'NOUVELLE PRÉSENTATION', title: '⤒ Importer une présentation', submitLabel: 'Importer', wide: true,
            body: `${IMPORT_HELP}<label>Fichiers<input type="file" name="kn_files" multiple accept=".pptx,.potx,.ppsx,.odp,.otp,.key,.pdf,.md,.markdown,.txt,.json,image/*"></label>`,
            onSubmit: f => { const files = [...(f.elements.kn_files.files || [])]; if (!files.length) return window.LCNDA_UI.fail(f.elements.kn_files, 'Choisis au moins un fichier.');
                const show = newShowFrom(); show.slides = [newSlide(show, 'blank')]; openEditor({...ctx, show, name: files[0].name.replace(/\.[^.]+$/, '').slice(0, 200), importFiles: files}); }});
    }

    /* ═════════ Réglages → Montage, retouche, mise en page et son : les réglages de départ ═════════ */
    ext.keynotePrefs = {
        html: () => { const p = prefs(); return `<div class="form-grid h-mtp-grid">
            <label>Thème au départ<select data-knp="theme">${opt(Object.entries(THEMES).map(([k, t]) => [k, t.label]), p.theme)}</select></label>
            <label>Format au départ<select data-knp="aspect">${opt(Object.entries(ASPECTS).map(([k, v]) => [k, v[2]]), p.aspect)}</select></label>
            ${p.aspect === 'custom' ? `<label>Largeur (points)<input type="number" data-knp="w" min="320" max="4000" value="${esc(p.w)}"></label><label>Hauteur (points)<input type="number" data-knp="h" min="240" max="4000" value="${esc(p.h)}"></label>` : ''}
            <label>Transition des nouvelles diapositives<select data-knp="trans">${opt(TRANS, p.trans)}</select></label>
            <label>Durée de la transition<input data-ui-duration="s" type="number" data-knp="transDur" min="0.1" max="5" step="0.1" value="${esc(p.transDur)}"></label>
            <label>Disposition de « ＋ Diapositive »<select data-knp="layout">${opt(LAYOUTS, p.layout)}</select></label>
            <label>Aimanter les objets (guides)<select data-knp="snap">${opt([['1', 'Oui'], ['0', 'Non']], p.snap === false ? '0' : '1')}</select></label>
            <label>Couleur du pointeur laser<input type="color" data-knp="laser" value="${esc(hexOk(p.laser) ? p.laser : '#ff2d2d')}"></label></div>
            <div class="h-mtp-row"><button type="button" class="button small secondary" data-knp-reset>↺ Réglages de départ</button></div>
            <p class="muted">Les boutons du haut, les onglets et les sections de l’inspecteur se rangent, se montrent ou se cachent dans « Boutons et options » (éditeur 🎤 Présentation), avec ses raccourcis clavier.</p>`; },
        bind: (box, redraw) => {
            box.addEventListener('change', e => { const k = e.target.dataset.knp; if (!k) return; const p = readJ(PREF, {}); let v = e.target.value; if (['w', 'h', 'transDur'].includes(k)) v = Number(v); if (k === 'snap') v = v === '1'; p[k] = v; writeJ(PREF, p); toast('Enregistré.'); if (k === 'aspect') redraw(); });
            box.addEventListener('click', e => { if (!e.target.closest('[data-knp-reset]')) return; try { localStorage.removeItem(PREF); } catch (_) {} redraw(); toast('Réglages de départ.'); });
        },
    };

    // les boutons et les commandes de départ (pour Réglages → Montage, retouche… et les raccourcis, avant même la première ouverture)
    const KN_DEFAULT_DEFS = {"groups":[{"key":"kn-hist","label":"Annuler / rétablir","items":[["kn-cmd=undo","↶ Annuler (⌘Z)"],["kn-cmd=redo","↷ Rétablir (⇧⌘Z)"]]},{"key":"kn-insert","label":"Insérer (barre du haut)","items":[["kn-ins=text","T Une zone de texte"],["kn-dd=shape","◆ Formes"],["kn-ins=image","🖼️ Une photo des médias ou de l’ordinateur"],["kn-ins=table","▦ Un tableau"],["kn-ins=chart","📊 Un graphique (colonnes, camembert, courbe…)"],["kn-dd=person","👤 Généalogie (fiche, portrait, arbre, frise)"],["kn-ins=media","🎬 Une vidéo ou un son des médias"]]},{"key":"kn-arrange","label":"Disposer (barre du haut)","items":[["kn-dd=align","⇤⇥ Aligner et répartir"],["kn-dd=order","⧉ Ordre (devant, derrière)"],["kn-cmd=group","⊞ Grouper (⌘G) — ⇧⌘G pour dissocier"],["kn-cmd=ungroup","⊟ Dissocier (⇧⌘G)"],["kn-cmd=lock","🔒 Verrouiller / déverrouiller (⌘L)"]]},{"key":"kn-play","label":"Lecture","items":[["kn-cmd=play","▶ Lire en plein écran depuis le début (⌥⌘↩)"],["kn-cmd=playhere","⏵ Lire depuis cette diapositive (⌘↩)"],["kn-cmd=presenter","🎤 Plein écran + fenêtre du présentateur (notes, suivante, chronomètre)"]]},{"key":"kn-file","label":"Fichier","items":[["kn-cmd=import","⤒ PowerPoint, OpenDocument, PDF, images, Markdown, texte, JSON"],["kn-dd=export","⤓ Exporter (PDF, PNG, vidéo, fichier)"]]},{"key":"kn-navbar","label":"Diapositives (au-dessus de la liste)","items":[["kn-cmd=newslide","＋ Diapositive▾"],["kn-cmd=dupslide","⧉ Dupliquer la diapositive (pour un déplacement magique)"],["kn-cmd=skipslide","👁 Sauter / ne plus sauter à la lecture"],["kn-cmd=section","§ Commencer une section (un groupe de diapositives) ici"],["kn-cmd=delslide","🗑 Supprimer la diapositive"]]},{"key":"kn-status","label":"Barre du bas","items":[["kn-cmd=prevslide","‹ Diapositive précédente (Page précédente)"],["kn-idx=","1 / 1"],["kn-cmd=nextslide","› Diapositive suivante (Page suivante)"],["kn-zoomw=","Zoom Ajuster25 %50 %75 %100 %150 %200 %"],["kn-snapw=","Aimanter"],["kn-cmd=notes","📝 Notes"],["kn-pos=","(sans nom)"]]},{"key":"kn-tabs","label":"Onglets de l’inspecteur (à droite)","items":[["kn-tab=format","🖌 Format"],["kn-tab=anim","✨ Animer"],["kn-tab=slide","🖼 Diapo"],["kn-tab=objs","🗂 Objets"],["kn-tab=doc","⚙️ Document"]]},{"key":"kn-format","label":"Inspecteur : sections de « Format »","items":[["kn-isec=geom","Position et taille"],["kn-isec=arrange","Disposition"],["kn-isec=text","Texte"],["kn-isec=fill","Remplissage et bordure"],["kn-isec=image","Image"],["kn-isec=shape","Forme"],["kn-isec=table","Tableau"],["kn-isec=chart","Graphique"],["kn-isec=person","Généalogie"],["kn-isec=media","Vidéo / son"],["kn-isec=effects","Ombre et opacité"]]},{"key":"kn-anim","label":"Inspecteur : sections de « Animer »","items":[["kn-asec=trans","Transition"],["kn-asec=obj","Animations de l’objet choisi"],["kn-asec=order","Ordre des animations"]]},{"key":"kn-slide","label":"Inspecteur : sections de « Diapositive »","items":[["kn-ssec=layout","Disposition"],["kn-ssec=bg","Fond"],["kn-ssec=play","Lecture"],["kn-ssec=section","Section"],["kn-ssec=notes","Notes de l’orateur"]]},{"key":"kn-objs","label":"Inspecteur : « Objets »","items":[["kn-osec=list","Objets de la diapositive"]]},{"key":"kn-doc","label":"Inspecteur : sections de « Document »","items":[["kn-dsec=theme","Thème"],["kn-dsec=colors","Couleurs et polices"],["kn-dsec=format","Format"],["kn-dsec=sound","Musique"],["kn-dsec=loop","Lecture"]]}]}, KN_DEFAULT_CMDS = [["data-kn-cmd=undo","Annuler","Annuler / rétablir",""],["data-kn-cmd=redo","Rétablir","Annuler / rétablir",""],["data-kn-ins=text","Texte","Insérer (barre du haut)",""],["data-kn-ins=shape:rect","Rectangle","Insérer (barre du haut)",""],["data-kn-ins=shape:rounded","Rectangle arrondi","Insérer (barre du haut)",""],["data-kn-ins=shape:ellipse","Ellipse","Insérer (barre du haut)",""],["data-kn-ins=shape:triangle","Triangle","Insérer (barre du haut)",""],["data-kn-ins=shape:rtriangle","Triangle rectangle","Insérer (barre du haut)",""],["data-kn-ins=shape:diamond","Losange","Insérer (barre du haut)",""],["data-kn-ins=shape:pentagon","Pentagone","Insérer (barre du haut)",""],["data-kn-ins=shape:hexagon","Hexagone","Insérer (barre du haut)",""],["data-kn-ins=shape:octagon","Octogone","Insérer (barre du haut)",""],["data-kn-ins=shape:star","Étoile","Insérer (barre du haut)",""],["data-kn-ins=shape:arrow","Flèche","Insérer (barre du haut)",""],["data-kn-ins=shape:darrow","Double flèche","Insérer (barre du haut)",""],["data-kn-ins=shape:chevron","Chevron","Insérer (barre du haut)",""],["data-kn-ins=shape:callout","Bulle","Insérer (barre du haut)",""],["data-kn-ins=shape:heart","Cœur","Insérer (barre du haut)",""],["data-kn-ins=shape:cross","Croix","Insérer (barre du haut)",""],["data-kn-ins=shape:line","Ligne","Insérer (barre du haut)",""],["data-kn-ins=shape:arrowline","Ligne fléchée","Insérer (barre du haut)",""],["data-kn-ins=image","Image","Insérer (barre du haut)",""],["data-kn-ins=table","Tableau","Insérer (barre du haut)",""],["data-kn-ins=chart","Graphique","Insérer (barre du haut)",""],["data-kn-ins=person:card","🪪 Fiche d’une personne","Insérer (barre du haut)",""],["data-kn-ins=person:photo","🖼️ Portrait d’une personne","Insérer (barre du haut)",""],["data-kn-ins=person:tree","🌳 Petit arbre (parents, couple, enfants)","Insérer (barre du haut)",""],["data-kn-ins=person:timeline","🗓️ Frise de sa vie","Insérer (barre du haut)",""],["data-kn-ins=media","Vidéo / son","Insérer (barre du haut)",""],["data-kn-cmd=align:left","⇤ À gauche","Disposer (barre du haut)",""],["data-kn-cmd=align:hcenter","↔ Au centre","Disposer (barre du haut)",""],["data-kn-cmd=align:right","⇥ À droite","Disposer (barre du haut)",""],["data-kn-cmd=align:top","⤒ En haut","Disposer (barre du haut)",""],["data-kn-cmd=align:vcenter","↕ Au milieu","Disposer (barre du haut)",""],["data-kn-cmd=align:bottom","⤓ En bas","Disposer (barre du haut)",""],["data-kn-cmd=align:dist-h","⟷ Répartir horizontalement","Disposer (barre du haut)",""],["data-kn-cmd=align:dist-v","⟷ Répartir verticalement","Disposer (barre du haut)",""],["data-kn-cmd=order:front","Tout devant","Disposer (barre du haut)",""],["data-kn-cmd=order:forward","Avancer","Disposer (barre du haut)",""],["data-kn-cmd=order:backward","Reculer","Disposer (barre du haut)",""],["data-kn-cmd=order:back","Tout derrière","Disposer (barre du haut)",""],["data-kn-cmd=group","Grouper","Disposer (barre du haut)",""],["data-kn-cmd=ungroup","Dissocier","Disposer (barre du haut)",""],["data-kn-cmd=lock","Verrouiller","Disposer (barre du haut)",""],["data-kn-cmd=play","Lire","Lecture",""],["data-kn-cmd=playhere","D’ici","Lecture",""],["data-kn-cmd=presenter","Présentateur","Lecture",""],["data-kn-cmd=import","Importer","Fichier",""],["data-kn-cmd=exp_pdf","🖨 PDF / imprimer (une diapositive par page)","Fichier",""],["data-kn-cmd=exp_pdfnotes","🖨 PDF avec les notes de l’orateur","Fichier",""],["data-kn-cmd=exp_png","🖼️ Cette diapositive en PNG","Fichier",""],["data-kn-cmd=exp_pngall","🗂️ Toutes les diapositives en PNG (.zip)","Fichier",""],["data-kn-cmd=exp_video","⏺ Vidéo","Fichier",""],["data-kn-cmd=exp_json","⤓ Fichier de la présentation (.json)","Fichier",""],["data-kn-cmd=save","💾 Enregistrer","Autres boutons",""],["data-kn-cmd=close","×","Autres boutons",""],["data-kn-cmd=newslide","＋ Diapositive","Diapositives (au-dessus de la liste)",""],["data-kn-cmd=dupslide","Dupliquer la diapositive (pour un déplacement magique)","Diapositives (au-dessus de la liste)",""],["data-kn-cmd=skipslide","Sauter / ne plus sauter à la lecture","Diapositives (au-dessus de la liste)",""],["data-kn-cmd=section","Commencer une section (un groupe de diapositives) ici","Diapositives (au-dessus de la liste)",""],["data-kn-cmd=delslide","Supprimer la diapositive","Diapositives (au-dessus de la liste)",""],["data-kn-cmd=prevslide","Diapositive précédente (Page précédente)","Barre du bas",""],["data-kn-cmd=nextslide","Diapositive suivante (Page suivante)","Barre du bas",""],["data-kn-cmd=notes","📝 Notes","Barre du bas",""],["data-kn-tab=format","🖌","Onglets de l’inspecteur (à droite)",""],["data-kn-tab=anim","✨","Onglets de l’inspecteur (à droite)",""],["data-kn-tab=slide","🖼","Onglets de l’inspecteur (à droite)",""],["data-kn-tab=objs","🗂","Onglets de l’inspecteur (à droite)",""],["data-kn-tab=doc","⚙️","Onglets de l’inspecteur (à droite)",""],["data-kn-cmd=duplicate","Dupliquer","Inspecteur : sections de « Format »",""],["data-kn-cmd=delete","Supprimer (⌫)","Inspecteur : sections de « Format »",""]];
    setTimeout(() => { try { const defs = JSON.parse(localStorage.getItem('genealogie-toolbar-defs') || '{}') || {}; if (!defs.keynote) { defs.keynote = KN_DEFAULT_DEFS; localStorage.setItem('genealogie-toolbar-defs', JSON.stringify(defs)); }
        const cm = JSON.parse(localStorage.getItem('genealogie-editor-cmds') || '{}') || {}; if (!cm.keynote) { cm.keynote = KN_DEFAULT_CMDS; localStorage.setItem('genealogie-editor-cmds', JSON.stringify(cm)); } } catch (_) {} }, 0);
    ext.openKeynote = openEditor;
    /** 🎯 « Préparer pour… → Une présentation » (Tableur) : une présentation neuve, une diapositive avec ce tableau ou ce graphique */
    ext.keynoteWithObject = (o, name = 'Ma présentation') => { const show = newShowFrom(), [W, H] = dims(show), s = newSlide(show, 'blank'), w = Math.round(W * .8), h = Math.round(H * (o.t === 'chart' ? .7 : .6));
        const rows = o.t === 'table' ? (o.rows || [['']]).slice(0, 40).map(r => (r || []).slice(0, 16).map(v => String(v ?? '').slice(0, 600))) : null;
        s.objs = [...(s.objs || []), {id: uid(), t: o.t === 'chart' ? 'chart' : 'table', x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, ...(rows ? {rows, head: o.head !== false, size: Math.round(H * .028)} : {spec: o.spec})}];
        show.slides = [s]; return openEditor({show, dirty: true, name: String(name).slice(0, 200)}); };
    ext.newPresentation = newPresentation;
    ext.importPresentation = importNew;
    ext.playPresentation = openPlayer;
    ext.keynoteFromSlideshow = (src, name, ctx = {}) => { const show = newShowFrom(); show.slides = fromDiaporama(src || {}, show); if (src?.music?.filename) { show.music = src.music; show.musicVol = num(src.musicVol, .5); } return openEditor({...ctx, show, dirty: true, name: `${name || 'Diaporama'} (présentation)`}); };
    ext.keynoteInternals = {renderSlide, renderBuilt, cleanHtml, importText, importJson, unzip, zipStore, crc32, chartSpec, slideCanvas, normalize, THEMES, LAYOUTS, TRANS, FX, scaleSlides};
})();
