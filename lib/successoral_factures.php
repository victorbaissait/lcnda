<?php
declare(strict_types=1);

/**
 * ⚖️ Successoral : 🧾 devis et factures, 💶 suivi des fonds par héritier, 📈 tableau de bord de l'activité
 * (maquette docs/design/successoral-plus-2.html, outils 5, 6 et 10 ; écrans : assets/js/heritage-successoral-plus2b.js).
 *
 * 🧾 Ce que l'app ne fait pas : elle ne connaît ni ton statut, ni ton régime de TVA, ni les mentions que ta facture doit porter.
 * Le taux est tapé par toi (repris de ta dernière facture, jamais deviné) ; les mentions sont écrites par toi (🏢 Mon cabinet)
 * et recopiées telles quelles. L'app numérote sans trou (le numéro n'est donné qu'à l'émission, dans une seule écriture ;
 * un brouillon effacé ne consomme rien), interdit de modifier ou de supprimer une facture émise (un avoir la corrige), fait
 * les additions en centimes entiers et garde tout. Registre : un seul pour le cabinet (SHARED_DATA_DIR/factures-cabinet.sqlite,
 * hors des généalogies), ou dans la généalogie des dossiers (réglage).
 * 💶 Aucun actif net n'est gardé : seulement les mouvements réels tapés par toi (reçu du notaire, commission, frais, reversé).
 * 📈 Lecture seule ; aucun nom d'héritier, des numéros de dossier et des totaux.
 */

const SUCC_INV_KINDS = ['facture', 'avoir', 'devis'];
const SUCC_FUND_SENS = ['recu', 'commission', 'frais', 'reverse'];

/* ═════════ 🧾 Le registre ═════════ */
function succ_inv_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS succ_invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL DEFAULT 'facture', number TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft',
        day TEXT NOT NULL DEFAULT '', client_name TEXT NOT NULL DEFAULT '', client_address TEXT NOT NULL DEFAULT '', person_id INTEGER, case_number TEXT NOT NULL DEFAULT '', case_title TEXT NOT NULL DEFAULT '',
        genealogy TEXT NOT NULL DEFAULT '', rate_text TEXT NOT NULL DEFAULT '', rate_bp INTEGER, total_ht INTEGER NOT NULL DEFAULT 0, total_vat INTEGER NOT NULL DEFAULT 0, total_ttc INTEGER NOT NULL DEFAULT 0,
        mentions TEXT NOT NULL DEFAULT '', cabinet_json TEXT NOT NULL DEFAULT '', ref_id INTEGER, paid_on TEXT NOT NULL DEFAULT '', paid_how TEXT NOT NULL DEFAULT '', emitted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_succ_invoices_number ON succ_invoices(number) WHERE number<>''");
    $pdo->exec("CREATE TABLE IF NOT EXISTS succ_invoice_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL, pos INTEGER NOT NULL DEFAULT 0, label TEXT NOT NULL DEFAULT '',
        qty_milli INTEGER NOT NULL DEFAULT 1000, unit_cents INTEGER NOT NULL DEFAULT 0, total_cents INTEGER NOT NULL DEFAULT 0)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_succ_invoice_lines ON succ_invoice_lines(invoice_id, pos)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS succ_invoice_counters (kind TEXT NOT NULL, period TEXT NOT NULL, last INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(kind, period))");
}
function succ_inv_cabinet_path(): string { return SHARED_DATA_DIR . '/factures-cabinet.sqlite'; }
/** la base du registre : celle du cabinet (hors des généalogies) ou la généalogie ouverte (réglage) */
function succ_inv_pdo(PDO $pdo, ?string $mode = null): PDO
{
    $mode ??= succ_p2_set()['inv_register'];
    if ($mode !== 'cabinet') { return $pdo; }
    static $cab = null, $at = '';
    $path = succ_inv_cabinet_path();
    if ($cab && $at === $path) { return $cab; }
    $dir = dirname($path); if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
    $cab = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $cab->exec('PRAGMA busy_timeout = 30000'); $cab->exec('PRAGMA journal_mode = WAL');
    succ_inv_schema($cab); $at = $path;
    return $cab;
}
/** une écriture du registre : dans sa propre transaction (registre du cabinet, BEGIN IMMEDIATE) ou dans celle de la généalogie */
function succ_inv_write(PDO $pdo, callable $fn): array
{
    $b = succ_inv_pdo($pdo);
    if ($b === $pdo) { return $fn($b); }
    $b->exec('BEGIN IMMEDIATE');
    try { $r = $fn($b); $b->exec('COMMIT'); return $r; } catch (Throwable $e) { try { $b->exec('ROLLBACK'); } catch (Throwable $_) {} throw $e; }
}
/**
 * 🔐 Le registre du cabinet est commun à toutes les généalogies : les pièces d'une AUTRE généalogie verrouillée par un mot de passe
 * ne sont ni lues (liste, CSV, tableau de bord) ni modifiées (avoir, payée, devis…) ; seules celles de la généalogie ouverte et des
 * généalogies non verrouillées le sont. Les généalogies verrouillées sont seulement comptées (« n bases verrouillées non lues »).
 */
function succ_inv_hidden_gids(): array
{
    static $memo = null;
    if ($memo !== null) { return $memo; }
    $memo = [];
    if (!function_exists('glock_genealogy_locked') || !function_exists('succ_genealogies')) { return $memo; }
    try { foreach (succ_genealogies() as $gid => $_) { $gid = (string) $gid; if ($gid !== (string) GENEALOGY_ID && glock_genealogy_locked($gid)) { $memo[] = $gid; } } } catch (Throwable $_) {}
    return $memo;
}
/** la condition SQL « pas une pièce d'une autre généalogie verrouillée » : [sql, paramètres] */
function succ_inv_visible_sql(string $col = 'genealogy'): array
{
    $h = succ_inv_hidden_gids();
    return $h ? [$col . ' NOT IN (' . implode(',', array_fill(0, count($h), '?')) . ')', $h] : ['1=1', []];
}
/** combien d'autres généalogies verrouillées ont des pièces dans ce registre (rien d'autre n'est dit) */
function succ_inv_locked_count(PDO $b): int
{
    $h = succ_inv_hidden_gids(); if (!$h) { return 0; }
    try { $s = $b->prepare('SELECT COUNT(DISTINCT genealogy) FROM succ_invoices WHERE genealogy IN (' . implode(',', array_fill(0, count($h), '?')) . ')'); $s->execute($h); return (int) $s->fetchColumn(); } catch (Throwable $_) { return 0; }
}
/** au moins une facture, un avoir ou un devis numéroté dans ce registre (sans créer le registre du cabinet s'il n'existe pas) */
function succ_inv_has_emitted(PDO $pdo, string $mode): bool
{
    if ($mode === 'cabinet' && !is_file(succ_inv_cabinet_path())) { return false; }
    try { return (bool) succ_inv_pdo($pdo, $mode)->query("SELECT 1 FROM succ_invoices WHERE number<>'' LIMIT 1")->fetchColumn(); } catch (Throwable $_) { return false; }
}
/** « 20 », « 5,5 », « 0 » → 2000, 550, 0 (points de base) ; null si ce n'est pas un taux */
function succ_inv_rate(string $t): ?int
{
    $t = trim(str_replace([',', '%', ' '], ['.', '', ''], $t));
    if ($t === '' || !preg_match('/^\d{1,3}(\.\d{1,2})?$/', $t)) { return null; }
    $bp = (int) round((float) $t * 100);
    return $bp <= 10000 ? $bp : null;
}
/** arrondi au centime, la moitié s'éloignant de zéro (montants entiers) */
function succ_inv_div(int $a, int $b): int { $q = intdiv(abs($a) * 2 + $b, 2 * $b); return $a < 0 ? -$q : $q; }
function succ_inv_totals(array $lines, ?int $bp): array
{
    $ht = 0; $out = [];
    foreach ($lines as $l) { $t = succ_inv_div((int) $l['qty_milli'] * (int) $l['unit_cents'], 1000); $out[] = $l + ['total_cents' => $t]; $ht += $t; }
    $vat = $bp === null ? 0 : succ_inv_div($ht * $bp, 10000);
    return ['lines' => $out, 'ht' => $ht, 'vat' => $vat, 'ttc' => $ht + $vat];
}
function succ_inv_clean_lines(mixed $raw, bool $negOk = false): array
{
    $out = [];
    foreach (array_slice(is_array($raw) ? $raw : [], 0, 60) as $i => $l) {
        if (!is_array($l)) { continue; }
        $label = succ_txt($l['label'] ?? '', 300); if ($label === '') { continue; }
        $q = (int) round((float) str_replace(',', '.', (string) ($l['qty'] ?? 1)) * 1000); $u = (int) ($l['unit_cents'] ?? 0);
        if ($q <= 0 || $q > 100000000 || abs($u) > 100000000000 || (!$negOk && $u < 0)) { throw new LcndaBadInput('Ligne incorrecte : quantité ou prix.'); }
        $out[] = ['pos' => $i, 'label' => $label, 'qty_milli' => $q, 'unit_cents' => $u];
    }
    return $out;
}
function succ_inv_row(PDO $b, int $id): array
{
    $s = $b->prepare('SELECT * FROM succ_invoices WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new LcndaBadInput('Facture introuvable.'); }
    if (in_array((string) $r['genealogy'], succ_inv_hidden_gids(), true)) { throw new LcndaBadInput('Cette pièce appartient à une généalogie verrouillée par un mot de passe : ouvre-la d’abord.'); } // 🔐
    return $r;
}
function succ_inv_out(PDO $b, array $r): array
{
    $l = $b->prepare('SELECT pos, label, qty_milli, unit_cents, total_cents FROM succ_invoice_lines WHERE invoice_id=? ORDER BY pos, id'); $l->execute([(int) $r['id']]);
    return ['id' => (int) $r['id'], 'kind' => (string) $r['kind'], 'number' => (string) $r['number'], 'status' => (string) $r['status'], 'day' => (string) $r['day'], 'client_name' => (string) $r['client_name'],
        'client_address' => (string) $r['client_address'], 'person_id' => (int) $r['person_id'] ?: null, 'case_number' => (string) $r['case_number'], 'case_title' => (string) $r['case_title'], 'genealogy' => (string) $r['genealogy'],
        'rate_text' => (string) $r['rate_text'], 'rate_bp' => $r['rate_bp'] === null ? null : (int) $r['rate_bp'], 'ht' => (int) $r['total_ht'], 'vat' => (int) $r['total_vat'], 'ttc' => (int) $r['total_ttc'],
        'mentions' => (string) $r['mentions'], 'cabinet' => json_decode((string) $r['cabinet_json'], true) ?: null, 'ref_id' => (int) $r['ref_id'] ?: null, 'paid_on' => (string) $r['paid_on'], 'paid_how' => (string) $r['paid_how'],
        'emitted_at' => (string) ($r['emitted_at'] ?? ''), 'lines' => array_map(static fn($x) => ['label' => (string) $x['label'], 'qty' => (int) $x['qty_milli'] / 1000, 'unit_cents' => (int) $x['unit_cents'], 'total_cents' => (int) $x['total_cents']], $l->fetchAll(PDO::FETCH_ASSOC))];
}
function succ_inv_list(PDO $b, array $q = []): array
{
    [$vis, $p] = succ_inv_visible_sql(); $w = [$vis];
    if (($q['case_number'] ?? '') !== '') { $w[] = 'case_number=?'; $p[] = (string) $q['case_number']; }
    if (preg_match('/^\d{4}$/', (string) ($q['year'] ?? ''))) { $w[] = "(substr(day,1,4)=? OR number='')"; $p[] = (string) $q['year']; }
    $s = $b->prepare('SELECT * FROM succ_invoices' . ($w ? ' WHERE ' . implode(' AND ', $w) : '') . " ORDER BY CASE WHEN number='' THEN 0 ELSE 1 END, emitted_at DESC, id DESC LIMIT 2000"); $s->execute($p);
    return array_map(static fn($r) => succ_inv_out($b, $r), $s->fetchAll(PDO::FETCH_ASSOC));
}
/** le prochain numéro (sans le prendre) : « F-2026-0043 » ou « F-0043 » (compteur unique) */
function succ_inv_peek(PDO $b, string $kind, string $day): string
{
    $set = succ_p2_set();
    $prefix = ['facture' => $set['inv_prefix_f'], 'avoir' => $set['inv_prefix_a'], 'devis' => $set['inv_prefix_d']][$kind];
    $period = $set['inv_numbering'] === 'yearly' ? substr($day, 0, 4) : 'all';
    $s = $b->prepare('SELECT last FROM succ_invoice_counters WHERE kind=? AND period=?'); $s->execute([$kind, $period]);
    $n = (int) $s->fetchColumn() + 1;
    return $period === 'all' ? sprintf('%s-%04d', $prefix, $n) : sprintf('%s-%s-%04d', $prefix, $period, $n);
}
function succ_inv_take(PDO $b, string $kind, string $day): string
{
    $set = succ_p2_set();
    $period = $set['inv_numbering'] === 'yearly' ? substr($day, 0, 4) : 'all';
    $num = succ_inv_peek($b, $kind, $day);
    $b->prepare('INSERT INTO succ_invoice_counters(kind, period, last) VALUES(?,?,1) ON CONFLICT(kind, period) DO UPDATE SET last=last+1')->execute([$kind, $period]);
    $s = $b->prepare('SELECT 1 FROM succ_invoices WHERE number=?'); $s->execute([$num]);
    if ($s->fetchColumn()) { throw new LcndaBadInput('Numéro déjà pris : renuméroter le brouillon.'); }
    return $num;
}
/**
 * 🧾 la date du jour d'une émission (facture, devis, avoir) : celle de l'ordinateur de l'utilisateur (« today », envoyée par le
 * navigateur : le serveur compte en UTC), acceptée seulement à un jour près de la date du serveur ; sinon celle du serveur.
 * Jamais avant la dernière pièce émise de la même sorte : les numéros suivent les dates.
 */
function succ_inv_today(PDO $b, array $d, string $kind): string
{
    $srv = date('Y-m-d'); $t = (string) ($d['today'] ?? '');
    $day = succ_date_ok($t) && abs(strtotime($t . ' 12:00:00') - strtotime($srv . ' 12:00:00')) <= 86400 ? $t : $srv;
    $s = $b->prepare("SELECT MAX(day) FROM succ_invoices WHERE kind=? AND number<>''"); $s->execute([$kind]); $last = (string) $s->fetchColumn();
    if ($last !== '' && $day < $last) {
        if ($last > max($srv, $t)) { throw new LcndaBadInput('La dernière pièce émise est datée après aujourd’hui : vérifie la date de l’ordinateur avant d’émettre.'); }
        $day = $last;
    }
    return $day;
}
const SUCC_INV_LOCKED = 'Une facture émise ne peut plus être modifiée ni supprimée. Pour corriger : un avoir.';
function succ_inv_save(PDO $pdo, array $d): array
{
    return succ_inv_write($pdo, static function (PDO $b) use ($d): array {
        $id = safe_int($d['id'] ?? 0); $prev = null;
        if ($id) {
            $r = succ_inv_row($b, $id);
            if ($r['kind'] !== 'devis' && $r['status'] !== 'draft') { throw new LcndaBadInput(SUCC_INV_LOCKED); }
            if ($r['kind'] === 'devis' && $r['status'] === 'accepted') { throw new LcndaBadInput('Un devis accepté ne se modifie plus.'); }
            $prev = succ_inv_out($b, $r);
        }
        $kind = in_array($d['kind'] ?? '', ['facture', 'devis'], true) ? (string) $d['kind'] : 'facture';
        if ($id) { $kind = (string) succ_inv_row($b, $id)['kind']; }
        $day = succ_txt($d['day'] ?? date('Y-m-d'), 10); if (!succ_date_ok($day)) { throw new LcndaBadInput('Date incorrecte.'); }
        $rateText = succ_txt($d['rate_text'] ?? '', 8); $bp = $rateText === '' ? null : succ_inv_rate($rateText);
        if ($rateText !== '' && $bp === null) { throw new LcndaBadInput('Taux de TVA incorrect (ex. : le taux que t’a indiqué ton comptable).'); }
        $lines = succ_inv_clean_lines($d['lines'] ?? []);
        $T = succ_inv_totals($lines, $bp);
        $vals = [$kind, $day, succ_txt($d['client_name'] ?? '', 200), succ_txt($d['client_address'] ?? '', 600, true), safe_int($d['person_id'] ?? 0) ?: null, succ_txt($d['case_number'] ?? '', 40), succ_txt($d['case_title'] ?? '', 200), GENEALOGY_ID, $rateText, $bp, $T['ht'], $T['vat'], $T['ttc'], safe_int($d['ref_id'] ?? 0) ?: null];
        if ($id) { $b->prepare('UPDATE succ_invoices SET kind=?, day=?, client_name=?, client_address=?, person_id=?, case_number=?, case_title=?, genealogy=?, rate_text=?, rate_bp=?, total_ht=?, total_vat=?, total_ttc=?, ref_id=COALESCE(?, ref_id), updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$vals, $id]); }
        else { $b->prepare('INSERT INTO succ_invoices(kind, day, client_name, client_address, person_id, case_number, case_title, genealogy, rate_text, rate_bp, total_ht, total_vat, total_ttc, ref_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute($vals); $id = (int) $b->lastInsertId(); }
        $b->prepare('DELETE FROM succ_invoice_lines WHERE invoice_id=?')->execute([$id]);
        foreach ($T['lines'] as $l) { $b->prepare('INSERT INTO succ_invoice_lines(invoice_id, pos, label, qty_milli, unit_cents, total_cents) VALUES(?,?,?,?,?,?)')->execute([$id, $l['pos'], $l['label'], $l['qty_milli'], $l['unit_cents'], $l['total_cents']]); }
        return ['id' => $id, 'prev' => $prev, 'next' => succ_inv_peek($b, $kind, $day)];
    });
}
function succ_inv_delete(PDO $pdo, array $d): array
{
    return succ_inv_write($pdo, static function (PDO $b) use ($d): array {
        $r = succ_inv_row($b, safe_int($d['id'] ?? 0));
        if ($r['number'] !== '') { throw new LcndaBadInput(SUCC_INV_LOCKED); }
        $prev = succ_inv_out($b, $r);
        $b->prepare('DELETE FROM succ_invoice_lines WHERE invoice_id=?')->execute([(int) $r['id']]);
        $b->prepare('DELETE FROM succ_invoices WHERE id=?')->execute([(int) $r['id']]);
        return ['prev' => $prev];
    });
}
/** les champs que tu as déclarés obligatoires : vides → la facture n'est pas émise */
function succ_inv_missing(array $cab, bool $labels = true): array
{
    $miss = array_values(array_filter($cab['required'] ?? [], static fn($k) => trim((string) ($cab[$k] ?? '')) === ''));
    return $labels ? array_map(static fn($k) => ['name' => 'nom', 'address' => 'adresse', 'siret' => 'SIRET', 'vat' => 'n° de TVA', 'mentions' => 'mentions'][$k] ?? $k, $miss) : $miss;
}
function succ_inv_emit(PDO $pdo, array $d): array
{
    $cab = succ_p2_cabinet();
    if ($miss = succ_inv_missing($cab)) { throw new LcndaBadInput(function_exists('i18n_t') ? i18n_t('🏢 Mon cabinet : un champ que tu as déclaré obligatoire est vide ({f}) : la facture n’est pas émise.', ['f' => implode(', ', $miss)]) : '🏢 Mon cabinet : un champ que tu as déclaré obligatoire est vide (' . implode(', ', $miss) . ') : la facture n’est pas émise.'); }
    return succ_inv_write($pdo, static function (PDO $b) use ($d, $cab): array {
        $r = succ_inv_row($b, safe_int($d['id'] ?? 0));
        if ($r['number'] !== '') { throw new LcndaBadInput('Déjà émise.'); }
        if ($r['kind'] !== 'devis' && ($r['rate_bp'] === null || $r['rate_text'] === '')) { throw new LcndaBadInput('Choisis toi-même le taux de TVA (avec ton comptable) avant d’émettre.'); }
        if (!(int) $b->query('SELECT count(*) FROM succ_invoice_lines WHERE invoice_id=' . (int) $r['id'])->fetchColumn()) { throw new LcndaBadInput('La facture n’a aucune ligne.'); }
        // à l'émission, la pièce prend la date du jour (le brouillon ne garde sa date que tant qu'il est brouillon) : numéros et dates dans le même ordre
        $day = succ_inv_today($b, $d, (string) $r['kind']);
        $num = succ_inv_take($b, (string) $r['kind'], $day);
        $b->prepare("UPDATE succ_invoices SET number=?, day=?, status='emitted', emitted_at=CURRENT_TIMESTAMP, mentions=?, cabinet_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND number=''")
            ->execute([$num, $day, (string) $cab['mentions'], json_encode(array_intersect_key($cab, array_flip(['name', 'address', 'siret', 'vat'])), JSON_UNESCAPED_UNICODE), (int) $r['id']]);
        return ['id' => (int) $r['id'], 'number' => $num, 'day' => $day, 'draft_day' => (string) $r['day']];
    });
}
/** 🧾 un avoir : les lignes de la facture en négatif, son propre numéro, lien vers la facture ; émis tout de suite */
function succ_inv_avoir(PDO $pdo, array $d): array
{
    $cab = succ_p2_cabinet();
    if ($miss = succ_inv_missing($cab)) { throw new LcndaBadInput(function_exists('i18n_t') ? i18n_t('🏢 Mon cabinet : un champ que tu as déclaré obligatoire est vide ({f}) : la facture n’est pas émise.', ['f' => implode(', ', $miss)]) : '🏢 Mon cabinet : un champ que tu as déclaré obligatoire est vide (' . implode(', ', $miss) . ') : la facture n’est pas émise.'); }
    return succ_inv_write($pdo, static function (PDO $b) use ($d, $cab): array {
        $f = succ_inv_row($b, safe_int($d['id'] ?? 0));
        if ($f['kind'] !== 'facture' || $f['number'] === '') { throw new LcndaBadInput('Un avoir corrige une facture émise.'); }
        $s = $b->prepare("SELECT number FROM succ_invoices WHERE kind='avoir' AND ref_id=?"); $s->execute([(int) $f['id']]); if ($s->fetchColumn()) { throw new LcndaBadInput('Cette facture a déjà un avoir.'); }
        $day = succ_inv_today($b, $d, 'avoir');
        $lines = []; $l = $b->prepare('SELECT pos, label, qty_milli, unit_cents FROM succ_invoice_lines WHERE invoice_id=? ORDER BY pos, id'); $l->execute([(int) $f['id']]);
        foreach ($l->fetchAll(PDO::FETCH_ASSOC) as $x) { $lines[] = ['pos' => (int) $x['pos'], 'label' => (string) $x['label'], 'qty_milli' => (int) $x['qty_milli'], 'unit_cents' => -(int) $x['unit_cents']]; }
        $T = succ_inv_totals($lines, $f['rate_bp'] === null ? null : (int) $f['rate_bp']);
        $num = succ_inv_take($b, 'avoir', $day);
        $b->prepare("INSERT INTO succ_invoices(kind, number, status, day, client_name, client_address, person_id, case_number, case_title, genealogy, rate_text, rate_bp, total_ht, total_vat, total_ttc, mentions, cabinet_json, ref_id, emitted_at)
            VALUES('avoir',?, 'emitted', ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, CURRENT_TIMESTAMP)")
            ->execute([$num, $day, $f['client_name'], $f['client_address'], $f['person_id'], $f['case_number'], $f['case_title'], $f['genealogy'], $f['rate_text'], $f['rate_bp'], $T['ht'], $T['vat'], $T['ttc'], (string) $cab['mentions'], json_encode(array_intersect_key($cab, array_flip(['name', 'address', 'siret', 'vat'])), JSON_UNESCAPED_UNICODE), (int) $f['id']]);
        $id = (int) $b->lastInsertId();
        foreach ($T['lines'] as $x) { $b->prepare('INSERT INTO succ_invoice_lines(invoice_id, pos, label, qty_milli, unit_cents, total_cents) VALUES(?,?,?,?,?,?)')->execute([$id, $x['pos'], $x['label'], $x['qty_milli'], $x['unit_cents'], $x['total_cents']]); }
        return ['id' => $id, 'number' => $num, 'day' => $day];
    });
}
function succ_inv_paid(PDO $pdo, array $d): array
{
    return succ_inv_write($pdo, static function (PDO $b) use ($d): array {
        $r = succ_inv_row($b, safe_int($d['id'] ?? 0));
        if ($r['number'] === '' || $r['kind'] === 'devis') { throw new LcndaBadInput('Seule une facture émise peut être payée.'); }
        $on = succ_txt($d['paid_on'] ?? '', 10); if ($on !== '' && !succ_date_ok($on)) { throw new LcndaBadInput('Date incorrecte.'); }
        $prev = ['paid_on' => (string) $r['paid_on'], 'paid_how' => (string) $r['paid_how']];
        $b->prepare('UPDATE succ_invoices SET paid_on=?, paid_how=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$on, succ_txt($d['paid_how'] ?? '', 60), (int) $r['id']]);
        return ['prev' => $prev];
    });
}
function succ_inv_quote(PDO $pdo, array $d, string $act): array
{
    return succ_inv_write($pdo, static function (PDO $b) use ($d, $act): array {
        $q = succ_inv_row($b, safe_int($d['id'] ?? 0));
        if ($q['kind'] !== 'devis') { throw new LcndaBadInput('Ce n’est pas un devis.'); }
        if ($act === 'accept') { $b->prepare("UPDATE succ_invoices SET status=? WHERE id=?")->execute([empty($d['undo']) ? 'accepted' : 'emitted', (int) $q['id']]); return ['ok' => true]; }
        // une seule facture par devis (brouillon ou émise) : sinon le même devis serait facturé deux fois
        $s = $b->prepare("SELECT number FROM succ_invoices WHERE kind='facture' AND ref_id=? LIMIT 1"); $s->execute([(int) $q['id']]);
        if ($s->fetch()) { throw new LcndaBadInput('Ce devis a déjà sa facture (brouillon ou émise) : ouvre-la dans le registre.'); }
        $b->prepare("INSERT INTO succ_invoices(kind, day, client_name, client_address, person_id, case_number, case_title, genealogy, rate_text, rate_bp, total_ht, total_vat, total_ttc, ref_id) SELECT 'facture', ?, client_name, client_address, person_id, case_number, case_title, genealogy, rate_text, rate_bp, total_ht, total_vat, total_ttc, id FROM succ_invoices WHERE id=?")->execute([date('Y-m-d'), (int) $q['id']]);
        $id = (int) $b->lastInsertId();
        $b->prepare('INSERT INTO succ_invoice_lines(invoice_id, pos, label, qty_milli, unit_cents, total_cents) SELECT ?, pos, label, qty_milli, unit_cents, total_cents FROM succ_invoice_lines WHERE invoice_id=?')->execute([$id, (int) $q['id']]);
        return ['id' => $id];
    });
}
/** ⤓ CSV pour le comptable : n°, date, client, dossier, HT, taux, TVA, TTC, payée le, moyen (les fonds, si coché) */
function succ_inv_csv(PDO $pdo, array $g): never
{
    $b = succ_inv_pdo($pdo); $year = preg_match('/^\d{4}$/', (string) ($g['year'] ?? '')) ? (string) $g['year'] : date('Y');
    $cell = static function (string $v): string { if ($v !== '' && strpbrk($v[0], '=+-@') !== false && !preg_match('/^-?\d/', $v)) { $v = "'" . $v; } return '"' . str_replace('"', '""', $v) . '"'; };
    $eur = static fn(int $c): string => ($c < 0 ? '-' : '') . intdiv(abs($c), 100) . ',' . str_pad((string) (abs($c) % 100), 2, '0', STR_PAD_LEFT);
    $lines = [implode(';', array_map($cell, ['n°', 'date', 'client', 'dossier', 'généalogie', 'HT', 'taux', 'TVA', 'TTC', 'payée le', 'moyen']))];
    [$vis, $vp] = succ_inv_visible_sql();
    $s = $b->prepare("SELECT * FROM succ_invoices WHERE number<>'' AND kind<>'devis' AND substr(day,1,4)=? AND $vis ORDER BY number"); $s->execute([$year, ...$vp]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $lines[] = implode(';', array_map($cell, [(string) $r['number'], (string) $r['day'], (string) $r['client_name'], (string) $r['case_number'], (string) $r['genealogy'], $eur((int) $r['total_ht']), (string) $r['rate_text'], $eur((int) $r['total_vat']), $eur((int) $r['total_ttc']), (string) $r['paid_on'], (string) $r['paid_how']])); }
    if (!empty($g['funds']) && succ_p2_has($pdo, 'succ_funds')) {
        $lines[] = ''; $lines[] = implode(';', array_map($cell, ['fonds', 'date', 'dossier', 'sens', 'montant', 'moyen']));
        $f = $pdo->prepare("SELECT f.day, f.sens, f.amount_cents, f.moyen, c.number FROM succ_funds f JOIN succ_cases c ON c.id=f.case_id WHERE f.deleted_at IS NULL AND substr(f.day,1,4)=? ORDER BY f.day"); $f->execute([$year]);
        foreach ($f->fetchAll(PDO::FETCH_ASSOC) as $r) { $lines[] = implode(';', array_map($cell, ['', (string) $r['day'], (string) $r['number'], (string) $r['sens'], $eur((int) $r['amount_cents']), (string) $r['moyen']])); }
    }
    if (function_exists('access_log_add')) { access_log_add($pdo, 'export', '', null, '', 'succ_invoice_csv'); }
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="factures-' . $year . '.csv"');
    header('X-Content-Type-Options: nosniff');
    echo "\xEF\xBB\xBF" . implode("\r\n", $lines) . "\r\n";
    exit;
}

/* ═════════ 💶 Suivi des fonds par héritier ═════════ */
function succ_funds_rows(PDO $pdo, int $caseId): array
{
    if (!succ_p2_has($pdo, 'succ_funds')) { return []; }
    $s = $pdo->prepare('SELECT * FROM succ_funds WHERE case_id=? AND deleted_at IS NULL ORDER BY day, id'); $s->execute([$caseId]);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'person_id' => (int) $r['person_id'], 'day' => (string) $r['day'], 'sens' => (string) $r['sens'], 'cents' => (int) $r['amount_cents'], 'moyen' => (string) $r['moyen'],
        'paid_to' => (string) $r['paid_to'], 'media_id' => (int) $r['media_id'] ?: null, 'note' => (string) $r['note'], 'invoice' => (string) $r['invoice_ref'], 'origin' => (int) $r['origin_case_id'] ?: null], $s->fetchAll(PDO::FETCH_ASSOC));
}
function succ_fund_save(PDO $pdo, array $d): array
{
    $c = succ_p2_case_open($pdo, safe_int($d['case_id'] ?? 0)); $cid = (int) $c['id'];
    $id = safe_int($d['id'] ?? 0);
    $pid = safe_int($d['person_id'] ?? 0); if (!succ_person_ok($pdo, $pid)) { throw new LcndaBadInput('Choisis l’héritier.'); }
    $sens = in_array($d['sens'] ?? '', SUCC_FUND_SENS, true) ? (string) $d['sens'] : throw new LcndaBadInput('Valeur inconnue.');
    $day = succ_txt($d['day'] ?? date('Y-m-d'), 10); if (!succ_date_ok($day)) { throw new LcndaBadInput('Date incorrecte.'); }
    $cents = safe_int($d['cents'] ?? 0); if ($cents <= 0 || $cents > 100000000000) { throw new LcndaBadInput('Montant incorrect.'); }
    $vals = [$cid, $pid, $day, $sens, $cents, succ_txt($d['moyen'] ?? '', 60), succ_txt($d['paid_to'] ?? '', 200), safe_int($d['media_id'] ?? 0) ?: null, succ_txt($d['note'] ?? '', 400), succ_txt($d['invoice'] ?? '', 40)];
    $prev = null;
    if ($id) {
        $s = $pdo->prepare('SELECT * FROM succ_funds WHERE id=? AND case_id=?'); $s->execute([$id, $cid]); $prev = $s->fetch(PDO::FETCH_ASSOC); if (!$prev) { throw new LcndaBadInput('Mouvement introuvable.'); }
        $pdo->prepare('UPDATE succ_funds SET case_id=?, person_id=?, day=?, sens=?, amount_cents=?, moyen=?, paid_to=?, media_id=?, note=?, invoice_ref=? WHERE id=?')->execute([...$vals, $id]);
        succ_journal($pdo, $cid, 'fee', '💶 Mouvement de fonds corrigé (' . $sens . ', ' . $day . ') : ' . succ_person_name($pdo, $pid)); // sans montant, comme le registre
    } else {
        $pdo->prepare('INSERT INTO succ_funds(case_id, person_id, day, sens, amount_cents, moyen, paid_to, media_id, note, invoice_ref) VALUES(?,?,?,?,?,?,?,?,?,?)')->execute($vals); $id = (int) $pdo->lastInsertId();
        succ_journal($pdo, $cid, 'fee', '💶 Mouvement de fonds noté (' . ['recu' => 'reçu du notaire', 'commission' => 'commission', 'frais' => 'frais refacturés', 'reverse' => 'reversé'][$sens] . ', ' . $day . ') : ' . succ_person_name($pdo, $pid));
    }
    succ_touch($pdo, $cid);
    return ['id' => $id, 'prev' => $prev];
}
function succ_fund_delete(PDO $pdo, array $d, bool $restore): array
{
    $cid = safe_int($d['case_id'] ?? 0); succ_row($pdo, $cid);
    $pdo->prepare('UPDATE succ_funds SET deleted_at=' . ($restore ? 'NULL' : 'CURRENT_TIMESTAMP') . ' WHERE id=? AND case_id=?')->execute([safe_int($d['id'] ?? 0), $cid]);
    return ['ok' => true];
}
function succ_fund_undo_edit(PDO $pdo, array $d): array
{
    $cid = safe_int($d['case_id'] ?? 0); succ_row($pdo, $cid); $p = is_array($d['prev'] ?? null) ? $d['prev'] : null; if (!$p) { throw new LcndaBadInput('Rien à annuler.'); }
    $pdo->prepare('UPDATE succ_funds SET person_id=?, day=?, sens=?, amount_cents=?, moyen=?, paid_to=?, note=?, invoice_ref=? WHERE id=? AND case_id=?')
        ->execute([safe_int($p['person_id'] ?? 0), succ_txt($p['day'] ?? '', 10), in_array($p['sens'] ?? '', SUCC_FUND_SENS, true) ? $p['sens'] : 'recu', safe_int($p['amount_cents'] ?? 0), succ_txt($p['moyen'] ?? '', 60), succ_txt($p['paid_to'] ?? '', 200), succ_txt($p['note'] ?? '', 400), succ_txt($p['invoice_ref'] ?? '', 40), safe_int($p['id'] ?? 0), $cid]);
    return ['ok' => true];
}

/* ═════════ 📈 Tableau de bord de l'activité (lecture seule ; aucun nom d'héritier) ═════════ */
function succ_act_period(string $p, string $from = '', string $to = ''): array
{
    $today = date('Y-m-d');
    return match ($p) {
        'month' => [date('Y-m-01'), $today], 'quarter' => [date('Y') . '-' . str_pad((string) (intdiv((int) date('n') - 1, 3) * 3 + 1), 2, '0', STR_PAD_LEFT) . '-01', $today],
        '12m' => [date('Y-m-d', strtotime('-12 months +1 day')), $today], 'custom' => [succ_date_ok($from) ? $from : date('Y-01-01'), succ_date_ok($to) ? $to : $today],
        default => [date('Y-01-01'), $today],
    };
}
function succ_activity(PDO $pdo, array $g): array
{
    $set = succ_p2_set();
    $per = (string) ($g['period'] ?? '') ?: ($set['act_period'] === '12m' ? '12m' : 'year');
    [$from, $to] = succ_act_period($per, (string) ($g['from'] ?? ''), (string) ($g['to'] ?? ''));
    $only = (string) ($g['genealogy'] ?? '');
    $cases = []; $locked = 0; $contracts = ['signed' => 0, 'refused' => 0, 'later' => 0, 'none' => 0];
    foreach (succ_genealogies() as $gid => $gi) {
        if ($only !== '' && $only !== (string) $gid) { continue; }
        if (!$gi['active'] && function_exists('glock_genealogy_locked') && glock_genealogy_locked((string) $gid)) { $locked++; continue; }
        try {
            $b = $gi['active'] ? $pdo : succ_open_ro($gi['path']); if (!$b || !succ_p2_has($b, 'succ_cases')) { continue; }
            foreach ($b->query("SELECT id, number, deceased_id, opened_at, state, created_at FROM succ_cases WHERE deleted_at IS NULL")->fetchAll(PDO::FETCH_ASSOC) as $c) {
                $j = $b->prepare("SELECT MIN(at) FROM succ_journal WHERE case_id=? AND kind='state' AND text LIKE '%→ Remis au notaire%'"); $j->execute([(int) $c['id']]); $remis = substr((string) $j->fetchColumn(), 0, 10);
                $m = (int) $b->query("SELECT COALESCE(SUM(minutes),0) FROM succ_fees WHERE case_id=" . (int) $c['id'] . " AND kind='time' AND deleted_at IS NULL")->fetchColumn();
                $last = ''; if (preg_match('/([A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ\'’ -]+)$/u', succ_person_name($b, (int) $c['deceased_id']), $mm)) { $last = trim($mm[1]); }
                $opened = (string) ($c['opened_at'] ?: substr((string) $c['created_at'], 0, 10));
                $cases[] = ['number' => (string) $c['number'], 'label' => trim($c['number'] . ' ' . $last), 'opened' => $opened, 'remis' => $remis, 'state' => (string) $c['state'], 'minutes' => $m, 'gid' => (string) $gid];
            }
            if (succ_p2_has($b, 'courriers', 'succ_case_id')) {
                $s = $b->prepare("SELECT reponse, signe_le FROM courriers WHERE succ_case_id IS NOT NULL AND succ_kind='contrat' AND date_envoi BETWEEN ? AND ?"); $s->execute([$from, $to]);
                foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $k) { $contracts[$k['signe_le'] !== '' ? 'signed' : ($k['reponse'] === 'no' ? 'refused' : ($k['reponse'] === 'later' ? 'later' : 'none'))]++; }
            }
        } catch (Throwable $_) { $locked += 0; }
    }
    $in = static fn($d) => $d !== '' && $d >= $from && $d <= $to;
    $opened = array_values(array_filter($cases, static fn($c) => $in($c['opened'])));
    $remisIn = array_values(array_filter($cases, static fn($c) => $in($c['remis'])));
    $delay = static fn($c) => (strtotime($c['remis']) - strtotime($c['opened'])) / 86400 / 30.44;
    $open = array_values(array_filter($cases, static fn($c) => $c['remis'] === '' && !in_array($c['state'], ['clos', 'archive'], true)));
    $inv = ['ht' => 0, 'ttc' => 0, 'paid_ht' => 0, 'paid_ttc' => 0, 'quarters' => [], 'count' => 0];
    try {
        $b = succ_inv_pdo($pdo);
        [$vis, $vp] = succ_inv_visible_sql();
        $s = $b->prepare("SELECT day, total_ht, total_ttc, paid_on, genealogy FROM succ_invoices WHERE number<>'' AND kind IN ('facture','avoir') AND $vis"); $s->execute($vp);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
            if ($only !== '' && (string) $r['genealogy'] !== $only) { continue; }
            $q = substr((string) $r['day'], 0, 4) . '-T' . (intdiv((int) substr((string) $r['day'], 5, 2) - 1, 3) + 1);
            if ($in((string) $r['day'])) { $inv['ht'] += (int) $r['total_ht']; $inv['ttc'] += (int) $r['total_ttc']; $inv['count']++; $inv['quarters'][$q]['ht'] = ($inv['quarters'][$q]['ht'] ?? 0) + (int) $r['total_ht']; $inv['quarters'][$q]['ttc'] = ($inv['quarters'][$q]['ttc'] ?? 0) + (int) $r['total_ttc']; }
            if ($r['paid_on'] !== '' && $in((string) $r['day'])) { $inv['paid_ht'] += (int) $r['total_ht']; $inv['paid_ttc'] += (int) $r['total_ttc']; }
            if ($r['paid_on'] !== '' && $in((string) $r['paid_on'])) { $pq = substr((string) $r['paid_on'], 0, 4) . '-T' . (intdiv((int) substr((string) $r['paid_on'], 5, 2) - 1, 3) + 1); $inv['quarters'][$pq]['paid_ht'] = ($inv['quarters'][$pq]['paid_ht'] ?? 0) + (int) $r['total_ht']; $inv['quarters'][$pq]['paid_ttc'] = ($inv['quarters'][$pq]['paid_ttc'] ?? 0) + (int) $r['total_ttc']; }
        }
        ksort($inv['quarters']);
    } catch (Throwable $_) {}
    usort($cases, static fn($a, $b) => $b['minutes'] <=> $a['minutes']);
    return ['from' => $from, 'to' => $to, 'period' => $per, 'locked' => $locked, 'opened' => count($opened), 'closed' => count(array_filter($opened, static fn($c) => in_array($c['state'], ['clos', 'archive'], true))),
        'delay' => count($remisIn) >= 3 ? round(array_sum(array_map($delay, $remisIn)) / count($remisIn), 1) : null, 'remis' => count($remisIn),
        'open_n' => count($open), 'open_age' => count($open) >= 3 ? round(array_sum(array_map(static fn($c) => (time() - strtotime($c['opened'])) / 86400 / 30.44, $open)) / count($open), 1) : null,
        'contracts' => $contracts, 'invoices' => $inv, 'time' => array_slice(array_map(static fn($c) => ['label' => $c['label'], 'hours' => round($c['minutes'] / 60, 1)], array_filter($cases, static fn($c) => $c['minutes'] > 0)), 0, 12),
        'amounts' => $set['act_amounts']];
}

/* ═════════ API ═════════ */
function succ_fact_get(PDO $pdo, string $op, array $g): array
{
    return match ($op) {
        'p2_invoices' => ['items' => succ_inv_list(succ_inv_pdo($pdo), $g), 'register' => succ_p2_set()['inv_register'], 'next' => ['facture' => succ_inv_peek(succ_inv_pdo($pdo), 'facture', date('Y-m-d')), 'devis' => succ_inv_peek(succ_inv_pdo($pdo), 'devis', date('Y-m-d'))],
            'last_rate' => (static function () use ($pdo): string { [$vis, $vp] = succ_inv_visible_sql(); $s = succ_inv_pdo($pdo)->prepare("SELECT rate_text FROM succ_invoices WHERE number<>'' AND kind='facture' AND rate_text<>'' AND $vis ORDER BY emitted_at DESC, id DESC LIMIT 1"); $s->execute($vp); return (string) ($s->fetchColumn() ?: ''); })(),
            'cabinet_missing' => succ_inv_missing(succ_p2_cabinet(), false), 'locked' => succ_inv_locked_count(succ_inv_pdo($pdo))],
        'p2_invoice_csv' => succ_inv_csv($pdo, $g),
        'p2_activity' => succ_activity($pdo, $g),
        default => throw new LcndaBadInput('Demande inconnue.'),
    };
}
function succ_fact_post(PDO $pdo, string $op, array $d): array
{
    return match ($op) {
        'p2_inv_save' => succ_inv_save($pdo, $d),
        'p2_inv_delete' => succ_inv_delete($pdo, $d),
        'p2_inv_emit' => succ_inv_emit($pdo, $d),
        'p2_inv_avoir' => succ_inv_avoir($pdo, $d),
        'p2_inv_paid' => succ_inv_paid($pdo, $d),
        'p2_inv_accept' => succ_inv_quote($pdo, $d, 'accept'),
        'p2_inv_from_quote' => succ_inv_quote($pdo, $d, 'transform'),
        'p2_fund_save' => succ_fund_save($pdo, $d),
        'p2_fund_delete' => succ_fund_delete($pdo, $d, false),
        'p2_fund_restore' => succ_fund_delete($pdo, $d, true),
        'p2_fund_undo_edit' => succ_fund_undo_edit($pdo, $d),
        default => throw new LcndaBadInput('Demande inconnue.'),
    };
}
