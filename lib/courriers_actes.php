<?php
declare(strict_types=1);

/**
 * 📮 Courriers tout prêts : « Demander l'acte » (interface : assets/js/heritage-courriers-actes.js).
 *
 * Complète ce qui existait (lib/heritage_more.php : « 📮 Actes à demander à la mairie » des actes de moins de 100 ans,
 * act_request_letter / create_act_request ; le Registre de courriers d'api.php : save_courrier, relances ; « 🗓 Ma semaine
 * de recherche », lib/semaine.php, qui relit déjà les courriers sans réponse) :
 *  - toutes les sortes de demandes : copie intégrale, extrait avec filiation, extrait sans filiation (naissance, mariage,
 *    décès), recherche aux Archives départementales, transcription d'un acte à l'étranger (Service central d'état civil,
 *    Nantes), dossier de dispense de mariage (archives diocésaines) ;
 *  - pour n'importe quelle personne, même quand l'événement manque (« Que manque-t-il ? ») ;
 *  - la règle des délais (code du patrimoine, art. L213-2 : naissance et mariage communicables à tous 75 ans après
 *    l'acte ; décès tout de suite) et qui peut demander la copie intégrale avant (décret n° 2017-890 du 6 mai 2017,
 *    art. 30 : la personne, ses ascendants, descendants, conjoint, représentant légal) ; si l'acte est libre, on le dit,
 *    et s'il a plus de 100 ans, qu'il est sans doute en ligne aux Archives départementales ;
 *  - le destinataire avec son adresse modifiable : mairie de la commune, Archives départementales (la fiche de « Services
 *    d'archives » si elle existe, lib/archive_services.php), Service central d'état civil (Nantes), archives diocésaines ;
 *  - l'expéditeur et les modèles viennent des réglages de la page (genealogie-courriers-lettres, K2) ;
 *  - « Ranger dans les courriers suivis » : une ligne du Registre de courriers (relance), la lettre gardée avec elle
 *    (letter_json), ↶ Annuler.
 *
 * Colonnes courriers.person_id, letter_json, media_id (structure n°81, lib/migrations.php).
 * GET  api.php?action=cl_context&person_id=&event_id=&act= | cl_letter&id= | cl_ids | cl_templates
 * POST api.php?action=cl_write {op: build | file | unfile}
 */

const CL_ACTS = ['naissance' => 'BIRT', 'mariage' => 'MARR', 'deces' => 'DEAT'];
const CL_ACT_LABEL = ['naissance' => 'naissance', 'mariage' => 'mariage', 'deces' => 'décès'];
const CL_WHATS = [
    'integrale' => 'Copie intégrale',
    'extrait_filiation' => 'Extrait avec filiation',
    'extrait_sans' => 'Extrait sans filiation',
    'recherche' => 'Recherche aux archives',
    'transcription' => 'Transcription (acte à l’étranger)',
    'dispense' => 'Dossier de dispense de mariage',
];
const CL_RELATIONS = [
    'moi' => 'C’est mon propre acte', 'descendant' => 'Je suis son descendant direct', 'ascendant' => 'Je suis son ascendant direct',
    'conjoint' => 'Je suis son conjoint', 'representant' => 'Je suis son représentant légal', 'autre' => 'Autre lien (cousin, collatéral…) ou aucun',
];
const CL_RECIPIENTS = ['mairie' => 'Mairie de la commune', 'ad' => 'Archives départementales', 'scec' => 'Service central d’état civil (Nantes)', 'diocese' => 'Archives diocésaines', 'autre' => 'Autre destinataire'];
const CL_SCEC_ADDRESS = "Ministère de l’Europe et des Affaires étrangères\nService central d’état civil\n11 rue de la Maison Blanche\n44941 Nantes Cedex 9";
const CL_MAX_LETTER = 20000;

function cl_schema(PDO $pdo): void
{
    $has = static function (string $c) use ($pdo): bool { return (bool) $pdo->query("SELECT 1 FROM pragma_table_info('courriers') WHERE name=" . $pdo->quote($c))->fetchColumn(); };
    if (!$pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='courriers'")->fetchColumn()) { return; }
    if (!$has('event_id')) { $pdo->exec('ALTER TABLE courriers ADD COLUMN event_id INTEGER'); }
    if (!$has('person_id')) { $pdo->exec('ALTER TABLE courriers ADD COLUMN person_id INTEGER'); }
    if (!$has('letter_json')) { $pdo->exec("ALTER TABLE courriers ADD COLUMN letter_json TEXT NOT NULL DEFAULT ''"); }
    if (!$has('media_id')) { $pdo->exec('ALTER TABLE courriers ADD COLUMN media_id INTEGER'); }
}

function cl_ready(PDO $pdo): void
{
    static $done = false;
    if (!$done) { cl_schema($pdo); $done = true; }
}

/** Un texte court venu de la page (une ligne), ou plusieurs lignes. */
function cl_text(mixed $v, int $max, bool $multi = false): string
{
    if ($v === null) { return ''; }
    if (!is_scalar($v)) { throw new LcndaBadInput('Donnée incorrecte : un texte est attendu.'); }
    $s = str_replace(["\r\n", "\r"], "\n", (string) $v);
    if (!mb_check_encoding($s, 'UTF-8')) { throw new LcndaBadInput('Texte illisible.'); }
    $s = (string) preg_replace($multi ? '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x{202A}-\x{202E}\x{2066}-\x{2069}]/u' : '/[\x00-\x1F\x7F\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', '', $s);
    $s = trim($s);
    return mb_strlen($s) > $max ? rtrim(mb_substr($s, 0, $max)) : $s;
}

function cl_date_fr(?string $ymd = null): string
{
    $ymd = $ymd ?: date('Y-m-d');
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $ymd, $m)) { return $ymd; }
    $months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    return ((int) $m[3] === 1 ? '1er' : (string) (int) $m[3]) . ' ' . $months[(int) $m[2] - 1] . ' ' . $m[1];
}

function cl_person(PDO $pdo, int $id): ?array
{
    if ($id <= 0) { return null; }
    $s = $pdo->prepare("SELECT id, first_name, middle_name, last_name, gender, COALESCE(is_start,0) AS is_start FROM persons WHERE id=? AND COALESCE(kind,'human')<>'animal'");
    $s->execute([$id]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { return null; }
    $p['id'] = (int) $p['id'];
    $p['name'] = trim(trim((string) $p['first_name'] . ' ' . (string) ($p['middle_name'] ?? '')) . ' ' . (string) $p['last_name']) ?: 'Sans nom';
    return $p;
}

function cl_event_row(PDO $pdo, string $where, array $params): ?array
{
    $s = $pdo->prepare("SELECT e.id, e.person_id, e.family_id, e.date_text, e.year, t.gedcom_tag, pl.id AS place_id, pl.name AS place, pl.county, pl.state, pl.country, pl.admin4_code
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE $where ORDER BY e.year IS NULL, e.id LIMIT 1");
    $s->execute($params);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    return $r ?: null;
}

/** Les conjoints d'une personne (et la famille) */
function cl_spouses(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare('SELECT id, partner1_id, partner2_id FROM families WHERE partner1_id=? OR partner2_id=? ORDER BY id');
    $s->execute([$pid, $pid]);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $f) {
        $o = (int) $f['partner1_id'] === $pid ? (int) $f['partner2_id'] : (int) $f['partner1_id'];
        $out[] = ['family_id' => (int) $f['id'], 'person' => $o ? cl_person($pdo, $o) : null];
    }
    return $out;
}

/** Le département d'un lieu : code (2 ou 3 caractères) et nom. */
function cl_department(array $ev): array
{
    $code = '';
    $insee = (string) ($ev['admin4_code'] ?? '');
    if (preg_match('/^(97\d|2[AB]|\d{2})/', $insee, $m)) { $code = $m[1]; }
    $deps = function_exists('archive_departments') ? archive_departments() : [];
    $name = $code !== '' ? ($deps[$code] ?? '') : '';
    $county = trim((string) ($ev['county'] ?? ''));
    if ($name === '' && $county !== '') {
        $name = $county;
        foreach ($deps as $c => $n) { if (function_exists('archive_service_fold') && archive_service_fold($n) === archive_service_fold($county)) { $code = (string) $c; $name = $n; break; } }
    }
    return ['code' => $code, 'name' => $name];
}

function cl_is_france(array $ev): bool
{
    $c = mb_strtolower(trim((string) ($ev['country'] ?? '')));
    return $c === '' || in_array($c, ['france', 'fr', 'fra'], true);
}

/** Le lien du demandeur, deviné depuis la personne de départ (« moi ») : moi, descendant, ascendant, conjoint, autre. */
function cl_guess_relation(PDO $pdo, int $pid): string
{
    $me = (int) $pdo->query('SELECT id FROM persons WHERE is_start=1 ORDER BY id LIMIT 1')->fetchColumn();
    if (!$me) { return ''; }
    if ($me === $pid) { return 'moi'; }
    if (function_exists('person_is_ancestor_of')) {
        if (person_is_ancestor_of($pdo, $pid, $me)) { return 'descendant'; }
        if (person_is_ancestor_of($pdo, $me, $pid)) { return 'ascendant'; }
    }
    foreach (cl_spouses($pdo, $pid) as $s) { if (($s['person']['id'] ?? 0) === $me) { return 'conjoint'; } }
    return 'autre';
}

/** Tout ce qu'il faut pour écrire : la personne, l'acte (même absent), le lieu, les parents, le conjoint, le lien. */
function cl_context(PDO $pdo, int $personId, int $eventId, string $act): array
{
    cl_ready($pdo);
    $ev = null;
    if ($eventId > 0) {
        $ev = cl_event_row($pdo, 'e.id=?', [$eventId]);
        if (!$ev) { throw new RuntimeException('Événement introuvable.'); }
        $tagAct = array_search((string) $ev['gedcom_tag'], CL_ACTS, true);
        if ($tagAct !== false) { $act = $tagAct; }
        if (!$personId) {
            if ($ev['person_id']) { $personId = (int) $ev['person_id']; }
            elseif ($ev['family_id']) { $f = $pdo->prepare('SELECT partner1_id, partner2_id FROM families WHERE id=?'); $f->execute([(int) $ev['family_id']]); $fr = $f->fetch(PDO::FETCH_ASSOC); $personId = (int) ($fr['partner1_id'] ?: $fr['partner2_id'] ?? 0); }
        }
    }
    if (!isset(CL_ACTS[$act])) { $act = 'naissance'; }
    $p = cl_person($pdo, $personId);
    if (!$p) { throw new RuntimeException('Personne introuvable.'); }
    $spouses = cl_spouses($pdo, $p['id']);
    if (!$ev) {
        if ($act === 'mariage') {
            $fids = array_column($spouses, 'family_id');
            if ($fids) { $ev = cl_event_row($pdo, "t.gedcom_tag='MARR' AND e.family_id IN (" . implode(',', array_map('intval', $fids)) . ')', []); }
        } else {
            $ev = cl_event_row($pdo, 't.gedcom_tag=? AND e.person_id=?', [CL_ACTS[$act], $p['id']]);
        }
    }
    $spouse = null;
    if ($act === 'mariage') {
        foreach ($spouses as $s) { if ($ev && (int) $ev['family_id'] === $s['family_id']) { $spouse = $s['person']; break; } }
        $spouse ??= $spouses[0]['person'] ?? null;
    }
    $parents = [];
    if (function_exists('h_parents')) { foreach (h_parents($pdo, $p['id']) as $pid) { if ($pp = cl_person($pdo, (int) $pid)) { $parents[] = $pp; } } }
    // sans l'événement : la naissance (ou le décès) aide à situer — on estime l'année et on prend le lieu connu le plus proche
    $guess = null;
    if (!$ev) {
        $guess = cl_event_row($pdo, "t.gedcom_tag IN ('BIRT','CHR','BAPM','RESI','DEAT','BURI') AND e.person_id=? AND e.place_id IS NOT NULL", [$p['id']]);
    }
    $place = $ev && $ev['place'] ? $ev : $guess;
    $dep = $place ? cl_department($place) : ['code' => '', 'name' => ''];
    $year = $ev && $ev['year'] ? (int) $ev['year'] : null;
    $exact = $ev && function_exists('exact_date') ? exact_date((string) $ev['date_text']) : null;
    return [
        'act' => $act, 'person' => ['id' => $p['id'], 'name' => $p['name'], 'gender' => (string) $p['gender']],
        'event' => $ev ? ['id' => (int) $ev['id'], 'date_text' => (string) ($ev['date_text'] ?: ($ev['year'] ?? '')), 'year' => $year, 'exact' => $exact, 'place' => (string) ($ev['place'] ?? '')] : null,
        'missing' => $ev === null,
        'place' => $place ? ['id' => (int) $place['place_id'], 'name' => (string) $place['place'], 'county' => (string) ($place['county'] ?? ''), 'country' => (string) ($place['country'] ?? ''), 'france' => cl_is_france($place), 'guessed' => !$ev || !$ev['place']] : null,
        'department' => $dep,
        'parents' => array_map(static fn($x) => ['id' => $x['id'], 'name' => $x['name']], $parents),
        'spouse' => $spouse ? ['id' => $spouse['id'], 'name' => $spouse['name']] : null,
        'relation_guess' => cl_guess_relation($pdo, $p['id']),
    ];
}

/**
 * La règle des délais pour cet acte. public : libre d'accès ; full_ok : la copie intégrale (ou l'extrait avec filiation)
 * peut être demandée par ce demandeur ; online : plus de 100 ans (en général aux Archives départementales, souvent en ligne).
 */
function cl_legal(string $act, ?int $year, ?string $exact, string $relation, string $what, ?string $today = null): array
{
    $today = $today ?: date('Y-m-d');
    $nowY = (int) substr($today, 0, 4);
    $direct = in_array($relation, ['moi', 'descendant', 'ascendant', 'conjoint', 'representant'], true);
    $kind = CL_ACT_LABEL[$act] ?? $act;
    $openAt = null; $public = false; $unknown = $year === null;
    if ($act === 'deces') { $public = true; }
    elseif ($year !== null) {
        $openAt = $exact ? date('Y-m-d', (int) strtotime($exact . ' +75 years')) : ($year + 75) . '-12-31';
        $public = $openAt <= $today;
    }
    $online = $year !== null && $year <= $nowY - 100;
    $wantsFull = in_array($what, ['integrale', 'extrait_filiation', 'transcription'], true);
    $fullOk = $public || $direct || !$wantsFull;
    $rule = $act === 'deces'
        ? 'Les actes de décès sont communicables à tous, sans délai (code du patrimoine, art. L213-2) : n’importe qui peut en demander la copie intégrale.'
        : "Les actes de {$kind} sont communicables à tous 75 ans après leur date (code du patrimoine, art. L213-2). Avant, la copie intégrale et l’extrait avec filiation sont réservés à la personne, à ses ascendants, descendants, à son conjoint ou à son représentant légal (décret du 6 mai 2017, art. 30) ; les autres peuvent obtenir un extrait sans filiation.";
    $status = 'ok'; $says = [];
    if ($unknown && $act !== 'deces') { $status = 'info'; $says[] = 'La date de l’acte n’est pas connue : on ne peut pas calculer le délai. La mairie vérifiera ; indique au moins une période dans la lettre.'; }
    elseif ($public) {
        $says[] = $act === 'deces' ? 'Cet acte est libre d’accès.' : 'Cet acte est libre d’accès depuis le ' . cl_date_fr($openAt) . ' : tout le monde peut en avoir la copie intégrale.';
        $says[] = $online ? 'Il a plus de 100 ans : il est sans doute aux Archives départementales et souvent en ligne. Regarde d’abord sur leur site (c’est gratuit) avant d’écrire.' : 'Tu peux aussi le consulter sur place, à la mairie' . ($year !== null && $year <= $nowY - 75 ? ' ou aux archives' : '') . '.';
    } else {
        if ($wantsFull && !$direct) { $status = 'warn'; $says[] = 'Tu n’es pas dans la famille directe : avant le ' . cl_date_fr($openAt) . ', tu ne peux obtenir qu’un extrait sans filiation. La lettre demande donc un extrait sans filiation.'; }
        elseif ($wantsFull) { $says[] = 'Ton lien te permet de demander la copie intégrale avant le ' . cl_date_fr($openAt) . ' : joins une copie de ta pièce d’identité' . (in_array($relation, ['descendant', 'ascendant'], true) ? ' et les actes qui prouvent ta filiation' : '') . '.'; }
        else { $says[] = 'Cet acte devient libre d’accès le ' . cl_date_fr($openAt) . '.'; }
    }
    return ['public' => $public, 'open_at' => $openAt, 'online' => $online, 'full_ok' => $fullOk, 'direct' => $direct, 'unknown' => $unknown,
        'downgrade' => !$fullOk ? 'extrait_sans' : '', 'status' => $status, 'rule' => $rule, 'says' => $says];
}

/** Les destinataires possibles, avec une adresse à compléter ou à corriger. */
function cl_recipients(PDO $pdo, array $ctx): array
{
    $place = $ctx['place']; $dep = $ctx['department'];
    $commune = $place && $place['france'] ? trim((string) preg_replace('/\s*,.*$/', '', $place['name'])) : '';
    $out = [];
    $out['mairie'] = ['kind' => 'mairie', 'label' => $commune !== '' ? 'Mairie de ' . $commune : 'Mairie', 'address' => ($commune !== '' ? "Mairie de {$commune}\nService de l’état civil\n[code postal] {$commune}" : "Mairie de [commune]\nService de l’état civil\n[code postal] [commune]"), 'email' => ''];
    $ad = null;
    if (function_exists('archive_services_ready') && archive_services_ready($pdo)) {
        $s = $pdo->prepare("SELECT * FROM archive_services WHERE kind='ad' AND dept_code<>'' AND dept_code=? ORDER BY id LIMIT 1");
        $s->execute([$dep['code']]);
        $ad = $s->fetch(PDO::FETCH_ASSOC) ?: null;
    }
    $adName = $ad ? (string) $ad['name'] : ($dep['name'] !== '' ? 'Archives départementales (' . $dep['name'] . ')' : 'Archives départementales');
    $out['ad'] = ['kind' => 'ad', 'label' => $adName, 'address' => $ad ? trim($adName . "\n" . trim((string) $ad['address']) . ($ad['city'] !== '' && !str_contains((string) $ad['address'], (string) $ad['city']) ? "\n" . $ad['city'] : '')) : $adName . "\n[adresse]\n[code postal] [ville]",
        'email' => $ad ? (string) $ad['email'] : '', 'service_id' => $ad ? (int) $ad['id'] : 0, 'known' => (bool) $ad];
    $out['scec'] = ['kind' => 'scec', 'label' => 'Service central d’état civil (Nantes)', 'address' => CL_SCEC_ADDRESS, 'email' => ''];
    $dio = null;
    if (function_exists('archive_services_ready') && archive_services_ready($pdo)) {
        $s = $pdo->prepare("SELECT * FROM archive_services WHERE kind='diocese' AND (dept_code=? OR ?='') ORDER BY dept_code=? DESC, id LIMIT 1");
        $s->execute([$dep['code'], $dep['code'], $dep['code']]);
        $dio = $s->fetch(PDO::FETCH_ASSOC) ?: null;
    }
    $out['diocese'] = ['kind' => 'diocese', 'label' => $dio ? (string) $dio['name'] : 'Archives diocésaines', 'address' => $dio ? trim($dio['name'] . "\n" . $dio['address'] . "\n" . $dio['city']) : "Archives diocésaines de [diocèse]\n[adresse]\n[code postal] [ville]", 'email' => $dio ? (string) $dio['email'] : ''];
    $out['autre'] = ['kind' => 'autre', 'label' => 'Autre destinataire', 'address' => "[Nom du service]\n[adresse]\n[code postal] [ville]", 'email' => ''];
    return $out;
}

/** Le destinataire qui va d'office avec cette demande. */
function cl_default_recipient(string $what, array $ctx): string
{
    if ($what === 'recherche') { return 'ad'; }
    if ($what === 'dispense') { return 'diocese'; }
    if ($what === 'transcription' || ($ctx['place'] && !$ctx['place']['france'])) { return 'scec'; }
    return 'mairie';
}

/** Les modèles de départ (texte avec {repères}). Les modèles modifiés viennent des réglages de la page. */
function cl_default_templates(): array
{
    $head = "{expediteur}\n\n{destinataire}\n\n{lieu_date}\n\nObjet : {objet}\n\nMadame, Monsieur,\n\n";
    $foot = "\n\nJe vous remercie par avance et vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.\n\n{signature}";
    $acte = $head . "Dans le cadre de recherches généalogiques, je vous serais reconnaissant(e) de bien vouloir m’adresser {demande} de {personne}{filiation}, {evenement}.\n{lien_phrase}\n{pieces_phrase}\n{precision}\n{retour_phrase}" . $foot;
    return [
        'integrale' => $acte, 'extrait_filiation' => $acte, 'extrait_sans' => $acte,
        'recherche' => $head . "Dans le cadre de recherches généalogiques, je recherche l’acte de {acte} de {personne}{filiation}, {evenement}.\nPourriez-vous me dire si vos fonds le conservent (registres d’état civil, registres paroissiaux, tables décennales) et, si c’est possible, m’en adresser une copie ou m’indiquer sa cote ?\n{precision}\nSi une recherche par correspondance est payante, merci de m’indiquer le tarif et la marche à suivre." . $foot,
        'transcription' => $head . "Dans le cadre de recherches généalogiques, je vous serais reconnaissant(e) de bien vouloir m’adresser {demande} de la transcription de l’acte de {acte} de {personne}{filiation}, {evenement}, acte établi à l’étranger.\n{lien_phrase}\n{pieces_phrase}\n{precision}" . $foot,
        'dispense' => $head . "Dans le cadre de recherches généalogiques, je recherche le dossier de dispense de mariage (consanguinité, affinité ou publication des bans) de {personne} et de {conjoint}, {evenement}.\nPourriez-vous me dire si vos archives conservent ce dossier, et à quelles conditions je peux en obtenir une copie ou le consulter ?\n{precision}" . $foot,
    ];
}

/** Les repères qu'un modèle peut utiliser (montrés dans les réglages). */
function cl_placeholders(): array
{
    return ['{expediteur}' => 'ton nom et ton adresse', '{destinataire}' => 'l’adresse du destinataire', '{lieu_date}' => '« À Tulle, le 9 novembre 2026 »', '{objet}' => 'l’objet de la lettre',
        '{demande}' => '« une copie intégrale de l’acte de naissance »', '{acte}' => 'naissance, mariage ou décès', '{personne}' => 'le nom de la personne', '{filiation}' => '« , fils de … et de … »',
        '{evenement}' => '« né le 7 mai 1925 à Tulle (Corrèze) »', '{conjoint}' => 'le conjoint (mariage)', '{lien_phrase}' => 'ton lien avec la personne', '{pieces_phrase}' => 'les pièces jointes',
        '{precision}' => 'tes précisions', '{retour_phrase}' => 'l’enveloppe timbrée (courrier)', '{signature}' => 'ta signature'];
}

/** La lettre, d'après la demande (et le modèle choisi s'il y en a un). */
function cl_build(PDO $pdo, array $in): array
{
    cl_ready($pdo);
    $act = isset(CL_ACTS[$in['act'] ?? '']) ? (string) $in['act'] : 'naissance';
    $ctx = cl_context($pdo, safe_int($in['person_id'] ?? 0), safe_int($in['event_id'] ?? 0), $act);
    $act = $ctx['act'];
    $what = isset(CL_WHATS[$in['what'] ?? '']) ? (string) $in['what'] : 'integrale';
    if ($what === 'dispense') { $act = 'mariage'; }
    $relation = isset(CL_RELATIONS[$in['relation'] ?? '']) ? (string) $in['relation'] : ($ctx['relation_guess'] ?: 'autre');
    $legal = cl_legal($act, $ctx['event']['year'] ?? null, $ctx['event']['exact'] ?? null, $relation, $what);
    $asked = $what;
    if ($legal['downgrade'] && in_array($what, ['integrale', 'extrait_filiation'], true)) { $what = $legal['downgrade']; }
    $recipients = cl_recipients($pdo, $ctx);
    $rkind = isset($recipients[$in['recipient'] ?? '']) ? (string) $in['recipient'] : cl_default_recipient($what, $ctx);
    $rAddress = cl_text($in['recipient_address'] ?? '', 600, true) ?: $recipients[$rkind]['address'];
    $sender = is_array($in['sender'] ?? null) ? $in['sender'] : [];
    $sName = cl_text($sender['name'] ?? '', 120); $sAddr = cl_text($sender['address'] ?? '', 400, true); $sEmail = cl_text($sender['email'] ?? '', 160); $sPhone = cl_text($sender['phone'] ?? '', 40); $sCity = cl_text($sender['city'] ?? '', 80);
    $byEmail = !empty($in['by_email']);
    $precision = cl_text($in['precision'] ?? '', 2000, true);
    $kind = CL_ACT_LABEL[$act];
    $p = $ctx['person'];
    $g = $p['gender'] === 'female' ? 'e' : ($p['gender'] === 'male' ? '' : '(e)');
    $ev = $ctx['event'];
    $place = $ctx['place'] ? $ctx['place']['name'] . ($ctx['department']['name'] !== '' && !str_contains($ctx['place']['name'], $ctx['department']['name']) ? ' (' . $ctx['department']['name'] . ')' : '') : '';
    $date = $ev && $ev['date_text'] !== '' ? $ev['date_text'] : '';
    $verb = match ($act) { 'naissance' => 'né' . $g, 'mariage' => 'marié' . $g . ($ctx['spouse'] ? ' avec ' . $ctx['spouse']['name'] : ''), default => 'décédé' . $g };
    $when = $date !== '' ? (preg_match('/^\d/', $date) ? 'le ' . $date : $date) : ($precision === '' ? 'à une date que je ne connais pas précisément' : 'à une date que je ne connais pas précisément (voir plus bas)');
    $where = $place !== '' ? ($date === '' ? ', ' : '') . ($ctx['place']['guessed'] ? 'sans doute à ' . $place : 'à ' . $place) : '';
    $sep = $where !== '' && $where[0] !== ',' ? ' ' : '';
    $evenement = trim($verb . ' ' . $when . $sep . $where);
    if ($what === 'dispense') { $evenement = 'mariés ' . $when . $sep . $where; }
    $filiation = '';
    if ($ctx['parents'] && $act !== 'mariage') { $filiation = ', ' . ($p['gender'] === 'female' ? 'fille' : ($p['gender'] === 'male' ? 'fils' : 'enfant')) . ' de ' . implode(' et de ', array_column($ctx['parents'], 'name')); }
    $demande = match ($what) {
        'integrale' => "une copie intégrale de l’acte de {$kind}", 'extrait_filiation' => "un extrait avec filiation de l’acte de {$kind}", 'extrait_sans' => "un extrait sans filiation de l’acte de {$kind}",
        'transcription' => 'une copie intégrale', 'recherche' => "l’acte de {$kind}", default => 'le dossier de dispense',
    };
    $lien = ['moi' => 'Il s’agit de mon propre acte.', 'descendant' => 'Je suis son descendant direct, ce qui m’autorise à obtenir une copie intégrale.', 'ascendant' => 'Je suis son ascendant direct.', 'conjoint' => 'Je suis son conjoint.', 'representant' => 'Je suis son représentant légal.', 'autre' => ''][$relation] ?? '';
    if ($legal['public'] || !in_array($what, ['integrale', 'extrait_filiation', 'transcription'], true)) { $lien = $relation === 'descendant' ? 'Je suis son descendant.' : ''; }
    $pieces = (!$legal['public'] && in_array($what, ['integrale', 'extrait_filiation', 'transcription'], true) && $legal['direct'])
        ? 'Je joins la copie de ma pièce d’identité' . (in_array($relation, ['descendant', 'ascendant'], true) ? ' et les actes qui établissent ma filiation avec la personne concernée.' : '.') : '';
    $retour = $byEmail ? ($sEmail !== '' ? 'Vous pouvez me répondre à l’adresse ' . $sEmail . '.' : '') : 'Vous trouverez ci-joint une enveloppe timbrée à mon adresse pour la réponse.';
    $objet = match ($what) {
        'recherche' => "Recherche de l’acte de {$kind} de {$p['name']}" . ($date !== '' ? " ({$date})" : ''),
        'transcription' => "Demande de copie de la transcription de l’acte de {$kind} de {$p['name']}",
        'dispense' => "Recherche d’un dossier de dispense de mariage — {$p['name']}" . ($ctx['spouse'] ? ' et ' . $ctx['spouse']['name'] : ''),
        default => 'Demande ' . ($what === 'integrale' ? 'de copie intégrale' : ($what === 'extrait_filiation' ? 'd’extrait avec filiation' : 'd’extrait sans filiation')) . " d’acte de {$kind} — {$p['name']}" . ($date !== '' ? " ({$date})" : ''),
    };
    $expediteur = trim(($sName !== '' ? $sName : '[Prénom Nom]') . "\n" . ($sAddr !== '' ? $sAddr : '[Adresse]') . "\n" . trim($sEmail . ($sEmail !== '' && $sPhone !== '' ? ' · ' : '') . $sPhone));
    $vals = ['{expediteur}' => $expediteur, '{destinataire}' => $rAddress, '{lieu_date}' => ($sCity !== '' ? 'À ' . $sCity . ', le ' : 'Le ') . cl_date_fr(), '{objet}' => $objet,
        '{demande}' => $demande, '{acte}' => $kind, '{personne}' => $p['name'], '{filiation}' => $filiation, '{evenement}' => $evenement, '{conjoint}' => $ctx['spouse']['name'] ?? '[conjoint]',
        '{lien_phrase}' => $lien, '{pieces_phrase}' => $pieces, '{precision}' => $precision, '{retour_phrase}' => $retour, '{signature}' => $sName !== '' ? $sName : '[Signature]'];
    $tpl = cl_text($in['template'] ?? '', 8000, true);
    if ($tpl === '' || !str_contains($tpl, '{')) { $tpl = cl_default_templates()[$what]; }
    $letter = strtr($tpl, $vals);
    // une ligne devenue vide au milieu (repère vide) ne laisse pas de trou en trop
    $letter = (string) preg_replace("/\n{3,}/", "\n\n", (string) preg_replace('/^[ \t]+$/m', '', $letter));
    $letter = trim($letter);
    $mailBody = (string) preg_replace('/^.*?\n\nObjet : [^\n]*\n\n/s', '', $letter); // pour un courriel : sans les adresses en tête
    $recipient = $recipients[$rkind] + ['address' => $rAddress];
    return ['ok' => true, 'context' => $ctx, 'act' => $act, 'what' => $what, 'asked' => $asked, 'what_label' => CL_WHATS[$what], 'relation' => $relation, 'legal' => $legal,
        'recipient' => $recipient, 'recipient_kind' => $rkind, 'recipients' => $recipients, 'objet' => $objet, 'letter' => $letter, 'mail_body' => $mailBody,
        'placeholders' => cl_placeholders(), 'whats' => CL_WHATS, 'relations' => CL_RELATIONS, 'recipient_kinds' => CL_RECIPIENTS, 'templates' => cl_default_templates()];
}

/** Ranger la lettre dans les courriers suivis (Registre de courriers, relance) ; et le rappel « l'acte devient libre ». */
function cl_file(PDO $pdo, array $in): array
{
    cl_ready($pdo);
    $b = cl_build($pdo, $in);
    $letter = cl_text($in['letter'] ?? '', CL_MAX_LETTER, true) ?: $b['letter'];
    $objet = cl_text($in['objet'] ?? '', 300) ?: $b['objet'];
    $orga = ['mairie' => 'mairie', 'ad' => 'archives', 'diocese' => 'archives', 'scec' => 'autre', 'autre' => 'autre'][$b['recipient_kind']] ?? 'autre';
    $dest = trim(explode("\n", $b['recipient']['address'])[0]) ?: $b['recipient']['label'];
    $date = cl_text($in['date_envoi'] ?? '', 10);
    if ($date !== '' && (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !checkdate((int) substr($date, 5, 2), (int) substr($date, 8, 2), (int) substr($date, 0, 4)))) { throw new LcndaBadInput('Date d’envoi incorrecte.'); }
    $delay = max(0, min(365, safe_int($in['relance_jours'] ?? 45)));
    $saved = save_courrier($pdo, ['organisme' => $orga, 'destinataire' => mb_substr($dest, 0, 200), 'objet' => $objet, 'date_envoi' => $date ?: date('Y-m-d'),
        'statut' => 'en_attente', 'relance_delai_jours' => $delay, 'notes' => $letter]);
    $cid = (int) $saved['id'];
    $mediaId = safe_int($in['media_id'] ?? 0);
    if ($mediaId) { $c = $pdo->prepare('SELECT 1 FROM media WHERE id=?'); $c->execute([$mediaId]); if (!$c->fetchColumn()) { $mediaId = 0; } }
    $reminder = 0;
    if (!empty($in['remind_open']) && !$b['legal']['public'] && $b['legal']['open_at']) {
        $pdo->prepare("INSERT INTO standalone_reminders(title,notes,reminder_mode,reminder_due_at,reminder_category) VALUES(?,?,'on',?,'Archives')")
            ->execute(['Acte de ' . CL_ACT_LABEL[$b['act']] . ' de ' . $b['context']['person']['name'] . ' : libre d’accès', 'Il devient communicable à tous (75 ans) : copie intégrale possible pour tout le monde.', $b['legal']['open_at']]);
        $reminder = (int) $pdo->lastInsertId();
    }
    $json = ['what' => $b['what'], 'asked' => $b['asked'], 'act' => $b['act'], 'relation' => $b['relation'], 'recipient' => $b['recipient_kind'], 'recipient_address' => $b['recipient']['address'],
        'recipient_email' => cl_text($in['recipient_email'] ?? '', 160), 'by_email' => !empty($in['by_email']), 'precision' => cl_text($in['precision'] ?? '', 2000, true), 'reminder_id' => $reminder, 'tool' => 'cl'];
    $pdo->prepare('UPDATE courriers SET event_id=?, person_id=?, letter_json=?, media_id=? WHERE id=?')
        ->execute([$b['context']['event']['id'] ?? null, $b['context']['person']['id'], json_encode($json, JSON_UNESCAPED_UNICODE), $mediaId ?: null, $cid]);
    return ['ok' => true, 'courrier_id' => $cid, 'reminder_id' => $reminder, 'relance_date' => courrier_compute_relance($date ?: date('Y-m-d'), $delay)];
}

/** ↶ Annuler « Ranger dans les courriers suivis » : seulement un courrier fait par cet outil, et son rappel. */
function cl_unfile(PDO $pdo, array $in): array
{
    cl_ready($pdo);
    $id = safe_int($in['courrier_id'] ?? 0);
    $s = $pdo->prepare('SELECT letter_json FROM courriers WHERE id=?'); $s->execute([$id]);
    $j = json_decode((string) $s->fetchColumn(), true);
    if (!is_array($j) || ($j['tool'] ?? '') !== 'cl') { throw new RuntimeException('Courrier introuvable.'); }
    delete_courrier($pdo, ['id' => $id]);
    $rid = (int) ($j['reminder_id'] ?? 0);
    if ($rid) { $pdo->prepare("DELETE FROM standalone_reminders WHERE id=? AND reminder_category='Archives'")->execute([$rid]); }
    return ['ok' => true];
}

/** Un courrier rangé par l'outil : sa lettre, pour la revoir. */
function cl_letter(PDO $pdo, int $id): array
{
    cl_ready($pdo);
    $s = $pdo->prepare('SELECT id, objet, destinataire, notes, date_envoi, statut, relance_date, event_id, person_id, letter_json, media_id FROM courriers WHERE id=?');
    $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException('Courrier introuvable.'); }
    $j = json_decode((string) $r['letter_json'], true);
    return ['ok' => true, 'courrier' => ['id' => (int) $r['id'], 'objet' => (string) $r['objet'], 'destinataire' => (string) $r['destinataire'], 'letter' => (string) $r['notes'], 'date_envoi' => (string) $r['date_envoi'],
        'statut' => (string) $r['statut'], 'relance_date' => (string) $r['relance_date'], 'event_id' => (int) $r['event_id'], 'person_id' => (int) $r['person_id'], 'media_id' => (int) $r['media_id'], 'data' => is_array($j) ? $j : null]];
}

function cl_ids(PDO $pdo): array
{
    cl_ready($pdo);
    return ['ids' => array_map('intval', $pdo->query("SELECT id FROM courriers WHERE letter_json<>'' ORDER BY id DESC LIMIT 5000")->fetchAll(PDO::FETCH_COLUMN))];
}

function cl_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite) {
            if ($action === 'cl_context') { cl_ready($pdo); json_response(['ok' => true, 'context' => cl_context($pdo, safe_int($_GET['person_id'] ?? 0), safe_int($_GET['event_id'] ?? 0), (string) ($_GET['act'] ?? ''))]); }
            if ($action === 'cl_letter') { json_response(cl_letter($pdo, safe_int($_GET['id'] ?? 0))); }
            if ($action === 'cl_ids') { json_response(cl_ids($pdo)); }
            if ($action === 'cl_templates') { json_response(['ok' => true, 'templates' => cl_default_templates(), 'placeholders' => cl_placeholders(), 'whats' => CL_WHATS]); }
        }
        if ($isWrite && $action === 'cl_write') {
            $op = scalar_text($payload['op'] ?? '', 'op');
            if ($op === 'build') { json_response(cl_build($pdo, $payload)); } // lecture seule
            $pdo->beginTransaction();
            try {
                $out = match ($op) { 'file' => cl_file($pdo, $payload), 'unfile' => cl_unfile($pdo, $payload), default => throw new LcndaBadInput('Opération inconnue.') };
                $pdo->commit();
            } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
            json_response($out);
        }
        json_response(['error' => 'Action inconnue.'], 400);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'introuvable') ? 404 : 422);
    }
}
