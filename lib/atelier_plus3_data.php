<?php
declare(strict_types=1);
/**
 * 📜 Atelier de transcription, outils en plus (3) : ce qui se garde avec l'acte, en plus (lib/atelier_plus3.php, heritage-atelier-plus3.js).
 * Appelé par act_transcription_clean_data (lib/transcriptions.php) : tout est borné, rien d'autre ne passe.
 *   outline : 🗂 le plan d'un long acte : [{s (place du titre dans le texte), h (le titre), at (le début de sa ligne, pour le retrouver), auto}]
 *   twins   : 🔗 les actes jumeaux confirmés (bans ↔ mariage, naissance ↔ baptême, décès ↔ inhumation, contrat ↔ mariage) : [{id, rel}]
 */

const TXP3_TWIN_RELS = ['bans', 'bapteme', 'inhumation', 'contrat', 'autre'];

function txp3_str(mixed $v, int $max): string
{
    return is_scalar($v) ? mb_substr(trim(str_replace(["\0", "\r", "\n"], ['', '', ' '], (string) $v)), 0, $max) : '';
}

/** les champs en plus de data (outline, twins), nettoyés */
function txp3_clean_extra(array $data): array
{
    $out = [];
    $ol = [];
    foreach (array_slice(is_array($data['outline'] ?? null) ? $data['outline'] : [], 0, 60) as $o) {
        if (!is_array($o)) { continue; }
        $h = txp3_str($o['h'] ?? '', 120); if ($h === '') { continue; }
        $ol[] = ['s' => max(0, min(10000000, safe_int($o['s'] ?? 0))), 'h' => $h, 'at' => mb_substr(str_replace(["\0", "\r", "\n"], '', is_scalar($o['at'] ?? '') ? (string) ($o['at'] ?? '') : ''), 0, 40)] + (!empty($o['auto']) ? ['auto' => true] : []);
    }
    if ($ol) { usort($ol, static fn($a, $b) => $a['s'] <=> $b['s']); $out['outline'] = $ol; }
    $tw = [];
    foreach (array_slice(is_array($data['twins'] ?? null) ? $data['twins'] : [], 0, 12) as $t) {
        $id = is_array($t) ? safe_int($t['id'] ?? 0) : 0; if ($id <= 0 || isset($tw[$id])) { continue; }
        $rel = (string) ($t['rel'] ?? ''); $tw[$id] = ['id' => $id, 'rel' => in_array($rel, TXP3_TWIN_RELS, true) ? $rel : 'autre'];
    }
    if ($tw) { $out['twins'] = array_values($tw); }
    return $out;
}
