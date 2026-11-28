<?php
declare(strict_types=1);

/**
 * 🎖️ Soldats et noms (lot 8) — ce que le serveur donne à assets/js/heritage-lot8-soldats-noms.js (lecture seule).
 *  GET l8b_person : la vie d'une personne (la même que « 🧭 Histoire autour », lib/histoire_autour.php ha_life) + son dossier
 *                   militaire (military_data : régiment, services, notes), les unités et événements du bloc « Poilu 14-18 »,
 *                   ses parents (connus ou non), ses variantes de nom, « mort pour la France », vivant ou non ;
 *  GET l8b_tree   : pour les listes de la famille : les noms de famille (avec leur nombre), les personnes nées entre 1785 et
 *                   1815 (prénoms révolutionnaires), les personnes sans parents connus (enfants trouvés).
 * Tout le calcul (régiment lu dans le texte, prénoms, noms) est fait dans le navigateur.
 */

require_once __DIR__ . '/histoire_autour.php';

function l8b_has_table(PDO $pdo, string $t): bool
{
    $s = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?");
    $s->execute([$t]);
    return (bool) $s->fetchColumn();
}

function l8b_person(PDO $pdo, int $id): array
{
    if ($id <= 0) { throw new RuntimeException('Personne manquante.'); }
    $life = ha_life($pdo, $id);
    $pc = ha_cols($pdo, 'persons');
    $s = $pdo->prepare('SELECT * FROM persons WHERE id=?');
    $s->execute([$id]);
    $p = $s->fetch(PDO::FETCH_ASSOC) ?: [];
    $mil = [];
    if (in_array('military_data', $pc, true) && trim((string) ($p['military_data'] ?? '')) !== '') {
        $m = json_decode((string) $p['military_data'], true);
        if (is_array($m)) { foreach ($m as $k => $v) { if (is_scalar($v) && trim((string) $v) !== '') { $mil[(string) $k] = mb_substr((string) $v, 0, 4000); } } }
    }
    $units = $pevents = [];
    if (l8b_has_table($pdo, 'poilu_units')) {
        $u = $pdo->prepare('SELECT unit_name, date_from, date_to, jmo_cote, jmo_url, note FROM poilu_units WHERE person_id=? ORDER BY position, id');
        $u->execute([$id]);
        $units = $u->fetchAll(PDO::FETCH_ASSOC);
    }
    if (l8b_has_table($pdo, 'poilu_events')) {
        $u = $pdo->prepare('SELECT event_date, kind, place_text, note FROM poilu_events WHERE person_id=? ORDER BY event_date, id');
        $u->execute([$id]);
        $pevents = $u->fetchAll(PDO::FETCH_ASSOC);
    }
    // ses parents : une famille où il est enfant, avec au moins un partenaire
    $par = $pdo->prepare('SELECT f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=?');
    $par->execute([$id]);
    $parents = 0;
    foreach ($par->fetchAll(PDO::FETCH_ASSOC) as $f) { $parents += ((int) $f['partner1_id'] > 0 ? 1 : 0) + ((int) $f['partner2_id'] > 0 ? 1 : 0); }
    $vars = [];
    if (l8b_has_table($pdo, 'name_variants')) {
        $v = $pdo->prepare('SELECT id, type, first_name, last_name, source_note FROM name_variants WHERE person_id=? ORDER BY position, id');
        $v->execute([$id]);
        $vars = $v->fetchAll(PDO::FETCH_ASSOC);
    }
    $life['person']['middle'] = trim((string) ($p['middle_name'] ?? ''));
    $life['person']['living'] = (string) ($p['living_status'] ?? '');
    $life['person']['mpf'] = (string) ($p['mort_pour_la_france'] ?? 'unknown');
    $life['person']['locked'] = !empty($p['is_locked']);
    $life['military'] = $mil;
    $life['poilu'] = ['units' => $units, 'events' => $pevents];
    $life['parents'] = $parents;
    $life['variants'] = $vars;
    return $life;
}

function l8b_tree(PDO $pdo): array
{
    $names = [];
    foreach ($pdo->query("SELECT last_name AS n, count(*) AS c FROM persons WHERE trim(COALESCE(last_name,''))<>'' AND COALESCE(kind,'')<>'animal' GROUP BY last_name COLLATE NOCASE ORDER BY c DESC LIMIT 6000") as $r) {
        $names[] = [(string) $r['n'], (int) $r['c']];
    }
    // l'année de naissance (ou de baptême) de chacun, d'après ses événements
    $birth = "(SELECT COALESCE(e.year, CAST(substr(e.sort_date,1,4) AS INTEGER)) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','BAPM','CHR') ORDER BY t.gedcom_tag='BIRT' DESC LIMIT 1)";
    $bdate = "(SELECT COALESCE(e.sort_date,'') FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','BAPM','CHR') ORDER BY t.gedcom_tag='BIRT' DESC LIMIT 1)";
    $rev = [];
    $q = $pdo->query("SELECT * FROM (SELECT p.id, p.first_name AS f, COALESCE(p.middle_name,'') AS m, p.last_name AS l, p.gender AS g, $birth AS y, $bdate AS d FROM persons p WHERE COALESCE(p.kind,'')<>'animal') WHERE y BETWEEN 1785 AND 1815 LIMIT 30000");
    foreach ($q as $r) { $rev[] = [(int) $r['id'], trim($r['f'] . ' ' . $r['m']), (string) $r['l'], (string) $r['g'], (int) $r['y'], (string) $r['d']]; }
    $orph = [];
    $q = $pdo->query("SELECT * FROM (SELECT p.id, p.first_name AS f, p.last_name AS l, p.gender AS g, $birth AS y FROM persons p WHERE COALESCE(p.kind,'')<>'animal'
        AND NOT EXISTS (SELECT 1 FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=p.id AND (COALESCE(f.partner1_id,0)>0 OR COALESCE(f.partner2_id,0)>0))) WHERE y IS NULL OR y < 1950 LIMIT 30000");
    foreach ($q as $r) { $orph[] = [(int) $r['id'], (string) $r['f'], (string) $r['l'], (string) $r['g'], $r['y'] !== null ? (int) $r['y'] : null]; }
    return ['ok' => true, 'surnames' => $names, 'born_rev' => $rev, 'no_parents' => $orph];
}

function l8b_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'l8b_person' => l8b_person($pdo, safe_int($q['id'] ?? 0)),
        'l8b_tree' => l8b_tree($pdo),
        default => throw new RuntimeException('Action inconnue.'),
    };
}
