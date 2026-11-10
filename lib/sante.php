<?php
declare(strict_types=1);

/**
 * 🩺 Santé de la famille : les maladies, handicaps, causes de décès et épidémies traversées connus dans la famille, et la façon
 * dont ils se répartissent dans les branches. C'est de la mémoire et de l'histoire familiale : aucun conseil médical, aucun
 * calcul de risque ni pourcentage — seulement ce qui a été noté, et des nombres de personnes.
 *
 * PRIVÉ :
 *  - caché au départ : rien ne se lit ni ne s'écrit tant que Réglages → Données → « 🩺 Santé de la famille » ne l'a pas montré
 *    (clé « genealogie-sante » {show: true} de app_settings, la même que le navigateur garde) ; jamais en mode consultation ;
 *  - une table à part (health_records, structure n°79) qu'aucun export ne lit : GEDCOM (sauf la case « Inclure la santé » au
 *    moment de l'export, sante_gedcom_rows), site web, partage avec la famille, paquets, livres, mode simple, jeux ;
 *  - pas de journal des modifications (le contenu n'y est pas recopié) : « ↶ Annuler » renvoie la ligne supprimée elle-même ;
 *  - la sorte « health » du menu de choix (picker_health) ne renvoie rien quand la santé est cachée.
 * Les causes de décès déjà écrites sur les événements de décès (events.cause) sont lues telles quelles (« d'après l'acte »),
 * les épidémies historiques viennent de la liste unique « Le monde autour » (world_around, lib/monde_autour.php).
 * Interface : assets/js/heritage-sante.js. Points d'entrée : sante_api_get() (GET action=sante) et sante_api_post() (POST sante_write).
 */

const SANTE_KINDS = ['maladie', 'handicap', 'deces', 'epidemie', 'autre'];
const SANTE_SETTING = 'genealogie-sante';

function sante_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS health_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL,
        kind TEXT NOT NULL DEFAULT 'maladie',
        label TEXT NOT NULL DEFAULT '',
        date_text TEXT NOT NULL DEFAULT '',
        year INTEGER,
        source_id INTEGER,
        citation TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        to_check INTEGER NOT NULL DEFAULT 0,
        world_id TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_health_records_person ON health_records(person_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_health_records_label ON health_records(label)');
}

/** la table existe (une base pas encore mise à jour : on la crée au premier passage, sans erreur) */
function sante_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    if (!$pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='health_records'")->fetchColumn()) { sante_schema($pdo); }
    $done = true;
}

function sante_kiosk(): bool { return function_exists('kiosk_state') && !empty(kiosk_state()['on']); }

/** montrée dans les Réglages ? (et jamais en mode consultation) */
function sante_visible(PDO $pdo): bool
{
    if (sante_kiosk()) { return false; }
    try {
        $s = $pdo->prepare('SELECT value FROM app_settings WHERE key=?'); $s->execute([SANTE_SETTING]);
        $v = json_decode((string) $s->fetchColumn(), true);
        return is_array($v) && !empty($v['show']);
    } catch (Throwable) { return false; }
}

function sante_fold(string $s): string
{
    if (function_exists('picker_fold')) { return picker_fold($s); }
    $s = mb_strtolower(trim($s));
    if (function_exists('ascii_fold')) { $s = ascii_fold($s); }
    return trim((string) preg_replace('/[^a-z0-9]+/', ' ', $s));
}

/** un numéro stable pour une maladie (le menu de choix veut un numéro) */
function sante_label_id(string $label): int { return (int) (crc32(sante_fold($label)) & 0x3fffffff) ?: 1; }

function sante_name(array $r): string { return trim(trim((string) ($r['first_name'] ?? '')) . ' ' . mb_strtoupper(trim((string) ($r['last_name'] ?? '')))); }

function sante_out(array $r): array
{
    return ['id' => (int) $r['id'], 'origin' => 'sante', 'person_id' => (int) $r['person_id'], 'kind' => (string) $r['kind'], 'label' => (string) $r['label'],
        'date_text' => (string) $r['date_text'], 'year' => $r['year'] !== null ? (int) $r['year'] : null, 'source_id' => $r['source_id'] !== null ? (int) $r['source_id'] : null,
        'source_title' => (string) ($r['source_title'] ?? ''), 'citation' => (string) $r['citation'], 'note' => (string) $r['note'], 'to_check' => (int) $r['to_check'] === 1,
        'world_id' => (string) $r['world_id'], 'created_at' => (string) $r['created_at'], 'updated_at' => (string) $r['updated_at'],
        'person' => isset($r['first_name']) ? sante_name($r) : '', 'gender' => (string) ($r['gender'] ?? '')];
}

/** les causes de décès écrites sur les décès (et sépultures) : lues seulement, « d'après l'acte » */
function sante_death_causes(PDO $pdo, ?int $personId = null): array
{
    $sql = "SELECT e.id, e.person_id, e.cause, e.date_text, e.year, p.first_name, p.last_name, p.gender FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN persons p ON p.id=e.person_id
        WHERE t.gedcom_tag IN ('DEAT','BURI') AND trim(COALESCE(e.cause,''))<>''" . ($personId ? ' AND e.person_id=?' : '') . ' ORDER BY e.id LIMIT 20000';
    $s = $pdo->prepare($sql); $s->execute($personId ? [$personId] : []);
    $out = []; $seen = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $k = (int) $r['person_id'] . '|' . sante_fold((string) $r['cause']);
        if (isset($seen[$k])) { continue; } // décès et sépulture qui disent la même chose : une seule ligne
        $seen[$k] = true;
        $out[] = ['id' => 'e' . (int) $r['id'], 'event_id' => (int) $r['id'], 'origin' => 'acte', 'person_id' => (int) $r['person_id'], 'kind' => 'deces', 'label' => trim((string) $r['cause']),
            'date_text' => (string) $r['date_text'], 'year' => function_exists('world_year') ? (world_year((string) $r['date_text'], $r['year']) ?: null) : ($r['year'] !== null ? (int) $r['year'] : null),
            'source_id' => null, 'source_title' => '', 'citation' => '', 'note' => '', 'to_check' => false, 'world_id' => '', 'created_at' => '', 'updated_at' => '',
            'person' => sante_name($r), 'gender' => (string) $r['gender']];
    }
    return $out;
}

function sante_records(PDO $pdo, ?int $personId = null): array
{
    sante_ensure($pdo);
    $s = $pdo->prepare('SELECT h.*, p.first_name, p.last_name, p.gender, COALESCE(src.title, \'\') AS source_title FROM health_records h JOIN persons p ON p.id=h.person_id
        LEFT JOIN sources src ON src.id=h.source_id' . ($personId ? ' WHERE h.person_id=?' : '') . ' ORDER BY COALESCE(h.year, 9999), h.id LIMIT 20000');
    $s->execute($personId ? [$personId] : []);
    return array_map('sante_out', $s->fetchAll(PDO::FETCH_ASSOC));
}

/** les années de vie (naissance ou baptême, décès ou sépulture) des fiches demandées */
function sante_life_years(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids)))); $out = [];
    foreach (array_chunk($ids, 500) as $chunk) {
        $in = implode(',', $chunk);
        foreach ($pdo->query("SELECT e.person_id, t.gedcom_tag AS tag, e.date_text, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id
            WHERE e.person_id IN ($in) AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI') ORDER BY (t.gedcom_tag IN ('BIRT','DEAT')) DESC, e.id") as $r) {
            $y = function_exists('world_year') ? world_year((string) $r['date_text'], $r['year']) : (int) $r['year']; if (!$y) { continue; }
            $k = in_array($r['tag'], ['BIRT', 'CHR', 'BAPM'], true) ? 'b' : 'd';
            $out[(int) $r['person_id']][$k] ??= $y;
        }
    }
    return $out;
}

/** les maladies déjà notées (pour proposer les mêmes mots) : [label, nombre de personnes] */
function sante_labels(PDO $pdo, bool $withActs = true): array
{
    $by = [];
    $add = static function (string $label, int $pid) use (&$by): void {
        $k = sante_fold($label); if ($k === '') { return; }
        $by[$k] ??= ['label' => $label, 'people' => []]; $by[$k]['people'][$pid] = true;
    };
    foreach (sante_records($pdo) as $r) { $add($r['label'], $r['person_id']); }
    if ($withActs) { foreach (sante_death_causes($pdo) as $r) { $add($r['label'], $r['person_id']); } }
    $out = array_map(static fn($x) => ['id' => sante_label_id($x['label']), 'label' => $x['label'], 'people' => count($x['people'])], array_values($by));
    usort($out, static fn($a, $b) => $b['people'] <=> $a['people'] ?: strcmp(sante_fold($a['label']), sante_fold($b['label'])));
    return $out;
}

/* ═════════ Lire ═════════ */

function sante_person(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare('SELECT id, first_name, last_name, gender, COALESCE(is_locked,0) AS is_locked, COALESCE(kind,\'human\') AS kind FROM persons WHERE id=?');
    try { $s->execute([$pid]); } catch (Throwable) { $s = $pdo->prepare('SELECT id, first_name, last_name, gender, COALESCE(is_locked,0) AS is_locked, \'human\' AS kind FROM persons WHERE id=?'); $s->execute([$pid]); }
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Fiche introuvable.'); }
    $life = sante_life_years($pdo, [$pid])[$pid] ?? [];
    $epi = [];
    if (function_exists('world_around')) {
        try {
            $w = world_around($pdo, $pid, ['cats' => 'épidémie', 'level' => 2]);
            foreach ($w['events'] ?? [] as $e) {
                $epi[] = ['id' => (string) ($e['id'] ?? ''), 'title' => (string) ($e['title'] ?? ''), 'from' => (int) ($e['from'] ?? 0), 'to' => (int) ($e['to'] ?? 0),
                    'desc' => (string) ($e['desc'] ?? ''), 'age' => $e['age'] ?? null, 'local' => ($e['hit'] ?? '') === 'local', 'url' => (string) ($e['url'] ?? ''), 'phrase' => (string) ($e['phrase'] ?? ''), 'hint' => (string) ($e['hint'] ?? '')];
            }
        } catch (Throwable) {}
    }
    return ['visible' => true, 'person' => ['id' => (int) $p['id'], 'name' => sante_name($p), 'first' => trim((string) $p['first_name']), 'gender' => (string) $p['gender'],
            'locked' => (int) $p['is_locked'] === 1, 'animal' => $p['kind'] === 'animal', 'birth' => $life['b'] ?? null, 'death' => $life['d'] ?? null],
        'records' => sante_records($pdo, $pid), 'acts' => sante_death_causes($pdo, $pid), 'epidemics' => $epi, 'labels' => array_slice(sante_labels($pdo), 0, 16)];
}

function sante_list(PDO $pdo): array
{
    $rows = array_merge(sante_records($pdo), sante_death_causes($pdo));
    $life = sante_life_years($pdo, array_column($rows, 'person_id'));
    foreach ($rows as &$r) { $l = $life[$r['person_id']] ?? []; $r['birth'] = $l['b'] ?? null; $r['death'] = $l['d'] ?? null; }
    unset($r);
    return ['visible' => true, 'rows' => $rows, 'labels' => sante_labels($pdo)];
}

/** une maladie choisie correspond à une ligne : mêmes mots (sans accents), ou la ligne la contient (« phtisie » ↔ « phtisie pulmonaire ») */
function sante_match(string $want, string $label): bool
{
    $w = sante_fold($want); $l = sante_fold($label);
    return $w !== '' && $l !== '' && ($w === $l || str_contains(' ' . $l . ' ', ' ' . $w . ' '));
}

/** l'éventail et les branches : les ancêtres de la personne (numéros Sosa), ce qui est noté pour chacun, et qui a la maladie choisie */
function sante_branches(PDO $pdo, array $g): array
{
    $root = safe_int($g['root'] ?? 0);
    $gens = max(2, min(8, safe_int($g['gens'] ?? 6, 6)));
    $want = mb_substr(trim(scalar_text($g['label'] ?? '', 'label')), 0, 200);
    if ($root <= 0) { throw new RuntimeException('Choisis d’abord la personne du centre.'); }
    $e = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $e->execute([$root]);
    if (!$e->fetchColumn()) { throw new RuntimeException('Fiche introuvable.'); }
    if (!function_exists('dgn_sosa')) { require_once __DIR__ . '/diagram_genea.php'; }
    $sosa = dgn_sosa($pdo, $root, $gens, 600);
    $ids = array_values(array_unique($sosa));
    $people = [];
    foreach (array_chunk($ids, 500) as $chunk) {
        foreach ($pdo->query('SELECT id, first_name, last_name, gender FROM persons WHERE id IN (' . implode(',', array_map('intval', $chunk)) . ')') as $r) { $people[(int) $r['id']] = $r; }
    }
    $life = sante_life_years($pdo, $ids);
    $notes = [];
    $idSet = array_flip($ids);
    foreach (array_merge(sante_records($pdo), sante_death_causes($pdo)) as $r) {
        if (isset($idSet[$r['person_id']])) { $notes[$r['person_id']][] = ['label' => $r['label'], 'kind' => $r['kind'], 'origin' => $r['origin'], 'to_check' => $r['to_check']]; }
    }
    $nodes = [];
    foreach ($sosa as $n => $pid) {
        $p = $people[$pid] ?? null; if (!$p) { continue; }
        $list = $notes[$pid] ?? [];
        $hits = $want !== '' ? array_values(array_filter($list, static fn($x) => sante_match($want, $x['label']))) : [];
        $nodes[] = ['sosa' => (int) $n, 'gen' => (int) floor(log((float) $n, 2)), 'id' => (int) $pid, 'name' => sante_name($p), 'first' => trim((string) $p['first_name']), 'last' => mb_strtoupper(trim((string) $p['last_name'])),
            'gender' => (string) $p['gender'], 'birth' => $life[$pid]['b'] ?? null, 'death' => $life[$pid]['d'] ?? null,
            'labels' => array_values(array_unique(array_map(static fn($x) => $x['label'], $list))), 'match' => (bool) $hits, 'hits' => array_values(array_unique(array_map(static fn($x) => $x['label'], $hits))),
            'to_check' => (bool) array_filter($hits, static fn($x) => $x['to_check'])];
    }
    // les branches : le côté du père et de la mère, puis les quatre grands-parents (un nombre de personnes, jamais un pourcentage)
    $byNo = []; foreach ($nodes as $nd) { $byNo[$nd['sosa']] = $nd; }
    $branch = static function (int $top, string $title) use ($nodes, $byNo): array {
        $level = (int) floor(log((float) $top, 2));
        $people = array_values(array_filter($nodes, static fn($nd) => $nd['sosa'] >= $top && ($nd['sosa'] >> ($nd['gen'] - $level)) === $top));
        return ['top' => $top, 'title' => $title, 'head' => $byNo[$top] ?? null, 'known' => count($people),
            'matches' => array_values(array_map(static fn($nd) => ['id' => $nd['id'], 'sosa' => $nd['sosa'], 'name' => $nd['name'], 'gender' => $nd['gender'], 'birth' => $nd['birth'], 'death' => $nd['death'], 'hits' => $nd['hits'], 'to_check' => $nd['to_check']],
                array_filter($people, static fn($nd) => $nd['match'])))];
    };
    $branches = $gens >= 3 ? [$branch(4, 'Côté du père de ton père'), $branch(5, 'Côté de la mère de ton père'), $branch(6, 'Côté du père de ta mère'), $branch(7, 'Côté de la mère de ta mère')]
        : [$branch(2, 'Côté du père'), $branch(3, 'Côté de la mère')];
    $center = array_values(array_filter($nodes, static fn($nd) => $nd['sosa'] < ($gens >= 3 ? 4 : 2) && $nd['match']));
    return ['visible' => true, 'root' => $byNo[1] ?? null, 'gens' => $gens, 'label' => $want, 'nodes' => $nodes, 'branches' => $branches,
        'center' => array_map(static fn($nd) => ['id' => $nd['id'], 'sosa' => $nd['sosa'], 'name' => $nd['name'], 'gender' => $nd['gender'], 'birth' => $nd['birth'], 'death' => $nd['death'], 'hits' => $nd['hits'], 'to_check' => $nd['to_check']], $center),
        'total' => count(array_filter($nodes, static fn($nd) => $nd['match'])), 'labels' => sante_labels($pdo)];
}

/* ═════════ Écrire ═════════ */

function sante_person_check(PDO $pdo, int $pid): void
{
    $p = $pdo->prepare('SELECT COALESCE(is_locked,0) FROM persons WHERE id=?'); $p->execute([$pid]); $l = $p->fetchColumn();
    if ($l === false) { throw new RuntimeException('Personne introuvable : choisis d’abord à qui se rattache cette information.'); }
    if (function_exists('assert_person_unlocked')) { assert_person_unlocked($pdo, $pid); return; }
    if ((int) $l === 1) { throw new RuntimeException('Fiche verrouillée. Déverrouille-la avant de la modifier.'); }
}

function sante_clean(array $d): array
{
    $kind = scalar_text($d['kind'] ?? 'maladie', 'kind'); if (!in_array($kind, SANTE_KINDS, true)) { throw new LcndaBadInput('Sorte inconnue.'); }
    $label = mb_substr(trim((string) preg_replace('/\s+/u', ' ', safe_text($d['label'] ?? ''))), 0, 200);
    if ($label === '') { throw new LcndaBadInput('Écris ce que c’était (une maladie, un handicap, une cause de décès…).'); }
    $date = mb_substr(trim(safe_text($d['date_text'] ?? '')), 0, 120);
    $src = safe_int($d['source_id'] ?? 0);
    return ['kind' => $kind, 'label' => $label, 'date_text' => $date, 'year' => function_exists('world_year') ? (world_year($date, null) ?: null) : null, 'source_id' => $src > 0 ? $src : null,
        'citation' => mb_substr(safe_text($d['citation'] ?? ''), 0, 300), 'note' => mb_substr(trim(scalar_text($d['note'] ?? '', 'note')), 0, 4000),
        'to_check' => !empty($d['to_check']) && (string) $d['to_check'] !== '0' ? 1 : 0, 'world_id' => (string) preg_replace('/[^a-z0-9_-]/i', '', mb_substr(safe_text($d['world_id'] ?? ''), 0, 20))];
}

function sante_save(PDO $pdo, array $d): array
{
    sante_ensure($pdo);
    $pid = safe_int($d['person_id'] ?? 0);
    sante_person_check($pdo, $pid);
    $c = sante_clean($d);
    if ($c['source_id']) { $s = $pdo->prepare('SELECT 1 FROM sources WHERE id=?'); $s->execute([$c['source_id']]); if (!$s->fetchColumn()) { $c['source_id'] = null; } }
    $id = safe_int($d['id'] ?? 0);
    if ($id > 0) {
        $o = $pdo->prepare('SELECT person_id FROM health_records WHERE id=?'); $o->execute([$id]); $old = $o->fetchColumn();
        if ($old === false) { throw new RuntimeException('Cette information n’existe plus : elle a peut-être été supprimée.'); }
        if ((int) $old !== $pid) { sante_person_check($pdo, (int) $old); }
        $pdo->prepare('UPDATE health_records SET person_id=?, kind=?, label=?, date_text=?, year=?, source_id=?, citation=?, note=?, to_check=?, world_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
            ->execute([$pid, $c['kind'], $c['label'], $c['date_text'], $c['year'], $c['source_id'], $c['citation'], $c['note'], $c['to_check'], $c['world_id'], $id]);
    } else {
        $n = (int) $pdo->query('SELECT count(*) FROM health_records')->fetchColumn();
        if ($n >= 50000) { throw new RuntimeException('Trop de lignes de santé (50 000 au plus).'); }
        $pdo->prepare('INSERT INTO health_records(person_id, kind, label, date_text, year, source_id, citation, note, to_check, world_id) VALUES(?,?,?,?,?,?,?,?,?,?)')
            ->execute([$pid, $c['kind'], $c['label'], $c['date_text'], $c['year'], $c['source_id'], $c['citation'], $c['note'], $c['to_check'], $c['world_id']]);
        $id = (int) $pdo->lastInsertId();
    }
    return ['id' => $id];
}

/** supprimer : la ligne entière revient pour « ↶ Annuler » (rien n'est recopié dans le journal des modifications) */
function sante_delete(PDO $pdo, array $d): array
{
    sante_ensure($pdo);
    $id = safe_int($d['id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM health_records WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException('Cette information a déjà été supprimée.'); }
    sante_person_check($pdo, (int) $r['person_id']);
    $pdo->prepare('DELETE FROM health_records WHERE id=?')->execute([$id]);
    return ['ok' => true, 'row' => sante_out($r)];
}

function sante_restore(PDO $pdo, array $d): array
{
    sante_ensure($pdo);
    $r = is_array($d['row'] ?? null) ? $d['row'] : [];
    $id = safe_int($r['id'] ?? 0); $pid = safe_int($r['person_id'] ?? 0);
    if ($id <= 0) { throw new LcndaBadInput('Rien à remettre.'); }
    $e = $pdo->prepare('SELECT 1 FROM health_records WHERE id=?'); $e->execute([$id]);
    if ($e->fetchColumn()) { return ['id' => $id, 'already' => true]; }
    sante_person_check($pdo, $pid);
    $c = sante_clean($r);
    $pdo->prepare('INSERT INTO health_records(id, person_id, kind, label, date_text, year, source_id, citation, note, to_check, world_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([$id, $pid, $c['kind'], $c['label'], $c['date_text'], $c['year'], $c['source_id'], $c['citation'], $c['note'], $c['to_check'], $c['world_id']]);
    return ['id' => $id];
}

/** montrer ou cacher (Réglages) : écrit tout de suite dans app_settings (le navigateur garde la même clé) */
function sante_show(PDO $pdo, array $d): array
{
    $show = !empty($d['show']) && (string) $d['show'] !== '0';
    $cur = [];
    try { $s = $pdo->prepare('SELECT value FROM app_settings WHERE key=?'); $s->execute([SANTE_SETTING]); $cur = json_decode((string) $s->fetchColumn(), true) ?: []; } catch (Throwable) {}
    $cur = (is_array($cur) ? $cur : []); $cur['show'] = $show;
    $v = json_encode($cur, JSON_UNESCAPED_UNICODE);
    $pdo->prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP')->execute([SANTE_SETTING, $v]);
    return ['ok' => true, 'show' => $show, 'value' => $v];
}

/* ═════════ Ailleurs dans l'app ═════════ */

/** 🔍 menu de choix, sorte « health » : les maladies notées (rien quand la santé est cachée) */
function picker_health(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!sante_visible($pdo)) { return ['total' => 0, 'items' => []]; }
    $ids = function_exists('picker_ids') ? picker_ids() : [];
    $f = sante_fold($q);
    $all = array_values(array_filter(sante_labels($pdo), static fn($x) => ($ids ? in_array($x['id'], $ids, true) : true) && ($f === '' || str_contains(sante_fold($x['label']), $f))));
    $items = array_map(static fn($x) => ['kind' => 'health', 'id' => $x['id'], 'title' => $x['label'], 'meta' => 'Notée chez ' . $x['people'] . ' personne' . ($x['people'] > 1 ? 's' : ''),
        'badge' => (string) $x['people'], 'icon' => '🩺', 'short' => $x['people'] . ' pers.'], array_slice($all, $offset, $limit));
    return ['total' => count($all), 'items' => $items];
}

/** ⤓ GEDCOM : seulement avec la case « Inclure la santé de la famille » cochée au moment de l'export → [person_id => lignes] */
function sante_gedcom_rows(PDO $pdo): array
{
    if (!sante_visible($pdo)) { return []; }
    $out = [];
    foreach (sante_records($pdo) as $r) { $out[$r['person_id']][] = $r; }
    return $out;
}

/* ═════════ Points d'entrée (api.php) ═════════ */

function sante_api_get(PDO $pdo, array $g): array
{
    $op = scalar_text($g['op'] ?? '', 'op');
    if ($op === 'state') {
        $n = 0; if (sante_visible($pdo)) { try { sante_ensure($pdo); $n = (int) $pdo->query('SELECT count(*) FROM health_records')->fetchColumn(); } catch (Throwable) {} }
        return ['visible' => sante_visible($pdo), 'kiosk' => sante_kiosk(), 'count' => $n];
    }
    if (!sante_visible($pdo)) { return ['visible' => false, 'kiosk' => sante_kiosk()]; }
    return match ($op) {
        'person' => sante_person($pdo, safe_int($g['person_id'] ?? 0)),
        'list' => sante_list($pdo),
        'branches' => sante_branches($pdo, $g),
        'labels' => ['visible' => true, 'labels' => sante_labels($pdo)],
        default => throw new LcndaBadInput('Demande inconnue.'),
    };
}

function sante_api_post(PDO $pdo, array $d): array
{
    if (sante_kiosk()) { throw new RuntimeException('Mode consultation : rien ne peut être modifié.'); }
    $op = scalar_text($d['op'] ?? '', 'op');
    if ($op === 'show') { return sante_show($pdo, $d); }
    if (!sante_visible($pdo)) { throw new RuntimeException('« 🩺 Santé de la famille » est cachée : montre-la d’abord dans les Réglages.'); }
    return match ($op) {
        'save' => sante_save($pdo, $d),
        'delete' => sante_delete($pdo, $d),
        'restore' => sante_restore($pdo, $d),
        default => throw new LcndaBadInput('Demande inconnue.'),
    };
}
