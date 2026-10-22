/**
 * ⚙️ Le moteur des traitements par lot (window.LCNDA_BATCH ; aussi require() dans Node pour les essais).
 * Sans écran : les actions possibles et leurs réglages bornés (cleanRecipe), les recettes prêtes, la sorte d'un fichier,
 * le nom après « Renommer » (séquence, date, titre, personne, lieu, chercher/remplacer, majuscules, sans accents),
 * la taille après « Rogner » et « Redimensionner », l'aperçu « Voilà ce qui va se passer » (plan), des noms uniques
 * pour un ZIP, et l'effacement des métadonnées sans perte (JPEG : Exif, XMP, GPS, commentaires ; PNG : textes, eXIf, tIME).
 * L'écran et le travail sur les pixels sont dans heritage-lot.js (Listes → 🛠️ Outils de modification → ⚙️ Traitements par lot).
 */
(function (root, factory) {
    const B = factory();
    if (typeof module === 'object' && module.exports) module.exports = B;
    if (typeof window !== 'undefined') window.LCNDA_BATCH = B;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const clamp = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
    const str = (v, max = 120) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
    const oneOf = (v, list, d) => (list.includes(v) ? v : d);
    const bool = (v, d = false) => (v === undefined ? d : !!v);
    const ids = (v, max = 30) => (Array.isArray(v) ? v : String(v || '').split(',')).map(x => Math.trunc(Number(x))).filter(x => x > 0).filter((x, i, a) => a.indexOf(x) === i).slice(0, max);

    /* ═════ Les sortes de fichiers ═════ */
    const EXT_KIND = {jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', avif: 'image', gif: 'image', bmp: 'image',
        docx: 'doc', odt: 'doc', rtf: 'doc', md: 'doc', markdown: 'doc', txt: 'doc', html: 'doc', htm: 'doc',
        xlsx: 'sheet', ods: 'sheet', csv: 'sheet', tsv: 'sheet',
        pdf: 'pdf', mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', m4a: 'audio', aiff: 'audio', aif: 'audio',
        mp4: 'video', mov: 'video', webm: 'video'};
    const KIND_LABEL = {image: 'image', doc: 'document', sheet: 'classeur', pdf: 'PDF', audio: 'son', video: 'vidéo', other: 'fichier'};
    const KIND_ICON = {image: '🖼', doc: '📝', sheet: '🧮', pdf: '📄', audio: '🎧', video: '🎬', other: '📁'};
    const extOf = name => { const m = /\.([a-z0-9]{1,8})$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
    const baseOf = name => String(name || '').replace(/\.[a-z0-9]{1,8}$/i, '');
    const normExt = e => ({jpeg: 'jpg', htm: 'html', markdown: 'md', aif: 'aiff'}[e] || e);
    const kindOf = (name, mime = '') => {
        const k = EXT_KIND[extOf(name)]; if (k) return k;
        const m = String(mime || '');
        if (m.startsWith('image/')) return 'image'; if (m.startsWith('audio/')) return 'audio'; if (m.startsWith('video/')) return 'video'; if (m === 'application/pdf') return 'pdf';
        return 'other';
    };
    /** les formats qu'on sait écrire pour chaque sorte (AVIF et Opus : seulement si le navigateur sait) */
    const FORMATS = {
        image: [['keep', 'Garder le format'], ['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WebP'], ['avif', 'AVIF']],
        doc: [['keep', 'Garder le format'], ['docx', 'Word (.docx)'], ['odt', 'LibreOffice (.odt)'], ['rtf', 'RTF'], ['md', 'Markdown (.md)'], ['html', 'Page web (.html)'], ['txt', 'Texte (.txt)']],
        sheet: [['keep', 'Garder le format'], ['xlsx', 'Excel (.xlsx)'], ['ods', 'LibreOffice (.ods)'], ['csv', 'CSV']],
        audio: [['keep', 'Garder le format'], ['mp3', 'MP3'], ['wav', 'WAV'], ['flac', 'FLAC']],
    };
    const MIME = {jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', bmp: 'image/bmp', pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', odt: 'application/vnd.oasis.opendocument.text', rtf: 'application/rtf',
        md: 'text/markdown;charset=utf-8', txt: 'text/plain;charset=utf-8', html: 'text/html;charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ods: 'application/vnd.oasis.opendocument.spreadsheet', csv: 'text/csv;charset=utf-8', mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', m4a: 'audio/mp4', aiff: 'audio/aiff'};
    /** ce que le serveur accepte de ranger dans les médias (lib/lots.php, LOT_TYPES) */
    const STORABLE = ['jpg', 'png', 'webp', 'avif', 'gif', 'pdf', 'docx', 'odt', 'rtf', 'md', 'txt', 'html', 'xlsx', 'ods', 'csv', 'mp3', 'wav', 'ogg', 'flac', 'm4a', 'aiff'];

    /* ═════ Les actions (une carte chacune) ═════ */
    const IMG = ['image'];
    const ACTIONS = {
        rename: {icon: '✎', label: 'Renommer', kinds: ['image', 'doc', 'sheet', 'pdf', 'audio', 'video'], help: 'Un nom fixe, une séquence 001, 002…, la date, le titre, la personne ou le lieu.',
            def: {pattern: '{nom}', text: '', start: 1, step: 1, digits: 3, find: '', repl: '', cas: 'keep', noAccents: false, spaces: 'keep', title: true}},
        resize: {icon: '↔', label: 'Redimensionner', kinds: IMG, help: 'Plus grand côté, largeur, hauteur, cadre ou pourcentage.', def: {by: 'long', long: 1600, w: 1600, h: 1200, pct: 50, keep: true, noUp: true}},
        crop: {icon: '✂️', label: 'Rogner, pivoter, miroir', kinds: IMG, help: 'Couper les bords, recadrer au format voulu (centré), tourner d’un quart de tour, retourner.', def: {margin: 0, ratio: '', rotate: 0, flipH: false, flipV: false}},
        gray: {icon: '◐', label: 'Noir et blanc', kinds: IMG, help: 'Gris ou sépia.', def: {mode: 'gray'}},
        watermark: {icon: '💧', label: 'Filigrane', kinds: IMG, help: 'Un texte posé dans un coin, au milieu ou répété.', def: {text: '© Ma famille', pos: 'br', size: 4, opacity: 60, color: '#ffffff'}},
        format: {icon: '🔁', label: 'Changer de format', kinds: ['image', 'doc', 'sheet', 'audio'], help: 'Images, documents, classeurs et sons : chacun vers un format de sa sorte.', def: {image: 'jpg', doc: 'docx', sheet: 'xlsx', audio: 'mp3'}},
        quality: {icon: '🗜', label: 'Qualité et poids', kinds: IMG, help: 'Qualité JPG / WebP / AVIF et un poids à ne pas dépasser.', def: {q: 85, maxKb: 0}},
        strip: {icon: '🧹', label: 'Effacer les métadonnées', kinds: IMG, help: 'Appareil, date de prise, position GPS… : effacés (sans perte pour un JPG ou un PNG).', def: {}},
        tags: {icon: '🏷', label: 'Étiquettes et personne', kinds: ['image', 'doc', 'sheet', 'pdf', 'audio', 'video'], base: true, help: 'Ajouter des étiquettes, relier à une personne (dans la base seulement).', def: {labels: [], person: 0, personName: ''}},
        pdf: {icon: '📄', label: 'Assembler en un PDF', kinds: IMG, help: 'Toutes les images dans un seul PDF, une page par image.', def: {name: 'Scans', page: 'a4', margin: 10, keep: false}},
    };
    const ORDER = ['rename', 'resize', 'crop', 'gray', 'watermark', 'format', 'quality', 'strip', 'tags', 'pdf'];
    const RATIOS = [['', 'Ne pas recadrer'], ['1:1', 'Carré 1:1'], ['4:3', '4:3'], ['3:2', '3:2'], ['16:9', '16:9'], ['3:4', '3:4 (portrait)'], ['2:3', '2:3 (portrait)'], ['9:16', '9:16 (portrait)']];
    const POSITIONS = [['br', 'En bas à droite'], ['bl', 'En bas à gauche'], ['tr', 'En haut à droite'], ['tl', 'En haut à gauche'], ['c', 'Au milieu'], ['tile', 'Répété en biais']];
    const TOKENS = [['{texte}', 'Texte'], ['{n}', '001'], ['{nom}', 'Nom d’origine'], ['{titre}', 'Titre'], ['{date}', 'Date du jour'], ['{annee}', 'Année'], ['{personne}', 'Personne'], ['{lieu}', 'Lieu']];

    function cleanParams(type, p = {}) {
        const d = ACTIONS[type].def; p = p && typeof p === 'object' ? p : {};
        switch (type) {
            case 'rename': return {pattern: str(p.pattern ?? d.pattern, 200), text: str(p.text, 80), start: Math.round(clamp(p.start, 0, 999999, 1)), step: Math.round(clamp(p.step, 1, 1000, 1)), digits: Math.round(clamp(p.digits, 1, 6, 3)),
                find: str(p.find, 80), repl: str(p.repl, 80), cas: oneOf(p.cas, ['keep', 'upper', 'lower', 'title'], 'keep'), noAccents: bool(p.noAccents), spaces: oneOf(p.spaces, ['keep', 'dash', 'under'], 'keep'), title: bool(p.title, true)};
            case 'resize': return {by: oneOf(p.by, ['long', 'width', 'height', 'box', 'pct'], 'long'), long: Math.round(clamp(p.long, 16, 16000, 1600)), w: Math.round(clamp(p.w, 16, 16000, 1600)), h: Math.round(clamp(p.h, 16, 16000, 1200)),
                pct: clamp(p.pct, 1, 400, 50), keep: bool(p.keep, true), noUp: bool(p.noUp, true)};
            case 'crop': return {margin: clamp(p.margin, 0, 40, 0), ratio: oneOf(p.ratio, RATIOS.map(r => r[0]), ''), rotate: oneOf(Number(p.rotate) || 0, [0, 90, 180, 270], 0), flipH: bool(p.flipH), flipV: bool(p.flipV)};
            case 'gray': return {mode: oneOf(p.mode, ['gray', 'sepia'], 'gray')};
            case 'watermark': return {text: str(p.text ?? d.text, 120), pos: oneOf(p.pos, POSITIONS.map(x => x[0]), 'br'), size: clamp(p.size, 1, 30, 4), opacity: clamp(p.opacity, 5, 100, 60), color: /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color.toLowerCase() : '#ffffff'};
            case 'format': return Object.fromEntries(Object.keys(FORMATS).map(k => [k, oneOf(p[k], FORMATS[k].map(f => f[0]), d[k])]));
            case 'quality': return {q: Math.round(clamp(p.q, 10, 100, 85)), maxKb: Math.round(clamp(p.maxKb, 0, 50000, 0))};
            case 'strip': return {};
            case 'tags': return {labels: ids(p.labels), person: Math.max(0, Math.trunc(Number(p.person) || 0)), personName: str(p.personName, 120)};
            case 'pdf': return {name: str(p.name ?? d.name, 80) || 'Scans', page: oneOf(p.page, ['a4', 'image'], 'a4'), margin: clamp(p.margin, 0, 40, 10), keep: bool(p.keep)};
        }
        return {};
    }
    let seq = 0;
    const newId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;
    const newCard = (type, p) => ({id: newId(), type, on: true, p: cleanParams(type, p || ACTIONS[type].def)});
    /** une recette (forme sûre et bornée) : {v, cards:[{id, type, on, p}], out: 'version'|'copy'|'zip'} */
    function cleanRecipe(r) {
        r = r && typeof r === 'object' ? r : {};
        const cards = (Array.isArray(r.cards) ? r.cards : []).filter(c => c && typeof c.type === 'string' && Object.prototype.hasOwnProperty.call(ACTIONS, c.type)).slice(0, 30)
            .map(c => ({id: /^[a-z0-9]{2,24}$/i.test(c.id || '') ? c.id : newId(), type: c.type, on: c.on !== false, p: cleanParams(c.type, c.p)}));
        return {v: 1, cards, out: oneOf(r.out, ['version', 'copy', 'zip'], 'zip')};
    }
    /** les ensembles prêts (💾 Réglages enregistrés) */
    const BUILTIN = [
        {name: '🌐 Photos pour le web', summary: '1 600 px au plus, JPG 82 %, sans GPS', recipe: {out: 'zip', cards: [{type: 'resize', p: {by: 'long', long: 1600, noUp: true}}, {type: 'format', p: {image: 'jpg'}}, {type: 'quality', p: {q: 82}}, {type: 'strip'}]}},
        {name: '🔢 Renommer en séquence', summary: 'photo-001, photo-002…', recipe: {out: 'version', cards: [{type: 'rename', p: {pattern: '{texte}-{n}', text: 'photo', start: 1, step: 1, digits: 3, title: true}}]}},
        {name: '📄 Scans en PDF', summary: 'les images dans un seul PDF A4', recipe: {out: 'zip', cards: [{type: 'pdf', p: {name: 'Scans', page: 'a4', margin: 10}}]}},
        {name: '⬛ Vignettes carrées', summary: 'carré 1:1, 400 px, JPG', recipe: {out: 'zip', cards: [{type: 'crop', p: {ratio: '1:1'}}, {type: 'resize', p: {by: 'long', long: 400}}, {type: 'format', p: {image: 'jpg'}}, {type: 'quality', p: {q: 80}}]}},
        {name: '🛰 Partager sans la position GPS', summary: 'métadonnées effacées', recipe: {out: 'zip', cards: [{type: 'strip'}]}},
        {name: '📝 Documents en Word', summary: 'tous en .docx', recipe: {out: 'zip', cards: [{type: 'format', p: {doc: 'docx'}}]}},
        {name: '🧮 Classeurs en CSV', summary: 'la 1re feuille en CSV', recipe: {out: 'zip', cards: [{type: 'format', p: {sheet: 'csv'}}]}},
    ].map(b => ({...b, recipe: cleanRecipe(b.recipe)}));

    /* ═════ Renommer ═════ */
    const noAccents = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/æ/g, 'ae').replace(/Æ/g, 'AE').replace(/ß/g, 'ss');
    /** un nom de fichier sûr : sans chemin ni caractère interdit (Windows, Mac, Linux), 120 caractères au plus */
    function safeName(s, fallback = 'fichier') {
        let t = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[. ]+|[. ]+$/g, '');
        if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(t)) t = `_${t}`;
        return t.slice(0, 120).trim() || fallback;
    }
    const pad = (n, d) => { const s = String(Math.abs(n)); return (n < 0 ? '-' : '') + (s.length >= d ? s : '0'.repeat(d - s.length) + s); };
    const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
    const titleCase = s => s.toLocaleLowerCase('fr').replace(/(^|[\s\-_'’(])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('fr'));
    /** le nom (sans extension) d'un fichier après « Renommer » ; i = sa place dans le lot (0, 1, 2…) */
    function renameBase(item, i, p, now = new Date()) {
        p = cleanParams('rename', p);
        const orig = baseOf(item.name || '');
        const val = {texte: p.text, n: pad(p.start + i * p.step, p.digits), nom: orig, titre: item.title || orig, date: today(now), annee: item.year ? String(item.year) : '', personne: item.person || '', lieu: item.place || ''};
        let s = (p.pattern || '{nom}').replace(/\{(texte|n|nom|titre|date|annee|année|personne|lieu)\}/gi, (m, k) => val[noAccents(k.toLowerCase())] ?? '');
        if (p.find) { const re = new RegExp(p.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); s = s.replace(re, p.repl); }
        s = s.replace(/\s*([-_])\s*/g, '$1').replace(/([-_ ])[-_ ]+/g, '$1').replace(/^[-_ ]+|[-_ ]+$/g, ''); // pas de « photo--001 » quand un morceau est vide
        if (p.cas === 'upper') s = s.toLocaleUpperCase('fr'); else if (p.cas === 'lower') s = s.toLocaleLowerCase('fr'); else if (p.cas === 'title') s = titleCase(s);
        if (p.noAccents) s = noAccents(s);
        if (p.spaces === 'dash') s = s.replace(/\s+/g, '-'); else if (p.spaces === 'under') s = s.replace(/\s+/g, '_');
        return safeName(s, orig || 'fichier');
    }
    /** des noms tous différents (dans un ZIP, ou pour ne pas se marcher dessus) : « photo.jpg », « photo (2).jpg » */
    function uniqueNames(names) {
        const seen = new Map();
        return names.map(n => {
            const e = extOf(n), b = e ? n.slice(0, -(e.length + 1)) : n; let k = 1, out = n;
            while (seen.has(out.toLowerCase())) { k++; out = `${b} (${k})${e ? `.${e}` : ''}`; }
            seen.set(out.toLowerCase(), 1); return out;
        });
    }

    /* ═════ Tailles ═════ */
    const RATIO = r => { const m = /^(\d+):(\d+)$/.exec(r || ''); return m ? Number(m[1]) / Number(m[2]) : 0; };
    /** la zone gardée par « Rogner » (dans l'image d'origine) et la taille après la rotation */
    function cropBox(w, h, p) {
        p = cleanParams('crop', p);
        const mx = Math.round(w * p.margin / 100), my = Math.round(h * p.margin / 100);
        let x = mx, y = my, cw = Math.max(1, w - 2 * mx), ch = Math.max(1, h - 2 * my);
        const r = RATIO(p.ratio);
        if (r) { if (cw / ch > r) { const nw = Math.max(1, Math.round(ch * r)); x += Math.round((cw - nw) / 2); cw = nw; } else { const nh = Math.max(1, Math.round(cw / r)); y += Math.round((ch - nh) / 2); ch = nh; } }
        const turn = p.rotate === 90 || p.rotate === 270;
        return {x, y, w: cw, h: ch, outW: turn ? ch : cw, outH: turn ? cw : ch};
    }
    /** la taille après « Redimensionner » */
    function fitSize(w, h, p) {
        p = cleanParams('resize', p);
        let W = w, H = h;
        if (p.by === 'pct') { W = w * p.pct / 100; H = h * p.pct / 100; }
        else if (p.by === 'long') { const k = p.long / Math.max(w, h); W = w * k; H = h * k; }
        else if (p.by === 'width') { W = p.w; H = p.keep ? h * p.w / w : h; }
        else if (p.by === 'height') { H = p.h; W = p.keep ? w * p.h / h : w; }
        else if (p.by === 'box') { if (p.keep) { const k = Math.min(p.w / w, p.h / h); W = w * k; H = h * k; } else { W = p.w; H = p.h; } }
        if (p.noUp && (W > w || H > h)) { if (p.keep || p.by === 'pct' || p.by === 'long') { const k = Math.min(w / W, h / H); W *= k; H *= k; } else { W = Math.min(W, w); H = Math.min(H, h); } }
        return {w: Math.max(1, Math.min(16384, Math.round(W))), h: Math.max(1, Math.min(16384, Math.round(H)))};
    }

    /* ═════ « Voilà ce qui va se passer » ═════ */
    const on = (chain, type) => chain.filter(c => c.on && c.type === type);
    const last = (chain, type) => { const l = on(chain, type); return l[l.length - 1] || null; };
    const fmtLabel = e => (e ? e.toUpperCase() : '?');
    /**
     * items : [{name, kind?, title, year, person, place, w, h, bytes, base (dans la base), exif: {gps, orientation}}]
     * opts  : {out: 'version'|'copy'|'zip', avif: bool, now: Date}
     * rend  : {rows: [{i, before: {name, fmt, w, h, bytes}, after: {name, fmt, w, h}, ops: [types], mode, notes: [], changed, encode}], pdf: {name, pages} | null, warnings: []}
     */
    function plan(items, recipe, opts = {}) {
        const R = cleanRecipe(recipe), chain = R.cards, out = opts.out || R.out, warnings = [];
        const rn = last(chain, 'rename'), fmtC = last(chain, 'format'), q = last(chain, 'quality'), st = last(chain, 'strip'), tg = last(chain, 'tags'), pdfC = last(chain, 'pdf');
        const pixel = chain.filter(c => c.on && ['crop', 'resize', 'gray', 'watermark'].includes(c.type));
        const pdfOnly = pdfC && !pdfC.p.keep;
        const rows = items.map((it, i) => {
            const kind = it.kind || kindOf(it.name, it.mime), ext0 = normExt(extOf(it.name)), notes = [], ops = [];
            const applies = c => ACTIONS[c.type].kinds.includes(kind);
            const notFor = [...new Set(chain.filter(c => c.on && !applies(c) && c.type !== 'pdf').map(c => ACTIONS[c.type].label))];
            if (notFor.length && !['pdf', 'other', 'video'].includes(kind)) notes.push(`${notFor.join(', ')} : pas pour un ${KIND_LABEL[kind]}`);
            let ext = ext0, w = it.w || 0, h = it.h || 0, encode = false;
            if (kind === 'image') {
                let px = 0; // les retouches qui changent vraiment quelque chose (un « ne pas agrandir » sur une petite image ne compte pas)
                for (const c of pixel) {
                    let did = true;
                    if (c.type === 'crop') { did = !!(c.p.rotate || c.p.flipH || c.p.flipV || c.p.margin || c.p.ratio); if (w && h) { const b = cropBox(w, h, c.p); did = !!(c.p.rotate || c.p.flipH || c.p.flipV) || b.w !== w || b.h !== h; w = b.outW; h = b.outH; } }
                    if (c.type === 'resize' && w && h) { const s = fitSize(w, h, c.p); did = s.w !== w || s.h !== h; w = s.w; h = s.h; }
                    if (c.type === 'watermark') did = !!String(c.p.text || '').trim();
                    if (did) { ops.push(c.type); px++; } else notes.push(`${ACTIONS[c.type].label} : rien à changer`);
                }
                if (fmtC && fmtC.p.image !== 'keep') { ext = fmtC.p.image; ops.push('format'); }
                if (ext === 'avif' && opts.avif === false) { ext = 'webp'; notes.push('Ton navigateur ne sait pas écrire l’AVIF : WebP à la place'); }
                const writable = ['jpg', 'png', 'webp', 'avif'];
                if (q) ops.push('quality');
                if (st) ops.push('strip');
                encode = px > 0 || ext !== ext0 || !!q || (!!st && (!['jpg', 'png'].includes(ext0) || (it.exif?.orientation || 1) !== 1));
                if (encode && !writable.includes(ext)) { notes.push(`${fmtLabel(ext)} ne s’écrit pas ici : PNG à la place`); ext = 'png'; }
                if (st && ext0 === 'gif' && !encode) notes.push('Un GIF n’a pas de position GPS à effacer');
                if (q && q.p.maxKb && ext === 'png') notes.push('PNG : le poids baisse en réduisant la taille de l’image');
            } else if (kind === 'doc' || kind === 'sheet' || kind === 'audio') {
                if (fmtC && fmtC.p[kind] !== 'keep' && fmtC.p[kind] !== ext0) { ext = fmtC.p[kind]; ops.push('format'); encode = true; }
                if (kind === 'sheet' && ext === 'csv' && encode) notes.push('CSV : seulement la 1re feuille, sans mise en forme');
                if (kind === 'doc' && ['txt', 'md'].includes(ext) && encode) notes.push(`${fmtLabel(ext)} : le texte seul, sans images ni mise en forme`);
            } else if (kind === 'pdf') {
                if (chain.some(c => c.on && !['rename', 'tags', 'pdf'].includes(c.type))) notes.push('PDF : en lecture seule (seulement renommé, étiqueté ou relié)');
            } else if (chain.some(c => c.on && !['rename', 'tags'].includes(c.type))) notes.push(`${kind === 'video' ? 'Vidéo' : 'Fichier'} : seulement renommé, étiqueté ou relié`);
            const baseName = rn ? renameBase(it, i, rn.p, opts.now) : baseOf(it.name);
            if (rn) ops.unshift('rename');
            let mode = out === 'zip' ? 'zip' : out === 'copy' ? (it.base ? 'copy' : 'new') : (it.base ? (encode ? 'version' : 'meta') : 'new');
            if (it.base && out === 'version' && encode && kind === 'image' && ext !== ext0 && !['jpg', 'png', 'webp', 'avif', 'gif'].includes(ext)) mode = 'copy';
            if (mode !== 'zip' && !STORABLE.includes(ext)) { notes.push(`.${ext} ne se range pas dans les médias : ⤓ ZIP seulement`); mode = 'skip'; }
            if (tg && mode !== 'zip' && (tg.p.labels.length || tg.p.person)) ops.push('tags');
            if (tg && mode === 'zip' && (tg.p.labels.length || tg.p.person)) notes.push('Étiquettes et personne : seulement dans la base (pas dans un ZIP)');
            if (!it.base && out === 'version' && mode === 'new') notes.push('Venu de l’ordinateur : rangé comme nouveau média');
            const inPdf = !!pdfC && kind === 'image';
            if (inPdf) ops.push('pdf');
            const titleChange = mode !== 'zip' && rn && rn.p.title && (it.base ? baseName !== (it.title || baseOf(it.name)) : true);
            const changed = encode || (rn && baseName !== baseOf(it.name)) || titleChange || ops.includes('tags');
            if (mode === 'meta' && !titleChange && !ops.includes('tags')) mode = 'none';
            const fm = inPdf && pdfOnly ? 'pdf' : mode;
            return {i, kind, todo: fm === 'zip' || fm === 'pdf' || (!!changed && !['none', 'skip'].includes(fm)), before: {name: it.name, fmt: fmtLabel(ext0), w: it.w || 0, h: it.h || 0, bytes: it.bytes || 0},
                after: {name: `${baseName}.${ext}`, base: baseName, ext, fmt: fmtLabel(ext), w, h}, ops, mode: fm, notes, changed: !!changed || inPdf, encode, title: rn && rn.p.title ? baseName : '', gps: !!it.exif?.gps};
        });
        if (out === 'zip') { const u = uniqueNames(rows.filter(r => r.mode === 'zip').map(r => r.after.name)); rows.filter(r => r.mode === 'zip').forEach((r, k) => { r.after.name = u[k]; }); }
        const pages = rows.filter(r => r.ops.includes('pdf')).length;
        const pdf = pdfC && pages ? {name: `${safeName(pdfC.p.name, 'Scans')}.pdf`, pages, page: pdfC.p.page, margin: pdfC.p.margin, keep: pdfC.p.keep} : null;
        if (pdfC && !pages) warnings.push('« Assembler en un PDF » : aucune image dans le lot');
        if (on(chain, 'format').length > 1 || on(chain, 'rename').length > 1) warnings.push('Une action en double : seule la dernière carte compte pour « Renommer » et « Changer de format »');
        return {rows, pdf, warnings, out};
    }

    /* ═════ Métadonnées ═════ */
    const u8of = b => (b instanceof Uint8Array ? b : new Uint8Array(b));
    /** Exif d'un JPEG : orientation (1 à 8) et présence d'une position GPS */
    function exifInfo(bytes) {
        const u = u8of(bytes), res = {orientation: 1, gps: false, exif: false};
        if (u[0] !== 0xff || u[1] !== 0xd8) return res;
        let i = 2;
        while (i + 4 < u.length) {
            if (u[i] !== 0xff) break; const m = u[i + 1]; if (m === 0xda || m === 0xd9) break;
            const len = (u[i + 2] << 8) | u[i + 3];
            if (m === 0xe1 && u[i + 4] === 0x45 && u[i + 5] === 0x78 && u[i + 6] === 0x69 && u[i + 7] === 0x66) { // « Exif »
                res.exif = true; const t = i + 10, le = u[t] === 0x49;
                const r16 = o => (le ? u[o] | (u[o + 1] << 8) : (u[o] << 8) | u[o + 1]), r32 = o => (le ? (u[o] | (u[o + 1] << 8) | (u[o + 2] << 16)) + u[o + 3] * 16777216 : u[o] * 16777216 + ((u[o + 1] << 16) | (u[o + 2] << 8) | u[o + 3]));
                try { const ifd = t + r32(t + 4), n = r16(ifd); for (let k = 0; k < n && k < 400; k++) { const e = ifd + 2 + k * 12; if (e + 12 > u.length) break; const tag = r16(e); if (tag === 0x0112) res.orientation = r16(e + 8) || 1; if (tag === 0x8825 && r32(e + 8)) res.gps = true; } } catch (_) {}
            }
            i += 2 + len;
        }
        return res;
    }
    /** JPEG sans métadonnées, sans perte : Exif, XMP, IPTC, commentaires partent ; le profil de couleur (ICC) et JFIF restent */
    function stripJpeg(bytes) {
        const u = u8of(bytes); if (u[0] !== 0xff || u[1] !== 0xd8) return u;
        const parts = [u.subarray(0, 2)]; let i = 2;
        while (i + 4 <= u.length) {
            if (u[i] !== 0xff) return u; // mal formé : on ne touche à rien
            const m = u[i + 1];
            if (m === 0xda) { parts.push(u.subarray(i)); break; } // le début de l'image : tout le reste tel quel
            if (m === 0xd9) { parts.push(u.subarray(i, i + 2)); break; }
            if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { parts.push(u.subarray(i, i + 2)); i += 2; continue; }
            const len = (u[i + 2] << 8) | u[i + 3]; if (len < 2 || i + 2 + len > u.length) return u;
            const seg = u.subarray(i, i + 2 + len);
            const icc = m === 0xe2 && String.fromCharCode(...u.subarray(i + 4, i + 15)) === 'ICC_PROFILE';
            const drop = (m >= 0xe1 && m <= 0xef && !icc) || m === 0xfe;
            if (!drop) parts.push(seg);
            i += 2 + len;
        }
        const n = parts.reduce((s, p) => s + p.length, 0), outB = new Uint8Array(n); let o = 0; parts.forEach(p => { outB.set(p, o); o += p.length; });
        return outB;
    }
    /** PNG sans textes (tEXt, zTXt, iTXt), sans eXIf ni tIME, sans perte */
    function stripPng(bytes) {
        const u = u8of(bytes), sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        if (!sig.every((b, k) => u[k] === b)) return u;
        const parts = [u.subarray(0, 8)]; let i = 8;
        while (i + 12 <= u.length) {
            const len = ((u[i] << 24) >>> 0) + (u[i + 1] << 16) + (u[i + 2] << 8) + u[i + 3], type = String.fromCharCode(u[i + 4], u[i + 5], u[i + 6], u[i + 7]);
            if (i + 12 + len > u.length) return u;
            if (!['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'].includes(type)) parts.push(u.subarray(i, i + 12 + len));
            i += 12 + len; if (type === 'IEND') break;
        }
        const n = parts.reduce((s, p) => s + p.length, 0), outB = new Uint8Array(n); let o = 0; parts.forEach(p => { outB.set(p, o); o += p.length; });
        return outB;
    }
    /** des métadonnées repérables (pour les essais et l'aperçu) : Exif/XMP d'un JPEG, textes d'un PNG */
    function hasMeta(bytes) {
        const u = u8of(bytes);
        if (u[0] === 0xff && u[1] === 0xd8) return stripJpeg(u).length !== u.length;
        if (u[0] === 0x89 && u[1] === 0x50) return stripPng(u).length !== u.length;
        return false;
    }
    const sizeText = b => (!b ? '' : b < 1024 ? `${b} o` : b < 1048576 ? `${Math.round(b / 1024).toLocaleString('fr-FR')} Ko` : `${(b / 1048576).toFixed(1).replace('.', ',')} Mo`);
    /** un résumé d'une carte, pour son titre replié et la liste des recettes */
    function summary(c) {
        const p = c.p || {};
        switch (c.type) {
            case 'rename': return (p.pattern || '').replace(/\{texte\}/g, p.text || 'texte').replace(/\{n\}/g, pad(p.start ?? 1, p.digits ?? 3)).replace(/\{(\w+)\}/g, '‹$1›').slice(0, 60);
            case 'resize': return p.by === 'pct' ? `${String(p.pct).replace('.', ',')} %` : p.by === 'long' ? `plus grand côté ${p.long} px` : p.by === 'width' ? `largeur ${p.w} px` : p.by === 'height' ? `hauteur ${p.h} px` : `${p.w} × ${p.h} px`;
            case 'crop': return [p.margin ? `bords ${p.margin} %` : '', p.ratio ? `format ${p.ratio}` : '', p.rotate ? `${p.rotate}°` : '', p.flipH ? 'miroir' : '', p.flipV ? 'tête en bas' : ''].filter(Boolean).join(' · ') || 'rien à faire';
            case 'gray': return p.mode === 'sepia' ? 'sépia' : 'gris';
            case 'watermark': return `« ${p.text || ''} »`;
            case 'format': return Object.entries(p).filter(([, v]) => v !== 'keep').map(([k, v]) => `${KIND_LABEL[k]} → ${v.toUpperCase()}`).join(' · ') || 'rien ne change';
            case 'quality': return `${p.q} %${p.maxKb ? ` · ${p.maxKb.toLocaleString('fr-FR')} Ko au plus` : ''}`;
            case 'strip': return 'Exif, GPS, XMP';
            case 'tags': return [p.labels?.length ? `${p.labels.length} étiquette${p.labels.length > 1 ? 's' : ''}` : '', p.personName || (p.person ? 'une personne' : '')].filter(Boolean).join(' · ') || 'rien de choisi';
            case 'pdf': return `« ${p.name} » · ${p.page === 'a4' ? 'pages A4' : 'à la taille des images'}`;
        }
        return '';
    }

    return {ACTIONS, ORDER, FORMATS, RATIOS, POSITIONS, TOKENS, MIME, STORABLE, KIND_LABEL, KIND_ICON, EXT_KIND, BUILTIN,
        extOf, baseOf, normExt, kindOf, cleanParams, cleanRecipe, newCard, renameBase, safeName, uniqueNames, noAccents,
        cropBox, fitSize, plan, exifInfo, stripJpeg, stripPng, hasMeta, sizeText, summary, today};
});
