/* LCNDA — 📤 « Envoyer vers… » : le même menu dans chaque outil (maquette docs/design/outils-liens.html, partie 1).
 * Un outil dit CE QU'IL ENVOIE (une image, un texte, des lignes, un son, une vidéo) ; le menu ne propose que les outils qui
 * savent le recevoir. Une image, un son ou une vidéo sont d'abord rangés dans les Médias (rien ne se perd).
 *
 *   ext.sendTo(kind, payload, {anchor, title, exclude: [clés]})       — le petit menu (ou directement {to: 'clé'})
 *     kind 'image' : payload = {blob} ou {media: {id, filename, title}}        (une image déjà dans les médias)
 *     kind 'images': payload = {medias: [{id, filename, title}]}             (un album, un résultat de lot)
 *     kind 'text'  : payload = {html, name}                                   (un texte mis en forme, HTML simple)
 *     kind 'rows'  : payload = {rows: [[en-têtes], [ligne]…], name}           (un tableau de données)
 *     kind 'audio' : payload = {blob} ou {media}, + {subs: [{start, end, text}]} (secondes ; la transcription)
 *     kind 'video' : payload = {blob} ou {media}
 *     kind 'svg'   : payload = {svg, name}                                    (un dessin vectoriel)
 *   ext.sendImage(blob, {title, anchor, to})  — l'ancien nom, gardé (= sendTo('image', {blob}, …))
 *   ext.sendTargets : la liste des destinations {key, icon, label, kinds, ready(), run(kind, data, opts)} ; un outil peut y ajouter la sienne.
 *
 * Les outils qui reçoivent (chacun dans son fichier) : ext.newMontage / openAvEditor (Montage), ext.openAnimStudio (Studio),
 * ext.keynoteWithObject (Présentation), ext.layoutWithMedia (Mise en page), ext.openTextDoc (Traitement de texte),
 * ext.openRowsInSheet (Tableur), ext.siteReceive (Mon site web), ext.openSlideshow (Diaporama), ext.openBatch (Lot),
 * ext.photoCompareWith (Comparer), ext.openActTranscriber (Atelier), ext.retouchMedia (Retouche), ext.openVectorEditor (Dessin). */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {}, A = () => window.LCNDA_APP;
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const mediaUrl = m => `media/${encodeURIComponent(m.filename)}`;

    /** range un fichier dans les Médias → {id, filename, title} */
    async function store(blob, title) {
        if (!ext.rtUploadCopy) throw new Error(T('L’envoi dans les médias n’est pas chargé.'));
        const r = await ext.rtUploadCopy(blob, {title}); const id = Number(r.media_id || r.id || 0), filename = r.filename || '';
        if (!id || !filename) throw new Error(T('L’image n’a pas pu être rangée dans les médias.'));
        return {id, filename, title};
    }
    async function pickAnimProject() {
        let list = []; try { list = (await A().api('anim_projects')).projects || []; } catch (_) {}
        if (!list.length) { A().toast(T('Aucun film dans le Studio d’animation : un nouveau est créé.')); return 0; }
        return new Promise(res => { const items = list.slice(0, 40).map(p => ({icon: '🎞', label: p.title || T('Sans nom'), run: () => res(Number(p.id))})); items.push('-', {icon: '＋', label: T('Un nouveau film'), run: () => res(0)});
            window.LCNDA_UI?.menuAt ? window.LCNDA_UI.menuAt(document.activeElement || document.body, items, {title: T('Dans quel film ?')}) : res(0); });
    }
    /** une image en HTML pour un texte (Traitement de texte, page de site) */
    const imgHtml = m => `<p><img src="${esc(mediaUrl(m))}" alt="${esc(m.title || '')}" data-media-id="${m.id}"></p>${m.title ? `<p><i>${esc(m.title)}</i></p>` : ''}`;
    const rowsHtml = rows => `<table>${(rows || []).map((r, i) => `<tr>${(r || []).map(v => (i ? `<td>${esc(v)}</td>` : `<th>${esc(v)}</th>`)).join('')}</tr>`).join('')}</table>`;
    const openText = (html, name) => (ext.openTextDoc && ext.textDocTools?.dataOf ? ext.openTextDoc({data: ext.textDocTools.dataOf(html), name}) : A().toast(T('Le traitement de texte n’est pas chargé.'), 'error'));

    /* ─── les destinations ─── (ready : l'outil est chargé ; run : reçoit les données, les médias déjà rangés) */
    const TARGETS = [
        {key: 'montage-new', icon: '🎬', label: 'Dans un nouveau montage vidéo', group: 'Montage vidéo', kinds: ['image', 'images', 'audio', 'video'], ready: () => !!ext.newMontage,
            run: (k, d) => { if (k === 'video' && ext.openAvEditor) return ext.openAvEditor(d.media);
                if (k === 'audio') return ext.newMontage(null, {audio: d.media, subs: d.subs || null});
                ext._montageSeedVisual = k === 'images' ? {list: d.medias.map(m => ({mediaId: m.id, filename: m.filename, title: m.title}))} : {mediaId: d.media.id, filename: d.media.filename, title: d.media.title};
                return ext.newMontage(); }},
        {key: 'montage', icon: '🎬', label: 'Dans un montage existant…', group: 'Montage vidéo', kinds: ['image', 'images'], ready: () => !!ext.openMontageProjects,
            run: (k, d) => { ext._montageSeedVisual = k === 'images' ? {list: d.medias.map(m => ({mediaId: m.id, filename: m.filename, title: m.title}))} : {mediaId: d.media.id, filename: d.media.filename, title: d.media.title}; return ext.openMontageProjects(); }},
        {key: 'anim-new', icon: '🎞', label: 'Dans un nouveau film du Studio d’animation', group: 'Studio d’animation', kinds: ['image', 'audio'], ready: () => !!ext.openAnimStudio,
            run: (k, d) => ext.openAnimStudio(k === 'audio' ? {id: 0, audio: {id: d.media.id, filename: d.media.filename, title: d.media.title}} : {id: 0, image: {id: d.media.id, filename: d.media.filename, title: d.media.title}})},
        {key: 'anim', icon: '🎞', label: 'Dans un film existant du Studio…', group: 'Studio d’animation', kinds: ['image', 'audio'], ready: () => !!ext.openAnimStudio,
            run: async (k, d) => { const id = await pickAnimProject(); return ext.openAnimStudio(k === 'audio' ? {id, audio: {id: d.media.id, filename: d.media.filename, title: d.media.title}} : {id, image: {id: d.media.id, filename: d.media.filename, title: d.media.title}}); }},
        {key: 'keynote', icon: '🎞️', label: 'Dans une nouvelle présentation', group: 'Présentation', kinds: ['image', 'text', 'rows'], ready: () => !!ext.keynoteWithObject,
            run: (k, d, o) => (k === 'image' ? ext.keynoteWithObject({t: 'image', media: d.media}, o.title) : k === 'rows' ? ext.keynoteWithObject({t: 'table', rows: d.rows}, d.name || o.title)
                : ext.keynoteFromText ? ext.keynoteFromText(d.html, d.name || o.title) : ext.keynoteWithObject({t: 'text', html: d.html}, d.name || o.title))},
        {key: 'slideshow', icon: '🎞️', label: 'Dans un nouveau diaporama', group: 'Présentation', kinds: ['images'], ready: () => !!ext.openSlideshow,
            run: (k, d, o) => ext.openSlideshow({preset: {name: o.title || T('Diaporama'), show: {slides: d.medias.map(m => ({media_id: m.id, filename: m.filename, title: m.title}))}}})},
        {key: 'layout', icon: '📐', label: 'Dans un livre de la Mise en page…', group: 'Mise en page', kinds: ['image', 'svg'], ready: () => !!ext.layoutWithMedia,
            run: (k, d, o) => ext.layoutWithMedia(k === 'svg' ? {svg: d.svg, name: d.name || o.title} : {media: d.media}, {anchor: o.anchor})},
        {key: 'textdoc', icon: '📝', label: 'Dans un nouveau document (Traitement de texte)', group: 'Traitement de texte', kinds: ['image', 'text', 'rows'], ready: () => !!ext.openTextDoc,
            run: (k, d, o) => openText(k === 'image' ? imgHtml(d.media) : k === 'rows' ? `<h1>${esc(d.name || o.title || '')}</h1>${rowsHtml(d.rows)}` : d.html, d.name || o.title || T('Document'))},
        {key: 'sheet', icon: '🧾', label: 'Dans le Tableur', group: 'Tableur', kinds: ['rows'], ready: () => !!ext.openRowsInSheet, run: (k, d, o) => ext.openRowsInSheet({name: d.name || o.title || T('Tableau'), rows: d.rows})},
        {key: 'site', icon: '🌐', label: 'Sur une page de mon site…', group: 'Mon site web', kinds: ['image', 'video', 'audio', 'text', 'svg'], ready: () => !!ext.siteReceive,
            run: (k, d, o) => ext.siteReceive({type: k, media: d.media || null, html: d.html || (d.subs || []).map(x => `<p>${esc(x.text || '')}</p>`).join(''), svg: d.svg || '', name: d.name || o.title || ''}, {anchor: o.anchor})},
        {key: 'retouch', icon: '🎚️', label: 'Dans la Retouche des photos', group: 'Retouche', kinds: ['image'], ready: () => !!ext.retouchMedia, run: (k, d) => ext.retouchMedia(d.media)},
        {key: 'compare', icon: '🔍', label: 'Comparer avec une autre photo', group: 'Comparer deux photos', kinds: ['image'], ready: () => !!ext.photoCompareWith, run: (k, d) => ext.photoCompareWith(d.media.id)},
        {key: 'atelier', icon: '📜', label: 'Dans l’Atelier de transcription', group: 'Atelier de transcription', kinds: ['image'], ready: () => !!ext.openActTranscriber,
            run: (k, d) => ext.openActTranscriber({mediaId: d.media.id, filename: d.media.filename, title: d.media.title})},
        {key: 'vector', icon: '✒️', label: 'Dans le Dessin vectoriel', group: 'Dessin vectoriel', kinds: ['image', 'svg'], ready: () => !!ext.openVectorEditor,
            run: (k, d) => ext.openVectorEditor(k === 'svg' ? {svg: d.svg} : {imageSrc: mediaUrl(d.media)})},
        {key: 'batch', icon: '⚙️', label: 'Dans les Traitements par lot', group: 'Traitements par lot', kinds: ['images'], ready: () => !!ext.openBatch, run: (k, d) => ext.openBatch({items: d.medias.map(m => m.id)})},
    ];
    ext.sendTargets = TARGETS;
    const KIND_TITLE = {image: 'Envoyer l’image vers…', images: 'Envoyer les images vers…', text: 'Envoyer le texte vers…', rows: 'Envoyer le tableau vers…', audio: 'Envoyer le son vers…', video: 'Envoyer la vidéo vers…', svg: 'Envoyer le dessin vers…'};
    const STORE_MSG = {image: 'Rangement de l’image dans les médias…', audio: 'Rangement du son dans les médias…', video: 'Rangement de la vidéo dans les médias…'};

    /** les destinations possibles pour ce qu'on envoie (sans l'outil d'où l'on vient) */
    function targetsFor(kind, exclude = []) { return TARGETS.filter(t => t.kinds.includes(kind) && !exclude.includes(t.key) && !exclude.includes(t.group) && t.ready()); }

    async function sendTo(kind, payload = {}, opts = {}) {
        const {anchor = null, title = '', exclude = [], to = ''} = opts;
        const go = async t => {
            const d = {...payload};
            try {
                if (['image', 'audio', 'video'].includes(kind) && !d.media && d.blob) { A().toast(T(STORE_MSG[kind])); d.media = await store(d.blob, title || T('Image')); }
                if (['image', 'audio', 'video'].includes(kind) && !d.media) throw new Error(T('Rien à envoyer.'));
                if (kind === 'images' && !(d.medias || []).length) throw new Error(T('Rien à envoyer.'));
                return await t.run(kind, d, {anchor, title});
            } catch (e) { A().toast(e.message || String(e), 'error'); return null; }
        };
        const list = targetsFor(kind, exclude);
        if (to) { const t = TARGETS.find(x => x.key === to); return t ? go(t) : null; }
        if (!list.length) return A().toast(T('Aucun outil ne peut recevoir ça pour l’instant.'), 'error');
        const items = []; let last = '';
        list.forEach(t => { if (last && t.group !== last) items.push('-'); last = t.group; items.push({icon: t.icon, label: T(t.label), run: () => go(t)}); });
        if (window.LCNDA_UI?.menuAt) window.LCNDA_UI.menuAt(anchor || document.body, items, {title: T(KIND_TITLE[kind] || 'Envoyer vers…')});
        else go(list[0]);
        return null;
    }
    ext.sendTo = sendTo;
    ext.sendTargetsFor = targetsFor;
    // l'ancien nom (Retouche, Dessin vectoriel) : une image, vers le Montage ou le Studio par défaut — maintenant vers tous les outils qui reçoivent une image
    ext.sendImage = (blob, {title = 'Image', anchor = null, to = '', exclude = []} = {}) => sendTo('image', {blob}, {title, anchor, to, exclude});
    /** un bouton « 📤 Envoyer vers… » tout fait pour une barre d'outil : data-send-kind + une fonction qui donne les données */
    ext.sendButtonHtml = (attrs = '') => `<button type="button" class="button small secondary" data-send-to ${attrs}>📤 ${esc(T('Envoyer vers…'))}</button>`;
})();
