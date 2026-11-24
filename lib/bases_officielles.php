<?php
declare(strict_types=1);
/**
 * 🎖️ Morts pour la France 1914–1918 et 🏅 Légion d'honneur (base Léonore) : deux bases à télécharger une fois
 * (Réglages → 🎖️ Bases officielles, assets/js/heritage-bases-officielles.js), puis lues sans Internet.
 *
 *  · fiche : quand une personne y ressemble (même nom, même premier prénom, née à un an près, et même département de
 *    naissance quand les deux le disent) : « 🎖️ Peut-être dans Morts pour la France » / « 🏅 Peut-être dans la Léonore »,
 *    la fiche trouvée, le lien vers l'original en ligne, « ＋ Ajouter comme source (à vérifier) » (↶ Annuler) ;
 *  · recherche par nom dans une base installée (bo_search) ;
 *  · « Où chercher » : LCNDA_EXT.officialBases.suggest(person) (côté écran).
 * Les bases sont des fichiers SQLite à part (dossier des données / bases-officielles), jamais dans la généalogie ;
 * fabriquées par scripts/bases-officielles/build-bases.py (sources, licences et format : en tête de ce programme).
 * Seule écriture dans la généalogie : la source ajoutée à la main (bo_add) et son retrait (bo_undo).
 */

require_once __DIR__ . '/bases_officielles_dl.php';

/** les deux bases : [titre, icône] */
const BO_KINDS = ['mpf' => ['Morts pour la France 1914–1918', '🎖️'], 'leonore' => ['Légion d’honneur — base Léonore', '🏅']];
const BO_MDH_HOME = 'https://www.memoiredeshommes.sga.defense.gouv.fr/';
const BO_LEONORE_HOME = 'https://www.leonore.archives-nationales.culture.gouv.fr/';
const BO_MARK = 'LCNDA bases officielles';

function bo_dir(): string { return SHARED_DATA_DIR . '/bases-officielles'; }
function bo_kind(mixed $k): string { $k = (string) $k; if (!isset(BO_KINDS[$k])) { throw new LcndaBadInput('Base inconnue.'); } return $k; }
function bo_path(string $kind): string { return bo_dir() . '/bo-' . bo_kind($kind) . '.sqlite'; }

function bo_pdo(string $kind): ?PDO
{
    static $pool = [];
    if (array_key_exists($kind, $pool)) { return $pool[$kind]; }
    $p = bo_path($kind);
    if (!is_file($p) || filesize($p) < 1024) { return $pool[$kind] = null; }
    try {
        $o = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
        if (defined('PDO::SQLITE_ATTR_OPEN_FLAGS')) { $o[PDO::SQLITE_ATTR_OPEN_FLAGS] = PDO::SQLITE_OPEN_READONLY; }
        $x = new PDO('sqlite:' . $p, null, null, $o);
        $x->query('SELECT 1 FROM records LIMIT 1');
        return $pool[$kind] = $x;
    } catch (Throwable) { return $pool[$kind] = null; }
}

/** la clé d'un nom : MAJUSCULES sans accents, sans espaces ni tirets — comme cle() dans build-bases.py */
function bo_key(string $s): string
{
    $s = str_replace(['œ', 'Œ', 'æ', 'Æ', 'ß'], ['oe', 'OE', 'ae', 'AE', 'ss'], $s);
    if (class_exists('Normalizer')) { $n = Normalizer::normalize($s, Normalizer::FORM_KD); if (is_string($n)) { $s = (string) preg_replace('/\p{Mn}+/u', '', $n); } }
    else { $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'á' => 'a', 'ã' => 'a', 'å' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'í' => 'i', 'ì' => 'i', 'ô' => 'o', 'ö' => 'o', 'ó' => 'o', 'ò' => 'o', 'õ' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ú' => 'u', 'ç' => 'c', 'ñ' => 'n', 'ÿ' => 'y',
        'À' => 'A', 'Â' => 'A', 'Ä' => 'A', 'Á' => 'A', 'É' => 'E', 'È' => 'E', 'Ê' => 'E', 'Ë' => 'E', 'Î' => 'I', 'Ï' => 'I', 'Ô' => 'O', 'Ö' => 'O', 'Ù' => 'U', 'Û' => 'U', 'Ü' => 'U', 'Ç' => 'C', 'Ñ' => 'N']); }
    return (string) preg_replace('/[^A-Z]+/', '', strtoupper($s));
}

/** les prénoms en clés : « Jean-Marie Victor » → [JEAN, MARIE, VICTOR, JEANMARIE] */
function bo_first_keys(string $s): array
{
    $out = [];
    foreach (preg_split('/[\s,]+/u', trim($s)) ?: [] as $w) { if ($w === '') { continue; } foreach (explode('-', $w) as $p) { $k = bo_key($p); if ($k !== '') { $out[] = $k; } } if (str_contains($w, '-')) { $out[] = bo_key($w); } }
    return array_values(array_unique($out));
}

/** GET bo_status → chaque base : installée ? combien, quand, taille, sources */
function bo_status(): array
{
    $out = [];
    foreach (BO_KINDS as $kind => [$title, $icon]) {
        $x = bo_pdo($kind);
        $row = ['kind' => $kind, 'title' => $title, 'icon' => $icon, 'installed' => (bool) $x, 'removed' => is_file(bo_path($kind) . '.removed')];
        if ($x) {
            $m = $x->query('SELECT key, value FROM meta')->fetchAll(PDO::FETCH_KEY_PAIR);
            $row += ['records' => (int) ($m['count'] ?? 0), 'built' => (string) ($m['built'] ?? ''), 'fixture' => !empty($m['fixture']), 'size' => (int) filesize(bo_path($kind)),
                'sources' => $x->query('SELECT id, nom, licence, mention, url, n FROM sources ORDER BY n DESC')->fetchAll(),
                'years' => $x->query('SELECT MIN(annee) a, MAX(annee) b FROM records WHERE annee BETWEEN 1700 AND 2000')->fetch()];
        }
        $out[$kind] = $row;
    }
    return ['bases' => $out, 'dir' => bo_dir()];
}

/** l'adresse de la fiche en ligne (ou '' : alors la page de la base) */
function bo_record_url(string $kind, array $r): string
{
    $ref = (string) ($r['ref'] ?? '');
    if ($kind === 'leonore') { return preg_match('/^w:(\d{1,9})$/', $ref, $m) ? BO_LEONORE_HOME . 'ui/notice/' . $m[1] : ''; }
    if (preg_match('/^v:(\d{1,12})$/', $ref, $m)) {
        $id = $m[1]; $l = strlen($id);
        $s = 'a:8:{s:10:"type_fonds";s:13:"specif_client";s:10:"specif_fct";s:23:"ArkMDHVisionneuseImages";s:18:"specif_nav_par_lot";s:22:"ArkMDHNavigationParLot";s:13:"mdh_fonds_cle";i:1;'
            . "s:4:\"ref2\";s:$l:\"$id\";s:12:\"id_ark_fiche\";s:$l:\"$id\";" . 's:9:"pyramidal";b:0;s:12:"image_depart";i:0;}';
        return BO_MDH_HOME . 'fr/arkotheque/arkotheque_visionneuse_archives.php?arko=' . base64_encode($s);
    }
    if (preg_match('/^([df]):(\d{1,12})$/', $ref, $m)) { return BO_MDH_HOME . 'fr/arkotheque/client/mdh/' . ($m[1] === 'd' ? 'base_morts_pour_la_france_premiere_guerre' : 'fusilles_premiere_guerre') . '/detail_fiche.php?ref=' . $m[2] . '&debut=0'; }
    return '';
}

/** une fiche d'une base, prête pour l'écran */
function bo_record_out(PDO $x, string $kind, array $r): array
{
    static $src = [];
    $k = $kind . ':' . ($r['src'] ?? '');
    if (!array_key_exists($k, $src)) { $s = $x->prepare('SELECT nom, mention, licence, url FROM sources WHERE id=?'); $s->execute([(string) ($r['src'] ?? '')]); $src[$k] = $s->fetch() ?: null; }
    $url = bo_record_url($kind, $r);
    return ['id' => (int) $r['id'], 'key' => bo_record_key($kind, $r), 'nom' => (string) $r['nom'], 'prenoms' => (string) ($r['prenoms'] ?? ''), 'naiss' => (string) ($r['naiss'] ?? ''), 'annee' => $r['annee'] !== null ? (int) $r['annee'] : null,
        'lieu' => (string) ($r['lieu'] ?? ''), 'dep' => (string) ($r['dep'] ?? ''), 'deces' => (string) ($r['deces'] ?? ''), 'lieu_deces' => (string) ($r['lieu_deces'] ?? ''), 'unite' => (string) ($r['unite'] ?? ''),
        'grade' => (string) ($r['grade'] ?? ''), 'cote' => (string) ($r['cote'] ?? ''), 'sexe' => (string) ($r['sexe'] ?? ''), 'autre' => (string) ($r['autre'] ?? ''),
        'url' => $url, 'home' => $kind === 'leonore' ? BO_LEONORE_HOME : BO_MDH_HOME, 'source' => $src[$k] ? (string) $src[$k]['mention'] : '', 'source_url' => $src[$k] ? (string) $src[$k]['url'] : '', 'licence' => $src[$k] ? (string) $src[$k]['licence'] : ''];
}

/** ce qui reste vrai d'une version du pack à l'autre (le numéro de ligne, lui, change) */
function bo_record_key(string $kind, array $r): string
{
    if ($kind === 'leonore') { return 'leonore:' . (string) $r['cote']; }
    return 'mpf:' . ($r['src'] ?? '') . ':' . (($r['ref'] ?? '') !== '' && $r['ref'] !== null ? $r['ref'] : bo_key((string) $r['nom']) . '|' . bo_key((string) ($r['prenoms'] ?? '')) . '|' . ($r['naiss'] ?? ''));
}

/* ═════════════════════════ La personne de la fiche ═════════════════════════ */

function bo_person_facts(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM persons WHERE id=?'); $s->execute([$id]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException(i18n_t('Fiche introuvable.')); }
    $s = $pdo->prepare("SELECT e.year, e.date_text, t.gedcom_tag AS tag, pl.* FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id=? AND t.gedcom_tag IN ('BIRT','BAPM','CHR','DEAT','BURI') ORDER BY CASE t.gedcom_tag WHEN 'BIRT' THEN 0 WHEN 'DEAT' THEN 0 ELSE 1 END, e.id");
    $s->execute([$id]);
    $birth = null; $bplace = null; $death = null;
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $e) {
        $y = $e['year'] !== null && $e['year'] !== '' ? (int) $e['year'] : null;
        if (in_array($e['tag'], ['BIRT', 'BAPM', 'CHR'], true)) { $birth ??= $y; if ($bplace === null && trim((string) ($e['name'] ?? '')) !== '') { $bplace = $e; } }
        else { $death ??= $y; }
    }
    $commune = $bplace ? trim(explode(',', (string) $bplace['name'])[0]) : '';
    $dep = '';
    if ($bplace) {
        if (!function_exists('world_place_dept')) { require_once __DIR__ . '/monde_autour.php'; }
        try { $dep = world_place_dept($bplace); } catch (Throwable) { $dep = ''; }
        if ($dep === '' && preg_match('/\((\d{2}|2[AB])\)\s*$/', (string) $bplace['name'], $m)) { $dep = $m[1]; }
    }
    $first = trim((string) $p['first_name']);
    return ['id' => (int) $p['id'], 'last' => trim((string) $p['last_name']), 'first' => $first, 'first_key' => bo_first_keys($first)[0] ?? '', 'gender' => (string) $p['gender'],
        'animal' => ($p['kind'] ?? '') === 'animal', 'birth' => $birth, 'death' => $death, 'commune' => $commune, 'commune_key' => bo_key($commune), 'dep' => $dep];
}

/** peut-elle être dans cette base ? (pour proposer de l'installer) */
function bo_could_match(string $kind, array $f): bool
{
    if ($f['animal'] || bo_key($f['last']) === '') { return false; }
    if ($kind === 'mpf') { return $f['gender'] !== 'female' && ($f['birth'] === null ? ($f['death'] !== null && $f['death'] >= 1914 && $f['death'] <= 1921) : ($f['birth'] >= 1860 && $f['birth'] <= 1902)); }
    return true;
}

/** les fiches d'une base qui lui ressemblent : même nom, même prénom, née à un an près, même département si les deux le disent */
function bo_matches(string $kind, array $f, int $limit = 5): array
{
    $x = bo_pdo($kind);
    if (!$x || $f['birth'] === null || $f['first_key'] === '' || !bo_could_match($kind, $f)) { return []; }
    $s = $x->prepare('SELECT r.* FROM names n JOIN records r ON r.id=n.id WHERE n.cle=? AND r.annee BETWEEN ? AND ? LIMIT 200');
    $s->execute([bo_key($f['last']), $f['birth'] - 1, $f['birth'] + 1]);
    $out = [];
    foreach ($s->fetchAll() as $r) {
        $keys = bo_first_keys((string) ($r['prenoms'] ?? ''));
        if (!$keys || !in_array($f['first_key'], $keys, true)) { continue; }
        if ($kind === 'leonore' && $f['gender'] !== '' && $f['gender'] !== 'unknown' && in_array($r['sexe'], ['M', 'F'], true) && ($r['sexe'] === 'F') !== ($f['gender'] === 'female')) { continue; }
        $rdep = strtoupper((string) ($r['dep'] ?? ''));
        if ($f['dep'] !== '' && $rdep !== '' && $rdep !== strtoupper($f['dep'])) { continue; }
        $deathYear = preg_match('/^(\d{4})/', (string) ($r['deces'] ?? ''), $m) ? (int) $m[1] : null;
        if ($kind === 'mpf' && $f['death'] !== null && $deathYear !== null && abs($f['death'] - $deathYear) > 1) { continue; }
        $why = [i18n_t('même nom'), $keys[0] === $f['first_key'] ? i18n_t('même prénom') : i18n_t('son prénom, pas en premier'),
            (int) $r['annee'] === $f['birth'] ? i18n_t('né(e) la même année ({y})', ['y' => (string) $f['birth']]) : i18n_t('né(e) en {y} (sa fiche : {z})', ['y' => (string) $r['annee'], 'z' => (string) $f['birth']])];
        $score = ($keys[0] === $f['first_key'] ? 2 : 1) + ((int) $r['annee'] === $f['birth'] ? 2 : 0);
        if ($f['commune_key'] !== '' && bo_key((string) ($r['lieu'] ?? '')) === $f['commune_key']) { $why[] = i18n_t('même lieu de naissance ({l})', ['l' => (string) $r['lieu']]); $score += 3; }
        elseif ($f['dep'] !== '' && $rdep !== '') { $why[] = i18n_t('même département ({d})', ['d' => $rdep]); $score += 1; }
        if ($kind === 'mpf' && $f['death'] !== null && $deathYear !== null) { $why[] = i18n_t('mort(e) la même année ({y})', ['y' => (string) $deathYear]); $score += 2; }
        $out[] = bo_record_out($x, $kind, $r) + ['why' => $why, 'score' => $score];
    }
    usort($out, static fn($a, $b) => $b['score'] <=> $a['score']);
    return array_slice($out, 0, $limit);
}

/** les sources déjà ajoutées depuis ces bases sur sa fiche : clé → {source_id, link_id} */
function bo_added(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare("SELECT s.id AS source_id, sl.id AS link_id, s.text FROM sources s JOIN source_links sl ON sl.source_record_id=s.id WHERE sl.entity_type='person' AND sl.entity_id=? AND s.publication LIKE ?");
    $s->execute([$pid, '%' . BO_MARK . '%']);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { if (preg_match('/\[bo=([^\]\n]{1,200})\]/', (string) $r['text'], $m)) { $out[$m[1]] = ['source_id' => (int) $r['source_id'], 'link_id' => (int) $r['link_id']]; } }
    return $out;
}

/** GET bo_person&id= → pour chaque base : installée ? pourrait-elle y être ? les fiches qui lui ressemblent */
function bo_person(PDO $pdo, int $id): array
{
    $f = bo_person_facts($pdo, $id);
    $added = bo_added($pdo, $id);
    $bases = [];
    foreach (BO_KINDS as $kind => [$title, $icon]) {
        $m = bo_matches($kind, $f);
        foreach ($m as &$r) { $r['added'] = $added[$r['key']] ?? null; }
        unset($r);
        $bases[$kind] = ['kind' => $kind, 'title' => $title, 'icon' => $icon, 'installed' => (bool) bo_pdo($kind), 'could' => bo_could_match($kind, $f), 'matches' => $m];
    }
    return ['person' => ['id' => $f['id'], 'last' => $f['last'], 'first' => $f['first'], 'birth' => $f['birth'], 'death' => $f['death'], 'gender' => $f['gender'], 'dep' => $f['dep'], 'commune' => $f['commune']], 'bases' => $bases];
}

/** GET bo_search&kind=&nom=&prenom=&annee= → les fiches d'une base installée (nom exact ou début du nom), 100 au plus */
function bo_search(array $q): array
{
    $kind = bo_kind($q['kind'] ?? '');
    $x = bo_pdo($kind);
    if (!$x) { return ['installed' => false, 'rows' => [], 'total' => 0]; }
    $nom = bo_key((string) ($q['nom'] ?? ''));
    if (strlen($nom) < 2) { return ['installed' => true, 'rows' => [], 'total' => 0, 'short' => true]; }
    $prenom = bo_first_keys((string) ($q['prenom'] ?? ''))[0] ?? '';
    $annee = (int) ($q['annee'] ?? 0);
    $hi = substr($nom, 0, -1) . chr(ord(substr($nom, -1)) + 1);
    $sql = 'SELECT r.* FROM names n JOIN records r ON r.id=n.id WHERE n.cle>=? AND n.cle<?' . ($annee >= 1600 && $annee <= 2100 ? ' AND r.annee BETWEEN ? AND ?' : '') . ' ORDER BY n.cle=? DESC, r.nom, r.prenoms, r.annee LIMIT 2000';
    $args = [$nom, $hi]; if ($annee >= 1600 && $annee <= 2100) { $args[] = $annee - 2; $args[] = $annee + 2; } $args[] = $nom;
    $s = $x->prepare($sql); $s->execute($args);
    $rows = [];
    foreach ($s->fetchAll() as $r) {
        if ($prenom !== '' && !array_filter(bo_first_keys((string) ($r['prenoms'] ?? '')), static fn($k) => str_starts_with($k, $prenom))) { continue; }
        $rows[] = $r;
    }
    $total = count($rows);
    return ['installed' => true, 'total' => $total, 'more' => $total > 100, 'rows' => array_map(static fn($r) => bo_record_out($x, $kind, $r), array_slice($rows, 0, 100))];
}

/* ═════════════════════════ ＋ Ajouter comme source (à vérifier), ↶ Annuler ═════════════════════════ */

/** POST bo_add {person_id, kind, id} → une source « à vérifier » sur sa fiche (relue dans la base : rien de l'écran n'est recopié) */
function bo_add(PDO $pdo, array $d): array
{
    $pid = safe_int($d['person_id'] ?? 0);
    if (!$pid || !person_exists($pdo, $pid)) { throw new RuntimeException(i18n_t('Fiche introuvable.')); }
    assert_person_unlocked($pdo, $pid);
    $kind = bo_kind($d['kind'] ?? '');
    $x = bo_pdo($kind);
    if (!$x) { throw new RuntimeException(i18n_t('Cette base n’est pas installée.')); }
    $s = $x->prepare('SELECT * FROM records WHERE id=?'); $s->execute([safe_int($d['id'] ?? 0)]);
    $raw = $s->fetch();
    if (!$raw) { throw new RuntimeException(i18n_t('Fiche introuvable dans la base.')); }
    $r = bo_record_out($x, $kind, $raw);
    $already = bo_added($pdo, $pid)[$r['key']] ?? null;
    if ($already) { throw new RuntimeException(i18n_t('Cette fiche est déjà une source de sa fiche.')); }
    $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $s->execute([$pid]); $P = $s->fetch(PDO::FETCH_ASSOC) ?: [];
    $who = trim(mb_strtoupper((string) $r['nom']) . ' ' . $r['prenoms']);
    $born = trim(($r['naiss'] !== '' ? bo_date_fr($r['naiss']) : '') . ($r['lieu'] !== '' ? ' ' . i18n_t('à {l}', ['l' => $r['lieu'] . ($r['dep'] !== '' ? ' (' . $r['dep'] . ')' : '')]) : ''));
    $lines = [i18n_t('Trouvé dans « {base} » le {date}. À VÉRIFIER : est-ce bien {name} ?', ['base' => BO_KINDS[$kind][0], 'date' => date('d/m/Y'), 'name' => trim((string) ($P['first_name'] ?? '') . ' ' . mb_strtoupper((string) ($P['last_name'] ?? '')))])];
    $lines[] = $who . ($born !== '' ? ', ' . i18n_t('né(e) {b}', ['b' => $born]) : '');
    if ($r['deces'] !== '') { $lines[] = i18n_t('Mort(e) le {d}{l}', ['d' => bo_date_fr($r['deces']), 'l' => $r['lieu_deces'] !== '' ? ' ' . i18n_t('à {l}', ['l' => $r['lieu_deces']]) : '']); }
    if ($r['grade'] !== '' || $r['unite'] !== '') { $lines[] = trim($r['grade'] . ($r['grade'] !== '' && $r['unite'] !== '' ? ', ' : '') . $r['unite']); }
    if ($r['cote'] !== '') { $lines[] = ($kind === 'leonore' ? i18n_t('Cote du dossier : {c} (Archives nationales)', ['c' => $r['cote']]) : $r['cote']); }
    if ($r['autre'] !== '') { $lines[] = $r['autre']; }
    $lines[] = i18n_t('Données : {src} — {lic}.', ['src' => $r['source'], 'lic' => $r['licence']]);
    $lines[] = '[bo=' . $r['key'] . ']';
    $title = ($kind === 'leonore' ? 'Légion d’honneur (base Léonore) — ' : 'Morts pour la France 1914–1918 — ') . $who . ($r['annee'] ? ' (' . $r['annee'] . ')' : '');
    $own = !$pdo->inTransaction(); // api.php ouvre déjà une transaction pour chaque écriture
    if ($own) { $pdo->beginTransaction(); }
    try {
        $pdo->prepare('INSERT INTO sources(title, author, agency, publication, url, text) VALUES(?,?,?,?,?,?)')
            ->execute([mb_substr($title, 0, 240), '', $kind === 'leonore' ? 'Archives nationales' : 'Ministère des Armées — Mémoire des hommes', BO_MARK . ' (' . ($kind === 'leonore' ? 'Léonore' : 'Morts pour la France') . ')', $r['url'] !== '' ? $r['url'] : $r['home'], implode("\n", $lines)]);
        $sid = (int) $pdo->lastInsertId();
        $pdo->prepare('INSERT INTO source_links(entity_type, entity_id, source_record_id, page, quality, note) VALUES(?,?,?,?,?,?)')
            ->execute(['person', $pid, $sid, mb_substr($r['cote'], 0, 120), '', i18n_t('À vérifier ({base})', ['base' => $kind === 'leonore' ? 'Léonore' : 'Morts pour la France'])]);
        $lid = (int) $pdo->lastInsertId();
        if (function_exists('log_change')) { log_change($pdo, 'person', $pid, 'update', BO_KINDS[$kind][1] . ' source ajoutée (à vérifier) — ' . $title); }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['source_id' => $sid, 'link_id' => $lid, 'key' => $r['key'], 'title' => $title];
}

/** POST bo_undo {person_id, source_id, link_id} → retire la source ajoutée (seulement une des nôtres, et si rien d'autre ne s'y rattache) */
function bo_undo(PDO $pdo, array $d): array
{
    $pid = safe_int($d['person_id'] ?? 0); $sid = safe_int($d['source_id'] ?? 0); $lid = safe_int($d['link_id'] ?? 0);
    $s = $pdo->prepare("SELECT s.publication FROM sources s JOIN source_links sl ON sl.source_record_id=s.id WHERE s.id=? AND sl.id=? AND sl.entity_type='person' AND sl.entity_id=?");
    $s->execute([$sid, $lid, $pid]);
    $pub = $s->fetchColumn();
    if ($pub === false || !str_contains((string) $pub, BO_MARK)) { throw new RuntimeException(i18n_t('Cet ajout est déjà annulé, ou introuvable.')); }
    assert_person_unlocked($pdo, $pid);
    $own = !$pdo->inTransaction();
    if ($own) { $pdo->beginTransaction(); }
    try {
        $pdo->prepare('DELETE FROM source_links WHERE id=?')->execute([$lid]);
        $n = $pdo->prepare('SELECT count(*) FROM source_links WHERE source_record_id=?'); $n->execute([$sid]);
        if (!(int) $n->fetchColumn()) { $pdo->prepare('DELETE FROM sources WHERE id=?')->execute([$sid]); }
        if (function_exists('log_change')) { log_change($pdo, 'person', $pid, 'update', 'Bases officielles : ajout annulé'); }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['ok' => true, 'person_id' => $pid];
}

function bo_date_fr(string $iso): string
{
    static $mois = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    if (preg_match('/^(\d{4})-(\d\d)-(\d\d)$/', $iso, $m)) { return ((int) $m[3] === 1 ? '1er' : (string) (int) $m[3]) . ' ' . $mois[(int) $m[2]] . ' ' . $m[1]; }
    if (preg_match('/^(\d{4})-(\d\d)$/', $iso, $m)) { return $mois[(int) $m[2]] . ' ' . $m[1]; }
    return $iso;
}

/* ═════════════════════════ Aiguillage (api.php) ═════════════════════════ */

function bo_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'bo_status' => bo_status(),
        'bo_person' => bo_person($pdo, safe_int($q['id'] ?? 0)),
        'bo_search' => bo_search($q),
        // sans internet (ou rien encore en ligne) : une réponse normale qui le dit
        'bo_dl_info' => (static function () { try { return bo_dl_info(); } catch (RuntimeException $e) { return ['version' => '', 'packs' => (object) [], 'offline' => true, 'error' => $e->getMessage()]; } })(),
        'bo_dl_resume' => bo_dl_resume((string) ($q['id'] ?? '')),
        default => throw new RuntimeException('Action inconnue.'),
    };
}

/** les packs (fichiers à part, rien n'est écrit dans la généalogie) */
function bo_api_post(string $action, array $data): array
{
    return match ($action) {
        'bo_dl_start' => bo_dl_start($data),
        'bo_dl_step' => bo_dl_step($data),
        'bo_dl_cancel' => bo_dl_cancel($data),
        'bo_dl_finish' => bo_dl_finish($data),
        'bo_pack_undo' => bo_pack_undo($data),
        'bo_pack_remove' => bo_pack_remove($data),
        'bo_pack_restore' => bo_pack_restore($data),
        default => throw new RuntimeException('Action inconnue.'),
    };
}

/** les écritures dans la généalogie (dans la transaction de handle_write) */
function bo_api_write(PDO $pdo, string $action, array $data): array
{
    return match ($action) {
        'bo_add' => bo_add($pdo, $data),
        'bo_undo' => bo_undo($pdo, $data),
        default => throw new RuntimeException('Action inconnue.'),
    };
}
