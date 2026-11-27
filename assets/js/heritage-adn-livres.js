/* LCNDA — 🦴 Les ancêtres très anciens de ta lignée (ADN ancien) et 📚 « Ton ancêtre a peut-être écrit un livre » (BnF).
 *
 * 🦴 ADN ancien : l'index assets/data/adn-ancien.json.gz (Allen Ancient DNA Resource, Harvard Dataverse, CC0 1.0 ;
 *    fabriqué par scripts/adn-livres/build-adn-ancien.py) est lu ici, à la demande. Pour une personne qui a un test ADN
 *    avec un haplogroupe (Y ou mt), on cherche les individus anciens du même haplogroupe — le plus précis d'abord, puis la
 *    branche plus ancienne — les plus proches du plus ancien lieu connu de la lignée (père du père… / mère de la mère…).
 *    Où : la fiche (dans le bloc « 🧬 ADN »), l'onglet ADN → « 🌳 Lignées Y, mt et X ». Rien n'est envoyé ailleurs.
 * 📚 BnF : pour un ancêtre MORT et non confidentiel, les auteurs de data.bnf.fr de même nom, même prénom, nés la même année
 *    (± 1) — lib/adn_livres.php (réponses gardées 90 jours, une requête par seconde au plus). Où : la fiche, dans la ligne
 *    « ✍️ IdRef · data.bnf (auteur) » des blocs de profils quand elle est là (sinon un petit bloc « 📚 Ses livres ? », caché
 *    quand il n'y a rien) ; « 🌍 Où chercher ? » → « 📚 Chercher mes ancêtres auteurs » (une file lente).
 *    « ✓ C'est lui » : la notice en source + « Fiches en ligne » + ses livres (↶ Annuler) ; « ✗ Pas lui » (gardé, ↶).
 * Réglages → « 🦴 ADN ancien · 📚 Auteurs » : chaque partie s'éteint (localStorage genealogie-adn-livres), À propos des données.
 * À la demande : LCNDA_EXT.dataSources (adn_ancien, adn_ancien_lieu, bnf_auteur).
 * Le calcul (sans écran) est aussi exporté pour Node : tests/test-adn-livres.js.
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

    /* ═════════════ le calcul (aussi pour Node) ═════════════ */
    const DATA_V = 1;
    const MIN = {y: 3, mt: 2}; // « R1b », « H1 » : en dessous, trop vague pour dire quelque chose
    const kind = ch => (/[A-Z]/.test(ch) ? 'U' : /[0-9]/.test(ch) ? 'D' : /[a-z]/.test(ch) ? 'L' : '?');
    /** « R1b1a1b~ », « H1c3+152 » → « R1b1a1b », « H1c3 » (lettres et chiffres qui alternent) */
    const cleanHap = s => (String(s || '').trim().replace(/[~*]/g, '').match(/^[A-Z]+[0-9a-z]*/) || [''])[0];
    /** p est-il un ancêtre de s (ou s lui-même) dans l'écriture alternée ? « H1 » ⊃ « H1c3 » mais pas « H10 » */
    function under(s, p) {
        if (!s || !p) return false;
        if (s === p) return true;
        return s.startsWith(p) && kind(s[p.length]) !== kind(p[p.length - 1]);
    }
    const segs = s => String(s || '').match(/[A-Z]+|[0-9]+|[a-z]+/g) || [];
    /** le plus long ancêtre commun (« R1b1a1b1a1a2 » et « R1b1a1b1a1a1 » → « R1b1a1b1a1a ») */
    function common(a, b) {
        const g = segs(a);
        for (let k = g.length; k >= 1; k--) { const p = g.slice(0, k).join(''); if (under(b, p)) return p; }
        return '';
    }
    /** ce que la personne a écrit : « R1b-U152 », « R-M269 », « R1b1a1b », « U5b » */
    function parseHap(k, raw, ymap = {}) {
        const s = String(raw || '').trim().replace(/\s+/g, '');
        if (k === 'mt') return {raw: s, isogg: cleanHap(s), snp: '', term: '', exact: true};
        const m = s.match(/^([A-Z][0-9A-Za-z]*)-([A-Za-z]{1,6}[0-9][0-9A-Za-z.]*)$/);
        if (m) {
            const snp = m[2].toUpperCase(), mapped = ymap[snp] || '';
            const letter = cleanHap(m[1]);
            // la mutation connue de l'index donne la branche précise ; sinon, seulement le grand groupe écrit devant (« R1b »)
            return {raw: s, isogg: mapped || letter, snp, term: `${m[1][0]}-${snp}`, exact: !!mapped};
        }
        return {raw: s, isogg: cleanHap(s), snp: '', term: '', exact: true};
    }
    const rad = Math.PI / 180;
    function km(a, b, c, d) { const x = Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); }
    /** le fichier → des lignes lisibles */
    function prepare(raw) {
        const F = raw.fields, ix = Object.fromEntries(F.map((f, i) => [f, i]));
        const rows = raw.rows.map(r => ({id: r[ix.id], y: r[ix.y], yi: cleanHap(r[ix.yi]), mt: cleanHap(r[ix.mt]), mtRaw: r[ix.mt], bp: r[ix.bp], sd: r[ix.sd], date: r[ix.date], grp: r[ix.grp], loc: r[ix.loc],
            cty: r[ix.cty], lat: r[ix.lat], lon: r[ix.lon], pub: raw.pubs[r[ix.pub]] || ['', ''], sex: r[ix.sex]}));
        return {rows, ymap: raw.ymap || {}, source: raw.source || {}, built: raw.built || ''};
    }
    /**
     * Les individus anciens de la même lignée, les plus proches de l'origine :
     *  level 'same'   : le même haplogroupe ou une branche qui en descend (ils portent ta mutation) ;
     *  level 'branch' : sinon, la branche plus ancienne la plus précise qu'on trouve (un ancêtre commun en ligne directe).
     */
    function match(D, k, hapRaw, origin) {
        if (!D || !origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lon)) return null;
        const h = parseHap(k, hapRaw, D.ymap);
        if (!h.isogg && !h.term) return null;
        const field = k === 'y' ? 'yi' : 'mt';
        const pool = D.rows.filter(r => (k === 'y' ? r.yi || r.y : r.mt));
        let level = 'same', com = h.isogg, list = pool.filter(r => (h.term && r.y === h.term) || (h.exact && h.isogg.length >= MIN[k] && under(r[field], h.isogg)));
        if (!list.length && h.isogg && !h.exact && h.isogg.length >= MIN[k]) { level = 'branch'; list = pool.filter(r => under(r[field], h.isogg)); }
        if (!list.length && h.isogg) {
            let best = '';
            for (const r of pool) { const c = common(r[field], h.isogg); if (c.length > best.length) best = c; }
            if (best.length < MIN[k]) return null;
            level = 'branch'; com = best; list = pool.filter(r => under(r[field], best));
        }
        if (!list.length) return null;
        list = list.map(r => ({...r, km: km(origin.lat, origin.lon, r.lat, r.lon)})).sort((a, b) => a.km - b.km || b.bp - a.bp);
        return {kind: k, hap: h.raw, isogg: h.isogg, level, common: com, total: list.length, list, origin};
    }
    /** les individus anciens les plus proches d'un lieu (sans haplogroupe : pour « 🧰 Données » → un lieu) */
    function near(D, lat, lon, n = 12) {
        return D.rows.map(r => ({...r, km: km(lat, lon, r.lat, r.lon)})).sort((a, b) => a.km - b.km || b.bp - a.bp).slice(0, n);
    }
    /* l'époque, d'après les mots du groupe (« England_EN_Megalithic », « Russia_BA_Okunevo ») : rien quand ce n'est pas écrit */
    const PERIODS = [
        [/^(UP|EUP|LUP|Paleolithic|UpperPaleolithic|Epipaleolithic|Magdalenian|Gravettian|Aurignacian)$/i, 'du paléolithique'],
        [/^(Meso|Mesolithic)$/i, 'du mésolithique'],
        [/^(N|EN|MN|LN|ENeo|Neolithic|EarlyNeolithic|MiddleNeolithic|LateNeolithic|PPNA|PPNB|PPNC|PN|LBK|Megalithic)$/i, 'du néolithique'],
        [/^(CA|Eneolithic|Chalcolithic|Copper|CopperAge)$/i, 'de l’âge du cuivre'],
        [/^(BA|EBA|MBA|LBA|EMBA|MLBA|BronzeAge|EarlyBronzeAge|MiddleBronzeAge|LateBronzeAge|Unetice|Tumulus|Urnfield)$/i, 'de l’âge du bronze'],
        [/^(IA|EIA|MIA|LIA|IronAge|EarlyIronAge|LateIronAge|Hallstatt|LaTene|LaTène)$/i, 'de l’âge du fer'],
        [/^(Roman|ImperialRoman|LateRoman|RomanPeriod)$/i, 'de l’époque romaine'],
        [/^(Medieval|EarlyMedieval|EMedieval|EMed|LateMedieval|HighMedieval|Merovingian|Carolingian|Viking|VikingAge|Avar|EarlyAvar|MiddleAvar|LateAvar|AngloSaxon|EarlySlav|Slavic)$/i, 'du Moyen Âge'],
    ];
    function periodOf(grp) {
        const toks = String(grp || '').split(/[_.]/).slice(1);
        for (let i = toks.length - 1; i >= 0; i--) { const p = PERIODS.find(([re]) => re.test(toks[i])); if (p) return p[1]; }
        return '';
    }
    const nf = n => Number(n).toLocaleString('fr-FR');
    /** 4200 BP → « vers 2250 av. J.-C. » ; 1000 BP → « vers 950 apr. J.-C. » */
    function dateTxt(bp, sd = 0) {
        const step = sd >= 50 ? 50 : 10, y = 1950 - Number(bp);
        if (y <= 0) return T('vers {y} av. J.-C.', {y: String(Math.max(step, Math.round((1 - y) / step) * step))});
        return T('vers {y} apr. J.-C.', {y: String(Math.max(step, Math.round(y / step) * step))});
    }
    const pubLabel = a => String(a || '').replace(/([a-zà-ÿ])([A-Z])/g, '$1 $2').replace(/([A-Za-zà-ÿ])(\d{4})/, '$1 $2');
    const kmTxt = d => (d < 1 ? '' : d < 10 ? nf(Math.round(d)) : d < 1000 ? nf(Math.round(d / 5) * 5) : nf(Math.round(d / 50) * 50));
    const core = {DATA_V, cleanHap, under, common, parseHap, km, prepare, match, near, periodOf, dateTxt, pubLabel, kmTxt};
    if (typeof module === 'object' && module.exports) module.exports = core;
    if (typeof document === 'undefined' || root.LCNDA_EXT?.adnLivres) return; // Node, ou déjà chargé

    /* ═════════════ l'écran ═════════════ */
    const A = () => root.LCNDA_APP;
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (a, q) => A().api(a, q);
    const post = async body => { const r = await A().api('adn_livres_write', {}, {method: 'POST', body}); return r?.result || r; };
    const toast = (m, k) => A().toast?.(m, k);
    const KEY = 'genealogie-adn-livres';
    const DEF = {ancien: true, livres: true, auto: true};
    const settings = () => { try { return {...DEF, ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {})}; } catch (_) { return {...DEF}; } };
    const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
    const TAB = ['adn_livres', '25p', '🦴 ADN ancien · 📚 Auteurs'], BLOCK = ['adn_livres', '📚 Ses livres ?'];
    const link = (url, txt) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(txt)} ↗</a>` : esc(txt));

    let dataP = null;
    async function readGz(r) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf)); // déjà décompressé en route
        if (typeof DecompressionStream === 'undefined') throw new Error(T('Ce navigateur ne sait pas ouvrir le fichier de l’ADN ancien.'));
        return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    }
    const load = () => dataP || (dataP = fetch(`assets/data/adn-ancien.json.gz?v=${DATA_V}`, {credentials: 'same-origin'})
        .then(r => { if (!r.ok) throw new Error(T('Le fichier de l’ADN ancien est introuvable.')); return readGz(r); }).then(prepare).catch(e => { dataP = null; throw e; }));

    /* ─────────── 🦴 la phrase, la petite carte, « voir les 12 » ─────────── */
    function who(r, k) { return k === 'y' || r.sex === 'M' ? T('un homme') : r.sex === 'F' ? T('une femme') : T('une personne'); }
    function sentence(res, mine) {
        const r = res.list[0], k = res.kind, per = periodOf(r.grp), dist = kmTxt(r.km), o = res.origin;
        const whom = `${who(r, k)}${per ? ' ' + T(per) : ''} (${dateTxt(r.bp, r.sd)})`;
        const where = dist ? T('trouvé à {km} km de {place}', {km: dist, place: o.name || T('ton village')}) : T('trouvé à {place} même', {place: o.name || T('ton village')});
        const pub = r.pub[0] ? ` (${link(r.pub[1], pubLabel(r.pub[0]))})` : '';
        const side = k === 'y' ? (mine ? T('Ton haplogroupe paternel') : T('Son haplogroupe paternel')) : (mine ? T('Ton haplogroupe maternel') : T('Son haplogroupe maternel'));
        if (res.level === 'same') return `${esc(side)} <b>${esc(res.hap)}</b> ${esc(T('se retrouve chez'))} ${esc(whom)} ${esc(where)}${pub}.`;
        return `${esc(T('Le groupe {c}, dont descend {side} ({hap}), se retrouve chez', {side: side.charAt(0).toLowerCase() + side.slice(1), hap: res.hap, c: res.common}))} ${esc(whom)} ${esc(where)}${pub}.`;
    }
    function rowLi(r, k, i) {
        const hap = k === 'y' ? [r.y, r.yi].filter(Boolean).join(' · ') : r.mtRaw;
        const per = periodOf(r.grp);
        return `<li><span class="adnl-n">${i + 1}</span><div><b>${esc(hap)}</b> · ${esc(dateTxt(r.bp, r.sd))}${per ? ` · ${esc(T(per))}` : ''} · ${esc(kmTxt(r.km) ? T('{km} km', {km: kmTxt(r.km)}) : T('sur place'))}
            <small>${esc([r.loc, r.cty].filter(Boolean).join(', '))} · ${esc(T('groupe {g}', {g: r.grp}))}${r.date ? ` · ${esc(r.date)}` : ''} · ${esc(r.id)}${r.pub[0] ? ` · ${link(r.pub[1], pubLabel(r.pub[0]))}` : ''}</small></div></li>`;
    }
    function mapHtml(res) {
        if (!ext.miniMap) return '';
        const o = res.origin;
        const pts = [{lat: o.lat, lon: o.lon, label: o.name, color: '#b5651d', showLabel: true}, ...res.list.slice(0, 12).map((r, i) => ({lat: r.lat, lon: r.lon, n: String(i + 1), color: '#4e79a7', label: `${i + 1}. ${r.loc || r.cty} — ${dateTxt(r.bp, r.sd)}`}))];
        try { return `<div class="adnl-map">${ext.miniMap(pts, [], {height: 300})}</div>`; } catch (_) { return ''; }
    }
    function sourceLine(D) {
        const s = D.source || {};
        return `<small class="adnl-src">${esc(T('Source : {c}', {c: 'Allen Ancient DNA Resource (AADR), Mallick & Reich, Harvard'}))}${s.version ? ' v' + esc(s.version) : ''} — ${link(s.url || 'https://doi.org/10.7910/DVN/FFIDCW', 'Harvard Dataverse')} · ${esc(T('licence'))} ${link(s.licence_url || 'https://creativecommons.org/publicdomain/zero/1.0/', s.licence || 'CC0 1.0')}. ${esc(T('Un même haplogroupe dit un ancêtre commun très lointain en ligne directe, pas une parenté proche.'))}</small>`;
    }
    /** le bloc complet (une phrase par lignée, puis replié) ; '' quand il n'y a rien à dire */
    function ancientHtml(D, r) {
        if (!r) return '';
        const mine = !!r.person?.is_start;
        const parts = ['y', 'mt'].map(k => {
            const L = r[k]; if (!L || !L.origin) return '';
            const res = match(D, k, L.hap, L.origin); if (!res) return '';
            const o = L.origin, whoO = o.who?.id && o.who.id !== r.person?.id ? T(' — {name}, le plus ancien {k} connu de la lignée', {name: o.who.name, k: k === 'y' ? T('homme') : T('ancêtre')}) : '';
            return `<div class="adnl-line" data-adnl-kind="${k}"><p class="adnl-lead">🦴 ${sentence(res, mine)}</p>
                <details class="adnl-fold"><summary>${esc(T('▸ voir les {n}', {n: nf(Math.min(res.total, 50))}))}${res.total > 50 ? ` <small>${esc(T('(sur {n})', {n: nf(res.total)}))}</small>` : ''}</summary>
                <p class="muted adnl-origin">${esc(T('Point de départ : {place}', {place: [o.name, o.county, o.country].filter(Boolean).join(', ')}))}${esc(whoO)}.</p>
                ${mapHtml(res)}<ol class="adnl-list">${res.list.slice(0, 50).map((x, i) => rowLi(x, k, i)).join('')}</ol></details></div>`;
        }).filter(Boolean);
        return parts.length ? `<div class="adnl-anc">${parts.join('')}${sourceLine(D)}</div>` : '';
    }
    async function renderAncient(pid) {
        const [D, r] = await Promise.all([load(), api('adn_ancien', {person_id: pid})]);
        return ancientHtml(D, r);
    }

    /* fiche : sous le contenu du bloc « 🧬 ADN » (heritage-dna.js), quand un test a un haplogroupe */
    async function fillDnaCard(box) {
        box.dataset.adnlDone = '1';
        if (!settings().ancien) return;
        const pid = Number(box.dataset.dnaHost); if (!pid) return;
        let html = ''; try { html = await renderAncient(pid); } catch (_) { return; }
        if (!html || !box.isConnected || box.parentElement.querySelector('.adnl-anc')) return;
        box.insertAdjacentHTML('afterend', html);
    }
    /* onglet ADN → « 🌳 Lignées Y, mt et X » : une carte de plus sous les trois */
    async function fillLines(host) {
        host.dataset.adnlDone = '1';
        if (!settings().ancien) return;
        const pid = Number(host.closest('.page, section, main')?.querySelector('[name=dna_lp]')?.value || document.querySelector('[name=dna_lp]')?.value) || 0; if (!pid) return;
        let html = ''; try { html = await renderAncient(pid); } catch (_) { return; }
        if (!html || !host.isConnected || host.querySelector('.adnl-anc')) return;
        host.insertAdjacentHTML('beforeend', `<section class="card adnl-card"><h3>${esc(T('🦴 Les ancêtres très anciens de ta lignée'))}</h3>${html}</section>`);
    }

    /* ─────────── 📚 BnF : la ligne « Peut-être l'auteur de … » ─────────── */
    const LIVES = new Map(); // personne → dernière réponse
    function worksLine(c) {
        const w = c.works[0];
        return `« ${esc(w.t.length > 140 ? w.t.slice(0, 137) + '…' : w.t)} »${w.y ? ` (${w.y})` : ''}`;
    }
    function candHtml(res, c, {withName = false} = {}) {
        const pid = res.person.id, female = res.person.gender === 'female';
        const life = `${c.fy}${c.ly ? '–' + c.ly : ''}`;
        const more = c.works.slice(1);
        const fold = `<details class="adnl-fold"><summary>${esc(T('▸ plus'))}</summary><p class="muted">${esc(T('Notice BnF : {name} ({life})', {name: c.name, life}))}</p>
            ${more.length ? `<ul class="adnl-works">${more.map(w => `<li>${w.url ? link(w.url, w.t) : esc(w.t)}${w.y ? ` <small>(${w.y})</small>` : ''}</li>`).join('')}</ul>` : ''}${c.works_more ? `<p class="muted">${esc(T('Et d’autres : voir la notice.'))}</p>` : ''}
            <small class="adnl-src">${esc(T('Source : {c}, données récupérées le {d}.', {c: res.credit || 'Bibliothèque nationale de France, data.bnf.fr — Licence Ouverte', d: res.fetched_at || '?'}))} ${link(res.licence_url || 'https://data.bnf.fr/fr/licence', T('licence'))}</small></details>`;
        const name = withName ? `<button type="button" class="table-link" data-open-person="${pid}">${esc([res.person.first, res.person.last].join(' '))}</button> ${res.person.birth ? `<small class="muted">(${res.person.birth})</small>` : ''} — ` : '';
        if (c.verdict === 'yes') return `<div class="adnl-book is-yes" data-adnl-cand="${esc(c.ark)}" data-adnl-pid="${pid}"><p>${name}📚 ${esc(T(female ? 'Autrice de' : 'Auteur de'))} ${worksLine(c)}${more.length ? ` ${esc(T('et {n} autres', {n: more.length}))}` : ''} — ${link(c.url, T('notice BnF'))} <span class="ui-badge is-green">${esc(T(female ? '✓ c’est elle' : '✓ c’est lui'))}</span>${res.person.locked ? '' : ` <button type="button" class="link-button" data-adnl-undo="${esc(c.batch)}" title="${esc(T('Retirer la source, la fiche en ligne et les livres ajoutés'))}">↶</button>`}</p>${fold}</div>`;
        const ro = document.body.classList.contains('is-kiosk') || res.person.locked;
        return `<div class="adnl-book" data-adnl-cand="${esc(c.ark)}" data-adnl-pid="${pid}"><p>${name}📚 ${esc(T(female ? 'Peut-être l’autrice de' : 'Peut-être l’auteur de'))} ${worksLine(c)} — ${link(c.url, T('notice BnF'))}
            ${ro ? '' : `<span class="adnl-acts"><button type="button" class="button small" data-adnl-yes>${esc(T(female ? '✓ C’est elle' : '✓ C’est lui'))}</button><button type="button" class="button small secondary" data-adnl-no>${esc(T(female ? '✗ Pas elle' : '✗ Pas lui'))}</button></span>`}</p>${fold}</div>`;
    }
    const shown = res => (res?.candidates || []).filter(c => c.verdict !== 'no');
    function booksHtml(res, o) { return shown(res).map(c => candHtml(res, c, o)).join(''); }

    /** la place de la ligne : dans la ligne IdRef · data.bnf des profils si elle est là (même bloc), sinon notre petit bloc */
    function placeBooks(pid) {
        const res = LIVES.get(pid);
        const html = res ? booksHtml(res) : '';
        const own = document.querySelector(`#workspace [data-adnl-books="${pid}"]`);
        const so6 = document.querySelector('#workspace .so6-author');
        document.querySelectorAll('#workspace .adnl-in-so6').forEach(x => { if (!html || !so6 || !so6.contains(x)) x.remove(); });
        if (html && so6) {
            let box = so6.parentElement.querySelector('.adnl-in-so6');
            if (!box) { box = document.createElement('div'); box.className = 'adnl-in-so6'; so6.after(box); }
            box.innerHTML = html;
            if (own) { own.innerHTML = ''; own.closest('.card') && (own.closest('.card').hidden = true); }
            return;
        }
        if (!own) return;
        own.innerHTML = html;
        const card = own.closest('.card'); if (card) card.hidden = !html;
    }
    async function lookup(pid, {fresh = false, cachedOnly = false} = {}) {
        const res = await api('adn_livres', {person_id: pid, op: cachedOnly ? 'cached' : 'lookup', ...(fresh ? {fresh: 1} : {})});
        LIVES.set(pid, res); return res;
    }
    async function fillBooks(pid) {
        const s = settings(); if (!s.livres) return;
        try { await lookup(pid, {cachedOnly: !s.auto}); } catch (_) { return; }
        placeBooks(pid);
    }
    const refreshAll = pid => { placeBooks(pid); document.querySelectorAll(`[data-adnl-batch-list] [data-adnl-pid="${pid}"]`).forEach(el => { const res = LIVES.get(pid); const c = res && res.candidates.find(x => x.ark === el.dataset.adnlCand); if (c) el.outerHTML = c.verdict === 'no' ? '' : candHtml(res, c, {withName: true}); }); };
    async function confirm(pid, ark) {
        const r = await post({op: 'confirm', person_id: pid, ark});
        await lookup(pid, {cachedOnly: true}); refreshAll(pid);
        const msg = r.books ? T('📚 Notice BnF ajoutée en source, avec {n} livre(s)', {n: r.books}) : T('📚 Notice BnF ajoutée en source');
        A().undoToast ? A().undoToast(msg, {undo: async () => { await post({op: 'undo', batch: r.batch}); await lookup(pid, {cachedOnly: true}); refreshAll(pid); }}) : toast(msg);
    }
    async function markNo(pid, ark, verdict = 'no') {
        await post({op: 'mark', person_id: pid, ark, verdict});
        await lookup(pid, {cachedOnly: true}); refreshAll(pid);
        if (verdict === 'no') A().undoToast ? A().undoToast(T('✗ Noté : ce n’est pas lui'), {undo: () => markNo(pid, ark, '')}) : toast(T('✗ Noté : ce n’est pas lui'));
    }
    document.addEventListener('click', async e => {
        const t = e.target; if (!t?.closest) return;
        const undo = t.closest('[data-adnl-undo]');
        if (undo) { e.preventDefault(); const el = undo.closest('[data-adnl-pid]'); const pid = Number(el.dataset.adnlPid); try { await post({op: 'undo', batch: undo.dataset.adnlUndo}); await lookup(pid, {cachedOnly: true}); refreshAll(pid); toast(T('↶ Retiré')); } catch (err) { toast(err.message, 'error'); } return; }
        const b = t.closest('[data-adnl-yes], [data-adnl-no]'); if (!b) return;
        e.preventDefault();
        const el = b.closest('[data-adnl-pid]'); const pid = Number(el.dataset.adnlPid), ark = el.dataset.adnlCand;
        b.disabled = true;
        try { if (b.hasAttribute('data-adnl-yes')) await confirm(pid, ark); else await markNo(pid, ark); } catch (err) { b.disabled = false; toast(err.message, 'error'); }
    });

    /* ─────────── la fiche : le petit bloc (caché quand il n'y a rien) ─────────── */
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks[BLOCK[0]] = (index, detail) => {
        const p = detail?.person;
        if (!settings().livres || !p?.id || p.kind === 'animal' || Number(p.is_private) === 1 || p.living_status === 'living') return '';
        return A().card(index, T(BLOCK[1]), '', `<div class="adnl-books" data-adnl-books="${Number(p.id)}"></div>`, 'span-12').replace('<section class="card ', '<section hidden class="card ');
    };
    (ext.afterPerson = ext.afterPerson || []).push(detail => {
        const p = detail?.person; const pid = Number(p?.id) || 0;
        if (!pid || p.kind === 'animal' || Number(p.is_private) === 1 || p.living_status === 'living') return;
        fillBooks(pid);
    });

    /* les hôtes qui apparaissent : bloc ADN rempli, lignées calculées, ligne IdRef · data.bnf ajoutée après coup */
    let scanT = 0;
    const scan = () => {
        clearTimeout(scanT);
        scanT = setTimeout(() => {
            document.querySelectorAll('[data-dna-host][data-dna-done]:not([data-adnl-done])').forEach(b => { if (b.children.length) fillDnaCard(b); });
            document.querySelectorAll('[data-dna-lines]:not([data-adnl-done])').forEach(h => { if (h.querySelector('section.card')) fillLines(h); });
            const so6 = document.querySelector('#workspace .so6-author');
            if (so6 && !so6.parentElement.querySelector('.adnl-in-so6')) { const pid = Number(A()?.state?.currentPerson?.person?.id) || 0; if (pid && LIVES.has(pid) && shown(LIVES.get(pid)).length) placeBooks(pid); }
        }, 60);
    };
    new MutationObserver(scan).observe(document.documentElement, {childList: true, subtree: true});

    /* ─────────── 🌍 Où chercher ? → « 📚 Chercher mes ancêtres auteurs » (file lente) ─────────── */
    // une personne toutes les 3 secondes (gap) ; le serveur, lui, ne fait pas plus d'une requête par seconde
    const Q = {root: 0, list: [], i: 0, running: false, found: [], done: 0, timer: 0, err: '', gap: 3000};
    function batchHtml(view) {
        const pid = Number(view?.pid) || 0;
        const same = Q.root === pid;
        const prog = same && Q.list.length ? T('{d} sur {n} ancêtres regardés', {d: Q.done, n: Q.list.length}) : '';
        const items = same ? Q.found.map(x => booksHtml(LIVES.get(x), {withName: true})).join('') : '';
        return `<details class="ouc-oa adnl-batch" data-adnl-batch ${same && (Q.running || Q.found.length) ? 'open' : ''}><summary>📚 <b>${esc(T('Chercher mes ancêtres auteurs'))}</b> <small class="muted">${esc(T('la BnF connaît-elle un de tes ancêtres comme auteur ?'))}</small></summary>
            <p class="ouc-intro">${esc(T('Pour chaque ancêtre mort (pas les vivants, pas les fiches confidentielles), on demande à la BnF les auteurs du même nom, même prénom, nés la même année. Lentement exprès : un ancêtre toutes les 3 secondes ; ce qui a déjà été demandé n’est pas redemandé avant 90 jours.'))}</p>
            <p class="adnl-batch-bar">${same && Q.running ? `<button type="button" class="button small secondary" data-adnl-pause>${esc(T('⏸ Pause'))}</button>` : `<button type="button" class="button small" data-adnl-go>${esc(same && Q.list.length && Q.i < Q.list.length ? T('▶ Reprendre') : T('🔍 Chercher'))}</button>`}
            <span class="muted" data-adnl-prog>${esc(prog)}</span>${same && Q.err ? ` <span class="adnl-err">${esc(Q.err)}</span>` : ''}</p>
            <div data-adnl-batch-list>${items}</div>${same && !Q.running && Q.list.length && Q.i >= Q.list.length && !Q.found.length ? `${window.LCNDA_APP.empty(T('Aucun de tes ancêtres n’a été trouvé comme auteur à la BnF.'))}` : ''}
            <p class="ui-hint">${esc(T('Données : Bibliothèque nationale de France, data.bnf.fr — Licence Ouverte.'))}</p></details>`;
    }
    const BATCH_BODIES = new Set();
    function repaintBatch() {
        BATCH_BODIES.forEach(body => {
            if (!body.isConnected) { BATCH_BODIES.delete(body); return; }
            const sec = body.querySelector('[data-adnl-batch]'); const view = body.__adnlView; if (!sec || !view) return;
            const tmp = document.createElement('div'); tmp.innerHTML = batchHtml(view); const neu = tmp.firstElementChild; if (sec.open) neu.open = true; sec.replaceWith(neu);
        });
    }
    async function step() {
        if (!Q.running) return;
        if (Q.i >= Q.list.length) { Q.running = false; repaintBatch(); return; }
        const p = Q.list[Q.i++];
        let wait = Q.gap;
        try {
            const res = await lookup(p.id, {cachedOnly: p.searched});
            if (p.searched) wait = 50; // déjà demandé : rien ne part sur le réseau
            if (shown(res).length) Q.found.push(p.id);
            Q.err = '';
        } catch (e) { Q.err = e.message; Q.i--; wait = 30000; } // la BnF dit d'attendre : on attend, puis on reprend la même personne
        Q.done = Q.i; repaintBatch();
        Q.timer = setTimeout(step, wait);
    }
    async function startBatch(pid) {
        if (Q.root !== pid || !Q.list.length) {
            const r = await api('adn_livres', {op: 'ancestors', person_id: pid});
            Object.assign(Q, {root: pid, list: r.people || [], i: 0, found: [], done: 0, err: ''});
        }
        Q.running = true; repaintBatch(); step();
    }
    const oc = ext.ouChercher = ext.ouChercher || {};
    (oc.afterRedraw = oc.afterRedraw || []).push((view, body) => {
        if (!settings().livres || !view || !body) return;
        body.__adnlView = view; BATCH_BODIES.add(body);
        body.querySelector('[data-adnl-batch]')?.remove();
        const host = body.querySelector('[data-ouc-plus]') || body.querySelector('.ouc-facts');
        if (host?.matches('[data-ouc-plus]')) host.insertAdjacentHTML('beforeend', batchHtml(view)); else if (host) host.insertAdjacentHTML('afterend', batchHtml(view)); else body.insertAdjacentHTML('afterbegin', batchHtml(view));
        if (!body.__adnlWired) {
            body.__adnlWired = true;
            body.addEventListener('click', async e => {
                if (e.target.closest?.('[data-adnl-go]')) { e.preventDefault(); try { await startBatch(Number(body.__adnlView?.pid) || 0); } catch (err) { toast(err.message, 'error'); } }
                if (e.target.closest?.('[data-adnl-pause]')) { e.preventDefault(); Q.running = false; clearTimeout(Q.timer); repaintBatch(); }
            });
        }
    });

    /* ─────────── Réglages → « 🦴 ADN ancien · 📚 Auteurs » ─────────── */
    function register() {
        const app = A(); if (!app?.defaultMaintenanceTabs) return false;
        if (!app.defaultMaintenanceTabs.some(t => t[0] === TAB[0])) app.defaultMaintenanceTabs.push(TAB);
        const B = app.defaultPersonBlocks;
        if (Array.isArray(B)) {
            const i = B.findIndex(b => b[0] === BLOCK[0]);
            if (settings().livres && i < 0) { let at = B.findIndex(b => b[0] === 'histoire'); if (at < 0) at = B.findIndex(b => b[0] === 'world'); B.splice(at < 0 ? B.length : at + 1, 0, BLOCK); }
            if (!settings().livres && i >= 0) B.splice(i, 1);
        }
        if (app.defaultPersonBlockSpans && !app.defaultPersonBlockSpans[BLOCK[0]]) app.defaultPersonBlockSpans[BLOCK[0]] = '12';
        return true;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register);
    async function aboutHtml() {
        let D = null; try { D = await load(); } catch (_) {}
        const s = D?.source || {};
        return `<h4>🦴 ${esc(T('ADN ancien'))}</h4>
            ${D ? `<p>${esc(T('{n} individus anciens (avant 1850) avec leur haplogroupe Y ou mitochondrial, leur date, leur groupe, leur lieu et la publication.', {n: nf(D.rows.length)}))}</p>` : `<p>${esc(T('Le fichier de l’ADN ancien n’est pas dans cette version de l’app.'))}</p>`}
            <p>${esc(T('Source : {c}', {c: s.credit || 'Allen Ancient DNA Resource (AADR), Harvard Dataverse'}))}. ${link(s.url || 'https://doi.org/10.7910/DVN/FFIDCW', 'doi:10.7910/DVN/FFIDCW')} · ${esc(T('Licence'))} ${link(s.licence_url || 'https://creativecommons.org/publicdomain/zero/1.0/', s.licence || 'CC0 1.0')} (${esc(T('domaine public'))}).</p>
            ${s.paper ? `<p class="muted">${esc(s.paper)}</p>` : ''}${s.kept ? `<p class="muted">${esc(T('Gardés : {k}.', {k: s.kept}))}</p>` : ''}
            <p class="muted">${esc(T('Le haplogroupe vient de tes tests ADN (onglet ADN → Mes tests). On cherche d’abord le même haplogroupe ou une branche qui en descend, sinon la branche plus ancienne la plus précise, au plus près du plus ancien lieu connu de la lignée. Tout se fait sur cet ordinateur.'))}</p>
            <h4>📚 ${esc(T('Auteurs de la BnF'))}</h4>
            <p>${esc(T('Source : Bibliothèque nationale de France, data.bnf.fr (point d’accès SPARQL). Licence Ouverte : réutilisation libre, en citant la source et la date de récupération (écrite sous chaque résultat).'))} ${link('https://data.bnf.fr/fr/licence', T('licence'))}</p>
            <p class="muted">${esc(T('Seulement pour les personnes mortes et non confidentielles, avec prénom, nom et année de naissance. On n’envoie qu’un nom de famille et une année. Réponses gardées 90 jours, une requête par seconde au plus.'))}</p>`;
    }
    async function openAbout() { ext.openDialog?.({eyebrow: '🦴📚', title: T('À propos des données'), body: await aboutHtml()}); }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = async token => {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const about = await aboutHtml();
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const draw = () => {
            const s = settings(), K = UI().toggleHtml || ((l, o) => `<label class="ui-toggle"><input type="checkbox" ${o.attrs} ${o.checked ? 'checked' : ''}><i></i>${esc(l)}</label>`);
            const tg = (k, label, sub) => `<div>${K(T(label), {checked: !!s[k], attrs: `data-adnl-tg="${k}"`, sub: sub ? T(sub) : ''})}</div>`;
            ws.innerHTML = `<section class="page adnl-set">${UI().pageHeader ? UI().pageHeader({title: T('ADN ancien · Auteurs'), icon: '🦴', where: T('Réglages · Données'), help: T('Les ancêtres très anciens de ta lignée (d’après ton haplogroupe) et les ancêtres qui ont peut-être écrit un livre (BnF).')}) : `<h2>🦴 ${esc(T('ADN ancien · Auteurs'))}</h2>`}
                <section class="card"><h3>${esc(T('Montrer'))}</h3>
                    ${tg('ancien', '🦴 Les ancêtres très anciens de ta lignée', 'Dans le bloc « 🧬 ADN » de la fiche et dans « 🌳 Lignées Y, mt et X », quand un test a un haplogroupe.')}
                    ${tg('livres', '📚 Ton ancêtre a peut-être écrit un livre', 'Sur la fiche d’un ancêtre mort, et « Chercher mes ancêtres auteurs » dans « 🌍 Où chercher ? ».')}
                    <div ${s.livres ? '' : 'hidden'}>${tg('auto', 'Demander à la BnF quand j’ouvre une fiche', 'Éteint : seulement ce qui a déjà été cherché (par « Chercher mes ancêtres auteurs »).')}</div>
                </section>
                <section class="card"><h3>${esc(T('À propos des données'))}</h3>${about}</section></section>`;
        };
        draw();
        if (ws.__adnlBound !== true) {
            ws.__adnlBound = true;
            ws.addEventListener('change', e => {
                const t = e.target.closest?.('[data-adnl-tg]'); if (!t || !ws.querySelector('.adnl-set')) return;
                const before = settings(), after = {...before, [t.dataset.adnlTg]: !!t.checked};
                const apply = v => { saveSettings(v); register(); if (ws.querySelector('.adnl-set')) draw(); };
                apply(after);
                const msg = t.checked ? T('Allumé') : T('Éteint');
                A().undoToast ? A().undoToast(msg, {undo: () => apply(before), redo: () => apply(after)}) : toast(msg);
            });
        }
    };

    /* ─────────── « à la demande » : le registre commun des données ─────────── */
    const DS = ext.dataSources = ext.dataSources || [];
    const ds = d => { if (!DS.some(x => x.id === d.id)) DS.push(d); };
    const pidOf = ctx => Number(typeof ctx?.person === 'object' ? (ctx.person?.person?.id ?? ctx.person?.id) : ctx?.person) || 0;
    const nothing = (host, t) => { host.innerHTML = A().empty ? A().empty(t, {icon: '🦴'}) : `<p class="muted">${esc(t)}</p>`; };
    ds({id: 'adn_ancien', icon: '🦴', label: 'Les ancêtres très anciens de sa lignée (ADN ancien)', group: 'La personne', needs: ['person'], installed: () => true,
        run: async (ctx, host) => { const pid = pidOf(ctx); const html = pid ? await renderAncient(pid) : '';
            if (!html) return nothing(host, T('Il faut un test ADN avec un haplogroupe (onglet ADN → Mes tests) et un lieu placé sur la carte dans sa lignée.'));
            host.innerHTML = html.replace('<details class="adnl-fold">', '<details class="adnl-fold" open>'); }});
    ds({id: 'adn_ancien_lieu', icon: '🦴', label: 'Les individus anciens trouvés près d’un lieu (ADN ancien)', group: 'Le lieu', needs: ['place'], installed: () => true,
        run: async (ctx, host) => { const pl = ctx?.place || {}; const lat = Number(pl.latitude ?? pl.lat), lon = Number(pl.longitude ?? pl.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return nothing(host, T('Choisis un lieu placé sur la carte.'));
            const D = await load(); const list = near(D, lat, lon, 12);
            host.innerHTML = `<div class="adnl-anc">${mapHtml({origin: {lat, lon, name: pl.name || ''}, list})}<ol class="adnl-list">${list.map((r, i) => rowLi({...r, mtRaw: [r.y && 'Y ' + r.y, r.mtRaw && 'mt ' + r.mtRaw].filter(Boolean).join(' · ')}, 'mt', i)).join('')}</ol>${sourceLine(D)}</div>`; }});
    ds({id: 'bnf_auteur', icon: '📚', label: 'A-t-il écrit un livre ? (BnF)', group: 'Chercher', needs: ['person'], installed: () => true,
        run: async (ctx, host) => { const pid = pidOf(ctx); if (!pid) return nothing(host, T('Choisis une personne.'));
            const res = await lookup(pid);
            if (!res.eligible) return nothing(host, T(res.reason === 'living' ? 'On ne cherche jamais une personne peut-être vivante.' : res.reason === 'private' ? 'Fiche confidentielle : rien n’est demandé.' : 'Il faut son prénom, son nom et son année de naissance.'));
            const html = booksHtml(res);
            host.innerHTML = html ? `<div class="adnl-books">${html}</div>` : `${window.LCNDA_APP.empty(T('Aucun auteur de ce nom, né en {y}, à la BnF.', {y: res.person.birth}))}`; }});

    ext.adnLivres = {...core, load, renderAncient, ancientHtml, lookup, booksHtml, settings, openAbout, register, queue: Q, startBatch};
})(typeof window !== 'undefined' ? window : globalThis);
