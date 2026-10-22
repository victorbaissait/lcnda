<?php
declare(strict_types=1);

/**
 * 📖 Biographie écrite par l'app (bloc « 📖 Biographie » de la fiche, assets/js/heritage-biographie.js).
 *
 * Un seul générateur de phrases pour toute l'app : la fiche, le livre de famille (Export propre), la mise en page
 * (champ {biographie}, gabarit « Biographie d'un ancêtre »), une Fiche (📒) ou une présentation (✨ Récit d'une vie)
 * passent tous par bio_generate() (automatic_biography() dans api.php l'appelle). Il reprend les règles du mode simple
 * (lib/mode_simple.php, app-mode-simple.js) : accords au féminin et au masculin, dates « le 3 mai 1832 », « en mai 1925 »,
 * « vers 1784 », âge seulement quand les deux dates sont sûres. Il n'invente rien : une information absente ne donne
 * pas de phrase.
 *
 * Options : length (short, normal, long), tone (neutral, warm), jobs, witnesses, census (0/1), sources (none, inline, notes).
 * Ta version (le texte modifié et gardé) est dans person_biographies (structure n°50) avec le texte de l'app du moment :
 * « ↻ Regénérer » montre ce qui a changé depuis.
 */

const BIO_LENGTHS = ['short', 'normal', 'long'];
const BIO_TONES = ['neutral', 'warm'];
const BIO_SOURCES = ['none', 'inline', 'notes'];
const BIO_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function bio_options(array $o): array
{
    $pick = static fn($v, array $list, string $def) => in_array((string) $v, $list, true) ? (string) $v : $def;
    $flag = static fn($v, bool $def) => $v === null || $v === '' ? $def : in_array((string) $v, ['1', 'true', 'on', 'yes'], true) || $v === true;
    return [
        'length' => $pick($o['length'] ?? '', BIO_LENGTHS, 'normal'),
        'tone' => $pick($o['tone'] ?? '', BIO_TONES, 'neutral'),
        'jobs' => $flag($o['jobs'] ?? null, true),
        'witnesses' => $flag($o['witnesses'] ?? null, false),
        'census' => $flag($o['census'] ?? null, true),
        'sources' => $pick($o['sources'] ?? '', BIO_SOURCES, 'none'),
    ];
}

/** La date écrite pour une phrase : « le 3 mai 1832 », « en mai 1925 », « en 1832 », « vers 1784 », « avant 1800 », « entre 1880 et 1885 » */
function bio_when(?string $text, $year = null): string
{
    $t = trim(preg_replace('/\s+/u', ' ', (string) $text));
    if ($t === '') { return $year ? 'en ' . (int) $year : ''; }
    $low = mb_strtolower($t);
    $low = preg_replace(['/^(abt|about|env\.?|environ|circa|ca\.?|cal|est)\s+/u', '/^(bef|avt)\.?\s+/u', '/^(aft|apr\.?)\s+/u', '/^(bet|btw)\s+(.+?)\s+and\s+/u', '/^le\s+/u'],
        ['vers ', 'avant ', 'après ', 'entre $2 et ', ''], $low);
    if (preg_match('/^(vers|avant|après|apres|entre|autour de)\b/u', $low)) { return str_replace('apres ', 'après ', $low); }
    if (preg_match('/\ban\s+[ivxlc0-9]+\b/u', $low)) { return (preg_match('/^\d/', $low) ? 'le ' : '') . $low; } // calendrier républicain : tel quel
    $d = function_exists('cal_parse_date') ? cal_parse_date($t) : null;
    if (!$d) { return $year ? 'en ' . (int) $year : $low; }
    [$y, $m, $day, $approx] = $d;
    if ($approx) { return 'vers ' . $y; }
    if ($m && $day) { return 'le ' . ($day === 1 ? '1er' : $day) . ' ' . BIO_MONTHS[$m - 1] . ' ' . $y; }
    if ($m) { return 'en ' . BIO_MONTHS[$m - 1] . ' ' . $y; }
    return 'en ' . $y;
}

/** [année, mois, jour, environ] ou null */
function bio_date(?string $text, $year = null): ?array
{
    $t = trim((string) $text);
    $d = $t !== '' && function_exists('cal_parse_date') ? cal_parse_date($t) : null;
    if ($d) { return [(int) $d[0], (int) ($d[1] ?? 0), (int) ($d[2] ?? 0), (bool) $d[3] || (bool) preg_match('/^(avant|apr|entre|bef|aft|bet)/iu', $t)]; }
    return $year ? [(int) $year, 0, 0, $t !== '' && !preg_match('/\b\d{4}\b/', $t)] : null;
}

/** L'âge entre deux dates : [ans, sûr ?] — sûr quand les deux dates sont au jour et sans « vers » */
function bio_age(?array $from, ?array $to): ?array
{
    if (!$from || !$to || $to[0] < $from[0]) { return null; }
    $a = $to[0] - $from[0];
    $sure = $from[1] && $from[2] && $to[1] && $to[2] && !$from[3] && !$to[3];
    if ($sure && ($to[1] < $from[1] || ($to[1] === $from[1] && $to[2] < $from[2]))) { $a--; }
    return $a >= 0 && $a < 125 ? [$a, $sure] : null;
}

function bio_place(array $e): string
{
    $n = trim((string) ($e['place_name'] ?? ''));
    $c = trim((string) ($e['country'] ?? ''));
    if ($n === '') { return $c !== '' ? 'en ' . $c : ''; }
    $co = trim((string) ($e['county'] ?? ''));
    $extra = $c !== '' && !preg_match('/^(france|fr)$/iu', $c) && mb_strtolower($c) !== mb_strtolower($n) ? $c : '';
    return 'à ' . $n . ($extra ? ' (' . $extra . ')' : ($co !== '' && mb_strtolower($co) !== mb_strtolower($n) ? ' (' . $co . ')' : ''));
}

function bio_name(array $p): string
{
    return trim(implode(' ', array_filter([trim((string) ($p['first_name'] ?? '')), trim((string) ($p['last_name'] ?? ''))]))) ?: 'une personne sans nom';
}

/** « cultivateur » → « cultivateur » (minuscule au début, sauf un nom propre tout en capitales) */
function bio_job(string $j): string
{
    $j = trim(preg_replace('/\s+/u', ' ', $j));
    if ($j === '' || mb_strtoupper($j) === $j) { return mb_strtolower($j); }
    return mb_strtolower(mb_substr($j, 0, 1)) . mb_substr($j, 1);
}

function bio_join(array $items): string
{
    $items = array_values(array_filter(array_map('trim', $items), static fn($x) => $x !== ''));
    $n = count($items);
    if ($n < 2) { return $items[0] ?? ''; }
    return implode(', ', array_slice($items, 0, -1)) . ' et ' . $items[$n - 1];
}

function bio_cap(string $s): string
{
    return $s === '' ? '' : mb_strtoupper(mb_substr($s, 0, 1)) . mb_substr($s, 1);
}

/** Tout ce que la fiche sait, rangé pour écrire */
function bio_facts(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM persons WHERE id=?'); $s->execute([$id]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Fiche introuvable.'); }
    $evq = "SELECT e.id, e.scope, e.person_id, e.family_id, e.date_text, e.year, e.title, e.description, e.cause, e.address, t.gedcom_tag AS tag, t.label AS type_label,
            pl.name AS place_name, pl.county, pl.country
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id";
    $s = $pdo->prepare("$evq WHERE e.person_id=? ORDER BY COALESCE(e.year,9999), e.sort_date, e.id"); $s->execute([$id]);
    $events = $s->fetchAll(PDO::FETCH_ASSOC);
    // parents (première famille où la personne est enfant)
    $s = $pdo->prepare('SELECT f.id, f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=? ORDER BY fc.id'); $s->execute([$id]);
    $parentFams = $s->fetchAll(PDO::FETCH_ASSOC);
    $pp = $pdo->prepare('SELECT id, first_name, last_name, gender, occupation FROM persons WHERE id=?');
    $person = static function (?int $pid) use ($pp): ?array { if (!$pid) { return null; } $pp->execute([$pid]); return $pp->fetch(PDO::FETCH_ASSOC) ?: null; };
    $parents = [];
    if ($parentFams) { foreach ([(int) $parentFams[0]['partner1_id'], (int) $parentFams[0]['partner2_id']] as $x) { if ($q = $person($x)) { $parents[] = $q; } } }
    $siblings = 0;
    if ($parentFams) { $s = $pdo->prepare('SELECT COUNT(*) FROM family_children WHERE family_id=? AND child_id<>?'); $s->execute([(int) $parentFams[0]['id'], $id]); $siblings = (int) $s->fetchColumn(); }
    // unions
    $s = $pdo->prepare('SELECT id, partner1_id, partner2_id FROM families WHERE partner1_id=? OR partner2_id=? ORDER BY id'); $s->execute([$id, $id]);
    $unions = [];
    $fe = $pdo->prepare("$evq WHERE e.family_id=? ORDER BY COALESCE(e.year,9999), e.sort_date, e.id");
    $kids = $pdo->prepare('SELECT p.id, p.first_name, p.last_name, p.gender, (SELECT MIN(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN (\'BIRT\',\'CHR\',\'BAPM\')) AS birth_year
        FROM family_children fc JOIN persons p ON p.id=fc.child_id WHERE fc.family_id=? ORDER BY birth_year IS NULL, birth_year, fc.position, fc.id');
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $f) {
        $other = (int) $f['partner1_id'] === $id ? (int) $f['partner2_id'] : (int) $f['partner1_id'];
        $fe->execute([(int) $f['id']]); $kids->execute([(int) $f['id']]);
        $unions[] = ['id' => (int) $f['id'], 'spouse' => $person($other), 'events' => $fe->fetchAll(PDO::FETCH_ASSOC), 'children' => $kids->fetchAll(PDO::FETCH_ASSOC)];
    }
    // témoins, parrains, marraines
    $allIds = array_merge(array_column($events, 'id'), ...array_map(static fn($u) => array_column($u['events'], 'id'), $unions ?: [['events' => []]]));
    $witnesses = [];
    if ($allIds) {
        $marks = implode(',', array_fill(0, count($allIds), '?'));
        try {
            $w = $pdo->prepare("SELECT w.event_id, w.note, p.id, p.first_name, p.last_name, p.gender FROM event_witnesses w JOIN persons p ON p.id=w.person_id WHERE w.event_id IN ($marks) ORDER BY w.position, w.id");
            $w->execute($allIds);
            foreach ($w->fetchAll(PDO::FETCH_ASSOC) as $r) { $witnesses[(int) $r['event_id']][] = $r; }
        } catch (Throwable $_) {}
    }
    // recensements
    $census = [];
    try {
        $c = $pdo->prepare('SELECT cr.id, cr.year, cr.address, cm.occupation, cm.household_position, cm.age_text, pl.name AS place_name, pl.county, pl.country,
                (SELECT COUNT(*) FROM census_members m2 WHERE m2.census_id=cr.id) AS members
            FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id LEFT JOIN places pl ON pl.id=cr.place_id
            WHERE cm.person_id=? ORDER BY cr.year, cr.id');
        $c->execute([$id]); $census = $c->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $_) {}
    // sources : par événement et pour la personne
    $sources = ['person' => [], 'event' => []];
    $sq = $pdo->prepare("SELECT sl.entity_type, sl.entity_id, sl.page, s.title, s.author FROM source_links sl JOIN sources s ON s.id=sl.source_record_id WHERE (sl.entity_type='person' AND sl.entity_id=?)" . ($allIds ? ' OR (sl.entity_type=\'event\' AND sl.entity_id IN (' . implode(',', array_map('intval', $allIds)) . '))' : '') . ' ORDER BY sl.id');
    $sq->execute([$id]);
    foreach ($sq->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $label = trim(implode(', ', array_filter([trim((string) $r['title']), trim((string) $r['page'])]))) ?: 'source sans titre';
        if ($r['entity_type'] === 'person') { $sources['person'][] = $label; } else { $sources['event'][(int) $r['entity_id']][] = $label; }
    }
    return ['person' => $p, 'events' => $events, 'parents' => $parents, 'siblings' => $siblings, 'unions' => $unions, 'witnesses' => $witnesses, 'census' => $census, 'sources' => $sources];
}

/** Écrit la biographie : ['paragraphs' => [...], 'notes' => [...], 'text' => '…'] */
function bio_write(array $F, array $o): array
{
    $o = bio_options($o);
    $p = $F['person']; $g = (string) ($p['gender'] ?? 'unknown');
    $f = $g === 'female'; $m = $g === 'male';
    $e = $f ? 'e' : '';
    $il = $f ? 'Elle' : 'Il';
    $first = trim((string) ($p['first_name'] ?? '')) ?: bio_name($p);
    $full = bio_name($p);
    $warm = $o['tone'] === 'warm';
    $short = $o['length'] === 'short'; $long = $o['length'] === 'long';
    $notes = []; $noteIx = [];
    $cite = static function (array $labels) use (&$notes, &$noteIx, $o): string {
        $labels = array_values(array_unique(array_filter($labels)));
        if (!$labels || $o['sources'] === 'none') { return ''; }
        if ($o['sources'] === 'inline') { return ' (' . implode(' ; ', $labels) . ')'; }
        $marks = [];
        foreach ($labels as $l) { if (!isset($noteIx[$l])) { $notes[] = $l; $noteIx[$l] = count($notes); } $marks[] = $noteIx[$l]; }
        return '[' . implode(',', $marks) . ']';
    };
    $srcOf = static fn(array $ev) => $F['sources']['event'][(int) ($ev['id'] ?? 0)] ?? [];
    $find = static function (array $tags) use ($F): ?array { foreach ($F['events'] as $ev) { if (in_array(strtoupper((string) $ev['tag']), $tags, true)) { return $ev; } } return null; };
    $byWord = static function (array $words) use ($F): array { return array_values(array_filter($F['events'], static function ($ev) use ($words) { $l = mb_strtolower((string) $ev['type_label']); foreach ($words as $w) { if (str_starts_with($l, $w)) { return true; } } return false; })); };
    $witnessText = static function (array $ev) use ($F): string {
        $ws = $F['witnesses'][(int) ($ev['id'] ?? 0)] ?? [];
        return bio_join(array_map(static fn($w) => bio_name($w) . (trim((string) $w['note']) !== '' ? ' (' . mb_strtolower(trim((string) $w['note'])) . ')' : ''), $ws));
    };
    $jobOf = static fn(?array $q) => $q && $o['jobs'] && trim((string) ($q['occupation'] ?? '')) !== '' ? ', ' . bio_job((string) $q['occupation']) : '';
    $P1 = []; $P2 = []; $P3 = []; $P4 = [];

    // ── 1. naissance et parents ──
    $birth = $find(['BIRT']); $bapt = $find(['CHR', 'BAPM']);
    $bD = bio_date($birth['date_text'] ?? '', $birth['year'] ?? null) ?? bio_date($bapt['date_text'] ?? '', $bapt['year'] ?? null);
    $parentTxt = '';
    if ($F['parents']) {
        $ps = array_map(static fn($q) => bio_name($q) . $jobOf($q), $F['parents']);
        $parentTxt = ($f ? 'fille' : ($m ? 'fils' : 'enfant')) . ' de ' . (count($ps) > 1 ? $ps[0] . ($jobOf($F['parents'][0]) !== '' ? ',' : '') . ' et de ' . $ps[1] : $ps[0]);
    }
    if ($birth && (trim((string) $birth['date_text']) !== '' || $birth['year'] || $birth['place_name'])) {
        $when = bio_when($birth['date_text'], $birth['year']); $where = bio_place($birth);
        $verb = $warm ? 'voit le jour' : 'naît';
        $P1[] = trim("$full $verb " . trim("$when $where")) . ($parentTxt ? ", $parentTxt" : '') . $cite($srcOf($birth)) . '.';
    } elseif ($parentTxt) {
        $P1[] = "$full est " . ($f ? 'la ' : ($m ? 'le ' : 'l’')) . $parentTxt . '.';
    }
    if ($bapt && !$short && (trim((string) $bapt['date_text']) !== '' || $bapt['place_name'])) {
        $who = $P1 ? $il : $full;
        $s = trim("$who est baptisé$e " . trim(bio_when($bapt['date_text'], $bapt['year']) . ' ' . bio_place($bapt)));
        $wt = $o['witnesses'] ? $witnessText($bapt) : '';
        $P1[] = $s . ($wt ? " ; sont présents $wt" : '') . $cite($srcOf($bapt)) . '.';
    } elseif ($bapt && !$P1) {
        $P1[] = "$full est baptisé$e " . trim(bio_when($bapt['date_text'], $bapt['year']) . ' ' . bio_place($bapt)) . '.';
    }
    if (!$P1) { $P1[] = $warm ? "Voici ce que l’on sait de $full." : "La naissance de $full n’est pas encore notée dans la fiche."; }
    if ($long && $F['siblings'] > 0) { $P1[] = ($F['siblings'] === 1 ? "$il a un frère ou une sœur dans la base." : "$il a {$F['siblings']} frères et sœurs dans la base."); }

    // ── 2. métiers ──
    if ($o['jobs']) {
        $jobs = [];
        $mainJob = trim((string) ($p['occupation'] ?? ''));
        $occ = array_merge(array_values(array_filter($F['events'], static fn($ev) => strtoupper((string) $ev['tag']) === 'OCCU')), $byWord(['profession', 'métier', 'metier']));
        $seen = [];
        foreach ($occ as $ev) {
            $j = trim((string) ($ev['description'] ?: $ev['title'])); if ($j === '' || isset($seen[(int) $ev['id']])) { continue; }
            $seen[(int) $ev['id']] = true;
            $jobs[] = ['job' => bio_job($j), 'when' => bio_when($ev['date_text'], $ev['year']), 'where' => bio_place($ev), 'src' => $srcOf($ev)];
        }
        $living = ($p['living_status'] ?? '') === 'living';
        if ($jobs && !$short) {
            $parts = array_map(static fn($j) => trim($j['job'] . ' ' . trim($j['when'] . ' ' . $j['where'])), $jobs);
            $srcs = array_merge(...array_map(static fn($j) => $j['src'], $jobs));
            $P2[] = ($warm ? "Au fil de sa vie, $first est " : "$il est ") . bio_join(array_values(array_unique($parts))) . $cite($srcs) . '.';
        } elseif ($mainJob !== '' || $jobs) {
            $j = $mainJob !== '' ? bio_job($mainJob) : $jobs[0]['job'];
            $P2[] = $warm ? ($living ? "$first exerce le métier de $j." : "$first a exercé le métier de $j.") : ($living ? "$il est $j." : "$il était $j.");
        }
    }

    // ── 3. unions et enfants ──
    $kidsAll = 0;
    foreach ($F['unions'] as $i => $u) {
        $sp = $u['spouse'];
        $marr = null; foreach ($u['events'] as $ev) { if (in_array(strtoupper((string) $ev['tag']), ['MARR', 'MRCI', 'MRRE'], true) || str_starts_with(mb_strtolower((string) $ev['type_label']), 'mariage')) { $marr = $ev; break; } }
        $spName = $sp ? bio_name($sp) . ($long ? $jobOf($sp) : '') : '';
        $again = $i > 0 ? ($warm ? 'Plus tard, ' : 'Ensuite, ') : '';
        if ($marr && (trim((string) $marr['date_text']) !== '' || $marr['year'] || $marr['place_name'])) {
            $when = bio_when($marr['date_text'], $marr['year']); $where = bio_place($marr);
            $age = $long ? bio_age($bD, bio_date($marr['date_text'], $marr['year'])) : null;
            $verb = $warm ? ($spName ? 'unit sa vie à ' : 'se marie') : ($spName ? 'épouse ' : 'se marie');
            $s = $again . $first . " $verb" . ($spName ?: '') . ' ' . trim("$when $where");
            if ($age && $age[1]) { $s .= ", à {$age[0]} ans"; }
            $wt = $o['witnesses'] && !$short ? $witnessText($marr) : '';
            $P3[] = trim($s) . ($wt ? " ; les témoins sont $wt" : '') . $cite($srcOf($marr)) . '.';
        } elseif ($spName) {
            $P3[] = $again . "$first " . ($marr ? "épouse $spName" : "a pour conjoint" . ($sp && ($sp['gender'] ?? '') === 'female' ? 'e' : '') . " $spName") . '.';
        }
        $kids = $u['children']; $n = count($kids); $kidsAll += $n;
        if ($n && !$short) {
            $names = array_map(static fn($k) => trim((string) $k['first_name']) . ($k['birth_year'] ? ' (' . (int) $k['birth_year'] . ')' : ''), $kids);
            if ($n === 1) {
                $k = $kids[0]; $kind = ($k['gender'] ?? '') === 'female' ? 'une fille' : (($k['gender'] ?? '') === 'male' ? 'un fils' : 'un enfant');
                $P3[] = ($warm ? 'De cette union naît ' : ($spName ? 'Ils ont ' : "$il a ")) . "$kind, " . $names[0] . '.';
            } else {
                $P3[] = ($warm ? "De cette union naissent $n enfants : " : ($spName ? "Ils ont $n enfants : " : "$il a $n enfants : ")) . bio_join($names) . '.';
            }
        }
    }
    if ($short && $kidsAll) { $P3[] = $kidsAll === 1 ? "$il a un enfant connu." : "$il a $kidsAll enfants connus."; }

    // ── 4. domiciles, recensements, autres événements (normale et détaillée) ──
    if (!$short) {
        $homes = array_merge(array_values(array_filter($F['events'], static fn($ev) => strtoupper((string) $ev['tag']) === 'RESI')), $byWord(['domicile', 'résidence', 'residence']));
        $last = '';
        foreach (array_slice($homes, 0, $long ? 12 : 4) as $ev) {
            $where = bio_place($ev); if ($where === '' || $where === $last) { continue; }
            $when = bio_when($ev['date_text'], $ev['year']);
            $P4[] = ($when ? bio_cap($when) . ', ' : '') . "$first " . ($last ? 's’installe' : 'habite') . " $where" . (trim((string) $ev['address']) !== '' && $long ? ', ' . trim((string) $ev['address']) : '') . $cite($srcOf($ev)) . '.';
            $last = $where;
        }
        if ($o['census'] && $F['census']) {
            $rows = $long ? $F['census'] : array_slice($F['census'], 0, 3);
            if ($long) {
                foreach ($rows as $c) {
                    $where = bio_place($c);
                    $s = "Au recensement de {$c['year']}, $first vit " . ($where ?: 'dans la commune') . (trim((string) $c['address']) !== '' ? ' (' . trim((string) $c['address']) . ')' : '');
                    if ($o['jobs'] && trim((string) $c['occupation']) !== '') { $s .= ', noté' . $e . ' « ' . bio_job((string) $c['occupation']) . ' »'; }
                    if ((int) $c['members'] > 1) { $s .= ', dans un foyer de ' . (int) $c['members'] . ' personnes'; }
                    $P4[] = $s . '.';
                }
            } else {
                $years = array_map(static fn($c) => (string) $c['year'] . (bio_place($c) ? ' ' . bio_place($c) : ''), $rows);
                $P4[] = 'On ' . ($f ? 'la' : 'le') . ' retrouve aux recensements de ' . bio_join($years) . '.';
            }
        }
        if ($long) {
            $skip = ['BIRT', 'CHR', 'BAPM', 'DEAT', 'BURI', 'CREM', 'OCCU', 'RESI', 'CENS'];
            foreach ($F['events'] as $ev) {
                $tag = strtoupper((string) $ev['tag']); $lab = mb_strtolower(trim((string) $ev['type_label']));
                if (in_array($tag, $skip, true) || preg_match('/^(profession|métier|metier|domicile|résidence|residence|recensement)/u', $lab)) { continue; }
                $when = bio_when($ev['date_text'], $ev['year']); $where = bio_place($ev); $desc = trim((string) ($ev['description'] ?: $ev['title']));
                if ($when === '' && $where === '' && $desc === '') { continue; }
                $P4[] = bio_cap(trim(($lab !== '' ? $lab : 'événement') . ' ' . trim("$when $where"))) . ($desc !== '' && mb_strtolower($desc) !== $lab ? ' : ' . rtrim($desc, '.') : '') . $cite($srcOf($ev)) . '.';
            }
        }
    }

    // ── 5. décès et sépulture ──
    $death = $find(['DEAT']); $buri = $find(['BURI', 'CREM']);
    $P5 = [];
    if ($death && (trim((string) $death['date_text']) !== '' || $death['year'] || $death['place_name'])) {
        $dD = bio_date($death['date_text'], $death['year']);
        $age = bio_age($bD, $dD);
        $verb = $warm ? 's’éteint' : 'meurt';
        $s = "$first $verb " . trim(bio_when($death['date_text'], $death['year']) . ' ' . bio_place($death));
        if ($age) { $s .= $age[1] ? ", à {$age[0]} ans" : ($long || $o['length'] === 'normal' ? ", vers {$age[0]} ans" : ''); }
        if ($long && trim((string) $death['cause']) !== '') { $s .= ' (cause notée : ' . mb_strtolower(trim((string) $death['cause'])) . ')'; }
        $P5[] = trim($s) . $cite($srcOf($death)) . '.';
    } elseif (($p['living_status'] ?? '') === 'living' && $bD && !$short) {
        $now = [(int) date('Y'), (int) date('n'), (int) date('j'), false];
        $age = bio_age($bD, $now);
        if ($age) { $P5[] = $age[1] ? "Aujourd’hui, " . mb_strtolower($il) . " a {$age[0]} ans." : "Aujourd’hui, " . mb_strtolower($il) . " a environ {$age[0]} ans."; }
    }
    if ($buri && !$short && ($buri['place_name'] || trim((string) $buri['date_text']) !== '')) {
        $kind = strtoupper((string) $buri['tag']) === 'CREM' ? 'incinéré' : 'inhumé';
        $P5[] = ($P5 ? $il : $first) . " est $kind$e " . trim(bio_when($buri['date_text'], $buri['year']) . ' ' . bio_place($buri)) . $cite($srcOf($buri)) . '.';
    }
    if ($o['sources'] !== 'none' && $F['sources']['person'] && !$short) {
        $c = $cite($F['sources']['person']);
        if ($c !== '') { $P5[] = ($o['sources'] === 'inline' ? 'Sources de la fiche' . $c : 'Sources de la fiche' . $c) . '.'; }
    }

    $paras = [];
    foreach ($short ? [array_merge($P1, $P2, $P3, $P5)] : [$P1, array_merge($P2, $P3), $P4, $P5] as $block) {
        $txt = trim(implode(' ', $block));
        if ($txt !== '') { $paras[] = preg_replace('/\s+([.,;])/u', '$1', preg_replace('/\s{2,}/u', ' ', $txt)); }
    }
    $text = implode("\n\n", $paras);
    if ($notes) { $text .= "\n\nNotes :\n" . implode("\n", array_map(static fn($n, $i) => '[' . ($i + 1) . '] ' . $n, $notes, array_keys($notes))); }
    return ['paragraphs' => $paras, 'notes' => $notes, 'text' => $text, 'options' => $o];
}

function bio_generate(PDO $pdo, int $id, array $options = []): array
{
    return bio_write(bio_facts($pdo, $id), $options);
}

function bio_row(PDO $pdo, int $id): ?array
{
    try { $s = $pdo->prepare('SELECT * FROM person_biographies WHERE person_id=?'); $s->execute([$id]); return $s->fetch(PDO::FETCH_ASSOC) ?: null; }
    catch (Throwable $_) { return null; }
}

/** GET biography : le texte de l'app, ta version s'il y en a une, et si la fiche a changé depuis */
function bio_get(PDO $pdo, int $id, array $q = []): array
{
    if ($id <= 0) { throw new RuntimeException('Fiche introuvable.'); }
    $row = bio_row($pdo, $id);
    $saved = $row ? (json_decode((string) $row['options_json'], true) ?: []) : [];
    $o = bio_options(array_intersect_key($q, array_flip(['length', 'tone', 'jobs', 'witnesses', 'census', 'sources'])) + $saved);
    $gen = bio_generate($pdo, $id, $o);
    $own = $row && trim((string) $row['text']) !== '' ? (string) $row['text'] : '';
    return [
        'person_id' => $id, 'options' => $o, 'generated' => $gen['text'], 'paragraphs' => $gen['paragraphs'], 'notes' => $gen['notes'],
        'own' => $own, 'own_base' => $own !== '' ? (string) $row['generated_text'] : '',
        'changed' => $own !== '' && trim((string) $row['generated_text']) !== trim($gen['text']),
        'updated_at' => $row['updated_at'] ?? '', 'text' => $own !== '' ? $own : $gen['text'],
    ];
}

/** POST save_biography : {person_id, text ('' = revenir au texte de l'app), options, generated_text} ; options seules : {person_id, options} */
function bio_save(PDO $pdo, array $d): array
{
    $id = safe_int($d['person_id'] ?? 0);
    $s = $pdo->prepare('SELECT id FROM persons WHERE id=?'); $s->execute([$id]);
    if (!$s->fetchColumn()) { throw new RuntimeException('Fiche introuvable.'); }
    $row = bio_row($pdo, $id);
    $o = bio_options(is_array($d['options'] ?? null) ? $d['options'] : (json_decode((string) ($row['options_json'] ?? '{}'), true) ?: []));
    $text = array_key_exists('text', $d) ? mb_substr(str_replace("\r", '', trim((string) $d['text'])), 0, 60000) : (string) ($row['text'] ?? '');
    $gen = array_key_exists('text', $d) ? ($text === '' ? '' : bio_generate($pdo, $id, $o)['text']) : (string) ($row['generated_text'] ?? '');
    $pdo->prepare('INSERT INTO person_biographies(person_id, text, generated_text, options_json) VALUES(?,?,?,?)
        ON CONFLICT(person_id) DO UPDATE SET text=excluded.text, generated_text=excluded.generated_text, options_json=excluded.options_json, updated_at=CURRENT_TIMESTAMP')
        ->execute([$id, $text, $gen, json_encode($o, JSON_UNESCAPED_UNICODE)]);
    if (array_key_exists('text', $d)) { log_change($pdo, 'person', $id, 'update', $text === '' ? 'Biographie : retour au texte de l’app' : 'Biographie : ta version gardée'); }
    return ['ok' => true] + bio_get($pdo, $id);
}

/** Le texte à utiliser ailleurs (livre de famille, mise en page) : ta version, sinon celui de l'app avec tes réglages */
function bio_text_for(PDO $pdo, int $id): string
{
    $row = bio_row($pdo, $id);
    if ($row && trim((string) $row['text']) !== '') { return (string) $row['text']; }
    $o = $row ? (json_decode((string) $row['options_json'], true) ?: []) : [];
    return bio_generate($pdo, $id, $o)['text'];
}

/** Les tables de 📖 la biographie, 🌍 du monde autour et 🛠️ des métiers anciens (migration de lib/migrations.php) */
function recits_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS person_biographies (
        person_id INTEGER PRIMARY KEY REFERENCES persons(id) ON DELETE CASCADE,
        text TEXT NOT NULL DEFAULT '',
        generated_text TEXT NOT NULL DEFAULT '',
        options_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS history_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_year INTEGER NOT NULL,
        to_year INTEGER NOT NULL,
        date_text TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'société',
        quand TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '',
        place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
        reach TEXT NOT NULL DEFAULT 'commune' CHECK(reach IN ('commune','departement','france','monde')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_history_events_years ON history_events(from_year, to_year)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS old_trade_notes (
        trade_key TEXT PRIMARY KEY,
        notes TEXT NOT NULL DEFAULT '',
        sheet_id INTEGER REFERENCES topic_sheets(id) ON DELETE SET NULL,
        media_ids TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
}
