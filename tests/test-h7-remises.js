'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * H7 « supprimer puis ↶ Annuler » (harmonisation des comportements, 27/11) :   node tests/test-h7-remises.js
 * Les suppressions qui posaient encore « Es-tu sûr ? » sont gardées dans le journal juste avant (undo_keep, lib/bootstrap.php)
 * et restore_last_delete les remet (api.php). Vrai serveur « php -S », base neuve, données inventées (MAZAUD, LACOMBE, DURAND).
 * Pour chaque sorte : supprimer → c'est parti ; ↶ Annuler → tout revient (lignes liées, étiquettes, cases) ; un deuxième
 * ↶ Annuler → « déjà remis » (pas de doublon). Et le code des écrans ne pose plus la question.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(appRoot, f), 'utf8');
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + (e && e.message || e)); } };

(async () => {
    await t('plus de question avant ces suppressions (le code des écrans)', () => {
        const gone = [
            ['assets/js/heritage-links.js', 'Supprimer cette recherche enregistrée ?'],
            ['assets/js/heritage-links.js', 'Supprimer cette demande ?'],
            ['assets/js/heritage.js', 'Supprimer cette recherche enregistrée ?'],
            ['assets/js/heritage-museum.js', 'Supprimer ce message du livre d’or ?'],
            ['assets/js/heritage-museum.js', 'et tout ce qui y est exposé ?'],
            ['assets/js/heritage-museum.js', 'du musée ?`'],
            ['assets/js/heritage-employers.js', 'Supprimer la fiche de « ${r.name} » ?'],
            ['assets/js/heritage-periodicals.js', "{title: 'Supprimer l’article'"],
            ['assets/js/heritage-records.js', "{title: 'Supprimer la liste'"],
            ['assets/js/heritage-records.js', "{title: 'Supprimer la fiche'"],
            ['assets/js/heritage-recueil-table.js', "{title: 'Supprimer des lignes'"],
            ['assets/js/heritage-recueil-table.js', "{title: 'Supprimer des colonnes'"],
            ['assets/js/heritage-depouillements.js', "{title: 'Supprimer du relevé'"],
            ['assets/js/heritage-more.js', 'Supprimer cette fiche du bloc ?'],
            ['assets/js/heritage-more.js', 'Supprimer cette copie du coffre ?'],
            ['assets/js/heritage-more.js', 'Supprimer cette liste ? (les fiches ne sont pas touchées)'],
            ['assets/js/heritage-more.js', 'Supprimer tout le parcours de résistant de cette fiche ?'],
            ['assets/js/heritage-voters.js', 'Supprimer les cartes d’électeur et les votes de cette fiche ?'],
        ];
        for (const [f, s] of gone) assert.ok(!read(f).includes(s), `${f} demande encore « ${s} »`);
        const types = {'heritage-links.js': ['saved_search', 'help_request'], 'heritage.js': ['saved_search'], 'heritage-museum.js': ['museum_guestbook', 'museum_room', 'museum_item'],
            'heritage-employers.js': ['employer_record'], 'heritage-periodicals.js': ['periodical_article'], 'heritage-more.js': ['my_list', 'custom_block_entry', 'vault_copy', 'resistance'],
            'heritage-records.js': ['my_list_record'], 'heritage-depouillements.js': ['archive_digest_person'], 'heritage-voters.js': ['voter_cards']};
        for (const [f, list] of Object.entries(types)) for (const ty of list) assert.match(read('assets/js/' + f), new RegExp(`type: '${ty}'`), `${f} : ↶ Annuler pour ${ty}`);
        assert.match(read('assets/js/heritage-recueil-table.js'), /undoToast\?\.\(/);
        assert.match(read('api.php'), /function undo_keep_restore\(/);
    });

    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); process.exit(failed ? 1 : 0); }
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-h7r-'));
    const dir = path.join(root, 'data');
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); ${code}`], { cwd: appRoot, encoding: 'utf8', env });
        try { return JSON.parse(String(r.stdout).trim().split('\n').pop()); } catch (_) { throw new Error('PHP : ' + (r.stderr || r.stdout)); } };
    { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; (new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
      if (!String(r.stdout).includes('ok')) { console.error(r.stderr || r.stdout); process.exit(1); } }
    const ids = php(String.raw`
        require_once 'lib/periodicals.php'; require_once 'lib/museum.php'; periodicals_ensure($pdo);
        $pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','MAZAUD','male'),('Marie','LACOMBE','female')");
        $pdo->exec("INSERT INTO labels(name) VALUES('À vérifier')"); $lab = (int) $pdo->lastInsertId();
        $o = [];
        $pdo->exec("INSERT INTO saved_searches(name, criteria) VALUES('Les MAZAUD de Tulle', '{\"last_name\":\"MAZAUD\"}')"); $o['saved_search'] = (int) $pdo->lastInsertId();
        $pdo->exec("INSERT INTO help_requests(person_id, question) VALUES(1, 'Qui sont les parents de Jean MAZAUD ?')"); $o['help_request'] = (int) $pdo->lastInsertId();
        $m = museum_own_id($pdo); $o['museum'] = $m;
        $pdo->exec("INSERT INTO museum_rooms(museum_id, name) VALUES($m, 'Salle DURAND')"); $o['museum_room'] = (int) $pdo->lastInsertId();
        $pdo->exec("INSERT INTO museum_items(room_id, title) VALUES({$o['museum_room']}, 'Portrait de Marie LACOMBE'), ({$o['museum_room']}, 'Montre de Jean')"); $o['museum_item'] = (int) $pdo->lastInsertId();
        $pdo->exec("INSERT INTO museum_guestbook(museum_id, name, message) VALUES($m, 'Paul DURAND', 'Très beau musée')"); $o['museum_guestbook'] = (int) $pdo->lastInsertId();
        $pdo->exec("INSERT INTO employer_records(key, name, data_json) VALUES('forges de tulle', 'Forges de Tulle', '{\"note\":\"1890\"}')"); $o['employer_record'] = (int) $pdo->lastInsertId();
        $pdo->exec("INSERT INTO periodicals(title) VALUES('Bulletin de la Corrèze')"); $per = (int) $pdo->lastInsertId();
        $pdo->exec("INSERT INTO periodical_issues(periodical_id, number) VALUES($per, '12')"); $iss = (int) $pdo->lastInsertId();
        $pdo->exec("INSERT INTO periodical_articles(issue_id, title) VALUES($iss, 'Les LACOMBE meuniers')"); $o['periodical_article'] = (int) $pdo->lastInsertId();
        $pdo->exec("INSERT INTO periodical_links(item_type, item_id, entity_type, entity_id) VALUES('article', {$o['periodical_article']}, 'person', 2)");
        $pdo->exec("INSERT INTO label_links(label_id, entity_type, entity_id) VALUES($lab, 'periodical_article', {$o['periodical_article']})");
        $pdo->exec("INSERT INTO custom_lists(name, source, definition_json) VALUES('Tombes à voir', 'records', '{\"fields\":[{\"key\":\"f1\",\"type\":\"text\",\"label\":\"Nom\"}]}')"); $o['my_list'] = (int) $pdo->lastInsertId();
        $pdo->exec("INSERT INTO custom_list_records(list_id, data_json) VALUES({$o['my_list']}, '{\"f1\":\"Tombe MAZAUD\"}'), ({$o['my_list']}, '{\"f1\":\"Tombe DURAND\"}')"); $o['my_list_record'] = (int) $pdo->lastInsertId();
        $pdo->exec("INSERT INTO label_links(label_id, entity_type, entity_id) VALUES($lab, 'custom_list_record', {$o['my_list_record']})");
        $pdo->exec("INSERT INTO archive_digest_entries(city_name, year_text) VALUES('Tulle', '1906')"); $dig = (int) $pdo->lastInsertId();
        $pdo->exec("INSERT INTO archive_digest_people(archive_digest_id, first_name, last_name) VALUES($dig, 'Pierre', 'DURAND')"); $o['archive_digest_person'] = (int) $pdo->lastInsertId();
        $pdo->exec("INSERT INTO custom_block_defs(uid, name) VALUES('b1', 'Décorations')"); $blk = (int) $pdo->lastInsertId();
        $pdo->exec("INSERT INTO custom_block_entries(block_id, person_id, data_json) VALUES($blk, 1, '{\"x\":\"Croix de guerre\"}')"); $o['custom_block_entry'] = (int) $pdo->lastInsertId();
        @mkdir(vault_dir(), 0777, true); file_put_contents(vault_dir() . '/copie-durand.bin', 'chiffré');
        $pdo->exec("INSERT INTO cousin_vault(owner, filename, size) VALUES('Paul DURAND', 'copie-durand.bin', 7)"); $o['vault_copy'] = (int) $pdo->lastInsertId();
        $pdo->exec("INSERT INTO voter_cards(person_id, commune) VALUES(1, 'Tulle'), (1, 'Brive')"); $pdo->exec("INSERT INTO voter_votes(person_id, election) VALUES(1, 'Législatives')");
        $pdo->exec("UPDATE persons SET show_voter_block=1, show_resistance_block=1 WHERE id=1");
        $pdo->exec("INSERT INTO resistance_profiles(person_id, network) VALUES(2, 'Réseau Corrèze')"); $pdo->exec("INSERT INTO resistance_steps(person_id, kind, place_text) VALUES(2, 'autre', 'Tulle')");
        echo json_encode($o);`);

    const port = Number(process.env.H7R_PORT) || 20341;
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        let cookie = '';
        const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
        const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
        const post = async (action, body) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) }); const j = await r.json().catch(() => ({})); if (r.status !== 200) throw new Error(`${action} → ${r.status} ${JSON.stringify(j)}`); return j.result ?? j; };
        const count = sql => php(`echo json_encode((int) $pdo->query(${JSON.stringify(sql)})->fetchColumn());`);
        const undoTwice = async (type, id) => { const r1 = await post('restore_last_delete', { entity_type: type, entity_id: id }); assert.ok(!r1.already, 'premier ↶ Annuler'); const r2 = await post('restore_last_delete', { entity_type: type, entity_id: id }); assert.equal(r2.already, true, 'deuxième ↶ Annuler : déjà remis'); };
        const check = (name, type, action, body, probes) => t(name, async () => {
            const before = probes.map(count);
            assert.ok(before.every(n => n > 0), 'données de départ ' + JSON.stringify(before));
            await post(action, body);
            assert.deepEqual(probes.map(count).map(n => n > 0), probes.map(() => false), 'supprimé');
            await undoTwice(type, ids[type] ?? body.person_id);
            assert.deepEqual(probes.map(count), before, 'tout est revenu, sans doublon');
        });
        await check('recherche enregistrée', 'saved_search', 'delete_saved_search', { id: ids.saved_search }, [`SELECT count(*) FROM saved_searches WHERE id=${ids.saved_search} AND name='Les MAZAUD de Tulle'`]);
        await check('demande d’entraide', 'help_request', 'delete_help_request', { id: ids.help_request }, [`SELECT count(*) FROM help_requests WHERE id=${ids.help_request}`]);
        await check('œuvre retirée d’une salle du musée', 'museum_item', 'delete_museum_item', { id: ids.museum_item }, [`SELECT count(*) FROM museum_items WHERE id=${ids.museum_item}`]);
        await check('salle du musée, avec ce qui y est exposé', 'museum_room', 'delete_museum_room', { id: ids.museum_room }, [`SELECT count(*) FROM museum_rooms WHERE id=${ids.museum_room}`, `SELECT count(*) FROM museum_items WHERE room_id=${ids.museum_room}`]);
        await check('message du livre d’or', 'museum_guestbook', 'delete_museum_guestbook', { id: ids.museum_guestbook }, [`SELECT count(*) FROM museum_guestbook WHERE id=${ids.museum_guestbook}`]);
        await check('fiche d’employeur', 'employer_record', 'delete_employer_record', { name: 'Forges de Tulle' }, [`SELECT count(*) FROM employer_records WHERE id=${ids.employer_record} AND data_json LIKE '%1890%'`]);
        await check('article de revue (avec ses liens et étiquettes)', 'periodical_article', 'delete_periodical_item', { what: 'article', id: ids.periodical_article },
            [`SELECT count(*) FROM periodical_articles WHERE id=${ids.periodical_article}`, `SELECT count(*) FROM periodical_links WHERE item_type='article' AND item_id=${ids.periodical_article}`, `SELECT count(*) FROM label_links WHERE entity_type='periodical_article' AND entity_id=${ids.periodical_article}`]);
        await check('fiche d’une liste des Registres', 'my_list_record', 'delete_my_list_record', { id: ids.my_list_record }, [`SELECT count(*) FROM custom_list_records WHERE id=${ids.my_list_record}`, `SELECT count(*) FROM label_links WHERE entity_type='custom_list_record' AND entity_id=${ids.my_list_record}`]);
        await check('liste entière (Mes listes, Registres), avec ses fiches', 'my_list', 'delete_my_list', { id: ids.my_list },
            [`SELECT count(*) FROM custom_lists WHERE id=${ids.my_list}`, `SELECT count(*) FROM custom_list_records WHERE list_id=${ids.my_list}`, `SELECT count(*) FROM label_links WHERE entity_type='custom_list_record' AND entity_id=${ids.my_list_record}`]);
        await check('personne d’un dépouillement', 'archive_digest_person', 'delete_archive_digest_person', { id: ids.archive_digest_person }, [`SELECT count(*) FROM archive_digest_people WHERE id=${ids.archive_digest_person} AND last_name='DURAND'`]);
        await check('ligne d’un bloc de la fiche', 'custom_block_entry', 'delete_custom_block_entry', { id: ids.custom_block_entry }, [`SELECT count(*) FROM custom_block_entries WHERE id=${ids.custom_block_entry}`]);
        await check('copie chez un cousin (le fichier reste le temps d’annuler)', 'vault_copy', 'vault_delete', { id: ids.vault_copy }, [`SELECT count(*) FROM cousin_vault WHERE id=${ids.vault_copy}`]);
        await t('… et le fichier chiffré est toujours là', () => assert.equal(php(`echo json_encode(is_file(vault_dir() . '/copie-durand.bin'));`), true));
        await check('cartes d’électeur et votes d’une fiche', 'voter_cards', 'clear_voter_cards', { person_id: 1 },
            ['SELECT count(*) FROM voter_cards WHERE person_id=1', 'SELECT count(*) FROM voter_votes WHERE person_id=1', 'SELECT show_voter_block FROM persons WHERE id=1']);
        await check('parcours de résistant', 'resistance', 'clear_resistance', { person_id: 2 },
            ['SELECT count(*) FROM resistance_profiles WHERE person_id=2', 'SELECT count(*) FROM resistance_steps WHERE person_id=2']);
        await t('rien à remettre si ce à quoi c’était rattaché a disparu', async () => {
            await post('delete_museum_item', { id: ids.museum_item });
            php(`$pdo->exec('DELETE FROM museum_items WHERE room_id=${ids.museum_room}'); $pdo->exec('DELETE FROM museum_rooms WHERE id=${ids.museum_room}'); echo 1;`);
            await assert.rejects(post('restore_last_delete', { entity_type: 'museum_item', entity_id: ids.museum_item }), /salle n’existe plus/);
        });
    } finally {
        proc.kill();
        fs.rmSync(root, { recursive: true, force: true });
    }
    console.log(failed ? `Échec (${failed})` : `✓ H7 remises : ${passed} vérifications`);
    process.exitCode = failed ? 1 : 0;
})();
