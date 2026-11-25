<?php
declare(strict_types=1);

/**
 * 🧩 Branches isolées (« diagnostic de l'arbre ») : les groupes de fiches qu'AUCUN lien de parenté ou d'union ne relie à
 * la personne de départ (ni parent, ni enfant, ni conjoint, de proche en proche). Écran : un cadre dans Réglages → ✅ Contrôle
 * de la base (assets/js/heritage-branches-isolees.js).
 * Pour chaque groupe : sa taille, les noms les plus fréquents, d'où il vient quand on le sait (un import encore annulable,
 * une fusion d'arbre, la date de création des fiches), et « 👁 Voir ces fiches », « 🔗 Relier à… » (le lien se crée par
 * add_relation, ↶ par remove_relation), « C'est voulu » (retenu ; ↶).
 * Calcul en une passe (union-find sur families et family_children) : moins d'une seconde pour 20 000 fiches.
 * Les fiches « hors généalogie » et les animaux ne comptent pas.
 *
 *  GET  isoles_list               → {root, total, main, groups[], ignored[]}
 *  GET  isoles_group&key=         → les fiches d'un groupe (pour « Voir ces fiches »)
 *  POST isoles_ignore {key, size} · isoles_unignore {key}
 */

function bi_schema(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS isoles_ignored (gkey TEXT PRIMARY KEY, size INTEGER NOT NULL DEFAULT 0, label TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $done = true;
}

/** les groupes (composantes connexes) de l'arbre : [personne → représentant], en une passe */
function bi_components(PDO $pdo): array
{
    $cols = array_column($pdo->query('PRAGMA table_info(persons)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    $skip = [];
    if (in_array('kind', $cols, true)) { $skip[] = "kind='animal'"; }
    if (in_array('outside_genealogy', $cols, true)) { $skip[] = 'outside_genealogy=1'; }
    $ids = array_map('intval', $pdo->query('SELECT id FROM persons' . ($skip ? ' WHERE NOT (' . implode(' OR ', $skip) . ')' : '') . ' ORDER BY id')->fetchAll(PDO::FETCH_COLUMN));
    $parent = array_combine($ids, $ids) ?: [];
    $find = static function (int $x) use (&$parent): int {
        $r = $x; while ($parent[$r] !== $r) { $r = $parent[$r]; }
        while ($parent[$x] !== $r) { $n = $parent[$x]; $parent[$x] = $r; $x = $n; }
        return $r;
    };
    $union = static function (int $a, int $b) use (&$parent, $find): void {
        if (!isset($parent[$a], $parent[$b])) { return; }
        $ra = $find($a); $rb = $find($b);
        if ($ra !== $rb) { if ($ra < $rb) { $parent[$rb] = $ra; } else { $parent[$ra] = $rb; } }
    };
    $fam = [];
    foreach ($pdo->query('SELECT id, partner1_id, partner2_id FROM families', PDO::FETCH_NUM) as [$fid, $a, $b]) {
        $a = (int) $a; $b = (int) $b; $fam[(int) $fid] = $a ?: $b;
        if ($a && $b) { $union($a, $b); }
    }
    foreach ($pdo->query('SELECT family_id, child_id FROM family_children', PDO::FETCH_NUM) as [$fid, $c]) {
        $fid = (int) $fid; $c = (int) $c;
        if (!empty($fam[$fid])) { $union($fam[$fid], $c); }
        else { $fam[$fid] = $c; } // famille sans parent connu : les enfants restent frères et sœurs entre eux
    }
    $comp = [];
    foreach ($ids as $id) { $comp[$find($id)][] = $id; }
    return $comp;
}

/** d'où viennent ces fiches : un import encore annulable (son reçu), une fusion d'arbre (journal), sinon les dates de création */
function bi_origins(PDO $pdo): array
{
    $out = ['imports' => [], 'merges' => []];
    if (function_exists('import_receipt_dir')) {
        foreach (glob(import_receipt_dir() . '/*.json') ?: [] as $f) {
            $r = json_decode((string) @file_get_contents($f), true);
            if (!is_array($r) || !isset($r['ranges']['persons'])) { continue; }
            $out['imports'][] = ['from' => (int) $r['ranges']['persons'][0], 'to' => (int) $r['ranges']['persons'][1], 'label' => (string) ($r['label'] ?? ''), 'at' => substr((string) ($r['at'] ?? ''), 0, 10), 'kind' => (string) ($r['kind'] ?? '')];
        }
    }
    try {
        foreach ($pdo->query("SELECT summary, created_at FROM change_log WHERE entity_type='meta' AND summary LIKE 'Fusion de l''arbre%' ORDER BY id DESC LIMIT 20") as $r) { $out['merges'][] = ['label' => (string) $r['summary'], 'at' => substr((string) $r['created_at'], 0, 10)]; }
    } catch (Throwable $_) {}
    return $out;
}

/** GET isoles_list */
function bi_list(PDO $pdo, bool $withIds = false): array
{
    bi_schema($pdo);
    $t0 = microtime(true);
    $comp = bi_components($pdo);
    $total = array_sum(array_map('count', $comp));
    $root = (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn();
    $mainRep = null;
    foreach ($comp as $rep => $members) { if (in_array($root, $members, true)) { $mainRep = $rep; break; } }
    if ($mainRep === null && $comp) { // pas de personne de départ parmi les fiches comptées : le plus grand groupe sert de tronc
        $mainRep = array_key_first($comp); foreach ($comp as $rep => $m) { if (count($m) > count($comp[$mainRep])) { $mainRep = $rep; } }
    }
    $ignored = [];
    foreach ($pdo->query('SELECT gkey, size, label, created_at FROM isoles_ignored') as $r) { $ignored[(string) $r['gkey']] = $r; }
    $origins = bi_origins($pdo);
    $groups = []; $alone = [];
    foreach ($comp as $rep => $members) {
        if ($rep === $mainRep) { continue; }
        if (count($members) === 1) { $alone[] = $members[0]; continue; }
        $groups[] = ['key' => 'g:' . min($members), 'ids' => $members];
    }
    if ($alone) { $groups[] = ['key' => 'seules', 'ids' => $alone, 'alone' => true]; }
    $out = []; $outIgnored = [];
    foreach ($groups as $g) {
        $ids = $g['ids']; sort($ids);
        // les noms, les dates de création, les identifiants d'import : seulement pour ces fiches (par paquets)
        $names = []; $created = []; $sample = []; $gedcom = 0;
        foreach (array_chunk($ids, 500) as $chunk) {
            $s = $pdo->prepare(sprintf('SELECT id, first_name, last_name, gender, created_at, COALESCE(gedcom_id,\'\') AS gedcom_id FROM persons WHERE id IN (%s)', implode(',', array_fill(0, count($chunk), '?'))));
            $s->execute($chunk);
            foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $p) {
                $ln = trim((string) $p['last_name']); $k = mb_strtoupper($ln);
                if ($k !== '') { $names[$k] = ($names[$k] ?? 0) + 1; }
                $created[] = substr((string) $p['created_at'], 0, 10);
                if ($p['gedcom_id'] !== '') { $gedcom++; }
                if (count($sample) < 6) { $sample[] = ['id' => (int) $p['id'], 'name' => trim($p['first_name'] . ' ' . mb_strtoupper($ln)) ?: '#' . $p['id'], 'gender' => (string) $p['gender']]; }
            }
        }
        arsort($names);
        sort($created);
        $from = $created[0] ?? ''; $to = end($created) ?: '';
        $origin = null;
        foreach ($origins['imports'] as $im) {
            $in = count(array_filter($ids, static fn($i) => $i > $im['from'] && $i <= $im['to']));
            if ($in >= max(1, (int) ceil(count($ids) / 2))) { $origin = ['kind' => 'import', 'label' => $im['label'], 'at' => $im['at']]; break; }
        }
        if (!$origin) {
            foreach ($origins['merges'] as $m) { if ($m['at'] !== '' && $m['at'] >= $from && $m['at'] <= $to) { $origin = ['kind' => 'merge', 'label' => $m['label'], 'at' => $m['at']]; break; } }
        }
        if (!$origin && $gedcom >= max(1, (int) ceil(count($ids) / 2))) { $origin = ['kind' => 'import', 'label' => '', 'at' => $from]; }
        $row = ['key' => $g['key'], 'size' => count($ids), 'alone' => !empty($g['alone']), 'names' => array_map(static fn($k, $n) => ['name' => $k, 'n' => $n], array_slice(array_keys($names), 0, 4), array_slice(array_values($names), 0, 4)),
            'sample' => $sample, 'created_from' => $from, 'created_to' => $to, 'origin' => $origin];
        if ($withIds) { $row['ids'] = $ids; }
        if (isset($ignored[$g['key']])) { $row['ignored_at'] = (string) $ignored[$g['key']]['created_at']; $outIgnored[] = $row; } else { $out[] = $row; }
    }
    usort($out, static fn($a, $b) => [$a['alone'], -$a['size']] <=> [$b['alone'], -$b['size']]);
    $rootName = '';
    if ($root) { $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $s->execute([$root]); $r = $s->fetch(PDO::FETCH_ASSOC); $rootName = $r ? trim($r['first_name'] . ' ' . mb_strtoupper((string) $r['last_name'])) : ''; }
    return ['root' => ['id' => $root, 'name' => $rootName], 'total' => $total, 'main' => $mainRep !== null ? count($comp[$mainRep]) : 0, 'groups' => $out, 'ignored' => $outIgnored,
        'isolated' => array_sum(array_map(static fn($g) => $g['size'], $out)), 'ms' => (int) round((microtime(true) - $t0) * 1000)];
}

/** GET isoles_group&key= : les fiches d'un groupe (nom, années), pour « Voir ces fiches » et « Relier à… » */
function bi_group(PDO $pdo, string $key): array
{
    if (!preg_match('/^(g:\d+|seules)$/', $key)) { throw new LcndaBadInput('Groupe inconnu.'); }
    $all = bi_list($pdo, true);
    $g = null;
    foreach (array_merge($all['groups'], $all['ignored']) as $x) { if ($x['key'] === $key) { $g = $x; break; } }
    if (!$g) { throw new LcndaBadInput(i18n_t('Ce groupe n’existe plus : il a peut-être été relié à l’arbre.')); }
    $people = [];
    foreach (array_chunk(array_slice($g['ids'], 0, 3000), 500) as $chunk) {
        $s = $pdo->prepare(sprintf("SELECT p.id, p.first_name, p.last_name, p.gender, p.created_at,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','BAPM','CHR') AND e.year IS NOT NULL ORDER BY e.year LIMIT 1) AS by,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI') AND e.year IS NOT NULL ORDER BY e.year LIMIT 1) AS dy,
            (SELECT count(*) FROM families f WHERE f.partner1_id=p.id OR f.partner2_id=p.id) + (SELECT count(*) FROM family_children fc WHERE fc.child_id=p.id) AS links
            FROM persons p WHERE p.id IN (%s)", implode(',', array_fill(0, count($chunk), '?'))));
        $s->execute($chunk);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $p) {
            $people[] = ['id' => (int) $p['id'], 'first_name' => (string) $p['first_name'], 'last_name' => (string) $p['last_name'], 'gender' => (string) $p['gender'], 'birth_year' => $p['by'] !== null ? (int) $p['by'] : null,
                'death_year' => $p['dy'] !== null ? (int) $p['dy'] : null, 'links' => (int) $p['links'], 'created_at' => (string) $p['created_at']];
        }
    }
    // la plus ancienne génération d'abord (c'est souvent elle qu'on relie à l'arbre)
    usort($people, static fn($a, $b) => [$a['birth_year'] ?? 9999, $a['last_name'], $a['first_name']] <=> [$b['birth_year'] ?? 9999, $b['last_name'], $b['first_name']]);
    unset($g['ids']);
    return ['group' => $g, 'people' => $people, 'root' => $all['root']];
}

function bi_ignore(PDO $pdo, array $d, bool $on): array
{
    bi_schema($pdo);
    $key = (string) ($d['key'] ?? '');
    if (!preg_match('/^(g:\d+|seules)$/', $key)) { throw new LcndaBadInput('Groupe inconnu.'); }
    if ($on) { $pdo->prepare('INSERT INTO isoles_ignored(gkey, size, label) VALUES(?,?,?) ON CONFLICT(gkey) DO UPDATE SET size=excluded.size, label=excluded.label, created_at=CURRENT_TIMESTAMP')->execute([$key, safe_int($d['size'] ?? 0), mb_substr(safe_text($d['label'] ?? ''), 0, 200)]); }
    else { $pdo->prepare('DELETE FROM isoles_ignored WHERE gkey=?')->execute([$key]); }
    return ['ok' => true, 'key' => $key];
}

function bi_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'isoles_list' => bi_list($pdo),
        'isoles_group' => bi_group($pdo, (string) ($q['key'] ?? '')),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function bi_api_post(PDO $pdo, string $action, array $d): array
{
    return match ($action) {
        'isoles_ignore' => bi_ignore($pdo, $d, true),
        'isoles_unignore' => bi_ignore($pdo, $d, false),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
