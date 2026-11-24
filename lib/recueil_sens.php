<?php
declare(strict_types=1);

/*
 * 💡 Ce qu'on trouve dans un recueil (ou dans tous les recueils d'un service d'archives) — maquette docs/design/registres-etat-fonds.html,
 * partie 7. Tout est calculé depuis ce qui est déjà transcrit (actes de l'Atelier sur les photos des pages, gabarits, transcriptions des pages) :
 * actes par année et par sorte (avec les années sans acte), personnes citées (et reliées à une fiche), noms les plus fréquents, métiers,
 * lieux, « signe » / « ne sait signer », années couvertes ; et des remarques À VÉRIFIER (jamais affirmées) : une année sans acte au milieu,
 * une année avec deux fois plus de décès que d'habitude. Rien n'est gardé : c'est relu à chaque fois.
 * Écran : assets/js/heritage-recueil-sens.js. Essai : tests/test-recueil-sens.js.
 */

/** les actes de l'Atelier faits sur les photos des pages de ces recueils (une fois chacun) */
function recueil_sens_acts(PDO $pdo, array $rids): array
{
    if (!$rids || !function_exists('act_transcriptions_ensure')) { return []; }
    act_transcriptions_ensure($pdo);
    $in = implode(',', array_map('intval', $rids));
    $media = array_map('intval', $pdo->query("SELECT DISTINCT media_id FROM recueil_images WHERE recueil_id IN ($in) AND page_id IS NOT NULL")->fetchAll(PDO::FETCH_COLUMN));
    if (!$media) { return []; }
    return $pdo->query('SELECT id, kind, date_text, place, body, data_json FROM act_transcriptions WHERE media_id IN (' . implode(',', $media) . ') ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
}

/** le nom de famille d'un nom écrit « Jean MAZAUD » / « MAZAUD Jean » : le mot en capitales, sinon le dernier */
function recueil_sens_surname(string $name): string
{
    $words = preg_split('/\s+/u', trim($name)) ?: [];
    foreach ($words as $w) { if (mb_strlen($w) > 1 && $w === mb_strtoupper($w) && preg_match('/\p{L}/u', $w)) { return $w; } }
    $last = end($words);
    return $last ? mb_strtoupper((string) $last) : '';
}

function recueil_sens(PDO $pdo, array $rids): array
{
    $acts = recueil_sens_acts($pdo, $rids);
    $byYear = []; $kinds = []; $people = 0; $linked = 0; $names = []; $jobs = []; $places = []; $signs = 0; $nosign = 0;
    foreach ($acts as $a) {
        $k = $a['kind'] === 'apreciser' ? '' : (string) $a['kind'];
        $y = preg_match('/\b(1[0-9]{3}|20[0-9]{2})\b/', (string) $a['date_text'], $m) ? (int) $m[1] : 0;
        if ($k) { $kinds[$k] = ($kinds[$k] ?? 0) + 1; }
        if ($y) { $byYear[$y][$k ?: 'autre'] = ($byYear[$y][$k ?: 'autre'] ?? 0) + 1; }
        $d = json_decode((string) $a['data_json'], true) ?: [];
        foreach (is_array($d['people'] ?? null) ? $d['people'] : [] as $p) {
            $n = trim((string) ($p['name'] ?? '')); if ($n === '') { continue; }
            $people++; if (!empty($p['person_id'])) { $linked++; }
            $s = recueil_sens_surname($n); if ($s !== '') { $names[$s] = ($names[$s] ?? 0) + 1; }
        }
        foreach (is_array($d['gabarit']['fields'] ?? null) ? $d['gabarit']['fields'] : [] as $key => $f) {
            $v = trim((string) (is_array($f) ? ($f['v'] ?? '') : $f));
            if ($v !== '' && preg_match('/metier|profession|qualite|etat_social/', (string) $key)) { $j = mb_strtolower($v); $jobs[$j] = ($jobs[$j] ?? 0) + 1; }
        }
        $pl = trim(explode(',', (string) $a['place'])[0]); if ($pl !== '') { $places[$pl] = ($places[$pl] ?? 0) + 1; }
        $body = mb_strtolower((string) $a['body']);
        if (preg_match("/ne (sai[ts]?|savoir|savent|savait|savaient|savons) (pas )?signer|ne pas savoir signer|n['’](a|ont|avoir) (pas |point )?su signer|illettr/u", $body)) { $nosign++; }
        elseif (preg_match('/\b(a|ont) signé|\bsigné avec nous|\bse sont soussignés|\bsoussigné/u', $body)) { $signs++; }
    }
    ksort($byYear);
    // les années sans acte entre la première et la dernière (au plus 300 ans d'écart)
    $years = array_keys($byYear); $gaps = [];
    if (count($years) >= 2 && max($years) - min($years) <= 300) {
        $run = null;
        for ($y = min($years); $y <= max($years); $y++) {
            if (!isset($byYear[$y])) { $run = $run ? [$run[0], $y] : [$y, $y]; continue; }
            if ($run) { $gaps[] = $run; $run = null; }
        }
    }
    // les remarques à vérifier : une année avec au moins deux fois plus de décès que la médiane (et au moins 5)
    $notes = [];
    $deaths = [];
    foreach ($byYear as $y => $k) { $deaths[$y] = ($k['deces'] ?? 0) + ($k['sepulture'] ?? 0); }
    $vals = array_values(array_filter($deaths)); sort($vals);
    if (count($vals) >= 3) {
        $med = $vals[intdiv(count($vals), 2)];
        foreach ($deaths as $y => $n) { if ($n >= 5 && $med > 0 && $n >= 2 * $med) { $notes[] = ['type' => 'deaths', 'year' => $y, 'n' => $n, 'median' => $med]; } }
    }
    foreach ($gaps as $g) { $notes[] = ['type' => 'gap', 'from' => $g[0], 'to' => $g[1]]; }
    arsort($names); arsort($jobs); arsort($places); arsort($kinds);
    return ['acts' => count($acts), 'by_year' => $byYear, 'kinds' => $kinds, 'people' => $people, 'linked' => $linked,
        'names' => array_slice($names, 0, 12, true), 'jobs' => array_slice($jobs, 0, 12, true), 'places' => array_slice($places, 0, 12, true),
        'signs' => $signs, 'nosign' => $nosign, 'years' => $years ? [min($years), max($years)] : [], 'gaps' => $gaps, 'notes' => array_slice($notes, 0, 20)];
}

/** GET recueil_sens&id= (un recueil) ou &service= (tous ses recueils) */
function recueil_sens_data(PDO $pdo, array $g): array
{
    $sid = safe_int($g['service'] ?? 0);
    if ($sid) {
        if (function_exists('recueil_fiche_ensure')) { recueil_fiche_ensure($pdo); }
        $s = $pdo->prepare('SELECT * FROM recueils WHERE archive_service_id=?'); $s->execute([$sid]);
        $rids = [];
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { if (!function_exists('recueil_hidden_in_kiosk') || !recueil_hidden_in_kiosk($pdo, $r)) { $rids[] = (int) $r['id']; } }
        return recueil_sens($pdo, $rids) + ['recueils' => count($rids)];
    }
    $rid = safe_int($g['id'] ?? 0); $r = recueil_row($pdo, $rid);
    if (function_exists('recueil_hidden_in_kiosk') && recueil_hidden_in_kiosk($pdo, $r)) { throw new RuntimeException('Mode consultation : ce recueil n’est pas communicable.'); }
    return recueil_sens($pdo, [$rid]) + ['recueils' => 1];
}
