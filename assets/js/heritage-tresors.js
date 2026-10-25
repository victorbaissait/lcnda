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
    let treeP = null;
    const T = {
        esc, MONTHS,
        toast: (...a) => A().toast(...a),
        api: (...a) => A().api(...a),
        post: (action, body) => A().api(action, {}, {method: 'POST', body}),
        /** l'arbre, gardé en mémoire (force : relire) ; index : byId, kids (personne → enfants), fams (personne → couples) */
        async tree(force = false) {
            if (!treeP || force) treeP = A().api('tresor_tree').then(d => {
                const byId = new Map(d.people.map(p => [p.id, p])), kids = new Map(), fams = new Map();
                d.families.forEach(f => { [f.a, f.b].filter(Boolean).forEach(x => { if (!fams.has(x)) fams.set(x, []); fams.get(x).push(f); if (!kids.has(x)) kids.set(x, []); kids.get(x).push(...f.children); }); });
                const evBy = new Map(); d.events.forEach(e => { const k = e.p ? 'p' + e.p : 'f' + e.f; if (!evBy.has(k)) evBy.set(k, []); evBy.get(k).push(e); });
                return {...d, byId, kids, fams, evBy};
            }).catch(err => { treeP = null; throw err; });
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
        open: key => openFeature(key),
        portraitUrl: p => (p?.portrait ? `media/${encodeURIComponent(p.portrait)}` : ''),
        openPerson: id => A().selectPerson ? A().selectPerson(id) : (location.hash = `#personnes/${id}`),
    };
    ext.tresors = {T, render, open: k => openFeature(k)};

    /* ═════════ L'onglet ═════════ */
    let pending = null; // une nouveauté demandée depuis un autre onglet (ext.tresors.open)
    function hub() {
        const list = ext.tresorFeatures;
        return `<section class="page h-tr">
            <div class="page-header"><div><span class="eyebrow">✨ TRÉSORS DE FAMILLE</span><h1>Trésors de famille</h1><p class="muted">Pour s'émerveiller, jouer, créer et garder la mémoire, à partir de ton arbre.</p></div></div>
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
        try { await f.render(host, T); } catch (err) { host.innerHTML = `<p class="ui-notice is-error">Impossible d'ouvrir : ${esc(err.message || err)}</p>`; console.error(err); }
    }
    document.addEventListener('click', e => {
        const o = e.target.closest('[data-tr-open]'); if (o && o.closest('.h-tr')) { e.preventDefault(); openFeature(o.dataset.trOpen); return; }
        const h = e.target.closest('[data-tr-home]'); if (h) { e.preventDefault(); history.pushState(null, '', '#tresors'); A().$('#workspace').innerHTML = hub(); }
    });
})();
