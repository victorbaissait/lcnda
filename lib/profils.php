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
    return ['profiles' => $personId > 0 ? profils_of_person($pdo, $personId) : [], 'defs' => profils_defs($pdo)];
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
