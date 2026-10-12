<?php
declare(strict_types=1);

/**
 * 🗳️ Cartes d'électeur (bloc à cocher sur la fiche, structure n°19) : les cartes (commune, bureau, numéros,
 * ce qui est écrit dessus), les dates où la personne a voté (cases tamponnées), photos recto / verso.
 * Liste « Cartes d'électeur » : toutes les cartes de la famille, et le droit de vote dans le monde
 * (assets/data/suffrage.json, carte assets/data/world-110m.json).
 */

const VOTE_ELECTIONS = ['presidentielle' => 'Présidentielle', 'legislatives' => 'Législatives', 'municipales' => 'Municipales', 'cantonales' => 'Cantonales / départementales',
    'regionales' => 'Régionales', 'europeennes' => 'Européennes', 'referendum' => 'Référendum', 'plebiscite' => 'Plébiscite', 'senatoriales' => 'Sénatoriales (grands électeurs)',
    'prudhomales' => 'Prud’homales', 'professionnelles' => 'Élections professionnelles (chambres, sécurité sociale…)', 'autre' => 'Autre'];

const VOTER_CARD_FIELDS = ['commune', 'country', 'issued', 'valid_from', 'valid_to', 'card_number', 'list_number', 'bureau', 'bureau_address', 'address', 'written_name', 'written_birth', 'occupation', 'reason', 'source', 'note'];

function voter_year(string $date): ?int
{
    return preg_match('/\b(1[6-9]\d\d|20\d\d)\b/', $date, $m) ? (int) $m[1] : null;
}

function voter_data(PDO $pdo, int $personId): array
{
    $c = $pdo->prepare('SELECT * FROM voter_cards WHERE person_id=? ORDER BY position, id'); $c->execute([$personId]);
    $v = $pdo->prepare("SELECT * FROM voter_votes WHERE person_id=? ORDER BY year IS NULL, year, position, id"); $v->execute([$personId]);
    $votes = array_map(static fn($r) => $r + ['election_label' => VOTE_ELECTIONS[$r['election']] ?? ($r['election'] ?: 'Vote')], $v->fetchAll());
    $media = $media0 = heritage_media($pdo, 'voter', [$personId])[$personId] ?? [];
    // Médias de la fiche déjà notés « Carte d'électeur » (Nature du média), sans doublon
    $seen = array_fill_keys(array_map(static fn($m) => (int) $m['id'], $media0), true);
    $l = $pdo->prepare("SELECT m.id, m.title, m.filename, m.thumbnail, m.media_type, 'fiche' AS role FROM media_links ml JOIN media m ON m.id=ml.media_id WHERE ml.entity_type='person' AND ml.entity_id=? AND m.media_subject_type='voter_card' ORDER BY ml.position, m.id");
    $l->execute([$personId]);
    foreach ($l->fetchAll() as $m) { if (!isset($seen[(int) $m['id']])) { $media[] = $m; $seen[(int) $m['id']] = true; } }
    return ['cards' => $c->fetchAll(), 'votes' => $votes, 'media' => $media, 'labels' => collection_labels($pdo, 'voter', [$personId])[$personId] ?? [], 'elections' => VOTE_ELECTIONS];
}

/** Toutes les cartes et tous les votes d'une fiche, en une fois (comme le parcours de résistant). */
function save_voter_cards(PDO $pdo, array $data): array
{
    $personId = safe_int($data['person_id'] ?? 0);
    $chk = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $chk->execute([$personId]);
    if (!$chk->fetchColumn()) { throw new RuntimeException('Personne introuvable.'); }
    $pdo->prepare('DELETE FROM voter_cards WHERE person_id=?')->execute([$personId]);
    $pdo->prepare('DELETE FROM voter_votes WHERE person_id=?')->execute([$personId]);
    $insC = $pdo->prepare('INSERT INTO voter_cards(person_id, lat, lon, position, ' . implode(', ', VOTER_CARD_FIELDS) . ') VALUES(?,?,?,?' . str_repeat(',?', count(VOTER_CARD_FIELDS)) . ')');
    $n = 0;
    foreach ((array) ($data['cards'] ?? []) as $card) {
        if (!is_array($card)) { continue; }
        $vals = array_map(static fn($f) => mb_substr(trim((string) ($card[$f] ?? '')), 0, $f === 'note' ? 4000 : 300), VOTER_CARD_FIELDS);
        if (!array_filter($vals, static fn($x) => $x !== '')) { continue; }
        $lat = is_numeric($card['lat'] ?? null) ? (float) $card['lat'] : null; $lon = is_numeric($card['lon'] ?? null) ? (float) $card['lon'] : null;
        $insC->execute([$personId, $lat, $lon, $n++, ...$vals]);
    }
    $insV = $pdo->prepare('INSERT INTO voter_votes(person_id, date_text, year, election, round, place_text, stamp, note, position) VALUES(?,?,?,?,?,?,?,?,?)');
    $k = 0;
    foreach ((array) ($data['votes'] ?? []) as $vote) {
        if (!is_array($vote)) { continue; }
        $date = mb_substr(trim((string) ($vote['date_text'] ?? '')), 0, 60);
        $election = array_key_exists((string) ($vote['election'] ?? ''), VOTE_ELECTIONS) ? (string) $vote['election'] : '';
        $place = mb_substr(trim((string) ($vote['place_text'] ?? '')), 0, 200);
        $stamp = mb_substr(trim((string) ($vote['stamp'] ?? '')), 0, 200);
        $note = mb_substr(trim((string) ($vote['note'] ?? '')), 0, 2000);
        if ($date === '' && $election === '' && $place === '' && $note === '') { continue; }
        $round = in_array((int) ($vote['round'] ?? 0), [1, 2], true) ? (int) $vote['round'] : 0;
        $insV->execute([$personId, $date, voter_year($date), $election, $round, $place, $stamp, $note, $k++]);
    }
    if ($n || $k) { $pdo->prepare('UPDATE persons SET show_voter_block=1 WHERE id=?')->execute([$personId]); }
    log_change($pdo, 'person', $personId, 'update', 'Cartes d’électeur : ' . $n . ' carte(s), ' . $k . ' vote(s)');
    return ['cards' => $n, 'votes' => $k];
}

function clear_voter_cards(PDO $pdo, array $data): array
{
    $personId = safe_int($data['person_id'] ?? 0);
    $pdo->prepare('DELETE FROM voter_cards WHERE person_id=?')->execute([$personId]);
    $pdo->prepare('DELETE FROM voter_votes WHERE person_id=?')->execute([$personId]);
    heritage_delete_media_links($pdo, 'voter', $personId);
    log_change($pdo, 'person', $personId, 'update', 'Cartes d’électeur effacées');
    return ['ok' => true];
}

/** Liste : chaque électeur de la famille, ses cartes et ses votes. */
function voter_overview(PDO $pdo): array
{
    $ids = $pdo->query("SELECT person_id FROM voter_cards UNION SELECT person_id FROM voter_votes UNION SELECT id FROM persons WHERE show_voter_block=1
        UNION SELECT ml.entity_id FROM media_links ml JOIN media m ON m.id=ml.media_id WHERE ml.entity_type='person' AND m.media_subject_type='voter_card'")->fetchAll(PDO::FETCH_COLUMN);
    $people = collection_people($pdo, $ids);
    $out = [];
    foreach ($people as $id => $p) {
        $d = voter_data($pdo, (int) $id);
        $years = array_values(array_filter(array_merge(array_column($d['votes'], 'year'), array_map(static fn($c) => voter_year($c['issued'] ?: $c['valid_from']), $d['cards']))));
        $out[] = ['person' => $p, 'cards' => $d['cards'], 'votes' => $d['votes'], 'media' => $d['media'], 'labels' => $d['labels'],
            'first' => $years ? min($years) : null, 'last' => $years ? max($years) : null, 'communes' => array_values(array_unique(array_filter(array_column($d['cards'], 'commune'))))];
    }
    usort($out, static fn($a, $b) => ($a['first'] ?? 9999) <=> ($b['first'] ?? 9999) ?: strcmp((string) $a['person']['last_name'], (string) $b['person']['last_name']));
    return $out;
}
