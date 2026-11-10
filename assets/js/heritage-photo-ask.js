/**
 * 🔍 « Qui est sur cette photo ? » à plusieurs — serveur : lib/photo_ask.php (structure n°84).
 * Depuis une photo (visionneuse : « 📤 Demander qui c'est »), plusieurs photos, ou 👤 Visages (« 📤 Demander à la famille »
 * sur des inconnus) : on choisit les visages (repérés par la reconnaissance des visages, ou tracés à la main) et les noms à
 * proposer, puis « ⤓ Télécharger le fichier » : un .html autonome que le cousin ouvre chez lui, sans l'app ni Internet.
 * Ses réponses (« reponses-visages.json ») reviennent par « ⤒ Importer les réponses » (K13) : une proposition par visage,
 * « c'est la même personne ? » par le menu de choix, accepter / refuser / plus tard, accord ou désaccord entre cousins, ↶ Annuler.
 * La liste des demandes est dans Listes → 💬 Questions aux proches (section « 🔍 Qui est sur cette photo ? »).
 * Chargé après app.js, heritage.js (openDialog), app-picker.js, app-media-picker.js, heritage-faces.js, heritage-questions.js.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const P = () => window.LCNDA_PICKER;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const write = (op, body = {}) => api('pa_write', {}, {method: 'POST', body: {op, ...body}});
    const toast = (...a) => A().toast(...a);
    const plural = (n, one, many) => (A().plural ? A().plural(n, one, many) : `${n} ${n > 1 ? (many || one + 's') : one}`);
    const mediaUrl = f => `media/${encodeURIComponent(f)}`;
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const STATUS = {prepared: ['Préparé', 'yellow'], sent: ['Envoyé', 'blue'], answered: ['Répondu', 'green']};
    const DEFAULT_INTRO = 'Je fais l’histoire de notre famille. Sur ces photos, il y a des visages que je ne sais pas nommer : peut-être que toi, tu les reconnais ?';

    function download(name, text, type) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], {type}));
        a.download = name; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    }

    /* ═════════════════════════════ Préparer une demande ═════════════════════════════ */
    /** open({media_ids, prints, id}) : prints = numéros de visages repérés à cocher d'office (sinon : tous ceux sans nom) */
    async function open(o = {}) {
        if (kiosk()) { toast('En mode consultation, on ne prépare pas de demande.', 'error'); return; }
        let ed = {id: 0, title: 'Qui est sur cette photo ?', intro: DEFAULT_INTRO, media: (o.media_ids || []).map(Number).filter(Boolean).slice(0, 12), faces: [], names: null, living: false};
        if (o.id) {
            try { const a = (await api('pa_get', {id: o.id})).ask; ed = {id: a.id, title: a.title, intro: a.intro, media: a.media_ids, faces: a.faces, names: a.names.map(n => n.person_id), living: a.include_living, status: a.status}; }
            catch (e) { toast(e.message, 'error'); return; }
        }
        let data = {photos: [], people: []};
        const chosen = new Map(); // clé visage → {media_id, print_id, tag_id, x, y, w, h}
        const keyOf = f => f.print_id ? `p${f.print_id}` : f.tag_id ? `t${f.tag_id}` : `m${f.media_id}:${Math.round(f.x * 10)}:${Math.round(f.y * 10)}`;
        const manual = new Map(); // visages tracés à la main, par photo
        ed.faces.forEach(f => { chosen.set(keyOf(f), f); if (!f.print_id && !f.tag_id) { const l = manual.get(f.media_id) || []; l.push(f); manual.set(f.media_id, l); } });
        const firstLoad = !o.id;
        const load = async () => { data = ed.media.length ? await api('pa_faces', {ids: ed.media.join(',')}) : {photos: [], people: []}; };
        try { await load(); } catch (e) { toast(e.message, 'error'); return; }
        if (firstLoad) {
            const want = new Set((o.prints || []).map(Number));
            data.photos.forEach(p => p.faces.forEach(f => { if (f.ignored) return; if (want.size ? want.has(f.print_id) : !f.person_id) chosen.set(keyOf(f), {...f, media_id: p.id}); }));
            // les noms d'office : les personnes reliées aux photos et déjà nommées dessus
            const ids = new Set(); data.photos.forEach(p => { p.linked.forEach(i => ids.add(i)); p.faces.forEach(f => { if (f.person_id) ids.add(f.person_id); }); });
            ed.names = [...ids];
        }
        const dlg = ext.openDialog({eyebrow: 'QUI EST SUR CETTE PHOTO ?', title: ed.id ? ed.title : 'Nouvelle demande « Qui est sur cette photo ? »', wide: true,
            submitLabel: ed.id ? 'Enregistrer' : 'Créer la demande',
            body: `<div class="pa-ed">
                <label>Titre<input name="title" maxlength="200" required data-error="Donne un titre à la demande." value="${esc(ed.title)}"></label>
                <label>Mot d’accueil<textarea name="intro" rows="2" maxlength="3000">${esc(ed.intro)}</textarea></label>
                <div class="pa-sec"><span class="section-label">📷 Les photos et les visages</span><p class="ui-hint">Clique sur un cadre pour le mettre (bleu) ou l’enlever (gris) de la demande. Pour un visage oublié, trace un cadre sur la photo avec la souris.</p>
                    <div data-pa-photos></div><button type="button" class="button small secondary" data-pa-addph>＋ Ajouter des photos…</button></div>
                <div class="pa-sec"><span class="section-label">👥 Les noms à proposer</span><p class="ui-hint">Le cousin les voit dans une liste ; il peut aussi écrire un autre nom. Aucune fiche confidentielle n’est jamais proposée.</p>
                    <div data-pa-names></div>
                    <label class="checkbox-line"><input type="checkbox" name="living" ${ed.living ? 'checked' : ''}> Proposer aussi des personnes vivantes</label>
                    <p class="ui-hint" data-pa-living></p></div>
                <p class="pa-total" data-pa-total></p></div>`,
            onOpen: d => {
                d.classList.add('pa-dialog');
                const $ = s => d.querySelector(s);
                const peopleById = () => Object.fromEntries((data.people || []).map(p => [p.id, p]));
                const drawNames = () => {
                    const box = $('[data-pa-names]');
                    box.innerHTML = P().pickerField({name: 'names', kind: 'person', multiple: true, animals: false, allowCreate: false, value: ed.names || []});
                };
                const livingInfo = () => {
                    const ids = String(d.querySelector('[name="names"]')?.value || '').split(',').map(Number).filter(Boolean), by = peopleById();
                    const liv = ids.filter(i => by[i]?.living).length;
                    $('[data-pa-living]').textContent = $('[name="living"]').checked ? '⚠️ Les vivants cochés seront proposés au cousin : vérifie qu’ils sont d’accord.' : liv ? `${plural(liv, 'personne sans doute vivante', 'personnes sans doute vivantes')} ne ${liv > 1 ? 'seront' : 'sera'} pas ${liv > 1 ? 'proposées' : 'proposée'} (coche la case pour ${liv > 1 ? 'les' : 'la'} garder).` : '';
                };
                const total = () => { $('[data-pa-total]').textContent = `${plural(chosen.size, 'visage choisi', 'visages choisis')} sur ${plural(data.photos.length, 'photo')}.`; };
                const faceBox = (f, mid, i) => {
                    const k = keyOf({...f, media_id: mid}), on = chosen.has(k);
                    return `<button type="button" class="pa-fbox${on ? ' is-on' : ''}${f.person ? ' is-known' : ''}" data-pa-face="${esc(k)}" data-mid="${mid}" style="left:${f.x}%;top:${f.y}%;width:${f.w}%;height:${f.h}%" aria-pressed="${on}" title="${f.person ? esc(`Déjà identifié : ${f.person.name}`) : 'Visage sans nom'}"><span>${i + 1}</span></button>`;
                };
                const drawPhotos = () => {
                    const box = $('[data-pa-photos]');
                    if (!data.photos.length) { box.innerHTML = A().empty ? A().empty('Aucune photo pour l’instant.', {icon: '📷', action: {label: '＋ Ajouter des photos…', attrs: 'data-empty-click="[data-pa-addph]"'}}) : ''; total(); return; }
                    box.innerHTML = `<div class="pa-photos">${data.photos.map(p => { const faces = [...p.faces, ...(manual.get(p.id) || [])]; return `<figure class="pa-ph" data-pa-ph="${p.id}">
                        <div class="pa-imgw" data-pa-draw="${p.id}"><img src="${esc(mediaUrl(p.filename))}" alt="${esc(p.title || 'Photo')}" draggable="false">${faces.map((f, i) => faceBox(f, p.id, i)).join('')}</div>
                        <figcaption><b>${esc(p.title || 'Photo')}</b> ${p.date_text ? `<small>${esc(p.date_text)}</small>` : ''}<span class="spacer"></span>
                            ${p.faces.some(f => f.print_id) ? '' : `<button type="button" class="button small secondary" data-pa-scan="${p.id}" title="La reconnaissance des visages, sur cet ordinateur (rien n’est envoyé)">🔍 Repérer les visages</button>`}
                            <button type="button" class="icon-button small" data-pa-rmph="${p.id}" title="Retirer cette photo de la demande" aria-label="Retirer la photo">×</button></figcaption></figure>`; }).join('')}</div>`;
                    total();
                };
                drawPhotos(); drawNames(); livingInfo();
                d.addEventListener('picker-change', e => { if (e.detail?.name === 'names') { ed.names = String(d.querySelector('[name="names"]').value || '').split(',').map(Number).filter(Boolean); livingInfo(); } });
                $('[name="living"]').addEventListener('change', livingInfo);
                d.addEventListener('click', async e => {
                    const fb = e.target.closest('[data-pa-face]');
                    if (fb) { e.preventDefault(); const k = fb.dataset.paFace, mid = Number(fb.dataset.mid); if (chosen.has(k)) chosen.delete(k); else { const p = data.photos.find(x => x.id === mid); const f = [...(p?.faces || []), ...(manual.get(mid) || [])].find(x => keyOf({...x, media_id: mid}) === k); if (f) chosen.set(k, {...f, media_id: mid}); } fb.classList.toggle('is-on', chosen.has(k)); fb.setAttribute('aria-pressed', String(chosen.has(k))); total(); return; }
                    if (e.target.closest('[data-pa-addph]')) {
                        const list = await P().openMediaPicker?.({multiple: true, types: ['image'], title: 'Les photos à montrer', okLabel: 'Prendre ces photos'});
                        if (!list?.length) return;
                        const before = new Set(ed.media);
                        ed.media = [...new Set([...ed.media, ...list.map(m => Number(m.id))])].slice(0, 12);
                        if (ed.media.length >= 12 && list.length + before.size > 12) toast('12 photos au plus dans une demande.', 'error');
                        try { await load(); } catch (err) { toast(err.message, 'error'); return; }
                        data.photos.filter(p => !before.has(p.id)).forEach(p => p.faces.forEach(f => { if (!f.person_id && !f.ignored) chosen.set(keyOf({...f, media_id: p.id}), {...f, media_id: p.id}); }));
                        const ids = new Set(ed.names || []); data.photos.filter(p => !before.has(p.id)).forEach(p => { p.linked.forEach(i => ids.add(i)); p.faces.forEach(f => f.person_id && ids.add(f.person_id)); });
                        ed.names = [...ids]; drawNames(); drawPhotos(); livingInfo(); return;
                    }
                    const rm = e.target.closest('[data-pa-rmph]');
                    if (rm) { const mid = Number(rm.dataset.paRmph); ed.media = ed.media.filter(x => x !== mid); [...chosen.keys()].forEach(k => { if (chosen.get(k).media_id === mid) chosen.delete(k); }); manual.delete(mid); data.photos = data.photos.filter(p => p.id !== mid); drawPhotos(); return; }
                    const sc = e.target.closest('[data-pa-scan]');
                    if (sc) { await scanPhoto(Number(sc.dataset.paScan), sc); return; }
                });
                async function scanPhoto(mid, btn) {
                    const F = ext.faceInternals, p = data.photos.find(x => x.id === mid); if (!F?.createEngine || !p) { toast('La reconnaissance des visages n’est pas disponible : trace les cadres à la main.', 'error'); return; }
                    btn.disabled = true; btn.innerHTML = '<span class="ui-spin" aria-hidden="true"></span> Je cherche les visages…';
                    const engine = F.createEngine({onStep: t => { if (btn.isConnected) btn.lastChild.textContent = ' ' + t; }});
                    try {
                        await engine.ensure();
                        const res = await engine.scan({id: p.id, filename: p.filename, title: p.title});
                        if (res.skipped) throw new Error(res.skipped);
                        const faces = res.faces || [];
                        if (engine.kind === 'simple' || !faces.every(f => f.d)) { const l = manual.get(mid) || []; faces.forEach(f => l.push({media_id: mid, print_id: 0, tag_id: 0, x: +f.x.toFixed(2), y: +f.y.toFixed(2), w: +f.w.toFixed(2), h: +f.h.toFixed(2)})); manual.set(mid, l); l.forEach(f => chosen.set(keyOf(f), f)); }
                        else { await api('save_face_scan', {}, {method: 'POST', body: {media_id: mid, faces, model: 'face-api 1.7.15 ssd+rec'}}); await load(); data.photos.find(x => x.id === mid)?.faces.forEach(f => { if (!f.person_id) chosen.set(keyOf({...f, media_id: mid}), {...f, media_id: mid}); }); }
                        toast(faces.length ? `${plural(faces.length, 'visage trouvé', 'visages trouvés')}.` : 'Aucun visage trouvé : trace les cadres à la main.');
                    } catch (err) { toast(`Visages non repérés : ${err.message}. Trace les cadres à la main.`, 'error'); }
                    finally { engine.dispose?.(); drawPhotos(); }
                }
                // tracer un cadre à la main (souris ou doigt)
                let drag = null;
                d.addEventListener('pointerdown', e => {
                    const w = e.target.closest('[data-pa-draw]'); if (!w || e.target.closest('[data-pa-face]') || e.button !== 0) return;
                    const r = w.getBoundingClientRect(); drag = {w, r, x0: (e.clientX - r.left) / r.width * 100, y0: (e.clientY - r.top) / r.height * 100, el: document.createElement('div')};
                    drag.el.className = 'pa-fbox is-drawing'; w.appendChild(drag.el); w.setPointerCapture?.(e.pointerId); e.preventDefault();
                });
                d.addEventListener('pointermove', e => { if (!drag) return; const {r, x0, y0, el} = drag; const x = Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)), y = Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100));
                    Object.assign(el.style, {left: Math.min(x, x0) + '%', top: Math.min(y, y0) + '%', width: Math.abs(x - x0) + '%', height: Math.abs(y - y0) + '%'}); drag.x1 = x; drag.y1 = y; });
                d.addEventListener('pointerup', () => {
                    if (!drag) return; const {w, x0, y0, x1, y1, el} = drag; drag = null; el.remove();
                    if (x1 == null || Math.abs(x1 - x0) < 1.5 || Math.abs(y1 - y0) < 1.5) return;
                    const mid = Number(w.dataset.paDraw), f = {media_id: mid, print_id: 0, tag_id: 0, x: +Math.min(x0, x1).toFixed(2), y: +Math.min(y0, y1).toFixed(2), w: +Math.abs(x1 - x0).toFixed(2), h: +Math.abs(y1 - y0).toFixed(2)};
                    const l = manual.get(mid) || []; l.push(f); manual.set(mid, l); chosen.set(keyOf(f), f); drawPhotos();
                });
            },
            onSubmit: async form => {
                if (!form.elements.title.value.trim()) return UI().fail(form.elements.title, 'Donne un titre à la demande.');
                if (!chosen.size) return UI().fail(form.querySelector('[data-pa-photos]') || form.elements.title, 'Choisis au moins un visage (clique sur un cadre, ou trace-le sur la photo).');
                const faces = [...chosen.values()].filter(f => ed.media.includes(Number(f.media_id))).map(f => ({media_id: f.media_id, print_id: f.print_id || 0, tag_id: f.tag_id || 0, x: f.x, y: f.y, w: f.w, h: f.h}));
                const names = String(form.querySelector('[name="names"]')?.value || '').split(',').map(Number).filter(Boolean);
                const r = await write('save', {id: ed.id, title: form.elements.title.value, intro: form.elements.intro.value, media_ids: ed.media, faces, names, include_living: form.living.checked ? 1 : 0});
                const dr = r.dropped || {};
                if (dr.living || dr.private) toast([dr.living ? `${plural(dr.living, 'vivant')} non ${dr.living > 1 ? 'proposés' : 'proposé'}` : '', dr.private ? `${plural(dr.private, 'fiche confidentielle', 'fiches confidentielles')} non ${dr.private > 1 ? 'proposées' : 'proposée'}` : ''].filter(Boolean).join(' · ') + '.');
                o.after?.(r.ask);
                setTimeout(() => ready(r.ask, o.after), 0);
            }});
        return dlg;
    }

    /** La demande est prête : télécharger le fichier, aperçu, message à copier. */
    function ready(ask, after) {
        const mail = `Bonjour,\n\nJe fais l’histoire de notre famille. Je t’envoie en pièce jointe un petit fichier avec des photos : peux-tu me dire qui tu reconnais ?\n\n1. Ouvre le fichier joint (double-clic) : il s’ouvre dans ton navigateur, sans Internet.\n2. Clique sur un visage et écris son nom (ou choisis-le dans la liste).\n3. Clique sur « Enregistrer mes réponses » et renvoie-moi le fichier qui s’est téléchargé.\n\nMerci beaucoup !`;
        ext.openDialog({eyebrow: 'QUI EST SUR CETTE PHOTO ?', title: 'Ta demande est prête', submitLabel: 'Fermer',
            body: `<p>${esc(plural(ask.face_count, 'visage'))} sur ${esc(plural(ask.photo_count, 'photo'))}, ${esc(plural(ask.name_count, 'nom proposé', 'noms proposés'))}.</p>
                <div class="cl-out"><button type="button" class="button" data-pa-dl>⤓ Télécharger le fichier</button><button type="button" class="button secondary" data-pa-pv>👁 Aperçu</button><a class="button secondary" data-pa-mail href="mailto:?subject=${encodeURIComponent(ask.title)}&body=${encodeURIComponent(mail)}">✉️ Préparer un courriel</a></div>
                <label>Message à envoyer avec le fichier<textarea rows="8" readonly data-pa-msg>${esc(mail)}</textarea></label>
                <p class="ui-hint">Rien n’est envoyé par l’app : c’est toi qui joins le fichier à ton courriel. Le fichier ne contient que les photos, les cadres des visages et les noms proposés.</p>`,
            onOpen: d => {
                d.classList.add('pa-dialog');
                d.querySelector('[data-pa-dl]').addEventListener('click', () => downloadFile(ask.id, after));
                d.querySelector('[data-pa-pv]').addEventListener('click', () => preview(ask.id));
            }, onSubmit: () => true});
    }
    async function downloadFile(id, after) {
        try {
            const r = await write('render', {id, mode: 'file'});
            download(r.filename, r.html, 'text/html;charset=utf-8');
            toast(r.missing_photos ? `Fichier téléchargé (${plural(r.missing_photos, 'photo')} n’a pas pu être jointe).` : 'Fichier téléchargé : joins-le à un courriel.', r.missing_photos ? 'error' : '');
            after?.();
        } catch (e) { toast(e.message, 'error', {retry: () => downloadFile(id, after)}); }
    }
    async function preview(id) {
        try {
            const r = await write('preview', {id});
            const d = ext.openDialog({eyebrow: 'APERÇU', title: 'Ce que verra ton cousin', wide: true, submitLabel: 'Fermer', body: '<div class="qp-prev pa-prev"><iframe sandbox="allow-scripts" title="Aperçu du fichier"></iframe></div>', onSubmit: () => true});
            d.querySelector('iframe').srcdoc = r.html;
        } catch (e) { toast(e.message, 'error'); }
    }

    /* ═════════════════════════════ ⤒ Importer les réponses ═════════════════════════════ */
    const faceCrop = (a, photos) => { const f = a.box, p = photos[a.media_id]; if (!p) return '<span class="pa-crop is-empty">?</span>';
        const k = 100 / Math.max(f.w, f.h, 1); return `<span class="pa-crop" style="background-image:url('${esc(mediaUrl(p))}');background-size:${(k * 100).toFixed(1)}% auto;background-position:${(f.x / Math.max(.01, 100 - f.w) * 100).toFixed(1)}% ${(f.y / Math.max(.01, 100 - f.h) * 100).toFixed(1)}%" aria-hidden="true"></span>`; };
    function answersHtml(r, photos) {
        const st = a => a.state === 'agree' ? UI().badge('Accord', 'green', {title: 'Un autre cousin a donné la même réponse'}) : a.state === 'disagree' ? UI().badge('Désaccord', 'red', {title: 'Un autre cousin a répondu autre chose'}) : '';
        return `<div class="pa-answers">${r.answers.map(a => `<article class="pa-ans" data-pa-ans="${esc(a.face)}">
            ${faceCrop(a, photos)}
            <div class="pa-ans-main"><p><b>Visage ${a.num}</b> <small class="muted">${esc(a.photo || 'photo')}</small> ${st(a)}</p>
                <p>« <b>${esc(a.name || '…')}</b> » <small class="muted">selon ${esc(r.from || 'ton cousin')}</small>${a.note ? `<br><small>📝 ${esc(a.note)}</small>` : ''}</p>
                ${a.agree.length ? `<p class="ui-hint is-ok">✓ Pareil pour ${esc(a.agree.map(o => o.from || 'un cousin').join(', '))}</p>` : ''}
                ${a.disagree.length ? `<p class="ui-hint is-error">⚠️ ${a.disagree.map(o => `${esc(o.from || 'Un cousin')} : « ${esc(o.name)} »`).join(' · ')}</p>` : ''}
                ${a.current ? `<p class="ui-hint">Aujourd’hui sur la photo : <b>${esc(a.current.name)}</b></p>` : ''}
                <span class="pk-lab">C’est la même personne ?</span>${P().pickerField({name: '', hiddenName: false, kind: 'person', animals: false, inline: true, value: a.person || (a.candidates.length === 1 ? a.candidates[0] : null) ? {id: (a.person || a.candidates[0]).id, title: (a.person || a.candidates[0]).name, kind: 'person'} : null})}
                ${!a.person && a.candidates.length > 1 ? `<p class="ui-hint">Peut-être : ${a.candidates.slice(0, 5).map(c => `<button type="button" class="link-button" data-pa-cand="${c.id}" data-name="${esc(c.name)}">${esc(c.label)}</button>`).join(' · ')}</p>` : ''}
                <div class="pa-act" role="radiogroup" aria-label="Que faire de cette réponse ?">${[['accept', '✓ Accepter'], ['refuse', '✕ Refuser'], ['later', 'Plus tard']].map(([v, l]) => `<label class="pa-act-i"><input type="radio" name="pa-act-${esc(a.face)}" value="${v}" ${(a.suggest === 'accept' || a.suggest === 'confirm' ? 'accept' : 'later') === v ? 'checked' : ''}> ${l}</label>`).join('')}</div>
            </div></article>`).join('')}</div>`;
    }
    function bindAnswers(box) {
        box.addEventListener('click', e => { const c = e.target.closest('[data-pa-cand]'); if (!c) return; const art = c.closest('[data-pa-ans]'), pk = art.querySelector('.pk'); P().pickerSet(pk, {id: Number(c.dataset.paCand), title: c.dataset.name, kind: 'person'}); const r = art.querySelector('input[value="accept"]'); if (r) r.checked = true; });
        box.addEventListener('picker-change', e => { const art = e.target.closest('[data-pa-ans]'); if (art && e.detail?.value) { const r = art.querySelector('input[value="accept"]'); if (r) r.checked = true; } });
    }
    function readChoices(box) {
        const out = []; let bad = null;
        box.querySelectorAll('[data-pa-ans]').forEach(art => {
            const action = art.querySelector('input[type=radio]:checked')?.value || 'later';
            const pk = art.querySelector('.pk'), v = pk ? P().pickerValue(pk) : null, pid = typeof v === 'number' ? v : Number(v) || 0;
            if (action === 'accept' && !pid && !bad) bad = pk;
            out.push({face: art.dataset.paAns, action, person_id: action === 'accept' ? pid : 0});
        });
        return {choices: out, bad};
    }
    /** ⤒ Importer les réponses (fenêtre commune K13). files : fichier déjà choisi (depuis Questions aux proches). */
    function importAnswers({files = null, after = null} = {}) {
        return UI().openImportDialog({title: 'Importer les réponses « Qui est sur cette photo ? »', accept: '.json,application/json', what: 'le fichier « reponses-visages.json »', noun: 'réponse', feminine: true, files,
            intro: 'Le fichier que ton cousin t’a renvoyé (il s’appelle « reponses-visages.json »).',
            analyze: async fl => {
                const f = fl[0]; if (!f) throw new Error('Aucun fichier.');
                if (f.size > 300 * 1024) throw new Error('ce fichier est trop gros pour un fichier de réponses (300 Ko au plus).');
                const body = {file: await f.text()};
                const r = await write('analyze', body);
                let photos = {};
                try { const ids = [...new Set(r.answers.map(a => a.media_id))]; if (ids.length) (await api('pa_faces', {ids: ids.join(',')})).photos.forEach(p => { photos[p.id] = p.filename; }); } catch (_) {}
                const n = r.answers.length;
                return {count: n, noun: 'réponse', feminine: true, ok: n > 0 && !r.already, data: {body, r},
                    summaryHtml: r.already ? 'Ces réponses ont <b>déjà été importées</b>' : n ? `<b>${esc(plural(n, 'réponse'))}</b> de <b>${esc(r.from || 'ton cousin')}</b> à « ${esc(r.ask.title)} » (${esc(r.date_label)})${r.replies_before ? `, comparées aux ${esc(plural(r.replies_before, 'réponse'))} déjà reçues` : ''}. Pour chaque visage : accepte, refuse ou garde pour plus tard` : 'Aucun nom écrit dans ce fichier',
                    notices: r.answers.some(a => a.state === 'disagree') ? [{kind: 'warn', text: 'Des cousins ne sont pas d’accord sur certains visages (⚠️) : regarde bien avant d’accepter.'}] : [],
                    preview: n && !r.already ? answersHtml(r, photos) : '', onShow: bindAnswers, goLabel: '⤒ Importer les réponses'};
            },
            run: async (an, fl, box) => {
                const {choices, bad} = readChoices(box);
                if (bad) { UI().fail(bad.querySelector('input:not([type=hidden])') || bad, 'Choisis la fiche de cette personne (ou « Plus tard »).'); return {keepOpen: true}; }
                const res = await write('import', {...an.data.body, choices});
                after?.(res);
                const c = res.counts || {};
                return {message: c.accept ? `${plural(c.accept, 'visage identifié', 'visages identifiés')} (réponses de ${res.from})` : `Réponses de ${res.from} gardées avec la demande.`,
                    undo: async () => { await write('undo_import', {id: res.id}); after?.(); }};
            }});
    }

    /* ═════════════════════════════ La liste (dans 💬 Questions aux proches) ═════════════════════════════ */
    async function listSection(host) {
        if (!host || host.querySelector('.pa-list')) return;
        const sec = document.createElement('section'); sec.className = 'pa-list';
        host.appendChild(sec);
        const draw = async () => {
            let rows = [];
            try { rows = (await api('pa_list')).asks || []; } catch (e) { sec.innerHTML = A().empty(e.message, {icon: '⛔'}); return; }
            const item = r => ({name: r.title, open: `data-pa-open="${r.id}"`, thumb: r.thumb ? `<img src="${esc(mediaUrl(r.thumb))}" alt="" loading="lazy">` : '<span class="ui-card-ico">🔍</span>',
                lines: [`${plural(r.face_count, 'visage')} · ${plural(r.photo_count, 'photo')} · ${plural(r.name_count, 'nom proposé', 'noms proposés')}`, r.reply_count ? `${plural(r.reply_count, 'réponse')} : ${r.replies_from.filter(Boolean).join(', ') || 'cousins'}` : (r.status === 'sent' ? 'Envoyé, en attente des réponses' : 'Pas encore envoyé')],
                badges: [UI().badge((STATUS[r.status] || STATUS.prepared)[0], (STATUS[r.status] || STATUS.prepared)[1])], when: r.updated_at, whenLabel: 'Modifié',
                actions: kiosk() ? '' : `<button type="button" class="button small secondary" data-pa-open="${r.id}">✎ Modifier</button><button type="button" class="button small secondary" data-pa-dl="${r.id}">⤓ Télécharger</button><button type="button" class="icon-button small" data-pa-del="${r.id}" title="Supprimer la demande" aria-label="Supprimer">🗑</button>`});
            sec.innerHTML = `<div class="pa-list-head"><h3>🔍 Qui est sur cette photo ? <small class="muted">${esc(plural(rows.length, 'demande'))}</small></h3>${kiosk() ? '' : '<button type="button" class="button small secondary" data-pa-new>＋ Nouvelle demande…</button><button type="button" class="button small secondary" data-pa-import>⤒ Importer les réponses</button>'}</div>`
                + (rows.length ? UI().itemsHtml('list', rows.map(item)) : (A().empty ? A().empty('Aucune demande : ouvre une photo et clique « 📤 Demander qui c’est ».', {icon: '🔍', action: kiosk() ? null : {label: '＋ Nouvelle demande…', attrs: 'data-pa-new'}}) : ''));
            sec._rows = rows;
        };
        sec.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
            if (d.paNew !== undefined) { const list = await P().openMediaPicker?.({multiple: true, types: ['image'], title: 'Les photos à montrer', okLabel: 'Prendre ces photos'}); if (list?.length) open({media_ids: list.map(m => m.id), after: draw}); return; }
            if (d.paImport !== undefined) return importAnswers({after: draw});
            if (d.paOpen) return open({id: Number(d.paOpen), after: draw});
            if (d.paDl) return downloadFile(Number(d.paDl), draw);
            if (d.paDel) { const r = (sec._rows || []).find(x => x.id === Number(d.paDel)); if (!r) return; try { await write('delete', {id: r.id}); draw(); A().undoToast(`Demande « ${r.title} » supprimée`, {undo: async () => { await write('restore', {id: r.id}); draw(); }}); } catch (err) { toast(err.message, 'error'); } }
        });
        await draw();
    }

    /* ═════════════════════════════ Les branchements ═════════════════════════════ */
    // la visionneuse : « 📤 Demander qui c'est » à côté de « ＋ Identifier quelqu'un »
    const lbButton = () => {
        const lb = document.getElementById('lightbox'), tg = document.getElementById('lightbox-tag-toggle');
        if (!lb?.open || !tg) return;
        const st = A()?.state, item = st?.lightboxMedia?.[st.lightboxIndex];
        let b = document.getElementById('lightbox-pa-ask');
        const ok = item && !st.lightboxReadOnly && !kiosk() && /\.(jpe?g|png|gif|webp)$/i.test(item.filename || '') && Number(item.id) > 0;
        if (!ok) { if (b) b.hidden = true; return; }
        if (!b) { b = document.createElement('button'); b.type = 'button'; b.id = 'lightbox-pa-ask'; b.className = 'button small secondary'; b.textContent = '📤 Demander qui c’est'; b.title = 'Un petit fichier à envoyer à un cousin : il clique sur les visages et écrit qui c’est'; tg.insertAdjacentElement('afterend', b);
            b.addEventListener('click', () => { const s = A().state, it = s.lightboxMedia?.[s.lightboxIndex]; if (it) open({media_ids: [Number(it.id)]}); }); }
        b.hidden = false;
    };
    const watchLb = () => { const lb = document.getElementById('lightbox'); if (!lb || lb._paWatch) return; lb._paWatch = true; new MutationObserver(() => setTimeout(lbButton, 0)).observe(lb, {attributes: true, attributeFilter: ['open'], subtree: false});
        const cap = document.getElementById('lightbox-counter'); if (cap) new MutationObserver(() => setTimeout(lbButton, 0)).observe(cap, {childList: true, characterData: true, subtree: true}); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchLb); else watchLb();

    // 💬 Questions aux proches : la section et l'import qui reconnaît un fichier de visages
    ext.afterQuestions = ext.afterQuestions || [];
    ext.afterQuestions.push(page => listSection(page));
    ext.photoAsk = {open, importAnswers, listSection, isReplyText: t => /"format"\s*:\s*"lcnda-visages-reponses"/.test(String(t || '').slice(0, 400))};
})();
