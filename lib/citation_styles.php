<?php
declare(strict_types=1);

/**
 * ❝ Citation des sources toute prête (F4) : chaque source, et chaque citation d'une source sur un événement ou une fiche,
 * écrite toute seule en plusieurs styles :
 *  - « fr »      classique, à la française (« Archives départementales de la Corrèze, Tulle, naissances 1823-1832, 3 E 12/4, vue 87/240, acte n° 45. ») ;
 *  - « ee »      Evidence Explained (E. S. Mills : couches « ce qui est cité ; où on l'a vu ; d'après ») ;
 *  - « chicago » Chicago (note et bibliographie) ;
 *  - « forum »   Généanet / forum (une phrase qu'on colle dans un message, avec le lien).
 * Chaque style donne la note (« note ») et l'entrée de bibliographie (« biblio »).
 * Les éléments viennent de la source (titre, auteur, dépôt, date, lien, sorte), du service d'archives relié (F14,
 * lib/archive_services.php : nom, ville, série, cote) et de la référence détaillée de la citation (citation_json,
 * lib/heritage_links.php : service, commune, registre, années, cote, vue, acte, lien de la vue), plus l'événement cité.
 *
 *  - GET source_citations&person_id= | &source_id= | &link_id=  → {items:[{source_id, link_id, title, where, styles:{…}}], styles}
 *    &archive= &cote= &folio= &date= &extra= : ce qu'on vient de taper (mise en page « 📚 Citer une source ») ;
 *  - cite_styles_for() : pour un export côté serveur (rapport de recherche).
 * Écran : assets/js/heritage-citations.js (« ❝ Citer » sur chaque source d'une fiche, mise en page, exports).
 */

const CITE_STYLES = [
    'fr' => 'Classique (à la française)',
    'ee' => 'Evidence Explained',
    'chicago' => 'Chicago',
    'forum' => 'Généanet / forum',
];

/** « Jean Dupont » → ['first' => 'Jean', 'last' => 'Dupont'] ; « Dupont, Jean » aussi ; un organisme reste entier. */
function cite_split_author(string $a): array
{
    $a = trim(preg_replace('/\s+/u', ' ', $a) ?? $a);
    if ($a === '') { return ['first' => '', 'last' => '', 'org' => '']; }
    if (str_contains($a, ',')) { [$l, $f] = array_map('trim', explode(',', $a, 2)); return ['first' => $f, 'last' => $l, 'org' => '']; }
    $w = explode(' ', $a);
    if (count($w) === 1 || count($w) > 4 || preg_match('/\b(archives?|soci[ée]t[ée]|cercle|association|mairie|minist[èe]re|service|biblioth[èe]que|institut|geneanet|filae|familysearch|ancestry|myheritage)\b/iu', $a)) { return ['first' => '', 'last' => '', 'org' => $a]; }
    // particules : « Jean de La Fontaine » → nom « de La Fontaine »
    $i = count($w) - 1;
    while ($i > 1 && preg_match('/^(de|du|des|d’|d\'|la|le|van|von|der|di|da)$/iu', $w[$i - 1])) { $i--; }
    return ['first' => implode(' ', array_slice($w, 0, $i)), 'last' => implode(' ', array_slice($w, $i)), 'org' => ''];
}

function cite_upper(string $s): string { return mb_strtoupper($s, 'UTF-8'); }

/** Ponctuation finale : un seul point. */
function cite_end(string $s): string
{
    $s = trim($s);
    if ($s === '') { return ''; }
    return preg_match('/[.!?…]$/u', $s) ? $s : $s . '.';
}

/** Les morceaux non vides, joints. */
function cite_join(array $parts, string $sep = ', '): string
{
    return implode($sep, array_values(array_filter(array_map(static fn($p) => trim((string) $p), $parts), static fn($p) => $p !== '')));
}

/** « 87 » → « vue 87/240 » ; un folio « 12 » ou « 12v » → « f° 12 v° ». */
function cite_view(array $c, string $style): string
{
    $v = trim((string) ($c['view'] ?? ''));
    if ($v === '') { return ''; }
    $t = trim((string) ($c['view_total'] ?? ''));
    if ($style === 'ee') { return 'image ' . $v . ($t !== '' ? ' of ' . $t : ''); }
    return 'vue ' . $v . ($t !== '' ? '/' . $t : '');
}

function cite_act(array $c, string $style): string
{
    $a = trim((string) preg_replace('/^(n°|no\.?|n)\s*/iu', '', (string) ($c['act'] ?? '')));
    if ($a === '') { return ''; }
    return $style === 'ee' ? 'no. ' . $a : 'acte n° ' . $a;
}

/**
 * Les éléments d'une citation, à plat. $src : ligne de sources (+ service relié), $c : citation_json décodé,
 * $ctx : ['page', 'what' (Naissance), 'who' (Jean MARTIN), 'date' (7 mai 1825), 'place' (Tulle), 'url'].
 */
function cite_parts(array $src, array $c = [], array $ctx = []): array
{
    $svc = is_array($src['_service'] ?? null) ? $src['_service'] : null;
    $type = (string) ($src['source_type'] ?? 'internet');
    $cote = trim((string) ($c['cote'] ?? '')) ?: trim((string) ($src['archive_cote'] ?? ''));
    $repo = trim((string) ($c['archive'] ?? ''));
    $repoLong = $svc ? trim((string) $svc['name']) : '';
    if ($repoLong === '') { $repoLong = $repo !== '' ? $repo : trim((string) ($src['agency'] ?? '')); }
    $isArchive = $type === 'archive' || $svc || $repo !== '' || $cote !== '' || !empty($c['register']) || !empty($c['act']);
    if ($type === 'book' && !$svc && $repo === '' && $cote === '') { $isArchive = false; }
    return [
        'kind' => $isArchive ? 'archive' : (in_array($type, ['book', 'testimony', 'internet'], true) ? $type : 'other'),
        'title' => trim((string) ($src['title'] ?? '')), 'author' => trim((string) ($src['author'] ?? '')),
        'publisher' => trim((string) ($src['agency'] ?? '')), 'date' => trim((string) ($src['publication'] ?? '')),
        'repo' => $repoLong, 'repo_short' => $svc ? (trim((string) $svc['short_name']) ?: $repoLong) : ($repo !== '' ? $repo : $repoLong),
        'repo_city' => $svc ? trim((string) $svc['city']) : '',
        'commune' => trim((string) ($c['commune'] ?? '')), 'register' => trim((string) ($c['register'] ?? '')), 'years' => trim((string) ($c['years'] ?? '')),
        'series' => trim((string) ($src['archive_series'] ?? '')), 'cote' => $cote, 'c' => $c,
        'url' => trim((string) ($c['view_url'] ?? '')) ?: trim((string) ($src['url'] ?? '')),
        'page' => trim((string) ($ctx['page'] ?? '')), 'extra' => trim((string) ($ctx['extra'] ?? '')),
        'what' => trim((string) ($ctx['what'] ?? '')), 'who' => trim((string) ($ctx['who'] ?? '')), 'when' => trim((string) ($ctx['date'] ?? '')), 'where' => trim((string) ($ctx['place'] ?? '')),
        'act_date' => trim((string) ($ctx['act_date'] ?? '')),
    ];
}

/** « naissance de Jean MARTIN, 7 mai 1825 » (ce qui est cité). */
function cite_subject(array $p, bool $capital = false): string
{
    $what = $p['what'] !== '' ? mb_strtolower($p['what'], 'UTF-8') : '';
    $s = $what !== '' && $p['who'] !== '' ? $what . ' de ' . $p['who'] : ($p['who'] !== '' ? $p['who'] : $what);
    $s = cite_join([$s, $p['when'] ?: $p['act_date']]);
    if ($p['extra'] !== '') { $s = cite_join([$s, $p['extra']]); }
    return $capital && $s !== '' ? mb_strtoupper(mb_substr($s, 0, 1)) . mb_substr($s, 1) : $s;
}

/** Le registre : « naissances 1823-1832 ». */
function cite_register(array $p): string { return trim($p['register'] . ' ' . $p['years']); }

/** La page ou référence libre, si elle n'est pas déjà la référence rédigée de la citation. */
function cite_page(array $p): string
{
    $page = $p['page'];
    if ($page === '') { return ''; }
    if (function_exists('citation_reference') && $p['c'] && $page === citation_reference($p['c'])) { return ''; }
    return $page;
}

/** Le texte de chaque style : ['fr' => ['label', 'note', 'biblio'], …]. */
function cite_format(array $p): array
{
    $out = [];
    $a = cite_split_author($p['author']);
    $page = cite_page($p);
    $subject = cite_subject($p);
    $urlFr = $p['url'] !== '' ? 'en ligne : ' . $p['url'] : '';
    if ($p['kind'] === 'archive') {
        // ─ classique français
        $frNote = cite_join([$p['repo'], $p['commune'], cite_register($p), $p['cote'], cite_view($p['c'], 'fr'), cite_act($p['c'], 'fr'), $page]);
        if ($frNote === '') { $frNote = $p['title']; }
        elseif ($p['title'] !== '' && !$p['register'] && !$p['commune']) { $frNote = cite_join([$p['repo'], $p['title'], $p['cote'], cite_view($p['c'], 'fr'), cite_act($p['c'], 'fr'), $page]); }
        $out['fr'] = ['note' => cite_end(cite_join([$frNote, $subject !== '' ? '(' . $subject . ')' : '', $urlFr], ' ')),
            'biblio' => cite_end(cite_join([$p['repo'] !== '' ? cite_upper($p['repo_short'] !== '' && $p['repo_short'] !== $p['repo'] ? $p['repo'] . ' (' . $p['repo_short'] . ')' : $p['repo']) : '', $p['commune'], cite_register($p) ?: $p['title'], $p['cote'] ? 'cote ' . $p['cote'] : '']))];
        // ─ Evidence Explained : ce qui est cité ; où on l'a vu ; d'après (la cote)
        $what = cite_join([$p['commune'], cite_register($p) ?: $p['title']]);
        $layer1 = cite_join([$what !== '' ? '"' . $what . ',"' : '', cite_join([cite_act($p['c'], 'ee'), $subject, $page])], ' ');
        $img = cite_view($p['c'], 'ee');
        $layer2 = $p['url'] !== '' ? cite_join(['digital images', $p['repo'] . ($p['url'] !== '' ? ' (' . $p['url'] . ')' : ''), $img]) : cite_join([$p['repo'], $p['repo_city'], $img]);
        $eeNote = cite_join([$layer1, $layer2, $p['cote'] !== '' ? 'citing ' . $p['cote'] : ''], '; ');
        $out['ee'] = ['note' => cite_end($eeNote), 'biblio' => cite_end(cite_join([cite_join([$p['commune'], cite_register($p) ?: $p['title']], '. '), cite_join([$p['repo'], $p['repo_city']])], '. '))];
        // ─ Chicago : la pièce, sa date, le fonds, la cote, le dépôt, la ville
        $item = $subject !== '' ? cite_subject($p, true) : '';
        $out['chicago'] = ['note' => cite_end(cite_join([$item, cite_act($p['c'], 'fr'), cite_register($p) ?: $p['title'], $p['commune'], $p['cote'], cite_view($p['c'], 'fr'), $page, $p['repo'], $p['repo_city'], $p['url']])),
            'biblio' => cite_end(cite_join([cite_join([$p['repo'] ?: $p['title'], $p['commune'] ?: $p['repo_city']], '. '), cite_register($p), $p['cote']], '. '))];
        // ─ Généanet / forum : une phrase claire, avec le lien
        $head = $p['what'] !== '' || $p['who'] !== '' ? cite_join([cite_join([$p['what'] !== '' ? $p['what'] . ($p['who'] !== '' ? ' de ' . $p['who'] : '') : $p['who'], $p['when'] !== '' ? 'le ' . $p['when'] : '', $p['where'] !== '' ? 'à ' . $p['where'] : ''], ' ')], '') : '';
        $ref = cite_join([$p['repo_short'] ?: $p['repo'], $p['commune'], cite_register($p), $p['cote'], cite_view($p['c'], 'fr'), cite_act($p['c'], 'fr'), $page]);
        $forum = cite_join([$head, $ref !== '' ? 'Source : ' . $ref : $p['title'], $p['url'] !== '' ? 'lien : ' . $p['url'] : ''], ' — ');
        $out['forum'] = ['note' => $forum, 'biblio' => cite_join([$p['repo_short'] ?: $p['repo'], $p['commune'], cite_register($p) ?: $p['title'], $p['cote']])];
    } elseif ($p['kind'] === 'book' || $p['kind'] === 'other') {
        $frAuthor = $a['org'] !== '' ? $a['org'] : cite_join([cite_upper($a['last']), $a['first']], ' ');
        $out['fr'] = ['note' => cite_end(cite_join([$frAuthor, $p['title'], $p['publisher'], $p['date'], $page !== '' ? (preg_match('/^\d/', $page) ? 'p. ' . $page : $page) : '', $subject !== '' ? '(' . $subject . ')' : ''])),
            'biblio' => cite_end(cite_join([$frAuthor, $p['title'], $p['publisher'], $p['date']]))];
        $eeAuthor = $a['org'] !== '' ? $a['org'] : cite_join([$a['first'], $a['last']], ' ');
        $pub = cite_join([$p['publisher'], $p['date']]);
        $out['ee'] = ['note' => cite_end(cite_join([cite_join([$eeAuthor, $p['title'] . ($pub !== '' ? ' (' . $pub . ')' : '')]), $page !== '' ? $page : '', $subject], ', ')),
            'biblio' => cite_end(cite_join([$a['org'] !== '' ? $a['org'] : cite_join([$a['last'], $a['first']]), $p['title'], cite_join([$p['publisher'], $p['date']])], '. '))];
        $out['chicago'] = ['note' => cite_end(cite_join([$eeAuthor, $p['title'] . ($pub !== '' ? ' (' . $pub . ')' : ''), $page])),
            'biblio' => cite_end(cite_join([$a['org'] !== '' ? $a['org'] : cite_join([$a['last'], $a['first']]), $p['title'], cite_join([$p['publisher'], $p['date']])], '. '))];
        $out['forum'] = ['note' => cite_join([$subject !== '' ? cite_subject($p, true) : '', 'Source : ' . cite_join([$p['title'], $eeAuthor, $pub, $page]), $p['url'] !== '' ? 'lien : ' . $p['url'] : ''], ' — '),
            'biblio' => cite_join([$p['title'], $eeAuthor, $pub])];
    } elseif ($p['kind'] === 'testimony') {
        $who = $p['author'] !== '' ? $p['author'] : 'un proche';
        $out['fr'] = ['note' => cite_end(cite_join(['Témoignage de ' . $who, $p['title'], $p['date'], $subject !== '' ? '(' . $subject . ')' : ''])), 'biblio' => cite_end(cite_join(['Témoignage de ' . $who, $p['title'], $p['date']]))];
        $out['ee'] = ['note' => cite_end(cite_join([$who, $p['title'] !== '' ? '"' . $p['title'] . '"' : '', 'interview', $p['date'], $subject])), 'biblio' => cite_end(cite_join([$who, $p['title'], $p['date']], '. '))];
        $out['chicago'] = ['note' => cite_end(cite_join([$who, 'entretien', $p['title'], $p['date']])), 'biblio' => cite_end(cite_join([$who, $p['title'], $p['date']], '. '))];
        $out['forum'] = ['note' => cite_join([$subject !== '' ? cite_subject($p, true) : '', 'Source : témoignage de ' . $who . ($p['date'] !== '' ? ' (' . $p['date'] . ')' : '')], ' — '), 'biblio' => 'Témoignage de ' . $who];
    } else { // internet
        $site = $p['publisher'];
        $frAuthor = $a['org'] !== '' ? $a['org'] : cite_join([cite_upper($a['last']), $a['first']], ' ');
        $out['fr'] = ['note' => cite_end(cite_join([$frAuthor, $p['title'] !== '' ? '« ' . $p['title'] . ' »' : '', $site, $page, $subject !== '' ? '(' . $subject . ')' : '', $p['url'] !== '' ? 'en ligne : ' . $p['url'] : '', $p['date'] !== '' ? 'consulté le ' . $p['date'] : ''])),
            'biblio' => cite_end(cite_join([$frAuthor, $p['title'] !== '' ? '« ' . $p['title'] . ' »' : '', $site, $p['url']]))];
        $eeAuthor = $a['org'] !== '' ? $a['org'] : cite_join([$a['first'], $a['last']], ' ');
        $out['ee'] = ['note' => cite_end(cite_join([cite_join([$eeAuthor, $p['title'] !== '' ? '"' . $p['title'] . ',"' : ''], ', '), cite_join([$site, $p['url'] !== '' || $p['date'] !== '' ? '(' . cite_join([$p['url'], $p['date'] !== '' ? 'accessed ' . $p['date'] : ''], ' : ') . ')' : ''], ' '), $page, $subject], ' ')),
            'biblio' => cite_end(cite_join([$eeAuthor, $p['title'] !== '' ? '"' . $p['title'] . '."' : '', $site, $p['url']], ' '))];
        $out['chicago'] = ['note' => cite_end(cite_join([$eeAuthor, $p['title'] !== '' ? '« ' . $p['title'] . ' »' : '', $site, $page, $p['date'] !== '' ? 'consulté le ' . $p['date'] : '', $p['url']])),
            'biblio' => cite_end(cite_join([$a['org'] !== '' ? $a['org'] : cite_join([$a['last'], $a['first']]), $p['title'] !== '' ? '« ' . $p['title'] . ' »' : '', $site, $p['url']], '. '))];
        $out['forum'] = ['note' => cite_join([$subject !== '' ? cite_subject($p, true) : '', 'Source : ' . cite_join([$site, $p['title'], $page]), $p['url'] !== '' ? 'lien : ' . $p['url'] : ''], ' — '),
            'biblio' => cite_join([$site, $p['title'], $p['url']])];
    }
    foreach (CITE_STYLES as $k => $label) { $out[$k] = ['label' => $label, 'note' => (string) ($out[$k]['note'] ?? ''), 'biblio' => (string) ($out[$k]['biblio'] ?? '')]; }
    return $out;
}

/** Le service d'archives relié à une source (F14), s'il existe. */
function cite_service_of(PDO $pdo, array $src): ?array
{
    $id = (int) ($src['archive_service_id'] ?? 0);
    if (!$id || !function_exists('archive_service_row')) { return null; }
    static $cache = [];
    return $cache[$id] ??= archive_service_row($pdo, $id);
}

/** Ce que la citation dit (événement ou fiche) : ['what', 'who', 'date', 'place']. */
function cite_context(PDO $pdo, string $entityType, int $entityId): array
{
    try {
        if ($entityType === 'event' && $entityId) {
            $s = $pdo->prepare("SELECT e.date_text, t.label, pl.name AS place, p.first_name, p.last_name, f.partner1_id, f.partner2_id
                FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id LEFT JOIN persons p ON p.id=e.person_id LEFT JOIN families f ON f.id=e.family_id WHERE e.id=?");
            $s->execute([$entityId]);
            $e = $s->fetch(PDO::FETCH_ASSOC);
            if (!$e) { return []; }
            $who = trim(trim((string) $e['first_name']) . ' ' . cite_upper(trim((string) $e['last_name'])));
            if ($who === '' && ($e['partner1_id'] || $e['partner2_id'])) {
                $names = [];
                $n = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?');
                foreach ([$e['partner1_id'], $e['partner2_id']] as $pid) { if ($pid) { $n->execute([(int) $pid]); if ($r = $n->fetch(PDO::FETCH_ASSOC)) { $names[] = trim($r['first_name'] . ' ' . cite_upper((string) $r['last_name'])); } } }
                $who = implode(' et ', array_filter($names));
            }
            return ['what' => (string) $e['label'], 'who' => $who, 'date' => trim((string) $e['date_text']), 'place' => trim((string) $e['place'])];
        }
        if ($entityType === 'person' && $entityId) {
            $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?');
            $s->execute([$entityId]);
            if ($r = $s->fetch(PDO::FETCH_ASSOC)) { return ['what' => '', 'who' => trim(trim((string) $r['first_name']) . ' ' . cite_upper(trim((string) $r['last_name']))), 'date' => '', 'place' => '']; }
        }
    } catch (Throwable $_) {}
    return [];
}

/** Une citation (source + lien) prête : titre, ce qui est cité, styles. */
function cite_item(PDO $pdo, array $src, ?array $link, array $over = []): array
{
    $src['_service'] = cite_service_of($pdo, $src);
    $c = [];
    if ($link && ($link['citation_json'] ?? '') !== '') { $j = json_decode((string) $link['citation_json'], true); if (is_array($j)) { $c = $j; } }
    foreach (['archive', 'cote', 'commune', 'register', 'years', 'act'] as $k) { if (isset($over[$k]) && trim((string) $over[$k]) !== '') { $c[$k] = mb_substr(trim((string) $over[$k]), 0, 300); } }
    if (isset($over['folio']) && trim((string) $over['folio']) !== '') { $c['view'] = mb_substr(trim((string) $over['folio']), 0, 60); unset($c['view_total']); }
    $ctx = $link ? cite_context($pdo, (string) $link['entity_type'], (int) $link['entity_id']) : [];
    $ctx['page'] = $link ? (string) ($link['page'] ?? '') : '';
    if (isset($over['date']) && trim((string) $over['date']) !== '') { $ctx['act_date'] = mb_substr(trim((string) $over['date']), 0, 80); }
    if (isset($over['extra']) && trim((string) $over['extra']) !== '') { $ctx['extra'] = mb_substr(trim((string) $over['extra']), 0, 300); }
    $parts = cite_parts($src, $c, $ctx);
    return ['source_id' => (int) $src['id'], 'link_id' => $link ? (int) $link['id'] : 0, 'title' => (string) ($src['title'] ?: 'Source sans titre'),
        'where' => $link ? cite_subject(cite_parts($src, [], $ctx), true) : '', 'entity_type' => $link ? (string) $link['entity_type'] : '',
        'entity_id' => $link ? (int) $link['entity_id'] : 0, 'styles' => cite_format($parts)];
}

/** GET source_citations : une citation (link_id), une source (source_id, ses citations), ou toutes celles d'une fiche (person_id). */
function source_citations_data(PDO $pdo, array $q): array
{
    $over = array_intersect_key($q, array_flip(['archive', 'cote', 'folio', 'date', 'extra', 'commune', 'register', 'years', 'act']));
    $over = array_map(static fn($v) => is_string($v) ? safe_text($v) : '', $over);
    $items = [];
    $src = static function (int $id) use ($pdo): ?array { $s = $pdo->prepare('SELECT * FROM sources WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC); return $r ?: null; };
    if ($linkId = safe_int($q['link_id'] ?? 0)) {
        $l = $pdo->prepare('SELECT * FROM source_links WHERE id=?'); $l->execute([$linkId]); $link = $l->fetch(PDO::FETCH_ASSOC);
        if (!$link || !($s = $src((int) $link['source_record_id']))) { throw new RuntimeException('Citation introuvable.'); }
        $items[] = cite_item($pdo, $s, $link, $over);
    } elseif ($sourceId = safe_int($q['source_id'] ?? 0)) {
        if (!($s = $src($sourceId))) { throw new RuntimeException('Source introuvable.'); }
        $items[] = cite_item($pdo, $s, null, $over);
        if (empty($q['only'])) {
            $l = $pdo->prepare('SELECT * FROM source_links WHERE source_record_id=? ORDER BY id LIMIT 200'); $l->execute([$sourceId]);
            foreach ($l->fetchAll(PDO::FETCH_ASSOC) as $link) { $items[] = cite_item($pdo, $s, $link, $over); }
        }
    } elseif ($personId = safe_int($q['person_id'] ?? 0)) {
        $l = $pdo->prepare("SELECT sl.* FROM source_links sl WHERE (sl.entity_type='person' AND sl.entity_id=?)
            OR (sl.entity_type='event' AND sl.entity_id IN (SELECT id FROM events WHERE person_id=? OR family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?)))
            ORDER BY sl.id LIMIT 500");
        $l->execute([$personId, $personId, $personId, $personId]);
        foreach ($l->fetchAll(PDO::FETCH_ASSOC) as $link) { if ($s = $src((int) $link['source_record_id'])) { $items[] = cite_item($pdo, $s, $link); } }
    } else {
        throw new RuntimeException('Rien à citer : choisis une source.');
    }
    return ['items' => $items, 'styles' => CITE_STYLES];
}

/** Pour un export côté serveur : toutes les sources (une entrée de bibliographie chacune) dans un style. */
function cite_bibliography(PDO $pdo, string $style = 'fr', int $limit = 2000): array
{
    if (!isset(CITE_STYLES[$style])) { $style = 'fr'; }
    $out = [];
    foreach ($pdo->query('SELECT * FROM sources ORDER BY title COLLATE NOCASE, id LIMIT ' . max(1, min(5000, $limit))) as $s) {
        $t = cite_item($pdo, $s, null)['styles'][$style]['biblio'] ?? '';
        if ($t !== '') { $out[] = $t; }
    }
    $out = array_values(array_unique($out));
    usort($out, static fn($a, $b) => strcoll(archive_service_fold_safe($a), archive_service_fold_safe($b)));
    return $out;
}

function archive_service_fold_safe(string $s): string { return function_exists('archive_service_fold') ? archive_service_fold($s) : mb_strtolower($s); }
