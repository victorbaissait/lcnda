<?php
declare(strict_types=1);

/*
 * ➕ Recueils, les idées en plus (maquette docs/design/registres-etat-fonds.html, partie 9) :
 *  - 👥 se répartir le travail : chaque page peut être confiée à quelqu'un (recueil_pages.assignee, géré par lib/recueil_etat.php) ;
 *  - 📈 l'avancement dans le temps : un point par jour et par recueil (recueil_progress), gardé quand l'état est calculé ; l'écran en tire
 *    une courbe et une estimation (« au rythme des 30 derniers jours, fini vers… ») ; un objectif (recueils.goal_date) ;
 *  - 📤 l'export EAD (le format des inventaires d'archives) : services › fonds › recueils, avec leur sommaire.
 * La page à partager (HTML) est fabriquée à l'écran (assets/js/heritage-recueil-plus.js). Migration 109 (rejouable).
 * Essai : tests/test-recueil-plus.js.
 */

function recueil_plus_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    recueil_plus_install($pdo);
    $done = true;
}

/** migration 109 : le journal d'avancement ; « confiée à » et l'objectif (colonnes posées par recueil_etat_install, rejouable) */
function recueil_plus_install(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS recueil_progress (recueil_id INTEGER NOT NULL, day TEXT NOT NULL, live INTEGER NOT NULL DEFAULT 0, tr INTEGER NOT NULL DEFAULT 0,
        rel INTEGER NOT NULL DEFAULT 0, photos INTEGER NOT NULL DEFAULT 0, absent INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (recueil_id, day))');
    if (function_exists('recueil_etat_install')) { recueil_etat_install($pdo); }
}

/** le point d'aujourd'hui (remplacé s'il existe déjà) */
function recueil_progress_record(PDO $pdo, int $rid, array $c): void
{
    try {
        recueil_plus_ensure($pdo);
        $live = $c['todo'] + $c['doing'] + $c['checked'] + $c['done'];
        $pdo->prepare('INSERT OR REPLACE INTO recueil_progress(recueil_id, day, live, tr, rel, photos, absent) VALUES(?,?,?,?,?,?,?)')
            ->execute([$rid, date('Y-m-d'), $live, $c['doing'] + $c['checked'] + $c['done'], $c['checked'] + $c['done'], $c['photos'], $c['absent']]);
    } catch (Throwable $_) {} // une base en lecture seule (mode consultation) : pas de point, rien de grave
}

/** GET recueil_progress&id= : les points, du plus ancien au plus récent (au plus 2 ans) */
function recueil_progress_list(PDO $pdo, int $rid): array
{
    recueil_plus_ensure($pdo); recueil_row($pdo, $rid);
    $s = $pdo->prepare("SELECT day, live, tr, rel, photos, absent FROM recueil_progress WHERE recueil_id=? AND day >= date('now', '-730 days') ORDER BY day"); $s->execute([$rid]);
    return ['points' => array_map(static fn($r) => ['day' => $r['day'], 'live' => (int) $r['live'], 'tr' => (int) $r['tr'], 'rel' => (int) $r['rel'], 'photos' => (int) $r['photos'], 'absent' => (int) $r['absent']], $s->fetchAll(PDO::FETCH_ASSOC))];
}

/** 📤 GET recueils_ead[&service=] : l'inventaire en EAD 2002 (services › fonds › recueils › chapitres) */
function recueils_ead(PDO $pdo, int $sid = 0): array
{
    $x = static fn($v) => htmlspecialchars((string) $v, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    $rows = function_exists('recueils_fonds_data') ? recueils_fonds_data($pdo)['recueils'] : [];
    if ($sid) { $rows = array_values(array_filter($rows, static fn($r) => (int) ($r['service']['id'] ?? 0) === $sid)); }
    $reuse = ['etalab' => 'Licence ouverte (Etalab)', 'cc-by' => 'CC BY', 'cc-by-sa' => 'CC BY-SA', 'cc-by-nc' => 'CC BY-NC', 'public' => 'Domaine public', 'reserve' => 'Tous droits réservés', 'demander' => 'À demander au service', 'autre' => 'Autre'];
    $support = ['papier' => 'papier', 'parchemin' => 'parchemin', 'microfilm' => 'microfilm', 'numerique' => 'numérique', 'autre' => 'autre'];
    $state = ['bon' => 'bon état', 'abime' => 'abîmé', 'fragile' => 'fragile', 'a_restaurer' => 'à restaurer', 'restaure' => 'restauré'];
    $groups = [];
    foreach ($rows as $r) { $groups[$r['service'] ? (string) $r['service']['name'] : 'Sans service d’archives'][(string) ($r['fonds'] ?: 'Sans fonds')][] = $r; }
    ksort($groups);
    $toc = static function (int $rid) use ($pdo, $x): string {
        if (!function_exists('recueil_toc_list')) { return ''; }
        $items = recueil_toc_list($pdo, $rid)['items']; $out = ''; $stack = [];
        foreach ($items as $t) {
            while ($stack && end($stack) >= $t['level']) { $out .= '</c>'; array_pop($stack); }
            $years = $t['year_from'] ? $t['year_from'] . ($t['year_to'] && $t['year_to'] !== $t['year_from'] ? '/' . $t['year_to'] : '') : '';
            $out .= '<c level="' . ($t['kind'] === 'element' ? 'item' : 'otherlevel" otherlevel="chapitre') . '"><did><unittitle>' . $x($t['title']) . '</unittitle>'
                . ($years ? '<unitdate normal="' . $x($years) . '">' . $x(str_replace('/', '-', $years)) . '</unitdate>' : '')
                . ($t['from_num'] ? '<physloc>p. ' . $t['from_num'] . ($t['to_num'] && $t['to_num'] !== $t['from_num'] ? '-' . $t['to_num'] : '') . '</physloc>' : '') . '</did>'
                . ($t['note'] !== '' ? '<scopecontent><p>' . $x($t['note']) . '</p></scopecontent>' : '');
            $stack[] = $t['level'];
        }
        return $out . str_repeat('</c>', count($stack));
    };
    $dsc = '';
    foreach ($groups as $svc => $fonds) {
        $dsc .= '<c level="otherlevel" otherlevel="service"><did><repository><corpname>' . $x($svc) . '</corpname></repository><unittitle>' . $x($svc) . '</unittitle></did>';
        ksort($fonds);
        foreach ($fonds as $fname => $list) {
            $dsc .= '<c level="fonds"><did><unittitle>' . $x($fname) . '</unittitle></did>';
            foreach ($list as $r) {
                $e = $r['etat'] ?? ['todo' => 0, 'doing' => 0, 'checked' => 0, 'done' => 0, 'absent' => 0];
                $live = $e['todo'] + $e['doing'] + $e['checked'] + $e['done'];
                $c = $r['communicability'] ?? [];
                $access = ($c['state'] ?? '') === 'free' ? 'Communicable.' : (($c['state'] ?? '') === 'reserved' ? 'Non communicable' . (!empty($c['until']) ? ' jusqu’en ' . $c['until'] : '') . '.' : (($c['state'] ?? '') === 'authorization' ? 'Sur autorisation.' : 'À vérifier.'));
                $dsc .= '<c level="file" id="recueil-' . (int) $r['id'] . '"><did>' . ($r['reference'] ? '<unitid>' . $x($r['reference']) . '</unitid>' : '') . '<unittitle>' . $x($r['title']) . '</unittitle>'
                    . ($r['date_text'] ? '<unitdate>' . $x($r['date_text']) . '</unitdate>' : '')
                    . '<physdesc><extent>' . (int) max($r['pages'], $r['expected']) . ' pages</extent>' . (($r['support'] || $r['material_state']) ? '<physfacet>' . $x(trim(($support[$r['support']] ?? '') . ' ' . ($state[$r['material_state']] ?? ''))) . '</physfacet>' : '') . '</physdesc>'
                    . ($r['language'] ? '<langmaterial><language>' . $x($r['language']) . '</language></langmaterial>' : '')
                    . ($r['url'] ? '<dao href="' . $x($r['url']) . '"/>' : '') . '</did>'
                    . ($r['series'] ? '<odd><p>Série : ' . $x($r['series']) . '</p></odd>' : '')
                    . '<accessrestrict><p>' . $x($access) . '</p></accessrestrict>'
                    . (!empty($r['reuse']) ? '<userestrict><p>' . $x($reuse[$r['reuse']] ?? $r['reuse']) . '</p></userestrict>' : '')
                    . '<processinfo><p>' . $x(sprintf('Pages : %d · photographiées : %d · transcrites : %d · relues : %d · absentes : %d (LCNDA, %s).', $r['pages'], $e['photos'] ?? 0, $e['doing'] + $e['checked'] + $e['done'], $e['checked'] + $e['done'], $e['absent'], date('Y-m-d'))) . '</p></processinfo>'
                    . $toc((int) $r['id']) . '</c>';
            }
            $dsc .= '</c>';
        }
        $dsc .= '</c>';
    }
    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n"
        . '<ead xmlns="urn:isbn:1-931666-22-9" xmlns:xlink="http://www.w3.org/1999/xlink"><eadheader langencoding="iso639-2b"><eadid>lcnda-etat-des-fonds-' . date('Ymd') . '</eadid>'
        . '<filedesc><titlestmt><titleproper>État des fonds</titleproper></titlestmt></filedesc><profiledesc><creation>LCNDA, <date normal="' . date('Y-m-d') . '">' . date('Y-m-d') . '</date></creation><langusage><language langcode="fre">français</language></langusage></profiledesc></eadheader>'
        . '<archdesc level="collection"><did><unittitle>État des fonds</unittitle><physdesc><extent>' . count($rows) . ' recueils</extent></physdesc></did><dsc>' . $dsc . '</dsc></archdesc></ead>' . "\n";
    return ['xml' => $xml, 'recueils' => count($rows)];
}
