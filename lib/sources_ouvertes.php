<?php
declare(strict_types=1);

/**
 * 🗂 Archives en ligne : Mémoire des hommes, Léonore (Légion d'honneur), registres matricules, presse ancienne.
 *
 * Même principe que les recensements SocFace (lib/socface.php) : le serveur NE SE CONNECTE À AUCUN de ces sites. La page
 * ouvre la recherche dans le navigateur de la personne (adresses : assets/js/app-sources-ouvertes-core.js) ; ensuite la
 * personne importe ce qu'elle a téléchargé (image, PDF, texte d'une page enregistrée) ou colle un lien et recopie les cases.
 *
 * Un import (POST so_import, multipart : « file » facultatif + « data » en JSON) :
 *  - range le fichier dans les médias (lot_store_upload : liste blanche, premiers octets vérifiés) et le relie à la fiche ;
 *  - crée une source (avec le lien) reliée à la fiche (et à l'événement créé) ;
 *  - selon la sorte : 🎖 Mémoire des hommes → décès « Mort pour la France » proposé (seulement si la fiche n'a pas de décès),
 *    case « Mort pour la France » (seulement si elle était « inconnu »), unité ajoutée au bloc Poilu ;
 *    🏅 Léonore → une récompense « 🎖 Décoration » dans « 🏆 Concours et récompenses » (lib/blocs.php) ;
 *    📋 matricule → les cases VIDES du bloc Militaire (military_data), rien de rempli n'est remplacé ;
 *    📰 presse → un passage dans « 📰 Dans les médias » (lib/blocs.php) ;
 *  - garde tout dans so_imports pour « ↶ Annuler » (POST so_undo) : ce qui a été créé est retiré, les anciennes valeurs reviennent.
 * GET so_context : ce que la fiche apporte à la recherche (nom, années, lieux, département et ses archives, unités, classe).
 * POST so_preview : « c'est la même personne ? » — les écarts entre le document et la fiche ; rien n'est écrit.
 */

const SO_KINDS = ['mdh', 'leonore', 'matricule', 'presse'];
const SO_MENTION = 'Lu sur un site d’archives en ligne et recopié : à vérifier sur le document';
const SO_FILE_TYPES = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'txt'];
/** les cases du bloc Militaire qu'un matricule peut remplir (seulement si elles sont vides) */
const SO_MIL_FIELDS = ['matricule', 'classe_mobilisation', 'bureau_recrutement', 'cheveux', 'yeux', 'taille', 'degre_instruction_gen', 'localites_successives'];

function so_schema(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $done = true;
    $pdo->exec("CREATE TABLE IF NOT EXISTS so_imports (
        batch TEXT PRIMARY KEY,
        kind TEXT NOT NULL DEFAULT '',
        person_id INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        summary TEXT NOT NULL DEFAULT '',
        ids TEXT NOT NULL DEFAULT '{}',
        before_json TEXT NOT NULL DEFAULT '{}',
        undone_at TEXT NOT NULL DEFAULT '')");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_so_imports_person ON so_imports(person_id)');
}

function so_fold(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'œ' => 'oe', 'æ' => 'ae', '’' => "'", '-' => ' ']);
    return (string) preg_replace('/\s+/', ' ', $s);
}
function so_text(mixed $v, int $max = 500): string { return mb_substr(trim(is_scalar($v) ? safe_text($v) : ''), 0, $max); }
function so_url(mixed $v): string { $s = trim(is_scalar($v) ? (string) $v : ''); return preg_match('#^https?://[^\s<>"\'`]+$#i', $s) && strlen($s) <= 2000 ? $s : ''; }
function so_year(string $s): int { return preg_match('/\b(1[5-9]\d\d|20\d\d)\b/', $s, $m) ? (int) $m[1] : 0; }

/** le département d'un lieu (nom du département ou code) → la ligne de la liste des Archives départementales de l'app */
function so_department(string $county, string $placeName = ''): ?array
{
    if (!function_exists('departmental_archives_seed')) { return null; }
    $c = so_fold($county);
    if ($c === '' && preg_match('/\((\d{2}|2a|2b|9[78]\d)\)/i', $placeName, $m)) { $c = strtolower($m[1]); }
    if ($c === '') { return null; }
    foreach (departmental_archives_seed() as $a) {
        if ($c === so_fold((string) $a['department']) || $c === strtolower((string) $a['code'])) {
            $url = so_url($a['search_url'] ?? '');
            return ['code' => (string) $a['code'], 'name' => (string) $a['department'], 'service' => (string) $a['service'], 'url' => $url,
                'root' => $url !== '' && preg_match('#^(https?://[^/?\#]+)#i', $url, $r) ? $r[1] . '/' : ''];
        }
    }
    return null;
}

/** GET so_context : ce que la fiche apporte à la recherche */
function so_context(PDO $pdo, int $personId): array
{
    so_schema($pdo);
    $depts = function_exists('departmental_archives_seed') ? array_map(static function (array $a): array { $u = so_url($a['search_url'] ?? '');
        return ['code' => (string) $a['code'], 'name' => (string) $a['department'], 'service' => (string) $a['service'], 'url' => $u, 'root' => $u !== '' && preg_match('#^(https?://[^/?\#]+)#i', $u, $r) ? $r[1] . '/' : '']; }, departmental_archives_seed()) : [];
    if ($personId <= 0) { return ['person' => null, 'depts' => $depts, 'dept' => null, 'units' => [], 'places' => [], 'military' => [], 'imports' => []]; }
    $s = $pdo->prepare('SELECT id, first_name, middle_name, last_name, gender, living_status, COALESCE(mort_pour_la_france,\'unknown\') AS mpf, COALESCE(military_data,\'\') AS military_data, COALESCE(is_locked,0) AS is_locked FROM persons WHERE id=?');
    $s->execute([$personId]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Fiche introuvable.'); }
    $ev = $pdo->prepare("SELECT e.id, e.date_text, e.year, t.gedcom_tag AS tag, t.label, pl.name AS place, COALESCE(pl.county,'') AS county, COALESCE(pl.country,'') AS country
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=? ORDER BY COALESCE(e.year,9999), e.id");
    $ev->execute([$personId]);
    $events = $ev->fetchAll(PDO::FETCH_ASSOC);
    $first = static function (array $tags) use ($events): ?array { foreach ($events as $e) { if (in_array($e['tag'], $tags, true)) { return $e; } } return null; };
    $birth = $first(['BIRT']) ?? $first(['CHR', 'BAPM']);
    $death = $first(['DEAT']) ?? $first(['BURI']);
    $by = (int) ($birth['year'] ?? 0); $dy = (int) ($death['year'] ?? 0);
    // le lieu de vie à 20 ans (résidence, recensement, mariage autour de ses 20 ans), sinon la naissance
    $at20 = null;
    if ($by) { foreach ($events as $e) { if (in_array($e['tag'], ['RESI', 'CENS', 'MARR', 'OCCU'], true) && (int) $e['year'] >= $by + 15 && (int) $e['year'] <= $by + 26 && $e['place']) { $at20 = $e; break; } } }
    $deptFrom = $at20 ?? $birth;
    $dept = $deptFrom ? so_department((string) $deptFrom['county'], (string) $deptFrom['place']) : null;
    $units = [];
    try { $u = $pdo->prepare('SELECT unit_name, date_from, date_to FROM poilu_units WHERE person_id=? ORDER BY position, id'); $u->execute([$personId]); $units = $u->fetchAll(PDO::FETCH_ASSOC); } catch (Throwable $_) {}
    $mil = json_decode((string) $p['military_data'], true);
    $mil = is_array($mil) ? $mil : [];
    $imports = $pdo->prepare("SELECT batch, kind, created_at, summary FROM so_imports WHERE person_id=? AND undone_at='' ORDER BY created_at DESC LIMIT 20");
    $imports->execute([$personId]);
    return [
        'person' => ['id' => (int) $p['id'], 'first' => trim((string) $p['first_name'] . ' ' . (string) $p['middle_name']), 'last' => (string) $p['last_name'], 'gender' => (string) $p['gender'],
            'living_status' => (string) $p['living_status'], 'mpf' => (string) $p['mpf'], 'locked' => (int) $p['is_locked'] === 1, 'birth_year' => $by ?: null, 'death_year' => $dy ?: null],
        'birth' => $birth ? ['date' => (string) $birth['date_text'], 'year' => $by ?: null, 'place' => (string) $birth['place'], 'county' => (string) $birth['county']] : null,
        'death' => $death ? ['date' => (string) $death['date_text'], 'year' => $dy ?: null, 'place' => (string) $death['place'], 'tag' => (string) $death['tag']] : null,
        'has_death' => (bool) $first(['DEAT']),
        'at20' => $at20 ? ['place' => (string) $at20['place'], 'year' => (int) $at20['year'], 'label' => (string) $at20['label']] : null,
        'places' => array_values(array_unique(array_filter(array_map(static fn($e) => (string) $e['place'], $events)))),
        'dept' => $dept, 'depts' => $depts, 'units' => $units,
        'military' => array_intersect_key($mil, array_flip(array_merge(SO_MIL_FIELDS, ['services_mutations']))),
        'imports' => $imports->fetchAll(PDO::FETCH_ASSOC),
    ];
}

/** les champs envoyés par la page, nettoyés et bornés */
function so_clean(array $d): array
{
    $kind = in_array($d['kind'] ?? '', SO_KINDS, true) ? (string) $d['kind'] : '';
    if ($kind === '') { throw new LcndaBadInput('Sorte d’import inconnue.'); }
    $f = is_array($d['fields'] ?? null) ? $d['fields'] : [];
    $out = ['kind' => $kind, 'person_id' => safe_int($d['person_id'] ?? 0), 'site' => so_text($d['site'] ?? '', 40), 'url' => so_url($d['url'] ?? ''), 'fields' => []];
    $long = ['text', 'localites_successives', 'campagnes', 'blessures', 'notes', 'transcript'];
    foreach ($f as $k => $v) {
        if (!is_string($k) || !preg_match('/^[a-z_]{1,40}$/', $k) || count($out['fields']) >= 60) { continue; }
        $out['fields'][$k] = so_text($v, in_array($k, $long, true) ? 20000 : 500);
    }
    foreach (['add_death', 'set_mpf', 'add_unit'] as $k) { $out[$k] = !empty($d[$k]) && $d[$k] !== '0'; }
    $out['place_id'] = is_scalar($d['place_id'] ?? null) && preg_match('/^w?\d{1,12}$/', (string) $d['place_id']) ? (string) $d['place_id'] : '';
    return $out;
}

/** POST so_preview : « c'est la même personne ? » — rien n'est écrit */
function so_preview(PDO $pdo, array $data): array
{
    $c = so_clean($data);
    $ctx = so_context($pdo, $c['person_id']);
    $f = $c['fields']; $p = $ctx['person']; $out = [];
    $add = static function (string $level, string $text) use (&$out): void { $out[] = ['level' => $level, 'text' => $text]; };
    if (!empty($f['last']) && $p['last'] !== '' && so_fold($f['last']) !== so_fold($p['last'])) { $add('orange', 'Le document dit « ' . $f['last'] . ' », la fiche « ' . $p['last'] . ' » : est-ce bien la même personne ?'); }
    if (!empty($f['first']) && $p['first'] !== '') {
        $a = explode(' ', so_fold($f['first']))[0]; $b = explode(' ', so_fold($p['first']));
        if (!in_array($a, $b, true)) { $add('orange', 'Prénom lu « ' . $f['first'] . ' », la fiche dit « ' . $p['first'] . ' ».'); }
    }
    $by = so_year((string) ($f['birth_date'] ?? ''));
    if ($by && $p['birth_year'] && abs($by - (int) $p['birth_year']) > 1) { $add('orange', 'Né en ' . $by . ' d’après le document, en ' . $p['birth_year'] . ' d’après la fiche.'); }
    if ($c['kind'] === 'mdh') {
        $dy = so_year((string) ($f['death_date'] ?? ''));
        if ($ctx['has_death']) { $add($dy && $ctx['death']['year'] && $dy !== (int) $ctx['death']['year'] ? 'orange' : 'info', 'La fiche a déjà un décès (' . trim(($ctx['death']['date'] ?: '') . ' ' . ($ctx['death']['place'] ? 'à ' . $ctx['death']['place'] : '')) . ') : il est gardé tel quel, aucun autre n’est ajouté.'); }
        if ($p['mpf'] === 'no') { $add('orange', 'La fiche dit « pas Mort pour la France » : la case n’est pas changée. Change-la toi-même si le document le dit.'); }
        if ($p['gender'] === 'female') { $add('yellow', 'La fiche est celle d’une femme : vérifie que c’est la bonne personne.'); }
    }
    if ($c['kind'] === 'matricule') {
        foreach (SO_MIL_FIELDS as $k) {
            $old = trim((string) ($ctx['military'][$k] ?? '')); $new = trim((string) ($f[$k] ?? ''));
            if ($old !== '' && $new !== '' && so_fold($old) !== so_fold($new)) { $add('yellow', 'Bloc Militaire : « ' . $k . ' » vaut déjà « ' . $old . ' » — gardé, « ' . $new . ' » n’est pas écrit.'); }
        }
    }
    if ($c['url'] !== '') {
        $s = $pdo->prepare('SELECT count(*) FROM sources s JOIN source_links l ON l.source_record_id=s.id WHERE s.url=? AND l.entity_type=\'person\' AND l.entity_id=?');
        $s->execute([$c['url'], $c['person_id']]);
        if ((int) $s->fetchColumn()) { $add('yellow', 'Ce lien est déjà une source de cette fiche : l’importer encore ferait un doublon.'); }
    }
    return ['ecarts' => $out, 'context' => $ctx];
}

/** range le fichier reçu (liste blanche réduite : images, PDF, texte) ; rend [nom, type de média] */
function so_store_file(?array $file): ?array
{
    if (!$file || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) { return null; }
    if ((int) ($file['error'] ?? 1) !== UPLOAD_ERR_OK) { throw new LcndaBadInput(upload_failure_message($file)); }
    $name = (string) ($file['name'] ?? 'fichier');
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!in_array($ext, SO_FILE_TYPES, true)) { throw new LcndaBadInput('Ici, on range une image (JPG, PNG, WebP, GIF), un PDF ou un texte (.txt).'); }
    if (!function_exists('lot_store_upload')) { require_once __DIR__ . '/lots.php'; }
    $r = lot_store_upload($file, $name);
    return [$r['name'], $r['media_type'], $name];
}

/** POST so_import (multipart) */
function so_import(PDO $pdo, ?array $file, array $data): array
{
    so_schema($pdo);
    $c = so_clean($data);
    $pid = $c['person_id'];
    if (!$pid || !person_exists($pdo, $pid)) { throw new RuntimeException('Choisis d’abord la fiche à qui ce document se rapporte.'); }
    assert_person_unlocked($pdo, $pid);
    $f = $c['fields'];
    $ctx = so_context($pdo, $pid);
    $stored = so_store_file($file);
    if (!$stored && $c['url'] === '' && trim((string) ($f['text'] ?? '')) === '') {
        throw new LcndaBadInput('Il faut un fichier, un lien ou au moins le texte du document.');
    }
    $batch = 'so-' . bin2hex(random_bytes(6));
    $ids = ['media' => [], 'media_links' => [], 'sources' => [], 'source_links' => [], 'events' => [], 'items' => [], 'poilu_units' => []];
    $before = [];
    $who = trim(($f['first'] ?? '') . ' ' . mb_strtoupper((string) ($f['last'] ?? ''))) ?: trim($ctx['person']['first'] . ' ' . mb_strtoupper($ctx['person']['last']));
    $notes = [];
    $pdo->beginTransaction();
    try {
        // 1. le fichier → un média relié à la fiche
        $mediaId = 0; $mediaFile = '';
        $kindTitle = ['mdh' => 'Fiche Mémoire des hommes', 'leonore' => 'Dossier de Légion d’honneur (Léonore)', 'matricule' => 'Registre matricule', 'presse' => 'Article de presse'][$c['kind']];
        if ($stored) {
            [$mediaFile, $mtype, $orig] = $stored;
            $title = so_text($f['media_title'] ?? '', 300) ?: $kindTitle . ' — ' . $who;
            $pdo->prepare('INSERT INTO media(title, description, media_type, filename, thumbnail, date_text, document_reference, document_title, document_url, transcription) VALUES(?,?,?,?,?,?,?,?,?,?)')
                ->execute([$title, SO_MENTION . '.', $mtype, $mediaFile, $mtype === 'image' ? $mediaFile : '', so_text($f['date'] ?? ($f['death_date'] ?? ''), 100),
                    so_text($f['cote'] ?? ($f['matricule'] ?? ''), 200), $kindTitle, $c['url'], so_text($f['transcript'] ?? ($f['text'] ?? ''), 20000)]);
            $mediaId = (int) $pdo->lastInsertId(); $ids['media'][] = $mediaId;
            $pos = $pdo->prepare("SELECT COALESCE(max(position),0)+1 FROM media_links WHERE entity_type='person' AND entity_id=?"); $pos->execute([$pid]);
            $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'person', ?, ?)")->execute([$mediaId, $pid, (float) $pos->fetchColumn()]);
            $ids['media_links'][] = (int) $pdo->lastInsertId();
            if ($c['kind'] === 'matricule') { // aussi dans « Documents liés » du bloc Militaire
                try { $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'military', ?, 0)")->execute([$mediaId, $pid]); $ids['media_links'][] = (int) $pdo->lastInsertId(); } catch (Throwable $_) {}
            }
            log_change($pdo, 'media', $mediaId, 'create', $kindTitle . ' importé(e) pour ' . $who);
        }
        // 2. selon la sorte
        $eventId = 0; $summary = '';
        if ($c['kind'] === 'mdh') {
            $deathDate = so_text($f['death_date'] ?? '', 100);
            if ($c['add_death'] && !$ctx['has_death'] && ($deathDate !== '' || $c['place_id'] !== '' || !empty($f['death_place']))) {
                $type = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='DEAT' ORDER BY id LIMIT 1")->fetchColumn();
                if ($type) {
                    $desc = trim(($f['mpf'] ?? '') === 'yes' || $c['set_mpf'] ? 'Mort pour la France' : '');
                    $desc = trim($desc . (!empty($f['cause']) ? ($desc !== '' ? ' — ' : '') . $f['cause'] : '') . (!empty($f['unit']) ? ' (' . $f['unit'] . ')' : ''));
                    $eventId = (int) add_event($pdo, ['person_id' => $pid, 'event_type_id' => $type, 'date_text' => $deathDate, 'place_id' => $c['place_id'], 'place_name' => so_text($f['death_place'] ?? '', 200), 'description' => $desc])['id'];
                    $ids['events'][] = $eventId; $notes[] = 'décès ajouté';
                }
            } elseif ($c['add_death'] && $ctx['has_death']) { $notes[] = 'décès déjà sur la fiche, gardé'; }
            if ($c['set_mpf']) {
                if (in_array($ctx['person']['mpf'], ['', 'unknown'], true)) {
                    $before['mpf'] = $ctx['person']['mpf'];
                    $pdo->prepare("UPDATE persons SET mort_pour_la_france='yes', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$pid]);
                    $notes[] = 'case « Mort pour la France » cochée';
                } elseif ($ctx['person']['mpf'] !== 'yes') { $notes[] = 'case « Mort pour la France » laissée telle quelle'; }
            }
            $unit = so_text($f['unit'] ?? '', 200);
            if ($c['add_unit'] && $unit !== '') {
                $has = false; foreach ($ctx['units'] as $u) { if (so_fold((string) $u['unit_name']) === so_fold($unit)) { $has = true; } }
                if (!$has) {
                    $pdo->prepare('INSERT INTO poilu_units(person_id, unit_name, date_from, date_to, jmo_cote, jmo_url, note, position) VALUES(?,?,?,?,?,?,?,?)')->execute([$pid, $unit, '', '', '', '', 'D’après la fiche Mémoire des hommes', count($ctx['units'])]);
                    $ids['poilu_units'][] = (int) $pdo->lastInsertId(); $notes[] = 'unité ajoutée au bloc Poilu';
                    $flag = (int) $pdo->query('SELECT COALESCE(show_poilu_block,0) FROM persons WHERE id=' . $pid)->fetchColumn();
                    if (!$flag) { $before['show_poilu_block'] = 0; $pdo->prepare('UPDATE persons SET show_poilu_block=1 WHERE id=?')->execute([$pid]); }
                }
            }
            $summary = 'Mémoire des hommes';
        } elseif ($c['kind'] === 'leonore') {
            if (!function_exists('blocs_save_item')) { require_once __DIR__ . '/blocs.php'; }
            $grade = so_text($f['grade'] ?? '', 120);
            $d = ['category' => 'decoration', 'level' => 'national', 'title' => 'Légion d’honneur' . ($grade !== '' ? ' · ' . $grade : ''), 'grade' => $grade, 'date' => so_text($f['date'] ?? '', 100),
                'promotion' => so_text($f['promotion'] ?? '', 200), 'decree' => so_text($f['decree'] ?? '', 300), 'dossier' => $c['url'], 'org' => 'Grande chancellerie de la Légion d’honneur',
                'source' => trim('Base Léonore (Archives nationales)' . (!empty($f['cote']) ? ', dossier ' . $f['cote'] : '')),
                'notes' => trim((!empty($f['cote']) ? 'N° de dossier : ' . $f['cote'] . "\n" : '') . SO_MENTION . '.' . (!empty($f['notes']) ? "\n" . $f['notes'] : ''))];
            if ($mediaId) { $d['photo'] = ['mid' => $mediaId, 'f' => $mediaFile, 'title' => $kindTitle]; }
            $ids['items'][] = (int) blocs_save_item($pdo, ['person_id' => $pid, 'kind' => 'award', 'data' => $d])['id'];
            $notes[] = 'récompense ajoutée (🏆 Concours et récompenses)';
            $summary = 'Léonore';
        } elseif ($c['kind'] === 'matricule') {
            $raw = (string) $pdo->query('SELECT COALESCE(military_data,\'\') FROM persons WHERE id=' . $pid)->fetchColumn();
            $mil = json_decode($raw, true); $mil = is_array($mil) ? $mil : [];
            $new = $mil; $filled = [];
            foreach (SO_MIL_FIELDS as $k) {
                $v = so_text($f[$k] ?? '', $k === 'localites_successives' ? 5000 : 300);
                if ($v !== '' && trim((string) ($mil[$k] ?? '')) === '') { $new[$k] = $v; $filled[] = $k; }
            }
            $extra = [];
            foreach (['campagnes' => 'Campagnes', 'blessures' => 'Blessures, citations'] as $k => $lab) { $v = so_text($f[$k] ?? '', 5000); if ($v !== '') { $extra[] = $lab . ' : ' . $v; } }
            if ($extra) {
                $old = trim((string) ($mil['services_mutations'] ?? '')); $txt = implode("\n", $extra);
                if (!str_contains(so_fold($old), so_fold($txt))) { $new['services_mutations'] = $old !== '' ? $old . "\n" . $txt : $txt; $filled[] = 'services_mutations'; }
            }
            if ($filled) {
                $before['military_data'] = $raw;
                $after = json_encode($new, JSON_UNESCAPED_UNICODE);
                $before['military_after'] = $after;
                $pdo->prepare('UPDATE persons SET military_data=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$after, $pid]);
                log_change($pdo, 'person', $pid, 'military', 'Registre matricule importé : ' . count($filled) . ' case(s) du bloc Militaire remplie(s)');
                $notes[] = count($filled) . ' case' . (count($filled) > 1 ? 's' : '') . ' du bloc Militaire remplie' . (count($filled) > 1 ? 's' : '');
            }
            if ($ctx['person']['gender'] !== 'male') {
                $flag = (int) $pdo->query('SELECT COALESCE(show_military_block,0) FROM persons WHERE id=' . $pid)->fetchColumn();
                if (!$flag) { $before['show_military_block'] = 0; $pdo->prepare('UPDATE persons SET show_military_block=1 WHERE id=?')->execute([$pid]); }
            }
            $summary = 'Registre matricule';
        } else { // presse
            if (!function_exists('blocs_save_item')) { require_once __DIR__ . '/blocs.php'; }
            $journal = so_text($f['journal'] ?? '', 200);
            $ptypes = ['article', 'faits_divers', 'necrologie', 'naissance', 'mariage', 'deces', 'annonce', 'palmares', 'portrait', 'citation', 'autre'];
            $d = ['medium' => 'presse', 'ptype' => in_array($f['ptype'] ?? '', $ptypes, true) ? $f['ptype'] : 'article', 'date' => so_text($f['date'] ?? '', 100),
                'title' => so_text($f['title'] ?? '', 300) ?: ($journal !== '' ? $journal : 'Article'), 'pages' => so_text($f['page'] ?? '', 60) !== '' ? 'p. ' . preg_replace('/^p\.?\s*/i', '', so_text($f['page'], 60)) : '',
                'url' => $c['url'], 'transcript' => so_text($f['transcript'] ?? ($f['text'] ?? ''), 20000), 'notes' => SO_MENTION . '.' . ($c['site'] !== '' ? ' (' . $c['site'] . ')' : '')];
            if ($journal !== '') { $d['outlet'] = ['txt' => $journal]; }
            if ($mediaId) { $d['file'] = ['mid' => $mediaId, 'f' => $mediaFile, 'title' => $kindTitle]; }
            $ids['items'][] = (int) blocs_save_item($pdo, ['person_id' => $pid, 'kind' => 'press_item', 'data' => $d])['id'];
            $notes[] = 'passage ajouté (📰 Dans les médias)';
            $summary = 'Presse';
        }
        // 3. la source, avec le lien ; reliée à la fiche, à l'événement créé et au média
        [$srcTitle, $agency, $publication] = match ($c['kind']) {
            'mdh' => ['Mémoire des hommes — ' . $who . (!empty($f['death_date']) ? ', décédé le ' . $f['death_date'] : ''), 'Ministère des Armées (SGA) — Mémoire des hommes', so_text($f['base'] ?? '', 120) ?: 'Morts pour la France'],
            'leonore' => ['Dossier de Légion d’honneur — ' . $who . (!empty($f['cote']) ? ' (' . $f['cote'] . ')' : ''), 'Archives nationales — base Léonore', 'Légion d’honneur'],
            'matricule' => ['Registre matricule — ' . $who . (!empty($f['classe_mobilisation']) ? ', classe ' . $f['classe_mobilisation'] : '') . (!empty($f['matricule']) ? ', n° ' . $f['matricule'] : ''),
                so_text($f['service'] ?? '', 200) ?: ($ctx['dept']['service'] ?? 'Archives départementales'), 'Registres matricules' . (!empty($f['bureau_recrutement']) ? ' — bureau de ' . $f['bureau_recrutement'] : '')],
            default => [trim((so_text($f['journal'] ?? '', 200) ?: 'Journal') . (!empty($f['date']) ? ', ' . $f['date'] : '') . (!empty($f['page']) ? ', p. ' . preg_replace('/^p\.?\s*/i', '', (string) $f['page']) : '') . (!empty($f['title']) ? ' — « ' . $f['title'] . ' »' : '')),
                (['gallica' => 'Gallica (BnF)', 'retronews' => 'RetroNews (BnF)', 'europeana' => 'Europeana'] + (function_exists('so4_press_agencies') ? so4_press_agencies() : []))[$c['site']] ?? 'Presse ancienne', so_text($f['journal'] ?? '', 200)],
        };
        $text = SO_MENTION . '.' . (trim((string) ($f['text'] ?? '')) !== '' ? "\n\n" . so_text($f['text'], 20000) : '');
        $pdo->prepare("INSERT INTO sources(title, author, agency, publication, url, text) VALUES(?,?,?,?,?,?)")->execute([mb_substr($srcTitle, 0, 400), '', $agency, $publication, $c['url'], $text]);
        $sid = (int) $pdo->lastInsertId(); $ids['sources'][] = $sid;
        $link = $pdo->prepare('INSERT INTO source_links(entity_type, entity_id, source_record_id, page, quality, note) VALUES(?,?,?,?,?,?)');
        $page = so_text($f['page'] ?? ($f['cote'] ?? ($f['matricule'] ?? '')), 120);
        $link->execute(['person', $pid, $sid, $page, '', SO_MENTION]); $ids['source_links'][] = (int) $pdo->lastInsertId();
        if ($eventId) { $link->execute(['event', $eventId, $sid, $page, '', SO_MENTION]); $ids['source_links'][] = (int) $pdo->lastInsertId(); }
        if ($mediaId) { $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'source', ?, 0)")->execute([$mediaId, $sid]); $ids['media_links'][] = (int) $pdo->lastInsertId(); }
        $summary .= ' : ' . implode(', ', array_merge($mediaId ? ['document rangé dans les médias'] : [], ['source créée'], $notes));
        $pdo->prepare('INSERT INTO so_imports(batch, kind, person_id, summary, ids, before_json) VALUES(?,?,?,?,?,?)')
            ->execute([$batch, $c['kind'], $pid, $summary, json_encode($ids), json_encode($before, JSON_UNESCAPED_UNICODE)]);
        log_change($pdo, 'person', $pid, 'update', $summary . ' — ' . SO_MENTION);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        if ($stored) { @unlink(MEDIA_DIR . '/' . $stored[0]); }
        throw $e;
    }
    return ['batch' => $batch, 'summary' => $summary, 'media_id' => $ids['media'][0] ?? 0, 'source_id' => $ids['sources'][0] ?? 0, 'event_id' => $ids['events'][0] ?? 0, 'item_id' => $ids['items'][0] ?? 0, 'notes' => $notes];
}

/** POST so_undo : retire tout ce qu'un import a ajouté et remet les anciennes valeurs */
function so_undo(PDO $pdo, array $data): array
{
    so_schema($pdo);
    $batch = so_text($data['batch'] ?? '', 40);
    $s = $pdo->prepare("SELECT * FROM so_imports WHERE batch=? AND undone_at=''"); $s->execute([$batch]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Cet import est déjà annulé, ou introuvable.'); }
    $ids = json_decode((string) $row['ids'], true) ?: []; $before = json_decode((string) $row['before_json'], true) ?: [];
    $pid = (int) $row['person_id'];
    assert_person_unlocked($pdo, $pid);
    $files = [];
    $pdo->beginTransaction();
    try {
        foreach (array_map('intval', $ids['items'] ?? []) as $id) {
            $pdo->prepare('DELETE FROM items WHERE id=? AND person_id=?')->execute([$id, $pid]);
            foreach (['item_people' => 'item_id', 'item_links' => 'from_id', 'item_rows' => 'item_id'] as $t => $col) { try { $pdo->prepare("DELETE FROM $t WHERE $col=?")->execute([$id]); } catch (Throwable $_) {} }
        }
        foreach (array_map('intval', $ids['source_links'] ?? []) as $id) { $pdo->prepare('DELETE FROM source_links WHERE id=?')->execute([$id]); }
        foreach (array_map('intval', $ids['events'] ?? []) as $id) {
            foreach (['media_links', 'source_links', 'notes', 'label_links'] as $t) { try { $pdo->prepare("DELETE FROM $t WHERE entity_type='event' AND entity_id=?")->execute([$id]); } catch (Throwable $_) {} }
            try { $pdo->prepare('DELETE FROM event_witnesses WHERE event_id=?')->execute([$id]); } catch (Throwable $_) {}
            $pdo->prepare('DELETE FROM events WHERE id=? AND person_id=?')->execute([$id, $pid]);
            log_change($pdo, 'event', $id, 'delete', 'Import d’archives en ligne annulé');
        }
        foreach (array_map('intval', $ids['poilu_units'] ?? []) as $id) { $pdo->prepare('DELETE FROM poilu_units WHERE id=? AND person_id=?')->execute([$id, $pid]); }
        foreach (array_map('intval', $ids['sources'] ?? []) as $id) {
            $n = $pdo->prepare('SELECT count(*) FROM source_links WHERE source_record_id=?'); $n->execute([$id]);
            if (!(int) $n->fetchColumn()) { $pdo->prepare("DELETE FROM media_links WHERE entity_type='source' AND entity_id=?")->execute([$id]); $pdo->prepare('DELETE FROM sources WHERE id=?')->execute([$id]); }
        }
        foreach (array_map('intval', $ids['media_links'] ?? []) as $id) { $pdo->prepare('DELETE FROM media_links WHERE id=?')->execute([$id]); }
        foreach (array_map('intval', $ids['media'] ?? []) as $id) {
            $n = $pdo->prepare('SELECT count(*) FROM media_links WHERE media_id=?'); $n->execute([$id]);
            if ((int) $n->fetchColumn()) { continue; } // relié ailleurs entre-temps : gardé
            $fn = $pdo->prepare('SELECT filename FROM media WHERE id=?'); $fn->execute([$id]); $name = basename((string) $fn->fetchColumn());
            $pdo->prepare('DELETE FROM media WHERE id=?')->execute([$id]);
            if ($name !== '') { $u = $pdo->prepare('SELECT count(*) FROM media WHERE filename=? OR thumbnail=?'); $u->execute([$name, $name]); if (!(int) $u->fetchColumn()) { $files[] = $name; } }
            log_change($pdo, 'media', $id, 'delete', 'Import d’archives en ligne annulé');
        }
        if (array_key_exists('mpf', $before)) { $pdo->prepare("UPDATE persons SET mort_pour_la_france=? WHERE id=? AND mort_pour_la_france='yes'")->execute([(string) $before['mpf'] ?: 'unknown', $pid]); }
        if (array_key_exists('military_data', $before)) {
            $cur = (string) $pdo->query('SELECT COALESCE(military_data,\'\') FROM persons WHERE id=' . $pid)->fetchColumn();
            if ($cur === (string) ($before['military_after'] ?? '')) { $pdo->prepare('UPDATE persons SET military_data=? WHERE id=?')->execute([(string) $before['military_data'], $pid]); }
            else { // changé entre-temps : on ne retire que les cases encore telles que l'import les a écrites
                $old = json_decode((string) $before['military_data'], true) ?: []; $aft = json_decode((string) ($before['military_after'] ?? ''), true) ?: []; $now = json_decode($cur, true) ?: [];
                foreach ($aft as $k => $v) { if (($now[$k] ?? null) === $v && ($old[$k] ?? null) !== $v) { if (array_key_exists($k, $old)) { $now[$k] = $old[$k]; } else { unset($now[$k]); } } }
                $pdo->prepare('UPDATE persons SET military_data=? WHERE id=?')->execute([json_encode($now, JSON_UNESCAPED_UNICODE), $pid]);
            }
        }
        foreach (['show_poilu_block', 'show_military_block'] as $col) { if (array_key_exists($col, $before)) { $pdo->prepare("UPDATE persons SET $col=? WHERE id=?")->execute([(int) $before[$col], $pid]); } }
        $pdo->prepare('UPDATE so_imports SET undone_at=CURRENT_TIMESTAMP WHERE batch=?')->execute([$batch]);
        log_change($pdo, 'person', $pid, 'update', 'Import d’archives en ligne annulé (' . $row['kind'] . ')');
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    foreach ($files as $name) { @unlink(MEDIA_DIR . '/' . $name); }
    return ['batch' => $batch, 'undone' => true];
}

/** le point d'entrée (api.php) : GET so_context · POST so_preview, so_import (multipart), so_undo */
const SO_ACTIONS = ['so_context', 'so_preview', 'so_import', 'so_undo'];
function so_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite) {
            if ($action !== 'so_context') { json_response(['error' => 'Demande inconnue.'], 400); }
            json_response(so_context($pdo, safe_int($_GET['person_id'] ?? 0)));
        }
        if ($action === 'so_import') {
            $data = $payload;
            if (isset($payload['data']) && is_string($payload['data'])) { $data = json_decode($payload['data'], true); }
            if (!is_array($data)) { throw new LcndaBadInput('Données de l’import illisibles.'); }
            json_response(['ok' => true, 'result' => so_import($pdo, $_FILES['file'] ?? null, $data)]);
        }
        json_response(['ok' => true, 'result' => match ($action) { 'so_preview' => so_preview($pdo, $payload), 'so_undo' => so_undo($pdo, $payload), default => throw new LcndaBadInput('Demande inconnue.') }]);
    } catch (LcndaBadInput $e) { json_response(['error' => $e->getMessage()], 422); }
    catch (Throwable $e) { json_response(['error' => function_exists('readable_error_message') ? readable_error_message($e) : $e->getMessage()], 422); }
}
