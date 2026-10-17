/* LCNDA — 🏷️ « Qui est qui ? » : la reconnaissance des visages, entièrement sur l'ordinateur. Les visages déjà identifiés
 * à la main (identifications des photos) servent de modèles ; chaque visage des autres photos reçoit une proposition de nom
 * (« c'est sans doute Marie Martin »), et les visages inconnus qui se ressemblent sont regroupés pour être nommés d'un coup.
 * Le modèle (face-api, licence MIT, ≈ 13 Mo) vient une fois de jsDelivr et n'est utilisé que si son empreinte est exactement
 * celle attendue ; les photos ne quittent jamais l'ordinateur. On garde seulement l'« empreinte » de chaque visage (128 nombres).
 * Listes → Médias → « 🏷️ Qui est qui ? ». Serveur : lib/faces.php.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const toast = (...a) => A().toast(...a);
    const fmt = n => Number(n || 0).toLocaleString('fr-FR');
    const mediaUrl = f => `media/${encodeURIComponent(f)}`;

    /* ═════════ Le modèle : bibliothèque et poids, vérifiés par leur empreinte (SRI) ═════════ */
    const CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/';
    const FILES = {
        lib: ['dist/face-api.js', 'sha384-M5nePoB6/w/a9JhtegEibSLGiJy/+QMZZMfvcxjWVCQW/HPwrQ7i21V/Px/8AyVA'],
        ssd: [['model/ssd_mobilenetv1_model-weights_manifest.json', 'sha384-fmysjuNDnSIM5gqRwPVEGA1/0w5Ok0SqyKNnnaNTWojtlqAtwqDRz/44hF3HkhRr'], ['model/ssd_mobilenetv1_model.bin', 'sha384-2spbycjYagJihJ9ctoisEt/ALI+VrSvaIRMKYUAa7dQITarhWrP8n9lmrUkw7UIW']],
        landmarks: [['model/face_landmark_68_model-weights_manifest.json', 'sha384-jyeQciMhD4TgOdqkrLOmOuIU9PB8iWFiJnK+FXAu91aMTak51qDiuU+B7yYl8MOK'], ['model/face_landmark_68_model.bin', 'sha384-oX0nknyg2Op36WlwAOun3YsSgFLNplrl/uJbo9A1b4jKez4oin2i1NkzULnkmL+Z']],
        rec: [['model/face_recognition_model-weights_manifest.json', 'sha384-0/BxZ0200/qGz3ORL6RPhCi2+3YNPcL8q2IUqGPKdicLd6GPLOeyz2mGFFWhdcbD'], ['model/face_recognition_model.bin', 'sha384-pbcnzam7/sfrZVQx0ivS+lBKJzy/MRGQuIKoj8N4DlRG6xYmS+CGeDCo6DL1/XS/']],
    };
    const MODEL = 'face-api 1.7.15 ssd+rec';
    // un fichier vérifié, gardé dans le cache du navigateur pour ne le télécharger qu'une fois
    async function getFile([path, sri]) {
        const url = CDN + path; let cache = null;
        try { cache = await caches.open('lcnda-face-model'); const hit = await cache.match(url); if (hit) return hit; } catch (_) {}
        const r = await fetch(url, {integrity: sri, credentials: 'omit'}).catch(() => null);
        if (!r || !r.ok) throw new Error('Impossible de charger le modèle de reconnaissance (connexion internet requise la première fois, ou fichier modifié refusé).');
        try { await cache?.put(url, r.clone()); } catch (_) {}
        return r;
    }
    let ready = null;
    function loadModel(onStep = () => {}) {
        if (ready) return ready;
        ready = (async () => {
            onStep('Bibliothèque…');
            if (!window.faceapi) { const code = await (await getFile(FILES.lib)).text(); await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = URL.createObjectURL(new Blob([code], {type: 'application/javascript'})); s.onload = ok; s.onerror = () => ko(new Error('Bibliothèque illisible.')); document.head.appendChild(s); }); }
            const F = window.faceapi; if (!F) throw new Error('Bibliothèque de reconnaissance indisponible.');
            try { await F.tf.setBackend('webgl'); await F.tf.ready(); } catch (_) { await F.tf.setBackend('cpu'); await F.tf.ready(); }
            const net = async (n, files, label) => { onStep(label); const man = await (await getFile(files[0])).json(), bin = await (await getFile(files[1])).arrayBuffer(); n.loadFromWeightMap(F.tf.io.decodeWeights(bin, man.flatMap(g => g.weights))); };
            await net(F.nets.ssdMobilenetv1, FILES.ssd, 'Repérage des visages…');
            await net(F.nets.faceLandmark68Net, FILES.landmarks, 'Points du visage…');
            await net(F.nets.faceRecognitionNet, FILES.rec, 'Empreintes des visages…');
            return F;
        })().catch(e => { ready = null; throw e; });
        return ready;
    }

    /* ═════════ Empreintes : calcul, encodage, distance ═════════ */
    const b64 = f32 => { const u = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };
    const unb64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Float32Array(u.buffer); };
    const dist = (a, b) => { let s = 0; for (let i = 0; i < 128; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); };
    const SURE = .45, LIKELY = .55; // en dessous : même personne très probable / probable
    async function scanOne(F, m) {
        const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('Image illisible.')); i.src = mediaUrl(m.filename); });
        const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const res = await F.detectAllFaces(c, new F.SsdMobilenetv1Options({minConfidence: .5, maxResults: 60})).withFaceLandmarks().withFaceDescriptors();
        return res.map(r => { const b = r.detection.box; return {x: b.x / c.width * 100, y: b.y / c.height * 100, w: b.width / c.width * 100, h: b.height / c.height * 100, score: r.detection.score, d: b64(r.descriptor)}; }).filter(f => f.w > .8 && f.h > .8);
    }

    /* ═════════ Propositions : le plus proche des visages connus, et les inconnus regroupés ═════════ */
    function analyse(idx) {
        const prints = idx.prints.map(p => ({...p, v: p.d ? unb64(p.d) : null})).filter(p => p.v);
        const known = prints.filter(p => p.person_id), byPerson = new Map();
        known.forEach(p => { if (!byPerson.has(p.person_id)) byPerson.set(p.person_id, {id: p.person_id, name: p.person_name, faces: []}); byPerson.get(p.person_id).faces.push(p); });
        const unknown = prints.filter(p => !p.person_id && p.status !== 'ignored');
        const props = [];
        unknown.forEach(u => {
            const sc = [...byPerson.values()].map(P => ({P, d: Math.min(...P.faces.filter(f => f.media_id !== u.media_id).map(f => dist(u.v, f.v)), 9)})).sort((a, b) => a.d - b.d);
            if (sc[0] && sc[0].d < LIKELY) { const gap = sc[1] ? sc[1].d - sc[0].d : 1; props.push({face: u, person: sc[0].P, d: sc[0].d, sure: sc[0].d < SURE && gap > .04, other: sc[1] && sc[1].d < LIKELY ? sc[1].P : null}); u._prop = true; }
        });
        // les inconnus sans proposition : regroupés quand ils se ressemblent (même personne sur plusieurs photos)
        const rest = unknown.filter(u => !u._prop), groups = [], seen = new Set();
        rest.forEach(u => { if (seen.has(u.id)) return; const g = [u]; seen.add(u.id); rest.forEach(v => { if (!seen.has(v.id) && v.media_id !== u.media_id && g.some(w => dist(w.v, v.v) < SURE + .03)) { g.push(v); seen.add(v.id); } }); groups.push(g); });
        groups.sort((a, b) => b.length - a.length);
        props.sort((a, b) => a.d - b.d);
        return {props, groups, byPerson, known, unknown, ignored: prints.filter(p => p.status === 'ignored')};
    }
    const crop = (p, media, size = 76) => { const m = media.get(p.media_id); if (!m) return ''; const w = Math.max(p.w * 1.25, 1), h = Math.max(p.h * 1.25, 1), x = Math.max(0, p.x - p.w * .125), y = Math.max(0, p.y - p.h * .125);
        return `<span class="h-face-crop" style="width:${size}px;height:${Math.round(size * 1.15)}px;background-image:url('${esc(mediaUrl(m.filename))}');background-size:${(100 / w * 100).toFixed(1)}% ${(100 / h * 100).toFixed(1)}%;background-position:${(w >= 100 ? 0 : x / (100 - w) * 100).toFixed(1)}% ${(h >= 100 ? 0 : y / (100 - h) * 100).toFixed(1)}%" title="${esc(m.title || m.filename)}"></span>`; };

    /* ═════════ La fenêtre ═════════ */
    function open() {
        let idx = null, R = null, tab = 'props', stop = false, busy = false;
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal h-faces';
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">MÉDIAS · RECONNAISSANCE DES VISAGES</span><h2>🏷️ Qui est qui ?</h2></div><button type="button" class="icon-button" data-fc-close aria-label="Fermer">×</button></div>
            <div class="h-faces-body"><p class="muted">Les visages déjà identifiés sur tes photos servent de modèles : l’app propose un nom pour les autres visages, et regroupe les inconnus qui se ressemblent. Tout se calcule sur cet ordinateur : les photos ne sont envoyées nulle part. Le modèle (≈ 13 Mo) se télécharge une seule fois, vérifié par son empreinte. Une proposition reste une proposition : c’est toi qui valides.</p>
                <div class="h-faces-bar"><span data-fc-stat></span><span class="spacer"></span><button type="button" class="button" data-fc-scan>🔍 Analyser les nouvelles photos</button><button type="button" class="button secondary" data-fc-rescan>↻ Tout ré-analyser</button><button type="button" class="button secondary" data-fc-stop hidden>■ Arrêter</button></div>
                <div class="h-faces-progress" data-fc-prog hidden><span></span><small></small></div>
                <div class="h-faces-tabs" data-fc-tabs></div><div data-fc-pane class="h-faces-pane"></div></div>`;
        document.body.appendChild(dlg); dlg.showModal();
        const $ = s => dlg.querySelector(s), close = () => { stop = true; dlg.close(); dlg.remove(); };
        $('[data-fc-close]').addEventListener('click', close); dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
        const media = () => new Map((idx?.media || []).map(m => [m.id, m]));
        async function reload() { idx = await api('faces_index'); R = analyse(idx); draw(); }
        function draw() {
            const M = media(), toScan = idx.media.filter(m => !m.scanned).length;
            $('[data-fc-stat]').innerHTML = `${fmt(idx.media.length)} photo(s) · ${fmt(idx.media.length - toScan)} analysée(s) · ${fmt(idx.prints.length)} visage(s) · <b>${fmt(R.known.length)}</b> identifié(s), ${fmt(R.byPerson.size)} personne(s) connue(s)`;
            $('[data-fc-scan]').textContent = toScan ? `🔍 Analyser ${fmt(toScan)} nouvelle(s) photo(s)` : '🔍 Rien de nouveau à analyser'; $('[data-fc-scan]').disabled = busy || !toScan;
            const tabs = [['props', `💡 Propositions (${R.props.length})`], ['groups', `👥 Inconnus regroupés (${R.groups.filter(g => g.length > 1).length})`], ['alone', `❔ Autres inconnus (${R.groups.filter(g => g.length === 1).length})`], ['known', `✓ Identifiés (${R.byPerson.size})`]];
            $('[data-fc-tabs]').innerHTML = tabs.map(([k, l]) => `<button type="button" class="${k === tab ? 'active' : ''}" data-fc-tab="${k}">${esc(l)}</button>`).join('');
            const pane = $('[data-fc-pane]');
            if (!R.byPerson.size && tab === 'props') { pane.innerHTML = `<p class="h-faces-hint">Pour commencer : ouvre quelques photos (Médias) et identifie les visages à la main (bouton « Identifier » de la visionneuse), au moins une fois par personne, puis lance l’analyse. ${R.groups.length ? 'En attendant, nomme les inconnus regroupés (onglet 👥).' : ''}</p>`; return; }
            if (tab === 'props') pane.innerHTML = R.props.length ? `<p><button type="button" class="button small" data-fc-acceptall ${R.props.some(p => p.sure) ? '' : 'disabled'}>✓ Accepter les ${R.props.filter(p => p.sure).length} très probables</button></p><div class="h-faces-grid">${R.props.map((p, i) => `<article class="h-face-card ${p.sure ? 'is-sure' : ''}" data-fc-i="${i}">
                    <div class="h-face-pair">${crop(p.face, M)}<span class="h-face-arrow">→</span>${crop(R.byPerson.get(p.person.id).faces[0], M, 56)}</div>
                    <p><b>${esc(p.person.name)}</b><br><small class="muted">${p.sure ? 'très probable' : 'probable'} · ressemblance ${Math.round((1 - p.d) * 100)} %${p.other ? ` · ou ${esc(p.other.name)} ?` : ''}</small></p>
                    <div class="h-face-act"><button type="button" class="button small" data-fc-yes>✓ Oui</button><button type="button" class="button small secondary" data-fc-other>Quelqu’un d’autre…</button><button type="button" class="button small secondary" data-fc-ign title="Pas un visage, ou personne à ne pas nommer">Ignorer</button></div></article>`).join('')}</div>` : '<p class="muted">Aucune proposition pour l’instant : analyse plus de photos, ou identifie plus de visages à la main.</p>';
            if (tab === 'groups' || tab === 'alone') { const gs = R.groups.map((g, i) => [g, i]).filter(([g]) => tab === 'groups' ? g.length > 1 : g.length === 1);
                pane.innerHTML = gs.length ? `<div class="${tab === 'alone' ? 'h-faces-grid is-small' : 'h-faces-groups'}">${gs.slice(0, 120).map(([g, i]) => `<article class="h-face-group" data-fc-g="${i}"><div class="h-face-row">${g.slice(0, 12).map(f => crop(f, M, 64)).join('')}${g.length > 12 ? `<span class="muted">+${g.length - 12}</span>` : ''}</div>
                    <p>${g.length > 1 ? `<b>${g.length} visages</b> qui se ressemblent, sur ${new Set(g.map(f => f.media_id)).size} photos. ` : ''}Qui est-ce ?</p><div class="h-face-act"><button type="button" class="button small" data-fc-name>Nommer…</button><button type="button" class="button small secondary" data-fc-gign>Ignorer</button></div></article>`).join('')}</div>` : '<p class="muted">Rien ici.</p>'; }
            if (tab === 'known') pane.innerHTML = R.byPerson.size ? `<div class="h-faces-groups">${[...R.byPerson.values()].sort((a, b) => b.faces.length - a.faces.length).map(P => `<article class="h-face-group"><p><button type="button" class="table-link" data-h-person="${P.id}">${esc(P.name)}</button> <small class="muted">${P.faces.length} visage(s)</small></p><div class="h-face-row">${P.faces.slice(0, 14).map(f => crop(f, M, 56)).join('')}</div></article>`).join('')}</div>` : '<p class="muted">Personne n’est encore identifié.</p>';
        }
        const pickPerson = title => new Promise(res => { let done = false;
            ext.openDialog({eyebrow: 'QUI EST QUI ?', title, submitLabel: 'Choisir', body: '<label>Personne<input type="search" data-fp-q placeholder="Nom, prénom…" autocomplete="off"></label><div data-fp-res class="vx-pres"></div><label>Certitude<select name="conf"><option value="probable">Probable</option><option value="certain">Certaine</option><option value="possible">Possible</option></select></label>',
                onOpen: d => { const q = d.querySelector('[data-fp-q]'), box = d.querySelector('[data-fp-res]'); let tm = 0, chosen = null; d._get = () => chosen;
                    q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(async () => { const rows = (await api('search', {type: 'persons', q: q.value.trim(), limit: 8}).catch(() => ({data: []}))).data || []; box.innerHTML = rows.map(p => `<button type="button" class="link-button" data-pid="${Number(p.id)}">${esc(A().personName(p))}</button>`).join(''); }, 200); });
                    box.addEventListener('click', e => { const b = e.target.closest('[data-pid]'); if (!b) return; chosen = {id: Number(b.dataset.pid), name: b.textContent}; q.value = b.textContent; box.innerHTML = ''; });
                    d.addEventListener('close', () => { if (!done) res(null); }, {once: true}); setTimeout(() => q.focus(), 30); },
                onSubmit: f => { const d = f.closest('dialog'), c = d._get(); if (!c) { toast('Choisis une personne dans la liste.', 'error'); return false; } done = true; res({...c, conf: f.querySelector('[name=conf]').value}); }}); });
        const identify = async (faces, person, conf = 'probable') => { for (const f of faces) await post('face_identify', {id: f.id, person_id: person.id, confidence: conf}); };
        dlg.addEventListener('click', async e => {
            const t = e.target.closest('[data-fc-tab]'); if (t) { tab = t.dataset.fcTab; draw(); return; }
            const card = e.target.closest('[data-fc-i]'), p = card ? R.props[Number(card.dataset.fcI)] : null;
            try {
                if (e.target.closest('[data-fc-yes]') && p) { await identify([p.face], p.person, p.sure ? 'probable' : 'possible'); toast(`Identifié : ${p.person.name}.`); await reload(); }
                else if (e.target.closest('[data-fc-other]') && p) { const who = await pickPerson('Qui est-ce ?'); if (who) { await identify([p.face], who, who.conf); await reload(); } }
                else if (e.target.closest('[data-fc-ign]') && p) { await post('face_ignore', {id: p.face.id}); await reload(); }
                else if (e.target.closest('[data-fc-acceptall]')) { const sure = R.props.filter(x => x.sure); if (!confirm(`Identifier ${sure.length} visage(s) d’après les propositions très probables ? (certitude « probable », modifiable ensuite)`)) return; for (const x of sure) await identify([x.face], x.person, 'probable'); toast(`${sure.length} visage(s) identifié(s).`); await reload(); }
                else if (e.target.closest('[data-fc-name]')) { const g = R.groups[Number(e.target.closest('[data-fc-g]').dataset.fcG)]; const who = await pickPerson(g.length > 1 ? `Qui est-ce ? (${g.length} visages)` : 'Qui est-ce ?'); if (who) { await identify(g, who, who.conf); toast(`${g.length} visage(s) : ${who.name}.`); await reload(); } }
                else if (e.target.closest('[data-fc-gign]')) { const g = R.groups[Number(e.target.closest('[data-fc-g]').dataset.fcG)]; for (const f of g) await post('face_ignore', {id: f.id}); await reload(); }
            } catch (err) { toast(err.message, 'error'); }
        });
        async function scan(all) {
            const list = idx.media.filter(m => all || !m.scanned); if (!list.length) return;
            if (all && !confirm(`Ré-analyser ${list.length} photo(s) ? (les identifications restent)`)) return;
            busy = true; stop = false; $('[data-fc-stop]').hidden = false; $('[data-fc-scan]').disabled = true; $('[data-fc-rescan]').disabled = true;
            const prog = $('[data-fc-prog]'); prog.hidden = false; const bar = prog.querySelector('span'), txt = prog.querySelector('small');
            try {
                const F = await loadModel(s => { txt.textContent = `Chargement du modèle : ${s}`; });
                let faces = 0;
                for (let i = 0; i < list.length && !stop; i++) {
                    bar.style.width = `${(i / list.length * 100).toFixed(1)}%`; txt.textContent = `${i + 1} / ${list.length} · ${list[i].title || list[i].filename}`;
                    try { const r = await scanOne(F, list[i]); faces += r.length; await post('save_face_scan', {media_id: list[i].id, faces: r, model: MODEL}); } catch (_) {}
                }
                toast(`${stop ? 'Analyse arrêtée' : 'Analyse finie'} : ${faces} visage(s) trouvé(s).`);
            } catch (err) { toast(err.message, 'error'); }
            busy = false; prog.hidden = true; $('[data-fc-stop]').hidden = true; $('[data-fc-rescan]').disabled = false;
            await reload(); tab = R.props.length ? 'props' : 'groups'; draw();
        }
        $('[data-fc-scan]').addEventListener('click', () => scan(false));
        $('[data-fc-rescan]').addEventListener('click', () => scan(true));
        $('[data-fc-stop]').addEventListener('click', () => { stop = true; });
        reload().catch(e => { $('[data-fc-pane]').innerHTML = `<p class="error">${esc(e.message)}</p>`; });
    }
    ext.openFaces = open;
    ext.faceInternals = {loadModel, scanOne, analyse, dist, b64, unb64, FILES};
})();
