/**
 * 🏛️ Visite du musée de famille en 3D — même style épuré que la pièce d'archives (murs blancs, traits noirs).
 * Script autonome : utilisé dans l'application (Pièce d'archives → porte « Musée ») et recopié tel quel dans le
 * site web exporté (un seul fichier index.html, qui s'ouvre d'un double-clic, sans LCNDA ni internet).
 *
 *   window.LCNDA_MUSEUM_VIEWER.mount(THREE, conteneur, données, options) → {destroy, goRoom, startTour, stopTour}
 *
 * données = {title, subtitle, intro, author, settings, rooms: [{name, intro, audio, settings, items: [...]}], guestbook}
 * item    = {id, kind: photo|document|artwork|object|text|decor|seat, wall: back|left|right|front|center, title, cartel,
 *            description, image (adresse), audio (adresse), in_tour, settings: {scale, model, px, pz}}
 * options = {onExit, onSign(nom, message) → Promise<livre d'or>, voice (lecture à voix haute), startRoom, canEdit, onEdit}
 */
(() => {
    'use strict';
    const SIZES = {small: [10, 8], medium: [14, 10], large: [18, 12]};
    // Taille d'une salle : petite, moyenne, grande, ou sur mesure (largeur × profondeur en mètres)
    const clampM = (v, def) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.max(8, Math.min(40, n)) : def; };
    function roomSize(st = {}) {
        if (st.size === 'custom') return [clampM(st.width, 14), clampM(st.depth, 10)];
        return SIZES[st.size] || SIZES.medium;
    }
    const HEIGHT = 4.4, EYE = 1.62;
    const MODELS = {bench: 'Banc', chair: 'Chaise', sofa: 'Canapé', plant: 'Plante', column: 'Colonne', pedestal: 'Socle', rope: 'Cordon', rug: 'Tapis', lamp: 'Lampadaire', vase: 'Vase', piano: 'Piano', table: 'Table', screen: 'Paravent'};
    const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[c]));
    const isWallKind = k => !['decor', 'seat'].includes(k);
    const tourKinds = k => !['decor', 'seat'].includes(k);

    const isNum = v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v));
    /** Position le long d'un mur (« along ») ↔ coordonnée du plan (x pour le fond et l'entrée, z pour les côtés). */
    const alongOf = (wall, world) => (wall === 'front' || wall === 'right') ? -world : world;
    /** Les limites où l'on peut accrocher sur un mur (l'entrée garde la place des portes). */
    const wallLimit = (wall, W, D, half = 0) => wall === 'front' ? Math.max(0, W / 2 - 2.05 - half) : Math.max(0, (wall === 'back' ? W : D) / 2 - 0.35 - half);
    /** Demi-largeur approximative d'un élément accroché (cadre ou texte), pour qu'il ne déborde ni sur une porte ni dans un coin. */
    const halfWidth = it => it.kind === 'text' ? Math.min(1.3, 1.3 * (Number(it.settings?.scale) || 1)) : Math.min(1.25, 0.5 * 1.35 * (Number(it.settings?.scale) || 1) + 0.15);
    /**
     * 🗺️ Plan du musée (settings.plan) : chaque salle a sa place vue de dessus (settings.mx, mz : coin du fond à gauche,
     * en mètres ; le haut du plan est le mur du fond). Deux salles qui se touchent par un mur, sur au moins 1,6 m,
     * sont reliées par une porte au milieu de la partie commune (sauf si on l'a fermée : settings.closed « id-id »).
     * Sans plan : null, et les salles s'enchaînent comme avant (portes sur le mur d'entrée).
     * Rend, pour chaque salle, ses portes : [{wall, along, to (n° de salle), key}].
     */
    const roomKey = (r, i) => String(r?.id ?? 'i' + i);
    function museumRects(rooms) {
        let right = 0;
        const rects = rooms.map((r, i) => { const [W, D] = roomSize(r.settings); const st = r.settings || {}; return {i, W, D, x: isNum(st.mx) ? Number(st.mx) : null, z: isNum(st.mz) ? Number(st.mz) : null}; });
        rects.forEach(r => { if (r.x !== null && r.z !== null) right = Math.max(right, r.x + r.W); });
        // les salles pas encore placées : à la suite, à droite (alignées sur le mur d'entrée)
        const maxD = Math.max(10, ...rects.map(r => r.D));
        rects.forEach(r => { if (r.x === null || r.z === null) { r.x = right; r.z = maxD - r.D; right += r.W; } });
        return rects;
    }
    function museumDoors(rooms, settings = {}) {
        if (!settings?.plan) return null;
        const rects = museumRects(rooms), closed = new Set(Array.isArray(settings.closed) ? settings.closed : []), out = rooms.map(() => []);
        const near = (a, b) => Math.abs(a - b) < 0.05;
        for (let a = 0; a < rects.length; a++) for (let b = a + 1; b < rects.length; b++) {
            const A = rects[a], B = rects[b], k1 = roomKey(rooms[a], a), k2 = roomKey(rooms[b], b), key = [k1, k2].sort().join('-');
            if (closed.has(key)) continue;
            const add = (P, wP, Q, wQ, mid) => { // mid : coordonnée du plan (x ou z) du milieu de la porte
                const cP = wP === 'back' || wP === 'front' ? mid - (P.x + P.W / 2) : mid - (P.z + P.D / 2), cQ = wQ === 'back' || wQ === 'front' ? mid - (Q.x + Q.W / 2) : mid - (Q.z + Q.D / 2);
                out[P.i].push({wall: wP, along: alongOf(wP, cP), to: Q.i, key}); out[Q.i].push({wall: wQ, along: alongOf(wQ, cQ), to: P.i, key});
            };
            const zLo = Math.max(A.z, B.z), zHi = Math.min(A.z + A.D, B.z + B.D), xLo = Math.max(A.x, B.x), xHi = Math.min(A.x + A.W, B.x + B.W);
            if (zHi - zLo >= 1.6) { if (near(A.x + A.W, B.x)) add(A, 'right', B, 'left', (zLo + zHi) / 2); else if (near(B.x + B.W, A.x)) add(B, 'right', A, 'left', (zLo + zHi) / 2); }
            if (xHi - xLo >= 1.6) { if (near(A.z + A.D, B.z)) add(A, 'front', B, 'back', (xLo + xHi) / 2); else if (near(B.z + B.D, A.z)) add(B, 'front', A, 'back', (xLo + xHi) / 2); }
        }
        return out;
    }
    /** Répartit n éléments le long d'un mur, en laissant la place des portes (± 1 m autour de chacune) */
    function freeSlots(len, doorAlongs, n) {
        let free = [[-len / 2, len / 2]];
        doorAlongs.forEach(d => { free = free.flatMap(([a, b]) => { const lo = d - 1, hi = d + 1; if (hi <= a || lo >= b) return [[a, b]]; return [[a, Math.max(a, lo)], [Math.min(b, hi), b]].filter(([x, y]) => y - x > 0.05); }); });
        const total = free.reduce((s, [a, b]) => s + b - a, 0) || len, slot = total / Math.max(1, n);
        return Array.from({length: n}, (_, k) => { let t = slot * (k + 0.5); for (const [a, b] of free) { if (t <= b - a) return {along: a + t, slot}; t -= b - a; } return {along: 0, slot}; });
    }
    /** Un élément placé à la main qui tomberait devant une porte est poussé juste à côté (du côté le plus proche qui a la place). */
    function clearDoors(along, half, limit, doorAlongs) {
        const gap = 0.7 + half, hits = a => doorAlongs.some(d => Math.abs(a - d) < gap - 0.001);
        if (!hits(along)) return along;
        const tries = doorAlongs.flatMap(d => [d - gap, d + gap]).filter(a => Math.abs(a) <= limit + 0.001 && !hits(a)).sort((a, b) => Math.abs(a - along) - Math.abs(b - along));
        return tries.length ? tries[0] : along;
    }
    /**
     * Où va chaque élément d'une salle : sur un mur (position, hauteur) ou au milieu (x, z, orientation).
     * Placé à la main sur le plan (settings.along / y, ou px / pz / rot), sinon réparti tout seul.
     * Servi aussi au plan de l'aménagement, pour qu'il montre exactement la même chose que la visite.
     */
    function layoutRoom(room, doors = null) {
        const [W, D] = roomSize(room.settings);
        const spots = new Map();
        const byWall = {back: [], left: [], right: [], front: []}; const center = [];
        (room.items || []).forEach(it => { if (!isWallKind(it.kind) || it.wall === 'center') center.push(it); else (byWall[it.wall] || byWall.back).push(it); });
        Object.entries(byWall).forEach(([wall, list]) => {
            const auto = list.filter(it => !isNum(it.settings?.along));
            const full = wall === 'back' || wall === 'front' ? W : D;
            const len = full - (wall === 'front' && !doors ? 5.4 : 1.4), slot = auto.length ? len / auto.length : len;
            const slots = doors ? freeSlots(len, doors.filter(d => d.wall === wall).map(d => d.along), auto.length) : null; // avec le plan du musée : pas devant une porte
            list.forEach(it => {
                let along, sl;
                if (isNum(it.settings?.along)) { along = clearDoors(alongOf(wall, Math.max(-1, Math.min(1, Number(it.settings.along))) * wallLimit(wall, W, D, halfWidth(it))), halfWidth(it), wallLimit(wall, W, D, halfWidth(it)), doors ? doors.filter(d => d.wall === wall).map(d => d.along) : []); sl = Math.min(len, 2.6); }
                else if (slots) { ({along, slot: sl} = slots[auto.indexOf(it)]); }
                else { along = -len / 2 + slot * (auto.indexOf(it) + 0.5); sl = slot; }
                spots.set(it, {wall, along, slot: sl, y: isNum(it.settings?.y) ? Math.max(0.6, Math.min(3.4, Number(it.settings.y))) : null});
            });
        });
        const auto = center.filter(it => !(isNum(it.settings?.px) && isNum(it.settings?.pz)));
        const n = auto.length, usableW = W - 4, usableD = D - 5.2;
        const cols = Math.max(1, Math.min(n || 1, Math.round(Math.sqrt(n * usableW / usableD)) || 1)), rows = Math.ceil((n || 1) / cols);
        center.forEach(it => {
            let x, z;
            if (isNum(it.settings?.px) && isNum(it.settings?.pz)) { x = Number(it.settings.px) * (W / 2 - 1); z = Number(it.settings.pz) * (D / 2 - 1); }
            else { const k = auto.indexOf(it), c = k % cols, r = Math.floor(k / cols); x = -usableW / 2 + usableW * (c + 0.5) / cols; z = -usableD / 2 + 0.2 + usableD * (r + 0.5) / rows; }
            spots.set(it, {center: true, x, z, rot: isNum(it.settings?.rot) ? Number(it.settings.rot) * Math.PI / 180 : 0});
        });
        return {W, D, spots};
    }

    function wrapLines(ctx, text, maxWidth) {
        const out = [];
        String(text || '').split('\n').forEach(par => {
            let line = '';
            par.split(/\s+/).filter(Boolean).forEach(word => {
                const next = line ? line + ' ' + word : word;
                if (ctx.measureText(next).width > maxWidth && line) { out.push(line); line = word; } else line = next;
            });
            out.push(line);
        });
        return out;
    }

    function mount(THREE, container, data, opts = {}) {
        const rooms = (data.rooms || []).filter(Boolean);
        let voiceRate = 1; // vitesse de la voix de synthèse, gardée d'une visite à l'autre
        try { voiceRate = [0.75, 1, 1.25, 1.5, 1.75, 2].includes(Number(localStorage.getItem('lcnda-museum-voice-rate'))) ? Number(localStorage.getItem('lcnda-museum-voice-rate')) : 1; } catch (_) {}
        container.classList.add('lcnda-museum');
        container.innerHTML = `<div class="lm-canvas"></div>
            <header class="lm-top"><div class="lm-title"><strong>${esc(data.title || 'Musée de famille')}</strong><span data-lm-room></span></div>
                <div class="lm-actions"><select data-lm-rooms aria-label="Aller dans une salle">${rooms.map((r, i) => `<option value="${i}">${i + 1}. ${esc(r.name || 'Salle')}</option>`).join('')}</select>
                <button type="button" data-lm-tour>▶ Visite guidée</button>${data.settings?.guestbook === false ? '' : '<button type="button" data-lm-book>📖 Livre d’or</button>'}<button type="button" data-lm-catalog>🗂 Catalogue</button>
                <button type="button" data-lm-voice title="Lire à voix haute les cartels sans enregistrement">${opts.voice === false ? '🔇' : '🔊'}</button><select data-lm-rate title="Vitesse de la voix de synthèse (pas des enregistrements)" aria-label="Vitesse de la voix">${[0.75, 1, 1.25, 1.5, 1.75, 2].map(r => `<option value="${r}" ${r === voiceRate ? 'selected' : ''}>×${String(r).replace('.', ',')}</option>`).join('')}</select>${opts.canEdit ? '<button type="button" data-lm-edit>✎ Aménager</button>' : ''}${opts.onExit ? '<button type="button" data-lm-exit title="Retour">✕</button>' : ''}</div></header>
            <div class="lm-caption" data-lm-caption hidden></div>
            <div class="lm-tourbar" data-lm-tourbar hidden><button type="button" data-lm-t="prev" title="Précédent">⏮</button><button type="button" data-lm-t="pause" title="Pause">⏸</button><button type="button" data-lm-t="next" title="Suivant">⏭</button><button type="button" data-lm-t="stop" title="Arrêter la visite">⏹</button><span data-lm-tourpos></span></div>
            <footer class="lm-help">Flèches ou Z Q S D : se déplacer · glisser : regarder · clic sur une œuvre : la voir de près · clic au sol : y aller</footer>
            <div class="lm-overlay" data-lm-overlay hidden></div>`;
        const $ = s => container.querySelector(s);
        const mountEl = $('.lm-canvas');
        const renderer = new THREE.WebGLRenderer({antialias: true});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.tabIndex = 0;
        mountEl.appendChild(renderer.domElement);
        const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 120);
        const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
        const loader = new THREE.TextureLoader();
        let scene = null, target = null, targets = [], roomIndex = -1, W = 14, D = 10, dirty = true, disposed = false;
        let yaw = 0, pitch = 0;
        const pos = new THREE.Vector3(0, EYE, 3);
        let anim = null; // déplacement doux de la caméra
        let voice = opts.voice !== false;

        const ink = () => new THREE.LineBasicMaterial({color: 0x111111});
        function outline(mesh) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), ink()); e.position.copy(mesh.position); e.rotation.copy(mesh.rotation); e.scale.copy(mesh.scale); (mesh.parent || target || scene).add(e); return e; }
        const put = obj => { (target || scene).add(obj); return obj; }; // dans le groupe en cours (élément tourné au milieu de la salle) ou dans la salle
        function box(w, h, d, x, y, z, color = 0xffffff, parent = null) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({color}));
            m.position.set(x, y, z); (parent || target || scene).add(m);
            const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), ink()); e.position.copy(m.position); (parent || target || scene).add(e);
            return m;
        }
        function cyl(rt, rb, h, x, y, z, color = 0xffffff, seg = 18, parent = null) {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), new THREE.MeshBasicMaterial({color}));
            m.position.set(x, y, z); (parent || target || scene).add(m);
            const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), ink()); e.position.copy(m.position); (parent || target || scene).add(e);
            return m;
        }
        function textTexture(lines, {width = 900, pad = 40, bg = '#ffffff', fg = '#111111', border = 0, sizes = [56, 30]} = {}) {
            const c = document.createElement('canvas'), ctx = c.getContext('2d');
            const font = (i) => `${i === 0 ? 800 : 500} ${sizes[Math.min(i, sizes.length - 1)]}px Georgia, 'Times New Roman', serif`;
            const rows = [];
            lines.forEach((t, i) => { ctx.font = font(i); wrapLines(ctx, t, width - pad * 2).forEach(l => rows.push([l, i])); });
            const lh = i => sizes[Math.min(i, sizes.length - 1)] * 1.32;
            const height = Math.max(80, Math.ceil(rows.reduce((h, [, i]) => h + lh(i), 0) + pad * 2));
            c.width = width; c.height = height;
            if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height); }
            if (border) { ctx.lineWidth = border; ctx.strokeStyle = fg; ctx.strokeRect(border / 2, border / 2, width - border, height - border); }
            ctx.fillStyle = fg; ctx.textBaseline = 'top';
            let y = pad; rows.forEach(([l, i]) => { ctx.font = font(i); ctx.fillText(l, pad, y); y += lh(i); });
            const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
            return {tex, aspect: width / height};
        }
        function plane(tex, w, h, transparent = false) {
            return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({map: tex, transparent, side: THREE.DoubleSide}));
        }
        /** Place un objet contre un mur, à la distance « along » du centre du mur, à la hauteur y. */
        function onWall(obj, wall, along, y, off = 0.02) {
            if (wall === 'back') { obj.position.set(along, y, -D / 2 + off); obj.rotation.y = 0; }
            if (wall === 'front') { obj.position.set(-along, y, D / 2 - off); obj.rotation.y = Math.PI; }
            if (wall === 'left') { obj.position.set(-W / 2 + off, y, along); obj.rotation.y = Math.PI / 2; }
            if (wall === 'right') { obj.position.set(W / 2 - off, y, -along); obj.rotation.y = -Math.PI / 2; }
            return obj;
        }
        const wallNormal = wall => ({back: [0, 1], front: [0, -1], left: [1, 0], right: [-1, 0]}[wall]);
        const wallLength = wall => (wall === 'back' || wall === 'front') ? W : D;

        function disposeScene() {
            if (!scene) return;
            scene.traverse(o => { o.geometry?.dispose?.(); const mats = Array.isArray(o.material) ? o.material : [o.material]; mats.forEach(m => { m?.map?.dispose?.(); m?.dispose?.(); }); });
            scene = null;
        }

        function buildRoom(i) {
            disposeScene(); stopAudio();
            const room = rooms[i]; roomIndex = i;
            const st = room.settings || {};
            [W, D] = roomSize(st);
            scene = new THREE.Scene();
            const wallColor = new THREE.Color(st.wall || data.settings?.wall || '#ffffff');
            scene.background = new THREE.Color(0xffffff);
            targets = [];
            const wallMat = () => new THREE.MeshBasicMaterial({color: wallColor, side: THREE.DoubleSide});
            const addWall = (w, h, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat()); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); outline(m); return m; };
            addWall(W, HEIGHT, 0, HEIGHT / 2, -D / 2, 0); addWall(W, HEIGHT, 0, HEIGHT / 2, D / 2, Math.PI);
            addWall(D, HEIGHT, -W / 2, HEIGHT / 2, 0, Math.PI / 2); addWall(D, HEIGHT, W / 2, HEIGHT / 2, 0, -Math.PI / 2);
            const floorColor = st.floor === 'wood' ? 0xefe6d8 : st.floor === 'dark' ? 0x2b2b2b : st.floor === 'stone' ? 0xe8e8e3 : 0xfafafa;
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({color: floorColor, side: THREE.DoubleSide}));
            floor.rotation.x = -Math.PI / 2; floor.userData.floor = true; scene.add(floor); targets.push(floor);
            const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({color: 0xf3f3f3, side: THREE.DoubleSide})); ceil.rotation.x = Math.PI / 2; ceil.position.y = HEIGHT; scene.add(ceil);
            const grid = new THREE.GridHelper(Math.max(W, D), Math.round(Math.max(W, D) / (st.floor === 'wood' ? 0.5 : 1)), st.floor === 'dark' ? 0x444444 : 0xd8d8d8, st.floor === 'dark' ? 0x3a3a3a : 0xececec);
            grid.position.y = 0.006; grid.scale.set(W / Math.max(W, D), 1, D / Math.max(W, D)); scene.add(grid);
            // Plinthes et cimaise : le trait noir qui fait le style de la pièce d'archives
            [['back', W], ['front', W], ['left', D], ['right', D]].forEach(([wall, len]) => {
                const pl = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.05), new THREE.MeshBasicMaterial({color: 0xffffff})); onWall(pl, wall, 0, 0.06, 0.03); scene.add(pl); outline(pl);
                const line = new THREE.Mesh(new THREE.BoxGeometry(len, 0.015, 0.01), new THREE.MeshBasicMaterial({color: 0x111111})); onWall(line, wall, 0, 3.05, 0.01); scene.add(line);
            });
            // Nom de la salle en grandes lettres sur le mur du fond
            const title = textTexture([room.name || `Salle ${i + 1}`], {width: 1400, bg: null, sizes: [78], pad: 20});
            const tw = Math.min(W * 0.55, 7.5), tp = plane(title.tex, tw, tw / title.aspect, true); onWall(tp, 'back', 0, 3.65); scene.add(tp);
            // Portes : avec le plan du musée, vers chaque salle voisine ; sinon salle précédente (ou sortie) à gauche et salle
            // suivante à droite, sur le mur d'entrée
            const door = (side, label, action, wall = 'front', along = null) => {
                const g = new THREE.Group(); const x = side === 'left' ? (W / 2 - 1.3) : -(W / 2 - 1.3); // vu de l'intérieur, face au mur d'entrée
                const leaf = plane(textTexture([label, side === 'left' ? '←' : side === 'right' ? '→' : '🚪'], {width: 520, sizes: [44, 70], border: 10}).tex, 1.25, 2.25);
                leaf.userData.action = action; targets.push(leaf); g.add(leaf); leaf.position.y = 1.13;
                const fr = (w, h, px, py) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), new THREE.MeshBasicMaterial({color: 0xffffff})); b.position.set(px, py, 0); g.add(b); const e = new THREE.LineSegments(new THREE.EdgesGeometry(b.geometry), ink()); e.position.copy(b.position); g.add(e); };
                fr(0.1, 2.4, -0.68, 1.2); fr(0.1, 2.4, 0.68, 1.2); fr(1.46, 0.1, 0, 2.4);
                onWall(g, wall, along ?? -x, 0, 0.05); scene.add(g);
            };
            const planDoors = museumDoors(rooms, data.settings)?.[i] || null;
            if (planDoors) {
                planDoors.forEach(d => door('plan', `Salle ${d.to + 1} : ${rooms[d.to].name || ''}`, {type: 'room', index: d.to}, d.wall, d.along));
                if (i === 0 && opts.onExit) { const busy = planDoors.some(d => d.wall === 'front' && Math.abs(d.along + (W / 2 - 1.3)) < 1.8); door(busy ? 'right' : 'left', 'Sortie', {type: 'exit'}); }
            } else {
                if (i > 0) door('left', `Salle ${i} : ${rooms[i - 1].name || ''}`, {type: 'room', index: i - 1});
                else if (opts.onExit) door('left', 'Sortie', {type: 'exit'});
                if (i < rooms.length - 1) door('right', `Salle ${i + 2} : ${rooms[i + 1].name || ''}`, {type: 'room', index: i + 1});
            }
            // Œuvres aux murs
            const lay = layoutRoom(room, planDoors);
            (room.items || []).forEach(it => { const sp = lay.spots.get(it); if (!sp) return; if (sp.center) placeCenter(it, sp); else placeWallItem(it, sp); });
            if (i === 0 && data.settings?.guestbook !== false) lectern(-W / 2 + 1.6, D / 2 - 2.2);
            $('[data-lm-room]').textContent = `Salle ${i + 1} / ${rooms.length} · ${room.name || ''}`;
            $('[data-lm-rooms]').value = String(i);
            dirty = true;
        }

        function cartelMesh(it, w = 0.5) {
            const lines = [it.title || 'Sans titre', ...(String(it.cartel || '').split('\n').filter(Boolean))];
            const t = textTexture(lines, {width: 640, sizes: [40, 27], pad: 28, border: 4});
            const m = plane(t.tex, w, w / t.aspect); m.userData.item = it; targets.push(m); return m;
        }
        function loadImage(it, cb) {
            if (!it.image) return cb(null);
            loader.load(it.image, tex => { if (disposed || !scene) { tex.dispose(); return; } tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; cb(tex); dirty = true; }, undefined, () => cb(null));
        }
        function framed(it, maxW, maxH, onReady) {
            const g = new THREE.Group();
            loadImage(it, tex => {
                const asp = tex ? (tex.image.width / tex.image.height || 1) : 0.75;
                let w = maxW, h = w / asp; if (h > maxH) { h = maxH; w = h * asp; }
                const frameW = (it.kind === 'artwork' ? 0.09 : 0.045);
                const pic = tex ? plane(tex, w, h) : plane(textTexture([it.title || 'Image'], {width: 600, sizes: [44]}).tex, w, h);
                pic.position.z = 0.03; pic.userData.item = it; targets.push(pic); g.add(pic);
                if (it.kind !== 'text') {
                    // passe-partout blanc et cadre noir fin (cadre plus large pour une œuvre)
                    const mat = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.03), new THREE.MeshBasicMaterial({color: 0xffffff})); mat.position.z = 0.01; g.add(mat);
                    const fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16 + frameW * 2, h + 0.16 + frameW * 2, 0.025), new THREE.MeshBasicMaterial({color: it.kind === 'artwork' ? 0x1b1b1b : 0x111111})); fr.position.z = 0.0; g.add(fr);
                    const e = new THREE.LineSegments(new THREE.EdgesGeometry(mat.geometry), ink()); e.position.copy(mat.position); g.add(e);
                }
                onReady?.(w, h);
            });
            return g;
        }
        function placeWallItem(it, {wall, along, slot, y}) {
            const scale = Math.max(0.4, Math.min(2.6, Number(it.settings?.scale) || 1));
            if (it.kind === 'text') {
                const t = textTexture([it.title || '', it.description || it.cartel || ''].filter(Boolean), {width: 1100, bg: null, sizes: [64, 34]});
                const w = Math.min(slot * 0.88, 2.6 * scale), h = w / t.aspect, m = plane(t.tex, w, h, true);
                const yy = y ?? Math.min(2.9, 1.75 + h / 4);
                m.userData.item = it; targets.push(m); onWall(m, wall, along, yy); scene.add(m);
                const g = new THREE.Group(); onWall(g, wall, along, yy, 0.03); const b = audioBadge(it); b.position.set(w / 2 + 0.12, -h / 2 + 0.1, 0.01); g.add(b); scene.add(g);
                it._spot = {wall, along, y: yy}; return;
            }
            const yy = y ?? 1.6;
            const g = framed(it, Math.min(slot * 0.7, 1.35 * scale), 1.3 * scale, (w, h) => {
                const c = cartelMesh(it);
                if (slot / 2 > w / 2 + 0.85) c.position.set(w / 2 + 0.45, Math.max(-h / 2, 1.25 - yy), 0.02); // à côté du cadre, à hauteur d'yeux d'enfant
                else c.position.set(Math.min(0, -w / 2 + 0.25), -h / 2 - 0.3, 0.02); // sinon dessous
                g.add(c);
                const b = audioBadge(it); b.position.set(c.position.x + 0.34, c.position.y, 0.02); g.add(b);
            });
            onWall(g, wall, along, yy, 0.03); scene.add(g);
            it._spot = {wall, along, y: yy};
        }
        /** Le petit casque d'audioguide à côté d'un cartel : un clic lance le commentaire de cette œuvre. */
        let badgeTex = null;
        function audioBadge(it) {
            if (!badgeTex) {
                const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
                x.fillStyle = '#111'; x.beginPath(); x.arc(64, 64, 60, 0, Math.PI * 2); x.fill();
                x.strokeStyle = '#fff'; x.lineWidth = 9; x.beginPath(); x.arc(64, 70, 32, Math.PI, 0); x.stroke();
                x.fillStyle = '#fff'; x.fillRect(26, 66, 16, 30); x.fillRect(86, 66, 16, 30);
                badgeTex = new THREE.CanvasTexture(c); badgeTex.colorSpace = THREE.SRGBColorSpace;
            }
            const m = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), new THREE.MeshBasicMaterial({map: badgeTex, transparent: true}));
            m.userData.audio = it; targets.push(m); return m;
        }
        function placeCenter(it, {x, z, rot}) {
            const m = it.settings?.model;
            it._spot = {center: true, x, z, rot};
            // Chaque élément est construit autour de (0, 0) dans un groupe placé et tourné comme sur le plan
            const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot || 0; scene.add(g); target = g;
            try {
                if (it.kind === 'decor' || it.kind === 'seat') model(m || (it.kind === 'seat' ? 'bench' : 'plant'), 0, 0, it);
                else if (it.kind === 'object' || m === 'vitrine') vitrine(it, 0, 0);
                else easel(it, 0, 0);
            } finally { target = null; }
        }
        function vitrine(it, x, z) {
            box(0.8, 1.0, 0.8, x, 0.5, z);
            const glass = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.85, 0.8), new THREE.MeshBasicMaterial({color: 0xe8f2f7, transparent: true, opacity: 0.18, depthWrite: false}));
            glass.position.set(x, 1.43, z); put(glass); const e = new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry), ink()); e.position.copy(glass.position); put(e);
            const g = framed({...it, kind: 'object'}, 0.62, 0.7); g.position.set(x, 1.42, z); put(g);
            const c = cartelMesh(it, 0.46); c.position.set(x, 0.62, z + 0.402); put(c);
            const b = audioBadge(it); b.position.set(x + 0.33, 0.62, z + 0.404); put(b);
            glass.userData.item = it; targets.push(glass);
        }
        function easel(it, x, z) {
            [-0.45, 0.45].forEach(dx => { const l = box(0.05, 1.9, 0.05, x + dx, 0.95, z); l.rotation.z = dx > 0 ? -0.06 : 0.06; });
            box(0.05, 1.7, 0.05, x, 0.85, z - 0.35).rotation.x = -0.25;
            box(1.0, 0.05, 0.12, x, 0.75, z + 0.05);
            const g = framed(it, 0.95, 1.1, (w, h) => { g.position.y = 0.8 + h / 2 + 0.08; const c = cartelMesh(it, 0.42); c.position.set(0, -h / 2 - 0.42, 0.02); g.add(c); const b = audioBadge(it); b.position.set(0.32, -h / 2 - 0.42, 0.02); g.add(b); });
            g.position.set(x, 1.4, z + 0.09); g.rotation.x = -0.06; put(g);
        }
        function lectern(x, z) {
            box(0.5, 1.05, 0.4, x, 0.52, z); const top = box(0.7, 0.05, 0.5, x, 1.1, z); top.rotation.x = -0.35;
            const t = textTexture(['Livre d’or', 'Signez ici'], {width: 520, sizes: [52, 30], border: 8});
            const p = plane(t.tex, 0.6, 0.6 / t.aspect); p.position.set(x, 1.15, z + 0.02); p.rotation.x = -1.22;
            p.userData.action = {type: 'book'}; targets.push(p); put(p);
            const t2 = textTexture(['Livre d’or'], {width: 400, sizes: [48], bg: null}); const p2 = plane(t2.tex, 0.55, 0.55 / t2.aspect, true); p2.position.set(x, 1.6, z); put(p2); p2.userData.action = {type: 'book'}; targets.push(p2);
        }
        function model(kind, x, z, it) {
            const w = 0xffffff;
            const touch = m => { if (it && m) { m.userData.item = it; } };
            if (kind === 'bench') { box(1.8, 0.08, 0.45, x, 0.46, z); [-0.8, 0.8].forEach(dx => box(0.08, 0.42, 0.4, x + dx, 0.21, z)); }
            else if (kind === 'chair') { box(0.48, 0.06, 0.48, x, 0.47, z); [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(([a, b]) => box(0.05, 0.45, 0.05, x + a, 0.22, z + b)); box(0.48, 0.55, 0.05, x, 0.78, z - 0.22); }
            else if (kind === 'sofa') { box(2.0, 0.42, 0.85, x, 0.21, z); box(2.0, 0.55, 0.2, x, 0.6, z - 0.33); box(0.2, 0.3, 0.85, x - 0.9, 0.55, z); box(0.2, 0.3, 0.85, x + 0.9, 0.55, z); }
            else if (kind === 'plant') { cyl(0.26, 0.2, 0.5, x, 0.25, z); [0, 1.2, 2.4, 3.6, 4.8].forEach((a, k) => { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.9 + (k % 2) * 0.3, 6), new THREE.MeshBasicMaterial({color: w})); leaf.position.set(x + Math.cos(a) * 0.12, 0.95, z + Math.sin(a) * 0.12); leaf.rotation.set(Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35); put(leaf); outline(leaf); }); }
            else if (kind === 'column') { cyl(0.28, 0.28, HEIGHT - 0.3, x, (HEIGHT - 0.3) / 2 + 0.15, z, w, 16); box(0.75, 0.15, 0.75, x, 0.075, z); box(0.75, 0.15, 0.75, x, HEIGHT - 0.075, z); }
            else if (kind === 'pedestal') { box(0.6, 1.0, 0.6, x, 0.5, z); }
            else if (kind === 'rope') { [-1, 1].forEach(dx => { cyl(0.04, 0.04, 0.95, x + dx, 0.48, z); cyl(0.14, 0.16, 0.05, x + dx, 0.03, z); }); const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x - 1, 0.9, z), new THREE.Vector3(x, 0.62, z), new THREE.Vector3(x + 1, 0.9, z)); put(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.02, 6), new THREE.MeshBasicMaterial({color: 0x8b1a1a}))); }
            else if (kind === 'rug') { const r = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshBasicMaterial({color: 0xf1ece4})); r.rotation.x = -Math.PI / 2; r.position.set(x, 0.01, z); put(r); outline(r); const r2 = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshBasicMaterial({color: 0xf1ece4})); r2.rotation.x = -Math.PI / 2; r2.position.set(x, 0.012, z); put(r2); outline(r2); }
            else if (kind === 'lamp') { cyl(0.18, 0.2, 0.04, x, 0.02, z); cyl(0.025, 0.025, 1.6, x, 0.82, z); cyl(0.18, 0.3, 0.35, x, 1.75, z); }
            else if (kind === 'vase') { const pts = [[0.1, 0], [0.2, 0.15], [0.22, 0.35], [0.12, 0.6], [0.09, 0.7], [0.14, 0.8]].map(([a, b]) => new THREE.Vector2(a, b)); box(0.5, 0.9, 0.5, x, 0.45, z); const v = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), new THREE.MeshBasicMaterial({color: w, side: THREE.DoubleSide})); v.position.set(x, 0.9, z); put(v); outline(v); }
            else if (kind === 'piano') { box(1.5, 1.2, 0.6, x, 0.6, z); box(1.5, 0.05, 0.3, x, 0.75, z + 0.42); box(0.7, 0.45, 0.35, x, 0.23, z + 0.95); }
            else if (kind === 'table') { box(1.6, 0.06, 0.9, x, 0.75, z); [[-0.7, -0.38], [0.7, -0.38], [-0.7, 0.38], [0.7, 0.38]].forEach(([a, b]) => box(0.06, 0.72, 0.06, x + a, 0.36, z + b)); }
            else if (kind === 'screen') { [-0.9, -0.3, 0.3, 0.9].forEach((dx, k) => { const p = box(0.6, 1.8, 0.03, x + dx, 0.9, z + (k % 2 ? 0.12 : 0)); p.rotation.y = k % 2 ? 0.35 : -0.35; }); }
            if (it?.title && (it.cartel || it.description)) { const c = cartelMesh(it, 0.38); c.position.set(x, 0.3, z + 0.7); c.rotation.x = -0.9; put(c); touch(c); const b = audioBadge(it); b.position.set(x + 0.3, 0.3, z + 0.7); b.rotation.x = -0.9; put(b); }
        }

        /* ── Caméra et déplacements ── */
        const updateCamera = () => { const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)); camera.position.copy(pos); camera.lookAt(pos.clone().add(dir)); dirty = true; };
        const clampPos = () => { pos.x = Math.max(-W / 2 + 0.6, Math.min(W / 2 - 0.6, pos.x)); pos.z = Math.max(-D / 2 + 0.6, Math.min(D / 2 - 0.6, pos.z)); };
        function glideTo(x, z, toYaw = yaw, toPitch = 0, ms = 1100) {
            const from = {x: pos.x, z: pos.z, yaw, pitch}, start = performance.now();
            let dy = toYaw - yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
            return new Promise(resolve => { anim = {from, x, z, yaw: from.yaw + dy, pitch: toPitch, start, ms, resolve}; });
        }
        function spotView(it) {
            const s = it._spot; if (!s) return null;
            if (s.center) { const r = s.rot || 0; return {x: Math.max(-W / 2 + 0.7, Math.min(W / 2 - 0.7, s.x + Math.sin(r) * 2.3)), z: Math.max(-D / 2 + 0.7, Math.min(D / 2 - 0.7, s.z + Math.cos(r) * 2.3)), yaw: 0, pitch: -0.06}; }
            const [nx, nz] = wallNormal(s.wall), dist = 2.4;
            let wx, wz;
            if (s.wall === 'back') { wx = s.along; wz = -D / 2; } if (s.wall === 'front') { wx = -s.along; wz = D / 2; }
            if (s.wall === 'left') { wx = -W / 2; wz = s.along; } if (s.wall === 'right') { wx = W / 2; wz = -s.along; }
            const x = wx + nx * dist, z = wz + nz * dist;
            return {x, z, yaw: Math.atan2(-nx, nz) + Math.PI * (s.wall === 'back' || s.wall === 'front' ? 0 : 0), pitch: 0};
        }
        // yaw : 0 = regarde vers le fond (−z) ; on calcule l'angle pour regarder le mur depuis le point devant
        const yawTowards = (fx, fz, tx, tz) => Math.atan2(tx - fx, -(tz - fz));

        const move = key => {
            if (anim) return;
            const fwd = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw)), step = 0.35;
            if (key === 'ArrowUp' || key === 'z' || key === 'w') pos.addScaledVector(fwd, step);
            if (key === 'ArrowDown' || key === 's') pos.addScaledVector(fwd, -step);
            if (key === 'ArrowLeft' || key === 'q' || key === 'a') yaw -= 0.13;
            if (key === 'ArrowRight' || key === 'd') yaw += 0.13;
            clampPos(); updateCamera();
        };
        const onKey = e => {
            if (e.target.closest?.('input,textarea,select,[contenteditable]')) return;
            if (!$('[data-lm-overlay]').hidden) { if (e.key === 'Escape') { closeOverlay(); e.preventDefault(); e.stopPropagation(); } return; }
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'z', 'q', 's', 'd', 'w', 'a'].includes(e.key)) { e.preventDefault(); move(e.key); }
        };
        container.addEventListener('keydown', onKey);

        let dragging = false, moved = false, lx = 0, ly = 0;
        const cv = renderer.domElement;
        cv.addEventListener('pointerdown', e => { dragging = true; moved = false; lx = e.clientX; ly = e.clientY; cv.setPointerCapture?.(e.pointerId); });
        cv.addEventListener('pointermove', e => {
            if (!dragging) { hover(e); return; }
            const dx = e.clientX - lx, dy = e.clientY - ly; if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
            if (!moved) return;
            yaw += dx * 0.005; pitch = Math.max(-0.6, Math.min(0.6, pitch - dy * 0.004)); lx = e.clientX; ly = e.clientY; updateCamera();
        });
        cv.addEventListener('pointerup', e => { if (!dragging) return; dragging = false; if (!moved) pick(e); });
        cv.addEventListener('wheel', e => { e.preventDefault(); move(e.deltaY < 0 ? 'ArrowUp' : 'ArrowDown'); }, {passive: false});
        function hit(e) {
            const r = cv.getBoundingClientRect();
            pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1; pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);
            return raycaster.intersectObjects(targets, false)[0];
        }
        function hover(e) { const h = hit(e); cv.style.cursor = h && !h.object.userData.floor ? 'pointer' : h ? 'crosshair' : 'default'; }
        function pick(e) {
            const h = hit(e); if (!h) return;
            const u = h.object.userData;
            if (u.floor) { const p = h.point; glideTo(Math.max(-W / 2 + 0.6, Math.min(W / 2 - 0.6, p.x)), Math.max(-D / 2 + 0.6, Math.min(D / 2 - 0.6, p.z)), yaw, pitch, 900); return; }
            if (u.action?.type === 'room') { stopTour(); enterRoom(u.action.index); return; }
            if (u.action?.type === 'exit') { opts.onExit?.(); return; }
            if (u.action?.type === 'book') { openBook(); return; }
            if (u.audio) { playItem(u.audio); return; }
            if (u.item) openItem(u.item);
        }

        function enterRoom(i, viaTour = false) {
            if (i < 0 || i >= rooms.length) return;
            buildRoom(i);
            pos.set(0, EYE, D / 2 - 1.2); yaw = 0; pitch = 0; clampPos(); updateCamera();
            if (!viaTour && rooms[i].intro) caption(`<strong>${esc(rooms[i].name || '')}</strong><p>${esc(rooms[i].intro)}</p>`, 7000);
            opts.onRoom?.(i);
        }

        /* ── Fiches, livre d'or, catalogue ── */
        let captionTimer = 0;
        function caption(html, ms = 0) {
            const el = $('[data-lm-caption]'); clearTimeout(captionTimer);
            if (!html) { el.hidden = true; return; }
            el.innerHTML = html; el.hidden = false;
            if (ms) captionTimer = setTimeout(() => { el.hidden = true; }, ms);
        }
        function closeOverlay() { const o = $('[data-lm-overlay]'); o.querySelectorAll('audio').forEach(a => a.pause()); o.hidden = true; o.innerHTML = ''; cv.focus(); }
        $('[data-lm-overlay]').addEventListener('click', e => { if (e.target === e.currentTarget) closeOverlay(); }); // clic à côté de la fiche : on la ferme
        function openItem(it) {
            const o = $('[data-lm-overlay]');
            o.innerHTML = `<div class="lm-sheet"><button type="button" class="lm-close" data-lm-close aria-label="Fermer">×</button>${it.image ? `<img src="${esc(it.image)}" alt="">` : ''}<div class="lm-sheet-text"><h3>${esc(it.title || 'Sans titre')}</h3>${it.cartel ? `<p class="lm-cartel">${esc(it.cartel).replace(/\n/g, '<br>')}</p>` : ''}${it.description ? `<p>${esc(it.description).replace(/\n/g, '<br>')}</p>` : ''}${it.audio ? `<audio controls src="${esc(it.audio)}"></audio>` : ''}</div></div>`;
            o.hidden = false;
            o.querySelector('[data-lm-close]').addEventListener('click', closeOverlay);
        }
        function bookHtml(list) {
            return (list || []).length ? (list || []).map(g => `<article><p>${esc(g.message).replace(/\n/g, '<br>')}</p><small>— ${esc(g.name || 'Anonyme')}${g.date ? ', ' + esc(g.date) : ''}</small></article>`).join('') : '<p class="lm-muted">Personne n’a encore signé. Soyez le premier !</p>';
        }
        function openBook() {
            const o = $('[data-lm-overlay]');
            o.innerHTML = `<div class="lm-sheet lm-book"><button type="button" class="lm-close" data-lm-close aria-label="Fermer">×</button><div class="lm-sheet-text"><h3>📖 Livre d’or</h3><div class="lm-book-list">${bookHtml(data.guestbook)}</div>
                <form data-lm-sign><label>Votre nom<input name="name" maxlength="80" required></label><label>Votre message<textarea name="message" rows="3" maxlength="2000" required></textarea></label><button type="submit">Signer le livre d’or</button></form></div></div>`;
            o.hidden = false;
            o.querySelector('[data-lm-close]').addEventListener('click', closeOverlay);
            o.querySelector('[data-lm-sign]').addEventListener('submit', async e => {
                e.preventDefault(); const f = e.target, name = f.name.value.trim(), message = f.message.value.trim();
                if (!name || !message) return;
                try { data.guestbook = opts.onSign ? await opts.onSign(name, message) : [...(data.guestbook || []), {name, message, date: new Date().toLocaleDateString('fr-FR')}]; o.querySelector('.lm-book-list').innerHTML = bookHtml(data.guestbook); f.reset(); }
                catch (err) { alert(err.message || 'Impossible de signer.'); }
            });
        }
        function catalogHtml() {
            return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(data.title || 'Musée')} — catalogue</title><style>
                body{font-family:Georgia,serif;color:#111;margin:2cm;} h1{font-size:30pt;margin:0} h2{font-size:20pt;border-bottom:2px solid #111;padding-bottom:4px;margin-top:1.4cm;page-break-before:always} h2:first-of-type{page-break-before:auto}
                .it{display:grid;grid-template-columns:7cm 1fr;gap:.8cm;margin:.7cm 0;page-break-inside:avoid} .it img{max-width:7cm;max-height:9cm;border:1px solid #111} h3{margin:0 0 4px;font-size:14pt} .c{color:#444;font-style:italic} .intro{font-size:12pt;max-width:16cm}
                </style></head><body><h1>${esc(data.title || 'Musée de famille')}</h1>${data.subtitle ? `<p class="c">${esc(data.subtitle)}</p>` : ''}${data.intro ? `<p class="intro">${esc(data.intro).replace(/\n/g, '<br>')}</p>` : ''}${data.author ? `<p>Conçu par ${esc(data.author)}</p>` : ''}
                ${rooms.map((r, i) => `<h2>Salle ${i + 1} — ${esc(r.name || '')}</h2>${r.intro ? `<p class="intro">${esc(r.intro).replace(/\n/g, '<br>')}</p>` : ''}${(r.items || []).filter(it => tourKinds(it.kind) && (it.title || it.image)).map((it, k) => `<div class="it"><div>${it.image ? `<img src="${esc(it.image)}" alt="">` : ''}</div><div><h3>${i + 1}.${k + 1} · ${esc(it.title || 'Sans titre')}</h3>${it.cartel ? `<p class="c">${esc(it.cartel).replace(/\n/g, '<br>')}</p>` : ''}${it.description ? `<p>${esc(it.description).replace(/\n/g, '<br>')}</p>` : ''}</div></div>`).join('')}`).join('')}
                </body></html>`;
        }
        function printCatalog() {
            const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
            document.body.appendChild(frame);
            frame.srcdoc = catalogHtml();
            frame.onload = () => { const imgs = [...frame.contentDocument.images]; Promise.all(imgs.map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))).then(() => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 60000); }); };
        }

        /* ── Visite guidée : on va d'œuvre en œuvre, avec l'enregistrement ou la voix de synthèse ── */
        let tour = null, audio = null, playing = null; // visite guidée, son en cours, œuvre écoutée au casque
        function stopAudio() { if (audio) { const a = audio; audio = null; a.pause(); a.onended?.(); } playing = null; try { window.speechSynthesis?.cancel(); } catch (_) {} } // l'attente en cours se termine aussi
        function tourStops() {
            const stops = [];
            rooms.forEach((r, i) => { stops.push({room: i}); (r.items || []).forEach(it => { if (tourKinds(it.kind) && Number(it.in_tour ?? 1)) stops.push({room: i, item: it}); }); });
            return stops;
        }
        function speak(text) {
            return new Promise(resolve => {
                if (!voice || !window.speechSynthesis || !text) { setTimeout(resolve, Math.max(4500, String(text || '').split(/\s+/).length * 330)); return; }
                const u = new SpeechSynthesisUtterance(text); u.lang = 'fr-FR'; u.rate = 0.98 * voiceRate;
                const fr = speechSynthesis.getVoices().find(v => /^fr/i.test(v.lang)); if (fr) u.voice = fr;
                u.onend = u.onerror = () => resolve(); speechSynthesis.speak(u);
            });
        }
        function play(url) {
            return new Promise(resolve => { audio = new Audio(url); audio.onended = audio.onerror = () => resolve(); audio.play().catch(() => resolve()); });
        }
        async function runStop(k) {
            const t = tour; if (!t) return;
            const run = t.run = (t.run || 0) + 1; t.done = false;
            clearTimeout(t.timer); t.index = k; stopAudio();
            const stop = t.stops[k]; if (!stop) { stopTour(); caption('<strong>Fin de la visite</strong><p>Merci de votre visite !' + (data.settings?.guestbook === false ? '' : ' Laissez un mot dans le livre d’or.') + '</p>', 8000); return; }
            $('[data-lm-tourpos]').textContent = `${k + 1} / ${t.stops.length}`;
            if (stop.room !== roomIndex) enterRoom(stop.room, true);
            const room = rooms[stop.room]; let text = '', url = '';
            if (!stop.item) {
                await glideTo(0, D / 2 - 1.4, 0, 0.05, 900);
                if (t !== tour || t.run !== run || t.paused) return; // mis en pause pendant le déplacement : la reprise rejoue cet arrêt
                caption(`<span class="lm-kicker">Salle ${stop.room + 1}</span><strong>${esc(room.name || '')}</strong>${room.intro ? `<p>${esc(room.intro)}</p>` : ''}`);
                text = [`Salle ${stop.room + 1}. ${room.name || ''}.`, room.intro || ''].join(' '); url = room.audio || '';
            } else {
                const it = stop.item, v = spotView(it);
                if (v) { const yw = it._spot.center ? yawTowards(v.x, v.z, it._spot.x, it._spot.z) : yawTowards(v.x, v.z, v.x - wallNormal(it._spot.wall)[0], v.z - wallNormal(it._spot.wall)[1]); await glideTo(v.x, v.z, yw, v.pitch); }
                if (t !== tour || t.run !== run || t.paused) return;
                caption(`<strong>${esc(it.title || '')}</strong>${it.cartel ? `<p class="lm-cartel">${esc(it.cartel).replace(/\n/g, '<br>')}</p>` : ''}${it.description ? `<p>${esc(it.description)}</p>` : ''}`);
                text = [it.title, it.cartel, it.description].filter(Boolean).join('. '); url = it.audio || '';
            }
            if (t !== tour || t.run !== run) return;
            await (url ? play(url) : speak(text));
            if (t !== tour || t.run !== run) return;
            t.done = true;
            if (t.paused) return;
            t.timer = setTimeout(() => { if (tour === t && !t.paused && t.run === run) runStop(k + 1); }, 1400);
        }
        /** Audioguide d'une seule œuvre (le casque à côté du cartel) : un 2e clic l'arrête. */
        async function playItem(it) {
            if (playing === it) { stopAudio(); caption(''); return; }
            stopTour(); stopAudio(); playing = it;
            caption(`<span class="lm-kicker">🎧 Audioguide</span><strong>${esc(it.title || '')}</strong>${it.cartel ? `<p class="lm-cartel">${esc(it.cartel).replace(/\n/g, '<br>')}</p>` : ''}${it.description ? `<p>${esc(it.description)}</p>` : ''}`);
            await (it.audio ? play(it.audio) : speak([it.title, it.cartel, it.description].filter(Boolean).join('. ')));
            if (playing === it) { playing = null; setTimeout(() => { if (!playing && !tour) caption(''); }, 1500); }
        }
        function startTour(from = 0) {
            playing = null;
            stopTour(); const stops = tourStops(); if (!stops.length) return;
            tour = {stops, index: 0, paused: false};
            $('[data-lm-tourbar]').hidden = false; $('[data-lm-tour]').textContent = '■ Arrêter la visite';
            runStop(from);
        }
        function stopTour() {
            if (!tour) return; clearTimeout(tour.timer); tour = null; stopAudio(); caption('');
            $('[data-lm-tourbar]').hidden = true; $('[data-lm-tour]').textContent = '▶ Visite guidée';
        }
        $('[data-lm-tour]').addEventListener('click', () => tour ? stopTour() : startTour(0));
        container.querySelectorAll('[data-lm-t]').forEach(b => b.addEventListener('click', () => {
            if (!tour) return; const a = b.dataset.lmT;
            if (a === 'stop') return stopTour();
            if (a === 'pause') {
                tour.paused = !tour.paused; b.textContent = tour.paused ? '▶' : '⏸';
                if (tour.paused) { clearTimeout(tour.timer); audio?.pause(); try { speechSynthesis.pause(); } catch (_) {} return; }
                if (audio && !audio.ended && !tour.done) { audio.play().catch(() => {}); return; }
                if (!tour.done) { try { if (speechSynthesis.paused && speechSynthesis.speaking) { speechSynthesis.resume(); return; } } catch (_) {} }
                runStop(tour.done ? tour.index + 1 : tour.index); return;
            }
            clearTimeout(tour.timer); tour.paused = false; container.querySelector('[data-lm-t="pause"]').textContent = '⏸';
            runStop(Math.max(0, tour.index + (a === 'next' ? 1 : -1)));
        }));
        $('[data-lm-rooms]').addEventListener('change', e => { stopTour(); enterRoom(Number(e.target.value)); cv.focus(); });
        $('[data-lm-book]')?.addEventListener('click', openBook);
        $('[data-lm-catalog]').addEventListener('click', printCatalog);
        $('[data-lm-rate]').addEventListener('change', e => { // vaut à partir du cartel suivant
            voiceRate = Number(e.target.value) || 1; try { localStorage.setItem('lcnda-museum-voice-rate', String(voiceRate)); } catch (_) {}
            cv.focus();
        });
        $('[data-lm-voice]').addEventListener('click', e => { voice = !voice; e.target.textContent = voice ? '🔊' : '🔇'; if (!voice) try { speechSynthesis.cancel(); } catch (_) {} });
        $('[data-lm-exit]')?.addEventListener('click', () => opts.onExit?.());
        $('[data-lm-edit]')?.addEventListener('click', () => opts.onEdit?.(roomIndex));

        /* ── Rendu ── */
        const resize = () => { const r = mountEl.getBoundingClientRect(); camera.aspect = Math.max(1, r.width) / Math.max(1, r.height); camera.updateProjectionMatrix(); renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false); dirty = true; };
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; ro?.observe(mountEl); window.addEventListener('resize', resize);
        function frame(now) {
            if (disposed) return;
            if (anim) {
                const t = Math.min(1, (now - anim.start) / anim.ms), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                pos.x = anim.from.x + (anim.x - anim.from.x) * e; pos.z = anim.from.z + (anim.z - anim.from.z) * e;
                yaw = anim.from.yaw + (anim.yaw - anim.from.yaw) * e; pitch = anim.from.pitch + (anim.pitch - anim.from.pitch) * e;
                updateCamera(); if (t >= 1) { const r = anim.resolve; anim = null; r(); }
            }
            if (dirty && scene) { renderer.render(scene, camera); dirty = false; }
            requestAnimationFrame(frame);
        }
        if (!rooms.length) {
            container.querySelector('.lm-canvas').innerHTML = '<div class="lm-empty">Ce musée n’a pas encore de salle.</div>';
            return {destroy() { disposed = true; ro?.disconnect(); window.removeEventListener('resize', resize); container.removeEventListener('keydown', onKey); renderer.dispose(); renderer.forceContextLoss?.(); container.innerHTML = ''; }, goRoom() {}, startTour() {}, stopTour() {}};
        }
        resize(); enterRoom(Math.max(0, Math.min(rooms.length - 1, Number(opts.startRoom) || 0))); requestAnimationFrame(frame);
        setTimeout(() => cv.focus(), 50);
        return {
            destroy() { disposed = true; stopTour(); stopAudio(); ro?.disconnect(); window.removeEventListener('resize', resize); container.removeEventListener('keydown', onKey); disposeScene(); renderer.dispose(); renderer.forceContextLoss?.(); container.innerHTML = ''; },
            goRoom: i => enterRoom(i), startTour, stopTour,
        };
    }
    window.LCNDA_MUSEUM_VIEWER = {mount, MODELS, layoutRoom, SIZES, roomSize, alongOf, wallLimit, halfWidth, museumDoors, museumRects, roomKey};
})();
