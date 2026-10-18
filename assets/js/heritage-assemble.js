/**
 * 🧩 Assembler des photos (visionneuse → « 🧩 Assembler », Médias → « 🧩 Assembler des photos », Recueils → une page).
 * Plusieurs photos d'un même document (une grande page prise en morceaux, un recto et un zoom…) posées sur un plan de
 * travail : chacune se déplace, se redimensionne, tourne librement, devient transparente ; le « mode différence » montre
 * en noir ce qui se superpose bien (pour aligner au pixel près). Le résultat est une nouvelle image : les originaux restent.
 * Enregistrement : copie rattachée aux mêmes fiches que la première photo de la base (lib/studio.php, retouch_media).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => A().escapeHtml(v ?? '');
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
    const url = f => `media/${encodeURIComponent(f)}`;
    const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Image illisible')); i.src = src; });
    const rad = d => d * Math.PI / 180;

    /** Choisir des photos : de la base (recherche) ou de l'ordinateur. */
    function pickImages() {
        return new Promise(async resolve => {
            let rows = [];
            try { rows = ((await A().api('list', {type: 'media', limit: 400})).rows || []).filter(r => r.filename && (r.media_type || 'image') === 'image'); } catch (_) {}
            let done = false;
            const dl = ext.openDialog({eyebrow: 'ASSEMBLER', title: 'Ajouter des photos', wide: true, submitLabel: 'Ajouter',
                body: `<label class="h-rc-drop"><input type="file" name="files" accept="image/*" multiple><span>📁 Des photos de l’ordinateur…</span></label>
                    <p class="muted">… ou des photos déjà dans la base :</p><div class="pk h-pick-q"><div class="pk-box"><span class="pk-ico" aria-hidden="true">🖼</span><input type="text" class="pk-input" data-as-q placeholder="Titre ou nom du fichier…" autocomplete="off" spellcheck="false" aria-label="Chercher"></div></div>
                    <div class="h-as-pick" data-as-list>${rows.map(r => `<label title="${esc(r.title || r.filename)}"><input type="checkbox" name="pick" value="${r.id}"><img src="${esc(url(r.thumbnail || r.filename))}" alt="" loading="lazy"><small>${esc(r.title || r.filename)}</small></label>`).join('') || '<p class="muted">Rien dans la base.</p>'}</div>`,
                onOpen: d => d.querySelector('[data-as-q]').addEventListener('input', e => { const q = e.target.value.toLowerCase(); d.querySelectorAll('[data-as-list] label').forEach(l => { l.hidden = !l.title.toLowerCase().includes(q); }); }),
                onSubmit: form => {
                    const files = [...form.querySelector('[name=files]').files].map(f => ({src: URL.createObjectURL(f), name: f.name.replace(/\.[^.]+$/, '')}));
                    const picks = [...form.querySelectorAll('[name=pick]:checked')].map(c => rows.find(r => String(r.id) === c.value)).filter(Boolean).map(r => ({src: url(r.filename), name: r.title || r.filename, media: r}));
                    if (!files.length && !picks.length) { toast('Choisis au moins une photo.', 'error'); return false; }
                    done = true; resolve([...picks, ...files]);
                },
            });
            dl.addEventListener('close', () => { if (!done) resolve(null); });
        });
    }

    /**
     * Ouvre l'atelier d'assemblage. start : [{id, filename, title}] (médias de la base, facultatif).
     * opts.onSaved(newMediaId) : après l'enregistrement (ex. le recueil pose l'image sur sa page).
     */
    ext.openAssembler = async (start = [], opts = {}) => {
        const layers = [];
        let sel = -1, diff = false, z = 0.3, px = 40, py = 40, dirty = false;
        const addLayer = async (src, name, media = null) => {
            const img = await loadImg(src);
            const prev = layers[layers.length - 1];
            const s = prev ? Math.min(4, (prev.img.naturalWidth * prev.s) / img.naturalWidth) : 1;
            layers.push({img, name, media, x: prev ? prev.x + prev.img.naturalWidth * prev.s * 0.55 : img.naturalWidth / 2, y: prev ? prev.y : img.naturalHeight / 2, s, r: 0, o: layers.length ? 0.6 : 1, vis: true});
            sel = layers.length - 1; dirty = true;
        };
        for (const m of start) { try { await addLayer(url(m.filename), m.title || m.filename, m); } catch (e) { toast(e.message, 'error'); } }
        const dl = document.createElement('dialog');
        dl.className = 'modal h-modal h-modal-wide h-avx h-as';
        dl.innerHTML = `<div class="modal-head"><div><span class="eyebrow">ASSEMBLER DES PHOTOS</span><h2>🧩 Plan de travail</h2></div><button type="button" class="icon-button" data-as-close aria-label="Fermer">×</button></div>
            <div class="h-as-body"><div class="h-as-stagewrap"><canvas data-as-canvas></canvas>
                <div class="h-as-hint muted">Clique une photo pour la choisir, glisse pour la déplacer · Maj + molette : taille · Alt + molette : rotation · molette : zoom · flèches : 1 px (Maj : 10 px)</div></div>
                <aside class="h-as-side">
                    <div class="h-as-tools"><button type="button" class="button small" data-as-add>+ Photos</button><button type="button" class="button small secondary" data-as-fit>⤢ Tout voir</button>
                        <label class="checkbox-line" title="Ce qui se superpose bien devient noir : idéal pour aligner deux photos du même endroit"><input type="checkbox" data-as-diff> Mode différence</label></div>
                    <div class="h-as-layers" data-as-layers></div>
                    <div class="h-as-props" data-as-props></div>
                    <div class="h-as-out"><label>Format<select data-as-fmt><option value="image/jpeg">JPEG (léger)</option><option value="image/png">PNG (sans perte)</option></select></label>
                        <label class="checkbox-line"><input type="checkbox" data-as-bg checked> Fond blanc (sinon transparent en PNG)</label>
                        <input data-as-title placeholder="Titre de l’image assemblée" value="${esc(start[0]?.title ? start[0].title + ' (assemblage)' : 'Assemblage')}">
                        <div class="page-actions"><button type="button" class="button secondary" data-as-download>⬇ Télécharger</button><button type="button" class="button" data-as-save>💾 Enregistrer</button></div>
                        <p class="muted" data-as-msg></p></div>
                </aside></div>`;
        document.body.appendChild(dl);
        const $ = s => dl.querySelector(s), cv = $('[data-as-canvas]'), g = cv.getContext('2d');
        const close = async () => { if (dirty && layers.length > 1 && !await A().confirmBox('L’assemblage non enregistré sera perdu.', {title: 'Fermer sans enregistrer l’assemblage ?', okLabel: 'Fermer sans enregistrer', danger: true})) return; dl.close(); };
        $('[data-as-close]').addEventListener('click', close);
        dl.addEventListener('cancel', e => { if (e.target !== dl) return; e.preventDefault(); close(); });
        dl.addEventListener('close', () => dl.remove());
        dl.showModal();

        const corners = L => { const w = L.img.naturalWidth * L.s / 2, h = L.img.naturalHeight * L.s / 2, c = Math.cos(rad(L.r)), s = Math.sin(rad(L.r));
            return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => [L.x + x * c - y * s, L.y + x * s + y * c]); };
        const bounds = (only = layers.filter(l => l.vis)) => { const pts = only.flatMap(corners); if (!pts.length) return {x0: 0, y0: 0, x1: 1, y1: 1}; return {x0: Math.min(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])), x1: Math.max(...pts.map(p => p[0])), y1: Math.max(...pts.map(p => p[1]))}; };
        const drawLayers = (ctx, forExport = false) => layers.forEach((L, i) => { if (!L.vis) return;
            ctx.save(); ctx.globalAlpha = forExport ? (L.o >= 0.99 ? 1 : L.o) : L.o; ctx.globalCompositeOperation = !forExport && diff && i > 0 ? 'difference' : 'source-over';
            ctx.translate(L.x, L.y); ctx.rotate(rad(L.r)); ctx.scale(L.s, L.s); ctx.drawImage(L.img, -L.img.naturalWidth / 2, -L.img.naturalHeight / 2); ctx.restore(); });
        function draw() {
            const dpr = window.devicePixelRatio || 1, W = cv.clientWidth * dpr, H = cv.clientHeight * dpr; if (cv.width !== W) cv.width = W; if (cv.height !== H) cv.height = H;
            g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#3a3a3a'; g.fillRect(0, 0, W, H);
            g.setTransform(z * dpr, 0, 0, z * dpr, px * dpr, py * dpr);
            if (layers.length) { const b = bounds(); g.fillStyle = '#fff'; g.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); }
            drawLayers(g);
            const L = layers[sel];
            if (L) { const c = corners(L); g.strokeStyle = '#2f8cff'; g.lineWidth = 2 / z; g.setLineDash([8 / z, 6 / z]); g.beginPath(); c.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.stroke(); g.setLineDash([]); }
            paintLayers(); paintProps();
        }
        const fit = () => { if (!layers.length) return; const b = bounds(), W = cv.clientWidth, H = cv.clientHeight; z = Math.min(W / (b.x1 - b.x0), H / (b.y1 - b.y0)) * 0.9; px = (W - (b.x1 - b.x0) * z) / 2 - b.x0 * z; py = (H - (b.y1 - b.y0) * z) / 2 - b.y0 * z; draw(); };
        function paintLayers() {
            $('[data-as-layers]').innerHTML = layers.length ? layers.map((L, i) => `<div class="h-as-layer ${i === sel ? 'is-sel' : ''}" data-as-l="${i}"><button type="button" class="icon-button" data-as-vis title="${L.vis ? 'Cacher' : 'Montrer'}">${L.vis ? '👁' : '🚫'}</button>
                <span class="h-as-lname" title="${esc(L.name)}">${i + 1}. ${esc(L.name)}</span><span class="h-rb-tools"><button type="button" class="icon-button" data-as-up title="Mettre devant" ${i === layers.length - 1 ? 'disabled' : ''}>↑</button><button type="button" class="icon-button" data-as-down title="Mettre derrière" ${i ? '' : 'disabled'}>↓</button><button type="button" class="icon-button danger" data-as-del title="Retirer">🗑</button></span></div>`).reverse().join('')
                : '<p class="muted">Ajoute des photos à assembler.</p>';
        }
        function paintProps() {
            const L = layers[sel], box = $('[data-as-props]');
            if (!L) { box.innerHTML = ''; return; }
            const row = (k, label, min, max, step, val, unit) => `<label class="h-avx-row">${label}<input type="range" data-as-p="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><input type="number" data-as-n="${k}" min="${min}" max="${max}" step="${step}" value="${Math.round(val * 100) / 100}" class="h-as-num">${unit}</label>`;
            if (box.dataset.for === String(sel) && box.contains(document.activeElement)) { box.querySelectorAll('[data-as-p],[data-as-n]').forEach(el => { if (el !== document.activeElement) el.value = el.dataset.asP === 'o' || el.dataset.asN === 'o' ? Math.round(L.o * 100) : el.dataset.asP === 's' || el.dataset.asN === 's' ? Math.round(L.s * 1000) / 10 : Math.round(L.r * 10) / 10; }); return; }
            box.dataset.for = String(sel);
            box.innerHTML = `<h4>${esc(L.name)}</h4>${row('o', 'Opacité', 5, 100, 1, Math.round(L.o * 100), '%')}${row('s', 'Taille', 2, 400, 0.1, Math.round(L.s * 1000) / 10, '%')}${row('r', 'Rotation', -180, 180, 0.1, Math.round(L.r * 10) / 10, '°')}
                <div class="h-avx-row"><button type="button" class="button small secondary" data-as-rot="-90">⟲ 90°</button><button type="button" class="button small secondary" data-as-rot="90">⟳ 90°</button><button type="button" class="button small secondary" data-as-opaque>Opaque</button><button type="button" class="button small secondary" data-as-half>À moitié transparente</button></div>
                <p class="muted">Pour mettre deux photos à la même échelle : rends celle du dessus à moitié transparente (ou coche « Mode différence »), puis ajuste sa taille et sa rotation jusqu’à ce que les écritures se superposent.</p>`;
        }
        const setProp = (k, v) => { const L = layers[sel]; if (!L || !isFinite(v)) return; if (k === 'o') L.o = Math.max(0.05, Math.min(1, v / 100)); if (k === 's') { L.s = Math.max(0.02, Math.min(4, v / 100)); } if (k === 'r') L.r = Math.max(-180, Math.min(180, v)); dirty = true; draw(); };
        $('[data-as-props]').addEventListener('input', e => { const k = e.target.dataset.asP || e.target.dataset.asN; if (k) setProp(k, Number(e.target.value)); });
        $('[data-as-props]').addEventListener('click', e => { const L = layers[sel]; if (!L) return; const r = e.target.closest('[data-as-rot]');
            if (r) { L.r = ((L.r + Number(r.dataset.asRot) + 540) % 360) - 180; } if (e.target.closest('[data-as-opaque]')) L.o = 1; if (e.target.closest('[data-as-half]')) L.o = 0.5;
            if (r || e.target.closest('[data-as-opaque],[data-as-half]')) { $('[data-as-props]').dataset.for = ''; dirty = true; draw(); } });
        $('[data-as-layers]').addEventListener('click', e => { const row = e.target.closest('[data-as-l]'); if (!row) return; const i = Number(row.dataset.asL);
            if (e.target.closest('[data-as-vis]')) layers[i].vis = !layers[i].vis;
            else if (e.target.closest('[data-as-up]') && i < layers.length - 1) { [layers[i], layers[i + 1]] = [layers[i + 1], layers[i]]; sel = i + 1; }
            else if (e.target.closest('[data-as-down]') && i > 0) { [layers[i], layers[i - 1]] = [layers[i - 1], layers[i]]; sel = i - 1; }
            else if (e.target.closest('[data-as-del]')) { layers.splice(i, 1); sel = Math.min(sel, layers.length - 1); }
            else sel = i;
            $('[data-as-props]').dataset.for = ''; dirty = true; draw(); });
        $('[data-as-add]').addEventListener('click', async () => { const list = await pickImages(); if (!list) return; for (const it of list) { try { await addLayer(it.src, it.name, it.media); } catch (e) { toast(e.message, 'error'); } } fit(); });
        $('[data-as-fit]').addEventListener('click', fit);
        $('[data-as-diff]').addEventListener('change', e => { diff = e.target.checked; draw(); });
        // souris : choisir, déplacer ; molette : zoom, taille, rotation
        const world = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - px) / z, (e.clientY - r.top - py) / z]; };
        const hit = ([wx, wy]) => { for (let i = layers.length - 1; i >= 0; i--) { const L = layers[i]; if (!L.vis) continue; const c = Math.cos(-rad(L.r)), s = Math.sin(-rad(L.r)), dx = wx - L.x, dy = wy - L.y, lx = (dx * c - dy * s) / L.s, ly = (dx * s + dy * c) / L.s; if (Math.abs(lx) <= L.img.naturalWidth / 2 && Math.abs(ly) <= L.img.naturalHeight / 2) return i; } return -1; };
        cv.addEventListener('pointerdown', e => {
            cv.setPointerCapture(e.pointerId); const p0 = world(e), i = hit(p0), sx = e.clientX, sy = e.clientY, opx = px, opy = py;
            if (i >= 0 && i !== sel) { sel = i; $('[data-as-props]').dataset.for = ''; draw(); }
            const L = layers[sel], ox = L?.x, oy = L?.y, moveLayer = i >= 0 && i === sel;
            const move = ev => { if (moveLayer) { const p = world(ev); L.x = ox + p[0] - p0[0]; L.y = oy + p[1] - p0[1]; dirty = true; } else { px = opx + ev.clientX - sx; py = opy + ev.clientY - sy; } draw(); };
            const up = () => { cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); };
            cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up);
        });
        cv.addEventListener('wheel', e => { e.preventDefault(); const L = layers[sel];
            if (e.shiftKey && L) { L.s = Math.max(0.02, Math.min(4, L.s * (e.deltaY > 0 ? 0.99 : 1.01))); dirty = true; }
            else if (e.altKey && L) { L.r = Math.max(-180, Math.min(180, L.r + (e.deltaY > 0 ? -0.1 : 0.1) * (e.ctrlKey ? 10 : 1))); dirty = true; }
            else { const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, f = e.deltaY > 0 ? 0.9 : 1.1; px = mx - (mx - px) * f; py = my - (my - py) * f; z *= f; }
            draw(); }, {passive: false});
        dl.addEventListener('keydown', e => { const L = layers[sel]; if (!L || e.target.closest('input, textarea, select')) return; const st = e.shiftKey ? 10 : 1;
            const mv = {ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st]}[e.key]; if (mv) { e.preventDefault(); L.x += mv[0]; L.y += mv[1]; dirty = true; draw(); } });
        // résultat
        async function render() {
            const vis = layers.filter(l => l.vis); if (!vis.length) throw new Error('Aucune photo visible.');
            const b = bounds(vis), W = Math.ceil(b.x1 - b.x0), H = Math.ceil(b.y1 - b.y0);
            if (W * H > 140e6 || W > 16000 || H > 16000) throw new Error(`Image trop grande (${W} × ${H} points) : réduis la taille des photos.`);
            const out = document.createElement('canvas'); out.width = W; out.height = H; const c = out.getContext('2d');
            const fmt = $('[data-as-fmt]').value; if ($('[data-as-bg]').checked || fmt === 'image/jpeg') { c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); }
            c.translate(-b.x0, -b.y0); drawLayers(c, true);
            const blob = await new Promise(r => out.toBlob(r, fmt, 0.93)); if (!blob) throw new Error('Le navigateur n’a pas pu créer l’image.');
            return {blob, ext: fmt === 'image/png' ? 'png' : 'jpg', W, H};
        }
        $('[data-as-download]').addEventListener('click', async () => { try { const r = await render(); const a = document.createElement('a'); a.href = URL.createObjectURL(r.blob); a.download = ($('[data-as-title]').value.trim() || 'assemblage') + '.' + r.ext; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); } catch (e) { toast(e.message, 'error'); } });
        $('[data-as-save]').addEventListener('click', async () => {
            const base = layers.find(l => l.media?.id);
            if (!base) return toast('Pour enregistrer dans la base, l’une des photos doit venir de la base (sinon : ⬇ Télécharger).', 'error');
            const msg = $('[data-as-msg]'), btn = $('[data-as-save]'); btn.disabled = true; msg.textContent = 'Création de l’image…';
            try {
                const r = await render();
                msg.textContent = `Envoi (${r.W} × ${r.H} points, ${(r.blob.size / 1048576).toFixed(1)} Mo)…`;
                const fd = new FormData(); fd.append('file', r.blob, 'assemblage.' + r.ext); fd.append('media_id', base.media.id); fd.append('mode', 'copy'); fd.append('show', '0'); fd.append('title', $('[data-as-title]').value.trim() || 'Assemblage');
                const res = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': S().csrf}});
                const j = await res.json().catch(() => ({error: 'Réponse illisible du serveur'}));
                if (!res.ok || j.error) throw new Error(j.error || 'Enregistrement impossible.');
                toast('Image assemblée enregistrée, rattachée aux mêmes fiches que « ' + base.name + ' ». Les photos d’origine restent.');
                dirty = false; dl.close();
                await opts.onSaved?.(j.result.media_id);
                if (!opts.onSaved) ext.refreshView?.();
            } catch (e) { toast(e.message, 'error'); msg.textContent = ''; btn.disabled = false; }
        });
        requestAnimationFrame(() => { fit(); draw(); });
        if (!layers.length) $('[data-as-add]').click();
    };

    // Visionneuse : « 🧩 Assembler » part de la photo affichée
    document.addEventListener('click', e => {
        if (!e.target.closest('#assemble-media')) return;
        const st = S(), item = st.lightboxMedia?.[st.lightboxIndex];
        if (!item) return;
        A().$('#lightbox')?.close();
        ext.openAssembler([item]);
    });
})();
