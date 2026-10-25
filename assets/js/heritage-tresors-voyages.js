/**
 * ✨ Trésors — lieux et voyages (lot 6) :
 *  - 📍 Le passeport des lieux : un tampon par lieu de l'arbre ; « J'y suis allé » le colore (date, mot) ; le carnet s'imprime.
 *  - 🌍 Le tour du monde : les kilomètres parcourus par chacun de lieu en lieu, le plus long voyage, le plus loin du berceau,
 *    la distance entre le lieu de naissance des parents et des enfants, siècle par siècle.
 *  - 🏡 Les maisons dans le temps : pour un lieu, qui y a vécu, de quand à quand, génération après génération.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const F = ext.tresorFeatures = ext.tresorFeatures || [];
    const A = () => window.LCNDA_APP;
    const km = (a, b) => { const r = Math.PI / 180, h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
    const hue = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
    const fmtKm = n => `${Math.round(n).toLocaleString('fr-FR')} km`;

    /* ── 📍 Le passeport des lieux ── */
    /** les lieux de l'arbre : [{id, name, n (événements), first (année), people}] */
    function treePlaces(T, tr) {
        const m = new Map(); tr.events.forEach(e => { if (!e.place || !tr.places[e.place]) return; const x = m.get(e.place) || {id: e.place, name: tr.places[e.place].name, n: 0, first: null, people: new Set()}; x.n++; if (e.y && (!x.first || e.y < x.first)) x.first = e.y; if (e.p) x.people.add(e.p); m.set(e.place, x); });
        tr.families.forEach(f => (tr.evBy.get('f' + f.id) || []).forEach(e => { const x = m.get(e.place); if (x) [f.a, f.b].filter(Boolean).forEach(p => x.people.add(p)); }));
        return [...m.values()].sort((a, b) => b.n - a.n);
    }
    function stampSvg(T, pl, visit) {
        const h = hue(pl.name), col = visit ? `hsl(${h} 55% 38%)` : '#b9b9b9', id = `st${pl.id}`, name = pl.name.toUpperCase().slice(0, 26), rot = (h % 24) - 12;
        return `<svg viewBox="0 0 120 120" class="h-tr-stamp${visit ? ' is-visited' : ''}" style="transform:rotate(${visit ? rot : 0}deg)"><defs><path id="${id}" d="M60 60 m-40 0 a40 40 0 1 1 80 0 a40 40 0 1 1 -80 0"/></defs>
            <circle cx="60" cy="60" r="55" fill="none" stroke="${col}" stroke-width="4" ${visit ? '' : 'stroke-dasharray="6 5"'}/><circle cx="60" cy="60" r="31" fill="none" stroke="${col}" stroke-width="1.5"/>
            <text font-size="${name.length > 18 ? 9 : 11}" font-weight="700" fill="${col}" font-family="system-ui" letter-spacing="1"><textPath href="#${id}" startOffset="${name.length > 18 ? 2 : 6}%">${T.esc(name)}</textPath></text>
            <text x="60" y="58" text-anchor="middle" font-size="14" font-weight="800" fill="${col}" font-family="Georgia">${pl.first || '—'}</text><text x="60" y="74" text-anchor="middle" font-size="9" fill="${col}" font-family="system-ui">${visit ? T.esc(visit.data?.date ? visit.data.date.slice(0, 4) : '✓') : `${pl.people.size} pers.`}</text></svg>`;
    }
    async function renderStamps(host, T) {
        const tr = await T.tree(), pls = treePlaces(T, tr);
        if (!pls.length) { host.innerHTML = '<p class="h-tr-muted">Aucun lieu dans l’arbre.</p>'; return; }
        const draw = async () => {
            const visits = new Map((await T.items('stamp')).map(v => [v.place_id, v])), n = pls.filter(p => visits.has(p.id)).length;
            host.innerHTML = `<div class="h-tr-row h-tr-noprint"><span class="h-tr-big">${n} / ${pls.length} lieux visités</span><div class="h-tr-bar"><i style="width:${Math.round(n / pls.length * 100)}%"></i></div><button type="button" class="button secondary" data-st-print>🖨 Le carnet</button></div>
                <p class="h-tr-muted h-tr-noprint">Chaque lieu de l’arbre a son tampon. Quand tu y vas — le village, l’église, la mairie, le cimetière —, clique dessus : « J’y suis allé ».</p>
                <div class="h-tr-stamps">${pls.map(p => { const v = visits.get(p.id); return `<button type="button" class="h-tr-stampbtn" data-st="${p.id}" title="${T.esc(p.name)} : ${p.n} événement${p.n > 1 ? 's' : ''}">${stampSvg(T, p, v)}<span>${T.esc(p.name)}</span>${v?.data?.note ? `<small>${T.esc(v.data.note)}</small>` : ''}</button>`; }).join('')}</div>`;
        };
        host.addEventListener('click', async e => {
            if (e.target.closest('[data-st-print]')) { const visits = new Map((await T.items('stamp')).map(v => [v.place_id, v])); ext.tresorPrint('Le passeport des lieux', '.bk{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm;max-width:180mm;margin:8mm auto;background:#f4ecd8;padding:10mm;border:2px solid #8a6b3a;font-family:Georgia}.bk h1{grid-column:1/-1;text-align:center}.bk div{text-align:center;font-size:10pt}.bk svg{width:38mm;height:38mm}', `<div class="bk"><h1>Passeport des lieux de la famille ${T.esc(T.start(tr)?.last || '')}</h1>${pls.map(p => `<div>${stampSvg(T, p, visits.get(p.id))}<br>${T.esc(p.name)}</div>`).join('')}</div>`); return; }
            const b = e.target.closest('[data-st]'); if (!b) return; const pl = pls.find(p => p.id === Number(b.dataset.st)), v = (await T.items('stamp')).find(x => x.place_id === pl.id);
            ext.openDialog({eyebrow: 'PASSEPORT DES LIEUX', title: `📍 ${pl.name}`, submitLabel: v ? 'Enregistrer' : '✅ J’y suis allé', body: `<p>${[...pl.people].slice(0, 12).map(id => T.esc(T.name(tr.byId.get(id)))).join(', ')}${pl.people.size > 12 ? '…' : ''}</p><div class="form-grid"><label>Le<input type="date" name="date" value="${T.esc(v?.data?.date || new Date().toISOString().slice(0, 10))}"></label><label class="span-2">Un mot<input name="note" maxlength="200" value="${T.esc(v?.data?.note || '')}" placeholder="la tombe d’Antoine au fond du cimetière"></label>${v ? '<label class="checkbox-line span-2"><input type="checkbox" name="undo"> Retirer le tampon</label>' : ''}</div>`,
                onSubmit: async form => { if (form.elements.undo?.checked) { await T.remove(v.id); } else await T.save({id: v?.id, kind: 'stamp', place_id: pl.id, title: pl.name, data: {date: form.elements.date.value, note: form.elements.note.value.trim()}}); draw(); }});
        });
        await draw();
    }
    F.push({key: 'passeport-lieux', group: 'lieux', icon: '📍', title: 'Le passeport des lieux', desc: 'Un tampon par village de l’arbre : quand tu y vas, il se colore. Combien en as-tu visité ?', render: renderStamps});
    ext.tresorStamps = {treePlaces};

    /* ── 🌍 Le tour du monde ── */
    function travelStats(T, tr) {
        const ts = ext.tresorFilm?.tracks(T, tr) || [], per = ts.map(t => { let d = 0, longest = null; for (let k = 1; k < t.steps.length; k++) { const x = km(t.steps[k - 1], t.steps[k]); d += x; if (!longest || x > longest.km) longest = {km: x, from: t.steps[k - 1].place, to: t.steps[k].place, y: t.steps[k].y}; } return {p: t.p, km: d, longest, steps: t.steps}; });
        const total = per.reduce((n, x) => n + x.km, 0), st = T.start(tr), home = st && tr.places[st.bplace]?.lat != null ? tr.places[st.bplace] : null;
        const far = home ? per.flatMap(x => x.steps.map(s => ({p: x.p, s, km: km(home, s)}))).sort((a, b) => b.km - a.km)[0] : null;
        const gen = new Map(); tr.people.forEach(c => { const cp = tr.places[c.bplace]; if (cp?.lat == null || !c.by) return; [c.father, c.mother].map(x => tr.byId.get(x)).forEach(par => { const pp = tr.places[par?.bplace]; if (pp?.lat == null) return; const cent = Math.floor(c.by / 100) * 100; const g = gen.get(cent) || []; g.push(km(pp, cp)); gen.set(cent, g); }); });
        return {per: per.filter(x => x.km > 0).sort((a, b) => b.km - a.km), total, far, home, gen: [...gen].sort((a, b) => a[0] - b[0]).map(([c, l]) => ({c, avg: l.reduce((n, x) => n + x, 0) / l.length, n: l.length}))};
    }
    async function renderWorld(host, T) {
        const tr = await T.tree(), s = travelStats(T, tr);
        if (!s.per.length) { host.innerHTML = '<p class="h-tr-muted">Il faut des lieux placés sur la carte et datés pour compter les kilomètres.</p>'; return; }
        const tour = s.total / 40075, max = Math.max(...s.gen.map(g => g.avg), 1), lg = s.per.map(x => x.longest).filter(Boolean).sort((a, b) => b.km - a.km)[0], lgp = s.per.find(x => x.longest === lg);
        host.innerHTML = `<div class="h-tr-cards h-tr-money"><div class="h-tr-panel"><small>Tous ensemble</small><div class="h-tr-big">🌍 ${fmtKm(s.total)}</div><small>${tour >= 1 ? `${tour.toFixed(1).replace('.', ',')} fois le tour de la Terre` : `${Math.round(tour * 100)} % du tour de la Terre`} · ${(s.total / 384400 * 100).toFixed(1).replace('.', ',')} % du chemin vers la Lune</small></div>
            ${lg ? `<div class="h-tr-panel"><small>Le plus long voyage</small><div class="h-tr-big">🧳 ${fmtKm(lg.km)}</div><small>${T.esc(T.name(lgp.p))} : ${T.esc(lg.from)} → ${T.esc(lg.to)}${lg.y ? ` (${lg.y})` : ''}</small></div>` : ''}
            ${s.far ? `<div class="h-tr-panel"><small>Le plus loin du berceau (${T.esc(s.home.name)})</small><div class="h-tr-big">🧭 ${fmtKm(s.far.km)}</div><small>${T.esc(T.name(s.far.p))}, à ${T.esc(s.far.s.place)}</small></div>` : ''}</div>
            <h3>Les grands voyageurs</h3><ol class="h-tr-world">${s.per.slice(0, 15).map(x => `<li><b>${T.esc(T.name(x.p))}</b> — ${fmtKm(x.km)} <small class="h-tr-muted">${T.esc(x.steps.map(st => st.place).filter((v, i, a) => a.indexOf(v) === i).join(' → '))}</small></li>`).join('')}</ol>
            ${s.gen.length ? `<h3>Entre le berceau des parents et celui des enfants</h3><div class="h-tr-bars">${s.gen.map(g => `<div><span>${g.c}s</span><i style="width:${Math.max(2, g.avg / max * 100)}%"></i><b>${fmtKm(g.avg)}</b> <small>(${g.n})</small></div>`).join('')}</div><p class="h-tr-muted">La distance moyenne, siècle par siècle, entre le lieu de naissance d’un parent et celui de son enfant : la famille qui s’éloigne de son village.</p>` : ''}`;
    }
    F.push({key: 'tour-du-monde', group: 'lieux', icon: '🌍', title: 'Le tour du monde des ancêtres', desc: 'Les kilomètres parcourus de lieu en lieu, le plus long voyage, le plus loin du berceau, siècle après siècle.', render: renderWorld});
    ext.tresorWorld = {travelStats};

    /* ── 🏡 Les maisons dans le temps ── */
    function dwellers(T, tr, placeId) {
        const rows = new Map(), add = (pid, y, what) => { if (!pid || !y) return; const r = rows.get(pid) || {p: tr.byId.get(pid), from: y, to: y, what: []}; if (!r.p) return; r.from = Math.min(r.from, y); r.to = Math.max(r.to, y); r.what.push(`${what} ${y}`); rows.set(pid, r); };
        tr.events.filter(e => e.place === placeId).forEach(e => { if (e.p) add(e.p, e.y, e.label.toLowerCase()); else { const f = tr.families.find(x => x.id === e.f); if (f) [f.a, f.b].forEach(x => add(x, e.y, e.label.toLowerCase())); } });
        // né ici et mort ici : toute la vie ; né ici : on suppose l'enfance (15 ans)
        [...rows.values()].forEach(r => { if (r.p.bplace === placeId && r.p.by) { r.from = Math.min(r.from, r.p.by); if (r.p.dplace === placeId && r.p.dy) r.to = Math.max(r.to, r.p.dy); else r.to = Math.max(r.to, r.p.by + 15); } });
        return [...rows.values()].sort((a, b) => a.from - b.from || a.to - b.to);
    }
    async function renderHouses(host, T) {
        const tr = await T.tree(), cand = treePlaces(T, tr).map(p => ({...p, rows: dwellers(T, tr, p.id)})).filter(p => p.rows.length >= 2).map(p => ({...p, span: Math.max(...p.rows.map(r => r.to)) - Math.min(...p.rows.map(r => r.from))})).sort((a, b) => b.span - a.span);
        if (!cand.length) { host.innerHTML = '<p class="h-tr-muted">Il faut au moins un lieu où deux personnes de l’arbre ont vécu.</p>'; return; }
        host.innerHTML = `<div class="h-tr-row h-tr-noprint"><label>Le lieu<select data-ho>${cand.map(p => `<option value="${p.id}">${T.esc(p.name)} — ${p.rows.length} personnes sur ${p.span} ans</option>`).join('')}</select></label></div><div data-ho-out></div>`;
        const out = host.querySelector('[data-ho-out]'), st = T.start(tr), anc = new Map(st ? T.ancestors(tr, st.id, 30).map(a => [a.id, a.gen]) : []);
        const draw = () => { const c = cand.find(x => x.id === Number(host.querySelector('[data-ho]').value)) || cand[0], y0 = Math.floor(Math.min(...c.rows.map(r => r.from)) / 10) * 10, y1 = Math.ceil(Math.max(...c.rows.map(r => r.to)) / 10) * 10 + 10, W = 900, L = 190, sx = (W - L - 20) / (y1 - y0), H = 50 + c.rows.length * 30;
            const gens = new Set(c.rows.map(r => anc.get(r.p.id)).filter(Boolean));
            out.innerHTML = `<p class="h-tr-big">🏡 ${T.esc(c.name)} : ${c.span} ans de présence de la famille${gens.size ? `, sur ${gens.size} génération${gens.size > 1 ? 's' : ''} d’ancêtres` : ''}</p>
                <svg viewBox="0 0 ${W} ${H}" class="h-tr-houses" width="100%">${[...Array(Math.floor((y1 - y0) / 10) + 1)].map((_, k) => { const x = L + k * 10 * sx; return `<line x1="${x}" y1="20" x2="${x}" y2="${H - 10}" stroke="#ddd"/>${k % 2 === 0 ? `<text x="${x}" y="14" font-size="11" text-anchor="middle" fill="#888">${y0 + k * 10}</text>` : ''}`; }).join('')}
                ${c.rows.map((r, k) => { const y = 30 + k * 30, g = anc.get(r.p.id), col = g ? `hsl(${(g * 47) % 360} 50% 45%)` : '#8a8f99'; return `<text x="${L - 8}" y="${y + 15}" font-size="13" text-anchor="end" fill="currentColor">${T.esc(T.name(r.p))}</text><rect x="${L + (r.from - y0) * sx}" y="${y + 3}" width="${Math.max(6, (r.to - r.from) * sx)}" height="16" rx="8" fill="${col}"><title>${T.esc(r.what.join(', '))}</title></rect><text x="${L + (r.to - y0) * sx + 8}" y="${y + 15}" font-size="11" fill="#888">${r.from}${r.to > r.from ? `–${r.to}` : ''}</text>`; }).join('')}</svg>
                <ul class="h-tr-list">${c.rows.map(r => `<li class="h-tr-item"><span class="h-tr-ic">🏠</span><div class="h-tr-grow"><b>${T.esc(T.name(r.p))}</b> <small>${T.esc(r.what.join(' · '))}</small></div></li>`).join('')}</ul>`; };
        host.querySelector('[data-ho]').addEventListener('change', draw); draw();
    }
    F.push({key: 'maisons', group: 'lieux', icon: '🏡', title: 'Les maisons dans le temps', desc: 'Un village, une maison : qui y a vécu, de quand à quand, génération après génération.', render: renderHouses});
    ext.tresorHouses = {dwellers};
})();
