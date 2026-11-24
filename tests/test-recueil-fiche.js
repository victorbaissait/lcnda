#!/usr/bin/env node
/* 🏛 La fiche d'identité d'un recueil : service d'archives (liste qui existe), fonds, série, cote, liens (recueil, vue {n}, décalage),
 * autre exemplaire, citation, communicabilité calculée ou choisie, réutilisation, support… ; mode consultation (recueil non communicable
 * caché) ; la page d'un service d'archives (« 📚 Recueils chez eux », lacunes) ; un service supprimé puis remis garde ses recueils.
 *   node tests/test-recueil-fiche.js */
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
const YEAR = new Date().getFullYear();

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-fiche-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env});
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Pierre','MAZAUD','male','deceased',1)");
$svc = save_archive_service($pdo, ['name' => 'Archives départementales du Cher', 'short_name' => 'AD Cher', 'kind' => 'departmental', 'city' => 'Bourges', 'search_url' => 'https://archives.exemple.fr/registres'])['id'];
foreach (range(1, 4) as $id) { $im = imagecreatetruecolor(120, 160); imagefill($im, 0, 0, imagecolorallocate($im, 230, 215, 180)); imagepng($im, MEDIA_DIR . "/m$id.png"); }
$m = $pdo->prepare("INSERT INTO media(id,title,filename,thumbnail,media_type) VALUES(?,?,?,?,'image')"); foreach (range(1, 4) as $id) { $m->execute([$id, "Vue $id", "m$id.png", "m$id.png"]); }
$a = save_recueil($pdo, ['title' => 'Registre paroissial de Sancoins', 'reference' => '3 E 1234', 'date_text' => '1789-1792']);
recueil_add_images($pdo, ['recueil_id' => $a['id'], 'version_id' => (int) $pdo->query('SELECT MAX(id) FROM recueil_versions')->fetchColumn(), 'mode' => 'new_pages', 'media_ids' => [1, 2, 3]]);
$b = save_recueil($pdo, ['title' => 'Registre des naissances 1958-1962', 'reference' => '3 E 9999', 'date_text' => '1958-1962']);
recueil_add_images($pdo, ['recueil_id' => $b['id'], 'version_id' => (int) $pdo->query('SELECT MAX(id) FROM recueil_versions')->fetchColumn(), 'mode' => 'new_pages', 'media_ids' => [4]]);
act_transcriptions_ensure($pdo);
$pdo->exec("INSERT INTO act_transcriptions(title,kind,media_id,date_text,body) VALUES('Baptême','bapteme',1,'1790','texte'),('Naissance','naissance',4,'1961','texte')");
$ids = array_map('intval', $pdo->query('SELECT id FROM recueil_pages WHERE recueil_id=' . $a['id'] . ' ORDER BY position')->fetchAll(PDO::FETCH_COLUMN));
save_recueil_page($pdo, ['id' => $ids[1], 'label' => 'f° 11 r°']);
echo json_encode(['ok' => 1, 'svc' => $svc, 'a' => $a['id'], 'b' => $b['id'], 'ids' => $ids]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const {svc, a, b, ids} = JSON.parse(seed.stdout);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_EXT?.recueilFiche && window.LCNDA_EXT?.openRecueil && window.LCNDA_APP?.state?.csrf, null, {timeout: 30000});
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (x, body) => p.evaluate(async ([y, z]) => { try { const r = await window.LCNDA_APP.api(y, {}, {method: 'POST', body: z}); return r.result || r; } catch (e) { return {error: e.message}; } }, [x, body]);
        const saveA = extra => api('recueil', {id: a}).then(d => post('save_recueil', {...d.recueil, ...extra}));

        await t('côté serveur : la fiche (service, fonds, série, liens, décalage, autre exemplaire, réutilisation, support…) et ses refus', async () => {
            const r = await saveA({archive_service_id: svc, fonds: 'Fonds de la paroisse de Sancoins', series: '3 E (état civil)', url: 'https://archives.exemple.fr/ark:/12', view_url: 'https://archives.exemple.fr/ark:/12/vue/{n}', view_offset: 12,
                twin_id: b, reuse: 'etalab', support: 'papier', material_state: 'abime', language: 'Français', script: 'Cursive XVIIIᵉ', provenance: 'Dépôt de la commune, 1952', digitized_by: 'AD Cher (2009)'});
            assert.ok(!r.error, r.error);
            const d = (await api('recueil', {id: a})).recueil;
            assert.deepEqual([d.service.short_name, d.fonds, d.series, d.view_offset, d.twin.title, d.reuse, d.support, d.material_state, d.language], ['AD Cher', 'Fonds de la paroisse de Sancoins', '3 E (état civil)', 12, 'Registre des naissances 1958-1962', 'etalab', 'papier', 'abime', 'Français']);
            assert.equal((await api('recueil', {id: b})).recueil.twin.title, 'Registre paroissial de Sancoins', 'l’autre exemplaire se voit des deux côtés');
            assert.match((await saveA({view_url: 'https://archives.exemple.fr/vue/1'})).error || '', /\{n\}/);
            assert.match((await saveA({url: 'ftp://x'})).error || '', /http/);
            assert.match((await saveA({twin_id: a})).error || '', /propre autre exemplaire/);
            assert.match((await saveA({archive_service_id: 99999})).error || '', /introuvable/);
        });
        await t('la communicabilité : calculée (1792 + 75 ans = communicable ; dates 1958-1962 avec des naissances = réservé jusqu’en 2037), choisie (réservée, libre, autorisation), sans année = à vérifier', async () => {
            assert.deepEqual((await api('recueil', {id: a})).recueil.communicability.state, 'free');
            const cb = (await api('recueil', {id: b})).recueil.communicability;
            assert.deepEqual([cb.state, cb.until, cb.delay, cb.last_year], [2037 > YEAR ? 'reserved' : 'free', 2037 > YEAR ? '2037' : '', 75, 1962]);
            await saveA({comm_mode: 'reserve', comm_until: '2099'}); assert.deepEqual([(await api('recueil', {id: a})).recueil.communicability.state, (await api('recueil', {id: a})).recueil.communicability.until], ['reserved', '2099']);
            await saveA({comm_mode: 'autorisation'}); assert.equal((await api('recueil', {id: a})).recueil.communicability.state, 'authorization');
            await saveA({comm_mode: 'libre', comm_until: ''}); assert.equal((await api('recueil', {id: a})).recueil.communicability.state, 'free');
            const c = await post('save_recueil', {title: 'Cahier sans date'}); assert.equal((await api('recueil', {id: c.id})).recueil.communicability.state, 'unknown');
            await post('delete_recueil', {id: c.id});
            await saveA({comm_mode: ''});
        });
        await t('🔐 mode consultation : le recueil non communicable n’est ni dans la liste ni ouvrable ; réglage « 0 » = tout montrer', async () => {
            fs.writeFileSync(path.join(tmp, 'consultation.json'), JSON.stringify({hash: 'x', since: '2026-01-01'}));
            const list = (await api('recueils')).recueils.map(x => x.id);
            if (2037 > YEAR) { assert.deepEqual(list, [a]); assert.match((await api('recueil', {id: b})).error || '', /pas communicable/); }
            php(`require 'lib/bootstrap.php'; db()->prepare('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)')->execute(['genealogie-recueils-caches-consultation', '0']);`);
            assert.deepEqual((await api('recueils')).recueils.map(x => x.id).sort(), [a, b].sort());
            php(`require 'lib/bootstrap.php'; db()->exec("DELETE FROM app_settings WHERE key='genealogie-recueils-caches-consultation'");`);
            fs.unlinkSync(path.join(tmp, 'consultation.json'));
            assert.equal((await api('recueils')).recueils.length, 2);
        });
        await t('la page : « ↗ Vue 14 en ligne » (page 2 + 12) et la citation « AD Cher, 3 E 1234, f° 11 r° (vue 14) »', async () => {
            await p.evaluate(([r, pg]) => window.LCNDA_EXT.openRecueil(r, pg), [a, ids[1]]); await p.waitForSelector('[data-rc-fiche] .rf-page');
            const s = await p.evaluate(() => ({href: document.querySelector('[data-rc-fiche] a')?.href, cite: document.querySelector('[data-rf-pcite]').title}));
            assert.equal(s.href, 'https://archives.exemple.fr/ark:/12/vue/14'); assert.equal(s.cite, 'AD Cher, 3 E 1234, f° 11 r° (vue 14)');
            assert.match(await p.evaluate(() => document.querySelector('.h-rc-one .page-header .muted').textContent), /AD Cher · Fonds de la paroisse de Sancoins · 3 E 1234 · 1789-1792/);
        });
        await t('le Résumé : « 🏛 Où il est » (service, fonds, cote, liens, autre exemplaire, citer) et « 🔐 Qui peut le voir » (règle, réutilisation, interrupteur du mode consultation)', async () => {
            await p.evaluate(() => document.querySelector('[data-rc-tab="summary"]').click()); await p.waitForSelector('.rf-dl');
            const s = await p.evaluate(() => [...document.querySelectorAll('.h-rc-block')].map(b => b.textContent.replace(/\s+/g, ' ')).join(' | '));
            assert.match(s, /🏛 Où il est\s*Service d’archives\s*🏛 Archives départementales du Cher.*Registres en ligne ↗.*Fonds\s*Fonds de la paroisse de Sancoins.*Cote\s*3 E 1234/);
            assert.match(s, /Autre exemplaire\s*↪ Registre des naissances 1958-1962/); assert.match(s, /Citer : AD Cher, 3 E 1234 ⧉ Copier/);
            assert.match(s, /🔐 Qui peut le voir\s*✓ Communicable — acte le plus récent : 1792 ; délai 75 ans/); assert.match(s, /Réutilisation\s*Licence ouverte \(Etalab\)/);
            await p.click('[data-rf-hide]'); await sleep(300);
            assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-recueils-caches-consultation')), '0');
            await p.click('[data-rf-hide]');
        });
        await t('« Modifier » : « 🏛 Où il est, qui peut le voir » (ouvert, le service choisi, « jusqu’en » seulement pour « réservée »), enregistrer garde tout', async () => {
            await p.click('[data-rc-edit]'); await p.waitForSelector('dialog[open] .rf-box[open]');
            const s = await p.evaluate(() => ({svc: document.querySelector('dialog[open] [name=archive_service_id]')?.value, twin: [...document.querySelectorAll('dialog[open] [data-rf-twin] option')].map(o => o.textContent), until: document.querySelector('dialog[open] [data-rf-until]').hidden}));
            assert.equal(Number(s.svc), svc); assert.ok(s.twin.some(x => /Registre des naissances/.test(x))); assert.equal(s.until, true);
            await p.check('dialog[open] [name=comm_mode][value="reserve"]'); assert.equal(await p.evaluate(() => document.querySelector('dialog[open] [data-rf-until]').hidden), false);
            await p.fill('dialog[open] [name=comm_until]', '2088'); await p.click('dialog[open] [type=submit]'); await sleep(1200);
            const d = (await api('recueil', {id: a})).recueil; assert.deepEqual([d.comm_mode, d.comm_until, d.fonds, d.archive_service_id, d.reuse], ['reserve', '2088', 'Fonds de la paroisse de Sancoins', svc, 'etalab']);
            await saveA({comm_mode: '', comm_until: ''});
        });
        await t('🏛 la page du service : « 📚 Recueils chez eux » (avancement, communicabilité) et les lacunes de leurs pages', async () => {
            await post('recueil_pages_set', {recueil_id: a, page_ids: [ids[2]], fields: {absent: 'perdue'}, gap: true});
            await saveA({}); await post('save_recueil', {...(await api('recueil', {id: b})).recueil, archive_service_id: svc});
            await p.evaluate(id => window.LCNDA_EXT.archiveServices.open(id), svc);
            await p.waitForSelector('[data-as-recueils]:not([hidden]) .rf-svc', {timeout: 20000});
            const s = await p.evaluate(() => document.querySelector('[data-as-recueils]').textContent.replace(/\s+/g, ' '));
            assert.match(s, /📚 Recueils chez eux \(2\)/); assert.match(s, /Registre paroissial de Sancoins/); assert.match(s, /3 E 1234/); assert.match(s, /1 absentes/);
            assert.match(s, /🕳 Lacunes \(1\)/); assert.match(s, /Registre paroissial de Sancoins : p\. 3 \(Perdue ou détruite\)/);
        });
        await t('un service supprimé : ses recueils le perdent ; ↶ remis : ils le retrouvent', async () => {
            await post('delete_archive_service', {id: svc});
            assert.equal((await api('recueil', {id: a})).recueil.archive_service_id, 0);
            await post('restore_archive_service', {id: svc});
            assert.equal((await api('recueil', {id: a})).recueil.archive_service_id, svc);
        });
        await t('migration 108 rejouable', async () => {
            const r = php(`require 'lib/bootstrap.php'; $p = db(); schema_v108($p); schema_v108($p); echo $p->query('PRAGMA user_version')->fetchColumn(), ' ', SCHEMA_VERSION;`);
            const m = r.stdout.match(/^(\d+) (\d+)$/); assert.ok(m && m[1] === m[2] && Number(m[1]) >= 108, r.stdout + r.stderr);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : 'La fiche d’identité des recueils marche.');
    process.exit(fails ? 1 : 0);
})();
