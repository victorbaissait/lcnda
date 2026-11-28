<?php
declare(strict_types=1);

/**
 * 🏠 Tableau de bord — les calculs en plus (écran : assets/js/app-tableau-de-bord.js) :
 *   📈 croissance de la base mois par mois, 🔄 « depuis 30 jours », 🎯 objectifs au long cours, 🔎 filtre d'une page
 *   (branche, de cujus, étiquette, dossier d'enquête), 🧭 prochaine action à faire sur place.
 *
 *   GET api.php?action=tresors&dash=growth[&months=12]  → {months: [{month, persons, events, sources, media}], totals: {…}}
 *   GET api.php?action=tresors&dash=period[&days=30]    → {days, since, persons, events, sources, media, changes}
 *   GET api.php?action=tresors&dash=goals               → {values: {persons, events, sources, media, transcribed, generations, sosa}}
 *   GET api.php?action=tresors&dash=filter_options      → {branches: [{name, n}], labels: [{id, name}], folders: [{id, title}]}
 *   GET api.php?action=tresors&dash=filter&kind=branch|person|label|folder&value=… → {ids: [...], label, stats: {…}}
 *   GET api.php?action=tresors&dash=next[&skip=f12,p8]  → {item: {kind: marriage|birth, …} | null, types: {MARR, BIRT}}
 *
 * Lecture seule (aucune table créée). Routé par lib/tresors.php (tresors_dispatch) tant qu'api.php n'a pas sa propre action.
 */

/** le journal des modifications sur une période : combien de fiches, événements, sources, médias créés */
function dashplus_created(PDO $pdo, string $from, string $to): array
{
    $st = $pdo->prepare("SELECT
            count(DISTINCT CASE WHEN entity_type='person' AND action='create' THEN entity_id END),
            sum(CASE WHEN entity_type='event' AND action='create' THEN 1 ELSE 0 END),
            sum(CASE WHEN entity_type='source' AND action='create' THEN 1 ELSE 0 END),
            sum(CASE WHEN (entity_type='media' AND action='create') OR action='upload' THEN 1 ELSE 0 END),
            count(*)
        FROM change_log WHERE created_at>=? AND created_at<?");
    $st->execute([$from, $to]);
    [$p, $e, $s, $m, $c] = array_map('intval', $st->fetch(PDO::FETCH_NUM) ?: [0, 0, 0, 0, 0]);
    $st->closeCursor();
    return ['persons' => $p, 'events' => $e, 'sources' => $s, 'media' => $m, 'changes' => $c];
}

function dashplus_totals(PDO $pdo): array
{
    $n = static fn(string $t): int => (int) $pdo->query("SELECT count(*) FROM {$t}")->fetchColumn();
    return ['persons' => $n('persons'), 'events' => $n('events'), 'sources' => $n('sources'), 'media' => $n('media')];
}

/** 📈 mois par mois (le plus ancien d'abord) ; les totaux d'aujourd'hui pour tracer la courbe cumulée */
function dashplus_growth(PDO $pdo, int $months): array
{
    $months = max(3, min(60, $months));
    $now = new DateTimeImmutable('now');
    $out = [];
    for ($i = $months - 1; $i >= 0; $i--) {
        $start = $now->modify("first day of -{$i} month")->format('Y-m-01');
        $end = (new DateTimeImmutable($start))->modify('first day of next month')->format('Y-m-01');
        $out[] = ['month' => substr($start, 0, 7)] + dashplus_created($pdo, $start, $end);
    }
    return ['months' => $out, 'totals' => dashplus_totals($pdo)];
}

/** 🔄 depuis N jours */
function dashplus_period(PDO $pdo, int $days): array
{
    $days = max(1, min(3660, $days));
    $since = (new DateTimeImmutable('now'))->modify("-{$days} days")->format('Y-m-d H:i:s');
    $to = (new DateTimeImmutable('now'))->modify('+1 day')->format('Y-m-d H:i:s');
    return ['days' => $days, 'since' => substr($since, 0, 10)] + dashplus_created($pdo, $since, $to);
}

/** la racine Sosa (Listes → SOSA, sinon la personne de départ) */
function dashplus_sosa_root(PDO $pdo): int
{
    $root = 0;
    try { $root = (int) $pdo->query("SELECT value FROM app_settings WHERE key='genealogie-sosa-root'")->fetchColumn(); } catch (Throwable) {}
    if (!$root) { $root = (int) $pdo->query('SELECT id FROM persons WHERE is_start=1 LIMIT 1')->fetchColumn(); }
    return $root;
}

/** parents : enfant → [parents] ; enfants : parent → [enfants] */
function dashplus_links(PDO $pdo): array
{
    $parents = []; $children = [];
    foreach ($pdo->query('SELECT fc.child_id, f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id') as $r) {
        foreach (['partner1_id', 'partner2_id'] as $c) {
            if ($r[$c]) { $parents[(int) $r['child_id']][] = (int) $r[$c]; $children[(int) $r[$c]][] = (int) $r['child_id']; }
        }
    }
    return [$parents, $children];
}

/** 🎯 les chiffres que suivent les objectifs */
function dashplus_goal_values(PDO $pdo): array
{
    $t = dashplus_totals($pdo);
    $transcribed = (int) $pdo->query("SELECT count(*) FROM media WHERE trim(COALESCE(transcription,''))<>''")->fetchColumn();
    if ($pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='act_transcriptions'")->fetchColumn()) {
        $transcribed = max($transcribed, (int) $pdo->query('SELECT count(*) FROM act_transcriptions')->fetchColumn());
    }
    // générations complètes : la génération g (la racine = 1) a ses 2^(g-1) ancêtres
    $root = dashplus_sosa_root($pdo); $complete = 0; $sosa = 0;
    if ($root) {
        [$parents] = dashplus_links($pdo);
        $gen = [$root]; $seen = [$root => true];
        for ($g = 1; $g <= 30 && $gen; $g++) {
            if (count($gen) >= (1 << ($g - 1)) && $complete === $g - 1) { $complete = $g; }
            $next = [];
            foreach ($gen as $p) { foreach (array_slice($parents[$p] ?? [], 0, 2) as $a) { if (!isset($seen[$a])) { $seen[$a] = true; $next[] = $a; $sosa++; } } }
            $gen = $next;
        }
    }
    return $t + ['transcribed' => $transcribed, 'generations' => $complete, 'sosa' => $sosa];
}

function dashplus_filter_options(PDO $pdo): array
{
    $branches = $pdo->query("SELECT name, count(*) AS n FROM (SELECT COALESCE(NULLIF(trim(g.name),''), NULLIF(trim(p.last_name),'')) AS name FROM persons p LEFT JOIN surname_groups g ON g.id=p.surname_group_id WHERE COALESCE(p.kind,'human')<>'animal') WHERE name IS NOT NULL GROUP BY name COLLATE NOCASE ORDER BY n DESC, name LIMIT 300")->fetchAll(PDO::FETCH_ASSOC);
    $labels = $pdo->query('SELECT id, name FROM labels ORDER BY name COLLATE NOCASE LIMIT 500')->fetchAll(PDO::FETCH_ASSOC);
    $folders = $pdo->query('SELECT id, title FROM investigations ORDER BY updated_at DESC, id DESC LIMIT 300')->fetchAll(PDO::FETCH_ASSOC);
    return ['branches' => array_map(static fn($r) => ['name' => (string) $r['name'], 'n' => (int) $r['n']], $branches),
        'labels' => array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => (string) $r['name']], $labels),
        'folders' => array_map(static fn($r) => ['id' => (int) $r['id'], 'title' => (string) $r['title']], $folders)];
}

/** 🔎 les fiches d'une page filtrée, et ses chiffres clés */
function dashplus_filter(PDO $pdo, string $kind, string $value): array
{
    $ids = []; $label = $value;
    if ($kind === 'branch') {
        $st = $pdo->prepare("SELECT p.id FROM persons p LEFT JOIN surname_groups g ON g.id=p.surname_group_id WHERE COALESCE(NULLIF(trim(g.name),''), NULLIF(trim(p.last_name),'')) = ? COLLATE NOCASE");
        $st->execute([$value]); $ids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    } elseif ($kind === 'person') {
        $root = (int) $value;
        $nm = $pdo->prepare("SELECT trim(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) FROM persons WHERE id=?"); $nm->execute([$root]); $label = (string) ($nm->fetchColumn() ?: '');
        if ($label !== '') {
            [$parents, $children] = dashplus_links($pdo);
            $seen = [$root => true];
            foreach ([$parents, $children] as $map) { $queue = [$root]; while ($queue) { $p = array_pop($queue); foreach ($map[$p] ?? [] as $x) { if (!isset($seen[$x])) { $seen[$x] = true; $queue[] = $x; } } } }
            $ids = array_keys($seen);
        }
    } elseif ($kind === 'label') {
        $nm = $pdo->prepare('SELECT name FROM labels WHERE id=?'); $nm->execute([(int) $value]); $label = (string) ($nm->fetchColumn() ?: '');
        $st = $pdo->prepare("SELECT entity_id FROM label_links WHERE label_id=? AND entity_type='person'"); $st->execute([(int) $value]); $ids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    } elseif ($kind === 'folder') {
        $nm = $pdo->prepare('SELECT title, person_id FROM investigations WHERE id=?'); $nm->execute([(int) $value]); $row = $nm->fetch(PDO::FETCH_ASSOC) ?: null;
        $label = (string) ($row['title'] ?? '');
        if ($row) {
            $ids = [(int) $row['person_id']];
            if ($pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='investigation_persons'")->fetchColumn()) {
                $st = $pdo->prepare('SELECT person_id FROM investigation_persons WHERE investigation_id=?'); $st->execute([(int) $value]);
                $ids = array_merge($ids, array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN)));
            }
        }
    } else {
        throw new LcndaBadInput('Filtre inconnu.');
    }
    $ids = array_values(array_unique(array_filter($ids)));
    $stats = ['persons' => count($ids), 'events' => 0, 'media' => 0, 'sources' => 0, 'places' => 0];
    if ($ids) {
        $pdo->exec('CREATE TEMP TABLE IF NOT EXISTS dashplus_ids (id INTEGER PRIMARY KEY)'); $pdo->exec('DELETE FROM dashplus_ids');
        $ins = $pdo->prepare('INSERT OR IGNORE INTO dashplus_ids(id) VALUES(?)'); foreach ($ids as $id) { $ins->execute([$id]); }
        $fam = "(SELECT id FROM families WHERE partner1_id IN (SELECT id FROM dashplus_ids) OR partner2_id IN (SELECT id FROM dashplus_ids))";
        $stats['events'] = (int) $pdo->query("SELECT count(*) FROM events WHERE person_id IN (SELECT id FROM dashplus_ids) OR family_id IN {$fam}")->fetchColumn();
        $stats['places'] = (int) $pdo->query("SELECT count(DISTINCT place_id) FROM events WHERE place_id IS NOT NULL AND (person_id IN (SELECT id FROM dashplus_ids) OR family_id IN {$fam})")->fetchColumn();
        $stats['media'] = (int) $pdo->query("SELECT count(DISTINCT media_id) FROM media_links WHERE entity_type='person' AND entity_id IN (SELECT id FROM dashplus_ids)")->fetchColumn();
        $stats['sources'] = (int) $pdo->query("SELECT count(DISTINCT source_id) FROM source_links WHERE entity_type='person' AND entity_id IN (SELECT id FROM dashplus_ids)")->fetchColumn();
        $pdo->exec('DELETE FROM dashplus_ids');
    }
    return ['kind' => $kind, 'value' => $value, 'label' => $label, 'ids' => $ids, 'stats' => $stats];
}

/** 🧭 une seule chose à faire, remplissable sur place : la date de mariage d'un couple qui a des enfants, sinon la naissance d'un ancêtre */
function dashplus_next(PDO $pdo, array $skip): array
{
    $type = static function (string $tag) use ($pdo): int { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$tag]); return (int) $s->fetchColumn(); };
    $types = ['MARR' => $type('MARR'), 'BIRT' => $type('BIRT')];
    $name = "trim(COALESCE(%1\$s.first_name,'') || ' ' || COALESCE(%1\$s.last_name,''))";
    $skipF = array_map('intval', array_map(static fn($s) => substr($s, 1), array_filter($skip, static fn($s) => str_starts_with($s, 'f'))));
    $skipP = array_map('intval', array_map(static fn($s) => substr($s, 1), array_filter($skip, static fn($s) => str_starts_with($s, 'p'))));
    $notIn = static fn(string $col, array $l) => $l ? " AND {$col} NOT IN (" . implode(',', array_map('intval', $l)) . ')' : '';
    $hasLock = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('families') WHERE name='is_locked'")->fetchColumn();
    if ($types['MARR']) {
        $row = $pdo->query('SELECT f.id, f.partner1_id, f.partner2_id, ' . sprintf($name, 'p1') . ' AS a, ' . sprintf($name, 'p2') . " AS b, (SELECT count(*) FROM family_children fc WHERE fc.family_id=f.id) AS kids
            FROM families f JOIN persons p1 ON p1.id=f.partner1_id JOIN persons p2 ON p2.id=f.partner2_id
            WHERE NOT EXISTS(SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.family_id=f.id AND t.gedcom_tag IN ('MARR','MRCI','MRRE'))
              AND COALESCE(p1.is_locked,0)=0 AND COALESCE(p2.is_locked,0)=0" . ($hasLock ? ' AND COALESCE(f.is_locked,0)=0' : '') . $notIn('f.id', $skipF) . '
            ORDER BY kids DESC, f.id LIMIT 1')->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            return ['types' => $types, 'item' => ['kind' => 'marriage', 'key' => 'f' . $row['id'], 'family_id' => (int) $row['id'], 'a' => (string) $row['a'], 'b' => (string) $row['b'],
                'a_id' => (int) $row['partner1_id'], 'b_id' => (int) $row['partner2_id'], 'kids' => (int) $row['kids']]];
        }
    }
    if ($types['BIRT']) {
        $root = dashplus_sosa_root($pdo); $order = '';
        if ($root) { [$parents] = dashplus_links($pdo); $seen = [$root => 0]; $q = [$root]; while ($q) { $p = array_shift($q); foreach ($parents[$p] ?? [] as $a) { if (!isset($seen[$a])) { $seen[$a] = $seen[$p] + 1; $q[] = $a; } } }
            $near = array_slice(array_keys($seen), 0, 2000); if ($near) { $order = 'CASE WHEN p.id IN (' . implode(',', $near) . ') THEN 0 ELSE 1 END, '; } }
        $row = $pdo->query('SELECT p.id, ' . sprintf($name, 'p') . " AS nm FROM persons p
            WHERE COALESCE(p.kind,'human')<>'animal' AND COALESCE(p.is_locked,0)=0 AND trim(COALESCE(p.first_name,'') || COALESCE(p.last_name,''))<>''
              AND NOT EXISTS(SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM'))" . $notIn('p.id', $skipP) . "
            ORDER BY {$order}p.id LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if ($row) { return ['types' => $types, 'item' => ['kind' => 'birth', 'key' => 'p' . $row['id'], 'person_id' => (int) $row['id'], 'a' => (string) $row['nm']]]; }
    }
    return ['types' => $types, 'item' => null];
}

function dashplus_dispatch(PDO $pdo, string $op): never
{
    try {
        $int = static fn(string $k, int $d) => isset($_GET[$k]) && is_numeric($_GET[$k]) ? (int) $_GET[$k] : $d;
        match ($op) {
            'growth' => json_response(dashplus_growth($pdo, $int('months', 12))),
            'period' => json_response(dashplus_period($pdo, $int('days', 30))),
            'goals' => json_response(['values' => dashplus_goal_values($pdo)]),
            'filter_options' => json_response(dashplus_filter_options($pdo)),
            'filter' => json_response(dashplus_filter($pdo, (string) ($_GET['kind'] ?? ''), mb_substr(trim((string) ($_GET['value'] ?? '')), 0, 200))),
            'next' => json_response(dashplus_next($pdo, array_slice(array_values(array_filter(explode(',', (string) ($_GET['skip'] ?? '')), static fn($s) => (bool) preg_match('/^[fp]\d+$/', $s))), 0, 500))),
            default => throw new LcndaBadInput('Demande inconnue du tableau de bord.'),
        };
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 400);
    }
}
