<?php
declare(strict_types=1);
/**
 * 📜 Atelier de transcription, idées 35 à 40 (maquette docs/design/atelier-idees.html) : ce qui se garde avec l'acte, en plus.
 * Appelé par act_transcription_clean_data (lib/transcriptions.php) : tout est borné, rien d'autre ne passe.
 *   reg    : le registre de l'acte (⏭ 37, 🌐 40) — registre, cote, vue n / N, main (✍), archives, lien ↗ source, licence, manifeste IIIF
 *   modern : 🔤 la version modernisée (38) — son texte, d'où elle vient, l'empreinte des lignes fidèles quand elle a été faite (« à revoir »)
 */

function txi_idees_str(mixed $v, int $max): string
{
    return is_scalar($v) ? mb_substr(trim(str_replace(["\0", "\r"], '', (string) $v)), 0, $max) : '';
}

/** l'adresse d'une page web (http, https) ou rien */
function txi_idees_url(mixed $v): string
{
    $u = txi_idees_str($v, 2000);
    return preg_match('#^https?://[^\s<>"]+$#i', $u) ? $u : '';
}

/** les champs en plus de data (reg, modern), nettoyés */
function txi_idees_clean_extra(array $data): array
{
    $out = [];
    $r = is_array($data['reg'] ?? null) ? $data['reg'] : null;
    if ($r) {
        $reg = [];
        foreach (['register' => 200, 'cote' => 80, 'hand' => 120, 'archive' => 300, 'licence' => 300, 'attribution' => 500] as $k => $max) { $v = txi_idees_str($r[$k] ?? '', $max); if ($v !== '') { $reg[$k] = $v; } }
        foreach (['view', 'total', 'n', 'recueil'] as $k) { $v = is_numeric($r[$k] ?? null) ? max(0, min(1000000, (int) $r[$k])) : 0; if ($v > 0) { $reg[$k] = $v; } }
        foreach (['page_url', 'manifest'] as $k) { $v = txi_idees_url($r[$k] ?? ''); if ($v !== '') { $reg[$k] = $v; } }
        if (!empty($r['licence_warn'])) { $reg['licence_warn'] = true; }
        if ($reg) { $out['reg'] = $reg; }
    }
    $m = is_array($data['modern'] ?? null) ? $data['modern'] : null;
    if ($m) {
        $text = mb_substr(str_replace(["\0", "\r"], '', is_string($m['text'] ?? null) ? $m['text'] : ''), 0, 200000);
        if (trim($text) !== '') {
            $keys = [];
            foreach (array_slice(is_array($m['keys'] ?? null) ? $m['keys'] : [], 0, 5000) as $k) { $keys[] = is_string($k) && preg_match('/^[0-9a-z]{0,10}$/', $k) ? $k : ''; }
            $out['modern'] = ['text' => $text, 'from' => in_array($m['from'] ?? '', ['auto', 'ai', 'hand'], true) ? $m['from'] : 'hand', 'keys' => $keys]
                + (!empty($m['checked']) ? ['checked' => true] : []) + (txi_idees_str($m['model'] ?? '', 80) !== '' ? ['model' => txi_idees_str($m['model'], 80)] : []);
        }
    }
    return $out;
}

/** l'empreinte d'une ligne, comme 👁 la relecture (heritage-transcribe-relecture.js lineKey : FNV-1a, base 36, espaces ramenés à un) */
function txi_line_key(string $s): string
{
    $s = trim((string) preg_replace('/\s+/u', ' ', $s));
    $h = 0x811c9dc5;
    foreach (mb_str_split($s) as $ch) { $h ^= mb_ord($ch); $h = ($h * 0x01000193) & 0xFFFFFFFF; }
    return base_convert((string) $h, 10, 36);
}

/** les lignes d'un texte qui ont des lettres (sans les repères « — page 2 — ») : [{n, s, e, text}] — s, e comptés comme la page (UTF-16) */
function txi_text_lines(string $text): array
{
    $out = []; $at = 0;
    foreach (explode("\n", $text) as $i => $l) {
        $len = intdiv(strlen((string) mb_convert_encoding($l, 'UTF-16LE', 'UTF-8')), 2);
        if (trim($l) !== '' && !preg_match('/^—[ \t]*[\p{L}.]+[ \t]+\d+[^\n—]*—[ \t]*$/u', $l)) { $out[] = ['n' => $i + 1, 's' => $at, 'e' => $at + $len, 'text' => $l]; }
        $at += $len + 1;
    }
    return $out;
}
