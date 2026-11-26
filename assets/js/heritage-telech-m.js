/**
 * LCNDA — 🏆 Sport et Expositions (lot M « téléchargements ») : les grandes compétitions, leurs vainqueurs, les matchs, les Jeux,
 *   les sportifs du village ; les Expositions du monde (universelles, internationales, coloniales, nationales, produits de l'industrie).
 * Livré avec l'app (assets/data/ts-*.json.gz et tx-*.json.gz, refaits par scripts/telech-m/*.py et .github/workflows/telech-m.yml) :
 *   🏆 ts-competitions  une ligne par édition (Tour, Giro, Vuelta, Paris-Roubaix, JO, Coupe du monde, Roland-Garros, Six Nations, Le Mans,
 *                       Dakar, Vendée Globe, Arc de Triomphe, marathons…) : dates, lieu, vainqueur (Wikidata CC0 ; listes de Wikipédia
 *                       CC BY-SA pour les vainqueurs manquants ; « non attribué » de Wikidata → « titre retiré »)
 *   🚲 ts-etapes        vainqueurs d'étape du Tour de France (Wikidata CC0) — PROLONGE l8c-tour (« 🎡 Le monde de son village ») :
 *                       les étapes ne sont pas recopiées, elles sont lues dans l8c-tour
 *   ⚽ ts-matchs        les matchs internationaux de football depuis 1872 (martj42/international_results, CC0)
 *   🏅 ts-jo            médailles olympiques des sportifs français (Wikidata CC0)
 *   🏃 ts-athletes      sportifs nés dans une commune de France (Wikidata CC0)
 *   🎪 tx-expos         Expositions du monde (Wikidata CC0 ; Wikipédia CC BY-SA : la liste des Expositions des produits de l'industrie,
 *                       la phrase sur les « villages » des expositions coloniales) — PROLONGE l8c-expos (22 lignes choisies à la main,
 *                       lues dans l8c-expos et gardées telles quelles, pas recopiées)
 * Ce que ça montre (personne décédée et non confidentielle seulement ; rien pour une fiche vivante) : ce jour-là (sa naissance, son
 *   mariage, sa mort), les Jeux de sa vie, le sport près de chez lui (rayon réglable, 15 km), les sportifs de son village, un homonyme
 *   champion (comparé sur l'ordinateur, jamais pour une fiche vivante ou confidentielle, ni en consultation), les Expositions de sa vie.
 *   Fiche d'un village, monographie, Listes (thème « sport » et « fetes » ; liste réunie « Compétitions sportives »), Cartes, à la demande.
 * Tout est lu sur l'ordinateur : rien ne part sur Internet (ni nom, ni lieu). Seuls les liens « ↗ » ouvrent une page, sur un clic.
 * localStorage : « genealogie-telech-m » (sujets, km = rayon « près de chez lui », winners = afficher les vainqueurs, view = vue du Tour).
 *   window.LCNDA_EXT.telechM = {core…, load, personInto, placeInto, tourWinners, radius, openSettings}
 * Essai : tests/test-telech-m.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const table = f => (f?.rows || []).map(r => (Array.isArray(r) ? Object.fromEntries((f.fields || []).map((k, i) => [k, r[i] ?? null])) : r));
    function km(a, b, c, d) { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); }
    const okLL = p => num(p?.lat) !== null && num(p?.lon) !== null && !(Number(p.lat) === 0 && Number(p.lon) === 0);
    const NOW = new Date().getFullYear();
    function lifeSpan(life) {
        const ys = (life?.events || []).map(e => num(e.year)).filter(y => y !== null);
        const b = num(life?.person?.birth), d = num(life?.person?.death);
        return {birth: b, death: d, from: b ?? (ys.length ? Math.min(...ys) : null), to: d ?? (b !== null ? Math.min(b + 85, NOW) : ys.length ? Math.max(...ys) : null)};
    }
    const DEATH = ['DEAT', 'BURI', 'CREM'];
    const isDead = life => num(life?.person?.death) !== null || (life?.events || []).some(e => DEATH.includes(String(e.tag || '').toUpperCase()));
    /** une vie du passé : décédée (un décès, une inhumation) ou née il y a plus de 110 ans */
    const past = life => isDead(life) || (num(life?.person?.birth) !== null && life.person.birth < NOW - 110);
    const placedEvents = life => (life?.events || []).filter(okLL).map(e => ({lat: Number(e.lat), lon: Number(e.lon), year: num(e.year), name: e.place || '', tag: String(e.tag || '').toUpperCase(), ins: String(e.insee || '')}));
    function near(rows, lat, lon, radius, max = 50) {
        const out = [], dLat = radius / 111, dLon = radius / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
        for (const r of rows) { if (num(r.lat) === null || Math.abs(r.lat - lat) > dLat || Math.abs(r.lon - lon) > dLon) continue; const k = km(lat, lon, r.lat, r.lon); if (k <= radius) out.push({r, km: k}); }
        return out.sort((a, b) => a.km - b.km).slice(0, max);
    }
    const ageAt = (life, y) => (num(life?.person?.birth) !== null && y !== null ? y - Number(life.person.birth) : null);
    const fullDate = e => { const m = String(e?.date || '').match(/^(\d{4})-(\d\d)-(\d\d)/); return m && m[2] !== '00' && m[3] !== '00' ? m[0] : ''; };
    const safeUrl = u => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
    const isQ = q => /^Q\d+$/.test(String(q || ''));

    /* ── 🚲 le Tour de France (étapes lues dans l8c-tour) ── */
    /** les étapes d'une édition, dans l'ordre, avec la lettre des demi-étapes (5a, 5b) ; prologue = « 0 » */
    function tourStages(stages) {
        const list = [...stages].sort((a, b) => String(a.d).localeCompare(String(b.d)) || (num(a.no) ?? 99) - (num(b.no) ?? 99));
        const count = {};
        for (const s of list) count[s.no] = (count[s.no] || 0) + 1;
        const seen = {};
        return list.map(s => { const n = String(s.no ?? ''); const i = (seen[n] = (seen[n] || 0) + 1); return {...s, label: n === '0' ? 'prologue' : count[n] > 1 ? `${n}${'abcdef'[i - 1] || ''}` : n}; });
    }
    /** « 22 étapes + prologue » : les numéros d'étape (les demi-étapes comptent pour une), le prologue à part, et les tronçons */
    function stageCount(stages) {
        const nums = new Set(), prologue = stages.some(s => String(s.no) === '0' || /prologue/i.test(s.n || ''));
        for (const s of stages) if (String(s.no) !== '0' && !/prologue/i.test(s.n || '')) nums.add(String(s.no));
        return {n: nums.size, prologue, parts: stages.length};
    }
    /** les éditions du Tour : une par année (étapes de l8c-tour, vainqueur de ts-competitions) */
    function tourEditions(stages, comps) {
        const by = new Map();
        for (const s of stages) { if (!by.has(s.y)) by.set(s.y, []); by.get(s.y).push(s); }
        const win = new Map(comps.filter(c => c.c === 'tdf').map(c => [c.y, c]));
        return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([y, list]) => {
            const st = tourStages(list), c = stageCount(list), w = win.get(y);
            const kms = st.map(s => num(s.km)); const total = kms.every(k => k !== null) ? kms.reduce((a, k) => a + k, 0) : null;
            return {y, stages: st, ...c, km: total, from: st[0]?.a || '', to: st.at(-1)?.b || '', d1: st[0]?.d || '', d2: st.at(-1)?.d || '', ed: st[0]?.ed || '', edwiki: st[0]?.edwiki || '',
                winners: w?.w || [], retired: !!w?.ret};
        });
    }
    /** les étapes du Tour parties ou arrivées à moins de `radius` km de ses lieux, pendant sa vie */
    function tourNear(stages, life, radius) {
        const s = lifeSpan(life); if (s.from === null) return [];
        const out = new Map();
        for (const e of placedEvents(life)) for (const st of stages) {
            if (st.y < s.from || st.y > s.to) continue;
            for (const [end, la, lo, town] of [['depart', st.ala, st.alo, st.a], ['arrivee', st.bla, st.blo, st.b]]) {
                if (num(la) === null) continue; const k = km(e.lat, e.lon, la, lo); if (k > radius) continue;
                const key = `${st.q}|${end}`, cur = out.get(key); if (!cur || k < cur.km) out.set(key, {s: st, end, town, km: k, place: e.name, age: ageAt(life, st.y)});
            }
        }
        return [...out.values()].sort((a, b) => a.km - b.km || a.s.y - b.s.y);
    }

    /* ── 📅 ce jour-là ── */
    const DAY_TAGS = [['naissance', ['BIRT', 'BAPM', 'CHR']], ['mariage', ['MARR']], ['deces', ['DEAT', 'BURI']]];
    function sameDay(life, {stages = [], matches = [], comps = []} = {}) {
        const out = [];
        for (const [kind, tags] of DAY_TAGS) {
            const e = (life?.events || []).find(x => tags.includes(String(x.tag || '').toUpperCase()) && fullDate(x)); if (!e) continue;
            const d = fullDate(e), items = [];
            for (const c of comps) if (c.d1 === d || (c.d2 === d && c.c !== 'jo' && c.c !== 'joh')) items.push({k: 'comp', c, rank: c.c === 'jo' || c.c === 'joh' ? 0 : 1});
            for (const s of stages) if (s.d === d) items.push({k: 'stage', s, rank: 2});
            const ms = matches.filter(m => m.d === d);
            const fr = ms.filter(m => m.h === 'France' || m.a === 'France'), big = ms.filter(m => /Coupe du monde|Euro$|Jeux olympiques/.test(m.t) && !fr.includes(m));
            for (const m of [...fr, ...big].slice(0, 3)) items.push({k: 'match', m, rank: fr.includes(m) ? 1 : 3});
            if (items.length) out.push({kind, d, place: e.place || '', items: items.sort((a, b) => a.rank - b.rank)});
        }
        return out;
    }

    /* ── 🏅 les Jeux de sa vie ── */
    function gamesOfLife(comps, life) {
        const s = lifeSpan(life); if (s.from === null) return [];
        const ev = placedEvents(life);
        return comps.filter(c => (c.c === 'jo' || c.c === 'joh') && c.y >= (s.birth ?? s.from) && c.y <= s.to).map(c => {
            let best = null; if (num(c.lat) !== null) for (const e of ev) { const k = km(e.lat, e.lon, c.lat, c.lon); if (!best || k < best.km) best = {km: k, place: e.name}; }
            return {c, age: ageAt(life, c.y), ...(best || {km: null, place: ''})};
        }).sort((a, b) => Number((b.age ?? 0) >= 8) - Number((a.age ?? 0) >= 8) || Number((b.km ?? 1e9) <= 800) - Number((a.km ?? 1e9) <= 800) || (a.km ?? 1e9) - (b.km ?? 1e9) || a.c.y - b.c.y);
    }

    /* ── 📍 le sport près de chez lui ── */
    /** les matchs internationaux joués à moins de `radius` km de ses lieux pendant sa vie (il avait au moins 6 ans) */
    function matchesNear(matches, life, radius) {
        const s = lifeSpan(life); if (s.from === null) return [];
        const out = new Map();
        for (const e of placedEvents(life)) for (const x of near(matches, e.lat, e.lon, radius, 5000)) {
            const y = num(x.r.d.slice(0, 4)); if (y < (s.birth ?? s.from) + 6 || y > s.to) continue;
            const k = `${x.r.d}|${x.r.h}|${x.r.a}`, cur = out.get(k); if (!cur || x.km < cur.km) out.set(k, {...x, place: e.name, age: ageAt(life, y), y});
        }
        return [...out.values()].sort((a, b) => a.r.d.localeCompare(b.r.d));
    }
    /** les compétitions courues à moins de `radius` km de ses lieux (Le Mans, Roubaix, Roland-Garros…), regroupées, pendant sa vie */
    function compsNear(comps, life, radius) {
        const s = lifeSpan(life); if (s.from === null) return [];
        const by = new Map();
        for (const e of placedEvents(life)) for (const x of near(comps, e.lat, e.lon, radius, 5000)) {
            const c = x.r; if (c.y < (s.birth ?? s.from) + 6 || c.y > s.to || c.c === 'tdf') continue;
            const g = by.get(c.c) || {c: c.c, km: x.km, place: e.name, town: c.place, eds: new Map()};
            if (x.km < g.km) { g.km = x.km; g.place = e.name; g.town = c.place; }
            g.eds.set(c.y, c); by.set(c.c, g);
        }
        return [...by.values()].map(g => ({...g, eds: [...g.eds.values()].sort((a, b) => a.y - b.y)})).sort((a, b) => a.km - b.km);
    }

    /* ── 🏃 les sportifs de son village ── */
    function birthPlace(life) { const ev = placedEvents(life); return ev.find(e => ['BIRT', 'BAPM', 'CHR'].includes(e.tag)) || null; }
    function athletesOf(rows, place, radius = 2) {
        if (!place) return [];
        const ins = String(place.ins || place.insee || '');
        const lat = num(place.lat), lon = num(place.lon);
        return rows.filter(a => (ins && a.ins === ins) || (!ins && lat !== null && num(a.lat) !== null && km(lat, lon, a.lat, a.lon) <= radius)).sort((a, b) => (b.sl || 0) - (a.sl || 0) || (a.b ?? 9999) - (b.b ?? 9999));
    }

    /* ── 🔎 un homonyme champion ── */
    const nameKey = s => fold(s).replace(/\b(de|du|des|le|la|d|l|van|von|der|den)\b/g, ' ').replace(/\s+/g, ' ').trim();
    /** les noms des listes → index « prénom nom » plié ; candidates = [{n, b, d, why, url, q}] */
    function nameIndex(cands) {
        const idx = new Map();
        for (const c of cands) { const k = nameKey(c.n); if (!k || k.split(' ').length < 2) continue; if (!idx.has(k)) idx.set(k, []); idx.get(k).push(c); }
        return idx;
    }
    /** la fiche (prénom, nom) dans l'index : même premier prénom et même nom ; « probable » si l'année de naissance est à ± 3 ans */
    function homonyms(idx, life) {
        const first = nameKey(String(life?.person?.first || '').split(/[\s,-]+/)[0]), last = nameKey(life?.person?.last || '');
        if (!first || !last) return [];
        const b = num(life?.person?.birth);
        const hits = idx.get(`${first} ${last}`) || [];
        const seen = new Set();
        return hits.filter(c => (seen.has(c.q || c.n + c.why) ? false : seen.add(c.q || c.n + c.why)))
            .map(c => ({...c, probable: b !== null && num(c.b) !== null && Math.abs(c.b - b) <= 3}))
            .filter(c => b === null || num(c.b) === null || Math.abs(c.b - b) <= 60)
            .sort((a, c) => Number(c.probable) - Number(a.probable));
    }

    /* ── 🎪 les Expositions de sa vie ── */
    const JOB_ARTISAN = /\b(fabricant|manufacturier|artisan|ebeniste|horloger|orfevre|bijoutier|tisserand|fileur|filateur|imprimeur|relieur|serrurier|forgeron|coutelier|armurier|tanneur|chapelier|cordonnier|potier|faiencier|verrier|luthier|facteur d|ingenieur|mecanicien|constructeur|teinturier|brodeuse|dentelliere|passementier|tapissier|menuisier|charron|sellier|bourrelier|chaudronnier|fondeur|graveur|lithographe|photographe|negociant|industriel)\b/;
    const isArtisan = life => JOB_ARTISAN.test(fold((life?.jobs || []).map(j => j.text).join(' ; ')));
    /** les Expositions (pas celles déjà choisies à la main dans l8c-expos) à moins de `radius` km de ses lieux, de son vivant (≥ 5 ans) */
    function exposNear(rows, life, radius = 50) {
        const s = lifeSpan(life); if (s.from === null) return [];
        const out = new Map();
        for (const e of placedEvents(life)) for (const x of near(rows.filter(r => !r.hand), e.lat, e.lon, radius, 500)) {
            const r = x.r; if (r.y < (s.birth ?? s.from) + 5 || r.y > s.to) continue;
            const cur = out.get(r.q || r.n); if (!cur || x.km < cur.km) out.set(r.q || r.n, {...x, place: e.name, age: ageAt(life, r.y)});
        }
        return [...out.values()].sort((a, b) => a.r.y - b.r.y);
    }
    const core = {num, fold, table, km, lifeSpan, isDead, past, placedEvents, near, ageAt, fullDate, safeUrl, tourStages, stageCount, tourEditions, tourNear, sameDay, gamesOfLife,
        matchesNear, compsNear, birthPlace, athletesOf, nameKey, nameIndex, homonyms, isArtisan, exposNear};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const DATA_V = 1;
    const KEY = 'genealogie-telech-m';
    const TAB = ['telech_m', '25tm', '🏆 Sport et Expositions'];
    const BLOCK = 'telech_m';
    const PARTS = [
        ['competitions', '🏆 Les compétitions et leurs vainqueurs', 'Tour de France, Jeux olympiques, Coupe du monde, Roland-Garros, Six Nations, 24 Heures du Mans… : une ligne par édition, avec le vainqueur.'],
        ['cejour', '📅 Ce jour-là', 'Ce qui se jouait le jour de sa naissance, de son mariage, de sa mort (étape du Tour, match de la France, grande course).'],
        ['jeux', '🏅 Les Jeux de sa vie', 'Les Jeux olympiques de son vivant, avec son âge ; ceux qui ont eu lieu près de chez lui d’abord.'],
        ['pres', '📍 Le sport près de chez lui', 'Les matchs et les grandes courses à moins de quelques kilomètres de ses lieux, de son vivant (le rayon se règle ci-dessous).'],
        ['athletes', '🏃 Les sportifs de son village', 'Les sportifs connus nés dans sa commune, et les médaillés olympiques.'],
        ['homonyme', '🔎 Un homonyme champion ?', 'Un champion ou un sportif qui porte le même prénom et le même nom (comparé sur l’ordinateur, seulement pour une personne décédée).'],
        ['expos', '🎪 Les Expositions du monde', 'Les Expositions universelles, internationales, coloniales et régionales près de chez lui, et les catalogues d’exposants pour chercher un artisan.']];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), winners: true, km: 15, view: 'editions', ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const radius = () => { const k = Number(settings().km); return k >= 1 && k <= 100 ? k : 15; };
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const kmTxt = k => (k < 1.5 ? T('sur place') : T('{n} km', {n: String(Math.round(k))}));
    const link = (url, label) => { const u = safeUrl(url); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label); };
    const srcLink = url => { const u = safeUrl(url); return u ? `<a class="tsx-src-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(T('↗ source'))}</a>` : ''; };
    const row = (icon, html, src, extra = '') => `<div class="hist-row tsx-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="tsx-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const hyp = t => `<small class="muted hist-hyp">${esc(t)}</small>`;
    const quote = t => (t ? `<q class="tsx-quote">${esc(t)}</q>` : '');
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const wd = q => (isQ(q) ? `https://www.wikidata.org/wiki/${q}` : '');
    const wp = (t, host = 'fr') => (t ? `https://${host}.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}` : '');
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dateTxt = d => { const m = String(d || '').match(/^(\d{4})-(\d\d)-(\d\d)/); if (!m) return String(d || '').slice(0, 4); const day = Number(m[3]); return `${day === 1 ? '1er' : day} ${T(MONTHS[Number(m[2]) - 1])} ${m[1]}`; };
    const LIC = {wd: () => `${link('https://www.wikidata.org/wiki/Wikidata:Copyright', 'Wikidata')} (CC0)`,
        wp: (u, label = 'Wikipédia') => `${link(u || 'https://fr.wikipedia.org', label)} (${link('https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'CC BY-SA 4.0')}, ${esc(T('les contributeurs de Wikipédia'))})`,
        res: () => `${link('https://github.com/martj42/international_results', 'martj42/international_results')} (CC0)`,
        ia: () => `${link('https://archive.org', 'Internet Archive')} (${esc(T('liens seulement'))})`};

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    const FILES = {comps: 'ts-competitions', etapes: 'ts-etapes', matchs: 'ts-matchs', jo: 'ts-jo', athletes: 'ts-athletes', expos: 'tx-expos', tour: 'l8c-tour', expos8: 'l8c-expos'};
    const data = {};
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir ces fichiers.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    const shape = {
        matchs: f => { const tm = f.teams || [], tr = f.tournaments || [], cy = f.countries || []; return (f.rows || []).map(r => ({d: r[0], h: tm[r[1]] || '', a: tm[r[2]] || '', hs: r[3], as: r[4], t: tr[r[5]] || '', city: r[6], cty: cy[r[7]] || '', neutral: r[8], so: r[9] >= 0 ? tm[r[9]] || '' : '', lat: r[10], lon: r[11], ins: r[12] || ''})); },
        comps: f => table(f).map(r => ({...r, w: Array.isArray(r.w) ? r.w.filter(w => Array.isArray(w)) : []})),
        expos8: f => (f.rows || []).map(r => ({...r, hand: 1}))};
    function load(kind) {
        if (!FILES[kind]) return Promise.resolve(null);
        if (!data[kind]) data[kind] = fetch(`assets/data/${FILES[kind]}.json.gz?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (r.status === 404) return null; if (!r.ok) throw new Error(T('Le fichier {f} est introuvable.', {f: FILES[kind]})); return readMaybeGz(r); })
            .then(f => (f ? {meta: f, rows: (shape[kind] || table)(f)} : null))
            .catch(e => { delete data[kind]; throw e; });
        return data[kind];
    }
    const quiet = p => p.catch(() => null);
    const rowsOf = kind => quiet(load(kind)).then(D => D || {meta: {}, rows: []});
    const compMeta = async () => Object.fromEntries(((await rowsOf('comps')).meta.comps || []).map(c => [c.id, c]));
    const compLabel = (M, id) => (M[id] ? `${M[id].icon} ${T(M[id].label)}` : id);
    let editionsMemo = null;
    const editions = () => (editionsMemo ||= Promise.all([rowsOf('tour'), rowsOf('comps')]).then(([S, C]) => tourEditions(S.rows, C.rows)));
    /** pour « 🎡 Le monde de son village » : l'année → {winners, retired} du Tour (null si l'on ne montre pas les vainqueurs) */
    async function tourWinners() { if (!settings().winners) return null; const C = await rowsOf('comps'); return new Map(C.rows.filter(c => c.c === 'tdf').map(c => [c.y, {winners: c.w, retired: !!c.ret}])); }
    async function stageWinners() { const E = await rowsOf('etapes'); return new Map(E.rows.map(r => [r.s, r])); }
    const lifeMemo = new Map();
    const lifeOf = id => { const H = ext.histoireAutour; if (H?.lifeOf) return H.lifeOf(id); if (!lifeMemo.has(id)) lifeMemo.set(id, api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };
    const kiosk = () => !!(root.document?.body?.classList.contains('is-kiosk') || root.LCNDA_GUEST);
    const He = P => (P?.gender === 'female' ? T('Elle') : T('Il'));
    const lui = P => (P?.gender === 'female' ? T('elle') : T('lui'));

    /* ─────────── les morceaux ─────────── */
    const winnersTxt = (c, M) => { if (c.ret) return T('titre retiré'); if (!c.w?.length || !settings().winners) return ''; return c.w.map(w => (w[2] && !['', 'vainqueur', 'finale', 'pilote', 'cheval'].includes(w[2]) ? `${w[0]} (${T(w[2])})` : w[0])).join(', '); };
    const compSrc = c => (c.q ? wd(c.q) : c.fr ? wp(c.fr) : '');
    const compLi = (c, M, extra = '') => { const w = winnersTxt(c, M); return `<li><b>${esc(String(c.y))}</b> · ${esc(compLabel(M, c.c))}${c.place ? ` <small class="muted">(${esc(c.place)})</small>` : ''}${w ? ` — ${esc(w)}` : ''}${extra} ${srcLink(compSrc(c))}</li>`; };
    const score = m => `${esc(m.h)} ${esc(String(m.hs))}–${esc(String(m.as))} ${esc(m.a)}${m.so ? ` <small class="muted">(${esc(T('tirs au but : {t}', {t: m.so}))})</small>` : ''}`;
    const matchLi = (x, withAge = true) => `<li><b>${esc(dateTxt(x.r.d))}</b> · ${score(x.r)} <small class="muted">(${esc([T(x.r.t), x.r.city, x.km !== undefined ? kmTxt(x.km) : '', withAge && x.age !== null && x.age !== undefined ? T('{a} ans', {a: String(x.age)}) : ''].filter(Boolean).join(' · '))})</small></li>`;
    const RES_URL = 'https://github.com/martj42/international_results';
    const athleteLi = a => `<li>🏃 <b>${link(a.fr ? wp(a.fr) : wd(a.q), a.n)}</b> <small class="muted">(${esc([a.b ? (a.d ? `${a.b}–${a.d}` : T('né en {y}', {y: String(a.b)})) : '', a.sport].filter(Boolean).join(' · '))})</small> ${srcLink(wd(a.q))}</li>`;
    const MEDAL = {or: '🥇', argent: '🥈', bronze: '🥉'};
    const medalLi = m => `<li>${MEDAL[m.medal] || '🏅'} <b>${link(m.fr ? wp(m.fr) : wd(m.q), m.n)}</b> <small class="muted">(${esc([String(m.y || ''), m.event].filter(Boolean).join(' · '))})</small> ${srcLink(wd(m.evq) || wd(m.q))}</li>`;
    const EXPO_KIND = {universelle: 'Exposition universelle', internationale: 'Exposition internationale', coloniale: 'Exposition coloniale', nationale: 'Exposition nationale ou régionale', produits: 'Exposition des produits de l’industrie', horticole: 'Exposition horticole'};
    const expoSrc = r => (r.q ? wd(r.q) : r.fr ? wp(r.fr) : r.url || '');
    const iaLink = c => (/^[A-Za-z0-9._-]+$/.test(c[0] || '') ? `https://archive.org/details/${c[0]}` : '');
    const iaSearch = r => `https://archive.org/search?query=${encodeURIComponent(`catalogue exposition ${r.y}`)}&sin=TXT`;
    const catsHtml = r => ((r.cat?.length || (r.country === 'France' && r.y <= 1937)) ? `<p class="muted tsx-links">${esc(T('Catalogues de l’époque à feuilleter (Internet Archive) — on y cherche soi-même le nom d’un exposant :'))} ${(r.cat || []).map(c => link(iaLink(c), `↗ ${c[1]}${c[2] ? ` (${c[2]})` : ''}`)).join(' · ')}${r.cat?.length ? ' · ' : ''}${link(iaSearch(r), T('↗ d’autres catalogues de {y}', {y: String(r.y)}))}</p>` : '');
    function zooHtml(r, meta) {
        if (r.k !== 'coloniale') return '';
        const Z = meta.zoo || {};
        const refs = (Z.refs || []).map(x => link(x[1], x[0])).join(' ; ');
        // ce que dit l'article de cette exposition, s'il le dit ; sinon le fait général, sans l'affirmer pour celle-ci
        return `<div class="tsx-zoo"><p>${esc(T(r.zoo ? 'Comme dans beaucoup d’expositions coloniales, des hommes, des femmes et des enfants venus des colonies y furent montrés au public dans des « villages » reconstitués : ce qu’on appelle aujourd’hui des « zoos humains ».' : 'Beaucoup d’expositions coloniales montraient au public, dans des « villages » reconstitués, des hommes, des femmes et des enfants venus des colonies : ce qu’on appelle aujourd’hui des « zoos humains ». La source ne dit pas si ce fut le cas ici.'))}</p>${r.zoo ? `${quote(r.zoo)} ${srcLink(wp(r.fr))}` : ''}<small class="muted">${esc(T('Pour comprendre :'))} ${link(Z.url || 'https://fr.wikipedia.org/wiki/Zoo_humain', T('« Zoo humain » (Wikipédia)'))}${refs ? ` ; ${refs}` : ''}</small></div>`;
    }
    const expoLi = (x, meta) => { const r = x.r || x; return `<li>🎪 <b>${link(expoSrc(r), r.n)}</b> <small class="muted">(${esc([String(r.y) + (r.y2 && r.y2 !== r.y ? `–${r.y2}` : ''), r.city, T(EXPO_KIND[r.k] || r.k || ''), r.vis ? T('{n} visiteurs', {n: nf(r.vis)}) : '', x.km !== undefined ? kmTxt(x.km) : '', x.age !== undefined && x.age !== null ? T('{a} ans', {a: String(x.age)}) : ''].filter(Boolean).join(' · '))})</small> ${srcLink(expoSrc(r))}${r.line ? quote(r.line) : ''}${r.refnec ? hyp(T('Wikipédia demande une source pour ces chiffres.')) : ''}${zooHtml(r, meta)}${catsHtml(r)}</li>`; };

    /* ─────────── 👤 la fiche d'une personne ─────────── */
    const PERSON_PARTS = ['cejour', 'jeux', 'pres', 'athletes', 'homonyme', 'expos'];
    const JOBS = {
        cejour: async life => {
            const [S, Mt, C, M] = await Promise.all([rowsOf('tour'), rowsOf('matchs'), rowsOf('comps'), compMeta()]);
            const list = sameDay(life, {stages: S.rows, matches: Mt.rows, comps: C.rows}); if (!list.length) return '';
            const KIND = {naissance: 'Le jour de sa naissance ({d})', mariage: 'Le jour de son mariage ({d})', deces: 'Le jour de sa mort ({d})'};
            const item = it => it.k === 'stage' ? `🚲 ${esc(T('étape du Tour de France {a} → {b}', {a: it.s.a, b: it.s.b}))} ${srcLink(wd(it.s.q))}`
                : it.k === 'match' ? `⚽ ${score(it.m)} <small class="muted">(${esc([T(it.m.t), it.m.city].filter(Boolean).join(' · '))})</small> ${srcLink(RES_URL)}`
                : `${esc(compLabel(M, it.c.c))} : ${esc(it.c.n)}${winnersTxt(it.c, M) ? ` — ${esc(winnersTxt(it.c, M))}` : ''} ${srcLink(compSrc(it.c))}`;
            const first = list[0];
            const lead = `${esc(T(KIND[first.kind], {d: dateTxt(first.d)}))} : ${item(first.items[0])}`;
            const rest = list.flatMap(x => x.items.map((it, i) => (x === first && i === 0 ? '' : `<li><b>${esc(T(KIND[x.kind], {d: dateTxt(x.d)}))}</b> : ${item(it)}</li>`))).filter(Boolean);
            return row('📅', lead, `${LIC.wd()} · ${LIC.res()}`, more(rest.length ? `<ul class="hist-ul tsx-ul">${rest.join('')}</ul>` : '', rest.length));
        },
        jeux: async life => {
            const C = await rowsOf('comps'); const list = gamesOfLife(C.rows, life); if (!list.length) return '';
            const x = list[0], M = await compMeta();
            const where = x.km !== null && x.km < 600 ? T('à {k} de {p}', {k: kmTxt(x.km), p: x.place}) : '';
            const lead = x.age !== null ? T('{He} avait {a} ans aux {n} ({c}){w}.', {He: He(life.person), a: String(x.age), n: esc(x.c.n), c: esc(x.c.place || ''), w: where ? `, ${esc(where)}` : ''})
                : T('De son vivant : les {n} ({c}).', {n: esc(x.c.n), c: esc(x.c.place || '')});
            return row('🏅', `${lead} ${srcLink(compSrc(x.c))}`, LIC.wd(), more(`<ul class="hist-ul tsx-ul">${list.slice(1).sort((p, q) => p.c.y - q.c.y).map(y => compLi(y.c, M, y.age !== null ? ` <small class="muted">· ${esc(T('{a} ans', {a: String(y.age)}))}</small>` : '')).join('')}</ul>`, list.length - 1));
        },
        pres: async life => {
            const r = radius();
            const [Mt, C, M] = await Promise.all([rowsOf('matchs'), rowsOf('comps'), compMeta()]);
            const ms = matchesNear(Mt.rows, life, r), cs = compsNear(C.rows, life, r);
            const out = [];
            if (cs.length) {
                const g = cs[0], last = g.eds.at(-1);
                const lead = T('{c} : à {k} de {p}, {n} éditions de son vivant ({a}–{b}).', {c: `<b>${esc(compLabel(M, g.c))}</b>`, k: esc(kmTxt(g.km)), p: esc(g.place), n: String(g.eds.length), a: String(g.eds[0].y), b: String(last.y)});
                const li = cs.flatMap(x => x.eds.slice(-12).reverse().map(c => compLi(c, M)));
                out.push(row('🏆', `${lead} ${srcLink(compSrc(last))}`, LIC.wd(), more(`<ul class="hist-ul tsx-ul">${li.join('')}</ul>${cs.length > 1 ? `<p class="muted">${esc(cs.slice(1).map(x => `${compLabel(M, x.c)} (${kmTxt(x.km)})`).join(' · '))}</p>` : ''}`, li.length)));
            }
            if (ms.length) {
                const x = ms.find(m => /Coupe du monde|Jeux olympiques|Euro$/.test(m.r.t)) || ms[0];
                const lead = T('Le {d}, à {c} ({k} de {p}) : {s}', {d: esc(dateTxt(x.r.d)), c: esc(x.r.city), k: esc(kmTxt(x.km)), p: esc(x.place), s: score(x.r)}) + (x.age !== null ? ` ${esc(T('({a} ans)', {a: String(x.age)}))}` : '');
                out.push(row('⚽', `${lead}. ${srcLink(RES_URL)}`, LIC.res(), more(`<ul class="hist-ul tsx-ul">${ms.slice(0, 40).map(m => matchLi(m)).join('')}</ul>${hyp(T('Matchs internationaux (équipes nationales) joués à moins de {r} km de ses lieux, de son vivant.', {r: String(r)}))}`, ms.length)));
            }
            return out.join('');
        },
        athletes: async life => {
            const bp = birthPlace(life); if (!bp) return '';
            const [Ath, J] = await Promise.all([rowsOf('athletes'), rowsOf('jo')]);
            const list = athletesOf(Ath.rows, bp), meds = athletesOf(J.rows, bp);
            if (!list.length && !meds.length) return '';
            const s = lifeSpan(life);
            const contemp = list.filter(a => a.b !== null && s.birth !== null && Math.abs(a.b - s.birth) <= 15);
            const a0 = contemp[0] || list[0];
            const lead = a0 ? T('Né aussi à {p} : {n}{w}.', {p: esc(bp.name), n: `<b>${link(a0.fr ? wp(a0.fr) : wd(a0.q), a0.n)}</b>`, w: a0.sport ? ` (${esc(a0.sport)}${a0.b ? `, ${esc(String(a0.b))}` : ''})` : ''})
                : T('Un médaillé olympique est né à {p} : {n}.', {p: esc(bp.name), n: `<b>${esc(meds[0].n)}</b>`});
            const others = list.filter(a => a !== a0);
            return row('🏃', `${lead} ${srcLink(wd((a0 || meds[0]).q))}`, LIC.wd(), more(`${others.length ? `<ul class="hist-ul tsx-ul">${others.slice(0, 15).map(athleteLi).join('')}</ul>` : ''}${meds.length ? `<p class="muted">${esc(T('Médailles olympiques de sportifs nés ici :'))}</p><ul class="hist-ul tsx-ul">${meds.slice(0, 15).map(medalLi).join('')}</ul>` : ''}`, others.length + meds.length));
        },
        homonyme: async (life, priv) => {
            if (priv || kiosk() || !past(life)) return '';
            const [Ath, J, C, M] = await Promise.all([rowsOf('athletes'), rowsOf('jo'), rowsOf('comps'), compMeta()]);
            const cands = [...Ath.rows.map(a => ({n: a.n, b: a.b, d: a.d, q: a.q, why: a.sport || T('sportif'), url: a.fr ? wp(a.fr) : wd(a.q)})),
                ...J.rows.map(m => ({n: m.n, b: m.b, d: m.d, q: m.q, why: `${MEDAL[m.medal] || ''} ${m.event}`, url: m.fr ? wp(m.fr) : wd(m.q)})),
                ...C.rows.flatMap(c => c.w.map(w => ({n: w[0], b: null, d: null, q: w[1] || '', why: `${compLabel(M, c.c)} ${c.y}`, url: wd(w[1]) || compSrc(c)})))];
            const hits = homonyms(nameIndex(cands), life); if (!hits.length) return '';
            const h = hits[0];
            const lead = h.probable ? T('Même nom, même prénom et même année de naissance qu’un sportif connu : {n} ({w}).', {n: `<b>${link(h.url, h.n)}</b>`, w: esc(h.why)})
                : T('Un homonyme champion : {n} ({w}). Sans doute quelqu’un d’autre, mais cela se vérifie.', {n: `<b>${link(h.url, h.n)}</b>`, w: esc(h.why)});
            return row('🔎', `${lead} ${srcLink(h.url)}`, LIC.wd(), `${more(hits.length > 1 ? `<ul class="hist-ul tsx-ul">${hits.slice(1, 10).map(x => `<li>${link(x.url, x.n)} <small class="muted">(${esc(x.why)})</small></li>`).join('')}</ul>` : '', hits.length - 1)}${hyp(T('Comparé sur l’ordinateur (prénom et nom), jamais pour une fiche vivante ou confidentielle : rien n’est envoyé.'))}`);
        },
        expos: async life => {
            const D = await rowsOf('expos'); if (!D.rows.length) return '';
            const list = exposNear(D.rows, life, 50);
            const art = isArtisan(life), s = lifeSpan(life);
            const cat = art ? D.rows.filter(r => (r.cat?.length || r.country === 'France') && r.y <= 1937 && r.y >= (s.birth ?? s.from ?? 0) + 15 && r.y <= (s.to ?? 0) && (r.country === 'France' || r.ins)) : [];
            if (!list.length && !cat.length) return '';
            const out = [];
            if (list.length) {
                const x = list.find(y => y.r.k === 'coloniale') || list[0];
                const lead = T('{He} avait {a} ans quand se tint {n} à {c} ({k} de {p}).', {He: He(life.person), a: String(x.age ?? '?'), n: `<b>${esc(x.r.n)}</b>`, c: esc(x.r.city || ''), k: esc(kmTxt(x.km)), p: esc(x.place)});
                out.push(row('🎪', `${lead} ${srcLink(expoSrc(x.r))}`, `${LIC.wd()} · ${LIC.wp(D.meta.produits_url)}`, `${zooHtml(x.r, D.meta)}${more(`<ul class="hist-ul tsx-ul">${list.filter(y => y !== x).map(y => expoLi(y, D.meta)).join('')}</ul>${hyp(T('Les grandes Expositions de son temps (Paris 1889, 1900…) sont dans « 🎡 Le monde de son village ».'))}`, list.length - 1)}`));
            }
            if (cat.length) {
                out.push(row('📒', `${esc(T('Son métier ({j}) : il ou elle a peut-être exposé. Les catalogues d’exposants de ces Expositions sont à feuilleter :', {j: (life.jobs || [])[0]?.text || ''}))}`, LIC.ia(),
                    `<ul class="hist-ul tsx-ul">${cat.slice(0, 8).map(r => `<li><b>${esc(r.n)}</b>${catsHtml(r)}</li>`).join('')}</ul>${hyp(T('L’app ne cherche pas le nom pour vous : elle ouvre le catalogue, et vous cherchez le nom dans la page d’Internet Archive.'))}`));
            }
            return out.join('');
        }};
    async function personInto(host, id, opts = {}) {
        const s = settings(), want = (opts.parts || PERSON_PARTS).filter(k => opts.force || s[k]);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (_) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const priv = !!opts.private || life.person?.living_status === 'living' || Number(life.person?.is_private) === 1;
        // personne décédée (ou d'il y a plus de 110 ans) et non confidentielle seulement
        if (priv || !past(life)) { host.innerHTML = ''; return 0; }
        const html = await Promise.all(want.filter(k => JOBS[k]).map(k => Promise.resolve().then(() => JOBS[k](life, priv)).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life tsx-life">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!PERSON_PARTS.some(k => on(k))) return '';
        const priv = p.living_status === 'living' || Number(p.is_private) === 1 ? '1' : '';
        if (priv) return '';
        return A().card(index, T('🏆 Le sport et les Expositions de sa vie'), '', `<div class="tsx-block" data-tsx-person="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-tsx-person]').forEach(async h => {
            const n = await personInto(h, Number(h.dataset.tsxPerson));
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    const placeLL = pl => { const lat = num(pl?.lat ?? pl?.latitude), lon = num(pl?.lon ?? pl?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    const PLACE_KINDS = ['competitions', 'pres', 'athletes', 'expos'];
    async function placePart(kind, place) {
        const ll = placeLL(place); if (!ll) return '';
        const r = radius(), name = place.name || '';
        if (kind === 'competitions') {
            const [C, M] = await Promise.all([rowsOf('comps'), compMeta()]);
            const hits = near(C.rows.filter(c => c.c !== 'tdf'), ll.lat, ll.lon, r, 5000); if (!hits.length) return '';
            const by = new Map(); for (const x of hits) { if (!by.has(x.r.c)) by.set(x.r.c, []); by.get(x.r.c).push(x); }
            const groups = [...by.entries()].map(([c, xs]) => ({c, xs: xs.sort((a, b) => a.r.y - b.r.y), km: Math.min(...xs.map(x => x.km))})).sort((a, b) => a.km - b.km);
            const g = groups[0], first = g.xs[0].r, last = g.xs.at(-1).r;
            const lead = g.xs.length > 1 ? T('{c} : {n} éditions à {k}, de {a} à {b}.', {c: `<b>${esc(compLabel(M, g.c))}</b>`, n: String(g.xs.length), k: esc(kmTxt(g.km)), a: String(first.y), b: String(last.y)})
                : T('{c} : {e} ({k}).', {c: `<b>${esc(compLabel(M, g.c))}</b>`, e: esc(first.n), k: esc(kmTxt(g.km))});
            const li = groups.flatMap(x => x.xs.slice(-15).reverse().map(y => compLi(y.r, M)));
            return row('🏆', `${lead} ${srcLink(compSrc(last))}`, LIC.wd(), more(`<ul class="hist-ul tsx-ul">${li.join('')}</ul>${groups.length > 1 ? `<p class="muted">${esc(groups.slice(1).map(x => `${compLabel(M, x.c)} (${x.xs.length})`).join(' · '))}</p>` : ''}`, li.length));
        }
        if (kind === 'pres') {
            const Mt = await rowsOf('matchs'); const hits = near(Mt.rows, ll.lat, ll.lon, Math.min(r, 10), 5000).sort((a, b) => a.r.d.localeCompare(b.r.d)); if (!hits.length) return '';
            const x = hits.find(m => /Coupe du monde|Jeux olympiques|Euro$/.test(m.r.t)) || hits[0];
            const lead = hits.length > 1 ? T('{n} matchs internationaux de football joués ici ou tout près ({c}), le premier en {y} ; par exemple le {d} : {s}.', {n: String(hits.length), c: esc([...new Set(hits.map(h => h.r.city))].slice(0, 3).join(', ')), y: hits[0].r.d.slice(0, 4), d: esc(dateTxt(x.r.d)), s: score(x.r)})
                : T('Un match international joué ici le {d} : {s}.', {d: esc(dateTxt(x.r.d)), s: score(x.r)});
            return row('⚽', `${lead} ${srcLink(RES_URL)}`, LIC.res(), more(`<ul class="hist-ul tsx-ul">${hits.slice(0, 60).map(m => matchLi(m, false)).join('')}</ul>`, hits.length));
        }
        if (kind === 'athletes') {
            const [Ath, J] = await Promise.all([rowsOf('athletes'), rowsOf('jo')]);
            const p = {ins: place.insee || place.ins || '', lat: ll.lat, lon: ll.lon};
            const list = athletesOf(Ath.rows, p), meds = athletesOf(J.rows, p); if (!list.length && !meds.length) return '';
            const lead = list.length ? T('{n} sportifs connus sont nés ici, dont {a}.', {n: String(list.length), a: list.slice(0, 2).map(a => `<b>${esc(a.n)}</b>${a.sport ? ` (${esc(a.sport)})` : ''}`).join(', ')}) : T('Des médaillés olympiques sont nés ici.');
            return row('🏃', `${lead} ${srcLink(wd((list[0] || meds[0]).q))}`, LIC.wd(), more(`<ul class="hist-ul tsx-ul">${list.slice(0, 30).map(athleteLi).join('')}</ul>${meds.length ? `<p class="muted">${esc(T('Médailles olympiques de sportifs nés ici :'))}</p><ul class="hist-ul tsx-ul">${meds.slice(0, 20).map(medalLi).join('')}</ul>` : ''}`, list.length + meds.length));
        }
        if (kind === 'expos') {
            const D = await rowsOf('expos'); const hits = near(D.rows.filter(e => !e.hand), ll.lat, ll.lon, 15, 50).sort((a, b) => a.r.y - b.r.y); if (!hits.length) return '';
            const x = hits.find(h => h.r.k === 'coloniale') || hits[0];
            const lead = hits.length > 1 ? T('{n} Expositions ont eu lieu ici ou tout près, de {a} à {b} : {e}…', {n: String(hits.length), a: String(hits[0].r.y), b: String(hits.at(-1).r.y), e: `<b>${esc(x.r.n)}</b>`})
                : T('{e} a eu lieu ici en {y}.', {e: `<b>${esc(x.r.n)}</b>`, y: String(x.r.y)});
            return row('🎪', `${lead} ${srcLink(expoSrc(x.r))}`, `${LIC.wd()} · ${LIC.wp(D.meta.produits_url)}`, `${zooHtml(x.r, D.meta)}${more(`<ul class="hist-ul tsx-ul">${hits.map(h => expoLi(h, D.meta)).join('')}</ul>${hyp(T('Les grandes Expositions choisies à la main (Paris 1889, 1900…) sont dans « 🎡 Le monde de son village ».'))}`, hits.length)}`);
        }
        return '';
    }
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || PLACE_KINDS).filter(k => opts.force || s[k]);
        const parts = await Promise.all(kinds.map(k => placePart(k, place).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean);
        const tourLink = ext.dataListsEngine ? `<p class="tsx-links"><button type="button" class="btn-link" data-tsx-open="ts_competitions" data-tsx-q="${esc(T('Tour de France'))}">${esc(T('🏆 Tout le Tour de France dans 🏆 Sport'))}</button></p>` : '';
        host.innerHTML = html.length ? `<section class="maintenance-panel cplus-panel tsx-panel"><h3>${esc(T('🏆 Sport et Expositions'))}</h3><div class="hist-life tsx-life">${html.join('')}</div>${tourLink}</section>` : '';
        return html.length;
    }
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-tsx-open]'); if (!b) return; ext.dataListsEngine?.open(b.dataset.tsxOpen, b.dataset.tsxQ ? {q: b.dataset.tsxQ} : null); });
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || ''};
    }
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'tsx_place', host: '[data-tsx-host]', icon: '🏆', label: 'Sport et Expositions', group: 'Données téléchargées', enabled: () => PLACE_KINDS.some(k => on(k))});
    async function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-tsx])'); if (!village) return;
        village.dataset.tsx = '1';
        if (!PLACE_KINDS.some(k => on(k))) return;
        const anchor = village.querySelector('[data-ti-host]') || village.querySelector('[data-tf-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="tsx-place" data-tsx-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-tsx-host]'), villagePlace(village));
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate().catch(e => { if (!(e?.name === 'AbortError' || (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || ''))))) console.error(e); }); }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 📜 Monographie de commune ─────────── */
    const MONO = [['competitions', 'tsx_competitions', '🏆', 'Les compétitions sportives ici'], ['pres', 'tsx_matchs', '⚽', 'Les matchs internationaux joués ici'],
        ['athletes', 'tsx_athletes', '🏃', 'Les sportifs nés ici'], ['expos', 'tsx_expos', '🎪', 'Les Expositions ici']];
    const SRC_TXT = {competitions: 'Wikidata (CC0) ; Wikipédia (CC BY-SA 4.0)', pres: 'martj42/international_results (CC0)', athletes: 'Wikidata (CC0)', expos: 'Wikidata (CC0) ; Wikipédia (CC BY-SA 4.0) ; Internet Archive (liens)'};
    (ext.monographSections = ext.monographSections || []).push(...MONO.map(([kind, id, icon, label]) => ({
        id, icon, label, group: 'Le lieu', defaultOn: true, enabled: () => on(kind), source: SRC_TXT[kind],
        render: async (place, host) => {
            const p = {...place, lat: place.latitude ?? place.lat, lon: place.longitude ?? place.lon, insee: place.insee || place.admin4_code || ''};
            const html = await placePart(kind, p); if (!html) return false;
            host.innerHTML = `<div class="hist-life tsx-life">${html}</div>`; return true;
        }})));

    /* ─────────── 📋 Listes (thème « sport » et « fetes » ; liste réunie « competitions ») ─────────── */
    const F = (key, label, type = 'text', more2 = {}) => ({key, label: T(label), type, ...more2});
    const openSrc = r => { const u = safeUrl(r.src); if (u) window.open(u, '_blank', 'noopener'); };
    async function competitionRows() {
        const [C, M, E] = await Promise.all([rowsOf('comps'), compMeta(), editions()]);
        const ed = new Map(E.map(e => [e.y, e]));
        return C.rows.map(c => {
            const e = c.c === 'tdf' ? ed.get(c.y) : null;
            const route = e ? `${e.from} → ${e.to}` : c.place;
            const stages = e ? T(e.prologue ? '{n} étapes + prologue' : '{n} étapes', {n: String(e.n)}) + (e.km ? ` · ${nf(e.km)} km` : '') : '';
            return {comp: compLabel(M, c.c), compId: c.c, year: c.y, date: c.d1 || '', name: c.n, place: route, winner: winnersTxt(c, M), stages, extra: c.x || '', lat: num(c.lat), lon: num(c.lon),
                src: compSrc(c) || (c.src === 'wp' ? (M[c.c]?.lists || [])[0] || '' : ''), source: c.src === 'wp' ? 'Wikipédia' : c.src === 'res' ? 'martj42' : 'Wikidata', winners: c.w.map(w => w[0])};
        });
    }
    /* 🚲 le Tour de France : Éditions (une ligne par année) · Étapes (lues dans l8c-tour, avec leur vainqueur) · 🗺 Carte */
    async function tourEditionRows() {
        const [E, M] = await Promise.all([editions(), compMeta()]); void M;
        return E.map(e => ({year: e.year ?? e.y, winner: e.retired ? T('titre retiré') : settings().winners ? e.winners.map(w => w[0]).join(', ') : '', stages: T(e.prologue ? '{n} étapes + prologue' : '{n} étapes', {n: String(e.n)}), parts: e.parts,
            km: e.km, route: `${e.from} → ${e.to}`, date: e.d1, lat: num(e.stages.at(-1)?.bla), lon: num(e.stages.at(-1)?.blo), src: e.edwiki ? wp(e.edwiki) : wd(e.ed)}));
    }
    async function tourStageRows() {
        const [S, W] = await Promise.all([rowsOf('tour'), stageWinners()]);
        const by = new Map(); for (const s of S.rows) { if (!by.has(s.y)) by.set(s.y, []); by.get(s.y).push(s); }
        return [...by.values()].flatMap(l => tourStages(l)).map(s => ({date: s.d || '', year: s.y, stage: s.label, from: s.a, to: s.b, km: s.km, winner: W.get(s.q)?.w || '', yellow: W.get(s.q)?.jaune || '',
            lat: num(s.bla ?? s.ala), lon: num(s.blo ?? s.alo), src: s.edwiki ? wp(s.edwiki) : wd(s.q)}));
    }
    const L = (id, pack, icon, label, theme, source, sourceUrl, kind, load2, fields, extra = {}) => ({id, pack, icon, label: T(label), theme, group: extra.group || 'Le monde', source, sourceUrl, enabled: () => on(kind), load: load2, fields, open: openSrc, ...extra});
    (ext.dataLists = ext.dataLists || []).push(
        L('ts_competitions', 'ts-competitions', '🏆', 'Compétitions sportives : éditions et vainqueurs', 'sport', 'Wikidata (CC0) ; Wikipédia (CC BY-SA 4.0) ; martj42 (CC0)', 'https://www.wikidata.org/wiki/Wikidata:Copyright', 'competitions',
            competitionRows, [F('year', 'Année', 'year'), F('comp', 'Compétition', 'enum'), F('name', 'Édition'), F('place', 'Où', 'place'), F('winner', 'Vainqueur'), F('stages', 'Étapes et km'), F('extra', 'Finale'), F('source', 'Source', 'enum'), F('src', 'Lien', 'url')],
            {period: r => [r.year, r.year], geo: r => [r.lat, r.lon], chips: 'comp', views: ['editions', 'etapes', 'carte'], defaultView: () => settings().view,
                merge: {into: 'competitions', rank: 1, short: 'Wikidata', row: r => ({key: `${r.compId}|${r.year}`, date: r.date, year: r.year, lat: r.lat, lon: r.lon, place: r.place, comp: r.comp, chip: r.compId, name: r.name, winner: r.winner, stages: r.stages, url: r.src, source: r.source})}}),
        L('ts_tour', 'ts-competitions', '🚲', 'Tour de France : éditions, étapes et vainqueurs', 'sport', 'Wikidata (CC0)', 'https://www.wikidata.org/wiki/Q33881', 'competitions',
            tourEditionRows, [F('year', 'Année', 'year'), F('winner', 'Maillot jaune'), F('stages', 'Étapes'), F('km', 'Distance (km)', 'number'), F('route', 'Parcours'), F('src', 'Source', 'url')],
            {period: r => [r.year, r.year], geo: r => [r.lat, r.lon], familyColumn: true, defaultView: () => (settings().view === 'etapes' ? 'etapes' : 'editions'),
                views: [{id: 'editions', label: 'Éditions', sub: r => ({view: 'etapes', preset: {crit: [{key: 'year', kind: 'range', from: r.year, to: r.year}]}, title: T('Tour de France {y}', {y: String(r.year)}), pickAll: 'Toutes ses étapes'})},
                    {id: 'etapes', label: 'Étapes', load: tourStageRows, fields: [F('date', 'Date', 'date'), F('year', 'Année', 'year'), F('stage', 'Étape'), F('from', 'Départ', 'place'), F('to', 'Arrivée', 'place'), F('km', 'Distance (km)', 'number'), F('winner', 'Vainqueur d’étape'), F('yellow', 'Maillot jaune ce soir-là'), F('src', 'Source', 'url')], geo: r => [r.lat, r.lon], open: openSrc}]}),
        L('ts_matchs', 'ts-matchs', '⚽', 'Matchs internationaux de football (depuis 1872)', 'sport', 'martj42/international_results (CC0)', RES_URL, 'pres',
            async () => (await rowsOf('matchs')).rows.map(m => ({date: m.d, year: num(m.d.slice(0, 4)), home: m.h, score: `${m.hs}–${m.as}${m.so ? ` (${T('t.a.b.')} ${m.so})` : ''}`, away: m.a, tournament: T(m.t), t0: m.t, city: m.city, country: m.cty, lat: m.lat, lon: m.lon, src: RES_URL})),
            [F('date', 'Date', 'date'), F('home', 'Équipe'), F('score', 'Score'), F('away', 'Adversaire'), F('tournament', 'Tournoi', 'enum'), F('city', 'Ville', 'place'), F('country', 'Pays', 'enum'), F('src', 'Source', 'url')],
            {period: r => [r.year, r.year], geo: r => [r.lat, r.lon], merge: {into: 'competitions', rank: 3, when: r => /^(Coupe du monde|Euro)$/.test(r.t0) && (r.home === 'France' || r.away === 'France'), short: 'martj42', row: r => ({key: `m|${r.date}|${r.home}|${r.away}`, date: r.date, year: r.year, lat: r.lat, lon: r.lon, place: r.city, comp: `⚽ ${r.tournament}`, chip: 'matchs', name: `${r.home} ${r.score} ${r.away}`, winner: '', url: r.src, source: 'martj42'})}}),
        L('ts_jo', 'ts-jo', '🏅', 'Médailles olympiques des sportifs français', 'sport', 'Wikidata (CC0)', 'https://www.wikidata.org/wiki/Q15243387', 'jeux',
            async () => (await rowsOf('jo')).rows.map(m => ({name: m.n, medal: T(m.medal), year: m.y, event: m.event, born: m.b, died: m.d, commune: m.commune, lat: m.lat, lon: m.lon, src: wd(m.q)})),
            [F('name', 'Nom', 'text', {person: true}), F('medal', 'Médaille', 'enum'), F('year', 'Année', 'year'), F('event', 'Épreuve'), F('born', 'Naissance', 'year'), F('died', 'Mort', 'year'), F('commune', 'Né à', 'place'), F('src', 'Source', 'url')],
            {period: r => [r.year, r.year], geo: r => [r.lat, r.lon], personMatch: {born: r => r.born, died: r => r.died, historic: true}}),
        L('ts_athletes', 'ts-athletes', '🏃', 'Sportifs nés en France, commune par commune', 'sport', 'Wikidata (CC0)', 'https://www.wikidata.org/wiki/Property:P641', 'athletes',
            async () => (await rowsOf('athletes')).rows.map(a => ({name: a.n, sport: a.sport, born: a.b, died: a.d, commune: a.commune, lat: a.lat, lon: a.lon, src: a.fr ? wp(a.fr) : wd(a.q)})),
            [F('name', 'Nom', 'text', {person: true}), F('sport', 'Sport', 'enum'), F('born', 'Naissance', 'year'), F('died', 'Mort', 'year'), F('commune', 'Né à', 'place'), F('src', 'Source', 'url')],
            {period: r => [r.born, r.died ?? r.born], geo: r => [r.lat, r.lon], group: 'Le lieu', personMatch: {born: r => r.born, died: r => r.died, historic: true}}),
        L('tx_expos', 'tx-expos', '🎪', 'Expositions du monde (universelles, internationales, coloniales, régionales)', 'fetes', 'Wikidata (CC0) ; Wikipédia (CC BY-SA 4.0) ; Internet Archive (liens)', 'https://www.wikidata.org/wiki/Q172754', 'expos',
            async () => { const [D, H] = await Promise.all([rowsOf('expos'), rowsOf('expos8')]); const handQ = new Set(H.rows.map(r => r.q).filter(Boolean));
                const mine = D.rows.filter(r => !handQ.has(r.q)).map(r => ({name: r.n, year: r.y, end: r.y2, kind: T(EXPO_KIND[r.k] || r.k), city: r.city, country: r.country, visitors: r.vis, note: [r.line, r.zoo].filter(Boolean).join(' — ') || (r.k === 'coloniale' ? T('Des personnes venues des colonies y étaient exhibées (« zoos humains »).') : ''), catalogue: r.cat?.[0] ? iaLink(r.cat[0]) : '', lat: num(r.lat), lon: num(r.lon), src: expoSrc(r), hand: ''}));
                const hand = H.rows.map(e => ({name: e.n, year: e.y, end: e.y2, kind: T(EXPO_KIND[e.k] || e.k), city: e.city, country: e.fr ? 'France' : '', visitors: e.visitors, note: [e.visitors_sentence, e.highlight].filter(Boolean).join(' — '), catalogue: (D.rows.find(r => r.q === e.q)?.cat || [])[0] ? iaLink(D.rows.find(r => r.q === e.q).cat[0]) : '', lat: num(e.lat), lon: num(e.lon), src: e.url, hand: T('choisie à la main')}));
                return [...hand, ...mine].sort((a, b) => a.year - b.year); },
            [F('name', 'Exposition'), F('year', 'Année', 'year'), F('kind', 'Genre', 'enum'), F('city', 'Ville', 'place'), F('country', 'Pays', 'enum'), F('visitors', 'Visiteurs', 'number'), F('note', 'Ce qu’en dit la source'), F('catalogue', 'Catalogue (Internet Archive)', 'url'), F('hand', 'Phrase choisie', 'enum'), F('src', 'Source', 'url')],
            {period: r => [r.year, r.end ?? r.year], geo: r => [r.lat, r.lon]}));
    // la liste réunie « 🔀 Compétitions sportives » (thème 🏆 Sport) — déclarée ici seulement si le moteur des thèmes ne l'a pas déjà
    const MERGE = {id: 'competitions', theme: 'sport', icon: '🔀', label: T('Compétitions sportives'), noun: ['édition', 'éditions'], chips: 'comp', columns: ['year', 'comp', 'place', 'winner', 'stages'],
        same: {by: 'key'}, keep: ['chip', 'name'], familyColumn: true, period: r => [r.year, r.year], geo: r => [r.lat, r.lon]};
    const addMerge = () => { const M = ext.dataListMerges = ext.dataListMerges || []; if (!M.some(m => m.id === MERGE.id)) M.push(MERGE); };
    addMerge();
    if (root.document) document.addEventListener('DOMContentLoaded', () => { const M = ext.dataListMerges || []; const mine = M.filter(m => m.id === MERGE.id); if (mine.length > 1) M.splice(M.indexOf(MERGE), 1); }, {once: true});

    /* ─────────── 🗺 Cartes ─────────── */
    const inBox = (bbox, lat, lon) => !bbox || (lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3]);
    const layer = (id, icon, label, get, src, lab, yr) => ({id, icon, label: T(label), group: 'Le monde', kind: 'points', source: src,
        run: async ({q, bbox, from, to, max = 3000}) => { const rows = await get(); const features = rows.filter(r => num(r.lat) !== null && inBox(bbox, r.lat, r.lon) && (!from || (yr(r) ?? from) >= from) && (!to || (yr(r) ?? to) <= to) && (!q || fold(lab(r)).includes(fold(q)))).slice(0, max).map(r => ({type: 'pt', lat: r.lat, lon: r.lon, label: lab(r)})); return {features, source: src}; }});
    (ext.mapLayerSources = ext.mapLayerSources || []).push(
        layer('tsx_competitions', '🏆', 'Compétitions sportives (lieu de chaque édition)', async () => (await rowsOf('comps')).rows, 'Wikidata (CC0)', r => `${r.n}${r.w?.[0] ? ` — ${r.w[0][0]}` : ''}`, r => r.y),
        layer('tsx_matchs', '⚽', 'Matchs internationaux joués en France', async () => (await rowsOf('matchs')).rows, 'martj42/international_results (CC0)', r => `${r.d} ${r.h} ${r.hs}–${r.as} ${r.a} (${r.city})`, r => num(r.d.slice(0, 4))),
        layer('tsx_athletes', '🏃', 'Sportifs : leur commune de naissance', async () => (await rowsOf('athletes')).rows, 'Wikidata (CC0)', r => `${r.n}${r.b ? ` (${r.b})` : ''}`, r => r.b),
        layer('tsx_expos', '🎪', 'Expositions du monde', async () => (await rowsOf('expos')).rows, 'Wikidata (CC0)', r => `${r.n}`, r => r.y));

    /* ─────────── 🧰 à la demande ─────────── */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
    const personOfCtx = c => Number(c.person?.id || c.person?.person?.id || c.person) || 0;
    const privOfCtx = c => { const p = c.person?.person || c.person; return !!(p && typeof p === 'object' && (p.living_status === 'living' || Number(p.is_private) === 1)); };
    async function runPerson(parts, c, host, empty) {
        const id = personOfCtx(c); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
        host.innerHTML = '<div></div>';
        const n = await personInto(host.firstElementChild, id, {parts, force: true, detached: true, private: privOfCtx(c)});
        if (!n) host.innerHTML = emptyLine(T(empty), 'ℹ️');
        return n;
    }
    async function runPlace(kind, c, host) {
        const pl = placeOfCtx(c.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return null; }
        const html = await placePart(kind, pl);
        host.innerHTML = html ? `<div class="hist-life tsx-life">${html}</div>` : '';
        return !!html;
    }
    async function runYear(c, host) {
        const y = num(c.year); if (y === null) { host.innerHTML = emptyLine(T('Choisis une année.'), '📅'); return null; }
        const [C, M] = await Promise.all([rowsOf('comps'), compMeta()]);
        const list = C.rows.filter(r => r.y === y);
        host.innerHTML = list.length ? `<div class="hist-life tsx-life">${row('🏆', esc(T('Les vainqueurs de {y}', {y: String(y)})), LIC.wd(), `<ul class="hist-ul tsx-ul">${list.map(r => compLi(r, M)).join('')}</ul>`)}</div>` : emptyLine(T('Rien de connu cette année-là.'));
        return list.length > 0;
    }
    const DS = (id, icon, label, parts, empty) => ({id, icon, label: T(label), group: 'La personne', needs: ['person'], online: false, installed: () => true, run: (c, host) => runPerson(parts, c, host, empty)});
    (ext.dataSources = ext.dataSources || []).push(
        DS('tsxp_jour', '📅', 'Le sport le jour de sa naissance, de son mariage, de sa mort', ['cejour'], 'Il faut une date complète (jour, mois, année) de naissance, de mariage ou de décès, d’une personne décédée.'),
        DS('tsxp_jeux', '🏅', 'Les Jeux olympiques de sa vie', ['jeux'], 'Il faut sa date de naissance (personne décédée).'),
        DS('tsxp_pres', '📍', 'Le sport près de chez lui (matchs, grandes courses)', ['pres'], 'Rien de connu près de ses lieux, de son vivant.'),
        DS('tsxp_village', '🏃', 'Les sportifs de son village, un homonyme champion', ['athletes', 'homonyme'], 'Aucun sportif connu né dans sa commune ; aucun homonyme (comparé sur l’ordinateur, seulement pour une personne décédée et non confidentielle).'),
        DS('tsxp_expos', '🎪', 'Les Expositions de sa vie et les catalogues d’exposants', ['expos'], 'Aucune Exposition connue près de ses lieux, de son vivant.'),
        {id: 'tsx_annee', icon: '🏆', label: T('Les vainqueurs de cette année-là'), group: 'Le monde', needs: ['year'], online: false, installed: () => true, run: (c, host) => runYear(c, host)},
        ...MONO.map(([kind, id, icon, label]) => ({id: `${id}_lieu`, icon, label: T(label), group: 'Le lieu', needs: ['place'], online: false, installed: () => true, run: (c, host) => runPlace(kind, c, host)})));

    /* ─────────── ⚙️ Réglages → 🏆 Sport et Expositions ─────────── */
    const FILE_LABEL = [['comps', '🏆 Compétitions (éditions, vainqueurs)'], ['etapes', '🚲 Vainqueurs d’étape du Tour'], ['matchs', '⚽ Matchs internationaux'], ['jo', '🏅 Médailles olympiques'],
        ['athletes', '🏃 Sportifs nés en France'], ['expos', '🎪 Expositions du monde']];
    let drawToken = 0;
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const mine = ++drawToken;
        const metas = {};
        await Promise.all(FILE_LABEL.map(async ([k]) => { const D = await quiet(load(k)); if (D) metas[k] = D; }));
        if (mine !== drawToken || (token !== undefined && A().state && token !== A().state.workspaceToken)) return;
        const s = settings(), C = metas.comps;
        const tg = ([key, label, sub]) => `<label class="checkbox-line cplus-tg" data-tsx-tg="${esc(key)}"><input type="checkbox" ${s[key] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const fileRow = ([k, label]) => { const D = metas[k]; if (!D) return `<tr><td>${esc(T(label))}</td><td colspan="4" class="muted">${esc(T('Fichier absent.'))}</td></tr>`;
            const m = D.meta; return `<tr><td>${esc(T(label))}</td><td>${link(m.url, m.source)}<br><small class="muted">${esc(m.what || '')}</small></td><td>${esc(nf(D.rows.length))}</td><td>${link(m.licence_url, m.licence)}</td><td>${esc(m.built || '')}</td></tr>`; };
        const compRow = c => `<tr><td>${esc(c.icon)} ${esc(T(c.label))}</td><td>${esc(nf(c.n))}</td><td>${esc(c.from ? `${c.from}–${c.to}` : '')}</td><td>${link(wd(c.q), c.q)}${(c.lists || []).map(u => ` · ${link(u, T('liste de Wikipédia'))}`).join('')}</td></tr>`;
        const lo = (C?.meta.link_only || []).map(x => `<li>${esc(x.icon)} <b>${esc(T(x.label))}</b> — ${esc(T(x.why))} ${link(x.url, T('↗ ouvrir'))}</li>`).join('');
        ws.innerHTML = `<section class="page cplus-settings tsx-settings" data-tsx-settings-page>${UI().pageHeader ? UI().pageHeader({title: T('Sport et Expositions'), icon: '🏆', where: T('Réglages · Données'), help: esc(T('Les grandes compétitions et leurs vainqueurs, les matchs, les Jeux, les sportifs du village ; les Expositions du monde. Tout est livré avec l’app.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’une personne décédée (bloc « 🏆 Le sport et les Expositions de sa vie »), sur la fiche d’un village et dans la monographie. Les listes sont dans Listes → 🏆 Sport (et 🎉 Fêtes pour les Expositions), les points dans Cartes.'))}</p>${PARTS.map(tg).join('')}
                <div class="tsx-opts">
                    <label class="tsx-opt">${esc(T('« Près de chez lui » : à combien de kilomètres ?'))} <input type="number" min="1" max="100" step="1" value="${esc(String(radius()))}" data-tsx-km inputmode="numeric"> <span class="muted">${esc(T('km (15 par défaut ; aussi pour les étapes du Tour dans « 🎡 Le monde de son village »)'))}</span></label>
                    <label class="checkbox-line" data-tsx-tg="winners"><input type="checkbox" ${s.winners ? 'checked' : ''}><span>${esc(T('Montrer les vainqueurs (maillot jaune, champions ; « titre retiré » de 1999 à 2005 pour le Tour)'))}</span></label>
                    <label class="tsx-opt">${esc(T('Le Tour de France s’ouvre sur'))} <select data-tsx-view><option value="editions" ${s.view !== 'etapes' && s.view !== 'carte' ? 'selected' : ''}>${esc(T('les éditions'))}</option><option value="etapes" ${s.view === 'etapes' ? 'selected' : ''}>${esc(T('les étapes'))}</option><option value="carte" ${s.view === 'carte' ? 'selected' : ''}>${esc(T('la carte'))}</option></select></label>
                </div></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Lignes'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Fabriqué le'))}</th></tr></thead><tbody>
                ${FILE_LABEL.map(fileRow).join('')}</tbody></table></div>
                ${C ? `<h4>${esc(T('Les compétitions'))}</h4><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Compétition'))}</th><th>${esc(T('Éditions'))}</th><th>${esc(T('Années'))}</th><th>${esc(T('Source'))}</th></tr></thead><tbody>${(C.meta.comps || []).map(compRow).join('')}</tbody></table></div>` : ''}
                <p class="muted">${esc(T('Les étapes du Tour de France ne sont pas recopiées : elles viennent de « 🎡 Le monde de son village » (l8c-tour), ici avec leur vainqueur quand Wikidata le donne. Les 22 Expositions choisies à la main (l8c-expos) gardent leurs phrases.'))}</p>
                <h4>${esc(T('En lien seulement (pas de licence ouverte)'))}</h4><ul class="hist-ul tsx-ul">${lo}</ul>
                <p class="muted">${esc(T('Tout est lu sur l’ordinateur : rien ne part sur Internet, ni nom ni lieu, pour personne. Les noms de la fiche sont comparés aux sportifs ici, jamais pour une fiche vivante ou confidentielle. Seuls les liens « ↗ » ouvrent une page, quand on clique.'))}</p></div></section>`;
    }
    document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-tsx-tg]');
        if (t && e.target.matches('input')) {
            const s = settings(), k = t.dataset.tsxTg, was = s[k];
            s[k] = e.target.checked; saveSettings(s); editionsMemo = null;
            const label = k === 'winners' ? T('Les vainqueurs') : T(PARTS.find(p => p[0] === k)?.[1] || k);
            A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: label}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }, icon: '🏆'});
            return;
        }
        const kmIn = e.target.closest?.('[data-tsx-km]');
        if (kmIn) {
            const s = settings(), was = s.km, v = Math.round(Number(kmIn.value));
            if (!(v >= 1 && v <= 100)) { kmIn.value = String(radius()); return; }
            if (v === radius()) return;
            s.km = v; saveSettings(s);
            A().undoToast?.(T('« Près de chez lui » : {n} km.', {n: String(v)}), {undo: () => { const x = settings(); x.km = was; saveSettings(x); drawSettings(); }, icon: '🏆'});
            return;
        }
        const vw = e.target.closest?.('[data-tsx-view]');
        if (vw) {
            const s = settings(), was = s.view; s.view = vw.value; saveSettings(s);
            A().undoToast?.(T('Le Tour de France s’ouvre sur {v}.', {v: vw.selectedOptions[0]?.textContent || vw.value}), {undo: () => { const x = settings(); x.view = was; saveSettings(x); drawSettings(); }, icon: '🏆'});
        }
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'telech_i'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK)) { let i = B.findIndex(b => b[0] === 'telech_i'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire_autour'); B.splice(i < 0 ? B.length : i + 1, 0, [BLOCK, '🏆 Le sport et les Expositions de sa vie']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK] ||= '12';
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.telechM = {...core, load, settings, radius, personInto, placeInto, placePart, lifeOf, tourWinners, stageWinners, editions,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
