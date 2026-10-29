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
            host.innerHTML = `<form class="h-tr-panel" data-hu-form><div class="form-grid"><label class="span-2">Le nom de la chasse<input name="title" value="La chasse au trésor de la famille ${T.esc(T.start(tr)?.last || '')}"></label>
                <label class="span-2">Les cachettes, dans l’ordre (une par ligne ; la dernière est celle du trésor)<textarea name="spots" rows="6" placeholder="sous le paillasson\ndans la boîte aux lettres\nderrière l’horloge\nau fond du placard de l’entrée"></textarea></label>
                <label class="span-2">Le trésor (ce qu’on trouve à la fin)<input name="treasure" placeholder="le gâteau d’anniversaire de Mamie"></label></div>
                <p class="h-tr-row"><span class="h-tr-muted">Chaque énigme porte sur un ancêtre ; chaque réponse renvoie à une cachette : il faut la bonne réponse pour trouver la suite.</span></p></form>
                ${hunts.length ? `<h3>Les chasses préparées</h3><ul class="h-tr-list">${hunts.map(h => `<li class="h-tr-item"><span class="h-tr-ic">🗝️</span><div class="h-tr-grow"><b>${T.esc(h.title)}</b><br><small>${(h.data?.spots || []).length} cachettes · ${T.esc(h.data?.treasure || '')}</small></div><button type="button" class="button small secondary" data-hu-print="${h.id}" title="Les cartes des énigmes et la feuille de l’organisateur">🖨 Imprimer</button><button type="button" class="h-tr-link" data-hu-del="${h.id}">Supprimer</button></li>`).join('')}</ul>` : ''}`;
            host.querySelector('[data-hu-form]').addEventListener('submit', async ev => { ev.preventDefault(); const f = ev.target, spots = f.elements.spots.value.split('\n').map(s => s.trim()).filter(Boolean);
                if (spots.length < 2) return T.fail(f.elements.spots, 'Donne au moins deux cachettes.');
                const seed = Date.now() % 100000, plan = huntPlan(T, tr, spots, seed); if (plan.length < spots.length) return T.fail(f.elements.spots, `L’arbre ne donne que ${plan.length} énigme${plan.length > 1 ? 's' : ''} : enlève des cachettes.`);
                const r = await T.save({kind: 'hunt', title: f.elements.title.value.trim() || 'Chasse au trésor', data: {spots, treasure: f.elements.treasure.value.trim(), seed}}); T.toast('Chasse prête : imprime les cartes.', 'success'); await draw(); printHunt(T, tr, {title: f.elements.title.value, data: {spots, treasure: f.elements.treasure.value.trim(), seed}}); void r; });
        };
        host.addEventListener('click', async ev => { const p = ev.target.closest('[data-hu-print]'); if (p) { const h = (await T.items('hunt')).find(x => x.id === Number(p.dataset.huPrint)); if (h) printHunt(T, tr, h); }
            const d = ev.target.closest('[data-hu-del]'); if (d && await A().confirmBox('La chasse sera effacée.', {title: 'Supprimer ?', okLabel: 'Supprimer', danger: true})) { await T.remove(Number(d.dataset.huDel)); draw(); } });
        T.actions(host, {primary: {label: '🗝️ Préparer la chasse', attrs: 'data-hu-go', run: () => host.querySelector('[data-hu-form]')?.requestSubmit()}});
        await draw();
    }
    const DECOYS = ['sous le lit', 'dans le four', 'derrière le canapé', 'dans la baignoire', 'sous l’évier', 'dans le panier à linge', 'derrière la porte du garage', 'dans la boîte à chaussures', 'sous le coussin', 'dans le pot de fleurs', 'au fond du frigo', 'sous la table de la cuisine'];
    function printHunt(T, tr, h) {
        const spots = h.data.spots, plan = huntPlan(T, tr, spots, h.data.seed), R = T.rng(h.data.seed + 7), low = spots.map(x => x.toLowerCase());
        // les fausses pistes mènent à des cachettes inventées (rien n'y est caché) : on ne peut pas deviner la bonne sans connaître la réponse
        const fake = DECOYS.filter(d => !low.some(x => x.includes(d.split(' ').at(-1)))), decoy = () => fake[Math.floor(R() * fake.length)] || 'sous le tapis';
        const card = st => `<section class="cd"><div class="no">Carte ${st.k + 1}${st.hidden ? ` <small>(à cacher : ${T.esc(st.hidden)})</small>` : ' <small>(à donner au départ)</small>'}</div><h2>🗝️ ${T.esc(st.q)}</h2>
            <ul>${st.options.map(o => `<li><b>${T.esc(o.o)}</b> → cherchez <u>${T.esc(o.to || decoy())}</u></li>`).join('')}</ul>${st.k === spots.length - 1 && h.data.treasure ? '<p class="last">C’est la dernière : le trésor vous attend !</p>' : ''}</section>`;
        ext.tresorPrint(T.esc(h.title), `.cards{display:grid;grid-template-columns:1fr 1fr;gap:6mm;padding:8mm;max-width:200mm;margin:auto}.cd{background:#fffaf0;border:2px dashed #b9852f;border-radius:4mm;padding:6mm;font-family:Georgia,serif;break-inside:avoid;min-height:120mm}.cd h2{font-size:14pt}.cd li{margin:2mm 0}.no{font:11px system-ui;color:#8a6b3a}.last{font-weight:bold;color:#a0522d}.org{max-width:190mm;margin:8mm auto;background:#fff;padding:8mm;font-family:system-ui}`,
            `<div class="org"><h1>${T.esc(h.title)}</h1><p><b>Pour l’organisateur.</b> Donnez la carte 1 aux joueurs. Cachez chaque carte suivante à l’endroit indiqué en haut de la carte. Le trésor (${T.esc(h.data.treasure || 'à vous de choisir')}) va à : <b>${T.esc(spots.at(-1))}</b>.</p><ol>${plan.map(st => `<li>${T.esc(st.q)} — bonne réponse : <b>${T.esc(st.options.find(o => o.to).o)}</b> → ${T.esc(st.next)}</li>`).join('')}</ol></div><div class="cards">${plan.map(card).join('')}</div>`);
    }
    F.push({key: 'chasse', group: 'jouer', icon: '🗝️', title: 'La chasse au trésor', desc: 'Des énigmes sur les ancêtres cachées dans la maison : seule la bonne réponse mène à la cachette suivante.', render: renderHunt});
    ext.tresorHunt = {huntPlan};

    /* ── 🕵️ L'ancêtre mystère ── */
    const today = () => new Date().toISOString().slice(0, 10);
    /** les indices, du plus vague au plus précis */
    function clues(T, tr, p) {
        const out = [], cent = y => (y < 1801 ? 'au XVIIIe siècle ou avant' : y < 1901 ? 'au XIXe siècle' : 'au XXe siècle'), kids = [...new Set(tr.kids.get(p.id) || [])].map(k => tr.byId.get(k)).filter(Boolean);
        out.push(`C’est ${fem(p) ? 'une femme' : 'un homme'}${p.by ? `, né${fem(p) ? 'e' : ''} ${cent(p.by)}` : ''}.`);
        if (p.bplace) out.push(`${fem(p) ? 'Elle' : 'Il'} est né${fem(p) ? 'e' : ''} à ${T.place(tr, p.bplace)}.`);
        if (p.occ) out.push(`Son métier : ${p.occ}.`);
        if (p.by && p.dy) out.push(`${fem(p) ? 'Elle' : 'Il'} a vécu ${p.dy - p.by} ans.`);
        out.push(kids.length ? `${fem(p) ? 'Elle' : 'Il'} a eu ${kids.length} enfant${kids.length > 1 ? 's' : ''}.` : `On ne lui connaît pas d’enfant.`);
        if (p.by) out.push(`Né${fem(p) ? 'e' : ''} dans les années ${Math.floor(p.by / 10) * 10}.`);
        const sp = (tr.fams.get(p.id) || []).map(f => tr.byId.get(f.a === p.id ? f.b : f.a)).filter(Boolean)[0]; if (sp) out.push(`${fem(p) ? 'Son mari' : 'Sa femme'} s’appelait ${sp.first || '?'}.`);
        if (kids[0]) out.push(`Un de ses enfants s’appelait ${kids[0].first}.`);
        if (p.last) out.push(`Son nom commence par ${p.last[0]}… et compte ${p.last.length} lettres.`);
        return out;
    }
    const pool = (T, tr) => tr.people.filter(p => !p.living && p.first && (p.by || p.bplace || p.occ));
    function mysteryOf(T, tr, day) { const ps = pool(T, tr); if (!ps.length) return null; const r = T.rng(Number(day.replace(/-/g, '')) % 2147483646)(); return ps[Math.floor(r * ps.length)]; }
    async function renderMystery(host, T) {
        const tr = await T.tree(); let p = mysteryOf(T, tr, today()), shown = 1, over = false, tries = 0, mode = 'jour';
        if (!p) { host.innerHTML = T.empty('Il faut quelques ancêtres avec une date, un lieu ou un métier'); return; }
        const stats = () => { try { return JSON.parse(localStorage.getItem('lcnda-tr-mystery') || '{}'); } catch (_) { return {}; } };
        const draw = () => { const cl = clues(T, tr, p), st = stats();
            host.innerHTML = `<div class="h-tr-panel"><div class="h-tr-row" style="justify-content:space-between"><b>${mode === 'jour' ? `🕵️ L’ancêtre mystère du ${T.esc(T.dateFr(today()))}` : '🕵️ Un ancêtre mystère au hasard'}</b><span class="h-tr-muted">${st.games ? `${st.games} partie${st.games > 1 ? 's' : ''} · ${st.points} points` : ''}</span></div>
                <ol class="h-tr-clues">${cl.slice(0, shown).map(c => `<li>${T.esc(c)}</li>`).join('')}</ol>
                ${over ? `<div class="h-tr-big">${over === 'win' ? '🎉 Bravo !' : '😶 C’était…'} ${T.esc(T.name(p))}</div><p>${T.esc(T.story(tr, p).join(' '))}</p><p class="h-tr-row"><button type="button" class="button" data-my-new>🎲 Un autre, au hasard</button><button type="button" class="button secondary" data-my-open>Voir sa fiche</button></p>`
                : `<div class="h-tr-row"><div style="min-width:260px"><span class="pk-lab">C’est…</span>${T.personField('guess', null)}</div><button type="button" class="button" data-my-try>Proposer</button>${shown < cl.length ? `<button type="button" class="button secondary" data-my-more>Un indice de plus (${cl.length - shown})</button>` : ''}<button type="button" class="h-tr-link" data-my-give>Je donne ma langue au chat</button></div><p class="h-tr-muted">${10 - shown + 1 > 0 ? `Trouvé maintenant : ${Math.max(1, 11 - shown)} points.` : ''}${tries ? ` · ${tries} essai${tries > 1 ? 's' : ''} raté${tries > 1 ? 's' : ''}` : ''}</p>`}</div>`; };
        const end = win => { over = win ? 'win' : 'lose'; const st = stats(); st.games = (st.games || 0) + 1; st.points = (st.points || 0) + (win ? Math.max(1, 11 - shown) : 0); try { localStorage.setItem('lcnda-tr-mystery', JSON.stringify(st)); } catch (_) {} draw(); };
        host.addEventListener('click', ev => {
            if (ev.target.closest('[data-my-more]')) { shown++; draw(); }
            else if (ev.target.closest('[data-my-try]')) { const g = Number(host.querySelector('[name=guess]').value); if (!g) return T.fail(host.querySelector('[name=guess]'), 'Choisis quelqu’un.'); if (g === p.id) end(true); else { tries++; shown = Math.min(clues(T, tr, p).length, shown + 1); T.toast('Non, ce n’est pas ça… un indice de plus.'); draw(); } }
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
        const tu = fem(p) ? 'e' : '', out = [], father = tr.byId.get(p.father), mother = tr.byId.get(p.mother), bp = T.place(tr, p.bplace);
        out.push({title: 'Ta naissance', text: `Tu es ${p.first || T.name(p)}. Tu nais ${p.bd ? 'le ' + T.dateFr(p.bd) : p.by ? 'en ' + p.by : ''}${bp ? ` à ${bp}` : ''}${father || mother ? `, ${fem(p) ? 'fille' : 'fils'} de ${[father, mother].filter(Boolean).map(x => T.name(x)).join(' et de ')}` : ''}.${father?.occ ? ` Ton père est ${father.occ}.` : ''}`});
        const jobs = [...new Set(tr.people.map(x => x.occ).filter(Boolean))];
        if (p.occ) { const opts = shuffle([p.occ, ...shuffle(jobs.filter(j => j !== p.occ)).slice(0, 2)]); out.push({title: 'Le métier', text: `Tu as quinze ans${p.by ? `, c’est l’année ${p.by + 15}` : ''}. Il faut gagner ta vie. Que vas-tu faire ?`, choices: opts.map(o => ({label: `Devenir ${o}`, real: o === p.occ})), real: `Dans la vraie vie, ${p.first} est devenu${tu} ${p.occ}.`}); }
        (tr.fams.get(p.id) || []).forEach(f => { const o = tr.byId.get(f.a === p.id ? f.b : f.a); if (!o) return; const age = f.my ? T.ageAt(p, f.md, f.my) : null;
            const decoys = shuffle(tr.people.filter(x => x.gender === o.gender && x.id !== o.id && x.id !== p.id && x.first && (!p.by || !x.by || Math.abs(x.by - p.by) < 25))).slice(0, 1);
            out.push({title: 'L’amour', text: `${age != null ? `Tu as ${age} ans. ` : ''}${f.mplace ? `À ${T.place(tr, f.mplace)}, ` : ''}deux personnes ont attiré ton regard…`, choices: shuffle([{label: `Épouser ${T.name(o)}`, real: true}, ...decoys.map(d => ({label: `Épouser ${T.name(d)}`, real: false})), {label: 'Rester libre encore un peu', real: false}]), real: `Dans la vraie vie, ${p.first} a épousé ${T.name(o)}${f.my ? ` ${f.md ? 'le ' : 'en '}${T.dateFr(f.md, f.my)}` : ''}${f.mplace ? ` à ${T.place(tr, f.mplace)}` : ''}.`}); });
        const places = [...new Set([...(tr.evBy.get('p' + p.id) || []).map(x => x.place), p.dplace].filter(x => x && x !== p.bplace))];
        if (places.length) { const go = T.place(tr, places[0]), all = [...new Set(tr.people.map(x => T.place(tr, x.bplace)).filter(Boolean))];
            out.push({title: 'Partir ?', text: `La vie est dure${bp ? ` à ${bp}` : ''}. On parle de partir…`, choices: shuffle([{label: `Partir pour ${go}`, real: true}, ...shuffle(all.filter(x => x !== go && x !== bp)).slice(0, 1).map(x => ({label: `Partir pour ${x}`, real: false})), {label: 'Rester au pays', real: false}]), real: `Dans la vraie vie, ${p.first} a fini sa route à ${go}.`}); }
        else if (bp) out.push({title: 'Partir ?', text: 'On parle de partir pour la ville…', choices: [{label: 'Partir', real: false}, {label: `Rester à ${bp}`, real: true}], real: `Dans la vraie vie, ${p.first} est resté${tu} à ${bp}.`});
        const kids = [...new Set(tr.kids.get(p.id) || [])].map(k => tr.byId.get(k)).filter(Boolean);
        if (kids.length) out.push({title: 'Les enfants', text: `${kids.length === 1 ? 'Un enfant arrive' : `${kids.length} enfants arrivent`} : ${kids.map(k => k.first).join(', ')}. Tu les regardes grandir.`});
        out.push({title: 'La fin du voyage', text: p.dy ? `Tu t’éteins ${p.dd ? 'le ' + T.dateFr(p.dd) : 'en ' + p.dy}${p.dplace ? ` à ${T.place(tr, p.dplace)}` : ''}${p.by ? `, à ${T.ageAt(p, p.dd, p.dy)} ans` : ''}.` : 'Ton histoire continue…'});
        return out;
    }
    async function renderHero(host, T) {
        const tr = await T.tree(), cand = tr.people.filter(p => !p.living && p.by && (p.occ || (tr.fams.get(p.id) || []).length)), first = cand.find(p => p.occ && (tr.fams.get(p.id) || []).length) || cand[0];
        if (!first) { host.innerHTML = T.empty('Il faut un ancêtre avec une date de naissance et un métier ou un mariage'); return; }
        host.innerHTML = `<div class="h-tr-row h-tr-noprint"><div style="min-width:260px"><span class="pk-lab">Tu seras</span>${T.personField('hero', first.id)}</div></div><div data-he-out></div>`;
        const out = host.querySelector('[data-he-out]');
        let ch = [], i = 0, same = 0, asked = 0, p = null, log = [];
        const draw = () => { const c = ch[i];
            if (!c) { out.innerHTML = `<article class="h-tr-book"><h2>Fin</h2><p class="h-tr-big">Tu as fait ${same} choix sur ${asked} comme ${T.esc(p.first)}.</p><p>${same === asked ? 'Une vie vécue à l’identique : tu connais bien ton ancêtre !' : same ? 'Une autre vie aurait été possible… mais c’est celle-là qui a mené jusqu’à toi.' : 'Avec tes choix, l’histoire de la famille aurait été tout autre.'}</p><ul>${log.map(l => `<li>${T.esc(l)}</li>`).join('')}</ul><button type="button" class="button" data-he-go>📖 Recommencer</button></article>`; return; }
            out.innerHTML = `<article class="h-tr-book"><small class="h-tr-muted">Chapitre ${i + 1} sur ${ch.length}</small><h2>${T.esc(c.title)}</h2><p>${T.esc(c.text)}</p>${c.choices ? `<div class="h-tr-he-ch">${c.choices.map((o, k) => `<button type="button" class="button secondary" data-he-c="${k}">${T.esc(o.label)}</button>`).join('')}</div>` : `<button type="button" class="button" data-he-next>Tourner la page →</button>`}<div data-he-res></div></article>`; };
        out.addEventListener('click', ev => {
            const b = ev.target.closest('[data-he-c]'); if (b) { const c = ch[i], o = c.choices[Number(b.dataset.heC)]; asked++; if (o.real) same++; log.push(`${c.title} : ${o.real ? '✔' : '✘'} ${o.label}`);
                out.querySelectorAll('[data-he-c]').forEach(x => { x.disabled = true; if (c.choices[Number(x.dataset.heC)].real) x.classList.add('is-real'); });
                out.querySelector('[data-he-res]').innerHTML = `<p class="h-tr-he-res ${o.real ? 'ok' : ''}">${o.real ? '✨ Le même choix que ton ancêtre !' : '🌀 Une autre vie commence… mais revenons à la vraie.'} ${T.esc(c.real || '')}</p><button type="button" class="button" data-he-next>Tourner la page →</button>`; return; }
            if (ev.target.closest('[data-he-next]')) { i++; draw(); }
        });
        const start = () => { p = tr.byId.get(Number(host.querySelector('[name=hero]').value)) || first; ch = chapters(T, tr, p); i = 0; same = 0; asked = 0; log = []; draw(); };
        host.addEventListener('click', ev => { if (ev.target.closest('[data-he-go]')) start(); });
        T.actions(host, {primary: {label: '📖 Commencer l’histoire', attrs: 'data-he-go', run: start}});
    }
    F.push({key: 'heros', group: 'jouer', icon: '📖', title: 'Le livre dont tu es le héros', desc: 'Vis la vie d’un ancêtre et fais ses choix — métier, mariage, départ — puis découvre ce qu’il a vraiment choisi.', render: renderHero});
    ext.tresorHero = {chapters};

    /* ── 🎯 Les coïncidences ── */
    function coincidences(T, tr) {
        const out = [], md = d => d?.slice(5), ppl = tr.people, name = p => T.name(p);
        // même jour de naissance
        const byMd = new Map(); ppl.filter(p => p.bd).forEach(p => { const k = md(p.bd); if (!byMd.has(k)) byMd.set(k, []); byMd.get(k).push(p); });
        [...byMd].filter(([, l]) => l.length > 1).sort((a, b) => b[1].length - a[1].length).forEach(([k, l]) => { const [m, d] = k.split('-').map(Number); out.push({ic: '🎂', score: l.length * 2, text: `${l.length} personnes nées un ${d === 1 ? '1er' : d} ${T.MONTHS[m - 1]} : ${l.map(p => `${name(p)} (${p.by})`).join(', ')}.`}); });
        // mort le jour de son anniversaire
        ppl.filter(p => p.bd && p.dd && md(p.bd) === md(p.dd)).forEach(p => out.push({ic: '🕯️', score: 5, text: e(`${name(p)} est mort·e le jour de son anniversaire, à ${p.dy - p.by} ans (${T.dateFr(p.dd)}).`, p)}));
        // né le jour de la mort d'un parent ou grand-parent
        ppl.filter(p => p.bd).forEach(p => T.ancestors(tr, p.id, 3).forEach(({id, gen}) => { const a = tr.byId.get(id); if (a?.dd && a.dd < p.bd && md(a.dd) === md(p.bd)) out.push({ic: '🔁', score: 4, text: `${name(p)} est né${fem(p) ? 'e' : ''} un ${T.dateFr(p.bd).replace(/ \d{4}$/, '')}, jour anniversaire de la mort de ${ext.tresorKin ? ext.tresorKin.kinWord(gen, a.gender, false) : 'son ancêtre'} ${name(a)} (${a.dy}).`}); }));
        // des mariages le même jour de l'année
        const wed = new Map(); tr.families.filter(f => f.md).forEach(f => { const k = md(f.md); if (!wed.has(k)) wed.set(k, []); wed.get(k).push(f); });
        [...wed].filter(([, l]) => l.length > 1).forEach(([, l]) => out.push({ic: '💍', score: 3, text: `${l.length} mariages le même jour de l’année : ${l.map(f => `${[f.a, f.b].map(x => tr.byId.get(x)?.first).filter(Boolean).join(' et ')} (${f.my})`).join(', ')}.`}));
        // exactement cent ans d'écart, même jour
        ppl.filter(p => p.bd).forEach(p => ppl.filter(q => q.bd && q.id > p.id && md(q.bd) === md(p.bd) && Math.abs(q.by - p.by) % 100 === 0).forEach(q => out.push({ic: '💯', score: 4, text: `${name(p)} et ${name(q)} sont nés à ${Math.abs(q.by - p.by)} ans pile d’écart, jour pour jour (${p.by} et ${q.by}).`})));
        // un vendredi 13, Noël, le jour de l'An
        ppl.filter(p => p.bd).forEach(p => { const dt = new Date(p.bd + 'T12:00:00Z'), k = md(p.bd); if (k === '12-25') out.push({ic: '🎄', score: 3, text: `${name(p)} est né${fem(p) ? 'e' : ''} le jour de Noël ${p.by}.`}); if (k === '01-01') out.push({ic: '🎆', score: 3, text: `${name(p)} est né${fem(p) ? 'e' : ''} le jour de l’An ${p.by}.`}); if (dt.getUTCDate() === 13 && dt.getUTCDay() === 5) out.push({ic: '🍀', score: 3, text: `${name(p)} est né${fem(p) ? 'e' : ''} un vendredi 13 (${T.dateFr(p.bd)}).`}); });
        // le même âge au mariage, de père en fils
        tr.families.filter(f => f.my).forEach(f => [f.a, f.b].map(x => tr.byId.get(x)).filter(Boolean).forEach(p => { const a = T.ageAt(p, f.md, f.my), par = tr.byId.get(p.father); (tr.fams.get(par?.id) || []).forEach(g => { if (g.my && a != null && T.ageAt(par, g.md, g.my) === a) out.push({ic: '👞', score: 3, text: `${name(p)} s’est marié${fem(p) ? 'e' : ''} à ${a} ans, au même âge que son père ${name(par)}.`}); }); }));
        return out.sort((a, b) => b.score - a.score);
    }
    async function renderCoinc(host, T) {
        const tr = await T.tree(), list = coincidences(T, tr);
        host.innerHTML = list.length ? `<p class="h-tr-big">${list.length} coïncidence${list.length > 1 ? 's' : ''} dans l’arbre</p><ul class="h-tr-list">${list.map(c => `<li class="h-tr-item h-tr-print"><span class="h-tr-ic">${c.ic}</span><div class="h-tr-grow">${T.esc(c.text)}</div></li>`).join('')}</ul><p class="h-tr-muted">Plus l’arbre a de dates précises (jour et mois), plus il y en a.</p>` : T.empty('Aucune coïncidence trouvée', {hint: 'Il faut des dates précises (jour et mois).'});
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
        host.innerHTML = `<div class="h-tr-panel h-tr-row"><label>Et si…<select data-wi-k><option value="couple">ces deux-là ne s’étaient jamais rencontrés</option><option value="one">cette personne n’avait pas vécu</option></select></label>
            <label data-wi-c>Le couple<select data-wi-f>${couples.map(f => `<option value="${f.id}" ${f === pick ? 'selected' : ''}>${T.esc([f.a, f.b].map(x => T.name(tr.byId.get(x))).join(' & '))}${f.my ? ` (${f.my})` : ''}</option>`).join('')}</select></label>
            <div data-wi-p hidden style="min-width:240px"><span class="pk-lab">La personne</span>${T.personField('one', st?.id)}</div></div><div data-wi-out></div>`;
        const out = host.querySelector('[data-wi-out]'), k = host.querySelector('[data-wi-k]');
        const draw = () => { const isC = k.value === 'couple'; host.querySelector('[data-wi-c]').hidden = !isC; host.querySelector('[data-wi-p]').hidden = isC;
            const f = tr.families.find(x => x.id === Number(host.querySelector('[data-wi-f]').value)), ids = isC ? (f ? [f.a, f.b] : []) : [Number(host.querySelector('[name=one]').value)].filter(Boolean);
            if (!ids.length) { out.innerHTML = ''; return; } const gone = whatIf(T, tr, ids), me = gone.find(p => p.id === st?.id), living = gone.filter(p => p.living).length, pct = Math.round(gone.length / Math.max(1, tr.people.length) * 100);
            out.innerHTML = gone.length ? `<div class="h-tr-panel h-tr-whatif"><p class="h-tr-big">🦋 ${gone.length} vie${gone.length > 1 ? 's' : ''} n’aurai${gone.length > 1 ? 'ent' : 't'} jamais existé</p><p>${pct} % de l’arbre${living ? `, dont ${living} personne${living > 1 ? 's' : ''} en vie aujourd’hui` : ''}.${me ? ` <b>Et ${T.esc(T.name(me))} non plus.</b>` : ''}</p>
                <div class="h-tr-fade">${gone.map((p, i) => `<span class="h-tr-pill" style="animation-delay:${Math.min(i * 0.15, 6)}s">${T.esc(T.name(p))}${p.by ? ` (${p.by})` : ''}</span>`).join(' ')}</div></div>` : T.empty('Personne ne descend de ce choix dans l’arbre', {icon: '🦋'}); };
        host.addEventListener('change', draw); draw();
    }
    F.push({key: 'et-si', group: 'decouvrir', icon: '🦋', title: '« Et si… »', desc: 'Et si ces deux-là ne s’étaient pas rencontrés ? Toutes les vies qui n’auraient jamais existé — peut-être la tienne.', render: renderWhatIf});
    ext.tresorWhatIf = {whatIf};
})();
