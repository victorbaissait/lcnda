<?php
declare(strict_types=1);

/**
 * 🧩 Les PROFILS d'une personne (« Cette personne était… ») : artiste, homme / femme politique, élu local, sportif,
 * militaire, agriculteur… et les profils créés par l'utilisateur. Interface : assets/js/heritage-profils*.js.
 *
 * Tout passe par le moteur des fiches (lib/art_engine.php) :
 *  - profiles          : le catalogue des profils (clé, nom, icône ; origin = builtin | user ; def JSON = couleur, groupe,
 *                        sections d'un profil créé par l'utilisateur) ;
 *  - person_profiles   : les profils cochés sur une fiche (item_id = sa « fiche de profil », sorte « profile_<clé> ») ;
 *  - items             : les fiches de chaque profil (mandats, élections, clubs, résultats, records, saisons…).
 *
 * Les sortes déclarées ici entrent dans le moteur par $GLOBALS['ART_EXTRA_TYPES'] (lu par art_extra_types()) :
 *   clé => [nom, pluriel, icône, famille, type parent, profil(s) qui la portent]
 * Une fiche d'une de ces sortes coche toute seule son profil sur la personne (pas la case « Artiste »).
 */

$GLOBALS['ART_EXTRA_TYPES'] = (is_array($GLOBALS['ART_EXTRA_TYPES'] ?? null) ? $GLOBALS['ART_EXTRA_TYPES'] : []) + [
    // 🗳 politique (et 🏛 élu local, qui en reprend les fiches)
    'pol_mandate' => ['Mandat, fonction', 'Mandats et fonctions', '🏛', 'politic', '', ['politic', 'elu_local']],
    'pol_election' => ['Élection', 'Élections', '🗳', 'politic', '', ['politic', 'elu_local']],
    'pol_party' => ['Parti, groupe, commission', 'Partis, groupes, commissions', '👥', 'politic', '', ['politic', 'elu_local']],
    'pol_text' => ['Texte, vote', 'Textes, votes, propositions', '📜', 'politic', '', ['politic', 'elu_local']],
    'pol_speech' => ['Discours', 'Discours', '🗣', 'politic', '', ['politic', 'elu_local']],
    'pol_affair' => ['Controverse, affaire', 'Controverses, affaires', '⚠️', 'politic', '', ['politic', 'elu_local']],
    // 🏅 sport
    'sp_club' => ['Club, équipe', 'Clubs et équipes', '🏟', 'sport', '', ['sport']],
    'sp_result' => ['Résultat', 'Résultats', '🏁', 'sport', '', ['sport']],
    'sp_record' => ['Record', 'Records', '⏱', 'sport', '', ['sport']],
    'sp_season' => ['Saison', 'Statistiques par saison', '📊', 'sport', '', ['sport']],
];

/** les profils intégrés connus du serveur (le navigateur en déclare le reste : ART.profiles) — nom, icône */
const PROFILS_BUILTIN = [
    'politic' => ['Homme / femme politique', '🗳'], 'elu_local' => ['Élu local', '🏛'], 'sport' => ['Sportif · athlète', '🏅'],
    'artisan' => ['Artisan d’art', '🔨'], 'actor' => ['Acteur, actrice, performeur', '🎬'],
];

/** fiche verrouillée (ou mode consultation) : rien ne s'écrit — même règle que api.php, aussi hors de api.php */
function profils_assert_unlocked(PDO $pdo, int $personId): void
{
    if (function_exists('assert_person_unlocked')) { assert_person_unlocked($pdo, $personId); return; }
    $l = $pdo->prepare('SELECT COALESCE(is_locked,0) FROM persons WHERE id=?'); $l->execute([$personId]);
    if ((int) $l->fetchColumn() === 1) { throw new RuntimeException('Fiche verrouillée. Déverrouille-la avant de modifier ou supprimer cette personne.'); }
}

function profils_key_ok(string $key): bool { return (bool) preg_match('/^[a-z][a-z0-9_]{1,40}$/', $key); }

/** les profils cochés sur une fiche, avec leur nom, icône, couleur (pour le bloc « Cette personne était… ») */
function profils_of_person(PDO $pdo, int $personId): array
{
    if (!function_exists('art_ensure')) { return []; }
    try { art_ensure($pdo); } catch (Throwable $e) { return []; }
    $s = $pdo->prepare('SELECT pp.profile_key AS key, pp.item_id, pp.sort_order, COALESCE(p.label, \'\') AS label, COALESCE(p.icon, \'\') AS icon, COALESCE(p.origin, \'builtin\') AS origin, COALESCE(p.def, \'{}\') AS def
        FROM person_profiles pp LEFT JOIN profiles p ON p.key=pp.profile_key WHERE pp.person_id=? ORDER BY pp.sort_order, pp.created_at, pp.profile_key');
    $s->execute([$personId]);
    $out = array_map(static function ($r) {
        $def = json_decode((string) $r['def'], true) ?: [];
        return ['key' => (string) $r['key'], 'item_id' => $r['item_id'] !== null ? (int) $r['item_id'] : null, 'label' => (string) $r['label'], 'icon' => (string) $r['icon'],
            'origin' => (string) $r['origin'], 'color' => (string) ($def['color'] ?? '')];
    }, $s->fetchAll(PDO::FETCH_ASSOC));
    // la case « Artiste » de la fiche compte aussi (anciennes bases)
    $a = $pdo->prepare('SELECT COALESCE(is_artist,0) FROM persons WHERE id=?'); $a->execute([$personId]);
    if ((int) $a->fetchColumn() && !in_array('artist', array_column($out, 'key'), true)) { $out[] = ['key' => 'artist', 'item_id' => null, 'label' => 'Artiste', 'icon' => '🎨', 'origin' => 'builtin', 'color' => '']; }
    return $out;
}

/** le catalogue des profils de la base : ceux de l'utilisateur (avec leurs sections), et le nombre de fiches qui ont chacun */
function profils_defs(PDO $pdo): array
{
    art_ensure($pdo);
    $n = [];
    foreach ($pdo->query('SELECT profile_key, count(*) AS n FROM person_profiles GROUP BY profile_key')->fetchAll(PDO::FETCH_ASSOC) as $r) { $n[(string) $r['profile_key']] = (int) $r['n']; }
    return array_map(static fn($r) => ['key' => (string) $r['key'], 'label' => (string) $r['label'], 'icon' => (string) $r['icon'], 'origin' => (string) $r['origin'],
        'def' => json_decode((string) $r['def'], true) ?: new stdClass(), 'count' => $n[(string) $r['key']] ?? 0],
        $pdo->query('SELECT key, label, icon, origin, def FROM profiles ORDER BY origin, label COLLATE NOCASE')->fetchAll(PDO::FETCH_ASSOC));
}

/** GET op=profiles : les profils d'une personne + le catalogue */
function profils_get(PDO $pdo, int $personId): array
{
    $g = art_setting($pdo, 'global') ?? [];
    $pc = is_array($g['ppage']['profColors'] ?? null) ? array_filter($g['ppage']['profColors'], static fn($c) => is_string($c) && preg_match('/^#[0-9a-fA-F]{6}$/', $c)) : [];
    return ['profiles' => $personId > 0 ? profils_of_person($pdo, $personId) : [], 'defs' => profils_defs($pdo), 'prof_colors' => $pc ?: new stdClass()];
}

/** « Appliquer » de la fenêtre des profils : plusieurs cases d'un coup (on : [{key, label, icon}], off : [clés]), dans l'ordre donné */
function profils_set_many(PDO $pdo, array $d): array
{
    art_ensure($pdo);
    $pid = safe_int($d['person_id'] ?? 0);
    $e = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $e->execute([$pid]);
    if (!$e->fetchColumn()) { throw new RuntimeException('Fiche introuvable.'); }
    profils_assert_unlocked($pdo, $pid);
    $on = array_slice(is_array($d['on'] ?? null) ? $d['on'] : [], 0, 80);
    $off = array_slice(is_array($d['off'] ?? null) ? $d['off'] : [], 0, 80);
    $own = !$pdo->inTransaction(); if ($own) { $pdo->beginTransaction(); }
    try {
        foreach ($off as $k) { $k = (string) $k; if (profils_key_ok($k)) { art_set_profile($pdo, ['person_id' => $pid, 'profile' => $k, 'on' => 0]); } }
        $ord = 0;
        foreach ($on as $p) {
            $p = is_array($p) ? $p : ['key' => (string) $p]; $k = (string) ($p['key'] ?? '');
            if (!profils_key_ok($k)) { continue; }
            [$lab, $ic] = PROFILS_BUILTIN[$k] ?? [mb_substr(trim((string) ($p['label'] ?? '')), 0, 80) ?: $k, mb_substr((string) ($p['icon'] ?? ''), 0, 16)];
            art_set_profile($pdo, ['person_id' => $pid, 'profile' => $k, 'on' => 1, 'label' => $lab, 'icon' => $ic]);
            $pdo->prepare('UPDATE person_profiles SET sort_order=? WHERE person_id=? AND profile_key=?')->execute([++$ord, $pid, $k]);
        }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own) { $pdo->rollBack(); } throw $e; }
    return ['profiles' => profils_of_person($pdo, $pid)];
}

/** un profil créé par l'utilisateur (« ✎ Créer mon propre profil ») : nom, icône, couleur, groupe, sections (reprises ou siennes) */
function profils_save_def(PDO $pdo, array $d): array
{
    art_ensure($pdo);
    $label = mb_substr(trim(safe_text($d['label'] ?? '')), 0, 60);
    if ($label === '') { throw new RuntimeException('Donne un nom à ce profil.'); }
    $key = (string) ($d['key'] ?? '');
    if ($key === '') {
        $base = trim((string) preg_replace('/[^a-z0-9]+/', '_', strtolower((string) (iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $label) ?: 'profil'))), '_') ?: 'profil';
        $key = 'u_' . substr($base, 0, 28); $n = 2;
        $s = $pdo->prepare('SELECT 1 FROM profiles WHERE key=?');
        while (true) { $s->execute([$key]); if (!$s->fetchColumn()) { break; } $key = 'u_' . substr($base, 0, 28) . '_' . $n++; }
    } elseif (!preg_match('/^u_[a-z0-9_]{1,38}$/', $key)) { throw new RuntimeException('Seuls tes propres profils se modifient ici.'); }
    $def = function_exists('artist_clean') ? artist_clean(is_array($d['def'] ?? null) ? $d['def'] : []) : [];
    $def = is_array($def) ? $def : [];
    if (isset($def['color']) && !preg_match('/^#[0-9a-fA-F]{6}$/', (string) $def['color'])) { $def['color'] = '#7b2ff7'; }
    $json = json_encode($def, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (strlen((string) $json) > 200_000) { throw new RuntimeException('Ce profil a trop de réglages.'); }
    $icon = mb_substr(trim((string) ($d['icon'] ?? '')), 0, 8) ?: '✦';
    $pdo->prepare("INSERT INTO profiles(key, label, icon, origin, def) VALUES(?,?,?, 'user', ?) ON CONFLICT(key) DO UPDATE SET label=excluded.label, icon=excluded.icon, def=excluded.def")
        ->execute([$key, $label, $icon, $json]);
    return ['key' => $key];
}

/** retirer un profil de l'utilisateur : refusé tant qu'une fiche l'a coché (ses données resteraient sans profil) */
function profils_delete_def(PDO $pdo, array $d): array
{
    art_ensure($pdo);
    $key = (string) ($d['key'] ?? '');
    if (!preg_match('/^u_[a-z0-9_]{1,38}$/', $key)) { throw new RuntimeException('Seuls tes propres profils se suppriment.'); }
    $c = $pdo->prepare('SELECT count(*) FROM person_profiles WHERE profile_key=?'); $c->execute([$key]);
    if (($n = (int) $c->fetchColumn()) > 0) { throw new RuntimeException("Ce profil est coché sur {$n} fiche" . ($n > 1 ? 's' : '') . ' : décoche-le d’abord.'); }
    $s = $pdo->prepare('SELECT * FROM profiles WHERE key=? AND origin=\'user\''); $s->execute([$key]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Profil introuvable.'); }
    $pdo->prepare('DELETE FROM profiles WHERE key=?')->execute([$key]);
    return ['ok' => true, 'profile' => ['key' => $key, 'label' => (string) $row['label'], 'icon' => (string) $row['icon'], 'def' => json_decode((string) $row['def'], true) ?: new stdClass()]];
}

/** la case « Artiste » du formulaire de la personne suit person_profiles (et inversement : art_set_profile) */
function profils_sync_artist(PDO $pdo, int $personId, int $isArtist): void
{
    if ($personId <= 0 || !function_exists('art_ensure')) { return; }
    try { art_ensure($pdo); } catch (Throwable $e) { return; }
    if ($isArtist) {
        $pdo->prepare("INSERT OR IGNORE INTO profiles(key, label, icon, origin) VALUES('artist', 'Artiste', '🎨', 'builtin')")->execute();
        $pdo->prepare("INSERT OR IGNORE INTO person_profiles(person_id, profile_key) VALUES(?, 'artist')")->execute([$personId]);
    } else {
        $pdo->prepare("DELETE FROM person_profiles WHERE person_id=? AND profile_key='artist'")->execute([$personId]);
    }
}

/** la liste « 🧩 Cette personne était… » (onglet Listes) : les personnes qui ont au moins un profil, avec leurs profils,
 *  années, métier (filtre « Métier ») et photo — rien n'est écrit pendant cette lecture */
function profils_people(PDO $pdo): array
{
    art_ensure($pdo);
    $rows = $pdo->query("SELECT p.id, p.first_name, p.last_name, p.gender, COALESCE(p.occupation,'') AS occupation, COALESCE(p.is_locked,0) AS is_locked, p.updated_at,
            (SELECT group_concat(pp.profile_key, ',') FROM (SELECT profile_key FROM person_profiles WHERE person_id=p.id ORDER BY sort_order, profile_key) pp) AS profs,
            COALESCE(p.is_artist,0) AS is_artist
        FROM persons p WHERE COALESCE(p.kind,'person')<>'animal' AND (COALESCE(p.is_artist,0)=1 OR EXISTS (SELECT 1 FROM person_profiles x WHERE x.person_id=p.id)) ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE LIMIT 20000")->fetchAll(PDO::FETCH_ASSOC);
    if (!$rows) { return ['people' => [], 'defs' => profils_defs($pdo)]; }
    $ids = implode(',', array_map(static fn($r) => (int) $r['id'], $rows));
    $life = [];
    try {
        foreach ($pdo->query("SELECT e.person_id, t.gedcom_tag AS tag, MIN(e.year) AS y FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IN ({$ids}) AND t.gedcom_tag IN ('BIRT','DEAT') AND e.year IS NOT NULL GROUP BY e.person_id, t.gedcom_tag")->fetchAll(PDO::FETCH_ASSOC) as $e) {
            $life[(int) $e['person_id']][$e['tag'] === 'BIRT' ? 'birth' : 'death'] = (int) $e['y'];
        }
    } catch (Throwable $e) {}
    $items = [];
    foreach ($pdo->query("SELECT person_id, count(*) AS n FROM items WHERE person_id IN ({$ids}) AND substr(type_key,1,8)<>'profile_' AND type_key<>'profile' GROUP BY person_id")->fetchAll(PDO::FETCH_ASSOC) as $r) { $items[(int) $r['person_id']] = (int) $r['n']; }
    $photos = [];
    try {
        foreach ($pdo->query("SELECT l.entity_id AS pid, m.filename FROM media_links l JOIN media m ON m.id=l.media_id WHERE l.entity_type='person' AND l.entity_id IN ({$ids}) AND m.media_type='image' AND COALESCE(m.is_person_photo,0)=1 ORDER BY l.position DESC")->fetchAll(PDO::FETCH_ASSOC) as $r) { $photos[(int) $r['pid']] = (string) $r['filename']; }
    } catch (Throwable $e) {}
    $own = [];
    foreach ($pdo->query("SELECT key, data FROM layout_prefs WHERE key LIKE 'person:%'")->fetchAll(PDO::FETCH_ASSOC) as $r) { $d = json_decode((string) $r['data'], true); if (!empty($d['own'])) { $own[(int) substr((string) $r['key'], 7)] = true; } }
    $people = array_map(static function ($r) use ($life, $items, $photos, $own) {
        $id = (int) $r['id']; $keys = array_values(array_filter(explode(',', (string) ($r['profs'] ?? ''))));
        if ((int) $r['is_artist'] && !in_array('artist', $keys, true)) { $keys[] = 'artist'; }
        return ['id' => $id, 'first_name' => (string) $r['first_name'], 'last_name' => (string) $r['last_name'], 'gender' => (string) $r['gender'], 'occupation' => (string) $r['occupation'],
            'birth' => $life[$id]['birth'] ?? null, 'death' => $life[$id]['death'] ?? null, 'profiles' => $keys, 'items' => $items[$id] ?? 0, 'photo' => $photos[$id] ?? '',
            'own' => isset($own[$id]), 'is_locked' => (int) $r['is_locked'] === 1, 'updated_at' => (string) ($r['updated_at'] ?? '')];
    }, $rows);
    return ['people' => $people, 'defs' => profils_defs($pdo)];
}

/** les réglages des pages (Maintenance) : le standard, les réglages enregistrés, les personnes qui ont un réglage propre */
function profils_page_settings(PDO $pdo): array
{
    art_ensure($pdo);
    $people = [];
    $s = $pdo->query("SELECT l.key, l.data, l.updated_at, p.id, p.first_name, p.last_name, p.gender FROM layout_prefs l JOIN persons p ON p.id=CAST(substr(l.key, 8) AS INTEGER) WHERE l.key LIKE 'person:%' ORDER BY l.updated_at DESC");
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $d = json_decode((string) $r['data'], true) ?: [];
        if (empty($d['own'])) { continue; }
        $people[] = ['id' => (int) $r['id'], 'first_name' => (string) $r['first_name'], 'last_name' => (string) $r['last_name'], 'gender' => (string) $r['gender'], 'updated_at' => (string) $r['updated_at'], 'data' => $d];
    }
    return ['global' => art_setting($pdo, 'global') ?? new stdClass(), 'presets' => art_setting($pdo, 'presets') ?? new stdClass(), 'people' => $people];
}
