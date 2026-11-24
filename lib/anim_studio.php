<?php
declare(strict_types=1);

/*
 * 🎞 Studio d'animation (maquette docs/design/studio-animation.html) — côté serveur :
 *  - les projets (anim_projects : titre, réglages et scènes en JSON), avec ↶ Annuler d'une suppression (restore) ;
 *  - les données des modèles : chaque personne avec sa naissance, son décès (année, lieu, coordonnées), ses parents,
 *    et ses événements placés (pour les migrations). Le dessin, l'animation et la vidéo se font dans le navigateur
 *    (assets/js/heritage-anim-*.js). En mode consultation : lecture seule, et les fiches confidentielles ne sortent pas.
 * Migration 110 (rejouable). Essai : tests/test-anim-studio.js.
 */

const ANIM_MAX_JSON = 2000000; // 2 Mo de réglages par projet, largement assez (les images et les sons restent dans les médias)

function anim_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    anim_install($pdo);
    $done = true;
}

/** migration 110 */
function anim_install(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS anim_projects (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL DEFAULT \'\', data TEXT NOT NULL DEFAULT \'{}\',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
}

function anim_kiosk(): bool { return function_exists('kiosk_state') && !empty(kiosk_state()['on']); }

/** GET anim_projects : la liste (sans les réglages) */
function anim_projects_list(PDO $pdo): array
{
    anim_ensure($pdo);
    $rows = $pdo->query('SELECT id, title, data, updated_at FROM anim_projects ORDER BY updated_at DESC, id DESC')->fetchAll(PDO::FETCH_ASSOC);
    return ['projects' => array_map(static function ($r) {
        $d = json_decode((string) $r['data'], true) ?: [];
        $sc = is_array($d['scenes'] ?? null) ? $d['scenes'] : [];
        $dur = 0.0; foreach ($sc as $s) { $dur += max(0, (float) ($s['dur'] ?? 0)); }
        return ['id' => (int) $r['id'], 'title' => (string) $r['title'], 'scenes' => count($sc), 'seconds' => round($dur, 1), 'format' => (string) ($d['format'] ?? '16:9'), 'updated_at' => (string) $r['updated_at']];
    }, $rows)];
}

/** GET anim_project&id= */
function anim_project_get(PDO $pdo, int $id): array
{
    anim_ensure($pdo);
    $s = $pdo->prepare('SELECT * FROM anim_projects WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException('Projet introuvable (supprimé ?).'); }
    return ['project' => ['id' => (int) $r['id'], 'title' => (string) $r['title'], 'data' => json_decode((string) $r['data'], true) ?: new stdClass(), 'updated_at' => (string) $r['updated_at']]];
}

/** les réglages d'un projet, nettoyés : un objet JSON, pas trop gros */
function anim_clean_data($data): string
{
    if (!is_array($data)) { throw new RuntimeException('Réglages du projet illisibles.'); }
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) { throw new RuntimeException('Réglages du projet illisibles.'); }
    if (strlen($json) > ANIM_MAX_JSON) { throw new RuntimeException('Projet trop gros : enlève des scènes ou des légendes.'); }
    return $json;
}

/** POST save_anim_project {id?, title, data} → {id} */
function save_anim_project(PDO $pdo, array $data): array
{
    anim_ensure($pdo);
    $title = mb_substr(trim(safe_text((string) ($data['title'] ?? ''))), 0, 200) ?: 'Film sans titre';
    $json = anim_clean_data($data['data'] ?? []);
    $id = safe_int($data['id'] ?? 0);
    if ($id) {
        $s = $pdo->prepare('UPDATE anim_projects SET title=?, data=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([$title, $json, $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Projet introuvable (supprimé ?).'); }
    } else {
        $pdo->prepare('INSERT INTO anim_projects(title, data) VALUES(?, ?)')->execute([$title, $json]);
        $id = (int) $pdo->lastInsertId();
    }
    return ['id' => $id];
}

/** POST rename_anim_project {id, title} */
function rename_anim_project(PDO $pdo, array $data): array
{
    anim_ensure($pdo);
    $title = mb_substr(trim(safe_text((string) ($data['title'] ?? ''))), 0, 200);
    if ($title === '') { throw new RuntimeException('Donne un nom au film.'); }
    $s = $pdo->prepare('UPDATE anim_projects SET title=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([$title, safe_int($data['id'] ?? 0)]);
    if (!$s->rowCount()) { throw new RuntimeException('Projet introuvable (supprimé ?).'); }
    return ['ok' => true];
}

/** POST delete_anim_project {id} → {row} (pour ↶ Annuler) */
function delete_anim_project(PDO $pdo, array $data): array
{
    anim_ensure($pdo);
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM anim_projects WHERE id=?'); $s->execute([$id]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Projet introuvable (déjà supprimé ?).'); }
    $pdo->prepare('DELETE FROM anim_projects WHERE id=?')->execute([$id]);
    return ['row' => $row];
}

/** POST restore_anim_project {row} */
function restore_anim_project(PDO $pdo, array $data): array
{
    anim_ensure($pdo);
    $r = is_array($data['row'] ?? null) ? $data['row'] : [];
    $id = safe_int($r['id'] ?? 0);
    if (!$id) { throw new RuntimeException('Rien à remettre.'); }
    $json = anim_clean_data(json_decode((string) ($r['data'] ?? '{}'), true) ?: []);
    $pdo->prepare('INSERT OR REPLACE INTO anim_projects(id, title, data, created_at, updated_at) VALUES(?,?,?,?,?)')
        ->execute([$id, mb_substr(safe_text((string) ($r['title'] ?? '')), 0, 200), $json, (string) ($r['created_at'] ?? date('Y-m-d H:i:s')), (string) ($r['updated_at'] ?? date('Y-m-d H:i:s'))]);
    return ['id' => $id];
}

/**
 * GET anim_people : ce que les modèles animent.
 *  people : [{id, f (prénom), l (nom), g (m/f/u), by, dy (années), bp, dp (lieu id), fa, mo (parents)}]
 *  places : {id: [nom, lat, lon]}
 *  events : [[person_id, année, sorte, lieu id]] — les événements datés et placés (naissance, baptême, mariage, résidence, décès…)
 */
function anim_people(PDO $pdo): array
{
    $kiosk = anim_kiosk();
    $hide = $kiosk ? ' AND COALESCE(p.is_private,0)=0' : '';
    $types = [];
    foreach ($pdo->query('SELECT id, slug, gedcom_tag FROM event_types') as $t) { $types[(int) $t['id']] = strtolower((string) ($t['slug'] ?: $t['gedcom_tag'])); }
    $isB = static fn($s) => in_array($s, ['birth', 'birt', 'naissance', 'baptism', 'bapm', 'chr', 'bapteme', 'baptême'], true);
    $isD = static fn($s) => in_array($s, ['death', 'deat', 'deces', 'décès', 'burial', 'buri', 'inhumation', 'sepulture'], true);
    $people = [];
    foreach ($pdo->query("SELECT p.id, p.first_name, p.last_name, p.gender FROM persons p WHERE p.kind<>'animal'$hide") as $p) {
        $people[(int) $p['id']] = ['id' => (int) $p['id'], 'f' => (string) $p['first_name'], 'l' => (string) $p['last_name'], 'g' => $p['gender'] === 'male' ? 'm' : ($p['gender'] === 'female' ? 'f' : 'u'), 'by' => null, 'dy' => null, 'bp' => null, 'dp' => null, 'fa' => null, 'mo' => null];
    }
    $events = []; $placeIds = [];
    $q = $pdo->query("SELECT e.person_id, e.family_id, e.event_type_id, e.year, e.place_id FROM events e WHERE e.year IS NOT NULL AND e.year > 0 ORDER BY e.year, e.id");
    $partners = [];
    foreach ($pdo->query('SELECT id, partner1_id, partner2_id FROM families') as $f) { $partners[(int) $f['id']] = array_values(array_filter([(int) $f['partner1_id'], (int) $f['partner2_id']])); }
    foreach ($q as $e) {
        $slug = $types[(int) $e['event_type_id']] ?? 'event';
        $year = (int) $e['year']; $pl = $e['place_id'] !== null ? (int) $e['place_id'] : null;
        $who = $e['person_id'] !== null ? [(int) $e['person_id']] : ($partners[(int) $e['family_id']] ?? []);
        foreach ($who as $pid) {
            if (!isset($people[$pid])) { continue; }
            $real = in_array($slug, ['birth', 'birt', 'naissance', 'death', 'deat', 'deces', 'décès'], true); // la vraie naissance (le vrai décès) passe avant le baptême (l'inhumation)
            if ($isB($slug) && ($people[$pid]['by'] === null || ($real && empty($people[$pid]['_b'])))) { $people[$pid]['by'] = $year; $people[$pid]['_b'] = $real; if ($pl) { $people[$pid]['bp'] = $pl; } }
            if ($isD($slug) && ($people[$pid]['dy'] === null || ($real && empty($people[$pid]['_d'])))) { $people[$pid]['dy'] = $year; $people[$pid]['_d'] = $real; if ($pl) { $people[$pid]['dp'] = $pl; } }
            if ($pl) { $events[] = [$pid, $year, $slug, $pl]; $placeIds[$pl] = true; }
        }
    }
    foreach ($people as $p) { if ($p['bp']) { $placeIds[$p['bp']] = true; } if ($p['dp']) { $placeIds[$p['dp']] = true; } }
    // les parents : le premier foyer où la personne est un enfant (biologique d'abord)
    foreach ($pdo->query("SELECT fc.child_id, f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id ORDER BY (fc.relation_to_partner1='biological') DESC, fc.id") as $r) {
        $c = (int) $r['child_id']; if (!isset($people[$c]) || $people[$c]['fa'] !== null || $people[$c]['mo'] !== null) { continue; }
        foreach ([(int) $r['partner1_id'], (int) $r['partner2_id']] as $par) {
            if (!$par || !isset($people[$par])) { continue; }
            if ($people[$par]['g'] === 'f') { $people[$c]['mo'] = $par; } else { $people[$c]['fa'] = $people[$c]['fa'] ?? $par; }
        }
    }
    $places = [];
    if ($placeIds) {
        $ids = array_keys($placeIds);
        foreach (array_chunk($ids, 500) as $chunk) {
            $s = $pdo->prepare('SELECT id, name, latitude, longitude FROM places WHERE id IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')'); $s->execute($chunk);
            foreach ($s as $pl) {
                $lat = $pl['latitude'] !== null ? (float) $pl['latitude'] : null; $lon = $pl['longitude'] !== null ? (float) $pl['longitude'] : null;
                if ($lat !== null && $lon !== null && abs($lat) < 1e-9 && abs($lon) < 1e-9) { $lat = $lon = null; }
                $places[(int) $pl['id']] = [mb_substr((string) $pl['name'], 0, 120), $lat, $lon];
            }
        }
    }
    $root = 0;
    try { $root = (int) ($pdo->query('SELECT id FROM persons WHERE is_start=1' . ($kiosk ? ' AND COALESCE(is_private,0)=0' : '') . ' ORDER BY id LIMIT 1')->fetchColumn() ?: 0); } catch (Throwable $_) {}
    $people = array_map(static function ($p) { unset($p['_b'], $p['_d']); return $p; }, $people);
    return ['people' => array_values($people), 'places' => (object) $places, 'events' => $events, 'root' => $root];
}
