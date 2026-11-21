<?php
declare(strict_types=1);
/**
 * 🪄 Corrections proposées après « ✨ Lire l'acte » (assets/js/app-htr-correction.js) : les mots de la base qui servent de lexique.
 * GET htr_lexicon → {surnames, firstNames, places, trades} : noms de famille, prénoms, lieux et métiers des fiches, bornés,
 * SANS les personnes vivantes ni les fiches confidentielles (df_hidden_people, comme les dates à fêter), et sans leurs
 * lieux ni leurs métiers quand elles sont les seules à les avoir. Lecture seule ; rien ne part sur Internet.
 * Le lexique personnel (« Ajouter au lexique ») est un réglage de l'interface (genealogie-htr-lexique, table app_settings).
 */

const HTR_LEX_MAX = ['surnames' => 6000, 'firstNames' => 4000, 'places' => 6000, 'trades' => 2000];

function htr_lexicon_data(PDO $pdo): array
{
    if (!function_exists('df_hidden_people')) { require_once __DIR__ . '/dates_feter.php'; }
    $hidden = [];
    try { $hidden = df_hidden_people($pdo); } catch (Throwable) { $hidden = []; }
    // une fiche confidentielle ou vivante n'entre jamais ; en cas de doute (calcul impossible), seules les fiches marquées décédées
    $isHidden = static fn(int $id): bool => isset($hidden[$id]);
    $sur = []; $first = [];
    foreach ($pdo->query("SELECT id, first_name, last_name, living_status, is_private FROM persons") as $r) {
        $id = (int) $r['id'];
        if ($isHidden($id) || (int) $r['is_private'] === 1 || $r['living_status'] === 'living') { continue; }
        $ln = trim((string) $r['last_name']);
        if ($ln !== '' && mb_strlen($ln) <= 60) { $k = mb_strtolower($ln); $sur[$k] = ['v' => $ln, 'n' => ($sur[$k]['n'] ?? 0) + 1]; }
        foreach (preg_split('/[\s,]+/u', trim((string) $r['first_name'])) ?: [] as $w) {
            if (mb_strlen($w) >= 3 && mb_strlen($w) <= 30) { $k = mb_strtolower($w); $first[$k] = ['v' => $w, 'n' => ($first[$k]['n'] ?? 0) + 1]; }
        }
    }
    $places = []; $trades = [];
    $ev = $pdo->query("SELECT e.person_id, e.family_id, e.description, t.gedcom_tag, pl.name AS place
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.place_id IS NOT NULL OR t.gedcom_tag='OCCU'");
    $famOk = [];
    foreach ($pdo->query('SELECT id, partner1_id, partner2_id FROM families') as $f) {
        $ok = true;
        foreach ([(int) ($f['partner1_id'] ?? 0), (int) ($f['partner2_id'] ?? 0)] as $p) { if ($p && $isHidden($p)) { $ok = false; } }
        $famOk[(int) $f['id']] = $ok;
    }
    foreach ($ev as $e) {
        $pid = (int) ($e['person_id'] ?? 0); $fid = (int) ($e['family_id'] ?? 0);
        if ($pid && $isHidden($pid)) { continue; }
        if (!$pid && $fid && !($famOk[$fid] ?? false)) { continue; }
        $pl = trim((string) ($e['place'] ?? ''));
        if ($pl !== '' && mb_strlen($pl) <= 120) { $k = mb_strtolower($pl); $places[$k] = ['v' => $pl, 'n' => ($places[$k]['n'] ?? 0) + 1]; }
        if ($e['gedcom_tag'] === 'OCCU') { $d = trim((string) $e['description']); if ($d !== '' && mb_strlen($d) <= 60) { $k = mb_strtolower($d); $trades[$k] = ['v' => $d, 'n' => ($trades[$k]['n'] ?? 0) + 1]; } }
    }
    $top = static function (array $m, int $max): array {
        uasort($m, static fn($a, $b) => $b['n'] <=> $a['n']);
        return array_map(static fn($x) => ['value' => (string) $x['v'], 'weight' => (int) $x['n']], array_values(array_slice($m, 0, $max)));
    };
    $f = APP_ROOT . '/assets/data/metiers-anciens.json';
    $old = [];
    if (is_file($f)) { $d = json_decode((string) file_get_contents($f), true); foreach ($d['trades'] ?? [] as $t) { foreach (['name', 'fem'] as $k) { if (!empty($t[$k])) { $old[] = ['value' => (string) $t[$k], 'weight' => 1]; } } } }
    return [
        'surnames' => $top($sur, HTR_LEX_MAX['surnames']),
        'firstNames' => $top($first, HTR_LEX_MAX['firstNames']),
        'places' => $top($places, HTR_LEX_MAX['places']),
        'trades' => array_merge($top($trades, HTR_LEX_MAX['trades']), $old),
    ];
}
