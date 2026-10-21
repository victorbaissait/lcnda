/* LCNDA — 🏠 Plan de maison en 3D : les étages construits (murs avec leurs textures, percés de portes et de fenêtres, sols,
 * toit à deux pans), les meubles en volume, et les objets 3D importés : OBJ (+ MTL pour les couleurs), STL (binaire ou texte),
 * glTF et GLB (géométrie, couleurs et textures intégrées). Tourner, approcher ; ☀️ la lumière du jour (soleil selon le lieu, la date, l'heure et le nord du plan, ombres, lampes la nuit) ;
 * 🚶 la visite à la première personne (yeux à 1,60 m, Z Q S D / W A S D / flèches, souris capturée, murs, escaliers, petite carte, joystick) ; ✦ les souvenirs posés.
 * Appelé par heritage-house.js (ext.house3d.mount / inspect). three.js est chargé à la demande.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    let T = null; const three = async () => (T ??= await import('../vendor/three.module.js'));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const M = cm => cm / 100; // le plan est en centimètres, la 3D en mètres

    /* ═════════ Textures dessinées (pas de fichier à télécharger) ═════════ */
    const texCache = new Map();
    function tex(kind, color) {
        const key = kind + '|' + color; if (texCache.has(key)) return texCache.get(key);
        const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
        let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        const shade = (hex, f) => { const n = parseInt(String(hex).slice(1), 16), r = n >> 16, gg = (n >> 8) & 255, b = n & 255, k = v => clamp(Math.round(v * f), 0, 255); return `rgb(${k(r)},${k(gg)},${k(b)})`; };
        g.fillStyle = color; g.fillRect(0, 0, S, S);
        const noise = (a, n = 1800) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${rnd() > .5 ? '0,0,0' : '255,255,255'},${a * rnd()})`; g.fillRect(rnd() * S, rnd() * S, 2, 2); } };
        switch (kind) {
            // 🧱 revêtements des murs ajoutés : crépi, pierre de taille, papiers peints (rayures, fleurs, toile de Jouy) ; 🪵 poutres du plafond
            case 'crepi': { noise(.16, 7000); for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(0,0,0,${.03 + rnd() * .05})`; g.beginPath(); g.arc(rnd() * S, rnd() * S, 4 + rnd() * 14, 0, Math.PI * 2); g.fill(); } break; }
            case 'pierretaille': { const h = S / 4; for (let r = 0; r < 4; r++) for (let x = (r % 2) * -64; x < S; x += 128) { g.fillStyle = shade(color, .9 + rnd() * .14); g.fillRect(x + 2, r * h + 2, 124, h - 4); } g.strokeStyle = shade(color, .72); g.lineWidth = 2; for (let r = 0; r <= 4; r++) { g.beginPath(); g.moveTo(0, r * h); g.lineTo(S, r * h); g.stroke(); } noise(.05, 1500); break; }
            case 'rayures': { for (let x = 0; x < S; x += 32) { g.fillStyle = shade(color, .82); g.fillRect(x, 0, 12, S); g.fillStyle = shade(color, 1.08); g.fillRect(x + 14, 0, 3, S); } break; }
            case 'fleurs': { for (let y = 0; y < S; y += 64) for (let x = ((y / 64) % 2) * 32; x < S + 32; x += 64) { const cx = x + 8, cy = y + 24; g.fillStyle = shade(color, .62); for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(cx + Math.cos(k * 1.2566) * 6, cy + Math.sin(k * 1.2566) * 6, 4.5, 0, Math.PI * 2); g.fill(); } g.fillStyle = shade(color, .45); g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill(); g.strokeStyle = shade(color, .7); g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy + 9); g.quadraticCurveTo(cx + 9, cy + 20, cx + 3, cy + 30); g.stroke(); } break; }
            case 'jouy': { g.strokeStyle = '#8a3b3b'; g.fillStyle = '#8a3b3b'; g.lineWidth = 1.6; const scene = (ox, oy) => { g.beginPath(); g.arc(ox + 20, oy + 22, 14, Math.PI, 0); g.stroke(); g.beginPath(); g.moveTo(ox + 20, oy + 22); g.lineTo(ox + 20, oy + 44); g.stroke(); for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(ox + 10 + k * 4, oy + 16 + (k % 2) * 5, 4, 0, Math.PI * 2); g.stroke(); }
                    g.beginPath(); g.arc(ox + 60, oy + 30, 4, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(ox + 60, oy + 34); g.lineTo(ox + 56, oy + 54); g.lineTo(ox + 66, oy + 54); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(ox + 40, oy + 56); g.bezierCurveTo(ox + 55, oy + 50, ox + 75, oy + 62, ox + 90, oy + 56); g.stroke(); };
                for (let y = 0; y < S; y += 128) for (let x = ((y / 128) % 2) * 64; x < S + 64; x += 128) scene(x - 64, y + 20); break; }
            case 'poutres': { for (let x = 0; x < S; x += 4) { g.strokeStyle = shade(color, .82 + rnd() * .3); g.beginPath(); g.moveTo(0, x); g.lineTo(S, x + (rnd() - .5) * 6); g.stroke(); } break; }
            case 'pierre': case 'dalles': { const rows = kind === 'dalles' ? 3 : 5; for (let r = 0; r < rows; r++) { let x = -rnd() * 60; const h = S / rows; while (x < S) { const w = 50 + rnd() * 70; g.fillStyle = shade(color, .82 + rnd() * .3); g.fillRect(x + 3, r * h + 3, w - 6, h - 6); x += w; } } g.strokeStyle = shade(color, .55); noise(.12); break; }
            case 'brique': { const h = S / 8; for (let r = 0; r < 8; r++) for (let x = (r % 2) * -32; x < S; x += 64) { g.fillStyle = shade(color, .85 + rnd() * .25); g.fillRect(x + 2, r * h + 2, 60, h - 4); } noise(.08); break; }
            case 'colombage': { g.fillStyle = '#5a3b22'; [0, 120, 250].forEach(x => g.fillRect(x, 0, 14, S)); g.fillRect(0, 0, S, 12); g.fillRect(0, S - 12, S, 12); g.save(); g.translate(14, 12); g.rotate(Math.atan2(S - 24, 106)); g.fillRect(0, -6, 150, 12); g.restore(); noise(.06); break; }
            case 'lambris': case 'parquet': { const n = kind === 'lambris' ? 6 : 8; for (let i = 0; i < n; i++) { g.fillStyle = shade(color, .85 + rnd() * .25); if (kind === 'lambris') g.fillRect(i * S / n + 1, 0, S / n - 2, S); else { g.fillRect(0, i * S / n + 1, S, S / n - 2); g.fillStyle = shade(color, .6); g.fillRect(rnd() * S, i * S / n, 2, S / n); } } noise(.06); break; }
            case 'point': { for (let i = -2; i < 10; i++) for (let j = 0; j < 8; j++) { g.save(); g.translate(j * 32, i * 32); g.rotate(j % 2 ? Math.PI / 4 : -Math.PI / 4); g.fillStyle = shade(color, .82 + rnd() * .3); g.fillRect(0, 0, 44, 15); g.restore(); } break; }
            case 'tomettes': { const R = 22; for (let y = 0; y < S + R; y += R * 1.5) for (let x = 0; x < S + R; x += R * 1.732) { const ox = (Math.round(y / (R * 1.5)) % 2) * R * .866; g.fillStyle = shade(color, .82 + rnd() * .3); g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(x + ox + Math.cos(a) * (R - 1.5), y + Math.sin(a) * (R - 1.5)); } g.fill(); } break; }
            case 'carreaux': case 'carrelage': { const n = 4; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = shade(color, .9 + rnd() * .15); g.fillRect(i * S / n + 2, j * S / n + 2, S / n - 4, S / n - 4); if (kind === 'carreaux') { g.fillStyle = shade(color, .7); g.beginPath(); g.arc(i * S / n + S / n / 2, j * S / n + S / n / 2, 10, 0, 7); g.fill(); } } break; }
            case 'damier': { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#222' : '#eee'; g.fillRect(i * 64, j * 64, 64, 64); } break; }
            case 'papier': { for (let x = 0; x < S; x += 32) { g.fillStyle = shade(color, .9); g.fillRect(x, 0, 10, S); } for (let y = 16; y < S; y += 48) for (let x = 21; x < S; x += 32) { g.fillStyle = shade(color, 1.15); g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); } break; }
            case 'tuiles': { for (let r = 0; r < 10; r++) for (let x = (r % 2) * -16; x < S; x += 32) { g.fillStyle = shade(color, .8 + rnd() * .3); g.beginPath(); g.ellipse(x + 16, r * 26 + 18, 15, 16, 0, 0, Math.PI); g.fill(); } break; }
            case 'ardoises': { for (let r = 0; r < 12; r++) for (let x = (r % 2) * -20; x < S; x += 40) { g.fillStyle = shade(color, .8 + rnd() * .3); g.fillRect(x + 1, r * 22, 38, 21); } break; }
            case 'chaume': { for (let i = 0; i < 2500; i++) { g.strokeStyle = shade(color, .7 + rnd() * .5); g.beginPath(); const x = rnd() * S, y = rnd() * S; g.moveTo(x, y); g.lineTo(x + (rnd() - .5) * 6, y + 16); g.stroke(); } break; }
            case 'zinc': { for (let x = 0; x < S; x += 32) { g.fillStyle = shade(color, .85 + rnd() * .2); g.fillRect(x, 0, 30, S); } break; }
            case 'tuilesplates': { for (let r = 0; r < 14; r++) for (let x = (r % 2) * -12; x < S; x += 24) { g.fillStyle = shade(color, .78 + rnd() * .35); g.fillRect(x + 1, r * 18 + 1, 22, 17); } break; }
            case 'lauzes': { let y = 0; while (y < S) { const h = 18 + rnd() * 16; let x = -rnd() * 40; while (x < S) { const w = 30 + rnd() * 50; g.fillStyle = shade(color, .7 + rnd() * .45); g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + rnd() * 4); g.lineTo(x + w - 3, y + h); g.lineTo(x + 2, y + h - rnd() * 4); g.fill(); x += w + 2; } y += h + 2; } noise(.1); break; }
            case 'bacacier': { for (let x = 0; x < S; x += 32) { g.fillStyle = shade(color, 1.12); g.fillRect(x, 0, 8, S); g.fillStyle = shade(color, .82); g.fillRect(x + 8, 0, 4, S); } break; }
            case 'vernies': { for (let r = 0; r < 10; r++) for (let x = (r % 2) * -16; x < S; x += 32) { const k = (Math.floor(x / 32) + r) % 4; g.fillStyle = [color, '#2f6b3a', '#c99a2e', '#1e1e1e'][k]; g.fillRect(x + 1, r * 26 + 1, 30, 25); } noise(.06); break; }
            // les matières des objets (heritage-house.js : OBJ_MATS)
            case 'bois': { for (let i = 0; i < 46; i++) { g.strokeStyle = shade(color, .68 + rnd() * .3); g.lineWidth = .6 + rnd() * 2.2; g.beginPath(); const y = rnd() * S, ph = rnd() * 6; for (let x = 0; x <= S; x += 8) g.lineTo(x, y + Math.sin(x / 38 + ph) * 3.5); g.stroke(); } for (let i = 0; i < 3; i++) { g.strokeStyle = shade(color, .55); g.lineWidth = 1.2; g.beginPath(); g.ellipse(rnd() * S, rnd() * S, 9 + rnd() * 8, 3 + rnd() * 2, 0, 0, 7); g.stroke(); } noise(.04); break; }
            case 'marbre': { noise(.04, 1200); for (let i = 0; i < 9; i++) { g.strokeStyle = `rgba(90,90,100,${.12 + rnd() * .25})`; g.lineWidth = .5 + rnd() * 1.8; g.beginPath(); let x = rnd() * S, y = 0; g.moveTo(x, y); while (y < S) { x += (rnd() - .5) * 40; y += 10 + rnd() * 20; g.lineTo(x, y); } g.stroke(); } break; }
            case 'osier': { const n = 16, c2 = S / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = shade(color, (i + j) % 2 ? .78 + rnd() * .1 : 1 + rnd() * .1); if ((i + j) % 2) g.fillRect(i * c2 + 1, j * c2 + 3, c2 - 2, c2 - 6); else g.fillRect(i * c2 + 3, j * c2 + 1, c2 - 6, c2 - 2); } noise(.05); break; }
            case 'tissu': { noise(.07, 6000); g.strokeStyle = 'rgba(0,0,0,.06)'; for (let i = 0; i < S; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); } break; }
            case 'herbe': case 'gravier': case 'terre': case 'chaux': case 'torchis': case 'platre': case 'beton': case 'tapis': noise(kind === 'platre' ? .03 : .14, kind === 'herbe' ? 5000 : 2500); break;
            default: noise(.05);
        }
        const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; texCache.set(key, t); return t;
    }
    /** une boîte dont la texture garde sa taille réelle (un carreau = « tile » mètres), quelle que soit la taille de la boîte */
    function box(w, h, d, mat, tile = 1) {
        const geo = new T.BoxGeometry(w, h, d), uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
        for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
        return new T.Mesh(geo, mat);
    }
    const matCache = new Map();
    const mat = (color, kind = '', opts = {}) => { const key = `${color}|${kind}|${JSON.stringify(opts)}`; if (!matCache.has(key)) matCache.set(key, new T.MeshStandardMaterial({color: kind ? '#ffffff' : color, map: kind ? tex(kind, color) : null, roughness: .85, metalness: 0, ...opts})); return matCache.get(key); };

    /* ═════════ Les meubles en volume ═════════ */
    /* les pieds qu'on peut ajouter à un objet : [hauteur (m), épaisseur, forme] */
    const FEET = {droits: [.12, .045, 'box'], tournes: [.15, .05, 'turn'], boules: [.07, .06, 'ball'], patins: [.035, .07, 'box'], roulettes: [.07, .045, 'wheel']};
    const NO_FEET = new Set(['rug', 'rugR', 'img', 'stairs', 'stairsL', 'spiral', 'tree', 'conifer', 'animal', 'hedge', 'flowerbed', 'garden', 'pond', 'hatch', 'mirror', 'frame', 'cross']);
    function furniture(it, L) {
        let g = new T.Group(); const w = M(it.w), d = M(it.d), h0 = M(it.h ?? L?.[5] ?? 80), col = it.color || L?.[6] || '#9a8a7a', shape = it.s3 || (it.img ? 'img' : L?.[8] || L?.[7] || 'box'); // la forme en volume : celle de l'objet créé, sinon celle du catalogue (heritage-house-lib.js en ajoute)
        // personnalisation : matière (bois, cuivre, fonte…), deuxième couleur (pieds, poignées, détails), pieds, coins arrondis
        const OM = it.matl ? ext.houseLib?.OBJ_MATS?.find(q => q[0] === it.matl) : null, col2 = /^#[0-9a-f]{6}$/i.test(it.color2 || '') ? it.color2 : '';
        const fm = (c, k = '', o = {}) => OM && c === col && !k ? mat(c, OM[3] || '', {metalness: OM[4], roughness: OM[5], ...(OM[6] < 1 ? {transparent: true, opacity: OM[6]} : {}), ...o}) : mat(c, k, o);
        const ft = FEET[it.feet] && !NO_FEET.has(shape) ? FEET[it.feet] : null, fh = ft ? Math.min(ft[0], h0 * .4) : 0, h = h0 - fh, rad = clamp(Number(it.rad) || 0, 0, 50) / 100;
        const put = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; }, B = (ww, hh, dd, c = col, x = 0, y = hh / 2, z = 0) => put(box(ww, hh, dd, fm(c)), x, y, z);
        const C = (r, hh, c = col, x = 0, y = hh / 2, z = 0, seg = 24) => put(new T.Mesh(new T.CylinderGeometry(r, r, hh, seg), fm(c)), x, y, z);
        const legs = (top, lw = .05) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => B(lw, top, lw, col2 || col, sx * (w / 2 - lw), top / 2, sz * (d / 2 - lw)));
        /** un plateau (ou un bloc) aux coins arrondis */
        const RB = (ww, hh, dd, c, y0) => { const r = Math.min(ww, dd) * rad, x = ww / 2, z = dd / 2, sh = new T.Shape(); sh.moveTo(-x + r, -z); sh.lineTo(x - r, -z); sh.quadraticCurveTo(x, -z, x, -z + r); sh.lineTo(x, z - r); sh.quadraticCurveTo(x, z, x - r, z); sh.lineTo(-x + r, z); sh.quadraticCurveTo(-x, z, -x, z - r); sh.lineTo(-x, -z + r); sh.quadraticCurveTo(-x, -z, -x + r, -z);
            const geo = new T.ExtrudeGeometry(sh, {depth: hh, bevelEnabled: false, curveSegments: 8}); geo.rotateX(-Math.PI / 2); return put(new T.Mesh(geo, fm(c)), 0, y0, 0); };
        const top = (th) => rad > 0 ? RB(w, th, d, col, h - th) : B(w, th, d, col, 0, h - th / 2);
        switch (shape) {
            case 'bed1': case 'bed2': B(w, .35, d); B(w - .04, .18, d - .12, '#f4efe4', 0, .44, .04); B(w, Math.max(.6, h + .45), .06, col, 0, Math.max(.6, h + .45) / 2, -d / 2 + .03); if (shape === 'bed2') { B(w / 2 - .08, .1, .3, '#ffffff', -w / 4, .58, -d / 2 + .25); B(w / 2 - .08, .1, .3, '#ffffff', w / 4, .58, -d / 2 + .25); } else B(w - .12, .1, .3, '#ffffff', 0, .58, -d / 2 + .25); break;
            case 'litclos': B(w, h, d); B(w * .7, h * .5, .02, '#2a1a10', 0, h * .5, d / 2 + .005); break;
            case 'table': case 'desk': top(.04); legs(h - .04); break;
            case 'box': if (rad > 0) RB(w, h, d, col, 0); else B(w, h, d); break;
            case 'round': C(Math.min(w, d) / 2, .04, col, 0, h - .02); C(.05, h - .04); C(Math.min(w, d) / 4, .03, col, 0, .015); break;
            case 'chair': B(w, .05, d * .9, col, 0, .45, d * .05); B(w, h - .45, .04, col, 0, .45 + (h - .45) / 2, -d / 2 + .02); legs(.45, .035); break;
            case 'armchair': case 'sofa': B(w, .42, d); B(w, h, .18, col, 0, h / 2, -d / 2 + .09); B(.14, .62, d, col, -w / 2 + .07, .31); B(.14, .62, d, col, w / 2 - .07, .31); break;
            case 'clock': B(w, h, d); put(new T.Mesh(new T.CircleGeometry(Math.min(w, d) * .4, 24), mat('#f6f0de')), 0, h * .82, d / 2 + .002); break;
            case 'fireplace': B(w, .12, d, col, 0, h - .06); B(.2, h - .12, d, col, -w / 2 + .1, (h - .12) / 2); B(.2, h - .12, d, col, w / 2 - .1, (h - .12) / 2); B(w - .4, h - .12, .05, '#2a2420', 0, (h - .12) / 2, -d / 2 + .03); break;
            case 'stove': case 'range': B(w, h, d); C(.07, 1.6, '#2a2a2a', 0, h + .8, -d / 4); break;
            case 'sink': case 'basin': B(w, h, d); B(w * .7, .02, d * .6, '#f6f6f6', 0, h + .005); break;
            case 'bath': B(w, h, d, '#f4f4f4'); B(w - .12, .02, d - .12, '#dfe9ef', 0, h + .005); break;
            case 'shower': B(w, .06, d, '#e6eef2'); put(box(.01, 1.9, d, new T.MeshStandardMaterial({color: '#cfe6f3', transparent: true, opacity: .35})), w / 2, 1, 0); break;
            case 'wc': C(Math.min(w, d) * .45, .42, '#f4f4f4', 0, .21, d * .1); B(w * .9, .45, .18, '#f4f4f4', 0, .62, -d / 2 + .09); break;
            case 'rug': B(w, .01, d, col, 0, .005); break;
            case 'plant': C(.15, .3, '#8a5a32', 0, .15); put(new T.Mesh(new T.SphereGeometry(Math.min(w, d) * .55, 16, 12), mat(col)), 0, h * .7, 0); break;
            case 'tree': C(.18, h * .45, '#6a4a2a', 0, h * .225); put(new T.Mesh(new T.SphereGeometry(Math.min(w, d) * .5, 16, 12), mat(col)), 0, h * .65, 0); break;
            case 'roundsmall': C(.03, h, '#444', 0, h / 2); put(new T.Mesh(new T.ConeGeometry(Math.min(w, d) / 2, .3, 16, 1, true), mat(col)), 0, h - .1, 0); break;
            case 'barrel': C(Math.min(w, d) / 2, h); break;
            case 'wheel': put(new T.Mesh(new T.TorusGeometry(Math.min(w, d) * .38, .02, 8, 32), mat(col)), -w * .1, h * .62, 0).rotation.y = Math.PI / 2; B(w * .5, .05, .1, col, w * .2, h * .3); break;
            case 'loom': [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => B(.08, h, .08, col, sx * (w / 2 - .04), h / 2, sz * (d / 2 - .04))); B(w, .08, .08, col, 0, h - .04, -d / 2 + .04); B(w, .08, .08, col, 0, .8, d / 2 - .04); break;
            case 'cart': B(w * .8, .3, d, col, w * .1, .8); [-1, 1].forEach(s => { put(new T.Mesh(new T.TorusGeometry(.6, .05, 8, 24), mat('#3a2a1a')), w * .1, .6, s * (d / 2 + .05)); }); B(w * .25, .06, .08, col, -w * .4, .8); break;
            case 'well': put(new T.Mesh(new T.CylinderGeometry(Math.min(w, d) / 2, Math.min(w, d) / 2, .9, 24, 1, true), mat('#a9a296', 'pierre', {side: T.DoubleSide})), 0, .45, 0); B(.1, 1.8, .1, '#6a4a2a', -w / 2 + .1, .9); B(.1, 1.8, .1, '#6a4a2a', w / 2 - .1, .9); B(w, .1, .1, '#6a4a2a', 0, 1.8); break;
            case 'car': B(w, .7, d, col, 0, .55); B(w * .55, .5, d * .92, col, -w * .05, 1.15); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => { const m = C(.33, .22, '#1a1a1a', sx * w * .32, .33, sz * d / 2, 20); m.rotation.x = Math.PI / 2; }); break;
            case 'stairs': { const n = Math.max(6, Math.round(h / .18)), sd = d / n; for (let i = 0; i < n; i++) B(w, (i + 1) * h / n, sd, col, 0, (i + 1) * h / n / 2, d / 2 - sd * (i + .5)); break; }
            case 'stairsL': { const n = 12; for (let i = 0; i < n; i++) { const a = Math.PI + i * Math.PI / 2 / n, m = B(Math.min(w, d) * .5, (i + 1) * h / n, .22, col, 0, (i + 1) * h / n / 2, 0); m.position.set(Math.cos(a) * w * .25 + w * .25, (i + 1) * h / n / 2, Math.sin(a) * d * .25 + d * .25); m.rotation.y = -a; } break; }
            case 'img': { const m = box(w, Math.max(.02, h), d, [mat(col), mat(col), new T.MeshStandardMaterial({map: new T.TextureLoader().load(it.img)}), mat(col), mat(col), mat(col)]); m.position.y = Math.max(.02, h) / 2; g.add(m); break; }
            case 'piano': B(w, h, d); B(w, .05, d * .4, '#f4f4f4', 0, h * .55, d / 2 + d * .2); break;
            default: if (!ext.houseFurnitureX?.(shape, {T, g, B, C, put, legs, box, mat: fm, w, d, h, col, col2, it})) { if (rad > 0) RB(w, h, d, col, 0); else B(w, h, d); }
        }
        if (shape !== 'img') ext.houseMergeByMaterial?.(T, g); // ⚡ les volumes de même matière fondus en un seul (heritage-house-more.js) : bien plus fluide avec beaucoup de meubles
        try { ext.housePics?.decorate?.(T, g, it); } catch (_) {} // 🖼 l'image choisie dans les médias, posée sur la toile ou le cadre (heritage-house-pics.js)
        if (ft) { // les pieds : l'objet monte d'autant
            const out = new T.Group(), fc = col2 || '#' + new T.Color(col).multiplyScalar(.6).getHexString(), fw = Math.min(ft[1], w * .2, d * .2), ins = fw * .9;
            g.position.y = fh; out.add(g);
            [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { const px = a * (w / 2 - ins), pz = b * (d / 2 - ins); let me;
                if (ft[2] === 'ball') { me = new T.Mesh(new T.SphereGeometry(fw * .6, 14, 10), mat(fc)); me.scale.y = fh / (fw * 1.2); me.position.set(px, fh / 2, pz); }
                else if (ft[2] === 'turn') { me = new T.Mesh(new T.CylinderGeometry(fw * .55, fw * .25, fh, 14), mat(fc)); me.position.set(px, fh / 2, pz); }
                else if (ft[2] === 'wheel') { me = new T.Mesh(new T.SphereGeometry(fh * .45, 12, 8), mat('#222222')); me.position.set(px, fh * .45, pz); }
                else { me = box(fw, fh, fw, mat(fc)); me.position.set(px, fh / 2, pz); }
                out.add(me); });
            g = out;
        }
        return g;
    }

    /* ═════════ Lire les fichiers 3D : OBJ, MTL, STL, glTF, GLB ═════════ */
    function parseMTL(text) { const out = {}; let cur = null; String(text || '').split('\n').forEach(l => { const p = l.trim().split(/\s+/); if (p[0] === 'newmtl') { cur = p.slice(1).join(' '); out[cur] = {}; } else if (cur && p[0] === 'Kd') out[cur].color = new T.Color(+p[1], +p[2], +p[3]); else if (cur && p[0] === 'd') out[cur].opacity = +p[1]; }); return out; }
    function parseOBJ(text, mtl = {}) {
        const v = [], vn = [], groups = new Map(); let cur = 'défaut';
        const get = () => { if (!groups.has(cur)) groups.set(cur, {pos: [], nor: []}); return groups.get(cur); };
        for (const raw of String(text).split('\n')) {
            const l = raw.trim(); if (!l || l[0] === '#') continue; const p = l.split(/\s+/);
            if (p[0] === 'v') v.push([+p[1], +p[2], +p[3]]); else if (p[0] === 'vn') vn.push([+p[1], +p[2], +p[3]]);
            else if (p[0] === 'usemtl') cur = p.slice(1).join(' ');
            else if (p[0] === 'f') { const idx = p.slice(1).map(s => { const [a, , c] = s.split('/').map(Number); return [a < 0 ? v.length + a : a - 1, c ? (c < 0 ? vn.length + c : c - 1) : -1]; }); const gg = get();
                for (let k = 1; k + 1 < idx.length; k++) [idx[0], idx[k], idx[k + 1]].forEach(([a, c]) => { const q = v[a]; if (!q) return; gg.pos.push(...q); if (c >= 0 && vn[c]) gg.nor.push(...vn[c]); }); }
        }
        const root = new T.Group();
        groups.forEach((gg, name) => { if (!gg.pos.length) return; const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(gg.pos, 3)); if (gg.nor.length === gg.pos.length) geo.setAttribute('normal', new T.Float32BufferAttribute(gg.nor, 3)); else geo.computeVertexNormals();
            const m = mtl[name]; root.add(new T.Mesh(geo, new T.MeshStandardMaterial({color: m?.color || '#b9b2a6', roughness: .8, transparent: (m?.opacity ?? 1) < 1, opacity: m?.opacity ?? 1, side: T.DoubleSide}))); });
        return root;
    }
    function parseSTL(buf) {
        const dv = new DataView(buf), n = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0, pos = [];
        if (84 + n * 50 === buf.byteLength) { for (let i = 0; i < n; i++) { const o = 84 + i * 50 + 12; for (let k = 0; k < 9; k++) pos.push(dv.getFloat32(o + k * 4, true)); } }
        else { const t = new TextDecoder().decode(buf); for (const m of t.matchAll(/vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g)) pos.push(+m[1], +m[2], +m[3]); }
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
        const g = new T.Group(); g.add(new T.Mesh(geo, new T.MeshStandardMaterial({color: '#b9b2a6', roughness: .7}))); g.rotation.x = -Math.PI / 2; const w = new T.Group(); w.add(g); return w; // STL : Z vers le haut
    }
    async function parseGLTF(buf, isGlb) {
        let json, bin = null;
        if (isGlb) { const dv = new DataView(buf); let off = 12; while (off < buf.byteLength) { const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true), chunk = buf.slice(off + 8, off + 8 + len); if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(chunk)); else if (type === 0x004E4942) bin = chunk; off += 8 + len; } }
        else json = JSON.parse(new TextDecoder().decode(buf));
        const buffers = await Promise.all((json.buffers || []).map(async (b, i) => { if (!b.uri) return bin; if (/^data:/.test(b.uri)) return (await fetch(b.uri)).arrayBuffer(); throw new Error('Ce glTF utilise des fichiers à part : exporte-le plutôt en GLB (un seul fichier).'); void i; }));
        const COMP = {5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4]}, SIZE = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16};
        const accessor = i => { const a = json.accessors[i], bv = json.bufferViews[a.bufferView], [Arr, bytes] = COMP[a.componentType], n = SIZE[a.type], stride = bv.byteStride || n * bytes, base = (bv.byteOffset || 0) + (a.byteOffset || 0), buf2 = buffers[bv.buffer];
            if (stride === n * bytes) return new Arr(buf2, base, a.count * n).slice();
            const out = new Arr(a.count * n), dv = new DataView(buf2); for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) { const o = base + k * stride + c * bytes; out[k * n + c] = bytes === 4 ? (a.componentType === 5126 ? dv.getFloat32(o, true) : dv.getUint32(o, true)) : bytes === 2 ? dv.getUint16(o, true) : dv.getUint8(o); } return out; };
        const texCache2 = new Map();
        const texture = async ti => { if (texCache2.has(ti)) return texCache2.get(ti); const t = json.textures[ti], im = json.images[t.source]; let url;
            if (im.bufferView !== undefined) { const bv = json.bufferViews[im.bufferView]; url = URL.createObjectURL(new Blob([new Uint8Array(buffers[bv.buffer], bv.byteOffset || 0, bv.byteLength)], {type: im.mimeType || 'image/png'})); } else if (/^data:image\//.test(im.uri || '')) url = im.uri; else return null;
            const tx = await new T.TextureLoader().loadAsync(url); tx.flipY = false; tx.colorSpace = T.SRGBColorSpace; texCache2.set(ti, tx); return tx; };
        const materials = await Promise.all((json.materials || []).map(async m => { const pbr = m.pbrMetallicRoughness || {}, f = pbr.baseColorFactor || [1, 1, 1, 1];
            return new T.MeshStandardMaterial({color: new T.Color(f[0], f[1], f[2]), opacity: f[3], transparent: f[3] < 1 || m.alphaMode === 'BLEND', map: pbr.baseColorTexture ? await texture(pbr.baseColorTexture.index) : null, roughness: pbr.roughnessFactor ?? .8, metalness: pbr.metallicFactor ?? 0, side: m.doubleSided ? T.DoubleSide : T.FrontSide}); }));
        const meshOf = mi => { const g = new T.Group(); (json.meshes[mi].primitives || []).forEach(p => { if (p.mode !== undefined && p.mode !== 4) return; const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(new Float32Array(accessor(p.attributes.POSITION)), 3));
            if (p.attributes.NORMAL !== undefined) geo.setAttribute('normal', new T.BufferAttribute(new Float32Array(accessor(p.attributes.NORMAL)), 3)); if (p.attributes.TEXCOORD_0 !== undefined) geo.setAttribute('uv', new T.BufferAttribute(new Float32Array(accessor(p.attributes.TEXCOORD_0)), 2));
            if (p.indices !== undefined) geo.setIndex(new T.BufferAttribute(new Uint32Array(accessor(p.indices)), 1)); if (p.attributes.NORMAL === undefined) geo.computeVertexNormals();
            g.add(new T.Mesh(geo, materials[p.material] || new T.MeshStandardMaterial({color: '#b9b2a6'}))); }); return g; };
        const nodeOf = ni => { const n = json.nodes[ni], g = n.mesh !== undefined ? meshOf(n.mesh) : new T.Group();
            if (n.matrix) { g.applyMatrix4(new T.Matrix4().fromArray(n.matrix)); } else { if (n.translation) g.position.fromArray(n.translation); if (n.rotation) g.quaternion.fromArray(n.rotation); if (n.scale) g.scale.fromArray(n.scale); }
            (n.children || []).forEach(c => g.add(nodeOf(c))); return g; };
        const root = new T.Group(), sc = json.scenes?.[json.scene || 0]; (sc?.nodes || json.nodes?.map((_, i) => i) || []).forEach(ni => root.add(nodeOf(ni)));
        return root;
    }
    async function parseModel(buf, extn, mtlText = '') { await three(); extn = extn.toLowerCase(); if (extn === 'obj') return parseOBJ(new TextDecoder().decode(buf), parseMTL(mtlText)); if (extn === 'stl') return parseSTL(buf); if (extn === 'glb' || extn === 'gltf') return parseGLTF(buf, extn === 'glb'); throw new Error('Format 3D inconnu.'); }
    /** la taille d'un modèle en centimètres (l'unité est devinée : mètres, centimètres ou millimètres) */
    const unitScale = (s, fmt = '') => { const m = Math.max(s.x, s.y, s.z); if (fmt === 'stl') return m > 50 ? .1 : m < 5 ? 100 : 1; return m < 20 ? 100 : m > 2000 ? .1 : 1; }; // un STL est presque toujours en millimètres
    const inspect = async (file, mtlFile) => inspectBuf(await file.arrayBuffer(), file.name.split('.').pop(), mtlFile ? await mtlFile.text() : '');
    /** mesurer un modèle déjà rangé (bibliothèque en ligne, pack ZIP) : sa taille en cm et une vignette */
    async function inspectBuf(buf, extn, mtlText = '') {
        await three();
        const obj = await parseModel(buf, extn, mtlText);
        const bb = new T.Box3().setFromObject(obj), s = bb.getSize(new T.Vector3()), k = unitScale(s, String(extn).toLowerCase());
        let thumb = '';
        try { const r = new T.WebGLRenderer({antialias: true, preserveDrawingBuffer: true, alpha: true}); r.setSize(160, 160); const sc = new T.Scene(); sc.add(new T.HemisphereLight('#ffffff', '#666666', 2.4)); const dl = new T.DirectionalLight('#ffffff', 1.4); dl.position.set(2, 3, 2); sc.add(dl); sc.add(obj);
            const c = bb.getCenter(new T.Vector3()), R = Math.max(s.x, s.y, s.z) || 1, cam = new T.PerspectiveCamera(35, 1, R / 100, R * 20); cam.position.set(c.x + R * 1.4, c.y + R * 1.1, c.z + R * 1.6); cam.lookAt(c); r.render(sc, cam); thumb = r.domElement.toDataURL('image/png'); r.dispose(); } catch (_) {}
        return {dims: {w: s.x * k, d: s.z * k, h: s.y * k}, thumb};
    }
    const modelCache = new Map();
    async function loadModel(ref) {
        const key = `${ref.id}|${ref.mtl || ''}`; if (!modelCache.has(key)) modelCache.set(key, (async () => {
            const buf = await (await fetch(`api.php?action=house_model&id=${ref.id}`)).arrayBuffer(); const mtl = ref.mtl ? await (await fetch(`api.php?action=house_model&id=${ref.mtl}`)).text() : '';
            return parseModel(buf, ref.ext, mtl); })());
        const src = await modelCache.get(key); return src.clone(true);
    }

    /* ═════════ ✦ Souvenirs, 💡 lampes, ☀️ soleil ═════════ */
    let memTex = null;
    /** le repère ✦ d'un souvenir posé (même dessin en 2D et en 3D) */
    function memSprite() {
        if (!memTex) { const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d');
            x.fillStyle = '#c9962a'; x.beginPath(); x.arc(48, 48, 40, 0, Math.PI * 2); x.fill(); x.lineWidth = 7; x.strokeStyle = '#fff'; x.stroke();
            x.fillStyle = '#fff'; x.font = '700 50px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('✦', 48, 51);
            memTex = new T.CanvasTexture(c); memTex.colorSpace = T.SRGBColorSpace; }
        const sp = new T.Sprite(new T.SpriteMaterial({map: memTex, transparent: true, depthTest: false})); sp.scale.set(.34, .34, 1); sp.renderOrder = 12; return sp;
    }
    /** une lampe, une bougie, un lustre… : elle s'allume la nuit */
    const isLamp = it => { const s = `${it.kind || ''} ${it.s2 || ''} ${it.s3 || ''} ${it.name || ''}`; return /lamp|lustre|bougie|cierge|chandel|lantern|applique|petrole|pétrole|suspension|quinquet|candle/i.test(s) && !/tsf|radio/i.test(s); };
    const DEG = Math.PI / 180, FRANCE = {lat: 46.6, lon: 2.4, def: true};
    /** le fuseau (heure légale) : la France métropolitaine (UTC+1, +2 de fin mars à fin octobre), ailleurs approché par la longitude */
    const tzOf = (lat, lon, day) => { const summer = day >= 87 && day <= 300; if (lat > 41 && lat < 51.5 && lon > -5.5 && lon < 10) return summer ? 2 : 1; const z = Math.round(lon / 15); return z + (lat > 30 && summer ? 1 : 0); };
    /** ☀️ la place du soleil : hauteur et azimut (depuis le nord, sens des aiguilles d'une montre), lever et coucher (heure légale) */
    function sunAt({lat = FRANCE.lat, lon = FRANCE.lon, day = 172, hour = 14} = {}) {
        const tz = tzOf(lat, lon, day), B = 2 * Math.PI * (day - 81) / 364, eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
        const corr = -tz + lon / 15 + eot / 60, Hh = (hour + corr - 12) * 15 * DEG, dec = 23.44 * DEG * Math.sin(2 * Math.PI * (284 + day) / 365), phi = lat * DEG;
        const alt = Math.asin(clamp(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(Hh), -1, 1));
        const az = (Math.atan2(Math.sin(Hh), Math.cos(Hh) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI) % (2 * Math.PI);
        const c0 = (Math.sin(-.833 * DEG) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)), H0 = c0 >= 1 ? null : c0 <= -1 ? 'jour' : Math.acos(c0) / DEG / 15;
        return {alt, az, tz, rise: typeof H0 === 'number' ? 12 - H0 - corr : null, set: typeof H0 === 'number' ? 12 + H0 - corr : null, polar: c0 >= 1 ? 'nuit' : c0 <= -1 ? 'jour' : ''};
    }
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dayLabel = d => { const dt = new Date(Date.UTC(2023, 0, 1) + (clamp(Math.round(d), 1, 365) - 1) * 864e5); return `${dt.getUTCDate() === 1 ? '1er' : dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`; };
    const hourLabel = h => { h = ((h % 24) + 24) % 24; const m = Math.round((h % 1) * 60); return `${Math.floor(h) + (m === 60 ? 1 : 0)} h ${String(m === 60 ? 0 : m).padStart(2, '0')}`; };
    const dirName = az => ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'][Math.round(((az / DEG) % 360) / 45) % 8];
    const dayOfYear = (dt = new Date()) => Math.min(365, Math.floor((Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()) - Date.UTC(dt.getFullYear(), 0, 1)) / 864e5) + 1);
    const SUN0 = {north: 0, hour: 15, day: 172, shadows: true};
    const sunOf = H => ({...SUN0, ...(H.sun && typeof H.sun === 'object' ? H.sun : {})});
    /* ═════════ La maison construite ═════════ */
    function floorBase(H, f) { const fl = [...H.floors].sort((a, b) => a.level - b.level); let y = 0; if (f.level >= 0) { for (const q of fl) if (q.level >= 0 && q.level < f.level) y += M(q.height) + M(H.slab ?? 20); } else { for (const q of fl) if (q.level < 0 && q.level >= f.level) y -= M(q.height) + M(H.slab ?? 20); } return y; }
    /** le revêtement d'une face de mur : [couleur, texture] ; side '' = le mur entier, 'l' / 'r' = un côté (sinon celui du mur) */
    function wallFace(w, side) {
        const W = ext.houseLib?.WALL_MATS || [], k = (side && w[side + 'Mat']) || w.mat || 'platre', base = W.find(m => m[0] === k)?.[2] || '#eeeeee';
        const c = side ? (w[side + 'Color'] || (w[side + 'Mat'] ? base : w.color || base)) : (w.color || base); return [c, k];
    }
    function buildFloor(H, f, {cut = false, ceil = false} = {}) {
        const g = new T.Group(), L = ext.houseLib, base = floorBase(H, f), fh = M(f.height);
        g.position.y = base;
        // les sols des pièces (ou une dalle sous les murs)
        const slabs = f.rooms.length ? f.rooms : [];
        slabs.forEach(rm => { const sh = new T.Shape(rm.pts.map(p => new T.Vector2(M(p[0]), M(p[1])))); const geo = new T.ShapeGeometry(sh); const pos = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 1.2, pos.getY(i) / 1.2);
            const fm = L.FLOOR_MATS.find(m => m[0] === (rm.floor || 'parquet')), m = new T.Mesh(geo, mat(rm.color || fm?.[2] || '#b98b5c', rm.floor || 'parquet', {side: T.DoubleSide})); m.rotation.x = Math.PI / 2; m.position.y = .005; m.receiveShadow = true; g.add(m); });
        if (!slabs.length && f.walls.length) { const xs = f.walls.flatMap(w => [w.a[0], w.b[0]]), zs = f.walls.flatMap(w => [w.a[1], w.b[1]]), x0 = M(Math.min(...xs)), x1 = M(Math.max(...xs)), z0 = M(Math.min(...zs)), z1 = M(Math.max(...zs)); const m = box(x1 - x0, .05, z1 - z0, mat('#c9bfae', 'beton'), 1.2); m.position.set((x0 + x1) / 2, -.025, (z0 + z1) / 2); g.add(m); }
        // les murs, percés de leurs portes et fenêtres
        f.walls.forEach(w => {
            const ax = M(w.a[0]), az = M(w.a[1]), bx = M(w.b[0]), bz = M(w.b[1]), len = Math.hypot(bx - ax, bz - az); if (len < .01) return;
            const t = M(w.t || f.wallT), wh = cut ? Math.min(1.1, M(w.h || f.height)) : M(w.h || f.height), ang = Math.atan2(bz - az, bx - ax), material = mat(...wallFace(w, ''));
            // 🧱 chaque face a son revêtement : « l » = côté gauche du mur (sa normale (−dy, dx) sur le plan = la face +z de la boîte), « r » = l'autre côté
            const tile = 1.1 * clamp(Number(w.tsc) || 100, 20, 400) / 100, faces = [material, material, material, material, mat(...wallFace(w, 'l')), mat(...wallFace(w, 'r'))];
            const holes = f.openings.filter(o => o.wall === w.id).map(o => ({s: o.pos * len - M(o.w) / 2, e: o.pos * len + M(o.w) / 2, y0: o.type === 'window' ? M(o.sill ?? 90) : 0, y1: (o.type === 'window' ? M(o.sill ?? 90) : 0) + M(o.h), o})).sort((a, b) => a.s - b.s);
            const piece = (s, e, y0, y1) => { if (e - s < .005 || y1 - y0 < .005) return; const m = box(e - s, y1 - y0, t + .002, faces, tile); const mid = (s + e) / 2; m.position.set(ax + Math.cos(ang) * mid, y0 + (y1 - y0) / 2, az + Math.sin(ang) * mid); m.rotation.y = -ang; m.castShadow = m.receiveShadow = true; g.add(m); };
            // le mur ne déborde de la moitié de son épaisseur que là où il rejoint un autre mur (l'angle se ferme) : un bout libre garde sa vraie longueur
            const joined = p => f.walls.some(q => q !== w && [q.a, q.b].some(c => Math.abs(c[0] - p[0]) < .5 && Math.abs(c[1] - p[1]) < .5));
            const ext0 = joined(w.a) ? t / 2 : 0, ext1 = joined(w.b) ? t / 2 : 0;
            let cur2 = -ext0;
            holes.forEach(hh => { piece(cur2, hh.s, 0, wh); piece(hh.s, hh.e, 0, Math.min(wh, hh.y0)); piece(hh.s, hh.e, Math.min(wh, hh.y1), wh);
                // la menuiserie : une vitre et son cadre, ou une porte
                const mid = (hh.s + hh.e) / 2, cx = ax + Math.cos(ang) * mid, cz = az + Math.sin(ang) * mid, ow = hh.e - hh.s, oh = Math.min(wh, hh.y1) - hh.y0;
                if (oh > .05) { if (hh.o.type === 'window') { const glass = box(ow, oh, .02, new T.MeshStandardMaterial({color: '#bcd8e8', transparent: true, opacity: .35, roughness: .1})); glass.position.set(cx, hh.y0 + oh / 2, cz); glass.rotation.y = -ang; g.add(glass); const fr = box(ow, .05, t * .6, mat('#e8e2d6')); fr.position.set(cx, hh.y0 + .025, cz); fr.rotation.y = -ang; g.add(fr); }
                    else if (hh.o.style !== 'arche') { const door = box(ow - .02, oh - .01, .04, mat(hh.o.style === 'grange' ? '#6a4a2a' : '#8a5a32', 'lambris'), .8); const sg = hh.o.flip ? -1 : 1, hinge = hh.o.swing === 'right' ? 1 : -1, open = .9; // la porte entrouverte
                        const pivot = new T.Group(); pivot.position.set(ax + Math.cos(ang) * (mid + hinge * ow / 2), hh.y0, az + Math.sin(ang) * (mid + hinge * ow / 2)); pivot.rotation.y = -ang + hinge * sg * open; door.position.set(-hinge * (ow - .02) / 2, (oh - .01) / 2, 0); pivot.add(door); g.add(pivot); } }
                cur2 = hh.e; });
            piece(cur2, len + ext1, 0, wh);
        });
        // les meubles
        f.items.forEach(it => { const Lb = L.libOf(it.kind), m = furniture(it, Lb); m.userData.hsItem = it.id; m.position.set(M(it.x), M(it.elev || 0), M(it.y)); m.rotation.y = -(it.rot || 0) * Math.PI / 180; m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); g.add(m);
            if (it.model) loadModel(it.model).then(obj => { const bb = new T.Box3().setFromObject(obj), s = bb.getSize(new T.Vector3()), c = bb.getCenter(new T.Vector3()); obj.position.sub(new T.Vector3(c.x, bb.min.y, c.z)); const wrap = new T.Group(); wrap.add(obj); wrap.scale.set(M(it.w) / (s.x || 1), M(it.h ?? 80) / (s.y || 1), M(it.d) / (s.z || 1)); m.clear(); m.add(wrap); wrap.traverse(o => { if (o.isMesh) o.castShadow = true; }); }).catch(() => {}); });
        // ✦ les souvenirs posés sur un meuble ou dans une pièce (un clic : la photo, le récit) ; 💡 les lampes (allumées la nuit)
        const lamps = [];
        f.items.forEach(it => { const top = M((it.elev || 0) + Number(it.h ?? L.libOf(it.kind)?.[5] ?? 80));
            if (Array.isArray(it.mem) && it.mem.length) { const sp = memSprite(); sp.position.set(M(it.x), top + .28, M(it.y)); sp.userData.mem = {type: 'item', id: it.id, floor: f.id}; g.add(sp); }
            if (isLamp(it)) lamps.push(new T.Vector3(M(it.x), Math.max(.3, top - .08), M(it.y))); });
        f.rooms.forEach(rm => { if (!Array.isArray(rm.mem) || !rm.mem.length || !rm.pts?.length) return; const xs = rm.pts.map(p => p[0]), ys = rm.pts.map(p => p[1]);
            const sp = memSprite(); sp.position.set(M((Math.min(...xs) + Math.max(...xs)) / 2), Math.min(1.9, fh - .25), M((Math.min(...ys) + Math.max(...ys)) / 2)); sp.userData.mem = {type: 'room', id: rm.id, floor: f.id}; g.add(sp); });
        // 🪵 le plafond (pendant la visite) : uni, ou avec ses poutres apparentes
        if (ceil && f.ceil && f.ceil !== 'none') { const cc = /^#[0-9a-f]{6}$/i.test(f.ceilColor || '') ? f.ceilColor : '#f1ece2';
            (f.rooms.length ? f.rooms : []).forEach(rm => { if (!rm.pts?.length) return; const geo = new T.ShapeGeometry(new T.Shape(rm.pts.map(p => new T.Vector2(M(p[0]), M(p[1]))))); const m = new T.Mesh(geo, mat(cc, 'platre', {side: T.DoubleSide})); m.rotation.x = Math.PI / 2; m.position.y = fh - .01; g.add(m);
                if (f.ceil === 'poutres') { const xs = rm.pts.map(p => M(p[0])), zs = rm.pts.map(p => M(p[1])), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs), alongX = x1 - x0 <= z1 - z0, span = alongX ? x1 - x0 : z1 - z0, run = alongX ? z1 - z0 : x1 - x0, n = Math.max(1, Math.floor(run / .65)), bm = mat('#6a4a2e', 'poutres');
                    for (let i = 1; i <= n; i++) { const b = box(alongX ? span : .14, .18, alongX ? .14 : span, bm, .9), off = (alongX ? z0 : x0) + run * i / (n + 1); b.position.set(alongX ? (x0 + x1) / 2 : off, fh - .1, alongX ? off : (z0 + z1) / 2); b.castShadow = true; g.add(b); } } }); }
        g.userData.lamps = lamps; g.userData.floorId = f.id;
        return g;
    }
    /** le toit : deux pans, quatre pans (croupe), pavillon, appentis (un pan), mansardé, plat (terrasse) ; pente, sens du faîtage, débord, couverture et couleurs, cheminée */
    const ROOF_COLORS = {tuiles: '#8a4b3a', tuilesplates: '#9a4a32', ardoises: '#4a5058', chaume: '#b8995a', zinc: '#9aa3a8', lauzes: '#7d7a72', bacacier: '#5b6670', vernies: '#9a3b23'};
    function buildRoof(H, top) {
        const r = H.roof || {}, xs = top.walls.flatMap(w => [w.a[0], w.b[0]]), zs = top.walls.flatMap(w => [w.a[1], w.b[1]]); if (!xs.length) return null;
        const ov = M(clamp(Number(r.over ?? 35), 0, 200)), X0 = M(Math.min(...xs)) - ov, X1 = M(Math.max(...xs)) + ov, Z0 = M(Math.min(...zs)) - ov, Z1 = M(Math.max(...zs)) + ov;
        const longX = X1 - X0 >= Z1 - Z0, along = r.axis === 'short' ? !longX : r.axis === 'x' ? true : r.axis === 'z' ? false : longX; // le faîtage suit la longueur (ou le sens choisi)
        const run = along ? X1 - X0 : Z1 - Z0, span = along ? Z1 - Z0 : X1 - X0, shape = r.shape || 'gable', pitch = clamp(Number(r.pitch ?? 40), 2, 75) * Math.PI / 180;
        const kind = ROOF_COLORS[r.kind] ? r.kind : 'tuiles', col = /^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : ROOF_COLORS[kind], y0 = floorBase(H, top) + M(top.height);
        const mRoof = mat(col, kind, {side: T.DoubleSide}), mWall = mat(/^#[0-9a-f]{6}$/i.test(r.gableColor || '') ? r.gableColor : '#e9e1cf', 'chaux', {side: T.DoubleSide});
        const g = new T.Group(), cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
        // repère local : u le long du faîtage, v en travers (centré), y vers le haut
        const P = (u, y, v) => along ? new T.Vector3(cx + u, y, cz + v) : new T.Vector3(cx + v, y, cz + u);
        const face = (pts, m) => { const geo = new T.BufferGeometry(), pos = [], uv = []; const tri = (a, b2, c) => [a, b2, c].forEach(q => { pos.push(q.x, q.y, q.z); uv.push((along ? q.x : q.z) / 1.1, (q.y + (along ? q.z : q.x)) / 1.1); });
            for (let i = 1; i < pts.length - 1; i++) tri(pts[0], pts[i], pts[i + 1]); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals(); const me = new T.Mesh(geo, m); me.castShadow = me.receiveShadow = true; g.add(me); };
        const hu = run / 2, hv = span / 2;
        /** d'un rectangle (bas) vers un rectangle plus petit ou une ligne de faîtage (haut) : 4 pans ; « ends » : pignons verticaux au lieu des pans des bouts */
        const ring = (lo, hi, yl, yh, ends) => { const L = lo.map(([u, v]) => P(u, yl, v)), Hh = hi.map(([u, v]) => P(u, yh, v));
            face([L[0], L[1], Hh[1], Hh[0]], mRoof); face([L[2], L[3], Hh[3], Hh[2]], mRoof); face([L[1], L[2], Hh[2], Hh[1]], ends ? mWall : mRoof); face([L[3], L[0], Hh[0], Hh[3]], ends ? mWall : mRoof); };
        const rect = (a, b2) => [[-a, -b2], [a, -b2], [a, b2], [-a, b2]];
        let ridgeY = y0;
        if (shape === 'flat') { const th = .25, slab = box(run, th, span, mRoof, 1.2); slab.position.copy(P(0, y0 + th / 2, 0)); if (!along) slab.rotation.y = Math.PI / 2; slab.castShadow = true; g.add(slab);
            if (r.parapet !== false) { const ph = .45, t = .12; [[run, t, 0, -hv + t / 2], [run, t, 0, hv - t / 2], [t, span, -hu + t / 2, 0], [t, span, hu - t / 2, 0]].forEach(([a, b2, u, v]) => { const m2 = box(along ? a : b2, ph, along ? b2 : a, mWall, 1); m2.position.copy(P(u, y0 + th + ph / 2, v)); g.add(m2); }); }
            ridgeY = y0 + .7; }
        else if (shape === 'shed') { const rise = Math.tan(pitch) * span; face([P(-hu, y0, -hv), P(hu, y0, -hv), P(hu, y0 + rise, hv), P(-hu, y0 + rise, hv)], mRoof); // un seul pan, haut côté « arrière »
            face([P(-hu, y0, -hv), P(-hu, y0 + rise, hv), P(-hu, y0, hv)], mWall); face([P(hu, y0, -hv), P(hu, y0 + rise, hv), P(hu, y0, hv)], mWall); face([P(-hu, y0, hv), P(hu, y0, hv), P(hu, y0 + rise, hv), P(-hu, y0 + rise, hv)], mWall); ridgeY = y0 + rise; }
        else if (shape === 'mansard') { const low = Math.tan(Math.max(pitch, 60 * Math.PI / 180)) , inset = Math.min(hv, hu) * .28, h1 = inset * low, top2 = Math.tan(Math.min(pitch, 30 * Math.PI / 180)) * (hv - inset);
            ring(rect(hu, hv), rect(hu - inset, hv - inset), y0, y0 + h1, false);
            const ru = Math.max(0, hu - inset - (hv - inset)); ring(rect(hu - inset, hv - inset), [[-ru, 0], [ru, 0], [ru, 0], [-ru, 0]], y0 + h1, y0 + h1 + top2, false); ridgeY = y0 + h1 + top2; }
        else { const rise = Math.tan(pitch) * hv, ru = shape === 'gable' ? hu : shape === 'pyramid' ? 0 : Math.max(0, hu - hv); // deux pans : faîtage d'un bout à l'autre ; croupe : raccourci ; pavillon : une pointe
            ring(rect(hu, hv), [[-ru, 0], [ru, 0], [ru, 0], [-ru, 0]], y0, y0 + rise, shape === 'gable'); ridgeY = y0 + rise; }
        // la cheminée
        if (r.chimney) { const cw = .55, ch = Math.max(.9, ridgeY - y0 + .7), pos = clamp(Number(r.chimneyPos ?? 30), 0, 100) / 100, u = -hu + ov + (run - 2 * ov) * pos, c = box(cw, ch, cw, mat('#a0826d', 'brique'), .8); c.position.copy(P(u, y0 + ch / 2, shape === 'shed' ? 0 : -hv * .25)); c.castShadow = true; g.add(c); }
        return g;
    }
    /** la vue 3D dans « box » : tourner, approcher, ☀️ lumière du jour, 🚶 visiter à la première personne
     *  o3 : {geo: {lat, lon}, onMemory({type, id, floor})} ; émet sur box2 « h3-roof », « h3-change » ({what: 'sun'|'walk'}), « h3-floor » ({fi}) */
    async function mount(box2, H, fi, o3 = {}) {
        await three();
        const W = () => box2.clientWidth || 800, Hh = () => box2.clientHeight || 600;
        const renderer = new T.WebGLRenderer({antialias: true, preserveDrawingBuffer: true}); renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.setSize(W(), Hh()); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.outputColorSpace = T.SRGBColorSpace;
        // la barre de la vue 3D est dans l'éditeur (pour pouvoir la ranger avec ⚙️ Personnaliser) ; sinon on la crée ici
        let bar = box2.parentElement?.querySelector('[data-h3bar]'), ownBar = false;
        if (!bar) { ownBar = true; box2.innerHTML = '<div class="h-hs-3dbar"><label class="checkbox-line"><input type="checkbox" data-h3="all" checked> Tous les étages</label><label class="checkbox-line"><input type="checkbox" data-h3="roof"> Toit</label><label class="checkbox-line"><input type="checkbox" data-h3="cut"> Murs coupés</label><label class="checkbox-line"><input type="checkbox" data-h3="dims"> Cotes</label><button type="button" class="button small secondary" data-h3="measure">📏 Mesurer</button><button type="button" class="button small secondary" data-h3="sun">☀️ Lumière</button><button type="button" class="button small secondary" data-h3="walk">🚶 Visiter</button><button type="button" class="button small secondary" data-h3="home">⌂ Vue d’ensemble</button></div>'; bar = box2.querySelector('.h-hs-3dbar'); }
        else { box2.innerHTML = ''; bar.hidden = false; bar.querySelectorAll('input[data-h3]').forEach(i => { i.checked = i.dataset.h3 === 'all'; }); bar.querySelectorAll('.is-on').forEach(b => b.classList.remove('is-on')); const wb = bar.querySelector('[data-h3="walk"]'); if (wb) wb.textContent = '🚶 Visiter'; }
        const barAc = new AbortController(), sig = {signal: barAc.signal};
        box2.appendChild(renderer.domElement);
        const scene = new T.Scene(); scene.background = new T.Color('#dfe8ef'); scene.fog = new T.Fog('#dfe8ef', 60, 220);
        const hemi = new T.HemisphereLight('#ffffff', '#8a7a66', 1.6); scene.add(hemi);
        const sun = new T.DirectionalLight('#fff4e0', 2.2); sun.position.set(18, 30, 12); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; Object.assign(sun.shadow.camera, {left: -30, right: 30, top: 30, bottom: -30, far: 160}); scene.add(sun); scene.add(sun.target);
        const groundMat = new T.MeshStandardMaterial({color: '#a9b88f', roughness: 1}), ground = new T.Mesh(new T.PlaneGeometry(400, 400), groundMat); ground.rotation.x = -Math.PI / 2; ground.position.y = -.06; ground.receiveShadow = true; scene.add(ground);
        const cam = new T.PerspectiveCamera(50, W() / Hh(), .05, 500);
        let house = new T.Group(); scene.add(house);
        const opts = {all: true, roof: !!H.roof?.on, cut: false, dims: false}; // pas de toit tant qu'on ne l'a pas demandé
        bar.querySelector('[data-h3="roof"]').checked = opts.roof;
        let target = new T.Vector3(), dist = 20, yaw = .8, pitch = .7, walk = false, fiCur = fi, Hcur = H, geo = o3.geo && Number.isFinite(+o3.geo.lat) && Number.isFinite(+o3.geo.lon) ? {lat: +o3.geo.lat, lon: +o3.geo.lon} : null;
        let lampLights = [], bulbs = [];
        const emit = (type, detail = {}) => box2.dispatchEvent(new CustomEvent(type, {bubbles: true, detail}));
        function rebuild() {
            scene.remove(house); house.traverse(o => { if (o.isSprite) { if (!o.userData.mem) o.material.map?.dispose(); o.material.dispose(); } }); house = new T.Group();
            const floors = opts.all ? Hcur.floors.filter(f => f.level <= Hcur.floors[fiCur].level) : [Hcur.floors[fiCur]];
            floors.forEach(f => house.add(buildFloor(Hcur, f, {cut: opts.cut && f === Hcur.floors[fiCur], ceil: walk && f === Hcur.floors[fiCur]})));
            // le toit se pose sur l'étage le plus haut qui a des murs (un étage ajouté mais encore vide ne le fait pas disparaître) ; il se voit depuis cet étage ou plus haut
            const top = [...Hcur.floors].filter(f => f.walls?.length).sort((a, b) => b.level - a.level)[0];
            if (opts.roof && opts.all && top && Hcur.floors[fiCur].level >= top.level && !walk) { const r = buildRoof(Hcur, top); if (r) house.add(r); }
            if (opts.dims) { const f = Hcur.floors[fiCur], y0 = floorBase(Hcur, f); f.walls.forEach(w => { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); if (L < 20) return; const sp = label3d(fmt3(L)); sp.position.set(M((w.a[0] + w.b[0]) / 2), y0 + M(w.h || f.height) + .25, M((w.a[1] + w.b[1]) / 2)); house.add(sp); });
                const hh = label3d(`↕ ${fmt3(f.height)}`, '#1d5fb8'), xs = f.walls.flatMap(w => [w.a[0], w.b[0]]), zs = f.walls.flatMap(w => [w.a[1], w.b[1]]); if (xs.length) { hh.position.set(M(Math.min(...xs)) - .4, y0 + M(f.height) / 2, M(Math.min(...zs)) - .4); house.add(hh); } }
            // 💡 les lampes posées (12 au plus, les plus proches de l'étage montré d'abord)
            lampLights.forEach(l => scene.remove(l)); bulbs.forEach(b => scene.remove(b)); lampLights = []; bulbs = [];
            const lampPts = house.children.filter(g => g.userData.lamps).sort((a, b) => (b.userData.floorId === Hcur.floors[fiCur].id) - (a.userData.floorId === Hcur.floors[fiCur].id)).flatMap(g => g.userData.lamps.map(v => v.clone().add(g.position))).slice(0, 12);
            lampPts.forEach(p => { const l = new T.PointLight('#ffc977', 0, 7.5, 2); l.position.copy(p); scene.add(l); lampLights.push(l); const b = new T.Mesh(new T.SphereGeometry(.06, 12, 8), new T.MeshBasicMaterial({color: '#ffe2a8'})); b.position.copy(p); b.visible = false; scene.add(b); bulbs.push(b); });
            scene.add(house); measureObjs.forEach(o => scene.add(o)); applySun();
        }
        const fmt3 = cm => cm >= 100 ? `${(Math.round(cm) / 100).toFixed(2).replace('.', ',')} m` : `${Math.round(cm)} cm`;
        function label3d(text, color = '#222') { const c = document.createElement('canvas'), x = c.getContext('2d'); x.font = '600 44px system-ui, sans-serif'; const w = Math.ceil(x.measureText(text).width) + 28; c.width = w; c.height = 64;
            x.font = '600 44px system-ui, sans-serif'; x.fillStyle = '#ffffffe8'; x.beginPath(); x.roundRect?.(0, 0, w, 64, 14); if (!x.roundRect) x.rect(0, 0, w, 64); x.fill(); x.fillStyle = color; x.textBaseline = 'middle'; x.fillText(text, 14, 34);
            const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; const sp = new T.Sprite(new T.SpriteMaterial({map: tex, depthTest: false, transparent: true})); sp.renderOrder = 10; sp.scale.set(w / 64 * .32, .32, 1); return sp; }

        /* ─── ☀️ la lumière du jour : le soleil selon le lieu, la date, l'heure et le nord du plan ; la nuit, les lampes ─── */
        const sunBox = document.createElement('div'); sunBox.className = 'h-hs-sunbox'; sunBox.hidden = true; box2.appendChild(sunBox);
        sunBox.innerHTML = `<div class="h-hs-sunhd"><b>☀️ Lumière du jour</b><button type="button" class="icon-button small" data-sx="close" title="Fermer" aria-label="Fermer">×</button></div>
            <label class="h-hs-sxrow"><span>Heure</span><input type="range" min="0" max="24" step="0.25" data-sx="hour" data-ui-off><output data-sxo="hour"></output></label>
            <div class="h-hs-sxbtns"><button type="button" class="button small secondary" data-sx="play" title="Le soleil passe d’une heure à l’autre">▶ Voir la journée</button></div>
            <label class="h-hs-sxrow"><span>Jour</span><input type="range" min="1" max="365" step="1" data-sx="day" data-ui-off><output data-sxo="day"></output></label>
            <div class="h-hs-sxbtns">${[[355, '❄️ Hiver'], [80, '🌱 Printemps'], [172, '☀️ Été'], [265, '🍂 Automne'], [0, '📅 Aujourd’hui']].map(([d, l]) => `<button type="button" class="h-hs-chip" data-sx-day="${d}">${l}</button>`).join('')}</div>
            <label class="h-hs-sxrow"><span data-help="Tourne le plan par rapport au nord : 0° = le haut du plan est au nord, 90° = le haut du plan regarde l’est. Le soleil et les ombres suivent." data-help-faq="lumière du jour">Nord du plan</span><input type="range" min="0" max="359" step="1" data-sx="north" data-unit="°"></label>
            <label class="checkbox-line"><input type="checkbox" data-sx="shadows"> Ombres portées</label><small class="h-hs-sxinfo" data-sxo="info"></small>`;
        let playT = 0;
        function paintSunBox() { const s = sunOf(Hcur); sunBox.querySelector('[data-sx="hour"]').value = s.hour; sunBox.querySelector('[data-sx="day"]').value = s.day; const n = sunBox.querySelector('[data-sx="north"]'); if (n.value !== String(s.north)) { n.value = s.north; n.dispatchEvent(new Event('input')); } sunBox.querySelector('[data-sx="shadows"]').checked = s.shadows !== false;
            sunBox.querySelector('[data-sxo="hour"]').textContent = hourLabel(s.hour); sunBox.querySelector('[data-sxo="day"]').textContent = dayLabel(s.day); }
        function applySun() {
            const s = sunOf(Hcur), g = geo || FRANCE, sp = sunAt({lat: g.lat, lon: g.lon, day: s.day, hour: s.hour}), altD = sp.alt / DEG;
            const night = clamp((2 - altD) / 9, 0, 1), dayF = clamp(Math.sin(sp.alt) * 2.2, 0, 1), gold = clamp(1 - altD / 14, 0, 1) * (1 - night);
            const th = sp.az + (Number(s.north) || 0) * DEG, alt = Math.max(sp.alt, .03), dir = new T.Vector3(Math.cos(alt) * Math.sin(th), Math.sin(alt), -Math.cos(alt) * Math.cos(th));
            const bb = new T.Box3().setFromObject(house), c = bb.isEmpty() ? new T.Vector3() : bb.getCenter(new T.Vector3()), sz = bb.isEmpty() ? 20 : Math.max(10, bb.getSize(new T.Vector3()).length() * .7);
            sun.target.position.copy(c); sun.position.copy(c).addScaledVector(dir, sz + 25); Object.assign(sun.shadow.camera, {left: -sz, right: sz, top: sz, bottom: -sz, far: sz * 2 + 60}); sun.shadow.camera.updateProjectionMatrix();
            sun.intensity = sp.alt > 0 ? .35 + 2.2 * dayF : 0; sun.color.set('#fff4e0').lerp(new T.Color('#ff9a50'), gold * .8); sun.castShadow = s.shadows !== false && sp.alt > 0;
            hemi.intensity = .16 + 1.45 * (1 - night) * (.45 + .55 * dayF); hemi.color.set('#ffffff').lerp(new T.Color('#4a5a8a'), night);
            const sky = new T.Color('#dfe8ef').lerp(new T.Color('#f2c49e'), gold * .75).lerp(new T.Color('#0e1828'), night); scene.background.copy(sky); scene.fog.color.copy(sky);
            groundMat.color.set('#a9b88f').lerp(new T.Color('#25301f'), night * .8);
            lampLights.forEach(l => { l.intensity = night * 9; }); bulbs.forEach(b => { b.visible = night > .3; });
            const info = sunBox.querySelector('[data-sxo="info"]'); if (info) info.textContent = `${sp.alt > 0 ? `Soleil à ${Math.round(altD)}° de haut, au ${dirName(sp.az)}` : `${night >= 1 ? '🌙 Nuit' : 'Crépuscule'}${lampLights.length ? ` : ${lampLights.length} lampe${lampLights.length > 1 ? 's' : ''} allumée${lampLights.length > 1 ? 's' : ''}` : ' (pose une lampe pour éclairer)'}`} · ${sp.polar === 'nuit' ? 'nuit polaire' : sp.polar === 'jour' ? 'soleil de minuit' : `lever ${hourLabel(sp.rise)}, coucher ${hourLabel(sp.set)}`} · ${geo ? `${String(Math.abs(g.lat).toFixed(2)).replace('.', ',')}° ${g.lat >= 0 ? 'N' : 'S'}` : 'France (lieu de la maison inconnu)'}`;
            return sp;
        }
        const setSun = (patch, quiet = false) => { Hcur.sun = {...sunOf(Hcur), ...patch}; paintSunBox(); applySun(); if (!quiet) emit('h3-change', {what: 'sun'}); };
        sunBox.addEventListener('input', e => { const k = e.target.dataset.sx; if (k === 'hour' || k === 'day' || k === 'north') setSun({[k]: Number(e.target.value)}); else if (k === 'shadows') setSun({shadows: e.target.checked}); });
        sunBox.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.sx === 'close') { sunBox.hidden = true; bar.querySelector('[data-h3="sun"]')?.classList.remove('is-on'); stopPlay(); return; }
            if (b.dataset.sx === 'play') { if (playT) return stopPlay(); b.textContent = '⏸ Arrêter'; let h = 4.5; playT = setInterval(() => { h += .25; if (h > 22.5) return stopPlay(); setSun({hour: h}, true); }, 90); return; }
            if (b.dataset.sxDay !== undefined) setSun({day: Number(b.dataset.sxDay) || dayOfYear()}); });
        function stopPlay() { if (playT) { clearInterval(playT); playT = 0; emit('h3-change', {what: 'sun'}); } const b = sunBox.querySelector('[data-sx="play"]'); if (b) b.textContent = '▶ Voir la journée'; }

        // 📏 mesurer : deux clics sur la maison
        let measuring = false, mPts = [], measureObjs = []; const mLabel = document.createElement('div'); mLabel.className = 'h-hs-3dmeasure'; mLabel.hidden = true; box2.appendChild(mLabel);
        const clearMeasure = () => { measureObjs.forEach(o => { scene.remove(o); o.geometry?.dispose?.(); }); measureObjs = []; mPts = []; mLabel.hidden = true; };
        const ray = new T.Raycaster(), ndc = new T.Vector2();
        const rayAt = e => { const r = el.getBoundingClientRect(); if (e) ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); else ndc.set(0, 0); ray.setFromCamera(ndc, cam); };
        function pickMeasure(e) {
            rayAt(e);
            const hit = ray.intersectObjects([house, ground], true).find(h => h.object.isMesh); if (!hit) return;
            if (mPts.length >= 2) clearMeasure();
            const p = hit.point.clone(); mPts.push(p);
            const dot = new T.Mesh(new T.SphereGeometry(.04, 12, 8), new T.MeshBasicMaterial({color: '#e0457b', depthTest: false})); dot.renderOrder = 11; dot.position.copy(p); scene.add(dot); measureObjs.push(dot);
            if (mPts.length === 2) { const [a, b] = mPts, line = new T.Line(new T.BufferGeometry().setFromPoints([a, b]), new T.LineBasicMaterial({color: '#e0457b', depthTest: false})); line.renderOrder = 11; scene.add(line); measureObjs.push(line);
                const d = a.distanceTo(b) * 100, dh = Math.abs(a.y - b.y) * 100, dxz = Math.hypot(a.x - b.x, a.z - b.z) * 100; mLabel.textContent = `${fmt3(d)}${dh > 2 ? ` · au sol ${fmt3(dxz)} · ↕ ${fmt3(dh)}` : ''}`; mLabel.hidden = false; }
        }
        /** ✦ un souvenir sous la souris (ou au centre de la vue, souris capturée) : les repères se voient (et se cliquent) à travers les murs */
        function pickMemory(e) {
            rayAt(e); const h0 = ray.intersectObjects(house.children, true).find(h => h.object.isSprite && h.object.userData.mem);
            if (!h0) return false; o3.onMemory?.(h0.object.userData.mem); return true;
        }
        const placeLabel = () => { if (mLabel.hidden || mPts.length < 2) return; const m = mPts[0].clone().add(mPts[1]).multiplyScalar(.5).project(cam), r = el.getBoundingClientRect(); mLabel.style.left = `${(m.x + 1) / 2 * r.width}px`; mLabel.style.top = `${(1 - m.y) / 2 * r.height + 34}px`; mLabel.style.visibility = m.z < 1 ? '' : 'hidden'; };
        function home() { const bb = new T.Box3().setFromObject(house); if (bb.isEmpty()) { target.set(0, 0, 0); dist = 15; return; } bb.getCenter(target); const s = bb.getSize(new T.Vector3()); dist = Math.max(6, Math.max(s.x, s.z) * 1.4); yaw = .8; pitch = .65; if (walk) stopWalk(true); }
        const place = () => { cam.position.set(target.x + dist * Math.cos(pitch) * Math.sin(yaw), target.y + dist * Math.sin(pitch), target.z + dist * Math.cos(pitch) * Math.cos(yaw)); cam.lookAt(target); };

        /* ─── 🚶 la visite à la première personne : hauteur d'yeux, Z Q S D / W A S D / flèches, souris (capturée), murs (on passe par les portes), escaliers, petite carte, joystick ─── */
        const P = new T.Vector3(); let wyaw = Math.PI, wpitch = 0, segs = [], unlockAt = 0, joy = null, onStair = 0;
        const eyeM = () => clamp(Number(Hcur.walk?.eye) || 160, 80, 220) / 100;
        const hud = document.createElement('div'); hud.className = 'h-hs-walkhud'; hud.hidden = true; box2.appendChild(hud);
        hud.innerHTML = `<div class="h-hs-wkrow"><b>🚶 Visite</b><span data-wk="floor"></span><button type="button" class="button small secondary" data-wk="up" title="Monter à l’étage du dessus (E ou Page ↑)">⬆</button><button type="button" class="button small secondary" data-wk="down" title="Descendre à l’étage du dessous (C ou Page ↓)">⬇</button>
            <label class="h-hs-wkeye"><span data-help="La hauteur de tes yeux dans la maison : 1,60 m pour un adulte, 1 m pour voir comme un enfant." data-help-faq="visiter la maison">Yeux à</span><input type="number" min="80" max="220" step="5" data-wk="eye" aria-label="Hauteur des yeux (cm)"> cm</label><button type="button" class="button small" data-wk="stop">✋ Arrêter</button></div>
            <small data-wk="hint"></small><div class="h-hs-wkstair" data-wk="stair" hidden></div>`;
        const mini = document.createElement('canvas'); mini.className = 'h-hs-minimap'; mini.width = mini.height = 340; mini.hidden = true; mini.title = 'Petite carte : clic pour t’y rendre'; box2.appendChild(mini);
        const cross = document.createElement('div'); cross.className = 'h-hs-cross'; cross.hidden = true; box2.appendChild(cross);
        const joyEl = document.createElement('div'); joyEl.className = 'h-hs-joy'; joyEl.hidden = true; joyEl.innerHTML = '<i></i>'; box2.appendChild(joyEl);
        /** juste sous la barre de la vue 3D (qui peut tenir sur deux lignes) */
        const under = () => { const r = bar.getBoundingClientRect(), r0 = box2.getBoundingClientRect(); return bar.hidden || !r.height ? 10 : Math.max(10, Math.round(r.bottom - r0.top + 8)); };
        const touchy = () => (navigator.maxTouchPoints || 0) > 0 || matchMedia?.('(pointer: coarse)').matches;
        const sortedFloors = () => [...Hcur.floors].sort((a, b) => a.level - b.level);
        /** les murs de l'étage, en segments pleins (mètres) : les portes et les passages laissent passer, pas les fenêtres */
        function buildSegs() {
            const f = Hcur.floors[fiCur]; segs = [];
            (f.walls || []).forEach(w => { const ax = M(w.a[0]), az = M(w.a[1]), bx = M(w.b[0]), bz = M(w.b[1]), len = Math.hypot(bx - ax, bz - az); if (len < .02) return; const ux = (bx - ax) / len, uz = (bz - az) / len, t = M(w.t || f.wallT || 20);
                const holes = (f.openings || []).filter(o => o.wall === w.id && o.type !== 'window').map(o => [o.pos * len - M(o.w) / 2, o.pos * len + M(o.w) / 2]).sort((a, b) => a[0] - b[0]);
                let s = 0; holes.forEach(([h0, h1]) => { if (h0 > s) segs.push([ax + ux * s, az + uz * s, ax + ux * h0, az + uz * h0, t]); s = Math.max(s, h1); }); if (s < len) segs.push([ax + ux * s, az + uz * s, bx, bz, t]); });
        }
        /** pousser hors des murs (rayon du corps : 22 cm) */
        function collide(x, z) {
            const r = .22;
            for (let it = 0; it < 4; it++) { let moved = false;
                for (const [x0, z0, x1, z1, t] of segs) { const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1e-6, k = clamp(((x - x0) * dx + (z - z0) * dz) / L2, 0, 1), qx = x0 + dx * k, qz = z0 + dz * k, d = Math.hypot(x - qx, z - qz), min = r + t / 2;
                    if (d < min) { const nx = d > 1e-5 ? (x - qx) / d : -dz / Math.sqrt(L2), nz = d > 1e-5 ? (z - qz) / d : dx / Math.sqrt(L2); x = qx + nx * min; z = qz + nz * min; moved = true; } }
                if (!moved) break; }
            return [x, z];
        }
        /** un escalier sous les pieds (cet étage pour monter, celui du dessous pour descendre) */
        const STAIR = /^(escalier|escaliert)$|stair|spiral|echelle|échelle/i;
        const stairAt = (f, x, z) => (f?.items || []).find(it => { if (!STAIR.test(`${it.kind || ''}`) && !STAIR.test(`${it.s2 || ''} ${it.s3 || ''}`)) return false; const a = -(it.rot || 0) * DEG, dx = x * 100 - it.x, dz = z * 100 - it.y, lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a); return Math.abs(lx) <= it.w / 2 + 25 && Math.abs(lz) <= it.d / 2 + 25; });
        function startPos() {
            const f = Hcur.floors[fiCur], rooms = (f.rooms || []).filter(r => r.pts?.length > 2), area = pts => Math.abs(pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
            if (rooms.length) { const rm = rooms.sort((a, b) => area(b.pts) - area(a.pts))[0], xs = rm.pts.map(p => p[0]), ys = rm.pts.map(p => p[1]); return [M((Math.min(...xs) + Math.max(...xs)) / 2), M((Math.min(...ys) + Math.max(...ys)) / 2)]; }
            const bb = new T.Box3().setFromObject(house), c = bb.isEmpty() ? new T.Vector3() : bb.getCenter(new T.Vector3()); return [c.x, c.z];
        }
        function paintHud() {
            const fl = sortedFloors(), f = Hcur.floors[fiCur], i = fl.indexOf(f); hud.querySelector('[data-wk="floor"]').textContent = f.name || 'Étage';
            hud.querySelector('[data-wk="up"]').disabled = i >= fl.length - 1; hud.querySelector('[data-wk="down"]').disabled = i <= 0;
            const eye = hud.querySelector('[data-wk="eye"]'); if (document.activeElement !== eye) eye.value = Math.round(eyeM() * 100);
            hud.querySelector('[data-wk="hint"]').textContent = document.pointerLockElement === el ? 'Z Q S D, W A S D ou flèches : marcher · Maj : courir · la souris regarde · Échap : libérer la souris' : touchy() ? 'Le rond en bas à gauche : marcher · glisser sur la vue : regarder · ✦ : toucher pour voir le souvenir' : 'Z Q S D, W A S D ou flèches : marcher · clic sur la vue : regarder avec la souris · ✦ : clic pour voir le souvenir · Échap : sortir';
        }
        function goFloor(dir) {
            const fl = sortedFloors(), i = fl.indexOf(Hcur.floors[fiCur]), nx = fl[i + dir]; if (!nx) return;
            fiCur = Hcur.floors.indexOf(nx); rebuild(); buildSegs(); [P.x, P.z] = collide(P.x, P.z); paintHud(); emit('h3-floor', {fi: fiCur});
        }
        function startWalk() {
            if (walk) return; walk = true; measuring = false; clearMeasure(); el.style.cursor = ''; bar.querySelector('[data-h3="measure"]')?.classList.remove('is-on');
            rebuild(); buildSegs(); const [x, z] = startPos(); [P.x, P.z] = collide(x, z); wyaw = Math.PI; wpitch = 0;
            hud.hidden = false; mini.hidden = false; cross.hidden = false; joyEl.hidden = !touchy(); const wb = bar.querySelector('[data-h3="walk"]'); if (wb) { wb.textContent = '✋ Arrêter la visite'; wb.classList.add('is-on'); } hud.style.top = `${under()}px`; paintHud(); box2.classList.add('is-walking');
        }
        function stopWalk(keepView = false) {
            if (!walk) return; walk = false; keys.clear(); joy = null; try { if (document.pointerLockElement === el) document.exitPointerLock(); } catch (_) {}
            hud.hidden = true; mini.hidden = true; cross.hidden = true; joyEl.hidden = true; box2.classList.remove('is-walking'); const wb = bar.querySelector('[data-h3="walk"]'); if (wb) { wb.textContent = '🚶 Visiter'; wb.classList.remove('is-on'); }
            rebuild(); if (!keepView) home();
        }
        hud.addEventListener('click', e => { const k = e.target.closest('button')?.dataset.wk; if (k === 'stop') stopWalk(); else if (k === 'up') goFloor(1); else if (k === 'down') goFloor(-1); else if (k === 'stairup') goFloor(1); else if (k === 'stairdown') goFloor(-1); });
        hud.addEventListener('change', e => { if (e.target.dataset.wk !== 'eye') return; const v = clamp(Math.round(Number(e.target.value) || 160), 80, 220); e.target.value = v; Hcur.walk = {...(Hcur.walk || {}), eye: v}; emit('h3-change', {what: 'walk'}); });
        hud.addEventListener('keydown', e => e.stopPropagation()); // taper la hauteur sans marcher
        function drawMini() {
            const f = Hcur.floors[fiCur], x = mini.getContext('2d'), S = mini.width; x.clearRect(0, 0, S, S); x.fillStyle = 'rgba(255,255,255,.88)'; x.fillRect(0, 0, S, S);
            const pts = [...(f.walls || []).flatMap(w => [w.a, w.b]), ...(f.rooms || []).flatMap(r => r.pts || [])]; if (!pts.length) return;
            const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1])), k = (S - 40) / Math.max(100, x1 - x0, y1 - y0), ox = (S - (x1 - x0) * k) / 2 - x0 * k, oy = (S - (y1 - y0) * k) / 2 - y0 * k, X = v => v * k + ox, Y = v => v * k + oy;
            mini._map = {k, ox, oy};
            (f.rooms || []).forEach(r => { if (!r.pts?.length) return; x.beginPath(); r.pts.forEach((p, i) => (i ? x.lineTo(X(p[0]), Y(p[1])) : x.moveTo(X(p[0]), Y(p[1])))); x.closePath(); x.fillStyle = '#efe6d4'; x.fill(); });
            x.strokeStyle = '#2f2b27'; x.lineCap = 'square'; (f.walls || []).forEach(w => { x.lineWidth = Math.max(2, (w.t || f.wallT || 20) * k); x.beginPath(); x.moveTo(X(w.a[0]), Y(w.a[1])); x.lineTo(X(w.b[0]), Y(w.b[1])); x.stroke(); });
            x.strokeStyle = '#fbfaf7'; x.lineWidth = Math.max(3, 16 * k); (f.openings || []).forEach(o => { const w = f.walls.find(q => q.id === o.wall); if (!w || o.type === 'window') return; const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1, ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L, c = o.pos * L; x.beginPath(); x.moveTo(X(w.a[0] + ux * (c - o.w / 2)), Y(w.a[1] + uy * (c - o.w / 2))); x.lineTo(X(w.a[0] + ux * (c + o.w / 2)), Y(w.a[1] + uy * (c + o.w / 2))); x.stroke(); });
            x.font = '700 20px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
            (f.items || []).forEach(it => { if (STAIR.test(`${it.kind || ''} ${it.s2 || ''}`)) { x.fillStyle = '#9a7a5a'; x.fillText('🪜', X(it.x), Y(it.y)); } if (it.mem?.length) { x.fillStyle = '#c9962a'; x.fillText('✦', X(it.x), Y(it.y)); } });
            (f.rooms || []).forEach(r => { if (!r.mem?.length || !r.pts?.length) return; const xs = r.pts.map(p => p[0]), ys = r.pts.map(p => p[1]); x.fillStyle = '#c9962a'; x.fillText('✦', X((Math.min(...xs) + Math.max(...xs)) / 2), Y((Math.min(...ys) + Math.max(...ys)) / 2)); });
            const px = X(P.x * 100), py = Y(P.z * 100), fx = -Math.sin(wyaw), fz = -Math.cos(wyaw), a = Math.atan2(fz, fx);
            x.fillStyle = 'rgba(42,125,225,.25)'; x.beginPath(); x.moveTo(px, py); x.arc(px, py, 46, a - .55, a + .55); x.closePath(); x.fill();
            x.fillStyle = '#2a7de1'; x.beginPath(); x.arc(px, py, 8, 0, Math.PI * 2); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 3; x.stroke();
            const n = (Number(sunOf(Hcur).north) || 0) * DEG; x.save(); x.translate(S - 26, 26); x.rotate(n); x.fillStyle = '#c0392b'; x.beginPath(); x.moveTo(0, -16); x.lineTo(7, 6); x.lineTo(-7, 6); x.closePath(); x.fill(); x.fillStyle = '#333'; x.font = '700 15px system-ui'; x.fillText('N', 0, 17); x.restore();
        }
        mini.addEventListener('click', e => { const m = mini._map; if (!m) return; const r = mini.getBoundingClientRect(), sx = (e.clientX - r.left) / r.width * mini.width, sy = (e.clientY - r.top) / r.height * mini.height; [P.x, P.z] = collide(M((sx - m.ox) / m.k), M((sy - m.oy) / m.k)); });
        // 🕹 le joystick (tablette) : la direction et la force
        joyEl.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); try { joyEl.setPointerCapture(e.pointerId); } catch (_) {} const r = joyEl.getBoundingClientRect(); joy = {cx: r.left + r.width / 2, cy: r.top + r.height / 2, R: r.width / 2, x: 0, y: 0}; joyMove(e); });
        const joyMove = e => { if (!joy) return; let dx = (e.clientX - joy.cx) / joy.R, dy = (e.clientY - joy.cy) / joy.R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } joy.x = dx; joy.y = dy; joyEl.querySelector('i').style.transform = `translate(${dx * joy.R * .55}px, ${dy * joy.R * .55}px)`; };
        joyEl.addEventListener('pointermove', joyMove); const joyEnd = () => { joy = null; joyEl.querySelector('i').style.transform = ''; }; joyEl.addEventListener('pointerup', joyEnd); joyEl.addEventListener('pointercancel', joyEnd);
        document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== el) unlockAt = performance.now(); if (walk) paintHud(); }, sig);
        document.addEventListener('mousemove', e => { if (!walk || document.pointerLockElement !== el) return; wyaw -= e.movementX * .0024; wpitch = clamp(wpitch - e.movementY * .0024, -1.3, 1.3); }, sig);

        rebuild(); home(); paintSunBox();
        // souris : tourner, déplacer, approcher ; en visite : regarder
        let dragM = null; const el = renderer.domElement;
        el.addEventListener('contextmenu', e => e.preventDefault());
        el.addEventListener('pointerdown', e => { try { el.setPointerCapture(e.pointerId); } catch (_) {} dragM = {x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, pan: e.button === 2 || e.shiftKey}; });
        el.addEventListener('pointermove', e => { if (!dragM) return; const dx = e.clientX - dragM.x, dy = e.clientY - dragM.y; dragM.x = e.clientX; dragM.y = e.clientY;
            if (walk) { if (document.pointerLockElement !== el) { wyaw -= dx * .004; wpitch = clamp(wpitch - dy * .004, -1.3, 1.3); } return; }
            if (dragM.pan) { const right = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), fwd = new T.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), k = dist * .0018; target.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k); }
            else { yaw -= dx * .006; pitch = clamp(pitch + dy * .005, .05, 1.5); } });
        el.addEventListener('pointerup', e => { const d = dragM; dragM = null; if (!d || e.button !== 0 || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) >= 5) return;
            const locked = document.pointerLockElement === el;
            if (pickMemory(locked ? null : e)) { if (locked) document.exitPointerLock(); return; }
            if (measuring) return pickMeasure(e);
            if (walk && !locked && e.pointerType === 'mouse') { try { const p = el.requestPointerLock?.(); p?.catch?.(() => {}); } catch (_) {} } });
        el.addEventListener('wheel', e => { e.preventDefault(); if (walk) return; dist = clamp(dist * Math.exp(e.deltaY * .0012), 1.5, 200); }, {passive: false});
        const keys = new Set();
        const kd = e => { if (e.target.closest?.('input, textarea, select') || !box2.isConnected || box2.closest('dialog')?.querySelector('dialog[open]')) return; const k = e.key.toLowerCase(); keys.add(k);
            if (walk && !e.metaKey && !e.ctrlKey) { if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'pageup', 'pagedown'].includes(k)) e.preventDefault(); if (k === 'e' || k === 'pageup') goFloor(1); if (k === 'c' || k === 'pagedown') goFloor(-1); } },
            ku = e => keys.delete(e.key.toLowerCase()), blur = () => keys.clear();
        document.addEventListener('keydown', kd); document.addEventListener('keyup', ku); window.addEventListener('blur', blur);
        bar.addEventListener('input', e => { const k = e.target.dataset.h3; if (k in opts) { opts[k] = e.target.checked; if (k === 'roof') { Hcur.roof = {...(Hcur.roof || {}), on: opts.roof}; box2.dispatchEvent(new CustomEvent('h3-roof', {bubbles: true})); } rebuild(); } }, sig);
        bar.addEventListener('click', e => { const bt = e.target.closest('button'), k = bt?.dataset.h3;
            if (k === 'measure') { if (walk) stopWalk(); measuring = !measuring; bt.classList.toggle('is-on', measuring); el.style.cursor = measuring ? 'crosshair' : ''; if (!measuring) clearMeasure(); return; }
            if (k === 'sun') { sunBox.style.top = `${under()}px`; sunBox.hidden = !sunBox.hidden; bt.classList.toggle('is-on', !sunBox.hidden); if (!sunBox.hidden) { paintSunBox(); applySun(); } return; }
            if (k === 'view') { const v = bt.dataset.v; home(); if (v === 'top') { pitch = 1.5; yaw = 0; } else if (v === 'front') { pitch = .06; yaw = 0; } else { pitch = .06; yaw = Math.PI / 2; } return; }
            if (k === 'home') home(); if (k === 'walk') { if (walk) stopWalk(); else startWalk(); } }, sig);
        let raf = 0, last = performance.now(), stairT = 0;
        const loop = now => { const dt = Math.min(walk ? .1 : .05, (now - last) / 1000); last = now; // en visite : même vitesse si l'image est lente
            if (walk) {
                const f = Hcur.floors[fiCur], sp = (keys.has('shift') ? 3.4 : 1.5) * dt; let fw = 0, st = 0;
                if (keys.has('arrowup') || keys.has('z') || keys.has('w')) fw += 1; if (keys.has('arrowdown') || keys.has('s')) fw -= 1;
                if (keys.has('arrowleft') || keys.has('q') || keys.has('a')) st -= 1; if (keys.has('arrowright') || keys.has('d')) st += 1;
                if (joy) { fw -= joy.y; st += joy.x; }
                if (fw || st) { const l = Math.max(1, Math.hypot(fw, st)), fx = -Math.sin(wyaw), fz = -Math.cos(wyaw), rx = Math.cos(wyaw), rz = -Math.sin(wyaw); [P.x, P.z] = collide(P.x + (fx * fw + rx * st) / l * sp, P.z + (fz * fw + rz * st) / l * sp); }
                cam.position.set(P.x, floorBase(Hcur, f) + eyeM(), P.z);
                cam.lookAt(P.x - Math.sin(wyaw) * Math.cos(wpitch), cam.position.y + Math.sin(wpitch), P.z - Math.cos(wyaw) * Math.cos(wpitch));
                if (now - stairT > 120) { stairT = now; drawMini(); const fl = sortedFloors(), i = fl.indexOf(f), up = stairAt(f, P.x, P.z) && fl[i + 1], down = fl[i - 1] && stairAt(fl[i - 1], P.x, P.z), s2 = up ? 1 : down ? -1 : 0;
                    if (s2 !== onStair) { onStair = s2; const sb = hud.querySelector('[data-wk="stair"]'); sb.hidden = !s2; sb.innerHTML = s2 ? `🪜 Un escalier : ${up ? '<button type="button" class="button small" data-wk="stairup">⬆ Monter (E)</button>' : ''}${down ? '<button type="button" class="button small secondary" data-wk="stairdown">⬇ Descendre (C)</button>' : ''}` : ''; } }
            } else place();
            placeLabel(); renderer.render(scene, cam); raf = requestAnimationFrame(loop); };
        raf = requestAnimationFrame(loop);
        const ro = new ResizeObserver(() => { renderer.setSize(W(), Hh()); cam.aspect = W() / Hh(); cam.updateProjectionMatrix(); }); ro.observe(box2);
        return {update: (H2, fi2) => { Hcur = H2; if (!walk) fiCur = fi2; opts.roof = !!H2.roof?.on; const rb = bar.querySelector('[data-h3="roof"]'); if (rb) rb.checked = opts.roof; rebuild(); if (walk) buildSegs(); paintSunBox(); },
            shot: () => new Promise(ok => { renderer.render(scene, cam); renderer.domElement.toBlob(ok, 'image/png'); }),
            setGeo: g => { geo = g && Number.isFinite(+g.lat) && Number.isFinite(+g.lon) && (g.lat !== '' && g.lon !== '') ? {lat: +g.lat, lon: +g.lon} : null; applySun(); },
            setSun: () => { paintSunBox(); applySun(); }, sunInfo: () => applySun(),
            walking: () => walk, justUnlocked: () => performance.now() - unlockAt < 500, startWalk, stopWalk: () => stopWalk(), goFloor,
            walkState: () => ({x: P.x, z: P.z, yaw: wyaw, fi: fiCur, stair: onStair}), walkTo: (x, z) => { [P.x, P.z] = collide(x, z); },
            memPoints: () => { const r = el.getBoundingClientRect(), out = []; house.traverse(o => { if (o.isSprite && o.userData.mem) { const v = o.getWorldPosition(new T.Vector3()).project(cam); if (v.z < 1) out.push({...o.userData.mem, x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height}); } }); return out; }, // où sont les ✦ à l'écran
            walkKeys: keys, setWalkYaw: v => { wyaw = v; },
            itemAt: (cx, cy) => { rayAt({clientX: cx, clientY: cy}); const hit = ray.intersectObjects(house.children, true).find(h => h.object.isMesh); let o = hit?.object; while (o && o.userData?.hsItem == null) o = o.parent; return o ? {id: o.userData.hsItem, obj: o, point: hit.point} : null; }, // 🖼 l'objet sous la souris (une image déposée dessus)
            destroy: () => { stopPlay(); cancelAnimationFrame(raf); ro.disconnect(); try { if (document.pointerLockElement === el) document.exitPointerLock(); } catch (_) {} document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku); window.removeEventListener('blur', blur); renderer.dispose(); box2.innerHTML = ''; box2.classList.remove('is-walking'); barAc.abort(); if (!ownBar) { bar.hidden = true; bar.querySelectorAll('.is-on').forEach(b => b.classList.remove('is-on')); } }};
    }
    /** l'aperçu en 3D d'un seul objet (fenêtre « Créer un objet ») : une image, faite avec un seul rendu partagé */
    let snapR = null;
    async function snapshot(it, W = 180, Hh = 150) {
        await three();
        if (!snapR) { snapR = new T.WebGLRenderer({antialias: true, preserveDrawingBuffer: true, alpha: true}); snapR.outputColorSpace = T.SRGBColorSpace; }
        snapR.setSize(W, Hh); const sc = new T.Scene(); sc.add(new T.HemisphereLight('#ffffff', '#776655', 2.2)); const dl = new T.DirectionalLight('#fff4e0', 1.8); dl.position.set(2, 4, 3); sc.add(dl);
        const g = furniture({...it, kind: it.kind || ''}, ext.houseLib?.libOf(it.kind)); sc.add(g);
        const bb = new T.Box3().setFromObject(g), c = bb.getCenter(new T.Vector3()), sz = bb.getSize(new T.Vector3()), R = Math.max(sz.x, sz.y, sz.z, .1);
        const cam = new T.PerspectiveCamera(32, W / Hh, R / 50, R * 30); cam.position.set(c.x + R * 1.25, c.y + R * .95, c.z + R * 1.7); cam.lookAt(c);
        snapR.render(sc, cam); const url = snapR.domElement.toDataURL('image/png');
        sc.traverse(o => { if (o.isMesh) o.geometry?.dispose?.(); }); return url;
    }
    ext.house3d = {mount, inspect, inspectBuf, parseModel, snapshot, sunAt, dayLabel, hourLabel, dayOfYear};
})();
