<?php
declare(strict_types=1);

/**
 * 🛠️ Fiche d'un métier ancien : ce que faisait un « tisserand » ou un « sabotier », ses outils et ses mots anciens,
 * les ancêtres qui l'exerçaient (liste, carte, frise) et les images de la base qui en parlent.
 *
 * - assets/data/metiers-anciens.json : le dictionnaire livré (plus de 500 métiers, variantes d'orthographe, domaines,
 *   outils, mots anciens), CC BY-SA 4.0, sources dans le fichier (Littré, Wiktionnaire, Wikipédia, arrêté des métiers d'art).
 * - Les métiers des fiches viennent des 3 mêmes endroits que Listes → Métiers (occupation_list_rows) : la fiche
 *   (persons.occupation), les événements « Profession » et les recensements.
 * - old_trade_notes (structure n°50) : ce que tu ajoutes à la fiche du métier (texte, images, Fiche 📒 reliée).
 * - Écrans : assets/js/heritage-metiers-anciens.js (fenêtre de la fiche, Listes → « 🛠️ Métiers anciens »).
 */

function trade_fold(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'œ' => 'oe', 'æ' => 'ae', '’' => "'", 'ſ' => 's']);
    return trim(preg_replace('/[^a-z0-9]+/', ' ', $s));
}

function trades_dict(): array
{
    static $d = null;
    if ($d !== null) { return $d; }
    $f = APP_ROOT . '/assets/data/metiers-anciens.json';
    $doc = is_file($f) ? (json_decode((string) file_get_contents($f), true) ?: []) : [];
    $doc += ['trades' => [], 'domains' => []];
    $byKey = []; $ix = [];
    foreach ($doc['trades'] as $t) {
        $byKey[$t['key']] = $t;
        foreach (array_merge([$t['name']], isset($t['fem']) ? [$t['fem']] : [], $t['variants'] ?? []) as $i => $n) {
            $k = trade_fold($n); if ($k === '') { continue; }
            if (!isset($ix[$k]) || $i === 0) { $ix[$k] = $t['key']; } // le nom principal passe devant une variante
        }
    }
    return $d = ['doc' => $doc, 'by' => $byKey, 'ix' => $ix];
}

/** Le métier du dictionnaire qui correspond à un texte (« Tisserand en toile », « maître cordonnier », « laboureur et vigneron ») */
function trade_match(string $text): ?string
{
    $D = trades_dict();
    $f = trade_fold($text);
    if ($f === '') { return null; }
    $try = static function (string $s) use ($D): ?string {
        if (isset($D['ix'][$s])) { return $D['ix'][$s]; }
        $sing = preg_replace('/(?<=[a-z])[sx]\b/', '', $s); // pluriel
        return $D['ix'][$sing] ?? null;
    };
    if ($k = $try($f)) { return $k; }
    $g = trim(preg_replace('/^(maitre|maistre|mtre|me|compagnon|apprenti|garcon|aide|ouvrier|ancien|ex|veuve de|veuf de|fils de|fille de|femme de)\s+/', '', $f));
    if ($g !== $f && ($k = $try($g))) { return $k; }
    // le plus long nom connu présent en mots entiers
    $words = explode(' ', $g); $n = count($words);
    for ($len = min(5, $n); $len >= 1; $len--) {
        for ($i = 0; $i + $len <= $n; $i++) {
            $part = implode(' ', array_slice($words, $i, $len));
            if (strlen($part) < 4) { continue; }
            if ($k = $try($part)) { return $k; }
        }
    }
    return null;
}

/** Tous les métiers notés dans la base : [texte du métier => [person_id => [années…]]] */
function trade_occupations(PDO $pdo): array
{
    $rows = $pdo->query("
        SELECT p.id AS person_id, p.occupation AS val, NULL AS year FROM persons p WHERE p.occupation IS NOT NULL AND TRIM(p.occupation)!=''
        UNION ALL
        SELECT e.person_id, COALESCE(NULLIF(TRIM(e.title),''), NULLIF(TRIM(e.description),'')) AS val, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id
        WHERE e.person_id IS NOT NULL AND (t.gedcom_tag='OCCU' OR LOWER(t.label) LIKE '%profes%' OR LOWER(t.label) LIKE '%m%tier%' OR LOWER(t.label) LIKE '%activit%')
          AND COALESCE(NULLIF(TRIM(e.title),''), NULLIF(TRIM(e.description),'')) IS NOT NULL
        UNION ALL
        SELECT cm.person_id, cm.occupation AS val, cr.year FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id
        WHERE cm.person_id IS NOT NULL AND cm.occupation IS NOT NULL AND TRIM(cm.occupation)!=''")->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    foreach ($rows as $r) {
        $v = trim((string) $r['val']); if ($v === '') { continue; }
        $out[$v][(int) $r['person_id']][] = $r['year'] ? (int) $r['year'] : null;
    }
    return $out;
}

/** La clé d'une fiche : le métier du dictionnaire, sinon « perso-… » (un métier qu'il ne connaît pas) */
function trade_key_for(string $text): string
{
    return trade_match($text) ?? ('perso-' . substr(str_replace(' ', '-', trade_fold($text)), 0, 80));
}

/** GET old_trade : la fiche d'un métier (key, ou text = le métier tel qu'il est écrit sur la fiche) */
function trade_sheet(PDO $pdo, array $q): array
{
    $D = trades_dict();
    $key = trim((string) ($q['key'] ?? ''));
    $text = mb_substr(trim((string) ($q['text'] ?? '')), 0, 120);
    if ($key === '' && $text !== '') { $key = trade_key_for($text); }
    if (!preg_match('/^[a-z0-9-]{2,90}$/', $key)) { throw new RuntimeException('Métier introuvable.'); }
    $t = $D['by'][$key] ?? null;
    $own = str_starts_with($key, 'perso-');
    if (!$t && !$own) { throw new RuntimeException('Métier introuvable.'); }
    $name = $t['name'] ?? ($text !== '' ? mb_strtoupper(mb_substr($text, 0, 1)) . mb_substr($text, 1) : str_replace('-', ' ', substr($key, 6)));
    // les ancêtres qui l'exerçaient
    $people = []; $written = [];
    foreach (trade_occupations($pdo) as $val => $who) {
        if (trade_key_for($val) !== $key) { continue; }
        $written[$val] = count($who);
        foreach ($who as $pid => $years) { $people[$pid]['years'] = array_merge($people[$pid]['years'] ?? [], array_filter($years)); $people[$pid]['as'][$val] = true; }
    }
    $list = []; $points = [];
    if ($people) {
        $ids = array_keys($people); $marks = implode(',', array_fill(0, count($ids), '?'));
        $s = $pdo->prepare("SELECT p.id, p.first_name, p.last_name, p.gender, p.living_status, m.thumbnail AS pt, m.filename AS pf,
                (SELECT MIN(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM')) AS birth_year,
                (SELECT MIN(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI')) AS death_year
            FROM persons p LEFT JOIN media m ON m.id=p.portrait_media_id WHERE p.id IN ($marks)");
        $s->execute($ids);
        $pl = $pdo->prepare("SELECT pl.name, pl.latitude, pl.longitude, e.year FROM events e JOIN places pl ON pl.id=e.place_id
            WHERE e.person_id=? AND pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL ORDER BY (SELECT gedcom_tag FROM event_types WHERE id=e.event_type_id)='OCCU' DESC, e.year LIMIT 1");
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $pid = (int) $r['id']; $yrs = $people[$pid]['years'] ?? [];
            $pl->execute([$pid]); $where = $pl->fetch(PDO::FETCH_ASSOC) ?: null;
            $row = ['id' => $pid, 'first_name' => (string) $r['first_name'], 'last_name' => (string) $r['last_name'], 'gender' => (string) $r['gender'],
                'birth_year' => $r['birth_year'] ? (int) $r['birth_year'] : null, 'death_year' => $r['death_year'] ? (int) $r['death_year'] : null,
                'job_from' => $yrs ? min($yrs) : null, 'job_to' => $yrs ? max($yrs) : null, 'as' => array_keys($people[$pid]['as'] ?? []),
                'photo' => $r['pt'] ? 'media/' . rawurlencode((string) $r['pt']) : ($r['pf'] ? 'media/' . rawurlencode((string) $r['pf']) : ''),
                'place' => $where['name'] ?? ''];
            $list[] = $row;
            if ($where) { $points[] = ['lat' => (float) $where['latitude'], 'lon' => (float) $where['longitude'], 'label' => trim($r['first_name'] . ' ' . $r['last_name']) . ' — ' . $where['name'], 'person_id' => $pid]; }
        }
        usort($list, static fn($a, $b) => [($a['job_from'] ?? $a['birth_year'] ?? 9999), $a['last_name'], $a['first_name']] <=> [($b['job_from'] ?? $b['birth_year'] ?? 9999), $b['last_name'], $b['first_name']]);
    }
    // ce que tu as ajouté
    $notes = ['notes' => '', 'sheet_id' => null, 'media_ids' => [], 'updated_at' => ''];
    try {
        $s = $pdo->prepare('SELECT n.*, ts.title AS sheet_title FROM old_trade_notes n LEFT JOIN topic_sheets ts ON ts.id=n.sheet_id WHERE n.trade_key=?'); $s->execute([$key]);
        if ($r = $s->fetch(PDO::FETCH_ASSOC)) { $notes = ['notes' => (string) $r['notes'], 'sheet_id' => $r['sheet_id'] ? (int) $r['sheet_id'] : null, 'sheet_title' => (string) ($r['sheet_title'] ?? ''), 'media_ids' => array_values(array_filter(array_map('intval', explode(',', (string) $r['media_ids'])))), 'updated_at' => (string) $r['updated_at']]; }
    } catch (Throwable $_) {}
    // les images de la base qui en parlent : celles que tu as choisies, puis celles dont le titre ou la description cite le métier
    $media = []; $seen = [];
    $mq = $pdo->prepare('SELECT id, title, description, media_type, filename, thumbnail, date_text FROM media WHERE id=?');
    foreach ($notes['media_ids'] as $mid) { $mq->execute([$mid]); if ($r = $mq->fetch(PDO::FETCH_ASSOC)) { $media[] = $r + ['chosen' => 1]; $seen[(int) $r['id']] = true; } }
    $terms = array_values(array_unique(array_filter(array_map(static fn($x) => trim((string) $x), array_merge([$name], isset($t['fem']) ? [$t['fem']] : [], array_slice($t['variants'] ?? [], 0, 4))), static fn($x) => mb_strlen($x) >= 4)));
    if ($terms) {
        $cond = implode(' OR ', array_fill(0, count($terms), "(lc_fold(COALESCE(title,'')) LIKE ? OR lc_fold(COALESCE(description,'')) LIKE ?)"));
        $args = []; foreach ($terms as $x) { $l = '%' . trade_fold($x) . '%'; $args[] = $l; $args[] = $l; }
        try {
            $s = $pdo->prepare("SELECT id, title, description, media_type, filename, thumbnail, date_text FROM media WHERE $cond ORDER BY id DESC LIMIT 60"); $s->execute($args);
            foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { if (!isset($seen[(int) $r['id']])) { $media[] = $r + ['chosen' => 0]; $seen[(int) $r['id']] = true; } }
        } catch (Throwable $_) {}
    }
    foreach ($media as &$m) { $m['thumb'] = $m['thumbnail'] ? 'media/' . rawurlencode((string) $m['thumbnail']) : ($m['filename'] ? 'media/' . rawurlencode((string) $m['filename']) : ''); }
    unset($m);
    // c'est aussi un métier d'art aujourd'hui ? (liste officielle, assets/data/metiers-art.json)
    $art = null;
    $af = APP_ROOT . '/assets/data/metiers-art.json';
    if (is_file($af)) {
        $want = trade_fold($name);
        foreach ((json_decode((string) file_get_contents($af), true)['domaines'] ?? []) as $dom) {
            foreach ($dom['metiers'] ?? [] as $mt) { if (trade_fold((string) $mt['nom']) === $want) { $art = ['domain' => (string) $dom['domaine'], 'name' => (string) $mt['nom'], 'specialites' => $mt['specialites'] ?? []]; break 2; } }
        }
    }
    $doc = $D['doc'];
    return ['key' => $key, 'name' => $name, 'own' => $own, 'trade' => $t, 'domain' => $t ? ($doc['domains'][$t['domain']] ?? null) : null,
        'people' => $list, 'points' => $points, 'written' => $written, 'media' => $media, 'notes' => $notes, 'art' => $art,
        'related' => $t ? trade_related($t) : [],
        'source' => ['credit' => (string) ($doc['credit'] ?? ''), 'licence' => (string) ($doc['licence'] ?? ''), 'licence_url' => (string) ($doc['licence_url'] ?? ''), 'sources' => $doc['sources'] ?? []]];
}

/** Quelques métiers du même domaine */
function trade_related(array $t): array
{
    $out = [];
    foreach (trades_dict()['doc']['trades'] as $x) { if ($x['domain'] === $t['domain'] && $x['key'] !== $t['key']) { $out[] = ['key' => $x['key'], 'name' => $x['name']]; } }
    $seed = crc32($t['key']); usort($out, static fn($a, $b) => (crc32($a['key']) ^ $seed) <=> (crc32($b['key']) ^ $seed));
    return array_slice($out, 0, 8);
}

/** GET old_trades : le dictionnaire (Listes → 🛠️ Métiers anciens), avec le nombre d'ancêtres de chaque métier ; q, domain, mine (1 = ceux de ta famille) */
function trades_list(PDO $pdo, array $q): array
{
    $D = trades_dict();
    $count = []; $own = [];
    foreach (trade_occupations($pdo) as $val => $who) {
        $k = trade_key_for($val);
        foreach (array_keys($who) as $pid) { $count[$k][$pid] = true; }
        if (str_starts_with($k, 'perso-')) { $own[$k] = $own[$k] ?? $val; }
    }
    $text = trade_fold((string) ($q['q'] ?? ''));
    $dom = (string) ($q['domain'] ?? '');
    $mine = !empty($q['mine']) && (string) $q['mine'] !== '0';
    $rows = [];
    foreach ($D['doc']['trades'] as $t) {
        $n = count($count[$t['key']] ?? []);
        if ($mine && !$n) { continue; }
        if ($dom !== '' && $t['domain'] !== $dom) { continue; }
        if ($text !== '' && !str_contains(trade_fold($t['name'] . ' ' . ($t['fem'] ?? '') . ' ' . implode(' ', $t['variants'] ?? []) . ' ' . $t['desc']), $text)) { continue; }
        $rows[] = ['key' => $t['key'], 'name' => $t['name'], 'fem' => $t['fem'] ?? '', 'domain' => $t['domain'], 'desc' => $t['desc'], 'variants' => $t['variants'] ?? [], 'people' => $n];
    }
    if ($dom === '' || $dom === 'perso') {
        foreach ($own as $k => $val) {
            if ($text !== '' && !str_contains(trade_fold($val), $text)) { continue; }
            $rows[] = ['key' => $k, 'name' => mb_strtoupper(mb_substr($val, 0, 1)) . mb_substr($val, 1), 'fem' => '', 'domain' => 'perso', 'desc' => 'Pas encore dans le dictionnaire : tu peux compléter sa fiche.', 'variants' => [], 'people' => count($count[$k] ?? [])];
        }
    }
    return ['trades' => $rows, 'domains' => $D['doc']['domains'], 'total' => count($D['doc']['trades']), 'licence' => (string) ($D['doc']['licence'] ?? ''), 'credit' => (string) ($D['doc']['credit'] ?? ''), 'sources' => $D['doc']['sources'] ?? []];
}

/** POST save_old_trade : {key, notes, sheet_id, media_ids} */
function trade_save(PDO $pdo, array $d): array
{
    $key = is_scalar($d['key'] ?? null) ? trim((string) $d['key']) : '';
    if (!preg_match('/^[a-z0-9-]{2,90}$/', $key) || (!isset(trades_dict()['by'][$key]) && !str_starts_with($key, 'perso-'))) { throw new RuntimeException('Métier introuvable.'); }
    $notes = mb_substr(trim(str_replace("\r", '', is_scalar($d['notes'] ?? null) ? (string) $d['notes'] : '')), 0, 20000);
    $sheet = safe_int($d['sheet_id'] ?? 0) ?: null;
    if ($sheet) { $s = $pdo->prepare('SELECT id FROM topic_sheets WHERE id=?'); $s->execute([$sheet]); if (!$s->fetchColumn()) { $sheet = null; } }
    $ids = array_slice(array_values(array_unique(array_filter(array_map('intval', is_array($d['media_ids'] ?? null) ? $d['media_ids'] : explode(',', (string) ($d['media_ids'] ?? '')))))), 0, 60);
    if ($ids) { $s = $pdo->query('SELECT id FROM media WHERE id IN (' . implode(',', $ids) . ')'); $ok = array_flip(array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN))); $ids = array_values(array_filter($ids, static fn($i) => isset($ok[$i]))); }
    $pdo->prepare('INSERT INTO old_trade_notes(trade_key, notes, sheet_id, media_ids) VALUES(?,?,?,?)
        ON CONFLICT(trade_key) DO UPDATE SET notes=excluded.notes, sheet_id=excluded.sheet_id, media_ids=excluded.media_ids, updated_at=CURRENT_TIMESTAMP')
        ->execute([$key, $notes, $sheet, implode(',', $ids)]);
    log_change($pdo, 'meta', 0, 'update', 'Fiche du métier « ' . $key . ' » complétée');
    return ['ok' => true, 'key' => $key];
}
