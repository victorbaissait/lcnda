'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Non-régression côté serveur du moteur des fiches (lib/art_engine.php, lib/blocs.php) et des imports en ligne :
 *     node tests/test-moteur-fiches-serveur.js
 * 1. Migration n°47 (artist_items → items) tout ou rien : une erreur au milieu (après la copie) laisse la base au n°46 AVEC
 *    artist_items (avant : table supprimée, index vides, dates jamais calculées) ; rejouée une fois la cause retirée, elle
 *    recopie tout (mêmes numéros, index, dates). 2 000 fiches migrées en peu de temps (une seule transaction).
 * 2. Une personne supprimée : ses fiches restent (pour « Remettre ») mais disparaissent des listes (Revue de presse…),
 *    du menu de choix, des « Lié à » ; une pastille qui la cite devient « Fiche supprimée » sans lien. Remise : tout revient.
 * 3. Sorte enregistrée avec des liens forgés (tableaux, texte piégé) : seuls les vrais noms de sortes sont gardés. Un tableau
 *    à la place d'un texte (art_write, profils, blocs, puzzle, scène, sciences, menu de choix) : refus 422 clair, jamais
 *    « Array » ni avertissement PHP ; un nombre est converti en texte.
 * 4. Vrai « php -S » : un import en ligne (DOI) qui attend un site lent ne bloque plus les enregistrements faits en même
 *    temps (avant : transaction d'écriture ouverte pendant l'attente → « base verrouillée »).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-moteur-'));
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
const php = (code, extra = {}) => {
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...env, ...extra } });
    const last = (r.stdout || '').trim().split('\n').pop();
    try { return JSON.parse(last); } catch (_) { console.error(r.stderr || r.stdout); throw new Error('PHP : réponse illisible'); }
};

// ── 1. une base « n°46 » avec l'ancienne table artist_items ─────────────────────────────
php(String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male'),('Louise','Borie','female'),('Paul','Borie','male')"); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
foreach (['items','item_types','type_fields','type_links','item_people','item_links','item_rows','profiles','person_profiles','layout_prefs'] as $t) $pdo->exec("DROP TABLE IF EXISTS $t");
$pdo->exec("CREATE TABLE artist_items (id INTEGER PRIMARY KEY AUTOINCREMENT, person_id INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
    year INTEGER, data TEXT NOT NULL DEFAULT '{}', sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
$pdo->beginTransaction();
$ins = $pdo->prepare('INSERT INTO artist_items(id, person_id, kind, title, year, data, sort_order) VALUES(?,?,?,?,?,?,?)');
for ($i = 1; $i <= 2000; $i++) $ins->execute([$i * 3, 1, 'release', "Disque $i", 1950 + $i % 40, json_encode(['title' => "Disque $i", 'date' => 'mars ' . (1950 + $i % 40), 'credits' => [['pid' => 2, 'role' => 'guitare'], ['pname' => 'Jean X']], 'tracks' => [['title' => 'A'], ['title' => 'B']]]), $i]);
$pdo->commit();
$pdo->exec('UPDATE persons SET is_artist=1 WHERE id=1');
// une table item_rows abîmée : la migration échouera APRÈS la copie d'artist_items (au moment des index)
$pdo->exec('CREATE TABLE item_rows(id INTEGER PRIMARY KEY, item_id INTEGER, field TEXT)');
$pdo->exec('PRAGMA user_version = 46');
echo json_encode(['ok' => 1]);`);

const failed = php(String.raw`
require 'lib/paths.php'; require 'lib/bootstrap.php';
$err = ''; try { db(); } catch (Throwable $e) { $err = $e->getMessage(); }
$p = new PDO('sqlite:'.DB_PATH);
echo json_encode(['err' => $err, 'version' => (int) $p->query('PRAGMA user_version')->fetchColumn(),
    'artist_items' => (int) $p->query("SELECT count(*) FROM sqlite_master WHERE name='artist_items'")->fetchColumn() ? (int) $p->query('SELECT count(*) FROM artist_items')->fetchColumn() : -1,
    'items' => (int) $p->query("SELECT count(*) FROM sqlite_master WHERE name='items'")->fetchColumn()]);`);
assert.match(failed.err, /structure n°47/, 'la migration abîmée échoue');
assert.equal(failed.version, 46, 'la base reste au n°46');
assert.equal(failed.artist_items, 2000, 'artist_items est toujours là, entière (tout ou rien)');
assert.equal(failed.items, 0, 'rien de la migration ratée ne reste (transaction annulée)');

const migrated = php(String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec('DROP TABLE item_rows'); $p = null; // la cause retirée
require 'lib/bootstrap.php';
$t = microtime(true); $pdo = db(); $ms = (microtime(true) - $t) * 1000;
echo json_encode(['version' => (int) $pdo->query('PRAGMA user_version')->fetchColumn(), 'ms' => $ms,
    'items' => (int) $pdo->query('SELECT count(*) FROM items')->fetchColumn(), 'same_ids' => (int) $pdo->query('SELECT count(*) FROM items WHERE id % 3 = 0')->fetchColumn(),
    'no_dates' => (int) $pdo->query('SELECT count(*) FROM items WHERE date_min IS NULL')->fetchColumn(),
    'people' => (int) $pdo->query('SELECT count(*) FROM item_people WHERE person_id=2')->fetchColumn(), 'rows' => (int) $pdo->query('SELECT count(*) FROM item_rows')->fetchColumn(),
    'old' => (int) $pdo->query("SELECT count(*) FROM sqlite_master WHERE name='artist_items'")->fetchColumn(),
    'profile' => (int) $pdo->query("SELECT count(*) FROM person_profiles WHERE person_id=1 AND profile_key='artist'")->fetchColumn()]);`);
assert.equal(migrated.version, 47);
assert.equal(migrated.items, 2000, 'toutes les fiches sont recopiées');
assert.equal(migrated.same_ids, 2000, 'avec leurs numéros');
assert.equal(migrated.no_dates, 0, 'dates calculées');
assert.equal(migrated.people, 2000, 'personnes citées indexées');
assert.equal(migrated.rows, 8000, 'lignes répétées indexées (crédits et pistes)');
assert.equal(migrated.old, 0, 'artist_items supprimée une fois tout recopié');
assert.equal(migrated.profile, 1, 'profil « Artiste » posé');
assert.ok(migrated.ms < 8000, `2 000 fiches migrées en ${Math.round(migrated.ms)} ms (une seule transaction)`);

// ── 2. personne supprimée : fiches cachées, puis revenues ; 3. liens de sorte forgés ──────────
const del = php(String.raw`
require 'lib/paths.php'; require 'lib/bootstrap.php'; require_once 'lib/picker.php'; $pdo = db();
$own = blocs_save_item($pdo, ['person_id' => 3, 'kind' => 'press_item', 'data' => ['title' => 'Article de Paul', 'people' => [['pid' => 1, 'role' => 'cité']]]])['id'];
$cit = art_save_item($pdo, ['person_id' => 1, 'kind' => 'work', 'data' => ['title' => 'Portrait', 'sitter' => ['pid' => 3, 'role' => 'modèle'], 'press' => ['iid' => $own]]])['id'];
$see = static function () use ($pdo, $own, $cit) {
    $boot = blocs_boot($pdo, ['kinds' => 'press_item']);
    $pk = picker_search($pdo, ['kind' => 'artwork', 'q' => 'Article']);
    $pp = array_values(array_filter(art_people_of($pdo, [$cit]), static fn($p) => $p['field'] === 'sitter'))[0];
    return ['boot' => count($boot['items']), 'picker' => (int) $pk['groups'][0]['total'], 'links' => count(art_links_of($pdo, [$cit])), 'pid' => $pp['person_id'], 'name' => $pp['name'],
        'cited_on_1' => count(array_filter(art_person_cited($pdo, 1), static fn($x) => $x['kind'] === 'press_item'))];
};
$out = ['before' => $see()];
$row = $pdo->query('SELECT * FROM persons WHERE id=3')->fetch(PDO::FETCH_ASSOC);
$pdo->exec('DELETE FROM persons WHERE id=3');
$out['deleted'] = $see();
$out['kept'] = (int) $pdo->query("SELECT count(*) FROM items WHERE id={$own}")->fetchColumn();
$cols = array_keys(array_filter($row, 'is_string', ARRAY_FILTER_USE_KEY));
$pdo->prepare('INSERT INTO persons(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute(array_map(static fn($c) => $row[$c], $cols));
$out['restored'] = $see();
$key = art_save_type($pdo, ['label' => 'Ma sorte', 'def' => ['groups' => [['key' => 'g', 'fields' => [['key' => 'f', 'type' => 'items', 'kinds' => [['x'], 'release', "a'); DROP TABLE items; --", 't_ma_sorte', ['k' => 1]]]]]]]])['key'];
$out['links_types'] = $pdo->query("SELECT to_type FROM type_links WHERE from_type='{$key}' ORDER BY id")->fetchAll(PDO::FETCH_COLUMN);
echo json_encode($out, JSON_UNESCAPED_UNICODE);`);
assert.deepEqual(del.before, { boot: 1, picker: 1, links: 1, pid: 3, name: 'Paul BORIE', cited_on_1: 1 });
assert.equal(del.kept, 1, 'les fiches de la personne supprimée restent dans la base (pour la remettre)');
assert.deepEqual(del.deleted, { boot: 0, picker: 0, links: 0, pid: 0, name: 'Fiche supprimée', cited_on_1: 0 }, 'personne supprimée : plus rien d’affiché, pas de lien vers sa fiche');
assert.deepEqual(del.restored, del.before, 'personne remise : tout revient');
assert.deepEqual(del.links_types, ['release', 't_ma_sorte'], 'seuls les vrais noms de sortes sont gardés dans les liens');

// ── 3 bis. données de mauvaise forme (un tableau à la place d'un texte) : refus clair, jamais « Array » ni avertissement PHP ──
const shape = php(String.raw`
require 'lib/paths.php'; require 'lib/bootstrap.php'; require_once 'lib/picker.php'; require_once 'lib/artist_catalog.php'; require_once 'lib/scene.php'; require_once 'lib/sciences.php'; $pdo = db();
set_error_handler(static function (int $no, string $msg) { throw new ErrorException('AVERTISSEMENT PHP : ' . $msg); });
$try = static function (callable $f) { try { $f(); return 'ok'; } catch (LcndaBadInput $e) { return 'refus'; } catch (Throwable $e) { return get_class($e) . ' : ' . $e->getMessage(); } };
$bad = [['x'], ['a' => 1]];
$out = [];
foreach ($bad as $i => $v) {
    $out["save_item.kind.$i"] = $try(fn() => art_api_post($pdo, ['op' => 'save_item', 'person_id' => 1, 'kind' => $v, 'data' => []]));
    $out["save_item.role.$i"] = $try(fn() => art_api_post($pdo, ['op' => 'save_item', 'person_id' => 1, 'kind' => 'work', 'data' => ['title' => 'x', 'credits' => [['pid' => 2, 'role' => $v]]]]));
    $out["save_item.pname.$i"] = $try(fn() => art_api_post($pdo, ['op' => 'save_item', 'person_id' => 1, 'kind' => 'work', 'data' => ['title' => 'x', 'credits' => [['pname' => $v]]]]));
    $out["save_item.title.$i"] = $try(fn() => art_api_post($pdo, ['op' => 'save_item', 'person_id' => 1, 'kind' => 'work', 'data' => ['title' => $v]]));
    $out["set_profile.label.$i"] = $try(fn() => art_api_post($pdo, ['op' => 'set_profile', 'person_id' => 1, 'profile' => 'u_essai_forme', 'on' => 1, 'label' => $v]));
    $out["set_profiles.label.$i"] = $try(fn() => art_api_post($pdo, ['op' => 'set_profiles', 'person_id' => 1, 'on' => [['key' => 'u_essai', 'label' => $v, 'icon' => '✦']]]));
    $out["set_profiles.off.$i"] = $try(fn() => art_api_post($pdo, ['op' => 'set_profiles', 'person_id' => 1, 'off' => [$v]]));
    $out["save_profile_def.label.$i"] = $try(fn() => art_api_post($pdo, ['op' => 'save_profile_def', 'label' => $v, 'icon' => '✦', 'def' => []]));
    $out["save_profile_def.icon.$i"] = $try(fn() => art_api_post($pdo, ['op' => 'save_profile_def', 'label' => 'P', 'icon' => $v, 'def' => []]));
    $out["save_type.label.$i"] = $try(fn() => art_api_post($pdo, ['op' => 'save_type', 'label' => $v, 'def' => []]));
    $out["save_type.field.$i"] = $try(fn() => art_api_post($pdo, ['op' => 'save_type', 'label' => 'S', 'def' => ['groups' => [['key' => 'g', 'label' => $v, 'fields' => [['key' => 'f', 'label' => 'F']]]]]]));
    $out["blocs.kind.$i"] = $try(fn() => blocs_api_post($pdo, ['op' => $v]));
    $out["blocs.title.$i"] = $try(fn() => blocs_api_post($pdo, ['op' => 'save_item', 'person_id' => 1, 'kind' => 'award', 'data' => ['title' => $v]]));
    $out["get.op.$i"] = $try(fn() => art_api_get($pdo, ['op' => $v]));
    $out["get.ids.$i"] = $try(fn() => scene_api_get($pdo, ['op' => 'places', 'ids' => $v]));
    $out["sciences.ids.$i"] = $try(fn() => sciences_api_get($pdo, ['op' => 'coords', 'ids' => $v]));
    $out["sciences_remote.$i"] = $try(fn() => sciences_remote(['source' => $v]));
    $out["artist_remote.$i"] = $try(fn() => artist_remote(['source' => 'discogs', 'what' => 'release', 'id' => $v]));
    $out["picker.q.$i"] = $try(fn() => picker_search($pdo, ['kind' => 'artwork', 'q' => $v]));
}
// une valeur simple (nombre, oui/non) est convertie en texte, sans refus
$out['set_profiles.nombre'] = $try(fn() => art_api_post($pdo, ['op' => 'set_profiles', 'person_id' => 1, 'on' => [['key' => 'u_essai_nb', 'label' => 1925, 'icon' => true]]]));
$out['nb_label'] = $pdo->query("SELECT label || '|' || icon FROM profiles WHERE key='u_essai_nb'")->fetchColumn();
$out['save_item.nombre'] = $try(fn() => art_api_post($pdo, ['op' => 'save_item', 'person_id' => 1, 'kind' => 'work', 'data' => ['title' => 1925, 'credits' => [['pid' => 2, 'role' => 7]]]]));
$out['array_en_base'] = (int) $pdo->query("SELECT (SELECT count(*) FROM profiles WHERE label='Array' OR icon='Array')
    + (SELECT count(*) FROM items WHERE title='Array') + (SELECT count(*) FROM item_people WHERE name='Array' OR role='Array') + (SELECT count(*) FROM type_fields WHERE label='Array' OR group_label='Array')")->fetchColumn();
echo json_encode($out, JSON_UNESCAPED_UNICODE);`);
for (const [k, v] of Object.entries(shape)) {
    if (['nb_label', 'array_en_base', 'set_profiles.nombre', 'save_item.nombre'].includes(k)) continue;
    assert.equal(v, 'refus', `${k} : un tableau à la place d'un texte est refusé clairement (${v})`);
}
assert.equal(shape['set_profiles.nombre'], 'ok');
assert.equal(shape.nb_label, '1925|1', 'un nombre devient du texte');
assert.equal(shape['save_item.nombre'], 'ok');
assert.equal(shape.array_en_base, 0, 'jamais « Array » dans la base');

// ── 4. import en ligne lent pendant un enregistrement ─────────────────────────────────
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
(async () => {
    const socks = [];
    const hang = net.createServer(s => socks.push(s)); // un « proxy » qui ne répond jamais : le site paraît très lent
    await new Promise(r => hang.listen(0, '127.0.0.1', r));
    const port = await freePort();
    const srvEnv = { ...env, HTTPS_PROXY: `http://127.0.0.1:${hang.address().port}`, https_proxy: `http://127.0.0.1:${hang.address().port}`, NO_PROXY: '', no_proxy: '', ALL_PROXY: '', all_proxy: '', PHP_CLI_SERVER_WORKERS: '4' };
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: srvEnv, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        let cookie = '';
        const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
        const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
        const post = (action, body) => fetch(base + 'api.php?action=' + action, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) })
            .then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
        const remote = post('sciences_remote', { source: 'crossref', dois: '10.1038/251123a0' });
        while (!socks.length) await new Promise(r => setTimeout(r, 50)); // l'import attend le site
        const t0 = Date.now();
        const saved = await post('save_person', { id: 2, first_name: 'Louise', last_name: 'Borie', occupation: 'institutrice' });
        const waited = Date.now() - t0;
        assert.equal(saved.status, 200, JSON.stringify(saved.body));
        assert.ok(waited < 2500, `l'enregistrement n'attend pas la fin de l'import (${waited} ms)`);
        const r = await remote;
        assert.equal(r.status, 200);
        assert.equal(r.body.result.items.length, 0);
        assert.equal(r.body.result.errors.length, 1, 'le site injoignable est signalé');
        const bad = await post('sciences_remote', { source: 'nope' });
        assert.equal(bad.status, 422);
        // par le vrai serveur : 422 (pas 500) pour une demande de lecture ou d'écriture de mauvaise forme
        for (const [act, body] of [['art_write', { op: 'set_profiles', person_id: 1, on: [{ key: 'u_zz', label: ['a'] }] }], ['blocs_write', { op: { a: 1 } }], ['puzzle_write', { op: ['save'] }], ['sciences_remote', { source: ['crossref'] }]]) {
            const r = await post(act, body);
            assert.equal(r.status, 422, `${act} : ${JSON.stringify(r.body)}`);
            assert.match(r.body.error, /Donnée incorrecte/);
        }
        for (const qs of ['action=art&op[]=boot', 'action=blocs&op=boot&scope[a]=1', 'action=scene&op=places&ids[]=1', 'action=sciences&op=coords&ids[]=1', 'action=picker_search&kind=artwork&q[]=x']) {
            const r = await fetch(base + 'api.php?' + qs, { headers: { Cookie: cookie } });
            assert.equal(r.status, 422, qs);
        }
        console.log(`✓ moteur des fiches côté serveur : migration n°47 tout ou rien (2 000 fiches en ${Math.round(migrated.ms)} ms), fiches d'une personne supprimée cachées puis revenues, liens de sorte filtrés, données de mauvaise forme refusées (422), import lent sans bloquer (${waited} ms)`);
    } finally {
        proc.kill(); hang.close(); socks.forEach(s => s.destroy());
        fs.rmSync(dir, { recursive: true, force: true });
    }
})().catch(e => { console.error(e); process.exit(1); });
