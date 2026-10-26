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
                <div class="bk-field"><span class="pk-lab">🧳 Le coffre de famille <small class="muted">(3 objets de ta base au plus : chacun donne un petit avantage)</small></span><div class="bk-coffre" data-bk-coffre><p class="muted">Lecture des objets de famille…</p></div></div>
                <div class="bk-field"><span class="pk-lab">Taille de la ville</span><div class="segmented bk-size" role="radiogroup">${Object.entries(B().SIZES).map(([k, [n, nb, l]]) => `<label><input type="radio" name="bk_size" value="${k}" ${k === 'moyenne' ? 'checked' : ''}><span>${l} <small>${nb} lieux</small></span></label>`).join('')}</div></div>
                <details class="bk-field bk-setup" open><summary class="pk-lab">⚙️ Réglages de la partie</summary>
                    <div class="bk-field"><span class="pk-lab">Difficulté</span><div class="segmented bk-size" role="radiogroup">${Object.entries(B().DIFFS).map(([k, d]) => `<label><input type="radio" name="bk_diff" value="${k}" ${k === 'normal' ? 'checked' : ''}><span>${esc(d.l)}</span></label>`).join('')}</div></div>
                    <div class="bk-field"><span class="pk-lab">Scénario</span><select name="bk_scen">${Object.entries(B().SCENARIOS).map(([k, [ico, l, d]]) => `<option value="${k}" title="${esc(d)}">${ico} ${esc(l)} — ${esc(d)}</option>`).join('')}</select></div>
                    <label class="checkbox-line"><input type="checkbox" name="bk_meteo" checked> 🌪️ Météo et catastrophes <small class="muted">(canicule, tempête, inondation, séisme, orage, vague de froid : des installations à réparer)</small></label>
                    <label class="checkbox-line"><input type="checkbox" name="bk_chaines"> 🧵 Chaînes de fabrication <small class="muted">(plantes → fil → tissu → vêtements chauds ; blé → farine → pain)</small></label>
                    <label class="checkbox-line"><input type="checkbox" name="bk_tuto" ${Object.keys(s.games).length ? '' : 'checked'}> 📘 Tutoriel guidé <small class="muted">(les premiers pas, étape par étape)</small></label>
                    <small class="muted">Tout se change aussi pendant la partie : onglet ⚙️ Réglages (sauf le scénario).</small></details>
                <div class="bk-actions"><label class="button secondary bk-import">⤒ Ouvrir une partie (fichier)<input type="file" accept=".json,application/json" data-bk-import hidden></label><span class="spacer"></span><button type="submit" class="button">☢ Descendre dans le bunker</button></div>
            </form></div>`;
        dlg.querySelector('[data-bk-new]').addEventListener('submit', e => { e.preventDefault(); begin(e.target); });
        fillCoffre();
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
    /** le coffre : les objets de famille de la base, à cocher (3 au plus) */
    let objs = [];
    async function fillCoffre() {
        const box = dlg?.querySelector('[data-bk-coffre]'); if (!box) return;
        try { objs = ((await A().api('family_objects'))?.objects || []).slice(0, 60); } catch (_) { objs = []; }
        if (!dlg?.contains(box)) return;
        const hint = o => { const t = `${o.title || ''} ${o.kind || ''} ${o.description || ''}`.toLowerCase(); return B().HEIRLOOMS.find(([, re]) => re.test(t))[2]; };
        box.innerHTML = objs.length ? `<div class="bk-coffre-list">${objs.map((o, i) => `<label class="checkbox-line"><input type="checkbox" name="bk_obj" value="${i}"><span>${esc(o.title || 'Objet')}<small class="muted"> · ${esc(hint(o))}</small></span></label>`).join('')}</div>`
            : '<p class="muted">Aucun objet de famille dans ta base (Listes › Objets de famille) : le coffre partira vide.</p>';
        box.addEventListener('change', e => { if (!e.target.matches('[name="bk_obj"]')) return; const on = box.querySelectorAll('[name="bk_obj"]:checked'); if (on.length > 3) { e.target.checked = false; toast('Le coffre ne contient que 3 objets.'); } });
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
        const who = id => { const p = tr?.byId.get(id); return {pid: id, name: p ? nameOf(p) : `Fiche ${id}`, gender: p?.gender || '', occ: p?.occ || '', by: p?.by || 0}; };
        const city = (form.elements.bk_city_txt.value.trim() || form.elements.bk_city.value || '').slice(0, 80);
        if (!city) { UI().fail?.(form.elements.bk_city_txt, 'Choisis ou tape une ville.'); return; }
        const coffre = [...form.querySelectorAll('[name="bk_obj"]:checked')].slice(0, 3).map(i => objs[Number(i.value)]).filter(Boolean).map(o => ({title: o.title, kind: o.kind, description: o.description}));
        const more = await fromTree(tr, [meId, ...teamIds].filter(Boolean), city);
        const month = new Date().getMonth(), season0 = month >= 2 && month <= 4 ? 0 : month >= 5 && month <= 7 ? 1 : month >= 8 && month <= 10 ? 2 : 3;
        // les objets de famille qui ne sont pas dans le coffre : on peut les retrouver dans les ruines
        const chosen = new Set([...form.querySelectorAll('[name="bk_obj"]:checked')].map(i => Number(i.value)));
        const ruins = objs.filter((o, i) => !chosen.has(i)).sort(() => Math.random() - 0.5).slice(0, 12).map(o => ({title: o.title, kind: o.kind, description: o.description}));
        const setup = {diff: form.elements.bk_diff?.value || 'normal', scen: form.elements.bk_scen?.value || 'classique', opt: {meteo: !!form.elements.bk_meteo?.checked, chaines: !!form.elements.bk_chaines?.checked, tuto: !!form.elements.bk_tuto?.checked}};
        G = B().newGame({me: meId ? who(meId) : {name: form.elements.bk_me_txt?.value || 'Moi'}, team: teamIds.map(who), city: {name: city, size: form.elements.bk_size.value}, coffre, season0, ruins, ...setup, ...more});
        await locateCity(G.city);
        gid = 'b' + Date.now().toString(36); saveGame(gid, G, true); tab = 'gens'; placeSel = null; route = []; mapScroll = null; play();
    }

    /** ce que l'arbre et la base apportent à la partie : liens de famille, voyageurs, maisons natales, histoires, lettres, prénoms */
    async function fromTree(tr, ids, city) {
        const out = {kin: [], extras: [], homes: [], lore: [], letters: [], names: {f: [], m: []}};
        if (tr) {
            const anc = (id, n = 4, acc = new Set()) => { const p = tr.byId.get(id); if (!p || !n) return acc; [p.father, p.mother].forEach(x => { if (x && !acc.has(x)) { acc.add(x); anc(x, n - 1, acc); } }); return acc; };
            const spouses = (a, b) => (tr.families || []).some(f => (f.a === a && f.b === b) || (f.a === b && f.b === a));
            ids.forEach((a, i) => ids.slice(i + 1).forEach(b => {
                if (spouses(a, b)) { out.kin.push([a, b, 'conjoint']); return; }
                const A1 = anc(a), B1 = anc(b);
                if (A1.has(b) || B1.has(a) || [...A1].some(x => B1.has(x))) out.kin.push([a, b, 'sang']);
            }));
            const shuffled = tr.people.filter(p => !p.living && !ids.includes(p.id)).sort(() => Math.random() - 0.5);
            out.extras = shuffled.slice(0, 12).map(p => ({pid: p.id, name: nameOf(p), gender: p.gender || '', occ: p.occ || '', by: p.by || 0}));
            const here = p => p.bplace && tr.places[p.bplace] && fold(String(tr.places[p.bplace].name).split(',')[0]) === fold(city);
            out.homes = [...tr.people.filter(p => ids.includes(p.id) && here(p)), ...tr.people.filter(p => !ids.includes(p.id) && here(p))].slice(0, 2).map(p => ({name: nameOf(p), by: p.by || 0}));
            const firsts = g => [...new Set(tr.people.filter(p => p.gender === g).map(p => String(p.first || '').split(/[\s-]/)[0]).filter(x => x && x.length > 1))].slice(0, 60);
            out.names = {f: firsts('female'), m: firsts('male')};
        }
        try { out.lore = ((await A().api('family_memories'))?.memories || []).filter(m => m.title).sort(() => Math.random() - 0.5).slice(0, 30).map(m => ({kind: m.kind || '', title: m.title, text: String(m.content || '').replace(/\s+/g, ' ').slice(0, 200)})); } catch (_) {}
        // les lettres aux descendants : seulement le titre, de qui, pour qui (jamais le contenu)
        try { out.letters = ((await ext.tresors?.T?.items?.('letter')) || []).slice(0, 20).map(x => ({title: x.title, from: x.data?.from || '', to: x.data?.to || ''})); } catch (_) {}
        return out;
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
                <button type="button" class="button small secondary" data-bk="gazette" title="Le journal de la partie">📰 Gazette</button><button type="button" class="button small" data-bk="save" data-shortcut="⌘S">💾 Enregistrer</button><button type="button" class="button small secondary" data-bk="export" title="Garder la partie dans un fichier">⤓ Exporter</button><button type="button" class="button small secondary" data-bk="menu">↩ Parties</button><button type="button" class="icon-button" data-bk="close" aria-label="Fermer">×</button></header>
            <p class="bk-news" data-bk-news aria-live="polite"></p><div class="bk-tuto" data-bk-tuto hidden></div><div class="bk-visit" data-bk-visit hidden></div>
            <div class="bk-main"><section class="bk-world" data-bk-world></section><aside class="bk-side"><div class="segmented bk-tabs" role="tablist">${[['gens', '👥 Habitants'], ['res', '📦 Réserves'], ['atelier', '🛠️ Atelier'], ['bric', '♻️ Bric-à-brac'], ['ville', '🗺️ Ville'], ['famille', '🌳 Famille'], ['radio', '📻 Radio'], ['regl', '⚙️ Réglages']].map(([k, l]) => `<button type="button" role="tab" data-bk="tab" data-v="${k}">${l}</button>`).join('')}</div><div class="bk-sbody" data-bk-side></div></aside></div><div class="bk-gz" data-bk-gz hidden></div></div>`;
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
        const S = B().SEASONS.find(x => x[0] === B().seasonOf(G)), src = {essence: 'groupe électrogène', soleil: 'panneau solaire', vent: 'éolienne', pedales: 'dynamo à pédales'}[G.powerSrc];
        dlg.querySelector('[data-bk-state]').innerHTML = `<span title="${S[2]}${G.cold ? ' : il fait froid dans le bunker' : ''}">${S[1]}${G.cold ? '🥶' : ''}</span> <span title="${night ? 'Nuit' : 'Jour'}">${G.weather.rain ? '🌧️' : night ? '🌙' : '☀️'}</span>${G.event ? ` <span class="bk-event" title="${esc(B().EVENTS[G.event.k][1])} : ${esc(B().EVENTS[G.event.k][2])}">${B().EVENTS[G.event.k][0]}</span>` : ''}${Object.keys(G.broken || {}).length ? ` <span title="${Object.keys(G.broken).length} installation(s) en panne">🔧${Object.keys(G.broken).length}</span>` : ''} <span class="${G.power ? 'is-on' : 'is-off'}" title="${G.power ? `Électricité (${src})` : 'Pas d’électricité'}">${G.power ? ({soleil: '☀️⚡', vent: '🌬️⚡', pedales: '🚲⚡'}[G.powerSrc] || '⚡') : '🔌'}</span>${G.air < 30 ? ' <span title="L’air est lourd">🌀</span>' : ''}`;
        drawVisit();
        dlg.querySelectorAll('[data-bk="speed"]').forEach(b => { const on = Number(b.dataset.v) === G.speed; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); });
        dlg.querySelectorAll('[data-bk="tab"]').forEach(b => { const on = b.dataset.v === tab; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on); });
        const tu = dlg.querySelector('[data-bk-tuto]'), T = B().TUTO;
        if (tu) { const on = G.tuto >= 0 && G.tuto < T.length && !G.over; tu.hidden = !on; const sig = on ? String(G.tuto) : ''; if (tu.dataset.sig !== sig) { tu.dataset.sig = sig; tu.innerHTML = on ? `<span><b>📘 Tutoriel ${G.tuto + 1} / ${T.length}</b> ${esc(T[G.tuto][0])}</span><button type="button" class="button small secondary" data-bk="tutoskip">Passer le tutoriel</button>` : ''; } }
        const last = G.log[0]; dlg.querySelector('[data-bk-news]').innerHTML = last ? `<span class="bk-t">${B().clock(last.t)}</span> ${esc(last.txt)}` : '';
    }

    /** quelqu'un à la trappe : la question et les réponses */
    function drawVisit() {
        const box = dlg.querySelector('[data-bk-visit]'); if (!box) return;
        const v = G.visit; box.hidden = !v || G.over; if (!v || G.over) { box.innerHTML = ''; box.dataset.sig = ''; return; }
        const r = k => B().RES.find(x => x[0] === k), left = Math.max(0, Math.round((v.until - G.t) / 6) / 10);
        const sig = `${v.k}:${v.until}`; if (box.dataset.sig === sig) { const t = box.querySelector('[data-bk-left]'); if (t) t.textContent = `${left} h`; return; }
        box.dataset.sig = sig;
        const btn = (val, label, cls = '') => `<button type="button" class="button small ${cls}" data-bk="visit" data-v="${val}">${label}</button>`;
        box.innerHTML = v.k === 'marchand' ? `<span>🔔 <b>Un marchand</b> propose ${r(v.give.r)[1]} ${v.give.n} ${esc(r(v.give.r)[2].toLowerCase())} contre ${r(v.want.r)[1]} ${v.want.n} ${esc(r(v.want.r)[2].toLowerCase())}.</span>${btn('oui', '🤝 Échanger')}${btn('non', 'Non merci', 'secondary')}`
            : v.k === 'voyageur' ? `<span>🔔 <b>${esc(v.person.name)}</b>${v.person.occ ? ` (${esc(v.person.occ.toLowerCase())}${v.person.by ? `, né·e en ${v.person.by}` : ''})` : ''} demande à entrer : une bouche de plus, mais aussi des bras.</span>${btn('oui', '🤗 Faire entrer')}${btn('non', 'Laisser dehors', 'secondary')}`
            : `<span>🔔 <b>Des pillards</b> veulent ${Object.entries(v.demand).map(([k, n]) => `${r(k)[1]} ${n}`).join(' ') || 'tout'}. Défense du bunker : ${Math.round(B().defense(G))}.</span>${btn('donner', '🫳 Donner', 'secondary')}${btn('resister', '🛡️ Résister')}`;
        box.className = `bk-visit is-${v.k}`; box.insertAdjacentHTML('beforeend', `<small class="muted">sans réponse dans <b data-bk-left>${left} h</b>, ${v.k === 'pillards' ? 'ils attaquent' : 'on repart'}</small>`);
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
        const act = p.where === 'dehors' ? 'en ville' : ({boire: 'boit', boiresale: 'boit de l’eau de pluie', manger: 'mange', toilettes: 'aux toilettes', coin: 'se soulage dans un coin', douche: 'se douche', gant: 'fait sa toilette', dormir: 'dort', jouer: p.act?.music ? 'écoute de la musique' : 'joue', aerer: 'nettoie l’aération'}[p.act?.k] || ({creuser: 'creuse', construire: 'construit', pedaler: 'pédale', garde: 'monte la garde'}[p.doing] || (p.baby ? 'gazouille' : 'attend')));
        const mark = {dormir: '💤', boire: '💧', boiresale: '🪣', manger: '🍞', douche: '🚿', gant: '🧼', toilettes: '🚽', coin: '🚽', jouer: p.act?.music ? '🎶' : '🎲', aerer: '🌀'}[p.act?.k] || ({creuser: '⛏️', construire: '🔨', pedaler: '🚲', garde: '🛡️'}[p.doing] || (p.ill ? (p.ill.k === 'fievre' ? '🤒' : '🩹') : ''));
        return `<span class="bk-pawn g-${p.gender === 'female' ? 'f' : p.gender === 'male' ? 'm' : 'u'}${p.hp < 35 ? ' is-weak' : ''}${p.baby ? ' is-baby' : ''}" title="${esc(p.name)} : ${act}${p.ill ? (p.ill.k === 'fievre' ? ' · a de la fièvre' : ' · blessé·e') : ''}">${esc(ini)}${mark ? `<i>${mark}</i>` : ''}</span>`;
    }
    function drawWorld() {
        const w = dlg.querySelector('[data-bk-world]'); if (!w) return;
        const [s1, s2] = sky(G.t), h = (G.t / 60) % 24, sunX = ((h - 6) / 14) * 100, night = B().isNight(G.t);
        const base = B().alive(G).filter(p => p.where === 'base'), out = B().alive(G).filter(p => p.where === 'dehors');
        const at = new Map(); base.forEach(p => { const k = p.act?.at ? p.act.at.join() : p.doing === 'construire' ? atelierAt() : p.doing === 'creuser' ? 'dig' : 'hall'; if (!at.has(k)) at.set(k, []); at.get(k).push(p); });
        const building = new Map(G.builds.map((b, i) => [`${b.fi},${b.si}`, {b, i}]));
        w.innerHTML = `<div class="bk-sky${G.weather.rain ? ' is-rain' : ''}${night ? ' is-night' : ''}${B().seasonOf(G) === 'hiver' ? ' is-winter' : ''}" style="--s1:${s1};--s2:${s2}">
                ${h >= 6 && h < 20 ? `<span class="bk-sun" style="left:${Math.max(4, Math.min(92, sunX))}%"></span>` : `<span class="bk-moon"></span>`}
                <span class="bk-skyline" aria-hidden="true"></span><span class="bk-out">${out.map(p => pawn(p)).join('')}${out.length ? `<small>${plural(out.length, 'parti', 'partis')} en ville</small>` : ''}</span>
                <span class="bk-ground"><span class="bk-trap${G.visit ? ' is-knock' : ''}" title="${G.visit ? 'Quelqu’un frappe à la trappe !' : 'La trappe'}">${G.visit ? '🔔' : '▦'}</span></span></div>
            <div class="bk-floors">${G.floors.map((f, fi) => `<div class="bk-floor"><span class="bk-flabel">−${fi + 1}</span><div class="bk-slots">${f.slots.map((k, si) => {
                const it = k && B().ITEMS[k], bd = building.get(`${fi},${si}`), who = at.get(`${fi},${si}`) || [];
                const key = `${fi},${si}`, brk = !!G.broken?.[key], L = G.lvl?.[key] || 1, wk = bd && (bd.b.rep || bd.b.up);
                if (it) return `<button type="button" class="bk-slot is-item${!G.power && (['radio', 'atelier', 'douche', 'potager'].includes(k) || it.power) ? ' is-dark' : ''}${brk ? ' is-broken' : ''}" data-bk="slot" data-f="${fi}" data-s="${si}" title="${esc(it.name)}${L > 1 ? ` (niveau ${L})` : ''}${brk ? ' — EN PANNE : clique pour réparer' : ''} — ${esc(it.desc)}"><span class="bk-ico">${it.ico}</span><span class="bk-name">${esc(it.name)}</span>${L > 1 ? `<span class="bk-lvl">${'★'.repeat(L)}</span>` : ''}${brk ? '<span class="bk-brk" aria-label="En panne">🔧</span>' : ''}${wk ? `<span class="bk-bar"><i style="width:${Math.round(100 * (1 - bd.b.left / (bd.b.tot || 1)))}%"></i></span>` : ''}<span class="bk-who">${who.map(pawn).join('')}</span></button>`;
                if (bd) return `<button type="button" class="bk-slot is-building" data-bk="slot" data-f="${fi}" data-s="${si}" title="En construction : ${esc(B().ITEMS[bd.b.k].name)}"><span class="bk-ico">${B().ITEMS[bd.b.k].ico}</span><span class="bk-name">${esc(B().ITEMS[bd.b.k].name)}</span><span class="bk-bar"><i style="width:${Math.round(100 * (1 - bd.b.left / (bd.b.tot || B().ITEMS[bd.b.k].h)))}%"></i></span></button>`;
                return `<button type="button" class="bk-slot is-empty" data-bk="slot" data-f="${fi}" data-s="${si}" title="Place libre : construire ici">＋</button>`;
            }).join('')}</div>${fi === 0 ? `<div class="bk-hall" title="Ceux qui attendent">${(at.get('hall') || []).map(pawn).join('')}</div>` : ''}</div>`).join('')}
            ${G.floors.length < B().MAX_FLOORS ? `<button type="button" class="bk-dig" data-bk="digpanel" title="Mettre des habitants à creuser (onglet Habitants)"><span>⛏️ ${G.dig.done > 0 ? 'Étage en cours de creusement' : 'Creuser un étage'}</span><span class="bk-bar"><i style="width:${Math.round(100 * G.dig.done / B().DIG_HOURS)}%"></i></span><span class="bk-who">${(at.get('dig') || []).map(pawn).join('')}</span></button>` : '<p class="muted bk-deep">Le bunker ne peut pas descendre plus bas.</p>'}</div>
            ${G.over ? `<div class="bk-over"><b>☠️ Plus personne en vie</b><p>Le bunker a tenu ${plural(B().dayOf(G.t) - 1, 'jour')}.</p><button type="button" class="button" data-bk="gazette">📰 Lire la gazette</button><button type="button" class="button secondary" data-bk="menu">↩ Revenir aux parties</button></div>` : ''}`;
    }
    const atelierAt = () => { const x = B().items(G).find(i => i.k === 'atelier'); return x ? `${x.fi},${x.si}` : 'hall'; };

    /* ── le panneau de droite ── */
    const bar = (v, cls = '') => `<span class="bk-bar ${cls}${v < 25 ? ' is-low' : ''}"><i style="width:${Math.round(v)}%"></i></span>`;
    const resName = r => B().RES.find(x => x[0] === r);
    const costTxt = cost => Object.entries(cost || {}).map(([r, n]) => `<span class="${(G.res[r] || 0) < n ? 'is-miss' : ''}">${resName(r)[1]} ${n}</span>`).join(' ');
    function drawSide() {
        const s = dlg.querySelector('[data-bk-side]'); if (!s) return;
        const keep = s.scrollTop, mw = s.querySelector('.bk-mapwrap.is-big'), mk = mw ? [mw.scrollLeft, mw.scrollTop] : mapScroll;
        s.innerHTML = tab === 'gens' ? sideGens() : tab === 'res' ? sideRes() : tab === 'atelier' ? sideAtelier() : tab === 'bric' ? sideBric() : tab === 'ville' ? sideVille() : tab === 'famille' ? sideFamille() : tab === 'regl' ? sideRegl() : sideRadio();
        s.scrollTop = keep;
        // une grande carte garde où on en était ; la première fois, elle se centre sur le bunker
        const w2 = s.querySelector('.bk-mapwrap.is-big');
        if (w2) { if (mk) { w2.scrollLeft = mk[0]; w2.scrollTop = mk[1]; } else { const base = w2.querySelector('.is-base'); if (base) { w2.scrollLeft = base.offsetLeft - w2.clientWidth / 2 + 15; w2.scrollTop = base.offsetTop - w2.clientHeight / 2 + 15; } } mapScroll = [w2.scrollLeft, w2.scrollTop]; }
    }
    const AUTO_L = [['prudent', '🟢 Prudente (dès que la barre baisse)'], ['normal', '🟡 Normale'], ['manuel', '🔴 Manuelle (à la dernière minute ; je donne les ordres)']];
    function sideGens() {
        const dp = diaryOf && G.people.find(x => x.id === diaryOf); if (dp) return diaryHtml(dp);
        return `<div class="bk-autobar"><label>🧍 Autonomie de tout le monde <select data-bk-auto="">${AUTO_L.map(([v, l]) => `<option value="${v}" ${G.auto === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <small class="muted">Chacun va de soi-même boire, manger, aux toilettes, se laver ou dormir quand sa barre descend : 🟢 prudente = dès qu’elle passe sous la moitié, 🟡 normale = vers un tiers, 🔴 manuelle = seulement à la toute dernière minute (c’est vous qui donnez les ordres). Les boutons 💧🍞🚽🧼💤 de chacun donnent un ordre tout de suite.</small></div>` + G.people.map(p => {
            const out = p.where === 'dehors', pl = out && G.city.places.find(x => x.id === p.exp?.place);
            const status = p.hp <= 0 ? '☠️ mort·e' : out ? `🚶 ${p.exp.phase === 'aller' ? 'en route vers' : p.exp.phase === 'fouille' ? 'fouille' : 'rentre de'} ${esc(pl?.name || '')}` : esc(pawn(p).match(/title="[^:]*: ([^"]*)"/)?.[1] || '');
            const skills = B().SKILLS.filter(([k]) => (p.sk?.[k] || 1) > 1).map(([k, ico, l]) => `<span class="bk-chip" title="${esc(l)} : ${Math.round(((p.sk[k] || 1) - 1) * 100)} % de mieux">${ico} ${esc(l)}</span>`).join('');
            const ties = [...(p.spouses || []).map(id => ['💞', id]), ...(p.kin || []).map(id => ['👪', id])].map(([ico, id]) => { const o = G.people.find(x => x.id === id); return o ? `<span class="bk-chip" title="${ico === '💞' ? 'En couple' : 'De la même famille'} : le moral tient mieux quand on est ensemble">${ico} ${esc(o.name.split(' ')[0])}</span>` : ''; }).join('');
            const traits = (p.traits || []).map(k => B().TRAITS[k]).filter(Boolean).map(([ico, l, d]) => `<span class="bk-chip is-trait" title="${esc(d)}">${ico} ${esc(l)}</span>`).join('');
            const rel = G.people.filter(o => o !== p && o.hp > 0).map(o => [o, B().relOf(G, p, o)]).filter(([, v]) => Math.abs(v) >= 25).map(([o, v]) => `<span class="bk-chip${v < 0 ? ' is-bad' : ''}" title="${v > 0 ? 'Ami·e : le moral tient mieux ensemble' : 'Ne se supportent plus : ça mine le moral'}">${v > 0 ? '🤝' : '😠'} ${esc(o.name.split(' ')[0])}</span>`).join('');
            const xp = B().SKILLS.map(([k, ico, l]) => { const x = p.xp?.[k] || 0, cur = p.sk?.[k] || 1, need = 12 + 32 * (cur - 1); return x > 0.5 ? `<span class="bk-xp" title="${esc(l)} ×${cur.toFixed(1).replace('.', ',')} : ${Math.floor(x)} h / ${Math.round(need)} h de pratique avant le prochain progrès">${ico} ${Math.min(99, Math.round(100 * x / need))} %<i style="width:${Math.min(100, Math.round(100 * x / need))}%"></i></span>` : ''; }).join('');
            const feud = G.feud?.includes(p.id) ? (() => { const o = G.people.find(x => x.id === G.feud.find(i => i !== p.id)); return o ? `<span class="bk-chip is-bad" title="Une vieille brouille de famille">⚡ ${esc(o.name.split(' ')[0])}</span>` : ''; })() : '';
            const jobs = [['libre', 'Rien de spécial'], ['creuser', '⛏️ Creuser'], ['construire', '🔨 Construire'], ['recycler', '♻️ Démonter le bric-à-brac'], ['garde', '🛡️ Monter la garde'], ...(B().has(G, 'dynamo') ? [['pedaler', '🚲 Pédaler (électricité)']] : [])];
            return `<div class="bk-person${p.hp <= 0 ? ' is-dead' : ''}"><div class="bk-p-head">${pawn(p)}<div><b>${esc(p.name)}${p.me ? ' <small>(toi)</small>' : ''}${p.baby ? ' <small>(bébé)</small>' : ''}</b><small>${status}${p.ill && p.hp > 0 ? ` · ${p.ill.k === 'fievre' ? '🤒 fièvre' : '🩹 blessure'}${p.ill.treated ? ' (soignée)' : ''}` : ''}</small>${p.from ? `<small class="muted">${esc(p.from)}</small>` : ''}</div></div>
                ${traits || skills || ties || feud || rel ? `<div class="bk-chips">${traits}${skills}${ties}${rel}${feud}</div>` : ''}
                ${xp && !p.baby ? `<div class="bk-xps" title="Ce qu’il ou elle apprend en pratiquant">📈 <small class="muted">progrès :</small> ${xp}</div>` : ''}
                <div class="bk-needs"><span>❤️ Vie</span>${bar(p.hp, 'is-hp')}<span>😊 Moral</span>${bar(p.mood ?? 70, 'is-mood')}${B().NEEDS.map(([k, ico, l]) => `<span>${ico} ${l}</span>${bar(p.needs[k])}`).join('')}</div>
                ${p.hp > 0 && !out && !p.baby ? `<div class="bk-p-actions"><label>Travail <select data-bk-job="${esc(p.id)}">${jobs.map(([v, l]) => `<option value="${v}" ${p.job === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><button type="button" class="button small secondary" data-bk="sendfrom" data-id="${esc(p.id)}">🚶 Envoyer en ville</button><button type="button" class="button small secondary" data-bk="diary" data-id="${esc(p.id)}">📔 Journal${p.diary?.length ? ` (${p.diary.length})` : ''}</button></div>
                <div class="bk-p-actions bk-orders"><label title="Quand il ou elle va de soi-même boire, manger, aux toilettes…">Autonomie <select data-bk-auto="${esc(p.id)}"><option value="">comme tout le monde</option>${AUTO_L.map(([v, l]) => `<option value="${v}" ${p.auto === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                    <span class="bk-order-btns" role="group" aria-label="Lui dire de">${[['soif', '💧', 'Boire'], ['faim', '🍞', 'Manger'], ['vessie', '🚽', 'Toilettes'], ['hygiene', '🧼', 'Se laver'], ['sommeil', '💤', 'Dormir']].map(([k, ico, l]) => `<button type="button" class="icon-button small" data-bk="need" data-id="${esc(p.id)}" data-v="${k}" title="${l} maintenant" aria-label="${l} maintenant">${ico}</button>`).join('')}</span></div>` : ''}${p.sulk ? '<p class="ui-notice is-error">😞 Plus de moral : refuse de travailler (jeux, musique, histoires du soir…).</p>' : ''}</div>`;
        }).join('');
    }
    function sideRes() {
        const row = ([r, ico, l, u]) => { const c = B().cap(G, r); return `<span>${ico} ${l}</span><b>${Math.floor(G.res[r])}${u ? ' ' + u : ''} <small>/ ${c}</small></b>${bar(100 * G.res[r] / c)}`; };
        return `<h4>Réserves</h4><div class="bk-res">${B().RES.slice(0, 10).map(row).join('')}</div>
            <h4>Composants</h4><div class="bk-res">${B().RES.slice(10, 20).map(row).join('')}</div>${G.opt?.chaines ? `<h4>Fabrication</h4><div class="bk-res">${B().RES.slice(20).map(row).join('')}</div><p class="muted">Plantes → 🧶 rouet → fil → 🪢 métier à tisser → tissu → 🧥 tailleur → vêtements chauds (l’hiver, le froid fait bien moins de mal). Blé → ⚙️ moulin → farine → 🍞 four à pain.</p>` : ''}<p class="muted">Les composants viennent surtout du ♻️ bric-à-brac qu’on démonte (et de certains lieux : droguerie, électroménager, usine…).</p>
            <p class="muted">Plus de place : étagères, stockage, garde-manger, citerne, cuves. L’eau de pluie passe au ⚗️ filtre avant d’être bue (sinon : risque de fièvre).</p>
            ${B().has(G, 'filtre') ? `<p>${G.filterClog ? '⚗️ <b>Filtre encrassé</b> : il faut 1 tissu.' : `⚗️ Filtre : ${Math.round(G.filterUse)} / 30 L avant de le nettoyer (1 tissu).`}</p>` : ''}
            <h4>Air</h4><div class="bk-res"><span>🌀 Conduit d’aération</span><b>${Math.round(G.air)} %</b>${bar(G.air)}</div><p class="muted">Il s’encrasse, plus vite quand on est nombreux ; quelqu’un de libre le nettoie. Air lourd : on dort mal, le moral baisse.</p>
            <h4>Saison</h4><p>${(S => `${S[1]} ${S[2]}`)(B().SEASONS.find(x => x[0] === B().seasonOf(G)))} · une saison dure ${B().SEASON_DAYS} jours. ${B().seasonOf(G) === 'hiver' ? (G.cold ? '🥶 Il fait froid : il faut un poêle à bois (et du bois).' : '🔥 Le poêle chauffe le bunker.') : B().seasonOf(G) === 'ete' ? 'Il pleut moins, on a plus soif.' : B().seasonOf(G) === 'printemps' ? 'Il pleut plus souvent.' : ''}</p>
            <h4>Électricité</h4><p>${G.power ? ({soleil: '☀️ Le panneau solaire', vent: '🌬️ L’éolienne', pedales: '🚲 La dynamo à pédales', batteries: '🔋 Le banc de batteries'}[G.powerSrc] || '⚡ Le groupe électrogène') + ' donne le courant' : G.powerOn ? '🔌 Plus d’essence : pas d’électricité' : '🔌 Groupe électrogène éteint'} — le groupe brûle ${B().has(G, 'econome') ? '⅛' : '¼'} L d’essence par heure, seulement quand rien d’autre ne donne de courant.${B().sumOf(G, 'store') ? ` 🔋 Batteries : ${Math.floor(G.batt || 0)} h / ${B().sumOf(G, 'store')} h en réserve.` : ''}</p>
            <button type="button" class="button small secondary" data-bk="power">${G.powerOn ? 'Éteindre pour économiser l’essence' : 'Rallumer le groupe électrogène'}</button>
            <h4>Outils</h4><div class="bk-chips">${Object.entries(B().TOOLS).map(([k, [ico, l, d]]) => `<span class="bk-chip${G.tools.includes(k) ? '' : ' is-off'}" title="${esc(d)}">${ico} ${esc(l)}${G.tools.includes(k) ? '' : ' (à trouver)'}</span>`).join('')}</div>`;
    }
    function sideAtelier() {
        const IT = B().ITEMS;
        return `<h4>En construction</h4>${G.builds.length ? `<ol class="bk-builds">${G.builds.map((b, i) => `<li>${b.rep ? '🔧 Réparer : ' : b.up ? `⬆️ Niveau ${b.up} : ` : ''}${IT[b.k].ico} ${esc(IT[b.k].name)} <small>étage −${b.fi + 1} · encore ${Math.max(0, Math.ceil(b.left * 10) / 10)} h</small><button type="button" class="icon-button small" data-bk="unbuild" data-i="${i}" title="Annuler (les matériaux reviennent)" aria-label="Annuler">×</button></li>`).join('')}</ol>
            ${!G.power ? '<p class="ui-notice is-error">Pas d’électricité : l’atelier est à l’arrêt.</p>' : ''}${!G.people.some(p => p.hp > 0 && p.where === 'base' && p.job === 'construire') ? '<p class="ui-notice">Personne n’est à l’atelier : mets quelqu’un sur « 🔨 Construire » (onglet Habitants).</p>' : ''}` : A().emptyState({icon: '🛠️', text: 'Rien en construction.', hint: 'Clique sur une place libre du bunker (＋), ou sur « Construire » ci-dessous.'})}
            <h4>Plans</h4><div class="segmented bk-planf" role="group" aria-label="Montrer">${[['ok', '✅ Je peux construire'], ['near', '🟡 Il manque peu'], ['known', '📐 Mes plans'], ['all', 'Tous'], ['find', '❔ À trouver']].map(([v, l]) => `<button type="button" data-bk="planf" data-v="${v}" class="${planF === v ? 'is-active' : ''}">${l}</button>`).join('')}</div>
            <div class="bk-plans">${plansHtml()}</div>`;
    }
    /** ce qui manque pour un plan : [[ressource, il en faut, on en a]], l'outil, le plan lui-même */
    function needOf(k) { const it = B().ITEMS[k]; return {miss: Object.entries(it.cost || {}).filter(([r, n]) => (G.res[r] || 0) < n).map(([r, n]) => [r, n, Math.floor(G.res[r] || 0)]), tool: it.tool && !G.tools.includes(it.tool) ? it.tool : '', plan: !G.plans.includes(k)}; }
    /** d'où vient une ressource : le bric-à-brac qui en donne, et les lieux où on la trouve */
    function whereRes(r) { const J = B().JUNK, js = B().JUNK_KEYS.filter(k => J[k][2][r]).sort((a, b) => J[b][2][r] - J[a][2][r]).slice(0, 3).map(k => `${J[k][0]} ${J[k][1].toLowerCase()}`), ps = Object.entries(B().PLACE_KINDS).filter(([, v]) => v[2][r]).slice(0, 3).map(([, v]) => `${v[0]} ${v[1].toLowerCase()}`); return [...js.length ? [`à démonter : ${js.join(', ')}`] : [], ...ps.length ? [`en ville : ${ps.join(', ')}`] : []].join(' · '); }
    let planF = 'known';
    function plansHtml() {
        const IT = B().ITEMS, keys = Object.keys(IT).filter(k => !IT[k].fixed && (G.opt?.chaines || !IT[k].chain)), planPlaces = Object.values(B().PLACE_KINDS).filter(v => v[4]).map(v => `${v[0]} ${v[1].toLowerCase()}`).join(', ');
        const list = keys.map(k => ({k, n: needOf(k)})).filter(({n}) => planF === 'all' ? true : planF === 'find' ? n.plan : planF === 'ok' ? !n.plan && !n.miss.length && !n.tool : planF === 'near' ? !n.plan && (n.miss.length || n.tool) && n.miss.reduce((a, [, x, h]) => a + x - h, 0) <= 4 : !n.plan)
            .sort((a, b) => (a.n.plan - b.n.plan) || (a.n.miss.length - b.n.miss.length));
        if (!list.length) return `<p class="muted">${planF === 'ok' ? 'Rien de constructible tout de suite : regarde « 🟡 Il manque peu ».' : planF === 'find' ? 'Tous les plans sont trouvés !' : 'Rien ici.'}</p>`;
        return list.map(({k, n}) => { const it = IT[k], can = !n.plan && !n.miss.length && !n.tool;
            const cost = Object.entries(it.cost || {}).map(([r, q]) => { const h = Math.floor(G.res[r] || 0); return `<span class="${h < q ? 'is-miss' : 'is-ok'}" title="${esc(resName(r)[2])} : il en faut ${q}, tu en as ${h}">${resName(r)[1]} ${Math.min(h, q)}/${q}</span>`; }).join(' ');
            const missTxt = n.miss.length ? `<small class="bk-miss">Il manque : ${n.miss.map(([r, q, h]) => `${q - h} ${esc(resName(r)[2].toLowerCase())}`).join(', ')}.</small><small class="bk-where">${n.miss.map(([r]) => `${resName(r)[1]} ${esc(whereRes(r))}`).filter(x => x.length > 3).join('<br>')}</small>` : '';
            const toolTxt = it.tool ? `<small class="${n.tool ? 'bk-miss' : ''}">${n.tool ? 'Il faut l’outil' : 'Outil'} ${B().TOOLS[it.tool][0]} ${esc(B().TOOLS[it.tool][1])}${n.tool ? ' (à trouver en ville)' : ' ✓'}</small>` : '';
            return `<div class="bk-plan${n.plan ? ' is-off' : can ? ' is-can' : ''}"><span class="bk-ico">${it.ico}</span><div><b>${esc(it.name)}${n.plan ? ' <small class="bk-tag">plan à trouver</small>' : ''}</b><small>${esc(it.desc)} · ${it.h} h de travail${it.power ? ' · ⚡ électricité' : ''}</small><span class="bk-cost">${cost}</span>${missTxt}${toolTxt}${n.plan ? `<small class="bk-where">❔ Les plans se trouvent en fouillant : ${esc(planPlaces)}.</small>` : ''}</div>${n.plan ? '' : `<button type="button" class="button small ${can ? '' : 'secondary'}" data-bk="build" data-k="${k}" ${can ? '' : 'aria-disabled="true"'}>Construire</button>`}</div>`; }).join('');
    }
    /** ♻️ le bric-à-brac : ce qu'on a rapporté, ce que chaque objet donne une fois démonté, la file de l'établi */
    function sideBric() {
        const J = B().JUNK, mine = Object.entries(G.junk || {}).filter(([, n]) => n > 0), cnt = B().junkCount(G), cap = B().junkCap(G), who = G.people.filter(p => p.hp > 0 && p.where === 'base' && p.job === 'recycler');
        const gives = k => Object.entries(J[k][2]).map(([r, n]) => `${resName(r)[1]} ${n}`).join(' ');
        return `<p class="muted">Des objets qui ne servent à rien tels quels… mais qu’on démonte pour en tirer des composants. ${cnt} / ${cap} places (un 🧺 débarras en ajoute).</p>
            ${who.length ? `<p>♻️ ${esc(who.map(p => p.name).join(', '))} ${who.length > 1 ? 'démontent' : 'démonte'}${B().has(G, 'etabli') ? ' à l’établi (2× plus vite, parfois une pièce de plus)' : ' (un 🪚 établi irait 2× plus vite)'}.</p>` : '<p class="ui-notice">Personne ne démonte : mets quelqu’un sur « ♻️ Démonter le bric-à-brac » (onglet Habitants) — ou clique « Démonter », quelqu’un de libre s’y mettra.</p>'}
            <label class="checkbox-line"><input type="checkbox" data-bk-autorecy ${G.autoRecy ? 'checked' : ''}> Tout démonter au fur et à mesure (sans que je choisisse)</label>
            ${G.recy.length ? `<h4>À l’établi</h4><ol class="bk-builds">${G.recy.map((r, i) => `<li>${J[r.k][0]} ${esc(J[r.k][1])} <small>${i ? 'en attente' : `encore ${Math.max(0, Math.ceil(r.left * 10) / 10)} h`} → ${gives(r.k)}</small></li>`).join('')}</ol>` : ''}
            <h4>Rapporté</h4>${mine.length ? `<div class="bk-plans">${mine.map(([k, n]) => `<div class="bk-plan"><span class="bk-ico">${J[k][0]}</span><div><b>${esc(J[k][1])}${n > 1 ? ` <small>× ${n}</small>` : ''}</b><small>Une fois démonté (${J[k][3]} h) :</small><span class="bk-cost">${gives(k)}</span></div><span class="bk-btns"><button type="button" class="button small" data-bk="recy" data-k="${k}">♻️ Démonter</button>${n > 1 ? `<button type="button" class="button small secondary" data-bk="recyall" data-k="${k}">Les ${n}</button>` : ''}</span></div>`).join('')}</div>`
                : A().emptyState({icon: '♻️', text: 'Rien à démonter.', hint: 'En ville, coche « ♻️ Bric-à-brac » dans ce qu’on rapporte : la décharge, les maisons, le magasin d’électroménager en regorgent.'})}
            <details class="bk-junkall"><summary>Tous les objets qu’on peut trouver, et ce qu’ils donnent</summary><div class="bk-plans">${B().JUNK_KEYS.map(k => `<div class="bk-plan is-off"><span class="bk-ico">${J[k][0]}</span><div><b>${esc(J[k][1])}</b><span class="bk-cost">${gives(k)}</span><small>${esc(Object.values(B().PLACE_KINDS).filter(v => (v[5] || []).includes(k)).map(v => v[1]).join(', '))}</small></div></div>`).join('')}</div></details>`;
    }
    let locating = null, route = [], mapScroll = null;
    /** 🚶 le parcours : les étapes dans l'ordre, et à chacune ce qu'on rapporte (vide = tout) */
    function routeHtml(free) {
        if (!route.length) return '';
        const c = G.city, total = B().routeTime(G, route), pls = route.map(st => c.places.find(x => x.id === st.id));
        // pour chaque chose : la prendre ou pas, et combien au plus (vide = tout ce qu'il y a) ; ce qu'on a vu à la dernière visite
        const chips = (st, pl) => { const opts = [...Object.keys(pl.max).filter(r => pl.max[r] > 0), ...((B().PLACE_KINDS[pl.kind][5] || []).length ? ['junk'] : [])], on = st.take, q = st.qty || {}, kn = pl.known;
            const seen = r => !kn ? '' : r === 'junk' ? ` <i class="bk-seen">(vu : ${kn.junk.length})</i>` : ` <i class="bk-seen">(vu : ${kn.stock[r] || 0})</i>`;
            return `<span class="bk-take" role="group" aria-label="Ce qu’on rapporte de ${esc(pl.name)}"><button type="button" class="bk-chip${!on ? ' is-on' : ''}" data-bk="take" data-id="${pl.id}" data-v="">Tout</button>${opts.map(r => { const sel = !on || on.includes(r);
                return `<span class="bk-takeq${sel ? ' is-sel' : ''}"><button type="button" class="bk-chip${on?.includes(r) ? ' is-on' : ''}" data-bk="take" data-id="${pl.id}" data-v="${r}" aria-pressed="${!!on?.includes(r)}">${r === 'junk' ? '♻️ bric-à-brac' : `${resName(r)[1]} ${esc(resName(r)[2].toLowerCase())}`}${seen(r)}</button>${sel ? `<input type="number" min="1" max="999" inputmode="numeric" placeholder="tout" value="${q[r] || ''}" data-bk-qty="${r}" data-id="${pl.id}" aria-label="Combien au plus de ${r === 'junk' ? 'bric-à-brac' : esc(resName(r)[2].toLowerCase())} (vide = tout)">` : ''}</span>`; }).join('')}</span>`; };
        const who = free.find(p => p.id === sendFor) || free[0], cap = who ? B().carryOf(G, who) : 0;
        // ce qui est prévu : si tout a un nombre, on peut compter ; sinon « tout ce qu'il y a »
        const planned = route.reduce((n, st) => { const pl = c.places.find(x => x.id === st.id), opts = st.take || [...Object.keys(pl.max).filter(r => pl.max[r] > 0), 'junk']; return opts.every(r => st.qty?.[r] || (r === 'junk' && !(B().PLACE_KINDS[pl.kind][5] || []).length)) ? n + opts.reduce((m, r) => m + (st.qty?.[r] || 0) * (r === 'junk' ? 2 : 1), 0) : Infinity; }, 0);
        return `<div class="bk-route"><h4>🚶 Le parcours</h4><ol>${route.map((st, i) => { const pl = pls[i]; return `<li><div class="bk-route-head"><b>${B().PLACE_KINDS[pl.kind][0]} ${esc(pl.name)}</b><span><button type="button" class="icon-button small" data-bk="routeup" data-i="${i}" ${i ? '' : 'disabled'} aria-label="Plus tôt">↑</button><button type="button" class="icon-button small" data-bk="routedel" data-id="${pl.id}" aria-label="Retirer">×</button></span></div><small>Rapporter :</small>${chips(st, pl)}</li>`; }).join('')}</ol>
            <p class="muted">${Math.round(total / 6) / 10} h de marche en tout (aller, de lieu en lieu, retour), plus 2 h de fouille par lieu. <b>Place pour rapporter : ${free.length ? cap : '—'}</b> (un bric-à-brac = 2)${Number.isFinite(planned) && free.length ? ` · prévu : ${planned}${planned > cap ? ` <span class="bk-miss">— trop : il rapportera ${cap} au plus</span>` : ''}` : ''}. Sac plein : il rentre plus tôt. Plus de place : 🎒 sacs à dos, 🧺 hotte, 🛞 brouette, 🛒 charrette, 🚛 remorque de vélo, ou le grand sac trouvé en ville.</p>
            ${free.length ? `<div class="bk-send"><select data-bk-sendwho>${free.filter(p => !p.baby).map(p => `<option value="${esc(p.id)}" ${p.id === sendFor ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><button type="button" class="button small" data-bk="send">🚶 Partir</button><button type="button" class="button small secondary" data-bk="routeclear">Effacer</button></div>` : '<p class="muted">Personne de libre au bunker.</p>'}</div>`;
    }
    function sideVille() {
        // une partie d'avant le plan en fond : on cherche la ville une fois, puis on redessine
        if (G.city.lat == null && G.city.geo !== 'none' && !locating) { const g = G; locating = locateCity(g.city).then(() => { locating = null; if (G === g && tab === 'ville') drawSide(); }); }
        const c = G.city, n = c.n, free = B().alive(G).filter(p => p.where === 'base');
        const cell = (x, y) => { const pl = c.places.find(q => q.x === x && q.y === y); if (x === c.base[0] && y === c.base[1]) return `<span class="bk-cell is-base" title="Le bunker">☢</span>`;
            if (!pl) return '<span class="bk-cell"></span>'; const k = B().PLACE_KINDS[pl.kind], there = G.people.some(p => p.hp > 0 && p.exp?.place === pl.id);
            const ri = route.findIndex(st => st.id === pl.id);
            return `<button type="button" class="bk-cell is-place${placeSel === pl.id ? ' is-sel' : ''}${there ? ' is-busy' : ''}${ri >= 0 ? ' is-route' : ''}" data-bk="place" data-id="${pl.id}" title="${esc(pl.name)}${ri >= 0 ? ` (étape ${ri + 1})` : ''}">${k[0]}${ri >= 0 ? `<i class="bk-step">${ri + 1}</i>` : ''}</button>`; };
        const pl = c.places.find(x => x.id === placeSel);
        const stockTxt = p => { const tot = Object.values(p.stock).reduce((a, b) => a + b, 0), max = Object.values(p.max).reduce((a, b) => a + b, 0) || 1; return !p.visits ? 'pas encore fouillé' : tot / max > .6 ? 'beaucoup de choses' : tot / max > .25 ? 'un peu' : tot ? 'presque vide' : 'vide (ça revient chaque jour)'; };
        return `<p class="muted">${esc(c.name)} · ville ${B().SIZES[c.size][2].toLowerCase()} · 30 min par case (×1,5 la nuit sans lampe torche).</p>
            <div class="bk-mapwrap${n > 17 ? ' is-big' : ''}" style="--n:${n}"><div class="bk-map${c.lat != null ? ' has-bg' : ''}" style="--n:${n}">${mapBgHtml(c)}${Array.from({length: n * n}, (_, i) => cell(i % n, Math.floor(i / n))).join('')}</div></div>
            ${routeHtml(free)}${c.geo === 'none' ? '<p class="lck-legend muted">Pas de plan en fond : cette ville n’a pas de coordonnées (ni dans ton arbre, ni dans les communes).</p>' : ''}
            ${pl ? `<div class="bk-placecard"><b>${B().PLACE_KINDS[pl.kind][0]} ${esc(pl.name)}</b><small>${Math.round(B().travel(G, pl) / 6) / 10} h de marche (aller) · ${stockTxt(pl)}${pl.visits ? ` · fouillé ${plural(pl.visits, 'fois', 'fois')}` : ''}</small>
                ${pl.known ? `<p class="bk-known">👁️ Vu le jour ${pl.known.d} : ${Object.keys(pl.known.stock).length ? Object.entries(pl.known.stock).map(([r, n]) => `${n} ${resName(r)[1]} ${esc(resName(r)[2].toLowerCase())}`).join(', ') : 'plus aucune réserve'}${pl.known.junk.length ? `, ${pl.known.junk.length} bric-à-brac` : ''}. <small class="muted">Ça change chaque matin, au hasard : des choses reviennent, d’autres survivants passent.</small></p>` : ''}
                <p class="muted">On peut y trouver (pas tout à la fois, au hasard) : ${Object.keys(pl.max).map(r => resName(r)[1] + ' ' + resName(r)[2].toLowerCase()).join(', ')}${B().PLACE_KINDS[pl.kind][4] ? ', et souvent des plans' : ''}.${(B().PLACE_KINDS[pl.kind][5] || []).length ? ` ♻️ Du bric-à-brac${pl.seen && (pl.junk || []).length ? ` : ${[...new Set(pl.junk)].map(k => B().JUNK[k][0] + ' ' + B().JUNK[k][1].toLowerCase()).join(', ')}` : pl.seen ? ' (plus rien pour l’instant)' : ''}.` : ''}</p>
                <div class="bk-send">${route.some(st => st.id === pl.id) ? `<button type="button" class="button small secondary" data-bk="routedel" data-id="${pl.id}">− Retirer du parcours</button>` : `<button type="button" class="button small" data-bk="routeadd" data-id="${pl.id}" ${route.length >= 6 ? 'disabled' : ''}>＋ Ajouter au parcours</button>`}</div></div>` : '<p class="muted">Clique sur les lieux de la carte pour composer le parcours (jusqu’à 6 étapes).</p>'}`;
    }
    /** 🌳 la famille au bunker : le coffre, les liens, les naissances (l'arbre du bunker, à part de ta vraie base) */
    function sideFamille() {
        const H = B().HEIRLOOMS, alive = G.people.filter(p => p.hp > 0);
        const couples = [], seen = new Set();
        G.people.forEach(p => (p.spouses || []).forEach(id => { const k = [p.id, id].sort().join(); if (seen.has(k)) return; seen.add(k); const o = G.people.find(x => x.id === id); if (o) couples.push([p, o]); }));
        return `<h4>🧳 Le coffre de famille</h4>${G.coffre.length ? `<ul class="bk-coffre-items">${G.coffre.map(c => `<li><b>${esc(c.title)}</b><small>${esc(H.find(h => h[0] === c.bonus)[2])}</small></li>`).join('')}</ul>` : '<p class="muted">Le coffre est parti vide (aucun objet choisi au départ).</p>'}
            <h4>👪 Ensemble au bunker</h4>
            ${couples.length ? couples.map(([a, b]) => `<p>💞 ${esc(a.name)} et ${esc(b.name)}</p>`).join('') : ''}
            <p class="muted">${plural(alive.length, 'personne')} en vie. Ceux qui ont de la famille près d’eux gardent mieux le moral.${G.feud ? ` ⚡ Une vieille brouille : ${esc(G.feud.map(id => G.people.find(p => p.id === id)?.name || '?').join(' et '))}.` : ''}</p>
            ${G.preg ? `<p>🤰 ${esc(G.people.find(p => p.id === G.preg.m)?.name || '')} attend un bébé : naissance le jour ${B().dayOf(G.preg.due)}.</p>` : ''}
            <h4>🌳 L’arbre du bunker</h4>
            ${G.births.length ? `<div class="bk-tree">${G.births.map(b => `<div class="bk-tree-row"><span class="bk-tree-par">${esc(b.m)}${b.f ? ` <i>♥</i> ${esc(b.f)}` : ''}</span><span class="bk-tree-line" aria-hidden="true"></span><span class="bk-tree-kid">👶 ${esc(b.name)} <small>né·e le jour ${b.day}</small></span></div>`).join('')}</div><p class="muted">Cet arbre reste dans la partie : il ne touche pas à ta vraie base.</p>`
                : `<p class="muted">Pas encore de naissance. Il faut ${B().has(G, 'berceau') ? '' : 'un 👶 berceau, '}un couple qui a le moral, et un peu de temps (à partir du jour 5).</p>`}
            <p><button type="button" class="button small" data-bk="gazette">📰 Lire la gazette du bunker</button></p>`;
    }
    /** 📰 la gazette : le récit de la partie, comme un journal */
    function gazetteHtml() {
        const st = G.stats, day = B().dayOf(G.t), alive = G.people.filter(p => p.hp > 0), me = meOf(G);
        const head = G.over ? `Le bunker de ${me.name} s’est tu après ${plural(day - 1, 'jour')}` : alive.length === G.people.length ? `${plural(day - 1 || 1, 'jour')} sous terre : tout le monde tient bon` : `Jour ${day} : ${plural(alive.length, 'survivant')} à ${G.city.name}`;
        const stories = G.log.filter(l => l.kind === 'histoire').slice(0, 3);
        return `<div class="bk-gz-paper"><button type="button" class="icon-button bk-gz-close" data-bk="gzclose" aria-label="Fermer">×</button>
            <header class="bk-gz-mast"><small>${esc(G.city.name)} · jour ${day} · ${B().clock(G.t)}</small><h2>La Gazette du Bunker</h2><small>Édition spéciale · ne paraît que sous terre</small></header>
            <h3 class="bk-gz-head">${esc(head)}</h3>
            <div class="bk-gz-cols">
                <section><h4>Les habitants</h4><ul>${G.people.map(p => { const d = st.deaths.find(x => x.name === p.name); return `<li>${p.hp > 0 ? '✓' : '✝'} <b>${esc(p.name)}</b>${p.baby ? ' (né·e au bunker)' : ''}${p.from ? ` <small>· ${esc(p.from)}</small>` : ''}${d ? ` <small>· mort·e le jour ${d.day}</small>` : ''}</li>`; }).join('')}</ul>
                    ${G.births.length ? `<h4>Carnet rose</h4><ul>${G.births.map(b => `<li>👶 ${esc(b.name)}, jour ${b.day}, de ${esc(b.m)}${b.f ? ` et ${esc(b.f)}` : ''}</li>`).join('')}</ul>` : ''}</section>
                <section><h4>À la trappe</h4><p>${plural(st.visits.marchand, 'marchand')} (${plural(st.trades, 'échange')}), ${plural(st.visits.voyageur, 'voyageur')}, ${st.visits.pillards ? `${plural(st.visits.pillards, 'visite')} de pillards (${st.raidsWon} repoussée${st.raidsWon > 1 ? 's' : ''}, ${st.raidsLost} perdue${st.raidsLost > 1 ? 's' : ''})` : 'aucun pillard'}.</p>
                    <h4>Les veillées</h4><p>${plural(st.stories, 'histoire')} racontée${st.stories > 1 ? 's' : ''} le soir.</p>${stories.map(l => `<blockquote>${esc(l.txt.replace(/^📖 /, ''))}</blockquote>`).join('')}</section>
                <section><h4>Trouvailles</h4>${st.found.length ? `<ul>${st.found.slice(-12).map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : '<p>Rien de notable pour l’instant.</p>'}
                    ${G.coffre.length ? `<h4>Le coffre de famille</h4><ul>${G.coffre.map(c => `<li>${esc(c.title)}</li>`).join('')}</ul>` : ''}
                    <h4>Le bunker</h4><p>${G.floors.length} étage${G.floors.length > 1 ? 's' : ''}, ${B().items(G).length} installations, ${G.tools.length} outil${G.tools.length > 1 ? 's' : ''}.</p></section>
            </div>
            <footer class="bk-gz-foot"><button type="button" class="button small secondary" data-bk="gzprint">🖨 Imprimer</button></footer></div>`;
    }
    /** ⚙️ les réglages de la partie en cours */
    function sideRegl() {
        const S = B().SCENARIOS[G.scen] || B().SCENARIOS.classique, o = G.opt || {};
        const opt = (k, l, d) => `<label class="checkbox-line bk-optl"><input type="checkbox" data-bk-opt="${k}" ${o[k] ? 'checked' : ''}><span>${l}<small class="muted">${d.replace(/^— /, '')}</small></span></label>`;
        return `<h4>Difficulté</h4><div class="segmented bk-planf" role="group">${Object.entries(B().DIFFS).map(([k, d]) => `<button type="button" data-bk="diff" data-v="${k}" class="${G.diff === k ? 'is-active' : ''}">${esc(d.l)}</button>`).join('')}</div>
            <p class="muted">Plus difficile : on a faim et soif plus vite, moins de réserves au départ, des pillards plus forts, plus de pannes, et la ville se remplit moins vite.</p>
            <h4>Options</h4>${opt('meteo', '🌪️ Météo et catastrophes', '— canicule, tempête de poussière, inondation, séisme, orage, vague de froid')}${opt('chaines', '🧵 Chaînes de fabrication', '— rouet, métier à tisser, tailleur ; champ, moulin, four à pain')}${opt('tuto', '📘 Tutoriel guidé', G.tuto >= 0 ? `— étape ${G.tuto + 1} / ${B().TUTO.length}` : '— (le cocher le recommence)')}
            <h4>Scénario</h4><p>${S[0]} <b>${esc(S[1])}</b> — ${esc(S[2])}</p>
            ${G.event ? `<h4>En ce moment</h4><p>${B().EVENTS[G.event.k][0]} <b>${esc(B().EVENTS[G.event.k][1])}</b> : ${esc(B().EVENTS[G.event.k][2])} (encore ${Math.max(1, Math.round((G.event.until - G.t) / 60))} h).</p>` : ''}
            <h4>Pannes</h4><p class="muted">Les installations s’usent et tombent parfois en panne (🔧 sur le dessin). Clique dessus : « Réparer » (un quart de ce qu’elles ont coûté, puis du travail à l’atelier). Le même menu propose « Améliorer » (niveau 2 puis 3 : leurs effets comptent ×1,5 puis ×2).</p>
            <p>${Object.keys(G.broken || {}).length ? `🔧 En panne : ${Object.keys(G.broken).map(k => { const [f, s2] = k.split(',').map(Number); return esc(B().ITEMS[G.floors[f].slots[s2]].name); }).join(', ')}.` : '✓ Rien en panne.'}</p>`;
    }
    function sideRadio() {
        const out = G.people.filter(p => p.hp > 0 && p.where === 'dehors');
        return `${G.power ? '' : '<p class="ui-notice is-error">📻 Pas d’électricité : la radio est muette. Les messages arriveront quand le courant reviendra.</p>'}
            <h4>Dehors</h4>${out.length ? out.map(p => { const pl = G.city.places.find(x => x.id === p.exp.place); return `<div class="bk-radio-row">${pawn(p)}<div><b>${esc(p.name)}</b><small>${p.exp.phase === 'aller' ? 'en route vers' : p.exp.phase === 'fouille' ? 'fouille' : 'rentre de'} ${esc(pl?.name || '')}${p.exp.route?.length > 1 ? ` (étape ${p.exp.i + 1} / ${p.exp.route.length})` : ''} · ${p.exp.phase === 'retour' ? 'arrive' : 'jusqu’à'} ${B().clock(p.exp.until)}</small></div>${p.exp.phase !== 'retour' ? `<button type="button" class="button small secondary" data-bk="recall" data-id="${esc(p.id)}" ${G.power ? '' : 'disabled'}>📻 Rentre !</button>` : ''}</div>`; }).join('') : '<p class="muted">Tout le monde est au bunker.</p>'}
            <h4>📻 Le marché de la radio</h4>${marketHtml()}
            <h4>Journal</h4><ol class="bk-log">${G.log.slice(0, 120).map(l => `<li class="is-${l.kind}"><span class="bk-t">J${B().dayOf(l.t)} ${B().clock(l.t)}</span> ${esc(l.txt)}</li>`).join('')}</ol>`;
    }

    function marketHtml() {
        const m = G.market || {offers: [], deals: []}, r = k => resName(k);
        if (!B().has(G, 'radio')) return '<p class="muted">Sans radio, pas de marché.</p>';
        return `<p class="muted">D’autres survivants proposent des échanges : on envoie tout de suite, un messager apporte la marchandise quelques heures plus tard (le plus souvent…). Les prix changent chaque matin.</p>
            ${m.offers.length ? `<div class="bk-plans">${m.offers.map(o => { const ok = (G.res[o.want.r] || 0) >= o.want.n; return `<div class="bk-plan${ok ? ' is-can' : ''}"><span class="bk-ico">${r(o.give.r)[1]}</span><div><b>${o.give.n} ${esc(r(o.give.r)[2].toLowerCase())}</b><small>contre ${r(o.want.r)[1]} ${o.want.n} ${esc(r(o.want.r)[2].toLowerCase())} · ${esc(o.who)}</small>${ok ? '' : `<small class="bk-miss">Il manque ${Math.ceil(o.want.n - (G.res[o.want.r] || 0))} ${esc(r(o.want.r)[2].toLowerCase())}.</small>`}</div><span class="bk-btns"><button type="button" class="button small" data-bk="trade" data-id="${esc(o.id)}" ${ok && G.power ? '' : 'disabled'}>🤝 Accepter</button></span></div>`; }).join('')}</div>` : '<p class="muted">Plus d’offre aujourd’hui : de nouvelles demain matin (7 h).</p>'}
            ${m.deals.length ? `<p>🚚 En route : ${m.deals.map(d => `${r(d.r)[1]} ${d.n} de ${esc(d.who)} (vers ${B().clock(d.t)})`).join(', ')}.</p>` : ''}`;
    }
    /** 📔 le journal d'un habitant (à la place de la liste, dans l'onglet Habitants) */
    let diaryOf = '';
    function diaryHtml(p) {
        const list = (p.diary || []).map(d => `<li><span class="bk-t">Jour ${d.d}</span> ${esc(d.txt)}</li>`).join('');
        return `<div class="bk-route-head"><h4>📔 Le journal de ${esc(p.name)}</h4><button type="button" class="button small secondary" data-bk="diary" data-id="">← Tous les habitants</button></div>
            <ol class="bk-log bk-diary">${list || '<li class="muted">Rien d’écrit pour l’instant : il ou elle écrit chaque soir.</li>'}</ol>`;
    }
    /* ═════════ Les clics ═════════ */
    function onClick(e) {
        const b = e.target.closest('[data-bk]'); if (!b || !dlg.contains(b)) return;
        const k = b.dataset.bk;
        if (k === 'close') { dlg.close(); return; }
        if (k === 'resume') { const x = store().games[b.dataset.id]; if (!x) return; try { G = B().check(x.g); } catch (err) { toast(err.message, 'error'); return; } gid = b.dataset.id; tab = 'gens'; placeSel = null; route = []; mapScroll = null; diaryOf = ''; play(); return; }
        if (k === 'delsave') { const id = b.dataset.id, name = store().games[id]?.name || ''; const del = () => { const s = store(); delete s.games[id]; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
            if (A()?.undoLocalChange) A().undoLocalChange(`Partie « Le bunker de ${name} » supprimée`, [KEY], del, () => { if (dlg && !G) startScreen(); }); else del(); startScreen(); return; }
        if (k === 'propose') { propose(b.closest('form')); return; }
        if (!G) return;
        if (k === 'speed') { setSpeed(Number(b.dataset.v) || 0); return; }
        if (k === 'save') { saveGame(gid, G); return; }
        if (k === 'export') { const blob = new Blob([JSON.stringify({lcnda: 'bunker', v: 1, g: G})], {type: 'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `bunker-${(meOf(G).name || 'partie').replace(/[^\w\-]+/g, '-').slice(0, 40)}-jour-${B().dayOf(G.t)}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000); return; }
        if (k === 'menu') { saveGame(gid, G, true); startScreen(); return; }
        if (k === 'tab') { tab = b.dataset.v; drawTop(); drawSide(); const sb = dlg.querySelector('[data-bk-side]'); if (sb) sb.scrollTop = 0; return; }
        if (k === 'power') { G.powerOn = !G.powerOn; if (!G.powerOn) G.power = false; drawAll(); return; }
        if (k === 'digpanel') { tab = 'gens'; drawTop(); drawSide(); toast('Choisis « ⛏️ Creuser » comme travail pour un ou plusieurs habitants.'); return; }
        if (k === 'sendfrom') { tab = 'ville'; drawTop(); drawSide(); const sel = () => dlg.querySelector('[data-bk-sendwho]'); if (sel()) sel().value = b.dataset.id; else toast('Choisis un lieu sur la carte.'); sendFor = b.dataset.id; return; }
        if (k === 'place') { placeSel = b.dataset.id; if (!route.length) route = [{id: placeSel, take: null}]; drawSide(); const sel = dlg.querySelector('[data-bk-sendwho]'); if (sel && sendFor && [...sel.options].some(o => o.value === sendFor)) sel.value = sendFor; return; }
        if (k === 'send') { const who = dlg.querySelector('[data-bk-sendwho]')?.value; const r = B().send(G, who, route.length ? route : [placeSel]); if (!r.ok) { toast(r.err, 'error'); return; } sendFor = ''; route = []; drawAll(); return; }
        if (k === 'routeadd') { if (route.length < 6 && !route.some(st => st.id === b.dataset.id)) route.push({id: b.dataset.id, take: null}); drawSide(); return; }
        if (k === 'routedel') { route = route.filter(st => st.id !== b.dataset.id); drawSide(); return; }
        if (k === 'routeup') { const i = Number(b.dataset.i); if (i > 0) [route[i - 1], route[i]] = [route[i], route[i - 1]]; drawSide(); return; }
        if (k === 'routeclear') { route = []; drawSide(); return; }
        if (k === 'take') { const st = route.find(x => x.id === b.dataset.id); if (!st) return; const v = b.dataset.v; if (!v) st.take = null; else { const l = new Set(st.take || []); if (l.has(v)) l.delete(v); else l.add(v); st.take = l.size ? [...l] : null; } drawSide(); return; }
        if (k === 'need') { const r = B().orderNeed(G, b.dataset.id, b.dataset.v); if (!r.ok) toast(r.err, 'error'); drawAll(); return; }
        if (k === 'recy') { const r = B().recycle(G, b.dataset.k); if (!r.ok) toast(r.err, 'error'); drawAll(); return; }
        if (k === 'recyall') { while (B().recycle(G, b.dataset.k).ok); drawAll(); return; }
        if (k === 'planf') { planF = b.dataset.v; drawSide(); return; }
        if (k === 'visit') { const r = B().answerVisit(G, b.dataset.v); if (!r.ok) toast(r.err, 'error'); drawAll(); return; }
        if (k === 'gazette') { const gz = dlg.querySelector('[data-bk-gz]'); if (!gz) return; gz.innerHTML = gazetteHtml(); gz.hidden = false; if (G.speed) { gzPaused = G.speed; setSpeed(0); } gz.querySelector('[data-bk="gzclose"]')?.focus(); return; }
        if (k === 'gzclose') { const gz = dlg.querySelector('[data-bk-gz]'); if (gz) gz.hidden = true; if (gzPaused && !G.over) setSpeed(gzPaused); gzPaused = 0; return; }
        if (k === 'gzprint') { const w = window.open('', '_blank'); if (!w) { toast('La fenêtre d’impression a été bloquée.', 'error'); return; } w.document.write(`<!doctype html><meta charset="utf-8"><title>La Gazette du Bunker</title><style>body{font:15px Georgia,serif;margin:24px;color:#111}h2{font:900 40px Georgia,serif;text-align:center;margin:4px 0;border-top:3px double #111;border-bottom:3px double #111}.bk-gz-mast{text-align:center}.bk-gz-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}h3{text-align:center;font-size:22px}h4{border-bottom:1px solid #111;margin:12px 0 6px}button{display:none}blockquote{font-style:italic;margin:6px 0 6px 10px}</style>${gazetteHtml()}`); w.document.close(); w.focus(); w.print(); return; }
        if (k === 'recall') { if (!B().recall(G, b.dataset.id)) toast('La radio ne passe pas (pas d’électricité ?).', 'error'); drawAll(); return; }
        if (k === 'diff') { B().setDiff(G, b.dataset.v); drawAll(); return; }
        if (k === 'trade') { const r = B().trade(G, b.dataset.id); if (!r.ok) toast(r.err, 'error'); drawAll(); return; }
        if (k === 'diary') { diaryOf = b.dataset.id || ''; tab = 'gens'; drawTop(); drawSide(); const sb = dlg.querySelector('[data-bk-side]'); if (sb) sb.scrollTop = 0; return; }
        if (k === 'tutoskip') { B().setOpt(G, 'tuto', false); drawAll(); return; }
        if (k === 'unbuild') { B().cancelBuild(G, Number(b.dataset.i)); drawAll(); return; }
        if (k === 'build') { const spot = firstFree(); if (!spot) { toast('Plus de place libre : creuse un étage (⛏️).', 'error'); return; } order(b.dataset.k, ...spot); return; }
        if (k === 'slot') { slotMenu(b, Number(b.dataset.f), Number(b.dataset.s)); }
    }
    let sendFor = '', gzPaused = 0;
    function onChange(e) {
        const j = e.target.closest('[data-bk-job]'); if (j && G) { B().setJob(G, j.dataset.bkJob, j.value); drawAll(); return; }
        const op = e.target.closest('[data-bk-opt]'); if (op && G) { B().setOpt(G, op.dataset.bkOpt, op.checked); drawAll(); return; }
        const sw = e.target.closest('[data-bk-sendwho]'); if (sw && G) { sendFor = sw.value; drawSide(); return; }
        const qi = e.target.closest('[data-bk-qty]'); if (qi && G) { const st = route.find(x => x.id === qi.dataset.id); if (st) { const n = Math.round(Number(qi.value)); st.qty = {...(st.qty || {})}; if (n > 0) st.qty[qi.dataset.bkQty] = Math.min(999, n); else delete st.qty[qi.dataset.bkQty]; if (!Object.keys(st.qty).length) delete st.qty; } drawSide(); return; }
        const au = e.target.closest('[data-bk-auto]'); if (au && G) { B().setAuto(G, au.value, au.dataset.bkAuto || null); drawAll(); return; }
        const ar = e.target.closest('[data-bk-autorecy]'); if (ar && G) { G.autoRecy = ar.checked; if (ar.checked && !G.people.some(p => p.hp > 0 && p.where === 'base' && p.job === 'recycler')) { const f = G.people.find(p => p.hp > 0 && p.where === 'base' && !p.baby && p.job === 'libre'); if (f) f.job = 'recycler'; } drawAll(); return; }
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
            if (k === 'generateur' && !G.broken?.[`${fi},${si}`]) { tab = 'res'; drawTop(); drawSide(); return; }
            const key = `${fi},${si}`, L = G.lvl?.[key] || 1, brk = !!G.broken?.[key], busyB = bi >= 0, txt = c => Object.entries(c).map(([r, q]) => `${q} ${resName(r)[2].toLowerCase()}`).join(', ');
            const run = f => () => { const r = f(G, fi, si); if (!r.ok) toast(r.err, 'error'); drawAll(); };
            items = [{icon: it.ico, label: `${it.name}${L > 1 ? ` · niveau ${L}` : ''}${brk ? ' · EN PANNE' : ''}`, help: it.desc, disabled: true}, '-',
                ...(brk ? [{icon: '🔧', label: busyB ? 'Réparation commandée' : 'Réparer', help: txt(B().repairCost(k)), disabled: busyB, run: run(B().orderRepair)}] : []),
                ...(B().upgradable(k) && L < 3 && !brk ? [{icon: '⬆️', label: busyB ? 'Amélioration commandée' : `Améliorer (niveau ${L + 1})`, help: `effets ×${L === 1 ? '1,5' : '2'} · ${txt(B().upgradeCost(k, L + 1))}`, disabled: busyB, run: run(B().orderUpgrade)}] : []),
                ...(busyB ? [{icon: '×', label: 'Annuler la commande', help: 'les matériaux reviennent', run: () => { B().cancelBuild(G, bi); drawAll(); }}] : []),
                {icon: '🪓', label: 'Démonter', help: brk ? 'en panne : on récupère un tiers des matériaux' : 'on récupère la moitié des matériaux', run: () => { B().dismantle(G, fi, si); drawAll(); }}];
        } else if (bi >= 0) items = [{icon: '×', label: `Annuler « ${IT[G.builds[bi].k].name} »`, help: 'les matériaux reviennent', run: () => { B().cancelBuild(G, bi); drawAll(); }}];
        else items = G.plans.filter(p => G.opt?.chaines || !IT[p].chain).map(p => { const it = IT[p], miss = Object.entries(it.cost || {}).some(([r, n]) => (G.res[r] || 0) < n) || (it.tool && !G.tools.includes(it.tool));
            const n = needOf(p); return {icon: it.ico, label: it.name, help: miss ? `il manque : ${[...n.miss.map(([r, q, h]) => `${q - h} ${resName(r)[2].toLowerCase()}`), ...(n.tool ? [B().TOOLS[n.tool][1]] : [])].join(', ')}` : Object.entries(it.cost || {}).map(([r, q]) => `${q} ${resName(r)[2].toLowerCase()}`).join(', ') + (it.tool ? ` · ${B().TOOLS[it.tool][1]}` : ''), disabled: miss, run: () => order(p, fi, si)}; }).sort((x, y) => x.disabled - y.disabled);
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
