'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de lib/heritage_more.php :   npm run test:more
 * Actes à demander, crises historiques, copie chiffrée (coffre), âges et écarts, variantes, lieux mal placés,
 * tailles, résistants, éditeur de blocs, comparaison avant fusion, étiquettes des blocs.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-more-'));
const code = String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
$pdo = db();
$src = file_get_contents('api.php');
foreach (['function person_select', 'function set_label_links', 'function labels_for_entity', 'function allowed_label_entity_types', 'function save_courrier', 'function courrier_organismes', 'function courrier_statuts', 'function courrier_compute_relance'] as $fn) { $a = strpos($src, $fn); $b = strpos($src, "\n}\n", $a); if (!function_exists(substr($fn, 9))) eval(substr($src, $a, $b - $a + 3)); }
$out = ['version' => (int) $pdo->query('PRAGMA user_version')->fetchColumn()];
$pdo->exec("INSERT INTO persons(first_name,last_name,gender,occupation,height_text) VALUES
  ('Pierre','Dupont','male','Laboureur','1 m 62'),('Jeanne','Martin','female','laboureur',''),('Louis','Dupont','male','labour.','165 cm'),
  ('Marie','Dupont','female','Labourreur','1,58'),('Paul','DUPONT','male','',''),('Lucie','Dupont','female','','')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(name,county,country,latitude,longitude) VALUES('Lille','Nord','France',50.63,3.06),('Roubaix','Nord','France',3.17,50.69),('Paris','Paris','France',48.85,2.35)");
// Pierre (1) × Jeanne (2) ; enfants Louis (3) et Marie (4), Lucie (6) née 2 ans après la mort de Pierre
$pdo->exec("INSERT INTO families(partner1_id,partner2_id) VALUES(1,2)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,3),(1,4),(1,6)");
$pdo->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES
  ('person',1,{$t('BIRT')},'3 mars 1800',1800,1),('person',2,{$t('BIRT')},'1 janvier 1780',1780,1),('person',3,{$t('BIRT')},'10 mai 1838',1838,1),
  ('person',4,{$t('BIRT')},'1 août 1838',1838,2),('person',1,{$t('DEAT')},'2 juillet 1832',1832,1),('person',6,{$t('BIRT')},'5 mai 1836',1836,1),
  ('person',5,{$t('BIRT')},'4 avril 1990',1990,3)");
$pdo->exec("INSERT INTO events(scope,family_id,event_type_id,date_text,year,place_id) VALUES('family',1,{$t('MARR')},'1 février 1825',1825,1)");

// Actes à demander
$acts = recent_acts($pdo);
$out['acts'] = array_map(fn($a) => [$a['kind'], $a['public'], $a['open_at']], $acts);
$letter = act_request_letter($pdo, (int) $acts[0]['event_id'], 'Victor B.', 'descendant');
$out['letter'] = [str_contains($letter['letter'], 'Paul DUPONT'), str_contains($letter['letter'], 'copie intégrale'), str_contains($letter['destinataire'], 'Paris')];
$req = create_act_request($pdo, ['event_id' => $acts[0]['event_id'], 'remind_open' => 1]);
$out['request'] = [$req['reminder'], (int) $pdo->query('SELECT event_id FROM courriers WHERE id=' . $req['courrier_id'])->fetchColumn() === (int) $acts[0]['event_id'], (int) $pdo->query('SELECT count(*) FROM standalone_reminders')->fetchColumn()];
$out['acts_after'] = recent_acts($pdo)[0]['courrier_id'] === $req['courrier_id'];

// Crises : Pierre meurt en 1832 (choléra)
$ctx = historical_context($pdo);
$cholera = array_values(array_filter($ctx['crises'], fn($c) => $c['title'] === 'Choléra de 1832'))[0] ?? null;
$out['cholera'] = $cholera ? array_map(fn($v) => (int) $v['person']['id'], $cholera['victims']) : null;

// Coffre : chiffrer, relire, mauvais mot de passe refusé
$plain = DATA_DIR . '/plain.bin'; file_put_contents($plain, random_bytes(2500000) . 'FIN');
vault_encrypt_file($plain, DATA_DIR . '/c.coffre', 'motdepasse123', ['owner' => 'Victor']);
$out['vault_header'] = vault_read_header(DATA_DIR . '/c.coffre')['owner'];
vault_decrypt_file(DATA_DIR . '/c.coffre', DATA_DIR . '/back.bin', 'motdepasse123');
$out['vault_roundtrip'] = hash_file('sha256', $plain) === hash_file('sha256', DATA_DIR . '/back.bin');
try { vault_decrypt_file(DATA_DIR . '/c.coffre', DATA_DIR . '/bad.bin', 'mauvais!!'); $out['vault_bad'] = 'accepté'; } catch (Throwable $e) { $out['vault_bad'] = file_exists(DATA_DIR . '/bad.bin') ? 'fichier écrit' : 'refusé'; }
$out['vault_v2'] = [file_get_contents(DATA_DIR . '/c.coffre', false, null, 0, 15) === VAULT_MAGIC2, vault_read_header(DATA_DIR . '/c.coffre')['kdf_params']['kdf'] ?? ''];
// une ancienne copie (version 1, PBKDF2 à 200 000 tours) s'ouvre toujours
$salt = random_bytes(16); $iv = random_bytes(16); [$k1, $m1] = vault_keys('ancienmotdepasse', $salt);
$head = VAULT_MAGIC . json_encode(['owner' => 'Ancien', 'salt' => base64_encode($salt), 'iv' => base64_encode($iv)]) . "\n";
$body = openssl_encrypt('vieille base', 'aes-256-ctr', $k1, OPENSSL_RAW_DATA, $iv);
file_put_contents(DATA_DIR . '/v1.coffre', $head . $body . hash_hmac('sha256', $head . $body, $m1, true));
vault_decrypt_file(DATA_DIR . '/v1.coffre', DATA_DIR . '/v1.bin', 'ancienmotdepasse');
$out['vault_v1'] = file_get_contents(DATA_DIR . '/v1.bin');
// en-tête trafiqué (réglages affaiblis) ou fichier coupé : refusés
$raw = file_get_contents(DATA_DIR . '/c.coffre');
file_put_contents(DATA_DIR . '/weak.coffre', preg_replace('/"kdf_params":\{[^}]*\}/', '"kdf_params":{"kdf":"pbkdf2-sha256","iter":1}', $raw, 1));
try { vault_decrypt_file(DATA_DIR . '/weak.coffre', DATA_DIR . '/weak.bin', 'motdepasse123'); $out['vault_weak'] = 'accepté'; } catch (Throwable $e) { $out['vault_weak'] = 'refusé'; }
file_put_contents(DATA_DIR . '/cut.coffre', substr($raw, 0, -1000));
try { vault_decrypt_file(DATA_DIR . '/cut.coffre', DATA_DIR . '/cut.bin', 'motdepasse123'); $out['vault_cut'] = 'accepté'; } catch (Throwable $e) { $out['vault_cut'] = 'refusé'; }

// Âges et écarts
$ages = age_checks($pdo);
$out['ages'] = array_values(array_unique(array_map(fn($a) => preg_replace('/\d+([.,]\d+)?/', 'N', $a['text']), $ages['alerts'])));

// Variantes
$groups = variant_groups($pdo, 'occupation');
$out['variants'] = $groups ? [$groups[0]['proposal'], count($groups[0]['variants'])] : null;
$out['apply'] = apply_variants($pdo, ['field' => 'occupation', 'target' => 'laboureur', 'values' => ['Laboureur', 'labour.', 'Labourreur']])['changed'];
$out['occupations'] = $pdo->query("SELECT DISTINCT occupation FROM persons WHERE occupation<>''")->fetchAll(PDO::FETCH_COLUMN);
$pdo->exec("INSERT INTO persons(first_name,last_name,occupation) VALUES('Jean','X',''),('Jeanne','X',''),('Louis','X',''),('Louise','X','laboureur ')");
$out['firstnames'] = array_map(fn($g) => array_column($g['variants'], 'value'), variant_groups($pdo, 'first_name'));
$hv = apply_variants($pdo, ['field' => 'occupation', 'target' => 'Laboureur', 'values' => ['laboureur']]);
$out['trim'] = [$hv['changed'], (int) $pdo->query("SELECT count(*) FROM persons WHERE occupation='Laboureur'")->fetchColumn()];
$hist = harmonize_history($pdo);
$out['undo'] = [undo_harmonize($pdo, ['id' => $hist[0]['id']])['restored'], (int) $pdo->query("SELECT count(*) FROM persons WHERE occupation='Laboureur'")->fetchColumn(), harmonize_history($pdo)[0]['undoable']];
$names = variant_groups($pdo, 'last_name');
$out['names'] = $names[0]['proposal'] ?? null;

// Lieux mal placés : Roubaix a latitude et longitude inversées ; Cayenne (Guyane) est bien en France
$pdo->exec("INSERT INTO places(name,county,country,latitude,longitude) VALUES('Cayenne','Guyane','France',4.9333,-52.3333)");
$pdo->prepare('INSERT INTO events(scope,person_id,event_type_id,place_id) VALUES(?,1,(SELECT min(id) FROM event_types),?)')->execute(['person', $cayenne = (int) $pdo->lastInsertId()]);
$sus = suspicious_places($pdo);
$pdo->exec('DELETE FROM events WHERE place_id=' . $cayenne); $pdo->exec('DELETE FROM places WHERE id=' . $cayenne);
$out['misplaced'] = array_map(fn($a) => [$a['place']['name'], $a['suggest']['why'] ?? null], $sus['alerts']);
fix_place($pdo, ['id' => 2, 'lat' => $sus['alerts'][0]['suggest']['lat'], 'lon' => $sus['alerts'][0]['suggest']['lon']]);
$out['misplaced_after'] = count(suspicious_places($pdo)['alerts']);

// Tailles
$out['heights'] = [parse_height('1 m 65'), parse_height('1m6'), parse_height('165 cm'), parse_height('1,72 m'), parse_height('grande')];
$out['heights_people'] = count(heights_data($pdo)['people']);

// Résistant : Paul, arrêté avec Lucie
save_resistance($pdo, ['person_id' => 5, 'profile' => ['nom_de_guerre' => 'Max', 'arrested' => 1], 'steps' => [['date_start' => '1943-03-12', 'kind' => 'arrestation', 'place_text' => 'Lille', 'lat' => 50.63, 'lon' => 3.06, 'linked_person_id' => 6], ['date_start' => '1943-01-01', 'kind' => 'cache', 'place_text' => 'ferme']]]);
$r = resistance_data($pdo, 5);
$out['resistance'] = [$r['profile']['nom_de_guerre'], array_column($r['steps'], 'kind'), (int) $pdo->query('SELECT show_resistance_block FROM persons WHERE id=5')->fetchColumn(), count(resistance_data($pdo, 6)['cited_in'])];

// Éditeur de blocs : modèle, fiche remplie, info tirée d'une fiche, partage
$def = save_custom_block_def($pdo, ['name' => 'Décorations', 'icon' => '🎖️', 'fields' => [['key' => 'nom', 'type' => 'text', 'label' => 'Décoration', 'required' => true], ['key' => 'qui', 'type' => 'person', 'label' => 'Remise par'], ['key' => 'naiss', 'type' => 'person_info', 'label' => 'Naissance du remettant', 'info' => 'birth', 'from' => 'qui'], ['key' => 'ou', 'type' => 'place', 'label' => 'Lieu'], ['key' => 'x', 'type' => 'bidon']]]);
try { save_custom_block_entry($pdo, ['block_id' => $def['id'], 'person_id' => 3, 'data' => []]); $out['required'] = 'accepté'; } catch (Throwable $e) { $out['required'] = 'refusé'; }
$entry = save_custom_block_entry($pdo, ['block_id' => $def['id'], 'person_id' => 3, 'data' => ['nom' => 'Croix de guerre', 'qui' => 1, 'ou' => ['text' => 'Lille', 'lat' => 50.6, 'lon' => 3.0]], 'pending_labels' => []]);
$blocks = custom_blocks_for_person($pdo, 3);
$e0 = $blocks[0]['entries'][0];
$out['custom'] = [count($blocks[0]['fields']), $e0['data']['nom'], $e0['data']['naiss'], $e0['people']['qui']['first_name'], $blocks[0]['flagged']];
$pdo->exec("INSERT INTO labels(name,color) VALUES('À vérifier','#cc0000')");
apply_pending_labels($pdo, 'save_custom_block_entry', ['pending_labels' => [1]], ['id' => $entry['id']]);
apply_pending_labels($pdo, 'save_resistance', ['person_id' => 5, 'pending_labels' => '[1]'], ['ok' => true]);
$out['labels'] = [count(custom_blocks_for_person($pdo, 3)[0]['entries'][0]['labels']), count(resistance_data($pdo, 5)['labels'])];
$v = save_voyage($pdo, ['person_id' => 1, 'departure_port' => 'Le Havre']);
apply_pending_labels($pdo, 'save_voyage', ['pending_labels' => [1]], $v);
$out['voyage_labels'] = array_column(voyages_data($pdo, 1)[0]['labels'], 'name');
$uid = $pdo->query('SELECT uid FROM custom_block_defs')->fetchColumn();
$imp = import_custom_block_def($pdo, ['block' => ['format' => 'lcnda-block', 'uid' => $uid, 'name' => 'Décorations v2', 'fields' => [['key' => 'nom', 'type' => 'text', 'label' => 'Nom']]]]);
$imp2 = import_custom_block_def($pdo, ['block' => ['format' => 'lcnda-block', 'uid' => 'autre', 'name' => 'Maison', 'fields' => [['type' => 'place', 'label' => 'Adresse']]]]);
$out['import'] = [$imp['updated'], $imp2['updated'], count(custom_blocks_defs($pdo))];
try { import_custom_block_def($pdo, ['json' => '{"a":1}']); $out['import_bad'] = 'accepté'; } catch (Throwable $e) { $out['import_bad'] = 'refusé'; }
set_custom_block_flags($pdo, ['person_id' => 4, 'block_ids' => [$imp2['id']]]);
$out['flags'] = array_map(fn($b) => $b['flagged'], custom_blocks_for_person($pdo, 4));

// Mes listes : divorces/mariages entre deux dates, colonne à remplir, retrait à la main, critères OU
$mar = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='MARR' LIMIT 1")->fetchColumn();
$ml = save_my_list($pdo, ['name' => 'Mariages', 'source' => 'events', 'definition' => ['rules' => [['field' => 'event_type', 'values' => [$mar]], ['field' => 'year', 'from' => 1800, 'to' => 1850]], 'columns' => ['date', 'who', 'age'], 'custom' => [['label' => 'Fait', 'type' => 'checkbox']]]]);
$rows = my_list_rows($pdo, $ml['id'])['rows'];
$out['mylist'] = [count($rows), count($rows[0]['people'] ?? []), $rows[0]['cells']['age'] ?? null];
save_my_list_row($pdo, ['list_id' => $ml['id'], 'row_key' => $rows[0]['key'], 'field' => my_lists($pdo)[0]['definition']['custom'][0]['key'], 'value' => '1']);
$out['mylist_value'] = array_values(my_list_rows($pdo, $ml['id'])['rows'][0]['values']);
save_my_list_row($pdo, ['list_id' => $ml['id'], 'row_key' => $rows[0]['key'], 'included' => -1]);
$out['mylist_removed'] = count(my_list_rows($pdo, $ml['id'])['rows']);
$any = save_my_list($pdo, ['name' => 'OU', 'source' => 'persons', 'definition' => ['match' => 'any', 'rules' => [['field' => 'first_name', 'value' => 'Lucie'], ['field' => 'first_name', 'value' => 'Pierre']]]]);
$out['mylist_any'] = array_map(fn($r) => $r['people'][0]['first_name'], my_list_rows($pdo, $any['id'])['rows']);
$out['widget_rows'] = [array_map(fn($r) => $r['people'][0]['first_name'], widget_rows($pdo, ['source' => 'persons', 'definition' => ['match' => 'any', 'rules' => [['field' => 'first_name', 'value' => 'Lucie'], ['field' => 'first_name', 'value' => 'Pierre']]]])['rows']),
    count(widget_rows($pdo, ['list_id' => $any['id']])['rows']), isset(widget_rows($pdo, ['source' => 'places'])['columns']['name']), widget_rows($pdo, ['source' => 'free'])['list']['source'],
    widget_rows($pdo, ['source' => 'persons', 'count' => 1, 'definition' => ['match' => 'any', 'rules' => [['field' => 'first_name', 'value' => 'Lucie'], ['field' => 'first_name', 'value' => 'Pierre']]]])['count'],
    widget_rows($pdo, ['source' => 'places', 'count' => 1])['count'] === count(widget_rows($pdo, ['source' => 'places'])['rows'])];
$free = save_my_list($pdo, ['name' => 'Salon', 'source' => 'free', 'definition' => ['custom' => [['label' => 'Stand', 'type' => 'text'], ['label' => 'Ancêtre', 'type' => 'person']]]]);
$fdef = my_lists($pdo); $fdef = array_values(array_filter($fdef, fn($l) => $l['id'] === $free['id']))[0]['definition']['custom'];
$k1 = save_my_list_row($pdo, ['list_id' => $free['id'], 'row_key' => 'f:new'])['row_key'];
save_my_list_row($pdo, ['list_id' => $free['id'], 'row_key' => $k1, 'field' => $fdef[0]['key'], 'value' => 'Cercle du Nord']);
save_my_list_row($pdo, ['list_id' => $free['id'], 'row_key' => $k1, 'field' => $fdef[1]['key'], 'value' => '1']);
$k2 = save_my_list_row($pdo, ['list_id' => $free['id'], 'row_key' => 'f:new'])['row_key'];
save_my_list_row($pdo, ['list_id' => $free['id'], 'row_key' => $k2, 'included' => -1]);
$fr = my_list_rows($pdo, $free['id'])['rows'];
$out['free'] = [count($fr), $fr[0]['values'][$fdef[0]['key']], $fr[0]['linked'][$fdef[1]['key']]['first_name'] ?? null, $k1, $k2];
try { save_my_list($pdo, ['name' => 'Vide', 'source' => 'free', 'definition' => []]); $out['free_empty'] = 'accepté'; } catch (Throwable $e) { $out['free_empty'] = 'refusé'; }

// Éditeur de listes : liste de fiches (formulaire à soi, étapes à cocher, à faire / faits)
$rl = save_my_list($pdo, ['name' => 'Circuits', 'source' => 'records', 'definition' => ['fields' => [['type' => 'text', 'label' => 'Nom', 'key' => 'nom', 'required' => true], ['type' => 'heading', 'label' => 'Pour qui ?'], ['type' => 'people', 'label' => 'Personnes', 'key' => 'qui'],
    ['type' => 'select', 'label' => 'Priorité', 'key' => 'prio', 'options' => ['Haute', 'Basse']], ['type' => 'steps', 'label' => 'Étapes', 'key' => 'etapes', 'item' => 'Étape', 'fields' => [['type' => 'text', 'label' => 'Titre', 'key' => 'titre'], ['type' => 'place', 'label' => 'Lieu', 'key' => 'lieu'], ['type' => 'bidon', 'label' => 'X']]], ['type' => 'script', 'label' => 'pirate']], 'record' => ['new' => '+ Circuit']]]);
$rec = save_my_list_record($pdo, ['list_id' => $rl['id'], 'data' => ['nom' => 'Nord', 'qui' => [1, 5, 999999, 'x'], 'prio' => 'Inventée', 'etapes' => [['titre' => 'Archives', 'lieu' => ['text' => 'Lille'], 'done' => 1], ['titre' => 'Église'], ['titre' => '', 'lieu' => ['text' => '']]]], 'no_geocode' => 1]);
set_my_list_record_step($pdo, ['id' => $rec['id'], 'field' => 'etapes', 'index' => 1, 'done' => 1]);
$rr = my_list_rows($pdo, $rl['id']);
try { save_my_list_record($pdo, ['list_id' => $rl['id'], 'data' => ['nom' => '']]); $out['rec_required'] = 'accepté'; } catch (Throwable $e) { $out['rec_required'] = 'refusé'; }
set_my_list_record_status($pdo, ['id' => $rec['id'], 'status' => 'done']);
$rr2 = my_list_rows($pdo, $rl['id']);
$exp = export_my_list($pdo, $rl['id']);
$imp = import_my_list($pdo, ['json' => json_encode($exp)]);
delete_my_list($pdo, ['id' => $rl['id']]);
$out['records'] = ['fields' => array_column($rr['list']['definition']['fields'], 'type'), 'steps' => array_map(fn($f) => count($f['fields'] ?? []), $rr['list']['definition']['fields']), 'new' => $rr['list']['definition']['record']['new'],
    'row' => [$rr['rows'][0]['data']['qui'], $rr['rows'][0]['data']['prio'], count($rr['rows'][0]['data']['etapes']), $rr['rows'][0]['steps'], $rr['rows'][0]['steps_done']], 'counts' => [$rr['counts'], $rr2['counts']],
    'export' => [count($exp['rows']), isset($exp['rows'][0]['data']['qui'])], 'import' => $imp['rows'], 'left' => (int) $pdo->query('SELECT count(*) FROM custom_list_records WHERE list_id=' . $rl['id'])->fetchColumn()];

// Bloc avec un « Parcours jour par jour » : réglages gardés, étapes nettoyées (lieu placé, étape vide retirée)
$jd = save_custom_block_def($pdo, ['name' => 'Parcours', 'fields' => [['key' => 'par', 'type' => 'journey', 'label' => 'Parcours', 'jSource' => 'manual', 'jLayout' => 'cards', 'jDays' => false], ['key' => 'vie', 'type' => 'journey', 'label' => 'Sa vie', 'jSource' => 'person', 'jLayout' => 'bidon']]]);
$jdef = array_values(array_filter(custom_blocks_defs($pdo), fn($b) => $b['id'] === $jd['id']))[0];
save_custom_block_entry($pdo, ['block_id' => $jd['id'], 'person_id' => 1, 'data' => ['par' => [['date' => '3 mars 1943', 'title' => 'Arrestation', 'place' => 'Lille', 'color' => '#cc0000', 'emoji' => '🚔'], ['date' => '', 'title' => '', 'place' => ''], ['title' => 'Évasion', 'color' => 'red']]]]);
$je = array_values(array_filter(custom_blocks_for_person($pdo, 1), fn($b) => $b['id'] === $jd['id']))[0]['entries'][0]['data']['par'];
$out['journey_block'] = [array_map(fn($f) => [$f['jSource'], $f['jLayout'], $f['jDays'], $f['jMap']], $jdef['fields']), count($je), $je[0]['title'], $je[0]['lat'] !== null, $je[1]['color']];

// Comparaison avant fusion
$cmp = compare_people($pdo, 1, 5);
$out['compare'] = [$cmp['a']['person']['first_name'], count($cmp['a']['events']) > 0, $cmp['a']['children']];
echo json_encode($out, JSON_UNESCAPED_UNICODE);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());
const checks = [
  ['bloc « Parcours jour par jour » : réglages gardés, étapes nettoyées (lieu placé, étape vide retirée, couleur invalide)', () => assert.deepEqual(out.journey_block, [[['manual', 'cards', false, true], ['person', 'vertical', true, true]], 2, 'Arrestation', true, ''])],
  ['éditeur de listes : formulaire nettoyé (sortes inconnues retirées, étapes avec leurs champs)', () => { assert.deepEqual(out.records.fields, ['text', 'heading', 'people', 'select', 'steps']); assert.equal(out.records.steps[4], 2); assert.equal(out.records.new, '+ Circuit'); }],
  ['éditeur de listes : fiche enregistrée (personnes inexistantes et choix inventé retirés, lignes vides ignorées, étapes cochées)', () => assert.deepEqual(out.records.row, [[1, 5], '', 2, 2, 2])],
  ['éditeur de listes : champ obligatoire, à faire / faits, partage sans les personnes, suppression', () => { assert.equal(out.rec_required, 'refusé'); assert.deepEqual(out.records.counts, [{todo: 1, done: 0}, {todo: 0, done: 1}]); assert.deepEqual(out.records.export, [1, false]); assert.equal(out.records.import, 1); assert.equal(out.records.left, 0); }],
  ['structure à jour (n°42)', () => assert.equal(out.version, 42)],
  ['actes de moins de 100 ans, réservés jusqu’à 75 ans', () => { assert.deepEqual(out.acts.map(a => a[0]), ['naissance']); assert.equal(out.acts[0][1], false); assert.equal(out.acts[0][2], '2065-04-04'); }],
  ['lettre de demande à la mairie', () => assert.deepEqual(out.letter, [true, true, true])],
  ['courrier créé, relié à l’acte, rappel à l’ouverture', () => { assert.deepEqual(out.request, [true, true, 1]); assert.equal(out.acts_after, true); }],
  ['choléra de 1832 : décès de la famille retrouvé', () => assert.deepEqual(out.cholera, [1])],
  ['coffre : en-tête lisible, données chiffrées puis rendues à l’identique', () => { assert.equal(out.vault_header, 'Victor'); assert.equal(out.vault_roundtrip, true); }],
  ['coffre : mauvais mot de passe refusé sans rien écrire', () => assert.equal(out.vault_bad, 'refusé')],
  ['coffre : nouvelles copies en version 2 (Argon2id), anciennes copies toujours lisibles, en-tête affaibli ou fichier coupé refusés', () => { assert.deepEqual(out.vault_v2, [true, 'argon2id']); assert.equal(out.vault_v1, 'vieille base'); assert.equal(out.vault_weak, 'refusé'); assert.equal(out.vault_cut, 'refusé'); }],
  ['âges : naissance après le décès du père, mère trop âgée, écart trop court', () => { for (const t of ['Né(e) N ans après le décès du père', 'Mère de N ans à la naissance', 'Seulement N mois après son aîné(e)']) assert.ok(out.ages.includes(t), t + ' absent : ' + out.ages.join(' / ')); }],
  ['variantes de métier regroupées (4 écritures)', () => assert.deepEqual(out.variants, ['laboureur', 4])],
  ['harmonisation appliquée', () => { assert.equal(out.apply, 3); assert.deepEqual(out.occupations, ['laboureur']); }],
  ['prénoms : Jean ≠ Jeanne, Louis ≠ Louise', () => assert.deepEqual(out.firstnames, [])],
  ['harmonisation : valeur avec espace en trop comprise', () => assert.deepEqual(out.trim, [5, 5])],
  ['harmonisation annulée', () => assert.deepEqual(out.undo, [5, 0, false])],
  ['DUPONT / Dupont : forme proposée', () => assert.equal(out.names, 'Dupont')],
  ['lieu aux coordonnées inversées repéré puis corrigé', () => { assert.deepEqual(out.misplaced, [['Roubaix', 'Inverser latitude et longitude']]); assert.equal(out.misplaced_after, 0); }],
  ['tailles lues dans toutes les écritures', () => { assert.deepEqual(out.heights, [1.65, 1.6, 1.65, 1.72, null]); assert.equal(out.heights_people, 3); }],
  ['résistant : profil, étapes dans l’ordre, case cochée, « cité dans »', () => assert.deepEqual(out.resistance, ['Max', ['cache', 'arrestation'], 1, 1])],
  ['bloc personnalisé : champ obligatoire', () => assert.equal(out.required, 'refusé')],
  ['bloc personnalisé : fiche remplie, personne liée, info tirée de sa fiche', () => assert.deepEqual(out.custom, [4, 'Croix de guerre', '3 mars 1800 à Lille', 'Pierre', true])],
  ['étiquettes posées à l’enregistrement d’un bloc', () => { assert.deepEqual(out.labels, [1, 1]); assert.deepEqual(out.voyage_labels, ['À vérifier']); }],
  ['partage de blocs : mise à jour par identifiant, nouveau bloc, fichier refusé', () => { assert.deepEqual(out.import, [true, false, 2]); assert.equal(out.import_bad, 'refusé'); }],
  ['cases « Blocs à afficher sur la fiche » des blocs perso', () => assert.deepEqual(out.flags, [false, true])],
  ['mes listes : mariages 1800–1850, les deux époux, âge', () => assert.deepEqual(out.mylist, [1, 2, '25 ans'])],
  ['widgets à soi : mêmes critères que Mes listes, une liste enregistrée, une liste de l’app (jamais une liste à remplir)', () => { assert.deepEqual(out.widget_rows[0], out.mylist_any); assert.equal(out.widget_rows[1], out.mylist_any.length); assert.equal(out.widget_rows[2], true); assert.equal(out.widget_rows[3], 'persons'); assert.equal(out.widget_rows[4], out.mylist_any.length); assert.equal(out.widget_rows[5], true); }],
  ['mes listes : case cochée gardée, ligne retirée', () => { assert.deepEqual(out.mylist_value, ['1']); assert.equal(out.mylist_removed, 0); }],
  ['mes listes : lignes écrites à la main, ancêtre relié, ligne supprimée', () => { assert.deepEqual(out.free, [1, 'Cercle du Nord', 'Pierre', 'f:1', 'f:2']); assert.equal(out.free_empty, 'refusé'); }],
  ['mes listes : critères OU', () => assert.deepEqual(out.mylist_any.sort(), ['Lucie', 'Pierre'])],
  ['comparaison de deux fiches', () => assert.deepEqual(out.compare, ['Pierre', true, ['Louis Dupont (1838)', 'Marie Dupont (1838)', 'Lucie Dupont (1836)']])],
];
let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); } }
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${checks.length - failed} vérifications réussies${failed ? `, ${failed} échec(s)` : ''}.`);
process.exitCode = failed ? 1 : 0;
