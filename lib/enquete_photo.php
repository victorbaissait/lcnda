<?php
declare(strict_types=1);
/**
 * 🔎 Enquête photo (maquette validée docs/design/enquete-photo.html) — le côté serveur.
 * Écran : assets/js/heritage-enquete-photo.js (+ -aides.js, calculs : app-enquete-photo-core.js). Essais : tests/test-enquete-photo.js.
 *
 * On enquête sur une photo ou un document (lieu, date, uniformes, décorations, texte, langue…) en relevant des INDICES, chacun avec
 * sa certitude : Prouvé (proven), Probable (probable), Supposé (supposed), Réfuté (refuted). L'app ne devine pas.
 *
 * Tables (structure n°113, lib/migrations.php ; ep_install) :
 *  - photo_inquiries          : l'enquête (titre, état, notes, réglages, conclusion JSON : lieu et date avec certitude et pourquoi)
 *  - photo_inquiry_images     : les images et documents de l'enquête (plusieurs ; une image peut être dans plusieurs enquêtes),
 *                               lettre A, B, C…, recto / verso, et les CALQUES (JSON : formes en coordonnées 0–1, l'image n'est jamais touchée)
 *  - photo_inquiry_clues      : les indices (sorte lieu / date / gens / objet / texte / support / dos…, texte, certitude, pourquoi,
 *                               d'où il vient, à quelles images il s'applique, la forme entourée, « pas avant / pas après », lieu, langue)
 *  - photo_inquiry_hypotheses : hypothèses concurrentes (« Brive » contre « Tulle ») et la position de chaque indice (pour / contre / les deux)
 *  - photo_inquiry_links      : relié à une personne, un lieu, un événement, une enquête 🕵️, une source, un tableau
 *  - photo_inquiry_journal    : ce qu'on a regardé, quand, et ce que ça a donné
 *  - photo_landmarks          : 📒 le carnet de repères (un clocher reconnu une fois, proposé pour les photos suivantes)
 *  - photo_photographers      : 📮 les photographes et éditeurs (liste que l'on complète soi-même)
 *
 *   GET  api.php?action=ep&op=list | get&id | media&media_id | counts | search&q&place&from&to | tree&id&what=ages|missing|events
 *        | nearby&lat&lon&km | sisters&id | privacy&id | wall | landmarks | photographers
 *   POST api.php?action=ep_write {op, …, csrf} : create · update · delete · add_images · remove_image · image_save · clue_save · clue_delete ·
 *        hyp_save · hyp_delete · link_save · link_delete · conclusion · apply · unapply · journal · landmark_save · landmark_delete ·
 *        photographer_save · photographer_delete · ai_ask · log_export
 *
 * Règles : mode consultation et appareils invités → lecture seule, rien ne part sur Internet (kiosk_guard + ep_kiosk) ; les vivants et
 * les fiches confidentielles ne sont jamais nommés en consultation ; « 🌐 Comparer en ligne » est refusé (privacy) pour une photo qui
 * montre un vivant ou une fiche confidentielle. L'IA (Ollama, sur cet ordinateur) : un cadre pour chaque observation (sinon
 * jetée), jamais de nom de personne ni de reconnaissance de visage, « Supposé » au plus. Suppressions : ↶ Annuler (undo_keep,
 * restore_last_delete : sortes photo_inquiry, photo_inquiry_clue, photo_inquiry_image).
 * 👤 « Qui est-ce ? » (heritage-enquete-photo-plus.js) : les propositions viennent SEULEMENT de l'outil local 👤 Visages
 * (lib/faces.php, assets/js/heritage-faces.js : empreintes calculées sur cet ordinateur, comparées aux visages que la personne
 * a identifiés à la main dans SES photos), à la demande ; rien en ligne. Un indice « visage » : « Supposé » seul, « Probable »
 * seulement confirmé par un autre indice qui n'est pas un visage (la date, le lieu, l'âge collent), jamais « Prouvé ».
 * Les 26 aides de heritage-enquete-photo-plus.js gardent leur état dans settings_json (provenance, inscriptions, ☑ liste, niveau,
 * temps passé, décor, boussole, âges des enfants) ; GET ep&op= candidates · face_people · buildings · local_events · map · races ·
 * family_places ; 📮 photographes : leurs décors de studio (colonne backdrops, structure n°114).
 * La suite (heritage-enquete-photo-suite.js) : GET ep&op= that_day (📅 ce jour-là dans l'arbre) · occupations (👔 tenues de métier) ·
 * occasions (🎞 occasions de photo dans la fenêtre de dates) · photographer_route (🗺 tournée d'un photographe) ; « reopen » dans list et
 * get (🔔 du nouveau pour une enquête terminée, calculé à la demande) ; les changements de conclusion et de certitude vont au journal
 * (lignes « ⚖ ») ; settings_json garde la ▦ grille de lecture (grids) et les 🔢 personnes numérotées (people : jamais nommées en
 * consultation si vivantes ou confidentielles). Pas de table de plus.
 * La suite, 2ᵉ partie (heritage-enquete-photo-classement.js) : GET ep&op= place_timeline (🏘 le même lieu à travers le temps) ·
 * group_expected (🎓 qui devrait être sur une photo de classe, de conscrits ou de noce) · versos (🔄 les dos côte à côte) ·
 * person_years (🕳 les années sans photo d'une personne) ; settings_json garde l'ordre supposé d'un album (albumOrder). Pas de table de plus.
 */

const EP_CERT = ['proven', 'probable', 'supposed', 'refuted'];
const EP_KINDS = ['lieu', 'date', 'gens', 'objet', 'texte', 'support', 'dos', 'ciel', 'autre'];
const EP_SOURCES = ['moi', 'ia', 'ombre', 'exif', 'en_ligne', 'donnees', 'repere', 'famille', 'compare', 'police', 'visage', 'atelier'];
const EP_LINK_KINDS = ['person', 'place', 'event', 'investigation', 'source', 'board'];
const EP_MAX_LAYERS = 400000; // octets de calques par image
const EP_MAX_TEXT = 4000;

function ep_install(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS photo_inquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open',
        notes TEXT NOT NULL DEFAULT '', settings_json TEXT NOT NULL DEFAULT '{}', conclusion_json TEXT NOT NULL DEFAULT '{}', is_private INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS photo_inquiry_images (id INTEGER PRIMARY KEY AUTOINCREMENT, inquiry_id INTEGER NOT NULL REFERENCES photo_inquiries(id) ON DELETE CASCADE,
        media_id INTEGER NOT NULL, position INTEGER NOT NULL DEFAULT 0, side TEXT NOT NULL DEFAULT '', label TEXT NOT NULL DEFAULT '', layers_json TEXT NOT NULL DEFAULT '[]',
        added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(inquiry_id, media_id))");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_pii_media ON photo_inquiry_images(media_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS photo_inquiry_clues (id INTEGER PRIMARY KEY AUTOINCREMENT, inquiry_id INTEGER NOT NULL REFERENCES photo_inquiries(id) ON DELETE CASCADE,
        num INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL DEFAULT 'autre', text TEXT NOT NULL DEFAULT '', certainty TEXT NOT NULL DEFAULT 'supposed', why TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'moi', url TEXT NOT NULL DEFAULT '', consulted_at TEXT NOT NULL DEFAULT '', images_json TEXT NOT NULL DEFAULT '{}', shape_id TEXT NOT NULL DEFAULT '',
        date_from INTEGER, date_to INTEGER, place_id INTEGER, lang TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_pic_inquiry ON photo_inquiry_clues(inquiry_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS photo_inquiry_hypotheses (id INTEGER PRIMARY KEY AUTOINCREMENT, inquiry_id INTEGER NOT NULL REFERENCES photo_inquiries(id) ON DELETE CASCADE,
        kind TEXT NOT NULL DEFAULT 'lieu', label TEXT NOT NULL DEFAULT '', place_id INTEGER, date_from INTEGER, date_to INTEGER, stances_json TEXT NOT NULL DEFAULT '{}', note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS photo_inquiry_links (id INTEGER PRIMARY KEY AUTOINCREMENT, inquiry_id INTEGER NOT NULL REFERENCES photo_inquiries(id) ON DELETE CASCADE,
        kind TEXT NOT NULL, ref_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(inquiry_id, kind, ref_id))");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_pil_ref ON photo_inquiry_links(kind, ref_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS photo_inquiry_journal (id INTEGER PRIMARY KEY AUTOINCREMENT, inquiry_id INTEGER NOT NULL REFERENCES photo_inquiries(id) ON DELETE CASCADE,
        what TEXT NOT NULL DEFAULT '', result TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS photo_landmarks (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'lieu', place_id INTEGER,
        media_id INTEGER, inquiry_id INTEGER, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS photo_photographers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
        year_from INTEGER, year_to INTEGER, note TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
}

function ep_ready(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    if (!$pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='photo_photographers'")->fetchColumn()) { ep_install($pdo); }
    ep_install_114($pdo);
    $done = true;
}
/** 114 : 📮 les décors de studio d'un photographe (colonne, balustrade, toile peinte…), pour relier les « photos sœurs » */
function ep_install_114(PDO $pdo): void
{
    $cols = array_column($pdo->query('PRAGMA table_info(photo_photographers)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    if ($cols && !in_array('backdrops', $cols, true)) { $pdo->exec("ALTER TABLE photo_photographers ADD COLUMN backdrops TEXT NOT NULL DEFAULT ''"); }
}

/** mode consultation ou appareil invité : lecture seule, rien ne part sur Internet, pas de vivant nommé */
function ep_kiosk(): bool { return function_exists('kiosk_state') && !empty(kiosk_state()['on']); }
function ep_guest(): bool { return function_exists('lan_device') && (bool) lan_device(); }

function ep_text(mixed $v, int $max = 300, bool $multi = false): string
{
    $t = str_replace("\0", '', scalar_text($v ?? ''));
    $t = $multi ? preg_replace("/\r\n?/", "\n", $t) : preg_replace('/\s+/u', ' ', $t);
    return mb_substr(trim((string) $t), 0, $max);
}
function ep_year(mixed $v): ?int { $n = is_numeric($v) ? (int) $v : 0; return $n >= 1000 && $n <= 2200 ? $n : null; }
function ep_cert(mixed $v): string { $c = (string) $v; return in_array($c, EP_CERT, true) ? $c : 'supposed'; }
function ep_json(mixed $v, int $max = 20000): string
{
    $j = json_encode(is_array($v) ? $v : [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($j === false || strlen($j) > $max) { throw new LcndaBadInput(i18n_t('Trop de données pour cet élément.')); }
    return $j;
}
function ep_dec(?string $j): array { $v = json_decode((string) $j, true); return is_array($v) ? $v : []; }
function ep_url(mixed $v): string { $u = ep_text($v, 600); return preg_match('~^https?://[^\s"<>]+$~i', $u) ? $u : ''; }
function ep_touch(PDO $pdo, int $id): void { $pdo->prepare('UPDATE photo_inquiries SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$id]); }

function ep_inquiry_row(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM photo_inquiries WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException(i18n_t('Enquête photo introuvable.')); }
    return $r;
}
function ep_media_row(PDO $pdo, int $id): array
{
    $hasPlace = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('media') WHERE name='place_id'")->fetchColumn();
    $s = $pdo->prepare('SELECT m.id, m.title, m.media_type, m.filename, m.thumbnail, m.date_text, m.description, m.postcard_group, m.postcard_side' . ($hasPlace ? ', m.place_id, p.name AS place_name, p.latitude, p.longitude' : '')
        . ' FROM media m' . ($hasPlace ? ' LEFT JOIN places p ON p.id=m.place_id' : '') . ' WHERE m.id=?');
    $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException(i18n_t('Image introuvable.')); }
    return $r;
}

/* ═════════ 👤 vivants et fiches confidentielles ═════════ */

/** les personnes « sur » ces images : identifiées (media_tags) et reliées (media_links), + les personnes reliées à l'enquête */
function ep_people_of(PDO $pdo, array $mediaIds, int $inquiryId = 0): array
{
    $ids = [];
    $mediaIds = array_values(array_filter(array_map('intval', $mediaIds)));
    if ($mediaIds) {
        $in = implode(',', array_fill(0, count($mediaIds), '?'));
        try { $s = $pdo->prepare("SELECT person_id FROM media_tags WHERE media_id IN ($in) AND COALESCE(tag_type,'person')='person'"); $s->execute($mediaIds); foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $p) { $ids[(int) $p] = 1; } } catch (Throwable $_) {}
        try { $s = $pdo->prepare("SELECT entity_id FROM media_links WHERE media_id IN ($in) AND entity_type='person'"); $s->execute($mediaIds); foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $p) { $ids[(int) $p] = 1; } } catch (Throwable $_) {}
    }
    if ($inquiryId) { $s = $pdo->prepare("SELECT ref_id FROM photo_inquiry_links WHERE inquiry_id=? AND kind='person'"); $s->execute([$inquiryId]); foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $p) { $ids[(int) $p] = 1; } }
    return array_keys($ids);
}
/** id => [name, private (vivant ou confidentiel), birth, death] */
function ep_persons(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids)))); if (!$ids) { return []; }
    $out = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $in = implode(',', array_fill(0, count($chunk), '?'));
        $s = $pdo->prepare("SELECT id, first_name, last_name, gender, is_private, living_status FROM persons WHERE id IN ($in)"); $s->execute($chunk);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $p) {
            $out[(int) $p['id']] = ['id' => (int) $p['id'], 'name' => trim(trim((string) $p['first_name']) . ' ' . mb_strtoupper(trim((string) $p['last_name']))), 'gender' => (string) $p['gender'],
                'private' => (int) $p['is_private'] === 1 || (string) $p['living_status'] === 'living', 'birth' => null, 'death' => null];
        }
        $s = $pdo->prepare("SELECT e.person_id, t.gedcom_tag, MIN(e.year) AS y FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IN ($in) AND e.year IS NOT NULL
            AND t.gedcom_tag IN ('BIRT','BAPM','CHR','DEAT','BURI') GROUP BY e.person_id, t.gedcom_tag"); $s->execute($chunk);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $pid = (int) $r['person_id']; if (!isset($out[$pid])) { continue; }
            $k = in_array($r['gedcom_tag'], ['BIRT', 'BAPM', 'CHR'], true) ? 'birth' : 'death';
            if ($out[$pid][$k] === null || ($k === 'birth' ? (int) $r['y'] < $out[$pid][$k] : (int) $r['y'] < $out[$pid][$k])) { $out[$pid][$k] = (int) $r['y']; }
        }
    }
    // sans date de décès et née il y a moins de 100 ans : comptée comme vivante (prudence)
    $now = (int) date('Y');
    foreach ($out as &$p) { if ($p['death'] === null && $p['birth'] !== null && $now - $p['birth'] < 100) { $p['private'] = true; } }
    unset($p);
    return $out;
}
/** une personne vue de l'extérieur : en consultation, un vivant ou une fiche confidentielle n'est pas nommé */
function ep_person_out(array $p): array
{
    if (ep_kiosk() && $p['private']) { return ['id' => 0, 'name' => i18n_t('Personne confidentielle'), 'private' => true, 'birth' => null, 'death' => null]; }
    return $p;
}

/** 🔒 « Comparer en ligne » et tout ce qui partirait sur Internet : bloqué pour un vivant, une fiche confidentielle, une enquête
 *  confidentielle, en mode consultation et pour un appareil invité. → {blocked, reasons: [clé…], message} */
function ep_privacy(PDO $pdo, int $id): array
{
    $inq = ep_inquiry_row($pdo, $id);
    $reasons = [];
    if (ep_guest()) { $reasons[] = 'guest'; }
    elseif (ep_kiosk()) { $reasons[] = 'kiosk'; }
    if ((int) $inq['is_private'] === 1) { $reasons[] = 'confidential'; }
    $s = $pdo->prepare('SELECT media_id FROM photo_inquiry_images WHERE inquiry_id=?'); $s->execute([$id]);
    $people = ep_persons($pdo, ep_people_of($pdo, $s->fetchAll(PDO::FETCH_COLUMN), $id));
    foreach ($people as $p) { if ($p['private']) { $reasons[] = 'living'; break; } }
    $msg = match ($reasons[0] ?? '') {
        'guest' => i18n_t('Appareil invité : rien ne part sur Internet depuis cet appareil.'),
        'kiosk' => i18n_t('Mode consultation : rien ne part sur Internet.'),
        'confidential' => i18n_t('Enquête confidentielle : rien ne part sur Internet.'),
        'living' => i18n_t('La photo montre une personne vivante ou une fiche confidentielle : rien ne part sur Internet.'),
        default => '',
    };
    return ['blocked' => (bool) $reasons, 'reasons' => array_values(array_unique($reasons)), 'message' => $msg];
}

/* ═════════ lecture ═════════ */

function ep_list(PDO $pdo): array
{
    $rows = $pdo->query("SELECT q.*, (SELECT COUNT(*) FROM photo_inquiry_images i WHERE i.inquiry_id=q.id) AS n_images, (SELECT COUNT(*) FROM photo_inquiry_clues c WHERE c.inquiry_id=q.id) AS n_clues,
        (SELECT i.media_id FROM photo_inquiry_images i WHERE i.inquiry_id=q.id ORDER BY i.position, i.id LIMIT 1) AS first_media FROM photo_inquiries q ORDER BY q.updated_at DESC, q.id DESC LIMIT 500")->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    $thumb = $pdo->prepare('SELECT filename, thumbnail FROM media WHERE id=?');
    $packs = null;
    foreach ($rows as $r) {
        $c = ep_dec($r['conclusion_json']); $th = '';
        if ($r['first_media']) { $thumb->execute([(int) $r['first_media']]); $m = $thumb->fetch(PDO::FETCH_ASSOC); $th = $m ? (string) ($m['thumbnail'] ?: $m['filename']) : ''; }
        // ↺ du nouveau pour une enquête terminée : calculé ici, à la demande
        $re = []; if ((string) $r['status'] === 'done') { try { $packs ??= ep_packs(); $re = ep_reopen_hints($pdo, $r, $packs); } catch (Throwable $_) { $re = []; } }
        $out[] = ['id' => (int) $r['id'], 'title' => (string) $r['title'], 'status' => (string) $r['status'], 'n_images' => (int) $r['n_images'], 'n_clues' => (int) $r['n_clues'],
            'place' => $c['place'] ?? null, 'date' => $c['date'] ?? null, 'thumb' => $th, 'updated_at' => (string) $r['updated_at'], 'created_at' => (string) $r['created_at'], 'is_private' => (int) $r['is_private'], 'reopen' => $re];
    }
    return ['inquiries' => $out];
}

function ep_get(PDO $pdo, int $id): array
{
    $q = ep_inquiry_row($pdo, $id);
    $imgs = $pdo->prepare('SELECT * FROM photo_inquiry_images WHERE inquiry_id=? ORDER BY position, id'); $imgs->execute([$id]);
    $images = [];
    foreach ($imgs->fetchAll(PDO::FETCH_ASSOC) as $i) {
        try { $m = ep_media_row($pdo, (int) $i['media_id']); } catch (Throwable $_) { $m = ['id' => (int) $i['media_id'], 'title' => i18n_t('Image supprimée'), 'media_type' => 'image', 'filename' => '', 'missing' => true]; }
        $images[] = ['id' => (int) $i['id'], 'media_id' => (int) $i['media_id'], 'position' => (int) $i['position'], 'side' => (string) $i['side'], 'label' => (string) $i['label'],
            'layers' => ep_dec($i['layers_json']), 'media' => $m];
    }
    // 🛡 les visages identifiés sur ces images (media_tags, en % de l'image) : ceux des vivants et des fiches confidentielles sont floutés
    //    dans « Partager sans risque » et dans un morceau envoyé en ligne ; aucun nom n'est rendu
    try {
        $mids = array_column($images, 'media_id');
        if ($mids) { $in = implode(',', array_map('intval', $mids)); $tags = $pdo->query("SELECT media_id, person_id, x, y, w, h FROM media_tags WHERE media_id IN ($in) AND COALESCE(tag_type,'person')='person' AND w>0 AND h>0")->fetchAll(PDO::FETCH_ASSOC);
            $pp = ep_persons($pdo, array_column($tags, 'person_id'));
            foreach ($images as &$im) { $im['faces'] = array_values(array_map(static fn($t) => ['x' => (float) $t['x'] / 100, 'y' => (float) $t['y'] / 100, 'w' => (float) $t['w'] / 100, 'h' => (float) $t['h'] / 100, 'private' => !empty($pp[(int) $t['person_id']]['private'])], array_filter($tags, static fn($t) => (int) $t['media_id'] === $im['media_id']))); }
            unset($im); }
    } catch (Throwable $_) {}
    $cl = $pdo->prepare('SELECT * FROM photo_inquiry_clues WHERE inquiry_id=? ORDER BY num, id'); $cl->execute([$id]);
    $clues = array_map('ep_clue_out', $cl->fetchAll(PDO::FETCH_ASSOC));
    $placeNames = [];
    $pids = array_values(array_filter(array_merge(array_column($clues, 'place_id'))));
    $hy = $pdo->prepare('SELECT * FROM photo_inquiry_hypotheses WHERE inquiry_id=? ORDER BY id'); $hy->execute([$id]);
    $hyps = array_map(static fn($h) => ['id' => (int) $h['id'], 'kind' => (string) $h['kind'], 'label' => (string) $h['label'], 'place_id' => $h['place_id'] !== null ? (int) $h['place_id'] : null,
        'date_from' => $h['date_from'] !== null ? (int) $h['date_from'] : null, 'date_to' => $h['date_to'] !== null ? (int) $h['date_to'] : null, 'stances' => ep_dec($h['stances_json']), 'note' => (string) $h['note']], $hy->fetchAll(PDO::FETCH_ASSOC));
    $pids = array_merge($pids, array_filter(array_column($hyps, 'place_id')));
    if ($pids) { $in = implode(',', array_fill(0, count($pids), '?')); $s = $pdo->prepare("SELECT id, name, latitude, longitude FROM places WHERE id IN ($in)"); $s->execute(array_values($pids));
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $p) { $placeNames[(int) $p['id']] = ['name' => (string) $p['name'], 'lat' => $p['latitude'] !== null ? (float) $p['latitude'] : null, 'lon' => $p['longitude'] !== null ? (float) $p['longitude'] : null]; } }
    foreach ($clues as &$c) { if ($c['place_id'] && isset($placeNames[$c['place_id']])) { $c['place'] = $placeNames[$c['place_id']]; } }
    unset($c);
    foreach ($hyps as &$h) { if ($h['place_id'] && isset($placeNames[$h['place_id']])) { $h['place'] = $placeNames[$h['place_id']]; } }
    unset($h);
    $jr = $pdo->prepare('SELECT id, what, result, created_at FROM photo_inquiry_journal WHERE inquiry_id=? ORDER BY id DESC LIMIT 200'); $jr->execute([$id]);
    $conclusion = ep_dec($q['conclusion_json']);
    if (!empty($conclusion['place']['place_id'])) { $s = $pdo->prepare('SELECT name, latitude, longitude FROM places WHERE id=?'); $s->execute([(int) $conclusion['place']['place_id']]); if ($p = $s->fetch(PDO::FETCH_ASSOC)) { $conclusion['place']['name'] = $conclusion['place']['name'] ?: (string) $p['name']; $conclusion['place']['lat'] = $p['latitude'] !== null ? (float) $p['latitude'] : null; $conclusion['place']['lon'] = $p['longitude'] !== null ? (float) $p['longitude'] : null; } }
    // 🔢 les personnes numérotées (settings.people) : en consultation, un vivant ou une fiche confidentielle n'y est jamais nommé,
    //    ni par le lien vers sa fiche ni par un nom écrit à la main ; hors consultation, leurs noms servent au « partage sans risque »
    $settings = ep_dec($q['settings_json']); $privNames = [];
    try {
        $pids = []; foreach ((is_array($settings['people'] ?? null) ? $settings['people'] : []) as $list) { foreach ((array) $list as $m) { if (is_array($m) && !empty($m['person_id'])) { $pids[] = (int) $m['person_id']; } } }
        $priv = array_filter(ep_persons($pdo, array_merge($pids, ep_people_of($pdo, array_column($images, 'media_id'), $id))), static fn($p) => $p['private']);
        $privNames = array_values(array_filter(array_map(static fn($p) => $p['name'], $priv), static fn($n) => mb_strlen($n) >= 3));
        if (ep_kiosk() && is_array($settings['people'] ?? null)) {
            $folded = array_map('ep_fold', $privNames);
            foreach ($settings['people'] as $k => $list) { foreach ((array) $list as $i => $m) { if (!is_array($m)) { continue; }
                $hit = (!empty($m['person_id']) && isset($priv[(int) $m['person_id']])) || array_filter($folded, static fn($n) => $n !== '' && str_contains(ep_fold((string) ($m['label'] ?? '')), $n));
                if ($hit) { $settings['people'][$k][$i] = ['label' => '', 'person_id' => 0, 'priv' => 1] + $m; $settings['people'][$k][$i]['label'] = ''; $settings['people'][$k][$i]['person_id'] = 0; } } }
            $privNames = [];
        }
    } catch (Throwable $_) {}
    return ['inquiry' => ['id' => (int) $q['id'], 'title' => (string) $q['title'], 'status' => (string) $q['status'], 'notes' => (string) $q['notes'], 'settings' => $settings, 'private_names' => $privNames,
        'reopen' => (static function () use ($pdo, $q) { try { return ep_reopen_hints($pdo, $q); } catch (Throwable $_) { return []; } })(),
        'conclusion' => $conclusion, 'is_private' => (int) $q['is_private'], 'created_at' => (string) $q['created_at'], 'updated_at' => (string) $q['updated_at'],
        'images' => $images, 'clues' => $clues, 'hypotheses' => $hyps, 'links' => ep_links($pdo, $id), 'journal' => $jr->fetchAll(PDO::FETCH_ASSOC)],
        'privacy' => ep_privacy($pdo, $id), 'kiosk' => ep_kiosk()];
}

function ep_clue_out(array $c): array
{
    return ['id' => (int) $c['id'], 'num' => (int) $c['num'], 'kind' => (string) $c['kind'], 'text' => (string) $c['text'], 'certainty' => (string) $c['certainty'], 'why' => (string) $c['why'],
        'source' => (string) $c['source'], 'url' => (string) $c['url'], 'consulted_at' => (string) $c['consulted_at'], 'images' => ep_dec($c['images_json']), 'shape_id' => (string) $c['shape_id'],
        'date_from' => $c['date_from'] !== null ? (int) $c['date_from'] : null, 'date_to' => $c['date_to'] !== null ? (int) $c['date_to'] : null,
        'place_id' => $c['place_id'] !== null ? (int) $c['place_id'] : null, 'lang' => (string) $c['lang'], 'data' => ep_dec($c['data_json']), 'updated_at' => (string) $c['updated_at']];
}

function ep_links(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT id, kind, ref_id FROM photo_inquiry_links WHERE inquiry_id=? ORDER BY id'); $s->execute([$id]);
    $rows = $s->fetchAll(PDO::FETCH_ASSOC); $out = [];
    $persons = ep_persons($pdo, array_map(static fn($r) => (int) $r['ref_id'], array_filter($rows, static fn($r) => $r['kind'] === 'person')));
    foreach ($rows as $r) {
        $rid = (int) $r['ref_id']; $label = '';
        try {
            switch ($r['kind']) {
                case 'person': $p = isset($persons[$rid]) ? ep_person_out($persons[$rid]) : null; $label = $p ? $p['name'] . ($p['birth'] || $p['death'] ? ' (' . ($p['birth'] ?: '?') . '-' . ($p['death'] ?: '') . ')' : '') : '';
                    if ($p && $p['id'] === 0) { $rid = 0; } break;
                case 'place': $q = $pdo->prepare('SELECT name FROM places WHERE id=?'); $q->execute([$rid]); $label = (string) $q->fetchColumn(); break;
                case 'event': $q = $pdo->prepare('SELECT COALESCE(NULLIF(e.title,\'\'), t.label) || CASE WHEN e.date_text<>\'\' THEN \', \' || e.date_text ELSE \'\' END FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.id=?'); $q->execute([$rid]); $label = (string) $q->fetchColumn(); break;
                case 'investigation': $q = $pdo->prepare('SELECT title FROM investigations WHERE id=?'); $q->execute([$rid]); $label = (string) $q->fetchColumn(); break;
                case 'source': $q = $pdo->prepare('SELECT title FROM sources WHERE id=?'); $q->execute([$rid]); $label = (string) $q->fetchColumn(); break;
                case 'board': $q = $pdo->prepare('SELECT name FROM boards WHERE id=?'); $q->execute([$rid]); $label = (string) $q->fetchColumn(); break;
            }
        } catch (Throwable $_) {}
        $out[] = ['id' => (int) $r['id'], 'kind' => (string) $r['kind'], 'ref_id' => $rid, 'label' => $label !== '' ? $label : '#' . $r['ref_id'], 'private' => $r['kind'] === 'person' && !empty($persons[(int) $r['ref_id']]['private'])];
    }
    return $out;
}

/** les enquêtes d'une image (bouton « 🔎 Enquête · 5 indices · lieu probable ») */
function ep_media(PDO $pdo, int $mediaId): array
{
    $s = $pdo->prepare('SELECT q.id, q.title, q.conclusion_json, (SELECT COUNT(*) FROM photo_inquiry_clues c WHERE c.inquiry_id=q.id) AS n FROM photo_inquiries q JOIN photo_inquiry_images i ON i.inquiry_id=q.id WHERE i.media_id=? ORDER BY q.updated_at DESC');
    $s->execute([$mediaId]);
    return ['inquiries' => array_map(static fn($r) => ['id' => (int) $r['id'], 'title' => (string) $r['title'], 'n_clues' => (int) $r['n'], 'conclusion' => ep_dec($r['conclusion_json'])], $s->fetchAll(PDO::FETCH_ASSOC))];
}

/** media_id => nombre d'enquêtes (pastilles « 🔎 N ») ; filename => media_id pour les images posées ailleurs */
function ep_counts(PDO $pdo): array
{
    $out = []; $files = [];
    foreach ($pdo->query('SELECT i.media_id, COUNT(*) AS n, m.filename FROM photo_inquiry_images i LEFT JOIN media m ON m.id=i.media_id GROUP BY i.media_id') as $r) {
        $out[(string) $r['media_id']] = (int) $r['n']; if ($r['filename']) { $files[(string) $r['filename']] = (int) $r['media_id']; }
    }
    return ['counts' => $out, 'files' => $files];
}

/** une image d'après son nom de fichier (clic droit sur une image posée n'importe où) */
function ep_by_file(PDO $pdo, string $file): array
{
    $f = basename(rawurldecode($file));
    $s = $pdo->prepare('SELECT id, title, media_type, filename FROM media WHERE filename=? OR thumbnail=? LIMIT 1'); $s->execute([$f, $f]);
    $m = $s->fetch(PDO::FETCH_ASSOC);
    return ['media' => $m ? ['id' => (int) $m['id'], 'title' => (string) $m['title'], 'media_type' => (string) $m['media_type'], 'filename' => (string) $m['filename']] : null];
}

/* ═════════ 🧰 Chercher dans les données (sans Internet) ═════════ */

function ep_like(string $q): string { return '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%'; }
function ep_snip(string $text, string $q, int $w = 70): string
{
    $t = preg_replace('/\s+/u', ' ', $text); $p = $q !== '' ? mb_stripos($t, $q) : false;
    if ($p === false) { return mb_substr($t, 0, $w * 2); }
    $a = max(0, $p - $w); return ($a > 0 ? '…' : '') . mb_substr($t, $a, $w * 2 + mb_strlen($q)) . (mb_strlen($t) > $a + $w * 2 ? '…' : '');
}
function ep_search(PDO $pdo, array $g): array
{
    $q = ep_text($g['q'] ?? '', 120); $place = ep_text($g['place'] ?? '', 120); $from = ep_year($g['from'] ?? null); $to = ep_year($g['to'] ?? null);
    $out = ['docs' => [], 'postcards' => [], 'tree' => [], 'sites' => [], 'places' => []];
    $kiosk = ep_kiosk();
    if (mb_strlen($q) >= 2) {
        $like = ep_like($q);
        try { $s = $pdo->prepare("SELECT id, title, date_text, place, body, media_id FROM act_transcriptions WHERE body LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 8"); $s->execute([$like, $like]);
            foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $out['docs'][] = ['kind' => 'act', 'id' => (int) $r['id'], 'media_id' => (int) $r['media_id'], 'title' => (string) $r['title'], 'when' => trim($r['date_text'] . ' ' . $r['place']), 'snippet' => ep_snip((string) $r['body'], $q)]; } } catch (Throwable $_) {}
        $s = $pdo->prepare("SELECT id, title, date_text, transcription, description FROM media WHERE transcription LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 8"); $s->execute([$like, $like, $like]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $out['docs'][] = ['kind' => 'media', 'id' => (int) $r['id'], 'media_id' => (int) $r['id'], 'title' => (string) $r['title'], 'when' => (string) $r['date_text'], 'snippet' => ep_snip(trim($r['transcription'] . ' ' . $r['description'] . ' ' . $r['title']), $q)]; }
        try { $s = $pdo->prepare("SELECT c.id, c.media_id, c.title, c.publisher, c.sent_date, m.filename FROM postcards c LEFT JOIN media m ON m.id=c.media_id WHERE c.publisher LIKE ? ESCAPE '\\' OR c.title LIKE ? ESCAPE '\\' OR c.notes LIKE ? ESCAPE '\\' LIMIT 12"); $s->execute([$like, $like, $like]);
            foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $out['postcards'][] = ['id' => (int) $r['id'], 'media_id' => (int) $r['media_id'], 'title' => (string) $r['title'], 'publisher' => (string) $r['publisher'], 'when' => (string) $r['sent_date'], 'filename' => (string) $r['filename']]; } } catch (Throwable $_) {}
        try { $s = $pdo->prepare("SELECT id, kind, name FROM sites WHERE name LIKE ? ESCAPE '\\' LIMIT 8"); $s->execute([$like]); foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $out['sites'][] = ['id' => (int) $r['id'], 'kind' => (string) $r['kind'], 'name' => (string) $r['name']]; } } catch (Throwable $_) {}
        $s = $pdo->prepare("SELECT p.id, p.name FROM photo_photographers p WHERE p.name LIKE ? ESCAPE '\\' OR p.city LIKE ? ESCAPE '\\' LIMIT 8"); $s->execute([$like, $like]);
        $out['photographers'] = $s->fetchAll(PDO::FETCH_ASSOC);
    }
    if (mb_strlen($place) >= 2) {
        $pl = $pdo->prepare("SELECT id, name, latitude, longitude FROM places WHERE name LIKE ? ESCAPE '\\' ORDER BY length(name) LIMIT 6"); $pl->execute([ep_like($place)]);
        $places = $pl->fetchAll(PDO::FETCH_ASSOC); $out['places'] = $places;
        if ($places) {
            $ids = array_map(static fn($p) => (int) $p['id'], $places); $in = implode(',', $ids);
            $sql = "SELECT e.person_id, MIN(e.year) AS y1, MAX(e.year) AS y2, COUNT(*) AS n FROM events e WHERE e.place_id IN ($in) AND e.person_id IS NOT NULL" . ($from ? ' AND e.year >= ' . ($from - 10) : '') . ($to ? ' AND e.year <= ' . ($to + 10) : '') . ' GROUP BY e.person_id ORDER BY n DESC LIMIT 12';
            $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
            $pp = ep_persons($pdo, array_column($rows, 'person_id'));
            foreach ($rows as $r) { $p = $pp[(int) $r['person_id']] ?? null; if (!$p || ($kiosk && $p['private'])) { continue; } $out['tree'][] = ['id' => $p['id'], 'name' => $p['name'], 'from' => $r['y1'] !== null ? (int) $r['y1'] : null, 'to' => $r['y2'] !== null ? (int) $r['y2'] : null, 'n' => (int) $r['n']]; }
            try { $s = $pdo->query("SELECT c.id, c.media_id, c.title, c.publisher, m.filename FROM postcards c LEFT JOIN media m ON m.id=c.media_id WHERE c.place_id IN ($in) LIMIT 12");
                foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { if (!in_array((int) $r['id'], array_column($out['postcards'], 'id'), true)) { $out['postcards'][] = ['id' => (int) $r['id'], 'media_id' => (int) $r['media_id'], 'title' => (string) $r['title'], 'publisher' => (string) $r['publisher'], 'when' => '', 'filename' => (string) $r['filename']]; } } } catch (Throwable $_) {}
        }
    }
    return $out;
}

/* ═════════ 👪 l'arbre : âge apparent, qui manque, fête du jour et deuil ═════════ */

function ep_tree(PDO $pdo, int $id, array $g): array
{
    $what = (string) ($g['what'] ?? '');
    $from = ep_year($g['from'] ?? null); $to = ep_year($g['to'] ?? null) ?? $from; $from = $from ?? $to;
    $kiosk = ep_kiosk();
    $s = $pdo->prepare('SELECT media_id FROM photo_inquiry_images WHERE inquiry_id=?'); $s->execute([$id]);
    $onPhoto = ep_people_of($pdo, $s->fetchAll(PDO::FETCH_COLUMN), $id);
    $keep = static fn(array $p) => !($kiosk && $p['private']);
    if ($what === 'ages') { // 🧒 « enfant d'environ 6 ans » → les enfants de l'arbre qui avaient cet âge à cette date (jamais d'analyse des visages)
        $age = max(0, min(110, safe_int($g['age'] ?? 0))); $spread = max(1, min(10, safe_int($g['spread'] ?? 2)));
        if (!$from) { throw new LcndaBadInput(i18n_t('Il faut d’abord une fourchette de dates (la frise de la photo).')); }
        $y1 = $from - $age - $spread; $y2 = $to - $age + $spread;
        $s = $pdo->prepare("SELECT e.person_id, MIN(e.year) AS y FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag IN ('BIRT','BAPM','CHR') AND e.person_id IS NOT NULL AND e.year BETWEEN ? AND ? GROUP BY e.person_id LIMIT 400");
        $s->execute([$y1, $y2]);
        $births = []; foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $births[(int) $r['person_id']] = (int) $r['y']; }
        $near = ep_family_of($pdo, $onPhoto); $pp = ep_persons($pdo, array_keys($births)); $out = [];
        foreach ($pp as $p) { if (!$keep($p)) { continue; } $out[] = ep_person_out($p) + ['age_from' => $from - ($p['birth'] ?? $births[$p['id']]), 'age_to' => $to - ($p['birth'] ?? $births[$p['id']]), 'close' => isset($near[$p['id']])]; }
        usort($out, static fn($a, $b) => ($b['close'] <=> $a['close']) ?: (abs((int) $a['age_from'] - $age) <=> abs((int) $b['age_from'] - $age)));
        return ['people' => array_slice($out, 0, 20), 'age' => $age, 'from' => $from, 'to' => $to];
    }
    if ($what === 'missing') { // 👥 les proches vivants à cette date qui ne sont pas sur la photo
        if (!$from) { throw new LcndaBadInput(i18n_t('Il faut d’abord une fourchette de dates (la frise de la photo).')); }
        $year = (int) round(($from + $to) / 2);
        $fam = array_diff_key(ep_family_of($pdo, $onPhoto), array_flip($onPhoto));
        $out = [];
        foreach (ep_persons($pdo, array_keys($fam)) as $p) {
            if (!$keep($p)) { continue; }
            $alive = ($p['birth'] === null || $p['birth'] <= $year) && ($p['death'] === null || $p['death'] >= $year) && !($p['birth'] === null && $p['death'] === null);
            if ($alive) { $out[] = ep_person_out($p) + ['relation' => $fam[$p['id']]]; }
        }
        return ['people' => $out, 'on_photo' => array_values(array_map('ep_person_out', ep_persons($pdo, $onPhoto))), 'year' => $year];
    }
    if ($what === 'events') { // 🎉 fête du jour, 🖤 deuil : les événements de l'arbre qui collent avec la fenêtre de dates
        if (!$from) { throw new LcndaBadInput(i18n_t('Il faut d’abord une fourchette de dates (la frise de la photo).')); }
        $ids = array_keys(ep_family_of($pdo, $onPhoto) + array_flip($onPhoto)); if (!$ids) { return ['events' => []]; }
        $in = implode(',', array_map('intval', $ids));
        $rows = $pdo->query("SELECT e.id, e.person_id, e.family_id, e.year, e.date_text, t.gedcom_tag, t.label, f.partner1_id, f.partner2_id FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id
            WHERE e.year BETWEEN " . ($from - 1) . ' AND ' . ($to + 1) . " AND (e.person_id IN ($in) OR f.partner1_id IN ($in) OR f.partner2_id IN ($in))
            AND t.gedcom_tag IN ('MARR','BAPM','CHR','BIRT','FCOM','CONF','DEAT','BURI','GRAD','RETI','EVEN','_MILT','CENS') ORDER BY e.year LIMIT 60")->fetchAll(PDO::FETCH_ASSOC);
        $pp = ep_persons($pdo, array_filter(array_merge(array_column($rows, 'person_id'), array_column($rows, 'partner1_id'), array_column($rows, 'partner2_id'))));
        $out = [];
        foreach ($rows as $r) {
            $who = array_values(array_filter(array_map(static fn($x) => $pp[(int) $x] ?? null, [$r['person_id'], $r['partner1_id'], $r['partner2_id']])));
            if ($kiosk && array_filter($who, static fn($p) => $p['private'])) { continue; }
            $kind = in_array($r['gedcom_tag'], ['DEAT', 'BURI'], true) ? 'deuil' : 'fete';
            $out[] = ['id' => (int) $r['id'], 'kind' => $kind, 'label' => (string) $r['label'], 'date' => (string) $r['date_text'], 'year' => (int) $r['year'], 'who' => array_map(static fn($p) => ['id' => $p['id'], 'name' => $p['name']], $who)];
        }
        return ['events' => $out];
    }
    throw new LcndaBadInput('Opération inconnue.');
}

/** les proches (parents, frères et sœurs, conjoints, enfants) de ces personnes → id => relation */
function ep_family_of(PDO $pdo, array $ids): array
{
    $ids = array_values(array_filter(array_map('intval', $ids))); if (!$ids) { return []; }
    $in = implode(',', $ids); $out = [];
    foreach ($pdo->query("SELECT f.partner1_id, f.partner2_id FROM family_children c JOIN families f ON f.id=c.family_id WHERE c.child_id IN ($in)") as $r) { foreach ([$r['partner1_id'], $r['partner2_id']] as $p) { if ($p) { $out[(int) $p] = 'parent'; } } }
    foreach ($pdo->query("SELECT c2.child_id FROM family_children c JOIN family_children c2 ON c2.family_id=c.family_id WHERE c.child_id IN ($in) AND c2.child_id NOT IN ($in)") as $r) { $out[(int) $r['child_id']] ??= 'sibling'; }
    foreach ($pdo->query("SELECT id, partner1_id, partner2_id FROM families WHERE partner1_id IN ($in) OR partner2_id IN ($in)") as $f) {
        foreach ([$f['partner1_id'], $f['partner2_id']] as $p) { if ($p && !in_array((int) $p, $ids, true)) { $out[(int) $p] ??= 'spouse'; } }
        foreach ($pdo->query('SELECT child_id FROM family_children WHERE family_id=' . (int) $f['id']) as $c) { $out[(int) $c['child_id']] ??= 'child'; }
    }
    return $out;
}

/* ═════════ 📍 mes photos proches (2 km), 🧩 photos sœurs, 🧱 mur des photos sans nom ═════════ */

function ep_nearby(PDO $pdo, array $g): array
{
    $lat = is_numeric($g['lat'] ?? null) ? (float) $g['lat'] : null; $lon = is_numeric($g['lon'] ?? null) ? (float) $g['lon'] : null;
    $km = max(0.2, min(50.0, (float) ($g['km'] ?? 2))); $not = safe_int($g['not'] ?? 0);
    if ($lat === null || $lon === null) { return ['media' => []]; }
    if (!$pdo->query("SELECT 1 FROM pragma_table_info('media') WHERE name='place_id'")->fetchColumn()) { return ['media' => []]; }
    $dLat = $km / 111.0; $dLon = $km / max(1.0, 111.0 * cos(deg2rad($lat)));
    $s = $pdo->prepare("SELECT m.id, m.title, m.filename, m.thumbnail, m.date_text, p.name AS place, p.latitude, p.longitude FROM media m JOIN places p ON p.id=m.place_id WHERE m.media_type='image'
        AND p.latitude BETWEEN ? AND ? AND p.longitude BETWEEN ? AND ? AND m.id NOT IN (SELECT media_id FROM photo_inquiry_images WHERE inquiry_id=?) LIMIT 300");
    $s->execute([$lat - $dLat, $lat + $dLat, $lon - $dLon, $lon + $dLon, $not]);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $d = ep_km($lat, $lon, (float) $r['latitude'], (float) $r['longitude']); if ($d > $km) { continue; }
        $out[] = ['id' => (int) $r['id'], 'title' => (string) $r['title'], 'filename' => (string) ($r['thumbnail'] ?: $r['filename']), 'date' => (string) $r['date_text'], 'place' => (string) $r['place'], 'km' => round($d, 2)];
    }
    usort($out, static fn($a, $b) => $a['km'] <=> $b['km']);
    return ['media' => array_slice($out, 0, 40)];
}
function ep_km(float $a, float $b, float $c, float $d): float
{
    $p1 = deg2rad($a); $p2 = deg2rad($c); $dp = deg2rad($c - $a); $dl = deg2rad($d - $b);
    $x = sin($dp / 2) ** 2 + cos($p1) * cos($p2) * sin($dl / 2) ** 2;
    return 6371.0 * 2 * atan2(sqrt($x), sqrt(1 - $x));
}

/** 🧩 photos sœurs : même photographe ou éditeur (indices « support » / « dos », fiches de cartes postales), même décor noté */
function ep_sisters(PDO $pdo, int $id): array
{
    ep_inquiry_row($pdo, $id);
    $names = [];
    $s = $pdo->prepare("SELECT data_json, text FROM photo_inquiry_clues WHERE inquiry_id=? AND certainty<>'refuted'"); $s->execute([$id]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $c) { $d = ep_dec($c['data_json']); foreach (['photographer', 'publisher', 'studio'] as $k) { if (!empty($d[$k]) && is_string($d[$k])) { $names[] = ep_text($d[$k], 80); } } }
    try { $s = $pdo->prepare('SELECT c.publisher FROM postcards c JOIN photo_inquiry_images i ON i.media_id=c.media_id WHERE i.inquiry_id=? AND c.publisher<>\'\''); $s->execute([$id]); foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $p) { $names[] = (string) $p; } } catch (Throwable $_) {}
    $names = array_values(array_unique(array_filter($names, static fn($n) => mb_strlen($n) >= 3)));
    $out = []; $seen = [];
    $mine = $pdo->prepare('SELECT media_id FROM photo_inquiry_images WHERE inquiry_id=?'); $mine->execute([$id]); foreach ($mine->fetchAll(PDO::FETCH_COLUMN) as $m) { $seen[(int) $m] = 1; }
    foreach ($names as $n) {
        $like = ep_like($n);
        try { $q = $pdo->prepare("SELECT c.media_id, c.title, c.publisher, m.filename FROM postcards c JOIN media m ON m.id=c.media_id WHERE c.publisher LIKE ? ESCAPE '\\' LIMIT 20"); $q->execute([$like]);
            foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) { if (isset($seen[(int) $r['media_id']])) { continue; } $seen[(int) $r['media_id']] = 1; $out[] = ['id' => (int) $r['media_id'], 'title' => (string) $r['title'], 'filename' => (string) $r['filename'], 'why' => $n]; } } catch (Throwable $_) {}
        $q = $pdo->prepare("SELECT id, title, filename FROM media WHERE media_type='image' AND (description LIKE ? ESCAPE '\\' OR transcription LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\') LIMIT 20"); $q->execute([$like, $like, $like]);
        foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) { if (isset($seen[(int) $r['id']])) { continue; } $seen[(int) $r['id']] = 1; $out[] = ['id' => (int) $r['id'], 'title' => (string) $r['title'], 'filename' => (string) $r['filename'], 'why' => $n]; }
    }
    // 🎭 même décor de studio, 💍 même habit ou bijou noté dans une autre enquête : ses images sont des « photos sœurs »
    [$bd, $items] = ep_marks_of($pdo, $id);
    $studios = [];
    if ($bd || $items) {
        $s = $pdo->prepare("SELECT inquiry_id, data_json FROM photo_inquiry_clues WHERE inquiry_id<>? AND certainty<>'refuted' AND (data_json LIKE '%\"backdrop\"%' OR data_json LIKE '%\"item\"%') LIMIT 2000"); $s->execute([$id]);
        $hits = [];
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $c) {
            $d = ep_dec($c['data_json']); $qid = (int) $c['inquiry_id'];
            $common = array_values(array_intersect($bd, ep_backdrop_list($d['backdrop'] ?? [])));
            if ($common && count($common) >= min(2, count($bd))) { $hits[$qid] = ['how' => 'decor', 'why' => implode(', ', $common)]; }
            $it = ep_fold((string) ($d['item'] ?? ''));
            if ($it !== '' && in_array($it, $items, true)) { $hits[$qid] = ['how' => 'item', 'why' => (string) $d['item']]; }
        }
        $im = $pdo->prepare('SELECT i.media_id, m.title, m.filename, m.thumbnail FROM photo_inquiry_images i JOIN media m ON m.id=i.media_id WHERE i.inquiry_id=? ORDER BY i.position LIMIT 12');
        foreach ($hits as $qid => $h) { $im->execute([$qid]); foreach ($im->fetchAll(PDO::FETCH_ASSOC) as $r) { if (isset($seen[(int) $r['media_id']])) { continue; } $seen[(int) $r['media_id']] = 1; $out[] = ['id' => (int) $r['media_id'], 'title' => (string) $r['title'], 'filename' => (string) ($r['thumbnail'] ?: $r['filename']), 'why' => $h['why'], 'how' => $h['how'], 'inquiry_id' => $qid]; } }
        // 📮 les photographes dont le décor noté ressemble (deux éléments en commun au moins, ou tous s'il n'y en a qu'un)
        if ($bd) { foreach ($pdo->query("SELECT id, name, city, year_from, year_to, backdrops FROM photo_photographers WHERE backdrops<>''")->fetchAll(PDO::FETCH_ASSOC) as $p) {
            $common = array_values(array_intersect($bd, ep_backdrop_list((string) $p['backdrops'])));
            if ($common && count($common) >= min(2, count($bd))) { $studios[] = ['id' => (int) $p['id'], 'name' => (string) $p['name'], 'city' => (string) $p['city'], 'year_from' => $p['year_from'] !== null ? (int) $p['year_from'] : null, 'year_to' => $p['year_to'] !== null ? (int) $p['year_to'] : null, 'common' => $common]; }
        } }
    }
    return ['names' => $names, 'media' => array_slice($out, 0, 60), 'backdrop' => $bd, 'items' => $items, 'studios' => $studios];
}
function ep_fold(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'œ' => 'oe', '’' => "'"]);
    return trim((string) preg_replace('/[^a-z0-9]+/', ' ', $s));
}
/** un décor : « colonne, balustrade » ou ['colonne', 'balustrade'] → éléments repliés, sans doublon */
function ep_backdrop_list(mixed $v): array
{
    $list = is_array($v) ? $v : preg_split('/[,;\n]+/', (string) $v);
    return array_values(array_unique(array_filter(array_map(static fn($x) => ep_fold(is_scalar($x) ? (string) $x : ''), $list ?: []), static fn($x) => mb_strlen($x) >= 3)));
}
function ep_backdrops(mixed $v): string { return mb_substr(implode(', ', array_slice(array_map(static fn($x) => ep_text($x, 60), is_array($v) ? $v : (preg_split('/[,;\n]+/', (string) $v) ?: [])), 0, 30)), 0, 1000); }
/** le décor et les habits ou bijoux notés dans une enquête (indices non réfutés) */
function ep_marks_of(PDO $pdo, int $id): array
{
    $s = $pdo->prepare("SELECT data_json FROM photo_inquiry_clues WHERE inquiry_id=? AND certainty<>'refuted'"); $s->execute([$id]);
    $bd = []; $items = [];
    foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $j) { $d = ep_dec($j); $bd = array_merge($bd, ep_backdrop_list($d['backdrop'] ?? [])); $it = ep_fold((string) ($d['item'] ?? '')); if ($it !== '') { $items[] = $it; } }
    return [array_values(array_unique($bd)), array_values(array_unique($items))];
}

/* ═════════ les 26 aides (heritage-enquete-photo-plus.js) : ce qu'elles lisent ici, sans Internet ═════════ */

/** 👪 « Qui pourrait-ce être ? » : les personnes de l'arbre nées pour avoir cet âge apparent à cette date, avec ce qui colle et ce qui
 *  ne colle pas (dates, lieux de leur vie près du lieu supposé, proches des gens de la photo). Jamais d'analyse des visages. */
function ep_candidates(PDO $pdo, int $id, array $g): array
{
    ep_inquiry_row($pdo, $id);
    $from = ep_year($g['from'] ?? null); $to = ep_year($g['to'] ?? null) ?? $from; $from = $from ?? $to;
    if (!$from) { throw new LcndaBadInput(i18n_t('Il faut d’abord une fourchette de dates (la frise de la photo).')); }
    $age = max(0, min(110, safe_int($g['age'] ?? 0))); $spread = max(1, min(15, safe_int($g['spread'] ?? 3)));
    $y1 = $from - $age - $spread * 2; $y2 = $to - $age + $spread * 2;
    $s = $pdo->prepare("SELECT e.person_id, MIN(e.year) AS y FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag IN ('BIRT','BAPM','CHR') AND e.person_id IS NOT NULL AND e.year BETWEEN ? AND ? GROUP BY e.person_id LIMIT 600");
    $s->execute([$y1, $y2]);
    $ids = array_map('intval', array_column($s->fetchAll(PDO::FETCH_ASSOC), 'person_id'));
    $lat = is_numeric($g['lat'] ?? null) ? (float) $g['lat'] : null; $lon = is_numeric($g['lon'] ?? null) ? (float) $g['lon'] : null;
    $pid = safe_int($g['place_id'] ?? 0);
    if ($pid && ($lat === null || $lon === null)) { $q = $pdo->prepare('SELECT latitude, longitude FROM places WHERE id=?'); $q->execute([$pid]); if ($r = $q->fetch(PDO::FETCH_ASSOC)) { $lat = $r['latitude'] !== null ? (float) $r['latitude'] : null; $lon = $r['longitude'] !== null ? (float) $r['longitude'] : null; } }
    $im = $pdo->prepare('SELECT media_id FROM photo_inquiry_images WHERE inquiry_id=?'); $im->execute([$id]);
    $onPhoto = ep_people_of($pdo, $im->fetchAll(PDO::FETCH_COLUMN), $id); $near = ep_family_of($pdo, $onPhoto);
    $kiosk = ep_kiosk(); $out = [];
    $km = [];
    if ($ids && $lat !== null && $lon !== null) {
        foreach (array_chunk($ids, 400) as $chunk) { $in = implode(',', $chunk);
            foreach ($pdo->query("SELECT e.person_id, p.latitude, p.longitude, p.name FROM events e JOIN places p ON p.id=e.place_id WHERE e.person_id IN ($in) AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL") as $r) {
                $d = ep_km($lat, $lon, (float) $r['latitude'], (float) $r['longitude']); $k = (int) $r['person_id'];
                if (!isset($km[$k]) || $d < $km[$k]['km']) { $km[$k] = ['km' => round($d, 1), 'place' => (string) $r['name']]; }
            } }
    }
    foreach (ep_persons($pdo, $ids) as $p) {
        if ($kiosk && $p['private']) { continue; }
        $o = ep_person_out($p);
        $out[] = $o + ['km' => $km[$p['id']]['km'] ?? null, 'near_place' => $km[$p['id']]['place'] ?? '', 'close' => isset($near[$p['id']]), 'on_photo' => in_array($p['id'], $onPhoto, true)];
    }
    return ['people' => array_slice($out, 0, 200), 'age' => $age, 'spread' => $spread, 'from' => $from, 'to' => $to, 'has_place' => $lat !== null && $lon !== null];
}

/** 👤 les personnes proposées par l'outil local Visages : nom (caché en consultation pour un vivant ou une fiche confidentielle), dates */
function ep_face_people(PDO $pdo, array $g): array
{
    $ids = array_slice(array_values(array_filter(array_map('intval', explode(',', (string) ($g['ids'] ?? ''))))), 0, 200);
    $out = [];
    foreach (ep_persons($pdo, $ids) as $p) { $o = ep_person_out($p); $out[(string) $p['id']] = $o + ['private' => $p['private']]; }
    return ['people' => $out, 'kiosk' => ep_kiosk()];
}

/** 🧭 🏗 les bâtiments connus près d'un point, avec leurs dates (fiches d'édifices de la base, packs ⛪ Mérimée et 🚂 gares installés) */
function ep_buildings(PDO $pdo, array $g): array
{
    $lat = is_numeric($g['lat'] ?? null) ? (float) $g['lat'] : null; $lon = is_numeric($g['lon'] ?? null) ? (float) $g['lon'] : null;
    if ($lat === null || $lon === null) { return ['buildings' => [], 'sources' => []]; }
    $km = max(0.1, min(20.0, (float) ($g['km'] ?? 2)));
    $dl = $km / 111.0; $dn = $km / max(0.2, 111.0 * cos(deg2rad($lat)));
    $out = []; $sources = [];
    $add = static function (array $b) use (&$out, $lat, $lon, $km) { $d = ep_km($lat, $lon, (float) $b['lat'], (float) $b['lon']); if ($d <= $km) { $out[] = $b + ['km' => round($d, 2)]; } };
    try { if ($pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sites'")->fetchColumn()) { $sources[] = 'sites';
        $s = $pdo->prepare('SELECT id, kind, name, lat, lon, built_from, built_to, gone_year, wikipedia, merimee FROM sites WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? LIMIT 400'); $s->execute([$lat - $dl, $lat + $dl, $lon - $dn, $lon + $dn]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $add(['name' => (string) $r['name'], 'kind' => (string) $r['kind'], 'lat' => (float) $r['lat'], 'lon' => (float) $r['lon'], 'built' => $r['built_from'] !== null ? (int) $r['built_from'] : null, 'gone' => $r['gone_year'] !== null ? (int) $r['gone_year'] : null, 'dates' => '', 'src' => 'sites', 'site_id' => (int) $r['id'],
            'url' => (string) ($r['wikipedia'] ?: ($r['merimee'] ? 'https://pop.culture.gouv.fr/notice/merimee/' . rawurlencode((string) $r['merimee']) : ''))]); } } } catch (Throwable $_) {}
    try { require_once __DIR__ . '/lieux_patrimoine.php';
        foreach (array_slice(glob(lp_dir() . '/patrimoine-*.sqlite') ?: [], 0, 20) as $f) { $key = basename($f, '.sqlite'); $p = lp_pdo($key); if (!$p) { continue; } $sources[] = 'merimee';
            $s = $p->prepare("SELECT ref, nom, deno, dates, siecle, lat, lon FROM objets WHERE base<>'palissy' AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? LIMIT 400"); $s->execute([$lat - $dl, $lat + $dl, $lon - $dn, $lon + $dn]);
            foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { [$a] = lp_period((string) $r['dates'], (string) $r['siecle']);
                $add(['name' => trim((string) $r['nom']) ?: (string) $r['deno'], 'kind' => (string) $r['deno'], 'lat' => (float) $r['lat'], 'lon' => (float) $r['lon'], 'built' => $a, 'gone' => null, 'dates' => trim((string) $r['dates'] . ' ' . (string) $r['siecle']), 'src' => 'merimee', 'url' => 'https://pop.culture.gouv.fr/notice/merimee/' . rawurlencode((string) $r['ref'])]); } } } catch (Throwable $_) {}
    try { require_once __DIR__ . '/histoire.php'; if ($h = hist_pdo()) { $sources[] = 'gares';
        $s = $h->prepare('SELECT nom, lat, lon, ouverture FROM gares WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? LIMIT 200'); $s->execute([$lat - $dl, $lat + $dl, $lon - $dn, $lon + $dn]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $add(['name' => (string) $r['nom'], 'kind' => 'gare', 'lat' => (float) $r['lat'], 'lon' => (float) $r['lon'], 'built' => $r['ouverture'] !== null ? (int) $r['ouverture'] : null, 'gone' => null, 'dates' => '', 'src' => 'gares', 'url' => '']); } } } catch (Throwable $_) {}
    usort($out, static fn($a, $b) => $a['km'] <=> $b['km']);
    return ['buildings' => array_slice($out, 0, 150), 'sources' => array_values(array_unique($sources)), 'km' => $km];
}

/** 🗓 l'histoire locale qui colle avec le lieu et la fenêtre de dates (le monde autour : liste de l'app et mes événements à moi) */
function ep_local_events(PDO $pdo, array $g): array
{
    $pid = safe_int($g['place_id'] ?? 0); $from = ep_year($g['from'] ?? null); $to = ep_year($g['to'] ?? null) ?? $from; $from = $from ?? $to;
    if (!$from) { throw new LcndaBadInput(i18n_t('Il faut d’abord une fourchette de dates (la frise de la photo).')); }
    require_once __DIR__ . '/monde_autour.php';
    $pl = null; if ($pid) { $s = $pdo->prepare('SELECT * FROM places WHERE id=?'); $s->execute([$pid]); $pl = $s->fetch(PDO::FETCH_ASSOC) ?: null; }
    $where = ['places' => [], 'depts' => [], 'texts' => [], 'france' => true, 'abroad' => false, 'any' => (bool) $pl];
    if ($pl) { $where['places'][(int) $pl['id']] = (string) $pl['name']; if (($d = world_place_dept($pl)) !== '') { $where['depts'][$d] = true; }
        $where['texts'][] = world_fold(implode(' ', [(string) ($pl['county'] ?? ''), (string) ($pl['state'] ?? ''), (string) ($pl['subdivision'] ?? '')]));
        $c = world_fold((string) ($pl['country'] ?? '')); $where['france'] = $c === '' || $c === 'france' || $c === 'fr'; }
    $all = array_merge(world_events_bundled()['events'], world_own_as_events($pdo)); $out = [];
    foreach ($all as $e) {
        $a = (int) ($e['from'] ?? 0); $b = (int) ($e['to'] ?? $a) ?: $a; if ($a > $to + 1 || $b < $from - 1) { continue; }
        $hit = $pl && !empty($e['place_id']) && (int) $e['place_id'] === (int) $pl['id'] ? 'local' : world_scope_hit((string) ($e['scope'] ?? ''), $where);
        if ($hit === '' || $hit === 'monde') { continue; }
        $out[] = ['title' => (string) $e['title'], 'from' => $a, 'to' => $b, 'date' => (string) ($e['date'] ?? $e['quand'] ?? ''), 'cat' => (string) ($e['cat'] ?? ''), 'scope' => $hit, 'desc' => mb_substr((string) ($e['desc'] ?? ''), 0, 300), 'url' => (string) ($e['url'] ?? ''), 'own' => !empty($e['own'])];
    }
    usort($out, static fn($x, $y) => [$x['scope'] === 'local' ? 0 : 1, $x['from']] <=> [$y['scope'] === 'local' ? 0 : 1, $y['from']]);
    return ['events' => array_slice($out, 0, 40), 'place' => $pl ? (string) $pl['name'] : ''];
}

/** 🗺 les enquêtes placées sur la carte (lieu de la conclusion, sinon une hypothèse ou un indice placés), avec leur certitude */
function ep_map(PDO $pdo): array
{
    $kiosk = ep_kiosk(); $out = [];
    $pl = $pdo->prepare('SELECT name, latitude, longitude FROM places WHERE id=? AND latitude IS NOT NULL AND longitude IS NOT NULL');
    foreach ($pdo->query('SELECT id, title, conclusion_json, is_private FROM photo_inquiries ORDER BY id DESC LIMIT 2000')->fetchAll(PDO::FETCH_ASSOC) as $q) {
        if ($kiosk && (int) $q['is_private'] === 1) { continue; }
        $c = ep_dec($q['conclusion_json']); $pid = (int) ($c['place']['place_id'] ?? 0); $cert = (string) ($c['place']['certainty'] ?? 'supposed');
        if (!$pid) { $h = $pdo->prepare("SELECT place_id FROM photo_inquiry_hypotheses WHERE inquiry_id=? AND place_id IS NOT NULL ORDER BY id LIMIT 1"); $h->execute([(int) $q['id']]); $pid = (int) $h->fetchColumn(); $cert = 'supposed'; }
        if (!$pid) { $h = $pdo->prepare("SELECT place_id, certainty FROM photo_inquiry_clues WHERE inquiry_id=? AND place_id IS NOT NULL AND certainty<>'refuted' ORDER BY CASE certainty WHEN 'proven' THEN 0 WHEN 'probable' THEN 1 ELSE 2 END LIMIT 1"); $h->execute([(int) $q['id']]); if ($r = $h->fetch(PDO::FETCH_ASSOC)) { $pid = (int) $r['place_id']; $cert = (string) $r['certainty']; } }
        if (!$pid) { continue; }
        $pl->execute([$pid]); $p = $pl->fetch(PDO::FETCH_ASSOC); if (!$p) { continue; }
        $out[] = ['id' => (int) $q['id'], 'title' => (string) $q['title'], 'place' => (string) $p['name'], 'lat' => (float) $p['latitude'], 'lon' => (float) $p['longitude'], 'certainty' => in_array($cert, EP_CERT, true) ? $cert : 'supposed'];
    }
    return ['inquiries' => $out];
}

/** 🐄 une race reconnue sur la photo → sa région d'origine (fichier des races livré avec l'app, lib/terroir.php) ; celles des départements de la famille d'abord */
function ep_races(PDO $pdo, array $g): array
{
    require_once __DIR__ . '/terroir.php';
    $D = tr_data('races'); if (!$D) { return ['installed' => false, 'races' => []]; }
    $q = tr_fold(mb_substr((string) ($g['q'] ?? ''), 0, 80)); $sp = (string) ($g['species'] ?? '');
    $fam = []; try { require_once __DIR__ . '/lieux_patrimoine.php'; $fam = array_slice(lp_user_deps($pdo), 0, 20); } catch (Throwable $_) {}
    $out = [];
    foreach ($D['rows'] as $r) {
        if ($sp !== '' && ($r['sp'] ?? '') !== $sp) { continue; }
        if (!in_array('FR', $r['c'] ?? [], true)) { continue; }
        if ($q !== '' && !str_contains(tr_fold((string) $r['n']), $q)) { continue; }
        $row = tr_race_row($r); $row['family'] = (bool) array_intersect($fam, $r['deps'] ?? []);
        if ($q === '' && !$row['family']) { continue; }
        $out[] = ['name' => $row['name'], 'icon' => $row['icon'], 'species' => $row['species'], 'species_label' => $row['species_label'], 'origin' => $row['origin'], 'dep_names' => $row['dep_names'], 'family' => $row['family'], 'wp' => $row['wp'], 'url' => $row['url']];
    }
    usort($out, static fn($a, $b) => [$a['family'] ? 0 : 1, tr_fold($a['name'])] <=> [$b['family'] ? 0 : 1, tr_fold($b['name'])]);
    return ['installed' => true, 'races' => array_slice($out, 0, 40), 'credit' => (string) ($D['attr'] ?? ''), 'licence' => (string) ($D['licence'] ?? '')];
}

/** 🏘 les lieux de la famille (les plus cités d'abord) : pour comparer un indice de région (toits, races) */
function ep_family_places(PDO $pdo): array
{
    $rows = $pdo->query('SELECT p.id, p.name, p.latitude, p.longitude, COUNT(e.id) AS n FROM places p JOIN events e ON e.place_id=p.id GROUP BY p.id ORDER BY n DESC LIMIT 30')->fetchAll(PDO::FETCH_ASSOC);
    return ['places' => array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'lat' => $r['latitude'] !== null ? (float) $r['latitude'] : null, 'lon' => $r['longitude'] !== null ? (float) $r['longitude'] : null, 'n' => (int) $r['n']], $rows)];
}

/* ═════════ la suite (heritage-enquete-photo-suite.js) : ce jour-là, métiers, occasions, tournée, du nouveau ═════════ */

/** une date au jour près dans un texte (« 14 JUL 1911 », « 14 juillet 1911 », « 1911-07-14 », « 14/07/1911 ») → [an, mois, jour] */
function ep_day_of(string $t): ?array
{
    $t = mb_strtolower(trim($t));
    if (preg_match('/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/', $t, $m)) { return [(int) $m[1], (int) $m[2], (int) $m[3]]; }
    if (preg_match('~\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b~', $t, $m)) { return [(int) $m[3], (int) $m[2], (int) $m[1]]; }
    $months = ['jan' => 1, 'janv' => 1, 'janvier' => 1, 'feb' => 2, 'fev' => 2, 'févr' => 2, 'février' => 2, 'fevrier' => 2, 'mar' => 3, 'mars' => 3, 'apr' => 4, 'avr' => 4, 'avril' => 4, 'may' => 5, 'mai' => 5,
        'jun' => 6, 'juin' => 6, 'jul' => 7, 'juil' => 7, 'juillet' => 7, 'aug' => 8, 'aout' => 8, 'août' => 8, 'sep' => 9, 'sept' => 9, 'septembre' => 9, 'oct' => 10, 'octobre' => 10, 'nov' => 11, 'novembre' => 11, 'dec' => 12, 'déc' => 12, 'décembre' => 12, 'decembre' => 12];
    if (preg_match('/\b(\d{1,2})(?:er)?\s+([a-zéû]+)\.?\s+(\d{4})\b/u', $t, $m) && isset($months[$m[2]])) { return [(int) $m[3], $months[$m[2]], (int) $m[1]]; }
    return null;
}

/** 📅 « Ce jour-là » : les événements de l'arbre ce jour-là (même date) et ce mois-là (même mois, même année) — vivants et fiches
 *  confidentielles retirés en consultation */
function ep_that_day(PDO $pdo, array $g): array
{
    $dt = ep_day_of((string) ($g['date'] ?? ''));
    if (!$dt || !checkdate($dt[1], $dt[2], $dt[0])) { throw new LcndaBadInput(i18n_t('Choisis une date au jour près.')); }
    [$y, $mo, $d] = $dt; $kiosk = ep_kiosk();
    $rows = $pdo->prepare("SELECT e.id, e.person_id, e.date_text, e.year, t.label, t.gedcom_tag, f.partner1_id, f.partner2_id, p.name AS place FROM events e JOIN event_types t ON t.id=e.event_type_id
        LEFT JOIN families f ON f.id=e.family_id LEFT JOIN places p ON p.id=e.place_id WHERE e.year=? LIMIT 3000");
    $rows->execute([$y]);
    $hits = [];
    foreach ($rows->fetchAll(PDO::FETCH_ASSOC) as $r) { $x = ep_day_of((string) $r['date_text']); if ($x && $x[1] === $mo) { $r['_d'] = $x[2]; $hits[] = $r; } }
    $pp = ep_persons($pdo, array_filter(array_merge(array_column($hits, 'person_id'), array_column($hits, 'partner1_id'), array_column($hits, 'partner2_id'))));
    $day = []; $month = [];
    foreach ($hits as $r) {
        $who = array_values(array_filter(array_map(static fn($x) => $pp[(int) $x] ?? null, [$r['person_id'], $r['partner1_id'], $r['partner2_id']])));
        if ($kiosk && array_filter($who, static fn($p) => $p['private'])) { continue; }
        $row = ['id' => (int) $r['id'], 'label' => (string) $r['label'], 'tag' => (string) $r['gedcom_tag'], 'date' => (string) $r['date_text'], 'day' => (int) $r['_d'], 'place' => (string) ($r['place'] ?? ''),
            'who' => array_map(static fn($p) => ['id' => $p['id'], 'name' => $p['name'], 'private' => $p['private']], $who)];
        if ((int) $r['_d'] === $d) { $day[] = $row; } else { $month[] = $row; }
    }
    usort($month, static fn($a, $b) => $a['day'] <=> $b['day']);
    return ['date' => sprintf('%04d-%02d-%02d', $y, $mo, $d), 'day' => array_slice($day, 0, 30), 'month' => array_slice($month, 0, 40)];
}

/** 👔 les métiers de l'arbre qui contiennent un de ces mots (événements « profession » OCCU, recensements) */
function ep_occupations(PDO $pdo, array $g): array
{
    $words = array_values(array_filter(array_map(static fn($w) => ep_fold(ep_text($w, 40)), explode('|', (string) ($g['words'] ?? ''))), static fn($w) => mb_strlen($w) >= 3));
    $words = array_slice($words, 0, 60); if (!$words) { return ['people' => []]; }
    $kiosk = ep_kiosk(); $found = [];
    $match = static function (string $txt) use ($words): string { $f = ' ' . ep_fold($txt) . ' '; foreach ($words as $w) { if (str_contains($f, ' ' . $w)) { return $w; } } return ''; };
    try { foreach ($pdo->query("SELECT e.person_id, COALESCE(NULLIF(e.description,''), e.title) AS occ FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='OCCU' AND e.person_id IS NOT NULL LIMIT 20000") as $r) {
        if (($w = $match((string) $r['occ'])) !== '') { $found[(int) $r['person_id']] ??= ['occupation' => (string) $r['occ'], 'word' => $w]; } } } catch (Throwable $_) {}
    try { foreach ($pdo->query("SELECT person_id, occupation FROM census_members WHERE person_id IS NOT NULL AND COALESCE(occupation,'')<>'' LIMIT 20000") as $r) { // les recensements
        if (($w = $match((string) $r['occupation'])) !== '') { $found[(int) $r['person_id']] ??= ['occupation' => (string) $r['occupation'], 'word' => $w]; } } } catch (Throwable $_) {}
    $out = [];
    foreach (ep_persons($pdo, array_slice(array_keys($found), 0, 400)) as $p) {
        if ($kiosk && $p['private']) { continue; }
        $out[] = ['id' => $p['id'], 'name' => $p['name'], 'birth' => $p['birth'], 'death' => $p['death'], 'private' => $p['private']] + $found[$p['id']];
    }
    usort($out, static fn($a, $b) => strcmp($a['name'], $b['name']));
    return ['people' => array_slice($out, 0, 200)];
}

/** 🎞 les occasions de photo : les événements de l'arbre dans la fenêtre de dates (mariage, communion, baptême, décès, service),
 *  les noces d'or (mariage + 50 ans) et les conscrits (garçons nés 20 ans avant) — les proches des gens de la photo d'abord */
function ep_occasions(PDO $pdo, int $id, array $g): array
{
    ep_inquiry_row($pdo, $id);
    $from = ep_year($g['from'] ?? null); $to = ep_year($g['to'] ?? null) ?? $from; $from = $from ?? $to;
    if (!$from) { throw new LcndaBadInput(i18n_t('Il faut d’abord une fourchette de dates (la frise de la photo).')); }
    if ($to - $from > 60) { $to = $from + 60; }
    $kiosk = ep_kiosk();
    $s = $pdo->prepare('SELECT media_id FROM photo_inquiry_images WHERE inquiry_id=?'); $s->execute([$id]);
    $onPhoto = ep_people_of($pdo, $s->fetchAll(PDO::FETCH_COLUMN), $id); $near = ep_family_of($pdo, $onPhoto) + array_fill_keys($onPhoto, 'photo');
    $q = static function (array $tags, int $a, int $b) use ($pdo): array {
        $in = implode(',', array_map(static fn($t) => $pdo->quote($t), $tags));
        return $pdo->query("SELECT e.id, e.person_id, e.year, e.date_text, t.gedcom_tag, t.label, f.partner1_id, f.partner2_id FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id
            WHERE t.gedcom_tag IN ($in) AND e.year BETWEEN $a AND $b ORDER BY e.year LIMIT 1500")->fetchAll(PDO::FETCH_ASSOC);
    };
    $sets = ['mariage' => [$q(['MARR'], $from, $to), 0], 'noces' => [$q(['MARR'], $from - 50, $to - 50), 50], 'communion' => [$q(['FCOM', 'CONF'], $from, $to), 0], 'bapteme' => [$q(['BAPM', 'CHR'], $from, $to), 0],
        'deces' => [$q(['DEAT', 'BURI'], $from, $to), 0], 'service' => [$q(['_MILT'], $from, $to), 0], 'conscrits' => [$q(['BIRT'], $from - 21, $to - 20), 20]];
    $ids = []; foreach ($sets as [$rows]) { foreach ($rows as $r) { foreach (['person_id', 'partner1_id', 'partner2_id'] as $k) { if ($r[$k]) { $ids[] = (int) $r[$k]; } } } }
    $pp = ep_persons($pdo, $ids); $out = [];
    foreach ($sets as $k => [$rows, $add]) {
        $list = [];
        foreach ($rows as $r) {
            $who = array_values(array_filter(array_map(static fn($x) => $pp[(int) $x] ?? null, [$r['person_id'], $r['partner1_id'], $r['partner2_id']])));
            if (!$who || ($kiosk && array_filter($who, static fn($p) => $p['private']))) { continue; }
            if ($k === 'conscrits' && ($who[0]['gender'] ?? '') !== 'male') { continue; }
            $close = (bool) array_filter($who, static fn($p) => isset($near[$p['id']]));
            $list[] = ['id' => (int) $r['id'], 'year' => (int) $r['year'] + $add, 'event_year' => (int) $r['year'], 'date' => (string) $r['date_text'], 'label' => (string) $r['label'], 'close' => $close,
                'who' => array_map(static fn($p) => ['id' => ep_person_out($p)['id'], 'name' => ep_person_out($p)['name'], 'private' => $p['private']], $who)];
        }
        usort($list, static fn($a, $b) => [$b['close'], $a['year']] <=> [$a['close'], $b['year']]);
        $out[$k] = array_slice($list, 0, 25);
    }
    return ['from' => $from, 'to' => $to, 'occasions' => $out, 'family' => (bool) $onPhoto];
}

/** 🗺 la tournée d'un photographe de la liste : ses photos placées (indices « photographe » des enquêtes, éditeur des cartes
 *  postales), avec leur année — regroupées par année sur la mini-carte */
function ep_photographer_route(PDO $pdo, array $g): array
{
    $pid = safe_int($g['pid'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM photo_photographers WHERE id=?'); $s->execute([$pid]); $ph = $s->fetch(PDO::FETCH_ASSOC);
    if (!$ph) { throw new RuntimeException(i18n_t('Introuvable.')); }
    $name = ep_fold((string) $ph['name']); $short = trim((string) preg_replace('/^(phot|photo|photographie|cliche|edit|ed)\s+/', '', $name));
    $kiosk = ep_kiosk(); $hasPlace = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('media') WHERE name='place_id'")->fetchColumn();
    $same = static fn(string $n) => ($f = ep_fold($n)) !== '' && ($f === $name || ($short !== '' && mb_strlen($short) >= 4 && str_contains($f, $short)));
    $media = []; // media_id => [inquiry_id, year]
    $cl = $pdo->query("SELECT c.inquiry_id, c.data_json, c.date_from, c.date_to, q.conclusion_json, q.is_private FROM photo_inquiry_clues c JOIN photo_inquiries q ON q.id=c.inquiry_id WHERE c.certainty<>'refuted' AND (c.data_json LIKE '%\"photographer\"%' OR c.data_json LIKE '%\"publisher\"%' OR c.data_json LIKE '%\"studio\"%') LIMIT 5000");
    $im = $pdo->prepare('SELECT media_id FROM photo_inquiry_images WHERE inquiry_id=?');
    foreach ($cl->fetchAll(PDO::FETCH_ASSOC) as $c) {
        if ($kiosk && (int) $c['is_private'] === 1) { continue; }
        $d = ep_dec($c['data_json']); $hit = false; foreach (['photographer', 'publisher', 'studio'] as $k) { if (is_string($d[$k] ?? null) && $same($d[$k])) { $hit = true; } } if (!$hit) { continue; }
        $conc = ep_dec($c['conclusion_json']); $y = ep_year($conc['date']['from'] ?? null) ?? ep_year($conc['date']['to'] ?? null);
        $im->execute([(int) $c['inquiry_id']]); foreach ($im->fetchAll(PDO::FETCH_COLUMN) as $m) { $media[(int) $m] ??= ['inquiry_id' => (int) $c['inquiry_id'], 'year' => $y, 'place_id' => (int) ($conc['place']['place_id'] ?? 0) ?: null]; }
    }
    try { foreach ($pdo->query("SELECT media_id, publisher, sent_date FROM postcards WHERE COALESCE(publisher,'')<>'' LIMIT 20000") as $r) { if ($r['media_id'] && $same((string) $r['publisher'])) { $media[(int) $r['media_id']] ??= ['inquiry_id' => 0, 'year' => null, 'place_id' => null]; } } } catch (Throwable $_) {}
    $out = []; $pl = $pdo->prepare('SELECT name, latitude, longitude FROM places WHERE id=? AND latitude IS NOT NULL AND longitude IS NOT NULL');
    foreach (array_slice($media, 0, 600, true) as $mid => $x) {
        try { $m = ep_media_row($pdo, $mid); } catch (Throwable $_) { continue; }
        $placeId = $x['place_id'] ?: ($hasPlace && !empty($m['place_id']) ? (int) $m['place_id'] : null); if (!$placeId) { continue; }
        $pl->execute([$placeId]); $p = $pl->fetch(PDO::FETCH_ASSOC); if (!$p) { continue; }
        $y = $x['year'] ?? (preg_match('/\b(1[5-9]\d\d|20\d\d)\b/', (string) $m['date_text'], $mm) ? (int) $mm[1] : null);
        $out[] = ['media_id' => $mid, 'title' => (string) $m['title'], 'filename' => (string) ($m['thumbnail'] ?: $m['filename']), 'place' => (string) $p['name'], 'lat' => (float) $p['latitude'], 'lon' => (float) $p['longitude'], 'year' => $y, 'inquiry_id' => $x['inquiry_id']];
    }
    return ['photographer' => ['id' => (int) $ph['id'], 'name' => (string) $ph['name'], 'city' => (string) $ph['city'], 'year_from' => $ph['year_from'] !== null ? (int) $ph['year_from'] : null, 'year_to' => $ph['year_to'] !== null ? (int) $ph['year_to'] : null], 'photos' => $out, 'unplaced' => count($media) - count($out)];
}

/** ↺ du nouveau pour une enquête terminée (calculé à la demande, sans tâche de fond) : une autre enquête au même photographe
 *  ou au même lieu a reçu une image depuis, un pack de données a été installé depuis, un événement de l'arbre dans la fenêtre
 *  de dates a été ajouté depuis → [{k, label}] */
function ep_reopen_hints(PDO $pdo, array $q, ?array $packs = null): array
{
    if ((string) $q['status'] !== 'done') { return []; }
    $since = (string) $q['updated_at']; $sinceTs = strtotime($since . ' UTC') ?: 0; $id = (int) $q['id']; $out = [];
    // le photographe et les lieux de l'enquête
    $names = []; $places = [];
    $s = $pdo->prepare("SELECT data_json, place_id, date_from, date_to FROM photo_inquiry_clues WHERE inquiry_id=? AND certainty<>'refuted'"); $s->execute([$id]); $clues = $s->fetchAll(PDO::FETCH_ASSOC);
    foreach ($clues as $c) { $d = ep_dec($c['data_json']); foreach (['photographer', 'publisher', 'studio'] as $k) { if (is_string($d[$k] ?? null) && ($f = ep_fold($d[$k])) !== '') { $names[$f] = (string) $d[$k]; } } if ($c['place_id']) { $places[(int) $c['place_id']] = 1; } }
    $conc = ep_dec($q['conclusion_json']); if (!empty($conc['place']['place_id'])) { $places[(int) $conc['place']['place_id']] = 1; }
    if ($names || $places) {
        $o = $pdo->prepare("SELECT DISTINCT i.inquiry_id, q.title FROM photo_inquiry_images i JOIN photo_inquiries q ON q.id=i.inquiry_id WHERE i.inquiry_id<>? AND i.added_at>? LIMIT 200"); $o->execute([$id, $since]);
        foreach ($o->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $oc = $pdo->prepare("SELECT data_json, place_id FROM photo_inquiry_clues WHERE inquiry_id=? AND certainty<>'refuted'"); $oc->execute([(int) $r['inquiry_id']]); $hit = '';
            foreach ($oc->fetchAll(PDO::FETCH_ASSOC) as $c) { $d = ep_dec($c['data_json']); foreach (['photographer', 'publisher', 'studio'] as $k) { if (is_string($d[$k] ?? null) && isset($names[ep_fold($d[$k])])) { $hit = 'photographer'; } } if ($c['place_id'] && isset($places[(int) $c['place_id']])) { $hit = $hit ?: 'place'; } }
            $oq = $pdo->prepare('SELECT conclusion_json FROM photo_inquiries WHERE id=?'); $oq->execute([(int) $r['inquiry_id']]); $op = (int) (ep_dec((string) $oq->fetchColumn())['place']['place_id'] ?? 0); if ($op && isset($places[$op])) { $hit = $hit ?: 'place'; }
            if ($hit) { $out[] = ['k' => 'photo', 'label' => $hit === 'photographer' ? i18n_t('Une nouvelle photo du même photographe (« {t} »)', ['t' => (string) $r['title']]) : i18n_t('Une nouvelle photo du même lieu (« {t} »)', ['t' => (string) $r['title']]), 'inquiry_id' => (int) $r['inquiry_id']]; break; }
        }
    }
    // un pack de données installé depuis
    foreach ($packs ?? ep_packs() as $p) { if ($p['mtime'] > $sinceTs) { $out[] = ['k' => 'pack', 'label' => i18n_t('Des données installées depuis : {p}', ['p' => $p['label']])]; break; } }
    // un événement de l'arbre ajouté depuis, dans la fenêtre de dates (pour les gens de la photo et leurs proches, ou aux lieux de l'enquête)
    $from = null; $to = null; foreach ($clues as $c) { if ($c['date_from'] !== null && ($from === null || (int) $c['date_from'] > $from)) { $from = (int) $c['date_from']; } if ($c['date_to'] !== null && ($to === null || (int) $c['date_to'] < $to)) { $to = (int) $c['date_to']; } }
    $from = $from ?? ep_year($conc['date']['from'] ?? null); $to = $to ?? ep_year($conc['date']['to'] ?? null) ?? $from; $from = $from ?? $to;
    if ($from) {
        $im = $pdo->prepare('SELECT media_id FROM photo_inquiry_images WHERE inquiry_id=?'); $im->execute([$id]);
        $onPhoto = ep_people_of($pdo, $im->fetchAll(PDO::FETCH_COLUMN), $id); $ids = array_keys(ep_family_of($pdo, $onPhoto) + array_flip($onPhoto));
        $or = [];
        if ($ids) { $in = implode(',', array_map('intval', $ids)); $or[] = "e.person_id IN ($in) OR f.partner1_id IN ($in) OR f.partner2_id IN ($in)"; }
        if ($places) { $or[] = 'e.place_id IN (' . implode(',', array_map('intval', array_keys($places))) . ')'; }
        $where = $or ? '(' . implode(' OR ', $or) . ')' : '';
        if ($where !== '') {
            $e = $pdo->prepare("SELECT t.label, e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id WHERE $where AND e.year BETWEEN ? AND ? AND e.created_at>? ORDER BY e.id DESC LIMIT 1");
            $e->execute([$from - 1, $to + 1, $since]);
            if ($r = $e->fetch(PDO::FETCH_ASSOC)) { $out[] = ['k' => 'event', 'label' => i18n_t('Un nouvel événement dans l’arbre : {e}', ['e' => trim($r['label'] . ' ' . $r['date_text'])])]; }
        }
    }
    return $out;
}
/** les packs de données installés et leur date (météo d'autrefois, patrimoine, lieux-dits, histoire locale) */
function ep_packs(): array
{
    static $memo = null; if ($memo !== null) { return $memo; }
    $out = [];
    try { require_once __DIR__ . '/meteo.php'; foreach (meteo_files() as $f) { $out[] = ['label' => i18n_t('🌦 Météo d’autrefois'), 'mtime' => (int) $f['mtime']]; } } catch (Throwable $_) {}
    try { require_once __DIR__ . '/lieux_patrimoine.php'; foreach (glob(lp_dir() . '/*.sqlite') ?: [] as $f) { $out[] = ['label' => str_starts_with(basename($f), 'patrimoine') ? i18n_t('⛪ Patrimoine') : i18n_t('🏷 Lieux-dits'), 'mtime' => (int) filemtime($f)]; } } catch (Throwable $_) {}
    try { require_once __DIR__ . '/histoire.php'; $p = hist_pack_path(); if (is_file($p)) { $out[] = ['label' => i18n_t('🗓 Histoire locale'), 'mtime' => (int) filemtime($p)]; } } catch (Throwable $_) {}
    return $memo = $out;
}

/** 🧱 toutes les photos sans lieu ou sans date, rangées par avancement (nombre d'indices) */
function ep_wall(PDO $pdo): array
{
    $hasPlace = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('media') WHERE name='place_id'")->fetchColumn();
    $rows = $pdo->query("SELECT m.id, m.title, m.filename, m.thumbnail, m.date_text" . ($hasPlace ? ', m.place_id' : ', NULL AS place_id') . ",
        (SELECT COUNT(*) FROM photo_inquiry_clues c JOIN photo_inquiry_images i ON i.inquiry_id=c.inquiry_id WHERE i.media_id=m.id) AS n_clues,
        (SELECT COUNT(*) FROM photo_inquiry_images i WHERE i.media_id=m.id) AS n_inq FROM media m WHERE m.media_type='image' AND (COALESCE(m.date_text,'')=''" . ($hasPlace ? ' OR m.place_id IS NULL' : '') . ") ORDER BY n_clues DESC, m.id DESC LIMIT 300")->fetchAll(PDO::FETCH_ASSOC);
    return ['media' => array_map(static fn($r) => ['id' => (int) $r['id'], 'title' => (string) $r['title'], 'filename' => (string) ($r['thumbnail'] ?: $r['filename']), 'no_date' => trim((string) $r['date_text']) === '', 'no_place' => $r['place_id'] === null, 'n_clues' => (int) $r['n_clues'], 'n_inq' => (int) $r['n_inq']], $rows)];
}

/* ═════════ écriture ═════════ */

function ep_need_media(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($v) => $v > 0)));
    if (count($ids) > 60) { throw new LcndaBadInput(i18n_t('Au plus 60 images dans une enquête.')); }
    foreach ($ids as $m) { ep_media_row($pdo, $m); }
    return $ids;
}
function ep_add_images(PDO $pdo, int $id, array $mediaIds): int
{
    $ids = ep_need_media($pdo, $mediaIds);
    // 📑 un document en plusieurs pages (recto, verso, annexes) arrive avec toutes ses pages
    try { if ($pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='media_pages'")->fetchColumn()) {
        foreach ($ids as $m) { $g = $pdo->prepare('SELECT set_id FROM media_pages WHERE media_id=?'); $g->execute([$m]); $set = $g->fetchColumn();
            if ($set) { $p = $pdo->prepare('SELECT media_id FROM media_pages WHERE set_id=? ORDER BY position'); $p->execute([$set]); foreach ($p->fetchAll(PDO::FETCH_COLUMN) as $x) { if (!in_array((int) $x, $ids, true)) { $ids[] = (int) $x; } } } }
    } } catch (Throwable $_) {}
    $pos = (int) $pdo->query('SELECT COALESCE(MAX(position), -1) + 1 FROM photo_inquiry_images WHERE inquiry_id=' . $id)->fetchColumn();
    $ins = $pdo->prepare('INSERT OR IGNORE INTO photo_inquiry_images(inquiry_id, media_id, position, side) VALUES(?,?,?,?)'); $n = 0;
    foreach ($ids as $m) {
        $side = ''; try { $sd = $pdo->prepare('SELECT postcard_side FROM media WHERE id=?'); $sd->execute([$m]); $v = (string) $sd->fetchColumn(); $side = in_array($v, ['recto', 'verso'], true) ? $v : ''; } catch (Throwable $_) {}
        $ins->execute([$id, $m, $pos++, $side]); $n += $ins->rowCount();
    }
    ep_touch($pdo, $id);
    return $n;
}

function ep_create(PDO $pdo, array $d): array
{
    $ids = ep_need_media($pdo, is_array($d['media_ids'] ?? null) ? $d['media_ids'] : []);
    $title = ep_text($d['title'] ?? '', 160);
    if ($title === '') { $title = $ids ? (string) (ep_media_row($pdo, $ids[0])['title'] ?: i18n_t('Enquête photo')) : i18n_t('Enquête photo'); }
    $pdo->prepare('INSERT INTO photo_inquiries(title) VALUES(?)')->execute([$title]); $id = (int) $pdo->lastInsertId();
    ep_add_images($pdo, $id, $ids);
    ep_journal_add($pdo, $id, i18n_t('Enquête commencée'), i18n_t('{n} image(s)', ['n' => count($ids)]));
    log_change($pdo, 'photo_inquiry', $id, 'create', 'Enquête photo créée');
    return ['id' => $id] + ep_get($pdo, $id);
}

function ep_update(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); $q = ep_inquiry_row($pdo, $id);
    $set = []; $args = [];
    if (array_key_exists('title', $d)) { $set[] = 'title=?'; $args[] = ep_text($d['title'], 160) ?: (string) $q['title']; }
    if (array_key_exists('status', $d)) { $set[] = 'status=?'; $args[] = in_array($d['status'], ['open', 'done', 'paused'], true) ? $d['status'] : 'open'; }
    if (array_key_exists('notes', $d)) { $set[] = 'notes=?'; $args[] = ep_text($d['notes'], 20000, true); }
    if (array_key_exists('settings', $d)) { $set[] = 'settings_json=?'; $args[] = ep_json($d['settings'], 120000); }
    if (array_key_exists('is_private', $d)) { $set[] = 'is_private=?'; $args[] = empty($d['is_private']) ? 0 : 1; }
    if ($set) { $pdo->prepare('UPDATE photo_inquiries SET ' . implode(',', $set) . ', updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$args, $id]); }
    return ['ok' => true];
}

function ep_delete(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); $q = ep_inquiry_row($pdo, $id);
    $parts = [['photo_inquiries', 'id=?', [$id]]];
    foreach (['photo_inquiry_images', 'photo_inquiry_clues', 'photo_inquiry_hypotheses', 'photo_inquiry_links', 'photo_inquiry_journal'] as $t) { $parts[] = [$t, 'inquiry_id=?', [$id]]; }
    undo_keep($pdo, 'photo_inquiry', $id, 'Enquête photo supprimée : ' . $q['title'], $parts);
    foreach (['photo_inquiry_images', 'photo_inquiry_clues', 'photo_inquiry_hypotheses', 'photo_inquiry_links', 'photo_inquiry_journal'] as $t) { $pdo->prepare("DELETE FROM {$t} WHERE inquiry_id=?")->execute([$id]); }
    $pdo->prepare('DELETE FROM photo_inquiries WHERE id=?')->execute([$id]);
    return ['ok' => true, 'id' => $id];
}

/** ✂ Séparer : l'image sort de l'enquête avec ses indices (ceux qui ne valent que pour elle) ; ↶ Annuler (photo_inquiry_image) */
function ep_remove_image(PDO $pdo, array $d): array
{
    $iid = safe_int($d['image_id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM photo_inquiry_images WHERE id=?'); $s->execute([$iid]); $img = $s->fetch(PDO::FETCH_ASSOC);
    if (!$img) { throw new RuntimeException(i18n_t('Image introuvable.')); }
    $id = (int) $img['inquiry_id'];
    $cs = $pdo->prepare('SELECT id, images_json FROM photo_inquiry_clues WHERE inquiry_id=?'); $cs->execute([$id]);
    $only = []; $set = [];
    foreach ($cs->fetchAll(PDO::FETCH_ASSOC) as $c) {
        $im = ep_dec($c['images_json']); if (!isset($im[(string) $iid])) { continue; }
        if (count($im) === 1) { $only[] = (int) $c['id']; } else { $set[] = ['photo_inquiry_clues', (int) $c['id'], ['images_json' => $c['images_json']]]; unset($im[(string) $iid]); $pdo->prepare('UPDATE photo_inquiry_clues SET images_json=? WHERE id=?')->execute([ep_json($im), (int) $c['id']]); }
    }
    $parts = [['photo_inquiry_images', 'id=?', [$iid]]];
    if ($only) { $parts[] = ['photo_inquiry_clues', 'id IN (' . implode(',', $only) . ')', []]; }
    undo_keep($pdo, 'photo_inquiry_image', $iid, 'Image sortie de l’enquête photo', $parts, ['set' => $set, 'needs' => [['photo_inquiries', $id, i18n_t('Enquête photo introuvable.')]]]);
    if ($only) { $pdo->exec('DELETE FROM photo_inquiry_clues WHERE id IN (' . implode(',', $only) . ')'); }
    $pdo->prepare('DELETE FROM photo_inquiry_images WHERE id=?')->execute([$iid]);
    ep_touch($pdo, $id);
    return ['ok' => true, 'image_id' => $iid, 'clues_removed' => count($only)];
}

function ep_image_save(PDO $pdo, array $d): array
{
    $iid = safe_int($d['image_id'] ?? 0);
    $s = $pdo->prepare('SELECT inquiry_id FROM photo_inquiry_images WHERE id=?'); $s->execute([$iid]); $id = (int) $s->fetchColumn();
    if (!$id) { throw new RuntimeException(i18n_t('Image introuvable.')); }
    $set = []; $args = [];
    if (array_key_exists('layers', $d)) { $layers = ep_clean_layers($d['layers']); $set[] = 'layers_json=?'; $args[] = ep_json($layers, EP_MAX_LAYERS); }
    if (array_key_exists('side', $d)) { $set[] = 'side=?'; $args[] = in_array($d['side'], ['recto', 'verso'], true) ? $d['side'] : ''; }
    if (array_key_exists('label', $d)) { $set[] = 'label=?'; $args[] = ep_text($d['label'], 120); }
    if (array_key_exists('position', $d)) { $set[] = 'position=?'; $args[] = safe_int($d['position']); }
    if ($set) { $pdo->prepare('UPDATE photo_inquiry_images SET ' . implode(',', $set) . ' WHERE id=?')->execute([...$args, $iid]); ep_touch($pdo, $id); }
    return ['ok' => true];
}

/** des calques : [{id, name, visible, locked, shapes: [{id, t, x, y, w, h, pts, text, color, clue}]}] — tout relu, coordonnées 0–1 */
function ep_clean_layers(mixed $v): array
{
    $out = []; $num = static fn($x) => is_numeric($x) ? round(max(-1.0, min(2.0, (float) $x)), 5) : 0.0;
    foreach (array_slice(is_array($v) ? $v : [], 0, 40) as $l) {
        if (!is_array($l)) { continue; }
        $shapes = [];
        foreach (array_slice(is_array($l['shapes'] ?? null) ? $l['shapes'] : [], 0, 300) as $sh) {
            if (!is_array($sh) || !in_array($sh['t'] ?? '', ['circle', 'rect', 'arrow', 'text', 'free', 'blur', 'vline', 'shadow', 'line', 'crop'], true)) { continue; }
            $o = ['id' => preg_replace('/[^a-z0-9_-]/i', '', (string) ($sh['id'] ?? '')) ?: bin2hex(random_bytes(4)), 't' => $sh['t'], 'x' => $num($sh['x'] ?? 0), 'y' => $num($sh['y'] ?? 0), 'w' => $num($sh['w'] ?? 0), 'h' => $num($sh['h'] ?? 0)];
            if (isset($sh['pts']) && is_array($sh['pts'])) { $o['pts'] = array_map(static fn($p) => [$num($p[0] ?? 0), $num($p[1] ?? 0)], array_slice(array_filter($sh['pts'], 'is_array'), 0, 2000)); }
            if (isset($sh['text'])) { $o['text'] = ep_text($sh['text'], 300); }
            if (isset($sh['color']) && preg_match('/^#[0-9a-f]{6}$/i', (string) $sh['color'])) { $o['color'] = $sh['color']; }
            if (isset($sh['clue'])) { $o['clue'] = safe_int($sh['clue']); }
            if (isset($sh['n'])) { $o['n'] = safe_int($sh['n']); }
            $shapes[] = $o;
        }
        $out[] = ['id' => preg_replace('/[^a-z0-9_-]/i', '', (string) ($l['id'] ?? '')) ?: bin2hex(random_bytes(4)), 'name' => ep_text($l['name'] ?? '', 80), 'visible' => !isset($l['visible']) || !empty($l['visible']), 'locked' => !empty($l['locked']), 'shapes' => $shapes];
    }
    return $out;
}

function ep_clue_save(PDO $pdo, array $d): array
{
    $cid = safe_int($d['id'] ?? 0);
    if ($cid) { $s = $pdo->prepare('SELECT * FROM photo_inquiry_clues WHERE id=?'); $s->execute([$cid]); $old = $s->fetch(PDO::FETCH_ASSOC); if (!$old) { throw new RuntimeException(i18n_t('Indice introuvable.')); } $id = (int) $old['inquiry_id']; }
    else { $old = null; $id = safe_int($d['inquiry_id'] ?? 0); ep_inquiry_row($pdo, $id); }
    $src = in_array($d['source'] ?? ($old['source'] ?? 'moi'), EP_SOURCES, true) ? (string) ($d['source'] ?? $old['source'] ?? 'moi') : 'moi';
    $cert = ep_cert($d['certainty'] ?? ($old['certainty'] ?? 'supposed'));
    // l'IA ne monte jamais seule au-dessus de « Supposé » ; une ombre, une métadonnée : au mieux « Probable » (l'horloge peut être fausse)
    if ($src === 'ia' && !in_array($cert, ['supposed', 'refuted'], true) && empty($d['confirmed'])) { $cert = 'supposed'; }
    if (in_array($src, ['ombre', 'exif'], true) && $cert === 'proven') { $cert = 'probable'; }
    // 🔤 un texte deviné avec une police : « Supposé » au plus tout seul ; « Probable » seulement confirmé par un autre indice (le même nom
    // trouvé dans les données, sur une autre image…), jamais « Prouvé »
    if ($src === 'police' && $cert !== 'refuted') {
        $data = array_key_exists('data', $d) && is_array($d['data']) ? $d['data'] : ep_dec((string) ($old['data_json'] ?? '{}'));
        $by = safe_int($data['confirmed_by'] ?? 0); $ok = false;
        if ($by && $by !== $cid) { $q = $pdo->prepare("SELECT 1 FROM photo_inquiry_clues WHERE id=? AND inquiry_id=? AND source<>'police' AND certainty<>'refuted'"); $q->execute([$by, $id]); $ok = (bool) $q->fetchColumn(); }
        $cert = $ok && in_array($cert, ['proven', 'probable'], true) ? 'probable' : 'supposed';
    }
    // 👤 une proposition de l'outil local Visages : « Supposé » seule ; « Probable » seulement confirmée par un autre indice de
    // l'enquête qui n'est pas un visage (date, lieu, âge qui collent avec la personne) ; jamais « Prouvé »
    if ($src === 'visage' && $cert !== 'refuted') {
        $data = array_key_exists('data', $d) && is_array($d['data']) ? $d['data'] : ep_dec((string) ($old['data_json'] ?? '{}'));
        $by = safe_int($data['confirmed_by'] ?? 0); $ok = false;
        if ($by && $by !== $cid) { $q = $pdo->prepare("SELECT 1 FROM photo_inquiry_clues WHERE id=? AND inquiry_id=? AND source NOT IN ('visage','ia') AND certainty<>'refuted'"); $q->execute([$by, $id]); $ok = (bool) $q->fetchColumn(); }
        $cert = $ok && in_array($cert, ['proven', 'probable'], true) ? 'probable' : 'supposed';
    }
    $v = [
        'kind' => in_array($d['kind'] ?? ($old['kind'] ?? 'autre'), EP_KINDS, true) ? (string) ($d['kind'] ?? $old['kind']) : 'autre',
        'text' => ep_text($d['text'] ?? ($old['text'] ?? ''), 600),
        'certainty' => $cert, 'why' => ep_text($d['why'] ?? ($old['why'] ?? ''), EP_MAX_TEXT, true), 'source' => $src,
        'url' => array_key_exists('url', $d) ? ep_url($d['url']) : (string) ($old['url'] ?? ''),
        'consulted_at' => array_key_exists('consulted_at', $d) ? ep_text($d['consulted_at'], 40) : (string) ($old['consulted_at'] ?? ''),
        'images_json' => array_key_exists('images', $d) ? ep_json(array_filter(is_array($d['images']) ? $d['images'] : [], static fn($x) => in_array($x, ['yes', 'check'], true))) : (string) ($old['images_json'] ?? '{}'),
        'shape_id' => array_key_exists('shape_id', $d) ? preg_replace('/[^a-z0-9_-]/i', '', (string) $d['shape_id']) : (string) ($old['shape_id'] ?? ''),
        'date_from' => array_key_exists('date_from', $d) ? ep_year($d['date_from']) : ($old['date_from'] ?? null),
        'date_to' => array_key_exists('date_to', $d) ? ep_year($d['date_to']) : ($old['date_to'] ?? null),
        'place_id' => array_key_exists('place_id', $d) ? (safe_int($d['place_id']) ?: null) : ($old['place_id'] ?? null),
        'lang' => array_key_exists('lang', $d) ? ep_text($d['lang'], 40) : (string) ($old['lang'] ?? ''),
        'data_json' => array_key_exists('data', $d) ? ep_json($d['data']) : (string) ($old['data_json'] ?? '{}'),
    ];
    if ($v['text'] === '') { throw new LcndaBadInput(i18n_t('Écris l’indice (ce que tu vois).')); }
    if ($v['place_id']) { $s = $pdo->prepare('SELECT 1 FROM places WHERE id=?'); $s->execute([$v['place_id']]); if (!$s->fetchColumn()) { $v['place_id'] = null; } }
    if ($old) {
        $pdo->prepare('UPDATE photo_inquiry_clues SET ' . implode(',', array_map(static fn($k) => "$k=?", array_keys($v))) . ', updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...array_values($v), $cid]);
        if ((string) $old['certainty'] !== $cert) { ep_journal_add($pdo, $id, i18n_t('⚖ Certitude de l’indice {n}', ['n' => (int) $old['num']]), ep_cert_label((string) $old['certainty']) . ' → ' . ep_cert_label($cert) . ' · « ' . mb_substr($v['text'], 0, 120) . ' »'); }
    } else {
        $num = (int) $pdo->query('SELECT COALESCE(MAX(num), 0) + 1 FROM photo_inquiry_clues WHERE inquiry_id=' . $id)->fetchColumn();
        $cols = ['inquiry_id', 'num', ...array_keys($v)];
        $pdo->prepare('INSERT INTO photo_inquiry_clues(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute([$id, $num, ...array_values($v)]);
        $cid = (int) $pdo->lastInsertId();
        ep_journal_add($pdo, $id, i18n_t('Indice {n} ajouté', ['n' => $num]), $v['text']);
    }
    ep_touch($pdo, $id);
    $s = $pdo->prepare('SELECT * FROM photo_inquiry_clues WHERE id=?'); $s->execute([$cid]);
    return ['clue' => ep_clue_out($s->fetch(PDO::FETCH_ASSOC))];
}

function ep_clue_delete(PDO $pdo, array $d): array
{
    $cid = safe_int($d['id'] ?? 0);
    $s = $pdo->prepare('SELECT inquiry_id FROM photo_inquiry_clues WHERE id=?'); $s->execute([$cid]); $id = (int) $s->fetchColumn();
    if (!$id) { throw new RuntimeException(i18n_t('Indice introuvable.')); }
    undo_keep($pdo, 'photo_inquiry_clue', $cid, 'Indice supprimé', [['photo_inquiry_clues', 'id=?', [$cid]]], ['needs' => [['photo_inquiries', $id, i18n_t('Enquête photo introuvable.')]]]);
    $pdo->prepare('DELETE FROM photo_inquiry_clues WHERE id=?')->execute([$cid]);
    ep_touch($pdo, $id);
    return ['ok' => true, 'id' => $cid];
}

function ep_hyp_save(PDO $pdo, array $d): array
{
    $hid = safe_int($d['id'] ?? 0);
    if ($hid) { $s = $pdo->prepare('SELECT inquiry_id FROM photo_inquiry_hypotheses WHERE id=?'); $s->execute([$hid]); $id = (int) $s->fetchColumn(); if (!$id) { throw new RuntimeException(i18n_t('Hypothèse introuvable.')); } }
    else { $id = safe_int($d['inquiry_id'] ?? 0); ep_inquiry_row($pdo, $id); }
    $stances = [];
    foreach ((is_array($d['stances'] ?? null) ? $d['stances'] : []) as $k => $s) { if (in_array($s, ['pour', 'contre', 'deux'], true)) { $stances[(string) safe_int($k)] = $s; } }
    $v = ['kind' => ($d['kind'] ?? '') === 'date' ? 'date' : 'lieu', 'label' => ep_text($d['label'] ?? '', 160), 'place_id' => safe_int($d['place_id'] ?? 0) ?: null,
        'date_from' => ep_year($d['date_from'] ?? null), 'date_to' => ep_year($d['date_to'] ?? null), 'stances_json' => ep_json($stances), 'note' => ep_text($d['note'] ?? '', 2000, true)];
    if ($v['label'] === '') { throw new LcndaBadInput(i18n_t('Donne un nom à l’hypothèse (« Brive », « vers 1910 »…).')); }
    if ($hid) { $pdo->prepare('UPDATE photo_inquiry_hypotheses SET ' . implode(',', array_map(static fn($k) => "$k=?", array_keys($v))) . ' WHERE id=?')->execute([...array_values($v), $hid]); }
    else { $cols = ['inquiry_id', ...array_keys($v)]; $pdo->prepare('INSERT INTO photo_inquiry_hypotheses(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute([$id, ...array_values($v)]); $hid = (int) $pdo->lastInsertId(); }
    ep_touch($pdo, $id);
    return ['ok' => true, 'id' => $hid];
}
function ep_hyp_delete(PDO $pdo, array $d): array
{
    $hid = safe_int($d['id'] ?? 0); $s = $pdo->prepare('SELECT * FROM photo_inquiry_hypotheses WHERE id=?'); $s->execute([$hid]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException(i18n_t('Hypothèse introuvable.')); }
    $pdo->prepare('DELETE FROM photo_inquiry_hypotheses WHERE id=?')->execute([$hid]);
    return ['ok' => true, 'row' => $row];
}
function ep_hyp_restore(PDO $pdo, array $d): array
{
    $r = is_array($d['row'] ?? null) ? $d['row'] : []; $id = safe_int($r['inquiry_id'] ?? 0); ep_inquiry_row($pdo, $id);
    $pdo->prepare('INSERT OR IGNORE INTO photo_inquiry_hypotheses(id, inquiry_id, kind, label, place_id, date_from, date_to, stances_json, note) VALUES(?,?,?,?,?,?,?,?,?)')->execute([
        safe_int($r['id'] ?? 0) ?: null, $id, ($r['kind'] ?? '') === 'date' ? 'date' : 'lieu', ep_text($r['label'] ?? '', 160), safe_int($r['place_id'] ?? 0) ?: null, ep_year($r['date_from'] ?? null), ep_year($r['date_to'] ?? null), ep_json(ep_dec((string) ($r['stances_json'] ?? '{}'))), ep_text($r['note'] ?? '', 2000, true)]);
    return ['ok' => true];
}

function ep_link_save(PDO $pdo, array $d): array
{
    $id = safe_int($d['inquiry_id'] ?? 0); ep_inquiry_row($pdo, $id);
    $kind = (string) ($d['kind'] ?? ''); $ref = safe_int($d['ref_id'] ?? 0);
    if (!in_array($kind, EP_LINK_KINDS, true) || $ref <= 0) { throw new LcndaBadInput(i18n_t('Choisis à quoi relier l’enquête.')); }
    $table = ['person' => 'persons', 'place' => 'places', 'event' => 'events', 'investigation' => 'investigations', 'source' => 'sources', 'board' => 'boards'][$kind];
    try { $s = $pdo->prepare("SELECT 1 FROM {$table} WHERE id=?"); $s->execute([$ref]); $ok = (bool) $s->fetchColumn(); } catch (Throwable $_) { $ok = false; }
    if (!$ok) { throw new RuntimeException(i18n_t('Ce à quoi relier l’enquête n’existe pas.')); }
    $pdo->prepare('INSERT OR IGNORE INTO photo_inquiry_links(inquiry_id, kind, ref_id) VALUES(?,?,?)')->execute([$id, $kind, $ref]);
    $lid = (int) $pdo->query('SELECT id FROM photo_inquiry_links WHERE inquiry_id=' . $id . ' AND kind=' . $pdo->quote($kind) . ' AND ref_id=' . $ref)->fetchColumn();
    ep_touch($pdo, $id);
    return ['ok' => true, 'id' => $lid, 'links' => ep_links($pdo, $id)];
}
function ep_link_delete(PDO $pdo, array $d): array
{
    $lid = safe_int($d['id'] ?? 0); $s = $pdo->prepare('SELECT * FROM photo_inquiry_links WHERE id=?'); $s->execute([$lid]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException(i18n_t('Lien introuvable.')); }
    $pdo->prepare('DELETE FROM photo_inquiry_links WHERE id=?')->execute([$lid]);
    return ['ok' => true, 'row' => ['kind' => $row['kind'], 'ref_id' => (int) $row['ref_id'], 'inquiry_id' => (int) $row['inquiry_id']]];
}

function ep_conclusion(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); $before = ep_dec(ep_inquiry_row($pdo, $id)['conclusion_json']);
    $c = is_array($d['conclusion'] ?? null) ? $d['conclusion'] : [];
    $out = [];
    if (is_array($c['place'] ?? null)) { $p = $c['place']; $pid = safe_int($p['place_id'] ?? 0);
        if ($pid) { $s = $pdo->prepare('SELECT name FROM places WHERE id=?'); $s->execute([$pid]); $nm = $s->fetchColumn(); if ($nm === false) { $pid = 0; } }
        $out['place'] = ['place_id' => $pid ?: null, 'name' => ep_text($p['name'] ?? ($nm ?? ''), 160) ?: (string) ($nm ?? ''), 'certainty' => ep_cert($p['certainty'] ?? 'probable'), 'why' => ep_text($p['why'] ?? '', 2000, true)];
        if ($out['place']['certainty'] === 'refuted') { $out['place']['certainty'] = 'supposed'; } }
    if (is_array($c['date'] ?? null)) { $dt = $c['date'];
        $out['date'] = ['text' => ep_text($dt['text'] ?? '', 80), 'from' => ep_year($dt['from'] ?? null), 'to' => ep_year($dt['to'] ?? null), 'certainty' => ep_cert($dt['certainty'] ?? 'probable'), 'why' => ep_text($dt['why'] ?? '', 2000, true)];
        if ($out['date']['certainty'] === 'refuted') { $out['date']['certainty'] = 'supposed'; } }
    if (isset($c['text'])) { $out['text'] = ep_text($c['text'], 4000, true); }
    $pdo->prepare('UPDATE photo_inquiries SET conclusion_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([ep_json($out), $id]);
    ep_journal_conclusion($pdo, $id, $before, $out, safe_int($d['because'] ?? 0));
    return ['ok' => true, 'conclusion' => $out];
}
/** 📜 « Ce qui a changé ma conclusion » : chaque changement du lieu, de la date ou de leur certitude va au journal de l'enquête
 *  (« ⚖ … » : de → à, et l'indice qui l'a fait changer) — pas de table de plus */
function ep_cert_label(string $c): string { return i18n_t(['proven' => 'Prouvé', 'probable' => 'Probable', 'supposed' => 'Supposé', 'refuted' => 'Réfuté'][$c] ?? 'Supposé'); }
function ep_journal_conclusion(PDO $pdo, int $id, array $old, array $new, int $because = 0): void
{
    $clue = '';
    if ($because) { $s = $pdo->prepare('SELECT num, text FROM photo_inquiry_clues WHERE id=? AND inquiry_id=?'); $s->execute([$because, $id]); if ($c = $s->fetch(PDO::FETCH_ASSOC)) { $clue = i18n_t('à cause de l’indice {n} « {t} »', ['n' => (int) $c['num'], 't' => mb_substr((string) $c['text'], 0, 120)]); } }
    $pname = static function (?array $p) use ($pdo): string { if (!$p) { return ''; } $n = (string) ($p['name'] ?? ''); if ($n === '' && !empty($p['place_id'])) { $s = $pdo->prepare('SELECT name FROM places WHERE id=?'); $s->execute([(int) $p['place_id']]); $n = (string) $s->fetchColumn(); } return $n; };
    $side = static fn(string $label, string $cert) => $label === '' ? i18n_t('rien') : $label . ' (' . ep_cert_label($cert) . ')';
    foreach (['place' => i18n_t('⚖ Conclusion : le lieu'), 'date' => i18n_t('⚖ Conclusion : la date')] as $k => $what) {
        $a = is_array($old[$k] ?? null) ? $old[$k] : null; $b = is_array($new[$k] ?? null) ? $new[$k] : null;
        $la = $k === 'place' ? $pname($a) : (string) ($a['text'] ?? ''); $lb = $k === 'place' ? $pname($b) : (string) ($b['text'] ?? '');
        $ca = (string) ($a['certainty'] ?? ''); $cb = (string) ($b['certainty'] ?? '');
        $same = ($k === 'place' ? (int) ($a['place_id'] ?? 0) === (int) ($b['place_id'] ?? 0) && $la === $lb : $la === $lb) && $ca === $cb;
        if ($same || ($la === '' && $lb === '')) { continue; }
        ep_journal_add($pdo, $id, $what, $side($la, $ca) . ' → ' . $side($lb, $cb) . ($clue !== '' ? ' · ' . $clue : ''));
    }
}

/** 📍 « Mettre ce lieu sur la photo » : le lieu et la date de chaque image, avec la certitude et l'enquête comme source (hypothèse
 *  de lieu retenue, lib/place_photos.php). Renvoie un jeton pour ↶ Annuler (unapply). */
function ep_apply(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); $q = ep_inquiry_row($pdo, $id); $c = ep_dec($q['conclusion_json']);
    $place = $c['place'] ?? null; $date = $c['date'] ?? null;
    if (empty($place['place_id']) && empty($date['text'])) { throw new LcndaBadInput(i18n_t('La conclusion n’a encore ni lieu de la base ni date.')); }
    $hasPlace = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('media') WHERE name='place_id'")->fetchColumn();
    require_once __DIR__ . '/place_photos.php'; pp_ready($pdo);
    $wanted = array_map('intval', is_array($d['image_ids'] ?? null) ? $d['image_ids'] : []);
    $s = $pdo->prepare('SELECT i.id, i.media_id FROM photo_inquiry_images i JOIN media m ON m.id=i.media_id WHERE i.inquiry_id=?'); $s->execute([$id]);
    $before = []; $map = ['proven' => 'certain', 'probable' => 'probable', 'supposed' => 'possible'];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        if ($wanted && !in_array((int) $r['id'], $wanted, true)) { continue; }
        $mid = (int) $r['media_id']; $m = ep_media_row($pdo, $mid);
        $b = ['media_id' => $mid, 'date_text' => (string) $m['date_text'], 'place_id' => $hasPlace ? ($m['place_id'] !== null ? (int) $m['place_id'] : null) : null, 'retained' => null, 'guess' => null];
        if (!empty($date['text'])) { $pdo->prepare('UPDATE media SET date_text=? WHERE id=?')->execute([$date['text'], $mid]); }
        if (!empty($place['place_id']) && $hasPlace) {
            $pdo->prepare('UPDATE media SET place_id=? WHERE id=?')->execute([(int) $place['place_id'], $mid]);
            $rt = $pdo->prepare('SELECT id FROM place_photo_guesses WHERE media_id=? AND retained=1'); $rt->execute([$mid]); $b['retained'] = ((int) $rt->fetchColumn()) ?: null;
            $why = i18n_t('🔎 Enquête photo « {title} »', ['title' => $q['title']]) . ($place['why'] !== '' ? ' — ' . $place['why'] : '');
            $pdo->prepare("INSERT INTO place_photo_guesses(media_id, place_id, certainty, why, origin, origin_id) VALUES(?,?,?,?, 'enquete_photo', ?)")->execute([$mid, (int) $place['place_id'], $map[$place['certainty']] ?? 'possible', mb_substr($why, 0, 2000), $id]);
            $b['guess'] = (int) $pdo->lastInsertId(); pp_set_retained($pdo, $mid, $b['guess']);
        }
        $before[] = $b;
    }
    if (!$before) { throw new LcndaBadInput(i18n_t('Aucune image à mettre à jour.')); }
    log_change($pdo, 'photo_inquiry_apply', $id, 'update', 'Lieu et date mis sur les photos', ['_apply' => $before], null);
    $token = (int) $pdo->lastInsertId();
    ep_journal_add($pdo, $id, i18n_t('Conclusion mise sur les images'), trim(($place['name'] ?? '') . ' ' . ($date['text'] ?? '')));
    return ['ok' => true, 'token' => $token, 'n' => count($before)];
}
function ep_unapply(PDO $pdo, array $d): array
{
    $tok = safe_int($d['token'] ?? 0);
    $s = $pdo->prepare("SELECT entity_id, before_json FROM change_log WHERE id=? AND entity_type='photo_inquiry_apply'"); $s->execute([$tok]); $row = $s->fetch(PDO::FETCH_ASSOC);
    $b = $row ? ep_dec($row['before_json'])['_apply'] ?? null : null;
    if (!is_array($b)) { throw new RuntimeException(i18n_t('Rien à annuler.')); }
    $hasPlace = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('media') WHERE name='place_id'")->fetchColumn();
    foreach ($b as $x) {
        $mid = safe_int($x['media_id'] ?? 0);
        $pdo->prepare('UPDATE media SET date_text=? WHERE id=?')->execute([(string) ($x['date_text'] ?? ''), $mid]);
        if ($hasPlace) { $pdo->prepare('UPDATE media SET place_id=? WHERE id=?')->execute([$x['place_id'] ?? null, $mid]); }
        if (!empty($x['guess'])) { $pdo->prepare("DELETE FROM place_photo_guesses WHERE id=? AND origin='enquete_photo'")->execute([(int) $x['guess']]); }
        if (!empty($x['retained'])) { require_once __DIR__ . '/place_photos.php'; pp_set_retained($pdo, $mid, (int) $x['retained']); }
    }
    log_change($pdo, 'photo_inquiry_apply', (int) $row['entity_id'], 'restore', 'Lieu et date retirés des photos');
    return ['ok' => true];
}

function ep_journal_add(PDO $pdo, int $id, string $what, string $result = ''): void
{
    $pdo->prepare('INSERT INTO photo_inquiry_journal(inquiry_id, what, result) VALUES(?,?,?)')->execute([$id, mb_substr($what, 0, 300), mb_substr($result, 0, 1000)]);
}

/* ═════════ 📒 repères, 📮 photographes ═════════ */

function ep_landmark_save(PDO $pdo, array $d): array
{
    $v = ['label' => ep_text($d['label'] ?? '', 160), 'kind' => in_array($d['kind'] ?? 'lieu', EP_KINDS, true) ? (string) $d['kind'] : 'lieu', 'place_id' => safe_int($d['place_id'] ?? 0) ?: null,
        'media_id' => safe_int($d['media_id'] ?? 0) ?: null, 'inquiry_id' => safe_int($d['inquiry_id'] ?? 0) ?: null, 'note' => ep_text($d['note'] ?? '', 1000, true)];
    if ($v['label'] === '') { throw new LcndaBadInput(i18n_t('Donne un nom au repère.')); }
    $lid = safe_int($d['id'] ?? 0);
    if ($lid) { $pdo->prepare('UPDATE photo_landmarks SET ' . implode(',', array_map(static fn($k) => "$k=?", array_keys($v))) . ' WHERE id=?')->execute([...array_values($v), $lid]); }
    else { $cols = array_keys($v); $pdo->prepare('INSERT INTO photo_landmarks(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute(array_values($v)); $lid = (int) $pdo->lastInsertId(); }
    return ['ok' => true, 'id' => $lid];
}
function ep_landmarks(PDO $pdo): array
{
    return ['landmarks' => $pdo->query('SELECT l.*, p.name AS place_name, m.filename FROM photo_landmarks l LEFT JOIN places p ON p.id=l.place_id LEFT JOIN media m ON m.id=l.media_id ORDER BY l.label LIMIT 500')->fetchAll(PDO::FETCH_ASSOC)];
}
function ep_photographer_save(PDO $pdo, array $d): array
{
    $v = ['name' => ep_text($d['name'] ?? '', 160), 'city' => ep_text($d['city'] ?? '', 120), 'address' => ep_text($d['address'] ?? '', 200), 'year_from' => ep_year($d['year_from'] ?? null),
        'year_to' => ep_year($d['year_to'] ?? null), 'note' => ep_text($d['note'] ?? '', 2000, true), 'url' => ep_url($d['url'] ?? ''), 'backdrops' => ep_backdrops($d['backdrops'] ?? '')];
    if ($v['name'] === '') { throw new LcndaBadInput(i18n_t('Écris le nom du photographe ou de l’éditeur.')); }
    $pid = safe_int($d['id'] ?? 0);
    if ($pid) { $pdo->prepare('UPDATE photo_photographers SET ' . implode(',', array_map(static fn($k) => "$k=?", array_keys($v))) . ' WHERE id=?')->execute([...array_values($v), $pid]); }
    else { $cols = array_keys($v); $pdo->prepare('INSERT INTO photo_photographers(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute(array_values($v)); $pid = (int) $pdo->lastInsertId(); }
    return ['ok' => true, 'id' => $pid];
}
function ep_simple_delete(PDO $pdo, string $table, array $d): array
{
    $rid = safe_int($d['id'] ?? 0); $s = $pdo->prepare("SELECT * FROM {$table} WHERE id=?"); $s->execute([$rid]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException(i18n_t('Introuvable.')); }
    $pdo->prepare("DELETE FROM {$table} WHERE id=?")->execute([$rid]);
    return ['ok' => true, 'row' => $row];
}
function ep_simple_restore(PDO $pdo, string $table, array $d): array
{
    $r = is_array($d['row'] ?? null) ? $d['row'] : [];
    $cols = $table === 'photo_landmarks' ? ['id', 'label', 'kind', 'place_id', 'media_id', 'inquiry_id', 'note'] : ['id', 'name', 'city', 'address', 'year_from', 'year_to', 'note', 'url', 'backdrops'];
    $vals = array_map(static fn($c) => is_scalar($r[$c] ?? null) ? $r[$c] : null, $cols);
    $pdo->prepare("INSERT OR IGNORE INTO {$table}(" . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute($vals);
    return ['ok' => true];
}

/* ═════════ 🤖 l'IA de cet ordinateur (Ollama), en option : décrire, jamais nommer ═════════ */

/** les mots qui trahissent une identification de personne ou de visage : la réponse est jetée */
const EP_AI_PERSON = '/\b(s[’\']appelle|il s[’\']agit de (?:m\.|mme|monsieur|madame)|ressemble à (?:m\.|mme|monsieur|madame)|reconna[iî]|visage de|portrait de (?:m\.|mme)|c[’\']est (?:m\.|mme|monsieur|madame|le petit|la petite))/iu';

function ep_ai_ask(PDO $pdo, array $d): array
{
    if (ep_kiosk()) { throw new LcndaBadInput(i18n_t('Mode consultation : rien ne peut être modifié.')); }
    $iid = safe_int($d['image_id'] ?? 0);
    $s = $pdo->prepare('SELECT i.inquiry_id, m.filename, m.media_type FROM photo_inquiry_images i JOIN media m ON m.id=i.media_id WHERE i.id=?'); $s->execute([$iid]); $img = $s->fetch(PDO::FETCH_ASSOC);
    if (!$img || $img['media_type'] !== 'image' || !$img['filename']) { throw new RuntimeException(i18n_t('Image introuvable.')); }
    $path = MEDIA_DIR . '/' . basename((string) $img['filename']);
    if (!is_file($path)) { throw new RuntimeException(i18n_t('Le fichier de l’image est introuvable.')); }
    $question = ep_text($d['question'] ?? '', 300);
    if ($question === '') { throw new LcndaBadInput(i18n_t('Choisis une question.')); }
    require_once __DIR__ . '/transcription_actes.php';
    $st = tx_deep_status();
    if (!$st['running']) { throw new LcndaBadInput(i18n_t('L’IA de cet ordinateur (Ollama) n’est pas lancée : ouvre-la, puis réessaie.')); }
    $present = array_values(array_filter(array_merge($st['models'], $st['others'] ?? []), static fn($m) => !empty($m['present'])));
    $model = (string) (array_values(array_filter($present, static fn($m) => !empty($m['recommended'])))[0]['tag'] ?? $present[0]['tag'] ?? '');
    if ($model === '' || !tx_deep_tag_ok($model)) { throw new LcndaBadInput(i18n_t('Aucun modèle d’IA qui sait regarder une image n’est installé.')); }
    $b64 = ep_ai_image($path);
    $prompt = "Tu aides à enquêter sur une photo ancienne. Question : « {$question} »\n"
        . "Règles strictes :\n"
        . "- Décris seulement ce que tu vois. Ne nomme JAMAIS un lieu, une ville ou un monument, sauf si son nom est écrit lisiblement sur l'image (alors recopie le texte entre guillemets).\n"
        . "- Ne nomme JAMAIS une personne, ne dis jamais qui elle est, ne décris pas les visages (aucune reconnaissance de visage).\n"
        . "- Pour CHAQUE chose vue, donne son cadre sur l'image : box = [x, y, largeur, hauteur], de 0 à 1000 (0,0 = en haut à gauche). Sans cadre, ne la dis pas.\n"
        . "- Si tu ne sais pas, ou si rien n'est sûr, réponds « je ne sais pas » : c'est la réponse attendue.\n"
        . "Réponds en JSON seulement : {\"observations\": [{\"text\": \"…\", \"box\": [x, y, w, h], \"clarity\": \"nette\" ou \"floue\"}], \"unknown\": \"…ce que tu ne peux pas dire…\"}";
    $r = tx_deep_http('POST', '/api/chat', ['model' => $model, 'stream' => false, 'format' => 'json', 'messages' => [['role' => 'user', 'content' => $prompt, 'images' => [$b64]]], 'options' => ['temperature' => 0]], 240);
    $txt = (string) ($r['json']['message']['content'] ?? '');
    if (!$r['ok'] && $txt === '') { throw new RuntimeException(i18n_t('L’IA n’a pas répondu.')); }
    return ep_ai_filter($txt) + ['model' => $model];
}
/** l'image envoyée à Ollama (sur cet ordinateur) : réduite à 1600 px au plus */
function ep_ai_image(string $path): string
{
    $raw = (string) file_get_contents($path);
    if (function_exists('imagecreatefromstring') && ($im = @imagecreatefromstring($raw))) {
        $w = imagesx($im); $h = imagesy($im); $k = min(1.0, 1600 / max($w, $h));
        if ($k < 1.0) { $dst = imagecreatetruecolor((int) round($w * $k), (int) round($h * $k)); imagecopyresampled($dst, $im, 0, 0, 0, 0, imagesx($dst), imagesy($dst), $w, $h); $im = $dst; }
        ob_start(); imagejpeg($im, null, 88); $raw = (string) ob_get_clean();
    }
    return base64_encode($raw);
}
/** les règles de l'IA, vérifiées ici : un cadre pour chaque observation (sinon jetée), pas de nom de personne ; « je ne sais pas » permis */
function ep_ai_filter(string $txt): array
{
    $j = json_decode($txt, true);
    if (!is_array($j) && preg_match('/\{.*\}/s', $txt, $m)) { $j = json_decode($m[0], true); }
    $obs = []; $dropped = 0;
    foreach ((is_array($j['observations'] ?? null) ? $j['observations'] : []) as $o) {
        if (!is_array($o)) { $dropped++; continue; }
        $t = ep_text($o['text'] ?? '', 300); $b = $o['box'] ?? null;
        $okBox = is_array($b) && count($b) === 4 && count(array_filter($b, 'is_numeric')) === 4 && (float) $b[2] > 0 && (float) $b[3] > 0 && (float) $b[0] >= 0 && (float) $b[1] >= 0 && (float) $b[0] + (float) $b[2] <= 1001 && (float) $b[1] + (float) $b[3] <= 1001;
        if ($t === '' || !$okBox || preg_match(EP_AI_PERSON, $t)) { $dropped++; continue; }
        $obs[] = ['text' => $t, 'box' => array_map(static fn($v) => round((float) $v / 1000, 4), array_values($b)), 'clarity' => ($o['clarity'] ?? '') === 'floue' ? 'floue' : 'nette', 'certainty' => 'supposed'];
    }
    $unknown = ep_text($j['unknown'] ?? '', 400);
    if (preg_match(EP_AI_PERSON, $unknown)) { $unknown = ''; }
    return ['observations' => array_slice($obs, 0, 12), 'unknown' => $unknown, 'dropped' => $dropped, 'dont_know' => !$obs];
}

/* ═════════ aiguillage ═════════ */

function ep_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        ep_ready($pdo);
        if (!$isWrite && $action === 'ep') {
            $op = (string) ($_GET['op'] ?? '');
            json_response(match ($op) {
                'list' => ep_list($pdo),
                'get' => ep_get($pdo, safe_int($_GET['id'] ?? 0)),
                'media' => ep_media($pdo, safe_int($_GET['media_id'] ?? 0)),
                'counts' => ep_counts($pdo),
                'by_file' => ep_by_file($pdo, (string) ($_GET['file'] ?? '')),
                'search' => ep_search($pdo, $_GET),
                'tree' => ep_tree($pdo, safe_int($_GET['id'] ?? 0), $_GET),
                'nearby' => ep_nearby($pdo, $_GET),
                'sisters' => ep_sisters($pdo, safe_int($_GET['id'] ?? 0)),
                'privacy' => ep_privacy($pdo, safe_int($_GET['id'] ?? 0)),
                'wall' => ep_wall($pdo),
                'landmarks' => ep_landmarks($pdo),
                'photographers' => ['photographers' => $pdo->query('SELECT * FROM photo_photographers ORDER BY name LIMIT 1000')->fetchAll(PDO::FETCH_ASSOC)],
                'candidates' => ep_candidates($pdo, safe_int($_GET['id'] ?? 0), $_GET),
                'face_people' => ep_face_people($pdo, $_GET),
                'buildings' => ep_buildings($pdo, $_GET),
                'local_events' => ep_local_events($pdo, $_GET),
                'map' => ep_map($pdo),
                'races' => ep_races($pdo, $_GET),
                'family_places' => ep_family_places($pdo),
                'person' => ep_for_person($pdo, safe_int($_GET['person_id'] ?? 0)),
                'place' => ep_for_place($pdo, safe_int($_GET['place_id'] ?? 0)),
                'that_day' => ep_that_day($pdo, $_GET),
                'occupations' => ep_occupations($pdo, $_GET),
                'occasions' => ep_occasions($pdo, safe_int($_GET['id'] ?? 0), $_GET),
                'photographer_route' => ep_photographer_route($pdo, $_GET),
                'place_timeline' => ep_place_timeline($pdo, $_GET),
                'group_expected' => ep_group_expected($pdo, safe_int($_GET['id'] ?? 0), $_GET),
                'versos' => ep_versos($pdo, safe_int($_GET['id'] ?? 0), $_GET),
                'person_years' => ep_person_years($pdo, $_GET),
                default => throw new LcndaBadInput('Opération inconnue.'),
            });
        }
        if ($isWrite && $action === 'ep_write') {
            if (ep_kiosk()) { throw new LcndaBadInput(i18n_t('Mode consultation : rien ne peut être modifié.')); }
            $op = (string) ($payload['op'] ?? '');
            $own = !$pdo->inTransaction(); if ($own) { $pdo->beginTransaction(); }
            try {
                $res = match ($op) {
                    'create' => ep_create($pdo, $payload),
                    'update' => ep_update($pdo, $payload),
                    'delete' => ep_delete($pdo, $payload),
                    'add_images' => (static function () use ($pdo, $payload) { $id = safe_int($payload['id'] ?? 0); ep_inquiry_row($pdo, $id); $n = ep_add_images($pdo, $id, is_array($payload['media_ids'] ?? null) ? $payload['media_ids'] : []); return ['ok' => true, 'added' => $n]; })(),
                    'remove_image' => ep_remove_image($pdo, $payload),
                    'image_save' => ep_image_save($pdo, $payload),
                    'clue_save' => ep_clue_save($pdo, $payload),
                    'clue_delete' => ep_clue_delete($pdo, $payload),
                    'hyp_save' => ep_hyp_save($pdo, $payload),
                    'hyp_delete' => ep_hyp_delete($pdo, $payload),
                    'hyp_restore' => ep_hyp_restore($pdo, $payload),
                    'link_save' => ep_link_save($pdo, $payload),
                    'link_delete' => ep_link_delete($pdo, $payload),
                    'conclusion' => ep_conclusion($pdo, $payload),
                    'apply' => ep_apply($pdo, $payload),
                    'unapply' => ep_unapply($pdo, $payload),
                    'journal' => (static function () use ($pdo, $payload) { $id = safe_int($payload['id'] ?? 0); ep_inquiry_row($pdo, $id); ep_journal_add($pdo, $id, ep_text($payload['what'] ?? '', 300), ep_text($payload['result'] ?? '', 1000, true)); return ['ok' => true]; })(),
                    'landmark_save' => ep_landmark_save($pdo, $payload),
                    'landmark_delete' => ep_simple_delete($pdo, 'photo_landmarks', $payload),
                    'landmark_restore' => ep_simple_restore($pdo, 'photo_landmarks', $payload),
                    'photographer_save' => ep_photographer_save($pdo, $payload),
                    'photographer_delete' => ep_simple_delete($pdo, 'photo_photographers', $payload),
                    'photographer_restore' => ep_simple_restore($pdo, 'photo_photographers', $payload),
                    'ai_ask' => ep_ai_ask($pdo, $payload),
                    'log_export' => (static function () use ($pdo, $payload) { if (function_exists('access_log_add')) { access_log_add($pdo, ($payload['kind'] ?? '') === 'print' ? 'print' : 'export', 'photo_inquiry', safe_int($payload['id'] ?? 0) ?: null, '', mb_substr(ep_text($payload['what'] ?? 'enquete_photo', 40), 0, 40)); } return ['ok' => true]; })(),
                    default => throw new LcndaBadInput('Opération inconnue.'),
                };
                if ($own) { $pdo->commit(); }
            } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
            json_response($res);
        }
        json_response(['error' => 'Action inconnue.'], 400);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'introuvable') ? 404 : 422);
    } catch (Throwable $e) {
        error_log('LCNDA enquete_photo : ' . $e->getMessage());
        json_response(['error' => i18n_t('L’enquête photo n’est pas disponible ici.'), 'unavailable' => true], 422);
    }
}

/** 👤 sur la fiche : « 🔎 1 enquête photo · lieu probable : Brive » (ses photos, ou l'enquête reliée à la personne) */
function ep_for_person(PDO $pdo, int $pid): array
{
    if ($pid <= 0) { return ['inquiries' => []]; }
    $ids = [];
    $s = $pdo->prepare("SELECT inquiry_id FROM photo_inquiry_links WHERE kind='person' AND ref_id=?"); $s->execute([$pid]); foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $i) { $ids[(int) $i] = 1; }
    try { $s = $pdo->prepare("SELECT DISTINCT i.inquiry_id FROM photo_inquiry_images i JOIN media_tags t ON t.media_id=i.media_id WHERE t.person_id=?"); $s->execute([$pid]); foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $i) { $ids[(int) $i] = 1; } } catch (Throwable $_) {}
    try { $s = $pdo->prepare("SELECT DISTINCT i.inquiry_id FROM photo_inquiry_images i JOIN media_links l ON l.media_id=i.media_id WHERE l.entity_type='person' AND l.entity_id=?"); $s->execute([$pid]); foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $i) { $ids[(int) $i] = 1; } } catch (Throwable $_) {}
    return ['inquiries' => ep_summaries($pdo, array_keys($ids))];
}
/** 📍 la page d'un lieu : « 🔎 Photos de ce lieu et leurs enquêtes » */
function ep_for_place(PDO $pdo, int $plid): array
{
    if ($plid <= 0) { return ['inquiries' => []]; }
    $ids = [];
    $s = $pdo->prepare("SELECT inquiry_id FROM photo_inquiry_links WHERE kind='place' AND ref_id=?"); $s->execute([$plid]); foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $i) { $ids[(int) $i] = 1; }
    $s = $pdo->query("SELECT id, conclusion_json FROM photo_inquiries"); foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { if ((int) (ep_dec($r['conclusion_json'])['place']['place_id'] ?? 0) === $plid) { $ids[(int) $r['id']] = 1; } }
    $s = $pdo->prepare('SELECT DISTINCT inquiry_id FROM photo_inquiry_clues WHERE place_id=?'); $s->execute([$plid]); foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $i) { $ids[(int) $i] = 1; }
    return ['inquiries' => ep_summaries($pdo, array_keys($ids))];
}
function ep_summaries(PDO $pdo, array $ids): array
{
    if (!$ids) { return []; }
    $all = ep_list($pdo)['inquiries'];
    return array_values(array_filter($all, static fn($q) => in_array($q['id'], $ids, true) && !(ep_kiosk() && $q['is_private'])));
}

/* ═════════ la suite, 2ᵉ partie (heritage-enquete-photo-classement.js) : 🏘 le même lieu à travers le temps · 🎓 qui devrait être
 *  sur une photo de groupe · 🔄 les dos côte à côte · 🕳 les années sans photo d'une personne. Lecture seule, pas de table de plus. ═════════ */

/** media_id => true quand la photo montre (ou est reliée à) une personne vivante ou une fiche confidentielle */
function ep_media_private(PDO $pdo, array $mediaIds): array
{
    $mediaIds = array_values(array_unique(array_filter(array_map('intval', $mediaIds)))); if (!$mediaIds) { return []; }
    $by = [];
    foreach (array_chunk($mediaIds, 400) as $chunk) {
        $in = implode(',', $chunk);
        try { foreach ($pdo->query("SELECT media_id, person_id FROM media_tags WHERE media_id IN ($in) AND COALESCE(tag_type,'person')='person'") as $r) { $by[(int) $r['media_id']][] = (int) $r['person_id']; } } catch (Throwable $_) {}
        try { foreach ($pdo->query("SELECT media_id, entity_id FROM media_links WHERE media_id IN ($in) AND entity_type='person'") as $r) { $by[(int) $r['media_id']][] = (int) $r['entity_id']; } } catch (Throwable $_) {}
    }
    $pp = ep_persons($pdo, $by ? array_merge(...array_values($by)) : []); $out = [];
    foreach ($by as $mid => $pids) { foreach ($pids as $p) { if (!empty($pp[$p]['private'])) { $out[$mid] = true; break; } } }
    return $out;
}
/** l'année (et la fin de la fourchette) d'une conclusion de date : {from, to} ; sinon d'après le texte */
function ep_conc_years(array $date): array
{
    $f = ep_year($date['from'] ?? null); $t = ep_year($date['to'] ?? null);
    if (!$f && !$t && preg_match_all('/\b(1[5-9]\d\d|20\d\d)\b/', (string) ($date['text'] ?? ''), $m)) { $ys = array_map('intval', $m[1]); $f = min($ys); $t = max($ys); }
    return ['from' => $f ?? $t, 'to' => $t ?? $f];
}

/** 🏘 toutes les photos d'un lieu, de la plus ancienne à la plus récente : les enquêtes qui ont conclu à ce lieu (ou y sont reliées)
 *  et les médias posés à ce lieu. Consultation et appareil invité : ni enquête confidentielle, ni photo d'un vivant. */
function ep_place_timeline(PDO $pdo, array $g): array
{
    $plid = safe_int($g['place_id'] ?? 0); if ($plid <= 0) { throw new LcndaBadInput(i18n_t('Choisis d’abord un lieu.')); }
    $s = $pdo->prepare('SELECT id, name FROM places WHERE id=?'); $s->execute([$plid]); $pl = $s->fetch(PDO::FETCH_ASSOC);
    if (!$pl) { throw new RuntimeException(i18n_t('Lieu introuvable.')); }
    $hide = ep_kiosk() || ep_guest(); $rows = [];
    $linked = array_map('intval', (static function () use ($pdo, $plid) { $s = $pdo->prepare("SELECT inquiry_id FROM photo_inquiry_links WHERE kind='place' AND ref_id=?"); $s->execute([$plid]); return $s->fetchAll(PDO::FETCH_COLUMN); })());
    $img = $pdo->prepare("SELECT i.media_id, m.title, m.filename, m.thumbnail, m.media_type, m.date_text FROM photo_inquiry_images i JOIN media m ON m.id=i.media_id WHERE i.inquiry_id=? AND COALESCE(i.side,'')<>'verso' ORDER BY i.position, i.id");
    foreach ($pdo->query('SELECT id, title, conclusion_json, is_private FROM photo_inquiries')->fetchAll(PDO::FETCH_ASSOC) as $q) {
        $c = ep_dec($q['conclusion_json']); $here = (int) ($c['place']['place_id'] ?? 0) === $plid;
        if (!$here && !in_array((int) $q['id'], $linked, true)) { continue; }
        if ($hide && (int) $q['is_private'] === 1) { continue; }
        $y = ep_conc_years(is_array($c['date'] ?? null) ? $c['date'] : []);
        $img->execute([(int) $q['id']]);
        foreach ($img->fetchAll(PDO::FETCH_ASSOC) as $m) {
            $mid = (int) $m['media_id']; $my = ep_year(preg_match('/\b(1[5-9]\d\d|20\d\d)\b/', (string) $m['date_text'], $mm) ? $mm[1] : null);
            $rows[$mid] = ['media_id' => $mid, 'title' => (string) $m['title'], 'thumb' => (string) ($m['thumbnail'] ?: $m['filename']), 'filename' => (string) $m['filename'], 'media_type' => (string) $m['media_type'],
                'year' => $y['from'] ?? $my, 'year_to' => $y['to'] ?? $my, 'date_text' => (string) (($c['date']['text'] ?? '') ?: $m['date_text']), 'certainty' => $here ? (string) ($c['place']['certainty'] ?? 'supposed') : 'supposed',
                'inquiry' => ['id' => (int) $q['id'], 'title' => (string) $q['title']], 'from' => $here ? 'conclusion' : 'link'];
        }
    }
    if ((bool) $pdo->query("SELECT 1 FROM pragma_table_info('media') WHERE name='place_id'")->fetchColumn()) {
        $s = $pdo->prepare("SELECT id, title, filename, thumbnail, media_type, date_text FROM media WHERE place_id=? AND media_type='image' LIMIT 2000"); $s->execute([$plid]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $m) {
            $mid = (int) $m['id']; if (isset($rows[$mid])) { continue; }
            $my = ep_year(preg_match('/\b(1[5-9]\d\d|20\d\d)\b/', (string) $m['date_text'], $mm) ? $mm[1] : null);
            $rows[$mid] = ['media_id' => $mid, 'title' => (string) $m['title'], 'thumb' => (string) ($m['thumbnail'] ?: $m['filename']), 'filename' => (string) $m['filename'], 'media_type' => (string) $m['media_type'],
                'year' => $my, 'year_to' => $my, 'date_text' => (string) $m['date_text'], 'certainty' => '', 'inquiry' => null, 'from' => 'media'];
        }
    }
    if ($hide) { $priv = ep_media_private($pdo, array_keys($rows)); $rows = array_diff_key($rows, $priv); }
    $list = array_values($rows);
    usort($list, static fn($a, $b) => [$a['year'] === null, $a['year'] ?? 0, $a['title']] <=> [$b['year'] === null, $b['year'] ?? 0, $b['title']]);
    return ['place' => ['id' => (int) $pl['id'], 'name' => (string) $pl['name']], 'photos' => array_slice($list, 0, 500), 'undated' => count(array_filter($list, static fn($x) => $x['year'] === null))];
}

/** 🎓 une photo de groupe connue : qui devrait y être d'après l'arbre.
 *  school (classe d'école) : nés pour avoir de age_from à age_to ans cette année-là, avec un événement à ce lieu ;
 *  conscrits : les garçons de la classe (20 ans cette année-là), avec un événement à ce lieu ;
 *  wedding (noce) : les mariés et leur famille vivante ce jour-là (parents, frères et sœurs, grands-parents, oncles et tantes, enfants). */
function ep_group_expected(PDO $pdo, int $id, array $g): array
{
    $q = ep_inquiry_row($pdo, $id); $c = ep_dec($q['conclusion_json']);
    $kind = in_array($g['kind'] ?? '', ['school', 'conscrits', 'wedding'], true) ? (string) $g['kind'] : 'school';
    $year = ep_year($g['year'] ?? null) ?? ep_conc_years(is_array($c['date'] ?? null) ? $c['date'] : [])['from'];
    $plid = safe_int($g['place_id'] ?? 0) ?: (int) ($c['place']['place_id'] ?? 0);
    $alive = static fn(array $p) => (($p['birth'] ?? null) === null || $p['birth'] <= $year) && (($p['death'] ?? null) === null || $p['death'] >= $year);
    $roles = [];
    if ($kind === 'wedding') {
        $couple = array_values(array_filter(array_map('intval', is_array($g['person_ids'] ?? null) ? $g['person_ids'] : explode(',', (string) ($g['person_ids'] ?? ''))))); $evYear = null;
        $ev = safe_int($g['event_id'] ?? 0);
        if ($ev) { $s = $pdo->prepare('SELECT e.person_id, e.year, f.partner1_id, f.partner2_id FROM events e LEFT JOIN families f ON f.id=e.family_id WHERE e.id=?'); $s->execute([$ev]);
            if ($r = $s->fetch(PDO::FETCH_ASSOC)) { $couple = array_values(array_filter([(int) $r['partner1_id'], (int) $r['partner2_id'], (int) $r['person_id']])); $evYear = $r['year'] !== null ? (int) $r['year'] : null; } }
        $year = $year ?? $evYear;
        if (!$couple) { throw new LcndaBadInput(i18n_t('Choisis d’abord les mariés (un mariage de l’arbre, ou une personne).')); }
        if (count($couple) === 1) { $s = $pdo->prepare('SELECT partner1_id, partner2_id FROM families WHERE partner1_id=? OR partner2_id=? LIMIT 1'); $s->execute([$couple[0], $couple[0]]); if ($f = $s->fetch(PDO::FETCH_NUM)) { $couple = array_values(array_unique(array_filter(array_map('intval', [$couple[0], ...$f])))); } }
        foreach ($couple as $p) { $roles[$p] = 'married'; }
        $near = ep_family_of($pdo, $couple);
        $parents = array_keys(array_filter($near, static fn($r) => $r === 'parent'));
        foreach ($near as $p => $r) { $roles[$p] ??= ['parent' => 'parent', 'sibling' => 'sibling', 'child' => 'child', 'spouse' => 'married'][$r] ?? 'family'; }
        if ($parents) { foreach (ep_family_of($pdo, $parents) as $p => $r) { if (isset($roles[$p])) { continue; } if ($r === 'parent') { $roles[$p] = 'grandparent'; } elseif ($r === 'sibling') { $roles[$p] = 'uncle'; } } }
    } else {
        if (!$year) { throw new LcndaBadInput(i18n_t('Il faut d’abord l’année de la photo (la conclusion ou la frise).')); }
        if (!$plid) { throw new LcndaBadInput(i18n_t('Il faut d’abord le lieu de la photo (la conclusion).')); }
        [$a, $b] = $kind === 'conscrits' ? [$year - 21, $year - 20] : [$year - max(3, min(20, safe_int($g['age_to'] ?? 13) ?: 13)), $year - max(2, min(18, safe_int($g['age_from'] ?? 6) ?: 6))];
        $s = $pdo->prepare("SELECT DISTINCT p.id FROM persons p JOIN events b ON b.person_id=p.id JOIN event_types bt ON bt.id=b.event_type_id AND bt.gedcom_tag IN ('BIRT','BAPM','CHR')
            WHERE b.year BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM events x WHERE x.person_id=p.id AND x.place_id=?)" . ($kind === 'conscrits' ? " AND p.gender='male'" : '') . ' LIMIT 400');
        $s->execute([$a, $b, $plid]);
        foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $p) { $roles[(int) $p] = $kind === 'conscrits' ? 'conscrit' : 'pupil'; }
    }
    $pp = ep_persons($pdo, array_keys($roles)); $order = ['married' => 0, 'parent' => 1, 'sibling' => 2, 'grandparent' => 3, 'uncle' => 4, 'child' => 5, 'family' => 6, 'pupil' => 0, 'conscrit' => 0];
    $out = [];
    foreach ($roles as $pid => $role) {
        $p = $pp[$pid] ?? null; if (!$p || ($year && !$alive($p))) { continue; }
        $o = ep_person_out($p);
        $out[] = ['id' => $o['id'], 'name' => $o['name'], 'private' => $p['private'], 'birth' => $o['birth'], 'death' => $o['death'], 'age' => $year && $p['birth'] ? $year - $p['birth'] : null, 'role' => $role];
    }
    usort($out, static fn($x, $y) => [$order[$x['role']] ?? 9, -($x['age'] ?? 0), $x['name']] <=> [$order[$y['role']] ?? 9, -($y['age'] ?? 0), $y['name']]);
    return ['kind' => $kind, 'year' => $year, 'place_id' => $plid ?: null, 'people' => array_slice($out, 0, 80)];
}

/** 🔄 les dos (versos) : ceux de cette enquête, et (all=1) ceux de toutes les enquêtes, avec leurs indices « dos » */
function ep_versos(PDO $pdo, int $id, array $g): array
{
    ep_inquiry_row($pdo, $id); $all = !empty($g['all']); $hide = ep_kiosk() || ep_guest();
    $sql = "SELECT i.id AS image_id, i.inquiry_id, i.media_id, i.label, q.title AS inquiry, q.is_private, m.title, m.filename, m.thumbnail, m.media_type FROM photo_inquiry_images i JOIN photo_inquiries q ON q.id=i.inquiry_id JOIN media m ON m.id=i.media_id
        WHERE i.side='verso'" . ($all ? '' : ' AND i.inquiry_id=' . $id) . ' ORDER BY (i.inquiry_id<>' . $id . '), q.updated_at DESC, i.position, i.id LIMIT 120';
    $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
    if ($hide) { $rows = array_values(array_filter($rows, static fn($r) => (int) $r['is_private'] !== 1)); $priv = ep_media_private($pdo, array_column($rows, 'media_id')); $rows = array_values(array_filter($rows, static fn($r) => empty($priv[(int) $r['media_id']]))); }
    $cl = $pdo->prepare("SELECT num, text, certainty, images_json FROM photo_inquiry_clues WHERE inquiry_id=? AND kind IN ('dos','support','texte') AND certainty<>'refuted' ORDER BY num");
    $clues = [];
    $out = array_map(static function ($r) use ($cl, &$clues) {
        $iq = (int) $r['inquiry_id'];
        if (!isset($clues[$iq])) { $cl->execute([$iq]); $clues[$iq] = $cl->fetchAll(PDO::FETCH_ASSOC); }
        $mine = array_values(array_map(static fn($c) => ['num' => (int) $c['num'], 'text' => (string) $c['text'], 'certainty' => (string) $c['certainty']], array_filter($clues[$iq], static function ($c) use ($r) { $im = ep_dec($c['images_json']); return !$im || ($im[(string) $r['image_id']] ?? '') === 'yes'; })));
        return ['image_id' => (int) $r['image_id'], 'inquiry_id' => $iq, 'inquiry' => (string) $r['inquiry'], 'media_id' => (int) $r['media_id'], 'label' => (string) $r['label'], 'title' => (string) $r['title'],
            'filename' => (string) $r['filename'], 'thumb' => (string) ($r['thumbnail'] ?: $r['filename']), 'media_type' => (string) $r['media_type'], 'clues' => array_slice($mine, 0, 8)];
    }, $rows);
    return ['versos' => $out];
}

/** 🕳 les années avec et sans photo d'une personne (de sa naissance à sa mort, ou à aujourd'hui) : ses photos (visage identifié,
 *  média relié, personne numérotée ou reliée dans une enquête) et leur année (celle du média, sinon la conclusion de l'enquête) */
function ep_person_years(PDO $pdo, array $g): array
{
    $pid = safe_int($g['person_id'] ?? 0); $pp = ep_persons($pdo, [$pid]); $p = $pp[$pid] ?? null;
    if (!$p) { throw new RuntimeException(i18n_t('Personne introuvable.')); }
    if ((ep_kiosk() || ep_guest()) && $p['private']) { throw new LcndaBadInput(i18n_t('Personne confidentielle : ses photos ne sont pas montrées ici.')); }
    $media = [];
    try { $s = $pdo->prepare("SELECT media_id FROM media_tags WHERE person_id=? AND COALESCE(tag_type,'person')='person'"); $s->execute([$pid]); foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $m) { $media[(int) $m] = 1; } } catch (Throwable $_) {}
    try { $s = $pdo->prepare("SELECT media_id FROM media_links WHERE entity_type='person' AND entity_id=?"); $s->execute([$pid]); foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $m) { $media[(int) $m] = 1; } } catch (Throwable $_) {}
    $inqYears = [];
    foreach ($pdo->query('SELECT id, settings_json, conclusion_json, is_private FROM photo_inquiries')->fetchAll(PDO::FETCH_ASSOC) as $q) {
        if ((ep_kiosk() || ep_guest()) && (int) $q['is_private'] === 1) { continue; }
        $st = ep_dec($q['settings_json']); $y = ep_conc_years(is_array(ep_dec($q['conclusion_json'])['date'] ?? null) ? ep_dec($q['conclusion_json'])['date'] : []);
        $imgs = $pdo->query('SELECT id, media_id FROM photo_inquiry_images WHERE inquiry_id=' . (int) $q['id'] . " AND COALESCE(side,'')<>'verso'")->fetchAll(PDO::FETCH_ASSOC);
        $byImg = array_column($imgs, 'media_id', 'id');
        $s = $pdo->prepare("SELECT 1 FROM photo_inquiry_links WHERE inquiry_id=? AND kind='person' AND ref_id=?"); $s->execute([(int) $q['id'], $pid]); $linked = (bool) $s->fetchColumn();
        foreach ($byImg as $iid => $mid) {
            $num = array_filter((array) ($st['people'][$iid] ?? []), static fn($m) => is_array($m) && (int) ($m['person_id'] ?? 0) === $pid);
            if ($num || ($linked && count($byImg) === 1) || isset($media[(int) $mid])) { $media[(int) $mid] = 1; if ($y['from']) { $inqYears[(int) $mid] = $y; } }
        }
    }
    $photos = []; $ids = array_keys($media);
    if ($ids) {
        $in = implode(',', array_map('intval', $ids));
        foreach ($pdo->query("SELECT id, title, filename, thumbnail, media_type, date_text FROM media WHERE id IN ($in)")->fetchAll(PDO::FETCH_ASSOC) as $m) {
            $my = preg_match('/\b(1[5-9]\d\d|20\d\d)\b/', (string) $m['date_text'], $mm) ? (int) $mm[1] : null; $iy = $inqYears[(int) $m['id']] ?? null;
            $photos[] = ['media_id' => (int) $m['id'], 'title' => (string) $m['title'], 'thumb' => (string) ($m['thumbnail'] ?: $m['filename']), 'media_type' => (string) $m['media_type'],
                'year' => $my ?? ($iy ? (int) round(($iy['from'] + $iy['to']) / 2) : null), 'date_text' => (string) $m['date_text'], 'from_inquiry' => $my === null && $iy !== null];
        }
    }
    usort($photos, static fn($a, $b) => [$a['year'] === null, $a['year'] ?? 0] <=> [$b['year'] === null, $b['year'] ?? 0]);
    $o = ep_person_out($p);
    return ['person' => ['id' => $o['id'], 'name' => $o['name'], 'birth' => $p['birth'], 'death' => $p['death']], 'photos' => $photos, 'now' => (int) date('Y')];
}
