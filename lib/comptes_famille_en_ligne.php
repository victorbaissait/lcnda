<?php
declare(strict_types=1);

/**
 * 👪🌐 Le site familial EN LIGNE : seulement les FONDATIONS (docs/site-familial-en-ligne.md dit ce qui reste à faire).
 *
 * Règle validée : l'ordinateur de l'utilisateur fait foi ; l'en-ligne n'est qu'une COPIE + une BOÎTE AUX LETTRES.
 *  - 🌐 Publier (fc_publish_export) : un paquet .zip SANS AUCUN VIVANT ni fiche ou événement confidentiel (règle de
 *    « 📤 Partager avec la famille », family_share_build + family_share_check, et un contrôle de plus ici) : manifest.json
 *    (format, version, date, nombres, empreinte SHA-256 de chaque fichier), arbre.json, photos/. Les numéros de la base ne
 *    partent pas : chaque fiche a un numéro de copie ; la correspondance reste sur l'ordinateur (table fc_publish).
 *  - 📨 Relever (fc_releve) : un fichier « boîte aux lettres » (JSON) rapporté de l'hébergement ; chaque proposition est relue
 *    comme celles de la maison (fc_read_proposal : mêmes limites, même vie privée) puis rangée « en attente ». Rien n'entre
 *    dans l'arbre sans un clic ici.
 * Pas encore fait (et donc pas livré) : la petite app PHP sur l'hébergement, l'envoi FTPS, les comptes en ligne, « ⛔ Fermer
 * le site », les photos proposées en ligne, les modifications 🌿 faites en ligne.
 */

const FC_PUB_FORMAT = 'lcnda-site-familial';
const FC_BOX_FORMAT = 'lcnda-boite-famille';
const FC_PUB_VERSION = 1;
const FC_RELEVE_MAX = 500;

/** Le paquet à publier (toujours sans les vivants : « jamais en ligne » dans la v1). */
function fc_publish_build(PDO $pdo, array $q): array
{
    if (!function_exists('family_share_build')) { require_once __DIR__ . '/family_share.php'; }
    if (function_exists('private_events_shadow') && !private_events_shadow($pdo)) { throw new RuntimeException('Les événements confidentiels n’ont pas pu être retirés : rien n’a été fabriqué.'); }
    $saved = $_GET['death_cutoff_year'] ?? null; unset($_GET['death_cutoff_year']);
    try {
        $o = fs_options(['living' => 'hide', 'photos' => !empty($q['photos']) && $q['photos'] !== '0' ? '1' : '0', 'docs' => '0', 'notes' => '0', 'title' => is_string($q['title'] ?? null) ? $q['title'] : '']);
        $o['living'] = 'hide'; // jamais « prénom seulement » en ligne
        $pkg = family_share_build($pdo, $o);
    } finally { if ($saved !== null) { $_GET['death_cutoff_year'] = $saved; } }
    family_share_check($pkg);
    // contrôle de plus : aucune fiche marquée vivante, et aucun numéro de copie donné à une personne vivante ou confidentielle
    $hidden = fc_hidden($pdo);
    foreach ($pkg['data']['people'] as $p) { if (!empty($p['lv'])) { throw new RuntimeException('Contrôle : une personne vivante était dans la copie. Rien n’a été fabriqué.'); } }
    foreach ($pkg['num'] ?? [] as $id => $n) { if (isset($hidden[(int) $id])) { throw new RuntimeException('Contrôle : une personne vivante était dans la copie. Rien n’a été fabriqué.'); } }
    return $pkg;
}

function fc_publish_dispatch(PDO $pdo, string $action): never
{
    try {
        @ini_set('memory_limit', '1024M');
        $pkg = fc_publish_build($pdo, $_GET);
        $s = $pkg['summary'];
        $counts = ['people' => (int) $s['people'], 'photos' => (int) $s['photos'], 'living' => 0, 'private' => 0, 'living_left_home' => (int) $s['living_hidden'], 'private_left_home' => (int) $s['private_removed']];
        if ($action === 'fc_publish_preview') { json_response(['ok' => true, 'counts' => $counts, 'zip' => class_exists('ZipArchive')]); }
        if (!class_exists('ZipArchive')) { json_response(['error' => 'Export impossible : l’extension PHP zip manque.'], 500); }
        @set_time_limit(900);
        $token = bin2hex(random_bytes(16));
        $data = $pkg['data'] + ['publication' => $token];
        $tmp = tempnam(sys_get_temp_dir(), 'publier');
        $zip = new ZipArchive();
        if ($zip->open($tmp, ZipArchive::OVERWRITE) !== true) { throw new RuntimeException('Impossible de préparer le fichier.'); }
        $files = [];
        foreach ($pkg['files'] as $i => $f) {
            $big = fs_image_bytes($f['src'], FS_IMG_MAX); $small = fs_image_bytes($f['src'], FS_THUMB_MAX);
            if ($big === null || $small === null) { $data['media'][$i]['gone'] = 1; continue; }
            $files["photos/m{$f['n']}.jpg"] = $big; $files["photos/t{$f['n']}.jpg"] = $small;
        }
        $files['arbre.json'] = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        $manifest = ['format' => FC_PUB_FORMAT, 'version' => FC_PUB_VERSION, 'publication' => $token, 'made' => gmdate('c', fc_now()), 'title' => (string) $data['title'], 'counts' => $counts,
            'files' => array_map(static fn(string $b) => ['sha256' => hash('sha256', $b), 'size' => strlen($b)], $files),
            'boite' => ['format' => FC_BOX_FORMAT, 'version' => FC_PUB_VERSION, 'kinds' => ['fait', 'note', 'personne'], 'fields' => array_keys(FC_FIELDS), 'relations' => FC_RELATIONS]];
        foreach ($files as $n => $b) { $zip->addFromString($n, $b); }
        $zip->addFromString('manifest.json', json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $zip->addFromString('LISEZ-MOI.txt', "Paquet « Publier » du site familial LCNDA (format " . FC_PUB_FORMAT . " v" . FC_PUB_VERSION . ").\r\n\r\n"
            . "Il contient une copie de l’arbre SANS aucune personne vivante, ni fiche ou événement confidentiel.\r\n"
            . "Les numéros des fiches sont ceux de cette copie : la correspondance reste sur l’ordinateur qui l’a fabriquée.\r\n"
            . "La version en ligne (petite app PHP sur ton hébergement) n’est pas encore livrée : voir docs/site-familial-en-ligne.md.\r\n");
        $zip->close();
        $pdo->prepare('INSERT INTO fc_publish(token, made_ts, map_json, counts_json) VALUES(?,?,?,?)')
            ->execute([$token, fc_now(), json_encode(array_flip(array_map('intval', $pkg['num'] ?? []))), json_encode($counts)]);
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="site-familial-' . date('Ymd', fc_now()) . '.zip"');
        header('Content-Length: ' . filesize($tmp));
        header('Cache-Control: no-store, private');
        header('X-Content-Type-Options: nosniff');
        while (ob_get_level() > 0) { ob_end_clean(); }
        readfile($tmp); @unlink($tmp);
        exit;
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], 422);
    }
}

/**
 * 📨 Relever : la boîte aux lettres rapportée de l'hébergement ({format, version, publication, items:[…]}). Chaque élément est relu
 * comme une proposition de la maison, par un compte « en ligne » qui ne voit ni vivant ni fiche confidentielle.
 */
function fc_releve(PDO $pdo, array $d): array
{
    $raw = is_string($d['boite'] ?? null) ? (string) $d['boite'] : '';
    if ($raw === '' || strlen($raw) > 2 * 1024 * 1024) { throw new LcndaBadInput('Fichier de relevé vide ou trop gros (2 Mo au plus).'); }
    $j = json_decode($raw, true);
    if (!is_array($j) || ($j['format'] ?? '') !== FC_BOX_FORMAT || (int) ($j['version'] ?? 0) !== FC_PUB_VERSION) { throw new LcndaBadInput('Ce fichier n’est pas un relevé du site familial.'); }
    $token = is_string($j['publication'] ?? null) ? (string) $j['publication'] : '';
    $s = $pdo->prepare('SELECT map_json FROM fc_publish WHERE token=?'); $s->execute([preg_match('/^[a-f0-9]{32}$/', $token) ? $token : '-']);
    $map = json_decode((string) ($s->fetchColumn() ?: ''), true);
    if (!is_array($map)) { throw new LcndaBadInput('Ce relevé vient d’une publication inconnue de cet ordinateur.'); }
    $items = is_array($j['items'] ?? null) ? array_slice(array_values($j['items']), 0, FC_RELEVE_MAX) : [];
    $added = 0; $skipped = 0; $why = [];
    foreach ($items as $it) {
        if (!is_array($it)) { $skipped++; continue; }
        $who = fc_line($it['compte'] ?? '', 60);
        $kind = is_string($it['kind'] ?? null) ? (string) $it['kind'] : '';
        $num = is_numeric($it['fiche'] ?? null) ? (int) $it['fiche'] : 0;
        $pid = (int) ($map[(string) $num] ?? 0);
        if ($who === '' || !in_array($kind, ['fait', 'note', 'personne'], true) || $pid <= 0) { $skipped++; $why['format'] = ($why['format'] ?? 0) + 1; continue; }
        $pseudo = ['id' => 0, 'name' => '🌐 ' . $who, 'role' => 'proposer', 'scope_kind' => 'tout', 'scope_person' => 0, 'living' => 'caches', 'can_attach' => 0, 'can_notes' => 0];
        $p = ['kind' => $kind, 'person' => $pid, 'field' => $it['field'] ?? ($it['relation'] ?? ''), 'value' => $it['value'] ?? null, 'text' => $it['text'] ?? '', 'comment' => $it['comment'] ?? '',
            'relation' => $it['relation'] ?? '', 'first_name' => $it['first_name'] ?? '', 'last_name' => $it['last_name'] ?? '', 'gender' => $it['gender'] ?? '', 'birth' => $it['birth'] ?? null, 'death' => $it['death'] ?? null];
        try { $r = fc_read_proposal($pdo, $pseudo, $p, false); }
        catch (FcRefuse $e) { $skipped++; $why['refus'] = ($why['refus'] ?? 0) + 1; continue; }
        $newJson = json_encode($r['new'], JSON_UNESCAPED_UNICODE);
        $dup = $pdo->prepare("SELECT 1 FROM fc_proposals WHERE origin='en_ligne' AND account_name=? AND person_id=? AND kind=? AND field=? AND new_json=?");
        $dup->execute([$pseudo['name'], $pid, $r['kind'], $r['field'], $newJson]);
        if ($dup->fetchColumn()) { $skipped++; $why['deja'] = ($why['deja'] ?? 0) + 1; continue; }
        $pdo->prepare("INSERT INTO fc_proposals(account_id, account_name, origin, device_name, created_ts, kind, person_id, field, old_json, new_json, comment, status) VALUES(0,?,'en_ligne','',?,?,?,?,?,?,?,'attente')")
            ->execute([$pseudo['name'], fc_now(), $r['kind'], $pid, $r['field'], json_encode($r['old'], JSON_UNESCAPED_UNICODE), $newJson, $r['comment']]);
        fc_journal_add($pdo, ['id' => 0, 'name' => $pseudo['name']], 'proposition', $pid, fc_label($pdo, $pid), fc_prop_summary($r['kind'], $r['field'], $r['old'], $r['new']), (int) $pdo->lastInsertId(), '🌐');
        $added++;
    }
    return ['added' => $added, 'skipped' => $skipped, 'why' => $why];
}
