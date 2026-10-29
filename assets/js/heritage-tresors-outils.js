/**
 * ✨ Trésors — 🧰 Outils malins :
 *  - 📷 Dater une vieille photo : quelques questions (le support, le carton du photographe, les vêtements, les coiffures, le décor)
 *    donnent une fourchette d'années ; avec l'âge apparent et le sexe de la personne, l'app propose qui de l'arbre ça peut être.
 *    Repères tirés de l'histoire de la photographie et du costume (fourchettes larges, volontairement prudentes).
 *  - ⏰ Les rappels de recherche : les branches endormies (dernière modification), ce qui y manque, un rappel de l'application en un clic.
 *  - 🏛️ Les actes manquants : un raccourci vers l'assistant « Que manque-t-il ? » de l'onglet Recherche.
 *  - 🎩 Le thème d'époque : la fiche d'un ancêtre aux couleurs de son temps (réglage gardé sur l'ordinateur).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const F = ext.tresorFeatures = ext.tresorFeatures || [];

    /* ── 📷 Dater une vieille photo ── */
    // [question, [ [réponse, de, à], … ]] — « à » au plus tard, « de » au plus tôt
    const CLUES = [
        ['Le support', [['Plaque de métal argentée, comme un miroir, dans un écrin', 1839, 1860], ['Image sur verre, dans un écrin (ambrotype)', 1854, 1870], ['Image sur une fine plaque de fer, sombre (ferrotype)', 1856, 1915],
            ['Petite carte (6 × 10 cm) collée sur un carton : carte de visite', 1859, 1905], ['Grande carte (11 × 16 cm) sur carton : carte cabinet', 1866, 1914], ['Carte postale photo (dos imprimé « carte postale »)', 1902, 1950],
            ['Tirage papier aux bords dentelés', 1925, 1965], ['Petit tirage papier noir et blanc sans carton, bords blancs droits', 1910, 1960], ['Photo couleur aux couleurs passées (orange, magenta)', 1960, 1990],
            ['Tirage carré à bord blanc large (type Polaroid / Instamatic)', 1963, 1985], ['Diapositive', 1936, 2005]]],
        ['Le carton (carte de visite ou cabinet)', [['Coins carrés, carton fin et clair', 1859, 1872], ['Coins arrondis', 1871, 1914], ['Carton épais et coloré (crème, noir, bordeaux), tranche dorée', 1880, 1905],
            ['Nom du photographe en grandes lettres décorées au dos, médailles', 1875, 1910], ['Bord biseauté doré', 1880, 1900]]],
        ['Les vêtements des femmes', [['Jupe très large en cloche (crinoline), épaules tombantes', 1855, 1869], ['Jupe plate devant et gonflée derrière (tournure)', 1869, 1890], ['Manches très bouffantes en haut (gigot)', 1891, 1898],
            ['Silhouette en S, col montant, grand chapeau', 1898, 1912], ['Robe droite, taille basse, jupe au genou', 1922, 1931], ['Épaules carrées, jupe sous le genou', 1938, 1950], ['Jupe ample et taille fine (New Look)', 1947, 1960],
            ['Coiffe régionale ou bonnet de paysanne', 1840, 1950]]],
        ['Les coiffures', [['Raie au milieu, cheveux plaqués sur les oreilles', 1840, 1870], ['Frange frisée sur le front', 1878, 1895], ['Chignon haut et volumineux', 1895, 1914], ['Cheveux courts « à la garçonne »', 1922, 1935], ['Mise en plis ondulée', 1930, 1950]]],
        ['Les hommes', [['Haut-de-forme', 1830, 1900], ['Canotier (chapeau de paille plat)', 1880, 1930], ['Moustache fournie, sans barbe', 1870, 1920], ['Barbe entière fournie', 1855, 1895], ['Col cassé et nœud papillon', 1885, 1925],
            ['Uniforme bleu horizon', 1915, 1920], ['Costume trois-pièces large, chapeau mou', 1920, 1955], ['Pantalon pattes d’éléphant, cheveux longs', 1967, 1980]]],
        ['Le décor', [['Fond peint, colonne, balustrade, rideau drapé', 1865, 1905], ['Fond uni, simple chaise', 1850, 1960], ['Dehors, photo prise sur le vif (pas en atelier)', 1890, 2000]]],
    ];
    /** la fourchette : le recouvrement des réponses ; s'il n'y en a pas, la période la plus souvent citée */
    function dateRange(picks) {
        if (!picks.length) return null;
        let lo = Math.max(...picks.map(p => p[0])), hi = Math.min(...picks.map(p => p[1]));
        if (lo <= hi) return {lo, hi, sure: true};
        const counts = new Map(); for (let y = 1830; y <= 2010; y++) counts.set(y, picks.filter(([a, b]) => y >= a && y <= b).length);
        const best = Math.max(...counts.values()), yrs = [...counts].filter(([, c]) => c === best).map(([y]) => y);
        lo = yrs[0]; hi = yrs.at(-1); return {lo, hi, sure: false, agree: best, of: picks.length};
    }
    async function renderPhoto(host, T) {
        const tr = await T.tree();
        host.innerHTML = `<form class="h-tr-panel" data-ph><p class="h-tr-muted">Coche ce que tu vois sur la photo (une ou plusieurs réponses par question, ou rien si tu ne sais pas). Les repères sont volontairement larges.</p>
            ${CLUES.map(([q, rs], qi) => `<fieldset style="margin:8px 0"><legend><b>${T.esc(q)}</b></legend>${rs.map(([r, a, b], ri) => `<label class="checkbox-line"><input type="checkbox" name="c" value="${qi}:${ri}"> ${T.esc(r)} <small class="h-tr-muted">(${a}–${b})</small></label>`).join('')}</fieldset>`).join('')}
            <fieldset><legend><b>Et toi, que sais-tu ?</b></legend><div class="h-tr-row"><label>Photographe ou date notée : de<input type="number" name="lo" min="1830" max="2030" style="width:6em"></label><label>à<input type="number" name="hi" min="1830" max="2030" style="width:6em"></label>
            <label>Âge apparent de la personne<input type="number" name="age" min="0" max="100" style="width:5em"></label><label>C’est<select name="sex"><option value="">?</option><option value="male">un homme, un garçon</option><option value="female">une femme, une fille</option></select></label><label>Lieu (nom du photographe, ville)<input name="where" placeholder="Tulle"></label></div></fieldset></form><div data-ph-out></div>`;
        const form = host.querySelector('[data-ph]'), out = host.querySelector('[data-ph-out]');
        const draw = () => {
            const picks = [...form.querySelectorAll('[name=c]:checked')].map(i => { const [q, r] = i.value.split(':').map(Number); return CLUES[q][1][r].slice(1); });
            const lo = Number(form.elements.lo.value), hi = Number(form.elements.hi.value); if (lo || hi) picks.push([lo || 1830, hi || lo || 2030]);
            const rg = dateRange(picks); if (!rg) { out.innerHTML = T.empty('Coche au moins un indice', {icon: '📷'}); return; }
            const age = form.elements.age.value === '' ? null : Number(form.elements.age.value), sex = form.elements.sex.value, where = form.elements.where.value.trim().toLowerCase(), mid = Math.round((rg.lo + rg.hi) / 2);
            let cands = [];
            if (age != null) cands = tr.people.filter(p => p.by && (!sex || p.gender === sex)).map(p => { const a0 = rg.lo - p.by, a1 = rg.hi - p.by; if (a1 < age - 6 || a0 > age + 6 || (p.dy && p.dy < rg.lo)) return null;
                const best = Math.max(a0, Math.min(a1, age)), gap = Math.abs(best - age); let sc = 10 - gap;
                if (where) { const pl = [p.bplace, p.dplace, ...(tr.evBy.get('p' + p.id) || []).map(e => e.place)].map(x => T.place(tr, x).toLowerCase()); if (pl.some(n => n && n.includes(where))) sc += 4; }
                if (p.portrait) sc += 0.5; return {p, sc, yr: p.by + age}; }).filter(Boolean).sort((a, b) => b.sc - a.sc).slice(0, 20);
            out.innerHTML = `<div class="h-tr-panel"><div class="h-tr-big">📷 ${rg.lo === rg.hi ? rg.lo : `entre ${rg.lo} et ${rg.hi}`}</div><p class="h-tr-muted">${rg.sure ? `Tous les indices s’accordent (vers ${mid}).` : `Les indices ne s’accordent pas tous : ${rg.agree} sur ${rg.of} tombent dans cette période. Revois celui qui détonne.`}</p>
                ${age != null ? (cands.length ? `<h3>Qui cela peut être</h3><ul class="h-tr-list">${cands.map(c => `<li class="h-tr-item"><span class="h-tr-ic">${c.p.gender === 'female' ? '👩' : '👨'}</span><div class="h-tr-grow"><b>${T.esc(T.name(c.p))}</b> <small>${T.esc(T.life(c.p))}${c.p.occ ? ' · ' + T.esc(c.p.occ) : ''}</small><br><small>Avait ${age} ans vers ${c.yr}${c.p.bplace ? ` · né${c.p.gender === 'female' ? 'e' : ''} à ${T.esc(T.place(tr, c.p.bplace))}` : ''}</small></div><button type="button" class="h-tr-link" data-ph-open="${c.p.id}">Fiche</button></li>`).join('')}</ul>` : '<p class="h-tr-muted">Personne dans l’arbre n’avait cet âge pendant cette période.</p>') : '<p class="h-tr-muted">Indique l’âge apparent pour voir qui ça peut être.</p>'}</div>`;
        };
        form.addEventListener('input', draw); form.addEventListener('change', draw);
        out.addEventListener('click', e => { const o = e.target.closest('[data-ph-open]'); if (o) T.openPerson(Number(o.dataset.phOpen)); });
        draw();
    }
    F.push({key: 'dater-photo', group: 'outils', icon: '📷', title: 'Dater une vieille photo', desc: 'Le support, le carton, les vêtements, les coiffures : une fourchette d’années, et qui de l’arbre ça peut être.', render: renderPhoto});
    ext.tresorPhotoDate = {CLUES, dateRange};

    /* ── ⏰ Les rappels de recherche : les branches endormies ── */
    const A = () => window.LCNDA_APP;
    const monthsSince = d => { if (!d) return null; const a = new Date(d + 'T00:00:00'), b = new Date(); return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth(); };
    /** les branches de la personne de départ (par grand-parent, puis par nom), la dernière fois qu'on y a touché, ce qui y manque */
    function sleepingBranches(T, tr, rootId) {
        const anc = T.ancestors(tr, rootId, 14), heads = anc.filter(a => a.gen === 2).map(a => tr.byId.get(a.id)).filter(Boolean), out = [];
        const gaps = p => [!p.by && 'la naissance', !p.living && !p.dy && 'le décès', !(tr.fams.get(p.id) || []).some(f => f.my) && (tr.kids.get(p.id) || []).length && 'le mariage'].filter(Boolean);
        (heads.length ? heads : anc.filter(a => a.gen === 1).map(a => tr.byId.get(a.id)).filter(Boolean)).forEach(h => {
            const ids = [h.id, ...T.ancestors(tr, h.id, 12).map(a => a.id)], ppl = ids.map(i => tr.byId.get(i)).filter(Boolean);
            const touched = ppl.map(p => p.touched).filter(Boolean).sort().at(-1) || '', todo = ppl.map(p => ({p, g: gaps(p)})).filter(x => x.g.length);
            const names = [...new Set(ppl.map(p => p.last).filter(Boolean))].slice(0, 4);
            out.push({head: h, label: `Branche ${h.last || T.name(h)} (${h.first || ''})`.replace(' ()', ''), names, count: ppl.length, touched, months: monthsSince(touched), todo});
        });
        return out.sort((a, b) => (b.months ?? 0) - (a.months ?? 0));
    }
    const isoIn = m => { const d = new Date(); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10); };
    function remindDialog(T, title, notes) {
        ext.openDialog({eyebrow: 'RAPPEL DE RECHERCHE', title: '⏰ Me le rappeler', submitLabel: 'Créer le rappel', body: `<div class="form-grid"><label class="span-2">Le rappel<input name="title" maxlength="200" value="${T.esc(title)}"></label>
            <label>Le<input type="date" name="due" value="${isoIn(1)}"></label><label>Dans<select name="in"><option value="">—</option><option value="1">1 mois</option><option value="3">3 mois</option><option value="6">6 mois</option><option value="12">1 an</option></select></label>
            <label class="span-2">Notes<textarea name="notes" rows="4">${T.esc(notes)}</textarea></label></div>`,
            onOpen: d => d.querySelector('[name=in]').addEventListener('change', e => { if (e.target.value) d.querySelector('[name=due]').value = isoIn(Number(e.target.value)); }),
            onSubmit: async form => { const v = k => form.elements[k].value.trim(); if (!v('title') || !v('due')) { const errs = [!v('title') && [form.elements.title, 'Écris le rappel.'], !v('due') && [form.elements.due, 'Choisis la date du rappel.']].filter(Boolean);
                    if (window.LCNDA_UI?.formErrors) window.LCNDA_UI.formErrors(form, errs); else T.fail(errs[0][0], errs[0][1]); return false; }
                await T.post('save_standalone_reminder', {title: v('title'), notes: v('notes'), reminder_mode: 'on', reminder_due_at: v('due'), reminder_category: 'chercher_acte'});
                T.toast(`⏰ Rappel créé pour le ${T.dateFr(v('due'))} (Listes → Rappels).`, 'success'); }});
    }
    async function renderReminders(host, T) {
        const tr = await T.tree(), st = T.start(tr);
        host.innerHTML = `<div class="h-tr-row h-tr-noprint"><div style="min-width:260px"><span class="pk-lab">Les branches de</span>${T.personField('root', st?.id)}</div><label>Endormie depuis au moins<select data-rm-min><option value="0">peu importe</option><option value="3" selected>3 mois</option><option value="6">6 mois</option><option value="12">1 an</option></select></label></div>
            <p class="h-tr-muted">La date est celle de la dernière modification d’une fiche de la branche. Un rappel se crée en un clic : il rejoint les rappels de l’application (Listes → Rappels) et le widget « À venir ».</p><div data-rm-out></div>`;
        const out = host.querySelector('[data-rm-out]'), rootEl = host.querySelector('[name=root]'), minEl = host.querySelector('[data-rm-min]');
        let rows = [];
        const draw = () => { rows = sleepingBranches(T, tr, Number(rootEl.value) || st?.id); const min = Number(minEl.value), vis = rows.filter(r => (r.months ?? 999) >= min);
            out.innerHTML = vis.length ? `<ul class="h-tr-list">${vis.map(r => `<li class="h-tr-item" data-rm-i="${rows.indexOf(r)}"><span class="h-tr-ic">${(r.months ?? 99) >= 12 ? '😴' : (r.months ?? 0) >= 3 ? '💤' : '🌱'}</span><div class="h-tr-grow"><b>${T.esc(r.label)}</b> <small>${r.count} personne${r.count > 1 ? 's' : ''}${r.names.length ? ' · ' + T.esc(r.names.join(', ')) : ''}</small><br>
                ${r.touched ? `Pas touchée depuis <b>${r.months >= 12 ? `${Math.floor(r.months / 12)} an${r.months >= 24 ? 's' : ''}${r.months % 12 ? ` et ${r.months % 12} mois` : ''}` : `${r.months} mois`}</b> (${T.when(r.touched, {label: 'modifiée'})})` : 'Jamais modifiée'}${r.todo.length ? ` · <b>${r.todo.length}</b> fiche${r.todo.length > 1 ? 's' : ''} à compléter : ${r.todo.slice(0, 4).map(x => `<button type="button" class="h-tr-link" data-rm-open="${x.p.id}">${T.esc(T.name(x.p))}</button> <small>(${T.esc(x.g.join(', '))})</small>`).join(', ')}${r.todo.length > 4 ? '…' : ''}` : ' · rien d’évident ne manque'}</div>
                <button type="button" class="button small secondary" data-rm-add>⏰ Me le rappeler</button></li>`).join('')}</ul>` : T.empty('Aucune branche endormie depuis aussi longtemps', {hint: 'Bravo !'}); };
        rootEl.addEventListener('change', draw); minEl.addEventListener('change', draw);
        out.addEventListener('click', e => { const o = e.target.closest('[data-rm-open]'); if (o) return T.openPerson(Number(o.dataset.rmOpen));
            const b = e.target.closest('[data-rm-add]'); if (!b) return; const r = rows[Number(b.closest('[data-rm-i]').dataset.rmI)];
            remindDialog(T, `Reprendre la ${r.label.replace(/^Branche/, 'branche')}`, r.todo.slice(0, 12).map(x => `• ${T.name(x.p)} : ${x.g.join(', ')}`).join('\n')); });
        draw();
    }
    F.push({key: 'rappels', group: 'outils', icon: '⏰', title: 'Les rappels de recherche', desc: '« Tu n’as pas touché à la branche FAURE depuis 8 mois » : les branches endormies, ce qui y manque, un rappel en un clic.', render: renderReminders});

    /* ── 🏛️ Les actes manquants (raccourci) : l'assistant existe déjà dans Recherche ── */
    async function renderGaps(host, T) {
        host.innerHTML = window.LCNDA_UI?.spinner ? window.LCNDA_UI.spinner('Je regarde ce qui manque…') : '<p class="h-tr-muted">Je regarde ce qui manque…</p>';
        const d = await T.api('research_gaps', {gen: 6}).catch(() => null), items = d?.items || [];
        const by = new Map(); items.forEach(it => { const k = it.archive?.label || 'Archives à trouver'; by.set(k, (by.get(k) || 0) + 1); });
        host.innerHTML = `<div class="h-tr-panel"><p>L’assistant <b>« Que manque-t-il ? »</b> (onglet Recherche) liste les actes qui manquent à la lignée, rangés par service d’archives, avec la commune, les années et les séries à consulter (état civil, tables décennales, registres paroissiaux, notaires, recensements, registres matricules), et un lien vers FranceArchives.</p>
            ${items.length ? `<p class="h-tr-big">${items.length} recherche${items.length > 1 ? 's' : ''} à faire sur 6 générations</p><ul>${[...by].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `<li>🏛️ ${T.esc(k)} : <b>${n}</b></li>`).join('')}</ul>` : T.empty('Rien ne manque sur 6 générations, ou l’assistant n’a pas pu être lu')}</div>`;
        T.actions(host, {primary: {label: '🔍 Ouvrir l’assistant', attrs: 'data-gp-go', title: 'L’assistant « Que manque-t-il ? » de l’onglet Recherche', run: () => { A().state.researchKind = 'gaps'; A().setModule('recherche'); }}});
    }
    F.push({key: 'actes-manquants', group: 'outils', icon: '🏛️', title: 'Les actes manquants', desc: 'Ce qui manque à la lignée, rangé par archives où chercher (l’assistant de l’onglet Recherche).', render: renderGaps});

    /* ── 🎩 Le thème d'époque des fiches ── */
    const ERAS = [[0, 1788, 'ancien', '📜 Ancien Régime'], [1789, 1851, 'empire', '🎖️ Révolution et Empire'], [1852, 1899, 'sepia', '🎩 Le XIXe siècle'], [1900, 1918, 'belle', '🌿 La Belle Époque'], [1919, 1945, 'deco', '🍸 Les années folles et la guerre'], [1946, 1969, 'trente', '🚗 Les Trente Glorieuses'], [1970, 9999, 'pop', '📻 Les années 70 et après']];
    const ERA_KEY = 'lcnda-tr-era';
    const eraOn = () => { try { return localStorage.getItem(ERA_KEY) === '1'; } catch (_) { return false; } };
    /** l'époque d'une vie : celle de ses 25 ans (ou vingt ans avant sa mort) */
    const eraOf = p => { const y = p?.by ? p.by + 25 : p?.dy ? p.dy - 20 : null; return y == null ? null : ERAS.find(([a, b]) => y >= a && y <= b); };
    async function applyEra(detail) {
        const page = document.querySelector('#workspace .person-page'); if (!page) return;
        page.removeAttribute('data-tr-era'); page.querySelector('.h-tr-era-badge')?.remove();
        if (!eraOn() || !detail?.person?.id) return;
        const tr = await ext.tresors.T.tree().catch(() => null), p = tr?.byId.get(Number(detail.person.id)), e = eraOf(p); if (!e) return;
        const pg = document.querySelector('#workspace .person-page'); if (!pg) return;
        pg.dataset.trEra = e[2]; pg.querySelector('.person-hero')?.insertAdjacentHTML('beforeend', `<span class="h-tr-era-badge" title="Thème d’époque (Trésors → Thème d’époque)">${e[3]}</span>`);
    }
    ext.afterPerson = ext.afterPerson || [];
    ext.afterPerson.push(detail => { applyEra(detail); });
    async function renderEra(host, T) {
        const tr = await T.tree();
        const sample = e => tr.people.filter(p => eraOf(p)?.[2] === e[2]).slice(0, 3);
        host.innerHTML = `<div class="h-tr-panel"><label class="ui-toggle"><input type="checkbox" data-era-on ${eraOn() ? 'checked' : ''}><i></i><b>Habiller chaque fiche aux couleurs de son époque</b></label>
            <p class="h-tr-muted">La fiche d’un ancêtre prend l’allure du temps où il a vécu (ses 25 ans) : parchemin pour l’Ancien Régime, sépia au XIXe, art déco pour les années folles… Le reste de l’application ne change pas. Ce réglage est gardé sur cet ordinateur.</p></div>
            <div class="h-tr-cards">${ERAS.map(e => `<div class="h-tr-era-demo" data-tr-era="${e[2]}"><div class="person-hero"><b>${e[3]}</b><small>${e[0] ? e[0] : 'avant'} – ${e[1] < 9999 ? e[1] : 'aujourd’hui'}</small></div><small>${sample(e).map(p => T.esc(T.name(p))).join(', ') || '<span class="h-tr-muted">personne</span>'}</small></div>`).join('')}</div>`;
        host.querySelector('[data-era-on]').addEventListener('change', e => { try { localStorage.setItem(ERA_KEY, e.target.checked ? '1' : '0'); } catch (_) {} T.toast(e.target.checked ? 'Les fiches prennent maintenant les couleurs de leur époque.' : 'Thème d’époque arrêté.', 'success'); });
    }
    F.push({key: 'theme-epoque', group: 'outils', icon: '🎩', title: 'Le thème d’époque', desc: 'Chaque fiche aux couleurs de son temps : parchemin, sépia, Belle Époque, art déco, Trente Glorieuses.', render: renderEra});
    ext.tresorEra = {ERAS, eraOf, applyEra};
})();
