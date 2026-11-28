<?php
declare(strict_types=1);

/**
 * 📚 Gestion des sources comme objet (Listes → Archives et sources → « 📚 Sources ») :
 *  - toutes les sources (titre, auteur, dépôt, publication, lien) avec le nombre de citations et de fiches ;
 *  - « Où est-elle citée ? » : chaque citation (fiche, événement, famille…) avec la page et la note ;
 *  - doublons probables (même titre une fois les accents et la ponctuation retirés, ou même lien) et fusion (+ ↶ Annuler) ;
 *  - dépôt (service d'archives, lib/archive_services.php : série, cote) ;
 *  - modèles de citation à la manière d'Evidence Explained (E. S. Mills) : un modèle par sorte de source (acte d'état civil,
 *    registre paroissial, recensement, acte notarié, registre matricule, livre, page internet), ses cases, et les trois
 *    formes d'EE : entrée de la liste des sources, première note, note suivante. Les styles tout faits (lib/citation_styles.php)
 *    restent proposés à côté.
 * Table créée à la demande (pas de migration) : source_models(source_id, model, fields_json, updated_at).
 * Appelé par lib/listes_plus.php (GET listes_plus, POST listes_plus_write). Écran : assets/js/app-sources-liste.js.
 */

/** les modèles de citation : [libellé, cases [clé => libellé]] */
const SRCM_MODELS = [
    'ec' => ['Acte d’état civil', ['commune' => 'Commune', 'departement' => 'Département', 'registre' => 'Registre (ex. Naissances)', 'annee' => 'Année(s)', 'acte' => 'N° de l’acte', 'qui' => 'Qui (personne de l’acte)', 'date_acte' => 'Date de l’acte', 'depot' => 'Dépôt (archives)', 'cote' => 'Cote', 'vue' => 'Vue', 'url' => 'Lien de la vue']],
    'paroisse' => ['Registre paroissial', ['commune' => 'Paroisse', 'departement' => 'Département', 'registre' => 'Registre (ex. Baptêmes, mariages, sépultures)', 'annee' => 'Années', 'qui' => 'Qui (personne de l’acte)', 'date_acte' => 'Date de l’acte', 'depot' => 'Dépôt (archives)', 'cote' => 'Cote', 'vue' => 'Vue', 'url' => 'Lien de la vue']],
    'recensement' => ['Recensement', ['commune' => 'Commune', 'departement' => 'Département', 'annee' => 'Année', 'quartier' => 'Quartier, rue', 'page' => 'Page ou folio', 'qui' => 'Foyer de', 'depot' => 'Dépôt (archives)', 'cote' => 'Cote', 'vue' => 'Vue', 'url' => 'Lien de la vue']],
    'notaire' => ['Acte notarié', ['notaire' => 'Notaire', 'commune' => 'Résidence du notaire', 'acte' => 'Nature de l’acte', 'qui' => 'Parties', 'date_acte' => 'Date de l’acte', 'depot' => 'Dépôt (archives)', 'cote' => 'Cote', 'vue' => 'Vue', 'url' => 'Lien']],
    'militaire' => ['Registre matricule', ['departement' => 'Département', 'bureau' => 'Bureau de recrutement', 'annee' => 'Classe', 'acte' => 'N° matricule', 'qui' => 'Soldat', 'depot' => 'Dépôt (archives)', 'cote' => 'Cote', 'vue' => 'Vue', 'url' => 'Lien']],
    'livre' => ['Livre, revue', ['auteur' => 'Auteur', 'titre' => 'Titre', 'lieu_ed' => 'Lieu d’édition', 'editeur' => 'Éditeur', 'annee' => 'Année', 'page' => 'Page(s)']],
    'site' => ['Page internet, base en ligne', ['auteur' => 'Auteur ou organisme', 'titre' => 'Titre de la page', 'site' => 'Nom du site', 'url' => 'Lien', 'consulte' => 'Consulté le', 'qui' => 'Pour qui']],
];

function srcm_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS source_models (
        source_id INTEGER PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
        model TEXT NOT NULL DEFAULT '',
        fields_json TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $done = true;
}

function srcm_has_col(PDO $pdo, string $table, string $col): bool
{
    static $cache = [];
    $k = $table . '.' . $col;
    if (!isset($cache[$k])) {
        $cols = [];
        foreach ($pdo->query('PRAGMA table_info(' . preg_replace('/[^a-z_]/', '', $table) . ')') as $r) { $cols[] = $r['name']; }
        $cache[$k] = in_array($col, $cols, true);
    }
    return $cache[$k];
}

function srcm_table_exists(PDO $pdo, string $t): bool
{
    $s = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"); $s->execute([$t]);
    return (bool) $s->fetchColumn();
}

/** « Archives de la Corrèze — État civil ! » → « archives de la correze etat civil » */
function srcm_fold(string $s): string
{
    $s = mb_strtolower(trim($s), 'UTF-8');
    if (class_exists('Normalizer')) { $s = (string) Normalizer::normalize($s, Normalizer::FORM_D); $s = preg_replace('/\p{Mn}+/u', '', $s) ?? $s; }
    else { $s = strtr($s, ['é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'à' => 'a', 'â' => 'a', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'œ' => 'oe']); }
    $s = preg_replace('/[^\p{L}\p{N}]+/u', ' ', $s) ?? $s;
    return trim(preg_replace('/\s+/', ' ', $s) ?? $s);
}

function srcm_url_key(string $u): string
{
    $u = trim(mb_strtolower($u));
    if ($u === '') { return ''; }
    $u = preg_replace('#^https?://(www\.)?#', '', $u) ?? $u;
    return rtrim($u, '/');
}

/** les doublons probables : [source_id => numéro de groupe] et les groupes */
function srcm_dupe_groups(array $rows): array
{
    $parent = [];
    $find = static function ($x) use (&$parent, &$find) { while ($parent[$x] !== $x) { $parent[$x] = $parent[$parent[$x]]; $x = $parent[$x]; } return $x; };
    $byKey = [];
    foreach ($rows as $r) {
        $id = (int) $r['id']; $parent[$id] = $id;
        $t = srcm_fold((string) $r['title']);
        if ($t !== '') { $byKey['t:' . $t][] = $id; }
        $u = srcm_url_key((string) ($r['url'] ?? ''));
        if ($u !== '') { $byKey['u:' . $u][] = $id; }
    }
    foreach ($byKey as $ids) { for ($i = 1, $n = count($ids); $i < $n; $i++) { $a = $find($ids[0]); $b = $find($ids[$i]); if ($a !== $b) { $parent[$b] = $a; } } }
    $groups = [];
    foreach (array_keys($parent) as $id) { $groups[$find($id)][] = $id; }
    $groups = array_values(array_filter($groups, static fn($g) => count($g) > 1));
    $of = [];
    foreach ($groups as $i => $g) { sort($groups[$i]); foreach ($g as $id) { $of[$id] = $i + 1; } }
    return [$of, $groups];
}

/** la personne d'une citation (pour ouvrir la fiche) et son libellé */
function srcm_link_target(PDO $pdo, string $type, int $id): array
{
    $name = static function (?array $p): string { return $p ? trim(trim((string) $p['first_name']) . ' ' . trim((string) $p['last_name'])) ?: '?' : '?'; };
    $person = static function (int $pid) use ($pdo): ?array { if (!$pid) { return null; } $s = $pdo->prepare('SELECT id, first_name, last_name FROM persons WHERE id=?'); $s->execute([$pid]); return $s->fetch(PDO::FETCH_ASSOC) ?: null; };
    $family = static function (int $fid) use ($pdo, $person, $name): array {
        $s = $pdo->prepare('SELECT partner1_id, partner2_id FROM families WHERE id=?'); $s->execute([$fid]); $f = $s->fetch(PDO::FETCH_ASSOC) ?: [];
        $a = $person((int) ($f['partner1_id'] ?? 0)); $b = $person((int) ($f['partner2_id'] ?? 0));
        return [trim(($a ? $name($a) : '') . ($a && $b ? ' et ' : '') . ($b ? $name($b) : '')) ?: 'Couple', (int) ($a['id'] ?? $b['id'] ?? 0)];
    };
    switch ($type) {
        case 'person': $p = $person($id); return ['kind' => 'Fiche', 'label' => $name($p), 'person_id' => (int) ($p['id'] ?? 0)];
        case 'event':
            $s = $pdo->prepare('SELECT e.person_id, e.family_id, e.date_text, t.label FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.id=?'); $s->execute([$id]); $e = $s->fetch(PDO::FETCH_ASSOC);
            if (!$e) { return ['kind' => 'Événement', 'label' => '#' . $id, 'person_id' => 0]; }
            [$who, $pid] = $e['person_id'] ? [$name($person((int) $e['person_id'])), (int) $e['person_id']] : $family((int) $e['family_id']);
            return ['kind' => 'Événement', 'label' => trim($e['label'] . ($e['date_text'] !== '' ? ' (' . $e['date_text'] . ')' : '') . ' — ' . $who), 'person_id' => $pid];
        case 'family': [$who, $pid] = $family($id); return ['kind' => 'Couple', 'label' => $who, 'person_id' => $pid];
        case 'media': $s = $pdo->prepare('SELECT title FROM media WHERE id=?'); $s->execute([$id]); return ['kind' => 'Média', 'label' => (string) ($s->fetchColumn() ?: '#' . $id), 'person_id' => 0, 'media_id' => $id];
        default: return ['kind' => $type, 'label' => '#' . $id, 'person_id' => 0];
    }
}

/** toutes les sources, avec leurs nombres */
function srcm_list(PDO $pdo): array
{
    srcm_ensure($pdo);
    $svc = srcm_has_col($pdo, 'sources', 'archive_service_id') && srcm_table_exists($pdo, 'archive_services');
    $cote = srcm_has_col($pdo, 'sources', 'archive_cote');
    $stype = srcm_has_col($pdo, 'sources', 'source_type');
    $sql = "SELECT s.id, s.title, s.author, s.agency, s.publication, s.url, " . ($stype ? 's.source_type' : "'' AS source_type") . ", "
        . ($svc ? 's.archive_service_id, a.name AS service_name' : "NULL AS archive_service_id, '' AS service_name") . ", " . ($cote ? 's.archive_cote' : "'' AS archive_cote") . ",
        sm.model,
        (SELECT count(*) FROM source_links sl WHERE sl.source_record_id=s.id) AS citations,
        (SELECT count(DISTINCT pid) FROM (SELECT CASE sl.entity_type WHEN 'person' THEN sl.entity_id
            WHEN 'event' THEN (SELECT COALESCE(e.person_id,(SELECT partner1_id FROM families f WHERE f.id=e.family_id)) FROM events e WHERE e.id=sl.entity_id)
            WHEN 'family' THEN (SELECT partner1_id FROM families f WHERE f.id=sl.entity_id) END AS pid FROM source_links sl WHERE sl.source_record_id=s.id) WHERE pid IS NOT NULL) AS people
        FROM sources s " . ($svc ? 'LEFT JOIN archive_services a ON a.id=s.archive_service_id ' : '') . "LEFT JOIN source_models sm ON sm.source_id=s.id
        ORDER BY s.title COLLATE NOCASE, s.id LIMIT 20000";
    $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
    [$of, $groups] = srcm_dupe_groups($rows);
    foreach ($rows as &$r) {
        foreach (['id', 'citations', 'people'] as $k) { $r[$k] = (int) $r[$k]; }
        $r['archive_service_id'] = $r['archive_service_id'] !== null ? (int) $r['archive_service_id'] : null;
        $r['dupe'] = $of[$r['id']] ?? 0;
        $r['depot'] = trim((string) ($r['service_name'] ?: $r['agency']));
        $r['model_label'] = isset(SRCM_MODELS[$r['model'] ?? '']) ? SRCM_MODELS[$r['model']][0] : '';
    }
    unset($r);
    $models = [];
    foreach (SRCM_MODELS as $k => [$label, $fields]) { $models[] = ['key' => $k, 'label' => $label, 'fields' => $fields]; }
    return ['rows' => $rows, 'dupe_groups' => $groups, 'models' => $models];
}

/** une source : ses cases, son modèle, ses citations (« où est-elle citée ? »), ses styles tout faits, ses doublons possibles */
function srcm_source(PDO $pdo, int $id): array
{
    srcm_ensure($pdo);
    $s = $pdo->prepare('SELECT * FROM sources WHERE id=?'); $s->execute([$id]); $src = $s->fetch(PDO::FETCH_ASSOC);
    if (!$src) { throw new RuntimeException('Source introuvable.'); }
    $m = $pdo->prepare('SELECT model, fields_json FROM source_models WHERE source_id=?'); $m->execute([$id]); $mr = $m->fetch(PDO::FETCH_ASSOC) ?: ['model' => '', 'fields_json' => '{}'];
    $fields = json_decode((string) $mr['fields_json'], true) ?: [];
    $svc = null;
    if (srcm_has_col($pdo, 'sources', 'archive_service_id') && !empty($src['archive_service_id']) && function_exists('archive_service_row')) { $svc = archive_service_row($pdo, (int) $src['archive_service_id']); }
    $l = $pdo->prepare('SELECT * FROM source_links WHERE source_record_id=? ORDER BY entity_type, entity_id, id LIMIT 2000'); $l->execute([$id]);
    $links = [];
    foreach ($l->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $links[] = ['id' => (int) $row['id'], 'entity_type' => (string) $row['entity_type'], 'entity_id' => (int) $row['entity_id'], 'page' => (string) ($row['page'] ?? ''), 'quality' => (string) ($row['quality'] ?? ''), 'note' => (string) ($row['note'] ?? '')]
            + srcm_link_target($pdo, (string) $row['entity_type'], (int) $row['entity_id']);
    }
    $media = [];
    if (srcm_table_exists($pdo, 'media_links')) {
        $mm = $pdo->prepare("SELECT m.id, m.title FROM media_links ml JOIN media m ON m.id=ml.media_id WHERE ml.entity_type='source' AND ml.entity_id=? ORDER BY ml.id LIMIT 200"); $mm->execute([$id]);
        $media = $mm->fetchAll(PDO::FETCH_ASSOC);
    }
    $styles = [];
    if (function_exists('source_citations_data')) {
        try { $c = source_citations_data($pdo, ['source_id' => $id, 'only' => 1]); $styles = ['items' => $c['items'][0]['styles'] ?? [], 'names' => $c['styles']]; } catch (Throwable $e) { $styles = []; }
    }
    $model = (string) $mr['model'];
    $auto = srcm_auto_fields($src, $svc);
    $list = srcm_list($pdo);
    $dupes = [];
    foreach ($list['dupe_groups'] as $g) { if (in_array($id, $g, true)) { foreach ($list['rows'] as $r) { if ($r['id'] !== $id && in_array($r['id'], $g, true)) { $dupes[] = $r; } } } }
    $models = $list['models'];
    return ['source' => $src, 'service' => $svc, 'model' => $model, 'fields' => $fields, 'auto' => $auto, 'ee' => $model !== '' ? srcm_ee($model, $fields + $auto) : null,
        'links' => $links, 'media' => $media, 'styles' => $styles, 'dupes' => $dupes, 'models' => $models,
        'services' => function_exists('archive_services_ready') && archive_services_ready($pdo) ? $pdo->query('SELECT id, name FROM archive_services ORDER BY name COLLATE NOCASE')->fetchAll(PDO::FETCH_ASSOC) : []];
}

/** ce que la source elle-même dit déjà (pour remplir un modèle sans tout retaper) */
function srcm_auto_fields(array $src, ?array $svc): array
{
    $u = trim((string) ($src['url'] ?? ''));
    return array_filter(['titre' => trim((string) $src['title']), 'auteur' => trim((string) $src['author']), 'depot' => trim((string) ($svc['name'] ?? $src['agency'] ?? '')),
        'cote' => trim((string) ($src['archive_cote'] ?? '')), 'url' => $u, 'site' => $u !== '' ? (string) parse_url($u, PHP_URL_HOST) : ''], static fn($v) => $v !== '');
}

/** Evidence Explained : entrée de la liste des sources, première note, note suivante */
function srcm_ee(string $model, array $f): array
{
    $g = static fn(string $k) => trim((string) ($f[$k] ?? ''));
    $j = static function (array $parts, string $sep = ', '): string { return implode($sep, array_values(array_filter(array_map('trim', $parts), static fn($x) => $x !== ''))); };
    $end = static fn(string $s) => $s === '' ? '' : (preg_match('/[.!?…]$/u', $s) ? $s : $s . '.');
    $place = $j([$g('commune') . ($g('departement') !== '' && $g('commune') !== '' ? ' (' . $g('departement') . ')' : ($g('commune') === '' ? $g('departement') : ''))]);
    $where = $j([$g('depot'), $g('cote') !== '' ? 'cote ' . $g('cote') : '', $g('vue') !== '' ? 'vue ' . $g('vue') : '']);
    $online = $g('url') !== '' ? 'image numérisée, ' . $j([$g('depot'), '<' . $g('url') . '>']) : '';
    switch ($model) {
        case 'ec':
        case 'paroisse':
            $kind = $model === 'ec' ? 'État civil' : 'Registres paroissiaux';
            $entry = $j([$g('departement'), $g('commune'), $j([$kind, $g('registre'), $g('annee')], ', '), $g('depot')], '. ');
            $first = $j([$place, $j([$g('registre'), $g('annee')], ' '), $g('acte') !== '' ? 'acte n° ' . $g('acte') : '', $g('qui') !== '' ? $g('qui') . ($g('date_acte') !== '' ? ' (' . $g('date_acte') . ')' : '') : $g('date_acte')]);
            $first = $j([$first, $online !== '' ? $online . ($g('cote') !== '' ? ', cote ' . $g('cote') : '') . ($g('vue') !== '' ? ', vue ' . $g('vue') : '') : $where], ' ; ');
            $next = $j([$g('commune'), $j([$g('registre'), $g('annee')], ' '), $g('acte') !== '' ? 'acte n° ' . $g('acte') : $g('qui')]);
            break;
        case 'recensement':
            $entry = $j([$g('departement'), $g('commune'), 'Recensement de ' . ($g('annee') ?: '?'), $g('depot')], '. ');
            $first = $j([$j([$place, 'recensement de ' . ($g('annee') ?: '?'), $g('quartier'), $g('page') !== '' ? 'p. ' . $g('page') : '', $g('qui') !== '' ? 'foyer de ' . $g('qui') : '']), $online !== '' ? $online . ($g('cote') !== '' ? ', cote ' . $g('cote') : '') . ($g('vue') !== '' ? ', vue ' . $g('vue') : '') : $where], ' ; ');
            $next = $j([$g('commune'), 'recensement ' . ($g('annee') ?: '?'), $g('page') !== '' ? 'p. ' . $g('page') : '', $g('qui')]);
            break;
        case 'notaire':
            $entry = $j([$g('departement'), $g('commune'), 'Minutes de ' . ($g('notaire') ?: 'notaire'), $g('depot')], '. ');
            $first = $j([$j([$g('acte'), $g('qui'), $g('date_acte')]), 'minutes de ' . ($g('notaire') ?: '?') . ($g('commune') !== '' ? ', notaire à ' . $g('commune') : ''), $where], ' ; ');
            $next = $j([$g('acte'), $g('qui'), $g('date_acte')]);
            break;
        case 'militaire':
            $entry = $j([$g('departement'), 'Registres matricules du recrutement militaire', $g('bureau') !== '' ? 'bureau de ' . $g('bureau') : '', $g('depot')], '. ');
            $first = $j([$j(['registre matricule', 'classe ' . ($g('annee') ?: '?'), $g('bureau') !== '' ? 'bureau de ' . $g('bureau') : '', $g('acte') !== '' ? 'n° ' . $g('acte') : '', $g('qui')]), $online !== '' ? $online . ($g('cote') !== '' ? ', cote ' . $g('cote') : '') . ($g('vue') !== '' ? ', vue ' . $g('vue') : '') : $where], ' ; ');
            $next = $j(['matricule ' . ($g('acte') ?: '?'), 'classe ' . ($g('annee') ?: '?'), $g('qui')]);
            break;
        case 'livre':
            $author = $g('auteur');
            if ($author !== '' && function_exists('cite_split_author')) { $a = cite_split_author($author); if ($a['last'] !== '') { $author = mb_strtoupper($a['last'], 'UTF-8') . ', ' . $a['first']; } }
            $entry = $j([$author, $g('titre'), $j([$g('lieu_ed') . ($g('editeur') !== '' ? ' : ' . $g('editeur') : ''), $g('annee')])], '. ');
            $first = $j([$g('auteur'), $g('titre'), '(' . $j([$g('lieu_ed') . ($g('editeur') !== '' ? ' : ' . $g('editeur') : ''), $g('annee')]) . ')', $g('page') !== '' ? 'p. ' . $g('page') : '']);
            $first = str_replace(', ()', '', $first);
            $next = $j([$a['last'] ?? $g('auteur'), mb_substr($g('titre'), 0, 40), $g('page') !== '' ? 'p. ' . $g('page') : '']);
            break;
        default: // site
            $entry = $j([$g('auteur'), '« ' . ($g('titre') ?: '?') . ' »', $g('site'), $g('url') !== '' ? '<' . $g('url') . '>' : ''], '. ');
            $first = $j([$g('auteur'), '« ' . ($g('titre') ?: '?') . ' »', $g('site') !== '' ? $g('site') . ($g('url') !== '' ? ' (<' . $g('url') . '>' . ($g('consulte') !== '' ? ' : consulté le ' . $g('consulte') : '') . ')' : '') : ($g('url') !== '' ? '<' . $g('url') . '>' : ''), $g('qui') !== '' ? 'entrée pour ' . $g('qui') : '']);
            $next = $j([$g('auteur'), '« ' . mb_substr($g('titre') ?: '?', 0, 40) . ' »']);
    }
    return ['entry' => $end($entry), 'first' => $end($first), 'next' => $end($next)];
}

/** ＋ une source sans citation (à relier ensuite depuis une fiche) */
function srcm_create(PDO $pdo, array $d): array
{
    $title = mb_substr(safe_text($d['title'] ?? ''), 0, 500);
    if ($title === '') { throw new RuntimeException('Donne un titre à la source.'); }
    $cols = ['title' => $title, 'author' => mb_substr(safe_text($d['author'] ?? ''), 0, 500), 'agency' => mb_substr(safe_text($d['agency'] ?? ''), 0, 500), 'publication' => mb_substr(safe_text($d['publication'] ?? ''), 0, 500), 'url' => srcm_clean_url($d['url'] ?? '')];
    if (srcm_has_col($pdo, 'sources', 'source_type')) { $cols['source_type'] = function_exists('source_type') ? source_type((string) ($d['source_type'] ?? 'archive')) : 'archive'; }
    $pdo->prepare('INSERT INTO sources(' . implode(',', array_keys($cols)) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute(array_values($cols));
    $id = (int) $pdo->lastInsertId();
    if (function_exists('archive_service_store_source')) { archive_service_store_source($pdo, $id, $d); }
    log_change($pdo, 'source', $id, 'create', 'Source ajoutée : ' . $title, null, $cols);
    return ['id' => $id];
}

function srcm_clean_url(mixed $u): string
{
    $u = trim(safe_text($u ?? ''));
    if ($u === '') { return ''; }
    if (!filter_var($u, FILTER_VALIDATE_URL) || !in_array(parse_url($u, PHP_URL_SCHEME), ['http', 'https'], true)) { throw new RuntimeException('Adresse internet invalide (elle doit commencer par https://).'); }
    return mb_substr($u, 0, 2000);
}

/** ✎ les cases de la source, son dépôt, son modèle de citation */
function srcm_save(PDO $pdo, array $d): array
{
    srcm_ensure($pdo);
    $id = safe_int($d['id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM sources WHERE id=?'); $s->execute([$id]); $before = $s->fetch(PDO::FETCH_ASSOC);
    if (!$before) { throw new RuntimeException('Source introuvable.'); }
    $title = mb_substr(safe_text($d['title'] ?? $before['title']), 0, 500);
    if ($title === '') { throw new RuntimeException('Donne un titre à la source.'); }
    $cols = ['title' => $title];
    foreach (['author', 'agency', 'publication'] as $k) { if (array_key_exists($k, $d)) { $cols[$k] = mb_substr(safe_text($d[$k]), 0, 500); } }
    if (array_key_exists('url', $d)) { $cols['url'] = srcm_clean_url($d['url']); }
    if (array_key_exists('source_type', $d) && srcm_has_col($pdo, 'sources', 'source_type') && function_exists('source_type')) { $cols['source_type'] = source_type((string) $d['source_type']); }
    $pdo->prepare('UPDATE sources SET ' . implode(',', array_map(static fn($k) => "$k=?", array_keys($cols))) . ' WHERE id=?')->execute([...array_values($cols), $id]);
    if (function_exists('archive_service_store_source')) { archive_service_store_source($pdo, $id, $d); }
    if (array_key_exists('model', $d)) {
        $model = isset(SRCM_MODELS[(string) $d['model']]) ? (string) $d['model'] : '';
        $fields = [];
        if ($model !== '' && is_array($d['fields'] ?? null)) { foreach (SRCM_MODELS[$model][1] as $k => $_) { $v = trim(safe_text((string) ($d['fields'][$k] ?? ''))); if ($v !== '') { $fields[$k] = mb_substr($v, 0, 1000); } } }
        if ($model === '') { $pdo->prepare('DELETE FROM source_models WHERE source_id=?')->execute([$id]); }
        else { $pdo->prepare('INSERT OR REPLACE INTO source_models(source_id, model, fields_json, updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)')->execute([$id, $model, json_encode($fields, JSON_UNESCAPED_UNICODE)]); }
    }
    $s->execute([$id]); $after = $s->fetch(PDO::FETCH_ASSOC);
    log_change($pdo, 'source', $id, 'update', 'Modification de la source « ' . $title . ' »', $before, $after);
    return ['id' => $id];
}

/** ⇄ fusionner : les autres sources passent dans « target » (citations, étiquettes, médias, notes, preuves) ; les cases vides de target sont complétées */
function srcm_merge(PDO $pdo, array $d): array
{
    srcm_ensure($pdo);
    $target = safe_int($d['target'] ?? 0);
    $others = array_values(array_unique(array_filter(array_map('intval', is_array($d['others'] ?? null) ? $d['others'] : []), static fn($x) => $x > 0 && $x !== $target)));
    $get = $pdo->prepare('SELECT * FROM sources WHERE id=?');
    $get->execute([$target]); $tBefore = $get->fetch(PDO::FETCH_ASSOC);
    if (!$tBefore) { throw new RuntimeException('Source à garder introuvable.'); }
    if (!$others) { throw new RuntimeException('Choisis au moins une autre source à fusionner.'); }
    $snap = ['target' => $tBefore, 'losers' => []];
    $fill = [];
    $hasMedia = srcm_table_exists($pdo, 'media_links');
    $hasEvidence = srcm_table_exists($pdo, 'evidence_records') && srcm_has_col($pdo, 'evidence_records', 'source_id');
    $ids = static function (string $sql, array $p) use ($pdo): array { $s = $pdo->prepare($sql); $s->execute($p); return array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)); };
    foreach ($others as $oid) {
        $get->execute([$oid]); $o = $get->fetch(PDO::FETCH_ASSOC);
        if (!$o) { continue; }
        $model = $pdo->prepare('SELECT * FROM source_models WHERE source_id=?'); $model->execute([$oid]);
        $lose = ['row' => $o, 'links' => $ids('SELECT id FROM source_links WHERE source_record_id=?', [$oid]), 'labels_moved' => [], 'labels_dropped' => [], 'media' => [], 'notes' => [], 'evidence' => [], 'model' => $model->fetch(PDO::FETCH_ASSOC) ?: null];
        $pdo->prepare('UPDATE source_links SET source_record_id=? WHERE source_record_id=?')->execute([$target, $oid]);
        $ll = $pdo->prepare("SELECT id, label_id FROM label_links WHERE entity_type='source' AND entity_id=?"); $ll->execute([$oid]);
        foreach ($ll->fetchAll(PDO::FETCH_ASSOC) as $l) {
            $has = $pdo->prepare("SELECT 1 FROM label_links WHERE entity_type='source' AND entity_id=? AND label_id=?"); $has->execute([$target, $l['label_id']]);
            if ($has->fetchColumn()) { $pdo->prepare('DELETE FROM label_links WHERE id=?')->execute([$l['id']]); $lose['labels_dropped'][] = (int) $l['label_id']; }
            else { $pdo->prepare('UPDATE label_links SET entity_id=? WHERE id=?')->execute([$target, $l['id']]); $lose['labels_moved'][] = (int) $l['id']; }
        }
        if ($hasMedia) { $lose['media'] = $ids("SELECT id FROM media_links WHERE entity_type='source' AND entity_id=?", [$oid]); $pdo->prepare("UPDATE media_links SET entity_id=? WHERE entity_type='source' AND entity_id=?")->execute([$target, $oid]); }
        $lose['notes'] = $ids("SELECT id FROM notes WHERE entity_type='source' AND entity_id=?", [$oid]);
        $pdo->prepare("UPDATE notes SET entity_id=? WHERE entity_type='source' AND entity_id=?")->execute([$target, $oid]);
        if ($hasEvidence) { $lose['evidence'] = $ids('SELECT id FROM evidence_records WHERE source_id=?', [$oid]); $pdo->prepare('UPDATE evidence_records SET source_id=? WHERE source_id=?')->execute([$target, $oid]); }
        foreach ($o as $k => $v) {
            if (in_array($k, ['id', 'source_id', 'title'], true) || $v === null || $v === '' || isset($fill[$k])) { continue; }
            if (($tBefore[$k] ?? null) === null || ($tBefore[$k] ?? '') === '') { $fill[$k] = $v; }
        }
        $tm = $pdo->prepare('SELECT 1 FROM source_models WHERE source_id=?'); $tm->execute([$target]);
        if (!$tm->fetchColumn() && $lose['model']) { $pdo->prepare('INSERT INTO source_models(source_id, model, fields_json) VALUES(?,?,?)')->execute([$target, $lose['model']['model'], $lose['model']['fields_json']]); $lose['model_moved'] = true; }
        $pdo->prepare('DELETE FROM source_models WHERE source_id=?')->execute([$oid]);
        $pdo->prepare('DELETE FROM sources WHERE id=?')->execute([$oid]);
        $snap['losers'][] = $lose;
    }
    if ($fill) { $pdo->prepare('UPDATE sources SET ' . implode(',', array_map(static fn($k) => preg_replace('/[^a-z_]/', '', $k) . '=?', array_keys($fill))) . ' WHERE id=?')->execute([...array_values($fill), $target]); }
    $snap['filled'] = array_keys($fill);
    log_change($pdo, 'source', $target, 'merge', 'Fusion de ' . count($snap['losers']) . ' source(s) dans « ' . $tBefore['title'] . ' »', $snap, null);
    $changeId = (int) $pdo->query("SELECT max(id) FROM change_log WHERE entity_type='source' AND action='merge'")->fetchColumn();
    return ['target' => $target, 'merged' => count($snap['losers']), 'change_id' => $changeId];
}

/** ↶ Annuler une fusion : chaque source revient avec ses citations, étiquettes, médias, notes */
function srcm_unmerge(PDO $pdo, array $d): array
{
    srcm_ensure($pdo);
    $cid = safe_int($d['change_id'] ?? 0);
    $s = $pdo->prepare("SELECT * FROM change_log WHERE id=? AND entity_type='source' AND action='merge'"); $s->execute([$cid]); $ch = $s->fetch(PDO::FETCH_ASSOC);
    if (!$ch) { throw new RuntimeException('Fusion introuvable.'); }
    $done = $pdo->prepare("SELECT 1 FROM change_log WHERE entity_type='source' AND action='unmerge' AND after_json LIKE ?"); $done->execute(['%"change_id":' . $cid . '}%']);
    if ($done->fetchColumn()) { return ['already' => true]; }
    $snap = json_decode((string) $ch['before_json'], true) ?: [];
    $target = (int) ($snap['target']['id'] ?? 0);
    foreach (array_reverse($snap['losers'] ?? []) as $l) {
        $oid = (int) ($l['row']['id'] ?? 0);
        if (!$oid) { continue; }
        insert_snapshot_row($pdo, 'sources', $l['row']);
        $in = static fn(array $ids) => implode(',', array_map('intval', $ids ?: [0]));
        $pdo->exec('UPDATE source_links SET source_record_id=' . $oid . ' WHERE id IN (' . $in($l['links'] ?? []) . ')');
        $pdo->exec('UPDATE label_links SET entity_id=' . $oid . " WHERE entity_type='source' AND id IN (" . $in($l['labels_moved'] ?? []) . ')');
        foreach ($l['labels_dropped'] ?? [] as $lab) { $pdo->prepare("INSERT OR IGNORE INTO label_links(label_id, entity_type, entity_id) VALUES(?, 'source', ?)")->execute([(int) $lab, $oid]); }
        if (!empty($l['media'])) { $pdo->exec('UPDATE media_links SET entity_id=' . $oid . " WHERE entity_type='source' AND id IN (" . $in($l['media']) . ')'); }
        $pdo->exec('UPDATE notes SET entity_id=' . $oid . " WHERE entity_type='source' AND id IN (" . $in($l['notes'] ?? []) . ')');
        if (!empty($l['evidence'])) { $pdo->exec('UPDATE evidence_records SET source_id=' . $oid . ' WHERE id IN (' . $in($l['evidence']) . ')'); }
        if (!empty($l['model'])) { $pdo->prepare('INSERT OR REPLACE INTO source_models(source_id, model, fields_json) VALUES(?,?,?)')->execute([$oid, $l['model']['model'], $l['model']['fields_json']]); if (!empty($l['model_moved'])) { $pdo->prepare('DELETE FROM source_models WHERE source_id=?')->execute([$target]); } }
    }
    $filled = array_values(array_filter($snap['filled'] ?? [], static fn($k) => is_string($k) && preg_match('/^[a-z_]+$/', $k)));
    if ($target && $filled) { $pdo->prepare('UPDATE sources SET ' . implode(',', array_map(static fn($k) => "$k=?", $filled)) . ' WHERE id=?')->execute([...array_map(static fn($k) => $snap['target'][$k] ?? null, $filled), $target]); }
    log_change($pdo, 'source', $target, 'unmerge', 'Fusion de sources annulée', null, ['change_id' => $cid]);
    return ['target' => $target, 'restored' => count($snap['losers'] ?? [])];
}
