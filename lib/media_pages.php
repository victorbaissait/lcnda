<?php
declare(strict_types=1);

/**
 * 📑 Un document en plusieurs pages (Atelier de transcription, vague 3, sous-étape 3a ; maquette
 * docs/design/atelier-transcription-idees.html, F2 ; décision 5 de docs/design/atelier-transcription-decisions.md).
 * Des médias de la base reliés en un ensemble : recto / verso d'un acte notarié, mariage sur deux pages, contrat de 4 pages,
 * une annexe… autant de pages qu'on veut, dans l'ordre choisi (glisser), chacune avec son nom (Recto, Verso, Page N, Annexe, ou
 * un nom libre). Une page n'appartient qu'à UN ensemble (media_id est la clé de la table). Interface : assets/js/heritage-pages.js
 * (page du document, visionneuse) ; l'Atelier ouvre toutes les pages (assets/js/heritage-transcribe.js).
 * Les cartes postales gardent leurs propres colonnes (media.postcard_group / postcard_side, lib/postcards.php) : un ensemble de
 * pages n'y touche pas (les cartes postales ont leur liste à elles, qui lit « recto » et « verso »).
 * Table créée par la migration 104 (et à la première utilisation : rejouable, rien n'est jamais effacé).
 */

const MEDIA_PAGE_LABELS = ['page', 'recto', 'verso', 'annexe']; // les noms tout faits (traduits à l'écran) ; sinon un nom libre
const MEDIA_PAGES_MAX = 200;

function media_pages_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    media_pages_install($pdo);
    $done = true;
}

/** migration 104 : la table et son index seulement (rejouable : CREATE … IF NOT EXISTS) */
function media_pages_install(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS media_pages (media_id INTEGER PRIMARY KEY, set_id INTEGER NOT NULL, position INTEGER NOT NULL DEFAULT 0,
        label TEXT NOT NULL DEFAULT 'page', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_media_pages_set ON media_pages(set_id, position)');
}

/** le numéro de l'ensemble d'un média (0 : il n'est relié à aucune page) */
function media_page_set_of(PDO $pdo, int $mediaId): int
{
    media_pages_ensure($pdo);
    $s = $pdo->prepare('SELECT set_id FROM media_pages WHERE media_id=?'); $s->execute([$mediaId]);
    return (int) $s->fetchColumn();
}

/** les numéros des pages d'un ensemble, dans l'ordre (seulement les médias qui existent encore) */
function media_page_ids(PDO $pdo, int $setId): array
{
    if ($setId <= 0) { return []; }
    media_pages_ensure($pdo);
    $s = $pdo->prepare('SELECT p.media_id FROM media_pages p JOIN media m ON m.id=p.media_id WHERE p.set_id=? ORDER BY p.position, p.media_id'); $s->execute([$setId]);
    return array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
}

/**
 * L'ensemble d'un média : ses pages dans l'ordre, avec ce qu'il faut pour les montrer (vignette, titre, texte) et les actes
 * de l'Atelier faits sur chacune. Rien si le média n'a pas d'autre page. Mode consultation : les lettres scellées n'y sont pas.
 */
function media_pages_of(PDO $pdo, int $mediaId): array
{
    $set = media_page_set_of($pdo, $mediaId);
    if (!$set) { return ['set_id' => 0, 'pages' => []]; }
    act_transcriptions_ensure($pdo);
    $sealed = function_exists('sealed_media_sql') ? sealed_media_sql($pdo, 'm.id') : '';
    $s = $pdo->prepare("SELECT p.media_id, p.position, p.label, m.title, m.filename, m.thumbnail, m.media_type, m.date_text, m.document_reference, m.document_title,
            COALESCE(m.transcription,'') AS transcription, COALESCE(m.description,'') AS description,
            (SELECT group_concat(t.id) FROM act_transcriptions t WHERE t.media_id=p.media_id) AS act_ids
        FROM media_pages p JOIN media m ON m.id=p.media_id WHERE p.set_id=?{$sealed} ORDER BY p.position, p.media_id");
    $s->execute([$set]);
    $pages = array_map(static fn($r) => ['media_id' => (int) $r['media_id'], 'id' => (int) $r['media_id'], 'label' => (string) $r['label'], 'title' => (string) $r['title'],
        'filename' => (string) $r['filename'], 'thumbnail' => (string) ($r['thumbnail'] ?: $r['filename']), 'media_type' => (string) $r['media_type'], 'date_text' => (string) $r['date_text'],
        'document_reference' => (string) $r['document_reference'], 'document_title' => (string) $r['document_title'], 'transcription' => (string) $r['transcription'], 'description' => (string) $r['description'],
        'acts' => array_values(array_filter(array_map('intval', explode(',', (string) $r['act_ids']))))], $s->fetchAll(PDO::FETCH_ASSOC));
    return count($pages) < 2 ? ['set_id' => 0, 'pages' => []] : ['set_id' => $set, 'pages' => $pages];
}

/** un nom de page : un des noms tout faits, sinon un nom libre court (une donnée, jamais traduite) */
function media_page_label($v): string
{
    $v = trim(safe_text(is_scalar($v) ? (string) $v : ''));
    if ($v === '' || in_array(mb_strtolower($v), MEDIA_PAGE_LABELS, true)) { return $v === '' ? 'page' : mb_strtolower($v); }
    return mb_substr($v, 0, 60);
}

/**
 * Écrire l'ensemble du média `media_id` tel qu'il doit être : `pages` = [{media_id, label}] dans l'ordre. Sert à tout :
 * « ＋ Relier une autre page… » (la liste avec une page de plus), le nom d'une page, l'ordre (glisser), « Retirer de
 * l'ensemble » (la liste sans elle) et « ↶ Annuler » (la liste d'avant). Moins de deux pages : l'ensemble n'existe plus.
 * Une page déjà dans un AUTRE ensemble : refus avec une phrase (rien n'est changé).
 */
function media_pages_save(PDO $pdo, array $data): array
{
    media_pages_ensure($pdo);
    $anchor = safe_int($data['media_id'] ?? 0);
    $list = is_array($data['pages'] ?? null) ? array_slice($data['pages'], 0, MEDIA_PAGES_MAX + 1) : [];
    if (count($list) > MEDIA_PAGES_MAX) { throw new LcndaBadInput('Trop de pages dans un même document (200 au plus).'); }
    $set = $anchor ? media_page_set_of($pdo, $anchor) : 0;
    // ↶ Annuler après « Retirer » de l'avant-dernière page : l'ensemble n'existe plus, on le retrouve par une de ses pages
    if (!$set) { foreach ($list as $p) { $id = safe_int(is_array($p) ? ($p['media_id'] ?? 0) : $p); if ($id && ($set = media_page_set_of($pdo, $id))) { break; } } }
    $pages = []; $seen = [];
    $exists = $pdo->prepare('SELECT 1 FROM media WHERE id=?');
    foreach ($list as $p) {
        $id = safe_int(is_array($p) ? ($p['media_id'] ?? 0) : $p);
        if ($id <= 0 || isset($seen[$id])) { continue; }
        $exists->execute([$id]);
        if (!$exists->fetchColumn()) { throw new RuntimeException('Une des pages n’est plus dans les médias : rien n’a été changé.'); }
        $other = media_page_set_of($pdo, $id);
        if ($other && $other !== $set) {
            throw new LcndaBadInput('Une de ces pages est déjà dans un autre document : retire-la d’abord de celui-ci (une page n’appartient qu’à un seul ensemble).');
        }
        $seen[$id] = true;
        $pages[] = ['media_id' => $id, 'label' => media_page_label(is_array($p) ? ($p['label'] ?? 'page') : 'page')];
    }
    $own = !$pdo->inTransaction();
    if ($own) { $pdo->beginTransaction(); }
    try {
        if ($set) { $pdo->prepare('DELETE FROM media_pages WHERE set_id=?')->execute([$set]); }
        if (count($pages) >= 2) {
            if (!$set) { $set = (int) $pdo->query('SELECT COALESCE(MAX(set_id),0)+1 FROM media_pages')->fetchColumn(); }
            $ins = $pdo->prepare('INSERT INTO media_pages(media_id, set_id, position, label) VALUES(?,?,?,?)');
            foreach ($pages as $i => $p) { $ins->execute([$p['media_id'], $set, $i + 1, $p['label']]); }
        }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own) { $pdo->rollBack(); } throw $e; }
    log_change($pdo, 'media', $anchor ?: null, 'update', count($pages) >= 2 ? 'Pages d’un document reliées (' . count($pages) . ')' : 'Pages d’un document déliées');
    $first = $pages[0]['media_id'] ?? $anchor;
    $keep = in_array($anchor, array_column($pages, 'media_id'), true) ? $anchor : $first;
    return media_pages_of($pdo, (int) $keep) + ['media_id' => (int) $keep];
}
