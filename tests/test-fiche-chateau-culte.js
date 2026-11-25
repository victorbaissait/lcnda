#!/usr/bin/env node
/* 🏰 Fiche d'un château · ⛪ fiche d'un lieu de culte (assets/js/heritage-fiche-edifice.js, assets/css/fiche-edifice.css, lib/edifices.php ;
 * maquette validée : docs/design/fiche-chateau-culte.html). Les châteaux (Wikidata) et les lieux de culte disparus sont les VRAIS fichiers
 * livrés ; le pack « Patrimoine » de la Corrèze est un petit pack d'ESSAI fabriqué ici (marqué « fixture »).
 *  1. calcul (Node) : sortes, clé d'un nom, pré-remplissage depuis un château / une église / Mérimée, siècles, actes par sorte, objets Palissy ;
 *  2. serveur : créer, relier, proposer les actes d'après l'adresse, effacer et remettre (↶) ;
 *  3. écran : « 🏰⛪ Les édifices de la commune » (« ＋ Faire une fiche », ↶ Annuler), la fiche (sources ↗, propriétaires Wikidata gardés
 *     d'un clic, actes proposés reliés, objets Palissy, histoire Mérimée), la fiche d'une personne (ligne de l'acte, « Relier à une fiche ? »,
 *     bloc des rôles), la petite fiche d'un château, les registres communs, Réglages (éteindre, ↶).
 *   node tests/test-fiche-chateau-culte.js */
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
const F = require('../assets/js/heritage-fiche-edifice.js');
const L8 = require('../assets/js/heritage-lot8-monde-village.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const gz = p => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', p))).toString('utf8'));
const CASTLES = gz('chateaux/chateaux-FR.json.gz').items;
const SEDIERES = CASTLES.find(c => c.q === 'Q2970734'); // château de Sédières, Clergoux (Corrèze)
const EGLISES = L8.table(gz('l8c-eglises.json.gz'));
const AUBAZINE = EGLISES.find(r => r.q === 'Q1137944'); // abbaye d'Aubazine
const CC = gz('cc-communes.json.gz').c;

(async () => {
    await t('données : le château de Sédières et l’abbaye d’Aubazine sont dans les fichiers livrés', async () => {
        assert.ok(SEDIERES && SEDIERES.ci === '19056' && SEDIERES.ow.length >= 2 && SEDIERES.me, 'Sédières');
        assert.ok(AUBAZINE && AUBAZINE.ins === '19013' && AUBAZINE.mh === 'PA00099658', 'Aubazine');
    });

    await t('calcul : sortes, clé d’un nom, sorte d’après une adresse', async () => {
        assert.strictEqual(F.groupOf('prieure'), 'abbey'); assert.strictEqual(F.groupOf('maison_forte'), 'castle'); assert.strictEqual(F.groupOf('synagogue'), 'synagogue');
        assert.strictEqual(F.keyOf('Église Saint-Martin'), 'saint martin'); assert.strictEqual(F.keyOf('Château de Fléville'), 'fleville');
        assert.ok(F.hasKey('en l’église St-Martin', 'saint martin')); assert.ok(!F.hasKey('église Saint-Pierre', 'saint martin'));
        assert.strictEqual(F.kindFromText('en la chapelle du château'), 'chateau'); assert.strictEqual(F.kindFromText('temple de l’Église réformée'), 'temple');
        assert.strictEqual(F.kindFromText('rue des Lilas'), '');
    });

    await t('calcul : pré-remplir depuis un château de Wikidata, une église disparue, Mérimée ; siècles', async () => {
        const s = F.siteFromCastle(SEDIERES, 'FR');
        assert.strictEqual(s.kind, 'chateau_fort'); assert.strictEqual(s.wikidata, 'Q2970734'); assert.strictEqual(s.insee, '19056'); assert.strictEqual(s.merimee, SEDIERES.me);
        assert.match(s.protection, /monument historique/); assert.strictEqual(s.origin, 'cht:FR'); assert.match(s.wikipedia, /^https:\/\/fr\.wikipedia\.org\/wiki\//);
        const w = F.siteFromWorship({q: AUBAZINE.q, name: AUBAZINE.n, kind: AUBAZINE.k, state: AUBAZINE.st, from: AUBAZINE.y0, to: AUBAZINE.y1, image: AUBAZINE.img, wikipedia: 'x', mh: AUBAZINE.mh, lat: 1, lon: 2}, '19013');
        assert.strictEqual(w.kind, 'abbaye'); assert.strictEqual(w.cult, 'catholique'); assert.strictEqual(w.gone_year, null, 'une abbaye « fermée » n’est pas « détruite »'); assert.strictEqual(w.merimee, 'PA00099658');
        const m = F.siteFromMerimee({nom: 'Église Saint-Martin', deno: 'église', ref: 'PA00000001', insee: '19246', vocable: 'Saint-Martin'});
        assert.strictEqual(m.kind, 'eglise'); assert.strictEqual(m.patron_saint, 'Saint-Martin'); assert.strictEqual(m.origin, 'merimee');
        assert.strictEqual(F.whenTxt({built_from: 1250, built_to: 1533}), 'XIIIe – XVIe s.'); assert.strictEqual(F.whenTxt({built_from: 1150}), 'XIIe s.'); assert.strictEqual(F.whenTxt({built_from: 1820}), '1820');
    });

    await t('calcul : actes par sorte et par décennie ; objets Palissy de l’édifice ; qui était curé cette année-là', async () => {
        const st = F.eventStats([{tag: 'CHR', year: 1745}, {tag: 'BIRT', year: 1747}, {tag: 'MARR', year: 1768}, {tag: 'BURI', year: 1801}, {tag: 'OCCU', year: 1770}]);
        assert.deepStrictEqual([st.bapt, st.marr, st.buri, st.other], [2, 1, 1, 1]); assert.deepStrictEqual(st.decades, [[1740, 2], [1760, 1], [1770, 1], [1800, 1]]);
        const list = [{base: 'merimee', ref: 'PA1', nom: 'Église Saint-Martin', deno: 'église'}, {base: 'palissy', ref: 'PM1', nom: 'fonts baptismaux', edifice: 'église paroissiale Saint-Martin'}, {base: 'palissy', ref: 'PM2', nom: 'cloche', edifice: 'chapelle Saint-Roch'}];
        const h = F.heritageOf({name: 'Église Saint-Martin', merimee: ''}, list);
        assert.strictEqual(h.notice.ref, 'PA1'); assert.deepStrictEqual(h.objects.map(o => o.ref), ['PM1']);
        assert.deepStrictEqual(F.atYear([{year_from: 1740, year_to: 1771, name: 'A'}, {year_from: 1702, year_to: 1739, name: 'B'}, {name: 'sans dates'}], 1745).map(x => x.name), ['A']);
    });

    /* ─────────── serveur et écran ─────────── */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-fe-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4',
        FE_PLACES: JSON.stringify([CC['19056'], CC['19013']])};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
[$cl, $au] = json_decode(getenv('FE_PLACES'), true);
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(1,'Pierre','MAZAUD','male','deceased',1,'cultivateur'),(2,'Marie','DURAND','female','deceased',0,''),(3,'Antoine','LACOMBE','male','deceased',0,'moine'),(4,'Jean','LACOMBE','male','deceased',0,'')");
$s = $pdo->prepare("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(?,?,?,?,?,?,?)");
$s->execute([1,'Clergoux','Corrèze','France',$cl[1],$cl[2],'19056']); $s->execute([2,'Aubazines','Corrèze','France',$au[1],$au[2],'19013']);
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2)");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(id,scope,person_id,family_id,event_type_id,date_text,year,sort_date,place_id,address) VALUES(?,?,?,?,?,?,?,?,?,?)");
$ins->execute([1,'person',1,null,$t('CHR'),'12 mars 1745',1745,'1745-03-12',2,'église de l’abbaye d’Aubazine']);
$ins->execute([2,'family',null,1,$t('MARR'),'1768',1768,'1768-02-02',2,'abbaye d’Aubazine']);
$ins->execute([3,'person',1,null,$t('DEAT'),'1801',1801,'1801-01-05',1,'château de Sédières']);
$ins->execute([4,'person',1,null,$t('RESI'),'1790',1790,'1790',1,'chapelle Saint-Roch']);
$ins->execute([5,'person',3,null,$t('BIRT'),'1700',1700,'1700',2,'']);
$ins->execute([6,'person',4,null,$t('BIRT'),'1690',1690,'1690',1,'']);
// le pack « Patrimoine » de la Corrèze, d'ESSAI (comme scripts/lieux-patrimoine/build-packs.py --fixture)
@mkdir(SHARED_DATA_DIR.'/lieux-patrimoine', 0777, true);
$pk = new PDO('sqlite:'.SHARED_DATA_DIR.'/lieux-patrimoine/patrimoine-19.sqlite');
$pk->exec("CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT); CREATE TABLE sources(id TEXT PRIMARY KEY, nom TEXT, licence TEXT, mention TEXT, url TEXT, mise_a_jour TEXT);
  CREATE TABLE objets(ref TEXT PRIMARY KEY, base TEXT, nom TEXT, cle TEXT, deno TEXT, insee TEXT, commune TEXT, siecle TEXT, dates TEXT, protection TEXT, resume TEXT, edifice TEXT, vocable TEXT, lat REAL, lon REAL);
  INSERT INTO meta VALUES('kind','patrimoine'),('format','1'),('dep','19'),('built','2026-11-25'),('fixture','1');
  INSERT INTO objets VALUES('PA00099658','merimee','Abbaye d''Aubazine','abbaye d aubazine','abbaye','19013','Aubazines','12e siècle','','classé MH (essai)','Texte d''essai : abbaye cistercienne (données inventées pour l''essai).','','Saint-Étienne',45.1747,1.67),
    ('PM19000001','palissy','fonts baptismaux','fonts baptismaux','fonts baptismaux','19013','Aubazines','12e siècle','','classé au titre objet (essai)','','abbaye d''Aubazine','',null,null);");
$pk = null;
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.route(/^https:\/\/((upload|thumb|commons)\.wikimedia\.org|[a-z]\.tile\.openstreetmap\.(org|fr)|tile\.openstreetmap\.org)\//, r => r.abort()); // pas d'Internet dans l'essai
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        // index.php ne charge pas encore heritage-fiche-edifice.js : on l'ajoute (comme le feront les balises), et ce dont il se sert
        for (const [js, css] of [['heritage-chateaux-territoires.js', 'chateaux-territoires.css'], ['heritage-lot8-monde-village.js', 'lot8-monde-village.css'], ['heritage-lieux-patrimoine.js', 'lieux-patrimoine.css'], ['heritage-fiche-edifice.js', 'fiche-edifice.css']]) {
            const has = await p.evaluate(f => [...document.scripts].some(s => s.src.includes(f)), js);
            if (!has) { await p.addStyleTag({url: base + 'assets/css/' + css}); await p.addScriptTag({url: base + 'assets/js/' + js}); }
        }
        await p.waitForFunction(() => !!window.LCNDA_EXT?.ficheEdifice && !!window.LCNDA_EXT?.lot8MondeVillage && !!window.LCNDA_EXT?.chateauxTerritoires);
        const api = (a, q = {}) => p.evaluate(([a, q]) => window.LCNDA_APP.api(a, q), [a, q]);
        const toastUndo = async () => { await p.locator('button:has-text("↶ Annuler")').last().click({timeout: 5000}); await sleep(600); };
        const placeHtml = id => p.evaluate(async id => {
            const pl = id === 1 ? {id: 1, name: 'Clergoux', insee: '19056', lat: 45.2735, lon: 1.9591} : {id: 2, name: 'Aubazines', insee: '19013', lat: 45.1867, lon: 1.6871};
            let h = document.querySelector(`[data-test-place="${id}"]`); if (!h) { h = document.createElement('div'); h.dataset.testPlace = String(id); document.body.prepend(h); }
            const ok = await window.LCNDA_EXT.ficheEdifice.placeInto(h, pl, {online: false}); return [ok, h.innerHTML];
        }, id);

        await t('commune : Clergoux → le château de Sédières (Wikidata, ↗ source, « ＋ ») ; Aubazines → l’abbaye une seule fois (Wikidata = Mérimée)', async () => {
            const [ok, html] = await placeHtml(1);
            assert.strictEqual(ok, true); assert.match(html, /Château de Sédières/); assert.match(html, /pas encore de fiche/); assert.match(html, /www\.wikidata\.org\/wiki\/Q2970734/); assert.match(html, /data-fe-make/);
            const [ok2, h2] = await placeHtml(2);
            assert.strictEqual(ok2, true); assert.strictEqual((h2.match(/Abbaye d’Aubazine|Abbaye d'Aubazine/g) || []).length, 1, h2.slice(0, 600));
        });

        await t('« ＋ Faire une fiche » : la fiche s’ouvre pré-remplie (sorte, protection, liens ↗) ; ↶ Annuler l’efface', async () => {
            await p.click('[data-test-place="1"] li:has-text("Sédières") [data-fe-make]');
            await p.waitForSelector('dialog.fe-dlg[open] .fe-sheet', {timeout: 15000});
            const txt = await p.textContent('dialog.fe-dlg .fe-sheet');
            assert.match(txt, /Château fort/i); assert.match(txt, /monument historique classé/); assert.match(txt, /Wikidata ↗/); assert.match(txt, /Mérimée ↗/);
            assert.match(txt, /Seigneurs et propriétaires/); assert.match(txt, /Archives du château/);
            assert.strictEqual((await api('ed_list')).sites.length, 1);
            await toastUndo();
            assert.strictEqual((await api('ed_list')).sites.length, 0);
            assert.strictEqual(await p.evaluate(() => !!document.querySelector('dialog.fe-dlg[open]')), false);
        });

        let sedId = 0;
        await t('château : propriétaires Wikidata (P127) proposés, « ＋ Garder » (↗ source gardée) ; l’acte « château de Sédières » proposé puis relié', async () => {
            sedId = (await p.evaluate(async () => (await window.LCNDA_EXT.ficheEdifice.create({...window.LCNDA_EXT.ficheEdifice.siteFromCastle((await window.LCNDA_EXT.chateauxTerritoires.loadCountry('FR')).items.find(c => c.q === 'Q2970734'), 'FR'), place_id: 1})).id));
            await p.waitForSelector('dialog.fe-dlg[open] [data-fe-x="people"] [data-fe-pkeep]', {state: 'attached', timeout: 15000});
            const sug = await p.textContent('dialog.fe-dlg [data-fe-x="people"]');
            assert.match(sug, /propriétaire/); assert.match(sug, /Wikidata \(P127\)/);
            await p.click('dialog.fe-dlg [data-fe-x="people"] summary');
            await p.click('dialog.fe-dlg [data-fe-pkeep="0"]');
            await p.waitForSelector('dialog.fe-dlg [data-fe-prow]', {timeout: 10000});
            const g = await api('ed_get', {id: sedId});
            assert.strictEqual(g.people.length, 1); assert.match(g.people[0].source_url, /^https:\/\/www\.wikidata\.org\/wiki\/Q/); assert.strictEqual(g.people[0].person_id, null, 'pas une personne de l’arbre sans « Relier »');
            assert.deepStrictEqual(g.proposed.map(e => e.id), [3]);
            await p.click('dialog.fe-dlg [data-fe-elink="3"]');
            await p.waitForFunction(() => document.querySelector('dialog.fe-dlg [data-fe-eunlink="3"]'), null, {timeout: 10000});
            const g2 = await api('ed_get', {id: sedId}); assert.deepStrictEqual(g2.events.map(e => e.id), [3]); assert.strictEqual(g2.proposed.length, 0);
            assert.match(await p.textContent('dialog.fe-dlg .fe-sheet'), /1 sépulture ou décès de ta famille/);
        });

        let abbId = 0;
        await t('abbaye : actes proposés (adresse) « ✓ Tout relier », objets Palissy, historique Mérimée, moine de l’arbre proposé', async () => {
            await p.evaluate(() => document.querySelector('dialog.fe-dlg')?.close());
            await placeHtml(2);
            await p.click('[data-test-place="2"] li:has-text("Aubazine") [data-fe-make]');
            await p.waitForSelector('dialog.fe-dlg[open] [data-fe-elink-all]', {timeout: 15000});
            abbId = await p.evaluate(() => Number(document.querySelector('dialog.fe-dlg [data-fe-site]').dataset.feSite));
            await p.click('dialog.fe-dlg [data-fe-elink-all]');
            await p.waitForFunction(() => document.querySelectorAll('dialog.fe-dlg [data-fe-eunlink]').length === 2, null, {timeout: 10000});
            await p.waitForSelector('dialog.fe-dlg [data-fe-x="objects"]:not([hidden])', {timeout: 15000});
            const txt = await p.textContent('dialog.fe-dlg .fe-sheet');
            assert.match(txt, /Abbaye/); assert.match(txt, /Les abbés, prieurs et religieux/); assert.match(txt, /1 baptême ou naissance, 1 mariage de ta famille/);
            assert.match(txt, /fonts baptismaux/); assert.match(txt, /Les fonts baptismaux sont protégés ; 1 baptême/); assert.match(txt, /données d’essai, inventées/);
            assert.match(txt, /Monument historique : classé MH \(essai\)/); assert.match(txt, /l’historique Mérimée/);
            assert.match(await p.textContent('dialog.fe-dlg [data-fe-x="people"]'), /Antoine LACOMBE[\s\S]*dans ton arbre : « moine »/);
            await p.click('dialog.fe-dlg [data-fe-x="people"] summary');
            const i = await p.evaluate(() => document.querySelector('dialog.fe-dlg [data-fe-x="people"]').__sug.findIndex(x => x.person_id === 3));
            await p.click(`dialog.fe-dlg [data-fe-pkeep="${i}"]`);
            await p.waitForFunction(() => document.querySelector('dialog.fe-dlg [data-fe-prow] [data-fe-pid="3"]'), null, {timeout: 10000});
        });

        if (process.env.FE_SHOT) { // FE_SHOT=dossier : des captures pour regarder la fiche (clair, sombre, téléphone)
            const shot = async n => { await sleep(700); await p.screenshot({path: path.join(process.env.FE_SHOT, n + '.png')}); };
            await p.evaluate(() => document.querySelectorAll('.toast, [class*="toast"]').forEach(x => x.remove()));
            await shot('fiche-abbaye'); await p.evaluate(() => { const d = document.querySelector('dialog.fe-dlg'); d.scrollTop = 650; d.querySelector('.modal-body').scrollTop = 650; }); await shot('fiche-abbaye-2');
            await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await shot('fiche-abbaye-sombre');
            await p.evaluate(() => document.documentElement.removeAttribute('data-theme')); await p.setViewportSize({width: 390, height: 844}); await shot('fiche-abbaye-telephone'); await p.setViewportSize({width: 1440, height: 900});
        }
        await t('fiche : chaque lien externe s’ouvre à part (target=_blank, noopener) et chaque fait venu d’ailleurs a son « ↗ »', async () => {
            const a = await p.$$eval('dialog.fe-dlg .fe-sheet a', l => l.map(x => [x.href, x.target, x.rel]));
            assert.ok(a.length > 5);
            assert.ok(a.every(([h, tg, rel]) => /^https:\/\//.test(h) && tg === '_blank' && /noopener/.test(rel)), JSON.stringify(a.filter(([h, tg, rel]) => !(/^https:\/\//.test(h) && tg === '_blank' && /noopener/.test(rel)))));
            const facts = await p.$$eval('dialog.fe-dlg [data-fe-x="history"] > p, dialog.fe-dlg [data-fe-x="objects"] li, dialog.fe-dlg .fe-chip', l => l.map(x => [x.textContent.trim().slice(0, 60), !!x.querySelector('a.fe-src, a[href^="https"]') || /ta saisie/.test(x.textContent)]));
            assert.ok(facts.length >= 4, JSON.stringify(facts));
            assert.deepStrictEqual(facts.filter(f => !f[1]), []);
        });

        await t('personne : la ligne de l’acte montre l’édifice ; « 🔗 Relier à une fiche ? » sur « chapelle Saint-Roch » ; bloc des rôles du moine', async () => {
            await p.evaluate(() => document.querySelector('dialog.fe-dlg')?.close());
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('.event-row[data-event-id="1"] .fe-evline [data-fe-open]', {timeout: 20000});
            assert.match(await p.textContent('.event-row[data-event-id="1"] .fe-evline'), /Abbaye d’Aubazine|Abbaye d'Aubazine/);
            assert.match(await p.textContent('.event-row[data-event-id="3"] .fe-evline'), /Sédières/);
            await p.waitForSelector('.event-row[data-event-id="4"] [data-fe-relink]');
            await p.click('.event-row[data-event-id="4"] [data-fe-relink]');
            await p.waitForSelector('.event-row[data-event-id="4"] .fe-relink [data-fe-new]');
            assert.match(await p.textContent('.event-row[data-event-id="4"] .fe-relink'), /Nouvelle fiche « Chapelle Saint-Roch »/);
            await p.click('.event-row[data-event-id="4"] .fe-relink [data-fe-x-close]');
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 3; A.setModule('personnes'); });
            await p.waitForFunction(() => { const h = document.querySelector('[data-fe-person="3"]'); return h && !h.closest('section.card').hidden && /Aubazine/.test(h.textContent); }, null, {timeout: 20000});
            assert.match(await p.textContent('[data-fe-person="3"]'), /Moine — /);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 4; A.setModule('personnes'); });
            await p.waitForSelector('[data-fe-person="4"]', {state: 'attached', timeout: 20000}); await sleep(1500);
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-fe-person="4"]').closest('section.card').hidden), true);
        });

        await t('petite fiche d’un château : « Ouvrir sa fiche » (Sédières) ; « ＋ Faire une fiche » (un autre)', async () => {
            await p.evaluate(async () => { const CT = window.LCNDA_EXT.chateauxTerritoires, f = await CT.loadCountry('FR'); CT.openCastle(CT.castleRow(f.items.find(c => c.q === 'Q2970734'), 'FR')); });
            await p.waitForSelector('dialog.cht-dlg .cht-card [data-fe-open]', {timeout: 15000});
            await p.evaluate(() => document.querySelectorAll('dialog.cht-dlg').forEach(d => d.close()));
            await p.evaluate(async () => { const CT = window.LCNDA_EXT.chateauxTerritoires, f = await CT.loadCountry('FR'); CT.openCastle(CT.castleRow(f.items.find(c => c.q === 'Q65665775'), 'FR')); });
            await p.waitForSelector('dialog.cht-dlg .cht-card [data-fe-make]', {timeout: 15000});
            await p.evaluate(() => document.querySelectorAll('dialog.cht-dlg').forEach(d => d.close()));
        });

        await t('registres : liste « Mes fiches d’édifices », monographie, données à la demande, calque de carte', async () => {
            const r = await p.evaluate(async () => {
                const E = window.LCNDA_EXT, out = {};
                const L = E.dataLists.find(d => d.id === 'fiches_edifices'); const rows = await L.load(); out.rows = rows.map(x => [x.name, x.n_events, x.wd]).sort();
                out.fields = L.fields.some(f => f.type === 'url');
                const mono = E.monographSections.find(s => s.id === 'edifices'), mh = document.createElement('div'); document.body.appendChild(mh);
                out.mono = [await mono.render({id: 2, name: 'Aubazines', latitude: 45.1867, longitude: 1.6871}, mh, {village: async () => ({insee: '19013'})}), mh.textContent]; mh.remove();
                const h = document.createElement('div'); document.body.appendChild(h);
                await E.dataSources.find(d => d.id === 'edifices_personne').run({person: {id: 1}}, h); out.ds = h.textContent; h.remove();
                out.layer = (await E.mapLayerSources.find(l => l.id === 'fe_sites').run({bbox: [-5, 40, 10, 52]})).features.length;
                return out;
            });
            assert.strictEqual(r.rows.length, 2); assert.ok(r.rows.some(x => /Sédières/.test(x[0]) && x[1] === 1 && /Q2970734/.test(x[2]))); assert.ok(r.fields);
            assert.strictEqual(r.mono[0], true); assert.match(r.mono[1], /Aubazine/); assert.match(r.mono[1], /acte de ta famille|actes de ta famille/);
            assert.match(r.ds, /Aubazine/); assert.match(r.ds, /Sédières/); assert.strictEqual(r.layer, 2);
        });

        await t('effacer une fiche → ↶ Annuler la remet avec ses personnes et ses actes reliés', async () => {
            await p.evaluate(id => window.LCNDA_EXT.ficheEdifice.remove(id), abbId);
            await sleep(400);
            assert.strictEqual((await api('ed_list')).sites.length, 1);
            await toastUndo();
            const g = await api('ed_get', {id: abbId});
            assert.strictEqual(g.events.length, 2); assert.strictEqual(g.people.length, 1); assert.strictEqual(g.people[0].person_id, 3);
            await p.evaluate(() => document.querySelector('dialog.fe-dlg')?.close());
        });

        await t('fiche d’un village (Aubazines) : « 🏰⛪ Les édifices de la commune » — la fiche de l’abbaye d’abord, puis ce qui est connu', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'villages'; A.state.hVillage = '19013'; A.setModule('listes'); });
            await p.waitForSelector('.h-village [data-fe-host] [data-fe-open]', {timeout: 30000});
            const txt = await p.textContent('.h-village [data-fe-host]');
            assert.match(txt, /Les édifices de la commune/); assert.match(txt, /1 fiche d’édifice/); assert.match(txt, /Monastère du Coyroux/);
            assert.strictEqual((txt.match(/Aubazine/g) || []).length >= 1, true);
        });

        await t('Réglages → 🏰⛪ Fiches des édifices : éteindre « Dans les actes » (genealogie-fiches-edifices), ↶ le remet', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'fiches_edifices'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-fe-settings] [data-fe-settings-list] [data-fe-open]', {timeout: 20000});
            await p.click('[data-fe-tg="events"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-fiches-edifices')).events), false);
            await toastUndo();
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-fiches-edifices')).events), false);
        });

        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
