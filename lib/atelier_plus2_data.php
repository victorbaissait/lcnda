<?php
declare(strict_types=1);
/**
 * 📜 Atelier de transcription, outils en plus (2) : ce qui se garde avec l'acte, en plus (lib/atelier_plus2.php, heritage-atelier-plus2.js).
 * Appelé par act_transcription_clean_data (lib/transcriptions.php) : tout est borné, rien d'autre ne passe.
 *   summary : 🧾 le résumé « qui, quoi, quand, où » (écrit à la main, ou proposé par l'IA de cet ordinateur puis validé : ok)
 *   letters : ✍️ les lettres de référence du scribe découpées sur l'image (un rectangle en pixels de l'image, son nom, la page p)
 */

function txp2_str(mixed $v, int $max): string
{
    return is_scalar($v) ? mb_substr(trim(str_replace(["\0", "\r"], '', (string) preg_replace('/\s+/u', ' ', (string) $v))), 0, $max) : '';
}

/** les champs en plus de data (summary, letters), nettoyés — appelé par act_transcription_clean_data (lib/transcriptions.php) */
function txp2_clean_extra(array $data): array
{
    $out = [];
    $s = is_array($data['summary'] ?? null) ? $data['summary'] : null;
    if ($s) {
        $sum = [];
        foreach (['who', 'what', 'when', 'where'] as $k) { $v = txp2_str($s[$k] ?? '', 240); if ($v !== '') { $sum[$k] = $v; } }
        if ($sum) {
            $out['summary'] = $sum + ['from' => ($s['from'] ?? '') === 'ai' ? 'ai' : 'hand'] + (!empty($s['ok']) ? ['ok' => true] : [])
                + (txp2_str($s['model'] ?? '', 80) !== '' ? ['model' => txp2_str($s['model'], 80)] : []);
        }
    }
    $num = static fn($v) => is_numeric($v) && is_finite((float) $v) ? max(0, min(1e6, round((float) $v, 2))) : 0;
    $letters = [];
    foreach (array_slice(is_array($data['letters'] ?? null) ? $data['letters'] : [], 0, 200) as $l) {
        if (!is_array($l)) { continue; }
        $id = mb_substr((string) preg_replace('/[^\w-]/', '', (string) ($l['id'] ?? '')), 0, 24);
        $label = txp2_str($l['label'] ?? '', 40);
        $w = $num($l['w'] ?? 0); $h = $num($l['h'] ?? 0);
        if ($id === '' || $label === '' || $w < 2 || $h < 2) { continue; }
        $letters[] = ['id' => $id, 'x' => $num($l['x'] ?? 0), 'y' => $num($l['y'] ?? 0), 'w' => $w, 'h' => $h, 'label' => $label] + (safe_int($l['p'] ?? 0) > 0 ? ['p' => safe_int($l['p'])] : []);
    }
    if ($letters) { $out['letters'] = $letters; }
    return $out;
}
