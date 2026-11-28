#!/usr/bin/env node
/* 💡 Ce qu'on trouve dans un recueil (et chez un service d'archives) : actes par année avec les années sans acte, sortes, personnes citées et
 * reliées, noms, métiers (gabarit), lieux, signatures ; remarques à vérifier (année sans acte → « Marquer une lacune » ; pic de décès) ;
 * « ⚙️ Réglages des recueils » : profil Centre d'archives (vue des fonds, colonnes, résumé), trous, fiabilité, remarques.
 *   node tests/test-recueil-sens.js */
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
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-sens-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env});
    // 1790 : 2 baptêmes ; 1791 : 1 mariage (gabarit : laboureur), 1 sépulture ; 1792 : rien ; 1793 : 1 sépulture ; 1794 : 10 sépultures (un pic)
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1)");
$svc = save_archive_service($pdo, ['name' => 'Archives départementales du Cher', 'short_name' => 'AD Cher', 'kind' => 'departmental'])['id'];
foreach (range(1, 4) as $id) { $im = imagecreatetruecolor(80, 100); imagefill($im, 0, 0, imagecolorallocate($im, 230, 215, 180)); imagepng($im, MEDIA_DIR . "/m$id.png"); }
$m = $pdo->prepare("INSERT INTO media(id,title,filename,thumbnail,media_type) VALUES(?,?,?,?,'image')"); foreach (range(1, 4) as $id) { $m->execute([$id, "Vue $id", "m$id.png", "m$id.png"]); }
$r = save_recueil($pdo, ['title' => 'Registre de Sancoins', 'reference' => '3 E 1234', 'archive_service_id' => $svc]);
recueil_add_images($pdo, ['recueil_id' => $r['id'], 'version_id' => (int) $pdo->query('SELECT MAX(id) FROM recueil_versions')->fetchColumn(), 'mode' => 'new_pages', 'media_ids' => [1, 2, 3, 4]]);
act_transcriptions_ensure($pdo);
$a = $pdo->prepare('INSERT INTO act_transcriptions(title,kind,media_id,date_text,place,body,data_json) VALUES(?,?,?,?,?,?,?)');
$people = fn($ps) => json_encode(['people' => $ps]);
$a->execute(['B1', 'bapteme', 1, '3 mars 1790', 'Sancoins', 'a été baptisé Jean, le père a signé avec nous', $people([['name' => 'Jean MAZAUD', 'role' => 'enfant', 'person_id' => 1], ['name' => 'Pierre MAZAUD', 'role' => 'père']])]);
$a->execute(['B2', 'bapteme', 1, '1790', 'Sancoins, Cher', 'le père a déclaré ne savoir signer', $people([['name' => 'Anne DURAND', 'role' => 'enfant']])]);
$a->execute(['M1', 'mariage', 2, '1791', 'Givardon', 'mariage', json_encode(['people' => [['name' => 'Louis LACOMBE'], ['name' => 'Marie MAZAUD']], 'gabarit' => ['kind' => 'mariage', 'fields' => ['epoux_metier' => ['v' => 'Laboureur'], 'pere_epouse_metier' => ['v' => 'vigneron']]]])]);
$a->execute(['S1', 'sepulture', 2, '1791', 'Sancoins', 'x', '{}']);
$a->execute(['S2', 'sepulture', 3, '1793', 'Sancoins', 'x', '{}']);
for ($i = 0; $i < 10; $i++) { $a->execute(["S9$i", 'sepulture', 4, '1794', 'Sancoins', 'x', '{}']); }
echo json_encode(['ok' => 1, 'rid' => $r['id'], 'svc' => $svc]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const {rid, svc} = JSON.parse(seed.stdout);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.recueilSens && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);

        await t('côté serveur : actes par année, sortes, personnes, noms, métiers, lieux, signatures, années sans acte, pic de décès', async () => {
            const d = await api('recueil_sens', {id: rid});
            assert.equal(d.acts, 15);
            assert.deepEqual(Object.keys(d.by_year), ['1790', '1791', '1793', '1794']); assert.deepEqual(d.years, [1790, 1794]); assert.deepEqual(d.gaps, [[1792, 1792]]);
            assert.deepEqual(d.kinds, {sepulture: 12, bapteme: 2, mariage: 1});
            assert.deepEqual([d.people, d.linked], [5, 1]); assert.equal(Object.keys(d.names)[0], 'MAZAUD'); assert.equal(d.names.MAZAUD, 3);
            assert.deepEqual(Object.keys(d.jobs).sort(), ['laboureur', 'vigneron']); assert.equal(Object.keys(d.places)[0], 'Sancoins');
            assert.deepEqual([d.signs, d.nosign], [1, 1]);
            assert.ok(d.notes.some(n => n.type === 'deaths' && n.year === 1794 && n.n === 10), JSON.stringify(d.notes));
            assert.ok(d.notes.some(n => n.type === 'gap' && n.from === 1792));
            const s = await api('recueil_sens', {service: svc}); assert.deepEqual([s.recueils, s.acts], [1, 15]);
        });
        await p.evaluate(id => window.LCNDA_EXT.openRecueil(id), rid);
        await t('le Résumé : « 💡 Ce qu’on y trouve » (histogramme avec l’année vide, remarques, chiffres) ; « Marquer une lacune » puis ↶ Annuler', async () => {
            await p.waitForSelector('[data-rsn-host] .rsn-hist', {timeout: 20000});
            const s = await p.evaluate(() => ({gap: document.querySelectorAll('[data-rsn-host] .rsn-hist i.is-gap').length, bars: document.querySelectorAll('[data-rsn-host] .rsn-hist i').length, txt: document.querySelector('[data-rsn-host]').textContent.replace(/\s+/g, ' ')}));
            assert.deepEqual([s.bars, s.gap], [5, 1]);
            assert.match(s.txt, /1792 : aucun acte/); assert.match(s.txt, /1794 : 10 décès ou sépultures/); assert.match(s.txt, /Personnes citées\s*5 \(1 reliées à une fiche\)/);
            assert.match(s.txt, /Métiers\s*(laboureur|vigneron)/); assert.match(s.txt, /Signatures\s*50 % signent/); assert.match(s.txt, /sans acte : 1792/);
            await p.click('[data-rsn-gap]');
            await p.waitForFunction(() => /Lacune ajoutée/.test([...document.querySelectorAll('.ui-toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            const g = php(`require 'lib/bootstrap.php'; echo json_encode(db()->query('SELECT gap_type, period_text, title FROM archive_digest_gaps')->fetchAll(PDO::FETCH_ASSOC), JSON_UNESCAPED_UNICODE);`).stdout;
            assert.match(g, /"missing_period","period_text":"1792","title":"Registre de Sancoins : aucun acte en 1792"/);
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /Lacune ajoutée/.test(x.textContent))?.querySelector('button')?.click()); await sleep(800);
            assert.match(php(`require 'lib/bootstrap.php'; echo db()->query('SELECT count(*) FROM archive_digest_gaps')->fetchColumn();`).stdout, /^0$/);
        });
        await t('la page du service d’archives : « 💡 Ce qu’on trouve chez eux »', async () => {
            await p.evaluate(id => window.LCNDA_EXT.archiveServices.open(id), svc);
            await p.waitForSelector('[data-as-sens]:not([hidden]) .rsn-hist', {timeout: 20000});
            assert.match(await p.evaluate(() => document.querySelector('[data-as-sens]').textContent), /Ce qu’on trouve chez eux\s*\(1 recueil\)/);
        });
        await t('« ⚙️ Réglages des recueils » : remarques et trous éteints, profil Centre d’archives (vue des fonds, colonnes, résumé d’un nouveau recueil)', async () => {
            await p.evaluate(() => { localStorage.removeItem('genealogie-recueils-vue'); localStorage.removeItem('genealogie-recueils-fonds'); const A = window.LCNDA_APP; A.state.hRecueil = {id: 0}; A.state.listType = 'recueils'; A.setModule('listes'); });
            await p.waitForSelector('[data-rc-settings]', {timeout: 20000});
            assert.ok(await p.evaluate(() => !document.querySelector('.rf-table')), 'Ma généalogie : la liste des recueils');
            await p.click('[data-rc-settings]'); await p.waitForSelector('dialog[open] [name=profil]');
            await p.check('dialog[open] [name=profil][value="archives"]'); await p.uncheck('dialog[open] [name=remarques]'); await p.uncheck('dialog[open] [name=trous]');
            await p.click('dialog[open] [type=submit]');
            await p.waitForSelector('.rf-table', {timeout: 20000});
            assert.ok(await p.evaluate(() => ['Support', 'État matériel', 'Langue', 'Réutilisation'].every(h => [...document.querySelectorAll('.rf-table th')].some(th => th.textContent === h))));
            assert.deepEqual(await p.evaluate(() => ['genealogie-recueils-profil', 'genealogie-recueils-remarques', 'genealogie-recueils-trous'].map(k => localStorage.getItem(k))), ['archives', '0', '0']);
            const c = await p.evaluate(async () => { const r = await window.LCNDA_APP.api('save_recueil', {}, {method: 'POST', body: {title: 'Liasse nouvelle'}}); return (r.result || r).id; });
            await p.evaluate(id => window.LCNDA_EXT.openRecueil(id), c);
            await p.waitForSelector('.h-rc-summary .h-rc-block h3');
            assert.equal(await p.evaluate(() => document.querySelector('.h-rc-summary .h-rc-block h3').textContent), '🏛 Où il est', 'Centre d’archives : la fiche en tête');
            await p.evaluate(id => window.LCNDA_EXT.openRecueil(id), rid);
            await p.waitForSelector('[data-rsn-host] .rsn-hist', {timeout: 20000});
            assert.ok(!(await p.evaluate(() => /aucun acte/.test(document.querySelector('[data-rsn-host]').textContent.split('Actes transcrits')[0]))), 'les remarques sont cachées');
            const D = {recueil: {id: 999, numbering: 'page', expected_pages: 0}, pages: [{id: 1, num: 1, label: 'p. 1'}, {id: 2, num: 2, label: 'p. 5'}]};
            assert.equal(await p.evaluate(d => window.LCNDA_EXT.recueilEtat.holes(d).length, D), 0, 'trous éteints : rien de signalé');
            await p.evaluate(() => { ['genealogie-recueils-profil', 'genealogie-recueils-remarques', 'genealogie-recueils-trous'].forEach(k => localStorage.removeItem(k)); });
            assert.equal(await p.evaluate(d => window.LCNDA_EXT.recueilEtat.holes(d).length, D), 1, 'trous allumés (conseillé) : « p. 2 à 4 » signalées');
        });
        await t('📜 une page du recueil s’ouvre dans l’Atelier de transcription ; au retour, le texte remplit la page vide (↶ Annuler)', async () => {
            // une nouvelle page, avec une photo sur laquelle aucun acte n'est commencé
            php(`require 'lib/bootstrap.php'; $pdo = db(); $im = imagecreatetruecolor(80, 100); imagefill($im, 0, 0, imagecolorallocate($im, 230, 215, 180)); imagepng($im, MEDIA_DIR . '/neuve.png');
                $pdo->exec("INSERT INTO media(id,title,filename,thumbnail,media_type) VALUES(900,'Vue neuve','neuve.png','neuve.png','image')");
                recueil_add_images($pdo, ['recueil_id' => ${rid}, 'version_id' => (int) $pdo->query('SELECT MAX(id) FROM recueil_versions WHERE recueil_id=${rid}')->fetchColumn(), 'mode' => 'new_pages', 'media_ids' => [900]]);`);
            const R = await api('recueil', {id: rid}), pg = R.pages.find(x => R.images.some(i => i.page_id === x.id && i.media_id === 900)); assert.ok(pg, 'la page neuve');
            await p.evaluate(id => window.LCNDA_APP.api('save_recueil_page', {}, {method: 'POST', body: {id, transcription: ''}}), pg.id);
            await p.evaluate(([id, pid]) => window.LCNDA_EXT.openRecueil(id, pid), [rid, pg.id]);
            await p.waitForSelector('[data-rc-txopen]', {timeout: 20000}); await p.click('[data-rc-txopen]');
            await p.waitForSelector('dialog.h-tx-dlg [data-tx-body]', {timeout: 20000});
            assert.match(await p.inputValue('dialog.h-tx-dlg [data-tx="title"]'), /Registre de Sancoins/);
            await p.fill('dialog.h-tx-dlg [data-tx-body]', 'Le dix mai a été baptisé Jean MAZAUD'); await p.dispatchEvent('dialog.h-tx-dlg [data-tx-body]', 'input');
            await p.click('dialog.h-tx-dlg [data-tx-cmd="save"]'); await sleep(900); await p.click('dialog.h-tx-dlg [data-tx-cmd="close"]');
            await p.waitForFunction(() => /baptisé Jean MAZAUD/.test(document.querySelector('[data-rc-field="transcription"]')?.value || ''), null, {timeout: 15000});
            assert.match((await api('recueil', {id: rid})).pages.find(x => x.id === pg.id).transcription, /baptisé Jean MAZAUD/);
            await p.evaluate(() => [...document.querySelectorAll('.ui-toast')].reverse().find(x => /Atelier est mis dans la page/.test(x.textContent)).querySelector('button').click()); await sleep(900);
            assert.equal((await api('recueil', {id: rid})).pages.find(x => x.id === pg.id).transcription, '', '↶ Annuler');
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'Ce qu’on trouve dans les recueils marche.');
    process.exit(fails ? 1 : 0);
})();
