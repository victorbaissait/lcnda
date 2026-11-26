/**
 * LCNDA — 🏛 Archives et mémoire (lot N « téléchargements », docs/donnees-manquantes.md B-1 à B-10).
 * Rien n'est livré avec l'app : chaque pack se télécharge sur demande (Réglages → 🏛 Archives et mémoire, Réglages → 🗂 Données,
 * ou le bouton ⤓ d'une fiche), depuis la version « telech-n-donnees » du dépôt (lib/sources_n1.php, scripts/telech-n/build_archives.py,
 * .github/workflows/telech-n.yml), puis il est lu sur l'ordinateur : rien ne part sur Internet (ni nom, ni lieu).
 *   🏛 registres     registres d'état civil en ligne, commune par commune et année par année (AD 04, 22, 65 — Licence Ouverte 2.0)
 *   📚 inv-communes  inventaires des archives communales sur FranceArchives (Licence Ouverte 2.0)
 *   📚 inv-dep       inventaires des Archives départementales sur FranceArchives (Licence Ouverte 2.0)
 *   📍 lieux         la page FranceArchives de chaque commune (« Ce lieu dans les inventaires ») (Licence Ouverte 2.0)
 *   👪 autorites     familles et institutions indexées par FranceArchives ; une personne seulement si l'année de sa mort est connue (LO 2.0)
 *   🎖 mpf           morts pour la France publiés par les collectivités (Loire-Atlantique, Toulouse, Lorient, Orvault, Belfort, Clermont : LO 2.0 ; Nancy : ODbL)
 *   🗿 monuments     le lien vers la fiche MémorialGenWeb du monument de chaque commune (CC BY-SA ; aucun nom copié)
 *   🕯 plaques       plaques commémoratives 1939-1945 de Paris (Ville de Paris, ODbL)
 * En lien seulement : notaires de Paris (Minutier central) et naturalisations 1887/1890 (hackathon des Archives nationales : licence
 *   « non spécifiée ») — déjà dans « Où chercher » (so2_an_minutier, so2_an_naturalisation) ; rappelés ici dans À propos.
 * Où : fiche d'un village (« 🏛 Archives de la commune »), fiche d'une personne décédée et non confidentielle (« 🏛 Archives et mémoire
 *   de sa vie »), « Où chercher », monographie, Listes (thèmes 🔎 personnes et ⚔️ guerres), Cartes (plaques), Réglages → 🗂 Données.
 * localStorage « genealogie-lot-n » (sujets affichés). window.LCNDA_EXT.lotN = {core…, load, status, install, personInto, placeInto, openSettings}
 * Essai : tests/test-lot-n-archives.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (sans écran : aussi pour Node) ═════════════ */
    const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/gi, 'oe').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\bst\b/g, 'saint').replace(/\bste\b/g, 'sainte');
    const table = f => (f?.rows || []).map(r => (Array.isArray(r) ? Object.fromEntries((f.fields || []).map((k, i) => [k, r[i] ?? null])) : r));
    const depOf = ins => { const s = String(ins || '').toUpperCase(); return /^97/.test(s) ? s.slice(0, 3) : s.slice(0, 2); };
    const safeUrl = u => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
    const NOW = new Date().getFullYear();
    const FA = 'https://francearchives.gouv.fr';
    const faSearch = q => `${FA}/fr/search?q=${encodeURIComponent(String(q || '').trim())}`;
    const faLocation = id => (/^\d+$/.test(String(id)) ? `${FA}/fr/location/${id}` : '');
    const faAgent = id => (/^\d+$/.test(String(id)) ? `${FA}/fr/agent/${id}` : '');
    const mgwUrl = id => (/^\d+$/.test(String(id)) ? `https://www.memorialgenweb.org/memorial3/html/fr/resultcommune.php?idsource=${id}` : '');
    const mgwSearch = (name, dep) => `https://www.google.com/search?q=${encodeURIComponent(`site:memorialgenweb.org "${name}" ${dep || ''} monument aux morts`.trim())}`;
    /** le registre qu'il faut pour un événement : naissance, mariage, décès ; avant 1793 (an II), les registres paroissiaux */
    function actOf(tag, year) {
        const t = String(tag || '').toUpperCase(), y = num(year);
        const k = ['BIRT', 'CHR', 'BAPM'].includes(t) ? 'N' : t === 'MARR' ? 'M' : ['DEAT', 'BURI'].includes(t) ? 'D' : '';
        if (!k) return '';
        return y !== null && y < 1793 ? 'BMS' : k;
    }
    /** les lignes d'une commune : par code INSEE, sinon par nom dans le même département */
    function communeRows(rows, place) {
        const ins = String(place?.insee || '').toUpperCase(), dep = String(place?.dep || depOf(ins)), name = fold(place?.name || '');
        return rows.filter(r => (ins && r.insee === ins) || (!ins && name && r.dep === dep && fold(r.commune) === name));
    }
    /** l'acte de cette année est-il en ligne ? → {state: online | offline | absent | out, row} ; null si le département n'est pas dans la liste */
    function coverage(rows, deps, place, act, year) {
        const y = num(year), dep = String(place?.dep || depOf(place?.insee));
        if (!act || y === null || !dep || !(deps || []).includes(dep)) return null;
        const mine = communeRows(rows, {...place, dep});
        if (!mine.length) return {state: 'absent', row: null};
        const fits = mine.filter(r => (r.acte === act || r.acte === 'EC' || (act !== 'BMS' && r.acte === 'BMS' && y < 1793)) && y >= r.from && y <= (r.to ?? r.from));
        const best = fits.find(r => r.online === 1) || fits.find(r => r.online === 0) || fits[0];
        if (!best) return {state: 'out', row: null, near: mine.filter(r => r.acte === act || r.acte === 'EC')};
        return {state: best.online === 1 ? 'online' : best.online === 0 ? 'offline' : 'listed', row: best};
    }
    const byInsee = (rows, ins) => rows.filter(r => ins && r.insee === String(ins).toUpperCase());
    function monumentOf(rows, place) {
        const ins = String(place?.insee || '').toUpperCase(), dep = String(place?.dep || depOf(ins)), name = fold(place?.name || '');
        return rows.find(r => ins && r.insee === ins) || rows.find(r => name && r.dep === dep && fold(r.commune) === name) || null;
    }
    /** séries des Archives départementales pour un département : [{serie, n}] des plus fournies */
    function seriesOf(rows, dep) {
        const by = new Map();
        for (const r of rows) if (r.dep === dep && r.serie) by.set(r.serie, (by.get(r.serie) || 0) + 1);
        return [...by.entries()].map(([serie, n]) => ({serie, n})).sort((a, b) => b.n - a.n);
    }
    const DEATH = ['DEAT', 'BURI', 'CREM'];
    const isDead = life => num(life?.person?.death) !== null || (life?.events || []).some(e => DEATH.includes(String(e.tag || '').toUpperCase()));
    /** une vie du passé : décédée, ou née il y a plus de 110 ans */
    const past = life => isDead(life) || (num(life?.person?.birth) !== null && life.person.birth < NOW - 110);
    const firstGiven = s => fold(String(s || '').split(/[\s,]+/)[0]);
    const lastKey = s => fold(s).replace(/\b(de|du|des|le|la|d|l)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const yearOf = d => num(String(d || '').slice(0, 4));
    /** 🎖 les morts pour la France qui lui ressemblent : même nom, même premier prénom ; « probable » si la naissance (ou la mort) concorde */
    function mpfFor(rows, life) {
        const last = lastKey(life?.person?.last), first = firstGiven(life?.person?.first);
        if (!last || !first) return [];
        const b = num(life?.person?.birth), d = num(life?.person?.death);
        const bd = (life?.events || []).find(e => ['BIRT', 'CHR', 'BAPM'].includes(String(e.tag || '').toUpperCase()))?.date || '';
        return rows.filter(r => lastKey(r.nom) === last && fold(r.prenoms).split(' ').includes(first)).map(r => {
            const rb = yearOf(r.naissance), rd = yearOf(r.deces);
            const probable = (bd && /^\d{4}-\d\d-\d\d$/.test(String(r.naissance)) && String(bd).slice(0, 10) === r.naissance) || (b !== null && rb !== null && Math.abs(rb - b) <= 1) || (d !== null && rd !== null && rd === d);
            const far = (b !== null && rb !== null && Math.abs(rb - b) > 3) || (d !== null && rd !== null && Math.abs(rd - d) > 2);
            return {r, probable, far};
        }).filter(x => !x.far).sort((a, c) => Number(c.probable) - Number(a.probable));
    }
    /** 🕯 une plaque de Paris qui porte son nom (et son prénom) : seulement s'il est mort entre 1939 et 1946, ou a vécu à Paris */
    function plaquesFor(rows, life) {
        const last = fold(life?.person?.last), first = firstGiven(life?.person?.first);
        if (!last || !first || last.length < 3) return [];
        const d = num(life?.person?.death);
        const paris = (life?.events || []).some(e => /^75/.test(String(e.insee || '')) || /\bparis\b/.test(fold(e.place)));
        if (!(d !== null && d >= 1939 && d <= 1946) && !paris) return [];
        const re = new RegExp(`(^| )${first}( [a-z]+){0,2} ${last}( |$)`);
        return rows.filter(r => re.test(fold(r.texte)));
    }
    /** 👪 familles du même nom, et personnes du même nom (homonymes, l'année de mort à ± 3 ans s'il y en a une) */
    function autoritesFor(rows, life) {
        const last = lastKey(life?.person?.last); if (!last || last.length < 3) return {fam: [], pers: []};
        const first = firstGiven(life?.person?.first), d = num(life?.person?.death);
        const fam = rows.filter(r => r.t === 'f' && new RegExp(`(^| )${last}( |$)`).test(lastKey(String(r.label).replace(/\(.*$/, ''))));
        const pers = rows.filter(r => r.t === 'p' && lastKey(String(r.label).split(',')[0]) === last && (!first || firstGiven(String(r.label).split(',')[1] || '') === first))
            .map(r => ({r, probable: d !== null && num(r.mort) !== null && Math.abs(r.mort - d) <= 3})).filter(x => d === null || num(x.r.mort) === null || Math.abs(x.r.mort - d) <= 40);
        return {fam, pers};
    }
    const core = {num, fold, table, depOf, safeUrl, faSearch, faLocation, faAgent, mgwUrl, mgwSearch, actOf, communeRows, coverage, byInsee, monumentOf, seriesOf, isDead, past, mpfFor, plaquesFor, autoritesFor};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (a, q = {}) => A().api(a, q);
    const post = async (a, body = {}) => { const r = await A().api(a, {}, {method: 'POST', body}); return r && typeof r === 'object' && r.result && typeof r.result === 'object' ? r.result : r; };
    const toast = (m, k) => A().toast?.(m, k);
    const kiosk = () => !!(root.document?.body?.classList.contains('is-kiosk') || root.LCNDA_GUEST);
    const KEY = 'genealogie-lot-n';
    const TAB = ['lot_n', '25tn', '🏛 Archives et mémoire'];
    const BLOCK = 'lot_n';
    /* les sujets (une case chacun dans ⚙️ Personnaliser) */
    const PARTS = [
        ['registres', '🏛 Registres en ligne, commune par commune', 'Les Archives départementales qui publient la liste de leurs registres : on sait si l’acte de telle année est vraiment en ligne.'],
        ['inventaires', '📚 Inventaires des archives', 'Ce que la mairie et les Archives départementales ont gardé (FranceArchives).'],
        ['lieux', '📍 Ce lieu dans les inventaires', 'La page FranceArchives de la commune : tout ce que les archives ont indexé sous son nom.'],
        ['autorites', '👪 Familles et institutions', 'Les fonds de famille, seigneuries, couvents, études de notaire indexés par FranceArchives.'],
        ['mpf', '🎖 Morts pour la France des collectivités', 'Loire-Atlantique, Toulouse, Lorient, Orvault, Belfort, Clermont-Ferrand, Nancy.'],
        ['monuments', '🗿 Monument aux morts de la commune', 'Le lien vers la fiche MémorialGenWeb du monument, avec ses noms.'],
        ['plaques', '🕯 Plaques 1939-1945 de Paris', 'Les résistants, déportés et fusillés honorés à l’adresse où ils vivaient ou sont tombés.']];
    /* les packs : clé → [icône, nom, sujet, ce qu'il contient, taille approchée] */
    const PACKS = {
        registres: ['🏛', 'Registres en ligne (AD 04, 22, 65)', 'registres', 'État civil et registres paroissiaux mis en ligne, commune par commune', 0.3e6],
        'inv-communes': ['📚', 'Inventaires des archives communales', 'inventaires', '≈ 4 000 inventaires (FranceArchives)', 0.6e6],
        'inv-dep': ['📚', 'Inventaires des Archives départementales', 'inventaires', '≈ 56 000 inventaires (FranceArchives)', 6e6],
        lieux: ['📍', 'Lieux indexés par FranceArchives', 'lieux', 'La page de chaque commune sur FranceArchives', 0.8e6],
        autorites: ['👪', 'Familles et institutions (FranceArchives)', 'autorites', 'Fonds de famille, seigneuries, couvents, notaires', 4e6],
        mpf: ['🎖', 'Morts pour la France des collectivités', 'mpf', '≈ 45 000 soldats (département, villes)', 2e6],
        monuments: ['🗿', 'Monuments aux morts (MémorialGenWeb)', 'monuments', 'Le lien vers le monument de chaque commune', 0.5e6],
        plaques: ['🕯', 'Plaques 1939-1945 de Paris', 'plaques', 'Les plaques commémoratives de Paris', 0.2e6]};
    const settings = () => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...Object.fromEntries(PARTS.map(p => [p[0], true])), ...s}; };
    const on = k => settings()[k] !== false;
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const nf = n => Number(n || 0).toLocaleString(root.LCNDA_I18N?.lang && root.LCNDA_I18N.lang !== 'fr' ? root.LCNDA_I18N.lang : 'fr-FR');
    const fmtSize = b => { b = Number(b) || 0; return b >= 1e6 ? `${(Math.round(b / 1e5) / 10).toLocaleString('fr-FR')} ${T('Mo')}` : `${Math.max(1, Math.round(b / 1e3))} ${T('Ko')}`; };
    const link = (url, label) => { const u = safeUrl(url); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label); };
    const srcLink = url => { const u = safeUrl(url); return u ? `<a class="tn-src-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(T('Ouvrir la source (internet)'))}">${esc(T('↗ source'))}</a>` : ''; };
    const row = (icon, html, src, extra = '') => `<div class="hist-row tn-row"><span class="hist-i" aria-hidden="true">${icon}</span><div class="hist-t"><p>${html}</p>${extra}${src ? `<small class="hist-src">${esc(T('Source :'))} ${src}</small>` : ''}</div></div>`;
    const more = (html, n) => (html ? `<details class="tn-more"><summary>${esc(T('▸ plus'))}${n ? ` <small class="muted">(${nf(n)})</small>` : ''}</summary>${html}</details>` : '');
    const hyp = t => `<small class="muted hist-hyp">${esc(t)}</small>`;
    const ACT = {N: 'naissances', M: 'mariages', D: 'décès', BMS: 'registres paroissiaux', TD: 'tables décennales', EC: 'état civil'};
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dateTxt = d => { const m = String(d || '').match(/^(\d{4})-(\d\d)-(\d\d)/); if (!m) return String(d || '').slice(0, 4); const day = Number(m[3]); return `${day === 1 ? '1er' : day} ${T(MONTHS[Number(m[2]) - 1])} ${m[1]}`; };

    /* ─────────── l'état local et le chargement (une fois, à la demande) ─────────── */
    let statusP = null, infoP = null;
    const status = (fresh = false) => { if (fresh || !statusP) statusP = api('tn_status').catch(e => { statusP = null; throw e; }); return statusP; };
    const onlineInfo = (fresh = false) => { if (fresh || !infoP) infoP = api('tn_dl_info').catch(() => ({packs: {}, offline: true})); return infoP; };
    const installed = async k => !!(await status().catch(() => null))?.packs?.[k];
    const data = {};
    async function readGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf));
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir ces fichiers.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    /** un pack installé → {meta, rows} ; null s'il n'est pas installé */
    function load(k) {
        if (!PACKS[k]) return Promise.resolve(null);
        if (!data[k]) data[k] = installed(k).then(ok => (ok ? fetch(`api.php?action=tn_file&key=${encodeURIComponent(k)}`, {credentials: 'same-origin', headers: typeof root.LCNDA_GENEALOGY === 'string' ? {'X-Genealogy': root.LCNDA_GENEALOGY} : {}}) : null))
            .then(r => { if (!r || r.status === 404) return null; if (!r.ok) throw new Error(T('Le fichier {f} est introuvable.', {f: `tn-${k}`})); return readGz(r); })
            .then(f => (f && f.kind === `tn-${k}` ? {meta: f, rows: table(f)} : null))
            .catch(e => { delete data[k]; throw e; });
        return data[k];
    }
    const rowsOf = k => load(k).catch(() => null).then(D => D || {meta: {}, rows: [], missing: true});
    const forget = () => { for (const k of Object.keys(data)) delete data[k]; statusP = null; };
    root.addEventListener?.('lcnda:installs-changed', forget);
    const LIC = meta => (meta?.sources || []).map(s => `${link(s.url, s.label)} (${link(s.licence_url, s.licence)})`).join(' ; ');

    /* ─────────── ⤓ installer un pack (une file d'un pack à la fois ; ↶ Annuler) ─────────── */
    let running = null;
    async function install(keys, {quiet = false} = {}) {
        if (kiosk()) { toast(T('Mode consultation : rien ne se télécharge.'), 'error'); return false; }
        if (running) { toast(T('Un téléchargement est déjà en cours.')); return false; }
        const list = [].concat(keys).filter(k => PACKS[k]);
        const done = [];
        running = list;
        try {
            for (const k of list) {
                const s = await post('tn_dl_start', {key: k}); if (s?.error) throw new Error(s.error);
                for (let fails = 0; ;) {
                    try { const r = await post('tn_dl_step', {id: s.id}); fails = 0; document.querySelectorAll(`[data-tn-progress="${k}"]`).forEach(el => { el.textContent = `${Math.round(100 * r.received / Math.max(1, r.size))} %`; }); if (r.done) break; }
                    catch (e) { if (++fails >= 4) { await post('tn_dl_cancel', {id: s.id}).catch(() => {}); throw e; } await new Promise(res => setTimeout(res, 1500 * fails)); }
                }
                const f = await post('tn_dl_finish', {id: s.id}); if (f?.error) throw new Error(f.error);
                done.push(k);
            }
        } catch (e) { toast(T('L’installation n’a pas marché : {e}', {e: e?.message || String(e)}), 'error'); }
        finally { running = null; forget(); root.dispatchEvent?.(new Event('lcnda:installs-changed')); }
        if (done.length && !quiet) {
            const undo = async () => { for (const k of done.slice().reverse()) await post('tn_pack_undo', {key: k}).catch(() => {}); forget(); root.dispatchEvent?.(new Event('lcnda:installs-changed')); redraw(); };
            const msg = done.length === 1 ? T('⤓ {name} installé.', {name: T(PACKS[done[0]][1])}) : T('⤓ {n} packs installés.', {n: done.length});
            A().undoToast ? A().undoToast(msg, {undo, icon: '🏛'}) : toast(msg, 'success');
        }
        redraw();
        return done.length === list.length;
    }
    async function remove(k) {
        try { await post('tn_pack_remove', {key: k}); } catch (e) { toast(e.message, 'error'); return; }
        forget(); root.dispatchEvent?.(new Event('lcnda:installs-changed')); redraw();
        const undo = async () => { await post('tn_pack_restore', {key: k}); forget(); root.dispatchEvent?.(new Event('lcnda:installs-changed')); redraw(); };
        A().undoToast ? A().undoToast(T('🗑 {name} retiré.', {name: T(PACKS[k][1])}), {undo, redo: () => remove(k), icon: '🗑'}) : toast(T('🗑 {name} retiré.', {name: T(PACKS[k][1])}));
    }
    /** la ligne discrète « ⤓ Installer … » quand un pack manque (rien en mode consultation) */
    async function offer(keys, why) {
        if (kiosk()) return '';
        const info = await onlineInfo(); const avail = keys.filter(k => info?.packs?.[k]);
        if (!avail.length) return '';
        const size = avail.reduce((a, k) => a + (info.packs[k].size || 0), 0);
        return `<p class="muted tn-offer">${esc(why)} <button type="button" class="button small secondary" data-tn-install="${esc(avail.join(','))}">⤓ ${esc(T('Installer ({s})', {s: fmtSize(size)}))}</button> <span data-tn-progress="${esc(avail[0])}"></span></p>`;
    }
    function redraw() {
        document.querySelectorAll('[data-tn-host]').forEach(h => { const p = h.__tnPlace; if (p) placeInto(h, p); });
        document.querySelectorAll('#workspace [data-tn-person]').forEach(h => personInto(h, Number(h.dataset.tnPerson)).then(n => { const c = h.closest('section.card'); if (c) c.hidden = !n; }));
        if (document.querySelector('[data-tn-settings-page]')) drawSettings();
    }
    if (root.document) document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-tn-install]'); if (b) { e.preventDefault(); b.disabled = true; install(b.dataset.tnInstall.split(',')).finally(() => { b.disabled = false; }); return; }
        const r = e.target.closest?.('[data-tn-remove]'); if (r) { e.preventDefault(); remove(r.dataset.tnRemove); return; }
        const o = e.target.closest?.('[data-tn-open]'); if (o) { e.preventDefault(); ext.dataListsEngine?.open(o.dataset.tnOpen, o.dataset.tnQ ? {q: o.dataset.tnQ} : null); return; }
        const s = e.target.closest?.('[data-tn-settings]'); if (s) { e.preventDefault(); openSettings(); }
    });

    /* ─────────── 🏘 un lieu : fiche d'un village, monographie ─────────── */
    const placeOf = pl => { const ins = String(pl?.insee || pl?.admin4_code || '').toUpperCase(); return {id: Number(pl?.id) || 0, name: pl?.name || '', insee: /^\d[\dAB]\d{3}$/.test(ins) ? ins : '', dep: depOf(ins), lat: num(pl?.lat ?? pl?.latitude), lon: num(pl?.lon ?? pl?.longitude)}; };
    async function placeParts(place, kinds) {
        const p = placeOf(place), out = [];
        if (!p.insee && !p.name) return out;
        const S = settings();
        const want = kinds.filter(k => S[k] !== false);
        if (want.includes('lieux')) {
            const L = await rowsOf('lieux'); const l = p.insee ? byInsee(L.rows, p.insee)[0] : null;
            out.push(row('🏛', l ? `${link(faLocation(l.id), T('Ce lieu dans les inventaires de FranceArchives'))} ↗` : `${link(faSearch(p.name), T('Chercher « {n} » dans FranceArchives', {n: p.name}))} ↗`,
                l ? LIC(L.meta) : '', l ? '' : hyp(T('La page exacte de la commune vient avec le pack « Lieux indexés par FranceArchives ».'))));
        }
        if (want.includes('registres')) {
            const R = await rowsOf('registres'); const deps = R.meta.deps || [];
            if (deps.includes(p.dep)) {
                const mine = communeRows(R.rows, p);
                if (mine.length) {
                    const by = new Map(); for (const r of mine) { const k = r.acte; if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
                    const li = [...by.entries()].map(([k, rs]) => { const onl = rs.filter(r => r.online === 1), off = rs.filter(r => r.online === 0);
                        const span = x => x.map(r => (r.from === r.to ? String(r.from) : `${r.from}–${r.to}`)).join(', ');
                        return `<li><b>${esc(T(ACT[k] || k))}</b>${onl.length ? ` · 🟢 ${esc(T('en ligne : {y}', {y: span(onl)}))}` : ''}${off.length ? ` · ⏳ ${esc(T('pas en ligne : {y}', {y: span(off)}))}` : ''}${rs.some(r => r.online === null) ? ` · ${esc(span(rs.filter(r => r.online === null)))}` : ''}</li>`; });
                    out.push(row('🟢', esc(T('Registres numérisés par les Archives départementales pour {n} :', {n: p.name || mine[0].commune})), LIC({sources: [R.meta.sources?.[mine[0].src]].filter(Boolean)}), `<ul class="hist-ul tn-ul">${li.join('')}</ul>`));
                } else out.push(row('❔', esc(T('Cette commune n’est pas dans la liste des registres en ligne publiée par les Archives départementales : vérifie sur leur site.')), LIC(R.meta)));
            }
        }
        if (want.includes('inventaires')) {
            const [C, D] = await Promise.all([rowsOf('inv-communes'), rowsOf('inv-dep')]);
            const ic = p.insee ? byInsee(C.rows, p.insee) : [], id = p.insee ? byInsee(D.rows, p.insee) : [];
            const invLi = r => `<li><b>${link(faSearch(r.titre), r.titre)}</b> <small class="muted">(${esc([r.dates, r.cotes, r.theme].filter(Boolean).join(' · '))})</small></li>`;
            if (ic.length) out.push(row('📚', esc(T('{n} inventaire(s) des archives communales sur FranceArchives : ce que la mairie a gardé.', {n: String(ic.length)})), LIC(C.meta), `<ul class="hist-ul tn-ul">${ic.slice(0, 5).map(invLi).join('')}</ul>${more(ic.length > 5 ? `<ul class="hist-ul tn-ul">${ic.slice(5, 60).map(invLi).join('')}</ul>` : '', ic.length - 5)}`));
            if (id.length) out.push(row('📚', esc(T('{n} inventaire(s) des Archives départementales parlent de cette commune.', {n: String(id.length)})), LIC(D.meta), `<ul class="hist-ul tn-ul">${id.slice(0, 5).map(invLi).join('')}</ul>${more(id.length > 5 ? `<ul class="hist-ul tn-ul">${id.slice(5, 60).map(invLi).join('')}</ul>` : '', id.length - 5)}`));
            if (!D.missing && p.dep) { const ser = seriesOf(D.rows, p.dep).slice(0, 8); if (ser.length) out.push(row('🗂', `${esc(T('Les séries les plus fournies aux Archives départementales ({d}) :', {d: p.dep}))} ${ser.map(s => `<b>${esc(s.serie)}</b> <small class="muted">(${nf(s.n)})</small>`).join(' · ')}`, LIC(D.meta), ext.dataListsEngine ? `<p class="tn-links"><button type="button" class="btn-link" data-tn-open="tn_inv_dep" data-tn-q="${esc(p.dep)}">${esc(T('📚 Tous les inventaires du département dans Listes'))}</button></p>` : '')); }
        }
        if (want.includes('monuments')) {
            const M = await rowsOf('monuments'); const m = monumentOf(M.rows, p);
            out.push(row('🗿', m ? `${link(mgwUrl(m.id), T('Le monument aux morts de {n} sur MémorialGenWeb, avec ses noms', {n: m.commune || p.name}))} ↗` : `${link(mgwSearch(p.name, p.dep), T('Chercher le monument aux morts de {n} sur MémorialGenWeb', {n: p.name}))} ↗`, m ? LIC(M.meta) : ''));
        }
        return out;
    }
    const PLACE_KINDS = ['lieux', 'registres', 'inventaires', 'monuments'];
    async function placeInto(host, place, opts = {}) {
        host.__tnPlace = place;
        const S = settings(), kinds = (opts.parts || PLACE_KINDS).filter(k => opts.force || S[k] !== false);
        if (!kinds.length) { host.innerHTML = ''; return 0; }
        const parts = await placeParts(place, kinds).catch(e => { console.error(e); return []; });
        if (!host.isConnected && !opts.detached) return 0;
        const st = await status().catch(() => null);
        const missing = Object.keys(PACKS).filter(k => ['lieux', 'registres', 'inv-communes', 'inv-dep', 'monuments'].includes(k) && kinds.includes(PACKS[k][2]) && !st?.packs?.[k]);
        const off = missing.length ? await offer(missing, T('Les inventaires, les registres en ligne et le monument de la commune : à télécharger une fois, puis lus sans Internet.')) : '';
        host.innerHTML = parts.length ? `<section class="maintenance-panel cplus-panel tn-panel"><h3>${esc(T('🏛 Archives de la commune'))}</h3><div class="hist-life tn-life">${parts.join('')}</div>${off}</section>` : '';
        return parts.length;
    }
    function villagePlace(village) {
        const pli = village.querySelector('[data-pli-host]'), head = village.querySelector('.page-header p, header p')?.textContent || '';
        return {id: Number(pli?.dataset.pliPlace) || 0, name: pli?.dataset.pliName || (village.querySelector('.page-header h2, h2')?.textContent || '').trim(),
            lat: pli?.dataset.pliLat ? Number(pli.dataset.pliLat) : null, lon: pli?.dataset.pliLon ? Number(pli.dataset.pliLon) : null, insee: (head.match(/INSEE\s+(\d[\dAB]\d{3})/) || [])[1] || ''};
    }
    (ext.villageSectionDefs = ext.villageSectionDefs || []).push({id: 'tn_place', host: '[data-tn-host]', icon: '🏛', label: 'Archives de la commune', group: 'Données téléchargées', enabled: () => PLACE_KINDS.some(k => on(k))});
    async function decorate() {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const village = ws.querySelector('.h-village:not([data-tn])'); if (!village) return;
        village.dataset.tn = '1';
        if (!PLACE_KINDS.some(k => on(k))) return;
        const anchor = village.querySelector('[data-tsx-host]') || village.querySelector('[data-ti-host]') || village.querySelector('.cplus-place') || village.querySelector('.h-village-grid');
        const box = '<div class="tn-place" data-tn-host></div>';
        if (anchor) anchor.insertAdjacentHTML('afterend', box); else village.insertAdjacentHTML('beforeend', box);
        placeInto(village.querySelector('[data-tn-host]'), villagePlace(village));
    }
    if (root.document) {
        let pending = 0;
        new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; decorate().catch(() => {}); }); }).observe(document.documentElement, {childList: true, subtree: true});
    }
    (ext.monographSections = ext.monographSections || []).push(...[['inventaires', 'tn_inventaires', '📚', 'Les archives de la commune (inventaires)'], ['monuments', 'tn_monument', '🗿', 'Le monument aux morts']].map(([kind, id, icon, label]) => ({
        id, icon, label, group: 'Le lieu', defaultOn: true, enabled: () => on(kind), source: kind === 'monuments' ? 'MémorialGenWeb (CC BY-SA)' : 'FranceArchives (Licence Ouverte 2.0)',
        render: async (place, host) => { const parts = await placeParts(place, kind === 'inventaires' ? ['lieux', 'inventaires'] : ['monuments']); if (!parts.length) return false; host.innerHTML = `<div class="hist-life tn-life">${parts.join('')}</div>`; return true; }})));

    /* ─────────── 👤 la fiche d'une personne (décédée, non confidentielle) ─────────── */
    const lifeMemo = new Map();
    const lifeOf = id => { const H = ext.histoireAutour; if (H?.lifeOf) return H.lifeOf(id); if (!lifeMemo.has(id)) lifeMemo.set(id, api('ha_life', {id}).catch(e => { lifeMemo.delete(id); throw e; })); return lifeMemo.get(id); };
    const EV = {BIRT: 'Naissance', CHR: 'Baptême', BAPM: 'Baptême', MARR: 'Mariage', DEAT: 'Décès', BURI: 'Sépulture'};
    const COV = {online: ['🟢', 'registre en ligne aux Archives départementales ({a}–{b})'], offline: ['⏳', 'registre numérisé mais pas encore en ligne ({a}–{b})'], listed: ['🏛', 'registre dans la liste des Archives départementales ({a}–{b})'],
        out: ['❔', 'cette année-là n’est pas dans la liste des registres en ligne'], absent: ['❔', 'commune absente de la liste des registres en ligne']};
    const JOBS = {
        registres: async life => {
            const R = await rowsOf('registres'); if (R.missing) return '';
            const deps = R.meta.deps || [], li = [];
            for (const e of life.events || []) {
                const tag = String(e.tag || '').toUpperCase(); if (!EV[tag]) continue;
                const act = actOf(tag, e.year), c = coverage(R.rows, deps, {insee: e.insee, name: e.place}, act, e.year); if (!c) continue;
                const [ic, txt] = COV[c.state];
                li.push(`<li>${ic} <b>${esc(T(EV[tag]))} ${esc(String(e.year))}</b>${e.place ? ` <small class="muted">(${esc(e.place)})</small>` : ''} : ${esc(T(txt, {a: String(c.row?.from ?? ''), b: String(c.row?.to ?? '')}))}</li>`);
            }
            if (!li.length) return '';
            return row('🏛', esc(T('Ses actes dans les registres mis en ligne par les Archives départementales :')), LIC(R.meta), `<ul class="hist-ul tn-ul">${li.join('')}</ul>`);
        },
        mpf: async life => {
            const M = await rowsOf('mpf'); if (M.missing) return '';
            const hits = mpfFor(M.rows, life); if (!hits.length) return '';
            const src = r => M.meta.sources?.[r.src] || {};
            const li = x => { const r = x.r, s = src(r);
                return `<li>🎖 <b>${esc(`${r.nom} ${r.prenoms}`)}</b>${x.probable ? ` <span class="badge green">${esc(T('même naissance'))}</span>` : ''} <small class="muted">(${esc([r.naissance ? T('né le {d}', {d: dateTxt(r.naissance)}) : '', r.lieu_naissance, r.deces ? T('mort le {d}', {d: dateTxt(r.deces)}) : '', r.lieu_deces, r.conflit, r.grade, r.unite].filter(Boolean).join(' · '))})</small> ${srcLink(r.url || s.url)} <small class="muted">${esc(s.publisher || '')}</small></li>`; };
            const lead = hits[0].probable ? T('Mort pour la France : il est dans la liste publiée par {p}.', {p: src(hits[0].r).publisher || ''}) : T('Un mort pour la France du même nom et du même prénom (à vérifier).');
            return row('🎖', esc(lead), LIC(M.meta), `<ul class="hist-ul tn-ul">${hits.slice(0, 6).map(li).join('')}</ul>${hyp(T('Comparé sur l’ordinateur (nom, prénom, dates), jamais pour une fiche vivante ou confidentielle : rien n’est envoyé.'))}`);
        },
        plaques: async life => {
            const P = await rowsOf('plaques'); if (P.missing) return '';
            const hits = plaquesFor(P.rows, life); if (!hits.length) return '';
            return row('🕯', esc(T('Une plaque à Paris porte peut-être son nom :')), LIC(P.meta), `<ul class="hist-ul tn-ul">${hits.slice(0, 4).map(r => `<li><q class="tn-quote">${esc(r.texte)}</q> <small class="muted">(${esc([r.adresse, r.arr ? T('Paris {a}ᵉ', {a: String(r.arr)}) : ''].filter(Boolean).join(' · '))})</small></li>`).join('')}</ul>`);
        },
        autorites: async life => {
            const F = await rowsOf('autorites'); if (F.missing) return '';
            const {fam, pers} = autoritesFor(F.rows, life); if (!fam.length && !pers.length) return '';
            const li = r => `<li>${r.t === 'f' ? '👪' : '👤'} ${link(faAgent(r.id), r.label)} ${r.wd ? srcLink(`https://www.wikidata.org/wiki/${r.wd}`) : ''}</li>`;
            const lead = fam.length ? T('Un fonds « {f} » est indexé par FranceArchives : papiers de famille, actes, correspondance…', {f: fam[0].label}) : T('Une personne du même nom est indexée par FranceArchives : {n}.', {n: pers[0].r.label});
            return row('👪', esc(lead), LIC(F.meta), `<ul class="hist-ul tn-ul">${[...fam.slice(0, 5), ...pers.slice(0, 5).map(x => x.r)].map(li).join('')}</ul>`);
        },
        inventaires: async life => {
            const C = await rowsOf('inv-communes'); if (C.missing) return '';
            const b = (life.events || []).find(e => ['BIRT', 'CHR', 'BAPM'].includes(String(e.tag || '').toUpperCase()) && e.insee); if (!b) return '';
            const ic = byInsee(C.rows, b.insee); if (!ic.length) return '';
            return row('📚', `${esc(T('Les archives communales de {p}, où il est né : {n} inventaire(s) sur FranceArchives.', {p: b.place || ic[0].commune, n: String(ic.length)}))} ${srcLink(faSearch(ic[0].titre))}`, LIC(C.meta));
        }};
    const PERSON_PARTS = ['registres', 'mpf', 'plaques', 'autorites', 'inventaires'];
    async function personInto(host, id, opts = {}) {
        const s = settings(), want = (opts.parts || PERSON_PARTS).filter(k => opts.force || s[k] !== false);
        if (!want.length) { host.innerHTML = ''; return 0; }
        let life; try { life = opts.life || await lifeOf(id); } catch (_) { host.innerHTML = ''; return 0; }
        if (!life?.ok || life.person?.kind === 'animal') { host.innerHTML = ''; return 0; }
        // une personne décédée (ou née il y a plus de 110 ans) et non confidentielle seulement
        if (opts.private || life.person?.living_status === 'living' || Number(life.person?.is_private) === 1 || !past(life)) { host.innerHTML = ''; return 0; }
        const html = await Promise.all(want.filter(k => JOBS[k]).map(k => Promise.resolve().then(() => JOBS[k](life)).catch(e => { console.error(e); return ''; })));
        if (!host.isConnected && !opts.detached) return 0;
        const out = html.filter(Boolean);
        host.innerHTML = out.length ? `<div class="hist-life tn-life">${out.join('')}</div>` : '';
        return out.length;
    }
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK] = (index, detail) => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !PERSON_PARTS.some(k => on(k))) return '';
        if (p.living_status === 'living' || Number(p.is_private) === 1) return '';
        return A().card(index, T('🏛 Archives et mémoire de sa vie'), '', `<div class="tn-block" data-tn-person="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        document.querySelectorAll('#workspace [data-tn-person]').forEach(async h => { const n = await personInto(h, Number(h.dataset.tnPerson)); const card = h.closest('section.card'); if (card) card.hidden = !n; });
    });

    /* ─────────── 🌍 Où chercher : ses lignes (crochet ext.ouChercher.afterRedraw) ─────────── */
    const oc = ext.ouChercher = ext.ouChercher || {};
    (oc.afterRedraw = oc.afterRedraw || []).push((view, body) => {
        const pid = Number(view?.pid) || 0; if (!pid || !body) return;
        body.querySelector('.tn-ouc')?.remove();
        const host = document.createElement('div');
        personInto(host, pid, {detached: true, parts: ['registres', 'mpf', 'inventaires']}).then(n => {
            if (!n || !body.isConnected || body.querySelector('.tn-ouc')) return;
            const html = `<section class="ouc-plan tn-ouc"><h3>🏛 ${esc(T('Archives et mémoire'))} <small class="muted">${esc(T('lu sur l’ordinateur'))}</small></h3>${host.innerHTML}</section>`;
            const at = body.querySelector('.ba-ouc') || body.querySelector('.bo-ouc') || body.querySelector('.ouc-plus') || body.querySelector('.ouc-facts');
            if (at) at.insertAdjacentHTML('afterend', html); else body.insertAdjacentHTML('afterbegin', html);
        }).catch(() => {});
    });

    /* ─────────── 📋 Listes (thèmes 🔎 personnes et ⚔️ guerres) ─────────── */
    const F = (key, label, type = 'text', x = {}) => ({key, label: T(label), type, ...x});
    const openRow = r => { const u = safeUrl(r.url); if (u) window.open(u, '_blank', 'noopener'); };
    const L = (id, pack, icon, label, theme, source, sourceUrl, kind, rowsFn, fields, x = {}) => ({id, pack: `tn-${pack}`, icon, label: T(label), theme, group: x.group || 'Le lieu', source, sourceUrl,
        enabled: () => on(kind), installed: () => installed(pack), install: () => install([pack]), load: async () => rowsFn((await rowsOf(pack))), fields, open: openRow, ...x});
    (ext.dataLists = ext.dataLists || []).push(
        L('tn_registres', 'registres', '🏛', 'Registres d’état civil en ligne, commune par commune (AD 04, 22, 65)', 'personnes', 'Archives départementales (Licence Ouverte 2.0)', 'https://www.data.gouv.fr/', 'registres',
            D => D.rows.map(r => ({dep: r.dep, commune: r.commune, insee: r.insee, acte: T(ACT[r.acte] || r.acte), from: r.from, to: r.to, online: r.online === 1 ? T('en ligne') : r.online === 0 ? T('pas en ligne') : '', note: r.note, url: D.meta.sources?.[r.src]?.url || ''})),
            [F('commune', 'Commune', 'place'), F('dep', 'Département', 'enum'), F('acte', 'Registre', 'enum'), F('from', 'De', 'year'), F('to', 'À', 'year'), F('online', 'En ligne', 'enum'), F('note', 'Cote, remarque')],
            {period: r => [r.from, r.to]}),
        L('tn_inv_communes', 'inv-communes', '📚', 'Inventaires des archives communales (FranceArchives)', 'personnes', 'FranceArchives (Licence Ouverte 2.0)', `https://www.data.gouv.fr/datasets/liste-des-inventaires-darchives-communales-sur-francearchives`, 'inventaires',
            D => D.rows.map(r => ({commune: r.commune, dep: r.dep, titre: r.titre, dates: r.dates, from: r.from, to: r.to, cotes: r.cotes, theme: r.theme, url: faSearch(r.titre)})),
            [F('commune', 'Commune', 'place'), F('dep', 'Département', 'enum'), F('titre', 'Inventaire'), F('dates', 'Dates'), F('cotes', 'Cotes'), F('theme', 'Thème', 'enum')], {period: r => [r.from, r.to ?? r.from]}),
        L('tn_inv_dep', 'inv-dep', '📚', 'Inventaires des Archives départementales (FranceArchives)', 'personnes', 'FranceArchives (Licence Ouverte 2.0)', `https://www.data.gouv.fr/datasets/liste-des-inventaires-darchives-departementales-sur-francearchives`, 'inventaires',
            D => D.rows.map(r => ({dep: r.dep, serie: r.serie, titre: r.titre, commune: r.commune, dates: r.dates, from: r.from, to: r.to, cotes: r.cotes, theme: r.theme, url: faSearch(r.titre)})),
            [F('dep', 'Département', 'enum'), F('serie', 'Série', 'enum'), F('titre', 'Inventaire'), F('commune', 'Commune', 'place'), F('dates', 'Dates'), F('cotes', 'Cotes'), F('theme', 'Thème', 'enum')], {period: r => [r.from, r.to ?? r.from]}),
        L('tn_lieux', 'lieux', '📍', 'Communes indexées par FranceArchives', 'personnes', 'FranceArchives (Licence Ouverte 2.0)', 'https://www.data.gouv.fr/datasets/portail-francearchives-les-lieux-des-archives', 'lieux',
            D => D.rows.map(r => ({commune: r.nom, insee: r.insee, dep: depOf(r.insee), lat: r.lat, lon: r.lon, url: faLocation(r.id)})),
            [F('commune', 'Commune', 'place'), F('dep', 'Département', 'enum'), F('insee', 'Code INSEE')], {geo: r => [r.lat, r.lon]}),
        L('tn_autorites', 'autorites', '👪', 'Familles et institutions indexées par FranceArchives', 'personnes', 'FranceArchives (Licence Ouverte 2.0)', 'https://www.data.gouv.fr/datasets/portail-francearchives-autorites-personnes-familles-et-institutions', 'autorites',
            D => D.rows.map(r => ({label: r.label, kind: T(r.t === 'f' ? 'Famille' : r.t === 'i' ? 'Institution' : 'Personne'), mort: r.mort, url: faAgent(r.id)})),
            [F('label', 'Nom'), F('kind', 'Sorte', 'enum'), F('mort', 'Mort', 'year')], {group: 'La personne'}),
        L('tn_mpf', 'mpf', '🎖', 'Morts pour la France publiés par les collectivités', 'guerres', 'Loire-Atlantique, Toulouse, Lorient, Orvault, Belfort, Clermont-Ferrand (Licence Ouverte 2.0) ; Nancy (ODbL)', 'https://www.data.gouv.fr/', 'mpf',
            D => D.rows.map(r => ({name: `${r.nom} ${r.prenoms}`.trim(), born: r.naissance, bplace: r.lieu_naissance, died: r.deces, dplace: r.lieu_deces, war: r.conflit, unit: [r.grade, r.unite].filter(Boolean).join(', '), who: D.meta.sources?.[r.src]?.publisher || '', url: r.url || D.meta.sources?.[r.src]?.url || '', yb: yearOf(r.naissance), yd: yearOf(r.deces)})),
            [F('name', 'Nom', 'text', {person: true}), F('born', 'Naissance', 'date'), F('bplace', 'Lieu de naissance', 'place'), F('died', 'Mort', 'date'), F('dplace', 'Lieu de mort', 'place'), F('war', 'Guerre', 'enum'), F('unit', 'Grade, unité'), F('who', 'Publié par', 'enum')],
            {group: 'La personne', period: r => [r.yd ?? r.yb, r.yd ?? r.yb], personMatch: {born: r => r.yb, died: r => r.yd, historic: true}}),
        L('tn_monuments', 'monuments', '🗿', 'Monuments aux morts de France (MémorialGenWeb)', 'guerres', 'MémorialGenWeb (CC BY-SA)', 'https://www.data.gouv.fr/datasets/liste-des-monuments-aux-morts', 'monuments',
            D => D.rows.map(r => ({commune: r.commune, dep: r.dep, url: mgwUrl(r.id)})), [F('commune', 'Commune', 'place'), F('dep', 'Département', 'enum')]),
        L('tn_plaques', 'plaques', '🕯', 'Plaques commémoratives 1939-1945 de Paris', 'guerres', 'Ville de Paris (ODbL)', 'https://www.data.gouv.fr/datasets/plaques-commemoratives-1939-1945', 'plaques',
            D => D.rows.map(r => ({texte: r.texte, adresse: r.adresse, arr: r.arr, lat: r.lat, lon: r.lon, url: ''})), [F('texte', 'Texte de la plaque'), F('adresse', 'Adresse'), F('arr', 'Arrondissement', 'number')], {geo: r => [r.lat, r.lon], open: () => {}}));

    /* ─────────── 🗺 Cartes : les plaques de Paris ─────────── */
    const inBox = (bbox, lat, lon) => !bbox || (lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3]);
    (ext.mapLayerSources = ext.mapLayerSources || []).push({id: 'tn_plaques', icon: '🕯', label: T('Plaques commémoratives 1939-1945 de Paris'), group: 'Le lieu', kind: 'points', source: 'Ville de Paris (ODbL)',
        run: async ({q, bbox, max = 3000}) => { const D = await rowsOf('plaques'); return {features: D.rows.filter(r => num(r.lat) !== null && inBox(bbox, r.lat, r.lon) && (!q || fold(r.texte).includes(fold(q)))).slice(0, max).map(r => ({type: 'pt', lat: r.lat, lon: r.lon, label: r.texte})), source: 'Ville de Paris (ODbL)'}; }});

    /* ─────────── 🗂 Réglages → Données : la famille « tn » (app-listes-maj.js) ─────────── */
    const FAMILY = {id: 'tn', icon: '🏛', theme: 'Personnes et noms', tab: 'lot_n', status: 'tn_status', info: 'tn_dl_info', pre: 'tn', finish: 'tn_dl_finish', body: k => ({key: k}),
        source: 'FranceArchives, Archives départementales, collectivités, MémorialGenWeb, Ville de Paris', licence: 'Licence Ouverte 2.0, ODbL, CC BY-SA', url: 'https://www.data.gouv.fr/',
        installed: (s, k) => !!s?.packs?.[k], built: (s, k) => s?.packs?.[k]?.built || '', size: (s, k) => s?.packs?.[k]?.size || 0, online: (i, k) => i?.packs?.[k],
        items: Object.entries(PACKS).map(([k, p]) => ({k, name: `${p[0]} ${p[1]}`, what: p[3], approx: p[4]}))};
    function addFamily() { const M = ext.listesMaj; if (!M?.families || M.families.some(f => f.id === FAMILY.id)) return !!M?.families; M.families.push(FAMILY); return true; }
    if (!addFamily() && root.document) document.addEventListener('DOMContentLoaded', () => { if (!addFamily()) setTimeout(addFamily, 500); }, {once: true});

    /* ─────────── ⚙️ Réglages → 🏛 Archives et mémoire ─────────── */
    const LINK_ONLY = [
        ['✒', 'Actes des notaires de Paris (Minutier central, XVIIᵉ – début XXᵉ s.)', 'Archives nationales, hackathon 2018 : licence « non spécifiée » sur data.gouv.fr ; la page des conditions de réutilisation des Archives nationales n’a pas pu être lue. Lien seulement, aussi dans « Où chercher ».', 'https://www.data.gouv.fr/datasets/les-donnees-du-hackathon-des-archives-nationales'],
        ['🇫🇷', 'Décrets de naturalisation de 1887 et 1890', 'Même jeu de données, même licence « non spécifiée ». Lien seulement ; la recherche des décrets (1883-1930) est dans « Où chercher ».', 'https://francearchives.gouv.fr/fr/search?q=d%C3%A9crets%20de%20naturalisation&es_publisher=34633']];
    let drawToken = 0;
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const mine = ++drawToken;
        const [st, info] = await Promise.all([status(true).catch(() => null), onlineInfo()]);
        if (mine !== drawToken || (token !== undefined && A().state && token !== A().state.workspaceToken)) return;
        const s = settings();
        const tg = ([key, label, sub]) => `<label class="checkbox-line cplus-tg" data-tn-tg="${esc(key)}"><input type="checkbox" ${s[key] !== false ? 'checked' : ''}><span><b>${esc(T(label))}</b><br><small class="muted">${esc(T(sub))}</small></span></label>`;
        const packRow = ([k, p]) => { const mineP = st?.packs?.[k], onl = info?.packs?.[k];
            const state = mineP ? `✓ ${esc(T('installé'))} · ${esc(nf(mineP.rows))} ${esc(T('lignes'))} · ${esc(mineP.built || '')}` : onl ? `<button type="button" class="button small secondary" data-tn-install="${esc(k)}">⤓ ${esc(T('Installer ({s})', {s: fmtSize(onl.size)}))}</button> <span data-tn-progress="${esc(k)}"></span>` : `<span class="muted">${esc(T(info?.offline ? 'Pas de connexion aux données en ligne.' : 'Pas encore en ligne.'))}</span>`;
            return `<tr><td>${esc(p[0])} ${esc(T(p[1]))}<br><small class="muted">${esc(T(p[3]))}</small></td><td>${state}</td><td>${esc(mineP?.licence || onl?.licence || '')}</td><td>${mineP && !kiosk() ? `<button type="button" class="btn-link" data-tn-remove="${esc(k)}" title="${esc(T('Retirer ce pack'))}">🗑</button>` : ''}</td></tr>`; };
        const missing = Object.keys(PACKS).filter(k => !st?.packs?.[k] && info?.packs?.[k]);
        const head = UI().pageHeader ? UI().pageHeader({title: T('Archives et mémoire'), icon: '🏛', where: T('Réglages · Données'), help: esc(T('Registres en ligne commune par commune, inventaires de FranceArchives, familles et institutions, morts pour la France des collectivités, monuments aux morts, plaques de Paris.'))}) : `<h2>🏛 ${esc(T('Archives et mémoire'))}</h2>`;
        ws.innerHTML = `<section class="page cplus-settings tn-settings" data-tn-settings-page>${head}
            <div class="maintenance-panel"><h3>${esc(T('Les données'))}</h3><p class="muted">${esc(T('Rien n’est livré avec l’app : chaque pack se télécharge une fois, puis il est lu sans Internet. Rien ne part sur Internet, ni nom ni lieu.'))}</p>
                ${missing.length > 1 && !kiosk() ? `<p><button type="button" class="button small" data-tn-install="${esc(missing.join(','))}">⤓ ${esc(T('Tout installer ({s})', {s: fmtSize(missing.reduce((a, k) => a + (info.packs[k].size || 0), 0))}))}</button></p>` : ''}
                <div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Pack'))}</th><th>${esc(T('État'))}</th><th>${esc(T('Licence'))}</th><th></th></tr></thead><tbody>${Object.entries(PACKS).map(packRow).join('')}</tbody></table></div></div>
            <details class="maintenance-panel tn-perso"><summary><b>⚙️ ${esc(T('Personnaliser'))}</b> <small class="muted">${esc(T('ce qui s’affiche sur les fiches'))}</small></summary>
                <p class="muted">${esc(T('Sur la fiche d’un village (« 🏛 Archives de la commune »), la fiche d’une personne décédée (« 🏛 Archives et mémoire de sa vie »), « Où chercher » et la monographie.'))}</p>${PARTS.map(tg).join('')}</details>
            <div class="maintenance-panel"><h3>${esc(T('En lien seulement (licence pas confirmée)'))}</h3><ul class="hist-ul tn-ul">${LINK_ONLY.map(x => `<li>${esc(x[0])} <b>${esc(T(x[1]))}</b> — ${esc(T(x[2]))} ${link(x[3], T('↗ ouvrir'))}</li>`).join('')}</ul>
                <p class="muted">${esc(T('Les licences ont été lues sur data.gouv.fr pour chaque jeu ; le script de fabrication s’arrête si l’une change. Antibes n’est pas repris : sa liste n’a pas de date de naissance.'))}</p></div></section>`;
    }
    if (root.document) document.addEventListener('change', e => {
        const t = e.target.closest?.('[data-tn-tg]'); if (!t || !e.target.matches('input')) return;
        const s = settings(), k = t.dataset.tnTg, was = s[k] !== false;
        s[k] = e.target.checked; saveSettings(s);
        const label = T(PARTS.find(p => p[0] === k)?.[1] || k);
        A().undoToast?.(T(e.target.checked ? '« {p} » s’affiche.' : '« {p} » est caché.', {p: label}), {undo: () => { const x = settings(); x[k] = was; saveSettings(x); drawSettings(); }, icon: '🏛'});
    });
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);
    function openSettings() { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().persistUiState?.(); A().setModule?.('maintenance'); }
    function register() {
        const app = A(), tabs = app.defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'telech_m'); if (i < 0) i = tabs.findIndex(t => t[0] === 'histoire'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B) && !B.some(b => b[0] === BLOCK)) { let i = B.findIndex(b => b[0] === 'telech_m'); if (i < 0) i = B.findIndex(b => b[0] === 'histoire_autour'); B.splice(i < 0 ? B.length : i + 1, 0, [BLOCK, '🏛 Archives et mémoire de sa vie']); }
        if (app.defaultPersonBlockSpans) app.defaultPersonBlockSpans[BLOCK] ||= '12';
        return !!tabs;
    }
    if (root.document && !register()) document.addEventListener('DOMContentLoaded', register, {once: true});

    ext.lotN = {...core, PACKS, load, status, onlineInfo, install, remove, settings, personInto, placeInto, placeParts, openSettings};
})(typeof window !== 'undefined' ? window : globalThis);
