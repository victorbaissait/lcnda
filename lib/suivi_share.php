<?php
declare(strict_types=1);

/**
 * 🐾 📤 Suivi des animaux — partager et fusionner (assets/js/heritage-suivi-partage.js).
 *
 * Partager : GET api.php?action=suivi&op=share&scope=pets|species|site|all&ids=…&species=…&taxon=…&site=…&gps=1&photos=1&names=0
 *   → le paquet {format: 'lcnda-suivi', version: 1, animals: […], sites: […], groups: […], free_observations: […], media: […]}.
 *   Le navigateur en fait un fichier « .lcsuivi » (un ZIP : suivi.json + medias/…, fabriqué par LCNDA_SHEET.makeZip).
 *   Chaque animal et chaque ligne (marque, observation, santé, appartenance, site, comptage, groupe) porte un identifiant
 *   stable (uuid), donné au premier partage, pour être reconnu chez l'autre.
 *   Confidentialité : jamais les propriétaires ni les fiches de personnes ; les noms des observateurs, bagueurs et soigneurs
 *   seulement si on coche « inclure les noms des observateurs » (names=1).
 * Recevoir : POST suivi_write {op: 'share_analyze', package} → « Voilà ce qui va entrer » : nouveaux animaux, lignes nouvelles,
 *   doublons exacts écartés, et les CONFLITS (même animal reconnu par uuid ou par une bague, une puce… ; champ différent,
 *   ligne de même uuid modifiée).
 * Fusionner : POST {op: 'share_apply', package, decisions, media_map, source} → tout dans une transaction ; ce qui est ajouté
 *   et ce qui est remplacé est gardé dans suivi_receipts : POST {op: 'share_undo', receipt} remet tout comme avant (↶ Annuler).
 *   Trace au journal : « Suivi reçu de … le … ».
 */

const SUIVI_SHARE_MAX = ['animals' => 5000, 'observations' => 100000, 'gps' => 500000, 'lines' => 50000, 'media' => 2000];
const SUIVI_ANIMAL_FIELDS = ['name' => 'Nom', 'species' => 'Espèce (fiche)', 'sex' => 'Sexe', 'taxon' => 'Espèce', 'sci_name' => 'Nom scientifique', 'profile' => 'Marques proposées pour',
    'status' => 'Suivi', 'ringed_date' => 'Baguage ou marquage', 'age_class' => 'Âge au baguage', 'program' => 'Programme', 'birth_date' => 'Naissance', 'deceased' => 'Mort'];

function suivi_new_uuid(): string
{
    $h = bin2hex(random_bytes(16));
    return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-4' . substr($h, 13, 3) . '-' . substr($h, 16, 4) . '-' . substr($h, 20, 12);
}

function suivi_fill_uuids(PDO $pdo): void
{
    foreach (SUIVI_UUID_TABLES as $t) {
        $ids = $pdo->query("SELECT " . ($t === 'animal_profiles' ? 'pet_id' : 'id') . " FROM $t WHERE uuid=''")->fetchAll(PDO::FETCH_COLUMN);
        $u = $pdo->prepare("UPDATE $t SET uuid=? WHERE " . ($t === 'animal_profiles' ? 'pet_id' : 'id') . '=?');
        foreach ($ids as $id) { $u->execute([suivi_new_uuid(), (int) $id]); }
    }
}

/** Un lieu en texte (il voyage tel quel, et se retrouve ou se crée chez l'autre) */
function suivi_place_out(?array $p): ?array
{
    return $p ? ['name' => $p['name'], 'county' => $p['county'] ?? '', 'country' => $p['country'] ?? '', 'lat' => $p['lat'] ?? null, 'lon' => $p['lon'] ?? null] : null;
}

/* ═════════ Partager ═════════ */
function suivi_share_build(PDO $pdo, array $q): array
{
    $scope = in_array($q['scope'] ?? 'all', ['pets', 'species', 'site', 'all'], true) ? (string) ($q['scope'] ?? 'all') : 'all';
    $names = (string) ($q['names'] ?? '0') === '1'; $photos = (string) ($q['photos'] ?? '1') === '1'; $withGps = (string) ($q['gps'] ?? '1') === '1';
    $preview = (string) ($q['preview'] ?? '') === '1';
    $ov = suivi_overview($pdo);
    $tracked = array_values(array_filter($ov['animals'], static fn($a) => $a['tracked']));
    $pick = match ($scope) {
        'pets' => (static function () use ($ov, $q) { $ids = array_map('intval', array_filter(explode(',', (string) ($q['ids'] ?? '')))); return array_values(array_filter($ov['animals'], static fn($a) => in_array($a['id'], $ids, true))); })(),
        'species' => (static function () use ($tracked, $q) { $sp = (string) ($q['species'] ?? ''); $tx = mb_strtolower(trim((string) ($q['taxon'] ?? ''))); return array_values(array_filter($tracked, static fn($a) => ($sp === '' || $a['species'] === $sp || $a['profile'] === $sp) && ($tx === '' || str_contains(mb_strtolower($a['taxon']), $tx)))); })(),
        'site' => (static function () use ($tracked, $ov, $q) { $site = safe_int($q['site'] ?? 0); $seen = []; foreach ($ov['observations'] as $o) { if ($o['site_id'] === $site && $o['pet_id']) { $seen[$o['pet_id']] = true; } } return array_values(array_filter($tracked, static fn($a) => isset($seen[$a['id']]))); })(),
        default => $tracked,
    };
    if (count($pick) > SUIVI_SHARE_MAX['animals']) { throw new RuntimeException('Trop d’animaux d’un coup (5 000 au plus).'); }
    $petIds = array_column($pick, 'id');
    if ($preview) {
        $obsN = count(array_filter($ov['observations'], static fn($o) => in_array($o['pet_id'], $petIds, true)));
        $gpsN = array_sum(array_map(static fn($a) => (int) ($a['gps']['n'] ?? 0), $pick));
        return ['preview' => true, 'animals' => count($pick), 'observations' => $obsN, 'gps' => $withGps ? $gpsN : 0, 'names' => array_slice(array_column($pick, 'title'), 0, 12)];
    }
    // identifiants stables : donnés au premier partage
    $ins = $pdo->prepare("INSERT OR IGNORE INTO animal_profiles(pet_id, status) VALUES(?, 'suivi')");
    foreach ($petIds as $id) { $ins->execute([$id]); }
    suivi_fill_uuids($pdo);
    $uuidOf = static function (string $table, int $id) use ($pdo): string { $s = $pdo->prepare("SELECT uuid FROM $table WHERE " . ($table === 'animal_profiles' ? 'pet_id' : 'id') . '=?'); $s->execute([$id]); return (string) $s->fetchColumn(); };
    $media = []; $mediaKey = static function (?int $id) use (&$media, $photos): ?string { if (!$photos || !$id) { return null; } $k = 'm' . $id; $media[$k] = $id; return $k; };
    $people = static fn(?int $id, string $txt, array $pp) => $names ? ($id ? ($pp[$id]['name'] ?? '') : $txt) : '';
    $siteUuid = []; $groupUuid = [];
    foreach ($pdo->query('SELECT id, uuid FROM track_sites') as $r) { $siteUuid[(int) $r['id']] = (string) $r['uuid']; }
    foreach ($pdo->query('SELECT id, uuid FROM animal_groups') as $r) { $groupUuid[(int) $r['id']] = (string) $r['uuid']; }
    $petUuid = [];
    foreach ($pdo->query('SELECT pet_id, uuid FROM animal_profiles') as $r) { $petUuid[(int) $r['pet_id']] = (string) $r['uuid']; }
    $animals = []; $usedSites = []; $usedGroups = [];
    foreach ($pick as $a) {
        $d = suivi_animal($pdo, $a['id']); $pr = $d['profile'] ?? [];
        $raw = $pdo->prepare('SELECT * FROM animal_profiles WHERE pet_id=?'); $raw->execute([$a['id']]); $praw = $raw->fetch(PDO::FETCH_ASSOC) ?: [];
        $pp = suivi_people($pdo, [$praw['ringer_id'] ?? 0, ...array_column($d['observations'], 'observer_id'), ...array_column($d['health'], 'carer_id')]);
        $petMedia = $photos && function_exists('pet_media') ? array_slice(pet_media($pdo, [$a['id']])[$a['id']] ?? [], 0, 20) : [];
        $obs = [];
        foreach ($d['observations'] as $o) {
            if ($o['pet_id'] !== $a['id']) { continue; } // une observation part avec son animal (pas avec un compagnon)
            if ($o['site_id']) { $usedSites[$o['site_id']] = true; }
            $orow = suivi_row($pdo, 'animal_observations', $o['id']);
            $obs[] = ['uuid' => (string) $orow['uuid'], 'date' => $o['date'], 'time' => $o['time'], 'lat' => $o['lat'], 'lon' => $o['lon'], 'place' => $o['place_id'] ? suivi_place_out(suivi_places($pdo, [$o['place_id']])[$o['place_id']] ?? null) : null,
                'place_text' => $o['place_text'], 'site' => $o['site_id'] ? ($siteUuid[$o['site_id']] ?? '') : '', 'behaviors' => $o['behaviors'], 'count' => $o['count'],
                'with' => array_values(array_filter(array_map(static fn($w) => $petUuid[$w] ?? '', $o['with']))), 'reading' => $o['reading'], 'reading_detail' => $o['reading_detail'], 'reliability' => $o['reliability'],
                'observer' => $people($o['observer_id'], (string) $orow['observer_txt'], $pp), 'note' => $o['note'], 'source' => $o['source'], 'sea' => $o['sea'], 'media' => $mediaKey($o['media_id'])];
        }
        $marks = array_map(static function ($m) use ($pdo, $mediaKey) { $r = suivi_row($pdo, 'animal_marks', $m['id']); return ['uuid' => (string) $r['uuid'], 'kind' => $m['kind'], 'code' => $m['code'], 'colors' => $m['colors'], 'position' => $m['position'], 'scheme' => $m['scheme'], 'model' => $m['model'], 'interval_min' => $m['interval_min'], 'start_date' => $m['start_date'], 'end_date' => $m['end_date'], 'end_reason' => $m['end_reason'], 'note' => $m['note'], 'media' => $mediaKey($m['media_id'])]; }, $d['marks']);
        $health = array_map(static function ($h) use ($pdo, $mediaKey, $people, $pp) { $r = suivi_row($pdo, 'animal_health', $h['id']); return ['uuid' => (string) $r['uuid'], 'date' => $h['date'], 'state' => $h['state'], 'what_kind' => $h['what_kind'], 'what_text' => $h['what_text'], 'cause' => $h['cause'], 'cause_text' => $h['cause_text'], 'place' => $h['place_id'] ? suivi_place_out(suivi_places($pdo, [$h['place_id']])[$h['place_id']] ?? null) : null, 'place_text' => $h['place_id'] ? '' : (string) $r['place_text'], 'carer' => $people($h['carer_id'], (string) $r['carer_txt'], $pp), 'care' => $h['care'], 'meds' => $h['meds'], 'weight_g' => $h['weight_g'], 'media' => array_values(array_filter(array_map($mediaKey, $h['media_ids']))), 'outcome' => $h['outcome'], 'outcome_date' => $h['outcome_date'], 'note' => $h['note']]; }, $d['health']);
        $members = array_map(static function ($m) use ($pdo, &$usedGroups, $groupUuid) { $usedGroups[$m['group_id']] = true; $r = suivi_row($pdo, 'animal_memberships', $m['id']); return ['uuid' => (string) $r['uuid'], 'group' => $groupUuid[$m['group_id']] ?? '', 'role' => $m['role'], 'start_date' => $m['start_date'], 'start_reason' => $m['start_reason'], 'end_date' => $m['end_date'], 'end_reason' => $m['end_reason'], 'note' => $m['note']]; }, $d['members']);
        $gps = [];
        if ($withGps && $d['gps']['n']) { $g = $pdo->prepare('SELECT t, lat, lon, alt FROM animal_gps WHERE pet_id=? ORDER BY t LIMIT 200000'); $g->execute([$a['id']]); foreach ($g->fetchAll(PDO::FETCH_NUM) as $r) { $gps[] = [(int) $r[0], (float) $r[1], (float) $r[2], $r[3] !== null ? (float) $r[3] : null]; } }
        $animals[] = ['uuid' => $petUuid[$a['id']] ?? '', 'name' => $d['title'], 'species' => $d['species'], 'sex' => $d['sex'], 'breed' => $d['breed'], 'birth_date' => $d['birth_date'], 'deceased' => $d['deceased'],
            'microchip' => $d['microchip'], 'tattoo' => $d['tattoo'], 'taxon' => (string) ($pr['taxon'] ?? ''), 'sci_name' => (string) ($pr['sci_name'] ?? ''), 'profile' => (string) ($pr['profile'] ?? ''), 'status' => (string) ($pr['status'] ?? 'suivi'),
            'ringed_date' => (string) ($pr['ringed_date'] ?? ''), 'ringed_place' => suivi_place_out($pr['ringed_place'] ?? null), 'ringer' => $names ? (string) ($pr['ringer'] ?? '') : '', 'age_class' => (string) ($pr['age_class'] ?? ''), 'program' => (string) ($pr['program'] ?? ''), 'note' => (string) ($pr['note'] ?? ''),
            'photos' => array_values(array_filter(array_map(static fn($m) => $mediaKey((int) $m['id']), $petMedia))), 'marks' => $marks, 'observations' => $obs, 'health' => $health, 'members' => $members, 'gps' => $gps];
    }
    $all = $scope === 'all';
    $sites = []; $counts = $pdo->query('SELECT * FROM track_counts ORDER BY c_iso, id')->fetchAll(PDO::FETCH_ASSOC);
    $cpp = $names ? suivi_people($pdo, array_column($counts, 'observer_id')) : [];
    if ($scope === 'site') { $usedSites[safe_int($q['site'] ?? 0)] = true; }
    foreach ($ov['sites'] as $st) {
        if (!$all && !isset($usedSites[$st['id']])) { continue; }
        $sites[] = ['uuid' => $siteUuid[$st['id']] ?? '', 'name' => $st['name'], 'kind' => $st['kind'], 'place' => suivi_place_out($st['place']), 'lat' => $st['lat'], 'lon' => $st['lon'], 'area_ha' => $st['area_ha'], 'since' => $st['since'], 'outline' => $st['outline'], 'note' => $st['note'],
            'counts' => array_values(array_map(static fn($c) => ['uuid' => (string) $c['uuid'], 'date' => (string) $c['c_date'], 'time' => (string) $c['c_time'], 'what' => (string) $c['what'], 'what_text' => (string) $c['what_text'], 'number' => $c['number'] !== null ? (int) $c['number'] : null, 'unit' => (string) $c['unit'], 'observer' => $names ? ($c['observer_id'] ? ($cpp[(int) $c['observer_id']]['name'] ?? '') : (string) $c['observer_txt']) : '', 'note' => (string) $c['note']], array_filter($counts, static fn($c) => (int) $c['site_id'] === $st['id'])))];
    }
    $groups = [];
    foreach ($ov['groups'] as $g) {
        if (!$all && !isset($usedGroups[$g['id']])) { continue; }
        $groups[] = ['uuid' => $groupUuid[$g['id']] ?? '', 'name' => $g['name'], 'kind' => $g['kind'], 'species' => $g['species'], 'territory' => $g['territory'], 'site' => $g['site_id'] ? ($siteUuid[$g['site_id']] ?? '') : '', 'place' => suivi_place_out($g['place']), 'note' => $g['note']];
    }
    $free = [];
    if ($all || $scope === 'site') {
        $siteId = safe_int($q['site'] ?? 0);
        foreach ($pdo->query('SELECT * FROM animal_observations WHERE pet_id IS NULL ORDER BY obs_iso') as $o) {
            if ($scope === 'site' && (int) $o['site_id'] !== $siteId) { continue; }
            $free[] = ['uuid' => (string) $o['uuid'], 'date' => (string) $o['obs_date'], 'time' => (string) $o['obs_time'], 'lat' => $o['lat'] !== null ? (float) $o['lat'] : null, 'lon' => $o['lon'] !== null ? (float) $o['lon'] : null, 'place' => $o['place_id'] ? suivi_place_out(suivi_places($pdo, [$o['place_id']])[(int) $o['place_id']] ?? null) : null, 'place_text' => (string) $o['place_text'], 'site' => $o['site_id'] ? ($siteUuid[(int) $o['site_id']] ?? '') : '', 'behaviors' => array_values(array_filter(explode(',', (string) $o['behaviors']))), 'count' => $o['count'] !== null ? (int) $o['count'] : null, 'reading' => (string) $o['reading_raw'], 'reliability' => (string) $o['reliability'], 'note' => (string) $o['note'], 'source' => (string) $o['source']];
        }
    }
    $mrows = [];
    if ($media) {
        $s = $pdo->prepare('SELECT id, filename, title, media_type FROM media WHERE id IN (' . implode(',', array_fill(0, count($media), '?')) . ')'); $s->execute(array_values($media));
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $m) { $ext = strtolower(pathinfo((string) $m['filename'], PATHINFO_EXTENSION)); if (!preg_match('/^(jpe?g|png|gif|webp|mp3|m4a|ogg|wav|mp4|webm)$/', $ext)) { continue; } $mrows[] = ['key' => 'm' . $m['id'], 'file' => 'medias/m' . $m['id'] . '.' . $ext, 'url' => 'media/' . rawurlencode((string) $m['filename']), 'title' => (string) $m['title'], 'type' => (string) $m['media_type']]; }
    }
    return ['format' => 'lcnda-suivi', 'version' => 1, 'exported_at' => date('c'), 'scope' => $scope, 'names' => $names, 'animals' => $animals, 'sites' => $sites, 'groups' => $groups, 'free_observations' => $free, 'media' => array_slice($mrows, 0, SUIVI_SHARE_MAX['media'])];
}

/* ═════════ Recevoir ═════════ */
function suivi_share_write(PDO $pdo, string $op, array $data): array
{
    if ($op === 'share_undo') { return suivi_share_undo($pdo, safe_int($data['receipt'] ?? 0)); }
    $pkg = suivi_share_clean(is_array($data['package'] ?? null) ? $data['package'] : []);
    $an = suivi_share_analyze($pdo, $pkg);
    if ($op === 'share_analyze') { return $an; }
    return suivi_share_apply($pdo, $pkg, $an, is_array($data['decisions'] ?? null) ? $data['decisions'] : [], is_array($data['media_map'] ?? null) ? $data['media_map'] : [], suivi_txt($data['source'] ?? '', 120));
}

/** Le paquet reçu, remis d'aplomb (format, tailles, sortes) : rien n'est cru tel quel */
function suivi_share_clean(array $p): array
{
    if (($p['format'] ?? '') !== 'lcnda-suivi' || (int) ($p['version'] ?? 0) !== 1) { throw new RuntimeException('Ce fichier n’est pas un suivi d’animaux partagé (format inconnu).'); }
    $arr = static fn($v, int $max, string $what) => is_array($v) ? (count($v) > $max ? throw new RuntimeException("Fichier trop gros : trop de $what.") : array_values(array_filter($v, 'is_array'))) : [];
    $uu = static fn($v) => is_string($v) && preg_match('/^[0-9a-f-]{8,40}$/i', $v) ? strtolower($v) : '';
    $place = static fn($v) => is_array($v) && suivi_txt($v['name'] ?? '', 200) !== '' ? ['name' => suivi_txt($v['name'], 200), 'county' => suivi_txt($v['county'] ?? '', 120), 'country' => suivi_txt($v['country'] ?? '', 120), 'lat' => suivi_float($v['lat'] ?? null, -90, 90), 'lon' => suivi_float($v['lon'] ?? null, -180, 180)] : null;
    $obsClean = static fn(array $o) => ['uuid' => $uu($o['uuid'] ?? ''), 'date' => suivi_txt($o['date'] ?? '', 60), 'time' => suivi_time($o['time'] ?? ''), 'lat' => suivi_float($o['lat'] ?? null, -90, 90), 'lon' => suivi_float($o['lon'] ?? null, -180, 180),
        'place' => $place($o['place'] ?? null), 'place_text' => suivi_txt($o['place_text'] ?? '', 200), 'site' => $uu($o['site'] ?? ''), 'behaviors' => array_slice(array_values(array_filter(array_map(static fn($b) => suivi_txt($b, 40), is_array($o['behaviors'] ?? null) ? $o['behaviors'] : []))), 0, 12),
        'count' => isset($o['count']) && is_numeric($o['count']) ? max(0, min(10000000, (int) $o['count'])) : null, 'with' => array_values(array_filter(array_map($uu, is_array($o['with'] ?? null) ? array_slice($o['with'], 0, 50) : []))),
        'reading' => suivi_txt($o['reading'] ?? '', 80), 'reading_detail' => is_array($o['reading_detail'] ?? null) ? $o['reading_detail'] : null, 'reliability' => in_array($o['reliability'] ?? '', SUIVI_RELIABILITY, true) ? $o['reliability'] : '',
        'observer' => suivi_txt($o['observer'] ?? '', 200), 'note' => suivi_txt($o['note'] ?? '', 4000), 'source' => in_array($o['source'] ?? '', SUIVI_SOURCES, true) ? $o['source'] : 'manuel', 'sea' => is_array($o['sea'] ?? null) ? $o['sea'] : null, 'media' => is_string($o['media'] ?? null) && preg_match('/^m\d{1,10}$/', $o['media']) ? $o['media'] : null];
    $animals = []; $nObs = 0; $nGps = 0; $nLines = 0;
    foreach ($arr($p['animals'] ?? null, SUIVI_SHARE_MAX['animals'], 'animaux') as $a) {
        $obs = array_map($obsClean, $arr($a['observations'] ?? null, SUIVI_SHARE_MAX['observations'], 'observations'));
        $nObs += count($obs);
        $gps = [];
        foreach (is_array($a['gps'] ?? null) ? $a['gps'] : [] as $g) { if (!is_array($g)) { continue; } $t = safe_int($g[0] ?? 0); $la = suivi_float($g[1] ?? null, -90, 90); $lo = suivi_float($g[2] ?? null, -180, 180); if ($t && $la !== null && $lo !== null) { $gps[] = [$t, $la, $lo, suivi_float($g[3] ?? null, -500, 10000)]; } }
        $nGps += count($gps);
        $marks = array_map(static fn($m) => ['uuid' => $uu($m['uuid'] ?? ''), 'kind' => in_array($m['kind'] ?? '', SUIVI_MARK_KINDS, true) ? $m['kind'] : 'other', 'code' => suivi_txt($m['code'] ?? '', 80), 'colors' => is_array($m['colors'] ?? null) ? $m['colors'] : null, 'position' => suivi_txt($m['position'] ?? '', 120), 'scheme' => suivi_txt($m['scheme'] ?? '', 120), 'model' => suivi_txt($m['model'] ?? '', 120), 'interval_min' => isset($m['interval_min']) && is_numeric($m['interval_min']) ? (int) $m['interval_min'] : null, 'start_date' => suivi_txt($m['start_date'] ?? '', 60), 'end_date' => suivi_txt($m['end_date'] ?? '', 60), 'end_reason' => suivi_txt($m['end_reason'] ?? '', 200), 'note' => suivi_txt($m['note'] ?? '', 2000), 'media' => is_string($m['media'] ?? null) && preg_match('/^m\d{1,10}$/', $m['media']) ? $m['media'] : null], $arr($a['marks'] ?? null, 500, 'marques'));
        $health = array_map(static fn($h) => ['uuid' => $uu($h['uuid'] ?? ''), 'date' => suivi_txt($h['date'] ?? '', 60), 'state' => in_array($h['state'] ?? '', SUIVI_HEALTH_STATES, true) ? $h['state'] : '', 'what_kind' => suivi_txt($h['what_kind'] ?? '', 40), 'what_text' => suivi_txt($h['what_text'] ?? '', 600), 'cause' => suivi_txt($h['cause'] ?? '', 40), 'cause_text' => suivi_txt($h['cause_text'] ?? '', 600), 'place' => $place($h['place'] ?? null), 'place_text' => suivi_txt($h['place_text'] ?? '', 200), 'carer' => suivi_txt($h['carer'] ?? '', 200), 'care' => suivi_txt($h['care'] ?? '', 2000), 'meds' => suivi_txt($h['meds'] ?? '', 2000), 'weight_g' => suivi_float($h['weight_g'] ?? null, 0, 20000000), 'media' => array_values(array_filter(is_array($h['media'] ?? null) ? $h['media'] : [], static fn($k) => is_string($k) && preg_match('/^m\d{1,10}$/', $k))), 'outcome' => in_array($h['outcome'] ?? '', ['', 'relache', 'mort'], true) ? $h['outcome'] : '', 'outcome_date' => suivi_txt($h['outcome_date'] ?? '', 60), 'note' => suivi_txt($h['note'] ?? '', 4000)], $arr($a['health'] ?? null, 5000, 'événements de santé'));
        $members = array_map(static fn($m) => ['uuid' => $uu($m['uuid'] ?? ''), 'group' => $uu($m['group'] ?? ''), 'role' => suivi_txt($m['role'] ?? '', 60), 'start_date' => suivi_txt($m['start_date'] ?? '', 60), 'start_reason' => in_array($m['start_reason'] ?? '', SUIVI_START_REASONS, true) ? $m['start_reason'] : 'entree', 'end_date' => suivi_txt($m['end_date'] ?? '', 60), 'end_reason' => in_array($m['end_reason'] ?? '', SUIVI_END_REASONS, true) ? $m['end_reason'] : '', 'note' => suivi_txt($m['note'] ?? '', 2000)], $arr($a['members'] ?? null, 500, 'groupes'));
        $nLines += count($marks) + count($health) + count($members);
        $animals[] = ['uuid' => $uu($a['uuid'] ?? ''), 'name' => suivi_txt($a['name'] ?? '', 120) ?: 'Animal sans nom', 'species' => array_key_exists((string) ($a['species'] ?? ''), PET_SPECIES) ? (string) $a['species'] : 'autre', 'sex' => in_array($a['sex'] ?? '', ['M', 'F'], true) ? $a['sex'] : '',
            'breed' => suivi_txt($a['breed'] ?? '', 120), 'birth_date' => suivi_txt($a['birth_date'] ?? '', 40), 'deceased' => !empty($a['deceased']), 'microchip' => suivi_txt($a['microchip'] ?? '', 40), 'tattoo' => suivi_txt($a['tattoo'] ?? '', 40),
            'taxon' => suivi_txt($a['taxon'] ?? '', 120), 'sci_name' => suivi_txt($a['sci_name'] ?? '', 120), 'profile' => in_array($a['profile'] ?? '', SUIVI_PROFILES, true) ? $a['profile'] : '', 'status' => in_array($a['status'] ?? '', ['suivi', 'pause', 'fini', 'perdu'], true) ? $a['status'] : 'suivi',
            'ringed_date' => suivi_txt($a['ringed_date'] ?? '', 60), 'ringed_place' => $place($a['ringed_place'] ?? null), 'ringer' => suivi_txt($a['ringer'] ?? '', 200), 'age_class' => in_array($a['age_class'] ?? '', ['', 'poussin', 'jeune', 'adulte', 'inconnu'], true) ? $a['age_class'] : '',
            'program' => suivi_txt($a['program'] ?? '', 200), 'note' => suivi_txt($a['note'] ?? '', 4000), 'photos' => array_values(array_filter(is_array($a['photos'] ?? null) ? array_slice($a['photos'], 0, 20) : [], static fn($k) => is_string($k) && preg_match('/^m\d{1,10}$/', $k))),
            'marks' => $marks, 'observations' => $obs, 'health' => $health, 'members' => $members, 'gps' => $gps];
    }
    if ($nObs > SUIVI_SHARE_MAX['observations']) { throw new RuntimeException('Fichier trop gros : trop d’observations.'); }
    if ($nGps > SUIVI_SHARE_MAX['gps']) { throw new RuntimeException('Fichier trop gros : trop de points GPS (500 000 au plus).'); }
    if ($nLines > SUIVI_SHARE_MAX['lines']) { throw new RuntimeException('Fichier trop gros : trop de lignes.'); }
    $sites = array_map(static fn($s) => ['uuid' => $uu($s['uuid'] ?? ''), 'name' => suivi_txt($s['name'] ?? '', 160) ?: 'Site', 'kind' => suivi_txt($s['kind'] ?? '', 60), 'place' => $place($s['place'] ?? null), 'lat' => suivi_float($s['lat'] ?? null, -90, 90), 'lon' => suivi_float($s['lon'] ?? null, -180, 180), 'area_ha' => suivi_float($s['area_ha'] ?? null, 0, 1e9), 'since' => suivi_txt($s['since'] ?? '', 60), 'outline' => is_array($s['outline'] ?? null) ? array_slice($s['outline'], 0, 400) : [], 'note' => suivi_txt($s['note'] ?? '', 4000),
        'counts' => array_map(static fn($c) => ['uuid' => $uu($c['uuid'] ?? ''), 'date' => suivi_txt($c['date'] ?? '', 60), 'time' => suivi_time($c['time'] ?? ''), 'what' => suivi_txt($c['what'] ?? '', 40), 'what_text' => suivi_txt($c['what_text'] ?? '', 200), 'number' => isset($c['number']) && is_numeric($c['number']) ? max(0, min(100000000, (int) $c['number'])) : null, 'unit' => suivi_txt($c['unit'] ?? '', 40), 'observer' => suivi_txt($c['observer'] ?? '', 200), 'note' => suivi_txt($c['note'] ?? '', 2000)], array_slice(array_values(array_filter(is_array($s['counts'] ?? null) ? $s['counts'] : [], 'is_array')), 0, 5000))], $arr($p['sites'] ?? null, 2000, 'sites'));
    $groups = array_map(static fn($g) => ['uuid' => $uu($g['uuid'] ?? ''), 'name' => suivi_txt($g['name'] ?? '', 160) ?: 'Groupe', 'kind' => suivi_txt($g['kind'] ?? 'groupe', 40) ?: 'groupe', 'species' => suivi_txt($g['species'] ?? '', 120), 'territory' => suivi_txt($g['territory'] ?? '', 300), 'site' => $uu($g['site'] ?? ''), 'place' => $place($g['place'] ?? null), 'note' => suivi_txt($g['note'] ?? '', 4000)], $arr($p['groups'] ?? null, 2000, 'groupes'));
    $free = array_map($obsClean, $arr($p['free_observations'] ?? null, SUIVI_SHARE_MAX['observations'], 'observations'));
    return ['animals' => $animals, 'sites' => $sites, 'groups' => $groups, 'free_observations' => $free];
}

/** Ce qui compte pour dire « c'est la même ligne » (doublon exact) */
function suivi_sig(string $kind, array $r): string
{
    $n = static fn($v) => mb_strtolower(trim((string) $v));
    return match ($kind) {
        'obs' => implode('|', [suivi_iso($r['date'] ?? ''), $n($r['time'] ?? ''), round((float) ($r['lat'] ?? 0), 4), round((float) ($r['lon'] ?? 0), 4), $n($r['reading'] ?? ''), $n($r['note'] ?? ''), $r['count'] ?? '']),
        'mark' => implode('|', [$r['kind'] ?? '', suivi_norm((string) ($r['code'] ?? '')), suivi_iso($r['start_date'] ?? ''), suivi_iso($r['end_date'] ?? ''), json_encode($r['colors'] ?? null)]),
        'health' => implode('|', [suivi_iso($r['date'] ?? ''), $r['state'] ?? '', $n($r['what_text'] ?? ''), $r['cause'] ?? '', $r['weight_g'] ?? '', $n($r['care'] ?? '')]),
        'member' => implode('|', [$r['group'] ?? '', $n($r['role'] ?? ''), suivi_iso($r['start_date'] ?? ''), suivi_iso($r['end_date'] ?? ''), $r['end_reason'] ?? '']),
        'count' => implode('|', [suivi_iso($r['date'] ?? ''), $n($r['time'] ?? ''), $r['what'] ?? '', $r['number'] ?? '']),
        default => json_encode($r),
    };
}

/** Une ligne locale au format du paquet (pour comparer et montrer « le mien ») */
function suivi_local_lines(PDO $pdo, int $petId): array
{
    if (!$petId) { return ['obs' => [], 'mark' => [], 'health' => [], 'member' => []]; }
    $out = ['obs' => [], 'mark' => [], 'health' => [], 'member' => []];
    $gu = []; foreach ($pdo->query('SELECT id, uuid FROM animal_groups') as $r) { $gu[(int) $r['id']] = (string) $r['uuid']; }
    $s = $pdo->prepare('SELECT * FROM animal_observations WHERE pet_id=?'); $s->execute([$petId]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $o) { $out['obs'][] = ['id' => (int) $o['id'], 'uuid' => (string) $o['uuid'], 'date' => (string) $o['obs_date'], 'time' => (string) $o['obs_time'], 'lat' => $o['lat'], 'lon' => $o['lon'], 'reading' => (string) $o['reading_raw'], 'note' => (string) $o['note'], 'count' => $o['count'] !== null ? (int) $o['count'] : null, 'reliability' => (string) $o['reliability'], 'place_text' => (string) $o['place_text']]; }
    $s = $pdo->prepare('SELECT * FROM animal_marks WHERE pet_id=?'); $s->execute([$petId]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $m) { $out['mark'][] = ['id' => (int) $m['id'], 'uuid' => (string) $m['uuid'], 'kind' => (string) $m['kind'], 'code' => (string) $m['code'], 'start_date' => (string) $m['start_date'], 'end_date' => (string) $m['end_date'], 'colors' => json_decode((string) $m['colors_json'], true) ?: null]; }
    $s = $pdo->prepare('SELECT * FROM animal_health WHERE pet_id=?'); $s->execute([$petId]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $h) { $out['health'][] = ['id' => (int) $h['id'], 'uuid' => (string) $h['uuid'], 'date' => (string) $h['ev_date'], 'state' => (string) $h['state'], 'what_text' => (string) $h['what_text'], 'cause' => (string) $h['cause'], 'weight_g' => $h['weight_g'] !== null ? (float) $h['weight_g'] : null, 'care' => (string) $h['care']]; }
    $s = $pdo->prepare('SELECT * FROM animal_memberships WHERE pet_id=?'); $s->execute([$petId]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $m) { $out['member'][] = ['id' => (int) $m['id'], 'uuid' => (string) $m['uuid'], 'group' => $gu[(int) $m['group_id']] ?? '', 'role' => (string) $m['role'], 'start_date' => (string) $m['start_date'], 'end_date' => (string) $m['end_date'], 'end_reason' => (string) $m['end_reason']]; }
    return $out;
}

function suivi_line_text(string $kind, array $r): string
{
    return match ($kind) {
        'obs' => trim(implode(' · ', array_filter([$r['date'] ?? '', $r['time'] ?? '', isset($r['lat']) && $r['lat'] !== null ? round((float) $r['lat'], 4) . ', ' . round((float) $r['lon'], 4) : '', ($r['reading'] ?? '') !== '' ? 'lecture ' . $r['reading'] : '', $r['note'] ?? '', isset($r['count']) && $r['count'] !== null ? $r['count'] . ' vus' : '']))),
        'mark' => trim(implode(' · ', array_filter([$r['kind'] ?? '', $r['code'] ?? '', ($r['start_date'] ?? '') !== '' ? 'posée le ' . $r['start_date'] : '', ($r['end_date'] ?? '') !== '' ? 'retirée le ' . $r['end_date'] : '']))),
        'health' => trim(implode(' · ', array_filter([$r['date'] ?? '', $r['state'] ?? '', $r['what_text'] ?? '', $r['cause'] ?? '', isset($r['weight_g']) && $r['weight_g'] !== null ? round((float) $r['weight_g']) . ' g' : '']))),
        'member' => trim(implode(' · ', array_filter([$r['role'] ?? '', ($r['start_date'] ?? '') !== '' ? 'depuis ' . $r['start_date'] : '', ($r['end_date'] ?? '') !== '' ? 'jusqu’au ' . $r['end_date'] : '', $r['end_reason'] ?? '']))),
        default => '',
    };
}

/** Le même animal chez moi : par son identifiant, sinon par une marque (bague, puce, tatouage, balise) */
function suivi_share_match(PDO $pdo, array $a): array
{
    if ($a['uuid'] !== '') { $s = $pdo->prepare('SELECT pet_id FROM animal_profiles WHERE uuid=?'); $s->execute([$a['uuid']]); if ($id = (int) $s->fetchColumn()) { return [$id, 'identifiant']; } }
    foreach ($a['marks'] as $m) {
        $codes = [suivi_norm($m['code'])];
        foreach (['L', 'R'] as $l) { foreach ([0, 1] as $i) { $c = $m['colors'][$l][$i]['code'] ?? ''; if (is_string($c) && $c !== '') { $codes[] = suivi_norm($c); } } }
        foreach (array_unique(array_filter($codes, static fn($c) => strlen($c) >= 4 || ($m['kind'] !== 'color_rings' && strlen($c) >= 3))) as $c) {
            $s = $pdo->prepare('SELECT pet_id FROM animal_marks WHERE kind=? AND code_norm=? LIMIT 1'); $s->execute([$m['kind'], $c]);
            if ($id = (int) $s->fetchColumn()) { return [$id, ($GLOBALS['__suivi_mark_labels'][$m['kind']] ?? 'marque') . ' ' . $m['code']]; }
        }
    }
    foreach (['microchip', 'tattoo'] as $k) {
        if (strlen(suivi_norm($a[$k])) < 6) { continue; }
        foreach ($pdo->query('SELECT id, data_json FROM pets') as $r) { $d = json_decode((string) $r['data_json'], true) ?: []; if (suivi_norm((string) ($d[$k] ?? '')) === suivi_norm($a[$k])) { return [(int) $r['id'], $k === 'microchip' ? 'puce' : 'tatouage']; } }
        $s = $pdo->prepare("SELECT pet_id FROM animal_marks WHERE kind=? AND code_norm=? LIMIT 1"); $s->execute([$k === 'microchip' ? 'chip' : 'tattoo', suivi_norm($a[$k])]);
        if ($id = (int) $s->fetchColumn()) { return [$id, $k === 'microchip' ? 'puce' : 'tatouage']; }
    }
    return [0, ''];
}

function suivi_local_animal(PDO $pdo, int $id): array
{
    $r = pet_row($pdo, $id); $d = $r['d'] ?? [];
    $s = $pdo->prepare('SELECT * FROM animal_profiles WHERE pet_id=?'); $s->execute([$id]); $p = $s->fetch(PDO::FETCH_ASSOC) ?: [];
    return ['name' => pet_title($d), 'species' => (string) ($d['species'] ?? ''), 'sex' => (string) ($d['sex'] ?? ''), 'taxon' => (string) ($p['taxon'] ?? ''), 'sci_name' => (string) ($p['sci_name'] ?? ''), 'profile' => (string) ($p['profile'] ?? ''),
        'status' => (string) ($p['status'] ?? ''), 'ringed_date' => (string) ($p['ringed_date'] ?? ''), 'age_class' => (string) ($p['age_class'] ?? ''), 'program' => (string) ($p['program'] ?? ''), 'birth_date' => (string) ($d['birth_date'] ?? ''), 'deceased' => !empty($d['deceased']) ? '1' : ''];
}

function suivi_share_analyze(PDO $pdo, array $pkg): array
{
    suivi_fill_uuids($pdo);
    $out = ['animals' => [], 'sites' => [], 'groups' => [], 'summary' => ['animals_new' => 0, 'animals_match' => 0, 'lines_new' => 0, 'lines_dup' => 0, 'conflicts' => 0, 'gps' => 0, 'free_new' => 0]];
    $GLOBALS['__suivi_mark_labels'] = ['metal' => 'bague métal', 'color_rings' => 'bagues', 'chip' => 'puce', 'tattoo' => 'tatouage', 'gps_tag' => 'balise', 'gps_collar' => 'collier GPS', 'ear_tag' => 'boucle', 'photo_id' => 'photo-identification', 'satellite' => 'balise Argos', 'pit' => 'PIT'];
    foreach ($pkg['animals'] as $a) {
        [$tid, $by] = suivi_share_match($pdo, $a);
        $row = ['uuid' => $a['uuid'], 'name' => $a['name'], 'species' => $a['species'], 'taxon' => $a['taxon'], 'status' => $tid ? 'match' : 'new', 'target_id' => $tid, 'target_title' => '', 'match_by' => $by, 'fields' => [], 'filled' => [], 'lines' => [], 'gps' => count($a['gps'])];
        $out['summary']['gps'] += count($a['gps']);
        if ($tid) {
            $mine = suivi_local_animal($pdo, $tid); $row['target_title'] = $mine['name'];
            $theirs = ['deceased' => $a['deceased'] ? '1' : ''] + $a;
            foreach (SUIVI_ANIMAL_FIELDS as $f => $label) {
                $m = (string) ($mine[$f] ?? ''); $t = (string) ($theirs[$f] ?? '');
                if ($t === '' || $m === $t) { continue; }
                if ($m === '' || ($f === 'status' && $m === 'suivi' && $t === 'suivi')) { $row['filled'][] = ['field' => $f, 'label' => $label, 'theirs' => $t]; continue; }
                $row['fields'][] = ['field' => $f, 'label' => $label, 'mine' => $m, 'theirs' => $t]; $out['summary']['conflicts']++;
            }
            $out['summary']['animals_match']++;
        } else { $out['summary']['animals_new']++; }
        $local = suivi_local_lines($pdo, $tid);
        foreach (['mark' => 'marks', 'obs' => 'observations', 'health' => 'health', 'member' => 'members'] as $k => $list) {
            $byUuid = []; $bySig = [];
            foreach ($local[$k] as $l) { if ($l['uuid'] !== '') { $byUuid[$l['uuid']] = $l; } $bySig[suivi_sig($k, $l)] = $l; }
            // une ligne de même uuid peut aussi être ailleurs chez moi (sur une autre fiche) : on la cherche dans toute la table
            foreach ($a[$list] as $it) {
                $sig = suivi_sig($k, $it); $l = $it['uuid'] !== '' ? ($byUuid[$it['uuid']] ?? null) : null;
                if ($l && suivi_sig($k, $l) === $sig) { $st = 'dup'; }
                elseif ($l) { $st = 'conflict'; $out['summary']['conflicts']++; }
                elseif (isset($bySig[$sig])) { $st = 'dup'; }
                else { $st = 'new'; }
                if ($st === 'dup') { $out['summary']['lines_dup']++; } elseif ($st === 'new') { $out['summary']['lines_new']++; }
                if ($st !== 'dup') { $row['lines'][] = ['kind' => $k, 'uuid' => $it['uuid'], 'status' => $st, 'theirs' => suivi_line_text($k, $it), 'mine' => $l ? suivi_line_text($k, $l) : '']; }
            }
        }
        $out['animals'][] = $row;
    }
    foreach ($pkg['sites'] as $s) { $id = suivi_share_find($pdo, 'track_sites', $s); $out['sites'][] = ['uuid' => $s['uuid'], 'name' => $s['name'], 'status' => $id ? 'match' : 'new', 'target_id' => $id]; }
    foreach ($pkg['groups'] as $g) { $id = suivi_share_find($pdo, 'animal_groups', $g); $out['groups'][] = ['uuid' => $g['uuid'], 'name' => $g['name'], 'status' => $id ? 'match' : 'new', 'target_id' => $id]; }
    $freeSigs = []; foreach ($pdo->query('SELECT uuid, obs_date, obs_time, lat, lon, reading_raw, note, count FROM animal_observations WHERE pet_id IS NULL') as $o) { $freeSigs[(string) $o['uuid']] = true; $freeSigs[suivi_sig('obs', ['date' => $o['obs_date'], 'time' => $o['obs_time'], 'lat' => $o['lat'], 'lon' => $o['lon'], 'reading' => $o['reading_raw'], 'note' => $o['note'], 'count' => $o['count']])] = true; }
    foreach ($pkg['free_observations'] as $o) { if (!isset($freeSigs[$o['uuid']]) && !isset($freeSigs[suivi_sig('obs', $o)])) { $out['summary']['free_new']++; } }
    return $out;
}

/** Un site ou un groupe : par identifiant, sinon par le nom */
function suivi_share_find(PDO $pdo, string $table, array $r): int
{
    if ($r['uuid'] !== '') { $s = $pdo->prepare("SELECT id FROM $table WHERE uuid=?"); $s->execute([$r['uuid']]); if ($id = (int) $s->fetchColumn()) { return $id; } }
    $s = $pdo->prepare("SELECT id FROM $table WHERE lower(name)=lower(?) LIMIT 1"); $s->execute([$r['name']]);
    return (int) $s->fetchColumn();
}

/** Un lieu reçu : le même chez moi (nom et pays, ou nom tout près), sinon créé */
function suivi_share_place(PDO $pdo, ?array $p, array &$undo): ?int
{
    if (!$p) { return null; }
    $s = $pdo->prepare('SELECT id, latitude, longitude FROM places WHERE lower(name)=lower(?) ORDER BY id'); $s->execute([$p['name']]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        if ($p['lat'] === null || $r['latitude'] === null || abs((float) $r['latitude'] - $p['lat']) + abs((float) $r['longitude'] - $p['lon']) < .2) { return (int) $r['id']; }
    }
    $pdo->prepare('INSERT INTO places(name, county, country, latitude, longitude) VALUES(?,?,?,?,?)')->execute([$p['name'], $p['county'], $p['country'], $p['lat'], $p['lon']]);
    $id = (int) $pdo->lastInsertId(); $undo['ins'][] = ['places', $id];
    return $id;
}

function suivi_share_apply(PDO $pdo, array $pkg, array $an, array $dec, array $mediaMap, string $source): array
{
    $undo = ['ins' => [], 'upd' => [], 'pets' => [], 'imports' => []];
    $media = static function ($k) use ($mediaMap) { $id = is_string($k) ? safe_int($mediaMap[$k] ?? 0) : 0; return $id > 0 ? $id : null; };
    $all = in_array($dec['all'] ?? '', ['mine', 'theirs'], true) ? $dec['all'] : '';
    $snap = static function (string $t, int $id) use ($pdo, &$undo) { $col = $t === 'animal_profiles' ? 'pet_id' : 'id'; $s = $pdo->prepare("SELECT * FROM $t WHERE $col=?"); $s->execute([$id]); if ($r = $s->fetch(PDO::FETCH_ASSOC)) { $undo['upd'][] = [$t, $id, $r]; } };
    $ins = static function (string $t, array $row) use ($pdo, &$undo): int { $cols = array_keys($row); $pdo->prepare("INSERT INTO $t(" . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute(array_values($row)); $id = (int) $pdo->lastInsertId(); $undo['ins'][] = [$t, $id]; return $id; };
    $n = ['animals_new' => 0, 'animals_merged' => 0, 'lines' => 0, 'replaced' => 0, 'gps' => 0];
    // sites et groupes : ceux qui manquent sont créés
    $siteMap = []; $groupMap = [];
    foreach ($pkg['sites'] as $s) {
        $id = suivi_share_find($pdo, 'track_sites', $s);
        if (!$id) { $id = $ins('track_sites', ['name' => $s['name'], 'kind' => $s['kind'], 'place_id' => suivi_share_place($pdo, $s['place'], $undo), 'lat' => $s['lat'], 'lon' => $s['lon'], 'area_ha' => $s['area_ha'], 'since' => $s['since'], 'outline_json' => $s['outline'] ? json_encode($s['outline']) : '', 'note' => $s['note'], 'uuid' => $s['uuid'] ?: suivi_new_uuid()]); }
        $siteMap[$s['uuid']] = $id;
        $have = []; $c = $pdo->prepare('SELECT uuid, c_date, c_time, what, number FROM track_counts WHERE site_id=?'); $c->execute([$id]);
        foreach ($c->fetchAll(PDO::FETCH_ASSOC) as $r) { $have[(string) $r['uuid']] = true; $have[suivi_sig('count', ['date' => $r['c_date'], 'time' => $r['c_time'], 'what' => $r['what'], 'number' => $r['number']])] = true; }
        foreach ($s['counts'] as $k) { if (($k['uuid'] !== '' && isset($have[$k['uuid']])) || isset($have[suivi_sig('count', $k)])) { continue; } $ins('track_counts', ['site_id' => $id, 'c_date' => $k['date'], 'c_iso' => suivi_iso($k['date']), 'c_time' => $k['time'], 'what' => $k['what'], 'what_text' => $k['what_text'], 'number' => $k['number'], 'unit' => $k['unit'], 'observer_txt' => $k['observer'], 'note' => $k['note'], 'uuid' => $k['uuid'] ?: suivi_new_uuid()]); $n['lines']++; }
    }
    foreach ($pkg['groups'] as $g) {
        $id = suivi_share_find($pdo, 'animal_groups', $g);
        if (!$id) { $id = $ins('animal_groups', ['name' => $g['name'], 'kind' => $g['kind'], 'species' => $g['species'], 'territory' => $g['territory'], 'site_id' => $siteMap[$g['site']] ?? null, 'place_id' => suivi_share_place($pdo, $g['place'], $undo), 'note' => $g['note'], 'uuid' => $g['uuid'] ?: suivi_new_uuid()]); }
        $groupMap[$g['uuid']] = $id;
    }
    $petMap = [];
    foreach ($pkg['animals'] as $i => $a) {
        $info = $an['animals'][$i]; $d = is_array($dec['animals'][$a['uuid'] ?: (string) $i] ?? null) ? $dec['animals'][$a['uuid'] ?: (string) $i] : [];
        if (($d['mode'] ?? '') === 'skip') { continue; }
        $tid = $info['status'] === 'match' && ($d['mode'] ?? 'merge') !== 'new' ? (int) $info['target_id'] : 0;
        if (!$tid) {
            $r = save_pet($pdo, ['data' => ['name' => $a['name'], 'species' => $a['species'], 'sex' => $a['sex'], 'breed' => $a['breed'], 'birth_date' => $a['birth_date'], 'deceased' => $a['deceased'], 'microchip' => $a['microchip'], 'tattoo' => $a['tattoo']]]);
            $tid = (int) $r['id']; $undo['pets'][] = $tid; $n['animals_new']++;
            $uuidTaken = $a['uuid'] !== '' && (function () use ($pdo, $a) { $s = $pdo->prepare('SELECT 1 FROM animal_profiles WHERE uuid=?'); $s->execute([$a['uuid']]); return (bool) $s->fetchColumn(); })();
            $pdo->prepare('INSERT OR REPLACE INTO animal_profiles(pet_id, taxon, sci_name, profile, status, ringed_date, ringed_iso, ringed_place_id, ringer_txt, program, age_class, note, uuid) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
                ->execute([$tid, $a['taxon'], $a['sci_name'], $a['profile'], $a['status'], $a['ringed_date'], suivi_iso($a['ringed_date']), suivi_share_place($pdo, $a['ringed_place'], $undo), $a['ringer'], $a['program'], $a['age_class'], $a['note'], $uuidTaken || $a['uuid'] === '' ? suivi_new_uuid() : $a['uuid']]);
            if ($a['photos'] && function_exists('link_collection_media')) { foreach ($a['photos'] as $k) { if ($mid = $media($k)) { try { link_collection_media($pdo, ['collection_type' => 'pet', 'collection_id' => $tid, 'media_id' => $mid]); } catch (Throwable) {} } } }
        } else {
            $n['animals_merged']++;
            // champs : « le sien » remplace le mien ; un champ vide chez moi est complété
            $take = [];
            foreach ($info['fields'] as $f) { $c = $all ?: (string) ($d['fields'][$f['field']] ?? 'mine'); if ($c === 'theirs') { $take[$f['field']] = true; } }
            foreach ($info['filled'] as $f) { $take[$f['field']] = true; }
            if ($take) {
                $snap('animal_profiles', $tid);
                $pdo->prepare("INSERT OR IGNORE INTO animal_profiles(pet_id, status, uuid) VALUES(?, 'suivi', ?)")->execute([$tid, suivi_new_uuid()]);
                foreach (['taxon', 'sci_name', 'profile', 'status', 'ringed_date', 'age_class', 'program'] as $f) { if (isset($take[$f])) { $pdo->prepare("UPDATE animal_profiles SET $f=?, updated_at=CURRENT_TIMESTAMP WHERE pet_id=?")->execute([$a[$f], $tid]); if ($f === 'ringed_date') { $pdo->prepare('UPDATE animal_profiles SET ringed_iso=? WHERE pet_id=?')->execute([suivi_iso($a[$f]), $tid]); } } }
                $petFields = array_intersect_key($take, ['name' => 1, 'species' => 1, 'sex' => 1, 'birth_date' => 1, 'deceased' => 1]);
                if ($petFields) {
                    $s = $pdo->prepare('SELECT * FROM pets WHERE id=?'); $s->execute([$tid]); $prow = $s->fetch(PDO::FETCH_ASSOC); $undo['upd'][] = ['pets', $tid, $prow];
                    $pd = json_decode((string) $prow['data_json'], true) ?: [];
                    foreach (array_keys($petFields) as $f) { $pd[$f] = $f === 'deceased' ? $a['deceased'] : $a[$f]; }
                    $pdo->prepare('UPDATE pets SET data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([json_encode($pd, JSON_UNESCAPED_UNICODE), $tid]);
                }
            }
        }
        $petMap[$a['uuid'] ?: 'i' . $i] = $tid;
        // les lignes : nouvelles → ajoutées ; même uuid modifiée → le mien, le sien ou les deux (les deux par défaut) ; doublons → écartés
        $lineStatus = []; foreach ($info['lines'] as $l) { $lineStatus[$l['kind'] . ':' . $l['uuid'] . ':' . $l['theirs']] = $l['status']; }
        $tables = ['mark' => 'animal_marks', 'obs' => 'animal_observations', 'health' => 'animal_health', 'member' => 'animal_memberships'];
        foreach (['mark' => 'marks', 'obs' => 'observations', 'health' => 'health', 'member' => 'members'] as $k => $list) {
            foreach ($a[$list] as $it) {
                $st = $lineStatus[$k . ':' . $it['uuid'] . ':' . suivi_line_text($k, $it)] ?? 'dup';
                if ($st === 'dup') { continue; }
                $choice = $st === 'conflict' ? ($all ?: (string) ($d['lines'][$it['uuid']] ?? 'both')) : 'new';
                if ($choice === 'mine') { continue; }
                $row = suivi_share_row($pdo, $k, $it, $tid, $siteMap, $groupMap, $media, $undo);
                if ($k === 'member' && !$row['group_id']) { continue; }
                if ($choice === 'theirs') {
                    $s = $pdo->prepare("SELECT id FROM {$tables[$k]} WHERE uuid=? AND pet_id=?"); $s->execute([$it['uuid'], $tid]); $lid = (int) $s->fetchColumn();
                    if ($lid) { $snap($tables[$k], $lid); unset($row['uuid']); $sets = implode(',', array_map(static fn($c) => "$c=?", array_keys($row))); $pdo->prepare("UPDATE {$tables[$k]} SET $sets WHERE id=?")->execute([...array_values($row), $lid]); $n['replaced']++; continue; }
                }
                if ($choice === 'both' || $it['uuid'] === '') { $row['uuid'] = suivi_new_uuid(); }
                $ins($tables[$k], $row); $n['lines']++;
            }
        }
        if ($a['gps']) {
            $pdo->prepare('INSERT INTO animal_gps_imports(pet_id, filename, format) VALUES(?,?,?)')->execute([$tid, 'Reçu' . ($source !== '' ? ' de ' . $source : ''), 'Suivi partagé']);
            $imp = (int) $pdo->lastInsertId(); $undo['imports'][] = $imp;
            $g = $pdo->prepare('INSERT OR IGNORE INTO animal_gps(pet_id, t, lat, lon, alt, import_id) VALUES(?,?,?,?,?,?)');
            $added = 0; foreach ($a['gps'] as $p) { $g->execute([$tid, $p[0], $p[1], $p[2], $p[3], $imp]); $added += $g->rowCount(); }
            $pdo->prepare('UPDATE animal_gps_imports SET points=?, first_t=(SELECT min(t) FROM animal_gps WHERE import_id=?), last_t=(SELECT max(t) FROM animal_gps WHERE import_id=?) WHERE id=?')->execute([$added, $imp, $imp, $imp]);
            $n['gps'] += $added;
        }
    }
    // « avec qui » : les compagnons reçus, retrouvés chez moi
    foreach ($pkg['animals'] as $i => $a) {
        foreach ($a['observations'] as $o) {
            if (!$o['with'] || !isset($petMap[$a['uuid'] ?: 'i' . $i])) { continue; }
            $w = array_values(array_filter(array_map(static fn($u) => $petMap[$u] ?? 0, $o['with'])));
            if ($w) { $pdo->prepare('UPDATE animal_observations SET with_json=? WHERE uuid=? AND pet_id=?')->execute([json_encode($w), $o['uuid'], $petMap[$a['uuid'] ?: 'i' . $i]]); }
        }
    }
    $freeHave = []; foreach ($pdo->query('SELECT uuid, obs_date, obs_time, lat, lon, reading_raw, note, count FROM animal_observations WHERE pet_id IS NULL') as $o) { $freeHave[(string) $o['uuid']] = true; $freeHave[suivi_sig('obs', ['date' => $o['obs_date'], 'time' => $o['obs_time'], 'lat' => $o['lat'], 'lon' => $o['lon'], 'reading' => $o['reading_raw'], 'note' => $o['note'], 'count' => $o['count']])] = true; }
    foreach ($pkg['free_observations'] as $o) { if (isset($freeHave[$o['uuid']]) || isset($freeHave[suivi_sig('obs', $o)])) { continue; } $row = suivi_share_row($pdo, 'obs', $o, 0, $siteMap, $groupMap, $media, $undo); $row['pet_id'] = null; $ins('animal_observations', $row); $n['lines']++; }
    $summary = sprintf('%d animal(aux) ajouté(s), %d complété(s), %d ligne(s) ajoutée(s), %d remplacée(s), %d point(s) GPS', $n['animals_new'], $n['animals_merged'], $n['lines'], $n['replaced'], $n['gps']);
    $pdo->prepare('INSERT INTO suivi_receipts(source, summary, undo_json) VALUES(?,?,?)')->execute([$source, $summary, json_encode($undo, JSON_UNESCAPED_UNICODE)]);
    $rid = (int) $pdo->lastInsertId();
    log_change($pdo, 'suivi_share', $rid, 'create', 'Suivi des animaux reçu' . ($source !== '' ? ' de ' . $source : '') . ' le ' . date('d/m/Y') . ' : ' . $summary);
    return ['receipt' => $rid, 'counts' => $n, 'summary' => $summary];
}

/** Une ligne du paquet → une ligne de la table, pour l'animal $petId */
function suivi_share_row(PDO $pdo, string $k, array $it, int $petId, array $siteMap, array $groupMap, callable $media, array &$undo): array
{
    return match ($k) {
        'mark' => ['pet_id' => $petId, 'kind' => $it['kind'], 'code' => $it['code'], 'code_norm' => suivi_norm($it['code']), 'colors_json' => $it['colors'] ? suivi_clean_colors($it['colors']) : '', 'position' => $it['position'], 'scheme' => $it['scheme'], 'model' => $it['model'], 'interval_min' => $it['interval_min'], 'start_date' => $it['start_date'], 'start_iso' => suivi_iso($it['start_date']), 'end_date' => $it['end_date'], 'end_iso' => suivi_iso($it['end_date']), 'end_reason' => $it['end_reason'], 'note' => $it['note'], 'media_id' => $media($it['media']), 'uuid' => $it['uuid']],
        'obs' => ['pet_id' => $petId ?: null, 'obs_date' => $it['date'], 'obs_iso' => suivi_iso($it['date']), 'obs_time' => $it['time'], 'lat' => $it['lat'], 'lon' => $it['lon'], 'place_id' => suivi_share_place($pdo, $it['place'], $undo), 'place_text' => $it['place_text'], 'site_id' => $siteMap[$it['site']] ?? null, 'behaviors' => implode(',', $it['behaviors']), 'count' => $it['count'], 'with_json' => '', 'reading_raw' => $it['reading'], 'reading_json' => suivi_clean_reading($it['reading_detail'] ?? null), 'reliability' => $it['reliability'], 'observer_txt' => $it['observer'] ?? '', 'note' => $it['note'], 'source' => $it['source'], 'media_id' => $media($it['media'] ?? null), 'sea_json' => !empty($it['sea']) ? json_encode($it['sea'], JSON_UNESCAPED_UNICODE) : '', 'uuid' => $it['uuid']],
        'health' => ['pet_id' => $petId, 'ev_date' => $it['date'], 'ev_iso' => suivi_iso($it['date']), 'state' => $it['state'], 'what_kind' => $it['what_kind'], 'what_text' => $it['what_text'], 'cause' => $it['cause'], 'cause_text' => $it['cause_text'], 'place_id' => suivi_share_place($pdo, $it['place'], $undo), 'place_text' => $it['place_text'], 'carer_txt' => $it['carer'], 'care' => $it['care'], 'meds' => $it['meds'], 'weight_g' => $it['weight_g'], 'media_ids' => implode(',', array_filter(array_map($media, $it['media']))), 'outcome' => $it['outcome'], 'outcome_date' => $it['outcome_date'], 'note' => $it['note'], 'uuid' => $it['uuid']],
        'member' => ['pet_id' => $petId, 'group_id' => $groupMap[$it['group']] ?? 0, 'role' => $it['role'], 'start_date' => $it['start_date'], 'start_iso' => suivi_iso($it['start_date']), 'start_reason' => $it['start_reason'], 'end_date' => $it['end_date'], 'end_iso' => suivi_iso($it['end_date']), 'end_reason' => $it['end_reason'], 'note' => $it['note'], 'uuid' => $it['uuid']],
    };
}

/** ↶ Annuler une réception : ce qui a été ajouté part, ce qui a été remplacé revient */
function suivi_share_undo(PDO $pdo, int $rid): array
{
    $s = $pdo->prepare('SELECT * FROM suivi_receipts WHERE id=?'); $s->execute([$rid]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r || (int) $r['undone']) { throw new RuntimeException('Rien à annuler.'); }
    $u = json_decode((string) $r['undo_json'], true) ?: [];
    foreach ($u['imports'] ?? [] as $imp) { $pdo->prepare('DELETE FROM animal_gps WHERE import_id=?')->execute([(int) $imp]); $pdo->prepare('DELETE FROM animal_gps_imports WHERE id=?')->execute([(int) $imp]); }
    $allowed = array_merge(SUIVI_UUID_TABLES, ['places', 'pets']);
    foreach (array_reverse($u['ins'] ?? []) as [$t, $id]) { if (in_array($t, $allowed, true)) { $pdo->prepare("DELETE FROM $t WHERE " . ($t === 'animal_profiles' ? 'pet_id' : 'id') . '=?')->execute([(int) $id]); } }
    foreach (array_reverse($u['upd'] ?? []) as [$t, $id, $row]) {
        if (!in_array($t, $allowed, true) || !is_array($row)) { continue; }
        $col = $t === 'animal_profiles' ? 'pet_id' : 'id';
        $cols = array_values(array_intersect(table_columns_suivi($pdo, $t), array_keys($row)));
        $pdo->prepare("DELETE FROM $t WHERE $col=?")->execute([(int) $id]);
        $pdo->prepare("INSERT INTO $t(" . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute(array_map(static fn($c) => $row[$c], $cols));
    }
    foreach ($u['pets'] ?? [] as $pid) { delete_pet($pdo, ['id' => (int) $pid]); }
    $pdo->prepare('UPDATE suivi_receipts SET undone=1 WHERE id=?')->execute([$rid]);
    log_change($pdo, 'suivi_share', $rid, 'update', 'Réception du suivi annulée : ' . $r['summary']);
    return ['ok' => true];
}

function table_columns_suivi(PDO $pdo, string $t): array
{
    return array_map(static fn($r) => (string) $r['name'], $pdo->query("PRAGMA table_info($t)")->fetchAll());
}
