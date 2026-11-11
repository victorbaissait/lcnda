/* LCNDA — ☢ Le bunker : l'écran (le moteur est dans heritage-bunker-moteur.js).
 * Bien caché : Pièce d'archives (Konami code) → porte « Labo photo » → trois clics sur la lampe rouge → la trappe au sol.
 * Parties gardées sur cet ordinateur (localStorage « lcnda-bunker »), et dans un fichier (⤓ Exporter / ⤒ Ouvrir).
 * 🏆 Succès et records gardés sur cet ordinateur aussi (« lcnda-bunker-records », pas « genealogie-… » qui part dans la base) ; jamais rien en base.
 * ⏪ Les 7 derniers matins de chaque partie sont gardés dans la partie (moteur : morningSave / rewind).
 * 🗺️ L'onglet « Région » : la carte dessinée par le jeu (SVG, aucun fond en ligne), les convois, les groupes de survivants ;
 * 🏚️ les bâtiments à remettre en état sont sur le plan de la ville ; 🧓 les souvenirs des ancêtres en bulle (option).
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
    // 🌐 la traduction (docs/I18N.md) : phrases entières ; les années passent par String() (sinon « 1 709 » en français)
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : s);
    const lc = s => (window.LCNDA_I18N?.lang === 'de' ? String(s ?? '') : String(s ?? '').toLowerCase()); // un nom dans une phrase (l’allemand garde la majuscule)

    /* ═════════ Les parties gardées ═════════ */
    const store = () => { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return {games: o.games && typeof o.games === 'object' ? o.games : {}, last: o.last || ''}; } catch (_) { return {games: {}, last: ''}; } };
    function saveGame(id, g, quiet = false) {
        const s = store(); s.games[id] = {name: meOf(g)?.name || i18n('Sans nom'), city: g.city.name, saved: Date.now(), g}; s.last = id;
        noteBest(id, g);
        // plus de place sur cet ordinateur : on retire d'abord les matins gardés des autres parties, puis on n'en garde que 3 pour celle-ci
        const tries = [() => {}, () => Object.entries(s.games).forEach(([k, x]) => { if (k !== id && x?.g?.mornings?.length) x.g = {...x.g, mornings: []}; }), () => { s.games[id] = {...s.games[id], g: {...g, mornings: (g.mornings || []).slice(-3)}}; }];
        for (const shrink of tries) { shrink(); try { localStorage.setItem(KEY, JSON.stringify(s)); if (!quiet) toast(i18n('✓ Partie enregistrée.')); return true; } catch (_) { /* on essaie plus petit */ } }
        toast(i18n('La partie n’a pas pu être enregistrée (plus de place sur cet ordinateur) : exporte-la dans un fichier.'), 'error'); return false;
    }
    /* ═════════ 🏆 Succès et records (sur cet ordinateur) ═════════ */
    const RKEY = 'lcnda-bunker-records'; // « lcnda- » comme les parties : les clés « genealogie-… » sont recopiées dans la base (save_settings), celle-ci jamais
    const recs = () => { try { const o = JSON.parse(localStorage.getItem(RKEY) || '{}'); return {ach: o.ach && typeof o.ach === 'object' ? o.ach : {}, best: o.best && typeof o.best === 'object' ? o.best : {}}; } catch (_) { return {ach: {}, best: {}}; } };
    const recSave = r => { try { localStorage.setItem(RKEY, JSON.stringify(r)); } catch (_) { /* tant pis : la partie continue */ } };
    /** les succès que la partie vient de gagner : gardés (date du jour) et annoncés une seule fois (message en bas à gauche) */
    function noteAch(g) {
        const keys = Array.isArray(g?.achNew) ? g.achNew.splice(0) : []; if (!keys.length) return;
        const r = recs(); let changed = false;
        keys.forEach(k => { const a = B().ACH.find(x => x[0] === k); if (!a || r.ach[k]) return; r.ach[k] = {at: new Date().toISOString(), who: meOf(g).name, scen: g.scen, day: B().dayOf(g.t)}; changed = true; toast(i18n('🏆 Succès : {ico} {name}', {ico: a[1], name: a[2]})); });
        if (changed) recSave(r);
    }
    /** la meilleure partie : une ligne par partie (jours tenus, habitants, scénario, difficulté, date), les 30 meilleures */
    function noteBest(id, g) {
        if (!id || !g) return; const r = recs(), al = g.people.filter(p => p.hp > 0).length, days = B().dayOf(g.t) - 1;
        r.best[id] = {days, pop: al, tot: g.people.length, scen: g.scen, diff: g.diff, at: new Date().toISOString(), name: meOf(g).name, city: g.city.name, over: !!g.over, won: !!g.won};
        r.best = Object.fromEntries(Object.entries(r.best).filter(([, x]) => x && typeof x === 'object').sort((a, b) => (b[1].days - a[1].days) || (b[1].pop - a[1].pop)).slice(0, 30));
        recSave(r);
    }
    const meOf = g => g.people.find(p => p.me) || g.people[0];

    /* ═════════ La fenêtre ═════════ */
    let moveFrom = null, dragging = false;
    let overSaved = false, dlg = null, G = null, gid = '', tab = 'gens', placeSel = null, timer = 0, acc = 0, lastTick = 0, lastSaveHour = -1;
    function open() {
        if (!B()) { toast(i18n('Le bunker n’a pas pu se charger.'), 'error'); return; }
        dlg?.remove();
        dlg = document.createElement('dialog'); dlg.className = 'bk-dlg'; dlg.setAttribute('aria-label', i18n('Le bunker')); dlg.dataset.ownClose = '1'; // la partie s'enregistre en fermant : pas de « Fermer sans enregistrer ? »
        document.body.append(dlg);
        dlg.addEventListener('cancel', e => { if (moveFrom || mapFull) { e.preventDefault(); e.stopPropagation(); if (moveFrom) { moveFrom = null; drawWorld(); } else { mapFull = false; drawSide(); } } }); // Échap : d'abord sortir du déplacement ou de la grande carte
        dlg.addEventListener('dragstart', e => { const sl = e.target.closest?.('[data-bk="slot"][draggable]'); if (!sl || !G) return; moveFrom = [Number(sl.dataset.f), Number(sl.dataset.s)]; dragging = true; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'bk'); sl.classList.add('is-movesrc'); });
        dlg.addEventListener('dragover', e => { if (dragging && e.target.closest?.('[data-bk="slot"]')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
        dlg.addEventListener('drop', e => { const sl = e.target.closest?.('[data-bk="slot"]'); if (!dragging || !sl) return; e.preventDefault(); dragging = false; moveTo(Number(sl.dataset.f), Number(sl.dataset.s)); });
        dlg.addEventListener('dragend', () => { if (!dragging) return; dragging = false; moveFrom = null; drawWorld(); });
        dlg.addEventListener('close', () => { if (document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => {}); moveFrom = null; dragging = false; mapFull = false; stop(); SND.stop(); if (G && gid) saveGame(gid, G, true); G = null; dlg?.remove(); dlg = null; });
        dlg.addEventListener('click', onClick); dlg.addEventListener('change', onChange); dlg.addEventListener('pointerdown', () => { if (!G || !SND.pref.on) return; const first = !SND.ready(); SND.unlock(); if (first) SND.reset(G); SND.update(G); });
        dlg.addEventListener('mousemove', chartHover); dlg.addEventListener('mouseout', e => { if (!e.relatedTarget || !e.relatedTarget.closest?.('svg[data-bk-chart]')) chartLeave(e); });
        dlg.addEventListener('keydown', e => { const rb = e.target.closest?.('[data-bk][role="button"]'); if (rb && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick({target: rb}); return; }
            if (e.key === ' ' && G && !e.target.closest('input, textarea, select, button, .pk')) { e.preventDefault(); setSpeed(G.speed ? 0 : 1); } });
        dlg.showModal(); startScreen();
    }
    ext.openBunker = open;
    /** pour les tests : la partie en cours, et redessiner (jamais utilisé par l'app) */
    ext.bunkerDebug = {game: () => G, redraw: () => { if (G && dlg) { noteAch(G); drawAll(); } }};

    /* ═════════ L'accueil : continuer ou commencer ═════════ */
    async function startScreen() {
        stop(); G = null; gid = '';
        const s = store(), saved = Object.entries(s.games).sort((a, b) => b[1].saved - a[1].saved);
        dlg.innerHTML = `<div class="bk-start">
            <header class="bk-start-head"><span class="bk-hatch-ico" aria-hidden="true"></span><div><span class="eyebrow">☢ TU AS TROUVÉ LA TRAPPE</span><h2>Le bunker</h2><p class="muted">Personne ne sait qu’il existe. Tu y descends avec des ancêtres de ton arbre : il faut boire, manger, dormir, se laver… et tenir le plus longtemps possible.</p><p><button type="button" class="button small secondary" data-bk="records">🏆 Succès et records</button></p></div><button type="button" class="icon-button" data-bk="close" aria-label="Fermer">×</button></header>
            ${saved.length ? `<section class="bk-card"><h3>Parties enregistrées</h3><div class="bk-saves">${saved.map(([id, x]) => { const g = x.g; const al = g.people.filter(p => p.hp > 0).length;
                return `<div class="bk-save"><div><b>${esc(i18n('Le bunker de {name}', {name: x.name}))}</b><small>${esc(x.city)} · ${esc(i18n('jour {n}', {n: B().dayOf(g.t)}))} · ${esc(g.over ? i18n('☠️ terminé') : i18n('{a} sur {b} en vie', {a: al, b: g.people.length}))}</small></div><button type="button" class="button small" data-bk="resume" data-id="${esc(id)}">${esc(g.over ? i18n('Revoir') : i18n('Continuer'))}</button><button type="button" class="icon-button small" data-bk="delsave" data-id="${esc(id)}" title="Supprimer cette partie" aria-label="Supprimer">🗑</button></div>`; }).join('')}</div></section>` : ''}
            <form class="bk-card bk-new" data-bk-new><h3>Nouvelle partie</h3>
                <div class="bk-field"><span class="pk-lab">Scénario</span><select name="bk_scen">${scenOptions()}</select><p class="ui-hint" data-bk-scendesc></p></div>
                <div class="bk-field bk-hist" data-bk-hist hidden><div class="bk-histline" data-bk-histline>${window.LCNDA_UI.spinner(i18n('On cherche les ancêtres qui vivaient à cette date…'))}</div>
                    <label>Combien descendent dans l’abri (avec toi) ? <select name="bk_hn">${[1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}" ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
                <div data-bk-modern><div class="bk-field"><span class="pk-lab">Qui incarnes-tu ?</span>${P() ? P().pickerField({name: 'bk_me', kind: 'person', animals: false}) : `<input name="bk_me_txt" placeholder="${esc(i18n('Ton nom'))}">`}</div>
                <div class="bk-field"><span class="pk-lab">Qui descend avec toi ?</span><div class="bk-team-tools"><label>Combien <select name="bk_n">${[0, 1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></label><button type="button" class="button small secondary" data-bk="propose" title="Ses proches d’abord : parents, conjoint, enfants, frères et sœurs">🎲 Proposer des proches</button></div>${P() ? P().pickerField({name: 'bk_team', kind: 'person', multiple: true, animals: false}) : ''}</div>
                <div class="bk-field"><span class="pk-lab">Dans quelle ville ?</span><div class="bk-city"><select name="bk_city"><option value="">…</option></select><input name="bk_city_txt" placeholder="ou tape un nom de ville" maxlength="80"></div></div></div>
                <div class="bk-field"><span class="pk-lab">🧳 Le coffre de famille <small class="muted">(3 objets de ta base au plus : chacun donne un petit avantage)</small></span><div class="bk-coffre" data-bk-coffre>${window.LCNDA_UI.spinner(i18n('Lecture des objets de famille…'))}</div></div>
                <div class="bk-field"><span class="pk-lab">Taille de la ville</span><div class="segmented bk-size" role="radiogroup">${Object.entries(B().SIZES).map(([k, [n, nb, l]]) => `<label><input type="radio" name="bk_size" value="${k}" ${k === 'moyenne' ? 'checked' : ''}><span>${esc(l)} <small>${esc(i18n('{n} lieux', {n: nb}))}</small></span></label>`).join('')}</div></div>
                <details class="bk-field bk-setup" open><summary class="pk-lab">⚙️ Réglages de la partie</summary>
                    <div class="bk-field"><span class="pk-lab">Difficulté</span><div class="segmented bk-size" role="radiogroup">${Object.entries(B().DIFFS).map(([k, d]) => `<label><input type="radio" name="bk_diff" value="${k}" ${k === 'normal' ? 'checked' : ''}><span>${esc(d.l)}</span></label>`).join('')}</div></div>
                    <label class="checkbox-line"><input type="checkbox" name="bk_meteo" checked> 🌪️ Météo et catastrophes <small class="muted">(canicule, tempête, inondation, séisme, orage, vague de froid : des installations à réparer)</small></label>
                    <label class="checkbox-line"><input type="checkbox" name="bk_chaines"> 🧵 Chaînes de fabrication <small class="muted">(plantes → fil → tissu → vêtements chauds ; blé → farine → pain)</small></label>
                    <label class="checkbox-line"><input type="checkbox" name="bk_age"> 🧓 Vieillir <small class="muted">(un jour = un an : les bébés grandissent, les aînés ralentissent)</small></label>
                    <label class="checkbox-line"><input type="checkbox" name="bk_feu"> 🔥 Incendies <small class="muted">(un poêle, un court-circuit… un extincteur sauve tout)</small></label>
                    <label class="checkbox-line"><input type="checkbox" name="bk_nuit"> 🌗 La nuit en ville <small class="muted">(certains lieux sont dangereux la nuit, d’autres cachent plus de choses)</small></label>
                    <label class="checkbox-line"><input type="checkbox" name="bk_missions" checked> 📜 Missions généalogiques <small class="muted">(retrouver l’acte, la photo ou la lettre d’un vrai ancêtre de ton arbre)</small></label>
                    <label class="checkbox-line"><input type="checkbox" name="bk_souvenirs" checked> 🧓 Souvenirs des ancêtres <small class="muted">(un ancêtre de ta base qui trouve un objet ou un lieu de sa vraie vie raconte une anecdote tirée de sa fiche : métier, naissance, mariage, enfants ; jamais rien sur un vivant ni une fiche confidentielle)</small></label>
                    <label class="checkbox-line"><input type="checkbox" name="bk_tuto" ${Object.keys(s.games).length ? '' : 'checked'}> 📘 Tutoriel guidé <small class="muted">(les premiers pas, étape par étape)</small></label>
                    <small class="muted">Tout se change aussi pendant la partie : onglet ⚙️ Réglages (sauf le scénario).</small></details>
                <div class="bk-actions"><label class="button secondary bk-import">⤒ Ouvrir une partie (fichier)<input type="file" accept=".json,application/json" data-bk-import hidden></label><span class="spacer"></span><button type="submit" class="button">☢ Descendre dans le bunker</button></div>
            </form></div>`;
        const form = dlg.querySelector('[data-bk-new]');
        form.addEventListener('submit', e => { e.preventDefault(); begin(e.target); });
        form.elements.bk_scen.addEventListener('change', () => histUi(form)); histUi(form);
        fillCoffre();
        tree().then(() => { if (dlg?.contains(form)) { const v = form.elements.bk_scen.value; form.elements.bk_scen.innerHTML = scenOptions(); form.elements.bk_scen.value = v; histUi(form); } }).catch(() => {});
        // les villes de l'arbre, les plus fréquentes d'abord
        try {
            const tr = await tree(); const n = new Map();
            tr.people.forEach(p => [p.bplace, p.dplace].forEach(id => { if (id && tr.places[id]) n.set(id, (n.get(id) || 0) + 1); }));
            const sel = dlg?.querySelector('select[name="bk_city"]'); if (!sel) return;
            const list = [...n].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([id]) => tr.places[id].name.split(',')[0].trim()).filter((v, i, a) => v && a.indexOf(v) === i);
            sel.innerHTML = `<option value="">${esc(i18n('Choisir une ville de ton arbre…'))}</option>${list.map(v => `<option>${esc(v)}</option>`).join('')}`;
            if (list[0]) sel.value = list[0];
        } catch (_) { /* sans arbre : on tape le nom */ }
    }
    /** les scénarios : ceux d'aujourd'hui, puis les historiques avec combien d'ancêtres de ta famille vivaient à cette date */
    function scenOptions() {
        const S = B().SCENARIOS, H = B().HIST, opt = ([k, [ico, l]]) => { const n = H[k] && treeDone ? histOf(k).all.length : null; return `<option value="${k}">${ico} ${esc(l)}${n == null ? '' : ` · ${esc(n ? i18n('{n} de ta famille', {n: plural(n, 'ancêtre')}) : i18n('aucun ancêtre de ta famille'))}`}</option>`; };
        return `<optgroup label="${esc(i18n('Aujourd’hui'))}">${Object.entries(S).filter(([k]) => !H[k]).map(opt).join('')}</optgroup><optgroup label="${esc(i18n('📜 Dans l’histoire, avec tes ancêtres'))}">${Object.entries(S).filter(([k]) => H[k]).map(opt).join('')}</optgroup>`;
    }
    let treeDone = null;
    const histCache = new Map();
    /** les ancêtres de l'arbre qui vivaient à la date d'un scénario (jamais un vivant ni une fiche confidentielle : moteur, histPool) */
    function histOf(k) { if (!treeDone) return {all: [], local: 0}; if (!histCache.has(k)) histCache.set(k, B().histPool(k, treeDone.people, treeDone.places)); return histCache.get(k); }
    /** un scénario historique : on cache « qui incarnes-tu », l'équipe et la ville ; on dit combien d'ancêtres y vivaient */
    function histUi(form) {
        const k = form.elements.bk_scen.value, H = B().HIST[k], S = B().SCENARIOS[k];
        form.querySelector('[data-bk-scendesc]').textContent = S ? `${S[2]} ${i18n('Pour gagner : tenir {n} jours, puis la partie continue sans fin.', {n: B().SCEN_GOAL[k]})}` : '';
        form.querySelector('[data-bk-hist]').hidden = !H; form.querySelector('[data-bk-modern]').hidden = !!H;
        if (!H || !treeDone) return;
        const P0 = histOf(k), Y = H.date[0], n = P0.all.length, line = form.querySelector('[data-bk-histline]');
        const hv = {who: esc(plural(n, 'ancêtre')), y: String(Y), l: P0.local, region: esc(H.region)};
        line.innerHTML = n ? (n > 1 ? (P0.local ? i18n('👥 <b>{who} de ta famille</b> vivaient en {y}, dont {l} {region} : ils descendent dans l’abri, ceux de la région d’abord. S’il en manque, des habitants inventés de l’époque complètent le groupe.', hv) : i18n('👥 <b>{who} de ta famille</b> vivaient en {y} : ils descendent dans l’abri, ceux de la région d’abord. S’il en manque, des habitants inventés de l’époque complètent le groupe.', hv))
            : (P0.local ? i18n('👥 <b>{who} de ta famille</b> vivait en {y}, dont {l} {region} : il ou elle descend dans l’abri, ceux de la région d’abord. S’il en manque, des habitants inventés de l’époque complètent le groupe.', hv) : i18n('👥 <b>{who} de ta famille</b> vivait en {y} : il ou elle descend dans l’abri, ceux de la région d’abord. S’il en manque, des habitants inventés de l’époque complètent le groupe.', hv)))
            : esc(i18n('👥 Aucun ancêtre de ta famille ne vivait en {y} (d’après les dates de naissance et de décès de ta base) : le groupe sera fait d’habitants inventés de l’époque.', {y: String(Y)}));
    }
    /** le coffre : les objets de famille de la base, à cocher (3 au plus) */
    let objs = [];
    async function fillCoffre() {
        const box = dlg?.querySelector('[data-bk-coffre]'); if (!box) return;
        try { objs = ((await A().api('family_objects'))?.objects || []).slice(0, 60); } catch (_) { objs = []; }
        if (!dlg?.contains(box)) return;
        const hint = o => { const t = `${o.title || ''} ${o.kind || ''} ${o.description || ''}`.toLowerCase(); return B().HEIRLOOMS.find(([, re]) => re.test(t))[2]; };
        box.innerHTML = objs.length ? `<div class="bk-coffre-list">${objs.map((o, i) => `<label class="checkbox-line"><input type="checkbox" name="bk_obj" value="${i}"><span>${esc(o.title || i18n('Objet'))}<small class="muted"> · ${esc(hint(o))}</small></span></label>`).join('')}</div>`
            : A().emptyState({size: 'small', icon: '🧳', text: i18n('Aucun objet de famille dans ta base (Listes › Objets de famille) : le coffre partira vide.')});
        box.addEventListener('change', e => { if (!e.target.matches('[name="bk_obj"]')) return; const on = box.querySelectorAll('[name="bk_obj"]:checked'); if (on.length > 3) { e.target.checked = false; toast(i18n('Le coffre ne contient que 3 objets.')); } });
    }
    let treeP = null;
    function tree() { treeP = treeP || (ext.tresors?.T?.tree ? ext.tresors.T.tree() : A().api('tresor_tree').then(d => ({...d, byId: new Map(d.people.map(p => [p.id, p]))}))); return treeP.then(t => { treeDone = t; return t; }).catch(e => { treeP = null; throw e; }); }
    /** jamais un vivant, une fiche confidentielle ni une fiche cachée au partage (vivant probable) parmi ceux que le jeu choisit seul */
    const shareable = p => p && !p.living && !p.priv && !p.sh && !p.mem;
    const nameOf = p => (p ? p.name || [p.first, p.last].filter(Boolean).join(' ') || i18n('Sans nom') : i18n('Sans nom'));
    /** les proches d'abord (parents, conjoints, enfants, frères et sœurs), puis d'autres ancêtres au hasard */
    async function propose(form) {
        const me = Number(P()?.pickerValue(form.querySelector('[data-picker][data-pk-opts*="bk_me"]')) || 0), n = Number(form.elements.bk_n.value) || 0;
        let tr; try { tr = await tree(); } catch (_) { toast(i18n('L’arbre n’a pas pu être lu.'), 'error'); return; }
        const out = [], push = id => { if (id && id !== me && !out.includes(id) && tr.byId.get(id)) out.push(id); };
        const p = tr.byId.get(me);
        if (p) {
            [p.father, p.mother].forEach(push);
            (tr.families || []).filter(f => f.a === me || f.b === me).forEach(f => { push(f.a === me ? f.b : f.a); (f.children || []).forEach(push); });
            (tr.families || []).filter(f => f.children?.includes(me)).forEach(f => f.children.forEach(push));
        }
        const rest = tr.people.filter(x => shareable(x) && x.id !== me && !out.includes(x.id)).map(x => x.id);
        while (out.length < n && rest.length) push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
        const field = form.querySelector('[data-picker][data-pk-opts*="bk_team"]');
        if (field) P().pickerSet(field, out.slice(0, n));
    }
    async function begin(form) {
        const scen = form.elements.bk_scen?.value || 'classique';
        if (B().HIST[scen]) return beginHist(form, scen);
        const meField = form.querySelector('[data-picker][data-pk-opts*="bk_me"]'), teamField = form.querySelector('[data-picker][data-pk-opts*="bk_team"]');
        const meId = Number(meField ? P().pickerValue(meField) : 0) || 0;
        if (meField && !meId) { UI().fail?.(meField, i18n('Choisis l’ancêtre que tu incarnes.')); return; }
        const teamIds = (teamField ? [].concat(P().pickerValue(teamField) || []) : []).map(Number).filter(id => id && id !== meId).slice(0, 6);
        let tr = null; try { tr = await tree(); } catch (_) { /* les noms viendront des pastilles */ }
        const who = id => { const p = tr?.byId.get(id); return {pid: id, name: p ? nameOf(p) : i18n('Fiche {n}', {n: String(id)}), gender: p?.gender || '', occ: p?.occ || '', by: p?.by || 0}; };
        const city = (form.elements.bk_city_txt.value.trim() || form.elements.bk_city.value || '').slice(0, 80);
        if (!city) { UI().fail?.(form.elements.bk_city_txt, i18n('Choisis ou tape une ville.')); return; }
        const coffre = [...form.querySelectorAll('[name="bk_obj"]:checked')].slice(0, 3).map(i => objs[Number(i.value)]).filter(Boolean).map(o => ({title: o.title, kind: o.kind, description: o.description}));
        const more = await fromTree(tr, [meId, ...teamIds].filter(Boolean), city);
        const month = new Date().getMonth(), season0 = month >= 2 && month <= 4 ? 0 : month >= 5 && month <= 7 ? 1 : month >= 8 && month <= 10 ? 2 : 3;
        // les objets de famille qui ne sont pas dans le coffre : on peut les retrouver dans les ruines
        const chosen = new Set([...form.querySelectorAll('[name="bk_obj"]:checked')].map(i => Number(i.value)));
        const ruins = objs.filter((o, i) => !chosen.has(i)).sort(() => Math.random() - 0.5).slice(0, 12).map(o => ({title: o.title, kind: o.kind, description: o.description}));
        const setup = {diff: form.elements.bk_diff?.value || 'normal', scen, opt: Object.fromEntries(B().OPT_KEYS.map(k => [k, !!form.elements['bk_' + k]?.checked]))};
        G = B().newGame({me: meId ? who(meId) : {name: form.elements.bk_me_txt?.value || i18n('Moi')}, team: teamIds.map(who), city: {name: city, size: form.elements.bk_size.value}, coffre, season0, ruins, ...setup, ...more});
        await locateCity(G.city);
        gid = 'b' + Date.now().toString(36); saveGame(gid, G, true); tab = 'gens'; placeSel = null; route = []; mapScroll = null; play();
    }

    /** 📜 un scénario historique : les ancêtres qui vivaient à cette date (ceux de la région d'abord), complétés par des habitants inventés */
    async function beginHist(form, scen) {
        const H = B().HIST[scen], n = Math.max(1, Math.min(7, Number(form.elements.bk_hn?.value) || 4));
        let tr = null; try { tr = await tree(); } catch (_) { /* sans arbre : des habitants inventés */ }
        const pool = histOf(scen).all.slice(), mix = l => l.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
        const all = [...mix(pool.filter(p => p.local)), ...mix(pool.filter(p => !p.local))].sort((a, b) => (b.local - a.local) || ((b.age >= 16) - (a.age >= 16))), team = all.slice(0, n), ids = team.map(p => p.pid).filter(Boolean);
        const coffre = [...form.querySelectorAll('[name="bk_obj"]:checked')].slice(0, 3).map(i => objs[Number(i.value)]).filter(Boolean).map(o => ({title: o.title, kind: o.kind, description: o.description}));
        const chosen = new Set([...form.querySelectorAll('[name="bk_obj"]:checked')].map(i => Number(i.value)));
        const ruins = objs.filter((o, i) => !chosen.has(i)).sort(() => Math.random() - 0.5).slice(0, 12).map(o => ({title: o.title, kind: o.kind, description: o.description}));
        const more = await fromTree(tr, ids, H.city);
        more.extras = all.slice(n, n + 12).map(p => ({pid: p.pid, name: p.name, gender: p.gender, occ: p.occ, by: p.by})); // les voyageurs à la trappe : eux aussi de l'époque
        const setup = {diff: form.elements.bk_diff?.value || 'normal', scen, opt: Object.fromEntries(B().OPT_KEYS.map(k => [k, !!form.elements['bk_' + k]?.checked]))};
        G = B().newGame({me: team[0], team: team.slice(1), want: n, city: {name: H.city, size: form.elements.bk_size.value}, coffre, ruins, ...setup, ...more});
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
            const shuffled = tr.people.filter(p => shareable(p) && !ids.includes(p.id)).sort(() => Math.random() - 0.5);
            out.extras = shuffled.slice(0, 12).map(p => ({pid: p.id, name: nameOf(p), gender: p.gender || '', occ: p.occ || '', by: p.by || 0}));
            const here = p => p.bplace && tr.places[p.bplace] && fold(String(tr.places[p.bplace].name).split(',')[0]) === fold(city);
            out.homes = [...tr.people.filter(p => ids.includes(p.id) && here(p)), ...tr.people.filter(p => !ids.includes(p.id) && here(p))].slice(0, 2).map(p => ({name: nameOf(p), by: p.by || 0}));
            const firsts = g => [...new Set(tr.people.filter(p => p.gender === g).map(p => String(p.first || '').split(/[\s-]/)[0]).filter(x => x && x.length > 1))].slice(0, 60);
            out.names = {f: firsts('female'), m: firsts('male')};
            // 📜 les ancêtres des missions : de vraies fiches (nom, naissance, lieu, métier) ; rien n'est jamais écrit dans l'arbre
            const married = id => (tr.families || []).some(f => f.a === id || f.b === id);
            out.ancestors = tr.people.filter(shareable).sort(() => Math.random() - 0.5).slice(0, 30).map(p => ({pid: p.id, name: nameOf(p), by: p.by || 0, bplace: p.bplace && tr.places[p.bplace] ? String(tr.places[p.bplace].name).split(',')[0] : '', occ: p.occ || '', married: married(p.id), dy: p.dy || 0}));
            // 🧓 les souvenirs : ce que dit la fiche (métier, naissance, mariage, enfants), seulement pour les ancêtres qu'on peut montrer (jamais un vivant ni une fiche confidentielle)
            const town = id => (id && tr.places[id] ? String(tr.places[id].name).split(',')[0].trim() : '');
            out.mem = {}; [...ids, ...out.extras.map(x => x.pid)].forEach(id => { const p = tr.byId.get(id); if (!shareable(p)) return; const fam = (tr.families || []).find(f => f.a === id || f.b === id), sp = fam ? tr.byId.get(fam.a === id ? fam.b : fam.a) : null;
                const kids = (tr.families || []).filter(f => f.a === id || f.b === id).flatMap(f => f.children || []).map(c => tr.byId.get(c)).filter(shareable).map(c => c.by || 0);
                out.mem[id] = {occ: p.occ || '', by: p.by || 0, bplace: town(p.bplace), my: fam?.my || 0, mplace: town(fam?.mplace), spouse: shareable(sp) ? nameOf(sp) : '', kids}; });
            // 🗺️ les villes de la région : celles de l'arbre (naissances, décès des ancêtres qu'on peut montrer), les plus fréquentes d'abord
            const nT = new Map(); tr.people.filter(shareable).forEach(p => [p.bplace, p.dplace].forEach(id => { const t = town(id); if (t && fold(t) !== fold(city)) nT.set(t, (nT.get(t) || 0) + 1); }));
            out.regionNames = [...nT].sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
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
        moveFrom = null; dragging = false; mapFull = false; overSaved = !!G.over; noteAch(G);
        lastSaveHour = Math.floor(G.t / 360);
        dlg.innerHTML = `<div class="bk-game">
            <header class="bk-top"><b class="bk-title">☢ ${esc(i18n('Le bunker de {name}', {name: meOf(G).name}))}</b><span class="bk-clock" data-bk-clock></span><span class="bk-state" data-bk-state></span><span class="spacer"></span>
                <div class="segmented bk-speed" role="group" aria-label="${esc(i18n('Vitesse'))}">${[[0, '⏸', 'Pause (Espace)'], [1, '×1', '1 heure de jeu en 6 secondes'], [2, '×2', 'Deux fois plus vite'], [4, '×4', 'Quatre fois plus vite'], [8, '×8', 'Huit fois plus vite'], [16, '×16', 'Seize fois plus vite (une journée en moins de 10 secondes)'], [32, '×32', 'Trente-deux fois plus vite (une journée en moins de 5 secondes)']].map(([v, l, t]) => `<button type="button" data-bk="speed" data-v="${v}" title="${esc(i18n(t))}">${l}</button>`).join('')}</div>
                <button type="button" class="icon-button small" data-bk="full" data-bk-full title="Plein écran" aria-label="Plein écran" aria-pressed="false">⛶</button><button type="button" class="icon-button small" data-bk="mute" data-bk-mute title="Couper ou remettre le son" aria-label="Son">🔊</button><button type="button" class="button small secondary" data-bk="gazette" title="Le journal de la partie">📰 Gazette</button><button type="button" class="button small" data-bk="save" data-shortcut="⌘S">💾 Enregistrer</button><button type="button" class="button small secondary" data-bk="menu">↩ Parties</button><button type="button" class="icon-button small" data-bk="more" title="Plus d’actions" aria-label="Plus d’actions">⋯</button><button type="button" class="icon-button" data-bk="close" aria-label="Fermer">×</button></header>
            <p class="bk-news" data-bk-news aria-live="polite"></p><div class="bk-tuto" data-bk-tuto hidden></div><div class="bk-visit" data-bk-visit hidden></div>
            <div class="bk-main"><section class="bk-world" data-bk-world></section><aside class="bk-side"><div class="segmented bk-tabs" role="tablist">${[['gens', '👥 Habitants'], ['res', '📦 Réserves'], ['atelier', '🛠️ Atelier'], ['bric', '♻️ Bric-à-brac'], ['ville', '🏙️ Ville'], ['region', '🗺️ Région'], ['famille', '🌳 Famille'], ['radio', B().crier(G) ? '📯 Crieur' : '📻 Radio'], ['stats', '📊 Stats'], ['regl', '⚙️ Réglages']].map(([k, l]) => `<button type="button" role="tab" data-bk="tab" data-v="${k}">${esc(i18n(l))}</button>`).join('')}</div><div class="bk-sbody" data-bk-side></div></aside></div><div class="bk-gz" data-bk-gz hidden></div></div>`;
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
        catch (err) { stop(); console.error(err); toast(i18n('La partie s’est arrêtée sur une erreur (fichier abîmé ?).'), 'error'); return; }
        if (!n) return;
        noteAch(G);
        if (G.over && !overSaved) { overSaved = true; saveGame(gid, G, true); }
        if (Math.floor(G.t / 360) !== lastSaveHour) { lastSaveHour = Math.floor(G.t / 360); saveGame(gid, G, true); } // toutes les 6 h de jeu
        drawAll(true); SND.update(G); SND.events(G);
    }
    function setSpeed(v) { if (!G) return; G.speed = v; drawTop(); }
    let hoverChart = false; // la souris sur une courbe : on ne redessine pas le panneau sous elle
    const busy = () => { const a = document.activeElement; return hoverChart || !!(a && dlg?.contains(a) && a.closest('[data-bk-side]') && a.matches('select, input, textarea')) || !!document.querySelector('.ui-menu, .lc-menu-pop, .ui-actmenu'); };
    function drawAll(fromTick = false) { drawTop(); drawWorld(); if (!fromTick || !busy()) drawSide(); const mu = dlg?.querySelector('[data-bk-mute]'); if (mu) { mu.textContent = SND.pref.on ? '🔊' : '🔇'; mu.setAttribute('aria-pressed', String(!SND.pref.on)); } }

    function drawTop() {
        const c = dlg.querySelector('[data-bk-clock]'); if (!c) return;
        const night = B().isNight(G.t);
        const dt = B().dateOf(G); c.textContent = `${i18n('Jour {n}', {n: B().dayOf(G.t)})}${dt ? ` · ${dt}` : ''} · ${B().clock(G.t)}`;
        const S = B().SEASONS.find(x => x[0] === B().seasonOf(G)), src = i18n({essence: 'groupe électrogène', soleil: 'panneau solaire', vent: 'éolienne', pedales: 'dynamo à pédales', eau: 'turbine hydraulique', batteries: 'banc de batteries'}[G.powerSrc] || '');
        dlg.querySelector('[data-bk-state]').innerHTML = `<span title="${esc(G.cold ? i18n('{season} : il fait froid dans le bunker', {season: S[2]}) : S[2])}">${S[1]}${G.cold ? '🥶' : ''}</span> <span title="${esc(i18n(night ? 'Nuit' : 'Jour'))}">${G.weather.rain ? '🌧️' : night ? '🌙' : '☀️'}</span>${G.event ? ` <span class="bk-event" title="${esc(B().EVENTS[G.event.k][1])} : ${esc(B().EVENTS[G.event.k][2])}">${B().EVENTS[G.event.k][0]}</span>` : ''}${Object.keys(G.broken || {}).length ? ` <span title="${esc(i18n('{n} installation(s) en panne', {n: Object.keys(G.broken).length}))}">🔧${Object.keys(G.broken).length}</span>` : ''} ${!B().eraOf(G).elec ? `<span title="${esc(i18n('Pas d’électricité à cette époque : on s’éclaire à la chandelle'))}">🕯️</span>` : `<span class="${G.power ? 'is-on' : 'is-off'}" title="${esc(G.power ? i18n('Électricité ({src})', {src}) : i18n('Pas d’électricité'))}">${G.power ? ({soleil: '☀️⚡', vent: '🌬️⚡', pedales: '🚲⚡', eau: '💧⚡'}[G.powerSrc] || '⚡') : '🔌'}</span>`}${G.air < 30 ? ` <span title="${esc(i18n('L’air est lourd'))}">🌀</span>` : ''}${(G.convoys || []).length ? ` <span title="${esc(i18n('{n} dans la région', {n: plural(G.convoys.length, 'convoi')}))}">🧭${G.convoys.length}</span>` : ''}${(G.asks || []).length ? ` <span title="${esc(i18n('On vous demande de l’aide (onglet 🗺️ Région)'))}">🤲${G.asks.length}</span>` : ''}`;
        drawVisit();
        dlg.querySelectorAll('[data-bk="speed"]').forEach(b => { const on = Number(b.dataset.v) === G.speed; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); });
        dlg.querySelectorAll('[data-bk="tab"]').forEach(b => { const on = b.dataset.v === tab; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on); });
        const tu = dlg.querySelector('[data-bk-tuto]'), T = B().TUTO;
        if (tu) { const on = G.tuto >= 0 && G.tuto < T.length && !G.over; tu.hidden = !on; const sig = on ? String(G.tuto) : ''; if (tu.dataset.sig !== sig) { tu.dataset.sig = sig; tu.innerHTML = on ? `<span><b>${esc(i18n('📘 Tutoriel {a} / {b}', {a: G.tuto + 1, b: T.length}))}</b> ${esc(T[G.tuto][0])}</span><button type="button" class="button small secondary" data-bk="tutoskip">${esc(i18n('Passer le tutoriel'))}</button>` : ''; } }
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
        const grp = (G.groups || []).find(x => x.id === v.g), who = grp ? ` <small>(${esc(grp.name)} ${repBadge(grp.rep)})</small>` : '';
        const occ = v.person?.occ ? esc(v.person.occ.toLowerCase()) : '', info = v.person?.occ ? ` ${v.person.by ? i18n('({occ}, né·e en {y})', {occ, y: String(v.person.by)}) : `(${occ})`}` : '';
        box.innerHTML = v.k === 'marchand' ? `<span>${i18n('🔔 <b>Un marchand</b>{who} propose {give} contre {want}.', {who, give: `${r(v.give.r)[1]} ${v.give.n} ${esc(lc(r(v.give.r)[2]))}`, want: `${r(v.want.r)[1]} ${v.want.n} ${esc(lc(r(v.want.r)[2]))}`})}</span>${btn('oui', i18n('🤝 Échanger'))}${btn('non', i18n('Non merci'), 'secondary')}${btn('voler', i18n('🦹 Voler'), 'secondary bk-danger')}`
            : v.k === 'voyageur' ? `<span>${i18n('🔔 <b>{name}</b>{info} demande à entrer : une bouche de plus, mais aussi des bras.', {name: esc(v.person.name), info})}</span>${btn('oui', i18n('🤗 Faire entrer'))}${btn('non', i18n('Laisser dehors'), 'secondary')}`
            : `<span>${i18n('🔔 <b>Des pillards</b>{who} veulent {what}. Défense du bunker : {n}.', {who, what: Object.entries(v.demand).map(([k, n]) => `${r(k)[1]} ${n}`).join(' ') || i18n('tout'), n: Math.round(B().defense(G))})}</span>${btn('donner', i18n('🫳 Donner'), 'secondary')}${btn('resister', i18n('🛡️ Résister'))}`;
        box.className = `bk-visit is-${v.k}`; box.insertAdjacentHTML('beforeend', `<small class="muted">${i18n(v.k === 'pillards' ? 'sans réponse dans {left}, ils attaquent' : 'sans réponse dans {left}, on repart', {left: `<b data-bk-left>${left} h</b>`})}</small>`);
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
        const act = i18n(p.where === 'dehors' ? (p.exp?.site ? 'à un chantier en ville' : 'en ville') : p.where === 'convoi' ? 'en convoi dans la région' : ({boire: 'boit', boiresale: 'boit de l’eau de pluie', manger: 'mange', toilettes: 'aux toilettes', coin: 'se soulage dans un coin', douche: 'se douche', gant: 'fait sa toilette', dormir: 'dort', jouer: p.act?.music ? 'écoute de la musique' : 'joue', aerer: 'nettoie l’aération'}[p.act?.k] || ({creuser: 'creuse', construire: 'construit', pedaler: 'pédale', garde: 'monte la garde'}[p.doing] || (p.baby ? 'gazouille' : 'attend'))));
        const mark = {dormir: '💤', boire: '💧', boiresale: '🪣', manger: '🍞', douche: '🚿', gant: '🧼', toilettes: '🚽', coin: '🚽', jouer: p.act?.music ? '🎶' : '🎲', aerer: '🌀'}[p.act?.k] || ({creuser: '⛏️', construire: '🔨', pedaler: '🚲', garde: '🛡️'}[p.doing] || (p.ill ? (p.ill.k === 'fievre' ? '🤒' : '🩹') : ''));
        return `<span class="bk-pawn g-${p.gender === 'female' ? 'f' : p.gender === 'male' ? 'm' : 'u'}${p.hp < 35 ? ' is-weak' : ''}${p.baby ? ' is-baby' : ''}" title="${esc(p.name)} : ${esc(act)}${p.ill ? ` · ${esc(i18n(p.ill.k === 'fievre' ? 'a de la fièvre' : 'blessé·e'))}` : ''}">${esc(ini)}${mark ? `<i>${mark}</i>` : ''}</span>`;
    }
    function drawWorld() {
        const w = dlg.querySelector('[data-bk-world]'); if (!w || dragging) return; // pendant un glisser-déposer, on ne redessine pas sous la souris
        const [s1, s2] = sky(G.t), h = (G.t / 60) % 24, sunX = ((h - 6) / 14) * 100, night = B().isNight(G.t);
        const base = B().alive(G).filter(p => p.where === 'base'), out = B().alive(G).filter(p => p.where === 'dehors');
        const at = new Map(); base.forEach(p => { const k = p.act?.at ? p.act.at.join() : p.doing === 'construire' ? atelierAt() : p.doing === 'creuser' ? 'dig' : 'hall'; if (!at.has(k)) at.set(k, []); at.get(k).push(p); });
        const building = new Map(G.builds.map((b, i) => [`${b.fi},${b.si}`, {b, i}]));
        w.innerHTML = `<div class="bk-bubbles" aria-live="polite">${bubblesHtml()}</div><div class="bk-sky${G.weather.rain ? ' is-rain' : ''}${night ? ' is-night' : ''}${B().seasonOf(G) === 'hiver' ? ' is-winter' : ''}" style="--s1:${s1};--s2:${s2}">
                ${h >= 6 && h < 20 ? `<span class="bk-sun" style="left:${Math.max(4, Math.min(92, sunX))}%"></span>` : `<span class="bk-moon"></span>`}
                <span class="bk-skyline" aria-hidden="true"></span><span class="bk-out">${out.map(p => pawn(p)).join('')}${out.length ? `<small>${esc(i18n('{n} en ville', {n: plural(out.length, 'parti', 'partis')}))}</small>` : ''}${(G.convoys || []).length ? `<small>${esc(i18n('🧭 {n} dans la région', {n: plural(G.convoys.length, 'convoi')}))}</small>` : ''}</span>
                <span class="bk-ground"><span class="bk-trap${G.visit ? ' is-knock' : ''}" title="${esc(G.visit ? i18n('Quelqu’un frappe à la trappe !') : i18n('La trappe'))}">${G.visit ? '🔔' : '▦'}</span></span></div>
            <div class="bk-floors${moveFrom ? ' is-moving' : ''}">${moveFrom ? `<p class="bk-movehint">${esc(i18n('↔ Clique sur la place où le mettre (une place prise : les deux s’échangent)'))} · <button type="button" class="link-button" data-bk="movecancel">${esc(i18n('Annuler'))}</button></p>` : ''}${G.floors.map((f, fi) => `<div class="bk-floor${G.fire?.fi === fi ? ' is-fire' : ''}"><span class="bk-flabel">−${fi + 1}${G.fire?.fi === fi ? `<i title="${esc(i18n('Le feu !'))}">🔥</i>` : ''}${(G.deco?.[fi] || []).length ? `<span class="bk-deco" title="${esc(G.deco[fi].map(d => (d.name ? i18n('{deco} de {name}', {deco: B().DECOS[d.k][1], name: d.name}) : B().DECOS[d.k][1])).join(', '))}">${G.deco[fi].map(d => B().DECOS[d.k][0]).join('')}</span>` : ''}</span><div class="bk-slots">${f.slots.map((k, si) => {
                const it = k && {...B().ITEMS[k], ...(B().fixedName(G, k)[1] ? {ico: B().fixedName(G, k)[0], name: B().fixedName(G, k)[1]} : {})}, bd = building.get(`${fi},${si}`), who = at.get(`${fi},${si}`) || [];
                const key = `${fi},${si}`, brk = !!G.broken?.[key], L = G.lvl?.[key] || 1, wk = bd && (bd.b.rep || bd.b.up);
                const mv = moveFrom && moveFrom[0] === fi && moveFrom[1] === si ? ' is-movesrc' : '';
                if (it) return `<button type="button" draggable="true" class="bk-slot is-item${mv}${!B().lit(G) && (['radio', 'atelier', 'douche', 'potager'].includes(k) || it.power) ? ' is-dark' : ''}${brk ? ' is-broken' : ''}" data-bk="slot" data-f="${fi}" data-s="${si}" title="${esc(it.name)}${L > 1 ? ` ${esc(i18n('(niveau {n})', {n: L}))}` : ''}${brk ? ` — ${esc(i18n('EN PANNE : clique pour réparer'))}` : ''} — ${esc(it.desc)}"><span class="bk-ico">${it.ico}</span><span class="bk-name">${esc(it.name)}</span>${L > 1 ? `<span class="bk-lvl">${'★'.repeat(L)}</span>` : ''}${brk ? `<span class="bk-brk" aria-label="${esc(i18n('En panne'))}">🔧</span>` : ''}${wk ? `<span class="bk-bar"><i style="width:${Math.round(100 * (1 - bd.b.left / (bd.b.tot || 1)))}%"></i></span>` : ''}<span class="bk-who">${who.map(pawn).join('')}</span></button>`;
                if (bd) return `<button type="button" draggable="true" class="bk-slot is-building${mv}" data-bk="slot" data-f="${fi}" data-s="${si}" title="${esc(i18n('En construction : {name}', {name: B().ITEMS[bd.b.k].name}))}"><span class="bk-ico">${B().ITEMS[bd.b.k].ico}</span><span class="bk-name">${esc(B().ITEMS[bd.b.k].name)}</span><span class="bk-bar"><i style="width:${Math.round(100 * (1 - bd.b.left / (bd.b.tot || B().ITEMS[bd.b.k].h)))}%"></i></span></button>`;
                return `<button type="button" class="bk-slot is-empty" data-bk="slot" data-f="${fi}" data-s="${si}" title="${esc(moveFrom ? i18n('Poser ici (sans frais)') : i18n('Place libre : construire ici'))}">＋</button>`;
            }).join('')}</div>${fi === 0 ? `<div class="bk-hall" title="${esc(i18n('Ceux qui attendent'))}">${(at.get('hall') || []).map(pawn).join('')}${(G.pets || []).map(a => `<span class="bk-pet" title="${esc(a.name)}">${B().PETS[a.k][0]}</span>`).join('')}</div>` : ''}</div>`).join('')}
            ${G.floors.length < B().MAX_FLOORS ? `<button type="button" class="bk-dig" data-bk="digpanel" title="${esc(i18n('Choisir qui creuse'))}"><span>⛏️ ${esc(G.dig.done > 0 ? i18n('Étage en cours de creusement') : i18n('Creuser un étage'))}</span><span class="bk-bar"><i style="width:${Math.round(100 * G.dig.done / B().DIG_HOURS)}%"></i></span><span class="bk-who">${(at.get('dig') || []).map(pawn).join('')}</span></button>` : `<p class="muted bk-deep">${esc(i18n('Le bunker ne peut pas descendre plus bas.'))}</p>`}</div>
            ${G.over ? `<div class="bk-over"><b>${esc(i18n('☠️ Plus personne en vie'))}</b><p>${esc(i18n('Le bunker a tenu {n}.', {n: plural(B().dayOf(G.t) - 1, 'jour')}))}</p>${G.mornings?.length ? `<button type="button" class="button" data-bk="rewind">${esc(i18n('⏪ Reprendre au matin du jour {n}…', {n: G.mornings[G.mornings.length - 1].d}))}</button>` : ''}<button type="button" class="button ${G.mornings?.length ? 'secondary' : ''}" data-bk="gazette">📰 Lire la gazette</button><button type="button" class="button secondary" data-bk="records">🏆 Succès et records</button><button type="button" class="button secondary" data-bk="menu">↩ Revenir aux parties</button></div>` : ''}`;
    }
    const atelierAt = () => { const x = B().items(G).find(i => i.k === 'atelier'); return x ? `${x.fi},${x.si}` : 'hall'; };

    /* ── le panneau de droite ── */
    const bar = (v, cls = '') => `<span class="bk-bar ${cls}${v < 25 ? ' is-low' : ''}"><i style="width:${Math.round(v)}%"></i></span>`;
    const resName = r => B().resInfo(G, r);
    const costTxt = cost => Object.entries(cost || {}).map(([r, n]) => `<span class="${(G.res[r] || 0) < n ? 'is-miss' : ''}">${resName(r)[1]} ${n}</span>`).join(' ');
    let lastSide = '';
    function drawSide() {
        const s = dlg.querySelector('[data-bk-side]'); if (!s) return;
        const keep = s.scrollTop, mw = s.querySelector('.bk-mapwrap.is-big'), mk = mw ? [mw.scrollLeft, mw.scrollTop] : mapScroll;
        const oldBg = s.querySelector('.bk-map-bg');
        const html = tab === 'gens' ? sideGens() : tab === 'res' ? sideRes() : tab === 'atelier' ? sideAtelier() : tab === 'bric' ? sideBric() : tab === 'ville' ? sideVille() : tab === 'region' ? sideRegion() : tab === 'famille' ? sideFamille() : tab === 'regl' ? sideRegl() : tab === 'stats' ? sideStats() : sideRadio();
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
        return `<div class="bk-autobar"><label>🧍 Autonomie de tout le monde <select data-bk-auto="">${AUTO_L.map(([v, l]) => `<option value="${v}" ${G.auto === v ? 'selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select></label>
            ${petsHtml()}<small class="muted">Chacun va de soi-même boire, manger, aux toilettes, se laver ou dormir quand sa barre descend : 🟢 prudente = dès qu’elle passe sous la moitié, 🟡 normale = vers un tiers, 🔴 manuelle = seulement à la toute dernière minute (c’est vous qui donnez les ordres). Les boutons 💧🍞🚽🧼💤 de chacun donnent un ordre tout de suite.</small></div>` + G.people.map(p => {
            const out = p.where === 'dehors', pl = out && expPlace(p), cv = p.where === 'convoi' && (G.convoys || []).find(c => c.id === p.conv);
            const status = p.hp <= 0 ? esc(i18n('☠️ mort·e')) : out ? esc(i18n(p.exp.phase === 'aller' ? '🚶 en route vers {place}' : p.exp.phase === 'fouille' ? '🚶 fouille {place}' : p.exp.phase === 'chantier' ? '🚶 travaille à {place}' : '🚶 rentre de {place}', {place: pl?.name || ''})) : cv ? esc(i18n('🧭 en convoi vers {place}', {place: nodeName(cv.dest)})) : esc(pawn(p).match(/title="[^:]*: ([^"]*)"/)?.[1] || '');
            const skills = B().SKILLS.filter(([k]) => (p.sk?.[k] || 1) > 1).map(([k, ico, l]) => `<span class="bk-chip" title="${esc(i18n('{skill} : {n} % de mieux', {skill: l, n: Math.round(((p.sk[k] || 1) - 1) * 100)}))}">${ico} ${esc(l)}</span>`).join('');
            const ties = [...(p.spouses || []).map(id => ['💞', id]), ...(p.kin || []).map(id => ['👪', id])].map(([ico, id]) => { const o = G.people.find(x => x.id === id); return o ? `<span class="bk-chip" title="${esc(ico === '💞' ? i18n('En couple : le moral tient mieux quand on est ensemble') : i18n('De la même famille : le moral tient mieux quand on est ensemble'))}">${ico} ${esc(o.name.split(' ')[0])}</span>` : ''; }).join('');
            const traits = (p.traits || []).map(k => B().TRAITS[k]).filter(Boolean).map(([ico, l, d]) => `<span class="bk-chip is-trait" title="${esc(d)}">${ico} ${esc(l)}</span>`).join('');
            const rel = G.people.filter(o => o !== p && o.hp > 0).map(o => [o, B().relOf(G, p, o)]).filter(([, v]) => Math.abs(v) >= 25).map(([o, v]) => `<span class="bk-chip${v < 0 ? ' is-bad' : ''}" title="${esc(v > 0 ? i18n('Ami·e : le moral tient mieux ensemble') : i18n('Ne se supportent plus : ça mine le moral'))}">${v > 0 ? '🤝' : '😠'} ${esc(o.name.split(' ')[0])}</span>`).join('');
            const xp = B().SKILLS.map(([k, ico, l]) => { const x = p.xp?.[k] || 0, cur = p.sk?.[k] || 1, need = 12 + 32 * (cur - 1); return x > 0.5 ? `<span class="bk-xp" title="${esc(i18n('{skill} ×{k} : {a} h / {b} h de pratique avant le prochain progrès', {skill: l, k: cur.toFixed(1).replace('.', ','), a: Math.floor(x), b: Math.round(need)}))}">${ico} ${Math.min(99, Math.round(100 * x / need))} %<i style="width:${Math.min(100, Math.round(100 * x / need))}%"></i></span>` : ''; }).join('');
            const feud = G.feud?.includes(p.id) ? (() => { const o = G.people.find(x => x.id === G.feud.find(i => i !== p.id)); return o ? `<span class="bk-chip is-bad" title="${esc(i18n('Une vieille brouille de famille'))}">⚡ ${esc(o.name.split(' ')[0])}</span>` : ''; })() : '';
            const jobs = [['libre', 'Rien de spécial'], ['creuser', '⛏️ Creuser'], ['construire', '🔨 Construire'], ['recycler', '♻️ Démonter le bric-à-brac'], ['garde', '🛡️ Monter la garde'], ...(B().has(G, 'dynamo') ? [['pedaler', '🚲 Pédaler (électricité)']] : [])];
            return `<div class="bk-person${p.hp <= 0 ? ' is-dead' : ''}"><div class="bk-p-head">${pawn(p)}<div><b>${esc(p.name)}${p.me ? ` <small>${esc(i18n('(toi)'))}</small>` : ''}${p.baby ? ` <small>${esc(i18n('(bébé)'))}</small>` : p.child ? ` <small>${esc(i18n('(enfant)'))}</small>` : ''}${G.opt?.age && p.age != null ? ` <small class="muted">${esc(i18n('{n} ans', {n: p.age}))}</small>` : ''}</b><small>${status}${p.ill && p.hp > 0 ? ` · ${esc(i18n(p.ill.k === 'fievre' ? (p.ill.treated ? '🤒 fièvre (soignée)' : '🤒 fièvre') : (p.ill.treated ? '🩹 blessure (soignée)' : '🩹 blessure')))}` : ''}</small>${p.from ? `<small class="muted">${esc(p.from)}</small>` : ''}</div></div>
                ${traits || skills || ties || feud || rel || apprChips(p) ? `<div class="bk-chips">${traits}${skills}${ties}${rel}${feud}${apprChips(p)}</div>` : ''}
                ${xp && !p.baby ? `<div class="bk-xps" title="${esc(i18n('Ce qu’il ou elle apprend en pratiquant'))}">📈 <small class="muted">${esc(i18n('progrès :'))}</small> ${xp}</div>` : ''}
                <div class="bk-needs"><span>❤️ Vie</span>${bar(p.hp, 'is-hp')}<span>😊 Moral</span>${bar(p.mood ?? 70, 'is-mood')}${B().NEEDS.map(([k, ico, l]) => `<span>${ico} ${esc(l)}</span>${bar(p.needs[k])}`).join('')}</div>
                ${p.hp > 0 && p.where === 'base' && !p.baby ? `<div class="bk-p-actions"><label>Travail <select data-bk-job="${esc(p.id)}">${jobs.map(([v, l]) => `<option value="${v}" ${p.job === v ? 'selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select></label><button type="button" class="button small secondary" data-bk="sendfrom" data-id="${esc(p.id)}">🚶 Envoyer en ville</button><button type="button" class="button small secondary" data-bk="diary" data-id="${esc(p.id)}">📔 ${esc(i18n('Journal'))}${p.diary?.length ? ` (${p.diary.length})` : ''}</button>${B().canTeach(G, p).length || (G.appr || []).some(x => x.m === p.id) ? `<button type="button" class="button small secondary" data-bk="appr" data-id="${esc(p.id)}" title="${esc(i18n('Un habitant expert ou âgé forme un·e apprenti·e, qui progresse chaque soir'))}">🎓 ${esc((G.appr || []).some(x => x.m === p.id) ? i18n('Son apprenti·e') : i18n('Former un·e apprenti·e'))}…</button>` : ''}</div>
                <div class="bk-p-actions bk-orders"><label title="${esc(i18n('Quand il ou elle va de soi-même boire, manger, aux toilettes…'))}">${esc(i18n('Autonomie'))} <select data-bk-auto="${esc(p.id)}"><option value="">${esc(i18n('comme tout le monde'))}</option>${AUTO_L.map(([v, l]) => `<option value="${v}" ${p.auto === v ? 'selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select></label>
                    <span class="bk-order-btns" role="group" aria-label="${esc(i18n('Lui dire de'))}">${[['soif', '💧', 'Boire maintenant'], ['faim', '🍞', 'Manger maintenant'], ['vessie', '🚽', 'Toilettes maintenant'], ['hygiene', '🧼', 'Se laver maintenant'], ['sommeil', '💤', 'Dormir maintenant']].map(([k, ico, l]) => `<button type="button" class="icon-button small" data-bk="need" data-id="${esc(p.id)}" data-v="${k}" title="${esc(i18n(l))}" aria-label="${esc(i18n(l))}">${ico}</button>`).join('')}</span></div>` : ''}${p.sulk ? `<p class="ui-notice is-error">${esc(i18n('😞 Plus de moral : refuse de travailler (jeux, musique, histoires du soir…).'))}</p>` : ''}</div>`;
        }).join('');
    }
    function sideRes() {
        const grp = (a, b) => B().RES.slice(a, b).filter(x => B().resOk(G, x[0])).map(x => B().resInfo(G, x[0]));
        const row = ([r, ico, l, u]) => { const c = B().cap(G, r); return `<span>${ico} ${esc(l)}</span><b>${Math.floor(G.res[r])}${u ? ' ' + esc(i18n(u)) : ''} <small>/ ${c}</small></b>${bar(100 * G.res[r] / c)}`; };
        return `<h4>Réserves</h4><div class="bk-res">${grp(0, 10).map(row).join('')}</div>
            <h4>Composants</h4><div class="bk-res">${grp(10, 20).map(row).join('')}</div>${G.opt?.chaines ? `<h4>Fabrication</h4><div class="bk-res">${grp(20).map(row).join('')}</div><p class="muted">Plantes → 🧶 rouet → fil → 🪢 métier à tisser → tissu → 🧥 tailleur → vêtements chauds (l’hiver, le froid fait bien moins de mal). Blé → ⚙️ moulin → farine → 🍞 four à pain.</p>` : ''}<p class="muted">Les composants viennent surtout du ♻️ bric-à-brac qu’on démonte (et de certains lieux : droguerie, électroménager, usine…).</p>
            <p class="muted">Plus de place : étagères, stockage, garde-manger, citerne, cuves. L’eau de pluie passe au ⚗️ filtre avant d’être bue (sinon : risque de fièvre).</p>
            ${B().has(G, 'filtre') ? `<p>${G.filterClog ? i18n('⚗️ <b>Filtre encrassé</b> : il faut 1 tissu.') : esc(i18n('⚗️ Filtre : {n} / 30 L avant de le nettoyer (1 tissu).', {n: Math.round(G.filterUse)}))}</p>` : ''}
            <h4>🍲 La cuisine</h4>${kitchenHtml()}
            <h4>🐀 Nuisibles</h4><div class="bk-res"><span>${esc(i18n(G.pests >= 50 ? '🪳 Invasion' : G.pests >= 10 ? '🐀 Des rats' : '✓ Presque rien'))}</span><b>${Math.round(G.pests || 0)} %</b>${bar(G.pests || 0, 'is-bad')}</div><p class="muted">${esc(i18n('Ils viennent quand il y a de quoi manger.'))} ${esc(i18n(`${B().has(G, 'piegerats') ? '🪤 Pièges posés. ' : 'Des 🪤 pièges, '}${G.pets?.some(a => a.k === 'chat') ? '🐈 le chat chasse. ' : 'un 🐈 chat, '}${B().has(G, 'hermetique') ? '🫙 réserves fermées.' : 'des 🫙 bocaux hermétiques les arrêtent.'}`))}</p>
            <h4>Air</h4><div class="bk-res"><span>🌀 Conduit d’aération</span><b>${Math.round(G.air)} %</b>${bar(G.air)}</div><p class="muted">Il s’encrasse, plus vite quand on est nombreux ; quelqu’un de libre le nettoie. Air lourd : on dort mal, le moral baisse.</p>
            <h4>Saison</h4><p>${(S => `${S[1]} ${esc(S[2])}`)(B().SEASONS.find(x => x[0] === B().seasonOf(G)))} · ${esc(i18n('une saison dure {n} jours.', {n: B().SEASON_DAYS}))} ${esc((s => (s ? i18n(s) : ''))(B().seasonOf(G) === 'hiver' ? (G.cold ? '🥶 Il fait froid : il faut un poêle à bois (et du bois).' : '🔥 Le poêle chauffe le bunker.') : B().seasonOf(G) === 'ete' ? 'Il pleut moins, on a plus soif.' : B().seasonOf(G) === 'printemps' ? 'Il pleut plus souvent.' : ''))}</p>
            ${!B().eraOf(G).elec ? `<h4>Lumière</h4><p>🕯️ Pas d’électricité à cette époque : on s’éclaire à la chandelle, l’atelier marche à la main, les nouvelles arrivent par le 📯 crieur et la gazette.</p>` : `<h4>Électricité</h4><p>${esc(G.power ? i18n('{src} donne le courant', {src: i18n({soleil: '☀️ Le panneau solaire', vent: '🌬️ L’éolienne', pedales: '🚲 La dynamo à pédales', batteries: '🔋 Le banc de batteries'}[G.powerSrc] || '⚡ Le groupe électrogène')}) : G.powerOn ? i18n('🔌 Plus d’essence : pas d’électricité') : i18n('🔌 Groupe électrogène éteint'))} — ${esc(i18n('le groupe brûle {n} L d’essence par heure, seulement quand rien d’autre ne donne de courant.', {n: B().has(G, 'econome') ? '⅛' : '¼'}))}${B().sumOf(G, 'store') ? ` ${esc(i18n('🔋 Batteries : {a} h / {b} h en réserve.', {a: Math.floor(G.batt || 0), b: B().sumOf(G, 'store')}))}` : ''}</p>
            <button type="button" class="button small secondary" data-bk="power">${esc(G.powerOn ? i18n('Éteindre pour économiser l’essence') : i18n('Rallumer le groupe électrogène'))}</button>`}
            ${transportsHtml()}
            <h4>Outils</h4><div class="bk-chips">${Object.keys(B().TOOLS).map(k => [k, B().toolInfo(G, k)]).map(([k, [ico, l, d]]) => `<span class="bk-chip${G.tools.includes(k) ? '' : ' is-off'}" title="${esc(d)}">${ico} ${esc(l)}${G.tools.includes(k) ? '' : ` ${esc(i18n('(à trouver)'))}`}</span>`).join('')}</div>`;
    }
    function sideAtelier() {
        const IT = B().ITEMS;
        return `<h4>En construction</h4>${G.builds.length ? `<ol class="bk-builds">${G.builds.map((b, i) => `<li>${b.rep ? `${esc(i18n('🔧 Réparer :'))} ` : b.up ? `${esc(i18n('⬆️ Niveau {n} :', {n: b.up}))} ` : ''}${IT[b.k].ico} ${esc(IT[b.k].name)} <small>${esc(i18n('étage −{f} · encore {h} h', {f: b.fi + 1, h: String(Math.max(0, Math.ceil(b.left * 10) / 10))}))}</small><button type="button" class="icon-button small" data-bk="unbuild" data-i="${i}" title="${esc(i18n('Annuler (les matériaux reviennent)'))}" aria-label="${esc(i18n('Annuler'))}">×</button></li>`).join('')}</ol>
            ${!B().lit(G) ? `<p class="ui-notice is-error">${esc(i18n('Pas d’électricité : l’atelier est à l’arrêt.'))}</p>` : ''}${!G.people.some(p => p.hp > 0 && p.where === 'base' && p.job === 'construire') ? `<p class="ui-notice">${esc(i18n('Personne n’est à l’atelier : mets quelqu’un sur « 🔨 Construire » (onglet Habitants).'))}</p>` : ''}` : A().emptyState({icon: '🛠️', text: i18n('Rien en construction.'), hint: i18n('Clique sur une place libre du bunker (＋), ou sur « Construire » ci-dessous.')})}
            <h4>🎨 Décorer</h4>${decoHtml()}
            <h4>Plans</h4><div class="segmented bk-planf" role="group" aria-label="${esc(i18n('Montrer'))}">${[['ok', '✅ Je peux construire'], ['near', '🟡 Il manque peu'], ['known', '📐 Mes plans'], ['all', 'Tous'], ['find', '❔ À trouver']].map(([v, l]) => `<button type="button" data-bk="planf" data-v="${v}" class="${planF === v ? 'is-active' : ''}">${esc(i18n(l))}</button>`).join('')}</div>
            <div class="bk-plans">${plansHtml()}</div>`;
    }
    /** ce qui manque pour un plan : [[ressource, il en faut, on en a]], l'outil, le plan lui-même */
    function needOf(k) { const it = B().ITEMS[k]; return {miss: Object.entries(it.cost || {}).filter(([r, n]) => (G.res[r] || 0) < n).map(([r, n]) => [r, n, Math.floor(G.res[r] || 0)]), tool: it.tool && !G.tools.includes(it.tool) ? it.tool : '', plan: !G.plans.includes(k)}; }
    /** d'où vient une ressource : le bric-à-brac qui en donne, et les lieux où on la trouve */
    function whereRes(r) { const J = B().JUNK, js = B().JUNK_KEYS.filter(k => J[k][2][r]).sort((a, b) => J[b][2][r] - J[a][2][r]).slice(0, 3).map(k => `${J[k][0]} ${lc(J[k][1])}`), ps = Object.entries(B().PLACE_KINDS).filter(([k, v]) => v[2][r] && !B().eraOf(G).placeBan.includes(k)).slice(0, 3).map(([k]) => B().placeInfo(G, k)).map(v => `${v[0]} ${lc(v[1])}`); return [...js.length ? [i18n('à démonter : {list}', {list: js.join(', ')})] : [], ...ps.length ? [i18n('en ville : {list}', {list: ps.join(', ')})] : []].join(' · '); }
    let planF = 'known';
    function plansHtml() {
        const IT = B().ITEMS, keys = Object.keys(IT).filter(k => !IT[k].fixed && (G.opt?.chaines || !IT[k].chain) && B().itemOk(G, k)), pk = k => B().placeInfo(G, k), planPlaces = Object.keys(B().PLACE_KINDS).filter(k => B().PLACE_KINDS[k][4] && !B().eraOf(G).placeBan.includes(k)).map(k => `${pk(k)[0]} ${lc(pk(k)[1])}`).join(', ');
        const planWhere = it => { if (!it.where) return i18n('❔ Les plans se trouvent en fouillant : {list}.', {list: planPlaces}); const list = it.where.filter(k => !B().eraOf(G).placeBan.includes(k)).map(k => `${pk(k)[0]} ${lc(pk(k)[1])}`).join(', '); return it.rare ? i18n('❔ Plan à trouver en ville, surtout : {list} (rare).', {list}) : i18n('❔ Plan à trouver en ville, surtout : {list}.', {list}); };
        const list = keys.map(k => ({k, n: needOf(k)})).filter(({n}) => planF === 'all' ? true : planF === 'find' ? n.plan : planF === 'ok' ? !n.plan && !n.miss.length && !n.tool : planF === 'near' ? !n.plan && (n.miss.length || n.tool) && n.miss.reduce((a, [, x, h]) => a + x - h, 0) <= 4 : !n.plan)
            .sort((a, b) => (a.n.plan - b.n.plan) || (a.n.miss.length - b.n.miss.length));
        if (!list.length) return `<p class="muted">${esc(i18n(planF === 'ok' ? 'Rien de constructible tout de suite : regarde « 🟡 Il manque peu ».' : planF === 'find' ? 'Tous les plans sont trouvés !' : 'Rien ici.'))}</p>`;
        return list.map(({k, n}) => { const it = IT[k], can = !n.plan && !n.miss.length && !n.tool;
            const cost = Object.entries(it.cost || {}).map(([r, q]) => { const h = Math.floor(G.res[r] || 0); return `<span class="${h < q ? 'is-miss' : 'is-ok'}" title="${esc(i18n('{res} : il en faut {q}, tu en as {h}', {res: resName(r)[2], q, h}))}">${resName(r)[1]} ${Math.min(h, q)}/${q}</span>`; }).join(' ');
            const missTxt = n.miss.length ? `<small class="bk-miss">${esc(i18n('Il manque : {list}.', {list: n.miss.map(([r, q, h]) => `${q - h} ${lc(resName(r)[2])}`).join(', ')}))}</small><small class="bk-where">${n.miss.map(([r]) => `${resName(r)[1]} ${esc(whereRes(r))}`).filter(x => x.length > 3).join('<br>')}</small>` : '';
            const toolTxt = it.tool ? `<small class="${n.tool ? 'bk-miss' : ''}">${esc(i18n(n.tool ? 'Il faut l’outil {ico} {name} (à trouver en ville)' : 'Outil {ico} {name} ✓', {ico: B().toolInfo(G, it.tool)[0], name: B().toolInfo(G, it.tool)[1]}))}</small>` : '';
            return `<div class="bk-plan${n.plan ? ' is-off' : can ? ' is-can' : ''}"><span class="bk-ico">${it.ico}</span><div><b>${esc(it.name)}${n.plan ? ` <small class="bk-tag">${esc(it.rare ? i18n('plan rare') : i18n('plan à trouver'))}</small>` : ''}</b><small>${esc(it.desc)} · ${esc(i18n('{n} h de travail', {n: String(it.h)}))}${it.power ? ` · ${esc(i18n('⚡ électricité'))}` : ''}</small><span class="bk-cost">${cost}</span>${missTxt}${toolTxt}${n.plan ? `<small class="bk-where">${esc(planWhere(it))}</small>` : ''}</div>${n.plan ? '' : `<button type="button" class="button small ${can ? '' : 'secondary'}" data-bk="build" data-k="${k}" ${can ? '' : 'aria-disabled="true"'}>${esc(i18n('Construire'))}</button>`}</div>`; }).join('');
    }
    /** ♻️ le bric-à-brac : ce qu'on a rapporté, ce que chaque objet donne une fois démonté, la file de l'établi */
    function sideBric() {
        const J = B().JUNK, mine = Object.entries(G.junk || {}).filter(([, n]) => n > 0), cnt = B().junkCount(G), cap = B().junkCap(G), who = G.people.filter(p => p.hp > 0 && p.where === 'base' && p.job === 'recycler');
        const gives = k => Object.entries(J[k][2]).map(([r, n]) => `${resName(r)[1]} ${n}`).join(' ');
        return `<p class="muted">${esc(i18n('Des objets qui ne servent à rien tels quels… mais qu’on démonte pour en tirer des composants. {a} / {b} places (un 🧺 débarras en ajoute).', {a: cnt, b: cap}))}</p>
            ${who.length ? `<p>${esc(i18n(who.length > 1 ? (B().has(G, 'etabli') ? '♻️ {who} démontent à l’établi (2× plus vite, parfois une pièce de plus).' : '♻️ {who} démontent (un 🪚 établi irait 2× plus vite).') : (B().has(G, 'etabli') ? '♻️ {who} démonte à l’établi (2× plus vite, parfois une pièce de plus).' : '♻️ {who} démonte (un 🪚 établi irait 2× plus vite).'), {who: who.map(p => p.name).join(', ')}))}</p>` : `<p class="ui-notice">${esc(i18n('Personne ne démonte : mets quelqu’un sur « ♻️ Démonter le bric-à-brac » (onglet Habitants) — ou clique « Démonter », quelqu’un de libre s’y mettra.'))}</p>`}
            <label class="checkbox-line"><input type="checkbox" data-bk-autorecy ${G.autoRecy ? 'checked' : ''}> Tout démonter au fur et à mesure (sans que je choisisse)</label>
            ${G.recy.length ? `<h4>À l’établi</h4><ol class="bk-builds">${G.recy.map((r, i) => `<li>${J[r.k][0]} ${esc(J[r.k][1])} <small>${esc(i ? i18n('en attente') : i18n('encore {h} h', {h: String(Math.max(0, Math.ceil(r.left * 10) / 10))}))} → ${gives(r.k)}</small></li>`).join('')}</ol>` : ''}
            <h4>Rapporté</h4>${mine.length ? `<div class="bk-plans">${mine.map(([k, n]) => `<div class="bk-plan"><span class="bk-ico">${J[k][0]}</span><div><b>${esc(J[k][1])}${n > 1 ? ` <small>× ${n}</small>` : ''}</b><small>${esc(i18n('Une fois démonté ({n} h) :', {n: String(J[k][3])}))}</small><span class="bk-cost">${gives(k)}</span></div><span class="bk-btns"><button type="button" class="button small" data-bk="recy" data-k="${k}">${esc(i18n('♻️ Démonter'))}</button>${n > 1 ? `<button type="button" class="button small secondary" data-bk="recyall" data-k="${k}">${esc(i18n('Les {n}', {n}))}</button>` : ''}</span></div>`).join('')}</div>`
                : A().emptyState({icon: '♻️', text: i18n('Rien à démonter.'), hint: i18n('En ville, coche « ♻️ Bric-à-brac » dans ce qu’on rapporte : la décharge, les maisons, le magasin d’électroménager en regorgent.')})}
            <details class="bk-junkall"><summary>Tous les objets qu’on peut trouver, et ce qu’ils donnent</summary><div class="bk-plans">${B().JUNK_KEYS.map(k => `<div class="bk-plan is-off"><span class="bk-ico">${J[k][0]}</span><div><b>${esc(J[k][1])}</b><span class="bk-cost">${gives(k)}</span><small>${esc(Object.values(B().PLACE_KINDS).filter(v => (v[5] || []).includes(k)).map(v => v[1]).join(', '))}</small></div></div>`).join('')}</div></details>`;
    }
    let locating = null, route = [], mapScroll = null, mapFull = false;
    /** 🚶 le parcours : les étapes dans l'ordre, et à chacune ce qu'on rapporte (vide = tout) */
    const roomHelp = k => { const R = B().ROOMS[k], K = R[3]; return [i18n('on y trouve : {list}', {list: R[2].map(r => resName(r)?.[2] && lc(resName(r)[2])).filter(Boolean).join(', ')}), K.plans && i18n('plus de plans'), K.tools && i18n('plus d’outils'), K.letters && i18n('plus de lettres'), K.docs && i18n('plus de documents'), K.risk && i18n('plus risqué')].filter(Boolean).join(' · '); };
    function routeHtml(free) {
        if (!route.length) return '';
        const c = G.city, total = B().routeTime(G, route), pls = route.map(st => c.places.find(x => x.id === st.id));
        // pour chaque chose : la prendre ou pas, et combien au plus (vide = tout ce qu'il y a) ; ce qu'on a vu à la dernière visite
        const rooms = (st, pl) => { const l = B().KIND_ROOMS[pl.kind] || []; if (!l.length) return '';
            return `<small>${esc(i18n('Fouiller :'))}</small><span class="bk-take" role="group" aria-label="${esc(i18n('Quelle pièce'))}">${[['', i18n('🏠 Tout le lieu (2 h)')], ...l.map(k => [k, `${B().ROOMS[k][0]} ${esc(B().ROOMS[k][1])} (1 h)`])].map(([k, lab]) => `<button type="button" class="bk-chip${(st.room || '') === k ? ' is-on' : ''}" data-bk="room" data-id="${pl.id}" data-v="${k}" title="${k ? `${esc(roomHelp(k))} · ${esc((pl.roomsDone || []).includes(k) ? i18n('déjà fouillée') : i18n('pas encore fouillée : un petit trésor caché'))}` : esc(i18n('Toutes les pièces : tout ce qu’il y a'))}">${lab}${k && !(pl.roomsDone || []).includes(k) ? ' ✨' : ''}</button>`).join('')}</span>`; };
        const chips = (st, pl) => { const inRoom = r => !st.room || B().ROOMS[st.room]?.[2].includes(r), opts = [...Object.keys(pl.max).filter(r => pl.max[r] > 0 && inRoom(r)), ...((B().PLACE_KINDS[pl.kind][5] || []).length ? ['junk'] : [])], on = st.take, q = st.qty || {}, kn = pl.known;
            const seen = r => !kn ? '' : ` <i class="bk-seen">${esc(i18n('(vu : {n})', {n: r === 'junk' ? kn.junk.length : kn.stock[r] || 0}))}</i>`;
            return `<span class="bk-take" role="group" aria-label="${esc(i18n('Ce qu’on rapporte de {place}', {place: pl.name}))}"><button type="button" class="bk-chip${!on ? ' is-on' : ''}" data-bk="take" data-id="${pl.id}" data-v="">${esc(i18n('Tout'))}</button>${opts.map(r => { const sel = !on || on.includes(r);
                return `<span class="bk-takeq${sel ? ' is-sel' : ''}"><button type="button" class="bk-chip${on?.includes(r) ? ' is-on' : ''}" data-bk="take" data-id="${pl.id}" data-v="${r}" aria-pressed="${!!on?.includes(r)}">${r === 'junk' ? esc(i18n('♻️ bric-à-brac')) : `${resName(r)[1]} ${esc(lc(resName(r)[2]))}`}${seen(r)}</button>${sel ? `<input type="number" min="1" max="999" inputmode="numeric" placeholder="${esc(i18n('tout'))}" value="${q[r] || ''}" data-bk-qty="${r}" data-id="${pl.id}" aria-label="${esc(i18n('Combien au plus de {what} (vide = tout)', {what: r === 'junk' ? i18n('bric-à-brac') : lc(resName(r)[2])}))}">` : ''}</span>`; }).join('')}</span>`; };
        const who = free.find(p => p.id === sendFor) || free[0], cap = who ? B().carryOf(G, who) : 0;
        // ce qui est prévu : si tout a un nombre, on peut compter ; sinon « tout ce qu'il y a »
        const planned = route.reduce((n, st) => { const pl = c.places.find(x => x.id === st.id), opts = st.take || [...Object.keys(pl.max).filter(r => pl.max[r] > 0), 'junk']; return opts.every(r => st.qty?.[r] || (r === 'junk' && !(B().PLACE_KINDS[pl.kind][5] || []).length)) ? n + opts.reduce((m, r) => m + (st.qty?.[r] || 0) * (r === 'junk' ? 2 : 1), 0) : Infinity; }, 0);
        return `<div class="bk-route"><h4>🚶 Le parcours</h4><ol>${route.map((st, i) => { const pl = pls[i]; return `<li><div class="bk-route-head"><b>${B().placeInfo(G, pl.kind)[0]} ${esc(pl.name)}</b><span><button type="button" class="icon-button small" data-bk="routeup" data-i="${i}" ${i ? '' : 'disabled'} aria-label="${esc(i18n('Plus tôt'))}">↑</button><button type="button" class="icon-button small" data-bk="routedel" data-id="${pl.id}" aria-label="${esc(i18n('Retirer'))}">×</button></span></div>${rooms(st, pl)}<small>${esc(i18n('Rapporter :'))}</small>${chips(st, pl)}</li>`; }).join('')}</ol>
            <p class="muted">${i18n('{h} h de marche en tout (aller, de lieu en lieu, retour), plus 2 h de fouille par lieu. <b>Place pour rapporter : {cap}</b> (en poids : l’eau et le métal comptent ×1,5, le tissu ×0,5 ; un bric-à-brac = 2 ; {terr} aujourd’hui){planned}. Sac plein : il rentre plus tôt. Plus de place : 🎒 sacs à dos, 🧺 hotte, 🛞 brouette, 🛒 charrette, 🚛 remorque de vélo, ou le grand sac trouvé en ville.', {h: String(Math.round(total / 6) / 10), cap: free.length ? cap : '—', terr: `${B().TERRAINS[B().cityTerrain(G)][0]} ${esc(B().TERRAINS[B().cityTerrain(G)][1])}`, planned: Number.isFinite(planned) && free.length ? ` · ${planned > cap ? i18n('prévu : {n} {warn}', {n: planned, warn: `<span class="bk-miss">${esc(i18n('— trop : il rapportera {n} au plus', {n: cap}))}</span>`}) : i18n('prévu : {n}', {n: planned})}` : ''})}</p>
            ${free.length ? `<div class="bk-send"><select data-bk-sendwho>${free.filter(p => !p.baby).map(p => `<option value="${esc(p.id)}" ${p.id === sendFor ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><button type="button" class="button small" data-bk="send">${esc(i18n('🚶 Partir'))}</button><button type="button" class="button small secondary" data-bk="routeclear">${esc(i18n('Effacer'))}</button></div>` : `<p class="muted">${esc(i18n('Personne de libre au bunker.'))}</p>`}</div>`;
    }
    function sideVille() {
        // une partie d'avant le plan en fond : on cherche la ville une fois, puis on redessine
        if (G.city.lat == null && G.city.geo !== 'none' && !locating) { const g = G; locating = locateCity(g.city).then(() => { locating = null; if (G === g && tab === 'ville') drawSide(); }); }
        const c = G.city, n = c.n, free = B().alive(G).filter(p => p.where === 'base');
        const cell = (x, y) => { const pl = c.places.find(q => q.x === x && q.y === y); if (x === c.base[0] && y === c.base[1]) return `<span class="bk-cell is-base" title="${esc(i18n('Le bunker'))}">☢</span>`;
            const st = !pl && (G.sites || []).find(q => q.x === x && q.y === y);
            if (st) return `<button type="button" class="bk-cell is-site is-${st.state}${siteSel === st.id ? ' is-sel' : ''}${G.people.some(p => p.hp > 0 && p.exp?.site === st.id) ? ' is-busy' : ''}" data-bk="site" data-id="${st.id}" title="${esc(B().siteName(G, st.k))} : ${esc(lc(B().SITE_STATE[st.state][0]))}">${B().SITES[st.k][0]}</button>`;
            if (!pl) return '<span class="bk-cell"></span>'; const k = B().placeInfo(G, pl.kind), there = G.people.some(p => p.hp > 0 && p.exp?.place === pl.id);
            const ri = route.findIndex(st => st.id === pl.id);
            return `<button type="button" class="bk-cell is-place${placeSel === pl.id ? ' is-sel' : ''}${there ? ' is-busy' : ''}${ri >= 0 ? ' is-route' : ''}" data-bk="place" data-id="${pl.id}" title="${esc(pl.name)}${ri >= 0 ? ` ${esc(i18n('(étape {n})', {n: ri + 1}))}` : ''}">${k[0]}${ri >= 0 ? `<i class="bk-step">${ri + 1}</i>` : ''}</button>`; };
        const pl = c.places.find(x => x.id === placeSel);
        const stockTxt = p => { const tot = Object.values(p.stock).reduce((a, b) => a + b, 0), max = Object.values(p.max).reduce((a, b) => a + b, 0) || 1; return i18n(!p.visits ? 'pas encore fouillé' : tot / max > .6 ? 'beaucoup de choses' : tot / max > .25 ? 'un peu' : tot ? 'presque vide' : 'vide (ça revient chaque jour)'); };
        // ⤢ la carte s'ouvre en grand (utile quand elle dépasse) : elle couvre le bunker, le parcours et le lieu choisi à côté
        return `<p class="muted">${esc(c.name)} · ${esc(i18n('ville {size}', {size: lc(B().SIZES[c.size][2])}))} · ${esc(i18n('30 min par case (×1,5 la nuit sans {tool}).', {tool: lc(B().toolInfo(G, 'lampe')[1])}))}</p>
            <div class="bk-ville${mapFull ? ' is-full' : ''}"><div class="bk-mapcol"><div class="bk-maptools">${mapFull ? `<b>🗺️ ${esc(c.name)}</b><span class="spacer"></span>` : ''}<button type="button" class="button small secondary" data-bk="mapfull" title="${esc(mapFull ? i18n('Revenir à la petite carte (Échap)') : i18n('Voir la carte dans un grand cadre'))}">${esc(mapFull ? i18n('✕ Réduire la carte') : i18n('⤢ Ouvrir la carte en grand'))}</button></div>
            <div class="bk-mapwrap${n > 17 ? ' is-big' : ''}" style="--n:${n}"><div class="bk-map${c.lat != null ? ' has-bg' : ''}" style="--n:${n}">${mapBgHtml(c)}${Array.from({length: n * n}, (_, i) => cell(i % n, Math.floor(i / n))).join('')}</div></div></div><div class="bk-villeinfo">
            ${routeHtml(free)}${c.geo === 'none' ? `<p class="lck-legend muted">${esc(i18n('Pas de plan en fond : cette ville n’a pas de coordonnées (ni dans ton arbre, ni dans les communes).'))}</p>` : ''}
            ${pl ? `<div class="bk-placecard"><b>${B().placeInfo(G, pl.kind)[0]} ${esc(pl.name)}</b><small>${esc(i18n('{h} h de marche (aller)', {h: String(Math.round(B().travel(G, pl) / 6) / 10)}))} · ${esc(stockTxt(pl))}${pl.visits ? ` · ${esc(i18n('fouillé {n}', {n: plural(pl.visits, 'fois', 'fois')}))}` : ''}</small>
                ${(B().KIND_ROOMS[pl.kind] || []).length ? `<p class="muted">${esc(i18n('🏚️ Pièces : {list} — à choisir dans le parcours.', {list: B().KIND_ROOMS[pl.kind].map(k => `${B().ROOMS[k][0]} ${lc(B().ROOMS[k][1].replace(/^(La |Le |L’)/, ''))}${(pl.roomsDone || []).includes(k) ? ' ✓' : ''}`).join(', ')}))}</p>` : ''}
                ${G.opt?.nuit && B().NIGHT_DANGER.includes(pl.kind) ? `<p class="bk-miss">${esc(i18n('🌙 Dangereux la nuit.'))}</p>` : G.opt?.nuit && B().NIGHT_BONUS.includes(pl.kind) ? `<p>${esc(i18n('🌙 La nuit, on y trouve plus (les autres dorment).'))}</p>` : ''}
                ${G.opt?.missions && G.missions?.some(m => !m.done && B().DOCS[m.doc][2].includes(pl.kind)) ? `<p>${esc(i18n('📜 Peut-être ici : {list}.', {list: G.missions.filter(m => !m.done && B().DOCS[m.doc][2].includes(pl.kind)).map(m => B().missionTxt(m).replace(/^Retrouver /, '')).join(' ; ')}))}</p>` : ''}
                ${pl.known ? `<p class="bk-known">${esc(i18n('👁️ Vu le jour {d} : {list}.', {d: pl.known.d, list: `${Object.keys(pl.known.stock).length ? Object.entries(pl.known.stock).map(([r, n]) => `${n} ${resName(r)[1]} ${lc(resName(r)[2])}`).join(', ') : i18n('plus aucune réserve')}${pl.known.junk.length ? `, ${i18n('{n} bric-à-brac', {n: pl.known.junk.length})}` : ''}`}))} <small class="muted">${esc(i18n('Ça change chaque matin, au hasard : des choses reviennent, d’autres survivants passent.'))}</small></p>` : ''}
                <p class="muted">${esc(i18n(B().PLACE_KINDS[pl.kind][4] ? 'On peut y trouver (pas tout à la fois, au hasard) : {list}, et souvent des plans.' : 'On peut y trouver (pas tout à la fois, au hasard) : {list}.', {list: Object.keys(pl.max).map(r => resName(r)[1] + ' ' + lc(resName(r)[2])).join(', ')}))}${(B().PLACE_KINDS[pl.kind][5] || []).length ? ` ${esc(pl.seen && (pl.junk || []).length ? i18n('♻️ Du bric-à-brac : {list}.', {list: [...new Set(pl.junk)].map(k => B().JUNK[k][0] + ' ' + lc(B().JUNK[k][1])).join(', ')}) : pl.seen ? i18n('♻️ Du bric-à-brac (plus rien pour l’instant).') : i18n('♻️ Du bric-à-brac.'))}` : ''}</p>
                ${B().has(G, 'chariot') ? (G.rails === pl.id ? `<p>${esc(i18n('⛓️ Relié au bunker par les rails : deux fois plus vite, et le chariot de mine rapporte +30.'))}</p>` : Math.abs(pl.x - c.base[0]) + Math.abs(pl.y - c.base[1]) <= 4 ? `<div class="bk-send"><button type="button" class="button small secondary" data-bk="rails" data-id="${pl.id}" title="${esc(Object.entries(B().RAILS_COST).map(([r, n]) => `${n} ${lc(resName(r)[2])}`).join(', '))}">${esc(G.rails ? i18n('⛓️ Poser les rails jusqu’ici (à la place des autres)') : i18n('⛓️ Poser les rails jusqu’ici'))}</button></div>` : '') : ''}
                <div class="bk-send">${route.some(st => st.id === pl.id) ? `<button type="button" class="button small secondary" data-bk="routedel" data-id="${pl.id}">${esc(i18n('− Retirer du parcours'))}</button>` : `<button type="button" class="button small" data-bk="routeadd" data-id="${pl.id}" ${route.length >= 6 ? 'disabled' : ''}>${esc(i18n('＋ Ajouter au parcours'))}</button>`}</div></div>` : `<p class="muted">${esc(i18n('Clique sur les lieux de la carte pour composer le parcours (jusqu’à 6 étapes).'))}</p>`}${sitesHtml()}</div></div>`;
    }
    /** 🌳 la famille au bunker : le coffre, les liens, les naissances (l'arbre du bunker, à part de ta vraie base) */
    function sideFamille() {
        const H = B().HEIRLOOMS, alive = G.people.filter(p => p.hp > 0);
        const couples = [], seen = new Set();
        G.people.forEach(p => (p.spouses || []).forEach(id => { const k = [p.id, id].sort().join(); if (seen.has(k)) return; seen.add(k); const o = G.people.find(x => x.id === id); if (o) couples.push([p, o]); }));
        const miss = G.opt?.missions ? `<h4>📜 Missions généalogiques</h4>${(G.missions || []).filter(m => !m.done).length ? `<ul class="bk-coffre-items">${G.missions.filter(m => !m.done).map(m => `<li><b>${B().DOCS[m.doc][0]} ${esc(B().missionTxt(m))}</b><small>${esc(i18n('où chercher : {list} · récompense : {reward}', {list: B().DOCS[m.doc][2].map(k => `${B().PLACE_KINDS[k][0]} ${lc(B().PLACE_KINDS[k][1])}`).join(', '), reward: `${m.reward.n} ${lc(resName(m.reward.r)[2])}`}))}</small></li>`).join('')}</ul>` : `<p class="muted">${esc(G.ancestors?.length ? i18n('Toutes les missions sont faites !') : i18n('Pas d’ancêtre connu pour une mission (la partie a été créée sans arbre).'))}</p>`}
            ${(G.docs || []).length ? `<h4>📂 Retrouvé dans les ruines</h4><ul class="bk-coffre-items">${G.docs.map(d => `<li><b>${esc(d.txt)}</b><small>${esc(i18n('jour {n}', {n: d.day}))}</small></li>`).join('')}</ul><p class="muted">Ce sont des trouvailles du jeu : rien n’est écrit dans ton arbre.</p>` : ''}` : '';
        return `${miss}${G.pets?.length ? `<h4>🐾 Les animaux</h4>${petsHtml()}` : ''}<h4>🧳 Le coffre de famille</h4>${G.coffre.length ? `<ul class="bk-coffre-items">${G.coffre.map(c => `<li><b>${esc(c.title)}</b><small>${esc(H.find(h => h[0] === c.bonus)[2])}</small></li>`).join('')}</ul>` : `<p class="muted">${esc(i18n('Le coffre est parti vide (aucun objet choisi au départ).'))}</p>`}
            <h4>👪 Ensemble au bunker</h4>
            ${couples.length ? couples.map(([a, b]) => `<p>${esc(i18n('💞 {a} et {b}', {a: a.name, b: b.name}))}</p>`).join('') : ''}
            <p class="muted">${esc(i18n('{n} en vie. Ceux qui ont de la famille près d’eux gardent mieux le moral.', {n: plural(alive.length, 'personne')}))}${G.feud ? ` ${esc(i18n('⚡ Une vieille brouille : {a} et {b}.', {a: G.people.find(p => p.id === G.feud[0])?.name || '?', b: G.people.find(p => p.id === G.feud[1])?.name || '?'}))}` : ''}</p>
            ${G.preg ? `<p>${esc(i18n('🤰 {name} attend un bébé : naissance le jour {n}.', {name: G.people.find(p => p.id === G.preg.m)?.name || '', n: B().dayOf(G.preg.due)}))}</p>` : ''}
            <h4>🌳 L’arbre du bunker</h4>
            ${G.births.length ? `<div class="bk-tree">${G.births.map(b => `<div class="bk-tree-row"><span class="bk-tree-par">${esc(b.m)}${b.f ? ` <i>♥</i> ${esc(b.f)}` : ''}</span><span class="bk-tree-line" aria-hidden="true"></span><span class="bk-tree-kid">👶 ${esc(b.name)} <small>${esc(i18n('né·e le jour {n}', {n: b.day}))}</small></span></div>`).join('')}</div><p class="muted">${esc(i18n('Cet arbre reste dans la partie : il ne touche pas à ta vraie base.'))}</p>`
                : A().emptyState({size: 'small', icon: '👶', text: B().has(G, 'berceau') ? i18n('Pas encore de naissance. Il faut un couple qui a le moral, et un peu de temps (à partir du jour 5).') : i18n('Pas encore de naissance. Il faut un berceau, un couple qui a le moral, et un peu de temps (à partir du jour 5).')})}
            <p><button type="button" class="button small" data-bk="gazette">📰 Lire la gazette du bunker</button></p>`;
    }
    /* ═════════ 🗺️ La région : la carte dessinée par le jeu, les convois, les groupes de survivants ═════════ */
    let regSel = '', conv = null;
    const badge = (t, k) => (UI().badge ? UI().badge(t, k) : `<b>${esc(t)}</b>`);
    const repBadge = v => { const [, l, k] = B().repInfo(v); return badge(l, k); };
    const nodeName = id => B().nodeOf(G, id)?.name || '';
    /** la carte : des routes (couleur = danger, tirets = bord de l'eau), les lieux connus, « ? » pour ceux qu'on devine, les groupes, les convois */
    function regionSvg() {
        const R = G.region, N = id => B().nodeOf(G, id), D = B().DANGER, groups = G.groups || [];
        const near = new Set(); R.roads.forEach(r => { if (N(r.a).seen) near.add(r.b); if (N(r.b).seen) near.add(r.a); });
        const roads = R.roads.filter(r => N(r.a).seen || N(r.b).seen).map(r => { const a = N(r.a), b = N(r.b), terr = B().roadTerrain(G, r), path = conv?.dest && B().regionPath(G, conv.dest, conv.safe);
            const on = path && path.some((x, i) => i && ((path[i - 1] === r.a && x === r.b) || (path[i - 1] === r.b && x === r.a)));
            return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="bk-road is-d${r.danger}${terr === 'rive' ? ' is-rive' : ''}${!a.seen || !b.seen ? ' is-fog' : ''}${on ? ' is-path' : ''}"><title>${esc(i18n('{a} — {b} : {h} h, route {danger}, {terr}', {a: a.name, b: b.name, h: r.len, danger: D[r.danger][1], terr: B().TERRAINS[terr][1]}))}</title></line>`; }).join('');
        const nodes = R.nodes.filter(n => n.seen || near.has(n.id)).map(n => { const k = B().regionInfo(G, n.kind), gr = groups.find(x => x.at === n.id), sel = regSel === n.id;
            if (!n.seen) return `<g class="bk-rnode is-fog" data-bk="rnode" data-id="${n.id}" role="button" tabindex="0" aria-label="${esc(i18n('Lieu pas encore connu'))}"><circle cx="${n.x}" cy="${n.y}" r="4"/><text x="${n.x}" y="${n.y + 1.6}" class="bk-rico">?</text></g>`;
            return `<g class="bk-rnode${sel ? ' is-sel' : ''}${gr ? ` has-${gr.k}` : ''}" data-bk="rnode" data-id="${n.id}" role="button" tabindex="0" aria-label="${esc(n.name)}"><circle cx="${n.x}" cy="${n.y}" r="4.6"/><text x="${n.x}" y="${n.y + 1.8}" class="bk-rico">${k[0]}</text><text x="${n.x}" y="${n.y + 9}" class="bk-rlab">${esc(n.name.length > 18 ? n.name.slice(0, 17) + '…' : n.name)}</text>${gr ? `<text x="${n.x + 4.4}" y="${n.y - 3.2}" class="bk-rflag">${gr.k === 'bande' || gr.rep <= -50 ? '🏴' : B().GROUP_KINDS[gr.k][0]}</text>` : ''}</g>`; }).join('');
        const convs = (G.convoys || []).map(c => { const p = B().convoyAt(G, c); return `<g class="bk-rconv"><circle cx="${p.x}" cy="${p.y}" r="3"/><text x="${p.x}" y="${p.y + 1.3}" class="bk-rico is-small">🧭</text><title>${esc(i18n('Le convoi vers {place}', {place: nodeName(c.dest)}))}</title></g>`; }).join('');
        return `<svg class="bk-region" viewBox="0 0 100 100" role="img" aria-label="${esc(i18n('{name} : la carte de la région', {name: R.name}))}"><rect x="0" y="0" width="100" height="100" class="bk-rbg"/>${roads}<g class="bk-rnode is-home"><rect x="45.5" y="45.5" width="9" height="9"/><text x="50" y="51.8" class="bk-rico">☢</text></g>${nodes}${convs}</svg>`;
    }
    /** le chargement prévu, ce qu'il faut pour la route, la place, ce qui restera pour rapporter */
    function convoyCalc() {
        const who = [...conv.who].filter(id => G.people.some(p => p.id === id)), beasts = [...conv.beasts].map(id => G.pets.find(a => a.id === id)).filter(Boolean), plan = B().convoyPlan(G, conv.dest, Math.max(1, who.length), beasts, conv.safe);
        const F = B().freeTransports(G, 'route'), horses = [...conv.veh].map(k => F.veh.find(v => v.key === k)?.horse).filter(Boolean);
        const cap = who.length ? B().convoyCap(G, who, [...conv.veh], [...conv.beasts].filter(id => !horses.includes(id)), plan?.terrains) + (conv.tools.has('sac') ? 10 * who.length : 0) : 0, w = B().weightOf(conv.pack);
        return {who, plan, cap, w, F};
    }
    function convoyForm(n) {
        const al = G.people.filter(p => p.hp > 0 && p.where === 'base' && !p.baby && !p.child), gr = B().groupAt(G, n.id), {who, plan, cap, w, F} = convoyCalc(), ri = r => resName(r);
        const goals = Object.entries(B().CONVOY_GOALS).filter(([k]) => k === 'fouiller' || (gr && (k !== 'commercer' || !B().hostile(gr))));
        const vehs = F.veh.filter(v => B().TRANSPORT[v.k].kind === 'veh'), beasts = F.beasts, packRes = ['eau', 'nourriture', 'plantes', 'medic', ...(conv.goal === 'commercer' || conv.goal === 'aider' ? ['bois', 'tissu', 'metal', 'pieces', 'essence'] : [])].filter(r => B().resOk(G, r));
        const unit = r => ({eau: 'L', nourriture: 'rations'}[r] || '');
        const terrTxt = plan ? plan.terrains.map(t => `${B().TERRAINS[t][0]} ${B().TERRAINS[t][1]}`).join(', ') : '';
        return `<div class="bk-convoy"><h4>${esc(i18n('🧭 Former un convoi vers {place}', {place: n.name}))}</h4>
            <div class="bk-field"><span class="pk-lab">Qui part ?</span><div class="bk-cklist">${al.length ? al.map(p => `<label class="checkbox-line"><input type="checkbox" data-bk-cw="${esc(p.id)}" ${conv.who.has(p.id) ? 'checked' : ''} ${p.ill ? 'disabled' : ''}> ${esc(p.name)}${p.ill ? ` <small class="muted">${esc(i18n('(à soigner)'))}</small>` : (p.sk?.defendre || 1) > 1.2 ? ' <small class="muted">🛡️</small>' : ''}</label>`).join('') : `<small class="muted">${esc(i18n('Personne de libre au bunker.'))}</small>`}</div></div>
            <div class="bk-field"><span class="pk-lab">Pour quoi faire ?</span><div class="bk-radios" role="radiogroup">${goals.map(([k, [ico, l]]) => `<label class="checkbox-line"><input type="radio" name="bk_cgoal" value="${k}" data-bk-cgoal ${conv.goal === k ? 'checked' : ''}> ${ico} ${esc(l)}</label>`).join('')}</div>
                <p class="ui-hint">${esc(i18n(conv.goal === 'fouiller' ? (gr && B().hostile(gr) ? 'Ils vont vous chasser : il faudra se battre.' : gr ? 'Sur leurs terres : on trouve moins, ils n’aiment pas trop.' : 'On prend ce qu’on trouve.') : conv.goal === 'commercer' ? 'Ce que vous emportez en plus de la route est échangé : meilleur prix quand ils vous apprécient.' : conv.goal === 'aider' ? 'Ce que vous emportez en plus de la route leur est donné : leur réputation monte beaucoup.' : 'On prend leur réserve par la force : risqué, et les autres groupes le sauront.'))}</p></div>
            <div class="bk-field"><span class="pk-lab">Par où ?</span><div class="bk-radios" role="radiogroup"><label class="checkbox-line"><input type="radio" name="bk_csafe" value="0" data-bk-csafe ${conv.safe ? '' : 'checked'}> Le plus court</label><label class="checkbox-line"><input type="radio" name="bk_csafe" value="1" data-bk-csafe ${conv.safe ? 'checked' : ''}> Le plus sûr</label></div></div>
            ${vehs.length || beasts.length ? `<div class="bk-field"><span class="pk-lab">🚚 Transports</span><div class="bk-cklist">${vehs.map(v => { const it = B().ITEMS[v.k], worst = plan ? Math.min(...plan.terrains.map(t => B().terrK(v.k, t))) : 1; return `<label class="checkbox-line"><input type="checkbox" data-bk-cv="${v.key}" ${conv.veh.has(v.key) ? 'checked' : ''}> ${it.ico} ${esc(it.name)} <small class="muted">+${Math.round(it.carry * worst * (B().lvK(G.lvl?.[v.key]) || 1))}${worst < 1 ? ` ${esc(i18n(worst === 0 ? '(inutile sur ce chemin)' : '(gêné sur ce chemin)'))}` : ''}${v.horse ? ` · ${esc(i18n('avec son cheval'))}` : ''} · ${esc(i18n('usé à {n} %', {n: Math.round(G.wear?.[v.key] || 0)}))}</small></label>`; }).join('')}
                ${beasts.map(a => `<label class="checkbox-line"><input type="checkbox" data-bk-cb="${esc(a.id)}" ${conv.beasts.has(a.id) ? 'checked' : ''}> ${B().PETS[a.k][0]} ${esc(a.name)} <small class="muted">+${a.cap} · ${esc(i18n('mange et boit en route'))}</small></label>`).join('')}</div></div>` : ''}
            ${G.tools.length ? `<div class="bk-field"><span class="pk-lab">🧰 Outils emportés</span><div class="bk-cklist">${G.tools.map(k => { const [ico, l, d] = B().toolInfo(G, k); return `<label class="checkbox-line"><input type="checkbox" data-bk-ct="${k}" ${conv.tools.has(k) ? 'checked' : ''}> ${ico} ${esc(l)} <small class="muted">${esc(d)} · ${esc(i18n('le bunker s’en passe'))}</small></label>`; }).join('')}</div></div>` : ''}
            <div class="bk-field"><span class="pk-lab">🎒 Provisions et chargement</span><div class="bk-packs">${packRes.map(r => `<label><span>${ri(r)[1]} ${esc(ri(r)[2])}</span><input type="number" min="0" max="999" step="1" inputmode="numeric" value="${conv.pack[r] || ''}" placeholder="0" data-bk-cp="${r}" ${unit(r) ? `data-unit="${unit(r)}"` : ''} aria-label="${esc(i18n('{res} emportés', {res: ri(r)[2]}))}"></label>`).join('')}</div>
                <p class="ui-hint">${plan ? esc(i18n('Environ {days} jours aller-retour ({h} h de route à l’aller, {stay} h sur place) · {ico} pire route : {danger} · {terr}. Pour la route : {need}.', {days: String(plan.days).replace('.', ','), h: plan.hours, stay: B().STAY, ico: B().DANGER[plan.danger][0], danger: B().DANGER[plan.danger][1], terr: terrTxt, need: Object.entries(plan.need).filter(([, x]) => x).map(([r, x]) => `${x} ${lc(ri(r)[2])}`).join(', ')})) : ''}</p>
                <p class="bk-load${w > cap ? ' bk-miss' : ''}">${i18n(who.length ? '⚖️ Chargement : <b>{w}</b> sur {cap} de place · reste pour rapporter : {left}.' : '⚖️ Chargement : <b>{w}</b> sur {cap} de place.', {w: String(Math.round(w)), cap: String(cap), left: String(Math.max(0, Math.round(cap - w)))})} <small class="muted">${esc(i18n('L’eau et le métal pèsent lourd (×1,5), le tissu et les plantes peu (×0,5).'))}</small></p>
                <button type="button" class="button small secondary" data-bk="cneed" ${who.length ? '' : 'disabled'}>＋ Prévoir juste ce qu’il faut pour la route</button></div>
            <div class="bk-send"><button type="button" class="button small" data-bk="cgo" ${who.length && w <= cap ? '' : 'disabled'}>🧭 Faire partir le convoi</button></div></div>`;
    }
    function sideRegion() {
        if (!G.region) return A().emptyState({icon: '🗺️', text: i18n('Pas de carte de la région pour cette partie.')});
        const R = G.region, n = regSel && B().nodeOf(G, regSel), gr = n && B().groupAt(G, n.id), groups = G.groups || [];
        if (conv && conv.dest !== regSel) conv = null;
        const convs = (G.convoys || []).map(c => { const al = B().convoyAlive(G, c), L = c.leg, k = L ? Math.round(100 * Math.min(1, (G.t - L.t0) / Math.max(1, L.t1 - L.t0))) : 100;
            const where = esc(c.stayUntil ? i18n('sur place à {place} jusqu’à {time}', {place: nodeName(c.dest), time: B().clock(c.stayUntil)}) : L ? i18n(c.dir > 0 ? 'en route : {a} → {b}, arrivée jour {d} vers {time}' : 'sur le retour : {a} → {b}, arrivée jour {d} vers {time}', {a: nodeName(L.a), b: nodeName(L.b), d: B().dayOf(L.t1), time: B().clock(L.t1)}) : '');
            return `<div class="bk-radio-row"><span class="bk-ico">🧭</span><div><b>${esc(i18n('Vers {place}', {place: nodeName(c.dest)}))}</b> <small>${esc(lc(B().CONVOY_GOALS[c.goal][1]))} · ${esc(al.map(p => p.name.split(' ')[0]).join(', '))}${c.beasts.length ? ` · ${c.beasts.map(id => G.pets.find(a => a.id === id)?.name).filter(Boolean).map(esc).join(', ')}` : ''}</small><small>${where}</small>${L ? `<span class="bk-bar"><i style="width:${k}%"></i></span>` : ''}</div>${c.dir > 0 ? `<button type="button" class="button small secondary" data-bk="crecall" data-id="${esc(c.id)}" ${B().msgOk(G) ? '' : 'disabled'}>${B().crier(G) ? '📯' : '📻'} ${esc(i18n('Rentrez !'))}</button>` : ''}</div>`; }).join('');
        const asks = (G.asks || []).map(a => { const x = groups.find(y => y.id === a.g); return `<div class="bk-plan is-ask"><span class="bk-ico">🤲</span><div><b>${esc(i18n('{name} demandent {what}', {name: x?.name || i18n('Des voisins'), what: `${a.n} ${lc(resName(a.r)[2])}`}))}</b><small>${esc(i18n('réponse avant jour {d} {time} · partager fait monter leur réputation, refuser la fait baisser', {d: B().dayOf(a.until), time: B().clock(a.until)}))}</small></div><span class="bk-btns"><button type="button" class="button small" data-bk="ask" data-id="${esc(a.id)}" data-v="partager" ${(G.res[a.r] || 0) >= a.n ? '' : 'disabled'}>${esc(i18n('🤲 Partager'))}</button><button type="button" class="button small secondary" data-bk="ask" data-id="${esc(a.id)}" data-v="refuser">${esc(i18n('Refuser'))}</button></span></div>`; }).join('');
        const gcard = x => { const at = B().nodeOf(G, x.at), K = B().GROUP_KINDS[x.k], hos = B().hostile(x);
            const eff = i18n(x.k === 'bande' ? 'Plus ils vous en veulent, plus ils attaquent (et plus ils sont forts). Leur payer ce qu’ils demandent les calme deux jours.' : x.k === 'marchands' ? 'Plus ils vous apprécient, meilleurs sont les marchés (à la trappe et par la radio) ; un marchand volé ne revient pas de sitôt.' : 'Quand ils vous tiennent pour alliés, ils vous envoient de quoi tenir quand ça va mal.');
            return `<div class="bk-group${hos ? ' is-hostile' : ''}"><div class="bk-route-head"><b>${hos ? '🏴' : K[0]} ${esc(x.name[0].toUpperCase() + x.name.slice(1))}</b>${repBadge(x.rep)}</div><small class="muted">${esc(K[1])} · ${esc(at?.seen ? at.name : i18n('quelque part dans la région'))}${x.k === 'bande' ? ` · ${esc(i18n('force {n}', {n: x.str}))}` : ''}</small>
                <div class="bk-rep" title="${esc(i18n('Réputation {n} (de −100 à +100)', {n: String(x.rep)}))}"><span class="bk-bar is-rep"><i style="width:${Math.round((x.rep + 100) / 2)}%"></i></span><small>${x.rep > 0 ? '+' : ''}${x.rep}</small></div><small class="muted">${esc(eff)}</small>
                <span class="bk-btns is-row"><button type="button" class="button small secondary" data-bk="gift" data-id="${esc(x.id)}" ${B().msgOk(G) ? '' : `disabled title="${esc(i18n('Il faut de quoi porter le message'))}"`}>${esc(i18n('🎁 Offrir…'))}</button>${!hos && x.rep >= 0 ? `<button type="button" class="button small secondary" data-bk="beast" data-id="${esc(x.id)}" ${B().msgOk(G) ? '' : 'disabled'}>${esc(i18n('🫏 Échanger une bête…'))}</button>` : ''}${at?.seen ? `<button type="button" class="link-button" data-bk="rnode" data-id="${x.at}">${esc(i18n('Voir sur la carte'))}</button>` : ''}</span></div>`; };
        const card = n ? (n.seen ? `<div class="bk-placecard"><b>${B().regionInfo(G, n.kind)[0]} ${esc(n.name)}</b><small>${esc(B().regionInfo(G, n.kind)[1])} · ${esc(n.visits ? i18n('visité {n}', {n: plural(n.visits, 'fois', 'fois')}) : i18n('jamais visité'))} · ${esc((c => c ? i18n('{d} j aller-retour, pire route {ico} {danger}', {d: String(c.days).replace('.', ','), ico: B().DANGER[c.danger][0], danger: B().DANGER[c.danger][1]}) : '')(B().convoyPlan(G, n.id, 1)))}</small>
                ${gr ? `<p>${B().hostile(gr) ? '🏴' : B().GROUP_KINDS[gr.k][0]} ${esc(i18n('{name} vivent ici', {name: gr.name[0].toUpperCase() + gr.name.slice(1)}))} ${repBadge(gr.rep)}</p>` : ''}
                <p class="muted">${esc(i18n('On peut y trouver : {list}.', {list: [...Object.keys(n.max).map(r => `${resName(r)[1]} ${lc(resName(r)[2])}`), n.plans && i18n('des plans'), B().REGION_KINDS[n.kind][3].beast && i18n('des bêtes de bât'), B().REGION_KINDS[n.kind][3].folk >= 0.2 && i18n('des gens qui cherchent un abri')].filter(Boolean).join(', ')}))}</p>
                ${(G.convoys || []).some(c => c.dest === n.id) ? `<p>${esc(i18n('🧭 Un convoi y est déjà en route.'))}</p>` : conv ? convoyForm(n) : `<div class="bk-send"><button type="button" class="button small" data-bk="cform">${esc(i18n('🧭 Former un convoi…'))}</button></div>`}</div>`
            : `<div class="bk-placecard"><b>${esc(i18n('? Un lieu pas encore connu'))}</b><small class="muted">${esc(i18n('Un convoi qui passe à côté le découvrira.'))}</small></div>`) : `<p class="muted">${esc(i18n('Clique sur un lieu de la carte pour y envoyer un convoi : plusieurs jours de route, les absents ne travaillent pas au bunker.'))}</p>`;
        return `<p class="muted">${esc(R.name)} · ${esc(i18n('{n} sur {total}.', {n: plural(R.nodes.filter(x => x.seen).length, 'lieu connu', 'lieux connus'), total: R.nodes.length}))}</p>
            <div class="bk-regionwrap">${regionSvg()}</div>
            <p class="bk-legend"><span><i class="bk-lg is-d0"></i>sûre</span><span><i class="bk-lg is-d1"></i>peu sûre</span><span><i class="bk-lg is-d2"></i>dangereuse</span><span><i class="bk-lg is-d3"></i>très dangereuse</span><span><i class="bk-lg is-rive"></i>bord de l’eau</span></p>
            ${card}
            <h4>🧭 Les convois</h4>${convs || `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🧭</span><span class="empty-line-text">${esc(i18n('Aucun convoi en route.'))}</span></p>`}
            ${asks ? `<h4>🤲 On vous demande de l’aide</h4><div class="bk-plans">${asks}</div>` : ''}
            <h4>🤝 Les autres survivants</h4><div class="bk-groups">${groups.map(gcard).join('')}</div>`;
    }
    /* ═════════ 🏚️ Les bâtiments de la ville ═════════ */
    let siteSel = '';
    function siteCard(st) {
        const S = B().SITES[st.k], [lab, kind] = B().SITE_STATE[st.state], prod = B().siteProd(G, st), free = G.people.filter(p => p.hp > 0 && p.where === 'base' && !p.baby && !p.child);
        const going = G.people.filter(p => p.where === 'dehors' && p.exp?.site === st.id), cost = st.state === 'ruine' ? S[1] : Object.fromEntries(Object.entries(S[1]).map(([r, n]) => [r, Math.max(1, Math.ceil(n / 3))]));
        const since = st.last ? Math.floor((G.t - st.last) / 1440) : null;
        return `<div class="bk-placecard bk-site"><div class="bk-route-head"><b>${S[0]} ${esc(B().siteName(G, st.k))}</b>${badge(lab, kind)}</div>
            <small>${esc(i18n('{h} h de marche · produit par jour : {prod}', {h: String(Math.round(B().travel(G, st) / 6) / 10), prod: Object.entries(prod).map(([r, n]) => `${resName(r)[1]} ${String(n).replace('.', ',')}`).join(' ')}))}${st.fence ? ` · ${esc(i18n('🪵 palissade'))}` : ''}${st.raids ? ` · ${esc(i18n('pillé {n}', {n: plural(st.raids, 'fois', 'fois')}))}` : ''}</small>
            ${st.state === 'chantier' ? `<div class="bk-rep"><span class="bk-bar"><i style="width:${Math.round(100 * st.work / st.need)}%"></i></span><small>${Math.floor(st.work)} / ${st.need} h</small></div>` : ''}
            ${st.state === 'marche' ? `<p>${esc(Object.keys(st.stock).some(r => st.stock[r] >= 1) ? i18n('🧺 En attente : {list}', {list: Object.entries(st.stock).filter(([, n]) => n >= 1).map(([r, n]) => `${resName(r)[1]} ${Math.floor(n)}`).join(' ')}) : i18n('🧺 Rien en attente pour l’instant.'))} · ${esc(since == null ? i18n('personne n’y est encore passé') : since ? i18n('dernier passage il y a {n}', {n: plural(since, 'jour')}) : i18n('quelqu’un y est passé aujourd’hui'))}${since > 2 ? ` <span class="bk-miss">${esc(i18n('— il risque d’être pillé'))}</span>` : ''}.</p>` : ''}
            ${st.state === 'abime' ? `<p class="bk-miss">${esc(i18n('Abîmé : il ne produit plus. Les réparations coûtent un tiers du chantier.'))}</p>` : ''}
            ${going.length ? `<p>${esc(i18n(going.length > 1 ? '👷 {who} y sont.' : '👷 {who} y est.', {who: going.map(p => p.name.split(' ')[0]).join(', ')}))}</p>` : ''}
            ${['ruine', 'abime'].includes(st.state) ? `<p class="bk-cost">${costTxt(cost)}</p><div class="bk-send"><button type="button" class="button small" data-bk="sstart" data-id="${st.id}">${esc(st.state === 'ruine' ? i18n('🔨 Lancer le chantier') : i18n('🔧 Lancer les réparations'))}</button></div>` : ''}
            ${['chantier', 'marche'].includes(st.state) && free.length ? `<div class="bk-send"><select data-bk-sitewho aria-label="${esc(i18n('Qui y va ?'))}">${free.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>${st.state === 'chantier' ? `<button type="button" class="button small" data-bk="swork">${esc(i18n('👷 Travailler 8 h'))}</button>` : `<button type="button" class="button small" data-bk="sharvest">${esc(i18n('🧺 Aller récolter'))}</button>`}</div>` : ''}
            ${st.state === 'marche' && !st.fence ? `<div class="bk-send"><button type="button" class="button small secondary" data-bk="sfence" data-id="${st.id}" title="${esc(Object.entries(B().FENCE_COST).map(([r, n]) => `${n} ${lc(resName(r)[2])}`).join(', '))}">${esc(i18n('🪵 Construire une palissade'))}</button></div>` : ''}</div>`;
    }
    function sitesHtml() {
        const L = G.sites || []; if (!L.length) return '';
        return `<h4>🏚️ Bâtiments à remettre en état</h4><p class="muted">Un chantier (des matériaux, puis des heures de travail sur place), et ils produisent chaque jour. Ce qui n’est pas récolté peut être pillé : passe les voir.</p>
            <div class="bk-sites">${L.map(st => { const [lab, kind] = B().SITE_STATE[st.state]; return `<button type="button" class="bk-siterow${siteSel === st.id ? ' is-sel' : ''}" data-bk="site" data-id="${st.id}"><span>${B().SITES[st.k][0]}</span><span>${esc(B().siteName(G, st.k))}</span>${badge(lab, kind)}</button>`; }).join('')}</div>
            ${siteSel && B().siteOf(G, siteSel) ? siteCard(B().siteOf(G, siteSel)) : ''}`;
    }
    /* ═════════ 🚚 Les transports (onglet Réserves) ═════════ */
    function transportsHtml() {
        const T = B().TRANSPORT, terr = B().cityTerrain(G), use = B().inUse(G), its = B().items(G).filter(x => T[x.k]), beasts = G.pets.filter(a => B().BEASTS[a.k]);
        const rows = its.map(x => { const it = B().ITEMS[x.k], key = `${x.fi},${x.si}`, kind = T[x.k].kind, f = kind === 'veh' ? B().terrK(x.k, terr) : 1, brk = G.broken?.[key];
            return `<div class="bk-plan${brk ? ' is-off' : ''}"><span class="bk-ico">${it.ico}</span><div><b>${esc(it.name)}</b><small>${esc(kind === 'perso' ? i18n('chacun, en plus') : kind === 'bats' ? i18n('sur chaque âne') : kind === 'rails' ? (G.rails ? i18n('vers {place}', {place: G.city.places.find(p => p.id === G.rails)?.name || ''}) : i18n('les rails ne sont pas encore posés (onglet 🏙️ Ville, un lieu proche)')) : i18n('un seul véhicule par sortie, le meilleur pour le terrain'))} · +${it.carry}${kind === 'veh' && f !== 1 ? ` <span class="${f < 1 ? 'bk-miss' : ''}">${esc(f === 0 ? i18n('(inutile aujourd’hui)') : i18n('(×{k} aujourd’hui)', {k: String(f).replace('.', ',')}))}</span>` : ''}${use.v.has(key) ? ` · ${esc(i18n('parti'))}` : ''}${brk ? ` · ${esc(i18n('🔧 à réparer (il faut un établi)'))}` : T[x.k].wear ? ` · ${esc(i18n('usé à {n} %', {n: Math.round(G.wear?.[key] || 0)}))}` : ''}</small></div></div>`; }).join('')
            + beasts.map(a => `<div class="bk-plan${a.hurt ? ' is-off' : ''}"><span class="bk-ico">${B().PETS[a.k][0]}</span><div><b>${esc(a.name)}</b><small>${esc(B().PETS[a.k][1])} · +${a.k === 'ane' ? 12 + (B().has(G, 'bats') ? 5 : 0) : 8}${a.hurt ? ` · ${esc(i18n('blessé·e, au repos'))}` : ''}${use.a.has(a.id) ? ` · ${esc(i18n('parti·e'))}` : ''}${a.trips ? ` · ${esc(plural(a.trips, 'expédition'))}` : ''}</small></div></div>`).join('');
        return `<h4>🚚 Transports</h4><p class="muted">${esc(i18n('Aujourd’hui en ville : {terr}.', {terr: `${B().TERRAINS[terr][0]} ${B().TERRAINS[terr][1]}`}))} ${esc(i18n('Ce qu’on rapporte se compte en poids : l’eau, le métal et l’essence pèsent lourd, le tissu, les plantes et les médicaments peu. La brouette peine dans la boue, le traîneau ne va que sur la neige, la barque que sur l’eau.'))}</p>
            ${rows ? `<div class="bk-plans">${rows}</div>` : A().emptyState({size: 'small', icon: '🚚', text: i18n('Pas encore de transport : des sacs à dos, une brouette, une charrette… (onglet 🛠️ Atelier), ou un âne.')})}`;
    }
    /* ═════════ 💞 🎓 Les liens d'un habitant ═════════ */
    const REL_L = v => (v >= 25 ? ['🤝', i18n('Ami·e')] : v >= 10 ? ['🙂', i18n('Bonne entente')] : v > -10 ? ['😐', i18n('Neutre')] : v > -25 ? ['😒', i18n('Froid')] : ['😠', i18n('Ne se supportent plus')]);
    function apprChips(p) {
        const L = G.appr || [], asA = L.find(x => x.a === p.id), asM = L.find(x => x.m === p.id), S = k => B().SKILLS.find(s => s[0] === k), nm = id => G.people.find(o => o.id === id)?.name.split(' ')[0] || '?';
        return [asA ? `<span class="bk-chip is-appr" title="${esc(i18n('Il ou elle progresse chaque soir passé au bunker avec son maître'))}">${esc(i18n('🎓 apprenti·e de {name}', {name: nm(asA.m)}))} · ${S(asA.sk)[1]} ×${(p.sk[asA.sk] || 1).toFixed(2).replace('.', ',')}</span>` : '', asM ? `<span class="bk-chip is-appr" title="${esc(i18n('Son savoir restera chez son apprenti'))}">${esc(i18n('🎓 forme {name}', {name: nm(asM.a)}))} · ${S(asM.sk)[1]}</span>` : ''].join('');
    }
    function apprMenu(btn, p) {
        const S = B().SKILLS, can = B().canTeach(G, p), L = G.appr || [], mine = L.find(x => x.m === p.id), menu = UI().menuAt;
        const items = mine ? [{icon: '🎓', label: i18n('Arrêter l’apprentissage de {name}', {name: G.people.find(o => o.id === mine.a)?.name || ''}), run: () => { B().stopApprentice(G, mine.a); drawAll(); }}]
            : can.flatMap(k => G.people.filter(o => o !== p && o.hp > 0 && !o.baby && !L.some(x => x.a === o.id) && (o.sk?.[k] || 1) < p.sk[k] - 0.1).map(o => ({icon: S.find(s => s[0] === k)[1], label: `${S.find(s => s[0] === k)[2]} : ${o.name}`, help: i18n('{name} ×{a} → jusqu’à ×{b}', {name: o.name.split(' ')[0], a: (o.sk?.[k] || 1).toFixed(1).replace('.', ','), b: (p.sk[k] - 0.05).toFixed(2).replace('.', ',')}), run: () => { const r = B().setApprentice(G, p.id, o.id, k); if (!r.ok) toast(r.err, 'error'); drawAll(); }}))).slice(0, 14);
        if (!items.length) { toast(i18n('Personne à qui apprendre : tout le monde en sait déjà autant.')); return; }
        if (menu) menu(btn, items, {title: i18n('🎓 {name} forme un·e apprenti·e', {name: p.name.split(' ')[0]})});
    }
    function linksHtml(p) {
        const others = G.people.filter(o => o !== p && o.hp > 0 && !o.baby); if (!others.length || p.baby) return '';
        return `<h4>💞 Ses liens</h4><ul class="bk-links">${others.map(o => { const v = B().relOf(G, p, o), [ico, l] = REL_L(v), cpl = (p.spouses || []).includes(o.id), kin = (p.kin || []).includes(o.id);
            return `<li><span>${cpl ? '💞' : ico} ${esc(o.name)}</span><small>${esc(cpl ? i18n('en couple') : l)}${kin ? ` · ${esc(i18n('de la même famille'))}` : ''}</small><span class="bk-bar is-rep"><i style="width:${Math.round((v + 50))}%"></i></span></li>`; }).join('')}</ul>
            <p class="muted">L’entente monte en travaillant ensemble, en partant en convoi, entre maître et apprenti ; deux adultes qui s’entendent très bien peuvent former un couple (jamais deux proches parents). Les amis au même travail vont plus vite.</p>`;
    }
    /* ═════════ 🧓 Les bulles des souvenirs ═════════ */
    const bubbleSeen = new Map();
    function bubblesHtml() {
        const now = performance.now(), out = [];
        (G.bubbles || []).forEach(b => { const k = `${b.who}:${b.t}`; if (!bubbleSeen.has(k)) bubbleSeen.set(k, now); if (now - bubbleSeen.get(k) < 14000) out.push(b); });
        return out.slice(-2).map(b => { const p = G.people.find(x => x.id === b.who); return p ? `<div class="bk-bubble" role="status">${pawn(p)}<span><b>${esc(p.name.split(' ')[0])}</b> « ${esc(b.txt)} »</span></div>` : ''; }).join('');
    }

    /** 📰 la gazette : le récit de la partie, comme un journal */
    function gazetteHtml() {
        const st = G.stats, day = B().dayOf(G.t), alive = G.people.filter(p => p.hp > 0), me = meOf(G);
        const head = G.over ? i18n('Le bunker de {name} s’est tu après {n}', {name: me.name, n: plural(day - 1, 'jour')}) : alive.length === G.people.length ? i18n('{n} sous terre : tout le monde tient bon', {n: plural(day - 1 || 1, 'jour')}) : i18n('Jour {d} : {n} à {city}', {d: day, n: plural(alive.length, 'survivant'), city: G.city.name});
        const stories = G.log.filter(l => l.kind === 'histoire').slice(0, 3);
        return `<div class="bk-gz-paper"><button type="button" class="icon-button bk-gz-close" data-bk="gzclose" aria-label="${esc(i18n('Fermer'))}">×</button>
            <header class="bk-gz-mast"><small>${esc(G.city.name)} · ${esc(i18n('jour {n}', {n: day}))}${B().dateOf(G) ? ` · ${esc(B().dateOf(G))}` : ''} · ${B().clock(G.t)}</small><h2>${esc(B().HIST[G.scen] ? i18n('La Gazette de l’abri') : i18n('La Gazette du Bunker'))}</h2><small>${esc(B().HIST[G.scen] ? i18n('{scen} · lue à la chandelle', {scen: B().SCENARIOS[G.scen][1]}) : i18n('Édition spéciale · ne paraît que sous terre'))}</small></header>
            <h3 class="bk-gz-head">${esc(head)}</h3>
            <div class="bk-gz-cols">
                <section><h4>Les habitants</h4><ul>${G.people.map(p => { const d = st.deaths.find(x => x.name === p.name); return `<li>${p.hp > 0 ? '✓' : '✝'} <b>${esc(p.name)}</b>${p.baby ? ` ${esc(i18n('(né·e au bunker)'))}` : ''}${p.from ? ` <small>· ${esc(p.from)}</small>` : ''}${d ? ` <small>· ${esc(i18n('mort·e le jour {n}', {n: d.day}))}</small>` : ''}</li>`; }).join('')}</ul>
                    ${G.births.length ? `<h4>Carnet rose</h4><ul>${G.births.map(b => `<li>👶 ${esc(b.f ? i18n('{name}, jour {d}, de {m} et {f}', {name: b.name, d: b.day, m: b.m, f: b.f}) : i18n('{name}, jour {d}, de {m}', {name: b.name, d: b.day, m: b.m}))}</li>`).join('')}</ul>` : ''}</section>
                <section><h4>À la trappe</h4><p>${esc(plural(st.visits.marchand, 'marchand'))} (${esc(plural(st.trades, 'échange'))}), ${esc(plural(st.visits.voyageur, 'voyageur'))}, ${esc(st.visits.pillards ? i18n('{n} de pillards ({won}, {lost})', {n: plural(st.visits.pillards, 'visite'), won: plural(st.raidsWon, 'repoussée'), lost: plural(st.raidsLost, 'perdue')}) : i18n('aucun pillard'))}.</p>
                    <h4>Les veillées</h4><p>${esc(i18n(st.stories > 1 ? '{n} racontées le soir.' : '{n} racontée le soir.', {n: plural(st.stories, 'histoire')}))}</p>${stories.map(l => `<blockquote>${esc(l.txt.replace(/^📖 /, ''))}</blockquote>`).join('')}</section>
                <section><h4>Sur les routes</h4><p>${esc((G.stats.expeditions || 0) ? (G.stats.expLost ? i18n('{n} ({ok}, {lost})', {n: plural(G.stats.expeditions, 'expédition'), ok: plural(G.stats.expOk || 0, 'réussie'), lost: plural(G.stats.expLost, 'perdue')}) : i18n('{n} ({ok})', {n: plural(G.stats.expeditions, 'expédition'), ok: plural(G.stats.expOk || 0, 'réussie')})) : i18n('Aucun convoi n’est encore parti'))}${(G.convoys || []).length ? ` ; ${esc(i18n('{n} en route', {n: plural(G.convoys.length, 'convoi')}))}` : ''}.</p>
                    ${(G.groups || []).length ? `<h4>Les voisins</h4><ul>${G.groups.map(x => `<li>${B().hostile(x) ? '🏴' : B().GROUP_KINDS[x.k][0]} ${esc(x.name)} : ${esc(lc(B().repInfo(x.rep)[1]))}</li>`).join('')}</ul>` : ''}
                    ${(G.sites || []).some(x => x.state === 'marche') ? `<h4>La ville se relève</h4><ul>${G.sites.filter(x => x.state === 'marche').map(x => `<li>${B().SITES[x.k][0]} ${esc(B().siteName(G, x.k))}</li>`).join('')}</ul>` : ''}
                    ${(G.couples || []).length ? `<h4>Le carnet du cœur</h4><ul>${G.couples.map(c => `<li>${esc(i18n('💞 {a} et {b}, jour {d}', {a: G.people.find(p => p.id === c.a)?.name || '', b: G.people.find(p => p.id === c.b)?.name || '', d: c.d}))}</li>`).join('')}</ul>` : ''}
                    ${(G.appr || []).length || G.stats.compagnons || G.stats.transmis ? `<h4>Les apprentis</h4><p>${(G.appr || []).map(x => esc(i18n('{a} apprend auprès de {m}', {a: G.people.find(p => p.id === x.a)?.name || '', m: G.people.find(p => p.id === x.m)?.name || ''}))).join(' ; ')}${G.stats.compagnons ? ` ${esc(i18n(G.stats.compagnons > 1 ? '{n} devenus aussi habiles que son maître.' : '{n} devenu aussi habile que son maître.', {n: plural(G.stats.compagnons, 'apprenti')}))}` : ''}${G.stats.transmis ? ` ${esc(i18n('Un savoir transmis au-delà de la mort.'))}` : ''}</p>` : ''}
                    ${G.stats.souvenirs ? `<h4>Souvenirs d’ancêtres</h4>${G.log.filter(l => l.txt.startsWith('🧓')).slice(0, 2).map(l => `<blockquote>${esc(l.txt.replace(/^🧓 Souvenir de /, ''))}</blockquote>`).join('')}` : ''}</section>
                <section><h4>Trouvailles</h4>${st.found.length ? `<ul>${st.found.slice(-12).map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : `<p>${esc(i18n('Rien de notable pour l’instant.'))}</p>`}
                    ${G.coffre.length ? `<h4>Le coffre de famille</h4><ul>${G.coffre.map(c => `<li>${esc(c.title)}</li>`).join('')}</ul>` : ''}
                    <h4>Le bunker</h4><p>${esc(i18n('{floors}, {n} installations ({built} à l’atelier), {tools}, {plans}.', {floors: plural(G.floors.length, 'étage'), n: B().items(G).length, built: i18n((st.built || 0) > 1 ? '{n} fabriquées' : '{n} fabriquée', {n: st.built || 0}), tools: plural(G.tools.length, 'outil'), plans: i18n(G.plans.length > 1 ? '{n} plans' : '{n} plan', {n: G.plans.length})}))}</p>
                    <h4>🏆 Succès</h4>${(ach => ach.length ? `<ul>${ach.map(([k, d]) => { const a = B().ACH.find(x => x[0] === k); return a ? `<li>${a[1]} ${esc(a[2])} <small>· ${esc(i18n('jour {n}', {n: d}))}</small></li>` : ''; }).join('')}</ul>` : `<p>${esc(i18n('Pas encore de succès dans cette partie.'))}</p>`)(Object.entries(G.ach || {}).sort((a, b) => a[1] - b[1]))}
                    ${G.won ? `<p><b>${esc(i18n('{scen} : gagné le jour {n} !', {scen: B().SCENARIOS[G.scen][1], n: G.won}))}</b></p>` : ''}${G.rewound ? `<p><small>${esc(i18n('⏪ Revenu en arrière {n}.', {n: plural(G.rewound, 'fois', 'fois')}))}</small></p>` : ''}</section>
            </div>
            <footer class="bk-gz-foot"><button type="button" class="button small secondary" data-bk="gzprint">🖨 Imprimer</button></footer></div>`;
    }
    function kitchenHtml() {
        const R = B().RECIPES, cur = G.menu || 'auto', now = B().pickRecipe(G), cook = B().canCook(G);
        const opts = Object.entries(R).filter(([k, r]) => (!r.chain || G.opt?.chaines) && (!r.lore || G.lore?.some(x => x.kind === 'recipe')));
        return `<label class="bk-field">${esc(i18n('Le plat du jour'))} <select data-bk-menu><option value="auto" ${cur === 'auto' ? 'selected' : ''}>${esc(i18n('✨ Le meilleur possible'))}</option>${opts.map(([k, r]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${r.ico} ${esc(B().recipeName(G, k))}</option>`).join('')}</select></label>
            <p>${esc(i18n('Aujourd’hui :'))} <b>${R[now].ico} ${esc(B().recipeName(G, now))}</b>${!cook ? ` <small class="muted">${esc(i18n('(rien pour cuire : un 🔥 poêle, un 🍲 fourneau ou un 🍞 four)'))}</small>` : ''}</p>
            <div class="bk-plans">${opts.filter(([k]) => k !== 'simple').map(([k, r]) => { const ok = B().recipeOk(G, k); return `<div class="bk-plan${ok ? ' is-can' : ' is-off'}"><span class="bk-ico">${r.ico}</span><div><b>${esc(B().recipeName(G, k))}</b><small>${Object.entries(r.in).map(([x, n]) => `${resName(x)[1]} ${n}`).join(' ')}${r.cook ? ` · ${esc(i18n('🔥 à cuire'))}` : ''} → ${esc(i18n('faim +{a}, moral {b}', {a: r.faim, b: `${r.mood >= 0 ? '+' : ''}${r.mood}`}))}</small></div></div>`; }).join('')}</div>`;
    }
    function petsHtml() {
        const P = B().PETS; if (!G.pets?.length) return '';
        return `<div class="bk-pets">${G.pets.map(a => `<span class="bk-chip${a.hungry ? ' is-bad' : ''}" title="${esc(P[a.k][1])} : ${esc(P[a.k][3])} · ${esc(i18n('mange {food} par jour', {food: Object.entries(P[a.k][2]).map(([r, n]) => `${n} ${lc(resName(r)[2])}`).join(', ')}))}${a.hungry ? ` · ${esc(i18n('n’a pas mangé depuis {n} jour(s)', {n: a.hungry}))}` : ''}">${P[a.k][0]} ${esc(a.name)}${a.hungry ? ` ${esc(i18n('(a faim)'))}` : ''}</span>`).join('')}</div>`;
    }
    let decoFloor = 0;
    function decoHtml() {
        const D = B().DECOS, fi = Math.min(decoFloor, G.floors.length - 1), l = G.deco?.[fi] || [], names = [...G.people.filter(p => p.hp > 0).map(p => p.name), ...(G.ancestors || []).map(a => a.name)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 40);
        return `<p class="muted">Quatre décorations par étage au plus : chacune remonte un peu le moral de tous (le portrait de famille plus que les autres).</p>
            <div class="bk-p-actions"><label>${esc(i18n('Étage'))} <select data-bk-decofloor>${G.floors.map((f, i) => `<option value="${i}" ${i === fi ? 'selected' : ''}>−${i + 1} (${(G.deco?.[i] || []).length} / ${B().DECO_MAX})</option>`).join('')}</select></label>
                <label>${esc(i18n('Portrait de'))} <select data-bk-portrait>${names.map(n => `<option>${esc(n)}</option>`).join('')}</select></label></div>
            ${l.length ? `<div class="bk-chips">${l.map((d, i) => `<span class="bk-chip">${D[d.k][0]} ${esc(d.name ? i18n('{deco} de {name}', {deco: D[d.k][1], name: d.name}) : D[d.k][1])} <button type="button" class="icon-button small" data-bk="undeco" data-i="${i}" aria-label="${esc(i18n('Enlever'))}">×</button></span>`).join('')}</div>` : ''}
            <div class="bk-chips">${Object.entries(D).map(([k, [ico, lab, cost, m]]) => { const ok = Object.entries(cost).every(([r, n]) => (G.res[r] || 0) >= n) && l.length < B().DECO_MAX;
                return `<button type="button" class="bk-chip" data-bk="deco" data-v="${k}" ${ok ? '' : 'disabled'} title="${esc(lab)} : ${esc(Object.entries(cost).map(([r, n]) => `${n} ${lc(resName(r)[2])}`).join(', '))} · ${esc(i18n('moral +{n}/h', {n: String(m)}))}${k === 'guirlande' ? ` ${esc(i18n('(avec électricité)'))}` : ''}">${ico} ${esc(lab)}</button>`; }).join('')}</div>`;
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
        return `<svg class="bk-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(i18n('{what} : {n} {unit} aujourd’hui', {what: i18n(SERIES.find(s2 => s2[0] === k)[1]), n: last, unit: unit && i18n(unit)}))}" data-bk-chart="${k}" data-unit="${esc(unit && i18n(unit))}" data-pts="${esc(JSON.stringify(rows.map((r, i) => [r.d, r[k] || 0, +x(i).toFixed(1), +y(r[k] || 0).toFixed(1)])))}">
            <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="bk-axis"/><line x1="${L}" x2="${W - R}" y1="${y(max)}" y2="${y(max)}" class="bk-grid"/>
            <text x="${L - 4}" y="${y(max) + 4}" text-anchor="end" class="bk-tick">${max}</text><text x="${L - 4}" y="${y(0) + 4}" text-anchor="end" class="bk-tick">0</text>
            <text x="${L}" y="${H - 4}" class="bk-tick">${esc(i18n('jour {n}', {n: rows[0].d}))}</text><text x="${W - R}" y="${H - 4}" text-anchor="end" class="bk-tick">${esc(i18n('jour {n}', {n: rows[n - 1].d}))}</text>
            ${n > 1 ? `<polyline points="${pts}" class="bk-line"/>` : ''}<circle cx="${x(n - 1)}" cy="${y(last)}" r="4" class="bk-dot"/>
            <line class="bk-cross" x1="0" x2="0" y1="${T}" y2="${y(0)}" visibility="hidden"/><circle class="bk-hov" r="4" visibility="hidden"/><rect x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent" class="bk-hit"/></svg>`;
    }
    function sideStats() {
        const rows = statRows();
        return `<p class="muted">Une photo par jour (à minuit), et aujourd’hui en direct. Survole une courbe pour lire la valeur d’un jour.</p>
            <div class="bk-stats">${SERIES.map(([k, l, u]) => `<figure class="bk-stat"><figcaption><b>${esc(i18n(l))}</b><span>${rows[rows.length - 1][k]}${u ? ' ' + esc(i18n(u)) : ''}</span></figcaption><div class="bk-spark-wrap">${sparkSvg(rows, k, u)}<span class="bk-tip" hidden></span></div></figure>`).join('')}</div>
            <details><summary>Voir le tableau</summary><div class="bk-tablewrap"><table class="bk-table"><thead><tr><th>Jour</th>${SERIES.map(([, l]) => `<th>${esc(i18n(l))}</th>`).join('')}</tr></thead><tbody>${rows.slice().reverse().map(r => `<tr><td>${r.d}</td>${SERIES.map(([k]) => `<td>${r[k]}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>
            <h4>En tout</h4><p>${[[G.stats.repairs, '🔧 réparation(s)'], [G.stats.events, '🌪️ catastrophe(s)'], [G.stats.fires, '🔥 incendie(s)'], [G.stats.meals, '🍲 bon(s) repas'], [G.stats.recycled, '♻️ objet(s) démonté(s)'], [G.stats.trades, '🤝 échange(s)'], [G.stats.stories, '📖 veillée(s)'], [G.stats.expeditions, '🧭 expédition(s)'], [G.stats.sitesFixed, '🏚️ bâtiment(s) remis en état'], [G.stats.souvenirs, '🧓 souvenir(s) d’ancêtres'], [G.stats.gifts, '🎁 aide(s) donnée(s)']].filter(([n]) => n).map(([n, l]) => `${n} ${esc(i18n(l))}`).join(' · ') || esc(i18n('Rien encore.'))}</p>`;
    }
    /** survol d'une courbe : la ligne verticale, le point, et la valeur du jour le plus proche */
    function chartHover(e) {
        const svg = e.target.closest?.('svg[data-bk-chart]'); if (!svg) { hoverChart = false; return; } hoverChart = true; const wrap = svg.parentElement, tip = wrap.querySelector('.bk-tip'), pts = JSON.parse(svg.dataset.pts || '[]'); if (!pts.length) return;
        const box = svg.getBoundingClientRect(), vx = (e.clientX - box.left) / box.width * 300, p = pts.reduce((a, b) => (Math.abs(b[2] - vx) < Math.abs(a[2] - vx) ? b : a));
        const cr = svg.querySelector('.bk-cross'), hv = svg.querySelector('.bk-hov'); cr.setAttribute('x1', p[2]); cr.setAttribute('x2', p[2]); cr.setAttribute('visibility', 'visible'); hv.setAttribute('cx', p[2]); hv.setAttribute('cy', p[3]); hv.setAttribute('visibility', 'visible');
        tip.hidden = false; tip.textContent = i18n('Jour {d} : {v}', {d: p[0], v: `${p[1]}${svg.dataset.unit ? ' ' + svg.dataset.unit : ''}`}); tip.style.left = `${Math.min(70, Math.max(0, p[2] / 3 - 10))}%`;
    }
    function chartLeave(e) { hoverChart = false; const svg = e.target.closest?.('svg[data-bk-chart]'); if (!svg) return; svg.querySelectorAll('.bk-cross, .bk-hov').forEach(x => x.setAttribute('visibility', 'hidden')); const tip = svg.parentElement.querySelector('.bk-tip'); if (tip) tip.hidden = true; }
    /* ── 📖 le livre du bunker : le récit de la partie ── */
    function bookParts() {
        const me = meOf(G), day = B().dayOf(G.t), S = B().SCENARIOS[G.scen] || B().SCENARIOS.classique;
        const byDay = new Map(); G.log.slice().reverse().filter(l => ['alerte', 'histoire', 'visite'].includes(l.kind)).forEach(l => { const d = B().dayOf(l.t); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(l.txt); });
        const people = G.people.map(p => ({name: p.name, txt: [p.baby ? i18n('né·e au bunker') : '', p.from, (p.traits || []).map(k => B().TRAITS[k]?.[1]).filter(Boolean).join(', '), p.hp > 0 ? '' : i18n('mort·e le jour {n}', {n: G.stats.deaths.find(d => d.name === p.name)?.day || '?'})].filter(Boolean).join(' · '), diary: (p.diary || []).slice(0, 4).reverse()}));
        return {title: i18n('Le livre du bunker de {name}', {name: me.name}), sub: `${G.city.name} · ${S[0]} ${S[1]} · ${day - 1 > 0 ? i18n('{n} sous terre', {n: plural(day - 1, 'jour')}) : i18n('le premier jour')}${G.over ? ` · ${i18n('la fin')}` : ''}`, people, days: [...byDay].map(([d, l]) => [d, l.slice(0, 12)]), docs: G.docs || [], births: G.births || [], coffre: G.coffre || []};
    }
    function bookHtml(forPrint = false) {
        const b = bookParts();
        return `<div class="bk-gz-paper bk-book">${forPrint ? '' : `<button type="button" class="icon-button bk-gz-close" data-bk="gzclose" aria-label="${esc(i18n('Fermer'))}">×</button>`}
            <header class="bk-gz-mast"><small>${esc(b.sub)}</small><h2>${esc(b.title)}</h2></header>
            <h3>${esc(i18n('Ceux qui sont descendus'))}</h3><ul>${b.people.map(p => `<li><b>${esc(p.name)}</b>${p.txt ? ` <small>· ${esc(p.txt)}</small>` : ''}${p.diary.length ? `<blockquote>${p.diary.map(d => `${esc(i18n('Jour {n}', {n: d.d}))} — ${esc(d.txt)}`).join('<br>')}</blockquote>` : ''}</li>`).join('')}</ul>
            <h3>${esc(i18n('Jour après jour'))}</h3>${b.days.length ? b.days.map(([d, l]) => `<section class="bk-book-day"><h4>${esc(i18n('Jour {n}', {n: d}))}</h4><p>${l.map(esc).join(' ')}</p></section>`).join('') : `<p>${esc(i18n('Rien encore.'))}</p>`}
            ${b.births.length ? `<h3>${esc(i18n('Naissances'))}</h3><ul>${b.births.map(x => `<li>👶 ${esc(i18n('{name}, jour {d}', {name: x.name, d: x.day}))}</li>`).join('')}</ul>` : ''}
            ${b.docs.length ? `<h3>${esc(i18n('Ce qu’on a retrouvé de la famille'))}</h3><ul>${b.docs.map(d => `<li>${esc(d.txt)} <small>${esc(i18n('(jour {n})', {n: d.day}))}</small></li>`).join('')}</ul>` : ''}
            ${b.coffre.length ? `<h3>${esc(i18n('Le coffre de famille'))}</h3><ul>${b.coffre.map(c => `<li>${esc(c.title)}</li>`).join('')}</ul>` : ''}
            ${forPrint ? '' : `<footer class="bk-gz-foot"><button type="button" class="button small secondary" data-bk="bookprint">${esc(i18n('🖨 Imprimer'))}</button><button type="button" class="button small secondary" data-bk="bookdl">${esc(i18n('⤓ Télécharger (.html)'))}</button>${ext.tresors?.T?.save ? `<button type="button" class="button small" data-bk="bookkeep">${esc(i18n('✨ Ranger dans Trésors'))}</button>` : ''}</footer>`}</div>`;
    }
    const bookDoc = () => `<!doctype html><html lang="${esc(window.LCNDA_I18N?.lang || 'fr')}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(bookParts().title)}</title><style>body{font:16px/1.5 Georgia,serif;margin:24px auto;max-width:760px;padding:0 16px;color:#111;background:#fff}h2{font:900 34px Georgia,serif;text-align:center;border-top:3px double #111;border-bottom:3px double #111;margin:6px 0;padding:6px 0}.bk-gz-mast{text-align:center}h3{border-bottom:1px solid #111;margin-top:24px}blockquote{font-style:italic;margin:6px 0 6px 14px;color:#333}small{color:#555}</style>${bookHtml(true)}</html>`;
    const bookText = () => { const b = bookParts(); return [b.title, b.sub, '', i18n('Ceux qui sont descendus :'), ...b.people.map(p => `- ${p.name}${p.txt ? ` (${p.txt})` : ''}`), '', ...b.days.flatMap(([d, l]) => [i18n('Jour {n}', {n: d}), ...l, '']), ...(b.docs.length ? [i18n('Ce qu’on a retrouvé de la famille :'), ...b.docs.map(d => `- ${d.txt}`)] : [])].join('\n'); };
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
        const opt = (k, l, d) => `<div class="bk-optl"><label class="ui-toggle"><input type="checkbox" data-bk-opt="${k}" ${o[k] ? 'checked' : ''}><i></i>${esc(i18n(l))}</label><p class="ui-hint">${esc(i18n(d.replace(/^— /, '')))}</p></div>`;
        return `<h4>Difficulté</h4><div class="segmented bk-planf" role="group">${Object.entries(B().DIFFS).map(([k, d]) => `<button type="button" data-bk="diff" data-v="${k}" class="${G.diff === k ? 'is-active' : ''}">${esc(d.l)}</button>`).join('')}</div>
            <p class="muted">Plus difficile : on a faim et soif plus vite, moins de réserves au départ, des pillards plus forts, plus de pannes, et la ville se remplit moins vite.</p>
            <h4>Options</h4>${opt('meteo', '🌪️ Météo et catastrophes', '— canicule, tempête de poussière, inondation, séisme, orage, vague de froid')}${opt('chaines', '🧵 Chaînes de fabrication', '— rouet, métier à tisser, tailleur ; champ, moulin, four à pain')}${opt('tuto', '📘 Tutoriel guidé', G.tuto >= 0 ? i18n('étape {a} / {b}', {a: G.tuto + 1, b: B().TUTO.length}) : '— (le cocher le recommence)')}
            ${opt('age', '🧓 Vieillir', '— un jour = un an : les bébés grandissent, les aînés ralentissent')}${opt('feu', '🔥 Incendies', '— un poêle, un court-circuit… un 🧯 extincteur l’éteint tout de suite')}
            ${opt('nuit', '🌗 La nuit en ville', i18n('dangereux la nuit : {a} ; plus de choses la nuit : {b}', {a: B().NIGHT_DANGER.map(k => B().PLACE_KINDS[k][0]).join(' '), b: B().NIGHT_BONUS.map(k => B().PLACE_KINDS[k][0]).join(' ')}))}${opt('missions', '📜 Missions généalogiques', '— retrouver l’acte, la photo ou la lettre d’un vrai ancêtre (onglet 🌳 Famille)')}
            ${opt('souvenirs', '🧓 Souvenirs des ancêtres', `${i18n('un ancêtre de ta base qui trouve un objet ou un lieu de sa vraie vie (son métier, son village, un lieu de sa fiche) raconte une anecdote tirée de sa fiche, dans le journal et en bulle. Jamais rien sur un vivant ni une fiche confidentielle.')}${G.people.some(p => p.mem) ? '' : ` ${i18n('(Aucun habitant de cette partie n’a de fiche à raconter.)')}`}`)}
            <h4>🔊 Sons</h4>${soundHtml()}
            <h4>Scénario</h4><p>${S[0]} <b>${esc(S[1])}</b> — ${esc(S[2])}</p>
            <p>${esc(G.won ? i18n('🏆 Gagné le jour {n} : tu peux continuer aussi longtemps que tu veux.', {n: G.won}) : i18n('🏆 Pour gagner : tenir {n} jours (encore {left}). Ensuite, la partie continue sans fin.', {n: B().goalOf(G), left: plural(Math.max(0, B().goalOf(G) - (B().dayOf(G.t) - 1)), 'jour')}))}</p>
            ${B().HIST[G.scen] ? `<p class="muted">📜 ${esc(B().dateOf(G))} · ${esc(G.people.some(p => p.inv) ? i18n('{a} de ta famille, {b} de l’époque.', {a: plural(G.people.filter(p => !p.inv && !p.baby).length, 'ancêtre'), b: plural(G.people.filter(p => p.inv).length, 'habitant inventé', 'habitants inventés')}) : i18n('{a} de ta famille.', {a: plural(G.people.filter(p => !p.inv && !p.baby).length, 'ancêtre')}))}</p>` : ''}
            ${G.event ? `<h4>En ce moment</h4><p>${B().EVENTS[G.event.k][0]} <b>${esc(B().EVENTS[G.event.k][1])}</b> : ${esc(i18n('{what} (encore {n} h).', {what: B().EVENTS[G.event.k][2], n: Math.max(1, Math.round((G.event.until - G.t) / 60))}))}</p>` : ''}
            <h4>Pannes</h4><p class="muted">Les installations s’usent et tombent parfois en panne (🔧 sur le dessin). Clique dessus : « Réparer » (un quart de ce qu’elles ont coûté, puis du travail à l’atelier). Le même menu propose « Améliorer » (niveau 2 puis 3 : leurs effets comptent ×1,5 puis ×2).</p>
            <p>${esc(Object.keys(G.broken || {}).length ? i18n('🔧 En panne : {list}.', {list: Object.keys(G.broken).map(k => { const [f, s2] = k.split(',').map(Number); return B().ITEMS[G.floors[f].slots[s2]].name; }).join(', ')}) : i18n('✓ Rien en panne.'))}</p>`;
    }
    function sideRadio() {
        const out = G.people.filter(p => p.hp > 0 && p.where === 'dehors');
        const msgOk = G.power || B().crier(G) || B().has(G, 'talkie') || B().has(G, 'pigeonnier');
        return `${msgOk ? '' : `<p class="ui-notice is-error">${esc(i18n('📻 Pas d’électricité : la radio est muette. Les messages arriveront quand le courant reviendra.'))}</p>`}${B().crier(G) ? `<p class="muted">${esc(i18n('📯 Pas de radio à cette époque : un gamin du quartier court porter les nouvelles, et le crieur annonce le marché chaque matin.'))}</p>` : ''}
            ${(G.convoys || []).length ? `<h4>🧭 Les convois</h4><p class="muted">Leur suivi est dans l’onglet 🗺️ Région.</p>${G.convoys.map(c => `<p>${esc(i18n(c.dir > 0 ? '🧭 Vers {place} : {who}' : '🧭 Vers {place} : {who} (sur le retour)', {place: nodeName(c.dest), who: B().convoyAlive(G, c).map(p => p.name).join(', ')}))}</p>`).join('')}` : ''}
            <h4>Dehors</h4>${out.length ? out.map(p => { const pl = expPlace(p); return `<div class="bk-radio-row">${pawn(p)}<div><b>${esc(p.name)}</b><small>${esc(i18n(p.exp.phase === 'aller' ? 'en route vers {place}' : p.exp.phase === 'fouille' ? 'fouille {place}' : p.exp.phase === 'chantier' ? 'travaille à {place}' : 'rentre de {place}', {place: pl?.name || ''}))}${p.exp.route?.length > 1 ? ` ${esc(i18n('(étape {a} / {b})', {a: p.exp.i + 1, b: p.exp.route.length}))}` : ''} · ${esc(i18n(p.exp.phase === 'retour' ? 'arrive {time}' : 'jusqu’à {time}', {time: B().clock(p.exp.until)}))}</small></div>${p.exp.phase !== 'retour' ? `<button type="button" class="button small secondary" data-bk="recall" data-id="${esc(p.id)}" ${msgOk ? '' : 'disabled'}>${B().crier(G) ? '📯' : '📻'} ${esc(i18n('Rentre !'))}</button>` : ''}</div>`; }).join('') : `<p class="muted">${esc(i18n('Tout le monde est au bunker.'))}</p>`}
            <h4>📻 Le marché de la radio</h4>${marketHtml()}
            <h4>Journal</h4><ol class="bk-log">${G.log.slice(0, 120).map(l => `<li class="is-${l.kind}"><span class="bk-t">${esc(i18n('J{n}', {n: B().dayOf(l.t)}))} ${B().clock(l.t)}</span> ${esc(l.txt)}</li>`).join('')}</ol>`;
    }

    function marketHtml() {
        const m = G.market || {offers: [], deals: []}, r = k => resName(k);
        if (!B().hasRadio(G)) return `<p class="muted">${esc(i18n('Sans radio, pas de marché.'))}</p>`;
        return `<p class="muted">D’autres survivants proposent des échanges : on envoie tout de suite, un messager apporte la marchandise quelques heures plus tard (le plus souvent…). Les prix changent chaque matin.</p>
            ${m.offers.length ? `<div class="bk-plans">${m.offers.map(o => { const ok = (G.res[o.want.r] || 0) >= o.want.n; return `<div class="bk-plan${ok ? ' is-can' : ''}"><span class="bk-ico">${r(o.give.r)[1]}</span><div><b>${o.give.n} ${esc(lc(r(o.give.r)[2]))}</b><small>${esc(i18n('contre {what} · {who}', {what: `${r(o.want.r)[1]} ${o.want.n} ${lc(r(o.want.r)[2])}`, who: o.who}))}</small>${ok ? '' : `<small class="bk-miss">${esc(i18n('Il manque {what}.', {what: `${Math.ceil(o.want.n - (G.res[o.want.r] || 0))} ${lc(r(o.want.r)[2])}`}))}</small>`}</div><span class="bk-btns"><button type="button" class="button small" data-bk="trade" data-id="${esc(o.id)}" ${ok && (G.power || B().crier(G)) ? '' : 'disabled'}>${esc(i18n('🤝 Accepter'))}</button></span></div>`; }).join('')}</div>` : `<p class="muted">${esc(i18n('Plus d’offre aujourd’hui : de nouvelles demain matin (7 h).'))}</p>`}
            ${m.deals.length ? `<p>${esc(i18n('🚚 En route : {list}.', {list: m.deals.map(d => i18n('{ico} {n} de {who} (vers {time})', {ico: r(d.r)[1], n: d.n, who: d.who, time: B().clock(d.t)})).join(', ')}))}</p>` : ''}`;
    }
    /** 📔 le journal d'un habitant (à la place de la liste, dans l'onglet Habitants) */
    let diaryOf = '';
    function diaryHtml(p) {
        const list = (p.diary || []).map(d => `<li><span class="bk-t">${esc(i18n('Jour {n}', {n: d.d}))}</span> ${esc(d.txt)}</li>`).join('');
        return `<div class="bk-route-head"><h4>${esc(i18n('📔 Le journal de {name}', {name: p.name}))}</h4><button type="button" class="button small secondary" data-bk="diary" data-id="">${esc(i18n('← Tous les habitants'))}</button></div>
            ${linksHtml(p)}<h4>📔 Ce qu’il ou elle écrit</h4>${list ? `<ol class="bk-log bk-diary">${list}</ol>` : A().emptyState({size: 'small', icon: '📔', text: i18n('Rien d’écrit pour l’instant : il ou elle écrit chaque soir.')})}`;
    }
    /** imprimer (la gazette, le livre) : la fenêtre « Imprimer » de l'app (format, sens, aperçu, PDF) */
    function printBunker(title, doc) {
        if (UI().openPrintDialog) { UI().openPrintDialog({title, html: doc, photos: false}); return; }
        const w = window.open('', '_blank'); if (!w) { toast(i18n('La fenêtre d’impression a été bloquée.'), 'error'); return; } // secours, sans LCNDA_UI
        w.document.write(doc); w.document.close(); w.focus(); w.print(); // secours
    }
    /* ═════════ Les clics ═════════ */
    function onClick(e) {
        const b = e.target.closest('[data-bk]'); if (!b || !dlg.contains(b)) return;
        const k = b.dataset.bk;
        if (k === 'close') { dlg.close(); return; }
        if (k === 'resume') { const x = store().games[b.dataset.id]; if (!x) return; try { G = B().check(x.g); } catch (err) { toast(err.message, 'error'); return; } gid = b.dataset.id; tab = 'gens'; placeSel = null; route = []; mapScroll = null; diaryOf = ''; regSel = ''; conv = null; siteSel = ''; play(); return; }
        if (k === 'delsave') { const id = b.dataset.id, name = store().games[id]?.name || ''; const del = () => { const s = store(); delete s.games[id]; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
            if (A()?.undoLocalChange) A().undoLocalChange(i18n('Partie « Le bunker de {name} » supprimée', {name}), [KEY], del, () => { if (dlg && !G) startScreen(); }); else del(); startScreen(); return; }
        if (k === 'propose') { propose(b.closest('form')); return; }
        if (k === 'records') { if (G) overlay(recordsHtml()); else recordsScreen(); return; }
        if (k === 'recback') { startScreen(); return; }
        if (!G) return;
        if (k === 'more') { moreMenu(b); return; }
        if (k === 'rewind') { overlay(morningsHtml()); return; }
        if (k === 'rewindgo') { rewindTo(Number(b.dataset.d)); return; }
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
        if (k === 'sendfrom') { tab = 'ville'; drawTop(); drawSide(); const sel = () => dlg.querySelector('[data-bk-sendwho]'); if (sel()) sel().value = b.dataset.id; else toast(i18n('Choisis un lieu sur la carte.')); sendFor = b.dataset.id; return; }
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
        if (k === 'gzprint') { printBunker(i18n('La Gazette du Bunker'), `<!doctype html><meta charset="utf-8"><title>${esc(i18n('La Gazette du Bunker'))}</title><style>body{font:15px Georgia,serif;margin:24px;color:#111}h2{font:900 40px Georgia,serif;text-align:center;margin:4px 0;border-top:3px double #111;border-bottom:3px double #111}.bk-gz-mast{text-align:center}.bk-gz-cols{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}h3{text-align:center;font-size:22px}h4{border-bottom:1px solid #111;margin:12px 0 6px}button{display:none}blockquote{font-style:italic;margin:6px 0 6px 10px}</style>${gazetteHtml()}`); return; }
        if (k === 'recall') { if (!B().recall(G, b.dataset.id)) toast(i18n('La radio ne passe pas (pas d’électricité ?).'), 'error'); drawAll(); return; }
        if (k === 'mute') { SND.unlock(); SND.set('on', !SND.pref.on); drawAll(); return; }
        if (k === 'book') { const gz = dlg.querySelector('[data-bk-gz]'); if (!gz) return; gz.innerHTML = bookHtml(); gz.hidden = false; if (G.speed) { gzPaused = G.speed; setSpeed(0); } gz.querySelector('[data-bk="gzclose"]')?.focus(); return; }
        if (k === 'bookprint') { printBunker(bookParts().title, bookDoc()); return; }
        if (k === 'bookdl') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bookDoc()], {type: 'text/html'})); a.download = `livre-du-bunker-${String(meOf(G).name).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); return; }
        if (k === 'bookkeep') { const me = meOf(G); ext.tresors.T.save({kind: 'story', person_id: me.pid || null, title: `${bookParts().title} (${new Date().toLocaleDateString('fr-FR')})`, body: bookText(), data: {bunker: true}}).then(() => toast(i18n('✓ Rangé dans ✨ Trésors (sur la fiche de {name}).', {name: me.name}))).catch(err => toast(err.message || i18n('Impossible de ranger le livre.'), 'error')); return; }
        if (k === 'deco') { const sel = dlg.querySelector('[data-bk-portrait]'), r = B().addDeco(G, Math.min(decoFloor, G.floors.length - 1), b.dataset.v, 0, b.dataset.v === 'portrait' ? sel?.value || '' : ''); if (!r.ok) toast(r.err, 'error'); drawAll(); return; }
        if (k === 'undeco') { B().removeDeco(G, Math.min(decoFloor, G.floors.length - 1), Number(b.dataset.i)); drawAll(); return; }
        if (k === 'room') { const st = route.find(x => x.id === b.dataset.id); if (st) { if (b.dataset.v) st.room = b.dataset.v; else delete st.room; } drawSide(); return; }
        if (k === 'diff') { B().setDiff(G, b.dataset.v); drawAll(); return; }
        if (k === 'trade') { const r = B().trade(G, b.dataset.id); if (!r.ok) toast(r.err, 'error'); drawAll(); return; }
        if (k === 'diary') { diaryOf = b.dataset.id || ''; tab = 'gens'; drawTop(); drawSide(); const sb = dlg.querySelector('[data-bk-side]'); if (sb) sb.scrollTop = 0; return; }
        if (k === 'tutoskip') { B().setOpt(G, 'tuto', false); drawAll(); return; }
        if (k === 'unbuild') { B().cancelBuild(G, Number(b.dataset.i)); drawAll(); return; }
        if (k === 'build') { const spot = firstFree(); if (!spot) { toast(i18n('Plus de place libre : creuse un étage (⛏️).'), 'error'); return; } order(b.dataset.k, ...spot); return; }
        if (k === 'slot') { slotMenu(b, Number(b.dataset.f), Number(b.dataset.s)); return; }
        // 🗺️ la région, les convois, les groupes
        if (k === 'rnode') { regSel = b.dataset.id; if (tab !== 'region') { tab = 'region'; drawTop(); } if (conv?.dest !== regSel) conv = null; drawSide(); return; }
        if (k === 'cform') { conv = {dest: regSel, who: new Set(), pack: {}, veh: new Set(), beasts: new Set(), tools: new Set(), goal: 'fouiller', safe: false}; drawSide(); return; }
        if (k === 'cneed') { const {plan} = convoyCalc(); if (plan) Object.entries(plan.need).forEach(([r, n]) => { conv.pack[r] = Math.max(conv.pack[r] || 0, n); }); drawSide(); return; }
        if (k === 'cgo') { const r = B().formConvoy(G, {dest: conv.dest, who: [...conv.who], pack: conv.pack, veh: [...conv.veh], beasts: [...conv.beasts], tools: [...conv.tools], goal: conv.goal, safe: conv.safe}); if (!r.ok) { toast(r.err, 'error'); return; } conv = null; drawAll(); return; }
        if (k === 'crecall') { if (!B().recallConvoy(G, b.dataset.id)) toast(i18n('Le message ne passe pas (pas d’électricité ?).'), 'error'); drawAll(); return; }
        if (k === 'ask') { const r = B().answerAsk(G, b.dataset.id, b.dataset.v); if (!r.ok) toast(r.err, 'error'); drawAll(); return; }
        if (k === 'gift') { const id = b.dataset.id, pt = pointOf(b), opts = [['nourriture', 5], ['eau', 6], ['medic', 2], ['bois', 6], ['tissu', 4], ['essence', 4]].filter(([r]) => B().resOk(G, r));
            UI().menuAt?.(pt || b, opts.map(([r, n]) => ({icon: resName(r)[1], label: `${n} ${lc(resName(r)[2])}`, help: i18n('tu en as {n}', {n: Math.floor(G.res[r] || 0)}), disabled: (G.res[r] || 0) < n, run: () => { const x = B().giftGroup(G, id, r, n); if (!x.ok) toast(x.err, 'error'); drawAll(); }})), {title: i18n('🎁 Offrir')}); return; }
        if (k === 'beast') { const id = b.dataset.id, pt = pointOf(b), P = B().BEAST_PRICE; UI().menuAt?.(pt || b, Object.keys(P).map(kk => ({icon: B().PETS[kk][0], label: B().PETS[kk][1], help: i18n('contre {what} · {desc}', {what: Object.entries(P[kk]).map(([r, n]) => `${n} ${lc(resName(r)[2])}`).join(', '), desc: B().PETS[kk][3]}), run: () => { const x = B().buyBeast(G, id, kk); if (!x.ok) toast(x.err, 'error'); drawAll(); }})), {title: i18n('🫏 Échanger une bête de bât')}); return; }
        // 🏚️ les bâtiments, ⛓️ les rails, 🎓 l'apprentissage
        if (k === 'site') { siteSel = b.dataset.id; if (tab !== 'ville') { tab = 'ville'; drawTop(); } drawSide(); dlg.querySelector('.bk-site')?.scrollIntoView?.({block: 'nearest'}); return; }
        if (k === 'sstart') { const r = B().startSite(G, b.dataset.id); if (!r.ok) toast(r.err, 'error'); drawAll(); return; }
        if (k === 'sfence') { const r = B().fenceSite(G, b.dataset.id); if (!r.ok) toast(r.err, 'error'); drawAll(); return; }
        if (k === 'swork' || k === 'sharvest') { const who = dlg.querySelector('[data-bk-sitewho]')?.value, r = B().sendSite(G, who, siteSel, k === 'swork' ? 'travail' : 'recolte', 8); if (!r.ok) toast(r.err, 'error'); drawAll(); return; }
        if (k === 'rails') { const r = B().layRails(G, b.dataset.id); if (!r.ok) toast(r.err, 'error'); drawAll(); return; }
        if (k === 'appr') { const p = G.people.find(x => x.id === b.dataset.id); if (p) apprMenu(pointOf(b) || b, p); }
    }
    /** où est parti un habitant : un lieu de la ville, ou un bâtiment à remettre en état */
    const expPlace = p => (p.exp?.site ? (st => (st ? {name: B().siteName(G, st.k)} : null))(B().siteOf(G, p.exp.site)) : G.city.places.find(x => x.id === p.exp?.place));
    let sendFor = '', gzPaused = 0;
    /** un panneau par-dessus la partie (comme la gazette) : la partie se met en pause, × le referme */
    function overlay(html) { const gz = dlg.querySelector('[data-bk-gz]'); if (!gz) return; gz.innerHTML = html; gz.hidden = false; if (G?.speed) { gzPaused = G.speed; setSpeed(0); } gz.querySelector('[data-bk="gzclose"]')?.focus(); }
    /** ⋯ : les autres actions de la partie */
    function moreMenu(btn) {
        const last = G.mornings?.[G.mornings.length - 2] || G.mornings?.[0], items = [
            {icon: '⏪', label: last ? i18n('Reprendre au matin du jour {n}…', {n: last.d}) : i18n('Reprendre au matin…'), help: last ? `${plural(G.mornings.length, 'matin gardé', 'matins gardés')}` : i18n('pas encore de matin gardé'), disabled: !G.mornings?.length, run: () => overlay(morningsHtml())},
            {icon: '🏆', label: i18n('Succès et records'), run: () => overlay(recordsHtml())},
            {icon: '📖', label: i18n('Le livre de la partie'), help: i18n('le récit, jour après jour'), run: () => doClick('book')},
            {icon: '⤓', label: i18n('Exporter la partie'), help: i18n('la garder dans un fichier'), run: () => doClick('export')}];
        if (UI().menuAt) UI().menuAt(btn, items); else overlay(morningsHtml());
    }
    /** une action du menu ⋯ : comme un clic sur le bouton qu'elle remplace */
    function doClick(k) { if (!dlg) return; const b = document.createElement('button'); b.type = 'button'; b.hidden = true; b.dataset.bk = k; dlg.append(b); try { onClick({target: b}); } finally { b.remove(); } }
    const resLine = m => B().resList(G).filter(x => m.res?.[x[0]] != null).map(x => `${x[1]} ${m.res[x[0]]}`).join(' ');
    /** ⏪ les matins gardés (les 7 derniers) : jour, habitants, réserves ; reprendre ne demande rien, « ↶ Annuler » ramène où on était */
    function morningsHtml() {
        const L = (G.mornings || []).slice().reverse(), now = B().dayOf(G.t);
        return `<div class="bk-gz-paper bk-panel"><button type="button" class="icon-button bk-gz-close" data-bk="gzclose" aria-label="Fermer">×</button>
            <h2>${esc(i18n('⏪ Revenir au matin d’avant'))}</h2><p class="muted">${esc(i18n('Chaque matin à 6 h, la partie est gardée (les {n} derniers). Reprendre ramène ce matin-là ; si tu changes d’avis, « ↶ Annuler » ramène où tu en étais.', {n: B().MORNINGS}))}</p>
            ${L.length ? `<ol class="bk-morns">${L.map(m => `<li><div><b>${esc(i18n(m.d === now ? 'Jour {n} (ce matin)' : 'Jour {n}', {n: m.d}))}</b><small>${B().HIST[G.scen] ? `${esc(B().dateOf(G, m.t))} · ` : ''}6 h · ${esc(m.tot > m.pop ? i18n('{n} en vie sur {tot}', {n: plural(m.pop, 'habitant'), tot: m.tot}) : i18n('{n} en vie', {n: plural(m.pop, 'habitant')}))}</small><small class="bk-mres">${resLine(m)}</small></div><button type="button" class="button small" data-bk="rewindgo" data-d="${m.d}">${esc(i18n('⏪ Reprendre ce matin-là'))}</button></li>`).join('')}</ol>`
                : A().emptyState({size: 'small', icon: '⏪', text: i18n('Pas encore de matin gardé : le premier le sera demain à 6 h.')})}
            <footer class="bk-gz-foot"><button type="button" class="button secondary" data-bk="gzclose">Fermer</button></footer></div>`;
    }
    function rewindTo(d) {
        const before = G, id = gid, r = B().rewind(G, d); if (!r.ok) { toast(r.err, 'error'); return; }
        const show = g => { if (!dlg || gid !== id) return; G = g; G.speed = 0; gzPaused = 0; saveGame(gid, G, true); play(); };
        show(r.g);
        const msg = i18n('⏪ Repris au matin du jour {n} (en pause)', {n: d});
        if (A()?.undoToast) A().undoToast(msg, {undo: () => show(before), redo: () => show(r.g), undoneText: i18n('retour au matin du jour {n}', {n: d})}); else toast(msg);
    }
    /** 🏆 succès gagnés (avec la date), ceux qui restent (grisés, ou « ? » s'ils sont cachés), et les meilleures parties */
    function recordsBody() {
        const r = recs(), when = d => (UI().when ? UI().when(d) : esc(new Date(d).toLocaleDateString('fr-FR'))), list = B().ACH, got = list.filter(a => r.ach[a[0]]);
        const S = B().SCENARIOS, D = B().DIFFS, best = Object.values(r.best).sort((a, b) => (b.days - a.days) || (b.pop - a.pop)).slice(0, 10);
        const badge = a => { const x = r.ach[a[0]], hid = a[4] && !x;
            return `<div class="bk-badge${x ? ' is-got' : ' is-off'}${hid ? ' is-hidden' : ''}" title="${esc(hid ? i18n('Succès caché : il se dévoile quand on le gagne.') : a[3])}"><span class="bk-badge-ico">${hid ? '?' : a[1]}</span><div><b>${esc(hid ? i18n('Succès caché') : a[2])}</b><small>${esc(hid ? i18n('Il se dévoile quand on le gagne.') : a[3])}</small>${x ? `<small class="bk-badge-when">✓ ${when(x.at)}${x.who ? ` · ${esc(x.who)}` : ''}</small>` : ''}</div></div>`; };
        return `<p class="muted">${esc(i18n('{a} sur {b} succès gagnés. Gardé sur cet ordinateur seulement.', {a: got.length, b: list.length}))}</p>
            <h3>Gagnés</h3>${got.length ? `<div class="bk-badges">${got.sort((a, b) => String(r.ach[b[0]].at).localeCompare(String(r.ach[a[0]].at))).map(badge).join('')}</div>` : A().emptyState({size: 'small', icon: '🏆', text: i18n('Pas encore de succès : tiens une semaine, construis, repousse les pillards…')})}
            <h3>À gagner</h3><div class="bk-badges">${list.filter(a => !r.ach[a[0]]).map(badge).join('')}</div>
            <h3>Les meilleures parties</h3>${best.length ? `<div class="bk-rec-wrap"><table class="data-table bk-rec-table"><thead><tr><th>Jours tenus</th><th>Habitants</th><th>Scénario</th><th>Difficulté</th><th>Partie</th><th>Date</th></tr></thead><tbody>${best.map(x => `<tr><td><b>${x.days}</b>${x.won ? ' 🏆' : ''}</td><td>${x.pop} / ${x.tot}</td><td>${S[x.scen] ? `${S[x.scen][0]} ${esc(S[x.scen][1])}` : '—'}</td><td>${esc(D[x.diff]?.l || '—')}</td><td>${esc(x.name || '')}<small class="muted"> · ${esc(x.city || '')}${x.over ? ' · ☠️' : ''}</small></td><td>${when(x.at)}</td></tr>`).join('')}</tbody></table></div>`
                : A().emptyState({size: 'small', icon: '📊', text: i18n('Pas encore de partie : descends dans le bunker !')})}`;
    }
    function recordsHtml() { return `<div class="bk-gz-paper bk-panel"><button type="button" class="icon-button bk-gz-close" data-bk="gzclose" aria-label="Fermer">×</button><h2>🏆 Succès et records</h2>${recordsBody()}<footer class="bk-gz-foot"><button type="button" class="button secondary" data-bk="gzclose">Fermer</button></footer></div>`; }
    function recordsScreen() {
        stop(); G = null; gid = '';
        dlg.innerHTML = `<div class="bk-start"><header class="bk-start-head"><span class="bk-hatch-ico" aria-hidden="true"></span><div><span class="eyebrow">☢ LE BUNKER</span><h2>🏆 Succès et records</h2></div><button type="button" class="icon-button" data-bk="close" aria-label="Fermer">×</button></header>
            <section class="bk-card bk-panel">${recordsBody()}</section><div class="bk-actions"><button type="button" class="button secondary" data-bk="recback">← Retour</button></div></div>`;
    }
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
        if (conv && G) { const t = e.target, set = (s0, v) => { if (t.checked) s0.add(v); else s0.delete(v); };
            if (t.dataset.bkCw != null) { set(conv.who, t.dataset.bkCw); drawSide(); return; } if (t.dataset.bkCv != null) { set(conv.veh, t.dataset.bkCv); drawSide(); return; }
            if (t.dataset.bkCb != null) { set(conv.beasts, t.dataset.bkCb); drawSide(); return; } if (t.dataset.bkCt != null) { set(conv.tools, t.dataset.bkCt); drawSide(); return; }
            if (t.dataset.bkCgoal != null) { conv.goal = t.value; drawSide(); return; } if (t.dataset.bkCsafe != null) { conv.safe = t.value === '1'; drawSide(); return; }
            if (t.dataset.bkCp != null) { const n = Math.max(0, Math.min(999, Math.round(Number(t.value) || 0))); if (n) conv.pack[t.dataset.bkCp] = n; else delete conv.pack[t.dataset.bkCp]; drawSide(); return; } }
        const f = e.target.closest('[data-bk-import]'); if (f) importFile(f);
    }
    const firstFree = () => { for (let fi = 0; fi < G.floors.length; fi++) for (let si = 0; si < B().SLOTS; si++) if (!G.floors[fi].slots[si] && !G.builds.some(b => b.fi === fi && b.si === si)) return [fi, si]; return null; };
    function order(k, fi, si, at) { const r = B().orderBuild(G, k, fi, si); if (!r.ok) { toast(r.err, 'error'); return; } drawAll(); if (at) whoMenu('construire', at); }
    const pointOf = el => { const r = el?.getBoundingClientRect?.(); return r && r.width ? {x: r.left + Math.min(24, r.width / 2), y: r.bottom} : null; };
    /** 👷 qui creuse, qui construit : un clic met la personne à ce travail (ou l'en retire) */
    const JOB_L = {libre: 'rien de spécial', creuser: 'creuse', construire: 'construit', recycler: 'démonte le bric-à-brac', garde: 'monte la garde', pedaler: 'pédale'};
    function whoMenu(job, where) {
        const ppl = B().alive(G).filter(p => p.where === 'base' && !p.baby), menu = UI().menuAt;
        if (!ppl.length || !menu) { tab = 'gens'; drawTop(); drawSide(); toast(ppl.length ? i18n(job === 'creuser' ? 'Choisis « ⛏️ Creuser » comme travail.' : 'Choisis « 🔨 Construire » comme travail.') : i18n('Personne au bunker pour ce travail.'), ppl.length ? '' : 'error'); return; }
        const at = where instanceof Element ? pointOf(where) : where;
        menu(at || where, [...ppl.map(p => ({icon: p.job === job ? '✅' : '⬜', label: p.name, help: p.job === job ? i18n('clic : le retirer de ce travail') : `${i18n('fait : {what}', {what: JOB_L[p.job] ? i18n(JOB_L[p.job]) : p.job})}${p.sulk ? ` · ${i18n('n’a plus le moral')}` : ''}`,
            run: () => { B().setJob(G, p.id, p.job === job ? 'libre' : job); drawAll(); whoMenu(job, at || where); }})), '-',
            {icon: '👥', label: i18n('Voir tous les habitants'), run: () => { tab = 'gens'; drawTop(); drawSide(); }}], {title: i18n(job === 'creuser' ? '⛏️ Qui creuse ?' : '🔨 Qui construit ?')});
    }
    /** ⛶ plein écran : le vrai plein écran du navigateur si possible, sinon la fenêtre prend tout l'écran */
    function toggleFull(force) {
        if (!dlg) return; const on = force ?? !dlg.classList.contains('is-max');
        dlg.classList.toggle('is-max', on);
        if (on && !document.fullscreenElement) dlg.requestFullscreen?.()?.catch?.(() => {});
        if (!on && document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => {});
        const fb = dlg.querySelector('[data-bk-full]'); if (fb) { fb.setAttribute('aria-pressed', String(on)); fb.title = i18n(on ? 'Quitter le plein écran' : 'Plein écran'); }
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
            if (k === 'radio' || k === 'crieur') { tab = 'radio'; drawTop(); drawSide(); return; }
            if (k === 'cheminee') { tab = 'res'; drawTop(); drawSide(); return; }
            if (k === 'atelier') { tab = 'atelier'; drawTop(); drawSide(); return; }
            if (k === 'generateur' && !G.broken?.[`${fi},${si}`]) { tab = 'res'; drawTop(); drawSide(); return; }
            const key = `${fi},${si}`, L = G.lvl?.[key] || 1, brk = !!G.broken?.[key], busyB = bi >= 0, txt = c => Object.entries(c).map(([r, q]) => `${q} ${resName(r)[2].toLowerCase()}`).join(', ');
            const run = f => () => { const r = f(G, fi, si); if (!r.ok) toast(r.err, 'error'); drawAll(); };
            items = [{icon: it.ico, label: `${it.name}${L > 1 ? ` · ${i18n('niveau {n}', {n: L})}` : ''}${brk ? ` · ${i18n('EN PANNE')}` : ''}`, help: it.desc, disabled: true}, '-',
                ...(brk ? [{icon: '🔧', label: busyB ? i18n('Réparation commandée') : i18n('Réparer'), help: txt(B().repairCost(k)), disabled: busyB, run: run(B().orderRepair)}] : []),
                ...(B().upgradable(k) && L < 3 && !brk ? [{icon: '⬆️', label: busyB ? i18n('Amélioration commandée') : i18n('Améliorer (niveau {n})', {n: L + 1}), help: i18n('effets ×{k} · {cost}', {k: L === 1 ? '1,5' : '2', cost: txt(B().upgradeCost(k, L + 1))}), disabled: busyB, run: run(B().orderUpgrade)}] : []),
                ...(busyB ? [{icon: '×', label: i18n('Annuler la commande'), help: i18n('les matériaux reviennent'), run: () => { B().cancelBuild(G, bi); drawAll(); }}] : []),
                ...(busyB ? [{icon: '👷', label: i18n('Qui construit ?'), run: () => whoMenu('construire', pt || btn)}] : []),
                {icon: '↔', label: i18n('Déplacer'), help: i18n('sans frais : clique ensuite sur une autre place (ou glisse-le)'), run: () => { moveFrom = [fi, si]; drawWorld(); }},
                {icon: '🪓', label: i18n('Démonter'), help: brk ? i18n('en panne : on récupère un tiers des matériaux') : i18n('on récupère la moitié des matériaux'), run: () => { B().dismantle(G, fi, si); drawAll(); }}];
        } else if (bi >= 0) items = [{icon: '👷', label: i18n('Qui construit ?'), run: () => whoMenu('construire', pt || btn)}, {icon: '↔', label: i18n('Déplacer le chantier'), help: i18n('sans frais : clique ensuite sur une autre place'), run: () => { moveFrom = [fi, si]; drawWorld(); }}, {icon: '×', label: i18n('Annuler « {name} »', {name: IT[G.builds[bi].k].name}), help: i18n('les matériaux reviennent'), run: () => { B().cancelBuild(G, bi); drawAll(); }}];
        else items = G.plans.filter(p => G.opt?.chaines || !IT[p].chain).map(p => { const it = IT[p], miss = Object.entries(it.cost || {}).some(([r, n]) => (G.res[r] || 0) < n) || (it.tool && !G.tools.includes(it.tool));
            const n = needOf(p); return {icon: it.ico, label: it.name, help: miss ? i18n('il manque : {list}', {list: [...n.miss.map(([r, q, h]) => `${q - h} ${lc(resName(r)[2])}`), ...(n.tool ? [B().TOOLS[n.tool][1]] : [])].join(', ')}) : Object.entries(it.cost || {}).map(([r, q]) => `${q} ${lc(resName(r)[2])}`).join(', ') + (it.tool ? ` · ${B().TOOLS[it.tool][1]}` : ''), disabled: miss, run: () => order(p, fi, si, pt)}; }).sort((x, y) => x.disabled - y.disabled);
        if (menu) menu(btn, items, {title: k ? '' : i18n('Construire ici')}); else if (!k && bi < 0) order(G.plans[0], fi, si, pt);
    }
    function importFile(input) {
        const file = input.files?.[0]; input.value = ''; if (!file) return;
        if (file.size > 6e6) { toast(i18n('Ce fichier est trop gros pour être une partie du bunker.'), 'error'); return; } // avec ses 7 matins gardés (1,5 Mo au plus)
        file.text().then(txt => {
            let raw; try { raw = JSON.parse(txt); } catch (_) { throw new Error(i18n('Ce fichier n’est pas une partie du bunker.')); }
            G = B().check(raw?.lcnda === 'bunker' ? raw.g : raw); gid = 'b' + Date.now().toString(36); tab = 'gens'; play(); saveGame(gid, G, true); toast(i18n('✓ Partie ouverte.')); // rangée seulement si elle s'ouvre bien
        }).catch(err => toast(err.message || i18n('Fichier illisible.'), 'error'));
    }
    document.addEventListener('keydown', e => { if (dlg?.open && G && (e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveGame(gid, G); } });
})();
