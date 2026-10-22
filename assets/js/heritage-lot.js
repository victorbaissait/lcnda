/**
 * ⚙️ Traitements par lot (Listes → 🛠️ Outils de modification → « ⚙️ Traitements par lot ») : une sorte d'Automator.
 *  1. les fichiers : médias de la base (la fenêtre unique des images, plusieurs, filtres, recherche) ou de l'ordinateur (E4) ;
 *  2. une chaîne d'actions en cartes (⠿ pour ranger, Alt + ↑ / ↓ ; interrupteur pour éteindre une étape ; ⧉ ; ×) :
 *     Renommer, Redimensionner, Rogner / pivoter / miroir, Noir et blanc, Filigrane, Changer de format, Qualité et poids,
 *     Effacer les métadonnées, Étiquettes et personne, Assembler en un PDF ;
 *  3. « Voilà ce qui va se passer » (nom, taille, format avant → après), puis « ▶ Lancer sur N fichiers » : nouvelle version
 *     du média (l'original reste dans les versions), copie dans les médias, ou ⤓ un ZIP (le ZIP commun de LCNDA_SHEET) ;
 *     dans la base, « ↶ Annuler » (H7) remet tout comme avant (lib/lots.php).
 * Les recettes : « 💾 Réglages enregistrés » (UI.presetsFrame) + ensembles prêts. Le moteur sans écran : app-lot-engine.js.
 * Les images : canvas ; les documents : LCNDA_TEXT ; les classeurs : LCNDA_SHEET ; les sons : LCNDA_EXT.audioEngine.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const UI = () => window.LCNDA_UI;
    const B = () => window.LCNDA_BATCH;
    const P = () => window.LCNDA_PICKER || A();
    const esc = v => A().escapeHtml(v ?? '');
    const plural = (n, w, p) => A().plural(n, w, p);
    const toast = (...a) => A().toast(...a);
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const USER_KEY = 'genealogie-traitements-lot', LAST_KEY = 'lcnda-lot-derniere';
    const ls = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } };

    /* ═════ Les recettes gardées (💾 Réglages enregistrés) ═════ */
    const userRecipes = () => { try { const v = JSON.parse(ls(USER_KEY, '[]')); return Array.isArray(v) ? v.filter(x => x && typeof x.name === 'string').slice(0, 80).map(x => ({name: String(x.name).slice(0, 60), date: x.date || '', recipe: B().cleanRecipe(x.recipe)})) : []; } catch (_) { return []; } };
    const saveRecipes = list => { if (!lsSet(USER_KEY, JSON.stringify(list.slice(0, 80)))) { toast('Plus de place pour enregistrer cette recette.', 'error'); return false; } return true; };
    const recipeInfo = r => { const c = (r.cards || []).filter(x => x.on); return c.length ? c.map(x => `${B().ACTIONS[x.type].icon} ${B().ACTIONS[x.type].label}`).join(' → ') : 'aucune action'; };
    const outLabel = o => ({version: 'nouvelle version', copy: 'copie dans les médias', zip: 'ZIP'}[o] || '');

    /* ═════ Ce que le navigateur sait écrire ═════ */
    let avifOk = null;
    async function canAvif() {
        if (avifOk !== null) return avifOk;
        try { const c = document.createElement('canvas'); c.width = c.height = 2; const b = await new Promise(r => c.toBlob(r, 'image/avif', .5)); avifOk = !!b && b.type === 'image/avif'; } catch (_) { avifOk = false; }
        return avifOk;
    }

    /* ═════ Les fichiers ═════ */
    let uidSeq = 0;
    const thumbUrl = m => (m.thumb ? m.thumb : m.thumbnail ? `media/${encodeURIComponent(m.thumbnail)}` : m.media_type === 'image' && m.filename ? `media/${encodeURIComponent(m.filename)}` : '');
    function fromMedia(m) {
        const fn = String(m.filename || ''), e = B().extOf(fn) || (m.media_type === 'image' ? 'jpg' : '');
        const title = String(m.title || '').trim();
        // le nom montré : le titre (ou le nom du fichier) + l'extension du vrai fichier
        const shown = `${B().safeName(title || B().baseOf(fn) || `media-${m.id}`)}.${e}`;
        return {uid: `u${++uidSeq}`, src: 'base', id: Number(m.id), filename: fn, name: shown, kind: B().kindOf(fn) === 'other' && m.media_type === 'image' ? 'image' : B().kindOf(fn), title: title || B().baseOf(fn),
            year: m.year || '', place: m.place || '', personIds: m.people_ids || [], person: '', thumb: thumbUrl(m), base: true, w: 0, h: 0, bytes: 0, exif: null, ready: false};
    }
    function fromFile(f) {
        const kind = B().kindOf(f.name, f.type);
        return {uid: `u${++uidSeq}`, src: 'pc', file: f, name: B().safeName(f.name, 'fichier'), kind, title: B().baseOf(f.name), year: '', place: '', person: '', thumb: kind === 'image' ? URL.createObjectURL(f) : '', base: false, w: 0, h: 0, bytes: f.size, exif: null, ready: false};
    }
    async function blobOf(it) {
        if (it.file) return it.file;
        const r = await fetch(`media/${encodeURIComponent(it.filename)}`, {cache: 'no-cache'});
        if (!r.ok) throw new Error(`« ${it.name} » : fichier introuvable dans le dossier des médias`);
        return r.blob();
    }
    /** taille, dimensions, Exif (orientation, GPS) : pour l'aperçu */
    async function analyse(it) {
        try {
            const b = await blobOf(it); it.bytes = b.size;
            if (it.kind === 'image') {
                const u8 = new Uint8Array(await b.slice(0, Math.min(b.size, 256 * 1024)).arrayBuffer());
                it.exif = B().exifInfo(u8);
                try { const bm = await createImageBitmap(b, {imageOrientation: 'from-image'}); it.w = bm.width; it.h = bm.height; bm.close?.(); } catch (_) { it.bad = 'image illisible'; }
            }
        } catch (err) { it.bad = err.message; }
        it.ready = true;
    }
    /** la personne reliée (pour « {personne} ») : le nom de la 1re fiche du média */
    async function namePeople(list) {
        const want = [...new Set(list.filter(x => x.base && !x.person && x.personIds?.length).map(x => Number(x.personIds[0])))].slice(0, 200);
        if (!want.length) return;
        try { const r = await api('picker_search', {kind: 'person', ids: want.join(','), limit: 200}); const map = new Map(); (r.groups || []).forEach(g => (g.items || []).forEach(i => map.set(Number(i.id), i.title)));
            list.forEach(x => { if (x.base && x.personIds?.length) x.person = map.get(Number(x.personIds[0])) || ''; }); } catch (_) {}
    }

    /* ═════ Le travail sur une image (canvas) ═════ */
    const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
    function opCrop(src, p) {
        const b = B().cropBox(src.width, src.height, p), c = canvas(b.outW, b.outH), x = c.getContext('2d');
        x.translate(b.outW / 2, b.outH / 2); x.rotate((p.rotate || 0) * Math.PI / 180); x.scale(p.flipH ? -1 : 1, p.flipV ? -1 : 1);
        x.drawImage(src, b.x, b.y, b.w, b.h, -b.w / 2, -b.h / 2, b.w, b.h);
        return c;
    }
    function opResize(src, p) {
        const s = B().fitSize(src.width, src.height, p); if (s.w === src.width && s.h === src.height) return src;
        let cur = src;
        // réduire par moitiés d'abord : plus net qu'un seul grand saut
        while (cur.width / 2 >= s.w && cur.height / 2 >= s.h) { const c = canvas(cur.width / 2, cur.height / 2), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, c.width, c.height); cur = c; }
        const c = canvas(s.w, s.h), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, s.w, s.h); return c;
    }
    function opGray(src, p) {
        const c = canvas(src.width, src.height), x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(src, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
        for (let i = 0; i < a.length; i += 4) {
            const r = a[i], g = a[i + 1], b = a[i + 2], l = 0.299 * r + 0.587 * g + 0.114 * b;
            if (p.mode === 'sepia') { a[i] = Math.min(255, r * .393 + g * .769 + b * .189); a[i + 1] = Math.min(255, r * .349 + g * .686 + b * .168); a[i + 2] = Math.min(255, r * .272 + g * .534 + b * .131); }
            else { a[i] = a[i + 1] = a[i + 2] = l; }
        }
        x.putImageData(d, 0, 0); return c;
    }
    function opWatermark(src, p) {
        const c = canvas(src.width, src.height), x = c.getContext('2d'); x.drawImage(src, 0, 0);
        const text = String(p.text || '').trim(); if (!text) return c;
        const px = Math.max(10, Math.round(c.width * p.size / 100)), m = Math.round(px * .8);
        x.font = `bold ${px}px Arial, Helvetica, sans-serif`; x.fillStyle = p.color; x.globalAlpha = p.opacity / 100;
        x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = Math.max(2, px / 8);
        const w = x.measureText(text).width;
        if (p.pos === 'tile') {
            x.save(); x.translate(c.width / 2, c.height / 2); x.rotate(-Math.PI / 6); x.textBaseline = 'middle';
            const stepX = w + px * 3, stepY = px * 4, R = Math.hypot(c.width, c.height);
            for (let yy = -R; yy < R; yy += stepY) for (let xx = -R; xx < R; xx += stepX) x.fillText(text, xx + ((yy / stepY) % 2 ? stepX / 2 : 0), yy);
            x.restore(); return c;
        }
        const pos = {br: [c.width - w - m, c.height - m], bl: [m, c.height - m], tr: [c.width - w - m, m + px], tl: [m, m + px], c: [(c.width - w) / 2, (c.height + px * .7) / 2]}[p.pos] || [m, c.height - m];
        x.fillText(text, pos[0], pos[1]); return c;
    }
    const toBlob = (c, mime, q) => new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('le navigateur n’a pas pu écrire l’image'))), mime, q));
    /** une image (canvas) → fichier, en tenant un poids max : la qualité baisse d'abord, puis la taille */
    async function encodeCanvas(c, e, q, maxKb, notes) {
        const mime = B().MIME[e] || 'image/png', lossy = ['jpg', 'webp', 'avif'].includes(e);
        if (e === 'jpg') { const w = canvas(c.width, c.height), x = w.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, w.width, w.height); x.drawImage(c, 0, 0); c = w; } // pas de transparence dans un JPG
        let blob = await toBlob(c, mime, lossy ? q : undefined);
        if (!maxKb || blob.size <= maxKb * 1024) return blob;
        if (lossy) { let lo = 0.3, hi = q, best = null; for (let k = 0; k < 7; k++) { const mid = (lo + hi) / 2, b = await toBlob(c, mime, mid); if (b.size <= maxKb * 1024) { best = b; lo = mid; } else hi = mid; } if (best) { notes.push(`qualité baissée à ${Math.round(lo * 100)} % pour tenir dans ${maxKb.toLocaleString('fr-FR')} Ko`); return best; } }
        let cur = c;
        for (let k = 0; k < 8 && blob.size > maxKb * 1024 && cur.width > 64; k++) { cur = opResize(cur, {by: 'pct', pct: 85, keep: true, noUp: true}); blob = await toBlob(cur, mime, lossy ? 0.3 : undefined); }
        notes.push(blob.size <= maxKb * 1024 ? `image réduite à ${cur.width} × ${cur.height} px pour tenir dans ${maxKb.toLocaleString('fr-FR')} Ko` : `⚠️ ${B().sizeText(blob.size)} : plus lourd que ${maxKb.toLocaleString('fr-FR')} Ko`);
        return blob;
    }
    /** le canvas d'une image après les retouches de la chaîne (rogner, redimensionner, noir et blanc, filigrane), dans l'ordre */
    async function imageCanvas(blob, chain) {
        const bm = await createImageBitmap(blob, {imageOrientation: 'from-image'});
        let c = canvas(bm.width, bm.height); c.getContext('2d').drawImage(bm, 0, 0); bm.close?.();
        for (const card of chain) {
            if (!card.on) continue;
            if (card.type === 'crop') c = opCrop(c, card.p);
            else if (card.type === 'resize') c = opResize(c, card.p);
            else if (card.type === 'gray') c = opGray(c, card.p);
            else if (card.type === 'watermark') c = opWatermark(c, card.p);
        }
        return c;
    }
    async function runImage(it, row, chain, notes) {
        const blob = await blobOf(it), q = [...chain].reverse().find(c => c.on && c.type === 'quality'), strip = chain.some(c => c.on && c.type === 'strip');
        if (!row.encode) {
            let u8 = new Uint8Array(await blob.arrayBuffer());
            if (strip) { const e0 = B().normExt(B().extOf(it.filename || it.name)); u8 = e0 === 'png' ? B().stripPng(u8) : B().stripJpeg(u8); }
            return new Blob([u8], {type: B().MIME[row.after.ext] || blob.type});
        }
        const c = await imageCanvas(blob, chain);
        return encodeCanvas(c, row.after.ext, (q?.p.q ?? 92) / 100, q?.p.maxKb || 0, notes);
    }
    /** une page de PDF : l'image en JPEG, sur une page A4 (avec marge) ou à sa taille */
    async function pdfPage(it, chain, p) {
        const c = await imageCanvas(await blobOf(it), chain);
        if (p.page === 'image') { const b = await toBlob(withWhite(c), 'image/jpeg', .9); return {jpeg: new Uint8Array(await b.arrayBuffer()), w: c.width, h: c.height, pw: c.width * 72 / 150, ph: c.height * 72 / 150}; }
        const land = c.width > c.height, W = land ? 1754 : 1240, H = land ? 1240 : 1754, m = Math.round(p.margin / 25.4 * 150);
        const pg = canvas(W, H), x = pg.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
        const k = Math.min((W - 2 * m) / c.width, (H - 2 * m) / c.height), w = c.width * k, h = c.height * k; x.imageSmoothingQuality = 'high'; x.drawImage(c, (W - w) / 2, (H - h) / 2, w, h);
        const b = await toBlob(pg, 'image/jpeg', .88);
        return {jpeg: new Uint8Array(await b.arrayBuffer()), w: W, h: H, pw: land ? 841.89 : 595.28, ph: land ? 595.28 : 841.89};
    }
    const withWhite = c => { const w = canvas(c.width, c.height), x = w.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, w.width, w.height); x.drawImage(c, 0, 0); return w; };

    /* ═════ Documents, classeurs, sons ═════ */
    async function runDoc(it, row, notes) {
        const blob = await blobOf(it); if (!row.encode) return blob;
        const T = window.LCNDA_TEXT, r = await T.readFile(it.filename || it.name, await blob.arrayBuffer());
        let doc = r.doc;
        if (r.kind === 'html') { const K = ext.textDocKit; const d = document.createElement('div'); d.innerHTML = K.cleanHtml(String(r.html).replace(/^[\s\S]*?<body[^>]*>|<\/body>[\s\S]*$/gi, '')).html; doc = T.newDoc({title: it.title}); doc.sections = [{page: null, blocks: K.blocksOfEl(d)}]; }
        (r.notices || []).slice(0, 3).forEach(n => notes.push(typeof n === 'string' ? n : n.text || ''));
        const e = row.after.ext, type = B().MIME[e];
        if (e === 'docx') return T.toDocx(doc);
        if (e === 'odt') return T.toOdt(doc);
        if (e === 'rtf') return new Blob([T.toRtf(doc)], {type});
        if (e === 'md') return new Blob([T.toMarkdown(doc)], {type});
        if (e === 'txt') return new Blob([T.toText(doc)], {type});
        const body = (doc.sections || []).map(s => T.htmlOf(s)).join('\n');
        return new Blob([`<!doctype html><html lang="${esc(doc.lang || 'fr')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(row.after.base)}</title><style>body{font-family:Georgia,serif;max-width:46em;margin:2em auto;padding:0 1em;line-height:1.5}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px}\n${T.stylesCss(doc.styles || [], '.wp-doc')}</style></head><body><main class="wp-doc">${body}</main></body></html>`], {type});
    }
    async function runSheet(it, row) {
        const blob = await blobOf(it); if (!row.encode) return blob;
        const S = window.LCNDA_SHEET, r = await S.readFile(it.filename || it.name, await blob.arrayBuffer()), e = row.after.ext;
        if (e === 'xlsx') return S.toXlsx(r.wb);
        if (e === 'ods') return S.toOds(r.wb);
        const calc = new S.Calc(r.wb);
        return new Blob([S.toCSV(S.matrix(r.wb, calc, 0, null, {display: true}), {sep: ';', bom: true})], {type: B().MIME.csv});
    }
    async function runAudio(it, row) {
        const blob = await blobOf(it); if (!row.encode) return blob;
        const E = ext.audioEngine; if (!E?.decode) throw new Error('le moteur du son n’est pas chargé');
        const buf = await E.decode(await blob.arrayBuffer());
        const out = await E.encode(row.after.ext, buf, {kbps: 192, tags: {title: row.after.base}});
        return out instanceof Blob ? out : new Blob([out], {type: B().MIME[row.after.ext]});
    }

    /* ═════ La fenêtre ═════ */
    const ROT = [[0, 'Ne pas tourner'], [90, '¼ de tour à droite'], [180, 'Demi-tour'], [270, '¼ de tour à gauche']];
    const opt = (list, v) => list.map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('');
    const num = (k, v, unit, {min = 0, max = 99999, step = 1, label = ''} = {}) => `<label>${esc(label)}<input type="number" data-k="${k}" value="${esc(v)}" min="${min}" max="${max}" step="${step}"${unit ? ` data-unit="${esc(unit)}"` : ''}></label>`;
    const check = (k, v, label) => `<label class="checkbox-line"><input type="checkbox" data-k="${k}"${v ? ' checked' : ''}> ${esc(label)}</label>`;
    function cardFields(c) {
        const p = c.p, Bx = B();
        switch (c.type) {
            case 'rename': return `<label class="h-lot-wide">Modèle du nom<input type="text" data-k="pattern" value="${esc(p.pattern)}" maxlength="200" spellcheck="false" aria-describedby="h-lot-tk-${c.id}"></label>
                <div class="h-lot-tokens" id="h-lot-tk-${c.id}" role="group" aria-label="Ajouter au modèle">${Bx.TOKENS.map(([t, l]) => `<button type="button" class="ui-badge is-date h-lot-token" data-token="${esc(t)}" title="Ajouter ${esc(t)} au modèle">＋ ${esc(l)}</button>`).join('')}</div>
                <label>Texte<input type="text" data-k="text" value="${esc(p.text)}" maxlength="80" placeholder="ex. mariage-1925"></label>
                ${num('start', p.start, '', {label: 'Commencer à', max: 999999})}${num('step', p.step, '', {label: 'De', min: 1, max: 1000})}${num('digits', p.digits, 'chiffres', {label: 'Séquence sur', min: 1, max: 6})}
                <label>Chercher<input type="text" data-k="find" value="${esc(p.find)}" maxlength="80" placeholder="ex. IMG_"></label><label>Remplacer par<input type="text" data-k="repl" value="${esc(p.repl)}" maxlength="80" placeholder="(rien)"></label>
                <label>Lettres<select data-k="cas">${opt([['keep', 'Comme tapé'], ['upper', 'MAJUSCULES'], ['lower', 'minuscules'], ['title', 'Une Majuscule Par Mot']], p.cas)}</select></label>
                <label>Espaces<select data-k="spaces">${opt([['keep', 'Garder les espaces'], ['dash', 'Des tirets (-)'], ['under', 'Des soulignés (_)']], p.spaces)}</select></label>
                ${check('noAccents', p.noAccents, 'Sans accents (é → e)')}${check('title', p.title, 'Changer aussi le titre dans les médias')}`;
            case 'resize': return `<label>Selon<select data-k="by">${opt([['long', 'Le plus grand côté'], ['width', 'La largeur'], ['height', 'La hauteur'], ['box', 'Un cadre largeur × hauteur'], ['pct', 'Un pourcentage']], p.by)}</select></label>
                <span data-show="long">${num('long', p.long, 'px', {label: 'Plus grand côté', min: 16, max: 16000})}</span>
                <span data-show="width box">${num('w', p.w, 'px', {label: 'Largeur', min: 16, max: 16000})}</span><span data-show="height box">${num('h', p.h, 'px', {label: 'Hauteur', min: 16, max: 16000})}</span>
                <span data-show="pct">${num('pct', p.pct, '%', {label: 'Pourcentage', min: 1, max: 400})}</span>
                ${check('keep', p.keep, 'Garder les proportions')}${check('noUp', p.noUp, 'Ne pas agrandir les petites images')}`;
            case 'crop': return `${num('margin', p.margin, '%', {label: 'Couper les bords', max: 40, step: .5})}<label>Recadrer au format<select data-k="ratio">${opt(Bx.RATIOS, p.ratio)}</select></label>
                <label>Tourner<select data-k="rotate">${opt(ROT, p.rotate)}</select></label>${check('flipH', p.flipH, 'Miroir (gauche ↔ droite)')}${check('flipV', p.flipV, 'Retourner (haut ↕ bas)')}`;
            case 'gray': return `<label>Teinte<select data-k="mode">${opt([['gray', 'Gris'], ['sepia', 'Sépia (photo ancienne)']], p.mode)}</select></label>`;
            case 'watermark': return `<label class="h-lot-wide">Texte<input type="text" data-k="text" value="${esc(p.text)}" maxlength="120"></label><label>Place<select data-k="pos">${opt(Bx.POSITIONS, p.pos)}</select></label>
                ${num('size', p.size, '%', {label: 'Taille (de la largeur)', min: 1, max: 30, step: .5})}<label>Opacité<input type="range" data-k="opacity" min="5" max="100" value="${esc(p.opacity)}" data-unit="%" data-default="60"></label><label>Couleur<input type="color" data-k="color" value="${esc(p.color)}"></label>`;
            case 'format': return Object.keys(Bx.FORMATS).map(k => `<label>${esc({image: 'Images', doc: 'Documents', sheet: 'Classeurs', audio: 'Sons'}[k])}<select data-k="${k}">${opt(Bx.FORMATS[k].filter(f => f[0] !== 'avif' || avifOk !== false).map(f => (f[0] === 'avif' ? [f[0], 'AVIF (récent, très léger)'] : f)), p[k])}</select></label>`).join('');
            case 'quality': return `<label>Qualité<input type="range" data-k="q" min="10" max="100" value="${esc(p.q)}" data-unit="%" data-default="85"></label>${num('maxKb', p.maxKb, 'Ko', {label: 'Poids au plus (0 = pas de limite)', max: 50000, step: 10})}
                <p class="h-lot-hint">JPG, WebP et AVIF. Pour un PNG, le poids baisse en réduisant l’image.</p>`;
            case 'strip': return '<p class="h-lot-hint">L’appareil, la date de prise, la position GPS, les mots-clés… sont effacés. Pour un JPG ou un PNG sans autre retouche : sans perte (l’image ne change pas).</p>';
            case 'tags': return `<span class="pk-lab">Étiquettes à ajouter</span>${P().pickerField({name: '', hiddenName: false, kind: 'label', multiple: true, value: p.labels, inline: true})}
                <span class="pk-lab">Relier à une personne</span>${P().pickerField({name: '', hiddenName: false, kind: 'person', value: p.person ? {id: p.person, title: p.personName || `Fiche n° ${p.person}`} : null, inline: true})}
                <p class="h-lot-hint">Seulement pour ce qui va dans la base (nouvelle version ou copie), pas pour un ZIP.</p>`;
            case 'pdf': return `<label class="h-lot-wide">Nom du PDF<input type="text" data-k="name" value="${esc(p.name)}" maxlength="80"></label><label>Pages<select data-k="page">${opt([['a4', 'A4 (l’image centrée)'], ['image', 'À la taille de chaque image']], p.page)}</select></label>
                ${num('margin', p.margin, 'mm', {label: 'Marge', max: 40})}${check('keep', p.keep, 'Garder aussi chaque image à part')}`;
        }
        return '';
    }
    function cardHtml(c, i) { // data-i : heritage-dnd.js y retrouve la ligne pour Alt + ↑ / ↓ (il rejoue le glisser-déposer)
        const a = B().ACTIONS[c.type];
        return `<article class="h-lot-card${c.on ? '' : ' is-off'}${c.fold ? ' is-folded' : ''}" data-cid="${esc(c.id)}" data-i="${i}" data-type="${esc(c.type)}">
            <header class="h-lot-chead"><button type="button" class="dnd-grip h-lot-grip" title="Glisse pour ranger (ou Alt + ↑ / ↓)" aria-label="Ranger « ${esc(a.label)} » (Alt + flèche haut ou bas)">⠿</button>
                <button type="button" class="h-lot-fold" data-fold aria-expanded="${c.fold ? 'false' : 'true'}" title="${c.fold ? 'Déplier les réglages' : 'Replier les réglages'}"><span class="h-lot-cico" aria-hidden="true">${a.icon}</span><span class="h-lot-ctitle"><b>${esc(a.label)}</b><small data-sum>${esc(B().summary(c))}</small></span><span class="h-lot-car" aria-hidden="true">${c.fold ? '▸' : '▾'}</span></button>
                <label class="ui-toggle h-lot-on" title="${c.on ? 'Éteindre cette étape (elle reste dans la chaîne)' : 'Rallumer cette étape'}"><input type="checkbox" data-on${c.on ? ' checked' : ''} aria-label="Étape active"><i></i></label>
                <button type="button" class="icon-button small" data-dup title="Dupliquer" aria-label="Dupliquer">⧉</button><button type="button" class="icon-button small" data-del title="Retirer de la chaîne" aria-label="Retirer de la chaîne">×</button></header>
            <div class="h-lot-cbody" data-ui-scope>${cardFields(c)}</div></article>`;
    }

    function openBatch(o = {}) {
        if (!B()) { toast('Le moteur des traitements par lot n’est pas chargé : recharge la page.', 'error'); return null; }
        let recipe = B().cleanRecipe(o.recipe || (() => { try { return JSON.parse(ls(LAST_KEY, 'null')); } catch (_) { return null; } })() || {out: 'zip', cards: [{type: 'rename'}]});
        if (!recipe.cards.length && !o.recipe) recipe.cards.push(B().newCard('rename'));
        let files = [], planNow = null, running = false, stop = false, timer = 0, dragId = '';
        const remember = () => lsSet(LAST_KEY, JSON.stringify(recipe));
        const dlg = document.createElement('dialog');
        dlg.className = 'modal modal-xl h-lot';
        dlg.setAttribute('aria-labelledby', 'h-lot-title');
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">OUTILS DE MODIFICATION</span><h2 id="h-lot-title">⚙️ Traitements par lot</h2></div><button type="button" class="icon-button modal-close" data-lot-close aria-label="Fermer">×</button></div>
            <div class="h-lot-body">
                <section class="h-lot-col" aria-labelledby="h-lot-s1"><h3 id="h-lot-s1"><span class="h-lot-num">1</span> Les fichiers <small data-lot-count></small></h3>
                    <div class="h-lot-row"><button type="button" class="button secondary" data-lot-media title="Photos, documents, classeurs et sons de la base : filtres, recherche, plusieurs à la fois">🖼 Choisir dans les médias…</button><button type="button" class="button secondary small" data-lot-clear hidden>× Tout retirer</button></div>
                    <div data-lot-drop></div>
                    <ul class="h-lot-flist" data-lot-flist aria-label="Fichiers du lot"></ul></section>
                <section class="h-lot-col" aria-labelledby="h-lot-s2"><h3 id="h-lot-s2"><span class="h-lot-num">2</span> Les actions <small>dans l’ordre</small></h3>
                    <div class="h-lot-cards" data-lot-cards data-dnd-off></div>
                    <button type="button" class="button secondary h-lot-addcard" data-lot-add aria-haspopup="menu">＋ Ajouter une action ▾</button>
                    <div data-lot-presets></div></section>
                <section class="h-lot-col" aria-labelledby="h-lot-s3"><h3 id="h-lot-s3"><span class="h-lot-num">3</span> Voilà ce qui va se passer</h3>
                    <fieldset class="h-lot-out"><legend>Le résultat</legend>
                        <label class="checkbox-line"><input type="radio" name="h-lot-out" value="version"> 🗂 Nouvelle version du média <small>l’original reste dans ses versions</small></label>
                        <label class="checkbox-line"><input type="radio" name="h-lot-out" value="copy"> ⧉ Copie dans les médias <small>reliée aux mêmes fiches</small></label>
                        <label class="checkbox-line"><input type="radio" name="h-lot-out" value="zip"> ⤓ Un ZIP à télécharger <small>rien ne change dans la base</small></label></fieldset>
                    <div data-lot-plan aria-live="polite"></div></section>
            </div>
            <div class="modal-actions"><span class="h-lot-status" data-lot-status aria-live="polite"></span><span class="spacer"></span><button type="button" class="button secondary" data-lot-cancel>Annuler</button><button type="button" class="button" data-lot-run data-shortcut="⌘↩">▶ Lancer</button></div>`;
        document.body.appendChild(dlg);
        const $ = s => dlg.querySelector(s);
        const U = UI();
        // E4 : glisser-déposer, coller, choisir sur l'ordinateur
        const ACCEPT = 'image/*,.jpg,.jpeg,.png,.webp,.avif,.gif,.bmp,.docx,.odt,.rtf,.md,.txt,.html,.htm,.pdf,.xlsx,.ods,.csv,.tsv,.mp3,.wav,.ogg,.flac,.m4a,.aiff';
        if (U?.dropZone) $('[data-lot-drop]').appendChild(U.dropZone({accept: ACCEPT, multiple: true, text: '', hint: 'Images, documents (Word, LibreOffice, RTF, Markdown, texte, page web, PDF), classeurs (Excel, LibreOffice, CSV) et sons.', onFiles: fl => addFiles([...fl].map(fromFile))}));
        // 💾 les recettes
        const builtinN = () => B().BUILTIN.length;
        const all = () => [...B().BUILTIN.map(b => ({name: `${b.name} (prêt)`, date: '', recipe: b.recipe, builtin: true})), ...userRecipes()];
        if (U?.presetsFrame) {
            const today = () => new Date().toISOString();
            const fr = U.presetsFrame({id: 'traitements-lot', title: 'Recettes enregistrées', what: 'cette chaîne d’actions et la sortie', quietApply: true, list: () => all().map(x => ({name: x.name, date: x.date})),
                apply: i => { const x = all()[i]; if (!x) return false; recipe = B().cleanRecipe(JSON.parse(JSON.stringify(x.recipe))); recipe.cards.forEach(c => { c.id = B().newCard(c.type).id; }); drawCards(); drawOut(); schedule(); remember(); toast(`Recette « ${x.name} » appliquée.`); return false; },
                save: name => { const l = userRecipes(), it = {name, date: today(), recipe: B().cleanRecipe(recipe)}, k = l.findIndex(x => x.name === name); if (k >= 0) l[k] = it; else l.push(it); return saveRecipes(l); },
                replace: i => { if (i < builtinN()) { toast('Une recette prête ne se remplace pas : enregistre-la sous un autre nom.', 'error'); return false; } const l = userRecipes(); l[i - builtinN()] = {...l[i - builtinN()], date: today(), recipe: B().cleanRecipe(recipe)}; return saveRecipes(l); },
                rename: (i, name) => { if (i < builtinN()) return false; const l = userRecipes(); l[i - builtinN()].name = name; return saveRecipes(l); },
                duplicate: i => { const x = all()[i]; if (!x) return false; const l = userRecipes(); l.push({name: U.freeName(x.name.replace(/ \(prêt\)$/, '').replace(/^\S+\s/, x.builtin ? '' : '$&'), l.map(y => y.name)), date: today(), recipe: x.recipe}); return saveRecipes(l); },
                exportOne: i => { const x = all()[i]; if (!x) return false; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({lcnda: 'reglage', outil: 'traitements-lot', nom: x.name, version: 1, donnees: x.recipe}, null, 1)], {type: 'application/json'})); a.download = `lcnda-reglage-traitements-lot-${B().noAccents(x.name).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'recette'}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); return false; },
                remove: i => { if (i < builtinN()) { toast('Une recette prête ne se supprime pas.', 'error'); return false; } const l = userRecipes(), it = l[i - builtinN()]; A().undoLocalChange(`Recette « ${it.name} » supprimée`, [USER_KEY], () => { l.splice(i - builtinN(), 1); saveRecipes(l); }, () => fr.isConnected && fr.refresh()); },
                importOne: async () => { const f = await new Promise(ok => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.dataset.kDirect = ''; inp.addEventListener('change', () => ok(inp.files?.[0] || null), {once: true}); inp.click(); }); if (!f) return false;
                    let d; try { d = JSON.parse(await f.text()); } catch (_) { toast('Ce fichier n’est pas une recette LCNDA.', 'error'); return false; }
                    if (d?.lcnda !== 'reglage' || d.outil !== 'traitements-lot' || !d.donnees) { toast('Ce fichier n’est pas une recette des traitements par lot.', 'error'); return false; }
                    const l = userRecipes(), name = String(d.nom || 'Recette importée').replace(/[<>"`]/g, '').replace(/ \(prêt\)$/, '').slice(0, 60); l.push({name: l.some(x => x.name === name) ? U.freeName(name, l.map(x => x.name)) : name, date: today(), recipe: B().cleanRecipe(d.donnees)}); return saveRecipes(l); }});
            $('[data-lot-presets]').appendChild(fr);
        }

        /* — les fichiers — */
        function drawFiles() {
            const ul = $('[data-lot-flist]'), n = files.length;
            $('[data-lot-count]').textContent = n ? `· ${plural(n, 'fichier')}` : '';
            $('[data-lot-clear]').hidden = n < 2;
            ul.innerHTML = n ? files.map(f => `<li class="h-lot-file${f.bad ? ' is-bad' : ''}" data-uid="${f.uid}" tabindex="0" aria-label="${esc(f.name)}"><span class="h-lot-fth">${f.thumb ? `<img src="${esc(f.thumb)}" alt="" loading="lazy">` : `<span aria-hidden="true">${B().KIND_ICON[f.kind] || '📁'}</span>`}</span>
                <span class="h-lot-fname"><b>${esc(f.name)}</b><small>${esc([f.base ? '🗂 base' : '💻 ordinateur', B().KIND_LABEL[f.kind], f.w ? `${f.w} × ${f.h} px` : '', B().sizeText(f.bytes), f.bad || (f.ready ? '' : '…')].filter(Boolean).join(' · '))}</small></span>
                <button type="button" class="icon-button small" data-lot-rm="${f.uid}" title="Retirer du lot" aria-label="Retirer « ${esc(f.name)} » du lot">×</button></li>`).join('')
                : `<li class="h-lot-empty">${A().empty('Aucun fichier pour l’instant', {icon: '🗂', action: {label: '🖼 Choisir dans les médias…', attrs: 'data-empty-click="[data-lot-media]"'}})}</li>`;
        }
        async function addFiles(list) {
            const seen = new Set(files.map(f => (f.base ? `b${f.id}` : `p${f.file.name}${f.file.size}${f.file.lastModified}`)));
            const fresh = list.filter(f => { const k = f.base ? `b${f.id}` : `p${f.file.name}${f.file.size}${f.file.lastModified}`; if (seen.has(k)) return false; seen.add(k); return true; });
            const room = 500 - files.length;
            if (fresh.length > room) toast(`500 fichiers au plus par lot : ${plural(fresh.length - Math.max(0, room), 'fichier')} de côté.`, 'error');
            files.push(...fresh.slice(0, Math.max(0, room)));
            drawFiles(); schedule();
            await namePeople(fresh);
            let k = 0; const queue = fresh.slice(); const worker = async () => { while (queue.length) { const it = queue.shift(); await analyse(it); if (++k % 4 === 0 || !queue.length) { drawFiles(); schedule(); } } };
            await Promise.all([worker(), worker(), worker()]);
            drawFiles(); schedule();
        }
        const removeFile = uid => { const f = files.find(x => x.uid === uid); if (f?.src === 'pc' && f.thumb) URL.revokeObjectURL(f.thumb); files = files.filter(x => x.uid !== uid); drawFiles(); schedule(); };

        /* — la chaîne — */
        function drawCards() {
            const box = $('[data-lot-cards]');
            box.innerHTML = recipe.cards.length ? recipe.cards.map(cardHtml).join('') : A().empty('Aucune action : ajoute-en une', {icon: '⚙️', action: {label: '＋ Ajouter une action', attrs: 'data-empty-click="[data-lot-add]"'}});
            box.querySelectorAll('.h-lot-card').forEach(showFields);
        }
        const cardOf = el => recipe.cards.find(c => c.id === el.closest('[data-cid]')?.dataset.cid);
        function showFields(el) { const c = cardOf(el); if (c?.type !== 'resize') return; el.querySelectorAll('[data-show]').forEach(s => { s.hidden = !s.dataset.show.split(' ').includes(c.p.by); }); }
        function readCard(el) {
            const c = cardOf(el); if (!c) return;
            const raw = {...c.p};
            el.querySelectorAll('[data-k]').forEach(i => { raw[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value; });
            c.p = B().cleanParams(c.type, raw);
            el.querySelector('[data-sum]').textContent = B().summary(c);
            showFields(el); remember(); schedule();
        }
        const addCard = type => { recipe.cards.push(B().newCard(type)); drawCards(); remember(); schedule(); dlg.querySelector('.h-lot-card:last-child .h-lot-grip')?.focus(); };
        const move = (id, to) => { const i = recipe.cards.findIndex(c => c.id === id); if (i < 0) return; const [c] = recipe.cards.splice(i, 1); recipe.cards.splice(Math.max(0, Math.min(recipe.cards.length, to)), 0, c); drawCards(); remember(); schedule(); };
        function drawOut() { dlg.querySelectorAll('[name=h-lot-out]').forEach(r => { r.checked = r.value === recipe.out; }); }

        /* — l'aperçu — */
        const schedule = () => { clearTimeout(timer); timer = setTimeout(drawPlan, 120); };
        function drawPlan() {
            if (running) return;
            const box = $('[data-lot-plan]'), run = $('[data-lot-run]');
            const pl = planNow = B().plan(files, recipe, {out: recipe.out, avif: avifOk !== false});
            const act = pl.rows.filter(r => r.todo), chg = pl.rows.filter(r => r.changed && r.todo);
            run.textContent = act.length ? `▶ Lancer sur ${plural(act.length, 'fichier')}` : '▶ Lancer';
            run.disabled = !act.length || files.some(f => !f.ready);
            if (!files.length) { box.innerHTML = A().empty('Choisis d’abord des fichiers : chaque changement s’affichera ici avant de lancer.', {icon: '👀'}); setStatus(''); return; }
            const badge = r => ({version: U.badge('Nouvelle version', 'blue'), meta: U.badge('Titre et liens', 'blue'), copy: U.badge('Copie', 'green'), new: U.badge('Nouveau média', 'green'), zip: U.badge('Dans le ZIP', 'grey'), pdf: U.badge('Dans le PDF', 'grey'), none: U.badge('Rien ne change', 'grey'), skip: U.badge('Laissé de côté', 'yellow')}[r.mode] || '');
            const arrow = (a, b) => (a === b ? `<span>${esc(a)}</span>` : `<span class="h-lot-was">${esc(a)}</span> → <b>${esc(b)}</b>`);
            box.innerHTML = `${pl.warnings.map(w => U.notice('warn', w)).join('')}${pl.pdf ? U.notice('info', `📄 « ${pl.pdf.name} » : ${plural(pl.pdf.pages, 'page')} (${pl.pdf.page === 'a4' ? 'A4' : 'à la taille des images'})${recipe.out === 'zip' ? ', dans le ZIP' : ', rangé dans les médias'}.`) : ''}
                <p class="h-lot-sum">${esc(plural(files.length, 'fichier'))} · <b>${esc(plural(chg.length, 'change', 'changent'))}</b>${recipe.out === 'zip' ? ' · rien ne change dans la base' : ''}</p>
                <ol class="h-lot-plan">${pl.rows.map(r => { const f = files[r.i];
                    const dims = r.kind === 'image' && r.before.w ? arrow(`${r.before.w} × ${r.before.h}`, `${r.after.w} × ${r.after.h}`) + ' px' : '';
                    return `<li class="h-lot-prow${r.changed ? '' : ' is-same'}"><span class="h-lot-pth">${f.thumb ? `<img src="${esc(f.thumb)}" alt="" loading="lazy">` : `<span aria-hidden="true">${B().KIND_ICON[r.kind] || '📁'}</span>`}</span>
                        <span class="h-lot-pmain"><span class="h-lot-pname">${arrow(r.before.name, r.after.name)}</span>
                        <small>${[dims, arrow(r.before.fmt, r.after.fmt), r.before.bytes ? B().sizeText(r.before.bytes) : '', r.gps && !r.ops.includes('strip') ? '📍 position GPS dans la photo' : ''].filter(Boolean).join(' · ')}</small>
                        ${r.notes.length ? `<small class="h-lot-notes">${r.notes.map(esc).join(' · ')}</small>` : ''}</span>${badge(r)}</li>`; }).join('')}</ol>`;
            const waiting = files.filter(f => !f.ready).length;
            setStatus(waiting ? `${U.spinner(`Lecture des fichiers… (${waiting})`)}` : '', true);
        }
        const setStatus = (t, html = false) => { const s = $('[data-lot-status]'); if (html) s.innerHTML = t; else s.textContent = t; };

        /* — lancer — */
        async function runAll() {
            if (running) return;
            const pl = B().plan(files, recipe, {out: recipe.out, avif: await canAvif()});
            const todo = pl.rows.filter(r => r.todo);
            if (!todo.length && !pl.pdf) return;
            running = true; stop = false; const total = todo.filter(r => r.mode !== 'pdf').length + (pl.pdf ? 1 : 0);
            const box = $('[data-lot-plan]'), run = $('[data-lot-run]'), cancel = $('[data-lot-cancel]');
            dlg.classList.add('is-running'); run.disabled = true; cancel.textContent = '■ Arrêter';
            box.innerHTML = `<div class="h-lot-prog"><progress max="${total}" value="0" data-lot-bar></progress><div data-lot-now>${U.spinner('On commence…')}</div></div><ol class="h-lot-plan h-lot-done" data-lot-done></ol>`;
            const bar = $('[data-lot-bar]'), now = $('[data-lot-now]'), done = $('[data-lot-done]');
            const zip = [], pages = [], tg = [...recipe.cards].reverse().find(c => c.on && c.type === 'tags');
            let token = '', ok = 0, bad = 0, k = 0;
            const line = (name, okk, txt) => done.insertAdjacentHTML('beforeend', `<li class="h-lot-prow"><span class="h-lot-pmain"><span class="h-lot-pname">${okk ? '✓' : '⛔'} ${esc(name)}</span>${txt ? `<small class="${okk ? 'h-lot-ok' : 'h-lot-notes'}">${esc(txt)}</small>` : ''}</span></li>`);
            const sendItem = async (fields, blob, fname) => {
                const fd = new FormData(); fd.append('csrf', A().state.csrf); fd.append('token', token);
                Object.entries(fields).forEach(([key, v]) => fd.append(key, v == null ? '' : String(v)));
                if (blob) fd.append('file', blob, fname);
                const r = await fetch('api.php?action=lot_item', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}});
                const j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'})); if (!r.ok || j.error) throw new Error(j.error || `Erreur ${r.status}`); return j.result;
            };
            const tagFields = () => (tg ? {label_ids: tg.p.labels.join(','), person_id: tg.p.person || ''} : {});
            try {
                if (recipe.out !== 'zip') token = (await post('lot_begin', {count: total, name: recipeInfo(recipe).slice(0, 80)})).result.token;
                for (const r of todo) {
                    if (stop) break;
                    const it = files[r.i], notes = [];
                    now.innerHTML = U.spinner(`${k + 1} / ${total} · ${it.name}`);
                    try {
                        if (r.ops.includes('pdf')) pages.push(await pdfPage(it, recipe.cards, pl.pdf));
                        if (r.mode === 'pdf') { ok++; continue; }
                        let blob = null;
                        if (r.mode !== 'meta') {
                            blob = r.kind === 'image' ? await runImage(it, r, recipe.cards, notes) : r.kind === 'doc' ? await runDoc(it, r, notes) : r.kind === 'sheet' ? await runSheet(it, r) : r.kind === 'audio' ? await runAudio(it, r) : await blobOf(it);
                        }
                        if (r.mode === 'zip') { zip.push({name: r.after.name, data: new Uint8Array(await blob.arrayBuffer()), store: ['image', 'audio'].includes(r.kind) || /^(docx|odt|xlsx|ods|pdf)$/.test(r.after.ext)}); line(`${r.before.name} → ${r.after.name}`, true, [blob ? B().sizeText(blob.size) : '', ...notes].filter(Boolean).join(' · ')); }
                        else {
                            const res = await sendItem({mode: r.mode, media_id: it.base ? it.id : 0, name: r.after.name, title: r.title || (r.mode === 'new' ? r.after.base : ''), ...tagFields()}, blob, r.after.name);
                            if (it.base && ['version', 'meta'].includes(r.mode)) { // la suite part de la nouvelle version (et de son titre)
                                if (r.mode === 'version') it.filename = res.filename;
                                it.title = res.title || it.title; it.name = `${B().safeName(it.title)}.${B().extOf(it.filename) || r.after.ext}`;
                                if (it.kind === 'image') it.thumb = `media/${encodeURIComponent(it.filename)}`;
                            }
                            line(`${r.before.name} → ${r.after.name}`, true, [{version: 'nouvelle version', copy: 'copie rangée', new: 'rangé dans les médias', meta: 'titre et liens'}[r.mode], blob ? B().sizeText(blob.size) : '', ...notes].filter(Boolean).join(' · '));
                        }
                        ok++;
                    } catch (err) { bad++; line(r.before.name, false, err.message || String(err)); }
                    bar.value = ++k;
                }
                if (pl.pdf && pages.length && !stop) {
                    now.innerHTML = U.spinner(`${pl.pdf.name} : ${plural(pages.length, 'page')}…`);
                    const mk = ext.vectorInternals?.makePdf; if (!mk) throw new Error('le fabricant de PDF n’est pas chargé');
                    const pdf = mk(pages, pl.pdf.name.replace(/\.pdf$/, ''));
                    if (recipe.out === 'zip') zip.push({name: pl.pdf.name, data: new Uint8Array(await pdf.arrayBuffer()), store: true});
                    else await sendItem({mode: 'new', media_id: 0, name: pl.pdf.name, title: pl.pdf.name.replace(/\.pdf$/, ''), ...tagFields()}, pdf, pl.pdf.name);
                    line(`📄 ${pl.pdf.name}`, true, `${plural(pages.length, 'page')} · ${B().sizeText(pdf.size)}`); ok++; bar.value = ++k;
                }
                if (zip.length) {
                    now.innerHTML = U.spinner('Le ZIP…');
                    const blob = await window.LCNDA_SHEET.makeZip(uniqueZip(zip));
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `traitement-par-lot-${B().today()}.zip`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
                    dlg.dataset.zipSize = String(blob.size); dlg._lastZip = blob;
                }
            } catch (err) { bad++; line('Le lot', false, err.message || String(err)); }
            running = false; dlg.classList.remove('is-running'); cancel.textContent = 'Fermer'; run.disabled = false; run.textContent = '▶ Relancer';
            const what = `${plural(ok, 'fichier')} traité${ok > 1 ? 's' : ''}${bad ? `, ${plural(bad, 'erreur')}` : ''}${stop ? ' (arrêté)' : ''}`;
            now.innerHTML = U.notice(bad ? 'warn' : 'ok', recipe.out === 'zip' ? `${what} · ⤓ le ZIP est téléchargé.` : `${what} · rangé dans les médias.`);
            setStatus('');
            if (token && ok) {
                const tok = token;
                A().undoToast(`⚙️ ${what}`, {undo: async () => { await post('lot_undo', {token: tok}); A().refreshMediaViews?.(); if (dlg.isConnected) { files.forEach(f => { f.ready = false; }); await Promise.all(files.filter(f => f.base).map(async f => { try { const r = await api('picker_search', {kind: 'media', ids: String(f.id), limit: 1}); const m = (r.groups || [])[0]?.items?.[0]; if (m) { f.filename = m.filename; f.title = m.title; } } catch (_) {} await analyse(f); })); drawFiles(); drawPlan(); } }, undoneText: `Traitement par lot : ${what}`});
                if (ok) o.onDone?.();
            } else if (recipe.out === 'zip' && ok) toast(`⚙️ ${what} · ⤓ ZIP téléchargé.`, 'success');
            dlg.dataset.lotDone = String(ok); dlg.dataset.lotBad = String(bad); dlg.dataset.lotToken = token;
            // les fichiers de la base ont changé de version : l'aperçu repart de là
            for (const f of files.filter(x => x.base)) { f.ready = false; }
            await Promise.all(files.filter(x => x.base).map(analyse)); drawFiles();
        }
        function uniqueZip(list) { const names = B().uniqueNames(list.map(z => z.name)); return list.map((z, i) => ({...z, name: names[i]})); }

        /* — écouteurs — */
        const close = () => { if (running) { stop = true; return; } dlg.close(); };
        dlg.addEventListener('cancel', e => { e.preventDefault(); if (document.querySelector('.ui-actmenu, .pk-list:not([hidden])')) return; close(); });
        dlg.addEventListener('close', () => { files.forEach(f => { if (f.src === 'pc' && f.thumb) URL.revokeObjectURL(f.thumb); }); dlg.remove(); o.onClose?.(); });
        dlg.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b || !dlg.contains(b)) return;
            if (b.matches('[data-lot-close]')) return close();
            if (b.matches('[data-lot-cancel]')) return close();
            if (b.matches('[data-lot-run]')) return runAll();
            if (b.matches('[data-lot-clear]')) { const keep = files; files = []; drawFiles(); schedule(); A().undoToast(`${plural(keep.length, 'fichier')} retiré${keep.length > 1 ? 's' : ''} du lot`, {undo: () => { files = keep; drawFiles(); schedule(); }}); return; }
            if (b.matches('[data-lot-rm]')) return removeFile(b.dataset.lotRm);
            if (b.matches('[data-lot-media]')) {
                const list = await P().openMediaPicker?.({multiple: true, types: ['image', 'document', 'audio'], eyebrow: 'TRAITEMENTS PAR LOT', title: 'Les fichiers à traiter', value: files.filter(f => f.base).map(f => f.id)});
                if (list?.length) addFiles(list.map(fromMedia));
                return;
            }
            if (b.matches('[data-lot-add]')) {
                const items = B().ORDER.map(t => ({icon: B().ACTIONS[t].icon, label: B().ACTIONS[t].label, help: B().ACTIONS[t].help, run: () => addCard(t)}));
                return U.menuAt(b, items, {title: 'Ajouter une action'});
            }
            const card = b.closest('.h-lot-card'); if (!card) return;
            const c = cardOf(card);
            if (b.matches('[data-fold]')) { c.fold = !c.fold; card.classList.toggle('is-folded', c.fold); b.setAttribute('aria-expanded', String(!c.fold)); b.title = c.fold ? 'Déplier les réglages' : 'Replier les réglages'; b.querySelector('.h-lot-car').textContent = c.fold ? '▸' : '▾'; return; }
            if (b.matches('[data-dup]')) { const i = recipe.cards.indexOf(c), copy = {...JSON.parse(JSON.stringify(c)), id: B().newCard(c.type).id}; recipe.cards.splice(i + 1, 0, copy); drawCards(); remember(); schedule(); return; }
            if (b.matches('[data-del]')) { const i = recipe.cards.indexOf(c); recipe.cards.splice(i, 1); drawCards(); remember(); schedule(); A().undoToast(`Action « ${B().ACTIONS[c.type].label} » retirée`, {undo: () => { recipe.cards.splice(i, 0, c); drawCards(); remember(); schedule(); }}); return; }
            if (b.matches('[data-token]')) { const inp = card.querySelector('[data-k=pattern]'); const s = inp.selectionStart ?? inp.value.length, en = inp.selectionEnd ?? s; inp.value = inp.value.slice(0, s) + b.dataset.token + inp.value.slice(en); inp.focus(); inp.setSelectionRange(s + b.dataset.token.length, s + b.dataset.token.length); readCard(card); }
        });
        dlg.addEventListener('input', e => { const card = e.target.closest('.h-lot-card'); if (card && e.target.matches('[data-k]')) readCard(card); });
        dlg.addEventListener('change', e => {
            const t = e.target;
            if (t.name === 'h-lot-out') { recipe.out = t.value; remember(); schedule(); return; }
            const card = t.closest('.h-lot-card'); if (!card) return;
            if (t.matches('[data-on]')) { const c = cardOf(card); c.on = t.checked; card.classList.toggle('is-off', !c.on); remember(); schedule(); return; }
            if (t.matches('[data-k]')) readCard(card);
        });
        dlg.addEventListener('picker-change', e => {
            const card = e.target.closest('.h-lot-card'); const c = card && cardOf(card); if (!c || c.type !== 'tags') return;
            const d = e.detail || {};
            if (d.kind === 'label') c.p.labels = (Array.isArray(d.value) ? d.value : []).map(Number).filter(x => x > 0);
            if (d.kind === 'person') { c.p.person = Number(d.value) > 0 ? Number(d.value) : 0; c.p.personName = c.p.person ? String(d.item?.title || '') : ''; }
            c.p = B().cleanParams('tags', c.p); card.querySelector('[data-sum]').textContent = B().summary(c); remember(); schedule();
        });
        // ⠿ ranger : glisser, ou Alt + ↑ / ↓ sur la poignée
        dlg.addEventListener('keydown', e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runAll(); return; }
            const g = e.target.closest('.h-lot-grip');
            if (g && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); const id = g.closest('[data-cid]').dataset.cid, i = recipe.cards.findIndex(c => c.id === id); move(id, i + (e.key === 'ArrowUp' ? -1 : 1)); dlg.querySelector(`[data-cid="${CSS.escape(id)}"] .h-lot-grip`)?.focus(); return; }
            const li = e.target.closest('.h-lot-file');
            if (li && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); const next = li.nextElementSibling || li.previousElementSibling; removeFile(li.dataset.uid); dlg.querySelector(`[data-uid="${CSS.escape(next?.dataset.uid || '')}"]`)?.focus(); }
            if (li && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); (e.key === 'ArrowDown' ? li.nextElementSibling : li.previousElementSibling)?.focus?.(); }
        });
        const cardsBox = $('[data-lot-cards]');
        // la carte ne se glisse que tenue par sa poignée (sinon on ne pourrait plus choisir le texte d'une case) ; Alt + ↑ / ↓ rejoue ce glisser (heritage-dnd.js)
        cardsBox.addEventListener('pointerdown', e => { const g = e.target.closest('.h-lot-grip'); if (g) g.closest('.h-lot-card').setAttribute('draggable', 'true'); });
        cardsBox.addEventListener('pointerup', () => cardsBox.querySelectorAll('.h-lot-card[draggable]').forEach(x => x.removeAttribute('draggable')));
        cardsBox.addEventListener('dragstart', e => { const card = e.target.closest?.('.h-lot-card'); if (!card) return; dragId = card.dataset.cid; if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (_) {} } card.classList.add('is-drag'); });
        cardsBox.addEventListener('dragover', e => { if (!dragId) return; e.preventDefault(); const over = e.target.closest('.h-lot-card'); cardsBox.querySelectorAll('.is-drop-before, .is-drop-after').forEach(x => x.classList.remove('is-drop-before', 'is-drop-after')); if (over && over.dataset.cid !== dragId) { const r = over.getBoundingClientRect(); over.classList.add(e.clientY < r.top + r.height / 2 ? 'is-drop-before' : 'is-drop-after'); } });
        cardsBox.addEventListener('drop', e => { if (!dragId) return; e.preventDefault(); const over = e.target.closest('.h-lot-card'); const id = dragId; dragId = ''; if (!over || over.dataset.cid === id) return drawCards(); const r = over.getBoundingClientRect(), after = e.clientY >= r.top + r.height / 2; const list = recipe.cards.filter(c => c.id !== id); let to = list.findIndex(c => c.id === over.dataset.cid) + (after ? 1 : 0); const c = recipe.cards.find(x => x.id === id); recipe.cards = list; recipe.cards.splice(to, 0, c); drawCards(); remember(); schedule(); });
        cardsBox.addEventListener('dragend', () => { dragId = ''; cardsBox.querySelectorAll('.h-lot-card[draggable]').forEach(x => x.removeAttribute('draggable')); cardsBox.querySelectorAll('.is-drag, .is-drop-before, .is-drop-after').forEach(x => x.classList.remove('is-drag', 'is-drop-before', 'is-drop-after')); });

        drawFiles(); drawCards(); drawOut(); drawPlan();
        dlg.showModal();
        canAvif().then(() => { if (dlg.isConnected) { drawCards(); schedule(); } });
        if (o.media?.length) addFiles(o.media.map(fromMedia));
        if (o.files?.length) addFiles([...o.files].map(fromFile));
        dlg._lot = {get files() { return files; }, get recipe() { return recipe; }, plan: () => planNow, addFiles: list => addFiles(list.map(x => (x instanceof File ? fromFile(x) : fromMedia(x)))), run: runAll};
        return dlg;
    }
    ext.openBatch = openBatch;
    ext.batchInternals = {runImage, runDoc, runSheet, imageCanvas, encodeCanvas, opCrop, opResize, opGray, opWatermark, canAvif, userRecipes, USER_KEY};

    /* ═════ Dans 🛠️ Outils de modification : les recettes gardées ═════ */
    ext.editToolsExtra = ext.editToolsExtra || [];
    ext.editToolsExtra.push({key: 'lot', icon: '⚙️', label: 'Traitements par lot', what: 'traitement par lot',
        load: async () => userRecipes().map((x, i) => ({id: i + 1, name: x.name, date: x.date, thumb: `<span class="h-et-ico">${esc(B().ACTIONS[x.recipe.cards.find(c => c.on)?.type || 'rename'].icon)}</span>`, info: `${recipeInfo(x.recipe)} · ${outLabel(x.recipe.out)}`})),
        open: (id, again) => { const x = userRecipes()[id - 1]; if (x) openBatch({recipe: x.recipe, onClose: again}); },
        create: again => openBatch({onClose: again}),
        rename: (id, name) => { const l = userRecipes(); if (!l[id - 1]) return; l[id - 1].name = name.slice(0, 60); saveRecipes(l); },
        remove: id => { const l = userRecipes(); l.splice(id - 1, 1); saveRecipes(l); }, createLabel: '＋ Nouveau traitement',
        extra: '<button type="button" class="button secondary" data-et-x="web" title="1 600 px au plus, JPG 82 %, sans la position GPS : prêtes à envoyer ou à mettre en ligne">🌐 Photos pour le web</button><button type="button" class="button secondary" data-et-x="seq" title="photo-001, photo-002… (et le titre dans les médias)">🔢 Renommer en séquence</button><button type="button" class="button secondary" data-et-x="pdf" title="Des scans ou des photos d’actes réunis dans un seul PDF, une page par image">📄 Scans en PDF</button>',
        onExtra: (k, again) => { const b = B().BUILTIN[{web: 0, seq: 1, pdf: 2}[k]]; if (b) openBatch({recipe: b.recipe, onClose: again}); }});
})();
