/**
 * ✨ Trésors — 🎲 Jouer en famille :
 *  - 🃏 Jeu des 7 familles : sept familles de l'arbre (par nom de famille ou par branche), six cartes chacune avec photo, dates,
 *    métier et lieu, et au bas de chaque carte les cinq autres membres à demander ; planches à imprimer et découper.
 *  - 🖍️ Arbre à colorier : les ancêtres de quelqu'un sur un grand arbre en traits noirs, feuilles et oiseaux à colorier.
 *  - 📺 Le quiz du repas : sur la télé, en équipes, des questions tirées de l'arbre, compte à rebours, points au clavier.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const F = ext.tresorFeatures = ext.tresorFeatures || [];
    const COLORS = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98', '#117a65', '#a04000', '#2e4053', '#b03a2e', '#1f618d'];
    /** une fenêtre d'impression (le même genre que la mise en page) */
    function printWindow(title, css, body) {
        const w = window.open('', '_blank'); if (!w) throw new Error('fenêtre bloquée : autorise les fenêtres pour cette page.');
        w.document.open(); w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title><base href="${location.href.replace(/[^/]*$/, '')}"><style>body{margin:0;font-family:system-ui,sans-serif;background:#888}.bar{position:sticky;top:0;display:flex;gap:10px;align-items:center;padding:10px 16px;background:#111;color:#fff;font:14px system-ui;z-index:9}.bar button{font:inherit;padding:6px 14px;border:0;border-radius:6px;background:#2f6bff;color:#fff;cursor:pointer}@media print{.bar{display:none}body{background:none}}${css}</style></head><body><div class="bar"><b>${title}</b><span style="flex:1"></span><button onclick="print()">🖨 Imprimer</button></div>${body}</body></html>`); w.document.close();
        return w;
    }
    ext.tresorPrint = printWindow;

    /* ── 🃏 Jeu des 7 familles ── */
    function buildFamilies(T, tr, mode, n = 7) {
        const groups = new Map(), add = (k, p) => { if (!k) return; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); };
        if (mode === 'branch') {
            // une famille = les ancêtres d'un des arrière-grands-parents (ou plus haut si l'arbre est petit)
            const st = T.start(tr); if (!st) return [];
            // la génération de « têtes de branche » qui donne le plus de familles d'au moins six (avec leurs frères et sœurs)
            const branch = h => { const hp = tr.byId.get(h.id), ids = new Set([h.id, ...T.ancestors(tr, h.id, 12).map(a => a.id)]); [...ids].forEach(id => { const p = tr.byId.get(id); [p.father, p.mother].filter(Boolean).forEach(par => (tr.kids.get(par) || []).forEach(k => ids.add(k))); }); return [hp, [...ids].map(i => tr.byId.get(i)).filter(p => p && !p.living)]; };
            const tries = [4, 3, 2, 1].map(g => T.ancestors(tr, st.id, g).filter(a => a.gen === g).map(branch)), best = tries.sort((a, b) => b.filter(x => x[1].length >= 6).length - a.filter(x => x[1].length >= 6).length)[0] || [];
            best.forEach(([hp, l]) => l.forEach(p => add(`Branche ${hp.last || T.name(hp)}${hp.first ? ` (${hp.first})` : ''}`, p)));
        } else tr.people.forEach(p => { if (!p.living && p.last) add(p.last.toUpperCase(), p); });
        const score = p => (p.portrait ? 3 : 0) + (p.by ? 1 : 0) + (p.occ ? 1 : 0) + (p.dy ? 0.5 : 0);
        return [...groups.entries()].filter(([, l]) => l.length >= 6).map(([k, l]) => ({name: k, people: l.sort((a, b) => score(b) - score(a)).slice(0, 6).sort((a, b) => (a.by || 9999) - (b.by || 9999))}))
            .sort((a, b) => b.people.reduce((s, p) => s + score(p), 0) - a.people.reduce((s, p) => s + score(p), 0)).slice(0, n);
    }
    const ROLE = (i, p) => [['Le grand-père', 'La grand-mère'], ['Le grand-père', 'La grand-mère'], ['Le père', 'La mère'], ['Le père', 'La mère'], ['Le fils', 'La fille'], ['Le fils', 'La fille']][i][p.gender === 'female' ? 1 : 0];
    function cardHtml(T, tr, fam, i, color) {
        const p = fam.people[i], img = T.portraitUrl(p);
        return `<div class="card" style="--c:${color}"><div class="head"><span>${T.esc(fam.name)}</span><b>${i + 1}</b></div>
            <div class="ph">${img ? `<img src="${img}" alt="">` : `<span>${p.gender === 'female' ? '👩' : '👨'}</span>`}</div>
            <div class="role">${T.esc(ROLE(i, p))}</div><div class="nm">${T.esc(T.name(p))}</div>
            <div class="info">${T.esc([T.life(p), p.occ, T.place(tr, p.bplace)].filter(Boolean).join(' · '))}</div>
            <ol class="others">${fam.people.map((q, k) => `<li class="${k === i ? 'me' : ''}">${T.esc(q.first || T.name(q))}</li>`).join('')}</ol></div>`;
    }
    const CARD_CSS = `.sheet{display:grid;grid-template-columns:repeat(3,63mm);gap:4mm;justify-content:center;padding:8mm;background:#fff;width:210mm;box-sizing:border-box;margin:12px auto;break-after:page}
        .card{box-sizing:border-box;width:63mm;height:88mm;border:1.2mm solid var(--c);border-radius:4mm;padding:2.5mm;display:flex;flex-direction:column;gap:1.2mm;font-size:8.5pt;color:#111;background:#fff;break-inside:avoid}
        .head{display:flex;justify-content:space-between;align-items:center;background:var(--c);color:#fff;margin:-2.5mm -2.5mm 0;padding:1.5mm 2.5mm;font-weight:800;letter-spacing:.04em}.head b{background:#fff;color:var(--c);border-radius:50%;width:6mm;height:6mm;display:grid;place-items:center}
        .ph{height:30mm;display:grid;place-items:center;background:#f3f1ec;border-radius:2mm;overflow:hidden}.ph img{width:100%;height:100%;object-fit:cover;filter:sepia(.25)}.ph span{font-size:28pt}
        .role{font-weight:800;color:var(--c);text-transform:uppercase;font-size:8pt}.nm{font-weight:800;font-size:10pt;line-height:1.1}.info{color:#444;font-size:7.5pt;line-height:1.2}
        .others{margin:auto 0 0;padding-left:4mm;font-size:7pt;color:#555;columns:2}.others .me{font-weight:800;color:var(--c)}
        .rules{width:210mm;margin:12px auto;background:#fff;padding:10mm;box-sizing:border-box;font:11pt Georgia,serif}`;
    async function renderSeven(host, T) {
        const tr = await T.tree();
        host.innerHTML = `<div class="h-tr-panel h-tr-row h-tr-noprint"><label>Les familles<select name="mode"><option value="surname">par nom de famille</option><option value="branch">par branche (arrière-grands-parents)</option></select></label><button class="button" data-7-print>🖨 Planches à imprimer</button></div><div data-7-out></div>`;
        const out = host.querySelector('[data-7-out]'), mode = host.querySelector('[name=mode]');
        const draw = () => { const fams = buildFamilies(T, tr, mode.value);
            out.innerHTML = fams.length < 2 ? '<p class="h-tr-muted">Il faut au moins deux familles d’au moins six personnes (décédées) : complète l’arbre, ou essaie « par branche ».</p>'
                : `<p class="h-tr-muted">${fams.length} famille${fams.length > 1 ? 's' : ''} de 6 cartes (${fams.length * 6} cartes). Ex. : ${fams.map(f => T.esc(f.name)).join(', ')}.</p><style>${CARD_CSS.replace(/\.(sheet|card|head|ph|role|nm|info|others|rules)\b/g, '.h-tr-7 .$1')}</style><div class="h-tr-7" style="display:flex;flex-wrap:wrap;gap:10px">${fams.slice(0, 2).map((f, fi) => f.people.map((_, i) => cardHtml(T, tr, f, i, COLORS[fi])).join('')).join('')}</div>`;
            return fams; };
        mode.addEventListener('change', draw); let fams = draw();
        host.querySelector('[data-7-print]').addEventListener('click', () => { fams = draw(); if (fams.length < 2) return;
            const cards = fams.flatMap((f, fi) => f.people.map((_, i) => cardHtml(T, tr, f, i, COLORS[fi % COLORS.length]))), sheets = [];
            for (let i = 0; i < cards.length; i += 9) sheets.push(`<div class="sheet">${cards.slice(i, i + 9).join('')}</div>`);
            printWindow('Jeu des 7 familles', CARD_CSS, `<div class="rules"><h2>🃏 Le jeu des ${fams.length} familles</h2><p>Distribuez 6 cartes à chacun, le reste fait la pioche. À ton tour, demande à un joueur une carte d’une famille dont tu as déjà une carte (« Dans la famille ${T.esc(fams[0].name)}, je voudrais ${T.esc(ROLE(2, fams[0].people[2]).toLowerCase())} »). S’il l’a, il te la donne et tu rejoues ; sinon, « Pioche ! ». Une famille complète se pose devant soi. Celui qui a le plus de familles a gagné.</p><p>Les familles : ${fams.map(f => `<b>${T.esc(f.name)}</b> (${f.people.map(p => T.esc(p.first || T.name(p))).join(', ')})`).join(' ; ')}.</p></div>${sheets.join('')}`); });
    }
    F.push({key: 'sept-familles', group: 'jouer', icon: '🃏', title: 'Jeu des 7 familles', desc: 'Les cartes faites depuis ton arbre (photos, métiers, dates), à imprimer et découper.', render: renderSeven});

    /* ── 🖍️ Arbre à colorier ── */
    function coloringSvg(T, tr, rootId, gens = 4) {
        const W = 1100, H = 1400, root = tr.byId.get(rootId), anc = T.ancestors(tr, rootId, gens - 1), byGen = [[root]];
        // la place de chacun : par génération, les pères à gauche (comme dans un arbre en éventail, mais redressé)
        for (let g = 1; g < gens; g++) { const row = []; byGen[g - 1].forEach(c => { const p = c ? tr.byId.get(c.id) : null; row.push(p?.father ? tr.byId.get(p.father) : null, p?.mother ? tr.byId.get(p.mother) : null); }); byGen.push(row); }
        void anc;
        const s = [], leaf = (x, y, r, rot) => `<path d="M${x} ${y - r}C${x + r * .9} ${y - r * .4} ${x + r * .9} ${y + r * .5} ${x} ${y + r}C${x - r * .9} ${y + r * .5} ${x - r * .9} ${y - r * .4} ${x} ${y - r}Z" transform="rotate(${rot} ${x} ${y})"/>`;
        // le tronc et les branches
        s.push(`<path d="M${W / 2 - 70} ${H - 60}C${W / 2 - 40} ${H - 260} ${W / 2 - 50} ${H - 380} ${W / 2 - 20} ${H - 470}L${W / 2 + 20} ${H - 470}C${W / 2 + 50} ${H - 380} ${W / 2 + 40} ${H - 260} ${W / 2 + 70} ${H - 60}Z"/>`);
        s.push(`<path d="M${W / 2 - 60} ${H - 150}c20 -10 40 -6 50 6M${W / 2 + 10} ${H - 250}c18 -6 30 2 36 12M${W / 2 - 30} ${H - 340}c14 -8 28 -6 36 4" fill="none"/>`);
        s.push(`<path d="M0 ${H - 60}H${W}" fill="none"/>`); [[80, H - 90], [200, H - 80], [920, H - 85], [1020, H - 95]].forEach(([x, y]) => s.push(`<path d="M${x} ${y}q6 -26 12 0q6 -20 12 0" fill="none"/>`)); // brins d'herbe
        const pos = [];
        byGen.forEach((row, g) => { const y = H - 520 - g * 230, n = row.length; row.forEach((p, i) => { const x = W / 2 + (i - (n - 1) / 2) * (W - 140) / Math.max(1, n); pos.push({p, g, x, y}); }); });
        pos.forEach(({g, x, y}, k) => { if (!g) return; const childIdx = Math.floor((k - (2 ** g - 1)) / 2), child = pos[(2 ** (g - 1) - 1) + childIdx]; if (child) s.push(`<path d="M${child.x} ${child.y - 40}C${child.x} ${(child.y + y) / 2} ${x} ${(child.y + y) / 2 + 40} ${x} ${y + 44}" fill="none" stroke-width="${10 - g * 2}"/>`); });
        pos.forEach(({p, g, x, y}, k) => {
            const r = g === 0 ? 70 : 64 - g * 6;
            s.push(leaf(x - r * 1.1, y + 6, r * 0.45, -50), leaf(x + r * 1.1, y + 6, r * 0.45, 50));
            s.push(`<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.72}"/>`);
            const nm = p ? (p.first || T.name(p)).split(' ')[0] : '…', ln = p ? (p.last || '') : '';
            s.push(`<text x="${x}" y="${y - 2}" font-size="${g === 0 ? 24 : 21 - g * 2}" text-anchor="middle" fill="#000" stroke="none" font-family="Georgia, serif">${T.esc(nm)}</text>`);
            s.push(`<text x="${x}" y="${y + 20}" font-size="${14 - g}" text-anchor="middle" fill="#000" stroke="none" font-family="Georgia, serif">${T.esc(ln.toUpperCase())}${p?.by ? ` · ${p.by}` : ''}</text>`);
            void k;
        });
        // des oiseaux et un soleil à colorier
        s.push(`<circle cx="120" cy="120" r="60"/>${[...Array(12)].map((_, i) => { const a = i * Math.PI / 6; return `<path d="M${120 + Math.cos(a) * 72} ${120 + Math.sin(a) * 72}L${120 + Math.cos(a) * 100} ${120 + Math.sin(a) * 100}" fill="none"/>`; }).join('')}`);
        [[930, 110], [1000, 170], [860, 190]].forEach(([x, y]) => s.push(`<path d="M${x - 26} ${y}q13 -16 26 0q13 -16 26 0" fill="none"/>`));
        s.push(`<text x="${W / 2}" y="${H - 20}" font-size="30" text-anchor="middle" fill="#000" stroke="none" font-family="Georgia, serif">L’arbre de ${T.esc(T.name(root))}</text>`);
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/><g fill="#fff" stroke="#000" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${s.join('')}</g></svg>`;
    }
    async function renderColoring(host, T) {
        const tr = await T.tree(), st = T.start(tr); if (!st) { host.innerHTML = '<p class="h-tr-muted">L’arbre est vide.</p>'; return; }
        host.innerHTML = `<form class="h-tr-panel h-tr-row h-tr-noprint" data-co><div style="min-width:260px"><span class="pk-lab">L’enfant (ou la personne) au pied de l’arbre</span>${T.personField('who', st.id)}</div><label>Générations<select name="g"><option>3</option><option selected>4</option></select></label><button class="button" type="submit">Dessiner</button><button type="button" class="button secondary" data-co-print>🖨 Imprimer</button><button type="button" class="button secondary" data-co-svg>⤓ SVG</button></form><div data-co-out style="max-width:720px"></div>`;
        const form = host.querySelector('[data-co]'), out = host.querySelector('[data-co-out]'); let svg = '';
        const draw = () => { svg = coloringSvg(T, tr, Number(form.elements.who.value) || st.id, Number(form.elements.g.value)); out.innerHTML = svg.replace('<svg ', '<svg class="h-tr-canvas" style="width:100%;height:auto" '); };
        form.addEventListener('submit', e => { e.preventDefault(); draw(); });
        host.querySelector('[data-co-print]').addEventListener('click', () => { draw(); printWindow('Arbre à colorier', '@page{size:A4;margin:8mm}.pg{background:#fff;width:190mm;margin:12px auto}.pg svg{width:100%;height:auto}', `<div class="pg">${svg}</div>`); });
        host.querySelector('[data-co-svg]').addEventListener('click', () => { draw(); T.download('arbre-a-colorier.svg', new Blob([svg], {type: 'image/svg+xml'})); });
        draw();
    }
    F.push({key: 'coloriage', group: 'jouer', icon: '🖍️', title: 'Arbre à colorier', desc: 'Un grand arbre en traits noirs avec les vrais ancêtres d’un enfant, des feuilles, un soleil et des oiseaux à colorier.', render: renderColoring});

    /* ── 📺 Le quiz du repas (mode télé) ── */
    /** des questions tirées de l'arbre : {q, options[], answer (indice), why} ; le même tirage pour la même graine */
    function quizQuestions(T, tr, n = 15, seed = Date.now()) {
        const R = T.rng(seed), pick = a => a[Math.floor(R() * a.length)], shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
        const ppl = tr.people.filter(p => p.first), fem = p => p.gender === 'female', e = (s, p) => s.replace(/·e/g, fem(p) ? 'e' : '');
        const places = [...new Set(ppl.map(p => T.place(tr, p.bplace)).filter(Boolean))], jobs = [...new Set(ppl.map(p => p.occ).filter(Boolean))];
        const opts = (good, pool, k = 4) => { const others = shuffle(pool.filter(x => x !== good)).slice(0, k - 1); if (!others.length) return null; const all = shuffle([good, ...others]); return {options: all, answer: all.indexOf(good)}; };
        const makers = [
            () => { const p = pick(ppl.filter(x => x.by)); if (!p) return null; const ys = new Set([p.by]); while (ys.size < 4) ys.add(p.by + (Math.floor(R() * 25) + 3) * (R() < 0.5 ? -1 : 1)); const o = opts(p.by, [...ys]); return o && {q: e(`En quelle année est né·e ${T.name(p)} ?`, p), ...o, why: T.story(tr, p)[0]}; },
            () => { const p = pick(ppl.filter(x => x.bplace)); if (!p || places.length < 2) return null; const o = opts(T.place(tr, p.bplace), places); return o && {q: e(`Où est né·e ${T.name(p)} ?`, p), ...o, why: T.story(tr, p)[0]}; },
            () => { const p = pick(ppl.filter(x => x.occ)); if (!p || jobs.length < 2) return null; const o = opts(p.occ, jobs); return o && {q: `Quel était le métier de ${T.name(p)} ?`, ...o, why: `${T.name(p)} était ${p.occ}.`}; },
            () => { const f = pick(tr.families.filter(x => x.a && x.b)); if (!f) return null; const a = tr.byId.get(f.a), b = tr.byId.get(f.b); if (!a || !b) return null;
                const pool = ppl.filter(x => x.gender === b.gender && x.id !== a.id).map(x => T.name(x)); const o = opts(T.name(b), pool); return o && {q: `Qui a épousé ${T.name(a)} ?`, ...o, why: `${T.name(a)} et ${T.name(b)} se sont mariés${f.my ? ` en ${f.my}` : ''}${f.mplace ? ` à ${T.place(tr, f.mplace)}` : ''}.`}; },
            () => { const p = pick(ppl.filter(x => x.father || x.mother)); if (!p) return null; const par = tr.byId.get(p.mother && R() < 0.5 ? p.mother : p.father || p.mother); if (!par) return null;
                const pool = ppl.filter(x => x.gender === par.gender && x.id !== p.id).map(x => T.name(x)); const o = opts(T.name(par), pool); return o && {q: `Qui est ${fem(par) ? 'la mère' : 'le père'} de ${T.name(p)} ?`, ...o, why: `${T.name(p)} est ${fem(p) ? 'la fille' : 'le fils'} de ${T.name(par)}.`}; },
            () => { const p = pick(ppl.filter(x => (tr.kids.get(x.id) || []).length)); if (!p) return null; const k = new Set(tr.kids.get(p.id)).size, nums = new Set([k]); while (nums.size < 4) nums.add(Math.max(0, k + Math.floor(R() * 7) - 3));
                const o = opts(k, [...nums]); return o && {q: `Combien d’enfants a eus ${T.name(p)} ?`, ...o, why: T.story(tr, p).find(s => /enfant/.test(s)) || ''}; },
            () => { const p = pick(ppl.filter(x => x.by && x.dy && x.dy - x.by > 3)); if (!p) return null; const a = T.ageAt(p, p.dd, p.dy), ages = new Set([a]); while (ages.size < 4) ages.add(Math.max(1, a + (Math.floor(R() * 15) + 2) * (R() < 0.5 ? -1 : 1)));
                const o = opts(a, [...ages]); return o && {q: `À quel âge est ${e('mort·e', p)} ${T.name(p)} ?`, ...o, why: T.story(tr, p).at(-1)}; },
            () => { const two = shuffle(ppl.filter(x => x.by)).slice(0, 2); if (two.length < 2 || two[0].by === two[1].by) return null; const old = two[0].by < two[1].by ? two[0] : two[1];
                return {q: 'Qui est né le premier ?', options: two.map(x => T.name(x)), answer: two.indexOf(old), why: `${T.name(two[0])} : ${two[0].by} ; ${T.name(two[1])} : ${two[1].by}.`}; }];
        const out = [], seen = new Set();
        for (let tries = 0; out.length < n && tries < n * 30; tries++) { const q = makers[Math.floor(R() * makers.length)](); if (q && q.options?.length >= 2 && !seen.has(q.q)) { seen.add(q.q); out.push(q); } }
        return out;
    }
    async function renderQuizTv(host, T) {
        const tr = await T.tree(), st = T.start(tr);
        host.innerHTML = `<form class="h-tr-panel" data-qz-form><div class="h-tr-row"><label style="flex:1;min-width:280px">Les équipes (séparées par des virgules)<input name="teams" value="Les ${T.esc(st?.last || 'Martin')}, Les cousins"></label>
            <label>Questions<input type="number" name="n" min="3" max="60" value="12" style="width:5em"></label><label>Secondes pour répondre<input type="number" name="sec" min="0" max="120" value="20" style="width:5em"></label>
            <button class="button" type="submit">📺 Lancer le quiz</button></div>
            <p class="h-tr-muted">Branche l’ordinateur sur la télé : la question et les quatre réponses s’affichent en grand ; à la fin du compte à rebours (ou avec <b>Entrée</b>), la bonne réponse apparaît, puis on donne le point à l’équipe qui a trouvé (touches <b>1</b> à <b>9</b>). Répondre depuis les téléphones demanderait que l’application soit joignable depuis tout le réseau de la maison : ce n’est pas possible pour l’instant, on joue devant l’écran.</p></form>
            <div data-qz-prev></div>`;
        const form = host.querySelector('[data-qz-form]');
        host.querySelector('[data-qz-prev]').innerHTML = `<h3>Un avant-goût</h3><ol>${quizQuestions(T, tr, 3, 7).map(q => `<li>${T.esc(q.q)}</li>`).join('')}</ol>`;
        form.addEventListener('submit', e => {
            e.preventDefault();
            const teams = form.elements.teams.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 9), qs = quizQuestions(T, tr, Number(form.elements.n.value) || 12), sec = Math.max(0, Number(form.elements.sec.value) || 0);
            if (!teams.length) return T.toast('Donne au moins une équipe.', 'error'); if (!qs.length) return T.toast('L’arbre est trop petit pour faire des questions.', 'error');
            const score = teams.map(() => 0), ov = document.createElement('div'); ov.className = 'h-tr-veillee h-tr-quiz'; document.body.appendChild(ov);
            let i = 0, shown = false, left = sec, timer = null, alive = true, given = false;
            const L = 'ABCDEFGH', close = () => { alive = false; clearInterval(timer); document.removeEventListener('keydown', key, true); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); ov.remove(); };
            const board = () => `<div class="h-tr-qz-score">${teams.map((t, k) => `<button type="button" data-qz-pt="${k}" ${shown && !given ? '' : 'disabled'}><small>${k + 1}</small> ${T.esc(t)} <b>${score[k]}</b></button>`).join('')}</div>`;
            const draw = () => {
                if (i >= qs.length) { const best = Math.max(...score), win = teams.filter((t, k) => score[k] === best);
                    ov.innerHTML = `<div class="h-tr-vl-slide"><div class="h-tr-vl-ini">🏆</div><h2>${win.length > 1 ? 'Égalité !' : `${T.esc(win[0])} gagne !`}</h2><ol class="h-tr-qz-final">${teams.map((t, k) => [t, score[k]]).sort((a, b) => b[1] - a[1]).map(([t, s]) => `<li>${T.esc(t)} — ${s} point${s > 1 ? 's' : ''}</li>`).join('')}</ol></div><div class="h-tr-vl-bar"><button type="button" data-qz="close">✕ Fermer</button></div>`; return; }
                const q = qs[i];
                ov.innerHTML = `<div class="h-tr-qz"><div class="h-tr-qz-top"><span>Question ${i + 1} / ${qs.length}</span>${sec && !shown ? `<b class="h-tr-qz-time">${left}</b>` : ''}</div><h2>${T.esc(q.q)}</h2>
                    <div class="h-tr-qz-opts">${q.options.map((o, k) => `<div class="h-tr-qz-opt ${shown ? (k === q.answer ? 'is-good' : 'is-bad') : ''}"><b>${L[k]}</b> ${T.esc(o)}</div>`).join('')}</div>
                    ${shown && q.why ? `<p class="h-tr-qz-why">${T.esc(q.why)}</p>` : ''}${board()}
                    <div class="h-tr-vl-bar">${shown ? `<button type="button" data-qz="next">Question suivante ▶</button>` : `<button type="button" data-qz="show">Voir la réponse (Entrée)</button>`}<button type="button" data-qz="close">✕ Fin</button></div></div>`;
            };
            const reveal = () => { clearInterval(timer); shown = true; given = false; draw(); };
            const next = () => { i++; shown = false; given = false; left = sec; draw(); clearInterval(timer); if (sec && i < qs.length) timer = setInterval(() => { left--; if (left <= 0) reveal(); else { const t = ov.querySelector('.h-tr-qz-time'); if (t) t.textContent = left; } }, 1000); };
            const point = k => { if (!shown || given || k < 0 || k >= teams.length) return; score[k]++; given = true; draw(); };
            const key = ev => { if (!alive) return; if (ev.key === 'Escape') { ev.preventDefault(); close(); } else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (i >= qs.length) close(); else if (shown) next(); else reveal(); } else if (/^[1-9]$/.test(ev.key)) point(Number(ev.key) - 1); };
            document.addEventListener('keydown', key, true);
            ov.addEventListener('click', ev => { const b = ev.target.closest('[data-qz],[data-qz-pt]'); if (!b) return; if (b.dataset.qzPt != null) return point(Number(b.dataset.qzPt)); ({close, show: reveal, next})[b.dataset.qz]?.(); });
            ov.requestFullscreen?.().catch(() => {}); i = -1; next();
        });
    }
    F.push({key: 'quiz-tv', group: 'jouer', icon: '📺', title: 'Le quiz du repas', desc: 'Sur la télé, en équipes : des questions tirées de l’arbre (qui a épousé qui, où, quel métier), compte à rebours et scores.', render: renderQuizTv});
    ext.tresorQuiz = {quizQuestions};
})();
