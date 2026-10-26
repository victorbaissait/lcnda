/**
 * ✨ Trésors — 🗺️ Lieux et voyages :
 *  - 🎞️ Le film des migrations : année après année, chaque personne de l'arbre se déplace de lieu en lieu sur la carte ; le film
 *    se joue sur place et s'enregistre en vidéo (WebM), à télécharger ou à garder dans les médias.
 *  - 🪟 Hier / aujourd'hui : un village de l'arbre, la carte de Cassini (ou d'État-major) et la carte d'aujourd'hui l'une sur l'autre,
 *    un rideau à faire glisser (la Carte a déjà le mode « superposition » avec l'opacité ; ici, le rideau, lieu par lieu).
 *  - 🚶 La promenade guidée : les lieux d'une vie dans l'ordre, l'histoire de chaque étape lue à voix haute, l'itinéraire, et en
 *    marchant, la lecture qui se lance toute seule à l'arrivée (position du téléphone).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const F = ext.tresorFeatures = ext.tresorFeatures || [];
    const A = () => window.LCNDA_APP;
    const COLORS = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98', '#117a65', '#a04000', '#2e4053', '#d35400', '#1f618d'];
    /* la projection des tuiles (Web Mercator) : longitude, latitude → pixels du monde au zoom z */
    const wx = (lng, z) => (lng + 180) / 360 * 256 * 2 ** z;
    const wy = (lat, z) => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z; };
    /** tous les fonds de carte de l'app (Réglages › Cartes et fonds de carte), au choix */
    const bgOptions = sel => A().mapBackgroundSelectHtml ? A().mapBackgroundSelectHtml(sel) : `<option value="color">OpenStreetMap</option><option value="light">Clair</option>`;
    const tile = (bg, z, x, y) => A().mapTileUrl ? A().mapTileUrl(bg, z, x, y) : `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    const km = (a, b) => { const R = 6371, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r, h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
    const geo = (tr, id) => { const p = id && tr.places[id]; return p && p.lat != null && p.lng != null ? {lat: p.lat, lng: p.lng, name: p.name, id} : null; };

    /* ── 🎞️ Le film des migrations ── */
    /** le parcours de chacun : [{p, steps: [{y, lat, lng, place}]}] (lieux datés et placés sur la carte) */
    function tracks(T, tr) {
        return tr.people.map(p => {
            const st = [], add = (y, pl) => { const g = geo(tr, pl); if (y && g && !(st.length && st.at(-1).place === g.name && st.at(-1).y <= y)) st.push({y, ...g, place: g.name}); };
            add(p.by, p.bplace); (tr.evBy.get('p' + p.id) || []).filter(e => e.tag !== 'BIRT' && e.tag !== 'DEAT').forEach(e => add(e.y, e.place));
            (tr.fams.get(p.id) || []).forEach(f => add(f.my, f.mplace)); add(p.dy, p.dplace);
            st.sort((a, b) => a.y - b.y); return {p, steps: st};
        }).filter(t => t.steps.length);
    }
    /** où est quelqu'un en l'année y (entre deux lieux, il voyage pendant l'année d'avant) → {lat, lng, moving} | null */
    function where(t, y) {
        const s = t.steps, end = t.p.dy || (t.p.living ? 9999 : s.at(-1).y + 1); if (y < s[0].y || y > end) return null;
        let k = s.findIndex(x => x.y > y); if (k === -1) return {lat: s.at(-1).lat, lng: s.at(-1).lng};
        const a = s[k - 1], b = s[k], f = Math.max(0, Math.min(1, (y - (b.y - 1)) / 1));
        return a ? {lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, moving: f > 0 && f < 1} : null;
    }
    function filmScene(T, tr, W = 1280, H = 720) {
        const ts = tracks(T, tr), all = ts.flatMap(t => t.steps); if (!all.length) return null;
        const lat0 = Math.min(...all.map(s => s.lat)), lat1 = Math.max(...all.map(s => s.lat)), lng0 = Math.min(...all.map(s => s.lng)), lng1 = Math.max(...all.map(s => s.lng));
        let z = 12; while (z > 2 && (wx(lng1, z) - wx(lng0, z) > W * 0.75 || wy(lat0, z) - wy(lat1, z) > H * 0.7)) z--;
        const cx = (wx(lng0, z) + wx(lng1, z)) / 2, cy = (wy(lat0, z) + wy(lat1, z)) / 2, ox = cx - W / 2, oy = cy - H / 2;
        const names = [...new Set(ts.map(t => t.p.last || '?'))], color = t => COLORS[names.indexOf(t.p.last || '?') % COLORS.length];
        const y0 = Math.min(...all.map(s => s.y)) - 1, y1 = Math.min(new Date().getFullYear(), Math.max(...all.map(s => s.y), ...ts.map(t => t.p.dy || 0)) + 1);
        const places = new Map(); all.forEach(s => places.set(s.place, s));
        return {ts, z, ox, oy, W, H, y0, y1, color, names, places: [...places.values()], px: (lat, lng) => [wx(lng, z) - ox, wy(lat, z) - oy]};
    }
    async function filmBackground(sc, bg) {
        const c = document.createElement('canvas'); c.width = sc.W; c.height = sc.H; const x = c.getContext('2d'); x.fillStyle = '#eef0ea'; x.fillRect(0, 0, sc.W, sc.H);
        const n = 2 ** sc.z, jobs = [];
        for (let tx = Math.floor(sc.ox / 256); tx <= Math.floor((sc.ox + sc.W) / 256); tx++) for (let ty = Math.floor(sc.oy / 256); ty <= Math.floor((sc.oy + sc.H) / 256); ty++) {
            if (ty < 0 || ty >= n) continue; const wxp = ((tx % n) + n) % n;
            jobs.push(new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; let tried = false; im.onload = () => { try { x.drawImage(im, tx * 256 - sc.ox, ty * 256 - sc.oy); } catch (_) {} res(); };
                im.onerror = () => { if (!tried && A().offlineTileUrl) { tried = true; im.src = A().offlineTileUrl(sc.z, wxp, ty); } else res(); }; im.src = tile(bg, sc.z, wxp, ty); setTimeout(res, 6000); }));
        }
        await Promise.all(jobs);
        x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(0, 0, sc.W, sc.H);
        return c;
    }
    function drawFrame(ctx, sc, bgc, y, title) {
        const {W, H} = sc; ctx.drawImage(bgc, 0, 0);
        ctx.font = '600 15px system-ui'; ctx.fillStyle = 'rgba(20,20,20,.75)'; ctx.textAlign = 'left';
        sc.places.forEach(s => { const [x, yy] = sc.px(s.lat, s.lng); ctx.beginPath(); ctx.arc(x, yy, 3, 0, 7); ctx.fill(); ctx.fillText(s.place, x + 6, yy - 6); });
        let alive = 0;
        sc.ts.forEach(t => {
            const w = where(t, y); if (!w) return; alive++;
            // la trace : les lieux déjà traversés
            const past = t.steps.filter(s => s.y <= y); ctx.strokeStyle = sc.color(t); ctx.globalAlpha = 0.35; ctx.lineWidth = 2; ctx.beginPath(); past.forEach((s, k) => { const [x, yy] = sc.px(s.lat, s.lng); k ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }); const [hx, hy] = sc.px(w.lat, w.lng); ctx.lineTo(hx, hy); ctx.stroke(); ctx.globalAlpha = 1;
            const born = t.p.by && Math.abs(y - t.p.by) < 0.6; if (born) { ctx.strokeStyle = sc.color(t); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx, hy, 8 + (y - t.p.by + 0.6) * 18, 0, 7); ctx.stroke(); }
            ctx.fillStyle = sc.color(t); ctx.beginPath(); ctx.arc(hx, hy, w.moving ? 7 : 5.5, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
            if (w.moving) { ctx.fillStyle = '#111'; ctx.font = '600 14px system-ui'; ctx.fillText(t.p.first || T_name(t.p), hx + 9, hy + 4); }
        });
        ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fillRect(18, 18, 300, 92); ctx.fillStyle = '#1d2330'; ctx.font = '800 54px system-ui'; ctx.fillText(String(Math.floor(y)), 32, 76); ctx.font = '14px system-ui'; ctx.fillText(`${alive} personne${alive > 1 ? 's' : ''} en vie · ${title}`.slice(0, 44), 34, 99);
        ctx.font = '13px system-ui'; sc.names.slice(0, 8).forEach((n, k) => { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(W - 170, 18 + k * 22, 152, 20); ctx.fillStyle = COLORS[k % COLORS.length]; ctx.beginPath(); ctx.arc(W - 158, 28 + k * 22, 5, 0, 7); ctx.fill(); ctx.fillStyle = '#1d2330'; ctx.fillText(n, W - 146, 32 + k * 22); });
        ctx.font = '11px system-ui'; ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText('Fond de carte © OpenStreetMap, Esri', 20, H - 10);
    }
    const T_name = p => [p.first, p.last].filter(Boolean).join(' ');
    async function renderFilm(host, T) {
        const tr = await T.tree(), sc = filmScene(T, tr);
        if (!sc) { host.innerHTML = '<p class="h-tr-muted">Il faut des lieux placés sur la carte (latitude et longitude) et datés pour faire le film.</p>'; return; }
        host.innerHTML = `<div class="h-tr-row h-tr-noprint"><label>Durée du film<select data-fm-d><option value="20">20 s</option><option value="40" selected>40 s</option><option value="60">1 min</option><option value="120">2 min</option></select></label>
            <label>Fond<select data-fm-bg>${bgOptions('light')}<option value="grid">Sans carte</option></select></label>
            <button type="button" class="button" data-fm-play>▶ Jouer</button><button type="button" class="button secondary" data-fm-rec>⏺ Enregistrer la vidéo</button><span class="h-tr-muted" data-fm-st>${sc.ts.length} parcours, de ${sc.y0 + 1} à ${sc.y1}</span></div>
            <canvas class="h-tr-canvas" width="${sc.W}" height="${sc.H}" data-fm-c></canvas><input type="range" data-fm-y min="${sc.y0}" max="${sc.y1}" step="0.1" value="${sc.y0}" style="width:100%">`;
        const cv = host.querySelector('[data-fm-c]'), ctx = cv.getContext('2d'), range = host.querySelector('[data-fm-y]'), stEl = host.querySelector('[data-fm-st]'), title = `famille ${T.start(tr)?.last || ''}`.trim();
        let bgc = null, bgKey = '', raf = 0;
        const bg = async () => { const k = host.querySelector('[data-fm-bg]').value; if (k !== bgKey) { bgKey = k; stEl.textContent = 'Le fond de carte se charge…'; bgc = k === 'grid' ? await filmBackground({...sc, z: 0, ox: 1e9, oy: 1e9}, k) : await filmBackground(sc, k); stEl.textContent = `${sc.ts.length} parcours, de ${sc.y0 + 1} à ${sc.y1}`; } return bgc; };
        const frame = y => drawFrame(ctx, sc, bgc, y, title);
        const play = (secs, onEnd) => { cancelAnimationFrame(raf); const t0 = performance.now(), span = sc.y1 - sc.y0;
            const step = now => { const f = Math.min(1, (now - t0) / (secs * 1000)), y = sc.y0 + span * f; range.value = y; frame(y); if (f < 1 && (host.isConnected || onEnd)) raf = requestAnimationFrame(step); else onEnd?.(); }; raf = requestAnimationFrame(step); };
        await bg(); frame(sc.y0);
        range.addEventListener('input', () => { cancelAnimationFrame(raf); frame(Number(range.value)); });
        host.querySelector('[data-fm-bg]').addEventListener('change', async () => { await bg(); frame(Number(range.value)); });
        host.querySelector('[data-fm-play]').addEventListener('click', async () => { await bg(); play(Number(host.querySelector('[data-fm-d]').value)); });
        host.querySelector('[data-fm-rec]').addEventListener('click', async () => {
            if (!window.MediaRecorder || !cv.captureStream) return T.toast('Ce navigateur ne sait pas enregistrer de vidéo.', 'error');
            await bg(); const blob = await record(Number(host.querySelector('[data-fm-d]').value)); if (!blob) return;
            T.download('film-des-migrations.webm', blob);
            if (await A().confirmBox('La vidéo est téléchargée. La garder aussi dans les médias de l’application ?', {title: 'Garder la vidéo ?', okLabel: 'Garder'})) { try { await T.upload(blob, 'video', `Le film des migrations — ${title}`, 'film-des-migrations.webm'); T.toast('Vidéo gardée dans les médias.', 'success'); } catch (err) { T.toast(err.message, 'error'); } }
        });
        /** enregistre le film (secondes) → une vidéo WebM */
        const record = secs => new Promise(res => {
            const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '', chunks = [];
            let rec; try { rec = new MediaRecorder(cv.captureStream(30), mime ? {mimeType: mime, videoBitsPerSecond: 4e6} : {}); } catch (err) { T.toast('Enregistrement impossible : ' + err.message, 'error'); return res(null); }
            rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); }; rec.onstop = () => { stEl.textContent = 'Vidéo prête.'; res(new Blob(chunks, {type: 'video/webm'})); };
            stEl.textContent = '🔴 Enregistrement…'; rec.start(500); play(secs, () => setTimeout(() => rec.stop(), 400));
        });
        ext.tresorFilm.record = record;
    }
    F.push({key: 'film-migrations', group: 'lieux', icon: '🎞️', title: 'Le film des migrations', desc: 'Année après année, chacun se déplace sur la carte, de sa naissance à sa mort ; le film s’enregistre en vidéo.', render: renderFilm});
    ext.tresorFilm = {tracks, where, filmScene};

    /* ── 🪟 Hier / aujourd'hui (le rideau) ── */
    const OLD = [['cassini', 'Carte de Cassini (XVIIIe s.)'], ['cassini_royal', 'Cassini, exemplaire du roi'], ['etatmajor', 'Carte d’État-major (1820-1866)'], ['ohm', 'OpenHistoricalMap']];
    async function renderCurtain(host, T) {
        const tr = await T.tree(), uses = new Map();
        tr.events.forEach(e => { if (geo(tr, e.place)) uses.set(e.place, (uses.get(e.place) || 0) + 1); });
        const pls = [...uses].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({...geo(tr, id), n}));
        if (!pls.length) { host.innerHTML = '<p class="h-tr-muted">Aucun lieu de l’arbre n’est placé sur la carte (latitude et longitude).</p>'; return; }
        host.innerHTML = `<div class="h-tr-row h-tr-noprint"><label>Le lieu<select data-cu-p>${pls.map(p => `<option value="${p.id}">${T.esc(p.name)} (${p.n})</option>`).join('')}</select></label>
            <label>Hier<select data-cu-old>${OLD.map(([k, l]) => `<option value="${k}">${T.esc(l)}</option>`).join('')}</select></label><label>Aujourd’hui<select data-cu-now>${bgOptions('color')}</select></label><label>Zoom<input type="range" data-cu-z min="10" max="16" value="14"></label>
            <span class="h-tr-muted">Fais glisser le rideau (ou les flèches du clavier).</span></div>
            <div class="h-tr-curtain" data-cu tabindex="0" aria-label="Rideau entre la carte d’hier et celle d’aujourd’hui"><div class="h-tr-cu-layer" data-cu-now></div><div class="h-tr-cu-layer h-tr-cu-old" data-cu-then></div><div class="h-tr-cu-bar" data-cu-bar><span>◀ ▶</span></div><b class="h-tr-cu-lab l">Hier</b><b class="h-tr-cu-lab r">Aujourd’hui</b><i class="h-tr-cu-pin"></i></div>
            <p class="h-tr-muted">Cartes : Géoplateforme IGN (Cassini, État-major), © OpenStreetMap, Esri. Dans l’onglet Carte, le mode « superposition » compare aussi deux fonds avec l’opacité.</p>`;
        const box = host.querySelector('[data-cu]'), now = host.querySelector('[data-cu-now]'), then = host.querySelector('[data-cu-then]'), bar = host.querySelector('[data-cu-bar]');
        let cut = 50;
        const setCut = v => { cut = Math.max(0, Math.min(100, v)); then.style.clipPath = `inset(0 ${100 - cut}% 0 0)`; bar.style.left = cut + '%'; };
        const tiles = (bg, z, p) => { const W = box.clientWidth || 900, H = box.clientHeight || 480, cx = wx(p.lng, z), cy = wy(p.lat, z), ox = cx - W / 2, oy = cy - H / 2, n = 2 ** z; let h = '';
            for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + W) / 256); tx++) for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + H) / 256); ty++) if (ty >= 0 && ty < n) h += `<img draggable="false" referrerpolicy="no-referrer" alt="" src="${tile(bg, z, ((tx % n) + n) % n, ty)}" style="left:${Math.round(tx * 256 - ox)}px;top:${Math.round(ty * 256 - oy)}px">`;
            return h; };
        const draw = () => { const p = pls.find(x => String(x.id) === host.querySelector('[data-cu-p]').value) || pls[0], z = Number(host.querySelector('[data-cu-z]').value); now.innerHTML = tiles(host.querySelector('[data-cu-now]').value || 'color', z, p); then.innerHTML = tiles(host.querySelector('[data-cu-old]').value, z, p); setCut(cut); };
        host.querySelectorAll('[data-cu-p],[data-cu-old],[data-cu-now],[data-cu-z]').forEach(el => el.addEventListener('change', draw));
        const fromEvent = e => { const r = box.getBoundingClientRect(); setCut((e.clientX - r.left) / r.width * 100); };
        box.addEventListener('pointerdown', e => { box.setPointerCapture(e.pointerId); fromEvent(e); const mv = ev => fromEvent(ev), up = () => { box.removeEventListener('pointermove', mv); box.removeEventListener('pointerup', up); }; box.addEventListener('pointermove', mv); box.addEventListener('pointerup', up); });
        box.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') { setCut(cut - 5); e.preventDefault(); } if (e.key === 'ArrowRight') { setCut(cut + 5); e.preventDefault(); } });
        draw();
    }
    F.push({key: 'hier-aujourdhui', group: 'lieux', icon: '🪟', title: 'Hier / aujourd’hui', desc: 'Le village des ancêtres sur la carte de Cassini et sur la carte d’aujourd’hui, avec un rideau à faire glisser.', render: renderCurtain});

    /* ── 🚶 La promenade guidée ── */
    /** les étapes d'une promenade : les lieux (placés) de la vie de quelqu'un ou des naissances de ses ancêtres, avec ce qui s'y est passé */
    function walkStops(T, tr, pid, mode) {
        const p = tr.byId.get(pid); if (!p) return [];
        const facts = [], f = q => (q?.gender === 'female' ? 'e' : ''), push = (y, d, pl, txt) => { const g = geo(tr, pl); if (g) facts.push({y: y || 0, d, g, txt}); };
        const lifeOf = q => {
            push(q.by, q.bd, q.bplace, `Ici est né${f(q)} ${T.name(q)}, ${q.bd ? 'le ' : 'en '}${T.dateFr(q.bd, q.by)}.`);
            (tr.evBy.get('p' + q.id) || []).filter(e => !['BIRT', 'DEAT'].includes(e.tag) && e.place).forEach(e => push(e.y, e.d, e.place, `Ici, ${e.d || e.y ? (e.d ? 'le ' : 'en ') + T.dateFr(e.d, e.y) : ''}, ${T.name(q)} : ${e.label.toLowerCase()}${e.what ? ` (${e.what})` : ''}.`));
            (tr.fams.get(q.id) || []).forEach(fa => { const o = tr.byId.get(fa.a === q.id ? fa.b : fa.a); push(fa.my, fa.md, fa.mplace, `Ici, ${fa.my ? (fa.md ? 'le ' : 'en ') + T.dateFr(fa.md, fa.my) : ''}, ${T.name(q)} a épousé ${o ? T.name(o) : 'son conjoint'}.`); });
            push(q.dy, q.dd, q.dplace, `Ici est mort${f(q)} ${T.name(q)}, ${q.dd ? 'le ' : 'en '}${T.dateFr(q.dd, q.dy)}${q.by && q.dy ? `, à ${T.ageAt(q, q.dd, q.dy)} ans` : ''}.`);
        };
        if (mode === 'anc') [p, ...T.ancestors(tr, pid, 6).map(a => tr.byId.get(a.id))].filter(Boolean).forEach(q => push(q.by, q.bd, q.bplace, `Ici est né${f(q)} ${T.name(q)}, ${q.bd ? 'le ' : 'en '}${T.dateFr(q.bd, q.by)}${q.occ ? ` ; ${q.gender === 'female' ? 'elle' : 'il'} sera ${q.occ}` : ''}.`));
        else lifeOf(p);
        facts.sort((a, b) => a.y - b.y || String(a.d).localeCompare(String(b.d)));
        const stops = []; facts.forEach(x => { const last = stops.at(-1); if (last && last.name === x.g.name) last.texts.push(x.txt); else stops.push({...x.g, texts: [x.txt], y: x.y}); });
        // les phrases « Ici, le … » d'une même étape : sans « Ici » répété
        stops.forEach((s, k) => { s.text = s.texts.map((t, j) => (j ? t.replace(/^Ici, /, 'Puis, ').replace(/^Ici /, 'C’est aussi ici que ') : t)).join(' '); s.km = k ? km(stops[k - 1], s) : 0; });
        return stops;
    }
    async function renderWalk(host, T) {
        const tr = await T.tree(), st = T.start(tr);
        host.innerHTML = `<form class="h-tr-panel h-tr-row h-tr-noprint" data-wk><div style="min-width:260px"><span class="pk-lab">La promenade de</span>${T.personField('who', tr.people.find(p => p.bplace && p.dplace && !p.living)?.id || st?.id)}</div>
            <label>Le parcours<select name="mode"><option value="life">les lieux de sa vie</option><option value="anc">les villages de ses ancêtres</option></select></label>
            <button type="button" class="button" data-wk-all>🔊 Tout le guide</button><button type="button" class="button secondary" data-wk-gps>📍 Me guider en marchant</button><button type="button" class="button secondary" data-wk-stop>⏹ Silence</button><button type="button" class="button secondary" onclick="print()">🖨 Imprimer</button></form>
            <p class="h-tr-muted h-tr-noprint" data-wk-gps-st></p><ol class="h-tr-walk" data-wk-list></ol>`;
        const form = host.querySelector('[data-wk]'), list = host.querySelector('[data-wk-list]'), gpsSt = host.querySelector('[data-wk-gps-st]');
        let stops = [], watch = null, done = new Set();
        const draw = () => { stops = walkStops(T, tr, Number(form.elements.who.value), form.elements.mode.value); done = new Set();
            const total = stops.reduce((n, s) => n + s.km, 0);
            list.innerHTML = stops.length ? stops.map((s, k) => `<li class="h-tr-panel h-tr-print" data-wk-i="${k}"><div class="h-tr-row" style="justify-content:space-between"><b>📍 ${T.esc(s.name)}</b><small class="h-tr-muted">${k ? `${s.km < 10 ? s.km.toFixed(1) : Math.round(s.km)} km depuis l’étape d’avant` : 'Départ'}</small></div><p>${T.esc(s.text)}</p>
                <p class="h-tr-noprint"><button type="button" class="h-tr-link" data-wk-say="${k}">🔊 Écouter</button> · <a href="https://www.openstreetmap.org/directions?route=%3B${s.lat}%2C${s.lng}" target="_blank" rel="noopener">🧭 Itinéraire</a> · <a href="https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=15/${s.lat}/${s.lng}" target="_blank" rel="noopener">Carte</a></p></li>`).join('') + `<p class="h-tr-muted">${stops.length} étape${stops.length > 1 ? 's' : ''} · ${Math.round(total)} km en tout (à vol d’oiseau)</p>` : '<p class="h-tr-muted">Aucun lieu placé sur la carte pour cette personne.</p>'; };
        const sayStop = async k => { const s = stops[k]; if (!s) return; list.querySelectorAll('.is-playing').forEach(x => x.classList.remove('is-playing')); list.querySelector(`[data-wk-i="${k}"]`)?.classList.add('is-playing'); await T.say(`${s.name}. ${s.text}`); list.querySelector(`[data-wk-i="${k}"]`)?.classList.remove('is-playing'); };
        form.addEventListener('change', draw);
        host.addEventListener('click', async e => {
            const s = e.target.closest('[data-wk-say]'); if (s) { T.hush(); sayStop(Number(s.dataset.wkSay)); return; }
            if (e.target.closest('[data-wk-stop]')) { T.hush(); if (watch != null) { navigator.geolocation.clearWatch(watch); watch = null; gpsSt.textContent = ''; } return; }
            if (e.target.closest('[data-wk-all]')) { T.hush(); const my = Symbol(); host._walk = my; for (let k = 0; k < stops.length && host._walk === my && host.isConnected; k++) await sayStop(k); return; }
            if (e.target.closest('[data-wk-gps]')) {
                if (!navigator.geolocation) return T.toast('La position n’est pas disponible sur cet appareil.', 'error');
                if (watch != null) navigator.geolocation.clearWatch(watch);
                gpsSt.textContent = '📍 Je cherche ta position… (l’histoire de chaque étape se lira toute seule à moins de 300 m)';
                watch = navigator.geolocation.watchPosition(pos => { if (!host.isConnected) { navigator.geolocation.clearWatch(watch); watch = null; T.hush(); return; } // page quittée : on ne suit plus
                    const me = {lat: pos.coords.latitude, lng: pos.coords.longitude}; let best = -1, bd = 1e9; stops.forEach((s, k) => { const d = km(me, s); if (d < bd) { bd = d; best = k; } });
                    gpsSt.textContent = best >= 0 ? `📍 Étape la plus proche : ${stops[best].name}, à ${bd < 1 ? Math.round(bd * 1000) + ' m' : bd.toFixed(1) + ' km'}` : '';
                    if (best >= 0 && bd < 0.3 && !done.has(best)) { done.add(best); T.hush(); sayStop(best); } }, err => { gpsSt.textContent = 'Position refusée ou indisponible : ' + err.message; }, {enableHighAccuracy: true, maximumAge: 10000});
            }
        });
        draw();
    }
    F.push({key: 'promenade', group: 'lieux', icon: '🚶', title: 'La promenade guidée', desc: 'Les lieux d’une vie dans l’ordre, l’histoire de chaque étape lue à voix haute — même toute seule, en arrivant sur place.', render: renderWalk});
    ext.tresorWalk = {walkStops};
})();
