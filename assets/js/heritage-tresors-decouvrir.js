/**
 * ✨ Trésors — 🔭 Découvrir :
 *  - 🎂 « À ton âge… » : un âge choisi (le sien, celui d'un enfant), et ce que faisait chaque ancêtre à cet âge-là :
 *    mariage, naissance d'un enfant, départ, métier, ou déjà disparu — en phrases, de la génération la plus proche à la plus lointaine.
 *  - 👶 Les prénoms qui sautent une génération (la popularité INSEE est déjà dans Patrimoine → Prénoms).
 *  - 💰 Le pouvoir d'achat : une somme d'une année → euros d'aujourd'hui, kilos de pain, journées de travail ; les sommes de l'arbre.
 *  - 📜 Les vieux mots des actes : un dictionnaire, et un acte collé dont les mots anciens sont surlignés et expliqués.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const F = ext.tresorFeatures = ext.tresorFeatures || [];

    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js
    const LNG = () => window.LCNDA_I18N?.lang || 'fr';
    const LOC = () => (LNG() !== 'fr' && window.LCNDA_I18N?.locale ? window.LCNDA_I18N.locale() : 'fr-FR');
    const gx = (p, m, f, v) => i18n(p?.gender === 'female' ? f : m, v); // 🌐 une phrase par sexe

    /** « père », « arrière-grand-mère », « ancêtre à la 7e génération » (sans possessif, dans la langue choisie) */
    function kinBare(gen, gender) {
        const f = gender === 'female';
        if (gen === 1) return f ? i18n('mère') : i18n('père');
        if (gen === 2) return f ? i18n('grand-mère') : i18n('grand-père');
        if (gen === 3) return f ? i18n('arrière-grand-mère') : i18n('arrière-grand-père');
        if (gen === 4) return f ? i18n('arrière-arrière-grand-mère') : i18n('arrière-arrière-grand-père');
        if (gen === 5) return f ? i18n('arrière-arrière-arrière-grand-mère') : i18n('arrière-arrière-arrière-grand-père');
        return i18n('ancêtre à la {n}e génération', {n: String(gen)});
    }
    /** « ton arrière-grand-père », « ta grand-mère », « ton ancêtre à la 7e génération » */
    function kinWord(gen, gender, you = true) {
        const f = gender === 'female';
        if (LNG() !== 'fr') { const x = kinBare(gen, gender), fw = f && gen <= 5; return you ? i18n(fw ? 'ta {x} (lien)' : 'ton {x} (lien)', {x}) : i18n(fw ? 'sa {x} (lien)' : 'son {x} (lien)', {x}); }
        const pre = (vowel = false) => (you ? (f && !vowel ? 'ta ' : 'ton ') : (f && !vowel ? 'sa ' : 'son ')); // « ton arrière-grand-mère »
        if (gen === 1) return pre() + (f ? 'mère' : 'père');
        if (gen === 2) return pre() + (f ? 'grand-mère' : 'grand-père');
        if (gen <= 5) return pre(true) + 'arrière-'.repeat(gen - 2) + (f ? 'grand-mère' : 'grand-père');
        return `${pre(true)}ancêtre à la ${gen}e génération`;
    }
    /** ce que fait la personne (sans le sujet), une phrase par sexe : [masculin, féminin] ; {where} « à Tulle », {date} « (12 mars 1890) », {what} le métier */
    const VERB = {BIRT: null, MARR: ['se mariait{with}{where}{date}', 'se mariait{with}{where}{date}'], MRCI: ['se mariait civilement{with}{where}{date}', 'se mariait civilement{with}{where}{date}'], MRRE: ['se mariait religieusement{with}{where}{date}', 'se mariait religieusement{with}{where}{date}'],
        DEAT: ['mourait{with}{where}{date}', 'mourait{with}{where}{date}'], BURI: ['était inhumé{with}{where}{date}', 'était inhumée{with}{where}{date}'], RESI: ['habitait{with}{where}{date}', 'habitait{with}{where}{date}'], OCCU: ['travaillait comme{what}{with}{where}{date}', 'travaillait comme{what}{with}{where}{date}'],
        EMIG: ['partait{with}{where}{date}', 'partait{with}{where}{date}'], IMMI: ['arrivait{with}{where}{date}', 'arrivait{with}{where}{date}'], CENS: ['était recensé{with}{where}{date}', 'était recensée{with}{where}{date}'], MILI: ['était sous les drapeaux{with}{where}{date}', 'était sous les drapeaux{with}{where}{date}'],
        GRAD: ['obtenait un diplôme{with}{where}{date}', 'obtenait un diplôme{with}{where}{date}'], NATU: ['devenait français{with}{where}{date}', 'devenait française{with}{where}{date}'], CHR: ['était baptisé{with}{where}{date}', 'était baptisée{with}{where}{date}'], BAPM: ['était baptisé{with}{where}{date}', 'était baptisée{with}{where}{date}'],
        CONF: ['faisait sa confirmation{with}{where}{date}', 'faisait sa confirmation{with}{where}{date}'], EDUC: ['était à l’école{with}{where}{date}', 'était à l’école{with}{where}{date}']};
    /** ce qui arrive à p à l'âge « age » : des morceaux de phrase sans le sujet (« se mariait avec … à Naves (20 mai 1876) ») */
    function factsAt(T, tr, p, age) {
        const out = [], inAge = (d, y) => { const a = T.ageAt(p, d, y); return a === age; };
        const v4 = (place, d, y, o = {}) => ({where: place ? ' ' + T.at(place) : '', date: d || y ? ` (${T.dateFr(d, y)})` : '', with: o.with ? ' ' + i18n('avec {name}', {name: o.with}) : '', what: o.what ? ' ' + o.what : ''});
        (tr.evBy.get('p' + p.id) || []).forEach(e => { if (e.tag === 'BIRT' || !inAge(e.d, e.y)) return; const v = VERB[e.tag];
            const vars = v4(T.place(tr, e.place), e.d, e.y, {what: e.tag === 'OCCU' ? e.what : ''});
            out.push(v ? gx(p, v[0], v[1], vars) : i18n('vivait un événement ({label}){where}{date}', {...vars, label: e.label.toLowerCase()})); });
        (tr.fams.get(p.id) || []).forEach(f => {
            (tr.evBy.get('f' + f.id) || []).forEach(e => { if (!inAge(e.d, e.y)) return; const other = tr.byId.get(f.a === p.id ? f.b : f.a), v = VERB[e.tag];
                const vars = {...v4(T.place(tr, e.place), e.d, e.y, {with: other ? T.name(other) : ''}), date: ` (${T.dateFr(e.d, e.y)})`};
                out.push(v ? gx(p, v[0], v[1], vars) : `${e.label.toLowerCase()}${vars.with}${vars.where}${vars.date}`); });
            f.children.forEach(cid => { const c = tr.byId.get(cid); if (!c?.by || !inAge(c.bd, c.by)) return; out.push(gx(p, 'devenait père de {name}{where}{date}', 'devenait mère de {name}{where}{date}', {name: T.name(c), where: c.bplace ? ' ' + T.at(T.place(tr, c.bplace)) : '', date: ` (${T.dateFr(c.bd, c.by)})`})); });
        });
        if (!out.length) {
            if (p.by && p.dy && p.dy - p.by < age) out.push(gx(p, 'n’était plus là : il était mort à {n} ans', 'n’était plus là : elle était morte à {n} ans', {n: String(p.dy - p.by)}));
            else if (p.by) { const yr = p.by + age; const last = (tr.evBy.get('p' + p.id) || []).filter(e => e.place && (e.y || 0) <= yr).at(-1), occ = p.occ ? ` (${p.occ})` : '';
                out.push(last ? i18n('vivait sans doute du côté de {place} en {y}{occ}', {place: T.place(tr, last.place), y: String(yr), occ}) : i18n('vivait sa vie en {y}{occ}', {y: String(yr), occ})); }
        }
        return out;
    }
    async function renderAge(host, T) {
        const tr = await T.tree(), st = T.start(tr);
        if (!st) { host.innerHTML = T.empty(i18n('L’arbre est vide')); return; }
        const myAge = p => (p?.by ? T.ageAt(p, new Date().toISOString().slice(0, 10)) : null);
        host.innerHTML = `<form class="h-tr-panel h-tr-row h-tr-noprint" data-age-form><div style="min-width:260px"><span class="pk-lab">${i18n('À partir de')}</span>${T.personField('ref', st.id)}</div>
            <label>${i18n('L’âge')}<input type="number" name="age" min="0" max="110" value="${myAge(st) ?? 30}" style="width:6em"></label><button class="button secondary" type="submit">${i18n('Voir')}</button><button type="button" class="button secondary" data-age-mine>${i18n('Mon âge')}</button></form><div data-age-out></div>`;
        const out = host.querySelector('[data-age-out]'), form = host.querySelector('[data-age-form]');
        const draw = () => {
            const ref = tr.byId.get(Number(form.elements.ref.value)) || st, age = Math.max(0, Math.min(110, Number(form.elements.age.value) || 0));
            const anc = T.ancestors(tr, ref.id, 16), you = ref.id === st.id;
            if (!anc.length) { out.innerHTML = T.empty(i18n('Pas d’ancêtres connus pour cette personne')); return; }
            const rows = anc.map(({id, gen}) => { const p = tr.byId.get(id); return p?.by ? {p, gen, facts: factsAt(T, tr, p, age)} : null; }).filter(Boolean);
            const known = rows.filter(r => r.facts.length);
            out.innerHTML = `<h3 class="h-tr-big">${i18n('À {n} ans…', {n: String(age)})}</h3><p class="h-tr-muted">${anc.length > rows.length ? i18n('{who} de {name} dont on connaît la naissance ({k} sans date de naissance ne sont pas comptés).', {who: T.pl(known.length, 'ancêtre'), name: T.esc(T.name(ref)), k: String(anc.length - rows.length)}) : i18n('{who} de {name} dont on connaît la naissance.', {who: T.pl(known.length, 'ancêtre'), name: T.esc(T.name(ref))})}</p>
                <ul class="h-tr-list">${known.map(r => `<li class="h-tr-item h-tr-print"><span class="h-tr-ic">${r.p.gender === 'female' ? '👩' : '👨'}</span><div class="h-tr-grow"><b>${T.esc(T.name(r.p))}</b> <small>(${T.esc(you ? kinWord(r.gen, r.p.gender) : kinBare(r.gen, r.p.gender))}, ${T.esc(T.life(r.p))})</small><br>${gx(r.p, 'À {n} ans, il {facts}.', 'À {n} ans, elle {facts}.', {n: String(age), facts: T.esc(r.facts.join(' ; '))})}</div><button type="button" class="h-tr-link h-tr-noprint" data-age-open="${r.p.id}">${i18n('Fiche')}</button></li>`).join('')}</ul>`;
        };
        form.addEventListener('submit', e => { e.preventDefault(); draw(); });
        T.actions(host, {print: {attrs: 'data-age-print', run: () => T.printNode(i18n('À ton âge…'), out)}});
        host.addEventListener('click', e => { if (e.target.closest('[data-age-mine]')) { const a = myAge(tr.byId.get(Number(form.elements.ref.value)) || st); if (a != null) form.elements.age.value = a; draw(); } const o = e.target.closest('[data-age-open]'); if (o) T.openPerson(Number(o.dataset.ageOpen)); });
        draw();
    }
    F.push({key: 'aton-age', group: 'decouvrir', icon: '🎂', title: 'À ton âge…', desc: 'Ce que faisait chaque ancêtre au même âge que toi : il se mariait, partait, devenait parent…', render: renderAge});
    ext.tresorKin = {kinWord, kinBare, factsAt};

    /* ── 👶 Les prénoms qui sautent une génération ── */
    const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const firstOf = p => fold(String(p?.first || '').split(/[\s,-]+/)[0]);
    /** qui porte le prénom d'un grand-parent (ou plus haut) sans que ses parents le portent → [{p, from, gen, name}] */
    function skippedNames(T, tr) {
        const out = [];
        tr.people.forEach(p => {
            const n = firstOf(p); if (!n || n.length < 2) return;
            const parents = [p.father, p.mother].map(id => tr.byId.get(id)).filter(Boolean);
            if (parents.some(x => firstOf(x) === n)) return; // comme son père ou sa mère : ce n'est pas un saut
            const anc = T.ancestors(tr, p.id, 6).filter(a => a.gen >= 2), hit = anc.find(a => firstOf(tr.byId.get(a.id)) === n);
            if (hit) out.push({p, from: tr.byId.get(hit.id), gen: hit.gen, name: String(p.first).split(/[\s,]+/)[0]});
        });
        return out;
    }
    async function renderNames(host, T) {
        const tr = await T.tree(), list = skippedNames(T, tr), kin = (gen, g) => kinWord(gen, g, false);
        const byName = new Map(); list.forEach(x => { const k = firstOf(x.p); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(x); });
        // les prénoms qui reviennent le plus souvent dans l'arbre, toutes générations confondues
        const counts = new Map(); tr.people.forEach(p => { const k = firstOf(p); if (k.length > 1) counts.set(k, (counts.get(k) || 0) + 1); });
        const top = [...counts].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 15), label = k => tr.people.find(p => firstOf(p) === k)?.first.split(/[\s,]+/)[0] || k;
        host.innerHTML = `<div class="h-tr-panel"><p class="h-tr-muted">${i18n('Un prénom qui « saute » une génération : l’enfant le reçoit d’un grand-parent (ou d’un arrière-grand-parent), alors que ni son père ni sa mère ne le portaient. La popularité de chaque prénom en France (INSEE) est dans <b>Patrimoine → Prénoms</b>.')}</p>
            <div class="h-tr-big">${list.length > 1 ? i18n('{n} prénoms transmis par-dessus une génération', {n: String(list.length)}) : i18n('{n} prénom transmis par-dessus une génération', {n: String(list.length)})}</div></div>
            ${byName.size ? `<ul class="h-tr-list">${[...byName.values()].sort((a, b) => b.length - a.length).map(l => `<li class="h-tr-item h-tr-print"><span class="h-tr-ic">👶</span><div class="h-tr-grow"><b>${T.esc(l[0].name)}</b> <small>(${i18n('{n} fois', {n: String(l.length)})})</small><br>${l.map(x => i18n('{who}{y}, comme {kin} {from}{fy}', {who: `<button type="button" class="h-tr-link" data-nm-open="${x.p.id}">${T.esc(T.name(x.p))}</button>`, y: x.p.by ? ` (${x.p.by})` : '', kin: T.esc(kin(x.gen, x.from.gender)), from: `<button type="button" class="h-tr-link" data-nm-open="${x.from.id}">${T.esc(T.name(x.from))}</button>`, fy: x.from.by ? ` (${x.from.by})` : ''})).join('<br>')}</div></li>`).join('')}</ul>` : T.empty(i18n('Aucun prénom ne saute de génération dans l’arbre pour l’instant'))}
            ${top.length ? `<h3>${i18n('Les prénoms qui reviennent')}</h3><p>${top.map(([k, n]) => `<span class="h-tr-pill" style="margin:2px">${T.esc(label(k))} × ${n}</span>`).join(' ')}</p>` : ''}`;
        host.addEventListener('click', e => { const o = e.target.closest('[data-nm-open]'); if (o) T.openPerson(Number(o.dataset.nmOpen)); });
    }
    F.push({key: 'prenoms-sauts', group: 'decouvrir', icon: '👶', title: 'Les prénoms qui sautent une génération', desc: 'Henri comme son grand-père, Rose comme son arrière-grand-mère : les prénoms transmis par-dessus les parents.', render: renderNames});

    /* ── 💰 Le pouvoir d'achat d'autrefois ── */
    // Les tables (indice des prix de l'INSEE à partir de 1901, ordre de grandeur avant, prix du pain) et le calcul sont ceux du
    // 🪙 Convertisseur d'autrefois : app-autrefois-engine.js (window.LCNDA_AUTREFOIS). Un seul calcul pour toute l'app.
    const UNITS = [['livre', 'livres (ou francs de l’époque)'], ['sou', 'sous (1/20 de livre ou de franc)'], ['denier', 'deniers (1/240 de livre)'], ['ancien', 'anciens francs (après 1960)'], ['centime', 'centimes'], ['euro', 'euros']];
    /** une somme d'une année → {euros, bread (kg), days (journées de journalier), native, era} (calcul du Convertisseur d'autrefois) */
    function worth(amount, unit, year) {
        const F = window.LCNDA_AUTREFOIS; let v = Number(amount) || 0, kind = 'plain';
        if (unit === 'sou') v /= 20; else if (unit === 'denier') v /= 240; else if (unit === 'centime') v /= 100; else if (unit === 'ancien') kind = 'af'; else if (unit === 'euro') kind = 'euro';
        const w = F?.worth({ok: true, kind, value: v}, year, {wageSols: window.LCNDA_APP?.journalierWageSols});
        return w ? {euros: w.euros, bread: w.bread, days: w.days, native: w.native, era: w.era, source: w.source} : {euros: 0, bread: 0, days: null, native: v, era: 'franc'};
    }
    const fmtN = (n, d = 0) => Number(n).toLocaleString(LOC(), {maximumFractionDigits: d, minimumFractionDigits: 0});
    const fmtE = n => (n >= 100 ? fmtN(Math.round(n / (n >= 10000 ? 100 : 1)) * (n >= 10000 ? 100 : 1)) : fmtN(n, 2)) + ' €';
    const ERA_NAME = {livre: 'livres tournois', franc: 'francs', nf: 'nouveaux francs', euro: 'euros'};
    async function renderMoney(host, T) {
        const tr = await T.tree();
        // les sommes trouvées dans l'arbre (« dot de 1200 francs », « 300 livres »…)
        const re = /(\d[\d\s.,]{0,9})\s*(livres?|francs?|frs?\.?|sous|sols|écus?|f\b)/gi, found = [];
        tr.events.forEach(e => { if (!e.what || !e.y) return; let m; re.lastIndex = 0; while ((m = re.exec(e.what))) { const n = Number(m[1].replace(/[\s.]/g, '').replace(',', '.')); if (n > 0) found.push({e, n, unit: /^(sous|sols)/i.test(m[2]) ? 'sou' : /^écu/i.test(m[2]) ? 'ecu' : 'livre', raw: m[0]}); } });
        host.innerHTML = `<form class="h-tr-panel h-tr-row" data-mo><label>${i18n('La somme')}<input name="n" type="number" min="0" step="any" value="100" style="width:8em"></label><label>${i18n('en', {ctx: 'unité'})}<select name="u">${UNITS.map(([v, l]) => `<option value="${v}">${T.esc(i18n(l))}</option>`).join('')}</select></label><label>${i18n('L’année')}<input name="y" type="number" min="1600" max="2025" value="1900" style="width:6em"></label></form>
            <div data-mo-out></div>
            <p class="h-tr-muted">${i18n('Repères : à partir de 1901, l’indice des prix de l’INSEE ; avant, un ordre de grandeur d’après le prix des denrées. Le pain : prix moyen du kilo de pain ordinaire. Les journées : le salaire d’un journalier. Un écu = 3 livres.')} <button type="button" class="link-button" data-autrefois-open="argent">${i18n('🪙 Le calcul pas à pas dans le Convertisseur d’autrefois ↗')}</button></p>
            ${found.length ? `<h3>${i18n('Les sommes de ton arbre')}</h3><ul class="h-tr-list">${found.slice(0, 60).map(f => { const n = f.unit === 'ecu' ? f.n * 3 : f.n, w = worth(n, f.unit === 'ecu' ? 'livre' : f.unit, f.e.y), p = tr.byId.get(f.e.p);
                return `<li class="h-tr-item"><span class="h-tr-ic">💰</span><div class="h-tr-grow">${i18n('{sum} en {y}', {sum: `<b>${T.esc(f.raw)}</b>`, y: String(f.e.y)})}${p ? ` — ${T.esc(T.name(p))}` : ''} <small class="h-tr-muted">(${T.esc(f.e.label)} : ${T.esc(f.e.what)})</small><br>${i18n('≈ {eur} d’aujourd’hui', {eur: `<b>${fmtE(w.euros)}</b>`})} · ${i18n('{kg} kg de pain', {kg: fmtN(w.bread)})}${w.days ? ` · ${i18n('{d} journées de travail', {d: fmtN(w.days, 1)})}` : ''}</div></li>`; }).join('')}</ul>` : ''}`;
        const form = host.querySelector('[data-mo]'), out = host.querySelector('[data-mo-out]');
        const draw = () => {
            const n = Number(form.elements.n.value) || 0, u = form.elements.u.value, y = Math.max(1600, Math.min(2025, Number(form.elements.y.value) || 1900)), w = worth(n, u, y);
            const loaves = w.bread / 0.25; // une baguette ≈ 250 g
            out.innerHTML = `<div class="h-tr-cards h-tr-money"><div class="h-tr-panel"><small>${i18n('En euros d’aujourd’hui')}</small><div class="h-tr-big">≈ ${fmtE(w.euros)}</div></div>
                <div class="h-tr-panel"><small>${i18n('En pain')}</small><div class="h-tr-big">🥖 ${fmtN(w.bread, w.bread < 10 ? 1 : 0)} kg</div><small>${loaves >= 2 ? i18n('soit {n} baguettes d’aujourd’hui', {n: fmtN(loaves)}) : i18n('soit {n} baguette d’aujourd’hui', {n: fmtN(loaves)})}</small></div>
                ${w.days != null ? `<div class="h-tr-panel"><small>${i18n('En journées de travail')}</small><div class="h-tr-big">🔨 ${fmtN(w.days, 1)}</div><small>${i18n('d’un journalier en {y}', {y: String(y)})}${w.days >= 1 ? ` · ${i18n('≈ {eur} au SMIC d’aujourd’hui', {eur: fmtE(w.days * 95)})}` : ''}</small></div>` : ''}</div>
                <p class="h-tr-muted">${i18n('{n} {unit} de {y}.', {n: fmtN(w.native, 2), unit: i18n(ERA_NAME[w.era]), y: String(y)})} ${i18n('Les deux chiffres ne disent pas la même chose : le pain coûtait proportionnellement bien plus cher autrefois, le travail beaucoup moins.')}</p>`;
        };
        form.addEventListener('input', draw);
        form.elements.y.addEventListener('change', () => { const y = Number(form.elements.y.value); if (y >= 2002) form.elements.u.value = 'euro'; else if (form.elements.u.value === 'euro') form.elements.u.value = 'livre'; draw(); });
        draw();
    }
    F.push({key: 'pouvoir-achat', group: 'decouvrir', icon: '💰', title: 'Le pouvoir d’achat d’autrefois', desc: 'Une dot de 1 200 francs en 1880 : combien d’euros d’aujourd’hui, de kilos de pain, de journées de travail ?', render: renderMoney});
    ext.tresorMoney = {worth};

    /* ── 📜 Les vieux mots des actes ── */
    // [mot, définition, (expression régulière de recherche)] — les mots qu'on croise dans les registres et les actes de notaire
    const WORDS = [['ab intestat', 'sans testament'], ['aïeul', 'grand-père (aïeule : grand-mère)'], ['an de grâce', 'année de l’ère chrétienne'], ['affin', 'parent par alliance'], ['bans', 'annonce publique d’un mariage, faite trois dimanches de suite'], ['bâtard', 'enfant né hors mariage'],
        ['bordier', 'petit exploitant qui tient une borde (petite ferme)'], ['brassier', 'ouvrier agricole qui n’a que ses bras'], ['bourgeois', 'habitant d’une ville jouissant de droits particuliers'], ['cabaretier', 'tenancier d’un débit de boissons'], ['charron', 'artisan qui fabrique roues et charrettes'], ['cens', 'redevance annuelle due au seigneur pour une terre'],
        ['clerc', 'employé d’un notaire, ou homme d’Église'], ['colon', 'métayer, cultivateur d’une terre d’autrui'], ['compère', 'parrain (commère : marraine)'], ['consanguinité', 'parenté par le sang (empêchement au mariage, dispense à demander)'], ['contrat de mariage', 'acte chez le notaire fixant les biens des époux'], ['cousin germain', 'enfant de l’oncle ou de la tante'],
        ['curé', 'prêtre chargé d’une paroisse'], ['défunt', 'mort (feu, feue)'], ['demeurant', 'qui habite'], ['dispense', 'autorisation de l’Église de se marier malgré un empêchement (parenté, temps de l’Avent ou du Carême)'], ['domestique', 'serviteur logé chez son maître'], ['dot', 'biens apportés par l’épouse au mariage'],
        ['douaire', 'part des biens du mari réservée à la veuve'], ['échevin', 'magistrat municipal'], ['écuyer', 'titre de petite noblesse'], ['émancipé', 'mineur rendu capable d’agir seul'], ['enfant trouvé', 'enfant abandonné, recueilli'], ['exposé', 'enfant abandonné (déposé à l’hospice, au tour)'],
        ['feu', 'défunt (feu son père : son père décédé)'], ['fermier', 'qui loue une terre contre un loyer fixe'], ['fiançailles', 'promesse de mariage, souvent la veille'], ['fils naturel', 'enfant né hors mariage'], ['légitimé', 'enfant reconnu par le mariage de ses parents'], ['garçon', 'homme non marié (garçon majeur)'],
        ['fille', 'femme non mariée (fille majeure)'], ['icelui', 'celui-ci (icelle : celle-ci)'], ['inhumé', 'enterré'], ['journalier', 'ouvrier payé à la journée'], ['laboureur', 'paysan qui possède charrue et attelage : un notable du village'], ['ledit', 'celui dont on vient de parler (ladite, lesdits)'],
        ['majeur', 'majeur de 25 ans pour se marier sans accord (avant 1792), puis 21 ans'], ['manouvrier', 'ouvrier agricole qui travaille de ses mains'], ['marguillier', 'laïc chargé des biens de la paroisse'], ['métayer', 'cultivateur qui partage la récolte avec le propriétaire'], ['meunier', 'qui tient le moulin'], ['mineur', 'qui n’a pas l’âge de la majorité'],
        ['ondoyé', 'baptisé en urgence à la naissance, sans cérémonie'], ['paroisse', 'circonscription du curé, et ses habitants'], ['parrain', 'celui qui tient l’enfant au baptême'], ['marraine', 'celle qui tient l’enfant au baptême'], ['posthume', 'né après la mort de son père'], ['puîné', 'né après un aîné, cadet'], ['quarteron', 'quart d’une mesure ; ou un quart de cent (25)'],
        ['recteur', 'curé (en Bretagne)'], ['relevailles', 'bénédiction de la mère après l’accouchement'], ['sabotier', 'fabricant de sabots'], ['sage-femme', 'accoucheuse'], ['sieur', 'monsieur'], ['susdit', 'nommé plus haut (susnommé)'],
        ['tabellion', 'notaire seigneurial'], ['tisserand', 'qui tisse la toile'], ['tonnelier', 'fabricant de tonneaux'], ['tuteur', 'qui a la garde d’un mineur orphelin (curateur : qui l’assiste)'], ['veuf', 'dont l’épouse est morte (veuve)'], ['vicaire', 'prêtre qui assiste le curé'],
        ['vigneron', 'qui cultive la vigne'], ['an II', 'calendrier républicain : l’an I commence le 22 septembre 1792'], ['vendémiaire', '1er mois républicain (sept.-oct.)'], ['brumaire', '2e mois républicain (oct.-nov.)'], ['frimaire', '3e mois républicain (nov.-déc.)'], ['nivôse', '4e mois républicain (déc.-janv.)'],
        ['pluviôse', '5e mois républicain (janv.-févr.)'], ['ventôse', '6e mois républicain (févr.-mars)'], ['germinal', '7e mois républicain (mars-avril)'], ['floréal', '8e mois républicain (avril-mai)'], ['prairial', '9e mois républicain (mai-juin)'], ['messidor', '10e mois républicain (juin-juillet)'],
        ['thermidor', '11e mois républicain (juillet-août)'], ['fructidor', '12e mois républicain (août-sept.)'], ['décadi', '10e jour de la décade républicaine (jour de repos)'], ['officier public', 'l’officier d’état civil (le maire ou son adjoint)'], ['comparant', 'qui se présente devant l’officier ou le notaire'], ['témoin', 'qui assiste et signe l’acte'],
        ['a déclaré ne savoir signer', 'ne savait pas écrire son nom'], ['acte de notoriété', 'acte qui remplace un acte de naissance introuvable, sur témoignages'], ['tables décennales', 'index des actes d’état civil par période de dix ans'], ['mention marginale', 'note dans la marge (mariage, divorce, décès ajoutés ensuite)'], ['legs', 'don par testament'], ['inventaire après décès', 'liste des biens d’un défunt, dressée par le notaire'],
        ['censitaire', 'qui doit le cens au seigneur'], ['dîme', 'impôt (environ un dixième des récoltes) dû à l’Église'], ['taille', 'impôt direct d’Ancien Régime'], ['corvée', 'travail gratuit dû au seigneur ou au roi'], ['feu fiscal', 'foyer, unité de compte pour l’impôt'], ['arpent', 'mesure de surface (environ un demi-hectare, selon les lieux)'],
        ['setier', 'mesure de grains (et de surface ensemencée)'], ['toise', 'mesure de longueur, environ 1,95 m'], ['pied', 'environ 32,5 cm'], ['pouce', 'environ 2,7 cm'], ['aune', 'mesure de tissu, environ 1,19 m'], ['livre tournois', 'monnaie de compte : 20 sous, 240 deniers'],
        ['sou', '1/20 de livre (ou de franc)'], ['denier', '1/12 de sou'], ['écu', 'pièce de 3 livres (puis 6)'], ['louis d’or', 'pièce d’or de 24 livres (puis 20 francs)'], ['conscrit', 'jeune homme appelé au service militaire'], ['réfractaire', 'qui refuse de rejoindre l’armée'],
        ['mort pour la France', 'mention officielle d’un mort au service du pays'], ['remplaçant', 'homme payé pour faire le service militaire à la place d’un autre'], ['matricule', 'registre militaire d’un homme (signalement, campagnes)'], ['signalement', 'description physique (taille, cheveux, yeux…) d’un conscrit ou d’un voyageur'], ['passeport intérieur', 'papier exigé pour voyager en France (1792-1860 environ)'], ['livret ouvrier', 'carnet obligatoire de l’ouvrier, visé par ses patrons']];
    const WORD_RE = WORDS.map(([w], i) => [w, i]).sort((a, b) => b[0].length - a[0].length).map(([w, i]) => [w, i, new RegExp(`(^|[^\\p{L}])(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/e/g, '[eéèê]').replace(/ /g, '\\s+')}(?:s|e|es|x)?)(?=$|[^\\p{L}])`, 'giu')]);
    /** surligne les vieux mots d'un texte → {html, hits} */
    function highlight(T, text) {
        const hits = new Map(), marks = []; let html = T.esc(text);
        // les mots trouvés sont mis de côté (\u0001n\u0002) pour qu'un mot plus court ne soit pas cherché dans une définition déjà posée
        WORD_RE.forEach(([w, i, re]) => { html = html.replace(re, (m, pre, word) => { hits.set(w, (hits.get(w) || 0) + 1); marks.push(`<mark class="h-tr-word" title="${T.esc(WORDS[i][1])}" data-w="${i}">${word}</mark>`); return `${pre}\u0001${marks.length - 1}\u0002`; }); });
        return {html: html.replace(/\u0001(\d+)\u0002/g, (m, n) => marks[Number(n)]), hits};
    }
    async function renderWords(host, T) {
        const tr = await T.tree(), occs = [...new Set(tr.people.map(p => fold(p.occ)).filter(Boolean))], mine = WORDS.filter(([w]) => occs.some(o => o.includes(fold(w))));
        host.innerHTML = `<div class="h-tr-panel"><label style="display:grid;gap:4px"><b>${i18n('Colle ici le texte d’un acte')}</b><textarea data-w-in rows="6" placeholder="L’an mil sept cent quatre-vingt, le douze mars, a été baptisé Jean, fils légitime de feu Antoine Martin, laboureur, et de Marie Durand…" data-i18n-off></textarea></label><div data-w-out></div></div>
            ${mine.length ? `<div class="h-tr-panel"><b>${i18n('Dans ton arbre')}</b> : <span data-i18n-off lang="fr">${mine.map(([w, d]) => `<span class="h-tr-pill" title="${T.esc(d)}">${T.esc(w)}</span>`).join(' ')}</span></div>` : ''}
            <div class="h-tr-row"><label>${i18n('Chercher un mot')}<input type="search" data-w-q placeholder="laboureur, brumaire, dot…"></label><span class="h-tr-muted">${i18n('{n} mots', {n: String(WORDS.length)})}</span><button type="button" class="link-button" data-la-open="">${i18n('📜 Le latin, les abréviations et les anciennes lettres ↗')}</button></div>${LNG() !== 'fr' ? `<p class="h-tr-muted">${i18n('Ces mots et leurs explications sont ceux des actes français : ils restent en français.')}</p>` : ''}<dl class="h-tr-dict" data-w-list data-i18n-off lang="fr"></dl>`;
        const q = host.querySelector('[data-w-q]'), dl = host.querySelector('[data-w-list]'), inp = host.querySelector('[data-w-in]'), out = host.querySelector('[data-w-out]');
        const list = () => { const s = fold(q.value.trim()); dl.innerHTML = WORDS.filter(([w, d]) => !s || fold(w + ' ' + d).includes(s)).sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([w, d]) => `<div><dt>${T.esc(w)}</dt><dd>${T.esc(d)}</dd></div>`).join(''); };
        const scan = () => { const t = inp.value.trim(); if (!t) { out.innerHTML = ''; return; } const {html, hits} = highlight(T, t);
            out.innerHTML = `<div class="h-tr-letter" style="margin-top:10px" data-i18n-off>${html}</div><p>${hits.size ? `<b>${hits.size > 1 ? i18n('{n} mots expliqués', {n: String(hits.size)}) : i18n('{n} mot expliqué', {n: String(hits.size)})}</b> ${i18n('(passe la souris dessus) :')} <span data-i18n-off lang="fr">${[...hits.keys()].map(w => `<span class="h-tr-pill">${T.esc(w)} — ${T.esc(WORDS.find(x => x[0] === w)[1])}</span>`).join(' ')}</span>` : `<span class="h-tr-muted">${i18n('Aucun vieux mot reconnu.')}</span>`}</p>`; };
        q.addEventListener('input', list); inp.addEventListener('input', scan); list();
    }
    F.push({key: 'vieux-mots', group: 'decouvrir', icon: '📜', title: 'Les vieux mots des actes', desc: 'Laboureur, ondoyé, brumaire, douaire… Colle un acte : les mots anciens sont surlignés et expliqués.', render: renderWords});
    ext.tresorWords = {WORDS, highlight, skippedNames};
})();
