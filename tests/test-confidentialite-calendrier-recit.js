'use strict';
/**
 * 🔒 Deux choix de confidentialité : node tests/test-confidentialite-calendrier-recit.js
 *  1. Agenda des anniversaires (.ics) : en mode confidentialité (privacy=1), pas d'anniversaire des personnes vivantes ou
 *     probablement vivantes, ni de mariage qui en nomme une ; sans ce mode, elles y sont (option « seulement les vivants »).
 *  2. Livre de famille : bio_living_mentions trouve les récits écrits à la main (« ta version ») qui nomment une personne
 *     vivante ou confidentielle ; le livre prévient avant l'export (« Exporter quand même »), sans rien modifier.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {findPhp, devBundledPhp, phpRuntimeArgs} = require('../electron/php-server');

const root = path.resolve(__dirname, '..');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-confcal-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$person = function ($f, $l, $g, $st) use ($pdo) { $pdo->prepare('INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,?)')->execute([$f, $l, $g, $st]); return (int) $pdo->lastInsertId(); };
$ev = function ($pid, $t, $date, $y) use ($pdo, $tag) { $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, date_text, year, sort_date) VALUES('person',?,?,?,?,?)")->execute([$pid, $tag($t), $date, $y, $y . '-01-01']); };
$pierre = $person('Pierre', 'MAZAUD', 'male', 'deceased'); $ev($pierre, 'BIRT', '3 avril 1850', 1850); $ev($pierre, 'DEAT', '9 mai 1920', 1920);
$jeanne = $person('Jeanne', 'LACOMBE', 'female', 'living'); $ev($jeanne, 'BIRT', '12 mars 1990', 1990);
$louis = $person('Louis', 'DURAND', 'male', 'unknown'); $ev($louis, 'BIRT', '20 juin 1985', 1985); // probablement vivant
$marie = $person('Marie', 'DURAND', 'female', 'deceased'); $ev($marie, 'BIRT', '1 février 1852', 1852); $ev($marie, 'DEAT', '2 février 1930', 1930);
if (function_exists('recits_schema')) { recits_schema($pdo); }
$pdo->prepare("INSERT INTO person_biographies(person_id, text) VALUES(?, ?)")->execute([$pierre, "Pierre MAZAUD a connu la petite Jeanne Lacombe, sa voisine."]);
$pdo->prepare("INSERT INTO person_biographies(person_id, text) VALUES(?, ?)")->execute([$marie, "Marie DURAND a vécu à Tulle, sans nommer personne d'autre."]);
echo json_encode(['pierre' => $pierre, 'jeanne' => $jeanne, 'louis' => $louis, 'marie' => $marie]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/pierre/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const get = async q => { const r = await fetch(base + 'api.php?' + new URLSearchParams(q)); return {status: r.status, text: await r.text()}; };
    try {
        await t('📅 .ics sans mode confidentialité : les anniversaires des vivants y sont', async () => {
            const r = await get({action: 'export_plus', format: 'ics', groups: 'birth'});
            assert.equal(r.status, 200, r.text.slice(0, 200));
            assert.match(r.text, /Jeanne LACOMBE/); assert.match(r.text, /Louis DURAND/); assert.match(r.text, /Pierre MAZAUD/);
        });
        await t('📅 .ics en mode confidentialité : ni vivants ni probablement vivants, les morts restent', async () => {
            const r = await get({action: 'export_plus', format: 'ics', groups: 'birth,death', privacy: '1'});
            assert.equal(r.status, 200, r.text.slice(0, 200));
            assert.doesNotMatch(r.text, /LACOMBE/, 'vivante retirée'); assert.doesNotMatch(r.text, /Louis/, 'probablement vivant retiré');
            assert.match(r.text, /Pierre MAZAUD/); assert.match(r.text, /Marie DURAND/);
        });
        await t('📖 bio_living_mentions : le récit de Pierre nomme Jeanne (vivante), celui de Marie ne nomme personne', async () => {
            const r = JSON.parse((await get({action: 'bio_living_mentions'})).text);
            assert.equal(r.items.length, 1, JSON.stringify(r));
            assert.equal(r.items[0].person_id, ID.pierre);
            assert.deepEqual(r.items[0].mentions.map(m => [m.id, m.why]), [[ID.jeanne, 'vivante']]);
        });
        await t('📖 le livre prévient avant l’export (source)', async () => {
            const src = fs.readFileSync(path.join(root, 'assets/js/heritage-book.js'), 'utf8');
            assert.match(src, /api\('bio_living_mentions'\)/); assert.match(src, /Exporter quand même/);
            assert.match(fs.readFileSync(path.join(root, 'index.php'), 'utf8'), /heritage-book\.js\?v=\d+/);
        });
    } finally { proc.kill(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
