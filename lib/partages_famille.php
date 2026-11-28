<?php
declare(strict_types=1);

/*
 * 📥 « Ce qu'on m'a partagé » sur le site familial (famille.php) : les 🧺 paniers envoyés à un compte (✉ « Envoyer à un compte du
 * site familial », lib/paniers.php → cx_shares) et les 📊 listes partagées (lib/donnees_plus.php → dplus_shares), dans une seule vue
 * (assets/js/app-famille.js, #partages).
 *
 * Deux filtres côté serveur, à l'envoi ET à chaque lecture (les vivants ont pu changer depuis l'envoi) :
 *  - à l'envoi (pf_send, depuis l'ordinateur principal : api.php, CSRF, refusé en consultation par kiosk_guard) : jamais un élément
 *    bloqué (pn_item_blocked : vivant, peut-être vivant, confidentiel, média qui en montre un), jamais une note, ni un élément qui nomme
 *    une personne cachée (fc_hidden) ; on garde à part (colonne refs, jamais montrée) les fiches dont vient chaque élément ;
 *  - à la lecture (pf_guest, famille.php, action « partages » en lecture seule) : on retire tout élément dont une fiche est maintenant
 *    cachée (fc_hidden) ou hors de la branche du compte (fc_scope_ids), ou dont le texte nomme une telle personne ; liens http(s) seulement.
 * Le compte peut « ✕ retirer de ma liste » (↶) ; l'envoyeur voit « envoyé · lu le … · retiré ». Rien de tout cela ne part en ligne.
 */

const PF_COLS = ['read_ts' => 'INTEGER NOT NULL DEFAULT 0', 'dismissed_ts' => 'INTEGER NOT NULL DEFAULT 0', 'basket_id' => 'INTEGER NOT NULL DEFAULT 0', 'refs' => "TEXT NOT NULL DEFAULT ''"];

function pf_has_table(PDO $pdo, string $t): bool
{
    $s = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"); $s->execute([$t]);
    return (bool) $s->fetchColumn();
}

/** les colonnes ajoutées à cx_shares (rejouable) ; false si la table n'existe pas encore (rien n'a jamais été envoyé) */
function partfam_schema(PDO $pdo): bool
{
    if (!pf_has_table($pdo, 'cx_shares')) { return false; }
    $have = array_column($pdo->query('PRAGMA table_info(cx_shares)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    foreach (PF_COLS as $c => $def) { if (!in_array($c, $have, true)) { try { $pdo->exec("ALTER TABLE cx_shares ADD COLUMN $c $def"); } catch (Throwable $_) {} } }
    return true;
}

/** la personne dont vient un élément du panier (0 si aucune) */
function pf_item_pid(PDO $pdo, array $r): int
{
    if ($r['kind'] === 'person') { return (int) $r['ref_id']; }
    if ($r['kind'] === 'event' && $r['ref_id']) { $s = $pdo->prepare('SELECT person_id FROM events WHERE id=?'); $s->execute([(int) $r['ref_id']]); return (int) $s->fetchColumn(); }
    return (int) ($r['origin']['person_id'] ?? 0);
}

/** le texte d'un élément partagé (titre, valeur, source, données) : pour y chercher un nom caché */
function pf_item_text(array $it): string
{
    $bits = [(string) ($it['title'] ?? ''), (string) ($it['value'] ?? ''), (string) ($it['source'] ?? '')];
    $data = is_array($it['data'] ?? null) ? $it['data'] : [];
    array_walk_recursive($data, static function ($v) use (&$bits) { if (is_scalar($v)) { $bits[] = (string) $v; } });
    return implode(' · ', $bits);
}

/** ✉ envoyer un panier à un compte (lib/paniers.php pn_share_send) */
function pf_send(PDO $pdo, array $d): array
{
    require_once __DIR__ . '/comptes_famille.php';
    require_once __DIR__ . '/donnees_plus.php';
    $acc = safe_int($d['account_id'] ?? 0);
    if (!in_array($acc, array_column(pn_share_accounts($pdo)['accounts'], 'id'), true)) { throw new LcndaBadInput('Compte du site familial introuvable.'); }
    $bid = safe_int($d['basket_id'] ?? 0);
    pn_basket($pdo, $bid);
    $rows = pn_share_rows($pdo, $bid);
    $notes = 0;
    $inc = [];
    foreach (array_map('intval', is_array($d['include'] ?? null) ? $d['include'] : []) as $i) { $inc[$i] = true; }
    foreach ($rows as $r) { if ($r['kind'] === 'note' && isset($inc[$r['id']])) { unset($inc[$r['id']]); $notes++; } } // jamais les notes
    $f = pn_share_build($pdo, ['basket_id' => $bid, 'include' => array_keys($inc)]);
    // les fiches d'où vient chaque élément gardé (dans le même ordre que pn_share_build)
    $refs = [];
    foreach ($rows as $r) {
        if ($r['blocked'] || ($r['personal'] && !isset($inc[$r['id']]))) { continue; }
        $refs[] = $r['personal'] ? pf_item_pid($pdo, $r) : 0;
    }
    $hiddenIds = fc_hidden($pdo);
    $names = dplus_hidden_names($pdo);
    $items = []; $keptRefs = []; $dropped = 0;
    foreach ($f['share']['items'] as $i => $it) {
        $pid = (int) ($refs[$i] ?? 0);
        if (($pid && isset($hiddenIds[$pid])) || dplus_names_hit(pf_item_text($it), $names)) { $dropped++; continue; }
        $items[] = $it; $keptRefs[] = $pid;
    }
    $f['share']['items'] = $items;
    if (!$items) { throw new LcndaBadInput('Rien à envoyer : ce panier ne contient que des éléments qui ne se partagent pas.'); }
    if (dplus_names_hit((string) $f['share']['name'], $names)) { $f['share']['name'] = cx_t('Panier partagé'); }
    $f['counts']['blocked'] += $dropped; $f['counts']['notes'] = $notes; $f['counts']['sent'] = count($items);
    $pdo->prepare('INSERT INTO cx_shares(account_id, name, body) VALUES(?,?,?)')->execute([$acc, $f['share']['name'], (string) json_encode($f['share'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
    $id = (int) $pdo->lastInsertId();
    partfam_schema($pdo);
    $pdo->prepare('UPDATE cx_shares SET basket_id=?, refs=? WHERE id=?')->execute([$bid, (string) json_encode($keptRefs), $id]);
    pn_log($pdo, $bid, cx_t('Envoyé à un compte du site familial'));
    return ['share_id' => $id, 'counts' => $f['counts'], 'sent' => pf_sent($pdo, ['basket_id' => $bid])['sent']];
}

/** ce que l'envoyeur voit : à qui, quand, et « lu » / « retiré » */
function pf_sent(PDO $pdo, array $d): array
{
    if (!partfam_schema($pdo)) { return ['sent' => []]; }
    $bid = safe_int($d['basket_id'] ?? 0);
    $hasAcc = pf_has_table($pdo, 'fc_accounts');
    $sql = 'SELECT s.id, s.name, s.created_at, s.read_ts, s.dismissed_ts, s.body, ' . ($hasAcc ? "COALESCE(a.name,'')" : "''") . ' AS account
        FROM cx_shares s ' . ($hasAcc ? 'LEFT JOIN fc_accounts a ON a.id=s.account_id ' : '') . ($bid ? 'WHERE s.basket_id=? ' : '') . 'ORDER BY s.id DESC LIMIT 50';
    $s = $pdo->prepare($sql); $s->execute($bid ? [$bid] : []);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $b = json_decode((string) $r['body'], true);
        $st = (int) $r['dismissed_ts'] ? 'retire' : ((int) $r['read_ts'] ? 'lu' : 'envoye');
        $out[] = ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'account' => (string) $r['account'], 'at' => (string) $r['created_at'], 'status' => $st,
            'read' => (int) $r['read_ts'] ? date('Y-m-d H:i', (int) $r['read_ts']) : '', 'n' => is_array($b['items'] ?? null) ? count($b['items']) : 0];
    }
    return ['sent' => $out];
}

/** la règle de lecture d'un compte : fiches cachées (vivants, confidentielles) + hors de sa branche ; et leurs noms */
function pf_guest_filter(PDO $pdo, array $a): array
{
    require_once __DIR__ . '/donnees_plus.php';
    $ids = fc_hidden($pdo);
    $names = dplus_hidden_names($pdo);
    $scope = fc_scope_ids($pdo, $a);
    if ($scope !== null) {
        $out = [];
        foreach ($pdo->query('SELECT id FROM persons') as $r) { if (!isset($scope[(int) $r['id']])) { $out[] = (int) $r['id']; $ids[(int) $r['id']] = 'scope'; } }
        foreach (dplus_names_of($pdo, $out) as $w => $list) { foreach ($list as $x) { $names[$w][] = $x; } }
    }
    return [$ids, $names];
}

/** 🧺 les paniers reçus par ce compte, repassés au filtre */
function pf_guest_baskets(PDO $pdo, array $a): array
{
    if (!partfam_schema($pdo)) { return []; }
    [$ids, $names] = pf_guest_filter($pdo, $a);
    $s = $pdo->prepare('SELECT id, name, body, refs, created_at, read_ts FROM cx_shares WHERE account_id=? AND dismissed_ts=0 ORDER BY id DESC LIMIT 50');
    $s->execute([(int) $a['id']]);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $b = json_decode((string) $r['body'], true);
        if (!is_array($b) || ($b['format'] ?? '') !== 'lcnda-panier' || !is_array($b['items'] ?? null)) { continue; }
        $refs = json_decode((string) $r['refs'], true); $refs = is_array($refs) ? $refs : [];
        $items = []; $dropped = 0;
        foreach (array_values($b['items']) as $i => $it) {
            if (!is_array($it) || ($it['kind'] ?? '') === 'note') { $dropped++; continue; }
            $pid = (int) ($refs[$i] ?? 0);
            if (($pid && isset($ids[$pid])) || dplus_names_hit(pf_item_text($it), $names)) { $dropped++; continue; }
            $url = is_string($it['url'] ?? null) && preg_match('#^https?://[^\s<>"\']+$#i', $it['url']) ? (string) $it['url'] : '';
            $items[] = ['title' => mb_substr((string) ($it['title'] ?? ''), 0, 500), 'value' => mb_substr((string) ($it['value'] ?? ''), 0, 4000),
                'source' => mb_substr((string) ($it['source'] ?? ''), 0, 300), 'url' => $url, 'status' => (string) ($it['status'] ?? '')];
        }
        $name = (string) $r['name'];
        if (dplus_names_hit($name, $names)) { $name = 'Panier partagé'; }
        $out[] = ['id' => (int) $r['id'], 'name' => $name, 'icon' => mb_substr((string) ($b['icon'] ?? ''), 0, 16), 'at' => (string) $r['created_at'],
            'new' => !(int) $r['read_ts'], 'items' => $items, 'hidden' => $dropped];
    }
    return $out;
}

/** famille.php ?action=partages (lecture seule) : 🧺 paniers reçus + 📊 listes partagées, une seule vue */
function pf_guest(PDO $pdo, array $a): array
{
    require_once __DIR__ . '/donnees_plus.php';
    $lists = dplus_guest_lists($pdo, $a)['lists'] ?? [];
    return ['baskets' => pf_guest_baskets($pdo, $a), 'lists' => $lists];
}

/** l'ordinateur principal est-il en mode consultation ? (sur famille.php, kiosk_state() vaut toujours « on » pour un appareil invité) */
function pf_main_kiosk(): bool
{
    return function_exists('kiosk_path') && is_file(kiosk_path());
}

/** famille.php POST partages_vu {ids} : « lu » pour l'envoyeur ; POST partage_retirer {id, undo} : ✕ retirer de ma liste (↶) */
function pf_guest_write(PDO $pdo, array $a, string $action, array $p): array
{
    if (pf_main_kiosk()) { return ['ok' => false, 'kiosk' => true]; }
    if (!partfam_schema($pdo)) { return ['ok' => true, 'n' => 0]; }
    if ($action === 'partages_vu') {
        $ids = array_slice(array_values(array_filter(array_map('intval', is_array($p['ids'] ?? null) ? $p['ids'] : []), static fn($i) => $i > 0)), 0, 100);
        $u = $pdo->prepare('UPDATE cx_shares SET read_ts=? WHERE id=? AND account_id=? AND read_ts=0'); $n = 0;
        foreach ($ids as $i) { $u->execute([fc_now(), $i, (int) $a['id']]); $n += $u->rowCount(); }
        return ['ok' => true, 'n' => $n];
    }
    $id = (int) (is_numeric($p['id'] ?? null) ? $p['id'] : 0);
    $u = $pdo->prepare('UPDATE cx_shares SET dismissed_ts=? WHERE id=? AND account_id=?');
    $u->execute([empty($p['undo']) ? fc_now() : 0, $id, (int) $a['id']]);
    if (!$u->rowCount()) { throw new LcndaBadInput('Panier introuvable.'); }
    return ['ok' => true];
}
