<?php
declare(strict_types=1);

/**
 * ⚖️ Généalogiste successoral : les dossiers de succession (onglet « ⚖️ Successions », Listes → Recherche et organisation →
 * « ⚖️ Dossiers de succession », fiche du défunt ⋯ → « ⚖️ Rechercher les héritiers… » ; écrans : assets/js/heritage-successoral.js ;
 * le calcul de la dévolution est fait dans le navigateur par assets/js/heritage-successoral-core.js, à partir du graphe envoyé ici).
 *
 * À ne pas confondre avec « 🏠 Héritages et successions » (lib/successions.php), qui note ce que disent les actes anciens.
 * Construit sur l'existant :
 *  - le défunt et le notaire sont des fiches (menu de choix des personnes), le lieu du décès un lieu ; le notaire peut aussi
 *    être un nom libre (comme notary_person_id / notary_text de lib/successions.php) ;
 *  - vivant / décédé / inconnu, dates et lieux viennent des fiches (rien n'est recopié) ; le dossier garde seulement ce que
 *    le généalogiste a établi à la main (« mort avant », « renonce », « absent », type d'adoption, marié ou non) ;
 *  - les pièces : « en main » quand l'acte (l'événement) a un média de preuve (confidence_media_id ou média relié),
 *    « demandé » quand un courrier du Registre de courriers lui est relié (📮 Demander l'acte : courriers.event_id,
 *    ou relié au dossier ici) ; l'état peut être forcé à la main ;
 *  - les courriers aux héritiers et les demandes d'actes sont des lignes du Registre de courriers (relances, 🗓 Ma semaine),
 *    avec trois colonnes de plus : courriers.succ_case_id, reponse, signe_le ;
 *  - les adresses viennent du Répertoire des vivants (living_contacts), seule source ;
 *  - les échéances vont aussi dans « 🗓 Ma semaine de recherche » (succ_semaine_items, lu par lib/semaine.php).
 * Confidentialité : les dossiers (vivants, adresses, parts) ne sortent jamais : aucun export (GEDCOM, site, partage famille,
 * livre, mode simple) ne lit ces tables ; en mode consultation rien ne se lit ni ne s'écrit. Aucun montant de succession.
 * Tables (migration 90) : succ_cases, succ_deadlines, succ_pieces, succ_journal (jamais modifié ni effacé), succ_fees ;
 * migration 91 (lib/successoral_dossiers.php) : succ_case_persons, succ_homonym_no, avancement gardé.
 */

require_once __DIR__ . '/successoral_dossiers.php'; // rangement, filtre ⚖️, rattachement, tableau de bord, archive en fichier (migration 91)
require_once __DIR__ . '/successoral_outils.php'; // ⏱ chronomètre, 🔔 échéances, ✉️ courriers en série, modèles à soi (migration 93)

const SUCC_STATES = ['ouvert', 'recherche', 'trouves', 'remis', 'clos', 'archive'];
const SUCC_STATE_LABELS = ['ouvert' => 'Ouvert', 'recherche' => 'En recherche', 'trouves' => 'Héritiers trouvés', 'remis' => 'Remis au notaire', 'clos' => 'Clos', 'archive' => 'Archivé'];
const SUCC_PIECE_STATES = ['have', 'asked', 'missing', 'na'];
const SUCC_OV_STATUS = ['', 'alive', 'dead_before', 'dead_after', 'unknown', 'renonce', 'indigne', 'absent', 'absent_declare'];
const SUCC_OV_ADOPT = ['', 'pleniere', 'simple'];
const SUCC_OV_SPOUSE = ['', 'married', 'not', 'divorced'];
const SUCC_DEADLINE_KINDS = ['declaration', 'relance', 'remise', 'rdv', 'autre'];
const SUCC_FEE_KINDS = ['time', 'cost', 'percent'];
const SUCC_JOURNAL_KINDS = ['open', 'edit', 'state', 'calc', 'piece', 'courrier', 'pdf', 'deadline', 'fee', 'note', 'archive', 'search', 'export', 'law', 'other'];
const SUCC_ANSWERS = ['', 'none', 'yes', 'no', 'later'];

function successoral_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS succ_cases (id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
        deceased_id INTEGER, death_date_text TEXT NOT NULL DEFAULT '', death_iso TEXT NOT NULL DEFAULT '', death_place_id INTEGER, death_place_text TEXT NOT NULL DEFAULT '',
        last_address TEXT NOT NULL DEFAULT '', testament TEXT NOT NULL DEFAULT '', situation TEXT NOT NULL DEFAULT '',
        notary_person_id INTEGER, notary_text TEXT NOT NULL DEFAULT '', notary_ref TEXT NOT NULL DEFAULT '', opened_at TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT 'ouvert', hypothesis_note TEXT NOT NULL DEFAULT '', overrides_json TEXT NOT NULL DEFAULT '{}', snapshot_json TEXT NOT NULL DEFAULT '',
        options_json TEXT NOT NULL DEFAULT '{}', archived_at TEXT, deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS succ_deadlines (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER NOT NULL, due TEXT NOT NULL DEFAULT '', label TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'autre', done INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS succ_pieces (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER NOT NULL, piece_key TEXT NOT NULL, state TEXT NOT NULL DEFAULT '',
        courrier_id INTEGER, media_id INTEGER, note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(case_id, piece_key))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS succ_journal (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER NOT NULL, at TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'other', text TEXT NOT NULL DEFAULT '')");
    $pdo->exec("CREATE TABLE IF NOT EXISTS succ_fees (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'time', day TEXT NOT NULL DEFAULT '',
        label TEXT NOT NULL DEFAULT '', minutes INTEGER NOT NULL DEFAULT 0, amount_cents INTEGER NOT NULL DEFAULT 0, percent REAL, person_id INTEGER, deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_succ_cases_dead ON succ_cases(deceased_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_succ_journal_case ON succ_journal(case_id, id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_succ_deadlines_case ON succ_deadlines(case_id)');
    // le journal ne se modifie ni ne s'efface : aucune opération de l'API ne le touche (pas de trigger : l'app n'en crée aucun, lib/bootstrap.php)
    // le Registre de courriers : le dossier, la réponse de l'héritier, la date de signature du contrat
    if ($pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='courriers'")->fetchColumn()) {
        $has = static fn(string $c): bool => (bool) $pdo->query("SELECT 1 FROM pragma_table_info('courriers') WHERE name=" . $pdo->quote($c))->fetchColumn();
        if (!$has('succ_case_id')) { $pdo->exec('ALTER TABLE courriers ADD COLUMN succ_case_id INTEGER'); }
        if (!$has('succ_kind')) { $pdo->exec("ALTER TABLE courriers ADD COLUMN succ_kind TEXT NOT NULL DEFAULT ''"); }
        if (!$has('reponse')) { $pdo->exec("ALTER TABLE courriers ADD COLUMN reponse TEXT NOT NULL DEFAULT ''"); }
        if (!$has('signe_le')) { $pdo->exec("ALTER TABLE courriers ADD COLUMN signe_le TEXT NOT NULL DEFAULT ''"); }
        foreach (['event_id', 'person_id', 'media_id'] as $c) { if (!$has($c)) { $pdo->exec("ALTER TABLE courriers ADD COLUMN $c INTEGER"); } }
        if (!$has('letter_json')) { $pdo->exec("ALTER TABLE courriers ADD COLUMN letter_json TEXT NOT NULL DEFAULT ''"); }
    }
}

function succ_ready(PDO $pdo): bool
{
    static $ok = [];
    $k = spl_object_id($pdo);
    if (!empty($ok[$k])) { return true; }
    return $ok[$k] = (int) $pdo->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('succ_cases','succ_journal','succ_pieces','succ_deadlines','succ_fees')")->fetchColumn() === 5;
}
function succ_kiosk(): bool { return function_exists('kiosk_state') && !empty(kiosk_state()['on']); }
function succ_txt(mixed $v, int $max, bool $multi = false): string
{
    $s = is_scalar($v) ? (string) $v : '';
    $s = (string) preg_replace($multi ? '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u' : '/[\x00-\x1F\x7F]/u', $multi ? '' : ' ', $s);
    return mb_substr(trim($s), 0, $max);
}
function succ_date_ok(string $d): bool { return (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) && checkdate((int) substr($d, 5, 2), (int) substr($d, 8, 2), (int) substr($d, 0, 4)); }

/** « 3 mars 2026 », « 03/03/2026 », « 2026-03-03 », « mars 1938 », « 1944 », « vers 1871 » → « 2026-03-03 », « 1938-03 », « 1944 » */
function succ_iso(string $text, ?int $year = null, string $sort = ''): string
{
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $sort, $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1])) { return "$m[1]-$m[2]-$m[3]"; }
    $t = mb_strtolower(trim($text));
    if (preg_match('/\b(avant|après|apres|vers|env|entre|bef|aft|abt|est|cal)\b/u', $t)) { return $year ? (string) $year : (preg_match('/\b(1\d{3}|20\d{2})\b/', $t, $m) ? $m[1] : ''); }
    if (preg_match('/(\d{4})-(\d{2})-(\d{2})/', $t, $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1])) { return "$m[1]-$m[2]-$m[3]"; }
    if (preg_match('#\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b#', $t, $m) && checkdate((int) $m[2], (int) $m[1], (int) $m[3])) { return sprintf('%04d-%02d-%02d', $m[3], $m[2], $m[1]); }
    $months = ['janvier' => 1, 'janv' => 1, 'jan' => 1, 'février' => 2, 'fevrier' => 2, 'févr' => 2, 'fev' => 2, 'feb' => 2, 'mars' => 3, 'mar' => 3, 'avril' => 4, 'avr' => 4, 'apr' => 4, 'mai' => 5, 'may' => 5, 'juin' => 6, 'jun' => 6,
        'juillet' => 7, 'juil' => 7, 'jul' => 7, 'août' => 8, 'aout' => 8, 'aug' => 8, 'septembre' => 9, 'sept' => 9, 'sep' => 9, 'octobre' => 10, 'oct' => 10, 'novembre' => 11, 'nov' => 11, 'décembre' => 12, 'decembre' => 12, 'déc' => 12, 'dec' => 12];
    if (preg_match('/\b(\d{1,2})(?:er)?\s+([a-zéû]+)\.?\s+(\d{4})\b/u', $t, $m) && isset($months[$m[2]]) && checkdate($months[$m[2]], (int) $m[1], (int) $m[3])) { return sprintf('%04d-%02d-%02d', $m[3], $months[$m[2]], $m[1]); }
    if (preg_match('/\b([a-zéû]+)\.?\s+(\d{4})\b/u', $t, $m) && isset($months[$m[1]])) { return sprintf('%04d-%02d', $m[2], $months[$m[1]]); }
    if (preg_match('/\b(1\d{3}|20\d{2})\b/', $t, $m)) { return $m[1]; }
    return $year ? (string) $year : '';
}

/* ═════════ Le graphe autour du défunt : ascendants (6 générations), leurs descendants jusqu'au 6e degré, les descendants du défunt ═════════ */
function succ_links(PDO $pdo): array
{
    $up = []; $down = [];
    $sql = "SELECT fc.child_id, fc.relation_to_partner1 AS r1, fc.relation_to_partner2 AS r2, f.partner1_id AS a, f.partner2_id AS b FROM family_children fc JOIN families f ON f.id=fc.family_id";
    foreach ($pdo->query($sql) as $r) {
        $c = (int) $r['child_id'];
        foreach ([[(int) $r['a'], (string) $r['r1']], [(int) $r['b'], (string) $r['r2']]] as [$p, $rel]) {
            if (!$p || $p === $c) { continue; }
            $rel = in_array($rel, ['adopted', 'foster', 'step'], true) ? $rel : 'biological';
            $up[$c][$p] = $rel; $down[$p][$c] = true;
        }
    }
    return [$up, $down];
}

function succ_graph(PDO $pdo, int $dead): array
{
    [$up, $down] = succ_links($pdo);
    $ids = [$dead => true];
    // ascendants jusqu'à 6 générations
    $asc = [$dead => 0]; $level = [$dead];
    for ($g = 1; $g <= 6 && $level; $g++) {
        $next = [];
        foreach ($level as $x) { foreach (array_keys($up[$x] ?? []) as $p) { if (!isset($asc[$p])) { $asc[$p] = $g; $next[] = $p; } } }
        $level = $next;
    }
    foreach ($asc as $a => $g) { $ids[$a] = true; }
    // descendants : du défunt (15 générations), de chaque ascendant jusqu'au 6e degré (et 1 de plus pour voir « au-delà »)
    $walk = static function (int $from, int $depth) use (&$ids, $down): void {
        $level = [$from];
        for ($d = 1; $d <= $depth && $level; $d++) {
            $next = [];
            foreach ($level as $x) { foreach (array_keys($down[$x] ?? []) as $k) { if (!isset($ids[$k]) || $d === 1) { $ids[$k] = true; $next[] = $k; } } }
            $level = array_values(array_unique($next));
            if (count($ids) > 20000) { return; }
        }
    };
    $walk($dead, 15);
    foreach ($asc as $a => $g) { if ($g >= 1) { $walk($a, max(1, 7 - $g)); } }
    // les parents des personnes trouvées (un demi-frère a un autre parent : pour savoir « de quel lit »)
    foreach (array_keys($ids) as $x) { foreach (array_keys($up[$x] ?? []) as $p) { $ids[$p] = true; } }
    // les conjoints du défunt et des héritières (nom d'épouse)
    $idList = array_keys($ids);
    $unions = []; $partnerIds = [];
    foreach (array_chunk($idList, 400) as $chunk) {
        $in = implode(',', array_map('intval', $chunk));
        foreach ($pdo->query("SELECT id, partner1_id, partner2_id FROM families WHERE partner1_id IN ($in) OR partner2_id IN ($in)")->fetchAll(PDO::FETCH_ASSOC) as $f) {
            $unions[(int) $f['id']] = ['id' => (int) $f['id'], 'a' => (int) $f['partner1_id'] ?: null, 'b' => (int) $f['partner2_id'] ?: null, 'married' => null, 'marriage' => ['date' => '', 'text' => '', 'event_id' => 0, 'place' => ''], 'divorced' => false, 'divorce' => ['date' => ''], 'free' => false];
            foreach (['partner1_id', 'partner2_id'] as $k) { if ((int) $f[$k]) { $partnerIds[(int) $f[$k]] = true; } }
        }
    }
    // unions : seulement celles du défunt et des personnes du graphe (déjà filtrées), avec leurs événements
    if ($unions) {
        $in = implode(',', array_keys($unions));
        foreach ($pdo->query("SELECT e.id, e.family_id, e.date_text, e.year, e.sort_date, t.gedcom_tag, pl.name AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
            WHERE e.family_id IN ($in) AND t.gedcom_tag IN ('MARR','MRCI','MRRE','DIV','ANUL','_PRS') ORDER BY COALESCE(e.year,9999), e.id")->fetchAll(PDO::FETCH_ASSOC) as $e) {
            $u = &$unions[(int) $e['family_id']];
            $iso = succ_iso((string) $e['date_text'], $e['year'] === null ? null : (int) $e['year'], (string) ($e['sort_date'] ?? ''));
            if (in_array($e['gedcom_tag'], ['MARR', 'MRCI', 'MRRE'], true)) { if (!$u['married']) { $u['married'] = true; $u['marriage'] = ['date' => $iso, 'text' => (string) $e['date_text'], 'event_id' => (int) $e['id'], 'place' => (string) ($e['place'] ?? '')]; } }
            elseif ($e['gedcom_tag'] === '_PRS') { if (!$u['married']) { $u['free'] = true; } }
            else { $u['divorced'] = true; $u['divorce'] = ['date' => $iso, 'event_id' => (int) $e['id']]; }
            unset($u);
        }
    }
    $all = array_keys($ids + $partnerIds);
    $persons = succ_persons($pdo, $all);
    $parents = [];
    foreach (array_keys($ids) as $c) { foreach ($up[$c] ?? [] as $p => $rel) { $parents[] = ['child' => $c, 'parent' => $p, 'rel' => $rel]; } }
    return ['persons' => $persons, 'parents' => $parents, 'unions' => array_values($unions)];
}

/** les fiches : nom, sexe, statut, naissance et décès (date, lieu, acte, preuve, sources), confidentielle */
function succ_persons(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    $out = [];
    $hasPriv = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('persons') WHERE name='is_private'")->fetchColumn();
    $hasKind = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('persons') WHERE name='kind'")->fetchColumn();
    foreach (array_chunk($ids, 400) as $chunk) {
        $in = implode(',', $chunk);
        foreach ($pdo->query("SELECT id, first_name, last_name, gender, living_status, children_status, " . ($hasPriv ? 'COALESCE(is_private,0)' : '0') . " AS priv, " . ($hasKind ? "COALESCE(kind,'person')" : "'person'") . " AS kind FROM persons WHERE id IN ($in)")->fetchAll(PDO::FETCH_ASSOC) as $p) {
            if ($p['kind'] === 'animal') { continue; }
            $out[(int) $p['id']] = ['id' => (int) $p['id'], 'first' => trim((string) $p['first_name']), 'last' => trim((string) $p['last_name']), 'gender' => (string) $p['gender'], 'status' => (string) $p['living_status'],
                'children_status' => (string) $p['children_status'], 'private' => (int) $p['priv'] === 1, 'birth' => null, 'death' => null, 'dead_event' => false];
        }
        $rows = $pdo->query("SELECT e.id, e.person_id, e.date_text, e.year, e.sort_date, e.confidence_media_id, t.gedcom_tag, pl.name AS place,
                (SELECT COUNT(*) FROM media_links ml WHERE ml.entity_type='event' AND ml.entity_id=e.id) AS nmedia
            FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
            WHERE e.person_id IN ($in) AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI','CREM') ORDER BY CASE t.gedcom_tag WHEN 'BIRT' THEN 0 WHEN 'DEAT' THEN 0 ELSE 1 END, COALESCE(e.year,9999), e.id")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $e) {
            $id = (int) $e['person_id']; if (!isset($out[$id])) { continue; }
            $iso = succ_iso((string) $e['date_text'], $e['year'] === null ? null : (int) $e['year'], (string) ($e['sort_date'] ?? ''));
            $info = ['date' => $iso, 'text' => (string) $e['date_text'], 'year' => $e['year'] === null ? ($iso !== '' ? (int) substr($iso, 0, 4) : null) : (int) $e['year'], 'place' => (string) ($e['place'] ?? ''),
                'event_id' => (int) $e['id'], 'media' => (int) $e['confidence_media_id'] > 0 || (int) $e['nmedia'] > 0, 'tag' => (string) $e['gedcom_tag']];
            if (in_array($e['gedcom_tag'], ['BIRT', 'CHR', 'BAPM'], true)) { if (!$out[$id]['birth']) { $out[$id]['birth'] = $info; } }
            else { $out[$id]['dead_event'] = true; if (!$out[$id]['death'] || ($out[$id]['death']['tag'] !== 'DEAT' && $e['gedcom_tag'] === 'DEAT')) { $out[$id]['death'] = $info; } }
        }
    }
    return $out;
}

/** les actes connus (clé du moteur → acte), les sources de chaque acte (pour le tableau du notaire), et ce qui est demandé */
function succ_acts(PDO $pdo, array $graph, int $caseId): array
{
    $acts = []; $events = [];
    foreach ($graph['persons'] as $id => $p) {
        foreach (['birth' => 'N', 'death' => 'D'] as $k => $pre) {
            if (!$p[$k]) { continue; }
            $e = $p[$k];
            $acts["$pre:$id"] = ['event_id' => $e['event_id'], 'label' => ['BIRT' => 'Naissance', 'CHR' => 'Baptême', 'BAPM' => 'Baptême', 'DEAT' => 'Décès', 'BURI' => 'Inhumation', 'CREM' => 'Crémation'][$e['tag']] ?? '', 'place' => $e['place'], 'year' => $e['year'], 'date' => $e['text'], 'media' => $e['media']];
            $events[$e['event_id']] = "$pre:$id";
        }
    }
    foreach ($graph['unions'] as $u) {
        if (!empty($u['marriage']['event_id'])) { $acts['M:' . $u['id']] = ['event_id' => $u['marriage']['event_id'], 'label' => 'Mariage', 'place' => $u['marriage']['place'], 'year' => $u['marriage']['date'] !== '' ? (int) substr($u['marriage']['date'], 0, 4) : null, 'date' => $u['marriage']['text'], 'media' => false]; $events[$u['marriage']['event_id']] = 'M:' . $u['id']; }
        if (!empty($u['divorce']['event_id'])) { $acts['V:' . $u['id']] = ['event_id' => $u['divorce']['event_id'], 'label' => 'Divorce', 'place' => '', 'year' => $u['divorce']['date'] !== '' ? (int) substr($u['divorce']['date'], 0, 4) : null, 'date' => '', 'media' => false]; $events[$u['divorce']['event_id']] = 'V:' . $u['id']; }
    }
    $sources = []; $asked = [];
    if ($events) {
        foreach (array_chunk(array_keys($events), 400) as $chunk) {
            $in = implode(',', $chunk);
            foreach ($pdo->query("SELECT e.id, e.confidence_media_id, (SELECT COUNT(*) FROM media_links ml WHERE ml.entity_type='event' AND ml.entity_id=e.id) AS n FROM events e WHERE e.id IN ($in)")->fetchAll(PDO::FETCH_ASSOC) as $r) {
                if ((int) $r['confidence_media_id'] > 0 || (int) $r['n'] > 0) { $acts[$events[(int) $r['id']]]['media'] = true; }
            }
            foreach ($pdo->query("SELECT sl.entity_id, s.title, sl.page FROM source_links sl JOIN sources s ON s.id=sl.source_record_id WHERE sl.entity_type='event' AND sl.entity_id IN ($in) ORDER BY sl.id")->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $sources[$events[(int) $r['entity_id']]][] = trim((string) $r['title'] . ((string) $r['page'] !== '' ? ', ' . $r['page'] : ''));
            }
            try {
                foreach ($pdo->query("SELECT id, event_id, date_envoi, statut FROM courriers WHERE event_id IN ($in) ORDER BY id")->fetchAll(PDO::FETCH_ASSOC) as $r) {
                    $asked[$events[(int) $r['event_id']]] = ['courrier_id' => (int) $r['id'], 'date' => (string) $r['date_envoi'], 'statut' => (string) $r['statut']];
                }
            } catch (Throwable $_) {}
        }
    }
    foreach ($sources as $k => $l) { $acts[$k]['sources'] = array_values(array_unique($l)); }
    return [$acts, $asked];
}

/* ═════════ Lire ═════════ */
function succ_row(PDO $pdo, int $id, bool $withDeleted = false): array
{
    $s = $pdo->prepare('SELECT * FROM succ_cases WHERE id=?' . ($withDeleted ? '' : ' AND deleted_at IS NULL'));
    $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new LcndaBadInput('Dossier introuvable.'); }
    return $r;
}
function succ_name(array $p = null): string
{
    if (!$p) { return ''; }
    return trim(trim((string) ($p['first'] ?? $p['first_name'] ?? '')) . ' ' . mb_strtoupper(trim((string) ($p['last'] ?? $p['last_name'] ?? '')))) ?: 'Sans nom';
}
function succ_person_name(PDO $pdo, int $id): string
{
    if ($id <= 0) { return ''; }
    $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    return $r ? succ_name($r) : '';
}
function succ_years(PDO $pdo, int $id): string
{
    $p = succ_persons($pdo, [$id])[$id] ?? null; if (!$p) { return ''; }
    $b = $p['birth']['year'] ?? null; $d = $p['death']['year'] ?? null;
    return $b || $d ? ($b ?: '?') . ($d ? '-' . $d : '') : '';
}

function succ_list(PDO $pdo): array
{
    $rows = $pdo->query("SELECT c.*, (SELECT MIN(due) FROM succ_deadlines d WHERE d.case_id=c.id AND d.deleted_at IS NULL AND d.done=0 AND d.due>=date('now','localtime')) AS next_due,
        (SELECT label FROM succ_deadlines d WHERE d.case_id=c.id AND d.deleted_at IS NULL AND d.done=0 AND d.due>=date('now','localtime') ORDER BY due LIMIT 1) AS next_label,
        (SELECT COUNT(*) FROM succ_deadlines d WHERE d.case_id=c.id AND d.deleted_at IS NULL AND d.done=0 AND d.due<date('now','localtime')) AS late
        FROM succ_cases c WHERE c.deleted_at IS NULL ORDER BY c.updated_at DESC, c.id DESC")->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    foreach ($rows as $r) {
        $did = (int) $r['deceased_id'];
        $snap = json_decode((string) $r['snapshot_json'], true);
        $out[] = ['id' => (int) $r['id'], 'number' => (string) $r['number'], 'title' => (string) $r['title'], 'deceased_id' => $did ?: null, 'deceased' => succ_person_name($pdo, $did), 'years' => $did ? succ_years($pdo, $did) : '',
            'death' => (string) $r['death_date_text'], 'place' => (string) $r['death_place_text'], 'notary' => $r['notary_person_id'] ? succ_person_name($pdo, (int) $r['notary_person_id']) : (string) $r['notary_text'],
            'notary_ref' => (string) $r['notary_ref'], 'state' => (string) $r['state'], 'opened_at' => (string) $r['opened_at'], 'next_due' => (string) ($r['next_due'] ?? ''), 'next_label' => (string) ($r['next_label'] ?? ''),
            'late' => (int) $r['late'], 'heirs' => is_array($snap['shares'] ?? null) ? count($snap['shares']) : 0, 'unknown' => is_array($snap['unknown'] ?? null) ? count($snap['unknown']) : 0,
            'updated_at' => (string) $r['updated_at'], 'created_at' => (string) $r['created_at']];
    }
    return $out;
}

function succ_case_out(PDO $pdo, array $r): array
{
    $id = (int) $r['id'];
    $did = (int) $r['deceased_id'];
    $dl = $pdo->prepare('SELECT id, due, label, kind, done FROM succ_deadlines WHERE case_id=? AND deleted_at IS NULL ORDER BY due, id'); $dl->execute([$id]);
    $pc = $pdo->prepare('SELECT piece_key, state, courrier_id, media_id, note, updated_at FROM succ_pieces WHERE case_id=?'); $pc->execute([$id]);
    $jr = $pdo->prepare('SELECT id, at, kind, text FROM succ_journal WHERE case_id=? ORDER BY at DESC, id DESC'); $jr->execute([$id]);
    $src = function_exists('succ_outils_ready') && succ_outils_ready($pdo) ? 'source' : "'' AS source"; // ⏱ « chrono » : compté par le chronomètre (migration 93)
    $fe = $pdo->prepare("SELECT id, kind, day, label, minutes, amount_cents, percent, person_id, $src FROM succ_fees WHERE case_id=? AND deleted_at IS NULL ORDER BY day DESC, id DESC"); $fe->execute([$id]);
    $pieces = [];
    foreach ($pc->fetchAll(PDO::FETCH_ASSOC) as $p) { $pieces[(string) $p['piece_key']] = ['state' => (string) $p['state'], 'courrier_id' => (int) $p['courrier_id'] ?: null, 'note' => (string) $p['note'], 'updated_at' => (string) $p['updated_at']]; }
    $courriers = [];
    try {
        $cs = $pdo->prepare('SELECT id, objet, destinataire, date_envoi, statut, relance_date, person_id, event_id, succ_kind, reponse, signe_le, media_id FROM courriers WHERE succ_case_id=? ORDER BY date_envoi DESC, id DESC'); $cs->execute([$id]);
        foreach ($cs->fetchAll(PDO::FETCH_ASSOC) as $c) { $courriers[] = ['id' => (int) $c['id'], 'objet' => (string) $c['objet'], 'destinataire' => (string) $c['destinataire'], 'date_envoi' => (string) $c['date_envoi'], 'statut' => (string) $c['statut'],
            'relance_date' => (string) $c['relance_date'], 'person_id' => (int) $c['person_id'] ?: null, 'event_id' => (int) $c['event_id'] ?: null, 'kind' => (string) $c['succ_kind'], 'reponse' => (string) $c['reponse'], 'signe_le' => (string) $c['signe_le'], 'media_id' => (int) $c['media_id'] ?: null]; }
    } catch (Throwable $_) {}
    $graph = $did ? succ_graph($pdo, $did) : ['persons' => [], 'parents' => [], 'unions' => []];
    [$acts, $asked] = $did ? succ_acts($pdo, $graph, $id) : [[], []];
    foreach ($courriers as $c) { foreach ($pieces as $k => $p) { if ($p['courrier_id'] === $c['id'] && !isset($asked[$k])) { $asked[$k] = ['courrier_id' => $c['id'], 'date' => $c['date_envoi'], 'statut' => $c['statut']]; } } }
    $archived = (string) $r['state'] === 'archive';
    // les adresses : le Répertoire des vivants, seule source (jamais pour un dossier archivé)
    $addresses = [];
    if (!$archived && $graph['persons']) {
        foreach (array_chunk(array_keys($graph['persons']), 400) as $chunk) {
            $in = implode(',', array_map('intval', $chunk));
            try {
                foreach ($pdo->query("SELECT id, person_id, address, postal_code, city, country, email, phone_mobile, phone FROM living_contacts WHERE person_id IN ($in) ORDER BY updated_at DESC, id DESC")->fetchAll(PDO::FETCH_ASSOC) as $c) {
                    $pid = (int) $c['person_id']; if (isset($addresses[$pid])) { continue; }
                    $lines = array_values(array_filter([trim((string) $c['address']), trim(trim((string) $c['postal_code']) . ' ' . trim((string) $c['city'])), trim((string) $c['country']) !== 'France' ? trim((string) $c['country']) : '']));
                    if (!$lines && trim((string) $c['email']) === '') { continue; }
                    $addresses[$pid] = ['contact_id' => (int) $c['id'], 'lines' => $lines, 'email' => (string) $c['email'], 'phone' => (string) ($c['phone_mobile'] ?: $c['phone']), 'country' => (string) $c['country']];
                }
            } catch (Throwable $_) {}
        }
    }
    $np = (int) $r['notary_person_id'];
    return ['id' => $id, 'number' => (string) $r['number'], 'title' => (string) $r['title'], 'deceased_id' => $did ?: null, 'deceased' => succ_person_name($pdo, $did),
        'death_date_text' => (string) $r['death_date_text'], 'death_iso' => (string) $r['death_iso'], 'death_place_id' => (int) $r['death_place_id'] ?: null, 'death_place_text' => (string) $r['death_place_text'],
        'last_address' => $archived ? '' : (string) $r['last_address'], 'testament' => (string) $r['testament'], 'situation' => (string) $r['situation'],
        'notary_person_id' => $np ?: null, 'notary' => $np ? succ_person_name($pdo, $np) : (string) $r['notary_text'], 'notary_text' => (string) $r['notary_text'], 'notary_ref' => (string) $r['notary_ref'],
        'opened_at' => (string) $r['opened_at'], 'state' => (string) $r['state'], 'hypothesis_note' => (string) $r['hypothesis_note'], 'archived' => $archived, 'archived_at' => (string) ($r['archived_at'] ?? ''),
        'overrides' => json_decode((string) $r['overrides_json'], true) ?: new stdClass(), 'snapshot' => json_decode((string) $r['snapshot_json'], true) ?: null, 'options' => json_decode((string) $r['options_json'], true) ?: new stdClass(),
        'deadlines' => array_map(static fn($d) => ['id' => (int) $d['id'], 'due' => (string) $d['due'], 'label' => (string) $d['label'], 'kind' => (string) $d['kind'], 'done' => (int) $d['done'] === 1], $dl->fetchAll(PDO::FETCH_ASSOC)),
        'pieces' => $pieces ?: new stdClass(), 'journal' => array_map(static fn($j) => ['id' => (int) $j['id'], 'at' => (string) $j['at'], 'kind' => (string) $j['kind'], 'text' => (string) $j['text']], $jr->fetchAll(PDO::FETCH_ASSOC)),
        'fees' => array_map(static fn($f) => ['id' => (int) $f['id'], 'kind' => (string) $f['kind'], 'day' => (string) $f['day'], 'label' => (string) $f['label'], 'minutes' => (int) $f['minutes'], 'amount_cents' => (int) $f['amount_cents'], 'percent' => $f['percent'] === null ? null : (float) $f['percent'], 'person_id' => (int) $f['person_id'] ?: null, 'source' => (string) $f['source']], $fe->fetchAll(PDO::FETCH_ASSOC)),
        'courriers' => $courriers, 'graph' => $graph, 'acts' => $acts ?: new stdClass(), 'asked' => $asked ?: new stdClass(), 'addresses' => $addresses ?: new stdClass(),
        // 🔎 introuvable / 🔇 ne répond pas (succ_case_persons, migration 92) ; le réglage « fiches confidentielles comptées » (successoral.json)
        'contact' => (function_exists('succ_contacts_of') ? succ_contacts_of($pdo, $id) : []) ?: new stdClass(), 'count_private' => function_exists('succ_settings') ? (bool) succ_settings()['private_heirs'] : true,
        'updated_at' => (string) $r['updated_at'], 'created_at' => (string) $r['created_at']];
}

/* ═════════ Écrire ═════════ */
function succ_journal(PDO $pdo, int $caseId, string $kind, string $text): void
{
    if (!in_array($kind, SUCC_JOURNAL_KINDS, true)) { $kind = 'other'; }
    $pdo->prepare('INSERT INTO succ_journal(case_id, at, kind, text) VALUES(?,?,?,?)')->execute([$caseId, date('Y-m-d H:i:s'), $kind, mb_substr($text, 0, 1000)]);
}
/* ⚖️ « Un doute sur la loi ? » → « ✍️ Noter dans le dossier » : la question telle que tapée et, facultatif, un lien collé.
 * Le lien n'est gardé que s'il commence par https:// et que l'hôte est exactement un site officiel (même règle que
 * officialLink() dans heritage-successoral-core.js) ; l'app ne choisit jamais l'article. */
const SUCC_LAW_HOSTS = ['www.legifrance.gouv.fr', 'www.service-public.gouv.fr', 'www.service-public.fr', 'eur-lex.europa.eu'];
function succ_law_link(mixed $v): string
{
    $u = trim(is_scalar($v) ? (string) $v : '');
    if ($u === '') { return ''; }
    if (strlen($u) > 500 || !preg_match('{^https://([a-z0-9.-]+)(?:[/?#][\w\-.~%!$&*+,;=:@/?#()\[\]]*)?$}D', $u, $m) || !in_array($m[1], SUCC_LAW_HOSTS, true)) {
        throw new LcndaBadInput('Lien refusé : seulement une adresse https:// de Légifrance, Service-public ou EUR-Lex.');
    }
    return $u;
}
function succ_law_note(PDO $pdo, array $d): array
{
    $id = safe_int($d['case_id'] ?? 0); succ_row($pdo, $id);
    $q = succ_txt($d['question'] ?? '', 300); if ($q === '') { throw new LcndaBadInput('Écris d’abord ta question.'); }
    $link = succ_law_link($d['link'] ?? '');
    $text = 'Doute sur la loi : « ' . $q . ' »' . ($link !== '' ? ' — ' . $link : '');
    succ_journal($pdo, $id, 'law', $text);
    return ['ok' => true, 'entry' => ['at' => date('Y-m-d H:i:s'), 'kind' => 'law', 'text' => $text]];
}
function succ_touch(PDO $pdo, int $id): void { $pdo->prepare('UPDATE succ_cases SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$id]); }
function succ_person_ok(PDO $pdo, int $id): bool
{
    if ($id <= 0) { return false; }
    $s = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $s->execute([$id]); return (bool) $s->fetchColumn();
}
function succ_next_number(PDO $pdo, string $year): string
{
    $s = $pdo->prepare("SELECT number FROM succ_cases WHERE number LIKE ?"); $s->execute([$year . '-%']);
    $max = 0; foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $n) { if (preg_match('/^\d{4}-(\d+)$/', (string) $n, $m)) { $max = max($max, (int) $m[1]); } }
    return sprintf('%s-%03d', $year, $max + 1);
}

function succ_save(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    $old = $id ? succ_row($pdo, $id) : null;
    $vals = [];
    if (array_key_exists('deceased_id', $d) || !$id) {
        $did = safe_int($d['deceased_id'] ?? 0);
        if (!succ_person_ok($pdo, $did)) { throw new LcndaBadInput('Choisis la personne décédée.'); }
        $dup = $pdo->prepare('SELECT id FROM succ_cases WHERE deceased_id=? AND deleted_at IS NULL AND id<>?'); $dup->execute([$did, $id]);
        if ($dup->fetchColumn()) { throw new LcndaBadInput('Il y a déjà un dossier pour cette personne.'); }
        $vals['deceased_id'] = $did;
    }
    foreach (['title' => 200, 'death_date_text' => 120, 'death_place_text' => 200, 'notary_text' => 200, 'notary_ref' => 80, 'number' => 40, 'testament' => 1000, 'situation' => 2000] as $k => $max) {
        if (array_key_exists($k, $d)) { $vals[$k] = succ_txt($d[$k], $max, in_array($k, ['testament', 'situation'], true)); }
    }
    if (array_key_exists('last_address', $d)) { $vals['last_address'] = succ_txt($d['last_address'], 400, true); }
    if (array_key_exists('hypothesis_note', $d)) { $vals['hypothesis_note'] = succ_txt($d['hypothesis_note'], 4000, true); }
    if (array_key_exists('opened_at', $d)) { $v = succ_txt($d['opened_at'], 10); if ($v !== '' && !succ_date_ok($v)) { throw new LcndaBadInput('Date d’ouverture incorrecte.'); } $vals['opened_at'] = $v; }
    foreach (['notary_person_id', 'death_place_id'] as $k) {
        if (!array_key_exists($k, $d)) { continue; }
        $v = safe_int($d[$k]);
        if ($v && $k === 'notary_person_id' && !succ_person_ok($pdo, $v)) { throw new LcndaBadInput('Notaire introuvable.'); }
        if ($v && $k === 'death_place_id') { $s = $pdo->prepare('SELECT name FROM places WHERE id=?'); $s->execute([$v]); $n = $s->fetchColumn(); if ($n === false) { throw new LcndaBadInput('Lieu introuvable.'); } if (!array_key_exists('death_place_text', $d) || $vals['death_place_text'] === '') { $vals['death_place_text'] = (string) $n; } }
        $vals[$k] = $v ?: null;
    }
    // la date et le lieu du décès : repris de la fiche s'ils ne sont pas donnés
    $did = (int) ($vals['deceased_id'] ?? ($old['deceased_id'] ?? 0));
    if ($did && (!$id || isset($vals['deceased_id']))) {
        $p = succ_persons($pdo, [$did])[$did] ?? null;
        if ($p && $p['death']) {
            if (($vals['death_date_text'] ?? '') === '') { $vals['death_date_text'] = $p['death']['text'] ?: (string) ($p['death']['year'] ?? ''); }
            if (($vals['death_place_text'] ?? '') === '' && empty($vals['death_place_id'])) { $vals['death_place_text'] = $p['death']['place']; }
        }
        if (($vals['title'] ?? '') === '') { $vals['title'] = 'Succession de ' . succ_person_name($pdo, $did); }
    }
    if (array_key_exists('death_date_text', $vals)) {
        $p = $did ? (succ_persons($pdo, [$did])[$did] ?? null) : null;
        $vals['death_iso'] = succ_iso($vals['death_date_text']) ?: (string) ($p['death']['date'] ?? '');
    }
    if (!$id) {
        $vals += ['opened_at' => date('Y-m-d'), 'state' => 'ouvert'];
        if (($vals['number'] ?? '') === '') { $vals['number'] = succ_next_number($pdo, substr($vals['opened_at'] ?: date('Y-m-d'), 0, 4)); }
        $cols = array_keys($vals);
        $pdo->prepare('INSERT INTO succ_cases(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute(array_values($vals));
        $id = (int) $pdo->lastInsertId();
        if (succ_dossiers_ready($pdo)) { succ_attach($pdo, $id, (int) $vals['deceased_id'], 'deceased', 'open'); } // le défunt est rattaché à l'ouverture
        $notary = !empty($vals['notary_person_id']) ? succ_person_name($pdo, (int) $vals['notary_person_id']) : ($vals['notary_text'] ?? '');
        succ_journal($pdo, $id, 'open', $notary !== '' ? 'Dossier ouvert, mandant : ' . $notary : 'Dossier ouvert');
        if (!empty($vals['death_iso']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $vals['death_iso'])) {
            // la déclaration de succession : 6 mois après le décès (côté notaire, art. 641 du CGI)
            $due = date('Y-m-d', strtotime($vals['death_iso'] . ' +6 months'));
            $pdo->prepare("INSERT INTO succ_deadlines(case_id, due, label, kind) VALUES(?,?,?, 'declaration')")->execute([$id, $due, 'Déclaration de succession (6 mois après le décès), côté notaire']);
        }
        if (function_exists('log_change')) { log_change($pdo, 'succ_case', $id, 'create', 'Dossier de succession ouvert : ' . ($vals['title'] ?? '')); }
        return ['id' => $id, 'created' => true];
    }
    if (!$vals) { return ['id' => $id]; }
    $prev = array_intersect_key($old, $vals);
    if (isset($vals['deceased_id']) && (int) $vals['deceased_id'] !== (int) $old['deceased_id'] && succ_dossiers_ready($pdo)) {
        if ((int) $old['deceased_id']) { $pdo->prepare("UPDATE succ_case_persons SET role='verify' WHERE case_id=? AND person_id=? AND role='deceased'")->execute([$id, (int) $old['deceased_id']]); }
        succ_attach($pdo, $id, (int) $vals['deceased_id'], 'deceased', 'open');
    }
    $sets = implode(', ', array_map(static fn($c) => "$c=?", array_keys($vals)));
    $pdo->prepare("UPDATE succ_cases SET $sets, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([...array_values($vals), $id]);
    $what = array_keys(array_diff_assoc(array_map('strval', array_intersect_key($vals, $old)), array_map('strval', $prev)));
    if ($what && !(count($what) === 1 && $what[0] === 'hypothesis_note')) { succ_journal($pdo, $id, 'edit', 'Dossier modifié : ' . implode(', ', array_map(static fn($k) => ['deceased_id' => 'défunt', 'death_date_text' => 'date du décès', 'death_iso' => 'date du décès', 'death_place_text' => 'lieu du décès', 'death_place_id' => 'lieu du décès', 'notary_person_id' => 'notaire', 'notary_text' => 'notaire', 'notary_ref' => 'réf. du notaire', 'number' => 'n° de dossier', 'title' => 'titre', 'testament' => 'testament', 'situation' => 'situation', 'last_address' => 'dernier domicile', 'opened_at' => 'date d’ouverture'][$k] ?? $k, array_values(array_unique(array_map(static fn($k) => $k === 'death_iso' ? 'death_date_text' : ($k === 'death_place_id' ? 'death_place_text' : $k), $what)))))); }
    elseif ($what) { succ_journal($pdo, $id, 'note', 'Hypothèse retenue écrite'); }
    return ['id' => $id, 'prev' => $prev];
}

function succ_set_state(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); $c = succ_row($pdo, $id);
    $st = (string) ($d['state'] ?? '');
    if (!in_array($st, SUCC_STATES, true) || $st === 'archive') { throw new LcndaBadInput('État inconnu.'); }
    if ($st === 'remis' && empty($d['checked']) && empty($d['undo'])) { throw new LcndaBadInput('Passe d’abord par la liste de contrôle avant « Remis au notaire ».'); }
    if ($c['state'] === 'archive') { throw new LcndaBadInput('Ce dossier est archivé.'); }
    $pdo->prepare('UPDATE succ_cases SET state=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$st, $id]);
    succ_journal($pdo, $id, 'state', 'État : ' . (SUCC_STATE_LABELS[$c['state']] ?? $c['state']) . ' → ' . SUCC_STATE_LABELS[$st] . ($st === 'remis' && !empty($d['checked']) ? (($d['checked'] ?? '') === 'forced' ? ' (liste de contrôle incomplète : remis quand même)' : ' (liste de contrôle faite)') : '')
        . ($st === 'remis' && ($d['checked'] ?? '') === 'forced' && ($sum = succ_txt($d['summary'] ?? '', 600)) !== '' ? ' — ' . $sum : '')); // 📋 « Remis au notaire avec 1 manque et 2 points à revoir (…) »
    return ['id' => $id, 'prev' => (string) $c['state']];
}

function succ_override(PDO $pdo, array $d): array
{
    $id = safe_int($d['case_id'] ?? 0); $c = succ_row($pdo, $id);
    $pid = safe_int($d['person_id'] ?? 0);
    if (!succ_person_ok($pdo, $pid)) { throw new LcndaBadInput('Fiche introuvable.'); }
    $field = (string) ($d['field'] ?? ''); $v = is_scalar($d['value'] ?? null) ? (string) $d['value'] : '';
    $allowed = ['status' => SUCC_OV_STATUS, 'adoption' => SUCC_OV_ADOPT, 'spouse' => SUCC_OV_SPOUSE][$field] ?? null;
    if ($allowed === null || !in_array($v, $allowed, true)) { throw new LcndaBadInput('Valeur inconnue.'); }
    $ov = json_decode((string) $c['overrides_json'], true); if (!is_array($ov)) { $ov = []; }
    $prev = (string) ($ov[$pid][$field] ?? '');
    if ($v === '') { unset($ov[$pid][$field]); if (empty($ov[$pid])) { unset($ov[$pid]); } } else { $ov[$pid][$field] = $v; }
    $pdo->prepare('UPDATE succ_cases SET overrides_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([json_encode($ov ?: new stdClass(), JSON_UNESCAPED_UNICODE), $id]);
    $label = ['alive' => 'vivant au décès', 'dead_before' => 'mort avant', 'dead_after' => 'mort après', 'unknown' => 'statut inconnu', 'renonce' => 'renonce', 'indigne' => 'indigne', 'absent' => 'présumé absent', 'absent_declare' => 'déclaré absent',
        'pleniere' => 'adoption plénière', 'simple' => 'adoption simple', 'married' => 'marié', 'not' => 'pas marié', 'divorced' => 'divorcé', '' => 'comme sur la fiche'][$v] ?? $v;
    succ_journal($pdo, $id, 'calc', succ_person_name($pdo, $pid) . ' : ' . $label);
    return ['case_id' => $id, 'person_id' => $pid, 'field' => $field, 'prev' => $prev];
}

function succ_piece_set(PDO $pdo, array $d): array
{
    $id = safe_int($d['case_id'] ?? 0); succ_row($pdo, $id);
    $key = (string) ($d['key'] ?? '');
    if (!preg_match('/^[NDMVR]:\d{1,10}$/', $key)) { throw new LcndaBadInput('Pièce inconnue.'); }
    $st = (string) ($d['state'] ?? '');
    if ($st !== '' && !in_array($st, SUCC_PIECE_STATES, true)) { throw new LcndaBadInput('État inconnu.'); }
    $s = $pdo->prepare('SELECT state, courrier_id, note FROM succ_pieces WHERE case_id=? AND piece_key=?'); $s->execute([$id, $key]); $old = $s->fetch(PDO::FETCH_ASSOC) ?: null;
    $courrier = array_key_exists('courrier_id', $d) ? (safe_int($d['courrier_id']) ?: null) : ($old ? ((int) $old['courrier_id'] ?: null) : null);
    $note = array_key_exists('note', $d) ? succ_txt($d['note'], 500) : (string) ($old['note'] ?? '');
    $pdo->prepare('INSERT INTO succ_pieces(case_id, piece_key, state, courrier_id, note, updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(case_id, piece_key) DO UPDATE SET state=excluded.state, courrier_id=excluded.courrier_id, note=excluded.note, updated_at=CURRENT_TIMESTAMP')->execute([$id, $key, $st, $courrier, $note]);
    if (empty($d['quiet'])) {
        $label = ['have' => 'en main', 'asked' => 'demandé', 'missing' => 'manquant', 'na' => 'sans objet', '' => 'état d’après la fiche'][$st];
        succ_journal($pdo, $id, 'piece', mb_substr(succ_txt($d['what'] ?? $key, 300) . ' : ' . $label, 0, 400));
    }
    succ_touch($pdo, $id);
    return ['case_id' => $id, 'key' => $key, 'prev' => $old ? ['state' => (string) $old['state'], 'courrier_id' => (int) $old['courrier_id'] ?: null, 'note' => (string) $old['note']] : null];
}

function succ_deadline(PDO $pdo, array $d, string $op): array
{
    $cid = safe_int($d['case_id'] ?? 0); succ_row($pdo, $cid);
    $id = safe_int($d['id'] ?? 0);
    if ($op === 'deadline_save') {
        $due = succ_txt($d['due'] ?? '', 10); if (!succ_date_ok($due)) { throw new LcndaBadInput('Choisis la date de l’échéance.'); }
        $label = succ_txt($d['label'] ?? '', 300); if ($label === '') { throw new LcndaBadInput('Écris ce qu’il faut faire.'); }
        $kind = in_array($d['kind'] ?? '', SUCC_DEADLINE_KINDS, true) ? (string) $d['kind'] : 'autre';
        if ($id) { $pdo->prepare('UPDATE succ_deadlines SET due=?, label=?, kind=? WHERE id=? AND case_id=?')->execute([$due, $label, $kind, $id, $cid]); }
        else { $pdo->prepare('INSERT INTO succ_deadlines(case_id, due, label, kind) VALUES(?,?,?,?)')->execute([$cid, $due, $label, $kind]); $id = (int) $pdo->lastInsertId(); }
        succ_journal($pdo, $cid, 'deadline', 'Échéance du ' . $due . ' : ' . $label);
    } else {
        $s = $pdo->prepare('SELECT * FROM succ_deadlines WHERE id=? AND case_id=?'); $s->execute([$id, $cid]); $r = $s->fetch(PDO::FETCH_ASSOC);
        if (!$r) { throw new LcndaBadInput('Échéance introuvable.'); }
        if ($op === 'deadline_done') { $v = !empty($d['done']) ? 1 : 0; $pdo->prepare('UPDATE succ_deadlines SET done=? WHERE id=?')->execute([$v, $id]); if ($v) { succ_journal($pdo, $cid, 'deadline', 'Échéance faite : ' . $r['label']); } }
        elseif ($op === 'deadline_delete') { $pdo->prepare('UPDATE succ_deadlines SET deleted_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$id]); }
        else { $pdo->prepare('UPDATE succ_deadlines SET deleted_at=NULL WHERE id=?')->execute([$id]); }
    }
    succ_touch($pdo, $cid);
    return ['id' => $id, 'case_id' => $cid];
}

function succ_fee(PDO $pdo, array $d, string $op): array
{
    $cid = safe_int($d['case_id'] ?? 0); succ_row($pdo, $cid);
    $id = safe_int($d['id'] ?? 0);
    if ($op === 'fee_save') {
        $kind = in_array($d['kind'] ?? '', SUCC_FEE_KINDS, true) ? (string) $d['kind'] : 'time';
        $day = succ_txt($d['day'] ?? date('Y-m-d'), 10); if ($day !== '' && !succ_date_ok($day)) { throw new LcndaBadInput('Date incorrecte.'); }
        $label = succ_txt($d['label'] ?? '', 300);
        $min = max(0, min(100000, safe_int($d['minutes'] ?? 0)));
        $cents = max(0, min(100000000, safe_int($d['amount_cents'] ?? 0)));
        $pct = isset($d['percent']) && is_numeric($d['percent']) ? (float) $d['percent'] : null;
        if ($kind === 'percent' && ($pct === null || $pct < 0 || $pct > 100)) { throw new LcndaBadInput('Le pourcentage va de 0 à 100.'); }
        if ($kind === 'time' && !$min) { throw new LcndaBadInput('Combien de temps ?'); }
        $pid = safe_int($d['person_id'] ?? 0); if ($pid && !succ_person_ok($pdo, $pid)) { $pid = 0; }
        if ($id) { $pdo->prepare('UPDATE succ_fees SET kind=?, day=?, label=?, minutes=?, amount_cents=?, percent=?, person_id=? WHERE id=? AND case_id=?')->execute([$kind, $day, $label, $min, $cents, $pct, $pid ?: null, $id, $cid]); }
        else { $pdo->prepare('INSERT INTO succ_fees(case_id, kind, day, label, minutes, amount_cents, percent, person_id) VALUES(?,?,?,?,?,?,?,?)')->execute([$cid, $kind, $day, $label, $min, $cents, $pct, $pid ?: null]); $id = (int) $pdo->lastInsertId(); }
        succ_journal($pdo, $cid, 'fee', ['time' => 'Temps passé noté : ', 'cost' => 'Frais notés : ', 'percent' => 'Honoraires du contrat notés : '][$kind] . ($label !== '' ? $label : ($kind === 'time' ? $min . ' min' : '')));
    } else {
        $pdo->prepare('UPDATE succ_fees SET deleted_at=' . ($op === 'fee_delete' ? 'CURRENT_TIMESTAMP' : 'NULL') . ' WHERE id=? AND case_id=?')->execute([$id, $cid]);
    }
    succ_touch($pdo, $cid);
    return ['id' => $id];
}

/** un courrier du registre relié au dossier (demande d'acte rangée par « 📮 Demander l'acte », ou courrier à un héritier) */
function succ_link_courrier(PDO $pdo, array $d): array
{
    $cid = safe_int($d['case_id'] ?? 0); $c = succ_row($pdo, $cid);
    $kid = safe_int($d['courrier_id'] ?? 0);
    $s = $pdo->prepare('SELECT id, objet, destinataire, succ_case_id, succ_kind FROM courriers WHERE id=?'); $s->execute([$kid]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new LcndaBadInput('Courrier introuvable.'); }
    $kind = in_array($d['kind'] ?? '', ['acte', 'contact', 'contrat', 'relance', 'etranger'], true) ? (string) $d['kind'] : 'acte';
    $pdo->prepare('UPDATE courriers SET succ_case_id=?, succ_kind=? WHERE id=?')->execute([$cid, $kind, $kid]);
    $pid = safe_int($d['person_id'] ?? 0); if ($pid && succ_person_ok($pdo, $pid)) { $pdo->prepare('UPDATE courriers SET person_id=COALESCE(person_id, ?) WHERE id=?')->execute([$pid, $kid]); }
    $key = (string) ($d['piece_key'] ?? '');
    if ($key !== '' && preg_match('/^[NDMVR]:\d{1,10}$/', $key)) { succ_piece_set($pdo, ['case_id' => $cid, 'key' => $key, 'state' => 'asked', 'courrier_id' => $kid, 'quiet' => 1]); }
    $who = $pid ? succ_person_name($pdo, $pid) : '';
    succ_journal($pdo, $cid, 'courrier', $kind === 'acte' ? '📮 Acte demandé : ' . $r['objet'] . ' (' . $r['destinataire'] . ')' : 'Courrier n° ' . $kid . ' « ' . ['contact' => 'premier contact', 'contrat' => 'contrat de révélation', 'relance' => 'relance', 'etranger' => 'héritier à l’étranger'][$kind] . ' » : ' . ($who ?: $r['destinataire']));
    succ_touch($pdo, $cid);
    return ['courrier_id' => $kid, 'prev' => ['succ_case_id' => (int) $r['succ_case_id'] ?: null, 'succ_kind' => (string) $r['succ_kind']]];
}

/** ranger un courrier à un héritier dans le Registre de courriers (lettre gardée avec lui), relié au dossier et à la fiche */
function succ_file_letter(PDO $pdo, array $d): array
{
    $cid = safe_int($d['case_id'] ?? 0); $c = succ_row($pdo, $cid);
    if ($c['state'] === 'archive') { throw new LcndaBadInput('Ce dossier est archivé.'); }
    $pid = safe_int($d['person_id'] ?? 0); if (!succ_person_ok($pdo, $pid)) { throw new LcndaBadInput('Choisis l’héritier.'); }
    $kind = in_array($d['kind'] ?? '', ['contact', 'contrat', 'relance', 'etranger'], true) ? (string) $d['kind'] : 'contact';
    $date = succ_txt($d['date_envoi'] ?? date('Y-m-d'), 10); if (!succ_date_ok($date)) { throw new LcndaBadInput('Date d’envoi incorrecte.'); }
    $letter = succ_txt($d['letter'] ?? '', 20000, true); if ($letter === '') { throw new LcndaBadInput('La lettre est vide.'); }
    $objet = succ_txt($d['objet'] ?? '', 300) ?: ['contact' => 'Premier contact', 'contrat' => 'Contrat de révélation', 'relance' => 'Relance', 'etranger' => 'Recherche d’un héritier'][$kind];
    $delay = max(0, min(365, safe_int($d['relance_jours'] ?? 30)));
    $name = succ_person_name($pdo, $pid);
    $pdo->prepare("INSERT INTO courriers(organisme, destinataire, objet, date_envoi, statut, relance_delai_jours, relance_date, notes) VALUES('autre',?,?,?,'en_attente',?,?,?)")
        ->execute([$name, $objet, $date, $delay, $delay ? date('Y-m-d', strtotime($date . ' +' . $delay . ' days')) : '', $letter]);
    $kid = (int) $pdo->lastInsertId();
    $addr = $c['state'] === 'archive' ? '' : succ_txt($d['recipient_address'] ?? '', 600, true);
    $json = json_encode(['tool' => 'succ', 'kind' => $kind, 'recipient_address' => $addr, 'recipient_email' => succ_txt($d['recipient_email'] ?? '', 160)], JSON_UNESCAPED_UNICODE);
    $pdo->prepare('UPDATE courriers SET person_id=?, succ_case_id=?, succ_kind=?, letter_json=? WHERE id=?')->execute([$pid, $cid, $kind, $json, $kid]);
    if (empty($d['quiet'])) { succ_journal($pdo, $cid, 'courrier', 'Courrier n° ' . $kid . ' « ' . ['contact' => 'premier contact', 'contrat' => 'contrat de révélation', 'relance' => 'relance', 'etranger' => 'héritier à l’étranger'][$kind] . ' » rangé dans le registre : ' . $name); } // ✉️ une série : une seule ligne (succ_file_letters)
    if (function_exists('log_change')) { log_change($pdo, 'courrier', $kid, 'create', 'Courrier ajouté : ' . $objet . ' — ' . $name); }
    succ_touch($pdo, $cid);
    return ['courrier_id' => $kid];
}

/** « ↶ Annuler » un courrier rangé par le dossier (seulement un courrier à un héritier, pas une demande d'acte) */
function succ_unfile_letter(PDO $pdo, array $d): array
{
    $cid = safe_int($d['case_id'] ?? 0); succ_row($pdo, $cid);
    $kid = safe_int($d['courrier_id'] ?? 0);
    $s = $pdo->prepare("SELECT id FROM courriers WHERE id=? AND succ_case_id=? AND succ_kind IN ('contact','contrat','relance','etranger')"); $s->execute([$kid, $cid]);
    if (!$s->fetchColumn()) { throw new LcndaBadInput('Courrier introuvable.'); }
    $pdo->prepare('DELETE FROM courriers WHERE id=?')->execute([$kid]);
    succ_journal($pdo, $cid, 'courrier', 'Courrier n° ' . $kid . ' retiré du registre (annulé)');
    return ['ok' => true];
}

/** colonnes « Réponse » et « Signé le » d'un courrier (registre, onglet « ✉️ Héritiers contactés ») */
function succ_courrier_set(PDO $pdo, array $d): array
{
    $kid = safe_int($d['courrier_id'] ?? 0);
    $s = $pdo->prepare('SELECT id, reponse, signe_le, succ_case_id, person_id, statut FROM courriers WHERE id=?'); $s->execute([$kid]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new LcndaBadInput('Courrier introuvable.'); }
    $vals = [];
    if (array_key_exists('reponse', $d)) { $v = (string) $d['reponse']; if (!in_array($v, SUCC_ANSWERS, true)) { throw new LcndaBadInput('Réponse inconnue.'); } $vals['reponse'] = $v; }
    if (array_key_exists('signe_le', $d)) { $v = succ_txt($d['signe_le'], 10); if ($v !== '' && !succ_date_ok($v)) { throw new LcndaBadInput('Date de signature incorrecte.'); } $vals['signe_le'] = $v; }
    if (array_key_exists('statut', $d) && function_exists('courrier_statuts') && array_key_exists((string) $d['statut'], courrier_statuts())) { $vals['statut'] = (string) $d['statut']; }
    if (!$vals) { return ['courrier_id' => $kid]; }
    if (($vals['reponse'] ?? '') === 'yes' || ($vals['signe_le'] ?? '') !== '') { $vals += ['statut' => 'reponse_recue']; }
    $prev = array_intersect_key($r, $vals);
    $sets = implode(', ', array_map(static fn($c) => "$c=?", array_keys($vals)));
    $pdo->prepare("UPDATE courriers SET $sets, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([...array_values($vals), $kid]);
    if ((int) $r['succ_case_id'] && empty($d['undo'])) {
        $who = succ_person_name($pdo, (int) $r['person_id']);
        if (($vals['signe_le'] ?? '') !== '') { succ_journal($pdo, (int) $r['succ_case_id'], 'courrier', 'Contrat signé reçu : ' . $who . ' (' . $vals['signe_le'] . ')'); }
        elseif (isset($vals['reponse'])) { succ_journal($pdo, (int) $r['succ_case_id'], 'courrier', 'Réponse de ' . $who . ' : ' . (['' => '—', 'none' => 'rien', 'yes' => 'a répondu', 'no' => 'refuse', 'later' => 'rappellera'][$vals['reponse']])); }
    }
    return ['courrier_id' => $kid, 'prev' => $prev];
}

/** 🗄 Archiver un dossier clos : les adresses des vivants sont retirées du dossier et de ses courriers, le journal reste */
function succ_archive(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); $c = succ_row($pdo, $id);
    if ($c['state'] !== 'clos') { throw new LcndaBadInput('Seul un dossier clos peut être archivé.'); }
    $pdo->prepare("UPDATE succ_cases SET state='archive', last_address='', archived_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$id]);
    $n = 0;
    try {
        $s = $pdo->prepare('SELECT id, letter_json FROM courriers WHERE succ_case_id=?'); $s->execute([$id]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $k) {
            $j = json_decode((string) $k['letter_json'], true);
            if (is_array($j) && (($j['recipient_address'] ?? '') !== '' || ($j['recipient_email'] ?? '') !== '')) { $j['recipient_address'] = ''; $j['recipient_email'] = ''; $pdo->prepare('UPDATE courriers SET letter_json=? WHERE id=?')->execute([json_encode($j, JSON_UNESCAPED_UNICODE), (int) $k['id']]); $n++; }
        }
    } catch (Throwable $_) {}
    succ_journal($pdo, $id, 'archive', 'Dossier archivé : adresses des vivants retirées du dossier' . ($n ? ' et de ' . $n . ' courrier(s)' : '') . ', journal gardé');
    return ['id' => $id];
}

/* ═════════ 🗓 Ma semaine de recherche : les échéances des dossiers ═════════ */
function succ_semaine_items(PDO $pdo): array
{
    if (succ_kiosk() || !succ_ready($pdo)) { return []; }
    $out = [];
    $rows = $pdo->query("SELECT d.id, d.due, d.label, c.id AS case_id, c.number, c.title FROM succ_deadlines d JOIN succ_cases c ON c.id=d.case_id
        WHERE d.deleted_at IS NULL AND d.done=0 AND c.deleted_at IS NULL AND c.state NOT IN ('clos','archive') ORDER BY d.due LIMIT 200")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $r) {
        $u = function_exists('semaine_urgency') ? semaine_urgency((string) $r['due']) : 'later';
        if ($u === 'later') { continue; }
        $out[] = ['key' => 'succ:' . (int) $r['id'], 'sort' => 'rappel', 'urgency' => $u, 'title' => (string) $r['label'],
            'detail' => implode(' · ', array_filter([function_exists('i18n_t') ? i18n_t('Échéance le {date}', ['date' => function_exists('semaine_fr_date') ? semaine_fr_date((string) $r['due']) : (string) $r['due']]) : (string) $r['due'], function_exists('i18n_t') ? i18n_t('Dossier {n}', ['n' => (string) $r['number']]) : (string) $r['number'], (string) $r['title']])),
            'date' => (string) $r['due'], 'open' => ['kind' => 'list', 'list' => 'successoral', 'id' => (int) $r['case_id']], 'done_label' => function_exists('i18n_t') ? i18n_t('Fait') : 'Fait', 'snooze' => 'mark'];
    }
    return $out;
}
function succ_semaine_done(PDO $pdo, int $id, int $done): int
{
    $s = $pdo->prepare('SELECT done, case_id, label FROM succ_deadlines WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException('Échéance introuvable.'); }
    $pdo->prepare('UPDATE succ_deadlines SET done=? WHERE id=?')->execute([$done ? 1 : 0, $id]);
    if ($done) { succ_journal($pdo, (int) $r['case_id'], 'deadline', 'Échéance faite : ' . $r['label']); }
    return (int) $r['done'];
}

/* ═════════ Pour les modèles du traitement de texte : le dossier d'un héritier ═════════ */
function succ_letter_ctx(PDO $pdo, int $pid): array
{
    $cases = [];
    foreach ($pdo->query("SELECT id, snapshot_json, deceased_id FROM succ_cases WHERE deleted_at IS NULL AND state<>'archive' ORDER BY updated_at DESC")->fetchAll(PDO::FETCH_ASSOC) as $c) {
        $snap = json_decode((string) $c['snapshot_json'], true);
        if ((int) $c['deceased_id'] === $pid || isset($snap['shares'][(string) $pid])) { $cases[] = (int) $c['id']; }
    }
    return ['cases' => $cases];
}

/* ═════════ API ═════════ */
function successoral_api_get(PDO $pdo, array $g): array
{
    if (succ_kiosk()) { throw new RuntimeException('Mode consultation : les dossiers de succession ne se montrent pas.'); }
    if (!succ_ready($pdo)) { successoral_schema($pdo); }
    succ_outils_ensure($pdo);
    $op = scalar_text($g['op'] ?? 'list', 'op');
    $tools = succ_outils_get($pdo, $op, $g); if ($tools !== null) { return $tools; } // ✉️ modèles à soi (successoral_outils.php)
    if ($op === 'archive_download') { succ_archive_download((string) ($g['token'] ?? '')); }
    $more = succ_dossiers_get($pdo, $op, $g); if ($more !== null) { return $more; } // ⚖️ dossiers : rangement, filtre, rattachement (successoral_dossiers.php)
    return match ($op) {
        'list' => ['items' => succ_list($pdo)],
        'get' => succ_case_out($pdo, succ_row($pdo, safe_int($g['id'] ?? 0))),
        'by_person' => (static function () use ($pdo, $g) { $s = $pdo->prepare('SELECT id FROM succ_cases WHERE deceased_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1'); $s->execute([safe_int($g['person_id'] ?? 0)]); return ['id' => (int) $s->fetchColumn() ?: null]; })(),
        'graph' => ['graph' => succ_graph($pdo, safe_int($g['person_id'] ?? 0))],
        'letter_ctx' => succ_letter_ctx($pdo, safe_int($g['person_id'] ?? 0)),
        'deadlines' => ['items' => array_map(static fn($r) => ['id' => (int) $r['id'], 'due' => (string) $r['due'], 'label' => (string) $r['label'], 'case_id' => (int) $r['case_id'], 'number' => (string) $r['number'], 'title' => (string) $r['title']],
            $pdo->query("SELECT d.id, d.due, d.label, c.id AS case_id, c.number, c.title FROM succ_deadlines d JOIN succ_cases c ON c.id=d.case_id WHERE d.deleted_at IS NULL AND d.done=0 AND c.deleted_at IS NULL AND c.state NOT IN ('clos','archive') ORDER BY d.due LIMIT 50")->fetchAll(PDO::FETCH_ASSOC)),
            'open' => (int) $pdo->query("SELECT COUNT(*) FROM succ_cases WHERE deleted_at IS NULL AND state NOT IN ('clos','archive')")->fetchColumn()],
        // seulement les courriers rangés par un dossier de succession (succ_case_id non nul) ; « letter » = le texte de la lettre (sans le nom du défunt)
        'courriers' => ['items' => array_map(static fn($r) => ['id' => (int) $r['id'], 'case_id' => (int) $r['succ_case_id'], 'number' => (string) $r['number'], 'title' => (string) $r['title'], 'case_state' => (string) $r['state'],
            'reponse' => (string) $r['reponse'], 'signe_le' => (string) $r['signe_le'], 'kind' => (string) $r['succ_kind'], 'person_id' => (int) $r['person_id'] ?: null, 'destinataire' => (string) $r['destinataire'],
            'objet' => (string) $r['objet'], 'date_envoi' => (string) $r['date_envoi'], 'statut' => (string) $r['statut'], 'relance_date' => (string) $r['relance_date'], 'letter' => (string) $r['notes']],
            $pdo->query('SELECT k.id, k.succ_case_id, k.reponse, k.signe_le, k.succ_kind, k.person_id, k.destinataire, k.objet, k.date_envoi, k.statut, k.relance_date, k.notes, c.number, c.title, c.state FROM courriers k JOIN succ_cases c ON c.id=k.succ_case_id WHERE k.succ_case_id IS NOT NULL AND c.deleted_at IS NULL ORDER BY k.date_envoi DESC, k.id DESC')->fetchAll(PDO::FETCH_ASSOC))],
        default => throw new LcndaBadInput('Demande inconnue.'),
    };
}

function successoral_api_post(PDO $pdo, array $d): array
{
    if (succ_kiosk()) { throw new RuntimeException('Mode consultation : rien ne peut être modifié.'); }
    if (!succ_ready($pdo)) { successoral_schema($pdo); }
    succ_outils_ensure($pdo);
    $op = scalar_text($d['op'] ?? '', 'op');
    $tools = succ_outils_post($pdo, $op, $d); if ($tools !== null) { return $tools; } // ⏱ 🔔 ✉️ (successoral_outils.php)
    $more = succ_dossiers_post($pdo, $op, $d); if ($more !== null) { return $more; } // ⚖️ dossiers (successoral_dossiers.php)
    return match ($op) {
        'save' => succ_save($pdo, $d),
        'delete', 'restore' => (static function () use ($pdo, $d, $op) {
            $id = safe_int($d['id'] ?? 0); $c = succ_row($pdo, $id, true);
            $pdo->prepare('UPDATE succ_cases SET deleted_at=' . ($op === 'delete' ? 'CURRENT_TIMESTAMP' : 'NULL') . ' WHERE id=?')->execute([$id]);
            if (function_exists('log_change')) { log_change($pdo, 'succ_case', $id, $op === 'delete' ? 'delete' : 'update', ($op === 'delete' ? 'Dossier de succession supprimé : ' : 'Dossier de succession rétabli : ') . $c['title']); }
            return ['id' => $id];
        })(),
        'state' => succ_set_state($pdo, $d),
        'override' => succ_override($pdo, $d),
        'piece' => succ_piece_set($pdo, $d),
        'deadline_save', 'deadline_done', 'deadline_delete', 'deadline_restore' => succ_deadline($pdo, $d, $op),
        'fee_save', 'fee_delete', 'fee_restore' => succ_fee($pdo, $d, $op),
        'link_courrier' => succ_link_courrier($pdo, $d),
        'file_letter' => succ_file_letter($pdo, $d),
        'unfile_letter' => succ_unfile_letter($pdo, $d),
        'courrier_set' => succ_courrier_set($pdo, $d),
        'archive' => succ_archive($pdo, $d),
        'law_note' => succ_law_note($pdo, $d),
        'journal' => (static function () use ($pdo, $d) {
            $id = safe_int($d['case_id'] ?? 0); succ_row($pdo, $id);
            $kind = in_array($d['kind'] ?? '', ['pdf', 'export', 'search', 'other', 'courrier'], true) ? (string) $d['kind'] : 'other';
            $text = succ_txt($d['text'] ?? '', 600); if ($text === '') { throw new LcndaBadInput('Rien à noter.'); }
            succ_journal($pdo, $id, $kind, $text); return ['ok' => true];
        })(),
        'snapshot' => (static function () use ($pdo, $d) {
            $id = safe_int($d['case_id'] ?? 0); succ_row($pdo, $id);
            $snap = is_array($d['snapshot'] ?? null) ? $d['snapshot'] : null; if (!$snap) { throw new LcndaBadInput('Calcul manquant.'); }
            $clean = ['order' => safe_int($snap['order'] ?? 0), 'shares' => [], 'unknown' => array_slice(array_values(array_map('intval', is_array($snap['unknown'] ?? null) ? $snap['unknown'] : [])), 0, 500)];
            foreach (is_array($snap['shares'] ?? null) ? array_slice($snap['shares'], 0, 2000, true) : [] as $k => $v) { if (preg_match('/^\d{1,10}$/', (string) $k) && is_string($v) && preg_match('/^\d{1,30}(\/\d{1,30})?$/', $v)) { $clean['shares'][(string) $k] = $v; } }
            $pdo->prepare('UPDATE succ_cases SET snapshot_json=? WHERE id=?')->execute([json_encode($clean, JSON_UNESCAPED_UNICODE), $id]);
            $lines = array_slice(array_values(array_filter(array_map(static fn($l) => succ_txt($l, 300), is_array($d['lines'] ?? null) ? $d['lines'] : []))), 0, 20);
            if ($lines) { succ_journal($pdo, $id, 'calc', 'Dévolution recalculée : ' . implode(' ; ', $lines)); }
            elseif (!empty($d['first'])) { succ_journal($pdo, $id, 'calc', 'Dévolution calculée : ' . count($clean['shares']) . ' héritier(s)'); }
            return ['ok' => true];
        })(),
        default => throw new LcndaBadInput('Demande inconnue.'),
    };
}

/** 📜 Qui a vu quoi (lib/verrou.php) : impressions et PDF, exports, courriers en série, déplacement ou archive d'un dossier.
 *  Jamais le texte envoyé par la page : une sorte et un code connus, le n° et le titre du dossier. */
function succ_access_note(PDO $pdo, array $d, mixed $out): void
{
    if (!function_exists('access_log_add')) { return; }
    $op = (string) ($d['op'] ?? '');
    $case = safe_int($d['case_id'] ?? ($d['id'] ?? 0));
    $label = static fn() => access_case_label($pdo, $case);
    $n = static fn($k) => is_array($out) && is_array($out[$k] ?? null) ? count($out[$k]) : 0;
    match (true) {
        $op === 'journal' && ($d['kind'] ?? '') === 'pdf' => access_log_add($pdo, 'print', 'case', $case, $label(), 'succ_pdf'),
        $op === 'journal' && ($d['kind'] ?? '') === 'export' => access_log_add($pdo, 'export', 'case', $case, $label(), 'succ_journal_csv'),
        $op === 'file_letters' => access_log_add($pdo, 'letters', 'case', $case, $label(), 'file|' . $n('ids')),
        $op === 'unfile_letters' => access_log_add($pdo, 'letters', 'case', $case, $label(), 'unfile|' . (is_array($out) ? (int) ($out['removed'] ?? 0) : 0)),
        $op === 'file_letter' => access_log_add($pdo, 'letters', 'case', $case, $label(), 'file|1'),
        $op === 'move' => access_log_add($pdo, 'export', 'case', $case, $label(), 'succ_move'),
        $op === 'archive_file' => access_log_add($pdo, 'export', 'case', $case, $label(), 'succ_archive'),
        default => null,
    };
}

function successoral_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite && $action === 'successoral') {
            $op = (string) ($_GET['op'] ?? '');
            if ($op === 'archive_download' && !succ_kiosk()) { access_log_add($pdo, 'export', '', null, '', 'succ_archive'); } // 📜 lib/verrou.php
            $res = successoral_api_get($pdo, $_GET);
            if ($op === 'get' && !succ_kiosk() && !empty($res['id'])) { access_case_open($pdo, (int) $res['id']); } // 📂 une fois par séance
            json_response($res);
        }
        if ($isWrite && $action === 'successoral_write') {
            // déplacer ou archiver dans un fichier : une copie de sauvegarde d'abord (des deux généalogies), hors transaction
            $op = (string) ($payload['op'] ?? '');
            if (in_array($op, ['move', 'archive_file'], true) && !succ_kiosk()) {
                succ_dossiers_ensure($pdo);
                succ_row($pdo, safe_int($payload['case_id'] ?? $payload['id'] ?? 0));
                succ_backup($pdo, DATA_DIR . '/backups', $op === 'move' ? 'deplacement-dossier' : 'archivage-dossier');
                $to = (string) ($payload['to'] ?? '');
                $gs = succ_genealogies();
                if ($op === 'move' && $to !== succ_gid() && isset($gs[$to]) && ($ro = succ_open_ro($gs[$to]['path']))) { succ_backup($ro, succ_dir_of($to) . '/backups', 'arrivee-dossier'); $ro = null; }
            }
            $pdo->beginTransaction();
            try { $out = successoral_api_post($pdo, $payload); succ_access_note($pdo, $payload, $out); $pdo->commit(); }
            catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
            json_response(['ok' => true, 'result' => $out]);
        }
        json_response(['error' => 'Action inconnue.'], 400);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'consultation') ? 403 : 422);
    }
}
