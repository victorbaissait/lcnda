/**
 * 🏛️ Musée de famille (serveur : lib/museum.php ; visite 3D : museum-viewer.js).
 * On y entre par la Pièce d'archives (porte « Musée ») : visite, aménagement des salles, partage et musées reçus.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = value => A().escapeHtml(value ?? '');
    const api = (...args) => A().api(...args);
    const toast = (...args) => A().toast(...args);
    const S = () => A().state;
    const KINDS = {photo: '🖼️ Photo', document: '📜 Document', artwork: '🎨 Œuvre', object: '🏺 Objet', text: '🔤 Texte au mur', decor: '🪴 Décor', seat: '🪑 Siège'};
    const WALLS = {back: 'Mur du fond', left: 'Mur de gauche', right: 'Mur de droite', front: 'Mur d’entrée', center: 'Au milieu de la salle'};
    const MODELS = {bench: 'Banc', chair: 'Chaise', sofa: 'Canapé', plant: 'Plante', column: 'Colonne', pedestal: 'Socle', rope: 'Cordon', rug: 'Tapis', lamp: 'Lampadaire', vase: 'Vase sur socle', piano: 'Piano', table: 'Table', screen: 'Paravent'};
    const SEATS = ['bench', 'chair', 'sofa'];
    let threePromise = null;
    const loadThree = () => (threePromise ??= import('../vendor/three.module.js'));

    async function postForm(action, fd) {
        fd.append('csrf', S().csrf);
        const r = await fetch('api.php?action=' + action, {method: 'POST', body: fd, headers: {'X-CSRF-Token': S().csrf}});
        const j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
        if (!r.ok || j.error) throw new Error(j.error || 'Erreur');
        return j;
    }
    const post = (action, body) => api(action, {}, {method: 'POST', body});

    /* ───────── Visite ───────── */

    let current = {id: 0, room: 0}, opening = false;
    async function openMuseum(id = current.id, room = 0) {
        if (opening) return;
        let data;
        opening = true;
        let THREE;
        try { data = (await api('museum', {id})).museum; THREE = await loadThree(); } catch (error) { return toast(error.message, 'error'); } finally { opening = false; }
        current = {id: data.id, room};
        document.getElementById('h-museum-dialog')?.close();
        const dlg = document.createElement('dialog');
        dlg.className = 'h-museum-dialog'; dlg.id = 'h-museum-dialog';
        dlg.innerHTML = '<div class="h-museum-stage" tabindex="0"></div>';
        document.body.appendChild(dlg);
        dlg.addEventListener('cancel', e => { if (dlg.querySelector('.lm-overlay:not([hidden])')) e.preventDefault(); });
        let viewer = null; // propre à cette fenêtre : en fermer une ancienne ne détruit jamais la nouvelle
        dlg.addEventListener('close', () => { viewer?.destroy(); viewer = null; dlg.remove(); });
        dlg.showModal();
        viewer = window.LCNDA_MUSEUM_VIEWER.mount(THREE, dlg.querySelector('.h-museum-stage'), data, {
            startRoom: room, canEdit: !document.body.classList.contains('is-kiosk'), // un musée reçu s'ouvre en lecture seule dans l'aménagement
            onRoom: i => { current.room = i; },
            onExit: () => { dlg.close(); A().openArchiveRoom?.(); },
            onEdit: i => { dlg.close(); openEditor(data.id, i); },
            onSign: async (name, message) => (await post('museum_sign', {museum_id: data.id, name, message})).result.guestbook,
        });
    }
    ext.openMuseum = openMuseum;

    /* ───────── Aménagement ───────── */

    async function openEditor(id = current.id, roomIndex = 0) {
        let data, museums;
        try { [data, museums] = await Promise.all([api('museum', {id}).then(r => r.museum), api('museums').then(r => r.museums)]); } catch (error) { return toast(error.message, 'error'); }
        current.id = data.id;
        const room = data.rooms[Math.max(0, Math.min(data.rooms.length - 1, roomIndex))];
        document.getElementById('h-museum-editor')?.remove();
        const dlg = document.createElement('dialog');
        dlg.className = 'modal h-modal h-modal-wide h-museum-editor'; dlg.id = 'h-museum-editor';
        const readOnly = Number(data.imported) === 1;
        const thumb = it => it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy">` : `<span>${esc((KINDS[it.kind] || '').split(' ')[0] || '•')}</span>`;
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">MUSÉE DE FAMILLE</span><h2>${readOnly ? 'Musée reçu : ' : 'Aménager : '}${esc(data.title)}</h2></div><button class="icon-button" type="button" data-me-close aria-label="Fermer">×</button></div>
            <div class="h-me-grid">
            <aside class="h-me-side">
                <section><h3>Le musée</h3>${readOnly ? `<p>${esc(data.subtitle || '')}</p><p class="muted">Reçu${data.author ? ' de ' + esc(data.author) : ''}. Un musée reçu se visite ; il ne se modifie pas.</p>` : `<form data-me-museum class="h-me-form">
                    <label>Nom<input name="title" value="${esc(data.title)}" maxlength="120"></label><label>Sous-titre<input name="subtitle" value="${esc(data.subtitle)}" maxlength="200"></label>
                    <label>Mot d’accueil<textarea name="intro" rows="3">${esc(data.intro)}</textarea></label><label>Conçu par<input name="author" value="${esc(data.author)}" maxlength="120" placeholder="Ton nom (affiché dans le catalogue et quand tu partages)"></label>
                    <label class="checkbox-line"><input type="checkbox" name="guestbook" ${data.settings.guestbook === false ? '' : 'checked'}> Livre d’or à l’entrée</label><button class="button small" type="submit">Enregistrer</button></form>`}</section>
                <section><h3>Les salles</h3><ol class="h-me-rooms">${data.rooms.map((r, i) => `<li class="${r.id === room?.id ? 'is-active' : ''}"><button type="button" class="link-button" data-me-room="${i}">${esc(r.name)}</button> <small>${r.items.length}</small>${readOnly ? '' : `<span><button type="button" class="icon-button" data-me-room-up="${i}" title="Monter" ${i ? '' : 'disabled'}>↑</button><button type="button" class="icon-button" data-me-room-down="${i}" title="Descendre" ${i < data.rooms.length - 1 ? '' : 'disabled'}>↓</button></span>`}</li>`).join('')}</ol>
                    ${readOnly ? '' : '<button type="button" class="button small secondary" data-me-room-add>+ Nouvelle salle</button>'}</section>
                <section><h3>Partager</h3><p class="muted">Un <b>site web</b> s’ouvre d’un double-clic sur n’importe quel ordinateur (ou se met en ligne) ; un <b>fichier LCNDA</b> s’importe dans LCNDA par un proche.</p>
                    <div class="h-me-buttons"><a class="button small secondary" href="api.php?action=museum_export&id=${data.id}&format=site" download>🌐 Site web (.zip)</a><a class="button small secondary" href="api.php?action=museum_export&id=${data.id}&format=lcnda" download>📦 Fichier LCNDA</a><button type="button" class="button small secondary" data-me-print>🗂 Catalogue</button></div></section>
                <section><h3>Musées</h3><ul class="h-me-museums">${museums.map(m => `<li class="${Number(m.id) === data.id ? 'is-active' : ''}"><button type="button" class="link-button" data-me-museum-open="${m.id}">${esc(m.title)}</button><small>${Number(m.imported) ? 'reçu' + (m.author ? ' de ' + esc(m.author) : '') : 'le mien'} · ${m.rooms} salle(s)</small>${Number(m.imported) ? `<button type="button" class="icon-button danger" data-me-museum-del="${m.id}" title="Supprimer ce musée reçu">🗑</button>` : ''}</li>`).join('')}</ul>
                    <button type="button" class="button small secondary" data-me-import>Importer un musée reçu…</button></section>
                ${data.guestbook.length ? `<section><h3>Livre d’or</h3><ul class="h-me-book">${data.guestbook.map(g => `<li><p>${esc(g.message)}</p><small>${esc(g.name)} · ${esc(g.date)}</small>${readOnly ? '' : `<button type="button" class="icon-button danger" data-me-book-del="${g.id}" title="Effacer ce message">🗑</button>`}</li>`).join('')}</ul></section>` : ''}
            </aside>
            <section class="h-me-main">${room ? `
                ${readOnly ? `<h3>${esc(room.name)}</h3>${room.intro ? `<p>${esc(room.intro)}</p>` : ''}` : `<form data-me-roomform class="h-me-form h-me-roomform"><label class="span-2">Nom de la salle<input name="name" value="${esc(room.name)}" maxlength="120"></label>
                    <label class="span-2">Texte d’accueil de la salle <small>(lu au début de la visite guidée)</small><textarea name="intro" rows="2">${esc(room.intro)}</textarea></label>
                    <label>Taille<select name="size">${[['small', 'Petite'], ['medium', 'Moyenne'], ['large', 'Grande']].map(([v, l]) => `<option value="${v}" ${(room.settings.size || 'medium') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                    <label>Sol<select name="floor">${[['light', 'Clair'], ['wood', 'Parquet'], ['stone', 'Pierre'], ['dark', 'Sombre']].map(([v, l]) => `<option value="${v}" ${(room.settings.floor || 'light') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                    <label>Couleur des murs<input type="color" name="wall" value="${esc(room.settings.wall || '#ffffff')}"></label>
                    <div class="h-me-audio">${audioField('room', room)}</div>
                    <div class="span-2 h-me-buttons"><button class="button small" type="submit">Enregistrer la salle</button><button class="button small secondary danger" type="button" data-me-room-del>Supprimer la salle</button></div></form>`}
                <section class="h-me-plan"><div class="h-me-plan-head"><h3>Plan de la salle</h3><small class="muted">${readOnly ? 'Vu de dessus.' : 'Vu de dessus : glisse chaque élément où tu veux. Contre un mur, il y est accroché ; au milieu, il est posé au sol. Clique sur un élément pour régler sa hauteur, sa taille, son orientation.'}</small></div>
                    <div class="h-me-plan-wrap"><svg data-me-plan aria-label="Plan de la salle"></svg><aside class="h-me-plan-side" data-me-plan-side><p class="muted">Clique sur un élément du plan.</p></aside></div></section>
                <div class="h-me-items-head"><h3>Dans cette salle</h3>${readOnly ? '' : `<div class="h-me-buttons"><button type="button" class="button small" data-me-add="media">+ Photo ou document de la base</button><button type="button" class="button small secondary" data-me-add="object">+ Objet de famille</button><button type="button" class="button small secondary" data-me-add="upload">+ Image de l’ordinateur</button><button type="button" class="button small secondary" data-me-add="text">+ Texte au mur</button><button type="button" class="button small secondary" data-me-add="decor">+ Décor ou siège</button></div>`}</div>
                ${room.items.length ? `<ol class="h-me-items">${room.items.map((it, k) => `<li><span class="h-me-thumb">${thumb(it)}<b class="h-me-n">${k + 1}</b></span><div><strong>${esc(it.title || it.source_title || MODELS[it.settings?.model] || 'Sans titre')}</strong><small>${esc(KINDS[it.kind] || it.kind)} · ${esc(WALLS[it.wall] || '')}${Number(it.in_tour) && !['decor', 'seat'].includes(it.kind) ? ' · visite guidée' : ''}${it.audio ? ' · 🎧' : ''}</small></div>
                    ${readOnly ? '' : `<span class="h-me-item-actions"><button type="button" class="icon-button" data-me-up="${k}" title="Avant" ${k ? '' : 'disabled'}>↑</button><button type="button" class="icon-button" data-me-down="${k}" title="Après" ${k < room.items.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="icon-button" data-me-edit="${k}" title="Modifier">✎</button><button type="button" class="icon-button danger" data-me-del="${k}" title="Retirer du musée (la photo reste dans la base)">🗑</button></span>`}</li>`).join('')}</ol>
                    <p class="muted">L’ordre de la liste est l’ordre de la visite guidée et, mur par mur, l’ordre d’accrochage de gauche à droite.</p>` : '<p class="muted">Salle vide : ajoute des photos, des objets, des textes…</p>'}` : '<p>Aucune salle.</p>'}
            </section></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-me-close>Fermer</button><button type="button" class="button" data-me-visit>🏛️ Visiter${room ? ' cette salle' : ''}</button></div>`;
        document.body.appendChild(dlg);
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal();
        const again = (ri = data.rooms.indexOf(room)) => { dlg.close(); openEditor(data.id, Math.max(0, ri)); };
        const guard = fn => async (...args) => { try { await fn(...args); } catch (error) { toast(error.message, 'error'); } };
        dlg.querySelectorAll('[data-me-close]').forEach(b => b.addEventListener('click', () => dlg.close()));
        if (room) mountPlan(dlg, room, readOnly, () => again(), {first: data.rooms.indexOf(room) === 0, last: data.rooms.indexOf(room) === data.rooms.length - 1});
        dlg.querySelector('[data-me-visit]').addEventListener('click', () => { dlg.close(); openMuseum(data.id, Math.max(0, data.rooms.indexOf(room))); });
        dlg.querySelector('[data-me-print]').addEventListener('click', () => { dlg.close(); openMuseum(data.id, 0).then(() => document.querySelector('#h-museum-dialog [data-lm-catalog]')?.click()); });
        dlg.querySelectorAll('[data-me-room]').forEach(b => b.addEventListener('click', () => again(Number(b.dataset.meRoom))));
        dlg.querySelectorAll('[data-me-museum-open]').forEach(b => b.addEventListener('click', () => { dlg.close(); openEditor(Number(b.dataset.meMuseumOpen), 0); }));
        dlg.querySelectorAll('[data-me-museum-del]').forEach(b => b.addEventListener('click', guard(async () => { if (!confirm('Supprimer ce musée reçu ?')) return; await post('delete_museum', {id: b.dataset.meMuseumDel}); toast('Musée supprimé.'); dlg.close(); openEditor(0, 0); })));
        dlg.querySelector('[data-me-import]').addEventListener('click', () => {
            const input = Object.assign(document.createElement('input'), {type: 'file', accept: '.zip,application/zip'});
            input.addEventListener('change', guard(async () => { if (!input.files[0]) return; const fd = new FormData(); fd.append('file', input.files[0]); toast('Import du musée…'); const r = await postForm('museum_import', fd); toast('Musée importé : il est dans « Musées ».'); dlg.close(); openEditor(r.id, 0); }));
            input.click();
        });
        dlg.querySelectorAll('[data-me-book-del]').forEach(b => b.addEventListener('click', guard(async () => { if (!confirm('Effacer ce message du livre d’or ?')) return; await post('delete_museum_guestbook', {id: b.dataset.meBookDel}); again(); })));
        if (readOnly) return;
        dlg.querySelector('[data-me-museum]')?.addEventListener('submit', guard(async e => {
            e.preventDefault(); const f = e.target;
            await post('save_museum', {id: data.id, title: f.title.value, subtitle: f.subtitle.value, intro: f.intro.value, author: f.author.value, settings: {guestbook: f.guestbook.checked}});
            toast('Musée enregistré.'); again();
        }));
        dlg.querySelector('[data-me-room-add]').addEventListener('click', guard(async () => { await post('save_museum_room', {museum_id: data.id, name: `Salle ${data.rooms.length + 1}`, settings: {size: 'medium', floor: 'light', wall: '#ffffff'}}); again(data.rooms.length); }));
        const reorder = async (what, list, from, to) => { const ids = list.map(x => x.id); const [m] = ids.splice(from, 1); ids.splice(to, 0, m); await post('museum_reorder', {what, ids}); };
        dlg.querySelectorAll('[data-me-room-up],[data-me-room-down]').forEach(b => b.addEventListener('click', guard(async () => { const i = Number(b.dataset.meRoomUp ?? b.dataset.meRoomDown), to = b.dataset.meRoomUp !== undefined ? i - 1 : i + 1; const ids = data.rooms.map(r => r.id); const [mv] = ids.splice(i, 1); ids.splice(to, 0, mv); await post('museum_reorder', {what: 'rooms', ids}); again(ids.indexOf(room?.id)); })));
        if (!room) return;
        const rf = dlg.querySelector('[data-me-roomform]');
        rf.addEventListener('submit', guard(async e => { e.preventDefault(); await post('save_museum_room', {id: room.id, name: rf.name.value, intro: rf.intro.value, settings: {size: rf.size.value, floor: rf.floor.value, wall: rf.wall.value}}); toast('Salle enregistrée.'); again(); }));
        dlg.querySelector('[data-me-room-del]').addEventListener('click', guard(async () => { if (!confirm(`Supprimer la salle « ${room.name} » et tout ce qui y est exposé ? (les photos restent dans la base)`)) return; await post('delete_museum_room', {id: room.id}); again(0); }));
        bindAudio(rf, 'room', room, () => again());
        dlg.querySelectorAll('[data-me-up],[data-me-down]').forEach(b => b.addEventListener('click', guard(async () => { const k = Number(b.dataset.meUp ?? b.dataset.meDown); await reorder('items', room.items, k, b.dataset.meUp !== undefined ? k - 1 : k + 1); again(); })));
        dlg.querySelectorAll('[data-me-del]').forEach(b => b.addEventListener('click', guard(async () => { const it = room.items[Number(b.dataset.meDel)]; if (!confirm(`Retirer « ${it.title || 'cet élément'} » du musée ?`)) return; await post('delete_museum_item', {id: it.id}); again(); })));
        dlg.querySelectorAll('[data-me-edit]').forEach(b => b.addEventListener('click', () => itemDialog(room, room.items[Number(b.dataset.meEdit)], () => again())));
        dlg.querySelectorAll('[data-me-add]').forEach(b => b.addEventListener('click', () => {
            const what = b.dataset.meAdd;
            if (what === 'media' || what === 'object') return pickDialog(what, room, () => again());
            if (what === 'text') return itemDialog(room, {kind: 'text', wall: 'back', title: '', description: '', in_tour: 1, settings: {}}, () => again());
            if (what === 'decor') return itemDialog(room, {kind: 'decor', wall: 'center', title: '', in_tour: 0, settings: {model: 'bench'}}, () => again());
            if (what === 'upload') return itemDialog(room, {kind: 'photo', wall: 'back', title: '', in_tour: 1, settings: {}, _upload: true}, () => again());
        }));
    }
    ext.openMuseumEditor = openEditor;

    /* ───────── Plan de la salle (vu de dessus, comme un plan d'architecte) ───────── */

    const FOOT = {bench: [1.8, 0.45], chair: [0.5, 0.5], sofa: [2, 0.85], plant: [0.6, 0.6, 'c'], column: [0.56, 0.56, 'c'], pedestal: [0.6, 0.6], rope: [2.1, 0.12], rug: [3, 2],
        lamp: [0.4, 0.4, 'c'], vase: [0.5, 0.5], piano: [1.5, 1.6], table: [1.6, 0.9], screen: [2.4, 0.3], vitrine: [0.8, 0.8]};
    const ICON = {photo: '🖼️', document: '📜', artwork: '🎨', object: '🏺', text: '🔤', decor: '🪴', seat: '🪑'};
    function mountPlan(dlg, room, readOnly, reopen, pos = {}) {
        const V = window.LCNDA_MUSEUM_VIEWER, svg = dlg.querySelector('[data-me-plan]'), side = dlg.querySelector('[data-me-plan-side]');
        if (!V || !svg) return;
        let selected = null, drag = null;
        const num = v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v));
        const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
        const canHang = it => !['decor', 'seat'].includes(it.kind);
        const toWorld = (wall, along, W, D) => wall === 'back' ? [along, -D / 2] : wall === 'front' ? [-along, D / 2] : wall === 'left' ? [-W / 2, along] : [W / 2, -along];
        const draw = () => {
            const {W, D, spots} = V.layoutRoom(room);
            svg.setAttribute('viewBox', `${-W / 2 - 1} ${-D / 2 - 1} ${W + 2} ${D + 2}`);
            let h = `<rect x="${-W / 2}" y="${-D / 2}" width="${W}" height="${D}" class="pl-room"/>`;
            for (let x = Math.ceil(-W / 2); x < W / 2; x++) h += `<line x1="${x}" y1="${-D / 2}" x2="${x}" y2="${D / 2}" class="pl-grid"/>`;
            for (let z = Math.ceil(-D / 2); z < D / 2; z++) h += `<line x1="${-W / 2}" y1="${z}" x2="${W / 2}" y2="${z}" class="pl-grid"/>`;
            h += `<text x="0" y="${-D / 2 - 0.35}" class="pl-wall">Mur du fond</text><text x="0" y="${D / 2 + 0.65}" class="pl-wall">Mur d’entrée</text>`;
            h += `<text x="${-W / 2 - 0.35}" y="0" class="pl-wall" transform="rotate(-90 ${-W / 2 - 0.35} 0)">Mur de gauche</text><text x="${W / 2 + 0.35}" y="0" class="pl-wall" transform="rotate(90 ${W / 2 + 0.35} 0)">Mur de droite</text>`;
            // Les mêmes portes que dans la visite : vers la salle précédente (ou la sortie), vers la suivante
            const doors = [];
            doors.push([W / 2 - 1.3, pos.first ? 'sortie' : 'salle précédente']);
            if (!pos.last) doors.push([-(W / 2 - 1.3), 'salle suivante']);
            doors.forEach(([x, t]) => { h += `<rect x="${x - 0.63}" y="${D / 2 - 0.08}" width="1.26" height="0.16" class="pl-door"/><text x="${x}" y="${D / 2 - 0.3}" class="pl-small">${t}</text>`; });
            h += `<text x="0" y="${D / 2 - 0.5}" class="pl-small">▲ on entre ici</text>`;
            (room.items || []).forEach((it, k) => {
                const sp = spots.get(it); if (!sp) return;
                const sel = selected === it ? ' is-sel' : '', label = esc(it.title || it.source_title || MODELS[it.settings?.model] || '');
                if (sp.center) {
                    const m = it.kind === 'decor' || it.kind === 'seat' ? (it.settings?.model || (it.kind === 'seat' ? 'bench' : 'plant')) : it.kind === 'object' ? 'vitrine' : 'easel';
                    const [fw, fd, round] = FOOT[m] || [1, 0.5];
                    const shape = round ? `<circle r="${fw / 2}" class="pl-item${sel}"/>` : `<rect x="${-fw / 2}" y="${-fd / 2}" width="${fw}" height="${fd}" class="pl-item${sel}"/>`;
                    h += `<g class="pl-g" data-pl="${k}" transform="translate(${sp.x} ${sp.z}) rotate(${-(sp.rot || 0) * 180 / Math.PI})"><title>${label}</title>${shape}<path d="M -0.12 ${fd / 2 + 0.05} L 0.12 ${fd / 2 + 0.05} L 0 ${fd / 2 + 0.22} Z" class="pl-front"/><text y="0.12" class="pl-num">${k + 1}</text></g>`;
                } else {
                    const [x, z] = toWorld(sp.wall, sp.along, W, D), w = Math.min(sp.slot * 0.7, 1.35 * (Number(it.settings?.scale) || 1));
                    const horiz = sp.wall === 'back' || sp.wall === 'front', ins = sp.wall === 'back' || sp.wall === 'left' ? 0.12 : -0.12;
                    const rx = horiz ? x - w / 2 : x + (sp.wall === 'left' ? 0 : -0.24), rz = horiz ? z + (sp.wall === 'back' ? 0 : -0.24) : z - w / 2;
                    h += `<g class="pl-g" data-pl="${k}"><title>${label}</title><rect x="${rx}" y="${rz}" width="${horiz ? w : 0.24}" height="${horiz ? 0.24 : w}" class="pl-hang${sel}"/><text x="${horiz ? x : x + ins * 3}" y="${horiz ? z + ins * 3 + 0.12 : z + 0.12}" class="pl-num">${k + 1}</text></g>`;
                }
            });
            svg.innerHTML = h;
        };
        const sideHtml = () => {
            const it = selected; if (!it) { side.innerHTML = '<p class="muted">Clique sur un élément du plan.</p>'; return; }
            const {spots} = V.layoutRoom(room), sp = spots.get(it), st = it.settings || {};
            side.innerHTML = `<p><strong>${ICON[it.kind] || ''} ${esc(it.title || it.source_title || MODELS[st.model] || 'Sans titre')}</strong><br><small class="muted">${sp?.center ? 'Au milieu de la salle' : esc(WALLS[it.wall] || '')}</small></p>
                ${readOnly ? '' : `${sp?.center ? `<label>Orientation <output>${Math.round((sp.rot || 0) * 180 / Math.PI)}°</output><input type="range" min="-180" max="180" step="15" value="${Math.round((sp.rot || 0) * 180 / Math.PI)}" data-pl-set="rot"></label>`
                    : `<label>Hauteur au mur <output>${(sp?.y ?? 1.6).toFixed(2)} m</output><input type="range" min="0.8" max="2.8" step="0.05" value="${sp?.y ?? (it.kind === 'text' ? 1.9 : 1.6)}" data-pl-set="y"></label>`}
                ${['decor', 'seat'].includes(it.kind) ? '' : `<label>Taille <output>× ${Number(st.scale || 1).toFixed(1)}</output><input type="range" min="0.5" max="2.5" step="0.1" value="${st.scale || 1}" data-pl-set="scale"></label>`}
                <div class="h-me-buttons"><button type="button" class="button small secondary" data-pl-edit>✎ Cartel, audio…</button><button type="button" class="button small secondary" data-pl-auto title="L’app le place toute seule">↺ Placement auto</button></div>`}`;
            side.querySelectorAll('[data-pl-set]').forEach(inp => {
                inp.addEventListener('input', () => { const k = inp.dataset.plSet; it.settings = {...(it.settings || {}), [k]: Number(inp.value)}; inp.previousElementSibling.textContent = k === 'rot' ? inp.value + '°' : k === 'y' ? Number(inp.value).toFixed(2) + ' m' : '× ' + Number(inp.value).toFixed(1); draw(); });
                inp.addEventListener('change', () => save(it));
            });
            side.querySelector('[data-pl-edit]')?.addEventListener('click', () => itemDialog(room, it, reopen));
            side.querySelector('[data-pl-auto]')?.addEventListener('click', () => { const s2 = {...(it.settings || {})}; ['along', 'y', 'px', 'pz', 'rot'].forEach(k => delete s2[k]); it.settings = s2; draw(); sideHtml(); save(it); });
        };
        const save = async it => {
            try { await post('save_museum_item', {...itemPayload(it), room_id: room.id}); dlg.querySelector(`.h-me-items li:nth-child(${room.items.indexOf(it) + 1}) small`)?.replaceChildren(document.createTextNode(`${KINDS[it.kind] || it.kind} · ${WALLS[it.wall] || ''}`)); }
            catch (error) { toast(error.message, 'error'); }
        };
        const point = e => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const p2 = pt.matrixTransform(svg.getScreenCTM().inverse()); return [p2.x, p2.y]; };
        svg.addEventListener('pointerdown', e => {
            const g = e.target.closest('[data-pl]'); if (!g) { selected = null; draw(); sideHtml(); return; }
            selected = room.items[Number(g.dataset.pl)]; draw(); sideHtml();
            if (readOnly) return;
            drag = {it: selected, moved: false}; svg.setPointerCapture(e.pointerId); e.preventDefault();
        });
        svg.addEventListener('pointermove', e => {
            if (!drag) return;
            const {W, D} = V.layoutRoom(room), [x, z] = point(e), it = drag.it, st = {...(it.settings || {})};
            const dist = {back: z + D / 2, front: D / 2 - z, left: x + W / 2, right: W / 2 - x};
            const wall = Object.entries(dist).sort((a, b) => a[1] - b[1])[0];
            if (canHang(it) && wall[1] < 0.9) {
                it.wall = wall[0];
                const coord = wall[0] === 'back' || wall[0] === 'front' ? x : z;
                st.along = Math.round(clamp(coord / Math.max(0.01, V.wallLimit(wall[0], W, D, V.halfWidth(it))), -1, 1) * 1000) / 1000; delete st.px; delete st.pz; delete st.rot;
            } else {
                it.wall = 'center';
                st.px = Math.round(clamp(x / (W / 2 - 1), -1, 1) * 1000) / 1000; st.pz = Math.round(clamp(z / (D / 2 - 1), -1, 1) * 1000) / 1000; delete st.along; delete st.y;
            }
            it.settings = st; drag.moved = true; draw();
        });
        const end = () => { if (!drag) return; const d = drag; drag = null; if (d.moved) { sideHtml(); save(d.it); } };
        svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
        draw();
    }

    function audioField(kind, rec) {
        return `<span class="section-label">🎧 Commentaire audio ${kind === 'room' ? 'de la salle' : ''}</span>${rec.audio ? `<audio controls src="${esc(rec.audio)}"></audio><button type="button" class="link-button" data-me-audio-del>Retirer le son</button>` : '<small class="muted">Aucun : la visite guidée lira le texte avec la voix de l’ordinateur.</small>'}
            <span class="h-me-buttons"><button type="button" class="button small secondary" data-me-audio-file>Choisir un fichier son…</button><button type="button" class="button small secondary" data-me-audio-rec>🎙 Enregistrer</button></span>`;
    }
    /** Son d'une salle ou d'une œuvre : fichier de l'ordinateur ou enregistrement au micro. */
    function bindAudio(box, kind, rec, done) {
        const target = kind === 'room' ? 'room_audio' : 'item_audio';
        const send = async blob => { const fd = new FormData(); fd.append('file', blob, blob.name || 'enregistrement.webm'); fd.append('target', target); fd.append('id', rec.id); await postForm('museum_upload', fd); toast('Son ajouté.'); done(); };
        box.querySelector('[data-me-audio-file]')?.addEventListener('click', () => {
            const input = Object.assign(document.createElement('input'), {type: 'file', accept: 'audio/*,.mp3,.m4a,.wav,.ogg'});
            input.addEventListener('change', async () => { try { if (input.files[0]) await send(input.files[0]); } catch (error) { toast(error.message, 'error'); } });
            input.click();
        });
        box.querySelector('[data-me-audio-del]')?.addEventListener('click', async () => {
            try { if (kind === 'room') await post('save_museum_room', {id: rec.id, name: rec.name, intro: rec.intro, settings: rec.settings, audio_file: ''}); else await post('save_museum_item', {...itemPayload(rec), audio_file: ''}); toast('Son retiré.'); done(); }
            catch (error) { toast(error.message, 'error'); }
        });
        const recBtn = box.querySelector('[data-me-audio-rec]');
        let recorder = null, chunks = [];
        recBtn?.addEventListener('click', async () => {
            if (recorder) { recorder.stop(); return; }
            if (!rec.id) return toast('Enregistre d’abord l’élément, puis ajoute le son.', 'error');
            try {
                const stream = await navigator.mediaDevices.getUserMedia({audio: true});
                recorder = new MediaRecorder(stream); chunks = [];
                recorder.ondataavailable = e => chunks.push(e.data);
                recorder.onstop = async () => { stream.getTracks().forEach(t => t.stop()); recBtn.textContent = '🎙 Enregistrer'; const blob = new Blob(chunks, {type: recorder.mimeType || 'audio/webm'}); recorder = null; try { await send(blob); } catch (error) { toast(error.message, 'error'); } };
                recorder.start(); recBtn.textContent = '⏹ Arrêter l’enregistrement';
            } catch (_) { toast('Micro indisponible (autorise-le dans les réglages de l’ordinateur).', 'error'); }
        });
    }
    const itemPayload = it => ({id: it.id, room_id: it.room_id, kind: it.kind, wall: it.wall, media_id: it.media_id, object_id: it.object_id, person_id: it.person_id, file: it.file, title: it.title, cartel: it.cartel, description: it.description, in_tour: it.in_tour, settings: it.settings});

    /** Choisir une photo de la base ou un objet de famille. */
    function pickDialog(what, room, done) {
        const d = ext.openDialog({eyebrow: 'MUSÉE', title: what === 'object' ? 'Choisir un objet de famille' : 'Choisir des photos ou documents', wide: true, submitLabel: 'Ajouter à la salle',
            body: `<input type="search" data-me-q placeholder="${what === 'object' ? 'Nom de l’objet…' : 'Titre, date, nom d’une personne…'}" class="h-me-search"><div class="h-me-pick" data-me-results><p class="muted">Recherche…</p></div><p class="muted">Clique pour choisir (plusieurs possibles). Chaque élément pourra ensuite recevoir son cartel et son audio (✎).</p>`,
            onSubmit: async () => {
                const chosen = [...d.querySelectorAll('[data-me-pick].is-chosen')];
                if (!chosen.length) { toast('Choisis au moins un élément.', 'error'); return false; }
                for (const el of chosen) {
                    const r = JSON.parse(el.dataset.mePick);
                    const cartel = what === 'object' ? [r.kind].filter(Boolean).join('\n') : [r.date_text, r.person_name, r.document_reference].filter(Boolean).join('\n');
                    await post('save_museum_item', what === 'object'
                        ? {room_id: room.id, kind: 'object', wall: 'center', object_id: r.id, title: r.title, cartel, description: r.description || '', in_tour: 1}
                        : {room_id: room.id, kind: /acte|registre|lettre|document|carte/i.test(r.title || '') ? 'document' : 'photo', wall: 'back', media_id: r.id, person_id: r.person_id || null, title: r.title || '', cartel, description: r.description || '', in_tour: 1});
                    el.classList.remove('is-chosen'); el.disabled = true; el.title = 'Déjà ajouté'; // en cas d'erreur plus loin, pas de doublon au nouvel essai
                }
                toast(`${chosen.length} élément(s) ajouté(s).`); done();
            }});
        const out = d.querySelector('[data-me-results]');
        const search = async () => {
            const q = d.querySelector('[data-me-q]').value.trim();
            try {
                const items = (await api('museum_pick', {what: what === 'object' ? 'objects' : 'media', q})).items;
                out.innerHTML = items.length ? items.map(r => `<button type="button" class="h-me-pick-item" data-me-pick="${esc(JSON.stringify({id: r.id, title: r.title, kind: r.kind, description: r.description, date_text: r.date_text, person_name: r.person_name, person_id: r.person_id, document_reference: r.document_reference}))}">${r.url ? `<img src="${esc(r.url)}" alt="" loading="lazy">` : '<span>🏺</span>'}<small>${esc(r.title || 'Sans titre')}${r.date_text ? ' · ' + esc(r.date_text) : ''}${r.person_name ? '<br>' + esc(r.person_name) : ''}</small></button>`).join('') : `<p class="muted">${what === 'object' ? 'Aucun objet de famille (Listes → Objets de famille).' : 'Aucune image trouvée.'}</p>`;
                out.querySelectorAll('[data-me-pick]').forEach(b => b.addEventListener('click', () => b.classList.toggle('is-chosen')));
            } catch (error) { out.textContent = error.message; }
        };
        let t = 0; d.querySelector('[data-me-q]').addEventListener('input', () => { clearTimeout(t); t = setTimeout(search, 250); });
        search();
    }

    /** Modifier un élément exposé : titre, cartel, description, place, taille, audio, visite guidée. */
    function itemDialog(room, it, done) {
        const isDecor = ['decor', 'seat'].includes(it.kind), isNew = !it.id;
        const st = it.settings || {};
        const d = ext.openDialog({eyebrow: 'MUSÉE · ' + (room.name || ''), title: isNew ? (isDecor ? 'Ajouter du décor' : it.kind === 'text' ? 'Texte au mur' : 'Ajouter une image') : 'Modifier', wide: true,
            body: `<div class="form-grid">
                ${isDecor ? `<label>Élément<select name="model">${Object.entries(MODELS).map(([k, l]) => `<option value="${k}" ${st.model === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><span></span>` : `<label>Sorte<select name="kind">${Object.entries(KINDS).filter(([k]) => !['decor', 'seat'].includes(k)).map(([k, l]) => `<option value="${k}" ${it.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label>Où<select name="wall">${Object.entries(WALLS).map(([k, l]) => `<option value="${k}" ${it.wall === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`}
                <label class="span-2">${it.kind === 'text' ? 'Titre (en grand)' : 'Titre'}<input name="title" value="${esc(it.title || '')}" maxlength="200"></label>
                ${it.kind === 'text' ? '' : `<label class="span-2">Cartel <small>(une ligne par information : date, auteur, technique, dimensions, prêt de…)</small><textarea name="cartel" rows="3">${esc(it.cartel || '')}</textarea></label>`}
                <label class="span-2">${it.kind === 'text' ? 'Texte' : 'Description, histoire'}<textarea name="description" rows="${it.kind === 'text' ? 5 : 4}">${esc(it.description || '')}</textarea></label>
                ${isDecor ? '' : `<label>Taille <small>(1 = normale)</small><input type="range" name="scale" min="0.5" max="2.5" step="0.1" value="${esc(st.scale ?? 1)}"></label><label class="checkbox-line"><input type="checkbox" name="in_tour" ${Number(it.in_tour ?? 1) ? 'checked' : ''}> Dans la visite guidée</label>`}
                <fieldset class="span-2 h-me-place"><legend>Place au milieu de la salle <small>(laisser « auto » pour un placement automatique)</small></legend><label class="checkbox-line"><input type="checkbox" name="auto" ${st.px === undefined || st.px === null ? 'checked' : ''}> auto</label>
                    <label>Gauche ↔ droite<input type="range" name="px" min="-1" max="1" step="0.05" value="${esc(st.px ?? 0)}"></label><label>Fond ↔ entrée<input type="range" name="pz" min="-1" max="1" step="0.05" value="${esc(st.pz ?? 0)}"></label></fieldset>
                ${it._upload || (!isDecor && it.kind !== 'text' && it.file) ? `<label class="span-2">Image depuis l’ordinateur<input type="file" name="image" accept="image/*"></label>` : ''}
                ${isNew || isDecor || it.kind === 'text' ? '' : `<div class="span-2 h-me-audio">${audioField('item', it)}</div>`}
                ${isNew && !isDecor ? '<p class="span-2 muted">Le commentaire audio s’ajoute une fois l’élément enregistré (✎).</p>' : ''}</div>`,
            onSubmit: async form => {
                const f = form.elements, auto = f.auto?.checked;
                const settings = {...st, scale: f.scale ? Number(f.scale.value) : st.scale, px: auto ? null : Number(f.px.value), pz: auto ? null : Number(f.pz.value)};
                if (isDecor) settings.model = f.model.value;
                const kind = isDecor ? (SEATS.includes(f.model.value) ? 'seat' : 'decor') : f.kind.value;
                const file = f.image?.files?.[0];
                if (it._upload && !file && isNew) { toast('Choisis une image.', 'error'); return false; }
                const saved = await post('save_museum_item', {...itemPayload(it), id: it.id, room_id: room.id, kind, wall: isDecor ? 'center' : f.wall.value, title: f.title.value, cartel: f.cartel?.value || '', description: f.description.value, in_tour: f.in_tour ? (f.in_tour.checked ? 1 : 0) : 0, settings});
                it.id = saved.result.id; it.room_id = room.id; // si l'envoi de l'image échoue, un nouvel essai modifie cet élément au lieu d'en créer un autre
                if (file) { const fd = new FormData(); fd.append('file', file); fd.append('target', 'item_image'); fd.append('id', saved.result.id); await postForm('museum_upload', fd); }
                toast('Enregistré.'); done();
            }});
        const toggle = () => { const wall = d.querySelector('[name=wall]')?.value; d.querySelector('.h-me-place').hidden = !(isDecor || wall === 'center'); d.querySelectorAll('.h-me-place input[type=range]').forEach(r => { r.disabled = d.querySelector('[name=auto]').checked; }); };
        d.querySelector('[name=wall]')?.addEventListener('change', toggle); d.querySelector('[name=auto]').addEventListener('change', toggle); toggle();
        if (!isNew) bindAudio(d, 'item', it, () => { d.close(); done(); });
    }

    // La porte « Musée » de la pièce d'archives (version sans 3D) ouvre la visite
    document.addEventListener('click', e => { if (e.target.closest('[data-room-museum]')) { document.getElementById('archive-room-dialog')?.close(); openMuseum(0, 0); } });
})();
