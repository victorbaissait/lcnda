#!/usr/bin/env node
/* 🏛 Commune qui n'existait pas encore ou plus à la date d'un événement (idée « CountyCheck » de RootsMagic) :
 * lib/commune_histoire.php, lib/controle.php (📍 Lieux → « Commune pas encore ou plus là »), assets/js/heritage-commune-histoire.js,
 * le registre LCNDA_EXT.controleActions de heritage-controle.js. Source : historique des communes de l'INSEE livré avec l'app.
 *  1. serveur : Chamrousse (créée en 1989) en 1950 🟠 ; Les Trois-Saints (commune nouvelle 2025) en 1900 🟡 ; Graves (réunie en
 *     1997) en 2000 🟠 ; jamais : avant 1790, date approximative proche, lieu-dit, avant la fusion, une commune d'aujourd'hui ;
 *     « Corriger le lieu » (commune trouvée, ou créée comme ancienne commune) et « ↶ Annuler » ; le réglage qui éteint le contrôle ;
 *  2. écran : la ligne du contrôle (↗ source, 🏛 Corriger le lieu → ↶ Annuler), la fenêtre de l'événement (avertissement,
 *     « Mettre « … » »), 🔎 Ce qui le concerne, Réglages → 🏛 Communes de l'époque.
 *   node tests/test-commune-anachronique.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ch-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','deceased',0),(3,'Pierre','DURAND','male','deceased',0),(4,'Anne','DURAND','female','deceased',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code,admin2_code) VALUES(1,'Chamrousse','Isère','France',45.125,5.875,'38567','38'),(2,'Les Trois-Saints','Corrèze','France',45.45,1.6,'19248','19'),(3,'Graves','Charente','France',NULL,NULL,'','16'),(4,'Tulle','Corrèze','France',45.2694,1.768,'19272','19'),(5,'la Combe des Échelles','Corrèze','France',NULL,NULL,'19272','19'),(6,'Graves-Saint-Amant','Charente','France',45.64,-0.08,'16297','16')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(id,scope,person_id,event_type_id,date_text,year,place_id,title,description) VALUES(?,'person',?,?,?,?,?,'','')");
foreach ([[1,1,'BIRT','12 mars 1950',1950,1],[2,2,'BIRT','vers 1985',1985,1],[3,3,'BIRT','1900',1900,2],[4,4,'DEAT','2000',2000,3],[5,1,'DEAT','1750',1750,1],[6,2,'DEAT','1990',1990,3],[7,3,'RESI','1900',1900,5],[8,4,'BIRT','avant 2000',2000,1],[10,3,'DEAT','1960',1960,4]] as [$id,$pid,$tag,$d,$y,$pl]) { $ins->execute([$id,$pid,$t($tag),$d,$y,$pl]); }
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2)");
$pdo->prepare("INSERT INTO events(id,scope,family_id,event_type_id,date_text,year,place_id) VALUES(9,'family',1,?,'1960',1960,1)")->execute([$t('MARR')]);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const sql = q => JSON.parse(spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$d=new PDO('sqlite:'.$argv[1]);echo json_encode($d->query($argv[2])->fetchAll(PDO::FETCH_ASSOC));`, path.join(tmp, 'genealogy.sqlite'), q], {encoding: 'utf8'}).stdout || '[]');
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    let serverErr = '';
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: ['ignore', 'ignore', 'pipe']});
    proc.stderr.on('data', d => { serverErr += d; });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultMaintenanceTabs, null, {timeout: 30000});
        // index.php ne charge pas encore ces fichiers : on les ajoute (comme le feront les balises)
        if (!await p.evaluate(() => !!window.LCNDA_EXT?.communeHistoire)) { await p.addStyleTag({url: base + 'assets/css/commune-reseau.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-commune-histoire.js'}); }
        await p.waitForFunction(() => window.LCNDA_EXT?.communeHistoire, null, {timeout: 10000});
        const api = (x, qq = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, qq]);
        const post = (a, b) => p.evaluate(async ([x, y]) => { try { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r.result || r; } catch (e) { return {error: e.message}; } }, [a, b]);
        const anachro = async () => ((await api('controle', {fresh: 1})).alerts || []).filter(a => a.check === 'commune-anachro');

        /* ═════════ 1. serveur ═════════ */
        await t('contrôle : Chamrousse 1950 🟠, Trois-Saints 1900 🟡, Graves 2000 🟠, mariage 1960 (les deux époux) ; rien d’autre', async () => {
            const list = await anachro();
            const keys = list.map(a => a.key).sort();
            assert.deepStrictEqual(keys, ['commune-anachro:1', 'commune-anachro:3', 'commune-anachro:4', 'commune-anachro:9'], JSON.stringify(list.map(a => [a.key, a.title])));
            const by = Object.fromEntries(list.map(a => [a.key, a]));
            const c = by['commune-anachro:1'];
            assert.strictEqual(c.level, 'orange'); assert.strictEqual(c.sort, 'lieux'); assert.strictEqual(c.sub, 'anachro');
            assert.match(c.title, /Chamrousse n’existait pas encore en 1950/);
            assert.match(c.detail, /créée le 15 février 1989, avec des parties de Saint-Martin-d'Uriage, Séchilienne et Vaulnaveys-le-Haut/);
            assert.deepStrictEqual(c.commune.then.map(x => x.code).sort(), ['38422', '38478', '38529']);
            assert.match(c.commune.source.url, /^https:\/\/www\.insee\.fr\//); assert.match(c.commune.source.licence, /Licence Ouverte/);
            assert.match(c.commune.quote, /INSEE, événement du 15 février 1989/);
            const ts = by['commune-anachro:3'];
            assert.strictEqual(ts.level, 'yellow'); assert.match(ts.detail, /commune formée le 1er janvier 2025 .* par Saint-Ybard, Saint-Martin-Sepert et Saint-Pardoux-Corbier/);
            const g = by['commune-anachro:4'];
            assert.strictEqual(g.level, 'orange'); assert.match(g.title, /Graves n’existait plus en 2000/); assert.match(g.detail, /réunie à Graves-Saint-Amant le 1er janvier 1997 \(fusion simple\)/);
            assert.deepStrictEqual(by['commune-anachro:9'].people.sort(), [1, 2], 'un mariage : les deux époux');
        });
        await t('jamais à tort : avant 1790, « vers 1985 » et « avant 2000 » (moins de 10 ans), lieu-dit, avant la fusion, commune d’aujourd’hui', async () => {
            const keys = (await anachro()).map(a => a.key);
            for (const id of [2, 5, 6, 7, 8, 10]) assert.ok(!keys.includes(`commune-anachro:${id}`), `événement ${id}`);
            const chk = async (place, date) => (await api('commune_hist_check', {place_id: place, date_text: date})).alert;
            assert.ok(await chk(1, '3 juin 1988'), 'une date exacte, un an avant la création');
            assert.strictEqual(await chk(1, '15 février 1989'), null, 'le jour même : elle existe');
            assert.strictEqual(await chk(1, 'vers 1980'), null);
            assert.ok(await chk(1, 'vers 1970'), 'vers 1970 : 19 ans avant');
            assert.strictEqual(await chk(1, '1789'), null, 'avant 1790 : des paroisses');
            assert.strictEqual(await chk(4, '1850'), null, 'Tulle');
            assert.strictEqual(await chk(5, '1850'), null, 'un lieu-dit');
        });
        await t('🏛 Corriger le lieu : la commune d’alors trouvée (Graves-Saint-Amant), ou créée (ancienne commune) ; ↶ Annuler', async () => {
            const r = await post('commune_hist_fix', {event_id: 4, code: '16297', name: 'Graves-Saint-Amant'});
            assert.strictEqual(r.place_id, 6); assert.strictEqual(r.created, false); assert.strictEqual(r.before_place_id, 3);
            assert.ok(!(await anachro()).some(a => a.key === 'commune-anachro:4'), 'l’alerte disparaît');
            await post('commune_hist_fix', {event_id: 4, place_id: 3});
            assert.strictEqual(sql('SELECT place_id FROM events WHERE id=4')[0].place_id, 3, '↶ Annuler');
            const c = await post('commune_hist_fix', {event_id: 1, code: '38478', name: 'Séchilienne'});
            assert.strictEqual(c.created, true);
            const pl = sql(`SELECT name, admin4_code, country, description FROM places WHERE id=${c.place_id}`)[0];
            assert.deepStrictEqual([pl.name, pl.admin4_code, pl.country], ['Séchilienne', '38478', 'France']); assert.match(pl.description, /Ancienne commune \(code INSEE 38478\)/);
            await post('commune_hist_fix', {event_id: 1, place_id: 1, drop_place: c.place_id});
            assert.strictEqual(sql(`SELECT count(*) n FROM places WHERE id=${c.place_id}`)[0].n, 0, 'le lieu créé pour rien est retiré');
            assert.ok((await post('commune_hist_fix', {event_id: 1, code: '99999', name: 'x'})).error, 'commune inconnue');
            assert.ok((await anachro()).some(a => a.key === 'commune-anachro:1'));
        });
        await t('Réglages : contrôle éteint → plus d’alerte ; rallumé', async () => {
            await post('commune_hist_setting', {controle: 0});
            assert.strictEqual((await anachro()).length, 0);
            assert.strictEqual((await api('commune_hist_about')).enabled, false);
            await post('commune_hist_setting', {controle: 1});
            assert.strictEqual((await anachro()).length, 4);
            const ab = await api('commune_hist_about');
            assert.ok(ab.ok && ab.communes > 30000 && /Licence Ouverte/.test(ab.licence), JSON.stringify(ab).slice(0, 200));
        });

        /* ═════════ 2. écran ═════════ */
        await t('✅ Contrôle de la base → 📍 Lieux → « Commune pas encore ou plus là » : ↗ source, 🏛 Corriger le lieu, ↶ Annuler', async () => {
            await p.evaluate(() => window.LCNDA_EXT.openControle({sort: 'lieux', sub: 'anachro'}));
            await p.waitForSelector('.ctl-row [data-ctl-custom]', {timeout: 30000});
            const rows = await p.$$eval('.ctl-row', els => els.map(e => e.textContent));
            assert.ok(rows.some(x => /Graves n’existait plus en 2000/.test(x)), rows.join('\n').slice(0, 500));
            assert.ok(await p.$('[data-ctl-subs] [data-ctl-sub="anachro"]'), 'la pastille de la sous-sorte');
            const src = await p.$$eval('.ctl-row a[target="_blank"][rel~="noopener"]', as => as.map(a => a.href));
            assert.ok(src.length >= 3 && src.every(h => h.startsWith('https://www.insee.fr/')), src.join(' '));
            const i = await p.$$eval('.ctl-row', els => els.findIndex(e => /Graves n’existait plus/.test(e.textContent)));
            await p.locator('.ctl-row').nth(i).locator('[data-ctl-custom]').click(); // la i-ème ligne « .ctl-row » (nth-of-type compterait aussi les autres éléments de la liste)
            await p.waitForSelector('dialog.ch-modal[open]');
            assert.match(await p.textContent('dialog.ch-modal'), /Graves-Saint-Amant/);
            await p.click('dialog.ch-modal [data-ch-ok]');
            await p.waitForFunction(() => /Lieu corrigé : Graves → Graves-Saint-Amant/.test(document.body.textContent), null, {timeout: 10000});
            for (let k = 0; k < 40 && sql('SELECT place_id FROM events WHERE id=4')[0].place_id !== 6; k++) await sleep(100);
            assert.strictEqual(sql('SELECT place_id FROM events WHERE id=4')[0].place_id, 6);
            await p.locator('text=↶ Annuler').last().click();
            for (let k = 0; k < 40 && sql('SELECT place_id FROM events WHERE id=4')[0].place_id !== 3; k++) await sleep(100);
            assert.strictEqual(sql('SELECT place_id FROM events WHERE id=4')[0].place_id, 3, '↶ Annuler');
        });
        await t('fiche : le bandeau « ⚠️ choses à vérifier » propose 🏛 Corriger le lieu ; la fenêtre de l’événement avertit et « Mettre « … » »', async () => {
            await p.evaluate(() => window.LCNDA_APP.openPersonById(1));
            await p.waitForSelector('[data-ctl-banner] [data-ctl-b-custom]', {timeout: 30000, state: 'attached'});
            await p.waitForSelector('#workspace [data-edit-event="1"]', {timeout: 30000});
            await p.click('#workspace [data-edit-event="1"]');
            await p.waitForSelector('#event-form [data-ch-warn]', {timeout: 15000});
            const txt = await p.textContent('#event-form [data-ch-warn]');
            assert.match(txt, /Chamrousse n’existait pas encore en 1950/); assert.match(txt, /Source : INSEE/);
            assert.ok(await p.$('#event-form [data-ch-warn] a[href^="https://www.insee.fr/"][target="_blank"]'));
            await p.click('#event-form [data-ch-use*="Séchilienne"]');
            await p.waitForFunction(() => /Séchilienne/.test(document.querySelector('#event-form [data-place-picker]')?.textContent || ''), null, {timeout: 10000});
            await p.waitForFunction(() => !document.querySelector('#event-form [data-ch-warn]'), null, {timeout: 10000});
            await p.evaluate(() => document.getElementById('event-dialog').close());
            assert.strictEqual(sql('SELECT place_id FROM events WHERE id=1')[0].place_id, 1, 'rien n’est enregistré sans « Enregistrer »');
        });
        await t('🔎 Ce qui le concerne / 🧰 Données : « Les communes à l’époque de ses actes »', async () => {
            const html = await p.evaluate(async () => { const d = window.LCNDA_EXT.dataSources.find(x => x.id === 'commune_epoque'); const h = document.createElement('div'); const ok = await d.run({person: {id: 3}}, h); return [ok, h.innerHTML]; });
            assert.strictEqual(html[0], true); assert.match(html[1], /Les Trois-Saints/); assert.match(html[1], /insee\.fr/);
            const none = await p.evaluate(async () => { const d = window.LCNDA_EXT.dataSources.find(x => x.id === 'commune_epoque'); const h = document.createElement('div'); return d.run({person: {id: 99}}, h); });
            assert.strictEqual(none, false);
        });
        await t('Réglages → 🏛 Communes de l’époque : interrupteurs, ↶ Annuler, licence et date de lecture', async () => {
            await p.evaluate(() => window.LCNDA_EXT.communeHistoire.openSettings());
            await p.waitForSelector('[data-ch-settings]', {timeout: 15000});
            const s = await p.textContent('[data-ch-settings]');
            assert.match(s, /Licence Ouverte 2\.0/); assert.match(s, /lu le 25\/11\/2026/); assert.match(s, /Rien avant 1790/);
            await p.click('[data-ch-tg="evenement"] input');
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.communeHistoire.settings().evenement), false);
            await p.locator('text=↶ Annuler').last().click();
            await p.waitForFunction(() => window.LCNDA_EXT.communeHistoire.settings().evenement === true, null, {timeout: 5000});
            await p.click('[data-ch-tg="controle"] input');
            await p.waitForFunction(async () => (await window.LCNDA_APP.api('commune_hist_about')).enabled === false, null, {timeout: 5000, polling: 300});
            await p.locator('text=↶ Annuler').last().click();
            await p.waitForFunction(async () => (await window.LCNDA_APP.api('commune_hist_about')).enabled === true, null, {timeout: 5000, polling: 300});
        });
        await t('pas d’erreur JavaScript ni PHP', async () => {
            assert.deepStrictEqual(errs, []);
            const bad = serverErr.split('\n').filter(l => /PHP (Fatal|Warning|Deprecated|Notice)|Uncaught/.test(l));
            assert.deepStrictEqual(bad.slice(0, 5), []);
        });
    } finally { await browser.close(); proc.kill(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
