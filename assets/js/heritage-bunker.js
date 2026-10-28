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
    let moveFrom = null, dragging = false;
    let dlg = null, G = null, gid = '', tab = 'gens', placeSel = null, timer = 0, acc = 0, lastTick = 0, lastSaveHour = -1;
    function open() {
        if (!B()) { toast('Le bunker n’a pas pu se charger.', 'error'); return; }
        dlg?.remove();
        dlg = document.createElement('dialog'); dlg.className = 'bk-dlg'; dlg.setAttribute('aria-label', 'Le bunker'); dlg.dataset.ownClose = '1'; // la partie s'enregistre en fermant : pas de « Fermer sans enregistrer ? »
        document.body.append(dlg);
        dlg.addEventListener('cancel', e => { if (moveFrom || mapFull) { e.preventDefault(); e.stopPropagation(); if (moveFrom) { moveFrom = null; drawWorld(); } else { mapFull = false; drawSide(); } } }); // Échap : d'abord sortir du déplacement ou de la grande carte
        dlg.addEventListener('dragstart', e => { const sl = e.target.closest?.('[data-bk="slot"][draggable]'); if (!sl || !G) return; moveFrom = [Number(sl.dataset.f), Number(sl.dataset.s)]; dragging = true; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'bk'); sl.classList.add('is-movesrc'); });
        dlg.addEventListener('dragover', e => { if (dragging && e.target.closest?.('[data-bk="slot"]')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
        dlg.addEventListener('drop', e => { const sl = e.target.closest?.('[data-bk="slot"]'); if (!dragging || !sl) return; e.preventDefault(); dragging = false; moveTo(Number(sl.dataset.f), Number(sl.dataset.s)); });
        dlg.addEventListener('dragend', () => { if (!dragging) return; dragging = false; moveFrom = null; drawWorld(); });
        dlg.addEventListener('close', () => { if (document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => {}); moveFrom = null; dragging = false; mapFull = false; stop(); SND.stop(); if (G && gid) saveGame(gid, G, true); G = null; dlg?.remove(); dlg = null; });
        dlg.addEventListener('click', onClick); dlg.addEventListener('change', onChange); dlg.addEventListener('pointerdown', () => { if (!G || !SND.pref.on) return; const first = !SND.ready(); SND.unlock(); if (first) SND.reset(G); SND.update(G); });
        dlg.addEventListener('mousemove', chartHover); dlg.addEventListener('mouseout', e => { if (!e.relatedTarget || !e.relatedTarget.closest?.('svg[data-bk-chart]')) chartLeave(e); });
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
                <div class="bk-field"><span class="pk-lab">🧳 Le coffre de famille <small class="muted">(3 objets de ta base au plus : chacun donne un petit avantage)</small></span><div class="bk-coffre" data-bk-coffre>${window.LCNDA_UI.spinner('Lecture des objets de famille…')}</div></div>
                <div class="bk-field"><span class="pk-lab">Taille de la ville</span><div class="segmented bk-size" role="radiogroup">${Object.entries(B().SIZES).map(([k, [n, nb, l]]) => `<label><input type="radio" name="bk_size" value="${k}" ${k === 'moyenne' ? 'checked' : ''}><span>${l} <small>${nb} lieux</small></span></label>`).join('')}</div></div>
                <details class="bk-field bk-setup" open><summary class="pk-lab">⚙️ Réglages de la partie</summary>
                    <div class="bk-field"><span class="pk-lab">Difficulté</span><div class="segmented bk-size" role="radiogroup">${Object.entries(B().DIFFS).map(([k, d]) => `<label><input type="radio" name="bk_diff" value="${k}" ${k === 'normal' ? 'checked' : ''}><span>${esc(d.l)}</span></label>`).join('')}</div></div>
                    <div class="bk-field"><span class="pk-lab">Scénario</span><select name="bk_scen">${Object.entries(B().SCENARIOS).map(([k, [ico, l, d]]) => `<option value="${k}" title="${esc(d)}">${ico} ${esc(l)} — ${esc(d)}</option>`).join('')}</select></div>
                    <label class="checkbox-line"><input type="checkbox" name="bk_meteo" checked> 🌪️ Météo et catastrophes <small class="muted">(canicule, tempête, inondation, séisme, orage, vague de froid : des installations à réparer)</small></label>
                    <label class="checkbox-line"><input type="checkbox" name="bk_chaines"> 🧵 Chaînes de fabrication <small class="muted">(plantes → fil → tissu → vêtements chauds ; blé → farine → pain)</small></label>
                    <label class="checkbox-line"><input type="checkbox" name="bk_age"> 🧓 Vieillir <small class="muted">(un jour = un an : les bébés grandissent, les aînés ralentissent)</small></label>
                    <label class="checkbox-line"><input type="checkbox" name="bk_feu"> 🔥 Incendies <small class="muted">(un poêle, un court-circuit… un extincteur sauve tout)</small></label>
                    <label class="checkbox-line"><input type="checkbox" name="bk_nuit"> 🌗 La nuit en ville <small class="muted">(certains lieux sont dangereux la nuit, d’autres cachent plus de choses)</small></label>
                    <label class="checkbox-line"><input type="checkbox" name="bk_missions" checked> 📜 Missions généalogiques <small class="muted">(retrouver l’acte, la photo ou la lettre d’un vrai ancêtre de ton arbre)</small></label>
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
            : A().emptyState({size: 'small', icon: '🧳', text: 'Aucun objet de famille dans ta base (Listes › Objets de famille) : le coffre partira vide.'});
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
        const setup = {diff: form.elements.bk_diff?.value || 'normal', scen: form.elements.bk_scen?.value || 'classique', opt: Object.fromEntries(B().OPT_KEYS.map(k => [k, !!form.elements['bk_' + k]?.checked]))};
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
            // 📜 les ancêtres des missions : de vraies fiches (nom, naissance, lieu, métier) ; rien n'est jamais écrit dans l'arbre
            const married = id => (tr.families || []).some(f => f.a === id || f.b === id);
            out.ancestors = tr.people.filter(p => !p.living).sort(() => Math.random() - 0.5).slice(0, 30).map(p => ({pid: p.id, name: nameOf(p), by: p.by || 0, bplace: p.bplace && tr.places[p.bplace] ? String(tr.places[p.bplace].name).split(',')[0] : '', occ: p.occ || '', married: married(p.id), dy: p.dy || 0}));
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
            out.push(`<img src="${esc(A().mapTileUrl('color', z, ((tx % N) + N) % N, ty))}" alt="" draggable="false" style="left:${(tx - x0) / W * 100}%;top:${(ty - y0) / W * 100}%;width:${100 / W}%;height:${100 / W}%">`);
        }
        return `<div class="bk-map-bg" aria-hidden="true" data-key="${z}:${x0.toFixed(4)}:${y0.toFixed(4)}">${out.join('')}</div><span class="bk-map-credit">© OpenStreetMap</span>`;
    }

    /* ═════════ La partie ═════════ */
    function play() {
        moveFrom = null; dragging = false; mapFull = false;
        lastSaveHour = Math.floor(G.t / 360);
        dlg.innerHTML = `<div class="bk-game">
            <header class="bk-top"><b class="bk-title">☢ Le bunker de ${esc(meOf(G).name)}</b><span class="bk-clock" data-bk-clock></span><span class="bk-state" data-bk-state></span><span class="spacer"></span>
                <div class="segmented bk-speed" role="group" aria-label="Vitesse">${[[0, '⏸', 'Pause (Espace)'], [1, '×1', '1 heure de jeu en 6 secondes'], [2, '×2', 'Deux fois plus vite'], [4, '×4', 'Quatre fois plus vite']].map(([v, l, t]) => `<button type="button" data-bk="speed" data-v="${v}" title="${t}">${l}</button>`).join('')}</div>
                <button type="button" class="icon-button small" data-bk="full" data-bk-full title="Plein écran" aria-label="Plein écran" aria-pressed="false">⛶</button><button type="button" class="icon-button small" data-bk="mute" data-bk-mute title="Couper ou remettre le son" aria-label="Son">🔊</button><button type="button" class="button small secondary" data-bk="gazette" title="Le journal de la partie">📰 Gazette</button><button type="button" class="button small secondary" data-bk="book" title="Le récit de la partie, jour après jour">📖 Livre</button><button type="button" class="button small" data-bk="save" data-shortcut="⌘S">💾 Enregistrer</button><button type="button" class="button small secondary" data-bk="export" title="Garder la partie dans un fichier">⤓ Exporter</button><button type="button" class="button small secondary" data-bk="menu">↩ Parties</button><button type="button" class="icon-button" data-bk="close" aria-label="Fermer">×</button></header>
            <p class="bk-news" data-bk-news aria-live="polite"></p><div class="bk-tuto" data-bk-tuto hidden></div><div class="bk-visit" data-bk-visit hidden></div>
            <div class="bk-main"><section class="bk-world" data-bk-world></section><aside class="bk-side"><div class="segmented bk-tabs" role="tablist">${[['gens', '👥 Habitants'], ['res', '📦 Réserves'], ['atelier', '🛠️ Atelier'], ['bric', '♻️ Bric-à-brac'], ['ville', '🗺️ Ville'], ['famille', '🌳 Famille'], ['radio', '📻 Radio'], ['stats', '📊 Stats'], ['regl', '⚙️ Réglages']].map(([k, l]) => `<button type="button" role="tab" data-bk="tab" data-v="${k}">${l}</button>`).join('')}</div><div class="bk-sbody" data-bk-side></div></aside></div><div class="bk-gz" data-bk-gz hidden></div></div>`;
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
        try { while (acc >= 10 && n < 40) { B().step(G); acc -= 10; n++; } }
        catch (err) { stop(); console.error(err); toast('La partie s’est arrêtée sur une erreur (fichier abîmé ?).', 'error'); return; }
        if (!n) return;
        if (Math.floor(G.t / 360) !== lastSaveHour) { lastSaveHour = Math.floor(G.t / 360); saveGame(gid, G, true); } // toutes les 6 h de jeu
        drawAll(true); SND.update(G); SND.events(G);
    }
    function setSpeed(v) { if (!G) return; G.speed = v; drawTop(); }
    let hoverChart = false; // la souris sur une courbe : on ne redessine pas le panneau sous elle
    const busy = () => { const a = document.activeElement; return hoverChart || !!(a && dlg?.contains(a) && a.closest('[data-bk-side]') && a.matches('select, input, textarea')) || !!document.querySelector('.ui-menu, .lc-menu-pop'); };
    function drawAll(fromTick = false) { drawTop(); drawWorld(); if (!fromTick || !busy()) drawSide(); const mu = dlg?.querySelector('[data-bk-mute]'); if (mu) { mu.textContent = SND.pref.on ? '🔊' : '🔇'; mu.setAttribute('aria-pressed', String(!SND.pref.on)); } }

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
        const w = dlg.querySelector('[data-bk-world]'); if (!w || dragging) return; // pendant un glisser-déposer, on ne redessine pas sous la souris
        const [s1, s2] = sky(G.t), h = (G.t / 60) % 24, sunX = ((h - 6) / 14) * 100, night = B().isNight(G.t);
        const base = B().alive(G).filter(p => p.where === 'base'), out = B().alive(G).filter(p => p.where === 'dehors');
        const at = new Map(); base.forEach(p => { const k = p.act?.at ? p.act.at.join() : p.doing === 'construire' ? atelierAt() : p.doing === 'creuser' ? 'dig' : 'hall'; if (!at.has(k)) at.set(k, []); at.get(k).push(p); });
        const building = new Map(G.builds.map((b, i) => [`${b.fi},${b.si}`, {b, i}]));
        w.innerHTML = `<div class="bk-sky${G.weather.rain ? ' is-rain' : ''}${night ? ' is-night' : ''}${B().seasonOf(G) === 'hiver' ? ' is-winter' : ''}" style="--s1:${s1};--s2:${s2}">
                ${h >= 6 && h < 20 ? `<span class="bk-sun" style="left:${Math.max(4, Math.min(92, sunX))}%"></span>` : `<span class="bk-moon"></span>`}
                <span class="bk-skyline" aria-hidden="true"></span><span class="bk-out">${out.map(p => pawn(p)).join('')}${out.length ? `<small>${plural(out.length, 'parti', 'partis')} en ville</small>` : ''}</span>
                <span class="bk-ground"><span class="bk-trap${G.visit ? ' is-knock' : ''}" title="${G.visit ? 'Quelqu’un frappe à la trappe !' : 'La trappe'}">${G.visit ? '🔔' : '▦'}</span></span></div>
            <div class="bk-floors${moveFrom ? ' is-moving' : ''}">${moveFrom ? '<p class="bk-movehint">↔ Clique sur la place où le mettre (une place prise : les deux s’échangent) · <button type="button" class="link-button" data-bk="movecancel">Annuler</button></p>' : ''}${G.floors.map((f, fi) => `<div class="bk-floor${G.fire?.fi === fi ? ' is-fire' : ''}"><span class="bk-flabel">−${fi + 1}${G.fire?.fi === fi ? '<i title="Le feu !">🔥</i>' : ''}${(G.deco?.[fi] || []).length ? `<span class="bk-deco" title="${esc(G.deco[fi].map(d => B().DECOS[d.k][1] + (d.name ? ` de ${d.name}` : '')).join(', '))}">${G.deco[fi].map(d => B().DECOS[d.k][0]).join('')}</span>` : ''}</span><div class="bk-slots">${f.slots.map((k, si) => {
                const it = k && B().ITEMS[k], bd = building.get(`${fi},${si}`), who = at.get(`${fi},${si}`) || [];
                const key = `${fi},${si}`, brk = !!G.broken?.[key], L = G.lvl?.[key] || 1, wk = bd && (bd.b.rep || bd.b.up);
                const mv = moveFrom && moveFrom[0] === fi && moveFrom[1] === si ? ' is-movesrc' : '';
                if (it) return `<button type="button" draggable="true" class="bk-slot is-item${mv}${!G.power && (['radio', 'atelier', 'douche', 'potager'].includes(k) || it.power) ? ' is-dark' : ''}${brk ? ' is-broken' : ''}" data-bk="slot" data-f="${fi}" data-s="${si}" title="${esc(it.name)}${L > 1 ? ` (niveau ${L})` : ''}${brk ? ' — EN PANNE : clique pour réparer' : ''} — ${esc(it.desc)}"><span class="bk-ico">${it.ico}</span><span class="bk-name">${esc(it.name)}</span>${L > 1 ? `<span class="bk-lvl">${'★'.repeat(L)}</span>` : ''}${brk ? '<span class="bk-brk" aria-label="En panne">🔧</span>' : ''}${wk ? `<span class="bk-bar"><i style="width:${Math.round(100 * (1 - bd.b.left / (bd.b.tot || 1)))}%"></i></span>` : ''}<span class="bk-who">${who.map(pawn).join('')}</span></button>`;
                if (bd) return `<button type="button" draggable="true" class="bk-slot is-building${mv}" data-bk="slot" data-f="${fi}" data-s="${si}" title="En construction : ${esc(B().ITEMS[bd.b.k].name)}"><span class="bk-ico">${B().ITEMS[bd.b.k].ico}</span><span class="bk-name">${esc(B().ITEMS[bd.b.k].name)}</span><span class="bk-bar"><i style="width:${Math.round(100 * (1 - bd.b.left / (bd.b.tot || B().ITEMS[bd.b.k].h)))}%"></i></span></button>`;
                return `<button type="button" class="bk-slot is-empty" data-bk="slot" data-f="${fi}" data-s="${si}" title="${moveFrom ? 'Poser ici (sans frais)' : 'Place libre : construire ici'}">＋</button>`;
            }).join('')}</div>${fi === 0 ? `<div class="bk-hall" title="Ceux qui attendent">${(at.get('hall') || []).map(pawn).join('')}${(G.pets || []).map(a => `<span class="bk-pet" title="${esc(a.name)}">${B().PETS[a.k][0]}</span>`).join('')}</div>` : ''}</div>`).join('')}
            ${G.floors.length < B().MAX_FLOORS ? `<button type="button" class="bk-dig" data-bk="digpanel" title="Choisir qui creuse"><span>⛏️ ${G.dig.done > 0 ? 'Étage en cours de creusement' : 'Creuser un étage'}</span><span class="bk-bar"><i style="width:${Math.round(100 * G.dig.done / B().DIG_HOURS)}%"></i></span><span class="bk-who">${(at.get('dig') || []).map(pawn).join('')}</span></button>` : '<p class="muted bk-deep">Le bunker ne peut pas descendre plus bas.</p>'}</div>
            ${G.over ? `<div class="bk-over"><b>☠️ Plus personne en vie</b><p>Le bunker a tenu ${plural(B().dayOf(G.t) - 1, 'jour')}.</p><button type="button" class="button" data-bk="gazette">📰 Lire la gazette</button><button type="button" class="button secondary" data-bk="menu">↩ Revenir aux parties</button></div>` : ''}`;
    }
    const atelierAt = () => { const x = B().items(G).find(i => i.k === 'atelier'); return x ? `${x.fi},${x.si}` : 'hall'; };

    /* ── le panneau de droite ── */
    const bar = (v, cls = '') => `<span class="bk-bar ${cls}${v < 25 ? ' is-low' : ''}"><i style="width:${Math.round(v)}%"></i></span>`;
    const resName = r => B().RES.find(x => x[0] === r);
    const costTxt = cost => Object.entries(cost || {}).map(([r, n]) => `<span class="${(G.res[r] || 0) < n ? 'is-miss' : ''}">${resName(r)[1]} ${n}</span>`).join(' ');
    let lastSide = '';
    function drawSide() {
        const s = dlg.querySelector('[data-bk-side]'); if (!s) return;
        const keep = s.scrollTop, mw = s.querySelector('.bk-mapwrap.is-big'), mk = mw ? [mw.scrollLeft, mw.scrollTop] : mapScroll;
        const oldBg = s.querySelector('.bk-map-bg');
        const html = tab === 'gens' ? sideGens() : tab === 'res' ? sideRes() : tab === 'atelier' ? sideAtelier() : tab === 'bric' ? sideBric() : tab === 'ville' ? sideVille() : tab === 'famille' ? sideFamille() : tab === 'regl' ? sideRegl() : tab === 'stats' ? sideStats() : sideRadio();
        if (html === lastSide && s.childElementCount) return; // rien n'a changé : on ne redessine pas (la carte ne clignote plus)
        lastSide = html; s.innerHTML = html;
        // le plan de la ville déjà chargé est gardé tel quel (sinon ses tuiles se rechargent à chaque instant du jeu et la carte saute)
        const newBg = s.querySelector('.bk-map-bg'); if (oldBg && newBg && oldBg.dataset.key === newBg.dataset.key) newBg.replaceWith(oldBg);
        s.scrollTop = keep;
        // une grande carte garde où on en était ; la première fois, elle se centre sur le bunker
        const w2 = s.querySelector('.bk-mapwrap.is-big');
        if (w2) { if (mk) { w2.scrollLeft = mk[0]; w2.scrollTop = mk[1]; } else { const base = w2.querySelector('.is-base'); if (base) { w2.scrollLeft = base.offsetLeft - w2.clientWidth / 2 + 15; w2.scrollTop = base.offsetTop - w2.clientHeight / 2 + 15; } } mapScroll = [w2.scrollLeft, w2.scrollTop]; }
    }
    const AUTO_L = [['prudent', '🟢 Prudente (dès que la barre baisse)'], ['normal', '🟡 Normale'], ['manuel', '🔴 Manuelle (à la dernière minute ; je donne les ordres)']];
    function sideGens() {
        const dp = diaryOf && G.people.find(x => x.id === diaryOf); if (dp) return diaryHtml(dp);
        return `<div class="bk-autobar"><label>🧍 Autonomie de tout le monde <select data-bk-auto="">${AUTO_L.map(([v, l]) => `<option value="${v}" ${G.auto === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            ${petsHtml()}<small class="muted">Chacun va de soi-même boire, manger, aux toilettes, se laver ou dormir quand sa barre descend : 🟢 prudente = dès qu’elle passe sous la moitié, 🟡 normale = vers un tiers, 🔴 manuelle = seulement à la toute dernière minute (c’est vous qui donnez les ordres). Les boutons 💧🍞🚽🧼💤 de chacun donnent un ordre tout de suite.</small></div>` + G.people.map(p => {
            const out = p.where === 'dehors', pl = out && G.city.places.find(x => x.id === p.exp?.place);
            const status = p.hp <= 0 ? '☠️ mort·e' : out ? `🚶 ${p.exp.phase === 'aller' ? 'en route vers' : p.exp.phase === 'fouille' ? 'fouille' : 'rentre de'} ${esc(pl?.name || '')}` : esc(pawn(p).match(/title="[^:]*: ([^"]*)"/)?.[1] || '');
            const skills = B().SKILLS.filter(([k]) => (p.sk?.[k] || 1) > 1).map(([k, ico, l]) => `<span class="bk-chip" title="${esc(l)} : ${Math.round(((p.sk[k] || 1) - 1) * 100)} % de mieux">${ico} ${esc(l)}</span>`).join('');
            const ties = [...(p.spouses || []).map(id => ['💞', id]), ...(p.kin || []).map(id => ['👪', id])].map(([ico, id]) => { const o = G.people.find(x => x.id === id); return o ? `<span class="bk-chip" title="${ico === '💞' ? 'En couple' : 'De la même famille'} : le moral tient mieux quand on est ensemble">${ico} ${esc(o.name.split(' ')[0])}</span>` : ''; }).join('');
            const traits = (p.traits || []).map(k => B().TRAITS[k]).filter(Boolean).map(([ico, l, d]) => `<span class="bk-chip is-trait" title="${esc(d)}">${ico} ${esc(l)}</span>`).join('');
            const rel = G.people.filter(o => o !== p && o.hp > 0).map(o => [o, B().relOf(G, p, o)]).filter(([, v]) => Math.abs(v) >= 25).map(([o, v]) => `<span class="bk-chip${v < 0 ? ' is-bad' : ''}" title="${v > 0 ? 'Ami·e : le moral tient mieux ensemble' : 'Ne se supportent plus : ça mine le moral'}">${v > 0 ? '🤝' : '😠'} ${esc(o.name.split(' ')[0])}</span>`).join('');
            const xp = B().SKILLS.map(([k, ico, l]) => { const x = p.xp?.[k] || 0, cur = p.sk?.[k] || 1, need = 12 + 32 * (cur - 1); return x > 0.5 ? `<span class="bk-xp" title="${esc(l)} ×${cur.toFixed(1).replace('.', ',')} : ${Math.floor(x)} h / ${Math.round(need)} h de pratique avant le prochain progrès">${ico} ${Math.min(99, Math.round(100 * x / need))} %<i style="width:${Math.min(100, Math.round(100 * x / need))}%"></i></span>` : ''; }).join('');
            const feud = G.feud?.includes(p.id) ? (() => { const o = G.people.find(x => x.id === G.feud.find(i => i !== p.id)); return o ? `<span class="bk-chip is-bad" title="Une vieille brouille de famille">⚡ ${esc(o.name.split(' ')[0])}</span>` : ''; })() : '';
            const jobs = [['libre', 'Rien de spécial'], ['creuser', '⛏️ Creuser'], ['construire', '🔨 Construire'], ['recycler', '♻️ Démonter le bric-à-brac'], ['garde', '🛡️ Monter la garde'], ...(B().has(G, 'dynamo') ? [['pedaler', '🚲 Pédaler (électricité)']] : [])];
            return `<div class="bk-person${p.hp <= 0 ? ' is-dead' : ''}"><div class="bk-p-head">${pawn(p)}<div><b>${esc(p.name)}${p.me ? ' <small>(toi)</small>' : ''}${p.baby ? ' <small>(bébé)</small>' : p.child ? ' <small>(enfant)</small>' : ''}${G.opt?.age && p.age != null ? ` <small class="muted">${p.age} ans</small>` : ''}</b><small>${status}${p.ill && p.hp > 0 ? ` · ${p.ill.k === 'fievre' ? '🤒 fièvre' : '🩹 blessure'}${p.ill.treated ? ' (soignée)' : ''}` : ''}</small>${p.from ? `<small class="muted">${esc(p.from)}</small>` : ''}</div></div>
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
            <h4>🍲 La cuisine</h4>${kitchenHtml()}
            <h4>🐀 Nuisibles</h4><div class="bk-res"><span>${G.pests >= 50 ? '🪳 Invasion' : G.pests >= 10 ? '🐀 Des rats' : '✓ Presque rien'}</span><b>${Math.round(G.pests || 0)} %</b>${bar(G.pests || 0, 'is-bad')}</div><p class="muted">Ils viennent quand il y a de quoi manger. ${B().has(G, 'piegerats') ? '🪤 Pièges posés. ' : 'Des 🪤 pièges, '}${G.pets?.some(a => a.k === 'chat') ? '🐈 le chat chasse. ' : 'un 🐈 chat, '}${B().has(G, 'hermetique') ? '🫙 réserves fermées.' : 'des 🫙 bocaux hermétiques les arrêtent.'}</p>
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
            <h4>🎨 Décorer</h4>${decoHtml()}
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
    let locating = null, route = [], mapScroll = null, mapFull = false;
    /** 🚶 le parcours : les étapes dans l'ordre, et à chacune ce qu'on rapporte (vide = tout) */
    const roomHelp = k => { const R = B().ROOMS[k], K = R[3]; return `on y trouve : ${R[2].map(r => resName(r)?.[2]?.toLowerCase()).filter(Boolean).join(', ')}${K.plans ? ' · plus de plans' : ''}${K.tools ? ' · plus d’outils' : ''}${K.letters ? ' · plus de lettres' : ''}${K.docs ? ' · plus de documents' : ''}${K.risk ? ' · plus risqué' : ''}`; };
    function routeHtml(free) {
        if (!route.length) return '';
        const c = G.city, total = B().routeTime(G, route), pls = route.map(st => c.places.find(x => x.id === st.id));
        // pour chaque chose : la prendre ou pas, et combien au plus (vide = tout ce qu'il y a) ; ce qu'on a vu à la dernière visite
        const rooms = (st, pl) => { const l = B().KIND_ROOMS[pl.kind] || []; if (!l.length) return '';
            return `<small>Fouiller :</small><span class="bk-take" role="group" aria-label="Quelle pièce">${[['', '🏠 Tout le lieu (2 h)'], ...l.map(k => [k, `${B().ROOMS[k][0]} ${B().ROOMS[k][1]} (1 h)`])].map(([k, lab]) => `<button type="button" class="bk-chip${(st.room || '') === k ? ' is-on' : ''}" data-bk="room" data-id="${pl.id}" data-v="${k}" title="${k ? `${esc(roomHelp(k))}${(pl.roomsDone || []).includes(k) ? ' · déjà fouillée' : ' · pas encore fouillée : un petit trésor caché'}` : 'Toutes les pièces : tout ce qu’il y a'}">${lab}${k && !(pl.roomsDone || []).includes(k) ? ' ✨' : ''}</button>`).join('')}</span>`; };
        const chips = (st, pl) => { const inRoom = r => !st.room || B().ROOMS[st.room]?.[2].includes(r), opts = [...Object.keys(pl.max).filter(r => pl.max[r] > 0 && inRoom(r)), ...((B().PLACE_KINDS[pl.kind][5] || []).length ? ['junk'] : [])], on = st.take, q = st.qty || {}, kn = pl.known;
            const seen = r => !kn ? '' : r === 'junk' ? ` <i class="bk-seen">(vu : ${kn.junk.length})</i>` : ` <i class="bk-seen">(vu : ${kn.stock[r] || 0})</i>`;
            return `<span class="bk-take" role="group" aria-label="Ce qu’on rapporte de ${esc(pl.name)}"><button type="button" class="bk-chip${!on ? ' is-on' : ''}" data-bk="take" data-id="${pl.id}" data-v="">Tout</button>${opts.map(r => { const sel = !on || on.includes(r);
                return `<span class="bk-takeq${sel ? ' is-sel' : ''}"><button type="button" class="bk-chip${on?.includes(r) ? ' is-on' : ''}" data-bk="take" data-id="${pl.id}" data-v="${r}" aria-pressed="${!!on?.includes(r)}">${r === 'junk' ? '♻️ bric-à-brac' : `${resName(r)[1]} ${esc(resName(r)[2].toLowerCase())}`}${seen(r)}</button>${sel ? `<input type="number" min="1" max="999" inputmode="numeric" placeholder="tout" value="${q[r] || ''}" data-bk-qty="${r}" data-id="${pl.id}" aria-label="Combien au plus de ${r === 'junk' ? 'bric-à-brac' : esc(resName(r)[2].toLowerCase())} (vide = tout)">` : ''}</span>`; }).join('')}</span>`; };
        const who = free.find(p => p.id === sendFor) || free[0], cap = who ? B().carryOf(G, who) : 0;
        // ce qui est prévu : si tout a un nombre, on peut compter ; sinon « tout ce qu'il y a »
        const planned = route.reduce((n, st) => { const pl = c.places.find(x => x.id === st.id), opts = st.take || [...Object.keys(pl.max).filter(r => pl.max[r] > 0), 'junk']; return opts.every(r => st.qty?.[r] || (r === 'junk' && !(B().PLACE_KINDS[pl.kind][5] || []).length)) ? n + opts.reduce((m, r) => m + (st.qty?.[r] || 0) * (r === 'junk' ? 2 : 1), 0) : Infinity; }, 0);
        return `<div class="bk-route"><h4>🚶 Le parcours</h4><ol>${route.map((st, i) => { const pl = pls[i]; return `<li><div class="bk-route-head"><b>${B().PLACE_KINDS[pl.kind][0]} ${esc(pl.name)}</b><span><button type="button" class="icon-button small" data-bk="routeup" data-i="${i}" ${i ? '' : 'disabled'} aria-label="Plus tôt">↑</button><button type="button" class="icon-button small" data-bk="routedel" data-id="${pl.id}" aria-label="Retirer">×</button></span></div>${rooms(st, pl)}<small>Rapporter :</small>${chips(st, pl)}</li>`; }).join('')}</ol>
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
        // ⤢ la carte s'ouvre en grand (utile quand elle dépasse) : elle couvre le bunker, le parcours et le lieu choisi à côté
        return `<p class="muted">${esc(c.name)} · ville ${B().SIZES[c.size][2].toLowerCase()} · 30 min par case (×1,5 la nuit sans lampe torche).</p>
            <div class="bk-ville${mapFull ? ' is-full' : ''}"><div class="bk-mapcol"><div class="bk-maptools">${mapFull ? `<b>🗺️ ${esc(c.name)}</b><span class="spacer"></span>` : ''}<button type="button" class="button small secondary" data-bk="mapfull" title="${mapFull ? 'Revenir à la petite carte (Échap)' : 'Voir la carte dans un grand cadre'}">${mapFull ? '✕ Réduire la carte' : '⤢ Ouvrir la carte en grand'}</button></div>
            <div class="bk-mapwrap${n > 17 ? ' is-big' : ''}" style="--n:${n}"><div class="bk-map${c.lat != null ? ' has-bg' : ''}" style="--n:${n}">${mapBgHtml(c)}${Array.from({length: n * n}, (_, i) => cell(i % n, Math.floor(i / n))).join('')}</div></div></div><div class="bk-villeinfo">
            ${routeHtml(free)}${c.geo === 'none' ? '<p class="lck-legend muted">Pas de plan en fond : cette ville n’a pas de coordonnées (ni dans ton arbre, ni dans les communes).</p>' : ''}
            ${pl ? `<div class="bk-placecard"><b>${B().PLACE_KINDS[pl.kind][0]} ${esc(pl.name)}</b><small>${Math.round(B().travel(G, pl) / 6) / 10} h de marche (aller) · ${stockTxt(pl)}${pl.visits ? ` · fouillé ${plural(pl.visits, 'fois', 'fois')}` : ''}</small>
                ${(B().KIND_ROOMS[pl.kind] || []).length ? `<p class="muted">🏚️ Pièces : ${B().KIND_ROOMS[pl.kind].map(k => `${B().ROOMS[k][0]} ${B().ROOMS[k][1].replace(/^(La |Le |L’)/, '').toLowerCase()}${(pl.roomsDone || []).includes(k) ? ' ✓' : ''}`).join(', ')} — à choisir dans le parcours.</p>` : ''}
                ${G.opt?.nuit && B().NIGHT_DANGER.includes(pl.kind) ? '<p class="bk-miss">🌙 Dangereux la nuit.</p>' : G.opt?.nuit && B().NIGHT_BONUS.includes(pl.kind) ? '<p>🌙 La nuit, on y trouve plus (les autres dorment).</p>' : ''}
                ${G.opt?.missions && G.missions?.some(m => !m.done && B().DOCS[m.doc][2].includes(pl.kind)) ? `<p>📜 Peut-être ici : ${G.missions.filter(m => !m.done && B().DOCS[m.doc][2].includes(pl.kind)).map(m => esc(B().missionTxt(m).replace(/^Retrouver /, ''))).join(' ; ')}.</p>` : ''}
                ${pl.known ? `<p class="bk-known">👁️ Vu le jour ${pl.known.d} : ${Object.keys(pl.known.stock).length ? Object.entries(pl.known.stock).map(([r, n]) => `${n} ${resName(r)[1]} ${esc(resName(r)[2].toLowerCase())}`).join(', ') : 'plus aucune réserve'}${pl.known.junk.length ? `, ${pl.known.junk.length} bric-à-brac` : ''}. <small class="muted">Ça change chaque matin, au hasard : des choses reviennent, d’autres survivants passent.</small></p>` : ''}
                <p class="muted">On peut y trouver (pas tout à la fois, au hasard) : ${Object.keys(pl.max).map(r => resName(r)[1] + ' ' + resName(r)[2].toLowerCase()).join(', ')}${B().PLACE_KINDS[pl.kind][4] ? ', et souvent des plans' : ''}.${(B().PLACE_KINDS[pl.kind][5] || []).length ? ` ♻️ Du bric-à-brac${pl.seen && (pl.junk || []).length ? ` : ${[...new Set(pl.junk)].map(k => B().JUNK[k][0] + ' ' + B().JUNK[k][1].toLowerCase()).join(', ')}` : pl.seen ? ' (plus rien pour l’instant)' : ''}.` : ''}</p>
                <div class="bk-send">${route.some(st => st.id === pl.id) ? `<button type="button" class="button small secondary" data-bk="routedel" data-id="${pl.id}">− Retirer du parcours</button>` : `<button type="button" class="button small" data-bk="routeadd" data-id="${pl.id}" ${route.length >= 6 ? 'disabled' : ''}>＋ Ajouter au parcours</button>`}</div></div>` : '<p class="muted">Clique sur les lieux de la carte pour composer le parcours (jusqu’à 6 étapes).</p>'}</div></div>`;
    }
    /** 🌳 la famille au bunker : le coffre, les liens, les naissances (l'arbre du bunker, à part de ta vraie base) */
    function sideFamille() {
        const H = B().HEIRLOOMS, alive = G.people.filter(p => p.hp > 0);
        const couples = [], seen = new Set();
        G.people.forEach(p => (p.spouses || []).forEach(id => { const k = [p.id, id].sort().join(); if (seen.has(k)) return; seen.add(k); const o = G.people.find(x => x.id === id); if (o) couples.push([p, o]); }));
        const miss = G.opt?.missions ? `<h4>📜 Missions généalogiques</h4>${(G.missions || []).filter(m => !m.done).length ? `<ul class="bk-coffre-items">${G.missions.filter(m => !m.done).map(m => `<li><b>${B().DOCS[m.doc][0]} ${esc(B().missionTxt(m))}</b><small>où chercher : ${B().DOCS[m.doc][2].map(k => `${B().PLACE_KINDS[k][0]} ${esc(B().PLACE_KINDS[k][1].toLowerCase())}`).join(', ')} · récompense : ${m.reward.n} ${esc(resName(m.reward.r)[2].toLowerCase())}</small></li>`).join('')}</ul>` : `<p class="muted">${G.ancestors?.length ? 'Toutes les missions sont faites !' : 'Pas d’ancêtre connu pour une mission (la partie a été créée sans arbre).'}</p>`}
            ${(G.docs || []).length ? `<h4>📂 Retrouvé dans les ruines</h4><ul class="bk-coffre-items">${G.docs.map(d => `<li><b>${esc(d.txt)}</b><small>jour ${d.day}</small></li>`).join('')}</ul><p class="muted">Ce sont des trouvailles du jeu : rien n’est écrit dans ton arbre.</p>` : ''}` : '';
        return `${miss}${G.pets?.length ? `<h4>🐾 Les animaux</h4>${petsHtml()}` : ''}<h4>🧳 Le coffre de famille</h4>${G.coffre.length ? `<ul class="bk-coffre-items">${G.coffre.map(c => `<li><b>${esc(c.title)}</b><small>${esc(H.find(h => h[0] === c.bonus)[2])}</small></li>`).join('')}</ul>` : '<p class="muted">Le coffre est parti vide (aucun objet choisi au départ).</p>'}
            <h4>👪 Ensemble au bunker</h4>
            ${couples.length ? couples.map(([a, b]) => `<p>💞 ${esc(a.name)} et ${esc(b.name)}</p>`).join('') : ''}
            <p class="muted">${plural(alive.length, 'personne')} en vie. Ceux qui ont de la famille près d’eux gardent mieux le moral.${G.feud ? ` ⚡ Une vieille brouille : ${esc(G.feud.map(id => G.people.find(p => p.id === id)?.name || '?').join(' et '))}.` : ''}</p>
            ${G.preg ? `<p>🤰 ${esc(G.people.find(p => p.id === G.preg.m)?.name || '')} attend un bébé : naissance le jour ${B().dayOf(G.preg.due)}.</p>` : ''}
            <h4>🌳 L’arbre du bunker</h4>
            ${G.births.length ? `<div class="bk-tree">${G.births.map(b => `<div class="bk-tree-row"><span class="bk-tree-par">${esc(b.m)}${b.f ? ` <i>♥</i> ${esc(b.f)}` : ''}</span><span class="bk-tree-line" aria-hidden="true"></span><span class="bk-tree-kid">👶 ${esc(b.name)} <small>né·e le jour ${b.day}</small></span></div>`).join('')}</div><p class="muted">Cet arbre reste dans la partie : il ne touche pas à ta vraie base.</p>`
                : A().emptyState({size: 'small', icon: '👶', text: `Pas encore de naissance. Il faut ${B().has(G, 'berceau') ? '' : 'un berceau, '}un couple qui a le moral, et un peu de temps (à partir du jour 5).`})}
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
    function kitchenHtml() {
        const R = B().RECIPES, cur = G.menu || 'auto', now = B().pickRecipe(G), cook = B().canCook(G);
        const opts = Object.entries(R).filter(([k, r]) => (!r.chain || G.opt?.chaines) && (!r.lore || G.lore?.some(x => x.kind === 'recipe')));
        return `<label class="bk-field">Le plat du jour <select data-bk-menu><option value="auto" ${cur === 'auto' ? 'selected' : ''}>✨ Le meilleur possible</option>${opts.map(([k, r]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${r.ico} ${esc(B().recipeName(G, k))}</option>`).join('')}</select></label>
            <p>Aujourd’hui : <b>${R[now].ico} ${esc(B().recipeName(G, now))}</b>${!cook ? ' <small class="muted">(rien pour cuire : un 🔥 poêle, un 🍲 fourneau ou un 🍞 four)</small>' : ''}</p>
            <div class="bk-plans">${opts.filter(([k]) => k !== 'simple').map(([k, r]) => { const ok = B().recipeOk(G, k); return `<div class="bk-plan${ok ? ' is-can' : ' is-off'}"><span class="bk-ico">${r.ico}</span><div><b>${esc(B().recipeName(G, k))}</b><small>${Object.entries(r.in).map(([x, n]) => `${resName(x)[1]} ${n}`).join(' ')}${r.cook ? ' · 🔥 à cuire' : ''} → faim +${r.faim}, moral ${r.mood >= 0 ? '+' : ''}${r.mood}</small></div></div>`; }).join('')}</div>`;
    }
    function petsHtml() {
        const P = B().PETS; if (!G.pets?.length) return '';
        return `<div class="bk-pets">${G.pets.map(a => `<span class="bk-chip${a.hungry ? ' is-bad' : ''}" title="${esc(P[a.k][1])} : ${esc(P[a.k][3])} · mange ${Object.entries(P[a.k][2]).map(([r, n]) => `${n} ${resName(r)[2].toLowerCase()}`).join(', ')} par jour${a.hungry ? ` · n’a pas mangé depuis ${a.hungry} jour(s)` : ''}">${P[a.k][0]} ${esc(a.name)}${a.hungry ? ' (a faim)' : ''}</span>`).join('')}</div>`;
    }
    let decoFloor = 0;
    function decoHtml() {
        const D = B().DECOS, fi = Math.min(decoFloor, G.floors.length - 1), l = G.deco?.[fi] || [], names = [...G.people.filter(p => p.hp > 0).map(p => p.name), ...(G.ancestors || []).map(a => a.name)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 40);
        return `<p class="muted">Quatre décorations par étage au plus : chacune remonte un peu le moral de tous (le portrait de famille plus que les autres).</p>
            <div class="bk-p-actions"><label>Étage <select data-bk-decofloor>${G.floors.map((f, i) => `<option value="${i}" ${i === fi ? 'selected' : ''}>−${i + 1} (${(G.deco?.[i] || []).length} / ${B().DECO_MAX})</option>`).join('')}</select></label>
                <label>Portrait de <select data-bk-portrait>${names.map(n => `<option>${esc(n)}</option>`).join('')}</select></label></div>
            ${l.length ? `<div class="bk-chips">${l.map((d, i) => `<span class="bk-chip">${D[d.k][0]} ${esc(D[d.k][1])}${d.name ? ` de ${esc(d.name)}` : ''} <button type="button" class="icon-button small" data-bk="undeco" data-i="${i}" aria-label="Enlever">×</button></span>`).join('')}</div>` : ''}
            <div class="bk-chips">${Object.entries(D).map(([k, [ico, lab, cost, m]]) => { const ok = Object.entries(cost).every(([r, n]) => (G.res[r] || 0) >= n) && l.length < B().DECO_MAX;
                return `<button type="button" class="bk-chip" data-bk="deco" data-v="${k}" ${ok ? '' : 'disabled'} title="${esc(lab)} : ${Object.entries(cost).map(([r, n]) => `${n} ${resName(r)[2].toLowerCase()}`).join(', ')} · moral +${m}/h${k === 'guirlande' ? ' (avec électricité)' : ''}">${ico} ${esc(lab)}</button>`; }).join('')}</div>`;
    }
    /* ── 📊 les statistiques : une petite courbe par mesure (un seul trait chacune, survol = la valeur du jour) ── */
    const SERIES = [['pop', '👥 Habitants en vie', ''], ['mood', '😊 Moral moyen', '%'], ['hp', '❤️ Santé moyenne', '%'], ['eau', '💧 Eau potable', 'L'], ['nourriture', '🥫 Nourriture', 'rations'], ['essence', '⛽ Essence', 'L'], ['medic', '💊 Médicaments', ''], ['bois', '🪵 Bois', '']];
    function statRows() {
        const al = G.people.filter(p => p.hp > 0), avg = k => al.length ? Math.round(al.reduce((a, p) => a + (k === 'mood' ? p.mood ?? 70 : p.hp), 0) / al.length) : 0, d = B().dayOf(G.t);
        const now = {d, pop: al.length, mood: avg('mood'), hp: avg('hp'), eau: Math.floor(G.res.eau), nourriture: Math.floor(G.res.nourriture), essence: Math.floor(G.res.essence), medic: Math.floor(G.res.medic), bois: Math.floor(G.res.bois)};
        return [...(G.hist || []).filter(h => h.d !== d), now];
    }
    function sparkSvg(rows, k, unit) {
        const W = 300, H = 92, L = 30, R = 8, T = 10, Bm = 20, vals = rows.map(r => r[k] || 0), max = Math.max(1, ...vals), n = rows.length;
        const x = i => L + (n < 2 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1)), y = v => T + (H - T - Bm) * (1 - v / max);
        const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '), last = vals[n - 1];
        return `<svg class="bk-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(SERIES.find(s2 => s2[0] === k)[1])} : ${last} ${unit} aujourd’hui" data-bk-chart="${k}" data-unit="${esc(unit)}" data-pts="${esc(JSON.stringify(rows.map((r, i) => [r.d, r[k] || 0, +x(i).toFixed(1), +y(r[k] || 0).toFixed(1)])))}">
            <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="bk-axis"/><line x1="${L}" x2="${W - R}" y1="${y(max)}" y2="${y(max)}" class="bk-grid"/>
            <text x="${L - 4}" y="${y(max) + 4}" text-anchor="end" class="bk-tick">${max}</text><text x="${L - 4}" y="${y(0) + 4}" text-anchor="end" class="bk-tick">0</text>
            <text x="${L}" y="${H - 4}" class="bk-tick">jour ${rows[0].d}</text><text x="${W - R}" y="${H - 4}" text-anchor="end" class="bk-tick">jour ${rows[n - 1].d}</text>
            ${n > 1 ? `<polyline points="${pts}" class="bk-line"/>` : ''}<circle cx="${x(n - 1)}" cy="${y(last)}" r="4" class="bk-dot"/>
            <line class="bk-cross" x1="0" x2="0" y1="${T}" y2="${y(0)}" visibility="hidden"/><circle class="bk-hov" r="4" visibility="hidden"/><rect x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent" class="bk-hit"/></svg>`;
    }
    function sideStats() {
        const rows = statRows();
        return `<p class="muted">Une photo par jour (à minuit), et aujourd’hui en direct. Survole une courbe pour lire la valeur d’un jour.</p>
            <div class="bk-stats">${SERIES.map(([k, l, u]) => `<figure class="bk-stat"><figcaption><b>${l}</b><span>${rows[rows.length - 1][k]}${u ? ' ' + u : ''}</span></figcaption><div class="bk-spark-wrap">${sparkSvg(rows, k, u)}<span class="bk-tip" hidden></span></div></figure>`).join('')}</div>
            <details><summary>Voir le tableau</summary><div class="bk-tablewrap"><table class="bk-table"><thead><tr><th>Jour</th>${SERIES.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>${rows.slice().reverse().map(r => `<tr><td>${r.d}</td>${SERIES.map(([k]) => `<td>${r[k]}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>
            <h4>En tout</h4><p>${[[G.stats.repairs, '🔧 réparation(s)'], [G.stats.events, '🌪️ catastrophe(s)'], [G.stats.fires, '🔥 incendie(s)'], [G.stats.meals, '🍲 bon(s) repas'], [G.stats.recycled, '♻️ objet(s) démonté(s)'], [G.stats.trades, '🤝 échange(s)'], [G.stats.stories, '📖 veillée(s)']].filter(([n]) => n).map(([n, l]) => `${n} ${l}`).join(' · ') || 'Rien encore.'}</p>`;
    }
    /** survol d'une courbe : la ligne verticale, le point, et la valeur du jour le plus proche */
    function chartHover(e) {
        const svg = e.target.closest?.('svg[data-bk-chart]'); if (!svg) { hoverChart = false; return; } hoverChart = true; const wrap = svg.parentElement, tip = wrap.querySelector('.bk-tip'), pts = JSON.parse(svg.dataset.pts || '[]'); if (!pts.length) return;
        const box = svg.getBoundingClientRect(), vx = (e.clientX - box.left) / box.width * 300, p = pts.reduce((a, b) => (Math.abs(b[2] - vx) < Math.abs(a[2] - vx) ? b : a));
        const cr = svg.querySelector('.bk-cross'), hv = svg.querySelector('.bk-hov'); cr.setAttribute('x1', p[2]); cr.setAttribute('x2', p[2]); cr.setAttribute('visibility', 'visible'); hv.setAttribute('cx', p[2]); hv.setAttribute('cy', p[3]); hv.setAttribute('visibility', 'visible');
        tip.hidden = false; tip.textContent = `Jour ${p[0]} : ${p[1]}${svg.dataset.unit ? ' ' + svg.dataset.unit : ''}`; tip.style.left = `${Math.min(70, Math.max(0, p[2] / 3 - 10))}%`;
    }
    function chartLeave(e) { hoverChart = false; const svg = e.target.closest?.('svg[data-bk-chart]'); if (!svg) return; svg.querySelectorAll('.bk-cross, .bk-hov').forEach(x => x.setAttribute('visibility', 'hidden')); const tip = svg.parentElement.querySelector('.bk-tip'); if (tip) tip.hidden = true; }
    /* ── 📖 le livre du bunker : le récit de la partie ── */
    function bookParts() {
        const me = meOf(G), day = B().dayOf(G.t), S = B().SCENARIOS[G.scen] || B().SCENARIOS.classique;
        const byDay = new Map(); G.log.slice().reverse().filter(l => ['alerte', 'histoire', 'visite'].includes(l.kind)).forEach(l => { const d = B().dayOf(l.t); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(l.txt); });
        const people = G.people.map(p => ({name: p.name, txt: [p.baby ? 'né·e au bunker' : '', p.from, (p.traits || []).map(k => B().TRAITS[k]?.[1]).filter(Boolean).join(', '), p.hp > 0 ? '' : `mort·e le jour ${G.stats.deaths.find(d => d.name === p.name)?.day || '?'}`].filter(Boolean).join(' · '), diary: (p.diary || []).slice(0, 4).reverse()}));
        return {title: `Le livre du bunker de ${me.name}`, sub: `${G.city.name} · ${S[0]} ${S[1]} · ${day - 1 > 0 ? `${day - 1} jour${day > 2 ? 's' : ''} sous terre` : 'le premier jour'}${G.over ? ' · la fin' : ''}`, people, days: [...byDay].map(([d, l]) => [d, l.slice(0, 12)]), docs: G.docs || [], births: G.births || [], coffre: G.coffre || []};
    }
    function bookHtml(forPrint = false) {
        const b = bookParts();
        return `<div class="bk-gz-paper bk-book">${forPrint ? '' : '<button type="button" class="icon-button bk-gz-close" data-bk="gzclose" aria-label="Fermer">×</button>'}
            <header class="bk-gz-mast"><small>${esc(b.sub)}</small><h2>${esc(b.title)}</h2></header>
            <h3>Ceux qui sont descendus</h3><ul>${b.people.map(p => `<li><b>${esc(p.name)}</b>${p.txt ? ` <small>· ${esc(p.txt)}</small>` : ''}${p.diary.length ? `<blockquote>${p.diary.map(d => `Jour ${d.d} — ${esc(d.txt)}`).join('<br>')}</blockquote>` : ''}</li>`).join('')}</ul>
            <h3>Jour après jour</h3>${b.days.length ? b.days.map(([d, l]) => `<section class="bk-book-day"><h4>Jour ${d}</h4><p>${l.map(esc).join(' ')}</p></section>`).join('') : '<p>Rien encore.</p>'}
            ${b.births.length ? `<h3>Naissances</h3><ul>${b.births.map(x => `<li>👶 ${esc(x.name)}, jour ${x.day}</li>`).join('')}</ul>` : ''}
            ${b.docs.length ? `<h3>Ce qu’on a retrouvé de la famille</h3><ul>${b.docs.map(d => `<li>${esc(d.txt)} <small>(jour ${d.day})</small></li>`).join('')}</ul>` : ''}
            ${b.coffre.length ? `<h3>Le coffre de famille</h3><ul>${b.coffre.map(c => `<li>${esc(c.title)}</li>`).join('')}</ul>` : ''}
            ${forPrint ? '' : `<footer class="bk-gz-foot"><button type="button" class="button small secondary" data-bk="bookprint">🖨 Imprimer</button><button type="button" class="button small secondary" data-bk="bookdl">⤓ Télécharger (.html)</button>${ext.tresors?.T?.save ? '<button type="button" class="button small" data-bk="bookkeep">✨ Ranger dans Trésors</button>' : ''}</footer>`}</div>`;
    }
    const bookDoc = () => `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(bookParts().title)}</title><style>body{font:16px/1.5 Georgia,serif;margin:24px auto;max-width:760px;padding:0 16px;color:#111;background:#fff}h2{font:900 34px Georgia,serif;text-align:center;border-top:3px double #111;border-bottom:3px double #111;margin:6px 0;padding:6px 0}.bk-gz-mast{text-align:center}h3{border-bottom:1px solid #111;margin-top:24px}blockquote{font-style:italic;margin:6px 0 6px 14px;color:#333}small{color:#555}</style>${bookHtml(true)}</html>`;
    const bookText = () => { const b = bookParts(); return [b.title, b.sub, '', 'Ceux qui sont descendus :', ...b.people.map(p => `- ${p.name}${p.txt ? ` (${p.txt})` : ''}`), '', ...b.days.flatMap(([d, l]) => [`Jour ${d}`, ...l, '']), ...(b.docs.length ? ['Ce qu’on a retrouvé de la famille :', ...b.docs.map(d => `- ${d.txt}`)] : [])].join('\n'); };
    /* ── 🔊 les sons : fabriqués par le navigateur (Web Audio), aucun fichier ni enregistrement, donc libres de droit ── */
    const SND = (() => {
        const K2 = KEY + '_son'; let pref; try { pref = JSON.parse(localStorage.getItem(K2) || 'null'); } catch (_) { pref = null; }
        pref = {on: pref?.on !== false, vol: Number.isFinite(pref?.vol) ? pref.vol : 0.5, amb: pref?.amb !== false, fx: pref?.fx !== false};
        let ac = null, master = null, noise = null; const loops = {};
        const save = () => { try { localStorage.setItem(K2, JSON.stringify(pref)); } catch (_) {} };
        function ctx() { if (!ac) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ac = new AC(); master = ac.createGain(); master.gain.value = pref.on ? pref.vol : 0; master.connect(ac.destination);
            noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } if (ac.state === 'suspended') ac.resume().catch(() => {}); return ac; }
        const src = () => { const n = ac.createBufferSource(); n.buffer = noise; n.loop = true; return n; };
        /** les ambiances en boucle : pluie, vent, groupe électrogène, feu */
        const BUILD = {
            pluie: () => { const n = src(), f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.6; n.connect(f); n.start(); return [f, 0.22]; },
            vent: () => { const n = src(), f = ac.createBiquadFilter(), l = ac.createOscillator(), lg = ac.createGain(); f.type = 'lowpass'; f.frequency.value = 420; l.frequency.value = 0.15; lg.gain.value = 220; l.connect(lg); lg.connect(f.frequency); n.connect(f); n.start(); l.start(); return [f, 0.2]; },
            groupe: () => { const o = ac.createOscillator(), f = ac.createBiquadFilter(), m = ac.createGain(); o.type = 'sawtooth'; o.frequency.value = 52; f.type = 'lowpass'; f.frequency.value = 180; o.connect(f); f.connect(m); m.gain.value = 1; o.start(); return [m, 0.06]; },
            feu: () => { const n = src(), f = ac.createBiquadFilter(), l = ac.createOscillator(), lg = ac.createGain(), m = ac.createGain(); f.type = 'highpass'; f.frequency.value = 1800; l.type = 'square'; l.frequency.value = 7; lg.gain.value = 0.5; l.connect(lg); lg.connect(m.gain); m.gain.value = 0.5; n.connect(f); f.connect(m); n.start(); l.start(); return [m, 0.16]; }};
        function setLoop(k, on) {
            if (!ac) return; let L = loops[k]; if (!on && !L) return;
            if (!L) { const [node, level] = BUILD[k](); const g = ac.createGain(); g.gain.value = 0; node.connect(g); g.connect(master); L = loops[k] = {g, level}; }
            L.g.gain.setTargetAtTime(on && pref.amb ? L.level : 0, ac.currentTime, 0.6);
        }
        /** les bruits : coups à la trappe, alerte, marteau, radio */
        function hit(type) {
            if (!ac || !pref.fx || !pref.on) return; const t = ac.currentTime;
            const burst = (at, f0, dur, gain, kind = 'lowpass') => { const n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); n.buffer = noise; f.type = kind; f.frequency.value = f0; g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur); n.connect(f); f.connect(g); g.connect(master); n.start(at); n.stop(at + dur + 0.05); };
            const beep = (at, fr, dur, gain = 0.15, wave = 'sine') => { const o = ac.createOscillator(), g = ac.createGain(); o.type = wave; o.frequency.value = fr; g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + dur); o.connect(g); g.connect(master); o.start(at); o.stop(at + dur + 0.05); };
            if (type === 'trappe') [0, 0.22, 0.44].forEach(d => burst(t + d, 180, 0.18, 0.9));
            if (type === 'alerte') { beep(t, 880, 0.18); beep(t + 0.22, 660, 0.25); }
            if (type === 'marteau') [0, 0.16].forEach(d => burst(t + d, 2500, 0.07, 0.5, 'highpass'));
            if (type === 'radio') { burst(t, 3000, 0.25, 0.12, 'bandpass'); beep(t + 0.25, 1200, 0.08, 0.06, 'square'); }
            if (type === 'joie') [523, 659, 784].forEach((f, i) => beep(t + i * 0.12, f, 0.3, 0.12));
        }
        function update(g) { if (!ac || !g) return; const night = B().isNight(g.t); setLoop('pluie', !!g.weather?.rain); setLoop('vent', !!g.wind || g.event?.k === 'tempete'); setLoop('groupe', g.power && g.powerSrc === 'essence'); setLoop('feu', !!g.fire); void night; }
        let lastLog = null;
        function events(g) { const top = g?.log?.[0]; if (!top || top === lastLog) return; const fresh = []; for (const l of g.log) { if (l === lastLog) break; fresh.push(l); if (fresh.length > 8) break; } lastLog = top;
            const txt = fresh.map(l => l.txt).join(' '); if (/🔔/.test(txt)) hit('trappe'); else if (/👶|🤝|📜 Mission/.test(txt)) hit('joie'); else if (fresh.some(l => l.kind === 'alerte' && /🔥|💥|☠️|🔧|⚡ Plus/.test(l.txt))) hit('alerte'); else if (/✅|⬆️/.test(txt)) hit('marteau'); else if (fresh.some(l => l.kind === 'radio')) hit('radio'); }
        function apply() { if (master) master.gain.setTargetAtTime(pref.on ? pref.vol : 0, ac.currentTime, 0.1); save(); }
        return {pref, ready: () => !!ac, unlock: () => { ctx(); }, update, events, set: (k, v) => { pref[k] = v; apply(); }, stop: () => { if (ac) { ac.close().catch(() => {}); ac = null; master = null; Object.keys(loops).forEach(k => delete loops[k]); lastLog = null; } }, reset: g => { lastLog = g?.log?.[0] || null; }};
    })();
    function soundHtml() {
        const P = SND.pref;
        return `<label class="checkbox-line"><input type="checkbox" data-bk-snd="on" ${P.on ? 'checked' : ''}> Le son</label>
            <label class="bk-field">Volume <input type="range" min="0" max="1" step="0.05" value="${P.vol}" data-bk-snd="vol"></label>
            <label class="checkbox-line"><input type="checkbox" data-bk-snd="amb" ${P.amb ? 'checked' : ''}> Ambiance <small class="muted">(pluie, vent, groupe électrogène, feu)</small></label>
            <label class="checkbox-line"><input type="checkbox" data-bk-snd="fx" ${P.fx ? 'checked' : ''}> Bruitages <small class="muted">(coups à la trappe, alertes, marteau, radio)</small></label>
            <p class="muted">Tous les sons sont fabriqués par le navigateur (Web Audio) : aucun fichier, aucun enregistrement d’autrui, rien n’est téléchargé — libres de droit.</p>`;
    }
    /** ⚙️ les réglages de la partie en cours */
    function sideRegl() {
        const S = B().SCENARIOS[G.scen] || B().SCENARIOS.classique, o = G.opt || {};
        const opt = (k, l, d) => `<label class="checkbox-line bk-optl"><input type="checkbox" data-bk-opt="${k}" ${o[k] ? 'checked' : ''}><span>${l}<small class="muted">${d.replace(/^— /, '')}</small></span></label>`;
        return `<h4>Difficulté</h4><div class="segmented bk-planf" role="group">${Object.entries(B().DIFFS).map(([k, d]) => `<button type="button" data-bk="diff" data-v="${k}" class="${G.diff === k ? 'is-active' : ''}">${esc(d.l)}</button>`).join('')}</div>
            <p class="muted">Plus difficile : on a faim et soif plus vite, moins de réserves au départ, des pillards plus forts, plus de pannes, et la ville se remplit moins vite.</p>
            <h4>Options</h4>${opt('meteo', '🌪️ Météo et catastrophes', '— canicule, tempête de poussière, inondation, séisme, orage, vague de froid')}${opt('chaines', '🧵 Chaînes de fabrication', '— rouet, métier à tisser, tailleur ; champ, moulin, four à pain')}${opt('tuto', '📘 Tutoriel guidé', G.tuto >= 0 ? `— étape ${G.tuto + 1} / ${B().TUTO.length}` : '— (le cocher le recommence)')}
            ${opt('age', '🧓 Vieillir', '— un jour = un an : les bébés grandissent, les aînés ralentissent')}${opt('feu', '🔥 Incendies', '— un poêle, un court-circuit… un 🧯 extincteur l’éteint tout de suite')}
            ${opt('nuit', '🌗 La nuit en ville', `— dangereux la nuit : ${B().NIGHT_DANGER.map(k => B().PLACE_KINDS[k][0]).join(' ')} ; plus de choses la nuit : ${B().NIGHT_BONUS.map(k => B().PLACE_KINDS[k][0]).join(' ')}`)}${opt('missions', '📜 Missions généalogiques', '— retrouver l’acte, la photo ou la lettre d’un vrai ancêtre (onglet 🌳 Famille)')}
            <h4>🔊 Sons</h4>${soundHtml()}
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
            ${list ? `<ol class="bk-log bk-diary">${list}</ol>` : A().emptyState({size: 'small', icon: '📔', text: 'Rien d’écrit pour l’instant : il ou elle écrit chaque soir.'})}`;
    }
    /** imprimer (la gazette, le livre) : la fenêtre « Imprimer » de l'app (format, sens, aperçu, PDF) */
    function printBunker(title, doc) {
        if (UI().openPrintDialog) { UI().openPrintDialog({title, html: doc, photos: false}); return; }
        const w = window.open('', '_blank'); if (!w) { toast('La fenêtre d’impression a été bloquée.', 'error'); return; } // secours, sans LCNDA_UI
        w.document.write(doc); w.document.close(); w.focus(); w.print(); // secours
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
        if (k === 'digpanel') { whoMenu('creuser', b); return; }
        if (k === 'full') { toggleFull(); return; }
        if (k === 'mapfull') { mapFull = !mapFull; mapScroll = null; drawSide(); return; }
        if (k === 'movecancel') { moveFrom = null; drawWorld(); return; }
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
        if (k === 'gzprint') { printBunker('La Gazette du Bunker', `<!doctype html><meta charset="utf-8"><title>La Gazette du Bunker</title><style>body{font:15px Georgia,serif;margin:24px;color:#111}h2{font:900 40px Georgia,serif;text-align:center;margin:4px 0;border-top:3px double #111;border-bottom:3px double #111}.bk-gz-mast{text-align:center}.bk-gz-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}h3{text-align:center;font-size:22px}h4{border-bottom:1px solid #111;margin:12px 0 6px}button{display:none}blockquote{font-style:italic;margin:6px 0 6px 10px}</style>${gazetteHtml()}`); return; }
        if (k === 'recall') { if (!B().recall(G, b.dataset.id)) toast('La radio ne passe pas (pas d’électricité ?).', 'error'); drawAll(); return; }
        if (k === 'mute') { SND.unlock(); SND.set('on', !SND.pref.on); drawAll(); return; }
        if (k === 'book') { const gz = dlg.querySelector('[data-bk-gz]'); if (!gz) return; gz.innerHTML = bookHtml(); gz.hidden = false; if (G.speed) { gzPaused = G.speed; setSpeed(0); } gz.querySelector('[data-bk="gzclose"]')?.focus(); return; }
        if (k === 'bookprint') { printBunker(bookParts().title, bookDoc()); return; }
        if (k === 'bookdl') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bookDoc()], {type: 'text/html'})); a.download = `livre-du-bunker-${String(meOf(G).name).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); return; }
        if (k === 'bookkeep') { const me = meOf(G); ext.tresors.T.save({kind: 'story', person_id: me.pid || null, title: `${bookParts().title} (${new Date().toLocaleDateString('fr-FR')})`, body: bookText(), data: {bunker: true}}).then(() => toast('✓ Rangé dans ✨ Trésors (sur la fiche de ' + me.name + ').')).catch(err => toast(err.message || 'Impossible de ranger le livre.', 'error')); return; }
        if (k === 'deco') { const sel = dlg.querySelector('[data-bk-portrait]'), r = B().addDeco(G, Math.min(decoFloor, G.floors.length - 1), b.dataset.v, 0, b.dataset.v === 'portrait' ? sel?.value || '' : ''); if (!r.ok) toast(r.err, 'error'); drawAll(); return; }
        if (k === 'undeco') { B().removeDeco(G, Math.min(decoFloor, G.floors.length - 1), Number(b.dataset.i)); drawAll(); return; }
        if (k === 'room') { const st = route.find(x => x.id === b.dataset.id); if (st) { if (b.dataset.v) st.room = b.dataset.v; else delete st.room; } drawSide(); return; }
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
        const sd = e.target.closest('[data-bk-snd]'); if (sd) { SND.unlock(); SND.set(sd.dataset.bkSnd, sd.type === 'range' ? Number(sd.value) : sd.checked); if (G) { SND.update(G); drawTop(); } return; }
        const df = e.target.closest('[data-bk-decofloor]'); if (df && G) { decoFloor = Number(df.value) || 0; drawSide(); return; }
        const mn = e.target.closest('[data-bk-menu]'); if (mn && G) { G.menu = mn.value; drawSide(); return; }
        const op = e.target.closest('[data-bk-opt]'); if (op && G) { B().setOpt(G, op.dataset.bkOpt, op.checked); drawAll(); return; }
        const sw = e.target.closest('[data-bk-sendwho]'); if (sw && G) { sendFor = sw.value; drawSide(); return; }
        const qi = e.target.closest('[data-bk-qty]'); if (qi && G) { const st = route.find(x => x.id === qi.dataset.id); if (st) { const n = Math.round(Number(qi.value)); st.qty = {...(st.qty || {})}; if (n > 0) st.qty[qi.dataset.bkQty] = Math.min(999, n); else delete st.qty[qi.dataset.bkQty]; if (!Object.keys(st.qty).length) delete st.qty; } drawSide(); return; }
        const au = e.target.closest('[data-bk-auto]'); if (au && G) { B().setAuto(G, au.value, au.dataset.bkAuto || null); drawAll(); return; }
        const ar = e.target.closest('[data-bk-autorecy]'); if (ar && G) { G.autoRecy = ar.checked; if (ar.checked && !G.people.some(p => p.hp > 0 && p.where === 'base' && p.job === 'recycler')) { const f = G.people.find(p => p.hp > 0 && p.where === 'base' && !p.baby && p.job === 'libre'); if (f) f.job = 'recycler'; } drawAll(); return; }
        const f = e.target.closest('[data-bk-import]'); if (f) importFile(f);
    }
    const firstFree = () => { for (let fi = 0; fi < G.floors.length; fi++) for (let si = 0; si < B().SLOTS; si++) if (!G.floors[fi].slots[si] && !G.builds.some(b => b.fi === fi && b.si === si)) return [fi, si]; return null; };
    function order(k, fi, si, at) { const r = B().orderBuild(G, k, fi, si); if (!r.ok) { toast(r.err, 'error'); return; } drawAll(); if (at) whoMenu('construire', at); }
    const pointOf = el => { const r = el?.getBoundingClientRect?.(); return r && r.width ? {x: r.left + Math.min(24, r.width / 2), y: r.bottom} : null; };
    /** 👷 qui creuse, qui construit : un clic met la personne à ce travail (ou l'en retire) */
    const JOB_L = {libre: 'rien de spécial', creuser: 'creuse', construire: 'construit', recycler: 'démonte le bric-à-brac', garde: 'monte la garde', pedaler: 'pédale'};
    function whoMenu(job, where) {
        const ppl = B().alive(G).filter(p => p.where === 'base' && !p.baby), menu = UI().menuAt;
        if (!ppl.length || !menu) { tab = 'gens'; drawTop(); drawSide(); toast(ppl.length ? `Choisis « ${job === 'creuser' ? '⛏️ Creuser' : '🔨 Construire'} » comme travail.` : 'Personne au bunker pour ce travail.', ppl.length ? '' : 'error'); return; }
        const at = where instanceof Element ? pointOf(where) : where;
        menu(at || where, [...ppl.map(p => ({icon: p.job === job ? '✅' : '⬜', label: p.name, help: p.job === job ? 'clic : le retirer de ce travail' : `fait : ${JOB_L[p.job] || p.job}${p.sulk ? ' · n’a plus le moral' : ''}`,
            run: () => { B().setJob(G, p.id, p.job === job ? 'libre' : job); drawAll(); whoMenu(job, at || where); }})), '-',
            {icon: '👥', label: 'Voir tous les habitants', run: () => { tab = 'gens'; drawTop(); drawSide(); }}], {title: job === 'creuser' ? '⛏️ Qui creuse ?' : '🔨 Qui construit ?'});
    }
    /** ⛶ plein écran : le vrai plein écran du navigateur si possible, sinon la fenêtre prend tout l'écran */
    function toggleFull(force) {
        if (!dlg) return; const on = force ?? !dlg.classList.contains('is-max');
        dlg.classList.toggle('is-max', on);
        if (on && !document.fullscreenElement) dlg.requestFullscreen?.()?.catch?.(() => {});
        if (!on && document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => {});
        const fb = dlg.querySelector('[data-bk-full]'); if (fb) { fb.setAttribute('aria-pressed', String(on)); fb.title = on ? 'Quitter le plein écran' : 'Plein écran'; }
    }
    document.addEventListener('fullscreenchange', () => { if (dlg && !document.fullscreenElement && dlg.classList.contains('is-max')) toggleFull(false); });
    /** ↔ réarranger sans frais : choisir une installation, puis la place où la mettre (ou la glisser) */
    function moveTo(fi, si) { const [a, b] = moveFrom; moveFrom = null; if (a === fi && b === si) { drawWorld(); return; } const r = B().moveItem(G, a, b, fi, si); if (!r.ok) toast(r.err, 'error'); drawAll(); }
    function slotMenu(btn, fi, si) {
        if (moveFrom) { moveTo(fi, si); return; }
        const pt = pointOf(btn); // le bunker se redessine pendant que le menu est ouvert : on garde l'endroit du clic
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
                ...(busyB ? [{icon: '👷', label: 'Qui construit ?', run: () => whoMenu('construire', pt || btn)}] : []),
                {icon: '↔', label: 'Déplacer', help: 'sans frais : clique ensuite sur une autre place (ou glisse-le)', run: () => { moveFrom = [fi, si]; drawWorld(); }},
                {icon: '🪓', label: 'Démonter', help: brk ? 'en panne : on récupère un tiers des matériaux' : 'on récupère la moitié des matériaux', run: () => { B().dismantle(G, fi, si); drawAll(); }}];
        } else if (bi >= 0) items = [{icon: '👷', label: 'Qui construit ?', run: () => whoMenu('construire', pt || btn)}, {icon: '↔', label: 'Déplacer le chantier', help: 'sans frais : clique ensuite sur une autre place', run: () => { moveFrom = [fi, si]; drawWorld(); }}, {icon: '×', label: `Annuler « ${IT[G.builds[bi].k].name} »`, help: 'les matériaux reviennent', run: () => { B().cancelBuild(G, bi); drawAll(); }}];
        else items = G.plans.filter(p => G.opt?.chaines || !IT[p].chain).map(p => { const it = IT[p], miss = Object.entries(it.cost || {}).some(([r, n]) => (G.res[r] || 0) < n) || (it.tool && !G.tools.includes(it.tool));
            const n = needOf(p); return {icon: it.ico, label: it.name, help: miss ? `il manque : ${[...n.miss.map(([r, q, h]) => `${q - h} ${resName(r)[2].toLowerCase()}`), ...(n.tool ? [B().TOOLS[n.tool][1]] : [])].join(', ')}` : Object.entries(it.cost || {}).map(([r, q]) => `${q} ${resName(r)[2].toLowerCase()}`).join(', ') + (it.tool ? ` · ${B().TOOLS[it.tool][1]}` : ''), disabled: miss, run: () => order(p, fi, si, pt)}; }).sort((x, y) => x.disabled - y.disabled);
        if (menu) menu(btn, items, {title: k ? '' : 'Construire ici'}); else if (!k && bi < 0) order(G.plans[0], fi, si, pt);
    }
    function importFile(input) {
        const file = input.files?.[0]; input.value = ''; if (!file) return;
        if (file.size > 2e6) { toast('Ce fichier est trop gros pour être une partie du bunker.', 'error'); return; }
        file.text().then(txt => {
            let raw; try { raw = JSON.parse(txt); } catch (_) { throw new Error('Ce fichier n’est pas une partie du bunker.'); }
            G = B().check(raw?.lcnda === 'bunker' ? raw.g : raw); gid = 'b' + Date.now().toString(36); tab = 'gens'; play(); saveGame(gid, G, true); toast('✓ Partie ouverte.'); // rangée seulement si elle s'ouvre bien
        }).catch(err => toast(err.message || 'Fichier illisible.', 'error'));
    }
    document.addEventListener('keydown', e => { if (dlg?.open && G && (e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveGame(gid, G); } });
})();
