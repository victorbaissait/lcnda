<?php
declare(strict_types=1);

/*
 * ⚖️ Généalogiste successoral, le droit en plus (maquette docs/design/idees-suite.html, partie 3) : ce que le dossier garde
 * (dans options_json, jamais un montant : l'actif, les donations et les legs se retapent à chaque fois, comme l'actif net) :
 *  - droit : la loi appliquée (celle du décès, ou d'aujourd'hui), la filiation corrigée à la main des enfants, le régime
 *    matrimonial (sorte, attribution intégrale), la résidence, la nationalité, des biens à l'étranger, les héritiers handicapés,
 *    la donation entre époux choisie, l'âge du conjoint ;
 *  - suivi : chaque héritier, son étape (à trouver → trouvé → contacté → contrat signé → pièces reçues), la prochaine chose à
 *    faire, la date de relance, les sources cherchées (état civil, INSEE, annuaires…) avec leur résultat.
 * Le calcul : assets/js/heritage-successoral-droit-core.js ; l'écran : heritage-successoral-droit.js. ↶ : la valeur d'avant revient.
 */

const SUCC_DROIT_STAGES = ['trouver', 'trouve', 'contacte', 'signe', 'pieces'];
const SUCC_DROIT_SRC_STATES = ['a_faire', 'en_cours', 'trouve', 'rien'];

function succ_droit_clean_droit(mixed $d): array
{
    $d = is_array($d) ? $d : [];
    $out = [
        'law' => in_array($d['law'] ?? '', ['auto', 'today'], true) ? $d['law'] : 'auto',
        'matrim' => in_array($d['matrim'] ?? '', ['communaute', 'separation', 'universelle'], true) ? $d['matrim'] : 'communaute',
        'attribution' => !empty($d['attribution']),
        'residence' => mb_substr(safe_text((string) ($d['residence'] ?? '')), 0, 80),
        'nationalite' => mb_substr(safe_text((string) ($d['nationalite'] ?? '')), 0, 80),
        'biens_etranger' => !empty($d['biens_etranger']),
        'spouse_donation' => in_array($d['spouse_donation'] ?? '', ['', 'qd', 'quart_pp_usu', 'usu'], true) ? $d['spouse_donation'] : '',
        'spouse_age' => max(0, min(120, safe_int($d['spouse_age'] ?? 0))),
        'cascade' => !array_key_exists('cascade', $d) || !empty($d['cascade']),
        'filiation' => [], 'handicap' => [],
    ];
    foreach ((is_array($d['filiation'] ?? null) ? $d['filiation'] : []) as $pid => $f) { if (safe_int($pid) > 0 && in_array($f, ['legitime', 'naturelle', 'adulterine'], true)) { $out['filiation'][(string) safe_int($pid)] = $f; } }
    foreach ((is_array($d['handicap'] ?? null) ? $d['handicap'] : []) as $pid) { if (safe_int($pid) > 0) { $out['handicap'][] = safe_int($pid); } }
    $out['handicap'] = array_values(array_unique(array_slice($out['handicap'], 0, 200)));
    return $out;
}

/** une vraie date AAAA-MM-JJ, sinon '' */
function succ_droit_date(mixed $v): string { $v = (string) $v; return preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1]) ? $v : ''; }

function succ_droit_clean_suivi(mixed $d): array
{
    $out = [];
    foreach ((is_array($d) ? $d : []) as $pid => $h) {
        if (safe_int($pid) <= 0 || !is_array($h) || count($out) >= 500) { continue; }
        $src = [];
        foreach ((is_array($h['sources'] ?? null) ? $h['sources'] : []) as $s) {
            if (!is_array($s) || count($src) >= 60) { continue; }
            $what = mb_substr(safe_text((string) ($s['what'] ?? '')), 0, 120); if ($what === '') { continue; }
            $date = succ_droit_date($s['date'] ?? '');
            $src[] = ['what' => $what, 'state' => in_array($s['state'] ?? '', SUCC_DROIT_SRC_STATES, true) ? $s['state'] : 'a_faire', 'date' => $date, 'note' => mb_substr(safe_text((string) ($s['note'] ?? '')), 0, 500)];
        }
        $remind = succ_droit_date($h['remind'] ?? '');
        $out[(string) safe_int($pid)] = ['stage' => in_array($h['stage'] ?? '', SUCC_DROIT_STAGES, true) ? $h['stage'] : 'trouver', 'next' => mb_substr(safe_text((string) ($h['next'] ?? '')), 0, 300), 'remind' => $remind, 'sources' => $src];
    }
    return $out;
}

/** POST successoral_write {op: p2_droit_save, case_id, key: droit | suivi, value} → {before} (pour ↶ Annuler) */
function succ_droit_save(PDO $pdo, array $d): array
{
    $id = safe_int($d['case_id'] ?? 0); succ_row($pdo, $id);
    $key = ($d['key'] ?? '') === 'suivi' ? 'suivi' : 'droit';
    $o = succ_p2_options($pdo, $id); $before = $o[$key] ?? null;
    $o[$key] = $key === 'suivi' ? succ_droit_clean_suivi($d['value'] ?? []) : succ_droit_clean_droit($d['value'] ?? []);
    succ_p2_options_save($pdo, $id, $o);
    return ['before' => $before, 'value' => $o[$key]];
}
