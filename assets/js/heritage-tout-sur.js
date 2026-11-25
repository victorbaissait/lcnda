/* LCNDA — 🔎 « Ce qui le concerne » : tout ce que les données de l'app peuvent dire d'une personne, d'un lieu ou d'une année.
 *
 * N'enregistre AUCUNE donnée : lit seulement les registres communs
 *   LCNDA_EXT.dataSources (run / installed / install) et LCNDA_EXT.dataLists (installed / install / source),
 * plus les pages de packs de Réglages → Données (météo, histoire du lieu, prénoms, bases officielles, GOV, élections, décès INSEE…).
 *
 *  1. 👤 Un bloc de fiche « 🔎 Ce qui le concerne » (ext.personBlocks.tout_sur : se range, se cache, se replie comme les autres) :
 *     se remplit tout seul (d'abord les données sans Internet, puis celles en ligne après un court délai ou sur « ▸ plus »),
 *     les meilleures suggestions d'abord (une ligne chacune, avec « ↗ source » et un petit indice de pertinence), le reste sous
 *     « ▸ voir les N », une dernière ligne « ⤓ N données pourraient en dire plus ». « ⤢ Tout voir » ouvre le rapport complet.
 *     Ce qui a déjà son propre bloc visible sur la fiche est marqué « déjà sur la fiche » (et passe après).
 *  2. ✓ Garder : en note avec sa source (titre, adresse, date de consultation), en source seulement, ou en événement « contexte ».
 *     ＋ Ajouter aussi à… : conjoint(s), enfants, parents, frères et sœurs (cochés d'office : ceux en vie à cette date), sa
 *     chronologie, une de ses enquêtes. Tout en une fois, un seul ↶. « ✗ Pas utile » cache (avec ↶). Rappel : localStorage
 *     « genealogie-tout-sur ».
 *  3. ⤢ Le rapport complet (fenêtre) : La personne / Ses lieux / Son époque / À chercher, « 27 données regardées, 14 ont trouvé
 *     quelque chose », ↻ Relancer, 🖨 Imprimer, 📤 Envoyer vers…, ＋ Ajouter comme note (↶), « Sur sa fiche, caché » et
 *     « ⤓ Pas encore installé » (seulement ce qui compte pour lui : pays, époque), « ⤓ Installer », « ⤓ Tout installer (N Mo) ».
 *  4. 📍 « Ce qui concerne ce lieu » (bouton sur la fiche d'un village et la monographie) et 📅 « Cette année-là ».
 *  5. 🧰 Listes → Données → « 🔎 Chercher dans toutes les données » : une personne, un lieu, une année (ou plusieurs), chaque
 *     source utilisable, une ou toutes.
 *  6. 📊 Widget du tableau de bord « 🔎 Ce qui le/la concerne » (personne choisie, de départ, ou un ancêtre au hasard chaque jour).
 * Mode consultation : pas d'installation ni d'écriture. Essai : tests/test-tout-sur.js
 * Pour d'autres fichiers : LCNDA_EXT.toutSur = {open, openPlace, openYear, openTool, run, plan, suggestions, missing, keep}.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (a, q) => A().api(a, q);
    const post = (a, b) => A().api(a, {}, {method: 'POST', body: b}).then(r => r?.result || r);
    const toast = (m, k) => A().toast?.(m, k);
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.body.classList.contains('ms-on');
    const RO = () => kiosk() || document.documentElement.classList.contains('base-readonly');
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’‘]/g, "'");
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const yearOf = v => { const m = String(v ?? '').match(/(^|[^\d])(\d{3,4})(?!\d)/); return m ? Number(m[2]) : 0; };
    const fmtSize = b => (!b ? '' : b >= 1e9 ? `${String(Math.round(b / 1e8) / 10).replace('.', ',')} Go` : b >= 1e6 ? `${Math.round(b / 1e6)} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`);
    const timeout = (p, ms, v) => Promise.race([Promise.resolve(p), new Promise(r => setTimeout(() => r(v), ms))]);
    const GROUPS = [['person', '👤', 'La personne'], ['places', '📍', 'Ses lieux'], ['era', '📅', 'Son époque'], ['search', '🔎', 'À chercher']];
    const LIMIT = 4, RUN_MS = 25000, ONLINE_DELAY = 2500;
    const KEY = 'genealogie-tout-sur';
    const BLOCK = ['tout_sur', '🔎 Ce qui le concerne'];

    /* ═════════════ ce qu'on garde dans le navigateur : gardé / pas utile ═════════════ */
    const lsGet = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; } };
    const lsSet = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {} };
    const mark = (kind, pid, fid, val) => { const s = lsGet(); s[kind] = s[kind] || {}; const m = s[kind][pid] = s[kind][pid] || {}; if (val == null) delete m[fid]; else m[fid] = val; lsSet(s); };
    const marked = (kind, pid, fid) => !!lsGet()[kind]?.[pid]?.[fid];

    /* ═════════════ la vie d'une personne : années, lieux, pays, métiers, famille ═════════════ */
    const BIRTH = ['BIRT', 'CHR', 'BAPM'], DEATH = ['DEAT', 'BURI', 'CREM'];
    const COUNTRY = [['fr', 'france|french|francaise'], ['be', 'belgique|belgium|belgie'], ['ch', 'suisse|switzerland|schweiz'], ['lu', 'luxembourg'], ['de', 'allemagne|germany|deutschland|prusse|baviere'],
        ['nl', 'pays-bas|pays bas|netherlands|hollande'], ['dk', 'danemark|denmark'], ['gb', 'royaume-uni|royaume uni|angleterre|ecosse|pays de galles|united kingdom|england|scotland|wales'], ['ie', 'irlande|ireland'],
        ['es', 'espagne|spain|espana'], ['pt', 'portugal'], ['it', 'italie|italy|italia|savoie \\(royaume'], ['pl', 'pologne|poland|polska'], ['cz', 'tchequie|republique tcheque|boheme|czech'], ['sk', 'slovaquie|slovakia'],
        ['at', 'autriche|austria|osterreich'], ['hu', 'hongrie|hungary'], ['ro', 'roumanie|romania'], ['se', 'suede|sweden'], ['no', 'norvege|norway'], ['fi', 'finlande|finland'], ['ru', 'russie|russia'], ['gr', 'grece|greece'],
        ['us', 'etats-unis|etats unis|usa|united states|amerique'], ['ca', 'canada|quebec'], ['mx', 'mexique|mexico'], ['br', 'bresil|brazil'], ['ar', 'argentine|argentina'], ['cl', 'chili|chile'], ['uy', 'uruguay'],
        ['dz', 'algerie|algeria'], ['ma', 'maroc|morocco'], ['tn', 'tunisie|tunisia'], ['sn', 'senegal'], ['mg', 'madagascar'], ['au', 'australie|australia'], ['nz', 'nouvelle-zelande|new zealand'],
        ['vn', 'vietnam|viet nam|indochine'], ['in', 'inde|india'], ['cn', 'chine|china'], ['jp', 'japon|japan'], ['tr', 'turquie|turkey']].map(([c, re]) => [c, new RegExp(`(^|[^a-z])(${re})([^a-z]|$)`)]);
    const countryOf = pl => { const s = fold([pl.country, pl.state].filter(Boolean).join(' ')); for (const [c, re] of COUNTRY) if (re.test(s)) return c; if (/^\d[\dab]\d{3}$/i.test(String(pl.insee || ''))) return 'fr'; return ''; };
    const COUNTRY_FR = {fr: 'France', be: 'Belgique', ch: 'Suisse', lu: 'Luxembourg', de: 'Allemagne', nl: 'Pays-Bas', dk: 'Danemark', gb: 'Royaume-Uni', es: 'Espagne', it: 'Italie', pl: 'Pologne', us: 'États-Unis', ca: 'Canada', at: 'Autriche', cz: 'Tchéquie'};
    const yOf = e => Number(e?.year) || yearOf(e?.sort_date) || yearOf(e?.date_text) || 0;
    const fem = g => /^(f|female|femme)$/i.test(String(g || ''));
    const pYear = (p, k) => Number(p?.[`${k}_year`]) || yearOf(p?.[`${k}_date`]) || 0;
    function lifeOf(detail) {
        const p = detail?.person || {}, ev = (detail?.events || []).filter(e => !e.person_id || Number(e.person_id) === Number(p.id) || e.scope === 'family');
        const pick = tags => { for (const t of tags) { const e = ev.find(x => x.gedcom_tag === t && yOf(x)); if (e) return e; } for (const t of tags) { const e = ev.find(x => x.gedcom_tag === t); if (e) return e; } return null; };
        const b = pick(BIRTH), d = pick(DEATH);
        const by = (b && yOf(b)) || pYear(p, 'birth'), dy = (d && yOf(d)) || pYear(p, 'death');
        const places = [], seen = new Set();
        const add = (e, role) => { if (!e || !(e.place_id || e.place_name)) return; const k = e.place_id || fold(e.place_name); if (seen.has(k)) return; seen.add(k);
            const pl = {id: Number(e.place_id) || 0, name: e.place_name || '', county: e.county || '', state: e.state || '', country: e.country || '', latitude: e.latitude, longitude: e.longitude, lat: e.latitude, lon: e.longitude, insee: e.admin4_code || '', admin4_code: e.admin4_code || '', role, year: yOf(e)};
            pl.cc = countryOf(pl); places.push(pl); };
        add(b, 'birth'); add(d, 'death'); ev.slice().sort((x, y) => yOf(x) - yOf(y)).forEach(e => add(e, 'other'));
        let countries = [...new Set(places.map(x => x.cc).filter(Boolean))]; if (!countries.length && places.length) countries = ['fr'];
        const occ = [p.occupation, ...ev.filter(e => /OCCU/.test(e.gedcom_tag || '')).map(e => e.title || e.description || '')].map(fold).join(' ').split(/[^a-z]+/).filter(w => w.length > 3);
        return {pid: Number(p.id) || 0, first: String(p.first_name || '').split(/\s+/)[0] || A().personName?.(p) || T('cette personne'), name: A().personName?.(p) || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
            female: fem(p.gender), by, dy, end: dy || (by ? Math.min(by + 90, new Date().getFullYear()) : 0), places, countries, occ: [...new Set(occ)], birthPlace: places.find(x => x.role === 'birth') || places[0] || null, deathPlace: places.find(x => x.role === 'death') || null};
    }
    const asPersonCtx = detail => ({...detail, ...(detail.person || {}), person: detail.person, events: detail.events});
    const detailCache = new Map();
    const getDetail = (pid, fresh = false) => { pid = Number(pid); if (!pid) return Promise.resolve(null); if (!fresh && detailCache.has(pid)) return detailCache.get(pid);
        const pr = api('person', {id: pid}).catch(() => null); detailCache.set(pid, pr); return pr; };

    /* ═════════════ les registres ═════════════ */
    const sources = () => { const seen = new Set(); return (ext.dataSources || []).filter(d => d && d.id && typeof d.run === 'function' && !seen.has(d.id) && seen.add(d.id)); };
    const lists = () => { try { return ext.dataListsEngine?.list?.() || ext.dataLists || []; } catch (_) { return ext.dataLists || []; } };
    const needs = d => (Array.isArray(d.needs) ? d.needs : []);
    const ONLINE_RE = /wikidata|^commune_plus|^cc_|bnf|^ha_|^territoire|chateaux/;
    const isOnline = d => d.online === true || (d.online !== false && ONLINE_RE.test(d.id));
    async function isInstalled(d) { if (typeof d.installed !== 'function') return true; try { return (await timeout(d.installed(), 6000, true)) !== false; } catch (_) { return true; } }
    // le bloc de la fiche qui montre déjà la même chose (pour ne pas le dire deux fois)
    const BLOCK_OF = [[/^ba_annuaires$/, 'brevets_annuaires'], [/^ha_/, 'histoire_autour'], [/^wikidata_autour$/, 'wikidata_autour'], [/^(adn_ancien|bnf_auteur)$/, 'adn_livres'], [/^mr_metier$/, 'mr_metier'], [/^bases_officielles_/, 'bases_officielles'],
        [/^commune_plus_newspapers$/, 'cplus_newspapers'], [/^tq_(?!.*_(place|annee)$)/, 'terre_quotidien'], [/^cc_nom_villages$/, 'commune_culture'], [/^il-a-pu-voir$/, 'sky_seen'], [/^l10t_p_/, 'terre_gens'], [/^l10v_personne$/, 'l10v_village'], [/^l10op_/, 'lot10_objets_traces'], [/^insee_deces$/, '']];
    function onSheet(id, pid) {
        const hit = BLOCK_OF.find(([re]) => re.test(id)); if (!hit || !hit[1]) return false;
        const keys = (A().defaultPersonBlocks || []).map(b => b[0]); if (!keys.includes(hit[1])) return false;
        try { return !(A().personBlockSettings?.(pid)?.hidden || []).includes(hit[1]); } catch (_) { return true; }
    }

    /* ═════════════ le plan : quelle source, pour quoi ═════════════ */
    /** subject = {person?: detail, place?: lieu, year?: n, only?: [ids]} → [{key, d, ctx, group, sub, life}] */
    function plan(subject) {
        const out = [], life = subject.person ? lifeOf(subject.person) : null, only = subject.only ? new Set(subject.only) : null;
        const push = (d, ctx, group, sub, ck) => out.push({key: `${d.id}|${ck}`, d, ctx, group: d.group === 'Chercher' ? 'search' : group, sub, life});
        const places = life ? [life.birthPlace, life.deathPlace].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i) : [];
        if (subject.place) places.unshift(subject.place);
        const years = [];
        if (subject.year) years.push([Number(subject.year), T('l’année choisie')]);
        if (life?.by) years.push([life.by, T('l’année de sa naissance')]);
        if (life?.dy && life.dy !== life.by) years.push([life.dy, T('l’année de sa mort')]);
        const plKey = pl => `pl${pl.id || fold(pl.name)}`, plSub = pl => `${pl.name}${pl.role === 'birth' ? ` (${T('naissance')})` : pl.role === 'death' ? ` (${T('décès')})` : ''}`;
        for (const d of sources()) {
            if (only && !only.has(d.id)) continue;
            const n = needs(d), np = n.includes('person'), nl = n.includes('place'), ny = n.includes('year');
            if (np) { if (subject.person) push(d, {person: asPersonCtx(subject.person), place: places[0] || null, year: life?.by || null}, 'person', '', `p${life.pid}`); continue; }
            if (nl && ny) {
                const pairs = []; if (subject.place && subject.year) pairs.push([subject.place, Number(subject.year)]);
                if (life?.birthPlace && life.by) pairs.push([life.birthPlace, life.by]); if (life?.deathPlace && life.dy) pairs.push([life.deathPlace, life.dy]);
                if (subject.place && !subject.year && !life) pairs.push([subject.place, 0]);
                const seen = new Set(); pairs.forEach(([pl, y]) => { const k = `${plKey(pl)}y${y}`; if (seen.has(k) || !y) return; seen.add(k); push(d, {place: pl, year: y}, 'places', `${pl.name}, ${y}`, k); });
                continue;
            }
            if (nl) { places.forEach(pl => push(d, {place: pl}, 'places', plSub(pl), plKey(pl))); continue; }
            if (ny) { const seen = new Set(); years.forEach(([y, why]) => { if (!y || seen.has(y)) return; seen.add(y); push(d, {year: y}, 'era', `${y} — ${why}`, `y${y}`); }); }
        }
        return out;
    }

    /* ═════════════ lancer : un hôte caché, une limite de 4 à la fois, gardé pour la session ═════════════ */
    const CACHE = new Map(); // key → Promise<résultat>
    let parking = null;
    const park = () => { if (!parking || !parking.isConnected) { parking = document.createElement('div'); parking.className = 'ts-parking'; parking.hidden = true; parking.setAttribute('aria-hidden', 'true'); document.body.appendChild(parking); } return parking; };
    const EMPTY_SEL = '.empty-line,.empty-box,.empty-card,.empty-state,.muted,script,style,button,.skeleton,.ui-skeleton,.loading-block,.ui-spinner,[hidden],small';
    /** le texte d'un morceau de page, avec une espace entre les éléments (« à 200 m.hôpital » → « à 200 m. hôpital ») */
    const textOf = el => { const c = el.cloneNode(true); c.querySelectorAll('*').forEach(e => e.append(' ')); return c.textContent.replace(/\s+/g, ' ').trim(); };
    // ce qui veut dire « rien » ou « pas maintenant » (hors ligne) : on ne le montre pas
    const NOTHING_RE = /^(\W*\s*)(aucun|aucune|rien|pas de |pas d’|pas d'|personne de ce nom|ce lieu n’est dans aucun|choisis )|pas de connexion à internet|s’afficheront quand tu seras connecté|hors ligne/i;
    function meaningful(node) {
        const c = node.cloneNode(true); c.querySelectorAll(EMPTY_SEL).forEach(x => x.remove());
        const t = textOf(c), letters = (t.match(/\p{L}/gu) || []).length;
        if (letters < 12) return false;
        if (t.length < 200 && NOTHING_RE.test(t)) return false;
        if (node.querySelector('input, select, textarea') && t.length < 90) return false; // un petit formulaire, pas un résultat
        return true;
    }
    const loading = node => !!node.querySelector('.ui-spinner,.loading-block,.skeleton,.ui-skeleton') || /(on cherche|recherche|chargement)[^.]{0,80}…\s*$/i.test(node.textContent.trim());
    function runOne(task, force = false) {
        if (!force && CACHE.has(task.key)) return CACHE.get(task.key);
        const pr = (async () => {
            const d = task.d;
            if (!(await isInstalled(d))) return {task, state: 'missing'};
            const host = document.createElement('div'); host.className = 'ts-res-host'; park().appendChild(host);
            let ret, err = '';
            try { ret = await timeout(d.run(task.ctx, host), RUN_MS, '__timeout__'); } catch (e) { err = e?.message || String(e); }
            for (let i = 0; i < 15 && loading(host); i++) await new Promise(r => setTimeout(r, 200));
            if (err) return {task, state: 'error', error: err, host};
            if (ret === false || loading(host) || !meaningful(host)) return {task, state: 'empty', host};
            return {task, state: 'found', host, ...digest(host)};
        })();
        CACHE.set(task.key, pr); return pr;
    }
    /** les tâches, LIMIT à la fois ; onEach(résultat, fait, total) */
    async function runAll(tasks, onEach, {force = false} = {}) {
        const out = new Array(tasks.length); let i = 0, done = 0;
        const worker = async () => { while (i < tasks.length) { const k = i++; try { out[k] = await runOne(tasks[k], force); } catch (e) { out[k] = {task: tasks[k], state: 'error', error: e.message}; } done++; try { onEach?.(out[k], done, tasks.length); } catch (_) {} } };
        await Promise.all(Array.from({length: Math.min(LIMIT, tasks.length)}, worker));
        return out;
    }
    const forget = prefix => { [...CACHE.keys()].forEach(k => { if (!prefix || k.includes(prefix)) CACHE.delete(k); }); };

    /** le résumé d'un résultat : une phrase, le nombre de lignes, le lien vers la source */
    function digest(host) {
        const c = host.cloneNode(true); c.querySelectorAll('script,style,button,.muted,[hidden],details > summary,input,select,textarea,label').forEach(x => x.remove());
        const cand = [...c.querySelectorAll('li, p, tr, .hist-t, .tq-row, h4 + *')].map(textOf).find(t => (t.match(/\p{L}/gu) || []).length >= 12);
        let summary = (cand || textOf(c));
        if (summary.length > 170) summary = summary.slice(0, 165).replace(/\s+\S*$/, '') + '…';
        const items = host.querySelectorAll('li, tbody tr').length;
        const links = [...host.querySelectorAll('a[href^="http"]')];
        const best = links.find(a => /source|wikidata|wikip|↗|data\.gouv|insee|archives|memoire|leonore|ign|osm|openstreetmap/i.test(a.textContent + ' ' + a.closest('small, .src, [class*="src"]')?.className)) || links[0];
        const text = textOf(c).slice(0, 1500);
        return {summary, items, url: best?.href || '', urlLabel: best ? (best.textContent.trim() || hostOf(best.href)) : '', text};
    }
    const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; } };
    function sourceOf(r) {
        const d = r.task.d, dl = lists().find(x => x.id === d.id);
        const label = d.source || dl?.source || (r.url ? hostOf(r.url) : T('{l}, dans LCNDA', {l: T(d.label)}));
        return {label, url: d.sourceUrl || r.url || dl?.sourceUrl || ''};
    }

    /* ═════════════ les suggestions : rangées par pertinence ═════════════ */
    const hashOf = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) | 0; return (h >>> 0).toString(36); };
    const fidOf = r => `${r.task.key}|${hashOf(r.summary || '')}`;
    function score(r, life) {
        const t = fold(r.text || r.summary || ''), hints = []; let s = {person: 4, places: 3, era: 1, search: 2}[r.task.group] || 1;
        if (life) {
            const names = life.places.map(p => fold(p.name).split(/[,(]/)[0].trim()).filter(n => n.length > 2);
            if (r.task.group === 'places' && r.task.ctx.place?.role === 'birth') s += 1;
            if (names.some(n => t.includes(n))) { s += 3; hints.push(T('même lieu')); }
            const ys = (t.match(/(^|[^\d])(1[0-9]{3}|20[0-2]\d)(?!\d)/g) || []).map(x => Number(x.replace(/\D/g, '')));
            if (life.by && ys.some(y => y >= life.by && y <= life.end)) { s += 2; hints.push(T('de son vivant')); }
            if (life.occ.some(w => t.includes(w))) { s += 3; hints.push(T('son métier')); }
            const km = (t.match(/(\d+(?:[.,]\d+)?)\s?km/) || [])[1]; if (km && Number(km.replace(',', '.')) <= 10) { s += 2; hints.push(T('tout près')); }
        }
        if (r.task.group === 'era') hints.push(T('son époque'));
        const sheet = life ? onSheet(r.task.d.id, life.pid) : false; if (sheet) s -= 6;
        return {score: s + Math.min(2, (r.items || 0) / 5), hints, sheet};
    }
    function suggestions(results, life) {
        const pid = life?.pid || 0;
        return results.filter(r => r?.state === 'found').map(r => { const fid = fidOf(r), sc = score(r, life); return {...r, fid, ...sc, src: sourceOf(r), kept: marked('kept', pid, fid), nope: marked('nope', pid, fid)}; })
            .sort((a, b) => b.score - a.score);
    }

    /* ═════════════ ⤓ Pas encore installé : seulement ce qui compte pour lui ═════════════ */
    const overlap = (life, a, b) => !life?.by || (life.by <= b && life.end >= a);
    const has = (life, ...cc) => !!life && life.countries.some(c => cc.includes(c));
    const FR = life => has(life, 'fr');
    const st = {}; // les états des packs, gardés 20 s
    const status = (k, f) => { const x = st[k]; if (x && Date.now() - x.at < 20000) return x.p; const p = Promise.resolve().then(f).catch(() => null); st[k] = {at: Date.now(), p}; return p; };
    const info = (k, action) => status('info_' + k, () => timeout(api(action), 6000, null));
    const sizeFrom = (r, k) => Number(r?.packs?.[k]?.size || r?.pack?.size || 0) || 0;
    const METEO = [['socle', 'Météo d’autrefois : le socle', ['fr', 'be', 'ch', 'lu'], 1836, 550e6], ['europe', 'Météo d’autrefois : pack Europe', ['de', 'nl', 'dk', 'gb', 'es', 'pl', 'cz', 'it', 'pt', 'sk'], 1836, 2.5e9],
        ['monde-amerique-nord', 'Météo d’autrefois : Amérique du Nord', ['us', 'ca', 'mx'], 1850, 300e6], ['monde-amerique-sud', 'Météo d’autrefois : Amérique du Sud', ['br', 'ar', 'cl', 'uy'], 1850, 15e6],
        ['monde-afrique', 'Météo d’autrefois : Afrique', ['dz', 'ma', 'tn', 'sn', 'mg'], 1850, 25e6], ['monde-asie', 'Météo d’autrefois : Asie', ['vn', 'in', 'cn', 'jp', 'tr'], 1850, 100e6],
        ['monde-oceanie', 'Météo d’autrefois : Océanie', ['au', 'nz'], 1850, 50e6], ['monde-europe', 'Météo d’autrefois : reste de l’Europe', ['at', 'se', 'no', 'fi', 'ru', 'hu', 'ro', 'gr', 'ie'], 1850, 80e6]];
    const where = life => COUNTRY_FR[life?.countries?.[0]] || T('ce pays');
    function packCatalog() {
        const out = METEO.map(([k, label, cc, from, approx]) => ({key: 'meteo_' + k, icon: '🌦', label, covers: [],
            applies: life => has(life, ...cc) && overlap(life, from, 2025), why: life => T('il a vécu en {c} entre {a} et {b} : le temps qu’il faisait le jour de ses événements', {c: where(life), a: String(Math.max(from, life.by || from)), b: String(Math.min(2025, life.end || 2025))}),
            installed: async () => !!(await status('meteo', () => api('meteo_status')))?.files?.[k]?.ok, size: async () => sizeFrom(await info('meteo', 'meteo_dl_info'), k) || approx,
            install: () => (ext.meteoDl?.run ? ext.meteoDl.run(k) : ext.meteo?.openSettings?.())}));
        out.push({key: 'histoire', icon: '🏘', label: 'Histoire du lieu', covers: ['hist_'], applies: life => FR(life) && overlap(life, 1354, 2023),
            why: life => T('il a vécu en France : combien d’habitants avait son village, quand le train est arrivé, l’été de l’année, séismes et inondations'),
            installed: async () => !!(await status('hist', () => api('hist_status')))?.installed, size: async () => sizeFrom(await info('hist', 'hist_dl_info'), 'histoire') || 18e6,
            install: () => (ext.histoire?.dl?.run ? ext.histoire.dl.run() : ext.histoire?.openSettings?.(true))});
        out.push({key: 'fhmd', icon: '👶', label: 'Mortalité des enfants par département (frdata.org)', covers: [], applies: life => FR(life) && overlap(life, 1901, 2020),
            why: () => T('ses enfants sont nés en France après 1901 : le risque de mourir avant 1 an dans son département'),
            installed: async () => Number((await status('hist', () => api('hist_status')))?.fhmd?.count || 0) > 0, size: async () => 0, install: () => ext.histoire?.openSettings?.()});
        out.push({key: 'prenoms', icon: '📊', label: 'Prénoms d’ici et d’ailleurs', covers: ['pp_'], applies: life => has(life, 'fr', 'be', 'ch', 'ca', 'lu', 'nl', 'gb', 'us') && overlap(life, 1880, 2030),
            why: life => T('son prénom « {p} » : combien d’enfants l’ont reçu l’année de sa naissance', {p: life.first}),
            installed: async () => !!(await status('pp', () => api('prenoms_pays_status')))?.installed, size: async () => sizeFrom(await info('pp', 'prenoms_pays_dl_info')), install: () => openPrenoms()});
        out.push({key: 'bo_mpf', icon: '🎖️', label: 'Morts pour la France 1914–1918', covers: ['bases_officielles_mpf', 'bo_mpf'], applies: life => FR(life) && !life.female && (!life.by || (life.by >= 1860 && life.by <= 1902)),
            why: life => T('il est né en {y} en France : la base des Morts pour la France pourrait le contenir', {y: String(life.by || '?')}),
            installed: async () => !!(await status('bo', () => api('bo_status')))?.bases?.mpf?.installed, size: async () => sizeFrom(await info('bo', 'bo_dl_info'), 'mpf'), install: () => ext.officialBases?.install?.('mpf')});
        out.push({key: 'bo_leonore', icon: '🏅', label: 'Légion d’honneur (base Léonore)', covers: ['bases_officielles_leonore', 'bo_leonore'], applies: life => FR(life) && overlap(life, 1802, 1977),
            why: () => T('il a vécu en France après 1802 : il a peut-être reçu la Légion d’honneur'),
            installed: async () => !!(await status('bo', () => api('bo_status')))?.bases?.leonore?.installed, size: async () => sizeFrom(await info('bo', 'bo_dl_info'), 'leonore'), install: () => ext.officialBases?.install?.('leonore')});
        out.push({key: 'gov', icon: '🏰', label: 'Noms des lieux anciens (GOV)', covers: ['gov_'], applies: life => has(life, 'de', 'pl', 'at', 'cz', 'sk', 'hu', 'nl', 'dk', 'lu') || (FR(life) && life.places.some(p => /moselle|bas-rhin|haut-rhin|alsace|lorraine/i.test(`${p.county} ${p.state}`))),
            why: () => T('ses lieux ont changé de pays ou de nom (Allemagne, Europe centrale, Alsace-Moselle) : leurs noms d’autrefois et à qui ils appartenaient'),
            installed: async () => !!(await status('gov', () => api('gov_status')))?.installed, size: async () => sizeFrom(await info('gov', 'gov_dl_info'), 'gov'), install: () => (ext.gov?.run ? ext.gov.run() : ext.gov?.openSettings?.())});
        out.push({key: 'elections', icon: '🗳', label: 'Élections d’autrefois', covers: ['elections'], applies: life => FR(life) && overlap(life, 1848 - 21, 2022) && (!life.by || life.end - life.by >= 21),
            off: () => !ext.elections?.isOn?.(), why: () => T('il a pu voter en France : qui est arrivé en tête dans sa commune'),
            installed: async () => !!(await status('el', () => api('elections_status')))?.installed, size: async () => sizeFrom(await info('el', 'elections_dl_info'), 'elections'),
            install: () => (ext.elections?.isOn?.() && ext.elections?.run ? ext.elections.run() : ext.elections?.openSettings?.())});
        out.push({key: 'insee', icon: '⚰️', label: 'Décès INSEE (1970 → aujourd’hui)', covers: ['insee_deces'], applies: life => FR(life) && (life.dy ? life.dy >= 1970 : (life.by && life.by >= 1880)),
            why: life => (life.dy ? T('il est mort en {y} : le fichier des décès de l’INSEE le contient sûrement', {y: String(life.dy)}) : T('né après 1880, sans date de décès connue : le fichier des décès de l’INSEE pourrait la donner')),
            installed: async () => { const d = sources().find(x => x.id === 'insee_deces'); return d ? isInstalled(d) : true; }, size: async () => 0, install: () => sources().find(x => x.id === 'insee_deces')?.install?.()});
        return out;
    }
    function openPrenoms() {
        if (!ext.prenomsPays?.panel) return toast(T('Installe le pack depuis Statistiques → Prénoms.'));
        const d = document.createElement('dialog'); d.className = 'modal ts-mini-dialog';
        d.innerHTML = `<div class="modal-head"><div><span class="eyebrow">⤓ ${esc(T('INSTALLER'))}</span><h2>📊 ${esc(T('Prénoms d’ici et d’ailleurs'))}</h2></div><button type="button" class="modal-close" data-ts-x aria-label="${esc(T('Fermer'))}">×</button></div><div class="modal-body" data-ts-pp></div>`;
        document.body.appendChild(d); d.querySelector('[data-ts-x]').addEventListener('click', () => d.close()); d.addEventListener('close', () => d.remove()); d.showModal();
        try { ext.prenomsPays.panel(d.querySelector('[data-ts-pp]')); } catch (e) { toast(e.message, 'error'); }
    }
    /** [{key, icon, label, why, size, off, install}] : ce qui pourrait en dire plus et n'est pas installé */
    async function missing(life, results = []) {
        const out = [], covered = new Set();
        const cat = packCatalog().filter(p => !life || p.applies(life));
        await Promise.all(cat.map(async p => {
            p.covers.forEach(c => covered.add(c));
            try { if (await timeout(p.installed(), 7000, true)) return; } catch (_) { return; }
            const size = await timeout(p.size(), 7000, 0).catch(() => 0);
            out.push({key: p.key, icon: p.icon, label: T(p.label), why: life ? p.why(life) : '', size, off: !!p.off?.(), install: p.install});
        }));
        packCatalog().forEach(p => p.covers.forEach(c => covered.add(c)));
        const isCovered = id => [...covered].some(c => id === c || (c.endsWith('_') && id.startsWith(c)));
        // les autres sources enregistrées qui se disent « pas installées »
        const seen = new Set();
        results.filter(r => r?.state === 'missing' && !isCovered(r.task.d.id)).forEach(r => { const d = r.task.d; if (seen.has(d.id)) return; seen.add(d.id);
            out.push({key: 'ds_' + d.id, icon: d.icon || '📦', label: T(d.label), why: life ? T('pourrait dire quelque chose sur {p}', {p: life.first}) : '', size: 0, install: d.install ? () => d.install() : null}); });
        const order = cat.map(p => p.key);
        return out.sort((a, b) => (order.indexOf(a.key) + 1 || 99) - (order.indexOf(b.key) + 1 || 99));
    }
    async function installAll(items, btn) {
        const list = items.filter(x => x.install && !x.off); if (!list.length) return;
        if (btn) btn.disabled = true;
        for (const [i, x] of list.entries()) { if (btn) btn.textContent = T('⤓ {n}/{t} : {l}…', {n: String(i + 1), t: String(list.length), l: x.label}); try { await x.install(); } catch (e) { toast(e.message, 'error'); } }
        Object.keys(st).forEach(k => delete st[k]); forget();
        if (btn) { btn.disabled = false; btn.textContent = T('✓ Lancé'); }
        toast(T('⤓ Installation lancée : suis-la dans Réglages → Données.'));
    }
    const missingLine = (items, {compact = false} = {}) => {
        if (!items.length || kiosk()) return '';
        const total = items.reduce((s, x) => s + (x.size || 0), 0);
        if (compact) return `<p class="ts-missing-line">⤓ ${esc(T(items.length === 1 ? '1 donnée pourrait en dire plus' : '{n} données pourraient en dire plus', {n: String(items.length)}))} : <button type="button" class="link-button" data-ts-missing>${esc(T('voir et installer'))}</button></p>`;
        return `<section class="ts-group ts-missing" data-ts-missing-box><h3>⤓ ${esc(T('Pas encore installé'))} <small class="muted">(${items.length})</small></h3>
            <ul class="ts-miss-list">${items.map((x, i) => `<li><span class="ts-ico" aria-hidden="true">${esc(x.icon)}</span><div><b>${esc(x.label)}</b>${x.size ? ` <small class="muted">${esc(fmtSize(x.size))}</small>` : ''}${x.why ? `<br><small>${esc(x.why)}</small>` : ''}</div>
                ${x.off ? `<span class="ts-off">${UI().badge ? UI().badge(T('éteint'), 'grey') : esc(T('éteint'))}</span><button type="button" class="button small secondary" data-ts-install="${i}">${esc(T('Allumer…'))}</button>` : x.install ? `<button type="button" class="button small" data-ts-install="${i}">⤓ ${esc(T('Installer'))}</button>` : ''}</li>`).join('')}</ul>
            ${items.filter(x => x.install && !x.off).length > 1 ? `<p><button type="button" class="button small" data-ts-install-all>⤓ ${esc(total ? T('Tout installer ({s})', {s: fmtSize(total)}) : T('Tout installer'))}</button></p>` : ''}</section>`;
    };
    function bindMissing(box, items) {
        box.querySelectorAll('[data-ts-install]').forEach(b => b.addEventListener('click', async () => { const x = items[Number(b.dataset.tsInstall)]; if (!x?.install) return; b.disabled = true; try { await x.install(); } catch (e) { toast(e.message, 'error'); } Object.keys(st).forEach(k => delete st[k]); b.disabled = false; }));
        box.querySelector('[data-ts-install-all]')?.addEventListener('click', e => installAll(items, e.currentTarget));
    }

    /* ═════════════ ✓ Garder, ＋ Ajouter aussi à…, ✗ Pas utile ═════════════ */
    const today = () => new Date().toLocaleDateString('fr-FR');
    const firstYear = (sug, life) => { const ys = (String(sug.text || sug.summary).match(/(^|[^\d])(1[0-9]{3}|20[0-2]\d)(?!\d)/g) || []).map(x => Number(x.replace(/\D/g, ''))); return ys.find(y => !life?.by || (y >= life.by && y <= life.end)) || Number(sug.task.ctx.year) || 0; };
    const evenType = () => (A().state?.bootstrap?.eventTypes || []).find(t => t.gedcom_tag === 'EVEN') || (A().state?.bootstrap?.eventTypes || []).find(t => /^(fait|autre|événement)/i.test(t.label || ''));
    function noteBody(sug) {
        const src = sug.src || {};
        return [sug.summary, sug.text && sug.text !== sug.summary ? `\n${sug.text}` : '', `\n\n${T('Source :')} ${src.label || T(sug.task.d.label)}${src.url ? ` — ${src.url}` : ''} (${T('consulté le {d}', {d: today()})})`,
            `\n${T('Trouvé par « 🔎 Ce qui le concerne » : {l}', {l: T(sug.task.d.label)})}`].join('');
    }
    /** garde une suggestion pour plusieurs cibles : [{type:'person', id}|{type:'timeline', id}|{type:'investigation', id}] ; mode 'note'|'source'|'event' → {undo} */
    async function keep(sug, targets, mode = 'note', life = null) {
        const made = [], src = sug.src || {}, label = T(sug.task.d.label), title = T('Contexte : {l}', {l: label});
        const webSource = (pid, extra = {}) => (src.url ? post('add_web_source', {person_id: pid, title: `${src.label || hostOf(src.url)} — ${label}`, url: src.url, accessed_at: today(), source_type: 'internet', note: T('contexte'), text: sug.summary, ...extra}).then(r => made.push(['delete_source', Number(r?.id)])) : Promise.resolve());
        let fails = 0;
        for (const t of targets) {
            try {
                if (t.type === 'person') {
                    if (mode === 'source') { if (src.url) await webSource(t.id); else { const r = await post('add_note', {person_id: t.id, title, body: noteBody(sug)}); made.push(['delete_note', Number(r?.id)]); } }
                    else if (mode === 'event') await keepEvent(t.id);
                    else { const r = await post('add_note', {person_id: t.id, title, body: noteBody(sug)}); made.push(['delete_note', Number(r?.id)]); await webSource(t.id); }
                } else if (t.type === 'timeline') await keepEvent(t.id);
                else if (t.type === 'investigation') { const r = await post('add_investigation_item', {investigation_id: t.id, kind: src.url ? 'link' : 'note', title: sug.summary.slice(0, 200), url: src.url || '', notes: noteBody(sug), status: 'to_explore'}); const id = Number(r?.id || r?.item?.id); if (id) made.push(['delete_investigation_item', id]); }
            } catch (e) { fails++; if (fails === 1) toast(e.message, 'error'); }
        }
        async function keepEvent(pid) {
            const ty = evenType(); if (!ty) throw new Error(T('Pas de sorte d’événement « Fait » dans la base.'));
            const y = firstYear(sug, life), pl = sug.task.ctx.place;
            const r = await post('add_event', {person_id: pid, event_type_id: ty.id, date_text: y ? String(y) : '', title: `${title} — ${sug.summary.slice(0, 120)}`, description: noteBody(sug), place_id: pl?.id || ''});
            const eid = Number(r?.id); made.push(['delete_event', eid]);
            if (src.url && eid) await webSource(pid, {entity_type: 'event', event_id: eid});
        }
        const undo = async () => { for (const [a, id] of made.slice().reverse()) { if (!id) continue; try { await post(a, {id}); } catch (_) {} } };
        return {made, undo, fails};
    }
    const relYear = (p, k) => Number(p?.[`${k}_year`]) || yearOf(p?.[`${k}_date`]) || 0;
    const aliveAt = (p, y) => { const b = relYear(p, 'birth'), d = relYear(p, 'death'); return !y || ((!b || b <= y) && (!d || d >= y)); };
    /** la fenêtre « ✓ Garder » : comment, et pour qui d'autre */
    async function openKeep(sug, life, onDone) {
        if (RO()) return;
        const detail = await getDetail(life.pid), y = firstYear(sug, life), name = p => A().personName?.(p) || `${p.first_name || ''} ${p.last_name || ''}`.trim();
        const rel = [];
        const addRel = (arr, role, pre) => (arr || []).forEach(p => { if (!p?.id || Number(p.id) === life.pid || rel.some(r => r.id === Number(p.id))) return; rel.push({id: Number(p.id), name: name(p), role, checked: pre(p)}); });
        addRel(detail?.partners, T('conjoint'), p => aliveAt(p, y));
        addRel(detail?.children, T('enfant'), p => aliveAt(p, y) && relYear(p, 'birth') && relYear(p, 'birth') <= (y || 9999));
        addRel(detail?.parents, T('parent'), p => !!y && aliveAt(p, y) && (!life.by || y - life.by < 18));
        addRel(detail?.siblings, T('frère ou sœur'), () => false);
        let invs = []; try { invs = ((await timeout(api('investigations', {status: 'open'}), 4000, {}))?.investigations || []).filter(i => Number(i.person_id) === life.pid); } catch (_) {}
        const ev = y && sug.task.group !== 'search';
        const d = document.createElement('dialog'); d.className = 'modal ts-keep-dialog';
        d.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">✓ ${esc(T('GARDER'))}</span><h2>${esc(sug.summary)}</h2></div><button type="button" class="modal-close" data-ts-x aria-label="${esc(T('Fermer'))}">×</button></div>
            <div class="modal-body"><p class="muted">${esc(sug.src?.label || '')}${sug.src?.url ? ` · <a href="${esc(sug.src.url)}" target="_blank" rel="noopener noreferrer">↗ ${esc(T('source'))}</a>` : ''}</p>
            <fieldset class="ts-keep-how"><legend>${esc(T('Sur la fiche de {p}, en…', {p: life.first}))}</legend>
                <label><input type="radio" name="ts_mode" value="note" checked> ${esc(T('📝 une note avec sa source'))}</label>
                <label><input type="radio" name="ts_mode" value="source"> ${esc(T('📚 une source seulement'))}</label>
                ${ev ? `<label><input type="radio" name="ts_mode" value="event"> ${esc(T('🗓 un événement « contexte » en {y}', {y: String(y)}))}</label>` : ''}</fieldset>
            <fieldset class="ts-keep-who"><legend>＋ ${esc(T('Ajouter aussi à…'))}</legend>
                ${rel.length ? rel.map(r => `<label><input type="checkbox" data-ts-who="${r.id}" ${r.checked ? 'checked' : ''}> ${esc(r.name)} <small class="muted">(${esc(r.role)})</small></label>`).join('') : `<p class="muted">${esc(T('Pas de proche sur sa fiche.'))}</p>`}
                ${ev ? `<label><input type="checkbox" data-ts-timeline> ${esc(T('🗓 sa chronologie (un événement « contexte »)'))}</label>` : ''}
                ${invs.map(i => `<label><input type="checkbox" data-ts-inv="${Number(i.id)}"> 🕵️ ${esc(T('l’enquête « {t} »', {t: i.title || ''}))}</label>`).join('')}
                ${y ? `<small class="muted">${esc(T('Cochés d’office : ceux qui étaient en vie en {y}.', {y: String(y)}))}</small>` : ''}</fieldset></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-ts-x>${esc(T('Annuler'))}</button><button type="submit" class="button" data-ts-ok>✓ ${esc(T('Garder'))}</button></div></form>`;
        document.body.appendChild(d);
        d.querySelectorAll('[data-ts-x]').forEach(b => b.addEventListener('click', () => d.close()));
        d.addEventListener('close', () => d.remove());
        d.querySelector('form').addEventListener('submit', async e => {
            e.preventDefault();
            const mode = d.querySelector('[name=ts_mode]:checked')?.value || 'note';
            const targets = [{type: 'person', id: life.pid}, ...[...d.querySelectorAll('[data-ts-who]:checked')].map(c => ({type: 'person', id: Number(c.dataset.tsWho)})),
                ...(d.querySelector('[data-ts-timeline]:checked') && mode !== 'event' ? [{type: 'timeline', id: life.pid}] : []), ...[...d.querySelectorAll('[data-ts-inv]:checked')].map(c => ({type: 'investigation', id: Number(c.dataset.tsInv)}))];
            d.querySelector('[data-ts-ok]').disabled = true;
            const r = await keep(sug, targets, mode, life);
            d.close();
            if (!r.made.length) return;
            mark('kept', life.pid, sug.fid, {at: Date.now(), n: targets.length});
            detailCache.delete(life.pid);
            const n = targets.length;
            A().undoToast?.(n > 1 ? T('✓ Gardé sur {n} fiches ou outils.', {n: String(n)}) : T('✓ Gardé sur la fiche.'), {undo: async () => { await r.undo(); mark('kept', life.pid, sug.fid, null); onDone?.(); }});
            onDone?.();
        });
        d.showModal();
    }
    function nope(sug, life, onDone) {
        mark('nope', life.pid, sug.fid, Date.now()); onDone?.();
        A().undoToast?.(T('✗ Caché : « {s} »', {s: sug.summary.slice(0, 60)}), {undo: () => { mark('nope', life.pid, sug.fid, null); onDone?.(); }});
    }

    /* ═════════════ une ligne de suggestion (bloc, widget) ═════════════ */
    const srcLink = s => (s?.url ? `<a class="ts-src-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.label || '')}">↗ ${esc(T('source'))}</a>` : '');
    function lineHtml(s, i, {actions = true} = {}) {
        const d = s.task.d;
        return `<li class="ts-sug${s.kept ? ' is-kept' : ''}" data-ts-i="${i}"><span class="ts-ico" aria-hidden="true">${esc(d.icon || '•')}</span><div class="ts-sug-t"><span class="ts-sum">${esc(s.summary)}</span>
            <small class="ts-meta">${esc(T(d.label))}${s.task.sub ? ` · ${esc(s.task.sub)}` : ''}${s.hints.length ? ` · <span class="ts-hint">${esc(s.hints.join(', '))}</span>` : ''}${s.sheet ? ` · <span class="ts-onsheet">${esc(T('déjà sur la fiche'))}</span>` : ''} ${srcLink(s.src)}</small></div>
            ${actions && !RO() ? (s.kept ? `<span class="ts-kept">✓ ${esc(T('gardé'))}</span>` : `<span class="ts-acts"><button type="button" class="button small secondary" data-ts-keep="${i}" title="${esc(T('Le garder sur la fiche, et l’ajouter aussi à d’autres'))}">✓ ${esc(T('Garder'))}</button><button type="button" class="icon-button small" data-ts-nope="${i}" title="${esc(T('Pas utile : ne plus le proposer'))}" aria-label="${esc(T('Pas utile'))}">✗</button></span>`) : ''}</li>`;
    }
    function bindLines(box, list, life, redraw) {
        box.querySelectorAll('[data-ts-keep]').forEach(b => b.addEventListener('click', () => openKeep(list[Number(b.dataset.tsKeep)], life, redraw)));
        box.querySelectorAll('[data-ts-nope]').forEach(b => b.addEventListener('click', () => nope(list[Number(b.dataset.tsNope)], life, redraw)));
        box.querySelectorAll('[data-ts-missing]').forEach(b => b.addEventListener('click', () => open({person: life.pid, focus: 'missing'})));
    }

    /* ═════════════ 👤 le bloc de la fiche ═════════════ */
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK[0]] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal') return '';
        const acts = `<button type="button" class="button small secondary" data-ts-open="${Number(p.id)}" title="${esc(T('Tout ce que les données de l’app disent de cette personne'))}">⤢ ${esc(T('Tout voir'))}</button>`;
        return A().card(index, fem(p.gender) ? T('🔎 Ce qui la concerne') : T(BLOCK[1]), '', `<div class="ts-block" data-ts-block="${Number(p.id)}">${UI().skeleton ? UI().skeleton(2) : ''}</div>`, 'span-12', acts);
    };
    const boot = () => {
        const B = A().defaultPersonBlocks; if (Array.isArray(B) && !B.some(b => b[0] === BLOCK[0])) { let i = B.findIndex(b => b[0] === 'world'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire'); B.splice(i < 0 ? B.length : i, 0, [...BLOCK]); }
        const L = A().defaultListTypes; if (Array.isArray(L) && !L.some(x => x[0] === TOOL)) L.push([TOOL, '90b', T('🔎 Chercher dans toutes les données')]);
        ext.lists = ext.lists || {}; ext.lists[TOOL] = token => renderTool(token);
        ext.dataToolKeys = ext.dataToolKeys || []; if (!ext.dataToolKeys.includes(TOOL)) ext.dataToolKeys.push(TOOL);
        const G = (ext.listGroupDefaults || []).find(g => g[0] === 'g_data'); if (G && Array.isArray(G[3]) && !G[3].includes(TOOL)) G[3].splice(Math.min(1, G[3].length), 0, TOOL);
        const W = A(); if (Array.isArray(W.defaultDashboardBlocks) && !W.defaultDashboardBlocks.some(x => x[0] === WIDGET)) { W.defaultDashboardBlocks.push([WIDGET, T('🔎 Ce qui le/la concerne')]); if (W.defaultDashboardBlockSpans) W.defaultDashboardBlockSpans[WIDGET] = '6'; if (W.dashboardWidgetInfo) W.dashboardWidgetInfo[WIDGET] = T('Les meilleures suggestions des données de l’app pour une personne : à garder sur sa fiche en un clic.'); }
    };
    const TOOL = 'data_tout_sur', WIDGET = 'tout_sur';

    async function fillBlock(host) {
        const pid = Number(host.dataset.tsBlock), detail = await getDetail(pid, !host.__tsFresh); host.__tsFresh = true;
        if (!detail?.person || !host.isConnected) return;
        const life = lifeOf(detail), tasks = plan({person: detail});
        const offline = tasks.filter(t => !isOnline(t.d)), online = tasks.filter(t => isOnline(t.d));
        let results = [], miss = [], onlineDone = false, onlineStarted = false, done = 0;
        const draw = () => {
            if (!host.isConnected) return;
            const sug = suggestions(results, life), shown = sug.filter(s => !s.nope && !s.kept), kept = sug.filter(s => s.kept).length;
            const top = shown.filter(s => !s.sheet).slice(0, 3), rest = shown.filter(s => !top.includes(s));
            const run = done < (onlineStarted ? tasks.length : offline.length);
            const head = shown.length ? T(shown.length === 1 ? '1 chose trouvée pour {p}' : '{n} choses trouvées pour {p}', {n: String(shown.length), p: life.first}) : run ? T('Je regarde les données de l’app…') : T('Rien de nouveau dans les données installées.');
            host.innerHTML = `<p class="ts-head">${esc(head)}${kept ? ` <small class="muted">· ${esc(T('{n} gardée(s)', {n: String(kept)}))}</small>` : ''}${run ? ` <small class="muted ts-prog">${done}/${onlineStarted ? tasks.length : offline.length}</small>` : ''}</p>
                ${top.length ? `<ul class="ts-sugs">${top.map(s => lineHtml(s, sug.indexOf(s))).join('')}</ul>` : ''}
                ${rest.length ? `<details class="ts-more"><summary>${esc(T('▸ voir les {n}', {n: String(rest.length)}))}</summary><ul class="ts-sugs">${rest.map(s => lineHtml(s, sug.indexOf(s))).join('')}</ul></details>` : ''}
                ${!onlineStarted && online.length ? `<p><button type="button" class="link-button" data-ts-online>${esc(T('▸ plus (en ligne : {n} sources)', {n: String(online.length)}))}</button></p>` : ''}
                ${missingLine(miss, {compact: true})}`;
            bindLines(host, sug, life, () => draw());
            host.querySelector('[data-ts-online]')?.addEventListener('click', () => goOnline());
            heroBadge(pid, top.length + rest.filter(s => !s.sheet).length);
        };
        const goOnline = async () => { if (onlineStarted) return; onlineStarted = true; draw(); const r = await runAll(online, (x, n) => { done = offline.length + n; results = [...results.filter(y => y.task.key !== x.task.key), x]; draw(); }); onlineDone = !!r; draw(); };
        draw();
        results = await runAll(offline, (x, n) => { done = n; results = [...results, x]; draw(); });
        missing(life, results).then(m => { miss = m; draw(); }).catch(() => {});
        draw();
        setTimeout(() => { if (host.isConnected) goOnline(); }, ONLINE_DELAY);
        void onlineDone;
    }
    function heroBadge(pid, n) {
        const b = document.querySelector(`#workspace [data-ts-hero="${pid}"]`); if (!b) return;
        b.querySelector('.ts-hero-n')?.remove();
        if (n > 0) b.insertAdjacentHTML('beforeend', `<span class="ts-hero-n">${n}</span>`);
        b.title = n > 0 ? T('🔎 {n} suggestions : tout ce qui le concerne', {n: String(n)}) : T('🔎 Tout ce qui le concerne');
    }
    (ext.afterPerson = ext.afterPerson || []).push(detail => {
        const p = detail?.person; if (p?.id) detailCache.set(Number(p.id), Promise.resolve(detail));
        document.querySelectorAll('#workspace [data-ts-block]').forEach(h => { h.__tsFresh = true; fillBlock(h).catch(e => console.error(e)); });
        if (!p?.id || p.kind === 'animal') return;
        const row = document.querySelector('#workspace .person-hero-actions'); if (!row || row.querySelector('[data-ts-hero]')) return;
        row.insertAdjacentHTML('afterbegin', `<button type="button" class="icon-action ts-hero" data-ts-hero="${Number(p.id)}" data-ts-open="${Number(p.id)}" title="${esc(T('🔎 Tout ce qui le concerne'))}" aria-label="${esc(T('Tout ce qui le concerne'))}">🔎</button>`);
    });
    ext.personMoreItems = ext.personMoreItems || [];
    ext.personMoreItems.push(detail => { const p = detail?.person; return p?.id && p.kind !== 'animal' ? {icon: '🔎', label: T('Tout ce qui le concerne'), run: () => open({person: Number(p.id)})} : null; });

    /* ═════════════ ⤢ le rapport complet ═════════════ */
    function cardHtml(r, i, life) {
        const d = r.task.d, s = r.src || sourceOf(r);
        return `<article class="ts-res${r.nope ? ' is-nope' : ''}" data-ts-res="${i}"><header><h4><span aria-hidden="true">${esc(d.icon || '•')}</span> ${esc(T(d.label))}${r.task.sub ? ` <small class="muted">· ${esc(r.task.sub)}</small>` : ''}</h4>
            ${r.hints?.length ? `<small class="ts-hint">${esc(r.hints.join(', '))}</small>` : ''}${r.sheet ? `<small class="ts-onsheet">${esc(T('déjà sur la fiche'))}</small>` : ''}
            ${life && !RO() ? (r.kept ? `<span class="ts-kept">✓ ${esc(T('gardé'))}</span>` : `<span class="ts-acts"><button type="button" class="button small secondary" data-ts-keep="${i}">✓ ${esc(T('Garder'))}</button><button type="button" class="icon-button small" data-ts-nope="${i}" aria-label="${esc(T('Pas utile'))}" title="${esc(T('Pas utile'))}">✗</button></span>`) : ''}</header>
            <div class="ts-res-body" data-ts-body="${i}"></div>
            <p class="ts-src">${esc(T('Source :'))} ${esc(s.label || T(d.label))} ${srcLink(s)}</p></article>`;
    }
    function hiddenBlocks(pid) {
        try { const h = A().personBlockSettings?.(pid)?.hidden || [], labels = Object.fromEntries((A().defaultPersonBlocks || []).map(b => b)); return h.filter(k => k !== BLOCK[0] && labels[k] && ext.personBlocks?.[k]).map(k => [k, labels[k]]); } catch (_) { return []; }
    }
    function showBlock(pid, key, redraw) {
        const s = A().personBlockSettings?.(pid); if (!s) return; const before = JSON.parse(JSON.stringify(s));
        s.hidden = s.hidden.filter(k => k !== key); A().savePersonBlockSettings?.(s, pid);
        A().undoToast?.(T('👁 Remis sur sa fiche.'), {undo: () => { A().savePersonBlockSettings?.(before, pid); redraw?.(); }}); redraw?.();
    }
    /** subject = {person?: id, place?: lieu, year?: n, only?: [ids]} ; host : l'endroit du rapport ; o.focus = 'missing' */
    async function renderReport(host, subject, o = {}) {
        const detail = subject.person ? await getDetail(subject.person) : null;
        if (subject.person && !detail?.person) { host.innerHTML = A().empty ? A().empty(T('Personne introuvable.')) : ''; return; }
        const life = detail ? lifeOf(detail) : null;
        const tasks = plan({person: detail, place: subject.place || null, year: subject.year || null, only: subject.only});
        const title = life ? (life.female ? T('Tout ce qui concerne {n}', {n: life.name}) : T('Tout ce qui concerne {n}', {n: life.name})) : subject.place && subject.year ? T('{p} en {y}', {p: subject.place.name, y: String(subject.year)}) : subject.place ? T('Tout ce qui concerne {p}', {p: subject.place.name}) : T('Cette année-là : {y}', {y: String(subject.year)});
        host.innerHTML = `<div class="ts-report" data-ts-report><div class="ts-top"><p class="ts-count" data-ts-count>${esc(T('{n} données à regarder…', {n: String(tasks.length)}))}</p><div class="ts-prog-bar"><i data-ts-bar style="width:0"></i></div>
            <div class="ts-tools"><button type="button" class="button small secondary" data-ts-rerun>↻ ${esc(T('Relancer'))}</button><button type="button" class="button small secondary" data-ts-print>🖨 ${esc(T('Imprimer'))}</button>
            ${ext.sendTo ? `<button type="button" class="button small secondary" data-ts-send>📤 ${esc(T('Envoyer vers…'))}</button>` : ''}${life && !RO() ? `<button type="button" class="button small secondary" data-ts-note>＋ ${esc(T('Ajouter comme note'))}</button>` : ''}</div></div>
            ${GROUPS.map(([g, ic, lab]) => `<section class="ts-group" data-ts-group="${g}" hidden><h3>${ic} ${esc(T(g === 'places' && !life ? 'Le lieu' : g === 'era' && !life ? 'L’époque' : lab))}</h3><div class="ts-cards"></div></section>`).join('')}
            <div data-ts-hidden></div><div data-ts-miss></div></div>`;
        host.dataset.tsTitle = title;
        let results = [], found = 0;
        const paint = () => {
            const sug = suggestions(results, life), list = sug.filter(s => !s.nope);
            GROUPS.forEach(([g]) => { const sec = host.querySelector(`[data-ts-group="${g}"]`), mine = list.filter(s => s.task.group === g); sec.hidden = !mine.length;
                const box = sec.querySelector('.ts-cards'); box.innerHTML = mine.map(s => cardHtml(s, sug.indexOf(s), life)).join('');
                mine.forEach(s => { const b = box.querySelector(`[data-ts-body="${sug.indexOf(s)}"]`); if (!b) return; if (!s.host.isConnected || s.host.parentElement === parking) b.appendChild(s.host); else b.appendChild(s.host.cloneNode(true)); }); });
            if (life) bindLines(host.querySelector('[data-ts-report]'), sug, life, paint);
            host.__ts = {sug: list, life, title};
        };
        const counter = (n) => { const c = host.querySelector('[data-ts-count]'); if (c) c.textContent = n < tasks.length ? T('{d}/{n} données regardées…', {d: String(n), n: String(tasks.length)}) : T('{n} données regardées, {f} ont trouvé quelque chose', {n: String(tasks.length), f: String(found)}); const bar = host.querySelector('[data-ts-bar]'); if (bar) bar.style.width = `${tasks.length ? Math.round(n / tasks.length * 100) : 100}%`; };
        counter(0);
        const go = async force => {
            results = []; found = 0; counter(0); paint();
            await runAll(tasks, (r, n) => { results.push(r); if (r.state === 'found') found++; counter(n); paint(); }, {force});
            counter(tasks.length); host.querySelector('.ts-prog-bar')?.classList.add('is-done');
            if (!tasks.length) host.querySelector('[data-ts-count]').textContent = T('Aucune donnée ne sait parler de ça pour l’instant.');
            if (life) { const hb = hiddenBlocks(life.pid), box = host.querySelector('[data-ts-hidden]');
                box.innerHTML = hb.length && !RO() ? `<section class="ts-group ts-hidden-blocks"><h3>🙈 ${esc(T('Sur sa fiche, caché'))}</h3><ul class="ts-miss-list">${hb.map(([k, l]) => `<li><span>${esc(l)}</span><button type="button" class="button small secondary" data-ts-show="${esc(k)}">👁 ${esc(T('Remontrer sur sa fiche'))}</button></li>`).join('')}</ul></section>` : '';
                box.querySelectorAll('[data-ts-show]').forEach(b => b.addEventListener('click', () => showBlock(life.pid, b.dataset.tsShow, () => b.closest('li')?.remove()))); }
            const m = !life && !subject.place ? [] : await missing(life || (subject.place ? {countries: [countryOf(subject.place) || 'fr'], places: [subject.place], by: Number(subject.year) || 0, end: Number(subject.year) || 0, first: subject.place.name} : null), results);
            const mb = host.querySelector('[data-ts-miss]'); if (mb) { mb.innerHTML = missingLine(m); bindMissing(mb, m); if (o.focus === 'missing') mb.scrollIntoView({block: 'start'}); }
        };
        host.querySelector('[data-ts-rerun]').addEventListener('click', () => { tasks.forEach(t => CACHE.delete(t.key)); if (life) detailCache.delete(life.pid); go(true); });
        host.querySelector('[data-ts-print]').addEventListener('click', () => printReport(host));
        host.querySelector('[data-ts-send]')?.addEventListener('click', e => ext.sendTo('text', {html: reportHtml(host), name: title}, {anchor: e.currentTarget, title}));
        host.querySelector('[data-ts-note]')?.addEventListener('click', () => addNote(host));
        await go(false);
    }
    function reportHtml(host) {
        const S = host.__ts; if (!S) return '';
        return `<h1>${esc(S.title)}</h1>${GROUPS.map(([g, ic, lab]) => { const mine = S.sug.filter(s => s.task.group === g); return mine.length ? `<h2>${ic} ${esc(T(lab))}</h2><ul>${mine.map(s => `<li><b>${esc(T(s.task.d.label))}</b>${s.task.sub ? ` (${esc(s.task.sub)})` : ''} : ${esc(s.summary)}<br><small>${esc(T('Source :'))} ${esc(s.src.label || '')}${s.src.url ? ` — <a href="${esc(s.src.url)}">${esc(s.src.url)}</a>` : ''}</small></li>`).join('')}</ul>` : ''; }).join('')}<p><small>${esc(T('Fait le {d} avec LCNDA, « 🔎 Ce qui le concerne ».', {d: today()}))}</small></p>`;
    }
    const reportText = host => { const S = host.__ts; if (!S) return ''; return S.sug.map(s => `• ${T(s.task.d.label)}${s.task.sub ? ` (${s.task.sub})` : ''} : ${s.summary}\n  ${T('Source :')} ${s.src.label || ''}${s.src.url ? ` — ${s.src.url}` : ''}`).join('\n') + `\n\n${T('Consulté le {d}.', {d: today()})}`; };
    function printReport(host) {
        const html = reportHtml(host); if (!html) return;
        if (UI().openPrintDialog) UI().openPrintDialog({title: host.__ts.title, icon: '🔎', key: 'tout-sur', html: `<div class="ts-print">${html}</div>`, photos: false});
        else { const w = window.open('', '_blank'); if (w) { w.document.write(html); w.print(); } }
    }
    async function addNote(host) {
        const S = host.__ts; if (!S?.life || !S.sug.length) return toast(T('Rien à mettre dans la note.'));
        try { const r = await post('add_note', {person_id: S.life.pid, title: S.title, body: reportText(host)}); const id = Number(r?.id); detailCache.delete(S.life.pid);
            A().undoToast?.(T('＋ Ajouté comme note sur sa fiche.'), {undo: async () => { if (id) await post('delete_note', {id}); }}); } catch (e) { toast(e.message, 'error'); }
    }
    /** la fenêtre du rapport */
    function openDialog(subject, o = {}) {
        document.querySelector('dialog.ts-dialog')?.close();
        const d = document.createElement('dialog'); d.className = 'modal ts-dialog';
        d.innerHTML = `<div class="modal-head"><div><span class="eyebrow">🔎 ${esc(T('TOUT CE QUI LE CONCERNE'))}</span><h2 data-ts-title>…</h2></div><button type="button" class="modal-close" data-ts-x aria-label="${esc(T('Fermer'))}">×</button></div><div class="modal-body" data-ts-host></div>`;
        document.body.appendChild(d); d.querySelector('[data-ts-x]').addEventListener('click', () => d.close()); d.addEventListener('close', () => d.remove()); d.showModal();
        const host = d.querySelector('[data-ts-host]');
        renderReport(host, subject, o).then(() => { d.querySelector('[data-ts-title]').textContent = host.dataset.tsTitle || ''; }).catch(e => { host.textContent = e.message; });
        setTimeout(() => { const t = d.querySelector('[data-ts-title]'); if (t && host.dataset.tsTitle) t.textContent = host.dataset.tsTitle; }, 300);
        return d;
    }
    const open = (subject, o = {}) => openDialog(typeof subject === 'object' ? subject : {person: Number(subject)}, {focus: subject?.focus, ...o});
    const openPlace = place => openDialog({place});
    const openYear = year => openDialog({year: Number(year)});
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-ts-open]'); if (b) { e.preventDefault(); open({person: Number(b.dataset.tsOpen)}); return; }
        const pl = e.target.closest?.('[data-ts-place]'); if (pl) { e.preventDefault(); try { openPlace(JSON.parse(pl.dataset.tsPlace)); } catch (_) {} return; }
        const y = e.target.closest?.('[data-ts-year]'); if (y) { e.preventDefault(); openYear(Number(y.dataset.tsYear)); }
    });

    /* ═════════════ 📍 la fiche d'un village et la monographie : un bouton ═════════════ */
    function placeButtons() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const v = ws.querySelector('.h-village:not([data-ts])');
        const mono = !v && ws.querySelector('.place-monograph-sections:not([data-ts])');
        const root = v || mono; if (!root) return;
        root.dataset.ts = '1';
        const pli = (v || ws).querySelector('[data-pli-host]'), cpo = ws.querySelector('[data-cpo-place]'), head = (v || ws).querySelector('.page-header p, header p')?.textContent || '';
        const name = pli?.dataset.pliName || ((v || ws).querySelector('.page-header h1, .page-header h2, h2')?.textContent || '').replace(/^[^\p{L}]+/u, '').trim();
        if (!name) return;
        const place = {id: Number(pli?.dataset.pliPlace || cpo?.dataset.cpoPlace) || 0, name, lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null,
            insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || '', country: ''};
        place.latitude = place.lat; place.longitude = place.lon;
        const btn = `<button type="button" class="button small secondary ts-place-btn" data-ts-place="${esc(JSON.stringify(place))}" title="${esc(T('Tout ce que les données de l’app disent de ce lieu'))}">🔎 ${esc(T('Ce qui concerne ce lieu'))}</button>`;
        const bar = (v || ws).querySelector('.page-header .page-actions, .page-header-actions, .ph-actions');
        if (bar) bar.insertAdjacentHTML('afterbegin', btn); else root.insertAdjacentHTML('afterbegin', `<p class="ts-place-bar">${btn}</p>`);
    }
    let pending = 0;
    new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; try { placeButtons(); } catch (e) { console.error(e); } }); }).observe(document.documentElement, {childList: true, subtree: true});

    /* ═════════════ 🧰 Listes → Données → « 🔎 Chercher dans toutes les données » ═════════════ */
    const TOOL_KEY = 'genealogie-tout-sur-outil';
    async function renderTool(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        let saved = {}; try { saved = JSON.parse(localStorage.getItem(TOOL_KEY) || '{}') || {}; } catch (_) {}
        const P = window.LCNDA_PICKER;
        ws.innerHTML = `<section class="page collection-page ts-tool">${UI().pageHeader ? UI().pageHeader({where: `${T('Listes')} · 🧰 ${T('Données')}`, icon: '🔎', title: T('Chercher dans toutes les données'), help: esc(T('Choisis une personne, un lieu ou une année (ou plusieurs) : chaque donnée de l’app qui peut en parler est listée ; lance-en une ou toutes.'))}) : ''}
            <section class="card ts-pick"><div class="ts-pick-row">
                <div class="ts-pick-f" data-ts-pick-person><span class="pk-lab">👤 ${esc(T('Une personne'))}</span>${P?.pickerField?.({name: 'ts_person', hiddenName: false, kind: 'person', animals: false, value: Number(saved.person) || null}) || ''}</div>
                <div class="ts-pick-f" data-ts-pick-place><span class="pk-lab">📍 ${esc(T('Un lieu'))}</span>${P?.pickerField?.({name: 'ts_place', hiddenName: false, kind: 'place', value: Number(saved.place?.id) || null}) || ''}</div>
                <label class="ts-pick-f"><span class="pk-lab">📅 ${esc(T('Une année'))}</span><input type="number" min="1000" max="2100" step="1" data-ts-year-in value="${esc(saved.year || '')}" placeholder="1890"></label></div>
                <p class="ts-pick-acts"><button type="button" class="button" data-ts-runall>▶ ${esc(T('Tout lancer'))}</button> <small class="muted" data-ts-n></small></p></section>
            <section class="card"><div data-ts-list></div></section><section data-ts-out></section></section>`;
        const cur = {person: Number(saved.person) || 0, place: saved.place || null, year: Number(saved.year) || 0};
        const keep = () => { try { localStorage.setItem(TOOL_KEY, JSON.stringify(cur)); } catch (_) {} };
        const draw = async () => {
            const detail = cur.person ? await getDetail(cur.person) : null;
            if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
            const tasks = plan({person: detail, place: cur.place, year: cur.year || null});
            const by = new Map(); tasks.forEach(t => { if (!by.has(t.d.id)) by.set(t.d.id, []); by.get(t.d.id).push(t); });
            const box = ws.querySelector('[data-ts-list]');
            ws.querySelector('[data-ts-n]').textContent = tasks.length ? T('{n} données utilisables', {n: String(by.size)}) : '';
            box.innerHTML = by.size ? GROUPS.map(([g, ic, lab]) => { const ids = [...by.keys()].filter(id => by.get(id)[0].group === g); return ids.length ? `<h3>${ic} ${esc(T(lab))}</h3><ul class="ts-tool-list">${ids.map(id => { const d = by.get(id)[0].d; return `<li><span class="ts-ico">${esc(d.icon || '•')}</span><span>${esc(T(d.label))}${d.source ? ` <small class="muted">${esc(d.source)}</small>` : ''}${isOnline(d) ? ` <small class="muted">· ${esc(T('en ligne'))}</small>` : ''}</span><button type="button" class="button small secondary" data-ts-one="${esc(id)}">▶ ${esc(T('Lancer'))}</button></li>`; }).join('')}</ul>` : ''; }).join('')
                : (A().empty ? A().empty(T('Choisis une personne, un lieu ou une année.'), {icon: '🔎'}) : '');
        };
        ws.querySelector('[data-ts-list]').addEventListener('click', e => { const b = e.target.closest('[data-ts-one]'); if (b) runTool([b.dataset.tsOne]); });
        const runTool = only => renderReport(ws.querySelector('[data-ts-out]'), {person: cur.person || null, place: cur.place, year: cur.year || null, only}).catch(e => toast(e.message, 'error'));
        ws.querySelector('[data-ts-runall]').addEventListener('click', () => { if (!cur.person && !cur.place && !cur.year) return toast(T('Choisis une personne, un lieu ou une année.')); runTool(null); });
        ws.querySelector('[data-ts-year-in]').addEventListener('change', e => { const y = Number(e.target.value) || 0; if (y === cur.year) return; cur.year = y; keep(); draw(); });
        ws.addEventListener('picker-change', async e => {
            const it = e.detail?.item;
            if (e.target.closest('[data-ts-pick-person]')) { cur.person = it && !it.free ? Number(it.id) || 0 : 0; }
            else if (e.target.closest('[data-ts-pick-place]')) {
                if (!it || it.free) cur.place = null;
                else { let row = null; try { row = (await api('place', {id: Number(it.id)}))?.place; } catch (_) {} const x = row || it; cur.place = {id: Number(x.id) || 0, name: x.name || x.label || '', county: x.county || '', state: x.state || '', country: x.country || '', latitude: x.latitude ?? null, longitude: x.longitude ?? null, lat: x.latitude ?? null, lon: x.longitude ?? null, insee: x.admin4_code || '', admin4_code: x.admin4_code || ''}; }
            } else return;
            keep(); draw();
        });
        draw();
    }

    /* ═════════════ 📊 le widget du tableau de bord ═════════════ */
    ext.dashboard = ext.dashboard || {}; ext.dashboardConfig = ext.dashboardConfig || {};
    let wN = 0;
    async function widgetPerson(c) {
        const startId = Number(A().state?.bootstrap?.startPersonId) || 0;
        if (c.mode === 'person' && Number(c.person)) return Number(c.person);
        if (c.mode === 'random') {
            try { const TT = ext.tresors?.T, tr = TT && await TT.tree(), st0 = TT?.start(tr), anc = st0 ? TT.ancestors(tr, st0.id, 30) : [];
                if (anc.length) { const day = Math.floor(Date.now() / 864e5); return Number(anc[day % anc.length].id); } } catch (_) {}
        }
        return startId;
    }
    ext.dashboard[WIDGET] = {load: async () => null, render: (index, widget, span) => {
        const id = `ts-w-${++wN}`, c = widget?.config || {}, n = /span-(3|4)\b|^(3|4)$/.test(String(span)) ? 3 : /span-(12|8|9)\b|^(12|8|9)$/.test(String(span)) ? 6 : 4;
        setTimeout(() => fillWidget(document.getElementById(id), c, n), 0);
        return A().card(index, String(c.title || '').trim() || T('🔎 Ce qui le/la concerne'), '', `<div class="ts-widget" id="${id}">${UI().skeleton ? UI().skeleton(2) : ''}</div>`, span);
    }};
    async function fillWidget(host, c, n) {
        if (!host) return;
        const pid = await widgetPerson(c), detail = pid ? await getDetail(pid) : null;
        if (!detail?.person) { host.innerHTML = A().empty ? A().empty(T('Choisis une personne dans les réglages du widget.'), {icon: '🔎'}) : ''; return; }
        const life = lifeOf(detail), tasks = plan({person: detail}).filter(t => !isOnline(t.d));
        let results = [], miss = [];
        const draw = () => {
            if (!host.isConnected) return;
            const sug = suggestions(results, life), shown = sug.filter(s => !s.nope && !s.kept && !s.sheet).slice(0, n);
            host.innerHTML = `<p class="ts-head"><a href="#" data-ts-goto="${pid}">${esc(life.name)}</a>${life.by ? ` <small class="muted">${life.by}${life.dy ? `–${life.dy}` : ''}</small>` : ''}</p>
                ${shown.length ? `<ul class="ts-sugs is-compact">${shown.map(s => lineHtml(s, sug.indexOf(s))).join('')}</ul>` : `<p class="muted">${esc(results.length < tasks.length ? T('Je regarde les données de l’app…') : T('Rien de nouveau dans les données installées.'))}</p>`}
                ${missingLine(miss, {compact: true})}<p class="ts-w-foot"><button type="button" class="link-button" data-ts-open="${pid}">⤢ ${esc(T('Tout voir'))}</button></p>`;
            bindLines(host, sug, life, draw);
            host.querySelector('[data-ts-goto]')?.addEventListener('click', e => { e.preventDefault(); A().openPersonById?.(pid); });
        };
        draw();
        await runAll(tasks, r => { results.push(r); draw(); });
        miss = await missing(life, results).catch(() => []); draw();
    }
    ext.dashboardConfig[WIDGET] = {
        html: w => { const c = w?.config || {}, mode = c.mode || 'start', P = window.LCNDA_PICKER;
            return `<fieldset class="ts-w-cfg"><legend>${esc(T('Ce qui le/la concerne'))}</legend>
                ${[['start', T('la personne de départ')], ['random', T('une personne au hasard parmi mes ancêtres (change chaque jour)')], ['person', T('une personne choisie :')]].map(([v, l]) => `<label><input type="radio" name="ts_w_mode" data-tsw-mode value="${v}" ${mode === v ? 'checked' : ''}> ${esc(l)}</label>`).join('')}
                <div data-tsw-person>${P?.pickerField?.({name: 'tsw_person', hiddenName: false, kind: 'person', animals: false, value: Number(c.person) || null}) || ''}<input type="hidden" data-tsw="person" value="${Number(c.person) || ''}"></div></fieldset>`; },
        read: ed => { const person = Number(ed.querySelector('[data-tsw=person]')?.value) || 0; let mode = ed.querySelector('[data-tsw-mode]:checked')?.value || 'start'; if (mode === 'person' && !person) mode = 'start'; return {mode, person}; },
    };
    document.addEventListener('picker-change', e => { const box = e.target.closest?.('[data-tsw-person]'); if (!box) return; const it = e.detail?.item; box.querySelector('[data-tsw=person]').value = it && !it.free ? Number(it.id) || '' : ''; const r = box.closest('fieldset')?.querySelector('[data-tsw-mode][value=person]'); if (r && it) r.checked = true; });

    boot(); document.addEventListener('DOMContentLoaded', boot, {once: true}); setTimeout(boot, 500);
    ext.toutSur = {open, openPlace, openYear, openTool: () => { const st0 = A().state; if (!st0) return; st0.listType = TOOL; A().setModule?.('listes'); }, run: runAll, plan, lifeOf, suggestions, missing, keep, digest, meaningful, renderReport, cache: CACHE, forget};
})();
