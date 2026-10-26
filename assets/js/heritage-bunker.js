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
        G = B().newGame({me: meId ? who(meId) : {name: form.elements.bk_me_txt?.value || 'Moi'}, team: teamIds.map(who), city: {name: city, size: form.elements.bk_size.value}, coffre, season0, ...more});
        await locateCity(G.city);
        gid = 'b' + Date.now().toString(36); saveGame(gid, G, true); tab = 'gens'; placeSel = null; play();
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
            <p class="bk-news" data-bk-news aria-live="polite"></p><div class="bk-visit" data-bk-visit hidden></div>
            <div class="bk-main"><section class="bk-world" data-bk-world></section><aside class="bk-side"><div class="segmented bk-tabs" role="tablist">${[['gens', '👥 Habitants'], ['res', '📦 Réserves'], ['atelier', '🛠️ Atelier'], ['ville', '🗺️ Ville'], ['famille', '🌳 Famille'], ['radio', '📻 Radio']].map(([k, l]) => `<button type="button" role="tab" data-bk="tab" data-v="${k}">${l}</button>`).join('')}</div><div class="bk-sbody" data-bk-side></div></aside></div><div class="bk-gz" data-bk-gz hidden></div></div>`;
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
        dlg.querySelector('[data-bk-state]').innerHTML = `<span title="${S[2]}${G.cold ? ' : il fait froid dans le bunker' : ''}">${S[1]}${G.cold ? '🥶' : ''}</span> <span title="${night ? 'Nuit' : 'Jour'}">${G.weather.rain ? '🌧️' : night ? '🌙' : '☀️'}</span> <span class="${G.power ? 'is-on' : 'is-off'}" title="${G.power ? `Électricité (${src})` : 'Pas d’électricité'}">${G.power ? ({soleil: '☀️⚡', vent: '🌬️⚡', pedales: '🚲⚡'}[G.powerSrc] || '⚡') : '🔌'}</span>${G.air < 30 ? ' <span title="L’air est lourd">🌀</span>' : ''}`;
        drawVisit();
        dlg.querySelectorAll('[data-bk="speed"]').forEach(b => { const on = Number(b.dataset.v) === G.speed; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); });
        dlg.querySelectorAll('[data-bk="tab"]').forEach(b => { const on = b.dataset.v === tab; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on); });
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
                if (it) return `<button type="button" class="bk-slot is-item${!G.power && ['radio', 'atelier', 'douche', 'potager', 'phono'].includes(k) ? ' is-dark' : ''}" data-bk="slot" data-f="${fi}" data-s="${si}" title="${esc(it.name)} — ${esc(it.desc)}"><span class="bk-ico">${it.ico}</span><span class="bk-name">${esc(it.name)}</span><span class="bk-who">${who.map(pawn).join('')}</span></button>`;
                if (bd) return `<button type="button" class="bk-slot is-building" data-bk="slot" data-f="${fi}" data-s="${si}" title="En construction : ${esc(B().ITEMS[bd.b.k].name)}"><span class="bk-ico">${B().ITEMS[bd.b.k].ico}</span><span class="bk-name">${esc(B().ITEMS[bd.b.k].name)}</span><span class="bk-bar"><i style="width:${Math.round(100 * (1 - bd.b.left / B().ITEMS[bd.b.k].h))}%"></i></span></button>`;
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
        const keep = s.scrollTop;
        s.innerHTML = tab === 'gens' ? sideGens() : tab === 'res' ? sideRes() : tab === 'atelier' ? sideAtelier() : tab === 'ville' ? sideVille() : tab === 'famille' ? sideFamille() : sideRadio();
        s.scrollTop = keep;
    }
    function sideGens() {
        return G.people.map(p => {
            const out = p.where === 'dehors', pl = out && G.city.places.find(x => x.id === p.exp?.place);
            const status = p.hp <= 0 ? '☠️ mort·e' : out ? `🚶 ${p.exp.phase === 'aller' ? 'en route vers' : p.exp.phase === 'fouille' ? 'fouille' : 'rentre de'} ${esc(pl?.name || '')}` : esc(pawn(p).match(/title="[^:]*: ([^"]*)"/)?.[1] || '');
            const skills = B().SKILLS.filter(([k]) => (p.sk?.[k] || 1) > 1).map(([k, ico, l]) => `<span class="bk-chip" title="${esc(l)} : ${Math.round(((p.sk[k] || 1) - 1) * 100)} % de mieux">${ico} ${esc(l)}</span>`).join('');
            const ties = [...(p.spouses || []).map(id => ['💞', id]), ...(p.kin || []).map(id => ['👪', id])].map(([ico, id]) => { const o = G.people.find(x => x.id === id); return o ? `<span class="bk-chip" title="${ico === '💞' ? 'En couple' : 'De la même famille'} : le moral tient mieux quand on est ensemble">${ico} ${esc(o.name.split(' ')[0])}</span>` : ''; }).join('');
            const feud = G.feud?.includes(p.id) ? (() => { const o = G.people.find(x => x.id === G.feud.find(i => i !== p.id)); return o ? `<span class="bk-chip is-bad" title="Une vieille brouille de famille">⚡ ${esc(o.name.split(' ')[0])}</span>` : ''; })() : '';
            const jobs = [['libre', 'Rien de spécial'], ['creuser', '⛏️ Creuser'], ['construire', '🔨 Construire'], ['garde', '🛡️ Monter la garde'], ...(B().has(G, 'dynamo') ? [['pedaler', '🚲 Pédaler (électricité)']] : [])];
            return `<div class="bk-person${p.hp <= 0 ? ' is-dead' : ''}"><div class="bk-p-head">${pawn(p)}<div><b>${esc(p.name)}${p.me ? ' <small>(toi)</small>' : ''}${p.baby ? ' <small>(bébé)</small>' : ''}</b><small>${status}${p.ill && p.hp > 0 ? ` · ${p.ill.k === 'fievre' ? '🤒 fièvre' : '🩹 blessure'}${p.ill.treated ? ' (soignée)' : ''}` : ''}</small>${p.from ? `<small class="muted">${esc(p.from)}</small>` : ''}</div></div>
                ${skills || ties || feud ? `<div class="bk-chips">${skills}${ties}${feud}</div>` : ''}
                <div class="bk-needs"><span>❤️ Vie</span>${bar(p.hp, 'is-hp')}<span>😊 Moral</span>${bar(p.mood ?? 70, 'is-mood')}${B().NEEDS.map(([k, ico, l]) => `<span>${ico} ${l}</span>${bar(p.needs[k])}`).join('')}</div>
                ${p.hp > 0 && !out && !p.baby ? `<div class="bk-p-actions"><label>Travail <select data-bk-job="${esc(p.id)}">${jobs.map(([v, l]) => `<option value="${v}" ${p.job === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><button type="button" class="button small secondary" data-bk="sendfrom" data-id="${esc(p.id)}">🚶 Envoyer en ville</button></div>` : ''}${p.sulk ? '<p class="ui-notice is-error">😞 Plus de moral : refuse de travailler (jeux, musique, histoires du soir…).</p>' : ''}</div>`;
        }).join('');
    }
    function sideRes() {
        return `<h4>Réserves</h4><div class="bk-res">${B().RES.map(([r, ico, l, u]) => { const c = B().cap(G, r); return `<span>${ico} ${l}</span><b>${Math.floor(G.res[r])}${u ? ' ' + u : ''} <small>/ ${c}</small></b>${bar(100 * G.res[r] / c)}`; }).join('')}</div>
            <p class="muted">Plus de place : étagères, stockage, garde-manger, citerne, cuves. L’eau de pluie passe au ⚗️ filtre avant d’être bue (sinon : risque de fièvre).</p>
            ${B().has(G, 'filtre') ? `<p>${G.filterClog ? '⚗️ <b>Filtre encrassé</b> : il faut 1 tissu.' : `⚗️ Filtre : ${Math.round(G.filterUse)} / 30 L avant de le nettoyer (1 tissu).`}</p>` : ''}
            <h4>Air</h4><div class="bk-res"><span>🌀 Conduit d’aération</span><b>${Math.round(G.air)} %</b>${bar(G.air)}</div><p class="muted">Il s’encrasse, plus vite quand on est nombreux ; quelqu’un de libre le nettoie. Air lourd : on dort mal, le moral baisse.</p>
            <h4>Saison</h4><p>${(S => `${S[1]} ${S[2]}`)(B().SEASONS.find(x => x[0] === B().seasonOf(G)))} · une saison dure ${B().SEASON_DAYS} jours. ${B().seasonOf(G) === 'hiver' ? (G.cold ? '🥶 Il fait froid : il faut un poêle à bois (et du bois).' : '🔥 Le poêle chauffe le bunker.') : B().seasonOf(G) === 'ete' ? 'Il pleut moins, on a plus soif.' : B().seasonOf(G) === 'printemps' ? 'Il pleut plus souvent.' : ''}</p>
            <h4>Électricité</h4><p>${G.power ? ({soleil: '☀️ Le panneau solaire', vent: '🌬️ L’éolienne', pedales: '🚲 La dynamo à pédales'}[G.powerSrc] || '⚡ Le groupe électrogène') + ' donne le courant' : G.powerOn ? '🔌 Plus d’essence : pas d’électricité' : '🔌 Groupe électrogène éteint'} — le groupe brûle ${B().has(G, 'econome') ? '⅛' : '¼'} L d’essence par heure, seulement quand rien d’autre ne donne de courant.</p>
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
        if (k === 'visit') { const r = B().answerVisit(G, b.dataset.v); if (!r.ok) toast(r.err, 'error'); drawAll(); return; }
        if (k === 'gazette') { const gz = dlg.querySelector('[data-bk-gz]'); if (!gz) return; gz.innerHTML = gazetteHtml(); gz.hidden = false; if (G.speed) { gzPaused = G.speed; setSpeed(0); } gz.querySelector('[data-bk="gzclose"]')?.focus(); return; }
        if (k === 'gzclose') { const gz = dlg.querySelector('[data-bk-gz]'); if (gz) gz.hidden = true; if (gzPaused && !G.over) setSpeed(gzPaused); gzPaused = 0; return; }
        if (k === 'gzprint') { const w = window.open('', '_blank'); if (!w) { toast('La fenêtre d’impression a été bloquée.', 'error'); return; } w.document.write(`<!doctype html><meta charset="utf-8"><title>La Gazette du Bunker</title><style>body{font:15px Georgia,serif;margin:24px;color:#111}h2{font:900 40px Georgia,serif;text-align:center;margin:4px 0;border-top:3px double #111;border-bottom:3px double #111}.bk-gz-mast{text-align:center}.bk-gz-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}h3{text-align:center;font-size:22px}h4{border-bottom:1px solid #111;margin:12px 0 6px}button{display:none}blockquote{font-style:italic;margin:6px 0 6px 10px}</style>${gazetteHtml()}`); w.document.close(); w.focus(); w.print(); return; }
        if (k === 'recall') { if (!B().recall(G, b.dataset.id)) toast('La radio ne passe pas (pas d’électricité ?).', 'error'); drawAll(); return; }
        if (k === 'unbuild') { B().cancelBuild(G, Number(b.dataset.i)); drawAll(); return; }
        if (k === 'build') { const spot = firstFree(); if (!spot) { toast('Plus de place libre : creuse un étage (⛏️).', 'error'); return; } order(b.dataset.k, ...spot); return; }
        if (k === 'slot') { slotMenu(b, Number(b.dataset.f), Number(b.dataset.s)); }
    }
    let sendFor = '', gzPaused = 0;
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
