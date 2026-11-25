<?php
declare(strict_types=1);

/**
 * 👪 Le site familial, partie MAISON (maquette validée docs/design/site-familial-comptes.html).
 *
 * Des proches reçoivent un COMPTE : une invitation (un lien ou QR code, ou un code de 8 chiffres), puis un mot de passe qu'ils
 * choisissent eux-mêmes. Avec ce compte, depuis un appareil accepté par la porte du wifi (electron/lan-gate.js), ils ouvrent la
 * page de la famille (famille.php, assets/js/app-famille.js) : elle montre l'arbre selon LEURS droits et recueille leurs
 * propositions. Les décisions se prennent sur l'ordinateur principal (api.php, assets/js/heritage-comptes-famille.js).
 *
 * Droits (par niveaux, pas case par case) :
 *   👁 lire · ✎ proposer (rien n'entre sans accord) · 🌿 modifier une branche (écrit directement, SEULEMENT dans sa branche :
 *   ascendants ou descendants d'une personne ; tout passe au journal avec ↶) · ⚙ gérer (voit tout, écrit partout ; ne gère ni
 *   les comptes ni les propositions : cela reste sur l'ordinateur principal).
 * Vivants et fiches confidentielles : reconnus comme partout (gedcom_share_hidden, lib/gedcom.php : vivants déclarés ou
 * probables, fiches 🔒) ; selon le compte « cachés » (« Personne vivante » à leur place) ou « prénom seulement » ; « visibles »
 * seulement pour 🌿 (dans sa branche) et ⚙. Une fiche confidentielle n'est JAMAIS montrée (sauf ⚙). Événements 🔒 : retirés
 * (private_events_shadow). Une photo où figure une personne non visible n'est pas montrée.
 *
 * Sécurité (première fois que d'autres écrivent dans la base) :
 *  - famille.php n'accepte QUE des appareils invités signés par la porte (lan_device, sorte « lecture ») ; liste blanche des
 *    actions avec leur méthode (FC_GUEST_ACTIONS) ; jeton CSRF à chaque écriture ; séance à part (cookie « lcnda_famille »,
 *    HttpOnly, SameSite=Strict), liée à l'appareil, à la généalogie, au lancement de l'app et à la « génération » du compte
 *    (changer les droits, retirer le compte ou un nouveau mot de passe ferme toutes ses séances) ; 60 min sans geste : refermée ;
 *  - mots de passe : password_hash (après une empreinte SHA-384, comme lib/verrou.php), 8 caractères au moins ; jamais gardés
 *    en clair ; 5 essais ratés → ce compte ET cet appareil attendent 15 min ; 30 essais ratés en tout → plus d'essai pour
 *    personne pendant 15 min ; même message pour un identifiant inconnu (et le même temps de calcul) ;
 *  - invitation : jeton de 48 caractères (lien / QR) ou code de 8 chiffres, une seule fois, 7 jours ; seules leurs empreintes
 *    sont gardées ; un code faux compte comme un essai raté ;
 *  - droits vérifiés côté serveur à CHAQUE action (fc_mode, fc_in_branch) : une fiche qu'on ne voit pas répond comme une fiche
 *    qui n'existe pas ; une écriture hors de sa branche est refusée et notée au journal ;
 *  - un appareil relié à un compte (ou tous les appareils sans compte, réglage) ne joint plus QUE famille.php et les fichiers de
 *    l'app (lib/reseau_local.php) : il ne lit plus l'app entière en lecture seule ;
 *  - photos jointes : vérifiées et réenregistrées comme celles du téléphone de terrain (tw_image : type réel, bombe de
 *    décompression, EXIF/GPS retirés), rangées hors des médias jusqu'à l'accord.
 *
 * 🌐 EN LIGNE : seulement les fondations (fc_publish_*, fc_releve) — voir docs/site-familial-en-ligne.md.
 */

const FC_ROLES = ['lire' => 1, 'proposer' => 2, 'branche' => 3, 'gerer' => 4];
const FC_SCOPES = ['tout', 'ascendants', 'descendants'];
const FC_LIVING = ['caches', 'prenom', 'visibles'];
/** Les seules actions de la page de la famille (famille.php), avec leur méthode. Liste blanche : tout le reste est refusé. */
const FC_GUEST_ACTIONS = ['state' => 'GET', 'join' => 'POST', 'login' => 'POST', 'logout' => 'POST', 'search' => 'GET', 'person' => 'GET', 'media' => 'GET',
    'similar' => 'GET', 'mine' => 'GET', 'propose' => 'POST', 'withdraw' => 'POST', 'edit' => 'POST', 'edit_undo' => 'POST'];
const FC_SETTINGS_KEY = 'lcnda-comptes-famille'; // hors « genealogie-… » : save_settings (et donc un invité) ne peut pas l'écrire
const FC_SPEC = ['sans_compte' => ['app', 'famille'], 'visites' => ['oui', 'non']];
const FC_IDLE_MIN = 60;
const FC_TRIES = 5;
const FC_PAUSE = 15 * 60;
const FC_ALL_TRIES = 30;
const FC_INVITE_DAYS = 7;
const FC_PW_MIN = 8;
const FC_RATE_HOUR = 40;        // propositions ou modifications par heure et par compte
const FC_MAX_PENDING = 100;     // propositions en attente par compte
const FC_PHOTO_MB = 15;
const FC_BOX_BYTES = 2 * 1024 * 1024 * 1024;
const FC_UNDO_GUEST_S = 600;    // le cousin peut reprendre sa proposition retirée pendant 10 min
const FC_FIELDS = ['first_name' => 'text', 'last_name' => 'text', 'occupation' => 'text', 'BIRT' => 'event', 'BAPM' => 'event', 'DEAT' => 'event', 'BURI' => 'event'];
const FC_FIELD_LABELS = ['first_name' => 'Prénom', 'last_name' => 'Nom', 'occupation' => 'Métier', 'BIRT' => 'Naissance', 'BAPM' => 'Baptême', 'DEAT' => 'Décès', 'BURI' => 'Inhumation'];
const FC_KINDS = ['fait', 'note', 'photo', 'personne'];
const FC_RELATIONS = ['enfant', 'conjoint', 'parent'];
const FC_ERR_LOGIN = 'Identifiant ou mot de passe incorrect.';

final class FcRefuse extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 422, public readonly array $extra = []) { parent::__construct($message); }
}

/* ═════════════════ structure, réglages, petits outils ═════════════════ */

function fc_schema(PDO $pdo): void
{
    static $done = [];
    if (isset($done[spl_object_id($pdo)])) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS fc_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', relation TEXT NOT NULL DEFAULT '',
        login TEXT NOT NULL DEFAULT '', pw_hash TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'proposer', scope_kind TEXT NOT NULL DEFAULT 'tout',
        scope_person INTEGER NOT NULL DEFAULT 0, living TEXT NOT NULL DEFAULT 'caches', can_attach INTEGER NOT NULL DEFAULT 1, can_notes INTEGER NOT NULL DEFAULT 0,
        created_ts INTEGER NOT NULL DEFAULT 0, last_seen_ts INTEGER NOT NULL DEFAULT 0, removed_ts INTEGER NOT NULL DEFAULT 0, gen INTEGER NOT NULL DEFAULT 1)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS fc_invites (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, code_hash TEXT NOT NULL, token_hash TEXT NOT NULL,
        created_ts INTEGER NOT NULL DEFAULT 0, expires_ts INTEGER NOT NULL DEFAULT 0, used_ts INTEGER NOT NULL DEFAULT 0)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS fc_devices (device_id TEXT PRIMARY KEY, account_id INTEGER NOT NULL DEFAULT 0, device_name TEXT NOT NULL DEFAULT '',
        linked_ts INTEGER NOT NULL DEFAULT 0, last_ts INTEGER NOT NULL DEFAULT 0)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS fc_tries (k TEXT PRIMARY KEY, fails INTEGER NOT NULL DEFAULT 0, first_ts INTEGER NOT NULL DEFAULT 0, until_ts INTEGER NOT NULL DEFAULT 0)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS fc_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL DEFAULT 0, account_name TEXT NOT NULL DEFAULT '',
        origin TEXT NOT NULL DEFAULT 'maison', device_name TEXT NOT NULL DEFAULT '', created_ts INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL, person_id INTEGER NOT NULL DEFAULT 0,
        field TEXT NOT NULL DEFAULT '', old_json TEXT NOT NULL DEFAULT '', new_json TEXT NOT NULL DEFAULT '', comment TEXT NOT NULL DEFAULT '', file TEXT NOT NULL DEFAULT '',
        file_size INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'attente', direct INTEGER NOT NULL DEFAULT 0, decided_ts INTEGER NOT NULL DEFAULT 0,
        decision_note TEXT NOT NULL DEFAULT '', applied_json TEXT NOT NULL DEFAULT '')");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_fc_prop_status ON fc_proposals(status, created_ts)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_fc_prop_account ON fc_proposals(account_id, created_ts)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS fc_journal (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL DEFAULT 0, account_id INTEGER NOT NULL DEFAULT 0,
        account_name TEXT NOT NULL DEFAULT '', device_name TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, person_id INTEGER NOT NULL DEFAULT 0, label TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '', prop_id INTEGER NOT NULL DEFAULT 0, day TEXT NOT NULL DEFAULT '', n INTEGER NOT NULL DEFAULT 1)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_fc_journal_ts ON fc_journal(ts)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS fc_publish (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL, made_ts INTEGER NOT NULL DEFAULT 0, map_json TEXT NOT NULL DEFAULT '{}',
        counts_json TEXT NOT NULL DEFAULT '{}')");
    $done[spl_object_id($pdo)] = true;
}

function fc_now(): int { return function_exists('glock_now') ? glock_now() : time(); }

function fc_has_table(PDO $pdo, string $t): bool
{
    try { $s = $pdo->prepare("SELECT 1 FROM main.sqlite_master WHERE type='table' AND name=?"); $s->execute([$t]); return (bool) $s->fetchColumn(); } catch (Throwable $_) { return false; }
}

function fc_defaults(): array { return array_map(static fn(array $o) => $o[0], FC_SPEC); }

function fc_settings(PDO $pdo): array
{
    $raw = null;
    try { $s = $pdo->prepare('SELECT value FROM app_settings WHERE key=?'); $s->execute([FC_SETTINGS_KEY]); $raw = $s->fetchColumn(); } catch (Throwable $_) {}
    $j = json_decode((string) ($raw ?: ''), true);
    $out = fc_defaults();
    if (is_array($j)) { foreach (FC_SPEC as $k => $opts) { if (isset($j[$k]) && in_array($j[$k], $opts, true)) { $out[$k] = $j[$k]; } } }
    return $out;
}

function fc_settings_save(PDO $pdo, array $d): array
{
    $prev = fc_settings($pdo);
    $next = $prev;
    foreach ((is_array($d['settings'] ?? null) ? $d['settings'] : []) as $k => $v) {
        if (is_string($k) && isset(FC_SPEC[$k]) && is_string($v) && in_array($v, FC_SPEC[$k], true)) { $next[$k] = $v; }
    }
    $pdo->prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP')
        ->execute([FC_SETTINGS_KEY, json_encode($next, JSON_UNESCAPED_UNICODE)]);
    return ['settings' => $next, 'prev' => $prev];
}

/** Une ligne de texte venue d'un invité : sans caractère de contrôle ni sens d'écriture caché, bornée. */
function fc_line(mixed $v, int $max = 200): string
{
    $s = is_string($v) ? $v : (is_int($v) || is_float($v) ? (string) $v : '');
    if (!mb_check_encoding($s, 'UTF-8')) { $s = mb_convert_encoding($s, 'UTF-8', 'UTF-8'); }
    $s = (string) preg_replace('/[\x00-\x1f\x7f-\x9f\x{200b}-\x{200f}\x{202a}-\x{202e}\x{2066}-\x{2069}\x{feff}]+/u', ' ', $s);
    return mb_substr(trim((string) preg_replace('/\s+/u', ' ', $s)), 0, $max);
}
/** Un texte de plusieurs lignes (souvenir, commentaire) : les retours à la ligne restent, le reste comme fc_line. */
function fc_text(mixed $v, int $max = 4000): string
{
    $s = is_string($v) ? $v : '';
    if (!mb_check_encoding($s, 'UTF-8')) { $s = mb_convert_encoding($s, 'UTF-8', 'UTF-8'); }
    $s = str_replace(["\r\n", "\r"], "\n", $s);
    $s = (string) preg_replace('/[\x00-\x09\x0b-\x1f\x7f-\x9f\x{200b}-\x{200f}\x{202a}-\x{202e}\x{2066}-\x{2069}\x{feff}]+/u', ' ', $s);
    $s = (string) preg_replace("/\n{3,}/", "\n\n", $s);
    return mb_substr(trim($s), 0, $max);
}
function fc_login_norm(mixed $v): string
{
    $s = mb_strtolower(fc_line($v, 60));
    $s = function_exists('ascii_fold') ? ascii_fold($s) : $s;
    $s = (string) preg_replace('/[^a-z0-9._-]+/', '.', $s);
    return trim((string) preg_replace('/\.{2,}/', '.', $s), '.-_');
}
function fc_pw(mixed $v): string { return is_string($v) ? $v : ''; }
function fc_prehash(string $pw): string { return base64_encode(hash('sha384', "lcnda-famille\0" . $pw, true)); }
function fc_pw_hash(string $pw): string { return password_hash(fc_prehash($pw), PASSWORD_DEFAULT); }
function fc_pw_ok(string $pw, string $hash): bool { return $hash !== '' && password_verify(fc_prehash($pw), $hash); }
function fc_pw_check_new(string $pw, string $again): void
{
    if (mb_strlen($pw) < FC_PW_MIN) { throw new FcRefuse('Choisis un mot de passe d’au moins 8 caractères.'); }
    if (strlen($pw) > 1024) { throw new FcRefuse('Ce mot de passe est trop long.'); }
    if ($again !== $pw) { throw new FcRefuse('Les deux mots de passe ne sont pas les mêmes.'); }
}
function fc_person_name(array $p): string { return trim(trim((string) ($p['first_name'] ?? '')) . ' ' . mb_strtoupper(trim((string) ($p['last_name'] ?? '')))); }
function fc_first(string $first): string { return trim(preg_split('/\s+/u', trim($first))[0] ?? ''); }
function fc_year_of(string $date): ?int
{
    return preg_match_all('/(?<!\d)(\d{3,4})(?!\d)/', $date, $m) ? (($y = (int) end($m[1])) >= 500 && $y <= 2100 ? $y : null) : null;
}
function fc_role_n(array $a): int { return FC_ROLES[(string) ($a['role'] ?? '')] ?? 0; }
function fc_can(array $a, string $role): bool { return fc_role_n($a) >= (FC_ROLES[$role] ?? 99); }

/* ═════════════════ les comptes (l'ordinateur principal) ═════════════════ */

/** Règles d'un compte : 👁 / ✎ ne voient jamais les vivants en entier ; 🌿 a besoin d'une branche ; ⚙ voit tout. */
function fc_account_norm(PDO $pdo, array $d, ?array $before = null): array
{
    $role = is_string($d['role'] ?? null) && isset(FC_ROLES[$d['role']]) ? (string) $d['role'] : (string) ($before['role'] ?? 'proposer');
    $scope = is_string($d['scope_kind'] ?? null) && in_array($d['scope_kind'], FC_SCOPES, true) ? (string) $d['scope_kind'] : (string) ($before['scope_kind'] ?? 'tout');
    $person = array_key_exists('scope_person', $d) ? (int) (is_numeric($d['scope_person']) ? $d['scope_person'] : 0) : (int) ($before['scope_person'] ?? 0);
    $living = is_string($d['living'] ?? null) && in_array($d['living'], FC_LIVING, true) ? (string) $d['living'] : (string) ($before['living'] ?? 'caches');
    $name = array_key_exists('name', $d) ? fc_line($d['name'], 80) : (string) ($before['name'] ?? '');
    if ($name === '') { throw new LcndaBadInput('Donne un nom à ce compte (pour toi).'); }
    if ($role === 'gerer') { $scope = 'tout'; $living = 'visibles'; }
    if ($role === 'branche' && $scope === 'tout') { throw new LcndaBadInput('🌿 Modifier une branche : choisis la branche (ancêtres ou descendants de quelqu’un).'); }
    if ($scope !== 'tout') {
        $s = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $s->execute([$person]);
        if ($person <= 0 || !$s->fetchColumn()) { throw new LcndaBadInput('Choisis la personne de départ de cette partie de l’arbre.'); }
    } else { $person = 0; }
    if ($living === 'visibles' && !in_array($role, ['branche', 'gerer'], true)) { $living = 'prenom'; }
    $login = array_key_exists('login', $d) ? fc_login_norm($d['login']) : (string) ($before['login'] ?? '');
    if ($login === '') { $login = fc_login_norm($name); }
    if (strlen($login) < 3) { $login = $login . '.famille'; }
    $s = $pdo->prepare('SELECT id FROM fc_accounts WHERE login=? AND removed_ts=0 AND id<>?'); $s->execute([$login, (int) ($before['id'] ?? 0)]);
    if ($s->fetchColumn()) {
        if (array_key_exists('login', $d) && $before) { throw new LcndaBadInput('Cet identifiant est déjà pris par un autre compte.'); }
        for ($i = 2; $i < 100; $i++) { $s->execute([$login . $i, (int) ($before['id'] ?? 0)]); if (!$s->fetchColumn()) { $login .= $i; break; } }
    }
    $flag = static fn(string $k, int $def) => array_key_exists($k, $d) ? (!empty($d[$k]) && $d[$k] !== '0' ? 1 : 0) : (int) ($before[$k] ?? $def);
    return ['name' => $name, 'relation' => array_key_exists('relation', $d) ? fc_line($d['relation'], 80) : (string) ($before['relation'] ?? ''), 'login' => $login,
        'role' => $role, 'scope_kind' => $scope, 'scope_person' => $person, 'living' => $living,
        'can_attach' => $role === 'lire' ? 0 : $flag('can_attach', 1), 'can_notes' => $role === 'gerer' ? 1 : $flag('can_notes', 0)];
}

function fc_account(PDO $pdo, int $id, bool $withRemoved = false): ?array
{
    $s = $pdo->prepare('SELECT * FROM fc_accounts WHERE id=?' . ($withRemoved ? '' : ' AND removed_ts=0')); $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    return $r ?: null;
}

/** Une invitation : un jeton long (lien, QR code) et un code de 8 chiffres ; seules leurs empreintes sont gardées. */
function fc_invite_new(PDO $pdo, int $accountId): array
{
    $pdo->prepare('UPDATE fc_invites SET used_ts=-1 WHERE account_id=? AND used_ts=0')->execute([$accountId]); // les anciennes ne servent plus
    $code = sprintf('%08d', random_int(0, 99999999));
    $token = bin2hex(random_bytes(24));
    $exp = fc_now() + FC_INVITE_DAYS * 86400;
    $pdo->prepare('INSERT INTO fc_invites(account_id, code_hash, token_hash, created_ts, expires_ts) VALUES(?,?,?,?,?)')
        ->execute([$accountId, hash('sha256', 'fc-code|' . $code), hash('sha256', 'fc-token|' . $token), fc_now(), $exp]);
    return ['code' => $code, 'token' => $token, 'expires' => $exp];
}

function fc_account_out(PDO $pdo, array $a): array
{
    $scopeName = '';
    if ((int) $a['scope_person'] > 0) { $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $s->execute([(int) $a['scope_person']]); $p = $s->fetch(PDO::FETCH_ASSOC); $scopeName = $p ? fc_person_name($p) : ''; }
    $inv = $pdo->prepare('SELECT expires_ts FROM fc_invites WHERE account_id=? AND used_ts=0 AND expires_ts>? ORDER BY id DESC LIMIT 1'); $inv->execute([(int) $a['id'], fc_now()]);
    $devs = $pdo->prepare('SELECT device_name, last_ts FROM fc_devices WHERE account_id=? ORDER BY last_ts DESC'); $devs->execute([(int) $a['id']]);
    $pend = $pdo->prepare("SELECT count(*) FROM fc_proposals WHERE account_id=? AND status='attente'"); $pend->execute([(int) $a['id']]);
    return ['id' => (int) $a['id'], 'name' => (string) $a['name'], 'relation' => (string) $a['relation'], 'login' => (string) $a['login'], 'role' => (string) $a['role'],
        'scope_kind' => (string) $a['scope_kind'], 'scope_person' => (int) $a['scope_person'], 'scope_name' => $scopeName, 'living' => (string) $a['living'],
        'can_attach' => (int) $a['can_attach'], 'can_notes' => (int) $a['can_notes'], 'has_password' => (string) $a['pw_hash'] !== '', 'last_seen' => (int) $a['last_seen_ts'],
        'invite_expires' => (int) ($inv->fetchColumn() ?: 0), 'devices' => $devs->fetchAll(PDO::FETCH_ASSOC), 'pending' => (int) $pend->fetchColumn(), 'removed' => (int) $a['removed_ts']];
}

/* ═════════════════ essais du mot de passe et des codes ═════════════════ */

/** Le temps d'attente (secondes) imposé à l'une de ces clés, 0 s'il n'y en a pas. */
function fc_tries_wait(PDO $pdo, array $keys): int
{
    $wait = 0;
    $s = $pdo->prepare('SELECT until_ts FROM fc_tries WHERE k=?');
    foreach ($keys as $k) { $s->execute([$k]); $wait = max($wait, (int) $s->fetchColumn() - fc_now()); }
    return max(0, $wait);
}
function fc_tries_fail(PDO $pdo, array $keys): void
{
    $now = fc_now();
    foreach ($keys as $k) {
        $limit = $k === 'all' ? FC_ALL_TRIES : FC_TRIES;
        $s = $pdo->prepare('SELECT fails, first_ts FROM fc_tries WHERE k=?'); $s->execute([$k]); $r = $s->fetch(PDO::FETCH_ASSOC) ?: ['fails' => 0, 'first_ts' => $now];
        $fails = (int) $r['fails']; $first = (int) $r['first_ts'];
        if ($now - $first > FC_PAUSE) { $fails = 0; $first = $now; } // une fenêtre de 15 min
        $fails++;
        $until = 0;
        if ($fails >= $limit) { $until = $now + FC_PAUSE; $fails = 0; $first = $now; }
        $pdo->prepare('INSERT INTO fc_tries(k, fails, first_ts, until_ts) VALUES(?,?,?,?) ON CONFLICT(k) DO UPDATE SET fails=excluded.fails, first_ts=excluded.first_ts, until_ts=CASE WHEN excluded.until_ts>0 THEN excluded.until_ts ELSE fc_tries.until_ts END')
            ->execute([$k, $fails, $first, $until]);
    }
}
function fc_tries_clear(PDO $pdo, array $keys): void
{
    $s = $pdo->prepare('DELETE FROM fc_tries WHERE k=?');
    foreach ($keys as $k) { if ($k !== 'all') { $s->execute([$k]); } }
}
function fc_tries_refuse(int $wait): never
{
    header('Retry-After: ' . $wait);
    fc_json(['error' => i18n_t('Trop d’essais : réessaie dans {n} min.', ['n' => max(1, (int) ceil($wait / 60))]), 'wait' => $wait], 429);
}

/* ═════════════════ qui voit quoi ═════════════════ */

/** id => 'living' | 'private' : la même règle que l'export « Pour partager » (gedcom_share_hidden), sans délai après décès. */
function fc_hidden(PDO $pdo): array
{
    static $memo = [];
    $k = spl_object_id($pdo);
    if (isset($memo[$k])) { return $memo[$k]; }
    if (!function_exists('gedcom_share_hidden')) { require_once __DIR__ . '/gedcom.php'; }
    if (!function_exists('export_death_cutoff_year')) {
        // famille.php ne charge pas api.php : sans délai après décès ici (seulement les vivants). Déclarée seulement à l'appel :
        // jamais avant api.php (router.php charge ce fichier avant lui).
        function export_death_cutoff_year(): ?int { return null; }
    }
    // main.* : jamais les vues temporaires qui cachent les événements confidentiels (un décès confidentiel reste un décès)
    $rows = $pdo->query("SELECT p.id, p.living_status, p.is_private, p.first_name, p.last_name,
            MIN(CASE WHEN t.gedcom_tag IN ('BIRT','CHR','BAPM') THEN e.year END) AS birth_year,
            MIN(CASE WHEN t.gedcom_tag IN ('DEAT','BURI','CREM') THEN e.year END) AS death_year
        FROM main.persons p LEFT JOIN main.events e ON e.person_id=p.id LEFT JOIN main.event_types t ON t.id=e.event_type_id GROUP BY p.id")->fetchAll(PDO::FETCH_ASSOC);
    $marr = [];
    foreach ($pdo->query("SELECT f.partner1_id, f.partner2_id, MIN(e.year) AS y FROM main.events e JOIN main.event_types t ON t.id=e.event_type_id JOIN main.families f ON f.id=e.family_id WHERE t.gedcom_tag IN ('MARR','MRCI','MRRE') AND e.year IS NOT NULL GROUP BY f.id") as $f) {
        foreach (['partner1_id', 'partner2_id'] as $c) { $id = (int) ($f[$c] ?? 0); if ($id && (!isset($marr[$id]) || (int) $f['y'] < $marr[$id])) { $marr[$id] = (int) $f['y']; } }
    }
    foreach ($rows as &$r) { $r['marr_year'] = $marr[(int) $r['id']] ?? null; }
    unset($r);
    $families = $pdo->query('SELECT id, partner1_id, partner2_id FROM main.families')->fetchAll(PDO::FETCH_ASSOC);
    $saved = $_GET['death_cutoff_year'] ?? null; unset($_GET['death_cutoff_year']);
    try { $hidden = gedcom_share_hidden($pdo, $rows, $families); } finally { if ($saved !== null) { $_GET['death_cutoff_year'] = $saved; } }
    return $memo[$k] = $hidden;
}

/** La branche d'un compte : null = tout l'arbre ; sinon id => true. */
function fc_scope_ids(PDO $pdo, array $a): ?array
{
    if (($a['role'] ?? '') === 'gerer' || ($a['scope_kind'] ?? 'tout') === 'tout') { return null; }
    $pid = (int) $a['scope_person'];
    if ($pid <= 0) { return []; }
    return $a['scope_kind'] === 'ascendants' ? array_fill_keys(array_keys(h_ancestors($pdo, $pid, 60)), true) : h_descendants($pdo, [$pid], 60, true);
}

/**
 * Ce que ce compte voit d'une fiche : 'full' (tout), 'first' (le prénom seulement), 'living' (« Personne vivante » à sa place),
 * 'none' (rien : n'existe pas pour lui — confidentielle, hors de sa partie de l'arbre, ou introuvable).
 */
function fc_mode(PDO $pdo, array $a, int $id, ?array $scope = null, bool $scopeKnown = false): string
{
    if ($id <= 0) { return 'none'; }
    $s = $pdo->prepare('SELECT 1 FROM main.persons WHERE id=?'); $s->execute([$id]);
    if (!$s->fetchColumn()) { return 'none'; }
    if (($a['role'] ?? '') === 'gerer') { return 'full'; }
    if (!$scopeKnown) { $scope = fc_scope_ids($pdo, $a); }
    if ($scope !== null && !isset($scope[$id])) { return 'none'; }
    $h = fc_hidden($pdo)[$id] ?? '';
    if ($h === 'private') { return 'none'; }
    if ($h === 'living') {
        return match ((string) $a['living']) { 'visibles' => ($a['role'] === 'branche' ? 'full' : 'first'), 'prenom' => 'first', default => 'living' };
    }
    return 'full';
}

/** Une fiche que ce compte peut modifier directement : 🌿 dans sa branche (et visible en entier), ⚙ partout ; jamais verrouillée. */
function fc_in_branch(PDO $pdo, array $a, int $id): bool
{
    if (!fc_can($a, 'branche')) { return false; }
    return fc_mode($pdo, $a, $id) === 'full';
}

function fc_person_locked(PDO $pdo, int $id): bool
{
    $s = $pdo->prepare('SELECT COALESCE(is_locked,0) FROM main.persons WHERE id=?'); $s->execute([$id]);
    return (int) $s->fetchColumn() === 1;
}

/** Les personnes qu'un média montre (reliées à la fiche, à un événement, à une famille, repérées sur l'image, portrait). */
function fc_media_people(PDO $pdo, int $mid): array
{
    $who = [];
    $s = $pdo->prepare("SELECT ml.entity_type, ml.entity_id, e.person_id AS ev_person, e.family_id AS ev_family FROM main.media_links ml LEFT JOIN main.events e ON ml.entity_type='event' AND e.id=ml.entity_id WHERE ml.media_id=?");
    $s->execute([$mid]);
    $fam = $pdo->prepare('SELECT partner1_id, partner2_id FROM main.families WHERE id=?');
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $l) {
        $t = (string) $l['entity_type']; $eid = (int) $l['entity_id'];
        if ($t === 'person') { $who[] = $eid; }
        elseif ($t === 'event') { if ((int) $l['ev_person']) { $who[] = (int) $l['ev_person']; } if ((int) $l['ev_family']) { $fam->execute([(int) $l['ev_family']]); $f = $fam->fetch(PDO::FETCH_ASSOC) ?: []; $who[] = (int) ($f['partner1_id'] ?? 0); $who[] = (int) ($f['partner2_id'] ?? 0); } }
        elseif ($t === 'family') { $fam->execute([$eid]); $f = $fam->fetch(PDO::FETCH_ASSOC) ?: []; $who[] = (int) ($f['partner1_id'] ?? 0); $who[] = (int) ($f['partner2_id'] ?? 0); }
        else { $who[] = -1; } // relié à autre chose (source, lieu…) : on ne sait pas qui y figure — pas montré
    }
    try { $t = $pdo->prepare('SELECT person_id FROM media_tags WHERE media_id=? AND person_id IS NOT NULL'); $t->execute([$mid]); foreach ($t->fetchAll(PDO::FETCH_COLUMN) as $pid) { $who[] = (int) $pid; } } catch (Throwable $_) {}
    $p = $pdo->prepare('SELECT id FROM main.persons WHERE portrait_media_id=?'); $p->execute([$mid]);
    foreach ($p->fetchAll(PDO::FETCH_COLUMN) as $pid) { $who[] = (int) $pid; }
    return array_values(array_unique(array_filter($who, static fn($x) => $x !== 0)));
}
/** Un média se montre si c'est une image et si TOUTES les personnes qui y figurent sont visibles en entier pour ce compte. */
function fc_media_ok(PDO $pdo, array $a, int $mid, ?array $scope): ?array
{
    $s = $pdo->prepare("SELECT id, title, filename, media_type FROM main.media WHERE id=?"); $s->execute([$mid]); $m = $s->fetch(PDO::FETCH_ASSOC);
    if (!$m || (string) $m['media_type'] !== 'image' || !in_array(strtolower(pathinfo((string) $m['filename'], PATHINFO_EXTENSION)), ['jpg', 'jpeg', 'png', 'webp', 'gif'], true)) { return null; }
    $who = fc_media_people($pdo, $mid);
    if (!$who) { return null; }
    foreach ($who as $pid) { if ($pid < 0 || fc_mode($pdo, $a, $pid, $scope, true) !== 'full') { return null; } }
    // une photo reliée seulement à un événement confidentiel ne se montre pas (hors ⚙)
    if (($a['role'] ?? '') !== 'gerer') {
        $e = $pdo->prepare("SELECT 1 FROM main.media_links ml JOIN main.events e ON e.id=ml.entity_id WHERE ml.media_id=? AND ml.entity_type='event' AND COALESCE(e.is_private,0)=1"); $e->execute([$mid]);
        if ($e->fetchColumn()) { return null; }
    }
    return $m;
}

/** Les noms complets des personnes que ce compte ne voit pas en entier : retirés des textes montrés (notes). */
function fc_forbidden_names(PDO $pdo, array $a, ?array $scope): array
{
    if (($a['role'] ?? '') === 'gerer') { return []; }
    $out = [];
    $s = $pdo->prepare('SELECT first_name, last_name FROM main.persons WHERE id=?');
    foreach (fc_hidden($pdo) as $id => $_) {
        if (fc_mode($pdo, $a, (int) $id, $scope, true) === 'full') { continue; }
        $s->execute([(int) $id]); $p = $s->fetch(PDO::FETCH_ASSOC); if (!$p) { continue; }
        $f = trim((string) $p['first_name']); $l = trim((string) $p['last_name']);
        if ($f === '' || $l === '') { continue; }
        $one = fc_first($f);
        foreach (array_unique([$f . ' ' . $l, $l . ' ' . $f, $one . ' ' . $l, $l . ' ' . $one]) as $n) { if (mb_strlen($n) >= 5) { $out[] = $n; } }
    }
    $out = array_values(array_unique($out));
    usort($out, static fn($x, $y) => mb_strlen($y) <=> mb_strlen($x));
    return $out;
}
function fc_redact(string $s, array $names): string
{
    foreach ($names as $name) {
        $re = '/(?<![\p{L}])' . implode('[\s\-]+', array_map(static fn($w) => preg_quote($w, '/'), preg_split('/\s+/u', $name))) . '(?![\p{L}])/iu';
        $s = (string) preg_replace($re, '[nom retiré]', $s);
    }
    return $s;
}

function fc_years(PDO $pdo, int $id): string
{
    $s = $pdo->prepare("SELECT t.gedcom_tag AS tag, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=? AND e.year IS NOT NULL AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI') ORDER BY e.id");
    $s->execute([$id]);
    $b = null; $d = null;
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $e) { if (in_array($e['tag'], ['BIRT', 'CHR', 'BAPM'], true)) { $b ??= (int) $e['year']; } else { $d ??= (int) $e['year']; } }
    return $b === null && $d === null ? '' : trim(($b ?? '?') . ' – ' . ($d ?? ''), ' –');
}
/** Un proche montré selon ce que le compte en voit (rien d'autre que ce mode ne sort). */
function fc_rel(PDO $pdo, array $a, int $id, ?array $scope): ?array
{
    $m = fc_mode($pdo, $a, $id, $scope, true);
    if ($m === 'none') { return null; }
    if ($m === 'living') { return ['living' => true]; }
    $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $s->execute([$id]); $p = $s->fetch(PDO::FETCH_ASSOC) ?: [];
    if ($m === 'first') { $f = fc_first((string) ($p['first_name'] ?? '')); return ['first' => $f !== '' ? $f : '?', 'living' => true]; }
    return ['id' => $id, 'name' => fc_person_name($p), 'years' => fc_years($pdo, $id)];
}

/* ═════════════════ la séance d'un invité ═════════════════ */

function fc_json(array $d, int $status = 200): never
{
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    json_response($d + ['famille' => true], $status);
}

function fc_device(): array
{
    $d = function_exists('lan_device') ? lan_device() : null;
    if (!$d || !empty($d['forged']) || ($d['kind'] ?? '') !== 'lecture') { fc_json(['error' => 'Refusé.'], 403); }
    return $d;
}

/** Le compte de cette séance, ou null (vérifié à chaque demande : appareil, généalogie, lancement, génération, inactivité). */
function fc_current(PDO $pdo, array $dev): ?array
{
    $e = $_SESSION['fc'] ?? null;
    if (!is_array($e) || !is_string($e['dev'] ?? null) || !hash_equals($dev['id'], $e['dev'])) { return null; }
    if (($e['g'] ?? '') !== glock_key() || (string) ($e['boot'] ?? '') !== glock_boot()) { return null; }
    if (fc_now() - (int) ($e['seen'] ?? 0) > FC_IDLE_MIN * 60) { return null; }
    $a = fc_account($pdo, (int) ($e['aid'] ?? 0));
    if (!$a || (string) $a['pw_hash'] === '' || (int) $a['gen'] !== (int) ($e['gen'] ?? -1)) { return null; }
    // un appareil relié depuis à un autre compte (connexion d'un autre cousin sur le même appareil) : cette séance ne vaut plus
    $s = $pdo->prepare('SELECT account_id FROM fc_devices WHERE device_id=?'); $s->execute([$dev['id']]);
    if ((int) $s->fetchColumn() !== (int) $a['id']) { return null; }
    if (fc_now() - (int) ($e['seen'] ?? 0) >= 20) {
        glock_session_write(static function (): void { if (isset($_SESSION['fc'])) { $_SESSION['fc']['seen'] = fc_now(); } });
        $pdo->prepare('UPDATE fc_accounts SET last_seen_ts=? WHERE id=?')->execute([fc_now(), (int) $a['id']]);
        $pdo->prepare('UPDATE fc_devices SET last_ts=? WHERE device_id=?')->execute([fc_now(), $dev['id']]);
    }
    return $a;
}
function fc_session_open(PDO $pdo, array $a, array $dev): void
{
    $pdo->prepare('INSERT INTO fc_devices(device_id, account_id, device_name, linked_ts, last_ts) VALUES(?,?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET account_id=excluded.account_id, device_name=excluded.device_name, last_ts=excluded.last_ts')
        ->execute([$dev['id'], (int) $a['id'], mb_substr((string) $dev['name'], 0, 40), fc_now(), fc_now()]);
    $pdo->prepare('UPDATE fc_accounts SET last_seen_ts=? WHERE id=?')->execute([fc_now(), (int) $a['id']]);
    glock_session_write(static function () use ($a, $dev): void {
        if (PHP_SAPI !== 'cli') { @session_regenerate_id(true); } // l'ancien identifiant de séance ne sert plus
        unset($_SESSION['csrf']); // un nouveau jeton CSRF après la connexion
        $_SESSION['fc'] = ['aid' => (int) $a['id'], 'gen' => (int) $a['gen'], 'dev' => $dev['id'], 'g' => glock_key(), 'boot' => glock_boot(), 'seen' => fc_now()];
        csrf_token();
    });
}

function fc_journal_add(PDO $pdo, ?array $a, string $kind, int $pid = 0, string $label = '', string $detail = '', int $propId = 0, string $device = ''): int
{
    $dev = $device !== '' ? $device : (function_exists('lan_device_name') ? lan_device_name() : '');
    $pdo->prepare('INSERT INTO fc_journal(ts, account_id, account_name, device_name, kind, person_id, label, detail, prop_id) VALUES(?,?,?,?,?,?,?,?,?)')
        ->execute([fc_now(), (int) ($a['id'] ?? 0), mb_substr((string) ($a['name'] ?? ''), 0, 80), mb_substr($dev, 0, 40), $kind, $pid, mb_substr($label, 0, 200), mb_substr($detail, 0, 400), $propId]);
    return (int) $pdo->lastInsertId();
}
/** Les fiches consultées : une ligne par compte et par jour, avec le nombre. */
function fc_visit(PDO $pdo, array $a): void
{
    if (fc_settings($pdo)['visites'] !== 'oui') { return; }
    $day = date('Y-m-d', fc_now());
    $s = $pdo->prepare("UPDATE fc_journal SET n=n+1, ts=? WHERE account_id=? AND kind='visite' AND day=?"); $s->execute([fc_now(), (int) $a['id'], $day]);
    if ($s->rowCount() === 0) {
        $pdo->prepare("INSERT INTO fc_journal(ts, account_id, account_name, device_name, kind, day, n) VALUES(?,?,?,?, 'visite', ?, 1)")
            ->execute([fc_now(), (int) $a['id'], (string) $a['name'], mb_substr(lan_device_name(), 0, 40), $day]);
    }
}

function fc_rights_out(PDO $pdo, array $a): array
{
    $scopeName = '';
    if ((int) $a['scope_person'] > 0 && fc_mode($pdo, $a, (int) $a['scope_person']) === 'full') { $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $s->execute([(int) $a['scope_person']]); $scopeName = fc_person_name($s->fetch(PDO::FETCH_ASSOC) ?: []); }
    return ['name' => (string) $a['name'], 'login' => (string) $a['login'], 'role' => (string) $a['role'], 'scope_kind' => (string) $a['scope_kind'], 'scope_name' => $scopeName,
        'scope_person' => $scopeName !== '' ? (int) $a['scope_person'] : 0, 'living' => (string) $a['living'], 'can_attach' => (bool) (int) $a['can_attach'], 'can_notes' => (bool) (int) $a['can_notes'],
        'can_propose' => fc_can($a, 'proposer'), 'can_edit' => fc_can($a, 'branche')];
}

/* ═════════════════ famille.php : la porte d'entrée des invités ═════════════════ */

function fc_guest_main(): never
{
    $dev = fc_device();
    $action = is_string($_GET['action'] ?? null) ? (string) $_GET['action'] : '';
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($action === '' && in_array($method, ['GET', 'HEAD'], true)) { fc_page(); }
    if (!isset(FC_GUEST_ACTIONS[$action])) { fc_json(['error' => 'Refusé.'], 403); }
    if (FC_GUEST_ACTIONS[$action] !== $method) { fc_json(['error' => 'Refusé.'], 405); }
    $g = $_SERVER['HTTP_X_GENEALOGY'] ?? null;
    if (is_string($g) && $g !== '' && $g !== glock_key()) { fc_json(['error' => 'Une autre généalogie est ouverte sur l’ordinateur : recharge la page.', 'genealogy_changed' => true], 409); }
    $payload = $method === 'POST' ? request_json() : [];
    if ($method === 'POST') { verify_csrf(is_array($payload) ? $payload : []); }
    try { $pdo = db(); } catch (Throwable $e) { fc_json(['error' => 'La généalogie n’est pas prête sur l’ordinateur.'], 503); }
    fc_schema($pdo);
    try {
        if ($action === 'join') { fc_guest_join($pdo, $dev, $payload); }
        if ($action === 'login') { fc_guest_login($pdo, $dev, $payload); }
        $a = fc_current($pdo, $dev);
        if ($action === 'state') {
            $base = ['genealogy' => glock_genealogy_name(), 'g' => glock_key(), 'device' => (string) $dev['name'], 'csrf' => csrf_token(), 'idle_min' => FC_IDLE_MIN, 'logged' => (bool) $a];
            if (!$a) {
                $s = $pdo->prepare('SELECT a.login FROM fc_devices d JOIN fc_accounts a ON a.id=d.account_id AND a.removed_ts=0 WHERE d.device_id=?'); $s->execute([$dev['id']]);
                fc_json($base + ['login_hint' => (string) ($s->fetchColumn() ?: '')]);
            }
            $start = (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn();
            $home = fc_mode($pdo, $a, $start) === 'full' ? $start : ((int) $a['scope_person'] > 0 && fc_mode($pdo, $a, (int) $a['scope_person']) === 'full' ? (int) $a['scope_person'] : 0);
            fc_json($base + ['account' => fc_rights_out($pdo, $a), 'home' => $home]);
        }
        if ($action === 'logout') {
            if ($a) { fc_journal_add($pdo, $a, 'deconnexion'); }
            glock_session_write(static function (): void { unset($_SESSION['fc']); if (PHP_SAPI !== 'cli') { @session_regenerate_id(true); } });
            fc_json(['ok' => true]);
        }
        if (!$a) { header('X-LCNDA-Famille: login'); fc_json(['error' => 'Connecte-toi d’abord (ton identifiant et ton mot de passe).', 'login' => true], 401); }
        $readOnly = in_array($action, ['search', 'person', 'media', 'similar', 'mine'], true);
        // les lectures : sans les événements confidentiels (sauf ⚙ gérer) — jamais avant une écriture (les vues temporaires ne s'écrivent pas)
        if ($readOnly && $a['role'] !== 'gerer' && function_exists('private_events_shadow') && !private_events_shadow($pdo)) { fc_json(['error' => 'Refusé.'], 503); }
        match ($action) {
            'search' => fc_guest_search($pdo, $a, is_string($_GET['q'] ?? null) ? (string) $_GET['q'] : ''),
            'person' => fc_guest_person($pdo, $a, (int) (is_numeric($_GET['id'] ?? null) ? $_GET['id'] : 0)),
            'media' => fc_guest_media($pdo, $a, (int) (is_numeric($_GET['id'] ?? null) ? $_GET['id'] : 0)),
            'similar' => fc_json(['people' => fc_similar($pdo, fc_line($_GET['first'] ?? '', 80), fc_line($_GET['last'] ?? '', 80), fc_year_of(fc_line($_GET['year'] ?? '', 20)), $a)]),
            'mine' => fc_guest_mine($pdo, $a),
            'propose' => fc_guest_propose($pdo, $a, $dev, is_array($payload) ? $payload : [], false),
            'edit' => fc_guest_propose($pdo, $a, $dev, is_array($payload) ? $payload : [], true),
            'withdraw' => fc_guest_withdraw($pdo, $a, is_array($payload) ? $payload : []),
            'edit_undo' => fc_guest_edit_undo($pdo, $a, is_array($payload) ? $payload : []),
            default => fc_json(['error' => 'Refusé.'], 403),
        };
    } catch (FcRefuse $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        fc_json(['error' => $e->getMessage()] + $e->extra, $e->status);
    } catch (LcndaBadInput $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        fc_json(['error' => $e->getMessage()], 422);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        error_log('LCNDA famille : ' . get_class($e) . ' ' . $e->getMessage());
        fc_json(['error' => 'Une erreur est survenue sur l’ordinateur : rien n’a été changé.'], 500);
    }
}

/** La page (aucune donnée de la généalogie dedans : elle se lit ensuite par famille.php?action=…). */
function fc_page(): never
{
    $lang = function_exists('i18n_lang') ? i18n_lang() : 'fr';
    http_response_code(200);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
    $v = static fn(string $f): string => (string) (@filemtime(APP_ROOT . '/' . $f) ?: 1);
    echo '<!doctype html><html lang="' . htmlspecialchars($lang, ENT_QUOTES, 'UTF-8') . '"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow">'
        . '<title>👪 ' . htmlspecialchars(i18n_t('La famille'), ENT_QUOTES, 'UTF-8') . '</title>'
        . '<link rel="stylesheet" href="assets/css/famille.css?v=' . $v('assets/css/famille.css') . '">'
        . '<script src="assets/js/app-i18n.js?v=' . $v('assets/js/app-i18n.js') . '"></script></head>'
        . '<body class="fam-body"><main id="fam" class="fam" aria-live="polite"></main>'
        . '<script src="assets/js/app-famille.js?v=' . $v('assets/js/app-famille.js') . '"></script></body></html>';
    exit;
}

/** Première venue : le jeton du lien (ou le code de 8 chiffres) et le mot de passe choisi deux fois. */
function fc_guest_join(PDO $pdo, array $dev, array $p): never
{
    $keys = ['dev:' . $dev['id'], 'all'];
    if ($w = fc_tries_wait($pdo, $keys)) { fc_tries_refuse($w); }
    $token = is_string($p['token'] ?? null) ? strtolower(trim($p['token'])) : '';
    $code = is_string($p['code'] ?? null) ? (string) preg_replace('/\D+/', '', $p['code']) : '';
    $row = null;
    if (preg_match('/^[a-f0-9]{48}$/', $token)) { $s = $pdo->prepare('SELECT * FROM fc_invites WHERE token_hash=? AND used_ts=0 AND expires_ts>?'); $s->execute([hash('sha256', 'fc-token|' . $token), fc_now()]); $row = $s->fetch(PDO::FETCH_ASSOC) ?: null; }
    elseif (preg_match('/^\d{8}$/', $code)) { $s = $pdo->prepare('SELECT * FROM fc_invites WHERE code_hash=? AND used_ts=0 AND expires_ts>?'); $s->execute([hash('sha256', 'fc-code|' . $code), fc_now()]); $row = $s->fetch(PDO::FETCH_ASSOC) ?: null; }
    $a = $row ? fc_account($pdo, (int) $row['account_id']) : null;
    if (!$row || !$a) {
        fc_tries_fail($pdo, $keys);
        usleep(300000);
        if ($w = fc_tries_wait($pdo, $keys)) { fc_tries_refuse($w); }
        fc_json(['error' => 'Invitation inconnue, déjà utilisée ou trop ancienne : demande-en une nouvelle.'], 403);
    }
    $pw = fc_pw($p['password'] ?? null);
    fc_pw_check_new($pw, fc_pw($p['password2'] ?? null));
    $pdo->beginTransaction();
    $u = $pdo->prepare('UPDATE fc_invites SET used_ts=? WHERE id=? AND used_ts=0'); $u->execute([fc_now(), (int) $row['id']]);
    if ($u->rowCount() !== 1) { $pdo->rollBack(); fc_json(['error' => 'Invitation inconnue, déjà utilisée ou trop ancienne : demande-en une nouvelle.'], 403); }
    $pdo->prepare('UPDATE fc_accounts SET pw_hash=?, gen=gen+1 WHERE id=?')->execute([fc_pw_hash($pw), (int) $a['id']]);
    $pdo->commit();
    fc_tries_clear($pdo, ['dev:' . $dev['id'], 'acct:' . $a['id']]);
    $a = fc_account($pdo, (int) $a['id']);
    fc_session_open($pdo, $a, $dev);
    fc_journal_add($pdo, $a, 'invitation', 0, '', 'mot de passe choisi');
    fc_json(['ok' => true, 'login' => (string) $a['login'], 'csrf' => csrf_token()]);
}

function fc_guest_login(PDO $pdo, array $dev, array $p): never
{
    $login = fc_login_norm($p['login'] ?? '');
    $s = $pdo->prepare("SELECT * FROM fc_accounts WHERE login=? AND removed_ts=0 AND pw_hash<>''"); $s->execute([$login]);
    $a = $login !== '' ? ($s->fetch(PDO::FETCH_ASSOC) ?: null) : null;
    $keys = ['dev:' . $dev['id'], 'all'];
    if ($a) { $keys[] = 'acct:' . $a['id']; }
    if ($w = fc_tries_wait($pdo, $keys)) { fc_tries_refuse($w); }
    $pw = fc_pw($p['password'] ?? null);
    // même calcul pour un identifiant inconnu (on n'apprend pas qu'il n'existe pas)
    $ok = fc_pw_ok($pw, $a ? (string) $a['pw_hash'] : '$2y$10$abcdefghijklmnopqrstuuJ4Q8kd5VqQ0x6h3XyM3k6m0Fq9uHq6W') && $a !== null && strlen($pw) <= 1024;
    if (!$ok) {
        fc_tries_fail($pdo, $keys);
        if ($a) { fc_journal_add($pdo, $a, 'echec', 0, '', 'mot de passe incorrect'); }
        usleep(300000);
        if ($w = fc_tries_wait($pdo, $keys)) { fc_tries_refuse($w); }
        fc_json(['error' => FC_ERR_LOGIN], 401);
    }
    fc_tries_clear($pdo, $keys);
    fc_session_open($pdo, $a, $dev);
    fc_journal_add($pdo, $a, 'connexion');
    fc_json(['ok' => true, 'login' => (string) $a['login'], 'csrf' => csrf_token()]);
}

function fc_guest_search(PDO $pdo, array $a, string $q): never
{
    $q = fc_line($q, 60);
    $fold = trim((string) preg_replace('/[%_\\\\]+/', ' ', search_fold($q)));
    if (preg_match_all('/\p{L}/u', $fold) < 2) { fc_json(['people' => []]); }
    $like = '%' . $fold . '%';
    $s = $pdo->prepare("SELECT p.id FROM persons p WHERE (lc_fold(p.first_name || ' ' || p.last_name) LIKE ? OR lc_fold(p.last_name || ' ' || p.first_name) LIKE ?) ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE, p.id LIMIT 400");
    $s->execute([$like, $like]);
    $scope = fc_scope_ids($pdo, $a);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $id) {
        if (fc_mode($pdo, $a, (int) $id, $scope, true) !== 'full') { continue; } // un vivant « prénom seulement » n'apparaît pas dans une recherche par nom
        $out[] = fc_rel($pdo, $a, (int) $id, $scope);
        if (count($out) >= 30) { break; }
    }
    fc_json(['people' => $out]);
}

/** Un fait de la fiche (pour la page et pour comparer une proposition) : texte ou {date, place}. Jamais un événement 🔒 (sauf $priv). */
function fc_fact_value(PDO $pdo, int $pid, string $field, bool $priv = false): array|string|null
{
    if (!isset(FC_FIELDS[$field])) { return null; }
    if (FC_FIELDS[$field] === 'text') { $s = $pdo->prepare("SELECT $field FROM main.persons WHERE id=?"); $s->execute([$pid]); return (string) $s->fetchColumn(); }
    $s = $pdo->prepare('SELECT e.id, e.date_text, COALESCE(e.is_private,0) AS priv, pl.name AS place FROM main.events e JOIN main.event_types t ON t.id=e.event_type_id LEFT JOIN main.places pl ON pl.id=e.place_id WHERE e.person_id=? AND t.gedcom_tag=? ORDER BY e.id LIMIT 1');
    $s->execute([$pid, $field]);
    $e = $s->fetch(PDO::FETCH_ASSOC);
    if (!$e) { return ['date' => '', 'place' => '']; }
    if ((int) $e['priv'] === 1 && !$priv) { return null; }
    return ['date' => (string) $e['date_text'], 'place' => (string) ($e['place'] ?? '')];
}
function fc_value_text(mixed $v): string
{
    if (is_array($v)) { return trim(implode(', ', array_filter([trim((string) ($v['date'] ?? '')), trim((string) ($v['place'] ?? ''))], static fn($x) => $x !== ''))); }
    return trim((string) $v);
}

function fc_guest_person(PDO $pdo, array $a, int $id): never
{
    $scope = fc_scope_ids($pdo, $a);
    if (fc_mode($pdo, $a, $id, $scope, true) !== 'full') { fc_json(['error' => 'Fiche introuvable.'], 404); } // la même réponse qu'une fiche qui n'existe pas
    $s = $pdo->prepare('SELECT * FROM persons WHERE id=?'); $s->execute([$id]); $p = $s->fetch(PDO::FETCH_ASSOC);
    $priv = $a['role'] === 'gerer';
    $facts = [];
    foreach (FC_FIELDS as $f => $type) {
        $v = fc_fact_value($pdo, $id, $f, $priv);
        if ($v === null) { continue; }
        $facts[] = ['field' => $f, 'label' => i18n_t(FC_FIELD_LABELS[$f]), 'type' => $type, 'value' => $v];
    }
    // les autres événements (pas les quatre ci-dessus) : sorte, date, lieu — jamais leur description
    $ev = $pdo->prepare("SELECT t.label, e.date_text, pl.name AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=? AND COALESCE(t.gedcom_tag,'') NOT IN ('BIRT','BAPM','DEAT','BURI') ORDER BY COALESCE(e.year,9999), e.id LIMIT 60");
    $ev->execute([$id]);
    $events = array_map(static fn($e) => ['label' => (string) $e['label'], 'date' => (string) $e['date_text'], 'place' => (string) ($e['place'] ?? '')], $ev->fetchAll(PDO::FETCH_ASSOC));
    // parents, couples, enfants
    $parents = [];
    $pf = $pdo->prepare('SELECT f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=? ORDER BY fc.id');
    $pf->execute([$id]);
    foreach ($pf->fetchAll(PDO::FETCH_ASSOC) as $f) { foreach ([(int) $f['partner1_id'], (int) $f['partner2_id']] as $x) { if ($x && ($r = fc_rel($pdo, $a, $x, $scope))) { $parents[] = $r; } } }
    $couples = [];
    $sf = $pdo->prepare('SELECT id, partner1_id, partner2_id FROM families WHERE partner1_id=? OR partner2_id=? ORDER BY id'); $sf->execute([$id, $id]);
    $kids = $pdo->prepare('SELECT child_id FROM family_children WHERE family_id=? ORDER BY position, id');
    $marr = $pdo->prepare("SELECT e.date_text, pl.name AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.family_id=? AND t.gedcom_tag IN ('MARR','MRCI','MRRE') ORDER BY e.id LIMIT 1");
    foreach ($sf->fetchAll(PDO::FETCH_ASSOC) as $f) {
        $other = (int) $f['partner1_id'] === $id ? (int) $f['partner2_id'] : (int) $f['partner1_id'];
        $sp = $other ? fc_rel($pdo, $a, $other, $scope) : null;
        $kids->execute([(int) $f['id']]);
        $children = [];
        foreach ($kids->fetchAll(PDO::FETCH_COLUMN) as $c) { if ($r = fc_rel($pdo, $a, (int) $c, $scope)) { $children[] = $r; } }
        if (!$sp && !$children && $other) { continue; } // un conjoint qu'on ne voit pas, sans enfant montré : rien
        $m = null;
        if ($sp && !empty($sp['id'])) { $marr->execute([(int) $f['id']]); $mm = $marr->fetch(PDO::FETCH_ASSOC); if ($mm) { $m = ['date' => (string) $mm['date_text'], 'place' => (string) ($mm['place'] ?? '')]; } }
        $couples[] = ['spouse' => $sp, 'marriage' => $m, 'children' => $children];
    }
    // photos : seulement celles où TOUT le monde est visible
    $photos = [];
    $ml = $pdo->prepare("SELECT DISTINCT media_id FROM media_links WHERE entity_type='person' AND entity_id=? ORDER BY position, id LIMIT 60"); $ml->execute([$id]);
    $mids = array_map('intval', $ml->fetchAll(PDO::FETCH_COLUMN));
    if ((int) ($p['portrait_media_id'] ?? 0)) { array_unshift($mids, (int) $p['portrait_media_id']); }
    foreach (array_unique($mids) as $mid) { if ($m = fc_media_ok($pdo, $a, $mid, $scope)) { $photos[] = ['id' => $mid, 'title' => (string) $m['title']]; } }
    $notes = [];
    if ((int) $a['can_notes'] === 1 || $a['role'] === 'gerer') {
        $names = fc_forbidden_names($pdo, $a, $scope);
        $n = $pdo->prepare("SELECT title, body FROM notes WHERE entity_type='person' AND entity_id=? ORDER BY id LIMIT 30"); $n->execute([$id]);
        foreach ($n->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $txt = trim(strip_tags((string) $r['title']) . "\n" . html_entity_decode(strip_tags(str_replace(['<br>', '<br/>', '<br />', '</p>'], "\n", (string) $r['body'])), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            if ($txt !== '') { $notes[] = mb_substr(fc_redact($txt, $names), 0, 8000); }
        }
    }
    $mine = $pdo->prepare("SELECT count(*) FROM fc_proposals WHERE account_id=? AND person_id=? AND status='attente'"); $mine->execute([(int) $a['id'], $id]);
    fc_visit($pdo, $a);
    fc_json(['person' => ['id' => $id, 'name' => fc_person_name($p), 'first_name' => (string) $p['first_name'], 'last_name' => (string) $p['last_name'], 'gender' => (string) $p['gender'],
        'years' => fc_years($pdo, $id), 'facts' => $facts, 'events' => $events, 'parents' => $parents, 'couples' => $couples, 'photos' => $photos, 'notes' => $notes,
        'locked' => (int) ($p['is_locked'] ?? 0) === 1, 'pending' => (int) $mine->fetchColumn()],
        'can' => ['propose' => fc_can($a, 'proposer'), 'edit' => fc_in_branch($pdo, $a, $id) && (int) ($p['is_locked'] ?? 0) !== 1, 'attach' => (int) $a['can_attach'] === 1]]);
}

function fc_guest_media(PDO $pdo, array $a, int $mid): never
{
    $m = fc_media_ok($pdo, $a, $mid, fc_scope_ids($pdo, $a));
    $root = realpath(MEDIA_DIR);
    $path = $m && $root ? realpath(MEDIA_DIR . '/' . (string) $m['filename']) : false;
    if (!$m || !$root || !$path || !str_starts_with($path, $root . DIRECTORY_SEPARATOR) || !is_file($path)) { fc_json(['error' => 'Introuvable.'], 404); }
    $type = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif'][strtolower(pathinfo($path, PATHINFO_EXTENSION))] ?? 'application/octet-stream';
    header('Content-Type: ' . $type);
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store, private');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    header('Content-Length: ' . filesize($path));
    while (ob_get_level() > 0) { ob_end_clean(); }
    readfile($path);
    exit;
}

/** « Cette personne existe peut-être déjà » : même nom de famille et même premier prénom, années proches (5 ans). */
function fc_similar(PDO $pdo, string $first, string $last, ?int $year, ?array $a = null): array
{
    $l = search_fold($last); $f = search_fold(fc_first($first));
    if (mb_strlen($l) < 2 || mb_strlen($f) < 2) { return []; }
    $s = $pdo->prepare("SELECT id FROM main.persons WHERE lc_fold(last_name)=? AND (lc_fold(first_name)=? OR lc_fold(first_name) LIKE ?) ORDER BY id LIMIT 200");
    $s->execute([$l, $f, $f . ' %']);
    $scope = $a ? fc_scope_ids($pdo, $a) : null;
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $id) {
        $id = (int) $id;
        if ($a && fc_mode($pdo, $a, $id, $scope, true) !== 'full') { continue; }
        $y = fc_years($pdo, $id);
        if ($year !== null && preg_match('/^(\d{3,4})/', $y, $m) && abs((int) $m[1] - $year) > 5) { continue; }
        $p = $pdo->prepare('SELECT first_name, last_name FROM main.persons WHERE id=?'); $p->execute([$id]);
        $out[] = ['id' => $id, 'name' => fc_person_name($p->fetch(PDO::FETCH_ASSOC) ?: []), 'years' => $y];
        if (count($out) >= 5) { break; }
    }
    return $out;
}

/* ═════════════════ une proposition (ou une modification directe dans sa branche) ═════════════════ */

function fc_box_dir(): string
{
    $d = DATA_DIR . '/famille-propositions';
    if (!is_dir($d)) { @mkdir($d, 0700, true); }
    return $d;
}
function fc_box_file_ok(string $f): bool { return (bool) preg_match('/^[a-f0-9]{32}(-v)?\.(jpg|png|webp|avif)$/', $f); }

/** La photo jointe (facultative, ou obligatoire pour « une photo ») : vérifiée et réenregistrée comme celles du téléphone. */
function fc_take_file(PDO $pdo, array $a, bool $required): array
{
    $all = 0;
    foreach ($_FILES as $f) { $all += is_array($f['name'] ?? null) ? count((array) $f['name']) : 1; }
    if ($all === 0) { if ($required) { throw new FcRefuse('Choisis la photo.'); } return ['', 0]; }
    if ((int) $a['can_attach'] !== 1) { throw new FcRefuse('Ce compte ne peut pas joindre de photo.', 403); }
    $f = $_FILES['photo'] ?? null;
    if ($all !== 1 || !is_array($f) || is_array($f['name'] ?? null)) { throw new FcRefuse('Une seule photo à la fois.'); }
    if ((int) ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) { throw new FcRefuse('La photo n’est pas arrivée en entier : réessaie.'); }
    $used = (int) $pdo->query("SELECT coalesce(sum(file_size),0) FROM fc_proposals WHERE file<>'' AND status='attente'")->fetchColumn();
    if ($used + (int) $f['size'] > FC_BOX_BYTES) { throw new FcRefuse('La boîte des propositions est pleine sur l’ordinateur : réessaie plus tard.', 507); }
    if (!function_exists('tw_image')) { require_once __DIR__ . '/telephone_wifi.php'; }
    try { $img = tw_image((string) $f['tmp_name'], (int) $f['size'], ['max_mb' => FC_PHOTO_MB, 'original' => 'non', 'gps' => 'retire']); }
    catch (TwRefuse $e) { throw new FcRefuse($e->getMessage(), $e->status); }
    $name = bin2hex(random_bytes(16)) . '.' . $img['ext'];
    $dir = fc_box_dir();
    if (@file_put_contents($dir . '/' . $name, $img['bytes']) === false) { throw new FcRefuse('Impossible de ranger la photo sur l’ordinateur (disque plein ?).', 507); }
    @chmod($dir . '/' . $name, 0600);
    if ($img['thumb'] !== '') { @file_put_contents($dir . '/' . preg_replace('/\.[a-z]+$/', '-v.jpg', $name), $img['thumb']); }
    return [$name, strlen($img['bytes'])];
}
function fc_drop_file(string $f): void
{
    if (!fc_box_file_ok($f)) { return; }
    @unlink(fc_box_dir() . '/' . $f);
    @unlink(fc_box_dir() . '/' . preg_replace('/\.[a-z]+$/', '-v.jpg', $f));
}

/**
 * Lit et vérifie ce que l'invité envoie. Rend la proposition prête à ranger (sans l'écrire). Chaque refus de droit répond comme
 * une fiche introuvable (rien n'apprend qu'une fiche cachée existe).
 */
function fc_read_proposal(PDO $pdo, array $a, array $p, bool $direct): array
{
    $kind = is_string($p['kind'] ?? null) && in_array($p['kind'], FC_KINDS, true) ? (string) $p['kind'] : '';
    if ($kind === '') { throw new FcRefuse('Proposition inconnue.'); }
    $pid = (int) (is_numeric($p['person'] ?? null) ? $p['person'] : 0);
    if (fc_mode($pdo, $a, $pid) !== 'full') { throw new FcRefuse('Fiche introuvable.', 404); }
    $out = ['kind' => $kind, 'person_id' => $pid, 'field' => '', 'old' => null, 'new' => null, 'comment' => fc_text($p['comment'] ?? '', 1000)];
    if ($kind === 'fait') {
        $field = is_string($p['field'] ?? null) && isset(FC_FIELDS[$p['field']]) ? (string) $p['field'] : '';
        if ($field === '') { throw new FcRefuse('Ce renseignement ne se propose pas ici.'); }
        $old = fc_fact_value($pdo, $pid, $field, $a['role'] === 'gerer');
        if ($old === null) { throw new FcRefuse('Fiche introuvable.', 404); } // un événement 🔒 : comme s'il n'existait pas
        if (FC_FIELDS[$field] === 'text') {
            $new = fc_line($p['value'] ?? '', 120);
            if ($new === '' && in_array($field, ['first_name', 'last_name'], true)) { throw new FcRefuse('Écris la nouvelle valeur.'); }
            if ($new === $old) { throw new FcRefuse('Rien n’a changé.'); }
        } else {
            $v = is_array($p['value'] ?? null) ? $p['value'] : [];
            $new = ['date' => fc_line($v['date'] ?? '', 80), 'place' => fc_line($v['place'] ?? '', 120)];
            if ($new['date'] === '' && $new['place'] === '') { throw new FcRefuse('Écris la date ou le lieu.'); }
            if ($new['date'] === $old['date'] && ($new['place'] === '' || $new['place'] === $old['place'])) { throw new FcRefuse('Rien n’a changé.'); }
        }
        $out['field'] = $field; $out['old'] = $old; $out['new'] = $new;
    } elseif ($kind === 'note') {
        $t = fc_text($p['text'] ?? '', 4000);
        if ($t === '') { throw new FcRefuse('Écris ton souvenir.'); }
        $out['new'] = ['text' => $t];
    } elseif ($kind === 'photo') {
        $out['new'] = ['caption' => fc_line($p['caption'] ?? '', 200), 'origin' => fc_line($p['origin'] ?? '', 200)];
    } else {
        $rel = is_string($p['relation'] ?? null) && in_array($p['relation'], FC_RELATIONS, true) ? (string) $p['relation'] : '';
        if ($rel === '') { throw new FcRefuse('Choisis le lien : un enfant, un conjoint ou un parent.'); }
        $first = fc_line($p['first_name'] ?? '', 80); $last = fc_line($p['last_name'] ?? '', 80);
        if ($first === '' && $last === '') { throw new FcRefuse('Indique au moins un prénom ou un nom'); }
        $g = in_array($p['gender'] ?? '', ['male', 'female'], true) ? (string) $p['gender'] : 'unknown';
        $ev = static fn($v) => ['date' => fc_line(is_array($v) ? ($v['date'] ?? '') : '', 80), 'place' => fc_line(is_array($v) ? ($v['place'] ?? '') : '', 120)];
        $out['field'] = $rel;
        $out['new'] = ['relation' => $rel, 'first_name' => $first, 'last_name' => $last, 'gender' => $g, 'birth' => $ev($p['birth'] ?? null), 'death' => $ev($p['death'] ?? null)];
        if ($rel === 'parent') {
            $n = $pdo->prepare('SELECT f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=? ORDER BY fc.id LIMIT 1'); $n->execute([$pid]);
            $f = $n->fetch(PDO::FETCH_ASSOC);
            if ($f && (int) $f['partner1_id'] && (int) $f['partner2_id']) { throw new FcRefuse('Cette personne a déjà ses deux parents dans l’arbre.'); }
        }
    }
    if ($direct) {
        if (!fc_in_branch($pdo, $a, $pid)) { throw new FcRefuse('hors_branche', 403); }
        if (fc_person_locked($pdo, $pid)) { throw new FcRefuse('Cette fiche est verrouillée : propose plutôt la modification.', 423); }
        if ($kind === 'personne' && $a['role'] === 'branche') {
            $allowed = $a['scope_kind'] === 'ascendants' ? ['parent'] : ['enfant', 'conjoint'];
            if (!in_array($out['field'], $allowed, true)) { throw new FcRefuse('hors_branche', 403); }
        }
    }
    return $out;
}

function fc_guest_propose(PDO $pdo, array $a, array $dev, array $p, bool $direct): never
{
    if (!fc_can($a, $direct ? 'branche' : 'proposer')) {
        fc_journal_add($pdo, $a, 'refus', 0, '', $direct ? 'modifier' : 'proposer');
        fc_json(['error' => $direct ? 'Ce compte ne peut pas modifier l’arbre : propose plutôt la modification.' : 'Ce compte peut seulement regarder.'], 403);
    }
    $hour = $pdo->prepare('SELECT count(*) FROM fc_proposals WHERE account_id=? AND created_ts>?'); $hour->execute([(int) $a['id'], fc_now() - 3600]);
    if ((int) $hour->fetchColumn() >= FC_RATE_HOUR) { header('Retry-After: 900'); fc_json(['error' => 'Beaucoup de propositions d’un coup : attends un peu, puis continue.'], 429); }
    $pend = $pdo->prepare("SELECT count(*) FROM fc_proposals WHERE account_id=? AND status='attente'"); $pend->execute([(int) $a['id']]);
    if (!$direct && (int) $pend->fetchColumn() >= FC_MAX_PENDING) { fc_json(['error' => 'Beaucoup de propositions attendent déjà : la personne qui tient l’arbre doit d’abord les regarder.'], 429); }
    try { $r = fc_read_proposal($pdo, $a, $p, $direct); }
    catch (FcRefuse $e) {
        if ($e->getMessage() === 'hors_branche') {
            $pid = (int) (is_numeric($p['person'] ?? null) ? $p['person'] : 0);
            $label = fc_mode($pdo, $a, $pid) === 'full' ? fc_label($pdo, $pid) : '';
            fc_journal_add($pdo, $a, 'hors_branche', $label !== '' ? $pid : 0, $label);
            fc_json(['error' => 'Hors de ta branche : propose plutôt la modification.', 'hors_branche' => true], 403);
        }
        throw $e;
    }
    [$file, $size] = fc_take_file($pdo, $a, $r['kind'] === 'photo');
    $label = fc_label($pdo, $r['person_id']);
    try {
        begin_fc_tx($pdo);
        $pdo->prepare('INSERT INTO fc_proposals(account_id, account_name, origin, device_name, created_ts, kind, person_id, field, old_json, new_json, comment, file, file_size, status, direct) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([(int) $a['id'], (string) $a['name'], 'maison', mb_substr((string) $dev['name'], 0, 40), fc_now(), $r['kind'], $r['person_id'], $r['field'],
                json_encode($r['old'], JSON_UNESCAPED_UNICODE), json_encode($r['new'], JSON_UNESCAPED_UNICODE), $r['comment'], $file, $size, $direct ? 'directe' : 'attente', $direct ? 1 : 0]);
        $id = (int) $pdo->lastInsertId();
        $what = fc_prop_summary($r['kind'], $r['field'], $r['old'], $r['new']);
        if ($direct) {
            $prop = fc_prop($pdo, $id);
            $ops = fc_apply($pdo, $prop, [], (string) $a['name']);
            // garde-fou : ce qui vient d'être créé doit rester dans la branche (ex. un parent ajouté à une branche de descendants)
            if ($a['role'] === 'branche' && !empty($ops['created_person']) && fc_mode($pdo, $a, (int) $ops['created_person']) !== 'full') { throw new FcRefuse('hors_branche', 403); }
            $pdo->prepare("UPDATE fc_proposals SET status='acceptee', decided_ts=?, applied_json=? WHERE id=?")->execute([fc_now(), json_encode($ops, JSON_UNESCAPED_UNICODE), $id]);
            fc_journal_add($pdo, $a, 'modif', $r['person_id'], $label, $what, $id);
        } else {
            fc_journal_add($pdo, $a, 'proposition', $r['person_id'], $label, $what, $id);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        fc_drop_file($file);
        if ($e instanceof FcRefuse && $e->getMessage() === 'hors_branche') { fc_journal_add($pdo, $a, 'hors_branche', $r['person_id'], $label); fc_json(['error' => 'Hors de ta branche : propose plutôt la modification.', 'hors_branche' => true], 403); }
        throw $e;
    }
    fc_json(['ok' => true, 'id' => $id, 'direct' => $direct]);
}
function begin_fc_tx(PDO $pdo): void { if (function_exists('begin_write_transaction')) { begin_write_transaction($pdo); } else { $pdo->exec('BEGIN IMMEDIATE'); } }

function fc_label(PDO $pdo, int $pid): string
{
    $s = $pdo->prepare('SELECT first_name, last_name FROM main.persons WHERE id=?'); $s->execute([$pid]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    return $p ? fc_person_name($p) : '';
}
function fc_prop(PDO $pdo, int $id): ?array
{
    $s = $pdo->prepare('SELECT * FROM fc_proposals WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { return null; }
    $r['old'] = json_decode((string) $r['old_json'], true);
    $r['new'] = json_decode((string) $r['new_json'], true);
    return $r;
}
function fc_prop_summary(string $kind, string $field, mixed $old, mixed $new): string
{
    return match ($kind) {
        'fait' => i18n_t(FC_FIELD_LABELS[$field] ?? $field) . ' : ' . (fc_value_text($old) !== '' ? fc_value_text($old) . ' → ' : '') . fc_value_text($new),
        'note' => i18n_t('souvenir') . ' : « ' . mb_substr((string) ($new['text'] ?? ''), 0, 80) . ' »',
        'photo' => i18n_t('nouvelle photo') . ((string) ($new['caption'] ?? '') !== '' ? ' « ' . $new['caption'] . ' »' : ''),
        'personne' => i18n_t(['enfant' => 'nouvel enfant', 'conjoint' => 'nouveau conjoint', 'parent' => 'nouveau parent'][$field] ?? 'nouvelle personne') . ' : ' . trim(($new['first_name'] ?? '') . ' ' . mb_strtoupper((string) ($new['last_name'] ?? ''))),
        default => '',
    };
}

function fc_guest_mine(PDO $pdo, array $a): never
{
    $s = $pdo->prepare('SELECT * FROM fc_proposals WHERE account_id=? ORDER BY created_ts DESC, id DESC LIMIT 200'); $s->execute([(int) $a['id']]);
    $scope = fc_scope_ids($pdo, $a);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $visible = fc_mode($pdo, $a, (int) $r['person_id'], $scope, true) === 'full';
        $out[] = ['id' => (int) $r['id'], 'status' => (string) $r['status'], 'direct' => (int) $r['direct'] === 1, 'kind' => (string) $r['kind'], 'person' => $visible ? (int) $r['person_id'] : 0,
            'label' => $visible ? fc_label($pdo, (int) $r['person_id']) : '', 'what' => fc_prop_summary((string) $r['kind'], (string) $r['field'], json_decode((string) $r['old_json'], true), json_decode((string) $r['new_json'], true)),
            'note' => (string) $r['decision_note'], 'at' => (int) $r['created_ts']];
    }
    $count = ['attente' => 0, 'acceptee' => 0, 'refusee' => 0];
    foreach ($out as $o) { if (!$o['direct'] && isset($count[$o['status']])) { $count[$o['status']]++; } }
    fc_json(['items' => $out, 'count' => $count]);
}

/** Retirer sa propre proposition encore en attente (et ↶ la remettre, pendant 10 min). */
function fc_guest_withdraw(PDO $pdo, array $a, array $p): never
{
    $id = (int) (is_numeric($p['id'] ?? null) ? $p['id'] : 0);
    $undo = !empty($p['undo']);
    $s = $pdo->prepare('SELECT * FROM fc_proposals WHERE id=? AND account_id=? AND direct=0'); $s->execute([$id, (int) $a['id']]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { fc_json(['error' => 'Introuvable.'], 404); }
    if (!$undo) {
        $u = $pdo->prepare("UPDATE fc_proposals SET status='retiree', decided_ts=? WHERE id=? AND status='attente'"); $u->execute([fc_now(), $id]);
        if ($u->rowCount() !== 1) { fc_json(['error' => 'Elle a déjà été regardée : elle ne se retire plus.'], 409); }
        fc_journal_add($pdo, $a, 'retiree', (int) $r['person_id'], fc_label($pdo, (int) $r['person_id']), '', $id);
    } else {
        $u = $pdo->prepare("UPDATE fc_proposals SET status='attente', decided_ts=0 WHERE id=? AND status='retiree' AND decided_ts>=?"); $u->execute([$id, fc_now() - FC_UNDO_GUEST_S]);
        if ($u->rowCount() !== 1) { fc_json(['error' => 'Trop tard pour la remettre : envoie-la de nouveau.'], 409); }
    }
    fc_json(['ok' => true]);
}

/** ↶ Annuler sa propre modification directe (🌿). */
function fc_guest_edit_undo(PDO $pdo, array $a, array $p): never
{
    if (!fc_can($a, 'branche')) { fc_json(['error' => 'Refusé.'], 403); }
    $id = (int) (is_numeric($p['id'] ?? null) ? $p['id'] : 0);
    $prop = fc_prop($pdo, $id);
    if (!$prop || (int) $prop['account_id'] !== (int) $a['id'] || (int) $prop['direct'] !== 1 || $prop['status'] !== 'acceptee') { fc_json(['error' => 'Introuvable.'], 404); }
    begin_fc_tx($pdo);
    try {
        fc_undo($pdo, json_decode((string) $prop['applied_json'], true) ?: [], (string) $a['name']);
        $pdo->prepare("UPDATE fc_proposals SET status='annulee', decided_ts=? WHERE id=?")->execute([fc_now(), $id]);
        fc_journal_add($pdo, $a, 'annule', (int) $prop['person_id'], fc_label($pdo, (int) $prop['person_id']), fc_prop_summary((string) $prop['kind'], (string) $prop['field'], $prop['old'], $prop['new']), $id);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    fc_json(['ok' => true]);
}

/* ═════════════════ écrire dans l'arbre, et le défaire exactement ═════════════════ */

function fc_place_id(PDO $pdo, string $name): ?int
{
    $name = fc_line($name, 120);
    if ($name === '') { return null; }
    $s = $pdo->prepare("SELECT id FROM places WHERE name=? COLLATE NOCASE ORDER BY (latitude IS NOT NULL) DESC, population DESC, id LIMIT 1"); $s->execute([$name]);
    $id = $s->fetchColumn();
    if ($id) { return (int) $id; }
    $pdo->prepare("INSERT INTO places(name, country) VALUES(?, 'France')")->execute([$name]);
    return (int) $pdo->lastInsertId();
}
function fc_type_id(PDO $pdo, string $tag, string $scope = 'person'): int
{
    $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? AND scope=? ORDER BY is_custom, id LIMIT 1'); $s->execute([$tag, $scope]);
    $id = (int) $s->fetchColumn();
    if (!$id) { throw new LcndaBadInput('Type d’événement introuvable.'); }
    return $id;
}
function fc_rebuild_search(PDO $pdo, int $pid): void
{
    if (function_exists('rebuild_search')) { rebuild_search($pdo, $pid); return; }
    try {
        $pdo->prepare('DELETE FROM person_search WHERE person_id=CAST(? AS INTEGER)')->execute([$pid]);
        $pdo->prepare("INSERT INTO person_search(person_id,first_name,last_name,variants,surname_group) SELECT p.id,p.first_name,p.last_name,COALESCE((SELECT group_concat(trim(coalesce(n.first_name,'')||' '||coalesce(n.last_name,'')),' ') FROM name_variants n WHERE n.person_id=p.id),''),COALESCE(g.name,'') FROM persons p LEFT JOIN surname_groups g ON g.id=p.surname_group_id WHERE p.id=?")->execute([$pid]);
    } catch (Throwable $_) {}
}
/** Un événement (naissance, décès…) : ajouté ou corrigé (les cases vides ne changent rien). */
function fc_set_event(PDO $pdo, int $pid, string $tag, array $v, array &$ops, bool $priv = false): void
{
    $s = $pdo->prepare('SELECT e.id, e.date_text, e.year, e.place_id, COALESCE(e.is_private,0) AS priv FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=? AND t.gedcom_tag=? ORDER BY e.id LIMIT 1');
    $s->execute([$pid, $tag]);
    $e = $s->fetch(PDO::FETCH_ASSOC);
    $date = fc_line($v['date'] ?? '', 80); $place = fc_line($v['place'] ?? '', 120);
    if ($date === '' && $place === '') { return; }
    if ($e && (int) $e['priv'] === 1 && !$priv) { throw new FcRefuse('Fiche introuvable.', 404); }
    if (!$e) {
        $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, date_text, year, place_id) VALUES('person',?,?,?,?,?)")->execute([$pid, fc_type_id($pdo, $tag), $date, fc_year_of($date), fc_place_id($pdo, $place)]);
        $id = (int) $pdo->lastInsertId();
        $ops[] = ['t' => 'ins', 'table' => 'events', 'id' => $id];
        log_change($pdo, 'event', $id, 'create', '👪 ' . i18n_t(FC_FIELD_LABELS[$tag] ?? $tag) . ' ajouté(e) à la fiche #' . $pid);
        return;
    }
    $before = ['date_text' => (string) $e['date_text'], 'year' => $e['year'] === null ? null : (int) $e['year'], 'place_id' => $e['place_id'] === null ? null : (int) $e['place_id']];
    $after = $before;
    if ($date !== '') { $after['date_text'] = $date; $after['year'] = fc_year_of($date); }
    if ($place !== '') { $after['place_id'] = fc_place_id($pdo, $place); }
    if ($after === $before) { return; }
    $pdo->prepare('UPDATE events SET date_text=?, year=?, place_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$after['date_text'], $after['year'], $after['place_id'], (int) $e['id']]);
    $ops[] = ['t' => 'upd', 'table' => 'events', 'id' => (int) $e['id'], 'before' => $before, 'after' => $after];
    log_change($pdo, 'event', (int) $e['id'], 'update', '👪 ' . i18n_t(FC_FIELD_LABELS[$tag] ?? $tag) . ' corrigé(e) sur la fiche #' . $pid, $before, $after);
}
/** Une copie de la photo jointe dans les médias (nom tiré au hasard), reliée à la fiche (et à l'événement corrigé). */
function fc_attach_media(PDO $pdo, array $prop, string $title, string $desc, array $links, array &$ops): void
{
    $f = (string) $prop['file'];
    if (!fc_box_file_ok($f) || !is_file(fc_box_dir() . '/' . $f)) { return; }
    if (!is_dir(MEDIA_DIR)) { @mkdir(MEDIA_DIR, 0775, true); }
    $dest = 'famille-' . bin2hex(random_bytes(12)) . '.' . pathinfo($f, PATHINFO_EXTENSION);
    if (!@copy(fc_box_dir() . '/' . $f, MEDIA_DIR . '/' . $dest)) { throw new RuntimeException('Impossible de ranger la photo dans les médias.'); }
    $ops[] = ['t' => 'file', 'name' => $dest];
    $pdo->prepare("INSERT INTO media(title, description, media_type, filename, thumbnail) VALUES(?,?,'image',?,?)")->execute([mb_substr($title, 0, 300), $desc, $dest, $dest]);
    $mid = (int) $pdo->lastInsertId();
    $ops[] = ['t' => 'ins', 'table' => 'media', 'id' => $mid];
    foreach ($links as [$type, $id]) {
        $pdo->prepare('INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?,?,?,?)')->execute([$mid, $type, $id, 999]);
        $ops[] = ['t' => 'ins', 'table' => 'media_links', 'id' => (int) $pdo->lastInsertId()];
    }
    log_change($pdo, 'media', $mid, 'create', '👪 Photo ajoutée depuis le site familial');
}

/**
 * Écrit une proposition dans l'arbre (dans la transaction de l'appelant). Rend les gestes faits, pour ↶ exactement.
 * $o : 'value' (« Accepter en changeant… »), 'link_to' (relier à une fiche existante au lieu d'en créer une).
 */
function fc_apply(PDO $pdo, array $prop, array $o, string $who): array
{
    $pid = (int) $prop['person_id'];
    $chk = $pdo->prepare('SELECT * FROM persons WHERE id=?'); $chk->execute([$pid]); $person = $chk->fetch(PDO::FETCH_ASSOC);
    if (!$person) { throw new FcRefuse('Cette fiche n’existe plus dans l’arbre.'); }
    if ((int) ($person['is_locked'] ?? 0) === 1) { throw new FcRefuse('Cette fiche est verrouillée : déverrouille-la d’abord.', 423); }
    $ops = [];
    $new = $prop['new'];
    $byOwner = (int) ($prop['direct'] ?? 0) !== 1;
    $note = static fn(string $s): string => $s . ' (' . $who . ')';
    switch ((string) $prop['kind']) {
        case 'fait':
            $field = (string) $prop['field'];
            if (array_key_exists('value', $o)) { $new = FC_FIELDS[$field] === 'text' ? fc_line($o['value'], 120) : ['date' => fc_line(is_array($o['value']) ? ($o['value']['date'] ?? '') : '', 80), 'place' => fc_line(is_array($o['value']) ? ($o['value']['place'] ?? '') : '', 120)]; }
            if (FC_FIELDS[$field] === 'text') {
                $before = (string) $person[$field];
                $after = fc_line($new, 120);
                if ($before !== $after) {
                    $pdo->prepare("UPDATE persons SET $field=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$after, $pid]);
                    $ops[] = ['t' => 'upd', 'table' => 'persons', 'id' => $pid, 'before' => [$field => $before], 'after' => [$field => $after]];
                    log_change($pdo, 'person', $pid, 'update', $note('👪 ' . i18n_t(FC_FIELD_LABELS[$field]) . ' de ' . fc_person_name($person)), [$field => $before], [$field => $after]);
                    fc_rebuild_search($pdo, $pid);
                }
            } else {
                fc_set_event($pdo, $pid, $field, is_array($new) ? $new : [], $ops, $byOwner);
                if ($ops) {
                    $evId = 0; foreach ($ops as $op) { if ($op['table'] === 'events') { $evId = (int) $op['id']; } }
                    fc_attach_media($pdo, $prop, i18n_t('Pièce jointe de {who}', ['who' => (string) $prop['account_name']]), (string) $prop['comment'], [['person', $pid], ['event', $evId]], $ops);
                }
            }
            break;
        case 'note':
            $text = array_key_exists('value', $o) ? fc_text($o['value'], 4000) : (string) ($new['text'] ?? '');
            if ($text === '') { throw new FcRefuse('Le texte est vide.'); }
            $title = i18n_t('Souvenir de {who}', ['who' => (string) $prop['account_name']]);
            $body = htmlspecialchars($text, ENT_QUOTES, 'UTF-8') . '<br><br><em>— ' . htmlspecialchars((string) $prop['account_name'] . ', ' . date('d/m/Y', (int) $prop['created_ts'] ?: fc_now()), ENT_QUOTES, 'UTF-8') . '</em>';
            $pdo->prepare("INSERT INTO notes(entity_type, entity_id, title, body, created_at, updated_at) VALUES('person',?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")->execute([$pid, $title, str_replace("\n", '<br>', $body)]);
            $ops[] = ['t' => 'ins', 'table' => 'notes', 'id' => (int) $pdo->lastInsertId()];
            log_change($pdo, 'note', (int) $pdo->lastInsertId(), 'create', $note('👪 ' . $title));
            fc_attach_media($pdo, $prop, $title, '', [['person', $pid]], $ops);
            break;
        case 'photo':
            $cap = (string) ($new['caption'] ?? '');
            $desc = trim($cap . ((string) ($new['origin'] ?? '') !== '' ? "\n" . i18n_t('Origine : {o}', ['o' => (string) $new['origin']]) : '') . "\n" . i18n_t('Envoyée par {who}', ['who' => (string) $prop['account_name']]));
            fc_attach_media($pdo, $prop, $cap !== '' ? $cap : i18n_t('Photo de {who}', ['who' => (string) $prop['account_name']]), $desc, [['person', $pid]], $ops);
            if (!$ops) { throw new FcRefuse('La photo n’est plus sur l’ordinateur.'); }
            break;
        case 'personne':
            $rel = (string) $prop['field'];
            $link = (int) ($o['link_to'] ?? 0);
            if ($link) {
                $s = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $s->execute([$link]);
                if (!$s->fetchColumn() || $link === $pid) { throw new FcRefuse('Fiche introuvable.', 404); }
                $nid = $link;
            } else {
                $dead = ($new['death']['date'] ?? '') !== '' || ($new['death']['place'] ?? '') !== '';
                $pdo->prepare('INSERT INTO persons(first_name, last_name, gender, living_status) VALUES(?,?,?,?)')->execute([(string) $new['first_name'], (string) $new['last_name'], (string) $new['gender'], $dead ? 'deceased' : 'unknown']);
                $nid = (int) $pdo->lastInsertId();
                $ops[] = ['t' => 'ins', 'table' => 'persons', 'id' => $nid];
                $ops['created_person'] = $nid;
                log_change($pdo, 'person', $nid, 'create', $note('👪 Création de ' . trim($new['first_name'] . ' ' . $new['last_name'])));
                fc_set_event($pdo, $nid, 'BIRT', (array) ($new['birth'] ?? []), $ops, true);
                fc_set_event($pdo, $nid, 'DEAT', (array) ($new['death'] ?? []), $ops, true);
                fc_rebuild_search($pdo, $nid);
            }
            if ($rel === 'enfant') {
                $f = $pdo->prepare('SELECT id FROM families WHERE partner1_id=? OR partner2_id=? ORDER BY id LIMIT 1'); $f->execute([$pid, $pid]);
                $fid = (int) $f->fetchColumn();
                if (!$fid) { $pdo->prepare('INSERT INTO families(partner1_id) VALUES(?)')->execute([$pid]); $fid = (int) $pdo->lastInsertId(); $ops[] = ['t' => 'ins', 'table' => 'families', 'id' => $fid]; }
                $e = $pdo->prepare('SELECT 1 FROM family_children WHERE family_id=? AND child_id=?'); $e->execute([$fid, $nid]);
                if (!$e->fetchColumn()) {
                    $pos = $pdo->prepare('SELECT COALESCE(MAX(position),0)+1 FROM family_children WHERE family_id=?'); $pos->execute([$fid]);
                    $pdo->prepare('INSERT INTO family_children(family_id, child_id, position) VALUES(?,?,?)')->execute([$fid, $nid, (int) $pos->fetchColumn()]);
                    $ops[] = ['t' => 'ins', 'table' => 'family_children', 'id' => (int) $pdo->lastInsertId()];
                }
            } elseif ($rel === 'conjoint') {
                $pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$pid, $nid]);
                $ops[] = ['t' => 'ins', 'table' => 'families', 'id' => (int) $pdo->lastInsertId()];
            } else {
                $f = $pdo->prepare('SELECT f.id, f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=? ORDER BY fc.id LIMIT 1'); $f->execute([$pid]);
                $fam = $f->fetch(PDO::FETCH_ASSOC);
                if (!$fam) {
                    $pdo->prepare('INSERT INTO families(partner1_id) VALUES(?)')->execute([$nid]); $fid = (int) $pdo->lastInsertId(); $ops[] = ['t' => 'ins', 'table' => 'families', 'id' => $fid];
                    $pdo->prepare('INSERT INTO family_children(family_id, child_id) VALUES(?,?)')->execute([$fid, $pid]); $ops[] = ['t' => 'ins', 'table' => 'family_children', 'id' => (int) $pdo->lastInsertId()];
                } else {
                    $slot = !(int) $fam['partner1_id'] ? 'partner1_id' : (!(int) $fam['partner2_id'] ? 'partner2_id' : '');
                    if ($slot === '') { throw new FcRefuse('Cette personne a déjà ses deux parents dans l’arbre.'); }
                    if ((int) $fam['partner1_id'] === $nid || (int) $fam['partner2_id'] === $nid) { break; }
                    $pdo->prepare("UPDATE families SET $slot=? WHERE id=?")->execute([$nid, (int) $fam['id']]);
                    $ops[] = ['t' => 'upd', 'table' => 'families', 'id' => (int) $fam['id'], 'before' => [$slot => null], 'after' => [$slot => $nid]];
                }
            }
            log_change($pdo, 'person', $pid, 'update', $note('👪 ' . fc_prop_summary('personne', $rel, null, $new) . ' — ' . fc_person_name($person)));
            if ($nid && !$link) { fc_attach_media($pdo, $prop, i18n_t('Pièce jointe de {who}', ['who' => (string) $prop['account_name']]), (string) $prop['comment'], [['person', $nid]], $ops); }
            break;
        default:
            throw new FcRefuse('Proposition inconnue.');
    }
    return $ops;
}

const FC_UNDO_TABLES = ['persons', 'events', 'families', 'family_children', 'notes', 'media', 'media_links'];

/** Défait exactement des gestes (à l'envers). Refuse si ce qui a été écrit a changé depuis (rien n'est écrasé sans le voir). */
function fc_undo(PDO $pdo, array $ops, string $who): void
{
    $list = array_values(array_filter($ops, static fn($k) => is_int($k), ARRAY_FILTER_USE_KEY));
    $files = [];
    $created = array_map(static fn($o) => $o['table'] . ':' . $o['id'], array_filter($list, static fn($o) => ($o['t'] ?? '') === 'ins'));
    foreach (array_reverse($list) as $op) {
        $t = (string) ($op['table'] ?? ''); $id = (int) ($op['id'] ?? 0);
        if (($op['t'] ?? '') === 'file') { $files[] = (string) $op['name']; continue; }
        if (!in_array($t, FC_UNDO_TABLES, true) || $id <= 0) { continue; }
        if ($op['t'] === 'ins') {
            if ($t === 'persons') {
                // une fiche créée puis complétée ailleurs (événement, lien, note ajoutés depuis) : on ne la supprime pas en silence
                $more = 0;
                foreach (["SELECT id FROM events WHERE person_id=?" => 'events', "SELECT id FROM family_children WHERE child_id=?" => 'family_children', "SELECT id FROM notes WHERE entity_type='person' AND entity_id=?" => 'notes', "SELECT id FROM media_links WHERE entity_type='person' AND entity_id=?" => 'media_links'] as $sql => $tab) {
                    $s = $pdo->prepare($sql); $s->execute([$id]);
                    foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $x) { if (!in_array($tab . ':' . $x, $created, true)) { $more++; } }
                }
                $s = $pdo->prepare('SELECT id FROM families WHERE partner1_id=? OR partner2_id=?'); $s->execute([$id, $id]);
                foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $x) { if (!in_array('families:' . $x, $created, true)) { $more++; } }
                if ($more) { throw new FcRefuse('Cette fiche a été complétée depuis : ↶ impossible, supprime-la à la main si besoin.', 409); }
                $pdo->prepare('DELETE FROM person_search WHERE person_id=CAST(? AS INTEGER)')->execute([$id]);
            }
            if ($t === 'families') {
                $s = $pdo->prepare('SELECT count(*) FROM family_children WHERE family_id=?'); $s->execute([$id]);
                if ((int) $s->fetchColumn() > 0) { throw new FcRefuse('Cette famille a été complétée depuis : ↶ impossible.', 409); }
            }
            $pdo->prepare("DELETE FROM $t WHERE id=?")->execute([$id]);
            log_change($pdo, $t === 'persons' ? 'person' : rtrim($t, 's'), $id, 'delete', '👪 ↶ Annulé (' . $who . ')');
            continue;
        }
        if ($op['t'] === 'upd') {
            $cols = array_keys((array) $op['after']);
            foreach ($cols as $c) { if (!preg_match('/^[a-z_0-9]+$/', (string) $c)) { throw new FcRefuse('Refusé.'); } }
            $s = $pdo->prepare('SELECT ' . implode(',', $cols) . " FROM $t WHERE id=?"); $s->execute([$id]);
            $now = $s->fetch(PDO::FETCH_ASSOC);
            if (!$now) { throw new FcRefuse('Ce qui a été modifié n’existe plus : ↶ impossible.', 409); }
            foreach ((array) $op['after'] as $c => $v) {
                if ((string) ($now[$c] ?? '') !== (string) ($v ?? '')) { throw new FcRefuse(i18n_t('Modifié depuis par quelqu’un d’autre : actuellement « {v} ». ↶ impossible sans écraser ce changement.', ['v' => (string) ($now[$c] ?? '')]), 409); }
            }
            $set = implode(',', array_map(static fn($c) => "$c=?", array_keys((array) $op['before'])));
            $pdo->prepare("UPDATE $t SET $set WHERE id=?")->execute([...array_values((array) $op['before']), $id]);
            if ($t === 'persons') { fc_rebuild_search($pdo, $id); }
            log_change($pdo, $t === 'persons' ? 'person' : rtrim($t, 's'), $id, 'update', '👪 ↶ Remis comme avant (' . $who . ')', (array) $op['after'], (array) $op['before']);
        }
    }
    foreach ($files as $f) { if (preg_match('/^famille-[a-f0-9]{24}\.(jpg|png|webp|avif)$/', $f)) { @unlink(MEDIA_DIR . '/' . $f); } }
}

/* ═════════════════ l'ordinateur principal (api.php) ═════════════════ */

/** Les actions de l'API pour l'ordinateur principal (jamais pour un appareil invité : lib/reseau_local.php les refuse aussi). */
const FC_OWNER_READS = ['fc_state', 'fc_props', 'fc_journal', 'fc_count', 'fc_prop_file', 'fc_publish_preview', 'fc_publish_export'];
const FC_OWNER_WRITES = ['fc_write'];

function fc_owner_dispatch(PDO $pdo, string $action, bool $isWrite, array $d): never
{
    // défense en profondeur : un appareil invité ne passe jamais ici, et le mode consultation ne lit pas la file
    if (function_exists('lan_device') && lan_device()) { json_response(['error' => 'Appareil invité : lecture seule. Cela ne se fait que sur l’ordinateur principal.'], 423); }
    $kiosk = function_exists('kiosk_state') && !empty(kiosk_state()['on']);
    if ($kiosk && $action === 'fc_count') { json_response(['pending' => 0, 'kiosk' => true]); }
    if ($kiosk) { json_response(['error' => 'Mode consultation : rien ne peut être modifié. Pour en sortir, clique sur « Quitter la consultation » et donne le mot de passe.', 'kiosk' => true], 423); }
    if (!$isWrite && !in_array($action, FC_OWNER_READS, true)) { json_response(['error' => 'Opération inconnue.'], 422); }
    if ($isWrite && !in_array($action, FC_OWNER_WRITES, true)) { json_response(['error' => 'Opération inconnue.'], 422); }
    try {
        fc_schema($pdo);
        if ($action === 'fc_count') { json_response(['pending' => (int) $pdo->query("SELECT count(*) FROM fc_proposals WHERE status='attente'")->fetchColumn()]); }
        if ($action === 'fc_state') { json_response(fc_owner_state($pdo)); }
        if ($action === 'fc_props') { json_response(fc_owner_props($pdo, in_array($_GET['status'] ?? '', ['attente', 'decidees'], true) ? (string) $_GET['status'] : 'attente')); }
        if ($action === 'fc_journal') { json_response(fc_owner_journal($pdo, $_GET)); }
        if ($action === 'fc_prop_file') { fc_owner_file($pdo, (int) (is_numeric($_GET['id'] ?? null) ? $_GET['id'] : 0), !empty($_GET['thumb'])); }
        if ($action === 'fc_publish_preview' || $action === 'fc_publish_export') { require_once __DIR__ . '/comptes_famille_en_ligne.php'; fc_publish_dispatch($pdo, $action); }
        $op = is_string($d['op'] ?? null) ? (string) $d['op'] : '';
        begin_fc_tx($pdo);
        try {
            $out = match ($op) {
                'account_new' => fc_owner_account_new($pdo, $d),
                'account_save' => fc_owner_account_save($pdo, $d),
                'account_remove' => fc_owner_account_remove($pdo, (int) ($d['id'] ?? 0), !empty($d['undo'])),
                'invite' => ['invite' => (static function () use ($pdo, $d): array { $a = fc_account($pdo, (int) ($d['id'] ?? 0)); if (!$a) { throw new LcndaBadInput('Introuvable.'); } return fc_invite_new($pdo, (int) $a['id']); })()],
                'invite_cancel' => (static function () use ($pdo, $d): array { $pdo->prepare('UPDATE fc_invites SET used_ts=-1 WHERE account_id=? AND used_ts=0')->execute([(int) ($d['id'] ?? 0)]); return ['ok' => true]; })(),
                'unblock' => (static function () use ($pdo, $d): array { $pdo->prepare("DELETE FROM fc_tries WHERE k=? OR k='all'")->execute(['acct:' . (int) ($d['id'] ?? 0)]); return ['ok' => true]; })(),
                'settings' => fc_settings_save($pdo, $d),
                'accept' => fc_owner_accept($pdo, $d),
                'refuse' => fc_owner_refuse($pdo, $d),
                'undo' => fc_owner_undo($pdo, $d),
                'releve' => (static function () use ($pdo, $d): array { require_once __DIR__ . '/comptes_famille_en_ligne.php'; return fc_releve($pdo, $d); })(),
                default => throw new LcndaBadInput('Opération inconnue.'),
            };
            $pdo->commit();
        } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
        json_response(['ok' => true] + $out + ['pending' => (int) $pdo->query("SELECT count(*) FROM fc_proposals WHERE status='attente'")->fetchColumn()]);
    } catch (FcRefuse $e) {
        json_response(['error' => $e->getMessage()] + $e->extra, $e->status);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        json_response(['error' => function_exists('readable_error_message') ? readable_error_message($e) : $e->getMessage()], 422);
    }
}

function fc_owner_state(PDO $pdo): array
{
    $acc = $pdo->query('SELECT * FROM fc_accounts WHERE removed_ts=0 ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    return ['accounts' => array_map(static fn($a) => fc_account_out($pdo, $a), $acc), 'settings' => fc_settings($pdo), 'defaults' => fc_defaults(), 'spec' => FC_SPEC,
        'pending' => (int) $pdo->query("SELECT count(*) FROM fc_proposals WHERE status='attente'")->fetchColumn(), 'invite_days' => FC_INVITE_DAYS, 'genealogy' => function_exists('glock_genealogy_name') ? glock_genealogy_name() : ''];
}
function fc_owner_account_new(PDO $pdo, array $d): array
{
    $n = fc_account_norm($pdo, $d);
    $pdo->prepare('INSERT INTO fc_accounts(name, relation, login, role, scope_kind, scope_person, living, can_attach, can_notes, created_ts) VALUES(?,?,?,?,?,?,?,?,?,?)')
        ->execute([$n['name'], $n['relation'], $n['login'], $n['role'], $n['scope_kind'], $n['scope_person'], $n['living'], $n['can_attach'], $n['can_notes'], fc_now()]);
    $id = (int) $pdo->lastInsertId();
    fc_journal_add($pdo, null, 'compte', 0, $n['name'], 'invité', 0, '');
    return ['account' => fc_account_out($pdo, fc_account($pdo, $id)), 'invite' => fc_invite_new($pdo, $id)];
}
/** Changer les droits ferme les séances ouvertes de ce compte (génération + 1). Rend l'état d'avant (↶). */
function fc_owner_account_save(PDO $pdo, array $d): array
{
    $a = fc_account($pdo, (int) ($d['id'] ?? 0));
    if (!$a) { throw new LcndaBadInput('Introuvable.'); }
    $n = fc_account_norm($pdo, $d, $a);
    $pdo->prepare('UPDATE fc_accounts SET name=?, relation=?, login=?, role=?, scope_kind=?, scope_person=?, living=?, can_attach=?, can_notes=?, gen=gen+1 WHERE id=?')
        ->execute([$n['name'], $n['relation'], $n['login'], $n['role'], $n['scope_kind'], $n['scope_person'], $n['living'], $n['can_attach'], $n['can_notes'], (int) $a['id']]);
    fc_journal_add($pdo, null, 'compte', 0, $n['name'], 'droits changés', 0, '');
    $prev = array_intersect_key($a, array_flip(['id', 'name', 'relation', 'login', 'role', 'scope_kind', 'scope_person', 'living', 'can_attach', 'can_notes']));
    return ['account' => fc_account_out($pdo, fc_account($pdo, (int) $a['id'])), 'prev' => $prev];
}
function fc_owner_account_remove(PDO $pdo, int $id, bool $undo): array
{
    $a = fc_account($pdo, $id, true);
    if (!$a) { throw new LcndaBadInput('Introuvable.'); }
    if ($undo) {
        $s = $pdo->prepare('SELECT id FROM fc_accounts WHERE login=? AND removed_ts=0 AND id<>?'); $s->execute([(string) $a['login'], $id]);
        if ($s->fetchColumn()) { throw new LcndaBadInput('Cet identifiant est déjà pris par un autre compte.'); }
        $pdo->prepare('UPDATE fc_accounts SET removed_ts=0, gen=gen+1 WHERE id=?')->execute([$id]);
        return ['account' => fc_account_out($pdo, fc_account($pdo, $id))];
    }
    // ses séances se ferment ; ses appareils restent reliés au site familial (ils ne retrouvent pas l'app entière en lecture)
    $pdo->prepare('UPDATE fc_accounts SET removed_ts=?, gen=gen+1 WHERE id=?')->execute([fc_now(), $id]);
    $pdo->prepare('UPDATE fc_invites SET used_ts=-1 WHERE account_id=? AND used_ts=0')->execute([$id]);
    fc_journal_add($pdo, null, 'compte', 0, (string) $a['name'], 'retiré', 0, '');
    return ['removed' => $id];
}

/** La file : une ligne = un changement précis, avec l'ancien et le nouveau, et ce qui a changé depuis. */
function fc_owner_props(PDO $pdo, string $status): array
{
    $sql = $status === 'attente' ? "SELECT * FROM fc_proposals WHERE status='attente' ORDER BY account_id, created_ts, id LIMIT 500"
        : "SELECT * FROM fc_proposals WHERE status<>'attente' ORDER BY decided_ts DESC, id DESC LIMIT 300";
    $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    foreach ($rows as $r) {
        $old = json_decode((string) $r['old_json'], true); $new = json_decode((string) $r['new_json'], true);
        $o = ['id' => (int) $r['id'], 'account_id' => (int) $r['account_id'], 'account' => (string) $r['account_name'], 'origin' => (string) $r['origin'], 'device' => (string) $r['device_name'],
            'at' => (int) $r['created_ts'], 'kind' => (string) $r['kind'], 'field' => (string) $r['field'], 'person' => (int) $r['person_id'], 'label' => fc_label($pdo, (int) $r['person_id']),
            'old' => $old, 'new' => $new, 'comment' => (string) $r['comment'], 'file' => (string) $r['file'] !== '', 'status' => (string) $r['status'], 'direct' => (int) $r['direct'] === 1,
            'note' => (string) $r['decision_note'], 'decided' => (int) $r['decided_ts'], 'what' => fc_prop_summary((string) $r['kind'], (string) $r['field'], $old, $new)];
        if ($r['status'] === 'attente' && $r['kind'] === 'fait') {
            $now = fc_fact_value($pdo, (int) $r['person_id'], (string) $r['field'], true);
            if ($now !== null && fc_value_text($now) !== fc_value_text($old)) { $o['changed'] = fc_value_text($now); }
        }
        if ($r['status'] === 'attente' && $r['kind'] === 'personne') {
            $o['dups'] = fc_similar($pdo, (string) ($new['first_name'] ?? ''), (string) ($new['last_name'] ?? ''), fc_year_of((string) ($new['birth']['date'] ?? '')));
        }
        $out[] = $o;
    }
    return ['items' => $out, 'pending' => (int) $pdo->query("SELECT count(*) FROM fc_proposals WHERE status='attente'")->fetchColumn()];
}
function fc_owner_accept(PDO $pdo, array $d): array
{
    $prop = fc_prop($pdo, (int) ($d['id'] ?? 0));
    if (!$prop || $prop['status'] !== 'attente') { throw new LcndaBadInput('Cette proposition a déjà été traitée.'); }
    $o = [];
    if (array_key_exists('value', $d)) { $o['value'] = $d['value']; }
    if ($prop['kind'] === 'personne') {
        $choice = is_string($d['choice'] ?? null) ? (string) $d['choice'] : '';
        $dups = fc_similar($pdo, (string) ($prop['new']['first_name'] ?? ''), (string) ($prop['new']['last_name'] ?? ''), fc_year_of((string) ($prop['new']['birth']['date'] ?? '')));
        if ($choice === '' && $dups) { throw new FcRefuse('Une fiche existe peut-être déjà : relier, ou créer une nouvelle fiche ?', 409, ['needs_choice' => true, 'dups' => $dups]); }
        if ($choice === 'link') { $o['link_to'] = (int) ($d['link_to'] ?? 0); if ($o['link_to'] <= 0) { throw new LcndaBadInput('Choisis la fiche à relier.'); } }
    }
    $ops = fc_apply($pdo, $prop, $o, (string) $prop['account_name']);
    $pdo->prepare("UPDATE fc_proposals SET status='acceptee', decided_ts=?, applied_json=?, decision_note=? WHERE id=?")
        ->execute([fc_now(), json_encode($ops, JSON_UNESCAPED_UNICODE), fc_text($d['note'] ?? '', 500), (int) $prop['id']]);
    fc_journal_add($pdo, null, 'acceptee', (int) $prop['person_id'], fc_label($pdo, (int) $prop['person_id']), (string) $prop['account_name'] . ' · ' . fc_prop_summary((string) $prop['kind'], (string) $prop['field'], $prop['old'], $prop['new']), (int) $prop['id'], '');
    return ['id' => (int) $prop['id'], 'status' => 'acceptee', 'created_person' => (int) ($ops['created_person'] ?? 0)];
}
function fc_owner_refuse(PDO $pdo, array $d): array
{
    $prop = fc_prop($pdo, (int) ($d['id'] ?? 0));
    if (!$prop || $prop['status'] !== 'attente') { throw new LcndaBadInput('Cette proposition a déjà été traitée.'); }
    $pdo->prepare("UPDATE fc_proposals SET status='refusee', decided_ts=?, decision_note=? WHERE id=?")->execute([fc_now(), fc_text($d['note'] ?? '', 500), (int) $prop['id']]);
    fc_journal_add($pdo, null, 'refusee', (int) $prop['person_id'], fc_label($pdo, (int) $prop['person_id']), (string) $prop['account_name'] . ' · ' . fc_prop_summary((string) $prop['kind'], (string) $prop['field'], $prop['old'], $prop['new']), (int) $prop['id'], '');
    return ['id' => (int) $prop['id'], 'status' => 'refusee'];
}
/** ↶ : une acceptation défaite exactement (la proposition revient en attente) ; un refus repris ; une modification 🌿 annulée. */
function fc_owner_undo(PDO $pdo, array $d): array
{
    $prop = fc_prop($pdo, (int) ($d['id'] ?? 0));
    if (!$prop) { throw new LcndaBadInput('Introuvable.'); }
    if ($prop['status'] === 'refusee') {
        $pdo->prepare("UPDATE fc_proposals SET status='attente', decided_ts=0, decision_note='' WHERE id=?")->execute([(int) $prop['id']]);
        return ['id' => (int) $prop['id'], 'status' => 'attente'];
    }
    if ($prop['status'] !== 'acceptee') { throw new LcndaBadInput('Rien à annuler.'); }
    fc_undo($pdo, json_decode((string) $prop['applied_json'], true) ?: [], 'toi');
    $status = (int) $prop['direct'] === 1 ? 'annulee' : 'attente';
    $pdo->prepare("UPDATE fc_proposals SET status=?, decided_ts=?, applied_json='' WHERE id=?")->execute([$status, $status === 'annulee' ? fc_now() : 0, (int) $prop['id']]);
    fc_journal_add($pdo, null, 'annule', (int) $prop['person_id'], fc_label($pdo, (int) $prop['person_id']), (string) $prop['account_name'] . ' · ' . fc_prop_summary((string) $prop['kind'], (string) $prop['field'], $prop['old'], $prop['new']), (int) $prop['id'], '');
    return ['id' => (int) $prop['id'], 'status' => $status];
}
function fc_owner_journal(PDO $pdo, array $q): array
{
    $kinds = ['modifications' => ['modif', 'acceptee', 'annule', 'hors_branche'], 'propositions' => ['proposition', 'refusee', 'retiree'], 'visites' => ['visite', 'connexion', 'deconnexion', 'echec', 'invitation']];
    $where = []; $args = [];
    $f = is_string($q['filter'] ?? null) ? (string) $q['filter'] : '';
    if (isset($kinds[$f])) { $where[] = 'kind IN (' . implode(',', array_fill(0, count($kinds[$f]), '?')) . ')'; array_push($args, ...$kinds[$f]); }
    if (is_numeric($q['account'] ?? null) && (int) $q['account'] > 0) { $where[] = 'account_id=?'; $args[] = (int) $q['account']; }
    $s = $pdo->prepare('SELECT * FROM fc_journal' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY ts DESC, id DESC LIMIT 500');
    $s->execute($args);
    $rows = $s->fetchAll(PDO::FETCH_ASSOC);
    $status = [];
    foreach ($rows as $r) { if ((int) $r['prop_id'] && !isset($status[(int) $r['prop_id']])) { $p = $pdo->prepare('SELECT status, direct FROM fc_proposals WHERE id=?'); $p->execute([(int) $r['prop_id']]); $status[(int) $r['prop_id']] = $p->fetch(PDO::FETCH_ASSOC) ?: null; } }
    return ['items' => array_map(static function ($r) use ($status) {
        $st = (int) $r['prop_id'] ? ($status[(int) $r['prop_id']] ?? null) : null;
        return ['id' => (int) $r['id'], 'ts' => (int) $r['ts'], 'account_id' => (int) $r['account_id'], 'account' => (string) $r['account_name'], 'device' => (string) $r['device_name'], 'kind' => (string) $r['kind'],
            'person' => (int) $r['person_id'], 'label' => (string) $r['label'], 'detail' => (string) $r['detail'], 'prop' => (int) $r['prop_id'], 'n' => (int) $r['n'],
            'undo' => $st && $st['status'] === 'acceptee' && in_array($r['kind'], ['modif', 'acceptee'], true)];
    }, $rows), 'accounts' => $pdo->query('SELECT id, name FROM fc_accounts ORDER BY name COLLATE NOCASE')->fetchAll(PDO::FETCH_ASSOC)];
}
/** La photo jointe à une proposition (l'ordinateur principal seulement : api.php). */
function fc_owner_file(PDO $pdo, int $id, bool $thumb): never
{
    $s = $pdo->prepare('SELECT file FROM fc_proposals WHERE id=?'); $s->execute([$id]); $f = (string) $s->fetchColumn();
    if (!fc_box_file_ok($f)) { json_response(['error' => 'Introuvable.'], 404); }
    $path = fc_box_dir() . '/' . ($thumb ? preg_replace('/\.[a-z]+$/', '-v.jpg', $f) : $f);
    if (!is_file($path)) { $path = fc_box_dir() . '/' . $f; }
    if (!is_file($path)) { json_response(['error' => 'Introuvable.'], 404); }
    $type = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'avif' => 'image/avif'][pathinfo($path, PATHINFO_EXTENSION)] ?? 'application/octet-stream';
    header('Content-Type: ' . $type); header('X-Content-Type-Options: nosniff'); header('Cache-Control: no-store, private'); header("Content-Security-Policy: default-src 'none'; sandbox");
    while (ob_get_level() > 0) { ob_end_clean(); }
    readfile($path);
    exit;
}

/* ═════════════════ lib/reseau_local.php : un appareil réservé au site familial ═════════════════ */

/**
 * Cet appareil invité ne doit-il joindre QUE la page de la famille ? Oui s'il a été relié à un compte (même retiré depuis), ou
 * si le réglage « appareils sans compte » vaut « famille ». En cas de doute (base illisible), oui : jamais l'app entière.
 */
function fc_device_famille_only(string $devId): bool
{
    try {
        $pdo = function_exists('glock_raw_pdo') ? glock_raw_pdo() : null;
        if (!$pdo) { return false; }
        if (!fc_has_table($pdo, 'fc_devices')) {
            $s = $pdo->prepare('SELECT value FROM app_settings WHERE key=?'); $s->execute([FC_SETTINGS_KEY]);
            $j = json_decode((string) ($s->fetchColumn() ?: ''), true);
            return is_array($j) && ($j['sans_compte'] ?? '') === 'famille';
        }
        $s = $pdo->prepare('SELECT 1 FROM fc_devices WHERE device_id=?'); $s->execute([$devId]);
        if ($s->fetchColumn()) { return true; }
        return fc_settings($pdo)['sans_compte'] === 'famille';
    } catch (Throwable $_) {
        return true;
    }
}
