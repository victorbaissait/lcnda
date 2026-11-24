<?php
declare(strict_types=1);

/*
 * 📑 Le sommaire d'un recueil (maquettes docs/design/documents-lies-recueils.html partie 3 et registres-etat-fonds.html partie 4).
 * Des lignes rangées en arbre (recueil_toc) :
 *  - un CHAPITRE (kind 'chapter') : un titre, de telle page à telle page, une sorte d'acte et des années (facultatives),
 *    des sous-chapitres (autant de niveaux qu'on veut ; l'écran en montre trois) ;
 *  - un ÉLÉMENT (kind 'element') : un passage décrit sans créer de fiche, d'un endroit d'une page (haut, milieu, bas) à un endroit d'une
 *    autre (« du milieu de la page 5 au milieu de la page 7 : mariage de Louis LACOMBE et Anne MAZAUD »), avec une note.
 * « ✨ Proposer le découpage » : d'après les actes de l'Atelier (sorte, année) page par page — sur demande, jamais tout seul.
 * Les incohérences (deux chapitres qui se chevauchent au même niveau, un acte d'une autre sorte ou d'une autre année dans un chapitre)
 * sont calculées ici et montrées, jamais corrigées toutes seules. Table créée par la migration 107 (rejouable).
 * Écran : assets/js/heritage-recueil-sommaire.js. Essai : tests/test-recueil-sommaire.js.
 */

const RECUEIL_TOC_POS = ['', 'haut', 'milieu', 'bas'];

function recueil_toc_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    recueil_toc_install($pdo);
    $done = true;
}

/** migration 107 : la table (rejouable) */
function recueil_toc_install(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS recueil_toc (id INTEGER PRIMARY KEY AUTOINCREMENT, recueil_id INTEGER NOT NULL, parent_id INTEGER,
        kind TEXT NOT NULL DEFAULT 'chapter', title TEXT NOT NULL DEFAULT '', page_from INTEGER, page_to INTEGER, pos_from TEXT NOT NULL DEFAULT '',
        pos_to TEXT NOT NULL DEFAULT '', act_kind TEXT NOT NULL DEFAULT '', year_from INTEGER, year_to INTEGER, note TEXT NOT NULL DEFAULT '',
        position REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (recueil_id) REFERENCES recueils(id) ON DELETE CASCADE)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_recueil_toc ON recueil_toc(recueil_id, parent_id, position)');
}

/** les pages du recueil dans l'ordre : [page_id => numéro] */
function recueil_toc_page_nums(PDO $pdo, int $rid): array
{
    $s = $pdo->prepare('SELECT id FROM recueil_pages WHERE recueil_id=? ORDER BY position, id'); $s->execute([$rid]);
    $out = []; foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $i => $id) { $out[(int) $id] = $i + 1; }
    return $out;
}

function recueil_toc_row(array $r, array $nums): array
{
    return ['id' => (int) $r['id'], 'parent_id' => $r['parent_id'] !== null ? (int) $r['parent_id'] : 0, 'kind' => $r['kind'] === 'element' ? 'element' : 'chapter',
        'title' => (string) $r['title'], 'page_from' => (int) $r['page_from'], 'page_to' => (int) $r['page_to'],
        'from_num' => $nums[(int) $r['page_from']] ?? 0, 'to_num' => $nums[(int) $r['page_to']] ?? ($nums[(int) $r['page_from']] ?? 0),
        'pos_from' => (string) $r['pos_from'], 'pos_to' => (string) $r['pos_to'], 'act_kind' => (string) $r['act_kind'],
        'year_from' => $r['year_from'] !== null ? (int) $r['year_from'] : 0, 'year_to' => $r['year_to'] !== null ? (int) $r['year_to'] : 0,
        'note' => (string) $r['note'], 'position' => (float) $r['position']];
}

/** le sommaire : les lignes à plat, dans l'ordre de l'arbre (parent, puis ses enfants), avec leur niveau, et les incohérences */
function recueil_toc_list(PDO $pdo, int $rid): array
{
    recueil_toc_ensure($pdo);
    $nums = recueil_toc_page_nums($pdo, $rid);
    $s = $pdo->prepare('SELECT * FROM recueil_toc WHERE recueil_id=? ORDER BY position, id'); $s->execute([$rid]);
    $rows = array_map(static fn($r) => recueil_toc_row($r, $nums), $s->fetchAll(PDO::FETCH_ASSOC));
    $kids = []; foreach ($rows as $r) { $kids[$r['parent_id']][] = $r; }
    $out = [];
    $walk = static function (int $pid, int $level) use (&$walk, &$out, $kids) {
        $list = $kids[$pid] ?? [];
        // dans un même parent : par première page, puis l'ordre choisi
        usort($list, static fn($a, $b) => [$a['from_num'] ?: PHP_INT_MAX, $a['position'], $a['id']] <=> [$b['from_num'] ?: PHP_INT_MAX, $b['position'], $b['id']]);
        foreach ($list as $r) { $r['level'] = $level; $r['children'] = count($kids[$r['id']] ?? []); $out[] = $r; if ($level < 12) { $walk($r['id'], $level + 1); } }
    };
    $walk(0, 1);
    return ['items' => $out, 'warnings' => recueil_toc_warnings($pdo, $rid, $out)];
}

/** les incohérences : chevauchements au même niveau, page hors de la sorte ou des années de son chapitre */
function recueil_toc_warnings(PDO $pdo, int $rid, array $items): array
{
    $w = [];
    $by = []; foreach ($items as $r) { if ($r['kind'] === 'chapter' && $r['from_num']) { $by[$r['parent_id']][] = $r; } }
    foreach ($by as $list) {
        usort($list, static fn($a, $b) => $a['from_num'] <=> $b['from_num']);
        for ($i = 1, $n = count($list); $i < $n; $i++) {
            $a = $list[$i - 1]; $b = $list[$i];
            if ($b['from_num'] <= $a['to_num']) { $w[] = ['type' => 'overlap', 'a' => $a['id'], 'b' => $b['id'], 'a_title' => $a['title'], 'b_title' => $b['title'], 'from' => $b['from_num'], 'to' => min($a['to_num'], $b['to_num'])]; }
        }
    }
    $acts = recueil_toc_page_acts($pdo, $rid);
    foreach ($items as $r) {
        if ($r['kind'] !== 'chapter' || !$r['from_num'] || (!$r['act_kind'] && !$r['year_from'])) { continue; }
        foreach ($acts as $num => $list) {
            if ($num < $r['from_num'] || $num > $r['to_num']) { continue; }
            foreach ($list as $a) {
                if ($r['act_kind'] && $a['kind'] && $a['kind'] !== $r['act_kind'] && !recueil_toc_kind_near($a['kind'], $r['act_kind'])) {
                    $w[] = ['type' => 'kind', 'chapter' => $r['id'], 'title' => $r['title'], 'page' => $num, 'kind' => $a['kind'], 'act' => $a['title']]; continue;
                }
                $y1 = $r['year_from']; $y2 = $r['year_to'] ?: $r['year_from'];
                if ($y1 && $a['year'] && ($a['year'] < $y1 || $a['year'] > $y2)) { $w[] = ['type' => 'year', 'chapter' => $r['id'], 'title' => $r['title'], 'page' => $num, 'year' => $a['year'], 'act' => $a['title']]; }
            }
        }
    }
    return array_slice($w, 0, 60);
}

/** baptême et naissance, sépulture et décès : la même chose pour un chapitre */
function recueil_toc_kind_near(string $a, string $b): bool
{
    $g = ['naissance' => 'n', 'bapteme' => 'n', 'deces' => 'd', 'sepulture' => 'd'];
    return isset($g[$a], $g[$b]) && $g[$a] === $g[$b];
}

/** les actes de l'Atelier page par page : [numéro => [{kind, year, title}]] (photo de la page, ou une autre page du même document) */
function recueil_toc_page_acts(PDO $pdo, int $rid): array
{
    if (!function_exists('act_transcriptions_ensure')) { return []; }
    act_transcriptions_ensure($pdo);
    $nums = recueil_toc_page_nums($pdo, $rid);
    $s = $pdo->prepare("SELECT page_id, media_id FROM recueil_images WHERE recueil_id=? AND page_id IS NOT NULL AND role='page'"); $s->execute([$rid]);
    $mediaPage = []; foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $i) { $mediaPage[(int) $i['media_id']] ??= (int) $i['page_id']; }
    if (!$mediaPage) { return []; }
    $q = $pdo->query('SELECT media_id, kind, date_text, title FROM act_transcriptions WHERE media_id IN (' . implode(',', array_keys($mediaPage)) . ') ORDER BY id');
    $out = [];
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $a) {
        $num = $nums[$mediaPage[(int) $a['media_id']]] ?? 0; if (!$num) { continue; }
        $out[$num][] = ['kind' => $a['kind'] === 'apreciser' ? '' : (string) $a['kind'], 'year' => preg_match('/\b(1[0-9]{3}|20[0-9]{2})\b/', (string) $a['date_text'], $m) ? (int) $m[1] : 0, 'title' => (string) $a['title']];
    }
    ksort($out);
    return $out;
}

/** vérifie et range une ligne du sommaire */
function save_recueil_toc(PDO $pdo, array $data): array
{
    recueil_toc_ensure($pdo);
    $id = safe_int($data['id'] ?? 0);
    if ($id) { $s = $pdo->prepare('SELECT * FROM recueil_toc WHERE id=?'); $s->execute([$id]); $old = $s->fetch(PDO::FETCH_ASSOC); if (!$old) { throw new RuntimeException('Ligne du sommaire introuvable.'); } $rid = (int) $old['recueil_id']; }
    else { $rid = safe_int($data['recueil_id'] ?? 0); $old = null; }
    recueil_row($pdo, $rid);
    $nums = recueil_toc_page_nums($pdo, $rid);
    $kind = ($data['kind'] ?? ($old['kind'] ?? 'chapter')) === 'element' ? 'element' : 'chapter';
    $title = mb_substr(safe_text((string) ($data['title'] ?? ($old['title'] ?? ''))), 0, 300);
    if ($title === '') { throw new RuntimeException($kind === 'element' ? 'Décris ce passage en quelques mots.' : 'Donne un titre au chapitre.'); }
    $from = safe_int($data['page_from'] ?? ($old['page_from'] ?? 0)); $to = safe_int($data['page_to'] ?? ($old['page_to'] ?? 0)) ?: $from;
    if ($from && !isset($nums[$from])) { throw new RuntimeException('La première page n’est pas dans ce recueil.'); }
    if ($to && !isset($nums[$to])) { throw new RuntimeException('La dernière page n’est pas dans ce recueil.'); }
    if ($from && $to && $nums[$to] < $nums[$from]) { [$from, $to] = [$to, $from]; }
    if ($kind === 'element' && !$from) { throw new RuntimeException('Dis sur quelle page commence ce passage.'); }
    $parent = array_key_exists('parent_id', $data) ? safe_int($data['parent_id']) : (int) ($old['parent_id'] ?? 0);
    if ($parent) {
        $p = $pdo->prepare('SELECT recueil_id, kind FROM recueil_toc WHERE id=?'); $p->execute([$parent]); $pr = $p->fetch(PDO::FETCH_ASSOC);
        if (!$pr || (int) $pr['recueil_id'] !== $rid) { throw new RuntimeException('Le chapitre parent n’est pas dans ce recueil.'); }
        if ($pr['kind'] === 'element') { throw new RuntimeException('Un passage décrit ne peut pas contenir de chapitre : choisis un chapitre.'); }
        // pas de boucle : le parent ne doit pas être dans les descendants de cette ligne
        for ($x = $parent, $n = 0; $x && $n < 50; $n++) { if ($id && $x === $id) { throw new RuntimeException('Un chapitre ne peut pas être dans lui-même.'); } $q = $pdo->prepare('SELECT parent_id FROM recueil_toc WHERE id=?'); $q->execute([$x]); $x = (int) $q->fetchColumn(); }
    }
    $pos = static fn($v) => in_array($v, RECUEIL_TOC_POS, true) ? $v : '';
    $kinds = defined('TRANSCRIPTION_KINDS') ? TRANSCRIPTION_KINDS : [];
    $actKind = (string) ($data['act_kind'] ?? ($old['act_kind'] ?? '')); if (!in_array($actKind, $kinds, true) || $actKind === 'apreciser') { $actKind = ''; }
    $y = static fn($v) => ($n = safe_int($v ?? 0)) >= 1000 && $n <= 2100 ? $n : null;
    $y1 = $y($data['year_from'] ?? ($old['year_from'] ?? 0)); $y2 = $y($data['year_to'] ?? ($old['year_to'] ?? 0));
    if ($y1 && $y2 && $y2 < $y1) { [$y1, $y2] = [$y2, $y1]; }
    $vals = [$parent ?: null, $kind, $title, $from ?: null, $to ?: null, $pos($data['pos_from'] ?? ($old['pos_from'] ?? '')), $pos($data['pos_to'] ?? ($old['pos_to'] ?? '')),
        $actKind, $y1, $y2, mb_substr((string) ($data['note'] ?? ($old['note'] ?? '')), 0, 20000)];
    if ($id) {
        $pdo->prepare('UPDATE recueil_toc SET parent_id=?, kind=?, title=?, page_from=?, page_to=?, pos_from=?, pos_to=?, act_kind=?, year_from=?, year_to=?, note=? WHERE id=?')->execute([...$vals, $id]);
    } else {
        $m = $pdo->prepare('SELECT COALESCE(MAX(position),0)+1 FROM recueil_toc WHERE recueil_id=?'); $m->execute([$rid]);
        $pdo->prepare('INSERT INTO recueil_toc(recueil_id, parent_id, kind, title, page_from, page_to, pos_from, pos_to, act_kind, year_from, year_to, note, position) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([$rid, ...$vals, (float) $m->fetchColumn()]);
        $id = (int) $pdo->lastInsertId();
    }
    recueil_touch($pdo, $rid);
    return ['id' => $id, 'before' => $old];
}

/** supprime une ligne et tout ce qu'elle contient ; renvoie les lignes pour ↶ Annuler */
function delete_recueil_toc(PDO $pdo, array $data): array
{
    recueil_toc_ensure($pdo);
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT recueil_id FROM recueil_toc WHERE id=?'); $s->execute([$id]); $rid = (int) $s->fetchColumn();
    if (!$rid) { throw new RuntimeException('Ligne du sommaire introuvable.'); }
    $all = []; $todo = [$id];
    $one = $pdo->prepare('SELECT * FROM recueil_toc WHERE id=?'); $kids = $pdo->prepare('SELECT id FROM recueil_toc WHERE parent_id=?');
    while ($todo && count($all) < 5000) { $x = array_shift($todo); $one->execute([$x]); if ($r = $one->fetch(PDO::FETCH_ASSOC)) { $all[] = $r; } $kids->execute([$x]); foreach ($kids->fetchAll(PDO::FETCH_COLUMN) as $k) { $todo[] = (int) $k; } }
    $del = $pdo->prepare('DELETE FROM recueil_toc WHERE id=?'); foreach ($all as $r) { $del->execute([(int) $r['id']]); }
    recueil_touch($pdo, $rid);
    return ['removed' => $all, 'recueil_id' => $rid];
}

/** ↶ Annuler une suppression (ou un découpage accepté) : les lignes reviennent avec leurs numéros */
function restore_recueil_toc(PDO $pdo, array $data): array
{
    recueil_toc_ensure($pdo);
    $rows = is_array($data['rows'] ?? null) ? $data['rows'] : [];
    $rid = safe_int($data['recueil_id'] ?? 0); recueil_row($pdo, $rid);
    $ins = $pdo->prepare('INSERT OR REPLACE INTO recueil_toc(id, recueil_id, parent_id, kind, title, page_from, page_to, pos_from, pos_to, act_kind, year_from, year_to, note, position, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $n = 0;
    foreach ($rows as $r) {
        if (safe_int($r['recueil_id'] ?? 0) !== $rid) { continue; }
        $ins->execute([safe_int($r['id'] ?? 0) ?: null, $rid, safe_int($r['parent_id'] ?? 0) ?: null, ($r['kind'] ?? '') === 'element' ? 'element' : 'chapter', mb_substr(safe_text((string) ($r['title'] ?? '')), 0, 300),
            safe_int($r['page_from'] ?? 0) ?: null, safe_int($r['page_to'] ?? 0) ?: null, in_array($r['pos_from'] ?? '', RECUEIL_TOC_POS, true) ? $r['pos_from'] : '', in_array($r['pos_to'] ?? '', RECUEIL_TOC_POS, true) ? $r['pos_to'] : '',
            (string) ($r['act_kind'] ?? ''), safe_int($r['year_from'] ?? 0) ?: null, safe_int($r['year_to'] ?? 0) ?: null, mb_substr((string) ($r['note'] ?? ''), 0, 20000), (float) ($r['position'] ?? 0), (string) ($r['created_at'] ?? date('Y-m-d H:i:s'))]);
        $n++;
    }
    recueil_touch($pdo, $rid);
    return ['restored' => $n];
}

/** ↑ ↓ : échange avec la ligne voisine du même parent */
function move_recueil_toc(PDO $pdo, array $data): array
{
    recueil_toc_ensure($pdo);
    $id = safe_int($data['id'] ?? 0); $dir = safe_int($data['dir'] ?? 0) < 0 ? -1 : 1;
    $s = $pdo->prepare('SELECT recueil_id, parent_id FROM recueil_toc WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException('Ligne du sommaire introuvable.'); }
    $list = recueil_toc_list($pdo, (int) $r['recueil_id'])['items'];
    $sib = array_values(array_filter($list, static fn($x) => $x['parent_id'] === (int) $r['parent_id']));
    $i = array_search($id, array_column($sib, 'id'), true); $j = $i === false ? false : $i + $dir;
    if ($j === false || !isset($sib[$j])) { return ['moved' => false]; }
    // l'ordre suit la première page : échanger deux lignes qui commencent à des pages différentes ne change rien, on le dit
    if ($sib[$i]['from_num'] !== $sib[$j]['from_num']) { throw new RuntimeException('Le sommaire suit l’ordre des pages : change plutôt les pages de ce chapitre.'); }
    $u = $pdo->prepare('UPDATE recueil_toc SET position=? WHERE id=?');
    $u->execute([$sib[$j]['position'], $sib[$i]['id']]); $u->execute([$sib[$i]['position'] === $sib[$j]['position'] ? $sib[$i]['position'] + $dir * 0.5 : $sib[$i]['position'], $sib[$j]['id']]);
    return ['moved' => true];
}

/**
 * ✨ Proposer le découpage : d'après les actes de l'Atelier page par page (année, puis sorte), des chapitres « Année 1789 » et dessous
 * « Baptêmes 1789 » (pages qui se suivent). Rien n'est écrit : l'écran montre la proposition, on accepte (recueil_toc_accept).
 */
function recueil_toc_propose(PDO $pdo, int $rid): array
{
    recueil_row($pdo, $rid);
    $acts = recueil_toc_page_acts($pdo, $rid);
    $ids = array_flip(recueil_toc_page_nums($pdo, $rid)); // numéro → page
    $label = ['naissance' => 'Naissances', 'bapteme' => 'Baptêmes', 'mariage' => 'Mariages', 'deces' => 'Décès', 'sepulture' => 'Sépultures', 'notarial' => 'Actes notariés',
        'notoriete' => 'Actes de notoriété', 'recensement' => 'Recensements', 'militaire' => 'Documents militaires', 'lettre' => 'Lettres', 'autre' => 'Autres actes'];
    // une page = son année et sa sorte (la plus fréquente)
    $page = [];
    foreach ($acts as $num => $list) {
        $ys = array_filter(array_column($list, 'year')); $ks = array_filter(array_column($list, 'kind'));
        $y = $ys ? (int) array_search(max(array_count_values($ys)), array_count_values($ys), true) : 0;
        $k = $ks ? (string) array_search(max(array_count_values($ks)), array_count_values($ks), true) : '';
        if ($y || $k) { $page[$num] = ['y' => $y, 'k' => $k]; }
    }
    if (!$page) { return ['chapters' => [], 'reason' => 'Pas encore d’acte repéré dans l’Atelier sur les pages de ce recueil : transcris quelques pages, puis réessaie.']; }
    // les années (pages sans acte : avec la précédente), puis les sortes dans chaque année
    $out = []; $cur = null;
    foreach ($page as $num => $x) {
        $y = $x['y'];
        if ($cur && ($y === $cur['year'] || !$y)) { $cur['to'] = $num; $cur['pages'][$num] = $x; continue; }
        if ($cur) { $out[] = $cur; }
        $cur = ['year' => $y, 'from' => $num, 'to' => $num, 'pages' => [$num => $x]];
    }
    if ($cur) { $out[] = $cur; }
    $chapters = [];
    foreach ($out as $c) {
        $kids = []; $k = null;
        foreach ($c['pages'] as $num => $x) {
            $kk = $x['k'] ?: ($k['kind'] ?? '');
            if ($k && $kk === $k['kind']) { $k['to'] = $num; continue; }
            if ($k) { $kids[] = $k; }
            $k = ['kind' => $kk, 'from' => $num, 'to' => $num];
        }
        if ($k) { $kids[] = $k; }
        $chapter = ['title' => $c['year'] ? 'Année ' . $c['year'] : 'Sans année', 'year' => $c['year'], 'from_num' => $c['from'], 'to_num' => $c['to'], 'page_from' => $ids[$c['from']] ?? 0, 'page_to' => $ids[$c['to']] ?? 0, 'children' => []];
        foreach ($kids as $k) {
            if (!$k['kind']) { continue; }
            $chapter['children'][] = ['title' => ($label[$k['kind']] ?? $k['kind']) . ($c['year'] ? ' ' . $c['year'] : ''), 'act_kind' => $k['kind'], 'year' => $c['year'], 'from_num' => $k['from'], 'to_num' => $k['to'], 'page_from' => $ids[$k['from']] ?? 0, 'page_to' => $ids[$k['to']] ?? 0];
        }
        // une seule sorte dans l'année : pas de sous-chapitre, la sorte va sur le chapitre
        if (count($chapter['children']) === 1) { $chapter['act_kind'] = $chapter['children'][0]['act_kind']; $chapter['title'] = $chapter['children'][0]['title']; $chapter['children'] = []; }
        $chapters[] = $chapter;
    }
    return ['chapters' => $chapters, 'reason' => ''];
}

/** accepte une proposition (ce que l'écran renvoie, éventuellement corrigé) : crée les chapitres ; renvoie leurs numéros pour ↶ Annuler */
function recueil_toc_accept(PDO $pdo, array $data): array
{
    $rid = safe_int($data['recueil_id'] ?? 0); recueil_row($pdo, $rid);
    $list = is_array($data['chapters'] ?? null) ? array_slice($data['chapters'], 0, 300) : [];
    $made = [];
    $parent = safe_int($data['parent_id'] ?? 0);
    foreach ($list as $c) {
        if (!is_array($c) || empty($c['title'])) { continue; }
        $id = save_recueil_toc($pdo, ['recueil_id' => $rid, 'parent_id' => $parent, 'kind' => 'chapter', 'title' => $c['title'], 'page_from' => $c['page_from'] ?? 0, 'page_to' => $c['page_to'] ?? 0,
            'act_kind' => $c['act_kind'] ?? '', 'year_from' => $c['year'] ?? 0, 'year_to' => $c['year'] ?? 0])['id'];
        $made[] = $id;
        foreach (array_slice(is_array($c['children'] ?? null) ? $c['children'] : [], 0, 100) as $k) {
            if (!is_array($k) || empty($k['title'])) { continue; }
            $made[] = save_recueil_toc($pdo, ['recueil_id' => $rid, 'parent_id' => $id, 'kind' => 'chapter', 'title' => $k['title'], 'page_from' => $k['page_from'] ?? 0, 'page_to' => $k['page_to'] ?? 0,
                'act_kind' => $k['act_kind'] ?? '', 'year_from' => $k['year'] ?? 0, 'year_to' => $k['year'] ?? 0])['id'];
        }
    }
    return ['ids' => $made];
}

/** ↶ Annuler un découpage accepté : les lignes créées partent (avec ce qu'on a mis dedans depuis) */
function recueil_toc_remove(PDO $pdo, array $data): array
{
    $rid = safe_int($data['recueil_id'] ?? 0); recueil_row($pdo, $rid);
    $n = 0;
    foreach (array_map('intval', is_array($data['ids'] ?? null) ? $data['ids'] : []) as $id) {
        $s = $pdo->prepare('SELECT recueil_id FROM recueil_toc WHERE id=?'); $s->execute([$id]);
        if ((int) $s->fetchColumn() === $rid) { $n += count(delete_recueil_toc($pdo, ['id' => $id])['removed']); }
    }
    return ['removed' => $n];
}

/** les chapitres où est une page (du plus large au plus précis) : « Année 1789 › Baptêmes 1789 » */
function recueil_toc_path(PDO $pdo, int $rid, int $num): array
{
    $items = recueil_toc_list($pdo, $rid)['items']; $path = [];
    foreach ($items as $r) { if ($r['kind'] === 'chapter' && $r['from_num'] && $num >= $r['from_num'] && $num <= $r['to_num']) { $path[] = ['id' => $r['id'], 'title' => $r['title'], 'level' => $r['level']]; } }
    usort($path, static fn($a, $b) => $a['level'] <=> $b['level']);
    return $path;
}

/**
 * 🗃 Ranger une liasse : {recueil_id, by: date|kind|cote} → le nouvel ordre des pages, et l'ancien pour ↶ Annuler.
 * date : la date de l'acte de l'Atelier, sinon celle du document (les pages sans date à la fin) ; kind : la sorte d'acte ; cote : la cote du document.
 */
function recueil_reorder(PDO $pdo, array $data): array
{
    $rid = safe_int($data['recueil_id'] ?? 0); recueil_row($pdo, $rid);
    $s = $pdo->prepare('SELECT id FROM recueil_pages WHERE recueil_id=? ORDER BY position, id'); $s->execute([$rid]);
    $before = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
    if (isset($data['order']) && is_array($data['order'])) { // ↶ Annuler : l'ordre donné
        $order = array_values(array_filter(array_map('intval', $data['order']), static fn($x) => in_array($x, $before, true)));
        $order = array_merge($order, array_values(array_diff($before, $order)));
    } else {
        $by = in_array($data['by'] ?? '', ['date', 'kind', 'cote'], true) ? $data['by'] : 'date';
        $info = [];
        $q = $pdo->prepare("SELECT i.page_id, m.id AS media_id, COALESCE(m.date_text,'') AS d, COALESCE(m.document_reference,'') AS cote FROM recueil_images i JOIN media m ON m.id=i.media_id WHERE i.recueil_id=? AND i.page_id IS NOT NULL AND i.role='page' ORDER BY i.id");
        $q->execute([$rid]);
        foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) { $info[(int) $r['page_id']] ??= $r; }
        $acts = [];
        if (function_exists('act_transcriptions_ensure') && $info) {
            act_transcriptions_ensure($pdo);
            $a = $pdo->query('SELECT media_id, kind, date_text FROM act_transcriptions WHERE media_id IN (' . implode(',', array_map(static fn($r) => (int) $r['media_id'], $info)) . ') ORDER BY id');
            foreach ($a->fetchAll(PDO::FETCH_ASSOC) as $x) { $acts[(int) $x['media_id']] ??= $x; }
        }
        $key = static function (int $pid) use ($info, $acts, $by) {
            $r = $info[$pid] ?? null; $act = $r ? ($acts[(int) $r['media_id']] ?? null) : null;
            if ($by === 'kind') { $k = $act ? (string) $act['kind'] : ''; return [$k === '' || $k === 'apreciser' ? 1 : 0, $k]; }
            $d = (string) ($act['date_text'] ?? '') ?: (string) ($r['d'] ?? '');
            $c = $d !== '' && function_exists('cal_parse_date') ? cal_parse_date($d) : null; // « 3 mars 1870 » → 1870-03-03 ; sinon l'année seule
            $sort = $c ? sprintf('%04d-%02d-%02d', $c[0], $c[1] ?? 0, $c[2] ?? 0) : (preg_match('/\b(1[0-9]{3}|20[0-9]{2})\b/', $d, $m) ? $m[1] . '-00-00' : '');
            return [$sort === '' || $sort === null ? 1 : 0, (string) $sort];
        };
        $order = $before; $pos = array_flip($before);
        if ($by === 'cote') { // « GR 2 C 12/2 » avant « GR 2 C 12/10 » : l'ordre naturel ; sans cote à la fin
            $cote = static fn($pid) => (string) ($info[$pid]['cote'] ?? '');
            usort($order, static fn($a, $b) => (($cote($a) === '') <=> ($cote($b) === '')) ?: strnatcasecmp($cote($a), $cote($b)) ?: $pos[$a] <=> $pos[$b]);
        } else { usort($order, static fn($a, $b) => [$key($a), $pos[$a]] <=> [$key($b), $pos[$b]]); }
    }
    $u = $pdo->prepare('UPDATE recueil_pages SET position=? WHERE id=?');
    foreach ($order as $i => $pid) { $u->execute([$i + 1, $pid]); }
    recueil_touch($pdo, $rid);
    return ['before' => $before, 'order' => $order];
}

/** une page supprimée : les lignes du sommaire qui commencent ou finissent sur elle se resserrent sur les pages voisines */
function recueil_toc_forget_page(PDO $pdo, int $pageId): void
{
    recueil_toc_ensure($pdo);
    $s = $pdo->prepare('SELECT recueil_id FROM recueil_pages WHERE id=?'); $s->execute([$pageId]); $rid = (int) $s->fetchColumn(); if (!$rid) { return; }
    $ids = array_keys(recueil_toc_page_nums($pdo, $rid)); $i = array_search($pageId, $ids, true); if ($i === false) { return; }
    $next = $ids[$i + 1] ?? null; $prev = $i > 0 ? $ids[$i - 1] : null;
    $rows = $pdo->prepare('SELECT id, page_from, page_to FROM recueil_toc WHERE recueil_id=? AND (page_from=? OR page_to=?)'); $rows->execute([$rid, $pageId, $pageId]);
    $nums = array_flip($ids);
    $u = $pdo->prepare('UPDATE recueil_toc SET page_from=?, page_to=? WHERE id=?');
    foreach ($rows->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $from = (int) $r['page_from']; $to = (int) ($r['page_to'] ?: $r['page_from']);
        if ($from === $pageId && $to === $pageId) { $u->execute([null, null, (int) $r['id']]); continue; }
        if ($from === $pageId) { $from = $next; }
        if ($to === $pageId) { $to = $prev; }
        if ($from && $to && ($nums[$to] ?? 0) < ($nums[$from] ?? 0)) { $from = $to = null; }
        $u->execute([$from, $to, (int) $r['id']]);
    }
}
