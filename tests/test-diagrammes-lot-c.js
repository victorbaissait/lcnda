'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📊 Diagrammes « lot C » (assets/js/heritage-diagram-lot-c.js, heritage-diagram-cartes.js, heritage-cartes-outils.js,
 * lib/diagram_lot_c.php) :   node tests/test-diagrammes-lot-c.js      (LOTC_SHOTS=dossier pour garder des captures)
 * 1. Bac à sable : 🗓️ grille des recensements, ⚖️ schéma de preuve, 🌿 arbre de mots — chaque exemple et chaque réglage se
 *    dessine (900 et 390 px), sans NaN, textes et couleurs piégés échappés, données abîmées, beaucoup de lignes ;
 *    statuts, sortes et certitudes lus aussi en mots (« trouvé », « contre »…) ; tableau collé (CSV) pour chaque type ;
 *    ⛪ carte colorée au niveau « Paroisses » (zones de Voronoï, découpe au département) ; ✳️ carte des migrations en étoile ;
 *    ⭕ cercles d'une journée (rayons selon l'année et le moyen).
 * 2. Serveur (tests/fixtures/diagram-lot-c-seed.php, base temporaire) : api diagram_lot_c — recensements (ancêtres, groupe,
 *    critères « ＋ Critère », années), dossiers de preuve et hypothèses (liste filtrée par le groupe), mots des transcriptions
 *    (avant / après, commune, sorte d'acte, période, groupe), paroisses (place_parishes, période, ce qu'on compte), étoile
 *    (venus, partis, émigrés) ; valeurs piégées refusées (422).
 * 3. Navigateur (Playwright, sinon partie sautée) : « Depuis l'app » remplit chaque type, puis le tableau se corrige à la main
 *    sans être écrasé ; CSV importé ; niveau Paroisses et carte en étoile depuis l'app ; « ⭕ En une journée » ; 390 px, sombre ;
 *    aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
let failed = 0, n = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const same = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);
const TRAP = '<img src=x onerror="window.__xss=1">\'"&';
const BAD = /Dessin impossible|NaN|undefined|Infinity/;
const SHOTS = process.env.LOTC_SHOTS || '';

/* ── 1. Bac à sable ── */
const readGeo = url => fs.readFileSync(path.join(root, String(url).split('?')[0]));
const sb = { window: {}, console, setTimeout, clearTimeout, performance, Intl, TextDecoder, Response, Blob, DecompressionStream,
    fetch: async url => { const b = readGeo(url); return { ok: true, json: async () => JSON.parse(b.toString('utf8')), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }; } };
vm.createContext(sb);
for (const f of ['heritage-diagrams-render.js', 'heritage-diagram-cartes.js', 'heritage-diagram-lot-c.js', 'app-cartes-outils-core.js']) vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', f), 'utf8'), sb, { filename: f });
const ext = sb.window.LCNDA_EXT, R = ext.diagramRender, L = ext.diagramLotC, D = ext.diagramCartes, MINE = ['censusgrid', 'proofmap', 'wordtree'];
const draw = (spec, W = 900) => R.svg(spec, W);

(async () => {
    await t('les 3 nouveaux types sont au catalogue : icône, groupe « Ma recherche », tableau, réglages, exemple, « Depuis l’app »', () => {
        same([...L.KINDS], MINE);
        MINE.forEach(k => { const K = R.KINDS[k]; assert.ok(K.icon && K.label && K.group === 'Ma recherche' && K.grids.length && K.options.length >= 6 && typeof K.sample === 'function' && K.fromApp?.html && K.fromApp?.bind, k); });
    });
    await t('chaque exemple et chaque réglage se dessine (900 et 390 px), sans NaN', () => {
        const OPTS = { censusgrid: [{}, { layout: 'list' }, { only: 'todo', sort: 'todo' }, { sort: 'name', symbols: false, lifeYears: false, stripes: false }, { years: '1846, 1851, 1915' }, { from: 1872, to: 1906, rowHeight: 40, gap: 0 }],
            proofmap: [{}, { dir: 'right' }, { todo: false }, { certainty: 'refuted', conclusion: '' }], wordtree: [{}, { dir: 'before', root: 'MAZAUD' }, { depth: 1, branches: 1, others: false }, { counts: false, caseFold: false, minCount: 2 }, { place: 'Naves', from: 1790, to: 1820 }] };
        for (const k of MINE) for (const o of OPTS[k]) for (const W of [900, 390]) { const sp = R.KINDS[k].sample(), s = draw({ kind: k, ...sp, o: { ...sp.o, ...o } }, W);
            assert.match(s, /^<svg [^>]*role="img"/, k); assert.doesNotMatch(s, BAD, `${k} ${JSON.stringify(o)} ${W}`); assert.ok(s.length > 900, `${k} ${JSON.stringify(o)}`); }
    });
    await t('grille : statuts déduits (pas né, décédé), lus en mots, cases cliquables avec le n° de fiche, comptes de la légende', () => {
        same(['found', 'trouvé', 'Trouvé', '✓', 'non trouvé', 'à chercher', '', 'not_in_france', 'hors de France', 'pas né', 'déjà décédé', 'xyz'].map(L.statusOf), ['found', 'found', 'found', 'found', 'not_found', 'todo', 'todo', 'abroad', 'abroad', 'not_born', 'dead', 'todo']);
        const spec = { kind: 'censusgrid', o: { from: 1836, to: 1856 }, rows: [{ person: 'Jean MAZAUD', born: 1840, died: 1850, pid: 7 }, { person: 'Jean MAZAUD', year: 1846, status: 'trouvé' }] };
        const P = L.censusPeople(spec); assert.equal(P.length, 1); assert.equal(P[0].cells.get(1846).st, 'found');
        same(L.censusYears(spec.o, [1846]), [1836, 1841, 1846, 1851, 1856]);
        const s = draw(spec); assert.match(s, /data-lotc-pid="7" data-lotc-year="1846"/);
        assert.match(s, /Recensement 1836 : Pas encore né/); assert.match(s, /Recensement 1856 : Déjà décédé/); assert.match(s, /Recensement 1841 : À chercher/);
        const out = R.KINDS.censusgrid.render(spec, 900, 13); same(out.legend.map(x => x.label), ['Trouvé (1)', 'À chercher (1)', 'Pas encore né (1)', 'Déjà décédé (2)']);
        const list = draw({ ...spec, o: { ...spec.o, layout: 'list' } }); assert.match(list, /à chercher : 1841/);
    });
    await t('schéma de preuve : colonnes Pour / Contre / Recherches, une colonne par réponse d’une hypothèse, poids et certitude', () => {
        same(['pour', 'Contre', 'recherche', 'conflit', 'réponse', 'for', 'zzz'].map(L.partOf), ['for', 'against', 'research', 'conflict', 'answer', 'for', 'for']);
        same(['prouvé', 'Probable', 'réfuté', '', 'xx'].map(L.certOf), ['proved', 'probable', 'refuted', 'tocheck', 'tocheck']);
        const s = draw({ kind: 'proofmap', ...R.KINDS.proofmap.sample() }); assert.match(s, /Indices pour \(3\)/); assert.match(s, /Indices contre \(1\)/); assert.match(s, /Recherches et conflits \(2\)/); assert.match(s, /Certitude : Probable/);
        const h = draw({ kind: 'proofmap', o: { question: 'Où est mort Pierre ?', conclusion: 'Buenos Aires', certainty: 'probable' }, rows: [{ part: 'answer', text: 'Buenos Aires' }, { part: 'for', text: 'Acte consulaire', weight: 3, answer: 'Buenos Aires' }, { part: 'answer', text: 'Tulle' }, { part: 'against', text: 'Absent des tables', weight: 2, answer: 'Tulle' }] });
        assert.match(h, /Buenos Aires  \(\+3\)/); assert.match(h, /Tulle  \(-2\)/);
        const no = draw({ kind: 'proofmap', ...R.KINDS.proofmap.sample(), o: { ...R.KINDS.proofmap.sample().o, todo: false } }); assert.doesNotMatch(no, /Recherches et conflits/);
    });
    await t('arbre de mots : ce qui suit et ce qui précède, majuscules et accents ignorés, « … autres », filtres lieu et période', () => {
        const T = L.wordTrie(['Fils de Jean MAZAUD', 'fils de jean LACOMBE', 'fils de Pierre', 'FILS DE feu Jean'], ['fils', 'de'], 'after', 2);
        assert.equal(T.n, 4); assert.equal(T.kids.get('jean').n, 2); assert.equal(T.kids.get('jean').w, 'Jean');
        const B = L.wordTrie(['Pierre, fils de Jean', 'le fils de Marie'], ['fils', 'de'], 'before', 2); assert.ok(B.kids.has('pierre') && B.kids.has('le'));
        const sp = R.KINDS.wordtree.sample(), s = draw({ kind: 'wordtree', ...sp, o: { ...sp.o, branches: 2 } }); assert.match(s, /… \d+ autres/);
        assert.match(draw({ kind: 'wordtree', ...sp, o: { ...sp.o, place: 'Pétaouchnok' } }), /Colle des transcriptions/);
        assert.match(draw({ kind: 'wordtree', ...sp, o: { ...sp.o, root: 'veuve de' } }), /n’est dans aucun de ces textes/);
    });
    await t('textes et couleurs piégés : échappés, couleurs refusées ; données abîmées et beaucoup de lignes sans figer', () => {
        const rows = Array.from({ length: 12 }, (_, i) => ({ person: TRAP + (i % 4), born: 1820, died: 1900, year: 1836 + i * 5, status: TRAP, note: TRAP, part: ['for', 'against', 'research', 'answer'][i % 4], text: 'fils de ' + TRAP + i, source: TRAP, answer: i % 2 ? TRAP : '', place: TRAP, weight: 9 }));
        for (const k of MINE) {
            const s = draw({ kind: k, rows, o: { title: TRAP, question: TRAP, conclusion: TRAP, root: 'fils de', foundColor: 'javascript:x', forColor: '"><script>', color: 'url(javascript:x)', rootColor: 'expression(1)', questionColor: 'x;y' } }, 700);
            assert.doesNotMatch(s, /<img|<script|onerror="|javascript:|url\(|expression\(/, k);
            for (const sp of [{ kind: k }, { kind: k, rows: [] }, { kind: k, rows: [null, 'x', 42, [], {}, { person: {}, year: 'abc', status: [], part: null, text: {}, weight: 'NaN' }], o: null },
                { kind: k, rows: [{ person: 'a', born: 1e308, year: 1e308, text: 'a', weight: 1e308 }], o: { from: -1e9, to: 1e9, rowHeight: -5, depth: 1e9, branches: -3, lineHeight: 1e9, height: -3 } }]) assert.doesNotMatch(draw(sp, 400), BAD, `${k} ${JSON.stringify(sp).slice(0, 80)}`);
            const big = Array.from({ length: 5000 }, (_, i) => ({ person: 'P' + (i % 400), born: 1800 + (i % 90), year: 1836 + (i % 20) * 5, status: ['found', 'todo', 'not_found'][i % 3], part: ['for', 'against', 'research'][i % 3], text: `fils de Jean${i % 30} MAZAUD${i % 7} et`, answer: '' }));
            const t0 = Date.now(), s2 = draw({ kind: k, rows: big }, 900); assert.ok(Date.now() - t0 < 5000, k); assert.ok(s2.length < 8e6, k);
        }
    });
    await t('tableau collé / CSV : chaque type se remplit à la main (titres reconnus, statuts en mots)', () => {
        const parse = txt => txt.trim().split('\n').map(l => l.split(';'));
        const fill = (k, txt) => { const g = R.KINDS[k].grids[0], [head, ...body] = parse(txt), cols = g.cols; return { kind: k, rows: body.map(r => Object.fromEntries(r.map((v, j) => { const c = cols[j]; return [c.k, c.type === 'select' ? (c.choices.find(([key, l]) => key === v || l.toLowerCase() === v.toLowerCase())?.[0] ?? '') : v]; }))), _h: head }; };
        const c = fill('censusgrid', 'Personne;Naissance;Décès;Recensement;Statut;Note\nJean MAZAUD;1818;1884;;;\nJean MAZAUD;;;1836;Trouvé;Naves\nJean MAZAUD;;;1846;Non trouvé;');
        assert.equal(c.rows[1].status, 'found'); assert.equal(c.rows[2].status, 'not_found'); assert.match(draw({ ...c, o: {} }), /Recensement 1846 : Non trouvé/);
        const p = fill('proofmap', 'Sorte;Indice;Source;Poids\nPour;Acte de mariage;Registre;3\nContre;Homonyme;Table;1'); assert.equal(p.rows[1].part, 'against'); assert.match(draw({ ...p, o: { question: 'Q ?' } }), /Indices contre \(1\)/);
        const w = fill('wordtree', 'Texte;Lieu;Année\nfils de Jean MAZAUD;Naves;1842\nfils de Pierre BESSE;Naves;1850'); assert.match(draw({ ...w, o: { root: 'fils de' } }), /Arbre de mots|fils de/);
    });
    await Promise.all(['fr-departements', 'monde-50m', 'monde-110m'].map(id => D.load(id)));
    const PL = { Naves: [45.31, 1.77], Tulle: [45.267, 1.77], Chanteix: [45.32, 1.62], Seilhac: [45.367, 1.712], Favars: [45.27, 1.68], Cornil: [45.21, 1.69], Laguenne: [45.24, 1.78], Gimel: [45.3, 1.85], Brive: [45.159, 1.533] };
    const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const places = Object.fromEntries(Object.entries(PL).map(([nm, [lat, lon]]) => [fold(nm), { lat, lon, n: nm }]));
    await t('⛪ carte colorée, niveau « Paroisses » : une zone par église, chiffres, noms, découpe au département, ⚠ sans position', () => {
        const lv = R.KINDS.choropleth.options.find(o => o.k === 'level' && o.choices.some(c => c[0] === 'par')); assert.ok(lv, 'le niveau Paroisses est proposé');
        assert.ok(!R.KINDS.flowmap.options.some(o => o.k === 'level' && o.choices.some(c => c[0] === 'par')), 'pas pour les migrations');
        const spec = { kind: 'choropleth', o: { map: 'fr', level: 'par', colorMode: 'classes', classes: 3, labels: 'both' }, series: [{ name: 'Naissances' }], places, rows: Object.keys(PL).map((label, i) => ({ label, s0: i + 1 })).concat([{ label: 'Inconnue' }, { label: 'Ici 45.28, 1.74', s0: 2 }]) };
        for (const W of [900, 390]) { const s = draw(spec, W); assert.doesNotMatch(s, BAD); assert.equal((s.match(/class="dgm-z"/g) || []).length, 10, 'une zone par paroisse placée'); assert.match(s, /Paroisses sans position : Inconnue/); assert.match(s, /clipPath id="dgm\d+v"/); }
        const s2 = draw(spec); assert.match(s2, /<title>Naves : 1<\/title>/); assert.match(s2, /Ici : 2/);
        const z = draw({ ...spec, o: { ...spec.o, frame: 'zone', frameZone: 'Corrèze' } }); assert.doesNotMatch(z, BAD);
        const st = D.rowStatus ? D.rowStatus(spec, 'Inconnue') : { why: 'inconnu' }; assert.equal(st.why, 'inconnu');
        assert.ok(D.rowStatus(spec, 'Naves').ok, 'une paroisse placée est bonne');
        if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'paroisses.svg'), s2);
    });
    await t('✳️ carte des migrations « en étoile » : seulement les liens du lieu, arrivées ou départs', () => {
        const spec = { kind: 'flowmap', o: { map: 'fr', level: 'dep', hub: 'Naves' }, places, rows: [{ from: 'Naves', to: 'Tulle', value: 3 }, { from: 'Seilhac', to: 'Naves', value: 2 }, { from: 'Gimel', to: 'Cornil', value: 5 }, { from: 'Naves (Corrèze)', to: 'Brive', value: 1 }] };
        const bases = ['fr-departements', 'monde-110m'].map(D.loaded);
        same(D.flowsOf(spec, bases).flows.map(f => `${f.a[2]}>${f.b[2]}`).sort(), ['Naves (Corrèze)>Brive', 'Naves>Tulle', 'Seilhac>Naves']);
        same(D.flowsOf({ ...spec, o: { ...spec.o, hubDir: 'in' } }, bases).flows.map(f => f.a[2]), ['Seilhac']);
        same(D.flowsOf({ ...spec, o: { ...spec.o, hubDir: 'out' } }, bases).flows.length, 2);
        assert.equal(D.flowsOf({ ...spec, o: { ...spec.o, hub: '' } }, bases).flows.length, 4, 'vide = tous les flux');
        assert.doesNotMatch(draw(spec), BAD); assert.ok(R.KINDS.flowmap.options.some(o => o.k === 'hub'));
    });
    await t('⭕ en une journée : rayons selon le moyen, l’année, le détour, les jours', () => {
        const C = sb.window.LCNDA_CARTES_OUTILS; assert.ok(C);
        const k = C.speedAt('pied', 1820, {}).kmDay / C.cleanSettings({}).detour.road; assert.ok(k > 20 && k < 35, String(k));
        assert.ok(C.speedAt('diligence', 1700, {}).kmDay < C.speedAt('diligence', 1840, {}).kmDay);
        assert.equal(C.speedAt('train', 1820, {}).available, false);
        const src = fs.readFileSync(path.join(root, 'assets/js/heritage-cartes-outils.js'), 'utf8'); assert.match(src, /data-cpo-tab="day"/); assert.match(src, /function dayRings/);
    });

    /* ── 2. Serveur ── */
    const php = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0 ? 'php' : null;
    if (!php) { console.log('— serveur et navigateur : PHP absent, partie sautée'); return end(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-lotc-')), dir = path.join(tmp, 'a'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    const sd = spawnSync(php, [path.join(root, 'tests/fixtures/diagram-lot-c-seed.php')], { cwd: root, encoding: 'utf8', env }); const m = /^ok lotc (.+)$/m.exec(sd.stdout || '');
    if (sd.status !== 0 || !m) { console.error(sd.stderr || sd.stdout); failed++; return end(); }
    const S = JSON.parse(m[1]);
    const port = await new Promise(res => { const s = require('node:net').createServer(); s.listen(0, '127.0.0.1', () => { const q = s.address().port; s.close(() => res(q)); }); });
    const base = `http://127.0.0.1:${port}/`, proc = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], { cwd: root, env, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const qs = o => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const get = async q => { const r = await fetch(`${base}api.php?action=diagram_lot_c&${qs(q)}`); return { status: r.status, ...(await r.json()) }; };
    const RULE = JSON.stringify([{ field: 'occupation', value: 'bûcheron' }]);
    try {
        await t('serveur : recensements (ancêtres par défaut, groupe, critères, années, statuts relevés)', async () => {
            const a = await get({ what: 'census' }); same(a.rows.filter(r => !r.year).map(r => r.person), ['Jean MAZAUD', 'Antoine MAZAUD', 'Anne BESSE'], 'les ancêtres de Jean, par Sosa');
            same(a.rows.filter(r => r.year).map(r => [r.year, r.status]), [['1836', 'found'], ['1846', 'not_found']]);
            const p = await get({ what: 'census', dg_pop: 'people', dg_ids: String(S.pierre) }); same(p.rows.map(r => r.status), ['', 'not_in_france']);
            const d = await get({ what: 'census', dg_pop: 'desc', dg_root: S.jean }); assert.ok(d.rows.some(r => r.person === 'Louise MAZAUD'), 'descendants');
            const r = await get({ what: 'census', rules: RULE, dg_pop: '' }); same([...new Set(r.rows.map(x => x.person))], ['Jean MAZAUD'], 'critère métier');
            const y = await get({ what: 'census', from: 1900, to: 1936, dg_pop: 'people', dg_ids: `${S.jean},${S.louise}` }); same(y.rows.filter(x => !x.year).map(x => x.person), ['Louise MAZAUD'], 'Jean mort en 1884 : hors période');
            same(y.years, [1901, 1906, 1911, 1921, 1926, 1931, 1936]);
        });
        await t('serveur : dossiers de preuve et hypothèses (liste suivant le groupe, lignes, conclusion, certitude)', async () => {
            const l = await get({ what: 'proofs' }); assert.equal(l.cases.length, 1); assert.equal(l.hypotheses.length, 1);
            const f = await get({ what: 'proofs', dg_pop: 'people', dg_ids: String(S.louise) }); assert.equal(f.cases.length + f.hypotheses.length, 0, 'groupe sans dossier');
            const c = await get({ what: 'proof', id: S.case }); same(c.rows.map(r => r.part), ['for', 'for', 'against', 'research', 'conflict']); assert.equal(c.certainty, 'probable'); assert.equal(c.rows[4].note, 'âge approximatif');
            const h = await get({ what: 'hyp', id: S.hyp }); same(h.rows.map(r => [r.part, r.answer]), [['answer', 'Buenos Aires'], ['for', 'Buenos Aires'], ['for', 'Buenos Aires'], ['answer', 'Tulle'], ['against', 'Tulle']]);
            assert.match(R.svg({ kind: 'proofmap', rows: h.rows, o: { question: h.question } }, 800), /Buenos Aires  \(\+4\)/);
        });
        await t('serveur : mots des transcriptions (après, avant, commune, sorte d’acte, période, groupe)', async () => {
            const w = await get({ what: 'words', root: 'fils de' }); assert.equal(w.rows.length, 2); assert.equal(w.acts, 2);
            const b = await get({ what: 'words', root: 'veuve de', dir: 'before' }); same(b.rows.map(r => r.text), ['Louise MAZAUD veuve de']);
            assert.equal((await get({ what: 'words', root: 'fils de', place: 'Naves' })).rows.length, 1);
            same((await get({ what: 'words', root: 'fils de', kinds: 'naissance' })).rows.map(r => r.source), ['Naissance de Pierre']);
            assert.equal((await get({ what: 'words', root: 'fils de', dg_from: 1844, dg_to: 1850 })).rows.length, 1);
            assert.equal((await get({ what: 'words', root: 'fils de', dg_pop: 'people', dg_ids: String(S.jean) })).rows.length, 1, 'seulement les médias de Jean');
            assert.equal((await get({ what: 'words', root: 'FILLE DE' })).rows.length, 1, 'majuscules ignorées');
            assert.equal((await get({ what: 'words', root: '' })).status, 422);
            const tr = L.wordTrie(w.rows.map(r => r.text), ['fils', 'de'], 'after', 2); assert.ok(tr.kids.has('antoine') && tr.kids.has('jean'));
        });
        await t('serveur : paroisses (Seilhac compte à Naves), période, ce qu’on compte, ancêtres', async () => {
            const p = await get({ what: 'parishes', count: 'births' }); same(p.sites.map(s => [s.name, s.n]), [['Naves', 5], ['Chanteix', 1], ['Tulle', 1]]);
            assert.ok(p.sites[0].places.includes('Seilhac'));
            same((await get({ what: 'parishes', count: 'marriages' })).sites.map(s => [s.name, s.n]), [['Naves', 2], ['Tulle', 1]]);
            same((await get({ what: 'parishes', count: 'births', dg_from: 1840 })).sites.map(s => [s.name, s.n]), [['Naves', 2], ['Tulle', 1]]);
            assert.ok((await get({ what: 'parishes', count: 'people', ancestors: 1 })).sites.every(s => s.name !== 'Tulle'), 'ancêtres de Jean : personne à Tulle');
        });
        await t('serveur : carte en étoile de Naves (venue de Chanteix, départs à Tulle et Seilhac, émigré à Buenos Aires), groupe', async () => {
            const s = await get({ what: 'star', place: S.naves }); const byKind = k => s.flows.filter(f => f.kind === k).map(f => s.places.find(p => p.id === (k === 'in' ? f.a : f.b)).name).sort();
            same(byKind('in'), ['Chanteix']); same(byKind('out'), ['Seilhac', 'Tulle']); same(byKind('emig'), ['Buenos Aires']);
            same((await get({ what: 'star', place: S.naves, links: 'in' })).flows.map(f => f.kind), ['in']);
            assert.equal((await get({ what: 'star', place: S.naves, dg_pop: 'people', dg_ids: String(S.louise) })).flows.length, 1);
            assert.equal((await get({ what: 'star', place: 99999 })).status, 422);
        });
        await t('serveur : valeurs piégées refusées (422)', async () => {
            for (const q of [{ what: 'zzz' }, { what: 'census', dg_pop: 'x' }, { what: 'census', from: '1836 OR 1=1' }, { what: 'census', rules: '{"a":' }, { what: 'census', rules: 'x'.repeat(30000) }, { what: 'census', dg_ids: '1;DROP', dg_pop: 'people' }])
                assert.equal((await get(q)).status, 422, JSON.stringify(q).slice(0, 60));
        });

        /* ── 3. Navigateur ── */
        let chromium = null;
        for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (_) { chromium = null; } }
        if (!chromium) { console.log('— navigateur : Playwright absent, partie sautée'); return; }
        const browser = await chromium.launch();
        try {
            for (const [label, vp, dark] of [['clair, 1280 px', { width: 1280, height: 900 }, false], ['sombre, 390 px', { width: 390, height: 844 }, true]]) {
                const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, colorScheme: dark ? 'dark' : 'light' }), p = await ctx.newPage(), errors = [];
                p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|tile\.openstreetmap|ERR_/.test(m.text())) errors.push(m.text()); });
                p.on('dialog', d => d.dismiss());
                await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_EXT?.openDiagramEditor && window.LCNDA_EXT?.diagramLotC && window.LCNDA_EXT?.diagramAppOpts, null, { timeout: 30000 }); await p.waitForTimeout(400);
                const close = () => p.evaluate(() => document.querySelectorAll('.h-dg-dlg, dialog').forEach(d => { if (d.open) d.close(); d.remove(); }));
                const open = async k => { await close(); await p.evaluate(k => window.LCNDA_EXT.openDiagramEditor(null, { kind: k }), k); await p.waitForSelector('.h-dg-dlg [data-dg-preview] svg'); };
                const preview = () => p.$eval('.h-dg-dlg [data-dg-preview] svg', s => s.outerHTML);
                const shot = async name => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, `${name}-${vp.width}.png`) }); };
                const app = async (k, before = null) => { await open(k); await p.click('.h-dg-dlg [data-dg-tab="app"]'); await p.waitForSelector('.h-dg-dlg [data-lotc-go]'); if (before) await before(); const was = await preview(); await p.click('.h-dg-dlg [data-lotc-go]');
                    await p.waitForFunction(was => (document.querySelector('.h-dg-dlg [data-dg-tab="data"]')?.classList.contains('is-active') && document.querySelector('.h-dg-dlg [data-dg-preview] svg')?.outerHTML !== was) || /⚠️/.test(document.querySelector('.h-dg-dlg [data-lotc-msg]')?.textContent || ''), was, { timeout: 15000 });
                    const msg = await p.$eval('.h-dg-dlg [data-lotc-msg]', e => e.textContent).catch(() => ''); assert.ok(!/⚠️/.test(msg), msg); };
                await t(`navigateur : 🗓️ « Depuis l’app » (groupe + critère), puis une case corrigée à la main n’est pas écrasée (${label})`, async () => {
                    await app('censusgrid', async () => {
                        assert.ok(await p.$('.h-dg-dlg [data-lotc-dgo] [data-dgo="pop"]'), 'le groupe de personnes commun'); assert.ok(await p.$('.h-dg-dlg [data-lotc-dgo] [data-dgo-addrule]'), '＋ Critère');
                        await p.selectOption('.h-dg-dlg [data-lotc="from"]', '1836'); await p.selectOption('.h-dg-dlg [data-lotc="to"]', '1856'); });
                    const rows = await p.$$eval('.h-dg-dlg [data-grid="0"] tbody tr', l => l.length); assert.ok(rows >= 5, String(rows));
                    assert.match(await preview(), /Jean MAZAUD · Recensement 1846 : Non trouvé/);
                    // corrige à la main : 1846 devient « Trouvé »
                    const sel = await p.$$('.h-dg-dlg [data-grid="0"] select[data-k="status"]'); let idx = -1;
                    for (let i = 0; i < sel.length; i++) if (await sel[i].evaluate(e => e.value) === 'not_found') idx = i;
                    assert.ok(idx >= 0); await sel[idx].selectOption('found'); await p.waitForTimeout(500);
                    assert.match(await preview(), /Recensement 1846 : Trouvé/);
                    await p.click('.h-dg-dlg [data-dg-tab="opts"]'); await p.click('.h-dg-dlg [data-dg-tab="data"]'); await p.waitForTimeout(300);
                    assert.match(await preview(), /Recensement 1846 : Trouvé/, 'pas écrasé en changeant d’onglet');
                    await p.click('.h-dg-dlg [data-dg-add="0"]'); await p.waitForTimeout(200);
                    const last = '.h-dg-dlg [data-grid="0"] tbody tr:last-child'; await p.fill(`${last} input[data-k="person"]`, 'Marie LACOMBE'); await p.fill(`${last} input[data-k="born"]`, '1822');
                    await p.$eval(`${last} input[data-k="born"]`, e => e.dispatchEvent(new Event('change', { bubbles: true }))); await p.waitForTimeout(500);
                    assert.match(await preview(), /Marie LACOMBE/, 'une ligne ajoutée à la main'); await shot('grille-recensements');
                });
                await t(`navigateur : ⚖️ dossier de preuve puis hypothèse depuis l’app, liste suivant le groupe (${label})`, async () => {
                    await app('proofmap', async () => { await p.waitForFunction(() => document.querySelector('.h-dg-dlg [data-lotc="case"] option[value^="proof:"]'), null, { timeout: 8000 }); });
                    const s = await preview(); assert.match(s, /Indices pour \(2\)/); assert.match(s, /Antoine MAZAUD est-il le père de Jean/); await shot('schema-preuve');
                    await p.click('.h-dg-dlg [data-dg-tab="app"]'); await p.waitForFunction(() => document.querySelector('.h-dg-dlg [data-lotc="case"] option[value^="hyp:"]'));
                    await p.selectOption('.h-dg-dlg [data-lotc="case"]', `hyp:${S.hyp}`); await p.click('.h-dg-dlg [data-lotc-go]');
                    await p.waitForFunction(() => /Buenos Aires  \(\+4\)/.test(document.querySelector('.h-dg-dlg [data-dg-preview] svg')?.outerHTML || ''), null, { timeout: 15000 });
                    await p.click('.h-dg-dlg [data-dg-tab="app"]'); await p.selectOption('.h-dg-dlg [data-dgo="pop"]', 'search'); await p.fill('.h-dg-dlg [data-dgo="search"]', 'LACOMBE');
                    await p.$eval('.h-dg-dlg [data-dgo="search"]', e => e.dispatchEvent(new Event('change', { bubbles: true }))); await p.waitForTimeout(1200);
                    assert.equal(await p.$$eval('.h-dg-dlg [data-lotc="case"] option[value^="proof:"]', l => l.length), 0, 'personne de ce groupe n’a de dossier');
                });
                await t(`navigateur : 🌿 arbre de mots depuis l’app (ce qui précède « veuve de »), puis un texte collé à la main (${label})`, async () => {
                    await app('wordtree', async () => { await p.fill('.h-dg-dlg [data-lotc="root"]', 'veuve de'); await p.selectOption('.h-dg-dlg [data-lotc="dir"]', 'before'); });
                    assert.match(await preview(), /MAZAUD/);
                    const I = await p.evaluate(() => { const X = window.LCNDA_EXT.diagramsInternals, g = window.LCNDA_EXT.diagramRender.KINDS.wordtree.grids[0], s = { kind: 'wordtree', o: { root: 'fils de' }, rows: [] };
                        X.pasteInto(g, s, X.parseTable('Texte\tLieu\tAnnée\nfils de Jean MAZAUD\tNaves\t1842\nfils de Jean BESSE\tTulle\t1850')); return { n: s.rows.length, svg: window.LCNDA_EXT.diagramRender.svg(s, 600) }; });
                    assert.equal(I.n, 2); assert.match(I.svg, /Jean/); await shot('arbre-mots');
                });
                await t(`navigateur : ⛪ niveau Paroisses et ✳️ carte en étoile depuis l’app (${label})`, async () => {
                    await open('choropleth');
                    await p.click('.h-dg-dlg [data-dg-tab="opts"]'); const lvl = await p.$$('.h-dg-dlg select[data-opt="level"]'); let ok = false;
                    for (const s of lvl) { if (await s.isVisible() && await s.evaluate(e => [...e.options].some(o => o.value === 'par'))) { await s.selectOption('par'); ok = true; break; } }
                    assert.ok(ok, 'choix du niveau Paroisses'); await p.waitForTimeout(300);
                    await p.click('.h-dg-dlg [data-dg-tab="app"]'); await p.waitForSelector('.h-dg-dlg [data-dgm-go]'); await p.selectOption('.h-dg-dlg [data-dgm-what]', 'births'); await p.click('.h-dg-dlg [data-dgm-go]');
                    await p.waitForFunction(() => /✓|Aucun/.test(document.querySelector('.h-dg-dlg [data-dgm-msg]')?.textContent || ''), null, { timeout: 15000 });
                    assert.match(await p.$eval('.h-dg-dlg [data-dgm-msg]', e => e.textContent), /✓ 3 paroisses/);
                    await p.waitForFunction(() => (document.querySelector('.h-dg-dlg [data-dg-preview] svg')?.outerHTML.match(/class="dgm-z"/g) || []).length >= 3, null, { timeout: 15000 });
                    assert.match(await preview(), /Naves : 5/); await shot('paroisses');
                    await open('flowmap'); await p.click('.h-dg-dlg [data-dg-tab="app"]'); await p.waitForSelector('.h-dg-dlg [data-dgm-what]'); await p.selectOption('.h-dg-dlg [data-dgm-what]', 'star');
                    assert.ok(await p.isVisible('.h-dg-dlg [data-dgm-starbox]'));
                    await p.evaluate(id => { const host = document.querySelector('.h-dg-dlg [data-dgm-hub]'); host.dispatchEvent(new CustomEvent('picker-change', { bubbles: true, detail: { item: { id, title: 'Naves', lat: 45.31, lon: 1.77 } } })); }, S.naves);
                    await p.click('.h-dg-dlg [data-dgm-go]'); await p.waitForFunction(() => /✓|Aucun|⛔/.test(document.querySelector('.h-dg-dlg [data-dgm-msg]')?.textContent || ''), null, { timeout: 15000 });
                    assert.match(await p.$eval('.h-dg-dlg [data-dgm-msg]', e => e.textContent), /✓ 4 flux/);
                    await p.waitForFunction(() => /Chanteix → Naves/.test(document.querySelector('.h-dg-dlg [data-dg-preview] svg')?.outerHTML || ''), null, { timeout: 15000 }); await shot('etoile');
                });
                await t(`navigateur : ⭕ « En une journée » dans Distances et temps de trajet (${label})`, async () => {
                    await close(); await p.evaluate(id => window.LCNDA_EXT.cartesOutils.openTravel({ day: true, from: { id, title: 'Naves', lat: 45.31, lon: 1.77 }, year: 1820 }), S.naves);
                    await p.waitForSelector('[data-cpo-day] svg', { timeout: 20000 });
                    const html = await p.$eval('[data-cpo-day]', e => e.innerHTML); assert.match(html, /En une journée depuis Naves, en 1820/); assert.match(html, /<path d="M[^"]+Z" fill="#59a14f"/);
                    assert.ok((await p.$$eval('[data-cpo-day] circle', l => l.length)) >= 3, 'les lieux de la famille');
                    await p.selectOption('[data-cpo-ddays]', '3'); await p.waitForFunction(() => /En 3 jours/.test(document.querySelector('[data-cpo-day]')?.textContent || ''), null, { timeout: 10000 });
                    const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(ov <= 1, 'pas de débordement : ' + ov); await shot('une-journee');
                });
                await t(`navigateur : aucune erreur JavaScript (${label})`, () => { assert.deepEqual(errors, []); });
                await ctx.close();
            }
        } finally { await browser.close(); }
    } finally { proc.kill(); }
    end();
})();
function end() { console.log(`${failed ? '✗' : '✓'} diagrammes lot C : ${n} vérifications${failed ? `, ${failed} en échec` : ''}`); process.exit(failed ? 1 : 0); }
