/**
 * ✨ Trésors — 🧰 Outils malins :
 *  - 📷 Dater une vieille photo : quelques questions (le support, le carton du photographe, les vêtements, les coiffures, le décor)
 *    donnent une fourchette d'années ; avec l'âge apparent et le sexe de la personne, l'app propose qui de l'arbre ça peut être.
 *    Repères tirés de l'histoire de la photographie et du costume (fourchettes larges, volontairement prudentes).
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
            const rg = dateRange(picks); if (!rg) { out.innerHTML = '<p class="h-tr-muted">Coche au moins un indice.</p>'; return; }
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
})();
