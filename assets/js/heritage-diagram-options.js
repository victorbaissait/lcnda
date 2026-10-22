/* LCNDA — 📊 Diagrammes, onglet « Depuis l'app » : les options communes à tous les types, mêmes champs dans le même ordre :
 *   ce qu'on compte · le groupe de personnes (menu de choix) · la période (dates C4) · le regroupement · les séries ·
 *   le tri · les N premiers (C3) · « Autres » · « Inconnu » · l'unité (nombre, %, moyenne, médiane) · « Tenir à jour ».
 * Chaque type ne montre que ce qui a un sens pour lui. Serveur : lib/diagram_options.php (groupe, période : paramètres dg_*),
 * lib/diagram_appcount.php (« 🧮 Compter dans ma base », api diagram_app_count).
 *  - DGO.html(q, cfg) / DGO.bind(box, {cfg, onChange}) / DGO.read(box) / DGO.check(box) : le bloc d'options ;
 *  - DGO.params(q) : les paramètres d'API ; DGO.extra(spec) : les dg_* du bloc ouvert (ou ceux gardés dans spec.__dg) ;
 *  - DGO.summary(q, cfg) : la phrase au-dessus de l'aperçu ; DGO.post(paires, q) : tri, N premiers, Autres, Inconnu, % ;
 *  - DGO.count(q) → réponse du serveur ; DGO.toSpec(spec, réponse, nom) → le tableau du diagramme ;
 *  - DGO.adopt(panneau, type) : le bloc ajouté au panneau propre d'un type (cartes, frises, familles…).
 * Les diagrammes déjà enregistrés ne changent pas : sans option, rien n'est envoyé de plus.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const PK = () => window.LCNDA_PICKER;
    const R = () => ext.diagramRender;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const clone = v => JSON.parse(JSON.stringify(v ?? null));
    const startId = () => Number(A()?.state?.bootstrap?.startPersonId) || 0;
    const FAQ = 'Diagrammes : que veulent dire les options de « Depuis l’app → Graphique » ?';

    /* ─── Les choix ─── */
    const WHAT = [['persons', 'Personnes'], ['births', 'Naissances (ou baptêmes)'], ['baptisms', 'Baptêmes'], ['marriages', 'Mariages'], ['deaths', 'Décès (ou sépultures)'], ['burials', 'Sépultures'],
        ['events', 'Tous les événements'], ['families', 'Familles (couples)'], ['places', 'Lieux'], ['media', 'Médias']];
    const WHAT_SUM = {persons: 'Personnes', births: 'Naissances', baptisms: 'Baptêmes', marriages: 'Mariages', deaths: 'Décès', burials: 'Sépultures', events: 'Événements', families: 'Familles', places: 'Lieux', media: 'Médias'};
    const BY_LABEL = {none: 'Rien (un seul total)', last_name: 'Nom de famille', first_name: 'Prénom', sex: 'Sexe', occupation: 'Métier', generation: 'Génération', commune: 'Commune', county: 'Département', state: 'Région', country: 'Pays',
        century: 'Siècle', decade: 'Décennie', year: 'Année', month: 'Mois', age5: 'Âge (par 5 ans)', age10: 'Âge (par 10 ans)', kids: 'Nombre d’enfants', cause: 'Cause du décès', type: 'Sorte d’événement', mtype: 'Sorte de média'};
    const BY_SUM = {none: '', last_name: 'par nom', first_name: 'par prénom', sex: 'par sexe', occupation: 'par métier', generation: 'par génération', commune: 'par commune', county: 'par département', state: 'par région', country: 'par pays',
        century: 'par siècle', decade: 'par décennie', year: 'par année', month: 'par mois', age5: 'par âge (5 ans)', age10: 'par âge (10 ans)', kids: 'par nombre d’enfants', cause: 'par cause', type: 'par sorte d’événement', mtype: 'par sorte de média'};
    const PERSON_BY = ['last_name', 'first_name', 'sex', 'occupation', 'generation', 'commune', 'county', 'state', 'country', 'century', 'decade', 'year', 'month', 'age5', 'age10', 'kids', 'none'];
    const BY = {persons: PERSON_BY, births: PERSON_BY, baptisms: PERSON_BY, burials: PERSON_BY, deaths: [...PERSON_BY.slice(0, -1), 'cause', 'none'], events: ['type', ...PERSON_BY],
        marriages: ['last_name', 'commune', 'county', 'state', 'country', 'century', 'decade', 'year', 'month', 'kids', 'none'], families: ['last_name', 'commune', 'county', 'state', 'country', 'century', 'decade', 'year', 'month', 'kids', 'none'],
        places: ['county', 'state', 'country', 'none'], media: ['mtype', 'last_name', 'century', 'decade', 'year', 'none']};
    const TIME_BY = ['century', 'decade', 'year', 'month', 'age5', 'age10', 'generation', 'kids'];
    const VALUES = {persons: ['age_death', 'age_marriage', 'kids'], births: ['age_death', 'age_marriage', 'kids'], baptisms: ['age_death', 'kids'], deaths: ['age_death', 'kids'], burials: ['age_death'], events: ['age_death'], marriages: ['age_marriage', 'kids'], families: ['age_marriage', 'kids'], places: [], media: []};
    const VALUE_L = {age_death: 'l’âge au décès', age_marriage: 'l’âge au mariage', kids: 'le nombre d’enfants'};
    const POP = [['', 'Toute ma base'], ['anc', 'Mes ancêtres'], ['desc', 'Mes descendants'], ['pat', 'Branche paternelle (côté père)'], ['mat', 'Branche maternelle (côté mère)'],
        ['label', 'Une étiquette'], ['list', 'Une de mes listes'], ['search', 'Une recherche dans les noms'], ['people', 'Les personnes que je choisis']];
    const SERIES = [['', 'Une seule série'], ['sex', 'Une série par sexe'], ['century', 'Une série par siècle']];
    const SORT = [['', 'Automatique'], ['big', 'Du plus grand au plus petit'], ['small', 'Du plus petit au plus grand'], ['az', 'A → Z'], ['za', 'Z → A'], ['natural', 'Dans l’ordre (temps, âges…)']];
    const SORT_SUM = {big: 'du plus grand au plus petit', small: 'du plus petit au plus grand', az: 'de A à Z', za: 'de Z à A', natural: 'dans l’ordre'};
    const UNIT = [['count', 'Nombre'], ['pct', 'Part en %'], ['avg', 'Moyenne'], ['median', 'Médiane']];
    const HELP = {
        what: 'Ce que chaque barre (ou part) compte : des personnes, des naissances, des mariages, des lieux, des médias…',
        distinct: 'Une personne qui a plusieurs de ces événements dans le même groupe ne compte qu’une fois.',
        pop: 'Les personnes prises en compte : toute ta base, tes ancêtres ou tes descendants, une branche, une étiquette, une de tes listes, une recherche, ou des personnes que tu choisis.',
        root: 'La personne d’où l’on part pour ses ancêtres, ses descendants ou ses branches (elle est comptée avec ses ancêtres et ses descendants).',
        gens: 'Jusqu’à combien de générations on remonte (ou on descend). 0 = toutes.',
        label: 'Seulement les fiches qui portent cette étiquette.',
        list: 'Seulement les personnes d’une de tes listes (Maintenance → Mes listes).',
        search: 'Seulement les personnes dont le nom ou le prénom contient ces lettres.',
        people: 'Seulement les personnes que tu choisis ici, une par une.',
        period: 'Seulement ce qui s’est passé entre ces deux dates, écrites comme dans un acte (1789, vers 1850, mai 1900…). Une seule date suffit.',
        period_birth: 'Seulement les personnes nées entre ces deux dates, écrites comme dans un acte (1789, vers 1850, mai 1900…). Une seule date suffit.',
        by: 'Comment on range ce qu’on compte : par nom, par lieu (commune, département, pays), par siècle, décennie ou année, par âge, par génération…',
        series: 'Pour les colonnes empilées, la pyramide, la carte de chaleur… : chaque groupe est coupé en séries (hommes et femmes, ou siècles).',
        sort: 'L’ordre des valeurs. « Automatique » : du plus grand au plus petit, ou dans l’ordre du temps pour les dates et les âges.',
        limit: 'Combien de valeurs garder, les premières après le tri. 0 = toutes.',
        others: 'Les valeurs au-delà des N premières sont additionnées dans une dernière barre « Autres ».',
        empty: 'Montrer aussi ce qui n’est pas renseigné (sans lieu, sans date, sans métier…) sous le nom « Inconnu ».',
        unit: 'Un nombre, une part en %, ou la moyenne (la médiane) d’une valeur : âge au décès, âge au mariage, nombre d’enfants.',
        live: 'Le diagramme se recalcule à chaque affichage : il suit les changements de ta base.',
    };
    // « 🧮 Compter dans ma base » : des points de départ tout prêts (ceux de « Statistiques de l'app », et d'autres)
    const PRESETS = [['custom', '✏️ Sur mesure (tout se règle ci-dessous)', {}],
        ['surnames', 'Noms de famille', {what: 'persons', by: 'last_name'}], ['firstnames', 'Prénoms', {what: 'persons', by: 'first_name'}], ['sex', 'Femmes et hommes', {what: 'persons', by: 'sex'}],
        ['occupations', 'Métiers', {what: 'persons', by: 'occupation'}], ['generation', 'Mes ancêtres par génération', {what: 'persons', pop: 'anc', by: 'generation', limit: 0}],
        ['births_place', 'Lieux de naissance (communes)', {what: 'births', by: 'commune'}], ['births_county', 'Naissances par département', {what: 'births', by: 'county'}], ['births_country', 'Pays de naissance', {what: 'births', by: 'country'}],
        ['births_decade', 'Naissances par décennie', {what: 'births', by: 'decade', limit: 0}], ['marriages_place', 'Lieux de mariage', {what: 'marriages', by: 'commune'}], ['marriages_month', 'Mariages par mois', {what: 'marriages', by: 'month', limit: 0}],
        ['deaths_place', 'Lieux de décès', {what: 'deaths', by: 'commune'}], ['deaths_country', 'Pays de décès', {what: 'deaths', by: 'country'}], ['deaths_decade', 'Décès par décennie', {what: 'deaths', by: 'decade', limit: 0}],
        ['age_death', 'Âge au décès (par 5 ans)', {what: 'deaths', by: 'age5', limit: 0}], ['life_century', 'Âge moyen au décès, par siècle de naissance', {what: 'persons', by: 'century', unit: 'avg', value: 'age_death', limit: 0}],
        ['causes', 'Causes de décès', {what: 'deaths', by: 'cause'}], ['kids', 'Enfants par famille', {what: 'families', by: 'kids', limit: 0}],
        ['events_type', 'Événements par sorte', {what: 'events', by: 'type'}], ['places_county', 'Lieux par département', {what: 'places', by: 'county'}], ['media_type', 'Médias par sorte', {what: 'media', by: 'mtype'}]];
    // les statistiques de l'app et leur équivalent à compter (pour « Refaire avec Compter dans ma base »)
    const FROM_APPSTAT = {'app:surnames': 'surnames', 'app:firstnames': 'firstnames', 'app:birth_places': 'births_place', 'app:marriage_places': 'marriages_place', 'app:death_places': 'deaths_place',
        'app:birth_countries': 'births_country', 'app:death_countries': 'deaths_country', 'app:sex_distribution': 'sex', 'app:birth_years': 'births_decade', 'app:death_years': 'deaths_decade',
        'app:age_at_death': 'age_death', 'app:death_causes': 'causes', 'app:children_per_family': 'kids'};
    const DEF = {what: 'persons', distinct: false, pop: '', root: 0, gens: 0, label: 0, list: 0, search: '', ids: '', from: '', to: '', by: 'last_name', series: '', sort: '', limit: 15, others: true, empty: false, unit: 'count', value: '', live: false};
    const ORDER = ['what', 'distinct', 'pop', 'period', 'by', 'series', 'sort', 'limit', 'others', 'empty', 'unit', 'live'];
    const COUNT_ONLY = ['what', 'distinct', 'pop', 'period', 'by', 'series']; // ce qui demande « Compter dans ma base »

    /** q complet et propre (valeurs connues seulement) */
    function norm(q0 = {}) {
        const q = {...DEF, ...(q0 || {})};
        if (!WHAT.some(([k]) => k === q.what)) q.what = 'persons';
        if (!BY[q.what].includes(q.by)) q.by = BY[q.what][0];
        if (!POP.some(([k]) => k === q.pop)) q.pop = '';
        if (!SERIES.some(([k]) => k === q.series) || (q.series === 'sex' && ['places', 'media', 'marriages', 'families'].includes(q.what)) || (q.series && q.series === q.by)) q.series = '';
        if (!SORT.some(([k]) => k === q.sort)) q.sort = '';
        if (!UNIT.some(([k]) => k === q.unit)) q.unit = 'count';
        if (['avg', 'median'].includes(q.unit) && !VALUES[q.what].length) q.unit = 'count';
        q.value = ['avg', 'median'].includes(q.unit) ? (VALUES[q.what].includes(q.value) ? q.value : VALUES[q.what][0]) : '';
        q.limit = Math.max(0, Math.min(60, Math.round(Number(q.limit)) || 0));
        q.gens = Math.max(0, Math.min(40, Math.round(Number(q.gens)) || 0));
        q.root = Number(q.root) || 0; q.label = Number(q.label) || 0; q.list = Number(q.list) || 0;
        q.ids = String(q.ids || '').split(',').map(Number).filter(x => x > 0).slice(0, 500).join(',');
        q.search = String(q.search || '').slice(0, 80); q.from = String(q.from || '').slice(0, 60); q.to = String(q.to || '').slice(0, 60);
        ['distinct', 'others', 'empty', 'live'].forEach(k => { q[k] = !!q[k]; });
        return q;
    }
    /** les années d'une date écrite librement (« vers 1850 », « entre 1880 et 1885 », « 7 mai 1925 ») */
    const yearsOf = t => (String(t || '').match(/-?\d{3,4}(?!\d)/g) || []).map(Number).filter(y => y > -3000 && y < 2200);
    const fromYear = t => { const y = yearsOf(t); return y.length ? Math.min(...y) : null; };
    const toYear = t => { const y = yearsOf(t); return y.length ? Math.max(...y) : null; };
    /** le texte d'une période : « entre 1800 et 1900 », « depuis 1800 », « jusqu’en 1900 » */
    function periodText(q, born = false) {
        const f = fromYear(q.from), t = toYear(q.to);
        if (f === null && t === null) return '';
        const w = born ? 'nées ' : '';
        if (f !== null && t !== null) return f === t ? `${w}en ${f}` : `${w}entre ${f} et ${t}`;
        return f !== null ? `${w}depuis ${f}` : `${w}jusqu’en ${t}`;
    }
    /** les paramètres communs (groupe, période) pour toutes les données de diagrammes */
    function dgParams(q, {period = true} = {}) {
        const out = {};
        if (q.pop) {
            out.dg_pop = q.pop;
            if (['anc', 'desc', 'pat', 'mat'].includes(q.pop)) { if (q.root) out.dg_root = q.root; if (q.gens) out.dg_gens = q.gens; }
            if (q.pop === 'label') out.dg_label = q.label || '';
            if (q.pop === 'list') out.dg_list = q.list || '';
            if (q.pop === 'search') out.dg_q = q.search;
            if (q.pop === 'people') out.dg_ids = q.ids;
        }
        if (period) { const f = fromYear(q.from), t = toYear(q.to); if (f !== null) out.dg_from = f; if (t !== null) out.dg_to = t; }
        return out;
    }
    function params(q0) {
        const q = norm(q0);
        return {what: q.what, by: q.by, series: q.series, sort: q.sort, limit: q.limit, others: q.others ? 1 : 0, empty: q.empty ? 1 : 0, unit: q.unit, value: q.value, distinct: q.distinct ? 1 : 0, ...dgParams(q)};
    }

    /* ─── Le HTML du bloc ─── */
    const opt = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('');
    const lab = (k, text, help = HELP[k]) => `<span class="h-dgo-lab" data-help="${esc(help)}" data-help-faq="${esc(FAQ)}">${esc(text)}</span>`;
    const toggle = (k, text, on, attrs = '') => `<label class="ui-toggle h-dgo-row" data-dgo-row="${k}"><input type="checkbox" data-dgo="${k}" ${on ? 'checked' : ''} ${attrs}><i></i>${lab(k, text)}</label>`;
    const byOptions = q => BY[q.what].map(k => [k, BY_LABEL[k]]);
    const multiSeries = kind => { const g = R()?.KINDS?.[kind]?.grids?.[0]; return !!g && g.key === 'rows' && (g.series === true || Number(g.series) >= 2); };

    /** cfg : {fields: [...], kind, period: 'event' | 'birth', locked: true (les champs de « Compter » grisés), note} */
    function html(q0, cfg = {}) {
        const q = norm(q0), F = new Set(cfg.fields || ORDER), locked = cfg.locked ? new Set(COUNT_ONLY) : new Set();
        const dis = k => locked.has(k) ? 'disabled' : '';
        const rows = [];
        const P = PK();
        for (const k of ORDER) {
            if (!F.has(k)) continue;
            if (k === 'what') rows.push(`<label class="h-dgo-row" data-dgo-row="what">${lab('what', 'Ce qu’on compte')}<select data-dgo="what" ${dis('what')}>${opt(WHAT, q.what)}</select></label>`);
            if (k === 'distinct') rows.push(toggle('distinct', 'Compter chaque personne une seule fois', q.distinct, dis('distinct')).replace('data-dgo-row="distinct"', `data-dgo-row="distinct" ${['baptisms', 'burials', 'events'].includes(q.what) ? '' : 'hidden'}`));
            if (k === 'pop') {
                rows.push(`<label class="h-dgo-row" data-dgo-row="pop">${lab('pop', 'Groupe de personnes')}<select data-dgo="pop" ${dis('pop')}>${opt(POP, q.pop)}</select></label>`);
                const rootish = ['anc', 'desc', 'pat', 'mat'].includes(q.pop);
                rows.push(`<div class="h-dgo-row h-dgo-sub" data-dgo-row="root" ${rootish ? '' : 'hidden'}>${lab('root', 'Personne de départ')}${P?.pickerField ? P.pickerField({name: 'dgo_root', kind: 'person', value: q.root || startId() || null}) : ''}</div>`);
                rows.push(`<label class="h-dgo-row h-dgo-sub" data-dgo-row="gens" ${rootish ? '' : 'hidden'}>${lab('gens', 'Jusqu’à (générations, 0 = toutes)')}<input type="range" data-dgo="gens" min="0" max="40" step="1" value="${q.gens}" data-unit="gén." ${dis('pop')}></label>`);
                rows.push(`<div class="h-dgo-row h-dgo-sub" data-dgo-row="label" ${q.pop === 'label' ? '' : 'hidden'}>${lab('label', 'Étiquette')}${P?.pickerField ? P.pickerField({name: 'dgo_label', kind: 'label', value: q.label || null}) : ''}</div>`);
                rows.push(`<div class="h-dgo-row h-dgo-sub" data-dgo-row="list" ${q.pop === 'list' ? '' : 'hidden'}>${lab('list', 'Liste')}${P?.pickerField ? P.pickerField({name: 'dgo_list', kind: 'mylist', value: q.list || null}) : ''}</div>`);
                rows.push(`<label class="h-dgo-row h-dgo-sub" data-dgo-row="search" ${q.pop === 'search' ? '' : 'hidden'}>${lab('search', 'Nom ou prénom qui contient')}<input type="search" data-dgo="search" value="${esc(q.search)}" maxlength="80" placeholder="Chercher… (Martin, Jean)" ${dis('pop')}></label>`);
                rows.push(`<div class="h-dgo-row h-dgo-sub" data-dgo-row="people" ${q.pop === 'people' ? '' : 'hidden'}>${lab('people', 'Personnes')}${P?.pickerField ? P.pickerField({name: 'dgo_ids', kind: 'person', multiple: true, value: q.ids ? q.ids.split(',').map(Number) : []}) : ''}</div>`);
            }
            if (k === 'period') {
                const born = cfg.period === 'birth', h = born ? HELP.period_birth : HELP.period;
                rows.push(`<div class="h-dgo-row h-dgo-period" data-dgo-row="period">${lab('period', born ? 'Nées entre (période)' : 'Période', h)}<span class="h-dgo-two"><label>De<input data-ui-date="nocal" data-dgo="from" value="${esc(q.from)}" placeholder="1800, vers 1750…" ${dis('period')}></label><label>à<input data-ui-date="nocal" data-dgo="to" value="${esc(q.to)}" placeholder="1900, 1914…" ${dis('period')}></label></span></div>`);
            }
            if (k === 'by') rows.push(`<label class="h-dgo-row" data-dgo-row="by">${lab('by', 'Regrouper par')}<select data-dgo="by" ${dis('by')}>${opt(byOptions(q), q.by)}</select></label>`);
            if (k === 'series') rows.push(`<label class="h-dgo-row" data-dgo-row="series">${lab('series', 'Séries')}<select data-dgo="series" ${dis('series')}>${opt(SERIES.filter(([v]) => !(v === 'sex' && ['places', 'media', 'marriages', 'families'].includes(q.what))), q.series)}</select></label>`);
            if (k === 'sort') rows.push(`<label class="h-dgo-row" data-dgo-row="sort">${lab('sort', 'Trier')}<select data-dgo="sort">${opt(SORT, q.sort)}</select></label>`);
            if (k === 'limit') rows.push(`<label class="h-dgo-row" data-dgo-row="limit">${lab('limit', 'Garder les premiers (0 = tous)')}<input type="range" data-dgo="limit" min="0" max="60" step="1" value="${q.limit}" data-unit="valeurs"></label>`);
            if (k === 'others') rows.push(toggle('others', 'Le reste dans « Autres »', q.others).replace('data-dgo-row="others"', `data-dgo-row="others" ${q.limit > 0 ? '' : 'hidden'}`));
            if (k === 'empty') rows.push(toggle('empty', 'Montrer « Inconnu » (les valeurs vides)', q.empty));
            if (k === 'unit') {
                const units = cfg.locked ? UNIT.filter(([v]) => v === 'count' || v === 'pct') : UNIT.filter(([v]) => VALUES[q.what].length || v === 'count' || v === 'pct');
                rows.push(`<label class="h-dgo-row" data-dgo-row="unit">${lab('unit', 'Unité')}<select data-dgo="unit">${opt(units, q.unit)}</select></label>`);
                rows.push(`<label class="h-dgo-row h-dgo-sub" data-dgo-row="value" ${['avg', 'median'].includes(q.unit) ? '' : 'hidden'}>${lab('unit', 'De quoi')}<select data-dgo="value">${opt(VALUES[q.what].map(v => [v, VALUE_L[v].replace(/^l’/, '').replace(/^le /, '')]), q.value)}</select></label>`);
            }
            if (k === 'live') rows.push(toggle('live', '🔄 Tenir à jour (relire les chiffres à chaque affichage)', q.live, cfg.liveAttr || ''));
        }
        return `<fieldset class="h-dgo" data-dgo-box><legend>⚙️ Options</legend>${cfg.note ? `<p class="h-dgo-note ui-notice ui-notice-info"><span class="ui-notice-ico" aria-hidden="true">ℹ️</span><span>${cfg.note}</span></p>` : ''}${rows.join('')}</fieldset>`;
    }

    /** les valeurs du bloc */
    function read(box) {
        const v = k => box.querySelector(`[data-dgo="${k}"]`), hid = n => box.querySelector(`input[name="${n}"]`)?.value || '';
        const q = {...(box._q || DEF)};
        ['what', 'pop', 'by', 'series', 'sort', 'unit', 'value', 'search', 'from', 'to'].forEach(k => { const el = v(k); if (el) q[k] = el.value; });
        ['gens', 'limit'].forEach(k => { const el = v(k); if (el) q[k] = Number(el.value) || 0; });
        ['distinct', 'others', 'empty', 'live'].forEach(k => { const el = v(k); if (el) q[k] = el.checked; });
        if (box.querySelector('[data-dgo-row="root"]')) q.root = Number(hid('dgo_root')) || 0;
        if (box.querySelector('[data-dgo-row="label"]')) q.label = Number(hid('dgo_label')) || 0;
        if (box.querySelector('[data-dgo-row="list"]')) q.list = Number(hid('dgo_list')) || 0;
        if (box.querySelector('[data-dgo-row="people"]')) q.ids = hid('dgo_ids');
        Object.assign(q, box._names || {});
        return norm(q);
    }
    /** la période et le groupe sont-ils remplis comme il faut ? (K1 : le champ fautif encadré, la phrase dessous) */
    function check(box) {
        const q = read(box), fail = (sel, m) => { const el = box.querySelector(sel); UI()?.fail ? UI().fail(el, m) : A().toast(m, 'error'); try { el?.focus(); } catch (_) {} return false; };
        for (const k of ['from', 'to']) { const el = box.querySelector(`[data-dgo="${k}"]`); if (el && !el.disabled && el.value.trim() && !yearsOf(el.value).length) return fail(`[data-dgo="${k}"]`, 'Écris une année (ex. 1800, vers 1850).'); }
        if (box.querySelector('[data-dgo="from"]')?.disabled) return true;
        if (q.pop === 'label' && !q.label) return fail('[data-dgo-row="label"] input:not([type=hidden])', 'Choisis une étiquette.');
        if (q.pop === 'list' && !q.list) return fail('[data-dgo-row="list"] input:not([type=hidden])', 'Choisis une de tes listes.');
        if (q.pop === 'search' && q.search.trim().length < 2) return fail('[data-dgo="search"]', 'Écris au moins 2 lettres.');
        if (q.pop === 'people' && !q.ids) return fail('[data-dgo-row="people"] input:not([type=hidden])', 'Choisis au moins une personne.');
        return true;
    }
    /** montre seulement les champs utiles (et remet les menus qui dépendent de « ce qu'on compte ») */
    function refresh(box) {
        const q = read(box), row = k => box.querySelector(`[data-dgo-row="${k}"]`), show = (k, on) => { const r = row(k); if (r) r.hidden = !on; };
        const rootish = ['anc', 'desc', 'pat', 'mat'].includes(q.pop);
        show('root', rootish); show('gens', rootish); ['label', 'list', 'search', 'people'].forEach(k => show(k, q.pop === k));
        show('distinct', ['baptisms', 'burials', 'events'].includes(q.what)); show('others', q.limit > 0); show('value', ['avg', 'median'].includes(q.unit));
        const by = box.querySelector('[data-dgo="by"]');
        if (by && by.dataset.what !== q.what) { const cur = by.value; by.innerHTML = opt(byOptions(q), BY[q.what].includes(cur) ? cur : BY[q.what][0]); by.dataset.what = q.what; }
        const ser = box.querySelector('[data-dgo="series"]');
        if (ser) { const cur = ser.value; ser.innerHTML = opt(SERIES.filter(([v]) => !(v === 'sex' && ['places', 'media', 'marriages', 'families'].includes(q.what))), cur); }
        const unit = box.querySelector('[data-dgo="unit"]');
        if (unit && !box._cfg?.locked) { const cur = unit.value, ok = UNIT.filter(([v]) => VALUES[q.what].length || v === 'count' || v === 'pct'); unit.innerHTML = opt(ok, ok.some(([v]) => v === cur) ? cur : 'count'); }
        const val = box.querySelector('[data-dgo="value"]');
        if (val) { const cur = val.value; val.innerHTML = opt(VALUES[q.what].map(v => [v, VALUE_L[v].replace(/^l’/, '').replace(/^le /, '')]), VALUES[q.what].includes(cur) ? cur : VALUES[q.what][0]); }
    }
    /** relie le bloc : chaque changement → onChange(q) */
    function bind(box, {cfg = {}, onChange = null} = {}) {
        if (!box) return;
        box._cfg = cfg; box._names = box._names || {};
        const fire = () => { refresh(box); onChange?.(read(box)); };
        box.addEventListener('change', e => { if (e.target.matches('[data-dgo="what"]')) { const b = box.querySelector('[data-dgo="by"]'); if (b) b.dataset.what = ''; } fire(); });
        box.addEventListener('input', e => { if (e.target.matches('input[type=range], input[data-ui-date], input[type=search]')) { UI()?.clearFieldError?.(e.target); onChange?.(read(box)); } });
        box.addEventListener('picker-change', e => {
            const n = e.detail?.name, it = e.detail?.item, items = e.detail?.items;
            if (n === 'dgo_root') box._names.rootName = it?.title || '';
            if (n === 'dgo_label') box._names.labelName = it?.title || '';
            if (n === 'dgo_list') box._names.listName = it?.title || '';
            if (n === 'dgo_ids') box._names.idsCount = Array.isArray(items) ? items.length : String(e.detail?.value || '').split(',').filter(Boolean).length;
            UI()?.clearFieldError?.(e.target); fire();
        });
        refresh(box);
    }

    /* ─── La phrase du réglage (« Personnes nées entre 1800 et 1900, mes ancêtres, par département, 10 premiers ») ─── */
    function popText(q) {
        const root = q.root && q.root !== startId() && q.rootName ? q.rootName : '';
        const gens = q.gens ? ` (${q.gens} génération${q.gens > 1 ? 's' : ''})` : '';
        switch (q.pop) {
            case 'anc': return (root ? `les ancêtres de ${root}` : 'mes ancêtres') + gens;
            case 'desc': return (root ? `les descendants de ${root}` : 'mes descendants') + gens;
            case 'pat': return (root ? `la branche paternelle de ${root}` : 'ma branche paternelle') + gens;
            case 'mat': return (root ? `la branche maternelle de ${root}` : 'ma branche maternelle') + gens;
            case 'label': return q.labelName ? `l’étiquette « ${q.labelName} »` : 'une étiquette';
            case 'list': return q.listName ? `la liste « ${q.listName} »` : 'une de mes listes';
            case 'search': return q.search ? `les noms qui contiennent « ${q.search} »` : 'une recherche';
            case 'people': { const n = q.idsCount || String(q.ids || '').split(',').filter(Boolean).length; return `${n} personne${n > 1 ? 's' : ''} choisie${n > 1 ? 's' : ''}`; }
            default: return 'toute ma base';
        }
    }
    function summary(q0, cfg = {}) {
        const q = norm(q0), F = new Set(cfg.fields || ORDER), parts = [];
        if (cfg.locked) {
            parts.push(cfg.source || 'Un graphique de l’app');
        } else if (F.has('what')) {
            const p = periodText(q, q.what === 'persons'), w = WHAT_SUM[q.what];
            const head = ['avg', 'median'].includes(q.unit) ? `${q.unit === 'avg' ? 'Moyenne' : 'Médiane'} de ${VALUE_L[q.value]} (${w.toLowerCase()}${p ? ' ' + p : ''})` : `${w}${p ? ' ' + p : ''}`;
            parts.push(head + (q.distinct && ['baptisms', 'burials', 'events'].includes(q.what) ? ', chaque personne une fois' : ''));
        } else if (cfg.source) parts.push(cfg.source);
        if (F.has('pop') && !cfg.locked) parts.push(popText(q));
        if (!F.has('what') && F.has('period') && !cfg.locked) { const p = periodText(q, cfg.period === 'birth'); if (p) parts.push(cfg.period === 'birth' ? `personnes ${p}` : p); }
        if (F.has('by') && !cfg.locked && BY_SUM[q.by]) parts.push(BY_SUM[q.by]);
        if (F.has('series') && !cfg.locked && q.series) parts.push(q.series === 'sex' ? 'une série par sexe' : 'une série par siècle');
        if (F.has('sort') && q.sort) parts.push(SORT_SUM[q.sort]);
        if (F.has('limit')) parts.push(q.limit ? `${q.limit} premier${q.limit > 1 ? 's' : ''}${q.others ? ' et « Autres »' : ''}` : 'toutes les valeurs');
        if (F.has('empty') && q.empty) parts.push('« Inconnu » montré');
        if (F.has('unit') && q.unit === 'pct') parts.push('en %');
        if (F.has('live') && q.live) parts.push('tenu à jour');
        const s = parts.filter(Boolean).join(', ');
        return s ? s.charAt(0).toUpperCase() + s.slice(1) + '.' : '';
    }

    /* ─── Des paires [valeur, nombre] déjà comptées (exemples, statistiques de l'app, mes graphiques) ─── */
    const EMPTY_RE = /^(|\(vide\)|\(sans nom\)|inconnu|sans nom|sans prénom|non renseigné|pays non renseigné|naissance sans lieu|décès sans lieu|aucune? .* renseignée?)$/i;
    function post(pairs, q0) {
        const q = norm(q0); let list = (pairs || []).map(([v, n]) => [String(v ?? ''), Number(n) || 0]);
        let others = 0; const oi = list.findIndex(([v]) => v === 'autres'); if (oi >= 0) { others = list[oi][1]; list.splice(oi, 1); } // le « autres » déjà compté par la source : remis à la fin
        if (!q.empty) list = list.filter(([v]) => !EMPTY_RE.test(v.trim()));
        const timeish = list.length > 1 && list.every(([v]) => /^-?\d/.test(v) || /siècle|s\.$/.test(v));
        const sort = q.sort || '';
        const num = v => parseFloat(String(v).replace(/[^\d.-]/g, '')) || 0;
        if (sort === 'big') list.sort((a, b) => b[1] - a[1]); else if (sort === 'small') list.sort((a, b) => a[1] - b[1]);
        else if (sort === 'az') list.sort((a, b) => a[0].localeCompare(b[0], 'fr', {numeric: true})); else if (sort === 'za') list.sort((a, b) => b[0].localeCompare(a[0], 'fr', {numeric: true}));
        else if (sort === 'natural' && timeish) list.sort((a, b) => num(a[0]) - num(b[0]));
        if (q.limit > 0 && list.length > q.limit) { others += list.slice(q.limit).reduce((n, e) => n + e[1], 0); list = list.slice(0, q.limit); }
        if (others && q.others) list.push(['Autres', others]);
        if (q.unit === 'pct') { const tot = list.reduce((n, e) => n + e[1], 0); list = list.map(([v, n]) => [v, tot ? Math.round(n / tot * 1000) / 10 : 0]); }
        return list;
    }
    /** des réglages qui changent quelque chose aux paires (sinon rien n'est gardé : les anciens diagrammes restent tels quels) */
    const postOf = q => { const n = norm(q), out = {}; if (n.sort) out.sort = n.sort; if (n.limit) { out.limit = n.limit; out.others = n.others; } if (n.empty) out.empty = true; if (n.unit === 'pct') out.unit = 'pct'; return Object.keys(out).length ? out : null; };

    /* ─── « 🧮 Compter dans ma base » ─── */
    const mem = new Map();
    function count(q0) {
        const p = params(q0), key = JSON.stringify(p), hit = mem.get(key);
        if (hit && Date.now() - hit.t < 60000) return hit.p;
        const pr = A().api('diagram_app_count', p).catch(e => { mem.delete(key); throw e; });
        mem.set(key, {t: Date.now(), p: pr}); if (mem.size > 30) mem.delete(mem.keys().next().value);
        return pr;
    }
    /** la réponse du serveur → le tableau du diagramme (une ou plusieurs séries, selon le type) */
    function toSpec(spec, res, label = '') {
        const s = clone(spec), kind = s.kind, keep = (s.rows || []).reduce((m, r) => { const k = r.label ?? r.name ?? r.word; if (k !== undefined && r.color) m[k] = r.color; return m; }, {});
        const rows = res?.rows || [], names = res?.series || [];
        if (names.length && multiSeries(kind)) {
            s.rows = rows.map(r => { const o = {label: r.label, color: keep[r.label] || ''}; (r.values || []).forEach((v, i) => { o['s' + i] = v; }); return o; });
            const old = s.series || [];
            s.series = names.map((n, i) => ({name: n, ...(old[i]?.color ? {color: old[i].color} : n === 'Hommes' ? {color: '#4e79a7'} : n === 'Femmes' ? {color: '#e15759'} : {})}));
            return s;
        }
        const pairs = rows.map(r => [r.label, r.value]);
        const out = ext.diagramFillFrom ? ext.diagramFillFrom(s, pairs, label) : s;
        // le nom de la série : ce qu'on compte (sauf un nom donné à la main)
        const smp = (() => { try { return R()?.KINDS?.[kind]?.sample?.()?.series?.[0]?.name || ''; } catch (_) { return ''; } })(), cur = out.series?.[0]?.name || '';
        const auto = Object.values(WHAT_SUM).flatMap(w => [w, w + ' (%)']).concat(['Moyenne', 'Médiane', 'Nombre', smp]);
        if (out.series && (!cur || auto.includes(cur)) && res?.what) out.series = [{...out.series[0], name: {pct: WHAT_SUM[res.what] + ' (%)', avg: 'Moyenne', median: 'Médiane'}[res.unit] || WHAT_SUM[res.what]}, ...out.series.slice(1)];
        if (res?.unit_label && (R()?.KINDS?.[kind]?.options || []).some(o => o.k === 'unit')) out.o = {...(out.o || {}), unit: res.unit_label === '%' ? '%' : ' ' + res.unit_label};
        return out;
    }

    /* ─── Les dg_* du bloc ouvert (pour les données propres à chaque type) ─── */
    let current = null;
    function extra(spec) {
        if (spec && spec.__dg) return {...spec.__dg};
        const box = current?.isConnected ? current : null; if (!box) return {};
        const q = read(box), c = box._cfg || {};
        return dgParams(q, {period: c.period !== 'own'});
    }
    const setCurrent = box => { current = box; };

    /* ─── Les panneaux propres à chaque type : quels réglages communs, et où sont leurs anciens champs ─── */
    const GEO = {go: '[data-dgm-go]', hide: ['[data-dgm-anc]', '.dgm-period'], own: ['[data-dgm-from]', '[data-dgm-to]'], period: 'own', live: '[data-dgm-live]'};
    const C2 = {go: '[data-c2-go]', hide: ['[data-c2="anc"]', '.c2-period'], own: ['[data-c2="from"]', '[data-c2="to"]'], period: 'own'};
    const GN = {go: '[data-gn-go]', hide: ['[data-gn="scope"]', 'gn_root'], period: 'event'};
    const FAM = {go: '[data-dfa-go]', hide: ['[data-dfa="scope"]', 'dfa_root'], root: 'dfa_root'};
    const CUSTOM = {
        choropleth: GEO, flowmap: GEO, bubblemap: GEO, cartogram: GEO,
        dotmap: C2, hexmap: C2, godnames: C2, causesun: C2,
        calendar: GN, monthrose: GN, spiral: GN,
        fasurvie: {...FAM, period: 'birth'}, fametiers: {...FAM, period: false}, famariages: {...FAM, period: false},
        famois: {...FAM, hide: [...FAM.hide, '.dfa-period'], own: ['[data-dfa="from"]', '[data-dfa="to"]'], period: 'own'},
        crises: {go: '[data-dm-go]', hide: ['.dmo-period'], own: ['[data-dm="from"]', '[data-dm="to"]'], period: 'own'},
        alivepyr: {go: '[data-dm-go]', period: false}, chord: {go: '[data-dm-go]', period: false}, violin: {go: '[data-dm-go]', period: 'birth'},
    };
    // les types dont « 🌳 Des données de mon arbre » (kind.app) accepte le groupe et la période (lib/diagram_chiffres.php, diagram_adn_chiffres.php)
    const TREE = new Set(['bump', 'stream', 'histogram', 'boxplot', 'dumbbell', 'slope', 'waterfall', 'beeswarm', 'smallmult', 'ridgeline', 'marimekko', 'dotplot', 'nightingale', 'mobility']);
    const treeFields = kind => TREE.has(kind) ? ['pop', 'period', 'live'] : [];
    /** les champs communs d'un type à panneau propre (rien = le type n'en a pas l'usage) */
    const customFields = kind => { const c = CUSTOM[kind]; return c ? ['pop', ...(c.period ? ['period'] : [])] : []; };

    /** le bloc ajouté au panneau propre d'un type ; les anciens champs (« Seulement mes ancêtres », années) cachés et tenus à jour */
    function adopt(pane, kind, {onChange = null} = {}) {
        const c = CUSTOM[kind]; if (!c || !pane) return null;
        const go = pane.querySelector(c.go); if (!go) return null;
        const hideEl = sel => { const el = /^[a-z_]+$/.test(sel) ? pane.querySelector(`input[name="${sel}"]`)?.closest('.pk') : pane.querySelector(sel); if (!el) return null;
            const holder = el.matches('.pk') ? el : el.closest('label') || el; holder.hidden = true; holder.classList.add('h-dgo-legacy');
            if (el.matches('.pk')) { const labEl = el.previousElementSibling; if (labEl?.classList.contains('pk-lab')) { labEl.hidden = true; labEl.classList.add('h-dgo-legacy'); } }
            return el; };
        (c.hide || []).forEach(hideEl);
        const fields = customFields(kind), cfg = {fields, kind, period: c.period};
        const host = document.createElement('div'); host.className = 'h-dgo-host'; host.innerHTML = html({...DEF, limit: 0}, cfg);
        go.before(host);
        const box = host.querySelector('[data-dgo-box]');
        const liveEl = c.live ? pane.querySelector(c.live)?.closest('label') : null; if (liveEl) box.append(liveEl); // « Tenir à jour » en dernier, comme partout
        const sync = () => {
            const q = read(box);
            if (c.own) { const f = fromYear(q.from), t = toYear(q.to); const [a, b] = c.own.map(s => pane.querySelector(s)); if (a) a.value = f === null ? '' : String(f); if (b) b.value = t === null ? '' : String(t); }
            if (c.root) { const legacy = pane.querySelector(`input[name="${c.root}"]`)?.closest('.pk'); if (legacy && q.root) { try { PK().pickerSet(legacy, q.root); } catch (_) {} } }
            onChange?.(q);
        };
        bind(box, {cfg, onChange: sync});
        go.addEventListener('click', e => { current = box; if (!check(box)) { e.stopImmediatePropagation(); e.preventDefault(); } }, true); // avant l'écouteur du type
        current = box; sync();
        return box;
    }

    ext.diagramAppOpts = {DEF, ORDER, PRESETS, FROM_APPSTAT, WHAT, BY, POP, HELP, FAQ, norm, html, bind, read, check, refresh, summary, popText, periodText, params, dgParams, post, postOf, count, toSpec, extra, setCurrent, adopt,
        customFields, treeFields, multiSeries, yearsOf, fromYear, toYear, CUSTOM, TREE, get current() { return current; }};
})();
