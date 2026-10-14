<?php
declare(strict_types=1);

/*
 * 🎧 Audios et 🎬 Vidéos (onglet Listes) : tous les sons ou toutes les vidéos de la base, avec leur durée et ce à quoi
 * chacun est rattaché (fiche, couple, événement, source, recensement, battue, enquête, dépouillement, collections…).
 * La durée est mesurée par l'écran (le navigateur lit l'en-tête du fichier) puis gardée (media.duration_seconds, n°25).
 * Écran : assets/js/heritage-av.js.
 */

const MEDIA_AV_COLLECTIONS = ['family_object' => 'Objet de famille', 'family_memory' => 'Mémoire familiale', 'voyage' => 'Départ, émigration', 'placement' => 'Enfant placé',
    'coat_of_arms' => 'Armoiries', 'family_paper' => 'Papier de famille', 'old_map' => 'Carte ancienne', 'probate_inventory' => 'Inventaire après décès', 'poilu' => 'Poilu',
    'resistance' => 'Résistant', 'custom_block_entry' => 'Bloc', 'village' => 'Village', 'voter' => 'Carte d’électeur', 'custom_list_record' => 'Liste', 'atelier_item' => 'Atelier', 'recueil' => 'Recueil', 'family_booklet' => 'Livret de famille'];

function media_av_name(?array $p): string
{
    return $p ? trim(($p['first_name'] ?? '') . ' ' . ($p['last_name'] ?? '')) : '';
}

function media_av_list(PDO $pdo, string $kind): array
{
    $kind = $kind === 'video' ? 'video' : 'audio';
    $s = $pdo->prepare('SELECT id, title, description, filename, date_text, created_at, duration_seconds FROM media WHERE media_type=? ORDER BY id DESC');
    $s->execute([$kind]);
    $items = $s->fetchAll();
    if (!$items) { return ['kind' => $kind, 'items' => []]; }
    $ids = array_map(static fn($r) => (int) $r['id'], $items);
    $in = implode(',', $ids);
    $owners = [];
    $add = static function (int $mid, array $o) use (&$owners): void { foreach ($owners[$mid] ?? [] as $x) { if ($x['type'] === $o['type'] && $x['name'] === $o['name']) { return; } } $owners[$mid][] = $o; };
    $safe = static function (callable $fn): void { try { $fn(); } catch (Throwable $_) {} }; // une table absente d'une vieille base ne bloque pas la liste
    // Fiches, couples, événements, sources, recensements, service militaire, battues
    $links = $pdo->query("SELECT media_id, entity_type, entity_id FROM media_links WHERE media_id IN ($in)")->fetchAll();
    $byType = [];
    foreach ($links as $l) { $byType[$l['entity_type']][] = (int) $l['entity_id']; }
    $people = [];
    $personIds = $byType['person'] ?? [];
    $fam = [];
    $safe(function () use ($pdo, $byType, &$fam, &$personIds) { if (!empty($byType['family'])) { foreach ($pdo->query('SELECT id, partner1_id, partner2_id FROM families WHERE id IN (' . implode(',', array_map('intval', $byType['family'])) . ')') as $f) { $fam[(int) $f['id']] = $f; array_push($personIds, (int) $f['partner1_id'], (int) $f['partner2_id']); } } });
    $ev = [];
    $safe(function () use ($pdo, $byType, &$ev, &$personIds) { if (!empty($byType['event'])) { foreach ($pdo->query('SELECT e.id, e.person_id, e.family_id, e.year, e.date_text, t.label, f.partner1_id, f.partner2_id FROM events e LEFT JOIN event_types t ON t.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id WHERE e.id IN (' . implode(',', array_map('intval', $byType['event'])) . ')') as $e) { $ev[(int) $e['id']] = $e; array_push($personIds, (int) $e['person_id'], (int) $e['partner1_id'], (int) $e['partner2_id']); } } });
    if ($personIds) { $people = collection_people($pdo, array_filter($personIds)); }
    $src = []; $cens = []; $bat = [];
    $safe(function () use ($pdo, $byType, &$src) { if (!empty($byType['source'])) { foreach ($pdo->query('SELECT id, title FROM sources WHERE id IN (' . implode(',', array_map('intval', $byType['source'])) . ')') as $r) { $src[(int) $r['id']] = (string) $r['title']; } } });
    $safe(function () use ($pdo, $byType, &$cens) { if (!empty($byType['census'])) { foreach ($pdo->query('SELECT c.id, c.year, p.name FROM census_records c LEFT JOIN places p ON p.id=c.place_id WHERE c.id IN (' . implode(',', array_map('intval', $byType['census'])) . ')') as $r) { $cens[(int) $r['id']] = trim(($r['year'] ?? '') . ' ' . ($r['name'] ?? '')); } } });
    $safe(function () use ($pdo, $byType, &$bat) { if (!empty($byType['battue_item'])) { foreach ($pdo->query('SELECT i.id, b.id AS battue_id, b.title FROM battue_search_items i JOIN battues b ON b.id=i.battue_id WHERE i.id IN (' . implode(',', array_map('intval', $byType['battue_item'])) . ')') as $r) { $bat[(int) $r['id']] = ['id' => (int) $r['battue_id'], 'title' => (string) $r['title']]; } } });
    foreach ($links as $l) {
        $mid = (int) $l['media_id']; $eid = (int) $l['entity_id'];
        switch ($l['entity_type']) {
            case 'person': if (isset($people[$eid])) { $add($mid, ['type' => 'person', 'label' => 'Fiche', 'name' => media_av_name($people[$eid]), 'person_id' => $eid]); } break;
            case 'family': $f = $fam[$eid] ?? null; if ($f) { $add($mid, ['type' => 'family', 'label' => 'Couple', 'name' => implode(' et ', array_filter([media_av_name($people[(int) $f['partner1_id']] ?? null), media_av_name($people[(int) $f['partner2_id']] ?? null)])), 'person_id' => (int) ($f['partner1_id'] ?: $f['partner2_id'])]); } break;
            case 'event': $e = $ev[$eid] ?? null; if ($e) { $pid = (int) ($e['person_id'] ?: $e['partner1_id'] ?: $e['partner2_id']); $who = $e['person_id'] ? media_av_name($people[(int) $e['person_id']] ?? null) : implode(' et ', array_filter([media_av_name($people[(int) $e['partner1_id']] ?? null), media_av_name($people[(int) $e['partner2_id']] ?? null)]));
                $add($mid, ['type' => 'event', 'label' => 'Événement', 'name' => trim(($e['label'] ?: 'Événement') . ($who ? ' de ' . $who : '') . (($e['date_text'] ?: $e['year']) ? ' (' . ($e['date_text'] ?: $e['year']) . ')' : '')), 'person_id' => $pid]); } break;
            case 'source': $add($mid, ['type' => 'source', 'label' => 'Source', 'name' => $src[$eid] ?? 'Source']); break;
            case 'census': $add($mid, ['type' => 'census', 'label' => 'Recensement', 'name' => $cens[$eid] ?? 'Recensement']); break;
            case 'military': $add($mid, ['type' => 'military', 'label' => 'Service militaire', 'name' => 'Service militaire']); break;
            case 'battue_item': $b = $bat[$eid] ?? null; $add($mid, ['type' => 'battue', 'label' => 'Battue', 'name' => $b['title'] ?? 'Battue', 'battue_id' => $b['id'] ?? 0]); break;
        }
    }
    // Enquêtes, dépouillements d'archives
    $safe(function () use ($pdo, $in, $add) { foreach ($pdo->query("SELECT m.media_id, i.id, i.title FROM investigation_media m JOIN investigations i ON i.id=m.investigation_id WHERE m.media_id IN ($in)") as $r) { $add((int) $r['media_id'], ['type' => 'investigation', 'label' => 'Enquête', 'name' => (string) $r['title'], 'investigation_id' => (int) $r['id']]); } });
    $safe(function () use ($pdo, $in, $add) { foreach ($pdo->query("SELECT m.media_id, d.city_name, d.record_type, d.year_text FROM archive_digest_media m JOIN archive_digest_entries d ON d.id=m.archive_digest_id WHERE m.media_id IN ($in)") as $r) { $add((int) $r['media_id'], ['type' => 'digest', 'label' => 'Dépouillement', 'name' => trim(implode(' ', array_filter([(string) $r['record_type'], (string) $r['city_name'], (string) $r['year_text']])))]); } });
    // Collections (objets, souvenirs, blocs, listes, atelier…)
    $safe(function () use ($pdo, $in, $add) {
        foreach ($pdo->query("SELECT media_id, collection_type, collection_id FROM family_collection_media WHERE media_id IN ($in)") as $r) {
            $type = (string) $r['collection_type']; $cid = (int) $r['collection_id']; $name = ''; $extra = [];
            try {
                if ($type === 'family_object') { $q = $pdo->prepare('SELECT title FROM family_objects WHERE id=?'); $q->execute([$cid]); $name = (string) $q->fetchColumn(); }
                if ($type === 'family_memory') { $q = $pdo->prepare('SELECT title FROM family_memories WHERE id=?'); $q->execute([$cid]); $name = (string) $q->fetchColumn(); }
                if ($type === 'atelier_item') { $q = $pdo->prepare('SELECT i.title, i.project_id, p.title AS project FROM atelier_items i JOIN atelier_projects p ON p.id=i.project_id WHERE i.id=?'); $q->execute([$cid]); $a = $q->fetch(); if ($a) { $name = $a['project'] . ' › ' . $a['title']; $extra = ['atelier_project' => (int) $a['project_id'], 'atelier_item' => $cid]; } }
                if ($type === 'recueil') { $q = $pdo->prepare('SELECT title FROM recueils WHERE id=?'); $q->execute([$cid]); $name = (string) $q->fetchColumn(); $extra = ['recueil_id' => $cid]; }
                if ($type === 'custom_list_record') { $q = $pdo->prepare('SELECT l.name, l.id FROM custom_list_records r JOIN custom_lists l ON l.id=r.list_id WHERE r.id=?'); $q->execute([$cid]); $a = $q->fetch(); if ($a) { $name = (string) $a['name']; $extra = ['list_id' => (int) $a['id']]; } }
            } catch (Throwable $_) {}
            $add((int) $r['media_id'], ['type' => 'collection', 'label' => MEDIA_AV_COLLECTIONS[$type] ?? 'Collection', 'name' => $name ?: (MEDIA_AV_COLLECTIONS[$type] ?? 'Collection')] + $extra);
        }
    });
    $versions = [];
    $safe(function () use ($pdo, $in, &$versions) { foreach ($pdo->query("SELECT media_id, COUNT(*) AS n, MAX(CASE WHEN is_original=1 THEN filename ELSE '' END) AS original FROM media_versions WHERE media_id IN ($in) GROUP BY media_id") as $v) { $versions[(int) $v['media_id']] = ['n' => (int) $v['n'], 'original' => (string) $v['original']]; } });
    foreach ($items as &$r) {
        $r['id'] = (int) $r['id'];
        $r['duration'] = $r['duration_seconds'] !== null ? (float) $r['duration_seconds'] : null; unset($r['duration_seconds']);
        $path = MEDIA_DIR . '/' . basename((string) $r['filename']);
        $r['exists'] = $r['filename'] !== '' && is_file($path);
        $r['size'] = $r['exists'] ? (int) filesize($path) : 0;
        $r['owners'] = $owners[$r['id']] ?? [];
        $r['format'] = strtoupper(pathinfo((string) $r['filename'], PATHINFO_EXTENSION));
        $v = $versions[$r['id']] ?? null; // l'original, quand c'est une version modifiée qui est montrée
        $r['versions'] = $v ? $v['n'] : 0;
        $r['original'] = $v && $v['original'] !== '' && $v['original'] !== $r['filename'] && is_file(MEDIA_DIR . '/' . basename($v['original'])) ? $v['original'] : '';
        $r['original_format'] = $r['original'] !== '' ? strtoupper(pathinfo($r['original'], PATHINFO_EXTENSION)) : '';
    }
    unset($r);
    return ['kind' => $kind, 'items' => $items];
}

/** Durées mesurées par l'écran : {id: secondes}. Seulement des sons et des vidéos, et des nombres sensés. */
function save_media_durations(PDO $pdo, array $data): array
{
    $n = 0;
    $upd = $pdo->prepare("UPDATE media SET duration_seconds=? WHERE id=? AND media_type IN ('audio','video')");
    foreach (array_slice(is_array($data['durations'] ?? null) ? $data['durations'] : [], 0, 5000, true) as $id => $sec) {
        if (!is_numeric($sec) || (float) $sec <= 0 || (float) $sec > 360000) { continue; }
        $upd->execute([round((float) $sec, 2), (int) $id]); $n += $upd->rowCount();
    }
    return ['saved' => $n];
}
