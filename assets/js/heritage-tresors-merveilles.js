/**
 * ✨ Trésors — les merveilles (lot 3) :
 *  - 🕯️ La bougie (Garder la mémoire) : allumer une bougie pour un ancêtre, avec un mot ; elle brûle sept jours, puis reste au
 *    registre ; les anniversaires de naissance et de décès des trente prochains jours sont rappelés.
 *  - 🔊 L'ambiance sonore d'époque (Découvrir) : la veillée au coin du feu, le village un dimanche, la forge, la gare, le moulin,
 *    l'orage, le port — tout est synthétisé dans le navigateur (aucun fichier son), couche par couche, avec un réglage par couche ;
 *    l'ambiance proposée suit le métier de l'ancêtre choisi.
 *  - 🌳 L'arbre qui pousse (Découvrir) : les descendants d'un ancêtre apparaissent année après année ; les feuilles roussissent à la mort.
 *  - 🎼 La musique de l'arbre (Créer) : chaque naissance est une note (hauteur selon la génération, durée selon la vie), chaque
 *    mariage un accord, chaque décès une note grave ; à écouter, ou à télécharger en fichier son (WAV).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const F = ext.tresorFeatures = ext.tresorFeatures || [];
    const A = () => window.LCNDA_APP;
    const AC = () => window.AudioContext || window.webkitAudioContext;

    /* ── 🕯️ La bougie ── */
    const LIT_DAYS = 7;
    const ageDays = s => (Date.now() - new Date(String(s).replace(' ', 'T') + (String(s).includes('T') || /Z$/.test(s) ? '' : 'Z')).getTime()) / 86400000;
    /** les anniversaires (naissance, décès) des personnes disparues dans les « days » prochains jours */
    function anniversaries(T, tr, days = 30) {
        const now = new Date(), t0 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()), out = [];
        tr.people.filter(p => !p.living).forEach(p => [['bd', 'naissance', p.bd], ['dd', 'décès', p.dd]].forEach(([, what, d]) => {
            if (!d) return; const [y, m, dd] = d.split('-').map(Number); let next = Date.UTC(now.getFullYear(), m - 1, dd); if (next < t0) next = Date.UTC(now.getFullYear() + 1, m - 1, dd);
            const n = Math.round((next - t0) / 86400000); if (n <= days) out.push({p, what, n, years: new Date(next).getUTCFullYear() - y, d});
        }));
        return out.sort((a, b) => a.n - b.n);
    }
    const flame = (lit, big = false) => `<span class="h-tr-candle${lit ? ' is-lit' : ''}${big ? ' is-big' : ''}" aria-hidden="true"><i class="fl"></i><i class="wax"></i></span>`;
    function lightDialog(T, pid, after) {
        ext.openDialog({eyebrow: 'UNE BOUGIE', title: '🕯️ Allumer une bougie', submitLabel: '🕯️ Allumer', body: `<div class="form-grid"><div class="span-2"><span class="pk-lab">Pour</span>${T.personField('who', pid)}</div>
            <label class="span-2">Un mot (facultatif)<textarea name="msg" rows="3" maxlength="500" placeholder="On pense à toi."></textarea></label><label class="span-2">De la part de<input name="from" maxlength="120" placeholder="Léa"></label></div>`,
            onSubmit: async form => { const id = Number(form.elements.who.value) || 0; if (!id) { T.toast('Choisis pour qui.', 'error'); return false; }
                const tr = await T.tree(), p = tr.byId.get(id);
                await T.save({kind: 'candle', person_id: id, title: `Pour ${T.name(p)}`, body: form.elements.msg.value.trim(), data: {from: form.elements.from.value.trim()}});
                T.toast(`🕯️ Une bougie brûle pour ${T.name(p)} pendant ${LIT_DAYS} jours.`, 'success'); after?.(); }});
    }
    async function renderCandles(host, T) {
        const tr = await T.tree();
        const draw = async () => {
            const list = await T.items('candle'), lit = list.filter(c => ageDays(c.created_at) < LIT_DAYS), ann = anniversaries(T, tr, 30);
            host.innerHTML = `<div class="h-tr-row h-tr-noprint"><button type="button" class="button" data-cd-new>🕯️ Allumer une bougie</button><span class="h-tr-muted">${lit.length} bougie${lit.length > 1 ? 's' : ''} allumée${lit.length > 1 ? 's' : ''} · ${list.length} au registre</span></div>
                ${lit.length ? `<div class="h-tr-candles">${lit.map(c => { const p = tr.byId.get(c.person_id); return `<figure class="h-tr-cd">${flame(true, true)}<figcaption><b>${T.esc(p ? T.name(p) : c.title)}</b><small>${T.esc(p ? T.life(p) : '')}</small>${c.body ? `<q>${T.esc(c.body)}</q>` : ''}<small>${c.data?.from ? `de ${T.esc(c.data.from)} · ` : ''}encore ${Math.max(1, Math.ceil(LIT_DAYS - ageDays(c.created_at)))} j</small><button type="button" class="h-tr-link h-tr-noprint" data-cd-del="${c.id}" title="Éteindre et retirer cette bougie">🗑 Supprimer</button></figcaption></figure>`; }).join('')}</div>` : '<p class="h-tr-muted">Aucune bougie allumée en ce moment.</p>'}
                ${ann.length ? `<h3>📅 Dans les trente jours</h3><ul class="h-tr-list">${ann.map(a => `<li class="h-tr-item"><span class="h-tr-ic">${a.what === 'décès' ? '🕯️' : '🎂'}</span><div class="h-tr-grow"><b>${T.esc(T.name(a.p))}</b> — ${a.n === 0 ? 'aujourd’hui' : a.n === 1 ? 'demain' : `dans ${a.n} jours`} : ${a.years} ans de sa ${a.what} (${T.esc(T.dateFr(a.d))})</div><button type="button" class="button small secondary" data-cd-for="${a.p.id}">🕯️ Allumer</button></li>`).join('')}</ul>` : ''}
                ${list.length > lit.length ? `<h3>📖 Le registre</h3><ul class="h-tr-list">${list.filter(c => !lit.includes(c)).map(c => { const p = tr.byId.get(c.person_id); return `<li class="h-tr-item">${flame(false)}<div class="h-tr-grow"><b>${T.esc(p ? T.name(p) : c.title)}</b> <small>· allumée le ${T.esc(T.dateFr(String(c.created_at).slice(0, 10)))}${c.data?.from ? ` par ${T.esc(c.data.from)}` : ''}</small>${c.body ? `<br><q>${T.esc(c.body)}</q>` : ''}</div><button type="button" class="h-tr-link" data-cd-for="${c.person_id || ''}">Rallumer</button><button type="button" class="h-tr-link" data-cd-del="${c.id}" title="Retirer du registre">🗑 Supprimer</button></li>`; }).join('')}</ul>` : ''}`;
        };
        host.addEventListener('click', async e => {
            // 🗑 supprimer une bougie (avec « ↶ Annuler » : elle est remise telle quelle)
            const del = e.target.closest('[data-cd-del]');
            if (del) { const c = (await T.items('candle')).find(x => String(x.id) === del.dataset.cdDel); if (!c) return; await T.remove(c.id); await draw();
                const back = async () => { await T.save({kind: 'candle', person_id: c.person_id, title: c.title, body: c.body, data: c.data}); await draw(); };
                if (window.LCNDA_APP?.undoToast) window.LCNDA_APP.undoToast('Bougie supprimée', {undo: back}); else T.toast('Bougie supprimée.'); return; }
            if (e.target.closest('[data-cd-new]')) lightDialog(T, null, draw); const f = e.target.closest('[data-cd-for]'); if (f) lightDialog(T, Number(f.dataset.cdFor) || null, draw); });
        await draw();
    }
    F.push({key: 'bougie', group: 'memoire', icon: '🕯️', title: 'Allumer une bougie', desc: 'Une bougie pour un ancêtre, avec un mot : elle brûle sept jours. Les anniversaires de naissance et de décès à venir.', render: renderCandles});
    ext.tresorCandle = {anniversaries, lightDialog, LIT_DAYS};

    /* ── 🔊 L'ambiance sonore d'époque (synthétisée) ── */
    function noiseBuf(ac, kind = 'white') {
        const n = ac.sampleRate * 2, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0); let last = 0;
        for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
        return b;
    }
    const loop = (ac, buf) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
    const filt = (ac, type, f, q = 1) => { const x = ac.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
    const lfo = (ac, target, rate, depth) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(target); o.start(); return o; };
    /** un coup bref (tic, crépitement, goutte, coup de marteau) : partiels sinusoïdaux qui s'éteignent */
    function strike(ac, out, t, partials, decay, vol) { partials.forEach(([f, a]) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; g.gain.setValueAtTime(vol * a, t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay * (a > 0.5 ? 1 : 0.6)); o.connect(g); g.connect(out); o.start(t); o.stop(t + decay + 0.05); }); }
    function burst(ac, out, t, buf, f, dur, vol, type = 'bandpass') { const s = ac.createBufferSource(), fl = filt(ac, type, f, 1.2), g = ac.createGain(); s.buffer = buf; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.02); }
    // chaque couche : (ac, out, bufs) → {tick(t0, t1) : programme ses sons entre t0 et t1 (facultatif), nodes}
    const LAYERS = {
        vent: ['🌬️ Le vent', (ac, out, B) => { const s = loop(ac, B.white), f = filt(ac, 'bandpass', 500, 0.6), g = ac.createGain(); g.gain.value = 0.25; s.connect(f); f.connect(g); g.connect(out); lfo(ac, f.frequency, 0.07, 250); lfo(ac, g.gain, 0.05, 0.18); return {}; }],
        pluie: ['🌧️ La pluie', (ac, out, B) => { const s = loop(ac, B.white), f = filt(ac, 'highpass', 1800, 0.5), g = ac.createGain(); g.gain.value = 0.18; s.connect(f); f.connect(g); g.connect(out);
            return {tick: (a, b) => { for (let t = a; t < b; t += 0.01) if (Math.random() < 0.25) burst(ac, out, t, B.white, 2500 + Math.random() * 3000, 0.03, 0.25); }}; }],
        feu: ['🔥 Le feu de cheminée', (ac, out, B) => { const s = loop(ac, B.brown), f = filt(ac, 'lowpass', 400), g = ac.createGain(); g.gain.value = 0.5; s.connect(f); f.connect(g); g.connect(out);
            return {tick: (a, b) => { for (let t = a; t < b; t += 0.02) if (Math.random() < 0.06) burst(ac, out, t, B.white, 2500 + Math.random() * 2500, 0.015 + Math.random() * 0.03, 0.6 + Math.random() * 0.6, 'highpass'); }}; }],
        horloge: ['🕰️ L’horloge comtoise', (ac, out) => { let n = 0; return {tick: (a, b) => { for (let t = Math.ceil(a); t < b; t++) { n++; strike(ac, out, t, [[n % 2 ? 1900 : 1500, 1], [n % 2 ? 4200 : 3300, 0.4]], 0.06, 0.25);
            if (n % 40 === 0) [0, 1.4, 2.8].forEach((d, k) => strike(ac, out, t + 0.5 + d, [[[523, 659, 784][k], 1], [[523, 659, 784][k] * 2.76, 0.3]], 2.5, 0.12)); } }}; }],
        cloches: ['🔔 Les cloches du village', (ac, out) => { let next = 0; const P = [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011], A2 = [0.6, 1, 0.5, 0.35, 0.3, 0.2, 0.15, 0.1];
            return {tick: (a, b) => { if (!next) next = a; while (next < b) { const f0 = [220, 247, 196, 262][Math.floor(Math.random() * 4)]; strike(ac, out, next, P.map((p, k) => [f0 * p, A2[k]]), 4.5, 0.09); next += 1.3 + Math.random() * 0.6; } }}; }],
        forge: ['⚒️ L’enclume du forgeron', (ac, out) => { let next = 0; return {tick: (a, b) => { if (!next) next = a; while (next < b) { [0, 0.32].forEach(d => strike(ac, out, next + d, [[880, 1], [2430, 0.6], [4750, 0.35]], 0.9, 0.18 * (d ? 0.6 : 1))); next += 1.4 + Math.random() * 1.2; } }}; }],
        oiseaux: ['🐦 Les oiseaux', (ac, out) => ({tick: (a, b) => { for (let t = a; t < b; t += 0.1) if (Math.random() < 0.05) { const n = 2 + Math.floor(Math.random() * 4), f0 = 2200 + Math.random() * 1800;
            for (let k = 0; k < n; k++) { const o = ac.createOscillator(), g = ac.createGain(), s = t + k * 0.11; o.frequency.setValueAtTime(f0, s); o.frequency.exponentialRampToValueAtTime(f0 * (1.3 + Math.random() * 0.5), s + 0.07); g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.06, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.08); o.connect(g); g.connect(out); o.start(s); o.stop(s + 0.1); } } }})],
        riviere: ['💧 La rivière et le moulin', (ac, out, B) => { const s = loop(ac, B.white), f = filt(ac, 'bandpass', 900, 0.4), g = ac.createGain(); g.gain.value = 0.3; s.connect(f); f.connect(g); g.connect(out); lfo(ac, f.frequency, 0.3, 300);
            let next = 0; return {tick: (a, b) => { if (!next) next = a; while (next < b) { burst(ac, out, next, B.brown, 120, 0.5, 0.5, 'lowpass'); next += 2.2; } }}; }],
        train: ['🚂 Le train à vapeur', (ac, out, B) => { let next = 0, k = 0; return {tick: (a, b) => { if (!next) next = a; while (next < b) { burst(ac, out, next, B.white, 700, 0.18, k % 4 === 0 ? 0.6 : 0.35, 'lowpass'); k++; next += 0.32;
            if (k % 60 === 20) [700, 880].forEach(f => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, next); g.gain.exponentialRampToValueAtTime(0.05, next + 0.1); g.gain.setValueAtTime(0.05, next + 1.1); g.gain.exponentialRampToValueAtTime(0.0001, next + 1.5); o.connect(g); g.connect(out); o.start(next); o.stop(next + 1.6); }); } }}; }],
        mer: ['🌊 La mer', (ac, out, B) => { const s = loop(ac, B.white), f = filt(ac, 'lowpass', 700, 0.3), g = ac.createGain(); g.gain.value = 0.2; s.connect(f); f.connect(g); g.connect(out); lfo(ac, g.gain, 0.12, 0.19); lfo(ac, f.frequency, 0.12, 300); return {}; }]};
    /** comment chaque couche est fabriquée (montré dans « Crédits et droits ») */
    const AMBIANCE_HOW = {vent: 'bruit blanc filtré, qui ondule lentement', pluie: 'bruit aigu et milliers de petites gouttes au hasard', feu: 'bruit grave et crépitements au hasard', horloge: 'deux « tic » de sons purs, un carillon toutes les 40 secondes',
        cloches: 'sons purs aux harmoniques des cloches de bronze', forge: 'coups métalliques : trois sons purs qui s’éteignent', oiseaux: 'petits sifflets de sons purs qui montent', riviere: 'bruit filtré et le battement grave de la roue', train: 'souffles de vapeur rythmés et un sifflet à deux notes', mer: 'bruit grave qui monte et descend comme les vagues'};
    const SCENES = {veillee: ['🔥 La veillée au coin du feu (vers 1880)', {feu: 0.8, horloge: 0.5, vent: 0.3}], village: ['🔔 Le village un dimanche matin', {cloches: 0.7, oiseaux: 0.6, vent: 0.15}], forge: ['⚒️ L’atelier du forgeron', {forge: 0.8, feu: 0.4}],
        gare: ['🚂 La gare (vers 1900)', {train: 0.8, vent: 0.2}], moulin: ['💧 Le moulin au bord de l’eau', {riviere: 0.8, oiseaux: 0.4}], orage: ['🌧️ La nuit d’orage', {pluie: 0.8, vent: 0.6, horloge: 0.2}], port: ['🌊 Le port', {mer: 0.8, vent: 0.3, oiseaux: 0.15}]};
    const sceneFor = occ => { const o = String(occ || '').toLowerCase(); return /forgeron|maréchal|serrurier|taillandier/.test(o) ? 'forge' : /chemin|mécanicien|gare|chauffeur/.test(o) ? 'gare' : /meunier|moulin|tanneur/.test(o) ? 'moulin' : /marin|pêcheur|matelot|capitaine|douanier/.test(o) ? 'port' : /labour|cultiv|fermier|métayer|vigneron|berger|journalier/.test(o) ? 'village' : 'veillee'; };
    /** joue une ambiance → {set(couche, volume), stop()} */
    function playScene(mix) {
        const ac = new (AC())(), master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination); master.gain.linearRampToValueAtTime(0.9, ac.currentTime + 2);
        const B = {white: noiseBuf(ac), brown: noiseBuf(ac, 'brown')}, gains = {}, ticks = [];
        Object.keys(LAYERS).forEach(k => { const g = ac.createGain(); g.gain.value = mix[k] || 0; g.connect(master); gains[k] = g; const l = LAYERS[k][1](ac, g, B); if (l.tick) ticks.push([k, l.tick]); });
        let until = ac.currentTime; const iv = setInterval(() => { const end = ac.currentTime + 0.5; if (end <= until) return; ticks.forEach(([k, f]) => { if (gains[k].gain.value > 0.001) f(until, end); }); until = end; }, 150);
        return {ac, set: (k, v) => gains[k]?.gain.setTargetAtTime(v, ac.currentTime, 0.2), stop: () => { clearInterval(iv); master.gain.setTargetAtTime(0, ac.currentTime, 0.3); setTimeout(() => ac.close().catch(() => {}), 1200); }};
    }
    async function renderAmbiance(host, T) {
        const tr = await T.tree(), withOcc = tr.people.filter(p => p.occ && !p.living);
        host.innerHTML = `<div class="h-tr-panel h-tr-row"><label>L’ambiance<select data-am-s>${Object.entries(SCENES).map(([k, [l]]) => `<option value="${k}">${T.esc(l)}</option>`).join('')}</select></label>
            ${withOcc.length ? `<label>Ou celle du métier de<select data-am-p><option value="">—</option>${withOcc.map(p => `<option value="${p.id}">${T.esc(T.name(p))} (${T.esc(p.occ)})</option>`).join('')}</select></label>` : ''}
            <button type="button" class="button" data-am-play>▶ Écouter</button><button type="button" class="button secondary" data-am-stop>⏹ Arrêter</button></div>
            <div class="h-tr-panel"><p class="h-tr-muted">Tout est fabriqué par l’ordinateur, à partir de bruit et de sons purs : une évocation, pas un enregistrement. Règle chaque couche à ton goût.</p><div class="h-tr-mixer" data-am-mix>${Object.entries(LAYERS).map(([k, [l]]) => `<label>${T.esc(l)}<input type="range" min="0" max="100" value="0" data-am-l="${k}"></label>`).join('')}</div></div>
            <details class="h-tr-panel h-tr-credits"><summary><b>© Crédits et droits des sons</b></summary>
                <p>Aucun enregistrement n’est utilisé : <b>chaque son est calculé par ton navigateur</b> au moment où tu l’écoutes (Web Audio), à partir de bruit et de sons purs. Il n’y a donc aucun auteur à créditer en dehors de LCNDA, et rien n’est téléchargé.</p>
                <p><b>Libres de droits</b> : tu peux les écouter, les enregistrer, les mettre dans un montage ou une présentation, même les partager, sans rien demander (comme le domaine public, CC0).</p>
                <ul>${Object.entries(AMBIANCE_HOW).map(([k, how]) => `<li>${T.esc(LAYERS[k]?.[0] || k)} — ${T.esc(how)}</li>`).join('')}</ul></details>`;
        let player = null;
        const mix = () => Object.fromEntries([...host.querySelectorAll('[data-am-l]')].map(i => [i.dataset.amL, Number(i.value) / 100]));
        const setScene = k => { const m = SCENES[k][1]; host.querySelectorAll('[data-am-l]').forEach(i => { i.value = Math.round((m[i.dataset.amL] || 0) * 100); player?.set(i.dataset.amL, Number(i.value) / 100); }); host.querySelector('[data-am-s]').value = k; };
        host.querySelector('[data-am-s]').addEventListener('change', e => setScene(e.target.value));
        host.querySelector('[data-am-p]')?.addEventListener('change', e => { const p = tr.byId.get(Number(e.target.value)); if (p) setScene(sceneFor(p.occ)); });
        host.querySelector('[data-am-mix]').addEventListener('input', e => { const i = e.target.closest('[data-am-l]'); if (i) player?.set(i.dataset.amL, Number(i.value) / 100); });
        host.querySelector('[data-am-play]').addEventListener('click', () => { if (!AC()) return T.toast('Ce navigateur ne sait pas jouer de sons.', 'error'); player?.stop(); player = playScene(mix()); host.dataset.playing = '1'; });
        const stop = () => { player?.stop(); player = null; delete host.dataset.playing; };
        host.querySelector('[data-am-stop]').addEventListener('click', stop);
        const obs = new MutationObserver(() => { if (!host.isConnected) { stop(); obs.disconnect(); } }); obs.observe(document.getElementById('workspace') || document.body, {childList: true, subtree: true});
        setScene('veillee');
    }
    F.push({key: 'ambiance', group: 'decouvrir', icon: '🔊', title: 'L’ambiance sonore d’époque', desc: 'Le feu et l’horloge de la veillée, les cloches du dimanche, la forge, la gare, le moulin : les bruits du temps des ancêtres.', render: renderAmbiance});
    ext.tresorAmbiance = {SCENES, LAYERS, sceneFor, playScene};

    /* ── 🌳 L'arbre qui pousse ── */
    /** l'ancêtre le plus ancien de la personne de départ qui a le plus de descendants connus */
    function oldestRoot(T, tr) {
        const st = T.start(tr); if (!st) return null;
        const anc = T.ancestors(tr, st.id, 30); if (!anc.length) return st;
        const top = Math.max(...anc.map(a => a.gen)); return anc.filter(a => a.gen === top).map(a => tr.byId.get(a.id)).sort((a, b) => T.descendants(tr, [b.id]).length - T.descendants(tr, [a.id]).length || (a.by || 9999) - (b.by || 9999))[0];
    }
    /** la mise en place : chaque descendant, sa génération, sa place (x) ; les feuilles réparties, les parents au milieu de leurs enfants */
    function growLayout(T, tr, rootId) {
        const seen = new Set(), nodes = [];
        const walk = (id, gen, parent) => { if (seen.has(id) || gen > 12) return null; seen.add(id); const p = tr.byId.get(id); if (!p) return null;
            const n = {id, p, gen, parent, kids: []}; nodes.push(n); [...new Set(tr.kids.get(id) || [])].map(k => tr.byId.get(k)).filter(Boolean).sort((a, b) => (a.by || 9999) - (b.by || 9999)).forEach(k => { const c = walk(k.id, gen + 1, n); if (c) n.kids.push(c); }); return n; };
        const root = walk(rootId, 0, null); if (!root) return null;
        let leaf = 0; const place = n => { if (!n.kids.length) n.x = leaf++; else { n.kids.forEach(place); n.x = (n.kids[0].x + n.kids.at(-1).x) / 2; } }; place(root);
        // l'année d'apparition : la naissance, sinon celle du parent + 25
        const year = n => n.p.by || (n.parent ? year(n.parent) + 25 : 1800); nodes.forEach(n => { n.y0 = year(n); n.y1 = n.p.dy || (n.p.living ? null : null); });
        return {root, nodes, leaves: Math.max(1, leaf), gens: Math.max(...nodes.map(n => n.gen)) + 1};
    }
    async function renderGrow(host, T) {
        const tr = await T.tree(), r0 = oldestRoot(T, tr);
        if (!r0) { host.innerHTML = '<p class="h-tr-muted">L’arbre est vide.</p>'; return; }
        host.innerHTML = `<div class="h-tr-row h-tr-noprint"><div style="min-width:260px"><span class="pk-lab">À partir de</span>${T.personField('root', r0.id)}</div><button type="button" class="button" data-gr-play>▶ Faire pousser</button>
            <label>Vitesse<select data-gr-v><option value="4">lente</option><option value="8" selected>normale</option><option value="16">rapide</option></select></label><span class="h-tr-big" data-gr-y></span></div>
            <div class="h-tr-grow-box" data-gr-box></div><input type="range" data-gr-r style="width:100%" step="0.1">`;
        const box = host.querySelector('[data-gr-box]'), range = host.querySelector('[data-gr-r]'), yEl = host.querySelector('[data-gr-y]'), rootEl = host.querySelector('[name=root]');
        let L = null, els = [], raf = 0, y0 = 0, y1 = 0;
        const build = () => {
            cancelAnimationFrame(raf); L = growLayout(T, tr, Number(rootEl.value) || r0.id); if (!L) return;
            const W = Math.max(900, L.leaves * 70), H = 140 + L.gens * 120, X = n => 40 + (n.x + 0.5) * (W - 80) / L.leaves, Y = n => H - 70 - n.gen * 120;
            y0 = Math.min(...L.nodes.map(n => n.y0)) - 2; y1 = new Date().getFullYear(); range.min = y0; range.max = y1;
            box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:${Math.min(W, 1400)}px"><defs><linearGradient id="h-tr-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9f4ff"/><stop offset="1" stop-color="#fbf7ea"/></linearGradient></defs>
                <rect width="${W}" height="${H}" fill="url(#h-tr-sky)"/><path d="M0 ${H - 30} Q${W / 2} ${H - 60} ${W} ${H - 30} V${H} H0Z" fill="#a9c57a"/>
                <path d="M${X(L.root)} ${H - 40} L${X(L.root)} ${Y(L.root)}" stroke="#6b4423" stroke-width="${Math.min(40, 8 + L.nodes.length / 4)}" stroke-linecap="round" data-gr-trunk/>
                ${L.nodes.filter(n => n.parent).map(n => { const a = n.parent, d = `M${X(a)} ${Y(a)} C${X(a)} ${Y(a) - 60} ${X(n)} ${Y(n) + 60} ${X(n)} ${Y(n)}`; return `<path d="${d}" stroke="#7a5230" fill="none" stroke-width="${Math.max(2, 10 - n.gen * 1.5)}" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" data-gr-b="${n.id}"/>`; }).join('')}
                ${L.nodes.map(n => `<g data-gr-n="${n.id}" opacity="0" transform="translate(${X(n)} ${Y(n)})"><circle r="17" fill="#4caf50"/><text y="34" text-anchor="middle" font-size="13" font-family="system-ui" fill="#2b2b2b">${T.esc(n.p.first || T.name(n.p))}</text><text y="49" text-anchor="middle" font-size="11" font-family="system-ui" fill="#666">${n.p.by || ''}</text></g>`).join('')}</svg>`;
            els = L.nodes.map(n => ({n, g: box.querySelector(`[data-gr-n="${n.id}"]`), b: box.querySelector(`[data-gr-b="${n.id}"]`), c: box.querySelector(`[data-gr-n="${n.id}"] circle`)}));
            show(y0);
        };
        const show = y => { range.value = y; yEl.textContent = Math.floor(y);
            els.forEach(({n, g, b, c}) => { const grown = Math.max(0, Math.min(1, (y - n.y0 + 1.5) / 1.5)); if (b) b.setAttribute('stroke-dashoffset', String(1 - grown)); g.setAttribute('opacity', String(Math.max(0, Math.min(1, (y - n.y0) / 1))));
                const dead = n.p.dy && y >= n.p.dy, f = dead ? Math.min(1, (y - n.p.dy) / 3) : 0; c.setAttribute('fill', dead ? `rgb(${Math.round(76 + 130 * f)},${Math.round(175 - 60 * f)},${Math.round(80 - 50 * f)})` : '#4caf50'); g.dataset.dead = dead ? '1' : ''; }); };
        const play = () => { cancelAnimationFrame(raf); let y = Number(range.value) >= y1 ? y0 : Number(range.value), last = performance.now(); const sp = Number(host.querySelector('[data-gr-v]').value);
            const step = now => { y = Math.min(y1, y + (now - last) / 1000 * sp); last = now; show(y); if (y < y1 && host.isConnected) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); };
        rootEl.addEventListener('change', build); range.addEventListener('input', () => { cancelAnimationFrame(raf); show(Number(range.value)); });
        host.querySelector('[data-gr-play]').addEventListener('click', play);
        build(); ext.tresorGrow.show = show;
    }
    F.push({key: 'arbre-pousse', group: 'decouvrir', icon: '🌳', title: 'L’arbre qui pousse', desc: 'Les descendants d’un ancêtre apparaissent année après année, les branches poussent, les feuilles roussissent.', render: renderGrow});
    ext.tresorGrow = {oldestRoot, growLayout};

    /* ── 🎼 La musique de l'arbre ── */
    const SCALE = [0, 2, 4, 7, 9]; // gamme pentatonique : tout sonne juste ensemble
    const midiHz = m => 440 * 2 ** ((m - 69) / 12);
    /** la partition : [{t (s), m (note midi), d (s), v, kind}] ; une année = « spy » secondes */
    function score(T, tr, ids, spy = 0.18) {
        const people = ids.map(i => tr.byId.get(i)).filter(p => p?.by), y0 = Math.min(...people.map(p => p.by)), st = T.start(tr), anc = new Map(st ? T.ancestors(tr, st.id, 30).map(a => [a.id, a.gen]) : []);
        const notes = [], gen = p => anc.get(p.id) ?? Math.max(0, Math.round((new Date().getFullYear() - p.by) / 28));
        people.forEach(p => { const g = Math.min(12, gen(p)), deg = (12 - g) + (p.gender === 'female' ? 2 : 0), m = 48 + Math.floor(deg / 5) * 12 + SCALE[deg % 5], life = (p.dy || (p.living ? new Date().getFullYear() : p.by + 50)) - p.by;
            notes.push({t: (p.by - y0) * spy, m, d: Math.max(0.25, Math.min(4, life * spy * 0.18)), v: 0.22, kind: p.gender === 'female' ? 'triangle' : 'sine', who: p.id});
            if (p.dy) notes.push({t: (p.dy - y0) * spy, m: 36 + SCALE[g % 5], d: 1.6, v: 0.1, kind: 'sine', who: p.id, death: true}); });
        tr.families.filter(f => f.my && (ids.includes(f.a) || ids.includes(f.b))).forEach(f => [0, 4, 7].forEach(iv => notes.push({t: (f.my - y0) * spy, m: 60 + iv, d: 1.2, v: 0.07, kind: 'triangle', wed: true})));
        return {notes: notes.filter(n => n.t >= 0).sort((a, b) => a.t - b.t), y0, spy, length: Math.max(...notes.map(n => n.t + n.d), 1) + 1};
    }
    function voice(ac, out, n, t) { const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(); o.type = n.kind; o2.type = 'sine'; o.frequency.value = midiHz(n.m); o2.frequency.value = midiHz(n.m) * 2.003;
        const g2 = ac.createGain(); g2.gain.value = 0.15; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(n.v, t + 0.02); g.gain.exponentialRampToValueAtTime(n.v * 0.4, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + n.d + 0.4);
        o.connect(g); o2.connect(g2); g2.connect(g); g.connect(out); [o, o2].forEach(x => { x.start(t); x.stop(t + n.d + 0.5); }); }
    function wav(buf) { const ch = buf.numberOfChannels, len = buf.length, data = new DataView(new ArrayBuffer(44 + len * ch * 2)), w = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
        w(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVEfmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true); data.setUint32(24, buf.sampleRate, true); data.setUint32(28, buf.sampleRate * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, len * ch * 2, true);
        const chans = [...Array(ch)].map((_, c) => buf.getChannelData(c)); let o = 44; for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, chans[c][i])); data.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
        return new Blob([data], {type: 'audio/wav'}); }
    async function renderMusic(host, T) {
        const tr = await T.tree(), st = T.start(tr);
        host.innerHTML = `<div class="h-tr-row h-tr-noprint"><div style="min-width:240px"><span class="pk-lab">Autour de</span>${T.personField('root', st?.id)}</div><label>Qui<select data-mu-s><option value="all">tout l’arbre</option><option value="anc">ses ancêtres</option><option value="desc">ses descendants</option></select></label>
            <label>Tempo<select data-mu-t><option value="0.3">lent</option><option value="0.18" selected>normal</option><option value="0.1">vif</option></select></label>
            <button type="button" class="button" data-mu-play>▶ Écouter</button><button type="button" class="button secondary" data-mu-stop>⏹</button><button type="button" class="button secondary" data-mu-wav>⬇ Fichier son (WAV)</button></div>
            <p class="h-tr-muted">Chaque naissance est une note : plus aiguë pour les générations proches, plus longue pour une longue vie, au timbre plus doux pour les femmes ; chaque mariage, un accord ; chaque décès, une note grave.</p>
            <canvas class="h-tr-canvas" data-mu-c width="1200" height="320"></canvas><p class="h-tr-muted" data-mu-info></p>`;
        const cv = host.querySelector('[data-mu-c]'), x = cv.getContext('2d'), info = host.querySelector('[data-mu-info]');
        let S = null, ac = null, raf = 0;
        const ids = () => { const r = Number(host.querySelector('[name=root]').value) || st?.id, s = host.querySelector('[data-mu-s]').value; return s === 'anc' ? [r, ...T.ancestors(tr, r).map(a => a.id)] : s === 'desc' ? [r, ...T.descendants(tr, [r]).map(a => a.id)] : tr.people.map(p => p.id); };
        const draw = (pos = -1) => { S = score(T, tr, ids(), Number(host.querySelector('[data-mu-t]').value)); const W = cv.width, H = cv.height, sx = W / S.length;
            x.fillStyle = '#0f1424'; x.fillRect(0, 0, W, H);
            S.notes.forEach(n => { x.fillStyle = n.death ? '#7d8597' : n.wed ? '#f2c14e' : n.kind === 'triangle' ? '#f28cb1' : '#6cb6ff'; x.globalAlpha = pos >= 0 && n.t > pos ? 0.35 : 0.95; x.fillRect(n.t * sx, H - (n.m - 30) * 5, Math.max(3, n.d * sx), 6); }); x.globalAlpha = 1;
            x.fillStyle = '#aab'; x.font = '13px system-ui'; for (let y = Math.ceil(S.y0 / 50) * 50; (y - S.y0) * S.spy < S.length; y += 50) { const px = (y - S.y0) * S.spy * sx; x.fillRect(px, H - 14, 1, 14); x.fillText(String(y), px + 3, H - 3); }
            if (pos >= 0) { x.fillStyle = '#fff'; x.fillRect(pos * sx, 0, 2, H); x.font = 'bold 22px system-ui'; x.fillText(String(Math.floor(S.y0 + pos / S.spy)), 12, 28); }
            info.textContent = `${S.notes.filter(n => !n.death && !n.wed).length} naissances, ${S.notes.filter(n => n.wed).length / 3} mariages, ${S.notes.filter(n => n.death).length} décès — ${Math.round(S.length)} secondes`; };
        const stop = () => { cancelAnimationFrame(raf); if (ac) { const a = ac; ac = null; a.close().catch(() => {}); } draw(); };
        host.querySelector('[data-mu-play]').addEventListener('click', () => { if (!AC()) return T.toast('Ce navigateur ne sait pas jouer de sons.', 'error'); stop(); draw(); ac = new (AC())(); const out = ac.createGain(); out.gain.value = 0.8; out.connect(ac.destination); const t0 = ac.currentTime + 0.2, me = ac;
            S.notes.forEach(n => voice(ac, out, n, t0 + n.t)); const step = () => { if (ac !== me) return; const p = ac.currentTime - t0; draw(p); if (p < S.length) raf = requestAnimationFrame(step); else stop(); }; raf = requestAnimationFrame(step); });
        host.querySelector('[data-mu-stop]').addEventListener('click', stop);
        host.querySelector('[data-mu-wav]').addEventListener('click', async () => { draw(); const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) return T.toast('Ce navigateur ne sait pas fabriquer de fichier son.', 'error');
            const sr = 22050, len = Math.min(600, S.length + 1), oc = new OAC(2, Math.ceil(sr * len), sr), out = oc.createGain(); out.gain.value = 0.8; out.connect(oc.destination); S.notes.filter(n => n.t < len).forEach(n => voice(oc, out, n, n.t));
            info.textContent = 'Je fabrique le fichier son…'; const buf = await oc.startRendering(), blob = wav(buf); T.download('la-musique-de-l-arbre.wav', blob); draw(); ext.tresorMusic.last = blob.size; });
        host.querySelectorAll('[name=root],[data-mu-s],[data-mu-t]').forEach(el => el.addEventListener('change', () => { stop(); }));
        const obs = new MutationObserver(() => { if (!host.isConnected) { stop(); obs.disconnect(); } }); obs.observe(document.getElementById('workspace') || document.body, {childList: true, subtree: true});
        draw();
    }
    F.push({key: 'musique', group: 'creer', icon: '🎼', title: 'La musique de l’arbre', desc: 'L’arbre joué comme une partition : une note par naissance, un accord par mariage ; à écouter ou à télécharger.', render: renderMusic});
    ext.tresorMusic = {score, wav};
})();
