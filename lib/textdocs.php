<?php
declare(strict_types=1);

/**
 * 📝 Traitement de texte (interface : assets/js/heritage-traitement-texte.js ; formats .docx .odt .rtf .md .txt .html :
 * assets/js/app-texte-engine.js) : les documents (lettre, récit, rapport, transcription mise au propre…) gardés en JSON dans
 * la table text_documents (migration schema_v57). kind = 'doc' (un document) ou 'template' (« Mes modèles »).
 * Les versions d'un document (« Enregistrer comme nouvelle version », « Versions du document », « Comparer ») sont dans
 * text_document_versions. Le serveur ne met rien en page : il vérifie la forme et la taille, retire ce qui pourrait
 * s'exécuter (le navigateur nettoie aussi tout avant de l'afficher) et tient un petit résumé (info) pour la liste.
 */

const TEXTDOC_MAX = 30000000;     // octets de JSON (images comprises quand elles ne sont pas dans les médias)
const TEXTDOC_SECTIONS_MAX = 200;
const TEXTDOC_VERSIONS_MAX = 200; // versions gardées par document (les plus anciennes partent)

function textdoc_ready(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    // une ancienne base qui n'aurait pas encore la migration (copie ouverte à part) : mêmes tables que schema_v57
    textdocs_schema($pdo);
    $done = true;
}

function textdocs_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS text_documents (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'doc' CHECK(kind IN ('doc','template')), data_json TEXT NOT NULL DEFAULT '{}', info_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_text_documents_kind ON text_documents(kind, updated_at)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS text_document_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id INTEGER NOT NULL,
        label TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL DEFAULT '{}', words INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (doc_id) REFERENCES text_documents(id) ON DELETE CASCADE)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_text_document_versions_doc ON text_document_versions(doc_id, id)');
}

/** Retire d'un HTML ce qui pourrait s'exécuter : balises de script et d'objets, attributs on…, liens javascript:/data: hors images. */
function textdoc_defuse(string $html): string
{
    $html = preg_replace('#<\s*(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select|svg|math|template|noscript|frame|frameset|applet)\b[^>]*>.*?<\s*/\s*\1\s*>#is', '', $html) ?? '';
    $html = preg_replace('#<\s*/?\s*(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select|svg|math|template|noscript|frame|frameset|applet)\b[^>]*>#is', '', $html) ?? '';
    $html = preg_replace('#\s(on[a-z]+|formaction|srcdoc|xlink:href)\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)#i', '', $html) ?? '';
    // liens et sources : seulement http(s), mailto, # et media/… ; une image peut être en data:image (png, jpeg, gif, webp)
    $html = preg_replace_callback('#\s(href|src)\s*=\s*("([^"]*)"|\'([^\']*)\')#i', static function ($m) {
        $v = html_entity_decode($m[3] !== '' ? $m[3] : ($m[4] ?? ''), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $v = trim(preg_replace('/[\x00-\x20]+/', '', $v) ?? '');
        $ok = strtolower($m[1]) === 'src'
            ? (bool) preg_match('#^(media/[A-Za-z0-9._%\-]{1,240}|data:image/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+)$#', $v)
            : (bool) preg_match('#^(https?://|mailto:|\#)#i', $v);
        return $ok ? $m[0] : '';
    }, $html) ?? '';
    $html = preg_replace('#(java|vb)script\s*:#i', '', $html) ?? '';
    return $html;
}

/** Le texte d'un HTML, sans balises (pour compter les mots, l'aperçu) */
function textdoc_plain(string $html): string
{
    $t = preg_replace('#<(br|/p|/h[1-6]|/li|/tr|/div|/figcaption)\b[^>]*>#i', "\n", $html) ?? '';
    $t = preg_replace('#<(del)\b[^>]*>.*?</\1>#is', '', $t) ?? ''; // une suppression suivie ne compte plus
    $t = html_entity_decode(strip_tags($t), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return trim(preg_replace("/[ \t\x{00A0}]+/u", ' ', $t) ?? '');
}

/** Le document reçu : forme vérifiée, tailles bornées ; renvoie [données nettoyées, résumé] */
function textdoc_check(mixed $data): array
{
    if (!is_array($data) || !isset($data['sections']) || !is_array($data['sections']) || !array_is_list($data['sections'])) {
        throw new LcndaBadInput('Document illisible : il manque son texte.');
    }
    if (count($data['sections']) < 1 || count($data['sections']) > TEXTDOC_SECTIONS_MAX) {
        throw new LcndaBadInput('Un document a de 1 à ' . TEXTDOC_SECTIONS_MAX . ' parties.');
    }
    $num = static fn($v, float $a, float $b, float $d) => is_numeric($v) ? max($a, min($b, (float) $v)) : $d;
    $col = static fn($v) => is_string($v) && preg_match('/^#[0-9a-f]{6}$/i', $v) ? strtolower($v) : '';
    $cleanPage = static function ($p) use ($num, $col): array {
        $p = is_array($p) ? $p : [];
        $m = is_array($p['m'] ?? null) ? $p['m'] : [];
        $out = ['w' => $num($p['w'] ?? 210, 50, 1200, 210), 'h' => $num($p['h'] ?? 297, 50, 1200, 297),
            'm' => ['t' => $num($m['t'] ?? 25, 0, 200, 25), 'r' => $num($m['r'] ?? 25, 0, 200, 25), 'b' => $num($m['b'] ?? 25, 0, 200, 25), 'l' => $num($m['l'] ?? 25, 0, 200, 25)],
            'orient' => ($p['orient'] ?? '') === 'landscape' ? 'landscape' : 'portrait', 'cols' => (int) $num($p['cols'] ?? 1, 1, 6, 1), 'gap' => $num($p['gap'] ?? 10, 0, 60, 10)];
        if (isset($p['size']) && is_string($p['size']) && preg_match('/^[\w-]{1,30}$/', $p['size'])) { $out['size'] = $p['size']; }
        if ($c = $col($p['color'] ?? '')) { $out['color'] = $c; }
        if (isset($p['wm']) && is_string($p['wm']) && $p['wm'] !== '') { $out['wm'] = mb_substr($p['wm'], 0, 80); $out['wmo'] = $num($p['wmo'] ?? 12, 2, 60, 12); }
        return $out;
    };
    $sections = []; $words = 0; $first = ''; $heads = [];
    foreach ($data['sections'] as $i => $sec) {
        if (!is_array($sec)) { throw new LcndaBadInput('Partie illisible.'); }
        $html = is_string($sec['html'] ?? null) ? $sec['html'] : '';
        if (strlen($html) > TEXTDOC_MAX) { throw new LcndaBadInput('Document trop lourd : partage-le en plusieurs documents.'); }
        $html = textdoc_defuse($html);
        $o = ['html' => $html];
        if (isset($sec['page']) && is_array($sec['page'])) { $o['page'] = $cleanPage($sec['page']); }
        $sections[] = $o;
        $plain = textdoc_plain($html);
        $words += $plain === '' ? 0 : count(preg_split('/[\s\x{00A0}]+/u', $plain, -1, PREG_SPLIT_NO_EMPTY) ?: []);
        if ($first === '' && $plain !== '') { $first = mb_substr($plain, 0, 400); }
        if (count($heads) < 8 && preg_match_all('#<h[1-3]\b[^>]*>(.*?)</h[1-3]>#is', $html, $mm)) {
            foreach ($mm[1] as $h) { $h = trim(html_entity_decode(strip_tags($h), ENT_QUOTES | ENT_HTML5, 'UTF-8')); if ($h !== '' && count($heads) < 8) { $heads[] = mb_substr($h, 0, 80); } }
        }
    }
    $hf = static function ($v): array {
        $v = is_array($v) ? $v : [];
        return ['html' => textdoc_defuse(mb_substr(is_string($v['html'] ?? null) ? $v['html'] : '', 0, 20000)), 'first' => !empty($v['first']), 'firstHtml' => textdoc_defuse(mb_substr(is_string($v['firstHtml'] ?? null) ? $v['firstHtml'] : '', 0, 20000))];
    };
    $styles = is_array($data['styles'] ?? null) && array_is_list($data['styles']) ? array_slice(array_values(array_filter($data['styles'], 'is_array')), 0, 300) : [];
    $comments = [];
    foreach (is_array($data['comments'] ?? null) && array_is_list($data['comments']) ? array_slice($data['comments'], 0, 5000) : [] as $c) {
        if (!is_array($c) || !preg_match('/^[\w-]{1,40}$/', (string) ($c['id'] ?? ''))) { continue; }
        $comments[] = ['id' => (string) $c['id'], 'text' => mb_substr(safe_text($c['text'] ?? ''), 0, 4000), 'author' => mb_substr(safe_text($c['author'] ?? ''), 0, 80),
            'at' => mb_substr((string) ($c['at'] ?? ''), 0, 40), 'done' => !empty($c['done']),
            'replies' => array_values(array_map(static fn($r) => ['text' => mb_substr(safe_text(is_array($r) ? ($r['text'] ?? '') : ''), 0, 4000), 'author' => mb_substr(safe_text(is_array($r) ? ($r['author'] ?? '') : ''), 0, 80), 'at' => mb_substr((string) (is_array($r) ? ($r['at'] ?? '') : ''), 0, 40)], array_slice(is_array($c['replies'] ?? null) ? $c['replies'] : [], 0, 100)))];
    }
    $clean = ['v' => 1, 'page' => $cleanPage($data['page'] ?? []), 'sections' => $sections, 'header' => $hf($data['header'] ?? []), 'footer' => $hf($data['footer'] ?? []),
        'styles' => $styles, 'comments' => $comments, 'lang' => preg_match('/^[a-z]{2}(-[A-Z]{2})?$/', (string) ($data['lang'] ?? '')) ? $data['lang'] : 'fr',
        'set' => preg_match('/^[\w-]{1,30}$/', (string) ($data['set'] ?? '')) ? $data['set'] : 'classique',
        'track' => !empty($data['track']), 'meta' => ['author' => mb_substr(safe_text($data['meta']['author'] ?? ''), 0, 120), 'subject' => mb_substr(safe_text($data['meta']['subject'] ?? ''), 0, 200)]];
    if (isset($data['tab']) && is_numeric($data['tab'])) { $clean['tab'] = max(2, min(60, (float) $data['tab'])); }
    if (isset($data['tpl']) && is_string($data['tpl']) && preg_match('/^[\w-]{1,40}$/', $data['tpl'])) { $clean['tpl'] = $data['tpl']; }
    $info = ['words' => $words, 'sections' => count($sections), 'preview' => $first, 'heads' => $heads, 'pages' => max(1, (int) ($data['pages'] ?? 1) > 0 ? min(9999, (int) ($data['pages'] ?? 1)) : 1),
        'comments' => count(array_filter($comments, static fn($c) => !$c['done'])), 'tracked' => (bool) preg_match('#<(ins|del)\b[^>]*data-tc=#i', implode('', array_column($sections, 'html'))),
        'page' => ['w' => $clean['page']['w'], 'h' => $clean['page']['h'], 'orient' => $clean['page']['orient']]];
    if (isset($data['thumb']) && is_string($data['thumb']) && strlen($data['thumb']) < 400000 && preg_match('#^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$#', $data['thumb'])) { $info['thumb'] = $data['thumb']; }
    return [$clean, $info];
}

function textdocs_list(PDO $pdo, string $kind = 'doc'): array
{
    textdoc_ready($pdo);
    $s = $pdo->prepare('SELECT id, name, kind, info_json, created_at, updated_at FROM text_documents WHERE kind=? ORDER BY updated_at DESC, id DESC');
    $s->execute([$kind === 'template' ? 'template' : 'doc']);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'kind' => (string) $r['kind'], 'created_at' => $r['created_at'], 'updated_at' => $r['updated_at'],
        'info' => json_decode((string) $r['info_json'], true) ?: new stdClass()], $s->fetchAll());
}

function textdoc_get(PDO $pdo, int $id): array
{
    textdoc_ready($pdo);
    $s = $pdo->prepare('SELECT * FROM text_documents WHERE id=?'); $s->execute([$id]); $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Document introuvable.'); }
    $n = $pdo->prepare('SELECT count(*) FROM text_document_versions WHERE doc_id=?'); $n->execute([$id]);
    return ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'kind' => (string) $r['kind'], 'data' => json_decode((string) $r['data_json'], true) ?: new stdClass(),
        'versions' => (int) $n->fetchColumn(), 'updated_at' => $r['updated_at'], 'created_at' => $r['created_at'], 'rev' => content_rev((string) $r['data_json'])];
}

function save_textdoc(PDO $pdo, array $data): array
{
    textdoc_ready($pdo);
    $id = safe_int($data['id'] ?? 0);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200) ?: 'Mon document';
    $kind = ($data['kind'] ?? '') === 'template' ? 'template' : 'doc';
    [$clean, $info] = textdoc_check($data['data'] ?? null);
    $json = json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    if ($json === false || strlen($json) > TEXTDOC_MAX) { throw new LcndaBadInput('Document trop lourd (plus de 30 Mo) : range les images dans les médias, ou partage-le en plusieurs documents.'); }
    $infoJson = json_encode($info, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}';
    if ($id > 0) {
        // un autre onglet a enregistré entre-temps : on ne l'écrase pas sans le dire
        if (isset($data['rev']) && is_string($data['rev']) && $data['rev'] !== '') {
            $c = $pdo->prepare('SELECT data_json FROM text_documents WHERE id=?'); $c->execute([$id]); $cur = $c->fetchColumn();
            if ($cur !== false && content_rev((string) $cur) !== $data['rev'] && empty($data['force'])) { throw new LcndaConflict('Ce document a été modifié ailleurs (autre onglet ou autre fenêtre) depuis que tu l’as ouvert.'); }
        }
        $s = $pdo->prepare('UPDATE text_documents SET name=?, kind=?, data_json=?, info_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([$name, $kind, $json, $infoJson, $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Document introuvable.'); }
    } else {
        $pdo->prepare('INSERT INTO text_documents(name, kind, data_json, info_json) VALUES(?,?,?,?)')->execute([$name, $kind, $json, $infoJson]);
        $id = (int) $pdo->lastInsertId();
    }
    log_change($pdo, 'meta', 0, 'update', ($kind === 'template' ? 'Modèle de document enregistré : ' : 'Document enregistré : ') . $name);
    $u = $pdo->prepare('SELECT updated_at FROM text_documents WHERE id=?'); $u->execute([$id]);
    return ['id' => $id, 'updated_at' => $u->fetchColumn(), 'rev' => content_rev($json), 'words' => $info['words']];
}

function rename_textdoc(PDO $pdo, array $data): array
{
    textdoc_ready($pdo);
    $id = safe_int($data['id'] ?? 0); $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200);
    if ($id <= 0 || $name === '') { throw new LcndaBadInput('Nom manquant.'); }
    $s = $pdo->prepare('UPDATE text_documents SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([$name, $id]);
    if (!$s->rowCount()) { throw new RuntimeException('Document introuvable.'); }
    return ['id' => $id];
}

/** supprime et rend le document entier, avec ses versions (l'écran peut le remettre avec « ↶ Annuler ») */
function delete_textdoc(PDO $pdo, array $data): array
{
    textdoc_ready($pdo);
    $id = safe_int($data['id'] ?? 0);
    $old = textdoc_get($pdo, $id);
    $v = $pdo->prepare('SELECT label, data_json, words, created_at FROM text_document_versions WHERE doc_id=? ORDER BY id'); $v->execute([$id]);
    $old['version_rows'] = array_map(static fn($r) => ['label' => $r['label'], 'data' => json_decode((string) $r['data_json'], true), 'words' => (int) $r['words'], 'created_at' => $r['created_at']], $v->fetchAll());
    $pdo->prepare('DELETE FROM text_document_versions WHERE doc_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM text_documents WHERE id=?')->execute([$id]);
    log_change($pdo, 'meta', 0, 'delete', 'Document supprimé : ' . $old['name']);
    return ['id' => $id, 'doc' => $old];
}

/** « ↶ Annuler » après une suppression : le document revient (sous un nouveau numéro), avec ses versions */
function restore_textdoc(PDO $pdo, array $data): array
{
    textdoc_ready($pdo);
    $d = is_array($data['doc'] ?? null) ? $data['doc'] : [];
    $r = save_textdoc($pdo, ['name' => $d['name'] ?? 'Document', 'kind' => $d['kind'] ?? 'doc', 'data' => $d['data'] ?? null]);
    foreach (array_slice(is_array($d['version_rows'] ?? null) ? $d['version_rows'] : [], 0, TEXTDOC_VERSIONS_MAX) as $v) {
        if (!is_array($v)) { continue; }
        try { [$clean, $info] = textdoc_check($v['data'] ?? null); } catch (Throwable $_) { continue; }
        $pdo->prepare('INSERT INTO text_document_versions(doc_id, label, data_json, words, created_at) VALUES(?,?,?,?,?)')->execute([$r['id'], mb_substr(safe_text($v['label'] ?? ''), 0, 120), json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $info['words'], preg_match('/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(:\d\d)?$/', (string) ($v['created_at'] ?? '')) ? $v['created_at'] : date('Y-m-d H:i:s')]);
    }
    return $r;
}

function duplicate_textdoc(PDO $pdo, array $data): array
{
    textdoc_ready($pdo);
    $old = textdoc_get($pdo, safe_int($data['id'] ?? 0));
    $name = mb_substr(safe_text($data['name'] ?? '') ?: ($old['name'] . ' (copie)'), 0, 200);
    $kind = in_array($data['kind'] ?? '', ['doc', 'template'], true) ? $data['kind'] : $old['kind'];
    return save_textdoc($pdo, ['name' => $name, 'kind' => $kind, 'data' => $old['data']]);
}

/* ═════════ Versions ═════════ */
function textdoc_versions(PDO $pdo, int $docId): array
{
    textdoc_ready($pdo);
    $s = $pdo->prepare('SELECT id, label, words, created_at FROM text_document_versions WHERE doc_id=? ORDER BY id DESC'); $s->execute([$docId]);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'label' => (string) $r['label'], 'words' => (int) $r['words'], 'created_at' => $r['created_at']], $s->fetchAll());
}

function textdoc_version(PDO $pdo, int $id): array
{
    textdoc_ready($pdo);
    $s = $pdo->prepare('SELECT * FROM text_document_versions WHERE id=?'); $s->execute([$id]); $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Version introuvable.'); }
    return ['id' => (int) $r['id'], 'doc_id' => (int) $r['doc_id'], 'label' => (string) $r['label'], 'words' => (int) $r['words'], 'created_at' => $r['created_at'], 'data' => json_decode((string) $r['data_json'], true) ?: new stdClass()];
}

function save_textdoc_version(PDO $pdo, array $data): array
{
    textdoc_ready($pdo);
    $docId = safe_int($data['doc_id'] ?? 0);
    $e = $pdo->prepare('SELECT count(*) FROM text_documents WHERE id=?'); $e->execute([$docId]);
    if (!(int) $e->fetchColumn()) { throw new RuntimeException('Document introuvable : enregistre-le d’abord.'); }
    [$clean, $info] = textdoc_check($data['data'] ?? null);
    $json = json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    if ($json === false || strlen($json) > TEXTDOC_MAX) { throw new LcndaBadInput('Version trop lourde.'); }
    $label = mb_substr(safe_text($data['label'] ?? ''), 0, 120) ?: ('Version du ' . date('d/m/Y à H:i'));
    $pdo->prepare('INSERT INTO text_document_versions(doc_id, label, data_json, words) VALUES(?,?,?,?)')->execute([$docId, $label, $json, $info['words']]);
    $vid = (int) $pdo->lastInsertId();
    // pas plus de TEXTDOC_VERSIONS_MAX versions : les plus anciennes partent
    $pdo->prepare('DELETE FROM text_document_versions WHERE doc_id=? AND id NOT IN (SELECT id FROM text_document_versions WHERE doc_id=? ORDER BY id DESC LIMIT ' . TEXTDOC_VERSIONS_MAX . ')')->execute([$docId, $docId]);
    return ['id' => $vid, 'label' => $label];
}

function delete_textdoc_version(PDO $pdo, array $data): array
{
    textdoc_ready($pdo);
    $old = textdoc_version($pdo, safe_int($data['id'] ?? 0));
    $pdo->prepare('DELETE FROM text_document_versions WHERE id=?')->execute([$old['id']]);
    return ['id' => $old['id'], 'version' => $old];
}

function restore_textdoc_version(PDO $pdo, array $data): array
{
    textdoc_ready($pdo);
    $v = is_array($data['version'] ?? null) ? $data['version'] : [];
    return save_textdoc_version($pdo, ['doc_id' => $v['doc_id'] ?? 0, 'label' => $v['label'] ?? '', 'data' => $v['data'] ?? null]);
}

/* ═════════ Les personnes citées : nom, naissance, décès (champs tenus à jour) et un petit arbre ═════════ */
/** ids → {id: {name, first, last, gender, birth, birth_place, death, death_place, by, dy, father, mother}} */
function textdoc_people(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($i) => $i > 0)));
    $ids = array_slice($ids, 0, 400);
    if (!$ids) { return []; }
    $in = implode(',', array_fill(0, count($ids), '?'));
    $ev = static fn(string $tag) => "(SELECT e.id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='{$tag}' ORDER BY e.id LIMIT 1)";
    $s = $pdo->prepare("SELECT p.id, p.first_name, p.middle_name, p.last_name, p.gender, {$ev('BIRT')} AS b, {$ev('DEAT')} AS d,
        (SELECT f.partner1_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=p.id ORDER BY fc.id LIMIT 1) AS p1,
        (SELECT f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=p.id ORDER BY fc.id LIMIT 1) AS p2
        FROM persons p WHERE p.id IN ($in)");
    $s->execute($ids);
    $rows = $s->fetchAll(PDO::FETCH_ASSOC);
    $eids = array_values(array_filter(array_merge(array_column($rows, 'b'), array_column($rows, 'd'))));
    $events = [];
    if ($eids) {
        $e = $pdo->prepare('SELECT e.id, e.date_text, e.year, pl.name AS place FROM events e LEFT JOIN places pl ON pl.id=e.place_id WHERE e.id IN (' . implode(',', array_fill(0, count($eids), '?')) . ')');
        $e->execute(array_map('intval', $eids));
        foreach ($e->fetchAll(PDO::FETCH_ASSOC) as $x) { $events[(int) $x['id']] = $x; }
    }
    $gender = [];
    foreach ($rows as $r) { $gender[(int) $r['id']] = $r['gender']; }
    $out = [];
    foreach ($rows as $r) {
        $b = $events[(int) $r['b']] ?? null; $d = $events[(int) $r['d']] ?? null;
        $first = trim(((string) $r['first_name']) . ' ' . ((string) ($r['middle_name'] ?? '')));
        $last = trim((string) $r['last_name']);
        // le père et la mère : partner1 / partner2, rangés selon le genre quand on le connaît
        $p1 = (int) $r['p1']; $p2 = (int) $r['p2'];
        $out[(string) (int) $r['id']] = ['id' => (int) $r['id'], 'name' => trim($first . ' ' . mb_strtoupper($last)) ?: 'Personne sans nom', 'first' => $first, 'last' => $last, 'gender' => (string) $r['gender'],
            'birth' => trim((string) ($b['date_text'] ?? '')), 'birth_place' => trim((string) ($b['place'] ?? '')), 'death' => trim((string) ($d['date_text'] ?? '')), 'death_place' => trim((string) ($d['place'] ?? '')),
            'by' => $b['year'] ?? null, 'dy' => $d['year'] ?? null, 'parents' => array_values(array_filter([$p1, $p2]))];
    }
    return $out;
}

/** 📨 publipostage : pour chaque personne, tout ce qu'un champ de fusion peut écrire (nom, naissance, décès, métier, parents, conjoint, mariage) */
function textdoc_merge_people(PDO $pdo, array $ids): array
{
    $base = textdoc_people($pdo, $ids); if (!$base) { return []; }
    $all = array_map('intval', array_keys($base));
    $parentIds = []; foreach ($base as $p) { foreach ($p['parents'] as $x) { $parentIds[] = (int) $x; } }
    $in = implode(',', array_fill(0, count($all), '?'));
    $occ = [];
    $cols = array_flip(array_column($pdo->query('PRAGMA table_info(persons)')->fetchAll(PDO::FETCH_ASSOC), 'name'));
    if (isset($cols['occupation'])) { $s = $pdo->prepare("SELECT id, occupation FROM persons WHERE id IN ($in)"); $s->execute($all); foreach ($s as $r) { $occ[(int) $r['id']] = trim((string) $r['occupation']); } }
    $s = $pdo->prepare("SELECT e.person_id, COALESCE(NULLIF(e.title,''), e.description) AS t FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='OCCU' AND e.person_id IN ($in) ORDER BY COALESCE(e.year, 9999), e.id");
    $s->execute($all); foreach ($s as $r) { $k = (int) $r['person_id']; if (($occ[$k] ?? '') === '') { $occ[$k] = trim((string) $r['t']); } }
    // conjoint et mariage : la première union de la personne
    $sp = [];
    $s = $pdo->prepare("SELECT f.id, f.partner1_id, f.partner2_id FROM families f WHERE f.partner1_id IN ($in) OR f.partner2_id IN ($in) ORDER BY f.id");
    $s->execute(array_merge($all, $all));
    foreach ($s as $f) { foreach ([['partner1_id', 'partner2_id'], ['partner2_id', 'partner1_id']] as [$a, $b]) { $me = (int) $f[$a]; if (in_array($me, $all, true) && !isset($sp[$me])) { $sp[$me] = ['fid' => (int) $f['id'], 'other' => (int) $f[$b]]; } } }
    $others = array_values(array_filter(array_map(static fn($x) => $x['other'], $sp)));
    $names = textdoc_people($pdo, array_merge($parentIds, $others));
    $marr = [];
    if ($sp) {
        $fids = array_values(array_unique(array_map(static fn($x) => $x['fid'], $sp)));
        $s = $pdo->prepare('SELECT e.family_id, e.date_text, pl.name AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE t.gedcom_tag=\'MARR\' AND e.family_id IN (' . implode(',', array_fill(0, count($fids), '?')) . ') ORDER BY e.id');
        $s->execute($fids); foreach ($s as $r) { $k = (int) $r['family_id']; if (!isset($marr[$k])) { $marr[$k] = ['date' => trim((string) $r['date_text']), 'place' => trim((string) $r['place'])]; } }
    }
    $out = [];
    foreach ($base as $k => $p) {
        $father = ''; $mother = '';
        foreach ($p['parents'] as $x) { $q = $names[(string) $x] ?? null; if (!$q) { continue; } if ($q['gender'] === 'female' && $mother === '') { $mother = $q['name']; } elseif ($father === '') { $father = $q['name']; } else { $mother = $q['name']; } }
        $u = $sp[(int) $k] ?? null; $m = $u ? ($marr[$u['fid']] ?? null) : null;
        $age = ($p['by'] && $p['dy']) ? max(0, (int) $p['dy'] - (int) $p['by']) : null;
        $out[$k] = $p + ['occupation' => $occ[(int) $k] ?? '', 'father' => $father, 'mother' => $mother, 'spouse' => $u && $u['other'] ? ($names[(string) $u['other']]['name'] ?? '') : '',
            'marriage' => $m['date'] ?? '', 'marriage_place' => $m['place'] ?? '', 'age' => $age];
    }
    return $out;
}

/** un petit arbre : la personne et ses ancêtres sur N générations (2 à 4) */
function textdoc_tree(PDO $pdo, int $root, int $gens): array
{
    $gens = max(2, min(4, $gens));
    $all = []; $level = [$root]; $sosa = [$root => 1];
    for ($g = 0; $g < $gens && $level; $g++) {
        $got = textdoc_people($pdo, $level);
        $next = [];
        foreach ($level as $pid) {
            $p = $got[(string) $pid] ?? null; if (!$p) { continue; }
            $n = $sosa[$pid];
            $p['sosa'] = $n; $all[] = $p;
            if ($g + 1 < $gens) {
                // le père (2n) puis la mère (2n+1) quand on sait qui est qui
                $par = textdoc_people($pdo, $p['parents']);
                $f = null; $m = null;
                foreach ($par as $q) { if ($q['gender'] === 'male' && !$f) { $f = $q['id']; } elseif ($q['gender'] === 'female' && !$m) { $m = $q['id']; } }
                foreach ($par as $q) { if (!$f && $q['id'] !== $m) { $f = $q['id']; } elseif (!$m && $q['id'] !== $f) { $m = $q['id']; } }
                if ($f && !isset($sosa[$f])) { $sosa[$f] = 2 * $n; $next[] = $f; }
                if ($m && !isset($sosa[$m])) { $sosa[$m] = 2 * $n + 1; $next[] = $m; }
            }
        }
        $level = $next;
    }
    return ['root' => $root, 'generations' => $gens, 'people' => $all];
}

/* ═════════ « Ranger une copie dans les médias » : le fichier .docx (ou .odt) devient un document des médias ═════════ */
function textdoc_to_media(PDO $pdo, array $data): array
{
    $fmt = in_array($data['format'] ?? '', ['docx', 'odt'], true) ? $data['format'] : 'docx';
    $b64 = is_string($data['file'] ?? null) ? $data['file'] : '';
    if ($b64 === '' || strlen($b64) > 40000000 || !preg_match('#^[A-Za-z0-9+/=]+$#', $b64)) { throw new LcndaBadInput('Fichier manquant ou trop lourd (plus de 30 Mo).'); }
    $bytes = base64_decode($b64, true);
    if ($bytes === false || !str_starts_with($bytes, "PK\x03\x04")) { throw new LcndaBadInput('Ce n’est pas un fichier ' . strtoupper($fmt) . '.'); }
    $title = mb_substr(safe_text($data['title'] ?? ''), 0, 300) ?: 'Document';
    $name = bin2hex(random_bytes(16)) . '.' . $fmt;
    if (@file_put_contents(MEDIA_DIR . '/' . $name, $bytes) === false) { throw new RuntimeException('Impossible de ranger le fichier dans les médias.'); }
    // la vignette : la première page en image (si elle est venue)
    $thumb = '';
    $t = is_string($data['thumb'] ?? null) ? $data['thumb'] : '';
    if ($t !== '' && strlen($t) < 4000000 && preg_match('#^data:image/png;base64,([A-Za-z0-9+/=]+)$#', $t, $m)) {
        $png = base64_decode($m[1], true);
        if ($png !== false && str_starts_with($png, "\x89PNG")) { $thumb = bin2hex(random_bytes(16)) . '.png'; if (@file_put_contents(MEDIA_DIR . '/' . $thumb, $png) === false) { $thumb = ''; } }
    }
    try {
        $pdo->prepare('INSERT INTO media(title, media_type, filename, thumbnail, description) VALUES(?, ?, ?, ?, ?)')->execute([$title, 'document', $name, $thumb, 'Copie d’un document du traitement de texte (' . strtoupper($fmt) . ')']);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'media', $id, 'create', 'Copie du document « ' . $title . ' » rangée dans les médias');
    } catch (Throwable $e) { @unlink(MEDIA_DIR . '/' . $name); if ($thumb) { @unlink(MEDIA_DIR . '/' . $thumb); } throw $e; }
    return ['media_id' => $id, 'filename' => $name];
}

/* ═════════ Le menu de choix unique (lib/picker.php) : 🧾 classeurs et 📝 documents ═════════ */
function picker_workbooks(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!picker_table_exists($pdo, 'workbooks')) { return ['total' => 0, 'items' => []]; }
    $params = [];
    $where = picker_text_where(['w.name'], $q, $params);
    [$total, $rows] = picker_page($pdo, 'SELECT w.id, w.name, w.info_json, w.updated_at', "FROM workbooks w WHERE w.kind='book' AND {$where}", 'w.updated_at DESC, w.id DESC', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static function ($r) {
        $i = json_decode((string) $r['info_json'], true) ?: [];
        return ['kind' => 'workbook', 'id' => (int) $r['id'], 'title' => trim((string) $r['name']) ?: 'Sans titre', 'meta' => implode(' · ', array_filter([picker_plural((int) ($i['sheets'] ?? 1), 'feuille'), picker_plural((int) ($i['rows'] ?? 0), 'ligne')])),
            'badge' => '', 'badge_style' => '', 'group' => 'workbook', 'icon' => '🧾', 'short' => picker_plural((int) ($i['sheets'] ?? 1), 'feuille')];
    }, $rows)];
}

function picker_textdocs(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!picker_table_exists($pdo, 'text_documents')) { return ['total' => 0, 'items' => []]; }
    $params = [];
    $where = picker_text_where(['d.name'], $q, $params);
    [$total, $rows] = picker_page($pdo, 'SELECT d.id, d.name, d.info_json', "FROM text_documents d WHERE d.kind='doc' AND {$where}", 'd.updated_at DESC, d.id DESC', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static function ($r) {
        $i = json_decode((string) $r['info_json'], true) ?: [];
        return ['kind' => 'textdoc', 'id' => (int) $r['id'], 'title' => trim((string) $r['name']) ?: 'Sans titre', 'meta' => implode(' · ', array_filter([picker_plural((int) ($i['words'] ?? 0), 'mot'), mb_substr((string) ($i['preview'] ?? ''), 0, 60)])),
            'badge' => '', 'badge_style' => '', 'group' => 'textdoc', 'icon' => '📝', 'short' => picker_plural((int) ($i['pages'] ?? 1), 'page')];
    }, $rows)];
}
