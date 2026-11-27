/* LCNDA — 👤 Une vie (lot O, maquette validée docs/design/lot-o.html, parties 4, 5 et 6) : calculé sur l'ordinateur, rien pour une
 * personne vivante ou confidentielle (le serveur ne rend rien : lib/lot_o.php, lot_o_life).
 *  - 🕰 L'horloge de sa vie : toute la vie ramenée à une journée (né à minuit, mort à minuit) ; ⚙️ cadran 24 h | 12 h | une année,
 *    les grands événements du monde en plus, « Comparer avec… » (une deuxième aiguille) ; sans date de décès, pas d'horloge.
 *  - 🎂 Son âge à chaque grand événement : une ligne par événement, l'âge en grand (sa vie en vert, le monde en bleu, chacun avec
 *    sa source ↗ : « 🌍 Le monde autour », world_around) ; ⚙️ les sortes d'événements, une colonne par personne pour comparer.
 *  - 📰 Le bulletin du jour de sa naissance : seulement ce que l'app sait déjà (☀️ durée du jour et soleil, 🌦 météo si installée,
 *    🌙 lune, ✝️ saint et dicton, 🗞 cette année-là, 🥖 prix de référence si la date tombe dans leur période, ⛪ jour chômé,
 *    🎂 l'âge du père et des grands-parents) ; une ligne sans donnée ne s'affiche pas ; chaque ligne dit d'où elle vient.
 *  - La fiche : une phrase dans « 🌍 Le monde autour » (l'heure de son mariage sur l'horloge, avec 🕰 🎂 📰) et une dans
 *    « 🌒 La Lune et le ciel » (la durée du jour de sa naissance). Rien d'autre : pas de bloc en plus.
 *  Dans Listes → 🌳 Ce que dit l'arbre, partie « 👤 Une vie ». Réglages : « genealogie-arbre-dit » (comme les autres cartes).
 *  Essai : tests/test-lot-o-vie.js */
(() => {
    'use strict';
    const T = (s, v0) => { const v = v0 && Object.fromEntries(Object.entries(v0).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m)); };
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const C = () => ext.lotOCore;
    const LU = () => window.LCNDA_LUNE;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k) => A().toast?.(m, k);
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const KEY = 'genealogie-arbre-dit';
    const link = (url, label) => (UI().extLink ? UI().extLink(url, label) : `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">↗ ${esc(label)}</a>`);
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const WD = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
    const ymd = iso => String(iso || '').split('-').map(Number);
    const dateFr = iso => { const [y, m, d] = ymd(iso); return y && m && d ? `${d === 1 ? '1er' : d} ${T(MONTHS[m - 1])} ${y}` : y && m ? `${T(MONTHS[m - 1])} ${y}` : String(y || ''); };
    const yearOf = iso => ymd(iso)[0] || null;

    /* ═════ les réglages (même clé que les cartes de l'arbre) ═════ */
    const DEF = {clock: {dial: '24', world: false, with: 0}, ages: {cats: 'guerre,loi,régime,invention,épidémie,vie', with: 0}, bulletin: {rub: 'jour,temps,lune,saint,annee,pain,chome,famille', style: 'journal', rep: true, when: 'birth', date: ''}};
    const readAll = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
    const get = (card, k) => { const v = readAll()[card]?.[k]; return v === undefined ? DEF[card][k] : v; };
    function set(card, k, v) {
        const all = readAll(), cur = {...(all[card] || {})};
        if (v === undefined || v === DEF[card][k]) delete cur[k]; else cur[k] = v;
        if (Object.keys(cur).length) all[card] = cur; else delete all[card];
        try { if (Object.keys(all).length) localStorage.setItem(KEY, JSON.stringify(all)); else localStorage.removeItem(KEY); } catch (_) {}
    }
    const reset = (card, k, label, after) => { const run = () => set(card, k, undefined); if (A().undoLocalChange) A().undoLocalChange(T('« {r} » remis comme avant', {r: T(label)}), [KEY], run, after); else run(); after(); };

    /* ═════ les données d'une vie ═════ */
    const LIFE = new Map();
    const life = id => { if (!LIFE.has(id)) LIFE.set(id, A().api('lot_o_life', {id}).catch(e => ({ok: false, error: e.message}))); return LIFE.get(id); };
    const WORLD = new Map();
    const world = id => { if (!WORLD.has(id)) WORLD.set(id, A().api('world_around', {id, level: 1}).catch(() => ({events: []}))); return WORLD.get(id); };
    let monde = null;
    const mondeData = () => (monde ||= fetch('assets/data/monde-autour.json?v=1').then(r => (r.ok ? r.json() : {events: []})).catch(() => ({events: []})));
    let prix = null;
    const prixData = () => (prix ||= fetch('assets/data/prix-reference.json').then(r => (r.ok ? r.json() : {items: []})).catch(() => ({items: []})));
    const startId = () => Number(A().state?.bootstrap?.startPersonId) || Number(A().sosaRootId?.()) || 0;

    /* ═════ ☀️ la durée du jour (moteur de la Lune, d'après Jean Meeus) ═════ */
    function dayLength(iso, place) {
        const L = LU(), [y, m, d] = ymd(iso); if (!L || !y || !m || !d || place?.lat == null || place?.lon == null) return null;
        const rs = L.riseSet('sun', y, m, d, place.lat, place.lon, 0); if (rs.rise == null || rs.set == null) return null;
        const mins = Math.round((rs.set - rs.rise) * 1440); if (mins <= 0) return null;
        const clock = j => (L.localClock ? L.localClock(j, place.lat, place.lon, place.country || '').text : '');
        return {h: Math.floor(mins / 60), min: mins % 60, rise: clock(rs.rise), set: clock(rs.set)};
    }
    const lenText = x => T('{h} h {m} de jour', {h: x.h, m: String(x.min).padStart(2, '0')});

    /* ═════ 🕰 l'horloge ═════ */
    const KIND = {marriage: '💍', child: '👶', move: '🧳', world: '🌍'};
    const markLabel = (e, L) => (e.kind === 'marriage' ? T('mariage') : e.kind === 'child' ? (e.n === 1 ? T('1ᵉʳ enfant') : T('{n}ᵉ enfant', {n: e.n})) : e.kind === 'move' ? T('part pour {p}', {p: e.place}) : e.title || '');
    function clockSvg(c, dial, other) {
        const cx = 150, cy = 150, r = 120, H = dial === '12' ? 12 : dial === 'year' ? 12 : 24;
        let out = `<circle class="lo-face" cx="${cx}" cy="${cy}" r="${r}"/><circle class="lo-arc" cx="${cx}" cy="${cy}" r="${r - 18}"/>`;
        for (let h = 0; h < H; h++) { const a = (h / H) * 2 * Math.PI - Math.PI / 2, big = dial === '24' ? h % 6 === 0 : h % 3 === 0, r1 = big ? r - 12 : r - 6;
            out += `<line class="lo-tick" x1="${(cx + Math.cos(a) * r1).toFixed(1)}" y1="${(cy + Math.sin(a) * r1).toFixed(1)}" x2="${(cx + Math.cos(a) * r).toFixed(1)}" y2="${(cy + Math.sin(a) * r).toFixed(1)}"${big ? ' stroke-width="2"' : ''}/>`;
            if (big) out += `<text x="${(cx + Math.cos(a) * (r - 34)).toFixed(1)}" y="${(cy + Math.sin(a) * (r - 34) + 4).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700">${dial === 'year' ? esc(T(MONTHS[h]).slice(0, 4)) : `${h || H} h`}</text>`; }
        c.marks.forEach(m => { const a = m.frac * 2 * Math.PI - Math.PI / 2; out += `<circle class="lo-mark is-${m.kind}" cx="${(cx + Math.cos(a) * (r - 18)).toFixed(1)}" cy="${(cy + Math.sin(a) * (r - 18)).toFixed(1)}" r="6"><title>${esc(`${m.text} · ${markLabel(m)}`)}</title></circle>`; });
        const hand = (frac, cls, len) => { const a = frac * 2 * Math.PI - Math.PI / 2; return `<line class="${cls}" x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * len).toFixed(1)}" y2="${(cy + Math.sin(a) * len).toFixed(1)}" stroke-linecap="round"/>`; };
        if (other) out += hand(other.marks.find(m => m.kind === 'marriage')?.frac ?? 0, 'lo-hand is-other', r - 40);
        out += hand(c.marks.find(m => m.kind === 'marriage')?.frac ?? 0, 'lo-hand', r - 30) + `<circle class="lo-pin" cx="${cx}" cy="${cy}" r="5"/>`;
        const legend = c.marks.slice(0, 9).map((m, i) => `<circle class="lo-mark is-${m.kind}" cx="312" cy="${40 + i * 26}" r="6"/><text x="324" y="${44 + i * 26}" font-size="12">${esc(`${m.text} · ${markLabel(m)}`.slice(0, 34))}</text>`).join('');
        return `<svg class="lo-viz lo-clock" viewBox="0 0 520 300" role="img" aria-label="${esc(T('L’horloge de sa vie'))}" xmlns="http://www.w3.org/2000/svg">${out}${legend}</svg>`;
    }
    async function clockHtml(id) {
        const L = await life(id); if (!L.ok) return {html: emptyHtml(T('Rien pour une personne vivante, ni pour une fiche confidentielle.'))};
        if (!L.birth || !L.death) return {html: emptyHtml(T('Il faut la date de sa naissance et celle de sa mort pour faire l’horloge.'))};
        const dial = get('clock', 'dial'), H = dial === '12' ? 12 : 24;
        let evs = L.events.map(e => ({...e}));
        if (get('clock', 'world')) { const W = await world(id); evs = evs.concat((W.events || []).filter(e => e.from && e.cat !== 'local').slice(0, 8).map(e => ({kind: 'world', d: `${e.from}-07-01`, title: e.title}))); }
        let c;
        if (dial === 'year') { // une année : né le 1ᵉʳ janvier, mort le 31 décembre
            const base = C().clockOf(L.birth, L.death, evs, 12); if (!base) return {html: emptyHtml(T('Les dates ne permettent pas de faire l’horloge.'))};
            c = {...base, marks: base.marks.map(m => { const day = Math.floor(m.frac * 365), dt = new Date(Date.UTC(2001, 0, 1 + day)); return {...m, text: `${dt.getUTCDate() === 1 ? '1er' : dt.getUTCDate()} ${T(MONTHS[dt.getUTCMonth()])}`}; })};
        } else c = C().clockOf(L.birth, L.death, evs, H);
        if (!c) return {html: emptyHtml(T('Les dates ne permettent pas de faire l’horloge.'))};
        const other = get('clock', 'with') ? await life(Number(get('clock', 'with'))).then(O => (O.ok && O.birth && O.death ? {L: O, c: C().clockOf(O.birth, O.death, O.events, H)} : null)) : null;
        const own = c.marks.filter(m => m.kind !== 'world').slice(0, 3).map(m => `${markLabel(m)} ${dial === 'year' ? T('le {d}', {d: m.text}) : T('à {h}', {h: m.text})}`);
        const per = T('1 heure = {y} ans {m} mois de sa vie.', {y: c.perHour.y, m: c.perHour.m});
        const lead = T('{n} ({a}–{b}, {y} ans) : {l}.', {n: L.name, a: yearOf(L.birth), b: yearOf(L.death), y: c.years, l: own.join(', ') || T('aucun événement daté entre les deux')}) + (dial === 'year' ? '' : ' ' + per);
        const cmp = other?.c ? `<p class="lo-tact">${esc(T('Deuxième aiguille (pointillés) : le mariage de {n} sur le même cadran.', {n: other.L.name}))}</p>` : '';
        return {lead, html: `<p class="lo-lead">${esc(lead)}</p>${clockSvg(c, dial, other?.c)}${cmp}<p class="lo-tact">${esc(T('Minuit : la naissance ; minuit suivant : la mort.'))}</p>`};
    }

    /* ═════ 🎂 la règle des âges ═════ */
    const CATS = [['guerre', '⚔️', 'guerres'], ['loi', '📜', 'lois'], ['régime', '🏛️', 'régimes'], ['invention', '💡', 'inventions'], ['épidémie', '🦠', 'épidémies'], ['vie', '🌱', 'sa vie']];
    async function agesRows(id) {
        const L = await life(id); if (!L.ok || !L.birth) return null;
        const cats = String(get('ages', 'cats')).split(','), b = yearOf(L.birth), d = yearOf(L.death) || null, rows = [];
        if (cats.includes('vie')) {
            rows.push({y: b, age: 0, title: T('Sa naissance{p}', {p: L.bplace?.name ? ` ${T('à {p}', {p: L.bplace.name})}` : ''}), own: true});
            L.events.forEach(e => { const y = yearOf(e.d); rows.push({y, d: e.d, age: y - b, own: true, title: e.kind === 'marriage' ? (e.who ? T('Son mariage avec {w}', {w: e.who}) : T('Son mariage')) : e.kind === 'child' ? T('Naissance de son {n}', {n: e.n === 1 ? T('premier enfant') : T('{n}ᵉ enfant', {n: e.n})}) : T('Il part pour {p}', {p: e.place})}); });
            if (d) rows.push({y: d, age: d - b, title: T('Sa mort{p}', {p: L.dplace?.name ? ` ${T('à {p}', {p: L.dplace.name})}` : ''}), own: true});
        }
        const W = await world(id);
        (W.events || []).filter(e => cats.includes(e.cat) && e.from >= b && (!d || e.from <= d)).slice(0, 40).forEach(e => rows.push({y: e.from, age: e.from - b, title: e.title, url: e.url, src: e.src || ''}));
        return {L, rows: rows.filter(r => r.y).sort((x, y) => x.y - y.y || (x.own && y.own ? String(x.d || '').localeCompare(String(y.d || '')) : x.own ? -1 : y.own ? 1 : 0))};
    }
    async function agesHtml(id) {
        const a = await agesRows(id); if (!a) return {html: emptyHtml(T('Rien pour une personne vivante, ni pour une fiche confidentielle.'))};
        const col = r => `<ol class="lo-ages">${r.rows.map(x => `<li class="${x.own ? 'is-own' : 'is-world'}"><b>${esc(T('{n} ans', {n: x.age}))}</b><span>${esc(x.title)}${x.url ? ` ${link(x.url, x.src ? x.src.replace(/^Wikipédia\s*:\s*/, 'Wikipédia « ') + (x.src.startsWith('Wikipédia') ? ' »' : '') : 'Wikipédia')}` : ''}</span><small>${esc(x.y)}</small></li>`).join('')}</ol>`;
        const other = Number(get('ages', 'with')) ? await agesRows(Number(get('ages', 'with'))) : null;
        const lead = T('{n} avait… (une ligne par événement ; en vert sa vie, en bleu le monde)', {n: a.L.name});
        return {lead, html: `<p class="lo-lead">${esc(lead)}</p><div class="lo-ages-cols${other ? ' is-two' : ''}"><div><h4>${esc(a.L.name)}</h4>${col(a)}</div>${other ? `<div><h4>${esc(other.L.name)}</h4>${col(other)}</div>` : ''}</div>
            <p class="lo-tact">${esc(T('Événements de « 🌍 Le monde autour », chacun avec sa source ↗.'))}</p>`};
    }

    /* ═════ 📰 le bulletin ═════ */
    const RUB = [['jour', '☀️', 'Le jour'], ['temps', '🌦', 'Le temps'], ['lune', '🌙', 'La lune'], ['saint', '✝️', 'Le saint du jour'], ['annee', '🗞', 'Cette année-là'], ['pain', '🥖', 'Les prix'], ['chome', '⛪', 'Jour chômé ?'], ['famille', '🎂', 'Dans la famille']];
    const wpDay = (m, d) => `https://fr.wikipedia.org/wiki/${encodeURIComponent(`${d === 1 ? '1er' : d}_${MONTHS[m - 1]}`)}`;
    async function bulletinLines(L, iso, place) {
        const [y, m, d] = ymd(iso), want = String(get('bulletin', 'rub')).split(','), out = [];
        const add = (k, html) => { if (html && want.includes(k)) out.push([k, html]); };
        const dl = dayLength(iso, place);
        if (dl) add('jour', `${esc(T('{l}. Lever {r}, coucher {s}.', {l: lenText(dl), r: dl.rise, s: dl.set}))} <small class="muted">${esc(T('calculé (d’après Jean Meeus)'))}</small>`);
        if (want.includes('temps') && place?.lat != null && !kiosk()) {
            try { const r = await A().api('meteo_point', {lat: place.lat, lon: place.lon, date: iso, country: place.country || '', place: place.name || '', detail: '1'});
                const day = r?.result; if (r?.installed !== false && day?.ok) { const lk = ext.meteo?.look ? ext.meteo.look(day) : null, dd = day.day || {}, url = (day.sources || []).map(x => x.url).find(Boolean) || '';
                    const temp = [dd.tn != null ? T('{t} °C au matin', {t: dd.tn}) : '', dd.tx != null ? T('{t} °C au plus chaud', {t: dd.tx}) : ''].filter(Boolean).join(', ');
                    if (lk) add('temps', `${esc(`${lk.icon} ${T(lk.title)}${temp ? ` (${temp})` : ''}.`)} ${day.station ? `<small class="muted">${esc(T('station {n} à {k} km', {n: day.station.name, k: Math.round(day.station.km)}))}</small>` : ''} ${url ? link(url, T('source')) : ''}`); } } catch (_) {}
        }
        if (LU() && ext.lune?.phaseText) { const ph = LU().phase(LU().jd(y, m, d, 22)); add('lune', `${esc(ext.lune.phaseText(ph))} · ${esc(T('{n} % éclairée', {n: Math.round(ph.illumination)}))} <small class="muted">${esc(T('calculé (d’après Jean Meeus)'))}</small>`); }
        if (want.includes('saint') && ext.reglesActes?.load) {
            try { const J = await ext.reglesActes.load('jours'), day = J?.days?.[`${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`];
                if (day) { const s = (day.s || [])[0], dic = (day.d || [])[0]; const txt = [s ? T('Saint du jour : {s}.', {s: s[0]}) : '', dic ? `« ${dic[0]} »` : ''].filter(Boolean).join(' ');
                    if (txt) add('saint', `${esc(txt)} ${link(wpDay(m, d), 'Wikipédia')}`); } } catch (_) {}
        }
        if (want.includes('annee')) { const M = await mondeData(); const ev = (M.events || []).filter(e => e.level === 1 && e.from <= y && (e.to || e.from) >= y).slice(0, 2);
            if (ev.length) add('annee', ev.map(e => `${esc(e.title)} ${e.url ? link(e.url, 'Wikipédia') : ''}`).join(' · ')); }
        if (want.includes('pain')) { const P = await prixData(); const hit = (P.items || []).filter(i => i.from && i.to && iso >= i.from && iso <= i.to).slice(0, 2);
            if (hit.length) add('pain', hit.map(i => `${esc(i.text)} <small class="muted">${esc(T('Source : {s}', {s: i.source || ''}))}</small>`).join(' ')); }
        const c = C().chome(y, m, d);
        if (c) add('chome', `${esc(c.off ? (c.kind === 'dimanche' ? T('Oui : un dimanche.') : c.kind === 'decadi' ? T('Oui : un décadi (calendrier républicain).') : T('Oui : {f}.', {f: T(c.name)})) : T('Non : jour ouvrable.'))} ${link(c.rule === 'republicain' ? 'https://fr.wikipedia.org/wiki/Calendrier_r%C3%A9publicain' : c.rule === 'loi' ? 'https://fr.wikipedia.org/wiki/Jours_f%C3%A9ri%C3%A9s_en_France' : 'https://fr.wikipedia.org/wiki/Solennit%C3%A9', 'Wikipédia')}`);
        if (get('bulletin', 'when') === 'birth' && L.family?.length) {
            const ROLE = {father: 'son père', mother: 'sa mère', gf_p: 'son grand-père paternel', gm_p: 'sa grand-mère paternelle', gf_m: 'son grand-père maternel', gm_m: 'sa grand-mère maternelle'};
            add('famille', esc(L.family.filter(f => f.alive !== false).slice(0, 4).map(f => T('{r}, {n}, avait {a} ans', {r: T(ROLE[f.role] || f.role), n: f.name, a: f.age})).join(' ; ') + '.') + ` <small class="muted">${esc(T('d’après ta base'))}</small>`);
        }
        return out;
    }
    async function bulletinHtml(id) {
        const L = await life(id); if (!L.ok) return {html: emptyHtml(T('Rien pour une personne vivante, ni pour une fiche confidentielle.'))};
        const when = get('bulletin', 'when'), mar = L.events.find(e => e.kind === 'marriage');
        const iso = when === 'marriage' ? mar?.d : when === 'other' ? get('bulletin', 'date') : L.birth;
        const [y, m, d] = ymd(iso);
        const pick = `<div class="lo-row">${UI().segmented ? UI().segmented({label: T('Quelle date'), cls: 'sm', items: [['birth', 'Naissance'], ['marriage', 'Mariage'], ['other', 'Autre date…']].map(([v, l]) => ({on: when === v, html: esc(T(l)), attrs: `data-lov-seg="bulletin:when" data-v="${v}"`, disabled: v === 'marriage' && !mar}))}) : ''}${when === 'other' ? `<label class="lo-num"><span>${esc(T('Date'))}</span><input type="date" value="${esc(get('bulletin', 'date'))}" data-lov-date></label>` : ''}</div>`;
        if (!y || !m || !d) return {html: pick + emptyHtml(when === 'birth' ? T('Il faut la date de naissance au jour près.') : T('Choisis une date au jour près.'))};
        const place = when === 'marriage' ? (L.bplace) : L.bplace;
        const lines = await bulletinLines(L, iso, place);
        const wd = T(WD[C().weekday(C().jdn(y, m, d))]), rep = get('bulletin', 'rep') ? C().republicanText(y, m, d) : '';
        const what = when === 'birth' ? T('naissance de {n}', {n: L.name}) : when === 'marriage' ? T('mariage de {n}', {n: L.name}) : L.name;
        const head = `<header class="lo-bul-head"><h4>${esc(place?.name ? T('Le Petit Bulletin de {p}', {p: place.name}) : T('Le Petit Bulletin'))}</h4><p>${esc(`${wd[0].toUpperCase()}${wd.slice(1)} ${dateFr(iso)}`)}${rep ? ` — ${esc(rep)}` : ''} · ${esc(what)}</p></header>`;
        const body = lines.length ? `<dl class="lo-bul-lines">${lines.map(([k, h]) => { const r = RUB.find(x => x[0] === k); return `<div data-lov-line="${k}"><dt>${esc(r[1])} ${esc(T(r[2]))}</dt><dd>${h}</dd></div>`; }).join('')}</dl>` : emptyHtml(T('Rien de connu pour ce jour dans l’app.'));
        const lead = `${T('Le bulletin du {d}', {d: dateFr(iso)})} : ${lines.map(([k]) => T(RUB.find(x => x[0] === k)[2])).join(', ')}`;
        return {lead, text: lines.map(([k, h]) => `${RUB.find(x => x[0] === k)[1]} ${T(RUB.find(x => x[0] === k)[2])} : ${h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}`), title: `${place?.name ? T('Le Petit Bulletin de {p}', {p: place.name}) : T('Le Petit Bulletin')} — ${dateFr(iso)}`,
            html: `${pick}<article class="lo-bul is-${esc(get('bulletin', 'style'))}" data-lov-bulletin>${head}${body}</article>`};
    }

    /* ═════ les cartes de la page (Listes → 🌳 Ce que dit l'arbre, « 👤 Une vie ») ═════ */
    const emptyHtml = msg => (A().empty ? A().empty(msg, {icon: '👤'}) : `<p class="lo-lead">${esc(msg)}</p>`);
    const VCARDS = [
        {id: 'clock', icon: '🕰', title: 'L’horloge de sa vie', render: clockHtml, media: true,
            parts: [{icon: '🕛', label: 'Cadran', s: {k: 'dial', kind: 'seg', choices: [['24', '24 h'], ['12', '12 h'], ['year', 'Une année']]}}, {icon: '📌', label: 'Événements', s: {k: 'world', kind: 'toggle', label: 'Les grands événements du monde'}}, {icon: '👥', label: 'Comparer avec…', s: {k: 'with', kind: 'person'}}]},
        {id: 'ages', icon: '🎂', title: 'Son âge à chaque grand événement', render: agesHtml,
            parts: [{icon: '🌍', label: 'Quels événements', s: {k: 'cats', kind: 'multi', choices: CATS.map(c => [c[0], `${c[1]} ${c[2]}`])}}, {icon: '🖨', label: 'Pour imprimer', s: {k: 'with', kind: 'person', label: 'Une colonne par personne (comparer deux vies)'}}]},
        {id: 'bulletin', icon: '📰', title: 'Le bulletin du jour de sa naissance', render: bulletinHtml, print: true,
            parts: [{icon: '🧩', label: 'Les rubriques', s: {k: 'rub', kind: 'multi', choices: RUB.map(r => [r[0], `${r[1]} ${r[2]}`])}}, {icon: '🎨', label: 'Style', s: {k: 'style', kind: 'seg', choices: [['journal', 'Journal'], ['carte', 'Carte'], ['sobre', 'Sobre']]}}, {icon: '📅', label: 'Calendrier', s: {k: 'rep', kind: 'toggle', label: 'Date républicaine entre 1793 et 1805'}}]}];
    const OPEN = new Map(), PERSON = new Map(), LEADS = new Map(), TEXTS = new Map();
    function settingHtml(card, s, partLabel) {
        const v = get(card.id, s.k), changed = JSON.stringify(v) !== JSON.stringify(DEF[card.id][s.k]);
        let ctl = '';
        if (s.kind === 'seg') ctl = UI().segmented({label: T(partLabel), cls: 'sm', items: s.choices.map(([x, l]) => ({on: String(v) === x, html: esc(T(l)), attrs: `data-lov-seg="${card.id}:${s.k}" data-v="${esc(x)}"`}))});
        else if (s.kind === 'toggle') ctl = `<label class="ui-toggle"><input type="checkbox" data-lov-set="${card.id}:${s.k}"${v ? ' checked' : ''}><i></i>${esc(T(s.label))}</label>`;
        else if (s.kind === 'multi') { const on = String(v).split(','); ctl = s.choices.map(([x, l]) => `<label class="checkbox-line"><input type="checkbox" data-lov-multi="${card.id}:${s.k}" value="${esc(x)}"${on.includes(x) ? ' checked' : ''}> ${esc(T(l))}</label>`).join(''); }
        else if (s.kind === 'person') ctl = `${s.label ? `<span>${esc(T(s.label))}</span>` : ''}<button type="button" class="button small secondary" data-lov-pickwith="${card.id}:${s.k}">${esc(v ? T('👤 Changer la personne') : T('👤 Choisir une personne'))}</button>`;
        return `<span class="lo-set">${ctl}${changed ? `<button type="button" class="link-button lo-undo" data-lov-reset="${card.id}:${s.k}" data-label="${esc(partLabel)}" title="${esc(T('Remettre comme au départ'))}">${esc(T('↶ Comme avant'))}</button>` : ''}</span>`;
    }
    const persoHtml = card => { const open = OPEN.get(card.id); return `<details class="lo-perso" data-ui-noremember${open != null ? ' open' : ''}><summary>${esc(T('⚙️ Personnaliser'))}</summary>${card.parts.map((p, i) => `<details class="lo-pgrp" data-lo-part="${i}"${open === i ? ' open' : ''}><summary>${esc(p.icon)} ${esc(T(p.label))}</summary><div class="lo-row">${settingHtml(card, p.s, p.label)}</div></details>`).join('')}</details>`; };
    const shell = c => `<article class="card lo-card" data-lov-card="${c.id}"><header class="card-head"><h3><span aria-hidden="true">${esc(c.icon)}</span> ${esc(T(c.title))} <small data-lov-who></small></h3><span class="ui-badge is-blue">${esc(T('nouveau'))}</span></header><div class="card-body lo-body" data-lov-body>${UI().spinner ? UI().spinner(T('On lit l’arbre…')) : ''}</div></article>`;
    const actsHtml = c => `<div class="lo-acts"><span class="lo-src">${esc(T('Calculé sur sa fiche'))}</span><span class="lo-btns"><button type="button" class="button small secondary" data-lov-pick>${esc(T('👤 Une autre personne'))}</button>${c.print ? `<button type="button" class="button small secondary" data-lov-print>${esc(T('🖨 Imprimer'))}</button>` : ''}${!kiosk() && ext.connexions?.take ? `<button type="button" class="ib lo-ib" data-lov-bk title="${esc(T('Mettre au panier'))}" aria-label="${esc(T('Mettre au panier'))}">🧺</button>` : ''}${!kiosk() && A().importMediaFile ? `<button type="button" class="ib lo-ib" data-lov-keep title="${esc(T('Garder l’image dans les médias'))}" aria-label="${esc(T('Garder l’image dans les médias'))}">📎</button>` : ''}</span></div>`;
    async function paint(el) {
        const card = VCARDS.find(c => c.id === el.dataset.lovCard), body = el.querySelector('[data-lov-body]'), id = Number(el.dataset.lovPerson || PERSON.get(card.id) || startId());
        if (!id) { body.innerHTML = emptyHtml(T('Choisis une personne.')) + actsHtml(card); return; }
        try {
            const r = await card.render(id); if (!el.isConnected) return;
            body.innerHTML = r.html + (el.closest('dialog') ? '' : actsHtml(card)) + persoHtml(card);
            if (el.closest('dialog')) body.insertAdjacentHTML('beforeend', actsHtml(card).replace('data-lov-pick', 'data-lov-pick hidden'));
            LEADS.set(card.id, r.lead || ''); TEXTS.set(card.id, r);
            const who = (await life(id)).name; const w = el.querySelector('[data-lov-who]'); if (w) w.textContent = who ? `· ${who}` : '';
        } catch (e) { body.innerHTML = UI().notice ? UI().notice('error', esc(e.message || e)) : esc(e.message || e); }
    }
    const sectionHtml = () => `<h3 class="lo-sec">👤 ${esc(T('Une vie'))}</h3><div class="lo-grid" data-lov-grid>${VCARDS.map(shell).join('')}</div>`;
    function mount(root) { root.querySelectorAll('[data-lov-card]').forEach(paint); }

    /* 📎 l'image (horloge : le dessin ; bulletin : le texte posé sur une image) dans les médias, ↶ Annuler la retire */
    async function keep(el) {
        const card = VCARDS.find(c => c.id === el.dataset.lovCard), r = TEXTS.get(card.id) || {};
        let blob;
        const svgEl = el.querySelector('svg.lo-viz');
        if (svgEl) {
            const clone = svgEl.cloneNode(true), all = [svgEl, ...svgEl.querySelectorAll('*')], copies = [clone, ...clone.querySelectorAll('*')];
            all.forEach((n, i) => { const cs = getComputedStyle(n); ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'font-family', 'font-size', 'font-weight'].forEach(p => { const v = cs.getPropertyValue(p); if (v) copies[i].setAttribute(p, v); }); });
            const vb = svgEl.viewBox.baseVal, W = vb.width * 2, H = vb.height * 2; clone.setAttribute('width', W); clone.setAttribute('height', H);
            const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone)); });
            const c = document.createElement('canvas'); c.width = W + 40; c.height = H + 40; const g = c.getContext('2d'); g.fillStyle = getComputedStyle(el).backgroundColor || '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 20, 20, W, H);
            blob = await new Promise(ok => c.toBlob(ok, 'image/png'));
        } else {
            const lines = r.text || []; const W = 1240, c = document.createElement('canvas'); c.width = W; c.height = 260 + lines.length * 140; const g = c.getContext('2d');
            g.fillStyle = '#fffdf6'; g.fillRect(0, 0, W, c.height); g.fillStyle = '#222'; g.textAlign = 'center'; g.font = 'bold 52px Georgia, serif'; g.fillText(String(r.title || '').slice(0, 48), W / 2, 110);
            g.textAlign = 'left'; g.font = '30px Georgia, serif'; let y = 200;
            for (const t of lines) { let line = ''; for (const w of t.split(' ')) { const tt = line ? `${line} ${w}` : w; if (g.measureText(tt).width > W - 160 && line) { g.fillText(line, 80, y); y += 40; line = w; } else line = tt; } g.fillText(line, 80, y); y += 56; }
            blob = await new Promise(ok => c.toBlob(ok, 'image/png'));
        }
        const name = `${A().safeExportFilename ? A().safeExportFilename(T(card.title), 'vie') : 'vie'}.png`, put = () => A().importMediaFile(new File([blob], name, {type: 'image/png'}), ['image']);
        try { let it = await put(); A().undoToast ? A().undoToast(T('Image gardée dans les médias : « {t} ».', {t: T(card.title)}), {icon: '📎', undo: async () => { if (it?.id) await A().api('delete_media', {}, {method: 'POST', body: {media_id: Number(it.id)}}); }, redo: async () => { it = await put(); }}) : toast(T('Image gardée dans les médias.')); }
        catch (e) { toast(T('Image non gardée : {err}', {err: e.message || e}), 'error'); }
    }
    function printBulletin(el) {
        const art = el.querySelector('[data-lov-bulletin]'); if (!art) return;
        const UI = window.LCNDA_UI; // K13 : la fenêtre d'impression commune (aperçu, ⤓ PDF)
        if (UI?.openPrintDialog) return UI.openPrintDialog({title: T('Le bulletin'), icon: '📰', key: 'bulletin-naissance', html: art.outerHTML, pdf: true});
        toast(T('L’impression n’est pas disponible ici.'), 'error');
    }
    async function pickPerson(title) { const P = window.LCNDA_PICKER || A(); if (!P.openPicker) return 0; const it = await P.openPicker({kind: 'person', title}); return Number(it?.id) || 0; }

    document.addEventListener('click', async e => {
        const el = e.target.closest?.('[data-lov-card]'); if (!el) return;
        let b; const card = VCARDS.find(c => c.id === el.dataset.lovCard);
        if ((b = e.target.closest('[data-lov-seg]'))) { const [c, k] = b.dataset.lovSeg.split(':'); set(c, k, b.dataset.v); paint(el); return; }
        if ((b = e.target.closest('[data-lov-reset]'))) { const [c, k] = b.dataset.lovReset.split(':'); reset(c, k, b.dataset.label, () => paint(el)); return; }
        if ((b = e.target.closest('[data-lov-pickwith]'))) { const [c, k] = b.dataset.lovPickwith.split(':'); const id = await pickPerson(T('Comparer avec…')); if (id) { set(c, k, id); paint(el); } return; }
        if (e.target.closest('[data-lov-pick]')) { const id = await pickPerson(T('Choisir une personne')); if (id) { PERSON.set(card.id, id); delete el.dataset.lovPerson; paint(el); } return; }
        if (e.target.closest('[data-lov-print]')) { printBulletin(el); return; }
        if (e.target.closest('[data-lov-keep]')) { keep(el); return; }
        if (e.target.closest('[data-lov-bk]')) { const r = TEXTS.get(card.id) || {}; const v = (r.text || [LEADS.get(card.id) || '']).join('\n').slice(0, 4000); if (v) ext.connexions?.take?.([{kind: 'datum', ref_id: 0, title: `${card.icon} ${r.title || T(card.title)}`.slice(0, 200), value: v, origin: {kind: 'screen', label: '🌳 Ce que dit l’arbre'}}]); }
    });
    document.addEventListener('change', e => {
        const el = e.target.closest?.('[data-lov-card]'); if (!el) return; let t = e.target;
        if (t.matches('[data-lov-set]')) { const [c, k] = t.dataset.lovSet.split(':'); set(c, k, t.checked); paint(el); }
        else if (t.matches('[data-lov-multi]')) { const [c, k] = t.dataset.lovMulti.split(':'); const v = [...el.querySelectorAll(`[data-lov-multi="${c}:${k}"]:checked`)].map(x => x.value).join(','); set(c, k, v); paint(el); }
        else if (t.matches('[data-lov-date]')) { set('bulletin', 'date', t.value); paint(el); }
    });
    document.addEventListener('toggle', e => {
        const d = e.target; if (!d?.matches?.('[data-lov-card] details.lo-pgrp, [data-lov-card] details.lo-perso')) return;
        const id = d.closest('[data-lov-card]').dataset.lovCard;
        if (d.matches('.lo-perso')) { if (!d.open) OPEN.delete(id); else if (!OPEN.has(id)) OPEN.set(id, null); return; }
        if (!d.open) { if (OPEN.get(id) === Number(d.dataset.loPart)) OPEN.set(id, null); return; }
        OPEN.set(id, Number(d.dataset.loPart)); d.parentElement.querySelectorAll(':scope > details.lo-pgrp').forEach(o => { if (o !== d) o.open = false; });
    }, true);

    /** une carte dans une fenêtre, pour une personne (depuis la fiche) */
    function openFor(cardId, pid) {
        const c = VCARDS.find(x => x.id === cardId); if (!c || !ext.openDialog) return;
        ext.openDialog({eyebrow: T('👤 Une vie'), title: `${c.icon} ${T(c.title)}`, wide: true, body: shell(c).replace('data-lov-card=', `data-lov-person="${Number(pid)}" data-lov-card=`), submitLabel: T('Fermer'), onSubmit: () => true});
        setTimeout(() => document.querySelectorAll('dialog [data-lov-card]').forEach(el => { if (!el.dataset.lovDone) { el.dataset.lovDone = '1'; paint(el); } }), 30);
    }

    /* ═════ la fiche : une phrase dans 🌍 et une dans 🌒 ═════ */
    async function decorate() {
        const page = document.querySelector('#workspace .person-page'); if (!page) return;
        const wh = page.querySelector('[data-world-host]'), lh = page.querySelector('[data-lune-host]');
        const pid = Number(wh?.dataset.worldHost || lh?.dataset.luneHost || 0); if (!pid) return;
        const L = await life(pid); if (!page.isConnected) { schedule(); return; } if (!L.ok) return;
        const wl = wh?.querySelector('.h-world-lead');
        if (wl && !wh.querySelector('[data-lov-line]')) {
            const c = L.birth && L.death ? C().clockOf(L.birth, L.death, L.events, 24) : null, m = c?.marks.find(x => x.kind === 'marriage');
            const s = m ? T(L.sex === 'f' ? 'Si sa vie tenait en un jour, elle se serait mariée à {h}.' : 'Si sa vie tenait en un jour, il se serait marié à {h}.', {h: m.text}) : T('Sa vie en une journée, son âge à chaque événement, le bulletin de sa naissance :');
            wl.insertAdjacentHTML('afterend', `<p class="h-world-phrase lo-line" data-lov-line="vie">🕰 ${esc(s)} <button type="button" class="link-button" data-lov-open="clock">${esc(T('🕰 L’horloge'))}</button> · <button type="button" class="link-button" data-lov-open="ages">${esc(T('🎂 Son âge à chaque événement'))}</button> · <button type="button" class="link-button" data-lov-open="bulletin">${esc(T('📰 Le bulletin de sa naissance'))}</button></p>`);
        }
        if (lh && !lh.querySelector('.ui-spinner, .loading-block') && lh.innerHTML.trim() && !lh.querySelector('[data-lov-line]')) {
            const dl = L.birth ? dayLength(L.birth, L.bplace) : null;
            if (dl) lh.insertAdjacentHTML('afterbegin', `<p class="lo-line" data-lov-line="jour">☀️ ${esc(T(L.sex === 'f' ? 'Le jour de sa naissance{p}, le soleil a brillé {l} : lever {r}, coucher {s}.' : 'Le jour de sa naissance{p}, le soleil a brillé {l} : lever {r}, coucher {s}.', {p: L.bplace?.name ? ` ${T('à {p}', {p: L.bplace.name})}` : '', l: T('{h} h {m}', {h: dl.h, m: String(dl.min).padStart(2, '0')}), r: dl.rise, s: dl.set}))} <small class="muted">${esc(T('calculé (d’après Jean Meeus)'))}</small></p>`);
        }
    }
    document.addEventListener('click', e => { const b = e.target.closest?.('#workspace .person-page [data-lov-open]'); if (!b) return; const pid = Number(b.closest('[data-world-host]')?.dataset.worldHost || 0); if (pid) openFor(b.dataset.lovOpen, pid); });
    let pending = 0;
    function schedule() { if (pending || !document.querySelector('#workspace .person-page')) return; pending = setTimeout(() => { pending = 0; decorate().catch(() => {}); }, 150); }
    new MutationObserver(schedule).observe(document.documentElement, {childList: true, subtree: true});
    (ext.afterPerson = ext.afterPerson || []).push(() => { LIFE.clear(); WORLD.clear(); });

    /* ⌘K et 🧭 Je veux… */
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const goPage = card => ext.lotO?.open?.(`vie:${card}`);
    const WORDS = {clock: 'horloge vie journee heure jour', ages: 'age evenement regle des ages avait ans', bulletin: 'bulletin journal naissance jour une'};
    function provider(q) { const w = fold(q).split(/[^a-z0-9]+/).filter(x => x.length >= 3); if (!w.length) return []; return VCARDS.filter(c => w.every(x => fold(`${c.title} ${WORDS[c.id]}`).includes(x))).map(c => ({label: `${c.icon} ${T(c.title)}`, hint: T('Listes · 🌳 Ce que dit l’arbre'), go: () => goPage(c.id)})); }
    ext.quickSearchProviders = ext.quickSearchProviders || []; if (!ext.quickSearchProviders.includes(provider)) ext.quickSearchProviders.push(provider);
    (ext.intentsHand = ext.intentsHand || []).push(H => {
        const path = ['Listes', '👥 Personnes et familles', '🌳 Ce que dit l’arbre'];
        return [H('horloge_vie', 'montrer', '🕰', 'Voir sa vie en une journée', 'L’horloge de sa vie : né à minuit, mort à minuit, ses grands moments à leur heure.', path, {act: ['voir', 'faire'], obj: ['personne'], words: 'horloge vie journee heure', phrases: ['horloge de sa vie', 'sa vie en un jour'], go: () => goPage('clock'), target: 'list:arbre_dit', module: 'listes'}),
            H('regle_ages', 'montrer', '🎂', 'Voir son âge à chaque grand événement', 'Une ligne par événement, l’âge en grand : sa vie et le monde.', path, {act: ['voir', 'trouver'], obj: ['personne'], words: 'age evenement guerre avait ans', phrases: ['son age a chaque evenement', 'quel age avait il'], go: () => goPage('ages'), target: 'list:arbre_dit', module: 'listes'}),
            H('bulletin_naissance', 'imprimer', '📰', 'Faire le bulletin de sa naissance', 'Le jour, le temps, la lune, le saint, les prix : ce que l’app sait de ce jour-là.', path, {act: ['faire', 'imprimer'], obj: ['personne'], words: 'bulletin journal naissance jour', phrases: ['bulletin de sa naissance', 'le jour de sa naissance'], go: () => goPage('bulletin'), target: 'list:arbre_dit', module: 'listes'})];
    });

    ext.lotOVie = {sectionHtml, mount, openFor, dayLength, VCARDS, bulletinLines, life};
})();
