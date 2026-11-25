#!/usr/bin/env node
/* ⚖️ Les règles de sa vie et 🔍 Aider à lire les actes (lot 10) : assets/js/heritage-lot10-regles-actes.js, assets/css/lot10-regles-actes.css,
 * lib/lot10_regles_actes.php (💒 l10_mariages), le crochet LCNDA_EXT.readingAidTabs de heritage-lecture-autrefois.js,
 * données assets/data/l10-*.json.gz (scripts/lot10-regles-actes/*).
 * Le réseau (Wiktionnaire, Wikisource) est remplacé par des réponses VRAIES enregistrées une fois (tests/fixtures/lot10-regles-actes/).
 *  0. les données livrées : taille, sources, licences ; les calculs (Pâques, temps clos, coutume, vent, pays, Cappelli, saints) ;
 *  1. serveur : les dates des mariages d'une commune ;
 *  2. écran : bloc de fiche « ⚖️ Les règles de sa vie », monographie, 🧰 Données, Listes, carte, Où chercher, 📖 Aide à la lecture,
 *     la date d'un événement, Réglages.
 *   node tests/test-lot10-regles-actes.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const zlib = require('zlib');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FX = path.join(__dirname, 'fixtures/lot10-regles-actes');
const gz = f => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', f))).toString('utf8'));
const M = require('../assets/js/heritage-lot10-regles-actes.js');
const R = gz('l10-regles.json.gz'), J = gz('l10-jours.json.gz'), C = gz('l10-cappelli.json.gz'), AR = gz('dp-ancien-regime.json.gz');
const ROUEN = '76540', BRIVE = '19031', PARIS = '75056', CLERMONT = '63113';

(async () => {
    /* ═════════ 0. les données ═════════ */
    await t('données livrées : moins de 15 Mo ; chaque phrase citée a son adresse ; chaque image sa licence', async () => {
        const files = fs.readdirSync(path.join(root, 'assets/data')).filter(f => /^l10-(regles|jours|cappelli)\.json\.gz$/.test(f));
        const total = files.reduce((n, f) => n + fs.statSync(path.join(root, 'assets/data', f)).size, 0);
        console.log(`   ${files.length} fichiers, ${(total / 1e6).toFixed(2)} Mo : ${files.map(f => `${f} ${Math.round(fs.statSync(path.join(root, 'assets/data', f)).size / 1024)} Ko`).join(', ')}`);
        assert.strictEqual(files.length, 3); assert.ok(total < 15e6);
        const K = R.coutume;
        const quoted = [...Object.values(K.regimes), ...K.named, ...K.named.flatMap(n => n.more || []), ...Object.values(K.partage).flat(), ...Object.values(K.mixte), ...R.sel.after, ...R.sel.before, R.tempsclos.rule, R.tempsclos.dispense, ...R.vents];
        assert.ok(quoted.length > 40);
        for (const x of quoted) assert.ok(x.q && x.q.length > 20 && /^https:\/\/fr\.(wikipedia|wikisource)\.org\//.test(x.url) && x.title, JSON.stringify(x).slice(0, 200));
        assert.ok(K.maps.length === 2 && K.maps.every(m => m.page && m.licence), 'cartes avec licence');
        assert.ok(R.ecritures.length >= 12 && R.ecritures.every(e => e.page && /public domain|^CC/i.test(e.licence) && e.y), 'modèles d’écriture : licence relevée');
        assert.ok(R.pays.length > 300 && R.pays.every(p => /^Q\d+$/.test(p.q) && p.n));
        assert.ok(Object.keys(J.days).length >= 360, `les jours (${Object.keys(J.days).length})`); assert.strictEqual(J.licence, 'CC BY-SA 4.0');
        assert.ok(C.rows.length > 8000 && /domaine public/.test(C.licence) && C.page_url.includes('{p}'));
    });
    await t('calculs : Pâques (julien avant 1583), Avent, Carême ; un mariage du 12 mars 1754 en Carême, du 10 juin non', async () => {
        const e = y => M.civil(M.easterJdn(y), y);
        assert.deepStrictEqual(e(1754), {y: 1754, m: 4, d: 14}); assert.deepStrictEqual(e(2024), {y: 2024, m: 3, d: 31}); assert.deepStrictEqual(e(1500), {y: 1500, m: 4, d: 19});
        assert.strictEqual(M.tempsClos(1754, 3, 12).kind, 'careme'); assert.deepStrictEqual(M.tempsClos(1754, 3, 12).from, {y: 1754, m: 2, d: 27});
        assert.strictEqual(M.tempsClos(1754, 6, 10), null);
        assert.strictEqual(M.tempsClos(1775, 12, 10).kind, 'avent'); assert.strictEqual(M.tempsClos(1776, 1, 6).kind, 'avent'); assert.strictEqual(M.tempsClos(1776, 1, 7), null);
        assert.strictEqual(M.tempsClos(2024, 4, 7).kind, 'careme', 'jusqu’au dimanche après Pâques compris'); assert.strictEqual(M.tempsClos(2024, 4, 8), null);
        assert.deepStrictEqual(M.civil(M.adventJdn(2024), 2024), {y: 2024, m: 12, d: 1});
    });
    await t('calculs : la coutume (Rouen → Normandie, Brive → droit écrit, Paris → Coutume de Paris, Clermont → mixte), le vent, le pays', async () => {
        const c = i => M.coutumeOf(R, AR, i);
        assert.strictEqual(c(ROUEN).named.n, 'Coutume de Normandie'); assert.strictEqual(c(ROUEN).regime, 'coutume');
        assert.strictEqual(c(BRIVE).regime, 'ecrit'); assert.strictEqual(c(PARIS).named.n, 'Coutume de Paris'); assert.strictEqual(c(CLERMONT).regime, 'mixte');
        assert.strictEqual(c('99999'), null);
        assert.deepStrictEqual(M.ventsOf(R, '76').map(v => v.n), ['le suroît']); assert.ok(M.ventsOf(R, '13').some(v => v.n === 'le mistral'));
        const p = M.paysOf(R, {insee: ROUEN, lat: 49.443, lon: 1.099}); assert.ok(p.near.some(x => /Caux/.test(x.n)));
    });
    await t('calculs : Cappelli « Joes » → Ioannes, « pbr » → presbyter ; la Sainte-Blandine 1750 → 2 juin ; le Wiktionnaire « bru » (sens vieilli)', async () => {
        assert.strictEqual(M.cappelliSearch(C, 'Joes')[0].e, 'Ioannes'); assert.ok(M.cappelliSearch(C, 'pbr').some(r => r.e === 'presbyter'));
        assert.ok(M.subseq('joes', 'joannes') && !M.subseq('jose', 'joannes'));
        const s = M.saintDates(J, 'le jour de la Sainte-Blandine 1750');
        assert.ok(s.list.some(x => x.m === 6 && x.d === 2 && x.date.y === 1750 && x.weekday), JSON.stringify(s).slice(0, 300));
        const sens = M.wiktSenses(JSON.parse(fs.readFileSync(path.join(FX, 'wikt-bru.json'), 'utf8')).parse.wikitext['*']);
        assert.ok(sens.some(x => x.old && /fils/.test(x.t)));
        assert.ok(M.ecrituresFor(R, 1760).every(e => Math.abs(e.y - 1760) <= 60) && M.ecrituresFor(R, 1760)[0].y === 1765);
    });

    /* ═════════ 1. le serveur ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-l10r-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','deceased',0),(3,'Pierre','DURAND','male','deceased',0),(4,'Anne','DURAND','female','deceased',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Rouen','Seine-Maritime','France',49.443,1.099,'76540'),(2,'Brive-la-Gaillarde','Corrèze','France',45.1587,1.5321,'19031')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id,title,description) VALUES('person',?,?,?,?,?,?,'','')");
$ins->execute([1,$t('BIRT'),'25 novembre 1750',1750,'1750-11-25',1]); $ins->execute([1,$t('DEAT'),'1820',1820,'1820-00-00',1]);
$ins->execute([2,$t('BIRT'),'1760',1760,'1760-00-00',2]); $ins->execute([2,$t('DEAT'),'1830',1830,'1830-00-00',2]);
$ins->execute([3,$t('BIRT'),'1730',1730,'1730-00-00',1]); $ins->execute([4,$t('BIRT'),'1732',1732,'1732-00-00',1]);
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2),(2,3,4),(3,3,4),(4,3,4),(5,3,4),(6,3,4)");
$m = $pdo->prepare("INSERT INTO events(scope,family_id,event_type_id,date_text,year,sort_date,place_id) VALUES('family',?,?,?,?,?,1)");
foreach ([[1,'1775-12-10'],[2,'1755-01-20'],[3,'1756-03-20'],[4,'1757-11-08'],[5,'1758-01-03'],[6,'1754-03-12']] as [$f, $d]) { $m->execute([$f,$t('MARR'),$d,(int)$d,$d]); }
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [], online = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        // le réseau extérieur : les réponses enregistrées ; les images de Commons ne sont pas chargées
        await ctx.route(/^https:\/\/(fr\.wiktionary|fr\.wikisource)\.org\//, route => { const u = route.request().url(); online.push(u);
            route.fulfill({status: 200, contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: fs.readFileSync(path.join(FX, /wiktionary/.test(u) ? 'wikt-bru.json' : 'ws-bru.json'))}); });
        await ctx.route(/^https:\/\/(upload|thumb)\.wikimedia\.org\//, route => route.fulfill({status: 404, body: ''}));
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        for (const [js, css, k] of [['heritage-droit-pouvoir.js', 'droit-pouvoir.css', 'droitPouvoir'], ['heritage-monographie-plus.js', 'monographie-plus.css', 'monographiePlus'], ['heritage-lot9-monde-coutumes.js', 'lot9-monde-coutumes.css', 'mondeCoutumes'], ['heritage-lot10-regles-actes.js', 'lot10-regles-actes.css', 'reglesActes']]) {
            if (await p.evaluate(x => !!window.LCNDA_EXT?.[x], k)) continue;
            if (css) await p.addStyleTag({url: base + 'assets/css/' + css});
            await p.addScriptTag({url: base + 'assets/js/' + js});
        }
        await p.waitForFunction(() => window.LCNDA_EXT?.reglesActes, null, {timeout: 10000});
        const api = (x, qq = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, qq]);

        await t('l10_mariages : les dates des 6 mariages de Rouen (par le lieu ou par le code INSEE), sans nom', async () => {
            const r = await api('l10_mariages', {place_id: 1});
            assert.strictEqual(r.ok, true, JSON.stringify(r)); assert.strictEqual(r.total, 6); assert.strictEqual(r.dates.length, 6);
            assert.ok(r.dates.every(d => /^\d{4}-\d\d-\d\d$/.test(d)) && !JSON.stringify(r).includes('MAZAUD'));
            assert.strictEqual((await api('l10_mariages', {insee: ROUEN})).total, 6);
            assert.strictEqual((await api('l10_mariages', {place_id: 2})).total, 0);
        });

        /* ═════════ 2. l'écran ═════════ */
        await t('fiche de Jean MAZAUD (Rouen, 1750) : coutume de Normandie, sel, mariage en Avent, dicton de la Sainte-Catherine, suroît, pays', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-l10r-person="1"] [data-l10r-line="coutume"]', {timeout: 20000});
            const line = async k => ((await p.$(`[data-l10r-person="1"] [data-l10r-line="${k}"]`)) ? p.textContent(`[data-l10r-person="1"] [data-l10r-line="${k}"]`) : '');
            assert.match(await line('coutume'), /Avant la Révolution, Rouen suivait la Coutume de Normandie \(pays de coutume\)/);
            assert.match(await line('coutume'), /excluait les filles/);
            assert.match(await line('sel'), /1806/);
            assert.match(await line('tempsclos'), /Son mariage du 10 décembre 1775 tombe pendant l’Avent \(du 3 décembre 1775 au 6 janvier 1776\)/);
            assert.match(await line('tempsclos'), /dispense/);
            assert.match(await line('dictons'), /Né le 25 novembre : « À la Sainte-Catherine/);
            assert.match(await line('vent'), /suroît/); assert.match(await line('pays'), /Caux|Bray|Vexin/);
            assert.ok(await p.$('[data-l10r-person="1"] a[href^="https://fr.wikipedia.org/"][target="_blank"]'), 'lien ↗ vers la source');
            assert.strictEqual(await p.$eval('[data-pblock="regles_vie"]', el => el.hidden), false);
            if (process.env.L10R_SHOT) { await p.$eval('[data-pblock="regles_vie"]', el => { el.querySelectorAll('details').forEach(d => { d.open = true; }); el.scrollIntoView(); }); await (await p.$('[data-pblock="regles_vie"]')).screenshot({path: process.env.L10R_SHOT}); }
        });
        await t('fiche de Marie LACOMBE (Brive, 1760) : pays de droit écrit, le Midi et la « maison »', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 2; A.setModule('personnes'); });
            await p.waitForSelector('[data-l10r-person="2"] [data-l10r-line="coutume"]', {timeout: 20000});
            const txt = await p.textContent('[data-l10r-person="2"] [data-l10r-line="coutume"]');
            assert.match(txt, /Brive-la-Gaillarde était en pays de droit écrit \(province : Limousin\)/); assert.match(txt, /quart sud-ouest/);
        });
        await t('Où chercher : « ⚖️ Le texte de sa coutume »', async () => {
            const txt = await p.evaluate(async () => { const body = document.createElement('div'); document.body.appendChild(body); window.LCNDA_EXT.ouChercher.afterRedraw.forEach(fn => fn({pid: 1}, body)); for (let i = 0; i < 40 && !body.querySelector('[data-l10r-ouc]'); i++) await new Promise(r => setTimeout(r, 100)); const t = body.textContent; body.remove(); return t; });
            assert.match(txt, /Le texte de sa coutume/); assert.match(txt, /Coutume de Normandie/);
        });
        await t('monographie : Rouen → coutume, 💒 6 mariages dont 4 en temps clos, vent ; rien pour Bruxelles', async () => {
            const ids = await p.evaluate(() => (window.LCNDA_EXT.monographSections || []).filter(s => /^l10r_/.test(s.id)).map(s => s.id));
            assert.deepStrictEqual(ids, ['l10r_coutume', 'l10r_mariages', 'l10r_vent', 'l10r_pays']);
            const run = (id, place) => p.evaluate(async ([i, pl]) => { const h = document.createElement('div'); document.body.appendChild(h); const s = window.LCNDA_EXT.monographSections.find(x => x.id === i);
                const ok = await s.render(pl, h, {village: async () => (pl.insee ? {insee: pl.insee} : null)}); const t = h.textContent; h.remove(); return {ok, t}; }, [id, place]);
            const rouen = {id: 1, name: 'Rouen', latitude: 49.443, longitude: 1.099, insee: ROUEN};
            assert.match((await run('l10r_coutume', rouen)).t, /Coutume de Normandie/);
            const m = await run('l10r_mariages', rouen); assert.strictEqual(m.ok, true); assert.match(m.t, /6 mariages notés à Rouen dans ta base : 4 en temps clos/);
            assert.match((await run('l10r_vent', rouen)).t, /suroît/);
            assert.strictEqual((await run('l10r_coutume', {id: 0, name: 'Bruxelles', country: 'Belgique', latitude: 50.85, longitude: 4.35})).ok, false);
        });
        await t('📖 Aide à la lecture : onglets ✂️ « Joes » → Ioannes (page de Cappelli), 📅 Sainte-Blandine 1750, 📚 « bru » (en ligne, enregistré), 🖋️ 1760', async () => {
            await p.evaluate(() => window.LCNDA_EXT.readingAid.open({tab: 'l10r_cappelli', q: 'Joes'}));
            await p.waitForFunction(() => /Ioannes/.test(document.querySelector('.la-dialog [data-la-body]')?.textContent || ''), null, {timeout: 10000});
            assert.ok(await p.$('.la-dialog [data-la-tab="l10r_cappelli"].is-active'));
            assert.ok(await p.$('.la-dialog a[href*="Lexicon_Abbreviaturarum"][href*="page=223"]'), 'lien vers la page 223');
            await p.click('.la-dialog [data-l10r-capp-page="223"]'); await p.waitForSelector('.la-dialog .l10r-capp-page');
            await p.click('.la-dialog [data-la-tab="l10r_fetes"]'); await p.fill('.la-dialog .la-search input', 'le jour de la Sainte-Blandine 1750');
            await p.waitForFunction(() => /2 juin 1750/.test(document.querySelector('.la-dialog [data-la-body]')?.textContent || ''), null, {timeout: 10000});
            await p.click('.la-dialog [data-la-tab="l10r_mots"]'); await p.fill('.la-dialog .la-search input', 'bru');
            await p.waitForFunction(() => /Épouse du fils/.test(document.querySelector('.la-dialog [data-la-body]')?.textContent || ''), null, {timeout: 10000});
            const txt = await p.textContent('.la-dialog [data-la-body]');
            assert.match(txt, /Académie française \(1878\)/); assert.match(txt, /Wiktionnaire/);
            assert.ok(online.length >= 2 && online.every(u => /origin=\*/.test(u) && /bru/.test(decodeURIComponent(u))), 'seulement le mot part');
            await p.click('.la-dialog [data-la-tab="l10r_ecritures"]'); await p.fill('.la-dialog [data-l10r-year]', '1760'); await p.dispatchEvent('.la-dialog [data-l10r-year]', 'change');
            await p.waitForFunction(() => /écriture ronde/.test(document.querySelector('.la-dialog [data-la-body]')?.textContent || ''), null, {timeout: 10000});
            await p.click('.la-dialog [data-la-tab="dict"]'); await p.waitForSelector('.la-dialog .la-dict, .la-dialog .empty-line', {timeout: 5000});
            await p.keyboard.press('Escape');
        });
        await t('date d’un événement : « le jour de la Sainte-Blandine 1750 » → une proposition de date ; Saint-Martin : le calcul habituel', async () => {
            await p.evaluate(() => { const f = document.createElement('form'); f.id = 'event-form'; f.innerHTML = '<label><input name="date_text"></label><textarea name="description"></textarea>'; document.body.appendChild(f); });
            await p.fill('#event-form [name=date_text]', 'le jour de la Sainte-Blandine 1750');
            await p.waitForSelector('#event-form .l10r-feast-hint', {timeout: 5000});
            assert.match(await p.textContent('#event-form .l10r-feast-hint'), /mardi 2 juin 1750/);
            await p.click('#event-form .l10r-feast-hint [data-h-feast-use]');
            assert.strictEqual(await p.inputValue('#event-form [name=date_text]'), '2 juin 1750');
            await p.fill('#event-form [name=date_text]', 'le jour de la Saint-Martin 1702'); await sleep(300);
            assert.strictEqual(await p.$('#event-form .l10r-feast-hint'), null, 'Saint-Martin : la proposition habituelle suffit');
            await p.evaluate(() => document.getElementById('event-form').remove());
        });
        await t('LCNDA_EXT.dataSources, dataLists, mapLayerSources : à la demande ; listes avec source et lien par ligne', async () => {
            const ids = await p.evaluate(() => (window.LCNDA_EXT.dataSources || []).filter(d => /^l10r_/.test(d.id)).map(d => d.id));
            assert.ok(ids.length >= 14 && ids.includes('l10r_p_coutume') && ids.includes('l10r_l_mariages') && ids.includes('l10r_y_tempsclos'), ids.join());
            const y = await p.evaluate(async () => { const h = document.createElement('div'); const ok = await window.LCNDA_EXT.dataSources.find(d => d.id === 'l10r_y_tempsclos').run({year: 1754}, h); return {ok, t: h.textContent}; });
            assert.strictEqual(y.ok, true); assert.match(y.t, /En 1754, Pâques tombe le 14 avril/);
            const L = await p.evaluate(async () => Promise.all((window.LCNDA_EXT.dataLists || []).filter(d => /^l10r_/.test(d.id) && d.id !== 'l10r_coutumes').map(async d => { const rows = await d.load(); return {id: d.id, n: rows.length, src: !!d.source, urls: d.fields.some(f => f.type === 'url')}; })));
            assert.ok(L.length >= 7 && L.every(x => x.src && x.n > 0 && (x.urls || x.id === 'l10r_tempsclos')), JSON.stringify(L));
            const layer = await p.evaluate(async () => { const s = window.LCNDA_EXT.mapLayerSources.find(x => x.id === 'l10r_coutume'); const r = await s.run({bbox: [0.9, 49.3, 1.3, 49.6], max: 300}); return {n: r.features.length, labels: [...new Set(r.features.map(f => f.label))], src: r.source}; });
            assert.ok(layer.n > 10 && layer.labels.some(l => /Coutume de Normandie/.test(l)), JSON.stringify(layer).slice(0, 300));
        });
        await t('Réglages → ⚖️ Règles et actes : éteindre « Le vent de son pays » (↶ possible) le retire de la fiche ; À propos des données', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'regles_actes'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-l10r-settings] [data-l10r-tg="vent"] input', {timeout: 20000});
            const s = await p.textContent('[data-l10r-settings]');
            assert.match(s, /CC BY-SA 4\.0/); assert.match(s, /domaine public/); assert.match(s, /Ad fontes/);
            await p.uncheck('[data-l10r-tg="vent"] input');
            assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-regles-actes'))).vent, false);
            await p.evaluate(() => { document.querySelectorAll('[data-l10r-done]').forEach(x => x.removeAttribute('data-l10r-done')); const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-l10r-person="1"] [data-l10r-line="coutume"]', {timeout: 20000});
            assert.strictEqual(await p.$('[data-l10r-person="1"] [data-l10r-line="vent"]'), null);
            await p.evaluate(() => localStorage.removeItem('genealogie-regles-actes'));
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
