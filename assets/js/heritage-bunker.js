/* LCNDA — ☢ Le bunker : l'écran (le moteur est dans heritage-bunker-moteur.js).
 * Bien caché : Pièce d'archives (Konami code) → porte « Labo photo » → trois clics sur la lampe rouge → la trappe au sol.
 * Parties gardées sur cet ordinateur (localStorage « lcnda-bunker »), et dans un fichier (⤓ Exporter / ⤒ Ouvrir).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const P = () => window.LCNDA_PICKER;
    const B = () => window.LCNDA_BUNKER;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const KEY = 'lcnda-bunker';
    const toast = (m, k) => A()?.toast?.(m, k);
    const plural = (n, w, m) => (A()?.plural ? A().plural(n, w, m) : `${n} ${w}${n > 1 ? 's' : ''}`);

    /* ═════════ Les parties gardées ═════════ */
    const store = () => { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return {games: o.games && typeof o.games === 'object' ? o.games : {}, last: o.last || ''}; } catch (_) { return {games: {}, last: ''}; } };
    function saveGame(id, g, quiet = false) {
        const s = store(); s.games[id] = {name: meOf(g)?.name || 'Sans nom', city: g.city.name, saved: Date.now(), g}; s.last = id;
        try { localStorage.setItem(KEY, JSON.stringify(s)); if (!quiet) toast('✓ Partie enregistrée.'); return true; }
        catch (_) { toast('La partie n’a pas pu être enregistrée (plus de place sur cet ordinateur) : exporte-la dans un fichier.', 'error'); return false; }
    }
    const meOf = g => g.people.find(p => p.me) || g.people[0];

    /* ═════════ La fenêtre ═════════ */
    let dlg = null, G = null, gid = '', tab = 'gens', placeSel = null, timer = 0, acc = 0, lastTick = 0, lastSaveHour = -1;
    function open() {
        if (!B()) { toast('Le bunker n’a pas pu se charger.', 'error'); return; }
        dlg?.remove();
        dlg = document.createElement('dialog'); dlg.className = 'bk-dlg'; dlg.setAttribute('aria-label', 'Le bunker');
        document.body.append(dlg);
        dlg.addEventListener('close', () => { stop(); if (G && gid) saveGame(gid, G, true); G = null; dlg?.remove(); dlg = null; });
        dlg.addEventListener('click', onClick); dlg.addEventListener('change', onChange);
        dlg.addEventListener('keydown', e => { if (e.key === ' ' && G && !e.target.closest('input, textarea, select, button, .pk')) { e.preventDefault(); setSpeed(G.speed ? 0 : 1); } });
        dlg.showModal(); startScreen();
    }
    ext.openBunker = open;

    /* ═════════ L'accueil : continuer ou commencer ═════════ */
    async function startScreen() {
        stop(); G = null; gid = '';
        const s = store(), saved = Object.entries(s.games).sort((a, b) => b[1].saved - a[1].saved);
        dlg.innerHTML = `<div class="bk-start">
            <header class="bk-start-head"><span class="bk-hatch-ico" aria-hidden="true"></span><div><span class="eyebrow">☢ TU AS TROUVÉ LA TRAPPE</span><h2>Le bunker</h2><p class="muted">Personne ne sait qu’il existe. Tu y descends avec des ancêtres de ton arbre : il faut boire, manger, dormir, se laver… et tenir le plus longtemps possible.</p></div><button type="button" class="icon-button" data-bk="close" aria-label="Fermer">×</button></header>
            ${saved.length ? `<section class="bk-card"><h3>Parties enregistrées</h3><div class="bk-saves">${saved.map(([id, x]) => { const g = x.g; const al = g.people.filter(p => p.hp > 0).length;
                return `<div class="bk-save"><div><b>Le bunker de ${esc(x.name)}</b><small>${esc(x.city)} · jour ${B().dayOf(g.t)} · ${g.over ? '☠️ terminé' : `${al} sur ${g.people.length} en vie`}</small></div><button type="button" class="button small" data-bk="resume" data-id="${esc(id)}">${g.over ? 'Revoir' : 'Continuer'}</button><button type="button" class="icon-button small" data-bk="delsave" data-id="${esc(id)}" title="Supprimer cette partie" aria-label="Supprimer">🗑</button></div>`; }).join('')}</div></section>` : ''}
            <form class="bk-card bk-new" data-bk-new><h3>Nouvelle partie</h3>
                <div class="bk-field"><span class="pk-lab">Qui incarnes-tu ?</span>${P() ? P().pickerField({name: 'bk_me', kind: 'person', animals: false}) : '<input name="bk_me_txt" placeholder="Ton nom">'}</div>
                <div class="bk-field"><span class="pk-lab">Qui descend avec toi ?</span><div class="bk-team-tools"><label>Combien <select name="bk_n">${[0, 1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></label><button type="button" class="button small secondary" data-bk="propose" title="Ses proches d’abord : parents, conjoint, enfants, frères et sœurs">🎲 Proposer des proches</button></div>${P() ? P().pickerField({name: 'bk_team', kind: 'person', multiple: true, animals: false}) : ''}</div>
                <div class="bk-field"><span class="pk-lab">Dans quelle ville ?</span><div class="bk-city"><select name="bk_city"><option value="">…</option></select><input name="bk_city_txt" placeholder="ou tape un nom de ville" maxlength="80"></div></div>
                <div class="bk-field"><span class="pk-lab">Taille de la ville</span><div class="segmented bk-size" role="radiogroup">${Object.entries(B().SIZES).map(([k, [n, nb, l]]) => `<label><input type="radio" name="bk_size" value="${k}" ${k === 'moyenne' ? 'checked' : ''}><span>${l} <small>${nb} lieux</small></span></label>`).join('')}</div></div>
                <div class="bk-actions"><label class="button secondary bk-import">⤒ Ouvrir une partie (fichier)<input type="file" accept=".json,application/json" data-bk-import hidden></label><span class="spacer"></span><button type="submit" class="button">☢ Descendre dans le bunker</button></div>
            </form></div>`;
        dlg.querySelector('[data-bk-new]').addEventListener('submit', e => { e.preventDefault(); begin(e.target); });
        // les villes de l'arbre, les plus fréquentes d'abord
        try {
            const tr = await tree(); const n = new Map();
            tr.people.forEach(p => [p.bplace, p.dplace].forEach(id => { if (id && tr.places[id]) n.set(id, (n.get(id) || 0) + 1); }));
            const sel = dlg?.querySelector('select[name="bk_city"]'); if (!sel) return;
            const list = [...n].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([id]) => tr.places[id].name.split(',')[0].trim()).filter((v, i, a) => v && a.indexOf(v) === i);
            sel.innerHTML = `<option value="">Choisir une ville de ton arbre…</option>${list.map(v => `<option>${esc(v)}</option>`).join('')}`;
            if (list[0]) sel.value = list[0];
        } catch (_) { /* sans arbre : on tape le nom */ }
    }
    let treeP = null;
    function tree() { treeP = treeP || (ext.tresors?.T?.tree ? ext.tresors.T.tree() : A().api('tresor_tree').then(d => ({...d, byId: new Map(d.people.map(p => [p.id, p]))}))); return treeP.catch(e => { treeP = null; throw e; }); }
    const nameOf = p => (p ? p.name || [p.first, p.last].filter(Boolean).join(' ') || 'Sans nom' : 'Sans nom');
    /** les proches d'abord (parents, conjoints, enfants, frères et sœurs), puis d'autres ancêtres au hasard */
    async function propose(form) {
        const me = Number(P()?.pickerValue(form.querySelector('[data-picker][data-pk-opts*="bk_me"]')) || 0), n = Number(form.elements.bk_n.value) || 0;
        let tr; try { tr = await tree(); } catch (_) { toast('L’arbre n’a pas pu être lu.', 'error'); return; }
        const out = [], push = id => { if (id && id !== me && !out.includes(id) && tr.byId.get(id)) out.push(id); };
        const p = tr.byId.get(me);
        if (p) {
            [p.father, p.mother].forEach(push);
            (tr.families || []).filter(f => f.a === me || f.b === me).forEach(f => { push(f.a === me ? f.b : f.a); (f.children || []).forEach(push); });
            (tr.families || []).filter(f => f.children?.includes(me)).forEach(f => f.children.forEach(push));
        }
        const rest = tr.people.filter(x => !x.living && x.id !== me && !out.includes(x.id)).map(x => x.id);
        while (out.length < n && rest.length) push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
        const field = form.querySelector('[data-picker][data-pk-opts*="bk_team"]');
        if (field) P().pickerSet(field, out.slice(0, n));
    }
    async function begin(form) {
        const meField = form.querySelector('[data-picker][data-pk-opts*="bk_me"]'), teamField = form.querySelector('[data-picker][data-pk-opts*="bk_team"]');
        const meId = Number(meField ? P().pickerValue(meField) : 0) || 0;
        if (meField && !meId) { UI().fail?.(meField, 'Choisis l’ancêtre que tu incarnes.'); return; }
        const teamIds = (teamField ? [].concat(P().pickerValue(teamField) || []) : []).map(Number).filter(id => id && id !== meId).slice(0, 6);
        let tr = null; try { tr = await tree(); } catch (_) { /* les noms viendront des pastilles */ }
        const who = id => { const p = tr?.byId.get(id); return {pid: id, name: p ? nameOf(p) : `Fiche ${id}`, gender: p?.gender || ''}; };
        const city = (form.elements.bk_city_txt.value.trim() || form.elements.bk_city.value || '').slice(0, 80);
        if (!city) { UI().fail?.(form.elements.bk_city_txt, 'Choisis ou tape une ville.'); return; }
        G = B().newGame({me: meId ? who(meId) : {name: form.elements.bk_me_txt?.value || 'Moi'}, team: teamIds.map(who), city: {name: city, size: form.elements.bk_size.value}});
        await locateCity(G.city);
        gid = 'b' + Date.now().toString(36); saveGame(gid, G, true); tab = 'gens'; placeSel = null; play();
    }

    /* ═════════ Le plan de la ville, en fond de la carte ═════════ */
    const fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    /** le centre de la ville : d'abord un lieu de l'arbre qui a ses coordonnées, sinon la commune de la base de référence */
    async function locateCity(c) {
        if (!c || c.lat != null || c.geo === 'none') return;
        const want = fold(c.name);
        try { const tr = await tree(); const pl = Object.values(tr.places || {}).find(x => x && x.lat != null && x.lng != null && fold(String(x.name).split(',')[0]) === want); if (pl) { c.lat = pl.lat; c.lng = pl.lng; return; } } catch (_) {}
        try {
            const r = await A().api('commune_suggestions', {q: c.name}), list = (r?.communes || []).filter(x => x.centroid_lat != null && x.centroid_lon != null);
            const best = list.find(x => fold(x.name) === want) || list[0];
            if (best) { c.lat = Number(best.centroid_lat); c.lng = Number(best.centroid_lon); return; }
        } catch (_) {}
        c.geo = 'none';
    }
    /** les tuiles du plan (comme la Carte de l'app), un peu plus de 3 tuiles de côté : petite ville zoom 16, moyenne 15, grande 14 */
    function mapBgHtml(c) {
        if (c.lat == null || !A().mapTileUrl) return '';
        const z = {petite: 16, moyenne: 15, grande: 14}[c.size] || 15, N = 2 ** z, W = 3.2;
        const fx = (c.lng + 180) / 360 * N, la = c.lat * Math.PI / 180, fy = (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * N;
        const x0 = fx - W / 2, y0 = fy - W / 2, out = [];
        for (let ty = Math.floor(y0); ty < y0 + W; ty++) for (let tx = Math.floor(x0); tx < x0 + W; tx++) {
            out.push(`<img src="${esc(A().mapTileUrl('color', z, ((tx % N) + N) % N, ty))}" alt="" loading="lazy" draggable="false" style="left:${(tx - x0) / W * 100}%;top:${(ty - y0) / W * 100}%;width:${100 / W}%;height:${100 / W}%">`);
        }
        return `<div class="bk-map-bg" aria-hidden="true">${out.join('')}</div><span class="bk-map-credit">© OpenStreetMap</span>`;
    }

    /* ═════════ La partie ═════════ */
    function play() {
        lastSaveHour = Math.floor(G.t / 360);
        dlg.innerHTML = `<div class="bk-game">
            <header class="bk-top"><b class="bk-title">☢ Le bunker de ${esc(meOf(G).name)}</b><span class="bk-clock" data-bk-clock></span><span class="bk-state" data-bk-state></span><span class="spacer"></span>
                <div class="segmented bk-speed" role="group" aria-label="Vitesse">${[[0, '⏸', 'Pause (Espace)'], [1, '×1', '1 heure de jeu en 6 secondes'], [2, '×2', 'Deux fois plus vite'], [4, '×4', 'Quatre fois plus vite']].map(([v, l, t]) => `<button type="button" data-bk="speed" data-v="${v}" title="${t}">${l}</button>`).join('')}</div>
                <button type="button" class="button small" data-bk="save" data-shortcut="⌘S">💾 Enregistrer</button><button type="button" class="button small secondary" data-bk="export" title="Garder la partie dans un fichier">⤓ Exporter</button><button type="button" class="button small secondary" data-bk="menu">↩ Parties</button><button type="button" class="icon-button" data-bk="close" aria-label="Fermer">×</button></header>
            <p class="bk-news" data-bk-news aria-live="polite"></p>
            <div class="bk-main"><section class="bk-world" data-bk-world></section><aside class="bk-side"><div class="segmented bk-tabs" role="tablist">${[['gens', '👥 Habitants'], ['res', '📦 Réserves'], ['atelier', '🛠️ Atelier'], ['ville', '🗺️ Ville'], ['radio', '📻 Radio']].map(([k, l]) => `<button type="button" role="tab" data-bk="tab" data-v="${k}">${l}</button>`).join('')}</div><div class="bk-sbody" data-bk-side></div></aside></div></div>`;
        drawAll(); go();
    }
    function go() { stop(); lastTick = performance.now(); acc = 0; timer = setInterval(tick, 200); }
    function stop() { if (timer) clearInterval(timer); timer = 0; }
    /** ×1 : 10 minutes de jeu par seconde */
    function tick() {
        if (!G || !dlg?.open) return stop();
        const now = performance.now(), dt = Math.min(1, (now - lastTick) / 1000); lastTick = now;
        if (G.over || !G.speed) return;
        acc += dt * 10 * G.speed; let n = 0;
        while (acc >= 10 && n < 40) { B().step(G); acc -= 10; n++; }
        if (!n) return;
        if (Math.floor(G.t / 360) !== lastSaveHour) { lastSaveHour = Math.floor(G.t / 360); saveGame(gid, G, true); } // toutes les 6 h de jeu
        drawAll(true);
    }
    function setSpeed(v) { if (!G) return; G.speed = v; drawTop(); }
    const busy = () => { const a = document.activeElement; return !!(a && dlg?.contains(a) && a.closest('[data-bk-side]') && a.matches('select, input, textarea')) || !!document.querySelector('.ui-menu, .lc-menu-pop'); };
    function drawAll(fromTick = false) { drawTop(); drawWorld(); if (!fromTick || !busy()) drawSide(); }

    function drawTop() {
        const c = dlg.querySelector('[data-bk-clock]'); if (!c) return;
        const night = B().isNight(G.t);
        c.textContent = `Jour ${B().dayOf(G.t)} · ${B().clock(G.t)}`;
        dlg.querySelector('[data-bk-state]').innerHTML = `<span title="${night ? 'Nuit' : 'Jour'}">${G.weather.rain ? '🌧️' : night ? '🌙' : '☀️'}</span> <span class="${G.power ? 'is-on' : 'is-off'}" title="${G.power ? 'Électricité' : 'Pas d’électricité'}">${G.power ? '⚡' : '🔌'}</span>`;
        dlg.querySelectorAll('[data-bk="speed"]').forEach(b => { const on = Number(b.dataset.v) === G.speed; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); });
        dlg.querySelectorAll('[data-bk="tab"]').forEach(b => { const on = b.dataset.v === tab; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on); });
        const last = G.log[0]; dlg.querySelector('[data-bk-news]').innerHTML = last ? `<span class="bk-t">${B().clock(last.t)}</span> ${esc(last.txt)}` : '';
    }

    /* ── le dessin du bunker ── */
    /** la couleur du ciel selon l'heure (le design du site : gris, bleu, noir) */
    function sky(t) {
        const h = (t / 60) % 24;
        if (h < 5 || h >= 22) return ['#14182b', '#2a3150'];
        if (h < 7) return ['#5b6b9a', '#f2b38a'];
        if (h < 18) return ['#7fb2ff', '#dbe9ff'];
        if (h < 21) return ['#f2a46a', '#6b74a8'];
        return ['#2a3150', '#4b5480'];
    }
    function pawn(p) {
        const ini = p.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
        const act = p.where === 'dehors' ? 'en ville' : ({boire: 'boit', manger: 'mange', toilettes: 'aux toilettes', coin: 'se soulage dans un coin', douche: 'se douche', gant: 'fait sa toilette', dormir: 'dort'}[p.act?.k] || (p.doing === 'creuser' ? 'creuse' : p.doing === 'construire' ? 'construit' : 'attend'));
        const mark = {dormir: '💤', boire: '💧', manger: '🍞', douche: '🚿', gant: '🧼', toilettes: '🚽', coin: '🚽'}[p.act?.k] || (p.doing === 'creuser' ? '⛏️' : p.doing === 'construire' ? '🔨' : '');
        return `<span class="bk-pawn g-${p.gender === 'female' ? 'f' : p.gender === 'male' ? 'm' : 'u'}${p.hp < 35 ? ' is-weak' : ''}" title="${esc(p.name)} : ${act}">${esc(ini)}${mark ? `<i>${mark}</i>` : ''}</span>`;
    }
    function drawWorld() {
        const w = dlg.querySelector('[data-bk-world]'); if (!w) return;
        const [s1, s2] = sky(G.t), h = (G.t / 60) % 24, sunX = ((h - 6) / 14) * 100, night = B().isNight(G.t);
        const base = B().alive(G).filter(p => p.where === 'base'), out = B().alive(G).filter(p => p.where === 'dehors');
        const at = new Map(); base.forEach(p => { const k = p.act?.at ? p.act.at.join() : p.doing === 'construire' ? atelierAt() : p.doing === 'creuser' ? 'dig' : 'hall'; if (!at.has(k)) at.set(k, []); at.get(k).push(p); });
        const building = new Map(G.builds.map((b, i) => [`${b.fi},${b.si}`, {b, i}]));
        w.innerHTML = `<div class="bk-sky${G.weather.rain ? ' is-rain' : ''}${night ? ' is-night' : ''}" style="--s1:${s1};--s2:${s2}">
                ${h >= 6 && h < 20 ? `<span class="bk-sun" style="left:${Math.max(4, Math.min(92, sunX))}%"></span>` : `<span class="bk-moon"></span>`}
                <span class="bk-skyline" aria-hidden="true"></span><span class="bk-out">${out.map(p => pawn(p)).join('')}${out.length ? `<small>${plural(out.length, 'parti', 'partis')} en ville</small>` : ''}</span>
                <span class="bk-ground"><span class="bk-trap" title="La trappe">▦</span></span></div>
            <div class="bk-floors">${G.floors.map((f, fi) => `<div class="bk-floor"><span class="bk-flabel">−${fi + 1}</span><div class="bk-slots">${f.slots.map((k, si) => {
                const it = k && B().ITEMS[k], bd = building.get(`${fi},${si}`), who = at.get(`${fi},${si}`) || [];
                if (it) return `<button type="button" class="bk-slot is-item${!G.power && ['radio', 'atelier', 'douche', 'potager'].includes(k) ? ' is-dark' : ''}" data-bk="slot" data-f="${fi}" data-s="${si}" title="${esc(it.name)} — ${esc(it.desc)}"><span class="bk-ico">${it.ico}</span><span class="bk-name">${esc(it.name)}</span><span class="bk-who">${who.map(pawn).join('')}</span></button>`;
                if (bd) return `<button type="button" class="bk-slot is-building" data-bk="slot" data-f="${fi}" data-s="${si}" title="En construction : ${esc(B().ITEMS[bd.b.k].name)}"><span class="bk-ico">${B().ITEMS[bd.b.k].ico}</span><span class="bk-name">${esc(B().ITEMS[bd.b.k].name)}</span><span class="bk-bar"><i style="width:${Math.round(100 * (1 - bd.b.left / B().ITEMS[bd.b.k].h))}%"></i></span></button>`;
                return `<button type="button" class="bk-slot is-empty" data-bk="slot" data-f="${fi}" data-s="${si}" title="Place libre : construire ici">＋</button>`;
            }).join('')}</div>${fi === 0 ? `<div class="bk-hall" title="Ceux qui attendent">${(at.get('hall') || []).map(pawn).join('')}</div>` : ''}</div>`).join('')}
            ${G.floors.length < B().MAX_FLOORS ? `<button type="button" class="bk-dig" data-bk="digpanel" title="Mettre des habitants à creuser (onglet Habitants)"><span>⛏️ ${G.dig.done > 0 ? 'Étage en cours de creusement' : 'Creuser un étage'}</span><span class="bk-bar"><i style="width:${Math.round(100 * G.dig.done / B().DIG_HOURS)}%"></i></span><span class="bk-who">${(at.get('dig') || []).map(pawn).join('')}</span></button>` : '<p class="muted bk-deep">Le bunker ne peut pas descendre plus bas.</p>'}</div>
            ${G.over ? `<div class="bk-over"><b>☠️ Plus personne en vie</b><p>Le bunker a tenu ${plural(B().dayOf(G.t) - 1, 'jour')}.</p><button type="button" class="button" data-bk="menu">↩ Revenir aux parties</button></div>` : ''}`;
    }
    const atelierAt = () => { const x = B().items(G).find(i => i.k === 'atelier'); return x ? `${x.fi},${x.si}` : 'hall'; };

    /* ── le panneau de droite ── */
    const bar = (v, cls = '') => `<span class="bk-bar ${cls}${v < 25 ? ' is-low' : ''}"><i style="width:${Math.round(v)}%"></i></span>`;
    const resName = r => B().RES.find(x => x[0] === r);
    const costTxt = cost => Object.entries(cost || {}).map(([r, n]) => `<span class="${(G.res[r] || 0) < n ? 'is-miss' : ''}">${resName(r)[1]} ${n}</span>`).join(' ');
    function drawSide() {
        const s = dlg.querySelector('[data-bk-side]'); if (!s) return;
        const keep = s.scrollTop;
        s.innerHTML = tab === 'gens' ? sideGens() : tab === 'res' ? sideRes() : tab === 'atelier' ? sideAtelier() : tab === 'ville' ? sideVille() : sideRadio();
        s.scrollTop = keep;
    }
    function sideGens() {
        return G.people.map(p => {
            const out = p.where === 'dehors', pl = out && G.city.places.find(x => x.id === p.exp?.place);
            const status = p.hp <= 0 ? '☠️ mort·e' : out ? `🚶 ${p.exp.phase === 'aller' ? 'en route vers' : p.exp.phase === 'fouille' ? 'fouille' : 'rentre de'} ${esc(pl?.name || '')}` : esc(pawn(p).match(/title="[^:]*: ([^"]*)"/)?.[1] || '');
            return `<div class="bk-person${p.hp <= 0 ? ' is-dead' : ''}"><div class="bk-p-head">${pawn(p)}<div><b>${esc(p.name)}${p.me ? ' <small>(toi)</small>' : ''}</b><small>${status}</small></div></div>
                <div class="bk-needs"><span>❤️ Vie</span>${bar(p.hp, 'is-hp')}${B().NEEDS.map(([k, ico, l]) => `<span>${ico} ${l}</span>${bar(p.needs[k])}`).join('')}</div>
                ${p.hp > 0 && !out ? `<div class="bk-p-actions"><label>Travail <select data-bk-job="${esc(p.id)}">${[['libre', 'Rien de spécial'], ['creuser', '⛏️ Creuser'], ['construire', '🔨 Construire']].map(([v, l]) => `<option value="${v}" ${p.job === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><button type="button" class="button small secondary" data-bk="sendfrom" data-id="${esc(p.id)}">🚶 Envoyer en ville</button></div>` : ''}</div>`;
        }).join('');
    }
    function sideRes() {
        return `<h4>Réserves</h4><div class="bk-res">${B().RES.map(([r, ico, l, u]) => { const c = B().cap(G, r); return `<span>${ico} ${l}</span><b>${Math.floor(G.res[r])}${u ? ' ' + u : ''} <small>/ ${c}</small></b>${bar(100 * G.res[r] / c)}`; }).join('')}</div>
            <p class="muted">Plus de place : étagères, stockage, garde-manger, citerne.</p>
            <h4>Électricité</h4><p>${G.power ? '⚡ Le groupe électrogène tourne' : G.powerOn ? '🔌 Plus d’essence : pas d’électricité' : '🔌 Groupe électrogène éteint'} — ${B().has(G, 'econome') ? '⅛' : '¼'} L d’essence par heure.</p>
            <button type="button" class="button small secondary" data-bk="power">${G.powerOn ? 'Éteindre pour économiser l’essence' : 'Rallumer le groupe électrogène'}</button>
            <h4>Outils</h4><div class="bk-chips">${Object.entries(B().TOOLS).map(([k, [ico, l, d]]) => `<span class="bk-chip${G.tools.includes(k) ? '' : ' is-off'}" title="${esc(d)}">${ico} ${esc(l)}${G.tools.includes(k) ? '' : ' (à trouver)'}</span>`).join('')}</div>`;
    }
    function sideAtelier() {
        const IT = B().ITEMS;
        return `<h4>En construction</h4>${G.builds.length ? `<ol class="bk-builds">${G.builds.map((b, i) => `<li>${IT[b.k].ico} ${esc(IT[b.k].name)} <small>étage −${b.fi + 1} · encore ${Math.max(0, Math.ceil(b.left * 10) / 10)} h</small><button type="button" class="icon-button small" data-bk="unbuild" data-i="${i}" title="Annuler (les matériaux reviennent)" aria-label="Annuler">×</button></li>`).join('')}</ol>
            ${!G.power ? '<p class="ui-notice is-error">Pas d’électricité : l’atelier est à l’arrêt.</p>' : ''}${!G.people.some(p => p.hp > 0 && p.where === 'base' && p.job === 'construire') ? '<p class="ui-notice">Personne n’est à l’atelier : mets quelqu’un sur « 🔨 Construire » (onglet Habitants).</p>' : ''}` : A().emptyState({icon: '🛠️', text: 'Rien en construction.', hint: 'Clique sur une place libre du bunker (＋), ou sur « Construire » ci-dessous.'})}
            <h4>Plans</h4><div class="bk-plans">${Object.keys(IT).filter(k => !IT[k].fixed).map(k => { const it = IT[k], known = G.plans.includes(k);
                return `<div class="bk-plan${known ? '' : ' is-off'}"><span class="bk-ico">${known ? it.ico : '❔'}</span><div><b>${known ? esc(it.name) : 'Plan à trouver en ville'}</b><small>${known ? `${esc(it.desc)} · ${it.h} h${it.tool ? ` · il faut ${B().TOOLS[it.tool][0]} ${B().TOOLS[it.tool][1]}` : ''}` : 'Fouille les maisons et la bibliothèque.'}</small>${known ? `<span class="bk-cost">${costTxt(it.cost)}</span>` : ''}</div>${known ? `<button type="button" class="button small secondary" data-bk="build" data-k="${k}">Construire</button>` : ''}</div>`; }).join('')}</div>`;
    }
    let locating = null;
    function sideVille() {
        // une partie d'avant le plan en fond : on cherche la ville une fois, puis on redessine
        if (G.city.lat == null && G.city.geo !== 'none' && !locating) { const g = G; locating = locateCity(g.city).then(() => { locating = null; if (G === g && tab === 'ville') drawSide(); }); }
        const c = G.city, n = c.n, free = B().alive(G).filter(p => p.where === 'base');
        const cell = (x, y) => { const pl = c.places.find(q => q.x === x && q.y === y); if (x === c.base[0] && y === c.base[1]) return `<span class="bk-cell is-base" title="Le bunker">☢</span>`;
            if (!pl) return '<span class="bk-cell"></span>'; const k = B().PLACE_KINDS[pl.kind], there = G.people.some(p => p.hp > 0 && p.exp?.place === pl.id);
            return `<button type="button" class="bk-cell is-place${placeSel === pl.id ? ' is-sel' : ''}${there ? ' is-busy' : ''}" data-bk="place" data-id="${pl.id}" title="${esc(pl.name)}">${k[0]}</button>`; };
        const pl = c.places.find(x => x.id === placeSel);
        const stockTxt = p => { const tot = Object.values(p.stock).reduce((a, b) => a + b, 0), max = Object.values(p.max).reduce((a, b) => a + b, 0) || 1; return !p.visits ? 'pas encore fouillé' : tot / max > .6 ? 'beaucoup de choses' : tot / max > .25 ? 'un peu' : tot ? 'presque vide' : 'vide (ça revient chaque jour)'; };
        return `<p class="muted">${esc(c.name)} · ville ${B().SIZES[c.size][2].toLowerCase()} · 30 min par case (×1,5 la nuit sans lampe torche).</p>
            <div class="bk-map${c.lat != null ? ' has-bg' : ''}" style="--n:${n}">${mapBgHtml(c)}${Array.from({length: n * n}, (_, i) => cell(i % n, Math.floor(i / n))).join('')}</div>${c.geo === 'none' ? '<p class="lck-legend muted">Pas de plan en fond : cette ville n’a pas de coordonnées (ni dans ton arbre, ni dans les communes).</p>' : ''}
            ${pl ? `<div class="bk-placecard"><b>${B().PLACE_KINDS[pl.kind][0]} ${esc(pl.name)}</b><small>${Math.round(B().travel(G, pl) / 6) / 10} h de marche (aller) · ${stockTxt(pl)}${pl.visits ? ` · fouillé ${plural(pl.visits, 'fois', 'fois')}` : ''}</small>
                <p class="muted">On y trouve : ${Object.keys(pl.max).map(r => resName(r)[1] + ' ' + resName(r)[2].toLowerCase()).join(', ')}${B().PLACE_KINDS[pl.kind][4] ? ', et souvent des plans' : ''}.</p>
                ${free.length ? `<div class="bk-send"><select data-bk-sendwho>${free.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select><button type="button" class="button small" data-bk="send">🚶 Envoyer</button></div>` : '<p class="muted">Personne de libre au bunker.</p>'}</div>` : '<p class="muted">Clique sur un lieu de la carte pour y envoyer quelqu’un.</p>'}`;
    }
    function sideRadio() {
        const out = G.people.filter(p => p.hp > 0 && p.where === 'dehors');
        return `${G.power ? '' : '<p class="ui-notice is-error">📻 Pas d’électricité : la radio est muette. Les messages arriveront quand le courant reviendra.</p>'}
            <h4>Dehors</h4>${out.length ? out.map(p => { const pl = G.city.places.find(x => x.id === p.exp.place); return `<div class="bk-radio-row">${pawn(p)}<div><b>${esc(p.name)}</b><small>${p.exp.phase === 'aller' ? 'en route vers' : p.exp.phase === 'fouille' ? 'fouille' : 'rentre de'} ${esc(pl?.name || '')} · ${p.exp.phase === 'retour' ? 'arrive' : 'jusqu’à'} ${B().clock(p.exp.until)}</small></div>${p.exp.phase !== 'retour' ? `<button type="button" class="button small secondary" data-bk="recall" data-id="${esc(p.id)}" ${G.power ? '' : 'disabled'}>📻 Rentre !</button>` : ''}</div>`; }).join('') : '<p class="muted">Tout le monde est au bunker.</p>'}
            <h4>Journal</h4><ol class="bk-log">${G.log.slice(0, 120).map(l => `<li class="is-${l.kind}"><span class="bk-t">J${B().dayOf(l.t)} ${B().clock(l.t)}</span> ${esc(l.txt)}</li>`).join('')}</ol>`;
    }

    /* ═════════ Les clics ═════════ */
    function onClick(e) {
        const b = e.target.closest('[data-bk]'); if (!b || !dlg.contains(b)) return;
        const k = b.dataset.bk;
        if (k === 'close') { dlg.close(); return; }
        if (k === 'resume') { const x = store().games[b.dataset.id]; if (!x) return; try { G = B().check(x.g); } catch (err) { toast(err.message, 'error'); return; } gid = b.dataset.id; tab = 'gens'; placeSel = null; play(); return; }
        if (k === 'delsave') { const id = b.dataset.id, name = store().games[id]?.name || ''; const del = () => { const s = store(); delete s.games[id]; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
            if (A()?.undoLocalChange) A().undoLocalChange(`Partie « Le bunker de ${name} » supprimée`, [KEY], del, () => { if (dlg && !G) startScreen(); }); else del(); startScreen(); return; }
        if (k === 'propose') { propose(b.closest('form')); return; }
        if (!G) return;
        if (k === 'speed') { setSpeed(Number(b.dataset.v) || 0); return; }
        if (k === 'save') { saveGame(gid, G); return; }
        if (k === 'export') { const blob = new Blob([JSON.stringify({lcnda: 'bunker', v: 1, g: G})], {type: 'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `bunker-${(meOf(G).name || 'partie').replace(/[^\w\-]+/g, '-').slice(0, 40)}-jour-${B().dayOf(G.t)}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000); return; }
        if (k === 'menu') { saveGame(gid, G, true); startScreen(); return; }
        if (k === 'tab') { tab = b.dataset.v; drawTop(); drawSide(); return; }
        if (k === 'power') { G.powerOn = !G.powerOn; if (!G.powerOn) G.power = false; drawAll(); return; }
        if (k === 'digpanel') { tab = 'gens'; drawTop(); drawSide(); toast('Choisis « ⛏️ Creuser » comme travail pour un ou plusieurs habitants.'); return; }
        if (k === 'sendfrom') { tab = 'ville'; drawTop(); drawSide(); const sel = () => dlg.querySelector('[data-bk-sendwho]'); if (sel()) sel().value = b.dataset.id; else toast('Choisis un lieu sur la carte.'); sendFor = b.dataset.id; return; }
        if (k === 'place') { placeSel = b.dataset.id; drawSide(); const sel = dlg.querySelector('[data-bk-sendwho]'); if (sel && sendFor && [...sel.options].some(o => o.value === sendFor)) sel.value = sendFor; return; }
        if (k === 'send') { const who = dlg.querySelector('[data-bk-sendwho]')?.value; const r = B().send(G, who, placeSel); if (!r.ok) { toast(r.err, 'error'); return; } sendFor = ''; drawAll(); return; }
        if (k === 'recall') { if (!B().recall(G, b.dataset.id)) toast('La radio ne passe pas (pas d’électricité ?).', 'error'); drawAll(); return; }
        if (k === 'unbuild') { B().cancelBuild(G, Number(b.dataset.i)); drawAll(); return; }
        if (k === 'build') { const spot = firstFree(); if (!spot) { toast('Plus de place libre : creuse un étage (⛏️).', 'error'); return; } order(b.dataset.k, ...spot); return; }
        if (k === 'slot') { slotMenu(b, Number(b.dataset.f), Number(b.dataset.s)); }
    }
    let sendFor = '';
    function onChange(e) {
        const j = e.target.closest('[data-bk-job]'); if (j && G) { B().setJob(G, j.dataset.bkJob, j.value); drawAll(); return; }
        const f = e.target.closest('[data-bk-import]'); if (f) importFile(f);
    }
    const firstFree = () => { for (let fi = 0; fi < G.floors.length; fi++) for (let si = 0; si < B().SLOTS; si++) if (!G.floors[fi].slots[si] && !G.builds.some(b => b.fi === fi && b.si === si)) return [fi, si]; return null; };
    function order(k, fi, si) { const r = B().orderBuild(G, k, fi, si); if (!r.ok) { toast(r.err, 'error'); return; } drawAll(); }
    function slotMenu(btn, fi, si) {
        const IT = B().ITEMS, k = G.floors[fi]?.slots[si], bi = G.builds.findIndex(b => b.fi === fi && b.si === si), menu = UI().menuAt;
        let items;
        if (k) {
            const it = IT[k];
            if (k === 'radio') { tab = 'radio'; drawTop(); drawSide(); return; }
            if (k === 'atelier') { tab = 'atelier'; drawTop(); drawSide(); return; }
            if (k === 'generateur') { tab = 'res'; drawTop(); drawSide(); return; }
            items = [{icon: it.ico, label: it.name, help: it.desc, disabled: true}, '-', {icon: '🔧', label: 'Démonter', help: 'on récupère la moitié des matériaux', run: () => { B().dismantle(G, fi, si); drawAll(); }}];
        } else if (bi >= 0) items = [{icon: '×', label: `Annuler « ${IT[G.builds[bi].k].name} »`, help: 'les matériaux reviennent', run: () => { B().cancelBuild(G, bi); drawAll(); }}];
        else items = G.plans.map(p => { const it = IT[p], miss = Object.entries(it.cost || {}).some(([r, n]) => (G.res[r] || 0) < n) || (it.tool && !G.tools.includes(it.tool));
            return {icon: it.ico, label: it.name, help: Object.entries(it.cost || {}).map(([r, n]) => `${n} ${resName(r)[2].toLowerCase()}`).join(', ') + (it.tool ? ` · ${B().TOOLS[it.tool][1]}` : ''), disabled: miss, run: () => order(p, fi, si)}; });
        if (menu) menu(btn, items, {title: k ? '' : 'Construire ici'}); else if (!k && bi < 0) order(G.plans[0], fi, si);
    }
    function importFile(input) {
        const file = input.files?.[0]; input.value = ''; if (!file) return;
        if (file.size > 2e6) { toast('Ce fichier est trop gros pour être une partie du bunker.', 'error'); return; }
        file.text().then(txt => {
            let raw; try { raw = JSON.parse(txt); } catch (_) { throw new Error('Ce fichier n’est pas une partie du bunker.'); }
            G = B().check(raw?.lcnda === 'bunker' ? raw.g : raw); gid = 'b' + Date.now().toString(36); saveGame(gid, G, true); tab = 'gens'; play(); toast('✓ Partie ouverte.');
        }).catch(err => toast(err.message || 'Fichier illisible.', 'error'));
    }
    document.addEventListener('keydown', e => { if (dlg?.open && G && (e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveGame(gid, G); } });
})();
