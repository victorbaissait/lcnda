<?php
declare(strict_types=1);

/**
 * 👪 « Dans la famille » des Listes → Données (assets/js/app-listes-famille.js) : les lieux de la généalogie qui ont une
 * position, et qui y a vécu quand. Tout le calcul (qui vivait à moins de N km de ce séisme, de cette arrivée d'étape…)
 * se fait ensuite dans le navigateur : rien ne part sur Internet.
 *
 * GET api.php?action=ld_famille → {places: [[lat, lon, nom]], people: [[nom, naissance, décès, [[lieu, année]…], ancêtre direct (1/0)]]}
 *  - ancêtre direct : la racine Sosa (Listes → SOSA, sinon la personne de départ) et ses ascendants (filtre « seulement les ancêtres
 *    directs » de ▶ Dans le temps, assets/js/heritage-guerres-temps.js) ;
 *  - jamais une fiche confidentielle (persons.is_private) ni un événement confidentiel (events.is_private) ;
 *  - en mode consultation (et sur un appareil invité du wifi) : pas non plus les personnes vivantes, déclarées ou probables (fc_hidden) ;
 *  - naissance, décès : années (null si inconnues) ; un événement de famille (mariage…) compte pour les deux époux ;
 *  - ?share=1 (un diagramme exporté, envoyé ou posé hors de l'app, assets/js/heritage-diagram-donnees.js) : comme en consultation, sans
 *    les vivants, et seulement les lieux où quelqu'un de montré a vécu (un lieu des seuls vivants ne sort pas).
 */

function ld_famille(PDO $pdo, bool $share = false): array
{
    $realKiosk = function_exists('kiosk_state') && !empty(kiosk_state()['on']);
    $kiosk = $realKiosk || $share;
    $evPriv = in_array('is_private', array_column($pdo->query('PRAGMA table_info(events)')->fetchAll(PDO::FETCH_ASSOC), 'name'), true);
    $people = [];
    $hid = [];
    if ($kiosk) { // consultation : aussi les vivants probables (même règle que le partage et le site familial)
        require_once __DIR__ . '/comptes_famille.php';
        try { $hid = fc_hidden($pdo); } catch (Throwable) { return ['places' => [], 'people' => [], 'kiosk' => true]; } // dans le doute, personne
    }
    $sql = "SELECT id, TRIM(COALESCE(first_name,'')) AS fn, TRIM(COALESCE(last_name,'')) AS ln, living_status FROM persons WHERE COALESCE(is_private,0)=0";
    foreach ($pdo->query($sql) as $r) {
        if ($kiosk && ($r['living_status'] === 'living' || isset($hid[(int) $r['id']]))) { continue; }
        $name = trim(($r['fn'] !== '' ? $r['fn'] . ' ' : '') . mb_strtoupper((string) $r['ln']));
        if ($name === '') { continue; }
        $people[(int) $r['id']] = ['n' => $name, 'b' => null, 'd' => null, 'pl' => []];
    }
    $places = []; $pidx = [];
    $placeOf = static function (int $id, $lat, $lon, string $name) use (&$places, &$pidx): ?int {
        if (isset($pidx[$id])) { return $pidx[$id]; }
        if (!is_numeric($lat) || !is_numeric($lon) || ((float) $lat === 0.0 && (float) $lon === 0.0)) { return $pidx[$id] = null; }
        $places[] = [round((float) $lat, 4), round((float) $lon, 4), $name];
        return $pidx[$id] = count($places) - 1;
    };
    $partners = [];
    foreach ($pdo->query('SELECT id, partner1_id, partner2_id FROM families') as $f) { $partners[(int) $f['id']] = array_values(array_filter([(int) $f['partner1_id'], (int) $f['partner2_id']])); }
    $sql = "SELECT e.scope, e.person_id, e.family_id, e.year, t.gedcom_tag AS tag, e.place_id, pl.name AS pname, pl.latitude AS lat, pl.longitude AS lon
            FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id"
        . ($evPriv ? ' WHERE COALESCE(e.is_private,0)=0' : '');
    foreach ($pdo->query($sql) as $e) {
        $who = $e['scope'] === 'person' ? ($e['person_id'] ? [(int) $e['person_id']] : []) : ($partners[(int) $e['family_id']] ?? []);
        $y = $e['year'] === null ? null : (int) $e['year'];
        $tag = (string) $e['tag'];
        $pl = $e['place_id'] ? $placeOf((int) $e['place_id'], $e['lat'], $e['lon'], (string) $e['pname']) : null;
        foreach ($who as $p) {
            if (!isset($people[$p])) { continue; }
            if ($y !== null && in_array($tag, ['BIRT', 'CHR', 'BAPM'], true) && ($people[$p]['b'] === null || ($tag === 'BIRT' && $y < $people[$p]['b']))) { $people[$p]['b'] = $y; }
            if ($y !== null && in_array($tag, ['DEAT', 'BURI', 'CREM'], true) && ($people[$p]['d'] === null || ($tag === 'DEAT'))) { $people[$p]['d'] = $y; }
            if ($pl !== null) { $people[$p]['pl'][] = [$pl, $y]; }
        }
    }
    $anc = ld_famille_ancetres($pdo);
    $out = [];
    foreach ($people as $id => $p) { if ($p['pl']) { $out[] = [$p['n'], $p['b'], $p['d'], $p['pl'], isset($anc[$id]) ? 1 : 0]; } }
    if ($share) { // seulement les lieux des personnes montrées, renumérotés
        $keep = []; foreach ($out as $p) { foreach ($p[3] as $x) { $keep[$x[0]] = true; } }
        $map = []; $kept = [];
        foreach ($places as $i => $pl) { if (isset($keep[$i])) { $map[$i] = count($kept); $kept[] = $pl; } }
        foreach ($out as &$p) { $p[3] = array_map(static fn($x) => [$map[$x[0]], $x[1]], $p[3]); }
        unset($p);
        $places = $kept;
    }
    return ['places' => $places, 'people' => $out, 'kiosk' => $realKiosk, 'share' => $share];
}

/** la racine Sosa et ses ascendants : [id => true] */
function ld_famille_ancetres(PDO $pdo): array
{
    $root = 0;
    try { $root = (int) $pdo->query("SELECT value FROM app_settings WHERE key='genealogie-sosa-root'")->fetchColumn(); } catch (Throwable) {}
    if (!$root) { $root = (int) $pdo->query('SELECT id FROM persons WHERE is_start=1 ORDER BY id LIMIT 1')->fetchColumn(); }
    if (!$root) { return []; }
    $parents = [];
    foreach ($pdo->query('SELECT fc.child_id, f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id') as $r) {
        foreach (['partner1_id', 'partner2_id'] as $c) { if ($r[$c]) { $parents[(int) $r['child_id']][] = (int) $r[$c]; } }
    }
    $seen = [$root => true]; $queue = [$root];
    while ($queue) { $p = array_pop($queue); foreach ($parents[$p] ?? [] as $a) { if (!isset($seen[$a])) { $seen[$a] = true; $queue[] = $a; } } }
    return $seen;
}
