/**
 * 🗺 Pays à l'époque et 🌍 les pays en chiffres.
 * Données livrées (assets/data/, refaites par scripts/monde/build-contexte.py) :
 *  - monde-frontieres.json.gz : les frontières des pays de 1886 à 2019 (CShapes 2.0) et de l'Europe de 1816 à 1885
 *    (CShapes-Europe), ETH Zürich — CC BY-NC-SA 4.0 ;
 *  - monde-chiffres.json : par pays (frontières d'aujourd'hui) et par année, espérance de vie, mortalité infantile,
 *    taille des hommes, années d'école, population (Clio-Infra) et PIB par habitant (Maddison Project Database 2023).
 * Ce que ça montre :
 *  - fiche, bloc « 🗺 Pays à l'époque » : pour chaque lieu (avec coordonnées) et chaque date, le pays de l'époque
 *    (« Strasbourg, 1892 → Empire allemand · aujourd'hui : France »), puis « En Italie en 1890 : espérance de vie 39 ans… » ;
 *  - Carte : « 🗺 Frontières de » + l'année (crochets ext.mapSetup / ext.mapDraw ; suit l'année de la frise en mode « Dans le temps ») ;
 *  - Listes → Histoire → « 🌍 Les pays de ta famille en chiffres ».
 * Tout se calcule dans le navigateur (lecture seule, rien n'est écrit en base).
 *   window.LCNDA_EXT.mondeContexte = {load, loadStats, lookup, today, statsAt, …}   (Node : module.exports, mêmes fonctions)
 * Essai : tests/test-monde-contexte.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const FIRST_EUROPE = 1816, FIRST_WORLD = 1886, LAST = 2019, TODAY = 20191231;
    /** prépare le fichier des frontières : les arcs sont décodés à la demande */
    function prepare(raw) {
        const B = {raw, q: raw.q, arcs: new Array(raw.arcs.length), rings: new Map(), ents: raw.e.map(([gw, f, t, s, o, g]) => ({gw, f, t, s, o, g}))};
        return B;
    }
    function arc(B, i) {
        const k = i < 0 ? ~i : i;
        let a = B.arcs[k];
        if (!a) {
            const d = B.raw.arcs[k], out = new Float64Array(d.length);
            let x = 0, y = 0;
            for (let j = 0; j < d.length; j += 2) { x += d[j]; y += d[j + 1]; out[j] = x * B.q; out[j + 1] = y * B.q; }
            a = B.arcs[k] = out;
        }
        return a;
    }
    /** les anneaux d'une forme : [[Float64Array lon,lat,lon,lat…, trous…], …] */
    function rings(B, g) {
        let r = B.rings.get(g);
        if (r) return r;
        r = B.raw.geoms[g].map(poly => poly.map(ring => {
            const pts = [];
            ring.forEach((i, n) => {
                const a = arc(B, i), len = a.length / 2;
                for (let j = 0; j < len; j++) {
                    if (n && j === 0) continue;
                    const jj = i < 0 ? len - 1 - j : j; pts.push(a[2 * jj], a[2 * jj + 1]);
                }
            });
            return Float64Array.from(pts);
        }));
        B.rings.set(g, r);
        return r;
    }
    function inRing(x, y, p) {
        let c = false;
        for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
            const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi) c = !c;
        }
        return c;
    }
    function inGeom(B, g, lon, lat) {
        const b = B.raw.box[g], q = B.q;
        if (lon < b[0] * q || lon > b[2] * q || lat < b[1] * q || lat > b[3] * q) return false;
        return rings(B, g).some(poly => inRing(lon, lat, poly[0]) && !poly.slice(1).some(h => inRing(lon, lat, h)));
    }
    /** la distance (en km, à peu près) du point au bord de la forme : près d'une frontière, le tracé simplifié peut se tromper */
    function edgeKm(B, g, lon, lat) {
        let best = Infinity; const k = Math.cos(lat * Math.PI / 180);
        rings(B, g).forEach(poly => poly.forEach(p => {
            for (let i = 0; i + 3 < p.length; i += 2) {
                const ax = (p[i] - lon) * k, ay = p[i + 1] - lat, bx = (p[i + 2] - lon) * k, by = p[i + 3] - lat;
                const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
                const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
                const ex = ax + t * dx, ey = ay + t * dy, d = ex * ex + ey * ey;
                if (d < best) best = d;
            }
        }));
        return Math.sqrt(best) * 111.2;
    }
    /** AAAAMMJJ d'un événement : la date triable si elle est complète, sinon le milieu de l'année */
    function dateNum(year, sortDate) {
        const m = String(sortDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m && Number(m[2]) >= 1 && Number(m[3]) >= 1) return Number(m[1] + m[2] + m[3]);
        const y = Number(year); return y ? y * 10000 + 701 : 0;
    }
    function nameAt(B, gw, d) {
        const per = B.raw.np[gw];
        if (per) { const hit = per.find(([a, b]) => d >= a && d < b); if (hit) return hit[2]; return per[per.length - 1][2]; }
        return B.raw.n[gw] || String(gw);
    }
    const STATUS = {c: 'colonie de {o}', p: 'protectorat de {o}', o: 'occupé par {o}', m: 'sous mandat de {o}', l: 'territoire loué par {o}'};
    /** le pays de ce lieu à cette date : {gw, name, label, status, owner, ownerName, near} ou null (pas de carte : avant 1816, hors d'Europe avant 1886, après 2019) */
    function lookup(B, lat, lon, d) {
        lat = Number(lat); lon = Number(lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !d) return null;
        const y = Math.floor(d / 10000);
        if (y < FIRST_EUROPE || y > LAST) return null;
        const live = B.ents.filter(e => d >= e.f && d <= e.t);
        const hits = live.filter(e => inGeom(B, e.g, lon, lat));
        let e, coast = false;
        if (hits.length) {
            const area = x => { const b = B.raw.box[x.g]; return (b[2] - b[0]) * (b[3] - b[1]); };
            e = hits.sort((x, y2) => area(x) - area(y2))[0]; // une enclave avant le pays qui l'entoure
        } else { // au bord de la mer : le tracé simplifié peut laisser le lieu dans l'eau ; le pays le plus proche (moins de 10 km)
            const pad = 0.15 / B.q;
            let best = Infinity;
            for (const x of live) {
                const b = B.raw.box[x.g], X = lon / B.q, Y = lat / B.q;
                if (X < b[0] - pad || X > b[2] + pad || Y < b[1] - pad || Y > b[3] + pad) continue;
                const k = edgeKm(B, x.g, lon, lat); if (k < best) { best = k; e = x; }
            }
            if (!e || best > 10) return null;
            coast = true;
        }
        const name = nameAt(B, e.gw, d), ownerName = e.s && e.o ? nameAt(B, e.o, d) : '';
        const label = e.s ? (ownerName ? `${name} (${T(STATUS[e.s] || '{o}', {o: ownerName})})` : name) : name;
        return {gw: e.gw, name, label, status: e.s, owner: e.o, ownerName, iso: B.raw.iso[e.gw] || 0, near: coast || edgeKm(B, e.g, lon, lat) < 5, coast, from: e.f, to: e.t};
    }
    /** le pays d'aujourd'hui (la carte de 2019) */
    const today = (B, lat, lon) => lookup(B, lat, lon, TODAY);
    /** une forme (pour la carte) : les pays à cette date, avec leur boîte et leur point d'étiquette */
    function entsAt(B, d) { return B.ents.filter(e => d >= e.f && d <= e.t); }

    /* ─────────── les chiffres ─────────── */
    const STAT_ORDER = ['le', 'im', 'ht', 'ed', 'gdp', 'pop'];
    const GAP = {le: 5, im: 10, ht: 10, ed: 10, gdp: 5, pop: 10};
    /** la valeur la plus proche de l'année (dans l'écart permis), sinon null */
    function statAt(C, iso, key, year) {
        const s = C.c[String(iso)]?.[key]; if (!s || !year) return null;
        let best = null;
        for (const [y, v] of s) { const d = Math.abs(y - year); if (d <= GAP[key] && (!best || d < Math.abs(best.y - year))) best = {y, v}; }
        return best;
    }
    const nf = (v, d = 0) => Number(v).toLocaleString('fr-FR', {maximumFractionDigits: d, minimumFractionDigits: d});
    function statText(key, v) {
        switch (key) {
            case 'le': return T('espérance de vie {v} ans', {v: nf(v)});
            case 'im': return T('{v} bébés sur 1 000 mouraient avant 1 an', {v: nf(v)});
            case 'ht': return T('taille des hommes {v} cm', {v: nf(v)});
            case 'ed': return v < 2 ? T('{v} année d’école en moyenne', {v: nf(v, 1)}) : T('{v} années d’école en moyenne', {v: nf(v, 1)});
            case 'gdp': return T('richesse par habitant {v} $ de 2011', {v: nf(v)});
            case 'pop': return v >= 1000 ? T('{v} millions d’habitants', {v: nf(v / 1000, v >= 10000 ? 0 : 1)}) : T('{v} 000 habitants', {v: nf(v)});
            default: return String(v);
        }
    }
    /** les chiffres d'un pays une année : [{key, y, v, text}] */
    function statsAt(C, iso, year) {
        return STAT_ORDER.map(k => { const s = statAt(C, iso, k, year); return s ? {key: k, y: s.y, v: s.v, text: statText(k, s.v)} : null; }).filter(Boolean);
    }
    /** « en Italie », « au Portugal », « aux Pays-Bas » */
    const MASC_E = new Set(['Mexique', 'Cambodge', 'Mozambique', 'Zimbabwe', 'Belize', 'Suriname']);
    function inCountry(name) {
        const n = String(name || '');
        if (/^(États|Pays-Bas|Philippines|Émirats|Comores|Seychelles|Maldives|Bahamas|Îles|Fidji|Samoa)/.test(n)) return 'aux ' + n;
        if (/^[AEIOUYÉÈÊÂÎÔaeiouyéèêâîô]/.test(n)) return 'en ' + n;
        return (/e$/.test(n) && !MASC_E.has(n) ? 'en ' : 'au ') + n;
    }
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
    /** un pays d'après le nom écrit dans le lieu (« Italie », « Italy »…) : code ISO ou 0 */
    function isoByName(C, name) {
        const f = fold(name); if (!f) return 0;
        for (const [iso, c] of Object.entries(C.c)) if (fold(c.n) === f) return Number(iso);
        return ({'italy': 380, 'germany': 276, 'allemagne': 276, 'spain': 724, 'belgium': 56, 'switzerland': 756, 'poland': 616, 'england': 826, 'united kingdom': 826, 'angleterre': 826,
            'netherlands': 528, 'hollande': 528, 'portugal': 620, 'algerie': 12, 'algeria': 12, 'usa': 840, 'united states': 840, 'etats unis': 840, 'canada': 124, 'luxembourg': 442, 'austria': 40, 'russia': 643})[f] || 0;
    }

    const core = {FIRST_EUROPE, FIRST_WORLD, LAST, TODAY, prepare, rings, inGeom, lookup, today, entsAt, nameAt, dateNum, edgeKm, statAt, statsAt, statText, isoByName, inCountry, STAT_ORDER};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP;
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    ext.personBlocks = ext.personBlocks || {};
    ext.lists = ext.lists || {};
    for (const k of ['mapSetup', 'mapDraw']) ext[k] = ext[k] || [];
    const esc = v => (A()?.escapeHtml ? A().escapeHtml(v ?? '') : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const S = () => A().state;
    const DATA_V = 1;
    const PREF = 'genealogie-monde-contexte';
    const pref = () => { try { return {layer: false, year: 1900, ...(JSON.parse(localStorage.getItem(PREF) || '{}') || {})}; } catch (_) { return {layer: false, year: 1900}; } };
    const setPref = p => { try { localStorage.setItem(PREF, JSON.stringify({...pref(), ...p})); } catch (_) {} };
    const spinner = t => (UI().spinner ? UI().spinner(t) : `<p class="muted">${esc(t)}</p>`);
    const ensureCss = () => {
        if (document.getElementById('mc-css')) return;
        const st = document.createElement('style'); st.id = 'mc-css';
        st.textContent = `.mc-block h4{margin:.6em 0 .3em}.mc-rows{list-style:none;margin:0;padding:0}.mc-rows li{padding:.25em 0;border-bottom:1px solid var(--line,rgba(127,127,127,.18))}
.mc-rows li:last-child{border-bottom:0}.mc-rows .mc-then{font-weight:600}.mc-rows .is-changed .mc-then{color:var(--accent,#9a4b00)}.mc-stats li{margin:.2em 0}.mc-src{display:block;margin-top:.5em}
.mc-layer{position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden}.mc-layer svg{position:absolute;inset:0;width:100%;height:100%}
.mc-layer path{stroke:#5a3d1e;stroke-width:1.2;stroke-linejoin:round;fill-opacity:.16}.mc-layer text{font:600 12px system-ui,sans-serif;fill:#3a2810;paint-order:stroke;stroke:#fff;stroke-width:3px;text-anchor:middle}
.mc-ctl{display:inline-flex;align-items:center;gap:.4em}.mc-ctl input[type=number]{width:5.5em}.mc-table{width:100%;border-collapse:collapse}.mc-table th,.mc-table td{padding:.3em .5em;text-align:right;border-bottom:1px solid var(--line,rgba(127,127,127,.18))}
.mc-table th:first-child,.mc-table td:first-child{text-align:left}.mc-country{margin:1em 0}.mc-country h3{margin:.2em 0}`;
        document.head.appendChild(st);
    };

    /* ─────────── chargement (une fois) ─────────── */
    let borders = null, stats = null, bordersData = null;
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf)); // déjà décompressé en route
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir le fichier des frontières.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    /* un téléchargement coupé (page rechargée, application arrêtée, réseau perdu) : « réessaie », pas « Failed to fetch » */
    const cutOff = e => e?.name === 'AbortError' || e?.network === true || (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || '')));
    const errText = e => (cutOff(e) ? T('Pas de connexion avec LCNDA : rien n’est perdu, réessaie.') : e.message);
    function load() {
        if (!borders) borders = fetch(`assets/data/monde-frontieres.json.gz?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (!r.ok) throw new Error(T('Le fichier des frontières est introuvable.')); return readMaybeGz(r); }).then(prepare).then(B => (bordersData = B))
            .catch(e => { borders = null; throw e; });
        return borders;
    }
    function loadStats() {
        if (!stats) stats = fetch(`assets/data/monde-chiffres.json?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (!r.ok) throw new Error(T('Le fichier des chiffres des pays est introuvable.')); return r.json(); })
            .catch(e => { stats = null; throw e; });
        return stats;
    }

    /* ─────────── 🗺 la fiche ─────────── */
    const details = new Map();
    ext.personBlocks.monde_contexte = (index, detail) => {
        const pid = Number(detail.person?.id) || 0;
        if (!pid || detail.person?.kind === 'animal') return '';
        details.set(pid, detail);
        return A().card(index, T('🗺 Pays à l’époque'), '', `<div class="mc-block" data-mc-host="${pid}">${spinner(T('On cherche les frontières de l’époque…'))}</div>`, 'span-12');
    };
    const evPlace = e => {
        const lat = e.precise_lat != null && e.precise_lat !== '' ? e.precise_lat : e.latitude, lon = e.precise_lon != null && e.precise_lon !== '' ? e.precise_lon : e.longitude;
        return lat != null && lat !== '' && lon != null && lon !== '' && !(Number(lat) === 0 && Number(lon) === 0) ? {lat: Number(lat), lon: Number(lon)} : null;
    };
    const srcList = C => `<details class="mc-src"><summary><small>${esc(T('Sources des chiffres'))}</small></summary><ul>${STAT_ORDER.filter(k => C.sources[k]).map(k => { const s = C.sources[k]; return `<li><small><b>${esc(s.label)}</b> (${esc(s.unit)}) : ${esc(s.src)} ${esc(s.via ? '— ' + s.via : '')} · ${T('licence')} ${esc(s.licence)} · <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(T('voir la source'))} ↗</a></small></li>`; }).join('')}</ul>
        <p><small>${esc(C.note)}</small></p></details>`;
    function bordersCredit(B) {
        return `<small class="mc-src muted">${esc(T('Frontières : {a}', {a: B.raw.attr}))} ${esc(T('Licence'))} <a href="${esc(B.raw.licence_url)}" target="_blank" rel="noopener noreferrer">${esc(B.raw.licence)} ↗</a> · <a href="${esc(B.raw.url)}" target="_blank" rel="noopener noreferrer">CShapes ↗</a></small>`;
    }
    /** ce que montre le bloc : les lignes « pays à l'époque » et les pays de sa vie */
    function personRows(B, C, detail) {
        const rows = [], seen = new Set(), countries = new Map();
        const evs = (detail.events || []).slice().sort((a, b) => (Number(a.year) || 99999) - (Number(b.year) || 99999));
        for (const e of evs) {
            const y = Number(e.year) || 0; if (!y) continue;
            const pl = evPlace(e), d = dateNum(y, e.sort_date);
            let iso = 0, now = null;
            if (pl) { now = today(B, pl.lat, pl.lon); iso = now?.iso || 0; }
            if (!iso && e.country) iso = isoByName(C, e.country);
            if (iso) { const c = countries.get(iso) || {iso, years: []}; c.years.push(y); countries.set(iso, c); }
            if (!pl) continue;
            const then = lookup(B, pl.lat, pl.lon, d);
            const key = `${e.place_name || ''}|${then ? then.label : '-' + y}`;
            if (seen.has(key)) continue; seen.add(key);
            rows.push({place: e.place_name || T('Lieu sans nom'), type: e.type_label || '', year: y, then, now, changed: !!(then && now && then.name !== now.name)});
        }
        return {rows, countries: [...countries.values()]};
    }
    function rowHtml(r) {
        const what = `<b>${esc(r.place)}</b> <span class="muted">(${esc([r.type, r.year].filter(Boolean).join(', '))})</span>`;
        if (!r.then) return `<li>${what} — <span class="muted">${esc(r.year < FIRST_EUROPE ? T('trop tôt : les cartes commencent en 1816 (Europe) et 1886 (monde)') : r.year < FIRST_WORLD ? T('pas de carte de cet endroit avant 1886') : T('pas de carte pour cette date'))}</span></li>`;
        return `<li class="${r.changed ? 'is-changed' : ''}">${what} → ${esc(T('à cette date, ce lieu était dans :'))} <span class="mc-then">${esc(r.then.label)}</span>
            ${r.now ? (r.changed ? ` <span class="muted">· ${esc(T('aujourd’hui : {x}', {x: r.now.name}))}</span>` : ` <span class="muted">${esc(T('(comme aujourd’hui)'))}</span>`) : ''}
            ${r.then.near ? ` <small class="muted" title="${esc(T('Les tracés sont simplifiés : tout près d’une frontière, vérifie sur une carte de l’époque.'))}">⚠️ ${esc(T('près d’une frontière'))}</small>` : ''}</li>`;
    }
    function statLines(C, c) {
        const ys = [...new Set(c.years)].sort((a, b) => a - b), out = [];
        const pick = [ys[0]]; if (ys[ys.length - 1] - ys[0] >= 25) pick.push(ys[ys.length - 1]);
        const name = C.c[String(c.iso)]?.n || '';
        for (const y of pick) {
            const st = statsAt(C, c.iso, y); if (!st.length) continue;
            out.push(`<li>${esc(T('{enPays} en {y} : {liste}.', {enPays: (x => x.charAt(0).toUpperCase() + x.slice(1))(inCountry(name)), y: String(y), liste: st.map(s => s.text + (s.y !== y ? ` (${s.y})` : '')).join(' · ')}))}</li>`);
        }
        return out.join('');
    }
    async function fill(host) {
        const pid = Number(host.dataset.mcHost), detail = details.get(pid);
        if (!detail) { host.innerHTML = ''; return; }
        let B, C;
        try { [B, C] = await Promise.all([load(), loadStats()]); } catch (e) { if (cutOff(e)) { host.innerHTML = ''; return; } host.innerHTML = A().empty ? A().empty(e.message, {icon: '⛔'}) : esc(e.message); return; }
        if (!host.isConnected) return;
        const {rows, countries} = personRows(B, C, detail);
        const stat = countries.map(c => statLines(C, c)).join('');
        if (!rows.length && !stat) { host.innerHTML = A().empty ? A().empty(T('Ajoute des lieux (avec leur position sur la carte) et des dates : l’app dira dans quel pays ils étaient à l’époque.'), {icon: '🗺'}) : ''; return; }
        const changed = rows.filter(r => r.changed).length;
        host.innerHTML = `${rows.length ? `<p class="muted">${esc(changed ? (changed > 1 ? T('{n} lieux de sa vie étaient dans un autre pays qu’aujourd’hui.', {n: String(changed)}) : T('Un lieu de sa vie était dans un autre pays qu’aujourd’hui.')) : T('Les lieux de sa vie, avec le pays de l’époque.'))}</p>
            <ul class="mc-rows">${rows.map(rowHtml).join('')}</ul>${bordersCredit(B)}` : ''}
            ${stat ? `<h4>${esc(T('🌍 Le pays en chiffres'))}</h4><ul class="mc-stats">${stat}</ul>
            <p><small class="muted">${esc(T('Pays dans leurs frontières d’aujourd’hui ; entre parenthèses, l’année du chiffre quand il n’y en a pas pour l’année exacte.'))}</small></p>${srcList(C)}
            <button type="button" class="table-link" data-mc-list>${esc(T('Voir les pays de toute la famille en chiffres →'))}</button>` : ''}`;
    }
    const scan = () => document.querySelectorAll('[data-mc-host]:not([data-mc-done])').forEach(h => { h.dataset.mcDone = '1'; ensureCss(); fill(h); });
    // ⏱ seulement quand un hôte arrive (avant : toute la page relue à chaque changement, ≈ 0,3 à 1,2 s sur une fiche)
    const HOST = '[data-mc-host]';
    new MutationObserver(recs => { for (const r of recs) for (const n of r.addedNodes) if (n.nodeType === 1 && (n.matches(HOST) || n.querySelector(HOST))) { scan(); return; } }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 🌍 Listes → Histoire → « Les pays de ta famille en chiffres » ─────────── */
    const LIST = 'pays_chiffres';
    async function familyCountries(B, C) {
        const d = await A().api('map', {tag: 'all', limit: 20000});
        const by = new Map();
        for (const p of d.points || []) {
            const y = Number(p.year) || 0, lat = Number(p.latitude), lon = Number(p.longitude);
            let iso = 0;
            if (Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0)) iso = today(B, lat, lon)?.iso || 0;
            if (!iso && p.country) iso = isoByName(C, p.country);
            if (!iso || !C.c[String(iso)]) continue;
            const c = by.get(iso) || {iso, n: C.c[String(iso)].n, people: new Set(), events: 0, y0: 0, y1: 0};
            c.events++; if (p.person_id) c.people.add(Number(p.person_id));
            if (y) { c.y0 = c.y0 ? Math.min(c.y0, y) : y; c.y1 = Math.max(c.y1, y); }
            by.set(iso, c);
        }
        return [...by.values()].sort((a, b) => b.people.size - a.people.size || b.events - a.events);
    }
    function countryTable(C, c) {
        const from = c.y0 ? Math.max(1700, Math.floor(c.y0 / 25) * 25) : 1850, to = c.y1 ? Math.min(2020, Math.ceil(c.y1 / 25) * 25) : 1950;
        const ys = []; for (let y = from; y <= to; y += 25) ys.push(y);
        const keys = STAT_ORDER.filter(k => ys.some(y => statAt(C, c.iso, k, y)));
        if (!keys.length) return `<p class="muted">${esc(T('Pas de chiffres pour ce pays dans les sources.'))}</p>`;
        const short = {le: T('Espérance de vie'), im: T('Mortalité infantile (‰)'), ht: T('Taille des hommes'), ed: T('Années d’école'), gdp: T('Richesse par habitant ($ de 2011)'), pop: T('Population')};
        const cell = (k, y) => { const s = statAt(C, c.iso, k, y); if (!s) return '<td class="muted">—</td>'; const v = k === 'le' ? `${nf(s.v)} ${T('ans')}` : k === 'ht' ? `${nf(s.v)} cm` : k === 'ed' ? nf(s.v, 1) : k === 'pop' ? (s.v >= 1000 ? `${nf(s.v / 1000, s.v >= 10000 ? 0 : 1)} M` : `${nf(s.v)} 000`) : nf(s.v); return `<td${s.y !== y ? ` title="${esc(T('chiffre de {y}', {y: String(s.y)}))}"` : ''}>${esc(v)}${s.y !== y ? '*' : ''}</td>`; };
        return `<div class="table-scroll"><table class="mc-table"><thead><tr><th>${esc(T('Année'))}</th>${keys.map(k => `<th>${esc(short[k])}</th>`).join('')}</tr></thead>
            <tbody>${ys.map(y => `<tr><td>${y}</td>${keys.map(k => cell(k, y)).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    ext.lists[LIST] = async token => {
        ensureCss();
        const ws = A().$('#workspace');
        ws.innerHTML = `<section class="page collection-page">${UI().pageHeader ? UI().pageHeader({title: T('🌍 Les pays de ta famille en chiffres'), help: T('Pour chaque pays où vivait ta famille (d’après les lieux placés sur la carte), la vie de l’époque en chiffres : espérance de vie, bébés morts avant 1 an, taille des hommes, années d’école, richesse par habitant, population. Pays dans leurs frontières d’aujourd’hui.')}) : ''}${spinner(T('On rassemble les pays de ta famille…'))}</section>`;
        let B, C, list;
        try { [B, C] = await Promise.all([load(), loadStats()]); list = await familyCountries(B, C); } catch (e) { ws.innerHTML = A().emptyState({icon: cutOff(e) ? '🔌' : '⛔', text: errText(e)}); return; }
        if (token !== S().workspaceToken || S().module !== 'listes') return;
        const head = UI().pageHeader ? UI().pageHeader({title: T('🌍 Les pays de ta famille en chiffres'), help: T('Pour chaque pays où vivait ta famille (d’après les lieux placés sur la carte), la vie de l’époque en chiffres : espérance de vie, bébés morts avant 1 an, taille des hommes, années d’école, richesse par habitant, population. Pays dans leurs frontières d’aujourd’hui.')}) : '';
        ws.innerHTML = `<section class="page collection-page mc-page">${head}
            ${list.length ? list.map(c => `<article class="mc-country" data-mc-country="${c.iso}"><h3>${esc(c.n)}</h3>
                <p class="muted">${esc(T('{p} · {e}{y}', {p: A().plural(c.people.size, T('personne')), e: A().plural(c.events, T('événement')), y: c.y0 ? ` · ${c.y0 === c.y1 ? c.y0 : `${c.y0}–${c.y1}`}` : ''}))}</p>
                ${countryTable(C, c)}</article>`).join('') : A().emptyState({icon: '🌍', text: T('Aucun lieu de ta famille n’est encore placé sur la carte'), hint: T('Donne une position aux lieux (Listes → Lieux) : l’app saura dans quel pays ils sont.')})}
            <p><small class="muted">${esc(T('* chiffre d’une année proche (survole-le pour voir laquelle). Un tiret : pas de chiffre dans les sources.'))}</small></p>
            <section class="maintenance-panel"><h3>${esc(T('D’où viennent ces chiffres ?'))}</h3>${srcList(C)}${bordersCredit(B)}</section></section>`;
    };

    /* ─────────── 🗺 la Carte : « Frontières de l'année » ─────────── */
    let mapLast = null;
    const COLORS = ['#e6a157', '#7fb3d5', '#a9cf8f', '#d7a1c9', '#f2d16b', '#9fd3c7', '#e8998d', '#b6a3e0', '#c9b38a', '#8fc0a9'];
    const layerYear = () => (S().mapMode === 'timeline' && Number(S().mapTimelineYear) ? Number(S().mapTimelineYear) : Number(pref().year) || 1900);
    ext.mapSetup.push(() => {
        const strip = document.querySelector('.map-layout .tool-strip'), stage = document.getElementById('map-stage');
        if (!strip || !stage) return;
        ensureCss();
        const layer = document.createElement('div'); layer.id = 'mc-layer'; layer.className = 'mc-layer'; layer.innerHTML = '<svg aria-hidden="true"></svg>';
        stage.insertBefore(layer, document.getElementById('map-overlay') || null);
        const p = pref(), ctl = document.createElement('span'); ctl.className = 'mc-ctl';
        ctl.innerHTML = `<label class="ui-toggle" title="${esc(T('Les frontières des pays telles qu’elles étaient cette année-là (Europe dès 1816, le monde dès 1886)'))}"><input type="checkbox" data-mc-layer ${p.layer ? 'checked' : ''}><i></i>${esc(T('🗺 Frontières de'))}</label>
            <input type="number" data-mc-year min="${FIRST_EUROPE}" max="${LAST}" step="1" value="${esc(String(p.year))}" aria-label="${esc(T('Année des frontières'))}" ${S().mapMode === 'timeline' ? `title="${esc(T('En mode « Dans le temps », les frontières suivent l’année de la frise'))}"` : ''}>`;
        strip.insertBefore(ctl, strip.querySelector('.spacer'));
        ctl.querySelector('[data-mc-layer]').addEventListener('change', e => { setPref({layer: e.target.checked}); A().drawMap?.(); });
        ctl.querySelector('[data-mc-year]').addEventListener('change', e => { const y = Math.max(FIRST_EUROPE, Math.min(LAST, Math.round(Number(e.target.value)) || 1900)); e.target.value = y; setPref({year: y}); A().drawMap?.(); });
    });
    ext.mapDraw.push(({left, top, z, width, height}) => {
        mapLast = {left, top, z, width, height};
        const layer = document.getElementById('mc-layer'); if (!layer) return;
        const svg = layer.querySelector('svg');
        if (!pref().layer) { svg.innerHTML = ''; return; }
        if (!bordersData) {
            if (!layer.dataset.loading) { layer.dataset.loading = '1'; load().then(() => { layer.dataset.loading = ''; A().drawMap?.(); }).catch(e => { layer.dataset.loading = ''; A().toast?.(errText(e), 'error'); }); }
            return;
        }
        const B = bordersData, y = layerYear(), d = y * 10000 + 701;
        const yEl = document.querySelector('[data-mc-year]'); if (yEl && S().mapMode === 'timeline') yEl.value = y;
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        const lngToX = A().lngToX, latToY = A().latToY, q = B.q;
        const parts = [], labels = [];
        for (const e of entsAt(B, d)) {
            const b = B.raw.box[e.g];
            const x0 = lngToX(b[0] * q, z) - left, x1 = lngToX(b[2] * q, z) - left, y0 = latToY(b[3] * q, z) - top, y1 = latToY(b[1] * q, z) - top;
            if (x1 < 0 || x0 > width || y1 < 0 || y0 > height) continue;
            let path = '';
            for (const poly of rings(B, e.g)) for (const r of poly) {
                let lx = NaN, ly = NaN, seg = '';
                for (let i = 0; i < r.length; i += 2) {
                    const px = lngToX(r[i], z) - left, py = latToY(r[i + 1], z) - top;
                    if (seg && Math.abs(px - lx) < 1 && Math.abs(py - ly) < 1 && i + 2 < r.length) continue;
                    seg += `${seg ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`; lx = px; ly = py;
                }
                path += seg + 'Z';
            }
            const name = nameAt(B, e.gw, d);
            parts.push(`<path d="${path}" fill="${COLORS[e.gw % COLORS.length]}" fill-rule="evenodd"><title>${esc(name)}</title></path>`);
            if (x1 - x0 > 60 && y1 - y0 > 24) { const l = B.raw.lab[e.g]; labels.push(`<text x="${(lngToX(l[0] * q, z) - left).toFixed(0)}" y="${(latToY(l[1] * q, z) - top).toFixed(0)}">${esc(name)}</text>`); }
        }
        svg.innerHTML = `${parts.join('')}${labels.join('')}<text x="${width - 10}" y="${height - 10}" style="text-anchor:end;font-size:11px">${esc(T('Frontières de {y} — CShapes (ETH Zürich), CC BY-NC-SA 4.0', {y: String(y)}))}</text>`;
    });

    document.addEventListener('click', e => {
        if (e.target.closest?.('[data-mc-list]')) { e.preventDefault(); S().listType = LIST; A().setModule('listes'); }
    });
    const boot = () => {
        const Bk = A()?.defaultPersonBlocks; if (Array.isArray(Bk) && !Bk.some(b => b[0] === 'monde_contexte')) { let i = Bk.findIndex(b => b[0] === 'world'); if (i < 0) i = Bk.findIndex(b => b[0] === 'bio'); Bk.splice(i < 0 ? Bk.length : i + 1, 0, ['monde_contexte', '🗺 Pays à l’époque']); }
        const Ls = A()?.defaultListTypes; if (Array.isArray(Ls) && !Ls.some(x => x[0] === LIST)) { const i = Ls.findIndex(x => x[0] === 'historical_context'); Ls.splice(i < 0 ? Ls.length : i, 0, [LIST, '34d', '🌍 Les pays de ta famille en chiffres']); }
    };
    boot(); document.addEventListener('DOMContentLoaded', boot, {once: true});
    ext.mondeContexte = {...core, load: () => load(), loadStats: () => loadStats(), personRows};
})(typeof window !== 'undefined' ? window : globalThis);
