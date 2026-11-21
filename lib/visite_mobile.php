<?php
declare(strict_types=1);

/**
 * D 📱 Visite aux archives sur téléphone (maquette docs/design/complements-existants.html, partie D). Le téléphone ne peut pas
 * joindre l'app (elle n'écoute que 127.0.0.1) : tout passe par un fichier, comme le questionnaire des proches.
 *  1. 🗄 Préparer une visite depuis « Que manque-t-il ? » (visite_prepare : une feuille de mission archive_visit_plans, une cote
 *     par ligne archive_visit_items, la personne et la sorte d'acte gardées pour reconnaître l'acte sur place) ;
 *  2. 📱 Emporter (visite_render) : les données de la page .html autonome (fabriquée dans le navigateur par
 *     heritage-complements-core.js : aucune requête, aucune bibliothèque extérieure, texte posé avec textContent). Les vivants
 *     deviennent « Personne vivante » (réglage, ou case à cocher), les fiches confidentielles ne partent jamais ;
 *  3. ⤒ Rapporter (visite_analyze puis visite_import) : le .zip du téléphone (results.json + photos/) lu strictement — taille
 *     bornée, aucun chemin qui sort (pas de « .. » ni de chemin absolu), noms de fichiers sur liste blanche, photos vérifiées sur
 *     leurs premiers octets, JSON aux clés connues, identifiant d'une visite connue et somme de contrôle — puis revu cote par cote :
 *     dépouillements du Journal, médias, pièce reçue du dossier (seulement si la visite est reliée à un dossier). Aucune date ni
 *     aucun lieu n'est écrit sur une fiche. « ↶ Annuler » défait tout (visite_import_undo) ;
 *  4. ⤒ Photos du jour (feuille imprimée + photos du téléphone) : rangées par cote d'après l'heure de prise de vue, corrigées à la main.
 * Mode consultation : ni export ni import (écritures refusées par kiosk_guard). 📜 « Qui a vu quoi » : export et import notés.
 */

const VM_FORMAT = 'lcnda-visite';
const VM_MAX_ZIP = 300 * 1024 * 1024;      // le .zip rapporté
const VM_MAX_JSON = 2 * 1024 * 1024;       // results.json
const VM_MAX_PHOTO = 25 * 1024 * 1024;     // une photo
const VM_MAX_TOTAL = 400 * 1024 * 1024;    // tout le contenu décompressé
const VM_MAX_ENTRIES = 500;
const VM_RESULTS = ['found', 'none', 'partial', 'not_consulted', ''];
const VM_KINDS = ['birth', 'marriage', 'death', 'contract', 'succession', 'census', 'military', 'parents', 'other', ''];

function vm_plan(PDO $pdo, int $id): array
{
    $p = archive_visit_plan_row($pdo, $id);
    if (!$p) { throw new RuntimeException('Feuille de mission introuvable.'); }
    return $p;
}
function vm_items(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM archive_visit_items WHERE visit_id=? ORDER BY id'); $s->execute([$id]);
    return $s->fetchAll(PDO::FETCH_ASSOC);
}
function vm_json(string $s): array { $j = json_decode($s, true); return is_array($j) ? $j : []; }
/** La somme de contrôle de la page emportée : liée à son identifiant (jamais aux cotes : une cote retirée depuis reste reconnue). */
function vm_sum(string $uid): string { return substr(hash('sha256', 'lcnda-visite|' . $uid), 0, 32); }
/** La même somme que la page du téléphone : FNV-1a 32 bits sur les unités UTF-16 du JSON (comme JSON.stringify). */
function vm_fnv(string $s): string
{
    $u = (string) mb_convert_encoding($s, 'UTF-16BE', 'UTF-8');
    $h = 0x811c9dc5;
    for ($i = 0, $n = strlen($u); $i + 1 < $n; $i += 2) { $h ^= (ord($u[$i]) << 8) | ord($u[$i + 1]); $h = ($h * 16777619) & 0xFFFFFFFF; }
    return str_pad(dechex($h), 8, '0', STR_PAD_LEFT);
}
function vm_case_label(PDO $pdo, int $cid): string
{
    if (!$cid || !compl_has($pdo, 'succ_cases')) { return ''; }
    $s = $pdo->prepare('SELECT number, title FROM succ_cases WHERE id=? AND deleted_at IS NULL'); $s->execute([$cid]); $r = $s->fetch(PDO::FETCH_ASSOC);
    return $r ? trim((string) $r['number'] . ' · ' . (string) $r['title'], ' ·') : '';
}
function vm_access(PDO $pdo, string $kind, array $plan, string $what): void
{
    if (!function_exists('access_log_add')) { return; }
    $cid = (int) ($plan['succ_case_id'] ?? 0);
    $cid && !compl_kiosk() ? access_log_add($pdo, $kind, 'case', $cid, function_exists('access_case_label') ? access_case_label($pdo, $cid) : '', $what) : access_log_add($pdo, $kind, 'genealogy', null, '', $what);
}

/** GET compl&op=visite&id= : la visite et ses cotes, avec la personne cherchée de chaque cote. */
function visite_get(PDO $pdo, int $id): array
{
    $p = vm_plan($pdo, $id);
    $items = vm_items($pdo, $id);
    $names = hom_people($pdo, array_column($items, 'person_id'));
    $imp = vm_json((string) ($p['import_json'] ?? ''));
    return ['plan' => ['id' => (int) $p['id'], 'title' => (string) $p['title'], 'center' => (string) $p['archive_center'], 'date' => (string) $p['visit_date'], 'done_at' => (string) ($p['done_at'] ?? ''),
        'case_id' => (int) ($p['succ_case_id'] ?? 0) ?: null, 'case' => compl_kiosk() ? '' : vm_case_label($pdo, (int) ($p['succ_case_id'] ?? 0)), 'photos_off' => (int) ($p['photos_off'] ?? 0) === 1,
        'imported_at' => (string) ($p['imported_at'] ?? ''), 'can_undo' => !empty($imp['last']), 'can_undo_photos' => !empty($imp['photos_last']), 'exported' => (string) ($p['export_uid'] ?? '') !== ''],
        'items' => array_map(static fn($i) => ['id' => (int) $i['id'], 'cote' => (string) $i['archive_reference'], 'title' => (string) $i['title'], 'place' => (string) $i['place_label'], 'checked' => (int) $i['checked'] === 1,
            'result' => (string) ($i['result'] ?? ''), 'person_id' => (int) $i['person_id'] ?: null, 'who' => $names[(int) $i['person_id']]['name'] ?? '', 'kind' => (string) $i['act_kind'], 'digest_id' => (int) $i['archive_digest_id'] ?: null], $items),
        'settings' => compl_settings($pdo)];
}

/** 🗄 Créer la visite (depuis « Que manque-t-il ? » : service, date, dossier facultatif, les cotes cochées). */
function visite_prepare(PDO $pdo, array $d): array
{
    $sid = safe_int($d['service_id'] ?? 0);
    $svc = $sid ? archive_service_row($pdo, $sid) : null;
    $center = compl_txt($d['center'] ?? '', 200) ?: (string) ($svc['name'] ?? '');
    if ($center === '') { throw new LcndaBadInput('Indique le centre d’archives à visiter.'); }
    $date = compl_txt($d['date'] ?? '', 10); if ($date !== '' && !compl_date_ok($date)) { throw new LcndaBadInput('Date incorrecte.'); }
    $cid = safe_int($d['case_id'] ?? 0);
    if ($cid) { if (compl_kiosk() || !compl_has($pdo, 'succ_cases')) { $cid = 0; } else { $s = $pdo->prepare('SELECT 1 FROM succ_cases WHERE id=? AND deleted_at IS NULL'); $s->execute([$cid]); if (!$s->fetchColumn()) { throw new LcndaBadInput('Dossier introuvable.'); } } }
    $items = array_slice(is_array($d['items'] ?? null) ? $d['items'] : [], 0, 300);
    if (!$items) { throw new LcndaBadInput('Coche au moins une cote.'); }
    $plan = save_archive_visit_plan($pdo, ['title' => compl_txt($d['title'] ?? '', 200), 'visit_date' => $date, 'archive_center' => $center, 'address' => (string) ($svc['address'] ?? ''),
        'website_url' => (string) ($svc['website_url'] ?? ''), 'opening_hours' => (string) ($svc['opening_hours'] ?? ''), 'room_notes' => compl_txt($svc['notes'] ?? '', 2000, true)]);
    $vid = (int) $plan['id'];
    $pdo->prepare('UPDATE archive_visit_plans SET succ_case_id=? WHERE id=?')->execute([$cid ?: null, $vid]);
    $n = 0;
    foreach ($items as $it) {
        if (!is_array($it)) { continue; }
        $cote = compl_txt($it['cote'] ?? '', 200); if ($cote === '') { continue; }
        $r = save_archive_visit_item($pdo, ['visit_id' => $vid, 'archive_service' => $center, 'archive_reference' => $cote, 'title' => compl_txt($it['title'] ?? '', 300), 'place_label' => compl_txt($it['place'] ?? '', 200), 'notes' => compl_txt($it['notes'] ?? '', 2000, true), 'checked' => 0]);
        $pid = safe_int($it['person_id'] ?? 0);
        if ($pid) { $s = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $s->execute([$pid]); if (!$s->fetchColumn()) { $pid = 0; } }
        $kind = is_string($it['kind'] ?? null) && in_array($it['kind'], VM_KINDS, true) ? $it['kind'] : '';
        $pdo->prepare('UPDATE archive_visit_items SET person_id=?, act_kind=? WHERE id=?')->execute([$pid ?: null, $kind, (int) $r['id']]);
        $n++;
    }
    if (!$n) { throw new LcndaBadInput('Coche au moins une cote.'); }
    return ['id' => $vid, 'items' => $n];
}
function visite_prepare_undo(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); $p = vm_plan($pdo, $id);
    if ((string) ($p['export_uid'] ?? '') !== '' || (string) ($p['imported_at'] ?? '') !== '') { throw new RuntimeException('Cette visite a déjà été emportée : supprime-la dans le Planificateur si tu n’en veux plus.'); }
    return delete_archive_visit_plan($pdo, ['id' => $id]);
}

/** Ce qu'on sait déjà d'une personne (pour reconnaître l'acte sur place) : années, parents, conjoint. */
function vm_known(PDO $pdo, int $pid): array
{
    $p = hom_people($pdo, [$pid])[$pid] ?? null; if (!$p) { return []; }
    $out = [];
    $s = $pdo->prepare("SELECT t.gedcom_tag AS tag, e.date_text, pl.name AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=? AND t.gedcom_tag IN ('BIRT','CHR','DEAT','BURI') ORDER BY e.sort_date, e.id LIMIT 6");
    $s->execute([$pid]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $e) { $l = ['BIRT' => '°', 'CHR' => '~', 'DEAT' => '†', 'BURI' => '⚰'][$e['tag']] ?? ''; $t = trim($l . ' ' . trim((string) $e['date_text'] . ' ' . (string) $e['place'])); if ($t !== $l) { $out[] = $t; } }
    $par = hom_parents($pdo, $pid); if ($par !== '') { $out[] = i18n_t('Parents : {names}', ['names' => $par]); }
    $s = $pdo->prepare('SELECT CASE WHEN f.partner1_id=? THEN f.partner2_id ELSE f.partner1_id END FROM families f WHERE f.partner1_id=? OR f.partner2_id=? LIMIT 3'); $s->execute([$pid, $pid, $pid]);
    $sp = array_filter(array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)));
    if ($sp) { $names = array_filter(array_map(static fn($x) => $x['private'] ? '' : $x['name'], hom_people($pdo, $sp))); if ($names) { $out[] = i18n_t('Conjoint : {names}', ['names' => implode(', ', $names)]); } }
    return $out;
}

/** 📱 Emporter : les données de la page (fabriquée dans le navigateur) ; l'identifiant reste le même tant que rien n'est rapporté. */
function visite_render(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); $p = vm_plan($pdo, $id);
    $set = compl_settings($pdo);
    $living = array_key_exists('living', $d) ? !empty($d['living']) : $set['visite_living'] === 'yes';
    $photosOff = !empty($d['photos_off']) ? 1 : 0;
    $uid = (string) ($p['export_uid'] ?? '');
    if ($uid === '' || (string) ($p['imported_at'] ?? '') !== '') { $uid = bin2hex(random_bytes(16)); }
    $pdo->prepare("UPDATE archive_visit_plans SET export_uid=?, export_sum=?, imported_at='', photos_off=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$uid, vm_sum($uid), $photosOff, $id]);
    $people = hom_people($pdo, array_column(vm_items($pdo, $id), 'person_id'));
    $items = [];
    $nLiving = 0;
    foreach (vm_items($pdo, $id) as $i) {
        $pid = (int) $i['person_id']; $who = ''; $known = [];
        if ($pid && isset($people[$pid])) {
            $x = $people[$pid];
            if ($x['private']) { $who = i18n_t('Fiche confidentielle'); }
            elseif ($x['living'] && !$living) { $who = i18n_t('Personne vivante'); $nLiving++; }
            else { $who = $x['name']; $known = vm_known($pdo, $pid); }
        }
        // le titre a été écrit avec le nom : pour un vivant ou une fiche confidentielle, il ne part pas
        $title = (string) $i['title'];
        if ($pid && isset($people[$pid]) && ($people[$pid]['private'] || ($people[$pid]['living'] && !$living))) { $title = $who; }
        $items[] = ['id' => (int) $i['id'], 'cote' => (string) $i['archive_reference'], 'title' => $title, 'place' => (string) $i['place_label'], 'who' => $who, 'known' => $known, 'kind' => (string) $i['act_kind'], 'note' => mb_substr((string) $i['notes'], 0, 500)];
    }
    vm_access($pdo, 'export', $p, 'visite_mobile');
    $slug = trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower(function_exists('ascii_fold') ? ascii_fold((string) $p['archive_center']) : (string) $p['archive_center'])), '-') ?: 'archives';
    return ['data' => ['format' => VM_FORMAT, 'version' => 1, 'visit' => $uid, 'checksum' => vm_sum($uid), 'title' => (string) $p['title'], 'center' => (string) $p['archive_center'], 'date' => (string) $p['visit_date'],
        'hours' => (string) $p['opening_hours'], 'address' => (string) $p['address'], 'room' => mb_substr((string) $p['room_notes'], 0, 1000), 'photos_off' => $photosOff === 1, 'photo_px' => (int) $set['visite_photo_px'], 'items' => $items],
        'filename' => 'visite-' . substr($slug, 0, 30) . ($p['visit_date'] !== '' ? '-' . $p['visit_date'] : ''), 'living_hidden' => $nLiving];
}

/* ═════════ ⤒ le .zip rapporté du téléphone ═════════ */
function vm_photo_ok(string $head): string
{
    if (str_starts_with($head, "\xFF\xD8\xFF")) { return 'jpg'; }
    if (str_starts_with($head, "\x89PNG\r\n\x1a\n")) { return 'png'; }
    if (str_starts_with($head, 'RIFF') && substr($head, 8, 4) === 'WEBP') { return 'webp'; }
    return '';
}
/** Lit strictement le fichier : rend [results, zip ouvert, noms des photos]. Refuse tout ce qui n'est pas attendu. */
function vm_read_zip(?array $file): array
{
    if (!$file || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string) ($file['tmp_name'] ?? '')) && !is_file((string) ($file['tmp_name'] ?? ''))) { throw new LcndaBadInput('Fichier non reçu.'); }
    $size = (int) ($file['size'] ?? 0);
    if ($size <= 0 || $size > VM_MAX_ZIP) { throw new RuntimeException('Ce fichier est trop gros pour les résultats d’une visite.'); }
    $tmp = (string) $file['tmp_name'];
    if ((string) @file_get_contents($tmp, false, null, 0, 4) !== "PK\x03\x04") { throw new RuntimeException('Ce fichier n’est pas les résultats d’une visite (il faut le .zip enregistré sur le téléphone).'); }
    if (!class_exists('ZipArchive')) { throw new RuntimeException('Lecture des fichiers .zip impossible sur cet ordinateur.'); }
    $zip = new ZipArchive();
    if ($zip->open($tmp, ZipArchive::RDONLY) !== true) { throw new RuntimeException('Fichier .zip illisible.'); }
    if ($zip->numFiles < 1 || $zip->numFiles > VM_MAX_ENTRIES) { $zip->close(); throw new RuntimeException('Fichier refusé : trop de fichiers dedans.'); }
    $photos = []; $total = 0; $json = null;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $st = $zip->statIndex($i);
        $name = (string) ($st['name'] ?? '');
        if ($name === 'photos/') { continue; }
        if ($name === '' || str_contains($name, '..') || str_contains($name, '\\') || str_contains($name, "\0") || str_starts_with($name, '/') || preg_match('/^[a-z]:/i', $name)) { $zip->close(); throw new RuntimeException('Fichier refusé : un chemin sort du dossier.'); }
        $isJson = $name === 'results.json';
        if (!$isJson && !preg_match('#^photos/[A-Za-z0-9_-]{1,80}\.(jpe?g|png|webp)$#', $name)) { $zip->close(); throw new RuntimeException('Fichier refusé : il contient des données inattendues.'); }
        $u = (int) ($st['size'] ?? 0); $c = (int) ($st['comp_size'] ?? 0);
        $total += $u;
        if ($u > ($isJson ? VM_MAX_JSON : VM_MAX_PHOTO) || $total > VM_MAX_TOTAL || ($c > 0 && $u / $c > 200)) { $zip->close(); throw new RuntimeException('Fichier refusé : un élément est trop gros.'); }
        if ($isJson) { $json = $i; } else { $photos[substr($name, 7)] = $i; }
    }
    if ($json === null) { $zip->close(); throw new RuntimeException('Fichier refusé : results.json manque.'); }
    $raw = (string) $zip->getFromIndex($json, VM_MAX_JSON);
    $raw = (string) preg_replace('/^\xEF\xBB\xBF/', '', $raw);
    try { $j = json_decode($raw, true, 8, JSON_THROW_ON_ERROR | JSON_BIGINT_AS_STRING); }
    catch (JsonException) { $zip->close(); throw new RuntimeException('Fichier refusé : results.json est illisible.'); }
    if (!is_array($j) || array_is_list($j) || ($j['format'] ?? null) !== VM_FORMAT) { $zip->close(); throw new RuntimeException('Ce fichier n’est pas les résultats d’une visite aux archives.'); }
    if ($extra = array_diff(array_keys($j), ['format', 'version', 'visit', 'checksum', 'saved_at', 'items', 'extra', 'sum'])) { $zip->close(); throw new RuntimeException('Fichier refusé : il contient des données inattendues.'); }
    if (($j['version'] ?? null) !== 1 || !is_string($j['visit'] ?? null) || !is_string($j['checksum'] ?? null) || !preg_match('/^[a-f0-9]{32}$/', $j['visit']) || !preg_match('/^[a-f0-9]{32}$/', $j['checksum'])) { $zip->close(); throw new RuntimeException('Fichier refusé : identifiant incorrect.'); }
    foreach (['saved_at', 'sum'] as $k) { if (isset($j[$k]) && !is_string($j[$k])) { $zip->close(); throw new RuntimeException('Fichier refusé : il contient des données inattendues.'); } }
    $items = $j['items'] ?? null; $extraL = $j['extra'] ?? [];
    if (!is_array($items) || !array_is_list($items) || count($items) > 500 || !is_array($extraL) || !array_is_list($extraL) || count($extraL) > 60) { $zip->close(); throw new RuntimeException('Fichier refusé : la liste des cotes manque.'); }
    $check = static function (array $r, array $keys) use ($photos, $zip): array {
        if (array_is_list($r) && $r) { throw new RuntimeException('Fichier refusé : une cote est mal formée.'); }
        if (array_diff(array_keys($r), $keys)) { throw new RuntimeException('Fichier refusé : une cote contient des données inattendues.'); }
        $res = $r['result'] ?? '';
        if (!is_string($res) || !in_array($res, VM_RESULTS, true)) { throw new RuntimeException('Fichier refusé : un résultat est inconnu.'); }
        foreach (['note', 'cote', 'title', 'at'] as $k) { if (isset($r[$k]) && !is_string($r[$k])) { throw new RuntimeException('Fichier refusé : une cote est mal formée.'); } }
        $ph = $r['photos'] ?? [];
        if (!is_array($ph) || !array_is_list($ph) || count($ph) > 40) { throw new RuntimeException('Fichier refusé : la liste des photos est mal formée.'); }
        foreach ($ph as $p) { if (!is_string($p) || !isset($photos[$p])) { throw new RuntimeException('Fichier refusé : une photo annoncée manque.'); } }
        return $r;
    };
    try {
        foreach ($items as $r) { if (!is_array($r) || !is_int($r['id'] ?? null) || $r['id'] <= 0) { throw new RuntimeException('Fichier refusé : une cote est mal formée.'); } $check($r, ['id', 'result', 'note', 'photos', 'at']); }
        foreach ($extraL as $r) { if (!is_array($r)) { throw new RuntimeException('Fichier refusé : une cote est mal formée.'); } $check($r, ['cote', 'title', 'note', 'result', 'photos', 'at']); }
        // la somme calculée par la page sur ce qu'elle a écrit : un fichier modifié à la main est refusé
        if (isset($j['sum']) && vm_fnv((string) json_encode([$items, $extraL], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS)) !== $j['sum']) { throw new RuntimeException('Fichier refusé : il a été modifié depuis le téléphone (somme de contrôle).'); }
        foreach ($photos as $n => $idx) { $head = (string) $zip->getFromIndex($idx, 16); if (vm_photo_ok($head) === '') { throw new RuntimeException('Fichier refusé : une photo n’est pas une image.'); } }
    } catch (Throwable $e) { $zip->close(); throw $e; }
    return [$j, $zip, $photos];
}
/** La visite que vise ce fichier (identifiant + somme de contrôle) ; un fichier déjà rangé est refusé (rien en double). */
function vm_plan_of(PDO $pdo, array $j): array
{
    $s = $pdo->prepare('SELECT * FROM archive_visit_plans WHERE export_uid=?'); $s->execute([$j['visit']]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) {
        foreach ($pdo->query("SELECT id, import_json FROM archive_visit_plans WHERE import_json<>''")->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $done = vm_json((string) $r['import_json'])['done'] ?? [];
            if (is_array($done) && isset($done[$j['visit']])) { throw new RuntimeException(i18n_t('Ce fichier a déjà été rangé le {date} : rien n’est fait en double.', ['date' => (string) $done[$j['visit']]])); }
        }
        throw new RuntimeException('Ce fichier vient d’une visite qui n’est pas dans cette généalogie.');
    }
    if (!hash_equals((string) $p['export_sum'], $j['checksum'])) { throw new RuntimeException('Fichier refusé : il ne correspond pas à la page emportée (somme de contrôle).'); }
    if ((string) $p['imported_at'] !== '') { throw new RuntimeException(i18n_t('Ce fichier a déjà été rangé le {date} : rien n’est fait en double.', ['date' => substr((string) $p['imported_at'], 0, 10)])); }
    return $p;
}

/** POST compl_write op=visite_analyze (le fichier) : ce qui est rapporté, cote par cote ; rien n'est écrit. */
function visite_analyze(PDO $pdo, array $d, ?array $file): array
{
    [$j, $zip, $photos] = vm_read_zip($file);
    $zip->close();
    $p = vm_plan_of($pdo, $j);
    $items = [];
    foreach (vm_items($pdo, (int) $p['id']) as $i) { $items[(int) $i['id']] = $i; }
    $names = hom_people($pdo, array_column($items, 'person_id'));
    $rows = [];
    foreach ($j['items'] as $r) {
        $it = $items[$r['id']] ?? null;
        $has = ($r['result'] ?? '') !== '' || trim((string) ($r['note'] ?? '')) !== '' || !empty($r['photos']);
        if (!$has) { continue; }
        $rows[] = ['key' => 'i:' . $r['id'], 'kind' => 'item', 'removed' => !$it, 'cote' => $it ? (string) $it['archive_reference'] : '', 'title' => $it ? (string) $it['title'] : '', 'result' => (string) ($r['result'] ?? ''),
            'note' => mb_substr((string) ($r['note'] ?? ''), 0, 4000), 'photos' => count($r['photos'] ?? []), 'digest' => $it && (int) $it['archive_digest_id'] > 0, 'who' => $it ? ($names[(int) $it['person_id']]['name'] ?? '') : '',
            'piece' => $it && vm_piece_key($pdo, $p, $it) !== '' && ($r['result'] ?? '') === 'found', 'checked' => (bool) $it];
    }
    foreach ($j['extra'] as $n => $r) {
        $rows[] = ['key' => 'x:' . $n, 'kind' => 'extra', 'removed' => false, 'cote' => mb_substr((string) ($r['cote'] ?? ''), 0, 200), 'title' => mb_substr((string) ($r['title'] ?? ''), 0, 300), 'result' => (string) ($r['result'] ?? ''),
            'note' => mb_substr((string) ($r['note'] ?? ''), 0, 4000), 'photos' => count($r['photos'] ?? []), 'digest' => false, 'who' => '', 'piece' => false, 'checked' => false];
    }
    return ['visit' => ['id' => (int) $p['id'], 'title' => (string) $p['title'], 'center' => (string) $p['archive_center'], 'date' => (string) $p['visit_date'], 'case' => compl_kiosk() ? '' : vm_case_label($pdo, (int) $p['succ_case_id'])],
        'rows' => $rows, 'photos' => count($photos), 'settings' => compl_settings($pdo)];
}

/** La pièce du dossier que cette cote apporte (seulement une visite reliée à un dossier, une naissance ou un décès d'une personne du dossier). */
function vm_piece_key(PDO $pdo, array $plan, array $item): string
{
    $cid = (int) ($plan['succ_case_id'] ?? 0); $pid = (int) ($item['person_id'] ?? 0);
    $pre = ['birth' => 'N', 'death' => 'D'][(string) ($item['act_kind'] ?? '')] ?? '';
    if (!$cid || !$pid || $pre === '' || !compl_has($pdo, 'succ_pieces')) { return ''; }
    $key = $pre . ':' . $pid;
    $s = $pdo->prepare('SELECT state FROM succ_pieces WHERE case_id=? AND piece_key=?'); $s->execute([$cid, $key]); $st = $s->fetchColumn();
    if ($st === 'have' || $st === 'na') { return ''; }
    if ($st !== false) { return $key; }
    if (!compl_has($pdo, 'succ_case_persons')) { return ''; }
    $s = $pdo->prepare('SELECT 1 FROM succ_case_persons WHERE case_id=? AND person_id=? AND deleted_at IS NULL'); $s->execute([$cid, $pid]);
    return $s->fetchColumn() ? $key : '';
}
/** Une photo du téléphone entre dans les médias (nom tiré au hasard, jamais celui du fichier). */
function vm_store_photo(string $bytes, string $title, array &$files): array
{
    $ext = vm_photo_ok(substr($bytes, 0, 16));
    if ($ext === '') { throw new RuntimeException('Fichier refusé : une photo n’est pas une image.'); }
    $name = bin2hex(random_bytes(16)) . '.' . $ext;
    if (!is_dir(MEDIA_DIR)) { @mkdir(MEDIA_DIR, 0775, true); }
    if (file_put_contents(MEDIA_DIR . '/' . $name, $bytes) === false) { throw new RuntimeException('Impossible de ranger la photo dans les médias.'); }
    $files[] = MEDIA_DIR . '/' . $name;
    return ['name' => $name, 'title' => $title];
}
function vm_media_insert(PDO $pdo, string $file, string $title, string $desc, int $personId, int $digestId): int
{
    $pdo->prepare("INSERT INTO media(title, description, media_type, filename, thumbnail) VALUES(?,?,'image',?,?)")->execute([mb_substr($title, 0, 300), mb_substr($desc, 0, 2000), $file, $file]);
    $mid = (int) $pdo->lastInsertId();
    if ($personId) { $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'person', ?, 0)")->execute([$mid, $personId]); }
    if ($digestId && compl_has($pdo, 'archive_digest_media')) { $pdo->prepare("INSERT INTO archive_digest_media(archive_digest_id, media_id, page_number) VALUES(?,?,'')")->execute([$digestId, $mid]); }
    return $mid;
}

/** POST compl_write op=visite_import (le même fichier, et les choix de la revue) : range ce qui est coché ; ↶ Annuler défait tout. */
function visite_import(PDO $pdo, array $d, ?array $file): array
{
    [$j, $zip, $photos] = vm_read_zip($file);
    $files = []; $open = true;
    try {
        $p = vm_plan_of($pdo, $j);
        $vid = (int) $p['id'];
        $set = compl_settings($pdo);
        $choices = is_string($d['choices'] ?? null) ? json_decode((string) $d['choices'], true) : ($d['choices'] ?? []);
        if (!is_array($choices)) { throw new LcndaBadInput('Choix incorrects.'); }
        $on = [];
        foreach ($choices as $c) { if (is_array($c) && is_string($c['key'] ?? null) && !empty($c['on'])) { $on[$c['key']] = $c; } }
        $items = []; foreach (vm_items($pdo, $vid) as $i) { $items[(int) $i['id']] = $i; }
        $rec = ['at' => date('c'), 'uid' => (string) $j['visit'], 'items' => [], 'added' => [], 'digests' => [], 'media' => [], 'pieces' => [], 'done_prev' => (string) $p['done_at']];
        $where = trim((string) $p['archive_center'] . ($p['visit_date'] !== '' ? ', ' . $p['visit_date'] : ''));
        $nDig = 0; $nMed = 0; $nPiece = 0; $persons = [];
        $todo = [];
        foreach ($j['items'] as $r) { if (isset($on['i:' . $r['id']], $items[$r['id']])) { $todo[] = [$items[$r['id']], $r]; } }
        foreach ($j['extra'] as $n => $r) {
            if (!isset($on['x:' . $n])) { continue; }
            $cote = compl_txt($r['cote'] ?? '', 200); if ($cote === '') { $cote = i18n_t('Cote ajoutée sur place'); }
            $add = save_archive_visit_item($pdo, ['visit_id' => $vid, 'archive_service' => (string) $p['archive_center'], 'archive_reference' => $cote, 'title' => compl_txt($r['title'] ?? '', 300), 'notes' => '', 'checked' => 0]);
            $rec['added'][] = (int) $add['id'];
            $s = $pdo->prepare('SELECT * FROM archive_visit_items WHERE id=?'); $s->execute([(int) $add['id']]);
            $todo[] = [$s->fetch(PDO::FETCH_ASSOC), $r];
        }
        foreach ($todo as [$it, $r]) {
            $iid = (int) $it['id'];
            $rec['items'][] = ['id' => $iid, 'result' => (string) ($it['result'] ?? ''), 'result_note' => (string) ($it['result_note'] ?? ''), 'checked' => (int) $it['checked'], 'digest' => (int) $it['archive_digest_id']];
            $res = (string) ($r['result'] ?? '');
            $note = compl_txt($r['note'] ?? '', 4000, true);
            $pdo->prepare('UPDATE archive_visit_items SET result=?, result_note=?, checked=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$res, $note !== '' ? $note : (string) ($it['result_note'] ?? ''), $res !== '' && $res !== 'not_consulted' ? 1 : (int) $it['checked'], $iid]);
            $dig = (int) $it['archive_digest_id'];
            if (!$dig && $res !== '' && $res !== 'not_consulted') { $mk = archive_visit_item_make_digest($pdo, ['id' => $iid]); $dig = (int) $mk['id']; if (empty($mk['existing'])) { $rec['digests'][] = $dig; $nDig++; if ((int) $it['person_id'] && function_exists('archive_digest_set_sought')) { archive_digest_set_sought($pdo, $dig, [(int) $it['person_id']]); } } }
            $k = 0;
            foreach ($r['photos'] ?? [] as $ph) {
                $bytes = (string) $zip->getFromIndex($photos[$ph], VM_MAX_PHOTO);
                $k++;
                $f = vm_store_photo($bytes, '', $files);
                $title = trim((string) $it['archive_reference']) . ' — ' . $where . (count($r['photos']) > 1 ? ' (' . $k . ')' : '');
                $rec['media'][] = vm_media_insert($pdo, $f['name'], $title, $res === 'partial' && $note === '' ? i18n_t('à trier') : $note, (int) $it['person_id'], $dig);
                $nMed++;
            }
            if ($res === 'found' && ($key = vm_piece_key($pdo, $p, $it)) !== '') {
                $cid = (int) $p['succ_case_id'];
                $s = $pdo->prepare('SELECT state, note FROM succ_pieces WHERE case_id=? AND piece_key=?'); $s->execute([$cid, $key]); $old = $s->fetch(PDO::FETCH_ASSOC);
                $rec['pieces'][] = ['case_id' => $cid, 'key' => $key, 'prev' => $old ?: null];
                $pdo->prepare("INSERT INTO succ_pieces(case_id, piece_key, state, note, updated_at) VALUES(?,?, 'have', ?, CURRENT_TIMESTAMP) ON CONFLICT(case_id, piece_key) DO UPDATE SET state='have', updated_at=CURRENT_TIMESTAMP")->execute([$cid, $key, i18n_t('Trouvé à la visite : {where}', ['where' => $where])]);
                if (function_exists('succ_journal')) { succ_journal($pdo, $cid, 'piece', '📑 Pièce trouvée à la visite aux archives (' . $where . ', cote ' . (string) $it['archive_reference'] . ')'); }
                $nPiece++;
            }
            if (!empty($on['i:' . $iid]['report']) && (int) $it['person_id']) { $persons[] = (int) $it['person_id']; }
        }
        if (!$todo) { throw new LcndaBadInput('Coche au moins une cote à ranger.'); }
        if ($set['visite_done'] === 'auto') { save_archive_visit_done($pdo, ['visit_id' => $vid, 'done_at' => compl_date_ok((string) $p['visit_date']) && $p['visit_date'] <= date('Y-m-d') ? $p['visit_date'] : date('Y-m-d')]); }
        $imp = vm_json((string) $p['import_json']);
        $imp['done'][(string) $j['visit']] = date('Y-m-d');
        $imp['done'] = array_slice($imp['done'], -50, null, true);
        $imp['last'] = $rec;
        $pdo->prepare('UPDATE archive_visit_plans SET imported_at=?, import_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([date('Y-m-d H:i:s'), json_encode($imp, JSON_UNESCAPED_UNICODE), $vid]);
        log_change($pdo, 'archive_visit_plan', $vid, 'update', 'Résultats de la visite rapportés du téléphone : ' . (string) $p['title']);
        vm_access($pdo, 'case_open', $p, 'visite_import');
        $open = false; $zip->close();
        return ['visit_id' => $vid, 'digests' => $nDig, 'media' => $nMed, 'pieces' => $nPiece, 'cotes' => count($todo), 'done' => $set['visite_done'] === 'auto', 'report' => array_values(array_unique($persons))];
    } catch (Throwable $e) {
        foreach ($files as $f) { @unlink($f); }
        if ($open) { try { $zip->close(); } catch (Throwable $_) {} }
        throw $e;
    }
}
/** ↶ Annuler le rangement : médias, dépouillements créés, cotes ajoutées, résultats, pièces et « faite » reviennent comme avant. */
function visite_import_undo(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); $p = vm_plan($pdo, $id);
    $imp = vm_json((string) $p['import_json']); $rec = $imp['last'] ?? null;
    if (!is_array($rec)) { throw new RuntimeException('Rien à annuler.'); }
    vm_undo_media($pdo, $rec['media'] ?? []);
    foreach (array_reverse(is_array($rec['items'] ?? null) ? $rec['items'] : []) as $it) {
        $pdo->prepare('UPDATE archive_visit_items SET result=?, result_note=?, checked=?, archive_digest_id=? WHERE id=?')->execute([(string) $it['result'], (string) $it['result_note'], (int) $it['checked'], ((int) $it['digest']) ?: null, (int) $it['id']]);
    }
    foreach (compl_ids($rec['digests'] ?? [], 1000) as $dig) { try { delete_archive_digest($pdo, ['id' => $dig]); } catch (Throwable $_) {} }
    foreach (compl_ids($rec['added'] ?? [], 1000) as $iid) { $pdo->prepare('DELETE FROM archive_visit_items WHERE id=? AND visit_id=?')->execute([$iid, $id]); }
    foreach (is_array($rec['pieces'] ?? null) ? $rec['pieces'] : [] as $pc) {
        if (!is_array($pc)) { continue; }
        if (is_array($pc['prev'] ?? null)) { $pdo->prepare('UPDATE succ_pieces SET state=?, note=? WHERE case_id=? AND piece_key=?')->execute([(string) $pc['prev']['state'], (string) $pc['prev']['note'], (int) $pc['case_id'], (string) $pc['key']]); }
        else { $pdo->prepare('DELETE FROM succ_pieces WHERE case_id=? AND piece_key=?')->execute([(int) $pc['case_id'], (string) $pc['key']]); }
        if (function_exists('succ_journal')) { succ_journal($pdo, (int) $pc['case_id'], 'piece', '↶ Rangement de la visite aux archives annulé'); }
    }
    $pdo->prepare('UPDATE archive_visit_plans SET done_at=? WHERE id=?')->execute([(string) ($rec['done_prev'] ?? ''), $id]);
    unset($imp['last']);
    if (isset($rec['uid']) && is_array($imp['done'] ?? null)) { unset($imp['done'][$rec['uid']]); }
    $pdo->prepare("UPDATE archive_visit_plans SET imported_at='', import_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([json_encode($imp ?: new stdClass(), JSON_UNESCAPED_UNICODE), $id]);
    log_change($pdo, 'archive_visit_plan', $id, 'update', 'Rangement des résultats de la visite annulé : ' . (string) $p['title']);
    return ['ok' => true];
}
function vm_undo_media(PDO $pdo, mixed $ids): void
{
    foreach (compl_ids($ids, 2000) as $mid) {
        $s = $pdo->prepare('SELECT filename FROM media WHERE id=?'); $s->execute([$mid]); $f = basename((string) $s->fetchColumn());
        $pdo->prepare('DELETE FROM media_links WHERE media_id=?')->execute([$mid]);
        if (compl_has($pdo, 'archive_digest_media')) { $pdo->prepare('DELETE FROM archive_digest_media WHERE media_id=?')->execute([$mid]); }
        $pdo->prepare('DELETE FROM media WHERE id=?')->execute([$mid]);
        if ($f !== '' && preg_match('/^[a-f0-9]{32}\.(jpg|png|webp)$/', $f) && is_file(MEDIA_DIR . '/' . $f)) { @unlink(MEDIA_DIR . '/' . $f); }
    }
}

/** ⤒ Photos du jour (feuille imprimée + photos du téléphone) : chaque photo va à la cote choisie (proposée d'après l'heure). */
function visite_photos_import(PDO $pdo, array $d, ?array $files): array
{
    $id = safe_int($d['id'] ?? 0); $p = vm_plan($pdo, $id);
    $map = is_string($d['map'] ?? null) ? json_decode((string) $d['map'], true) : ($d['map'] ?? []);
    if (!is_array($map) || !$files || !is_array($files['tmp_name'] ?? null)) { throw new LcndaBadInput('Aucune photo reçue.'); }
    if (count($files['tmp_name']) > 200) { throw new RuntimeException('Trop de photos d’un coup (200 au plus).'); }
    $items = []; foreach (vm_items($pdo, $id) as $i) { $items[(int) $i['id']] = $i; }
    $where = trim((string) $p['archive_center'] . ($p['visit_date'] !== '' ? ', ' . $p['visit_date'] : ''));
    $stored = []; $media = [];
    try {
        foreach ($files['tmp_name'] as $n => $tmp) {
            $iid = safe_int($map[$n] ?? 0);
            if (!$iid || !isset($items[$iid])) { continue; }
            if ((int) ($files['error'][$n] ?? 1) !== UPLOAD_ERR_OK || (int) ($files['size'][$n] ?? 0) <= 0 || (int) $files['size'][$n] > VM_MAX_PHOTO) { throw new RuntimeException('Une photo est trop grosse ou n’a pas été reçue.'); }
            $bytes = (string) file_get_contents((string) $tmp);
            $it = $items[$iid];
            $f = vm_store_photo($bytes, '', $stored);
            $media[] = vm_media_insert($pdo, $f['name'], trim((string) $it['archive_reference']) . ' — ' . $where, i18n_t('à trier'), (int) $it['person_id'], (int) $it['archive_digest_id']);
        }
    } catch (Throwable $e) { foreach ($stored as $f) { @unlink($f); } throw $e; }
    if (!$media) { throw new LcndaBadInput('Choisis la cote de chaque photo.'); }
    $imp = vm_json((string) $p['import_json']); $imp['photos_last'] = ['at' => date('c'), 'media' => $media];
    $pdo->prepare('UPDATE archive_visit_plans SET import_json=? WHERE id=?')->execute([json_encode($imp, JSON_UNESCAPED_UNICODE), $id]);
    vm_access($pdo, 'case_open', $p, 'visite_photos');
    return ['media' => count($media)];
}
function visite_photos_undo(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); $p = vm_plan($pdo, $id);
    $imp = vm_json((string) $p['import_json']); $rec = $imp['photos_last'] ?? null;
    if (!is_array($rec)) { throw new RuntimeException('Rien à annuler.'); }
    vm_undo_media($pdo, $rec['media'] ?? []);
    unset($imp['photos_last']);
    $pdo->prepare('UPDATE archive_visit_plans SET import_json=? WHERE id=?')->execute([json_encode($imp ?: new stdClass(), JSON_UNESCAPED_UNICODE), $id]);
    return ['ok' => true];
}
