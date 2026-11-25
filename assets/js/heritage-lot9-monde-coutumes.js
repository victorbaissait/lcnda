/* LCNDA — 🌍 Le monde et les coutumes de son temps (lot 9). Serveur : lib/lot9_monde_coutumes.php ; style : assets/css/lot9-monde-coutumes.css ;
 * données livrées : assets/data/l9b-*.json.gz (refaites par scripts/lot9-monde-coutumes/*). Tout est sourcé, avec « ↗ » vers la source.
 *  🌍 La planète de son vivant (population du monde, CO₂, température)   ✨ Les étoiles nouvelles (novae, supernovae à l'œil nu)
 *  🏔️ Les premières ascensions (à moins de 100 km)                         🖋️ Les célébrités de passage (résidence sur Wikidata)
 *  🐎 Napoléon, les rois et les grands voyages (étapes datées)             ⛪ Le pape de son baptême
 *  🎓 Sa thèse (Sudoc, theses.fr : en ligne, ✓ C'est lui / ✗ Pas lui)       🛠️ Les compagnons du Tour de France
 *  🎖️ Les décorations expliquées (et « Reconnaître une médaille »)         👕 Les uniformes de son époque (gravures du domaine public)
 *  💍 Les coutumes du mariage dans sa région                               ⚰️ Le deuil de son temps
 *  👶 Les nourrices                                                         🧂 Le prix du sel (la gabelle, avant 1790)
 *  🚧 L'octroi de sa ville                                                  🕯️ L'éclairage de sa rue (gaz, électricité)
 *  🗞️ Les journaux de son département (BnF, presse locale ancienne)       🌐 Le nom de son village dans toutes les langues
 * Où ça s'affiche : un bloc de fiche « 🌍 Son monde et ses coutumes » (une phrase par sujet, ▸ plus), la fiche d'un village, la
 * monographie (LCNDA_EXT.monographSections), 🔎 Ce qui le concerne / 🧰 Données (LCNDA_EXT.dataSources), Listes → Données
 * (LCNDA_EXT.dataLists), les cartes (LCNDA_EXT.mapLayerSources : 🧂 gabelle), « Où chercher » (ext.ouChercher.afterRedraw : 👶 registres
 * des nourrices) et Réglages → « 🌍 Monde et coutumes » (localStorage « genealogie-monde-coutumes »).
 * Pour d'autres fichiers : LCNDA_EXT.mondeCoutumes. Essai : tests/test-lot9-monde-coutumes.js
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
    const T = (s, v) => (W.LCNDA_I18N ? W.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
    const nf = (n, d = 0) => Number(n).toLocaleString('fr-FR', {maximumFractionDigits: d, minimumFractionDigits: d});
    const link = (url, label = T('↗ source'), title = '') => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</a>` : esc(label));
    const more = (inner, n) => `<details class="cplus-more l9-more"><summary>${esc(n ? T('▸ plus ({n})', {n}) : T('▸ plus'))}</summary>${inner}</details>`;
    const srcLine = (label, licence, url, extra = '') => `<p class="cplus-src l9-src">${esc(T('Source :'))} ${url ? link(url, label) : esc(label)}${licence ? ` — ${esc(licence)}` : ''}${extra}</p>`;
    const quoteBox = (q, url, title) => (q ? `<details class="l9-quote"><summary><small>${esc(T('La source'))}</small></summary><blockquote>« ${esc(q)} »</blockquote><small class="muted">${esc(title || '')} ${link(url)}</small></details>` : '');
    const km = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); };
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    /** « 8 août 1786 », « août 1786 », « 1786 » */
    const dateFr = s => { const m = String(s || '').match(/^(-?\d{1,4})(?:-(\d\d))?(?:-(\d\d))?/); if (!m) return ''; const y = Number(m[1]), mo = Number(m[2] || 0), d = Number(m[3] || 0); return `${d ? `${d === 1 ? '1er' : d} ` : ''}${mo ? `${T(MONTHS[mo - 1])} ` : ''}${y}`; };
    const yOf = s => { const m = String(s ?? '').match(/^-?\d{1,4}/); return m ? Number(m[0]) : null; };
    const listFr = arr => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} ${T('et')} ${arr[arr.length - 1]}`);
    const ageTxt = (fem, age) => (age <= 0 ? T(fem ? 'elle venait de naître' : 'il venait de naître') : T(fem ? 'elle avait {n} ans' : 'il avait {n} ans', {n: age}));

    /* ═════════════ les réglages ═════════════ */
    const KEY = 'genealogie-monde-coutumes';
    const TAB = ['monde_coutumes', '25l9', '🌍 Monde et coutumes'];
    const PARTS = [
        ['planete', '🌍 La planète de son vivant', 'Combien d’humains sur Terre, combien de CO₂ dans l’air et quelle température à sa naissance et à sa mort.'],
        ['etoiles', '✨ Les étoiles nouvelles', 'Les novae et supernovae visibles à l’œil nu depuis la France pendant sa vie.'],
        ['sommets', '🏔️ Les premières ascensions', 'Les montagnes à moins de 100 km gravies pour la première fois pendant sa vie (et autour d’une commune).'],
        ['sejours', '🖋️ Les célébrités de passage', 'Les écrivains, peintres, musiciens… qui ont habité sa commune, avec la date.'],
        ['voyages', '🐎 Napoléon, les rois et les grands voyages', 'Route Napoléon (1815), fuite à Varennes (1791), grand tour de France de Charles IX (1564-1566)…'],
        ['pape', '⛪ Le pape de son baptême', 'Qui était pape le jour de son baptême (ou de sa naissance).'],
        ['these', '🎓 Sa thèse', 'Pour un médecin, un pharmacien, un avocat… : sa thèse dans le Sudoc ou theses.fr (en ligne, jamais pour une personne vivante).'],
        ['compagnons', '🛠️ Les compagnons du Tour de France', 'Pour les métiers d’artisan, ou quand ses notes parlent de compagnon.'],
        ['decorations', '🎖️ Les décorations expliquées', 'Quand sa fiche parle d’une médaille ou d’une croix : ce que c’était, pour qui, depuis quand.'],
        ['uniformes', '👕 Les uniformes de son époque', 'Pour un soldat : des gravures d’uniformes de son époque (aide à dater une photo).'],
        ['mariage', '💍 Les coutumes du mariage dans sa région', 'Des extraits de textes anciens (domaine public) sur les noces de sa région.'],
        ['deuil', '⚰️ Le deuil de son temps', 'Combien de temps on portait le deuil d’un mari, d’un parent, d’un enfant…'],
        ['nourrices', '👶 Les nourrices', 'Quand un bébé meurt loin de chez ses parents, ou qu’une note dit « en nourrice ».'],
        ['gabelle', '🧂 Le prix du sel (la gabelle)', 'Avant 1790 : sa commune était-elle en pays de grande gabelle, de petite gabelle, rédimé, exempt… ?'],
        ['octroi', '🚧 L’octroi de sa ville', 'La taxe qu’on payait aux portes de la ville sur ce qui entrait.'],
        ['eclairage', '🕯️ L’éclairage de sa rue', 'Depuis quand sa ville avait l’éclairage au gaz, puis l’électricité.'],
        ['journaux', '🗞️ Les journaux de son département', 'Les journaux publiés près de chez lui à son époque (Bibliothèque nationale de France).'],
        ['langues', '🌐 Le nom de son village dans toutes les langues', 'Sur la fiche d’un village (replié) : « Tulle en russe : Тюль ». En ligne (Wikidata), gardé.']];
    const DEF = Object.fromEntries(PARTS.map(p => [p[0], true]));
    function settings() { let s = {}; try { s = JSON.parse(W.localStorage?.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...DEF, ...s}; }
    function save(s) { try { W.localStorage?.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
    const on = k => settings()[k] !== false;
    const kiosk = () => !!W.document?.body?.classList.contains('is-kiosk') || !!W.document?.body?.classList.contains('ms-on');

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
    const load = name => (files[name] ||= readGz(`assets/data/l9b-${name}.json.gz?v=1`).catch(e => { delete files[name]; throw e; }));
    const tryLoad = name => load(name).catch(() => null);
    const api = (a, q) => A().api(a, q);
    const post = (a, b) => A().api(a, {}, {method: 'POST', body: b}).then(r => r?.result || r);
    const memo = new Map();
    function ask(action, q) { const k = action + JSON.stringify(q); if (!memo.has(k)) memo.set(k, api(action, q).catch(e => { memo.delete(k); return {ok: false, message: e.message}; })); return memo.get(k); }

    /* ═════════════ la vie d'une personne (depuis l9b_person) ═════════════ */
    const KIND_ORDER = {birth: 0, bapt: 1};
    function lifeOf(P) {
        const ev = P?.events || [], first = kinds => ev.filter(e => kinds.includes(e.kind) && e.year).sort((a, b) => a.year - b.year)[0] || null;
        const b = first(['birth']) || first(['bapt']), bp = first(['bapt']) || first(['birth']), d = first(['death']) || first(['burial']);
        const by = b?.year || null, dy = d?.year || null;
        const now = new Date().getFullYear(), end = dy || (by ? Math.min(by + 90, now) : null);
        const places = Object.values(P?.places || {});
        const placeOf = e => (e?.place ? P.places[e.place] || null : null);
        return {P, by, dy, end, unsure: !dy, birthEv: b, baptEv: bp, deathEv: d, fem: P?.gender === 'female', places, placeOf, first: P?.first || ''};
    }
    const ageAt = (L, y) => (L.by && y ? y - L.by : null);
    const inLife = (L, y, minAge = 0) => L.by && y && y >= L.by + minAge && y <= L.end;
    const placeName = p => p?.commune || p?.name || '';

    /* ═════════════ 🌍 la planète ═════════════ */
    const interp = (pts, y) => {
        if (!pts?.length || y < pts[0][0] || y > pts[pts.length - 1][0]) return null;
        for (let i = 0; i < pts.length; i++) { if (pts[i][0] === y) return pts[i][1]; if (pts[i][0] > y) { const [y0, v0] = pts[i - 1], [y1, v1] = pts[i]; return v0 + (v1 - v0) * (y - y0) / (y1 - y0); } }
        return null;
    };
    function planetAt(D, y) {
        if (!D || !y) return null;
        const un = interp(D.pop.un, y), hy = un == null ? interp(D.pop.hyde, y) : null;
        const law = interp(D.co2.law, y), mlo = y >= 1959 ? interp(D.co2.mlo, y) : null;
        const t = interp(D.temp, y);
        return {y, pop: un ?? hy, popSrc: un != null ? 'un' : hy != null ? 'hyde' : '', co2: mlo ?? law, co2Src: mlo != null ? 'mlo' : law != null ? 'law' : '', temp: t, est: un == null};
    }
    const popTxt = v => (v >= 1e9 ? T('{n} milliards d’humains', {n: nf(v / 1e9, 1)}).replace(/^1,0 milliards/, '1 milliard').replace(/^1,(\d) milliards/, '1,$1 milliard') : T('{n} millions d’humains', {n: nf(Math.round(v / 1e6))}));
    function planetBits(p) {
        if (!p) return '';
        const bits = [];
        if (p.pop) bits.push(`${p.est ? T('environ ') : ''}${popTxt(p.pop)}`);
        if (p.co2) bits.push(T('{n} ppm de CO₂', {n: nf(p.co2)}));
        if (p.temp != null) bits.push(T('le globe à {t} °C de la moyenne 1901-2000', {t: `${p.temp > 0 ? '+' : p.temp < 0 ? '−' : ''}${nf(Math.abs(p.temp), 2)}`}));
        return bits.join(', ');
    }
    function planetSources(D, ps) {
        const used = new Set(ps.flatMap(p => (p ? [p.popSrc, p.co2Src, p.temp != null ? 'temp' : ''] : [])).filter(Boolean));
        return `<ul class="l9-srcs">${[...used].map(k => { const s = D.src[k]; return `<li><small>${esc(T(s.label))} — ${s.licence_url ? link(s.licence_url, s.licence) : esc(T(s.licence))} ${link(s.url)}</small></li>`; }).join('')}</ul>`;
    }
    function planeteHtml(D, L) {
        if (!D || !L.by) return '';
        const a = planetAt(D, L.by), b = L.dy ? planetAt(D, L.dy) : null;
        if (!a?.pop && !a?.co2) return '';
        const lead = `${T('À sa naissance ({y}) : {b}', {y: L.by, b: planetBits(a)})}${b ? ` ; ${T('à sa mort ({y}) : {b}', {y: L.dy, b: planetBits(b)})}` : ''}.`;
        const today = planetAt(D, Math.min(new Date().getFullYear(), D.pop.un[D.pop.un.length - 1][0]));
        return `<p class="cplus-lead">🌍 ${esc(lead)}</p>${more(`<p>${esc(T('Aujourd’hui ({y}) : {b}.', {y: today.y, b: planetBits({...today, temp: interp(D.temp, D.temp[D.temp.length - 1][0])})}))}</p>
            <p class="muted"><small>${esc(T('Avant 1950 le nombre d’humains est une estimation des historiens (par décennie, puis par siècle avant 1700) ; le CO₂ d’avant 1959 est mesuré dans les bulles d’air de la glace de l’Antarctique.'))}</small></p>${planetSources(D, [a, b, today])}`)}`;
    }

    /* ═════════════ ✨ les étoiles nouvelles ═════════════ */
    function etoilesSeen(D, L) {
        if (!D || !L.by) return [];
        return D.rows.filter(r => inLife(L, r.y, 5)).map(r => ({...r, age: r.y - L.by, unsure: L.unsure && r.y - L.by >= 60}));
    }
    const starTxt = (r, fem) => `${T(r.n)} (${dateFr(r.d || String(r.y))}, ${T(fem ? 'à {n} ans' : 'à {n} ans', {n: r.age})})${r.unsure ? T(' — s’il vivait encore') : ''}`;
    function etoilesHtml(D, L) {
        const list = etoilesSeen(D, L); if (!list.length) return '';
        const lead = L.fem ? T('Elle a pu voir une étoile nouvelle') : T('Il a pu voir une étoile nouvelle');
        return `<p class="cplus-lead ch-seen-lead">✨ ${esc(lead)} : ${esc(listFr(list.slice(0, 2).map(r => starTxt(r, L.fem))))}${list.length > 2 ? esc(T(' et {n} autres', {n: list.length - 2})) : ''}.</p>
            ${more(`<ul class="ch-seen-list l9-list">${list.map(r => `<li><span class="ch-seen-ico" aria-hidden="true">${r.kind === 'supernova' ? '💥' : '✨'}</span><div><strong>${esc(starTxt(r, L.fem))}</strong>
                <p class="muted">${esc(T(r.kind === 'supernova' ? 'Supernova (explosion d’une étoile), éclat {m} ; constellation : {c}.' : 'Nova (une étoile qui s’allume pour quelques semaines), éclat {m} ; constellation : {c}.', {m: nf(r.mag, 1), c: T(r.con)}))}</p>
                <small class="ch-src">${esc(T('Source :'))} ${link(r.wp || r.src, r.wp ? T('Wikipédia ↗') : T('liste ↗'))}${r.src && r.wp ? ` · ${link(r.src, T('liste des novae ↗'))}` : ''}</small></div></li>`).join('')}</ul>
            <p class="muted"><small>${esc(T('« A pu voir » : à l’œil nu depuis la France, par ciel dégagé (éclat 4,5 ou plus brillant, assez haut dans le ciel), et à au moins 5 ans. Plus le chiffre de l’éclat est petit, plus l’étoile brille.'))}</small></p>
            ${srcLine(D.src.label, D.src.licence, D.src.url)}`, list.length)}`;
    }

    /* ═════════════ 🏔️ les premières ascensions ═════════════ */
    const RADIUS = 100;
    function sommetsNear(D, lat, lon, r = RADIUS) {
        if (!D || lat == null || lon == null) return [];
        const dLat = r / 111, dLon = r / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
        return D.rows.filter(m => Math.abs(m.lat - lat) <= dLat && Math.abs(m.lon - lon) <= dLon).map(m => ({...m, km: km(lat, lon, m.lat, m.lon)})).filter(m => m.km <= r).sort((a, b) => a.km - b.km);
    }
    const sommetRow = m => `<li class="tr-item"><div><span>🏔️ <b>${esc(m.n)}</b>${m.alt ? ` <small class="muted">${esc(T('{n} m', {n: nf(m.alt)}))}</small>` : ''}</span>
        <small>${esc(T('Première ascension : {d}', {d: dateFr(m.d)}))}${m.who?.length ? ` — ${esc(listFr(m.who))}` : ''}${m.km != null ? ` · ${esc(T('à {n} km', {n: nf(Math.round(m.km))}))}` : ''}</small>
        <small>${m.wp ? `${link(m.wp, T('Wikipédia ↗'))} · ` : ''}${link(`https://www.wikidata.org/wiki/${m.q}`, T('Wikidata ↗'))}</small></div></li>`;
    function sommetsPerson(D, L) {
        if (!D || !L.by) return '';
        const hits = new Map();
        for (const p of L.places) {
            if (p.lat == null) continue;
            for (const m of sommetsNear(D, p.lat, p.lon)) { const y = yOf(m.d); if (!inLife(L, y, 0)) continue; const h = hits.get(m.q); if (!h || h.km > m.km) hits.set(m.q, {...m, from: placeName(p)}); }
        }
        const list = [...hits.values()].sort((a, b) => yOf(a.d) - yOf(b.d)); if (!list.length) return '';
        const f = list[0], age = ageAt(L, yOf(f.d));
        const lead = T('{m} ({k} km de {p}) est gravi pour la première fois {d} : {a}.', {m: f.n, k: nf(Math.round(f.km)), p: f.from, d: /^\d{4}$/.test(f.d) ? T('en {y}', {y: f.d}) : T('le {d}', {d: dateFr(f.d)}), a: ageTxt(L.fem, age)});
        return `<p class="cplus-lead">🏔️ ${esc(lead)}</p>${more(`<ul class="tr-list">${list.map(sommetRow).join('')}</ul>${srcLine('Wikidata', 'CC0 1.0', 'https://www.wikidata.org/wiki/Q1194369', ` · <small>${esc(T('« première ascension » notée sur Wikidata : la liste n’est pas complète'))}</small>`)}`, list.length)}`;
    }
    function sommetsPlace(D, pl) {
        const list = sommetsNear(D, pl?.lat, pl?.lon); if (!list.length) return '';
        const old = [...list].sort((a, b) => a.d.localeCompare(b.d));
        const lead = list.length === 1 ? T('{m}, à {k} km, a été gravi pour la première fois {d}.', {m: list[0].n, k: nf(Math.round(list[0].km)), d: T('en {y}', {y: yOf(list[0].d)})})
            : T('{n} sommets à moins de {r} km ont une première ascension datée ; le premier gravi : {m} ({y}).', {n: list.length, r: RADIUS, m: old[0].n, y: yOf(old[0].d)});
        return `<p class="cplus-lead">🏔️ ${esc(lead)}</p><ul class="tr-list">${list.slice(0, 3).map(sommetRow).join('')}</ul>${list.length > 3 ? more(`<ul class="tr-list">${list.slice(3).map(sommetRow).join('')}</ul>`, list.length - 3) : ''}
            ${srcLine('Wikidata', 'CC0 1.0', 'https://www.wikidata.org/wiki/Q1194369')}`;
    }

    /* ═════════════ 🖋️ les célébrités de passage ═════════════ */
    const occTxt = r => listFr((r.occ || []).slice(0, 2).map(o => T(o)));
    const sejourWhen = r => (r.e && yOf(r.e) !== yOf(r.s) ? T('de {a} à {b}', {a: yOf(r.s), b: yOf(r.e)}) : T('en {y}', {y: yOf(r.s)}));
    const sejourRow = r => `<li class="tr-item"><div><span>🖋️ <b>${esc(r.n)}</b> <small class="muted">${esc(occTxt(r))}</small></span>
        <small>${esc(T('habite à {p} {w}', {p: r.pl, w: sejourWhen(r)}))}${r.by ? ` <span class="muted">(${esc(T('né·e en {y}', {y: r.by}))})</span>` : ''}</small>
        <small>${r.wp ? `${link(r.wp, T('Wikipédia ↗'))} · ` : ''}${link(`https://www.wikidata.org/wiki/${r.q}`, T('Wikidata ↗'))}</small></div></li>`;
    const sejoursAt = (D, insee) => (D && insee ? D.rows.filter(r => r.insee === insee) : []);
    function sejoursPerson(D, L) {
        if (!D || !L.by) return '';
        const out = [];
        for (const p of L.places) {
            if (!p.insee) continue;
            for (const r of sejoursAt(D, p.insee)) { const a = yOf(r.s), b = yOf(r.e) || a; if (b >= L.by && a <= L.end) out.push({...r, at: Math.max(a, L.by)}); }
        }
        if (!out.length) return '';
        out.sort((a, b) => a.at - b.at);
        const f = out[0];
        const lead = T('{n} ({o}) habite à {p} {w} : {a}.', {n: f.n, o: occTxt(f), p: f.pl, w: sejourWhen(f), a: ageTxt(L.fem, f.at - L.by)});
        return `<p class="cplus-lead">🖋️ ${esc(lead)}</p>${out.length > 1 ? more(`<ul class="tr-list">${out.slice(1).map(sejourRow).join('')}</ul>`, out.length - 1) : ''}
            ${srcLine('Wikidata', 'CC0 1.0', 'https://www.wikidata.org/wiki/Property:P551', ` · <small>${esc(T('« résidence » avec une date sur Wikidata'))}</small>`)}`;
    }
    function sejoursPlace(D, pl) {
        const list = sejoursAt(D, pl?.insee); if (!list.length) return '';
        const lead = list.length === 1 ? T('{n} ({o}) a habité ici {w}.', {n: list[0].n, o: occTxt(list[0]), w: sejourWhen(list[0])}) : T('{n} personnalités ont habité ici, dont {a}.', {n: list.length, a: listFr(list.slice(0, 3).map(r => `${r.n} (${yOf(r.s)})`))});
        return `<p class="cplus-lead">🖋️ ${esc(lead)}</p><ul class="tr-list">${list.slice(0, 3).map(sejourRow).join('')}</ul>${list.length > 3 ? more(`<ul class="tr-list">${list.slice(3).map(sejourRow).join('')}</ul>`, list.length - 3) : ''}
            ${srcLine('Wikidata', 'CC0 1.0', 'https://www.wikidata.org/wiki/Property:P551')}`;
    }

    /* ═════════════ 🐎 les grands voyages ═════════════ */
    function stopsAt(D, insee) {
        if (!D || !insee) return [];
        const out = [];
        for (const t of D.trips) for (const s of t.stops) if (s.insee === insee) out.push({...s, trip: t});
        return out.sort((a, b) => String(a.d).localeCompare(String(b.d)));
    }
    const stopTxt = s => T('{w} passe à {p} {d} ({t})', {w: T(s.trip.who), p: s.n, d: /^\d{4}$/.test(s.d) ? T('en {y}', {y: s.d}) : T('le {d}', {d: dateFr(s.d)}), t: T(s.trip.title)});
    const stopRow = s => `<li class="dp-line"><span class="dp-ico" aria-hidden="true">${esc(s.trip.icon)}</span><div>${esc(stopTxt(s))}${s.note ? ` <small class="muted">— ${esc(T(s.note))}</small>` : ''}
        ${quoteBox(s.q || s.trip.src.quote, s.url || s.trip.src.url, s.title || s.trip.src.title)}</div></li>`;
    function voyagesPerson(D, L) {
        if (!D || !L.by) return '';
        const out = [];
        for (const p of L.places) for (const s of stopsAt(D, p.insee)) { const y = yOf(s.d); if (inLife(L, y)) out.push({...s, age: y - L.by}); }
        if (!out.length) return '';
        const f = out[0];
        return `<p class="cplus-lead">${esc(f.trip.icon)} ${esc(stopTxt(f))} : ${esc(ageTxt(L.fem, f.age))}.</p>${quoteBox(f.q || f.trip.src.quote, f.url || f.trip.src.url, f.title || f.trip.src.title)}
            ${out.length > 1 ? more(`<ul class="dp-lines">${out.slice(1).map(stopRow).join('')}</ul>`, out.length - 1) : ''}`;
    }
    function voyagesPlace(D, pl) {
        const list = stopsAt(D, pl?.insee); if (!list.length) return '';
        return `<p class="cplus-lead">${esc(list[0].trip.icon)} ${esc(stopTxt(list[0]))}.</p><ul class="dp-lines">${list.map(stopRow).join('')}</ul>${srcLine(T('Wikipédia (chaque étape a sa source)'), 'CC BY-SA 4.0', list[0].trip.src.url)}`;
    }

    /* ═════════════ ⛪ le pape ═════════════ */
    function popeAt(D, dateStr) {
        if (!D || !dateStr) return [];
        const d = String(dateStr).length === 4 ? `${dateStr}-07-01` : String(dateStr).length === 7 ? `${dateStr}-15` : String(dateStr);
        return D.rows.filter(p => p.s <= d && (!p.e || p.e >= d));
    }
    const popeSpan = p => `${yOf(p.s)}–${p.e ? yOf(p.e) : ''}`;
    function papeHtml(D, L) {
        const e = L.baptEv; if (!D || !e?.year) return '';
        const ds = e.date || String(e.year), ps = popeAt(D, ds);
        if (!ps.length) return '';
        const what = e.kind === 'bapt' ? T('Le pape de son baptême') : T('Le pape de sa naissance');
        return `<p class="cplus-lead">⛪ ${esc(what)} (${esc(dateFr(ds))}) : ${ps.map(p => `<b>${esc(p.n)}</b> <small class="muted">(${esc(popeSpan(p))})</small> ${link(p.wp || `https://www.wikidata.org/wiki/${p.q}`, '↗')}`).join(' / ')}${ps.length > 1 ? ` <small class="muted">${esc(T('(changement de pape cette année-là)'))}</small>` : ''}.</p>
            ${srcLine('Wikidata', 'CC0 1.0', `https://www.wikidata.org/wiki/${ps[0].q}`)}`;
    }

    /* ═════════════ 🛠️ 🎖️ 💍 ⚰️ 👶 🧂 🚧 🕯️ : les textes sourcés (l9b-coutumes) ═════════════ */
    const C = () => load('coutumes');
    const allText = P => (P?.texts || []).concat((P?.jobs || []).map(j => j.text)).join('\n');
    // 🛠️
    const COMP_NAME = /\b([A-ZÉ][a-zéèêëàâîïôûç]+)[- ](la|le|l’|l')[- ]?([A-ZÉ][a-zéèêëàâîïôûç]+)\b/;
    function compagnonsHtml(Cc, P, L) {
        const K = Cc?.compagnons; if (!K) return '';
        const txt = allText(P), f = ' ' + fold(txt) + ' ';
        const trade = (P.jobs || []).map(j => ({j, t: K.trades.find(t => t.w.some(w => (' ' + fold(j.text) + ' ').includes(' ' + w + ' ')))})).find(x => x.t);
        const said = /\bcompagnon(s|nage)?\b|\btour de france\b|\bdevoirant\b|\bcayenne\b|\bgavot\b|\bdu devoir\b/.test(f) && !/\bcompagnon d armes\b/.test(f);
        const nick = (txt.match(COMP_NAME) || [])[0];
        if (!trade && !said) return '';
        let lead;
        if (said) lead = nick && /\bcompagnon/.test(f) ? T('Sa fiche parle de compagnonnage, avec un surnom de compagnon : « {n} ».', {n: nick}) : T('Sa fiche parle de compagnonnage.');
        else lead = T('{j} : un métier des compagnons du Tour de France.', {j: trade.j.text.replace(/^./, c => c.toUpperCase())});
        return `<p class="cplus-lead">🛠️ ${esc(lead)} ${esc(T(K.short))}</p>${more(`<ul class="l9-facts">${K.facts.map(x => `<li>${esc(T(x.t))} ${quoteBox(x.q, x.url, x.title)}</li>`).join('')}</ul>
            <p class="muted"><small>${esc(T('À chercher : les rôles et registres des sociétés compagnonniques (musée du Compagnonnage de Tours), les « livrets d’ouvrier » aux archives départementales.'))}</small></p>`)}
            ${srcLine(K.src.title, 'CC BY-SA 4.0', K.src.url)}`;
    }
    // 🎖️
    function decoFound(Cc, P) {
        const D = Cc?.decorations || []; const f = ' ' + fold(allText(P)) + ' ';
        return D.filter(d => d.match.some(m => new RegExp(`\\b${m}\\b`).test(f)));
    }
    const decoFig = d => (d.image ? `<figure class="tr-photo is-small"><a href="${esc(d.image.page)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" alt="${esc(T(d.n))}" src="${esc(d.image.thumb)}" onerror="this.closest('figure').remove()"></a>
        <figcaption>${d.image.author ? `${esc(d.image.author)} · ` : ''}${d.image.licence_url ? link(d.image.licence_url, d.image.licence) : esc(d.image.licence || '')} · ${link(d.image.page, T('Commons ↗'))}</figcaption></figure>` : '');
    const decoCard = d => `<div class="tr-coiffe l9-deco">${decoFig(d)}<div><p><b>${esc(T(d.n))}</b> <small class="muted">${esc(T('depuis {y}', {y: d.y}))}</small></p><p>${esc(T(d.who))}</p>${quoteBox(d.q, d.url, d.title)}</div></div>`;
    function decorationsHtml(Cc, P) {
        const list = decoFound(Cc, P); if (!list.length) return '';
        const d = list[0];
        return `<p class="cplus-lead">🎖️ ${esc(T('{n} : {w}', {n: T(d.n), w: T(d.who)}))}</p>${more(`${list.map(decoCard).join('')}<p><button type="button" class="link-button" data-l9-medailles>${esc(T('🎖️ Reconnaître une médaille (toutes)'))}</button></p>`, list.length)}
            ${srcLine(T('Wikipédia (chaque décoration a son article)'), 'CC BY-SA 4.0', d.url, ` · <small>${esc(T('images : Wikimedia Commons'))}</small>`)}`;
    }
    function medaillesHtml(Cc) {
        const D = Cc?.decorations || []; if (!D.length) return '';
        return `<p class="cplus-lead">🎖️ ${esc(T('Les médailles et croix qu’on trouve dans les papiers de famille, de la plus ancienne à la plus récente.'))}</p>${D.slice().sort((a, b) => a.y - b.y).map(decoCard).join('')}
            ${srcLine(T('Wikipédia (chaque décoration a son article)'), 'CC BY-SA 4.0', 'https://fr.wikipedia.org/wiki/Liste_des_d%C3%A9corations_civiles_et_militaires_fran%C3%A7aises', ` · <small>${esc(T('images : Wikimedia Commons, licence propre à chaque image'))}</small>`)}`;
    }
    // 💍
    function regionOf(Cc, dep) { return (Cc?.mariage || []).filter(r => r.deps.includes(dep)); }
    function mariageHtml(Cc, P, L) {
        const ev = (P.events || []).filter(e => e.kind === 'marriage');
        for (const e of ev.length ? ev : [L.birthEv].filter(Boolean)) {
            const pl = L.placeOf(e); if (!pl?.dep) continue;
            const rs = regionOf(Cc, pl.dep); if (!rs.length) continue;
            const r = rs[0];
            const lead = ev.length ? T('Les coutumes du mariage en {r}, d’après {a} ({y}) :', {r: T(r.region), a: r.author, y: r.year}) : T('Les noces dans son pays ({r}), d’après {a} ({y}) :', {r: T(r.region), a: r.author, y: r.year});
            return `<p class="cplus-lead">💍 ${esc(lead)} « ${esc(r.items[0].q)} »</p>${r.items.length > 1 || rs.length > 1 ? more(rs.flatMap(x => x.items.slice(x === r ? 1 : 0).map(i => `<blockquote class="l9-bq">« ${esc(i.q)} » <small class="muted">${esc(i.title)} ${link(i.url)}</small></blockquote>`)).join(''), r.items.length - 1) : ''}
                ${srcLine(r.items[0].title, T('domaine public, texte sur Wikisource (CC BY-SA 4.0)'), r.items[0].url)}`;
        }
        return '';
    }
    // ⚰️
    function deuilHtml(Cc, P, L) {
        const R = Cc?.deuil; if (!R || !L.by) return '';
        const out = [];
        for (const m of P.family || []) {
            if (!m.dy || m.dy < L.by + 5 || m.dy > (L.dy || L.end)) continue;
            const rel = m.role === 'spouse' ? (L.fem ? 'mari' : 'femme') : m.role === 'parent' ? (m.gender === 'female' ? 'mere' : 'pere') : m.role === 'child' ? 'enfant' : m.role === 'sibling' ? 'frere' : '';
            const rule = R.rules.find(r => r.rel === rel); if (!rule) continue;
            out.push({m, rule, rel});
        }
        if (!out.length) return '';
        out.sort((a, b) => a.m.dy - b.m.dy);
        const REL = {mari: 'son mari', femme: 'sa femme', mere: 'sa mère', pere: 'son père', enfant: 'son enfant', frere: 'un frère ou une sœur'};
        const one = x => T('À la mort de {r}{n} en {y}, l’usage voulait {d}', {r: T(REL[x.rel]), n: x.m.first ? ` (${x.m.first})` : '', y: x.m.dy, d: T(x.rule.d)});
        const f = out[0];
        return `<p class="cplus-lead">⚰️ ${esc(one(f))} <small class="muted">(${esc(R.src.short)})</small>.</p>${quoteBox(f.rule.q, R.src.url, R.src.title)}
            ${more(`${out.length > 1 ? `<ul class="l9-facts">${out.slice(1).map(x => `<li>${esc(one(x))}.</li>`).join('')}</ul>` : ''}${R.notes.map(n => `<p>${esc(T(n.t))} ${quoteBox(n.q, n.url || R.src.url, n.title || R.src.title)}</p>`).join('')}
            <p class="muted"><small>${esc(T('Ce sont les règles d’un manuel de savoir-vivre pour la bonne société de la fin du XIXe siècle : à la campagne, on suivait souvent des usages plus courts ou différents.'))}</small></p>`, out.length - 1 + R.notes.length)}
            ${srcLine(R.src.title, T('domaine public'), R.src.url)}`;
    }
    // 👶
    function nourriceCase(P, L) {
        const txt = fold(allText(P));
        const said = /\b(en nourrice|mis en nourrice|nourrice|nourrisson de paris|enfant de paris|petit paris|bureau des nourrices)\b/.test(txt);
        let away = false;
        if (L.by && L.dy && L.dy - L.by <= 2) {
            const b = L.placeOf(L.birthEv), d = L.placeOf(L.deathEv);
            if (b && d && (b.insee || b.id) !== (d.insee || d.id) && !(b.lat != null && d.lat != null && km(b.lat, b.lon, d.lat, d.lon) < 3)) away = {b, d};
        }
        return said || away ? {said, away} : null;
    }
    function nourricesHtml(Cc, P, L) {
        const N = Cc?.nourrices, c = nourriceCase(P, L); if (!N || !c) return '';
        const lead = c.away ? T('Né·e à {b}, mort·e à {d} avant 3 ans : peut-être un bébé placé en nourrice.', {b: placeName(c.away.b), d: placeName(c.away.d)}) : T('Sa fiche parle de nourrice.');
        return `<p class="cplus-lead">👶 ${esc(lead)} ${esc(T(N.short))}</p>${more(`<ul class="l9-facts">${N.facts.map(x => `<li>${esc(T(x.t))} ${quoteBox(x.q, x.url, x.title)}</li>`).join('')}</ul>
            <p>${esc(T('Où chercher : à partir de 1874 (loi Roussel), les registres et carnets de nourrices des mairies et de la préfecture, aux archives départementales (série M ou X) du lieu où vivait la nourrice.'))} <button type="button" class="link-button" data-l9-ouc="${Number(P.id)}">${esc(T('🌍 Où chercher ?'))}</button></p>`)}
            ${srcLine(N.src.title, 'CC BY-SA 4.0', N.src.url)}`;
    }
    // 🧂
    function gabelleOf(Cc, AR, insee) {
        const G = Cc?.gabelle; if (!G || !AR || !insee) return null;
        const r = AR.c?.[insee]; if (!r || r[1] === 0) return null;
        const lv = {}; AR.layers.forEach((k, i) => { const j = r[3 + i]; if (j >= 0) lv[k] = AR.ents[k][j]; });
        const names = {g: lv.g?.n || '', p: lv.p?.n || '', b: lv.b?.n || '', gv: lv.gv?.n || ''};
        for (const rule of G.rules) {
            if (rule.insee && rule.insee.includes(insee)) return {cat: rule.cat, why: rule.why, names};
            if (rule.layer && rule.names.includes(names[rule.layer]) && (!rule.unless || !rule.unless.some(u => u.names.includes(names[u.layer])))) return {cat: rule.cat, why: rule.why, names};
        }
        return null;
    }
    function gabelleHtml(Cc, AR, pl, person = false) {
        const g = gabelleOf(Cc, AR, pl?.insee); if (!g) return '';
        const cat = Cc.gabelle.cats[g.cat];
        const lead = person ? T('Avant 1790, à {p} : {c}.', {p: placeName(pl), c: T(cat.label)}) : T('Avant 1790, la commune était en {c}.', {c: T(cat.label)});
        return `<p class="cplus-lead">🧂 ${esc(lead)} ${esc(T(cat.rule))}</p>${quoteBox(cat.q, Cc.gabelle.src.url, Cc.gabelle.src.title)}
            ${more(`<p class="muted"><small>${esc(T('D’après {w} ({n}), dans l’atlas d’Ancien Régime.', {w: T(g.why), n: g.names[g.why === 'la généralité' ? 'g' : g.why === 'le bailliage' ? 'b' : 'p'] || ''}))} ${esc(T('Les limites des pays de gabelle suivaient souvent des paroisses : c’est une indication, à vérifier dans les archives du grenier à sel.'))}</small></p>
            ${(Cc.gabelle.prices || []).map(x => `<p>${esc(T(x.t))} ${quoteBox(x.q, x.url, x.title)}</p>`).join('')}`)}
            ${srcLine(Cc.gabelle.src.title, 'CC BY-SA 4.0', Cc.gabelle.src.url, ` · <small>${link(AR.url || 'https://github.com/t-fressin/atlas-ancien-regime', T('atlas d’Ancien Régime (CC BY-SA 4.0) ↗'))}</small>`)}`;
    }
    let arPromise = null;
    const loadAR = () => (arPromise ||= (ext.droitPouvoir?.loadAR ? ext.droitPouvoir.loadAR() : readGz('assets/data/dp-ancien-regime.json.gz')).catch(e => { arPromise = null; throw e; }));
    // 🚧 et 🕯️
    const cityRow = (Cc, key, insee) => (Cc?.[key]?.cities || []).find(c => c.insee === insee) || null;
    function octroiHtml(Cc, pl) {
        const c = cityRow(Cc, 'octroi', pl?.insee), O = Cc?.octroi; if (!c || !O) return '';
        return `<p class="cplus-lead">🚧 ${esc(T(c.t))}</p>${quoteBox(c.q, c.url, c.title)}${more(O.facts.map(x => `<p>${esc(T(x.t))} ${quoteBox(x.q, x.url, x.title)}</p>`).join(''))}${srcLine(c.title, 'CC BY-SA 4.0', c.url)}`;
    }
    function eclairageHtml(Cc, pl, L = null) {
        const c = cityRow(Cc, 'eclairage', pl?.insee); if (!c) return '';
        const facts = c.facts.filter(x => !L || x.y <= L.end);
        if (!facts.length) return '';
        const f = facts[facts.length - 1];
        return `<p class="cplus-lead">🕯️ ${esc(T(f.t))}</p>${quoteBox(f.q, f.url, f.title)}${facts.length > 1 ? more(facts.slice(0, -1).map(x => `<p>${esc(T(x.t))} ${quoteBox(x.q, x.url, x.title)}</p>`).join(''), facts.length - 1) : ''}${srcLine(f.title, 'CC BY-SA 4.0', f.url)}`;
    }

    /* ═════════════ 👕 les uniformes ═════════════ */
    const ARMS = [['cavalerie', /\b(cavalier|cavalerie|dragon|dragons|hussard|hussards|cuirassier|cuirassiers|chasseur a cheval|lancier|spahi|chasseurs d afrique|carabinier)\b/], ['artillerie', /\b(artilleur|artillerie|canonnier|bombardier)\b/],
        ['genie', /\b(genie|sapeur|pontonnier|mineur du genie)\b/], ['marine', /\b(marin|matelot|marine|quartier maitre|fusilier marin|equipage de la flotte)\b/], ['gendarmerie', /\b(gendarme|gendarmerie|marechal des logis de gendarmerie)\b/],
        ['infanterie', /\b(fantassin|infanterie|voltigeur|grenadier|chasseur a pied|chasseurs a pied|zouave|tirailleur|ligne|soldat|fusilier|caporal|sergent)\b/]];
    const SOLDIER = /\b(soldat|militaire|regiment|conscrit|caporal|sergent|lieutenant|capitaine|colonel|commandant|general|officier|grenadier|voltigeur|hussard|dragon|cuirassier|artilleur|canonnier|zouave|tirailleur|fantassin|cavalier|chasseur a pied|gendarme|sapeur|grognard|garde imperial|garde nationale|mobile|poilu|matelot|marin de l etat|engage volontaire|mort pour la france|classe \d{4}|matricule)\b/;
    function soldierOf(P, L) {
        const jobs = (P.jobs || []).map(j => fold(j.text)).join(' | '), evs = (P.events || []).filter(e => e.kind === 'mili');
        const txt = fold(allText(P));
        if (!evs.length && !SOLDIER.test(` ${jobs} `) && !/\b(regiment|mort pour la france|soldat|conscrit)\b/.test(txt)) return null;
        const year = evs.find(e => e.year)?.year || (P.jobs || []).find(j => j.year && SOLDIER.test(` ${fold(j.text)} `))?.year || (L.by ? L.by + 20 : null);
        const arm = ARMS.find(([, re]) => re.test(` ${jobs} ${txt} `))?.[0] || '';
        return year ? {year, arm} : null;
    }
    function uniformesHtml(U, P, L, only = null) {
        const s = only || soldierOf(P, L); if (!U || !s) return '';
        const near = U.rows.filter(r => s.year >= r.from - 3 && s.year <= r.to + 3);
        let list = near.filter(r => s.arm && r.arm === s.arm); if (list.length < 3) list = list.concat(near.filter(r => !list.includes(r) && (!s.arm || r.arm === '' || r.arm === s.arm)));
        list = list.slice(0, 8); if (!list.length) return '';
        const lead = s.arm ? T('Les uniformes de son époque ({y}, {a}) :', {y: s.year, a: T(s.arm)}) : T('Les uniformes de son époque ({y}) :', {y: s.year});
        return `<p class="cplus-lead">👕 ${esc(lead)}</p><div class="tr-gallery l9-strip">${list.map(r => `<figure class="tr-photo is-small"><a href="${esc(r.page)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" alt="${esc(r.title)}" src="${esc(r.thumb)}" onerror="this.closest('figure').remove()"></a>
            <figcaption>${esc(r.title)}${r.date ? ` · ${esc(r.date)}` : ''}<br>${r.author ? `${esc(r.author)} · ` : ''}${r.licence_url ? link(r.licence_url, r.licence) : esc(r.licence)} · ${link(r.page, T('Commons ↗'))}</figcaption></figure>`).join('')}</div>
            <p class="muted"><small>${esc(T('Compare avec une photo de famille : la coupe de la veste, le képi ou le shako, les boutons aident à la dater.'))}</small></p>${srcLine(U.src.label, U.src.licence, U.src.url)}`;
    }

    /* ═════════════ 🗞️ les journaux ═════════════ */
    const depOf = insee => (!insee ? '' : /^97/.test(insee) ? insee.slice(0, 3) : insee.slice(0, 2));
    function journauxFor(J, insee, year) {
        if (!J || !insee) return {here: [], dep: []};
        const dep = depOf(insee), alive = r => !year || ((r.y1 || 0) <= year && (r.y2 || r.y1 || 0) >= year);
        const ins = r => (Array.isArray(r.i) ? r.i : r.i ? [r.i] : []);
        const here = J.rows.filter(r => ins(r).includes(insee) && alive(r));
        const dp = J.rows.filter(r => !here.includes(r) && ins(r).length === 1 && depOf(ins(r)[0]) === dep && alive(r));
        return {here, dep: dp};
    }
    const jRow = r => `<li>🗞️ <b>${esc(r.t)}</b> <small class="muted">${esc(r.p || '')}${r.y1 ? `, ${r.y1}${r.y2 && r.y2 !== r.y1 ? `–${r.y2}` : ''}` : ''}${r.f ? ` · ${esc(r.f)}` : ''}</small>
        <small>${link(`https://data.bnf.fr/ark:/12148/${r.a}`, T('BnF ↗'))}${r.g ? ` · ${link(`https://gallica.bnf.fr/ark:/12148/${r.a}/date`, T('lire sur Gallica ↗'))}` : ''} · ${link(`https://www.retronews.fr/search#allTerms=${encodeURIComponent(r.t)}`, T('RetroNews ↗'), T('site de la BnF, en partie payant'))}</small></li>`;
    function journauxHtml(J, pl, year) {
        const {here, dep} = journauxFor(J, pl?.insee, year); if (!here.length && !dep.length) return '';
        const all = here.concat(dep), dig = all.filter(r => r.g).length;
        const lead = year ? T('Les journaux qu’on lisait chez lui en {y} : {n} titres publiés à {p} et {m} ailleurs dans le département.', {y: year, n: here.length, p: placeName(pl), m: dep.length})
            : T('{n} journaux publiés à {p}, {m} ailleurs dans le département.', {n: here.length, p: placeName(pl), m: dep.length});
        return `<p class="cplus-lead">🗞️ ${esc(lead)}${dig ? ` ${esc(T('{d} sont numérisés sur Gallica.', {d: dig}))}` : ''}</p><ul class="l9-journaux">${all.slice(0, 5).map(jRow).join('')}</ul>${all.length > 5 ? more(`<ul class="l9-journaux">${all.slice(5, 120).map(jRow).join('')}</ul>`, all.length - 5) : ''}
            ${srcLine(J.src, J.licence, J.url, ` · <small>${esc(T('RetroNews (BnF) est en partie payant : seulement un lien de recherche.'))}</small>`)}`;
    }

    /* ═════════════ 🌐 toutes les langues ═════════════ */
    let DN = null; try { DN = new Intl.DisplayNames(['fr'], {type: 'language'}); } catch (_) { DN = null; }
    const langName = c => { try { return DN?.of(c) || c; } catch (_) { return c; } };
    const NOT_FR = l => !/^(fr|fr-.*|mul)$/.test(l);
    async function languesHtml(pl) {
        if (!pl?.insee) return '';
        const r = await ask('l9b_langues', {insee: pl.insee});
        if (!r?.ok || !r.labels) return r?.ok === false ? `<p class="muted"><small>${esc(r.message || T('Pas de connexion à Internet : réessaie quand tu seras connecté.'))}</small></p>` : '';
        const fr = r.labels.fr || placeName(pl), items = Object.entries(r.labels).filter(([l]) => NOT_FR(l));
        const diff = items.filter(([, v]) => fold(v) !== fold(fr)); if (!items.length) return '';
        const reg = ext.terreMots?.regionalLangs || ['oc', 'br', 'eu', 'co', 'ca', 'gsw', 'frp', 'pcd', 'wa', 'nrf', 'pms', 'lij', 'vec', 'gcf', 'rcf'];
        const pick = ['ru', 'zh', 'ar', 'ja', 'el', 'he', 'uk', 'hy', 'ka', 'ko', 'hi'].map(l => [l, r.labels[l]]).find(([, v]) => v && fold(v) !== fold(fr)) || diff[0] || items[0];
        const row = ([l, v]) => `<li><b>${esc(v)}</b> <small class="muted">${esc(langName(l))}${reg.includes(l) ? ` · ${esc(T('langue régionale'))}` : ''}${r.wiki?.[l] ? ` · ${link(`https://${l}.wikipedia.org/wiki/${encodeURIComponent(r.wiki[l])}`, T('Wikipédia ↗'))}` : ''}</small></li>`;
        diff.sort((a, b) => langName(a[0]).localeCompare(langName(b[0]), 'fr'));
        return `<details class="l9-langues"><summary>🌐 ${esc(T('{p} en {l} : {v}', {p: fr, l: langName(pick[0]), v: pick[1]}))} <small class="muted">${esc(T('— le nom dans {n} langues', {n: items.length}))}</small></summary>
            <ul class="l9-cols">${diff.map(row).join('')}</ul><p class="muted"><small>${esc(T('{n} autres langues l’écrivent comme en français.', {n: items.length - diff.length}))}${ext.terreMots ? ` ${esc(T('Le nom en langue régionale, avec sa source, est aussi dans « 🗣️ Le nom en langue régionale ».'))}` : ''}</small></p>
            ${srcLine('Wikidata', 'CC0 1.0', `https://www.wikidata.org/wiki/${r.qid}`, r.fetched_at ? ` · <small>${esc(T(r.cached ? 'gardé le {d}' : 'lu en ligne le {d}', {d: new Date(r.fetched_at * 1000).toLocaleDateString('fr-FR')}))}</small>` : '')}</details>`;
    }

    /* ═════════════ 🎓 la thèse (en ligne) ═════════════ */
    const THESE_KIND = {medecine: 'Thèse de médecine', pharmacie: 'Thèse de pharmacie', droit: 'Thèse de droit', veterinaire: 'Thèse vétérinaire', dentaire: 'Thèse de chirurgie dentaire'};
    const theseRow = (x, pid) => `<li class="tr-item l9-these${x.verdict === 'no' ? ' is-no' : ''}" data-l9-these-key="${esc(x.key)}"><div><span>🎓 <b>${esc(`${x.kind || T('Thèse')}${x.discipline ? ` (${x.discipline})` : ''}${x.city ? `, ${x.city}` : ''}${x.year ? `, ${x.year}` : ''}`)}</b></span>
        <span>« ${esc(x.title)} » ${link(x.url, '↗', x.source)}</span><small class="muted">${esc(T('auteur : {a}', {a: `${x.first} ${x.last}${x.dates ? ` (${x.dates})` : ''}`}))} · ${esc(x.source)}</small>
        <span class="page-actions">${x.verdict === 'added' ? `<span class="tr-pill">${esc(T('✓ ajoutée à sa fiche'))}</span> <button type="button" class="link-button" data-l9-these-undo="${esc(x.batch)}" data-pid="${pid}">${esc(T('↶ Annuler'))}</button>`
            : x.verdict === 'no' ? `<span class="tr-pill">${esc(T('✗ pas lui'))}</span> <button type="button" class="link-button" data-l9-these-mark="" data-pid="${pid}">${esc(T('↶ Annuler'))}</button>`
            : `<button type="button" class="button small secondary" data-l9-these-add data-pid="${pid}" ${kiosk() ? 'disabled' : ''}>${esc(T('✓ C’est lui'))}</button> <button type="button" class="button small secondary" data-l9-these-mark="no" data-pid="${pid}" ${kiosk() ? 'disabled' : ''}>${esc(T('✗ Pas lui'))}</button>`}</span></div></li>`;
    async function theseInto(host, pid, fresh = false) {
        const r = await (fresh ? api('l9b_these', {id: pid, fresh: 1}) : ask('l9b_these', {id: pid}));
        if (!host.isConnected && host.parentNode) return r;
        if (!r?.kind || r.private) { host.innerHTML = ''; return r; }
        if (!r.ok) { host.innerHTML = `<p class="cplus-lead">🎓 ${esc(T('Sa thèse : la recherche en ligne n’a pas abouti ({m}).', {m: r.message || T('hors ligne')}))} <button type="button" class="link-button" data-l9-these-retry="${pid}">${esc(T('↻ Réessayer'))}</button></p>`; return r; }
        const items = r.items || [];
        if (!items.length) { host.innerHTML = ''; return r; }
        const good = items.filter(x => x.verdict !== 'no'), f = good.find(x => x.verdict === 'added') || good[0];
        const lead = f ? `${f.kind || T(THESE_KIND[r.kind])}${f.discipline ? ` (${f.discipline})` : ''}${f.city ? `, ${f.city}` : ''}${f.year ? `, ${f.year}` : ''} : « ${f.title} »` : T('Toutes les thèses trouvées sont écartées (« pas lui »).');
        host.innerHTML = `<p class="cplus-lead">🎓 ${esc(lead)} ${f ? link(f.url, '↗', f.source) : ''}${f && f.verdict !== 'added' ? ` <small class="muted">${esc(T('— même nom, à vérifier'))}</small>` : ''}</p>
            ${more(`<ul class="tr-list">${items.map(x => theseRow(x, pid)).join('')}</ul><p class="muted"><small>${esc(T('Trouvé par son nom et son époque : ce n’est peut-être pas lui. « ✓ C’est lui » ajoute la source et un événement « Diplôme » marqué « à vérifier ».'))}</small></p>`, items.length)}
            ${srcLine(T('Sudoc (ABES) et theses.fr'), T('Licence Ouverte (Etalab)'), 'https://www.sudoc.abes.fr/', r.fetched_at ? ` · <small>${esc(T(r.cached ? 'gardé le {d}' : 'lu en ligne le {d}', {d: new Date(r.fetched_at * 1000).toLocaleDateString('fr-FR')}))}</small>` : '')}`;
        return r;
    }

    /* ═════════════ la fiche d'une personne : « 🌍 Son monde et ses coutumes » ═════════════ */
    const PERSON_ORDER = ['planete', 'etoiles', 'pape', 'sommets', 'sejours', 'voyages', 'gabelle', 'eclairage', 'these', 'compagnons', 'decorations', 'uniformes', 'mariage', 'deuil', 'nourrices'];
    const line = (k, html) => (html ? `<div class="tr-line l9-line" data-l9-line="${k}">${html}</div>` : '');
    async function personParts(P, want) {
        const L = lifeOf(P), out = {};
        const need = n => want(n);
        const [D, S, M, SE, V, PA, CC, U] = await Promise.all([need('planete') && tryLoad('planete'), need('etoiles') && tryLoad('etoiles'), need('sommets') && tryLoad('sommets'), need('sejours') && tryLoad('sejours'),
            need('voyages') && tryLoad('voyages'), need('pape') && tryLoad('papes'), ['compagnons', 'decorations', 'mariage', 'deuil', 'nourrices', 'gabelle', 'eclairage'].some(need) && tryLoad('coutumes'), need('uniformes') && tryLoad('uniformes')]);
        if (D) out.planete = planeteHtml(D, L);
        if (S) out.etoiles = etoilesHtml(S, L);
        if (PA) out.pape = papeHtml(PA, L);
        if (M) out.sommets = sommetsPerson(M, L);
        if (SE) out.sejours = sejoursPerson(SE, L);
        if (V) out.voyages = voyagesPerson(V, L);
        if (CC) {
            if (need('compagnons')) out.compagnons = compagnonsHtml(CC, P, L);
            if (need('decorations')) out.decorations = decorationsHtml(CC, P);
            if (need('mariage')) out.mariage = mariageHtml(CC, P, L);
            if (need('deuil')) out.deuil = deuilHtml(CC, P, L);
            if (need('nourrices')) out.nourrices = nourricesHtml(CC, P, L);
            if (need('eclairage')) { for (const p of L.places) { const h = eclairageHtml(CC, p, L); if (h) { out.eclairage = h; break; } } }
            if (need('gabelle') && L.by && L.by < 1790) {
                const AR = await loadAR().catch(() => null);
                const pls = [L.placeOf(L.birthEv), ...L.places].filter(p => p?.insee);
                for (const p of pls) { const h = gabelleHtml(CC, AR, p, true); if (h) { out.gabelle = h; break; } }
            }
        }
        if (U) out.uniformes = uniformesHtml(U, P, L);
        return {L, out};
    }
    async function fillPerson(host, id, only = null) {
        const want = k => (only ? only.includes(k) : on(k));
        const P = await ask('l9b_person', {id});
        if (!P?.ok || P.kind === 'animal') { host.innerHTML = ''; return P; }
        const {out} = await personParts(P, want);
        host.innerHTML = PERSON_ORDER.map(k => (k === 'these' ? (want('these') ? '<div class="tr-line l9-line" data-l9-line="these"></div>' : '') : line(k, out[k]))).join('');
        const card = host.closest?.('section.card');
        const show = () => { host.querySelectorAll('.l9-line').forEach(l => { if (!l.textContent.trim()) l.remove(); }); if (card) card.hidden = !host.querySelector('.l9-line'); };
        show();
        const th = host.querySelector('[data-l9-line="these"]');
        if (th) { await theseInto(th, id); show(); }
        return P;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.monde_coutumes = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !PARTS.some(x => x[0] !== 'langues' && x[0] !== 'journaux' && x[0] !== 'octroi' && on(x[0]))) return '';
        return A().card(index, T('🌍 Son monde et ses coutumes'), '', `<div class="tr-block l9-block" data-l9-person="${Number(p.id)}"></div>`, 'span-12').replace(/^(\s*<section class="card[^"]*")/, '$1 hidden');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => { W.document.querySelectorAll('#workspace [data-l9-person]:not([data-l9-done])').forEach(h => { h.dataset.l9Done = '1'; fillPerson(h, Number(h.dataset.l9Person)).catch(() => {}); }); });

    /* ═════════════ un lieu : fiche d'un village, monographie, 🧰 Données ═════════════ */
    const PLACE_PARTS = {sommets: '🏔️ Les premières ascensions autour', sejours: '🖋️ Les célébrités de passage', voyages: '🐎 Les grands voyages', gabelle: '🧂 Le prix du sel (avant 1790)', octroi: '🚧 L’octroi',
        eclairage: '🕯️ L’éclairage des rues', journaux: '🗞️ Les journaux du département', langues: '🌐 Son nom dans toutes les langues'};
    async function resolvePlace(pl) {
        if (pl?.insee && pl.lat != null) return pl;
        const q = Object.fromEntries(Object.entries({place_id: Number(pl?.id) || '', name: pl?.name || '', insee: pl?.insee || '', lat: pl?.lat ?? '', lon: pl?.lon ?? '', county: pl?.county || '', country: pl?.country || ''}).filter(([, v]) => v !== '' && v != null));
        const r = await ask('l9b_place', q);
        return r?.place ? {...pl, ...r.place, name: pl?.name || r.place.name} : pl;
    }
    async function placePart(k, pl, {year = null} = {}) {
        if (k === 'sommets') return sommetsPlace(await tryLoad('sommets'), pl);
        if (k === 'sejours') return sejoursPlace(await tryLoad('sejours'), pl);
        if (k === 'voyages') return voyagesPlace(await tryLoad('voyages'), pl);
        if (k === 'gabelle') { const [CC, AR] = await Promise.all([tryLoad('coutumes'), loadAR().catch(() => null)]); return gabelleHtml(CC, AR, pl); }
        if (k === 'octroi') return octroiHtml(await tryLoad('coutumes'), pl);
        if (k === 'eclairage') return eclairageHtml(await tryLoad('coutumes'), pl);
        if (k === 'journaux') return journauxHtml(await tryLoad('journaux'), pl, year);
        if (k === 'langues') return languesHtml(pl);
        return '';
    }
    const panel = (id, title, body) => `<section class="maintenance-panel cplus-panel tr-panel l9-panel" data-l9-part="${id}"><h3>${esc(title)}</h3>${body}</section>`;
    async function placeInto(host, place, {parts = null, year = null} = {}) {
        const want = k => (parts ? parts.includes(k) : on(k));
        const pl = await resolvePlace(place);
        const keys = Object.keys(PLACE_PARTS).filter(want);
        const html = await Promise.all(keys.map(k => placePart(k, pl, {year}).catch(() => '')));
        if (host.isConnected === false) return pl;
        host.innerHTML = keys.map((k, i) => (html[i] ? (k === 'langues' ? `<div class="l9-panel-lang" data-l9-part="langues">${html[i]}</div>` : panel(k, T(PLACE_PARTS[k]), html[i])) : '')).join('');
        return pl;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(), lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || village.querySelector('[data-cad-insee]')?.dataset.cadInsee || ''};
    }
    function decorate() {
        const ws = W.document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-l9])'); if (!village) return;
        village.dataset.l9 = '1';
        if (!Object.keys(PLACE_PARTS).some(on)) return;
        const place = villagePlace(village); if (!place.id && !place.insee && !place.name) return;
        const anchor = village.querySelector('[data-tr-host]') || village.querySelector('[data-cc-host]') || village.querySelector('[data-mr-host]') || village.querySelector('[data-lp-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="tr-place l9-place" data-l9-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-l9-host]'), place).catch(() => {});
    }
    if (W.document && typeof MutationObserver !== 'undefined') {
        let pending = 0;
        new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; try { decorate(); } catch (e) { console.error(e); } }); }).observe(W.document.documentElement, {childList: true, subtree: true});
    }

    /* ═════════════ les clics ═════════════ */
    async function theseAction(btn) {
        const li = btn.closest('[data-l9-these-key]'), key = li?.dataset.l9TheseKey, pid = Number(btn.dataset.pid), host = btn.closest('[data-l9-line="these"], .l9-these-host');
        const redraw = () => { memo.delete('l9b_these' + JSON.stringify({id: pid})); if (host) theseInto(host, pid); };
        try {
            if (btn.hasAttribute('data-l9-these-add')) {
                const r = await post('l9b_these_add', {person_id: pid, key}); if (r?.error) throw new Error(r.error);
                redraw();
                A().undoToast?.(T('＋ Source et diplôme « à vérifier » ajoutés à sa fiche'), {undo: async () => { await post('l9b_these_undo', {batch: r.batch}); redraw(); }});
            } else if (btn.hasAttribute('data-l9-these-undo')) {
                await post('l9b_these_undo', {batch: btn.dataset.l9TheseUndo}); redraw(); A().toast?.(T('Ajout annulé.'));
            } else if (btn.hasAttribute('data-l9-these-mark')) {
                const v = btn.dataset.l9TheseMark;
                const r = await post('l9b_these_mark', {person_id: pid, key, verdict: v}); if (r?.error) throw new Error(r.error);
                redraw();
                if (v === 'no') A().undoToast?.(T('✗ Écarté : ce n’est pas cette personne.'), {undo: async () => { await post('l9b_these_mark', {person_id: pid, key, verdict: ''}); redraw(); }});
            }
        } catch (e) { A().toast?.(e.message, 'error'); }
    }
    async function medaillesDialog() {
        const CC = await tryLoad('coutumes'); const html = medaillesHtml(CC); if (!html) return;
        if (UI().dialog) { UI().dialog({title: T('🎖️ Reconnaître une médaille'), body: `<div class="l9-dialog">${html}</div>`, wide: true}); return; }
        const d = W.document.createElement('dialog'); d.className = 'l9-dlg'; d.innerHTML = `<form method="dialog"><h3>${esc(T('🎖️ Reconnaître une médaille'))}</h3><div class="l9-dialog">${html}</div><p class="page-actions"><button class="button">${esc(T('Fermer'))}</button></p></form>`;
        W.document.body.appendChild(d); d.addEventListener('close', () => d.remove()); d.showModal?.();
    }
    if (W.document) {
        W.document.addEventListener('click', e => {
            const t = e.target.closest?.('[data-l9-these-add], [data-l9-these-undo], [data-l9-these-mark]'); if (t) { e.preventDefault(); theseAction(t); return; }
            const r = e.target.closest?.('[data-l9-these-retry]'); if (r) { const h = r.closest('[data-l9-line="these"], .l9-these-host'); if (h) theseInto(h, Number(r.dataset.l9TheseRetry), true); return; }
            if (e.target.closest?.('[data-l9-medailles]')) { e.preventDefault(); medaillesDialog(); return; }
            const o = e.target.closest?.('[data-l9-ouc]'); if (o) { e.preventDefault(); ext.ouChercher?.openPerson?.(Number(o.dataset.l9Ouc)); return; }
            if (e.target.closest?.('[data-l9-clear]')) clearCache();
        });
        W.document.addEventListener('change', e => { const t = e.target.closest?.('[data-l9-tg]'); if (t && e.target.matches('input')) { const s = settings(); s[t.dataset.l9Tg] = e.target.checked; save(s); } });
    }

    /* ═════════════ 🌍 « Où chercher » : les registres des nourrices ═════════════ */
    const oc = ext.ouChercher = ext.ouChercher || {};
    (oc.afterRedraw = oc.afterRedraw || []).push((view, body) => {
        if (!on('nourrices') || !view?.pid || !body || body.querySelector('[data-l9-ouc-nourrice]')) return;
        Promise.all([ask('l9b_person', {id: view.pid}), tryLoad('coutumes')]).then(([P, CC]) => {
            if (!P?.ok || !CC?.nourrices || body.querySelector('[data-l9-ouc-nourrice]')) return;
            const L = lifeOf(P), c = nourriceCase(P, L); if (!c) return;
            const N = CC.nourrices, where = c.away ? placeName(c.away.d) : '';
            const html = `<details class="ouc-guides l9-ouc" data-l9-ouc-nourrice><summary>👶 ${esc(T('Les registres des nourrices'))} <small class="muted">${esc(where ? T('le bébé est mort à {p} : là où vivait sans doute sa nourrice', {p: where}) : T('sa fiche parle de nourrice'))}</small></summary>
                <ul class="dp-lines">${N.where.map(w => `<li class="dp-line"><span class="dp-ico" aria-hidden="true">${esc(w.icon)}</span><div>${esc(T(w.t))} ${w.url ? link(w.url) : ''}</div></li>`).join('')}</ul>${srcLine(N.src.title, 'CC BY-SA 4.0', N.src.url)}</details>`;
            const after = body.querySelector('[data-dp-ouc]') || body.querySelector('[data-ouc-plus]') || body.querySelector('.ouc-facts');
            if (after) after.insertAdjacentHTML('afterend', html); else body.insertAdjacentHTML('afterbegin', html);
        }).catch(() => {});
    });

    /* ═════════════ 📜 Monographie de commune ═════════════ */
    const monoPlace = pl => ({id: Number(pl?.id) || 0, name: pl?.name || '', lat: pl?.latitude ?? pl?.lat ?? null, lon: pl?.longitude ?? pl?.lon ?? null, country: pl?.country || '', county: pl?.county || ''});
    const monoRun = part => async (place, host, ctx) => {
        let insee = ''; try { insee = (await ctx?.village?.())?.insee || ''; } catch (_) {}
        let year = null;
        if (part === 'journaux') { try { const y = await ctx?.years?.(); if (y?.from) year = Math.round(((y.from || 0) + (y.to || y.from)) / 2); } catch (_) {} }
        const pl = await resolvePlace({...monoPlace(place), insee});
        const html = await placePart(part, pl, {year: year || null});
        if (!html) { host.innerHTML = ''; return false; }
        host.innerHTML = html; return true;
    };
    (ext.monographSections = ext.monographSections || []).push(
        {id: 'l9_sommets', icon: '🏔️', label: T('Les premières ascensions autour'), group: 'Le lieu', defaultOn: true, enabled: () => on('sommets'), render: monoRun('sommets')},
        {id: 'l9_sejours', icon: '🖋️', label: T('Les célébrités de passage'), group: 'Le lieu', defaultOn: true, enabled: () => on('sejours'), render: monoRun('sejours')},
        {id: 'l9_voyages', icon: '🐎', label: T('Napoléon, les rois et les grands voyages'), group: 'Le lieu', defaultOn: true, enabled: () => on('voyages'), render: monoRun('voyages')},
        {id: 'l9_gabelle', icon: '🧂', label: T('Le prix du sel (la gabelle)'), group: 'Le lieu', defaultOn: true, enabled: () => on('gabelle'), render: monoRun('gabelle')},
        {id: 'l9_octroi', icon: '🚧', label: T('L’octroi de la ville'), group: 'Le lieu', defaultOn: true, enabled: () => on('octroi'), render: monoRun('octroi')},
        {id: 'l9_eclairage', icon: '🕯️', label: T('L’éclairage des rues'), group: 'Le lieu', defaultOn: true, enabled: () => on('eclairage'), render: monoRun('eclairage')},
        {id: 'l9_journaux', icon: '🗞️', label: T('Les journaux qu’on lisait ici'), group: 'Le lieu', defaultOn: true, enabled: () => on('journaux'), source: 'BnF, data.bnf.fr (Licence Ouverte)', render: monoRun('journaux')},
        {id: 'l9_langues', icon: '🌐', label: T('Le nom dans toutes les langues'), group: 'Le lieu', defaultOn: false, enabled: () => on('langues'), render: monoRun('langues')});

    /* ═════════════ 🧰 à la demande : le registre commun des données ═════════════ */
    const emptyLine = (text, icon = 'ℹ️') => (A().emptyState ? A().emptyState({text, icon, size: 'small'}) : `<p class="muted">${esc(text)}</p>`);
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null, county: pl.county || '', country: pl.country || ''} : null);
    const personId = ctx => Number(ctx?.person?.id || ctx?.person?.person?.id || ctx?.person) || 0;
    async function runPerson(ctx, host, only) {
        const id = personId(ctx); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return false; }
        host.innerHTML = '<div class="tr-block l9-block"></div>';
        await fillPerson(host.firstElementChild, id, only);
        if (!host.textContent.trim()) { host.innerHTML = ''; return false; }
        return true;
    }
    async function runPlace(part, ctx, host) {
        const pl = placeOfCtx(ctx?.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return false; }
        const r = await resolvePlace(pl);
        const html = await placePart(part, r, {year: Number(ctx.year) || null});
        host.innerHTML = html || ''; return !!html;
    }
    async function runYear(part, ctx, host) {
        const y = Number(ctx?.year); if (!y) { host.innerHTML = emptyLine(T('Choisis une année.'), '📅'); return false; }
        let html = '';
        if (part === 'planete') { const D = await tryLoad('planete'); const p = planetAt(D, y); if (p?.pop || p?.co2) html = `<p class="cplus-lead">🌍 ${esc(T('En {y} : {b}.', {y, b: planetBits(p)}))}</p>${planetSources(D, [p])}`; }
        if (part === 'pape') { const D = await tryLoad('papes'); const ps = popeAt(D, String(y)); if (ps.length) html = `<p class="cplus-lead">⛪ ${esc(T('Le pape en {y} :', {y}))} ${ps.map(p => `<b>${esc(p.n)}</b> ${link(p.wp || `https://www.wikidata.org/wiki/${p.q}`, '↗')}`).join(' / ')}</p>${srcLine('Wikidata', 'CC0 1.0', 'https://www.wikidata.org/wiki/Q19546')}`; }
        if (part === 'etoiles') { const D = await tryLoad('etoiles'); const rs = (D?.rows || []).filter(r => r.y === y); if (rs.length) html = `<p class="cplus-lead">✨ ${esc(T('En {y}, une étoile nouvelle visible à l’œil nu : {n}.', {y, n: listFr(rs.map(r => T(r.n)))}))} ${link(rs[0].wp || rs[0].src)}</p>`; }
        host.innerHTML = html; return !!html;
    }
    const DS = [
        ['planete', '🌍', 'La planète de son vivant (humains, CO₂, température)', ['person'], 'Le monde'], ['etoiles', '✨', 'Les étoiles nouvelles qu’il a pu voir', ['person'], 'Le monde'],
        ['sommets', '🏔️', 'Les premières ascensions de son vivant (100 km)', ['person'], 'La personne'], ['sejours', '🖋️', 'Les célébrités de passage dans ses communes', ['person'], 'La personne'],
        ['voyages', '🐎', 'Napoléon, les rois et les grands voyages chez lui', ['person'], 'La personne'], ['pape', '⛪', 'Le pape de son baptême', ['person'], 'La personne'],
        ['these', '🎓', 'Sa thèse (Sudoc, theses.fr)', ['person'], 'Chercher'], ['compagnons', '🛠️', 'Les compagnons du Tour de France', ['person'], 'La personne'],
        ['decorations', '🎖️', 'Ses décorations expliquées', ['person'], 'La personne'], ['uniformes', '👕', 'Les uniformes de son époque', ['person'], 'La personne'],
        ['mariage', '💍', 'Les coutumes du mariage dans sa région', ['person'], 'La personne'], ['deuil', '⚰️', 'Le deuil de son temps', ['person'], 'La personne'],
        ['nourrices', '👶', 'Les nourrices', ['person'], 'La personne'], ['gabelle', '🧂', 'Le prix du sel (gabelle) de son pays', ['person'], 'La personne'], ['eclairage', '🕯️', 'L’éclairage de sa rue', ['person'], 'La personne']];
    (ext.dataSources = ext.dataSources || []).push(
        ...DS.map(([k, icon, label, needs, group]) => ({id: `l9_${k}`, icon, label: T(label), group, needs, installed: () => true, online: k === 'these', run: (ctx, host) => runPerson(ctx, host, [k])})),
        ...['sommets', 'sejours', 'voyages', 'gabelle', 'octroi', 'eclairage', 'journaux', 'langues'].map(k => ({id: `l9_lieu_${k}`, icon: PLACE_PARTS[k].split(' ')[0], label: T(PLACE_PARTS[k].replace(/^\S+\s/, '')), group: 'Le lieu', needs: ['place'], online: k === 'langues', installed: () => true, run: (ctx, host) => runPlace(k, ctx, host)})),
        ...['planete', 'pape', 'etoiles'].map(k => ({id: `l9_annee_${k}`, icon: {planete: '🌍', pape: '⛪', etoiles: '✨'}[k], label: T({planete: 'La planète cette année-là', pape: 'Le pape cette année-là', etoiles: 'Une étoile nouvelle cette année-là'}[k]), group: 'Le monde', needs: ['year'], installed: () => true, run: (ctx, host) => runYear(k, ctx, host)})),
        {id: 'l9_medailles', icon: '🎖️', label: T('Reconnaître une médaille'), group: 'Chercher', needs: [], installed: () => true, run: async (ctx, host) => { const h = medaillesHtml(await tryLoad('coutumes')); host.innerHTML = h; return !!h; }});

    /* ═════════════ 🧰 Listes → Données ═════════════ */
    const openUrl = u => { if (u) W.open?.(u, '_blank', 'noopener'); };
    const rowsOf = async (name, map) => { const D = await load(name); return map(D); };
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'l9_etoiles', icon: '✨', label: T('Étoiles nouvelles visibles à l’œil nu'), group: 'Le monde', source: T('Wikipédia (CC BY-SA 4.0)'), sourceUrl: 'https://en.wikipedia.org/wiki/List_of_novae_in_the_Milky_Way', enabled: () => on('etoiles'),
            load: () => rowsOf('etoiles', D => D.rows.map(r => ({name: T(r.n), year: r.y, date: r.d, kind: T(r.kind === 'supernova' ? 'supernova' : 'nova'), mag: r.mag, con: T(r.con), url: r.wp || r.src}))),
            fields: [{key: 'name', label: T('Étoile'), type: 'text'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'date', label: T('Date'), type: 'text'}, {key: 'kind', label: T('Sorte'), type: 'enum', values: [T('nova'), T('supernova')]}, {key: 'mag', label: T('Éclat'), type: 'number'}, {key: 'con', label: T('Constellation'), type: 'enum'}, {key: 'url', label: T('Source'), type: 'url'}],
            period: r => [r.year, r.year], open: r => openUrl(r.url)},
        {id: 'l9_sommets', icon: '🏔️', label: T('Premières ascensions des sommets'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/wiki/Q1194369', enabled: () => on('sommets'),
            load: () => rowsOf('sommets', D => D.rows.map(m => ({name: m.n, date: m.d, year: yOf(m.d), alt: m.alt, who: (m.who || []).join(', '), lat: m.lat, lon: m.lon, url: `https://www.wikidata.org/wiki/${m.q}`, wp: m.wp}))),
            fields: [{key: 'name', label: T('Sommet'), type: 'text'}, {key: 'year', label: T('Première ascension'), type: 'year'}, {key: 'date', label: T('Date'), type: 'text'}, {key: 'alt', label: T('Altitude (m)'), type: 'number'}, {key: 'who', label: T('Par'), type: 'text'}, {key: 'url', label: T('Source (Wikidata)'), type: 'url'}, {key: 'wp', label: 'Wikipédia', type: 'url'}],
            period: r => [r.year, r.year], geo: r => [r.lat, r.lon], open: r => openUrl(r.wp || r.url)},
        {id: 'l9_sejours', icon: '🖋️', label: T('Célébrités de passage (résidences datées)'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/wiki/Property:P551', enabled: () => on('sejours'),
            load: () => rowsOf('sejours', D => D.rows.map(r => ({name: r.n, occ: (r.occ || []).map(T).join(', '), commune: r.pl, insee: r.insee, from: yOf(r.s), to: yOf(r.e) || yOf(r.s), lat: r.lat, lon: r.lon, url: `https://www.wikidata.org/wiki/${r.q}`, wp: r.wp}))),
            fields: [{key: 'name', label: T('Personnalité'), type: 'text'}, {key: 'occ', label: T('Métier'), type: 'text'}, {key: 'commune', label: T('Commune'), type: 'place'}, {key: 'from', label: T('De'), type: 'year'}, {key: 'to', label: T('À'), type: 'year'}, {key: 'url', label: T('Source (Wikidata)'), type: 'url'}, {key: 'wp', label: 'Wikipédia', type: 'url'}],
            period: r => [r.from, r.to], geo: r => (r.lat != null ? [r.lat, r.lon] : null), open: r => openUrl(r.wp || r.url)},
        {id: 'l9_voyages', icon: '🐎', label: T('Grands voyages : les étapes'), group: 'Le monde', source: T('Wikipédia (CC BY-SA 4.0)'), sourceUrl: 'https://fr.wikipedia.org/wiki/Route_Napol%C3%A9on', enabled: () => on('voyages'),
            load: () => rowsOf('voyages', D => D.trips.flatMap(t => t.stops.map(s => ({trip: T(t.title), who: T(t.who), commune: s.n, insee: s.insee, date: s.d, year: yOf(s.d), lat: s.lat, lon: s.lon, url: s.url || t.src.url})))),
            fields: [{key: 'trip', label: T('Voyage'), type: 'enum'}, {key: 'who', label: T('Qui'), type: 'enum'}, {key: 'commune', label: T('Étape'), type: 'place'}, {key: 'date', label: T('Date'), type: 'text'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'url', label: T('Source'), type: 'url'}],
            period: r => [r.year, r.year], geo: r => (r.lat != null ? [r.lat, r.lon] : null), open: r => openUrl(r.url)},
        {id: 'l9_papes', icon: '⛪', label: T('Les papes'), group: 'Le monde', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/wiki/Q19546', enabled: () => on('pape'),
            load: () => rowsOf('papes', D => D.rows.map(p => ({name: p.n, from: yOf(p.s), to: yOf(p.e), start: p.s, end: p.e, url: `https://www.wikidata.org/wiki/${p.q}`, wp: p.wp}))),
            fields: [{key: 'name', label: T('Pape'), type: 'text'}, {key: 'from', label: T('Élu'), type: 'year'}, {key: 'to', label: T('Jusqu’à'), type: 'year'}, {key: 'start', label: T('Début'), type: 'text'}, {key: 'end', label: T('Fin'), type: 'text'}, {key: 'url', label: T('Source (Wikidata)'), type: 'url'}, {key: 'wp', label: 'Wikipédia', type: 'url'}],
            period: r => [r.from, r.to || r.from], open: r => openUrl(r.wp || r.url)},
        {id: 'l9_decorations', icon: '🎖️', label: T('Décorations françaises expliquées'), group: 'La personne', source: T('Wikipédia (CC BY-SA 4.0), images Wikimedia Commons'), sourceUrl: 'https://fr.wikipedia.org/wiki/Liste_des_d%C3%A9corations_civiles_et_militaires_fran%C3%A7aises', enabled: () => on('decorations'),
            load: () => rowsOf('coutumes', D => D.decorations.map(d => ({name: T(d.n), year: d.y, who: T(d.who), quote: d.q, image: d.image?.page || '', url: d.url}))),
            fields: [{key: 'name', label: T('Décoration'), type: 'text'}, {key: 'year', label: T('Créée'), type: 'year'}, {key: 'who', label: T('Pour qui'), type: 'text'}, {key: 'quote', label: T('Phrase de la source'), type: 'text'}, {key: 'image', label: T('Image (auteur et licence sur sa page)'), type: 'url'}, {key: 'url', label: T('Source'), type: 'url'}],
            period: r => [r.year, null], open: r => openUrl(r.url)},
        {id: 'l9_uniformes', icon: '👕', label: T('Uniformes d’autrefois (gravures)'), group: 'La personne', source: T('Wikimedia Commons (licence de chaque image)'), sourceUrl: 'https://commons.wikimedia.org/', enabled: () => on('uniformes'),
            load: () => rowsOf('uniformes', D => D.rows.map(r => ({name: r.title, from: r.from, to: r.to, arm: T(r.arm || 'divers'), date: r.date || '', credit: `${r.author ? `${r.author} · ` : ''}${r.licence}`, url: r.page}))),
            fields: [{key: 'name', label: T('Gravure'), type: 'text'}, {key: 'from', label: T('De'), type: 'year'}, {key: 'to', label: T('À'), type: 'year'}, {key: 'arm', label: T('Arme'), type: 'enum'}, {key: 'date', label: T('Date de l’image'), type: 'text'}, {key: 'credit', label: T('Auteur et licence'), type: 'text'}, {key: 'url', label: T('Source (Commons)'), type: 'url'}],
            period: r => [r.from, r.to], open: r => openUrl(r.url)},
        {id: 'l9_villes', icon: '🚧', label: T('Octroi et éclairage des villes'), group: 'Le lieu', source: T('Wikipédia (CC BY-SA 4.0)'), sourceUrl: 'https://fr.wikipedia.org/wiki/Octroi', enabled: () => on('octroi') || on('eclairage'),
            load: () => rowsOf('coutumes', D => [...(D.octroi?.cities || []).map(c => ({what: T('🚧 octroi'), commune: c.n, insee: c.insee, year: c.y || null, text: T(c.t), quote: c.q, url: c.url})),
                ...(D.eclairage?.cities || []).flatMap(c => c.facts.map(f => ({what: T('🕯️ éclairage'), commune: c.n, insee: c.insee, year: f.y, text: T(f.t), quote: f.q, url: f.url})))]),
            fields: [{key: 'what', label: T('Sujet'), type: 'enum'}, {key: 'commune', label: T('Ville'), type: 'place'}, {key: 'year', label: T('Année'), type: 'year'}, {key: 'text', label: T('Ce qu’on sait'), type: 'text'}, {key: 'quote', label: T('Phrase de la source'), type: 'text'}, {key: 'url', label: T('Source'), type: 'url'}],
            period: r => [r.year, r.year], open: r => openUrl(r.url)},
        {id: 'l9_coutumes', icon: '💍', label: T('Coutumes : mariage et deuil (textes anciens)'), group: 'La personne', source: T('Wikisource, Internet Archive (domaine public)'), sourceUrl: 'https://fr.wikisource.org/', enabled: () => on('mariage') || on('deuil'),
            load: () => rowsOf('coutumes', D => [...(D.mariage || []).flatMap(r => r.items.map(i => ({what: T('💍 mariage'), region: T(r.region), author: r.author, year: r.year, quote: i.q, url: i.url}))),
                ...(D.deuil?.rules || []).map(r => ({what: T('⚰️ deuil'), region: '', author: D.deuil.src.short, year: D.deuil.src.year, quote: r.q, url: D.deuil.src.url}))]),
            fields: [{key: 'what', label: T('Sujet'), type: 'enum'}, {key: 'region', label: T('Région'), type: 'enum'}, {key: 'author', label: T('Auteur'), type: 'text'}, {key: 'year', label: T('Paru en'), type: 'year'}, {key: 'quote', label: T('Extrait'), type: 'text'}, {key: 'url', label: T('Source'), type: 'url'}],
            open: r => openUrl(r.url)},
        {id: 'l9_journaux', icon: '🗞️', label: T('Journaux anciens des départements (BnF)'), group: 'Le lieu', source: T('BnF, data.bnf.fr (Licence Ouverte)'), sourceUrl: 'https://data.bnf.fr/', enabled: () => on('journaux'),
            load: () => rowsOf('journaux', D => D.rows.map(r => ({name: r.t, commune: r.p || '', dep: Array.isArray(r.i) ? '' : depOf(r.i || ''), from: r.y1 || null, to: r.y2 || r.y1 || null, freq: r.f || '', gallica: r.g ? `https://gallica.bnf.fr/ark:/12148/${r.a}/date` : '', url: `https://data.bnf.fr/ark:/12148/${r.a}`}))),
            fields: [{key: 'name', label: T('Titre'), type: 'text'}, {key: 'commune', label: T('Publié à'), type: 'place'}, {key: 'dep', label: T('Département'), type: 'enum'}, {key: 'from', label: T('De'), type: 'year'}, {key: 'to', label: T('À'), type: 'year'}, {key: 'freq', label: T('Périodicité'), type: 'text'}, {key: 'gallica', label: 'Gallica', type: 'url'}, {key: 'url', label: T('Source (BnF)'), type: 'url'}],
            period: r => [r.from, r.to], open: r => openUrl(r.gallica || r.url)},
        {id: 'l9_gabelle', icon: '🧂', label: T('Pays de gabelle (avant 1790)'), group: 'Le lieu', source: T('Wikipédia « Gabelle du sel » (CC BY-SA 4.0) et atlas d’Ancien Régime (CC BY-SA 4.0)'), sourceUrl: 'https://fr.wikipedia.org/wiki/Gabelle_du_sel', enabled: () => on('gabelle'),
            load: async () => { const [CC, AR] = await Promise.all([load('coutumes'), loadAR()]); const cc = await readGz('assets/data/cc-communes.json.gz').catch(() => null); return Object.keys(AR.c).map(insee => { const g = gabelleOf(CC, AR, insee); const c = cc?.c?.[insee]; return g ? {commune: AR.c[insee][0], insee, cat: T(CC.gabelle.cats[g.cat].label), why: `${T(g.why)} : ${g.names[g.why === 'la généralité' ? 'g' : g.why === 'le bailliage' ? 'b' : 'p'] || ''}`, lat: c?.[1] ?? null, lon: c?.[2] ?? null, url: CC.gabelle.src.url} : null; }).filter(Boolean); },
            fields: [{key: 'commune', label: T('Commune'), type: 'place'}, {key: 'cat', label: T('Pays de gabelle'), type: 'enum'}, {key: 'why', label: T('D’après'), type: 'text'}, {key: 'url', label: T('Source'), type: 'url'}],
            geo: r => (r.lat != null ? [r.lat, r.lon] : null), open: r => openUrl(r.url)});

    /* ═════════════ 🗺 sur les cartes : les pays de gabelle ═════════════ */
    (ext.mapLayerSources = ext.mapLayerSources || []).push({id: 'l9_gabelle', icon: '🧂', label: T('Pays de gabelle avant 1790 (communes)'), group: 'Le monde', kind: 'points',
        source: T('Wikipédia « Gabelle du sel » (CC BY-SA 4.0) · atlas d’Ancien Régime, Th. Fressin (CC BY-SA 4.0) · communes : IGN (Licence Ouverte)'),
        run: async ({q, bbox, max = 4000}) => {
            const [CC, AR, cc] = await Promise.all([load('coutumes'), loadAR(), readGz('assets/data/cc-communes.json.gz')]);
            const features = [];
            const inBox = (lat, lon) => !bbox || (lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3]);
            for (const insee of Object.keys(AR.c)) {
                if (features.length >= max) break;
                const c = cc.c[insee]; if (!c || c[1] == null || !inBox(c[1], c[2])) continue;
                const g = gabelleOf(CC, AR, insee); if (!g) continue;
                const label = T(CC.gabelle.cats[g.cat].label); if (q && !fold(label).includes(fold(q)) && !fold(c[0]).includes(fold(q))) continue;
                features.push({type: 'pt', lat: c[1], lon: c[2], label, cat: g.cat, color: CC.gabelle.cats[g.cat].color});
            }
            return {features, source: T('Pays de gabelle d’après Wikipédia « Gabelle du sel » et l’atlas d’Ancien Régime (CC BY-SA 4.0)')};
        }});

    /* ═════════════ Réglages → 🌍 Monde et coutumes ═════════════ */
    const fmtSize = b => (b >= 1e6 ? `${String(Math.round(b / 1e5) / 10).replace('.', ',')} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`);
    const ABOUT = [
        ['planete', 'ONU (World Population Prospects 2024), Our World in Data d’après HYDE, NOAA (Law Dome, Mauna Loa, NOAAGlobalTemp)', 'Population du monde, CO₂, température', 'CC BY 3.0 IGO ; CC BY 4.0 ; domaine public', 'https://population.un.org/wpp/'],
        ['etoiles', 'Wikipédia (listes des novae et des supernovae)', 'Étoiles nouvelles visibles à l’œil nu', 'CC BY-SA 4.0', 'https://en.wikipedia.org/wiki/List_of_novae_in_the_Milky_Way'],
        ['sommets', 'Wikidata', 'Premières ascensions datées', 'CC0 1.0', 'https://www.wikidata.org/wiki/Q1194369'],
        ['sejours', 'Wikidata', 'Résidences datées des écrivains, artistes, savants', 'CC0 1.0', 'https://www.wikidata.org/wiki/Property:P551'],
        ['voyages', 'Wikipédia (Route Napoléon, fuite à Varennes, tour de France de Charles IX…)', 'Étapes datées des grands voyages', 'CC BY-SA 4.0', 'https://fr.wikipedia.org/wiki/Route_Napol%C3%A9on'],
        ['papes', 'Wikidata', 'Les papes et leurs dates', 'CC0 1.0', 'https://www.wikidata.org/wiki/Q19546'],
        ['coutumes', 'Wikipédia, Wikisource, Internet Archive (textes du domaine public), atlas d’Ancien Régime', 'Compagnons, décorations, mariage, deuil, nourrices, gabelle, octroi, éclairage', 'CC BY-SA 4.0 ; domaine public', 'https://fr.wikisource.org/'],
        ['uniformes', 'Wikimedia Commons', 'Gravures d’uniformes du domaine public', 'licence de chaque image', 'https://commons.wikimedia.org/'],
        ['journaux', 'BnF, data.bnf.fr (Presse locale ancienne)', 'Les journaux anciens des départements', 'Licence Ouverte (Etalab)', 'https://data.bnf.fr/']];
    async function sizes() { const out = {}; await Promise.all(ABOUT.map(async a => { try { const r = await fetch(`assets/data/l9b-${a[0]}.json.gz`, {method: 'HEAD'}); out[a[0]] = Number(r.headers.get('content-length')) || 0; } catch (_) { out[a[0]] = 0; } })); return out; }
    async function clearCache() {
        try {
            const res = await post('l9b_cache_clear', {}); memo.clear(); drawSettings();
            A().undoToast?.(T('Réponses gardées effacées ({n}).', {n: res.removed}), {undo: async () => { await post('l9b_cache_restore', {token: res.token}); memo.clear(); drawSettings(); }});
        } catch (err) { A().toast?.(err.message, 'error'); }
    }
    async function drawSettings(token) {
        const ws = W.document.getElementById('workspace'); if (!ws) return;
        let about = {cache: {count: 0, bytes: 0}}; try { about = await api('l9b_about'); } catch (_) {}
        const sz = await sizes();
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([k, label, sub]) => `<label class="checkbox-line cplus-tg" data-l9-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const rows = ABOUT.map(([k, label, what, lic, url]) => `<tr><td>${link(url, T(label))}</td><td>${esc(T(what))}</td><td>${esc(sz[k] ? T('dans l’app ({s})', {s: fmtSize(sz[k])}) : T('pas encore là'))}</td><td>${esc(T(lic))}</td></tr>`).join('');
        ws.innerHTML = `<section class="page cplus-settings l9-settings" data-l9-settings>${UI().pageHeader ? UI().pageHeader({title: T('Monde et coutumes'), icon: '🌍', where: T('Réglages · Données'), help: esc(T('La planète, le ciel, les montagnes, les célébrités et les voyages de son époque ; les coutumes (mariage, deuil, nourrices, compagnons, décorations, uniformes) ; la gabelle, l’octroi, l’éclairage, les journaux et le nom de son village dans toutes les langues.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('Gardé sur l’ordinateur'))}</h3><p>${esc(T('Les thèses et les noms en toutes langues trouvés en ligne : {n} réponses gardées ({k} Ko).', {n: about.cache?.count || 0, k: Math.max(1, Math.round((about.cache?.bytes || 0) / 1024))}))}</p>
                <div class="page-actions"><button type="button" class="button secondary" data-l9-clear ${about.cache?.count && !kiosk() ? '' : 'disabled'}>${esc(T('🗑 Effacer les réponses gardées'))}</button></div></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Source'))}</th><th>${esc(T('Ce qu’elle donne'))}</th><th>${esc(T('Où'))}</th><th>${esc(T('Licence'))}</th></tr></thead><tbody>${rows}
                <tr><td>${link('https://www.sudoc.abes.fr/', T('Sudoc et theses.fr (ABES), en ligne'))}</td><td>${esc(T('Les thèses (médecine, pharmacie, droit…)'))}</td><td>${esc(T('en ligne, gardé'))}</td><td>${esc(T('Licence Ouverte (Etalab)'))}</td></tr>
                <tr><td>${link('https://www.wikidata.org/', T('Wikidata, en ligne'))}</td><td>${esc(T('Le nom des communes dans toutes les langues'))}</td><td>${esc(T('en ligne, gardé'))}</td><td>CC0 1.0</td></tr></tbody></table></div>
                <p class="muted">${esc(T('Ce qui part sur Internet : le nom et le prénom d’un médecin, pharmacien ou avocat mort (jamais d’une personne vivante ni d’une fiche confidentielle) pour chercher sa thèse, et le code INSEE d’une commune pour son nom en toutes langues. Tout le reste est dans l’app.'))}</p></div></section>`;
    }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);
    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { const i = ['terroir', 'commune_culture', 'commune_plus'].map(k => tabs.findIndex(t => t[0] === k)).find(j => j >= 0); tabs.splice(i === undefined ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === 'monde_coutumes')) {
            const after = ['terroir', 'sky_seen', 'world', 'histoire'].map(k => B.findIndex(b => b[0] === k)).find(i => i >= 0);
            B.splice(after === undefined ? B.length : after + 1, 0, ['monde_coutumes', '🌍 Son monde et ses coutumes']);
        }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans.monde_coutumes ||= '12';
        return !!tabs;
    }
    if (W.document && !register()) W.document.addEventListener('DOMContentLoaded', register, {once: true});

    const pub = {settings, lifeOf, planetAt, planeteHtml, etoilesSeen, sommetsNear, popeAt, gabelleOf, journauxFor, nourriceCase, soldierOf, decoFound, fillPerson, placeInto, theseInto, medaillesHtml, load, decorate,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
    ext.mondeCoutumes = pub;
    return pub;
});
