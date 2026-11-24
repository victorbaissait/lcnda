/* LCNDA — 🌟 Wikidata « Autour de sa vie » (données livrées dans l'app : assets/data/wikidata/, fabriquées par
 * scripts/wikidata/build-wikidata.py ; Wikidata, CC0 1.0). Tout se lit SANS Internet ; seuls les liens ↗ ouvrent le web.
 *  · bloc de fiche « 🌟 Autour de sa vie » : célèbres nés au même endroit (± 50 ans), nés le même jour, homonymes célèbres
 *    (« simple homonyme » : même nom, pas forcément de la famille), grands événements à moins de N km pendant sa vie,
 *    la chanson à la mode l'année de sa naissance — chaque ligne avec « ↗ Wikidata » (et « ↗ Wikipédia » s'il y a une page) ;
 *  · ext.wikidataOldName(texte) → Promise<[{qid, now, old, kind, from, to, lat, lon, url}]> : reconnaît un ancien nom de lieu
 *    (« Lemberg » → Lviv) ; une petite ligne d'aide sous les champs « Lieu » quand on en tape un ;
 *  · Réglages → 🌟 Wikidata : l'interrupteur (allumé au départ), ce qu'on montre, la distance, « À propos des données ».
 * Réglage : localStorage['genealogie-wikidata-autour'] = {on, place, day, names, events, song, km, hint}. */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const KEY = 'genealogie-wikidata-autour';
    const TAB = ['wikidata_autour', '25o', '🌟 Wikidata'], BLOCK = ['wikidata_autour', '🌟 Autour de sa vie'];
    const DIR = 'assets/data/wikidata/', V = '1';
    const DEF = {on: true, place: true, day: true, names: true, events: true, song: true, km: 30, hint: true};
    const settings = () => { try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return {...DEF, ...(s && typeof s === 'object' ? s : {})}; } catch (_) { return {...DEF}; } };
    const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const isOn = () => settings().on;

    /* ═════════ les fichiers (gzip, décompressés ici) ═════════ */
    const files = new Map();
    function load(name) {
        if (files.has(name)) return files.get(name);
        const pr = fetch(`${DIR}${name}?v=${V}`, {credentials: 'same-origin'}).then(async r => {
            if (!r.ok) { if (r.status === 404) return null; throw new Error(i18n('Données Wikidata illisibles.')); }
            const buf = new Uint8Array(await r.arrayBuffer());
            if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
            if (typeof DecompressionStream === 'undefined') throw new Error(i18n('Ce navigateur ne sait pas ouvrir les données Wikidata.'));
            return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
        }).catch(e => { files.delete(name); throw e; });
        files.set(name, pr);
        return pr;
    }

    /* ═════════ petits outils ═════════ */
    const fold = s => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`-]/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    const R = Math.PI / 180;
    const km = (a, b, c, d) => { const x = Math.sin((c - a) * R / 2) ** 2 + Math.cos(a * R) * Math.cos(c * R) * Math.sin((d - b) * R / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); };
    const yearOf = d => { const m = /^(\d{1,4})/.exec(String(d || '')); return m ? Number(m[1]) : null; };
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dateFr = d => { const m = /^(\d{1,4})(?:-(\d\d))?(?:-(\d\d))?$/.exec(String(d || '')); if (!m) return ''; const [, y, mo, da] = m;
        return da ? `${Number(da) === 1 ? '1er' : Number(da)} ${i18n(MONTHS[mo - 1])} ${y}` : mo ? `${i18n(MONTHS[mo - 1])} ${y}` : y; };
    const span = (b, d) => { const y1 = yearOf(b), y2 = yearOf(d); return y1 && y2 ? `${y1}–${y2}` : y1 ? String(y1) : ''; };
    const wdUrl = q => `https://www.wikidata.org/wiki/Q${Number(q)}`;
    const wpUrl = (q, fl) => (fl & 1 ? `https://www.wikidata.org/wiki/Special:GoToLinkedPage/frwiki/Q${Number(q)}` : fl & 2 ? `https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/Q${Number(q)}` : '');
    const links = (q, fl) => `<span class="wda-links"><a href="${wdUrl(q)}" target="_blank" rel="noopener noreferrer" title="${esc(i18n('La fiche sur wikidata.org (internet)'))}">↗ Wikidata</a>${wpUrl(q, fl) ? ` <a href="${wpUrl(q, fl)}" target="_blank" rel="noopener noreferrer" title="${esc(i18n(fl & 1 ? 'L’article sur Wikipédia (internet)' : 'L’article sur Wikipédia en anglais (internet)'))}">↗ Wikipédia</a>` : ''}</span>`;
    const tileOf = (lat, lon, size) => `${Math.floor(lat / size) * size}_${Math.floor(lon / size) * size}`;
    /** les carreaux (clé « lat_lon ») qui touchent un cercle de r km autour d'un point */
    function tilesAround(lat, lon, r, size, known) {
        const dLat = r / 111, dLon = r / (111 * Math.max(0.15, Math.cos(lat * R))), out = new Set();
        for (let a = Math.floor((lat - dLat) / size) * size; a <= lat + dLat; a += size)
            for (let b = Math.floor((lon - dLon) / size) * size; b <= lon + dLon; b += size) { const k = `${a}_${b}`; if (!known || known[k]) out.add(k); }
        return [...out];
    }

    /* ═════════ ce que la fiche dit de la personne ═════════ */
    const BIRTH = ['BIRT', 'BAPM', 'CHR'], DEATH = ['DEAT', 'BURI', 'CREM'];
    function lifeOf(detail) {
        const p = detail?.person || {}, evs = (detail?.events || []).filter(e => !e.family_id || e.person_id);
        const pick = tags => { for (const t of tags) { const e = evs.find(x => x.gedcom_tag === t && (x.year || x.sort_date || x.date_text)); if (e) return e; } return null; };
        const b = pick(BIRTH), d = pick(DEATH);
        const yr = e => (e ? Number(e.year) || yearOf(e.sort_date) || yearOf((String(e.date_text || '').match(/\b(\d{3,4})\b/) || [])[1]) : null);
        const ymd = e => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(e?.sort_date || '')); return m && m[2] !== '00' && m[3] !== '00' ? `${m[1]}-${m[2]}-${m[3]}` : ''; };
        const ll = e => (e && Number.isFinite(Number(e.latitude)) && Number.isFinite(Number(e.longitude)) && (e.latitude !== null && e.latitude !== '') ? {lat: Number(e.latitude), lon: Number(e.longitude), name: e.place_name || ''} : null);
        const places = []; const seen = new Set();
        for (const e of evs) { const x = ll(e); if (!x) continue; const k = `${x.lat.toFixed(3)},${x.lon.toFixed(3)}`; if (seen.has(k)) continue; seen.add(k); places.push(x); }
        const by = yr(b), dy = yr(d);
        const now = new Date().getFullYear();
        return {by, dy, end: dy || (by ? Math.min(now, by + 90) : null), ymd: b?.gedcom_tag === 'BIRT' ? ymd(b) : '', bplace: b?.gedcom_tag === 'BIRT' ? ll(b) || (b.place_name ? {name: b.place_name} : null) : null,
            places, surname: String(p.last_name || '').trim(), first: String(p.first_name || '').trim(), gender: p.gender};
    }

    /* ═════════ les cinq recherches ═════════ */
    async function samePlace(life) {
        const bp = life.bplace; if (!bp || !Number.isFinite(bp.lat) || !life.by) return [];
        const idx = await load('people-index.json.gz'); if (!idx) return null;
        const keys = tilesAround(bp.lat, bp.lon, 5, idx.size, idx.tiles);
        const name = fold(bp.name);
        const out = [];
        for (const k of keys) {
            const t = await load(`people/${k}.json.gz`); if (!t) continue;
            for (const r of t.p) {
                const pl = t.pl[r[4]]; if (!pl) continue;
                const y = yearOf(r[2]); if (!y || Math.abs(y - life.by) > 50) continue;
                const lab = fold(pl[2]);
                const near = km(bp.lat, bp.lon, pl[0], pl[1]);
                const sameName = name && (lab === name || (lab.endsWith(' ' + name) && /arrondissement|quartier/.test(lab)));
                if (near <= 2 || (sameName && near <= 15)) out.push({q: r[0], name: r[1], b: r[2], d: r[3], occ: r[6], fl: r[7], sl: r[8], place: pl[2]});
            }
        }
        return out.sort((a, b) => b.sl - a.sl);
    }
    async function sameDay(life) {
        if (!life.ymd) return [];
        const f = await load(`days/${life.ymd.slice(5, 7)}.json.gz`); if (!f) return null;
        const rows = f.d[life.ymd.slice(5, 10)] || [];
        const same = rows.filter(r => r[2] === life.ymd), other = rows.filter(r => r[2] !== life.ymd);
        return [...same.map(r => ({q: r[0], name: r[1], b: r[2], place: r[3], fl: r[5], sl: r[6], exact: true})), ...other.slice(0, 6).map(r => ({q: r[0], name: r[1], b: r[2], place: r[3], fl: r[5], sl: r[6], exact: false}))];
    }
    async function namesakes(life) {
        const k = fold(life.surname); if (k.length < 2) return [];
        const f = await load('surnames.json.gz'); if (!f) return null;
        return (f.s[k] || []).map(r => ({q: r[0], name: r[1], b: r[2], d: r[3], place: r[4], fl: r[5], sl: r[6]}));
    }
    async function eventsNear(life, radius) {
        if (!life.places.length || !life.by) return [];
        const idx = await load('events-index.json.gz'); if (!idx) return null;
        const keys = new Set(); life.places.forEach(p => tilesAround(p.lat, p.lon, radius, idx.size, idx.tiles).forEach(k => keys.add(k)));
        const out = new Map();
        for (const k of keys) {
            const t = await load(`events/${k}.json.gz`); if (!t) continue;
            for (const r of t.e) {
                const y = yearOf(r[3]); if (!y || y < life.by || y > life.end) continue;
                let best = null;
                for (const p of life.places) { const dk = km(p.lat, p.lon, r[5], r[6]); if (dk <= radius && (!best || dk < best.km)) best = {km: dk, near: p.name}; }
                if (best && !out.has(r[0])) out.set(r[0], {q: r[0], name: r[1], kind: r[2], date: r[3], end: r[4], fl: r[7], sl: r[8], km: best.km, near: best.near, age: y - life.by});
            }
        }
        return [...out.values()].sort((a, b) => b.sl - a.sl).slice(0, 15).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    }
    async function songOf(life) {
        if (!life.by) return [];
        const f = await load('songs.json.gz'); if (!f) return null;
        return (f.y[String(life.by)] || []).map(r => ({q: r[0], title: r[1], perf: r[2], fr: !!r[3], fl: r[4], sl: r[5]}));
    }

    /* ═════════ le bloc « 🌟 Autour de sa vie » ═════════ */
    (function css() {
        if (document.getElementById('wda-css')) return;
        const st = document.createElement('style'); st.id = 'wda-css';
        st.textContent = `.wda{display:grid;gap:12px}.wda h4{margin:0 0 4px;font-size:.95em}.wda ul{margin:0;padding:0;list-style:none;display:grid;gap:3px}
.wda li{display:flex;flex-wrap:wrap;gap:2px 8px;align-items:baseline}.wda li small{opacity:.75}.wda-links{font-size:.85em;white-space:nowrap}.wda-links a{text-decoration:none}
.wda-tag{font-size:.78em;padding:0 6px;border-radius:8px;background:color-mix(in srgb,currentColor 10%,transparent)}.wda-src{font-size:.8em;opacity:.7;margin-top:4px}
.wda-more{font-size:.85em}.wda-lead{margin:0 0 4px}.wda-fold>summary{cursor:pointer;font-size:.9em;margin:4px 0}.wda-fold[open]>summary{margin-bottom:8px}.wdo-hint{font-size:.85em;margin-top:4px;padding:4px 8px;border-radius:6px;background:color-mix(in srgb,#e3b23c 18%,transparent)}.wdo-hint a{text-decoration:none}
.wda-set .card{margin-bottom:12px}.wda-set .wda-line{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:6px 0}`;
        (document.head || document.documentElement).appendChild(st);
    })();

    function register() {
        const app = A(); if (!app.defaultMaintenanceTabs) return false;
        if (!app.defaultMaintenanceTabs.some(t => t[0] === TAB[0])) app.defaultMaintenanceTabs.push(TAB);
        const blocks = app.defaultPersonBlocks;
        if (Array.isArray(blocks)) {
            const i = blocks.findIndex(b => b[0] === BLOCK[0]);
            if (isOn() && i < 0) blocks.push(BLOCK);
            if (!isOn() && i >= 0) blocks.splice(i, 1);
        }
        if (app.defaultPersonBlockSpans && !app.defaultPersonBlockSpans[BLOCK[0]]) app.defaultPersonBlockSpans[BLOCK[0]] = '12';
        return true;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register);

    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK[0]] = (index, detail) => {
        const p = detail?.person;
        if (!isOn() || !p?.id || p.kind === 'animal') return '';
        const more = `<button type="button" class="icon-button small" data-wda-more title="${esc(i18n('Plus d’actions'))}" aria-label="${esc(i18n('Plus d’actions'))}">⋯</button>`;
        return A().card(index, BLOCK[1], '', `<div class="wda-host" data-wda-person="${Number(p.id)}">${UI().skeleton ? UI().skeleton(3) : ''}</div>`, 'span-12', more);
    };
    const lastDetail = new Map();
    const li = (main, sub, q, fl, tag = '') => `<li><span>${main}</span>${tag ? `<span class="wda-tag">${esc(tag)}</span>` : ''}${sub ? `<small>${esc(sub)}</small>` : ''}${links(q, fl)}</li>`;
    const KIND = {battle: '⚔️ bataille', disaster: '🌋 catastrophe', epidemic: '🦠 épidémie', fire: '🔥 incendie', flood: '🌊 inondation', treaty: '📜 traité'};
    const LIMIT = 8;
    function list(rows, render, key) {
        const shown = rows.slice(0, LIMIT).map(render).join(''), rest = rows.slice(LIMIT).map(render).join('');
        return `<ul>${shown}</ul>${rest ? `<details class="wda-more"><summary>${esc(i18n('Voir les {n} autres', {n: String(rows.length - LIMIT)}))}</summary><ul data-wda-rest="${key}">${rest}</ul></details>` : ''}`;
    }
    async function occLabel(q) { if (!q) return ''; try { const f = await load('occupations.json.gz'); return f?.o?.[q] || ''; } catch (_) { return ''; } }

    /** Le contenu du bloc, pour une fiche (detail = {person, events}) : une phrase d'abord, le reste replié (« ▸ plus »).
     *  Rend '' quand il n'y a rien (le bloc se cache alors). Réutilisé par LCNDA_EXT.dataSources (run). */
    async function render(detail, s = settings()) {
        const life = lifeOf(detail);
        const tasks = await Promise.all([
            s.song ? songOf(life).catch(() => null) : [],
            s.place ? samePlace(life).catch(() => null) : [],
            s.day ? sameDay(life).catch(() => null) : [],
            s.names ? namesakes(life).catch(() => null) : [],
            s.events ? eventsNear(life, Number(s.km) || 30).catch(() => null) : [],
        ]);
        const [songs, place, day, names, events] = tasks;
        const parts = [], first = [];
        if (songs?.length) {
            const x = songs[0];
            first.push(`🎶 ${esc(i18n('L’année de sa naissance ({y})', {y: String(life.by)}))} : « ${esc(x.title)} », ${esc(x.perf)} ${links(x.q, x.fl)}`);
            if (songs.length > 1) parts.push(`<section><h4>🎶 ${esc(i18n('Autres chansons de {y}', {y: String(life.by)}))}</h4><ul>${songs.slice(1, 4).map(y => li(`« ${esc(y.title)} », ${esc(y.perf)}`, y.fr ? '' : i18n('succès dans le monde'), y.q, y.fl)).join('')}</ul></section>`);
        }
        const count = [];
        if (place?.length) {
            const occ = await Promise.all(place.map(r => occLabel(r.occ)));
            count.push(`📍 ${esc(i18n(place.length === 1 ? '1 célébrité née au même endroit' : '{n} célébrités nées au même endroit', {n: String(place.length)}))}`);
            parts.push(`<section><h4>📍 ${esc(i18n('Célèbres nés au même endroit (à 50 ans près)'))}</h4>${list(place.map((r, i) => ({...r, o: occ[i]})), r => li(`<b>${esc(r.name)}</b> <small>${esc(span(r.b, r.d))}</small>`, [r.o, r.place].filter(Boolean).join(' · '), r.q, r.fl), 'place')}</section>`);
        }
        if (day?.length) {
            const ex = day.filter(r => r.exact), other = day.filter(r => !r.exact);
            if (ex.length) count.push(`🎂 ${esc(i18n(life.gender === 'female' ? 'née le même jour que {n}' : 'né le même jour que {n}', {n: ex[0].name}))}`);
            if (ex.length) parts.push(`<section><h4>🎂 ${esc(i18n('Nés le même jour ({d})', {d: dateFr(life.ymd)}))}</h4>${list(ex, r => li(`<b>${esc(r.name)}</b>`, r.place, r.q, r.fl), 'day')}</section>`);
            if (other.length) parts.push(`<section><h4>🎂 ${esc(i18n('Nés un {d}, une autre année', {d: dateFr(life.ymd).replace(/ \d+$/, '')}))}</h4><ul>${other.map(r => li(`<b>${esc(r.name)}</b> <small>${esc(String(yearOf(r.b)))}</small>`, r.place, r.q, r.fl)).join('')}</ul></section>`);
        }
        if (names?.length) {
            count.push(`👥 ${esc(i18n(names.length === 1 ? '1 homonyme célèbre' : '{n} homonymes célèbres', {n: String(names.length)}))}`);
            parts.push(`<section><h4>👥 ${esc(i18n('Célèbres du même nom : {n}', {n: life.surname}))}</h4>${list(names, r => li(`<b>${esc(r.name)}</b> <small>${esc(span(r.b, r.d))}</small>`, r.place ? i18n('né(e) à {p}', {p: r.place}) : '', r.q, r.fl, i18n('simple homonyme')), 'names')}
                <p class="wda-src">${esc(i18n('Même nom de famille seulement : ce n’est pas une preuve de parenté.'))}</p></section>`);
        }
        if (events?.length) {
            count.push(`🗺 ${esc(i18n(events.length === 1 ? '1 grand événement près de ses lieux de vie' : '{n} grands événements près de ses lieux de vie', {n: String(events.length)}))}`);
            parts.push(`<section><h4>🗺 ${esc(i18n('Pendant sa vie, à moins de {k} km', {k: String(Number(s.km) || 30)}))}</h4>${list(events, r => li(`<b>${esc(r.name)}</b> <small>${esc(dateFr(r.date))}${r.end && yearOf(r.end) !== yearOf(r.date) ? `–${esc(String(yearOf(r.end)))}` : ''}</small>`,
                [i18n('à {k} km de {p}', {k: String(Math.round(r.km)), p: r.near || '?'}), r.age >= 0 ? i18n('à {n} ans', {n: String(r.age)}) : ''].filter(Boolean).join(' · '), r.q, r.fl, i18n(KIND[r.kind] || r.kind)), 'events')}</section>`);
        }
        if (!first.length && !count.length) return '';
        const lead = [...first, count.join(' · ')].filter(Boolean).map(t => `<p class="wda-lead">${t}</p>`).join('');
        const src = `<p class="wda-src">${esc(i18n('Source : Wikidata (CC0, domaine public), livré avec l’app. Les liens ↗ ouvrent la page en ligne.'))}</p>`;
        return lead + (parts.length ? `<details class="wda-fold"><summary>${esc(i18n('▸ plus'))}</summary><div class="wda">${parts.join('')}</div></details>` : '') + src;
    }
    async function fill(host) {
        const pid = Number(host.dataset.wdaPerson), detail = lastDetail.get(pid);
        if (!detail) return;
        const html = await render(detail);
        if (!host.isConnected) return;
        const card = host.closest('.card');
        if (!html) { host.innerHTML = ''; if (card) card.hidden = true; return; } // rien à dire : pas de bloc vide
        if (card) card.hidden = false;
        host.innerHTML = html;
    }
    (ext.afterPerson = ext.afterPerson || []).push(detail => {
        if (!isOn()) return;
        const pid = Number(detail?.person?.id) || 0; if (!pid) return;
        lastDetail.set(pid, detail);
        document.querySelectorAll('#workspace [data-wda-person]').forEach(h => { if (Number(h.dataset.wdaPerson) === pid) fill(h); });
    });
    function openSettings() { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }
    document.addEventListener('click', e => {
        const more = e.target.closest?.('[data-wda-more]');
        if (more) { UI().menuAt?.(more, [{icon: '⚙️', label: i18n('Réglages de « Autour de sa vie »'), run: openSettings}, {icon: '📚', label: i18n('À propos des données'), run: openAbout}]); }
    });

    /* ═════════ les anciens noms de lieux ═════════ */
    let oldIdx = null;
    async function oldNames() {
        if (oldIdx) return oldIdx;
        const f = await load('oldnames.json.gz');
        oldIdx = f?.n || {};
        return oldIdx;
    }
    /** « Lemberg » → [{qid: 'Q36036', now: 'Lviv', old: 'Lemberg', kind: 'o', from: '1773', to: '1918', lat, lon, url}] (vide si rien) */
    ext.wikidataOldName = async text => {
        const k = fold(String(text || '').split(',')[0]); if (k.length < 3) return [];
        let idx; try { idx = await oldNames(); } catch (_) { return []; }
        return (idx[k] || []).map(r => ({qid: `Q${r[0]}`, now: r[1], old: r[2], kind: r[3], from: r[4], to: r[5], lat: r[6], lon: r[7], url: wdUrl(r[0])}));
    };
    const KIND_OLD = {o: 'ancien nom officiel', n: 'surnom', s: 'nom court'};
    const oldLine = (m, typed) => {
        const when = m.from && m.to ? `${yearOf(m.from)}–${yearOf(m.to)}` : m.to ? i18n('jusqu’en {y}', {y: String(yearOf(m.to))}) : m.from ? i18n('depuis {y}', {y: String(yearOf(m.from))}) : '';
        return `🌟 ${esc(i18n('« {t} » : {k} de {p}', {t: typed, k: i18n(KIND_OLD[m.kind] || KIND_OLD.o), p: m.now}))}${when ? ` (${esc(when)})` : ''} <a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">↗ Wikidata</a>`;
    };
    let hintTimer = 0;
    document.addEventListener('input', e => {
        const t = e.target;
        if (!t?.matches?.('input')) return;
        const inPicker = t.matches('.pk-input') && t.closest('[data-picker="place"]');
        if (!inPicker && !t.matches('input[name="place_name"], input[name="place_text"], #place-form input[name="name"]')) return;
        if (!isOn() || !settings().hint) return;
        clearTimeout(hintTimer);
        hintTimer = setTimeout(async () => {
            const anchor = t.closest('[data-place-picker]') || t.closest('.pk') || t;
            let box = anchor.parentElement?.querySelector(':scope > .wdo-hint');
            const val = t.value.trim();
            const found = val.length >= 3 ? await ext.wikidataOldName(val) : [];
            if (!found.length) { if (box) box.remove(); return; }
            if (!box) { box = document.createElement('div'); box.className = 'wdo-hint'; box.setAttribute('role', 'note'); anchor.insertAdjacentElement('afterend', box); }
            box.innerHTML = found.slice(0, 3).map(m => `<div>${oldLine(m, val.split(',')[0].trim())}</div>`).join('');
        }, 350);
    }, true);

    /* ═════════ Réglages → 🌟 Wikidata ═════════ */
    async function about() {
        const [p, e, o, s] = await Promise.all(['people-index.json.gz', 'events-index.json.gz', 'oldnames.json.gz', 'songs.json.gz'].map(n => load(n).catch(() => null)));
        return {people: p?.count || 0, sl: p?.sitelinks_min || null, events: e ? Object.values(e.kinds || {}).reduce((a, b) => a + b, 0) : 0, kinds: e?.kinds || {},
            old: o ? Object.values(o.n || {}).reduce((a, b) => a + b.length, 0) : 0, songs: s ? Object.values(s.y || {}).reduce((a, b) => a + b.length, 0) : 0,
            built: p?.built || '', ok: !!p, credit: p?.credit || '', licence: p?.licence || 'CC0 1.0', licence_url: p?.licence_url || 'https://creativecommons.org/publicdomain/zero/1.0/'};
    }
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    function aboutHtml(a) {
        if (!a.ok) return `<p>${esc(i18n('Les données Wikidata ne sont pas dans cette version de l’app.'))}</p>`;
        return `<ul class="wda-about"><li>${esc(i18n('{n} personnes célèbres (Europe, Amériques, monde de langue française), avec leur naissance et leur lieu', {n: nf(a.people)}))}</li>
            <li>${esc(i18n('{n} événements datés et placés (batailles, catastrophes, épidémies, incendies, inondations, traités)', {n: nf(a.events)}))}</li>
            <li>${esc(i18n('{n} anciens noms de lieux', {n: nf(a.old)}))}</li><li>${esc(i18n('{n} chansons, par année', {n: nf(a.songs)}))}</li></ul>
            <p>${esc(i18n('Personnes retenues : celles qui ont au moins {a} pages Wikipédia (pays de langue française) ou {b} (autres pays).', {a: String(a.sl?.['langue française'] ?? 3), b: String(a.sl?.autres ?? 6)}))}</p>
            <p>${esc(i18n('Source : Wikidata, la base libre de la fondation Wikimedia. Données extraites le {d}.', {d: a.built || '?'}))} ${esc(i18n('Licence'))} <a href="${esc(a.licence_url)}" target="_blank" rel="noopener noreferrer">${esc(a.licence)} ↗</a> (${esc(i18n('domaine public'))}). <a href="https://www.wikidata.org" target="_blank" rel="noopener noreferrer">wikidata.org ↗</a></p>
            <p class="wda-src">${esc(i18n('Wikidata peut se tromper ou être incomplet : chaque ligne a son lien ↗ pour vérifier.'))}</p>`;
    }
    async function openAbout() { const a = await about(); ext.openDialog?.({eyebrow: '🌟 WIKIDATA', title: i18n('À propos des données'), body: aboutHtml(a)}); }

    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = async token => {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const a = await about();
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const draw = () => {
            const s = settings(), K = UI().toggleHtml || ((l, o) => `<label class="ui-toggle"><input type="checkbox" ${o.attrs} ${o.checked ? 'checked' : ''}><i></i>${esc(l)}</label>`);
            const tg = (k, label, sub = '') => `<div>${K(i18n(label), {checked: !!s[k], attrs: `data-wda-tg="${k}"`, sub: sub ? i18n(sub) : ''})}</div>`;
            const kmOpts = [10, 30, 50, 100].map(n => `<option value="${n}"${Number(s.km) === n ? ' selected' : ''}>${n} km</option>`).join('');
            ws.innerHTML = `<section class="page wda-set">${UI().pageHeader ? UI().pageHeader({title: 'Wikidata', icon: '🌟', where: 'Réglages · Données', help: 'Les personnes célèbres, les événements et les anciens noms de lieux de Wikidata, livrés avec l’app : sans Internet.'}) : `<h2>🌟 Wikidata</h2>`}
                <section class="card"><h3>${esc(i18n('Montrer'))}</h3>
                    ${tg('on', '🌟 Wikidata', 'Allumé : le bloc « 🌟 Autour de sa vie » sur les fiches et l’aide pour les anciens noms de lieux.')}
                    <div ${s.on ? '' : 'hidden'}>
                    ${tg('song', '🎶 La chanson à la mode l’année de sa naissance')}
                    ${tg('place', '📍 Célèbres nés au même endroit')}
                    ${tg('day', '🎂 Nés le même jour')}
                    ${tg('names', '👥 Célèbres du même nom (simple homonyme)')}
                    ${tg('events', '🗺 Grands événements près de ses lieux, pendant sa vie')}
                    <div class="wda-line"><span>${esc(i18n('Jusqu’à quelle distance'))}</span><select data-wda-km>${kmOpts}</select></div>
                    ${tg('hint', '🏷 Reconnaître les anciens noms de lieux', 'Quand tu tapes « Lemberg » dans un lieu : « ancien nom officiel de Lviv ».')}
                    </div>
                </section>
                <section class="card"><h3>${esc(i18n('À propos des données'))}</h3>${aboutHtml(a)}</section></section>`;
        };
        draw();
        if (ws.__wdaBound !== true) {
            ws.__wdaBound = true;
            const change = (patch, msg) => {
                const before = settings(), after = {...before, ...patch};
                save(after); register(); if (ws.querySelector('.wda-set')) draw();
                A().undoToast ? A().undoToast(msg, {undo: () => { save(before); register(); if (ws.querySelector('.wda-set')) draw(); }, redo: () => { save(after); register(); if (ws.querySelector('.wda-set')) draw(); }}) : A().toast?.(msg);
            };
            ws.addEventListener('change', e => {
                if (!ws.querySelector('.wda-set')) return;
                const t = e.target.closest?.('[data-wda-tg]');
                if (t) { const k = t.dataset.wdaTg; return change({[k]: !!t.checked}, k === 'on' ? (t.checked ? i18n('🌟 Wikidata allumé : le bloc « Autour de sa vie » apparaît sur les fiches.') : i18n('🌟 Wikidata éteint.')) : i18n('Réglage enregistré')); }
                const sel = e.target.closest?.('[data-wda-km]');
                if (sel) change({km: Number(sel.value) || 30}, i18n('Distance : {k} km', {k: sel.value}));
            });
        }
    };

    /* ═════════ « à la demande » : le registre commun des données (une future page « 🧰 Données ») ═════════ */
    const asDetail = async person => {
        if (person && typeof person === 'object' && person.person) return person;
        const id = Number(typeof person === 'object' ? person?.id : person); if (!id || !A().api) return null;
        return A().api('person', {id});
    };
    const nothing = (host, t) => { host.innerHTML = A().empty ? A().empty(t, {icon: '🌟'}) : `<p class="muted">${esc(t)}</p>`; };
    const DS = ext.dataSources = ext.dataSources || [];
    const ds = d => { if (!DS.some(x => x.id === d.id)) DS.push(d); };
    ds({id: 'wikidata_autour', icon: '🌟', label: 'Autour de sa vie (Wikidata)', group: 'La personne', needs: ['person'], installed: () => true,
        run: async (ctx, host) => { const d = await asDetail(ctx?.person); const html = d ? await render(d, {...settings(), song: true, place: true, day: true, names: true, events: true}) : '';
            if (!html) return nothing(host, i18n('Rien de connu sur Wikidata autour de sa vie (même lieu, même jour, même nom, événements proches).'));
            host.innerHTML = `<div class="wda-host">${html.replace('<details class="wda-fold">', '<details class="wda-fold" open>')}</div>`; }});
    ds({id: 'wikidata_chanson', icon: '🎶', label: 'La chanson à la mode cette année-là (Wikidata)', group: 'Le monde', needs: ['year'], installed: () => true,
        run: async (ctx, host) => { const y = Number(ctx?.year) || 0; const rows = y ? await songOf({by: y}) : [];
            if (!rows?.length) return nothing(host, i18n('Pas de chanson connue pour {y}.', {y: String(y || '?')}));
            host.innerHTML = `<div class="wda"><section><h4>🎶 ${esc(String(y))}</h4><ul>${rows.map(r => li(`« ${esc(r.title)} », ${esc(r.perf)}`, r.fr ? '' : i18n('succès dans le monde'), r.q, r.fl)).join('')}</ul></section></div>`; }});
    ds({id: 'wikidata_ancien_nom', icon: '🏷', label: 'Ancien nom d’un lieu (Wikidata)', group: 'Le lieu', needs: ['place'], installed: () => true,
        run: async (ctx, host) => { const name = typeof ctx?.place === 'object' ? (ctx.place?.name || '') : String(ctx?.place || ''); const found = await ext.wikidataOldName(name);
            if (!found.length) return nothing(host, i18n('« {t} » n’est pas un ancien nom connu.', {t: name}));
            host.innerHTML = found.map(m => `<p class="wdo-hint">${oldLine(m, name)}</p>`).join(''); }});
    ds({id: 'wikidata_evenements', icon: '🗺', label: 'Grands événements autour d’un lieu (Wikidata)', group: 'Le lieu', needs: ['place', 'year'], installed: () => true,
        run: async (ctx, host) => { const pl = ctx?.place || {}; const y = Number(ctx?.year) || 0, lat = Number(pl.latitude ?? pl.lat), lon = Number(pl.longitude ?? pl.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lon) || !y) return nothing(host, i18n('Choisis un lieu placé sur la carte et une année.'));
            const rows = await eventsNear({by: y - 10, end: y + 10, places: [{lat, lon, name: pl.name || ''}]}, Number(settings().km) || 30) || [];
            if (!rows.length) return nothing(host, i18n('Aucun grand événement connu à moins de {k} km, 10 ans autour de {y}.', {k: String(Number(settings().km) || 30), y: String(y)}));
            host.innerHTML = `<div class="wda"><ul>${rows.map(r => li(`<b>${esc(r.name)}</b> <small>${esc(dateFr(r.date))}</small>`, i18n('à {k} km', {k: String(Math.round(r.km))}), r.q, r.fl, i18n(KIND[r.kind] || r.kind))).join('')}</ul></div>`; }});

    ext.wikidataAutour = {render, settings, save, isOn, register, load, lifeOf, samePlace, sameDay, namesakes, eventsNear, songOf, fold, km, openSettings, openAbout};
})();
