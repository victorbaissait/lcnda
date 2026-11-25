<?php
declare(strict_types=1);

/*
 * 🧩 Les besoins (maquette validée docs/design/connexions-besoins.html, étapes 3 et 4 ; réponses retenues : celles conseillées).
 * Interface : assets/js/heritage-connexions-besoins.js. Chargé par lib/connexions.php (même aiguillage cx_… / cx_write).
 *
 * Un besoin = une piste « à explorer » améliorée (question 3) : ce qui manque (what), pour qui (person_id), où (place), quand (years).
 * Gardé comme une requête vivante : chaque fois qu'on ouvre l'enquête, que l'on transcrit un acte ou qu'on importe des médias,
 * les « fournisseurs » hors ligne répondent (✓ je l'ai : Atelier, Médias ; 🚫 déjà cherché : Journal des recherches ;
 * 🔎 je peux le trouver : Où chercher ?, Courriers — des boutons, rien n'est calculé pour eux).
 * Une piste « à explorer » sans besoin écrit en a un deviné d'après son titre (« Acte de naissance ou de baptême » → naissance)
 * et la personne de l'enquête : rien n'est enregistré tant qu'on ne le précise pas (ou qu'on ne range pas une réponse).
 * Un besoin peut servir à trancher une hypothèse (hypothesis_id : « il faudrait l'acte de décès pour trancher »).
 *
 * Tables (créées à la première demande) :
 *  - cx_needs(id, item_id, investigation_id, hypothesis_id, person_id, what, place_id, place_name, year_from, year_to, note,
 *             state open | done | off, skip_json [« act:12 », …] (« Pas lui »), filled_json {kind, ref_id, title})
 *  - cx_map_items(id, kind, ref_id, title, value, lat, lon, data_json, origin_json) : ce qu'on a « 📍 Mis sur la carte »
 *    (couche « 📌 Mis sur la carte » des cartes : LCNDA_EXT.mapLayerSources, et les épingles de la Carte).
 *
 * GET  cx_needs&investigation_id= | cx_needs_all | cx_hints&tool=book|place | cx_map
 * POST cx_write {op: need_set | need_remove | need_restore | need_match | need_file | need_file_undo | need_skip | need_unskip
 *      | need_media_recent | map_add | map_remove | map_restore}
 */

const CX_NEED_WHAT = ['birth', 'marriage', 'death', 'census', 'military', 'notarial', 'photo', 'source', 'other'];
/** les sortes d'actes de l'Atelier (TRANSCRIPTION_KINDS) → ce qui manque */
const CX_NEED_KINDS = ['birth' => ['naissance', 'bapteme'], 'marriage' => ['mariage'], 'death' => ['deces', 'sepulture'], 'census' => ['recensement'],
    'military' => ['militaire'], 'notarial' => ['notarial', 'notoriete']];
/** les mots qui disent la sorte d'un document (titres de pistes, de médias, du journal), déjà sans accents */
const CX_NEED_WORDS = ['notarial' => '/contrat de mariage|notari|testament|succession|inventaire apres deces|notoriete/', 'birth' => '/naissance|bapteme|\bne le\b/',
    'marriage' => '/mariage|\bbans\b/', 'death' => '/deces|sepulture|inhumation|\bmort\b/', 'census' => '/recensement|denombrement/',
    'military' => '/matricule|militaire|conscription|recrutement/', 'photo' => '/\bphoto|portrait/'];
const CX_NEED_TAGS = ['birth' => ['BIRT', 'CHR', 'BAPM'], 'death' => ['DEAT', 'BURI'], 'marriage' => ['MARR'], 'census' => ['CENS']];

function cxn_schema(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    cx_schema($pdo);
    $pdo->exec("CREATE TABLE IF NOT EXISTS cx_needs (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL DEFAULT 0, investigation_id INTEGER NOT NULL DEFAULT 0,
        hypothesis_id INTEGER NOT NULL DEFAULT 0, person_id INTEGER NOT NULL DEFAULT 0, what TEXT NOT NULL DEFAULT 'other', place_id INTEGER NOT NULL DEFAULT 0,
        place_name TEXT NOT NULL DEFAULT '', year_from INTEGER, year_to INTEGER, note TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT 'open',
        skip_json TEXT NOT NULL DEFAULT '', filled_json TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_cx_needs_item ON cx_needs(item_id) WHERE item_id>0');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_cx_needs_person ON cx_needs(person_id, state)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS cx_map_items (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL DEFAULT 'place', ref_id INTEGER NOT NULL DEFAULT 0,
        title TEXT NOT NULL DEFAULT '', value TEXT NOT NULL DEFAULT '', lat REAL NOT NULL, lon REAL NOT NULL, data_json TEXT NOT NULL DEFAULT '', origin_json TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $done = true;
}

function cxn_has(PDO $pdo, string $table): bool
{
    static $c = [];
    if (!isset($c[$table])) { $s = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"); $s->execute([$table]); $c[$table] = (bool) $s->fetchColumn(); }
    return $c[$table];
}

function cxn_fold(string $s): string
{
    $s = mb_strtolower($s);
    $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'á' => 'a', 'ç' => 'c', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'í' => 'i',
        'ô' => 'o', 'ö' => 'o', 'ó' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ú' => 'u', 'ÿ' => 'y', 'œ' => 'oe', 'æ' => 'ae', 'ſ' => 's', '’' => "'", '‘' => "'"]);
    return (string) preg_replace('/\s+/', ' ', $s);
}

function cxn_year(string $s): ?int
{
    return preg_match('/\b(1[0-9]{3}|20[0-9]{2})\b/', $s, $m) ? (int) $m[1] : null;
}

/** la sorte d'un acte de l'Atelier (naissance, bapteme…) ou d'un besoin → ce qui manque */
function cxn_what(string $k): string
{
    if (in_array($k, CX_NEED_WHAT, true)) { return $k; }
    foreach (CX_NEED_KINDS as $w => $ks) { if (in_array($k, $ks, true)) { return $w; } }
    return 'other';
}

/** ce qui manque, deviné d'après un titre (« Acte de naissance ou de baptême » → birth) ; '' si rien de clair */
function cxn_what_of_text(string $t): string
{
    $f = cxn_fold($t);
    foreach (CX_NEED_WORDS as $w => $rx) { if (preg_match($rx, $f)) { return $w; } }
    return '';
}

function cxn_person(PDO $pdo, int $id): ?array
{
    static $c = [];
    if (!$id) { return null; }
    if (!array_key_exists($id, $c)) {
        $s = $pdo->prepare('SELECT id, first_name, last_name FROM persons WHERE id=?'); $s->execute([$id]); $p = $s->fetch(PDO::FETCH_ASSOC);
        $c[$id] = $p ? ['id' => (int) $p['id'], 'first' => trim((string) $p['first_name']), 'last' => trim((string) $p['last_name']), 'name' => trim($p['first_name'] . ' ' . $p['last_name'])] : null;
    }
    return $c[$id];
}

function cxn_place(PDO $pdo, int $id): string
{
    if (!$id) { return ''; }
    $s = $pdo->prepare('SELECT name FROM places WHERE id=?'); $s->execute([$id]);
    return (string) ($s->fetchColumn() ?: '');
}

/** l'événement déjà connu de la personne pour ce qui manque (sa naissance, son décès, son mariage) → {year, place_id, place} */
function cxn_known(PDO $pdo, int $pid, string $what): array
{
    $tags = CX_NEED_TAGS[$what] ?? null;
    if (!$pid || !$tags) { return []; }
    $in = implode(',', array_map(static fn($t) => $pdo->quote($t), $tags));
    $sql = $what === 'marriage'
        ? "SELECT e.year, e.place_id, pl.name AS place FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id LEFT JOIN places pl ON pl.id=e.place_id WHERE t.gedcom_tag IN ($in) AND (f.partner1_id=? OR f.partner2_id=?) ORDER BY e.year IS NULL, e.year LIMIT 1"
        : "SELECT e.year, e.place_id, pl.name AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE t.gedcom_tag IN ($in) AND e.person_id=? ORDER BY e.year IS NULL, e.year LIMIT 1";
    $s = $pdo->prepare($sql); $s->execute($what === 'marriage' ? [$pid, $pid] : [$pid]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    return $r ? ['year' => $r['year'] !== null ? (int) $r['year'] : null, 'place_id' => (int) ($r['place_id'] ?? 0), 'place' => (string) ($r['place'] ?? '')] : [];
}

/** une ligne de cx_needs (ou un besoin deviné) → ce que montre la page */
function cxn_out(PDO $pdo, array $n): array
{
    $p = cxn_person($pdo, (int) $n['person_id']);
    $out = ['id' => (int) ($n['id'] ?? 0), 'item_id' => (int) $n['item_id'], 'investigation_id' => (int) $n['investigation_id'], 'hypothesis_id' => (int) ($n['hypothesis_id'] ?? 0),
        'person_id' => (int) $n['person_id'], 'person' => $p['name'] ?? '', 'what' => (string) $n['what'], 'place_id' => (int) ($n['place_id'] ?? 0),
        'place' => (string) ($n['place_name'] ?? '') ?: cxn_place($pdo, (int) ($n['place_id'] ?? 0)),
        'year_from' => isset($n['year_from']) && $n['year_from'] !== null && $n['year_from'] !== '' ? (int) $n['year_from'] : null,
        'year_to' => isset($n['year_to']) && $n['year_to'] !== null && $n['year_to'] !== '' ? (int) $n['year_to'] : null,
        'note' => (string) ($n['note'] ?? ''), 'state' => (string) ($n['state'] ?? 'open'), 'guessed' => !empty($n['guessed']),
        'skip' => ($n['skip_json'] ?? '') !== '' ? (json_decode((string) $n['skip_json'], true) ?: []) : [],
        'filled' => ($n['filled_json'] ?? '') !== '' ? (json_decode((string) $n['filled_json'], true) ?: null) : null];
    if ($out['hypothesis_id'] && cxn_has($pdo, 'hypotheses')) { $s = $pdo->prepare('SELECT title FROM hypotheses WHERE id=?'); $s->execute([$out['hypothesis_id']]); $out['hypothesis'] = (string) ($s->fetchColumn() ?: ''); }
    return $out;
}

/** le besoin deviné d'une piste « à explorer » sans besoin écrit (null si son titre ne dit rien de clair) */
function cxn_guess(PDO $pdo, array $item, array $inv): ?array
{
    if (!in_array($item['status'] ?? '', ['to_explore', 'to_explore_priority'], true)) { return null; }
    $what = cxn_what_of_text((string) $item['title']);
    if ($what === '' || !(int) ($inv['person_id'] ?? 0)) { return null; }
    $k = cxn_known($pdo, (int) $inv['person_id'], $what);
    $y = $k['year'] ?? null;
    return ['id' => 0, 'item_id' => (int) $item['id'], 'investigation_id' => (int) $inv['id'], 'hypothesis_id' => 0, 'person_id' => (int) $inv['person_id'], 'what' => $what,
        'place_id' => (int) ($k['place_id'] ?? 0), 'place_name' => (string) ($k['place'] ?? ''), 'year_from' => $y ? $y - 2 : null, 'year_to' => $y ? $y + 2 : null,
        'state' => 'open', 'guessed' => true];
}

/** les besoins des pistes d'une enquête : écrits, ou devinés pour les pistes « à explorer » */
function cxn_of_investigation(PDO $pdo, int $invId): array
{
    cxn_schema($pdo);
    $s = $pdo->prepare('SELECT id, person_id, title FROM investigations WHERE id=?'); $s->execute([$invId]); $inv = $s->fetch(PDO::FETCH_ASSOC);
    if (!$inv) { return []; }
    $s = $pdo->prepare('SELECT * FROM cx_needs WHERE investigation_id=? AND item_id>0'); $s->execute([$invId]);
    $saved = []; foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $n) { $saved[(int) $n['item_id']] = $n; }
    $s = $pdo->prepare('SELECT id, title, status FROM investigation_items WHERE investigation_id=? ORDER BY id'); $s->execute([$invId]);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $it) {
        $n = $saved[(int) $it['id']] ?? cxn_guess($pdo, $it, $inv);
        if (!$n || ($n['state'] ?? '') === 'off') { continue; }
        $o = cxn_out($pdo, $n); $o['item_title'] = (string) $it['title']; $o['investigation_title'] = (string) $inv['title'];
        $out[] = $o;
    }
    return $out;
}

/* ═════════════ les fournisseurs (hors ligne) ═════════════ */

/** l'année d'un texte est-elle dans la fourchette (± 1) ? sans année ou sans fourchette : oui */
function cxn_in_years(?int $y, array $n): bool
{
    if ($y === null || ($n['year_from'] === null && $n['year_to'] === null)) { return true; }
    return $y >= (($n['year_from'] ?? -9999) - 1) && $y <= (($n['year_to'] ?? 9999) + 1);
}

/** le nom de la personne (prénom + nom, sans accents) se lit-il dans ce texte ? */
function cxn_name_in(?array $p, string $text): bool
{
    if (!$p || $p['last'] === '') { return false; }
    $f = cxn_fold($text); $last = cxn_fold($p['last']); $first = cxn_fold(explode(' ', $p['first'])[0] ?? '');
    if ($first === '') { return (bool) preg_match('/\b' . preg_quote($last, '/') . '\b/u', $f); }
    return (bool) preg_match('/\b' . preg_quote($first, '/') . '\b[^.;\n]{0,40}\b' . preg_quote($last, '/') . '\b|\b' . preg_quote($last, '/') . '\b[ ,]{1,3}' . preg_quote($first, '/') . '\b/u', $f);
}

/** ✓ je l'ai / 🚫 déjà cherché / 🔎 je peux le trouver, pour un besoin (cxn_out) */
function cxn_answers(PDO $pdo, array $n, int $limit = 4): array
{
    $out = [];
    if ($n['state'] !== 'open') { return $out; }
    $skip = array_flip(array_map('strval', $n['skip'] ?? []));
    $linked = [];
    if ($n['item_id']) { $s = $pdo->prepare('SELECT entity_type, entity_id FROM investigation_item_links WHERE investigation_item_id=?'); $s->execute([$n['item_id']]); foreach ($s->fetchAll(PDO::FETCH_NUM) as [$t, $i]) { $linked[$t . ':' . $i] = true; } }
    $p = cxn_person($pdo, $n['person_id']);
    // 📜 Atelier : un acte transcrit de cette sorte qui nomme la personne (reliée, ou son nom dans le texte)
    $kinds = CX_NEED_KINDS[$n['what']] ?? [];
    if ($kinds && cxn_has($pdo, 'act_transcriptions')) {
        $in = implode(',', array_map(static fn($k) => $pdo->quote($k), $kinds));
        foreach ($pdo->query("SELECT id, title, kind, date_text, place, body, data_json, updated_at FROM act_transcriptions WHERE kind IN ($in) ORDER BY updated_at DESC, id DESC LIMIT 400") as $a) {
            $key = 'act:' . $a['id']; if (isset($skip[$key]) || isset($linked[$key])) { continue; }
            $d = json_decode((string) $a['data_json'], true) ?: [];
            $byId = $n['person_id'] && in_array($n['person_id'], array_map(static fn($x) => (int) ($x['person_id'] ?? 0), is_array($d['people'] ?? null) ? $d['people'] : []), true);
            if (!$byId && !cxn_name_in($p, $a['title'] . "\n" . $a['body'])) { continue; }
            if (!cxn_in_years(cxn_year((string) $a['date_text']) ?? cxn_year((string) $a['title']), $n)) { continue; }
            $out[] = ['have' => 'yes', 'provider' => 'atelier', 'kind' => 'act', 'ref_id' => (int) $a['id'], 'title' => (string) $a['title'],
                'value' => trim(implode(' · ', array_filter([(string) $a['date_text'], (string) $a['place']]))), 'at' => substr((string) $a['updated_at'], 0, 10), 'sure' => $byId];
            if (count($out) >= $limit) { break; }
        }
    }
    // 🖼 Médias : une image de la personne pas encore dans l'enquête (une photo ; ou un document dont le titre dit la sorte)
    if ($n['person_id'] && $n['what'] !== 'source') {
        $s = $pdo->prepare("SELECT m.id, m.title, m.filename, m.media_type, m.date_text, m.document_title, m.description FROM media_links ml JOIN media m ON m.id=ml.media_id
            WHERE ml.entity_type='person' AND ml.entity_id=? AND m.id NOT IN (SELECT media_id FROM investigation_media WHERE investigation_id=?) ORDER BY m.id DESC LIMIT 200");
        $s->execute([$n['person_id'], $n['investigation_id']]);
        $nm = 0;
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $m) {
            $key = 'media:' . $m['id']; if (isset($skip[$key]) || isset($linked[$key])) { continue; }
            $txt = $m['title'] . ' ' . $m['document_title'] . ' ' . $m['description'];
            $ok = $n['what'] === 'photo' ? ($m['media_type'] === 'image' && cxn_what_of_text($txt) === '') || cxn_what_of_text($txt) === 'photo' : cxn_what_of_text($txt) === $n['what'];
            if (!$ok || !cxn_in_years(cxn_year((string) $m['date_text']) ?? cxn_year($txt), $n)) { continue; }
            $out[] = ['have' => 'yes', 'provider' => 'media', 'kind' => 'media', 'ref_id' => (int) $m['id'], 'title' => (string) ($m['title'] ?: $m['filename']), 'value' => (string) $m['date_text'], 'sure' => true];
            if (++$nm >= 3) { break; }
        }
    }
    // 📒 Journal des recherches : « rien trouvé » pour cette personne et cette sorte
    if ($n['person_id'] && cxn_has($pdo, 'research_journal')) {
        $s = $pdo->prepare('SELECT id, title, body, result, updated_at FROM research_journal WHERE person_id=? ORDER BY updated_at DESC LIMIT 100'); $s->execute([$n['person_id']]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $j) {
            $f = cxn_fold($j['title'] . ' ' . $j['body'] . ' ' . $j['result']);
            if (cxn_what_of_text($j['title'] . ' ' . $j['body']) !== $n['what'] || !preg_match('/rien|aucun|pas trouve|introuvable|negati|neant|lacune|manque/', cxn_fold((string) $j['result']) ?: $f)) { continue; }
            $out[] = ['have' => 'searched', 'provider' => 'journal', 'kind' => 'journal', 'ref_id' => (int) $j['id'], 'title' => (string) $j['title'], 'value' => trim((string) $j['result']), 'at' => substr((string) $j['updated_at'], 0, 10)];
            break;
        }
    }
    // 🔎 je peux le trouver : des boutons (Où chercher ?, un courrier), rien à calculer
    if ($n['person_id']) {
        $out[] = ['have' => 'find', 'provider' => 'ou_chercher'];
        if (in_array($n['what'], ['birth', 'marriage', 'death'], true)) { $out[] = ['have' => 'find', 'provider' => 'courrier']; }
    }
    return $out;
}

/** GET cx_needs&investigation_id= : les besoins de l'enquête et leurs réponses (calculés à l'ouverture, pour cette enquête seulement) */
function cxn_investigation(PDO $pdo, array $q): array
{
    $invId = safe_int($q['investigation_id'] ?? 0);
    $needs = cxn_of_investigation($pdo, $invId);
    $have = 0;
    foreach ($needs as &$n) { $n['answers'] = cxn_answers($pdo, $n); $have += count(array_filter($n['answers'], static fn($a) => $a['have'] === 'yes')); }
    unset($n);
    // 🤔 les hypothèses ouvertes des personnes de l'enquête : un besoin peut servir à en trancher une
    $hyp = [];
    if (cxn_has($pdo, 'hypotheses')) {
        $s = $pdo->prepare("SELECT h.id, h.title, h.person_id FROM hypotheses h WHERE h.status='open' AND (h.person_id=(SELECT person_id FROM investigations WHERE id=?)
            OR h.person_id IN (SELECT person_id FROM investigation_persons WHERE investigation_id=?)) ORDER BY h.updated_at DESC LIMIT 40");
        try { $s->execute([$invId, $invId]); $hyp = array_map(static fn($h) => ['id' => (int) $h['id'], 'title' => (string) $h['title'], 'person_id' => (int) $h['person_id']], $s->fetchAll(PDO::FETCH_ASSOC)); } catch (Throwable $_) { $hyp = []; }
    }
    return ['needs' => $needs, 'have' => $have, 'hypotheses' => $hyp];
}

/* ═════════════ écrire ═════════════ */

function cxn_row(PDO $pdo, int $id): ?array
{
    $s = $pdo->prepare('SELECT * FROM cx_needs WHERE id=?'); $s->execute([$id]);
    return $s->fetch(PDO::FETCH_ASSOC) ?: null;
}

/** POST need_set {item_id | hypothesis_id, what, person_id, place_id, place_name, year_from, year_to, note, state} → {need, prev} (prev : ↶ Annuler) */
function cxn_set(PDO $pdo, array $d): array
{
    cxn_schema($pdo);
    $itemId = safe_int($d['item_id'] ?? 0); $invId = 0;
    if ($itemId) {
        $s = $pdo->prepare('SELECT investigation_id FROM investigation_items WHERE id=?'); $s->execute([$itemId]); $invId = (int) $s->fetchColumn();
        if (!$invId) { throw new LcndaBadInput('Piste introuvable.'); }
    }
    $what = in_array($d['what'] ?? '', CX_NEED_WHAT, true) ? (string) $d['what'] : 'other';
    $y0 = ($d['year_from'] ?? '') === '' || ($d['year_from'] ?? null) === null ? null : max(1, min(2100, safe_int($d['year_from'])));
    $y1 = ($d['year_to'] ?? '') === '' || ($d['year_to'] ?? null) === null ? null : max(1, min(2100, safe_int($d['year_to'])));
    if ($y0 !== null && $y1 !== null && $y1 < $y0) { [$y0, $y1] = [$y1, $y0]; }
    $state = in_array($d['state'] ?? '', ['open', 'done', 'off'], true) ? (string) $d['state'] : 'open';
    $vals = [$itemId, $invId, safe_int($d['hypothesis_id'] ?? 0), safe_int($d['person_id'] ?? 0), $what, safe_int($d['place_id'] ?? 0), cx_str($d['place_name'] ?? '', 200), $y0, $y1, cx_str($d['note'] ?? '', 1000), $state];
    $prev = null;
    $id = safe_int($d['id'] ?? 0);
    if (!$id && $itemId) { $s = $pdo->prepare('SELECT id FROM cx_needs WHERE item_id=?'); $s->execute([$itemId]); $id = (int) $s->fetchColumn(); }
    if ($id && ($prev = cxn_row($pdo, $id))) {
        $pdo->prepare('UPDATE cx_needs SET item_id=?, investigation_id=?, hypothesis_id=?, person_id=?, what=?, place_id=?, place_name=?, year_from=?, year_to=?, note=?, state=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$vals, $id]);
    } else {
        $pdo->prepare('INSERT INTO cx_needs(item_id, investigation_id, hypothesis_id, person_id, what, place_id, place_name, year_from, year_to, note, state) VALUES(?,?,?,?,?,?,?,?,?,?,?)')->execute($vals);
        $id = (int) $pdo->lastInsertId();
    }
    return ['need' => cxn_out($pdo, cxn_row($pdo, $id)), 'prev' => $prev, 'id' => $id];
}

/** ↶ : remettre une ligne telle qu'elle était (prev), ou retirer celle qui vient d'être créée */
function cxn_restore(PDO $pdo, array $d): array
{
    cxn_schema($pdo);
    $prev = is_array($d['prev'] ?? null) ? $d['prev'] : null;
    if (!$prev) { $pdo->prepare('DELETE FROM cx_needs WHERE id=?')->execute([safe_int($d['id'] ?? 0)]); return ['ok' => true]; }
    $cols = ['id', 'item_id', 'investigation_id', 'hypothesis_id', 'person_id', 'what', 'place_id', 'place_name', 'year_from', 'year_to', 'note', 'state', 'skip_json', 'filled_json', 'created_at', 'updated_at'];
    $row = array_map(static fn($c) => $prev[$c] ?? null, $cols);
    $row[0] = safe_int($row[0]); foreach ([1, 2, 3, 4, 6] as $i) { $row[$i] = safe_int($row[$i]); }
    foreach ([5, 7, 10, 11, 12, 13] as $i) { $row[$i] = (string) ($row[$i] ?? ''); }
    $row[14] = $row[14] ?: date('Y-m-d H:i:s'); $row[15] = $row[15] ?: date('Y-m-d H:i:s');
    if ($row[1]) { $pdo->prepare('DELETE FROM cx_needs WHERE item_id=? AND id<>?')->execute([$row[1], $row[0]]); }
    $pdo->prepare('INSERT OR REPLACE INTO cx_needs(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute($row);
    return ['ok' => true];
}

/**
 * POST need_match {kind: act | media, ref_id, what, person_ids, names, year, place} : quelque chose vient d'arriver (un acte transcrit,
 * un média importé) → les besoins ouverts auxquels il répond, du plus sûr au moins sûr. « sure » : même personne et même sorte
 * (et l'année dans la fourchette) ; « close » : même sorte, et la personne, ou l'année et le lieu. Jamais rangé tout seul.
 */
function cxn_match(PDO $pdo, array $d): array
{
    cxn_schema($pdo);
    $what = cxn_what((string) ($d['what'] ?? ''));
    $kind = in_array($d['kind'] ?? '', ['act', 'media'], true) ? (string) $d['kind'] : 'act';
    $ref = safe_int($d['ref_id'] ?? 0);
    $pids = array_values(array_unique(array_filter(array_map('intval', is_array($d['person_ids'] ?? null) ? $d['person_ids'] : []))));
    $names = cxn_fold(implode(' | ', array_map('strval', array_slice(is_array($d['names'] ?? null) ? $d['names'] : [], 0, 60))) . ' | ' . cx_str($d['text'] ?? '', 20000));
    $year = isset($d['year']) && $d['year'] !== '' && $d['year'] !== null ? safe_int($d['year']) : cxn_year((string) ($d['date'] ?? ''));
    $place = cxn_fold(cx_str($d['place'] ?? '', 200));
    if ($what === 'other' && $kind === 'act') { return ['matches' => []]; }
    // les besoins candidats : écrits (de cette sorte) et devinés (pistes « à explorer » des enquêtes ouvertes de ces personnes, ou de toutes si on n'a que des noms)
    $cands = [];
    $s = $pdo->prepare("SELECT n.*, ii.title AS item_title, i.title AS investigation_title FROM cx_needs n LEFT JOIN investigation_items ii ON ii.id=n.item_id LEFT JOIN investigations i ON i.id=n.investigation_id
        WHERE n.state='open' AND n.what=? AND (n.item_id=0 OR ii.id IS NOT NULL) LIMIT 500");
    $s->execute([$what]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $o = cxn_out($pdo, $r); $o['item_title'] = (string) $r['item_title']; $o['investigation_title'] = (string) $r['investigation_title']; $cands[] = $o; }
    $have = array_flip(array_map(static fn($c) => $c['item_id'], array_filter($cands, static fn($c) => $c['item_id'] > 0)));
    // les besoins devinés : seulement les enquêtes dont la personne est l'une de celles de l'acte (ou nommée dans son texte)
    $all = [];
    foreach ($pdo->query("SELECT id, person_id FROM investigations WHERE COALESCE(status,'open')='open' ORDER BY updated_at DESC LIMIT 300")->fetchAll(PDO::FETCH_NUM) as [$iid, $ipid]) {
        if ((int) $ipid && (in_array((int) $ipid, $pids, true) || cxn_name_in(cxn_person($pdo, (int) $ipid), $names))) { $all[] = (int) $iid; }
    }
    foreach ($all as $invId) {
        foreach (cxn_of_investigation($pdo, (int) $invId) as $o) { if (!$o['guessed'] || isset($have[$o['item_id']]) || $o['what'] !== $what) { continue; } $cands[] = $o; }
    }
    $out = [];
    foreach ($cands as $n) {
        if (in_array($kind . ':' . $ref, $n['skip'], true)) { continue; }
        if ($n['item_id'] && $ref) { $s = $pdo->prepare('SELECT 1 FROM investigation_item_links WHERE investigation_item_id=? AND entity_type=? AND entity_id=?'); $s->execute([$n['item_id'], $kind, $ref]); if ($s->fetchColumn()) { continue; } }
        $p = cxn_person($pdo, $n['person_id']);
        $personOk = $n['person_id'] && (in_array($n['person_id'], $pids, true) || cxn_name_in($p, $names));
        $yearOk = cxn_in_years($year ?: null, $n);
        $hasRange = $n['year_from'] !== null || $n['year_to'] !== null;
        $placeOk = $place !== '' && $n['place'] !== '' && (str_contains($place, cxn_fold($n['place'])) || str_contains(cxn_fold($n['place']), $place));
        $level = $personOk && $yearOk ? 'sure' : (($personOk || ($hasRange && $year && $yearOk && $placeOk)) ? 'close' : '');
        if ($level === '') { continue; }
        $out[] = $n + ['level' => $level];
    }
    usort($out, static fn($a, $b) => ($a['level'] === 'sure' ? 0 : 1) <=> ($b['level'] === 'sure' ? 0 : 1));
    return ['matches' => array_slice($out, 0, 20)];
}

/**
 * POST need_file {need_id | item_id, item: {kind, ref_id, title, value, origin}} : « Ranger dans l'enquête » — la pièce sur la piste
 * (cx_inv_receive), le besoin marqué rempli. → de quoi « ↶ Annuler » (need_file_undo).
 */
function cxn_file(PDO $pdo, array $d): array
{
    cxn_schema($pdo);
    $id = safe_int($d['need_id'] ?? 0); $created = false;
    $row = $id ? cxn_row($pdo, $id) : null;
    if (!$row && safe_int($d['item_id'] ?? 0)) { // un besoin deviné : il est écrit maintenant (pour garder qu'il est rempli)
        $s = $pdo->prepare('SELECT id FROM cx_needs WHERE item_id=?'); $s->execute([safe_int($d['item_id'])]); $id = (int) $s->fetchColumn();
        if (!$id) { $g = is_array($d['need'] ?? null) ? $d['need'] : []; $id = cxn_set($pdo, ['item_id' => safe_int($d['item_id'])] + $g)['id']; $created = true; }
        $row = cxn_row($pdo, $id);
    }
    if (!$row || !(int) $row['investigation_id']) { throw new LcndaBadInput('Besoin introuvable.'); }
    $item = is_array($d['item'] ?? null) ? $d['item'] : [];
    $rec = cx_inv_receive($pdo, ['investigation_id' => (int) $row['investigation_id'], 'item_id' => (int) $row['item_id'], 'items' => [$item]]);
    $c = cx_clean_item($item);
    $pdo->prepare("UPDATE cx_needs SET state='done', filled_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        ->execute([cx_json(['kind' => $c['kind'], 'ref_id' => $c['ref_id'], 'title' => $c['title'], 'at' => date('Y-m-d')]), $id]);
    return ['receive' => $rec, 'need_id' => $id, 'prev' => $created ? null : $row, 'created' => $created, 'investigation_id' => (int) $row['investigation_id'], 'item_id' => (int) $row['item_id']];
}

function cxn_file_undo(PDO $pdo, array $d): array
{
    cxn_schema($pdo);
    if (is_array($d['receive'] ?? null)) { cx_inv_receive_undo($pdo, $d['receive']); }
    return cxn_restore($pdo, ['id' => safe_int($d['need_id'] ?? 0), 'prev' => $d['prev'] ?? null]);
}

/** POST need_skip {need_id | item_id (+ need), key: « act:12 »} : « Pas lui » — ne plus proposer cette pièce pour ce besoin */
function cxn_skip(PDO $pdo, array $d, bool $undo = false): array
{
    cxn_schema($pdo);
    $id = safe_int($d['need_id'] ?? 0); $created = false;
    if (!$id && safe_int($d['item_id'] ?? 0)) {
        $s = $pdo->prepare('SELECT id FROM cx_needs WHERE item_id=?'); $s->execute([safe_int($d['item_id'])]); $id = (int) $s->fetchColumn();
        if (!$id && !$undo) { $g = is_array($d['need'] ?? null) ? $d['need'] : []; $id = cxn_set($pdo, ['item_id' => safe_int($d['item_id'])] + $g)['id']; $created = true; }
    }
    $row = $id ? cxn_row($pdo, $id) : null;
    if (!$row) { throw new LcndaBadInput('Besoin introuvable.'); }
    if ($undo && !empty($d['created'])) { $pdo->prepare('DELETE FROM cx_needs WHERE id=?')->execute([$id]); return ['need_id' => $id]; }
    $key = cx_str($d['key'] ?? '', 40);
    $list = ($row['skip_json'] ?? '') !== '' ? (json_decode((string) $row['skip_json'], true) ?: []) : [];
    $list = $undo ? array_values(array_filter($list, static fn($k) => $k !== $key)) : array_values(array_unique([...$list, $key]));
    $pdo->prepare('UPDATE cx_needs SET skip_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$list ? json_encode(array_slice($list, -200)) : '', $id]);
    return ['need_id' => $id, 'created' => $created];
}

/** POST need_media_recent {seen: [ids]} : les médias ajoutés il y a moins de 10 minutes, rattachés à une personne qui a un besoin ouvert (photo, ou document de la sorte attendue) */
function cxn_media_recent(PDO $pdo, array $d): array
{
    cxn_schema($pdo);
    $seen = array_flip(array_map('intval', is_array($d['seen'] ?? null) ? $d['seen'] : []));
    $s = $pdo->query("SELECT m.id, m.title, m.filename, m.media_type, m.date_text, m.document_title, m.description, group_concat(ml.entity_id) AS pids FROM media m
        JOIN media_links ml ON ml.media_id=m.id AND ml.entity_type='person' WHERE m.created_at >= datetime('now','-10 minutes') GROUP BY m.id ORDER BY m.id DESC LIMIT 60");
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $m) {
        if (isset($seen[(int) $m['id']])) { continue; }
        $txt = $m['title'] . ' ' . $m['document_title'] . ' ' . $m['description'];
        $what = cxn_what_of_text($txt) ?: ($m['media_type'] === 'image' ? 'photo' : '');
        if ($what === '') { continue; }
        $r = cxn_match($pdo, ['kind' => 'media', 'ref_id' => (int) $m['id'], 'what' => $what, 'person_ids' => array_map('intval', explode(',', (string) $m['pids'])), 'date' => (string) $m['date_text'] . ' ' . $txt]);
        foreach ($r['matches'] as $x) { if ($x['level'] === 'sure') { $out[] = ['media' => ['id' => (int) $m['id'], 'title' => (string) ($m['title'] ?: $m['filename'])], 'need' => $x]; break; } }
    }
    return ['matches' => $out, 'seen' => array_map(static fn($x) => $x['media']['id'], $out)];
}

/* ═════════════ 📋 Ma semaine → 🧩 Ce qui manque ═════════════ */

/** GET cx_needs_all : tous les besoins ouverts (écrits et devinés, enquêtes ouvertes), leurs réponses, et ce que les outils calculent (lieux sans position) */
function cxn_all(PDO $pdo, array $q): array
{
    cxn_schema($pdo);
    $rows = [];
    $invs = $pdo->query("SELECT id FROM investigations WHERE COALESCE(status,'open')='open' ORDER BY updated_at DESC LIMIT 200")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($invs as $i) { foreach (cxn_of_investigation($pdo, (int) $i) as $n) { if ($n['state'] === 'open') { $rows[] = $n; } } }
    // un besoin pour une hypothèse (sans piste)
    $s = $pdo->query("SELECT * FROM cx_needs WHERE item_id=0 AND state='open' ORDER BY id DESC LIMIT 200");
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $rows[] = cxn_out($pdo, $r); }
    $c = ['all' => 0, 'have' => 0, 'find' => 0, 'none' => 0];
    foreach ($rows as &$n) {
        $n['answers'] = cxn_answers($pdo, $n, 3);
        $yes = count(array_filter($n['answers'], static fn($a) => $a['have'] === 'yes'));
        $n['bucket'] = $yes ? 'have' : (array_filter($n['answers'], static fn($a) => $a['have'] === 'find') ? 'find' : 'none');
        $c['all']++; $c[$n['bucket']]++;
    }
    unset($n);
    // calculé : les lieux de la base sans position (la Carte)
    $places = (int) $pdo->query('SELECT count(*) FROM places pl WHERE (pl.latitude IS NULL OR pl.longitude IS NULL OR (pl.latitude=0 AND pl.longitude=0)) AND trim(COALESCE(pl.name,\'\'))<>\'\' AND EXISTS (SELECT 1 FROM events e WHERE e.place_id=pl.id)')->fetchColumn();
    $computed = [];
    if ($places) { $computed[] = ['tool' => 'map', 'what' => 'coords', 'count' => $places]; $c['all']++; $c['find']++; }
    return ['rows' => $rows, 'computed' => $computed, 'counts' => $c];
}

/* ═════════════ 📖 le livre, 📜 la monographie : « il me manque… » (calculé à l'ouverture de l'outil, une fois) ═════════════ */

function cxn_hints(PDO $pdo, array $q): array
{
    $tool = (string) ($q['tool'] ?? '');
    if ($tool === 'book') { return cxn_hints_book($pdo, $q); }
    if ($tool === 'place') { return cxn_hints_place($pdo, safe_int($q['place_id'] ?? 0)); }
    throw new LcndaBadInput('Outil inconnu.');
}

function cxn_hints_book(PDO $pdo, array $q): array
{
    $scope = in_array($q['scope'] ?? 'all', ['all', 'ancestors', 'descendants', 'both'], true) ? (string) ($q['scope'] ?? 'all') : 'all';
    $ids = [];
    if ($scope !== 'all' && function_exists('family_book_branch') && function_exists('person_select')) {
        $people = $pdo->query(person_select() . ' ORDER BY p.id')->fetchAll();
        [$branch] = family_book_branch($pdo, $people, safe_int($q['root_id'] ?? 0), $scope, max(1, min(30, safe_int($q['generations'] ?? 6) ?: 6)));
        $ids = array_map(static fn($p) => (int) $p['id'], $branch);
    } else { $ids = array_map('intval', $pdo->query('SELECT id FROM persons ORDER BY id LIMIT 5000')->fetchAll(PDO::FETCH_COLUMN)); }
    if (!$ids) { return ['total' => 0, 'rows' => []]; }
    $in = implode(',', array_slice($ids, 0, 5000));
    $names = static function (string $sql) use ($pdo): array { return array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => trim($r['first_name'] . ' ' . $r['last_name'])], $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC)); };
    $noPhoto = $names("SELECT p.id, p.first_name, p.last_name FROM persons p WHERE p.id IN ($in) AND NOT EXISTS (SELECT 1 FROM media_links ml JOIN media m ON m.id=ml.media_id WHERE ml.entity_type='person' AND ml.entity_id=p.id AND m.media_type='image') ORDER BY p.id");
    $noDate = $names("SELECT p.id, p.first_name, p.last_name FROM persons p WHERE p.id IN ($in) AND NOT EXISTS (SELECT 1 FROM events e WHERE e.person_id=p.id AND e.year IS NOT NULL) ORDER BY p.id");
    $tags = implode(',', array_map(static fn($t) => $pdo->quote($t), ['BIRT', 'CHR', 'BAPM', 'MARR', 'DEAT', 'BURI']));
    $unsourced = (int) $pdo->query("SELECT count(*) FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id
        WHERE t.gedcom_tag IN ($tags) AND (e.person_id IN ($in) OR f.partner1_id IN ($in) OR f.partner2_id IN ($in))
        AND NOT EXISTS (SELECT 1 FROM source_links sl WHERE sl.entity_type='event' AND sl.entity_id=e.id)")->fetchColumn();
    // ✓ je l'ai : une image où la personne est reliée existe-t-elle sur une autre fiche ? (rien de plus ici : le détail est dans Médias)
    $rows = [];
    if ($noPhoto) { $rows[] = ['what' => 'photo', 'count' => count($noPhoto), 'people' => array_slice($noPhoto, 0, 8)]; }
    if ($unsourced) { $rows[] = ['what' => 'source', 'count' => $unsourced]; }
    if ($noDate) { $rows[] = ['what' => 'date', 'count' => count($noDate), 'people' => array_slice($noDate, 0, 8)]; }
    return ['total' => array_sum(array_column($rows, 'count')), 'people' => count($ids), 'rows' => $rows];
}

/** les années « 1836 », « 1830-1840 », « 1830 à 1835 » d'un dépouillement → [début, fin] */
function cxn_years_of(string $t): ?array
{
    if (!preg_match_all('/\b(1[0-9]{3}|20[0-9]{2})\b/', $t, $m) || !$m[1]) { return null; }
    $y = array_map('intval', $m[1]);
    return [min($y), max($y)];
}

function cxn_hints_place(PDO $pdo, int $placeId): array
{
    cxn_schema($pdo);
    $s = $pdo->prepare('SELECT id, name, latitude, longitude FROM places WHERE id=?'); $s->execute([$placeId]); $pl = $s->fetch(PDO::FETCH_ASSOC);
    if (!$pl) { return ['total' => 0, 'rows' => []]; }
    $rows = [];
    // les années où la famille est là, sans dépouillement qui les couvre (« le registre de 1836 n'est pas dépouillé »)
    $s = $pdo->prepare('SELECT DISTINCT year FROM events WHERE place_id=? AND year IS NOT NULL ORDER BY year'); $s->execute([$placeId]);
    $years = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
    $cover = []; $todo = [];
    if (cxn_has($pdo, 'archive_digest_entries')) {
        $s = $pdo->prepare('SELECT id, year_text, record_type, status FROM archive_digest_entries WHERE place_id=?'); $s->execute([$placeId]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $d) { $r = cxn_years_of((string) $d['year_text']); if (!$r) { continue; } if (($d['status'] ?? '') === 'done') { $cover[] = $r; } else { $todo[] = (string) $d['year_text']; } }
    }
    $missing = array_values(array_filter($years, static function ($y) use ($cover) { foreach ($cover as [$a, $b]) { if ($y >= $a && $y <= $b) { return false; } } return true; }));
    if ($missing && cxn_has($pdo, 'archive_digest_entries')) { $rows[] = ['what' => 'digest', 'count' => count($missing), 'years' => array_slice($missing, 0, 8)]; }
    if ($todo) { $rows[] = ['what' => 'digest_todo', 'count' => count($todo), 'years' => array_slice($todo, 0, 6)]; }
    if (cxn_has($pdo, 'archive_digest_gaps') && cxn_has($pdo, 'archive_digest_entries')) {
        $s = $pdo->prepare("SELECT g.period_text, g.title FROM archive_digest_gaps g JOIN archive_digest_entries d ON d.id=g.archive_digest_id WHERE d.place_id=? AND g.status='open' LIMIT 6"); $s->execute([$placeId]);
        $gaps = $s->fetchAll(PDO::FETCH_ASSOC); if ($gaps) { $rows[] = ['what' => 'gap', 'count' => count($gaps), 'items' => array_map(static fn($g) => trim($g['title'] . ' ' . $g['period_text']), $gaps)]; }
    }
    $s = $pdo->prepare("SELECT count(*) FROM events e WHERE e.place_id=? AND NOT EXISTS (SELECT 1 FROM source_links sl WHERE sl.entity_type='event' AND sl.entity_id=e.id)"); $s->execute([$placeId]);
    $uns = (int) $s->fetchColumn(); if ($uns) { $rows[] = ['what' => 'source', 'count' => $uns]; }
    $s = $pdo->prepare("SELECT count(*) FROM cx_needs WHERE place_id=? AND state='open'"); $s->execute([$placeId]);
    $nn = (int) $s->fetchColumn(); if ($nn) { $rows[] = ['what' => 'needs', 'count' => $nn]; }
    if ($pl['latitude'] === null || $pl['longitude'] === null || ((float) $pl['latitude'] === 0.0 && (float) $pl['longitude'] === 0.0)) { $rows[] = ['what' => 'coords', 'count' => 1]; }
    return ['total' => count($rows), 'rows' => $rows, 'place' => (string) $pl['name']];
}

/* ═════════════ 🗺 « Mettre dans… » → une carte ═════════════ */

/** la position d'un élément pris : un lieu, l'événement (son lieu), une info avec lat / lon, ou un nom de lieu connu de la base */
function cxn_coords(PDO $pdo, array $c, array $data): ?array
{
    $ok = static fn($la, $lo) => is_numeric($la) && is_numeric($lo) && abs((float) $la) <= 90 && abs((float) $lo) <= 180 && !((float) $la == 0.0 && (float) $lo == 0.0);
    foreach ([['lat', 'lon'], ['latitude', 'longitude'], ['lat', 'lng']] as [$a, $b]) { if (isset($data[$a], $data[$b]) && $ok($data[$a], $data[$b])) { return [(float) $data[$a], (float) $data[$b]]; } }
    if ($c['ref_id'] && in_array($c['kind'], ['place', 'event', 'media'], true)) {
        $sql = match ($c['kind']) { 'place' => 'SELECT latitude, longitude FROM places WHERE id=?', 'event' => 'SELECT pl.latitude, pl.longitude FROM events e JOIN places pl ON pl.id=e.place_id WHERE e.id=?',
            'media' => 'SELECT pl.latitude, pl.longitude FROM media m JOIN places pl ON pl.id=m.place_id WHERE m.id=?' };
        try { $s = $pdo->prepare($sql); $s->execute([$c['ref_id']]); $r = $s->fetch(PDO::FETCH_NUM); if ($r && $ok($r[0], $r[1])) { return [(float) $r[0], (float) $r[1]]; } } catch (Throwable $_) {}
    }
    foreach ([$c['value'], $c['title']] as $name) { // un nom de lieu de la base (« Tulle », « Tulle (Corrèze) »)
        $n = trim((string) preg_replace('/\s*\(.*$/', '', (string) $name)); if ($n === '' || mb_strlen($n) > 80) { continue; }
        $s = $pdo->prepare('SELECT latitude, longitude FROM places WHERE name=? COLLATE NOCASE AND latitude IS NOT NULL AND longitude IS NOT NULL LIMIT 1'); $s->execute([$n]);
        $r = $s->fetch(PDO::FETCH_NUM); if ($r && $ok($r[0], $r[1])) { return [(float) $r[0], (float) $r[1]]; }
    }
    return null;
}

/** POST map_add {items} → {ids, left: [index des éléments sans position]} ; un ensemble (set) : une ligne = un point si elle a lat / lon */
function cxn_map_add(PDO $pdo, array $d): array
{
    cxn_schema($pdo);
    $items = array_values(array_filter(array_slice(is_array($d['items'] ?? null) ? $d['items'] : [], 0, 500), 'is_array'));
    $ins = $pdo->prepare('INSERT INTO cx_map_items(kind, ref_id, title, value, lat, lon, data_json, origin_json) VALUES(?,?,?,?,?,?,?,?)');
    $ids = []; $left = [];
    foreach ($items as $i => $raw) {
        $c = cx_clean_item($raw); $data = is_array($raw['data'] ?? null) ? $raw['data'] : [];
        if ($c['kind'] === 'set') { // les lignes d'un tableau : les colonnes lat / lon (ou latitude / longitude)
            $cols = array_map(static fn($x) => cxn_fold((string) $x), is_array($data['columns'] ?? null) ? $data['columns'] : []);
            $la = array_search('lat', $cols, true); if ($la === false) { $la = array_search('latitude', $cols, true); }
            $lo = array_search('lon', $cols, true); if ($lo === false) { $lo = array_search('longitude', $cols, true); } if ($lo === false) { $lo = array_search('lng', $cols, true); }
            $n = 0;
            if ($la !== false && $lo !== false) { foreach (array_slice(is_array($data['rows'] ?? null) ? $data['rows'] : [], 0, 2000) as $r) { if (!is_array($r) || !is_numeric($r[$la] ?? null) || !is_numeric($r[$lo] ?? null)) { continue; }
                $ins->execute(['row', 0, cx_str($r[0] ?? '', 300), cx_str($c['title'], 300), (float) $r[$la], (float) $r[$lo], '', $c['origin_json']]); $ids[] = (int) $pdo->lastInsertId(); $n++; } }
            if (!$n) { $left[] = $i; }
            continue;
        }
        $pt = cxn_coords($pdo, $c, $data);
        if (!$pt) { $left[] = $i; continue; }
        $ins->execute([$c['kind'], $c['ref_id'], $c['title'], $c['value'], $pt[0], $pt[1], '', $c['origin_json']]); $ids[] = (int) $pdo->lastInsertId();
    }
    return ['ids' => $ids, 'left' => $left, 'count' => (int) $pdo->query('SELECT count(*) FROM cx_map_items')->fetchColumn()];
}

function cxn_map_list(PDO $pdo): array
{
    cxn_schema($pdo);
    return ['items' => array_map(static function ($r) { $o = cx_row_out($r); $o['lat'] = (float) $r['lat']; $o['lon'] = (float) $r['lon']; return $o; },
        $pdo->query('SELECT * FROM cx_map_items ORDER BY id LIMIT 5000')->fetchAll(PDO::FETCH_ASSOC))];
}

function cxn_map_remove(PDO $pdo, array $d): array
{
    cxn_schema($pdo);
    $ids = array_values(array_filter(array_map('intval', is_array($d['ids'] ?? null) ? $d['ids'] : [])));
    $where = !empty($d['all']) ? '1' : 'id IN (' . implode(',', $ids ?: [0]) . ')';
    $rows = $pdo->query("SELECT * FROM cx_map_items WHERE $where")->fetchAll(PDO::FETCH_ASSOC);
    $pdo->exec("DELETE FROM cx_map_items WHERE $where");
    return ['removed' => $rows];
}

function cxn_map_restore(PDO $pdo, array $d): array
{
    cxn_schema($pdo);
    $ins = $pdo->prepare('INSERT OR IGNORE INTO cx_map_items(id, kind, ref_id, title, value, lat, lon, data_json, origin_json, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
    $n = 0;
    foreach (array_slice(is_array($d['rows'] ?? null) ? $d['rows'] : [], 0, 5000) as $r) {
        if (!is_array($r) || !is_numeric($r['lat'] ?? null) || !is_numeric($r['lon'] ?? null)) { continue; }
        $ins->execute([safe_int($r['id'] ?? 0) ?: null, in_array($r['kind'] ?? '', CX_KINDS, true) ? $r['kind'] : 'datum', safe_int($r['ref_id'] ?? 0), cx_str($r['title'] ?? '', 500), cx_str($r['value'] ?? '', 2000),
            (float) $r['lat'], (float) $r['lon'], (string) ($r['data_json'] ?? ''), (string) ($r['origin_json'] ?? ''), (string) ($r['created_at'] ?? date('Y-m-d H:i:s'))]);
        $n++;
    }
    return ['restored' => $n];
}

/* ═════════════ aiguillage (appelé par cx_api_get / cx_api_post) ═════════════ */
function cxn_api_get(PDO $pdo, string $action, array $q): ?array
{
    return match ($action) {
        'cx_needs' => cxn_investigation($pdo, $q),
        'cx_needs_all' => cxn_all($pdo, $q),
        'cx_hints' => cxn_hints($pdo, $q),
        'cx_map' => cxn_map_list($pdo),
        default => null,
    };
}

function cxn_api_post(PDO $pdo, string $op, array $d): ?array
{
    return match ($op) {
        'need_set' => cxn_set($pdo, $d),
        'need_remove' => (static function () use ($pdo, $d) { cxn_schema($pdo); $id = safe_int($d['id'] ?? 0); $row = cxn_row($pdo, $id); $pdo->prepare('DELETE FROM cx_needs WHERE id=?')->execute([$id]); return ['prev' => $row]; })(),
        'need_restore' => cxn_restore($pdo, $d),
        'need_match' => cxn_match($pdo, $d),
        'need_file' => cxn_file($pdo, $d),
        'need_file_undo' => cxn_file_undo($pdo, $d),
        'need_skip' => cxn_skip($pdo, $d),
        'need_unskip' => cxn_skip($pdo, $d, true),
        'need_media_recent' => cxn_media_recent($pdo, $d),
        'map_add' => cxn_map_add($pdo, $d),
        'map_remove' => cxn_map_remove($pdo, $d),
        'map_restore' => cxn_map_restore($pdo, $d),
        default => null,
    };
}
