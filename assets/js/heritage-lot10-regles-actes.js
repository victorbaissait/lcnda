/* LCNDA — ⚖️ Les règles de sa vie et 🔍 Aider à lire les actes (lot 10). Serveur : lib/lot10_regles_actes.php (💒 dates des mariages
 * d'une commune) et lib/lot9_monde_coutumes.php (l9b_person, l9b_place : déjà là) ; style : assets/css/lot10-regles-actes.css ;
 * données livrées : assets/data/l10-regles.json.gz, l10-jours.json.gz, l10-cappelli.json.gz (refaites par scripts/lot10-regles-actes/*).
 *  ⚖️ La coutume de son pays (droit écrit ou coutume, ce qu'elle disait du partage)   🧂 L'impôt du sel de son vivant (1806-1945)
 *  💒 Les temps clos (Avent, Carême) : un mariage pendant un temps clos, les mariages par mois d'une paroisse
 *  🌦️ Les dictons de son jour de naissance                🌬️ Le vent de son pays                 🏞️ Son « pays » traditionnel
 *  ✂️ Les abréviations latines (Cappelli, 1901)            🖋️ Les modèles d'écriture de son époque
 *  📚 Les mots anciens (Wiktionnaire et dictionnaires anciens de Wikisource, en ligne)   📅 Une fête de saint → la vraie date
 * Où ça s'affiche : un bloc de fiche « ⚖️ Les règles de sa vie » (une phrase par sujet, ▸ plus), la fiche d'un village, la monographie
 * (LCNDA_EXT.monographSections), 🔎 Ce qui le concerne / 🧰 Données (LCNDA_EXT.dataSources), Listes → Données (LCNDA_EXT.dataLists),
 * les cartes (LCNDA_EXT.mapLayerSources : ⚖️ droit écrit / coutume), « Où chercher » (ext.ouChercher.afterRedraw), 📖 Aide à la lecture
 * (onglets ✂️ 🖋️ 📚 📅 par LCNDA_EXT.readingAidTabs), la date d'un événement (« le jour de la Saint-X 1702 »),
 * et Réglages → « ⚖️ Règles et actes » (localStorage « genealogie-regles-actes »).
 * Pour d'autres fichiers : LCNDA_EXT.reglesActes. Essai : tests/test-lot10-regles-actes.js
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
    'use strict';
    const W = root || {};
    const A = () => W.LCNDA_APP || {};
    const UI = () => W.LCNDA_UI || {};
    const ext = W.LCNDA_EXT = W.LCNDA_EXT || {};
    const T = (s, v0) => { const v = v0 && Object.fromEntries(Object.entries(v0).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return W.LCNDA_I18N ? W.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m)); };
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
    const link = (url, label = T('↗ source'), title = '') => (url ? `${window.LCNDA_UI.extLink(url, label, {title: title})}` : esc(label));
    const more = (inner, n) => `<details class="cplus-more l10r-more"><summary>${esc(n ? T('▸ plus ({n})', {n}) : T('▸ plus'))}</summary>${inner}</details>`;
    const srcLine = (label, licence, url, extra = '') => `<p class="cplus-src l10r-src">${esc(T('Source :'))} ${url ? link(url, label) : esc(label)}${licence ? ` — ${esc(licence)}` : ''}${extra}</p>`;
    const quoteBox = (q, url, title) => (q ? `<details class="l10r-quote"><summary><small>${esc(T('La source'))}</small></summary><blockquote>« ${esc(q)} »</blockquote><small class="muted">${esc(title || '')} ${link(url)}</small></details>` : '');
    const km = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); };
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
    const dayFr = (m, d) => `${d === 1 ? '1er' : d} ${T(MONTHS[m - 1])}`;
    const dateFr = ({y, m, d}) => `${dayFr(m, d)} ${y}`;
    const listFr = arr => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} ${T('et')} ${arr[arr.length - 1]}`);
    const placeName = p => p?.commune || p?.name || '';
    const depOf = insee => (!insee ? '' : /^97/.test(insee) ? insee.slice(0, 3) : insee.slice(0, 2));
    const yOf = s => { const m = String(s ?? '').match(/^-?\d{1,4}/); return m ? Number(m[0]) : null; };

    /* ═════════════ les réglages ═════════════ */
    const KEY = 'genealogie-regles-actes';
    const TAB = ['regles_actes', '25l10r', '⚖️ Règles et actes'];
    const PARTS = [
        ['coutume', '⚖️ La coutume de son pays', 'Avant la Révolution : pays de droit écrit ou de coutume (Paris, Normandie, Bretagne…), et ce qu’elle disait du partage de l’héritage.'],
        ['sel', '🧂 L’impôt du sel de son vivant', 'Après la gabelle : l’impôt sur le sel rétabli en 1806, supprimé en 1848, puis la taxe jusqu’en 1945.'],
        ['tempsclos', '💒 Les temps clos (Avent et Carême)', 'On ne célébrait pas de noces pendant l’Avent et le Carême : un mariage pendant ces temps (avec dispense) et les mois sans mariage d’une paroisse.'],
        ['dictons', '🌦️ Les dictons de son jour de naissance', '« À la Sainte-Catherine, tout bois prend racine » : les dictons du jour où il est né.'],
        ['vent', '🌬️ Le vent de son pays', 'Mistral, tramontane, galerne, autan… le vent qui soufflait chez lui.'],
        ['pays', '🏞️ Son « pays » traditionnel', 'Pays de Caux, Bocage, Brie… la région naturelle de sa commune.'],
        ['cappelli', '✂️ Les abréviations latines (Cappelli)', 'Dans 📖 Aide à la lecture : « Joes » → Joannes, avec la page du dictionnaire de Cappelli (1901).'],
        ['ecritures', '🖋️ Les modèles d’écriture de son époque', 'Dans 📖 Aide à la lecture : des pages de maîtres écrivains (1569-1843) proches de la date de l’acte.'],
        ['mots', '📚 Les mots anciens', 'Dans 📖 Aide à la lecture : le sens d’un mot ancien (Wiktionnaire, dictionnaires anciens de Wikisource), en ligne.'],
        ['fetes', '📅 Une fête de saint → la vraie date', '« Le jour de la Saint-Martin 1702 » : la date exacte, aussi dans la saisie des dates.']];
    const DEF = Object.fromEntries(PARTS.map(p => [p[0], true]));
    function settings() { let s = {}; try { s = JSON.parse(W.localStorage?.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...DEF, ...s}; }
    function save(s) { try { W.localStorage?.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
    const on = k => settings()[k] !== false;

    /* ═════════════ les fichiers livrés (chargés une fois, à la demande) ═════════════ */
    const files = {};
    async function readGz(url) {
        const r = await fetch(url, {credentials: 'same-origin'});
        if (!r.ok) throw new Error(T('Fichier introuvable : {f}', {f: url.split('?')[0]}));
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir ce fichier.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    const load = name => (files[name] ||= readGz(`assets/data/l10-${name}.json.gz?v=1`).catch(e => { delete files[name]; throw e; }));
    const tryLoad = name => load(name).catch(() => null);
    let arPromise = null;
    const loadAR = () => (arPromise ||= (ext.droitPouvoir?.loadAR ? ext.droitPouvoir.loadAR() : readGz('assets/data/dp-ancien-regime.json.gz')).catch(e => { arPromise = null; throw e; }));
    const api = (a, q) => A().api(a, q);
    const memo = new Map();
    function ask(action, q) { const k = action + JSON.stringify(q); if (!memo.has(k)) memo.set(k, api(action, q).catch(e => { memo.delete(k); return {ok: false, message: e.message}; })); return memo.get(k); }

    /* ═════════════ 📅 calendrier : jours juliens, Pâques, temps clos ═════════════ */
    // En France, le calendrier grégorien remplace le julien en décembre 1582 (le 9 est suivi du 20).
    const jdnG = (y, m, d) => { const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3; return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045; };
    const jdnJ = (y, m, d) => { const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3; return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - 32083; };
    const fromG = j => { const a = j + 32044, b = Math.floor((4 * a + 3) / 146097), c = a - Math.floor(146097 * b / 4), d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d / 4), m = Math.floor((5 * e + 2) / 153); return {y: 100 * b + d - 4800 + Math.floor(m / 10), m: m + 3 - 12 * Math.floor(m / 10), d: e - Math.floor((153 * m + 2) / 5) + 1}; };
    const fromJ = j => { const c = j + 32082, d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d / 4), m = Math.floor((5 * e + 2) / 153); return {y: d - 4800 + Math.floor(m / 10), m: m + 3 - 12 * Math.floor(m / 10), d: e - Math.floor((153 * m + 2) / 5) + 1}; };
    const julian = (y, m = 12, d = 31) => y < 1582 || (y === 1582 && (m < 12 || d < 20));
    const jdn = (y, m, d) => (julian(y, m, d) ? jdnJ(y, m, d) : jdnG(y, m, d));
    const civil = (j, y) => (julian(y) ? fromJ(j) : fromG(j));
    const weekday = j => WEEKDAYS[((j % 7) + 7) % 7];
    /** Pâques (numéro de jour julien) : comput julien avant 1583, grégorien ensuite */
    function easterJdn(year) {
        if (julian(year, 4, 1)) {
            const a = year % 4, b = year % 7, c = year % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
            return jdnJ(year, Math.floor((d + e + 114) / 31), ((d + e + 114) % 31) + 1);
        }
        const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
        return jdnG(year, Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1);
    }
    /** premier dimanche de l'Avent de l'année y : le dimanche entre le 27 novembre et le 3 décembre */
    function adventJdn(y) { const j = jdn(y, 11, 27); return j + ((6 - (((j % 7) + 7) % 7)) + 7) % 7; }
    /** les temps clos d'une année civile : [{kind, from, to}] (jours juliens, bornes comprises) — concile de Trente, sess. XXIV, c. X */
    function closedTimes(y) {
        const e = easterJdn(y);
        return [{kind: 'avent', from: adventJdn(y - 1), to: jdn(y, 1, 6)}, {kind: 'careme', from: e - 46, to: e + 7}, {kind: 'avent', from: adventJdn(y), to: jdn(y + 1, 1, 6)}];
    }
    /** tempsClos(1754, 3, 12) → {kind: 'careme', from: {y,m,d}, to: {y,m,d}} ou null */
    function tempsClos(y, m, d) {
        if (!y || !m || !d) return null;
        const j = jdn(y, m, d);
        const hit = closedTimes(y).find(t => j >= t.from && j <= t.to);
        return hit ? {kind: hit.kind, from: civil(hit.from, y), to: civil(hit.to, y)} : null;
    }
    const CLOS_NAME = {avent: 'l’Avent', careme: 'le Carême'};
    const periodTxt = t => T('du {a} au {b}', {a: dateFr(t.from), b: dateFr(t.to)});

    /* ═════════════ ⚖️ la coutume ═════════════ */
    /** coutumeOf(R, AR, '76540') → {regime, province, bailliage, named, mixte} ou null (communes du royaume en 1789) */
    function coutumeOf(R, AR, insee) {
        const C = R?.coutume; if (!C || !AR || !insee) return null;
        const r = AR.c?.[insee]; if (!r || r[1] === 0) return null;
        const at = k => { const i = AR.layers.indexOf(k), j = i >= 0 ? r[3 + i] : -1; return j >= 0 ? AR.ents[k][j] : null; };
        const prov = at('p')?.n || '', bail = at('b')?.n || '';
        const regime = C.provinces[prov]; if (!regime) return null;
        const named = C.named.find(n => (n.layer === 'p' ? prov : bail) && n.names.includes(n.layer === 'p' ? prov : bail)) || null;
        return {regime, province: prov, bailliage: bail, named, mixte: C.mixte?.[prov] || null};
    }
    function coutumeHtml(R, AR, pl, {person = null} = {}) {
        const c = coutumeOf(R, AR, pl?.insee); if (!c) return '';
        const C = R.coutume, rg = C.regimes[c.regime];
        const where = placeName(pl);
        const lead = c.named ? T('Avant la Révolution, {p} suivait la {n} ({r}).', {p: where, n: c.named.n, r: T(rg.label)}) : T('Avant la Révolution, {p} était en {r} (province : {v}).', {p: where, r: T(rg.label), v: c.province});
        const part = c.named?.partage ? c.named : (C.partage[c.regime === 'ecrit' ? 'ecrit' : 'coutume'] || [])[0];
        const fin = C.partage.fin?.[0];
        const succBtn = person && ext.successions?.edit ? `<p><button type="button" class="link-button" data-l10r-succ="${Number(person.id)}" data-title="${esc(person.title || '')}">${esc(T('🏠 Noter un partage ou un testament (Héritages et successions)'))}</button></p>` : '';
        const maps = (C.maps || []).filter(m => m.thumb).map(m => `<figure class="tr-photo is-small l10r-map"><a href="${esc(m.page)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" alt="${esc(m.title)}" src="${esc(m.thumb)}" onerror="this.closest('figure').remove()"></a>
            <figcaption>${esc(T(m.title))} · ${m.licence_url ? link(m.licence_url, m.licence) : esc(m.licence)} · ${link(m.page, T('Commons ↗'))}</figcaption></figure>`).join('');
        return `<p class="cplus-lead">⚖️ ${esc(lead)} ${esc(T(rg.rule))}</p>${part ? quoteBox(part.q, part.url, part.title) : ''}
            ${more(`${c.named && c.named.q !== part?.q ? `<p>${esc(T(c.named.n))} : ${quoteBox(c.named.q, c.named.url, c.named.title)}</p>` : ''}
                ${(c.named?.more || []).map(x => `<p>${quoteBox(x.q, x.url, x.title)}</p>`).join('')}
                ${c.regime !== 'coutume' ? '' : `<p>${esc(T('Dans les pays de coutume, les règles de l’héritage changeaient d’une coutume à l’autre :'))} ${quoteBox(C.partage.coutume[1]?.q, C.partage.coutume[1]?.url, C.partage.coutume[1]?.title)}</p>`}
                ${c.regime === 'ecrit' ? `<p>${esc(T('Dans le Midi, souvent un seul héritier gardait la « maison » :'))} ${quoteBox(C.partage.ecrit[0]?.q, C.partage.ecrit[0]?.url, C.partage.ecrit[0]?.title)}</p>` : ''}
                ${c.mixte ? `<p>${esc(T('Une province partagée :'))} ${quoteBox(c.mixte.q, c.mixte.url, c.mixte.title)}</p>` : ''}
                <p>${esc(T('Pour les nobles, le droit d’aînesse :'))} ${quoteBox(C.partage.noble?.[0]?.q, C.partage.noble?.[0]?.url, C.partage.noble?.[0]?.title)}</p>
                ${fin ? `<p>${esc(T('À partir de 1794 (loi du 17 nivôse an II), puis du Code civil (1804), les enfants héritent à parts égales.'))} ${quoteBox(fin.q, fin.url, fin.title)}</p>` : ''}
                <div class="tr-gallery l10r-maps">${maps}</div>
                <p class="muted"><small>${esc(T('Indication tirée de la province et du bailliage de la commune en 1789 (atlas d’Ancien Régime) et de la ligne La Rochelle–Genève : les limites suivaient des paroisses, à vérifier dans le texte de la coutume.'))}</small></p>${succBtn}`)}
            ${srcLine(rg.title, 'CC BY-SA 4.0', rg.url, ` · <small>${link('https://github.com/t-fressin/atlas-ancien-regime', T('atlas d’Ancien Régime (CC BY-SA 4.0) ↗'))}</small>`)}`;
    }

    /* ═════════════ 🧂 le sel de son vivant ═════════════ */
    function selHtml(R, L) {
        const S = R?.sel; if (!S || !L.by) return '';
        const rows = S.after.filter(x => x.y2 >= L.by && x.y1 <= L.end); if (!rows.length) return '';
        const f = rows[0];
        return `<p class="cplus-lead">🧂 ${esc(T(f.t))}</p>${quoteBox(f.q, f.url, f.title)}${rows.length > 1 ? more(rows.slice(1).map(x => `<p>${esc(T(x.t))} ${quoteBox(x.q, x.url, x.title)}</p>`).join(''), rows.length - 1) : ''}${srcLine(f.title, 'CC BY-SA 4.0', f.url)}`;
    }

    /* ═════════════ 💒 les temps clos ═════════════ */
    function marriagesClosed(P) {
        return (P?.events || []).filter(e => e.kind === 'marriage' && /^\d{4}-\d\d-\d\d$/.test(e.date || '')).map(e => { const [y, m, d] = e.date.split('-').map(Number); return {e, y, m, d, t: tempsClos(y, m, d)}; }).filter(x => x.t);
    }
    function tempsClosHtml(R, P) {
        const list = marriagesClosed(P), TC = R?.tempsclos; if (!list.length || !TC) return '';
        const f = list[0];
        const lead = T('Son mariage du {d} tombe pendant {k} ({p}) : un « temps clos » où l’Église ne célébrait pas de noces. Ce n’est pas forcément une erreur : l’évêque pouvait donner une dispense, souvent notée dans l’acte.', {d: dateFr(f), k: T(CLOS_NAME[f.t.kind]), p: periodTxt(f.t)});
        return `<p class="cplus-lead">💒 ${esc(lead)}</p>${quoteBox(TC.rule.q, TC.rule.url, TC.rule.title)}${more(`<p>${quoteBox(TC.dispense.q, TC.dispense.url, TC.dispense.title)}</p>
            ${list.length > 1 ? `<ul class="l10r-facts">${list.slice(1).map(x => `<li>${esc(T('Mariage du {d} : {k}', {d: dateFr(x), k: T(CLOS_NAME[x.t.kind])}))}</li>`).join('')}</ul>` : ''}
            <p class="muted"><small>${esc(T('À vérifier : la date est-elle celle du mariage ou celle des fiançailles, et dans quel calendrier (julien avant décembre 1582) ?'))}</small></p>`)}${srcLine(TC.rule.title, T('domaine public, texte sur Wikisource'), TC.rule.url)}`;
    }
    /** 💒 les mariages par mois d'une commune (toutes les fiches de la base) */
    function monthCounts(M) {
        const c = Array(12).fill(0), closed = {avent: 0, careme: 0}; let n = 0;
        for (const s of M?.dates || []) { const [y, m, d] = s.split('-').map(Number); c[m - 1]++; n++; const t = tempsClos(y, m, d); if (t) closed[t.kind]++; }
        for (const [, m] of M?.months || []) { c[m - 1]++; n++; }
        return {c, n, closed, dated: (M?.dates || []).length};
    }
    function mariagesHtml(R, M, pl) {
        const k = monthCounts(M); if (k.n < 5) return '';
        const max = Math.max(...k.c), low = k.c.map((v, i) => [v, i]).filter(([v]) => v <= max * 0.25).map(([, i]) => T(MONTHS[i]));
        const lead = T('{n} mariages notés à {p} dans ta base : {m} en temps clos (Avent ou Carême).', {n: k.n, p: placeName(pl), m: k.closed.avent + k.closed.careme});
        const bars = k.c.map((v, i) => `<div class="l10r-bar${['mars', 'décembre'].includes(MONTHS[i]) ? ' is-clos' : ''}" title="${esc(`${T(MONTHS[i])} : ${v}`)}"><span style="height:${max ? Math.round(100 * v / max) : 0}%"></span><small>${esc(T(MONTHS[i]).slice(0, 3))}</small></div>`).join('');
        const TC = R?.tempsclos;
        return `<p class="cplus-lead">💒 ${esc(lead)}</p><div class="l10r-bars" role="img" aria-label="${esc(T('Mariages par mois'))}">${bars}</div>
            ${more(`<p>${esc(T('Peu de mariages en {m} : on ne se mariait pas pendant l’Avent (décembre) ni pendant le Carême (février-mars-avril, selon la date de Pâques) ; on évitait aussi les grands travaux des champs (moissons, vendanges).', {m: listFr(low) || '—'}))}</p>
                ${TC ? quoteBox(TC.rule.q, TC.rule.url, TC.rule.title) : ''}<p class="muted"><small>${esc(T('Les temps clos sont calculés pour chaque année (date de Pâques, calendrier julien avant 1583). {d} mariages ont un jour précis.', {d: k.dated}))}</small></p>`)}
            ${TC ? srcLine(TC.rule.title, T('domaine public, texte sur Wikisource'), TC.rule.url) : ''}`;
    }
    function yearClosedHtml(R, y) {
        const rows = closedTimes(y).map(t => ({kind: t.kind, from: civil(t.from, y), to: civil(t.to, y)})), e = civil(easterJdn(y), y);
        return `<p class="cplus-lead">💒 ${esc(T('En {y}, Pâques tombe le {e} : pas de noces {a}, ni {b}, ni {c}.', {y, e: dayFr(e.m, e.d), a: periodTxt(rows[0]), b: periodTxt(rows[1]), c: periodTxt(rows[2])}))}</p>
            ${R?.tempsclos ? `${quoteBox(R.tempsclos.rule.q, R.tempsclos.rule.url, R.tempsclos.rule.title)}${srcLine(R.tempsclos.rule.title, T('domaine public, texte sur Wikisource'), R.tempsclos.rule.url)}` : ''}${julian(y) ? `<p class="muted"><small>${esc(T('Dates dans le calendrier julien.'))}</small></p>` : ''}`;
    }

    /* ═════════════ 🌦️ les dictons du jour ═════════════ */
    const dayKey = (m, d) => `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayUrl = Dd => `https://fr.wikipedia.org/wiki/${encodeURIComponent(String(Dd.t).replace(/ /g, '_'))}#Dictons`;
    function dictonsHtml(J, m, d, {who = ''} = {}) {
        const Dd = J?.days?.[dayKey(m, d)]; if (!Dd?.d?.length) return '';
        const f = Dd.d[0];
        const lead = who ? T('{w} le {j} : « {t} »', {w: who, j: dayFr(m, d), t: f[0]}) : T('Le {j} : « {t} »', {j: dayFr(m, d), t: f[0]});
        return `<p class="cplus-lead">🌦️ ${esc(lead)}${f[1] ? ` <small class="muted">${esc(f[1])}</small>` : ''}</p>${Dd.d.length > 1 ? more(`<ul class="l10r-facts">${Dd.d.slice(1).map(x => `<li>« ${esc(x[0])} »${x[1] ? ` <small class="muted">${esc(x[1])}</small>` : ''}</li>`).join('')}</ul>`, Dd.d.length - 1) : ''}
            ${srcLine(T('Wikipédia, « {t} », partie Dictons', {t: Dd.t}), 'CC BY-SA 4.0', dayUrl(Dd))}`;
    }

    /* ═════════════ 🌬️ le vent ═════════════ */
    const ventsOf = (R, dep) => (R?.vents || []).filter(v => v.deps.includes(dep));
    function ventHtml(R, pl) {
        const vs = ventsOf(R, depOf(pl?.insee)); if (!vs.length) return '';
        const f = vs[0];
        const lead = vs.length === 1 ? T('À {p}, on connaît {v}.', {p: placeName(pl), v: f.n}) : T('À {p}, on connaît {v}.', {p: placeName(pl), v: listFr(vs.map(v => v.n))});
        return `<p class="cplus-lead">🌬️ ${esc(lead)} ${esc(f.what || '')}</p>${quoteBox(f.q, f.url, f.title)}${vs.length > 1 ? more(vs.slice(1).map(v => `<p><b>${esc(v.n)}</b> : ${esc(v.what || '')} ${quoteBox(v.q, v.url, v.title)} ${v.qid ? link(`https://www.wikidata.org/wiki/${v.qid}`, T('Wikidata ↗')) : ''}</p>`).join(''), vs.length - 1) : ''}
            ${srcLine(f.title, 'CC BY-SA 4.0', f.url, f.qid ? ` · <small>${link(`https://www.wikidata.org/wiki/${f.qid}`, 'Wikidata (CC0) ↗')}</small>` : '')}
            <p class="muted"><small>${esc(T('D’après le département de la commune et la phrase de Wikipédia qui dit où il souffle.'))}</small></p>`;
    }

    /* ═════════════ 🏞️ le pays ═════════════ */
    function paysOf(R, pl) {
        if (!R?.pays || !pl?.insee) return {sure: [], near: []};
        const byQ = new Map(R.pays.map(p => [p.q, p]));
        const sure = (R.pays_links?.[pl.insee] || []).map(q => byQ.get(q)).filter(Boolean);
        const dep = depOf(pl.insee);
        let near = R.pays.filter(p => !sure.includes(p) && p.deps.includes(dep)).map(p => ({...p, km: pl.lat != null && p.lat != null ? km(pl.lat, pl.lon, p.lat, p.lon) : null}));
        near.sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9) || a.n.localeCompare(b.n, 'fr'));
        return {sure, near};
    }
    const paysLink = p => `${esc(p.n)} ${link(p.wp || `https://www.wikidata.org/wiki/${p.q}`, '↗', p.wp ? 'Wikipédia' : 'Wikidata')}`;
    function paysHtml(R, pl) {
        const {sure, near} = paysOf(R, pl); if (!sure.length && !near.length) return '';
        const close = near.filter(p => p.km != null && p.km <= 25);
        let lead;
        if (sure.length) lead = `${esc(T('{p} est dans', {p: placeName(pl)}))} ${sure.map(paysLink).join(', ')}${sure[0].d ? ` <small class="muted">(${esc(sure[0].d)})</small>` : ''}.`;
        else if (close.length) lead = `${esc(T('{p} est sans doute dans', {p: placeName(pl)}))} ${paysLink(close[0])} <small class="muted">(${esc(T('centre du pays à {k} km', {k: Math.round(close[0].km)}))})</small>.`;
        else lead = `${esc(T('Les pays traditionnels de son département :'))} ${near.slice(0, 4).map(paysLink).join(', ')}${near.length > 4 ? '…' : ''}`;
        const rest = (sure.length ? near : near.slice(close.length ? 1 : 4)).slice(0, 30);
        return `<p class="cplus-lead">🏞️ ${lead}</p>${rest.length ? more(`<p>${esc(T('Autres pays du département :'))}</p><ul class="l10r-facts">${rest.map(p => `<li>${paysLink(p)}${p.km != null ? ` <small class="muted">${esc(T('à {k} km', {k: Math.round(p.km)}))}</small>` : ''}${p.d ? ` <small class="muted">— ${esc(p.d)}</small>` : ''}</li>`).join('')}</ul>
            <p class="muted"><small>${esc(T('« Sans doute » : la commune est proche du centre du pays, mais Wikidata ne dit pas qu’elle en fait partie.'))}</small></p>`, rest.length) : ''}
            ${srcLine('Wikidata, « région naturelle de France »', 'CC0 1.0', 'https://www.wikidata.org/wiki/Q572995')}`;
    }

    /* ═════════════ la vie d'une personne (l9b_person, déjà fourni par le lot 9) ═════════════ */
    function lifeOf(P) {
        const ev = P?.events || [], first = kinds => ev.filter(e => kinds.includes(e.kind) && e.year).sort((a, b) => a.year - b.year)[0] || null;
        const b = first(['birth']) || first(['bapt']), d = first(['death']) || first(['burial']);
        const by = b?.year || null, dy = d?.year || null, now = new Date().getFullYear();
        const placeOf = e => (e?.place ? P.places?.[e.place] || null : null);
        const places = Object.values(P?.places || {});
        return {by, dy, end: dy || (by ? Math.min(by + 90, now) : null), birthEv: b, deathEv: d, fem: P?.gender === 'female', placeOf, places, home: placeOf(b) || places.find(p => p.insee) || null};
    }
    const PERSON_ORDER = ['coutume', 'sel', 'tempsclos', 'dictons', 'vent', 'pays'];
    async function personParts(P, want) {
        const L = lifeOf(P), out = {};
        const [R, J] = await Promise.all([tryLoad('regles'), want('dictons') && tryLoad('jours')]);
        if (!R) return out;
        const pl = L.home?.insee ? L.home : L.places.find(p => p.insee) || null;
        if (want('coutume') && pl && L.by && L.by < 1804) { const AR = await loadAR().catch(() => null); out.coutume = coutumeHtml(R, AR, pl, {person: {id: P.id, title: `${P.first || ''} ${P.last || ''}`.trim()}}); }
        if (want('sel')) out.sel = selHtml(R, L);
        if (want('tempsclos')) out.tempsclos = tempsClosHtml(R, P);
        if (want('dictons') && J && L.birthEv && /^\d{4}-\d\d-\d\d$/.test(L.birthEv.date || '')) { const [, m, d] = L.birthEv.date.split('-').map(Number); out.dictons = dictonsHtml(J, m, d, {who: T(L.birthEv.kind === 'bapt' ? (L.fem ? 'Baptisée' : 'Baptisé') : (L.fem ? 'Née' : 'Né'))}); }
        if (want('vent') && pl) out.vent = ventHtml(R, pl);
        if (want('pays') && pl) out.pays = paysHtml(R, pl);
        return out;
    }
    const line = (k, html) => (html ? `<div class="tr-line l10r-line" data-l10r-line="${k}">${html}</div>` : '');
    async function fillPerson(host, id, only = null) {
        const want = k => (only ? only.includes(k) : on(k));
        const P = await ask('l9b_person', {id});
        if (!P?.ok || P.kind === 'animal') { host.innerHTML = ''; return P; }
        const out = await personParts(P, want);
        host.innerHTML = PERSON_ORDER.map(k => line(k, out[k])).join('');
        const card = host.closest?.('section.card'); if (card) card.hidden = !host.querySelector('.l10r-line');
        return P;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.regles_vie = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !PERSON_ORDER.some(on)) return '';
        return A().card(index, T('⚖️ Les règles de sa vie'), '', `<div class="tr-block l10r-block" data-l10r-person="${Number(p.id)}"></div>`, 'span-12').replace(/^(\s*<section class="card[^"]*")/, '$1 hidden');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => { W.document?.querySelectorAll('#workspace [data-l10r-person]:not([data-l10r-done])').forEach(h => { h.dataset.l10rDone = '1'; fillPerson(h, Number(h.dataset.l10rPerson)).catch(() => {}); }); });

    /* ═════════════ un lieu : fiche d'un village, monographie, 🧰 Données ═════════════ */
    const PLACE_PARTS = {coutume: '⚖️ La coutume (avant 1789)', mariages: '💒 Les mariages par mois', vent: '🌬️ Le vent du pays', pays: '🏞️ Le pays traditionnel'};
    const PLACE_ON = {coutume: 'coutume', mariages: 'tempsclos', vent: 'vent', pays: 'pays'};
    async function resolvePlace(pl) {
        if (pl?.insee && pl.lat != null) return pl;
        const q = Object.fromEntries(Object.entries({place_id: Number(pl?.id) || '', name: pl?.name || '', insee: pl?.insee || '', lat: pl?.lat ?? '', lon: pl?.lon ?? '', county: pl?.county || '', country: pl?.country || ''}).filter(([, v]) => v !== '' && v != null));
        const r = await ask('l9b_place', q);
        return r?.place ? {...pl, ...r.place, name: pl?.name || r.place.name} : pl;
    }
    async function placePart(k, pl) {
        const R = await tryLoad('regles'); if (!R) return '';
        if (k === 'coutume') return coutumeHtml(R, await loadAR().catch(() => null), pl);
        if (k === 'vent') return ventHtml(R, pl);
        if (k === 'pays') return paysHtml(R, pl);
        if (k === 'mariages') { const M = await ask('l10_mariages', Object.fromEntries(Object.entries({place_id: Number(pl?.id) || '', insee: pl?.insee || '', name: pl?.name || ''}).filter(([, v]) => v !== ''))); return M?.ok ? mariagesHtml(R, M, pl) : ''; }
        return '';
    }
    const panel = (id, title, body) => `<section class="maintenance-panel cplus-panel tr-panel l10r-panel" data-l10r-part="${id}"><h3>${esc(title)}</h3>${body}</section>`;
    async function placeInto(host, place, {parts = null} = {}) {
        const want = k => (parts ? parts.includes(k) : on(PLACE_ON[k]));
        const pl = await resolvePlace(place);
        const keys = Object.keys(PLACE_PARTS).filter(want);
        const html = await Promise.all(keys.map(k => placePart(k, pl).catch(() => '')));
        if (host.isConnected === false) return pl;
        host.innerHTML = keys.map((k, i) => (html[i] ? panel(k, T(PLACE_PARTS[k]), html[i]) : '')).join('');
        return pl;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(), lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || village.querySelector('[data-cad-insee]')?.dataset.cadInsee || ''};
    }
    // ⚙️ « Organiser la fiche » d'un village (heritage-more.js) : cette partie y est rangée, masquée, à la largeur choisie
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'l10r_place', host: '[data-l10r-host]', icon: '⚖️', label: 'Les règles de sa vie', group: 'Son histoire', enabled: () => Object.keys(PLACE_PARTS).some(k => on(PLACE_ON[k]))});
    function decorate() {
        const ws = W.document?.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-l10r])'); if (!village) return;
        village.dataset.l10r = '1';
        if (!Object.keys(PLACE_PARTS).some(k => on(PLACE_ON[k]))) return;
        const place = villagePlace(village); if (!place.id && !place.insee && !place.name) return;
        const anchor = village.querySelector('[data-l9-host]') || village.querySelector('[data-tr-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="tr-place l10r-place" data-l10r-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-l10r-host]'), place).catch(() => {});
    }
    if (W.document && typeof MutationObserver !== 'undefined') {
        let pending = 0;
        new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; try { decorate(); } catch (e) { console.error(e); } }); }).observe(W.document.documentElement, {childList: true, subtree: true});
    }

    /* ═════════════ ✂️ Cappelli ═════════════ */
    const nAbbr = s => fold(s).replace(/j/g, 'i').replace(/v/g, 'u').replace(/\s+/g, '');
    /** une abréviation est presque toujours le mot dont on a ôté des lettres : « joes » est une sous-suite de « joannes » */
    const subseq = (a, b) => { let i = 0; for (const ch of b) { if (ch === a[i]) i++; if (i === a.length) return true; } return i === a.length; };
    function cappelliSearch(C, q, limit = 60) {
        const k = nAbbr(q); if (!C?.rows || !k) return [];
        const out = [];
        for (const [a, e, p] of C.rows) {
            const na = nAbbr(a), ne = nAbbr(e.split(/[ ,]/)[0]);
            let s = 0;
            if (na === k) s = 100; else if (ne === k) s = 90; else if (ne.startsWith(k) && k.length >= 3) s = 60;
            else if (k.length >= 3 && ne[0] === k[0] && ne.length > k.length && subseq(k, ne)) s = 40 - Math.min(20, ne.length - k.length);
            if (s) out.push({a, e, p, s});
        }
        out.sort((x, y) => y.s - x.s || x.e.localeCompare(y.e));
        const seen = new Set(); return out.filter(x => { const key = fold(x.a + '|' + x.e); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, limit);
    }
    function cappelliHtml(C, q) {
        if (!C) return `<p class="muted">${esc(T('Le dictionnaire de Cappelli n’a pas pu se charger.'))}</p>`;
        const src = srcLine('Adriano Cappelli, Lexicon abbreviaturarum, Leipzig, 1901 (Wikimedia Commons)', T('domaine public'), C.page_url.replace('{p}', '1'), ` · <small>${esc(T(C.note))}</small>`);
        if (!String(q || '').trim()) return `<p class="cplus-lead">✂️ ${esc(T('Écris une abréviation telle que tu la lis (« Joes », « dnus », « pbr »), ou le mot entier (« Joannes ») : tu verras ses abréviations, avec la page du dictionnaire de Cappelli.'))}</p>${src}`;
        const rows = cappelliSearch(C, q);
        if (!rows.length) return `<p class="muted">${esc(T('Rien pour « {q} ». Essaie sans les signes (« dns » pour « dñs »), ou le mot entier.', {q}))}</p>${src}`;
        const best = rows[0];
        const lead = best.s >= 90 ? T('« {a} » : {e}', {a: q, e: best.e}) : T('« {a} » peut se lire : {e}', {a: q, e: listFr([...new Set(rows.slice(0, 3).map(r => r.e))])});
        return `<p class="cplus-lead">✂️ ${esc(lead)}</p><table class="data-table l10r-capp"><thead><tr><th>${esc(T('Abréviation (lue par Cappelli)'))}</th><th>${esc(T('Se lit'))}</th><th>${esc(T('Page'))}</th></tr></thead><tbody>
            ${rows.map(r => `<tr><td><b>${esc(r.a)}</b></td><td>${esc(r.e)}</td><td>${link(C.page_url.replace('{p}', r.p), T('p. {n} ↗', {n: r.p}))} <button type="button" class="link-button" data-l10r-capp-page="${r.p}">${esc(T('voir'))}</button></td></tr>`).join('')}</tbody></table>
            <div data-l10r-capp-img></div>${src}`;
    }

    /* ═════════════ 🖋️ les modèles d'écriture ═════════════ */
    function ecrituresFor(R, year) {
        const L = (R?.ecritures || []).slice();
        if (!year) return L;
        return L.map(e => ({...e, gap: Math.abs(e.y - year)})).filter(e => e.gap <= 60).sort((a, b) => a.gap - b.gap).slice(0, 6);
    }
    function ecrituresHtml(R, year) {
        const L = ecrituresFor(R, year);
        const lead = year ? (L.length ? T('Les modèles d’écriture proches de {y} : regarde les lettres qui te bloquent.', {y: year}) : T('Pas de modèle d’écriture à moins de 60 ans de {y}.', {y: year})) : T('Tous les modèles, du plus ancien au plus récent :');
        return `<p class="cplus-lead">🖋️ ${esc(lead)}</p><div class="tr-gallery l10r-ecr">${L.map(e => `<figure class="tr-photo"><a href="${esc(e.page)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" alt="${esc(`${e.who}, ${e.what}`)}" src="${esc(e.thumb)}" onerror="this.closest('figure').remove()"></a>
            <figcaption><b>${esc(String(e.y))}</b> · ${esc(e.who)} — ${esc(T(e.what))}<br>${e.licence_url ? link(e.licence_url, e.licence) : esc(e.licence)} · ${link(e.page, T('Commons ↗'))}</figcaption></figure>`).join('')}</div>
            <p class="muted"><small>${esc(T('Ce sont les modèles des maîtres écrivains : le curé ou le notaire écrivait plus vite et moins bien, mais les formes des lettres sont les mêmes.'))}</small></p>
            ${srcLine('Wikimedia Commons', T('domaine public ou licence de chaque image'), 'https://commons.wikimedia.org/wiki/Category:Calligraphers_from_France')}`;
    }

    /* ═════════════ 📅 une fête de saint → la vraie date ═════════════ */
    let saintIdx = null;
    function saintIndex(J) {
        if (saintIdx?.J === J) return saintIdx.map;
        const map = new Map();
        for (const [k, v] of Object.entries(J?.days || {})) {
            const [m, d] = k.split('-').map(Number);
            v.s.forEach(([n, desc], i) => { const f = fold(n).split(' '); const key = f[0]; if (!key || key.length < 3) return; if (!map.has(key)) map.set(key, []); map.get(key).push({n, desc, m, d, rank: i, full: fold(n)}); });
        }
        saintIdx = {J, map}; return map;
    }
    /** saintDates(J, 'le jour de la Saint-Médard 1702') → {name, year, list: [{n, desc, m, d, date: {y,m,d}, weekday, julian}]} ou null */
    function saintDates(J, text) {
        const t = fold(text).replace(/\bste?\b/g, m => (m === 'st' ? 'saint' : 'sainte'));
        const yr = Number((t.match(/(?<!\d)(1[0-9]{3})(?!\d)/) || [])[1] || 0);
        const m = t.match(/\bsaintes? ([a-z]+(?: (?:de|d|du|des|la|le) [a-z]+| [a-z]+)?)/); if (!m) return null;
        const words = m[1].split(' '), idx = saintIndex(J), cands = idx.get(words[0]) || [];
        if (!cands.length) return {name: m[1], year: yr, list: []};
        const second = words.slice(1).join(' ').replace(/^(de|d|du|des|la|le) /, '');
        let list = second ? cands.filter(c => c.full.includes(second)) : [];
        if (!list.length) list = cands.filter(c => c.full === words[0] || c.full.split(' ').length <= 3).sort((a, b) => a.rank - b.rank);
        if (!list.length) list = cands;
        let shift = 0; if (/surlendemain/.test(t)) shift = 2; else if (/lendemain/.test(t)) shift = 1; else if (/veille|vigile/.test(t)) shift = -1; else if (/octave/.test(t)) shift = 7;
        const out = list.slice(0, 6).map(c => { if (!yr) return {...c}; const j = jdn(yr, c.m, c.d) + shift; return {...c, date: civil(j, yr), weekday: weekday(j), julian: julian(yr, c.m, c.d)}; });
        return {name: m[1], year: yr, shift, list: out};
    }
    function feteHtml(J, text) {
        if (!String(text || '').trim()) return `<p class="cplus-lead">📅 ${esc(T('Écris la mention de l’acte : « le jour de la Saint-Médard 1702 », « le lendemain de la Sainte-Anne 1650 ».'))}</p>`;
        const main = ext.feastDate ? ext.feastDate(text) : null;
        const r = J ? saintDates(J, text) : null;
        let html = '';
        if (main) html += `<p class="cplus-lead">📅 <b>${esc(main.weekday)} ${esc(main.date)}</b> — ${esc(main.label)}${main.julian ? ` <small class="muted">${esc(T('(calendrier julien)'))}</small>` : ''}</p>`;
        if (r?.list?.length) {
            const rows = r.list.filter(c => !main || dayFr(c.m, c.d) !== main.date.replace(/ \d{4}$/, ''));
            if (rows.length) html += `${main ? `<p>${esc(T('D’autres saints de ce nom, à d’autres jours :'))}</p>` : `<p class="cplus-lead">📅 ${esc(T('« {n} » : selon le saint, ce peut être…', {n: r.name}))}</p>`}<ul class="l10r-facts">${rows.map(c => `<li>${c.date ? `<b>${esc(c.weekday)} ${esc(dateFr(c.date))}</b>` : `<b>${esc(dayFr(c.m, c.d))}</b>`} — ${esc(c.n)} <small class="muted">${esc(c.desc)}</small>${c.date ? ` <button type="button" class="button small secondary" data-l10r-use-date="${esc(dateFr(c.date))}">${esc(T('Utiliser cette date'))}</button>` : ''}</li>`).join('')}</ul>
                ${r.year ? '' : `<p class="muted"><small>${esc(T('Ajoute l’année pour avoir le jour de la semaine.'))}</small></p>`}
                ${srcLine(T('Wikipédia, pages des jours (partie « Saints »)'), 'CC BY-SA 4.0', 'https://fr.wikipedia.org/wiki/Calendrier_liturgique_romain', ` · <small>${esc(T('Le calendrier des saints a changé selon les époques et les diocèses : choisis le saint qui convient.'))}</small>`)}`;
        }
        return html || `${window.LCNDA_APP.empty(T('Aucune fête reconnue (il faut le nom du saint ; l’année donne le jour exact).'))}`;
    }
    // la date d'un événement : si le calcul habituel (heritage-tools.js) ne reconnaît pas la fête, les saints du jour proposent leurs dates
    if (W.document) {
        W.document.addEventListener('input', event => {
            const input = event.target.closest?.('#event-form [name=date_text]'); if (!input || !on('fetes')) return;
            setTimeout(async () => {
                const box = input.parentElement; if (!box) return;
                box.querySelector('.l10r-feast-hint')?.remove();
                if (box.querySelector('.h-feast-hint:not(.l10r-feast-hint)') || !/\bs(ain)?te?s?[\s.-]/i.test(input.value) || !/(?<!\d)1\d{3}(?!\d)/.test(input.value)) return;
                const J = await tryLoad('jours'); const r = J ? saintDates(J, input.value) : null;
                if (!r?.list?.length || !r.year || box.querySelector('.h-feast-hint')) return;
                const c = r.list[0];
                box.querySelector('[name=date_text]')?.insertAdjacentHTML('afterend', `<div class="h-feast-hint l10r-feast-hint" data-original="${esc(input.value)}">📅 ${esc(c.n)} = <strong>${esc(c.weekday)} ${esc(dateFr(c.date))}</strong>${c.julian ? ` <small>(${esc(T('julien'))})</small>` : ''}${r.list.length > 1 ? ` <small class="muted">${esc(T('ou {n} autres saints de ce nom', {n: r.list.length - 1}))}</small>` : ''} <button type="button" class="button small secondary" data-h-feast-use="${esc(dateFr(c.date))}">${esc(T('Utiliser cette date'))}</button></div>`);
            }, 0);
        });
    }

    /* ═════════════ 📚 les mots anciens (en ligne : Wiktionnaire, Wikisource) ═════════════ */
    const WT_CACHE = 'lcnda-l10r-mots';
    function cacheGet(k) { try { const c = JSON.parse(W.localStorage?.getItem(WT_CACHE) || '{}'); return c[k] && Date.now() - c[k].at < 90 * 86400e3 ? c[k].v : null; } catch (_) { return null; } }
    function cachePut(k, v) { try { const c = JSON.parse(W.localStorage?.getItem(WT_CACHE) || '{}'); c[k] = {at: Date.now(), v}; const keys = Object.keys(c); if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(x => delete c[x]); W.localStorage?.setItem(WT_CACHE, JSON.stringify(c)); } catch (_) {} }
    const wtClean = s => String(s).replace(/<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>/g, '').replace(/\{\{(?:lien|w)\|([^|}]+)[^}]*\}\}/g, '$1').replace(/\{\{([^|}]+)\|fr\}\}/g, '($1)').replace(/\{\{[^{}]*\}\}/g, '').replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/'{2,}/g, '').replace(/\s+/g, ' ').trim();
    /** les sens d'un mot dans le Wiktionnaire : [{t, old}] ; old = marqué vieilli, vieux, désuet, archaïsme… */
    function wiktSenses(wikitext) {
        const fr = (String(wikitext).split(/^== \{\{langue\|fr\}\} ==/m)[1] || '').split(/^== \{\{langue\|/m)[0];
        const out = [];
        for (const l of fr.split('\n')) {
            if (!/^#[^*:#]/.test(l)) continue;
            const old = /\{\{(vieilli|vieux|désuet|archaïsme|archaïque|ancien|histoire|droit ancien|Ancien Régime|féodalité)\b/i.test(l);
            const t = wtClean(l.replace(/^#\s*/, '')); if (t) out.push({t, old});
        }
        return out;
    }
    async function wget(url) { const r = await fetch(url, {headers: {'Api-User-Agent': 'LCNDA-genealogie/1.0'}}); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
    const WS_SRC = [['Page:Le dictionnaire de l\'Academie françoise', 'Académie française'], ['Dictionnaire de l’Académie française/', 'Académie française'], ['Page:Godefroy - Dictionnaire', 'Godefroy, ancienne langue française'], ['Dictionnaire de l’ancienne langue française', 'Godefroy, ancienne langue française']];
    async function motsLookup(word) {
        const w = String(word || '').trim().toLowerCase(); if (!w) return null;
        const c = cacheGet(w); if (c) return {...c, cached: true};
        const out = {word: w, wikt: [], ws: [], at: Date.now()};
        try { const r = await wget(`https://fr.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(w)}&prop=wikitext&redirects=1&format=json&origin=*`); if (r?.parse) { out.wikt = wiktSenses(r.parse.wikitext['*']).slice(0, 10); out.wiktTitle = r.parse.title; } } catch (e) { out.err = e.message; }
        for (const [pre, label] of WS_SRC) {
            try {
                const r = await wget(`https://fr.wikisource.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`"${w}" prefix:${pre}`)}&srlimit=4&format=json&origin=*`);
                for (const x of r?.query?.search || []) out.ws.push({title: x.title, label, year: Number((x.title.match(/1[6-9]\d\d/) || [])[0]) || null, snippet: String(x.snippet).replace(/<[^>]+>/g, '').replace(/&#039;/g, '’').replace(/&quot;/g, '"').replace(/&amp;/g, '&').slice(0, 300)});
            } catch (e) { out.err = out.err || e.message; }
        }
        if (!out.err) cachePut(w, out);
        return out;
    }
    function motsKnownHtml(word) {
        const L = W.LCNDA_AIDE_LECTURE; if (!L?.search) return '';
        const hits = L.search(word, {limit: 8}).filter(x => x.type === 'entry' && x.score >= 70 && ['vieux', 'mot', 'metier', 'formule', 'parente'].includes(x.item.k));
        if (!hits.length) return '';
        return `<p>${esc(T('Déjà dans le dictionnaire de l’app :'))}</p><ul class="l10r-facts">${hits.map(h => `<li><b>${esc(h.item.t)}</b> : ${esc(h.item.d)}${h.item.k === 'metier' ? ` <small class="muted">${esc(T('(métier : voir aussi 🔨 Métiers)'))}</small>` : ''}</li>`).join('')}</ul>`;
    }
    function motsHtml(r, year) {
        if (!r) return '';
        const wsl = r.ws.slice().sort((a, b) => (year ? Math.abs((a.year || 1900) - year) - Math.abs((b.year || 1900) - year) : (a.year || 0) - (b.year || 0)));
        const old = r.wikt.filter(s => s.old), lead = old.length ? T('« {w} », sens ancien : {d}', {w: r.word, d: old[0].t}) : r.wikt.length ? T('« {w} » : {d}', {w: r.word, d: r.wikt[0].t}) : wsl.length ? T('« {w} » se trouve dans {n} page(s) de dictionnaires anciens.', {w: r.word, n: wsl.length}) : T('Rien trouvé en ligne pour « {w} ».', {w: r.word});
        const wiktUrl = `https://fr.wiktionary.org/wiki/${encodeURIComponent(r.wiktTitle || r.word)}`;
        return `${motsKnownHtml(r.word)}<p class="cplus-lead">📚 ${esc(lead)}</p>
            ${r.wikt.length ? `<ul class="l10r-facts">${r.wikt.map(s => `<li>${s.old ? `<span class="tr-pill">${esc(T('ancien'))}</span> ` : ''}${esc(s.t)}</li>`).join('')}</ul>${srcLine(T('Wiktionnaire, « {w} »', {w: r.wiktTitle || r.word}), 'CC BY-SA 4.0', wiktUrl)}` : ''}
            ${wsl.length ? `<p>${esc(year ? T('Dans les dictionnaires anciens (le plus proche de {y} d’abord) :', {y: year}) : T('Dans les dictionnaires anciens :'))}</p><ul class="l10r-facts">${wsl.map(x => `<li><b>${esc(x.label)}${x.year ? ` (${x.year})` : ''}</b> : « ${esc(x.snippet)} » ${link(`https://fr.wikisource.org/wiki/${encodeURIComponent(x.title.replace(/ /g, '_'))}`, T('Wikisource ↗'))}</li>`).join('')}</ul>
                ${srcLine(T('Wikisource (dictionnaires du domaine public)'), T('textes du domaine public, pages CC BY-SA 4.0'), 'https://fr.wikisource.org/wiki/Wikisource:Dictionnaires')}` : ''}
            <p class="muted"><small>${esc(T('Les dictionnaires de l’Académie (1694, 1762, 1835) ne sont transcrits que par morceaux sur Wikisource : feuillette les scans :'))} ${link('https://fr.wikisource.org/wiki/Dictionnaire_de_l%E2%80%99Acad%C3%A9mie_fran%C3%A7aise/1re_%C3%A9d.,_1694', '1694')} · ${link('https://fr.wikisource.org/wiki/Dictionnaire_de_l%E2%80%99Acad%C3%A9mie_fran%C3%A7aise/4e_%C3%A9d.,_1762', '1762')} · ${link('https://fr.wikisource.org/wiki/Dictionnaire_de_l%E2%80%99Acad%C3%A9mie_fran%C3%A7aise/6e_%C3%A9d.,_1835', '1835')} · ${link('https://fr.wikisource.org/wiki/Dictionnaire_de_l%E2%80%99ancienne_langue_fran%C3%A7aise_et_de_tous_ses_dialectes_du_IXe_au_XVe_si%C3%A8cle', 'Godefroy')}</small></p>
            ${r.err ? `<p class="muted"><small>${esc(T('Pas de connexion à Internet (ou site indisponible) : réessaie plus tard.'))}</small></p>` : ''}
            <p class="muted"><small>${esc(T('Ce qui part sur Internet : seulement le mot cherché.'))}${r.cached ? ` ${esc(T('(réponse gardée)'))}` : ''}</small></p>`;
    }

    /* ═════════════ 📖 Aide à la lecture : les onglets en plus ═════════════ */
    function yearField(st) { return `<label class="l10r-year">${esc(T('Année de l’acte'))} <input type="number" min="1300" max="1950" inputmode="numeric" data-l10r-year value="${esc(st.year || '')}" placeholder="1750"></label>`; }
    const tabState = {year: ''};
    function bindYear(host, redraw) { host.querySelector('[data-l10r-year]')?.addEventListener('change', e => { tabState.year = e.target.value; redraw(); }); }
    async function renderCappelli(host, {q}) { host.innerHTML = '<p class="muted">…</p>'; host.innerHTML = cappelliHtml(await tryLoad('cappelli'), q); }
    async function renderEcritures(host, {year}) {
        if (year && !tabState.year) tabState.year = String(year);
        const R = await tryLoad('regles'); const y = Number(tabState.year) || null;
        host.innerHTML = `${yearField(tabState)}${ecrituresHtml(R, y)}`; bindYear(host, () => renderEcritures(host, {}));
    }
    let motsTimer = 0;
    async function renderMots(host, {q, year}) {
        if (year && !tabState.year) tabState.year = String(year);
        // un seul mot part sur Internet : une phrase (venue d’un autre onglet, « le jour de la Sainte-Blandine 1750 ») n’est pas cherchée
        const words = String(q || '').trim().split(/\s+/).filter(Boolean), w = words.length === 1 ? words[0] : '';
        if (!w) { host.innerHTML = `${yearField(tabState)}<p class="cplus-lead">📚 ${esc(T('Écris un mot ancien (« bru », « ondoyer », « chartrier ») : son sens dans le Wiktionnaire et dans les dictionnaires anciens (Académie, Godefroy), en ligne.'))}</p>`; bindYear(host, () => renderMots(host, {q})); return; }
        host.innerHTML = `${yearField(tabState)}${motsKnownHtml(w)}${window.LCNDA_UI.spinner(T('Recherche en ligne…'))}`; bindYear(host, () => renderMots(host, {q}));
        clearTimeout(motsTimer);
        motsTimer = setTimeout(async () => { const r = await motsLookup(w); if (!host.isConnected && host.parentNode) return; host.innerHTML = `${yearField(tabState)}${motsHtml(r, Number(tabState.year) || null)}`; bindYear(host, () => renderMots(host, {q})); }, 500);
    }
    async function renderFetes(host, {q}) { host.innerHTML = feteHtml(await tryLoad('jours'), q); }
    const LA_TABS = [
        {id: 'l10r_cappelli', part: 'cappelli', label: T('✂️ Abréviations latines'), render: renderCappelli},
        {id: 'l10r_ecritures', part: 'ecritures', label: T('🖋️ Écritures d’époque'), render: renderEcritures},
        {id: 'l10r_mots', part: 'mots', label: T('📚 Mots anciens'), render: renderMots},
        {id: 'l10r_fetes', part: 'fetes', label: T('📅 Fête → date'), render: renderFetes}];
    ext.readingAidTabs = ext.readingAidTabs || [];
    for (const t of LA_TABS) ext.readingAidTabs.push({id: t.id, get label() { return t.label; }, enabled: () => on(t.part), render: (host, o = {}) => t.render(host, o)});

    /* ═════════════ les clics ═════════════ */
    if (W.document) {
        W.document.addEventListener('click', async e => {
            const s = e.target.closest?.('[data-l10r-succ]');
            if (s) { e.preventDefault(); ext.successions?.edit?.(null, {person: {id: Number(s.dataset.l10rSucc), title: s.dataset.title || ''}}); return; }
            const p = e.target.closest?.('[data-l10r-capp-page]');
            if (p) {
                e.preventDefault(); const C = await tryLoad('cappelli'); const box = p.closest('.l10r-capp')?.parentElement?.querySelector('[data-l10r-capp-img]'); if (!C || !box) return;
                const n = p.dataset.l10rCappPage;
                box.innerHTML = `<figure class="tr-photo l10r-capp-page"><a href="${esc(C.page_url.replace('{p}', n))}" target="_blank" rel="noopener noreferrer"><img loading="lazy" alt="${esc(T('Cappelli, page {n}', {n}))}" src="${esc(C.thumb.replace(/\{p\}/g, n))}" onerror="this.closest('figure').innerHTML='${esc(T('Image indisponible (hors ligne ?)'))}'"></a><figcaption>${esc(T('Cappelli, 1901, page {n} du fichier — domaine public', {n}))} · ${link(C.page_url.replace('{p}', n), T('Commons ↗'))}</figcaption></figure>`;
                return;
            }
            const u = e.target.closest?.('[data-l10r-use-date]');
            if (u) { const inp = W.document.querySelector('#event-form [name=date_text]'); if (inp) { inp.value = u.dataset.l10rUseDate; inp.dispatchEvent(new Event('change', {bubbles: true})); A().toast?.(T('Date mise dans l’événement.')); } else { try { await W.navigator.clipboard.writeText(u.dataset.l10rUseDate); A().toast?.(T('Date copiée.')); } catch (_) {} } return; }
            if (e.target.closest?.('[data-l10r-clear]')) { try { const old = W.localStorage?.getItem(WT_CACHE); W.localStorage?.removeItem(WT_CACHE); drawSettings(); A().undoToast?.(T('Mots gardés effacés.'), {undo: () => { try { if (old) W.localStorage?.setItem(WT_CACHE, old); } catch (_) {} drawSettings(); }}); } catch (_) {} }
        });
        W.document.addEventListener('change', e => {
            const t = e.target.closest?.('[data-l10r-tg]'); if (!t || !e.target.matches('input')) return;
            const s = settings(), k = t.dataset.l10rTg, was = s[k]; s[k] = e.target.checked; save(s);
            A().undoToast?.(e.target.checked ? T('Partie affichée.') : T('Partie cachée.'), {undo: () => { const x = settings(); x[k] = was; save(x); drawSettings(); }});
        });
    }

    /* ═════════════ 🌍 « Où chercher » : le texte de sa coutume ═════════════ */
    const oc = ext.ouChercher = ext.ouChercher || {};
    (oc.afterRedraw = oc.afterRedraw || []).push((view, body) => {
        if (!on('coutume') || !view?.pid || !body || body.querySelector('[data-l10r-ouc]')) return;
        Promise.all([ask('l9b_person', {id: view.pid}), tryLoad('regles'), loadAR().catch(() => null)]).then(([P, R, AR]) => {
            if (!P?.ok || !R || !AR || body.querySelector('[data-l10r-ouc]')) return;
            const L = lifeOf(P); if (!L.by || L.by >= 1804) return;
            const pl = L.home?.insee ? L.home : L.places.find(p => p.insee); const c = coutumeOf(R, AR, pl?.insee); if (!c) return;
            const html = `<details class="ouc-guides l10r-ouc" data-l10r-ouc><summary>⚖️ ${esc(T('Le texte de sa coutume'))} <small class="muted">${esc(c.named ? c.named.n : T(R.coutume.regimes[c.regime].label))}</small></summary>
                <ul class="dp-lines"><li class="dp-line"><span class="dp-ico" aria-hidden="true">📜</span><div>${esc(T('Ce que disait la coutume (héritage, dot, douaire) : l’article de Wikipédia cite les éditions anciennes, souvent numérisées.'))} ${link((c.named || R.coutume.regimes[c.regime]).url)}</div></li>
                ${(R.coutume.maps || []).slice(0, 1).map(m => `<li class="dp-line"><span class="dp-ico" aria-hidden="true">🗺️</span><div>${esc(T(m.title))} ${link(m.page)}</div></li>`).join('')}
                <li class="dp-line"><span class="dp-ico" aria-hidden="true">🏛️</span><div>${esc(T('Les partages et testaments sont chez le notaire : archives départementales, série E (minutes notariales).'))}</div></li></ul></details>`;
            const after = body.querySelector('[data-l9-ouc-nourrice]') || body.querySelector('[data-dp-ouc]') || body.querySelector('.ouc-facts');
            if (after) after.insertAdjacentHTML('afterend', html); else body.insertAdjacentHTML('afterbegin', html);
        }).catch(() => {});
    });

    /* ═════════════ 📜 Monographie de commune ═════════════ */
    const monoPlace = pl => ({id: Number(pl?.id) || 0, name: pl?.name || '', lat: pl?.latitude ?? pl?.lat ?? null, lon: pl?.longitude ?? pl?.lon ?? null, country: pl?.country || '', county: pl?.county || ''});
    const monoRun = part => async (place, host, ctx) => {
        let insee = ''; try { insee = (await ctx?.village?.())?.insee || ''; } catch (_) {}
        const pl = await resolvePlace({...monoPlace(place), insee});
        const html = await placePart(part, pl);
        if (!html) { host.innerHTML = ''; return false; }
        host.innerHTML = html; return true;
    };
    (ext.monographSections = ext.monographSections || []).push(
        {id: 'l10r_coutume', icon: '⚖️', label: T('La coutume (avant 1789)'), group: 'Le lieu', defaultOn: true, enabled: () => on('coutume'), render: monoRun('coutume')},
        {id: 'l10r_mariages', icon: '💒', label: T('Les mariages par mois (temps clos)'), group: 'Ta famille', defaultOn: true, enabled: () => on('tempsclos'), render: monoRun('mariages')},
        {id: 'l10r_vent', icon: '🌬️', label: T('Le vent du pays'), group: 'Le lieu', defaultOn: true, enabled: () => on('vent'), render: monoRun('vent')},
        {id: 'l10r_pays', icon: '🏞️', label: T('Le pays traditionnel'), group: 'Le lieu', defaultOn: true, enabled: () => on('pays'), render: monoRun('pays')});

    /* ═════════════ 🧰 à la demande : le registre commun des données ═════════════ */
    const emptyLine = (text, icon = 'ℹ️') => (A().emptyState ? A().emptyState({text, icon, size: 'small'}) : `<p class="muted">${esc(text)}</p>`);
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null, county: pl.county || '', country: pl.country || ''} : null);
    const personId = ctx => Number(ctx?.person?.id || ctx?.person?.person?.id || ctx?.person) || 0;
    async function runPerson(ctx, host, only) {
        const id = personId(ctx); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return false; }
        host.innerHTML = '<div class="tr-block l10r-block"></div>';
        await fillPerson(host.firstElementChild, id, only);
        if (!host.textContent.trim()) { host.innerHTML = ''; return false; }
        return true;
    }
    async function runPlace(part, ctx, host) {
        const pl = placeOfCtx(ctx?.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return false; }
        const html = await placePart(part, await resolvePlace(pl)); host.innerHTML = html || ''; return !!html;
    }
    const toolRun = (render, opt = {}) => async (ctx, host) => { await render(host, {q: ctx?.q || '', year: Number(ctx?.year) || null, ...opt}); return true; };
    (ext.dataSources = ext.dataSources || []).push(
        ...[['coutume', '⚖️', 'La coutume de son pays (avant 1789)'], ['sel', '🧂', 'L’impôt du sel de son vivant'], ['tempsclos', '💒', 'Son mariage et les temps clos'], ['dictons', '🌦️', 'Les dictons de son jour de naissance'], ['vent', '🌬️', 'Le vent de son pays'], ['pays', '🏞️', 'Son pays traditionnel']]
            .map(([k, icon, label]) => ({id: `l10r_p_${k}`, icon, label: T(label), group: 'La personne', needs: ['person'], installed: () => true, enabled: () => on(k), run: (ctx, host) => runPerson(ctx, host, [k])})),
        ...Object.keys(PLACE_PARTS).map(k => ({id: `l10r_l_${k}`, icon: PLACE_PARTS[k].split(' ')[0], label: T(PLACE_PARTS[k].replace(/^\S+\s/, '')), group: 'Le lieu', needs: ['place'], installed: () => true, enabled: () => on(PLACE_ON[k]), run: (ctx, host) => runPlace(k, ctx, host)})),
        {id: 'l10r_y_tempsclos', icon: '💒', label: T('Les temps clos de l’année (Avent, Carême)'), group: 'Le monde', needs: ['year'], installed: () => true, enabled: () => on('tempsclos'),
            run: async (ctx, host) => { const y = Number(ctx?.year); if (!y) { host.innerHTML = emptyLine(T('Choisis une année.'), '📅'); return false; } host.innerHTML = yearClosedHtml(await tryLoad('regles'), y); return true; }},
        {id: 'l10r_y_ecritures', icon: '🖋️', label: T('Les modèles d’écriture de l’époque'), group: 'Chercher', needs: ['year'], installed: () => true, enabled: () => on('ecritures'), run: toolRun(renderEcritures)},
        {id: 'l10r_t_cappelli', icon: '✂️', label: T('Abréviations latines (Cappelli)'), group: 'Chercher', needs: [], installed: () => true, enabled: () => on('cappelli'), run: (ctx, host) => { ext.readingAid?.open?.({tab: 'l10r_cappelli', q: ctx?.q || ''}); host.innerHTML = emptyLine(T('Ouvert dans 📖 Aide à la lecture.'), '✂️'); return true; }},
        {id: 'l10r_t_mots', icon: '📚', label: T('Le sens d’un mot ancien'), group: 'Chercher', needs: [], online: true, installed: () => true, enabled: () => on('mots'), run: (ctx, host) => { ext.readingAid?.open?.({tab: 'l10r_mots', q: ctx?.q || ''}); host.innerHTML = emptyLine(T('Ouvert dans 📖 Aide à la lecture.'), '📚'); return true; }},
        {id: 'l10r_t_fetes', icon: '📅', label: T('Une fête de saint → la vraie date'), group: 'Chercher', needs: [], installed: () => true, enabled: () => on('fetes'), run: (ctx, host) => { ext.readingAid?.open?.({tab: 'l10r_fetes', q: ctx?.q || ''}); host.innerHTML = emptyLine(T('Ouvert dans 📖 Aide à la lecture.'), '📅'); return true; }});

    /* ═════════════ 🧰 Listes → Données ═════════════ */
    const openUrl = u => { if (u) W.open?.(u, '_blank', 'noopener'); };
    const rowsOf = async (name, map) => { const D = await tryLoad(name); return D ? map(D) : []; };
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'l10r_coutumes', icon: '⚖️', label: T('Droit écrit ou coutume, par commune (1789)'), group: 'Le lieu', source: T('Wikipédia « Droit écrit » (CC BY-SA 4.0) et atlas d’Ancien Régime (CC BY-SA 4.0)'), sourceUrl: 'https://fr.wikipedia.org/wiki/Droit_%C3%A9crit', enabled: () => on('coutume'),
            load: async () => { const [R, AR] = await Promise.all([load('regles'), loadAR()]); const cc = await readGz('assets/data/cc-communes.json.gz').catch(() => null);
                return Object.keys(AR.c).map(insee => { const c = coutumeOf(R, AR, insee); if (!c) return null; const g = cc?.c?.[insee]; return {commune: AR.c[insee][0], insee, regime: T(R.coutume.regimes[c.regime].label), coutume: c.named?.n || '', province: c.province, bailliage: c.bailliage, lat: g?.[1] ?? null, lon: g?.[2] ?? null, url: (c.named || R.coutume.regimes[c.regime]).url}; }).filter(Boolean); },
            fields: [{key: 'commune', label: T('Commune'), type: 'place'}, {key: 'regime', label: T('Régime'), type: 'enum'}, {key: 'coutume', label: T('Coutume'), type: 'enum'}, {key: 'province', label: T('Province (1789)'), type: 'enum'}, {key: 'bailliage', label: T('Bailliage'), type: 'text'}, {key: 'url', label: T('Source'), type: 'url'}],
            geo: r => (r.lat != null ? [r.lat, r.lon] : null), open: r => openUrl(r.url)},
        {id: 'l10r_tempsclos', icon: '💒', label: T('Temps clos (Avent, Carême) de chaque année'), group: 'Le monde', source: T('Dictionnaire de théologie catholique (1905), Wikisource ; calcul de Pâques'), sourceUrl: 'https://fr.wikisource.org/wiki/Dictionnaire_de_th%C3%A9ologie_catholique/B%C3%89N%C3%89DICTION_NUPTIALE', enabled: () => on('tempsclos'),
            load: async () => { const out = []; for (let y = 1500; y <= 1950; y++) { const [a, c] = closedTimes(y); const e = civil(easterJdn(y), y); out.push({year: y, paques: dateFr(e), avent_fin: dateFr(civil(a.to, y)), careme_debut: dateFr(civil(c.from, y)), careme_fin: dateFr(civil(c.to, y)), avent_debut: dateFr(civil(adventJdn(y), y)), calendrier: julian(y) ? T('julien') : T('grégorien')}); } return out; },
            fields: [{key: 'year', label: T('Année'), type: 'year'}, {key: 'paques', label: T('Pâques'), type: 'text'}, {key: 'careme_debut', label: T('Cendres (début du Carême)'), type: 'text'}, {key: 'careme_fin', label: T('Quasimodo (fin)'), type: 'text'}, {key: 'avent_debut', label: T('1er dimanche de l’Avent'), type: 'text'}, {key: 'avent_fin', label: T('Fin de l’Avent précédent (Épiphanie)'), type: 'text'}, {key: 'calendrier', label: T('Calendrier'), type: 'enum'}],
            period: r => [r.year, r.year]},
        {id: 'l10r_vents', icon: '🌬️', label: T('Vents régionaux de France'), group: 'Le lieu', source: T('Wikipédia (CC BY-SA 4.0), Wikidata (CC0)'), sourceUrl: 'https://fr.wikipedia.org/wiki/Liste_de_vents', enabled: () => on('vent'),
            load: () => rowsOf('regles', R => R.vents.map(v => ({name: v.n, deps: v.deps.join(', '), what: v.what, quote: v.q, url: v.url, wikidata: v.qid ? `https://www.wikidata.org/wiki/${v.qid}` : ''}))),
            fields: [{key: 'name', label: T('Vent'), type: 'text'}, {key: 'deps', label: T('Départements'), type: 'text'}, {key: 'what', label: T('Ce que c’est'), type: 'text'}, {key: 'quote', label: T('Phrase de la source'), type: 'text'}, {key: 'url', label: T('Source'), type: 'url'}, {key: 'wikidata', label: 'Wikidata', type: 'url'}], open: r => openUrl(r.url)},
        {id: 'l10r_pays', icon: '🏞️', label: T('Pays traditionnels (régions naturelles)'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/wiki/Q572995', enabled: () => on('pays'),
            load: () => rowsOf('regles', R => R.pays.map(p => ({name: p.n, desc: p.d, deps: p.deps.join(', '), lat: p.lat, lon: p.lon, url: `https://www.wikidata.org/wiki/${p.q}`, wp: p.wp}))),
            fields: [{key: 'name', label: T('Pays'), type: 'text'}, {key: 'desc', label: T('Description'), type: 'text'}, {key: 'deps', label: T('Départements'), type: 'text'}, {key: 'url', label: T('Source (Wikidata)'), type: 'url'}, {key: 'wp', label: 'Wikipédia', type: 'url'}],
            geo: r => (r.lat != null ? [r.lat, r.lon] : null), open: r => openUrl(r.wp || r.url)},
        {id: 'l10r_cappelli', icon: '✂️', label: T('Abréviations latines (Cappelli, 1901)'), group: 'Chercher', source: T('Cappelli, Lexicon abbreviaturarum (1901), Wikimedia Commons — domaine public'), sourceUrl: 'https://commons.wikimedia.org/wiki/File:Adriano_Cappelli_(1859-1942)_-_Lexicon_Abbreviaturarum,_J.J._Weber_Leipzig,_1901.pdf', enabled: () => on('cappelli'),
            load: () => rowsOf('cappelli', C => C.rows.map(([a, e, p]) => ({abbr: a, word: e, page: p, url: C.page_url.replace('{p}', p)}))),
            fields: [{key: 'abbr', label: T('Abréviation'), type: 'text'}, {key: 'word', label: T('Se lit'), type: 'text'}, {key: 'page', label: T('Page'), type: 'number'}, {key: 'url', label: T('Source'), type: 'url'}], open: r => openUrl(r.url)},
        {id: 'l10r_ecritures', icon: '🖋️', label: T('Modèles d’écriture anciens'), group: 'Chercher', source: T('Wikimedia Commons (licence de chaque image)'), sourceUrl: 'https://commons.wikimedia.org/wiki/Category:Calligraphers_from_France', enabled: () => on('ecritures'),
            load: () => rowsOf('regles', R => R.ecritures.map(e => ({year: e.y, who: e.who, what: e.what, licence: e.licence, url: e.page}))),
            fields: [{key: 'year', label: T('Année'), type: 'year'}, {key: 'who', label: T('Maître écrivain'), type: 'text'}, {key: 'what', label: T('Écriture'), type: 'text'}, {key: 'licence', label: T('Licence'), type: 'enum'}, {key: 'url', label: T('Source (Commons)'), type: 'url'}], period: r => [r.year, r.year], open: r => openUrl(r.url)},
        {id: 'l10r_dictons', icon: '🌦️', label: T('Dictons du jour (366 jours)'), group: 'Le monde', source: T('Wikipédia, pages des jours (CC BY-SA 4.0)'), sourceUrl: 'https://fr.wikipedia.org/wiki/1er_janvier', enabled: () => on('dictons'),
            load: () => rowsOf('jours', J => Object.entries(J.days).flatMap(([k, v]) => { const [m, d] = k.split('-').map(Number); return v.d.map(x => ({month: T(MONTHS[m - 1]), day: d, dicton: x[0], note: x[1], url: dayUrl(v)})); })),
            fields: [{key: 'month', label: T('Mois'), type: 'enum'}, {key: 'day', label: T('Jour'), type: 'number'}, {key: 'dicton', label: T('Dicton'), type: 'text'}, {key: 'note', label: T('Note'), type: 'text'}, {key: 'url', label: T('Source'), type: 'url'}], open: r => openUrl(r.url)},
        {id: 'l10r_saints', icon: '✝️', label: T('Saints du jour (calendrier)'), group: 'Le monde', source: T('Wikipédia, pages des jours (CC BY-SA 4.0)'), sourceUrl: 'https://fr.wikipedia.org/wiki/1er_janvier', enabled: () => on('fetes'),
            load: () => rowsOf('jours', J => Object.entries(J.days).flatMap(([k, v]) => { const [m, d] = k.split('-').map(Number); return v.s.map(x => ({saint: x[0], month: T(MONTHS[m - 1]), day: d, desc: x[1], url: `https://fr.wikipedia.org/wiki/${encodeURIComponent(String(v.t).replace(/ /g, '_'))}`})); })),
            fields: [{key: 'saint', label: T('Saint'), type: 'text'}, {key: 'month', label: T('Mois'), type: 'enum'}, {key: 'day', label: T('Jour'), type: 'number'}, {key: 'desc', label: T('Qui'), type: 'text'}, {key: 'url', label: T('Source'), type: 'url'}], open: r => openUrl(r.url)});

    /* ═════════════ 🗺 sur les cartes : droit écrit ou coutume ═════════════ */
    (ext.mapLayerSources = ext.mapLayerSources || []).push({id: 'l10r_coutume', icon: '⚖️', label: T('Droit écrit ou coutume avant 1789 (communes)'), group: 'Le monde', kind: 'points',
        source: T('Wikipédia « Droit écrit » (CC BY-SA 4.0) · atlas d’Ancien Régime, Th. Fressin (CC BY-SA 4.0) · communes : IGN (Licence Ouverte)'),
        run: async ({q, bbox, max = 4000}) => {
            const [R, AR, cc] = await Promise.all([load('regles'), loadAR(), readGz('assets/data/cc-communes.json.gz')]);
            const features = [], inBox = (lat, lon) => !bbox || (lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3]);
            for (const insee of Object.keys(AR.c)) {
                if (features.length >= max) break;
                const g = cc.c[insee]; if (!g || g[1] == null || !inBox(g[1], g[2])) continue;
                const c = coutumeOf(R, AR, insee); if (!c) continue;
                const rg = R.coutume.regimes[c.regime], label = c.named ? `${T(rg.label)} — ${c.named.n}` : T(rg.label);
                if (q && !fold(label).includes(fold(q)) && !fold(g[0]).includes(fold(q))) continue;
                features.push({type: 'pt', lat: g[1], lon: g[2], label, cat: c.regime, color: rg.color});
            }
            return {features, source: T('Droit écrit ou coutume d’après la province en 1789 (atlas d’Ancien Régime) et Wikipédia')};
        }});

    /* ═════════════ Réglages → ⚖️ Règles et actes ═════════════ */
    const fmtSize = b => (b >= 1e6 ? `${String(Math.round(b / 1e5) / 10).replace('.', ',')} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`);
    const ABOUT = [
        ['regles', 'Wikipédia (droit écrit, coutumes, gabelle, vents), Wikisource (Dictionnaire de théologie catholique, 1905), Wikidata (régions naturelles), Wikimedia Commons (cartes, modèles d’écriture), atlas d’Ancien Régime', 'Coutumes, temps clos, sel, vents, pays, modèles d’écriture', 'CC BY-SA 4.0 ; CC0 1.0 ; domaine public', 'https://fr.wikipedia.org/wiki/Droit_%C3%A9crit'],
        ['jours', 'Wikipédia, les 366 pages des jours', 'Dictons et saints du jour', 'CC BY-SA 4.0', 'https://fr.wikipedia.org/wiki/1er_janvier'],
        ['cappelli', 'Adriano Cappelli, Lexicon abbreviaturarum (Leipzig, 1901), fichier PDF de Wikimedia Commons (texte lu par Internet Archive)', 'Abréviations latines et leur page', 'domaine public (PD-old-70, marque du domaine public)', 'https://commons.wikimedia.org/wiki/File:Adriano_Cappelli_(1859-1942)_-_Lexicon_Abbreviaturarum,_J.J._Weber_Leipzig,_1901.pdf']];
    async function sizes() { const out = {}; await Promise.all(ABOUT.map(async a => { try { const r = await fetch(`assets/data/l10-${a[0]}.json.gz`, {method: 'HEAD'}); out[a[0]] = Number(r.headers.get('content-length')) || 0; } catch (_) { out[a[0]] = 0; } })); return out; }
    async function drawSettings(token) {
        const ws = W.document?.getElementById('workspace'); if (!ws || (token === undefined && !ws.querySelector('[data-l10r-settings]'))) return;
        const sz = await sizes();
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        let kept = 0; try { kept = Object.keys(JSON.parse(W.localStorage?.getItem(WT_CACHE) || '{}')).length; } catch (_) {}
        const tg = ([k, label, sub]) => `<label class="checkbox-line cplus-tg" data-l10r-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const rows = ABOUT.map(([k, label, what, lic, url]) => `<tr><td>${link(url, T(label))}</td><td>${esc(T(what))}</td><td>${esc(sz[k] ? T('dans l’app ({s})', {s: fmtSize(sz[k])}) : T('pas encore là'))}</td><td>${esc(T(lic))}</td><td>${esc('25/11/2026')}</td></tr>`).join('');
        ws.innerHTML = `<section class="page cplus-settings l10r-settings" data-l10r-settings>${UI().pageHeader ? UI().pageHeader({title: T('Règles et actes'), icon: '⚖️', where: T('Réglages · Données'), help: esc(T('Les règles de sa vie (coutume, sel, temps clos, dictons, vent, pays) et les outils pour lire les actes (abréviations latines, modèles d’écriture, mots anciens, fêtes de saints).'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('Gardé sur l’ordinateur'))}</h3><p>${esc(T('Les mots anciens cherchés en ligne : {n} réponses gardées.', {n: kept}))}</p>
                <div class="page-actions"><button type="button" class="button secondary" data-l10r-clear ${kept ? '' : 'disabled'}>${esc(T('🗑 Effacer les mots gardés'))}</button></div></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Source'))}</th><th>${esc(T('Ce qu’elle donne'))}</th><th>${esc(T('Où'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Lue le'))}</th></tr></thead><tbody>${rows}
                <tr><td>${link('https://fr.wiktionary.org/', T('Wiktionnaire et Wikisource, en ligne'))}</td><td>${esc(T('Le sens des mots anciens'))}</td><td>${esc(T('en ligne, gardé'))}</td><td>CC BY-SA 4.0</td><td>${esc('25/11/2026')}</td></tr></tbody></table></div>
                <p class="muted">${esc(T('Pas copiés (licence fermée ou site inaccessible) : la transcription de Cappelli de l’université de Zurich (Ad fontes : licence non lue, site bloqué), les dictionnaires de l’Académie du site dictionnaire-academie.fr et du CNRTL (sites inaccessibles d’ici), Wikiquote (inaccessible d’ici).'))}</p>
                <p class="muted">${esc(T('Ce qui part sur Internet : seulement un mot cherché dans « 📚 Mots anciens » (Wiktionnaire, Wikisource), et les images de Wikimedia Commons quand on les regarde. Rien sur les personnes.'))}</p></div></section>`;
    }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);
    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { const i = ['monde_coutumes', 'terroir', 'commune_plus'].map(k => tabs.findIndex(t => t[0] === k)).find(j => j >= 0); tabs.splice(i === undefined ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === 'regles_vie')) {
            const after = ['monde_coutumes', 'terroir', 'world', 'histoire'].map(k => B.findIndex(b => b[0] === k)).find(i => i >= 0);
            B.splice(after === undefined ? B.length : after + 1, 0, ['regles_vie', '⚖️ Les règles de sa vie']);
        }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans.regles_vie ||= '12';
        return !!tabs;
    }
    if (W.document && !register()) W.document.addEventListener('DOMContentLoaded', register, {once: true});

    const pub = {settings, easterJdn, closedTimes, tempsClos, adventJdn, jdn, civil, julian, coutumeOf, ventsOf, paysOf, cappelliSearch, subseq, saintDates, wiktSenses, ecrituresFor, monthCounts, lifeOf, fillPerson, placeInto, load, decorate,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
    ext.reglesActes = pub;
    return pub;
});
