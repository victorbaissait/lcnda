/* LCNDA — 📊 Diagrammes « de famille » D1 à D8 (ajoutés au catalogue de heritage-diagrams-render.js) :
 *  Frises : 🤝 qui a connu qui (vies superposées sur plusieurs générations, chevauchements racontés),
 *           📅 mois des mariages et des conceptions (Carême, Avent), 👶 espacement des naissances (par mère),
 *           🏘️ frise des lieux de vie (une bande par personne, colorée par commune) ;
 *  Généalogie : 🔀 métiers de père en fils (flux sur 3 à 5 générations), 💍 rayon des mariages (cercles autour du village),
 *           🧮 implexe (ancêtres théoriques, places trouvées, personnes différentes) ; Chiffres : 📉 courbe de survie.
 * Chaque sorte : {icon, label, group, help, render(spec, W, fs) → {h, svg, legend, desc}, grids, options, sample, fromApp, fromPeople?}.
 * Données de l'arbre : api.php?action=diagram_famille (lib/diagram_famille.php). Un clic sur un élément relié à des
 * personnes ouvre la fiche (data-dfa-pid) ou la liste des personnes concernées (data-dfa-pids).
 * Tout texte passe par esc() ; couleurs vérifiées (R.color) ; tailles et nombres bornés.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const R = ext.diagramRender; if (!R?.KINDS) return;
    const A = () => window.LCNDA_APP;
    const K = R.KINDS;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const num = v => (typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : R.num(v)), color = R.color;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
    const r2 = v => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
    const NF = [0, 1, 2].map(d => new Intl.NumberFormat('fr-FR', {maximumFractionDigits: d}));
    const fmt = (n, d = 1) => NF[clamp(d, 0, 2)].format(Number(n) || 0);
    const NOW = new Date().getFullYear() + new Date().getMonth() / 12;
    const pal = spec => R.PALETTES[spec.o?.palette] || R.PALETTES.vive;
    const pick = (spec, i, c) => color(c, pal(spec)[((i % pal(spec).length) + pal(spec).length) % pal(spec).length]);
    const textW = (s, fs) => [...String(s ?? '')].reduce((w, ch) => w + (/[ilI.,:;'!|]/.test(ch) ? .28 : /[mwMW@]/.test(ch) ? .85 : /[A-Z]/.test(ch) ? .66 : /\s/.test(ch) ? .3 : .55), 0) * fs;
    const cut = (s, max, fs) => { s = String(s ?? ''); if (textW(s, fs) <= max) return s; while (s.length > 1 && textW(s + '…', fs) > max) s = s.slice(0, -1); return s.length > 1 ? s + '…' : ''; };
    const wrap = (s, max, fs, maxLines = 4) => { const out = []; let cur = ''; for (const w of String(s ?? '').split(/\s+/)) { const t = cur ? cur + ' ' + w : w; if (textW(t, fs) > max && cur) { out.push(cur); cur = w; } else cur = t; } if (cur) out.push(cur); return out.length > maxLines ? [...out.slice(0, maxLines - 1), cut(out.slice(maxLines - 1).join(' '), max, fs)] : out; };
    const T = (x, y, s, {size = 12, anchor = 'start', weight = 400, fill = 'currentColor', rotate = 0, baseline = 'middle', style = '', op = 0, halo = ''} = {}) =>
        `<text x="${r2(x)}" y="${r2(y)}" font-size="${r2(size)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-weight="${weight}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}${rotate ? ` transform="rotate(${r2(rotate)} ${r2(x)} ${r2(y)})"` : ''}${style ? ` font-style="${style}"` : ''}${halo ? ` stroke="${halo}" stroke-width="${r2(size / 4)}" stroke-linejoin="round" paint-order="stroke"` : ''}>${esc(s)}</text>`;
    const tip = s => `<title>${esc(s)}</title>`;
    const rgb = c => { const m = String(c).match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return null; let h = m[1]; if (h.length === 3) h = h.replace(/./g, x => x + x); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
    const hex = a => '#' + a.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
    const mix = (c1, c2, t) => { const a = rgb(c1), b = rgb(c2); if (!a || !b) return t < .5 ? c1 : c2; return hex(a.map((v, i) => v + (b[i] - v) * clamp(t, 0, 1))); };
    const contrast = c => { const a = rgb(c); if (!a) return '#1d1d1f'; return (a[0] * 299 + a[1] * 587 + a[2] * 114) / 1000 > 150 ? '#1d1d1f' : '#ffffff'; };
    const rows = (spec, key = 'rows', max = 30000) => (Array.isArray(spec[key]) ? spec[key] : []).filter(r => r && typeof r === 'object').slice(0, max);
    const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
    const C = (k, label, type = 'text', extra = {}) => ({k, label, type, ...extra});
    const empty = (W, fs, msg) => ({h: 60, svg: T(W / 2, 30, msg, {anchor: 'middle', size: fs, fill: '#888'}), legend: [], desc: msg});
    const when = v => { const t = String(v ?? '').replace(/-00\b/g, '').trim(); if (!t) return null; const y = R.when(t, false); return y === null || !Number.isFinite(y) || y < -3000 || y > 3000 ? null : y; };
    const yearOf = v => { const y = when(v); return y === null ? null : Math.floor(y + 1e-9); };
    const pid = v => { const n = Math.floor(num(v)); return n > 0 && n < 1e9 ? n : 0; };
    const pids = v => String(v ?? '').split(',').map(x => pid(x)).filter(Boolean).slice(0, 400);
    const H_OPT = C('height', 'Hauteur au plus', 'number', {unit: 'px', min: 120, max: 3000});
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const sexOf = v => { const t = fold(v).trim(); return /^(h|m|homme|male|masculin|garcon|fils|♂)/.test(t) ? 'h' : /^(f|femme|female|feminin|fille|♀)/.test(t) ? 'f' : ''; };
    const SEX = {h: ['Homme', '#4e79a7'], f: ['Femme', '#e15759'], '': ['Sexe inconnu', '#9aa3ad']};
    const plural = (n, one, many = one + 's') => `${fmt(n, 0)} ${Math.abs(n) >= 2 ? many : one}`;
    const roman = n => { let s = '', x = n; for (const [a, b] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (x >= a) { s += b; x -= a; } return s; };
    const centuryOf = y => (y > 0 ? `${roman(Math.floor((y - 1) / 100) + 1)}e s.` : '');
    const centuryRank = g => { const m = String(g).match(/^([IVXLCDM]+)e/); if (!m) return null; let v = 0, last = 0; for (const ch of [...m[1]].reverse()) { const x = {I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000}[ch]; v += x < last ? -x : x; last = Math.max(last, x); } return v; };
    /** les années en bas : traits légers et nombres */
    function yearAxis(from, to, X, y0, h, fs, W) {
        const tk = R.ticks(from, to, clamp(Math.round(W / 80), 2, 24)); let s = '';
        tk.ticks.filter(v => v >= from - 1e-9 && v <= to + 1e-9).forEach(v => { const x = X(v); s += `<line x1="${r2(x)}" y1="${r2(y0)}" x2="${r2(x)}" y2="${r2(y0 + h)}" stroke="currentColor" stroke-opacity=".12"/>` + T(x, y0 + h + fs * .9, String(Math.round(v * 100) / 100), {size: fs * .85, anchor: 'middle'}); });
        return s;
    }
    const catColors = (spec, key = 'cats') => new Map(rows(spec, key, 200).filter(c => str(c.value)).map(c => [fold(str(c.value)), color(c.color, '')]).filter(([, c]) => c));
    const PIDS = (list, title) => (list.length ? ` data-dfa-pids="${list.slice(0, 400).join(',')}" data-dfa-t="${esc(title)}" style="cursor:pointer"` : '');
    const PID = id => (id ? ` data-dfa-pid="${id}" style="cursor:pointer"` : '');

    /* ═════════ Les liens de parenté en mots ═════════ */
    const UP = [['', '', ''], ['père', 'mère', 'parent'], ['grand-père', 'grand-mère', 'grand-parent']];
    const DOWN = [['', '', ''], ['fils', 'fille', 'enfant'], ['petit-fils', 'petite-fille', 'petit-enfant']];
    const sx = s => (s === 'h' ? 0 : s === 'f' ? 1 : 2);
    function relWord(k, sex, up) { // k générations au-dessus (up) ou en dessous
        const base = up ? UP : DOWN, i = sx(sex);
        if (k <= 0) return 'personne de départ';
        if (k <= 2) return base[k][i];
        if (k <= 5) return 'arrière-'.repeat(k - 2) + base[2][i];
        return up ? `ancêtre (${k} générations)` : `descendant${i === 1 ? 'e' : ''} (${k} générations)`;
    }
    const possessive = (word, sex, p = 't') => (/^[aeiouéèêh]/i.test(word) ? `${p}on ${word}` : `${p}${sex === 'f' ? 'a' : 'on'} ${word}`);
    const genName = g => { const k = Math.abs(g); if (!g) return 'Personne de départ'; if (k === 1) return g < 0 ? 'Parents' : 'Enfants'; if (k === 2) return g < 0 ? 'Grands-parents' : 'Petits-enfants'; if (k <= 5) return 'Arrière-' + 'arrière-'.repeat(k - 3) + (g < 0 ? 'grands-parents' : 'petits-enfants'); return `${k} générations ${g < 0 ? 'au-dessus' : 'en dessous'}`; };

    /* ═════════ D1 🤝 Qui a connu qui ═════════ */
    function knownPeople(spec) {
        const o = spec.o || {}, guess = clamp(num(o.guessLife), 0, 110);
        const list = rows(spec, 'rows', 1500).map((r, i) => {
            const a = when(r.start); if (a === null) return null;
            const living = /^(1|oui|yes|vivant|vivante|true)$/i.test(str(r.living)), e = when(r.end);
            let b = e !== null ? e : living ? NOW : null, guessed = false;
            if (b === null && guess > 0) { b = Math.min(NOW, a + guess); guessed = true; }
            if (b !== null && b < a) b = a;
            return {i, name: str(r.name, 120) || `Personne ${i + 1}`, sex: sexOf(r.sex), gen: Math.round(clamp(num(r.gen), -30, 30)), a, b, living, guessed, pid: pid(r.pid), link: pid(r.link), up: str(r.up, 120)};
        }).filter(Boolean);
        // le lien vers la personne de départ : par numéro de fiche (depuis l'app) ou par nom (colonne « Vers »)
        const byPid = new Map(list.filter(p => p.pid).map(p => [p.pid, p])), byName = new Map(list.map(p => [fold(p.name), p]));
        list.forEach(p => { p.next = (p.link && byPid.get(p.link)) || (p.up && byName.get(fold(p.up))) || null; if (p.next === p) p.next = null; });
        const chain = p => { const out = []; let x = p.next, n = 0; while (x && n++ < 40) { out.push(x); x = x.next; } return out; };
        list.forEach(p => { p.path = chain(p); });
        const hasLinks = list.some(p => p.next);
        /** a est-il un ancêtre de b (dans les personnes du dessin) ? null : on ne sait pas (pas de liens) */
        const isAnc = (a, b) => {
            if (a.gen >= b.gen) return false;
            if (!hasLinks) return null;
            if (b.gen <= 0) return a.path.includes(b); // a (ancêtre) descend vers la personne de départ en passant par b
            if (a.gen >= 0) return b.path.includes(a); // b (descendant) remonte vers la personne de départ en passant par a
            const root = a.path.find(x => x.gen === 0); return !!root && b.path.includes(root);
        };
        return {list, isAnc, hasLinks};
    }
    function known(spec, W, fs) {
        const o = spec.o || {}, {list, isAnc, hasLinks} = knownPeople(spec);
        if (!list.length) return empty(W, fs, 'Ajoute des personnes : un nom, la naissance, le décès et la génération (0 = toi, −1 = parents, 1 = enfants…).');
        const order = o.order === 'birth' ? [...list].sort((x, y) => x.a - y.a) : [...list].sort((x, y) => x.gen - y.gen || x.a - y.a);
        const from = num(o.from) || Math.floor(Math.min(...list.map(p => p.a)) / 10) * 10, to = num(o.to) || Math.ceil(Math.min(NOW, Math.max(...list.map(p => p.b ?? p.a + 5))) / 10) * 10;
        const gens = [...new Set(list.map(p => p.gen))].sort((a, b) => a - b), gi = new Map(gens.map((g, i) => [g, i]));
        const colOf = p => (o.colorBy === 'sex' ? SEX[p.sex][1] : pick(spec, gi.get(p.gen)));
        const bh = clamp(num(o.barH) || fs * 1.5, 6, 60), gap = Math.max(2, bh * .28), names = o.names !== false;
        const labW = names ? Math.min(W * .34, Math.max(...order.map(p => textW(p.name, fs * .85))) + 10) : 0, pw = Math.max(60, W - labW - 8);
        const X = y => labW + (clamp(y, from, to) - from) / Math.max(1e-6, to - from) * pw;
        // les couples ancêtre → descendant qui se sont connus
        const minGap = clamp(Math.round(num(o.minGap) || 2), 1, 10), nPairs = clamp(Math.round(o.pairs === '' || o.pairs == null ? 5 : num(o.pairs)), 0, 12);
        const pairs = [];
        if (nPairs) for (const a of list) { if (a.b === null || a.guessed) continue; for (const b of list) { if (b === a || b.gen - a.gen < minGap) continue; const anc = isAnc(a, b); if (anc === false) continue; const ov = Math.min(a.b, b.b ?? a.b) - b.a; if (ov <= 0) continue; pairs.push({a, b, k: b.gen - a.gen, ov, anc}); if (pairs.length > 20000) break; } }
        pairs.sort((x, y) => y.k - x.k || y.ov - x.ov);
        const shown = []; const usedB = new Map();
        for (const p of pairs) { if (shown.length >= nPairs) break; if ((usedB.get(p.b) || 0) >= 2) continue; usedB.set(p.b, (usedB.get(p.b) || 0) + 1); shown.push(p); }
        // les années où le plus de générations vivaient en même temps
        let band = null;
        if (o.band !== false) {
            const lo = Math.floor(from), hi = Math.ceil(to), cnt = [];
            for (let y = lo; y <= hi && y - lo < 3000; y++) { const g = new Set(); for (const p of list) if (p.b !== null && p.a <= y + .999 && p.b >= y) g.add(p.gen); cnt.push(g.size); }
            const mx = Math.max(0, ...cnt);
            if (mx >= 3) { let best = null, s = -1; for (let i = 0; i <= cnt.length; i++) { if (cnt[i] === mx) { if (s < 0) s = i; } else if (s >= 0) { if (!best || i - s > best[1] - best[0]) best = [s, i]; s = -1; } } band = {n: mx, a: lo + best[0], b: lo + best[1]}; }
        }
        const H0 = order.length * (bh + gap) + (o.order === 'birth' ? 0 : (gens.length - 1) * gap * 2);
        let svg = '', y = 0, prevGen = null;
        if (band) svg += `<rect x="${r2(X(band.a))}" y="0" width="${r2(Math.max(2, X(band.b) - X(band.a)))}" height="${r2(H0)}" fill="#f2c94c" fill-opacity=".22"><title>${esc(`${band.n} générations en vie en même temps : ${band.a} – ${band.b - 1}`)}</title></rect>`;
        svg += yearAxis(from, to, X, 0, H0, fs, pw);
        const yOf = new Map();
        for (const p of order) {
            if (o.order !== 'birth' && prevGen !== null && p.gen !== prevGen) { y += gap * 2; svg += `<line x1="0" y1="${r2(y - gap * 1.4)}" x2="${r2(labW + pw)}" y2="${r2(y - gap * 1.4)}" stroke="currentColor" stroke-opacity=".12"/>`; }
            prevGen = p.gen; yOf.set(p, y);
            const c = colOf(p), x0 = X(p.a), x1 = p.b !== null ? X(p.b) : Math.min(X(p.a) + 14, labW + pw), rel = hasLinks || list.some(q => q.gen === 0) ? relWord(Math.abs(p.gen), p.sex, p.gen < 0) : '';
            const age = p.b !== null ? Math.floor(p.b - p.a) : null, yy = y;
            const label = `${p.name}${rel && p.gen ? ` — ${rel}` : ''} · ° ${Math.floor(p.a)}${p.living ? ' (en vie)' : p.b !== null && !p.guessed ? ` † ${Math.floor(p.b)}` : ' † ?'}${age !== null && !p.guessed ? ` · ${age} ans` : ''}`;
            svg += `<g${PID(p.pid)} data-dfa-bar="${p.i}">`;
            if (p.b === null || p.guessed) svg += `<rect x="${r2(x0)}" y="${r2(yy)}" width="${r2(Math.max(3, x1 - x0))}" height="${r2(bh)}" rx="${r2(Math.min(4, bh / 3))}" fill="${c}" fill-opacity=".25" stroke="${c}" stroke-dasharray="3 2">${tip(label + (p.guessed ? ' (décès inconnu : vie supposée)' : ' (décès inconnu)'))}</rect>`;
            else svg += `<rect x="${r2(x0)}" y="${r2(yy)}" width="${r2(Math.max(2, x1 - x0))}" height="${r2(bh)}" rx="${r2(Math.min(4, bh / 3))}" fill="${c}">${tip(label)}</rect>${p.living ? `<path d="M${r2(x1)} ${r2(yy)}l${r2(bh * .45)} ${r2(bh / 2)}l${r2(-bh * .45)} ${r2(bh / 2)}z" fill="${c}"/>` : ''}`;
            if (names) svg += T(labW - 6, yy + bh / 2, cut(p.name, labW - 8, fs * .85), {size: fs * .85, anchor: 'end', weight: p.gen === 0 ? 700 : 400});
            if (o.ages !== false && age !== null && !p.guessed && x1 - x0 > fs * 2.4 && bh >= fs * .8) svg += T(x0 + 4, yy + bh / 2, `${age} ans`, {size: Math.min(fs * .75, bh * .7), fill: contrast(c)});
            svg += '</g>';
            y += bh + gap;
        }
        // les chevauchements choisis : numéro sur la barre du plus jeune, trait pointillé entre les deux
        const sentences = [];
        shown.forEach((p, n) => {
            const ya = yOf.get(p.a), yb = yOf.get(p.b), xa = X(p.b.a), xb = X(Math.min(p.a.b, p.b.b ?? p.a.b)), xm = (xa + xb) / 2, num1 = String(n + 1);
            const rA = list.some(q => q.gen === 0) ? relWord(Math.abs(p.a.gen), p.a.sex, p.a.gen < 0) : '', pair = p.anc ? relWord(p.k, p.b.sex, false) : '';
            const yrs = Math.max(1, Math.round(p.ov)), period = `${Math.floor(p.b.a)} – ${Math.floor(Math.min(p.a.b, p.b.b ?? p.a.b))}`;
            const who = rA && p.a.gen < 0 ? `${p.a.name} (${possessive(rA, p.a.sex)})` : p.a.name;
            const text = `${num1}. ${who} a connu ${pair ? possessive(pair, p.b.sex, 's') + ' ' : ''}${p.b.name}${pair ? '' : ` (${p.k} générations plus tard)`} pendant ${plural(yrs, 'an')} (${period}).`;
            sentences.push(text);
            for (const yy of [ya, yb]) svg += `<rect x="${r2(xa)}" y="${r2(yy - 1)}" width="${r2(Math.max(2, xb - xa))}" height="${r2(bh + 2)}" fill="none" stroke="#1d1d1f" stroke-width="1.6" rx="2">${tip(text)}</rect>`;
            svg += `<line x1="${r2(xm)}" y1="${r2(Math.min(ya, yb) + bh)}" x2="${r2(xm)}" y2="${r2(Math.max(ya, yb))}" stroke="#1d1d1f" stroke-opacity=".55" stroke-dasharray="2 3">${tip(text)}</line>`;
            const rr = Math.max(fs * .55, 6);
            svg += `<g>${tip(text)}<circle cx="${r2(xm)}" cy="${r2(yb + bh / 2)}" r="${r2(rr)}" fill="#1d1d1f" stroke="#fff" stroke-width="1.2"/>${T(xm, yb + bh / 2, num1, {size: rr * 1.2, anchor: 'middle', weight: 700, fill: '#fff'})}</g>`;
        });
        let h = H0 + fs * 2;
        if (band) { svg += T(labW + pw / 2, h + fs * .4, `🟨 ${band.n} générations en vie en même temps : ${band.a} – ${band.b - 1}`, {size: fs * .9, anchor: 'middle', weight: 600}); h += fs * 1.6; }
        sentences.forEach(s => { wrap(s, W - 4, fs * .9).forEach(line => { svg += T(2, h + fs * .5, line, {size: fs * .9}); h += fs * 1.3; }); h += fs * .25; });
        if (!sentences.length && nPairs && list.length > 1) { svg += T(2, h + fs * .5, `Personne de ces vies ne se chevauche sur ${minGap} générations ou plus.`, {size: fs * .85, fill: '#777', style: 'italic'}); h += fs * 1.4; }
        const legend = o.colorBy === 'sex' ? ['h', 'f', ''].filter(k => list.some(p => p.sex === k)).map(k => ({label: SEX[k][0], color: SEX[k][1]})) : gens.slice(0, 16).map(g => ({label: list.some(p => p.gen === 0) || hasLinks ? genName(g) : `Génération ${g}`, color: pick(spec, gi.get(g))}));
        return {h, svg, legend, desc: `Qui a connu qui : ${list.length} vies sur ${gens.length} générations ; ${sentences.length} rencontre${sentences.length > 1 ? 's' : ''} racontée${sentences.length > 1 ? 's' : ''}.`};
    }
    const sampleKnown = () => ({o: {title: 'Qui a connu qui dans la famille', pairs: 4}, rows: [
        ['Joseph MARTIN', 'h', -3, '1895', '1960', 'Jean MARTIN'], ['Jeanne ROUX', 'f', -3, '1899', '1991', 'Jean MARTIN'], ['Henri LEROY', 'h', -3, '1900', '1944', 'Marie LEROY'], ['Élise GIRARD', 'f', -3, '1904', '1999', 'Marie LEROY'],
        ['Jean MARTIN', 'h', -2, '1925', '1998', 'Pierre MARTIN'], ['Marie LEROY', 'f', -2, '1928', '2016', 'Pierre MARTIN'], ['Louis DURAND', 'h', -2, '1930', '1985', 'Anne DURAND'], ['Rose PETIT', 'f', -2, '1932', '2021', 'Anne DURAND'],
        ['Pierre MARTIN', 'h', -1, '1955', '2019', 'Lucas MARTIN'], ['Anne DURAND', 'f', -1, '1958', '', 'Lucas MARTIN', '1'], ['Lucas MARTIN', 'h', 0, '1985', '', '', '1'], ['Emma MARTIN', 'f', 1, '2012', '', 'Lucas MARTIN', '1'], ['Tom MARTIN', 'h', 1, '2015', '', 'Lucas MARTIN', '1'],
    ].map(([name, sex, gen, start, end, up, living]) => ({name, sex, gen: String(gen), start, end, up, living: living || ''}))});

    /* ═════════ D2 📉 Courbe de survie (Kaplan-Meier : les vivants comptent jusqu'à l'âge atteint) ═════════ */
    function survivalCurves(spec) {
        const o = spec.o || {}, withLiving = o.living !== false;
        const groups = new Map();
        for (const r of rows(spec, 'rows', 60000)) {
            const age = num(r.age); if (!(age >= 0 && age <= 125) || str(r.age) === '') continue;
            const dead = !/^(0|non|no|vivant|vivante|en vie|false)$/i.test(str(r.dead)); if (!dead && !withLiving) continue;
            const g = str(r.group, 80) || 'Tous'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push({age, dead, pid: pid(r.id)});
        }
        let names = [...groups.keys()];
        if (names.every(g => centuryRank(g) !== null)) names.sort((a, b) => centuryRank(a) - centuryRank(b));
        else if (o.sort === 'az') names.sort((a, b) => a.localeCompare(b, 'fr'));
        else if (o.sort !== 'given') names.sort((a, b) => groups.get(b).length - groups.get(a).length);
        names = names.slice(0, 12);
        return names.map(g => {
            const list = groups.get(g).sort((a, b) => a.age - b.age), n = list.length, steps = [[0, 1]];
            let atRisk = n, S = 1, i = 0;
            while (i < n) { const t = list[i].age; let d = 0, c = 0; while (i < n && list[i].age === t) { if (list[i].dead) d++; else c++; i++; } if (d && atRisk > 0) { S *= 1 - d / atRisk; steps.push([t, S]); } atRisk -= d + c; }
            const at = a => { let s = 1; for (const [t, v] of steps) { if (t <= a) s = v; else break; } return s; };
            const med = steps.find(([, v]) => v <= .5)?.[0] ?? null;
            return {name: g, n, dead: list.filter(x => x.dead).length, steps, at, med, list, maxAge: list[n - 1]?.age || 0};
        });
    }
    function survival(spec, W, fs) {
        const o = spec.o || {}, curves = survivalCurves(spec);
        if (!curves.length) return empty(W, fs, 'Ajoute des lignes : un groupe (siècle, sexe, branche…), un âge, et « décédé » ou « encore en vie ».');
        const cmap = catColors(spec), colOf = (c, i) => cmap.get(fold(c.name)) || pick(spec, i);
        const maxAge = clamp(num(o.maxAge) || Math.min(110, Math.ceil(Math.max(...curves.map(c => c.maxAge), 10) / 10) * 10), 5, 125);
        const left = fs * 3.2, H = clamp(num(o.height) || Math.round(Math.min(W * .58, 520)), 160, 2400), ph = H - fs * 2.6, pw = Math.max(60, W - left - 8);
        const X = a => left + clamp(a, 0, maxAge) / maxAge * pw, Y = s => ph * (1 - clamp(s, 0, 1));
        let svg = '';
        for (let p = 0; p <= 100; p += 25) svg += `<line x1="${r2(left)}" y1="${r2(Y(p / 100))}" x2="${r2(left + pw)}" y2="${r2(Y(p / 100))}" stroke="currentColor" stroke-opacity="${p === 50 ? .3 : .1}"${p === 50 ? ' stroke-dasharray="4 3"' : ''}/>` + T(left - 5, Y(p / 100), `${p} %`, {size: fs * .8, anchor: 'end'});
        const tk = R.ticks(0, maxAge, clamp(Math.round(pw / 70), 2, 14));
        tk.ticks.filter(v => v <= maxAge).forEach(v => { svg += `<line x1="${r2(X(v))}" y1="0" x2="${r2(X(v))}" y2="${r2(ph)}" stroke="currentColor" stroke-opacity=".08"/>` + T(X(v), ph + fs * .9, `${v}`, {size: fs * .8, anchor: 'middle'}); });
        svg += T(left + pw / 2, ph + fs * 2, 'Âge (ans)', {size: fs * .85, anchor: 'middle', fill: '#666'});
        const mark = str(o.markAge) !== '' ? clamp(num(o.markAge), 0, maxAge) : null;
        if (mark !== null) svg += `<line x1="${r2(X(mark))}" y1="0" x2="${r2(X(mark))}" y2="${r2(ph)}" stroke="#1d1d1f" stroke-opacity=".5" stroke-dasharray="3 3"/>` + T(X(mark) + 4, fs * .6, `à ${fmt(mark, 0)} ans`, {size: fs * .8, weight: 600});
        const sw = clamp(num(o.lineWidth) || 2.4, .5, 8), step = clamp(Math.round(num(o.hoverStep) || 5), 1, 25);
        curves.forEach((c, i) => {
            const col = colOf(c, i); let d = `M${r2(X(0))} ${r2(Y(1))}`;
            for (const [t, v] of c.steps.slice(1)) { if (t > maxAge) break; d += o.smooth ? `L${r2(X(t))} ${r2(Y(v))}` : `H${r2(X(t))}V${r2(Y(v))}`; }
            d += `H${r2(X(Math.min(maxAge, c.maxAge)))}`;
            svg += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${r2(sw)}" stroke-linejoin="round" data-dfa-curve="${i}">${tip(`${c.name} : ${plural(c.n, 'personne')}${c.med !== null ? ` · médiane ${fmt(c.med, 0)} ans` : ''}`)}</path>`;
            if (o.median !== false && c.med !== null && c.med <= maxAge) svg += `<line x1="${r2(X(c.med))}" y1="${r2(Y(.5))}" x2="${r2(X(c.med))}" y2="${r2(ph)}" stroke="${col}" stroke-width="1.2" stroke-dasharray="2 2"/><circle cx="${r2(X(c.med))}" cy="${r2(Y(.5))}" r="${r2(sw * 1.4)}" fill="${col}">${tip(`${c.name} : la moitié a passé ${fmt(c.med, 0)} ans`)}</circle>`;
            if (mark !== null) { const v = c.at(mark); svg += `<circle cx="${r2(X(mark))}" cy="${r2(Y(v))}" r="${r2(sw * 1.5)}" fill="#fff" stroke="${col}" stroke-width="2"/>` + T(X(mark) + 6, Y(v) - fs * .55, `${fmt(v * 100, 0)} %`, {size: fs * .8, weight: 700, fill: col, halo: '#ffffff'}); }
            // les bulles au survol (et un clic : les personnes mortes à cet âge)
            for (let a = 0; a < Math.min(maxAge, c.maxAge + step); a += step) {
                const v = c.at(a), who = c.list.filter(x => x.dead && x.age >= a && x.age < a + step && x.pid).map(x => x.pid);
                const t = `${c.name} : ${fmt(v * 100, 0)} % encore en vie à ${a} ans (${plural(c.n, 'personne')}) · ${plural(c.list.filter(x => x.dead && x.age >= a && x.age < a + step).length, 'décès')} entre ${a} et ${a + step - 1} ans`;
                svg += `<circle cx="${r2(X(a))}" cy="${r2(Y(v))}" r="${r2(Math.max(5, sw * 2))}" fill="${col}" fill-opacity="0"${PIDS(who, `${c.name} : morts entre ${a} et ${a + step - 1} ans`)}>${tip(t)}</circle>`;
            }
        });
        const legend = curves.map((c, i) => ({label: `${c.name} (${plural(c.n, 'personne')}${c.med !== null && o.median !== false ? ` · médiane ${fmt(c.med, 0)} ans` : ''})`, color: colOf(c, i), type: 'line', width: 3}));
        return {h: ph + fs * 2.6, svg, legend, desc: `Courbe de survie : ${curves.reduce((a, c) => a + c.n, 0)} personnes en ${curves.length} groupe${curves.length > 1 ? 's' : ''}.`};
    }
    function sampleSurvival() {
        const out = []; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        [['XVIIIe s.', .32, 52], ['XIXe s.', .2, 62], ['XXe s.', .05, 76]].forEach(([g, infant, mean]) => {
            for (let i = 0; i < 90; i++) { const r = rnd(); const age = r < infant ? Math.floor(rnd() * 5) : Math.max(5, Math.round(mean + (rnd() + rnd() + rnd() - 1.5) * 34)); out.push({group: g, age: String(Math.min(age, 102)), dead: g === 'XXe s.' && i % 9 === 0 ? '0' : '1'}); }
        });
        return out;
    }
    // l'Éditeur de graphiques : une liste de personnes (naissance, décès) → les âges
    const survivalFromPeople = (people, cell, spec) => {
        const by = spec.o?.groupBy || 'century', out = [];
        for (const r of people.slice(0, 30000)) {
            const b = yearOf(cell(r, 'birth')), d = yearOf(cell(r, 'death')); if (b === null || d === null) continue;
            const age = d - b; if (age < 0 || age > 125) continue;
            const g = by === 'sex' ? (SEX[sexOf(cell(r, 'gender'))][0] + 's').replace('Sexe inconnus', 'Sexe inconnu') : centuryOf(b);
            out.push({group: g, age: String(age), dead: '1'});
        }
        if (!out.length) return {html: '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📉</span><span class="empty-line-text">Aucune personne de la liste n’a une date de naissance et une date de décès.</span></p>'};
        return {rows: out};
    };

    /* ═════════ D3 🔀 Métiers de père en fils (flux en colonnes) ═════════ */
    const COLNAMES = ['Trisaïeul', 'Arrière-grand-père', 'Grand-père', 'Père', 'Fils'];
    function occPaths(spec) {
        const o = spec.o || {}, unknown = str(o.unknown, 40) || 'Inconnu', list = [];
        let n = 0;
        for (const r of rows(spec, 'rows', 20000)) { const jobs = [1, 2, 3, 4, 5].map(i => str(r['g' + i], 60)); let last = 4; while (last >= 0 && !jobs[last]) last--; n = Math.max(n, last + 1); list.push({jobs, v: Math.max(0, num(r.value) || 1)}); }
        n = clamp(n, 2, 5);
        const paths = list.map(p => ({jobs: p.jobs.slice(0, n).map(j => j || unknown), v: p.v})).filter(p => p.v > 0 && p.jobs.filter(j => j !== unknown).length >= 1);
        const tot = new Map(); paths.forEach(p => p.jobs.forEach(j => tot.set(j, (tot.get(j) || 0) + p.v)));
        const top = clamp(Math.round(num(o.top) || 7), 2, 20), other = 'Autres métiers';
        const keep = new Set([...tot.entries()].filter(([j]) => j !== unknown).sort((a, b) => b[1] - a[1]).slice(0, top).map(([j]) => j));
        let ps = paths.map(p => ({jobs: p.jobs.map(j => (j === unknown ? unknown : keep.has(j) ? j : other)), v: p.v}));
        if (o.hideUnknown) ps = ps.filter(p => !p.jobs.includes(unknown));
        const order = [...keep].sort((a, b) => tot.get(b) - tot.get(a)); if (ps.some(p => p.jobs.includes(other))) order.push(other); if (ps.some(p => p.jobs.includes(unknown))) order.push(unknown);
        return {n, paths: ps, order, unknown, other};
    }
    function occflow(spec, W, fs) {
        const o = spec.o || {}, {n, paths, order, unknown, other} = occPaths(spec);
        if (!paths.length) return empty(W, fs, 'Ajoute des lignées : le métier de l’ancêtre, puis de son fils, de son petit-fils… et combien de fois.');
        const cmap = catColors(spec), colJob = j => cmap.get(fold(j)) || (j === unknown ? '#c4c9d0' : j === other ? '#9aa3ad' : pick(spec, order.indexOf(j)));
        const names = str(o.colNames) ? str(o.colNames, 300).split(',').map(s => s.trim()).filter(Boolean) : COLNAMES.slice(5 - n);
        const H = clamp(num(o.height) || Math.round(Math.max(260, Math.min(W * .62, 640))), 160, 3000), top = fs * 2.2, ph = H - top;
        const nodeW = clamp(num(o.nodeW) || 14, 4, 40), gapPx = clamp(num(o.gap) || 8, 0, 40), colX = i => (W - nodeW) * i / (n - 1);
        // les cases de chaque colonne et les flux entre colonnes voisines
        const col = Array.from({length: n}, () => new Map()), flows = Array.from({length: n - 1}, () => new Map());
        paths.forEach(p => { p.jobs.forEach((j, i) => col[i].set(j, (col[i].get(j) || 0) + p.v)); for (let i = 0; i < n - 1; i++) { const k = p.jobs[i] + '\u0000' + p.jobs[i + 1]; flows[i].set(k, (flows[i].get(k) || 0) + p.v); } });
        const totals = col.map(m => [...m.values()].reduce((a, b) => a + b, 0)), maxT = Math.max(...totals);
        const k = (ph - gapPx * (order.length - 1)) / Math.max(1e-9, maxT);
        const pos = col.map(m => { const out = new Map(); let y = top; order.forEach(j => { if (!m.has(j)) return; const h = m.get(j) * k; out.set(j, {y, h, out: y, in: y}); y += h + gapPx; }); return out; });
        let svg = '';
        names.slice(0, n).forEach((nm, i) => { svg += T(i === 0 ? 0 : i === n - 1 ? W : colX(i) + nodeW / 2, fs * .8, cut(nm, Math.max(40, W / n - 6), fs * .9), {size: fs * .9, anchor: i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle', weight: 700}); });
        const kept = [];
        for (let i = 0; i < n - 1; i++) {
            const list = [...flows[i].entries()].map(([kk, v]) => { const [a, b] = kk.split('\u0000'); return {a, b, v}; }).sort((x, y) => order.indexOf(x.a) - order.indexOf(y.a) || order.indexOf(x.b) - order.indexOf(y.b));
            let same = 0, all = 0;
            for (const f of list) {
                const A0 = pos[i].get(f.a), B0 = pos[i + 1].get(f.b), h = f.v * k; if (!A0 || !B0) continue;
                const x0 = colX(i) + nodeW, x1 = colX(i + 1), xm = (x0 + x1) / 2, ya = A0.out, yb = B0.in; A0.out += h; B0.in += h;
                const keptJob = f.a === f.b && f.a !== unknown && f.a !== other;
                if (f.a !== unknown && f.b !== unknown) { all += f.v; if (f.a === f.b) same += f.v; }
                const c = o.colorBy === 'kept' ? (keptJob ? '#2e7d32' : '#b8bec7') : colJob(f.a);
                svg += `<path d="M${r2(x0)} ${r2(ya)}C${r2(xm)} ${r2(ya)} ${r2(xm)} ${r2(yb)} ${r2(x1)} ${r2(yb)}L${r2(x1)} ${r2(yb + h)}C${r2(xm)} ${r2(yb + h)} ${r2(xm)} ${r2(ya + h)} ${r2(x0)} ${r2(ya + h)}Z" fill="${c}" fill-opacity="${o.colorBy === 'kept' && keptJob ? .6 : .38}" data-dfa-flow="">${tip(`${names[i] || 'Gén. ' + (i + 1)} ${f.a.toLowerCase()} → ${(names[i + 1] || 'Gén. ' + (i + 2)).toLowerCase()} ${f.b.toLowerCase()} : ${plural(f.v, 'lignée')}`)}</path>`;
            }
            kept.push(all ? same / all : null);
        }
        for (let i = 0; i < n; i++) {
            pos[i].forEach((p, j) => {
                const c = colJob(j), x = colX(i), share = totals[i] ? 100 * col[i].get(j) / totals[i] : 0;
                svg += `<rect x="${r2(x)}" y="${r2(p.y)}" width="${r2(nodeW)}" height="${r2(Math.max(1, p.h))}" fill="${c}" data-dfa-node="">${tip(`${names[i] || 'Gén. ' + (i + 1)} : ${j} — ${plural(col[i].get(j), 'lignée')} (${fmt(share, 0)} %)`)}</rect>`;
                if (p.h >= fs * .75 && o.labels !== false) {
                    const room = i === n - 1 ? colX(i) - colX(i - 1) - nodeW - 6 : colX(i + 1 <= n - 1 ? i + 1 : i) - x - nodeW - 6, lab = `${j}${o.values !== false ? ` ${fmt(col[i].get(j), 0)}` : ''}`;
                    svg += i === n - 1 ? T(x - 4, p.y + p.h / 2, cut(lab, room * .9, fs * .8), {size: fs * .8, anchor: 'end', halo: '#ffffff'}) : T(x + nodeW + 4, p.y + p.h / 2, cut(lab, room * .55, fs * .8), {size: fs * .8, halo: '#ffffff'});
                }
            });
        }
        const keptTxt = kept.map((v, i) => (v === null ? '' : `${names[i + 1] || 'gén. ' + (i + 2)} : ${fmt(v * 100, 0)} %`)).filter(Boolean);
        let h = H;
        if (keptTxt.length && o.summary !== false) { wrap(`Même métier que la génération d’avant — ${keptTxt.join(' · ')}`, W - 4, fs * .85).forEach(l => { svg += T(0, h + fs * .8, l, {size: fs * .85, fill: '#555'}); h += fs * 1.3; }); h += fs * .3; }
        const legend = o.colorBy === 'kept' ? [{label: 'Même métier que le père', color: '#2e7d32'}, {label: 'Métier différent', color: '#b8bec7'}] : order.slice(0, 18).map(j => ({label: j, color: colJob(j)}));
        return {h, svg, legend, desc: `Métiers sur ${n} générations : ${plural(paths.reduce((a, p) => a + p.v, 0), 'lignée')}.`};
    }
    function sampleOcc() {
        const J = ['Laboureur', 'Journalier', 'Tisserand', 'Meunier', 'Marchand', 'Ouvrier', 'Employé'], out = []; let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 160; i++) { const g = []; let j = rnd() < .6 ? 0 : Math.floor(rnd() * 5); for (let k = 0; k < 4; k++) { g.push(J[j]); const r = rnd(); j = r < .55 ? j : k >= 2 && r < .85 ? 5 + Math.floor(rnd() * 2) : Math.floor(rnd() * 5); } out.push({g1: g[0], g2: g[1], g3: g[2], g4: rnd() < .08 ? '' : g[3], value: '1'}); }
        const m = new Map(); out.forEach(r => { const k = [r.g1, r.g2, r.g3, r.g4].join('|'); m.set(k, (m.get(k) || 0) + 1); });
        return [...m.entries()].map(([k, v]) => { const [g1, g2, g3, g4] = k.split('|'); return {g1, g2, g3, g4, value: String(v)}; });
    }

    /* ═════════ D4 💍 Rayon des mariages ═════════ */
    const COMPASS = {n: 0, nne: 22.5, nne2: 22.5, ne: 45, ene: 67.5, e: 90, ese: 112.5, se: 135, sse: 157.5, s: 180, sso: 202.5, ssw: 202.5, so: 225, sw: 225, oso: 247.5, wsw: 247.5, o: 270, w: 270, ono: 292.5, wnw: 292.5, no: 315, nw: 315, nno: 337.5, nnw: 337.5};
    const bearingOf = (v, i) => { const t = fold(v).replace(/[^a-z0-9.,-]/g, ''); if (t === '') return (i * 137.508) % 360; if (/^-?\d+([.,]\d+)?$/.test(t)) return ((num(t) % 360) + 360) % 360; return COMPASS[t] ?? (i * 137.508) % 360; };
    const RINGS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
    const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    function radius(spec, W, fs) {
        const o = spec.o || {};
        const list = rows(spec, 'rows', 10000).map((r, i) => { const km = num(r.km); if (str(r.km) === '' || !(km >= 0) || km > 25000) return null; const y = yearOf(r.year); return {i, a: str(r.a, 80), b: str(r.b, 80), pa: str(r.pa, 60), pb: str(r.pb, 60), km, br: bearingOf(r.bearing, i), y, ida: pid(r.ida), idb: pid(r.idb)}; }).filter(Boolean);
        if (!list.length) return empty(W, fs, 'Ajoute des mariages : les deux époux, la distance entre leurs lieux de naissance (km) et l’année.');
        const kms = list.map(p => p.km).sort((a, b) => a - b), auto = kms[Math.min(kms.length - 1, Math.floor(kms.length * .95))] || 1;
        const maxKm = num(o.maxKm) > 0 ? num(o.maxKm) : RINGS.find(r => r >= auto) || auto;
        const scale = o.scale || 'sqrt', f = km => (scale === 'linear' ? km / maxKm : scale === 'log' ? Math.log1p(km) / Math.log1p(maxKm) : Math.sqrt(km / maxKm));
        const byC = o.colorBy !== 'none' && o.colorBy !== 'distance', cents = [...new Set(list.map(p => (p.y ? centuryOf(p.y) : 'Année inconnue')))].sort((a, b) => (centuryRank(a) ?? 99) - (centuryRank(b) ?? 99));
        const ci = new Map(cents.map((c, i) => [c, i])), cmap = catColors(spec);
        const colOf = p => { if (o.colorBy === 'none') return color(o.dotColor, '#4e79a7'); if (o.colorBy === 'distance') return mix('#59a14f', '#e15759', f(Math.min(p.km, maxKm))); const c = p.y ? centuryOf(p.y) : 'Année inconnue'; return cmap.get(fold(c)) || (p.y ? pick(spec, ci.get(c)) : '#9aa3ad'); };
        const Rm = Math.max(60, Math.min(W / 2 - fs * 2, (num(o.height) > 100 ? num(o.height) : 1e9) / 2 - fs * 1.5, 340)), cx = W / 2, cy = Rm + fs * 1.2;
        let rings = str(o.rings) ? str(o.rings).split(/[;,\s]+/).map(num).filter(x => x > 0 && x <= maxKm) : RINGS.filter(r => r < maxKm && f(r) > .08);
        if (!rings.includes(maxKm)) rings = [...rings, maxKm];
        rings = rings.slice(-8);
        let svg = `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(Rm)}" fill="#f6f8fb" stroke="currentColor" stroke-opacity=".25"/>`;
        rings.forEach(km => { const r = f(km) * Rm; svg += `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="none" stroke="currentColor" stroke-opacity=".18"${km === maxKm ? '' : ' stroke-dasharray="3 3"'}/>` + T(cx + r * .42, cy - r * .907 - fs * .3, `${fmt(km, 0)} km`, {size: fs * .72, fill: '#667', halo: '#f6f8fb', anchor: 'middle'}); });
        [['N', 0], ['E', 90], ['S', 180], ['O', 270]].forEach(([l, a]) => { const t = (a - 90) * Math.PI / 180; svg += T(cx + Math.cos(t) * (Rm + fs * .8), cy + Math.sin(t) * (Rm + fs * .8), l, {size: fs * .8, anchor: 'middle', fill: '#889', weight: 700}); });
        const dot = clamp(num(o.dot) || 4, 1.5, 14);
        list.forEach(p => {
            const far = p.km > maxKm, r = (far ? 1 : f(p.km)) * Rm, t = (p.br - 90) * Math.PI / 180, x = cx + Math.cos(t) * r, y = cy + Math.sin(t) * r, c = colOf(p);
            const title = `${p.a || '?'}${p.pa ? ` (né à ${p.pa})` : ''} et ${p.b || '?'}${p.pb ? ` (née à ${p.pb})` : ''} : ${p.km < .5 ? 'même lieu de naissance' : `${fmt(p.km, p.km < 10 ? 1 : 0)} km`}${p.y ? ` · mariage ${p.y}` : ''}`;
            const ids = [p.ida, p.idb].filter(Boolean), click = ids.length ? PIDS(ids, `${p.a} et ${p.b}`) : '';
            svg += far ? `<path d="M${r2(x)} ${r2(y)}l${r2(-dot)} ${r2(-dot * 1.6)}h${r2(dot * 2)}z" transform="rotate(${r2(p.br)} ${r2(x)} ${r2(y)})" fill="${c}"${click}>${tip(title + ' (au-delà du cercle)')}</path>` : `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(dot)}" fill="${c}" fill-opacity=".8" stroke="#fff" stroke-width=".8"${click}>${tip(title)}</circle>`;
        });
        svg += `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(Math.max(3, dot * .9))}" fill="#1d1d1f"/>` + T(cx, cy + fs * 1.05, str(o.center, 60) || 'le village de l’époux', {size: fs * .78, anchor: 'middle', weight: 600, halo: '#f6f8fb'});
        const same = list.filter(p => p.km < .5).length; if (same) svg += T(cx, cy + fs * 2.1, `${plural(same, 'couple')} du même lieu`, {size: fs * .72, anchor: 'middle', fill: '#556', halo: '#f6f8fb'});
        // la médiane de chaque siècle : un cercle de sa couleur
        const stats = (byC ? cents : ['Tous']).map(c => { const ps = byC ? list.filter(p => (p.y ? centuryOf(p.y) : 'Année inconnue') === c) : list; const ks = ps.map(p => p.km); return {c, n: ps.length, med: median(ks), same: ps.filter(p => p.km < .5).length / (ps.length || 1), near: ps.filter(p => p.km < 10).length / (ps.length || 1), col: byC ? colOf(ps[0]) : color(o.dotColor, '#4e79a7')}; }).filter(s => s.n);
        if (o.medians !== false && byC) stats.forEach(s => { if (s.med === null || s.med <= 0) return; svg += `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(Math.min(1, f(s.med)) * Rm)}" fill="none" stroke="${s.col}" stroke-width="2.2" stroke-opacity=".85">${tip(`${s.c} : la moitié des mariages à moins de ${fmt(s.med, s.med < 10 ? 1 : 0)} km`)}</circle>`; });
        let h = cy + Rm + fs * 1.6;
        if (o.table !== false) {
            const cols = [0, .34, .5, .68, .84].map(t => t * W), head = ['', 'Mariages', 'Médiane', 'Même lieu', '< 10 km'];
            head.forEach((t, i) => { if (t) svg += T(cols[i], h + fs * .6, t, {size: fs * .78, weight: 700, fill: '#555'}); }); h += fs * 1.4;
            stats.forEach(s => { svg += `<rect x="0" y="${r2(h)}" width="${r2(fs * .9)}" height="${r2(fs * .9)}" rx="2" fill="${s.col}"/>` + T(fs * 1.3, h + fs * .45, cut(s.c, cols[1] - fs * 1.6, fs * .85), {size: fs * .85}) + T(cols[1], h + fs * .45, fmt(s.n, 0), {size: fs * .85}) + T(cols[2], h + fs * .45, s.med === null ? '—' : `${fmt(s.med, s.med < 10 ? 1 : 0)} km`, {size: fs * .85, weight: 600}) + T(cols[3], h + fs * .45, `${fmt(s.same * 100, 0)} %`, {size: fs * .85}) + T(cols[4], h + fs * .45, `${fmt(s.near * 100, 0)} %`, {size: fs * .85}); h += fs * 1.35; });
        }
        const legend = o.colorBy === 'distance' ? [{label: 'Tout près', color: '#59a14f'}, {label: `Loin (${fmt(maxKm, 0)} km)`, color: '#e15759'}] : byC ? cents.map(c => ({label: c, color: cmap.get(fold(c)) || (c === 'Année inconnue' ? '#9aa3ad' : pick(spec, ci.get(c)))})) : [];
        return {h, svg, legend, desc: `Rayon des mariages : ${plural(list.length, 'couple')}, médiane ${fmt(median(kms), 1)} km.`};
    }
    function sampleRadius() {
        const out = []; let s = 5; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
        const V = ['Vitré', 'Bais', 'Louvigné', 'Argentré', 'Étrelles', 'Rennes', 'Fougères', 'Nantes', 'Paris'];
        [[1720, 4, 40], [1810, 8, 50], [1910, 25, 40]].forEach(([y0, scale, n]) => { for (let i = 0; i < n; i++) { const r = rnd(), km = r < .3 ? 0 : Math.round(-Math.log(1 - rnd() * .98) * scale * 10) / 10; out.push({a: `Époux ${out.length + 1}`, b: `Épouse ${out.length + 1}`, pa: V[0], pb: km < .5 ? V[0] : V[1 + Math.floor(rnd() * 8)], km: String(km), bearing: String(Math.round(rnd() * 360)), year: String(y0 + Math.floor(rnd() * 80))}); } });
        return out;
    }

    /* ═════════ D5 🧮 Implexe : ancêtres théoriques, places trouvées, personnes différentes ═════════ */
    function implexe(spec, W, fs) {
        const o = spec.o || {};
        const list = rows(spec, 'rows', 64).map(r => { const g = Math.round(num(r.gen)); if (!(g >= 1 && g <= 62)) return null; const theo = str(r.theo) !== '' ? num(r.theo) : 2 ** (g - 1); return {g, theo: Math.max(0, theo), found: Math.max(0, num(r.found)), distinct: Math.max(0, str(r.distinct) !== '' ? num(r.distinct) : num(r.found)), ids: pids(r.ids)}; }).filter(Boolean).sort((a, b) => a.g - b.g);
        if (!list.length) return empty(W, fs, 'Ajoute des générations : le numéro, les places trouvées et les personnes différentes.');
        const log = o.scale !== 'linear', max = Math.max(...list.map(r => o.theo === false ? Math.max(r.found, r.distinct) : Math.max(r.theo, r.found)), 1);
        const labW = fs * 4.2, rightW = Math.min(W * .3, fs * 11), pw = Math.max(60, W - labW - rightW - 8);
        const X = v => labW + (log ? Math.log2(1 + Math.max(0, v)) / Math.log2(1 + max) : Math.max(0, v) / max) * pw;
        const bh = clamp(num(o.barH) || fs * 1.6, 6, 60), gap = bh * .35;
        const cT = color(o.theoColor, '#d5dae1'), cF = color(o.foundColor, '#9ec5e8'), cD = color(o.distinctColor, '#1f5fa8');
        let svg = '', y = fs * .2;
        // l'échelle : 1, 2, 4… (doublement) ou des nombres ronds
        const ticks = log ? [1, 4, 16, 64, 256, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304, 16777216].filter(v => v <= max * 1.01) : R.ticks(0, max, clamp(Math.round(pw / 80), 2, 10)).ticks.filter(v => v <= max);
        const H0 = list.length * (bh + gap);
        ticks.forEach(v => { svg += `<line x1="${r2(X(v))}" y1="0" x2="${r2(X(v))}" y2="${r2(H0)}" stroke="currentColor" stroke-opacity=".1"/>` + T(X(v), H0 + fs * .9, fmt(v, 0), {size: fs * .72, anchor: 'middle'}); });
        let sumT = 0, sumF = 0;
        list.forEach(r => {
            sumT += r.theo; sumF += r.found;
            const rate = r.found ? 1 - r.distinct / r.found : 0, title = `Génération ${r.g} : ${fmt(r.theo, 0)} ancêtres possibles, ${fmt(r.found, 0)} places trouvées (${fmt(r.theo ? 100 * r.found / r.theo : 0, 1)} %), ${fmt(r.distinct, 0)} personnes différentes${rate > 0 ? ` — implexe ${fmt(rate * 100, 1)} %` : ''}`;
            svg += `<g${PIDS(r.ids, `Ancêtres présents plusieurs fois à la génération ${r.g}`)} data-dfa-gen="${r.g}">${tip(title)}`;
            svg += T(labW - 6, y + bh / 2, `Gén. ${r.g}`, {size: fs * .8, anchor: 'end', weight: 600, fill: '#556'});
            if (o.theo !== false) svg += `<rect x="${r2(labW)}" y="${r2(y)}" width="${r2(Math.max(1, X(r.theo) - labW))}" height="${r2(bh)}" fill="${cT}" rx="2"/>`;
            svg += `<rect x="${r2(labW)}" y="${r2(y + bh * .15)}" width="${r2(Math.max(r.found ? 1 : 0, X(r.found) - labW))}" height="${r2(bh * .7)}" fill="${cF}" rx="2"/>`;
            svg += `<rect x="${r2(labW)}" y="${r2(y + bh * .32)}" width="${r2(Math.max(r.distinct ? 1 : 0, X(r.distinct) - labW))}" height="${r2(bh * .36)}" fill="${cD}" rx="1"/>`;
            const txt = `${fmt(r.distinct, 0)} / ${fmt(r.theo, 0)}${rate > .0005 && o.pct !== false ? ` · ${fmt(rate * 100, 1)} %` : ''}`;
            svg += T(labW + pw + 6, y + bh / 2, cut(txt, rightW - 4, fs * .78), {size: fs * .78, weight: rate > .0005 ? 700 : 400, fill: rate > .0005 ? '#b3261e' : '#333'});
            svg += '</g>'; y += bh + gap;
        });
        let h = H0 + fs * 2;
        const sumD = list.reduce((a, r) => a + r.distinct, 0), tot = sumF ? 1 - sumD / sumF : 0;
        if (o.summary !== false) { wrap(`Sur ${list.length} générations : ${fmt(sumT, 0)} ancêtres possibles, ${fmt(sumF, 0)} places trouvées (${fmt(sumT ? 100 * sumF / sumT : 0, 1)} %), ${fmt(sumD, 0)} personnes différentes (génération par génération) — implexe ${fmt(tot * 100, 1)} %.`, W - 4, fs * .85).forEach(l => { svg += T(0, h + fs * .5, l, {size: fs * .85, fill: '#444'}); h += fs * 1.3; }); }
        const legend = [...(o.theo === false ? [] : [{label: 'Ancêtres possibles (2, 4, 8…)', color: cT}]), {label: 'Places trouvées', color: cF}, {label: 'Personnes différentes', color: cD}];
        return {h, svg, legend, desc: `Implexe sur ${list.length} générations : ${fmt(tot * 100, 1)} %.`};
    }
    const sampleImplexe = () => [[1, 1, 1], [2, 2, 2], [3, 4, 4], [4, 8, 8], [5, 16, 16], [6, 31, 31], [7, 58, 57], [8, 104, 99], [9, 170, 152], [10, 240, 196], [11, 300, 221], [12, 310, 205]].map(([gen, found, distinct]) => ({gen: String(gen), theo: '', found: String(found), distinct: String(distinct)}));

    /* ═════════ D6 📅 Mois des mariages et des conceptions ═════════ */
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const MSHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const MFOLD = MONTHS.map(fold);
    const monthIdx = (label, i) => { const f = fold(label).trim().replace(/\.$/, ''); if (/^\d{1,2}$/.test(f)) { const n = +f; return n >= 1 && n <= 12 ? n - 1 : -1; } const exact = MFOLD.indexOf(f); if (exact >= 0) return exact; const pre = f.length >= 3 ? MFOLD.filter(m => m.startsWith(f)) : []; return pre.length === 1 ? MFOLD.indexOf(pre[0]) : f === '' && i < 12 ? i : -1; };
    function months(spec, W, fs) {
        const o = spec.o || {}, ser = (spec.series || []).slice(0, 2);
        const data = [0, 1].map(() => new Array(12).fill(0)), ids = [0, 1].map(() => Array.from({length: 12}, () => []));
        rows(spec, 'rows', 400).forEach((r, i) => { const m = monthIdx(r.label, i); if (m < 0) return; [0, 1].forEach(s => { data[s][m] += Math.max(0, num(r['s' + s])); ids[s][m].push(...pids(r['ids' + s])); }); });
        const nS = o.layout === 'one' || !ser[1] && !data[1].some(Boolean) ? 1 : 2;
        const tot = data.map(d => d.reduce((a, b) => a + b, 0));
        if (!tot[0] && !tot[1]) return empty(W, fs, 'Ajoute les chiffres de chaque mois (janvier à décembre) : mariages, et conceptions ou naissances.');
        const names = [ser[0]?.name || 'Mariages', ser[1]?.name || 'Conceptions (naissance − 9 mois)'], cols = [pick(spec, 0, ser[0]?.color || '#f28e2b'), pick(spec, 1, ser[1]?.color || '#4e79a7')];
        const pct = !!o.pct, side = o.layout === 'side' && nS === 2, panels = side || nS === 1 ? 1 : 2;
        const left = fs * 3, pw = Math.max(60, W - left - 4), cw = pw / 12, X = m => left + m * cw;
        const ph = clamp(num(o.height) ? (num(o.height) - fs * 3) / panels : Math.min(240, Math.max(120, W * .26)), 60, 1200);
        let svg = '', y0 = 0;
        const seasons = o.seasons !== false;
        const xDay = (m, d) => X(m) + cw * clamp(d / DAYS[m], 0, 1);
        const shade = (yA, hh) => !seasons ? '' : `<rect x="${r2(xDay(1, 8))}" y="${r2(yA)}" width="${r2(xDay(3, 12) - xDay(1, 8))}" height="${r2(hh)}" fill="#8e7cc3" fill-opacity=".13"><title>Carême : du mercredi des Cendres (entre le 4 février et le 10 mars) à Pâques (entre le 22 mars et le 25 avril) — l’Église ne mariait pas</title></rect><rect x="${r2(xDay(10, 27))}" y="${r2(yA)}" width="${r2(xDay(11, 24) - xDay(10, 27))}" height="${r2(hh)}" fill="#8e7cc3" fill-opacity=".13"><title>Avent : du 4e dimanche avant Noël (entre le 27 novembre et le 3 décembre) au 24 décembre — pas de mariage non plus</title></rect>`;
        const panel = (series, yA) => {
            const vals = series.map(s => data[s].map(v => (pct ? (tot[s] ? 100 * v / tot[s] : 0) : v)));
            const mx = Math.max(1e-9, ...vals.flat(), o.expected !== false ? Math.max(...series.map(s => (pct ? 100 : tot[s]) * Math.max(...DAYS) / 365.25)) : 0);
            const tk = R.ticks(0, mx, 4), top = tk.hi || mx, Y = v => yA + ph * (1 - v / top);
            let out = shade(yA, ph);
            tk.ticks.forEach(v => { out += `<line x1="${r2(left)}" y1="${r2(Y(v))}" x2="${r2(left + pw)}" y2="${r2(Y(v))}" stroke="currentColor" stroke-opacity=".1"/>` + T(left - 4, Y(v), pct ? `${fmt(v, 0)} %` : fmt(v, 0), {size: fs * .72, anchor: 'end'}); });
            const bw = cw * .74 / series.length;
            series.forEach((s, k) => {
                for (let m = 0; m < 12; m++) {
                    const v = vals[k][m], x = X(m) + cw * .13 + k * bw, hgt = Math.max(0, Y(0) - Y(v));
                    const t = `${names[s]} en ${MONTHS[m]} : ${fmt(data[s][m], 0)}${tot[s] ? ` (${fmt(100 * data[s][m] / tot[s], 1)} %)` : ''}${s === 1 && /concep/i.test(names[1]) ? ` — nés en ${MONTHS[(m + 9) % 12]}` : ''}`;
                    out += `<rect x="${r2(x)}" y="${r2(Y(v))}" width="${r2(Math.max(1, bw - 1))}" height="${r2(hgt)}" fill="${cols[s]}" rx="1"${PIDS(ids[s][m], `${names[s]} — ${MONTHS[m]}`)} data-dfa-month="${s}-${m}">${tip(t)}</rect>`;
                    if (o.values && v > 0 && bw > fs * 1.2) out += T(x + bw / 2, Y(v) - fs * .5, pct ? fmt(v, 0) : fmt(v, 0), {size: fs * .7, anchor: 'middle'});
                }
                if (o.expected !== false && tot[s]) { const per = (pct ? 100 : tot[s]) / 365.25; let d = ''; for (let m = 0; m < 12; m++) d += `${m ? 'L' : 'M'}${r2(X(m))} ${r2(Y(per * DAYS[m]))}H${r2(X(m + 1))}`; out += `<path d="${d}" fill="none" stroke="${mix(cols[s], '#000000', .35)}" stroke-width="1.2" stroke-dasharray="4 3"><title>${esc(`Si ${names[s].toLowerCase()} étaient répartis également sur l’année (selon le nombre de jours du mois)`)}</title></path>`; }
            });
            if (panels === 2 || nS === 1 || side) out += T(left, yA - fs * .55, series.map(s => names[s]).join(' et '), {size: fs * .85, weight: 700, fill: series.length === 1 ? cols[series[0]] : 'currentColor'});
            return out;
        };
        if (panels === 2) { y0 = fs * 1.2; svg += panel([0], y0); y0 += ph + fs * 2.2; svg += panel([1], y0); y0 += ph; }
        else { y0 = fs * 1.2; svg += panel(nS === 1 ? [0] : [0, 1], y0); y0 += ph; }
        for (let m = 0; m < 12; m++) svg += T(X(m) + cw / 2, y0 + fs * .9, cw > fs * 3.2 ? MSHORT[m] : MSHORT[m][0].toUpperCase(), {size: fs * .78, anchor: 'middle'});
        let h = y0 + fs * 2;
        const F = spec.facts && typeof spec.facts === 'object' ? spec.facts : null, notes = [];
        if (F && num(F.precise_m) > 0) notes.push(`Mariages datés au jour près : ${fmt(num(F.lent), 0)} pendant le Carême et ${fmt(num(F.advent), 0)} pendant l’Avent, sur ${fmt(num(F.precise_m), 0)} (${fmt(100 * (num(F.lent) + num(F.advent)) / num(F.precise_m), 1)} %).`);
        if (F && num(F.precise_c) > 0) notes.push(`Conceptions pendant le Carême : ${fmt(num(F.lent_c), 0)} sur ${fmt(num(F.precise_c), 0)} (${fmt(100 * num(F.lent_c) / num(F.precise_c), 1)} % ; ${fmt(100 * 46 / 365, 0)} % si tout était égal).`);
        if (!F && seasons) { const m3 = data[0][2], m12 = data[0][11]; if (tot[0]) notes.push(`En mars (Carême) : ${fmt(100 * m3 / tot[0], 1)} % des ${names[0].toLowerCase()} ; en décembre (Avent) : ${fmt(100 * m12 / tot[0], 1)} % ; ${fmt(100 / 12, 1)} % si tout était égal.`); }
        notes.forEach(n => wrap(n, W - 4, fs * .82).forEach(l => { svg += T(0, h + fs * .5, l, {size: fs * .82, fill: '#555'}); h += fs * 1.25; }));
        const legend = [...[0, 1].slice(0, nS).map(s => ({label: names[s], color: cols[s]})), ...(seasons ? [{label: 'Carême et Avent', color: '#d9d3ee'}] : []), ...(o.expected !== false ? [{label: 'Si tout était égal', color: '#777777', type: 'dash'}] : [])];
        return {h, svg, legend, desc: `Mois des ${names.slice(0, nS).join(' et des ').toLowerCase()} : ${fmt(tot[0], 0)}${nS > 1 ? ` et ${fmt(tot[1], 0)}` : ''}.`};
    }
    const sampleMonths = () => ({series: [{name: 'Mariages'}, {name: 'Conceptions (naissance − 9 mois)'}], rows: [[38, 31], [52, 30], [4, 26], [12, 34], [26, 41], [31, 39], [22, 33], [14, 30], [17, 28], [24, 27], [46, 25], [3, 27]].map(([s0, s1], i) => ({label: MONTHS[i], s0: String(s0), s1: String(s1)}))});
    const monthsFromPeople = (people, cell) => {
        const n = new Array(12).fill(0);
        for (const r of people.slice(0, 60000)) {
            const t = fold(cell(r, 'birth')).replace(/-00\b/g, '').trim(); let m = -1, x;
            if ((x = t.match(/^-?\d{3,4}-(\d{1,2})/))) m = +x[1] - 1; else if ((x = t.match(/^\d{1,2}[/.](\d{1,2})[/.]\d{3,4}/))) m = +x[1] - 1; else { const k = MFOLD.findIndex(mm => t.includes(mm.slice(0, mm === 'juin' || mm === 'juillet' ? 4 : 3))); m = k; }
            if (m >= 0 && m < 12) n[(m + 3) % 12]++;
        }
        if (!n.some(Boolean)) return {html: '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📅</span><span class="empty-line-text">Aucune personne de la liste n’a un mois de naissance.</span></p>'};
        return {series: [{name: 'Conceptions (naissance − 9 mois)', color: '#4e79a7'}], rows: MONTHS.map((label, i) => ({label, s0: String(n[i]), s1: ''})), o: {layout: 'one'}};
    };

    /* ═════════ D7 👶 Espacement des naissances (par mère) ═════════ */
    function spacing(spec, W, fs) {
        const o = spec.o || {}, young = clamp(num(o.young) || 5, 1, 20), byYear = o.axis === 'year';
        const moms = new Map();
        rows(spec, 'rows', 6000).forEach((r, i) => {
            const name = str(r.mother, 120); if (!name) return;
            const key = (pid(r.mid) || '') + '|' + fold(name);
            if (!moms.has(key)) moms.set(key, {name, mid: pid(r.mid), mb: when(r.mbirth), md: when(r.mdeath), mar: when(r.marriage), kids: [], i});
            const m = moms.get(key); if (m.mb === null) m.mb = when(r.mbirth); if (m.md === null) m.md = when(r.mdeath); if (m.mar === null) m.mar = when(r.marriage);
            const b = when(r.birth); if (b === null && !str(r.child)) return;
            m.kids.push({name: str(r.child, 120), cid: pid(r.cid), b, d: when(r.death), sex: sexOf(r.sex)});
        });
        let list = [...moms.values()].filter(m => m.kids.some(k => k.b !== null));
        if (!list.length) return empty(W, fs, 'Ajoute des enfants : le nom de la mère, sa naissance, puis chaque enfant et sa date de naissance.');
        list.forEach(m => { m.kids.sort((a, b) => (a.b ?? 1e9) - (b.b ?? 1e9)); m.est = m.mb === null; if (m.est) m.mb = (m.kids.find(k => k.b !== null).b) - 25; });
        if (o.sort === 'kids') list.sort((a, b) => b.kids.length - a.kids.length); else if (o.sort === 'birth') list.sort((a, b) => a.mb - b.mb);
        list = list.slice(0, clamp(Math.round(num(o.lanes) || 15), 1, 60));
        const ages = byYear ? null : [12, Math.max(50, ...list.map(m => Math.ceil(Math.max(...m.kids.filter(k => k.b !== null).map(k => k.b - m.mb)) / 5) * 5))];
        const yrs = byYear ? [Math.floor(Math.min(...list.map(m => m.mb + 12)) / 10) * 10, Math.ceil(Math.max(...list.map(m => Math.max(...m.kids.filter(k => k.b !== null).map(k => k.b)) + 2)) / 10) * 10] : null;
        const [from, to] = byYear ? yrs : [clamp(ages[0], 0, 30), clamp(ages[1], 20, 70)];
        const labW = Math.min(W * .32, Math.max(...list.map(m => textW(`${m.name} (${m.kids.length})`, fs * .82))) + 10), pw = Math.max(60, W - labW - 8);
        const X = v => labW + (clamp(v, from, to) - from) / Math.max(1e-6, to - from) * pw;
        const lh = clamp(num(o.laneH) || fs * 2.6, fs * 1.6, 120), dot = clamp(num(o.dot) || fs * .42, 2, 20);
        const H0 = list.length * lh;
        let svg = yearAxis(from, to, X, 0, H0, fs, pw);
        const gaps = []; let kids = 0, died = 0;
        list.forEach((m, li) => {
            const y = li * lh + lh / 2, xv = v => X(byYear ? v : v - m.mb), life0 = byYear ? m.mb + 12 : 12, life1 = m.md !== null ? (byYear ? m.md : m.md - m.mb) : to;
            svg += `<g${PID(m.mid)}>${tip(`${m.name}${m.est ? ' (naissance inconnue : âges estimés)' : ''} — ${plural(m.kids.length, 'enfant')}`)}${T(labW - 6, y, cut(`${m.name} (${m.kids.length})`, labW - 8, fs * .82), {size: fs * .82, anchor: 'end', style: m.est ? 'italic' : ''})}</g>`;
            svg += `<line x1="${r2(X(life0))}" y1="${r2(y)}" x2="${r2(X(life1))}" y2="${r2(y)}" stroke="currentColor" stroke-opacity=".35" stroke-width="2"${m.md === null ? ' stroke-dasharray="3 3"' : ''}/>`;
            if (m.md !== null && life1 <= to) svg += T(X(life1) + 3, y, '†', {size: fs * .8, fill: '#666'});
            if (m.mar !== null) { const xm = xv(m.mar); svg += `<path d="M${r2(xm)} ${r2(y - dot * 1.4)}l${r2(dot)} ${r2(dot * 1.4)}l${r2(-dot)} ${r2(dot * 1.4)}l${r2(-dot)} ${r2(-dot * 1.4)}z" fill="#f2c94c" stroke="#9c7a00" stroke-width=".8">${tip(`Mariage : ${Math.floor(m.mar)}${!byYear ? ` (à ${Math.floor(m.mar - m.mb)} ans)` : ''}`)}</path>`; }
            let prev = null;
            m.kids.forEach(k => {
                if (k.b === null) return; kids++;
                const x = xv(k.b), dead = k.d !== null && k.d - k.b < young; if (dead) died++;
                if (prev && o.gaps !== false) { const mo = Math.round((k.b - prev.b) * 12); gaps.push(mo); const xp = xv(prev.b); if (x - xp > fs * 1.6) svg += T((x + xp) / 2, y - dot - fs * .5, `${mo} m`, {size: fs * .66, anchor: 'middle', fill: mo < 15 ? '#b3261e' : '#556'}); svg += `<line x1="${r2(xp)}" y1="${r2(y)}" x2="${r2(x)}" y2="${r2(y)}" stroke="${mo < 15 ? '#e15759' : '#4e79a7'}" stroke-width="3" stroke-opacity=".35">${tip(`${mo} mois entre ${prev.name || 'un enfant'} et ${k.name || 'le suivant'}`)}</line>`; }
                const c = SEX[k.sex][1], ageM = Math.floor(k.b - m.mb), title = `${k.name || 'Enfant'} : né${k.sex === 'f' ? 'e' : ''} en ${Math.floor(k.b)} (mère : ${ageM} ans${m.est ? ', estimé' : ''})${k.d !== null ? ` · † ${Math.floor(k.d)} (${Math.max(0, Math.floor(k.d - k.b))} an${Math.floor(k.d - k.b) > 1 ? 's' : ''})` : ''}`;
                svg += dead ? `<g${PID(k.cid)}>${tip(title + ` — mort${k.sex === 'f' ? 'e' : ''} avant ${young} ans`)}<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(dot)}" fill="#fff" stroke="${c}" stroke-width="1.8"/><path d="M${r2(x)} ${r2(y - dot * .6)}V${r2(y + dot * .6)}M${r2(x - dot * .45)} ${r2(y - dot * .2)}H${r2(x + dot * .45)}" stroke="#1d1d1f" stroke-width="1"/></g>` : `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(dot)}" fill="${c}" stroke="#fff" stroke-width="1"${PID(k.cid)}>${tip(title)}</circle>`;
                prev = k;
            });
        });
        let h = H0 + fs * 2;
        const med = median(gaps);
        if (o.summary !== false) wrap(`${plural(kids, 'naissance')} chez ${plural(list.length, 'mère')}${med !== null ? ` · écart médian entre deux naissances : ${fmt(med, 0)} mois` : ''} · ${fmt(kids ? 100 * died / kids : 0, 0)} % morts avant ${young} ans.`, W - 4, fs * .85).forEach(l => { svg += T(0, h + fs * .5, l, {size: fs * .85, fill: '#444'}); h += fs * 1.3; });
        const legend = [{label: 'Garçon', color: SEX.h[1]}, {label: 'Fille', color: SEX.f[1]}, {label: `Mort avant ${young} ans (rond vide ✝)`, color: '#d9dde3'}, {label: 'Mariage', color: '#f2c94c'}, {label: 'Moins de 15 mois d’écart', color: '#e15759', type: 'line', width: 3}];
        return {h, svg, legend, desc: `Espacement des naissances : ${plural(list.length, 'mère')}, ${plural(kids, 'enfant')}${med !== null ? `, écart médian ${fmt(med, 0)} mois` : ''}.`};
    }
    function sampleSpacing() {
        const M = [['Jeanne ROUX', '1752', '1801', '1771', [[1772.3, 1773], [1773.9], [1775.4, 1777], [1777.2], [1779.1, 1779.5], [1780.6], [1782.9], [1785.1], [1788.4]]], ['Marie DURAND', '1790', '1858', '1812', [[1813.2], [1815.6], [1818.1, 1820], [1820.9], [1824.3]]], ['Rose PETIT', '1838', '1910', '1860', [[1861.0], [1863.4, 1863.6], [1864.5], [1867.0], [1870.2]]], ['Louise MARTIN', '1905', '1990', '1928', [[1929.5], [1934.2]]]];
        const out = [];
        M.forEach(([mother, mb, md, mar, kids]) => kids.forEach(([b, d], i) => { const y = Math.floor(b), m = Math.round((b - y) * 12) + 1; out.push({mother, mbirth: mb, mdeath: md, marriage: mar, child: `${i % 2 ? 'Marie' : 'Jean'} ${mother.split(' ')[1]} (${i + 1})`, sex: i % 2 ? 'f' : 'h', birth: `${y}-${String(clamp(m, 1, 12)).padStart(2, '0')}`, death: d ? String(Math.floor(d)) : ''}); }));
        return out;
    }

    /* ═════════ D8 🏘️ Frise des lieux de vie ═════════ */
    function placestrip(spec, W, fs) {
        const o = spec.o || {}, level = o.level || 'place';
        const people = new Map();
        rows(spec, 'rows', 5000).forEach((r, i) => {
            const name = str(r.person, 120), a = when(r.start); if (!name || a === null) return;
            const key = (pid(r.pid) || '') + '|' + fold(name);
            if (!people.has(key)) people.set(key, {name, pid: pid(r.pid), segs: [], i});
            const place = level === 'county' ? str(r.county, 60) || str(r.place, 60) : level === 'country' ? str(r.country, 60) || 'Pays inconnu' : str(r.place, 60);
            people.get(key).segs.push({a, b: when(r.end), place: place || 'Lieu inconnu', full: [str(r.place, 60), str(r.county, 60), str(r.country, 60)].filter(Boolean).join(', '), what: str(r.what, 120)});
        });
        let list = [...people.values()];
        if (!list.length) return empty(W, fs, 'Ajoute des lieux : la personne, le lieu, le début et la fin (années ou dates).');
        list.forEach(p => { p.segs.sort((x, y) => x.a - y.a); p.segs.forEach((s, i) => { if (s.b === null || s.b < s.a) { const nx = p.segs[i + 1]; s.open = !nx; s.b = nx ? nx.a : s.a + 1; } }); p.a = p.segs[0].a; });
        if (o.sort === 'birth') list.sort((x, y) => x.a - y.a);
        list = list.slice(0, 80);
        const tot = new Map(); list.forEach(p => p.segs.forEach(s => tot.set(s.place, (tot.get(s.place) || 0) + (s.b - s.a))));
        const top = clamp(Math.round(num(o.top) || 14), 2, 40), keep = new Set([...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k]) => k)), cmap = catColors(spec);
        const order = [...keep], colOf = pl => cmap.get(fold(pl)) || (keep.has(pl) ? pick(spec, order.indexOf(pl)) : '#c4c9d0');
        const from = num(o.from) || Math.floor(Math.min(...list.map(p => p.a)) / 10) * 10, to = num(o.to) || Math.ceil(Math.max(...list.flatMap(p => p.segs.map(s => s.b)), from + 10) / 10) * 10;
        const labW = Math.min(W * .3, Math.max(...list.map(p => textW(p.name, fs * .85))) + 10), pw = Math.max(60, W - labW - 8);
        const X = v => labW + (clamp(v, from, to) - from) / Math.max(1e-6, to - from) * pw;
        const bh = clamp(num(o.barH) || fs * 1.7, 6, 60), gap = bh * .3, H0 = list.length * (bh + gap);
        let svg = yearAxis(from, to, X, 0, H0, fs, pw);
        list.forEach((p, li) => {
            const y = li * (bh + gap);
            svg += `<g${PID(p.pid)}>${tip(p.name)}${T(labW - 6, y + bh / 2, cut(p.name, labW - 8, fs * .85), {size: fs * .85, anchor: 'end'})}</g>`;
            p.segs.forEach(s => {
                const x0 = X(s.a), x1 = X(s.b), c = colOf(s.place), w = Math.max(1.5, x1 - x0);
                svg += `<rect x="${r2(x0)}" y="${r2(y)}" width="${r2(w)}" height="${r2(bh)}" fill="${c}"${s.open ? ' fill-opacity=".45" stroke-dasharray="3 2"' : ''} stroke="#fff" stroke-width=".8"${PID(p.pid)} data-dfa-seg="">${tip(`${p.name} : ${s.full || s.place} · ${Math.floor(s.a)} – ${s.open ? '?' : Math.floor(s.b)}${s.what ? ` (${s.what})` : ''}`)}</rect>`;
                if (o.labels !== false && w > fs * 2.5 && bh >= fs * .9) svg += T(x0 + 3, y + bh / 2, cut(s.place, w - 5, fs * .72), {size: fs * .72, fill: contrast(c)});
            });
        });
        const legend = [...order.slice(0, 24).map(pl => ({label: pl, color: colOf(pl)})), ...(tot.size > keep.size ? [{label: 'Autres lieux', color: '#c4c9d0'}] : [])];
        return {h: H0 + fs * 2, svg, legend, desc: `Lieux de vie de ${plural(list.length, 'personne')} : ${plural(tot.size, 'lieu')}.`};
    }
    const samplePlaces = () => [
        ['Jean MARTIN', 'Vitré', '1792', '1815'], ['Jean MARTIN', 'Rennes', '1815', '1842'], ['Jean MARTIN', 'Vitré', '1842', '1868'],
        ['Marie DURAND', 'Bais', '1798', '1815'], ['Marie DURAND', 'Rennes', '1815', '1842'], ['Marie DURAND', 'Vitré', '1842', '1871'],
        ['Pierre MARTIN', 'Rennes', '1820', '1845'], ['Pierre MARTIN', 'Nantes', '1845', '1870'], ['Pierre MARTIN', 'Paris', '1870', '1890'],
        ['Rose MARTIN', 'Rennes', '1823', '1846'], ['Rose MARTIN', 'Fougères', '1846', '1901'],
        ['Louis MARTIN', 'Nantes', '1848', '1872'], ['Louis MARTIN', 'Paris', '1872', '1930']].map(([person, place, start, end]) => ({person, place, start, end, county: '', country: 'France', what: ''}));

    /* ═════════ « Depuis l'app » : petits outils communs ═════════ */
    const getF = q => A().api('diagram_famille', {...q, ...(window.LCNDA_EXT?.diagramAppOpts?.extra() || {})}); // + le groupe de personnes et la période communs (heritage-diagram-options.js)
    const PK = (name, o = {}) => (window.LCNDA_PICKER?.pickerField ? window.LCNDA_PICKER.pickerField({name, kind: 'person', ...o}) : '');
    const startId = () => Number(A().state?.bootstrap?.startPersonId) || null;
    const rootField = (label = 'Personne de départ') => `<span class="pk-lab">${esc(label)}</span>${PK('dfa_root', {value: startId()})}`;
    const rootOf = pane => Number(pane.querySelector('[name="dfa_root"]')?.value) || startId() || 0;
    const val = (pane, k) => pane.querySelector(`[data-dfa="${k}"]`)?.value || '';
    const sel = (k, opts, def = '') => `<select data-dfa="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(def) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const box = (title, intro, inner, go = 'Prendre dans ma base') => `<div class="h-dg-app dfa-app"><h4>${title}</h4><p class="muted">${intro}</p>${inner}<button type="button" class="button small" data-dfa-go>${esc(go)}</button><p class="muted" data-dfa-msg aria-live="polite"></p></div>`;
    const SCOPE = (def = '') => `<label>Personnes comptées${sel('scope', [['', 'Toute ma base'], ['anc', 'Les ancêtres de la personne de départ'], ['desc', 'Les descendants de la personne de départ']], def)}</label>`;
    function bindApp(pane, run) {
        const btn = pane.querySelector('[data-dfa-go]'), msg = pane.querySelector('[data-dfa-msg]'); if (!btn) return;
        btn.addEventListener('click', async () => { btn.disabled = true; if (msg) msg.innerHTML = window.LCNDA_UI.spinner('Lecture de ta généalogie…', {inline: true});
            try { const t = await run(); A().toast?.(t || 'Données prises dans ta base.'); if (msg?.isConnected) msg.textContent = ''; } catch (e) { if (msg) msg.textContent = '⚠️ ' + (e.message || e); } finally { btn.disabled = false; } });
    }
    const titleIf = (s, sample, t) => { s.o = s.o || {}; if (!s.o.title || s.o.title === sample.o?.title) s.o.title = t; };
    const GENS = (k, def, min, max, word = 'générations') => sel(k, Array.from({length: max - min + 1}, (_, i) => [min + i, `${min + i} ${min + i > 1 ? word : word.replace(/s$/, '')}`]), def);

    const knownApp = {
        html: () => box('🤝 Les vies autour d’une personne', 'Ses ancêtres et ses descendants, chacun sur sa ligne : l’app cherche ceux qui se sont connus à plusieurs générations d’écart.', `${rootField()}<label>Ancêtres${GENS('up', 3, 0, 8)}</label><label>Descendants${GENS('down', 2, 0, 6)}</label>`),
        bind: (pane, io) => bindApp(pane, async () => {
            const r = await getF({what: 'overlap', root: rootOf(pane), up: val(pane, 'up'), down: val(pane, 'down')});
            const list = (r.people || []).filter(p => p.birth); if (list.length < 2) throw new Error('Pas assez de personnes datées autour de cette personne.');
            const s = io.spec(); s.rows = list.map(p => ({name: p.name, sex: p.sex, gen: String(p.gen), start: p.birth, end: p.death, living: p.living ? '1' : '', up: '', pid: p.id, link: p.link || ''}));
            titleIf(s, sampleKnown(), `Qui a connu qui autour de ${r.root_name}`); io.apply(s);
            return `${list.length} vies prises dans ta base.`;
        }),
    };
    const survivalApp = {
        html: () => box('📉 Les âges de ma base', 'L’âge au décès de chacun ; les personnes encore en vie comptent jusqu’à leur âge d’aujourd’hui. Les décès inconnus sont laissés de côté.', `<label>Une courbe par${sel('by', [['century', 'Siècle de naissance'], ['sex', 'Sexe'], ['branch', 'Branche (paternelle, maternelle)'], ['gen', 'Génération (ancêtres)'], ['all', 'Une seule courbe']], 'century')}</label>${SCOPE()}${rootField()}`),
        bind: (pane, io) => bindApp(pane, async () => {
            const r = await getF({what: 'survival', by: val(pane, 'by'), scope: val(pane, 'scope'), root: rootOf(pane)});
            if (!r.rows?.length) throw new Error('Aucune personne avec une naissance et un décès (ou en vie).');
            const s = io.spec(); s.rows = r.rows.map(x => ({group: x.group, age: String(x.age), dead: x.dead ? '1' : '0', id: x.id}));
            titleIf(s, K.fasurvie.sample(), `Survie par ${pane.querySelector('[data-dfa="by"]').selectedOptions[0].textContent.toLowerCase()}`); io.apply(s);
            return `${r.rows.length} personnes prises dans ta base${r.unknown ? ` (${r.unknown} sans date de décès laissées de côté)` : ''}.`;
        }),
    };
    const occApp = {
        html: () => box('🔀 Les métiers de ma base', 'Chaque lignée (père, grand-père… ou parents) donne un chemin de métiers ; le métier vient de la fiche ou du premier événement « Profession ».', `<label>Lignées${sel('chain', [['male', 'Père → fils (lignées d’hommes)'], ['parent', 'Parents → enfants (pères et mères)']], 'male')}</label><label>Générations${GENS('gens', 4, 3, 5)}</label>${SCOPE()}${rootField()}`),
        bind: (pane, io) => bindApp(pane, async () => {
            const r = await getF({what: 'occflow', chain: val(pane, 'chain'), gens: val(pane, 'gens'), scope: val(pane, 'scope'), root: rootOf(pane)});
            if (!r.rows?.length) throw new Error(r.with_job ? 'Aucune lignée avec au moins deux métiers connus.' : 'Aucun métier dans ta base (fiche ou événement « Profession »).');
            const n = r.gens, s = io.spec(); s.rows = r.rows.map(x => { const o = {value: String(x.value)}; for (let i = 1; i <= 5; i++) o['g' + i] = i <= n ? x['g' + i] || '' : ''; return o; });
            s.o = {...s.o, colNames: r.chain === 'male' ? COLNAMES.slice(5 - n).join(', ') : ['Trisaïeuls', 'Arrière-grands-parents', 'Grands-parents', 'Parents', 'Enfants'].slice(5 - n).join(', ')};
            titleIf(s, K.fametiers.sample(), r.chain === 'male' ? 'Métiers de père en fils' : 'Métiers de parents à enfants'); io.apply(s);
            return `${r.paths} lignées prises dans ta base.`;
        }),
    };
    const radiusApp = {
        html: () => box('💍 Les couples de ma base', 'La distance entre les lieux de naissance des deux époux (les lieux ont besoin de leurs coordonnées), et la direction vue depuis le village de l’époux.', `${SCOPE()}${rootField()}`),
        bind: (pane, io) => bindApp(pane, async () => {
            const r = await getF({what: 'radius', scope: val(pane, 'scope'), root: rootOf(pane)});
            if (!r.rows?.length) throw new Error(`Aucun couple dont les deux lieux de naissance ont des coordonnées${r.missing ? ` (${r.missing} couples sans lieu situé)` : ''}.`);
            const s = io.spec(); s.rows = r.rows.map(x => ({a: x.a, b: x.b, pa: x.pa, pb: x.pb, km: String(x.km), bearing: String(x.bearing), year: x.year, ida: x.ida, idb: x.idb}));
            titleIf(s, K.famariages.sample(), 'Rayon des mariages'); io.apply(s);
            return `${r.rows.length} couples pris dans ta base${r.missing ? ` (${r.missing} sans lieux situés)` : ''}.`;
        }),
    };
    const implexeApp = {
        html: () => box('🧮 L’ascendance d’une personne', 'Génération par génération : les ancêtres possibles (2, 4, 8…), les places trouvées et les personnes différentes (un même ancêtre peut occuper plusieurs places).', `${rootField()}<label>Générations${GENS('gens', 12, 4, 25)}</label>`),
        bind: (pane, io) => bindApp(pane, async () => {
            const r = await getF({what: 'implexe', root: rootOf(pane), gens: val(pane, 'gens')});
            if (!r.rows?.length) throw new Error('Aucun ancêtre trouvé pour cette personne.');
            const s = io.spec(); s.rows = r.rows.map(x => ({gen: String(x.gen), theo: x.theo, found: String(x.found), distinct: String(x.distinct), ids: x.ids}));
            titleIf(s, K.faimplexe.sample(), `Implexe de ${r.root_name}`); io.apply(s);
            return `${r.rows.length} générations prises dans ta base${r.truncated ? ' (arrêt à 250 000 places)' : ''}.`;
        }),
    };
    const monthsApp = {
        html: () => box('📅 Les mariages et les naissances de ma base', 'Les mariages datés au mois près ; les conceptions = la naissance (ou le baptême) moins 9 mois. Carême et Avent sont comptés au jour près quand la date est complète.', `${SCOPE()}${rootField()}<div class="dfa-period"><label>De (année)<input data-dfa="from" inputmode="numeric" placeholder="ex. 1650"></label><label>À (année)<input data-dfa="to" inputmode="numeric" placeholder="ex. 1900"></label></div>`),
        bind: (pane, io) => bindApp(pane, async () => {
            const q = {what: 'months', scope: val(pane, 'scope'), root: rootOf(pane)}; const f = val(pane, 'from').trim(), t = val(pane, 'to').trim(); if (/^\d{3,4}$/.test(f)) q.from = f; if (/^\d{3,4}$/.test(t)) q.to = t;
            const r = await getF(q); if (!r.stats?.marriages && !r.stats?.conceptions) throw new Error('Aucun mariage ni aucune naissance datés au mois près.');
            const s = io.spec(); s.series = [{name: 'Mariages', color: s.series?.[0]?.color || '#f28e2b'}, {name: 'Conceptions (naissance − 9 mois)', color: s.series?.[1]?.color || '#4e79a7'}];
            s.rows = r.rows.map(x => ({label: x.label, s0: String(x.s0), s1: String(x.s1), ids0: x.ids0, ids1: x.ids1})); s.facts = r.stats;
            titleIf(s, K.famois.sample(), `Mariages et conceptions par mois${q.from || q.to ? ` (${q.from || '…'} – ${q.to || '…'})` : ''}`); io.apply(s);
            return `${r.stats.marriages} mariages et ${r.stats.conceptions} naissances pris dans ta base.`;
        }),
    };
    const spacingApp = {
        html: () => box('👶 Les mères de ma base', 'Chaque mère sur une ligne, ses enfants à l’âge qu’elle avait à leur naissance, l’écart en mois entre deux naissances et les enfants morts jeunes.', `<label>Quelles mères${sel('mode', [['all', 'Celles qui ont le plus d’enfants'], ['anc', 'Les ancêtres de la personne de départ'], ['one', 'Une seule mère']], 'all')}</label><span class="pk-lab">La mère (pour « une seule mère »)</span>${PK('dfa_mother')}${rootField('Personne de départ (pour les ancêtres)')}<label>Combien de mères au plus${GENS('top', 12, 1, 40, 'mères')}</label>`),
        bind: (pane, io) => bindApp(pane, async () => {
            const mode = val(pane, 'mode'), mother = Number(pane.querySelector('[name="dfa_mother"]')?.value) || 0;
            if (mode === 'one' && !mother) throw new Error('Choisis la mère dans le menu.');
            const r = await getF({what: 'spacing', mode, mother, root: rootOf(pane), top: val(pane, 'top')});
            if (!r.rows?.length) throw new Error('Aucune mère avec des enfants dans ta base.');
            const s = io.spec(); s.rows = r.rows.map(x => ({mother: x.mother, mbirth: x.mbirth, mdeath: x.mdeath, marriage: x.marriage, child: x.child, sex: x.sex, birth: x.birth, death: x.death, mid: x.mid, cid: x.cid}));
            titleIf(s, K.fanaiss.sample(), mode === 'one' ? `Les naissances de ${r.rows[0].mother}` : 'Espacement des naissances'); io.apply(s);
            return `${r.mothers} mère${r.mothers > 1 ? 's' : ''} et ${r.rows.length} enfants pris dans ta base.`;
        }),
    };
    const placesApp = {
        html: () => box('🏘️ Les lieux de vie de ma base', 'Pour chaque personne, ses lieux dans l’ordre du temps : naissance, baptême, domiciles, recensements, mariage, métier, décès… Une couleur par commune.', `<label>Quelles personnes${sel('mode', [['anc', 'La personne de départ et ses ancêtres'], ['family', 'Ses parents, elle et ses enfants'], ['ids', 'Les personnes que je choisis']], 'anc')}</label>${rootField()}<label>Générations d’ancêtres${GENS('gens', 3, 1, 6)}</label><span class="pk-lab">Personnes (pour « que je choisis »)</span>${PK('dfa_ids', {multiple: true})}`),
        bind: (pane, io) => bindApp(pane, async () => {
            const mode = val(pane, 'mode'), ids = String(pane.querySelector('[name="dfa_ids"]')?.value || '').split(',').map(Number).filter(x => x > 0);
            if (mode === 'ids' && !ids.length) throw new Error('Choisis au moins une personne dans le menu.');
            const r = await getF({what: 'places', mode: mode === 'family' ? 'family' : 'anc', ids: mode === 'ids' ? ids.join(',') : '', root: rootOf(pane), gens: val(pane, 'gens')});
            if (!r.rows?.length) throw new Error('Aucun événement avec un lieu pour ces personnes.');
            const s = io.spec(); s.rows = r.rows.map(x => ({person: x.person, place: x.place, start: x.start, end: x.end, county: x.county, country: x.country, what: x.what, pid: x.pid}));
            titleIf(s, K.falieux.sample(), 'Les lieux de vie de la famille'); io.apply(s);
            return `${r.people} personnes et ${r.rows.length} lieux pris dans ta base.`;
        }),
    };

    /* ═════════ Les types ═════════ */
    const CATS = (label = 'Couleurs choisies (facultatif)', what = 'Valeur') => ({key: 'cats', label, cols: [C('value', what), C('color', 'Couleur', 'color')]});
    const NEW = {
        faknown: {icon: '🤝', label: 'Qui a connu qui (vies de plusieurs générations)', group: 'Frises', render: known, legend: 'bottom', fromApp: knownApp,
            help: 'Les vies de plusieurs générations superposées : qui a connu son arrière-petit-enfant, et combien d’années.',
            grids: [{key: 'rows', label: 'Les personnes (génération : 0 = la personne de départ, −1 = parents, 1 = enfants…)', cols: [C('name', 'Nom'), C('sex', 'Sexe', 'select', {choices: [['', '?'], ['h', 'Homme'], ['f', 'Femme']]}), C('gen', 'Génération', 'number'), C('start', 'Naissance', 'text', {ph: '7 mai 1925'}), C('end', 'Décès'), C('living', 'En vie', 'select', {choices: [['', 'Non'], ['1', 'Oui']]}), C('up', 'Vers (son enfant ou parent du côté de la personne de départ)')]}],
            options: [C('pairs', 'Rencontres racontées', 'range', {min: 0, max: 12, def: 5}), C('minGap', 'Écart de générations au moins', 'range', {min: 1, max: 6, def: 2}), C('band', 'Montrer quand le plus de générations vivaient ensemble', 'check', {def: true}),
                C('order', 'Ordre', 'select', {choices: [['', 'Par génération'], ['birth', 'Par date de naissance']]}), C('colorBy', 'Couleurs', 'select', {choices: [['', 'Une par génération'], ['sex', 'Homme / femme']]}),
                C('names', 'Noms à gauche', 'check', {def: true}), C('ages', 'Âge dans la barre', 'check', {def: true}), C('guessLife', 'Décès inconnu : vie supposée (ans, 0 = non)', 'number', {min: 0, max: 110}), C('barH', 'Épaisseur des barres', 'range', {min: 6, max: 40, def: 18}), C('from', 'Début (année, vide = auto)', 'number'), C('to', 'Fin (année, vide = auto)', 'number')],
            sample: sampleKnown},
        fasurvie: {icon: '📉', label: 'Courbe de survie (part encore en vie à chaque âge)', group: 'Chiffres', render: survival, legend: 'bottom', fromApp: survivalApp, fromPeople: survivalFromPeople,
            help: 'Pour chaque âge, la part des personnes encore en vie : une courbe par siècle, par sexe ou par branche.',
            grids: [{key: 'rows', label: 'Les personnes (une ligne chacune)', cols: [C('group', 'Groupe (siècle, sexe, branche…)'), C('age', 'Âge', 'number', {unit: 'ans'}), C('dead', 'À cet âge', 'select', {choices: [['1', 'Décès'], ['0', 'Encore en vie']]})]}, CATS('Couleur de chaque groupe (facultatif)', 'Groupe')],
            options: [C('median', 'Montrer l’âge médian (la moitié encore en vie)', 'check', {def: true}), C('markAge', 'Lire la part en vie à l’âge de…', 'number', {unit: 'ans', min: 0, max: 120}), C('living', 'Compter les vivants (jusqu’à leur âge d’aujourd’hui)', 'check', {def: true}),
                C('smooth', 'Lignes droites (au lieu des marches)', 'check'), C('lineWidth', 'Épaisseur des courbes', 'range', {min: 1, max: 6, step: .2, def: 2.4}), C('maxAge', 'Âge au plus (vide = auto)', 'number', {min: 5, max: 125}),
                C('sort', 'Ordre des groupes', 'select', {choices: [['', 'Les plus nombreux d’abord'], ['az', 'A → Z'], ['given', 'Comme dans le tableau']]}), C('groupBy', 'Éditeur de graphiques : une courbe par', 'select', {choices: [['century', 'Siècle de naissance'], ['sex', 'Sexe']]}), C('hoverStep', 'Bulles au survol tous les … ans', 'range', {min: 1, max: 20, def: 5}), H_OPT],
            sample: () => ({o: {title: 'Combien étaient encore en vie à chaque âge', markAge: 5}, rows: sampleSurvival()})},
        fametiers: {icon: '🔀', label: 'Métiers de père en fils (flux sur plusieurs générations)', group: 'Généalogie', render: occflow, legend: 'bottom', fromApp: occApp,
            help: 'Les métiers d’une génération à l’autre : chaque bande suit des lignées, du trisaïeul au fils.',
            grids: [{key: 'rows', label: 'Les lignées (métier à chaque génération, du plus ancien au plus jeune)', cols: [C('g1', 'Génération 1'), C('g2', 'Génération 2'), C('g3', 'Génération 3'), C('g4', 'Génération 4'), C('g5', 'Génération 5'), C('value', 'Combien de lignées', 'number')]}, CATS('Couleur de chaque métier (facultatif)', 'Métier')],
            options: [C('top', 'Métiers montrés (les autres : « Autres métiers »)', 'range', {min: 2, max: 20, def: 7}), C('colorBy', 'Couleur des bandes', 'select', {choices: [['', 'Le métier de départ'], ['kept', 'Vert si le métier est gardé']]}), C('hideUnknown', 'Cacher les métiers inconnus', 'check'),
                C('colNames', 'Noms des colonnes (séparés par des virgules)'), C('labels', 'Noms des métiers', 'check', {def: true}), C('values', 'Nombres à côté des noms', 'check', {def: true}), C('summary', 'Phrase « même métier que la génération d’avant »', 'check', {def: true}),
                C('nodeW', 'Largeur des colonnes', 'range', {min: 4, max: 40, def: 14}), C('gap', 'Espace entre les métiers', 'range', {min: 0, max: 30, def: 8}), C('unknown', 'Nom des métiers inconnus', 'text', {def: 'Inconnu'}), H_OPT],
            sample: () => ({o: {title: 'Métiers de père en fils', colNames: 'Arrière-grand-père, Grand-père, Père, Fils'}, rows: sampleOcc()})},
        famariages: {icon: '💍', label: 'Rayon des mariages (distance entre les villages des époux)', group: 'Généalogie', render: radius, legend: 'bottom', fromApp: radiusApp,
            help: 'Chaque couple est un point : sa distance au centre est celle qui séparait les lieux de naissance des deux époux.',
            grids: [{key: 'rows', label: 'Les couples', cols: [C('a', 'Époux'), C('b', 'Épouse'), C('pa', 'Né à'), C('pb', 'Née à'), C('km', 'Distance', 'number', {unit: 'km'}), C('bearing', 'Direction (N, NE… ou degrés)'), C('year', 'Année du mariage')]}, CATS('Couleur de chaque siècle (facultatif)', 'Siècle (ex. XIXe s.)')],
            options: [C('scale', 'Échelle des distances', 'select', {choices: [['sqrt', 'Douce (racine carrée)'], ['log', 'Logarithmique (le proche en grand)'], ['linear', 'Proportionnelle']], def: 'sqrt'}), C('maxKm', 'Cercle extérieur (km, vide = auto)', 'number', {min: 1, max: 20000}), C('rings', 'Cercles (km, ex. 5, 10, 20, 50)'),
                C('colorBy', 'Couleur des points', 'select', {choices: [['', 'Par siècle du mariage'], ['distance', 'Selon la distance'], ['none', 'Une seule couleur']]}), C('dotColor', 'Couleur unique', 'color', {def: '#4e79a7', when: s => s.o?.colorBy === 'none'}),
                C('medians', 'Cercle de la distance médiane de chaque siècle', 'check', {def: true}), C('table', 'Tableau par siècle', 'check', {def: true}), C('dot', 'Taille des points', 'range', {min: 1.5, max: 12, step: .5, def: 4}), C('center', 'Nom du centre', 'text', {def: 'le village de l’époux'}), H_OPT],
            sample: () => ({o: {title: 'Où allait-on chercher son conjoint ?'}, rows: sampleRadius()})},
        faimplexe: {icon: '🧮', label: 'Implexe (ancêtres théoriques et réels)', group: 'Généalogie', render: implexe, legend: 'bottom', fromApp: implexeApp,
            help: 'Par génération : les ancêtres qu’on devrait avoir (2, 4, 8…), les places trouvées et les personnes différentes.',
            grids: [{key: 'rows', label: 'Les générations', cols: [C('gen', 'Génération (1 = la personne)', 'number'), C('theo', 'Possibles (vide = 2, 4, 8…)', 'number'), C('found', 'Places trouvées', 'number'), C('distinct', 'Personnes différentes', 'number')]}],
            options: [C('scale', 'Échelle', 'select', {choices: [['', 'Doublement (1, 4, 16, 64…)'], ['linear', 'Proportionnelle']]}), C('theo', 'Montrer les ancêtres possibles', 'check', {def: true}), C('pct', 'Taux d’implexe à droite', 'check', {def: true}), C('summary', 'Phrase de résumé', 'check', {def: true}),
                C('theoColor', 'Couleur des possibles', 'color', {def: '#d5dae1'}), C('foundColor', 'Couleur des places trouvées', 'color', {def: '#9ec5e8'}), C('distinctColor', 'Couleur des personnes différentes', 'color', {def: '#1f5fa8'}), C('barH', 'Épaisseur des barres', 'range', {min: 6, max: 40, def: 19})],
            sample: () => ({o: {title: 'Mon implexe, génération par génération'}, rows: sampleImplexe()})},
        famois: {icon: '📅', label: 'Mois des mariages et des conceptions (Carême, Avent)', group: 'Frises', render: months, legend: 'bottom', fromApp: monthsApp, fromPeople: monthsFromPeople,
            help: 'Les mariages et les conceptions (naissance − 9 mois) mois par mois, avec le Carême et l’Avent repérés.',
            grids: [{key: 'rows', label: 'Les mois (janvier à décembre)', series: 2, cols: [C('label', 'Mois')]}],
            options: [C('layout', 'Présentation', 'select', {choices: [['', 'Deux bandeaux (l’un sous l’autre)'], ['side', 'Côte à côte'], ['one', 'Seulement la première série']]}), C('pct', 'En % du total', 'check'), C('seasons', 'Repérer le Carême et l’Avent', 'check', {def: true}),
                C('expected', 'Ligne « si tout était égal » (selon les jours du mois)', 'check', {def: true}), C('values', 'Écrire les nombres', 'check'), H_OPT],
            sample: () => ({o: {title: 'Mariages et conceptions par mois (Bretagne, XVIIIe s.)'}, ...sampleMonths()})},
        fanaiss: {icon: '👶', label: 'Espacement des naissances (les enfants de chaque mère)', group: 'Frises', render: spacing, legend: 'bottom', fromApp: spacingApp,
            help: 'Une ligne par mère : ses enfants à l’âge qu’elle avait, l’écart entre deux naissances et les enfants morts jeunes.',
            grids: [{key: 'rows', label: 'Les enfants (une ligne par enfant)', cols: [C('mother', 'Mère'), C('mbirth', 'Naissance de la mère'), C('mdeath', 'Décès de la mère'), C('marriage', 'Mariage'), C('child', 'Enfant'), C('sex', 'Sexe', 'select', {choices: [['', '?'], ['h', 'Garçon'], ['f', 'Fille']]}), C('birth', 'Naissance de l’enfant'), C('death', 'Décès de l’enfant')]}],
            options: [C('axis', 'Axe', 'select', {choices: [['', 'L’âge de la mère'], ['year', 'Les années']]}), C('young', 'Mort jeune : avant … ans', 'range', {min: 1, max: 15, def: 5}), C('gaps', 'Écarts en mois entre deux naissances', 'check', {def: true}),
                C('sort', 'Ordre des mères', 'select', {choices: [['', 'Comme dans le tableau'], ['kids', 'Le plus d’enfants d’abord'], ['birth', 'Par date de naissance']]}), C('lanes', 'Mères au plus', 'range', {min: 1, max: 60, def: 15}), C('summary', 'Phrase de résumé', 'check', {def: true}),
                C('laneH', 'Hauteur des lignes', 'range', {min: 18, max: 80, def: 31}), C('dot', 'Taille des points', 'range', {min: 2, max: 14, step: .5, def: 5})],
            sample: () => ({o: {title: 'Les naissances de quatre mères de la famille'}, rows: sampleSpacing()})},
        falieux: {icon: '🏘️', label: 'Frise des lieux de vie (une bande par personne)', group: 'Frises', render: placestrip, legend: 'bottom', fromApp: placesApp,
            help: 'Une bande par personne, colorée selon la commune (ou le département, le pays) où elle vivait à chaque époque.',
            grids: [{key: 'rows', label: 'Les lieux (une ligne par lieu et par période)', cols: [C('person', 'Personne'), C('place', 'Commune'), C('start', 'De (année ou date)'), C('end', 'À'), C('county', 'Département'), C('country', 'Pays'), C('what', 'Pourquoi (naissance, recensement…)')]}, CATS('Couleur de chaque lieu (facultatif)', 'Lieu')],
            options: [C('level', 'Une couleur par', 'select', {choices: [['place', 'Commune'], ['county', 'Département'], ['country', 'Pays']], def: 'place'}), C('top', 'Lieux en couleur (les autres en gris)', 'range', {min: 2, max: 40, def: 14}), C('labels', 'Nom du lieu dans la bande', 'check', {def: true}),
                C('sort', 'Ordre', 'select', {choices: [['', 'Comme dans le tableau'], ['birth', 'Par date de début']]}), C('barH', 'Épaisseur des bandes', 'range', {min: 6, max: 40, def: 20}), C('from', 'Début (année, vide = auto)', 'number'), C('to', 'Fin (année, vide = auto)', 'number')],
            sample: () => ({o: {title: 'Où vivait la famille Martin'}, rows: samplePlaces()})},
    };
    for (const [k, kind] of Object.entries(NEW)) { if (!K[k]) K[k] = kind; }
    ext.diagramFamille = {knownPeople, survivalCurves, occPaths, relWord, bearingOf, median, monthIdx, KINDS: Object.keys(NEW)};

    /* ═════════ Un clic : la fiche, ou la liste des personnes concernées ═════════ */
    async function peopleDialog(ids, title, inEditor) {
        const dlg = document.createElement('dialog'); dlg.className = 'modal small-modal choose-list-dialog dfa-people';
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">DIAGRAMME</span><h2>${esc(title || 'Personnes')}</h2><p>${esc(plural(ids.length, 'personne'))}${inEditor ? ' — ferme l’éditeur pour ouvrir une fiche' : ' — un clic ouvre la fiche'}</p></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div><div class="choose-list" data-dfa-list>${window.LCNDA_UI.spinner('Chargement des personnes…')}</div><div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Fermer</button></div>`;
        document.body.appendChild(dlg);
        dlg.addEventListener('close', () => dlg.remove());
        dlg.addEventListener('click', e => {
            if (e.target.closest('[data-x]')) { dlg.close(); return; }
            const b = e.target.closest('[data-dfa-open]'); if (!b) return;
            if (inEditor) { A()?.toast?.(`${b.querySelector('b')?.textContent || 'Cette personne'} : ferme l’éditeur et clique à nouveau pour ouvrir sa fiche.`); return; }
            dlg.close(); A()?.openPersonById?.(Number(b.dataset.dfaOpen));
        });
        dlg.showModal();
        try {
            const r = await A().api('diagram_people', {ids: ids.slice(0, 400).join(',')});
            const yr = v => (String(v || '').match(/\d{3,4}/) || [''])[0];
            dlg.querySelector('[data-dfa-list]').innerHTML = (r.people || []).map(p => `<button type="button" class="choose-list-item" data-dfa-open="${Number(p.id) || 0}"><b>${esc(p.name || 'Sans nom')}</b> <small>${esc([yr(p.birth) && '° ' + yr(p.birth), yr(p.death) && '† ' + yr(p.death)].filter(Boolean).join(' · '))}</small></button>`).join('') || '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">👤</span><span class="empty-line-text">Aucune fiche trouvée.</span></p>';
        } catch (e) { dlg.querySelector('[data-dfa-list]').innerHTML = `<p class="muted">⚠️ ${esc(e.message || e)}</p>`; }
    }
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('click', e => {
        const t = e.target.closest?.('[data-dfa-pid], [data-dfa-pids]'); if (!t || t.closest('.h-dg-mini, .h-dg-gallery')) return;
        const inEditor = !!t.closest('.h-dg-dlg, dialog[open]');
        if (t.dataset.dfaPids) { peopleDialog(pids(t.dataset.dfaPids), t.dataset.dfaT || '', inEditor); return; }
        const id = pid(t.dataset.dfaPid); if (!id) return;
        if (inEditor) { A()?.toast?.(`${(t.querySelector('title')?.textContent || 'Cette personne').split(' · ')[0].split(' : ')[0]} : ferme l’éditeur et clique à nouveau pour ouvrir sa fiche.`); return; }
        A()?.openPersonById?.(id);
    });
})();
