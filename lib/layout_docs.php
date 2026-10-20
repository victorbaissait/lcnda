<?php
declare(strict_types=1);

/**
 * 📐 Atelier de mise en page (Export propre → Livre de famille → « Mise en page ») : des documents faits de pages,
 * gabarits, calques, blocs de texte, formes, cadres d'images… (façon InDesign). Le document entier est un JSON rangé
 * dans layout_documents (structure n°43) ; is_design = 1 pour un « design » (modèle de départ réutilisable).
 * Le contenu (texte riche, images) est nettoyé dans le navigateur avant d'être montré ; ici on vérifie la forme,
 * la taille et les adresses d'images (médias de la base ou images intégrées seulement).
 */

const LAYOUT_DOC_MAX = 24 * 1024 * 1024; // les photos importées de l'ordinateur sont intégrées au document

function layout_text($v, int $max): string
{
    return mb_substr(trim(str_replace(["\r", "\0"], '', (string) (is_scalar($v) ? $v : ''))), 0, $max);
}

/** Une adresse d'image acceptée : un média de la base (media/…) ou une image intégrée (data:image/…;base64) */
function layout_src_ok(string $src): bool
{
    if ($src === '') { return true; }
    if (preg_match('#^media/[A-Za-z0-9._%\-]{1,240}$#', $src)) { return true; }
    return (bool) preg_match('#^data:image/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$#', $src);
}

/** Toutes les adresses d'images du document sont vérifiées ; une mauvaise est vidée */
function layout_clean_srcs(&$node, int $depth = 0): void
{
    if ($depth > 40 || !is_array($node)) { return; }
    foreach ($node as $k => &$v) {
        if ($k === 'src' && is_string($v)) { if (!layout_src_ok($v)) { $v = ''; } continue; }
        if (is_array($v)) { layout_clean_srcs($v, $depth + 1); }
    }
}

/** Ce que montre la liste : la première page (pour sa couverture), avec ce qu'il faut pour la dessiner */
function layout_cover(array $d): array
{
    $first = $d['pages'][0] ?? null;
    $masters = [];
    if (is_array($first) && !empty($first['master'])) { foreach ($d['masters'] ?? [] as $m) { if (is_array($m) && ($m['id'] ?? '') === $first['master']) { $masters[] = $m; } } }
    return ['page' => $d['page'] ?? null, 'pages' => $first ? [$first] : [], 'masters' => $masters, 'swatches' => $d['swatches'] ?? [], 'paraStyles' => $d['paraStyles'] ?? [], 'charStyles' => $d['charStyles'] ?? [], 'layers' => $d['layers'] ?? []];
}

function layout_docs_list(PDO $pdo): array
{
    $out = [];
    foreach ($pdo->query('SELECT id, name, is_design, data_json, updated_at FROM layout_documents ORDER BY is_design, updated_at DESC, id DESC') as $r) {
        $d = json_decode((string) $r['data_json'], true) ?: [];
        $out[] = ['id' => (int) $r['id'], 'name' => $r['name'], 'is_design' => (int) $r['is_design'], 'pages' => count($d['pages'] ?? []), 'updated_at' => $r['updated_at'], 'cover' => layout_cover($d)];
    }
    return $out;
}

function layout_doc_get(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT id, name, is_design, data_json, updated_at FROM layout_documents WHERE id=?');
    $s->execute([$id]);
    $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Document introuvable.'); }
    return ['id' => (int) $r['id'], 'name' => $r['name'], 'is_design' => (int) $r['is_design'], 'updated_at' => $r['updated_at'], 'rev' => content_rev((string) $r['data_json']), 'doc' => json_decode((string) $r['data_json'], true) ?: new stdClass()];
}

function save_layout_doc(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $name = layout_text($data['name'] ?? '', 160);
    if ($name === '') { throw new RuntimeException('Donne un nom au document.'); }
    $doc = $data['doc'] ?? null;
    if (!is_array($doc) || !is_array($doc['pages'] ?? null) || !is_array($doc['page'] ?? null)) { throw new RuntimeException('Document illisible.'); }
    if (count($doc['pages']) > 2000) { throw new RuntimeException('Trop de pages (2 000 au plus).'); }
    layout_clean_srcs($doc);
    $json = json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) { throw new RuntimeException('Document illisible.'); }
    if (strlen($json) > LAYOUT_DOC_MAX) { throw new RuntimeException('Document trop lourd (24 Mo au plus) : utilise des photos de la base plutôt que des photos importées, ou des photos plus petites.'); }
    $design = !empty($data['is_design']) ? 1 : 0;
    // deux onglets sur le même document : refusé si le contenu a changé ailleurs depuis la dernière lecture (base_rev), sauf « Garder ma version »
    if ($id && (string) ($data['base_rev'] ?? '') !== '' && empty($data['force'])) {
        $cur = $pdo->prepare('SELECT data_json FROM layout_documents WHERE id=?'); $cur->execute([$id]); $now = $cur->fetchColumn();
        if ($now !== false && content_rev((string) $now) !== (string) $data['base_rev'] && (string) $now !== $json) {
            throw new LcndaConflict('Ce document a été modifié dans une autre fenêtre depuis que tu l’as ouvert.');
        }
    }
    if ($id) {
        $s = $pdo->prepare('UPDATE layout_documents SET name=?, is_design=?, data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
        $s->execute([$name, $design, $json, $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Document introuvable.'); }
    } else {
        $pdo->prepare('INSERT INTO layout_documents(name, is_design, data_json) VALUES(?,?,?)')->execute([$name, $design, $json]);
        $id = (int) $pdo->lastInsertId();
    }
    log_change($pdo, 'meta', 0, ($data['id'] ?? 0) ? 'update' : 'create', ($design ? 'Design' : 'Document') . ' de mise en page enregistré : ' . $name);
    return ['id' => $id, 'name' => $name, 'rev' => content_rev($json)];
}

function delete_layout_doc(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT name FROM layout_documents WHERE id=?'); $s->execute([$id]);
    $name = $s->fetchColumn();
    if ($name === false) { throw new RuntimeException('Document introuvable.'); }
    $pdo->prepare('DELETE FROM layout_documents WHERE id=?')->execute([$id]);
    log_change($pdo, 'meta', 0, 'delete', 'Document de mise en page supprimé : ' . $name);
    return ['ok' => true];
}

/** Les données du livre de famille (mêmes réglages qu'Export propre), pour remplir un document de mise en page */
function layout_family_data(PDO $pdo, array $q): array
{
    $o = family_book_options($q + ['parts' => 'bio,family,events,photos,notes']);
    $m = family_book_model($pdo, $o, $q);
    // publipostage : une liste de fiches choisies, ou les fiches d'une étiquette
    $keep = null;
    if (trim((string) ($q['ids'] ?? '')) !== '') { $keep = array_flip(array_slice(array_values(array_filter(array_map('intval', explode(',', (string) $q['ids'])))), 0, 2000)); }
    if (safe_int($q['label_id'] ?? 0) > 0) {
        $s = $pdo->prepare("SELECT entity_id FROM label_links WHERE label_id=? AND entity_type='person'"); $s->execute([safe_int($q['label_id'])]);
        $lab = array_flip(array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN))); $keep = $keep === null ? $lab : array_intersect_key($keep, $lab);
    }
    if ($keep !== null) { $m['persons'] = array_values(array_filter($m['persons'], static fn($p) => isset($keep[(int) $p['id']]))); }
    return $m;
}
