<?php
declare(strict_types=1);

/**
 * 📒 Fiches (onglet « Fiches », masqué au départ) : une page sur un sujet — « La Pologne avant les guerres
 * napoléoniennes », un métier, un lieu… — faite de blocs rangés sur une grille : texte, images et documents,
 * personnes, frise de dates, citation, liens, intertitre, et tout ce que l'app sait montrer (écrans, listes,
 * Mes listes, widgets et statistiques à soi). Table topic_sheets (structure n°42) ; les images sont des médias
 * rattachés à la fiche (family_collection_media, type « topic_sheet », rôle = le bloc).
 */

const TOPIC_BLOCK_TYPES = ['text', 'images', 'people', 'dates', 'quote', 'links', 'divider', 'screen', 'widget', 'diagram'];
const TOPIC_WIDTHS = ['3', '4', '6', '8', '9', '12'];

function topic_text($v, int $max): string
{
    return mb_substr(trim(str_replace("\r", '', (string) (is_scalar($v) ? $v : ''))), 0, $max);
}

/** Un bloc remis d'aplomb (ce qui n'est pas prévu est laissé de côté) */
function topic_clean_block($b): ?array
{
    if (!is_array($b) || !in_array($b['type'] ?? '', TOPIC_BLOCK_TYPES, true)) { return null; }
    $id = (string) ($b['id'] ?? '');
    if (!preg_match('/^b_[a-z0-9]{3,24}$/', $id)) { $id = 'b_' . bin2hex(random_bytes(5)); }
    $color = (string) ($b['color'] ?? '');
    $out = ['id' => $id, 'type' => $b['type'], 'title' => topic_text($b['title'] ?? '', 200),
        'width' => in_array((string) ($b['width'] ?? ''), TOPIC_WIDTHS, true) ? (string) $b['width'] : '12',
        'color' => preg_match('/^#[0-9a-f]{6}$/i', $color) ? $color : ''];
    switch ($b['type']) {
        case 'text': $out['text'] = topic_text($b['text'] ?? '', 60000); break;
        case 'quote': $out['text'] = topic_text($b['text'] ?? '', 8000); $out['source'] = topic_text($b['source'] ?? '', 400); break;
        case 'images': $out['layout'] = in_array($b['layout'] ?? '', ['grid', 'large', 'strip'], true) ? $b['layout'] : 'grid'; $out['caption'] = topic_text($b['caption'] ?? '', 1000); break;
        case 'people':
            $out['ids'] = array_values(array_unique(array_filter(array_map('intval', array_slice(is_array($b['ids'] ?? null) ? $b['ids'] : [], 0, 300)))));
            $out['note'] = topic_text($b['note'] ?? '', 2000); break;
        case 'dates':
            $rows = [];
            foreach (array_slice(is_array($b['rows'] ?? null) ? $b['rows'] : [], 0, 400) as $r) {
                if (!is_array($r)) { continue; }
                $d = topic_text($r['date'] ?? '', 60); $t = topic_text($r['text'] ?? '', 1000);
                if ($d !== '' || $t !== '') { $rows[] = ['date' => $d, 'text' => $t]; }
            }
            $out['rows'] = $rows; break;
        case 'links':
            $rows = [];
            foreach (array_slice(is_array($b['rows'] ?? null) ? $b['rows'] : [], 0, 200) as $r) {
                if (!is_array($r)) { continue; }
                $u = topic_text($r['url'] ?? '', 1500);
                if ($u !== '' && !preg_match('#^https?://#i', $u)) { continue; } // seulement des adresses web
                $l = topic_text($r['label'] ?? '', 200);
                if ($u !== '' || $l !== '') { $rows[] = ['label' => $l, 'url' => $u, 'note' => topic_text($r['note'] ?? '', 500)]; }
            }
            $out['rows'] = $rows; break;
        case 'screen':
            $t = topic_text($b['target'] ?? '', 200);
            $out['target'] = preg_match('/^[a-z_]+:[A-Za-z0-9_:.\-]{1,160}$/', $t) ? $t : 'module:carte';
            $out['height'] = max(240, min(2000, (int) ($b['height'] ?? 560)));
            $out['sidebar'] = !empty($b['sidebar']);
            $out['personName'] = topic_text($b['personName'] ?? '', 200);
            foreach (['layout'] as $k) { if (isset($b[$k]) && is_array($b[$k])) { $j = json_encode($b[$k]); if ($j !== false && strlen($j) < 4000) { $out[$k] = $b[$k]; } } }
            break;
        case 'diagram':
            $out['diagram'] = max(0, (int) ($b['diagram'] ?? 0)); break;
        case 'widget':
            $w = (string) ($b['widget'] ?? '');
            $out['widget'] = preg_match('/^cw_[a-z0-9]{4,24}$/', $w) ? $w : ''; break;
    }
    return $out;
}

function topic_sheets_list(PDO $pdo): array
{
    $rows = array_values(array_filter($pdo->query('SELECT id, title, subtitle, icon, color, data_json, updated_at FROM topic_sheets ORDER BY title COLLATE NOCASE, id')->fetchAll(),
        static fn($r) => empty((json_decode((string) $r['data_json'], true) ?: [])['template'])));
    $media = heritage_media($pdo, 'topic_sheet', array_column($rows, 'id'));
    return array_map(static function ($r) use ($media) {
        $d = json_decode((string) $r['data_json'], true) ?: [];
        return ['id' => (int) $r['id'], 'title' => $r['title'], 'subtitle' => $r['subtitle'], 'icon' => $r['icon'], 'color' => $r['color'],
            'blocks' => count($d['blocks'] ?? []), 'cover' => topic_sheet_cover($media[(int) $r['id']] ?? []), 'updated_at' => $r['updated_at']];
    }, $rows);
}

/** Vignette d'une fiche : l'image de couverture choisie (⚙️ La fiche), sinon sa première image */
function topic_sheet_cover(array $media): ?array
{
    foreach ($media as $m) { if (($m['role'] ?? '') === 'cover') { return $m; } }
    foreach ($media as $m) { if (($m['media_type'] ?? '') === 'image') { return $m; } }
    return $media[0] ?? null;
}

/** ⭐ Les modèles de fiche (des fiches marquées « template », rangées à part) : leurs blocs servent à créer des fiches construites pareil */
function topic_sheet_templates(PDO $pdo): array
{
    $out = [];
    foreach ($pdo->query('SELECT id, title, subtitle, icon, color, data_json, updated_at FROM topic_sheets ORDER BY title COLLATE NOCASE, id') as $r) {
        $d = json_decode((string) $r['data_json'], true) ?: [];
        if (empty($d['template'])) { continue; }
        $out[] = ['id' => (int) $r['id'], 'title' => $r['title'], 'subtitle' => $r['subtitle'], 'icon' => $r['icon'], 'color' => $r['color'],
            'blocks' => array_values(array_filter(array_map('topic_clean_block', is_array($d['blocks'] ?? null) ? $d['blocks'] : []))), 'updated_at' => $r['updated_at']];
    }
    return $out;
}

function topic_sheet_detail(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM topic_sheets WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Fiche introuvable.'); }
    $d = json_decode((string) $r['data_json'], true) ?: [];
    $blocks = array_values(array_filter(array_map('topic_clean_block', is_array($d['blocks'] ?? null) ? $d['blocks'] : [])));
    // les personnes des blocs « Personnes » : nom, dates, portrait
    $ids = [];
    foreach ($blocks as $b) { if ($b['type'] === 'people') { $ids = array_merge($ids, $b['ids']); } }
    $people = [];
    if ($ids) {
        $in = implode(',', array_map('intval', array_unique($ids)));
        foreach ($pdo->query("SELECT p.id, p.first_name, p.last_name, p.gender, p.occupation,
                (SELECT min(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM')) AS birth_year,
                (SELECT min(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI')) AS death_year
            FROM persons p WHERE p.id IN ($in)") as $p) { $people[(int) $p['id']] = $p; }
    }
    return ['id' => (int) $r['id'], 'title' => $r['title'], 'subtitle' => $r['subtitle'], 'icon' => $r['icon'], 'color' => $r['color'],
        'template' => !empty($d['template']), 'blocks' => $blocks, 'people' => $people, 'media' => heritage_media($pdo, 'topic_sheet', [$id])[$id] ?? [], 'created_at' => $r['created_at'], 'updated_at' => $r['updated_at']];
}

function save_topic_sheet(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $title = topic_text($data['title'] ?? '', 200);
    if ($title === '') { throw new RuntimeException('Donne un titre à la fiche.'); }
    $icon = topic_text($data['icon'] ?? '📒', 16) ?: '📒';
    $color = preg_match('/^#[0-9a-f]{6}$/i', (string) ($data['color'] ?? '')) ? (string) $data['color'] : '';
    $blocks = array_values(array_filter(array_map('topic_clean_block', array_slice(is_array($data['blocks'] ?? null) ? $data['blocks'] : [], 0, 300))));
    $template = !empty($data['template']);
    if ($id) { // une fiche garde ce qu'elle est (fiche ou modèle)
        $s = $pdo->prepare('SELECT data_json FROM topic_sheets WHERE id=?'); $s->execute([$id]);
        $template = !empty((json_decode((string) $s->fetchColumn(), true) ?: [])['template']);
    }
    $json = json_encode(['blocks' => $blocks] + ($template ? ['template' => true] : []), JSON_UNESCAPED_UNICODE);
    $subtitle = topic_text($data['subtitle'] ?? '', 600);
    if ($id) {
        $s = $pdo->prepare('UPDATE topic_sheets SET title=?, subtitle=?, icon=?, color=?, data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
        $s->execute([$title, $subtitle, $icon, $color, $json, $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Fiche introuvable.'); }
    } else {
        $pdo->prepare('INSERT INTO topic_sheets(title, subtitle, icon, color, data_json) VALUES(?,?,?,?,?)')->execute([$title, $subtitle, $icon, $color, $json]);
        $id = (int) $pdo->lastInsertId();
    }
    // les images des blocs supprimés ne restent pas rattachées à la fiche
    $keep = array_column(array_filter($blocks, static fn($b) => $b['type'] === 'images'), 'id');
    $del = $pdo->prepare("DELETE FROM family_collection_media WHERE collection_type='topic_sheet' AND collection_id=? AND role<>'' AND role LIKE 'b\\_%' ESCAPE '\\'" . ($keep ? ' AND role NOT IN (' . implode(',', array_fill(0, count($keep), '?')) . ')' : ''));
    $del->execute([$id, ...$keep]);
    log_change($pdo, 'meta', 0, ($data['id'] ?? 0) ? 'update' : 'create', ($template ? 'Modèle de fiche enregistré : ' : 'Fiche enregistrée : ') . $title);
    return ['id' => $id, 'title' => $title];
}

function delete_topic_sheet(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT title FROM topic_sheets WHERE id=?'); $s->execute([$id]);
    $title = $s->fetchColumn();
    if ($title === false) { throw new RuntimeException('Fiche introuvable.'); }
    heritage_delete_media_links($pdo, 'topic_sheet', $id);
    $pdo->prepare('DELETE FROM topic_sheets WHERE id=?')->execute([$id]);
    log_change($pdo, 'meta', 0, 'delete', 'Fiche supprimée : ' . $title);
    return ['ok' => true];
}
