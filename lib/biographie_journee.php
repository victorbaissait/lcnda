<?php
declare(strict_types=1);

/**
 * ⏳ « Une journée dans la vie de… » — un mode du générateur de 📖 biographie (lib/biographie.php : mêmes règles d'écriture,
 * bio_date / bio_when / bio_age / bio_job / bio_name). Écran : assets/js/heritage-journee.js (⋯ de la fiche, bloc Biographie).
 *
 * Une date (un événement de la vie, ou une date libre C4) → un petit récit fait UNIQUEMENT de règles et de modèles de phrases.
 * Chaque phrase porte sa marque :
 *  - 'fiche'   ✓ ce que dit la base (événement, fiche du village, recensement…), avec le lien vers l'événement ou le lieu ;
 *  - 'ref'     📚 une référence livrée avec l'app, sa source citée : calendrier (jour, saint du jour des almanachs, date
 *              républicaine), 🛠️ dictionnaire des métiers anciens, 🌍 le monde autour (frise historique), prix et salaires
 *              de assets/data/prix-reference.json (rien d'autre : pas de chiffre sûr = pas de phrase) ;
 *  - 'imagine' 💭 une phrase d'ambiance générique, montrée en italique et signalée (« Sans phrases imaginées » les retire).
 * La météo n'est pas calculée ici : le serveur dit seulement où la chercher ('meteo'), l'écran la demande à 🌦 LCNDA_EXT.meteo.
 * Jamais d'autre personne vivante ou confidentielle nommée ; la fiche elle-même : 'living' et 'private' sont rendus pour le dire.
 */

const BIO_DAY_REP_MONTHS = ['vendémiaire', 'brumaire', 'frimaire', 'nivôse', 'pluviôse', 'ventôse', 'germinal', 'floréal', 'prairial', 'messidor', 'thermidor', 'fructidor', 'jour complémentaire'];
const BIO_DAY_WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** « 12 thermidor an II » → [1794, 7, 30, false] (calendrier républicain, an I à XIV) */
function bio_day_republican(string $text): ?array
{
    $t = mb_strtolower(trim($text));
    if (!preg_match('/^(\d{1,2}|1er)\s+([\p{L}]+)\s+(?:de\s+l[\'’])?an\s+([ivx]+|\d{1,2})$/u', $t, $m) || !function_exists('frenchtojd')) { return null; }
    $roman = static function (string $s): int {
        if (ctype_digit($s)) { return (int) $s; }
        $v = ['i' => 1, 'v' => 5, 'x' => 10]; $n = 0; $s = strtolower($s);
        for ($i = 0; $i < strlen($s); $i++) { $a = $v[$s[$i]] ?? 0; $b = $v[$s[$i + 1] ?? ''] ?? 0; $n += $a < $b ? -$a : $a; }
        return $n;
    };
    $y = $roman($m[3]); $d = $m[1] === '1er' ? 1 : (int) $m[1];
    $mi = -1; $want = mb_substr(strtr($m[2], ['é' => 'e', 'ô' => 'o']), 0, 4);
    foreach (BIO_DAY_REP_MONTHS as $i => $name) { if (mb_substr(strtr($name, ['é' => 'e', 'ô' => 'o']), 0, 4) === $want) { $mi = $i; break; } }
    if ($y < 1 || $y > 14 || $mi < 0 || $d < 1 || $d > ($mi === 12 ? 6 : 30)) { return null; }
    $g = cal_from_jd(frenchtojd($mi + 1, $d, $y), CAL_GREGORIAN);
    return [(int) $g['year'], (int) $g['month'], (int) $g['day'], false];
}

/** La date républicaine d'un jour (22 sept. 1792 → 31 déc. 1805) : « 12 thermidor an II », sinon '' */
function bio_day_rep_label(int $y, int $m, int $d): string
{
    if (!function_exists('jdtofrench')) { return ''; }
    $k = $y * 10000 + $m * 100 + $d;
    if ($k < 17920922 || $k > 18051231) { return ''; }
    $r = explode('/', jdtofrench(gregoriantojd($m, $d, $y)));
    if (count($r) !== 3 || (int) $r[2] < 1) { return ''; }
    $roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'][(int) $r[2]] ?? (string) $r[2];
    $mo = (int) $r[0]; $da = (int) $r[1];
    return ($mo === 13 ? $da . ($da === 1 ? 'er' : 'e') . ' jour complémentaire' : ($da === 1 ? '1er' : $da) . ' ' . BIO_DAY_REP_MONTHS[$mo - 1]) . ' an ' . $roman;
}

/** Comparer deux dates [a, m, j, environ] : -1, 0 (même jour ou pas sûr), 1 */
function bio_day_cmp(?array $a, ?array $b): int
{
    if (!$a || !$b) { return 0; }
    if ($a[0] !== $b[0]) { return $a[0] <=> $b[0]; }
    if (!$a[1] || !$b[1]) { return 0; }
    if ($a[1] !== $b[1]) { return $a[1] <=> $b[1]; }
    if (!$a[2] || !$b[2]) { return 0; }
    return $a[2] <=> $b[2];
}

/** La saison d'un jour (repères de l'almanach : 21 mars, 21 juin, 23 septembre, 21 décembre) */
function bio_day_season(int $m, int $d): string
{
    $k = $m * 100 + $d;
    return $k >= 321 && $k < 621 ? 'printemps' : ($k >= 621 && $k < 923 ? 'été' : ($k >= 923 && $k < 1221 ? 'automne' : 'hiver'));
}

/** La table des prix livrée avec l'app (assets/data/prix-reference.json) : chaque ligne a sa source */
function bio_day_prices(): array
{
    static $doc = null;
    if ($doc === null) {
        $f = APP_ROOT . '/assets/data/prix-reference.json';
        $doc = is_file($f) ? (json_decode((string) file_get_contents($f), true) ?: []) : [];
        $doc['items'] = array_values(array_filter($doc['items'] ?? [], static fn($x) => is_array($x) && trim((string) ($x['source'] ?? '')) !== '' && trim((string) ($x['text'] ?? '')) !== ''
            && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($x['from'] ?? '')) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($x['to'] ?? ''))));
    }
    return $doc;
}

/** Les phrases ⏳ d'une journée : GET biography_day&id=…&event_id=… | &date=… [&imagined=0] */
function bio_day(PDO $pdo, int $id, array $q = []): array
{
    $s = $pdo->prepare('SELECT * FROM persons WHERE id=?'); $s->execute([$id]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Fiche introuvable.'); }
    if (($p['kind'] ?? '') === 'animal') { throw new LcndaBadInput('« Une journée dans la vie » est faite pour les personnes.'); }
    require_once __DIR__ . '/dates_feter.php';
    $hidden = function_exists('df_hidden_people') ? df_hidden_people($pdo) : [];
    $ro = function_exists('kiosk_state') && !empty(kiosk_state()['on']);
    if ($ro && isset($hidden[$id])) { throw new LcndaBadInput('Cette fiche n’est pas montrée en mode consultation.'); }
    $g = (string) ($p['gender'] ?? ''); $fem = $g === 'female'; $e = $fem ? 'e' : '';
    $first = trim((string) ($p['first_name'] ?? '')) ?: bio_name($p);
    $il = $fem ? 'elle' : 'il'; $Il = $fem ? 'Elle' : 'Il';

    // ── les événements de la personne et de ses couples (avec leur lieu) ──
    $evq = "SELECT e.id, e.person_id, e.family_id, e.date_text, e.year, e.title, e.description, e.address, t.gedcom_tag AS tag, t.label AS type_label,
            pl.id AS place_id, pl.name AS place_name, pl.county, pl.state, pl.country, pl.latitude, pl.longitude, pl.admin4_code, COALESCE(pl.population,0) AS population
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id";
    $s = $pdo->prepare("$evq WHERE e.person_id=? OR e.family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?) ORDER BY COALESCE(e.year,9999), e.sort_date, e.id");
    $s->execute([$id, $id, $id]);
    $events = $s->fetchAll(PDO::FETCH_ASSOC);
    $dateOf = static fn(array $ev) => bio_date((string) $ev['date_text'], $ev['year'] ?? null);
    $find = static function (array $tags) use ($events, $id): ?array { foreach ($events as $ev) { if ((int) $ev['person_id'] === $id && in_array(strtoupper((string) $ev['tag']), $tags, true) && (trim((string) $ev['date_text']) !== '' || $ev['year'])) { return $ev; } } return null; };
    $birthEv = $find(['BIRT']) ?? $find(['CHR', 'BAPM']);
    $deathEv = $find(['DEAT']) ?? $find(['BURI', 'CREM']);
    $bD = $birthEv ? $dateOf($birthEv) : null; $dD = $deathEv ? $dateOf($deathEv) : null;

    // ── la date choisie ──
    $chosen = null; $T = null; $dateText = '';
    $evId = safe_int($q['event_id'] ?? 0);
    if ($evId) {
        foreach ($events as $ev) { if ((int) $ev['id'] === $evId) { $chosen = $ev; break; } }
        if (!$chosen) { throw new LcndaBadInput('Cet événement n’est pas dans la vie de cette personne.'); }
        $T = $dateOf($chosen); $dateText = trim((string) $chosen['date_text']) ?: (string) ($chosen['year'] ?? '');
        if (!$T) { throw new LcndaBadInput('Cet événement n’a pas de date : choisis-en un autre, ou écris une date.'); }
    } else {
        $dateText = trim(mb_substr((string) ($q['date'] ?? ''), 0, 80));
        if ($dateText === '') { throw new LcndaBadInput('Choisis un événement de sa vie, ou écris une date.'); }
        $T = bio_day_republican($dateText) ?? bio_date($dateText);
        if (!$T || $T[0] < 1 || $T[0] > (int) date('Y')) { throw new LcndaBadInput('Je ne comprends pas cette date (exemples : 7 mai 1925, vers 1784, 12 thermidor an II).'); }
    }
    [$Y, $M, $D, $approx] = [$T[0], $T[1], $T[2], (bool) $T[3]];
    $precise = $M && $D && !$approx;
    if ($bD && bio_day_cmp($T, $bD) < 0 && !($chosen && $chosen === $birthEv)) { throw new LcndaBadInput(i18n_t('Cette date est avant sa naissance ({date})', ['date' => bio_when($birthEv['date_text'], $birthEv['year'])])); }
    if ($dD && bio_day_cmp($T, $dD) > 0 && !$chosen) { throw new LcndaBadInput(i18n_t('Cette date est après son décès ({date})', ['date' => bio_when($deathEv['date_text'], $deathEv['year'])])); }
    $whenTxt = $chosen ? bio_when($chosen['date_text'], $chosen['year']) : (bio_day_republican($dateText) ? 'le ' . ($D === 1 ? '1er' : $D) . ' ' . BIO_MONTHS[$M - 1] . ' ' . $Y : bio_when($dateText));

    $out = []; $n = 0;
    $say = static function (string $part, string $mark, string $text, array $src = []) use (&$out, &$n): void {
        $text = trim(preg_replace('/\s+/u', ' ', $text));
        if ($text === '') { return; }
        $out[] = ['id' => 's' . (++$n), 'part' => $part, 'mark' => $mark, 'text' => $text, 'src' => $src];
    };
    $sources = [];
    $sq = $pdo->prepare("SELECT s.id, s.title, sl.page FROM source_links sl JOIN sources s ON s.id=sl.source_record_id WHERE sl.entity_type='event' AND sl.entity_id=? ORDER BY sl.id LIMIT 3");
    $evSrc = static function (?array $ev) use ($sq, &$sources): array {
        if (!$ev) { return []; }
        $k = (int) $ev['id'];
        if (!isset($sources[$k])) { $sq->execute([$k]); $sources[$k] = array_map(static fn($r) => ['id' => (int) $r['id'], 'label' => trim(implode(', ', array_filter([trim((string) $r['title']), trim((string) $r['page'])]))) ?: 'source sans titre'], $sq->fetchAll(PDO::FETCH_ASSOC)); }
        return ['event_id' => $k, 'label' => trim((string) $ev['type_label']) . ($ev['date_text'] ? ' · ' . trim((string) $ev['date_text']) : ''), 'sources' => $sources[$k]];
    };
    $pp = $pdo->prepare('SELECT id, first_name, last_name, gender, living_status, is_private FROM persons WHERE id=?');
    $who = static function (int $pid) use ($pp, $hidden): ?array { if (!$pid) { return null; } $pp->execute([$pid]); $r = $pp->fetch(PDO::FETCH_ASSOC); if (!$r) { return null; } $r['hidden'] = isset($hidden[$pid]); return $r; };
    $nameOf = static fn(?array $r, string $instead) => $r && !$r['hidden'] ? bio_name($r) : $instead;
    $firstOf = static fn(?array $r, string $instead) => $r && !$r['hidden'] ? (trim((string) $r['first_name']) ?: bio_name($r)) : $instead;
    $evd = $pdo->prepare("SELECT e.id, e.date_text, e.year, t.gedcom_tag AS tag, t.label AS type_label FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=? AND t.gedcom_tag IN (?,?,?) AND (TRIM(COALESCE(e.date_text,''))<>'' OR e.year IS NOT NULL) ORDER BY e.id LIMIT 1");
    $lifeEv = static function (int $pid, array $tags) use ($evd): ?array { $evd->execute([$pid, $tags[0], $tags[1] ?? $tags[0], $tags[2] ?? $tags[0]]); return $evd->fetch(PDO::FETCH_ASSOC) ?: null; };
    $ageWords = static function (?array $a): string { if (!$a) { return ''; } [$n, $sure] = $a; if ($n === 0) { return $sure ? 'moins d’un an' : 'environ un an'; } return ($sure ? '' : 'environ ') . $n . ' an' . ($n > 1 ? 's' : ''); };

    // ═════ 1. Qui ═════
    $isBirth = $chosen && $birthEv && (int) $chosen['id'] === (int) $birthEv['id'];
    $isDeath = $chosen && $deathEv && (int) $chosen['id'] === (int) $deathEv['id'];
    $age = $bD && !$isBirth ? bio_age($bD, $T) : null;
    if ($isBirth) { $say('qui', 'fiche', bio_cap($whenTxt) . ", $first " . (strtoupper((string) $chosen['tag']) === 'BIRT' ? 'vient au monde' : "est baptisé$e") . '.', $evSrc($chosen)); }
    elseif ($isDeath) { $say('qui', 'fiche', bio_cap($whenTxt) . ", c’est le dernier jour de $first" . ($age ? ', à ' . $ageWords($age) : '') . '.', $evSrc($chosen)); }
    elseif ($age) { $say('qui', 'fiche', bio_cap($whenTxt) . ", $first a " . $ageWords($age) . '.', $evSrc($birthEv)); }
    elseif ($chosen) { $say('qui', 'fiche', bio_cap($whenTxt) . ", c’est " . (in_array(mb_strtolower(mb_substr((string) $chosen['type_label'], 0, 1)), ['a', 'e', 'i', 'o', 'u', 'é', 'h'], true) ? 'l’' : 'le jour de : ') . mb_strtolower(trim((string) $chosen['type_label'])) . " de $first.", $evSrc($chosen)); }
    else { $say('qui', 'fiche', bio_cap($whenTxt) . ", on suit $first" . ($bD ? '' : ' (sa date de naissance n’est pas notée : son âge n’est pas connu)') . '.', []); }
    if ($chosen && !$isBirth && !$isDeath && $age && trim((string) ($chosen['title'] ?: $chosen['description'])) !== '' && mb_strlen(trim((string) ($chosen['title'] ?: $chosen['description']))) < 200) {
        $say('qui', 'fiche', 'La fiche note : « ' . trim((string) ($chosen['title'] ?: $chosen['description'])) . ' ».', $evSrc($chosen));
    }

    // parents encore en vie ?
    $s = $pdo->prepare('SELECT f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=? ORDER BY fc.id LIMIT 1'); $s->execute([$id]);
    if (($pf = $s->fetch(PDO::FETCH_ASSOC)) && !$isBirth) {
        $alive = []; $gone = [];
        foreach ([(int) $pf['partner1_id'], (int) $pf['partner2_id']] as $pid) {
            $r = $who($pid); if (!$r) { continue; }
            $role = ($r['gender'] ?? '') === 'female' ? 'sa mère' : (($r['gender'] ?? '') === 'male' ? 'son père' : 'son parent');
            $de = $lifeEv($pid, ['DEAT', 'BURI', 'CREM']);
            if (!$de) { continue; }
            $c = bio_day_cmp(bio_date((string) $de['date_text'], $de['year']), $T);
            if ($c > 0) { $alive[] = [trim($role . ' ' . $firstOf($r, '')), $de]; } elseif ($c < 0) { $gone[] = [$role . ' ' . $firstOf($r, '') . ' ' . bio_when($de['date_text'], $de['year']), $de]; }
        }
        if ($alive) { $say('qui', 'fiche', bio_cap(bio_join(array_map(static fn($x) => rtrim($x[0], ', '), $alive))) . (count($alive) > 1 ? ' sont encore en vie.' : ' est encore en vie.'), ['label' => 'Décès des parents (plus tard)']); }
        if ($gone && !$isDeath) { $say('qui', 'fiche', "$Il a déjà perdu " . bio_join(array_map(static fn($x) => preg_replace('/\s+/u', ' ', $x[0]), $gone)) . '.', ['label' => 'Décès des parents']); }
    }

    // couples : marié(e), veuf (veuve), pas encore marié(e)
    $s = $pdo->prepare('SELECT id, partner1_id, partner2_id FROM families WHERE partner1_id=? OR partner2_id=? ORDER BY id'); $s->execute([$id, $id]);
    $fams = $s->fetchAll(PDO::FETCH_ASSOC);
    $current = null; $future = null; $widow = null;
    $kids = [];
    $ks = $pdo->prepare('SELECT p.id, p.first_name, p.last_name, p.gender, p.living_status, p.is_private FROM family_children fc JOIN persons p ON p.id=fc.child_id WHERE fc.family_id=? ORDER BY fc.position, fc.id');
    foreach ($fams as $f) {
        $spId = (int) $f['partner1_id'] === $id ? (int) $f['partner2_id'] : (int) $f['partner1_id'];
        $sp = $who($spId);
        $marr = null; foreach ($events as $ev) { if ((int) $ev['family_id'] === (int) $f['id'] && in_array(strtoupper((string) $ev['tag']), ['MARR', 'MRCI', 'MRRE'], true) && (trim((string) $ev['date_text']) !== '' || $ev['year'])) { $marr = $ev; break; } }
        $mD = $marr ? $dateOf($marr) : null;
        $spDe = $spId ? $lifeEv($spId, ['DEAT', 'BURI', 'CREM']) : null; $spDD = $spDe ? bio_date((string) $spDe['date_text'], $spDe['year']) : null;
        if ($mD && bio_day_cmp($mD, $T) <= 0 && !($chosen && $marr && (int) $chosen['id'] === (int) $marr['id'])) {
            if ($spDD && bio_day_cmp($spDD, $T) < 0) { $widow = ['sp' => $sp, 'de' => $spDe, 'marr' => $marr]; $current = null; }
            else { $current = ['sp' => $sp, 'marr' => $marr, 'mD' => $mD]; $widow = null; }
        } elseif ($mD && bio_day_cmp($mD, $T) > 0 && !$future) { $future = ['sp' => $sp, 'marr' => $marr]; }
        $ks->execute([(int) $f['id']]);
        foreach ($ks->fetchAll(PDO::FETCH_ASSOC) as $k) {
            $kb = $lifeEv((int) $k['id'], ['BIRT', 'CHR', 'BAPM']); $kd = $lifeEv((int) $k['id'], ['DEAT', 'BURI', 'CREM']);
            $kids[] = ['p' => $k + ['hidden' => isset($hidden[(int) $k['id']])], 'b' => $kb ? bio_date((string) $kb['date_text'], $kb['year']) : null, 'd' => $kd ? bio_date((string) $kd['date_text'], $kd['year']) : null];
        }
    }
    $spWord = static fn(?array $sp) => ($sp['gender'] ?? '') === 'female' ? 'sa femme' : (($sp['gender'] ?? '') === 'male' ? 'son mari' : 'son conjoint');
    if ($chosen && in_array(strtoupper((string) $chosen['tag']), ['MARR', 'MRCI', 'MRRE'], true)) {
        foreach ($fams as $f) { if ((int) $chosen['family_id'] === (int) $f['id']) { $sp = $who((int) $f['partner1_id'] === $id ? (int) $f['partner2_id'] : (int) $f['partner1_id']); $say('famille', 'fiche', "Ce jour-là, $first épouse " . $nameOf($sp, 'une personne de la famille') . '.', $evSrc($chosen)); } }
    } elseif ($current) {
        $yrs = bio_age($current['mD'], $T);
        $say('famille', 'fiche', "$Il est marié$e avec " . $nameOf($current['sp'], $spWord($current['sp'])) . ($yrs && $yrs[0] > 0 ? ' depuis ' . $ageWords($yrs) : ($yrs ? ' depuis moins d’un an' : '')) . ' (mariage ' . bio_when($current['marr']['date_text'], $current['marr']['year']) . ').', $evSrc($current['marr']));
    } elseif ($widow) {
        $say('famille', 'fiche', "$Il est " . ($fem ? 'veuve' : 'veuf') . ' : ' . $nameOf($widow['sp'], $spWord($widow['sp'])) . ' est mort' . (($widow['sp']['gender'] ?? '') === 'female' ? 'e' : '') . ' ' . bio_when($widow['de']['date_text'], $widow['de']['year']) . '.', ['label' => 'Décès du conjoint']);
    } elseif ($future && $age && $age[0] >= 1) {
        $say('famille', 'fiche', "$Il n’est pas encore marié$e : $il épousera " . $nameOf($future['sp'], 'quelqu’un de la famille') . ' ' . bio_when($future['marr']['date_text'], $future['marr']['year']) . '.', $evSrc($future['marr']));
    }
    // enfants : en vie, déjà perdus, à venir
    $aliveKids = []; $lostKids = []; $nextKid = null;
    foreach ($kids as $k) {
        if (!$k['b']) { continue; }
        $cb = bio_day_cmp($k['b'], $T);
        if ($cb > 0) { if (!$nextKid || bio_day_cmp($k['b'], $nextKid['b']) < 0) { $nextKid = $k; } continue; }
        if ($cb === 0 && !($k['b'][1] && $k['b'][2])) { continue; } // même année sans le jour : pas sûr
        if ($k['d'] && bio_day_cmp($k['d'], $T) < 0) { $lostKids[] = $k; continue; }
        if ($k['d'] && bio_day_cmp($k['d'], $T) === 0 && !($k['d'][1] && $k['d'][2])) { continue; }
        $aliveKids[] = $k;
    }
    $kidName = static function (array $k) use ($firstOf, $ageWords, $T): string {
        $w = ($k['p']['gender'] ?? '') === 'female' ? 'une fille' : (($k['p']['gender'] ?? '') === 'male' ? 'un fils' : 'un enfant');
        $a = bio_age($k['b'], $T);
        return $firstOf($k['p'], $w) . ($a ? ' (' . ($a[0] === 0 ? ($a[1] ? 'quelques mois' : 'tout petit') : $ageWords($a)) . ')' : '');
    };
    if ($aliveKids && !$isBirth) {
        $say('famille', 'fiche', (count($aliveKids) === 1 ? "$Il a un enfant en vie, connu dans ta base : " : "$Il a " . count($aliveKids) . ' enfants en vie, connus dans ta base : ') . bio_join(array_map($kidName, array_slice($aliveKids, 0, 12))) . (count($aliveKids) > 12 ? '…' : '') . '.', ['label' => 'Naissances des enfants']);
    }
    if ($lostKids && !$isBirth) {
        $say('famille', 'fiche', "$Il a déjà perdu " . (count($lostKids) === 1 ? 'un enfant' : count($lostKids) . ' enfants') . ' : ' . bio_join(array_map(static fn($k) => $firstOf($k['p'], 'un enfant') . ' (' . $k['b'][0] . '–' . $k['d'][0] . ')', array_slice($lostKids, 0, 8))) . '.', ['label' => 'Décès des enfants']);
    }
    if ($nextKid && !$aliveKids && !$isBirth && $age && $age[0] >= 14) {
        $say('famille', 'fiche', 'Son premier enfant connu, ' . $firstOf($nextKid['p'], 'un enfant') . ', naîtra en ' . $nextKid['b'][0] . '.', ['label' => 'Naissance de l’enfant']);
    }

    // ═════ 2. Où ═════
    $placeEv = null; $placeFrom = '';
    if ($chosen && $chosen['place_id']) { $placeEv = $chosen; }
    else {
        foreach ($events as $ev) { if ($ev['place_id'] && ((int) $ev['person_id'] === $id || $ev['family_id']) && bio_day_cmp($dateOf($ev) ?? [9999, 0, 0, false], $T) <= 0) { $placeEv = $ev; } }
        if ($placeEv) { $placeFrom = 'before'; }
    }
    // recensement le plus proche avant la date (s'il est plus récent que l'événement trouvé)
    $census = null;
    try {
        $c = $pdo->prepare('SELECT cr.id, cr.year, cr.address, cm.occupation, pl.id AS place_id, pl.name AS place_name, pl.county, pl.state, pl.country, pl.latitude, pl.longitude, pl.admin4_code, COALESCE(pl.population,0) AS population,
                (SELECT COUNT(*) FROM census_members m2 WHERE m2.census_id=cr.id) AS members
            FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id LEFT JOIN places pl ON pl.id=cr.place_id WHERE cm.person_id=? AND cr.year IS NOT NULL AND cr.year<=? ORDER BY cr.year DESC LIMIT 1');
        $c->execute([$id, $Y]); $census = $c->fetch(PDO::FETCH_ASSOC) ?: null;
    } catch (Throwable $_) { $census = null; }
    $place = $placeEv;
    if ($census && $census['place_id'] && (!$placeEv || ($placeFrom === 'before' && (int) ($placeEv['year'] ?? 0) < (int) $census['year']))) {
        $place = $census; $placeFrom = 'census';
        $say('ou', 'fiche', "Au recensement de {$census['year']}, $first vit " . bio_place($census) . ((int) $census['members'] > 1 ? ', dans un foyer de ' . (int) $census['members'] . ' personnes' : '') . '.', ['label' => 'Recensement de ' . $census['year'], 'census_id' => (int) $census['id']]);
    } elseif ($placeEv && $placeFrom === 'before') {
        $what = mb_strtolower(trim((string) $placeEv['type_label']));
        $say('ou', 'fiche', 'La dernière trace avant ce jour place ' . $first . ' ' . bio_place($placeEv) . " : $what " . (bio_when($placeEv['date_text'], $placeEv['year']) ?: 'sans date') . '.', $evSrc($placeEv));
    } elseif ($placeEv) {
        $say('ou', 'fiche', 'Cela se passe ' . bio_place($placeEv) . '.', $evSrc($placeEv));
    }
    $meteo = null;
    if ($place && $place['place_id']) {
        $pid = (int) $place['place_id']; $pname = trim((string) $place['place_name']);
        // le lien « ↗ Lieu » sur la phrase qui dit où (le département est déjà entre parenthèses)
        for ($i = count($out) - 1; $i >= 0; $i--) { if ($out[$i]['part'] === 'ou') { $out[$i]['src']['place_id'] = $pid; $out[$i]['src']['place_name'] = $pname; $out[$i]['src']['place_county'] = trim((string) ($place['county'] ?? '')); break; } }
        // 🏘️ la fiche du village : population au recensement le plus proche, église, notes (monographie)
        $vkey = function_exists('village_key') ? village_key($place) : '';
        $prof = $vkey !== '' && function_exists('village_profile') ? (static function () use ($pdo, $vkey) { try { return village_profile($pdo, $vkey); } catch (Throwable $_) { return null; } })() : null;
        $popSaid = false;
        if ($prof) {
            $best = null; foreach ((array) ($prof['populations'] ?? []) as $pp2) { if (!is_array($pp2) || count($pp2) < 2) { continue; } $dy = abs((int) $pp2[0] - $Y); if ($dy <= 15 && (!$best || $dy < abs((int) $best[0] - $Y))) { $best = $pp2; } }
            if ($best) {
                $srcTxt = trim((string) ($prof['population_source'] ?? ''));
                $say('ou', $srcTxt !== '' ? 'ref' : 'fiche', ((int) $best[0] === $Y ? 'Cette année-là' : 'Au recensement de ' . (int) $best[0]) . ", $pname compte " . number_format((int) $best[1], 0, ',', ' ') . ' habitants.',
                    $srcTxt !== '' ? ['label' => 'Population relevée : ' . (preg_match('#^https?://#', $srcTxt) ? 'Wikipédia' : $srcTxt), 'url' => preg_match('#^https?://#', $srcTxt) ? $srcTxt : '', 'village' => $vkey] : ['label' => 'Fiche du village', 'village' => $vkey]);
                $popSaid = true;
            }
            if (trim((string) ($prof['church'] ?? '')) !== '' || trim((string) ($prof['patron_saint'] ?? '')) !== '') {
                $ch = trim((string) ($prof['church'] ?? '')); $ps = trim((string) ($prof['patron_saint'] ?? ''));
                $say('ou', 'fiche', $ch !== '' ? "Au village, il y a l’église $ch" . ($ps !== '' ? " (saint patron : $ps)" : '') . '.' : "Le saint patron du village est $ps.", ['label' => 'Fiche du village', 'village' => $vkey]);
            }
            $notes = trim(preg_replace('/\s+/u', ' ', (string) ($prof['notes'] ?? '')));
            if ($notes !== '') {
                $one = preg_split('/(?<=[.!?])\s+/u', $notes)[0] ?? $notes;
                if (mb_strlen($one) > 260) { $one = rtrim(mb_substr($one, 0, 257)) . '…'; }
                $say('ou', 'fiche', 'Tes notes sur le village : « ' . $one . ' »', ['label' => 'Fiche du village (monographie)', 'village' => $vkey]);
            }
        }
        if (!$popSaid && (int) $place['population'] > 0) {
            $say('ou', 'ref', "Pour donner une idée de sa taille : aujourd’hui, $pname compte environ " . number_format((int) round((int) $place['population'], -1), 0, ',', ' ') . ' habitants (chiffre récent, pas celui de l’époque).', ['label' => 'GeoNames (population récente)', 'url' => 'https://www.geonames.org/']);
        }
        if ($precise && $place['latitude'] !== null && $place['longitude'] !== null) {
            $iso = sprintf('%04d-%02d-%02d', $Y, $M, $D);
            $meteo = $chosen && (int) ($chosen['place_id'] ?? 0) === $pid ? ['event_id' => (int) $chosen['id'], 'date' => $iso, 'place' => $pname]
                : ['lat' => (float) $place['latitude'], 'lon' => (float) $place['longitude'], 'date' => $iso, 'country' => (string) ($place['country'] ?? ''), 'place' => $pname];
        }
    }

    // ═════ 3. Le métier ═════
    $job = ''; $jobSrc = [];
    foreach ($events as $ev) {
        if ((int) $ev['person_id'] !== $id) { continue; }
        $isJob = strtoupper((string) $ev['tag']) === 'OCCU' || preg_match('/^(profession|métier|metier)/u', mb_strtolower((string) $ev['type_label']));
        $j = trim((string) ($ev['description'] ?: $ev['title']));
        if ($isJob && $j !== '' && bio_day_cmp($dateOf($ev) ?? [0, 0, 0, false], $T) <= 0) { $job = $j; $jobSrc = $evSrc($ev); }
    }
    if ($job === '' && $census && trim((string) $census['occupation']) !== '' && abs((int) $census['year'] - $Y) <= 10) { $job = trim((string) $census['occupation']); $jobSrc = ['label' => 'Recensement de ' . $census['year'], 'census_id' => (int) $census['id']]; }
    if ($job === '' && trim((string) ($p['occupation'] ?? '')) !== '' && $age && $age[0] >= 15) { $job = trim((string) $p['occupation']); $jobSrc = ['label' => 'Métier noté sur la fiche', 'person_id' => $id]; }
    $trade = null;
    if ($job !== '') {
        $say('metier', 'fiche', ($jobSrc['label'] ?? '') === 'Métier noté sur la fiche' ? "Sa fiche le dit « " . bio_job($job) . " »." : "À cette époque, $first est noté$e « " . bio_job($job) . ' ».', $jobSrc);
        if (function_exists('trade_match') && ($tk = trade_match($job))) {
            $D0 = trades_dict(); $trade = $D0['by'][$tk] ?? null;
            if ($trade && trim((string) ($trade['desc'] ?? '')) !== '') {
                $say('metier', 'ref', 'Le métier de ' . mb_strtolower((string) $trade['name']) . ', d’après le dictionnaire : « ' . rtrim(trim((string) $trade['desc']), '.') . '. »', ['label' => 'Dictionnaire des métiers anciens (Littré, Wiktionnaire, Wikipédia)', 'trade' => $tk]);
            }
        }
    }

    // ═════ 4. Le calendrier ═════
    $season = $M && $D ? bio_day_season($M, $D) : '';
    if ($precise && $Y >= 1583) {
        $wd = BIO_DAY_WEEKDAYS[(int) date('w', (int) gmmktime(12, 0, 0, $M, $D, $Y))] ?? '';
        if ($Y < 1902 || $Y > 2037) { $wd = BIO_DAY_WEEKDAYS[(gregoriantojd($M, $D, $Y) + 1) % 7]; }
        $txt = 'Le ' . ($D === 1 ? '1er' : $D) . ' ' . BIO_MONTHS[$M - 1] . " $Y est un $wd" . ($season ? ($season === 'été' ? ' d’été' : ($season === 'automne' ? ' d’automne' : ($season === 'hiver' ? ' d’hiver' : ' de printemps'))) : '') . '.';
        $chosen ? $say('calendrier', 'fiche', $txt, $evSrc($chosen) + ['calc' => 'calendrier grégorien']) : $say('calendrier', 'ref', $txt, ['label' => 'Calendrier grégorien (calcul)']);
    } elseif ($season === '' && $M) {
        $say('calendrier', 'ref', 'Nous sommes en ' . BIO_MONTHS[$M - 1] . " $Y.", ['label' => 'Calendrier']);
    }
    if ($precise && function_exists('saints_calendar')) {
        $names = saints_calendar()[sprintf('%02d-%02d', $M, $D)] ?? [];
        if ($names) {
            $feast = array_filter($names, 'saint_is_feast');
            $mine = function_exists('saint_matching') ? saint_matching((string) ($p['first_name'] ?? ''), $M, $D) : null;
            $txt = $feast ? 'Ce jour-là, le calendrier fête : ' . bio_join($names) . '.' : 'Ce jour-là, l’almanach fête ' . bio_join(array_map(static fn($x) => (saint_is_female_name($x) ? 'sainte ' : 'saint ') . $x, $names)) . '.';
            if ($mine) { $txt = rtrim($txt, '.') . ' : c’est la fête de son prénom !'; }
            $say('calendrier', 'ref', $txt, ['label' => 'Calendrier des saints des almanachs français (il a varié selon les époques et les diocèses)']);
        }
    }
    if ($precise && ($rep = bio_day_rep_label($Y, $M, $D)) !== '') {
        $say('calendrier', 'ref', 'Dans le calendrier républicain, en usage à cette époque, c’est le ' . $rep . '.', ['label' => 'Calendrier républicain (22 sept. 1792 – 31 déc. 1805), calcul']);
    }

    // ═════ 5. Le monde autour (frise historique de l'app) ═════
    if (function_exists('world_around')) {
        try {
            $w = world_around($pdo, $id, ['from' => $Y, 'to' => $Y, 'level' => 1]);
            $list = array_values(array_filter($w['events'] ?? [], static fn($ev) => (int) $ev['from'] <= $Y && (int) $ev['to'] >= $Y));
            usort($list, static fn($a, $b) => [($a['hit'] ?? '') === 'local' ? 0 : 1, (int) $a['to'] - (int) $a['from'], (int) ($a['level'] ?? 2)] <=> [($b['hit'] ?? '') === 'local' ? 0 : 1, (int) $b['to'] - (int) $b['from'], (int) ($b['level'] ?? 2)]);
            foreach (array_slice($list, 0, 3) as $ev) {
                $own = !empty($ev['own']);
                $one = (int) $ev['from'] === (int) $ev['to'];
                $quand = trim((string) ($ev['quand'] ?? ''));
                $txt = $one ? ($quand !== '' ? "La même année ($Y), " . rtrim($quand, '.') . '.' : "La même année ($Y) : " . trim((string) $ev['title']) . '.')
                    : 'C’est le temps de : ' . trim((string) $ev['title']) . ' (' . (int) $ev['from'] . '–' . (int) $ev['to'] . ').';
                $src = trim((string) ($ev['src'] ?? $ev['source'] ?? ''));
                $say('contexte', $own && $src === '' ? 'fiche' : 'ref', $txt, ['label' => $own ? ($src !== '' ? $src : 'Tes événements (Le monde autour)') : ($src !== '' ? $src : 'Le monde autour (liste livrée avec l’app)'), 'url' => (string) ($ev['url'] ?? ''), 'world' => (string) ($ev['id'] ?? '')]);
            }
        } catch (Throwable $_) {}
    }

    // ═════ 6. Les prix (seulement la table sourcée) ═════
    $country = mb_strtolower(trim((string) ($place['country'] ?? '')));
    if ($M && ($country === '' || in_array($country, ['france', 'fr'], true))) {
        $iso0 = sprintf('%04d-%02d-%02d', $Y, $M, $D ?: 1); $iso1 = sprintf('%04d-%02d-%02d', $Y, $M, $D ?: 28);
        $seen = [];
        foreach (bio_day_prices()['items'] as $it) {
            if ($iso0 < (string) $it['from'] || $iso1 > (string) $it['to'] || isset($seen[$it['kind'] ?? ''])) { continue; } // la période entière doit être dans l'intervalle
            $seen[$it['kind'] ?? ''] = true;
            $say('prix', 'ref', (string) $it['text'], ['label' => (string) $it['source'], 'url' => (string) ($it['url'] ?? ''), 'price' => (string) ($it['id'] ?? '')]);
        }
    }

    // ═════ 7. Phrases imaginées 💭 (génériques, jamais la météo, jamais un fait) ═════
    $imag = [];
    $dom = (string) ($trade['domain'] ?? '');
    if ($season !== '') {
        $imag[] = match ($season) {
            'hiver' => 'On peut imaginer des journées courtes, le feu entretenu dans la cheminée et la veillée le soir.',
            'printemps' => 'On peut imaginer les jours qui rallongent et, à la campagne, le temps des semis.',
            'été' => 'On peut imaginer les longues journées et, à la campagne, le temps des foins puis des moissons.',
            default => 'On peut imaginer, à la campagne, le temps des vendanges, des labours et des réserves pour l’hiver.',
        };
    }
    if ($age && !$isBirth && !$isDeath) {
        if ($age[0] < 6) { $imag[] = "À cet âge, $il passe sans doute ses journées auprès des siens."; }
        elseif ($age[0] < 14) { $imag[] = "Peut-être aide-t-$il déjà aux travaux de la maison" . ($Y >= 1882 ? ', entre deux journées d’école.' : '.'); }
        elseif ($age[0] >= 70) { $imag[] = "À son âge, $il a peut-être passé la main aux plus jeunes."; }
    }
    if ($dom === 'T' && $age && $age[0] >= 14 && !$isDeath) { $imag[] = 'Peut-être est-' . $il . ' aux champs ou auprès des bêtes dès le lever du jour.'; }
    elseif ($trade && !empty($trade['tools']) && $age && $age[0] >= 14 && !$isDeath) { $imag[] = 'On peut l’imaginer avec ses outils : ' . bio_join(array_slice(array_map('strval', $trade['tools']), 0, 3)) . '.'; }
    if ($precise && $Y >= 1583 && !$isDeath && ($wdn = (gregoriantojd($M, $D, $Y) + 1) % 7) === 0) { $imag[] = 'Un dimanche : sans doute un jour de repos et de visites.'; }
    foreach (array_slice($imag, 0, 3) as $t) { $say('ambiance', 'imagine', $t, ['label' => 'Phrase imaginée : une ambiance générale, pas un fait de la fiche']); }

    $living = isset($hidden[$id]) && $hidden[$id] === 'living' || (string) ($p['living_status'] ?? '') === 'living';
    return [
        'person' => ['id' => $id, 'name' => bio_name($p), 'first' => $first, 'gender' => $g],
        'date' => ['text' => $dateText, 'when' => $whenTxt, 'year' => $Y, 'month' => $M, 'day' => $D, 'precise' => $precise, 'event_id' => $chosen ? (int) $chosen['id'] : 0, 'event_label' => $chosen ? trim((string) $chosen['type_label']) : ''],
        'title' => 'Une journée dans la vie de ' . bio_name($p),
        'subtitle' => bio_cap($whenTxt) . ($place && trim((string) ($place['place_name'] ?? '')) !== '' ? ' · ' . trim((string) $place['place_name']) : ''),
        'sentences' => $out,
        'meteo' => $meteo,
        'living' => $living, 'private' => (int) ($p['is_private'] ?? 0) === 1,
        'prices' => ['count' => count(bio_day_prices()['items']), 'title' => (string) (bio_day_prices()['title'] ?? '')],
    ];
}

/** Les dates proposées (raccourcis de la fenêtre) : naissance, baptême, mariages, décès… avec une date */
function bio_day_events(PDO $pdo, int $id): array
{
    $s = $pdo->prepare("SELECT e.id, e.date_text, e.year, t.gedcom_tag AS tag, t.label, pl.name AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE (e.person_id=? OR e.family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?)) AND (TRIM(COALESCE(e.date_text,''))<>'' OR e.year IS NOT NULL)
        ORDER BY COALESCE(e.year,9999), e.sort_date, e.id LIMIT 60");
    $s->execute([$id, $id, $id]);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'tag' => (string) $r['tag'], 'label' => (string) $r['label'], 'date' => trim((string) $r['date_text']) ?: (string) $r['year'], 'place' => (string) ($r['place'] ?? '')], $s->fetchAll(PDO::FETCH_ASSOC));
}
