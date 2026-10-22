/* LCNDA — 📊 Diagrammes, onglet « Depuis l'app » : un menu « Graphique » pour CHAQUE type.
 *  1. Les types à panneau propre (cartes, frises, éventail, survie, métiers, ADN, D23–D38…) : « Graphique » en tête du panneau,
 *     des points de départ tout prêts qui règlent les champs du panneau (et le groupe de personnes, la période) ;
 *     « ✏️ Sur mesure » laisse tout à la main. Rien n'est pris tant qu'on ne clique pas sur le bouton du panneau (« Prendre… »).
 *  2. Les types qui n'avaient rien ou presque (nuage de points, flux, organigramme, frises des personnes, cartes de chiffres,
 *     barre d'objectif) : des données de l'arbre (kind.app = {sources, fill}), dans « 🌳 Des données de mon arbre → Graphique ».
 * Chargé après heritage-diagrams-render.js et les fichiers des types ; heritage-diagrams.js appelle ext.diagramGraphique.mount(pane, kind).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const R = () => ext.diagramRender;
    const PK = () => window.LCNDA_PICKER;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const startId = () => Number(A()?.state?.bootstrap?.startPersonId) || 0;
    const api = (action, q = {}) => A().api(action, q);
    const yearOf = v => { const m = String(v || '').match(/-?\d{3,4}/); return m ? Number(m[0]) : null; };
    const dateTxt = v => String(v || '').replace(/-00/g, '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1').replace(/^(\d{4})-(\d{2})$/, '$2/$1');
    const NOW = new Date().getFullYear();

    /* ═════════ 1. Les points de départ des panneaux propres ═════════
     * [nom, réglages] ; réglages = {sélecteur dans le panneau: valeur} ;
     *  « @pop », « @from », « @to », « @gens » : les options communes (groupe de personnes, période) ;
     *  une liste de valeurs : les cases à cocher de ce sélecteur (cochées si leur valeur y est) ;
     *  « pk:nom » : un menu de choix (valeur = un numéro ou une liste, ou une fonction async qui la rend). */
    const ANC = {'@pop': 'anc'}, XIX = {'@from': '1801', '@to': '1900'}, XVIII = {'@from': '1701', '@to': '1800'};
    const gensList = (sel, list, word = g => `${g} générations`) => list.map(([g, l]) => [l || word(g), {[sel]: String(g)}]);
    const popList = (extra = {}) => [['Toute ma base', {...extra}], ['Mes ancêtres', {...extra, ...ANC}], ['Mes descendants', {...extra, '@pop': 'desc'}],
        ['Ma branche paternelle (côté père)', {...extra, '@pop': 'pat'}], ['Ma branche maternelle (côté mère)', {...extra, '@pop': 'mat'}]];
    const periods = (extra = {}) => [['Avant la Révolution (jusqu’en 1789)', {...extra, '@to': '1789'}], ['Au XVIIIe siècle', {...extra, ...XVIII}], ['Au XIXe siècle', {...extra, ...XIX}], ['Depuis 1900', {...extra, '@from': '1900'}]];
    const GEO = sel => [['Naissances par lieu', {[sel]: 'births'}], ['Naissances de mes ancêtres', {[sel]: 'births', ...ANC}], ['Décès par lieu', {[sel]: 'deaths'}], ['Mariages par lieu', {[sel]: 'marriages'}],
        ['Naissances, mariages et décès', {[sel]: 'all'}], ['Départs (nés ici, morts ailleurs)', {[sel]: 'departures'}], ['Arrivées (nés ailleurs, morts ici)', {[sel]: 'arrivals'}],
        ['Personnes différentes par lieu', {[sel]: 'people'}], ['Familles (patronymes différents) par lieu', {[sel]: 'surnames'}], ['Âge moyen au décès par lieu', {[sel]: 'age_death'}],
        ['Actes trouvés (événements avec une source)', {[sel]: 'sourced'}], ['Métiers (lieux où on les exerçait)', {[sel]: 'occupations'}], ['Recensements', {[sel]: 'census'}],
        ['Naissances au XIXe siècle', {[sel]: 'births', ...XIX}], ['Naissances avant la Révolution', {[sel]: 'births', '@to': '1789'}]];
    const C2EV = [['Naissances', {'[data-c2="ev"]': 'births'}], ['Naissances de mes ancêtres', {'[data-c2="ev"]': 'births', ...ANC}], ['Décès', {'[data-c2="ev"]': 'deaths'}], ['Mariages', {'[data-c2="ev"]': 'marriages'}],
        ['Résidences et recensements', {'[data-c2="ev"]': 'residences'}], ['Naissances, mariages et décès', {'[data-c2="ev"]': 'all'}], ['Tout au XIXe siècle', {'[data-c2="ev"]': 'all', ...XIX}], ['Tout, avant la Révolution', {'[data-c2="ev"]': 'all', '@to': '1789'}]];
    const TYPES = '[data-gn-type]', EVT = ['birth', 'bapt', 'marriage', 'death', 'burial'];
    const DATES = [['Naissances et baptêmes', {[TYPES]: ['birth', 'bapt']}], ['Mariages', {[TYPES]: ['marriage']}], ['Décès et sépultures', {[TYPES]: ['death', 'burial']}],
        ['Naissances, mariages et décès', {[TYPES]: EVT}], ['Les anniversaires de mes ancêtres', {[TYPES]: ['birth', 'bapt'], ...ANC}], ['Mariages de mes ancêtres', {[TYPES]: ['marriage'], ...ANC}],
        ['Naissances au XIXe siècle', {[TYPES]: ['birth', 'bapt'], ...XIX}]];
    const VIE_POP = (extra = {}) => [...popList(extra), ['Au XIXe siècle', {...extra, ...XIX}], ['Au XVIIIe siècle', {...extra, ...XVIII}]];
    const STEP = (sel, extra = {}) => [['Par siècle', {...extra, [sel]: '100'}], ['Par demi-siècle', {...extra, [sel]: '50'}], ['Par quart de siècle', {...extra, [sel]: '25'}], ['Par décennie', {...extra, [sel]: '10'}]];
    // les personnes pour les menus de choix à plusieurs (matrice de parenté, cousinages, frise des lieux)
    const idsAnc = n => async () => { const r = await api('diagram_genea', {what: 'fan', root: startId(), gens: Math.max(3, n)}); return (r.rows || []).filter(x => x.sosa < 2 ** n).map(x => x.id).slice(0, 20); };
    const idsSib = mode => async () => { if (!startId()) return []; const r = await api('diagram_more', {what: 'siblings', person: startId(), mode}); return (r.people || []).map(x => x.id).slice(0, 20); };
    const idsFamily = async () => { const [a, k] = await Promise.all([idsAnc(2)(), idsSib('children')().catch(() => [])]); return [...new Set([...a, ...k])].slice(0, 20); };

    const PANELS = {
        fan: [['Taux de recherche de mes ancêtres (5 générations)', {'[data-gn="gens"]': '5', '[data-gn="by"]': 'score'}], ['Régions de naissance (6 générations)', {'[data-gn="gens"]': '6', '[data-gn="by"]': 'state'}],
            ['Départements de naissance (6 générations)', {'[data-gn="gens"]': '6', '[data-gn="by"]': 'county'}], ['Pays de naissance (8 générations)', {'[data-gn="gens"]': '8', '[data-gn="by"]': 'country'}],
            ['Communes de naissance (5 générations)', {'[data-gn="gens"]': '5', '[data-gn="by"]': 'birth_place'}], ['Métiers de mes ancêtres (5 générations)', {'[data-gn="gens"]': '5', '[data-gn="by"]': 'occupation'}],
            ['Siècles de naissance (8 générations)', {'[data-gn="gens"]': '8', '[data-gn="by"]': 'century'}], ['Noms de famille (6 générations)', {'[data-gn="gens"]': '6', '[data-gn="by"]': 'last'}],
            ['Hommes et femmes (4 générations)', {'[data-gn="gens"]': '4', '[data-gn="by"]': 'gender'}], ['Le plus loin possible (10 générations)', {'[data-gn="gens"]': '10', '[data-gn="by"]': 'score'}]],
        sunburst: [['Ses enfants et petits-enfants', {'[data-gn="gens"]': '2'}], ['3 générations', {'[data-gn="gens"]': '3'}], ['4 générations', {'[data-gn="gens"]': '4'}], ['5 générations', {'[data-gn="gens"]': '5'}], ['Toute la descendance connue (8 générations)', {'[data-gn="gens"]': '8'}]],
        icicle: [['Ses enfants et petits-enfants', {'[data-c2="gens"]': '2'}], ['3 générations', {'[data-c2="gens"]': '3'}], ['4 générations', {'[data-c2="gens"]': '4'}], ['6 générations', {'[data-c2="gens"]': '6'}], ['Toute la descendance connue (10 générations)', {'[data-c2="gens"]': '10'}]],
        network: [['Ses liens directs (témoins, parrains, marraines)', {'[data-gn="depth"]': '1'}], ['Ses liens et les liens de ses liens', {'[data-gn="depth"]': '2'}], ['Tous les liens de ma base', {'[data-gn="depth"]': 'all'}]],
        arcs: [['Mariages entre familles (noms)', {'[data-gn="src"]': 'marriages'}], ['Implexe : un même ancêtre par plusieurs chemins', {'[data-gn="src"]': 'implexe'}], ['Témoins, parrains et marraines', {'[data-gn="src"]': 'witness'}]],
        venn: [['Mes ancêtres et les fiches avec une source', {'[data-gn-sets] input[type=checkbox]': ['sosa', 'sourced']}], ['Avec un portrait, avec une source', {'[data-gn-sets] input[type=checkbox]': ['photo', 'sourced']}],
            ['Mes ancêtres, avec portrait, avec source', {'[data-gn-sets] input[type=checkbox]': ['sosa', 'photo', 'sourced']}], ['Vivants, avec un portrait, avec une source', {'[data-gn-sets] input[type=checkbox]': ['living', 'photo', 'sourced']}],
            ['Mes ancêtres, hommes, avec source', {'[data-gn-sets] input[type=checkbox]': ['sosa', 'male', 'sourced']}]],
        calendar: DATES, monthrose: DATES,
        spiral: [['Les vies de toute ma base', {'[data-gn="what"]': 'lives'}], ['Les vies de mes ancêtres', {'[data-gn="what"]': 'lives', ...ANC}], ['Naissances, mariages et décès', {'[data-gn="what"]': 'events', [TYPES]: EVT}],
            ['Naissances seulement', {'[data-gn="what"]': 'events', [TYPES]: ['birth', 'bapt']}], ['Mariages seulement', {'[data-gn="what"]': 'events', [TYPES]: ['marriage']}], ['Décès seulement', {'[data-gn="what"]': 'events', [TYPES]: ['death', 'burial']}]],
        choropleth: GEO('[data-dgm-what]'), bubblemap: GEO('[data-dgm-what]'), cartogram: GEO('[data-dgm-what]'),
        flowmap: [['Lieu de naissance → lieu de décès', {'[data-dgm-what]': 'birth_death'}], ['Lieu de naissance → lieu du mariage', {'[data-dgm-what]': 'birth_marriage'}], ['D’une génération à l’autre', {'[data-dgm-what]': 'generation'}],
            ['Mes ancêtres : naissance → décès', {'[data-dgm-what]': 'birth_death', ...ANC}], ['Mes ancêtres : d’une génération à l’autre', {'[data-dgm-what]': 'generation', ...ANC}], ['Au XIXe siècle : naissance → décès', {'[data-dgm-what]': 'birth_death', ...XIX}]],
        dotmap: C2EV, hexmap: C2EV,
        storymap: [['Sa vie : les étapes avec un lieu', {'[data-c2="noplace"]': false}], ['Sa vie : toutes les étapes (même sans lieu)', {'[data-c2="noplace"]': true}]],
        godnames: [['Toute ma base', {}], ['Mes ancêtres', ANC], ['Avant la Révolution', {'@to': '1789'}], ['Au XIXe siècle', XIX]],
        causesun: [['Toute ma base', {}], ['Mes ancêtres', ANC], ['Mes descendants', {'@pop': 'desc'}], ['Avant 1900', {'@to': '1900'}], ['Depuis 1900', {'@from': '1900'}]],
        genbars: gensList('[data-dm="gens"]', [[3, 'Mes parents et grands-parents (3 générations)'], [4], [5], [6], [8], [10, 'Le plus loin possible (10 générations)']]),
        crises: [['Année par année', {'[data-dm="step"]': '1'}], ['Par 5 ans', {'[data-dm="step"]': '5'}], ['Par 10 ans', {'[data-dm="step"]': '10'}], ['Le XVIIIe siècle, année par année', {'[data-dm="step"]': '1', ...XVIII}],
            ['Le XIXe siècle, année par année', {'[data-dm="step"]': '1', ...XIX}], ['Mes ancêtres, par 5 ans', {'[data-dm="step"]': '5', ...ANC}]],
        siblings: [['Sa fratrie (elle comprise)', {'[data-dm="mode"]': 'siblings'}], ['Ses enfants', {'[data-dm="mode"]': 'children'}]],
        alivepyr: [[1700, 60], [1789, 60], [1800, 60], [1850, 60], [1900, 60], [1914, 60], [1950, 80], [NOW, 0]].map(([y, u]) => [y === NOW ? 'Qui vit aujourd’hui' : `Qui vivait en ${y}`, {'[data-dm="year"]': String(y), '[data-dm="unk"]': String(u)}]),
        accordion: [['Ses frères et sœurs (1 génération)', {'[data-dm="gens"]': '1'}], ['Ses cousins germains (2 générations)', {'[data-dm="gens"]': '2'}], ['Ses cousins issus de germains (3 générations)', {'[data-dm="gens"]': '3'}], ['4 générations', {'[data-dm="gens"]': '4'}], ['5 générations', {'[data-dm="gens"]': '5'}]],
        cousinage: [['Les cousins germains (2 générations)', {'[data-dm="gens"]': '2', '[data-dm="links"]': ''}], ['Les cousins issus de germains (3 générations)', {'[data-dm="gens"]': '3', '[data-dm="links"]': ''}],
            ['Jusqu’à 4 générations, tous les liens', {'[data-dm="gens"]': '4', '[data-dm="links"]': 'all'}], ['Jusqu’à 6 générations, tous les liens', {'[data-dm="gens"]': '6', '[data-dm="links"]': 'all'}]],
        kinmatrix: [['Moi, mes parents et mes grands-parents', {'pk:dm_ids': idsAnc(3)}], ['Moi et mes parents', {'pk:dm_ids': idsAnc(2)}], ['Ma fratrie', {'pk:dm_ids': idsSib('siblings')}], ['Mes parents, moi et mes enfants', {'pk:dm_ids': idsFamily}]],
        surnametree: gensList('[data-dm="gens"]', [[4], [6], [8], [10], [14, 'Le plus loin possible (14 générations)']]),
        ancestorgrid: [['Ce que je sais (6 générations)', {'[data-dm="gens"]': '6', '[data-dm="by"]': 'complete'}], ['Taux de recherche (8 générations)', {'[data-dm="gens"]': '8', '[data-dm="by"]': 'score'}],
            ['Régions de naissance (6 générations)', {'[data-dm="gens"]': '6', '[data-dm="by"]': 'state'}], ['Siècles de naissance (8 générations)', {'[data-dm="gens"]': '8', '[data-dm="by"]': 'century'}],
            ['Métiers (5 générations)', {'[data-dm="gens"]': '5', '[data-dm="by"]': 'occupation'}], ['Noms de famille (6 générations)', {'[data-dm="gens"]': '6', '[data-dm="by"]': 'last'}], ['Hommes et femmes (5 générations)', {'[data-dm="gens"]': '5', '[data-dm="by"]': 'gender'}]],
        chord: [['Les villages des deux époux (10 lieux)', {'[data-dm="mode"]': 'spouses', '[data-dm="top"]': '10'}], ['Les villages des deux époux (20 lieux)', {'[data-dm="mode"]': 'spouses', '[data-dm="top"]': '20'}],
            ['Le village de chacun → le lieu du mariage (10 lieux)', {'[data-dm="mode"]': 'marriage', '[data-dm="top"]': '10'}], ['Les 6 villages principaux', {'[data-dm="mode"]': 'spouses', '[data-dm="top"]': '6'}]],
        violin: [['Âge au décès, par siècle', {'[data-dm="what"]': 'ages_death', '[data-dm="by"]': 'century'}], ['Âge au décès, femmes et hommes', {'[data-dm="what"]': 'ages_death', '[data-dm="by"]': 'group'}],
            ['Âge au mariage, par siècle', {'[data-dm="what"]': 'ages_marriage', '[data-dm="by"]': 'century'}], ['Âge au mariage, femmes et hommes', {'[data-dm="what"]': 'ages_marriage', '[data-dm="by"]': 'group'}],
            ['Mes ancêtres : âge au décès, par siècle', {'[data-dm="what"]': 'ages_death', '[data-dm="by"]': 'century', ...ANC}]],
        faknown: [['Ses grands-parents et ses petits-enfants', {'[data-dfa="up"]': '2', '[data-dfa="down"]': '2'}], ['Quatre générations d’ancêtres', {'[data-dfa="up"]': '4', '[data-dfa="down"]': '0'}],
            ['Six générations d’ancêtres', {'[data-dfa="up"]': '6', '[data-dfa="down"]': '0'}], ['Ses descendants sur 4 générations', {'[data-dfa="up"]': '0', '[data-dfa="down"]': '4'}], ['Trois générations de chaque côté', {'[data-dfa="up"]': '3', '[data-dfa="down"]': '3'}]],
        fasurvie: [['Une courbe par siècle de naissance', {'[data-dfa="by"]': 'century'}], ['Femmes et hommes', {'[data-dfa="by"]': 'sex'}], ['Branche paternelle et maternelle', {'[data-dfa="by"]': 'branch'}],
            ['Mes ancêtres, génération par génération', {'[data-dfa="by"]': 'gen', ...ANC}], ['Une seule courbe pour toute ma base', {'[data-dfa="by"]': 'all'}], ['Nés au XIXe siècle, femmes et hommes', {'[data-dfa="by"]': 'sex', ...XIX}]],
        fametiers: [['Père → fils, sur 3 générations', {'[data-dfa="chain"]': 'male', '[data-dfa="gens"]': '3'}], ['Père → fils, sur 5 générations', {'[data-dfa="chain"]': 'male', '[data-dfa="gens"]': '5'}],
            ['Parents → enfants, sur 3 générations', {'[data-dfa="chain"]': 'parent', '[data-dfa="gens"]': '3'}], ['Mes ancêtres : père → fils', {'[data-dfa="chain"]': 'male', '[data-dfa="gens"]': '4', ...ANC}]],
        famariages: popList(), viedurees: VIE_POP(), vieveuvage: VIE_POP(), vieparents: VIE_POP(), vieecart: VIE_POP(),
        faimplexe: gensList('[data-dfa="gens"]', [[6], [8], [10], [12], [16], [20]]),
        famois: [['Toute ma base', {}], ['Mes ancêtres', ANC], ...periods()],
        fanaiss: [['Les 5 mères qui ont eu le plus d’enfants', {'[data-dfa="mode"]': 'all', '[data-dfa="top"]': '5'}], ['Les 10 mères qui ont eu le plus d’enfants', {'[data-dfa="mode"]': 'all', '[data-dfa="top"]': '10'}],
            ['Les mères parmi mes ancêtres', {'[data-dfa="mode"]': 'anc', '[data-dfa="top"]': '10'}]],
        falieux: [['Mes ancêtres sur 2 générations', {'[data-dfa="mode"]': 'anc', '[data-dfa="gens"]': '2'}], ['Mes ancêtres sur 3 générations', {'[data-dfa="mode"]': 'anc', '[data-dfa="gens"]': '3'}],
            ['Mes ancêtres sur 4 générations', {'[data-dfa="mode"]': 'anc', '[data-dfa="gens"]': '4'}], ['Ses parents, elle et ses enfants', {'[data-dfa="mode"]': 'family'}]],
        vieenfants: [...STEP('[data-dvi="step"]'), ['Mes ancêtres, par siècle', {'[data-dvi="step"]': '100', ...ANC}], ['Au XIXe siècle, par décennie', {'[data-dvi="step"]': '10', ...XIX}]],
        viesaisons: [...STEP('[data-dvi="step"]'), ['Mes ancêtres, par siècle', {'[data-dvi="step"]': '100', ...ANC}]],
        viefratries: [['Les 20 couples qui ont eu le plus d’enfants', {'[data-dvi="top"]': '20', '[data-dvi="adult"]': '15'}], ['Les 40 couples', {'[data-dvi="top"]': '40', '[data-dvi="adult"]': '15'}],
            ['Adulte à 21 ans (majorité d’autrefois)', {'[data-dvi="top"]': '20', '[data-dvi="adult"]': '21'}], ['Mes ancêtres', {'[data-dvi="top"]': '20', '[data-dvi="adult"]': '15', ...ANC}], ['Au XIXe siècle', {'[data-dvi="top"]': '20', '[data-dvi="adult"]': '15', ...XIX}]],
        vieavant: [['Par siècle, moins de 8 mois', {'[data-dvi="step"]': '100', '[data-dvi="limit"]': '8'}], ['Par demi-siècle, moins de 8 mois', {'[data-dvi="step"]': '50', '[data-dvi="limit"]': '8'}],
            ['Par décennie, moins de 8 mois', {'[data-dvi="step"]': '10', '[data-dvi="limit"]': '8'}], ['Très tôt : moins de 7 mois, par siècle', {'[data-dvi="step"]': '100', '[data-dvi="limit"]': '7'}], ['Mes ancêtres, par siècle', {'[data-dvi="step"]': '100', '[data-dvi="limit"]': '8', ...ANC}]],
        vieberceau: [['Depuis son lieu de naissance (8 générations)', {'[data-dvi="gens"]': '8', '[data-dvi="ref"]': 'root'}], ['Depuis son lieu de naissance (5 générations)', {'[data-dvi="gens"]': '5', '[data-dvi="ref"]': 'root'}],
            ['Depuis le berceau des plus anciens (10 générations)', {'[data-dvi="gens"]': '10', '[data-dvi="ref"]': 'oldest'}], ['Le plus loin possible (14 générations)', {'[data-dvi="gens"]': '14', '[data-dvi="ref"]': 'root'}]],
        viesigner: STEP('[data-dvi="step"]'),
        viepreuves: gensList('[data-dvi="gens"]', [[4], [6], [8], [10], [12]]),
        vieregistres: [['Les 8 communes les plus suivies', {'[data-dvi="top"]': '8'}], ['12 communes', {'[data-dvi="top"]': '12'}], ['20 communes', {'[data-dvi="top"]': '20'}], ['40 communes', {'[data-dvi="top"]': '40'}]],
        chromo: [['Tous les segments', {'[data-dac="min"]': '0'}], ['Segments d’au moins 7 cM (les plus sûrs)', {'[data-dac="min"]': '7'}], ['Segments d’au moins 10 cM', {'[data-dac="min"]': '10'}], ['Gros segments (20 cM et plus)', {'[data-dac="min"]': '20'}]],
        cmruler: [['Toutes les correspondances (150 au plus)', {'[data-dac="min"]': '0', '[data-dac="max"]': '150'}], ['Au moins 20 cM (150 au plus)', {'[data-dac="min"]': '20', '[data-dac="max"]': '150'}],
            ['Cousins proches (90 cM et plus)', {'[data-dac="min"]': '90', '[data-dac="max"]': '3000'}], ['Au moins 50 cM, toutes', {'[data-dac="min"]': '50', '[data-dac="max"]': '3000'}]],
    };
    const GO = '[data-gn-go], [data-dm-go], [data-dfa-go], [data-dgm-go], [data-c2-go], [data-dac-go]';

    /** les valeurs à poser : une fonction est appelée (personnes calculées) */
    const fire = el => { el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); };
    function setVal(el, v) {
        if (!el) return;
        if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked === !!v) return; el.checked = !!v; return fire(el); }
        const s = String(v ?? '');
        if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === s)) return; // pas cette valeur ici (un test ADN…) : on laisse
        if (el.value === s) return;
        el.value = s; fire(el);
    }
    const find = (pane, sel) => sel.startsWith('@') ? [...pane.querySelectorAll(`[data-dgo-box] [data-dgo="${sel.slice(1)}"]`)]
        : sel.startsWith('pk:') ? [...pane.querySelectorAll(`input[name="${sel.slice(3)}"]`)].map(i => i.closest('.pk')).filter(Boolean) : [...pane.querySelectorAll(sel)];
    const readVal = (el, sel) => sel.startsWith('pk:') ? (el.querySelector('input[type=hidden]')?.value || '') : el.type === 'checkbox' ? el.checked : el.value;
    async function applySet(pane, set, snap) {
        // ce que règle un autre point de départ et pas celui-ci revient comme à l'ouverture
        const all = {...Object.fromEntries(Object.keys(snap).map(k => [k, undefined])), ...set};
        for (const [sel, v0] of Object.entries(all)) {
            const els = find(pane, sel); if (!els.length) continue;
            if (v0 === undefined) { // retour à l'ouverture
                const old = snap[sel];
                if (sel.startsWith('pk:')) { els.forEach(pk => PK()?.pickerSet?.(pk, old ? String(old).split(',').map(Number).filter(Boolean) : [])); continue; }
                if (Array.isArray(old)) els.forEach((el, i) => setVal(el, old[i])); else els.forEach(el => setVal(el, old));
                continue;
            }
            const v = typeof v0 === 'function' ? await v0() : v0;
            if (sel.startsWith('pk:')) { els.forEach(pk => { PK()?.pickerSet?.(pk, Array.isArray(v) ? v : v ? [v] : []); pk.dispatchEvent(new CustomEvent('picker-change', {bubbles: true, detail: {name: sel.slice(3), value: (Array.isArray(v) ? v : [v]).join(',')}})); }); continue; }
            if (Array.isArray(v)) els.forEach(el => setVal(el, v.includes(el.value)));
            else els.forEach(el => setVal(el, v));
        }
    }
    /** « Graphique » en tête d'un panneau propre ; rien à faire pour un type sans points de départ */
    function mount(pane, kind, {onApply = null} = {}) {
        const list = PANELS[kind]; if (!pane || !list?.length || pane.querySelector('[data-dgg]')) return null;
        const app = pane.querySelector('.h-dg-app') || pane, head = app.querySelector('h4'), after = head?.nextElementSibling?.matches('p.muted') ? head.nextElementSibling : head;
        const lab = document.createElement('label'); lab.className = 'h-dgg';
        lab.innerHTML = `<span>Graphique</span><select data-dgg aria-label="Graphique : un point de départ tout prêt"><option value="">✏️ Sur mesure (les réglages ci-dessous)</option>${list.map(([l], i) => `<option value="${i}">${esc(l)}</option>`).join('')}</select><small class="muted" data-dgg-hint hidden></small>`;
        if (after) after.after(lab); else app.prepend(lab);
        // l'état de départ des champs que les points de départ règlent
        const keys = [...new Set(list.flatMap(([, s]) => Object.keys(s)))], snap = {};
        const takeSnap = () => keys.forEach(sel => { const els = find(pane, sel); if (!els.length) return; snap[sel] = els.length > 1 && els[0].type === 'checkbox' ? els.map(e => e.checked) : readVal(els[0], sel); });
        takeSnap();
        const sel = lab.querySelector('select'), hint = lab.querySelector('[data-dgg-hint]');
        sel.addEventListener('change', async () => {
            const p = list[Number(sel.value)]; hint.hidden = true; if (sel.value === '' || !p) return;
            keys.forEach(k => { if (!(k in snap)) { const els = find(pane, k); if (els.length) snap[k] = els.length > 1 && els[0].type === 'checkbox' ? els.map(e => e.checked) : readVal(els[0], k); } }); // venus après (ensembles, tests ADN…)
            sel.disabled = true;
            try { await applySet(pane, p[1], snap); } catch (err) { A().toast(err.message || 'Ce point de départ n’a pas pu être réglé.', 'error'); } finally { sel.disabled = false; }
            const go = pane.querySelector(GO);
            if (go) { hint.textContent = `Réglé. Clique sur « ${go.textContent.trim()} » pour voir le dessin.`; hint.hidden = false; }
            onApply?.(p);
        });
        // une main sur un réglage du panneau : on repasse en « Sur mesure »
        pane.addEventListener('change', e => { if (!e.isTrusted || e.target === sel || sel.disabled) return; if (sel.value !== '') { sel.value = ''; hint.hidden = true; } });
        return sel;
    }

    /* ═════════ 2. Des données de l'arbre pour les types qui n'en avaient pas (ou une seule) ═════════ */
    const need = (cond, msg) => { if (!cond) throw new Error(msg); };
    const fan = async gens => { const r = await api('diagram_genea', {what: 'fan', root: startId(), gens: Math.max(3, gens)}); need(r.rows?.length, 'Pas d’ascendance : choisis une personne de départ (Personnes → sa fiche → « Personne de départ »).'); return r; };
    const genOf = sosa => Math.floor(Math.log2(sosa)) + 1;
    const numbers = (what, extra = {}) => api('diagram_numbers', {what, ...extra});
    const lifeRow = (p, role) => { const b = dateTxt(p.birth), alive = !p.death && p.living !== false && (yearOf(p.birth) || 0) > NOW - 105;
        return b ? {name: p.name, roles: role, start: b, end: p.death ? dateTxt(p.death) : alive ? '' : b, note: !p.death && !alive ? 'décès inconnu' : ''} : null; };
    const GEN_COLORS = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#b07aa1', '#76b7b2', '#edc948', '#9c755f'];
    const genWord = g => g === 1 ? 'La personne de départ' : g === 2 ? 'Parents' : g === 3 ? 'Grands-parents' : g === 4 ? 'Arrière-grands-parents' : `Génération ${g}`;
    async function sibs(mode) { need(startId(), 'Choisis d’abord une personne de départ.'); const r = await api('diagram_more', {what: 'siblings', person: startId(), mode}); need(r.people?.length, mode === 'children' ? 'Pas d’enfant connu pour la personne de départ.' : 'Pas de fratrie connue.'); return r; }
    const APP = {
        timeline: {sources: [['anc:3', 'Mes ancêtres sur 3 générations (parents, grands-parents)'], ['anc:4', 'Mes ancêtres sur 4 générations'], ['anc:5', 'Mes ancêtres sur 5 générations'],
            ['sib', 'La fratrie de la personne de départ'], ['kids', 'Les enfants de la personne de départ'], ['desc:2', 'Ses enfants et petits-enfants']],
            fill: async (spec, key) => { const [w, n] = key.split(':'); let rows = [], roles = [], title = '';
                if (w === 'anc') { const r = await fan(Number(n)); const list = r.rows.filter(x => x.sosa < 2 ** Number(n)).sort((a, b) => a.sosa - b.sosa);
                    rows = list.map(p => lifeRow(p, genWord(genOf(p.sosa)))).filter(Boolean); roles = [...new Set(list.map(p => genWord(genOf(p.sosa))))].map((role, i) => ({role, color: GEN_COLORS[i % 8]})); title = `Les vies de mes ancêtres (${n} générations)`; }
                else if (w === 'desc') { const r = await api('diagram_genea', {what: 'desc', root: startId(), gens: Number(n) || 2}); const ids = (r.nodes || []).map(x => x.id).slice(0, 120); need(ids.length > 1, 'Pas de descendance connue.');
                    const pp = await api('diagram_people', {ids: ids.join(',')}), gen = Object.fromEntries((r.nodes || []).map(x => [x.id, x.gen]));
                    rows = (pp.people || []).map(p => lifeRow(p, ['La personne de départ', 'Enfants', 'Petits-enfants', 'Arrière-petits-enfants'][gen[p.id]] || 'Descendants')).filter(Boolean); roles = ['La personne de départ', 'Enfants', 'Petits-enfants'].map((role, i) => ({role, color: GEN_COLORS[i]})); title = 'Sa descendance'; }
                else { const r = await sibs(w === 'kids' ? 'children' : 'siblings'); rows = r.people.map(p => lifeRow(p, p.sex === 'h' ? 'Homme' : p.sex === 'f' ? 'Femme' : 'Vie')).filter(Boolean); roles = [{role: 'Homme', color: '#4e79a7'}, {role: 'Femme', color: '#e15759'}]; title = r.title || ''; }
                need(rows.length, 'Aucune date de naissance pour ces personnes.');
                spec.rows = rows; spec.roles = roles; spec.events = spec.events?.filter(e => e.date) || []; spec.o = {...(spec.o || {}), title, order: 'start'}; return spec; }},
        chrono: {sources: [['story', 'La vie de la personne de départ, étape par étape'], ['anc:3', 'Naissances et décès de mes ancêtres (3 générations)'], ['anc:4', 'Naissances et décès de mes ancêtres (4 générations)'],
            ['sib', 'Naissances, mariages et décès de sa fratrie'], ['kids', 'La naissance de ses enfants']],
            fill: async (spec, key) => { const [w, n] = key.split(':'); let rows = [], title = '';
                if (w === 'story') { need(startId(), 'Choisis d’abord une personne de départ.'); const r = await api('diagram_cartes2', {what: 'story', person: startId()});
                    rows = (r.steps || []).filter(s => s.date || s.year).map(s => ({date: s.date || String(s.year), label: `${s.kind}${s.with ? ' avec ' + s.with : ''}${s.place ? ' à ' + s.place : ''}`})); title = r.name ? `La vie de ${r.name}` : ''; }
                else if (w === 'anc') { const r = await fan(Number(n)); r.rows.filter(x => x.sosa < 2 ** Number(n)).forEach(p => { if (p.birth) rows.push({date: dateTxt(p.birth), label: `Naissance de ${p.name}`}); if (p.death) rows.push({date: dateTxt(p.death), label: `Décès de ${p.name}`}); }); title = 'Mes ancêtres : naissances et décès'; }
                else { const r = await sibs(w === 'kids' ? 'children' : 'siblings'); r.people.forEach(p => { if (p.birth) rows.push({date: dateTxt(p.birth), label: `Naissance de ${p.name}`});
                    if (w === 'sib') { String(p.marriages || '').split(', ').filter(Boolean).slice(0, 2).forEach(m => rows.push({date: dateTxt(m), label: `Mariage de ${p.name}`})); if (p.death) rows.push({date: dateTxt(p.death), label: `Décès de ${p.name}`}); } }); title = r.title || ''; }
                need(rows.length, 'Aucune date pour ce choix.');
                rows.sort((a, b) => (yearOf(a.date) ?? 9999) - (yearOf(b.date) ?? 9999)); spec.rows = rows.slice(0, 80); spec.o = {...(spec.o || {}), title}; return spec; }},
        scatter: {sources: [['birth_death', 'Année de naissance et âge au décès (une personne = un point)'], ['marr_death', 'Âge au mariage et âge au décès'], ['couples', 'Âge de l’époux et âge de l’épouse au mariage']],
            fill: async (spec, key) => { let rows = [], xl = '', yl = '', title = '';
                if (key === 'couples') { const r = await numbers('couples'); rows = (r.items || []).slice(0, 400).map(x => ({label: `${x.label} (${x.year})`, x: x.a, y: x.b, size: 1})); xl = 'Âge de l’époux'; yl = 'Âge de l’épouse'; title = 'Âge des époux au mariage'; }
                else { const [d, o] = await Promise.all([numbers('ages_death'), numbers(key === 'birth_death' ? 'birth_years' : 'ages_marriage')]); const other = new Map((o.items || []).map(x => [x.id, x.value]));
                    rows = (d.items || []).filter(x => other.has(x.id)).slice(0, 600).map(x => ({label: x.name, x: other.get(x.id), y: x.value, size: 1, color: x.group === 'Femmes' ? '#e15759' : x.group === 'Hommes' ? '#4e79a7' : ''}));
                    xl = key === 'birth_death' ? 'Année de naissance' : 'Âge au mariage'; yl = 'Âge au décès'; title = key === 'birth_death' ? 'Âge au décès selon l’année de naissance' : 'Âge au mariage et âge au décès'; }
                need(rows.length, 'Pas assez de dates dans l’arbre pour ce choix.');
                spec.rows = rows; spec.o = {...(spec.o || {}), title, xLabel: xl, yLabel: yl, maxBubble: 8, subtitle: key === 'couples' ? '' : 'bleu : hommes · rouge : femmes'}; return spec; }},
        sankey: {sources: [['mob:sons', 'Métier du père → métier du fils'], ['mob:daughters', 'Métier du père → métier de la fille'], ['geo:birth_death:county', 'Département de naissance → département de décès'],
            ['geo:birth_marriage:county', 'Département de naissance → département du mariage'], ['geo:generation:county', 'Département du parent → département de l’enfant'], ['geo:birth_death:country', 'Pays de naissance → pays de décès'], ['geo:birth_death:name', 'Commune de naissance → commune de décès']],
            fill: async (spec, key) => { const [w, a, b] = key.split(':'); let rows = [], title = '';
                if (w === 'mob') { const r = await api('diagram_adn_numbers', {what: 'mobility', who: a}); need(r.rows?.length, 'Aucun couple père / enfant dont les deux métiers sont connus.');
                    const kid = a === 'sons' ? 'Fils' : 'Fille'; rows = r.rows.filter(x => x.count > 0).sort((x, y) => y.count - x.count).slice(0, 30).map(x => ({from: `Père : ${x.from}`, to: `${kid} : ${x.to}`, value: x.count})); title = `Métier du père, métier ${a === 'sons' ? 'du fils' : 'de la fille'}`; }
                else { const r = await api('diagram_geo', {what: a}); const pl = new Map((r.places || []).map(p => [Number(p.id), p])), name = id => { const p = pl.get(Number(id)); return p ? (String(p[b] || '').trim() || (b === 'name' ? '' : p.name)) : ''; };
                    const agg = new Map(); (r.pairs || []).forEach(([x, y, n]) => { const f = name(x), t = name(y); if (!f || !t) return; const k = f + '\u0000' + t; agg.set(k, (agg.get(k) || 0) + Number(n || 0)); });
                    const [s1, s2] = a === 'birth_death' ? ['°', '†'] : a === 'birth_marriage' ? ['°', '⚭'] : ['Parent :', 'Enfant :'];
                    rows = [...agg].sort((x, y) => y[1] - x[1]).slice(0, 30).map(([k, value]) => { const [f, t] = k.split('\u0000'); return {from: `${s1} ${f}`, to: `${s2} ${t}`, value}; });
                    need(rows.length, 'Pas assez de lieux connus des deux côtés.'); title = (SANKEY_L[key] || ''); }
                spec.rows = rows; spec.o = {...(spec.o || {}), title}; return spec; }},
        orgchart: {sources: [['anc:3', 'Mes ancêtres sur 3 générations'], ['anc:4', 'Mes ancêtres sur 4 générations'], ['desc:2', 'Sa descendance sur 2 générations'], ['desc:3', 'Sa descendance sur 3 générations']],
            fill: async (spec, key) => { const [w, n] = key.split(':'); const used = new Map(), uniq = nm => { let k = nm, i = 2; while (used.has(k)) k = `${nm} (${i++})`; used.set(k, 1); return k; }; let rows = [];
                if (w === 'anc') { const r = await fan(Number(n)), bySosa = new Map(); r.rows.filter(x => x.sosa < 2 ** Number(n)).sort((a, b) => a.sosa - b.sosa).forEach(p => { const nm = uniq(p.name); bySosa.set(p.sosa, nm);
                    rows.push({name: nm, parent: p.sosa > 1 ? bySosa.get(Math.floor(p.sosa / 2)) || '' : '', detail: [p.birth_year, p.death_year].some(Boolean) ? `${p.birth_year || '?'} – ${p.death_year || ''}` : '', color: p.gender === 'female' ? '#e15759' : p.gender === 'male' ? '#4e79a7' : ''}); }); }
                else { const r = await api('diagram_genea', {what: 'desc', root: startId(), gens: Number(n) || 2}); need((r.nodes || []).length > 1, 'Pas de descendance connue.'); const byId = new Map();
                    r.nodes.slice(0, 120).forEach(x => { const nm = uniq(x.name); byId.set(x.id, nm); rows.push({name: nm, parent: x.parent ? byId.get(x.parent) || '' : '', detail: x.year ? `° ${x.year}` : '', color: x.gender === 'female' ? '#e15759' : x.gender === 'male' ? '#4e79a7' : ''}); }); }
                need(rows.length, 'Rien à dessiner pour ce choix.');
                spec.rows = rows; spec.o = {...(spec.o || {}), title: w === 'anc' ? `Mes ancêtres (${n} générations)` : 'Sa descendance', oneColor: false}; return spec; }},
        kpi: {sources: [['ancestors', 'Mes ancêtres en chiffres (trouvés, sourcés, taux de recherche)'], ['quality', 'La qualité de ma base (sources, noms, lieux)']],
            fill: async (spec, key) => {
                if (key === 'ancestors') { const r = await fan(10), byG = {}; r.rows.forEach(p => { const g = genOf(p.sosa); (byG[g] = byG[g] || []).push(p); });
                    const anc = r.rows.filter(p => p.sosa > 1), found8 = anc.filter(p => genOf(p.sosa) <= 8).length, exp8 = 2 ** 8 - 2, src = anc.filter(p => p.sourced).length, sc = anc.length ? Math.round(anc.reduce((a, p) => a + (p.score || 0), 0) / anc.length) : 0;
                    const far = Math.max(...Object.keys(byG).map(Number));
                    spec.rows = [{label: 'Ancêtres trouvés (10 générations)', value: anc.length, spark: Object.keys(byG).sort((a, b) => a - b).map(g => byG[g].length).join(' ')}, {label: 'Trouvés sur 8 générations', value: Math.round(found8 / exp8 * 1000) / 10, unit: '%', good: 75, bad: 40, note: `${found8} sur ${exp8}`},
                        {label: 'Ancêtres avec une source', value: anc.length ? Math.round(src / anc.length * 1000) / 10 : 0, unit: '%', good: 60, bad: 25, note: `${src} sur ${anc.length}`}, {label: 'Taux de recherche moyen', value: sc, unit: '%', good: 70, bad: 40}, {label: 'Génération la plus lointaine', value: far}];
                    spec.o = {...(spec.o || {}), title: 'Mes ancêtres en chiffres', subtitle: r.root_name ? `à partir de ${r.root_name}` : '', source: ''}; return spec; }
                const O = ext.diagramAppOpts; need(O?.count, 'Les chiffres ne sont pas encore prêts.');
                const [src, liv, names, places] = await Promise.all([O.count({what: 'persons', by: 'sourced', limit: 0}), O.count({what: 'persons', by: 'living', limit: 0}), O.count({what: 'persons', by: 'last_name', limit: 0}), O.count({what: 'births', by: 'commune', limit: 0})]);
                const part = (res, re) => { const rows = res?.rows || [], tot = rows.reduce((a, x) => a + Number(x.value || 0), 0), hit = rows.filter(x => re.test(String(x.label))).reduce((a, x) => a + Number(x.value || 0), 0); return [tot ? Math.round(hit / tot * 1000) / 10 : 0, hit, tot]; };
                const [ps, hs, ts] = part(src, /^avec/i), [pd] = part(liv, /décéd/i);
                spec.rows = [{label: 'Fiches avec une source', value: ps, unit: '%', good: 60, bad: 25, note: `${hs} sur ${ts}`}, {label: 'Personnes décédées', value: pd, unit: '%'},
                    {label: 'Noms de famille différents', value: (names?.rows || []).filter(x => !/^(inconnu|sans nom|autres)$/i.test(x.label)).length}, {label: 'Communes de naissance', value: (places?.rows || []).filter(x => !/^(inconnu|autres)$/i.test(x.label)).length}];
                spec.o = {...(spec.o || {}), title: 'La qualité de ma base', subtitle: '', source: ''}; return spec; }},
        bullet: {sources: [['sourced', 'Ancêtres avec une source, génération par génération'], ['score', 'Taux de recherche moyen, génération par génération'], ['dated', 'Ancêtres dont on connaît la date de naissance, par génération']],
            fill: async (spec, key) => { const r = await fan(8), byG = {}; r.rows.filter(p => p.sosa > 1).forEach(p => { const g = genOf(p.sosa); (byG[g] = byG[g] || []).push(p); });
                const val = l => key === 'score' ? Math.round(l.reduce((a, p) => a + (p.score || 0), 0) / l.length) : Math.round(l.filter(p => key === 'sourced' ? p.sourced : !!p.birth).length / l.length * 100);
                spec.rows = Object.keys(byG).map(Number).sort((a, b) => a - b).map(g => ({label: `Génér. ${g}`, value: val(byG[g]), target: key === 'dated' ? 90 : 75, max: 100, zones: '50;75'}));
                need(spec.rows.length, 'Pas d’ancêtre trouvé.');
                spec.o = {...(spec.o || {}), unit: ' %', title: {sourced: 'Ancêtres avec une source', score: 'Taux de recherche, génération par génération', dated: 'Date de naissance connue'}[key], subtitle: r.root_name ? `à partir de ${r.root_name} (parmi les ancêtres trouvés)` : '', source: 'Objectif à changer dans le tableau'}; return spec; }},
    };
    const SANKEY_L = Object.fromEntries(APP.sankey.sources);
    // brancher : un type sans sources en reçoit ; un type qui en a déjà (cartes de chiffres, barre d'objectif) garde les siennes en premier
    function wire() {
        const K = R()?.KINDS; if (!K) return false;
        Object.entries(APP).forEach(([k, add]) => { const kind = K[k]; if (!kind || kind.fromApp) return;
            if (!kind.app) { kind.app = {sources: add.sources, fill: add.fill}; return; }
            if (kind.app._plus) return;
            const old = kind.app, mine = new Set(add.sources.map(s => s[0]));
            kind.app = {_plus: true, sources: [...old.sources, ...add.sources.filter(s => !old.sources.some(o => o[0] === s[0]))], fill: (spec, key) => (mine.has(key) ? add.fill(spec, key) : old.fill(spec, key))};
        });
        return true;
    }
    if (!wire()) document.addEventListener('DOMContentLoaded', wire);
    ext.diagramGraphique = {PANELS, APP, mount, applySet, wire};
})();
