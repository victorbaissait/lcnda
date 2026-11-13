/**
 * ✨ Trésors — jeux et histoires (lot 4) :
 *  - 🗝️ La chasse au trésor (Jouer) : l'organisateur donne ses cachettes ; chaque carte cache une énigme sur un ancêtre, et chaque
 *    réponse possible mène à une cachette — seule la bonne réponse mène à la bonne. Cartes à imprimer et feuille de l'organisateur.
 *  - 🕵️ L'ancêtre mystère (Jouer) : un ancêtre tiré au sort (le même pour toute la famille le même jour), des indices un par un ; moins
 *    il en faut, plus on marque de points.
 *  - 📖 Le livre dont tu es le héros (Jouer) : vivre la vie d'un ancêtre et faire ses choix (métier, mariage, départ) ; à chaque fois,
 *    ce qui s'est vraiment passé.
 *  - 🎯 Les coïncidences (Découvrir) : même jour de naissance, mort le jour de son anniversaire, mariages le même jour, cent ans d'écart…
 *  - 🦋 « Et si… » (Découvrir) : et s'ils ne s'étaient pas rencontrés ? Toutes les vies qui n'auraient pas existé.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const F = ext.tresorFeatures = ext.tresorFeatures || [];
    const A = () => window.LCNDA_APP;
    const fem = p => p?.gender === 'female';
    const e = (s, p) => s.replace(/·e/g, fem(p) ? 'e' : '');
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js
    const gx = (p, m, f, v) => i18n(fem(p) ? f : m, v); // 🌐 une phrase par sexe

    /* ── 🗝️ La chasse au trésor ── */
    /** les étapes : pour chaque cachette, une énigme dont les réponses mènent aux cachettes (la bonne, et des fausses pistes) */
    function huntPlan(T, tr, spots, seed) {
        const qs = (ext.tresorQuiz?.quizQuestions(T, tr, spots.length + 4, seed) || []).filter(q => q.options.length >= 3).slice(0, spots.length);
        return qs.map((q, k) => ({k, q: q.q, options: q.options.map((o, j) => ({o, to: j === q.answer ? spots[k] : null})), why: q.why, hidden: k ? spots[k - 1] : null, next: spots[k]}));
    }
    async function renderHunt(host, T) {
        const tr = await T.tree();
        const draw = async () => {
            const hunts = await T.items('hunt');
            host.innerHTML = `<form class="h-tr-panel" data-hu-form><div class="form-grid"><label class="span-2">${i18n('Le nom de la chasse')}<input name="title" value="${T.esc(i18n('La chasse au trésor de la famille {name}', {name: T.start(tr)?.last || ''}))}"></label>
                <label class="span-2">${i18n('Les cachettes, dans l’ordre (une par ligne ; la dernière est celle du trésor)')}<textarea name="spots" rows="6" placeholder="${T.esc(['sous le paillasson', 'dans la boîte aux lettres', 'derrière l’horloge', 'au fond du placard de l’entrée'].map(x => i18n(x)).join('\n'))}"></textarea></label>
                <label class="span-2">${i18n('Le trésor (ce qu’on trouve à la fin)')}<input name="treasure" placeholder="${T.esc(i18n('le gâteau d’anniversaire de Mamie'))}"></label></div>
                <p class="h-tr-row"><span class="h-tr-muted">${i18n('Chaque énigme porte sur un ancêtre ; chaque réponse renvoie à une cachette : il faut la bonne réponse pour trouver la suite.')}</span></p></form>
                ${hunts.length ? `<h3>${i18n('Les chasses préparées')}</h3><ul class="h-tr-list">${hunts.map(h => `<li class="h-tr-item"><span class="h-tr-ic">🗝️</span><div class="h-tr-grow"><b>${T.esc(h.title)}</b><br><small>${i18n('{n} cachettes', {n: String((h.data?.spots || []).length)})} · ${T.esc(h.data?.treasure || '')}</small></div><button type="button" class="button small secondary" data-hu-print="${h.id}" title="${T.esc(i18n('Les cartes des énigmes et la feuille de l’organisateur'))}">${i18n('🖨 Imprimer')}</button><button type="button" class="h-tr-link" data-hu-del="${h.id}">${i18n('Supprimer')}</button></li>`).join('')}</ul>` : ''}`;
            host.querySelector('[data-hu-form]').addEventListener('submit', async ev => { ev.preventDefault(); const f = ev.target, spots = f.elements.spots.value.split('\n').map(s => s.trim()).filter(Boolean);
                if (spots.length < 2) return T.fail(f.elements.spots, i18n('Donne au moins deux cachettes.'));
                const seed = Date.now() % 100000, plan = huntPlan(T, tr, spots, seed); if (plan.length < spots.length) return T.fail(f.elements.spots, plan.length > 1 ? i18n('L’arbre ne donne que {n} énigmes : enlève des cachettes.', {n: String(plan.length)}) : i18n('L’arbre ne donne que {n} énigme : enlève des cachettes.', {n: String(plan.length)}));
                const r = await T.save({kind: 'hunt', title: f.elements.title.value.trim() || i18n('Chasse au trésor'), data: {spots, treasure: f.elements.treasure.value.trim(), seed}}); T.toast(i18n('Chasse prête : imprime les cartes.'), 'success'); await draw(); printHunt(T, tr, {title: f.elements.title.value, data: {spots, treasure: f.elements.treasure.value.trim(), seed}}); void r; });
        };
        host.addEventListener('click', async ev => { const p = ev.target.closest('[data-hu-print]'); if (p) { const h = (await T.items('hunt')).find(x => x.id === Number(p.dataset.huPrint)); if (h) printHunt(T, tr, h); }
            const d = ev.target.closest('[data-hu-del]'); if (d && await A().confirmBox(i18n('La chasse sera effacée.'), {title: i18n('Supprimer ?'), okLabel: i18n('Supprimer'), danger: true})) { await T.remove(Number(d.dataset.huDel)); draw(); } });
        T.actions(host, {primary: {label: i18n('🗝️ Préparer la chasse'), attrs: 'data-hu-go', run: () => host.querySelector('[data-hu-form]')?.requestSubmit()}});
        await draw();
    }
    const DECOYS = ['sous le lit', 'dans le four', 'derrière le canapé', 'dans la baignoire', 'sous l’évier', 'dans le panier à linge', 'derrière la porte du garage', 'dans la boîte à chaussures', 'sous le coussin', 'dans le pot de fleurs', 'au fond du frigo', 'sous la table de la cuisine'];
    function printHunt(T, tr, h) {
        const spots = h.data.spots, plan = huntPlan(T, tr, spots, h.data.seed), R = T.rng(h.data.seed + 7), low = spots.map(x => x.toLowerCase());
        // les fausses pistes mènent à des cachettes inventées (rien n'y est caché) : on ne peut pas deviner la bonne sans connaître la réponse
        const fake = DECOYS.map(d => i18n(d)).filter(d => !low.some(x => x.includes(d.split(' ').at(-1)))), decoy = () => fake[Math.floor(R() * fake.length)] || i18n('sous le tapis');
        const card = st => `<section class="cd"><div class="no">${i18n('Carte {n}', {n: String(st.k + 1)})}${st.hidden ? ` <small>${i18n('(à cacher : {where})', {where: T.esc(st.hidden)})}</small>` : ` <small>${i18n('(à donner au départ)')}</small>`}</div><h2>🗝️ ${T.esc(st.q)}</h2>
            <ul>${st.options.map(o => `<li>${i18n('{answer} → cherchez {where}', {answer: `<b>${T.esc(o.o)}</b>`, where: `<u>${T.esc(o.to || decoy())}</u>`})}</li>`).join('')}</ul>${st.k === spots.length - 1 && h.data.treasure ? `<p class="last">${i18n('C’est la dernière : le trésor vous attend !')}</p>` : ''}</section>`;
        ext.tresorPrint(T.esc(h.title), `.cards{display:grid;grid-template-columns:1fr 1fr;gap:6mm;padding:8mm;max-width:200mm;margin:auto}.cd{background:#fffaf0;border:2px dashed #b9852f;border-radius:4mm;padding:6mm;font-family:Georgia,serif;break-inside:avoid;min-height:120mm}.cd h2{font-size:14pt}.cd li{margin:2mm 0}.no{font:11px system-ui;color:#8a6b3a}.last{font-weight:bold;color:#a0522d}.org{max-width:190mm;margin:8mm auto;background:#fff;padding:8mm;font-family:system-ui}`,
            `<div class="org"><h1>${T.esc(h.title)}</h1><p>${i18n('<b>Pour l’organisateur.</b> Donnez la carte 1 aux joueurs. Cachez chaque carte suivante à l’endroit indiqué en haut de la carte. Le trésor ({treasure}) va à : {where}.', {treasure: T.esc(h.data.treasure || i18n('à vous de choisir')), where: `<b>${T.esc(spots.at(-1))}</b>`})}</p><ol>${plan.map(st => `<li>${i18n('{q} — bonne réponse : {answer} → {next}', {q: T.esc(st.q), answer: `<b>${T.esc(st.options.find(o => o.to).o)}</b>`, next: T.esc(st.next)})}</li>`).join('')}</ol></div><div class="cards">${plan.map(card).join('')}</div>`);
    }
    F.push({key: 'chasse', group: 'jouer', icon: '🗝️', title: 'La chasse au trésor', desc: 'Des énigmes sur les ancêtres cachées dans la maison : seule la bonne réponse mène à la cachette suivante.', render: renderHunt});
    ext.tresorHunt = {huntPlan};

    /* ── 🕵️ L'ancêtre mystère ── */
    const today = () => new Date().toISOString().slice(0, 10);
    /** les indices, du plus vague au plus précis */
    function clues(T, tr, p) {
        const out = [], kids = [...new Set(tr.kids.get(p.id) || [])].map(k => tr.byId.get(k)).filter(Boolean);
        const c = p.by ? (p.by < 1801 ? 0 : p.by < 1901 ? 1 : 2) : -1;
        out.push(c < 0 ? gx(p, 'C’est un homme.', 'C’est une femme.') : gx(p, ['C’est un homme, né au XVIIIe siècle ou avant.', 'C’est un homme, né au XIXe siècle.', 'C’est un homme, né au XXe siècle.'][c], ['C’est une femme, née au XVIIIe siècle ou avant.', 'C’est une femme, née au XIXe siècle.', 'C’est une femme, née au XXe siècle.'][c]));
        if (p.bplace) out.push(gx(p, 'Il est né à {place}.', 'Elle est née à {place}.', {place: T.place(tr, p.bplace)}));
        if (p.occ) out.push(i18n('Son métier : {occ}.', {occ: p.occ}));
        if (p.by && p.dy) out.push(gx(p, 'Il a vécu {n} ans.', 'Elle a vécu {n} ans.', {n: String(p.dy - p.by)}));
        out.push(kids.length ? (kids.length > 1 ? gx(p, 'Il a eu {n} enfants.', 'Elle a eu {n} enfants.', {n: String(kids.length)}) : gx(p, 'Il a eu {n} enfant.', 'Elle a eu {n} enfant.', {n: String(kids.length)})) : i18n('On ne lui connaît pas d’enfant.'));
        if (p.by) out.push(gx(p, 'Né dans les années {y}.', 'Née dans les années {y}.', {y: String(Math.floor(p.by / 10) * 10)}));
        const sp = (tr.fams.get(p.id) || []).map(f => tr.byId.get(f.a === p.id ? f.b : f.a)).filter(Boolean)[0]; if (sp) out.push(gx(p, 'Sa femme s’appelait {name}.', 'Son mari s’appelait {name}.', {name: sp.first || '?'}));
        if (kids[0]) out.push(i18n('Un de ses enfants s’appelait {name}.', {name: kids[0].first}));
        if (p.last) out.push(i18n('Son nom commence par {l}… et compte {n} lettres.', {l: p.last[0], n: String(p.last.length)}));
        return out;
    }
    const pool = (T, tr) => tr.people.filter(p => !p.living && !p.mem && p.first && (p.by || p.bplace || p.occ));
    function mysteryOf(T, tr, day) { const ps = pool(T, tr); if (!ps.length) return null; const r = T.rng(Number(day.replace(/-/g, '')) % 2147483646)(); return ps[Math.floor(r * ps.length)]; }
    async function renderMystery(host, T) {
        const tr = await T.tree(); let p = mysteryOf(T, tr, today()), shown = 1, over = false, tries = 0, mode = 'jour';
        if (!p) { host.innerHTML = T.empty(i18n('Il faut quelques ancêtres avec une date, un lieu ou un métier')); return; }
        const stats = () => { try { return JSON.parse(localStorage.getItem('lcnda-tr-mystery') || '{}'); } catch (_) { return {}; } };
        const draw = () => { const cl = clues(T, tr, p), st = stats();
            host.innerHTML = `<div class="h-tr-panel"><div class="h-tr-row" style="justify-content:space-between"><b>${mode === 'jour' ? i18n('🕵️ L’ancêtre mystère du {date}', {date: T.esc(T.dateFr(today()))}) : i18n('🕵️ Un ancêtre mystère au hasard')}</b><span class="h-tr-muted">${st.games ? `${st.games > 1 ? i18n('{n} parties', {n: String(st.games)}) : i18n('{n} partie', {n: String(st.games)})} · ${i18n('{n} points', {n: String(st.points)})}` : ''}</span></div>
                <ol class="h-tr-clues">${cl.slice(0, shown).map(c => `<li>${T.esc(c)}</li>`).join('')}</ol>
                ${over ? `<div class="h-tr-big">${over === 'win' ? i18n('🎉 Bravo !') : i18n('😶 C’était…')} ${T.esc(T.name(p))}</div><p>${T.esc(T.story(tr, p).join(' '))}</p><p class="h-tr-row"><button type="button" class="button" data-my-new>${i18n('🎲 Un autre, au hasard')}</button><button type="button" class="button secondary" data-my-open>${i18n('Voir sa fiche')}</button></p>`
                : `<div class="h-tr-row"><div style="min-width:260px"><span class="pk-lab">${i18n('C’est…')}</span>${T.personField('guess', null)}</div><button type="button" class="button" data-my-try>${i18n('Proposer')}</button>${shown < cl.length ? `<button type="button" class="button secondary" data-my-more>${i18n('Un indice de plus ({n})', {n: String(cl.length - shown)})}</button>` : ''}<button type="button" class="h-tr-link" data-my-give>${i18n('Je donne ma langue au chat')}</button></div><p class="h-tr-muted">${10 - shown + 1 > 0 ? i18n('Trouvé maintenant : {n} points.', {n: String(Math.max(1, 11 - shown))}) : ''}${tries ? ` · ${tries > 1 ? i18n('{n} essais ratés', {n: String(tries)}) : i18n('{n} essai raté', {n: String(tries)})}` : ''}</p>`}</div>`; };
        const end = win => { over = win ? 'win' : 'lose'; const st = stats(); st.games = (st.games || 0) + 1; st.points = (st.points || 0) + (win ? Math.max(1, 11 - shown) : 0); try { localStorage.setItem('lcnda-tr-mystery', JSON.stringify(st)); } catch (_) {} draw(); };
        host.addEventListener('click', ev => {
            if (ev.target.closest('[data-my-more]')) { shown++; draw(); }
            else if (ev.target.closest('[data-my-try]')) { const g = Number(host.querySelector('[name=guess]').value); if (!g) return T.fail(host.querySelector('[name=guess]'), i18n('Choisis quelqu’un.')); if (g === p.id) end(true); else { tries++; shown = Math.min(clues(T, tr, p).length, shown + 1); T.toast(i18n('Non, ce n’est pas ça… un indice de plus.')); draw(); } }
            else if (ev.target.closest('[data-my-give]')) end(false);
            else if (ev.target.closest('[data-my-new]')) { const ps = pool(T, tr); p = ps[Math.floor(Math.random() * ps.length)]; shown = 1; over = false; tries = 0; mode = 'hasard'; draw(); }
            else if (ev.target.closest('[data-my-open]')) T.openPerson(p.id);
        });
        draw(); ext.tresorMystery.current = () => p.id;
    }
    F.push({key: 'mystere', group: 'jouer', icon: '🕵️', title: 'L’ancêtre mystère', desc: 'Un ancêtre caché, des indices un par un : le même pour toute la famille chaque jour. Qui le trouve le plus vite ?', render: renderMystery});
    ext.tresorMystery = {clues, mysteryOf};

    /* ── 📖 Le livre dont tu es le héros ── */
    /** les chapitres d'une vie : [{title, text, choices: [{label, real}], real (ce qui s'est passé)}] */
    function chapters(T, tr, p) {
        const R = T.rng(p.id * 97 + 3), shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
        const out = [], father = tr.byId.get(p.father), mother = tr.byId.get(p.mother), bp = T.place(tr, p.bplace), at = x => (x ? ' ' + T.at(x) : '');
        const par = [father, mother].filter(Boolean).map(x => T.name(x)), parS = par.length === 2 ? i18n('{a} et de {b}', {a: par[0], b: par[1]}) : par[0] || '';
        out.push({title: i18n('Ta naissance'), text: `${i18n('Tu es {name}.', {name: p.first || T.name(p)})} ${gx(p, 'Tu nais {when}{where}{parents}.', 'Tu nais {when}{where}{parents}.', {when: T.on(p.bd, p.by), where: at(bp), parents: par.length ? ', ' + gx(p, 'fils de {names}', 'fille de {names}', {names: parS}) : ''})}${father?.occ ? ' ' + i18n('Ton père est {occ}.', {occ: father.occ}) : ''}`});
        const jobs = [...new Set(tr.people.map(x => x.occ).filter(Boolean))];
        if (p.occ) { const opts = shuffle([p.occ, ...shuffle(jobs.filter(j => j !== p.occ)).slice(0, 2)]); out.push({title: i18n('Le métier'), text: p.by ? i18n('Tu as quinze ans, c’est l’année {y}. Il faut gagner ta vie. Que vas-tu faire ?', {y: String(p.by + 15)}) : i18n('Tu as quinze ans. Il faut gagner ta vie. Que vas-tu faire ?'), choices: opts.map(o => ({label: i18n('Devenir {occ}', {occ: o}), real: o === p.occ})), real: gx(p, 'Dans la vraie vie, {name} est devenu {occ}.', 'Dans la vraie vie, {name} est devenue {occ}.', {name: p.first, occ: p.occ})}); }
        (tr.fams.get(p.id) || []).forEach(f => { const o = tr.byId.get(f.a === p.id ? f.b : f.a); if (!o) return; const age = f.my ? T.ageAt(p, f.md, f.my) : null;
            const decoys = shuffle(tr.people.filter(x => x.gender === o.gender && x.id !== o.id && x.id !== p.id && x.first && (!p.by || !x.by || Math.abs(x.by - p.by) < 25))).slice(0, 1);
            out.push({title: i18n('L’amour'), text: `${age != null ? i18n('Tu as {n} ans.', {n: String(age)}) + ' ' : ''}${f.mplace ? i18n('À {place}, deux personnes ont attiré ton regard…', {place: T.place(tr, f.mplace)}) : i18n('deux personnes ont attiré ton regard…')}`, choices: shuffle([{label: i18n('Épouser {name}', {name: T.name(o)}), real: true}, ...decoys.map(d => ({label: i18n('Épouser {name}', {name: T.name(d)}), real: false})), {label: i18n('Rester libre encore un peu'), real: false}]), real: i18n('Dans la vraie vie, {first} a épousé {name}{when}{where}.', {first: p.first, name: T.name(o), when: f.my ? ' ' + T.on(f.md, f.my) : '', where: f.mplace ? at(T.place(tr, f.mplace)) : ''})}); });
        const places = [...new Set([...(tr.evBy.get('p' + p.id) || []).map(x => x.place), p.dplace].filter(x => x && x !== p.bplace))];
        if (places.length) { const go = T.place(tr, places[0]), all = [...new Set(tr.people.map(x => T.place(tr, x.bplace)).filter(Boolean))];
            out.push({title: i18n('Partir ?'), text: i18n('La vie est dure{where}. On parle de partir…', {where: at(bp)}), choices: shuffle([{label: i18n('Partir pour {place}', {place: go}), real: true}, ...shuffle(all.filter(x => x !== go && x !== bp)).slice(0, 1).map(x => ({label: i18n('Partir pour {place}', {place: x}), real: false})), {label: i18n('Rester au pays'), real: false}]), real: i18n('Dans la vraie vie, {name} a fini sa route à {place}.', {name: p.first, place: go})}); }
        else if (bp) out.push({title: i18n('Partir ?'), text: i18n('On parle de partir pour la ville…'), choices: [{label: i18n('Partir'), real: false}, {label: i18n('Rester à {place}', {place: bp}), real: true}], real: gx(p, 'Dans la vraie vie, {name} est resté à {place}.', 'Dans la vraie vie, {name} est restée à {place}.', {name: p.first, place: bp})});
        const kids = [...new Set(tr.kids.get(p.id) || [])].map(k => tr.byId.get(k)).filter(Boolean), kl = kids.map(k => k.first).join(', ');
        if (kids.length) out.push({title: i18n('Les enfants'), text: kids.length === 1 ? i18n('Un enfant arrive : {list}. Tu les regardes grandir.', {list: kl}) : i18n('{n} enfants arrivent : {list}. Tu les regardes grandir.', {n: String(kids.length), list: kl})});
        out.push({title: i18n('La fin du voyage'), text: p.dy ? i18n('Tu t’éteins {when}{where}{age}.', {when: T.on(p.dd, p.dy), where: p.dplace ? at(T.place(tr, p.dplace)) : '', age: p.by ? i18n(', à {n} ans', {n: String(T.ageAt(p, p.dd, p.dy))}) : ''}) : i18n('Ton histoire continue…')});
        return out;
    }
    async function renderHero(host, T) {
        const tr = await T.tree(), cand = tr.people.filter(p => !p.living && !p.mem && p.by && (p.occ || (tr.fams.get(p.id) || []).length)), first = cand.find(p => p.occ && (tr.fams.get(p.id) || []).length) || cand[0];
        if (!first) { host.innerHTML = T.empty(i18n('Il faut un ancêtre avec une date de naissance et un métier ou un mariage')); return; }
        host.innerHTML = `<div class="h-tr-row h-tr-noprint"><div style="min-width:260px"><span class="pk-lab">${i18n('Tu seras')}</span>${T.personField('hero', first.id)}</div></div><div data-he-out></div>`;
        const out = host.querySelector('[data-he-out]');
        let ch = [], i = 0, same = 0, asked = 0, p = null, log = [];
        const draw = () => { const c = ch[i];
            if (!c) { out.innerHTML = `<article class="h-tr-book"><h2>${i18n('Fin')}</h2><p class="h-tr-big">${i18n('Tu as fait {n} choix sur {total} comme {name}.', {n: String(same), total: String(asked), name: T.esc(p.first)})}</p><p>${same === asked ? i18n('Une vie vécue à l’identique : tu connais bien ton ancêtre !') : same ? i18n('Une autre vie aurait été possible… mais c’est celle-là qui a mené jusqu’à toi.') : i18n('Avec tes choix, l’histoire de la famille aurait été tout autre.')}</p><ul>${log.map(l => `<li>${T.esc(l)}</li>`).join('')}</ul><button type="button" class="button" data-he-go>${i18n('📖 Recommencer')}</button></article>`; return; }
            out.innerHTML = `<article class="h-tr-book"><small class="h-tr-muted">${i18n('Chapitre {n} sur {total}', {n: String(i + 1), total: String(ch.length)})}</small><h2>${T.esc(c.title)}</h2><p>${T.esc(c.text)}</p>${c.choices ? `<div class="h-tr-he-ch">${c.choices.map((o, k) => `<button type="button" class="button secondary" data-he-c="${k}">${T.esc(o.label)}</button>`).join('')}</div>` : `<button type="button" class="button" data-he-next>${i18n('Tourner la page →')}</button>`}<div data-he-res></div></article>`; };
        out.addEventListener('click', ev => {
            const b = ev.target.closest('[data-he-c]'); if (b) { const c = ch[i], o = c.choices[Number(b.dataset.heC)]; asked++; if (o.real) same++; log.push(`${c.title} : ${o.real ? '✔' : '✘'} ${o.label}`);
                out.querySelectorAll('[data-he-c]').forEach(x => { x.disabled = true; if (c.choices[Number(x.dataset.heC)].real) x.classList.add('is-real'); });
                out.querySelector('[data-he-res]').innerHTML = `<p class="h-tr-he-res ${o.real ? 'ok' : ''}">${o.real ? i18n('✨ Le même choix que ton ancêtre !') : i18n('🌀 Une autre vie commence… mais revenons à la vraie.')} ${T.esc(c.real || '')}</p><button type="button" class="button" data-he-next>${i18n('Tourner la page →')}</button>`; return; }
            if (ev.target.closest('[data-he-next]')) { i++; draw(); }
        });
        const start = () => { p = tr.byId.get(Number(host.querySelector('[name=hero]').value)) || first; ch = chapters(T, tr, p); i = 0; same = 0; asked = 0; log = []; draw(); };
        host.addEventListener('click', ev => { if (ev.target.closest('[data-he-go]')) start(); });
        T.actions(host, {primary: {label: i18n('📖 Commencer l’histoire'), attrs: 'data-he-go', run: start}});
    }
    F.push({key: 'heros', group: 'jouer', icon: '📖', title: 'Le livre dont tu es le héros', desc: 'Vis la vie d’un ancêtre et fais ses choix — métier, mariage, départ — puis découvre ce qu’il a vraiment choisi.', render: renderHero});
    ext.tresorHero = {chapters};

    /* ── 🎯 Les coïncidences ── */
    function coincidences(T, tr) {
        const out = [], md = d => d?.slice(5), ppl = tr.people, name = p => T.name(p);
        // même jour de naissance
        const byMd = new Map(); ppl.filter(p => p.bd).forEach(p => { const k = md(p.bd); if (!byMd.has(k)) byMd.set(k, []); byMd.get(k).push(p); });
        [...byMd].filter(([, l]) => l.length > 1).sort((a, b) => b[1].length - a[1].length).forEach(([k, l]) => { const [m, d] = k.split('-').map(Number); out.push({ic: '🎂', score: l.length * 2, text: i18n('{n} personnes nées un {date} : {list}.', {n: String(l.length), date: T.dayMonth(m, d), list: l.map(p => `${name(p)} (${p.by})`).join(', ')})}); });
        // mort le jour de son anniversaire
        ppl.filter(p => p.bd && p.dd && md(p.bd) === md(p.dd)).forEach(p => out.push({ic: '🕯️', score: 5, text: gx(p, '{name} est mort le jour de son anniversaire, à {n} ans ({date}).', '{name} est morte le jour de son anniversaire, à {n} ans ({date}).', {name: name(p), n: String(p.dy - p.by), date: T.dateFr(p.dd)})}));
        // né le jour de la mort d'un parent ou grand-parent
        ppl.filter(p => p.bd).forEach(p => T.ancestors(tr, p.id, 3).forEach(({id, gen}) => { const a = tr.byId.get(id); if (a?.dd && a.dd < p.bd && md(a.dd) === md(p.bd)) out.push({ic: '🔁', score: 4, text: gx(p, '{name} est né un {date}, jour anniversaire de la mort de {kin} {who} ({y}).', '{name} est née un {date}, jour anniversaire de la mort de {kin} {who} ({y}).', {name: name(p), date: T.dayMonth(Number(p.bd.slice(5, 7)), Number(p.bd.slice(8, 10))), kin: ext.tresorKin ? ext.tresorKin.kinWord(gen, a.gender, false) : i18n('son ancêtre'), who: name(a), y: String(a.dy)})}); }));
        // des mariages le même jour de l'année
        const wed = new Map(); tr.families.filter(f => f.md).forEach(f => { const k = md(f.md); if (!wed.has(k)) wed.set(k, []); wed.get(k).push(f); });
        [...wed].filter(([, l]) => l.length > 1).forEach(([, l]) => out.push({ic: '💍', score: 3, text: i18n('{n} mariages le même jour de l’année : {list}.', {n: String(l.length), list: l.map(f => `${T.and([f.a, f.b].map(x => tr.byId.get(x)?.first).filter(Boolean))} (${f.my})`).join(', ')})}));
        // exactement cent ans d'écart, même jour
        ppl.filter(p => p.bd).forEach(p => ppl.filter(q => q.bd && q.id > p.id && md(q.bd) === md(p.bd) && Math.abs(q.by - p.by) % 100 === 0).forEach(q => out.push({ic: '💯', score: 4, text: i18n('{a} et {b} sont nés à {n} ans pile d’écart, jour pour jour ({y1} et {y2}).', {a: name(p), b: name(q), n: String(Math.abs(q.by - p.by)), y1: String(p.by), y2: String(q.by)})})));
        // un vendredi 13, Noël, le jour de l'An
        ppl.filter(p => p.bd).forEach(p => { const dt = new Date(p.bd + 'T12:00:00Z'), k = md(p.bd); if (k === '12-25') out.push({ic: '🎄', score: 3, text: gx(p, '{name} est né le jour de Noël {y}.', '{name} est née le jour de Noël {y}.', {name: name(p), y: String(p.by)})}); if (k === '01-01') out.push({ic: '🎆', score: 3, text: gx(p, '{name} est né le jour de l’An {y}.', '{name} est née le jour de l’An {y}.', {name: name(p), y: String(p.by)})}); if (dt.getUTCDate() === 13 && dt.getUTCDay() === 5) out.push({ic: '🍀', score: 3, text: gx(p, '{name} est né un vendredi 13 ({date}).', '{name} est née un vendredi 13 ({date}).', {name: name(p), date: T.dateFr(p.bd)})}); });
        // le même âge au mariage, de père en fils
        tr.families.filter(f => f.my).forEach(f => [f.a, f.b].map(x => tr.byId.get(x)).filter(Boolean).forEach(p => { const a = T.ageAt(p, f.md, f.my), par = tr.byId.get(p.father); (tr.fams.get(par?.id) || []).forEach(g => { if (g.my && a != null && T.ageAt(par, g.md, g.my) === a) out.push({ic: '👞', score: 3, text: gx(p, '{name} s’est marié à {n} ans, au même âge que son père {father}.', '{name} s’est mariée à {n} ans, au même âge que son père {father}.', {name: name(p), n: String(a), father: name(par)})}); }); }));
        return out.sort((a, b) => b.score - a.score);
    }
    async function renderCoinc(host, T) {
        const tr = await T.tree(), list = coincidences(T, tr);
        host.innerHTML = list.length ? `<p class="h-tr-big">${i18n('{n} dans l’arbre', {n: T.pl(list.length, 'coïncidence')})}</p><ul class="h-tr-list">${list.map(c => `<li class="h-tr-item h-tr-print"><span class="h-tr-ic">${c.ic}</span><div class="h-tr-grow">${T.esc(c.text)}</div></li>`).join('')}</ul><p class="h-tr-muted">${i18n('Plus l’arbre a de dates précises (jour et mois), plus il y en a.')}</p>` : T.empty(i18n('Aucune coïncidence trouvée'), {hint: i18n('Il faut des dates précises (jour et mois).')});
    }
    F.push({key: 'coincidences', group: 'decouvrir', icon: '🎯', title: 'Les coïncidences', desc: 'Nés le même jour, mort le jour de son anniversaire, mariés à cent ans d’écart jour pour jour : les hasards de l’arbre.', render: renderCoinc});
    ext.tresorCoinc = {coincidences};

    /* ── 🦋 « Et si… » ── */
    function whatIf(T, tr, ids) {
        // les descendants communs : ceux qui descendent de tous les choisis (un couple : ses enfants communs et leur descendance)
        const sets = ids.map(id => new Set(T.descendants(tr, [id]).map(d => d.id))), common = [...sets[0]].filter(x => sets.every(s => s.has(x)));
        return common.map(id => tr.byId.get(id)).filter(Boolean).sort((a, b) => (a.by || 9999) - (b.by || 9999));
    }
    async function renderWhatIf(host, T) {
        const tr = await T.tree(), st = T.start(tr), couples = tr.families.filter(f => f.a && f.b && f.children.length);
        const pick = couples.find(f => whatIf(T, tr, [f.a, f.b]).some(p => p.id === st?.id) && !T.ancestors(tr, st.id, 30).some(a => a.id === f.a && a.gen < 3)) || couples[0];
        host.innerHTML = `<div class="h-tr-panel h-tr-row"><label>${i18n('Et si…')}<select data-wi-k><option value="couple">${i18n('ces deux-là ne s’étaient jamais rencontrés')}</option><option value="one">${i18n('cette personne n’avait pas vécu')}</option></select></label>
            <label data-wi-c>${i18n('Le couple')}<select data-wi-f>${couples.map(f => `<option value="${f.id}" ${f === pick ? 'selected' : ''}>${T.esc([f.a, f.b].map(x => T.name(tr.byId.get(x))).join(' & '))}${f.my ? ` (${f.my})` : ''}</option>`).join('')}</select></label>
            <div data-wi-p hidden style="min-width:240px"><span class="pk-lab">${i18n('La personne')}</span>${T.personField('one', st?.id)}</div></div><div data-wi-out></div>`;
        const out = host.querySelector('[data-wi-out]'), k = host.querySelector('[data-wi-k]');
        const draw = () => { const isC = k.value === 'couple'; host.querySelector('[data-wi-c]').hidden = !isC; host.querySelector('[data-wi-p]').hidden = isC;
            const f = tr.families.find(x => x.id === Number(host.querySelector('[data-wi-f]').value)), ids = isC ? (f ? [f.a, f.b] : []) : [Number(host.querySelector('[name=one]').value)].filter(Boolean);
            if (!ids.length) { out.innerHTML = ''; return; } const gone = whatIf(T, tr, ids), me = gone.find(p => p.id === st?.id), living = gone.filter(p => p.living).length, pct = Math.round(gone.length / Math.max(1, tr.people.length) * 100);
            out.innerHTML = gone.length ? `<div class="h-tr-panel h-tr-whatif"><p class="h-tr-big">${gone.length > 1 ? i18n('🦋 {n} vies n’auraient jamais existé', {n: String(gone.length)}) : i18n('🦋 {n} vie n’aurait jamais existé', {n: String(gone.length)})}</p><p>${living ? i18n('{pct} % de l’arbre, dont {who} en vie aujourd’hui.', {pct: String(pct), who: T.pl(living, 'personne')}) : i18n('{pct} % de l’arbre.', {pct: String(pct)})}${me ? ` <b>${i18n('Et {name} non plus.', {name: T.esc(T.name(me))})}</b>` : ''}</p>
                <div class="h-tr-fade">${gone.map((p, i) => `<span class="h-tr-pill" style="animation-delay:${Math.min(i * 0.15, 6)}s">${T.esc(T.name(p))}${p.by ? ` (${p.by})` : ''}</span>`).join(' ')}</div></div>` : T.empty(i18n('Personne ne descend de ce choix dans l’arbre'), {icon: '🦋'}); };
        host.addEventListener('change', draw); draw();
    }
    F.push({key: 'et-si', group: 'decouvrir', icon: '🦋', title: '« Et si… »', desc: 'Et si ces deux-là ne s’étaient pas rencontrés ? Toutes les vies qui n’auraient jamais existé — peut-être la tienne.', render: renderWhatIf});
    ext.tresorWhatIf = {whatIf};
})();
