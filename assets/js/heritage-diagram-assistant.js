/* LCNDA — 💬 « Je veux représenter… » (maquette docs/design/idees-suite.html, partie 2) : on écrit sa question en français,
 * l'app comprend les mots (sans intelligence artificielle : des mots et des sujets connus) et propose 3 diagrammes faits sur la base,
 * avec un aperçu et la raison du choix ; « Faire ce diagramme » l'ouvre dans l'éditeur (tout reste modifiable).
 * Compris : le sujet (naissances, décès, mariages, âges, prénoms, noms, métiers, lieux, migrations, mois, vies, dates approchées, alliances),
 * l'envie (évolution, comparaison, répartition, classement, carte, parcours, distance), les filtres (années, « au XIXe siècle »,
 * un lieu de la base, un nom de famille, hommes ou femmes).
 *   ext.diagramAssistant = {parse, suggest, html, bind}
 * Dans la galerie « Nouveau diagramme » (heritage-diagrams.js). Essai : tests/test-diagram-assistant.js.
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const R = () => ext.diagramRender, M = () => ext.diagramManquants;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');
    const ROMAN = {i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20, xxi: 21};

    /* ═════ comprendre la phrase ═════ */
    const SUBJECTS = [ // l'ordre compte : les plus précis d'abord
        ['agemarriage', /\bage\b.*\bmari|\bmari\w*.*\ba quel age|\bage au mariage/], ['agedeath', /\bage\b.*\b(deces|mort|meur)|esperance|longevit|vivai\w* vieux|vecu combien|combien de temps.*vi|\bmort\w* jeunes?\b|mortalite/],
        ['uncertain', /incertain|approximati|\bvers \d|dates? (floue|approchee)|marge/], ['months', /\bmois\b|saison|printemps|hiver|ete\b|automne/],
        ['alliances', /alliance|entre (les )?familles|qui a epouse qui|qui se mariait avec|liens? entre/], ['migrations', /migr|demenag|deplac|bouge|parcours|partis?\b|quitt|exode|ou (ils|elles|on) (sont |est )?(alle|parti|mort)|devien/],
        ['distance', /distance|\bloin\b|\bkm\b|kilometre|a quelle distance/], ['lifespans', /\bvies\b|duree de vie|qui vivait|quand vivai|contemporain|en meme temps|chevauch/],
        ['firstnames', /prenom/], ['surnames', /noms? de famille|patronyme|\bnoms\b/], ['occupations', /metier|profession|travail|travaill|emploi|occupation/],
        ['origins', /d ou (ils |elles |on )?(vien|venai)|origine|vienn|venai|lieux? de naissance|ou (sont|etaient) nes|villages?\b|villes?\b|communes?\b|region/],
        ['births', /naiss|\bnes?\b|\bnees?\b|bapte|enfant/], ['deaths', /deces|\bmort|meur|decede|sepult|inhum|enterr/], ['marriages', /mariage|\bmarie|epous|noces|union/],
        ['ancestors', /ancetre|ascendan|arbre|genealog|lignee|descendan/],
    ];
    const INTENTS = [['flow', /\bvers\b|passage|parcours|devient|qui devient|de .+ a .+/], ['map', /\bcarte\b|\bou\b|\blieu|\bville|\bvillage|\bregion|\bfrance\b/], ['compare', /compar|\bselon\b|par sexe|hommes? et (les )?femmes|garcons? et (les )?filles|\bavant\b.*\bapres\b|\bdifferen/],
        ['evolution', /evolu|au fil|chaque (annee|decennie|siecle)|par (annee|decennie|siecle)|dans le temps|au cours|tendance|augment|diminu|epoque/], ['share', /repartition|proportion|\bpart\b|parts|pourcent|%/], ['top', /plus (donne|frequent|courant|repandu|nombreu)|classement|\btop\b|principa|les plus/]];
    /** parse(texte, D) → {subject, intents, from, to, place, surname, sex, words} */
    function parse(text, D = null) {
        const t = ` ${fold(text)} `, out = {subject: '', intents: [], from: null, to: null, place: '', surname: '', sex: ''};
        out.subject = (SUBJECTS.find(([, rx]) => rx.test(t)) || [''])[0];
        out.intents = INTENTS.filter(([, rx]) => rx.test(t)).map(([k]) => k);
        let m;
        if ((m = t.match(/entre (\d{3,4}) et (\d{3,4})/)) || (m = t.match(/de (\d{3,4}) a (\d{3,4})/)) || (m = t.match(/(\d{3,4}) ?[-–] ?(\d{3,4})/))) { out.from = Math.min(+m[1], +m[2]); out.to = Math.max(+m[1], +m[2]); }
        else { if ((m = t.match(/(?:depuis|apres|a partir de) (\d{3,4})/))) out.from = +m[1]; if ((m = t.match(/(?:avant|jusqu ?en|jusqu a) (\d{3,4})/))) out.to = +m[1]; }
        if ((m = t.match(/\b([xvi]{1,5})e? (?:et |a |au )?(?:([xvi]{1,5})e )?siecles?/)) && ROMAN[m[1]]) { const c = ROMAN[m[1]], c2 = m[2] && ROMAN[m[2]] ? ROMAN[m[2]] : c; out.from = (c - 1) * 100 + 1; out.to = c2 * 100; }
        if ((m = t.match(/\b(\d{2})e siecle/))) { const c = +m[1]; out.from = (c - 1) * 100 + 1; out.to = c * 100; }
        if (/\b(hommes?|garcons?)\b/.test(t) && !/\b(femmes?|filles?)\b/.test(t)) out.sex = 'm'; else if (/\b(femmes?|filles?)\b/.test(t) && !/\b(hommes?|garcons?)\b/.test(t)) out.sex = 'f';
        if (/\b(hommes?|garcons?)\b/.test(t) && /\b(femmes?|filles?)\b/.test(t) && !out.intents.includes('compare')) out.intents.push('compare');
        if (D) {
            const names = Object.values(D.places || {}).map(p => p[0]).filter(Boolean).sort((a, b) => b.length - a.length);
            out.place = names.find(n => n.length > 2 && t.includes(` ${fold(n)} `)) || '';
            const sur = [...new Set((D.people || []).map(p => String(p.l || '').trim()).filter(x => x.length > 2))].sort((a, b) => b.length - a.length);
            out.surname = (sur.find(n => t.includes(` ${fold(n)} `) || t.includes(` ${fold(n)}s `)) || '').toUpperCase();
        }
        return out;
    }

    /* ═════ fabriquer les diagrammes ═════ */
    const ROM = n => [['M', 1000], ['CM', 900], ['D', 500], ['CD', 400], ['C', 100], ['XC', 90], ['L', 50], ['XL', 40], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]].reduce((s, [r, v]) => { while (n >= v) { s += r; n -= v; } return s; }, '');
    const centuryOf = y => i18n('{c}e siècle', {c: ROM(Math.floor((y - 1) / 100) + 1)});
    const placeName = (D, id) => (id && D.places[id] ? D.places[id][0] : '');
    const pkey = n => fold(n).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    const top = (arr, n) => { const m = new Map(); arr.forEach(k => { if (k) m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n); };
    const fullName = p => [p.f, String(p.l || '').toUpperCase()].filter(Boolean).join(' ');
    const dist = (D, a, b) => { const x = D.places[a], y = D.places[b]; if (!x || !y || !Number.isFinite(x[1]) || !Number.isFinite(y[1])) return NaN; const r = Math.PI / 180, h = Math.sin((y[1] - x[1]) * r / 2) ** 2 + Math.cos(x[1] * r) * Math.cos(y[1] * r) * Math.sin((y[2] - x[2]) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
    /** les personnes qui passent les filtres (le lieu : de naissance ou de décès ; les années : celles de l'événement regardé) */
    function people(D, q, yearOf = p => p.by) {
        return (D.people || []).filter(p => {
            if (q.sex && p.g !== q.sex) return false;
            if (q.surname && String(p.l || '').toUpperCase() !== q.surname) return false;
            if (q.place && placeName(D, p.bp) !== q.place && placeName(D, p.dp) !== q.place) return false;
            const y = yearOf(p); if ((q.from || q.to) && !Number.isFinite(y)) return false;
            if (q.from && y < q.from) return false; if (q.to && y > q.to) return false;
            return true;
        });
    }
    const perDecade = (list, yOf, splitOf = null) => {
        const ys = list.map(yOf).filter(Number.isFinite); if (!ys.length) return null;
        const a = Math.floor(Math.min(...ys) / 10) * 10, b = Math.floor(Math.max(...ys) / 10) * 10, labels = []; for (let x = a; x <= b; x += 10) labels.push(x);
        const groups = splitOf ? [...new Set(list.map(splitOf).filter(Boolean))] : ['·'];
        const rows = labels.map(x => { const r = {label: String(x)}; groups.forEach((g, i) => { r['s' + i] = list.filter(p => Number.isFinite(yOf(p)) && Math.floor(yOf(p) / 10) * 10 === x && (!splitOf || splitOf(p) === g)).length; }); return r; });
        return {rows, series: groups.map(g => ({name: g === '·' ? '' : g}))};
    };
    const sexName = p => (p.g === 'm' ? i18n('Hommes') : p.g === 'f' ? i18n('Femmes') : '');
    const filtTxt = q => [q.place && i18n('à {p}', {p: q.place}), q.surname, q.sex === 'm' ? i18n('hommes') : q.sex === 'f' ? i18n('femmes') : '', q.from && q.to ? `${q.from}-${q.to}` : q.from ? i18n('depuis {y}', {y: String(q.from)}) : q.to ? i18n('avant {y}', {y: String(q.to)}) : ''].filter(Boolean).join(', ');
    const titled = (t, q) => (filtTxt(q) ? `${t} (${filtTxt(q)})` : t);

    /** suggest(texte, D) → {q, items: [{kind, title, reason, spec}], message} */
    function suggest(text, D) {
        const q = parse(text, D), I = new Set(q.intents), items = [];
        const add = (kind, title, reason, spec) => { if (!R()?.KINDS?.[kind] || !spec) return; spec.kind = kind; spec.o = {...(spec.o || {}), title}; items.push({kind, title, reason: i18n(reason), spec}); };
        const evt = {births: ['Naissances', p => p.by], deaths: ['Décès', p => p.dy]};
        const S = q.subject || (I.has('map') ? 'origins' : '');
        if (S === 'births' || S === 'deaths') {
            const [nm, yOf] = evt[S], list = people(D, q, yOf), title = titled(i18n(S === 'births' ? 'Les naissances' : 'Les décès'), q);
            const cmp = I.has('compare'), dec = perDecade(list, yOf, cmp ? sexName : null);
            if (I.has('map') && S === 'births') { const t = top(list.map(p => placeName(D, p.bp)), 60), places = {}; t.forEach(([n]) => { const pl = Object.values(D.places).find(x => x[0] === n); if (pl && Number.isFinite(pl[1])) places[pkey(n)] = {lat: pl[1], lon: pl[2], n}; });
                if (Object.keys(places).length) add('bubblemap', titled(i18n('Où sont nés mes ancêtres'), q), 'Une carte : un rond par lieu, plus gros quand il y a plus de naissances.', {places, rows: t.filter(([n]) => places[pkey(n)]).map(([label, s0]) => ({label, s0})), series: [{name: i18n('Naissances')}], o: {unit: i18n('naissances')}}); }
            if (dec) add(cmp ? 'columns' : 'line', title, cmp ? 'Des colonnes côte à côte par décennie : on compare d’un coup d’œil.' : 'Une courbe par décennie : on voit monter et descendre au fil du temps.', {rows: dec.rows, series: dec.series.map(s => ({name: s.name || i18n(nm)}))});
            if (dec && !cmp) add('columns', title, 'Des colonnes par décennie : chaque période se lit seule.', {rows: dec.rows, series: [{name: i18n(nm)}]});
            const surs = top(list.map(p => String(p.l || '').toUpperCase()), 5).map(x => x[0]);
            const bySur = list.length ? perDecade(list, yOf, p => (surs.includes(String(p.l || '').toUpperCase()) ? String(p.l || '').toUpperCase() : i18n('Autres'))) : null;
            if (bySur) add('stackarea', titled(i18n('{w} par nom de famille', {w: i18n(nm)}), q), 'Les noms empilés : le total et la part de chaque famille.', {rows: bySur.rows.flatMap(r => bySur.series.map((se, j) => ({x: Number(r.label), series: se.name, value: r['s' + j]})))});
            if (dec && cmp) add('unitdots', title, 'Un point par personne : on compte vraiment, groupe par groupe.', {rows: list.filter(p => Number.isFinite(yOf(p))).reduce((acc, p) => { const c = String(Math.floor(yOf(p) / 10) * 10), g = sexName(p) || i18n('Inconnu'), r = acc.find(x => x.column === c && x.group === g); if (r) r.value++; else acc.push({column: c, group: g, value: 1}); return acc; }, []).sort((a, b) => a.column.localeCompare(b.column))});
        }
        if (S === 'marriages') {
            const list = (D.couples || []).filter(([, , y]) => (!q.from || y >= q.from) && (!q.to || y <= q.to)).map(([a, b, y]) => ({by: y}));
            const dec = perDecade(list, p => p.by); if (dec) { add('line', titled(i18n('Les mariages'), q), 'Une courbe par décennie : les années où l’on se mariait.', {rows: dec.rows, series: [{name: i18n('Mariages')}]}); add('columns', titled(i18n('Les mariages'), q), 'Des colonnes par décennie.', {rows: dec.rows, series: [{name: i18n('Mariages')}]}); }
        }
        if (S === 'agedeath' || S === 'agemarriage') {
            const list = people(D, q, p => p.dy).filter(p => Number.isFinite(p.by) && Number.isFinite(p.dy) && p.dy >= p.by), groupBy = I.has('compare') ? sexName : p => centuryOf(p.by);
            if (S === 'agemarriage') { const ages = (D.couples || []).flatMap(([a, b, y]) => [a, b].map(id => { const p = D.byId.get(id); return p && Number.isFinite(p.by) && y > p.by ? {p, v: y - p.by} : null; })).filter(Boolean).filter(x => (!q.sex || x.p.g === q.sex));
                if (ages.length) { add('density', titled(i18n('L’âge au mariage'), q), 'Une courbe lissée : à quel âge on se mariait le plus.', {rows: ages.map(x => ({group: sexName(x.p) || i18n('Tous'), value: x.v})), o: {xLabel: i18n('Âge au mariage (ans)'), min: 10}}); add('stemleaf', titled(i18n('L’âge au mariage'), q), 'Chaque âge écrit : on lit toutes les valeurs.', {rows: ages.map(x => ({group: sexName(x.p), value: x.v}))}); } }
            else if (list.length) {
                add('density', titled(i18n('L’âge au décès'), q), I.has('compare') ? 'Une courbe par groupe : où se concentrent les âges.' : 'Une courbe par siècle : comment la durée de vie a changé.', {rows: list.map(p => ({group: groupBy(p) || i18n('Tous'), value: p.dy - p.by})), o: {xLabel: i18n('Âge au décès (ans)'), min: 0}});
                const bands = Array.from({length: 10}, (_, i) => `${i * 10}-${i * 10 + 9}`); add('pyramid', titled(i18n('L’âge au décès, hommes et femmes'), q), 'Une pyramide : les âges au décès des hommes à gauche, des femmes à droite.', {rows: bands.map((label, i) => ({label, s0: list.filter(p => p.g === 'm' && Math.min(9, Math.floor((p.dy - p.by) / 10)) === i).length, s1: list.filter(p => p.g === 'f' && Math.min(9, Math.floor((p.dy - p.by) / 10)) === i).length})), series: [{name: i18n('Hommes'), color: '#4e79a7'}, {name: i18n('Femmes'), color: '#e15759'}]});
                add('stemleaf', titled(i18n('L’âge au décès'), q), 'Chaque âge écrit : on lit toutes les valeurs, et leur forme.', {rows: list.map(p => ({group: I.has('compare') ? sexName(p) : '', value: p.dy - p.by}))});
            }
        }
        if (S === 'firstnames' || S === 'surnames' || S === 'occupations' || S === 'origins') {
            const list = people(D, q), key = S === 'firstnames' ? p => String(p.f || '').split(/[\s-]+/)[0] : S === 'surnames' ? p => String(p.l || '').toUpperCase() : S === 'occupations' ? p => p.occ : p => placeName(D, p.bp);
            const t = top(list.map(key), 15), what = {firstnames: 'Les prénoms les plus donnés', surnames: 'Les noms de famille', occupations: 'Les métiers', origins: 'Les lieux de naissance'}[S];
            if (t.length) {
                if (S === 'origins') { const places = {}; t.forEach(([n]) => { const pl = Object.values(D.places).find(x => x[0] === n); if (pl && Number.isFinite(pl[1])) places[pkey(n)] = {lat: pl[1], lon: pl[2], n}; }); if (Object.keys(places).length) add('bubblemap', titled(i18n('Où sont nés mes ancêtres'), q), 'Une carte : un rond par lieu, plus gros quand il y a plus de naissances.', {places, rows: t.filter(([n]) => places[pkey(n)]).map(([label, s0]) => ({label, s0})), series: [{name: i18n('Naissances')}], o: {unit: i18n('naissances')}}); }
                add('bars', titled(i18n(what), q), 'Des barres rangées : le plus fréquent en haut.', {rows: t.map(([label, s0]) => ({label, s0})), series: [{name: i18n('Personnes')}]});
                if (S !== 'origins') add('wordcloud', titled(i18n(what), q), 'Un nuage de mots : les plus fréquents écrits en grand.', {rows: t.map(([word, weight]) => ({word, weight}))});
                add('proparea', titled(i18n(what), q), 'Des carrés dont la surface dit le nombre : on compare d’un coup d’œil.', {rows: t.slice(0, 10).map(([label, value]) => ({label, value}))});
            }
        }
        if (S === 'migrations' || (I.has('flow') && !items.length)) {
            const list = people(D, q).filter(p => p.bp && p.dp && p.bp !== p.dp), m = new Map(); list.forEach(p => { const k = placeName(D, p.bp) + '\u0001' + placeName(D, p.dp); m.set(k, (m.get(k) || 0) + 1); });
            const rows = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, value]) => { const [from, to] = k.split('\u0001'); return {from, to, value}; });
            if (rows.length) {
                const places = {}; rows.forEach(r => [r.from, r.to].forEach(n => { const pl = Object.values(D.places).find(x => x[0] === n); if (pl && Number.isFinite(pl[1])) places[pkey(n)] = {lat: pl[1], lon: pl[2], n}; }));
                add('flowmap', titled(i18n('Les migrations de la famille'), q), 'Une carte avec des flèches : du lieu de naissance au lieu de décès.', {places, rows, o: {subtitle: i18n('du lieu de naissance au lieu de décès'), unit: i18n('personnes')}});
                add('sankey', titled(i18n('D’où l’on part, où l’on arrive'), q), 'Des flux : la largeur dit combien de personnes ont fait ce chemin.', {rows});
                add('parsets', titled(i18n('Né à, mort à'), q), 'Deux colonnes reliées : chaque bande va du lieu de naissance au lieu de décès.', {rows: rows.map(r => ({a: r.from, b: r.to, c: '', value: r.value})), o: {axisA: i18n('Né à'), axisB: i18n('Mort à')}});
            }
        }
        if (S === 'distance') {
            const ks = (D.couples || []).map(([a, b]) => { const pa = D.byId.get(a), pb = D.byId.get(b); return pa && pb ? dist(D, pa.bp, pb.bp) : NaN; }).filter(Number.isFinite), cls = [[0, 5, '0 à 5 km'], [5, 20, '5 à 20 km'], [20, 50, '20 à 50 km'], [50, 200, '50 à 200 km'], [200, 1e9, 'Plus de 200 km']];
            if (ks.length) { const rows = cls.map(([a, b, l]) => ({label: i18n(l), s0: ks.filter(k => k >= a && k < b).length})); add('columns', titled(i18n('À quelle distance on se mariait'), q), 'Des colonnes par distance entre les lieux de naissance des époux.', {rows, series: [{name: i18n('Couples')}]}); add('donut', titled(i18n('À quelle distance on se mariait'), q), 'Un anneau : la part des mariages proches et lointains.', {rows, series: [{name: i18n('Couples')}]}); }
        }
        if (S === 'months') {
            const cnt = new Array(12).fill(0), MN = [['janv', 'jan'], ['fev', 'feb'], ['mars', 'mar'], ['avr', 'apr'], ['mai', 'may'], ['juin', 'jun'], ['juil', 'jul'], ['aout', 'aug'], ['sept', 'sep'], ['oct'], ['nov'], ['dec']], k0 = /deces|mort/.test(fold(text)) ? 'dt' : 'bt';
            people(D, q).forEach(p => { const t = fold(p[k0]); if (!t) return; const m = t.match(/^\d{4}-(\d{1,2})/) || t.match(/\b\d{1,2}[/.-](\d{1,2})[/.-]\d{4}/); const k = m ? +m[1] - 1 : MN.findIndex(a => a.some(x => new RegExp('\\b' + x).test(t))); if (k >= 0 && k < 12) cnt[k]++; });
            const names = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'].map(x => i18n(x));
            if (cnt.some(Boolean)) { add('radialcol', titled(i18n(k0 === 'dt' ? 'Les décès selon le mois' : 'Les naissances selon le mois'), q), 'Les 12 mois autour d’un cercle : les saisons se voient tout de suite.', {rows: cnt.map((value, i) => ({label: names[i], value})), o: {center: i18n(k0 === 'dt' ? 'Décès' : 'Naissances')}}); add('columns', titled(i18n(k0 === 'dt' ? 'Les décès selon le mois' : 'Les naissances selon le mois'), q), 'Des colonnes, de janvier à décembre.', {rows: cnt.map((s0, i) => ({label: names[i], s0})), series: [{name: i18n(k0 === 'dt' ? 'Décès' : 'Naissances')}]}); }
        }
        if (S === 'lifespans' || S === 'ancestors') {
            const list = people(D, q).filter(p => Number.isFinite(p.by)).sort((a, b) => a.by - b.by).slice(0, 40);
            if (list.length) add('lifespans', titled(i18n('Les vies de la famille'), q), 'Une barre par vie : on voit qui a vécu en même temps.', {rows: list.map(p => ({name: fullName(p), from: p.by, to: Number.isFinite(p.dy) ? p.dy : '', group: String(p.l || '').toUpperCase()})), o: {sort: 'birth'}});
        }
        if (S === 'uncertain') { const rows = []; people(D, q, () => 0).forEach(p => [['bt', 'naissance'], ['dt', 'décès']].forEach(([k, w]) => { const f = p[k] && M()?.fuzzy(p[k]); if (f && f.kind !== 'sure') rows.push({label: `${fullName(p)}, ${i18n(w)}`, date: p[k], end: '', note: ''}); })); if (rows.length) add('uncertain', titled(i18n('Les dates approchées'), q), 'Chaque date avec sa marge : « vers », « avant », « entre ».', {rows: rows.slice(0, 40), o: {sort: 'date'}}); }
        if (S === 'alliances') {
            const m = new Map(); (D.couples || []).forEach(([a, b]) => { const x = String(D.byId.get(a)?.l || '').toUpperCase(), y = String(D.byId.get(b)?.l || '').toUpperCase(); if (!x || !y) return; const k = [x, y].sort().join('\u0001'); m.set(k, (m.get(k) || 0) + 1); });
            const rows = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, value]) => { const [from, to] = k.split('\u0001'); return {from, to, value}; });
            if (rows.length) { add('chordlines', titled(i18n('Les mariages entre familles'), q), 'Les noms en cercle, un trait par mariage entre deux familles.', {rows}); add('sankey', titled(i18n('Les mariages entre familles'), q), 'Des flux entre familles : la largeur dit le nombre de mariages.', {rows}); }
        }
        const message = !S ? i18n('Je n’ai pas compris de quoi tu parles : essaie avec « naissances », « décès », « âge au décès », « prénoms », « métiers », « d’où viennent », « migrations », « mois », « mariages entre familles »…') : !items.length ? i18n('Compris, mais ta base n’a pas assez de données pour ça (ou les filtres sont trop serrés).') : '';
        return {q, items: items.slice(0, 3), message};
    }

    /* ═════ dans la galerie ═════ */
    const EXAMPLES = ['L’âge au décès selon le siècle', 'Les prénoms les plus donnés dans ma famille', 'D’où venaient les gens nés entre 1800 et 1850', 'Les naissances des hommes et des femmes au XIXe siècle', 'Les migrations de la famille', 'Les mariages entre familles', 'Les naissances selon le mois'];
    const html = () => `<div class="h-dga" data-dga><label class="h-dga-lab" for="h-dga-q">💬 ${esc(i18n('Je veux représenter…'))}</label><div class="h-dga-row"><input id="h-dga-q" data-dga-q type="search" placeholder="${esc(i18n('ex. l’âge au décès selon le siècle'))}" autocomplete="off"><button type="button" class="button small" data-dga-go>${esc(i18n('Proposer', {ctx: 'diagramme'}))}</button></div>
        <div class="h-dga-ex">${EXAMPLES.map(x => `<button type="button" class="link-button" data-dga-ex>${esc(i18n(x))}</button>`).join(' · ')}</div><div class="h-dga-out" data-dga-out aria-live="polite"></div></div>`;
    let D = null;
    const loadD = async () => (D ||= await (M()?.loadBase ? M().loadBase() : window.LCNDA_APP.api('anim_people').then(d => ({...d, byId: new Map((d.people || []).map(p => [p.id, p]))}))));
    /** bind(racine, onPick({kind, spec})) */
    function bind(root, onPick) {
        const box = root.querySelector('[data-dga]'); if (!box) return;
        const out = box.querySelector('[data-dga-out]'), inp = box.querySelector('[data-dga-q]');
        const run = async () => {
            const text = inp.value.trim(); if (!text) { out.innerHTML = ''; return; }
            out.innerHTML = `<p class="muted">${esc(i18n('Lecture de ta généalogie…'))}</p>`;
            try {
                const base = await loadD(), r = suggest(text, base), q = r.q;
                const chips = [q.subject && i18n({births: 'naissances', deaths: 'décès', marriages: 'mariages', agedeath: 'âge au décès', agemarriage: 'âge au mariage', firstnames: 'prénoms', surnames: 'noms de famille', occupations: 'métiers', origins: 'lieux de naissance', migrations: 'migrations', distance: 'distances', months: 'mois', lifespans: 'vies', uncertain: 'dates approchées', alliances: 'mariages entre familles', ancestors: 'ancêtres'}[q.subject]), q.place && i18n('lieu : {p}', {p: q.place}), q.surname && i18n('nom : {n}', {n: q.surname}), q.sex === 'm' ? i18n('hommes') : q.sex === 'f' ? i18n('femmes') : '', q.from || q.to ? `${q.from || '…'} → ${q.to || '…'}` : '', ...q.intents.map(x => i18n({compare: 'comparer', evolution: 'évolution', share: 'répartition', top: 'classement', map: 'carte', flow: 'parcours'}[x]))].filter(Boolean);
                out.innerHTML = (chips.length ? `<p class="h-dga-got">${esc(i18n('Compris :'))} ${chips.map(c => `<span class="ui-badge is-blue">${esc(c)}</span>`).join(' ')}</p>` : '') + (r.message ? `<p class="muted">${esc(r.message)}</p>` : '')
                    + `<div class="h-dga-cards">${r.items.map((it, i) => { let svg = ''; try { svg = R().svg(it.spec, 320); } catch (_) {} return `<div class="h-dga-card${i ? '' : ' is-best'}"><div class="h-dga-pv">${svg}</div><b>${esc(R().KINDS[it.kind].icon || '')} ${esc(R().KINDS[it.kind].label)}</b><small class="muted">${esc(it.reason)}</small><button type="button" class="button small${i ? ' secondary' : ''}" data-dga-pick="${i}">${esc(i18n('Faire ce diagramme'))}</button></div>`; }).join('')}</div>`;
                out.querySelectorAll('[data-dga-pick]').forEach(b => b.addEventListener('click', () => { const it = r.items[Number(b.dataset.dgaPick)]; onPick({kind: it.kind, spec: JSON.parse(JSON.stringify(it.spec))}); }));
            } catch (e) { out.innerHTML = `<p class="muted">⚠️ ${esc(e.message || e)}</p>`; }
        };
        box.querySelector('[data-dga-go]').addEventListener('click', run);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
        box.querySelectorAll('[data-dga-ex]').forEach(b => b.addEventListener('click', () => { inp.value = b.textContent; run(); }));
    }
    ext.diagramAssistant = {parse, suggest, html, bind, reset: () => { D = null; }};
    if (!document.getElementById('h-dga-css')) { const st = document.createElement('style'); st.id = 'h-dga-css'; st.textContent = `
.h-dga{border:2px solid var(--ink,#111);padding:10px 12px;margin:0 0 14px;background:var(--surface,#fff);box-shadow:4px 4px 0 rgba(5,93,255,.18)}
.h-dga-lab{font-weight:800;display:block;margin-bottom:6px}
.h-dga-row{display:flex;gap:6px}.h-dga-row input{flex:1;min-width:0}
.h-dga-ex{font-size:12px;margin-top:6px;color:var(--muted,#666)}
.h-dga-got{margin:8px 0 4px;display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.h-dga-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;margin-top:8px}
.h-dga-card{border:2px solid var(--line,#c9ced8);padding:8px;display:grid;gap:6px;align-content:start}.h-dga-card.is-best{border-color:var(--accent,#055dff)}
.h-dga-pv{height:150px;overflow:hidden;background:var(--surface-2,#f7f8fa);display:flex;align-items:center;justify-content:center}.h-dga-pv svg{max-width:100%;max-height:150px;height:auto}
`; document.head.appendChild(st); }
})();
