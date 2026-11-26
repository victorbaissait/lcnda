/**
 * LCNDA — 🧭 Mémoire et vieux papiers (lot D « téléchargements ») : où le soldat repose, les camps de 1939-1945 près de chez lui,
 * les jeux de son pays, la musique de l'année du mariage, les almanachs de son année, les photos de l'émigration, l'article de
 * Wikipédia et les textes de Wikisource de sa commune, et le vocabulaire latin des registres (Wiktionnaire).
 * Livré avec l'app (assets/data/td-*.json.gz, refaits par scripts/telech-d/*.py et .github/workflows/telech-d.yml, lus à la demande) :
 *   ⚱️ td-necropoles  nécropoles nationales et cimetières de guerre (Wikidata CC0) + lien MémorialGenWeb (data.gouv, CC BY-SA)
 *   🕯 td-camps       camps d'internement et de transit 1939-1946, maisons d'enfants cachés (Wikidata CC0) — des lieux, aucun nom
 *   🎲 td-jeux        jeux traditionnels et régionaux (Wikipédia CC BY-SA 4.0 : première phrase citée ; Wikidata CC0)
 *   📜 td-latin       vocabulaire latin des actes paroissiaux (Wiktionnaire, CC BY-SA 4.0) → aussi dans « 📖 Aide à la lecture »
 *   📅 td-almanachs   almanachs et annuaires anciens par année : liens Internet Archive (droits de chaque volume) + recherches Gallica
 * Déjà dans l'app et RÉUTILISÉ : 🎶 les 78 tours d'Internet Archive (l9a-sons, « 🔊 Sons et enfance ») — ici pour l'année du MARIAGE ;
 *   🎖️ les fiches « Morts pour la France » (Réglages → 🎖️ Bases officielles : bo_person) pour le lieu de décès.
 * En ligne, à la demande, gardé (lib/telech_d.php ; jamais pour une fiche vivante ou confidentielle ; aucun nom de personne envoyé) :
 *   📷 photos libres de la Bibliothèque du Congrès (avant 1925), 📖 l'article entier de Wikipédia de la commune, 📚 Wikisource.
 * 🌐 Traduction hors ligne : assets/js/heritage-telech-d-traduire.js.
 * Où : fiche d'une personne, bloc « 🧭 Mémoire et vieux papiers » (une phrase par sujet, le détail sous « ▸ plus ») ; fiche d'un
 *   village et Monographie de commune ; Listes (LCNDA_EXT.dataLists) ; Cartes (mapLayerSources) ; à la demande (dataSources) ;
 *   « Où chercher » ; Réglages → « 🧭 Mémoire et vieux papiers » (chaque sujet s'éteint ↶, À propos des données).
 * localStorage : « genealogie-telech-d ».   window.LCNDA_EXT.telechD = {core…, load, personInto, placeInto}
 * Essai : tests/test-telech-d.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const table = f => (f.rows || []).map(r => (Array.isArray(r) ? Object.fromEntries((f.fields || []).map((k, i) => [k, r[i] ?? null])) : r));
    function km(a, b, c, d) { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); }
    const okLL = p => num(p?.lat) !== null && num(p?.lon) !== null && !(Number(p.lat) === 0 && Number(p.lon) === 0);
    function lifeSpan(life) {
        const ys = (life?.events || []).map(e => num(e.year)).filter(y => y !== null);
        const b = num(life?.person?.birth), d = num(life?.person?.death);
        return {birth: b, death: d, from: b ?? (ys.length ? Math.min(...ys) : null), to: d ?? (ys.length ? Math.max(...ys) : null)};
    }
    const evOf = (life, tags) => (life?.events || []).find(e => tags.includes(String(e.tag || '').toUpperCase()));
    /** ses lieux placés : naissance, décès, puis les autres (3 au plus) */
    function homePlaces(life, max = 3) {
        const pls = (life?.places || []).filter(okLL), ev = life?.events || [];
        const byTag = tags => { const e = ev.find(x => tags.includes(String(x.tag || '').toUpperCase()) && x.place_id); return e && pls.find(p => p.id === e.place_id); };
        const out = [];
        for (const p of [byTag(['BIRT', 'BAPM', 'CHR']), byTag(['DEAT', 'BURI']), ...pls]) if (p && !out.includes(p)) out.push(p);
        return out.slice(0, max);
    }
    /** tous les lieux placés de sa vie, avec l'année de l'événement (pour « près de chez lui en 1942 ») */
    const placedEvents = life => (life?.events || []).filter(okLL).map(e => ({lat: Number(e.lat), lon: Number(e.lon), year: num(e.year), name: e.place || '', tag: String(e.tag || '').toUpperCase()}));
    /** ⚱️ un soldat mort à la guerre ? (homme mort de 1914 à 1921 ou de 1939 à 1946, ou « mort pour la France » écrit sur sa fiche) */
    function warDead(life) {
        const P = life?.person || {}, d = num(P.death) ?? num(evOf(life, ['DEAT', 'BURI'])?.year);
        if (P.gender === 'female' || P.kind === 'animal') return null;
        const mpf = /mort pour la france|\bmpf\b|tue a l ennemi|disparu au combat|mort au combat|mort en captivite/.test(fold(`${life?.text || ''} ${(life?.events || []).map(e => `${e.title || ''} ${e.description || ''} ${e.cause || ''}`).join(' ')}`));
        const war = d !== null && ((d >= 1914 && d <= 1921) || (d >= 1939 && d <= 1946) || (d >= 1870 && d <= 1871));
        if (!mpf && !war) return null;
        const b = num(P.birth);
        if (!mpf && b !== null && (d - b < 17 || d - b > 52)) return null; // trop jeune ou trop âgé pour être soldat : rien
        return {year: d, mpf, war: d >= 1939 ? '1939-1945' : d >= 1914 ? '1914-1918' : '1870-1871'};
    }
    /** les lieux d'une liste à moins de radius km d'un point, les plus proches d'abord */
    function near(rows, lat, lon, radius, max = 50) {
        const out = [];
        for (const r of rows) { if (num(r.lat) === null) continue; const k = km(lat, lon, r.lat, r.lon); if (k <= radius) out.push({r, km: k}); }
        return out.sort((a, b) => a.km - b.km).slice(0, max);
    }
    /** ⚱️ les nécropoles où il peut reposer : celle de sa commune de sépulture (BURI) s'il y en a une, sinon autour du lieu de décès */
    function gravesFor(rows, life, mpfPlace = null, radius = 25) {
        const buri = (life?.events || []).find(e => String(e.tag).toUpperCase() === 'BURI' && okLL(e));
        const deat = (life?.events || []).find(e => String(e.tag).toUpperCase() === 'DEAT' && okLL(e));
        const pt = buri || deat || (mpfPlace && okLL(mpfPlace) ? mpfPlace : null);
        if (!pt) return null;
        const list = near(rows, Number(pt.lat), Number(pt.lon), buri ? 3 : radius, 12);
        return list.length ? {at: pt, buried: !!buri && list[0].km <= 3, list} : null;
    }
    /** 🕯 les camps et maisons d'enfants ouverts près d'un de ses lieux pendant qu'il y vivait (années 1939-1946) */
    function campsFor(rows, life, radius = 25) {
        const {birth, death} = lifeSpan(life);
        if (birth !== null && birth > 1946) return [];
        if (death !== null && death < 1939) return [];
        if (birth === null && death === null) return [];
        const evs = placedEvents(life), out = new Map();
        for (const r of rows) {
            const from = r.from ?? 1939, to = r.to ?? 1946;
            if (to < 1939 || from > 1946) continue;
            for (const e of evs) {
                const k = km(e.lat, e.lon, r.lat, r.lon); if (k > radius) continue;
                const cur = out.get(r.q); if (!cur || k < cur.km) out.set(r.q, {r, km: k, place: e.name});
            }
        }
        return [...out.values()].sort((a, b) => a.km - b.km);
    }
    /** 🎲 les jeux traditionnels de son pays (autour de son lieu de naissance) */
    function gamesFor(rows, home, radius = 90) { return home ? near(rows.filter(r => num(r.lat) !== null), home.lat, home.lon, radius, 12) : []; }
    /** 💍 l'année de son (premier) mariage */
    function weddingYear(life) { const ys = (life?.events || []).filter(e => /^(MARR|MARB|MARC|ENGA)$/.test(String(e.tag || '').toUpperCase()) && num(e.year) !== null).map(e => num(e.year)); return ys.length ? Math.min(...ys) : null; }
    /** 🎶 les enregistrements (78 tours, cylindres) d'une année, ± 1 an */
    function recordsOfYear(rows, y) { if (y === null) return []; const at = d => rows.filter(r => num(r.y) === y + d); return [...at(0), ...at(-1), ...at(1)].slice(0, 12); }
    /** 📅 les almanachs d'une année : pour chaque série, le volume de l'année (ou à 1 an près) */
    function almanacsOf(rows, y) {
        if (y === null) return [];
        const best = new Map();
        for (const r of rows) { const d = Math.abs(num(r.y) - y); if (d > 1) continue; const cur = best.get(r.s); if (!cur || d < Math.abs(cur.y - y)) best.set(r.s, r); }
        return [...best.values()];
    }
    const gallicaSearch = (q, y) => `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=${encodeURIComponent(`(dc.title all "${q}") and (gallicapublication_date>="${y}" and gallicapublication_date<="${y}")`)}`;
    /** 🚢 parti en Amérique ? (un événement aux États-Unis, au Canada…) → {country, year, place} */
    const AMERICA = /united states|etats unis|usa|amerique|new york|canada|quebec|argentin|bresil|brasil|chili|uruguay|mexique/;
    function emigration(life) {
        const e = (life?.events || []).find(x => AMERICA.test(fold(`${x.country || ''} ${x.place_full || x.place || ''}`)));
        return e ? {country: e.country || '', year: num(e.year), place: e.place || ''} : null;
    }
    /** 📜 les mots du Wiktionnaire → l'aide à la lecture (même forme que les fichiers de langue) */
    const KIND_OF = {mot: 'mot', mois: 'mois', nombre: 'nombre', metier: 'metier', parente: 'parente'};
    function latinEntries(rows) { return rows.map(r => ({t: r.t, d: r.d, k: KIND_OF[r.k] || 'mot', a: r.a || 'general', lang: 'la', ex: r.pos ? `${r.pos}${r.of ? ` — ${r.of}` : ''}` : '', alt: [], src: 'Wiktionnaire', url: r.url})); }

    const core = {num, fold, table, km, lifeSpan, homePlaces, placedEvents, warDead, near, gravesFor, campsFor, gamesFor, weddingYear, recordsOfYear, almanacsOf, gallicaSearch, emigration, latinEntries};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const post = (a, b) => api(a, {}, {method: 'POST', body: b}).then(r => r?.result || r);
    const DATA_V = 1;
    const KEY = 'genealogie-telech-d';
    const TAB = ['telech_d', '25td', '🧭 Mémoire et vieux papiers'];
    const BLOCK = 'telech_d';
    const PARTS = [
        ['sepultures', '⚱️ Où le soldat repose', 'Pour un soldat mort à la guerre : les nécropoles nationales et cimetières de guerre près du lieu de sa mort, et la liste des soldats qui y reposent (MémorialGenWeb).'],
        ['camps', '🕯 Camps et maisons d’enfants 1939-1945', 'Les camps d’internement et de transit, et les maisons où des enfants ont été cachés, près de chez lui pendant la guerre (Wikidata).'],
        ['jeux', '🎲 Les jeux de son pays', 'Quilles, boules, palets, pelote… les jeux traditionnels de sa région (Wikipédia, Wikidata).'],
        ['musique', '🎶 La musique de leur mariage', 'Les 78 tours et cylindres libres d’Internet Archive enregistrés l’année de leur mariage.'],
        ['almanachs', '📅 Les almanachs de son année', 'Almanach royal ou national, de Gotha, du commerce, Messager boiteux… l’année de sa naissance et de son mariage (liens).'],
        ['emigration', '📷 Photos de l’émigration', 'Pour une personne partie en Amérique : photos libres de la Bibliothèque du Congrès (Ellis Island, avant 1925).'],
        ['wiki', '📖 Wikipédia hors ligne', 'Sur la fiche d’une commune : garder l’article de Wikipédia entier pour le relire sans Internet.'],
        ['wikisource', '📚 Textes anciens sur la commune', 'Sur la fiche d’une commune : les textes de Wikisource qui en parlent.'],
        ['latin', '📜 Vocabulaire latin (Wiktionnaire)', 'Les mots latins des registres, ajoutés à « 📖 Aide à la lecture » et dans Listes.'],
        ['traduire', '🌐 Traduire hors ligne', 'Le bouton « 🌐 Traduire hors ligne » dans l’atelier de transcription et sur les notes écrites dans une autre langue (rien n’est envoyé sur Internet).']];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const kmTxt = k => (k < 1 ? T('sur place') : T('{n} km', {n: String(Math.round(k))}));
    const link = (url, label) => (url ? `<a href="${esc(/^\s*(?:javascript|data|vbscript|file):/i.test(String(url)) ? '#' : url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label)); // une adresse venue d’un site (Wikidata, loc.gov…) : jamais « javascript: »
    const srcLink = url => (url ? `<a class="td-src-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(T('↗ source'))}</a>` : '');
    const row = (icon, html, src, extra = '') => `<div class="hist-row td-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="td-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const hyp = t => `<small class="muted hist-hyp">${esc(t)}</small>`;
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const wd = q => `https://www.wikidata.org/wiki/${encodeURIComponent(q)}`;
    const wp = t => (t ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}` : '');
    const he = P => (P?.gender === 'female' ? T('elle') : T('il'));

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    const FILES = {necropoles: 'td-necropoles', camps: 'td-camps', jeux: 'td-jeux', latin: 'td-latin', almanachs: 'td-almanachs', sons: 'l9a-sons'};
    const data = {};
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir ces fichiers.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    function load(kind) {
        if (!data[kind]) data[kind] = fetch(`assets/data/${FILES[kind]}.json.gz?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (r.status === 404) return null; if (!r.ok) throw new Error(T('Le fichier {f} est introuvable.', {f: FILES[kind]})); return readMaybeGz(r); })
            .then(f => (f ? {meta: f, rows: table(f)} : null))
            .catch(e => { delete data[kind]; throw e; });
        return data[kind];
    }
    const rowsOf = kind => load(kind).then(D => D || {meta: {}, rows: []});
    const memo = new Map();
    const ask = (action, q) => { const k = `${action}|${JSON.stringify(q)}`; if (!memo.has(k)) memo.set(k, api(action, q).catch(e => { memo.delete(k); return {ok: false, message: e.message}; })); return memo.get(k); };
    const lifeMemo = new Map();
    const lifeOf = id => { const H = ext.histoireAutour; if (H?.lifeOf) return H.lifeOf(id); if (!lifeMemo.has(id)) lifeMemo.set(id, api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };

    const SRC = {
        necro: () => `${link('https://www.wikidata.org/wiki/Q19951362', 'Wikidata')} (CC0) · ${link('https://www.data.gouv.fr/datasets/liste-des-necropoles-nationales', 'MémorialGenWeb, data.gouv.fr')} (CC BY-SA)`,
        camps: () => `${link('https://www.wikidata.org/wiki/Q2935245', 'Wikidata')} (CC0)`,
        jeux: () => `${link('https://fr.wikipedia.org/wiki/Cat%C3%A9gorie:Jeu_traditionnel_et_r%C3%A9gional', 'Wikipédia')} (${esc(T('CC BY-SA 4.0, les contributeurs de Wikipédia'))}) · ${link('https://www.wikidata.org', 'Wikidata')} (CC0)`,
        sons: () => `${link('https://archive.org/details/78rpm', 'Internet Archive')} — ${esc(T('licence lue sur chaque notice (domaine public, CC0 ou CC BY)'))}`,
        alm: () => `${link('https://archive.org', 'Internet Archive')} (${esc(T('droits écrits sur chaque volume'))}) · ${link('https://gallica.bnf.fr/edit/und/conditions-dutilisation-des-contenus-de-gallica', 'Gallica')} (${esc(T('lien seulement'))})`,
        loc: () => `${link('https://www.loc.gov/legal/', 'Library of Congress')} — ${esc(T('seulement les photos sans restriction connue, d’avant 1925'))}`,
        wiki: r => `${link(r?.url || 'https://fr.wikipedia.org', 'Wikipédia')} (${link('https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'CC BY-SA 4.0')}, ${link(r?.history, T('les contributeurs de Wikipédia'))})`,
        ws: () => `${link('https://fr.wikisource.org', 'Wikisource')} (${esc(T('textes du domaine public'))}) · ${link('https://www.wikidata.org', 'Wikidata')} (CC0)`,
        latin: () => `${link('https://fr.wiktionary.org', 'Wiktionnaire')} (${link('https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'CC BY-SA 4.0')}, ${esc(T('les contributeurs du Wiktionnaire'))})`
    };
    const SRC_TXT = {sepultures: 'Wikidata (CC0) ; MémorialGenWeb, data.gouv.fr (CC BY-SA)', camps: 'Wikidata (CC0)', jeux: 'Wikipédia (CC BY-SA 4.0) ; Wikidata (CC0)', musique: 'Internet Archive (licence de chaque notice)',
        almanachs: 'Internet Archive (droits de chaque volume) ; Gallica (liens)', emigration: 'Library of Congress (sans restriction connue, avant 1925)', wiki: 'Wikipédia (CC BY-SA 4.0)', wikisource: 'Wikisource (domaine public) ; Wikidata (CC0)', latin: 'Wiktionnaire (CC BY-SA 4.0)'};

    /* ─────────── les morceaux (fiche, village, monographie, à la demande) ─────────── */
    const necroLi = x => `<li><b>${link(wp(x.r.frwiki) || wd(x.r.q), x.r.n)}</b> <small class="muted">(${esc(x.r.commune || x.r.country)}, ${esc(kmTxt(x.km))}${x.r.op ? ` · ${esc(x.r.op)}` : ''})</small>${x.r.mgw ? ` · ${link(x.r.mgw, T('les soldats qui y reposent (MémorialGenWeb)'))}` : ''} ${srcLink(wd(x.r.q))}</li>`;
    const MDH_SEP = 'https://www.memoiredeshommes.sga.defense.gouv.fr/'; // « Sépultures de guerre » : depuis l'accueil (l'adresse exacte de la base n'a pas pu être relue)
    async function gravesHtml(life, id) {
        const W = warDead(life); if (!W) return '';
        const D = await load('necropoles').catch(() => null); if (!D) return '';
        let mpf = null;
        try { const b = await ask('bo_person', {id}); const m = b?.bases?.mpf?.matches?.[0]; if (m?.lieu_deces) mpf = m; } catch (_) {}
        const g = gravesFor(D.rows, life);
        const P = life.person;
        if (!g) {
            if (!W.mpf && !mpf) return '';
            return row('⚱️', `${esc(T('Pour savoir où {e} repose : la base « Sépultures de guerre » de Mémoire des hommes donne la tombe des soldats inhumés dans les nécropoles nationales.', {e: he(P)}))} ${link(MDH_SEP, T('↗ Mémoire des hommes'))}`, SRC.necro());
        }
        const f = g.list[0].r;
        const lead = g.buried ? T('{e} repose sans doute à la {n} ({c}).', {e: cap(he(P)), n: `<b>${esc(f.n)}</b>`, c: esc(f.commune || f.country)})
            : T(P?.gender === 'female' ? '{e} est morte à {p} en {y} : {n} à moins de 25 km. Les soldats tombés là y reposent souvent : {l}.' : '{e} est mort à {p} en {y} : {n} à moins de 25 km. Les soldats tombés là y reposent souvent : {l}.', {e: cap(he(P)), p: esc(g.at.place || g.at.name || ''), y: String(W.year),
                n: g.list.length === 1 ? T('une nécropole') : T('{k} nécropoles et cimetières de guerre', {k: String(g.list.length)}), l: g.list.slice(0, 2).map(x => `<b>${esc(x.r.n)}</b> (${esc(kmTxt(x.km))})`).join(', ')});
        const mpfTxt = mpf ? `<p class="muted">${esc(T('Fiche « Morts pour la France » qui lui ressemble : mort à {p} le {d}.', {p: mpf.lieu_deces, d: mpf.deces || '?'}))}</p>` : '';
        return row('⚱️', `${lead} ${srcLink(f.mgw || wd(f.q))}`, SRC.necro(), more(`${mpfTxt}<ul class="hist-ul td-ul">${g.list.map(necroLi).join('')}</ul>${hyp(T('Une piste : la tombe exacte est dans la base « Sépultures de guerre » de Mémoire des hommes (ministère des Armées), et sur la fiche de la nécropole (MémorialGenWeb). Beaucoup de soldats ont été rendus à leur famille en 1921-1923.'))} ${link(MDH_SEP, T('↗ Sépultures de guerre (Mémoire des hommes)'))}`, g.list.length));
    }
    const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
    const CAMP_WORD = {camp: 'camp d’internement', transit: 'camp de transit', enfants: 'maison d’enfants'};
    const yearsTxt = r => (r.from || r.to ? `${r.from ?? '?'}–${r.to ?? '?'}` : '');
    const campLi = x => `<li>${x.r.kind === 'enfants' ? '🏠' : '🕯'} <b>${link(wp(x.r.frwiki) || wd(x.r.q), x.r.n)}</b> <small class="muted">(${esc(T(CAMP_WORD[x.r.kind] || x.r.kind))}${yearsTxt(x.r) ? `, ${esc(yearsTxt(x.r))}` : ''} · ${esc(x.r.commune || x.r.country)}, ${esc(kmTxt(x.km))})</small> ${srcLink(wd(x.r.q))}</li>`;
    const MEMO = `${link('https://www.memorialdelashoah.org/', T('Mémorial de la Shoah'))} · ${link('https://www.ose-france.org/', 'OSE')} · ${link('https://francearchives.gouv.fr/fr/search?q=camp%20d%27internement', 'FranceArchives')}`;
    function campsHtml(list, lead) {
        return row(list[0].r.kind === 'enfants' ? '🏠' : '🕯', `${lead} ${srcLink(wd(list[0].r.q))}`, SRC.camps(), more(`<ul class="hist-ul td-ul">${list.slice(0, 12).map(campLi).join('')}</ul>${hyp(T('Ce sont des lieux, pas des listes de personnes. Les registres des camps et les dossiers des enfants cachés sont aux Archives départementales, au Mémorial de la Shoah et à l’OSE.'))} ${MEMO}`, list.length));
    }
    async function campsForPerson(life) {
        const D = await load('camps').catch(() => null); if (!D) return '';
        const list = campsFor(D.rows, life); if (!list.length) return '';
        const lead = T('Pendant la guerre, près des lieux de sa vie : {l}.', {l: list.slice(0, 2).map(x => `<b>${esc(x.r.n)}</b> (${esc(T(CAMP_WORD[x.r.kind]))}, ${esc(kmTxt(x.km))} ${esc(T('de {p}', {p: x.place}))})`).join(', ')});
        return campsHtml(list, lead);
    }
    const gameLi = x => `<li><b>${link(wp(x.r.frwiki) || wd(x.r.q), x.r.n)}</b> <small class="muted">(${esc(x.r.region || x.r.hint || '')}${x.km !== undefined ? `, ${esc(kmTxt(x.km))}` : ''})</small>${x.r.ex ? `<br><q class="td-quote">${esc(x.r.ex)}</q>` : ''} ${srcLink(wp(x.r.frwiki) || wd(x.r.q))}</li>`;
    function gamesHtml(list, lead) {
        return row('🎲', `${lead} ${srcLink(wp(list[0].r.frwiki) || wd(list[0].r.q))}`, SRC.jeux(), more(`<ul class="hist-ul td-ul">${list.map(gameLi).join('')}</ul>${list.some(x => x.r.hint) ? hyp(T('La région de certains jeux vient de la première phrase de leur article (« un jeu de quilles du Trégor ») : son centre est approché.')) : ''}`, list.length));
    }
    async function gamesForPerson(life, home) {
        const D = await load('jeux').catch(() => null); if (!D || !home) return '';
        const list = gamesFor(D.rows, home); if (!list.length) return '';
        return gamesHtml(list, T('Les jeux de son pays : {l}.', {l: list.slice(0, 3).map(x => `<b>${esc(x.r.n)}</b>`).join(', ')}));
    }
    const iaFile = r => `https://archive.org/download/${encodeURIComponent(r.id)}/${encodeURIComponent(r.file)}`;
    const iaPage = id => `https://archive.org/details/${encodeURIComponent(id)}`;
    async function musicForPerson(life) {
        const y = weddingYear(life); if (y === null || y < 1895 || y > 1930) return '';
        const D = await load('sons').catch(() => null); if (!D) return '';
        const list = recordsOfYear(D.rows, y); if (!list.length) return '';
        const title = r => String(r.file || r.t || '').replace(/\.(mp3|ogg|flac)$/i, '');
        const lead = T('L’année de leur mariage ({y}), on écoutait au phonographe : {l}.', {y: String(y), l: list.slice(0, 2).map(r => `<b>${esc(title(r))}</b>`).join(', ')});
        const li = r => `<li>${esc(title(r))} <small class="muted">(${esc(String(r.y))}${r.who ? ` · ${esc(String(r.who).slice(0, 80))}` : ''} · ${esc(r.lic || '')})</small> ${link(iaFile(r), T('▶ écouter (archive.org)'))} ${srcLink(iaPage(r.id))}</li>`;
        const gal = `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=${encodeURIComponent(`(dc.type all "sonore") and (gallicapublication_date>="${y}" and gallicapublication_date<="${y}")`)}`;
        return row('🎶', `${lead} ${srcLink(iaPage(list[0].id))}`, SRC.sons(), more(`<ul class="hist-ul td-ul">${list.map(li).join('')}</ul><p class="muted">${link(gal, T('↗ Les enregistrements de {y} sur Gallica (écoute en ligne)', {y: String(y)}))}</p>`, list.length));
    }
    async function almanacsHtml(y, label) {
        const D = await load('almanachs').catch(() => null); if (!D || y === null) return '';
        const S = D.meta.series || {}, G = (D.meta.gallica || []).filter(g => y >= g.from && y <= g.to);
        const vols = almanacsOf(D.rows, y); if (!vols.length && !G.length) return '';
        const lead = T('{l} ({y}) : {v}.', {l: label, y: String(y), v: [...vols.map(v => `<b>${link(iaPage(v.id), S[v.s]?.name || v.s)}</b>`), ...G.slice(0, 2).map(g => `<b>${link(gallicaSearch(g.q, y), g.name)}</b>`)].slice(0, 3).join(', ')});
        const li = v => `<li>${esc(S[v.s]?.icon || '📅')} ${link(iaPage(v.id), v.t || S[v.s]?.name)} <small class="muted">(${esc(String(v.y))}${v.r ? ` · ${esc(v.r)}` : ''})</small><br><small class="muted">${esc(T(S[v.s]?.what || ''))}</small></li>`;
        const gli = g => `<li>${esc(g.icon)} ${link(gallicaSearch(g.q, y), T('{n} de {y} (recherche Gallica)', {n: g.name, y: String(y)}))}<br><small class="muted">${esc(T(g.what))}</small></li>`;
        return row('📅', `${lead} ${srcLink(vols[0] ? iaPage(vols[0].id) : gallicaSearch(G[0].q, y))}`, SRC.alm(), more(`<ul class="hist-ul td-ul">${vols.map(li).join('')}${G.map(gli).join('')}</ul>${hyp(T('Les volumes restent sur leur site : on y lit le nom des officiers, notaires, curés, commerçants… de cette année-là.'))}`, vols.length + G.length));
    }
    async function almanacsForPerson(life) {
        const {birth} = lifeSpan(life), m = weddingYear(life);
        const parts = [];
        if (birth !== null && birth <= 1925) parts.push(await almanacsHtml(birth, T('Les almanachs de l’année de sa naissance')));
        if (m !== null && m <= 1925 && m !== birth) parts.push(await almanacsHtml(m, T('Les almanachs de l’année de son mariage')));
        return parts.filter(Boolean).join('');
    }
    const thumbs = items => `<div class="td-thumbs">${items.map(i => `<a class="td-thumb" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer" title="${esc(`${i.title} (${i.date}) — ${i.rights}`)}">${i.thumb ? `<img src="${esc(i.thumb)}" alt="${esc(i.title)}" loading="lazy" referrerpolicy="no-referrer">` : ''}<span>${esc(i.title)} <small class="muted">(${esc(String(i.date))})</small></span></a>`).join('')}</div>`;
    async function emigrationForPerson(life, priv) {
        if (priv) return '';
        const E = emigration(life); if (!E) return '';
        const y = E.year, from = y ? Math.max(1880, y - 5) : 1880, to = y ? Math.min(1925, y + 5) : 1925;
        if (y && y > 1930) return '';
        const res = await ask('td_loc', {kind: 'ellis', from, to, pid: life.person?.id || 0});
        if (!res?.ok || !res.items?.length) return '';
        const lead = T(life.person?.gender === 'female' ? 'Partie en Amérique ({p}) : ce que voyaient les émigrants à leur arrivée, photos libres de la Bibliothèque du Congrès ({a}–{b}).' : 'Parti en Amérique ({p}) : ce que voyaient les émigrants à leur arrivée, photos libres de la Bibliothèque du Congrès ({a}–{b}).', {p: esc(E.place || E.country), a: String(from), b: String(to)});
        return row('📷', `${lead} ${srcLink(res.search)}`, SRC.loc(), more(`${thumbs(res.items)}${hyp(T('Les images restent sur loc.gov ; seules celles marquées « No known restrictions » (aucune restriction connue) sont montrées. Les listes de passagers d’Ellis Island sont sur le site de la fondation (lien dans « Où chercher »).'))}`, res.items.length));
    }

    /* ─────────── 👤 la fiche d'une personne ─────────── */
    const PERSON_PARTS = ['sepultures', 'camps', 'jeux', 'musique', 'almanachs', 'emigration'];
    async function personInto(host, id, opts = {}) {
        const s = settings(), want = (opts.parts || PERSON_PARTS).filter(k => opts.force || s[k]);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (_) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const home = homePlaces(life, 1)[0], priv = !!opts.private;
        const jobs = {sepultures: () => gravesHtml(life, id), camps: () => campsForPerson(life), jeux: () => gamesForPerson(life, home), musique: () => musicForPerson(life),
            almanachs: () => almanacsForPerson(life), emigration: () => emigrationForPerson(life, priv)};
        const html = await Promise.all(want.filter(k => jobs[k]).map(k => Promise.resolve().then(jobs[k]).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life td-life">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!PERSON_PARTS.some(k => on(k))) return '';
        const priv = p.living_status === 'living' || Number(p.is_private) === 1 ? '1' : '';
        return A().card(index, T('🧭 Mémoire et vieux papiers'), '', `<div class="td-block" data-td-person="${Number(p.id)}" data-td-priv="${priv}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    let viewing = null;
    (ext.afterPerson = ext.afterPerson || []).push(detail => {
        const P = detail?.person; viewing = P?.id ? {id: Number(P.id), priv: P.living_status === 'living' || Number(P.is_private) === 1} : null;
        document.querySelectorAll('#workspace [data-td-person]').forEach(async h => {
            const n = await personInto(h, Number(h.dataset.tdPerson), {private: h.dataset.tdPriv === '1'});
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    const placeLL = pl => { const lat = num(pl?.lat ?? pl?.latitude), lon = num(pl?.lon ?? pl?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    const PLACE_KINDS = ['sepultures', 'camps', 'jeux', 'wiki', 'wikisource'];
    async function wikiHtml(place, opts = {}) {
        if (!place.insee && !opts.title) return '';
        const kept = opts.fetch ? await ask('td_wiki', {insee: place.insee || '', title: opts.title || ''}) : null;
        if (kept && !kept.ok) return row('📖', esc(kept.message || T('Article introuvable.')), '');
        if (!kept) return row('📖', `${esc(T('L’article de Wikipédia de {c}, gardé entier sur l’ordinateur pour le relire sans Internet.', {c: place.name || ''}))} <button type="button" class="button small secondary" data-td-wiki="${esc(place.insee)}" data-td-wiki-name="${esc(place.name || '')}">${esc(T('📖 Garder et lire'))}</button>`, SRC.wiki());
        return row('📖', `${esc(T('« {t} » : l’article de Wikipédia est gardé sur l’ordinateur ({n} parties).', {t: kept.title, n: String(kept.sections.length)}))} <button type="button" class="button small secondary" data-td-wiki-read="${esc(place.insee)}">${esc(T('📖 Lire'))}</button> ${srcLink(kept.url)}`, SRC.wiki(kept));
    }
    async function wikisourceHtml(place) {
        if (!place.insee && !place.name) return '';
        const res = await ask('td_wikisource', {insee: place.insee || '', name: place.name || ''});
        if (!res?.ok || !res.items?.length) return '';
        const li = i => `<li>${link(i.url, i.title)}${i.author ? ` <small class="muted">— ${esc(i.author)}</small>` : ''}${i.year ? ` <small class="muted">(${esc(String(i.year))})</small>` : ''} ${i.wd ? srcLink(i.wd) : ''}</li>`;
        return row('📚', `${esc(T('Textes anciens sur {c} dans Wikisource : {n}.', {c: place.name || '', n: String(res.items.length)}))} ${res.items.slice(0, 2).map(i => link(i.url, `« ${i.title} »`)).join(', ')} ${srcLink(res.search)}`, SRC.ws(),
            more(`<ul class="hist-ul td-ul">${res.items.map(li).join('')}</ul>${hyp(T('Les textes du domaine public, à lire en ligne ; ceux trouvés par leur titre peuvent parler d’un autre lieu du même nom.'))}`, res.items.length));
    }
    async function placePart(kind, place, opts = {}) {
        const ll = placeLL(place);
        if (kind === 'sepultures') { if (!ll) return ''; const D = await load('necropoles').catch(() => null); if (!D) return ''; const list = near(D.rows, ll.lat, ll.lon, 10, 12); if (!list.length) return '';
            return row('⚱️', `${esc(T('Les nécropoles et cimetières de guerre à moins de 10 km :'))} ${list.slice(0, 3).map(x => `<b>${esc(x.r.n)}</b> (${esc(kmTxt(x.km))})`).join(', ')}. ${srcLink(list[0].r.mgw || wd(list[0].r.q))}`, SRC.necro(), more(`<ul class="hist-ul td-ul">${list.map(necroLi).join('')}</ul>`, list.length)); }
        if (kind === 'camps') { if (!ll) return ''; const D = await load('camps').catch(() => null); if (!D) return ''; const list = near(D.rows, ll.lat, ll.lon, 20, 12); if (!list.length) return '';
            return campsHtml(list, T('À moins de 20 km, de 1939 à 1946 : {l}.', {l: list.slice(0, 2).map(x => `<b>${esc(x.r.n)}</b> (${esc(T(CAMP_WORD[x.r.kind]))}, ${esc(kmTxt(x.km))})`).join(', ')})); }
        if (kind === 'jeux') { if (!ll) return ''; const D = await load('jeux').catch(() => null); if (!D) return ''; const list = gamesFor(D.rows, ll, 70); if (!list.length) return '';
            return gamesHtml(list, T('Les jeux traditionnels du pays : {l}.', {l: list.slice(0, 3).map(x => `<b>${esc(x.r.n)}</b>`).join(', ')})); }
        if (kind === 'wiki') return wikiHtml(place, opts);
        if (kind === 'wikisource') return wikisourceHtml(place);
        return '';
    }
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || PLACE_KINDS).filter(k => opts.force || s[k]);
        const parts = await Promise.all(kinds.map(k => placePart(k, place, opts).catch(() => '')));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean);
        host.innerHTML = html.length ? `<section class="maintenance-panel cplus-panel td-panel"><h3>${esc(T('🧭 Mémoire et vieux papiers'))}</h3><div class="hist-life td-life">${html.join('')}</div></section>` : '';
        return html.length;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || ''};
    }
    // ⚙️ « Organiser la fiche » d'un village (heritage-more.js) : cette partie y est rangée, masquée, à la largeur choisie
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'td_place', host: '[data-td-host]', icon: '🧭', label: 'Mémoire et vieux papiers', group: 'Données téléchargées', enabled: () => PLACE_KINDS.some(k => on(k))});
    async function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-td])'); if (!village) return;
        village.dataset.td = '1';
        if (!PLACE_KINDS.some(k => on(k))) return;
        const place = villagePlace(village);
        const anchor = village.querySelector('[data-l10o-host]') || village.querySelector('[data-l9a-host]') || village.querySelector('[data-lp-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="td-place" data-td-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-td-host]'), place);
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate().catch(e => { if (!(e?.name === 'AbortError' || (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || ''))))) console.error(e); }) /* téléchargement coupé (page rechargée) : rien dans la console */; }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* 📖 lire l'article gardé (une fenêtre, sans Internet une fois gardé) */
    async function openWiki(insee, name) {
        const res = await api('td_wiki', {insee});
        if (!res?.ok) { A().toast?.(res?.message || T('Article introuvable.'), 'error'); return; }
        memo.delete(`td_wiki|${JSON.stringify({insee, title: ''})}`);
        const dlg = document.createElement('dialog'); dlg.className = 'td-dlg td-wiki-dlg';
        dlg.innerHTML = `<form method="dialog" class="td-dlg-head"><h3>📖 ${esc(res.title)}</h3><button class="icon-button" aria-label="${esc(T('Fermer'))}">✕</button></form>
            <div class="td-wiki-body">${res.sections.map(s => `${s.h ? `<h${s.lvl === 3 ? 5 : 4}>${esc(s.h)}</h${s.lvl === 3 ? 5 : 4}>` : ''}${s.text.split('\n').map(p => `<p>${esc(p)}</p>`).join('')}`).join('')}</div>
            <p class="muted td-wiki-foot">${esc(T('Texte de Wikipédia, gardé le {d}.', {d: new Date((res.fetched_at || Date.now() / 1000) * 1000).toLocaleDateString('fr-FR')}))} ${SRC.wiki(res)} ${srcLink(res.url)}${res.stale ? ` · ${esc(T('pas de connexion : version gardée'))}` : ''}</p>`;
        document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
    }
    document.addEventListener('click', async e => {
        const keep = e.target.closest?.('[data-td-wiki]'), read = e.target.closest?.('[data-td-wiki-read]');
        if (!keep && !read) return;
        const b = keep || read; b.disabled = true;
        try { await openWiki(b.dataset.tdWiki ?? b.dataset.tdWikiRead, b.dataset.tdWikiName || ''); } finally { b.disabled = false; }
    });

    /* ─────────── 📜 Monographie de commune ─────────── */
    const MONO = [['sepultures', 'td_necropoles', '⚱️', 'Nécropoles et cimetières de guerre'], ['camps', 'td_camps', '🕯', 'Camps et maisons d’enfants (1939-1945)'], ['jeux', 'td_jeux', '🎲', 'Les jeux traditionnels du pays'],
        ['wiki', 'td_wiki', '📖', 'L’article de Wikipédia (gardé)'], ['wikisource', 'td_wikisource', '📚', 'Textes anciens sur la commune (Wikisource)']];
    (ext.monographSections = ext.monographSections || []).push(...MONO.map(([kind, id, icon, label]) => ({
        id, icon, label, group: kind === 'wikisource' || kind === 'wiki' ? 'Chercher' : kind === 'jeux' ? 'Le lieu' : 'Le monde', defaultOn: kind !== 'wiki', enabled: () => on(kind), source: SRC_TXT[kind],
        render: async (place, host) => {
            const p = {...place, lat: place.latitude ?? place.lat, lon: place.longitude ?? place.lon, insee: place.insee || ''};
            const html = await placePart(kind, p, {fetch: kind === 'wiki'}); if (!html) return false;
            host.innerHTML = `<div class="hist-life td-life">${html}</div>`; return true;
        }})));

    /* ─────────── 📋 Listes ─────────── */
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'td_necropoles', pack: 'td-necropoles', icon: '⚱️', label: T('Nécropoles nationales et cimetières de guerre'), group: 'Le lieu', source: 'Wikidata (CC0) ; MémorialGenWeb (CC BY-SA)', sourceUrl: 'https://www.data.gouv.fr/datasets/liste-des-necropoles-nationales', enabled: () => on('sepultures'),
            load: async () => (await rowsOf('necropoles')).rows.map(r => ({name: r.n, kind: r.kind === 'necropole' ? T('nécropole nationale') : T('cimetière de guerre'), commune: r.commune, country: r.country, from: r.from, op: r.op, mgw: r.mgw, wikipedia: wp(r.frwiki), lat: r.lat, lon: r.lon, src: wd(r.q)})),
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'kind', label: T('Sorte'), type: 'enum', values: [T('nécropole nationale'), T('cimetière de guerre')]}, {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'country', label: T('Pays'), type: 'enum'},
                {key: 'from', label: T('Ouvert en'), type: 'year'}, {key: 'op', label: T('Gestionnaire'), type: 'text'}, {key: 'mgw', label: T('Soldats inhumés (MémorialGenWeb)'), type: 'url'}, {key: 'wikipedia', label: 'Wikipédia', type: 'url'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.from, null], geo: r => [r.lat, r.lon], open: r => window.open(r.mgw || r.src, '_blank', 'noopener')},
        {id: 'td_camps', pack: 'td-camps', icon: '🕯', label: T('Camps d’internement 1939-1946 et maisons d’enfants'), group: 'Le monde', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/wiki/Q2935245', enabled: () => on('camps'),
            load: async () => (await rowsOf('camps')).rows.map(r => ({name: r.n, kind: T(CAMP_WORD[r.kind] || r.kind), commune: r.commune, country: r.country, from: r.from, to: r.to, wikipedia: wp(r.frwiki), lat: r.lat, lon: r.lon, src: wd(r.q)})),
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'kind', label: T('Sorte'), type: 'enum', values: Object.values(CAMP_WORD).map(x => T(x))}, {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'country', label: T('Pays'), type: 'enum'},
                {key: 'from', label: T('Ouvert en'), type: 'year'}, {key: 'to', label: T('Fermé en'), type: 'year'}, {key: 'wikipedia', label: 'Wikipédia', type: 'url'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.from, r.to], geo: r => [r.lat, r.lon], open: r => window.open(r.wikipedia || r.src, '_blank', 'noopener')},
        {id: 'td_jeux', pack: 'td-jeux', icon: '🎲', label: T('Jeux traditionnels et régionaux'), group: 'Le lieu', source: 'Wikipédia (CC BY-SA 4.0) ; Wikidata (CC0)', sourceUrl: 'https://fr.wikipedia.org/wiki/Cat%C3%A9gorie:Jeu_traditionnel_et_r%C3%A9gional', enabled: () => on('jeux'),
            load: async () => (await rowsOf('jeux')).rows.map(r => ({name: r.n, region: r.region || r.hint, country: r.country, quote: r.ex, lat: r.lat, lon: r.lon, src: wp(r.frwiki) || wd(r.q)})),
            fields: [{key: 'name', label: T('Nom'), type: 'text'}, {key: 'region', label: T('Région'), type: 'enum'}, {key: 'country', label: T('Pays'), type: 'enum'}, {key: 'quote', label: T('La phrase de Wikipédia'), type: 'text'}, {key: 'src', label: T('Source'), type: 'url'}],
            geo: r => (r.lat !== null && r.lat !== undefined ? [r.lat, r.lon] : null), open: r => window.open(r.src, '_blank', 'noopener')},
        {id: 'td_latin', pack: 'td-latin', icon: '📜', label: T('Vocabulaire latin des registres (Wiktionnaire)'), group: 'Chercher', source: 'Wiktionnaire (CC BY-SA 4.0)', sourceUrl: 'https://fr.wiktionary.org', enabled: () => on('latin'),
            load: async () => (await rowsOf('latin')).rows.map(r => ({word: r.t, meaning: r.d, pos: r.pos, of: r.of, acte: r.a, kind: r.k, src: r.url})),
            fields: [{key: 'word', label: T('Mot latin'), type: 'text'}, {key: 'meaning', label: T('Sens (Wiktionnaire)'), type: 'text'}, {key: 'pos', label: T('Nature'), type: 'enum'}, {key: 'of', label: T('Forme de'), type: 'text'},
                {key: 'acte', label: T('Acte'), type: 'enum', values: ['bapteme', 'mariage', 'sepulture', 'general']}, {key: 'kind', label: T('Sorte'), type: 'enum'}, {key: 'src', label: T('Source'), type: 'url'}],
            open: r => window.open(r.src, '_blank', 'noopener')},
        {id: 'td_almanachs', pack: 'td-almanachs', icon: '📅', label: T('Almanachs et annuaires anciens, année par année'), group: 'Chercher', source: 'Internet Archive (droits de chaque volume)', sourceUrl: 'https://archive.org', enabled: () => on('almanachs'),
            load: async () => { const D = await rowsOf('almanachs'); const S = D.meta.series || {}; return D.rows.map(r => ({serie: S[r.s]?.name || r.s, year: r.y, title: r.t, rights: r.r, src: iaPage(r.id)})); },
            fields: [{key: 'serie', label: T('Série'), type: 'enum'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'title', label: T('Titre'), type: 'text'}, {key: 'rights', label: T('Droits'), type: 'enum'}, {key: 'src', label: T('Source'), type: 'url'}],
            period: r => [r.year, r.year], open: r => window.open(r.src, '_blank', 'noopener')});

    /* ─────────── 🗺 Cartes ─────────── */
    const inBox = (bbox, lat, lon) => !bbox || (lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3]);
    const layer = (id, icon, label, kind, src, filter = () => true) => ({id, icon, label: T(label), group: 'Le lieu', kind: 'points', source: src,
        run: async ({q, bbox, from, to, max = 2000}) => { const D = await rowsOf(kind); const features = D.rows.filter(r => num(r.lat) !== null && inBox(bbox, r.lat, r.lon) && filter(r, from, to) && (!q || fold(r.n).includes(fold(q)))).slice(0, max).map(r => ({type: 'pt', lat: r.lat, lon: r.lon, label: r.n})); return {features, source: src}; }});
    (ext.mapLayerSources = ext.mapLayerSources || []).push(
        layer('td_necropoles', '⚱️', 'Nécropoles et cimetières de guerre', 'necropoles', 'Wikidata (CC0) ; MémorialGenWeb (CC BY-SA)', (r, from, to) => !to || r.from === null || r.from <= to),
        layer('td_camps', '🕯', 'Camps d’internement 1939-1946 et maisons d’enfants', 'camps', 'Wikidata (CC0)', (r, from, to) => (!to || (r.from ?? 1939) <= to) && (!from || (r.to ?? 1946) >= from)),
        layer('td_jeux', '🎲', 'Jeux traditionnels et régionaux', 'jeux', 'Wikipédia (CC BY-SA 4.0) ; Wikidata (CC0)'));

    /* ─────────── 🧰 le registre commun : à la demande ─────────── */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null} : null);
    const personOfCtx = ctx => Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0;
    const privOfCtx = ctx => { const p = ctx.person?.person || ctx.person; return !!(p && typeof p === 'object' && (p.living_status === 'living' || Number(p.is_private) === 1)); };
    async function runPerson(parts, ctx, host, empty) {
        const id = personOfCtx(ctx); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
        host.innerHTML = '<div></div>';
        const n = await personInto(host.firstElementChild, id, {parts, force: true, detached: true, private: privOfCtx(ctx)});
        if (!n) host.innerHTML = emptyLine(T(empty), 'ℹ️');
        return n;
    }
    async function runPlace(kind, ctx, host) {
        const pl = placeOfCtx(ctx.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return null; }
        if ((kind === 'wikisource' || kind === 'wiki') && viewing?.priv && host.closest?.('.ts-parking')) { host.innerHTML = ''; return false; }
        const html = await placePart(kind, pl, {fetch: kind === 'wiki'});
        host.innerHTML = html ? `<div class="hist-life td-life">${html}</div>` : '';
        return !!html;
    }
    async function runYear(ctx, host) {
        const y = num(ctx.year); if (y === null) { host.innerHTML = emptyLine(T('Choisis une année.'), '📅'); return null; }
        const html = await almanacsHtml(y, T('Les almanachs et annuaires de cette année'));
        host.innerHTML = html ? `<div class="hist-life td-life">${html}</div>` : emptyLine(T('Aucun almanach numérisé connu pour cette année (jusqu’en 1925).'));
        return !!html;
    }
    async function runLatin(ctx, host) {
        const D = await rowsOf('latin');
        host.innerHTML = `<div class="td-latin"><input type="search" class="td-latin-q" placeholder="${esc(T('Un mot latin : filius, sepultus, mensis…'))}" aria-label="${esc(T('Chercher un mot latin'))}"><ul class="hist-ul td-ul" data-td-latin-out></ul><small class="hist-src">${esc(T('Source :'))} ${SRC.latin()}</small></div>`;
        const out = host.querySelector('[data-td-latin-out]'), q = host.querySelector('input');
        const draw = () => { const f = fold(q.value); const rows = D.rows.filter(r => !f || fold(r.t).startsWith(f) || fold(r.d).includes(f)).slice(0, 40);
            out.innerHTML = rows.map(r => `<li><b lang="la">${esc(r.t)}</b> <small class="muted">(${esc(r.pos)}${r.of ? ` — ${esc(r.of)}` : ''})</small> : ${esc(r.d)} ${srcLink(r.url)}</li>`).join('') || `<li class="muted">${esc(T('Rien pour ce mot.'))}</li>`; };
        q.addEventListener('input', draw); draw();
        return true;
    }
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'tdp_sepultures', icon: '⚱️', label: T('Où le soldat repose'), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson(['sepultures'], ctx, host, 'Pour un soldat mort à la guerre, avec un lieu de décès placé sur la carte.')},
        {id: 'tdp_camps', icon: '🕯', label: T('Camps et maisons d’enfants près de chez lui (1939-1945)'), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson(['camps'], ctx, host, 'Aucun camp connu près de ses lieux pendant la guerre.')},
        {id: 'tdp_jeux', icon: '🎲', label: T('Les jeux de son pays'), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson(['jeux'], ctx, host, 'Aucun jeu traditionnel connu près de son lieu de naissance.')},
        {id: 'tdp_musique', icon: '🎶', label: T('La musique de l’année de leur mariage'), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson(['musique'], ctx, host, 'Il faut un mariage daté entre 1895 et 1930.')},
        {id: 'tdp_almanachs', icon: '📅', label: T('Les almanachs de sa naissance et de son mariage'), group: 'La personne', needs: ['person'], installed: () => true, run: (ctx, host) => runPerson(['almanachs'], ctx, host, 'Aucun almanach numérisé pour ses années (jusqu’en 1925).')},
        {id: 'tdp_emigration', icon: '📷', label: T('Photos de l’émigration (Bibliothèque du Congrès)'), group: 'La personne', needs: ['person'], online: true, installed: () => true, run: (ctx, host) => runPerson(['emigration'], ctx, host, 'Pour une personne partie en Amérique avant 1930 (un événement là-bas).')},
        {id: 'tdy_almanachs', icon: '📅', label: T('Les almanachs d’une année'), group: 'Le monde', needs: ['year'], installed: () => true, run: runYear},
        {id: 'td_latin_dico', icon: '📜', label: T('Dictionnaire latin des registres'), group: 'Chercher', needs: [], installed: () => true, run: runLatin},
        ...MONO.map(([kind, id, icon, label]) => ({id: `${id}_lieu`, icon, label: T(label), group: 'Le lieu', needs: ['place'], online: kind === 'wiki' || kind === 'wikisource', installed: () => true, run: (ctx, host) => runPlace(kind, ctx, host)})));

    /* ─────────── 📜 le vocabulaire latin dans « 📖 Aide à la lecture » ─────────── */
    function feedAide() {
        if (!on('latin')) { ext.aideExtraEntries = (ext.aideExtraEntries || []).filter(e => e.src !== 'Wiktionnaire'); return; }
        load('latin').then(D => { if (!D) return; const rest = (ext.aideExtraEntries || []).filter(e => e.src !== 'Wiktionnaire'); ext.aideExtraEntries = [...rest, ...latinEntries(D.rows)]; }).catch(() => {});
    }

    /* ─────────── 🌍 Où chercher : des sites en plus ─────────── */
    function registerOuChercher() {
        const M = root.LCNDA_OUC_MONDE; if (!M || !Array.isArray(M.SITES) || M.SITES.some(s => s.key === 'td_relais_cybergeo')) return !!M;
        const enc = encodeURIComponent;
        M.SITES.push(
            {key: 'td_relais_cybergeo', icon: '🐴', group: 'Monde', label: T('Relais et routes de la poste aux chevaux 1632-1833 (Verdier et al., Cybergeo)'), cats: ['cartes'], period: [1632, 1833], access: 'online',
                url: () => 'https://doi.org/10.4000/13gxr', rel: {countries: ['fr'], from: 1632, to: 1833, base: 0.1, why: () => T('Les relais de poste de sa route, à sept dates (base de recherche ; données à télécharger sur le site de la revue)')}},
            {key: 'td_gallica_son', icon: '🎶', group: 'Monde', label: T('Gallica — enregistrements sonores anciens (écoute en ligne)'), cats: ['bibliotheques'], period: [1890, 1950], access: 'online',
                url: p => `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=${enc(`(dc.type all "sonore") and (gallica all "${p.last || ''}")`)}`, rel: {countries: ['fr'], from: 1890, to: 1950, base: 0.05, why: () => T('Les disques et cylindres de son époque')}});
        return true;
    }

    /* ─────────── ⚙️ Réglages → 🧭 Mémoire et vieux papiers ─────────── */
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const metas = {};
        await Promise.all(['necropoles', 'camps', 'jeux', 'latin', 'almanachs'].map(async k => { try { const D = await load(k); if (D) metas[k] = D; } catch (_) {} }));
        let about = null; try { about = await api('td_about'); } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([key, label, sub]) => `<label class="checkbox-line cplus-tg" data-td-tg="${key}"><input type="checkbox" ${s[key] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const fileRow = (k, label) => { const D = metas[k]; if (!D) return `<tr><td>${esc(T(label))}</td><td colspan="4" class="muted">${esc(T('Fichier absent.'))}</td></tr>`;
            const m = D.meta; return `<tr><td>${esc(T(label))}</td><td>${link(m.url, m.source)}${m.url2 ? ` · ${link(m.url2, 'data.gouv.fr')}` : ''}<br><small class="muted">${esc(m.what || '')}</small></td><td>${esc(nf(D.rows.length))}</td><td>${link(m.licence_url, m.licence)}</td><td>${esc(m.built || '')}</td></tr>`; };
        const S = about?.sources || {};
        const onl = (k, label) => `<tr><td>${esc(T(label))}</td><td>${link(S[k]?.url, S[k]?.label || k)}${S[k]?.quote ? `<br><small class="muted">« ${esc(S[k].quote)} »</small>` : ''}</td><td>${esc(T('en ligne'))}</td><td>${esc(S[k]?.licence || '')}</td><td>${esc(T('licence lue le {d}', {d: S[k]?.read || '2026-11-25'}))}</td></tr>`;
        const wl = about?.wiki || [];
        ws.innerHTML = `<section class="page cplus-settings td-settings" data-td-settings-page>${UI().pageHeader ? UI().pageHeader({title: T('Mémoire et vieux papiers'), icon: '🧭', where: T('Réglages · Données'), help: esc(T('Où le soldat repose, les camps de 1939-1945, les jeux de son pays, la musique de son mariage, les almanachs de son année, les photos de l’émigration, Wikipédia et Wikisource de sa commune, le latin des registres.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’une personne (bloc « 🧭 Mémoire et vieux papiers »), sur la fiche d’un village et dans la monographie de commune. Les listes sont dans Listes, les points dans Cartes.'))}</p>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel" data-td-tr-panel></div>
            <div class="maintenance-panel"><h3>${esc(T('📖 Wikipédia hors ligne'))}</h3><p class="muted">${esc(T('Le fichier complet de Wikipédia en français (Kiwix, plus de 30 Go) est trop gros : l’app garde seulement les articles des communes que tu ouvres (bouton « 📖 Garder et lire » sur la fiche d’un village).'))}</p>
                ${wl.length ? `<ul class="hist-ul td-ul">${wl.map(w => `<li>${link(w.url, w.title)} <small class="muted">(${esc(new Date(w.at * 1000).toLocaleDateString('fr-FR'))})</small></li>`).join('')}</ul>` : `<p class="muted">${esc(T('Aucun article gardé pour l’instant.'))}</p>`}</div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Lignes'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Fabriqué le'))}</th></tr></thead><tbody>
                ${fileRow('necropoles', '⚱️ Nécropoles')}${fileRow('camps', '🕯 Camps et maisons d’enfants')}${fileRow('jeux', '🎲 Jeux traditionnels')}${fileRow('latin', '📜 Latin (Wiktionnaire)')}${fileRow('almanachs', '📅 Almanachs')}
                ${onl('loc', '📷 Photos de l’émigration')}${onl('wiki', '📖 Wikipédia')}${onl('ws', '📚 Wikisource')}
                <tr><td>${esc(T('🎶 78 tours'))}</td><td colspan="4" class="muted">${esc(T('Déjà dans « 🔊 Sons et enfance » (Internet Archive, licence de chaque notice) : ici, l’année du mariage.'))}</td></tr></tbody></table></div>
                <p class="muted">${esc(T('Ce qui part sur Internet : « Ellis Island » et des années, le code INSEE ou le nom de la commune. Jamais un nom de personne, et rien pour une fiche vivante ou confidentielle.'))}</p>
                <p class="muted">${esc(T('Liens seulement (licence pas ouverte ou pas lisible) : Mémoire des hommes (sépultures de guerre), Gallica (almanachs, sons), Archives nationales d’outre-mer, la base des relais de poste de Cybergeo (licence pas vérifiée).'))}</p>
                <p class="muted">${esc(T('Réponses gardées sur l’ordinateur : {n}.', {n: nf(about?.cache?.count || 0)}))} <button type="button" class="button small secondary" data-td-cache-clear>${esc(T('🗑 Vider'))}</button></p></div></section>`;
        ext.telechTraduire?.settingsInto?.(ws.querySelector('[data-td-tr-panel]'));
    }
    document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-td-tg]'); if (!t || !e.target.matches('input')) return;
        const s = settings(), k = t.dataset.tdTg, was = s[k];
        s[k] = e.target.checked; saveSettings(s); if (k === 'latin') feedAide();
        A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); if (k === 'latin') feedAide(); drawSettings(); }, icon: '🧭'});
    });
    document.addEventListener('click', async e => {
        if (!e.target.closest?.('[data-td-cache-clear]')) return;
        try {
            const res = await post('td_cache_clear', {});
            memo.clear(); drawSettings();
            A().undoToast?.(T('Réponses gardées effacées ({n}).', {n: String(res.removed)}), {undo: async () => { await post('td_cache_restore', {token: res.token}); drawSettings(); }, icon: '🗑'});
        } catch (err) { A().toast?.(err.message, 'error'); }
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'lot10_objets_traces'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK)) { let i = B.findIndex(b => b[0] === 'lot10_objets_traces'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire_autour'); B.splice(i < 0 ? B.length : i + 1, 0, [BLOCK, '🧭 Mémoire et vieux papiers']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK] ||= '12';
        registerOuChercher();
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(feedAide, 1500), {once: true}); else setTimeout(feedAide, 1500);

    ext.telechD = {...core, load, settings, personInto, placeInto, placePart, lifeOf, feedAide, openWiki,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
