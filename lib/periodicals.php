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

const PERIODICAL_FAMILIES = ['revue' => 'Revues et magazines', 'livre' => 'Livres', 'doc' => 'Documentaires, films, émissions'];
const PERIODICAL_KINDS = ['magazine' => 'Magazine grand public', 'genealogie' => 'Revue de généalogie', 'cercle' => 'Bulletin de cercle / d’association', 'histoire_locale' => 'Revue d’histoire locale',
    'histoire' => 'Revue d’histoire', 'journal' => 'Journal quotidien', 'hebdo' => 'Hebdomadaire / journal régional', 'savante' => 'Revue savante', 'archives' => 'Revue d’archives / de musée', 'autre' => 'Autre',
    'collection' => 'Collection d’un éditeur', 'serie_livres' => 'Série, saga, œuvre en plusieurs tomes', 'serie_doc' => 'Série documentaire', 'emission' => 'Émission (télé, radio, podcast)', 'chaine' => 'Chaîne, plateforme, archives filmées'];
/** les sortes de « revue » proposées selon la famille (une collection de livres, une série documentaire…) */
const PERIODICAL_FAMILY_KINDS = ['revue' => ['magazine', 'genealogie', 'cercle', 'histoire_locale', 'histoire', 'journal', 'hebdo', 'savante', 'archives', 'autre'],
    'livre' => ['collection', 'serie_livres', 'autre'], 'doc' => ['serie_doc', 'emission', 'chaine', 'autre']];
const PERIODICAL_STATUSES = ['owned' => 'Je l’ai', 'wanted' => 'À acheter', 'ordered' => 'Commandé', 'subscribed' => 'Reçu par abonnement', 'digital' => 'Numérique (PDF, en ligne)',
    'borrowed' => 'Emprunté / consulté', 'lent' => 'Prêté', 'given' => 'Donné / vendu', '' => 'Pas précisé'];
const PERIODICAL_ARTICLE_KINDS = ['article' => 'Article', 'dossier' => 'Dossier', 'genealogie' => 'Généalogie publiée', 'chronique' => 'Chronique', 'methode' => 'Méthode, conseils', 'source' => 'Présentation d’une source / d’un fonds',
    'courrier' => 'Courrier des lecteurs', 'question' => 'Question / entraide', 'annonce' => 'Petite annonce', 'compte_rendu' => 'Compte rendu, lecture', 'photo' => 'Photo, illustration', 'carte' => 'Carte, plan', 'autre' => 'Autre',
    'chapitre' => 'Chapitre', 'passage' => 'Passage à retenir', 'annexe' => 'Annexe, document reproduit', 'moment' => 'Moment, séquence', 'temoignage' => 'Témoignage, interview', 'image_archive' => 'Image d’archive, photo montrée',
    'lieu_filme' => 'Lieu filmé', 'document_montre' => 'Document montré (acte, lettre…)', 'generique' => 'Générique, crédits'];
const PERIODICAL_FAMILY_ARTICLE_KINDS = ['revue' => ['article', 'dossier', 'genealogie', 'chronique', 'methode', 'source', 'courrier', 'question', 'annonce', 'compte_rendu', 'photo', 'carte', 'autre'],
    'livre' => ['chapitre', 'passage', 'annexe', 'genealogie', 'source', 'photo', 'carte', 'autre'], 'doc' => ['moment', 'temoignage', 'image_archive', 'document_montre', 'lieu_filme', 'carte', 'generique', 'autre']];
const PERIODICAL_DATA_KEYS = ['issn', 'frequency', 'website', 'association', 'country', 'language', 'start_year', 'end_year', 'subscribed', 'subscription_end', 'subscription_price', 'contact', 'where_buy', 'notes'];
const PERIODICAL_ISSUE_DATA_KEYS = ['creators', 'subtitle', 'publisher', 'place', 'edition', 'isbn', 'channel', 'duration', 'language', 'video_url', 'special', 'pages_count', 'cover_price', 'price_paid', 'bought_date', 'bought_where', 'storage', 'priority', 'buy_url', 'digital_url', 'summary', 'notes', 'rating', 'read', 'condition'];
const PERIODICAL_ARTICLE_DATA_KEYS = ['what_seen', 'transcript', 'summary', 'keywords', 'places', 'period', 'surnames', 'sources', 'url', 'rating', 'notes', 'read', 'quote'];

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
    // famille (revue, livre, documentaire) : ajoutée après coup, une base qui avait déjà ces tables la reçoit ici
    foreach (['periodicals', 'periodical_issues'] as $t) {
        $cols = array_column($pdo->query("PRAGMA table_info($t)")->fetchAll(), 'name');
        if (!in_array('family', $cols, true)) { $pdo->exec("ALTER TABLE $t ADD COLUMN family TEXT NOT NULL DEFAULT 'revue'"); }
    }
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
    foreach (['person' => 'persons', 'investigation' => 'investigations', 'investigation_item' => 'investigation_items'] as $entity => $key) {
        foreach (array_slice(array_unique(array_filter(array_map('intval', is_array($data[$key] ?? null) ? $data[$key] : []))), 0, 500) as $eid) { $ins->execute([$type, $id, $entity, $eid]); }
    }
    if (array_key_exists('label_ids', $data)) { set_label_links($pdo, ['entity_type' => 'periodical_' . $type, 'entity_id' => $id, 'label_ids' => is_array($data['label_ids']) ? $data['label_ids'] : []]); }
}

/** Les personnes, enquêtes et parties d'enquête (pistes) rattachées : « issue:12 » → [{type, id, name, inv?}] */
function periodical_links_map(PDO $pdo, string $itemType = ''): array
{
    $links = [];
    $s = $pdo->prepare("SELECT pl.*, CASE pl.entity_type WHEN 'person' THEN CASE WHEN p.id IS NULL THEN NULL ELSE trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) END WHEN 'investigation' THEN i.title
            WHEN 'investigation_item' THEN ii.title || ' — ' || COALESCE(i2.title,'') END AS name, ii.investigation_id AS inv
        FROM periodical_links pl LEFT JOIN persons p ON pl.entity_type='person' AND p.id=pl.entity_id LEFT JOIN investigations i ON pl.entity_type='investigation' AND i.id=pl.entity_id
        LEFT JOIN investigation_items ii ON pl.entity_type='investigation_item' AND ii.id=pl.entity_id LEFT JOIN investigations i2 ON i2.id=ii.investigation_id
        WHERE (?='' OR pl.item_type=?)");
    $s->execute([$itemType, $itemType]);
    foreach ($s as $l) {
        if ($l['name'] === null) { continue; } // fiche, enquête ou piste supprimée depuis
        $links[$l['item_type'] . ':' . $l['item_id']][] = ['type' => $l['entity_type'], 'id' => (int) $l['entity_id'], 'name' => $l['name'] !== '' ? $l['name'] : 'Sans nom'] + ($l['inv'] ? ['inv' => (int) $l['inv']] : []);
    }
    return $links;
}

/** Une personne supprimée ($to = 0) ou fusionnée dans une autre : ses liens de revues, livres, documentaires et annonces suivent */
function periodical_links_person(PDO $pdo, int $from, int $to): void
{
    if (!$pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='periodical_links'")->fetchColumn()) { return; }
    if ($to > 0) { $pdo->prepare("UPDATE OR IGNORE periodical_links SET entity_id=? WHERE entity_type='person' AND entity_id=?")->execute([$to, $from]); }
    $pdo->prepare("DELETE FROM periodical_links WHERE entity_type='person' AND entity_id=?")->execute([$from]);
}

/** Tous les noms de la généalogie (pour l'index des noms d'un livre) */
function person_names(PDO $pdo): array
{
    return ['persons' => $pdo->query("SELECT id, first_name, last_name FROM persons WHERE trim(COALESCE(last_name,''))<>'' ORDER BY last_name, first_name LIMIT 20000")->fetchAll()];
}

/** Chercher une partie d'enquête (piste, document, tâche…) à rattacher */
function periodical_link_search(PDO $pdo, string $q): array
{
    $q = trim($q);
    if (mb_strlen($q) < 2) { return ['items' => []]; }
    $s = $pdo->prepare("SELECT ii.id, ii.title, ii.kind, i.id AS inv, i.title AS inv_title FROM investigation_items ii JOIN investigations i ON i.id=ii.investigation_id
        WHERE ii.title LIKE ? OR i.title LIKE ? ORDER BY ii.title LIKE ? DESC, i.title, ii.title LIMIT 12");
    $like = '%' . $q . '%'; $s->execute([$like, $like, $like]);
    return ['items' => array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => $r['title'] . ' — ' . $r['inv_title'], 'inv' => (int) $r['inv'], 'kind' => $r['kind']], $s->fetchAll())];
}

/** Tout d'un coup (revues, numéros, articles, liens, étiquettes, couvertures) : l'écran trie et filtre lui-même */
function periodicals_all(PDO $pdo): array
{
    periodicals_ensure($pdo);
    $dec = static function (array $r): array { $r['data'] = json_decode((string) $r['data_json'], true) ?: []; unset($r['data_json']); $r['id'] = (int) $r['id']; return $r; };
    $periodicals = array_map($dec, $pdo->query('SELECT * FROM periodicals ORDER BY title COLLATE NOCASE, id')->fetchAll());
    $issues = array_map(static function ($r) use ($dec) { $r = $dec($r); $r['periodical_id'] = (int) $r['periodical_id']; return $r; }, $pdo->query('SELECT * FROM periodical_issues ORDER BY sort_date, id')->fetchAll());
    $articles = array_map(static function ($r) use ($dec) { $r = $dec($r); $r['issue_id'] = (int) $r['issue_id']; return $r; }, $pdo->query('SELECT * FROM periodical_articles ORDER BY issue_id, position, id')->fetchAll());
    $links = periodical_links_map($pdo);
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
    return ['periodicals' => $periodicals, 'issues' => $issues, 'articles' => $articles, 'kinds' => PERIODICAL_KINDS, 'statuses' => PERIODICAL_STATUSES, 'article_kinds' => PERIODICAL_ARTICLE_KINDS,
        'families' => PERIODICAL_FAMILIES, 'family_kinds' => PERIODICAL_FAMILY_KINDS, 'family_article_kinds' => PERIODICAL_FAMILY_ARTICLE_KINDS];
}

function save_periodical(PDO $pdo, array $data): array
{
    periodicals_ensure($pdo);
    $id = safe_int($data['id'] ?? 0);
    $title = mb_substr(safe_text($data['title'] ?? ''), 0, 200);
    if ($title === '') { throw new RuntimeException('Donne le nom de la revue.'); }
    $kind = array_key_exists((string) ($data['kind'] ?? ''), PERIODICAL_KINDS) ? (string) $data['kind'] : 'autre';
    $family = array_key_exists((string) ($data['family'] ?? ''), PERIODICAL_FAMILIES) ? (string) $data['family'] : 'revue';
    $vals = [$title, $kind, mb_substr(safe_text($data['publisher'] ?? ''), 0, 200), periodical_data(is_array($data['data'] ?? null) ? $data['data'] : [], PERIODICAL_DATA_KEYS), $family];
    if ($id) { $s = $pdo->prepare('UPDATE periodicals SET title=?, kind=?, publisher=?, data_json=?, family=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([...$vals, $id]); if (!$s->rowCount()) { throw new RuntimeException('Revue introuvable.'); }
        $pdo->prepare('UPDATE periodical_issues SET family=? WHERE periodical_id=?')->execute([$family, $id]); }
    else { $pdo->prepare('INSERT INTO periodicals(title, kind, publisher, data_json, family) VALUES(?,?,?,?,?)')->execute($vals); $id = (int) $pdo->lastInsertId(); }
    if (array_key_exists('label_ids', $data)) { set_label_links($pdo, ['entity_type' => 'periodical_periodical', 'entity_id' => $id, 'label_ids' => is_array($data['label_ids']) ? $data['label_ids'] : []]); }
    log_change($pdo, 'meta', 0, 'update', 'Revue enregistrée : ' . $title);
    return ['id' => $id];
}

function save_periodical_issue(PDO $pdo, array $data): array
{
    periodicals_ensure($pdo);
    $id = safe_int($data['id'] ?? 0); $pid = safe_int($data['periodical_id'] ?? 0);
    $family = array_key_exists((string) ($data['family'] ?? ''), PERIODICAL_FAMILIES) ? (string) $data['family'] : 'revue';
    $ptitle = '';
    if ($pid) { // la revue, la collection ou la série décide de la famille
        $s = $pdo->prepare('SELECT title, family FROM periodicals WHERE id=?'); $s->execute([$pid]); $per = $s->fetch();
        if (!$per) { throw new RuntimeException('Revue, collection ou série introuvable.'); }
        $ptitle = (string) $per['title']; $family = (string) $per['family'];
    } elseif ($family === 'revue') { throw new RuntimeException('Choisis la revue de ce numéro.'); }
    if ($family !== 'revue' && trim((string) ($data['title'] ?? '')) === '') { throw new RuntimeException($family === 'livre' ? 'Donne le titre du livre.' : 'Donne le titre du documentaire.'); }
    $dateText = mb_substr(safe_text($data['date_text'] ?? ''), 0, 80);
    $status = array_key_exists((string) ($data['status'] ?? ''), PERIODICAL_STATUSES) ? (string) $data['status'] : '';
    $vals = [$pid, mb_substr(safe_text($data['number'] ?? ''), 0, 40), mb_substr(safe_text($data['title'] ?? ''), 0, 300), $dateText, periodical_sort_date($dateText), $status,
        periodical_data(is_array($data['data'] ?? null) ? $data['data'] : [], PERIODICAL_ISSUE_DATA_KEYS), $family];
    if ($id) { $u = $pdo->prepare('UPDATE periodical_issues SET periodical_id=?, number=?, title=?, date_text=?, sort_date=?, status=?, data_json=?, family=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $u->execute([...$vals, $id]); if (!$u->rowCount()) { throw new RuntimeException('Numéro introuvable.'); } }
    else { $pdo->prepare('INSERT INTO periodical_issues(periodical_id, number, title, date_text, sort_date, status, data_json, family) VALUES(?,?,?,?,?,?,?,?)')->execute($vals); $id = (int) $pdo->lastInsertId(); }
    periodical_set_links($pdo, 'issue', $id, $data);
    log_change($pdo, 'meta', 0, 'update', ['revue' => 'Numéro enregistré : ', 'livre' => 'Livre enregistré : ', 'doc' => 'Documentaire enregistré : '][$family] . trim($ptitle . ($vals[1] !== '' ? ' n° ' . $vals[1] : '') . ' ' . $vals[2]));
    return ['id' => $id];
}

function save_periodical_article(PDO $pdo, array $data): array
{
    periodicals_ensure($pdo);
    $id = safe_int($data['id'] ?? 0); $iid = safe_int($data['issue_id'] ?? 0);
    $s = $pdo->prepare('SELECT 1 FROM periodical_issues WHERE id=?'); $s->execute([$iid]);
    if (!$s->fetchColumn()) { throw new RuntimeException('Numéro introuvable.'); }
    $title = mb_substr(safe_text($data['title'] ?? ''), 0, 300);
    if ($title === '') { throw new RuntimeException('Donne un titre (quelques mots suffisent).'); }
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
    if ($id <= 0) { throw new RuntimeException('Élément introuvable.'); } // jamais l'id 0 : il désigne les livres et films sans collection
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
    foreach (array_slice(array_values(array_map('intval', is_array($data['ids'] ?? null) ? $data['ids'] : [])), 0, 2000) as $k => $aid) { $u->execute([$k + 1, $aid, safe_int($data['issue_id'] ?? 0)]); }
    return ['ok' => true];
}

/** 📚 Vers un projet de l'Atelier : chaque numéro, livre, documentaire, article, chapitre ou moment devient une
 *  référence (auteurs, revue, numéro, pages ou minutage, résumé, étiquettes, captures) ; un passage à retenir devient
 *  en plus une citation rattachée à cette référence. */
function periodicals_to_atelier(PDO $pdo, array $data): array
{
    periodicals_ensure($pdo);
    $projectId = (int) atelier_project_row($pdo, safe_int($data['project_id'] ?? 0))['id'];
    $folder = safe_int($data['folder_id'] ?? 0);
    $all = periodicals_all($pdo);
    $per = array_column($all['periodicals'], null, 'id'); $iss = array_column($all['issues'], null, 'id'); $art = array_column($all['articles'], null, 'id');
    $creators = static function (string $txt, string $role = 'auteur'): array {
        $out = [];
        foreach (preg_split('/\s*(?:[,;&\/]|\bet\b)\s*/u', $txt) ?: [] as $n) {
            $n = trim($n); if ($n === '') { continue; }
            $parts = preg_split('/\s+/u', $n) ?: [$n];
            $out[] = count($parts) > 1 ? ['first' => implode(' ', array_slice($parts, 0, -1)), 'last' => (string) end($parts), 'role' => $role] : ['first' => '', 'last' => $n, 'role' => $role];
        }
        return array_slice($out, 0, 30);
    };
    $copyMedia = static function (string $from, int $fromId, int $itemId) use ($pdo): void {
        $pdo->prepare("INSERT INTO family_collection_media(collection_type, collection_id, media_id, position, role) SELECT 'atelier_item', ?, media_id, position, '' FROM family_collection_media
            WHERE collection_type=? AND collection_id=? AND media_id NOT IN (SELECT media_id FROM family_collection_media WHERE collection_type='atelier_item' AND collection_id=?)")->execute([$itemId, $from, $fromId, $itemId]);
    };
    $own = !$pdo->inTransaction();
    if ($own) { $pdo->beginTransaction(); }
    $made = 0;
    try {
        foreach (array_slice(is_array($data['items'] ?? null) ? $data['items'] : [], 0, 2000) as $it) {
            $type = (string) ($it['type'] ?? ''); $id = safe_int($it['id'] ?? 0);
            if ($type === 'issue' && isset($iss[$id])) {
                $i = $iss[$id]; $d = $i['data']; $p = $per[$i['periodical_id']] ?? null; $fam = $i['family'] ?? 'revue';
                $title = $fam === 'revue' ? trim(($p['title'] ?? 'Revue') . ($i['number'] !== '' ? ' n° ' . $i['number'] : '') . ($i['title'] !== '' ? ' — ' . $i['title'] : '')) : $i['title'];
                $ref = ['kind' => $fam === 'livre' ? 'livre' : 'autre', 'creators' => $creators((string) ($d['creators'] ?? ''), $fam === 'doc' ? 'autre' : 'auteur'), 'year' => substr((string) $i['sort_date'], 0, 4) ?: '', 'date' => $i['date_text'],
                    'container' => $fam === 'revue' ? '' : (string) ($p['title'] ?? ''), 'publisher' => (string) (($d['publisher'] ?? '') ?: ($d['channel'] ?? '') ?: ($p['publisher'] ?? '')), 'place' => (string) ($d['place'] ?? ''),
                    'edition' => (string) ($d['edition'] ?? ''), 'issue' => $fam === 'revue' ? (string) $i['number'] : '', 'volume' => $fam !== 'revue' ? (string) $i['number'] : '', 'isbn' => (string) ($d['isbn'] ?? ''),
                    'url' => (string) (($d['video_url'] ?? '') ?: ($d['digital_url'] ?? '')), 'language' => (string) ($d['language'] ?? ''), 'abstract' => (string) ($d['summary'] ?? ''),
                    'read' => !empty($d['read']) ? 'lu' : '', 'notes' => trim(($fam === 'doc' && !empty($d['duration']) ? 'Durée : ' . $d['duration'] . "\n" : '') . ($d['notes'] ?? '') . "\n(Venant de Listes → Revues, livres et documentaires)")];
                $src = ['issue', $i, 'periodical_issue'];
            } elseif ($type === 'article' && isset($art[$id])) {
                $a = $art[$id]; $d = $a['data']; $i = $iss[$a['issue_id']] ?? null; if (!$i) { continue; }
                $p = $per[$i['periodical_id']] ?? null; $fam = $i['family'] ?? 'revue';
                $title = $fam === 'doc' && $a['pages'] !== '' ? $a['title'] . ' (à ' . $a['pages'] . ')' : $a['title'];
                $ref = ['kind' => $fam === 'livre' ? 'chapitre' : ($fam === 'revue' ? (in_array($p['kind'] ?? '', ['journal', 'hebdo'], true) ? 'presse' : 'article') : 'autre'),
                    'creators' => $creators((string) $a['authors'], $fam === 'doc' ? 'autre' : 'auteur'), 'year' => substr((string) $i['sort_date'], 0, 4) ?: '', 'date' => $i['date_text'],
                    'container' => $fam === 'revue' ? (string) ($p['title'] ?? '') : (string) $i['title'], 'issue' => $fam === 'revue' ? (string) $i['number'] : '', 'pages' => $fam === 'doc' ? 'à ' . $a['pages'] : (string) $a['pages'],
                    'publisher' => (string) (($i['data']['publisher'] ?? '') ?: ($i['data']['channel'] ?? '')), 'url' => (string) ($d['url'] ?? ''),
                    'abstract' => trim(implode("\n", array_filter([(string) ($d['what_seen'] ?? ''), (string) ($d['summary'] ?? '')]))), 'read' => !empty($d['read']) ? 'lu' : '',
                    'notes' => trim(implode("\n", array_filter([$d['places'] ?? '' ? 'Lieux : ' . $d['places'] : '', $d['period'] ?? '' ? 'Période : ' . $d['period'] : '', $d['surnames'] ?? '' ? 'Noms cités : ' . $d['surnames'] : '', $d['sources'] ?? '' ? 'Sources : ' . $d['sources'] : '', (string) ($d['notes'] ?? '')])) . "\n(Venant de Listes → Revues, livres et documentaires)")];
                $src = ['article', $a, 'periodical_article'];
            } else { continue; }
            $tags = array_map(static fn($l) => (string) $l['name'], $src[1]['labels'] ?? []);
            $rid = (int) save_atelier_item($pdo, ['project_id' => $projectId, 'type' => 'reference', 'title' => $title !== '' ? $title : 'Sans titre', 'data' => $ref, 'tags' => $tags, 'folder_ids' => $folder ? [$folder] : []])['id'];
            $copyMedia($src[2], $src[1]['id'], $rid); $made++;
            $quote = trim((string) ($src[1]['data']['quote'] ?? '') ?: (string) ($src[1]['data']['transcript'] ?? ''));
            if ($quote !== '') { save_atelier_item($pdo, ['project_id' => $projectId, 'type' => 'quote', 'title' => '', 'data' => ['text' => $quote, 'source_id' => $rid, 'page' => $src[0] === 'article' ? (string) $src[1]['pages'] : ''], 'tags' => $tags, 'folder_ids' => $folder ? [$folder] : []]); $made++; }
        }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['created' => $made];
}

/* ═══════════════ ✉️ Petites annonces et courriers aux journaux ═══════════════
 * Des règles de tarif par journal (au mot, à la ligne, au caractère, au forfait ; minimum, mots gratuits, options,
 * parutions, TVA…), lues si on veut sur une capture d'écran (OCR dans l'écran, corrigeable), et des annonces :
 * texte, prix calculé, où on en est (brouillon, envoyée, publiée, réponses), captures, personnes, enquêtes, étiquettes. */
const PRESS_AD_KINDS = ['annonce' => 'Petite annonce', 'recherche' => 'Avis de recherche', 'question' => 'Question généalogique / entraide', 'courrier' => 'Courrier des lecteurs',
    'article' => 'Article, témoignage', 'communique' => 'Communiqué (association, réunion)', 'remerciements' => 'Remerciements, avis', 'autre' => 'Autre'];
const PRESS_AD_STATUSES = ['draft' => 'Brouillon', 'ready' => 'Prête à envoyer', 'sent' => 'Envoyée', 'published' => 'Publiée', 'answered' => 'Réponses reçues', 'closed' => 'Terminée', 'refused' => 'Refusée'];
const PRESS_AD_DATA_KEYS = ['options', 'insertions', 'sent_date', 'publish_date', 'issue_ref', 'cost_estimate', 'cost_paid', 'payment', 'answers', 'contact', 'notes', 'title_line'];
const PRESS_RULE_KEYS = ['unit', 'price', 'member_price', 'chars_per_line', 'count_spaces', 'free_units', 'min_units', 'min_price', 'max_units', 'fixed_fee', 'title_price', 'bold_price', 'photo_price',
    'box_price', 'domiciliation_price', 'web_price', 'discount_from', 'discount_pct', 'tax_pct', 'tax_included', 'deadline', 'send_to', 'payment', 'other'];

function press_ads_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    periodicals_ensure($pdo);
    $pdo->exec("CREATE TABLE IF NOT EXISTS press_ad_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', periodical_id INTEGER NOT NULL DEFAULT 0, rules_json TEXT NOT NULL DEFAULT '{}',
        source_text TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS press_ads (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'annonce', rules_id INTEGER NOT NULL DEFAULT 0,
        periodical_id INTEGER NOT NULL DEFAULT 0, journal TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', data_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $done = true;
}

function press_ads_all(PDO $pdo): array
{
    press_ads_ensure($pdo);
    $rules = array_map(static function ($r) { $r['id'] = (int) $r['id']; $r['periodical_id'] = (int) $r['periodical_id']; $r['rules'] = json_decode((string) $r['rules_json'], true) ?: []; unset($r['rules_json']); return $r; },
        $pdo->query('SELECT * FROM press_ad_rules ORDER BY name COLLATE NOCASE, id')->fetchAll());
    $ads = array_map(static function ($r) { $r['id'] = (int) $r['id']; $r['rules_id'] = (int) $r['rules_id']; $r['periodical_id'] = (int) $r['periodical_id']; $r['data'] = json_decode((string) $r['data_json'], true) ?: []; unset($r['data_json']); return $r; },
        $pdo->query('SELECT * FROM press_ads ORDER BY updated_at DESC, id DESC')->fetchAll());
    $links = [];
    foreach ($pdo->query("SELECT pl.item_id, pl.entity_type, pl.entity_id, CASE pl.entity_type WHEN 'person' THEN CASE WHEN p.id IS NULL THEN NULL ELSE trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) END ELSE i.title END AS name
        FROM periodical_links pl LEFT JOIN persons p ON pl.entity_type='person' AND p.id=pl.entity_id LEFT JOIN investigations i ON pl.entity_type='investigation' AND i.id=pl.entity_id WHERE pl.item_type='ad'") as $l) {
        if ($l['name'] !== null) { $links[(int) $l['item_id']][] = ['type' => $l['entity_type'], 'id' => (int) $l['entity_id'], 'name' => $l['name'] !== '' ? $l['name'] : 'Sans nom']; }
    }
    $media = heritage_media($pdo, 'press_ad', array_column($ads, 'id'));
    foreach ($ads as &$a) { $a['links'] = $links[$a['id']] ?? []; $a['labels'] = labels_for_entity($pdo, 'press_ad', $a['id']); $a['media'] = $media[$a['id']] ?? []; }
    unset($a);
    $periodicals = $pdo->query('SELECT id, title FROM periodicals ORDER BY title COLLATE NOCASE')->fetchAll();
    return ['ads' => $ads, 'rules' => $rules, 'periodicals' => $periodicals, 'kinds' => PRESS_AD_KINDS, 'statuses' => PRESS_AD_STATUSES];
}

function save_press_ad_rules(PDO $pdo, array $data): array
{
    press_ads_ensure($pdo);
    $id = safe_int($data['id'] ?? 0);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200);
    if ($name === '') { throw new RuntimeException('Donne un nom à ces règles (le journal, la rubrique).'); }
    $raw = is_array($data['rules'] ?? null) ? $data['rules'] : [];
    $rules = [];
    foreach (PRESS_RULE_KEYS as $k) { if (isset($raw[$k]) && is_scalar($raw[$k]) && trim((string) $raw[$k]) !== '') { $rules[$k] = mb_substr(trim((string) $raw[$k]), 0, 2000); } }
    $vals = [$name, safe_int($data['periodical_id'] ?? 0), json_encode($rules, JSON_UNESCAPED_UNICODE) ?: '{}', mb_substr((string) ($data['source_text'] ?? ''), 0, 20000), h_long($data, 'notes', 4000)];
    if ($id) { $u = $pdo->prepare('UPDATE press_ad_rules SET name=?, periodical_id=?, rules_json=?, source_text=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $u->execute([...$vals, $id]); if (!$u->rowCount()) { throw new RuntimeException('Règles introuvables.'); } }
    else { $pdo->prepare('INSERT INTO press_ad_rules(name, periodical_id, rules_json, source_text, notes) VALUES(?,?,?,?,?)')->execute($vals); $id = (int) $pdo->lastInsertId(); }
    return ['id' => $id];
}

function save_press_ad(PDO $pdo, array $data): array
{
    press_ads_ensure($pdo);
    $id = safe_int($data['id'] ?? 0);
    $title = mb_substr(safe_text($data['title'] ?? ''), 0, 200) ?: 'Annonce sans titre';
    $raw = is_array($data['data'] ?? null) ? $data['data'] : [];
    $d = [];
    foreach (PRESS_AD_DATA_KEYS as $k) { if (!isset($raw[$k])) { continue; } if ($k === 'options' && is_array($raw[$k])) { $d[$k] = array_values(array_intersect(array_map('strval', $raw[$k]), ['title', 'bold', 'photo', 'box', 'domiciliation', 'web', 'member'])); } elseif (is_scalar($raw[$k]) && trim((string) $raw[$k]) !== '') { $d[$k] = mb_substr(trim((string) $raw[$k]), 0, 8000); } }
    $vals = [$title, array_key_exists((string) ($data['kind'] ?? ''), PRESS_AD_KINDS) ? (string) $data['kind'] : 'annonce', safe_int($data['rules_id'] ?? 0), safe_int($data['periodical_id'] ?? 0),
        mb_substr(safe_text($data['journal'] ?? ''), 0, 200), mb_substr((string) ($data['body'] ?? ''), 0, 20000), array_key_exists((string) ($data['status'] ?? ''), PRESS_AD_STATUSES) ? (string) $data['status'] : 'draft',
        json_encode($d, JSON_UNESCAPED_UNICODE) ?: '{}'];
    if ($id) { $u = $pdo->prepare('UPDATE press_ads SET title=?, kind=?, rules_id=?, periodical_id=?, journal=?, body=?, status=?, data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $u->execute([...$vals, $id]); if (!$u->rowCount()) { throw new RuntimeException('Annonce introuvable.'); } }
    else { $pdo->prepare('INSERT INTO press_ads(title, kind, rules_id, periodical_id, journal, body, status, data_json) VALUES(?,?,?,?,?,?,?,?)')->execute($vals); $id = (int) $pdo->lastInsertId(); }
    $pdo->prepare("DELETE FROM periodical_links WHERE item_type='ad' AND item_id=?")->execute([$id]);
    $ins = $pdo->prepare("INSERT OR IGNORE INTO periodical_links(item_type, item_id, entity_type, entity_id) VALUES('ad',?,?,?)");
    foreach (['person' => 'persons', 'investigation' => 'investigations'] as $entity => $key) { foreach (array_slice(array_unique(array_filter(array_map('intval', is_array($data[$key] ?? null) ? $data[$key] : []))), 0, 500) as $eid) { $ins->execute([$id, $entity, $eid]); } }
    if (array_key_exists('label_ids', $data)) { set_label_links($pdo, ['entity_type' => 'press_ad', 'entity_id' => $id, 'label_ids' => is_array($data['label_ids']) ? $data['label_ids'] : []]); }
    log_change($pdo, 'meta', 0, 'update', 'Annonce enregistrée : ' . $title);
    return ['id' => $id];
}

function delete_press_item(PDO $pdo, array $data): array
{
    press_ads_ensure($pdo);
    $id = safe_int($data['id'] ?? 0); $what = (string) ($data['what'] ?? '');
    if ($id <= 0 || !in_array($what, ['rules', 'ad'], true)) { throw new RuntimeException('Élément introuvable.'); }
    if ($what === 'rules') { $pdo->prepare('DELETE FROM press_ad_rules WHERE id=?')->execute([$id]); $pdo->prepare('UPDATE press_ads SET rules_id=0 WHERE rules_id=?')->execute([$id]); return ['ok' => true]; }
    heritage_delete_media_links($pdo, 'press_ad', $id);
    $pdo->prepare("DELETE FROM label_links WHERE entity_type='press_ad' AND entity_id=?")->execute([$id]);
    $pdo->prepare("DELETE FROM periodical_links WHERE item_type='ad' AND item_id=?")->execute([$id]);
    $pdo->prepare('DELETE FROM press_ads WHERE id=?')->execute([$id]);
    return ['ok' => true];
}
