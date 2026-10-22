/**
 * 🎛️ Multipiste du 🎚️ Studio son (maquette « Studio son » § 6, validée) : Voix / Musique / Bruitages, comme les pistes son du
 * montage, sans les pistes vidéo. Volume et panoramique par piste, M (muet), S (solo), ● (armer au micro), courbes
 * d'automatisation du volume et du panoramique (points ◆ à glisser, double-clic pour en ajouter, clic droit pour en retirer),
 * « 🔉 Baisser la musique sous la voix » (les creux de la courbe, calculés depuis la piste de la voix), ✂️ couper un morceau,
 * aimant 🧲 (bords des autres morceaux et repère). Le mélange est calculé par le moteur commun (ext.audioEngine.mixdown).
 * ext.audioMulti.mount(boîte, studio) → {draw, reload, mix(piste?), tracks, addClip, addRecording, armed, delSel}
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const UI = () => window.LCNDA_UI || {};
    const esc = v => A().escapeHtml(v ?? '');
    const toast = (...a) => A().toast(...a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const fmt = (s, t = false) => ext.audioUi.fmt(s, t);
    let uid = 0; const nid = p => p + (++uid) + Date.now().toString(36).slice(-4);
    const SNAP_KEY = 'genealogie-audio-multi-snap';
    const defaultTracks = mainDur => [
        {id: 'voix', name: 'Voix', icon: '🗣️', vol: 1, pan: 0, mute: false, solo: false, arm: false, show: 'vol', clips: mainDur ? [{id: nid('c'), key: 'main', name: '', start: 0, offset: 0, dur: mainDur, gain: 1}] : [], auto: {vol: [], pan: []}},
        {id: 'musique', name: 'Musique', icon: '🎵', vol: 0.8, pan: 0, mute: false, solo: false, arm: false, show: 'vol', clips: [], auto: {vol: [], pan: []}},
        {id: 'bruitages', name: 'Bruitages', icon: '🔔', vol: 0.8, pan: 0, mute: false, solo: false, arm: false, show: 'vol', clips: [], auto: {vol: [], pan: []}},
    ];
    const cleanMulti = (m, mainDur) => {
        const tr = (Array.isArray(m?.tracks) ? m.tracks : []).slice(0, 12).map((t, i) => ({id: /^[a-z0-9_-]{1,30}$/i.test(t?.id || '') ? t.id : 'p' + i, name: String(t?.name || `Piste ${i + 1}`).slice(0, 40), icon: String(t?.icon || '🎵').slice(0, 4),
            vol: clamp(Number(t?.vol ?? 1), 0, 2), pan: clamp(Number(t?.pan ?? 0), -1, 1), mute: !!t?.mute, solo: !!t?.solo, arm: !!t?.arm, show: t?.show === 'pan' ? 'pan' : 'vol',
            clips: (Array.isArray(t?.clips) ? t.clips : []).slice(0, 200).filter(c => c && typeof c.key === 'string').map(c => ({id: String(c.id || nid('c')), key: c.key, name: String(c.name || '').slice(0, 120), src: typeof c.src === 'string' && /^media\//.test(c.src) ? c.src : undefined, mediaId: Number(c.mediaId) || undefined, start: Math.max(0, Number(c.start) || 0), offset: Math.max(0, Number(c.offset) || 0), dur: Math.max(0.05, Number(c.dur) || 1), gain: clamp(Number(c.gain ?? 1), 0, 4)})),
            auto: {vol: (t?.auto?.vol || []).filter(p => Number.isFinite(p?.t)).map(p => ({t: Math.max(0, p.t), v: clamp(Number(p.v), 0, 1.5), ...(p.duck ? {duck: true} : {})})).sort((a, b) => a.t - b.t), pan: (t?.auto?.pan || []).filter(p => Number.isFinite(p?.t)).map(p => ({t: Math.max(0, p.t), v: clamp(Number(p.v), -1, 1)})).sort((a, b) => a.t - b.t)}}));
        const d = m?.duck || {};
        return {tracks: tr.length ? tr : defaultTracks(mainDur), duck: {on: !!d.on, from: String(d.from || 'voix'), to: String(d.to || 'musique'), db: clamp(Number(d.db ?? -12), -40, 0), ret: clamp(Number(d.ret ?? 0.8), 0.1, 5)}};
    };
    ext.audioMultiClean = cleanMulti;

    function mount(box, S) {
        const E = S.E;
        let M = null, selClip = null, view = {start: 0, dur: 30}, mixCache = null, peaksCache = new Map();
        const total = () => Math.max(5, ...M.tracks.flatMap(t => t.clips.map(c => c.start + c.dur)));
        const snapOn = () => { try { return localStorage.getItem(SNAP_KEY) !== '0'; } catch (_) { return true; } };
        const save = label => { S.setMulti(JSON.parse(JSON.stringify(M))); mixCache = null; S.commit(label); };
        async function reload() {
            const main = await S.renderNow();
            M = cleanMulti(S.getMulti(), main.duration);
            M.tracks.forEach(t => t.clips.forEach(c => { if (c.key === 'main') c.dur = Math.min(c.dur, Math.max(0.05, main.duration - c.offset)); else if (!S.files.some(f => f.key === c.key)) S.addFile({title: c.name || 'Son', src: c.src, media: c.mediaId ? {id: c.mediaId, filename: decodeURIComponent(String(c.src || '').replace(/^media\//, ''))} : null}); }));
            if (!S.getMulti()) S.setMulti(JSON.parse(JSON.stringify(M)));
            view = {start: 0, dur: total() * 1.08}; mixCache = null; build(); draw();
        }
        /** le mélange (ou une seule piste) */
        async function mix(only = null) {
            const key = JSON.stringify(M) + '|' + (only || '');
            const main = await S.renderNow();
            if (mixCache && mixCache.key === key && mixCache.main === main) return mixCache.buf;
            const bufs = {main};
            for (const t of M.tracks) for (const c of t.clips) if (!bufs[c.key]) { try { bufs[c.key] = await S.loadFileBuf(c.key); } catch (e) { toast(`« ${c.name} » : ${e.message}`, 'error'); } }
            const buf = await E.mixdown(M, bufs, {sr: S.base.sampleRate, only});
            if (!only) mixCache = {key, main, buf};
            return buf;
        }
        const trackOf = id => M.tracks.find(t => t.id === id);
        function build() {
            const opts = M.tracks.map(t => `<option value="${esc(t.id)}">${esc(t.icon + ' ' + t.name)}</option>`).join('');
            box.innerHTML = `<div class="h-am-duck"><label class="ui-toggle"><input type="checkbox" data-am-duck ${M.duck.on ? 'checked' : ''}><i></i>🔉 <b>Baisser la musique sous la voix</b></label>
                    <span>piste <select data-am-dfrom aria-label="Piste de la voix">${opts}</select> → piste <select data-am-dto aria-label="Piste qui baisse">${opts}</select> · de <input type="number" data-am-ddb min="-40" max="0" step="1" value="${M.duck.db}" data-unit="dB" aria-label="Baisse en dB"> · retour en <input type="number" data-am-dret min="0.1" max="5" step="0.1" value="${M.duck.ret}" data-unit="s" aria-label="Retour en secondes"></span></div>
                <div class="h-am-grid"><div class="h-am-corner">Pistes</div><canvas class="h-am-ruler" data-am-ruler></canvas>
                ${M.tracks.map(t => `<div class="h-am-th" data-am-track="${esc(t.id)}"><div class="h-am-thtop"><b>${esc(t.icon)} <input class="h-am-tname" data-am-tname value="${esc(t.name)}" maxlength="40" aria-label="Nom de la piste"></b><span class="h-am-msr"><button type="button" class="${t.mute ? 'is-on' : ''}" data-am-m title="Muet" aria-label="Muet" aria-pressed="${t.mute}">M</button><button type="button" class="${t.solo ? 'is-on' : ''}" data-am-s title="Solo" aria-label="Solo" aria-pressed="${t.solo}">S</button><button type="button" class="h-am-arm${t.arm ? ' is-on' : ''}" data-am-arm title="Armer : la piste qui enregistre au micro" aria-label="Armer pour le micro" aria-pressed="${t.arm}">●</button></span></div>
                    <label class="h-am-sl">Vol.<input type="range" min="0" max="1.5" step="0.01" value="${t.vol}" data-am-vol aria-label="Volume de ${esc(t.name)}"></label><label class="h-am-sl">Pan.<input type="range" min="-1" max="1" step="0.05" value="${t.pan}" data-am-pan aria-label="Panoramique de ${esc(t.name)}"></label>
                    <label class="h-am-sl h-am-show">Courbe <select data-am-show><option value="vol"${t.show === 'vol' ? ' selected' : ''}>volume</option><option value="pan"${t.show === 'pan' ? ' selected' : ''}>panoramique</option></select></label></div>
                    <canvas class="h-am-lane" data-am-lane="${esc(t.id)}"></canvas>`).join('')}</div>
                <div class="h-am-foot"><button type="button" class="button small secondary" data-am-addtrack>＋ Nouvelle piste son</button><button type="button" class="button small secondary" data-am-addclip>＋ Ajouter un son…</button><button type="button" class="icon-button small${snapOn() ? ' is-active' : ''}" data-am-snap title="Aimanter : les morceaux se collent aux autres et au repère (Alt pour s’en passer)" aria-label="Aimanter">🧲</button>
                    <span class="muted">Ligne jaune = courbe (◆ à glisser, double-clic pour ajouter, clic droit pour retirer) ; ● rouge = la piste qui enregistre au micro.</span></div>`;
            box.querySelector('[data-am-dfrom]').value = M.duck.from; box.querySelector('[data-am-dto]').value = M.duck.to;
        }
        // ── dessin ──
        const css = n => getComputedStyle(box).getPropertyValue(n).trim();
        const peaksOf = async key => { if (peaksCache.has(key)) return peaksCache.get(key); const b = key === 'main' ? await S.renderNow() : await S.loadFileBuf(key); const p = b ? {pk: E.peaks(b, 512), sr: b.sampleRate, b} : null; peaksCache.set(key, p); return p; };
        const yOf = (t, v, H) => t.show === 'pan' ? H / 2 - v * (H / 2 - 6) : H - 4 - v / 1.5 * (H - 8), vOf = (t, y, H) => t.show === 'pan' ? clamp((H / 2 - y) / (H / 2 - 6), -1, 1) : clamp((H - 4 - y) / (H - 8) * 1.5, 0, 1.5);
        function draw(ph = null) {
            if (!M || box.hidden) return;
            const dpr = window.devicePixelRatio || 1, ink = css('--ui-ink') || '#111', blue = css('--ui-blue') || '#055dff', X = (t, W) => (t - view.start) / view.dur * W;
            const ruler = box.querySelector('[data-am-ruler]'); if (!ruler) return;
            { const W = ruler.width = Math.round(ruler.clientWidth * dpr), H = ruler.height = Math.round(ruler.clientHeight * dpr), g = ruler.getContext('2d'); g.clearRect(0, 0, W, H); g.fillStyle = ink; g.font = `${10 * dpr}px ui-monospace, monospace`;
              const step = [1, 2, 5, 10, 15, 30, 60, 120, 300].find(s0 => s0 / view.dur * W > 70 * dpr) || 600; for (let t = Math.ceil(view.start / step) * step; t < view.start + view.dur; t += step) { const x = X(t, W); g.fillRect(x, H - 5 * dpr, 1, 5 * dpr); g.fillText(fmt(t), x + 3, H - 7 * dpr); }
              if (ph !== null || !S.playing()) { const t = ph ?? S.cursor(); g.fillStyle = ph !== null ? '#d33' : '#e08a00'; g.fillRect(X(t, W), 0, 2, H); } }
            box.querySelectorAll('[data-am-lane]').forEach(async lane => {
                const t = trackOf(lane.dataset.amLane); if (!t) return;
                const W = lane.width = Math.round(lane.clientWidth * dpr), H = lane.height = Math.round(lane.clientHeight * dpr), g = lane.getContext('2d');
                g.clearRect(0, 0, W, H);
                for (const c of t.clips) {
                    const x0 = X(c.start, W), x1 = X(c.start + c.dur, W); if (x1 < 0 || x0 > W) continue;
                    g.fillStyle = t.id === 'musique' ? 'rgba(150,110,230,.22)' : 'rgba(5,93,255,.16)'; g.fillRect(x0, 2 * dpr, x1 - x0, H - 4 * dpr);
                    g.strokeStyle = c.id === selClip ? blue : ink; g.lineWidth = (c.id === selClip ? 2.5 : 1.5) * dpr; g.strokeRect(x0, 2 * dpr, x1 - x0, H - 4 * dpr);
                    const p = await peaksOf(c.key);
                    if (p && box.contains(lane)) { g.fillStyle = 'rgba(70,110,220,.75)'; const mid = H / 2, sp = p.pk.step; for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, x1); x++) { const tt = c.offset + (view.start + x / W * view.dur - c.start); const k0 = Math.floor(tt * p.sr / sp), k1 = Math.max(k0 + 1, Math.floor((tt + view.dur / W) * p.sr / sp)); let lo = 0, hi = 0; for (let k = k0; k < Math.min(p.pk.mn.length, k1); k++) { if (p.pk.mn[k] < lo) lo = p.pk.mn[k]; if (p.pk.mx[k] > hi) hi = p.pk.mx[k]; } g.fillRect(x, mid - hi * mid * 0.8, 1, Math.max(1, (hi - lo) * mid * 0.8)); } }
                    g.fillStyle = css('--ui-bg') || '#fff'; const label = c.key === 'main' ? (S.files[0]?.title || 'Son') : (c.name || S.files.find(f => f.key === c.key)?.title || 'Son'); g.font = `bold ${10 * dpr}px system-ui`; const tw = g.measureText(label).width + 8 * dpr; g.fillRect(x0 + 4 * dpr, 4 * dpr, Math.min(tw, Math.max(0, x1 - x0 - 8 * dpr)), 13 * dpr); g.fillStyle = ink; g.save(); g.beginPath(); g.rect(x0, 0, Math.max(0, x1 - x0 - 4 * dpr), H); g.clip(); g.fillText(label, x0 + 8 * dpr, 14 * dpr); g.restore();
                }
                // la courbe (jaune) et ses points ◆
                const pts = t.auto[t.show] || [], def = t.show === 'pan' ? t.pan : 1;
                g.strokeStyle = '#e8b21a'; g.lineWidth = 2 * dpr; g.beginPath();
                if (!pts.length) { const y = yOf(t, def, H); g.moveTo(0, y); g.lineTo(W, y); } else { g.moveTo(0, yOf(t, pts[0].v, H)); pts.forEach(p => g.lineTo(X(p.t, W), yOf(t, p.v, H))); g.lineTo(W, yOf(t, pts[pts.length - 1].v, H)); }
                g.stroke(); g.fillStyle = '#e8b21a'; pts.forEach(p => { const x = X(p.t, W), y = yOf(t, p.v, H), r = 5 * dpr; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fill(); });
                const tc = ph ?? S.cursor(); g.fillStyle = ph !== null ? '#d33' : '#e08a00'; g.fillRect(X(tc, W), 0, Math.max(1, 1.5 * dpr), H);
                if (t.arm) { g.fillStyle = 'rgba(214,51,51,.12)'; g.fillRect(0, 0, W, H); }
            });
        }
        // ── en-têtes des pistes ──
        box.addEventListener('click', async e => {
            const th = e.target.closest('[data-am-track]'), t = th && trackOf(th.dataset.amTrack);
            if (t && e.target.closest('[data-am-m]')) { t.mute = !t.mute; save(`${t.name} : ${t.mute ? 'muet' : 'son'}`); build(); draw(); return; }
            if (t && e.target.closest('[data-am-s]')) { t.solo = !t.solo; save(`${t.name} : solo`); build(); draw(); return; }
            if (t && e.target.closest('[data-am-arm]')) { const on = !t.arm; M.tracks.forEach(x => { x.arm = false; }); t.arm = on; save(on ? `${t.name} : armée pour le micro` : `${t.name} : désarmée`); build(); draw(); return; }
            if (e.target.closest('[data-am-addtrack]')) { M.tracks.push({id: nid('p'), name: `Piste ${M.tracks.length + 1}`, icon: '🎵', vol: 1, pan: 0, mute: false, solo: false, arm: false, show: 'vol', clips: [], auto: {vol: [], pan: []}}); save('Nouvelle piste'); build(); draw(); return; }
            if (e.target.closest('[data-am-addclip]')) { S.dl.querySelector('[data-as-addfile]')?.click(); return; }
            if (e.target.closest('[data-am-snap]')) { try { localStorage.setItem(SNAP_KEY, snapOn() ? '0' : '1'); } catch (_) {} e.target.closest('[data-am-snap]').classList.toggle('is-active', snapOn()); }
        });
        box.addEventListener('input', e => { const th = e.target.closest('[data-am-track]'), t = th && trackOf(th.dataset.amTrack); if (!t) return; if (e.target.matches('[data-am-vol]')) t.vol = Number(e.target.value); if (e.target.matches('[data-am-pan]')) t.pan = Number(e.target.value); mixCache = null; });
        box.addEventListener('change', async e => {
            const th = e.target.closest('[data-am-track]'), t = th && trackOf(th.dataset.amTrack);
            if (t && e.target.matches('[data-am-vol],[data-am-pan]')) return save(`${t.name} : ${e.target.matches('[data-am-vol]') ? 'volume' : 'panoramique'}`);
            if (t && e.target.matches('[data-am-tname]')) { t.name = e.target.value.trim().slice(0, 40) || t.name; return save(`Renommer la piste « ${t.name} »`); }
            if (t && e.target.matches('[data-am-show]')) { t.show = e.target.value; save(`${t.name} : courbe du ${t.show === 'pan' ? 'panoramique' : 'volume'}`); return draw(); }
            if (e.target.matches('[data-am-duck],[data-am-dfrom],[data-am-dto],[data-am-ddb],[data-am-dret]')) {
                M.duck = {on: box.querySelector('[data-am-duck]').checked, from: box.querySelector('[data-am-dfrom]').value, to: box.querySelector('[data-am-dto]').value, db: clamp(Number(box.querySelector('[data-am-ddb]').value) || -12, -40, 0), ret: clamp(Number(box.querySelector('[data-am-dret]').value) || 0.8, 0.1, 5)};
                await applyDuck(); save(M.duck.on ? 'Baisser la musique sous la voix' : 'Ne plus baisser la musique'); draw();
            }
        });
        /** les creux de la musique : la voix parle → la piste « to » baisse ; les points faits à la main restent */
        async function applyDuck() {
            const to = trackOf(M.duck.to); if (!to) return;
            to.auto.vol = to.auto.vol.filter(p => !p.duck);
            if (!M.duck.on || M.duck.from === M.duck.to) return;
            const voice = await mix(M.duck.from);
            const pts = E.duckPoints(voice, {db: M.duck.db, ret: M.duck.ret, total: total()});
            to.auto.vol = [...to.auto.vol, ...pts].sort((a, b) => a.t - b.t);
        }
        // ── les pistes : morceaux (glisser, ✂️), points de la courbe ──
        const laneAt = (e, lane) => { const r = lane.getBoundingClientRect(); return {t: view.start + (e.clientX - r.left) / r.width * view.dur, x: e.clientX - r.left, y: e.clientY - r.top, r}; };
        const hitPoint = (t, p, lane) => { const pts = t.auto[t.show]; return pts.findIndex(q => Math.abs((q.t - view.start) / view.dur * p.r.width - p.x) < 7 && Math.abs(yOf(t, q.v, p.r.height) - p.y) < 7); };
        box.addEventListener('pointerdown', e => {
            const lane = e.target.closest('[data-am-lane]'); if (!lane || e.button === 2) return; e.preventDefault();
            const t = trackOf(lane.dataset.amLane), p = laneAt(e, lane), pi = hitPoint(t, p, lane);
            if (pi >= 0) { lane.setPointerCapture(e.pointerId); const pts = t.auto[t.show], pt = pts[pi]; delete pt.duck;
                const mv = ev => { const q = laneAt(ev, lane); pt.t = Math.max(0, q.t); pt.v = vOf(t, q.y, q.r.height); pts.sort((a, b) => a.t - b.t); mixCache = null; draw(); };
                const up = () => { lane.removeEventListener('pointermove', mv); lane.removeEventListener('pointerup', up); save(`${t.name} : point de la courbe`); };
                lane.addEventListener('pointermove', mv); lane.addEventListener('pointerup', up); return; }
            const clip = t.clips.find(c => p.t >= c.start && p.t <= c.start + c.dur);
            if (clip && S.tool() === 'razor') { const at = p.t - clip.start; if (at < 0.05 || clip.dur - at < 0.05) return; const b = {...clip, id: nid('c'), start: clip.start + at, offset: clip.offset + at, dur: clip.dur - at}; clip.dur = at; t.clips.splice(t.clips.indexOf(clip) + 1, 0, b); selClip = b.id; save(`Couper « ${clip.name || 'le morceau'} » à ${fmt(p.t)}`); draw(); return; }
            if (!clip) { selClip = null; S.setCursor(Math.max(0, p.t)); draw(); return; }
            selClip = clip.id; lane.setPointerCapture(e.pointerId); const dx0 = p.t - clip.start, s0 = clip.start; let moved = false;
            const edges = () => [0, S.cursor(), ...M.tracks.flatMap(x => x.clips.filter(c => c !== clip).flatMap(c => [c.start, c.start + c.dur]))];
            const mv = ev => { const q = laneAt(ev, lane); let ns = Math.max(0, q.t - dx0); if (snapOn() && !ev.altKey) { const tol = view.dur / q.r.width * 8; for (const ed of edges()) { if (Math.abs(ns - ed) < tol) { ns = ed; break; } if (Math.abs(ns + clip.dur - ed) < tol) { ns = ed - clip.dur; break; } } } moved = moved || Math.abs(ns - s0) > 1e-3; clip.start = Math.max(0, ns); mixCache = null; draw(); };
            const up = () => { lane.removeEventListener('pointermove', mv); lane.removeEventListener('pointerup', up); if (moved) save(`Déplacer « ${clip.name || 'le morceau'} »`); else draw(); };
            lane.addEventListener('pointermove', mv); lane.addEventListener('pointerup', up);
        });
        box.addEventListener('dblclick', e => { const lane = e.target.closest('[data-am-lane]'); if (!lane) return; const t = trackOf(lane.dataset.amLane), p = laneAt(e, lane), pts = t.auto[t.show];
            if (!pts.length) pts.push({t: 0, v: t.show === 'pan' ? t.pan : 1}); pts.push({t: Math.max(0, p.t), v: vOf(t, p.y, p.r.height)}); pts.sort((a, b) => a.t - b.t); save(`${t.name} : point ajouté à ${fmt(p.t)}`); draw(); });
        box.addEventListener('contextmenu', e => { const lane = e.target.closest('[data-am-lane]'); if (!lane || e.shiftKey || !UI().contextMenu) return; const t = trackOf(lane.dataset.amLane), p = laneAt(e, lane), pi = hitPoint(t, p, lane), clip = t.clips.find(c => p.t >= c.start && p.t <= c.start + c.dur);
            const items = []; if (pi >= 0) items.push({icon: '🗑', label: 'Retirer ce point', danger: true, run: () => { t.auto[t.show].splice(pi, 1); save(`${t.name} : point retiré`); draw(); }});
            if (clip) items.push({icon: '✂️', label: 'Couper ici', run: () => { const at = p.t - clip.start; const b = {...clip, id: nid('c'), start: clip.start + at, offset: clip.offset + at, dur: clip.dur - at}; clip.dur = at; t.clips.push(b); save('Couper le morceau'); draw(); }}, {icon: '🔊', label: 'Volume du morceau…', run: async () => { const v = await A().askText({title: 'Volume du morceau', message: 'En pourcentage (100 = tel quel) :', value: String(Math.round(clip.gain * 100)), okLabel: 'Enregistrer', inputMode: 'numeric'}); if (v == null) return; clip.gain = clamp(Number(String(v).replace(',', '.')) / 100 || 1, 0, 4); save('Volume du morceau'); }}, '-', {icon: '🗑', label: 'Retirer le morceau', danger: true, run: () => { selClip = clip.id; delSel(); }});
            items.push({icon: '◆', label: 'Remettre la courbe à plat', disabled: !t.auto[t.show].length, run: () => { t.auto[t.show] = []; save(`${t.name} : courbe à plat`); draw(); }});
            UI().contextMenu(e, items, {title: t.name}); });
        box.addEventListener('wheel', e => { if (!e.target.closest('[data-am-lane],[data-am-ruler]')) return; e.preventDefault(); const lane = e.target.closest('[data-am-lane],[data-am-ruler]'), r = lane.getBoundingClientRect(), t = view.start + (e.clientX - r.left) / r.width * view.dur;
            if (e.ctrlKey || e.metaKey) { const f = e.deltaY > 0 ? 1.25 : 0.8; view.start = t - (t - view.start) * f; view.dur = clamp(view.dur * f, 1, total() * 4); } else view.start += (e.deltaX || e.deltaY) / 600 * view.dur; view.start = clamp(view.start, 0, Math.max(0, total() * 1.1 - view.dur)); draw(); }, {passive: false});
        // les fichiers glissés depuis la liste « Fichiers »
        S.dl.querySelector('[data-as-files]')?.addEventListener('dragstart', e => { const f = e.target.closest('[data-as-file]'); if (f) e.dataTransfer.setData('text/x-lcnda-sound', f.dataset.asFile); });
        box.addEventListener('dragover', e => { if (e.target.closest('[data-am-lane]') && [...e.dataTransfer.types].includes('text/x-lcnda-sound')) e.preventDefault(); });
        box.addEventListener('drop', e => { const lane = e.target.closest('[data-am-lane]'), key = e.dataTransfer.getData('text/x-lcnda-sound'); if (!lane || !key) return; e.preventDefault(); addClip(key, trackOf(lane.dataset.amLane), Math.max(0, laneAt(e, lane).t)); });
        async function addClip(key, track = null, at = null) {
            const b = key === 'main' ? await S.renderNow() : await S.loadFileBuf(key); if (!b) return;
            const f = S.files.find(x => x.key === key), t = track || M.tracks.find(x => x.arm) || trackOf('musique') || M.tracks[0];
            const c = {id: nid('c'), key, name: f?.title || 'Son', src: f?.src || (f?.media?.filename ? `media/${encodeURIComponent(f.media.filename)}` : undefined), mediaId: f?.media?.id, start: at ?? S.cursor(), offset: 0, dur: b.duration, gain: 1};
            t.clips.push(c); selClip = c.id; if (M.duck.on && M.duck.from === t.id) await applyDuck();
            view.dur = Math.max(view.dur, total() * 1.08); save(`Ajouter « ${c.name} » sur ${t.name}`); draw();
        }
        async function addRecording(file, buffer) {
            const t = M.tracks.find(x => x.arm); if (!t) return;
            const n = M.tracks.flatMap(x => x.clips).filter(c => /^🎙/.test(c.name)).length + 1, title = `🎙 Prise micro ${n}`;
            try { const S0 = A().state, fd = new FormData(); fd.append('file', file, file.name); fd.append('kind', 'audio'); fd.append('title', title.replace(/^🎙\s*/, '')); fd.append('csrf', S0.csrf);
                const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': S0.csrf}}); const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'Envoi impossible.');
                const key = S.addFile({title, src: `media/${encodeURIComponent(j.result.filename)}`, media: {id: j.result.media_id, filename: j.result.filename}}); S.fileBufs[key] = buffer || await S.E.load(`media/${encodeURIComponent(j.result.filename)}`);
                await addClip(key, t, S.cursor()); toast(`${title} posée sur la piste « ${t.name} » (et rangée dans les médias).`); }
            catch (e) { toast(e.message, 'error'); }
        }
        function delSel() { if (!selClip) return; const t = M.tracks.find(x => x.clips.some(c => c.id === selClip)); if (!t) return; const c = t.clips.find(x => x.id === selClip); t.clips = t.clips.filter(x => x !== c); selClip = null; save(`Retirer « ${c.name || 'le morceau'} »`); draw(); A().undoToast?.(`Morceau « ${c.name || 'son'} » retiré`, {undo: () => S.dl._as?.runCmd('undo'), redo: () => S.dl._as?.runCmd('redo')}); }
        reload();
        return {draw, reload, mix, tracks: () => M.tracks.filter(t => t.clips.length).map(t => ({id: t.id, name: t.name})), addClip, addRecording, armed: () => M?.tracks.some(t => t.arm), delSel, model: () => M, applyDuck};
    }
    ext.audioMulti = {mount, clean: cleanMulti};
})();
