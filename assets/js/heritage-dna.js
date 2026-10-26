/* LCNDA — 🧬 Onglet « ADN » (masqué au départ : Réglages → Apparence → ordre du menu).
 * Mes tests (kits, haplogroupes, origines estimées), correspondances (cM, segments, côté, suivi, arbre, ancêtre commun),
 * import des fichiers des sociétés de test (CSV), groupes et méthode de Leeds, navigateur de chromosomes et triangulation,
 * calculateur de cM (Shared cM Project), lignées Y / mt / X tirées de l'arbre, origines, explications, réglages
 * (rubriques montrées et leur ordre, colonnes, couleurs). Mise en garde sur la loi française en tête.
 * Serveur : lib/dna.php. Rien n'est envoyé ailleurs.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const S = () => A().state;
    const PKF = o => window.LCNDA_PICKER.pickerField(o); // le menu de choix unique (docs/PICKER.md)
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const toast = (...a) => A().toast(...a);
    const num = v => { const n = parseFloat(String(v ?? '').replace(/[\s  ]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
    const fmt = (n, d = 0) => Number(n || 0).toLocaleString('fr-FR', {maximumFractionDigits: d});
    const plural = (n, one, many) => `${fmt(n)} ${n > 1 ? many : one}`;
    const isCurrent = token => token === S().workspaceToken && S().module === 'adn';
    // K5 : l’en-tête unique (app-pages.js) ; le sur-titre est l’endroit où l’on est, calculé d’après le menu
    const header = (eyebrow, title, intro, actions = '') => window.LCNDA_UI.pageHeader({title, help: intro || '', detail: !/^(LISTES|RÉGLAGES|ADN|RECHERCHE|STATISTIQUES)$/.test(eyebrow), actions: actions ? [actions] : []});

    /* ═════════ La loi ═════════ */
    const LAW_LINKS = [
        ['Code civil, article 16-10 (examen des caractéristiques génétiques : seulement à des fins médicales ou de recherche scientifique, avec consentement écrit)', 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000047569317'],
        ['Code pénal, article 226-28-1 (demander un examen génétique hors des cas prévus par la loi : 3 750 € d’amende)', 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000024324189'],
        ['Loi n° 2021-1017 du 2 août 2021 relative à la bioéthique, article 16 (nouvelle rédaction de l’article 16-10)', 'https://www.legifrance.gouv.fr/jorf/article_jo/JORFARTI000043884398'],
        ['Code civil sur Légifrance (articles 16-10 à 16-13 : examen génétique, empreintes génétiques, filiation)', 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070721'],
        ['Code pénal sur Légifrance (articles 226-25 à 226-30)', 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070719'],
        ['Code de la santé publique sur Légifrance (articles L1131-1 et suivants : examens génétiques)', 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006072665'],
        ['CNIL : les données génétiques sont des données « sensibles » (RGPD, article 9)', 'https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre2#Article9'],
    ];
    const lawHtml = (full = true) => `<section class="h-dna-law ${full ? '' : 'is-short'}"><h3>⚖️ Mise en garde : en France, les tests ADN « récréatifs » ne sont pas légaux</h3>
        <p>En France, l’examen des caractéristiques génétiques d’une personne n’est permis <b>qu’à des fins médicales ou de recherche scientifique</b>, avec son <b>consentement écrit</b> (Code civil, article 16-10). L’identification par empreintes génétiques est réservée à la justice et à quelques cas prévus par la loi (article 16-11). <b>Demander</b> un tel examen hors de ces cas — par exemple commander un test généalogique sur internet — est puni d’une <b>amende de 3 750 €</b> (Code pénal, article 226-28-1), même si le laboratoire est à l’étranger.</p>
        ${full ? `<ul>
            <li><b>Vérifie toujours le texte en vigueur</b> sur Légifrance : la loi peut changer (les débats sur la généalogie génétique sont réguliers). Cet onglet ne donne pas de conseil juridique.</li>
            <li><b>Ce que fait LCNDA</b> : rien n’est analysé ni envoyé. L’onglet sert à <b>ranger des informations</b> (par exemple des résultats obtenus légalement à l’étranger, par un parent résidant hors de France, dans un cadre médical ou de recherche, ou des renseignements donnés par d’autres personnes) et à <b>comprendre</b> ce que signifient des cM, des segments, un haplogroupe.</li>
            <li><b>Données sensibles</b> : l’ADN révèle des choses sur toi <i>et sur ta famille</i> (parents, frères et sœurs, enfants, cousins), qui n’ont pas consenti. Il peut révéler un secret de famille : naissance hors mariage, adoption, don de gamètes, parent inconnu. Prends le temps d’y penser avant de partager.</li>
            <li><b>Les sociétés de test</b> gardent les données selon leurs conditions (vente de société, fuites de données, demandes de la justice dans certains pays). Lis leurs conditions, choisis ce que tu partages, supprime ce que tu ne veux plus voir conservé.</li>
            <li><b>Personnes vivantes</b> : les noms, cM et contacts de correspondances sont des données personnelles. Garde-les pour ta recherche, ne les publie pas sans accord.</li>
        </ul>
        <h4>Textes officiels</h4><ul class="h-dna-links">${LAW_LINKS.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)} ↗</a></li>`).join('')}</ul>` : `<p><button type="button" class="link-button" data-dna-go="law">Lire la mise en garde complète et les textes officiels →</button></p>`}</section>`;

    /* ═════════ Réglages (modulable) ═════════ */
    const SECTIONS = [['home', '🏠', 'Synthèse'], ['law', '⚖️', 'Loi et mises en garde'], ['kits', '🧬', 'Mes tests'], ['matches', '👥', 'Correspondances'], ['groups', '🗂️', 'Groupes (méthode de Leeds)'], ['auto', '🔗', 'Groupes automatiques'], ['place', '📍', 'Placer un cousin'],
        ['chromo', '🧩', 'Chromosomes et segments'], ['calc', '📐', 'Calculateur de cM'], ['lines', '🌳', 'Lignées Y, mt et X'], ['origins', '🌍', 'Origines estimées'], ['learn', '📚', 'Comprendre l’ADN'], ['settings', '⚙️', 'Réglages']];
    const COLUMNS = [['name', 'Nom'], ['kit', 'Test'], ['cm', 'cM partagés'], ['pct', '% partagé'], ['segments', 'Segments'], ['longest', 'Plus long segment'], ['relationship', 'Relation (société)'], ['guess', 'Relation probable'],
        ['side', 'Côté'], ['groups', 'Groupes'], ['person', 'Fiche liée'], ['mrca', 'Ancêtre commun'], ['status', 'Suivi'], ['tree', 'Arbre'], ['surnames', 'Noms en commun'], ['places', 'Lieux'], ['stars', '★'], ['notes', 'Notes']];
    const PKEY = 'genealogie-adn-prefs';
    const DEFAULTS = () => ({order: SECTIONS.map(s => s[0]), hidden: ['origins'], columns: ['name', 'cm', 'segments', 'longest', 'guess', 'side', 'groups', 'person', 'status', 'stars'], minCm: 0, pageSize: 200,
        colors: {paternal: '#4e79a7', maternal: '#e15759', both: '#7b3f8c', unknown: '#9aa0a6', '': '#9aa0a6'}, leedsMin: 90, leedsMax: 400, autoMin: 30, autoMax: 600, total: 6800, ack: false, home: ['law', 'counts', 'hist', 'top', 'todo', 'sides']});
    let prefsCache = null;
    const prefs = () => { if (prefsCache) return prefsCache; let p = {}; try { p = JSON.parse(localStorage.getItem(PKEY) || '{}') || {}; } catch (_) {} const d = DEFAULTS();
        prefsCache = {...d, ...p, colors: {...d.colors, ...(p.colors || {})}}; const known = SECTIONS.map(s => s[0]);
        prefsCache.order = [...(Array.isArray(prefsCache.order) ? prefsCache.order : []).filter(k => known.includes(k)), ...known.filter(k => !(prefsCache.order || []).includes(k))];
        prefsCache.hidden = (Array.isArray(prefsCache.hidden) ? prefsCache.hidden : []).filter(k => known.includes(k) && k !== 'settings' && k !== 'law');
        prefsCache.columns = (Array.isArray(prefsCache.columns) ? prefsCache.columns : d.columns).filter(k => COLUMNS.some(c => c[0] === k)); if (!prefsCache.columns.includes('name')) prefsCache.columns.unshift('name');
        return prefsCache; };
    const savePrefs = p => { prefsCache = null; try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch (_) {} };
    const color = c => /^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : '#9aa0a6';

    /* ═════════ Données ═════════ */
    let data = null;
    const load = async (force = false) => { if (!data || force) data = await api('dna'); return data; };
    const kitName = k => k ? `${k.label || k.person_name || 'Test'}${k.company ? ' · ' + k.company : ''}` : '';
    const kitById = id => data?.kits.find(k => k.id === Number(id));
    const groupById = id => data?.groups.find(g => g.id === Number(id));
    const SIDES = [['', '—'], ['paternal', 'Paternel'], ['maternal', 'Maternel'], ['both', 'Des deux côtés'], ['unknown', 'Inconnu']];
    const STATUSES = [['', '—'], ['todo', 'À contacter'], ['contacted', 'Contacté'], ['replied', 'A répondu'], ['no_reply', 'Pas de réponse'], ['tree_shared', 'Arbre échangé'], ['placed', 'Placé dans l’arbre ✓'], ['ignore', 'À ignorer']];
    const TYPES = [['autosomal', 'Autosomal (atDNA) : tous les ancêtres récents'], ['y', 'ADN-Y : lignée paternelle directe'], ['mt', 'ADN mitochondrial : lignée maternelle directe'], ['x', 'ADN-X'], ['other', 'Autre']];
    const COMPANIES = ['AncestryDNA', '23andMe', 'MyHeritage DNA', 'FamilyTreeDNA', 'Living DNA', 'GEDmatch', 'Geneanet ADN', 'Nebula / séquençage complet', 'Labo médical', 'Autre'];
    const label = (list, k) => (list.find(x => x[0] === k) || ['', k || '—'])[1];

    /* ═════════ cM : Shared cM Project (valeurs approchées, v4, 2020) ═════════ */
    const SCP = [['Parent / enfant', 'P', 3485, 2376, 3720], ['Frère ou sœur', 'FS', 2613, 1613, 3488], ['Demi-frère ou demi-sœur', 'HS', 1759, 1160, 2436], ['Grand-parent / petit-enfant', 'GP', 1754, 984, 2462],
        ['Oncle, tante / neveu, nièce', 'AU', 1741, 1201, 2282], ['Arrière-grand-parent', 'GGP', 887, 485, 1486], ['Grand-oncle, grand-tante', 'GAU', 850, 330, 1467], ['Demi-oncle, demi-tante', 'HAU', 871, 492, 1315],
        ['Cousin germain (1C)', '1C', 866, 396, 1397], ['Demi-cousin germain', 'H1C', 449, 156, 979], ['Cousin germain, une génération d’écart (1C1R)', '1C1R', 433, 102, 980], ['Cousin germain, deux générations d’écart (1C2R)', '1C2R', 221, 33, 471],
        ['Demi-cousin germain, une génération d’écart', 'H1C1R', 224, 57, 530], ['Cousin issu de germain (2C)', '2C', 229, 41, 592], ['Demi-cousin issu de germain', 'H2C', 120, 9, 397], ['Cousin issu de germain, une génération d’écart (2C1R)', '2C1R', 122, 14, 353],
        ['Cousin issu de germain, deux générations d’écart (2C2R)', '2C2R', 71, 0, 261], ['Cousin au 3e degré (3C, issu d’issu de germain)', '3C', 73, 0, 234], ['Demi-cousin au 3e degré', 'H3C', 48, 0, 168], ['3C1R', '3C1R', 48, 0, 192],
        ['Cousin au 4e degré (4C)', '4C', 35, 0, 139], ['Cousin au 5e degré (5C)', '5C', 25, 0, 117], ['Cousin au 6e degré ou plus', '6C', 20, 0, 86]];
    /** les relations possibles pour un nombre de cM, de la plus probable à la moins probable (indicatif) */
    function guess(cm) {
        cm = num(cm); if (cm <= 0) return [];
        const sc = SCP.filter(r => cm >= r[3] * .9 && cm <= r[4] * 1.05).map(r => { const sd = Math.max(8, (r[4] - r[3]) / 4); return {r, w: Math.exp(-(((cm - r[2]) / sd) ** 2) / 2) + 1e-6}; });
        const tot = sc.reduce((a, x) => a + x.w, 0) || 1;
        return sc.map(x => ({name: x.r[0], code: x.r[1], avg: x.r[2], min: x.r[3], max: x.r[4], p: x.w / tot})).sort((a, b) => b.p - a.p);
    }
    const guessShort = cm => { const g = guess(cm).slice(0, 2); return g.map(x => `${x.code} ${Math.round(x.p * 100)} %`).join(' · '); };
    const pctOf = cm => num(cm) / (prefs().total || 6800) * 100;

    /* ═════════ La colonne de gauche ═════════ */
    const visibleSections = () => prefs().order.filter(k => !prefs().hidden.includes(k)).map(k => SECTIONS.find(s => s[0] === k)).filter(Boolean);
    ext.adn = {
        sidebar(content, footer) {
            const cur = S().adnTab || 'home';
            content.innerHTML = `<div class="side-menu">${visibleSections().map(([k, ic, l], i) => `<button class="side-menu-item ${cur === k ? 'is-active' : ''}" data-dna-go="${k}"><span class="side-number">${String(i + 1).padStart(2, '0')}</span>${ic} ${esc(l)}</button>`).join('')}</div>`;
            footer.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px"><button class="button small" data-dna-go="kits">＋ Nouveau test</button><button class="button small secondary" data-dna-go="matches">＋ Correspondances</button></div>';
        },
        async render(token) {
            const ws = A().$('#workspace'); const sec = S().adnTab || 'home';
            try { await load(); } catch (e) { ws.innerHTML = `<section class="page">${header('ADN', 'ADN', esc(e.message))}</section>`; return; }
            if (!isCurrent(token)) return;
            const banner = !prefs().ack && sec !== 'law' ? lawHtml(false) : '';
            const r = RENDER[sec] || RENDER.home;
            ws.innerHTML = `<section class="page h-dna-page" data-dna-sec="${esc(sec)}">${banner}${r.html()}</section>`;
            r.bind?.(ws.querySelector('.h-dna-page'));
        },
    };
    const go = sec => { S().adnTab = sec; A().setModule('adn'); };
    const refresh = async () => { await load(true); if (S().module === 'adn') A().setModule('adn'); };
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-dna-go]'); if (!b) return; e.preventDefault(); go(b.dataset.dnaGo); });

    /* petit graphique (les dessins de « Mes diagrammes ») */
    const chart = spec => ext.diagramRender ? `<div class="h-dna-chart">${ext.diagramRender.svg({...spec, o: {bg: 'transparent', ...(spec.o || {})}}, spec.width || 760)}</div>` : '';
    const RENDER = {};

    /* ═════════ 🏠 Synthèse ═════════ */
    RENDER.home = {html() {
        const {kits, matches, groups, segments} = data, p = prefs();
        const bySide = SIDES.slice(1).map(([k, l]) => [l, matches.filter(m => (m.side || 'unknown') === k).length, p.colors[k]]);
        const buckets = [[3000, '> 3000'], [1300, '1300–3000'], [600, '600–1300'], [250, '250–600'], [90, '90–250'], [40, '40–90'], [20, '20–40'], [0, '< 20']];
        const hist = buckets.map(([lo], i) => matches.filter(m => m.shared_cm >= lo && (i === 0 || m.shared_cm < buckets[i - 1][0])).length);
        const todo = matches.filter(m => m.status === 'todo').slice(0, 12);
        return `${header('ADN', '🧬 Synthèse', 'Tes tests, tes correspondances et où tu en es. Tout se règle dans « ⚙️ Réglages » (rubriques montrées, ordre, colonnes, couleurs).')}
            ${!kits.length ? `<section class="h-dna-empty"><h3>Commencer</h3><ol><li>Lis la <button type="button" class="link-button" data-dna-go="law">mise en garde sur la loi française</button>.</li><li>« 🧬 Mes tests » : ajoute le test d’une personne (société, type, haplogroupes, origines).</li><li>« 👥 Correspondances » : importe le fichier CSV de la société, ou ajoute-les à la main.</li><li>Le calculateur de cM, la méthode de Leeds et le navigateur de chromosomes t’aident à placer chacun dans l’arbre.</li></ol></section>` : ''}
            <div class="h-dna-stats">${[['Tests', kits.length, 'kits'], ['Correspondances', matches.length, 'matches'], ['Placées dans l’arbre', matches.filter(m => m.person_id || m.status === 'placed').length, 'matches'], ['Groupes', groups.length, 'groups'], ['Segments', segments.length, 'chromo'], ['À contacter', matches.filter(m => m.status === 'todo').length, 'matches']].map(([l, n, s]) => `<button type="button" class="h-dna-stat" data-dna-go="${s}"><strong>${fmt(n)}</strong><span>${esc(l)}</span></button>`).join('')}</div>
            <div class="h-dna-grid">${matches.length ? `<section class="card"><h3>Correspondances par nombre de cM</h3>${chart({kind: 'columns', series: [{name: 'Correspondances', color: '#4e79a7'}], rows: buckets.map(([, l], i) => ({label: l + ' cM', s0: hist[i]})), o: {height: 220}})}</section>
                <section class="card"><h3>Par côté</h3>${chart({kind: 'donut', series: [{name: 'Correspondances'}], rows: bySide.filter(x => x[1]).map(([l, n, c]) => ({label: l, s0: n, color: c})), o: {height: 260, legend: 'right'}})}</section>
                <section class="card"><h3>Les plus proches</h3><ol class="h-dna-top">${matches.slice(0, 10).map(m => `<li><button type="button" class="link-button" data-dna-match="${m.id}">${esc(m.name)}</button> — ${fmt(m.shared_cm, 1)} cM <small class="muted">${esc(guessShort(m.shared_cm))}</small></li>`).join('')}</ol></section>
                <section class="card"><h3>À contacter</h3>${todo.length ? `<ul>${todo.map(m => `<li><button type="button" class="link-button" data-dna-match="${m.id}">${esc(m.name)}</button> — ${fmt(m.shared_cm, 1)} cM</li>`).join('')}</ul>` : '<p class="muted">Personne : mets « À contacter » dans le suivi d’une correspondance.</p>'}</section>` : ''}
                ${kits.map(k => `<section class="card"><h3>🧬 ${esc(kitName(k))}</h3><p>${esc(label(TYPES, k.test_type))}${k.haplo_y ? `<br>ADN-Y : <b>${esc(k.haplo_y)}</b>` : ''}${k.haplo_mt ? `<br>ADNmt : <b>${esc(k.haplo_mt)}</b>` : ''}</p><p class="muted">${plural(matches.filter(m => m.kit_id === k.id).length, 'correspondance', 'correspondances')}</p></section>`).join('')}</div>`;
    }, bind: root => bindMatchLinks(root)};

    /* ═════════ ⚖️ Loi ═════════ */
    RENDER.law = {html: () => `${header('ADN', '⚖️ Loi et mises en garde', 'À lire avant d’utiliser cet onglet.')}${lawHtml(true)}
        <label class="checkbox-line h-dna-ack"><input type="checkbox" data-dna-ack ${prefs().ack ? 'checked' : ''}> J’ai lu cette mise en garde (elle ne s’affichera plus en haut des autres pages).</label>`,
    bind: root => root.querySelector('[data-dna-ack]').addEventListener('change', e => { const p = prefs(); p.ack = e.target.checked; savePrefs(p); toast(p.ack ? 'Noté.' : 'La mise en garde reviendra en haut des pages.'); })};

    /* ═════════ 🧬 Mes tests ═════════ */
    const ethText = list => (Array.isArray(list) ? list : []).map(e => `${e.region} ; ${e.percent}`).join('\n');
    const ethParse = t => String(t || '').split('\n').map(l => { const m = l.match(/^(.*?)[;:\t,]\s*([\d.,]+)\s*%?\s*$/); return m ? {region: m[1].trim(), percent: num(m[2])} : null; }).filter(e => e && e.region);
    function kitDialog(k = {}) {
        const d = k.data || {};
        ext.openDialog({eyebrow: 'ADN', title: k.id ? 'Modifier le test' : 'Nouveau test', wide: true, submitLabel: 'Enregistrer',
            body: `${!prefs().ack ? lawHtml(false) : ''}<div class="form-grid">
                <div><span class="pk-lab">Personne testée</span>${PKF({name: 'dna_person', kind: 'person', value: Number(k.person_id) || null})}</div>
                <label>Nom du test <small>(si la personne n’est pas dans l’arbre)</small><input name="label" value="${esc(k.label || '')}" maxlength="160"></label>
                <label>Société / origine<input name="company" list="dna-companies" value="${esc(k.company || '')}"><datalist id="dna-companies">${COMPANIES.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
                <label>Type<select name="test_type">${TYPES.map(([v, l]) => `<option value="${v}" ${(k.test_type || 'autosomal') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label>N° de kit<input name="kit_number" value="${esc(k.kit_number || '')}"></label><label>Date<input name="test_date" data-ui-date="nocal" value="${esc(k.test_date || '')}" placeholder="2024"></label>
                <label>Haplogroupe Y<input name="haplo_y" value="${esc(k.haplo_y || '')}" placeholder="R-M269, R-L21…"></label><label>Haplogroupe mitochondrial<input name="haplo_mt" value="${esc(k.haplo_mt || '')}" placeholder="H1, U5b…"></label>
                <label>Puce / version<input name="chip" value="${esc(d.chip || '')}" placeholder="GSA v3, OmniExpress…"></label><label>Géré par<input name="manager" value="${esc(d.manager || '')}"></label>
                <label>Kit GEDmatch<input name="gedmatch" value="${esc(d.gedmatch || '')}"></label><label>Fichier brut (où il est rangé)<input name="raw_file" value="${esc(d.raw_file || '')}"></label>
                <label class="span-2">Consentement, cadre <small>(qui a accepté quoi, cadre médical ou de recherche, pays…)</small><input name="consent" value="${esc(d.consent || '')}"></label>
                <label class="span-2">Origines estimées <small>(une ligne par région : « Bretagne ; 42 »)</small><textarea name="ethnicity" rows="5">${esc(ethText(d.ethnicity))}</textarea></label>
                <label>Marqueurs Y-STR<textarea name="y_str" rows="4" placeholder="DYS393=13, DYS390=24…">${esc(d.y_str || '')}</textarea></label><label>Mutations ADNmt<textarea name="mt_mutations" rows="4" placeholder="16519C, 263G…">${esc(d.mt_mutations || '')}</textarea></label>
                <label class="span-2">Notes<textarea name="notes" rows="3">${esc(d.notes || '')}</textarea></label></div>`,
            onOpen: () => {},
            onDelete: k.id ? async () => { if (!await A().confirmBox('Supprimer ce test, ses correspondances et ses segments ?', {title: 'Supprimer le test', okLabel: 'Supprimer le test'})) return false; await post('delete_dna_kit', {id: k.id}); toast('Test supprimé.'); await refresh(); } : undefined,
            onSubmit: async f => { const v = Object.fromEntries(new FormData(f));
                try { await post('save_dna_kit', {id: k.id || 0, person_id: Number(v.dna_person) || 0, label: v.label, company: v.company, test_type: v.test_type, kit_number: v.kit_number, test_date: v.test_date, haplo_y: v.haplo_y, haplo_mt: v.haplo_mt,
                    data: {ethnicity: ethParse(v.ethnicity), y_str: v.y_str, mt_mutations: v.mt_mutations, notes: v.notes, chip: v.chip, manager: v.manager, gedmatch: v.gedmatch, raw_file: v.raw_file, consent: v.consent}}); toast('Test enregistré.'); await refresh(); }
                catch (e) { toast(e.message, 'error'); return false; } }});
    }
    RENDER.kits = {html() {
        const {kits, matches} = data;
        return `${header('ADN', '🧬 Mes tests', 'Un test par personne et par société : type, haplogroupes, origines estimées, marqueurs.', '<button type="button" class="button" data-dna-newkit>＋ Nouveau test</button>')}
            <div class="h-dna-cards">${kits.map(k => `<article class="card h-dna-kit"><header><h3>${esc(kitName(k))}</h3><button type="button" class="icon-action" data-dna-kit="${k.id}" title="Modifier">✎</button></header>
                <p>${esc(label(TYPES, k.test_type))}${k.kit_number ? ` · n° ${esc(k.kit_number)}` : ''}${k.test_date ? ` · ${esc(k.test_date)}` : ''}</p>
                ${k.person_id ? `<p><button type="button" class="table-link" data-open-person="${k.person_id}">👤 ${esc(k.person_name)}</button></p>` : ''}
                ${k.haplo_y || k.haplo_mt ? `<p>${k.haplo_y ? `ADN-Y <b>${esc(k.haplo_y)}</b> ` : ''}${k.haplo_mt ? `ADNmt <b>${esc(k.haplo_mt)}</b>` : ''}</p>` : ''}
                ${k.data?.ethnicity?.length ? chart({kind: 'bars', width: 420, series: [{name: '%'}], rows: k.data.ethnicity.slice(0, 8).map(e => ({label: e.region, s0: e.percent})), o: {unit: '%'}}) : ''}
                <p class="muted">${plural(matches.filter(m => m.kit_id === k.id).length, 'correspondance', 'correspondances')} · <button type="button" class="link-button" data-dna-kitmatches="${k.id}">les voir</button></p></article>`).join('') || A().emptyState({icon: '🧬', text: 'Aucun test ADN pour l’instant', hint: 'Ajoute ton test (Ancestry, MyHeritage, 23andMe…) pour y ranger tes correspondances.', action: {label: '＋ Nouveau test', attrs: 'data-dna-newkit'}})}</div>`;
    }, bind(root) {
        root.querySelectorAll('[data-dna-newkit]').forEach(b => b.addEventListener('click', () => kitDialog()));
        root.querySelectorAll('[data-dna-kit]').forEach(b => b.addEventListener('click', () => kitDialog(kitById(b.dataset.dnaKit))));
        root.querySelectorAll('[data-dna-kitmatches]').forEach(b => b.addEventListener('click', () => { S().adnFilter = {...(S().adnFilter || {}), kit: Number(b.dataset.dnaKitmatches)}; go('matches'); }));
    }};

    /* ═════════ 👥 Correspondances ═════════ */
    const filt = () => S().adnFilter = S().adnFilter || {kit: 0, q: '', side: '', status: '', group: 0, min: '', max: '', sort: 'cm', dir: 'desc', shown: 0};
    function filtered() {
        const f = filt(), p = prefs(), words = String(f.q || '').toLowerCase().split(/\s+/).filter(Boolean);
        let l = data.matches.filter(m => (!f.kit || m.kit_id === Number(f.kit)) && (!f.side || (m.side || '') === f.side) && (!f.status || (m.status || '') === f.status) && (!f.group || m.groups.includes(Number(f.group)) || (f.group === -1 && !m.groups.length))
            && m.shared_cm >= Math.max(num(f.min), num(p.minCm)) && (!f.max || m.shared_cm <= num(f.max))
            && words.every(w => `${m.name} ${m.person_name} ${m.relationship} ${m.data?.surnames || ''} ${m.data?.places || ''} ${m.data?.notes || ''} ${m.data?.mrca || ''}`.toLowerCase().includes(w)));
        const key = {cm: m => m.shared_cm, name: m => m.name.toLowerCase(), segments: m => m.segments, longest: m => m.longest_cm, status: m => m.status, side: m => m.side, stars: m => num(m.data?.stars), updated: m => m.updated_at}[f.sort] || (m => m.shared_cm);
        return l.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * (f.dir === 'asc' ? 1 : -1); });
    }
    const cell = (k, m) => {
        if (k === 'name') return `<button type="button" class="link-button" data-dna-match="${m.id}">${esc(m.name)}</button>`;
        if (k === 'kit') return esc(kitName(kitById(m.kit_id)));
        if (k === 'cm') return `<b>${fmt(m.shared_cm, 1)}</b>`;
        if (k === 'pct') return `${fmt(pctOf(m.shared_cm), 2)} %`;
        if (k === 'segments') return m.segments ? fmt(m.segments) : '';
        if (k === 'longest') return m.longest_cm ? fmt(m.longest_cm, 1) : '';
        if (k === 'relationship') return esc(m.relationship);
        if (k === 'guess') return `<small>${esc(guessShort(m.shared_cm))}</small>`;
        if (k === 'side') return m.side ? `<span class="h-dna-side" style="--c:${color(prefs().colors[m.side])}">${esc(label(SIDES, m.side))}</span>` : '';
        if (k === 'groups') return m.groups.map(groupById).filter(Boolean).map(g => `<span class="h-dna-gchip" style="--c:${color(g.color)}" title="${esc(g.ancestor || '')}">${esc(g.name)}</span>`).join('');
        if (k === 'person') return m.person_id ? `<button type="button" class="table-link" data-open-person="${m.person_id}">${esc(m.person_name)}</button>` : '';
        if (k === 'mrca') return esc(m.data?.mrca || '');
        if (k === 'status') return esc(label(STATUSES, m.status) === '—' ? '' : label(STATUSES, m.status));
        if (k === 'tree') return m.data?.tree_url && /^https?:\/\//i.test(m.data.tree_url) ? `<a href="${esc(m.data.tree_url)}" target="_blank" rel="noopener noreferrer">🌳${m.data.tree_size ? ' ' + esc(m.data.tree_size) : ''}</a>` : esc(m.data?.tree_size || '');
        if (k === 'surnames') return `<small>${esc(String(m.data?.surnames || '').slice(0, 120))}</small>`;
        if (k === 'places') return `<small>${esc(String(m.data?.places || '').slice(0, 120))}</small>`;
        if (k === 'stars') return '★'.repeat(Math.max(0, Math.min(5, Math.round(num(m.data?.stars)))));
        if (k === 'notes') return `<small>${esc(String(m.data?.notes || '').slice(0, 120))}</small>`;
        return '';
    };
    RENDER.matches = {html() {
        const f = filt(), p = prefs(), list = filtered(), size = Math.max(50, num(p.pageSize) || 200), shown = list.slice(0, size + (f.shown || 0));
        const sel = (k, opts, v) => `<select data-dna-f="${k}">${opts.map(([a, b]) => `<option value="${esc(a)}" ${String(v ?? '') === String(a) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
        return `${header('ADN', '👥 Correspondances', `${fmt(list.length)} sur ${fmt(data.matches.length)}. Clic sur un nom : sa fiche (cM, ancêtre commun, arbre, suivi). Le calculateur propose la relation la plus probable.`,
            `<button type="button" class="button" data-dna-newmatch>＋ Correspondance</button><button type="button" class="button secondary" data-dna-import>⤒ Importer (CSV)</button><button type="button" class="button secondary" data-dna-export>⤓ Exporter en CSV</button><button type="button" class="button secondary" data-dna-cols>⚙ Colonnes</button>`)}
            ${!data.kits.length ? `<p class="h-dna-warn">Ajoute d’abord un test dans « 🧬 Mes tests » : les correspondances s’y rattachent.</p>` : ''}
            <div class="h-dna-filters">${sel('kit', [[0, 'Tous les tests'], ...data.kits.map(k => [k.id, kitName(k)])], f.kit)}<input type="search" data-dna-f="q" value="${esc(f.q || '')}" placeholder="Nom, nom de famille, lieu, note…">
                ${sel('side', [['', 'Tous les côtés'], ...SIDES.slice(1)], f.side)}${sel('status', [['', 'Tout suivi'], ...STATUSES.slice(1)], f.status)}${sel('group', [[0, 'Tous les groupes'], [-1, 'Sans groupe'], ...data.groups.map(g => [g.id, g.name])], f.group)}
                <input type="number" data-dna-f="min" value="${esc(f.min || '')}" placeholder="cM min" min="0"><input type="number" data-dna-f="max" value="${esc(f.max || '')}" placeholder="cM max" min="0">
</div>
            <div class="h-dna-bulk" hidden><span data-dna-nsel></span>${sel('bside', [['', 'Côté…'], ...SIDES.slice(1)], '')}${sel('bstatus', [['', 'Suivi…'], ...STATUSES.slice(1)], '')}${sel('bgroup', [[0, 'Ajouter au groupe…'], ...data.groups.map(g => [g.id, g.name])], 0)}${sel('bungroup', [[0, 'Retirer du groupe…'], ...data.groups.map(g => [g.id, g.name])], 0)}<button type="button" class="button small danger" data-dna-bdel>Supprimer</button></div>
            <div data-dna-sortbar></div><div class="data-table-wrap"><table class="data-table h-dna-table"><thead><tr><th><input type="checkbox" data-dna-all title="Tout cocher"></th>${p.columns.map(k => `<th>${esc(label(COLUMNS, k))}</th>`).join('')}</tr></thead>
            <tbody>${shown.map(m => `<tr data-id="${m.id}"><td><input type="checkbox" data-dna-chk="${m.id}"></td>${p.columns.map(k => `<td class="c-${k}">${cell(k, m)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${p.columns.length + 1}">${A().empty('Aucune correspondance pour ces filtres.')}</td></tr>`}</tbody></table></div>
            <div data-dna-morebox data-rest="${list.length - shown.length}" data-step="${size}"></div>`;
    }, bind(root) {
        const f = filt();
        root.querySelectorAll('[data-dna-f]:not([data-dna-f="q"])').forEach(el => el.addEventListener('change', () => { const k = el.dataset.dnaF;
            if (['bside', 'bstatus', 'bgroup', 'bungroup'].includes(k)) return bulk(root, k, el.value);
            f[k] = el.type === 'number' ? el.value : ['kit', 'group'].includes(k) ? Number(el.value) : el.value; f.shown = 0; go('matches'); }));
        root.querySelector('[data-dna-f="q"]').addEventListener('input', e => { clearTimeout(root._t); root._t = setTimeout(() => { f.q = e.target.value; f.shown = 0; go('matches'); setTimeout(() => { const i = A().$('#workspace [data-dna-f="q"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 50); }, 350); });
        // C6 : « N correspondances · Trier : [menu] » et « Voir les N suivantes ↓ »
        const UI = window.LCNDA_UI;
        if (UI?.sortBar) {
            const SORT_OPTS = [['cm:desc', 'cM : les plus nombreux'], ['cm:asc', 'cM : les moins nombreux'], ['name:asc', 'Nom : A → Z'], ['name:desc', 'Nom : Z → A'], ['segments:desc', 'Segments : les plus nombreux'], ['longest:desc', 'Plus long segment'], ['side:asc', 'Côté'], ['status:asc', 'Suivi'], ['stars:desc', 'Étoiles'], ['updated:desc', 'Les plus récemment modifiées'], ['updated:asc', 'Les plus anciennement modifiées']];
            const cur = `${f.sort || 'cm'}:${f.dir || 'desc'}`;
            const bar = UI.sortBar({count: filtered().length, label: 'correspondance', feminine: true, value: cur, options: SORT_OPTS.some(o => o[0] === cur) ? SORT_OPTS : [...SORT_OPTS, [cur, cur]],
                onChange: v => { const [k, d] = v.split(':'); f.sort = k; f.dir = d; f.shown = 0; go('matches'); }});
            root.querySelector('[data-dna-sortbar]')?.replaceWith(bar);
        }
        const mb = root.querySelector('[data-dna-morebox]');
        if (mb && Number(mb.dataset.rest) > 0) { const step = Number(mb.dataset.step) || 200, onMore = () => { f.shown = (f.shown || 0) + step; go('matches'); };
            mb.appendChild(UI?.moreButton ? UI.moreButton({remaining: Number(mb.dataset.rest), step, feminine: true, onClick: onMore}) : Object.assign(document.createElement('button'), {type: 'button', className: 'button secondary', textContent: 'Afficher la suite', onclick: onMore})); }
        root.querySelector('[data-dna-newmatch]').addEventListener('click', () => matchDialog({kit_id: f.kit || data.kits[0]?.id}));
        root.querySelector('[data-dna-import]').addEventListener('click', () => importDialog());
        root.querySelector('[data-dna-export]').addEventListener('click', () => exportCsv(filtered()));
        root.querySelector('[data-dna-cols]').addEventListener('click', () => go('settings'));
        const upd = () => { const n = root.querySelectorAll('[data-dna-chk]:checked').length; root.querySelector('.h-dna-bulk').hidden = !n; root.querySelector('[data-dna-nsel]').textContent = `${plural(n, 'cochée', 'cochées')} :`; };
        root.addEventListener('change', e => { if (e.target.matches('[data-dna-all]')) root.querySelectorAll('[data-dna-chk]').forEach(c => { c.checked = e.target.checked; }); if (e.target.matches('[data-dna-chk], [data-dna-all]')) upd(); });
        root.querySelector('[data-dna-bdel]').addEventListener('click', () => bulk(root, 'delete', 1));
        bindMatchLinks(root);
    }};
    async function bulk(root, k, v) {
        const ids = [...root.querySelectorAll('[data-dna-chk]:checked')].map(c => Number(c.dataset.dnaChk)); if (!ids.length || !v || v === '0') return;
        const body = {ids}; if (k === 'bside') body.side = v; if (k === 'bstatus') body.status = v; if (k === 'bgroup') body.add_group = Number(v); if (k === 'bungroup') body.remove_group = Number(v);
        if (k === 'delete') { if (!await A().confirmBox(ids.length > 1 ? `Supprimer ${ids.length} correspondances et leurs segments ?` : 'Supprimer cette correspondance et ses segments ?', {title: 'Supprimer les correspondances', okLabel: 'Supprimer'})) return; body.delete = 1; }
        try { await post('bulk_dna_matches', body); toast('Fait.'); await refresh(); } catch (e) { toast(e.message, 'error'); }
    }
    function bindMatchLinks(root) { root.querySelectorAll('[data-dna-match]').forEach(b => b.addEventListener('click', () => { const m = data.matches.find(x => x.id === Number(b.dataset.dnaMatch)); if (m) matchDialog(m); })); }
    function matchDialog(m = {}) {
        const d = m.data || {};
        if (!data.kits.length) { toast('Ajoute d’abord un test (« 🧬 Mes tests »).', 'error'); return go('kits'); }
        ext.openDialog({eyebrow: 'ADN · CORRESPONDANCE', title: m.id ? m.name : 'Nouvelle correspondance', wide: true, submitLabel: 'Enregistrer',
            body: `<div class="form-grid">
                <label>Nom (tel que sur le site)<input name="name" required value="${esc(m.name || '')}" maxlength="200"></label>
                <label>Test<select name="kit_id">${data.kits.map(k => `<option value="${k.id}" ${Number(m.kit_id) === k.id ? 'selected' : ''}>${esc(kitName(k))}</option>`).join('')}</select></label>
                <label><span data-help="Le centiMorgan (cM) mesure l’ADN que vous avez en commun : environ 3 400 cM avec un parent, 850 avec un cousin germain, 200 avec un cousin issu de germain. Recopie le chiffre donné par le site du test." data-help-faq="ADN">cM partagés</span><input name="shared_cm" inputmode="decimal" value="${esc(m.shared_cm || '')}" data-dna-cm></label><label>Segments<input name="segments" inputmode="numeric" value="${esc(m.segments || '')}"></label>
                <label><span data-help="Un long morceau d’ADN en commun (plus de 20 cM) montre souvent une parenté proche et sûre ; beaucoup de petits morceaux peuvent venir d’ancêtres très anciens." data-help-faq="ADN">Plus long segment</span><input data-unit="cM" name="longest_cm" inputmode="decimal" value="${esc(m.longest_cm || '')}"></label><label>cM sur le X<input name="x_cm" inputmode="decimal" value="${esc(d.x_cm || '')}"></label>
                <div class="span-2 h-dna-guess" data-dna-guess></div>
                <label>Relation proposée par la société<input name="relationship" value="${esc(m.relationship || '')}"></label><label>Côté<select name="side">${SIDES.map(([v, l]) => `<option value="${v}" ${(m.side || '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <div><span class="pk-lab">Fiche dans l’arbre</span>${PKF({name: 'dna_mperson', kind: 'person', value: Number(m.person_id) || null, placeholder: 'Si tu sais qui c’est…'})}</div>
                <label>Ancêtre(s) commun(s) (MRCA)<input name="mrca" value="${esc(d.mrca || '')}" placeholder="Jean Martin et Marie Durand"></label>
                <label>Suivi<select name="status">${STATUSES.map(([v, l]) => `<option value="${v}" ${(m.status || '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><label>Étoiles (0 à 5)<input name="stars" type="number" min="0" max="5" value="${esc(d.stars || '')}"></label>
                <div class="span-2"><span class="section-label">Groupes</span><div class="h-dna-gpick">${data.groups.map(g => `<label class="checkbox-line"><input type="checkbox" name="g_${g.id}" ${(m.groups || []).includes(g.id) ? 'checked' : ''}> <span class="h-dna-gchip" style="--c:${color(g.color)}">${esc(g.name)}</span></label>`).join('') || '<small class="empty-line"><span class="empty-line-ico" aria-hidden="true">🧬</span><span class="empty-line-text">Aucun groupe (« 🗂️ Groupes »).</span></small>'}</div></div>
                <label>Noms de famille en commun<input name="surnames" value="${esc(d.surnames || '')}"></label><label>Lieux en commun<input name="places" value="${esc(d.places || '')}"></label>
                <label>Arbre en ligne (adresse)<input name="tree_url" value="${esc(d.tree_url || '')}" placeholder="https://…"></label><label>Taille de son arbre<input name="tree_size" value="${esc(d.tree_size || '')}"></label>
                <label>Contact<input name="contact" value="${esc(d.contact || '')}"></label><label>Pays<input name="country" value="${esc(d.country || '')}"></label>
                <label class="span-2">Correspondances en commun <small>(une par ligne ou séparées par ; — sert à la méthode de Leeds)</small><textarea name="shared_matches" rows="3">${esc((d.shared_matches || []).join('\n'))}</textarea></label>
                <label class="span-2">Notes<textarea name="notes" rows="3">${esc(d.notes || '')}</textarea></label></div>`,
            onOpen: dlg => { const box = dlg.querySelector('[data-dna-guess]'), inp = dlg.querySelector('[data-dna-cm]');
                const paint = () => { const g = guess(inp.value); box.innerHTML = g.length ? `<b>Relation probable (${fmt(num(inp.value), 1)} cM, ${fmt(pctOf(inp.value), 2)} %)</b> : ${g.slice(0, 5).map(x => `${esc(x.name)} <small>${Math.round(x.p * 100)} %</small>`).join(' · ')}` : '<small class="muted">Tape les cM partagés : la relation probable s’affiche ici.</small>'; };
                inp.addEventListener('input', paint); paint(); },
            onDelete: m.id ? async () => { if (!await A().confirmBox(`Supprimer « ${m.name} » ?`, {title: 'Supprimer la correspondance', okLabel: 'Supprimer la correspondance'})) return false; await post('delete_dna_match', {id: m.id}); toast('Supprimée.'); await refresh(); } : undefined,
            onSubmit: async f => { const v = Object.fromEntries(new FormData(f));
                try { await post('save_dna_match', {id: m.id || 0, kit_id: Number(v.kit_id), name: v.name, shared_cm: v.shared_cm, segments: v.segments, longest_cm: v.longest_cm, relationship: v.relationship, side: v.side, status: v.status,
                    person_id: Number(v.dna_mperson) || 0, groups: data.groups.filter(g => v['g_' + g.id]).map(g => g.id),
                    data: {...d, x_cm: v.x_cm, mrca: v.mrca, stars: v.stars, surnames: v.surnames, places: v.places, tree_url: v.tree_url, tree_size: v.tree_size, contact: v.contact, country: v.country, shared_matches: v.shared_matches, notes: v.notes}});
                    toast('Correspondance enregistrée.'); await refresh(); } catch (e) { toast(e.message, 'error'); return false; } }});
    }
    /* import CSV : les colonnes des sociétés reconnues toutes seules, modifiables */
    const FIELDS = [['name', 'Nom', ['name', 'match name', 'display name', 'full name', 'nom', 'match', 'username', 'matchname', 'display_name', 'nom du match']], ['shared_cm', 'cM partagés', ['shared cm', 'shared dna', 'total cm', 'cm', 'sharedcentimorgans', 'total shared cm', 'shared centimorgans', 'centimorgans', 'total_cm', 'adn partagé', 'cm partagés', 'shared_cm']],
        ['segments', 'Segments', ['shared segments', 'segments', 'number of segments', '# segments', 'nombre de segments', 'shared_segments', 'num segments']], ['longest_cm', 'Plus long segment', ['longest segment', 'largest segment', 'longest block', 'longest cm', 'plus long segment', 'largest_segment', 'longest_segment']],
        ['relationship', 'Relation proposée', ['relationship', 'predicted relationship', 'estimated relationship', 'relationship range', 'suggested relationship', 'relation estimée', 'relationship_range', 'relation']], ['side', 'Côté', ['side', 'maternal/paternal', 'branche', 'parent', 'côté', 'paternal/maternal']],
        ['shared_matches', 'Correspondances en commun', ['shared matches', 'in common with', 'icw', 'matches en commun']], ['surnames', 'Noms de famille', ['ancestral surnames', 'surnames', 'noms', 'noms de famille', 'shared surnames']], ['places', 'Lieux', ['places', 'locations', 'lieux']],
        ['tree_size', 'Taille de l’arbre', ['tree size', 'family tree size', 'people in tree', 'arbre']], ['tree_url', 'Arbre (adresse)', ['tree url', 'tree link', 'linked tree']], ['contact', 'Contact', ['email', 'contact', 'e-mail']], ['x_cm', 'cM sur le X', ['x-match', 'x cm', 'x shared', 'x-dna']], ['country', 'Pays', ['country', 'pays', 'location']], ['notes', 'Notes', ['notes', 'note', 'comments']]];
    const normH = h => String(h || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_\s]+/g, ' ').trim();
    const autoMap = (head, fields) => Object.fromEntries(fields.map(([k, , al]) => { const i = head.findIndex(h => al.map(normH).includes(normH(h))); const j = i >= 0 ? i : head.findIndex(h => al.some(a => normH(h).includes(normH(a)) && normH(a).length > 3)); return [k, j]; }));
    const sideOf = v => { const t = normH(v); return /mat|mere|mother/.test(t) && /pat|pere|father/.test(t) ? 'both' : /mat|mere|mother/.test(t) ? 'maternal' : /pat|pere|father/.test(t) ? 'paternal' : /both|deux/.test(t) ? 'both' : ''; };
    const parseCsv = t => ext.diagramsInternals?.parseTable ? ext.diagramsInternals.parseTable(t) : String(t).split(/\r?\n/).map(l => l.split(/[;,\t]/));
    function mapDialog({title, fields, head, rows, intro, extra = '', onGo}) {
        const map = autoMap(head, fields);
        ext.openDialog({eyebrow: 'ADN · IMPORT', title, wide: true, submitLabel: `Importer ${plural(rows.length, 'ligne', 'lignes')}`,
            body: `<p class="muted">${intro}</p>${extra}<div class="h-dna-map">${fields.map(([k, l]) => `<label>${esc(l)}<select name="m_${k}"><option value="-1">— ne pas prendre —</option>${head.map((h, i) => `<option value="${i}" ${map[k] === i ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></label>`).join('')}</div>
                <p class="muted">Aperçu : ${esc(rows.slice(0, 3).map(r => r.slice(0, 6).join(' | ')).join(' ⏎ '))}</p>`,
            onSubmit: async f => { const m = Object.fromEntries(fields.map(([k]) => [k, Number(f.querySelector(`[name=m_${k}]`).value)])); return onGo(m, f); }});
    }
    async function importDialog() {
        if (!data.kits.length) { toast('Ajoute d’abord un test (« 🧬 Mes tests »).', 'error'); return go('kits'); }
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.csv,.tsv,.txt,text/csv';
        input.onchange = async () => { const file = input.files?.[0]; if (!file) return; if (file.size > 40e6) return toast('Fichier trop gros (40 Mo au plus).', 'error');
            const all = parseCsv(await file.text()).filter(r => r.some(c => String(c).trim())); if (all.length < 2) return toast('Fichier vide ou illisible.', 'error');
            const head = all[0], rows = all.slice(1);
            mapDialog({title: `Importer « ${file.name} »`, fields: FIELDS, head, rows, intro: 'Choisis le test, puis vérifie à quelle colonne correspond chaque information (elles sont devinées pour Ancestry, 23andMe, MyHeritage, FamilyTreeDNA, GEDmatch). Une correspondance déjà présente (même nom, même test) est mise à jour : tes notes, groupes, suivi et fiche liée sont gardés.',
                extra: `<label>Test<select name="kit">${data.kits.map(k => `<option value="${k.id}" ${filt().kit === k.id ? 'selected' : ''}>${esc(kitName(k))}</option>`).join('')}</select></label>`,
                onGo: async (m, f) => {
                    const get = (r, k) => m[k] >= 0 ? String(r[m[k]] ?? '').trim() : '';
                    if (m.name < 0) return window.LCNDA_UI.fail('[name=m_name]', 'Choisis au moins la colonne du nom.');
                    const out = rows.map(r => ({name: get(r, 'name'), shared_cm: num(get(r, 'shared_cm')), segments: Math.round(num(get(r, 'segments'))), longest_cm: num(get(r, 'longest_cm')), relationship: get(r, 'relationship'), side: sideOf(get(r, 'side')),
                        data: Object.fromEntries(['shared_matches', 'surnames', 'places', 'tree_size', 'tree_url', 'contact', 'x_cm', 'country', 'notes'].map(k => [k, get(r, k)]).filter(([, v]) => v !== ''))})).filter(r => r.name);
                    try { let added = 0, updated = 0; for (let i = 0; i < out.length; i += 3000) { const res = await post('import_dna_matches', {kit_id: Number(f.querySelector('[name=kit]').value), rows: out.slice(i, i + 3000)}); added += res.result?.added || 0; updated += res.result?.updated || 0; }
                        toast(`${plural(added, 'ajoutée', 'ajoutées')}, ${plural(updated, 'mise', 'mises')} à jour.`); await refresh(); } catch (e) { toast(e.message, 'error'); return false; }
                }});
        };
        input.click();
    }
    function exportCsv(list) {
        const q = v => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
        const lines = [['Nom', 'Test', 'cM', 'Segments', 'Plus long segment', 'Relation (société)', 'Relation probable', 'Côté', 'Groupes', 'Fiche liée', 'Ancêtre commun', 'Suivi', 'Noms en commun', 'Lieux', 'Notes'].join(';'),
            ...list.map(m => [m.name, kitName(kitById(m.kit_id)), fmt(m.shared_cm, 1), m.segments, fmt(m.longest_cm, 1), m.relationship, guessShort(m.shared_cm), label(SIDES, m.side), m.groups.map(groupById).filter(Boolean).map(g => g.name).join(', '), m.person_name, m.data?.mrca, label(STATUSES, m.status), m.data?.surnames, m.data?.places, m.data?.notes].map(q).join(';'))];
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], {type: 'text/csv;charset=utf-8'})); a.download = 'correspondances-adn.csv'; document.body.appendChild(a); a.click(); a.remove();
    }

    /* ═════════ 🗂️ Groupes et méthode de Leeds ═════════ */
    const PALETTE = ['#4e79a7', '#e15759', '#59a14f', '#f28e2b', '#b07aa1', '#76b7b2', '#edc948', '#ff9da7', '#9c755f', '#bab0ac', '#1f77b4', '#d62728'];
    function leeds(kitId) {
        const p = prefs(), lo = num(p.leedsMin) || 90, hi = num(p.leedsMax) || 400;
        const pool = data.matches.filter(m => (!kitId || m.kit_id === kitId) && m.shared_cm >= lo && m.shared_cm <= hi).sort((a, b) => b.shared_cm - a.shared_cm);
        const byName = new Map(pool.map(m => [m.name.toLowerCase(), m])), clusters = [], placed = new Map();
        for (const m of pool) {
            if (placed.has(m.id)) continue;
            const shared = (m.data?.shared_matches || []).map(n => byName.get(String(n).toLowerCase())).filter(Boolean);
            if (!shared.length) continue;
            const c = {seed: m, members: [m, ...shared.filter(x => !placed.has(x.id))]};
            c.members.forEach(x => placed.set(x.id, clusters.length)); clusters.push(c);
            if (clusters.length >= 12) break;
        }
        // une correspondance déjà dans un groupe et partagée avec un autre : elle compte dans les deux (souvent un couple d'ancêtres)
        const grid = pool.map(m => ({m, cols: clusters.map(c => c.members.includes(m) ? 2 : (m.data?.shared_matches || []).some(n => c.members.some(x => x.name.toLowerCase() === String(n).toLowerCase())) ? 1 : 0)}));
        return {clusters, grid, lo, hi, missing: pool.filter(m => !(m.data?.shared_matches || []).length).length, pool: pool.length};
    }
    function groupDialog(g = {}) {
        ext.openDialog({eyebrow: 'ADN', title: g.id ? 'Modifier le groupe' : 'Nouveau groupe', submitLabel: 'Enregistrer',
            body: `<label>Nom<input name="name" required value="${esc(g.name || '')}" placeholder="Branche Martin (Bretagne)"></label><label>Couleur<input type="color" name="color" value="${esc(color(g.color || PALETTE[data.groups.length % PALETTE.length]))}"></label>
                <label>Côté<select name="side">${SIDES.map(([v, l]) => `<option value="${v}" ${(g.side || '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><label>Couple d’ancêtres supposé<input name="ancestor" value="${esc(g.ancestor || '')}"></label><label>Notes<textarea name="notes" rows="3">${esc(g.notes || '')}</textarea></label>`,
            onDelete: g.id ? async () => { if (!await A().confirmBox(`Supprimer le groupe « ${g.name} » ? (les correspondances restent)`, {title: 'Supprimer le groupe', okLabel: 'Supprimer le groupe'})) return false; await post('delete_dna_group', {id: g.id}); await refresh(); } : undefined,
            onSubmit: async f => { const v = Object.fromEntries(new FormData(f)); try { await post('save_dna_group', {id: g.id || 0, ...v}); await refresh(); } catch (e) { toast(e.message, 'error'); return false; } }});
    }
    RENDER.groups = {html() {
        const kit = Number(filt().kit) || 0, L = leeds(kit);
        return `${header('ADN', '🗂️ Groupes et méthode de Leeds', 'Range tes correspondances par branche. La méthode de Leeds regroupe les cousins de 2e et 3e degré (≈ 90 à 400 cM) qui se correspondent entre eux : chaque groupe pointe souvent vers un de tes 8 arrière-grands-parents… à condition d’avoir noté leurs « correspondances en commun ».', '<button type="button" class="button" data-dna-newgroup>＋ Nouveau groupe</button>')}
            <div class="h-dna-cards">${data.groups.map(g => `<article class="card h-dna-group" style="--c:${color(g.color)}"><header><h3><span class="h-dna-gchip" style="--c:${color(g.color)}">${esc(g.name)}</span></h3><button type="button" class="icon-action" data-dna-group="${g.id}">✎</button></header>
                <p>${esc(label(SIDES, g.side))}${g.ancestor ? ` · ${esc(g.ancestor)}` : ''}</p><p class="muted">${plural(data.matches.filter(m => m.groups.includes(g.id)).length, 'correspondance', 'correspondances')} · <button type="button" class="link-button" data-dna-gmatches="${g.id}">les voir</button></p>${g.notes ? `<p><small>${esc(g.notes)}</small></p>` : ''}</article>`).join('') || A().emptyState({icon: '🗂️', text: 'Aucun groupe pour l’instant', hint: 'Un groupe range ensemble les correspondances d’une même branche.', action: {label: '＋ Nouveau groupe', attrs: 'data-dna-newgroup'}})}</div>
            <h3>Méthode de Leeds automatique</h3>
            <p class="muted">${plural(L.pool, 'correspondance', 'correspondances')} entre ${L.lo} et ${L.hi} cM${kit ? ' pour ce test' : ''} (bornes dans ⚙️ Réglages)${L.missing ? ` ; ${fmt(L.missing)} sans « correspondances en commun » notées, donc ignorées` : ''}.</p>
            ${L.clusters.length ? `<div class="data-table-wrap"><table class="data-table h-dna-leeds"><thead><tr><th>Correspondance</th><th>cM</th>${L.clusters.map((c, i) => `<th style="background:${PALETTE[i % PALETTE.length]};color:#fff">${i + 1}</th>`).join('')}</tr></thead><tbody>
                ${L.grid.filter(r => r.cols.some(Boolean)).map(r => `<tr><td><button type="button" class="link-button" data-dna-match="${r.m.id}">${esc(r.m.name)}</button></td><td>${fmt(r.m.shared_cm, 0)}</td>${r.cols.map((v, i) => `<td style="${v ? `background:${PALETTE[i % PALETTE.length]};opacity:${v === 2 ? 1 : .45}` : ''}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>
                <p><button type="button" class="button" data-dna-leedsmake>Créer ${plural(L.clusters.length, 'groupe', 'groupes')} avec ces couleurs</button></p>` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🧬</span><span class="empty-line-text">Pas encore de groupe trouvé : ouvre tes correspondances proches et remplis « Correspondances en commun » (ou importe une colonne « Shared matches »).</span></p>'}`;
    }, bind(root) {
        bindMatchLinks(root);
        root.querySelectorAll('[data-dna-newgroup]').forEach(b => b.addEventListener('click', () => groupDialog()));
        root.querySelectorAll('[data-dna-group]').forEach(b => b.addEventListener('click', () => groupDialog(groupById(b.dataset.dnaGroup))));
        root.querySelectorAll('[data-dna-gmatches]').forEach(b => b.addEventListener('click', () => { filt().group = Number(b.dataset.dnaGmatches); go('matches'); }));
        root.querySelector('[data-dna-leedsmake]')?.addEventListener('click', async () => { const L = leeds(Number(filt().kit) || 0);
            try { for (const [i, c] of L.clusters.entries()) { const name = `Leeds ${i + 1} (${c.seed.name})`, old = data.groups.find(g => g.name === name); const gid = old ? old.id : (await post('save_dna_group', {name, color: PALETTE[i % PALETTE.length], notes: `Créé par la méthode de Leeds autour de ${c.seed.name} (${fmt(c.seed.shared_cm)} cM).`})).result.id; await post('bulk_dna_matches', {ids: c.members.map(m => m.id), add_group: gid}); }
                toast(`${plural(L.clusters.length, 'groupe créé', 'groupes créés')}.`); await refresh(); } catch (e) { toast(e.message, 'error'); } });
    }};

    /* ═════════ 🔗 Groupes automatiques (façon « AutoCluster ») ═════════
     * Un graphe : deux correspondances sont liées si l'une figure dans les « correspondances en commun » de l'autre, ou si
     * leurs segments se chevauchent (≥ 7 cM) sur le même chromosome. Les grappes sortent d'une propagation d'étiquettes
     * pondérée (stable, sans hasard). Chaque grappe pointe en général vers un couple d'ancêtres : on le devine par les
     * correspondances déjà placées dans l'arbre, les noms et les lieux en commun, et le côté. */
    let tree = null, treeKit = 0;
    const loadTree = async kit => { if (!kit) return null; if (treeKit !== kit || !tree) { tree = await api('dna_tree', {kit, gen: 8}).catch(() => null); treeKit = kit; } return tree; };
    const words = v => String(Array.isArray(v) ? v.join(';') : v || '').split(/[;,\n/]+/).map(x => x.trim()).filter(Boolean);
    const normW = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
    const genOf = s => Math.floor(Math.log2(s));
    const GEN_NAMES = ['vous', 'parents', 'grands-parents', 'arrière-grands-parents', 'arrière-arrière-grands-parents (4e génération)', '5e génération', '6e génération', '7e génération', '8e génération'];
    const coupleSide = s => { const g = genOf(s); return g < 1 ? '' : s < (1 << g) * 1.5 ? 'paternal' : 'maternal'; };
    const coupleLabel = (s, t) => { const a = t?.ancestors?.find(x => x.sosa === s), b = t?.ancestors?.find(x => x.sosa === s + 1); return `Sosa ${s}-${s + 1} : ${a ? a.name : 'inconnu'} & ${b ? b.name : 'inconnue'}`; };
    function autoClusters(kitId, t) {
        const p = prefs(), lo = num(p.autoMin) || 30, hi = num(p.autoMax) || 600;
        const pool = data.matches.filter(m => (!kitId || m.kit_id === kitId) && m.shared_cm >= lo && m.shared_cm <= hi).sort((a, b) => b.shared_cm - a.shared_cm).slice(0, 400);
        const idx = new Map(pool.map((m, i) => [m.id, i])), byName = new Map(pool.map((m, i) => [m.name.toLowerCase(), i]));
        const W = pool.map(() => new Map()), link = (i, j, w) => { if (i === j || i === undefined || j === undefined) return; W[i].set(j, (W[i].get(j) || 0) + w); W[j].set(i, (W[j].get(i) || 0) + w); };
        pool.forEach((m, i) => (m.data?.shared_matches || []).forEach(n => link(i, byName.get(String(n).toLowerCase()), 1)));
        let segLinks = 0;
        overlaps(data.segments.filter(s => (!kitId || s.kit_id === kitId) && s.match_id)).forEach(o => { const a = idx.get(o.s1.match_id), b = idx.get(o.s2.match_id); if (a !== undefined && b !== undefined && Math.min(num(o.s1.cm) || 99, num(o.s2.cm) || 99) >= 7) { link(a, b, 1.5); segLinks++; } });
        // propagation d'étiquettes : chacun prend l'étiquette la plus lourde de ses voisins (les plus proches d'abord)
        const lab = pool.map((_, i) => i);
        for (let it = 0; it < 25; it++) { let moved = 0;
            pool.forEach((_, i) => { if (!W[i].size) return; const sc = new Map(); W[i].forEach((w, j) => sc.set(lab[j], (sc.get(lab[j]) || 0) + w)); let best = lab[i], bw = (sc.get(lab[i]) || 0) + .01; sc.forEach((w, l) => { if (w > bw || (w === bw && l < best)) { best = l; bw = w; } }); if (best !== lab[i]) { lab[i] = best; moved++; } });
            if (!moved) break; }
        const groups = new Map(); pool.forEach((m, i) => { if (!W[i].size) return; if (!groups.has(lab[i])) groups.set(lab[i], []); groups.get(lab[i]).push(i); });
        const clusters = [...groups.values()].filter(g => g.length >= 2).sort((a, b) => b.length - a.length || pool[a[0]].shared_cm - pool[b[0]].shared_cm).slice(0, 24).map((g, k) => {
            const members = g.map(i => pool[i]).sort((a, b) => b.shared_cm - a.shared_cm);
            const count = list => { const c = new Map(); list.forEach(x => { const k2 = normW(x); if (k2.length > 2) c.set(k2, {w: x, n: (c.get(k2)?.n || 0) + 1}); }); return [...c.values()].filter(x => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 6); };
            const surnames = count(members.flatMap(m => words(m.data?.surnames))), places = count(members.flatMap(m => words(m.data?.places)));
            const sides = members.map(m => m.side).filter(s => s === 'paternal' || s === 'maternal'), side = sides.length ? (sides.filter(s => s === 'paternal').length >= sides.length / 2 ? 'paternal' : 'maternal') : '';
            // l'ancêtre commun : les correspondances déjà placées dans l'arbre, sinon les noms de famille de l'arbre
            const votes = new Map(); members.forEach(m => (t?.linked?.[m.id] || []).forEach(f => { const c = f.sosa - (f.sosa % 2); votes.set(c, (votes.get(c) || 0) + 3); }));
            if (t?.ancestors && surnames.length) t.ancestors.forEach(a => { const hit = surnames.find(s => normW(s.w) === normW(a.last)); if (hit && a.sosa >= 4) { const c = a.sosa - (a.sosa % 2); if (!side || coupleSide(c) === side) votes.set(c, (votes.get(c) || 0) + hit.n / (1 + genOf(c) / 4)); } });
            const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
            const internal = g.reduce((a, i) => a + [...W[i].keys()].filter(j => g.includes(j)).length, 0) / 2, possible = g.length * (g.length - 1) / 2;
            return {k, members, idx: g, surnames, places, side: side || (top ? coupleSide(top[0]) : ''), couple: top ? top[0] : 0, sure: top && members.some(m => t?.linked?.[m.id]), density: possible ? internal / possible : 0, color: PALETTE[k % PALETTE.length]};
        });
        const order = [...clusters.flatMap(c => c.idx)];
        return {pool, W, clusters, order, lo, hi, segLinks, withShared: pool.filter(m => (m.data?.shared_matches || []).length).length};
    }
    function clusterMatrix(A2) {
        const n = A2.order.length; if (!n) return '';
        const cell = n > 60 ? 7 : n > 30 ? 10 : 14, lab = 170, size = n * cell, cl = new Map(); A2.clusters.forEach(c => c.idx.forEach(i => cl.set(i, c)));
        let rects = '';
        A2.order.forEach((i, r) => A2.order.forEach((j, c) => { if (i === j) { rects += `<rect x="${lab + c * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="${cl.get(i).color}"/>`; return; } if (!A2.W[i].has(j)) return; const same = cl.get(i) === cl.get(j); rects += `<rect x="${lab + c * cell}" y="${r * cell}" width="${cell - .5}" height="${cell - .5}" fill="${same ? cl.get(i).color : '#9aa0a6'}" opacity="${same ? .9 : .45}"/>`; }));
        const names = A2.order.map((i, r) => `<text x="${lab - 4}" y="${r * cell + cell * .78}" font-size="${Math.min(11, cell - 1)}" text-anchor="end">${esc(A2.pool[i].name.slice(0, 26))}</text>`).join('');
        return `<div class="h-dna-matrix"><svg viewBox="0 0 ${lab + size + 2} ${size + 2}" width="${lab + size + 2}" style="max-width:100%">${names}<rect x="${lab}" y="0" width="${size}" height="${size}" fill="none" stroke="#d0d4dc"/>${rects}</svg></div>`;
    }
    RENDER.auto = {html() {
        const f = filt(), kit = Number(f.kit) || data.kits[0]?.id || 0, A2 = autoClusters(kit, tree && treeKit === kit ? tree : null), p = prefs();
        return `${header('ADN', '🔗 Groupes automatiques', 'Les correspondances qui se correspondent entre elles forment des grappes : chaque grappe descend en général d’un même couple d’ancêtres. Le calcul utilise les « correspondances en commun » notées ou importées, et les segments qui se chevauchent sur un même chromosome.')}
            <div class="h-dna-filters"><label>Test<select data-auto-kit>${data.kits.map(k => `<option value="${k.id}" ${k.id === kit ? 'selected' : ''}>${esc(kitName(k))}</option>`).join('')}</select></label><label><span data-help="Les groupes (clusters) rassemblent les correspondances qui se partagent entre elles : chaque groupe a souvent un même couple d’ancêtres. Garde de 30 à 600 cM pour éviter les parents trop proches et le bruit." data-help-faq="ADN">De</span><input data-unit="cM" type="number" min="0" data-auto-p="autoMin" value="${esc(p.autoMin ?? 30)}"></label><label>à<input data-unit="cM" type="number" min="0" data-auto-p="autoMax" value="${esc(p.autoMax ?? 600)}"></label></div>
            <p class="muted">${plural(A2.pool.length, 'correspondance', 'correspondances')} entre ${A2.lo} et ${A2.hi} cM ; ${fmt(A2.withShared)} avec des correspondances en commun, ${plural(A2.segLinks, 'chevauchement', 'chevauchements')} de segments. Les très proches parents (au-delà de ${A2.hi} cM) sont écartés : ils correspondent à tout le monde.</p>
            ${A2.clusters.length ? `<div class="h-dna-auto">${clusterMatrix(A2)}<div class="h-dna-cl-list">${A2.clusters.map(c => `<article class="card h-dna-cl" style="--c:${c.color}"><h3><span class="h-dna-gchip" style="--c:${c.color}">Grappe ${c.k + 1}</span> <small class="muted">${c.members.length} correspondances · ${fmt(c.members.at(-1).shared_cm)}–${fmt(c.members[0].shared_cm)} cM · liens ${Math.round(c.density * 100)} %</small></h3>
                    <p>${c.couple ? `${c.sure ? '🎯 Ancêtres communs' : '🤔 Ancêtres probables'} : <b>${esc(coupleLabel(c.couple, tree))}</b> <small class="muted">(${esc(GEN_NAMES[genOf(c.couple)] || '')}${c.side ? ', ' + esc(label(SIDES, c.side).toLowerCase()) : ''})</small>` : `<span class="muted">Ancêtre commun encore inconnu${c.side ? ` (côté ${esc(label(SIDES, c.side).toLowerCase())})` : ''} : place une de ces correspondances dans l’arbre (fiche liée), ou ajoute ses noms de famille.</span>`}</p>
                    ${c.surnames.length ? `<p class="h-dna-chips">Noms : ${c.surnames.map(s => `<span>${esc(s.w)} ×${s.n}</span>`).join('')}</p>` : ''}${c.places.length ? `<p class="h-dna-chips">Lieux : ${c.places.map(s => `<span>${esc(s.w)} ×${s.n}</span>`).join('')}</p>` : ''}
                    <p class="h-dna-cl-m">${c.members.map(m => `<button type="button" class="link-button" data-dna-match="${m.id}">${esc(m.name)}</button> <small>${fmt(m.shared_cm)}</small>`).join(' · ')}</p></article>`).join('')}</div></div>
                <p><button type="button" class="button" data-auto-make>Créer ${plural(A2.clusters.length, 'groupe', 'groupes')} avec ces couleurs</button> <small class="muted">(ou mettre à jour ceux déjà créés)</small></p>`
            : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🗂️</span><span class="empty-line-text">Pas encore de grappe : il faut des « correspondances en commun » (fiche d’une correspondance, ou colonne « Shared matches » à l’import) ou des segments (🧩 Chromosomes).</span></p>`}`;
    }, bind(root) {
        bindMatchLinks(root);
        const kit = () => Number(root.querySelector('[data-auto-kit]')?.value) || 0;
        root.querySelector('[data-auto-kit]')?.addEventListener('change', e => { filt().kit = Number(e.target.value); go('auto'); });
        root.querySelectorAll('[data-auto-p]').forEach(i => i.addEventListener('change', () => { const p = prefs(); p[i.dataset.autoP] = num(i.value); savePrefs(p); go('auto'); }));
        if (kit() && treeKit !== kit()) loadTree(kit()).then(() => { if (S().adnTab === 'auto') go('auto'); });
        root.querySelector('[data-auto-make]')?.addEventListener('click', async () => { const A2 = autoClusters(kit(), tree);
            try { for (const c of A2.clusters) { const name = `Grappe ${c.k + 1} (${c.members[0].name})`, old = data.groups.find(g => g.name === name);
                const gid = old ? old.id : (await post('save_dna_group', {name, color: c.color, side: c.side, ancestor: c.couple ? coupleLabel(c.couple, tree) : '', notes: `Groupe automatique : ${c.members.length} correspondances qui se correspondent entre elles.`})).result.id;
                await post('bulk_dna_matches', {ids: c.members.map(m => m.id), add_group: gid}); if (c.side) await post('bulk_dna_matches', {ids: c.members.filter(m => !m.side).map(m => m.id), side: c.side}); }
                toast(`${plural(A2.clusters.length, 'groupe créé ou mis', 'groupes créés ou mis')} à jour.`); await refresh(); } catch (e) { toast(e.message, 'error'); } });
    }};

    /* ═════════ 📍 Placement probable d'un cousin ═════════
     * cM partagés → relations possibles (Shared cM Project) → générations de l'ancêtre commun → les couples de l'arbre à
     * cette génération, pondérés par le côté, les noms et lieux en commun, la grappe et l'âge. Indicatif, jamais une preuve. */
    // relation → génération du couple commun (côté testeur) et décalage : [génération, « demi »] ; plusieurs options pour les « R »
    const REL_GEN = {P: [[1, 0]], FS: [[1, 0]], HS: [[1, 1]], GP: [[2, 0]], AU: [[2, 0], [1, 0]], GGP: [[3, 0]], GAU: [[3, 0], [1, 0]], HAU: [[2, 1], [1, 1]], '1C': [[2, 0]], H1C: [[2, 1]], '1C1R': [[2, 0], [3, 0]], '1C2R': [[2, 0], [4, 0]], H1C1R: [[2, 1], [3, 1]],
        '2C': [[3, 0]], H2C: [[3, 1]], '2C1R': [[3, 0], [4, 0]], '2C2R': [[3, 0], [5, 0]], '3C': [[4, 0]], H3C: [[4, 1]], '3C1R': [[4, 0], [5, 0]], '4C': [[5, 0]], '5C': [[6, 0]], '6C': [[7, 0]]};
    const DIRECT = ['P', 'GP', 'GGP'];
    function placeMatch(m, t, opts = {}) {
        const cm = num(opts.cm ?? m?.shared_cm), rels = guess(cm), out = new Map();
        const ms = words(opts.surnames ?? m?.data?.surnames).map(normW), mp = words(opts.places ?? m?.data?.places).map(normW), side = opts.side ?? m?.side ?? '';
        const mBy = num(opts.by ?? m?.data?.birth_year) || 0, tBy = t?.root_by || 0, diff = mBy && tBy ? mBy - tBy : 0;
        const cl = opts.cluster || null, anc = new Map((t?.ancestors || []).map(a => [a.sosa, a]));
        const lineOf = c => { const l = []; [c, c + 1].forEach(s0 => { for (let s = s0, d = 0; d < 3 && s < 1 << 11; d++, s *= 2) [s, s + 1].slice(0, d ? 2 : 1).forEach(x => anc.get(x) && l.push(anc.get(x))); }); return l; };
        let direct = 0;
        rels.forEach(r => {
            if (DIRECT.includes(r.code)) { direct += r.p; return; }
            const opt = REL_GEN[r.code] || []; if (!opt.length) return;
            const younger = 1 / (1 + Math.exp(-diff / 12)); // né après le testeur → l'ancêtre commun est le plus proche
            opt.forEach(([g, half], k) => {
                const wOpt = opt.length === 1 ? 1 : (diff ? (k === 0 ? younger : 1 - younger) : .5);
                for (let s = 1 << g; s < 2 << g; s += 2) {
                    let w = r.p * wOpt / (1 << (g - 1)), why = [];
                    const cs = coupleSide(s); if (side === 'paternal' || side === 'maternal') { if (cs !== side) w *= .03; else why.push('côté'); }
                    const line = lineOf(s), sn = new Set(line.map(a => normW(a.last))), pl = new Set(line.flatMap(a => a.places.map(normW)));
                    const sHit = ms.filter(x => sn.has(x)), pHit = mp.filter(x => pl.has(x));
                    if (sHit.length) { w *= 1 + 3 * sHit.length; why.push('noms : ' + [...new Set(line.filter(a => sHit.includes(normW(a.last))).map(a => a.last))].join(', ')); }
                    if (pHit.length) { w *= 1 + 1.5 * pHit.length; why.push('lieux : ' + [...new Set(line.flatMap(a => a.places).filter(x => pHit.includes(normW(x))))].slice(0, 3).join(', ')); }
                    if (cl?.couple) { const c0 = cl.couple; let rel = false; for (let x = s; x >= 2; x = Math.floor(x / 2)) if (x - (x % 2) === c0) rel = true; for (let x = c0; x >= 2; x = Math.floor(x / 2)) if (x - (x % 2) === s) rel = true; if (rel) { w *= 5; why.push(`grappe ${cl.k + 1}`); } }
                    const key = `${s}`, o = out.get(key) || {s, w: 0, rels: new Map(), why: new Set(), half: false};
                    o.w += w; o.rels.set(r.code, (o.rels.get(r.code) || 0) + w); why.forEach(x => o.why.add(x)); if (half) o.half = true; out.set(key, o);
                }
            });
        });
        const list = [...out.values()], tot = list.reduce((a, x) => a + x.w, 0) || 1;
        list.forEach(x => { x.p = x.w / tot; x.rel = [...x.rels.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c); });
        return {cm, rels, direct, list: list.sort((a, b) => b.w - a.w).slice(0, 14)};
    }
    RENDER.place = {html() {
        const f = filt(), kit = Number(f.kit) || data.kits[0]?.id || 0, t = tree && treeKit === kit ? tree : null, k = data.kits.find(x => x.id === kit);
        const ms = data.matches.filter(m => m.kit_id === kit), sel = ms.find(m => m.id === Number(f.placeId)) || null, manual = f.placeManual || {};
        const A2 = t ? autoClusters(kit, t) : null, cl = sel && A2 ? A2.clusters.find(c => c.members.includes(sel)) : null;
        const R = (sel || num(manual.cm)) ? placeMatch(sel, t, sel ? {cluster: cl} : {cm: manual.cm, side: manual.side, surnames: manual.surnames, places: manual.places, by: manual.by}) : null;
        const relRow = R ? R.rels.slice(0, 6).map(r => `<span class="h-dna-relp" style="--w:${Math.round(r.p * 100)}%"><b>${esc(r.code)}</b> ${esc(r.name)} <small>${Math.round(r.p * 100)} %</small></span>`).join('') : '';
        return `${header('ADN', '📍 Placer un cousin dans l’arbre', 'Pour une correspondance (ou un nombre de cM), les relations possibles et les couples d’ancêtres de ton arbre par lesquels elle descend probablement, du plus au moins probable. On s’appuie sur les cM (Shared cM Project), le côté, les noms et lieux en commun, la grappe et l’âge : c’est une piste à vérifier, jamais une preuve.')}
            <div class="h-dna-filters"><label>Test<select data-pl-kit>${data.kits.map(x => `<option value="${x.id}" ${x.id === kit ? 'selected' : ''}>${esc(kitName(x))}</option>`).join('')}</select></label>
                <label class="h-dna-pl-m">Correspondance<select data-pl-match><option value="">— ou les cM à la main ci-dessous —</option>${ms.slice(0, 1500).map(m => `<option value="${m.id}" ${sel?.id === m.id ? 'selected' : ''}>${esc(m.name)} — ${fmt(m.shared_cm)} cM${m.person_id ? ' ✓' : ''}</option>`).join('')}</select></label></div>
            ${!sel ? `<div class="h-dna-filters"><label>cM partagés<input type="number" min="0" step="0.1" data-pl-man="cm" value="${esc(manual.cm || '')}"></label><label>Côté<select data-pl-man="side">${SIDES.map(([v, l]) => `<option value="${v}" ${(manual.side || '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><label>Année de naissance<input type="number" data-pl-man="by" value="${esc(manual.by || '')}"></label><label>Noms en commun<input data-pl-man="surnames" value="${esc(manual.surnames || '')}" placeholder="MARTIN; DUBOIS"></label><label>Lieux<input data-pl-man="places" value="${esc(manual.places || '')}"></label></div>` : ''}
            ${!k?.person_id ? '<p class="h-dna-warn">Ce test n’est relié à aucune fiche : relie-le à la personne testée (🧬 Mes tests) pour que l’arbre serve au placement.</p>' : !t ? '<p class="muted">Lecture de l’arbre…</p>' : ''}
            ${R ? `<section class="card h-dna-plcard"><h3>${sel ? esc(sel.name) : 'Correspondance'} — ${fmt(R.cm, 1)} cM${sel?.longest_cm ? ` · plus long segment ${fmt(sel.longest_cm, 1)} cM` : ''}</h3><div class="h-dna-rels">${relRow || '<span class="muted">Hors des valeurs connues.</span>'}</div>
                ${R.direct > .2 ? `<p class="h-dna-warn">À ${Math.round(R.direct * 100)} % une parenté en ligne directe (parent, grand-parent, arrière-grand-parent) : regarde d’abord ta proche famille.</p>` : ''}
                ${cl ? `<p>Dans la <b>grappe ${cl.k + 1}</b>${cl.couple ? ` — ancêtres ${cl.sure ? 'communs' : 'probables'} de la grappe : ${esc(coupleLabel(cl.couple, t))}` : ''}.</p>` : ''}
                ${sel && t?.linked?.[sel.id] ? `<p class="h-dna-ok">🎯 Déjà placée dans l’arbre : ancêtres communs ${esc(coupleLabel(t.linked[sel.id][0].sosa - t.linked[sel.id][0].sosa % 2, t))}.</p>` : ''}</section>
            <div class="data-table-wrap"><table class="data-table h-dna-place"><thead><tr><th>Probabilité</th><th>Couple d’ancêtres</th><th>Génération</th><th>Relation</th><th>Indices</th><th></th></tr></thead><tbody>
                ${R.list.map(x => `<tr><td><span class="h-dna-bar" style="--w:${Math.max(2, Math.round(x.p * 100))}%"></span> ${Math.round(x.p * 100)} %</td><td>${esc(coupleLabel(x.s, t))}${/^H/.test(x.rel[0] || '') ? ' <small class="muted">(un seul des deux : demi-cousin)</small>' : ''}</td><td>${esc(GEN_NAMES[genOf(x.s)] || '')}<br><small class="muted">${esc(label(SIDES, coupleSide(x.s)))}</small></td><td>${x.rel.slice(0, 2).map(esc).join(', ')}</td><td><small>${[...x.why].map(esc).join(' · ') || '—'}</small></td>
                    <td>${sel ? `<button type="button" class="button small secondary" data-pl-keep="${x.s}">Retenir</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
            <p class="muted">Ensuite : cherche les descendants de ce couple (« Descendance » dans Graphiques), compare avec l’arbre de la correspondance, et note-la dans la fiche (Ancêtre commun, Fiche liée).</p>` : '<p class="muted">Choisis une correspondance ou entre des cM.</p>'}`;
    }, bind(root) {
        const f = filt();
        root.querySelector('[data-pl-kit]')?.addEventListener('change', e => { f.kit = Number(e.target.value); f.placeId = 0; go('place'); });
        root.querySelector('[data-pl-match]')?.addEventListener('change', e => { f.placeId = Number(e.target.value) || 0; go('place'); });
        root.querySelectorAll('[data-pl-man]').forEach(i => i.addEventListener('change', () => { f.placeManual = {...(f.placeManual || {}), [i.dataset.plMan]: i.value}; go('place'); }));
        const kit = Number(f.kit) || data.kits[0]?.id || 0; if (kit && treeKit !== kit) loadTree(kit).then(() => { if (S().adnTab === 'place') go('place'); });
        root.querySelectorAll('[data-pl-keep]').forEach(b => b.addEventListener('click', async () => {
            const m = data.matches.find(x => x.id === Number(f.placeId)); if (!m) return; const s = Number(b.dataset.plKeep), side = coupleSide(s);
            try { await post('save_dna_match', {id: m.id, kit_id: m.kit_id, name: m.name, person_id: m.person_id || 0, shared_cm: m.shared_cm, segments: m.segments, longest_cm: m.longest_cm, relationship: m.relationship, side: m.side || side, status: m.status, groups: m.groups, data: {...(m.data || {}), mrca: `${coupleLabel(s, tree)} (probable)`}});
                toast('Noté dans la correspondance (Ancêtre commun, côté).'); await refresh(); } catch (e) { toast(e.message, 'error'); } }));
    }};

    /* ═════════ 🧩 Chromosomes ═════════ */
    const CHR = [['1', 249.25], ['2', 243.2], ['3', 198.02], ['4', 191.15], ['5', 180.92], ['6', 171.12], ['7', 159.14], ['8', 146.36], ['9', 141.21], ['10', 135.53], ['11', 135.01], ['12', 133.85], ['13', 115.17], ['14', 107.35], ['15', 102.53], ['16', 90.35], ['17', 81.2], ['18', 78.08], ['19', 59.13], ['20', 63.03], ['21', 48.13], ['22', 51.3], ['X', 155.27]];
    const mb = v => num(v) > 1e5 ? num(v) / 1e6 : num(v); // positions en paires de bases ou en Mb
    function overlaps(segs) {
        const out = [];
        CHR.forEach(([c]) => { const l = segs.filter(s => s.chromosome === c).sort((a, b) => a.start - b.start);
            for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length && l[j].start < l[i].end; j++) { if ((l[i].match_id || l[i].label) === (l[j].match_id || l[j].label)) continue; const a = Math.max(l[i].start, l[j].start), b = Math.min(l[i].end, l[j].end); if (mb(b) - mb(a) >= 2) out.push({c, a, b, s1: l[i], s2: l[j]}); } });
        return out;
    }
    const segName = s => s.match_id ? (data.matches.find(m => m.id === s.match_id)?.name || s.label) : s.label;
    const segColor = (s, by) => { const m = s.match_id && data.matches.find(x => x.id === s.match_id); if (s.color) return s.color; if (by === 'side') return color(prefs().colors[s.side || m?.side || '']); const g = m?.groups?.map(groupById).find(Boolean); if (by === 'group' && g) return color(g.color); let h = 0; for (const ch of String(segName(s))) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
    RENDER.chromo = {html() {
        const f = filt(), kit = Number(f.kit) || data.kits[0]?.id || 0, by = f.paint || 'match', segs = data.segments.filter(s => s.kit_id === kit), W = 900, maxL = 250, rowH = 22;
        const ov = overlaps(segs);
        const svg = `<svg viewBox="0 0 ${W} ${CHR.length * rowH + 10}" class="h-dna-chr">${CHR.map(([c, L], i) => { const y = i * rowH + 4, k = (W - 50) / maxL;
            return `<text x="4" y="${y + 12}" font-size="11">${c}</text><rect x="40" y="${y + 3}" width="${(L * k).toFixed(1)}" height="12" rx="6" fill="#e9ecef" stroke="#c4c9cf"/>${segs.filter(s => s.chromosome === c).map(s => `<rect x="${(40 + mb(s.start) * k).toFixed(1)}" y="${y + 3}" width="${Math.max(1.5, (mb(s.end) - mb(s.start)) * k).toFixed(1)}" height="12" fill="${esc(segColor(s, by))}" opacity=".85"><title>${esc(segName(s))} — chr ${c} : ${fmt(mb(s.start), 1)}–${fmt(mb(s.end), 1)} Mb, ${fmt(s.cm, 1)} cM${s.ancestor ? ' — ' + esc(s.ancestor) : ''}</title></rect>`).join('')}`; }).join('')}</svg>`;
        return `${header('ADN', '🧩 Chromosomes et segments', 'Le « navigateur de chromosomes » : où chaque correspondance partage de l’ADN avec toi. Des segments qui se chevauchent viennent peut-être du même ancêtre (triangulation — à confirmer : chacun doit aussi correspondre avec l’autre sur ce segment).', '<button type="button" class="button secondary" data-dna-segimport>⤒ Importer des segments (CSV)</button><button type="button" class="button secondary" data-dna-segadd>＋ Segment</button>')}
            <div class="h-dna-filters"><select data-dna-ck>${data.kits.map(k => `<option value="${k.id}" ${k.id === kit ? 'selected' : ''}>${esc(kitName(k))}</option>`).join('') || '<option>Aucun test</option>'}</select><select data-dna-paint>${[['match', 'Couleur par correspondance'], ['group', 'Par groupe'], ['side', 'Par côté']].map(([v, l]) => `<option value="${v}" ${by === v ? 'selected' : ''}>${l}</option>`).join('')}</select><span class="muted">${plural(segs.length, 'segment', 'segments')}</span></div>
            <div class="card">${svg}</div>
            <h3>Chevauchements (triangulation possible) <small>${fmt(ov.length)}</small></h3>
            ${ov.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Chr</th><th>De (Mb)</th><th>À (Mb)</th><th>Correspondance 1</th><th>Correspondance 2</th></tr></thead><tbody>${ov.slice(0, 300).map(o => `<tr><td>${o.c}</td><td>${fmt(mb(o.a), 1)}</td><td>${fmt(mb(o.b), 1)}</td><td>${esc(segName(o.s1))}</td><td>${esc(segName(o.s2))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📭</span><span class="empty-line-text">Aucun pour l’instant.</span></p>'}
            <h3>Segments</h3><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Chr</th><th>Début</th><th>Fin</th><th>cM</th><th>SNP</th><th>Correspondance</th><th>Ancêtre</th><th></th></tr></thead><tbody>${segs.slice(0, 2000).map(s => `<tr><td>${esc(s.chromosome)}</td><td>${fmt(mb(s.start), 2)}</td><td>${fmt(mb(s.end), 2)}</td><td>${fmt(s.cm, 1)}</td><td>${s.snps ? fmt(s.snps) : ''}</td><td>${esc(segName(s))}</td><td>${esc(s.ancestor)}</td><td><button type="button" class="icon-action" data-dna-segdel="${s.id}" title="Supprimer">✕</button></td></tr>`).join('') || `<tr><td colspan="8">${A().empty('Aucun segment.')}</td></tr>`}</tbody></table></div>`;
    }, bind(root) {
        const f = filt();
        root.querySelector('[data-dna-ck]')?.addEventListener('change', e => { f.kit = Number(e.target.value); go('chromo'); });
        root.querySelector('[data-dna-paint]').addEventListener('change', e => { f.paint = e.target.value; go('chromo'); });
        root.querySelectorAll('[data-dna-segdel]').forEach(b => b.addEventListener('click', async () => { await post('delete_dna_segments', {ids: [Number(b.dataset.dnaSegdel)]}); await refresh(); }));
        const kit = () => Number(f.kit) || data.kits[0]?.id || 0;
        root.querySelector('[data-dna-segadd]').addEventListener('click', () => { if (!kit()) return toast('Ajoute d’abord un test.', 'error');
            ext.openDialog({eyebrow: 'ADN', title: 'Nouveau segment', submitLabel: 'Ajouter', body: `<div class="form-grid"><label>Chromosome<select name="chromosome">${CHR.map(([c]) => `<option>${c}</option>`).join('')}</select></label><label>cM<input name="cm" inputmode="decimal"></label><label>Début (Mb ou paires de bases)<input name="start" inputmode="decimal" required></label><label>Fin<input name="end" inputmode="decimal" required></label>
                <label>Correspondance<select name="match_id"><option value="0">—</option>${data.matches.filter(m => m.kit_id === kit()).slice(0, 3000).map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label><label>Ancêtre supposé<input name="ancestor"></label><label>Côté<select name="side">${SIDES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label><label>Couleur<input type="color" name="color" value="#4e79a7"></label></div>`,
                onSubmit: async fm => { const v = Object.fromEntries(new FormData(fm)); try { const r = await post('save_dna_segments', {kit_id: kit(), rows: [{...v, match_id: Number(v.match_id), start: num(v.start), end: num(v.end), cm: num(v.cm)}]}); if (!r.result?.n) { toast('Segment refusé : vérifie le chromosome, et que la fin est après le début.', 'error'); return false; } await refresh(); } catch (e) { toast(e.message, 'error'); return false; } }}); });
        root.querySelector('[data-dna-segimport]').addEventListener('click', () => { if (!kit()) return toast('Ajoute d’abord un test.', 'error');
            const input = document.createElement('input'); input.type = 'file'; input.accept = '.csv,.tsv,.txt,text/csv';
            input.onchange = async () => { const file = input.files?.[0]; if (!file) return; if (file.size > 40e6) return toast('Fichier trop gros.', 'error'); const all = parseCsv(await file.text()).filter(r => r.some(c => String(c).trim())); if (all.length < 2) return toast('Fichier vide.', 'error');
                const SF = [['label', 'Nom de la correspondance', ['match name', 'name', 'nom', 'display name', 'matchname']], ['chromosome', 'Chromosome', ['chromosome', 'chr', 'chrom']], ['start', 'Début', ['start location', 'start position', 'start', 'b37 start', 'debut', 'start point']], ['end', 'Fin', ['end location', 'end position', 'end', 'b37 end', 'fin', 'end point']], ['cm', 'cM', ['centimorgans', 'cm', 'segment cm', 'length cm', 'genetic distance']], ['snps', 'SNP', ['matching snps', 'snps', 'snp']]];
                mapDialog({title: `Segments de « ${file.name} »`, fields: SF, head: all[0], rows: all.slice(1), intro: 'Les segments sont rattachés aux correspondances du même nom (dans ce test). Positions en paires de bases ou en Mb (GRCh37).', extra: '<label class="checkbox-line"><input type="checkbox" name="replace"> Remplacer tous les segments de ce test</label>',
                    onGo: async (m, fm) => { const get = (r, k) => m[k] >= 0 ? String(r[m[k]] ?? '').trim() : '';
                        const rows = all.slice(1).map(r => ({label: get(r, 'label'), chromosome: get(r, 'chromosome'), start: num(get(r, 'start')), end: num(get(r, 'end')), cm: num(get(r, 'cm')), snps: Math.round(num(get(r, 'snps')))}));
                        try { let n = 0; for (let i = 0; i < rows.length; i += 5000) { const r = await post('save_dna_segments', {kit_id: kit(), replace: i === 0 && fm.querySelector('[name=replace]').checked ? 1 : 0, rows: rows.slice(i, i + 5000)}); n += r.result?.n || 0; } toast(`${plural(n, 'segment importé', 'segments importés')}.`); await refresh(); } catch (e) { toast(e.message, 'error'); return false; } }}); };
            input.click(); });
    }};

    /* ═════════ 📐 Calculateur ═════════ */
    RENDER.calc = {html() {
        const f = filt(), cm = f.calc ?? '';
        const g = guess(cm);
        return `${header('ADN', '📐 Calculateur de cM', 'Combien de centimorgans partagés pour quelle relation ? Valeurs indicatives d’après le Shared cM Project (Blaine Bettinger, version 4, 2020) : une moyenne et une fourchette observées sur des milliers de cas réels. Une même valeur peut convenir à plusieurs relations.')}
            <div class="h-dna-calc"><label>cM partagés<input type="number" min="0" max="8000" step="0.1" data-dna-calc value="${esc(cm)}" placeholder="Ex. 230"></label><span class="muted">${cm !== '' ? `= ${fmt(pctOf(cm), 2)} % de l’ADN (sur ${fmt(prefs().total)} cM)` : ''}</span></div>
            ${g.length ? `<div class="card">${chart({kind: 'bars', width: 700, series: [{name: 'Probabilité'}], rows: g.slice(0, 10).map(x => ({label: x.name, s0: Math.round(x.p * 100)})), o: {unit: '%'}})}</div>` : cm !== '' ? '<p class="h-dna-warn">Aucune relation connue pour cette valeur (au-delà de 3 720 cM, c’est soi-même ou un vrai jumeau).</p>' : ''}
            <h3>Tableau de référence</h3><div class="data-table-wrap"><table class="data-table h-dna-ref"><thead><tr><th>Relation</th><th>Moyenne</th><th>Fourchette</th><th>%</th></tr></thead><tbody>${SCP.map(r => `<tr class="${g.some(x => x.code === r[1]) ? 'is-fit' : ''}"><td>${esc(r[0])}</td><td>${fmt(r[2])}</td><td>${fmt(r[3])} – ${fmt(r[4])}</td><td>${fmt(pctOf(r[2]), 2)} %</td></tr>`).join('')}</tbody></table></div>
            <p class="muted">Pour aller plus loin (outils externes, en anglais) : <a href="https://dnapainter.com/tools/sharedcmv4" target="_blank" rel="noopener noreferrer">Shared cM Project tool ↗</a>. L’endogamie (villages isolés, communautés fermées) et l’implexe gonflent les cM : une relation paraît alors plus proche qu’elle ne l’est.</p>`;
    }, bind(root) { const i = root.querySelector('[data-dna-calc]'); i.addEventListener('change', () => { if (filt().calc === i.value) return; filt().calc = i.value; setTimeout(() => go('calc'), 0); }); }};

    /* ═════════ 🌳 Lignées Y, mt, X ═════════ */
    RENDER.lines = {html() {
        const f = filt(), pid = Number(f.linePerson) || data.kits.find(k => k.person_id)?.person_id || Number(S().currentPersonId) || 0;
        // le nom de la personne (jamais un numéro) : celui choisi, celui d'un test, ou celui de la fiche ouverte
        const cp = S().currentPerson?.person, pname = (Number(f.linePerson) === pid && f.linePersonName && !/^#\d+$/.test(f.linePersonName) ? f.linePersonName : '') || data.kits.find(k => k.person_id === pid)?.person_name || (cp && Number(cp.id) === pid ? A().personName(cp) : '');
        return `${header('ADN', '🌳 Lignées Y, mt et X', 'D’après ton arbre : de qui viennent l’ADN-Y (père du père du père…), l’ADN mitochondrial (mère de la mère…) et l’ADN-X d’une personne. Utile pour savoir qui faire tester, et pour lire un haplogroupe ou une correspondance sur le X.')}
            <div class="h-dna-filters"><div class="h-dna-lp"><span class="pk-lab">Personne</span>${PKF({name: 'dna_lp', kind: 'person', value: pid ? (pname ? {id: pid, title: pname} : pid) : null})}</div><label>Générations<input type="number" min="1" max="14" value="${esc(f.lineDepth || 10)}" data-dna-ld></label><button type="button" class="button small" data-dna-lgo>Afficher</button></div>
            <div class="h-dna-lines" data-dna-lines>${pid ? '<p class="muted">Calcul…</p>' : '<p class="muted">Choisis une personne.</p>'}</div>`;
    }, async bind(root) {
        const f = filt();
        root.querySelector('.h-dna-lp')?.addEventListener('picker-change', e => { f.linePersonName = e.detail.item?.title || ''; });
        root.querySelector('[data-dna-lgo]').addEventListener('click', () => { f.linePerson = Number(root.querySelector('[name=dna_lp]').value) || f.linePerson; f.lineDepth = Number(root.querySelector('[data-dna-ld]').value) || 10; go('lines'); });
        const pid = Number(f.linePerson) || data.kits.find(k => k.person_id)?.person_id || Number(S().currentPersonId) || 0; if (!pid) return;
        let r; try { r = await api('dna_lines', {person_id: pid, depth: f.lineDepth || 10}); } catch (e) { root.querySelector('[data-dna-lines]').innerHTML = `<p class="h-dna-warn">${esc(e.message)}</p>`; return; }
        const pl = p => `<li><span class="h-dna-gen">G${p.gen}</span> <button type="button" class="table-link" data-open-person="${p.id}">${esc(p.name || '?')}</button> <small class="muted">${esc([p.birth, p.death].filter(Boolean).map(d => String(d).slice(0, 4)).join('–'))}</small>${haplo(p.id)}</li>`;
        const haplo = id => { const k = data.kits.filter(x => x.person_id === id); return k.length ? ` <span class="h-dna-hap">${k.map(x => [x.haplo_y && 'Y ' + x.haplo_y, x.haplo_mt && 'mt ' + x.haplo_mt].filter(Boolean).join(' · ')).filter(Boolean).join(' / ')}</span>` : ''; };
        const male = r.person.gender === 'male';
        root.querySelector('[data-dna-lines]').innerHTML = `<section class="card"><h3>♂ ADN-Y — lignée paternelle directe</h3>${male ? '' : '<p class="muted">Seuls les hommes ont un ADN-Y. Une femme n’a pas d’ADN-Y : ce sont ceux de son père, de ses frères ou d’un cousin du même nom qui le portent.</p>'}<ol>${r.y.map(pl).join('') || '<li class="empty-line"><span class="empty-line-ico" aria-hidden="true">👪</span><span class="empty-line-text">Pas de père connu dans l’arbre.</span></li>'}</ol><p class="muted">Tous ces hommes ont (presque) le même chromosome Y : un homme vivant de cette lignée peut le faire tester.</p></section>
            <section class="card"><h3>♀ ADN mitochondrial — lignée maternelle directe</h3><ol>${r.mt.map(pl).join('') || '<li class="empty-line"><span class="empty-line-ico" aria-hidden="true">👪</span><span class="empty-line-text">Pas de mère connue dans l’arbre.</span></li>'}</ol><p class="muted">Transmis par les mères à tous leurs enfants ; seules les filles le transmettent à leur tour.</p></section>
            <section class="card"><h3>✕ ADN-X — ancêtres possibles</h3><p class="muted">${male ? 'Un homme reçoit son X de sa mère seulement.' : 'Une femme reçoit un X de chaque parent.'} Un père ne transmet que le X qu’il tient de sa mère : certains ancêtres ne peuvent donc pas avoir donné d’X. ${plural(r.x.length, 'ancêtre possible', 'ancêtres possibles')} :</p>
                ${[...new Set(r.x.map(p => p.gen))].map(g => `<h4>Génération ${g} <small>(${r.x.filter(p => p.gen === g).length})</small></h4><ul class="h-dna-xlist">${r.x.filter(p => p.gen === g).map(pl).join('')}</ul>`).join('') || '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">👪</span><span class="empty-line-text">Aucun parent connu.</span></p>'}</section>`;
    }};

    /* ═════════ 🌍 Origines estimées ═════════ */
    RENDER.origins = {html() {
        const kits = data.kits.filter(k => k.data?.ethnicity?.length), regions = [...new Set(kits.flatMap(k => k.data.ethnicity.map(e => e.region)))];
        return `${header('ADN', '🌍 Origines estimées', 'Les « origines ethniques » données par les sociétés : des <b>estimations</b>, qui changent d’une société à l’autre et d’une mise à jour à l’autre. Elles ne remplacent pas les registres.')}
            ${kits.length ? `<div class="card">${chart({kind: 'stacked100', width: 820, series: regions.map(r => ({name: r})), rows: kits.map(k => Object.fromEntries([['label', kitName(k)], ...regions.map((r, i) => [`s${i}`, k.data.ethnicity.find(e => e.region === r)?.percent || 0])])), o: {height: 280, values: false}})}</div>
            <div class="data-table-wrap"><table class="data-table"><thead><tr><th>Région</th>${kits.map(k => `<th>${esc(kitName(k))}</th>`).join('')}</tr></thead><tbody>${regions.map(r => `<tr><td>${esc(r)}</td>${kits.map(k => `<td>${fmt(k.data.ethnicity.find(e => e.region === r)?.percent || 0, 1)} %</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : A().empty('Aucune estimation : ajoute-les dans un test (« 🧬 Mes tests » → Origines estimées).')}`;
    }};

    /* ═════════ 📚 Comprendre ═════════ */
    const LEARN = [
        ['Les types de tests', `<p><b>Autosomal</b> (atDNA) : les 22 paires de chromosomes non sexuels, reçues pour moitié de chaque parent. Il retrouve des cousins de tous les côtés jusqu’à 5 à 8 générations environ. C’est le test « généalogique » le plus courant.</p><p><b>ADN-Y</b> : transmis de père en fils presque sans changement. Il suit une seule lignée, celle du nom de famille dans beaucoup de cas, sur des centaines d’années. On l’étudie par ses marqueurs (Y-STR : 37, 67, 111 marqueurs…) et ses mutations (SNP) qui donnent l’<b>haplogroupe</b>.</p><p><b>ADN mitochondrial</b> (ADNmt) : transmis par la mère à tous ses enfants, seules les filles le transmettent. Très stable : utile pour des questions anciennes ou pour départager deux lignées maternelles.</p><p><b>ADN-X</b> : son mode de transmission particulier élimine des ancêtres (voir « Lignées Y, mt et X »).</p>`],
        ['Centimorgans (cM) et segments', `<p>Le <b>centimorgan</b> mesure une longueur d’ADN « génétique ». On partage environ 3 400 à 3 700 cM avec un parent, 850 en moyenne avec un cousin germain, 230 avec un cousin issu de germain… Le total et la <b>longueur du plus long segment</b> aident à deviner la relation (« 📐 Calculateur »). Les petits segments (moins de 7 à 8 cM) sont souvent du « bruit » ou très anciens.</p>`],
        ['Haplogroupes', `<p>Un <b>haplogroupe</b> (R-M269, I-M253, H1, U5b…) regroupe tous ceux qui descendent d’un même lointain ancêtre en ligne Y ou mt, souvent il y a des milliers d’années. Deux personnes du même haplogroupe ne sont pas forcément proches : il faut des sous-clades fines ou une correspondance de marqueurs.</p>`],
        ['Triangulation', `<p>Si A correspond avec toi, B correspond avec toi, <b>et</b> A et B correspondent entre eux <b>sur le même segment</b>, ce segment vient très probablement d’un ancêtre commun aux trois. C’est la meilleure preuve génétique d’une branche. Le « 🧩 navigateur de chromosomes » montre les chevauchements à vérifier.</p>`],
        ['La méthode de Leeds', `<p>Mise au point par Dana Leeds : on prend les correspondances de 90 à 400 cM (cousins de 2e et 3e degré), et on colore ensemble celles qui se correspondent entre elles. On obtient souvent 4 groupes (tes 4 grands-parents) ou 8 (tes arrière-grands-parents). Il faut noter les « correspondances en commun » de chacun (« 🗂️ Groupes »).</p>`],
        ['Endogamie et implexe', `<p>Dans un village isolé, une île, une communauté fermée, on descend plusieurs fois des mêmes ancêtres (<b>implexe</b>). On partage alors plus d’ADN qu’attendu, en beaucoup de petits segments : les relations paraissent plus proches qu’elles ne sont. Méfie-toi des estimations, regarde le plus long segment.</p>`],
        ['Placer une correspondance', `<ol><li>Regarde les cM et le plus long segment, la relation probable.</li><li>Regarde les correspondances en commun : de quel côté ? de quel groupe ?</li><li>Compare les noms et les lieux de son arbre avec les tiens.</li><li>Construis son arbre vers le passé jusqu’à trouver le couple commun (MRCA).</li><li>Vérifie que les cM collent avec la relation trouvée.</li><li>Note l’ancêtre commun, lie sa fiche, mets « Placé dans l’arbre ✓ ».</li></ol>`],
        ['Confidentialité et éthique', `<ul><li>Demande l’accord de la personne avant de tester, et explique ce qu’on peut découvrir.</li><li>Ne publie pas les noms et les cM de personnes vivantes sans leur accord.</li><li>Prépare-toi aux surprises (parent biologique inconnu, adoption, don de gamètes) et sois délicat avec les personnes concernées.</li><li>Dans les sociétés de test, choisis les options de partage, de recherche et d’usage par la justice qui te conviennent.</li><li>En France : voir « ⚖️ Loi et mises en garde ».</li></ul>`],
        ['Petit glossaire', `<dl class="h-dna-gloss"><dt>SNP</dt><dd>Une « lettre » de l’ADN qui varie d’une personne à l’autre ; les puces en lisent des centaines de milliers.</dd><dt>STR</dt><dd>Un motif répété (ADN-Y), compté pour comparer deux hommes.</dd><dt>MRCA</dt><dd>Most Recent Common Ancestor : l’ancêtre commun le plus récent.</dd><dt>ICW</dt><dd>In Common With : les correspondances que deux personnes partagent.</dd><dt>1C1R</dt><dd>Cousin germain une génération d’écart (« issu de germain »).</dd><dt>GRCh37</dt><dd>La « carte » du génome sur laquelle sont donnés les débuts et fins de segments.</dd><dt>Fichier brut</dt><dd>Le fichier de tes SNP que certaines sociétés laissent télécharger.</dd></dl>`],
    ];
    RENDER.learn = {html: () => `${header('ADN', '📚 Comprendre l’ADN en généalogie', 'L’essentiel, en clair.')}${LEARN.map(([t, h], i) => `<details class="card h-dna-learn" ${i < 2 ? 'open' : ''}><summary><h3>${esc(t)}</h3></summary>${h}</details>`).join('')}`};

    /* ═════════ ⚙️ Réglages (modulable) ═════════ */
    RENDER.settings = {html() {
        const p = prefs();
        return `${header('ADN', '⚙️ Réglages', 'Ce que montre l’onglet, dans l’ordre voulu, et comment.', '<button type="button" class="button secondary" data-dna-reset>↺ Remettre comme au départ</button>')}
            <div class="h-dna-settings"><section class="card"><h3>Rubriques de la colonne de gauche</h3><p class="muted">Coche ce que tu veux voir ; ↑ ↓ pour l’ordre (ou glisse la poignée).</p>
                <div data-dna-order>${p.order.map(k => { const s = SECTIONS.find(x => x[0] === k); return `<div class="h-dna-orow" data-k="${k}"><label class="checkbox-line"><input type="checkbox" ${p.hidden.includes(k) ? '' : 'checked'} ${['settings', 'law'].includes(k) ? 'disabled' : ''}> ${s[1]} ${esc(s[2])}</label><span><button type="button" data-up>↑</button><button type="button" data-down>↓</button></span></div>`; }).join('')}</div></section>
            <section class="card"><h3>Colonnes du tableau des correspondances</h3><div data-dna-cols>${[...p.columns, ...COLUMNS.map(c => c[0]).filter(k => !p.columns.includes(k))].map(k => `<div class="h-dna-orow" data-k="${k}"><label class="checkbox-line"><input type="checkbox" ${p.columns.includes(k) ? 'checked' : ''} ${k === 'name' ? 'disabled' : ''}> ${esc(label(COLUMNS, k))}</label><span><button type="button" data-up>↑</button><button type="button" data-down>↓</button></span></div>`).join('')}</div></section>
            <section class="card"><h3>Chiffres et couleurs</h3><div class="form-grid">
                <label>Ne montrer que les correspondances d’au moins<input data-unit="cM" type="number" min="0" data-p="minCm" value="${esc(p.minCm)}"></label><label>Lignes affichées à la fois<input type="number" min="50" max="5000" data-p="pageSize" value="${esc(p.pageSize)}"></label>
                <label>Méthode de Leeds : de<input data-unit="cM" type="number" min="0" data-p="leedsMin" value="${esc(p.leedsMin)}"></label><label>à<input data-unit="cM" type="number" min="0" data-p="leedsMax" value="${esc(p.leedsMax)}"></label>
                <label>Total de cM pour les % (6 800 Ancestry/MyHeritage, 7 400 23andMe)<input type="number" min="1000" max="8000" data-p="total" value="${esc(p.total)}"></label><span></span>
                ${SIDES.slice(1).map(([k, l]) => `<label>Couleur « ${esc(l)} »<input type="color" data-c="${k}" value="${esc(color(p.colors[k]))}"></label>`).join('')}</div></section>
            <section class="card"><h3>Sauvegarde de l’onglet</h3><p class="muted">Les tests, correspondances, segments et groupes sont dans la base (et ses sauvegardes). Tu peux aussi les exporter à part.</p><button type="button" class="button secondary" data-dna-json>⤓ Exporter tout l’ADN (JSON)</button></section></div>`;
    }, bind(root) {
        const p = prefs();
        root.addEventListener('click', e => { const row = e.target.closest('.h-dna-orow'); if (!row) return; if (e.target.closest('[data-up]') && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling); if (e.target.closest('[data-down]') && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row); });
        // K2 : plus de bouton « Enregistrer » : chaque changement est gardé tout de suite ; « ↶ Annuler » dans le message (UI.autoSave)
        const saveNow = () => {
            if (!root.isConnected || !root.querySelector('[data-dna-order]')) return;
            const before = JSON.stringify([p.order, p.hidden]);
            p.order = [...root.querySelectorAll('[data-dna-order] .h-dna-orow')].map(r => r.dataset.k); p.hidden = [...root.querySelectorAll('[data-dna-order] .h-dna-orow')].filter(r => !r.querySelector('input').checked).map(r => r.dataset.k);
            p.columns = [...root.querySelectorAll('[data-dna-cols] .h-dna-orow')].filter(r => r.querySelector('input').checked).map(r => r.dataset.k);
            root.querySelectorAll('[data-p]').forEach(i => { p[i.dataset.p] = num(i.value); }); root.querySelectorAll('[data-c]').forEach(i => { p.colors[i.dataset.c] = i.value; });
            const was = localStorage.getItem(PKEY), now = JSON.stringify(p); if (was === now) return;
            savePrefs(p); if (before !== JSON.stringify([p.order, p.hidden]) && S().module === 'adn') A().renderSidebar?.();
        };
        window.LCNDA_UI?.autoSave?.(root, {save: saveNow, redraw: () => reopenSettings()});
        root.querySelector('[data-dna-reset]').addEventListener('click', () => { const ack = p.ack; savePrefs({...DEFAULTS(), ack}); reopenSettings(); });
        root.querySelector('[data-dna-json]').addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({lcnda_dna: 1, exported: new Date().toISOString(), ...data}, null, 1)], {type: 'application/json'})); a.download = 'adn.json'; document.body.appendChild(a); a.click(); a.remove(); });
    }};

    /** les réglages s'ouvrent dans l'onglet ADN ou dans les Réglages : on reste là où on était */
    const reopenSettings = () => go('settings');
    /* (avant : Réglages → « ADN : affichage », le même réglage que l'onglet ADN → ⚙️ Réglages ; retiré des Réglages à la demande) */
    ext.maintenance.dna_prefs = () => go('settings');
    ext.maintenance = ext.maintenance || {};
    /* ═════════ Sur la fiche d'une personne ═════════ */
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.dna = (index, detail) => A().card(index, '🧬 ADN', '', `<div data-dna-host="${Number(detail.person?.id || detail.id) || 0}"></div>`, 'span-12');
    const fillHost = async box => {
        box.dataset.dnaDone = '1'; const pid = Number(box.dataset.dnaHost); const card = box.closest('.card');
        let r; try { r = await api('dna', {person_id: pid}); } catch (_) { if (card) card.hidden = true; return; }
        if (!r.kits.length && !r.matches.length) { if (card) card.hidden = true; return; }
        box.innerHTML = `${r.kits.map(k => `<p>🧬 <b>${esc(k.company || 'Test')}</b> · ${esc(label(TYPES, k.test_type).split(' :')[0])}${k.haplo_y ? ` · Y <b>${esc(k.haplo_y)}</b>` : ''}${k.haplo_mt ? ` · mt <b>${esc(k.haplo_mt)}</b>` : ''}</p>`).join('')}
            ${r.matches.filter(m => m.person_id === pid).map(m => `<p>👥 Correspondance ADN « ${esc(m.name)} » : <b>${fmt(m.shared_cm, 1)} cM</b>${m.data?.mrca ? ` — ancêtre commun : ${esc(m.data.mrca)}` : ''}</p>`).join('')}
            <p><button type="button" class="link-button" data-dna-go="kits">Ouvrir l’onglet ADN →</button></p>`;
    };
    new MutationObserver(() => { document.querySelectorAll('[data-dna-host]:not([data-dna-done])').forEach(b => fillHost(b)); }).observe(document.documentElement, {childList: true, subtree: true});

    ext.dnaInternals = {guess, SCP, overlaps, leeds: k => leeds(k), autoMap, sideOf, prefs, lawHtml};
})();
