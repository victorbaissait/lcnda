/* LCNDA — 🪨🗣️💬 Terre et mots du village (serveur : lib/terre_mots.php ; style : assets/css/terre-mots.css ;
 * données : assets/data/tm-*.json.gz, refaites par scripts/terre-mots/).
 *  🪨 le sol et le relief (roche BRGM 1/1 000 000 via EGDI, altitude IGN, une phrase de Wikipédia) · 🏚️ les villages disparus ·
 *  🍎 les fruits anciens de la région · ☀️ les cadrans solaires (et l'heure du soleil) · 🗣️ le nom en langue régionale ·
 *  🏷️ le nom des habitants · 💬 les mots de son coin (Wiktionnaire) · 📏 les mesures de son pays (Convertisseur d'autrefois) ·
 *  🐺 légendes et grandes peurs · 🔍 grandes affaires criminelles · 🎉 fêtes et traditions · 🌟 son nom dans le ciel et les jardins ·
 *  👥 ses homonymes célèbres (en ligne, jamais fusionnés).
 * Où : fiche de personne (bloc « 🪨 Terre et mots de son pays »), fiche d'un village (ligne sous le titre + parties), Monographie
 * (LCNDA_EXT.monographSections), à la demande (LCNDA_EXT.dataSources), Listes → Données (LCNDA_EXT.dataLists), Convertisseur
 * d'autrefois (LCNDA_EXT.autrefoisTabs : « 📏 Mesures de son pays »). Réglages → « 🪨 Terre et mots du village »
 * (localStorage « genealogie-terre-mots »). Pour d'autres fichiers : LCNDA_EXT.terreMots. Essai : tests/test-terre-mots.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => { const w = v && Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x]));
        return root.LCNDA_I18N ? root.LCNDA_I18N.t(s, w) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (w && w[k] != null ? w[k] : m)); };
    const escRaw = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

    /* ═════════════ les calculs (sans écran : aussi pour Node) ═════════════ */
    const PARIS_LON = 2.3372; // méridien de Paris (2° 20′ 14″ E)
    const hm = min => { let m = Math.round(min); m = ((m % 1440) + 1440) % 1440; return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
    /** midi au cadran solaire d'un lieu → l'heure de Paris (avant 1891) et nos montres d'aujourd'hui (heure d'hiver UTC+1, d'été UTC+2), en moyenne sur l'année */
    function sundialNoon(lon) {
        if (lon === null || lon === undefined || lon === '') return null; const L = Number(lon); if (!Number.isFinite(L)) return null;
        const utc = 720 - L * 4;
        return {paris: hm(utc + PARIS_LON * 4), winter: hm(utc + 60), summer: hm(utc + 120), diffParis: Math.round((L - PARIS_LON) * 4)};
    }
    const yearsTxt = (s, e) => (s && e && e !== s ? `${s}–${e}` : s ? String(s) : e ? String(e) : '');
    const plural = (n, one, many) => (Number(n) > 1 ? many : one);
    const KIND = {abandonne: 'village abandonné', englouti: 'village englouti', disparu: 'lieu disparu', reunie: 'ancienne commune'};
    /** la phrase d'un village disparu (rien n'est ajouté à ce que dit Wikidata) */
    function vanishedText(v, here = '') {
        const kind = T(KIND[v.k] || 'lieu disparu');
        if (v.k === 'reunie') return v.e ? T('{n} n’existe plus comme commune : réunie à {c} en {y}.', {n: v.n, c: v.commune || here, y: v.e}) : T('{n} n’existe plus comme commune : réunie à {c}.', {n: v.n, c: v.commune || here});
        return `${v.n} : ${kind}${v.e ? ` (${v.e})` : ''}${v.d ? ` — ${v.d}` : ''}.`;
    }
    const api = {sundialNoon, vanishedText, yearsTxt};
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : escRaw(v));
    const get = (a, q) => A().api(a, q);
    const post = (a, b) => A().api(a, {}, {method: 'POST', body: b}).then(r => r.result || r);
    const KEY = 'genealogie-terre-mots';
    const TAB = ['terre_mots', '25k6', '🪨 Terre et mots du village'];
    const PARTS = [
        ['sol', '🪨 Le sol et le relief', 'La roche sous la commune et son altitude, et ce que cette roche voulait dire (pierre des maisons, terres).'],
        ['noms', '🗣️ Le nom en langue régionale et 🏷️ le nom des habitants', 'Une ligne sous le nom du village (« Tula, en occitan · les Tullistes ») et dans la fiche.'],
        ['disparus', '🏚️ Les villages disparus', 'Villages abandonnés, détruits, engloutis par un barrage, anciennes communes réunies à une autre.'],
        ['fruits', '🍎 Les fruits anciens de sa région', 'Variétés de pommes, poires, prunes, cépages… nées dans le département ; dans la fiche des jardiniers et cultivateurs.'],
        ['cadrans', '☀️ Les cadrans solaires', 'Les cadrans de la commune (devise, image) et l’heure que donnait le soleil.'],
        ['mots', '💬 Les mots de son coin', 'Quelques mots du français de sa région, avec leur définition (Wiktionnaire).'],
        ['mesures', '📏 Les mesures de son pays', 'Les mesures anciennes de la région que les sources libres donnent (aussi dans le Convertisseur d’autrefois).'],
        ['legendes', '🐺 Légendes et grandes peurs', 'Légendes et créatures du pays ; dans la fiche, celles de son vivant près de chez lui (Bête du Gévaudan…).'],
        ['affaires', '🔍 Grandes affaires criminelles', 'Les grandes affaires de la région, à son époque : seulement l’histoire du pays, jamais rattachée à ta famille.'],
        ['fetes', '🎉 Fêtes et traditions', 'Carnavals, pardons, pèlerinages, fêtes patronales de la commune.'],
        ['ciel', '🌟 Son nom dans le ciel et les jardins', 'Les astéroïdes au nom de son village ou de son nom de famille ; les roses et variétés nommées d’après.'],
        ['homonymes', '👥 Ses homonymes célèbres', 'En ligne (Wikidata) : les personnes connues qui avaient le même prénom et le même nom. Jamais fusionnées.']];
    const DEF = Object.fromEntries(PARTS.map(p => [p[0], true]));
    function settings() { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...DEF, ...s}; }
    function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
    const on = k => settings()[k] !== false;
    const link = (url, label) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label));
    const src = (label, licence, url, extra = '') => `<p class="cplus-src tm-src">${esc(T('Source :'))} ${link(url, label)}${licence ? ` — ${esc(licence)}` : ''}${url ? ` · ${link(url, T('↗ source'))}` : ''}${extra}</p>`;
    const more = (inner, n) => `<details class="cplus-more tm-more"><summary>${esc(n ? T('▸ plus ({n})', {n}) : T('▸ plus'))}</summary>${inner}</details>`;
    const emptyLine = (text, icon = 'ℹ️') => (A().emptyState ? A().emptyState({text, icon, size: 'small'}) : `<p class="muted">${esc(text)}</p>`);
    const memo = new Map();
    window.addEventListener('lcnda:data-changed', () => memo.clear()); // une fiche modifiée (date, lieu, lien…) : ses blocs sont redemandés, pas repris de la mémoire
    function ask(action, q) { const k = action + JSON.stringify(q); if (!memo.has(k)) memo.set(k, get(action, q).catch(e => { memo.delete(k); return {ok: false, message: e.message}; })); return memo.get(k); }
    const qs = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))));
    const placeQuery = p => qs({place_id: Number(p?.id || p?.place_id) || '', name: p?.name || p?.place_name || '', lat: p?.lat ?? p?.latitude, lon: p?.lon ?? p?.longitude, insee: p?.insee || p?.admin4_code || '', country: p?.country || '', county: p?.county || ''});
    const WD = ['Wikidata', 'CC0 1.0', 'https://www.wikidata.org/'];
    const wdLinks = r => [r.wp_url ? link(r.wp_url, T('Wikipédia ↗')) : '', link(r.url, T('Wikidata ↗'))].filter(Boolean).join(' · ');
    const thumb = r => (r.thumb ? `<a class="tm-thumb" href="${esc(r.image_page || r.url)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" alt="" src="${esc(r.thumb)}" onerror="this.parentNode.remove()"></a>` : '');
    const row = (r, main, sub) => `<li class="tm-row">${thumb(r)}<div><span>${main}</span>${sub ? `<small>${sub}</small>` : ''}<small>${wdLinks(r)}</small></div></li>`;
    const list = (items, fn, N = 3) => (items.length ? `<ul class="tm-rows">${items.slice(0, N).map(fn).join('')}</ul>${items.length > N ? more(`<ul class="tm-rows">${items.slice(N).map(fn).join('')}</ul>`, items.length - N) : ''}` : '');
    const kmTxt = k => (k < 1 ? T('dans la commune') : T('à {n} km', {n: String(Math.round(k))}));

    /* ═════════ 🪨 le sol et le relief ═════════ */
    function solHtml(s, {place = ''} = {}) {
        if (!s || (!s.rock && s.alt == null)) return '';
        const where = place || s.commune;
        const rock = s.rock ? T('{r}', {r: s.rock_phrase}) + (s.rock2 && s.rock2 !== s.rock ? T(' (et aussi du {r})', {r: s.rock2_label}) : '') : '';
        const lead = rock && s.alt != null ? T('Sous {c} : {r}, à {a} m d’altitude.', {c: where, r: rock, a: String(s.alt)}) : rock ? T('Sous {c} : {r}.', {c: where, r: rock}) : T('{c} est à {a} m d’altitude.', {c: where, a: String(s.alt)});
        const t = s.text;
        const S = s.source || {};
        return `<p class="cplus-lead">🪨 ${esc(lead)}</p>${t ? `<blockquote class="tm-quote">« ${esc(t.sentence)} » <small>— ${link(t.url, T('Wikipédia, « {t} »', {t: t.title}))} (CC BY-SA 4.0) · ${link(t.url, T('↗ source'))}</small></blockquote>` : ''}
            ${more(`<p class="muted"><small>${esc(T('La roche la plus fréquente autour du centre de la commune, d’après une carte à grande échelle (1/1 000 000) : sur place, il peut y avoir d’autres roches. L’altitude est celle du centre de la commune.'))}</small></p>
            <p class="h-links">${S.map ? link(S.map, T('🗺️ Carte géologique détaillée (BRGM, InfoTerre) ↗')) : ''}${S.geoportail ? ` · ${link(S.geoportail, T('Géoportail ↗'))}` : ''}</p>`)}
            ${src(T('Roche : carte géologique du BRGM à 1/1 000 000 (EGDI / OneGeology, GEOZS)'), S.rock_licence || 'CC BY 4.0', S.rock_url, ` · ${esc(T('Altitude :'))} ${link(S.alt_url, 'IGN')} — ${esc(S.alt_licence || 'Licence Ouverte 2.0')}`)}`;
    }

    /* ═════════ 🗣️ nom régional, 🏷️ gentilé ═════════ */
    const regLine = n => (n?.regional || []).map(x => T('{n} (en {l})', {n: x.name, l: x.lang_label})).join(' · ');
    const gentLine = n => { const g = n?.gentiles || []; if (!g.length) return ''; const m = g.filter(x => x.gender !== 'f').map(x => x.name), f = g.filter(x => x.gender === 'f').map(x => x.name); return [...new Set([...m, ...f])].join(', '); };
    function nomsHtml(n, {place = ''} = {}) {
        if (!n || (!n.regional?.length && !n.gentiles?.length)) return '';
        const where = place || n.commune, parts = [];
        if (n.regional?.length) parts.push(`🗣️ ${esc(T('En langue du pays, {c} se dit {n}.', {c: where, n: regLine(n)}))}`);
        if (n.gentiles?.length) parts.push(`🏷️ ${esc(T('Ses habitants s’appellent : {g}.', {g: gentLine(n)}))}`);
        return `${parts.map(p => `<p class="cplus-lead">${p}</p>`).join('')}${src(...WD.slice(0, 2), n.url || WD[2], ` · <small>${esc(T('libellés et gentilés notés sur Wikidata'))}</small>`)}`;
    }
    const headLine = r => [regLine(r.noms) ? `🗣️ ${esc(regLine(r.noms))}` : '', gentLine(r.noms) ? `🏷️ ${esc(T('les {g}', {g: gentLine(r.noms)}))}` : '',
        r.sol?.rock ? `🪨 ${esc(r.sol.rock_label)}` : '', r.sol?.alt != null ? `⛰️ ${esc(T('{a} m', {a: String(r.sol.alt)}))}` : ''].filter(Boolean).join(' · ');

    /* ═════════ 🏚️ villages disparus ═════════ */
    function disparusHtml(items, {commune = '', vanished = null} = {}) {
        if (!items?.length && !vanished) return '';
        const lead = vanished ? `<p class="cplus-lead">🏚️ ${esc(vanishedText(vanished, commune))}</p>` : '';
        const others = (items || []).filter(r => !vanished || r.q !== vanished.q);
        const lost = others.filter(r => r.k !== 'reunie'), merged = others.filter(r => r.k === 'reunie');
        const parts = [];
        if (lost.length) parts.push(`<p class="cplus-lead">🏚️ ${esc(lost.length === 1 ? T('Un lieu disparu dans la commune : {n} ({k}{y}).', {n: lost[0].n, k: T(KIND[lost[0].k]), y: lost[0].e ? `, ${lost[0].e}` : ''}) : T('{n} lieux disparus dans la commune, dont {f} ({k}).', {n: lost.length, f: lost[0].n, k: T(KIND[lost[0].k])}))}</p>${list(lost, r => row(r, `<b>${esc(r.n)}</b> — ${esc(T(KIND[r.k]))}${r.e ? ` (${esc(r.e)})` : ''}`, esc(r.d)))}`);
        if (merged.length) parts.push(`<p class="cplus-lead">🏚️ ${esc(merged.length === 1 ? T('Une ancienne commune y a été réunie : {n}{y}.', {n: merged[0].n, y: merged[0].e ? ` (${merged[0].e})` : ''}) : T('{n} anciennes communes y ont été réunies, dont {f}.', {n: merged.length, f: merged[0].n}))}</p>${list(merged, r => row(r, `<b>${esc(r.n)}</b>${r.e ? ` — ${esc(T('réunie en {y}', {y: r.e}))}` : ''}`, esc(r.d)), 2)}`);
        return lead + parts.join('') + src(...WD, ` · <small>${esc(T('ce qui est noté sur Wikidata : la liste n’est pas complète'))}</small>`);
    }

    /* ═════════ 🍎 fruits anciens ═════════ */
    const fruitRow = r => row(r, `🍎 <b>${esc(r.n)}</b>${r.k ? ` <small class="muted">(${esc(T(r.k))})</small>` : ''}`, [r.via === 'nom' ? T('porte le nom de {w}', {w: r.where}) : r.where ? T('vient de {w}', {w: r.where}) : '', r.s ? T('depuis {y}', {y: r.s}) : '', r.d].filter(Boolean).map(esc).join(' · '));
    function fruitsHtml(items, {lead = ''} = {}) {
        if (!items?.length) return '';
        const names = items.slice(0, 3).map(r => r.n).join(', ');
        return `<p class="cplus-lead">${esc(lead || T('🍎 Variétés anciennes de la région : {n}.', {n: names}))}</p>${list(items, fruitRow)}${src(...WD, ` · <small>${esc(T('lieu d’origine (P1071) ou lieu qui leur donne leur nom (P138), noté sur Wikidata'))}</small>`)}`;
    }

    /* ═════════ ☀️ cadrans solaires ═════════ */
    function cadransHtml(items, {commune = '', lon = null} = {}) {
        if (!items?.length) return '';
        const f = items.find(r => r.motto) || items[0];
        const lead = items.length === 1 ? T('Un cadran solaire à {c} : {n}.', {c: commune || f.commune, n: f.n}) : T('{k} cadrans solaires à {c}.', {k: items.length, c: commune || f.commune});
        const motto = f.motto ? `<p class="tm-motto">☀️ ${esc(T('Sa devise :'))} <i>« ${esc(f.motto)} »</i></p>` : '';
        const noon = sundialNoon(lon ?? f.lon);
        const hour = noon ? `<p class="muted"><small>🕰️ ${esc(T('Un cadran donne l’heure du soleil : à {c}, quand il marque midi, il était en moyenne {p} à l’heure de Paris (avant 1891) ; à nos montres d’aujourd’hui, vers {w} l’hiver et {s} l’été (± 16 min selon la saison).', {c: commune || f.commune, p: noon.paris, w: noon.winter, s: noon.summer}))}${ext.cielHeure ? ` ${esc(T('La « 🕰️ vraie heure » de chaque acte est sous l’heure de l’événement.'))}` : ''}</small></p>` : '';
        return `<p class="cplus-lead">☀️ ${esc(lead)}</p>${motto}${list(items, r => row(r, `<b>${esc(r.n)}</b>${r.s ? ` (${esc(r.s)})` : ''}`, [r.motto ? `« ${esc(r.motto)} »` : '', r.ins ? esc(T('inscription : {i}', {i: r.ins})) : '', r.mh ? esc(T('Monument historique ({m})', {m: r.mh})) : ''].filter(Boolean).join(' · ')), 2)}${hour}
            ${src('Wikidata', T('CC0 1.0 ; images : licence de chaque fichier (Wikimedia Commons)'), 'https://www.wikidata.org/')}`;
    }

    /* ═════════ 🐺 légendes, 🔍 affaires, 🎉 fêtes ═════════ */
    const legRow = r => row(r, `🐺 <b>${esc(r.n)}</b>${yearsTxt(r.s, r.e) ? ` (${esc(yearsTxt(r.s, r.e))})` : ''}`, [r.where || r.commune, r.km != null ? kmTxt(r.km) : '', r.d].filter(Boolean).map(esc).join(' · '));
    function legendesHtml(items, {person = false} = {}) {
        if (!items?.length) return '';
        const f = items[0], y = yearsTxt(f.s, f.e);
        const lead = person && f.undated ? T('Une légende de son pays, près de {p} : {n}, {k}.', {p: f.place, n: f.n, k: kmTxt(f.km)}) : person ? T('De son vivant, près de {p} : {n}{y}, {k}{a}.', {p: f.place, n: f.n, y: y ? ` (${y})` : '', k: kmTxt(f.km), a: f.age != null && f.age > 0 ? T(' (à {a} ans)', {a: f.age}) : ''})
            : T('Légende du pays : {n}{y}.', {n: f.n, y: y ? ` (${y})` : ''});
        return `<p class="cplus-lead">🐺 ${esc(lead)}</p>${list(items, legRow, 2)}${src(...WD)}`;
    }
    const affRow = r => row(r, `🔍 <b>${esc(r.n)}</b>${yearsTxt(r.s, r.e) ? ` (${esc(yearsTxt(r.s, r.e))})` : ''}`, [r.where || r.commune, r.km != null ? kmTxt(r.km) : '', r.d].filter(Boolean).map(esc).join(' · '));
    function affairesHtml(items, {person = false} = {}) {
        if (!items?.length) return '';
        const f = items[0], y = yearsTxt(f.s, f.e);
        const lead = person ? T('À son époque, dans sa région : {n}{y}, {k} de {p}.', {n: f.n, y: y ? ` (${y})` : '', k: kmTxt(f.km), p: f.place}) : T('Une grande affaire de la région : {n}{y}.', {n: f.n, y: y ? ` (${y})` : ''});
        return `<p class="cplus-lead">🔍 ${esc(lead)}</p>${list(items, affRow, 2)}<p class="muted"><small>${esc(T('C’est l’histoire de la région, telle que Wikidata la note : rien ne la relie à ta famille.'))}</small></p>${src(...WD)}`;
    }
    const feteRow = r => row(r, `🎉 <b>${esc(r.n)}</b>${r.k ? ` <small class="muted">(${esc(T(r.k))})</small>` : ''}`, [r.day ? T('le {d}', {d: r.day}) : '', r.s ? T('depuis {y}', {y: r.s}) : '', r.d].filter(Boolean).map(esc).join(' · '));
    function fetesHtml(items, {place = ''} = {}) {
        if (!items?.length) return '';
        const f = items[0];
        const lead = place ? T('La fête de {p} : {n}.', {p: place, n: f.n}) : items.length === 1 ? T('Fête et tradition : {n}.', {n: f.n}) : T('{k} fêtes et traditions, dont {n}.', {k: items.length, n: f.n});
        return `<p class="cplus-lead">🎉 ${esc(lead)}</p>${list(items, feteRow)}${src(...WD)}`;
    }

    /* ═════════ 🌟 dans le ciel et les jardins ═════════ */
    const astLine = a => `<li class="tm-row"><div><span>🌟 <b>(${esc(a.num)}) ${esc(a.name)}</b></span>${a.cit ? `<small><i>${esc(a.cit)}</i> ${esc(T('(citation du Minor Planet Center, en anglais)'))}</small>` : `<small data-tm-ast="${esc(a.num)}"></small>`}<small>${link(a.url, T('NASA/JPL ↗'))}</small></div></li>`;
    const cvLine = r => `<li class="tm-row"><div><span>🌹 <b>${esc(r.n)}</b>${r.k ? ` <small class="muted">(${esc(T(r.k))})</small>` : ''}</span><small>${esc(T('nommé d’après : {a}', {a: r.after}))}${r.s ? ` · ${esc(r.s)}` : ''}</small><small>${wdLinks(r)}</small></div></li>`;
    function cielHtml(c, {person = null} = {}) {
        if (!c) return '';
        const out = [];
        const ast = c.village || c.asteroids || [];
        if (ast.length) out.push(`<p class="cplus-lead">🌟 ${esc(T('L’astéroïde ({n}) {a} porte le nom {w}.', {n: ast[0].num, a: ast[0].name, w: person ? T('de son village') : T('de la commune')}))}</p><ul class="tm-rows">${ast.map(astLine).join('')}</ul>`);
        if (c.surname?.length) out.push(`<p class="cplus-lead">🌟 ${esc(T('Un astéroïde s’appelle {n} : ({k}) {a} — même nom ne veut pas dire même famille.', {n: String(person?.last || c.surname[0].name).toUpperCase(), k: c.surname[0].num, a: c.surname[0].name}))}</p>${more(`<ul class="tm-rows">${c.surname.map(astLine).join('')}</ul>`)}`);
        const cv = [...(c.village_cv || c.cultivars || [])];
        if (cv.length) out.push(`<p class="cplus-lead">🌹 ${esc(T('« {n} » ({k}) porte le nom {w}.', {n: cv[0].n, k: T(cv[0].k || 'cultivar'), w: person ? T('de son village') : T('de la commune')}))}</p>${cv.length > 1 ? more(`<ul class="tm-rows">${cv.map(cvLine).join('')}</ul>`, cv.length) : `<ul class="tm-rows">${cvLine(cv[0])}</ul>`}`);
        if (c.namesake_cv?.length) out.push(`<p class="cplus-lead">🌹 ${esc(T('« {n} » ({k}) porte le nom d’un homonyme : {a} — pas forcément ton ancêtre.', {n: c.namesake_cv[0].n, k: T(c.namesake_cv[0].k || 'cultivar'), a: c.namesake_cv[0].after}))}</p><ul class="tm-rows">${c.namesake_cv.map(cvLine).join('')}</ul>`);
        if (!out.length) return '';
        return out.join('') + src('NASA/JPL Small-Body Database', T('données publiques de la NASA'), 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html', ` · ${link('https://www.wikidata.org/', 'Wikidata')} — CC0 1.0`);
    }
    async function fillAsteroids(host) {
        for (const el of host.querySelectorAll('[data-tm-ast]:not([data-done])')) {
            el.dataset.done = '1';
            const r = await ask('tm_asteroid', {num: el.dataset.tmAst});
            if (r?.ok && r.citation) el.innerHTML = `<i>${esc(r.citation)}</i> ${esc(T('(citation du Minor Planet Center, en anglais)'))}`;
            else el.textContent = r?.offline ? T('la citation s’affichera quand tu seras connecté') : '';
        }
    }

    /* ═════════ 💬 mots du coin ═════════ */
    const wordLi = w => `<li><b>${link(w.url, w.word)}</b>${w.pos ? ` <small class="muted">(${esc(w.pos)})</small>` : ''} : ${esc(w.def)}</li>`;
    function motsHtml(m, {person = false} = {}) {
        if (!m?.words?.length) return '';
        const ex = m.words.slice(0, 3).map(w => `« ${w.word} »`).join(', ');
        const lead = person ? T('Les mots de son coin ({r}) : {w}…', {r: m.region, w: ex}) : T('Les mots du coin ({r}) : {w}…', {r: m.region, w: ex});
        const all = m.all || m.words;
        return `<p class="cplus-lead">💬 ${esc(lead)}</p><ul class="tm-words">${all.slice(0, 3).map(wordLi).join('')}</ul>${all.length > 3 ? more(`<ul class="tm-words">${all.slice(3).map(wordLi).join('')}</ul><p>${link(m.cat_url, T('Tous les mots « {c} » sur le Wiktionnaire ↗', {c: m.cat}))}</p>`, all.length - 3) : ''}
            ${src(T('Wiktionnaire, catégorie « {c} »', {c: m.cat}), 'CC BY-SA 4.0', m.cat_url, ` · <small>${esc(T('définitions des contributeurs du Wiktionnaire'))}</small>`)}`;
    }

    /* ═════════ 📏 mesures de son pays ═════════ */
    const nf = (v, d = 3) => Number(v).toLocaleString('fr-FR', {maximumFractionDigits: d});
    const UNIT = {a: 'ares', l: 'litres'};
    const valTxt = r => (r.max ? T('de {a} à {b} {u}', {a: nf(r.value), b: nf(r.max), u: T(UNIT[r.metric])}) : `${nf(r.value)} ${T(UNIT[r.metric])}`);
    function mesuresHtml(rows, {conv = false} = {}) {
        if (!rows?.length) return '';
        const tr = r => `<tr><td><b>${esc(r.unit)}</b></td><td>${esc(r.place)}</td><td>${esc(valTxt(r))}</td><td><small>« ${esc(r.sentence)} »</small> ${link(r.url, T('↗ source'))}</td>${conv ? `<td><input type="number" min="0" step="any" class="tm-conv-in" data-tm-conv="${esc(r.value)}" data-tm-max="${esc(r.max || '')}" data-tm-u="${esc(r.metric)}" aria-label="${esc(T('Combien de {u} ?', {u: r.unit}))}" placeholder="1"> <output class="tm-conv-out"></output></td>` : ''}</tr>`;
        return `<p class="cplus-lead">📏 ${esc(rows.length === 1 ? T('Une mesure de pays : {u} ({p}) = {v}.', {u: rows[0].unit, p: rows[0].place, v: valTxt(rows[0])}) : T('{n} mesures de pays, par exemple {u} ({p}) = {v}.', {n: rows.length, u: rows[0].unit, p: rows[0].place, v: valTxt(rows[0])}))}</p>
            <div class="cplus-scroll"><table class="data-table tm-mes"><thead><tr><th>${esc(T('Mesure'))}</th><th>${esc(T('Où'))}</th><th>${esc(T('Valeur'))}</th><th>${esc(T('Ce que dit la source'))}</th>${conv ? `<th>${esc(T('Convertir'))}</th>` : ''}</tr></thead><tbody>${rows.map(tr).join('')}</tbody></table></div>
            <p class="muted"><small>${esc(T('Les sources libres donnent peu de valeurs régionales : seules celles avec un lieu et une valeur en mesures d’aujourd’hui sont ici. Pour ton village, cherche la « table de comparaison des mesures » de ton département (an X) aux archives.'))}</small></p>
            ${src(T('Wikipédia (articles des mesures)'), 'CC BY-SA 4.0', 'https://fr.wikipedia.org/wiki/Arpent')}`;
    }
    document.addEventListener('input', e => {
        const i = e.target.closest?.('[data-tm-conv]'); if (!i) return;
        const v = Number(String(i.value).replace(',', '.')), out = i.parentNode.querySelector('.tm-conv-out');
        if (!out) return;
        if (!Number.isFinite(v) || i.value === '') { out.textContent = ''; return; }
        const a = v * Number(i.dataset.tmConv), b = i.dataset.tmMax ? v * Number(i.dataset.tmMax) : null, u = i.dataset.tmU;
        const fmt = x => (u === 'a' ? (x >= 100 ? `${nf(x / 100, 2)} ha` : `${nf(x, 2)} a`) : (x >= 100 ? `${nf(x / 100, 2)} hl` : `${nf(x, 2)} l`));
        out.textContent = `≈ ${b ? `${fmt(a)} – ${fmt(b)}` : fmt(a)}`;
    });

    /* ═════════ 👥 homonymes célèbres (en ligne) ═════════ */
    function homonymesHtml(r) {
        if (!r?.ok || !r.items?.length) return '';
        const f = r.items[0];
        const who = it => `${esc(it.label)}${yearsTxt(it.birth, it.death) ? ` (${esc(yearsTxt(it.birth, it.death))})` : ''}${it.desc ? ` — ${esc(it.desc)}` : ''}`;
        return `<p class="cplus-lead">👥 ${esc(r.items.length === 1 ? T('Ne pas confondre avec… une personne connue s’appelait aussi {n} :', {n: r.name}) : T('Ne pas confondre avec… {k} personnes connues s’appelaient aussi {n}, dont :', {k: r.items.length, n: r.name}))} ${who(f)} · ${link(f.url, T('Wikidata ↗'))}</p>
            ${more(`<ul class="tm-rows">${r.items.map(it => `<li class="tm-row"><div><span>${who(it)}</span><small>${link(it.url, T('Wikidata ↗'))} · <button type="button" class="link-button" data-tm-copy="${esc(it.url)}">${esc(T('📋 Copier le lien (un lien ?)'))}</button></small></div></li>`).join('')}</ul>
                <p class="muted"><small>${esc(T('Même prénom et même nom ne veut pas dire même personne : rien n’est fusionné ni ajouté. Si c’est bien lui ou elle, colle le lien dans une source de sa fiche.'))}</small></p>`, r.items.length)}
            ${src('Wikidata', 'CC0 1.0', `https://www.wikidata.org/w/index.php?search=${encodeURIComponent(r.name)}`, r.fetched_at ? ` · <small>${esc(r.cached ? T('réponse gardée') : T('lu en ligne'))}</small>` : '')}`;
    }
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-tm-copy]'); if (!b) return;
        e.preventDefault();
        try { navigator.clipboard?.writeText(b.dataset.tmCopy); A().toast?.(T('Lien copié.')); } catch (_) {}
    });

    /* ═════════ la fiche d'une personne : « 🪨 Terre et mots de son pays » ═════════ */
    ext.personBlocks = ext.personBlocks || {};
    const PERSON_PARTS = ['sol', 'noms', 'disparus', 'fruits', 'mots', 'legendes', 'affaires', 'fetes', 'ciel', 'homonymes'];
    ext.personBlocks.terre_mots = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !PERSON_PARTS.some(on)) return '';
        return A().card(index, T('🪨 Terre et mots de son pays'), '', `<div class="tm-block" data-tm-person="${Number(p.id)}"></div>`, 'span-12').replace(/^(\s*<section class="card[^"]*")/, '$1 hidden');
    };
    const line = (k, html) => (html ? `<div class="cc-line tm-line" data-tm-line="${k}">${html}</div>` : '');
    /** les lignes d'une personne dans host ; only = les parties voulues (sinon les réglages) */
    async function fillPerson(host, id, only = null) {
        const want = k => (only ? only.includes(k) : on(k));
        const r = await ask('tm_person', {id});
        if (!host.isConnected || !r?.ok) return r;
        const home = r.home?.name || '';
        const out = [];
        if (want('sol')) out.push(line('sol', solHtml(r.sol, {place: home})));
        if (want('noms')) out.push(line('noms', nomsHtml(r.noms, {place: home})));
        if (want('disparus') && r.disparus?.length) out.push(line('disparus', `${r.disparus.map(v => `<p class="cplus-lead">🏚️ ${esc(T('Un lieu de sa vie a disparu. {t}', {t: vanishedText(v, v.place)}))} ${link(v.wp_url || v.url, T('↗ source'))}</p>`).join('')}${src(...WD)}`));
        if (want('fruits') && r.fruits?.items?.length) out.push(line('fruits', fruitsHtml(r.fruits.items, {lead: T('🍎 Un métier de la terre ({j}) : les variétés anciennes de sa région ({d}) — {n}.', {j: r.fruits.job || T('cultivateur'), d: r.fruits.dep_name || r.fruits.place, n: r.fruits.items.slice(0, 3).map(x => x.n).join(', ')})})));
        if (want('fetes') && r.fetes?.length) out.push(line('fetes', fetesHtml(r.fetes, {place: r.fetes[0].place})));
        if (want('legendes')) out.push(line('legendes', legendesHtml(r.legendes, {person: true})));
        if (want('affaires')) out.push(line('affaires', affairesHtml(r.affaires, {person: true})));
        if (want('mots')) out.push(line('mots', motsHtml(r.mots, {person: true})));
        if (want('ciel')) out.push(line('ciel', cielHtml(r.ciel, {person: r})));
        if (want('homonymes') && r.online_ok) out.push('<div class="cc-line tm-line" data-tm-line="homonymes" hidden></div>');
        host.innerHTML = out.filter(Boolean).join('');
        const card = host.closest('section.card');
        if (card && host.querySelector('.tm-line:not([hidden])')) card.hidden = false;
        fillAsteroids(host);
        const hb = host.querySelector('[data-tm-line="homonymes"]');
        if (hb) {
            const h = await ask('tm_homonymes', {id});
            const html = homonymesHtml(h);
            if (hb.isConnected && html) { hb.innerHTML = html; hb.hidden = false; if (card) card.hidden = false; } else if (hb.isConnected) hb.remove();
        }
        return r;
    }
    (ext.afterPerson = ext.afterPerson || []).push(() => { document.querySelectorAll('#workspace [data-tm-person]:not([data-tm-done])').forEach(h => { h.dataset.tmDone = '1'; fillPerson(h, Number(h.dataset.tmPerson)); }); });

    /* ═════════ la fiche d'un village ═════════ */
    const PLACE_PARTS = [['sol', '🪨 Le sol et le relief'], ['noms', '🗣️ Son nom et ses habitants'], ['disparus', '🏚️ Villages disparus'], ['cadrans', '☀️ Cadrans solaires'], ['fetes', '🎉 Fêtes et traditions'],
        ['legendes', '🐺 Légendes et grandes peurs'], ['affaires', '🔍 Grandes affaires criminelles'], ['fruits', '🍎 Fruits anciens de la région'], ['mots', '💬 Les mots du coin'], ['ciel', '🌟 Dans le ciel et les jardins'], ['mesures', '📏 Mesures de pays']];
    function partHtml(k, r) {
        const c = r.commune || {};
        switch (k) {
            case 'sol': return solHtml(r.sol);
            case 'noms': return nomsHtml(r.noms);
            case 'disparus': return disparusHtml(r.disparus, {commune: c.name, vanished: r.vanished});
            case 'cadrans': return cadransHtml(r.cadrans, {commune: c.name, lon: c.lon});
            case 'fetes': return fetesHtml(r.fetes);
            case 'legendes': return legendesHtml(r.legendes);
            case 'affaires': return affairesHtml(r.affaires);
            case 'fruits': return fruitsHtml(r.fruits, {lead: r.fruits?.length ? T('🍎 Variétés anciennes de {d} : {n}.', {d: c.dep_name || c.name, n: r.fruits.slice(0, 3).map(x => x.n).join(', ')}) : ''});
            case 'mots': return motsHtml(r.mots);
            case 'ciel': return cielHtml(r.ciel);
            case 'mesures': return mesuresHtml(r.mesures);
            default: return '';
        }
    }
    const panel = (k, title, body) => `<section class="maintenance-panel cplus-panel tm-panel" data-tm-part="${k}"><h3>${esc(T(title))}</h3>${body}</section>`;
    async function placeInto(host, place, {parts = null, head = null} = {}) {
        const want = k => (parts ? parts.includes(k) : on(k));
        const r = await ask('tm_place', placeQuery(place));
        if (!host.isConnected) return r;
        if (!r?.ok) { host.innerHTML = ''; return r; }
        host.innerHTML = PLACE_PARTS.filter(([k]) => want(k) && k !== 'noms').map(([k, t]) => { const b = partHtml(k, r); return b ? panel(k, t, b) : ''; }).join('');
        if (head && (on('noms') || on('sol'))) {
            const hl = headLine({noms: on('noms') ? r.noms : null, sol: on('sol') ? r.sol : null});
            if (hl && !head.querySelector('.tm-head')) head.insertAdjacentHTML('beforeend', `<p class="tm-head">${hl} <small>${link(r.noms?.url || 'https://www.wikidata.org/', T('↗ source'))}</small></p>`);
        }
        fillAsteroids(host);
        return r;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(), lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || village.querySelector('[data-cad-insee]')?.dataset.cadInsee || ''};
    }
    // ⚙️ « Organiser la fiche » d'un village (heritage-more.js) : cette partie y est rangée, masquée, à la largeur choisie
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'tm_place', host: '[data-tm-host]', icon: '🪨', label: 'Terre et mots du village', group: 'Autour', enabled: () => PLACE_PARTS.some(([k]) => on(k))});
    function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-tm])');
        if (!village) return;
        village.dataset.tm = '1';
        if (!PLACE_PARTS.some(([k]) => on(k))) return;
        const place = villagePlace(village); if (!place.id && !place.insee && !place.name) return;
        const anchor = village.querySelector('[data-cc-host]') || village.querySelector('[data-mr-host]') || village.querySelector('[data-lp-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="tm-place cc-place" data-tm-host data-mp-id="terre_mots"></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-tm-host]'), place, {head: village.querySelector('.ui-ph-text, .page-header')});
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; try { decorate(); } catch (e) { console.error(e); } }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ═════════ 📜 Monographie de commune ═════════ */
    const monoPlace = pl => ({id: Number(pl?.id) || 0, name: pl?.name || '', lat: pl?.latitude ?? pl?.lat ?? null, lon: pl?.longitude ?? pl?.lon ?? null, country: pl?.country || '', county: pl?.county || ''});
    const monoRun = k => async (place, host, ctx) => {
        let insee = ''; try { insee = (await ctx?.village?.())?.insee || ''; } catch (_) {}
        const r = await ask('tm_place', placeQuery({...monoPlace(place), insee}));
        const html = r?.ok ? (k === 'noms' ? nomsHtml(r.noms) : partHtml(k, r)) : '';
        if (!html) { host.innerHTML = ''; return false; }
        host.innerHTML = html; fillAsteroids(host);
        return true;
    };
    const MONO = [['sol', '🪨', 'Le sol et le relief'], ['noms', '🗣️', 'Son nom en langue régionale et ses habitants'], ['disparus', '🏚️', 'Villages disparus'], ['cadrans', '☀️', 'Cadrans solaires'],
        ['fetes', '🎉', 'Fêtes et traditions'], ['legendes', '🐺', 'Légendes et grandes peurs'], ['affaires', '🔍', 'Grandes affaires criminelles', false], ['fruits', '🍎', 'Fruits anciens de la région'],
        ['mots', '💬', 'Les mots du coin'], ['ciel', '🌟', 'Dans le ciel et les jardins'], ['mesures', '📏', 'Mesures de pays', false]];
    (ext.monographSections = ext.monographSections || []).push(...MONO.map(([k, icon, label, d]) => ({id: `tm_${k}`, icon, label: T(label), group: 'Le lieu', defaultOn: d !== false, enabled: () => on(k), render: monoRun(k)})));

    /* ═════════ 🧰 à la demande (registre commun ; aussi « 🔎 Ce qui le concerne ») ═════════ */
    const placeOfCtx = pl => (pl ? {id: Number(pl.id || pl.place_id) || 0, name: pl.name || pl.place_name || pl.title || '', insee: pl.insee || pl.admin4_code || '', lat: pl.lat ?? pl.latitude ?? null, lon: pl.lon ?? pl.longitude ?? null, county: pl.county || '', country: pl.country || ''} : null);
    const personId = ctx => Number(ctx.person?.id || ctx.person?.person?.id || ctx.person) || 0;
    async function runPlace(k, ctx, host, empty) {
        const pl = placeOfCtx(ctx.place); if (!pl) { host.innerHTML = emptyLine(T('Choisis un lieu.'), '📍'); return null; }
        const r = await ask('tm_place', placeQuery(pl));
        const html = r?.ok ? (k === 'noms' ? nomsHtml(r.noms) : partHtml(k, r)) : '';
        host.innerHTML = html ? `<div class="tm-block">${html}</div>` : emptyLine(r?.ok === false ? (r.message || empty) : empty);
        fillAsteroids(host);
        return r;
    }
    async function runPerson(k, ctx, host, empty) {
        const id = personId(ctx); if (!id) { host.innerHTML = emptyLine(T('Choisis une personne.')); return null; }
        host.innerHTML = '<div class="tm-block"></div>';
        const r = await fillPerson(host.firstElementChild, id, [k]);
        if (!host.textContent.trim()) host.innerHTML = emptyLine(empty);
        return r;
    }
    const DS = [
        ['sol', '🪨', 'Le sol et le relief du village', 'Pas de roche ni d’altitude connues pour ce lieu.'], ['noms', '🗣️', 'Le nom du village en langue régionale et le nom des habitants', 'Pas de nom régional ni de gentilé notés pour cette commune.'],
        ['disparus', '🏚️', 'Les villages disparus de la commune', 'Aucun village disparu noté pour cette commune.'], ['fruits', '🍎', 'Les fruits anciens de la région', 'Aucune variété ancienne notée pour cette région.'],
        ['cadrans', '☀️', 'Les cadrans solaires de la commune', 'Aucun cadran solaire noté pour cette commune.'], ['mots', '💬', 'Les mots du coin (français régional)', 'Pas de mots régionaux pour ce département.'],
        ['mesures', '📏', 'Les mesures de son pays', 'Pas de mesure de pays sourcée pour ce département.'], ['legendes', '🐺', 'Légendes et grandes peurs autour du village', 'Aucune légende notée près de ce lieu.'],
        ['affaires', '🔍', 'Grandes affaires criminelles autour du village', 'Aucune affaire notée près de ce lieu.'], ['fetes', '🎉', 'Fêtes et traditions de la commune', 'Aucune fête notée pour cette commune.'],
        ['ciel', '🌟', 'Le nom du village dans le ciel et les jardins', 'Aucun astéroïde ni aucune variété au nom de cette commune.']];
    const PDS = [['sol', '🪨', 'Le sol de son village natal'], ['legendes', '🐺', 'Légendes de son vivant, près de chez lui'], ['affaires', '🔍', 'Grandes affaires de son époque, près de chez lui'],
        ['fetes', '🎉', 'Les fêtes de ses communes'], ['disparus', '🏚️', 'Une commune de sa vie a disparu'], ['mots', '💬', 'Les mots de son coin'], ['fruits', '🍎', 'Les fruits de sa région (jardiniers, cultivateurs)'],
        ['ciel', '🌟', 'Son nom dans le ciel et les jardins'], ['homonymes', '👥', 'Ses homonymes célèbres (en ligne)'], ['noms', '🏷️', 'Le nom des habitants de son village']];
    (ext.dataSources = ext.dataSources || []).push(
        ...DS.map(([k, icon, label, empty]) => ({id: `tm_${k}`, icon, label: T(label), group: 'Le lieu', needs: ['place'], installed: () => true, enabled: () => on(k), run: (ctx, host) => runPlace(k, ctx, host, T(empty))})),
        ...PDS.map(([k, icon, label]) => ({id: `tm_p_${k}`, icon, label: T(label), group: 'La personne', needs: ['person'], installed: () => true, enabled: () => on(k), online: k === 'homonymes',
            run: (ctx, host) => runPerson(k, ctx, host, T('Rien de connu pour cette personne.'))})));

    /* ═════════ 🧰 Listes → Données ═════════ */
    const openUrl = u => { if (u) root.open(u, '_blank', 'noopener'); };
    const L = kind => get('tm_list', {kind}).then(r => r.rows || []);
    const geo = r => (r.lat != null && r.lon != null ? [r.lat, r.lon] : null);
    const F = (key, label, type = 'text', values) => ({key, label: T(label), type, ...(values ? {values} : {})});
    const base = [F('commune', 'Commune', 'place'), F('dep_name', 'Département', 'enum'), F('url', 'Source (Wikidata)', 'url')];
    const kinds = o => Object.values(o).map(T);
    (ext.dataLists = ext.dataLists || []).push(
        {id: 'tm_disparus', icon: '🏚️', label: T('Villages disparus et anciennes communes'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/', enabled: () => on('disparus'),
            load: async () => (await L('disparus')).map(r => ({...r, kind_label: T(KIND[r.k] || r.k)})),
            fields: [F('n', 'Nom'), F('kind_label', 'Sorte', 'enum', kinds(KIND)), F('e', 'Fin', 'year'), F('d', 'Description'), ...base], period: r => [r.e || null, null], geo, open: r => openUrl(r.wp_url || r.url)},
        {id: 'tm_cadrans', icon: '☀️', label: T('Cadrans solaires'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/', enabled: () => on('cadrans'),
            load: () => L('cadrans'), fields: [F('n', 'Nom'), F('motto', 'Devise'), F('ins', 'Inscription'), F('s', 'Date', 'year'), F('mh', 'Mérimée'), F('image_page', 'Image', 'url'), ...base], period: r => [r.s || null, null], geo, open: r => openUrl(r.url)},
        {id: 'tm_fruits', icon: '🍎', label: T('Fruits et variétés anciennes des régions'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/', enabled: () => on('fruits'),
            load: () => L('fruits'), fields: [F('n', 'Variété'), F('k', 'Sorte', 'enum'), F('where', 'Lieu d’origine ou du nom'), F('s', 'Depuis', 'year'), F('d', 'Description'), ...base], period: r => [r.s || null, null], geo, open: r => openUrl(r.wp_url || r.url)},
        {id: 'tm_legendes', icon: '🐺', label: T('Légendes et grandes peurs'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/', enabled: () => on('legendes'),
            load: () => L('legendes'), fields: [F('n', 'Nom'), F('k', 'Sorte', 'enum'), F('s', 'Début', 'year'), F('e', 'Fin', 'year'), F('where', 'Lieu'), F('d', 'Description'), ...base], period: r => [r.s || null, r.e || null], geo, open: r => openUrl(r.wp_url || r.url)},
        {id: 'tm_affaires', icon: '🔍', label: T('Grandes affaires criminelles'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/', enabled: () => on('affaires'),
            load: () => L('affaires'), fields: [F('n', 'Affaire'), F('k', 'Sorte', 'enum'), F('s', 'Année', 'year'), F('where', 'Lieu'), F('d', 'Description'), ...base], period: r => [r.s || null, r.e || null], geo, open: r => openUrl(r.wp_url || r.url)},
        {id: 'tm_fetes', icon: '🎉', label: T('Fêtes et traditions'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/', enabled: () => on('fetes'),
            load: () => L('fetes'), fields: [F('n', 'Fête'), F('k', 'Sorte', 'enum'), F('day', 'Jour'), F('s', 'Depuis', 'year'), F('where', 'Lieu'), F('d', 'Description'), ...base], period: r => [r.s || null, null], geo, open: r => openUrl(r.wp_url || r.url)},
        {id: 'tm_noms', icon: '🗣️', label: T('Noms des villages en langue régionale et gentilés'), group: 'Le lieu', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/', enabled: () => on('noms'),
            load: () => L('noms'), fields: [F('commune', 'Commune', 'place'), F('name', 'Nom régional'), F('lang', 'Langue', 'enum'), F('gentile', 'Habitants'), F('dep_name', 'Département', 'enum'), F('url', 'Source (Wikidata)', 'url')], geo, open: r => openUrl(r.url)},
        {id: 'tm_sol', icon: '🪨', label: T('Roche et altitude des communes'), group: 'Le lieu', source: T('BRGM 1/1 000 000 via EGDI (CC BY 4.0) ; IGN (Licence Ouverte 2.0)'), sourceUrl: 'https://doi.org/10.5281/zenodo.12607973', enabled: () => on('sol'),
            load: () => L('sol'), fields: [F('commune', 'Commune', 'place'), F('rock', 'Roche', 'enum'), F('alt', 'Altitude (m)', 'number'), F('dep_name', 'Département', 'enum'), F('insee', 'INSEE')], geo},
        {id: 'tm_mots', icon: '💬', label: T('Mots du français régional'), group: 'Le lieu', source: T('Wiktionnaire (CC BY-SA 4.0)'), sourceUrl: 'https://fr.wiktionary.org/', enabled: () => on('mots'),
            load: () => L('mots'), fields: [F('word', 'Mot'), F('pos', 'Sorte de mot', 'enum'), F('def', 'Définition'), F('region', 'Région', 'enum'), F('url', 'Source (Wiktionnaire)', 'url')], open: r => openUrl(r.url)},
        {id: 'tm_mesures', icon: '📏', label: T('Mesures de pays (sourcées)'), group: 'Le lieu', source: T('Wikipédia (CC BY-SA 4.0)'), sourceUrl: 'https://fr.wikipedia.org/wiki/Arpent', enabled: () => on('mesures'),
            load: () => L('mesures'), fields: [F('unit', 'Mesure'), F('kind', 'Genre', 'enum'), F('place', 'Où'), F('value', 'Valeur', 'number'), F('metric', 'Unité', 'enum'), F('dep_names', 'Départements'), F('sentence', 'Phrase de la source'), F('url', 'Source (Wikipédia)', 'url')], open: r => openUrl(r.url)},
        {id: 'tm_asteroides', icon: '🌟', label: T('Astéroïdes au nom d’une commune de France'), group: 'Le monde', source: T('NASA/JPL Small-Body Database'), sourceUrl: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html', enabled: () => on('ciel'),
            load: () => L('asteroides'), fields: [F('num', 'Numéro'), F('name', 'Nom'), F('place', 'Lieu', 'place'), F('date', 'Découverte'), F('who', 'Découvreurs'), F('cit', 'Citation (anglais)'), F('url', 'Source (JPL)', 'url')], open: r => openUrl(r.url)},
        {id: 'tm_cultivars', icon: '🌹', label: T('Roses et variétés nommées d’après un lieu ou une personne'), group: 'Le monde', source: 'Wikidata (CC0)', sourceUrl: 'https://www.wikidata.org/', enabled: () => on('ciel'),
            load: () => L('cultivars'), fields: [F('n', 'Variété'), F('k', 'Sorte', 'enum'), F('after', 'Nommée d’après'), F('commune', 'Commune', 'place'), F('s', 'Année', 'year'), F('url', 'Source (Wikidata)', 'url')], period: r => [r.s || null, null], geo, open: r => openUrl(r.url)});

    /* ═════════ 🪙 Convertisseur d'autrefois : « 📏 Mesures de son pays » ═════════ */
    async function mountMesures(pane) {
        pane.innerHTML = UI().spinner ? UI().spinner(T('On lit les mesures…')) : '';
        const rows = await L('mesures').catch(() => []);
        const deps = [...new Set(rows.flatMap(r => r.deps))].sort();
        const depName = d => (d === 'BE' ? T('Belgique') : (rows.find(r => r.deps.includes(d))?.dep_names.split(', ')[rows.find(r => r.deps.includes(d)).deps.indexOf(d)] || d));
        const draw = d => { const sel = d ? rows.filter(r => r.deps.includes(d)) : rows; pane.querySelector('[data-tm-mes-out]').innerHTML = mesuresHtml(sel, {conv: true}) || emptyLine(T('Pas de mesure sourcée pour ce département.')); };
        pane.innerHTML = `<div class="af-fields"><label class="af-field"><span>${esc(T('Département'))}</span><select data-tm-mes-dep><option value="">${esc(T('Tous'))}</option>${deps.map(d => `<option value="${esc(d)}">${esc(d === 'BE' ? T('Belgique') : `${d} — ${depName(d)}`)}</option>`).join('')}</select></label></div><div data-tm-mes-out></div>`;
        pane.querySelector('[data-tm-mes-dep]').addEventListener('change', e => draw(e.target.value));
        draw('');
    }
    ext.autrefoisTabs = ext.autrefoisTabs || [];
    if (!ext.autrefoisTabs.some(t => t.id === 'tm_mesures')) ext.autrefoisTabs.push({id: 'tm_mesures', label: T('📏 Mesures de son pays'), mount: pane => (on('mesures') ? mountMesures(pane) : (pane.innerHTML = emptyLine(T('Partie éteinte dans Réglages → Terre et mots du village.'))))});

    /* ═════════ Réglages → 🪨 Terre et mots du village ═════════ */
    document.addEventListener('change', e => { const t = e.target.closest?.('[data-tm-tg]'); if (t && e.target.matches('input')) { const s = settings(); s[t.dataset.tmTg] = e.target.checked; save(s); memo.clear(); } });
    document.addEventListener('click', e => { if (e.target.closest?.('[data-tm-clear]')) clearCache(); });
    async function clearCache() {
        try {
            const res = await post('tm_cache_clear', {});
            memo.clear(); drawSettings();
            A().undoToast?.(T('Réponses gardées effacées ({n}).', {n: res.removed}), {undo: async () => { await post('tm_cache_restore', {token: res.token}); drawSettings(); }});
        } catch (err) { A().toast?.(err.message, 'error'); }
    }
    const fmtSize = b => (b >= 1e6 ? `${String(Math.round(b / 1e5) / 10).replace('.', ',')} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`);
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        let about = {sources: [], cache: {count: 0, bytes: 0}};
        try { about = await get('tm_about'); } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        if (A().state?.maintenanceTab !== TAB[0] && token === undefined && !ws.querySelector('[data-tm-settings]')) return;
        const s = settings();
        const tg = ([k, label, sub]) => `<label class="checkbox-line cplus-tg" data-tm-tg="${k}"><input type="checkbox" ${s[k] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const rows = about.sources.map(x => `<tr><td>${link(x.url, x.label)}</td><td>${esc(x.what)}${x.count ? ` <small class="muted">(${esc(Number(x.count).toLocaleString('fr-FR'))})</small>` : ''}</td><td>${esc(x.online ? T('en ligne, gardé') : x.bytes ? T('dans l’app ({s})', {s: fmtSize(x.bytes)}) : T('dans l’app'))}</td><td>${esc(x.licence)}</td><td>${esc(x.mention)}</td></tr>`).join('');
        ws.innerHTML = `<section class="page cplus-settings tm-settings" data-tm-settings>${UI().pageHeader ? UI().pageHeader({title: T('Terre et mots du village'), icon: '🪨', where: T('Réglages · Données'), help: esc(T('Le sol, les noms, les mots, les fêtes, les légendes et les histoires du pays de tes ancêtres.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('Gardé sur l’ordinateur'))}</h3><p>${esc(T('Les homonymes célèbres et certaines citations d’astéroïdes viennent d’Internet, une fois : {n} réponses gardées.', {n: about.cache?.count || 0}))}</p>
                <div class="page-actions"><button type="button" class="button secondary" data-tm-clear ${about.cache?.count ? '' : 'disabled'}>${esc(T('🗑 Effacer les réponses gardées'))}</button></div></div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Source'))}</th><th>${esc(T('Ce qu’elle donne'))}</th><th>${esc(T('Où'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Mention'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
                <p class="muted">${esc(T('Ce qui part sur Internet : seulement le prénom et le nom d’une personne décédée, pour les homonymes (jamais pour une fiche confidentielle ou une personne vivante), et le numéro d’un astéroïde. Tout le reste est dans l’app.'))}</p>
                <p class="muted">${esc(T('Pas encore là : les noms régionaux d’OpenStreetMap (service injoignable le jour de la fabrication) ; peu de mesures de pays sont données par les sources libres.'))}</p></div></section>`;
    }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'commune_culture'); if (i < 0) i = tabs.findIndex(t => t[0] === 'commune_plus'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === 'terre_mots')) {
            const after = ['commune_culture', 'mr_metier', 'histoire', 'world'].map(k => B.findIndex(b => b[0] === k)).find(i => i >= 0);
            B.splice(after === undefined ? B.length : after + 1, 0, ['terre_mots', '🪨 Terre et mots de son pays']);
        }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans.terre_mots ||= '12';
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.terreMots = {...api, settings, placeInto, fillPerson, solHtml, nomsHtml, disparusHtml, fruitsHtml, cadransHtml, legendesHtml, affairesHtml, fetesHtml, cielHtml, motsHtml, mesuresHtml, homonymesHtml, decorate,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
