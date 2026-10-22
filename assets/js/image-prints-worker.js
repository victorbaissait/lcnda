/* LCNDA — 🔍 Empreintes d'images calculées dans un fil à part (heritage-images-similaires.js) : la page reste libre.
 * Reçoit {id, url} (une photo de l'app) ou {id, blob} (une image de l'ordinateur), rend {id, w, h, print} ou {id, error}.
 * Le moteur est le même que dans la page : app-image-prints.js. */
'use strict';
importScripts('app-image-prints.js?v=1');
const P = self.LCNDA_IMGPRINT;
self.onmessage = async e => {
    const {id, url, blob} = e.data || {};
    try {
        let src = blob;
        if (!src) {
            const u = new URL(String(url || ''), self.location.href);
            if (u.origin !== self.location.origin) throw new Error('Adresse refusée'); // seulement les médias de l'app
            const r = await fetch(u.href, {cache: 'no-cache'});
            if (!r.ok) throw new Error(`Fichier introuvable (${r.status})`);
            src = await r.blob();
        }
        const bmp = await createImageBitmap(src);
        const w = bmp.width, h = bmp.height;
        if (!w || !h) throw new Error('Image vide');
        const ws = P.workSize(w, h), c = new OffscreenCanvas(ws.w, ws.h), g = c.getContext('2d', {willReadFrequently: true});
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.fillStyle = '#fff'; g.fillRect(0, 0, ws.w, ws.h);
        g.drawImage(bmp, 0, 0, ws.w, ws.h); bmp.close?.();
        const print = P.fromPixels(g.getImageData(0, 0, ws.w, ws.h).data, ws.w, ws.h, {w, h});
        self.postMessage({id, w, h, print});
    } catch (err) {
        self.postMessage({id, error: String(err?.message || err || 'Image illisible').slice(0, 150)});
    }
};
