/**
 * LCNDA — 🏰 Grands noms et remparts (lot G « téléchargements ») : les listes de noms d'autrefois (Filles du Roy, soldats de
 * Carignan-Salières, députés de 1789 et conventionnels, Compagnons de la Libération, premiers pilotes brevetés) et les lieux de la
 * défense et de la santé publique (forts Séré de Rivières, ligne Maginot, Vauban, poudrières, sémaphores, lazarets, fontaines Wallace).
 * Livré avec l'app (assets/data/tg-*.json.gz, refaits par scripts/telech-g/*.py et .github/workflows/telech-g.yml, lus à la demande) :
 *   👰 tg-filles      Filles du Roy connues de Wikidata (CC0) + provinces d'origine de toutes (Wikipédia, CC BY-SA 4.0)
 *   ⚔️ tg-carignan    soldats et officiers du régiment de Carignan-Salières (Wikidata CC0) + navires de 1665 (Wikipédia)
 *   🏛 tg-deputes     députés aux États généraux, à la Constituante, conventionnels (Wikidata CC0)
 *   ✠ tg-compagnons  Compagnons de la Libération (Wikidata CC0 ; personnes décédées seulement)
 *   ✈️ tg-aviateurs   brevets de pilote de l'Aéro-Club de France 1909-1911 (Wikipédia en anglais, CC BY-SA 4.0)
 *   ⚓ tg-lloyd       index des volumes du Lloyd's Register 1764-1900 (Internet Archive ; aucune page copiée)
 *   🏰 tg-forts, 💥 tg-poudres, 📡 tg-semaphores, ⚕️ tg-lazarets, ⛲ tg-wallace (Wikidata CC0) + tg-osm-* (OpenStreetMap ODbL, sur GitHub)
 * Liens seulement (pas de licence ouverte lisible, ou texte trop mal lu) : combattants français de la guerre d'Amérique (liste de
 *   1903, Internet Archive), vainqueurs de la Bastille (tableau de 1790, Gallica), testaments de Poilus (Archives nationales).
 *   « Chercher ce nom » copie le nom sur l'ordinateur et ouvre la page : RIEN n'est envoyé, jamais pour une fiche vivante ou
 *   confidentielle, ni en consultation (kiosque) ou pour un invité du réseau local.
 * Déjà dans l'app et RÉUTILISÉ (pas recopié) : les bureaux et pavillons d'octroi (lot B « Bornes, octrois et douanes », lot 9
 *   « 🚧 L'octroi de sa ville ») ; les forteresses du module Châteaux ; la comparaison des listes avec l'arbre (app-listes-personnes.js :
 *   les champs « person » des Listes).
 * La comparaison des noms avec la fiche se fait ici, sur l'ordinateur, seulement pour une personne décédée et non confidentielle.
 * Où : fiche d'une personne (bloc « 🏰 Grands noms et remparts »), fiche d'un village et monographie, Listes, Cartes, à la demande,
 *   « Où chercher », Réglages → « 🏰 Grands noms et remparts » (chaque sujet s'éteint ↶, À propos des données).
 * localStorage : « genealogie-telech-g ».   window.LCNDA_EXT.telechG = {core…, load, personInto, placeInto, openSettings}
 * Essai : tests/test-telech-g.js
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
    function lifeSpan(life) {
        const ys = (life?.events || []).map(e => num(e.year)).filter(y => y !== null);
        const b = num(life?.person?.birth), d = num(life?.person?.death);
        return {birth: b, death: d, from: b ?? (ys.length ? Math.min(...ys) : null), to: d ?? (b !== null ? b + 80 : ys.length ? Math.max(...ys) : null)};
    }
    const aliveIn = (life, a, b = a) => { const s = lifeSpan(life); return s.from !== null && s.to !== null && s.from <= b && s.to >= a; };
    /** son âge en l'année y (null sans naissance connue) */
    const ageIn = (life, y) => { const b = lifeSpan(life).birth; return b === null ? null : y - b; };
    const placedEvents = life => (life?.events || []).filter(okLL).map(e => ({lat: Number(e.lat), lon: Number(e.lon), year: num(e.year), name: e.place || '', tag: String(e.tag || '').toUpperCase()}));
    function near(rows, lat, lon, radius, max = 50) {
        const out = [], dLat = radius / 111, dLon = radius / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
        for (const r of rows) { if (num(r.lat) === null || Math.abs(r.lat - lat) > dLat || Math.abs(r.lon - lon) > dLon) continue; const k = km(lat, lon, r.lat, r.lon); if (k <= radius) out.push({r, km: k}); }
        return out.sort((a, b) => a.km - b.km).slice(0, max);
    }
    function nearLife(rows, life, radius, when = () => true, key = r => r.q || r.osm || `${r.lat},${r.lon}`) {
        const out = new Map();
        for (const e of placedEvents(life)) for (const x of near(rows, e.lat, e.lon, radius, 200)) {
            if (!when(x.r, e)) continue;
            const k = key(x.r), cur = out.get(k); if (!cur || x.km < cur.km) out.set(k, {...x, place: e.name});
        }
        return [...out.values()].sort((a, b) => a.km - b.km);
    }
    const jobsText = life => fold([...(life?.jobs || []).map(j => j.text), life?.text || ''].join(' '));
    const ARMY_JOB = /\b(soldat|militaire|officier|sergent|caporal|capitaine|lieutenant|colonel|commandant|artilleur|sapeur|genie|grenadier|fusilier|chasseur|dragon|cuirassier|gendarme|garde|invalide|fantassin|canonnier|garnison)\b/;
    const POWDER_JOB = /\b(poudrier|salpetrier|artificier|poudrerie|poudriere|ouvrier poudrier|pyrotechnicien|artilleur)\b/;
    const SEA_JOB = /\b(marin|matelot|mousse|navigateur|capitaine au long cours|maitre au cabotage|pilote|armateur|corsaire|pecheur|douanier|guetteur|semaphoriste|garde cote|officier de marine|charpentier de (?:marine|navire)|calfat|timonier|quartier maitre|inscrit maritime|marine)\b/;
    const HEALTH_JOB = /\b(medecin|chirurgien|infirmier|infirmiere|apothicaire|pharmacien|officier de sante|religieuse hospitaliere|garde sanitaire)\b/;

    /* ── les noms : la personne et une liste (comparaison sur l'ordinateur, jamais envoyée) ── */
    const PART = new Set(['de', 'du', 'des', 'd', 'van', 'von', 'der', 'den', 'di', 'da', 'del', 'dit', 'dite']); // « La », « Le » restent : de La Combe = Lacombe
    const toks = s => fold(String(s ?? '').replace(/['’.]/g, ' ')).split(' ').filter(Boolean);
    /** la clé du nom de famille : sans « de, du, d’… » de tête, sans espaces, lettres doublées réduites (Lacombe = La Combe = de La Combe) */
    const surKey = s => { const t = toks(s).filter(x => !/^\d+$/.test(x)); while (t.length > 1 && PART.has(t[0])) t.shift(); return t.join('').replace(/(.)\1+/g, '$1'); };
    /** les noms de famille possibles d'une ligne : P734, sinon les derniers mots du nom (« Olivier Morel de La Durantaye » → durantaye, morel…) */
    function rowSurnames(r) {
        const out = new Set(); if (r.fam) out.add(surKey(r.fam));
        const t = toks(String(r.n || '').replace(/,.*$/, '')); // « Guillaume Richard, dit Lafleur » → avant la virgule
        for (let i = 1; i < t.length; i++) { out.add(surKey(t.slice(i).join(' '))); if (!PART.has(t[i]) && !/^(la|le|les|l)$/.test(t[i])) out.add(surKey(t[i])); }
        out.delete(''); return out;
    }
    const firstTok = s => toks(String(s || '').replace(/-/g, ' '))[0] || '';
    const rowFirst = r => firstTok(r.giv || String(r.n || '').split(' ')[0]);
    /**
     * Les lignes d'une liste qui portent son nom : même nom de famille (sans accents ni particule) et même premier prénom ;
     * « probable » si l'année de naissance (± 3) ou le lieu de naissance (moins de 20 km) concorde aussi.
     * window : [de, à] les années où la liste a existé ; la personne doit y avoir vécu, entre ageMin et ageMax ans quand on le sait.
     */
    function nameMatches(rows, life, {window = null, ageMin = 0, ageMax = 120} = {}) {
        const P = life?.person || {}, sk = surKey(P.last), fk = firstTok(P.first);
        if (!sk || sk.length < 2 || !fk) return [];
        if (window && !aliveIn(life, window[0], window[1])) return [];
        if (window) { const a = ageIn(life, window[1]); if (a !== null && (a < ageMin || ageIn(life, window[0]) > ageMax)) return []; }
        const s = lifeSpan(life), birthEv = placedEvents(life).find(e => e.tag === 'BIRT' || e.tag === 'BAPM' || e.tag === 'CHR');
        const out = [];
        for (const r of rows) {
            if (!rowSurnames(r).has(sk) || rowFirst(r) !== fk) continue;
            if (s.birth !== null && num(r.b) !== null && Math.abs(r.b - s.birth) > 12) continue; // pas la même génération
            let why = [];
            if (s.birth !== null && num(r.b) !== null && Math.abs(r.b - s.birth) <= 3) why.push('year');
            if (birthEv && okLL(r) && km(birthEv.lat, birthEv.lon, r.lat, r.lon) <= 20) why.push('place');
            out.push({r, level: why.length ? 'probable' : 'possible', why});
        }
        return out.sort((a, b) => b.why.length - a.why.length);
    }
    /** les personnes d'une liste nées dans sa commune (moins de 3 km de son lieu de naissance), qui ont vécu en même temps que lui */
    function bornNear(rows, life, radius = 3) {
        const s = lifeSpan(life); if (s.from === null) return [];
        const ev = placedEvents(life).filter(e => e.tag === 'BIRT' || e.tag === 'BAPM' || e.tag === 'CHR' || e.tag === 'RESI');
        const out = new Map();
        for (const e of ev) for (const x of near(rows.filter(okLL), e.lat, e.lon, radius, 50)) {
            const a = num(x.r.b), b = num(x.r.d) ?? (a !== null ? a + 70 : null);
            if (a !== null && (a > s.to || (b !== null && b < s.from))) continue;
            if (!out.has(x.r.q)) out.set(x.r.q, {...x, place: e.name});
        }
        return [...out.values()].sort((x, y) => (num(x.r.b) ?? 9999) - (num(y.r.b) ?? 9999));
    }
    /** ⚓ les volumes du Lloyd's Register de ses années de vie (un par décennie, au plus 6) */
    function lloydVolumes(rows, a, b, max = 6) {
        const inYears = rows.filter(r => r.y >= a && r.y <= b);
        const byDec = new Map(); for (const r of inYears) { const d = Math.floor(r.y / 10); if (!byDec.has(d) || (byDec.get(d).part && !r.part)) byDec.set(d, r); }
        const list = [...byDec.values()].sort((x, y) => x.y - y.y);
        if (list.length <= max) return list;
        const step = list.length / max; return Array.from({length: max}, (_, i) => list[Math.floor(i * step)]);
    }
    /** le volume le plus proche d'une année */
    const lloydNearest = (rows, y) => rows.slice().sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y) || (a.part ? 1 : 0) - (b.part ? 1 : 0))[0] || null;
    /** une adresse sûre : http(s) seulement */
    const safeUrl = u => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
    const safeId = s => (/^[A-Za-z0-9_.-]{1,80}$/.test(String(s || '')) ? String(s) : '');

    const core = {num, fold, table, km, lifeSpan, aliveIn, ageIn, placedEvents, near, nearLife, jobsText, surKey, rowSurnames, nameMatches, bornNear, lloydVolumes, lloydNearest, safeUrl, safeId,
        ARMY_JOB, POWDER_JOB, SEA_JOB, HEALTH_JOB};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const DATA_V = 1;
    const KEY = 'genealogie-telech-g';
    const TAB = ['telech_g', '25tg', '🏰 Grands noms et remparts'];
    const BLOCK = 'telech_g';
    const PARTS = [
        ['filles', '👰 Les Filles du Roy', 'Les jeunes femmes envoyées en Nouvelle-France (1663-1673) : un nom pareil au sien, une fille du Roy née dans sa commune, les provinces d’origine.'],
        ['carignan', '⚔️ Le régiment de Carignan-Salières', 'Les soldats partis pour le Canada en 1665 : un nom pareil au sien, un soldat né près de chez lui, les navires.'],
        ['deputes', '🏛 Députés de 1789 et conventionnels', 'Un député aux États généraux, à la Constituante ou à la Convention qui porte son nom ou qui est né dans sa commune.'],
        ['compagnons', '✠ Compagnons de la Libération', 'Un Compagnon de la Libération (toutes et tous décédés) qui porte son nom ou qui est né dans sa commune.'],
        ['aviateurs', '✈️ Les premiers pilotes brevetés', 'Les pilotes brevetés par l’Aéro-Club de France de 1909 à 1911 : un nom pareil au sien.'],
        ['combattants', '⚓ Combattants de la guerre d’Amérique (lien)', 'Pour un homme décédé qui avait l’âge de servir en 1778-1783 : la liste officielle de 1903 (on cherche soi-même, rien n’est envoyé).'],
        ['bastille', '🗝 Vainqueurs de la Bastille (lien)', 'Pour une personne décédée, adulte en 1789, qui vivait près de Paris : le tableau de 1790 (lien).'],
        ['poilus', '📜 Testaments de Poilus (lien)', 'Pour un homme décédé qui avait l’âge de la Grande Guerre : les testaments de soldats (Archives nationales, lien).'],
        ['lloyd', '🚢 Le Lloyd’s Register (navires)', 'Pour un marin ou un armateur : les registres des navires de ses années, à ouvrir sur Internet Archive.'],
        ['forts', '🏰 Forts et fortifications', 'Les forts Séré de Rivières, les ouvrages de la ligne Maginot et les fortifications de Vauban près de chez lui.'],
        ['poudres', '💥 Poudrières et poudreries', 'Les dépôts et fabriques de poudre près de chez lui (plus loin pour un poudrier ou un artilleur).'],
        ['semaphores', '📡 Les sémaphores', 'Les sémaphores de la Marine sur la côte près de chez lui (plus loin pour un marin ou un douanier).'],
        ['lazarets', '⚕️ Lazarets et quarantaines', 'Les lazarets où les navires suspects faisaient quarantaine, près de ses ports.'],
        ['wallace', '⛲ Les fontaines Wallace', 'Les fontaines Wallace (à partir de 1872) de sa ville.']];
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const kmTxt = k => (k < 1 ? T('sur place') : T('{n} km', {n: String(Math.round(k))}));
    const link = (url, label) => { const u = safeUrl(url); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label); };
    const srcLink = url => { const u = safeUrl(url); return u ? `<a class="tg-src-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(T('↗ source'))}</a>` : ''; };
    const row = (icon, html, src, extra = '') => `<div class="hist-row tg-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="tg-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const hyp = t => `<small class="muted hist-hyp">${esc(t)}</small>`;
    const emptyLine = (t, icon = 'ℹ️') => (A().empty ? A().empty(t, {icon}) : `<p class="muted">${esc(t)}</p>`);
    const wd = q => (/^Q\d+$/.test(String(q || '')) ? `https://www.wikidata.org/wiki/${q}` : '');
    const wp = (t, host = 'fr.wikipedia.org') => (t ? `https://${host}/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}` : '');
    const osmUrl = k => { const t = {n: 'node', w: 'way', r: 'relation'}[String(k || '')[0]]; return t && /^\d+$/.test(String(k).slice(1)) ? `https://www.openstreetmap.org/${t}/${String(k).slice(1)}` : ''; };
    const iaUrl = id => (safeId(id) ? `https://archive.org/details/${safeId(id)}` : '');
    const kiosk = () => !!(root.document?.body?.classList.contains('is-kiosk') || root.LCNDA_GUEST);
    const yrs = r => (num(r.b) !== null || num(r.d) !== null ? `${num(r.b) ?? '?'}–${num(r.d) ?? '?'}` : '');
    const URLS = {
        combattants: 'https://archive.org/details/combattantsfranc00fran', bastille: 'https://gallica.bnf.fr/ark:/12148/bpt6k853088f/f1.item', bastilleWp: 'https://fr.wikipedia.org/wiki/Vainqueurs_de_la_Bastille',
        poilus: 'https://testamentsdepoilus.huma-num.fr/',
        lloyd: 'https://archive.org/details/lloydsregisters', ordre: 'https://www.ordredelaliberation.fr/fr/compagnons', fillesWp: 'https://fr.wikipedia.org/wiki/Filles_du_Roy', carignanWp: 'https://fr.wikipedia.org/wiki/R%C3%A9giment_de_Carignan-Sali%C3%A8res'};
    const LIC = {wd: () => `${link('https://www.wikidata.org/wiki/Wikidata:Copyright', 'Wikidata')} (CC0)`,
        wp: (u, label = 'Wikipédia') => `${link(u || 'https://fr.wikipedia.org', label)} (${link('https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'CC BY-SA 4.0')}, ${esc(T('les contributeurs de Wikipédia'))})`,
        osm: () => `${link('https://www.openstreetmap.org/copyright', T('© les contributeurs d’OpenStreetMap'))} (ODbL)`,
        ia: () => `${link(URLS.lloyd, 'Internet Archive — Lloyd’s Register Foundation')} (${esc(T('licence de chaque volume'))})`};

    /* ─────────── chargement (une fois, à la demande) ─────────── */
    const FILES = {filles: 'tg-filles', carignan: 'tg-carignan', deputes: 'tg-deputes', compagnons: 'tg-compagnons', aviateurs: 'tg-aviateurs', lloyd: 'tg-lloyd',
        forts: 'tg-forts', poudres: 'tg-poudres', semaphores: 'tg-semaphores', lazarets: 'tg-lazarets', wallace: 'tg-wallace',
        osm_forts: 'tg-osm-forts', osm_poudres: 'tg-osm-poudres', osm_semaphores: 'tg-osm-semaphores', osm_lazarets: 'tg-osm-lazarets', osm_wallace: 'tg-osm-wallace'};
    const data = {};
    async function readMaybeGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir ces fichiers.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    function load(kind) {
        if (!FILES[kind]) return Promise.resolve(null);
        if (!data[kind]) data[kind] = fetch(`assets/data/${FILES[kind]}.json.gz?v=${DATA_V}`, {credentials: 'same-origin'})
            .then(r => { if (r.status === 404) return null; if (!r.ok) throw new Error(T('Le fichier {f} est introuvable.', {f: FILES[kind]})); return readMaybeGz(r); })
            .then(f => (f ? {meta: f, rows: table(f)} : null))
            .catch(e => { delete data[kind]; throw e; });
        return data[kind];
    }
    const quiet = p => p.catch(() => null);
    const rowsOf = kind => quiet(load(kind)).then(D => D || {meta: {}, rows: []});
    /** Wikidata + OpenStreetMap d'un sujet (un point OSM à moins de 150 m d'un point Wikidata est le même) */
    async function merged(kind) {
        const [W, O] = await Promise.all([rowsOf(kind), rowsOf(`osm_${kind}`)]);
        const out = W.rows.map(r => ({...r, via: 'wd'}));
        for (const o of O.rows) if (!out.some(w => w.via === 'wd' && Math.abs(w.lat - o.lat) < 0.003 && km(w.lat, w.lon, o.lat, o.lon) < 0.15)) out.push({...o, q: '', via: 'osm', from: num(o.from), to: null});
        return out;
    }
    const lifeMemo = new Map();
    const lifeOf = id => { const H = ext.histoireAutour; if (H?.lifeOf) return H.lifeOf(id); if (!lifeMemo.has(id)) lifeMemo.set(id, api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };
    const fullName = life => [life?.person?.first || '', String(life?.person?.last || '').toUpperCase()].filter(Boolean).join(' ').trim();

    /* ─────────── 👥 les listes de noms ─────────── */
    const NAMES = {
        filles: {icon: '👰', win: [1663, 1673], age: [12, 45], role: () => T('Fille du Roy (1663-1673)'), src: () => `${LIC.wd()} · ${LIC.wp(URLS.fillesWp, T('Wikipédia, « Filles du Roy »'))}`, gender: 'female',
            note: () => T('Environ 770 jeunes femmes, envoyées aux frais du roi pour peupler la Nouvelle-France ; Wikidata n’en connaît qu’une petite partie. La liste complète (Yves Landry, 1992) n’est pas sous licence ouverte : le Programme de recherche en démographie historique (PRDH) la consulte.')},
        carignan: {icon: '⚔️', win: [1665, 1668], age: [15, 60], role: () => T('Régiment de Carignan-Salières (1665)'), src: () => `${LIC.wd()} · ${LIC.wp(URLS.carignanWp, T('Wikipédia, « Régiment de Carignan-Salières »'))}`, gender: 'male',
            note: () => T('Environ 1 200 hommes partis pour la Nouvelle-France en 1665 ; plus de 400 y sont restés. Wikidata n’en connaît qu’une poignée.')},
        deputes: {icon: '🏛', win: [1789, 1795], age: [21, 95], role: r => roleTxt(r.role), src: () => LIC.wd(), note: () => T('Les États généraux s’ouvrent à Versailles le 5 mai 1789 et deviennent l’Assemblée constituante ; la Convention siège de 1792 à 1795.')},
        compagnons: {icon: '✠', win: [1940, 1946], age: [14, 80], role: () => T('Compagnon de la Libération'), src: () => `${LIC.wd()} · ${link(URLS.ordre, T('↗ Ordre de la Libération'))}`,
            note: () => T('1 038 Compagnons de la Libération (dont 6 femmes), 5 communes et 18 unités, nommés par le général de Gaulle de 1940 à 1946 ; le dernier est mort en 2021.')},
        aviateurs: {icon: '✈️', win: [1909, 1911], age: [15, 75], role: r => T('Brevet de pilote n° {n} ({d})', {n: r.no, d: r.date || r.y}), src: () => LIC.wp('https://en.wikipedia.org/wiki/Aéro-Club_de_France', T('Wikipédia en anglais, listes de l’Aéro-Club de France')),
            note: () => T('Les premiers brevets de pilote de l’Aéro-Club de France (n° 1 : Louis Blériot) ; les listes de 1912 à 1914 ne sont pas publiées sous licence ouverte.')}};
    const ROLE = {eg: 'député aux États généraux (1789)', const: 'député à l’Assemblée constituante (1789-1791)', conv: 'conventionnel (1792-1795)'};
    const roleTxt = s => String(s || '').split(',').filter(k => ROLE[k]).map(k => T(ROLE[k])).join(', ') || T('député (1789-1795)');
    const rowUrl = (kind, r) => (kind === 'aviateurs' ? wp(r.enwiki, 'en.wikipedia.org') || NAMES_META.aviateurs?.urls?.[String(r.y)] || '' : wp(r.frwiki) || wd(r.q));
    const NAMES_META = {};
    const personLi = (kind, x) => { const r = x.r; const born = r.bp ? T('né(e) à {p}', {p: r.bp}) : '';
        return `<li>${NAMES[kind].icon} <b>${link(rowUrl(kind, r), r.n)}</b> <small class="muted">(${[yrs(r), born, NAMES[kind].role(r), r.extra || '', x.km !== undefined && x.km !== null ? kmTxt(x.km) : ''].filter(Boolean).map(esc).join(' · ')})</small>${x.level ? ` <span class="tg-badge tg-${x.level}">${esc(x.level === 'probable' ? T('homonyme probable') : T('homonyme'))}</span>` : ''}${r.note ? `<br><small class="muted">${esc(r.note)}</small>` : ''} ${srcLink(rowUrl(kind, r))}</li>`; };
    function namesHtml(kind, life, D) {
        const N = NAMES[kind]; NAMES_META[kind] = D.meta;
        const P = life.person || {};
        const homo = nameMatches(D.rows, life, {window: N.win, ageMin: N.age[0], ageMax: N.age[1]}).filter(x => !N.gender || P.gender === N.gender || !P.gender || P.gender === 'unknown');
        const same = kind === 'aviateurs' ? [] : bornNear(D.rows, life).filter(x => !homo.some(h => h.r.q === x.r.q));
        if (!homo.length && !same.length) return '';
        let lead;
        if (homo.length) { const x = homo[0];
            lead = T(x.level === 'probable' ? 'Dans la liste « {l} », une personne porte son nom et concorde ({w}) : {n}.' : 'Dans la liste « {l} », une personne porte le même nom : {n} — un homonyme, à vérifier.',
                {l: esc(T(PARTS.find(p => p[0] === kind)[1]).replace(/^\S+\s/, '')), w: esc(x.why.map(w => T(w === 'year' ? 'même année de naissance' : 'né au même endroit')).join(T(' et '))), n: `<b>${esc(x.r.n)}</b>`}); }
        else { const x = same[0];
            lead = T('Né(e) près de {p}, de son vivant : {n}, {r}.', {p: esc(x.place), n: `<b>${esc(x.r.n)}</b>`, r: esc(N.role(x.r))}); }
        let extra = '';
        if (kind === 'filles' && Array.isArray(D.meta.provinces)) extra = `<p class="muted tg-small">${esc(T('Provinces d’origine des Filles du Roy :'))} ${D.meta.provinces.slice(0, 8).map(p => `${esc(p[0])} (${esc(String(p[1]))})`).join(', ')} ${srcLink(URLS.fillesWp)}</p>`;
        if (kind === 'carignan' && Array.isArray(D.meta.ships)) extra = `<ul class="hist-ul tg-ul">${D.meta.ships.map(s => `<li>⛵ <b>${esc(s[0])}</b> <small class="muted">(${esc(s[1])})</small> — ${esc(s[2])}</li>`).join('')}</ul>`;
        const all = [...homo, ...same];
        return row(N.icon, `${lead} ${srcLink(rowUrl(kind, all[0].r))}`, N.src(), more(`<ul class="hist-ul tg-ul">${all.slice(0, 12).map(x => personLi(kind, x)).join('')}</ul>${extra}${hyp(N.note())}${hyp(T('Comparé sur l’ordinateur, avec le nom de la fiche : rien n’est envoyé. Un même nom ne veut pas dire la même personne.'))}`, all.length));
    }

    /* ─────────── 🔗 les listes sans fichier ouvert : « Chercher ce nom » (copie locale, puis la page) ─────────── */
    const LINKS = {
        combattants: {icon: '⚓', url: URLS.combattants, label: 'Combattants français de la guerre américaine, 1778-1783 (liste de 1903)',
            ok: life => life.person?.gender !== 'female' && aliveIn(life, 1778, 1783) && (ageIn(life, 1783) === null || (ageIn(life, 1783) >= 15 && ageIn(life, 1778) <= 60)),
            lead: () => T('Une piste : s’il a servi dans l’armée ou la marine de Rochambeau, de d’Estaing ou de Grasse (1778-1783), son nom est peut-être dans la liste officielle publiée en 1903.'),
            note: () => T('« Les combattants français de la guerre américaine » (1903, domaine public, numérisé par l’Université de Toronto) : la lecture automatique du texte est trop imparfaite pour en tirer une liste fiable ; on cherche dans le livre.')},
        bastille: {icon: '🗝', url: URLS.bastille, url2: URLS.bastilleWp, label: 'Tableau des vainqueurs de la Bastille (1790, Gallica)',
            ok: life => aliveIn(life, 1789) && (ageIn(life, 1789) === null || (ageIn(life, 1789) >= 14 && ageIn(life, 1789) <= 75)) && placedEvents(life).some(e => km(e.lat, e.lon, 48.8534, 2.3488) <= 40 && (e.year === null || Math.abs(e.year - 1789) <= 30)),
            lead: () => T('Une piste : il vivait près de Paris en 1789. Les quelque 950 « vainqueurs de la Bastille » sont nommés dans un tableau imprimé en 1790.'),
            note: () => T('Le tableau est sur Gallica (conditions d’utilisation de la BnF, pas une licence ouverte) : rien n’en est copié.')},
        poilus: {icon: '📜', url: URLS.poilus, label: 'Testaments de Poilus (Archives nationales, édition collaborative)',
            ok: life => life.person?.gender !== 'female' && aliveIn(life, 1914, 1918) && (ageIn(life, 1914) === null || (ageIn(life, 1914) >= 17 && ageIn(life, 1914) <= 50)),
            lead: () => T('Une piste : des soldats de la Grande Guerre ont fait leur testament chez un notaire de Paris ou des Yvelines ; ces testaments sont transcrits en ligne.'),
            note: () => T('Le site « Testaments de Poilus » n’a pas pu être lu ici (ni sa licence) : rien n’en est copié, l’app ouvre seulement la page.')}};
    function linkHtml(kind, life, priv) {
        if (priv || kiosk()) return '';
        const s = lifeSpan(life); if (s.death === null && (s.birth === null || s.birth > 1910)) return ''; // seulement une personne décédée
        const L = LINKS[kind]; if (!L.ok(life)) return '';
        const btn = `<button type="button" class="button small secondary" data-tg-copy="${esc(kind)}" data-tg-pid="${Number(life.person?.id) || 0}">${esc(T('📋 Chercher ce nom'))}</button>`;
        return row(L.icon, `${esc(L.lead())} ${srcLink(L.url)}`, `${link(L.url, T(L.label))}${L.url2 ? ` · ${link(L.url2, T('↗ en savoir plus'))}` : ''}`, `<p class="tg-actions">${btn}</p>${more(hyp(L.note()) + hyp(T('Le bouton copie le nom sur l’ordinateur et ouvre la page : tu colles le nom dans sa recherche. Rien n’est envoyé par l’app.')))}`);
    }
    document.addEventListener('click', async e => {
        const b = e.target.closest?.('[data-tg-copy]'); if (!b) return;
        const L = LINKS[b.dataset.tgCopy]; if (!L || kiosk()) return;
        let life = null; try { life = await lifeOf(Number(b.dataset.tgPid)); } catch (_) {}
        const name = fullName(life);
        if (name) { try { await navigator.clipboard.writeText(name); A().toast?.(T('Nom copié : {n} — colle-le dans la recherche du site.', {n: name}), 'success'); } catch (_) { A().toast?.(T('Nom à chercher : {n}', {n: name})); } }
        const u = safeUrl(L.url); if (u) root.open(u, '_blank', 'noopener');
    });

    /* ─────────── ⚓ Lloyd's Register ─────────── */
    const lloydLi = r => `<li>📘 ${link(iaUrl(r.id), T('Lloyd’s Register {y}', {y: String(r.y)}))}${r.part ? ` <small class="muted">(${esc(r.part)})</small>` : ''}${r.lic ? ` <small class="muted">· ${esc(r.lic)}</small>` : ''}</li>`;
    function lloydHtml(list, lead) {
        return row('🚢', `${lead} ${srcLink(iaUrl(list[0].id))}`, LIC.ia(), more(`<ul class="hist-ul tg-ul">${list.map(lloydLi).join('')}</ul>${hyp(T('Chaque volume liste les navires de l’année (nom, capitaine, tonnage, port d’attache, voyage). Dans le volume, la loupe d’Internet Archive cherche un nom de navire : on le tape soi-même, l’app n’envoie rien.'))}`, list.length));
    }

    /* ─────────── 🏰 les lieux ─────────── */
    const KIND_WORD = {sdr: 'fort Séré de Rivières', maginot: 'ligne Maginot', vauban: 'Vauban', fort: 'fort', poudriere: 'poudrière', poudrerie: 'poudrerie', semaphore: 'sémaphore', lazaret: 'lazaret', wallace: 'fontaine Wallace'};
    const PLACES = {
        forts: {icon: '🏰', job: ARMY_JOB, r: [10, 30], jobLead: 'Il était militaire : {l} près de ses lieux.', note: 'Vauban fortifie les frontières sous Louis XIV ; après 1870, le général Séré de Rivières fait construire une ceinture de forts ; la ligne Maginot est bâtie de 1929 à 1938. Les forteresses plus anciennes sont dans le module Châteaux.'},
        poudres: {icon: '💥', job: POWDER_JOB, r: [8, 25], jobLead: 'Son métier touchait à la poudre : {l} près de ses lieux.', note: 'La poudre noire (salpêtre, soufre, charbon) se fabriquait dans les poudreries royales puis nationales, et se gardait dans des poudrières à l’écart des villes.'},
        semaphores: {icon: '📡', job: SEA_JOB, r: [10, 25], jobLead: 'Son métier le menait à la mer : {l} près de ses lieux.', note: 'Les sémaphores de la Marine, établis à partir de 1806 sur les caps, surveillaient la côte et transmettaient des signaux aux navires.'},
        lazarets: {icon: '⚕️', job: SEA_JOB, job2: HEALTH_JOB, r: [15, 40], jobLead: 'Navires suspects, quarantaine : {l} près de ses lieux.', note: 'Les navires venant de ports touchés par la peste, le choléra ou la fièvre jaune faisaient quarantaine ; équipages et passagers attendaient au lazaret.'},
        wallace: {icon: '⛲', r: [2, 2], from: 1872, note: 'Offertes à Paris par le philanthrope Richard Wallace à partir de 1872, après le siège et la Commune, pour donner de l’eau potable gratuite.'}};
    const placeUrl = r => (r.via === 'osm' ? osmUrl(r.osm) : wd(r.q) || wp(r.frwiki));
    const placeLi = x => `<li>${PLACES_ICON[x.r.k] || '📍'} <b>${link(r2url(x.r), x.r.n || T(KIND_WORD[x.r.k] || x.r.k))}</b> <small class="muted">(${[T(KIND_WORD[x.r.k] || x.r.k), x.r.from ? `${x.r.from}${x.r.to ? `–${x.r.to}` : ''}` : '', x.r.commune || '', x.km !== undefined ? kmTxt(x.km) : ''].filter(Boolean).map(esc).join(' · ')})</small> ${srcLink(placeUrl(x.r))}</li>`;
    const r2url = r => (r.via === 'osm' ? osmUrl(r.osm) : wp(r.frwiki) || wd(r.q));
    const PLACES_ICON = {sdr: '🏰', maginot: '🛡', vauban: '⭐', fort: '🏰', poudriere: '💥', poudrerie: '🏭', semaphore: '📡', lazaret: '⚕️', wallace: '⛲'};
    const placesSrc = list => [list.some(x => x.r.via !== 'osm') ? LIC.wd() : '', list.some(x => x.r.via === 'osm') ? LIC.osm() : ''].filter(Boolean).join(' · ');
    function placesHtml(kind, list, lead) {
        const P = PLACES[kind];
        return row(P.icon, `${lead} ${srcLink(placeUrl(list[0].r))}`, placesSrc(list), more(`<ul class="hist-ul tg-ul">${list.slice(0, 15).map(placeLi).join('')}</ul>${hyp(T(P.note))}`, list.length));
    }
    const names2 = list => list.slice(0, 2).map(x => `<b>${esc(x.r.n || T(KIND_WORD[x.r.k] || x.r.k))}</b> (${esc(kmTxt(x.km))})`).join(', ');
    async function placesForLife(kind, life) {
        const P = PLACES[kind], L = await merged(kind), s = lifeSpan(life);
        if (s.from === null) return '';
        if (P.from && s.to < P.from) return '';
        const jt = jobsText(life), job = !!((P.job && P.job.test(jt)) || (P.job2 && P.job2.test(jt)));
        const list = nearLife(L, life, job ? P.r[1] : P.r[0], (r, e) => (num(r.from) === null || r.from <= s.to) && (num(r.to) === null || r.to >= s.from) && (!P.from || e.year === null || e.year >= P.from));
        if (!list.length) return '';
        const lead = job && P.jobLead ? T(P.jobLead, {l: names2(list)}) : kind === 'wallace' ? T('Dans sa ville, après 1872 : {l}.', {l: names2(list)}) : T('Près de chez {e} : {l}.', {e: esc(T(life.person?.gender === 'female' ? 'elle' : 'lui')), l: names2(list)});
        return placesHtml(kind, list, lead);
    }

    /* ─────────── 👤 la fiche d'une personne ─────────── */
    const PERSON_PARTS = ['filles', 'carignan', 'deputes', 'compagnons', 'aviateurs', 'combattants', 'bastille', 'poilus', 'lloyd', 'forts', 'poudres', 'semaphores', 'lazarets', 'wallace'];
    async function lloydForLife(life) {
        if (!SEA_JOB.test(jobsText(life))) return '';
        const s = lifeSpan(life); if (s.from === null || s.to < 1764 || s.from > 1900) return '';
        const D = await rowsOf('lloyd'); const a = Math.max(1764, (s.birth ?? s.from) + 15), b = Math.min(1900, s.to);
        const list = lloydVolumes(D.rows, a, b); if (!list.length) return '';
        return lloydHtml(list, T('Marin, armateur ou capitaine : les navires de ses années sont dans le Lloyd’s Register ({a}–{b}).', {a: String(list[0].y), b: String(list.at(-1).y)}));
    }
    async function personInto(host, id, opts = {}) {
        const s = settings(), want = (opts.parts || PERSON_PARTS).filter(k => opts.force || s[k]);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (_) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        const priv = !!opts.private;
        const job = k => {
            if (NAMES[k]) return priv ? '' : rowsOf(k).then(D => (D.rows.length ? namesHtml(k, life, D) : '')); // une fiche vivante ou confidentielle : pas de comparaison de noms
            if (LINKS[k]) return linkHtml(k, life, priv);
            if (k === 'lloyd') return lloydForLife(life);
            if (PLACES[k]) return placesForLife(k, life);
            return '';
        };
        const html = await Promise.all(want.map(k => Promise.resolve().then(() => job(k)).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life tg-life">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        if (!PERSON_PARTS.some(k => on(k))) return '';
        const priv = p.living_status === 'living' || Number(p.is_private) === 1 ? '1' : '';
        return A().card(index, T('🏰 Grands noms et remparts'), '', `<div class="tg-block" data-tg-person="${Number(p.id)}" data-tg-priv="${priv}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-tg-person]').forEach(async h => {
            const n = await personInto(h, Number(h.dataset.tgPerson), {private: h.dataset.tgPriv === '1'});
            const card = h.closest('section.card'); if (card) card.hidden = !n;
        });
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie, à la demande ─────────── */
    const placeLL = pl => { const lat = num(pl?.lat ?? pl?.latitude), lon = num(pl?.lon ?? pl?.longitude); return lat !== null && lon !== null && !(lat === 0 && lon === 0) ? {lat, lon} : null; };
    const PLACE_KINDS = ['forts', 'poudres', 'semaphores', 'lazarets', 'wallace', 'nes'];
    const PLACE_R = {forts: 15, poudres: 10, semaphores: 15, lazarets: 25, wallace: 3};
    async function placePart(kind, place) {
        const ll = placeLL(place); if (!ll) return '';
        const name = place.name || '';
        if (PLACES[kind]) {
            const list = near(await merged(kind), ll.lat, ll.lon, PLACE_R[kind], 15); if (!list.length) return '';
            const lead = T({forts: 'Forts et fortifications à moins de {r} km : {l}.', poudres: 'Poudrières et poudreries à moins de {r} km : {l}.', semaphores: 'Sémaphores à moins de {r} km : {l}.',
                lazarets: 'Lazarets à moins de {r} km : {l}.', wallace: 'Fontaines Wallace à moins de {r} km : {l}.'}[kind], {r: String(PLACE_R[kind]), l: names2(list)});
            return placesHtml(kind, list, lead);
        }
        if (kind === 'nes') {
            const parts = [];
            for (const k of ['filles', 'carignan', 'deputes', 'compagnons'].filter(on)) {
                const D = await rowsOf(k); const list = near(D.rows.filter(okLL), ll.lat, ll.lon, 3, 20); if (!list.length) continue;
                parts.push({k, list});
            }
            if (!parts.length) return '';
            const all = parts.flatMap(p => p.list.map(x => personLi(p.k, x)));
            const first = parts[0];
            return row('🎖', `${T('Nés à {c} ou tout près : {l}.', {c: esc(name || T('cet endroit')), l: parts.slice(0, 3).map(p => `<b>${esc(p.list[0].r.n)}</b> (${esc(NAMES[p.k].role(p.list[0].r))})`).join(', ')})} ${srcLink(rowUrl(first.k, first.list[0].r))}`,
                LIC.wd(), more(`<ul class="hist-ul tg-ul">${all.slice(0, 20).join('')}</ul>`, all.length));
        }
        return '';
    }
    async function placeInto(host, place, opts = {}) {
        const s = settings(), kinds = (opts.parts || PLACE_KINDS).filter(k => opts.force || k === 'nes' || s[k]);
        const parts = await Promise.all(kinds.map(k => placePart(k, place).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const html = parts.filter(Boolean);
        host.innerHTML = html.length ? `<section class="maintenance-panel cplus-panel tg-panel"><h3>${esc(T('🏰 Grands noms et remparts'))}</h3><div class="hist-life tg-life">${html.join('')}</div></section>` : '';
        return html.length;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || ''};
    }
    const placeOn = () => PLACE_KINDS.some(k => (k === 'nes' ? ['filles', 'carignan', 'deputes', 'compagnons'].some(on) : on(k)));
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'tg_place', host: '[data-tg-host]', icon: '🏰', label: 'Grands noms et remparts', group: 'Données téléchargées', enabled: placeOn});
    async function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-tg])'); if (!village) return;
        village.dataset.tg = '1';
        if (!placeOn()) return;
        const anchor = village.querySelector('[data-tf-host]') || village.querySelector('[data-td-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="tg-place" data-tg-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-tg-host]'), villagePlace(village));
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate().catch(e => { if (!(e?.name === 'AbortError' || (e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || ''))))) console.error(e); }); }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 📜 Monographie de commune ─────────── */
    const MONO = [['forts', 'tg_forts', '🏰', 'Forts et fortifications', 'Le lieu'], ['poudres', 'tg_poudres', '💥', 'Poudrières et poudreries', 'Le lieu'], ['semaphores', 'tg_semaphores', '📡', 'Les sémaphores', 'Le lieu'],
        ['lazarets', 'tg_lazarets', '⚕️', 'Lazarets et quarantaines', 'Le lieu'], ['wallace', 'tg_wallace', '⛲', 'Les fontaines Wallace', 'Le lieu'], ['nes', 'tg_nes', '🎖', 'Nés ici : députés, Compagnons, Filles du Roy', 'Le monde']];
    const SRC_TXT = {forts: 'Wikidata (CC0) ; OpenStreetMap (ODbL)', poudres: 'Wikidata (CC0) ; OpenStreetMap (ODbL)', semaphores: 'Wikidata (CC0) ; OpenStreetMap (ODbL)', lazarets: 'Wikidata (CC0) ; OpenStreetMap (ODbL)',
        wallace: 'Wikidata (CC0) ; OpenStreetMap (ODbL)', nes: 'Wikidata (CC0)'};
    (ext.monographSections = ext.monographSections || []).push(...MONO.map(([kind, id, icon, label, group]) => ({
        id, icon, label, group, defaultOn: true, enabled: () => (kind === 'nes' ? ['filles', 'carignan', 'deputes', 'compagnons'].some(on) : on(kind)), source: SRC_TXT[kind],
        render: async (place, host) => {
            const p = {...place, lat: place.latitude ?? place.lat, lon: place.longitude ?? place.lon, insee: place.insee || place.admin4_code || ''};
            const html = await placePart(kind, p); if (!html) return false;
            host.innerHTML = `<div class="hist-life tg-life">${html}</div>`; return true;
        }})));

    /* ─────────── 📋 Listes (les noms : reliés à l'arbre par app-listes-personnes.js, sur l'ordinateur) ─────────── */
    const L = (id, pack, icon, label, group, source, sourceUrl, kind, load2, fields, extra = {}) => ({id, pack, icon, label: T(label), group, source, sourceUrl, enabled: () => on(kind), load: load2, fields, open: r => { const u = safeUrl(r.src); if (u) window.open(u, '_blank', 'noopener'); }, ...extra});
    const F = (key, label, type = 'text', more2 = {}) => ({key, label: T(label), type, ...more2});
    const lpPlace = r => ({insee: /^\d[\dAB]\d{3}$/.test(String(r.insee || '')) ? String(r.insee) : '', name: r.bp || '', dep: ''});
    const nameList = (kind, label, url) => L(`tg_${kind}`, FILES[kind], NAMES[kind].icon, label, 'Le monde', kind === 'aviateurs' ? 'Wikipédia en anglais (CC BY-SA 4.0)' : 'Wikidata (CC0)', url, kind,
        async () => { const D = await rowsOf(kind); NAMES_META[kind] = D.meta; return D.rows.map(r => ({name: r.n, born: num(r.b), died: num(r.d), place: r.bp || '', insee: r.insee || '', role: NAMES[kind].role(r), extra: r.extra || r.country || '', note: r.note || '', lat: r.lat, lon: r.lon, year: r.y ?? null, killed: r.killed ? T(r.killed === 'w' ? 'au combat' : 'en accident') : '', src: rowUrl(kind, r)})); },
        kind === 'aviateurs' ? [F('name', 'Nom', 'text', {person: true}), F('role', 'Brevet'), F('year', 'Année', 'year'), F('extra', 'Pays'), F('killed', 'Mort en vol', 'enum'), F('note', 'Remarque (Wikipédia)'), F('src', 'Source', 'url')]
            : [F('name', 'Nom', 'text', {person: true}), F('born', 'Naissance', 'year'), F('died', 'Décès', 'year'), F('place', 'Lieu de naissance', 'place'), F('role', 'Rôle', 'enum'), F('src', 'Source', 'url')],
        {period: r => (kind === 'aviateurs' ? [r.year, r.year] : [NAMES[kind].win[0], NAMES[kind].win[1]]), geo: r => (num(r.lat) !== null ? [r.lat, r.lon] : null),
            personMatch: {born: r => r.born, died: r => r.died, place: lpPlace, role: r => r.role}});
    const placeList = (kind, label) => L(`tg_${kind}`, FILES[kind], PLACES[kind].icon, label, 'Le lieu', 'Wikidata (CC0) ; OpenStreetMap (ODbL)', 'https://www.wikidata.org', kind,
        async () => (await merged(kind)).map(r => ({name: r.n, kind: T(KIND_WORD[r.k] || r.k), from: r.from, to: r.to, commune: r.commune || '', base: r.via === 'osm' ? 'OpenStreetMap' : 'Wikidata', lat: r.lat, lon: r.lon, src: placeUrl(r)})),
        [F('name', 'Nom'), F('kind', 'Sorte', 'enum'), F('from', 'Depuis', 'year'), F('to', 'Jusqu’en', 'year'), F('commune', 'Commune', 'place'), F('base', 'Base', 'enum'), F('src', 'Source', 'url')],
        {period: r => [r.from, r.to], geo: r => [r.lat, r.lon], packs: [FILES[kind], FILES[`osm_${kind}`]]});
    (ext.dataLists = ext.dataLists || []).push(
        nameList('filles', 'Filles du Roy (1663-1673) connues de Wikidata', 'https://www.wikidata.org/wiki/Q747471'),
        nameList('carignan', 'Régiment de Carignan-Salières (1665) : soldats et officiers', 'https://www.wikidata.org/wiki/Q3455247'),
        nameList('deputes', 'Députés de 1789 (États généraux, Constituante) et conventionnels', 'https://www.wikidata.org/wiki/Q59309522'),
        nameList('compagnons', 'Compagnons de la Libération', 'https://www.wikidata.org/wiki/Q2990283'),
        nameList('aviateurs', 'Brevets de pilote de l’Aéro-Club de France (1909-1911)', 'https://en.wikipedia.org/wiki/A%C3%A9ro-Club_de_France'),
        placeList('forts', 'Forts Séré de Rivières, ligne Maginot, Vauban'), placeList('poudres', 'Poudrières et poudreries'), placeList('semaphores', 'Sémaphores de la Marine'),
        placeList('lazarets', 'Lazarets (quarantaine)'), placeList('wallace', 'Fontaines Wallace'),
        L('tg_lloyd', 'tg-lloyd', '🚢', 'Lloyd’s Register : les volumes numérisés (1764-1900)', 'Le monde', 'Internet Archive (Lloyd’s Register Foundation)', URLS.lloyd, 'lloyd',
            async () => (await rowsOf('lloyd')).rows.map(r => ({year: r.y, part: r.part, lic: r.lic, src: iaUrl(r.id)})),
            [F('year', 'Année', 'year'), F('part', 'Partie', 'enum'), F('lic', 'Licence du volume', 'enum'), F('src', 'Ouvrir le volume', 'url')], {period: r => [r.year, r.year]}));

    /* ─────────── 🗺 Cartes ─────────── */
    const inBox = (bbox, lat, lon) => !bbox || (lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3]);
    const layer = (id, icon, label, get, src, label2 = r => r.n, group = 'Le lieu') => ({id, icon, label: T(label), group, kind: 'points', source: src,
        run: async ({q, bbox, from, to, max = 2000}) => { const rows = await get(); const features = rows.filter(r => num(r.lat) !== null && inBox(bbox, r.lat, r.lon) && (!from || num(r.to) === null || r.to >= from) && (!to || num(r.from) === null || r.from <= to) && (!q || fold(label2(r)).includes(fold(q)))).slice(0, max).map(r => ({type: 'pt', lat: r.lat, lon: r.lon, label: label2(r)})); return {features, source: src}; }});
    const kw = r => `${r.n || T(KIND_WORD[r.k] || r.k)}${r.from ? ` (${r.from})` : ''}`;
    (ext.mapLayerSources = ext.mapLayerSources || []).push(
        layer('tg_forts', '🏰', 'Forts Séré de Rivières, ligne Maginot, Vauban', () => merged('forts'), 'Wikidata (CC0) ; OpenStreetMap (ODbL)', kw),
        layer('tg_poudres', '💥', 'Poudrières et poudreries', () => merged('poudres'), 'Wikidata (CC0) ; OpenStreetMap (ODbL)', kw),
        layer('tg_semaphores', '📡', 'Sémaphores de la Marine', () => merged('semaphores'), 'Wikidata (CC0) ; OpenStreetMap (ODbL)', kw),
        layer('tg_lazarets', '⚕️', 'Lazarets (quarantaine)', () => merged('lazarets'), 'Wikidata (CC0) ; OpenStreetMap (ODbL)', kw),
        layer('tg_wallace', '⛲', 'Fontaines Wallace', async () => (await merged('wallace')).map(r => ({...r, from: r.from ?? 1872})), 'Wikidata (CC0) ; OpenStreetMap (ODbL)', kw),
        layer('tg_deputes', '🏛', 'Lieux de naissance des députés de 1789 et conventionnels', async () => (await rowsOf('deputes')).rows.map(r => ({...r, from: 1789, to: 1795})), 'Wikidata (CC0)', r => `${r.n} (${roleTxt(r.role)})`, 'Le monde'),
        layer('tg_compagnons', '✠', 'Lieux de naissance des Compagnons de la Libération', async () => (await rowsOf('compagnons')).rows.map(r => ({...r, from: 1940, to: 1946})), 'Wikidata (CC0)', r => r.n, 'Le monde'));

    /* ─────────── 🧰 à la demande ─────────── */
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
        const html = await placePart(kind, pl);
        host.innerHTML = html ? `<div class="hist-life tg-life">${html}</div>` : '';
        return !!html;
    }
    async function runYear(ctx, host) {
        const y = num(ctx.year); if (y === null) { host.innerHTML = emptyLine(T('Choisis une année.'), '📅'); return null; }
        if (y < 1764 || y > 1900) { host.innerHTML = emptyLine(T('Les volumes numérisés vont de 1764 à 1900.')); return false; }
        const r = lloydNearest((await rowsOf('lloyd')).rows, y); if (!r) { host.innerHTML = emptyLine(T('Fichier absent.')); return false; }
        host.innerHTML = `<div class="hist-life tg-life">${lloydHtml([r], T('Le Lloyd’s Register le plus proche de {y} : celui de {v}.', {y: String(y), v: String(r.y)}))}</div>`;
        return true;
    }
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'tgp_noms', icon: '🎖', label: T('Son nom dans les listes d’autrefois (Filles du Roy, députés de 1789, Compagnons…)'), group: 'La personne', needs: ['person'], online: false, installed: () => true,
            run: (ctx, host) => runPerson(['filles', 'carignan', 'deputes', 'compagnons', 'aviateurs'], ctx, host, 'Aucun nom pareil dans ces listes (comparé sur l’ordinateur ; jamais pour une fiche vivante ou confidentielle).')},
        {id: 'tgp_liens', icon: '🔗', label: T('Guerre d’Amérique, Bastille, testaments de Poilus, Lloyd’s Register (liens)'), group: 'La personne', needs: ['person'], online: false, installed: () => true,
            run: (ctx, host) => runPerson(['combattants', 'bastille', 'poilus', 'lloyd'], ctx, host, 'Pour une personne décédée, de l’âge et de l’endroit voulus (jamais pour une fiche vivante ou confidentielle, ni en consultation).')},
        {id: 'tgp_lieux', icon: '🏰', label: T('Forts, poudrières, sémaphores, lazarets près de chez lui'), group: 'La personne', needs: ['person'], online: false, installed: () => true,
            run: (ctx, host) => runPerson(['forts', 'poudres', 'semaphores', 'lazarets', 'wallace'], ctx, host, 'Rien de connu près de ses lieux pendant sa vie.')},
        {id: 'tgy_lloyd', icon: '🚢', label: T('Le Lloyd’s Register d’une année'), group: 'Le monde', needs: ['year'], online: false, installed: () => true, run: runYear},
        ...MONO.map(([kind, id, icon, label]) => ({id: `${id}_lieu`, icon, label: T(label), group: 'Le lieu', needs: ['place'], online: false, installed: () => true, run: (ctx, host) => runPlace(kind, ctx, host)})));

    /* ─────────── 🌍 Où chercher : des sites en plus (liens seulement) ─────────── */
    function registerOuChercher() {
        const M = root.LCNDA_OUC_MONDE; if (!M || !Array.isArray(M.SITES) || M.SITES.some(s => s.key === 'tg_poilus')) return !!M;
        M.SITES.push(
            {key: 'tg_combattants', icon: '⚓', group: 'Monde', label: T('Combattants français de la guerre américaine, 1778-1783 (liste de 1903)'), cats: ['militaire'], period: [1778, 1783], access: 'online',
                url: () => URLS.combattants, rel: {countries: ['fr'], from: 1778, to: 1783, base: 0.05, why: () => T('Les soldats et marins de Rochambeau, d’Estaing et de Grasse')}},
            {key: 'tg_bastille', icon: '🗝', group: 'Monde', label: T('Tableau des vainqueurs de la Bastille (1790)'), cats: ['militaire'], period: [1789, 1790], access: 'online',
                url: () => URLS.bastille, rel: {countries: ['fr'], from: 1789, to: 1790, base: 0.03, why: () => T('Les quelque 950 combattants du 14 juillet 1789')}},
            {key: 'tg_poilus', icon: '📜', group: 'Monde', label: T('Testaments de Poilus (Archives nationales)'), cats: ['militaire'], period: [1914, 1918], access: 'online',
                url: () => URLS.poilus, rel: {countries: ['fr'], from: 1914, to: 1918, base: 0.04, why: () => T('Des testaments de soldats de la Grande Guerre, transcrits')}},
            {key: 'tg_lloyd', icon: '🚢', group: 'Monde', label: T('Lloyd’s Register of Shipping (1764-1900, Internet Archive)'), cats: ['maritime'], period: [1764, 1900], access: 'online',
                url: () => URLS.lloyd, rel: {countries: ['fr', 'gb'], from: 1764, to: 1900, base: 0.03, why: () => T('Les navires de commerce, leur capitaine et leur port, année par année')}});
        return true;
    }

    /* ─────────── ⚙️ Réglages → 🏰 Grands noms et remparts ─────────── */
    const FILE_LABEL = [['filles', '👰 Filles du Roy'], ['carignan', '⚔️ Carignan-Salières'], ['deputes', '🏛 Députés 1789-1795'], ['compagnons', '✠ Compagnons de la Libération'], ['aviateurs', '✈️ Brevets de pilote'],
        ['lloyd', '🚢 Lloyd’s Register (index)'], ['forts', '🏰 Forts (Wikidata)'], ['osm_forts', '🏰 Forts (OpenStreetMap)'], ['poudres', '💥 Poudres (Wikidata)'], ['osm_poudres', '💥 Poudres (OpenStreetMap)'],
        ['semaphores', '📡 Sémaphores (Wikidata)'], ['osm_semaphores', '📡 Sémaphores (OpenStreetMap)'], ['lazarets', '⚕️ Lazarets (Wikidata)'], ['osm_lazarets', '⚕️ Lazarets (OpenStreetMap)'],
        ['wallace', '⛲ Fontaines Wallace (Wikidata)'], ['osm_wallace', '⛲ Fontaines Wallace (OpenStreetMap)']];
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const metas = {};
        await Promise.all(FILE_LABEL.map(async ([k]) => { const D = await quiet(load(k)); if (D) metas[k] = D; }));
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const s = settings();
        const tg = ([key, label, sub]) => `<label class="checkbox-line cplus-tg" data-tg-tg="${esc(key)}"><input type="checkbox" ${s[key] ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const fileRow = ([k, label]) => { const D = metas[k]; if (!D) return `<tr><td>${esc(T(label))}</td><td colspan="4" class="muted">${esc(k.startsWith('osm_') ? T('À fabriquer sur GitHub (Actions → « Grands noms et remparts (lot G) », quoi = osm) ; arrive ensuite par Réglages → 🗂 Données.') : T('Fichier absent.'))}</td></tr>`;
            const m = D.meta; return `<tr><td>${esc(T(label))}</td><td>${link(m.url, m.source)}<br><small class="muted">${esc(m.what || '')}</small></td><td>${esc(nf(D.rows.length))}</td><td>${link(m.licence_url, m.licence)}</td><td>${esc(m.built || '')}</td></tr>`; };
        ws.innerHTML = `<section class="page cplus-settings tg-settings" data-tg-settings-page>${UI().pageHeader ? UI().pageHeader({title: T('Grands noms et remparts'), icon: '🏰', where: T('Réglages · Données'), help: esc(T('Filles du Roy, soldats de Carignan-Salières, députés de 1789, Compagnons de la Libération, premiers aviateurs ; forts, poudrières, sémaphores, lazarets, fontaines Wallace.'))}) : `<h2>${esc(T(TAB[2]))}</h2>`}
            <div class="maintenance-panel"><h3>${esc(T('Ce qui s’affiche'))}</h3><p class="muted">${esc(T('Sur la fiche d’une personne (bloc « 🏰 Grands noms et remparts »), sur la fiche d’un village et dans la monographie de commune. Les listes sont dans Listes (les noms y sont comparés à l’arbre, sur l’ordinateur), les points dans Cartes.'))}</p>${PARTS.map(tg).join('')}</div>
            <div class="maintenance-panel"><h3>${esc(T('À propos des données'))}</h3><div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Sujet'))}</th><th>${esc(T('Source'))}</th><th>${esc(T('Lignes'))}</th><th>${esc(T('Licence'))}</th><th>${esc(T('Fabriqué le'))}</th></tr></thead><tbody>
                ${FILE_LABEL.map(fileRow).join('')}</tbody></table></div>
                <p class="muted">${esc(T('Tout est lu sur l’ordinateur : rien ne part sur Internet, ni nom ni lieu, pour personne. Les noms de la fiche sont comparés aux listes ici, jamais pour une fiche vivante ou confidentielle. Seuls les liens « ↗ » ouvrent une page, quand on clique.'))}</p>
                <p class="muted">${esc(T('Déjà dans l’app et réutilisé : les pavillons et bureaux d’octroi (« Bornes, octrois et douanes » du lot B, « 🚧 L’octroi de sa ville » du lot 9) ; les forteresses du module Châteaux ; la comparaison des listes avec l’arbre (Listes).'))}</p>
                <p class="muted">${esc(T('Liens seulement : les combattants de la guerre d’Amérique (liste de 1903 : texte lu par machine trop imparfait), le tableau des vainqueurs de la Bastille (Gallica, pas de licence ouverte), les testaments de Poilus (licence pas lisible d’ici), les pages du Lloyd’s Register (Internet Archive). « Chercher ce nom » copie le nom sur l’ordinateur, seulement pour une personne décédée, jamais en consultation.'))}</p></div></section>`;
    }
    document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-tg-tg]'); if (!t || !e.target.matches('input')) return;
        const s = settings(), k = t.dataset.tgTg, was = s[k];
        s[k] = e.target.checked; saveSettings(s);
        A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: T(PARTS.find(p => p[0] === k)?.[1] || k)}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }, icon: '🏰'});
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'telech_f'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK)) { let i = B.findIndex(b => b[0] === 'telech_f'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire_autour'); B.splice(i < 0 ? B.length : i + 1, 0, [BLOCK, '🏰 Grands noms et remparts']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK] ||= '12';
        registerOuChercher();
        return !!tabs;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.telechG = {...core, load, settings, personInto, placeInto, placePart, lifeOf,
        openSettings: () => { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }};
})(typeof window !== 'undefined' ? window : globalThis);
