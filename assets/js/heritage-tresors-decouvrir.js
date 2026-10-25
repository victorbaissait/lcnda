/**
 * ✨ Trésors — 🔭 Découvrir :
 *  - 🎂 « À ton âge… » : un âge choisi (le sien, celui d'un enfant), et ce que faisait chaque ancêtre à cet âge-là :
 *    mariage, naissance d'un enfant, départ, métier, ou déjà disparu — en phrases, de la génération la plus proche à la plus lointaine.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const F = ext.tresorFeatures = ext.tresorFeatures || [];

    /** « ton arrière-grand-père », « ta grand-mère », « ton ancêtre à la 7e génération » */
    function kinWord(gen, gender, you = true) {
        const f = gender === 'female', pre = (vowel = false) => (you ? (f && !vowel ? 'ta ' : 'ton ') : (f && !vowel ? 'sa ' : 'son ')); // « ton arrière-grand-mère »
        if (gen === 1) return pre() + (f ? 'mère' : 'père');
        if (gen === 2) return pre() + (f ? 'grand-mère' : 'grand-père');
        if (gen <= 5) return pre(true) + 'arrière-'.repeat(gen - 2) + (f ? 'grand-mère' : 'grand-père');
        return `${pre(true)}ancêtre à la ${gen}e génération`;
    }
    const VERB = {BIRT: null, MARR: 'se mariait', MRCI: 'se mariait civilement', MRRE: 'se mariait religieusement', DEAT: 'mourait', BURI: 'était inhumé·e', RESI: 'habitait', OCCU: 'travaillait comme', EMIG: 'partait', IMMI: 'arrivait', CENS: 'était recensé·e', MILI: 'était sous les drapeaux', GRAD: 'obtenait un diplôme', NATU: 'devenait français·e', CHR: 'était baptisé·e', BAPM: 'était baptisé·e', CONF: 'faisait sa confirmation', EDUC: 'était à l’école'};
    const fem = (s, p) => s.replace(/·e/g, p?.gender === 'female' ? 'e' : '');
    /** ce qui arrive à p à l'âge « age » : des phrases */
    function factsAt(T, tr, p, age) {
        const out = [], inAge = (d, y) => { const a = T.ageAt(p, d, y); return a === age; };
        (tr.evBy.get('p' + p.id) || []).forEach(e => { if (e.tag === 'BIRT' || !inAge(e.d, e.y)) return; const v = VERB[e.tag];
            const where = T.place(tr, e.place); out.push(`${v ? fem(v, p) : `vivait un événement (${e.label.toLowerCase()})`}${e.tag === 'OCCU' && e.what ? ' ' + e.what : ''}${where ? ` à ${where}` : ''}${e.d || e.y ? ` (${T.dateFr(e.d, e.y)})` : ''}`); });
        (tr.fams.get(p.id) || []).forEach(f => {
            (tr.evBy.get('f' + f.id) || []).forEach(e => { if (!inAge(e.d, e.y)) return; const other = tr.byId.get(f.a === p.id ? f.b : f.a), where = T.place(tr, e.place), v = VERB[e.tag];
                out.push(`${v ? fem(v, p) : e.label.toLowerCase()}${other ? ` avec ${T.name(other)}` : ''}${where ? ` à ${where}` : ''} (${T.dateFr(e.d, e.y)})`); });
            f.children.forEach(cid => { const c = tr.byId.get(cid); if (!c?.by || !inAge(c.bd, c.by)) return; out.push(`devenait ${p.gender === 'female' ? 'mère' : 'père'} de ${T.name(c)}${c.bplace ? ` à ${T.place(tr, c.bplace)}` : ''} (${T.dateFr(c.bd, c.by)})`); });
        });
        if (!out.length) {
            if (p.by && p.dy && p.dy - p.by < age) out.push(`n’était plus là : ${p.gender === 'female' ? 'elle' : 'il'} était ${fem('mort·e', p)} à ${p.dy - p.by} ans`);
            else if (p.by) { const yr = p.by + age; const last = (tr.evBy.get('p' + p.id) || []).filter(e => e.place && (e.y || 0) <= yr).at(-1); out.push(`${last ? `vivait sans doute du côté de ${T.place(tr, last.place)}` : 'vivait sa vie'} en ${yr}${p.occ ? ` (${p.occ})` : ''}`); }
        }
        return out;
    }
    async function renderAge(host, T) {
        const tr = await T.tree(), st = T.start(tr);
        if (!st) { host.innerHTML = '<p class="h-tr-muted">L’arbre est vide.</p>'; return; }
        const myAge = p => (p?.by ? T.ageAt(p, new Date().toISOString().slice(0, 10)) : null);
        host.innerHTML = `<form class="h-tr-panel h-tr-row h-tr-noprint" data-age-form><div style="min-width:260px"><span class="pk-lab">À partir de</span>${T.personField('ref', st.id)}</div>
            <label>L’âge<input type="number" name="age" min="0" max="110" value="${myAge(st) ?? 30}" style="width:6em"></label><button class="button" type="submit">Voir</button><button type="button" class="button secondary" data-age-mine>Mon âge</button></form><div data-age-out></div>`;
        const out = host.querySelector('[data-age-out]'), form = host.querySelector('[data-age-form]');
        const draw = () => {
            const ref = tr.byId.get(Number(form.elements.ref.value)) || st, age = Math.max(0, Math.min(110, Number(form.elements.age.value) || 0));
            const anc = T.ancestors(tr, ref.id, 16), you = ref.id === st.id;
            if (!anc.length) { out.innerHTML = '<p class="h-tr-muted">Pas d’ancêtres connus pour cette personne.</p>'; return; }
            const rows = anc.map(({id, gen}) => { const p = tr.byId.get(id); return p?.by ? {p, gen, facts: factsAt(T, tr, p, age)} : null; }).filter(Boolean);
            const known = rows.filter(r => r.facts.length);
            out.innerHTML = `<h3 class="h-tr-big">À ${age} ans…</h3><p class="h-tr-muted">${known.length} ancêtre${known.length > 1 ? 's' : ''} de ${T.esc(T.name(ref))} dont on connaît la naissance${anc.length > rows.length ? ` (${anc.length - rows.length} sans date de naissance ne sont pas comptés)` : ''}.</p>
                <ul class="h-tr-list">${known.map(r => `<li class="h-tr-item h-tr-print"><span class="h-tr-ic">${r.p.gender === 'female' ? '👩' : '👨'}</span><div class="h-tr-grow"><b>${T.esc(T.name(r.p))}</b> <small>(${T.esc(you ? kinWord(r.gen, r.p.gender) : kinWord(r.gen, r.p.gender, false).replace(/^(son|sa) /, ''))}, ${T.esc(T.life(r.p))})</small><br>À ${age} ans, ${r.p.gender === 'female' ? 'elle' : 'il'} ${T.esc(r.facts.join(' ; '))}.</div><button type="button" class="h-tr-link h-tr-noprint" data-age-open="${r.p.id}">Fiche</button></li>`).join('')}</ul>
                <p class="h-tr-noprint"><button type="button" class="button small secondary" onclick="print()">🖨 Imprimer</button></p>`;
        };
        form.addEventListener('submit', e => { e.preventDefault(); draw(); });
        host.addEventListener('click', e => { if (e.target.closest('[data-age-mine]')) { const a = myAge(tr.byId.get(Number(form.elements.ref.value)) || st); if (a != null) form.elements.age.value = a; draw(); } const o = e.target.closest('[data-age-open]'); if (o) T.openPerson(Number(o.dataset.ageOpen)); });
        draw();
    }
    F.push({key: 'aton-age', group: 'decouvrir', icon: '🎂', title: 'À ton âge…', desc: 'Ce que faisait chaque ancêtre au même âge que toi : il se mariait, partait, devenait parent…', render: renderAge});
    ext.tresorKin = {kinWord, factsAt};
})();
