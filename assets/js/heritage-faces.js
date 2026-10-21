/* LCNDA — 👤 Visages : un seul outil pour les visages des photos, entièrement sur l'ordinateur.
 *   ① Trouver les visages : on choisit quelles photos analyser (les plus légères d'abord : photos marquées avec des
 *      visages, celles de la liste Médias, d'une personne, d'une étiquette, d'un album, d'une période, les N plus
 *      récentes, ou toutes les nouvelles). Le calcul se fait dans un fil à part (assets/js/faces-worker.js) : la page
 *      ne se fige pas, « ■ Arrêter » répond tout de suite, « ⏸ Pause » / « ▶ Reprendre », la progression est gardée
 *      (on reprend là où on s'était arrêté, même après avoir fermé), une photo qui plante ou traîne est sautée et notée.
 *      Puis la liste des photos où des visages attendent un nom, à ouvrir dans la visionneuse (« Ouvrir et identifier »).
 *   ② Qui est-ce ? : les visages déjà identifiés à la main servent de modèles ; propositions (« c'est sans doute Marie
 *      Martin »), inconnus qui se ressemblent regroupés, nommés d'un coup.
 * Remplace « ＋ Détection de visage » (détection seule, avec le détecteur du navigateur) et « 🏷️ Qui est qui ? » : la
 * détection simple du navigateur reste le dernier recours quand le modèle ne peut pas être chargé.
 * Le modèle (face-api, licence MIT, ≈ 13 Mo) vient une fois de jsDelivr et n'est utilisé que si son empreinte est exactement
 * celle attendue ; les photos ne quittent jamais l'ordinateur. On garde seulement l'« empreinte » de chaque visage (128 nombres).
 * Listes → Médias → « 👤 Visages ». Serveur : lib/faces.php.
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
    const plural = (n, one, many) => `${fmt(n)} ${n > 1 ? many : one}`;
    const mediaUrl = f => `media/${encodeURIComponent(f)}`;
    const store = {get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (_) { return d; } }, set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }};
    const TEST = () => (window.LCNDA_FACES_TEST && typeof window.LCNDA_FACES_TEST === 'object' ? window.LCNDA_FACES_TEST : null);
    const WORKER_URL = 'assets/js/faces-worker.js?v=2';
    const MAX_SIDE = 1280;                                  // les photos sont réduites à 1280 points de côté avant l'analyse
    // délai maximum pour une photo : au moins 1 min 30, et cinq fois le temps habituel de cet ordinateur (un vieil ordinateur sans carte graphique est lent)
    const TIMEOUT = (avg = 0) => Number(TEST()?.timeout) || Math.max(90000, Math.round(avg * 5));
    const JOB_KEY = 'lcnda-faces-job', SPEED_KEY = 'lcnda-faces-speed';

    /* ═════════ Le modèle : bibliothèque et poids, vérifiés par leur empreinte (SRI) ═════════ */
    const CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/';
    const FILES = {
        lib: ['dist/face-api.js', 'sha384-M5nePoB6/w/a9JhtegEibSLGiJy/+QMZZMfvcxjWVCQW/HPwrQ7i21V/Px/8AyVA'],
        ssd: [['model/ssd_mobilenetv1_model-weights_manifest.json', 'sha384-fmysjuNDnSIM5gqRwPVEGA1/0w5Ok0SqyKNnnaNTWojtlqAtwqDRz/44hF3HkhRr'], ['model/ssd_mobilenetv1_model.bin', 'sha384-2spbycjYagJihJ9ctoisEt/ALI+VrSvaIRMKYUAa7dQITarhWrP8n9lmrUkw7UIW']],
        landmarks: [['model/face_landmark_68_model-weights_manifest.json', 'sha384-jyeQciMhD4TgOdqkrLOmOuIU9PB8iWFiJnK+FXAu91aMTak51qDiuU+B7yYl8MOK'], ['model/face_landmark_68_model.bin', 'sha384-oX0nknyg2Op36WlwAOun3YsSgFLNplrl/uJbo9A1b4jKez4oin2i1NkzULnkmL+Z']],
        rec: [['model/face_recognition_model-weights_manifest.json', 'sha384-0/BxZ0200/qGz3ORL6RPhCi2+3YNPcL8q2IUqGPKdicLd6GPLOeyz2mGFFWhdcbD'], ['model/face_recognition_model.bin', 'sha384-pbcnzam7/sfrZVQx0ivS+lBKJzy/MRGQuIKoj8N4DlRG6xYmS+CGeDCo6DL1/XS/']],
    };
    const MODEL = 'face-api 1.7.15 ssd+rec';
    const NET_FAIL = 'Impossible de charger le modèle';
    // un fichier vérifié, gardé dans le cache du navigateur pour ne le télécharger qu'une fois
    async function getFile([path, sri]) {
        const url = CDN + path; let cache = null;
        try { cache = await caches.open('lcnda-face-model'); const hit = await cache.match(url); if (hit) return hit; } catch (_) {}
        const r = await fetch(url, {integrity: sri, credentials: 'omit'}).catch(() => null);
        if (!r || !r.ok) throw new Error(`${NET_FAIL} de reconnaissance (connexion internet requise la première fois, ou fichier modifié refusé).`);
        try { await cache?.put(url, r.clone()); } catch (_) {}
        return r;
    }
    /* le modèle sur la page elle-même : sert aux autres outils (photo d'identité du Studio) et de secours si le fil à part est impossible */
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
    const yieldNow = () => new Promise(r => (window.scheduler?.yield ? window.scheduler.yield().then(r) : setTimeout(r, 0)));
    // une photo réduite avant l'analyse (le décodage et la réduction se font hors de la page quand le navigateur le permet)
    async function smallCanvas(m, maxSide = MAX_SIDE) {
        const blob = await (await fetch(mediaUrl(m.filename), {credentials: 'same-origin'})).blob();
        let bmp = await createImageBitmap(blob); const W = bmp.width, H = bmp.height, k = Math.min(1, maxSide / Math.max(W, H));
        if (k < 1) { const s = await createImageBitmap(bmp, {resizeWidth: Math.round(W * k), resizeHeight: Math.round(H * k), resizeQuality: 'medium'}); bmp.close?.(); bmp = s; }
        const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.();
        return c;
    }
    async function scanOne(F, m) {
        const c = await smallCanvas(m);
        const res = await F.detectAllFaces(c, new F.SsdMobilenetv1Options({minConfidence: .5, maxResults: 60})).withFaceLandmarks().withFaceDescriptors();
        return res.map(r => { const b = r.detection.box; return {x: b.x / c.width * 100, y: b.y / c.height * 100, w: b.width / c.width * 100, h: b.height / c.height * 100, score: r.detection.score, d: b64(r.descriptor)}; }).filter(f => f.w > .8 && f.h > .8);
    }

    /* ═════════ Le moteur d'analyse : fil à part, puis page (secours), puis détecteur du navigateur (dernier recours) ═════════
     * scan(media) → {faces} | {skipped: raison} | {stopped: true}. stop() coupe tout de suite (même en pleine photo). */
    function createEngine({onStep = () => {}, onReady = () => {}} = {}) {
        let worker = null, booting = null, pending = null, kind = '', fallbackReason = '', times = [];
        const avg = () => (times.length ? times.reduce((s, x) => s + x, 0) / times.length : 0);
        const test = TEST(), mode = test?.engine === 'mock' ? 'mock' : 'faceapi';
        let bootKo = null, initTimer = 0;
        // arrêter : le fil est coupé net, même pendant le chargement du modèle (le chargement en cours échoue tout de suite, sans secours)
        const kill = () => { try { worker?.terminate(); } catch (_) {} worker = null; booting = null; clearTimeout(initTimer); const k = bootKo; bootKo = null; if (k) k(Object.assign(new Error('Analyse arrêtée.'), {stopped: true})); };
        function finish(v) { const p = pending; pending = null; if (p) { clearTimeout(p.timer); p.resolve(v); } }
        function boot() {
            if (booting) return booting;
            booting = new Promise((ok, ko) => {
                bootKo = ko;
                let w; try { w = new Worker(WORKER_URL); } catch (e) { ko(new Error('Fil de calcul impossible : ' + e.message)); return; }
                worker = w;
                initTimer = setTimeout(() => { ko(new Error('Le modèle met trop de temps à se charger.')); }, 180000);
                w.onmessage = e => {
                    const m = e.data || {};
                    if (m.type === 'step') onStep(m.text);
                    else if (m.type === 'ready') { clearTimeout(initTimer); bootKo = null; kind = m.backend === 'mock' ? 'mock' : 'worker'; ok(); }
                    else if (m.type === 'fatal') { clearTimeout(initTimer); ko(new Error(m.message)); }
                    else if ((m.type === 'result' || m.type === 'error') && pending && m.id === pending.id) {
                        if (m.type === 'result' && m.ms) times = [...times.slice(-11), m.ms];
                        finish(m.type === 'result' ? {faces: m.faces || [], ms: m.ms} : {skipped: m.message || 'erreur'});
                    }
                };
                w.onerror = e => { e.preventDefault?.(); clearTimeout(initTimer); if (pending) { kill(); finish({skipped: 'le calcul a planté'}); } else ko(new Error(e.message || 'Fil de calcul en erreur.')); };
                w.postMessage({type: 'init', engine: mode, cdn: CDN, files: FILES, mock: test || {}});
            }).catch(e => { if (!e?.stopped) kill(); throw e; });
            return booting;
        }
        let seq = 0;
        async function ensure() {
            if (kind === 'page' || kind === 'simple') return;
            try { await boot(); }
            catch (e) {
                if (mode === 'mock' || e?.stopped) throw e;
                fallbackReason = e.message;
                if (!String(e.message).startsWith(NET_FAIL)) { onStep('Calcul sur la page (plus lent)…'); try { await loadModel(onStep); kind = 'page'; return; } catch (e2) { fallbackReason = e2.message; } }
                if ('FaceDetector' in window) { kind = 'simple'; return; }
                throw new Error(fallbackReason);
            }
        }
        function scan(m) {
            return new Promise(resolve => {
                const id = ++seq; pending = {id, resolve, timer: null};
                (async () => {
                    try {
                        if ((kind === 'worker' || kind === 'mock') && !worker) { onStep('Redémarrage du calcul…'); await boot(); onReady(); } // relancé après une photo trop longue
                        if (pending?.id !== id) return;
                        const limit = TIMEOUT(avg()); // le délai ne compte que le calcul de la photo, pas le chargement du modèle
                        pending.timer = setTimeout(() => { if (pending?.id === id) { if (kind === 'worker' || kind === 'mock') kill(); finish({skipped: `trop longue à analyser (plus de ${Math.round(limit / 1000)} s)`}); } }, limit);
                        if (kind === 'worker' || kind === 'mock') { worker.postMessage({type: 'scan', id, url: new URL(mediaUrl(m.filename), location.href).href, maxSide: MAX_SIDE}); return; }
                        const t0 = performance.now(); await yieldNow();
                        let faces;
                        if (kind === 'page') faces = await scanOne(await loadModel(), m);
                        else { const c = await smallCanvas(m, 1600), found = await new window.FaceDetector({fastMode: true, maxDetectedFaces: 25}).detect(c); faces = (found || []).map(f => { const b = f.boundingBox || {}; return {x: b.x / c.width * 100, y: b.y / c.height * 100, w: b.width / c.width * 100, h: b.height / c.height * 100}; }).filter(f => f.w > 1 && f.h > 1); }
                        if (pending?.id === id) finish({faces, ms: Math.round(performance.now() - t0)});
                    } catch (e) { if (pending?.id === id) finish({skipped: String(e?.message || e).slice(0, 80)}); }
                })();
            });
        }
        return {ensure, scan, get kind() { return kind; }, get reason() { return fallbackReason; },
            stop() { if (kind === 'worker' || kind === 'mock' || booting) kill(); finish({stopped: true}); }, dispose() { kill(); finish({stopped: true}); }};
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
    /* beaucoup de visages : la comparaison (chacun avec chacun) se fait aussi dans un fil à part, pour ne pas figer la page */
    let analyseUrl = null;
    function analyseAsync(idx) {
        if ((idx.prints || []).length < 300 || typeof Worker === 'undefined') return Promise.resolve(analyse(idx));
        analyseUrl = analyseUrl || URL.createObjectURL(new Blob([`'use strict';const unb64=${unb64};const dist=${dist};const SURE=${SURE},LIKELY=${LIKELY};const analyse=${analyse};onmessage=e=>postMessage(analyse(e.data));`], {type: 'application/javascript'}));
        return new Promise(resolve => {
            let w; try { w = new Worker(analyseUrl); } catch (_) { resolve(analyse(idx)); return; }
            w.onmessage = e => { w.terminate(); resolve(e.data); };
            w.onerror = e => { e.preventDefault?.(); w.terminate(); resolve(analyse(idx)); };
            w.postMessage({prints: idx.prints});
        });
    }
    const crop = (p, media, size = 76) => { const m = media.get(p.media_id); if (!m) return ''; const w = Math.max(p.w * 1.25, 1), h = Math.max(p.h * 1.25, 1), x = Math.max(0, p.x - p.w * .125), y = Math.max(0, p.y - p.h * .125);
        return `<span class="h-face-crop" style="width:${size}px;height:${Math.round(size * 1.15)}px;background-image:url('${esc(mediaUrl(m.filename))}');background-size:${(100 / w * 100).toFixed(1)}% ${(100 / h * 100).toFixed(1)}%;background-position:${(w >= 100 ? 0 : x / (100 - w) * 100).toFixed(1)}% ${(h >= 100 ? 0 : y / (100 - h) * 100).toFixed(1)}%" title="${esc(m.title || m.filename)}"></span>`; };
    const dur = s => { s = Math.max(0, Math.round(s)); if (s < 60) return `${s} s`; const m = Math.floor(s / 60); if (m < 60) return `${m} min${s % 60 && m < 10 ? ` ${s % 60} s` : ''}`; return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
    const yearsOf = text => { const y = String(text || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/g) || []; return y.length ? [Number(y[0]), Number(y[y.length - 1])] : null; };

    /* ═════════ Quelles photos analyser ? ═════════ */
    const SOURCES = [
        ['marked', '⭐', 'Les photos marquées avec des visages', 'photo de la personne, portrait d’une fiche, visages déjà identifiés, étiquette « portrait » ou « visage »'],
        ['list', '📋', 'Les photos affichées dans la liste Médias', 'avec ta recherche et tes filtres actuels'],
        ['person', '👤', 'Les photos d’une personne', 'rattachées à sa fiche ou où elle est identifiée'],
        ['label', '🏷', 'Les photos d’une étiquette', ''],
        ['album', '📁', 'Un album ou un dossier', ''],
        ['period', '📅', 'Une période', 'd’après la date de la photo, sinon sa date d’ajout'],
        ['recent', '🕘', 'Les plus récentes', 'les dernières ajoutées'],
        ['all', '🗂', 'Toutes les photos', 'peut être long : tu peux mettre en pause et reprendre plus tard'],
    ];

    /* ═════════ La fenêtre ═════════ */
    function open(opts = {}) {
        document.querySelector('dialog.h-faces')?.remove();
        let idx = null, R = null, step = opts.step === 'who' ? 'who' : 'find', tab = 'props', busy = false, paused = false, engine = null, resumeWait = null, closed = false;
        let src = opts.source || '', srcOpt = {person: 0, personName: '', label: 0, labelName: '', album: '', period: '', recent: 50}, onlyNew = true, shown = 24;
        let run = null; // l'analyse en cours : {ids, total, done, found, skipped:[], times:[], label, t0}
        const simple = new Map(); // détection simple (sans empreinte) : media_id → cadres, gardés le temps de la fenêtre
        const listRows = (() => { const st = A().state || {}; const rows = Array.isArray(opts.listRows) ? opts.listRows : st.listType === 'media' ? (st.currentListRows || []) : []; return rows.filter(r => r && r.filename && (A().normalizedMediaType ? A().normalizedMediaType(r) === 'image' : /\.(jpe?g|png|webp)$/i.test(r.filename))); })();
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal h-faces';
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">MÉDIAS · VISAGES</span><h2>👤 Visages <span class="fc-help" data-help="Étape 1 : l’app repère les visages sur les photos choisies. Étape 2 : elle propose un nom d’après les visages déjà identifiés. Tout se calcule sur cet ordinateur." data-help-faq="Comment marche l’outil 👤 Visages ?"></span></h2></div><button type="button" class="icon-button" data-fc-close aria-label="Fermer">×</button></div>
            <div class="h-faces-body">
                <div class="fc-top"><nav class="ui-tabs" data-fc-steps role="tablist"></nav><span class="fc-stat" data-fc-stat></span></div>
                <div data-fc-run class="fc-run" hidden></div>
                <div data-fc-pane class="h-faces-pane">${window.LCNDA_UI?.spinner ? window.LCNDA_UI.spinner('Chargement des photos…') : '<p class="muted">Chargement…</p>'}</div></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-fc-foot-close>Fermer</button></div>`;
        document.body.appendChild(dlg); dlg.showModal();
        const $ = s => dlg.querySelector(s);
        const close = () => { if (closed) return; closed = true; if (busy) { saveJob(); if (run) run.stop = true; engine?.dispose(); resumeWait?.(); } dlg.close(); dlg.remove(); };
        $('[data-fc-close]').addEventListener('click', close); $('[data-fc-foot-close]').addEventListener('click', close); dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
        window.LCNDA_UI?.scan?.(dlg.querySelector('.modal-head'));
        const media = () => new Map((idx?.media || []).map(m => [m.id, m]));
        async function reload() { const next = await api('faces_index'); R = await analyseAsync(next); idx = next; draw(); }

        /* les photos d'une source, et combien restent à faire */
        function pick(kind) {
            const all = idx.media, faceLabels = new Set(idx.face_labels || []);
            switch (kind) {
                case 'marked': return all.filter(m => m.portrait || m.tagged > 0 || (m.labels || []).some(l => faceLabels.has(l)));
                case 'list': { const ids = new Set(listRows.map(r => Number(r.id))); return all.filter(m => ids.has(m.id)); }
                case 'person': return srcOpt.person ? all.filter(m => (m.people || []).includes(srcOpt.person)) : [];
                case 'label': return srcOpt.label ? all.filter(m => (m.labels || []).includes(srcOpt.label)) : [];
                case 'album': return srcOpt.album ? all.filter(m => (m.albums || []).includes(srcOpt.album)) : [];
                case 'period': { const y = yearsOf(srcOpt.period); if (!y) return []; return all.filter(m => { const v = m.year || Number(String(m.added || '').slice(0, 4)) || 0; return v >= y[0] && v <= y[1]; }); }
                case 'recent': return all.slice(0, Math.max(1, Math.min(5000, Number(srcOpt.recent) || 50)));
                default: return all;
            }
        }
        const todo = list => list.filter(m => !onlyNew || (!m.scanned && !m.skipped));
        const lightest = () => { const c = ['marked', 'list', 'recent'].map(k => [k, todo(pick(k)).length]).filter(([, n]) => n > 0).sort((a, b) => a[1] - b[1]); return c[0]?.[0] || 'recent'; };
        const speed = () => Number(store.get(SPEED_KEY, 0)) || 0;
        const estimate = n => { const s = speed(); return s ? `≈ ${dur(n * s / 1000)} sur cet ordinateur` : 'environ 1 à 3 s par photo, selon l’ordinateur'; };

        function stat() {
            const done = idx.media.filter(m => m.scanned).length, sk = idx.media.filter(m => m.skipped).length;
            $('[data-fc-stat]').innerHTML = `${plural(idx.media.length, 'photo', 'photos')} · ${plural(done, 'analysée', 'analysées')}${sk ? ` · ${plural(sk, 'sautée', 'sautées')}` : ''} · ${plural(idx.prints.length, 'visage', 'visages')} · <b>${fmt(R.known.length)}</b> ${R.known.length > 1 ? 'identifiés' : 'identifié'}`;
        }
        function draw() {
            if (!idx || closed) return;
            const waiting = R.props.length + R.unknown.length;
            $('[data-fc-steps]').innerHTML = [['find', '① Trouver les visages'], ['who', `② Qui est-ce ?${waiting ? ` (${fmt(R.props.length + R.groups.length)})` : ''}`]]
                .map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === step}" class="${k === step ? 'is-active' : ''}" data-fc-step="${k}">${esc(l)}</button>`).join('');
            stat();
            if (step === 'find') drawFind(); else drawWho();
            drawRun();
        }

        /* ─── ① Trouver les visages ─── */
        function drawFind() {
            if (!src) src = lightest();
            const job = loadJob(), pane = $('[data-fc-pane]'), M = media();
            const albums = [...new Set(idx.media.flatMap(m => m.albums || []))].sort((a, b) => a.localeCompare(b, 'fr'));
            const rows = SOURCES.filter(([k]) => k !== 'list' || listRows.length).filter(([k]) => k !== 'album' || albums.length).map(([k, ico, label, hint]) => {
                const list = k === src || ['marked', 'list', 'recent', 'all'].includes(k) ? pick(k) : null, n = list ? todo(list).length : null;
                let extra = '';
                if (k === src && k === 'person') extra = `<div class="fc-src-opt" data-fc-opt="person">${window.LCNDA_PICKER.pickerField({name: 'fc_person', kind: 'person', allowCreate: false, value: srcOpt.person ? {id: srcOpt.person, title: srcOpt.personName, kind: 'person'} : null})}</div>`;
                if (k === src && k === 'label') extra = `<div class="fc-src-opt" data-fc-opt="label">${window.LCNDA_PICKER.pickerField({name: 'fc_label', kind: 'label', allowCreate: false, value: srcOpt.label ? {id: srcOpt.label, title: srcOpt.labelName, kind: 'label'} : null})}</div>`;
                if (k === src && k === 'album') extra = `<div class="fc-src-opt"><select data-fc-album><option value="">Choisis…</option>${albums.map(a => `<option ${a === srcOpt.album ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></div>`;
                if (k === src && k === 'period') extra = `<div class="fc-src-opt" data-fc-period></div>`;
                if (k === src && k === 'recent') extra = `<div class="fc-src-opt"><label class="fc-inline">Les <input type="number" min="1" max="5000" step="10" value="${esc(srcOpt.recent)}" data-fc-recent> plus récentes</label></div>`;
                return `<label class="fc-src ${k === src ? 'is-active' : ''}"><input type="radio" name="fc_src" value="${k}" ${k === src ? 'checked' : ''} ${busy ? 'disabled' : ''}><span class="fc-src-ico" aria-hidden="true">${ico}</span><span class="fc-src-main"><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}${extra}</span>${n !== null ? `<span class="fc-badge ${n ? '' : 'is-zero'}">${n ? plural(n, 'à analyser', 'à analyser') : 'rien de nouveau'}</span>` : ''}</label>`;
            }).join('');
            const chosen = todo(pick(src)), skipped = idx.media.filter(m => m.skipped);
            const openBy = new Map(), knownBy = new Map();
            idx.prints.forEach(p => { if (p.person_id) knownBy.set(p.media_id, (knownBy.get(p.media_id) || 0) + 1); else if (p.status !== 'ignored') openBy.set(p.media_id, (openBy.get(p.media_id) || 0) + 1); });
            const withFaces = [...new Set([...openBy.keys(), ...simple.keys()])].map(id => M.get(id)).filter(Boolean)
                .map(m => ({m, open: simple.has(m.id) ? simple.get(m.id).length : openBy.get(m.id) || 0, known: knownBy.get(m.id) || 0}))
                .sort((a, b) => b.open - a.open || b.m.id - a.m.id);
            pane.innerHTML = `${job && !busy ? `<div class="ui-notice ui-notice-info fc-resume" role="status"><span class="ui-notice-ico" aria-hidden="true">ℹ️</span><span><b>Analyse en pause</b> : ${plural(job.ids.length, 'photo restante', 'photos restantes')} sur ${fmt(job.total)} (${esc(job.label)}). <button type="button" class="button small" data-fc-resume>▶ Reprendre</button> <button type="button" class="button small secondary" data-fc-forget>Abandonner</button></span></div>` : ''}
                <h3 class="fc-h">Quelles photos analyser ?</h3>
                <div class="fc-srcs" role="radiogroup">${rows}</div>
                <label class="checkbox-line fc-check"><input type="checkbox" data-fc-onlynew ${onlyNew ? 'checked' : ''} ${busy ? 'disabled' : ''}> Sauter les photos déjà analysées</label>
                <div class="fc-go"><button type="button" class="button" data-fc-go ${busy || !chosen.length ? 'disabled' : ''}>🔍 ${chosen.length ? `Analyser ${plural(chosen.length, 'photo', 'photos')}` : 'Rien à analyser ici'}</button><small class="muted">${chosen.length ? esc(estimate(chosen.length)) : ''}</small>
                ${skipped.length && !busy ? `<button type="button" class="button small secondary" data-fc-retry title="${esc(skipped.slice(0, 8).map(m => `${m.title || m.filename} : ${m.skipped}`).join('\n'))}">↻ Réessayer ${plural(skipped.length, 'photo sautée', 'photos sautées')}</button>` : ''}</div>
                <h3 class="fc-h">Photos avec des visages à nommer${withFaces.length ? ` (${fmt(withFaces.length)})` : ''}</h3>
                ${withFaces.length ? `<div class="fc-photos">${withFaces.slice(0, shown).map(({m, open: n, known}) => `<article class="fc-photo"><button type="button" class="fc-photo-thumb" data-fc-openmedia="${m.id}" aria-label="Ouvrir ${esc(m.title || m.filename)}"><img src="${esc(mediaUrl(m.thumbnail || m.filename))}" alt="" loading="lazy"></button><div class="fc-photo-main"><b>${esc(m.title || m.filename)}</b><small>${plural(n, 'visage à nommer', 'visages à nommer')}${known ? ` · ${fmt(known)} ${known > 1 ? 'identifiés' : 'identifié'}` : ''}${simple.has(m.id) ? ' · détection simple' : ''}</small></div><button type="button" class="button small" data-fc-openmedia="${m.id}">Ouvrir et identifier</button></article>`).join('')}</div>${withFaces.length > shown ? `<button type="button" class="ui-more" data-fc-more>Voir les ${fmt(Math.min(24, withFaces.length - shown))} suivantes ↓</button>` : ''}`
                    : `<p class="muted">${idx.prints.length ? 'Tous les visages trouvés ont un nom ou ont été ignorés. 👍' : 'Lance une analyse : les photos où l’app trouve des visages apparaîtront ici.'}</p>`}`;
            if (src === 'period') { const box = pane.querySelector('[data-fc-period]'); const f = window.LCNDA_UI?.dateField ? window.LCNDA_UI.dateField({name: 'fc_period', value: srcOpt.period, placeholder: 'entre 1900 et 1950, vers 1925, 1960…', calendar: false}) : Object.assign(document.createElement('input'), {value: srcOpt.period}); box.appendChild(f); const inp = f.input || f; inp.addEventListener('input', () => { srcOpt.period = inp.value; refreshCount(); }); }
            pane.querySelector('[data-fc-opt]')?.addEventListener('picker-change', e => { const it = e.detail?.item; if (src === 'person') { srcOpt.person = it && !it.free ? Number(it.id) : 0; srcOpt.personName = it?.title || ''; } else { srcOpt.label = it ? Number(it.id) : 0; srcOpt.labelName = it?.title || ''; } drawFind(); });
        }
        function refreshCount() { const n = todo(pick(src)).length, b = $('[data-fc-go]'); if (!b) return; b.disabled = busy || !n; b.textContent = `🔍 ${n ? `Analyser ${plural(n, 'photo', 'photos')}` : 'Rien à analyser ici'}`; b.nextElementSibling.textContent = n ? estimate(n) : ''; }

        /* ─── ② Qui est-ce ? ─── */
        function drawWho() {
            const M = media(), pane = $('[data-fc-pane]');
            const tabs = [['props', '💡 Propositions', R.props.length], ['groups', '👥 Inconnus regroupés', R.groups.filter(g => g.length > 1).length], ['alone', '❔ Autres inconnus', R.groups.filter(g => g.length === 1).length], ['known', '✓ Identifiés', R.byPerson.size]];
            let html = `<div class="ui-filters fc-filters">${tabs.map(([k, l, n]) => `<button type="button" class="${k === tab ? 'is-active' : ''}" data-fc-tab="${k}">${esc(l)} (${fmt(n)})</button>`).join('')}</div>`;
            if (!idx.prints.length) html += `<p class="h-faces-hint">Aucun visage trouvé pour l’instant. Commence par l’étape ① : choisis quelques photos et lance l’analyse. <button type="button" class="button small" data-fc-step="find">① Trouver les visages</button></p>`;
            else if (!R.byPerson.size && tab === 'props') html += `<p class="h-faces-hint">Pour avoir des propositions : ouvre quelques photos et identifie les visages à la main (bouton « Identifier » de la visionneuse, ou « Ouvrir et identifier » à l’étape ①), au moins une fois par personne. ${R.groups.length ? 'En attendant, nomme les inconnus regroupés (👥).' : ''}</p>`;
            else if (tab === 'props') html += R.props.length ? `<p><button type="button" class="button small" data-fc-acceptall ${R.props.some(p => p.sure) ? '' : 'disabled'}>✓ Accepter les ${fmt(R.props.filter(p => p.sure).length)} très probables</button></p><div class="h-faces-grid">${R.props.map((p, i) => `<article class="h-face-card ${p.sure ? 'is-sure' : ''}" data-fc-i="${i}">
                    <div class="h-face-pair">${crop(p.face, M)}<span class="h-face-arrow">→</span>${crop(R.byPerson.get(p.person.id).faces[0], M, 56)}</div>
                    <p><b>${esc(p.person.name)}</b><br><small class="muted">${p.sure ? 'très probable' : 'probable'} · ressemblance ${Math.round((1 - p.d) * 100)} %${p.other ? ` · ou ${esc(p.other.name)} ?` : ''}</small></p>
                    <div class="h-face-act"><button type="button" class="button small" data-fc-yes>✓ Oui</button><button type="button" class="button small secondary" data-fc-other>Quelqu’un d’autre…</button><button type="button" class="button small secondary" data-fc-ign title="Pas un visage, ou personne à ne pas nommer">Ignorer</button></div></article>`).join('')}</div>` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🖼️</span><span class="empty-line-text">Aucune proposition pour l’instant : analyse plus de photos, ou identifie plus de visages à la main.</span></p>';
            if (idx.prints.length && (tab === 'groups' || tab === 'alone')) { const gs = R.groups.map((g, i) => [g, i]).filter(([g]) => tab === 'groups' ? g.length > 1 : g.length === 1);
                html += gs.length ? `<div class="${tab === 'alone' ? 'h-faces-grid is-small' : 'h-faces-groups'}">${gs.slice(0, 120).map(([g, i]) => `<article class="h-face-group" data-fc-g="${i}"><div class="h-face-row">${g.slice(0, 12).map(f => crop(f, M, 64)).join('')}${g.length > 12 ? `<span class="muted">+${g.length - 12}</span>` : ''}</div>
                    <p>${g.length > 1 ? `<b>${g.length} visages</b> qui se ressemblent, sur ${new Set(g.map(f => f.media_id)).size} photos. ` : ''}Qui est-ce ?</p><div class="h-face-act"><button type="button" class="button small" data-fc-name>Nommer…</button><button type="button" class="button small secondary" data-fc-openmedia="${g[0].media_id}">Voir la photo</button><button type="button" class="button small secondary" data-fc-gign>Ignorer</button></div></article>`).join('')}</div>` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📭</span><span class="empty-line-text">Rien ici.</span></p>'; }
            if (idx.prints.length && tab === 'known') html += R.byPerson.size ? `<div class="h-faces-groups">${[...R.byPerson.values()].sort((a, b) => b.faces.length - a.faces.length).map(P => `<article class="h-face-group"><p><button type="button" class="table-link" data-h-person="${P.id}">${esc(P.name)}</button> <small class="muted">${plural(P.faces.length, 'visage', 'visages')}</small></p><div class="h-face-row">${P.faces.slice(0, 14).map(f => crop(f, M, 56)).join('')}</div></article>`).join('')}</div>` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">👤</span><span class="empty-line-text">Personne n’est encore identifié.</span></p>';
            pane.innerHTML = html;
        }

        /* ─── l'analyse en cours : barre, vitesse, temps restant, pause, arrêt ─── */
        function drawRun() {
            const box = $('[data-fc-run]'); if (!box) return;
            if (!run) { box.hidden = true; box.innerHTML = ''; return; }
            box.hidden = false;
            const t = run.times.slice(-12), avg = t.length ? t.reduce((s, x) => s + x, 0) / t.length : 0, left = run.ids.length;
            const pct = run.total ? (run.done / run.total * 100) : 0;
            box.innerHTML = `<div class="h-faces-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${run.total}" aria-valuenow="${run.done}"><span style="width:${pct.toFixed(1)}%"></span><small>${fmt(run.done)} / ${fmt(run.total)}</small></div>
                <div class="fc-run-line"><span class="fc-run-txt" data-fc-runtxt>${run.status ? `<span class="ui-spin" aria-hidden="true"></span>${esc(run.status)}` : paused ? `⏸ En pause${run.current ? ' (la photo en cours se termine)' : ''}` : `<span class="ui-spin" aria-hidden="true"></span>${esc(run.current ? run.current.title || run.current.filename : '')}`}</span>
                <span class="fc-run-speed">${avg ? `${(avg / 1000).toLocaleString('fr-FR', {maximumFractionDigits: 1})} s par photo · reste ≈ ${dur(left * avg / 1000)}` : 'vitesse : on mesure…'} · ${plural(run.found, 'visage trouvé', 'visages trouvés')}${run.skipped.length ? ` · <span class="fc-warn" title="${esc(run.skipped.slice(-8).map(s => `${s.title} : ${s.reason}`).join('\n'))}">${plural(run.skipped.length, 'sautée', 'sautées')}</span>` : ''}</span>
                <span class="fc-run-btns"><button type="button" class="button small secondary" data-fc-pause>${paused ? '▶ Reprendre' : '⏸ Pause'}</button><button type="button" class="button small secondary" data-fc-stop>■ Arrêter</button></span></div>
                ${engine?.kind === 'page' ? `<p class="muted fc-note">Calcul sur la page (le fil à part n’a pas pu démarrer) : un peu plus lent.</p>` : engine?.kind === 'simple' ? `<div class="ui-notice ui-notice-warn"><span class="ui-notice-ico">⚠️</span><span>Modèle de reconnaissance indisponible (${esc(engine.reason)}). Détection simple du navigateur : les visages sont repérés, mais sans proposition de nom.</span></div>` : ''}`;
        }
        function saveJob() { if (!run || !run.ids.length) { store.set(JOB_KEY, null); return; } const first = media().get(run.ids[0]); store.set(JOB_KEY, {ids: run.ids, total: run.total, done: run.done, label: run.label, check: first ? [first.id, first.filename] : null, at: Date.now()}); }
        function loadJob() {
            const j = store.get(JOB_KEY, null); if (!j || !Array.isArray(j.ids) || !j.ids.length || !idx) return null;
            const M = media(); if (j.check && M.get(j.check[0])?.filename !== j.check[1]) return null; // une autre généalogie
            const ids = j.ids.map(Number).filter(id => M.has(id) && !M.get(id).scanned); if (!ids.length) { store.set(JOB_KEY, null); return null; }
            return {...j, ids, label: String(j.label || 'analyse')};
        }

        async function start(list, label) {
            if (busy || !list.length) return;
            busy = true; paused = false;
            run = {ids: list.map(m => m.id), total: list.length + (label.resumedDone || 0), done: label.resumedDone || 0, found: 0, skipped: [], times: [], label: label.text, current: null, status: 'Chargement du modèle…'};
            saveJob(); draw();
            engine = createEngine({onStep: s => { if (run) { run.status = /^Redémarrage/.test(s) ? s : `Chargement du modèle : ${s}`; const el = $('[data-fc-runtxt]'); if (el) el.innerHTML = `<span class="ui-spin" aria-hidden="true"></span>${esc(run.status)}`; } },
                onReady: () => { if (run) { run.status = ''; drawRunText(); } }});
            let stopped = false;
            try {
                await engine.ensure();
                run.status = ''; drawRun();
                const M = media();
                while (run.ids.length && !closed) {
                    if (paused) { await new Promise(r => { resumeWait = r; }); resumeWait = null; if (!run || run.stop) break; }
                    if (run.stop) break;
                    const m = M.get(run.ids[0]); if (!m) { run.ids.shift(); continue; }
                    run.current = m; drawRunText();
                    const t0 = performance.now(), res = await engine.scan(m);
                    if (res.stopped || run.stop) { stopped = true; break; }
                    run.current = null; run.ids.shift(); run.done++;
                    try {
                        if (res.skipped) { run.skipped.push({id: m.id, title: m.title || m.filename, reason: res.skipped}); m.skipped = res.skipped; await post('save_face_scan', {media_id: m.id, skipped: res.skipped}); }
                        else if (engine.kind === 'simple') { if (res.faces.length) simple.set(m.id, res.faces); run.found += res.faces.length; }
                        else { run.times.push(performance.now() - t0); run.found += res.faces.length; await post('save_face_scan', {media_id: m.id, faces: res.faces, model: MODEL}); m.scanned = true; m.faces = res.faces.length; }
                    } catch (err) { run.skipped.push({id: m.id, title: m.title || m.filename, reason: err.message}); }
                    saveJob(); drawRun();
                    await yieldNow(); // la main au navigateur entre chaque photo
                }
                if (run.times.length >= 3) store.set(SPEED_KEY, Math.round(run.times.slice(-20).reduce((s, x) => s + x, 0) / Math.min(20, run.times.length)));
                if (!run.ids.length) store.set(JOB_KEY, null);
                const sk = run.skipped.length ? ` · ${plural(run.skipped.length, 'photo sautée', 'photos sautées')}` : '';
                if (!closed) toast(`${stopped || run.stop ? '■ Analyse arrêtée' : '✓ Analyse finie'} : ${plural(run.found, 'visage trouvé', 'visages trouvés')}${sk}.${run.ids.length ? ` Il reste ${plural(run.ids.length, 'photo', 'photos')} : « ▶ Reprendre » quand tu veux.` : ''}`);
            } catch (err) {
                if (!closed && !err?.stopped) toast(err.message, 'error');
                saveJob();
            }
            engine?.dispose(); engine = null; busy = false; paused = false; run = null;
            if (closed) return;
            await reload().catch(e => toast(e.message, 'error'));
        }
        function drawRunText() { const el = $('[data-fc-runtxt]'); if (el && run && !paused) el.innerHTML = `<span class="ui-spin" aria-hidden="true"></span>${esc(run.current ? run.current.title || run.current.filename : '')}`; }
        function stopNow() {
            if (!run) return;
            run.stop = true; paused = false; engine?.stop(); resumeWait?.();
            saveJob();
            const box = $('[data-fc-run]'); if (box) box.innerHTML = `<p class="fc-run-line"><span>■ Analyse arrêtée. ${run.ids.length ? `${plural(run.ids.length, 'photo restante', 'photos restantes')} : tu pourras reprendre.` : ''}</span></p>`;
        }

        const pickPerson = title => new Promise(res => { let done = false, chosen = '';
            ext.openDialog({eyebrow: 'VISAGES', title, submitLabel: 'Choisir', body: `<div><span class="pk-lab">Personne</span>${window.LCNDA_PICKER.pickerField({name: 'fp_person', kind: 'person'})}</div><label>Certitude<select name="conf"><option value="probable">Probable</option><option value="certain">Certaine</option><option value="possible">Possible</option></select></label>`,
                onOpen: d => { d.addEventListener('close', () => { if (!done) res(null); }, {once: true}); d.addEventListener('picker-change', e => { chosen = e.detail.item?.title || ''; }); setTimeout(() => d.querySelector('.pk-input')?.focus(), 30); },
                onSubmit: f => { const id = Number(f.elements.fp_person?.value) || 0; if (!id) return window.LCNDA_UI.fail(f.elements.fp_person, 'Choisis une personne dans la liste.'); done = true; res({id, name: chosen, conf: f.querySelector('[name=conf]').value}); }}); });
        // chaque visage nommé devient une identification ; « ↶ Annuler » retire celles qu'on vient de créer
        const identify = async (faces, person, conf = 'probable') => { const made = []; for (const f of faces) { const r = await post('face_identify', {id: f.id, person_id: person.id, confidence: conf}); if (r?.tag_id && !r.result && !f.tag_id) made.push(r.tag_id); } return made; };
        const undoable = (msg, made) => { const u = A().undoToast; if (u && made.length) u(msg, {undo: async () => { for (const id of made) await post('delete_media_tag', {tag_id: id}); await reload(); }}); else toast(msg); };
        const ignore = async faces => { for (const f of faces) await post('face_ignore', {id: f.id}); await reload(); const u = A().undoToast; if (u) u(faces.length > 1 ? `${plural(faces.length, 'visage ignoré', 'visages ignorés')}` : 'Visage ignoré', {undo: async () => { for (const f of faces) await post('face_ignore', {id: f.id, undo: 1}); await reload(); }, redo: async () => { for (const f of faces) await post('face_ignore', {id: f.id}); await reload(); }}); };
        async function openMedia(id) {
            const m = media().get(id); if (!m || !A().openLightbox) return;
            const boxes = simple.get(id) || idx.prints.filter(p => p.media_id === id && !p.person_id && p.status !== 'ignored').map(p => ({x: p.x, y: p.y, w: p.w, h: p.h}));
            const row = listRows.find(r => Number(r.id) === id) || {id: m.id, filename: m.filename, thumbnail: m.thumbnail, media_type: 'image', title: m.title};
            dlg.close(); A().openLightbox([row], 0, true);
            if (boxes.length) await A().showFaceSuggestionsOnLightbox?.(boxes);
            document.getElementById('lightbox')?.addEventListener('close', () => { if (!closed && dlg.isConnected) { dlg.showModal(); reload().catch(() => {}); } }, {once: true});
        }
        dlg.addEventListener('change', e => {
            if (e.target.name === 'fc_src') { src = e.target.value; shown = 24; drawFind(); }
            else if (e.target.matches('[data-fc-onlynew]')) { onlyNew = e.target.checked; drawFind(); }
            else if (e.target.matches('[data-fc-album]')) { srcOpt.album = e.target.value; drawFind(); }
        });
        dlg.addEventListener('input', e => { if (e.target.matches('[data-fc-recent]')) { srcOpt.recent = Math.max(1, Math.min(5000, Number(e.target.value) || 50)); refreshCount(); } });
        dlg.addEventListener('click', async e => {
            const T = s => e.target.closest(s);
            if (T('[data-fc-stop]')) { stopNow(); return; }
            if (T('[data-fc-pause]')) { if (!run) return; paused = !paused; if (!paused) resumeWait?.(); drawRun(); return; }
            const st = T('[data-fc-step]'); if (st) { step = st.dataset.fcStep; draw(); return; }
            const t = T('[data-fc-tab]'); if (t) { tab = t.dataset.fcTab; draw(); return; }
            if (T('[data-fc-more]')) { shown += 24; drawFind(); return; }
            const om = T('[data-fc-openmedia]'); if (om) { openMedia(Number(om.dataset.fcOpenmedia)); return; }
            if (T('[data-fc-go]')) { const list = todo(pick(src)), lab = SOURCES.find(s => s[0] === src)?.[2] || ''; start(list, {text: src === 'person' && srcOpt.personName ? `photos de ${srcOpt.personName}` : lab.toLowerCase()}); return; }
            if (T('[data-fc-retry]')) { start(idx.media.filter(m => m.skipped), {text: 'photos sautées'}); return; }
            if (T('[data-fc-resume]')) { const j = loadJob(), M = media(); if (j) start(j.ids.map(id => M.get(id)), {text: j.label, resumedDone: Math.max(0, j.total - j.ids.length)}); return; }
            if (T('[data-fc-forget]')) { store.set(JOB_KEY, null); drawFind(); return; }
            const card = T('[data-fc-i]'), p = card ? R.props[Number(card.dataset.fcI)] : null;
            try {
                if (T('[data-fc-yes]') && p) { const made = await identify([p.face], p.person, p.sure ? 'probable' : 'possible'); await reload(); undoable(`Identifié : ${p.person.name}`, made); }
                else if (T('[data-fc-other]') && p) { const who = await pickPerson('Qui est-ce ?'); if (who) { const made = await identify([p.face], who, who.conf); await reload(); undoable(`Identifié : ${who.name}`, made); } }
                else if (T('[data-fc-ign]') && p) await ignore([p.face]);
                else if (T('[data-fc-acceptall]')) { const sure = R.props.filter(x => x.sure); const made = []; for (const x of sure) made.push(...await identify([x.face], x.person, 'probable')); await reload(); undoable(`${plural(sure.length, 'visage identifié', 'visages identifiés')} (certitude « probable »)`, made); }
                else if (T('[data-fc-name]')) { const g = R.groups[Number(T('[data-fc-g]').dataset.fcG)]; const who = await pickPerson(g.length > 1 ? `Qui est-ce ? (${g.length} visages)` : 'Qui est-ce ?'); if (who) { const made = await identify(g, who, who.conf); await reload(); undoable(`${plural(g.length, 'visage', 'visages')} : ${who.name}`, made); } }
                else if (T('[data-fc-gign]')) await ignore(R.groups[Number(T('[data-fc-g]').dataset.fcG)]);
            } catch (err) { toast(err.message, 'error'); }
        });
        reload().catch(e => { $('[data-fc-pane]').innerHTML = `<div class="ui-notice ui-notice-error" role="alert"><span class="ui-notice-ico">⛔</span><span>${esc(e.message)}</span></div>`; });
        return dlg;
    }
    ext.openFaces = open;
    ext.faceInternals = {loadModel, scanOne, analyse, analyseAsync, dist, b64, unb64, FILES, createEngine};
})();
