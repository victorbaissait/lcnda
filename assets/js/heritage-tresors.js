/**
 * ✨ Trésors de famille — l'onglet qui réunit les nouveautés pour s'émerveiller, jouer, créer et garder la mémoire.
 * Chaque nouveauté s'inscrit dans ext.tresorFeatures (fichiers heritage-tresors-*.js) :
 *   {key, group, icon, title, desc, render(host, T)}  — host : l'élément où dessiner sa page ; T : les aides communes.
 * Les aides communes (T) : l'arbre en mémoire (lib/tresors.php, tresor_tree), les ancêtres et descendants, les noms, les
 * dates, le choix d'une personne (menu de choix unique), les éléments gardés (tresors / tresor_write), télécharger un fichier.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    ext.tresorFeatures = ext.tresorFeatures || [];
    const GROUPS = [['memoire', '🕯️ Garder la mémoire'], ['decouvrir', '🔭 Découvrir'], ['jouer', '🎲 Jouer en famille'], ['creer', '🎨 Créer et fabriquer'], ['lieux', '🗺️ Lieux et voyages'], ['outils', '🧰 Outils malins']];
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

    /* ═════════ Les aides communes ═════════ */
    let treeP = null, treeAt = 0;
    const T = {
        esc, MONTHS,
        toast: (...a) => A().toast(...a),
        api: (...a) => A().api(...a),
        post: (action, body) => A().api(action, {}, {method: 'POST', body}),
        /** l'arbre, gardé en mémoire (force : relire) ; index : byId, kids (personne → enfants), fams (personne → couples) */
        async tree(force = false) {
            if (!treeP || force || Date.now() - treeAt > 20000) { treeAt = Date.now(); treeP = A().api('tresor_tree').then(d => {
                const byId = new Map(d.people.map(p => [p.id, p])), kids = new Map(), fams = new Map();
                d.families.forEach(f => { [f.a, f.b].filter(Boolean).forEach(x => { if (!fams.has(x)) fams.set(x, []); fams.get(x).push(f); if (!kids.has(x)) kids.set(x, []); kids.get(x).push(...f.children); }); });
                const evBy = new Map(); d.events.forEach(e => { const k = e.p ? 'p' + e.p : 'f' + e.f; if (!evBy.has(k)) evBy.set(k, []); evBy.get(k).push(e); });
                return {...d, byId, kids, fams, evBy};
            }).catch(err => { treeP = null; throw err; }); }
            return treeP;
        },
        name: p => (p ? p.name || [p.first, p.last].filter(Boolean).join(' ') || 'Sans nom' : '?'),
        life: p => (p ? (p.by || p.dy ? `${p.by || '?'} – ${p.dy || (p.living ? '' : '?')}` : '') : ''),
        place: (tr, id) => (id && tr.places[id] ? tr.places[id].name : ''),
        /** « 12 mars 1890 », « 1890 » */
        dateFr: (d, y) => { if (d) { const [yy, m, dd] = d.split('-').map(Number); return `${dd === 1 ? '1er' : dd} ${MONTHS[m - 1]} ${yy}`; } return y ? String(y) : ''; },
        /** l'âge à une date (années pleines, ou à l'année près) */
        ageAt(p, d, y) {
            if (!p?.by) return null;
            if (p.bd && d) { const [a, b, c] = p.bd.split('-').map(Number), [x, yy, z] = d.split('-').map(Number); return x - a - (yy < b || (yy === b && z < c) ? 1 : 0); }
            const yr = y || (d ? Number(d.slice(0, 4)) : null); return yr ? yr - p.by : null;
        },
        /** les ancêtres : [{id, gen}] (gen 1 = parents), un ancêtre présent deux fois n'est gardé qu'une fois (au plus proche) */
        ancestors(tr, id, max = 30) {
            const out = [], seen = new Set([id]); let cur = [id];
            for (let g = 1; g <= max && cur.length; g++) { const nx = []; cur.forEach(c => { const p = tr.byId.get(c); [p?.father, p?.mother].filter(Boolean).forEach(a => { if (seen.has(a)) return; seen.add(a); out.push({id: a, gen: g}); nx.push(a); }); }); cur = nx; }
            return out;
        },
        descendants(tr, ids, max = 40) {
            const out = [], seen = new Set(ids); let cur = [...ids];
            for (let g = 1; g <= max && cur.length; g++) { const nx = []; cur.forEach(c => (tr.kids.get(c) || []).forEach(k => { if (seen.has(k)) return; seen.add(k); out.push({id: k, gen: g}); nx.push(k); })); cur = nx; }
            return out;
        },
        /** la personne de départ (racine) : celle marquée « de départ », sinon la première */
        start: tr => (tr.people.find(p => p.start) || tr.people[0] || null),
        /** choisir une personne (le menu de choix unique) → numéro, ou null */
        pickPerson(title = 'Choisir une personne', value = null) {
            return new Promise(res => { let done = false;
                ext.openDialog({eyebrow: 'TRÉSORS', title, submitLabel: 'Choisir', body: `<div class="form-grid"><div class="span-2"><span class="pk-lab">Personne</span>${window.LCNDA_PICKER.pickerField({name: 'tr_pp', kind: 'person', value})}</div></div>`,
                    onOpen: d => d.addEventListener('close', () => { if (!done) res(null); }, {once: true}),
                    onSubmit: form => { const id = Number(form.elements.tr_pp?.value) || 0; if (!id) { window.LCNDA_UI?.fail?.(form.elements.tr_pp, 'Choisis la personne.'); return false; } done = true; res(id); }}); });
        },
        personField: (name, value = null) => window.LCNDA_PICKER.pickerField({name, kind: 'person', value}),
        items: (kind, personId = 0) => A().api('tresors', {kind, ...(personId ? {person_id: personId} : {})}).then(r => r.items || []),
        save: item => T.post('tresor_write', {op: 'save', item}),
        remove: id => T.post('tresor_write', {op: 'delete', id}),
        download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); },
        /** un nombre au hasard qui dépend d'une graine (le même tirage à chaque fois) */
        rng(seed) { let s = (Number(seed) || 1) % 2147483647; if (s <= 0) s += 2147483646; return () => (s = s * 16807 % 2147483647) / 2147483647; },
        /** quelques phrases sur une vie, tirées de l'arbre (naissance, métier, mariages, enfants, décès) */
        story(tr, p) {
            if (!p) return [];
            const f = p.gender === 'female', il = f ? 'Elle' : 'Il', x = s => s.replace(/·e/g, f ? 'e' : ''), out = [];
            if (p.by) out.push(x(`${il} est né·e ${p.bd ? 'le ' : 'en '}${T.dateFr(p.bd, p.by)}${p.bplace ? ` à ${T.place(tr, p.bplace)}` : ''}.`));
            if (p.occ) out.push(`${il} était ${p.occ}.`);
            (tr.fams.get(p.id) || []).forEach(fa => { const o = tr.byId.get(fa.a === p.id ? fa.b : fa.a); if (o) out.push(`${il} a épousé ${T.name(o)}${fa.my ? ` ${fa.md ? 'le' : 'en'} ${T.dateFr(fa.md, fa.my)}` : ''}${fa.mplace ? ` à ${T.place(tr, fa.mplace)}` : ''}.`); });
            const kids = [...new Set(tr.kids.get(p.id) || [])].map(k => tr.byId.get(k)).filter(Boolean);
            if (kids.length) out.push(`${il} a eu ${kids.length === 1 ? 'un enfant' : `${kids.length} enfants`} : ${kids.map(k => k.first || T.name(k)).join(', ')}.`);
            if (p.dy) { const a = T.ageAt(p, p.dd, p.dy); out.push(x(`${il} est mort·e ${p.dd ? 'le ' : 'en '}${T.dateFr(p.dd, p.dy)}${a != null ? `, à ${a} ans` : ''}${p.dplace ? `, à ${T.place(tr, p.dplace)}` : ''}.`)); }
            return out;
        },
        /** lire à voix haute (la voix française du système) → une promesse tenue à la fin de la lecture */
        say(text, {rate = 0.95} = {}) {
            return new Promise(res => { const s = window.speechSynthesis; if (!s || !text) return res(false);
                const u = new SpeechSynthesisUtterance(text); u.lang = 'fr-FR'; u.rate = rate; const v = s.getVoices().find(x => /^fr/i.test(x.lang)); if (v) u.voice = v;
                u.onend = () => res(true); u.onerror = () => res(false); s.speak(u); });
        },
        hush: () => { try { window.speechSynthesis?.cancel(); } catch (_) {} },
        /** envoyer un enregistrement (son, vidéo, image) dans les médias → {media_id, filename} */
        async upload(blob, kind, title, name = 'enregistrement.webm') {
            const fd = new FormData(); fd.append('file', blob, name); fd.append('media_id', '0'); fd.append('mode', 'new'); fd.append('kind', kind); fd.append('title', title);
            const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf || ''}, credentials: 'same-origin'}).then(x => x.json());
            if (!r?.result?.media_id) throw new Error(r?.error || 'envoi impossible'); return r.result;
        },
        open: key => openFeature(key),
        portraitUrl: p => (p?.portrait ? `media/${encodeURIComponent(p.portrait)}` : ''),
        openPerson: id => (A().openPersonById ? A().openPersonById(id) : A().selectPerson ? A().selectPerson(id) : (location.hash = `#personnes/${id}`)),
    };
    ext.tresors = {T, render, open: k => openFeature(k)};

    /* ═════════ L'onglet ═════════ */
    let pending = null; // une nouveauté demandée depuis un autre onglet (ext.tresors.open)
    /* Réordonner les trésors : l'ordre et les trésors cachés, retenus sur cet ordinateur */
    const PREF_KEY = 'lcnda-tresors-order';
    const prefs = () => { try { const o = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return {order: Array.isArray(o.order) ? o.order : [], hidden: Array.isArray(o.hidden) ? o.hidden : []}; } catch (_) { return {order: [], hidden: []}; } };
    /** tous les trésors, rangés : par partie (dans l'ordre des parties), puis dans l'ordre choisi (les nouveaux à la fin de leur partie) */
    function ordered() {
        const {order} = prefs(), rank = k => { const i = order.indexOf(k); return i < 0 ? 1e6 : i; };
        const gi = g => { const i = GROUPS.findIndex(x => x[0] === g); return i < 0 ? GROUPS.length : i; };
        return ext.tresorFeatures.map((f, i) => ({f, i})).sort((a, b) => gi(a.f.group) - gi(b.f.group) || rank(a.f.key) - rank(b.f.key) || a.i - b.i).map(x => x.f);
    }
    function openSettings() {
        const hidden = prefs().hidden, glabel = g => (GROUPS.find(x => x[0] === g)?.[1] || '').replace(/^\S+\s/, '');
        const row = f => ({key: f.key, label: `${f.icon} ${f.title} — ${glabel(f.group)}`, hidden: hidden.includes(f.key)});
        A().openSideReorderDialog({eyebrow: 'TRÉSORS', title: 'Réordonner les trésors', canHide: true, rows: ordered().map(row),
            defaults: ext.tresorFeatures.map(f => ({...row(f), hidden: false})),
            save: rows => {
                if (rows.every(r => r.hidden)) { A().toast('Garde au moins un trésor affiché.', 'error'); return false; }
                try { localStorage.setItem(PREF_KEY, JSON.stringify({order: rows.map(r => r.key), hidden: rows.filter(r => r.hidden).map(r => r.key)})); } catch (_) {}
                if (A().state.module === 'tresors' && A().$('#workspace .h-tr:not(.h-tr-page)')) A().$('#workspace').innerHTML = hub();
                A().toast('Ordre et trésors affichés enregistrés.');
            }});
    }
    function hub() {
        const {hidden} = prefs(), list = ordered().filter(f => !hidden.includes(f.key)), nHid = ext.tresorFeatures.filter(f => hidden.includes(f.key)).length;
        return `<section class="page h-tr">
            <div class="page-header"><div><span class="eyebrow">✨ TRÉSORS DE FAMILLE</span><h1>Trésors de famille</h1><p class="muted">Pour s'émerveiller, jouer, créer et garder la mémoire, à partir de ton arbre.</p></div><div class="page-actions"><button type="button" class="button secondary" data-tr-settings title="L’ordre des trésors, ceux qui s’affichent et ceux qui sont cachés${nHid ? ` (en ce moment : ${A().plural(nHid, 'trésor caché')})` : ''}">⚙️ Réglages</button></div></div>
            ${GROUPS.map(([g, label]) => { const fs = list.filter(f => f.group === g); return fs.length ? `<h2 class="h-tr-group">${esc(label)}</h2><div class="h-tr-grid">${fs.map(f => `<button type="button" class="h-tr-card" data-tr-open="${esc(f.key)}"><span class="h-tr-ic" aria-hidden="true">${esc(f.icon)}</span><b>${esc(f.title)}</b><small>${esc(f.desc)}</small></button>`).join('')}</div>` : ''; }).join('')}
        </section>`;
    }
    async function render(token) {
        const ws = A().$('#workspace'); if (!ws) return;
        const key = (location.hash.match(/^#tresors\/([\w-]+)/) || [])[1] || pending; pending = null;
        if (key && ext.tresorFeatures.some(f => f.key === key)) return openFeature(key, !location.hash.startsWith(`#tresors/${key}`));
        ws.innerHTML = hub(); void token;
    }
    async function openFeature(key, push = true) {
        const f = ext.tresorFeatures.find(x => x.key === key), ws = A().$('#workspace'); if (!f || !ws) return;
        if (A().state.module !== 'tresors') { pending = key; return A().setModule('tresors'); }
        if (push && location.hash !== `#tresors/${key}`) history.pushState(null, '', `#tresors/${key}`);
        ws.innerHTML = `<section class="page h-tr h-tr-page" data-tr-page="${esc(key)}"><div class="h-tr-top"><button type="button" class="button small secondary" data-tr-home>← Tous les trésors</button></div>
            <div class="page-header"><div><span class="eyebrow">✨ TRÉSORS · ${esc(GROUPS.find(g => g[0] === f.group)?.[1].replace(/^\S+\s/, '').toUpperCase() || '')}</span><h1>${esc(f.icon)} ${esc(f.title)}</h1><p class="muted">${esc(f.desc)}</p></div></div><div class="h-tr-body" data-tr-body></div></section>`;
        const host = ws.querySelector('[data-tr-body]');
        // l'arbre relu à chaque ouverture : les fiches changées ailleurs y sont
        try { await T.tree(true); await f.render(host, T); } catch (err) { host.innerHTML = `<p class="ui-notice is-error">Impossible d'ouvrir : ${esc(err.message || err)}</p>`; console.error(err); }
    }
    document.addEventListener('click', e => {
        const o = e.target.closest('[data-tr-open]'); if (o && o.closest('.h-tr')) { e.preventDefault(); openFeature(o.dataset.trOpen); return; }
        if (e.target.closest('[data-tr-settings]')) { e.preventDefault(); openSettings(); return; }
        const h = e.target.closest('[data-tr-home]'); if (h) { e.preventDefault(); history.pushState(null, '', '#tresors'); A().$('#workspace').innerHTML = hub(); }
    });
    /* ═════════ Le bloc de la fiche : ✨ Trésors de cette personne ═════════ */
    const KIND_INFO = {letter: ['✉️', 'Lettres', 'lettres'], sense: ['👃', 'Souvenirs des sens', 'sens'], recipe: ['🥘', 'Recettes', 'recettes'], song: ['🎶', 'Chansons', 'chansons'], interview: ['🎙️', 'Entretiens', 'entretien'], candle: ['🕯️', 'Bougies', 'bougie'], passport: ['🛂', 'Passeports', 'passeports'], story: ['📖', 'Récits', ''], stamp: ['📍', 'Tampons', ''], hunt: ['🗝️', 'Chasses au trésor', ''], gazette: ['📰', 'Gazettes', ''], share: ['🔗', 'Partages', ''], reminder: ['⏰', 'Rappels', '']};
    ext.personBlocks = ext.personBlocks || {};
    const readOnly = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly'); // consultation, base en lecture seule
    ext.personBlocks.tresors = (index, detail, opts = {}) => {
        const pid = Number(detail?.person?.id); if (!pid || detail.person.kind === 'animal') return '';
        return A().card(index, '✨ Trésors', '', `<div class="h-tr-block" data-tr-block="${pid}"><p class="muted">…</p></div>`, 'span-12', readOnly() ? '' : `<button type="button" class="button small secondary" data-tr-open-k="sens">＋ Souvenir</button> <button type="button" class="button small secondary" data-tr-open-k="lettres">＋ Lettre</button>`);
    };
    async function fillBlock(detail) {
        const pid = Number(detail?.person?.id), el = document.querySelector(`#workspace [data-tr-block="${pid}"]`); if (!el) return;
        let items = []; try { items = await T.items('', pid); } catch (_) { el.innerHTML = '<p class="muted">Les trésors n’ont pas pu être lus.</p>'; return; }
        if (!items.length) { el.innerHTML = '<p class="muted">Rien encore : un souvenir (une odeur, un bruit), une recette, une chanson, une lettre pour plus tard, un entretien enregistré… tout se garde dans l’onglet ✨ Trésors.</p>'; return; }
        const by = new Map(); items.forEach(x => { if (!by.has(x.kind)) by.set(x.kind, []); by.get(x.kind).push(x); });
        el.innerHTML = [...by].map(([k, l]) => { const [ic, label, key] = KIND_INFO[k] || ['✨', k, ''];
            return `<div class="h-tr-bk"><b>${ic} ${esc(label)}</b> ${l.map(x => `<span class="h-tr-pill">${x.sealed ? `🔒 ${esc(x.title)} — s’ouvre le ${esc(T.dateFr(x.open_at))}` : esc(x.title)}</span>`).join(' ')}${key ? ` <button type="button" class="h-tr-link" data-tr-open-k="${key}">Voir</button>` : ''}</div>`; }).join('');
    }
    ext.afterPerson = ext.afterPerson || [];
    ext.afterPerson.push(detail => { fillBlock(detail); });
    document.addEventListener('click', e => { const b = e.target.closest('[data-tr-open-k]'); if (b && !b.closest('.h-tr-page')) { e.preventDefault(); openFeature(b.dataset.trOpenK); } });
})();
