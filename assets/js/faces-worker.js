/* LCNDA — 👤 Visages : le calcul, dans un fil à part (Web Worker), pour que la page ne se fige jamais.
 * La page (assets/js/heritage-faces.js) envoie une photo à la fois : ce fil la charge, la réduit (createImageBitmap,
 * OffscreenCanvas : rien ne passe par la page), repère les visages et calcule leur empreinte (128 nombres), puis rend
 * le résultat. La page peut l'arrêter net à tout moment (terminate) : « ■ Arrêter » répond tout de suite, même au
 * milieu d'une photo, et une photo trop longue est abandonnée.
 *
 * Messages reçus : {type:'init', engine:'faceapi'|'mock', cdn, files, mock} → {type:'ready', backend} | {type:'fatal', message}
 *                  {type:'scan', id, url, maxSide} → {type:'result', id, faces, w, h, ms} | {type:'error', id, message}
 * Pendant l'init : {type:'step', text}.
 *
 * Moteur « mock » : un faux moteur, seulement pour les tests automatiques (réseau coupé, pas de modèle de 13 Mo) ; la page
 * ne le demande que si window.LCNDA_FACES_TEST le dit. Il fait vraiment le travail lourd d'image (chargement, réduction,
 * lecture des pixels) puis occupe le processeur le temps demandé, et rend des visages inventés mais stables.
 */
'use strict';
let engine = null;

/* un fichier du modèle, vérifié par son empreinte (SRI), gardé dans le cache du navigateur */
async function getFile(cdn, [path, sri]) {
    const url = cdn + path; let cache = null;
    try { cache = await caches.open('lcnda-face-model'); const hit = await cache.match(url); if (hit) return hit; } catch (_) {}
    const r = await fetch(url, {integrity: sri, credentials: 'omit'}).catch(() => null);
    if (!r || !r.ok) throw new Error('Impossible de charger le modèle de reconnaissance (connexion internet requise la première fois, ou fichier modifié refusé).');
    try { await cache?.put(url, r.clone()); } catch (_) {}
    return r;
}

const b64 = f32 => { const u = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };

/* la photo, chargée et réduite hors de la page */
async function loadPixels(url, maxSide) {
    const r = await fetch(url, {credentials: 'same-origin'});
    if (!r.ok) throw new Error(r.status === 404 ? 'fichier introuvable' : `fichier illisible (${r.status})`);
    const blob = await r.blob();
    if (blob.size > 80 * 1024 * 1024) throw new Error('fichier trop gros');
    let bmp = await createImageBitmap(blob).catch(() => { throw new Error('image illisible'); });
    const W = bmp.width, H = bmp.height; if (!W || !H) throw new Error('image vide');
    const k = Math.min(1, maxSide / Math.max(W, H));
    if (k < 1) { const small = await createImageBitmap(bmp, {resizeWidth: Math.max(1, Math.round(W * k)), resizeHeight: Math.max(1, Math.round(H * k)), resizeQuality: 'medium'}); bmp.close(); bmp = small; }
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d', {willReadFrequently: true});
    g.drawImage(bmp, 0, 0); bmp.close();
    return {data: g.getImageData(0, 0, c.width, c.height), w: c.width, h: c.height};
}

/* le vrai moteur : face-api (licence MIT), même bibliothèque et mêmes poids que sur la page */
async function faceapiEngine(m, step) {
    step('Bibliothèque…');
    const code = await (await getFile(m.cdn, m.files.lib)).text();
    importScripts(URL.createObjectURL(new Blob([code], {type: 'application/javascript'})));
    const F = self.faceapi; if (!F) throw new Error('Bibliothèque de reconnaissance indisponible.');
    // face-api attend une page ; ici, des toiles hors écran (on lui donne de toute façon des tableaux de pixels)
    const Stub = class {};
    F.env.setEnv({Canvas: OffscreenCanvas, CanvasRenderingContext2D: self.OffscreenCanvasRenderingContext2D || Stub, Image: Stub, ImageData: self.ImageData, Video: Stub,
        createCanvasElement: () => new OffscreenCanvas(1, 1), createImageElement: () => new Stub(), createVideoElement: () => new Stub(), fetch: (...a) => fetch(...a), readFile: () => { throw new Error('readFile'); }});
    let backend = 'cpu';
    try { if (typeof OffscreenCanvas !== 'undefined' && m.backend !== 'cpu') { await F.tf.setBackend('webgl'); await F.tf.ready(); backend = 'webgl'; } else throw 0; } catch (_) { await F.tf.setBackend('cpu'); await F.tf.ready(); backend = 'cpu'; }
    const net = async (n, files, label) => { step(label); const man = await (await getFile(m.cdn, files[0])).json(), bin = await (await getFile(m.cdn, files[1])).arrayBuffer(); n.loadFromWeightMap(F.tf.io.decodeWeights(bin, man.flatMap(g => g.weights))); };
    await net(F.nets.ssdMobilenetv1, m.files.ssd, 'Repérage des visages…');
    await net(F.nets.faceLandmark68Net, m.files.landmarks, 'Points du visage…');
    await net(F.nets.faceRecognitionNet, m.files.rec, 'Empreintes des visages…');
    const opts = new F.SsdMobilenetv1Options({minConfidence: .5, maxResults: 60});
    // un premier passage à vide : la préparation du calcul (la plus longue) se fait pendant le chargement, pas sur la première photo
    step('Préparation du calcul…');
    try { const z = F.tf.zeros([160, 160, 3], 'int32'); await F.detectAllFaces(z, opts).withFaceLandmarks().withFaceDescriptors(); z.dispose(); } catch (_) {}
    return {backend, async detect(px) {
        const t = F.tf.tidy(() => F.tf.browser.fromPixels(px.data));
        try {
            const res = await F.detectAllFaces(t, opts).withFaceLandmarks().withFaceDescriptors();
            return res.map(r => { const b = r.detection.box; return {x: b.x / px.w * 100, y: b.y / px.h * 100, w: b.width / px.w * 100, h: b.height / px.h * 100, score: r.detection.score, d: b64(r.descriptor)}; });
        } finally { t.dispose(); }
    }};
}

/* le faux moteur des tests : travail d'image réel, calcul simulé (le processeur est occupé `ms` millisecondes) */
function mockEngine(cfg = {}) {
    const ms = Math.max(0, Math.min(10000, Number(cfg.ms) || 250));
    return {backend: 'mock', async detect(px, url) {
        if (cfg.hang && url.includes(cfg.hang)) { await new Promise(() => {}); }              // ne répond jamais : le délai maximum doit la sauter
        if (cfg.crash && url.includes(cfg.crash)) throw new Error('le moteur a planté sur cette photo');
        if (cfg.busy && url.includes(cfg.busy)) { const end = performance.now() + 60000; while (performance.now() < end) { /* bloqué en plein calcul */ } }
        let sum = 0; const d = px.data.data; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
        const end = performance.now() + ms; let x = 0; while (performance.now() < end) { x += Math.sqrt(x + 1); }
        const seed = sum % 997, n = 1 + (seed % 3), faces = [];
        for (let k = 0; k < n; k++) { const v = new Float32Array(128); for (let i = 0; i < 128; i++) v[i] = Math.sin((seed + 1) * (i + 1) * (k + 1)) * .09; faces.push({x: 10 + k * 28, y: 20, w: 18, h: 24, score: .9, d: b64(v)}); }
        return faces;
    }};
}

self.onmessage = async e => {
    const m = e.data || {};
    if (m.type === 'init') {
        try {
            if (m.engine === 'mock' && Number(m.mock?.bootMs) > 0) { postMessage({type: 'step', text: 'Faux modèle…'}); await new Promise(r => setTimeout(r, Math.min(600000, Number(m.mock.bootMs)))); } // tests : un modèle long à charger
            engine = m.engine === 'mock' ? mockEngine(m.mock) : await faceapiEngine(m, text => postMessage({type: 'step', text})); postMessage({type: 'ready', backend: engine.backend});
        }
        catch (err) { postMessage({type: 'fatal', message: String(err?.message || err)}); }
        return;
    }
    if (m.type === 'scan') {
        const t0 = performance.now();
        try {
            if (!engine) throw new Error('moteur pas prêt');
            const px = await loadPixels(m.url, Math.max(256, Math.min(4096, Number(m.maxSide) || 1280)));
            const faces = (await engine.detect(px, m.url)).filter(f => f.w > .8 && f.h > .8).slice(0, 60);
            postMessage({type: 'result', id: m.id, faces, w: px.w, h: px.h, ms: Math.round(performance.now() - t0)});
        } catch (err) { postMessage({type: 'error', id: m.id, message: String(err?.message || err).slice(0, 120), ms: Math.round(performance.now() - t0)}); }
    }
};
