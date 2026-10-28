<?php
declare(strict_types=1);

/**
 * Base propre, contexte et modularité (structure n°12, lib/migrations.php) :
 *  - actes à demander à la mairie (trop récents pour être en ligne) et date d'ouverture au public ;
 *  - épidémies, guerres, hivers terribles autour des dates de la famille ;
 *  - copie chiffrée confiée à un cousin (et coffre des copies des cousins) ;
 *  - âges au mariage, écarts entre naissances, alertes ;
 *  - harmoniser les variantes d'écriture, repérer les lieux mal placés, taille des ancêtres ;
 *  - parcours de résistant ; éditeur de blocs ; comparaison de deux fiches avant fusion.
 */

/* ─── 📮 Actes à demander (trop récents pour être en ligne) ──────────── */

/**
 * Délais : actes de naissance et de mariage communicables à tous 75 ans après leur date (code du patrimoine,
 * art. L213-2) ; avant, copie intégrale réservée à la personne, ses ascendants, descendants, conjoint (sinon extrait
 * sans filiation). Actes de décès : communicables à tous tout de suite. Mise en ligne par les archives : souvent
 * après 100 ans ou plus, variable selon les départements.
 */
const ACT_KINDS = ['BIRT' => 'naissance', 'MARR' => 'mariage', 'DEAT' => 'décès'];

function recent_acts(PDO $pdo): array
{
    $now = (int) date('Y');
    $rows = $pdo->query("SELECT e.id, e.date_text, e.year, e.person_id, e.family_id, t.gedcom_tag, t.label, pl.name AS place, pl.county, pl.country, pl.admin4_code,
            (SELECT count(*) FROM media_links ml WHERE ml.entity_type='event' AND ml.entity_id=e.id) AS media_count,
            (SELECT count(*) FROM source_links sl WHERE sl.entity_type='event' AND sl.entity_id=e.id) AS source_count,
            (SELECT c.id FROM courriers c WHERE c.event_id=e.id ORDER BY c.id DESC LIMIT 1) AS courrier_id,
            (SELECT c.statut FROM courriers c WHERE c.event_id=e.id ORDER BY c.id DESC LIMIT 1) AS courrier_statut
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE t.gedcom_tag IN ('BIRT','MARR','DEAT') AND e.year IS NOT NULL AND e.year > " . ($now - 100) . " AND e.year <= {$now}
        ORDER BY e.year DESC")->fetchAll();
    $ids = [];
    foreach ($rows as $r) {
        if ($r['person_id']) { $ids[] = (int) $r['person_id']; }
        if ($r['family_id']) { $f = $pdo->query('SELECT partner1_id, partner2_id FROM families WHERE id=' . (int) $r['family_id'])->fetch(); if ($f) { $ids[] = (int) $f['partner1_id']; $ids[] = (int) $f['partner2_id']; } }
    }
    $people = collection_people($pdo, $ids);
    $out = [];
    foreach ($rows as $r) {
        $tag = $r['gedcom_tag'];
        $who = [];
        if ($r['person_id']) { $who[] = $people[(int) $r['person_id']] ?? null; }
        else { $f = $pdo->query('SELECT partner1_id, partner2_id FROM families WHERE id=' . (int) $r['family_id'])->fetch(); if ($f) { $who[] = $people[(int) $f['partner1_id']] ?? null; $who[] = $people[(int) $f['partner2_id']] ?? null; } }
        $who = array_values(array_filter($who));
        if (!$who) { continue; }
        $exact = function_exists('exact_date') ? exact_date((string) $r['date_text']) : null;
        $openAt = $tag === 'DEAT' ? null : ($exact ? date('Y-m-d', strtotime($exact . ' +75 years')) : (((int) $r['year']) + 75) . '-12-31');
        $public = $tag === 'DEAT' || ($openAt !== null && $openAt <= date('Y-m-d'));
        $out[] = [
            'event_id' => (int) $r['id'], 'kind' => ACT_KINDS[$tag], 'tag' => $tag, 'date_text' => $r['date_text'] ?: (string) $r['year'], 'year' => (int) $r['year'],
            'place' => $r['place'], 'county' => $r['county'], 'people' => $who, 'has_copy' => ((int) $r['media_count'] + (int) $r['source_count']) > 0,
            'open_at' => $openAt, 'public' => $public, 'online_from' => ((int) $r['year']) + 100,
            'courrier_id' => $r['courrier_id'] ? (int) $r['courrier_id'] : null, 'courrier_statut' => $r['courrier_statut'],
        ];
    }
    return $out;
}

/** Lettre de demande prête à envoyer à la mairie (copie intégrale si possible, sinon extrait). */
function act_request_letter(PDO $pdo, int $eventId, string $requester, string $relation): array
{
    $act = null;
    foreach (recent_acts($pdo) as $a) { if ($a['event_id'] === $eventId) { $act = $a; break; } }
    if (!$act) { throw new RuntimeException('Acte introuvable (ou de plus de 100 ans : il est sans doute en ligne aux archives).'); }
    $names = implode(' et ', array_map(static fn($p) => trim(($p['first_name'] ?? '') . ' ' . ($p['last_name'] ?? '')), $act['people']));
    $parents = '';
    if ($act['tag'] === 'BIRT') {
        $par = collection_people($pdo, h_parents($pdo, (int) $act['people'][0]['id']));
        if ($par) { $parents = ', ' . (count($par) > 1 ? 'enfant de ' : 'enfant de ') . implode(' et de ', array_map(static fn($p) => trim($p['first_name'] . ' ' . $p['last_name']), $par)); }
    }
    $restricted = !$act['public'];
    $kind = $act['kind'];
    $what = $restricted && in_array($relation, ['', 'autre'], true) ? "un extrait sans filiation de l’acte de {$kind}" : "une copie intégrale de l’acte de {$kind}";
    $place = $act['place'] ?: '…';
    $g = (string) ($act['people'][0]['gender'] ?? '');
    $e = $g === 'female' ? 'e' : ($g === 'male' ? '' : '(e)');
    $verb = match ($act['tag']) { 'BIRT' => 'né' . $e, 'MARR' => 'mariés', default => 'décédé' . $e };
    $date = $act['date_text'];
    $relText = ['' => '', 'moi' => 'Il s’agit de mon propre acte.', 'descendant' => 'Je suis son descendant direct (petit-enfant, arrière-petit-enfant…), ce qui m’autorise à obtenir une copie intégrale.', 'ascendant' => 'Je suis son ascendant direct.', 'conjoint' => 'Je suis son conjoint.', 'autre' => ''][$relation] ?? '';
    $objet = 'Demande ' . ($restricted && in_array($relation, ['', 'autre'], true) ? 'd’extrait' : 'de copie intégrale') . " d’acte de {$kind} — {$names} ({$date})";
    $body = implode("\n", array_filter([
        ($requester !== '' ? $requester : '[Prénom Nom]') . "\n[Adresse]\n[Courriel / téléphone]",
        '',
        "Service de l’état civil\nMairie de {$place}",
        '',
        'Objet : ' . $objet,
        '',
        'Madame, Monsieur,',
        '',
        "Dans le cadre de recherches généalogiques, je vous serais reconnaissant(e) de bien vouloir m’adresser {$what} de {$names}{$parents}, {$verb} le {$date} à {$place}.",
        $relText,
        $restricted ? 'Je joins la copie de ma pièce d’identité' . (in_array($relation, ['descendant', 'ascendant'], true) ? ' et les actes établissant ma filiation avec la personne concernée.' : '.') : '',
        'Vous trouverez ci-joint une enveloppe timbrée à mon adresse pour la réponse.',
        '',
        'Je vous remercie par avance et vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.',
        '',
        ($requester !== '' ? $requester : '[Signature]'),
    ], static fn($l) => $l !== null));
    return ['objet' => $objet, 'destinataire' => 'Mairie de ' . $place . ($act['county'] ? ' (' . $act['county'] . ')' : ''), 'letter' => $body, 'act' => $act];
}

/** Crée le courrier (Registre de courriers) et, si l'acte n'est pas encore public, un rappel à sa date d'ouverture. */
function create_act_request(PDO $pdo, array $data): array
{
    $eventId = safe_int($data['event_id'] ?? 0);
    $l = act_request_letter($pdo, $eventId, safe_text($data['requester'] ?? ''), safe_text($data['relation'] ?? ''));
    $saved = save_courrier($pdo, ['organisme' => 'mairie', 'destinataire' => $l['destinataire'], 'objet' => $l['objet'], 'date_envoi' => safe_text($data['date_envoi'] ?? '') ?: date('Y-m-d'),
        'statut' => safe_text($data['statut'] ?? 'en_attente') ?: 'en_attente', 'relance_delai_jours' => 45, 'notes' => $l['letter']]);
    $courrierId = (int) ($saved['id'] ?? $pdo->lastInsertId());
    try { $pdo->prepare('UPDATE courriers SET event_id=? WHERE id=?')->execute([$eventId, $courrierId]); } catch (Throwable $_) {}
    $reminder = false;
    if (!$l['act']['public'] && !empty($data['remind_open']) && $l['act']['open_at']) {
        $names = implode(' et ', array_map(static fn($p) => trim($p['first_name'] . ' ' . $p['last_name']), $l['act']['people']));
        $pdo->prepare("INSERT INTO standalone_reminders(title,notes,reminder_mode,reminder_due_at,reminder_category) VALUES(?,?,'on',?,'Archives')")
            ->execute(['Acte de ' . $l['act']['kind'] . ' de ' . $names . ' : ouvert au public', 'L’acte du ' . $l['act']['date_text'] . ' à ' . ($l['act']['place'] ?: '?') . ' devient communicable à tous (75 ans). Copie intégrale possible pour tous.', $l['act']['open_at']]);
        $reminder = true;
    }
    return ['courrier_id' => $courrierId, 'reminder' => $reminder];
}

function act_open_reminder(PDO $pdo, array $data): array
{
    $eventId = safe_int($data['event_id'] ?? 0);
    foreach (recent_acts($pdo) as $a) {
        if ($a['event_id'] !== $eventId || $a['public'] || !$a['open_at']) { continue; }
        $names = implode(' et ', array_map(static fn($p) => trim($p['first_name'] . ' ' . $p['last_name']), $a['people']));
        $pdo->prepare("INSERT INTO standalone_reminders(title,notes,reminder_mode,reminder_due_at,reminder_category) VALUES(?,?,'on',?,'Archives')")
            ->execute(['Acte de ' . $a['kind'] . ' de ' . $names . ' : ouvert au public', 'L’acte du ' . $a['date_text'] . ' à ' . ($a['place'] ?: '?') . ' devient communicable à tous.', $a['open_at']]);
        return ['ok' => true, 'date' => $a['open_at']];
    }
    throw new RuntimeException('Cet acte est déjà ouvert au public.');
}

/* ─── 🌡️ Épidémies, guerres, hivers terribles ────────────────────────── */

/* Les crises [début, fin, catégorie, titre, portée (France, départements « 13,83 » ou régions), description] viennent de la liste
 * unique « Le monde autour » (assets/data/monde-autour.json, événements marqués crisis) : historical_crises(), lib/monde_autour.php. */

/** Code du département d'un lieu (par son code INSEE, sinon par son nom de département). */
function crisis_in_scope(string $scope, array $place): bool
{
    if ($scope === 'France') { return in_array(mb_strtolower((string) ($place['country'] ?? 'france')), ['france', ''], true); }
    $code = substr((string) ($place['admin4_code'] ?? ''), 0, 2);
    foreach (explode(',', $scope) as $s) {
        $s = trim($s);
        if (ctype_digit($s) && $code === $s) { return true; }
        if (!ctype_digit($s) && $s !== '' && (stripos((string) ($place['state'] ?? ''), $s) !== false || stripos((string) ($place['county'] ?? ''), $s) !== false)) { return true; }
    }
    return false;
}

function historical_context(PDO $pdo): array
{
    $deaths = $pdo->query("SELECT e.person_id, e.year, e.date_text, t.gedcom_tag, pl.name AS place, pl.county, pl.state, pl.country, pl.admin4_code
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE t.gedcom_tag IN ('DEAT','BURI') AND e.year IS NOT NULL AND e.person_id IS NOT NULL ORDER BY t.gedcom_tag='DEAT' DESC")->fetchAll();
    $byPerson = [];
    foreach ($deaths as $d) { $byPerson[(int) $d['person_id']] ??= $d; }
    $deaths = array_values($byPerson);
    $byYear = [];
    foreach ($deaths as $d) { $byYear[(int) $d['year']] = ($byYear[(int) $d['year']] ?? 0) + 1; }
    ksort($byYear);
    $people = collection_people($pdo, array_keys($byPerson));
    $crises = [];
    $min = $byYear ? min(array_keys($byYear)) : 0; $max = $byYear ? max(array_keys($byYear)) : 0;
    foreach (historical_crises() as [$from, $to, $cat, $title, $scope, $desc]) {
        if ($to < $min - 1 || $from > $max + 1) { continue; }
        $victims = [];
        foreach ($deaths as $d) {
            if ((int) $d['year'] < $from || (int) $d['year'] > $to) { continue; }
            if (!crisis_in_scope($scope, $d)) { continue; }
            $p = $people[(int) $d['person_id']] ?? null;
            if ($p) { $victims[] = ['person' => $p, 'date' => $d['date_text'] ?: $d['year'], 'place' => $d['place'], 'age' => $p['birth_year'] ? ((int) $d['year'] - (int) $p['birth_year']) : null]; }
        }
        // Mortalité « normale » de la famille : moyenne des 10 années avant
        $before = 0; for ($y = $from - 10; $y < $from; $y++) { $before += $byYear[$y] ?? 0; }
        $normal = $before / 10;
        $years = $to - $from + 1;
        $crises[] = ['from' => $from, 'to' => $to, 'category' => $cat, 'title' => $title, 'scope' => $scope, 'description' => $desc, 'victims' => $victims,
            'excess' => $normal > 0 ? round(count($victims) / ($normal * $years), 1) : null];
    }
    // Années de forte mortalité de la famille sans explication connue
    $spikes = [];
    foreach ($byYear as $y => $n) {
        $around = []; for ($k = $y - 5; $k <= $y + 5; $k++) { if ($k !== $y) { $around[] = $byYear[$k] ?? 0; } }
        $avg = array_sum($around) / count($around);
        if ($n >= 3 && $n >= 2.5 * max(0.5, $avg)) {
            $explained = array_values(array_filter(array_map(static fn($c) => $y >= $c[0] && $y <= $c[1] ? $c[3] : null, historical_crises())));
            $spikes[] = ['year' => $y, 'deaths' => $n, 'usual' => round($avg, 1), 'explained' => $explained];
        }
    }
    return ['by_year' => $byYear, 'crises' => $crises, 'spikes' => $spikes];
}

/* ─── 🔐 Copie chiffrée confiée à un cousin ──────────────────────────── */

const VAULT_MAGIC = "LCNDA-COFFRE-1\n";   // anciennes copies : PBKDF2-SHA256 à 200 000 tours (encore lues)
const VAULT_MAGIC2 = "LCNDA-COFFRE-2\n";  // depuis 0.4.3 : Argon2id (ou PBKDF2 à 600 000 tours sans sodium), paramètres dans l'en-tête signé
const VAULT_PBKDF2_V2 = 600000;

/** Réglages de dérivation pour une nouvelle copie : Argon2id si PHP a sodium (Mac, Linux), sinon PBKDF2 renforcé (Windows). */
function vault_new_kdf(): array
{
    if (function_exists('sodium_crypto_pwhash') && defined('SODIUM_CRYPTO_PWHASH_ALG_ARGON2ID13')) {
        return ['kdf' => 'argon2id', 'ops' => SODIUM_CRYPTO_PWHASH_OPSLIMIT_MODERATE, 'mem' => SODIUM_CRYPTO_PWHASH_MEMLIMIT_MODERATE];
    }
    return ['kdf' => 'pbkdf2-sha256', 'iter' => VAULT_PBKDF2_V2];
}

/** Clés de chiffrement et de signature. Seuls des réglages connus sont acceptés (une copie trafiquée ne peut ni affaiblir ni bloquer le calcul). */
function vault_keys(string $password, string $salt, array $kdf = ['kdf' => 'pbkdf2-sha256', 'iter' => 200000]): array
{
    if (($kdf['kdf'] ?? '') === 'argon2id') {
        if (!function_exists('sodium_crypto_pwhash')) { throw new RuntimeException('Cette copie demande Argon2id, que le PHP de cet ordinateur ne connaît pas : ouvre-la sur un Mac ou sous Linux.'); }
        $ops = (int) ($kdf['ops'] ?? 0); $mem = (int) ($kdf['mem'] ?? 0);
        if ($ops < 2 || $ops > 10 || $mem < 64 * 1024 * 1024 || $mem > 1024 * 1024 * 1024 || strlen($salt) !== SODIUM_CRYPTO_PWHASH_SALTBYTES) { throw new RuntimeException('Copie chiffrée abîmée.'); }
        $k = sodium_crypto_pwhash(64, $password, $salt, $ops, $mem, SODIUM_CRYPTO_PWHASH_ALG_ARGON2ID13);
    } else {
        $iter = (int) ($kdf['iter'] ?? 0);
        if (!in_array($iter, [200000, VAULT_PBKDF2_V2], true)) { throw new RuntimeException('Copie chiffrée abîmée.'); }
        $k = hash_pbkdf2('sha256', $password, $salt, $iter, 64, true);
    }
    return [substr($k, 0, 32), substr($k, 32, 32)];
}

/** Compteur AES-CTR avancé de $blocks blocs de 16 octets (grand-boutiste). */
function vault_ctr(string $iv, int $blocks): string
{
    $bytes = array_values(unpack('C*', $iv));
    $carry = $blocks;
    for ($i = 15; $i >= 0 && $carry > 0; $i--) { $sum = $bytes[$i] + ($carry & 0xFF); $bytes[$i] = $sum & 0xFF; $carry = ($carry >> 8) + ($sum >> 8); }
    return pack('C*', ...$bytes);
}

/** Écrit tout ou s'arrête (disque plein…) : une copie à moitié écrite ne doit jamais passer pour bonne. */
function vault_write($fh, string $data): void
{
    $len = strlen($data); $done = 0;
    while ($done < $len) {
        $w = fwrite($fh, $done ? substr($data, $done) : $data);
        if ($w === false || $w === 0) { throw new RuntimeException('Écriture impossible (disque plein ?) : la copie n’a pas été faite.'); }
        $done += $w;
    }
}

/** Chiffre un fichier par morceaux (AES-256-CTR + HMAC-SHA256) : ne charge jamais toute la base en mémoire. */
function vault_encrypt_file(string $src, string $dest, string $password, array $meta): void
{
    $kdf = vault_new_kdf();
    $salt = random_bytes($kdf['kdf'] === 'argon2id' ? SODIUM_CRYPTO_PWHASH_SALTBYTES : 16); $iv = random_bytes(16);
    [$enc, $mac] = vault_keys($password, $salt, $kdf);
    $header = json_encode($meta + ['salt' => base64_encode($salt), 'iv' => base64_encode($iv), 'kdf_params' => $kdf, 'cipher' => 'aes-256-ctr+hmac-sha256'], JSON_UNESCAPED_UNICODE);
    $in = @fopen($src, 'rb'); $out = @fopen($dest, 'wb');
    if (!$in || !$out) { throw new RuntimeException('Fichier temporaire impossible à créer.'); }
    try {
        $h = hash_init('sha256', HASH_HMAC, $mac);
        $head = VAULT_MAGIC2 . $header . "\n";
        vault_write($out, $head); hash_update($h, $head);
        $chunk = 1 << 20; $n = 0;
        while (!feof($in)) {
            $plain = fread($in, $chunk);
            if ($plain === false) { throw new RuntimeException('Lecture de la base impossible.'); }
            if ($plain === '') { break; }
            $c = openssl_encrypt($plain, 'aes-256-ctr', $enc, OPENSSL_RAW_DATA, vault_ctr($iv, $n * ($chunk >> 4)));
            if ($c === false) { throw new RuntimeException('Chiffrement impossible.'); }
            vault_write($out, $c); hash_update($h, $c); $n++;
        }
        vault_write($out, hash_final($h, true));
        if (!fflush($out)) { throw new RuntimeException('Écriture impossible (disque plein ?) : la copie n’a pas été faite.'); }
    } finally { fclose($in); fclose($out); }
}

function vault_read_header(string $path): array
{
    $fh = @fopen($path, 'rb');
    if (!$fh) { throw new RuntimeException('Fichier illisible.'); }
    $magic = fread($fh, strlen(VAULT_MAGIC));
    if ($magic !== VAULT_MAGIC && $magic !== VAULT_MAGIC2) { fclose($fh); throw new RuntimeException('Ce fichier n’est pas une copie chiffrée LCNDA.'); }
    $header = json_decode((string) fgets($fh, 65536), true);
    fclose($fh);
    if (!is_array($header)) { throw new RuntimeException('Copie chiffrée abîmée.'); }
    $header['_version'] = $magic === VAULT_MAGIC2 ? 2 : 1;
    return $header;
}

/** Vérifie le sceau (HMAC) de tout le fichier ; rend [clé de chiffrement, iv, début du corps, taille du corps, en-tête]. */
function vault_verify(string $src, string $password): array
{
    $header = vault_read_header($src);
    if (!is_string($header['salt'] ?? null) || !is_string($header['iv'] ?? null)) { throw new RuntimeException('Copie chiffrée abîmée.'); }
    $kdf = $header['_version'] === 2 ? (is_array($header['kdf_params'] ?? null) ? $header['kdf_params'] : []) : ['kdf' => 'pbkdf2-sha256', 'iter' => 200000];
    [$enc, $mac] = vault_keys($password, (string) base64_decode($header['salt'], true), $kdf);
    $iv = (string) base64_decode($header['iv'], true);
    if (strlen($iv) !== 16) { throw new RuntimeException('Copie chiffrée abîmée.'); }
    $size = filesize($src);
    $fh = fopen($src, 'rb');
    $magic = fread($fh, strlen(VAULT_MAGIC)); $line = fgets($fh, 65536);
    $headLen = strlen($magic) + strlen((string) $line);
    $bodyLen = $size - $headLen - 32;
    if ($bodyLen < 0) { fclose($fh); throw new RuntimeException('Copie chiffrée incomplète.'); }
    $h = hash_init('sha256', HASH_HMAC, $mac);
    hash_update($h, $magic . $line);
    $left = $bodyLen;
    while ($left > 0) { $c = fread($fh, min(1 << 20, $left)); if ($c === '' || $c === false) { fclose($fh); throw new RuntimeException('Copie chiffrée incomplète.'); } hash_update($h, $c); $left -= strlen($c); }
    $tag = fread($fh, 32);
    fclose($fh);
    if (!hash_equals(hash_final($h, true), (string) $tag)) { throw new RuntimeException('Mot de passe incorrect, ou fichier abîmé.'); }
    return [$enc, $iv, $headLen, $bodyLen, $header];
}

function vault_decrypt_file(string $src, string $dest, string $password): array
{
    // 1. Vérifier le sceau avant d'écrire quoi que ce soit (mauvais mot de passe ou fichier abîmé)
    [$enc, $iv, $headLen, $bodyLen, $header] = vault_verify($src, $password);
    // 2. Déchiffrer
    $fh = fopen($src, 'rb'); fseek($fh, $headLen);
    $out = @fopen($dest, 'wb');
    if (!$out) { fclose($fh); throw new RuntimeException('Fichier de sortie impossible à créer.'); }
    try {
        $chunk = 1 << 20; $n = 0; $left = $bodyLen;
        while ($left > 0) {
            $c = fread($fh, min($chunk, $left)); $left -= strlen($c);
            vault_write($out, (string) openssl_decrypt($c, 'aes-256-ctr', $enc, OPENSSL_RAW_DATA, vault_ctr($iv, $n * ($chunk >> 4)))); $n++;
        }
    } finally { fclose($fh); fclose($out); }
    unset($header['_version']);
    return $header;
}

/** Identifiant au hasard de cette base (dans l'en-tête des copies) : le coffre d'un cousin range les copies par base, pas par nom. */
function vault_base_uid(PDO $pdo): string
{
    $uid = (string) (ht_setting($pdo, 'lcnda-vault-base-uid', ['uid' => ''])['uid'] ?? '');
    if (!preg_match('/^[a-f0-9]{32}$/', $uid)) { $uid = bin2hex(random_bytes(16)); ht_save_setting($pdo, 'lcnda-vault-base-uid', ['uid' => $uid]); }
    return $uid;
}

/** Dossier de travail privé (dans les données de l'app, pas dans le dossier temporaire partagé du système). */
function vault_tmp_dir(): string
{
    $d = DATA_DIR . '/backups/.coffre-tmp';
    if (!is_dir($d)) { @mkdir($d, 0700, true); }
    @chmod($d, 0700);
    return $d;
}

function vault_dir(): string
{
    $d = DATA_DIR . '/coffre-cousins';
    if (!is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}

/** Ma copie chiffrée, à envoyer à un cousin (téléchargement). */
function vault_export(PDO $pdo, array $data): never
{
    @set_time_limit(0);
    ignore_user_abort(true); // téléchargement annulé : on efface quand même les fichiers de travail
    $password = (string) ($data['password'] ?? '');
    if (mb_strlen($password) < 12) { json_response(['error' => 'Choisis un mot de passe d’au moins 12 caractères, par exemple une phrase de quelques mots (à garder précieusement : sans lui, la copie est illisible, même pour toi).'], 422); }
    $owner = safe_text($data['owner'] ?? '') ?: 'Généalogie';
    $cousin = safe_text($data['cousin'] ?? '');
    $base = vault_tmp_dir() . '/' . bin2hex(random_bytes(12));
    $tmp = $base . '.db'; $out = $base . '.coffre';
    try {
        $pdo->exec('PRAGMA wal_checkpoint(FULL)');
        $old = umask(0077);
        try { $pdo->exec('VACUUM main INTO ' . $pdo->quote($tmp)); } finally { umask($old); }
        @chmod($tmp, 0600);
        vault_encrypt_file($tmp, $out, $password, ['owner' => $owner, 'created_at' => date('c'), 'base_uid' => vault_base_uid($pdo), 'app' => 'LCNDA']);
        @unlink($tmp);
        vault_verify($out, $password); // relue avant d'être donnée : jamais une copie abîmée
        $pdo->prepare('INSERT INTO cousin_vault_sent(cousin, size) VALUES(?,?)')->execute([$cousin, (int) filesize($out)]);
    } catch (Throwable $e) {
        @unlink($tmp); @unlink($out);
        json_response(['error' => $e->getMessage()], $e instanceof LcndaBadInput ? 400 : 500); // un mauvais mot de passe n'est pas une panne
    }
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="copie-chiffree-' . date('Ymd') . '.lcnda-coffre"'); // pas de nom de famille dans le nom du fichier envoyé
    header('Content-Length: ' . filesize($out));
    readfile($out);
    @unlink($out);
    exit;
}

/** Ranger dans le coffre la copie reçue d'un cousin (elle reste chiffrée : illisible ici). */
function vault_store(PDO $pdo, ?array $file): never
{
    if (!$file || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) { json_response(['error' => 'Fichier non reçu.'], 422); }
    try { $h = vault_read_header((string) $file['tmp_name']); } catch (Throwable $e) { json_response(['error' => $e->getMessage()], 422); }
    $size = (int) @filesize((string) $file['tmp_name']);
    if ($size < 200 || $size > 8 * 1024 * 1024 * 1024) { json_response(['error' => 'Ce fichier n’a pas la taille d’une copie chiffrée LCNDA.'], 422); }
    $name = bin2hex(random_bytes(8)) . '.lcnda-coffre';
    if (!@move_uploaded_file((string) $file['tmp_name'], vault_dir() . '/' . $name) && !@copy((string) $file['tmp_name'], vault_dir() . '/' . $name)) { json_response(['error' => 'Impossible de ranger la copie.'], 500); }
    $uid = preg_match('/^[a-f0-9]{32}$/', (string) ($h['base_uid'] ?? '')) ? (string) $h['base_uid'] : '';
    $pdo->prepare('INSERT INTO cousin_vault(owner, copy_created_at, filename, size, base_uid) VALUES(?,?,?,?,?)')->execute([safe_text($h['owner'] ?? '?'), safe_text($h['created_at'] ?? ''), $name, (int) filesize(vault_dir() . '/' . $name), $uid]);
    // On garde les 3 dernières copies reçues de la même base (repérée par son identifiant, pas par le nom : deux cousins « Jean » ne s'effacent pas)
    if ($uid !== '') {
        $s = $pdo->prepare('SELECT id, filename FROM cousin_vault WHERE base_uid=? ORDER BY id DESC'); $s->execute([$uid]);
        foreach (array_slice($s->fetchAll(), 3) as $old) { @unlink(vault_dir() . '/' . basename((string) $old['filename'])); $pdo->prepare('DELETE FROM cousin_vault WHERE id=?')->execute([$old['id']]); }
    }
    json_response(['ok' => true, 'owner' => $h['owner'] ?? '?', 'created_at' => $h['created_at'] ?? '']);
}

function vault_status(PDO $pdo): array
{
    $held = $pdo->query('SELECT * FROM cousin_vault ORDER BY owner, copy_created_at DESC')->fetchAll();
    $sent = $pdo->query('SELECT * FROM cousin_vault_sent ORDER BY sent_at DESC LIMIT 20')->fetchAll();
    $last = $sent[0]['sent_at'] ?? null;
    return ['held' => $held, 'sent' => $sent, 'last_sent_days' => $last ? (int) floor((time() - strtotime($last . ' UTC')) / 86400) : null];
}

function vault_download(PDO $pdo, int $id): never
{
    $s = $pdo->prepare('SELECT * FROM cousin_vault WHERE id=?'); $s->execute([$id]); $r = $s->fetch();
    if ($r) { $r['filename'] = basename((string) $r['filename']); } // un nom de fichier, jamais un chemin
    if (!$r || !is_file(vault_dir() . '/' . $r['filename'])) { json_response(['error' => 'Copie introuvable'], 404); }
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="copie-chiffree-' . preg_replace('/[^a-z0-9]+/i', '-', ascii_fold((string) $r['owner'])) . '-' . substr((string) $r['copy_created_at'], 0, 10) . '.lcnda-coffre"');
    header('Content-Length: ' . filesize(vault_dir() . '/' . $r['filename']));
    readfile(vault_dir() . '/' . $r['filename']);
    exit;
}

function vault_delete(PDO $pdo, array $data): array
{
    $s = $pdo->prepare('SELECT filename FROM cousin_vault WHERE id=?'); $s->execute([safe_int($data['id'] ?? 0)]);
    $f = $s->fetchColumn();
    if ($f) { @unlink(vault_dir() . '/' . basename((string) $f)); }
    $pdo->prepare('DELETE FROM cousin_vault WHERE id=?')->execute([safe_int($data['id'] ?? 0)]);
    return ['ok' => true];
}

/** Ouvrir MA copie chiffrée (rendue par un cousin) : déchiffrée dans les sauvegardes, prête à être rouverte. */
function vault_open(PDO $pdo, ?array $file, string $password): never
{
    if (!$file || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) { json_response(['error' => 'Fichier non reçu.'], 422); }
    $dir = DATA_DIR . '/backups';
    if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
    $name = 'genealogie-backup-' . date('Ymd-His') . '-' . bin2hex(random_bytes(2)) . '-rendue-par-un-cousin.db';
    try { $h = vault_decrypt_file((string) $file['tmp_name'], $dir . '/' . $name, $password); }
    catch (Throwable $e) { @unlink($dir . '/' . $name); json_response(['error' => $e->getMessage()], 422); }
    try { if (function_exists('backup_strip_triggers')) { backup_strip_triggers($dir . '/' . $name); } $test = new PDO('sqlite:' . $dir . '/' . $name); $n = (int) $test->query('SELECT count(*) FROM persons')->fetchColumn(); }
    catch (Throwable $e) { @unlink($dir . '/' . $name); json_response(['error' => 'La copie déchiffrée n’est pas une base lisible.'], 422); }
    json_response(['ok' => true, 'file' => $name, 'persons' => $n, 'created_at' => $h['created_at'] ?? '', 'owner' => $h['owner'] ?? '']);
}

/* ─── 👶 Âges au mariage, écarts entre naissances, alertes ───────────── */

function age_date(?string $text, $year): ?array
{
    $d = $text ? exact_date($text) : null;
    if ($d) { return ['ts' => strtotime($d), 'exact' => true, 'year' => (int) substr($d, 0, 4), 'text' => $text]; }
    return $year ? ['ts' => strtotime(((int) $year) . '-07-01'), 'exact' => false, 'year' => (int) $year, 'text' => (string) ($text ?: $year)] : null;
}

function age_checks(PDO $pdo): array
{
    $ev = [];
    foreach ($pdo->query("SELECT e.person_id, e.family_id, e.date_text, e.year, t.gedcom_tag FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI','MARR') AND (e.year IS NOT NULL OR e.date_text<>'')") as $r) {
        $d = age_date($r['date_text'], $r['year']); if (!$d) { continue; }
        if ($r['person_id']) {
            $k = in_array($r['gedcom_tag'], ['BIRT', 'CHR', 'BAPM'], true) ? 'birth' : (in_array($r['gedcom_tag'], ['DEAT', 'BURI'], true) ? 'death' : null);
            if ($k && (!isset($ev['p'][(int) $r['person_id']][$k]) || ($r['gedcom_tag'] === 'BIRT' || $r['gedcom_tag'] === 'DEAT'))) { $ev['p'][(int) $r['person_id']][$k] = $d; }
        } elseif ($r['family_id'] && $r['gedcom_tag'] === 'MARR') { $ev['f'][(int) $r['family_id']] ??= $d; }
    }
    $years = static fn(array $a, array $b): float => ($b['ts'] - $a['ts']) / (365.25 * 86400);
    $alerts = []; $marriages = []; $spacings = [];
    $families = $pdo->query('SELECT id, partner1_id, partner2_id FROM families')->fetchAll();
    $gender = []; foreach ($pdo->query('SELECT id, gender FROM persons') as $g) { $gender[(int) $g['id']] = $g['gender']; }
    $kids = []; foreach ($pdo->query('SELECT family_id, child_id FROM family_children') as $c) { $kids[(int) $c['family_id']][] = (int) $c['child_id']; }
    foreach ($families as $f) {
        $fid = (int) $f['id'];
        $partners = array_filter([(int) $f['partner1_id'], (int) $f['partner2_id']]);
        $mother = 0; $father = 0;
        foreach ($partners as $p) { if (($gender[$p] ?? '') === 'female') { $mother = $p; } elseif (($gender[$p] ?? '') === 'male') { $father = $p; } }
        $marr = $ev['f'][$fid] ?? null;
        if ($marr) {
            foreach ($partners as $p) {
                $b = $ev['p'][$p]['birth'] ?? null; if (!$b) { continue; }
                $age = $years($b, $marr);
                $marriages[] = ['person_id' => $p, 'family_id' => $fid, 'age' => round($age, 1), 'year' => $marr['year'], 'gender' => $gender[$p] ?? ''];
                if ($age < 14) { $alerts[] = ['level' => 'high', 'person_id' => $p, 'family_id' => $fid, 'text' => 'Marié(e) à ' . floor($age) . ' ans', 'detail' => 'Mariage ' . $marr['text'] . ', naissance ' . $b['text']]; }
                elseif ($age > 75) { $alerts[] = ['level' => 'low', 'person_id' => $p, 'family_id' => $fid, 'text' => 'Marié(e) à ' . floor($age) . ' ans', 'detail' => 'À vérifier : remariage tardif, ou homonyme ?']; }
            }
        }
        $children = [];
        foreach ($kids[$fid] ?? [] as $c) { if (isset($ev['p'][$c]['birth'])) { $children[] = ['id' => $c, 'b' => $ev['p'][$c]['birth']]; } }
        usort($children, static fn($a, $b) => $a['b']['ts'] <=> $b['b']['ts']);
        foreach ($children as $i => $ch) {
            $b = $ch['b'];
            if ($mother && isset($ev['p'][$mother]['birth'])) {
                $am = $years($ev['p'][$mother]['birth'], $b);
                if ($am >= 50) { $alerts[] = ['level' => $am >= 55 ? 'high' : 'mid', 'person_id' => $ch['id'], 'other_id' => $mother, 'text' => 'Mère de ' . floor($am) . ' ans à la naissance', 'detail' => 'Naissance ' . $b['text'] . ' ; mère née ' . $ev['p'][$mother]['birth']['text']]; }
                elseif ($am < 15) { $alerts[] = ['level' => 'high', 'person_id' => $ch['id'], 'other_id' => $mother, 'text' => 'Mère de ' . floor(max(0, $am)) . ' ans à la naissance', 'detail' => 'Naissance ' . $b['text'] . ' ; mère née ' . $ev['p'][$mother]['birth']['text']]; }
            }
            if ($father && isset($ev['p'][$father]['birth'])) {
                $af = $years($ev['p'][$father]['birth'], $b);
                if ($af < 15 || $af > 75) { $alerts[] = ['level' => 'mid', 'person_id' => $ch['id'], 'other_id' => $father, 'text' => 'Père de ' . floor(max(0, $af)) . ' ans à la naissance', 'detail' => 'Naissance ' . $b['text'] . ' ; père né ' . $ev['p'][$father]['birth']['text']]; }
            }
            if ($father && isset($ev['p'][$father]['death'])) {
                $dd = $ev['p'][$father]['death'];
                $days = ($b['ts'] - $dd['ts']) / 86400;
                if ($days > ($b['exact'] && $dd['exact'] ? 300 : 730)) { $alerts[] = ['level' => 'high', 'person_id' => $ch['id'], 'other_id' => $father, 'text' => 'Né(e) ' . ($days > 730 ? floor($days / 365.25) . ' ans' : floor($days / 30.4) . ' mois') . ' après le décès du père', 'detail' => 'Naissance ' . $b['text'] . ' ; décès du père ' . $dd['text']]; }
            }
            if ($mother && isset($ev['p'][$mother]['death'])) {
                $dd = $ev['p'][$mother]['death'];
                if ($b['ts'] - $dd['ts'] > ($b['exact'] && $dd['exact'] ? 86400 : 366 * 86400)) { $alerts[] = ['level' => 'high', 'person_id' => $ch['id'], 'other_id' => $mother, 'text' => 'Né(e) après le décès de la mère', 'detail' => 'Naissance ' . $b['text'] . ' ; décès de la mère ' . $dd['text']]; }
            }
            if ($i > 0) {
                $prev = $children[$i - 1]['b'];
                $months = ($b['ts'] - $prev['ts']) / (30.44 * 86400);
                if ($b['exact'] && $prev['exact']) {
                    $spacings[] = ['family_id' => $fid, 'months' => round($months, 1), 'year' => $b['year']];
                    if ($months > 0.1 && $months < 8.5) { $alerts[] = ['level' => 'high', 'person_id' => $ch['id'], 'other_id' => $children[$i - 1]['id'], 'text' => 'Seulement ' . round($months, 1) . ' mois après son aîné(e)', 'detail' => 'Naissances ' . $prev['text'] . ' et ' . $b['text'] . ' (jumeaux mal datés, ou mauvais parents ?)']; }
                }
            }
            if ($marr && $b['ts'] < $marr['ts'] - 86400 * 365 * 15) { $alerts[] = ['level' => 'low', 'person_id' => $ch['id'], 'family_id' => $fid, 'text' => 'Né(e) bien avant le mariage des parents', 'detail' => 'Naissance ' . $b['text'] . ' ; mariage ' . $marr['text']]; }
        }
    }
    // ── Une vie impossible : décès avant la naissance, très grand âge, mariage après le décès ──
    foreach ($ev['p'] ?? [] as $pid => $e) {
        if (!isset($e['birth'], $e['death'])) { continue; }
        $life = $years($e['birth'], $e['death']);
        $tolerance = $e['birth']['exact'] && $e['death']['exact'] ? 0 : 1;
        if ($life < -$tolerance) { $alerts[] = ['level' => 'high', 'person_id' => $pid, 'text' => 'Décès avant la naissance', 'detail' => 'Naissance ' . $e['birth']['text'] . ' ; décès ' . $e['death']['text']]; }
        elseif ($life > 105) { $alerts[] = ['level' => $life > 115 ? 'high' : 'mid', 'person_id' => $pid, 'text' => 'Mort(e) à ' . floor($life) . ' ans', 'detail' => 'Naissance ' . $e['birth']['text'] . ' ; décès ' . $e['death']['text'] . ' (homonyme, ou naissance d’un parent ?)']; }
    }
    foreach ($families as $f) {
        $marr = $ev['f'][(int) $f['id']] ?? null; if (!$marr) { continue; }
        foreach (array_filter([(int) $f['partner1_id'], (int) $f['partner2_id']]) as $p) {
            $d = $ev['p'][$p]['death'] ?? null; if (!$d) { continue; }
            if ($marr['ts'] - $d['ts'] > ($marr['exact'] && $d['exact'] ? 86400 : 366 * 86400)) { $alerts[] = ['level' => 'high', 'person_id' => $p, 'family_id' => (int) $f['id'], 'text' => 'Marié(e) après son décès', 'detail' => 'Mariage ' . $marr['text'] . ' ; décès ' . $d['text']]; }
        }
    }
    // ── Erreurs de génération ──
    // Fratrie étalée sur plus de 25 ans (même mère) ou 30 ans : deux générations mélangées (père et fils homonymes ?)
    foreach ($families as $f) {
        $births = [];
        foreach ($kids[(int) $f['id']] ?? [] as $c) { if (isset($ev['p'][$c]['birth'])) { $births[$c] = $ev['p'][$c]['birth']; } }
        if (count($births) < 2) { continue; }
        uasort($births, static fn($a, $b) => $a['ts'] <=> $b['ts']);
        $first = array_key_first($births); $last = array_key_last($births);
        $span = $years($births[$first], $births[$last]);
        $hasMother = (bool) array_filter([(int) $f['partner1_id'], (int) $f['partner2_id']], static fn($p) => ($gender[$p] ?? '') === 'female');
        if ($span > ($hasMother ? 25 : 30)) { $alerts[] = ['level' => $span > 35 ? 'high' : 'mid', 'person_id' => $last, 'other_id' => $first, 'family_id' => (int) $f['id'], 'text' => 'Fratrie étalée sur ' . floor($span) . ' ans', 'detail' => 'Aîné(e) né(e) ' . $births[$first]['text'] . ', cadet(te) ' . $births[$last]['text'] . ' : deux générations mélangées (père et fils homonymes) ?']; }
    }
    // Lignée Sosa : un ancêtre trop jeune ou trop vieux par rapport au premier descendant daté de la lignée
    // (des générations sans dates entre les deux) → une génération en trop ou oubliée
    $root = (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn();
    $generationAlerts = 0;
    if ($root && function_exists('sosa_positions')) {
        $positions = sosa_positions($pdo, $root, 60000)['positions'] ?? [];
        foreach ($positions as $sosa => $pid) {
            $b = $ev['p'][$pid]['birth'] ?? null; if (!$b || $sosa < 4) { continue; }
            $k = 0; $n = (int) $sosa; $desc = null;
            while ($n > 1) { $n = intdiv($n, 2); $k++; $did = $positions[$n] ?? null; if ($did && isset($ev['p'][$did]['birth'])) { $desc = [$n, $did, $ev['p'][$did]['birth']]; break; } }
            if (!$desc || $k < 2) { continue; } // une seule génération d'écart : déjà vu avec l'âge des parents
            $gap = $years($b, $desc[2]);
            if ($gap < 15 * $k || $gap > 55 * $k) {
                $alerts[] = ['level' => $gap < 12 * $k || $gap > 65 * $k ? 'high' : 'mid', 'person_id' => $pid, 'other_id' => $desc[1],
                    'text' => 'Sosa ' . $sosa . ' : ' . floor($gap) . ' ans pour ' . $k . ' générations', 'detail' => 'Né(e) ' . $b['text'] . ', son descendant Sosa ' . $desc[0] . ' ' . $desc[2]['text'] . ' : ' . ($gap < 15 * $k ? 'une génération en trop (homonyme pris pour son père) ?' : 'une génération oubliée ?')];
                if (++$generationAlerts >= 200) { break; }
            }
        }
    }
    $people = collection_people($pdo, array_merge(array_column($alerts, 'person_id'), array_filter(array_column($alerts, 'other_id'))));
    foreach ($alerts as &$a) { $a['person'] = $people[$a['person_id']] ?? null; $a['other'] = isset($a['other_id']) ? ($people[$a['other_id']] ?? null) : null; }
    unset($a);
    $order = ['high' => 0, 'mid' => 1, 'low' => 2];
    usort($alerts, static fn($a, $b) => $order[$a['level']] <=> $order[$b['level']]);
    // Moyennes par quart de siècle
    $stats = [];
    foreach ($marriages as $m) { $k = (int) (floor($m['year'] / 25) * 25); $g = $m['gender'] === 'female' ? 'f' : ($m['gender'] === 'male' ? 'm' : 'x'); $stats[$k][$g][] = $m['age']; }
    foreach ($spacings as $s) { if ($s['months'] > 0) { $k = (int) (floor($s['year'] / 25) * 25); $stats[$k]['s'][] = $s['months']; } }
    ksort($stats);
    $avg = static fn($l) => $l ? round(array_sum($l) / count($l), 1) : null;
    $rows = [];
    foreach ($stats as $k => $v) { $rows[] = ['period' => $k . '–' . ($k + 24), 'men' => $avg($v['m'] ?? []), 'women' => $avg($v['f'] ?? []), 'n' => count($v['m'] ?? []) + count($v['f'] ?? []), 'spacing' => $avg($v['s'] ?? []), 'spacing_n' => count($v['s'] ?? [])]; }
    return ['alerts' => array_slice($alerts, 0, 500), 'periods' => $rows, 'marriages' => count($marriages)];
}

/* ─── 🧹 Harmoniser les variantes ─────────────────────────────────────── */

function variant_key(string $v, string $field): string
{
    $k = mb_strtolower(trim($v));
    $k = ascii_fold($k);
    if ($field === 'place') { $k = preg_replace('/\b(st|s t)\b\.?/', 'saint', $k); $k = preg_replace('/\b(ste)\b\.?/', 'sainte', $k); }
    $k = preg_replace('/[^a-z0-9]+/', ' ', $k);
    $k = trim(preg_replace('/\s+/', ' ', $k));
    return $k;
}

/** Clé « sonore » : sans consonnes doublées ni lettres muettes de fin (Labourreur → laboureur). */
function variant_loose(string $k): string
{
    $k = preg_replace('/([a-z])\1+/', '$1', $k);
    $k = preg_replace('/(e|s|x|t)+\b/', '', $k);
    return str_replace(' ', '', $k);
}

function variant_sources(string $field): array
{
    return match ($field) {
        'occupation' => ["SELECT occupation AS v, count(*) AS n FROM persons WHERE trim(COALESCE(occupation,''))<>'' GROUP BY occupation",
            "SELECT e.title AS v, count(*) AS n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='OCCU' AND trim(COALESCE(e.title,''))<>'' GROUP BY e.title"],
        'last_name' => ["SELECT last_name AS v, count(*) AS n FROM persons WHERE trim(COALESCE(last_name,''))<>'' GROUP BY last_name"],
        'first_name' => ["SELECT first_name AS v, count(*) AS n FROM persons WHERE trim(COALESCE(first_name,''))<>'' GROUP BY first_name"],
        'place' => ["SELECT name AS v, count(*) AS n FROM places p WHERE trim(COALESCE(name,''))<>'' AND EXISTS(SELECT 1 FROM events e WHERE e.place_id=p.id) GROUP BY name"],
        default => throw new RuntimeException('Champ inconnu'),
    };
}

function proper_case(string $v): string
{
    $parts = preg_split('/([\s\'’-])/u', mb_strtolower($v), -1, PREG_SPLIT_DELIM_CAPTURE);
    $small = ['de', 'du', 'des', 'la', 'le', 'les', 'sur', 'sous', 'en', 'lès', 'lez', 'aux', 'et', 'à'];
    $out = '';
    foreach ($parts as $i => $p) { $out .= ($i > 0 && in_array($p, $small, true)) ? $p : mb_convert_case($p, MB_CASE_TITLE); }
    return $out;
}

/** Groupes de valeurs écrites de plusieurs façons, avec la forme proposée. */
function variant_groups(PDO $pdo, string $field): array
{
    $counts = [];
    foreach (variant_sources($field) as $sql) { foreach ($pdo->query($sql) as $r) { $v = trim((string) $r['v']); $counts[$v] = ($counts[$v] ?? 0) + (int) $r['n']; } }
    $byLoose = [];
    foreach ($counts as $v => $n) {
        $k = variant_key($v, $field);
        if ($k === '') { continue; }
        // Rapprochement « sonore » (Labourreur → laboureur) seulement pour les métiers et les lieux :
        // pour les prénoms et les noms il confondrait Jean et Jeanne, Louis et Louise, Martin et Martine
        $byLoose[in_array($field, ['first_name', 'last_name'], true) ? str_replace(' ', '', $k) : variant_loose($k)][$v] = $n;
    }
    // Abréviations (« labour. » → « laboureur ») : rattachées au groupe dont la forme commence pareil
    $groups = $byLoose;
    foreach ($counts as $v => $n) {
        if (!preg_match('/\.$/', $v) || mb_strlen($v) < 4) { continue; }
        $stem = variant_key(rtrim($v, '.'), $field);
        foreach ($groups as $gk => $members) {
            if (isset($members[$v])) { continue; }
            foreach (array_keys($members) as $m) { if (str_starts_with(variant_key($m, $field), $stem) && variant_key($m, $field) !== $stem) { $groups[$gk][$v] = $n; unset($groups[variant_loose(variant_key($v, $field))][$v]); break 2; } }
        }
    }
    $out = [];
    foreach ($groups as $members) {
        if (count($members) < 2) { continue; }
        arsort($members);
        // Forme proposée : la plus fréquente qui n'est ni tout en capitales ni abrégée (sinon remise en casse normale)
        $best = null;
        foreach ($members as $v => $n) { if (!preg_match('/\.$/', $v) && $v !== mb_strtoupper($v)) { $best = $v; break; } }
        if ($best === null) { $best = proper_case((string) array_key_first($members)); }
        if ($field === 'occupation' && preg_match('/^\p{Lu}/u', $best) && count(array_filter(array_keys($members), static fn($x) => preg_match('/^\p{Ll}/u', $x)))) { $best = mb_strtolower(mb_substr($best, 0, 1)) . mb_substr($best, 1); }
        if ($field === 'place') { $best = preg_replace('/^St[ -]/u', 'Saint-', preg_replace('/^Ste[ -]/u', 'Sainte-', $best)); }
        $variants = [];
        foreach ($members as $v => $n) { $variants[] = ['value' => $v, 'count' => $n]; }
        $out[] = ['proposal' => $best, 'variants' => $variants, 'total' => array_sum($members)];
    }
    usort($out, static fn($a, $b) => $b['total'] <=> $a['total']);
    return $out;
}

function apply_variants(PDO $pdo, array $data): array
{
    $field = safe_text($data['field'] ?? '');
    $target = trim(safe_text($data['target'] ?? ''));
    $from = array_values(array_filter(array_map(static fn($v) => trim((string) $v), is_array($data['values'] ?? null) ? $data['values'] : []), static fn($v) => $v !== '' && $v !== $target));
    if ($target === '' || !$from) { throw new RuntimeException('Rien à harmoniser.'); }
    // [table, colonne, condition] ; trim() : « laboureur » et « laboureur  » (espace en trop) sont le même mot
    $targets = match ($field) {
        'occupation' => [['persons', 'occupation', ''], ['events', 'title', " AND event_type_id IN (SELECT id FROM event_types WHERE gedcom_tag='OCCU')"]],
        'last_name' => [['persons', 'last_name', '']],
        'first_name' => [['persons', 'first_name', '']],
        'place' => [['places', 'name', '']],
        default => throw new RuntimeException('Champ inconnu'),
    };
    $rows = []; // ce qui est changé, pour pouvoir annuler : [table, id, colonne, ancienne valeur]
    $marks = implode(',', array_fill(0, count($from), '?'));
    foreach ($targets as [$table, $col, $extra]) {
        $s = $pdo->prepare("SELECT id, {$col} AS v FROM {$table} WHERE trim({$col}) IN ({$marks}){$extra}");
        $s->execute($from);
        foreach ($s->fetchAll() as $r) { $rows[] = [$table, (int) $r['id'], $col, (string) $r['v']]; }
        $pdo->prepare("UPDATE {$table} SET {$col}=? WHERE trim({$col}) IN ({$marks}){$extra}")->execute([$target, ...$from]);
    }
    if (in_array($field, ['last_name', 'first_name'], true) && function_exists('rebuild_search')) {
        foreach ($rows as [, $id]) { try { rebuild_search($pdo, $id); } catch (Throwable $_) {} }
    }
    $n = count($rows);
    log_change($pdo, 'meta', 0, 'update', "Harmonisation ({$field}) : " . implode(', ', $from) . " → {$target} ({$n} modification(s))", ['harmonize' => $field, 'rows' => $rows], ['target' => $target]);
    return ['changed' => $n];
}

/** Les dernières harmonisations, chacune annulable. */
function harmonize_history(PDO $pdo): array
{
    $out = [];
    foreach ($pdo->query("SELECT id, created_at, summary, before_json FROM change_log WHERE entity_type='meta' AND summary LIKE 'Harmonisation (%' ORDER BY id DESC LIMIT 15") as $r) {
        $b = json_decode((string) $r['before_json'], true) ?: [];
        $out[] = ['id' => (int) $r['id'], 'at' => $r['created_at'], 'summary' => $r['summary'], 'undoable' => !empty($b['rows']) && empty($b['undone']), 'undone' => !empty($b['undone'])];
    }
    return $out;
}

/** Remet les anciennes écritures (seulement là où l'écriture harmonisée n'a pas été changée depuis). */
function undo_harmonize(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $r = $pdo->query("SELECT * FROM change_log WHERE id={$id} AND entity_type='meta' AND summary LIKE 'Harmonisation (%'")->fetch();
    if (!$r) { throw new RuntimeException('Harmonisation introuvable.'); }
    $b = json_decode((string) $r['before_json'], true) ?: [];
    $a = json_decode((string) $r['after_json'], true) ?: [];
    if (empty($b['rows']) || !empty($b['undone'])) { throw new RuntimeException('Cette harmonisation ne peut pas être annulée.'); }
    $allowed = ['persons' => ['occupation', 'last_name', 'first_name'], 'events' => ['title'], 'places' => ['name']];
    $n = 0;
    foreach ($b['rows'] as [$table, $rowId, $col, $old]) {
        if (!in_array($col, $allowed[$table] ?? [], true)) { continue; }
        $s = $pdo->prepare("UPDATE {$table} SET {$col}=? WHERE id=? AND {$col}=?");
        $s->execute([$old, (int) $rowId, (string) ($a['target'] ?? '')]);
        $n += $s->rowCount();
        if ($table === 'persons' && $col !== 'occupation' && function_exists('rebuild_search')) { try { rebuild_search($pdo, (int) $rowId); } catch (Throwable $_) {} }
    }
    $b['undone'] = date('c');
    $pdo->prepare('UPDATE change_log SET before_json=? WHERE id=?')->execute([json_encode($b, JSON_UNESCAPED_UNICODE), $id]);
    log_change($pdo, 'meta', 0, 'update', 'Annulation : ' . $r['summary'] . " ({$n} remise(s) en l’état)");
    return ['restored' => $n];
}

/* ─── 📍 Lieux mal placés ─────────────────────────────────────────────── */

/** [latitude min, max, longitude min, max] (territoires principaux). */
const COUNTRY_BOXES = [
    'france' => [41.2, 51.2, -5.5, 9.8], 'belgique' => [49.4, 51.6, 2.5, 6.5], 'suisse' => [45.8, 47.9, 5.9, 10.6], 'luxembourg' => [49.4, 50.2, 5.7, 6.6],
    'allemagne' => [47.2, 55.1, 5.8, 15.1], 'italie' => [36.6, 47.1, 6.6, 18.6], 'espagne' => [27.6, 43.9, -18.2, 4.4], 'portugal' => [32.4, 42.2, -31.3, -6.1],
    'pays-bas' => [50.7, 53.6, 3.3, 7.3], 'royaume-uni' => [49.8, 60.9, -8.7, 1.8], 'irlande' => [51.4, 55.4, -10.7, -5.9], 'pologne' => [49.0, 54.9, 14.1, 24.2],
    'autriche' => [46.3, 49.1, 9.5, 17.2], 'algerie' => [18.9, 37.2, -8.7, 12.0], 'maroc' => [27.6, 35.9, -13.2, -1.0], 'tunisie' => [30.2, 37.6, 7.5, 11.6],
    'canada' => [41.6, 83.2, -141.1, -52.6], 'etats-unis' => [18.9, 71.4, -179.2, -66.9], 'argentine' => [-55.1, -21.8, -73.6, -53.6], 'bresil' => [-33.8, 5.3, -74.0, -34.8],
];

/** La France d'outre-mer : départements, collectivités et territoires (ce n'est pas « hors de France »). */
const FRANCE_OVERSEAS_BOXES = [
    'Guadeloupe' => [15.8, 16.6, -61.9, -60.9], 'Martinique' => [14.3, 14.9, -61.3, -60.7], 'Guyane' => [2.0, 5.9, -54.7, -51.5],
    'La Réunion' => [-21.5, -20.8, 55.1, 55.9], 'Mayotte' => [-13.1, -12.6, 44.9, 45.4], 'Saint-Pierre-et-Miquelon' => [46.7, 47.2, -56.5, -56.0],
    'Saint-Barthélemy et Saint-Martin' => [17.8, 18.2, -63.2, -62.7], 'Polynésie française' => [-28.0, -7.0, -155.0, -134.0],
    'Nouvelle-Calédonie' => [-23.0, -19.0, 158.0, 169.0], 'Wallis-et-Futuna' => [-14.5, -13.0, -178.3, -176.0],
    // Terres australes : une petite boîte par archipel (une seule grande boîte englobait Madagascar, Maurice et les Comores)
    'Kerguelen' => [-50.1, -48.4, 68.4, 70.7], 'Crozet' => [-46.6, -45.9, 50.0, 52.5], 'Amsterdam et Saint-Paul' => [-38.8, -37.7, 77.4, 77.7],
    'Terre Adélie' => [-69.0, -65.0, 136.0, 142.0], 'Europa' => [-22.5, -22.2, 40.2, 40.5], 'Juan de Nova' => [-17.1, -16.9, 42.6, 42.8],
    'Bassas da India' => [-21.6, -21.4, 39.6, 39.8], 'Glorieuses' => [-11.7, -11.4, 47.2, 47.5], 'Tromelin' => [-15.95, -15.85, 54.45, 54.6],
    'Clipperton' => [10.2, 10.4, -109.3, -109.1],
];

/** Le point est-il dans le pays (pour la France : métropole, Corse et outre-mer) ? */
function place_in_country(string $country, float $lat, float $lon): bool
{
    $boxes = [COUNTRY_BOXES[$country]];
    if ($country === 'france') { $boxes = [...$boxes, ...array_values(FRANCE_OVERSEAS_BOXES)]; }
    foreach ($boxes as [$a, $b, $c, $d]) { if ($lat >= $a && $lat <= $b && $lon >= $c && $lon <= $d) { return true; } }
    return false;
}

function france_overseas_name(float $lat, float $lon): ?string
{
    foreach (FRANCE_OVERSEAS_BOXES as $name => [$a, $b, $c, $d]) { if ($lat >= $a && $lat <= $b && $lon >= $c && $lon <= $d) { return $name; } }
    return null;
}

function suspicious_places(PDO $pdo): array
{
    $rows = $pdo->query("SELECT p.id, p.name, p.county, p.state, p.country, p.latitude AS lat, p.longitude AS lon, p.admin4_code, count(e.id) AS n
        FROM places p JOIN events e ON e.place_id=p.id WHERE p.latitude IS NOT NULL GROUP BY p.id")->fetchAll();
    if (!$rows) { return ['alerts' => [], 'center' => null]; }
    // Centre de la famille : médiane pondérée par le nombre d'événements
    $lats = []; $lons = [];
    foreach ($rows as $r) { for ($i = 0; $i < min(50, (int) $r['n']); $i++) { $lats[] = (float) $r['lat']; $lons[] = (float) $r['lon']; } }
    sort($lats); sort($lons);
    $center = [$lats[intdiv(count($lats), 2)], $lons[intdiv(count($lons), 2)]];
    $ignored = array_fill_keys(ht_setting($pdo, 'lcnda-place-ignored', ['ids' => []])['ids'] ?? [], true);
    $alerts = [];
    // Communes homonymes : UN seul passage sur les contours (une requête par lieu prenait des minutes avec 226 pays)
    $wanted = [];
    foreach ($rows as $r) { if ($r['name']) { $wanted[mb_strtolower(trim((string) $r['name']))] = true; } }
    $byName = [];
    try {
        foreach ($pdo->query('SELECT insee_code, name, centroid_lat, centroid_lon FROM commune_contours WHERE centroid_lat IS NOT NULL') as $c) {
            $k = mb_strtolower(trim((string) $c['name']));
            if (isset($wanted[$k])) { $byName[$k][] = $c; }
        }
    } catch (Throwable $_) {}
    foreach ($rows as $r) {
        if (isset($ignored[(int) $r['id']])) { continue; }
        $lat = (float) $r['lat']; $lon = (float) $r['lon'];
        $country = strtolower(ascii_fold(trim((string) $r['country']))) ?: 'france';
        $country = str_replace(['etats unis', 'usa', 'united states'], 'etats-unis', $country);
        $reasons = []; $suggest = null;
        if ($lat == 0.0 && $lon == 0.0) { $reasons[] = 'Coordonnées 0, 0 (en plein océan, au large de l’Afrique)'; }
        elseif (isset(COUNTRY_BOXES[$country])) {
            [$a, $b, $c, $d] = COUNTRY_BOXES[$country];
            if (!place_in_country($country, $lat, $lon)) {
                $reasons[] = 'Hors de ' . ($r['country'] ?: 'France') . ' alors que le pays indiqué est ' . ($r['country'] ?: 'France');
                if ($lon >= $a && $lon <= $b && $lat >= $c && $lat <= $d) { $reasons[] = 'Latitude et longitude probablement inversées'; $suggest = ['lat' => $lon, 'lon' => $lat, 'why' => 'Inverser latitude et longitude']; }
                elseif ($country === 'france' && $lat >= $a && $lat <= $b && -$lon >= $c && -$lon <= $d) { $reasons[] = 'Longitude probablement de mauvais signe (est / ouest)'; $suggest = ['lat' => $lat, 'lon' => -$lon, 'why' => 'Corriger le signe de la longitude']; }
            }
        }
        $dist = h_distance_km($center[0], $center[1], $lat, $lon);
        if ($r['name'] && isset($byName[mb_strtolower(trim((string) $r['name']))])) {
            $best = null;
            foreach ($byName[mb_strtolower(trim((string) $r['name']))] as $c) { $dc = h_distance_km($center[0], $center[1], (float) $c['centroid_lat'], (float) $c['centroid_lon']); if (!$best || $dc < $best['d']) { $best = ['d' => $dc, 'c' => $c]; } }
            if ($best && $best['d'] + 150 < $dist && $best['c']['insee_code'] !== $r['admin4_code']) {
                $reasons[] = 'Une autre commune « ' . $r['name'] . ' » est beaucoup plus près du reste de la famille (' . round($best['d']) . ' km au lieu de ' . round($dist) . ' km) : département ' . substr((string) $best['c']['insee_code'], 0, 2);
                $suggest ??= ['lat' => (float) $best['c']['centroid_lat'], 'lon' => (float) $best['c']['centroid_lon'], 'insee' => $best['c']['insee_code'], 'why' => 'Prendre la commune du département ' . substr((string) $best['c']['insee_code'], 0, 2)];
            }
        }
        if (!$reasons && $dist > 1500 && $country === 'france' && !france_overseas_name($lat, $lon)) { $reasons[] = 'À ' . round($dist) . ' km du reste de la famille'; }
        if ($reasons) { $alerts[] = ['place' => $r, 'distance' => round($dist), 'reasons' => $reasons, 'suggest' => $suggest]; }
    }
    usort($alerts, static fn($a, $b) => $b['distance'] <=> $a['distance']);
    return ['alerts' => $alerts, 'center' => $center];
}

function fix_place(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    if (!empty($data['ignore'])) { // ✅ écarté comme toutes les alertes du Contrôle de la base (dismissed_issues, « ↺ Signaler de nouveau »)
        return controle_dismiss($pdo, ['key' => 'place:' . $id, 'reason' => 'Le lieu est juste', 'watch' => 1]) + ['ok' => true];
    }
    $lat = h_coord($data['lat'] ?? null, 90); $lon = h_coord($data['lon'] ?? null, 180);
    if ($lat === null || $lon === null) { throw new RuntimeException('Coordonnées invalides.'); }
    $before = $pdo->query('SELECT * FROM places WHERE id=' . $id)->fetch();
    $pdo->prepare('UPDATE places SET latitude=?, longitude=? WHERE id=?')->execute([$lat, $lon, $id]);
    if (!empty($data['insee'])) { $pdo->prepare('UPDATE places SET admin4_code=? WHERE id=?')->execute([safe_text($data['insee']), $id]); }
    log_change($pdo, 'place', $id, 'update', 'Coordonnées du lieu corrigées : ' . ($before['name'] ?? '#' . $id), $before ?: null, ['latitude' => $lat, 'longitude' => $lon]);
    return ['ok' => true];
}

/* ─── 📏 Taille des ancêtres ──────────────────────────────────────────── */

/** « 1m65 », « 1,65 m », « 165 cm », « 1 mètre 65 », « 1.65 » → mètres. */
function parse_height(string $t): ?float
{
    $t = mb_strtolower(str_replace(',', '.', trim($t)));
    if ($t === '') { return null; }
    if (preg_match('/(\d)\s*(?:m|mètres?|metres?)\s*(\d{1,2})\b/u', $t, $m)) { $v = (int) $m[1] + (int) str_pad($m[2], 2, '0') / 100; }
    elseif (preg_match('/\b(1\.\d{1,3})\b/', $t, $m)) { $v = (float) $m[1]; }
    elseif (preg_match('/\b(1\d{2})\s*(?:cm)?\b/', $t, $m)) { $v = (int) $m[1] / 100; }
    else { return null; }
    return $v >= 1.2 && $v <= 2.2 ? round($v, 3) : null;
}

function heights_data(PDO $pdo): array
{
    $out = [];
    foreach ($pdo->query("SELECT id, first_name, last_name, gender, height_text, military_data FROM persons WHERE trim(COALESCE(height_text,''))<>'' OR military_data LIKE '%taille%'") as $p) {
        $h = parse_height((string) $p['height_text']);
        if ($h === null && $p['military_data']) { $m = json_decode((string) $p['military_data'], true); $h = is_array($m) ? parse_height((string) ($m['taille'] ?? '')) : null; }
        if ($h === null) { continue; }
        $b = $pdo->query("SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=" . (int) $p['id'] . " AND t.gedcom_tag IN ('BIRT','CHR') AND e.year IS NOT NULL ORDER BY t.gedcom_tag='BIRT' DESC LIMIT 1")->fetchColumn();
        $out[] = ['id' => (int) $p['id'], 'name' => trim($p['first_name'] . ' ' . $p['last_name']), 'gender' => $p['gender'], 'height' => $h, 'birth_year' => $b ? (int) $b : null];
    }
    return ['people' => $out];
}

/* ─── ✊ Résistants ───────────────────────────────────────────────────── */

const RESISTANCE_KINDS = ['entree' => 'Entrée en résistance', 'mission' => 'Mission, liaison', 'sabotage' => 'Sabotage', 'combat' => 'Combat, maquis', 'cache' => 'Caché(e)', 'passage' => 'Passage de ligne / frontière', 'arrestation' => 'Arrestation', 'interrogatoire' => 'Interrogatoire', 'internement' => 'Prison, internement', 'deportation' => 'Déportation', 'evasion' => 'Évasion', 'liberation' => 'Libération', 'execution' => 'Fusillé(e), exécuté(e)', 'deces' => 'Décès', 'decoration' => 'Décoration, reconnaissance', 'autre' => 'Autre'];

function resistance_data(PDO $pdo, int $personId): array
{
    $p = $pdo->prepare('SELECT * FROM resistance_profiles WHERE person_id=?'); $p->execute([$personId]);
    $s = $pdo->prepare("SELECT s.*, trim(lp.first_name||' '||lp.last_name) AS linked_name FROM resistance_steps s LEFT JOIN persons lp ON lp.id=s.linked_person_id WHERE s.person_id=? ORDER BY COALESCE(NULLIF(s.date_start,''),'9999'), s.position, s.id");
    $s->execute([$personId]);
    $steps = $s->fetchAll();
    foreach ($steps as &$st) { $st['kind_label'] = RESISTANCE_KINDS[$st['kind']] ?? $st['kind']; }
    unset($st);
    // Les autres fiches qui citent cette personne dans leur parcours (compagnons, arrêtés ensemble…)
    $c = $pdo->prepare("SELECT s.*, trim(op.first_name||' '||op.last_name) AS owner_name FROM resistance_steps s JOIN persons op ON op.id=s.person_id WHERE s.linked_person_id=? AND s.person_id<>? ORDER BY s.date_start");
    $c->execute([$personId, $personId]);
    $cited = $c->fetchAll();
    foreach ($cited as &$st) { $st['kind_label'] = RESISTANCE_KINDS[$st['kind']] ?? $st['kind']; }
    unset($st);
    $media = heritage_media($pdo, 'resistance', [$personId]);
    return ['profile' => $p->fetch() ?: null, 'steps' => $steps, 'cited_in' => $cited, 'media' => $media[$personId] ?? [], 'labels' => collection_labels($pdo, 'resistance', [$personId])[$personId] ?? [], 'kinds' => RESISTANCE_KINDS];
}

function save_resistance(PDO $pdo, array $data): array
{
    $personId = safe_int($data['person_id'] ?? 0);
    h_person_exists($pdo, $personId);
    $p = is_array($data['profile'] ?? null) ? $data['profile'] : [];
    $had = (int) $pdo->query('SELECT count(*) FROM resistance_profiles WHERE person_id=' . $personId)->fetchColumn();
    $pdo->prepare('INSERT OR REPLACE INTO resistance_profiles(person_id, nom_de_guerre, network, movement, rank, joined, left_date, recognition, arrested, deported, killed, fate, file_ref, notes, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)')
        ->execute([$personId, safe_text($p['nom_de_guerre'] ?? ''), safe_text($p['network'] ?? ''), safe_text($p['movement'] ?? ''), safe_text($p['rank'] ?? ''), safe_text($p['joined'] ?? ''), safe_text($p['left_date'] ?? ''),
            safe_text($p['recognition'] ?? ''), !empty($p['arrested']) ? 1 : 0, !empty($p['deported']) ? 1 : 0, !empty($p['killed']) ? 1 : 0, safe_text($p['fate'] ?? ''), safe_text($p['file_ref'] ?? ''), h_long($p, 'notes', 40000)]);
    if (isset($data['steps']) && is_array($data['steps'])) {
        $pdo->prepare('DELETE FROM resistance_steps WHERE person_id=?')->execute([$personId]);
        $ins = $pdo->prepare('INSERT INTO resistance_steps(person_id, date_start, date_end, kind, place_text, lat, lon, linked_person_id, linked_text, note, position) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
        foreach (array_values($data['steps']) as $i => $s) {
            if (!is_array($s)) { continue; }
            if (safe_text($s['date_start'] ?? '') === '' && safe_text($s['place_text'] ?? '') === '' && safe_text($s['note'] ?? '') === '') { continue; }
            [$lat, $lon] = h_place_coords($pdo, $s, 'place_text', 'lat', 'lon');
            $kind = array_key_exists((string) ($s['kind'] ?? ''), RESISTANCE_KINDS) ? (string) $s['kind'] : 'autre';
            $ins->execute([$personId, safe_text($s['date_start'] ?? ''), safe_text($s['date_end'] ?? ''), $kind, safe_text($s['place_text'] ?? ''), $lat, $lon, safe_int($s['linked_person_id'] ?? 0) ?: null, safe_text($s['linked_text'] ?? ''), h_long($s, 'note', 4000), $i]);
        }
    }
    if (!$had) { $pdo->prepare('UPDATE persons SET show_resistance_block=1 WHERE id=?')->execute([$personId]); }
    log_change($pdo, 'person', $personId, 'update', 'Parcours de résistant enregistré');
    return ['ok' => true];
}

function clear_resistance(PDO $pdo, array $data): array
{
    $personId = safe_int($data['person_id'] ?? 0);
    $pdo->prepare('DELETE FROM resistance_steps WHERE person_id=?')->execute([$personId]);
    $pdo->prepare('DELETE FROM resistance_profiles WHERE person_id=?')->execute([$personId]);
    heritage_delete_media_links($pdo, 'resistance', $personId); // médias et étiquettes du parcours
    log_change($pdo, 'person', $personId, 'update', 'Parcours de résistant effacé');
    return ['ok' => true];
}

function resistance_overview(PDO $pdo): array
{
    $ids = $pdo->query('SELECT person_id FROM resistance_profiles UNION SELECT DISTINCT person_id FROM resistance_steps UNION SELECT id FROM persons WHERE show_resistance_block=1')->fetchAll(PDO::FETCH_COLUMN);
    $people = collection_people($pdo, $ids);
    $out = [];
    foreach ($people as $id => $p) { $out[] = ['person' => $p] + resistance_data($pdo, (int) $id); }
    usort($out, static fn($a, $b) => strcmp((string) $a['person']['last_name'], (string) $b['person']['last_name']));
    return $out;
}

/* ─── 🧩 Éditeur de blocs ─────────────────────────────────────────────── */

const CUSTOM_FIELD_TYPES = ['text', 'longtext', 'date', 'number', 'select', 'checkbox', 'url', 'person', 'place', 'media', 'person_info', 'map', 'journey', 'widget', 'stat'];

function custom_fields_clean(array $fields): array
{
    $out = [];
    foreach ($fields as $f) {
        if (!is_array($f) || !in_array($f['type'] ?? '', CUSTOM_FIELD_TYPES, true)) { continue; }
        $key = preg_replace('/[^a-z0-9_]/', '', strtolower((string) ($f['key'] ?? ''))) ?: 'f' . bin2hex(random_bytes(3));
        $out[] = ['key' => $key, 'type' => $f['type'], 'label' => mb_substr(safe_text($f['label'] ?? ''), 0, 80) ?: 'Champ', 'help' => mb_substr(safe_text($f['help'] ?? ''), 0, 200),
            'options' => array_values(array_filter(array_map(static fn($o) => mb_substr(safe_text($o), 0, 80), is_array($f['options'] ?? null) ? $f['options'] : []))),
            'info' => in_array($f['info'] ?? '', ['birth', 'death', 'age', 'occupation', 'parents', 'spouses', 'children', 'birthplace', 'residence', 'sosa'], true) ? $f['info'] : 'birth',
            'from' => preg_replace('/[^a-z0-9_]/', '', strtolower((string) ($f['from'] ?? 'self'))) ?: 'self',
            'accept' => in_array($f['accept'] ?? '', ['image', 'video', 'audio', 'all'], true) ? $f['accept'] : 'all', 'required' => !empty($f['required'])]
            // Parcours jour par jour : d'où viennent les étapes, présentation, ordre, carte, « Jour 1, Jour 9… »
            + ($f['type'] === 'journey' ? ['jSource' => ($f['jSource'] ?? '') === 'person' ? 'person' : 'manual', 'jLayout' => in_array($f['jLayout'] ?? '', ['vertical', 'horizontal', 'cards', 'compact'], true) ? $f['jLayout'] : 'vertical',
                'jOrder' => ($f['jOrder'] ?? '') === 'manual' ? 'manual' : 'date', 'jMap' => !array_key_exists('jMap', $f) || !empty($f['jMap']), 'jDays' => !array_key_exists('jDays', $f) || !empty($f['jDays']), 'jWithPlace' => !empty($f['jWithPlace'])] : [])
            // Widget : un des widgets à soi (cw_…) ou un écran de l'app (screen:list:villages, screen:person:self…)
            + (in_array($f['type'], ['widget', 'stat'], true) ? ['widget' => preg_match('/^(cw_[a-z0-9]{4,24}|screen:[a-z_]{2,12}:[a-z0-9_]{1,40})$/i', (string) ($f['widget'] ?? '')) ? (string) $f['widget'] : '',
                'height' => max(240, min(2000, safe_int($f['height'] ?? 560) ?: 560))] : []);
    }
    return $out;
}

function custom_blocks_defs(PDO $pdo): array
{
    $rows = $pdo->query('SELECT * FROM custom_block_defs ORDER BY position, id')->fetchAll();
    foreach ($rows as &$r) { $r['fields'] = json_decode((string) $r['fields_json'], true) ?: []; unset($r['fields_json']); $r['entry_count'] = (int) $pdo->query('SELECT count(*) FROM custom_block_entries WHERE block_id=' . (int) $r['id'])->fetchColumn(); }
    unset($r);
    return $rows;
}

function save_custom_block_def(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 80);
    if ($name === '') { throw new RuntimeException('Donne un nom au bloc.'); }
    $fields = custom_fields_clean(is_array($data['fields'] ?? null) ? $data['fields'] : []);
    if (!$fields) { throw new RuntimeException('Ajoute au moins un champ.'); }
    $display = in_array($data['display'] ?? '', ['flag', 'always', 'filled'], true) ? $data['display'] : 'flag';
    $vals = [$name, mb_substr(safe_text($data['icon'] ?? '🧩'), 0, 16) ?: '🧩', h_long($data, 'description', 2000), json_encode($fields, JSON_UNESCAPED_UNICODE), !empty($data['repeatable']) ? 1 : 0, $display, !isset($data['labels']) || !empty($data['labels']) ? 1 : 0, safe_text($data['author'] ?? '')];
    if ($id) { $pdo->prepare('UPDATE custom_block_defs SET name=?, icon=?, description=?, fields_json=?, repeatable=?, display=?, labels=?, author=?, version=version+1, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$vals, $id]); }
    else { $pdo->prepare('INSERT INTO custom_block_defs(name, icon, description, fields_json, repeatable, display, labels, author, uid, position) VALUES(?,?,?,?,?,?,?,?,?,(SELECT COALESCE(max(position),0)+1 FROM custom_block_defs))')->execute([...$vals, safe_text($data['uid'] ?? '') ?: bin2hex(random_bytes(8))]); $id = (int) $pdo->lastInsertId(); }
    log_change($pdo, 'meta', 0, 'update', 'Bloc personnalisé enregistré : ' . $name);
    return ['id' => $id];
}

function delete_custom_block_def(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    foreach ($pdo->query('SELECT id FROM custom_block_entries WHERE block_id=' . $id)->fetchAll(PDO::FETCH_COLUMN) as $e) { heritage_delete_media_links($pdo, 'custom_block_entry', (int) $e); }
    $pdo->prepare('DELETE FROM custom_block_entries WHERE block_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM custom_block_flags WHERE block_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM custom_block_defs WHERE id=?')->execute([$id]);
    return ['ok' => true];
}

/** Partage : le modèle du bloc seulement (jamais les données des fiches). */
function export_custom_block_def(PDO $pdo, int $id): never
{
    $s = $pdo->prepare('SELECT * FROM custom_block_defs WHERE id=?'); $s->execute([$id]); $d = $s->fetch();
    if (!$d) { json_response(['error' => 'Bloc introuvable'], 404); }
    $out = ['format' => 'lcnda-block', 'version' => 1, 'uid' => $d['uid'], 'name' => $d['name'], 'icon' => $d['icon'], 'description' => $d['description'], 'fields' => json_decode((string) $d['fields_json'], true) ?: [],
        'repeatable' => (int) $d['repeatable'], 'display' => $d['display'], 'labels' => (int) $d['labels'], 'author' => $d['author'], 'block_version' => (int) $d['version'], 'exported_at' => date('c')];
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="bloc-' . preg_replace('/[^a-z0-9]+/i', '-', ascii_fold((string) $d['name'])) . '.lcnda-bloc.json"');
    echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function import_custom_block_def(PDO $pdo, array $data): array
{
    $b = is_array($data['block'] ?? null) ? $data['block'] : json_decode((string) ($data['json'] ?? ''), true);
    if (!is_array($b) || ($b['format'] ?? '') !== 'lcnda-block') { throw new RuntimeException('Ce fichier n’est pas un bloc LCNDA.'); }
    $exists = $pdo->prepare('SELECT id FROM custom_block_defs WHERE uid=?'); $exists->execute([safe_text($b['uid'] ?? '')]);
    $id = (int) $exists->fetchColumn();
    $res = save_custom_block_def($pdo, ['id' => $id, 'uid' => $b['uid'] ?? '', 'name' => $b['name'] ?? '', 'icon' => $b['icon'] ?? '🧩', 'description' => $b['description'] ?? '', 'fields' => $b['fields'] ?? [], 'repeatable' => $b['repeatable'] ?? 1, 'display' => $b['display'] ?? 'flag', 'labels' => $b['labels'] ?? 1, 'author' => $b['author'] ?? '']);
    return ['id' => $res['id'], 'updated' => (bool) $id];
}

/** Infos tirées d'une fiche pour un champ « Info de la fiche ». */
function person_info_value(PDO $pdo, int $pid, string $info): string
{
    if (!$pid) { return ''; }
    $p = collection_people($pdo, [$pid])[$pid] ?? null;
    if (!$p) { return ''; }
    $name = static fn($x) => trim(($x['first_name'] ?? '') . ' ' . ($x['last_name'] ?? ''));
    $ev = static function (array $tags) use ($pdo, $pid): ?array { $s = $pdo->prepare('SELECT e.date_text, e.year, pl.name AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=? AND t.gedcom_tag IN (' . implode(',', array_map(static fn($t) => "'{$t}'", $tags)) . ') ORDER BY e.year LIMIT 1'); $s->execute([$pid]); return $s->fetch() ?: null; };
    switch ($info) {
        case 'birth': $e = $ev(['BIRT', 'CHR']); return $e ? trim(($e['date_text'] ?: $e['year']) . ($e['place'] ? ' à ' . $e['place'] : '')) : '';
        case 'death': $e = $ev(['DEAT', 'BURI']); return $e ? trim(($e['date_text'] ?: $e['year']) . ($e['place'] ? ' à ' . $e['place'] : '')) : '';
        case 'birthplace': $e = $ev(['BIRT', 'CHR']); return (string) ($e['place'] ?? '');
        case 'residence': $e = $ev(['RESI', 'CENS']); return (string) ($e['place'] ?? '');
        case 'age': return $p['birth_year'] && $p['death_year'] ? ((int) $p['death_year'] - (int) $p['birth_year']) . ' ans' : '';
        case 'occupation': return (string) ($p['occupation'] ?? '');
        case 'parents': return implode(' et ', array_map($name, collection_people($pdo, h_parents($pdo, $pid))));
        case 'spouses': $s = $pdo->prepare('SELECT CASE WHEN partner1_id=? THEN partner2_id ELSE partner1_id END FROM families WHERE partner1_id=? OR partner2_id=?'); $s->execute([$pid, $pid, $pid]); return implode(', ', array_map($name, collection_people($pdo, array_filter(array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN))))));
        case 'children': $n = count(h_children($pdo, [$pid])); return $n ? $n . ' enfant' . ($n > 1 ? 's' : '') : '';
        default: return '';
    }
}

/** Blocs personnalisés d'une fiche : définitions, cases cochées et fiches remplies (avec infos calculées). */
function custom_blocks_for_person(PDO $pdo, int $personId): array
{
    $defs = custom_blocks_defs($pdo);
    if (!$defs) { return []; }
    $flags = array_fill_keys(array_map('intval', $pdo->query('SELECT block_id FROM custom_block_flags WHERE person_id=' . $personId)->fetchAll(PDO::FETCH_COLUMN)), true);
    $out = [];
    foreach ($defs as $d) {
        $s = $pdo->prepare('SELECT * FROM custom_block_entries WHERE block_id=? AND person_id=? ORDER BY position, id'); $s->execute([$d['id'], $personId]);
        $entries = $s->fetchAll();
        $ids = array_map(static fn($e) => (int) $e['id'], $entries);
        $media = heritage_media($pdo, 'custom_block_entry', $ids);
        $labels = $ids ? collection_labels($pdo, 'custom_block_entry', $ids) : [];
        $personIds = [];
        foreach ($entries as &$e) {
            $e['data'] = json_decode((string) $e['data_json'], true) ?: []; unset($e['data_json']);
            $e['media'] = $media[(int) $e['id']] ?? [];
            $e['labels'] = $labels[(int) $e['id']] ?? [];
            foreach ($d['fields'] as $f) { if ($f['type'] === 'person' && !empty($e['data'][$f['key']])) { $personIds[] = (int) $e['data'][$f['key']]; } }
        }
        unset($e);
        $people = collection_people($pdo, $personIds);
        foreach ($entries as &$e) {
            $e['people'] = [];
            foreach ($d['fields'] as $f) {
                if ($f['type'] === 'person' && !empty($e['data'][$f['key']])) { $e['people'][$f['key']] = $people[(int) $e['data'][$f['key']]] ?? null; }
                if ($f['type'] === 'person_info') { $src = $f['from'] === 'self' ? $personId : (int) ($e['data'][$f['from']] ?? 0); $e['data'][$f['key']] = person_info_value($pdo, $src, $f['info']); }
            }
        }
        unset($e);
        $out[] = $d + ['entries' => $entries, 'flagged' => isset($flags[(int) $d['id']]), 'self_info' => array_map(static fn($f) => $f['type'] === 'person_info' && $f['from'] === 'self' ? person_info_value($pdo, $personId, $f['info']) : null, array_column($d['fields'], null, 'key'))];
    }
    return $out;
}

function save_custom_block_entry(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $blockId = safe_int($data['block_id'] ?? 0);
    $personId = safe_int($data['person_id'] ?? 0);
    h_person_exists($pdo, $personId);
    $s = $pdo->prepare('SELECT * FROM custom_block_defs WHERE id=?'); $s->execute([$blockId]); $def = $s->fetch();
    if (!$def) { throw new RuntimeException('Bloc introuvable'); }
    $fields = json_decode((string) $def['fields_json'], true) ?: [];
    $in = is_array($data['data'] ?? null) ? $data['data'] : [];
    $clean = [];
    foreach ($fields as $f) {
        $v = $in[$f['key']] ?? null;
        switch ($f['type']) {
            case 'checkbox': $clean[$f['key']] = !empty($v) ? 1 : 0; break;
            case 'number': $clean[$f['key']] = is_numeric(str_replace(',', '.', (string) $v)) ? (float) str_replace(',', '.', (string) $v) : ''; break;
            case 'person': $clean[$f['key']] = safe_int($v) ?: ''; break;
            case 'place': $clean[$f['key']] = is_array($v) ? ['text' => safe_text($v['text'] ?? ''), 'lat' => h_coord($v['lat'] ?? null, 90), 'lon' => h_coord($v['lon'] ?? null, 180)] : ['text' => safe_text($v ?? ''), 'lat' => null, 'lon' => null];
                if ($clean[$f['key']]['text'] !== '' && $clean[$f['key']]['lat'] === null) { $g = heritage_geocode($pdo, $clean[$f['key']]['text']); if ($g) { $clean[$f['key']]['lat'] = $g['lat']; $clean[$f['key']]['lon'] = $g['lon']; } }
                break;
            case 'url': $u = safe_text($v ?? ''); $clean[$f['key']] = preg_match('#^https?://#i', $u) ? $u : ''; break;
            case 'journey': // étapes écrites à la main (sinon : les événements de la fiche, rien à garder)
                $steps = [];
                foreach (array_slice(is_array($v) ? $v : [], 0, 500) as $st) {
                    if (!is_array($st)) { continue; }
                    $one = ['emoji' => mb_substr(safe_text($st['emoji'] ?? ''), 0, 16), 'date' => mb_substr(safe_text($st['date'] ?? ''), 0, 60), 'date_end' => mb_substr(safe_text($st['date_end'] ?? ''), 0, 60),
                        'title' => mb_substr(safe_text($st['title'] ?? ''), 0, 300), 'place' => mb_substr(safe_text($st['place'] ?? ''), 0, 300), 'lat' => h_coord($st['lat'] ?? null, 90), 'lon' => h_coord($st['lon'] ?? null, 180),
                        'color' => preg_match('/^#[0-9a-f]{6}$/i', (string) ($st['color'] ?? '')) ? (string) $st['color'] : '', 'text' => mb_substr(trim((string) ($st['text'] ?? '')), 0, 8000)];
                    if ($one['place'] !== '' && $one['lat'] === null) { $g = heritage_geocode($pdo, $one['place']); if ($g) { $one['lat'] = $g['lat']; $one['lon'] = $g['lon']; } }
                    if ($one['date'] !== '' || $one['title'] !== '' || $one['place'] !== '' || $one['text'] !== '') { $steps[] = $one; }
                }
                $clean[$f['key']] = $steps;
                break;
            case 'media': case 'person_info': case 'map': break;
            case 'longtext': $clean[$f['key']] = mb_substr((string) ($v ?? ''), 0, 40000); break;
            default: $clean[$f['key']] = mb_substr(safe_text($v ?? ''), 0, 2000);
        }
        if (!empty($f['required']) && in_array($f['type'], ['text', 'longtext', 'date', 'select', 'person'], true) && ($clean[$f['key']] ?? '') === '') { throw new RuntimeException('Le champ « ' . $f['label'] . ' » est obligatoire.'); }
    }
    $json = json_encode($clean, JSON_UNESCAPED_UNICODE);
    if ($id) {
        $own = $pdo->prepare('SELECT 1 FROM custom_block_entries WHERE id=? AND block_id=? AND person_id=?'); $own->execute([$id, $blockId, $personId]);
        if (!$own->fetchColumn()) { throw new RuntimeException('Cette fiche n’appartient pas à ce bloc.'); }
    }
    if ($id) { $pdo->prepare('UPDATE custom_block_entries SET data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$json, $id]); }
    else { $pdo->prepare('INSERT INTO custom_block_entries(block_id, person_id, data_json, position) VALUES(?,?,?,(SELECT COALESCE(max(position),0)+1 FROM custom_block_entries WHERE block_id=? AND person_id=?))')->execute([$blockId, $personId, $json, $blockId, $personId]); $id = (int) $pdo->lastInsertId(); $pdo->prepare('INSERT OR IGNORE INTO custom_block_flags(block_id, person_id) VALUES(?,?)')->execute([$blockId, $personId]); }
    log_change($pdo, 'person', $personId, 'update', 'Bloc « ' . $def['name'] . ' » rempli');
    return ['id' => $id];
}

function delete_custom_block_entry(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    heritage_delete_media_links($pdo, 'custom_block_entry', $id);
    $pdo->prepare("DELETE FROM label_links WHERE entity_type='custom_block_entry' AND entity_id=?")->execute([$id]);
    $pdo->prepare('DELETE FROM custom_block_entries WHERE id=?')->execute([$id]);
    return ['ok' => true];
}

function set_custom_block_flags(PDO $pdo, array $data): array
{
    $personId = safe_int($data['person_id'] ?? 0);
    $pdo->prepare('DELETE FROM custom_block_flags WHERE person_id=?')->execute([$personId]);
    $ins = $pdo->prepare('INSERT OR IGNORE INTO custom_block_flags(block_id, person_id) VALUES(?,?)');
    foreach (is_array($data['block_ids'] ?? null) ? $data['block_ids'] : [] as $b) { if (safe_int($b)) { $ins->execute([safe_int($b), $personId]); } }
    return ['ok' => true];
}

/* ─── ⚖️ Comparer deux fiches avant fusion ────────────────────────────── */

function compare_people(PDO $pdo, int $a, int $b): array
{
    $one = static function (int $id) use ($pdo): array {
        $p = collection_people($pdo, [$id])[$id] ?? null;
        if (!$p) { throw new RuntimeException('Fiche introuvable : #' . $id); }
        $ev = $pdo->prepare("SELECT t.label, t.gedcom_tag, e.date_text, e.year, pl.name AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=? OR e.family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?) ORDER BY COALESCE(e.year,9999)");
        $ev->execute([$id, $id, $id]);
        $names = static fn(array $ids) => array_values(array_map(static fn($x) => trim($x['first_name'] . ' ' . $x['last_name']) . ($x['birth_year'] ? ' (' . $x['birth_year'] . ')' : ''), collection_people($pdo, $ids)));
        $sp = $pdo->prepare('SELECT CASE WHEN partner1_id=? THEN partner2_id ELSE partner1_id END FROM families WHERE partner1_id=? OR partner2_id=?'); $sp->execute([$id, $id, $id]);
        $count = static fn(string $sql) => (int) $pdo->query($sql)->fetchColumn();
        $pf = $pdo->prepare('SELECT DISTINCT family_id FROM family_children WHERE child_id=?'); $pf->execute([$id]); // familles de parents (avertissement avant fusion)
        return ['person' => $p, 'events' => $ev->fetchAll(), 'parents' => $names(h_parents($pdo, $id)), 'parent_families' => array_map('intval', $pf->fetchAll(PDO::FETCH_COLUMN)), 'spouses' => $names(array_filter(array_map('intval', $sp->fetchAll(PDO::FETCH_COLUMN)))), 'children' => $names(h_children($pdo, [$id])),
            'sources' => $count("SELECT count(*) FROM source_links WHERE (entity_type='person' AND entity_id={$id}) OR (entity_type='event' AND entity_id IN (SELECT id FROM events WHERE person_id={$id} OR family_id IN (SELECT id FROM families WHERE partner1_id={$id} OR partner2_id={$id})))"),
            'media' => $count("SELECT count(*) FROM media_links WHERE entity_type='person' AND entity_id={$id}"), 'notes' => $count("SELECT count(*) FROM notes WHERE entity_type='person' AND entity_id={$id}")];
    };
    return ['a' => $one($a), 'b' => $one($b)];
}

/* ─── 🏷️ Étiquettes sur tous les blocs ────────────────────────────────── */

/** Ajoute 'labels' à chaque ligne (étiquettes posées sur la fiche du bloc : voyage, armoiries, papier…). */
function with_labels(PDO $pdo, string $type, array $rows, string $idKey = 'id'): array
{
    if (!$rows) { return $rows; }
    $labels = collection_labels($pdo, $type, array_map(static fn($r) => (int) ($r[$idKey] ?? 0), $rows));
    foreach ($rows as &$r) { $r['labels'] = $labels[(int) ($r[$idKey] ?? 0)] ?? []; }
    unset($r);
    return $rows;
}

/** Formulaires de blocs : les étiquettes choisies (« pending_labels ») sont posées après l'enregistrement, même à la création. */
const LABELED_SAVE_ACTIONS = ['save_voyage' => 'voyage', 'save_placement' => 'placement', 'save_coat_of_arms' => 'coat_of_arms', 'save_poilu' => 'poilu', 'save_field_trip' => 'field_trip',
    'save_family_paper' => 'family_paper', 'save_old_map' => 'old_map', 'save_probate_inventory' => 'probate_inventory', 'save_help_request' => 'help_request', 'save_parish' => 'parish',
    'save_cited_name' => 'cited_name', 'save_resistance' => 'resistance', 'save_custom_block_entry' => 'custom_block_entry', 'save_village_profile' => 'village', 'save_my_list' => 'custom_list', 'save_my_list_record' => 'custom_list_record', 'save_voter_cards' => 'voter', 'save_booklet' => 'family_booklet', 'save_pet' => 'pet'];

function apply_pending_labels(PDO $pdo, string $action, array $data, $result): void
{
    if (!isset(LABELED_SAVE_ACTIONS[$action]) || !array_key_exists('pending_labels', $data)) { return; }
    $raw = $data['pending_labels'];
    if (is_string($raw)) { $raw = json_decode($raw, true); }
    if (!is_array($raw)) { return; }
    $type = LABELED_SAVE_ACTIONS[$action];
    $id = in_array($type, ['poilu', 'resistance', 'voter'], true) ? safe_int($data['person_id'] ?? 0) : safe_int(is_array($result) ? ($result['id'] ?? 0) : 0);
    if (!$id) { $id = safe_int($data['id'] ?? 0); }
    if ($id) { set_label_links($pdo, ['entity_type' => $type, 'entity_id' => $id, 'label_ids' => $raw]); }
}
