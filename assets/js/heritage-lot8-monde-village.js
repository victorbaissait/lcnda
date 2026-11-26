/**
 * LCNDA — 🎡 Le monde de son village (lot 8) : ce qui se passait autour de chez lui, de son temps.
 * Données livrées avec l'app (assets/data/l8c-*.json.gz, refaites par scripts/lot8-monde-village/build.py, lues à la demande) :
 *   🎭 l8c-spectacles  créations d'opéras, opérettes, ballets, pièces en Europe (Wikidata, CC0 : P1191 date de la première, P4647 lieu)
 *   ⚽ l8c-clubs       clubs sportifs de France et leur fondation (Wikidata, CC0)
 *   🚲 l8c-tour        étapes du Tour de France 1903–2025, départ et arrivée (Wikidata, CC0)
 *   🎡 l8c-expos       Expositions universelles et internationales : visiteurs et ce qu'on y a vu, la phrase de l'article
 *                      (Wikipédia, CC BY-SA 4.0)
 *   🎂 l8c-dates       le jour exact des événements de « Le monde autour » (monde-autour.json) d'après Wikidata (CC0)
 *   👑 l8c-seigneurs   seigneurs, barons, comtes… d'un lieu (Wikidata, CC0 : titre de noblesse P97 et son lieu) ; + les propriétaires
 *                      des châteaux de la commune (heritage-chateaux-territoires.js, s'il est là)
 *   ⛪ l8c-eglises     églises, chapelles, abbayes disparues ou fermées (Wikidata, CC0 ; images de Wikimedia Commons)
 *   🐄 l8c-foires      foires (Wikidata, CC0 ; première phrase de l'article de Wikipédia, CC BY-SA 4.0)
 * Ce que ça montre (une phrase d'abord, le détail plié « ▸ plus » ; rien quand il n'y a rien) :
 *   · fiche d'une personne, bloc « 🎡 Le monde de son village » : la création de l'année de son mariage, le Tour de France chez lui,
 *     l'Exposition de son temps, les coïncidences de sa vie, le seigneur de son village (avant 1789), les foires de son pays
 *     (cultivateurs, marchands…) ;
 *   · fiche d'un village et Monographie de commune : 🎭 ⚽ 🚲 🎡 👑 ⛪ 🐄 ;
 *   · Listes (LCNDA_EXT.dataLists) ; à la demande (LCNDA_EXT.dataSources) ;
 *   · Réglages → « 🎡 Le monde du village » : chaque sujet s'éteint (localStorage « genealogie-lot8-monde-village »), À propos des données.
 * Pour la future « fiche lieu de culte » (docs/design/fiche-chateau-culte.html) : LCNDA_EXT.lot8MondeVillage.worshipPlaces(insee)
 * et .lordsOf(insee) renvoient les données prêtes (nom, sorte, état, dates, image, liens).
 * La vie d'une personne vient de ha_life (lib/histoire_autour.php, lecture seule). Rien n'est écrit dans la généalogie.
 *   window.LCNDA_EXT.lot8MondeVillage = {…}   (Node : module.exports = le calcul)
 * Essai : tests/test-lot8-monde-village.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const RAD = Math.PI / 180;
    function km(a, b, c, d) { const x = Math.sin((c - a) * RAD / 2) ** 2 + Math.cos(a * RAD) * Math.cos(c * RAD) * Math.sin((d - b) * RAD / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); }
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").trim();
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const table = f => (f.rows || []).map(r => (Array.isArray(r) ? Object.fromEntries(f.fields.map((k, i) => [k, r[i] ?? null])) : r));
    const isFrance = p => !p?.country || /^(france|fr|fra|republique francaise)$/.test(fold(p.country));
    const llOf = p => { const lat = num(p?.lat ?? p?.latitude), lon = num(p?.lon ?? p?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    const inseeOf = p => { const s = String(p?.insee || p?.admin4_code || '').trim().toUpperCase(); return /^(\d{5}|2[AB]\d{3})$/.test(s) ? s : ''; };

    /* ── la vie d'une personne (réponse de ha_life) ── */
    const BIRTH = ['BIRT', 'BAPM', 'CHR'], DEATH = ['DEAT', 'BURI', 'CREM'], MARR = ['MARR', 'MARB', 'MARC', 'MARL'];
    const fullDate = e => { const m = String(e?.date || '').match(/^(\d{4})-(\d\d)-(\d\d)/); return m && m[2] !== '00' && m[3] !== '00' ? m[0] : ''; };
    function lifeSpan(life) {
        const ys = (life.events || []).map(e => num(e.year)).filter(y => y !== null);
        const b = num(life.person?.birth), d = num(life.person?.death);
        const from = b ?? (ys.length ? Math.min(...ys) : null), to = d ?? (ys.length ? Math.max(...ys, from ?? -Infinity) : from);
        return {from, to, birth: b, death: d};
    }
    const evOf = (life, tags) => { for (const t of tags) { const e = (life.events || []).find(x => String(x.tag || '').toUpperCase() === t && num(x.year) !== null); if (e) return e; } return null; };
    const marriageYear = life => num(evOf(life, MARR)?.year);
    const age = (life, y) => (num(life.person?.birth) !== null && y !== null ? y - Number(life.person.birth) : null);
    /** ses lieux, avec les années où on l'y trouve (from–to) et leur position */
    function placesOf(life) {
        return (life.places || []).map(p => ({...p, ll: llOf(p), ins: inseeOf(p), from: num(p.from), to: num(p.to)})).filter(p => p.ll || p.ins);
    }
    /** l'année y est-elle dans ses années à ce lieu (élargies de `pad` ans) ? */
    const atPlace = (p, y, pad = 0) => p.from !== null && p.to !== null && y >= p.from - pad && y <= p.to + pad;
    function jobMatch(life, re) { const j = (life.jobs || []).find(x => re.test(fold(x.text))); return j ? String(j.text).trim() : ''; }

    /* ── 🎭 les spectacles ── */
    /** les créations d'une année : celles de sa ville d'abord (≤ 15 km), puis de France, puis les plus connues */
    function spectaclesOfYear(rows, y, places = []) {
        const lst = rows.filter(r => r.y === y && (r.k !== 'concert'));
        const near = r => (r.lat === null ? null : Math.min(Infinity, ...places.filter(p => p.ll).map(p => km(p.ll.lat, p.ll.lon, r.lat, r.lon))));
        return lst.map(r => ({r, km: near(r)})).sort((a, b) => Number((b.km ?? 99) <= 15) - Number((a.km ?? 99) <= 15) || b.r.fr - a.r.fr || b.r.sl - a.r.sl);
    }
    /** l'année de son mariage, sinon de ses 20 ans → {y, why, list} */
    function spectaclesForLife(rows, life) {
        const b = num(life.person?.birth), m = marriageYear(life), pls = placesOf(life);
        for (const [y, why] of [[m, 'mariage'], [b !== null ? b + 20 : null, 'vingt']]) {
            if (y === null) continue;
            const list = spectaclesOfYear(rows, y, pls);
            if (list.length) return {y, why, list, age: age(life, y)};
        }
        return null;
    }
    const spectaclesNear = (rows, lat, lon, radius = 5) => rows.filter(r => r.lat !== null && km(lat, lon, r.lat, r.lon) <= radius).sort((a, b) => a.y - b.y);

    /* ── 🚲 le Tour de France ── */
    const stageAt = (s, p, radius = 3) => {
        const hit = [];
        if (p.ins && s.ai === p.ins || p.ll && s.ala !== null && km(p.ll.lat, p.ll.lon, s.ala, s.alo) <= radius) hit.push('depart');
        if (p.ins && s.bi === p.ins || p.ll && s.bla !== null && km(p.ll.lat, p.ll.lon, s.bla, s.blo) <= radius) hit.push('arrivee');
        return hit;
    };
    function tourAt(rows, place) {
        const p = {ins: inseeOf(place), ll: llOf(place)};
        if (!p.ins && !p.ll) return [];
        return rows.map(s => ({s, hit: stageAt(s, p)})).filter(x => x.hit.length).sort((a, b) => a.s.y - b.s.y || String(a.s.d).localeCompare(String(b.s.d)));
    }
    /** les étapes passées par ses lieux pendant sa vie ; « quand il y vivait » si l'année tombe dans ses années là (± 5 ans) */
    function tourForLife(rows, life) {
        const {from, to} = lifeSpan(life); if (from === null) return [];
        const out = [];
        for (const p of placesOf(life).filter(isFrance)) {
            for (const x of tourAt(rows, p)) {
                if (x.s.y < from || x.s.y > (to ?? from + 100)) continue;
                out.push({...x, place: p.name, lived: atPlace(p, x.s.y, 5), age: age(life, x.s.y)});
            }
        }
        const seen = new Set();
        return out.filter(x => (seen.has(x.s.q) ? false : seen.add(x.s.q))).sort((a, b) => Number(b.lived) - Number(a.lived) || a.s.y - b.s.y);
    }

    /* ── 🎡 les Expositions ── */
    /** les Expositions de sa vie (en France, s'il vivait en France ; il avait au moins 5 ans) : celle de sa ville d'abord */
    function exposForLife(rows, life) {
        const {from, to, birth} = lifeSpan(life); if (from === null) return [];
        const pls = placesOf(life), fr = pls.filter(isFrance);
        if (!fr.length && !(life.places || []).some(isFrance)) return [];
        return rows.filter(e => e.fr && e.y >= (birth ?? from) + 5 && e.y <= (to ?? from + 90)).map(e => {
            let best = null;
            for (const p of fr) if (p.ll && e.lat !== null) { const k = km(p.ll.lat, p.ll.lon, e.lat, e.lon); if (!best || k < best.km) best = {km: k, place: p.name}; }
            return {e, ...(best || {km: null, place: ''}), age: age(life, e.y)};
        }).sort((a, b) => Number((b.km ?? 999) <= 30) - Number((a.km ?? 999) <= 30) || (b.e.visitors || 0) - (a.e.visitors || 0));
    }
    const exposAt = (rows, lat, lon, radius = 15) => rows.filter(e => e.lat !== null && km(lat, lon, e.lat, e.lon) <= radius).sort((a, b) => a.y - b.y);

    /* ── 🎂 les coïncidences ── */
    /** dates = lignes de l8c-dates jointes aux événements de monde-autour ({id, d, w, ev}) → les hasards de sa vie */
    function coincidences(dates, life) {
        const be = evOf(life, BIRTH), de = evOf(life, DEATH), me = evOf(life, MARR);
        const bd = fullDate(be), dd = fullDate(de), md = fullDate(me);
        if (!bd && !dd && !md) return [];
        const by = bd ? Number(bd.slice(0, 4)) : null, dy = dd ? Number(dd.slice(0, 4)) : num(life.person?.death);
        const out = [];
        for (const x of dates) {
            if (bd && x.d === bd) out.push({kind: 'naissance', x, rank: 0});
            if (md && x.d === md) out.push({kind: 'mariage', x, rank: 0});
            if (dd && x.d === dd) out.push({kind: 'deces', x, rank: 0});
            if (bd && x.d.slice(5) === bd.slice(5)) {
                const y = Number(x.d.slice(0, 4)), n = y - by;
                if (n > 0 && n <= 110 && (dy === null || y <= dy)) out.push({kind: 'anniversaire', x, n, rank: n % 10 === 0 ? 1 : 2});
            }
        }
        // le même jour : on garde l'événement d'un jour (« Armistice du 11 novembre 1918 ») plutôt que la fin d'une période (« Première Guerre mondiale »)
        const dayHit = new Set(out.filter(c => c.x.w === 'jour').map(c => c.kind + c.x.d));
        return out.filter(c => c.x.w === 'jour' || !dayHit.has(c.kind + c.x.d))
            .sort((a, b) => a.rank - b.rank || (a.x.ev?.level ?? 3) - (b.x.ev?.level ?? 3) || a.x.d.localeCompare(b.x.d));
    }

    /* ── 👑 les seigneurs ── */
    const lordSpan = r => [r.s ?? (r.b !== null && r.b !== undefined ? r.b + 20 : r.d !== null && r.d !== undefined ? r.d - 30 : null), r.e ?? r.d ?? (r.s !== null && r.s !== undefined ? r.s + 30 : null)];
    const lordsOfInsee = (rows, ins) => rows.filter(r => r.ins === ins).sort((a, b) => (lordSpan(a)[0] ?? 0) - (lordSpan(b)[0] ?? 0));
    /** pour l'année y : le seigneur dont les années (titre, sinon sa vie) comprennent y ; sinon le dernier avant */
    function lordAt(list, y) {
        const now = list.filter(r => { const [a, z] = lordSpan(r); return a !== null && z !== null && a <= y && y <= z; });
        if (now.length) return {r: now[now.length - 1], exact: true};
        const before = list.filter(r => (lordSpan(r)[1] ?? Infinity) < y && y - lordSpan(r)[1] <= 60);
        return before.length ? {r: before[before.length - 1], exact: false} : null;
    }
    /** ses lieux de France où on le trouve avant 1789 → le seigneur connu */
    function lordsForLife(rows, life, owners = {}) {
        const out = [];
        for (const p of placesOf(life).filter(p => p.ins && isFrance(p))) {
            const a = p.from ?? lifeSpan(life).from; if (a === null || a > 1789) continue;
            const z = Math.min(p.to ?? lifeSpan(life).to ?? a, 1789);
            const list = lordsOfInsee(rows, p.ins);
            // le seigneur de ses années là (de a à z) : celui dont les années croisent les siennes, sinon le dernier avant
            const over = list.filter(r => { const [s0, e0] = lordSpan(r); return s0 !== null && e0 !== null && s0 <= z && e0 >= a; });
            const pick = over[over.length - 1];
            const y = pick ? Math.max(a, lordSpan(pick)[0]) : a;
            const at = pick ? {r: pick, exact: true} : (list.length ? lordAt(list, a) : null);
            const own = (owners[p.ins] || []).filter(o => (o.from ?? -Infinity) <= z && (o.to ?? Infinity) >= a && (o.from !== null || o.to !== null));
            if (at || own.length) out.push({place: p.name, ins: p.ins, y, at, list, own, age: age(life, y)});
        }
        return out;
    }

    /* ── ⛪ les églises disparues ── */
    const churchesAt = (rows, place, radius = 1) => {
        const ins = inseeOf(place), ll = llOf(place);
        return rows.filter(r => (ins && r.ins === ins) || (!ins && ll && r.exact && km(ll.lat, ll.lon, r.lat, r.lon) <= radius)).sort((a, b) => (a.y1 ?? 9999) - (b.y1 ?? 9999));
    };

    /* ── 🐄 les foires ── */
    const FAIR_JOBS = /cultivat|laboureu|fermier|metayer|menager|paysan|agricult|eleveu|bouvier|berger|vacher|porcher|maquignon|marchand|negociant|colporteu|forain|boucher|charcutier|meunier|vigneron|journalier|bourrelier|marechal|toucheur|herbager|proprietaire/;
    const fairsNear = (rows, lat, lon, radius = 15) => rows.map(f => ({f, km: km(lat, lon, f.lat, f.lon)})).filter(x => x.km <= radius).sort((a, b) => a.km - b.km);
    function fairsForLife(rows, life, radius = 15) {
        const job = jobMatch(life, FAIR_JOBS); if (!job) return null;
        const best = new Map();
        for (const p of placesOf(life).filter(p => p.ll && isFrance(p))) for (const x of fairsNear(rows, p.ll.lat, p.ll.lon, radius)) { const c = best.get(x.f.q); if (!c || x.km < c.km) best.set(x.f.q, {...x, place: p.name}); }
        const list = [...best.values()].sort((a, b) => Number(!!b.f.frwiki) - Number(!!a.f.frwiki) || a.km - b.km);
        return list.length ? {job, list} : null;
    }

    /* ── ⚽ les clubs ── */
    const clubsAt = (rows, place, radius = 2) => {
        const ins = inseeOf(place), ll = llOf(place);
        return rows.filter(r => (ins && r.ins === ins) || (!ins && ll && km(ll.lat, ll.lon, r.lat, r.lon) <= radius)).sort((a, b) => a.y - b.y || b.sl - a.sl);
    };
    function clubsForLife(rows, life) {
        const {from, to, birth} = lifeSpan(life); if (from === null) return [];
        const out = [];
        for (const p of placesOf(life).filter(isFrance)) for (const c of clubsAt(rows, p)) if (c.y >= (birth ?? from) && c.y <= (to ?? from + 90) && atPlace(p, c.y, 10)) out.push({c, place: p.name, age: age(life, c.y)});
        return out.sort((a, b) => b.c.sl - a.c.sl);
    }

    const core = {km, fold, table, lifeSpan, placesOf, marriageYear, spectaclesOfYear, spectaclesForLife, spectaclesNear, tourAt, tourForLife, exposForLife, exposAt,
        coincidences, lordSpan, lordsOfInsee, lordAt, lordsForLife, churchesAt, fairsNear, fairsForLife, clubsAt, clubsForLife, FAIR_JOBS};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const DATA_V = 1;
    const KINDS = ['spectacles', 'clubs', 'tour', 'expos', 'dates', 'seigneurs', 'eglises', 'foires'];
    const KEY = 'genealogie-lot8-monde-village';
    const TAB = ['lot8_monde_village', '25l8', '🎡 Le monde du village'];
    const BLOCK = ['l8c_village', '🎡 Le monde de son village'];
    const PARTS = [
        ['spectacles', '🎭 Les spectacles de son époque', 'L’opéra, le ballet ou la pièce créés l’année de son mariage (sinon de ses 20 ans) ; sur la fiche d’une ville, les créations qu’on y a données.'],
        ['clubs', '⚽ Les clubs sportifs de sa ville', 'Les clubs de foot, de rugby, de vélo… fondés dans sa commune, avec leur année.'],
        ['tour', '🚲 Le Tour de France chez lui', 'Les étapes du Tour parties de sa commune ou arrivées chez lui, de 1903 à aujourd’hui.'],
        ['expos', '🎡 Les Expositions universelles', 'L’Exposition de son temps (Paris 1889, 1900…) : son âge, les visiteurs, ce qu’on y a vu.'],
        ['dates', '🎂 Les coïncidences de sa vie', 'Né, marié ou mort le jour d’un grand événement ; ses anniversaires tombés un jour célèbre.'],
        ['seigneurs', '👑 Le seigneur de son village', 'Avant 1789 : le seigneur, le baron ou le comte du lieu, et les propriétaires du château.'],
        ['eglises', '⛪ Les églises disparues', 'Les églises, chapelles, abbayes démolies ou fermées de la commune, avec leur date et leur image.'],
        ['foires', '🐄 Les foires de son pays', 'Les foires d’autrefois près de chez lui (pour un cultivateur, un marchand, un maquignon…).']];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
    function dateTxt(d, y) { const [yy, mm, dd] = String(d || '').split('-').map(Number); if (yy && mm && dd) return `${dd === 1 ? '1er' : dd} ${T(MONTHS[mm - 1])} ${yy}`; if (yy && mm) return `${T(MONTHS[mm - 1])} ${yy}`; return String(y ?? ''); }
    const ageTxt = n => (n === 0 ? T('moins d’un an') : n === 1 ? T('1 an') : T('{n} ans', {n: String(n)}));
    const he = P => (P?.gender === 'female' ? T('elle') : P?.gender === 'male' ? T('il') : T('cette personne'));
    const He = P => cap(he(P));
    const kmTxt = k => (k < 1 ? T('moins d’1 km') : T('{n} km', {n: String(Math.round(k))}));
    const link = (url, label) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label));
    const srcLink = url => (url ? `<a class="l8c-src" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(T('↗ source'))}</a>` : '');
    const wdUrl = q => (q ? `https://www.wikidata.org/wiki/${encodeURIComponent(q)}` : '');
    const wpUrl = t => (t ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}` : '');
    const refLinks = r => `<span class="l8c-links">${r.frwiki ? link(wpUrl(r.frwiki), '↗ Wikipédia') + ' ' : ''}${r.q ? link(wdUrl(r.q), '↗ Wikidata') : ''}</span>`;
    const srcOf = r => (r.frwiki ? wpUrl(r.frwiki) : wdUrl(r.q));
    const row = (icon, html, src, extra = '') => `<div class="hist-row l8c-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="l8c-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const imgUrl = (f, w = 240) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(String(f).replace(/ /g, '_'))}?width=${w}`;
    const fileUrl = f => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(String(f).replace(/ /g, '_'))}`;

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    const data = {};
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir les fichiers du « Monde du village ».'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    let mondeP = null;
    const loadMonde = () => (mondeP ||= fetch('assets/data/monde-autour.json', {credentials: 'same-origin'}).then(r => (r.ok ? r.json() : null)).catch(() => { mondeP = null; return null; }));
    /** charge un sujet : {meta, rows} ; null si le fichier n'est pas livré */
    function load(kind) {
        if (!data[kind]) data[kind] = fetch(`assets/data/l8c-${kind}.json.gz?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (r.status === 404) return null; if (!r.ok) throw new Error(T('Le fichier {f} est introuvable.', {f: `l8c-${kind}`})); return readMaybeGz(r); })
            .then(async f => {
                if (!f) return null;
                const {rows, fields, ...meta} = f;
                let list = table(f);
                if (kind === 'dates') { const M = await loadMonde(); const by = new Map((M?.events || []).map(e => [e.id, e])); list = list.map(x => ({...x, ev: by.get(x.id) || null})).filter(x => x.ev); }
                return {meta, rows: list};
            })
            .catch(e => { delete data[kind]; throw e; });
        return data[kind];
    }
    async function loadSome(kinds) { const out = {}; await Promise.all(kinds.map(async k => { try { out[k] = await load(k); } catch (e) { console.error(e); out[k] = null; } })); return out; }
    const WD_SRC = () => `${link('https://www.wikidata.org', 'Wikidata')} (CC0)`;
    const SRC = {spectacles: WD_SRC, clubs: WD_SRC, tour: WD_SRC, seigneurs: WD_SRC,
        expos: url => `${link(url || 'https://fr.wikipedia.org', 'Wikipédia')} (CC BY-SA 4.0)`,
        dates: () => `${link('https://www.wikidata.org', 'Wikidata')} (CC0) · ${esc(T('les événements de « Le monde autour »'))}`,
        eglises: () => `${link('https://www.wikidata.org', 'Wikidata')} (CC0) · ${link('https://commons.wikimedia.org', 'Wikimedia Commons')} ${esc(T('(licence sur la page de chaque image)'))}`,
        foires: () => `${link('https://www.wikidata.org', 'Wikidata')} (CC0) · ${link('https://fr.wikipedia.org/wiki/Cat%C3%A9gorie:Foire_en_France', 'Wikipédia')} (CC BY-SA 4.0)`};
    const SRC_TXT = {spectacles: 'Wikidata (CC0) : date et lieu de la première', clubs: 'Wikidata (CC0)', tour: 'Wikidata (CC0) : étapes du Tour de France', expos: 'Wikipédia (CC BY-SA 4.0), phrase de chaque article',
        dates: 'Wikidata (CC0) ; événements de « Le monde autour » (Wikipédia)', seigneurs: 'Wikidata (CC0) : titres de noblesse', eglises: 'Wikidata (CC0) ; images Wikimedia Commons', foires: 'Wikidata (CC0) ; Wikipédia (CC BY-SA 4.0)'};
    const SRC_URL = {spectacles: 'https://www.wikidata.org/wiki/Property:P1191', clubs: 'https://www.wikidata.org/wiki/Q847017', tour: 'https://www.wikidata.org/wiki/Q33881', expos: 'https://fr.wikipedia.org/wiki/Exposition_universelle',
        dates: 'https://www.wikidata.org', seigneurs: 'https://www.wikidata.org/wiki/Property:P97', eglises: 'https://www.wikidata.org/wiki/Property:P5816', foires: 'https://fr.wikipedia.org/wiki/Cat%C3%A9gorie:Foire_en_France'};

    /* ─────────── les phrases ─────────── */
    const KIND_W = {opera: 'l’opéra', 'opera-comique': 'l’opéra-comique', operette: 'l’opérette', ballet: 'le ballet', theatre: 'la pièce', 'comedie-musicale': 'la comédie musicale', concert: 'l’œuvre'};
    const KIND_N = {opera: 'opéra', 'opera-comique': 'opéra-comique', operette: 'opérette', ballet: 'ballet', theatre: 'pièce de théâtre', 'comedie-musicale': 'comédie musicale', concert: 'œuvre de concert'};
    const specWhere = r => [r.venue, r.city && r.city !== r.venue ? r.city : ''].filter(Boolean).join(', ') || r.country;
    const specLi = x => `<li><i>${esc(x.r.n)}</i>${x.r.by ? ` (${esc(x.r.by)})` : ''} <small class="muted">${esc([T(KIND_N[x.r.k] || ''), dateTxt(x.r.d, x.r.y), specWhere(x.r)].filter(Boolean).join(' · '))}</small> ${refLinks(x.r)}</li>`;
    function spectaclesHtml(res, life) {
        if (!res) return '';
        const x = res.list[0].r, P = life.person;
        const when = res.why === 'mariage' ? T('L’année de son mariage ({y})', {y: String(res.y)}) : T('L’année de ses 20 ans ({y})', {y: String(res.y)});
        const lead = T('{when}, création de {k} {n} à {w}', {when, k: T(KIND_W[x.k] || ''), n: `<i>${esc(x.n)}</i>${x.by ? ` (${esc(x.by)})` : ''}`, w: esc(x.city || x.venue || x.country)})
            + (x.d ? ` <span class="muted">(${esc(dateTxt(x.d, x.y))}${x.venue && x.city ? `, ${esc(x.venue)}` : ''})</span>` : '') + '.';
        const near = res.list[0].km !== null && res.list[0].km <= 15 ? ` <b>${esc(T('C’était tout près de chez {p}.', {p: he(P) === 'elle' ? T('elle') : T('lui')}))}</b>` : '';
        const li = res.list.slice(1, 10).map(specLi).join('');
        return row('🎭', `${lead}${near} ${refLinks(x)}`, SRC.spectacles(), more(li ? `<p class="muted">${esc(T('Créés aussi en {y} :', {y: String(res.y)}))}</p><ul class="hist-ul">${li}</ul>` : '', res.list.length > 1 ? res.list.length - 1 : null));
    }
    const stageName = s => `${esc(s.a)}–${esc(s.b)}`;
    const stageLi = x => `<li><b>${esc(dateTxt(x.s.d, x.s.y))}</b> : ${esc(T('étape', {ctx: 'tour'}))} ${stageName(x.s)}${x.s.km ? ` <small class="muted">${esc(T('{n} km', {n: String(x.s.km)}))}</small>` : ''} <small class="muted">· ${esc(x.hit.includes('depart') && x.hit.includes('arrivee') ? T('départ et arrivée') : x.hit.includes('depart') ? T('départ') : T('arrivée', {ctx: 'tour'}))}</small> ${link(x.s.edwiki ? wpUrl(x.s.edwiki) : wdUrl(x.s.q), T('↗ source'))}</li>`;
    function tourHtml(list, life) {
        if (!list.length) return '';
        const x = list[0], P = life.person;
        let lead = T('Le Tour de France est passé à {p} en {y} (étape {s})', {p: esc(x.place), y: String(x.s.y), s: stageName(x.s)});
        if (x.lived) lead += esc(T(', quand {he} y vivait', {he: he(P)}));
        lead += x.age !== null && x.age >= 0 ? esc(T(' : {he} avait {a}.', {he: he(P), a: ageTxt(x.age)})) : '.';
        const li = list.slice(1, 20).map(stageLi).join('');
        return row('🚲', `${lead} ${link(x.s.edwiki ? wpUrl(x.s.edwiki) : wdUrl(x.s.q), T('↗ source'))}`, SRC.tour(), more(li ? `<ul class="hist-ul">${li}</ul>` : '', list.length > 1 ? list.length - 1 : null));
    }
    const visitorsTxt = n => (n >= 1e6 ? T('{n} millions de visiteurs', {n: String(Math.round(n / 1e5) / 10).replace('.', ',')}) : T('{n} visiteurs', {n: nf(n)}));
    const expoShort = e => (/^Exposition/.test(e.n) ? T('l’{n}', {n: e.n}) : e.n);
    const expoQuote = e => [e.visitors_sentence, e.highlight].filter(Boolean).map(s => `<blockquote class="l8c-quote">« ${esc(s)} »</blockquote>`).join('');
    function exposHtml(list, life) {
        if (!list.length) return '';
        const x = list[0], e = x.e, P = life.person;
        const lead = T('{He} avait {a} pendant {n} ({c}{v}).', {He: He(P), a: ageTxt(x.age), n: esc(expoShort(e)), c: esc(e.city), v: e.visitors ? ', ' + esc(visitorsTxt(e.visitors)) : ''})
            + (x.km !== null && x.km <= 30 ? ` <b>${esc(T('C’était chez {p}.', {p: he(P) === 'elle' ? T('elle') : T('lui')}))}</b>` : '');
        const det = `${expoQuote(e)}${list.length > 1 ? `<p class="muted">${esc(T('Les autres Expositions de sa vie :'))}</p><ul class="hist-ul">${list.slice(1).map(y => `<li>${esc(y.e.n)} <small class="muted">${esc([y.e.city, ageTxt(y.age), y.e.visitors ? visitorsTxt(y.e.visitors) : ''].filter(Boolean).join(' · '))}</small> ${srcLink(y.e.url)}</li>`).join('')}</ul>` : ''}`;
        return row('🎡', `${lead} ${srcLink(e.url)}`, SRC.expos(e.url), more(det, list.length > 1 ? list.length - 1 : null));
    }
    const evWhat = x => (x.w === 'debut' ? T('{t} (le début)', {t: x.ev.title}) : x.w === 'fin' ? T('{t} (la fin)', {t: x.ev.title}) : x.ev.title);
    const coincLine = (c, P) => {
        const d = dateTxt(c.x.d), w = esc(evWhat(c.x));
        if (c.kind === 'naissance') return T('{He} est né{e} le {d} ; ce jour-là : {w}.', {He: He(P), e: P?.gender === 'female' ? 'e' : '', d, w: `<b>${w}</b>`});
        if (c.kind === 'mariage') return T('{He} s’est marié{e} le {d} ; ce jour-là : {w}.', {He: He(P), e: P?.gender === 'female' ? 'e' : '', d, w: `<b>${w}</b>`});
        if (c.kind === 'deces') return T('{He} est mort{e} le {d} ; ce jour-là : {w}.', {He: He(P), e: P?.gender === 'female' ? 'e' : '', d, w: `<b>${w}</b>`});
        return T('{He} a eu {n} le {d} : {w}.', {He: He(P), n: ageTxt(c.n), d, w: `<b>${w}</b>`});
    };
    const coincSrc = x => `${link(x.ev.url, T('↗ Wikipédia'))} ${link(wdUrl(x.q), T('↗ Wikidata'))}`;
    function coincHtml(list, life) {
        if (!list.length) return '';
        const P = life.person, top = list[0];
        const li = list.slice(1, 12).map(c => `<li>${coincLine(c, P)} ${coincSrc(c.x)}</li>`).join('');
        return row('🎂', `${coincLine(top, P)} ${coincSrc(top.x)}`, SRC.dates(), more(`${li ? `<ul class="hist-ul">${li}</ul>` : ''}<small class="muted hist-hyp">${esc(T('Le jour de l’événement vient de Wikidata (la date écrite sur l’élément de l’article de Wikipédia) ; ses dates viennent de sa fiche. Un hasard, rien de plus !'))}</small>`, list.length > 1 ? list.length - 1 : null));
    }
    const yrs = (a, z) => (a !== null && a !== undefined && z !== null && z !== undefined ? `${a}–${z}` : a !== null && a !== undefined ? T('dès {y}', {y: String(a)}) : z !== null && z !== undefined ? T('jusqu’en {y}', {y: String(z)}) : '');
    const deOf = n => (/^[aeiouyàâéèêîôûh]/i.test(n) ? `d’${n}` : /^le /i.test(n) ? `du ${n.slice(3)}` : /^les /i.test(n) ? `des ${n.slice(4)}` : `de ${n}`);
    /** « comte de Coligny » : le titre, et le lieu quand le titre est un seul mot (« baron ») */
    const titleTxt = r => (r.title && r.of && !/\s/.test(r.title.trim()) ? `${r.title} ${deOf(r.of)}` : r.title || '');
    const lordWhen = r => (r.s !== null || r.e !== null ? yrs(r.s, r.e) : T('vie : {v}', {v: yrs(r.b, r.d)}));
    const lordLi = r => `<li><b>${esc(r.n)}</b>, ${esc(titleTxt(r))} <small class="muted">${esc(lordWhen(r))}</small> ${refLinks(r)}</li>`;
    const ownerLi = o => `<li><b>${esc(o.name)}</b>, ${esc(T('propriétaire de {c}', {c: o.castle}))} <small class="muted">${esc(yrs(o.from, o.to))}</small> ${link(wdUrl(o.cq), T('↗ Wikidata'))}</li>`;
    function lordsHtml(list, life) {
        if (!list.length) return '';
        const P = life.person, x = list[0];
        let lead;
        if (x.at) lead = x.at.exact ? T('En {y}, à {p}, {he} vivait sous {n}, {t}.', {y: String(x.y), p: esc(x.place), he: he(P), n: `<b>${esc(x.at.r.n)}</b>`, t: esc(titleTxt(x.at.r))})
            : T('À {p}, le dernier seigneur connu avant {y} : {n}, {t} ({w}).', {p: esc(x.place), y: String(x.y), n: `<b>${esc(x.at.r.n)}</b>`, t: esc(titleTxt(x.at.r)), w: esc(lordWhen(x.at.r))});
        else lead = T('En {y}, à {p}, {c} appartenait à {n}.', {y: String(x.y), p: esc(x.place), c: esc(x.own[0].castle), n: `<b>${esc(x.own[0].name)}</b>`});
        const det = list.map(z => `<p><b>${esc(z.place)}</b></p><ul class="hist-ul">${z.list.map(lordLi).join('')}${(z.own || []).map(ownerLi).join('')}</ul>`).join('')
            + `<small class="muted hist-hyp">${esc(T('Les titres et leurs dates viennent de Wikidata ; quand le titre n’a pas de dates, ce sont celles de la vie du seigneur. Beaucoup de seigneurs de village n’y sont pas : les terriers et les aveux sont aux Archives départementales (série E).'))}</small>`;
        return row('👑', `${lead} ${x.at ? refLinks(x.at.r) : link(wdUrl(x.own[0].cq), T('↗ Wikidata'))}`, SRC.seigneurs(), more(det));
    }
    const fairLi = x => `<li><b>${esc(x.f.n)}</b> <small class="muted">${esc([x.f.commune, x.km !== undefined ? kmTxt(x.km) : '', x.f.freq, x.f.y ? T('depuis {y}', {y: String(x.f.y)}) : ''].filter(Boolean).join(' · '))}</small> ${refLinks(x.f)}${x.f.sentence ? `<br><small class="muted">« ${esc(x.f.sentence)} »</small>` : ''}</li>`;
    function fairsHtml(res, life) {
        if (!res) return '';
        const P = life.person, x = res.list[0];
        const lead = T('{He} était {job} ; la foire connue la plus proche de chez {lui} : {f}, à {k} de {p}.', {He: He(P), job: `<b>${esc(res.job)}</b>`, lui: P?.gender === 'female' ? T('elle') : T('lui'), f: `<b>${esc(x.f.n)}</b>`, k: kmTxt(x.km), p: esc(x.place)});
        return row('🐄', `${lead} ${refLinks(x.f)}`, SRC.foires(), more(`<ul class="hist-ul">${res.list.slice(0, 15).map(fairLi).join('')}</ul>`, res.list.length > 1 ? res.list.length : null));
    }
    const clubLi = c => `<li><b>${esc(c.n)}</b> <small class="muted">${esc([T('fondé en {y}', {y: String(c.y)}), c.sp, c.end ? T('disparu en {y}', {y: String(c.end)}) : ''].filter(Boolean).join(' · '))}</small> ${refLinks(c)}</li>`;

    /* ─────────── 🎡 la fiche d'une personne ─────────── */
    const lifeMemo = new Map();
    const lifeOf = id => { if (!lifeMemo.has(id)) lifeMemo.set(id, A().api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };
    /** les propriétaires des châteaux de ses communes (heritage-chateaux-territoires.js) : {insee: [{name, castle, cq, from, to}]} */
    async function ownersByInsee(insees) {
        const CT = ext.chateauxTerritoires; if (!CT?.loadCountry || !insees.length) return {};
        let f; try { f = await CT.loadCountry('FR'); } catch (_) { return {}; }
        const items = f?.items || f?.rows || [], want = new Set(insees), out = {};
        for (const c of items) if (want.has(c.ci) && (c.ow || []).length) for (const o of c.ow) (out[c.ci] ||= []).push({name: o[0], q: o[1], from: o[2] ?? null, to: o[3] ?? null, castle: c.n, cq: c.q, castleItem: c});
        return out;
    }
    const PERSON_KINDS = ['spectacles', 'tour', 'expos', 'dates', 'seigneurs', 'foires'];
    /** remplit un élément avec les lignes de la personne ; renvoie le nombre de lignes */
    async function personInto(host, id, opts = {}) {
        const s = settings(), want = (opts.parts || PERSON_KINDS).filter(k => opts.force || s[k]);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (e) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const D = await loadSome(want);
        const html = [];
        if (D.dates) html.push(coincHtml(coincidences(D.dates.rows, life), life));
        if (D.spectacles) html.push(spectaclesHtml(spectaclesForLife(D.spectacles.rows, life), life));
        if (D.expos) html.push(exposHtml(exposForLife(D.expos.rows, life), life));
        if (D.tour) html.push(tourHtml(tourForLife(D.tour.rows, life), life));
        if (D.seigneurs) { const ins = placesOf(life).map(p => p.ins).filter(Boolean); html.push(lordsHtml(lordsForLife(D.seigneurs.rows, life, await ownersByInsee(ins)), life)); }
        if (D.foires) html.push(fairsHtml(fairsForLife(D.foires.rows, life), life));
        if (!host.isConnected && !opts.detached) return 0;
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life l8c-life">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK[0]] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!PERSON_KINDS.some(on)) return '';
        return A().card(index, T(BLOCK[1]), '', `<div class="l8c-block" data-l8c-person="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-l8c-person]').forEach(async h => {
            const id = Number(h.dataset.l8cPerson); lifeMemo.delete(id);
            const n = await personInto(h, id);
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    const placeLL = pl => llOf(pl);
    /** le HTML d'un sujet pour un lieu ('' = rien à dire) */
    async function placePart(kind, place, opts = {}) {
        const D = await load(kind).catch(() => null); if (!D) return '';
        const ll = placeLL(place), ins = inseeOf(place), rows = D.rows;
        if (kind === 'spectacles') {
            if (!ll) return '';
            const list = spectaclesNear(rows, ll.lat, ll.lon, 5); if (!list.length) return '';
            const top = [...list].sort((a, b) => b.sl - a.sl)[0];
            const lead = list.length > 1 ? T('{n} créations (opéras, ballets, pièces) ont eu leur première ici. La plus connue : {w} ({y}).', {n: String(list.length), w: `<i>${esc(top.n)}</i>${top.by ? ` — ${esc(top.by)}` : ''}`, y: String(top.y)})
                : T('{w} a eu sa première ici en {y}.', {w: `<i>${esc(top.n)}</i>${top.by ? ` (${esc(top.by)})` : ''}`, y: String(top.y)});
            return row('🎭', `${lead} ${refLinks(top)}`, SRC.spectacles(), more(`<ul class="hist-ul">${list.slice(0, 60).map(r => specLi({r})).join('')}</ul>`, list.length > 1 ? list.length : null));
        }
        if (kind === 'clubs') {
            const list = clubsAt(rows, place); if (!list.length) return '';
            const top = list[0];
            const lead = list.length > 1 ? T('{n} clubs sportifs connus dans la commune. Le plus ancien : {c}, fondé en {y}.', {n: String(list.length), c: `<b>${esc(top.n)}</b>`, y: String(top.y)}) : T('{c} est fondé ici en {y}.', {c: `<b>${esc(top.n)}</b>${top.sp ? ` (${esc(top.sp)})` : ''}`, y: String(top.y)});
            return row('⚽', `${lead} ${refLinks(top)}`, SRC.clubs(), more(list.length > 1 ? `<ul class="hist-ul">${list.slice(0, 40).map(clubLi).join('')}</ul>` : '', list.length > 1 ? list.length : null));
        }
        if (kind === 'tour') {
            const list = tourAt(rows, place); if (!list.length) return '';
            const first = list[0], last = list[list.length - 1];
            const lead = list.length > 1 ? T('Le Tour de France est passé ici {n} fois : la première en {y} (étape {s}), la dernière en {z}.', {n: String(list.length), y: String(first.s.y), s: stageName(first.s), z: String(last.s.y)})
                : T('Le Tour de France est passé ici en {y} (étape {s}).', {y: String(first.s.y), s: stageName(first.s)});
            return row('🚲', `${lead} ${link(first.s.edwiki ? wpUrl(first.s.edwiki) : wdUrl(first.s.q), T('↗ source'))}`, SRC.tour(), more(`<ul class="hist-ul">${list.map(stageLi).join('')}</ul>`, list.length));
        }
        if (kind === 'expos') {
            if (!ll) return '';
            const list = exposAt(rows, ll.lat, ll.lon, 15); if (!list.length) return '';
            const e = list[0];
            const lead = list.length > 1 ? T('{n} Expositions ont eu lieu ici, de {a} à {z}.', {n: String(list.length), a: String(e.y), z: String(list[list.length - 1].y)}) : T('{n} a eu lieu ici en {y}{v}.', {n: esc(cap(expoShort(e))), y: String(e.y), v: e.visitors ? ` (${esc(visitorsTxt(e.visitors))})` : ''});
            const det = list.map(x => `<p><b>${esc(x.n)}</b>${x.when ? ` <small class="muted">${esc(x.when)}</small>` : ''} ${srcLink(x.url)}</p>${expoQuote(x)}`).join('');
            return row('🎡', `${lead} ${srcLink(e.url)}`, SRC.expos(e.url), more(det, list.length));
        }
        if (kind === 'seigneurs') {
            if (!ins) return '';
            const list = lordsOfInsee(rows, ins), own = (await ownersByInsee([ins]))[ins] || [];
            const old = own.filter(o => (o.from ?? o.to ?? 9999) <= 1789);
            if (!list.length && !old.length) return '';
            const r = list.length ? lordAt(list, 1780) : null;
            const lead = r?.exact ? T('En 1780, le seigneur du lieu : {n}, {t}.', {n: `<b>${esc(r.r.n)}</b>`, t: esc(titleTxt(r.r))})
                : list.length ? T('{n} seigneurs connus (Wikidata). Le premier : {s}, {t} ({w}).', {n: String(list.length), s: `<b>${esc(list[0].n)}</b>`, t: esc(titleTxt(list[0])), w: esc(lordWhen(list[0]))})
                : T('{c} : {n} propriétaires connus avant la Révolution.', {c: esc(old[0].castle), n: String(old.length)});
            return row('👑', `${lead} ${list.length ? refLinks((r?.r) || list[0]) : link(wdUrl(old[0].cq), T('↗ Wikidata'))}`, SRC.seigneurs(), more(`<ul class="hist-ul">${list.map(lordLi).join('')}${old.map(ownerLi).join('')}</ul>`, list.length + old.length));
        }
        if (kind === 'eglises') {
            const list = churchesAt(rows, place); if (!list.length) return '';
            const top = list.find(r => r.st === 'detruit') || list[0];
            const lead = list.length > 1 ? T('{n} édifices religieux disparus ou fermés dans la commune, dont {c}.', {n: String(list.length), c: `<b>${esc(top.n)}</b>${top.y1 ? ` (${esc(churchState(top))})` : ''}`}) : T('{c} : {s}.', {c: `<b>${esc(cap(top.n))}</b>`, s: esc(churchState(top))});
            const imgs = list.filter(r => r.img).slice(0, 6).map(r => `<figure class="l8c-fig"><a href="${esc(fileUrl(r.img))}" target="_blank" rel="noopener noreferrer"><img loading="lazy" alt="${esc(r.n)}" src="${esc(imgUrl(r.img))}" onerror="this.closest('figure').hidden=true"></a><figcaption>${esc(r.n)} · ${link(fileUrl(r.img), T('↗ auteur et licence'))}</figcaption></figure>`).join('');
            const li = list.map(r => `<li><b>${esc(r.n)}</b> <small class="muted">${esc([T(r.k), churchState(r), r.mh ? T('monument historique') : ''].filter(Boolean).join(' · '))}</small> ${refLinks(r)}</li>`).join('');
            return row('⛪', `${lead} ${refLinks(top)}`, SRC.eglises(), more(`${imgs ? `<div class="l8c-figs">${imgs}</div>` : ''}<ul class="hist-ul">${li}</ul><small class="muted hist-hyp">${esc(T('« Fermé » : Wikidata donne une date de fin (une abbaye dissoute à la Révolution, par exemple) sans dire si le bâtiment a été démoli.'))}</small>`, list.length > 1 ? list.length : null));
        }
        if (kind === 'foires') {
            if (!ll) return '';
            const list = fairsNear(rows, ll.lat, ll.lon, 15); if (!list.length) return '';
            const top = list.find(x => x.f.frwiki) || list[0];
            const lead = list.length > 1 ? T('{n} foires connues à moins de 15 km, dont {f} ({c}).', {n: String(list.length), f: `<b>${esc(top.f.n)}</b>`, c: esc(top.f.commune)}) : T('{f} ({c}, à {k}).', {f: `<b>${esc(top.f.n)}</b>`, c: esc(top.f.commune), k: kmTxt(top.km)});
            return row('🐄', `${lead} ${refLinks(top.f)}`, SRC.foires(), more(`<ul class="hist-ul">${list.slice(0, 30).map(fairLi).join('')}</ul><small class="muted hist-hyp">${esc(T('Seules les foires décrites dans Wikidata ou Wikipédia sont là : les petites foires de village se trouvent dans les almanachs et les délibérations municipales (Archives départementales).'))}</small>`, list.length > 1 ? list.length : null));
        }
        return '';
    }
    const churchState = r => (r.st === 'detruit' ? (r.y1 ? T('démoli ou détruit, fin en {y}', {y: String(r.y1)}) : T('démoli ou détruit')) : r.st === 'partiel' ? T('partiellement détruit') : r.y1 ? T('fermé ou disparu en {y}', {y: String(r.y1)}) : T('fermé ou disparu'));
    const PLACE_KINDS = ['seigneurs', 'eglises', 'foires', 'clubs', 'tour', 'expos', 'spectacles'];
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || PLACE_KINDS).filter(k => opts.force || s[k]);
        const parts = await Promise.all(kinds.map(k => placePart(k, place, opts).catch(() => '')));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean);
        host.innerHTML = html.length ? `<section class="maintenance-panel cplus-panel l8c-panel"><h3>${esc(T('🎡 Le monde du village'))}</h3><div class="hist-life l8c-life">${html.join('')}</div></section>` : '';
        return html.length;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || village.querySelector('[data-cad-insee]')?.dataset.cadInsee || ''};
    }
    // ⚙️ « Organiser la fiche » d'un village (heritage-more.js) : cette partie y est rangée, masquée, à la largeur choisie
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'l8c_place', host: '[data-l8c-host]', icon: '🎡', label: 'Le monde de son village', group: 'Autour'});
    async function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-l8c])'); if (!village) return;
        village.dataset.l8c = '1';
        const anchor = village.querySelector('[data-et-host]') || village.querySelector('[data-ha-host]') || village.querySelector('[data-lp-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="l8c-place" data-l8c-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-l8c-host]'), villagePlace(village));
    }
    let pending = 0;
    if (typeof MutationObserver !== 'undefined' && root.document) new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate().catch(e => console.error(e)); }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 📜 Monographie de commune : une partie par sujet ─────────── */
    const MONO = [['seigneurs', 'l8c_seigneurs', '👑', 'Ses seigneurs'], ['eglises', 'l8c_eglises', '⛪', 'Les églises disparues'], ['foires', 'l8c_foires', '🐄', 'Les foires d’autrefois près de chez lui'],
        ['clubs', 'l8c_clubs', '⚽', 'Les clubs sportifs'], ['tour', 'l8c_tour', '🚲', 'Le Tour de France est passé ici'], ['expos', 'l8c_expos', '🎡', 'Les Expositions'], ['spectacles', 'l8c_spectacles', '🎭', 'Les spectacles créés ici']];
    (ext.monographSections = ext.monographSections || []).push(...MONO.map(([kind, id, icon, label]) => ({
        id, icon, label, group: kind === 'expos' || kind === 'spectacles' ? 'Le monde' : 'Le lieu', defaultOn: true, enabled: () => on(kind), source: SRC_TXT[kind],
        render: async (place, host, ctx) => {
            let pl = {...place, lat: place.latitude ?? place.lat, lon: place.longitude ?? place.lon};
            if (!inseeOf(pl) && ctx?.village) { try { const v = await ctx.village(); if (v?.insee) pl = {...pl, insee: v.insee}; } catch (_) {} }
            const html = await placePart(kind, pl, {}); if (!html) return false;
            host.innerHTML = `<div class="hist-life l8c-life">${html}</div>`; return true;
        }})));

    /* ─────────── 📋 Listes ─────────── */
    const rowsOf = kind => load(kind).then(D => (D ? D.rows : []));
    const L = ext.dataLists = ext.dataLists || [];
    L.push(
        {id: 'l8c_spectacles', icon: '🎭', label: T('Créations d’opéras, ballets et pièces en Europe'), group: 'Le monde', source: SRC_TXT.spectacles, sourceUrl: SRC_URL.spectacles, enabled: () => on('spectacles'),
            load: async () => (await rowsOf('spectacles')).map(r => ({...r, title: r.n, kind: T(KIND_N[r.k] || r.k), year: r.y, date: r.d || '', fame: r.sl, src: srcOf(r)})),
            fields: [{key: 'title', label: T('Œuvre'), type: 'text'}, {key: 'by', label: T('Auteur'), type: 'text'}, {key: 'kind', label: T('Genre'), type: 'enum', values: Object.values(KIND_N).map(x => T(x))}, {key: 'date', label: T('Première'), type: 'date'},
                {key: 'year', label: T('Année'), type: 'year'}, {key: 'venue', label: T('Salle'), type: 'text'}, {key: 'city', label: T('Ville'), type: 'text'}, {key: 'country', label: T('Pays'), type: 'enum'}, {key: 'fame', label: T('Wikipédias (renommée)'), type: 'number'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.y, r.y], geo: r => (r.lat !== null ? [r.lat, r.lon] : null)},
        {id: 'l8c_clubs', icon: '⚽', label: T('Clubs sportifs de France et leur fondation'), group: 'Le lieu', source: SRC_TXT.clubs, sourceUrl: SRC_URL.clubs, enabled: () => on('clubs'),
            load: async () => (await rowsOf('clubs')).map(r => ({...r, name: r.n, sport: r.sp, year: r.y, fame: r.sl, src: srcOf(r)})),
            fields: [{key: 'name', label: T('Club'), type: 'text'}, {key: 'sport', label: T('Sport'), type: 'enum'}, {key: 'year', label: T('Fondé en'), type: 'year'}, {key: 'end', label: T('Disparu en'), type: 'year'}, {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'ins', label: T('Code INSEE'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.y, r.end ?? null], geo: r => [r.lat, r.lon]},
        {id: 'l8c_tour', icon: '🚲', label: T('Étapes du Tour de France (1903–2025)'), group: 'Le lieu', source: SRC_TXT.tour, sourceUrl: SRC_URL.tour, enabled: () => on('tour'),
            load: async () => (await rowsOf('tour')).map(s => ({...s, name: `${s.a} – ${s.b}`, date: s.d || '', year: s.y, stage: s.no, from: s.a, to: s.b, src: s.edwiki ? wpUrl(s.edwiki) : wdUrl(s.q)})),
            fields: [{key: 'date', label: T('Date'), type: 'date'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'stage', label: T('Étape'), type: 'text'}, {key: 'from', label: T('Départ'), type: 'place'}, {key: 'to', label: T('Arrivée'), type: 'place'}, {key: 'km', label: T('Distance (km)'), type: 'number'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: s => [s.y, s.y], geo: s => (s.bla !== null ? [s.bla, s.blo] : s.ala !== null ? [s.ala, s.alo] : null)},
        {id: 'l8c_expos', icon: '🎡', label: T('Expositions universelles et internationales'), group: 'Le monde', source: SRC_TXT.expos, sourceUrl: SRC_URL.expos, enabled: () => on('expos'),
            load: async () => (await rowsOf('expos')).map(e => ({...e, name: e.n, year: e.y, kind: T(e.k), quote: [e.visitors_sentence, e.highlight].filter(Boolean).join(' — '), src: e.url})),
            fields: [{key: 'name', label: T('Exposition'), type: 'text'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'city', label: T('Ville'), type: 'place'}, {key: 'kind', label: T('Genre'), type: 'enum'}, {key: 'visitors', label: T('Visiteurs'), type: 'number'}, {key: 'quote', label: T('La phrase de la source'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: e => [e.y, e.y2 ?? e.y], geo: e => (e.lat !== null ? [e.lat, e.lon] : null)},
        {id: 'l8c_dates', icon: '🎂', label: T('Les jours célèbres (pour les coïncidences)'), group: 'Le monde', source: SRC_TXT.dates, sourceUrl: SRC_URL.dates, enabled: () => on('dates'),
            load: async () => (await rowsOf('dates')).map(x => ({name: evWhat(x), date: x.d, year: Number(x.d.slice(0, 4)), day: dateTxt(x.d).replace(/ \d{4}$/, ''), cat: x.ev.cat, src: x.ev.url, wd: wdUrl(x.q)})),
            fields: [{key: 'name', label: T('Événement'), type: 'text'}, {key: 'date', label: T('Date'), type: 'date'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'day', label: T('Jour'), type: 'text'}, {key: 'cat', label: T('Sorte'), type: 'enum'}, {key: 'src', label: T('Source'), type: 'url'}, {key: 'wd', label: T('Wikidata'), type: 'url'}],
            period: x => [x.year, x.year]},
        {id: 'l8c_seigneurs', icon: '👑', label: T('Seigneurs des communes de France (avant 1800)'), group: 'Le lieu', source: SRC_TXT.seigneurs, sourceUrl: SRC_URL.seigneurs, enabled: () => on('seigneurs'),
            load: async () => (await rowsOf('seigneurs')).map(r => ({...r, name: r.n, title: titleTxt(r), from: lordSpan(r)[0], to: lordSpan(r)[1], src: srcOf(r)})),
            fields: [{key: 'name', label: T('Seigneur'), type: 'text'}, {key: 'title', label: T('Titre'), type: 'text'}, {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'from', label: T('De'), type: 'year'}, {key: 'to', label: T('À'), type: 'year'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => lordSpan(r)},
        {id: 'l8c_eglises', icon: '⛪', label: T('Églises, chapelles, abbayes disparues'), group: 'Le lieu', source: SRC_TXT.eglises, sourceUrl: SRC_URL.eglises, enabled: () => on('eglises'),
            load: async () => (await rowsOf('eglises')).map(r => ({...r, name: r.n, kind: T(r.k), state: churchState(r), from: r.y0, to: r.y1, src: srcOf(r)})),
            fields: [{key: 'name', label: T('Édifice'), type: 'text'}, {key: 'kind', label: T('Sorte'), type: 'enum'}, {key: 'state', label: T('État'), type: 'text'}, {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'from', label: T('Construit'), type: 'year'}, {key: 'to', label: T('Fin'), type: 'year'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.y0, r.y1], geo: r => [r.lat, r.lon]},
        {id: 'l8c_foires', icon: '🐄', label: T('Foires de France'), group: 'Le lieu', source: SRC_TXT.foires, sourceUrl: SRC_URL.foires, enabled: () => on('foires'),
            load: async () => (await rowsOf('foires')).map(r => ({...r, name: r.n, year: r.y, quote: r.sentence, src: srcOf(r)})),
            fields: [{key: 'name', label: T('Foire'), type: 'text'}, {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'year', label: T('Depuis'), type: 'year'}, {key: 'freq', label: T('Quand'), type: 'text'}, {key: 'quote', label: T('La phrase de la source'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.y, null], geo: r => [r.lat, r.lon]});

    /* ─────────── 🧰 le registre commun des données : à la demande ─────────── */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', country: pl.country || '', county: pl.county || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
    const personOfCtx = ctx => Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0;
    const EMPTY = {seigneurs: 'Aucun seigneur connu pour cette commune (dans Wikidata).', eglises: 'Aucune église disparue connue dans cette commune (dans Wikidata).', foires: 'Aucune foire connue à moins de 15 km.',
        clubs: 'Aucun club sportif connu dans cette commune.', tour: 'Le Tour de France n’est jamais parti ni arrivé ici.', expos: 'Pas d’Exposition universelle ici.', spectacles: 'Aucune création connue ici.'};
    async function runPlace(kind, ctx, host) {
        const pl = placeOfCtx(ctx.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return null; }
        const html = await placePart(kind, pl, {});
        host.innerHTML = html ? `<div class="hist-life l8c-life">${html}</div>` : '';
        return !!html;
    }
    async function runPerson(parts, ctx, host) {
        const id = personOfCtx(ctx); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
        host.innerHTML = '<div></div>';
        const n = await personInto(host.firstElementChild, id, {parts, force: true, detached: true});
        if (!n) host.innerHTML = '';
        return n;
    }
    async function runYear(kind, ctx, host) {
        const y = num(ctx.year); if (y === null) { host.innerHTML = emptyLine(T('Choisis une année.'), '📅'); return null; }
        let html = '';
        if (kind === 'spectacles') { const list = spectaclesOfYear(await rowsOf('spectacles'), y); if (list.length) html = row('🎭', T('En {y}, création de {n} ({w}).', {y: String(y), n: `<i>${esc(list[0].r.n)}</i>${list[0].r.by ? `, ${esc(list[0].r.by)}` : ''}`, w: esc(specWhere(list[0].r))}) + ' ' + refLinks(list[0].r), SRC.spectacles(), more(`<ul class="hist-ul">${list.slice(1, 15).map(specLi).join('')}</ul>`, list.length - 1 || null)); }
        if (kind === 'tour') { const list = (await rowsOf('tour')).filter(s => s.y === y); if (list.length) html = row('🚲', T('Le Tour de France {y} : {n} étapes, de {a} à {b}.', {y: String(y), n: String(list.length), a: esc(list[0].a), b: esc(list[list.length - 1].b)}) + ' ' + link(list[0].edwiki ? wpUrl(list[0].edwiki) : wdUrl(list[0].ed), T('↗ source')), SRC.tour(), more(`<ul class="hist-ul">${list.map(s => stageLi({s, hit: []})).join('')}</ul>`)); }
        if (kind === 'expos') { const list = (await rowsOf('expos')).filter(e => e.y <= y && (e.y2 ?? e.y) >= y); if (list.length) html = list.map(e => row('🎡', `${esc(cap(expoShort(e)))} (${esc(e.city)}${e.visitors ? ', ' + esc(visitorsTxt(e.visitors)) : ''}). ${srcLink(e.url)}`, SRC.expos(e.url), more(expoQuote(e)))).join(''); }
        if (kind === 'dates') { const list = (await rowsOf('dates')).filter(x => x.d.startsWith(String(y))); if (list.length) html = row('🎂', T('Les jours célèbres de {y} :', {y: String(y)}), SRC.dates(), `<ul class="hist-ul">${list.map(x => `<li><b>${esc(dateTxt(x.d))}</b> : ${esc(evWhat(x))} ${coincSrc(x)}</li>`).join('')}</ul>`); }
        host.innerHTML = html ? `<div class="hist-life l8c-life">${html}</div>` : '';
        return !!html;
    }
    const DS = ext.dataSources = ext.dataSources || [];
    DS.push(
        {id: 'l8c_personne', icon: '🎡', label: T('Le monde de son village (spectacles, Tour de France, Expositions, coïncidences, seigneur, foires)'), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson(PERSON_KINDS, ctx, host)},
        {id: 'l8c_coincidences', icon: '🎂', label: T('Les coïncidences de sa vie'), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson(['dates'], ctx, host)},
        ...MONO.map(([kind, id, icon, label]) => ({id, icon, label: T(label), group: 'Le lieu', needs: ['place'], installed: () => true, run: (ctx, host) => runPlace(kind, ctx, host)})),
        {id: 'l8c_spectacles_annee', icon: '🎭', label: T('Les spectacles créés cette année-là'), group: 'Le monde', needs: ['year'], installed: () => true, run: (ctx, host) => runYear('spectacles', ctx, host)},
        {id: 'l8c_tour_annee', icon: '🚲', label: T('Le Tour de France de cette année-là'), group: 'Le monde', needs: ['year'], installed: () => true, run: (ctx, host) => runYear('tour', ctx, host)},
        {id: 'l8c_expos_annee', icon: '🎡', label: T('L’Exposition universelle de cette année-là'), group: 'Le monde', needs: ['year'], installed: () => true, run: (ctx, host) => runYear('expos', ctx, host)},
        {id: 'l8c_dates_annee', icon: '🎂', label: T('Les jours célèbres de cette année-là'), group: 'Le monde', needs: ['year'], installed: () => true, run: (ctx, host) => runYear('dates', ctx, host)});

    /* ─────────── ⛪ pour la future fiche « lieu de culte » et 🏰 « château » ─────────── */
    /** les lieux de culte disparus d'une commune, prêts pour une fiche : [{q, name, kind, state, stateText, from, to, image, imageUrl, imagePage, wikidata, wikipedia, lat, lon, exact, mh, source}] */
    async function worshipPlaces(insee) {
        const rows = await rowsOf('eglises');
        return rows.filter(r => r.ins === String(insee)).map(r => ({q: r.q, name: r.n, kind: r.k, state: r.st, stateText: churchState(r), from: r.y0, to: r.y1, image: r.img || '', imageUrl: r.img ? imgUrl(r.img, 480) : '', imagePage: r.img ? fileUrl(r.img) : '',
            wikidata: wdUrl(r.q), wikipedia: r.frwiki ? wpUrl(r.frwiki) : '', lat: r.lat, lon: r.lon, exact: !!r.exact, mh: r.mh || '', source: SRC_TXT.eglises}));
    }
    /** les seigneurs connus d'une commune (Wikidata) et les propriétaires de ses châteaux : [{name, title, from, to, wikidata, wikipedia, kind}] */
    async function lordsOf(insee) {
        const ins = String(insee), list = lordsOfInsee(await rowsOf('seigneurs'), ins), own = (await ownersByInsee([ins]))[ins] || [];
        return [...list.map(r => ({name: r.n, title: titleTxt(r), from: lordSpan(r)[0], to: lordSpan(r)[1], datesOf: r.s !== null || r.e !== null ? 'titre' : 'vie', wikidata: wdUrl(r.q), wikipedia: r.frwiki ? wpUrl(r.frwiki) : '', kind: 'seigneur'})),
            ...own.map(o => ({name: o.name, title: T('propriétaire de {c}', {c: o.castle}), from: o.from, to: o.to, datesOf: 'titre', wikidata: wdUrl(o.q || o.cq), wikipedia: '', kind: 'proprietaire', castle: o.castleItem}))];
    }

    /* ─────────── ⚙️ Réglages → 🎡 Le monde du village ─────────── */
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const metas = {};
        await Promise.all(KINDS.map(async k => { try { const D = await load(k); if (D) metas[k] = {meta: D.meta, n: D.rows.length}; } catch (_) {} }));
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([k, label, sub]) => `<label class="checkbox-line cplus-tg" data-l8c-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const rows = PARTS.map(([k, label]) => { const m = metas[k]; if (!m) return `<tr><td>${esc(T(label))}</td><td colspan="4" class="muted">${esc(T('Fichier absent.'))}</td></tr>`;
            const mm = m.meta; return `<tr><td>${esc(T(label))}</td><td>${link(mm.url, mm.source)}<br><small class="muted">${esc(mm.what || '')}</small></td><td>${esc(nf(m.n))}</td><td>${mm.licence_url ? link(mm.licence_url, mm.licence) : esc(mm.licence)}${mm.mention ? ` — « ${esc(mm.mention)} »` : ''}</td><td>${esc(mm.built || '')}</td></tr>`; }).join('');
        ws.innerHTML = `<section class="page cplus-settings l8c-settings" data-l8c-settings>${UI().pageHeader ? UI().pageHeader({title: T('Le monde du village'), icon: '🎡', where: T('Réglages · Données'), help: esc(T('Les spectacles, le Tour de France, les Expositions, les coïncidences, les seigneurs, les églises disparues, les clubs et les foires, autour de la vie de chacun et de chaque commune. Les données sont livrées avec l’app ; seules les images des églises viennent d’Internet.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’une personne (bloc « 🎡 Le monde de son village »), sur la fiche d’un village et dans la monographie de commune. Les listes sont dans Listes.'))}</p>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Lignes'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Fabriqué le'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
                <p class="muted">${esc(T('Les rapprochements (une étape du Tour dans sa commune, un seigneur de son village, une foire à moins de 15 km, un anniversaire un jour célèbre) sont faits par l’app d’après ses lieux et ses dates : ce sont des pistes.'))}</p></div></section>`;
    }
    if (root.document) document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-l8c-tg]'); if (!t || !e.target.matches('input')) return;
        const s = settings(), k = t.dataset.l8cTg, was = s[k];
        s[k] = e.target.checked; saveSettings(s);
        A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }});
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'epoque_travail'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire_autour'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK[0])) { let i = B.findIndex(b => b[0] === 'epoque_travail'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire_autour'); if (i < 0) i = B.findIndex(b => b[0] === 'world'); B.splice(i < 0 ? B.length : i + 1, 0, [...BLOCK]); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK[0]] ||= '12';
        return !!tabs;
    }
    if (!register() && root.document) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.lot8MondeVillage = {...core, load, settings, personInto, placeInto, placePart, lifeOf, worshipPlaces, lordsOf, ownersByInsee,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
