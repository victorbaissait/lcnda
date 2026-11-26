'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ✉ « Envoyer un panier à un compte du site familial » → 📥 « Ce qu'on m'a partagé » sur famille.php (lib/partages_famille.php,
 * lib/paniers.php pn_share_send / pn_share_sent, lib/comptes_famille.php FC_GUEST_ACTIONS, assets/js/app-famille.js, app-paniers.js).
 *   node tests/test-panier-site-familial.js
 * Base fictive (MAZAUD, LACOMBE, DURAND) :
 *  1. listes blanches : « partages » (GET, lecture seule), « partages_vu » et « partage_retirer » (POST, donc CSRF) ; rien d'autre ;
 *  2. envoi : public gardé ; personnel coché gardé ; vivant / confidentiel / note jamais ; un texte qui nomme une vivante probable retiré ;
 *     lien javascript: retiré ; les fiches d'origine gardées à part (refs), jamais montrées ;
 *  3. lecture : repassée au filtre (Jean devient vivant → retiré), compte limité à une branche (Jean hors branche → retiré), autre compte → rien ;
 *  4. « lu » pour l'envoyeur, ✕ retirer de ma liste (↶), consultation de l'ordinateur → rien n'est écrit ;
 *  5. écran (Playwright, réponses simulées) : une seule vue « Ce qu'on m'a partagé » (🧺 paniers reçus + 📊 listes), texte échappé,
 *     lien http(s) seulement, « lu » envoyé, ✕ retirer + ↶, 390 px sans défilement horizontal.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(appRoot, f), 'utf8');
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    await t('1 listes blanches : partages (GET, lecture seule), partages_vu / partage_retirer (POST → CSRF) ; l’envoi passe par api.php (cx_write)', () => {
        const lib = read('lib/comptes_famille.php');
        assert.match(lib, /'partages' => 'GET', 'partages_vu' => 'POST', 'partage_retirer' => 'POST'\];/);
        assert.match(lib, /\$readOnly = in_array\(\$action, \[[^\]]*'partages'\]/);
        assert.match(lib, /if \(\$method === 'POST'\) \{ verify_csrf\(/);
        const pn = read('lib/paniers.php');
        assert.match(pn, /function pn_share_send[\s\S]{0,200}return pf_send\(\$pdo, \$d\);/);
        assert.match(pn, /'pn_share_sent' =>/);
        const pf = read('lib/partages_famille.php');
        assert.match(pf, /pf_main_kiosk\(\)\) \{ return \['ok' => false, 'kiosk' => true\]; \}/);
        assert.match(pf, /AND account_id=\?/, 'un compte ne touche que ses paniers');
        const js = read('assets/js/app-famille.js');
        assert.ok(!/innerHTML\s*=\s*[^;]*\$\{(?!esc)/.test(js.match(/async function showShared[\s\S]*?\n    \}\n/)[0].replace(/\$\{esc\(/g, '')), 'sans esc() nulle part');
    });

    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-pf-'));
    const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    fs.mkdirSync(path.join(tmp, 'media'));
    const php = code => {
        const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php'; require 'lib/bootstrap.php'; require_once 'lib/connexions.php'; require_once 'lib/paniers.php'; require_once 'lib/comptes_famille.php'; require_once 'lib/partages_famille.php';
$pdo = db(); cx_schema($pdo); fc_schema($pdo);
$acc = fn($id) => fc_account($pdo, $id);
` + code], { cwd: appRoot, encoding: 'utf8', env });
        if (r.status !== 0) throw new Error(r.stderr || r.stdout);
        const out = String(r.stdout).trim().split('\n').pop();
        try { return JSON.parse(out); } catch (_) { throw new Error(r.stdout + r.stderr); }
    };
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_private,is_start) VALUES
 (1,'Jean','MAZAUD','male','deceased',0,1),(2,'Marie','LACOMBE','female','deceased',0,0),(3,'Louis','MAZAUD','male','deceased',0,0),
 (4,'Hélène','MAZAUD','female','living',0,0),(5,'Paul','DURAND','male','deceased',1,0),(7,'Pierre','MAZAUD','male','deceased',0,0),(8,'Lucie','MAZAUD','female','unknown',0,0)");
$t = fn($g) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$g' AND scope='person' ORDER BY id LIMIT 1")->fetchColumn();
$ev = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year) VALUES('person',?,?,?,?)");
foreach ([[1,'BIRT','1851',1851],[1,'DEAT','1920',1920],[2,'BIRT','1855',1855],[3,'BIRT','1880',1880],[3,'DEAT','1950',1950],[4,'BIRT','1990',1990],[5,'BIRT','1890',1890],[5,'DEAT','1960',1960],[7,'BIRT','1931',1931],[7,'DEAT','2000',2000],[8,'BIRT','1985',1985]] as $e) { $ev->execute([$e[0], $t($e[1]), $e[2], $e[3]]); }
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2),(2,3,NULL)");
$pdo->exec("INSERT INTO family_children(family_id,child_id,position) VALUES(1,3,1),(1,4,2),(1,5,3),(2,7,1),(2,8,2)");
$pdo->exec("INSERT INTO notes(id,entity_type,entity_id,title,body) VALUES(1,'person',1,'Souvenir','Jean au jardin')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }

    let ids = {};
    await t('2 envoi : public + personnel coché ; jamais vivant, confidentiel, note, nom d’une vivante probable ; lien javascript: retiré', () => {
        ids = php(String.raw`
$pdo->exec("INSERT INTO fc_accounts(id,name,login,role,scope_kind,scope_person) VALUES(1,'Odile LACOMBE','odile','proposer','tout',0),(2,'Henri DURAND','henri','branche','descendants',3),(3,'Autre','autre','lire','tout',0)");
$pdo->exec("INSERT INTO cx_baskets(id,name,icon) VALUES(1,'Mariage 1813','💍')");
$r = cx_basket_add($pdo, ['basket_id' => 1, 'items' => [
  ['kind' => 'datum', 'title' => 'Moulin de Treignac', 'value' => '1790', 'origin' => ['kind' => 'list', 'label' => 'Moulins', 'url' => 'https://example.org/moulins']],
  ['kind' => 'datum', 'title' => 'Lien piégé <script>', 'value' => 'x', 'origin' => ['kind' => 'list', 'label' => 'Piège', 'url' => 'javascript:alert(1)']],
  ['kind' => 'datum', 'title' => 'Recensement : Lucie MAZAUD', 'value' => '2015', 'origin' => ['kind' => 'list', 'label' => 'Recensement']],
  ['kind' => 'person', 'ref_id' => 1, 'title' => 'Jean MAZAUD', 'value' => '1851–1920'],
  ['kind' => 'person', 'ref_id' => 4, 'title' => 'Hélène MAZAUD', 'value' => '1990'],
  ['kind' => 'person', 'ref_id' => 5, 'title' => 'Paul DURAND', 'value' => '1890–1960'],
  ['kind' => 'note', 'ref_id' => 1, 'title' => 'Souvenir', 'value' => 'Jean au jardin'],
]]);
$all = $r['ids'];
$s = pn_share_send($pdo, ['basket_id' => 1, 'account_id' => 1, 'include' => $all]);
$s2 = pn_share_send($pdo, ['basket_id' => 1, 'account_id' => 2, 'include' => $all]);
$row = $pdo->query('SELECT body, refs FROM cx_shares WHERE id=' . $s['share_id'])->fetch(PDO::FETCH_ASSOC);
$bad = 0; try { pn_share_send($pdo, ['basket_id' => 1, 'account_id' => 99]); } catch (LcndaBadInput $e) { $bad = 1; }
echo json_encode(['s' => $s, 's2' => $s2['share_id'], 'body' => json_decode($row['body'], true), 'refs' => json_decode($row['refs'], true), 'bad' => $bad]);`);
        const titles = ids.body.items.map(i => i.title);
        assert.deepEqual(titles, ['Moulin de Treignac', 'Lien piégé', 'Jean MAZAUD']);
        assert.equal(ids.body.items[1].url, undefined, 'javascript: jamais');
        assert.equal(ids.body.items[0].url, 'https://example.org/moulins');
        assert.equal(ids.s.counts.notes, 1, 'la note cochée ne part pas');
        assert.equal(ids.s.counts.sent, 3);
        assert.ok(ids.s.counts.blocked >= 3, 'Hélène (vivante), Paul (confidentiel), Lucie (nommée) : bloqués');
        assert.deepEqual(ids.refs, [0, 0, 1]);
        assert.equal(ids.bad, 1, 'compte inconnu refusé');
        assert.ok(!JSON.stringify(ids.body).includes('Hélène') && !JSON.stringify(ids.body).includes('Lucie') && !JSON.stringify(ids.body).includes('jardin'));
        assert.equal(ids.s.sent[0].status, 'envoye');
    });

    await t('3 lecture repassée au filtre : branche (Jean hors des descendants de Louis), un autre compte ne voit rien, Jean devenu vivant → retiré', () => {
        const r = php(String.raw`
$a = pf_guest($pdo, $acc(1)); $h = pf_guest($pdo, $acc(2)); $o = pf_guest($pdo, $acc(3));
$pdo->exec("UPDATE persons SET living_status='living' WHERE id=1");
echo json_encode(['a' => $a, 'h' => $h, 'o' => $o]);`);
        r.after = php(String.raw`$x = pf_guest($pdo, $acc(1)); $pdo->exec("UPDATE persons SET living_status='deceased' WHERE id=1"); echo json_encode($x);`); // une nouvelle requête (fc_hidden est gardé le temps d'une requête)
        assert.equal(r.a.baskets.length, 1); assert.equal(r.a.baskets[0].name, 'Mariage 1813'); assert.equal(r.a.baskets[0].new, true);
        assert.deepEqual(r.a.baskets[0].items.map(i => i.title), ['Moulin de Treignac', 'Lien piégé', 'Jean MAZAUD']);
        assert.ok(!('refs' in r.a.baskets[0]), 'les fiches d’origine ne sortent jamais');
        assert.deepEqual(r.h.baskets[0].items.map(i => i.title), ['Moulin de Treignac', 'Lien piégé'], 'Jean hors de la branche de Henri');
        assert.equal(r.h.baskets[0].hidden, 1);
        assert.equal(r.o.baskets.length, 0, 'un autre compte ne voit pas ce panier');
        assert.deepEqual(r.after.baskets[0].items.map(i => i.title), ['Moulin de Treignac', 'Lien piégé'], 'Jean devenu vivant : retiré à la lecture');
        assert.ok(Array.isArray(r.a.lists), 'les 📊 listes dans la même réponse');
    });

    await t('4 « lu » pour l’envoyeur ; ✕ retirer (↶) ; seulement ses paniers ; ordinateur en consultation → rien n’est écrit', () => {
        const r = php(String.raw`
$id = (int) $pdo->query('SELECT id FROM cx_shares WHERE account_id=1')->fetchColumn();
$other = pf_guest_write($pdo, $acc(3), 'partages_vu', ['ids' => [$id]]);
$vu = pf_guest_write($pdo, $acc(1), 'partages_vu', ['ids' => [$id, 'x', -3]]);
$sent1 = pf_sent($pdo, ['basket_id' => 1])['sent'];
$steal = 0; try { pf_guest_write($pdo, $acc(3), 'partage_retirer', ['id' => $id]); } catch (LcndaBadInput $e) { $steal = 1; }
pf_guest_write($pdo, $acc(1), 'partage_retirer', ['id' => $id]);
$gone = count(pf_guest($pdo, $acc(1))['baskets']);
$sent2 = pf_sent($pdo, ['basket_id' => 1])['sent'];
pf_guest_write($pdo, $acc(1), 'partage_retirer', ['id' => $id, 'undo' => 1]);
$back = count(pf_guest($pdo, $acc(1))['baskets']);
file_put_contents(kiosk_path(), json_encode(['hash' => 'x', 'since' => 'now']));
$k = pf_guest_write($pdo, $acc(1), 'partage_retirer', ['id' => $id]);
$still = count(pf_guest($pdo, $acc(1))['baskets']);
unlink(kiosk_path());
echo json_encode(compact('other', 'vu', 'sent1', 'steal', 'gone', 'sent2', 'back', 'k', 'still', 'id'));`);
        assert.equal(r.other.n, 0, 'un autre compte ne marque rien'); assert.equal(r.vu.n, 1);
        const mine = x => x.find(s => s.id === r.id);
        assert.equal(mine(r.sent1).status, 'lu'); assert.match(mine(r.sent1).read, /^\d{4}-\d\d-\d\d \d\d:\d\d$/); assert.equal(mine(r.sent1).account, 'Odile LACOMBE');
        assert.equal(r.steal, 1); assert.equal(r.gone, 0); assert.equal(mine(r.sent2).status, 'retire'); assert.equal(r.back, 1);
        assert.equal(r.k.kiosk, true); assert.equal(r.still, 1);
    });

    await t('5 écran (Playwright) : une seule vue 📥, 🧺 paniers + 📊 listes, texte échappé, http(s) seulement, « lu », ✕ + ↶, 390 px', async () => {
        let chromium; try { ({ chromium } = require('playwright')); } catch (_) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
        const browser = await chromium.launch();
        try {
            const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
            const errors = []; page.on('pageerror', e => errors.push(String(e)));
            const posts = []; let dismissed = false;
            const share = () => ({ baskets: dismissed ? [] : [{ id: 7, name: 'Mariage <b>1813</b>', icon: '💍', at: '2026-11-20 10:00:00', new: true, hidden: 1,
                items: [{ title: 'Moulin <img src=x onerror=alert(1)>', value: '1790', source: 'Moulins', url: 'https://example.org/m' }, { title: 'Piège', value: '', source: 'Mal', url: 'javascript:alert(1)' }] }],
                lists: [{ id: 1, name: 'Soldats', cols: ['Nom', 'Année'], rows: [['Jean MAZAUD', '1915']], sources: [{ source: 'Mémoire des hommes', licence: 'Licence ouverte' }], filters: '' }] });
            await page.route('**/famille.php**', async route => {
                const u = new URL(route.request().url()); const a = u.searchParams.get('action');
                const body = route.request().postDataJSON?.() || null;
                if (route.request().method() === 'POST') posts.push([a, body]);
                if (a === 'partage_retirer') dismissed = !(body && body.undo);
                const j = !a ? null : a === 'state' ? { genealogy: 'MAZAUD', g: 'g1', csrf: 'tok', logged: true, account: { name: 'Odile', role: 'proposer', can_propose: true }, home: 0 }
                    : a === 'partages' ? share() : { ok: true };
                if (!a) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="assets/css/famille.css"></head><body class="fam-body"><main id="fam" class="fam"></main><script src="assets/js/app-famille.js"></script></body></html>' });
                return route.fulfill({ contentType: 'application/json', body: JSON.stringify(j) });
            });
            await page.route('**/assets/**', route => { const f = path.join(appRoot, new URL(route.request().url()).pathname); return fs.existsSync(f) ? route.fulfill({ path: f }) : route.fulfill({ status: 404, body: '' }); });
            await page.goto('http://famille.test/famille.php');
            await page.waitForSelector('[data-fam-lists]');
            assert.match(await page.textContent('[data-fam-lists]'), /Ce qu’on m’a partagé/);
            await page.click('[data-fam-lists]');
            await page.waitForSelector('.fam-shared [data-fam-basket="7"]');
            const html = await page.innerHTML('.fam-shared');
            assert.ok(!/<img/i.test(html) && !/<b>1813/.test(html), 'texte échappé');
            assert.ok(html.includes('href="https://example.org/m"') && !html.includes('javascript:'), 'http(s) seulement');
            assert.match(await page.textContent('.fam-shared'), /Paniers reçus[\s\S]*Listes partagées[\s\S]*Jean MAZAUD/);
            await page.waitForFunction(() => true); await new Promise(r => setTimeout(r, 300));
            assert.deepEqual(posts.find(p => p[0] === 'partages_vu')[1].ids, [7], '« lu » envoyé');
            assert.equal(posts.find(p => p[0] === 'partages_vu')[1].csrf, 'tok', 'jeton CSRF');
            const sw = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(sw <= 391, 'pas de défilement horizontal : ' + sw);
            await page.click('[data-fam-dismiss="7"]');
            await page.waitForSelector('#fam-toast [data-fam-undo]');
            assert.equal(await page.locator('[data-fam-basket="7"]').count(), 0);
            await page.click('#fam-toast [data-fam-undo]');
            await page.waitForSelector('[data-fam-basket="7"]');
            assert.equal(posts.filter(p => p[0] === 'partage_retirer').length, 2);
            await page.evaluate(() => { location.hash = '#listes'; }); await page.waitForSelector('.fam-shared');
            assert.deepEqual(errors, []);
        } finally { await browser.close(); }
    });

    await t('6 ✉ côté envoyeur : « Déjà envoyé » avec « lu le … » / « retiré » dans ⇪ Partager (app-paniers.js) ; i18n', () => {
        const js = read('assets/js/app-paniers.js');
        assert.match(js, /post\('pn_share_sent', \{basket_id: b\.id\}\)/);
        assert.match(js, /T\('lu le \{d\}', \{d: x\.read\}\)/);
        assert.match(read('index.php'), /app-paniers\.js\?v=6/);
    });
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    finish();
})();

function finish() { console.log(`\n${passed} ✓, ${failed} ✗`); process.exit(failed ? 1 : 0); }
