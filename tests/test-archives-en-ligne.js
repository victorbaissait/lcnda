'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🔍 Archives en ligne : la fenêtre commune de tous les lots « sources ouvertes » (app-archives-en-ligne-core.js,
 * heritage-archives-en-ligne.js) :
 *     node tests/test-archives-en-ligne.js
 *  1. calculs purs : tous les sites de tous les lots présents UNE fois (doublons rangés dans le site gardé), rangement pays / thème,
 *     filtres (Gratuites seulement, C1, époque), liens collés et textes reconnus, réglages lus et écrits dans la clé de chaque lot ;
 *  2. le code : une seule fenêtre de recherche, un seul écran d'adresses, un seul « Coller un lien », plus de rangée de boutons
 *     par lot dans « Chercher sur internet », aucune requête vers ces sites ;
 *  3. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : bloc « Chercher sur internet », fenêtre (tous les
 *     sites, pastilles, filtres), boutons des blocs → fenêtre déjà filtrée, un seul écran d'adresses qui garde les anciennes clés,
 *     « Coller un lien », « ⤒ Importer ▾ » vers l'import du lot, sans erreur ni requête externe.
 * Captures : SHOTS=dossier node tests/test-archives-en-ligne.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const js = f => path.join(appRoot, 'assets/js', f);
const AR = require(js('app-archives-en-ligne-core.js'));
const REGS = {1: require(js('app-sources-ouvertes-core.js')), 2: require(js('app-sources-ouvertes-2-core.js')), 3: require(js('app-sources-ouvertes-3-core.js')),
    4: require(js('app-sources-ouvertes-4-core.js')), 5: require(js('app-sources-ouvertes-5-core.js')), 6: require(js('app-sources-ouvertes-6-core.js')),
    7: require(js('app-sources-ouvertes-7-core.js')), socface: require(js('app-socface-core.js'))};
const SHOTS = process.env.SHOTS || '';
const HOSTS = /memoiredeshommes|culture\.gouv|gallica|retronews|europeana|francearchives|archives-nationales|maitron|familysearch|wikitree|archivesportaleurope|idref|bnf\.fr|freebmd|antenati|google\.com|archion|ancestry|myheritage|filae|geneanet/;

let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const finish = () => { console.log(failed ? `${failed} échec(s)` : 'tout est bon'); process.exit(failed ? 1 : 0); };
/** un petit localStorage pour Node */
const fakeLS = (init = {}) => { const m = new Map(Object.entries(init)); return {getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m}; };

(async () => {
    const P = {first: 'Jean', last: 'Dupont', place: 'Tulle', y1: 1890, y2: 1950, birthYear: 1890, deathYear: 1950, unit: '126e RI', dept: '19', deptCode: '19', county: 'Corrèze', adUrl: 'https://archives.correze.fr/', port: 'Brest', country: 'France'};
    const ALL = AR.collect(REGS), RAW = AR.collectAll(REGS);
    const rawCount = AR.LOT_IDS.reduce((n, k) => n + REGS[k].SITES.length, 0) + 1; // + la recherche SocFace

    /* ═════ 1. calculs purs ═════ */
    await t('tous les sites de tous les lots, une seule fois (les doublons rangés dans le site gardé)', () => {
        assert.equal(RAW.length, rawCount, 'collectAll : chaque site de chaque lot');
        const ids = ALL.map(e => e.id); assert.equal(new Set(ids).size, ids.length, 'identifiants uniques');
        assert.equal(ALL.length, rawCount - Object.keys(AR.MERGED).length);
        for (const k of AR.LOT_IDS) for (const s of REGS[k].SITES) assert.ok(ids.includes(AR.resolve(`${AR.prefix(k)}${s.key}`)), `${k}:${s.key} absent`);
        assert.ok(ids.includes(AR.resolve('socface')));
        // les doublons cités : une seule ligne
        assert.equal(AR.resolve('so6_minutier'), 'so2_an_minutier'); assert.equal(AR.resolve('so6_siv'), 'so2_an_siv'); assert.equal(AR.resolve('so6_marins_shd'), 'so2_shd_marins');
        assert.equal(AR.resolve('so2_maitron_fusilles'), 'so5_maitron'); assert.equal(AR.resolve('socface'), 'so_francearchives_noms');
        for (const id of Object.keys(AR.MERGED)) assert.ok(!ids.includes(id), `${id} en double`);
        const fa = ALL.find(e => e.id === 'so_francearchives_noms'); assert.deepEqual(fa.also.map(a => a.id), ['socface']);
        assert.deepEqual(ALL.find(e => e.id === 'so5_maitron').also.map(a => a.id), ['so2_maitron_fusilles']);
        assert.ok(ALL.find(e => e.id === 'so2_shd_marins').merged.includes('so6_marins_shd'), 'l’aide du port (lot 6) reste sur la ligne');
        // une seule entrée par domaine de recherche précis (hors recherches Google limitées à un site et FranceArchives, qui sert à plusieurs inventaires)
        const host = u => { try { const x = new URL(u); return x.hostname + x.pathname; } catch (_) { return ''; } };
        const seen = new Map();
        ALL.filter(e => e.lot !== 'socface').forEach(e => { const u = host(AR.url(e, P, REGS)); if (!u || /google\.com|francearchives|gallica|pop\.culture|siv\.archives|maitron/.test(u)) return; assert.ok(!seen.has(u), `${e.id} et ${seen.get(u)} : même adresse ${u}`); seen.set(u, e.id); });
    });
    await t('rangement : pays puis thème, payants à la fin, pastilles qui s’additionnent', () => {
        for (const e of ALL) { assert.ok(AR.COUNTRIES[e.country], `${e.id} : pays ${e.country}`); assert.ok(AR.THEMES.some(x => x.id === e.theme), `${e.id} : thème ${e.theme}`); assert.ok(['oui', 'partiel', 'non'].includes(e.verified)); }
        const c = AR.counts(ALL, {}); assert.equal(Object.values(c.zone).reduce((a, b) => a + b, 0), c.all);
        const secs = AR.sections(ALL); assert.equal(secs[0].country, 'France');
        assert.equal(secs.reduce((n, s) => n + s.list.length, 0), ALL.length);
        for (const s of secs) { const k = s.list.findIndex(e => e.paid === 'oui'); if (k >= 0) assert.ok(s.list.slice(k).every(e => e.paid === 'oui' || e.paid === 'bibliotheque'), `${s.id} : payants à la fin`); }
        const free = AR.filter(ALL, {free: true}); assert.ok(!free.some(e => e.paid === 'oui' || e.paid === 'bibliotheque')); assert.ok(free.some(e => e.paid === 'partiel'), 'en partie payant : montré');
        assert.ok(AR.filter(ALL, {q: 'antenati'}).every(e => e.id === 'so3_antenati_nom'));
        assert.deepEqual(AR.filter(ALL, {zone: 'eu', country: 'Royaume-Uni', free: true}).map(e => e.id).sort(), ['so3_freebmd', 'so3_freecen', 'so6_oldbailey']);
        assert.equal(ALL.find(e => e.id === 'so_retronews').paid, 'partiel');
    });
    await t('adresses : celles des lots, avec l’adresse à soi ; prêtes seulement avec un nom (ou un lieu) ; époque', () => {
        for (const e of ALL) { const u = AR.url(e, P, REGS); if (u) assert.ok(/^https:\/\/[^\s<>"'`]+$/.test(u), `${e.id} : ${u}`); }
        const ls = fakeLS({'genealogie-sources-ouvertes-3-sites': JSON.stringify({freebmd: 'https://ex.org/?n={nom}'})});
        assert.equal(AR.url(ALL.find(e => e.id === 'so3_freebmd'), P, REGS, ls), 'https://ex.org/?n=Dupont');
        assert.ok(AR.hasCustom(ALL.find(e => e.id === 'so3_freebmd'), ls));
        assert.match(AR.url(RAW.find(e => e.id === 'socface'), P, REGS), /basedenoms_recensement\?es_names=Dupont/);
        assert.equal(AR.ready(ALL.find(e => e.id === 'so6_numelyo'), {place: 'Lyon'}), true, 'bibliothèque : un lieu suffit');
        assert.equal(AR.ready(ALL.find(e => e.id === 'so_gallica'), {place: 'Lyon'}), false);
        assert.equal(AR.outOfTime(ALL.find(e => e.id === 'so5_pamyat_naroda'), {y1: 1785, birthYear: 1785}), true);
        assert.equal(AR.outOfTime(ALL.find(e => e.id === 'so3_cicr_pg'), P), false);
    });
    await t('liens collés et textes : le bon lot (ses propres lecteurs), jamais javascript:', () => {
        const lot = u => AR.detectLink(u, REGS)?.lot;
        assert.equal(lot('https://www.idref.fr/026927608'), 6);
        assert.equal(lot('https://www.freebmd.org.uk/cgi/information.pl?x'), 3);
        assert.equal(lot('https://gallica.bnf.fr/ark:/12148/bpt6k1/f2.item'), 1);
        assert.equal(lot('https://www.memorialgenweb.org/memorial3/html/fr/complementter.php?id=1'), 4);
        assert.equal(lot('https://www.wikitree.com/wiki/Dupont-1'), 5);
        assert.equal(lot('https://www.archivesportaleurope.net/ead-display/-/ead/pl/x'), 7);
        assert.equal(lot('https://francearchives.gouv.fr/basedenoms_recensement?es_names=X'), 'socface');
        assert.equal(AR.detectLink('javascript:alert(1)', REGS), null); assert.equal(AR.detectLink('https://exemple.org/x', REGS), null);
        assert.equal(AR.detectLink('https://gallica.bnf.fr/ark:/12148/bpt6k1', REGS, {prefer: 2}).lot, 1, 'un lot qui connaît vraiment le site');
        assert.equal(AR.detectText('Castle Garden\nLast name: MOURGUE\nShip: Hammonia', REGS)?.lot, 5);
        assert.equal(AR.detectText('Agence internationale des prisonniers de guerre\nNom : MOURGUE\nCamp : Giessen', REGS, {prefer: 3})?.lot, 3);
    });
    await t('réglages : lus et écrits dans la clé de chaque lot, sous sa forme ; le lot 7 garde ses cercles et ses sites', () => {
        const so7 = {hidden: ['ape'], urls: {genwiki: 'https://w.example/?q={lieu}'}, cercles: {32: 'https://c32.example/'}, mine: [{key: 'm1', label: 'Mon cercle', url: 'https://m.example/?n={nom}', group: 'europe'}]};
        const ls = fakeLS({'genealogie-sources-ouvertes-7-sites': JSON.stringify(so7), 'genealogie-sources-ouvertes-sites': JSON.stringify({leonore: 'https://l.example/?n={nom}'})});
        assert.deepEqual(AR.custom(7, ls), {genwiki: 'https://w.example/?q={lieu}', cercles: {32: 'https://c32.example/'}});
        AR.writeUrls(7, {genwiki: '', ape: 'https://a.example/?q={nom}'}, ls);
        const o7 = JSON.parse(ls.getItem('genealogie-sources-ouvertes-7-sites'));
        assert.deepEqual(o7.urls, {ape: 'https://a.example/?q={nom}'}); assert.deepEqual(o7.hidden, ['ape']); assert.equal(o7.cercles[32], 'https://c32.example/'); assert.equal(o7.mine.length, 1);
        AR.writeUrls(1, {}, ls); assert.equal(ls.getItem('genealogie-sources-ouvertes-sites'), null, 'plus rien : la clé part');
        AR.writeHidden(['ape', 'so3_freebmd'], ls); assert.deepEqual(AR.hiddenIds(ls), ['ape', 'so3_freebmd']);
        const l2 = AR.collect(REGS, {hidden: AR.hiddenIds(ls), mine: AR.mineSites(ls)});
        assert.ok(l2.find(e => e.id === 'so7_ape').hidden && l2.find(e => e.id === 'so3_freebmd').hidden);
        assert.ok(l2.some(e => e.id === 'so7_m1' && e.mine), '« Mes sites » du lot 7');
        assert.equal(AR.url(l2.find(e => e.id === 'so7_m1'), P, REGS), 'https://m.example/?n=Dupont');
        assert.deepEqual(AR.STORE_KEYS, ['genealogie-sources-ouvertes-sites', ...[2, 3, 4, 5, 6, 7].map(n => `genealogie-sources-ouvertes-${n}-sites`)]);
    });

    /* ═════ 2. le code ═════ */
    await t('une seule fenêtre, un seul écran d’adresses, un seul « Coller un lien », plus de rangée par lot', () => {
        const files = fs.readdirSync(path.join(appRoot, 'assets/js')).filter(f => /\.js$/.test(f));
        const has = re => files.filter(f => re.test(fs.readFileSync(js(f), 'utf8')));
        assert.deepEqual(has(/<h2>🔍 Chercher dans les archives en ligne<\/h2>/), ['heritage-archives-en-ligne.js']);
        assert.deepEqual(has(/<h2>⚙️ (Adresses|Réglages) des sites[^<]*<\/h2>/), ['heritage-archives-en-ligne.js']);
        assert.deepEqual(has(/<h2>🔗 Coller un lien<\/h2>|<h2>📋 Coller un texte<\/h2>/), ['heritage-archives-en-ligne.js']);
        assert.deepEqual(has(/className = 'modal[^']*\bso[2-7]?-search\b/), ['heritage-archives-en-ligne.js']);
        assert.deepEqual(has(/className = 'modal[^']*sf-search/), [], 'SocFace : la fenêtre commune');
        const app = fs.readFileSync(js('app.js'), 'utf8');
        assert.ok(/archives\?\.panelButton/.test(app)); assert.ok(!/sourcesOuvertes\d?\?\.panelButton/.test(app));
        for (const n of ['', '-2', '-3', '-4', '-5', '-6', '-7']) {
            const src = fs.readFileSync(js(`heritage-sources-ouvertes${n}.js`), 'utf8');
            assert.ok(!/const panelButton/.test(src), `lot${n} : plus de rangée dans « Chercher sur internet »`);
            assert.match(src, /const openSearch = \(o = \{\}\) => ext\.archives\?\.open\(/, `lot${n} : openSearch → la fenêtre commune`);
            assert.match(src, /const openSettings = onChange => ext\.archives\?\.openSettings\(/, `lot${n} : ⚙️ → l’écran commun`);
        }
        const css = fs.readdirSync(path.join(appRoot, 'assets/css')).filter(f => /^sources-ouvertes/.test(f)); assert.deepEqual(css, [], 'une seule feuille : archives-en-ligne.css');
        const idx = fs.readFileSync(path.join(appRoot, 'index.php'), 'utf8');
        assert.ok(idx.indexOf('heritage-sources-ouvertes-7.js') < idx.indexOf('app-archives-en-ligne-core.js') && idx.includes('archives-en-ligne.css'));
    });
    await t('la couche commune ne demande rien à ces sites', () => {
        for (const f of ['app-archives-en-ligne-core.js', 'heritage-archives-en-ligne.js']) {
            const s = fs.readFileSync(js(f), 'utf8');
            assert.ok(!/XMLHttpRequest|sendBeacon|new Image\(|WebSocket|EventSource|fetch\(/.test(s), f);
        }
    });

    /* ═════ 3. le navigateur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie navigateur sautée'); return finish(); }
    let pw = null;
    for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
    if (!pw || process.env.NO_BROWSER) { console.log('— navigateur : sauté'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-ael-'));
    const dir = path.join(tmp, 'a'); fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    const envFor = d => ({...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1'});
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start,living_status) VALUES(1,'Jean','DUPONT','male',1,'deceased'),(2,'Louise','MARTIN','female',0,'deceased')");
$pdo->exec("INSERT INTO places(id,name,county,country) VALUES(1,'Tulle','Corrèze','France'),(2,'Caen','Calvados','France')");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?)');
foreach ([[1,'BIRT','2 mars 1892',1892,1],[1,'DEAT','20 août 1950',1950,1],[2,'BIRT','1 juin 1870',1870,1]] as [$pid,$tag,$d,$y,$pl]) { $ev->execute(['person',$pid,$t($tag),$d,$y,$pl]); }
echo 'ok';`], {cwd: appRoot, encoding: 'utf8', env: envFor(dir)});
    if (r.status !== 0 || !String(r.stdout).includes('ok')) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = Number(process.env.PORT) || await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env: envFor(dir), stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    const browser = await pw.chromium.launch();
    const errors = [], external = [];
    const shot = async (p, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, {recursive: true}); await p.screenshot({path: path.join(SHOTS, name), fullPage: false}); };
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
        for (const [name, vp, dark] of [['1440', {width: 1440, height: 900}, false], ['390', {width: 390, height: 844}, false], ['sombre', {width: 1440, height: 900}, true]].filter(([n]) => !process.env.VIEWS || process.env.VIEWS.split(',').includes(n))) {
            const ctx = await browser.newContext({viewport: vp, colorScheme: dark ? 'dark' : 'light'});
            await ctx.route(u => u.hostname !== '127.0.0.1', route => { external.push(route.request().url()); route.abort(); });
            const p = await ctx.newPage(); p.setDefaultTimeout(20000);
            p.on('pageerror', e => errors.push(`${name} : ${e.message}`));
            p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(`${name} : ${m.text()}`); });
            p.on('dialog', d => { errors.push(`${name} : dialogue natif ${d.message()}`); d.dismiss(); });
            await p.goto(base);
            await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.archives && window.LCNDA_ARCHIVES && window.LCNDA_EXT?.sourcesOuvertes7, null, {timeout: 30000});
            if (dark) await p.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); });
            const noScroll = async () => { const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(sw <= 0, `défilement horizontal : ${sw}`); };
            const close = async sel => { await p.click(`${sel} .modal-head [data-x], ${sel} .modal-head [data-ui-x]`); await p.waitForSelector(sel, {state: 'detached'}); };

            await t(`${name} : bloc « Chercher sur internet » — un bouton « 🔍 Archives en ligne… », « 🔗 Coller un lien », « 🌍 Où chercher ? »`, async () => {
                const html = await p.evaluate(() => { const A = window.LCNDA_APP; const box = document.createElement('div'); box.id = 'ael-test-ws';
                    box.innerHTML = A.webSearchPanelHtml({person: {id: 1, first_name: 'Jean', last_name: 'DUPONT'}, events: [], partners: []}, A.webSearchSettings(), 'ael-t'); document.body.prepend(box); return box.innerHTML; });
                assert.equal((html.match(/data-ael-open/g) || []).length, 1);
                assert.ok(/data-ael-paste/.test(html) && /data-ael-ouc/.test(html));
                assert.ok(!/so[2-7]-ws|data-so[2-7]?-search=""/.test(html) && (html.match(/class="so-ws/g) || []).length === 1, "plus de rangée par lot");
                await p.click('#ael-test-ws [data-ael-open]');
                await p.waitForSelector('dialog.ael-search[open] .ael-site');
                assert.equal(await p.inputValue('dialog.ael-search [name=last]'), 'DUPONT');
                await close('dialog.ael-search');
                await p.evaluate(() => document.getElementById('ael-test-ws').remove());
            });
            await t(`${name} : la fenêtre — tous les sites une fois, pastilles avec le nombre, C1, Gratuites seulement`, async () => {
                await p.evaluate(() => { localStorage.removeItem('genealogie-archives-en-ligne-vue'); window.LCNDA_EXT.archives.open({personId: 1}); });
                await p.waitForSelector('dialog.ael-search[open] .ael-site');
                assert.ok(await p.$('dialog.ael-search .ui-search-input'), 'case C1');
                assert.ok(await p.isChecked('dialog.ael-search [data-ael-free]'));
                const zones = await p.$$eval('dialog.ael-search [data-ael-zones] button', l => l.map(b => b.textContent.trim()));
                assert.match(zones[0], /^Tout \(\d+\)$/); assert.ok(zones.some(z => /^🇫🇷 France \(\d+\)$/.test(z)));
                const n = Number(zones[0].match(/\d+/)[0]); const sum = zones.slice(1).reduce((a, z) => a + Number(z.match(/\((\d+)\)/)[1]), 0); assert.equal(sum, n, 'les zones s’additionnent');
                await p.click('dialog.ael-search .ael-free');
                if (await p.$('dialog.ael-search [data-ael-old]')) await p.click('dialog.ael-search [data-ael-old]');
                const ids = await p.$$eval('dialog.ael-search .ael-site', l => l.map(x => x.dataset.aelSite));
                const expect = await p.evaluate(() => window.LCNDA_ARCHIVES.collect(window.LCNDA_ARCHIVES.registries(window)).length);
                assert.equal(ids.length, expect, 'tous les sites'); assert.equal(new Set(ids).size, ids.length, 'une seule fois');
                for (const id of ['so6_minutier', 'so6_siv', 'so6_marins_shd', 'so2_maitron_fusilles', 'socface']) assert.ok(!ids.includes(id), `${id} en double`);
                const links = await p.$$eval('dialog.ael-search .ael-acts a[data-ael-go]', as => as.map(a => [a.getAttribute('href'), a.closest('.so-link').querySelector('.so-url')?.textContent, a.target, a.rel]));
                links.forEach(([h, shown, tg, rel]) => { assert.equal(h, shown); assert.equal(tg, '_blank'); assert.match(rel, /noopener/); });
                assert.ok(await p.$('dialog.ael-search .ael-site.is-paid .ui-badge.is-red'), 'PAYANT');
                assert.ok(await p.$('dialog.ael-search .ui-badge.is-green') && await p.$('dialog.ael-search .ui-badge.is-yellow'), 'vérifiée / en partie');
                await p.click('dialog.ael-search .ael-free');
                await p.click('dialog.ael-search [data-ael-zone="eu"]');
                assert.ok(await p.isVisible('dialog.ael-search [data-ael-countries]'), 'les pays de la zone');
                await p.click('dialog.ael-search [data-ael-country="Italie"]');
                assert.deepEqual(await p.$$eval('dialog.ael-search .ael-site', l => l.map(x => x.dataset.aelSite)), ['so3_antenati_nom']);
                await p.click('dialog.ael-search [data-ael-zone=""]');
                await p.click('dialog.ael-search [data-ael-theme="mer"]');
                const mer = await p.$$eval('dialog.ael-search .ael-site', l => l.map(x => x.dataset.aelSite));
                assert.ok(mer.length >= 2 && mer.includes('so2_shd_marins'));
                await p.click('dialog.ael-search [data-ael-theme=""]');
                await p.fill('dialog.ael-search [data-ael-q]', 'zzzz');
                assert.match(await p.textContent('dialog.ael-search [data-ael-links]'), /Aucun site pour « zzzz »/);
                await p.fill('dialog.ael-search [data-ael-q]', '');
                await noScroll(); await shot(p, `ael-fenetre-${name}.png`);
                await close('dialog.ael-search');
            });
            await t(`${name} : les boutons des blocs ouvrent la fenêtre déjà filtrée (🎯) ; « Tout » montre le reste`, async () => {
                const cases = [
                    [() => window.LCNDA_EXT.sourcesOuvertes.openSearch({personId: 1, kind: 'matricule'}), /Registres matricules/, ids => ids.every(i => /^so_(matricules_ad|francearchives_noms|grand_memorial)$/.test(i))],
                    [() => window.LCNDA_EXT.sourcesOuvertes2.openSearch({personId: 1, group: 'shd'}), /Service historique/, ids => ids.every(i => /^so2_shd_/.test(i))],
                    [() => window.LCNDA_EXT.sourcesOuvertes4.openSearch({personId: 1, group: 'fr_cimetieres'}), /Cimetières/, ids => ids.length === 3],
                    [() => window.LCNDA_EXT.sourcesOuvertes5.openSearch({personId: 1, where: 'emigration'}), /Émigration/, ids => ids.includes('so5_castle_garden')],
                    [() => window.LCNDA_EXT.sourcesOuvertes7.openSearch({personId: 2, group: 'fr_enfants'}), /enfants trouvés/, ids => ids.join() === 'so7_ap_paris,so7_enfants_fa'],
                    [() => window.LCNDA_EXT.socface.openSearch({personId: 1}), /Recensements/, ids => ids.join() === 'so_francearchives_noms'],
                ];
                for (const [fn, label, ok] of cases) {
                    await p.evaluate(fn);
                    await p.waitForSelector('dialog.ael-search[open] .ael-focus.is-active');
                    await p.waitForSelector('dialog.ael-search .ael-site', {state: 'attached'});
                    assert.match(await p.textContent('dialog.ael-search .ael-focus'), label);
                    const ids = await p.$$eval('dialog.ael-search .ael-site', l => l.map(x => x.dataset.aelSite));
                    assert.ok(ids.length && ok(ids), `${label} : ${ids.join(',')}`);
                    await p.click('dialog.ael-search [data-ael-zone=""]');
                    assert.ok((await p.$$eval('dialog.ael-search .ael-site', l => l.length)) > ids.length, '« Tout » montre les autres sites');
                    await close('dialog.ael-search');
                }
                // un lieu : « 📍 Pour Caen », sans nom de personne, sa région d'abord
                await p.evaluate(() => window.LCNDA_EXT.sourcesOuvertes6.openSearch({group: 'fr_bn', place: 'Caen', placeOnly: true, placeId: 2, county: 'Calvados', country: 'France'}));
                await p.waitForSelector('dialog.ael-search[open] .ael-target');
                assert.match(await p.textContent('dialog.ael-search .ael-target'), /Caen/);
                assert.equal(await p.inputValue('dialog.ael-search [name=last]'), '');
                assert.equal(await p.getAttribute('dialog.ael-search .ael-site', 'data-ael-site'), 'so6_normannia');
                await shot(p, `ael-lieu-${name}.png`);
                await close('dialog.ael-search');
            });
            await t(`${name} : ⚙️ Adresses des sites — un seul écran, garde les anciennes clés de chaque lot (K2, ↺)`, async () => {
                await p.evaluate(() => {
                    localStorage.setItem('genealogie-sources-ouvertes-3-sites', JSON.stringify({freebmd: 'https://ex.org/?n={nom}'}));
                    localStorage.setItem('genealogie-sources-ouvertes-6-sites', JSON.stringify({minutier: 'https://m.example/?q={nom}'}));
                    localStorage.setItem('genealogie-sources-ouvertes-7-sites', JSON.stringify({hidden: ['ape'], urls: {}, cercles: {32: 'https://c32.example/'}, mine: [{key: 'm1', label: 'Mon cercle', url: 'https://m1.example/?n={nom}', group: 'europe'}]}));
                    window.LCNDA_EXT.sourcesOuvertes4.openSettings();
                });
                await p.waitForSelector('dialog.ael-settings[open] details.ael-rub');
                assert.equal(await p.$$eval('dialog.ael-settings, dialog.so-settings', l => l.length), 1, 'un seul écran');
                assert.equal(await p.inputValue('dialog.ael-settings [name=so3_freebmd]'), 'https://ex.org/?n={nom}', 'adresse du lot 3 reprise');
                assert.equal(await p.isChecked('dialog.ael-settings [data-ael-show="so7_ape"]'), false, 'site caché du lot 7 repris');
                assert.equal(await p.inputValue('dialog.ael-settings [data-ael-cdep]'), '32');
                assert.ok(await p.$('dialog.ael-settings [data-ael-mine-del="lot7:m1"]'), '« Mes sites » du lot 7');
                assert.ok(await p.$eval('dialog.ael-settings [name=so4_matricula]', i => i.closest('details').open), 'les rubriques du lot ouvertes');
                await p.fill('dialog.ael-settings [name=so4_matricula]', 'https://mat.example/?q={lieu}');
                await p.waitForTimeout(800);
                const st = await p.evaluate(() => Object.fromEntries([3, 4, 6, 7].map(n => [n, JSON.parse(localStorage.getItem(`genealogie-sources-ouvertes-${n}-sites`) || 'null')])));
                assert.equal(st[4].matricula, 'https://mat.example/?q={lieu}', 'écrit dans la clé du lot 4');
                assert.equal(st[3].freebmd, 'https://ex.org/?n={nom}'); assert.equal(st[6].minutier, 'https://m.example/?q={nom}', 'l’adresse d’un doublon sans case reste');
                assert.deepEqual(st[7].hidden, ['ape']); assert.equal(st[7].cercles[32], 'https://c32.example/'); assert.equal(st[7].mine.length, 1);
                await p.fill('dialog.ael-settings [data-ael-sq]', 'freebmd');
                assert.equal(await p.$$eval('dialog.ael-settings details.ael-rub:not([hidden])', d => d.length), 1);
                await p.fill('dialog.ael-settings [data-ael-sq]', '');
                await noScroll(); await shot(p, `ael-adresses-${name}.png`);
                await p.click('dialog.ael-settings [data-ui-reset]'); await p.waitForTimeout(300);
                assert.deepEqual(await p.evaluate(() => [1, 2, 3, 4, 5, 6, 7].map(n => localStorage.getItem(n === 1 ? 'genealogie-sources-ouvertes-sites' : `genealogie-sources-ouvertes-${n}-sites`))), [null, null, null, null, null, null, null], '↺ Remettre comme au départ');
                await close('dialog.ael-settings');
            });
            await t(`${name} : 🔗 Coller un lien — le site reconnu choisit l’import ; adresse dangereuse refusée sous le champ (K1)`, async () => {
                await p.evaluate(() => window.LCNDA_EXT.archives.openPaste({personId: 1}));
                await p.waitForSelector('dialog.ael-paste[open]');
                await p.fill('dialog.ael-paste [name=link]', 'https://www.idref.fr/026927608');
                assert.equal(await p.inputValue('dialog.ael-paste [name=lot]'), '6'); assert.match(await p.textContent('dialog.ael-paste [data-ael-found]'), /Reconnu/);
                await p.fill('dialog.ael-paste [name=link]', 'https://www.wikitree.com/wiki/Dupont-1');
                assert.equal(await p.inputValue('dialog.ael-paste [name=lot]'), '5');
                await p.fill('dialog.ael-paste [name=link]', 'javascript:alert(1)');
                await p.click('dialog.ael-paste button[type=submit]');
                assert.ok(await p.$('dialog.ael-paste[open] .is-invalid, dialog.ael-paste[open] [aria-invalid="true"]'), 'K1');
                await shot(p, `ael-coller-${name}.png`);
                await close('dialog.ael-paste');
            });
            await t(`${name} : ⤒ Importer ce que tu as trouvé ▾ — un menu, chaque ligne ouvre l’import de son lot`, async () => {
                await p.evaluate(() => window.LCNDA_EXT.sourcesOuvertes3.openSearch({personId: 1}));
                await p.waitForSelector('dialog.ael-search[open] [data-ael-import-menu]');
                await p.click('dialog.ael-search [data-ael-import-menu]');
                await p.waitForSelector('.ui-actmenu [role=menuitem]', {state: 'visible'});
                const items = await p.$$eval('.ui-actmenu [role=menuitem]', l => l.map(b => b.textContent.trim()).filter(Boolean));
                assert.ok(items.length >= 8, items.join(' | '));
                assert.match(items[0], /Prisonnier 14-18/, 'le lot d’où l’on vient en premier');
                await p.locator('.ui-actmenu [role=menuitem]').first().click();
                await p.waitForSelector('dialog.k-import[open]');
                assert.match(await p.textContent('dialog.k-import h2'), /France et d’ailleurs/, 'l’import du lot 3');
                await p.click('dialog.k-import .modal-head [data-k-x]');
                await p.waitForSelector('dialog.k-import', {state: 'detached'});
                // le ⤒ d'une ligne : l'import du lot de ce site
                await p.evaluate(() => window.LCNDA_EXT.sourcesOuvertes2.openSearch({personId: 1, group: 'memoire'}));
                await p.waitForSelector('dialog.ael-search[open] [data-ael-import="so2_fmd_livre"]');
                await p.click('dialog.ael-search [data-ael-import="so2_fmd_livre"]');
                await p.waitForSelector('dialog.k-import[open]');
                assert.ok(!await p.$('dialog.ael-search'), 'la fenêtre de recherche se ferme');
                await p.click('dialog.k-import .modal-head [data-k-x]');
                await p.waitForSelector('dialog.k-import', {state: 'detached'});
            });
            await ctx.close();
        }
        await t('navigateur : aucune erreur, aucune requête vers ces sites', () => {
            assert.deepEqual(errors, []);
            assert.deepEqual(external.filter(u => HOSTS.test(new URL(u).hostname)), [], 'aucune requête vers les archives');
        });
    } finally {
        await browser.close();
        proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    finish();
})();
