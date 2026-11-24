#!/usr/bin/env node
/* 🏛 La vue des fonds : Listes › Recueils › « 🏛 Par fonds » — par service d'archives puis par fonds (repliables, retenu), chiffres
 * d'ensemble, « Montrer », colonnes au choix, « Reste » qui ouvre l'état, tableur, recherche de la barre ; mode consultation ; widget
 * « 🗂 Registres : reste à faire ».
 *   node tests/test-recueil-fonds.js */
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-fonds-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    // AD Cher : « Paroisse de Sancoins » (A : 4 pages dont 2 finies, en ligne ; B : 2 pages à faire, 1 absente) ; SHD : « Armée » (C : naissances 2000, réservé) ; D : sans service
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Pierre','MAZAUD','male','deceased',1)");
$s1 = save_archive_service($pdo, ['name' => 'Archives départementales du Cher', 'short_name' => 'AD Cher', 'kind' => 'departmental'])['id'];
$s2 = save_archive_service($pdo, ['name' => 'Service historique de la Défense', 'short_name' => 'SHD', 'kind' => 'military'])['id'];
foreach (range(1, 9) as $id) { $im = imagecreatetruecolor(80, 100); imagefill($im, 0, 0, imagecolorallocate($im, 230, 215, 180)); imagepng($im, MEDIA_DIR . "/m$id.png"); }
$m = $pdo->prepare("INSERT INTO media(id,title,filename,thumbnail,media_type) VALUES(?,?,?,?,'image')"); foreach (range(1, 9) as $id) { $m->execute([$id, "Vue $id", "m$id.png", "m$id.png"]); }
$mk = function (array $r, array $media) use ($pdo) { $x = save_recueil($pdo, $r); if ($media) { recueil_add_images($pdo, ['recueil_id' => $x['id'], 'version_id' => (int) $pdo->query('SELECT MAX(id) FROM recueil_versions')->fetchColumn(), 'mode' => 'new_pages', 'media_ids' => $media]); } return $x['id']; };
$a = $mk(['title' => 'Registre paroissial 1789-1792', 'reference' => '3 E 1234', 'date_text' => '1789-1792', 'archive_service_id' => $s1, 'fonds' => 'Paroisse de Sancoins', 'url' => 'https://archives.exemple.fr/ark:/1', 'expected_pages' => 4], [1, 2, 3, 4]);
$b = $mk(['title' => 'Registre des sépultures 1793', 'reference' => '3 E 1235', 'date_text' => '1793', 'archive_service_id' => $s1, 'fonds' => 'Paroisse de Sancoins'], [5, 6]);
$c = $mk(['title' => 'Registre des naissances 2000', 'reference' => 'GR 1', 'date_text' => '2000', 'archive_service_id' => $s2, 'fonds' => 'Armée', 'series' => 'GR'], [7, 8]);
$d = $mk(['title' => 'Cahier de famille', 'date_text' => '1850'], [9]);
act_transcriptions_ensure($pdo); $pdo->exec("INSERT INTO act_transcriptions(title,kind,media_id,date_text,body) VALUES('N','naissance',7,'2000','x')");
$pa = array_map('intval', $pdo->query("SELECT id FROM recueil_pages WHERE recueil_id=$a ORDER BY position")->fetchAll(PDO::FETCH_COLUMN));
recueil_pages_set($pdo, ['recueil_id' => $a, 'page_ids' => [$pa[0], $pa[1]], 'fields' => ['state' => 'done']]);
$pb = array_map('intval', $pdo->query("SELECT id FROM recueil_pages WHERE recueil_id=$b ORDER BY position")->fetchAll(PDO::FETCH_COLUMN));
recueil_insert_absent($pdo, ['recueil_id' => $b, 'after' => $pb[1], 'labels' => ['p. 3'], 'absent' => 'perdue', 'gap' => true]);
echo json_encode(['ok' => 1, 'a' => $a, 'b' => $b, 'c' => $c, 'd' => $d, 's1' => $s1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const {a, b, c, d, s1} = JSON.parse(seed.stdout);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.recueilFonds && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const open = () => p.evaluate(() => { const A = window.LCNDA_APP; A.state.hRecueil = {id: 0}; A.state.listType = 'recueils'; A.setModule('listes'); });
        const rows = () => p.evaluate(() => [...document.querySelectorAll('.rf-table tbody tr')].map(tr => (tr.classList.contains('rf-grp') ? 'G ' : tr.classList.contains('rf-fonds') ? 'F ' : '- ') + tr.querySelector('td').textContent.replace(/\s+/g, ' ').replace(/[▾▸]/g, '').trim().split(' · ')[0]));

        await t('côté serveur : chaque recueil avec son service, son fonds, son avancement, ses lacunes, sa communicabilité', async () => {
            const r = (await api('recueils_fonds')).recueils, by = id => r.find(x => x.id === id);
            assert.equal(r.length, 4);
            assert.deepEqual([by(a).service.short_name, by(a).fonds, by(a).etat.done, by(a).etat.todo, by(a).expected], ['AD Cher', 'Paroisse de Sancoins', 2, 2, 4]);
            assert.deepEqual([by(b).etat.absent, by(b).gaps], [1, 1]);
            assert.equal(by(c).communicability.state, 'reserved'); assert.equal(by(d).service, null);
        });
        await open(); await p.waitForSelector('[data-rc-mode="fonds"]', {timeout: 20000});
        await t('« 🏛 Par fonds » : par service puis par fonds, « Sans service d’archives » à la fin ; les chiffres d’ensemble', async () => {
            await p.click('[data-rc-mode="fonds"]'); await p.waitForSelector('.rf-table', {timeout: 20000});
            assert.deepEqual(await rows(), ['G 🏛 Archives départementales du Cher', 'F Paroisse de Sancoins', '- 📚 Registre paroissial 1789-1792', '- 📚 Registre des sépultures 1793',
                'G 🏛 Service historique de la Défense', 'F Armée', '- 📚 Registre des naissances 2000', 'G 🏛 Sans service d’archives', 'F Sans fonds', '- 📚 Cahier de famille']);
            const k = await p.evaluate(() => document.querySelector('.rf-fonds-view .re-kpis').textContent.replace(/\s+/g, ' '));
            assert.match(k, /4\s*recueils · 3 services/); assert.match(k, /1\s*pages absentes · 1 lacune/); assert.match(k, /10\s*pages attendues/);
            const line = await p.evaluate(() => [...document.querySelectorAll('.rf-table tbody tr')].find(tr => /Registre paroissial/.test(tr.textContent)).textContent.replace(/\s+/g, ' '));
            assert.match(line, /3 E 1234/); assert.match(line, /4 \/ 4/); assert.match(line, /100 %/); assert.match(line, /50 % · 50 %/); assert.match(line, /✓ Oui/); assert.match(line, /2 à transcrire/);
            assert.match(await p.evaluate(() => [...document.querySelectorAll('.rf-table tbody tr')].find(tr => /naissances 2000/.test(tr.textContent)).textContent), /🔒 jusqu’en 2075/);
        });
        await t('un service se replie (retenu) ; « Montrer » : non communicables, pas en ligne ; la recherche de la barre', async () => {
            await p.click('.rf-table [data-rf-fold^="s"]'); await sleep(200);
            assert.equal((await rows()).filter(x => x.startsWith('- ')).length, 2, 'les recueils de l’AD Cher sont repliés');
            await open(); await p.waitForSelector('.rf-table'); assert.equal((await rows()).filter(x => x.startsWith('- ')).length, 2, 'retenu');
            await p.click('.rf-table [data-rf-fold^="s"]'); await sleep(200);
            await p.selectOption('[data-rf-show]', 'locked'); await sleep(200); assert.deepEqual((await rows()).filter(x => x.startsWith('- ')), ['- 📚 Registre des naissances 2000']);
            await p.selectOption('[data-rf-show]', 'offline'); await sleep(200); assert.equal((await rows()).filter(x => x.startsWith('- ')).length, 3);
            await p.selectOption('[data-rf-show]', ''); await sleep(200);
            await p.evaluate(() => { localStorage.setItem('lcnda-listbar:listes:recueils', JSON.stringify({q: 'sépultures', f: {}, sort: 'az'})); window.LCNDA_APP.state.hRecueil = {id: 0, q: 'sépultures'}; window.LCNDA_APP.setModule('listes'); });
            await p.waitForSelector('.rf-table'); await sleep(300);
            assert.deepEqual((await rows()).filter(x => x.startsWith('- ')), ['- 📚 Registre des sépultures 1793']);
            await p.evaluate(() => { localStorage.setItem('lcnda-listbar:listes:recueils', JSON.stringify({q: '', f: {}, sort: 'az'})); window.LCNDA_APP.state.hRecueil = {id: 0, q: ''}; window.LCNDA_APP.setModule('listes'); });
            await p.waitForSelector('.rf-table');
        });
        await t('« Colonnes… » : ajouter « Série » (retenu) ; « ⤓ Tableur » ; « Reste » ouvre l’état du recueil', async () => {
            await p.click('[data-rf-cols]'); await p.waitForSelector('dialog[open] [name=c]'); await p.check('dialog[open] [name=c][value="series"]'); await p.click('dialog[open] [type=submit]'); await sleep(300);
            assert.ok(await p.evaluate(() => [...document.querySelectorAll('.rf-table th')].some(th => th.textContent === 'Série')));
            const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-rf-csv]')]);
            const text = fs.readFileSync(await dl.path(), 'utf8');
            assert.match(text, /"Service d’archives";"Fonds";"Recueil";"Cote"/); assert.match(text, /"Archives départementales du Cher";"Paroisse de Sancoins";"Registre paroissial 1789-1792";"3 E 1234"/);
            assert.match(text, /"2 à transcrire"/);
            await p.locator('.rf-reste').first().click();
            await p.waitForSelector('.re-tab', {timeout: 15000});
            assert.equal(await p.evaluate(() => window.LCNDA_APP.state.hRecueil.tab), 'etat');
        });
        await t('🔐 mode consultation : le recueil réservé n’est pas dans la vue des fonds', async () => {
            fs.writeFileSync(path.join(tmp, 'consultation.json'), JSON.stringify({hash: 'x'}));
            const r = (await api('recueils_fonds')).recueils.map(x => x.id).sort(); fs.unlinkSync(path.join(tmp, 'consultation.json'));
            assert.deepEqual(r, [a, b, d].sort());
        });
        await t('le widget « 🗂 Registres : reste à faire » : les recueils où il reste le plus, chacun avec ce qui reste', async () => {
            const html = await p.evaluate(async () => { const W = window.LCNDA_EXT.dashboard.recueils_todo; const d = await W.load(); return W.render('01', {limit: 3}, '6', d); });
            assert.match(html, /🗂 Registres : reste à faire/);
            const titles = [...html.matchAll(/data-rf-etat-w="\d+">📚 ([^<]+)</g)].map(m => m[1]);
            assert.equal(titles.length, 3); assert.ok(titles.includes('Registre paroissial 1789-1792'));
            assert.ok(await p.evaluate(() => window.LCNDA_APP && true));
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'La vue des fonds marche.');
    process.exit(fails ? 1 : 0);
})();
