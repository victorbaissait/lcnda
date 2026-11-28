<?php
declare(strict_types=1);
/**
 * 📜 Atelier de transcription, outils en plus (2) — le côté serveur (heritage-atelier-plus2.js).
 *   GET  api.php?action=atelier_plus2&op=…        letters · letter_thumb · hand · releve · pile
 *   POST api.php?action=atelier_plus2_write {op}  summary_ai
 * ✍️ 14  letters : les lettres de référence d'un scribe (data.letters de chaque acte : un rectangle de l'image et son nom,
 *        « son s », « son d »), pour toutes les actes de la même main (data.reg.hand), sinon du même registre ; letter_thumb : l'image.
 * 🧾 19  summary_ai : « qui, quoi, quand, où » proposé par l'IA de cet ordinateur (Ollama), jamais en ligne ; à valider.
 * 📋 22  releve : le tableau des relevés collectifs (date, type d'acte, nom, prénom, père, mère, conjoint, parrain, marraine,
 *        témoins, lieu, cote, vue, notes), d'après le gabarit rempli et les personnes de l'acte ; sans les personnes vivantes ou
 *        confidentielles ni les naissances et mariages de moins de 75 ans, sauf si on le demande.
 * 🎯 21  pile : une pile d'actes (« à faire » ou un registre) : combien il en reste, le prochain.
 * 📚 23  hand : les textes des actes de la même main (le navigateur y compte les abréviations fréquentes de ce scribe).
 * Rien n'est gardé ailleurs que dans les données de l'acte (data.summary, data.letters : txp2_clean_extra). Essai : tests/test-atelier-plus2.js.
 */

require_once __DIR__ . '/atelier_idees.php';
require_once __DIR__ . '/atelier_plus2_data.php';

const TXP2_KIND_LABELS = ['apreciser' => 'À préciser', 'naissance' => 'Naissance', 'bapteme' => 'Baptême', 'mariage' => 'Mariage', 'deces' => 'Décès', 'sepulture' => 'Sépulture',
    'notarial' => 'Acte notarié', 'notoriete' => 'Acte de notoriété', 'recensement' => 'Recensement', 'militaire' => 'Registre militaire', 'lettre' => 'Lettre', 'autre' => 'Autre'];

function txp2_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        txi_ensure($pdo);
        if (!$isWrite && $action === 'atelier_plus2') {
            $op = (string) ($_GET['op'] ?? '');
            if ($op === 'letter_thumb') { txp2_letter_thumb($pdo, safe_int($_GET['act'] ?? 0), (string) ($_GET['id'] ?? '')); }
            json_response(match ($op) {
                'letters' => txp2_letters($pdo, safe_int($_GET['act_id'] ?? 0), (string) ($_GET['hand'] ?? '')),
                'hand' => txp2_hand($pdo, safe_int($_GET['act_id'] ?? 0), (string) ($_GET['hand'] ?? '')),
                'releve' => txp2_releve($pdo, (string) ($_GET['scope'] ?? 'act'), safe_int($_GET['act_id'] ?? 0), !empty($_GET['private'])),
                'pile' => txp2_pile($pdo, (string) ($_GET['pile'] ?? 'todo'), safe_int($_GET['act_id'] ?? 0), (string) ($_GET['register'] ?? '')),
                default => throw new LcndaBadInput('Opération inconnue.'),
            });
        }
        if ($isWrite && $action === 'atelier_plus2_write') {
            if (txi_kiosk()) { throw new LcndaBadInput(i18n_t('Pas en mode consultation.')); }
            json_response(match ((string) ($payload['op'] ?? '')) {
                'summary_ai' => txp2_summary_ai($payload),
                default => throw new LcndaBadInput('Opération inconnue.'),
            });
        }
        json_response(['error' => 'Action inconnue.'], 400);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'introuvable') ? 404 : 422);
    } catch (Throwable $e) {
        error_log('LCNDA atelier_plus2 : ' . $e->getMessage());
        json_response(['error' => i18n_t('Cette fonction de l’Atelier n’est pas disponible ici.'), 'unavailable' => true], 422);
    }
}

/** tous les actes : [id => row] (data décodée, sans le texte), au plus $limit */
function txp2_all_acts(PDO $pdo, int $limit = 5000): array
{
    $out = [];
    foreach ($pdo->query('SELECT id, title, kind, media_id, date_text, place, source, data_json FROM act_transcriptions ORDER BY id LIMIT ' . max(1, $limit)) as $r) {
        $r['data'] = json_decode((string) $r['data_json'], true) ?: []; unset($r['data_json']);
        $out[(int) $r['id']] = $r;
    }
    return $out;
}

/** les actes du même registre : le recueil ou le manifeste IIIF (txi_register_acts), sinon le même nom de registre (+ cote) */
function txp2_register_ids(PDO $pdo, int $actId, string $register = ''): array
{
    $ids = $actId ? txi_register_acts($pdo, $actId) : null;
    if ($ids && count($ids) > 1) { return $ids; }
    $a = $actId ? txi_act_row($pdo, $actId) : null;
    $name = txi_norm($register !== '' ? $register : (string) ($a['data']['reg']['register'] ?? ''));
    if ($name === '') { return $ids ?: ($actId ? [$actId] : []); }
    $cote = txi_norm((string) ($a['data']['reg']['cote'] ?? ''));
    $out = $actId ? [$actId] : [];
    foreach (txp2_all_acts($pdo) as $id => $r) {
        $reg = $r['data']['reg'] ?? [];
        if (txi_norm((string) ($reg['register'] ?? '')) === $name && ($cote === '' || txi_norm((string) ($reg['cote'] ?? '')) === '' || txi_norm((string) ($reg['cote'] ?? '')) === $cote)) { $out[] = $id; }
    }
    return array_values(array_unique($out));
}

/** les actes de la même main (nom de la main comparé sans accents ni majuscules) ; sans main : ceux du registre */
function txp2_hand_ids(PDO $pdo, int $actId, string $hand = ''): array
{
    $a = $actId ? txi_act_row($pdo, $actId) : null;
    $h = txi_norm($hand !== '' ? $hand : (string) ($a['data']['reg']['hand'] ?? ''));
    if ($h === '') { return txp2_register_ids($pdo, $actId); }
    $out = $actId ? [$actId] : [];
    foreach (txp2_all_acts($pdo) as $id => $r) { if (txi_norm((string) ($r['data']['reg']['hand'] ?? '')) === $h) { $out[] = $id; } }
    return array_values(array_unique($out));
}

/** GET letters {act_id, hand} → {hand, by: 'hand'|'register', items: [{act_id, id, label, title, here}]} */
function txp2_letters(PDO $pdo, int $actId, string $hand = ''): array
{
    $a = $actId ? txi_act_row($pdo, $actId) : null;
    $h = $hand !== '' ? $hand : (string) ($a['data']['reg']['hand'] ?? '');
    $ids = txp2_hand_ids($pdo, $actId, $h);
    $items = [];
    foreach ($ids as $id) {
        $r = $id === $actId && $a ? $a : txi_act_row($pdo, $id); if (!$r) { continue; }
        foreach ((array) ($r['data']['letters'] ?? []) as $l) {
            if (!is_array($l) || ($l['id'] ?? '') === '') { continue; }
            $items[] = ['act_id' => $id, 'id' => (string) $l['id'], 'label' => (string) ($l['label'] ?? ''), 'title' => (string) ($r['title'] ?? ''), 'here' => $id === $actId];
            if (count($items) >= 400) { break 2; }
        }
    }
    usort($items, static fn($x, $y) => [mb_strtolower($x['label']), $x['here'] ? 0 : 1] <=> [mb_strtolower($y['label']), $y['here'] ? 0 : 1]);
    return ['hand' => $h, 'by' => txi_norm($h) !== '' ? 'hand' : 'register', 'acts' => count($ids), 'items' => $items];
}

/** GET letter_thumb : l'image d'une lettre de référence (un peu agrandie autour), JPEG en cache */
function txp2_letter_thumb(PDO $pdo, int $actId, string $id): never
{
    $a = txi_act_row($pdo, $actId);
    $l = null; foreach ((array) ($a['data']['letters'] ?? []) as $q) { if (is_array($q) && (string) ($q['id'] ?? '') === $id && $id !== '') { $l = $q; break; } }
    $mid = $l ? (int) ($l['p'] ?? 0) ?: (int) ($a['media_id'] ?? 0) : 0;
    $s = $pdo->prepare("SELECT filename FROM media WHERE id=? AND media_type='image'"); $s->execute([$mid]); $fn = str_replace(['\\', "\0"], ['/', ''], (string) $s->fetchColumn());
    $root = realpath(MEDIA_DIR); $src = $fn !== '' && !str_contains($fn, '..') ? realpath(MEDIA_DIR . '/' . $fn) : false;
    if (!$l || !$root || !$src || !str_starts_with($src, $root . DIRECTORY_SEPARATOR) || !function_exists('imagecreatefromstring')) { http_response_code(404); exit; }
    $dir = DATA_DIR . '/atelier-thumbs'; if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
    $out = $dir . '/l' . $actId . '-' . sha1(json_encode([$l['x'], $l['y'], $l['w'], $l['h'], $fn, @filemtime($src)])) . '.jpg';
    if (!is_file($out)) {
        $info = @getimagesize($src); if (!$info || (int) $info[0] * (int) $info[1] > 120000000) { http_response_code(404); exit; }
        $im = @imagecreatefromstring((string) file_get_contents($src)); if (!$im) { http_response_code(404); exit; }
        $W = imagesx($im); $H = imagesy($im); $pad = max((float) $l['w'], (float) $l['h']) * .08;
        $x = max(0, (int) floor((float) $l['x'] - $pad)); $y = max(0, (int) floor((float) $l['y'] - $pad));
        $w = min($W - $x, (int) ceil((float) $l['w'] + 2 * $pad)); $h = min($H - $y, (int) ceil((float) $l['h'] + 2 * $pad));
        if ($w < 2 || $h < 2) { http_response_code(404); exit; }
        $th = 96; $tw = (int) max(1, min(320, round($w * $th / $h))); if ($tw === 320) { $th = (int) max(1, round($h * 320 / $w)); }
        $t = imagecreatetruecolor($tw, $th); imagecopyresampled($t, $im, 0, 0, $x, $y, $tw, $th, $w, $h);
        imagejpeg($t, $out, 86);
    }
    header('Content-Type: image/jpeg'); header('Cache-Control: private, max-age=3600');
    readfile($out); exit;
}

/** GET hand {act_id, hand} → {hand, acts, texts: [le texte de chaque acte de la main, coupé]} : le navigateur compte ses abréviations */
function txp2_hand(PDO $pdo, int $actId, string $hand = ''): array
{
    $a = $actId ? txi_act_row($pdo, $actId) : null;
    $h = $hand !== '' ? $hand : (string) ($a['data']['reg']['hand'] ?? '');
    $ids = txp2_hand_ids($pdo, $actId, $h);
    $texts = []; $letters = 0;
    foreach (array_slice($ids, 0, 80) as $id) { $r = txi_act_row($pdo, $id); if (!$r) { continue; } $texts[] = mb_substr((string) $r['body'], 0, 6000); $letters += count((array) ($r['data']['letters'] ?? [])); }
    return ['hand' => $h, 'by' => txi_norm($h) !== '' ? 'hand' : 'register', 'acts' => count($ids), 'letters' => $letters, 'texts' => $texts];
}

/* ═════════ 📋 22. Le relevé pour l'indexation collective ═════════ */

/** « Pierre MAZAUD, laboureur, 40 ans » → [nom, prénom] : le nom, ce qui est en capitales (sinon le dernier mot) */
function txp2_split_name(string $v): array
{
    $v = trim((string) preg_replace('/\s+/u', ' ', explode(',', explode(';', $v)[0])[0]));
    $v = trim((string) preg_replace('/^(?:feue?|défunte?|defunte?|sieur|sr|messire|maître|maitre|me|dame|demoiselle|honnête|honnete)\s+/iu', '', $v));
    if ($v === '') { return ['', '']; }
    $w = explode(' ', $v); $sur = []; $giv = [];
    foreach ($w as $x) { if (mb_strlen($x) >= 2 && preg_match('/^[\p{Lu}][\p{Lu}\'’-]+$/u', $x)) { $sur[] = $x; } elseif (!$sur) { $giv[] = $x; } else { $sur[] = $x; } }
    if (!$sur && count($giv) > 1) { $sur = [array_pop($giv)]; }
    return [implode(' ', $sur), implode(' ', $giv)];
}

/** le premier nom d'une case (« Pierre MAZAUD, laboureur ») ; plusieurs (« A ; B ») gardés pour les témoins */
function txp2_person_text(string $v): string { return trim((string) preg_replace('/\s+/u', ' ', $v)); }

/** une ligne du relevé pour un acte : [colonne => valeur] */
function txp2_releve_row(array $a): array
{
    $d = $a['data'] ?? []; $kind = (string) ($a['kind'] ?? '');
    $f = []; $gb = is_array($d['gabarit'] ?? null) ? $d['gabarit'] : [];
    foreach ((array) ($gb['fields'] ?? []) as $k => $x) { if (is_array($x) && trim((string) ($x['v'] ?? '')) !== '') { $f[(string) $k] = txp2_person_text((string) $x['v']); } }
    $people = array_values(array_filter((array) ($d['people'] ?? []), 'is_array'));
    $role = static function (array $roles) use ($people): array { return array_values(array_filter(array_map(static fn($p) => in_array((string) ($p['role'] ?? ''), $roles, true) ? txp2_person_text((string) ($p['name'] ?? '')) : '', $people))); };
    $pick = static function (array $keys, array $roles) use ($f, $role): string { foreach ($keys as $k) { if (($f[$k] ?? '') !== '') { return $f[$k]; } } return $role($roles)[0] ?? ''; };
    $isM = in_array($kind, ['mariage'], true);
    $main = $pick($isM ? ['epoux'] : ['enfant', 'defunt', 'personne'], $isM ? ['epoux', 'sujet'] : ['sujet', 'defunt']);
    [$nom, $prenom] = txp2_split_name($main);
    $pere = $pick(['pere'], ['pere']); $mere = $pick(['mere'], ['mere']);
    $parents = $f['parents_epoux'] ?? ($f['parents'] ?? '');
    if ($parents !== '' && $pere === '' && $mere === '') { $pp = preg_split('/\s*(?:;|\bet\b)\s*/u', $parents) ?: []; $pere = trim((string) ($pp[0] ?? '')); $mere = trim((string) ($pp[1] ?? '')); }
    $conj = $pick($isM ? ['epouse'] : ['conjoint', 'famille'], $isM ? ['epouse', 'conjoint'] : ['conjoint']);
    $tem = $f['temoins'] ?? implode(' ; ', $role(['temoin']));
    $reg = is_array($d['reg'] ?? null) ? $d['reg'] : [];
    $vue = !empty($reg['view']) ? ((string) $reg['view'] . (!empty($reg['total']) ? ' / ' . $reg['total'] : '')) : '';
    $sum = is_array($d['summary'] ?? null) ? $d['summary'] : [];
    $notes = implode(' · ', array_filter([$isM && ($f['parents_epouse'] ?? '') !== '' ? i18n_t('Parents de l’épouse : {p}', ['p' => $f['parents_epouse']]) : '',
        implode(' — ', array_filter([(string) ($sum['who'] ?? ''), (string) ($sum['what'] ?? ''), (string) ($sum['when'] ?? ''), (string) ($sum['where'] ?? '')]))]));
    return ['date' => (string) ($a['date_text'] ?? ''), 'type' => i18n_t(TXP2_KIND_LABELS[$kind] ?? 'Autre'), 'nom' => $nom, 'prenom' => $prenom, 'pere' => $pere, 'mere' => $mere,
        'conjoint' => $conj, 'parrain' => $pick(['parrain'], ['parrain']), 'marraine' => $pick(['marraine'], ['marraine']), 'temoins' => $tem,
        'lieu' => (string) ($a['place'] ?? ''), 'cote' => (string) ($reg['cote'] ?? ''), 'vue' => $vue, 'notes' => $notes, 'act_id' => (int) ($a['id'] ?? 0)];
}

/** une naissance ou un mariage de moins de 75 ans (Code du patrimoine, art. L213-2 : délai de communication des actes d'état civil) */
function txp2_recent(array $a, int $year): bool
{
    if (!in_array((string) ($a['kind'] ?? ''), ['naissance', 'bapteme', 'mariage', 'apreciser', 'autre', 'notoriete'], true)) { return false; }
    if (!preg_match_all('/\b(1[5-9]\d{2}|20\d{2})\b/', (string) ($a['date_text'] ?? '') . ' ' . (string) ($a['title'] ?? ''), $m)) { return false; }
    return max(array_map('intval', $m[1])) > $year - 75;
}

/**
 * GET releve {scope: act|register|all, act_id, private} → {columns: [[clé, nom]], rows: [{…}], hidden: {private, recent}}
 * private : garder aussi les actes où une personne reliée est vivante ou confidentielle, et les actes récents (le choix de la personne).
 */
function txp2_releve(PDO $pdo, string $scope, int $actId, bool $private): array
{
    $ids = match ($scope) { 'register' => txp2_register_ids($pdo, $actId), 'all' => array_keys(txp2_all_acts($pdo)), default => $actId ? [$actId] : [] };
    $hiddenP = []; foreach ($pdo->query("SELECT id FROM persons WHERE COALESCE(is_private,0)=1 OR living_status='living'") as $r) { $hiddenP[(int) $r['id']] = true; }
    $rows = []; $nPriv = 0; $nRecent = 0; $year = (int) date('Y');
    foreach (array_slice($ids, 0, 5000) as $id) {
        $a = txi_act_row($pdo, (int) $id); if (!$a) { continue; }
        $priv = false; foreach ((array) ($a['data']['people'] ?? []) as $p) { if (is_array($p) && isset($hiddenP[(int) ($p['person_id'] ?? 0)])) { $priv = true; break; } }
        $recent = txp2_recent($a, $year);
        if (!$private && ($priv || $recent)) { if ($priv) { $nPriv++; } else { $nRecent++; } continue; }
        $rows[] = txp2_releve_row($a);
    }
    $cols = [['date', 'Date'], ['type', 'Type d’acte'], ['nom', 'Nom'], ['prenom', 'Prénom'], ['pere', 'Père'], ['mere', 'Mère'], ['conjoint', 'Conjoint'], ['parrain', 'Parrain'], ['marraine', 'Marraine'],
        ['temoins', 'Témoins'], ['lieu', 'Lieu'], ['cote', 'Cote'], ['vue', 'Vue'], ['notes', 'Notes']];
    return ['columns' => array_map(static fn($c) => [$c[0], i18n_t($c[1])], $cols), 'rows' => $rows, 'hidden' => ['private' => $nPriv, 'recent' => $nRecent], 'total' => count($ids)];
}

/* ═════════ 🎯 21. La pile d'actes du petit objectif ═════════ */

/** GET pile {pile: todo|register, act_id, register} → {total, left, next_id} (le prochain : le premier pas encore relu ni fini, autre que l'acte ouvert) */
function txp2_pile(PDO $pdo, string $pile, int $actId, string $register = ''): array
{
    $all = txp2_all_acts($pdo);
    $ids = $pile === 'register' ? txp2_register_ids($pdo, $actId, $register) : array_keys($all);
    $left = []; $total = 0;
    foreach ($ids as $id) {
        $r = $all[$id] ?? null; if (!$r) { continue; }
        $total++; $st = (string) ($r['data']['status'] ?? '');
        if (!in_array($st, ['checked', 'done'], true)) { $left[] = (int) $id; }
    }
    sort($left);
    $next = 0; foreach ($left as $id) { if ($id !== $actId) { $next = $id; break; } }
    return ['pile' => $pile === 'register' ? 'register' : 'todo', 'total' => $total, 'left' => count($left), 'next_id' => $next];
}

/* ═════════ 🧾 19. Le résumé proposé par l'IA de cet ordinateur ═════════ */

/** POST summary_ai {text, kind, date, place, lang, model} → {who, what, when, where, model} : seulement Ollama (127.0.0.1), à valider */
function txp2_summary_ai(array $d): array
{
    $text = mb_substr(str_replace("\r", '', (string) ($d['text'] ?? '')), 0, 12000);
    if (trim($text) === '') { throw new LcndaBadInput(i18n_t('Le texte est vide : lis ou écris d’abord l’acte.')); }
    require_once __DIR__ . '/transcription_actes.php';
    $st = tx_deep_status();
    if (!$st['running']) { throw new LcndaBadInput(i18n_t('L’IA de cet ordinateur (Ollama) n’est pas lancée : écris le résumé à la main, ou ouvre-la.')); }
    $model = (string) ($d['model'] ?? '');
    $present = array_values(array_filter(array_merge($st['models'], $st['others'] ?? []), static fn($m) => !empty($m['present'])));
    if ($model === '' || !in_array($model, array_column($present, 'tag'), true)) { $model = (string) (array_values(array_filter($present, static fn($m) => !empty($m['recommended'])))[0]['tag'] ?? $present[0]['tag'] ?? ''); }
    if ($model === '' || !tx_deep_tag_ok($model)) { throw new LcndaBadInput(i18n_t('Aucun modèle d’IA installé pour la lecture approfondie.')); }
    $prompt = "Tu résumes un acte ancien (sorte : " . txp2_str($d['kind'] ?? '', 40) . " ; date notée : " . txp2_str($d['date'] ?? '', 80) . " ; lieu noté : " . txp2_str($d['place'] ?? '', 120) . ").\n"
        . "Réponds seulement par un objet JSON : {\"who\": \"…\", \"what\": \"…\", \"when\": \"…\", \"where\": \"…\"}.\n"
        . "- who : les personnes principales (noms tels qu'écrits) ; what : ce qui se passe (baptême, mariage, sépulture, vente…) ;\n"
        . "- when : la date de l'acte ; where : la paroisse ou la commune.\n"
        . "- Chaque valeur en une courte ligne, en français ; ce que le texte ne dit pas : \"\". N'invente rien.\n\nTexte de l'acte :\n" . $text;
    $out = '';
    $r = tx_deep_http('POST', '/api/chat', ['model' => $model, 'stream' => true, 'format' => 'json', 'messages' => [['role' => 'user', 'content' => $prompt]], 'options' => ['temperature' => 0]], 180,
        static function (array $j) use (&$out) { $out .= (string) ($j['message']['content'] ?? ''); return true; });
    if (!$r['ok'] && trim($out) === '') { throw new RuntimeException(i18n_t('L’IA n’a pas répondu.')); }
    $j = json_decode(trim($out), true);
    if (!is_array($j) && preg_match('/\{.*\}/su', $out, $m)) { $j = json_decode($m[0], true); }
    if (!is_array($j)) { throw new RuntimeException(i18n_t('La réponse de l’IA n’a pas pu être lue : écris le résumé à la main.')); }
    $res = ['model' => $model];
    foreach (['who', 'what', 'when', 'where'] as $k) { $res[$k] = txp2_str(is_scalar($j[$k] ?? '') ? $j[$k] ?? '' : '', 240); }
    return $res;
}
