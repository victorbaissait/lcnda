<?php
declare(strict_types=1);

/**
 * 📰 Revues et magazines (Listes → Revues et magazines ; interface : assets/js/heritage-periodicals.js).
 *  - une revue (magazine, revue de généalogie, bulletin d'association, journal…) ;
 *  - ses numéros : numéro, date, thème, et surtout où on en est (je l'ai, à acheter, commandé, emprunté, numérique…),
 *    prix, où il est rangé ; une couverture et des captures d'écran (family_collection_media, « periodical_issue ») ;
 *  - les articles de chaque numéro : auteurs, pages, rubrique, résumé, lieux, période, noms cités, sources…
 *  - numéros et articles se rattachent à des personnes, des enquêtes et des étiquettes.
 * Les tables sont créées à la première utilisation (sans changer le numéro de structure : une application plus
 * ancienne ouvre toujours la base et les ignore).
 */

const PERIODICAL_KINDS = ['magazine' => 'Magazine grand public', 'genealogie' => 'Revue de généalogie', 'cercle' => 'Bulletin de cercle / d’association', 'histoire_locale' => 'Revue d’histoire locale',
    'histoire' => 'Revue d’histoire', 'journal' => 'Journal quotidien', 'hebdo' => 'Hebdomadaire / journal régional', 'savante' => 'Revue savante', 'archives' => 'Revue d’archives / de musée', 'autre' => 'Autre'];
const PERIODICAL_STATUSES = ['owned' => 'Je l’ai', 'wanted' => 'À acheter', 'ordered' => 'Commandé', 'subscribed' => 'Reçu par abonnement', 'digital' => 'Numérique (PDF, en ligne)',
    'borrowed' => 'Emprunté / consulté', 'lent' => 'Prêté', 'given' => 'Donné / vendu', '' => 'Pas précisé'];
const PERIODICAL_ARTICLE_KINDS = ['article' => 'Article', 'dossier' => 'Dossier', 'genealogie' => 'Généalogie publiée', 'chronique' => 'Chronique', 'methode' => 'Méthode, conseils', 'source' => 'Présentation d’une source / d’un fonds',
    'courrier' => 'Courrier des lecteurs', 'question' => 'Question / entraide', 'annonce' => 'Petite annonce', 'compte_rendu' => 'Compte rendu, lecture', 'photo' => 'Photo, illustration', 'carte' => 'Carte, plan', 'autre' => 'Autre'];
const PERIODICAL_DATA_KEYS = ['issn', 'frequency', 'website', 'association', 'country', 'language', 'start_year', 'end_year', 'subscribed', 'subscription_end', 'subscription_price', 'contact', 'where_buy', 'notes'];
const PERIODICAL_ISSUE_DATA_KEYS = ['special', 'pages_count', 'cover_price', 'price_paid', 'bought_date', 'bought_where', 'storage', 'priority', 'buy_url', 'digital_url', 'summary', 'notes', 'rating', 'read', 'condition'];
const PERIODICAL_ARTICLE_DATA_KEYS = ['summary', 'keywords', 'places', 'period', 'surnames', 'sources', 'url', 'rating', 'notes', 'read', 'quote'];

function periodicals_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS periodicals (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT '', publisher TEXT NOT NULL DEFAULT '',
        data_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS periodical_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, periodical_id INTEGER NOT NULL, number TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
        date_text TEXT NOT NULL DEFAULT '', sort_date TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_periodical_issues_p ON periodical_issues(periodical_id, sort_date)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS periodical_articles (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '', authors TEXT NOT NULL DEFAULT '',
        pages TEXT NOT NULL DEFAULT '', rubric TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL DEFAULT '{}', position INTEGER NOT NULL DEFAULT 0)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_periodical_articles_i ON periodical_articles(issue_id, position)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS periodical_links (item_type TEXT NOT NULL, item_id INTEGER NOT NULL, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL,
        PRIMARY KEY (item_type, item_id, entity_type, entity_id))");
    $done = true;
}

/** « mars 1925 », « 12/03/1925 », « 1925-03 », « 1925 » → 1925-03-12 / 1925-03-00 / 1925-00-00, pour trier */
function periodical_sort_date(string $text): string
{
    $t = mb_strtolower(trim($text));
    if (preg_match('/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/', $t, $m)) { return sprintf('%04d-%02d-%02d', $m[1], $m[2], $m[3] ?? 0); }
    if (preg_match('/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/', $t, $m)) { return sprintf('%04d-%02d-%02d', $m[3], $m[2], $m[1]); }
    if (preg_match('/^(\d{1,2})[\/.\-](\d{4})/', $t, $m)) { return sprintf('%04d-%02d-00', $m[2], $m[1]); }
    $months = ['janv' => 1, 'févr' => 2, 'fevr' => 2, 'mars' => 3, 'avr' => 4, 'mai' => 5, 'juin' => 6, 'juil' => 7, 'août' => 8, 'aout' => 8, 'sept' => 9, 'oct' => 10, 'nov' => 11, 'déc' => 12, 'dec' => 12,
        'hiver' => 1, 'printemps' => 4, 'été' => 7, 'ete' => 7, 'automne' => 10];
    $y = preg_match('/(1[5-9]\d{2}|20\d{2})/', $t, $ym) ? (int) $ym[1] : 0;
    if (!$y) { return ''; }
    $mo = 0; foreach ($months as $k => $v) { if (str_contains($t, $k)) { $mo = $v; break; } }
    $d = $mo && preg_match('/(?<!\d)(\d{1,2})(?:er)?\s+[a-zéû]/u', $t, $dm) ? (int) $dm[1] : 0;
    return sprintf('%04d-%02d-%02d', $y, $mo, $d);
}

function periodical_data(array $raw, array $keys): string
{
    $out = [];
    foreach ($keys as $k) { if (isset($raw[$k]) && is_scalar($raw[$k]) && trim((string) $raw[$k]) !== '') { $out[$k] = trim(mb_substr((string) $raw[$k], 0, 8000)); } }
    return json_encode($out, JSON_UNESCAPED_UNICODE) ?: '{}';
}

function periodical_set_links(PDO $pdo, string $type, int $id, array $data): void
{
    $pdo->prepare('DELETE FROM periodical_links WHERE item_type=? AND item_id=?')->execute([$type, $id]);
    $ins = $pdo->prepare('INSERT OR IGNORE INTO periodical_links(item_type, item_id, entity_type, entity_id) VALUES(?,?,?,?)');
    foreach (['person' => 'persons', 'investigation' => 'investigations'] as $entity => $key) {
        foreach (array_slice(array_unique(array_filter(array_map('intval', is_array($data[$key] ?? null) ? $data[$key] : []))), 0, 500) as $eid) { $ins->execute([$type, $id, $entity, $eid]); }
    }
    if (array_key_exists('label_ids', $data)) { set_label_links($pdo, ['entity_type' => 'periodical_' . $type, 'entity_id' => $id, 'label_ids' => is_array($data['label_ids']) ? $data['label_ids'] : []]); }
}

/** Tout d'un coup (revues, numéros, articles, liens, étiquettes, couvertures) : l'écran trie et filtre lui-même */
function periodicals_all(PDO $pdo): array
{
    periodicals_ensure($pdo);
    $dec = static function (array $r): array { $r['data'] = json_decode((string) $r['data_json'], true) ?: []; unset($r['data_json']); $r['id'] = (int) $r['id']; return $r; };
    $periodicals = array_map($dec, $pdo->query('SELECT * FROM periodicals ORDER BY title COLLATE NOCASE, id')->fetchAll());
    $issues = array_map(static function ($r) use ($dec) { $r = $dec($r); $r['periodical_id'] = (int) $r['periodical_id']; return $r; }, $pdo->query('SELECT * FROM periodical_issues ORDER BY sort_date, id')->fetchAll());
    $articles = array_map(static function ($r) use ($dec) { $r = $dec($r); $r['issue_id'] = (int) $r['issue_id']; return $r; }, $pdo->query('SELECT * FROM periodical_articles ORDER BY issue_id, position, id')->fetchAll());
    $links = [];
    foreach ($pdo->query("SELECT pl.*, CASE pl.entity_type WHEN 'person' THEN trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) ELSE i.title END AS name
        FROM periodical_links pl LEFT JOIN persons p ON pl.entity_type='person' AND p.id=pl.entity_id LEFT JOIN investigations i ON pl.entity_type='investigation' AND i.id=pl.entity_id") as $l) {
        if ($l['name'] === null) { continue; } // fiche ou enquête supprimée depuis
        $links[$l['item_type'] . ':' . $l['item_id']][] = ['type' => $l['entity_type'], 'id' => (int) $l['entity_id'], 'name' => $l['name'] !== '' ? $l['name'] : 'Sans nom'];
    }
    $labels = [];
    foreach ($pdo->query("SELECT ll.entity_type, ll.entity_id, l.id, l.name, l.color FROM label_links ll JOIN labels l ON l.id=ll.label_id WHERE ll.entity_type IN ('periodical_periodical','periodical_issue','periodical_article') ORDER BY l.name COLLATE NOCASE") as $l) {
        $labels[substr((string) $l['entity_type'], 11) . ':' . $l['entity_id']][] = ['id' => (int) $l['id'], 'name' => $l['name'], 'color' => $l['color']];
    }
    $media = heritage_media($pdo, 'periodical_issue', array_column($issues, 'id'));
    $amedia = heritage_media($pdo, 'periodical_article', array_column($articles, 'id'));
    foreach ($issues as &$is) { $k = 'issue:' . $is['id']; $is['links'] = $links[$k] ?? []; $is['labels'] = $labels[$k] ?? []; $is['media'] = $media[$is['id']] ?? []; }
    foreach ($articles as &$ar) { $k = 'article:' . $ar['id']; $ar['links'] = $links[$k] ?? []; $ar['labels'] = $labels[$k] ?? []; $ar['media'] = $amedia[$ar['id']] ?? []; }
    foreach ($periodicals as &$pe) { $pe['labels'] = $labels['periodical:' . $pe['id']] ?? []; }
    unset($is, $ar, $pe);
    return ['periodicals' => $periodicals, 'issues' => $issues, 'articles' => $articles, 'kinds' => PERIODICAL_KINDS, 'statuses' => PERIODICAL_STATUSES, 'article_kinds' => PERIODICAL_ARTICLE_KINDS];
}

function save_periodical(PDO $pdo, array $data): array
{
    periodicals_ensure($pdo);
    $id = safe_int($data['id'] ?? 0);
    $title = mb_substr(safe_text($data['title'] ?? ''), 0, 200);
    if ($title === '') { throw new RuntimeException('Donne le nom de la revue.'); }
    $kind = array_key_exists((string) ($data['kind'] ?? ''), PERIODICAL_KINDS) ? (string) $data['kind'] : 'autre';
    $vals = [$title, $kind, mb_substr(safe_text($data['publisher'] ?? ''), 0, 200), periodical_data(is_array($data['data'] ?? null) ? $data['data'] : [], PERIODICAL_DATA_KEYS)];
    if ($id) { $s = $pdo->prepare('UPDATE periodicals SET title=?, kind=?, publisher=?, data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([...$vals, $id]); if (!$s->rowCount()) { throw new RuntimeException('Revue introuvable.'); } }
    else { $pdo->prepare('INSERT INTO periodicals(title, kind, publisher, data_json) VALUES(?,?,?,?)')->execute($vals); $id = (int) $pdo->lastInsertId(); }
    if (array_key_exists('label_ids', $data)) { set_label_links($pdo, ['entity_type' => 'periodical_periodical', 'entity_id' => $id, 'label_ids' => is_array($data['label_ids']) ? $data['label_ids'] : []]); }
    log_change($pdo, 'meta', 0, 'update', 'Revue enregistrée : ' . $title);
    return ['id' => $id];
}

function save_periodical_issue(PDO $pdo, array $data): array
{
    periodicals_ensure($pdo);
    $id = safe_int($data['id'] ?? 0); $pid = safe_int($data['periodical_id'] ?? 0);
    $s = $pdo->prepare('SELECT title FROM periodicals WHERE id=?'); $s->execute([$pid]); $ptitle = $s->fetchColumn();
    if ($ptitle === false) { throw new RuntimeException('Choisis la revue de ce numéro.'); }
    $dateText = mb_substr(safe_text($data['date_text'] ?? ''), 0, 80);
    $status = array_key_exists((string) ($data['status'] ?? ''), PERIODICAL_STATUSES) ? (string) $data['status'] : '';
    $vals = [$pid, mb_substr(safe_text($data['number'] ?? ''), 0, 40), mb_substr(safe_text($data['title'] ?? ''), 0, 300), $dateText, periodical_sort_date($dateText), $status,
        periodical_data(is_array($data['data'] ?? null) ? $data['data'] : [], PERIODICAL_ISSUE_DATA_KEYS)];
    if ($id) { $u = $pdo->prepare('UPDATE periodical_issues SET periodical_id=?, number=?, title=?, date_text=?, sort_date=?, status=?, data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $u->execute([...$vals, $id]); if (!$u->rowCount()) { throw new RuntimeException('Numéro introuvable.'); } }
    else { $pdo->prepare('INSERT INTO periodical_issues(periodical_id, number, title, date_text, sort_date, status, data_json) VALUES(?,?,?,?,?,?,?)')->execute($vals); $id = (int) $pdo->lastInsertId(); }
    periodical_set_links($pdo, 'issue', $id, $data);
    log_change($pdo, 'meta', 0, 'update', 'Numéro enregistré : ' . $ptitle . ($vals[1] !== '' ? ' n° ' . $vals[1] : ''));
    return ['id' => $id];
}

function save_periodical_article(PDO $pdo, array $data): array
{
    periodicals_ensure($pdo);
    $id = safe_int($data['id'] ?? 0); $iid = safe_int($data['issue_id'] ?? 0);
    $s = $pdo->prepare('SELECT 1 FROM periodical_issues WHERE id=?'); $s->execute([$iid]);
    if (!$s->fetchColumn()) { throw new RuntimeException('Numéro introuvable.'); }
    $title = mb_substr(safe_text($data['title'] ?? ''), 0, 300);
    if ($title === '') { throw new RuntimeException('Donne le titre de l’article.'); }
    $kind = array_key_exists((string) ($data['kind'] ?? ''), PERIODICAL_ARTICLE_KINDS) ? (string) $data['kind'] : 'article';
    $vals = [$iid, $title, mb_substr(safe_text($data['authors'] ?? ''), 0, 300), mb_substr(safe_text($data['pages'] ?? ''), 0, 40), mb_substr(safe_text($data['rubric'] ?? ''), 0, 120), $kind,
        periodical_data(is_array($data['data'] ?? null) ? $data['data'] : [], PERIODICAL_ARTICLE_DATA_KEYS)];
    if ($id) { $u = $pdo->prepare('UPDATE periodical_articles SET issue_id=?, title=?, authors=?, pages=?, rubric=?, kind=?, data_json=? WHERE id=?'); $u->execute([...$vals, $id]); if (!$u->rowCount()) { throw new RuntimeException('Article introuvable.'); } }
    else { $n = (int) $pdo->query('SELECT COALESCE(max(position),0)+1 FROM periodical_articles WHERE issue_id=' . $iid)->fetchColumn(); $pdo->prepare('INSERT INTO periodical_articles(issue_id, title, authors, pages, rubric, kind, data_json, position) VALUES(?,?,?,?,?,?,?,?)')->execute([...$vals, $n]); $id = (int) $pdo->lastInsertId(); }
    periodical_set_links($pdo, 'article', $id, $data);
    return ['id' => $id];
}

function delete_periodical_item(PDO $pdo, array $data): array
{
    periodicals_ensure($pdo);
    $what = (string) ($data['what'] ?? ''); $id = safe_int($data['id'] ?? 0);
    $dropArticle = static function (int $aid) use ($pdo): void {
        heritage_delete_media_links($pdo, 'periodical_article', $aid); $pdo->prepare("DELETE FROM label_links WHERE entity_type='periodical_article' AND entity_id=?")->execute([$aid]);
        $pdo->prepare("DELETE FROM periodical_links WHERE item_type='article' AND item_id=?")->execute([$aid]); $pdo->prepare('DELETE FROM periodical_articles WHERE id=?')->execute([$aid]);
    };
    $dropIssue = static function (int $iid) use ($pdo, $dropArticle): void {
        foreach ($pdo->query('SELECT id FROM periodical_articles WHERE issue_id=' . $iid)->fetchAll(PDO::FETCH_COLUMN) as $aid) { $dropArticle((int) $aid); }
        heritage_delete_media_links($pdo, 'periodical_issue', $iid); $pdo->prepare("DELETE FROM label_links WHERE entity_type='periodical_issue' AND entity_id=?")->execute([$iid]);
        $pdo->prepare("DELETE FROM periodical_links WHERE item_type='issue' AND item_id=?")->execute([$iid]); $pdo->prepare('DELETE FROM periodical_issues WHERE id=?')->execute([$iid]);
    };
    if ($what === 'article') { $dropArticle($id); }
    elseif ($what === 'issue') { $dropIssue($id); }
    elseif ($what === 'periodical') {
        foreach ($pdo->query('SELECT id FROM periodical_issues WHERE periodical_id=' . $id)->fetchAll(PDO::FETCH_COLUMN) as $iid) { $dropIssue((int) $iid); }
        $pdo->prepare("DELETE FROM label_links WHERE entity_type='periodical_periodical' AND entity_id=?")->execute([$id]); $pdo->prepare('DELETE FROM periodicals WHERE id=?')->execute([$id]);
    } else { throw new RuntimeException('Quoi supprimer ?'); }
    log_change($pdo, 'meta', 0, 'delete', 'Revues : ' . ['article' => 'article', 'issue' => 'numéro', 'periodical' => 'revue'][$what] . ' supprimé');
    return ['ok' => true];
}

/** Ordre des articles d'un numéro (comme dans le sommaire) */
function reorder_periodical_articles(PDO $pdo, array $data): array
{
    periodicals_ensure($pdo);
    $u = $pdo->prepare('UPDATE periodical_articles SET position=? WHERE id=? AND issue_id=?');
    foreach (array_values(array_map('intval', is_array($data['ids'] ?? null) ? $data['ids'] : [])) as $k => $aid) { $u->execute([$k + 1, $aid, safe_int($data['issue_id'] ?? 0)]); }
    return ['ok' => true];
}
