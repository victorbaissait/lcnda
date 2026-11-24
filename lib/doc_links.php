<?php
declare(strict_types=1);

/**
 * 🔗 Documents liés (maquette docs/design/documents-lies-recueils.html, partie 1).
 * Deux documents DIFFÉRENTS (pas les pages d'un même document : lib/media_pages.php ; pas un recueil : lib/recueils.php),
 * reliés pour une raison : même régiment, même famille, même affaire, même lieu, même notaire, ou une raison libre.
 * Le lien va dans les deux sens (a < b, une seule ligne par paire). « En commun » et « Ce que l'autre t'apprend » sont calculés
 * à l'écran depuis les transcriptions (assets/js/heritage-liens.js) : rien d'autre n'est gardé ici.
 * Table doc_links (à ne pas confondre avec media_links : un média relié à une fiche), créée par la migration 105 (et à la première utilisation : rejouable, rien n'est jamais effacé).
 */

const DOC_LINK_REASONS = ['regiment', 'famille', 'affaire', 'lieu', 'notaire', 'autre'];

function doc_links_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    doc_links_install($pdo);
    $done = true;
}

/** migration 105 : la table et ses index (rejouable) */
function doc_links_install(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS doc_links (id INTEGER PRIMARY KEY AUTOINCREMENT, a INTEGER NOT NULL, b INTEGER NOT NULL,
        reason TEXT NOT NULL DEFAULT 'autre', note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(a, b))");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_doc_links_b ON doc_links(b)');
}

/** le texte d'un document pour la comparaison : ses transcriptions de l'Atelier, sinon celle du média */
function doc_link_text(PDO $pdo, int $mediaId, string $fallback): string
{
    act_transcriptions_ensure($pdo);
    $s = $pdo->prepare('SELECT body FROM act_transcriptions WHERE media_id=? ORDER BY id'); $s->execute([$mediaId]);
    $t = trim(implode("\n\n", array_map('strval', $s->fetchAll(PDO::FETCH_COLUMN))));
    return mb_substr($t !== '' ? $t : $fallback, 0, 40000);
}

/** les documents liés à un média (dans les deux sens), avec ce qu'il faut pour les montrer et les comparer */
function doc_links_of(PDO $pdo, int $mediaId): array
{
    if ($mediaId <= 0) { return ['items' => [], 'text' => '']; }
    doc_links_ensure($pdo);
    $sealed = function_exists('sealed_media_sql') ? sealed_media_sql($pdo, 'm.id') : '';
    $s = $pdo->prepare("SELECT l.id, l.reason, l.note, CASE WHEN l.a=? THEN l.b ELSE l.a END AS other, m.title, m.filename, m.thumbnail, m.media_type, m.date_text,
            COALESCE(m.transcription,'') AS transcription, COALESCE(m.document_title,'') AS document_title
        FROM doc_links l JOIN media m ON m.id = (CASE WHEN l.a=? THEN l.b ELSE l.a END) WHERE (l.a=? OR l.b=?){$sealed} ORDER BY l.created_at, l.id");
    $s->execute([$mediaId, $mediaId, $mediaId, $mediaId]);
    $items = array_map(static fn($r) => ['id' => (int) $r['id'], 'media_id' => (int) $r['other'], 'reason' => (string) $r['reason'], 'note' => (string) $r['note'],
        'title' => (string) ($r['title'] ?: $r['document_title'] ?: $r['filename']), 'filename' => (string) $r['filename'], 'thumbnail' => (string) ($r['thumbnail'] ?: $r['filename']),
        'media_type' => (string) $r['media_type'], 'date_text' => (string) $r['date_text'], 'text' => doc_link_text($pdo, (int) $r['other'], (string) $r['transcription'])], $s->fetchAll(PDO::FETCH_ASSOC));
    $me = $pdo->prepare('SELECT COALESCE(transcription,\'\') FROM media WHERE id=?'); $me->execute([$mediaId]);
    return ['items' => $items, 'text' => doc_link_text($pdo, $mediaId, (string) $me->fetchColumn())];
}

/** lier deux documents (ou changer la raison) ; {media_id, other_id, reason, note} → la liste à jour du premier */
function doc_link_save(PDO $pdo, array $data): array
{
    doc_links_ensure($pdo);
    $x = safe_int($data['media_id'] ?? 0); $y = safe_int($data['other_id'] ?? 0);
    if ($x <= 0 || $y <= 0) { throw new LcndaBadInput('Choisis les deux documents à lier.'); }
    if ($x === $y) { throw new LcndaBadInput('Un document ne se lie pas à lui-même.'); }
    $c = $pdo->prepare('SELECT count(*) FROM media WHERE id IN (?, ?)'); $c->execute([$x, $y]);
    if ((int) $c->fetchColumn() !== 2) { throw new LcndaBadInput('Document introuvable.'); }
    $reason = in_array($data['reason'] ?? '', DOC_LINK_REASONS, true) ? (string) $data['reason'] : 'autre';
    $note = mb_substr(safe_text(is_scalar($data['note'] ?? '') ? (string) ($data['note'] ?? '') : ''), 0, 200);
    [$a, $b] = $x < $y ? [$x, $y] : [$y, $x];
    $pdo->prepare('INSERT INTO doc_links(a, b, reason, note) VALUES(?,?,?,?) ON CONFLICT(a, b) DO UPDATE SET reason=excluded.reason, note=excluded.note')->execute([$a, $b, $reason, $note]);
    return doc_links_of($pdo, $x);
}

/** retirer un lien ; renvoie ce qu'il faut pour le remettre (↶ Annuler) */
function doc_link_delete(PDO $pdo, array $data): array
{
    doc_links_ensure($pdo);
    $s = $pdo->prepare('SELECT a, b, reason, note FROM doc_links WHERE id=?'); $s->execute([safe_int($data['id'] ?? 0)]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new LcndaBadInput('Ce lien n’existe plus.'); }
    $pdo->prepare('DELETE FROM doc_links WHERE id=?')->execute([safe_int($data['id'] ?? 0)]);
    return ['removed' => ['media_id' => (int) $r['a'], 'other_id' => (int) $r['b'], 'reason' => (string) $r['reason'], 'note' => (string) $r['note']]];
}

/** un média supprimé : ses liens partent avec lui (appelé là où un média est supprimé) */
function doc_links_forget(PDO $pdo, int $mediaId): void
{
    doc_links_ensure($pdo);
    $pdo->prepare('DELETE FROM doc_links WHERE a=? OR b=?')->execute([$mediaId, $mediaId]);
}
