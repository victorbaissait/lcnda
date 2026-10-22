<?php
declare(strict_types=1);

/**
 * LCNDA — 📊 Diagrammes, onglet « Depuis l'app » : les options communes à tous les types
 * (assets/js/heritage-diagram-options.js). Mêmes noms partout, préfixés « dg_ » pour ne pas gêner les réglages propres
 * de chaque type :
 *  - dg_pop    : le groupe de personnes — '' (toute la base), anc (la personne et ses ancêtres), desc (la personne et ses
 *                descendants), pat / mat (branche paternelle / maternelle), label (une étiquette), list (une de « Mes listes »),
 *                search (une recherche dans les noms), people (les personnes choisies) ;
 *  - dg_root   : la personne de départ (anc, desc, pat, mat) ; dg_gens : jusqu'à combien de générations (0 = toutes) ;
 *  - dg_label, dg_list : le numéro de l'étiquette, de la liste ; dg_q : le texte cherché ; dg_ids : « 12,45 » ;
 *  - dg_from, dg_to : la période (années ; la page lit des dates écrites librement, C4, et n'envoie que les années).
 * Une valeur de mauvaise forme (sorte inconnue, numéro qui n'en est pas un, tableau…) est refusée (422) ; les nombres sont bornés.
 * Utilisé par lib/diagram_appcount.php (« Compter dans ma base ») et par les données des autres types
 * (diagram_genea, diagram_numbers, diagram_adn_numbers, diagram_more, diagram_famille, diagram_geo, diagram_cartes2).
 */

require_once __DIR__ . '/diagram_genea.php'; // dgn_links, dgn_root, dgn_sosa

const DGO_POPS = ['', 'all', 'anc', 'desc', 'pat', 'mat', 'label', 'list', 'search', 'people'];
const DGO_MAX_IDS = 500;
const DGO_YEAR_MIN = -3000;
const DGO_YEAR_MAX = 2200;

function dgo_bad(string $msg): never
{
    throw new LcndaBadInput($msg);
}

/** une valeur simple (texte ou nombre) ; un tableau ou un objet est refusé */
function dgo_scalar(array $q, string $k): string
{
    $v = $q[$k] ?? '';
    if (is_array($v) || is_object($v)) { dgo_bad('Réglage « ' . $k . ' » de mauvaise forme.'); }
    return trim((string) $v);
}

/** un numéro (fiche, étiquette, liste) ou rien ; « 12 OR 1=1 » est refusé */
function dgo_id(array $q, string $k): int
{
    $v = dgo_scalar($q, $k);
    if ($v === '' || $v === '0') { return 0; }
    if (!preg_match('/^\d{1,10}$/', $v)) { dgo_bad('Numéro de mauvaise forme (' . $k . ').'); }
    return (int) $v;
}

/** une année (ou rien), bornée */
function dgo_year(array $q, string $k): ?int
{
    $v = dgo_scalar($q, $k);
    if ($v === '') { return null; }
    if (!preg_match('/^-?\d{1,4}$/', $v)) { dgo_bad('Année de mauvaise forme (' . $k . ').'); }
    return max(DGO_YEAR_MIN, min(DGO_YEAR_MAX, (int) $v));
}

/** les options communes, vérifiées et bornées */
function dgo_clean(array $q): array
{
    $pop = dgo_scalar($q, 'dg_pop');
    if (!in_array($pop, DGO_POPS, true)) { dgo_bad('Groupe de personnes inconnu.'); }
    if ($pop === 'all') { $pop = ''; }
    $gens = dgo_scalar($q, 'dg_gens');
    if ($gens !== '' && !preg_match('/^\d{1,3}$/', $gens)) { dgo_bad('Nombre de générations de mauvaise forme.'); }
    $search = dgo_scalar($q, 'dg_q');
    if (mb_strlen($search) > 80) { dgo_bad('Recherche trop longue (80 lettres au plus).'); }
    $search = preg_replace('/[\x00-\x1f\x7f]/u', '', $search) ?? '';
    $idsRaw = dgo_scalar($q, 'dg_ids');
    if ($idsRaw !== '' && !preg_match('/^\d{1,10}(,\d{1,10})*$/', $idsRaw)) { dgo_bad('Liste de personnes de mauvaise forme.'); }
    $ids = $idsRaw === '' ? [] : array_values(array_unique(array_map('intval', explode(',', $idsRaw))));
    if (count($ids) > DGO_MAX_IDS) { dgo_bad('Trop de personnes choisies (' . DGO_MAX_IDS . ' au plus).'); }
    $from = dgo_year($q, 'dg_from'); $to = dgo_year($q, 'dg_to');
    if ($from !== null && $to !== null && $from > $to) { [$from, $to] = [$to, $from]; }
    $o = ['pop' => $pop, 'root' => dgo_id($q, 'dg_root'), 'gens' => $gens === '' ? 0 : max(0, min(40, (int) $gens)),
        'label' => dgo_id($q, 'dg_label'), 'list' => dgo_id($q, 'dg_list'), 'search' => $search, 'ids' => $ids, 'from' => $from, 'to' => $to];
    if ($pop === 'label' && !$o['label']) { dgo_bad('Choisis une étiquette.'); }
    if ($pop === 'list' && !$o['list']) { dgo_bad('Choisis une de tes listes.'); }
    if ($pop === 'search' && mb_strlen($search) < 2) { dgo_bad('Écris au moins 2 lettres à chercher.'); }
    if ($pop === 'people' && !$ids) { dgo_bad('Choisis au moins une personne.'); }
    return $o;
}

/** des options sont-elles demandées ? (sinon les données restent exactement celles d'avant) */
function dgo_active(array $o): bool
{
    return $o['pop'] !== '' || $o['from'] !== null || $o['to'] !== null;
}

/** les ancêtres (ou descendants) d'une personne, elle comprise : id → génération (1 = la personne) */
function dgo_walk(PDO $pdo, int $root, int $gens, bool $up, int $max = 60000): array
{
    $L = dgn_links($pdo); $out = [$root => 1]; $queue = [$root]; $g = 1; $lim = $gens > 0 ? $gens : 40;
    while ($queue && $g < $lim + 1 && count($out) < $max) {
        $next = [];
        foreach ($queue as $p) {
            foreach ($up ? array_values($L['parents'][$p] ?? []) : ($L['children'][$p] ?? []) as $x) {
                $x = (int) $x; if (!$x || isset($out[$x])) { continue; }
                $out[$x] = $g + 1; $next[] = $x;
            }
        }
        $queue = $next; $g++;
    }
    return $out;
}

/** branche paternelle (côté père) ou maternelle (côté mère) : id → génération (2 = le père ou la mère) */
function dgo_branch(PDO $pdo, int $root, int $gens, bool $paternal): array
{
    $out = [];
    foreach (dgn_sosa($pdo, $root, $gens > 0 ? $gens : 40, 120000) as $s => $id) {
        if ($s < 2) { continue; }
        $g = strlen(decbin((int) $s)) - 1; $pat = $s - (1 << $g) < (1 << ($g - 1));
        if ($pat === $paternal && (!isset($out[$id]) || $out[$id] > $g + 1)) { $out[(int) $id] = $g + 1; }
    }
    return $out;
}

/** les personnes du groupe choisi : id → true (ou génération pour anc/desc/pat/mat) ; null = toute la base */
function dgo_people(PDO $pdo, array $o): ?array
{
    static $memo = [];
    $key = json_encode([$o['pop'], $o['root'], $o['gens'], $o['label'], $o['list'], $o['search'], $o['ids']]);
    if (array_key_exists($key, $memo)) { return $memo[$key]; }
    $pop = $o['pop']; $set = null;
    if (in_array($pop, ['anc', 'desc', 'pat', 'mat'], true)) {
        $root = dgn_root($pdo, $o['root']);
        $set = !$root ? [] : ($pop === 'anc' || $pop === 'desc' ? dgo_walk($pdo, $root, $o['gens'], $pop === 'anc') : dgo_branch($pdo, $root, $o['gens'], $pop === 'pat'));
    } elseif ($pop === 'label') {
        $s = $pdo->prepare("SELECT entity_id FROM label_links WHERE label_id=? AND entity_type='person'"); $s->execute([$o['label']]);
        $set = array_fill_keys(array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)), true);
    } elseif ($pop === 'list') {
        $set = dgo_list_people($pdo, $o['list']);
    } elseif ($pop === 'search') {
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $o['search']) . '%';
        $s = $pdo->prepare("SELECT id FROM persons WHERE (COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) LIKE ? ESCAPE '\\'
            OR (COALESCE(last_name,'') || ' ' || COALESCE(first_name,'')) LIKE ? ESCAPE '\\' OR COALESCE(middle_name,'') LIKE ? ESCAPE '\\' LIMIT 20000");
        $s->execute([$like, $like, $like]);
        $set = array_fill_keys(array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)), true);
    } elseif ($pop === 'people') {
        $set = array_fill_keys($o['ids'], true);
    }
    return $memo[$key] = $set;
}

/** les personnes d'une de « Mes listes » (liste de personnes, ou les personnes des événements d'une liste d'événements) */
function dgo_list_people(PDO $pdo, int $listId): array
{
    require_once __DIR__ . '/my_lists.php';
    $s = $pdo->prepare('SELECT * FROM custom_lists WHERE id=?'); $s->execute([$listId]); $list = $s->fetch();
    if (!$list) { dgo_bad('Cette liste n’existe plus.'); }
    if ($list['source'] === 'persons') { return array_fill_keys(my_list_rows_for($pdo, $list + ['ids_only' => 1])['ids'] ?? [], true); }
    if (!in_array($list['source'], ['events', 'records'], true)) { dgo_bad('Cette liste ne contient pas de personnes.'); }
    $out = [];
    foreach ((my_list_rows_for($pdo, $list)['rows'] ?? []) as $r) { foreach ($r['people'] ?? [] as $p) { if (!empty($p['id'])) { $out[(int) $p['id']] = true; } } }
    return $out;
}

/**
 * Les options communes de la demande en cours : dgo_request($get) les lit et les vérifie (au début de chaque action
 * de données de diagramme) ; dgo_request() les rend ensuite (aucune option si rien n'a été lu).
 */
function dgo_request(?array $get = null): array
{
    static $cur = null;
    if ($get !== null) { $cur = dgo_clean($get); }
    return $cur ?? dgo_clean([]);
}

/**
 * Pour les données des autres types : restreint un ensemble de personnes ($only : id → true, null = tout le monde)
 * au groupe choisi. Sans dg_pop, $only revient tel quel (les anciens réglages ne changent pas).
 */
function dgo_restrict(PDO $pdo, ?array $only): ?array
{
    $o = dgo_request();
    if ($o['pop'] === '') { return $only; }
    $set = dgo_people($pdo, $o) ?? [];
    if ($only === null) { return array_map(static fn() => true, $set); }
    return array_intersect_key($only, $set);
}

/** une personne est-elle dans le groupe choisi ? (sans groupe : oui) */
function dgo_has(PDO $pdo, int $pid): bool
{
    $o = dgo_request();
    if ($o['pop'] === '') { return true; }
    return isset(dgo_people($pdo, $o)[$pid]);
}

/** l'année est-elle dans la période choisie (dg_from, dg_to) ? Sans période : oui. Une année inconnue : non, s'il y a une période. */
function dgo_year_ok(?int $y): bool
{
    $o = dgo_request();
    if ($o['from'] === null && $o['to'] === null) { return true; }
    if ($y === null) { return false; }
    return ($o['from'] === null || $y >= $o['from']) && ($o['to'] === null || $y <= $o['to']);
}
