<?php
declare(strict_types=1);

/**
 * 🤖 L'assistant IA (maquette validée : docs/design/assistant-ia.html ; écran : assets/js/heritage-assistant-ia.js).
 *
 * Trois choses, toutes avec l'IA LOCALE (Ollama sur cet ordinateur, le même que pour la lecture approfondie des actes :
 * lib/transcription_actes.php, tx_deep_*) — rien ne part sur Internet, sauf la recherche Open Archives du généalogiste
 * (désactivable), comme dans « Où chercher ? » :
 *  - 🤖 Assistant : une conversation libre sur l'arbre. L'IA NE LIT JAMAIS LA BASE : elle appelle des « outils » que l'app
 *    exécute (chercher des personnes, lire une fiche, une source, les ancêtres, une question déjà comprise par l'app
 *    — lib/question_famille.php, lib/question_plus.php via ask_question —, « Que manque-t-il ? », le Contrôle, les bases
 *    installées comme Décès INSEE), par l'appel d'outils de l'API de chat d'Ollama, ou un protocole JSON simple si le modèle
 *    ne le gère pas. L'app vérifie chaque renvoi ([fiche N], [source N]) : un renvoi inventé est retiré et signalé, une
 *    phrase qui affirme sans renvoi (ou avec une année que la fiche n'a pas) est marquée « supposé » (en jaune à l'écran).
 *  - 🕵️ Généalogiste IA (depuis une fiche) : les trous de la fiche, un plan de recherche (sur l'ordinateur, puis 🌐 Open
 *    Archives), les pistes avec leur preuve et leur niveau de confiance. Les pistes trouvées sont celles des « Pistes à
 *    vérifier » (lib/pistes_auto.php) : ✓ Rattacher et ↶ y sont repris.
 *  - ✍️ Récit de vie par l'IA : à partir de la fiche et de la biographie de l'app (lib/biographie.php) ; on peut le ranger
 *    dans une note « 📖 Biographie à relire » (jamais à la place de la biographie de l'app).
 * Actions proposées : AJOUTER seulement (un événement « à vérifier », une note, une source, une ligne du journal des
 * recherches), après « voici exactement ce qui sera écrit », avec ↶ Annuler (table aia_adds). Jamais corriger ni supprimer.
 * Vie privée : une fiche vivante, probablement vivante ou confidentielle n'est jamais transmise au modèle au-delà de
 * « personne vivante » (df_hidden_people, la règle de l'export « Pour partager ») ; leurs noms sont aussi retirés des
 * textes (question posée, réponses de l'app). Les événements 🔒 ne sont pas transmis.
 * Les conversations sont gardées sur l'ordinateur, dans le dossier des données (DATA_DIR/assistant-ia/), jamais dans la base
 * ni dans les sauvegardes ; « 🗑 Effacer ». Le journal des envois (DATA_DIR/assistant-ia/envois.json) dit ce qui est parti
 * sur Internet (ici : seulement les recherches Open Archives).
 *
 *  GET  aia_status&model=   · aia_convs · aia_conv&id= · aia_source&id= · aia_log
 *  POST aia_chat_start {question, conv_id?, person_id?, model, keep} · aia_gen_start {person_id, model, openarch, keep}
 *       aia_recit_start {person_id, model, keep} · aia_step {conv_id, openarch} · aia_apply {conv_id, proposal, fields} → {batch}
 *       aia_undo {batch} · aia_proposal_mark {conv_id, proposal, status} · aia_conv_delete {id} · aia_convs_clear · aia_log_clear
 * Essais : LCNDA_OLLAMA_URL (un faux Ollama), GENEALOGY_TEST=1 + LCNDA_TEST_OPENARCH_DIR (Open Archives enregistré).
 */

const AIA_MAX_ROUNDS = 6;
const AIA_TIMEOUT = 600;

/* ═════════════════════ rangement : conversations et journal, sur l'ordinateur ═════════════════════ */

function aia_dir(): string
{
    $d = DATA_DIR . '/assistant-ia';
    if (!is_dir($d)) { @mkdir($d . '/conversations', 0700, true); }
    if (!is_dir($d . '/conversations')) { @mkdir($d . '/conversations', 0700, true); }
    return $d;
}
function aia_conv_path(string $id): string
{
    if (!preg_match('/^[a-f0-9]{16}$/', $id)) { throw new LcndaBadInput(i18n_t('Conversation inconnue.')); }
    return aia_dir() . '/conversations/' . $id . '.json';
}
function aia_conv_get(string $id): array
{
    $f = aia_conv_path($id);
    $c = is_file($f) ? json_decode((string) file_get_contents($f), true) : null;
    if (!is_array($c)) { throw new LcndaBadInput(i18n_t('Cette conversation n’existe plus.')); }
    return $c;
}
function aia_conv_save(array $c): void
{
    $c['updated'] = date('c');
    $f = aia_conv_path((string) $c['id']);
    @file_put_contents($f . '.tmp', json_encode($c, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    @chmod($f . '.tmp', 0600);
    @rename($f . '.tmp', $f);
}
function aia_conv_new(string $kind, string $title, int $pid, string $model, bool $keep): array
{
    // les conversations « à ne pas garder » (réglage) partent d'elles-mêmes après 12 heures
    foreach (glob(aia_dir() . '/conversations/*.json') ?: [] as $f) {
        if (filemtime($f) < time() - 43200) { $j = json_decode((string) @file_get_contents($f), true); if (is_array($j) && !empty($j['temp'])) { @unlink($f); } }
    }
    return ['id' => bin2hex(random_bytes(8)), 'kind' => $kind, 'title' => mb_substr($title, 0, 120), 'person_id' => $pid, 'model' => $model, 'proto' => 'tools',
        'temp' => !$keep, 'created' => date('c'), 'updated' => date('c'), 'turns' => [], 'seen' => ['p' => [], 's' => []], 'proposals' => []];
}
/** GET aia_convs : « 🤖 Mes conversations » (les plus récentes d'abord) */
function aia_convs(): array
{
    $out = [];
    foreach (glob(aia_dir() . '/conversations/*.json') ?: [] as $f) {
        $j = json_decode((string) @file_get_contents($f), true);
        if (!is_array($j) || !empty($j['temp'])) { continue; }
        $out[] = ['id' => (string) $j['id'], 'kind' => (string) $j['kind'], 'title' => (string) $j['title'], 'person_id' => (int) ($j['person_id'] ?? 0), 'turns' => count($j['turns'] ?? []), 'updated' => (string) ($j['updated'] ?? '')];
    }
    usort($out, static fn($a, $b) => strcmp($b['updated'], $a['updated']));
    return ['rows' => array_slice($out, 0, 200), 'total' => count($out), 'folder' => i18n_t('dossier des données, sous « assistant-ia » (jamais dans la base ni dans les sauvegardes)')];
}
function aia_log_path(): string { return aia_dir() . '/envois.json'; }
function aia_log_read(): array { $j = json_decode((string) @file_get_contents(aia_log_path()), true); return is_array($j) ? $j : []; }
/** une ligne du journal des envois : ce qui est parti sur Internet, et où */
function aia_log_add(string $host, string $what, int $pid): void
{
    $l = aia_log_read();
    array_unshift($l, ['at' => date('c'), 'host' => $host, 'what' => mb_substr($what, 0, 200), 'person_id' => $pid, 'living' => 0]);
    @file_put_contents(aia_log_path(), json_encode(array_slice($l, 0, 500), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    @chmod(aia_log_path(), 0600);
}

/* ═════════════════════ vie privée : ce que le modèle ne voit jamais ═════════════════════ */

/** id => 'living'|'private' : vivants, probablement vivants (nés il y a moins de 100 ans sans décès), fiches 🔒 */
function aia_hidden(PDO $pdo): array
{
    static $memo = null;
    if ($memo !== null) { return $memo; }
    if (!function_exists('df_hidden_people')) { require_once __DIR__ . '/dates_feter.php'; }
    $h = df_hidden_people($pdo);
    // une fiche sans date ni statut, reliée à des vivants seulement : déjà comptée par la règle commune ; on ajoute le statut « living » posé à la main
    foreach ($pdo->query("SELECT id FROM persons WHERE living_status='living' OR is_private=1") as $r) { $h[(int) $r['id']] ??= 'living'; }
    return $memo = $h;
}
function aia_is_hidden(PDO $pdo, int $id): bool { return isset(aia_hidden($pdo)[$id]); }

/** retire des textes les noms des personnes cachées (« Lucie DURAND » → « personne vivante ») */
function aia_scrub(PDO $pdo, string $text): string
{
    static $re = null;
    if ($re === null) {
        $re = [];
        $ids = array_keys(aia_hidden($pdo));
        $names = [];
        foreach (array_chunk($ids, 500) as $chunk) {
            $s = $pdo->query('SELECT first_name, last_name FROM persons WHERE id IN (' . implode(',', array_map('intval', $chunk)) . ')');
            foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $p) {
                $first = trim((string) $p['first_name']); $last = trim((string) $p['last_name']);
                if ($first === '' || $last === '') { continue; }
                $f1 = (string) (preg_split('/[\s,]+/u', $first)[0] ?? $first);
                foreach (array_unique([$first . ' ' . $last, $f1 . ' ' . $last, $last . ' ' . $first, $last . ' ' . $f1]) as $n) { $names[] = preg_quote($n, '/'); }
            }
        }
        usort($names, static fn($a, $b) => strlen($b) <=> strlen($a));
        foreach (array_chunk(array_unique($names), 300) as $c) { $re[] = '/(?<!\p{L})(?:' . implode('|', array_map(static fn($n) => str_replace('\\ ', '\s+', $n), $c)) . ')(?!\p{L})/iu'; }
    }
    foreach ($re as $r) { $text = (string) preg_replace($r, i18n_t('personne vivante'), $text); }
    return $text;
}

/* ═════════════════════ les fiches, vues par l'assistant ═════════════════════ */

function aia_sosa_map(PDO $pdo): array
{
    static $m = null;
    if ($m !== null) { return $m; }
    $m = [];
    $root = (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn();
    if ($root && function_exists('sosa_positions')) { foreach (sosa_positions($pdo, $root, 60000)['positions'] ?? [] as $s => $pid) { $m[(int) $pid] ??= (int) $s; } }
    return $m;
}
/** les événements d'une fiche (les siens et ceux de ses unions), sans les 🔒 */
function aia_events(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare("SELECT e.id, e.year, e.date_text, e.person_id, e.family_id, COALESCE(e.description,'') AS description, COALESCE(e.is_private,0) AS priv, COALESCE(t.gedcom_tag,'') AS tag, COALESCE(t.label,'') AS label,
            COALESCE(pl.name,'') AS place FROM events e LEFT JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id=? OR e.family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?) ORDER BY COALESCE(e.year, 9999), e.id");
    $s->execute([$pid, $pid, $pid]);
    return array_values(array_filter($s->fetchAll(PDO::FETCH_ASSOC), static fn($e) => (int) $e['priv'] !== 1));
}
function aia_name(PDO $pdo, int $id): string
{
    $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    return $r ? trim(trim((string) $r['first_name']) . ' ' . mb_strtoupper(trim((string) $r['last_name']))) : '';
}
/** une fiche en une ligne ; une personne cachée = « personne vivante », rien d'autre (pas même son numéro) */
function aia_brief(PDO $pdo, int $id): array
{
    if (aia_is_hidden($pdo, $id)) { return ['personne' => i18n_t('personne vivante')]; }
    $b = null; $d = null;
    foreach (aia_events($pdo, $id) as $e) {
        if ((int) $e['person_id'] !== $id) { continue; }
        $w = trim(($e['date_text'] !== '' ? $e['date_text'] : ($e['year'] ?? '')) . ($e['place'] !== '' ? ', ' . $e['place'] : ''), ', ');
        if (!$b && in_array($e['tag'], ['BIRT', 'BAPM', 'CHR'], true)) { $b = $w; }
        if (!$d && in_array($e['tag'], ['DEAT', 'BURI'], true)) { $d = $w; }
    }
    $sosa = aia_sosa_map($pdo)[$id] ?? 0;
    return array_filter(['fiche' => $id, 'nom' => aia_name($pdo, $id), 'naissance' => $b, 'deces' => $d, 'sosa' => $sosa ?: null], static fn($v) => $v !== null && $v !== '');
}
function aia_parents(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare('SELECT f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=?'); $s->execute([$pid]);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $f) { foreach (['partner1_id', 'partner2_id'] as $k) { if ((int) $f[$k]) { $out[] = (int) $f[$k]; } } }
    return array_values(array_unique($out));
}
function aia_spouses_children(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare('SELECT id, partner1_id, partner2_id FROM families WHERE partner1_id=? OR partner2_id=?'); $s->execute([$pid, $pid]);
    $sp = []; $ch = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $f) {
        $o = (int) $f['partner1_id'] === $pid ? (int) $f['partner2_id'] : (int) $f['partner1_id'];
        if ($o) { $sp[] = $o; }
        $c = $pdo->prepare('SELECT child_id FROM family_children WHERE family_id=?'); $c->execute([(int) $f['id']]);
        foreach ($c->fetchAll(PDO::FETCH_COLUMN) as $k) { $ch[] = (int) $k; }
    }
    return [array_values(array_unique($sp)), array_values(array_unique($ch))];
}
/** les sources d'une fiche : liées à elle ou à ses événements → [id => titre] */
function aia_sources_of(PDO $pdo, int $pid, array $eventIds): array
{
    $out = [];
    $q = "SELECT DISTINCT s.id, COALESCE(s.title,'') AS title, sl.entity_type, sl.entity_id FROM source_links sl JOIN sources s ON s.id=sl.source_record_id WHERE (sl.entity_type='person' AND sl.entity_id=?)";
    $args = [$pid];
    if ($eventIds) { $q .= ' OR (sl.entity_type=\'event\' AND sl.entity_id IN (' . implode(',', array_map('intval', $eventIds)) . '))'; }
    $s = $pdo->prepare($q); $s->execute($args);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[] = ['id' => (int) $r['id'], 'title' => (string) $r['title'], 'on' => $r['entity_type'] === 'event' ? (int) $r['entity_id'] : 0]; }
    return $out;
}

/* ═════════════════════ les outils de l'assistant (lecture seule) ═════════════════════ */

/** les outils, décrits pour le modèle (format « function calling » d'Ollama) */
function aia_tools_def(): array
{
    $f = static fn(string $name, string $desc, array $props, array $req = []) => ['type' => 'function', 'function' => ['name' => $name, 'description' => $desc,
        'parameters' => ['type' => 'object', 'properties' => (object) $props, 'required' => $req]]];
    $s = static fn(string $d) => ['type' => 'string', 'description' => $d];
    $i = static fn(string $d) => ['type' => 'integer', 'description' => $d];
    return [
        $f('chercher_personnes', 'Chercher des personnes de l’arbre par nom, prénom, lieu (commune, département ou région comme « Bretagne ») et période. Rend leurs numéros de fiche.',
            ['nom' => $s('nom de famille'), 'prenom' => $s('prénom'), 'lieu' => $s('commune, département ou région'), 'annee_min' => $i('année de début'), 'annee_max' => $i('année de fin'),
             'ancetres_seulement' => ['type' => 'boolean', 'description' => 'seulement les ancêtres (numéros Sosa)'], 'limite' => $i('combien au plus (30)')]),
        $f('lire_fiche', 'Lire une fiche : nom, événements (dates, lieux, sources), parents, conjoints, enfants, notes.', ['fiche' => $i('numéro de fiche')], ['fiche']),
        $f('lire_source', 'Lire une source (titre, texte, adresse).', ['source' => $i('numéro de source')], ['source']),
        $f('poser_question', 'Poser à l’app une question en français qu’elle sait déjà comprendre (parenté, « qui est né à… », « mariées avant 20 ans », « sans enfant », records…).', ['question' => $s('la question')], ['question']),
        $f('ancetres', 'Les ancêtres de la personne de départ, avec leur numéro Sosa.', ['generations' => $i('combien de générations (8 au plus)')]),
        $f('que_manque_t_il', 'Ce qui manque à une fiche (naissance, mariage, décès, parents…) et où le chercher.', ['fiche' => $i('numéro de fiche')], ['fiche']),
        $f('ce_qui_cloche', 'Les alertes du Contrôle de la base (dates impossibles, âges curieux, doublons possibles) pour une fiche ou un nom de famille.', ['fiche' => $i('numéro de fiche'), 'nom' => $s('nom de famille')]),
        $f('bases_installees', 'Chercher une fiche dans les bases installées sur l’ordinateur (Décès INSEE, Morts pour la France, Léonore, annuaires).', ['fiche' => $i('numéro de fiche')], ['fiche']),
        $f('proposer_ajout', 'Proposer d’AJOUTER quelque chose à une fiche (jamais corriger ni supprimer). Rien n’est écrit : l’utilisateur verra la proposition et décidera.',
            ['fiche' => $i('numéro de fiche'), 'quoi' => ['type' => 'string', 'enum' => ['evenement', 'note', 'source', 'journal'], 'description' => 'ce qu’on ajoute'],
             'evenement' => $s('pour un événement : BIRT, BAPM, MARR, DEAT, BURI, OCCU, RESI'), 'date' => $s('date (« après 1858 », « vers 1805 »…)'), 'lieu' => $s('lieu'),
             'titre' => $s('titre de la note, de la source ou de la recherche'), 'texte' => $s('texte de la note ou de la source'), 'raison' => $s('pourquoi : la preuve')], ['fiche', 'quoi', 'raison']),
    ];
}

/** exécute un outil ; $conv['seen'] garde les fiches et sources rendues (seules celles-là peuvent être citées) */
function aia_tool(PDO $pdo, string $name, array $a, array &$conv, ?array &$step = null): array
{
    $step = ['icon' => '✓', 'tool' => $name, 'label' => '', 'detail' => '', 'where' => 'local'];
    $see = static function (array $list) use (&$conv): void { foreach ($list as $b) { if (isset($b['fiche'])) { $conv['seen']['p'][(string) $b['fiche']] = true; } } };
    $int = static fn($v) => is_numeric($v) ? (int) $v : (int) preg_replace('/\D/', '', (string) $v);
    switch ($name) {
        case 'chercher_personnes': {
            $where = []; $args = [];
            $nom = trim(safe_text($a['nom'] ?? '')); $pre = trim(safe_text($a['prenom'] ?? '')); $lieu = trim(safe_text($a['lieu'] ?? ''));
            $y1 = $int($a['annee_min'] ?? 0); $y2 = $int($a['annee_max'] ?? 0);
            if ($nom !== '') { $where[] = 'p.last_name LIKE ?'; $args[] = '%' . $nom . '%'; }
            if ($pre !== '') { $where[] = 'p.first_name LIKE ?'; $args[] = '%' . $pre . '%'; }
            $evc = [];
            if ($lieu !== '') {
                $codes = aia_region_codes($lieu);
                $lc = ['pl.name LIKE ?', 'pl.county LIKE ?', 'pl.state LIKE ?']; array_push($args, '%' . $lieu . '%', '%' . $lieu . '%', '%' . $lieu . '%');
                foreach ($codes as $c => $dn) { $lc[] = 'pl.admin2_code = ?'; $args[] = $c; $lc[] = 'pl.county LIKE ?'; $args[] = '%' . $dn . '%'; $lc[] = 'pl.name LIKE ?'; $args[] = '%(' . $c . ')%'; }
                $evc[] = '(' . implode(' OR ', $lc) . ')';
            }
            if ($y1) { $evc[] = 'e.year >= ?'; $args[] = $y1; }
            if ($y2) { $evc[] = 'e.year <= ?'; $args[] = $y2; }
            if ($evc) {
                $where[] = 'EXISTS(SELECT 1 FROM events e LEFT JOIN places pl ON pl.id=e.place_id WHERE (e.person_id=p.id OR e.family_id IN (SELECT id FROM families WHERE partner1_id=p.id OR partner2_id=p.id)) AND COALESCE(e.is_private,0)=0 AND ' . implode(' AND ', $evc) . ')';
            }
            $ids = [];
            try { $s = $pdo->prepare('SELECT p.id FROM persons p' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY p.last_name, p.first_name LIMIT 2000'); $s->execute($args); $ids = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)); }
            catch (Throwable $_) { $ids = []; }
            if (!empty($a['ancetres_seulement'])) { $sm = aia_sosa_map($pdo); $ids = array_values(array_filter($ids, static fn($i) => isset($sm[$i]))); usort($ids, static fn($x, $y) => $sm[$x] <=> $sm[$y]); }
            $hidden = count(array_filter($ids, static fn($i) => aia_is_hidden($pdo, $i)));
            $vis = array_values(array_filter($ids, static fn($i) => !aia_is_hidden($pdo, $i)));
            $lim = max(1, min(30, $int($a['limite'] ?? 30) ?: 30));
            $list = array_map(static fn($i) => aia_brief($pdo, $i), array_slice($vis, 0, $lim));
            $see($list);
            $crit = implode(', ', array_filter([$pre, $nom, $lieu, $y1 ? i18n_t('après {y}', ['y' => $y1]) : '', $y2 ? i18n_t('avant {y}', ['y' => $y2]) : '', !empty($a['ancetres_seulement']) ? i18n_t('ancêtres') : '']));
            $step['label'] = i18n_t('Chercher des personnes : {c}', ['c' => $crit !== '' ? $crit : i18n_t('tout l’arbre')]);
            $step['detail'] = i18n_t('{n} trouvée(s)', ['n' => count($vis)]) . ($hidden ? ' · ' . i18n_t('{n} vivante(s) ou confidentielle(s) non transmise(s)', ['n' => $hidden]) : '');
            return ['nombre' => count($vis), 'personnes' => $list, 'personnes_vivantes_non_montrees' => $hidden, 'plus' => max(0, count($vis) - $lim)];
        }
        case 'lire_fiche': {
            $id = $int($a['fiche'] ?? 0);
            if (!$id || !person_exists($pdo, $id)) { $step['icon'] = '✗'; $step['label'] = i18n_t('Lire la fiche n° {n}', ['n' => $id]); $step['detail'] = i18n_t('introuvable'); return ['erreur' => 'fiche introuvable']; }
            $step['label'] = i18n_t('Lire la fiche n° {n}', ['n' => $id]);
            if (aia_is_hidden($pdo, $id)) { $step['detail'] = i18n_t('personne vivante ou confidentielle : rien n’est transmis'); return ['personne' => i18n_t('personne vivante'), 'note' => 'Cette fiche n’est pas transmise.']; }
            $out = aia_person_card($pdo, $id, $conv);
            $step['label'] = i18n_t('Lire la fiche de {n}', ['n' => $out['nom']]);
            $step['detail'] = i18n_t('{e} événement(s), {s} source(s)', ['e' => count($out['evenements']), 's' => count($out['sources'])]);
            return $out;
        }
        case 'lire_source': {
            $id = $int($a['source'] ?? 0);
            $step['label'] = i18n_t('Lire la source n° {n}', ['n' => $id]);
            if (empty($conv['seen']['s'][(string) $id])) { $step['icon'] = '✗'; $step['detail'] = i18n_t('pas encore vue dans une fiche'); return ['erreur' => 'source inconnue : lis d’abord la fiche qui la cite']; }
            $s = $pdo->prepare('SELECT id, title, author, agency, publication, url, text FROM sources WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
            if (!$r) { $step['icon'] = '✗'; $step['detail'] = i18n_t('introuvable'); return ['erreur' => 'source introuvable']; }
            $step['detail'] = mb_substr((string) $r['title'], 0, 80);
            return ['source' => $id, 'titre' => aia_scrub($pdo, (string) $r['title']), 'auteur' => aia_scrub($pdo, (string) $r['author']), 'depot' => (string) $r['agency'], 'adresse' => (string) $r['url'],
                'texte' => aia_scrub($pdo, mb_substr((string) $r['text'], 0, 1200))];
        }
        case 'poser_question': {
            $q = mb_substr(trim(safe_text($a['question'] ?? '')), 0, 300);
            $step['label'] = i18n_t('Question comprise par l’app : « {q} »', ['q' => $q]);
            if ($q === '' || !function_exists('ask_question')) { $step['icon'] = '✗'; return ['erreur' => 'question vide']; }
            try { $r = ask_question($pdo, $q); } catch (Throwable $e) { $step['icon'] = '✗'; $step['detail'] = $e->getMessage(); return ['erreur' => 'question non comprise']; }
            $ids = array_values(array_unique(array_map('intval', array_merge(array_column($r['people'] ?? [], 'id'), $r['ids'] ?? []))));
            $hidden = count(array_filter($ids, static fn($i) => aia_is_hidden($pdo, $i)));
            $vis = array_values(array_filter($ids, static fn($i) => !aia_is_hidden($pdo, $i)));
            $list = array_map(static fn($i) => aia_brief($pdo, $i), array_slice($vis, 0, 30)); $see($list);
            $step['detail'] = i18n_t('{n} trouvée(s)', ['n' => count($vis)]);
            $und = array_map(static fn($x) => aia_scrub($pdo, is_string($x) ? $x : (string) json_encode($x, JSON_UNESCAPED_UNICODE)), array_slice((array) ($r['understood'] ?? []), 0, 8));
            return ['compris' => $und, 'reponse_de_l_app' => aia_scrub($pdo, mb_substr(strip_tags((string) ($r['answer'] ?? '')), 0, 600)), 'nombre' => count($vis), 'personnes' => $list, 'personnes_vivantes_non_montrees' => $hidden];
        }
        case 'ancetres': {
            $g = max(1, min(8, $int($a['generations'] ?? 4) ?: 4));
            $sm = aia_sosa_map($pdo); asort($sm);
            $list = [];
            foreach ($sm as $pid => $s) { if ($s >= (1 << $g)) { continue; } $b = aia_brief($pdo, $pid); if (isset($b['fiche'])) { $list[] = $b; } if (count($list) >= 60) { break; } }
            $see($list);
            $step['label'] = i18n_t('Les ancêtres sur {g} générations', ['g' => $g]); $step['detail'] = i18n_t('{n} trouvé(s)', ['n' => count($list)]);
            return ['ancetres' => $list];
        }
        case 'que_manque_t_il': {
            $id = $int($a['fiche'] ?? 0);
            $step['label'] = i18n_t('Que manque-t-il à la fiche n° {n} ?', ['n' => $id]);
            if (!$id || !person_exists($pdo, $id) || aia_is_hidden($pdo, $id)) { $step['icon'] = '✗'; return ['erreur' => 'fiche introuvable ou non transmise']; }
            $gaps = aia_gaps($pdo, $id);
            $step['detail'] = implode(', ', array_column($gaps, 'manque')) ?: i18n_t('rien de gros');
            return ['fiche' => $id, 'manques' => array_map(static fn($g) => ['manque' => $g['manque'], 'pourquoi' => $g['why'], 'archives' => $g['archive'], 'ou_chercher' => array_map(static fn($s) => $s['series'] . ' : ' . $s['detail'], array_slice($g['where'], 0, 3))], $gaps)];
        }
        case 'ce_qui_cloche': {
            $id = $int($a['fiche'] ?? 0); $nom = trim(safe_text($a['nom'] ?? ''));
            $step['label'] = $id ? i18n_t('Le Contrôle pour la fiche n° {n}', ['n' => $id]) : ($nom !== '' ? i18n_t('Le Contrôle pour les {n}', ['n' => $nom]) : i18n_t('Le Contrôle de la base'));
            if (!function_exists('controle_state')) { return ['erreur' => 'contrôle indisponible']; }
            try { $st = controle_state($pdo); } catch (Throwable $e) { $step['icon'] = '✗'; return ['erreur' => 'contrôle indisponible']; }
            $want = null;
            if ($id) { $want = [$id]; }
            elseif ($nom !== '') { $s = $pdo->prepare('SELECT id FROM persons WHERE last_name LIKE ?'); $s->execute(['%' . $nom . '%']); $want = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)); }
            $out = [];
            foreach ($st['alerts'] ?? [] as $al) {
                $people = array_map('intval', $al['people'] ?? []);
                if ($want !== null && !array_intersect($people, $want)) { continue; }
                $vis = array_values(array_filter($people, static fn($i) => !aia_is_hidden($pdo, $i)));
                if (!$vis) { continue; }
                $list = array_map(static fn($i) => aia_brief($pdo, $i), $vis); $see($list);
                $out[] = ['gravite' => ['red' => 'grave (impossible)', 'orange' => 'à vérifier', 'yellow' => 'curieux'][$al['level']] ?? (string) $al['level'], 'alerte' => aia_scrub($pdo, (string) $al['title']), 'fiches' => $list];
                if (count($out) >= 12) { break; }
            }
            $step['detail'] = i18n_t('{n} alerte(s)', ['n' => count($out)]);
            return ['alertes' => $out];
        }
        case 'bases_installees': {
            $id = $int($a['fiche'] ?? 0);
            $step['label'] = i18n_t('Les bases installées pour la fiche n° {n}', ['n' => $id]);
            if (!$id || aia_is_hidden($pdo, $id)) { $step['icon'] = '✗'; return ['erreur' => 'fiche non transmise']; }
            $found = aia_local_bases($pdo, $id);
            $step['detail'] = i18n_t('{n} piste(s)', ['n' => count($found['rows'])]);
            return ['bases' => $found['checked'], 'resultats' => array_map(static fn($x) => ['base' => $x['base'], 'titre' => $x['title'], 'ressemblance' => $x['score'] . ' %', 'pourquoi' => $x['why']], $found['rows'])];
        }
        case 'proposer_ajout': {
            $step['label'] = i18n_t('Proposer un ajout');
            try { $p = aia_proposal_make($pdo, $a); } catch (Throwable $e) { $step['icon'] = '✗'; $step['detail'] = $e->getMessage(); return ['erreur' => $e->getMessage()]; }
            $p['id'] = count($conv['proposals'] ?? []) + 1;
            $conv['proposals'][] = $p;
            $step['detail'] = $p['summary'];
            return ['proposition' => $p['id'], 'statut' => 'enregistrée : elle sera montrée à l’utilisateur, qui décidera ; rien n’est écrit'];
        }
    }
    $step['icon'] = '✗'; $step['label'] = i18n_t('Outil inconnu : {n}', ['n' => $name]);
    return ['erreur' => 'outil inconnu : ' . $name];
}

/** « Bretagne » → les départements (code => nom) ; un nom de département aussi */
function aia_region_codes(string $lieu): array
{
    $regions = ['bretagne' => ['22', '29', '35', '44', '56'], 'normandie' => ['14', '27', '50', '61', '76'], 'limousin' => ['19', '23', '87'], 'auvergne' => ['03', '15', '43', '63'],
        'alsace' => ['67', '68'], 'lorraine' => ['54', '55', '57', '88'], 'corse' => ['2A', '2B'], 'provence' => ['04', '05', '06', '13', '83', '84'], 'bourgogne' => ['21', '58', '71', '89'],
        'savoie' => ['73', '74'], 'picardie' => ['02', '60', '80'], 'vendee' => ['85'], 'pays basque' => ['64'], 'quercy' => ['46', '82'], 'perigord' => ['24'], 'berry' => ['18', '36'], 'poitou' => ['79', '86']];
    $k = strtolower(ascii_fold(trim($lieu)));
    $deps = function_exists('gaps_departments') ? gaps_departments() : [];
    $out = [];
    foreach ($regions[$k] ?? [] as $c) { $out[$c] = (string) ($deps[$c]['name'] ?? $c); }
    return $out;
}

/** la fiche lue par l'outil lire_fiche (et par le généalogiste, le récit) */
function aia_person_card(PDO $pdo, int $id, array &$conv): array
{
    $s = $pdo->prepare('SELECT id, first_name, last_name, gender, living_status FROM persons WHERE id=?'); $s->execute([$id]); $p = $s->fetch(PDO::FETCH_ASSOC);
    $events = aia_events($pdo, $id);
    $srcs = aia_sources_of($pdo, $id, array_map(static fn($e) => (int) $e['id'], $events));
    $byEv = []; foreach ($srcs as $x) { if ($x['on']) { $byEv[$x['on']][] = $x['id']; } $conv['seen']['s'][(string) $x['id']] = true; }
    $evs = array_map(static fn($e) => array_filter(['type' => $e['label'] !== '' ? $e['label'] : $e['tag'], 'code' => $e['tag'], 'date' => $e['date_text'] !== '' ? $e['date_text'] : ($e['year'] !== null ? (string) $e['year'] : ''),
        'lieu' => $e['place'], 'details' => aia_scrub($pdo, mb_substr((string) $e['description'], 0, 200)), 'de_son_union' => $e['family_id'] ? true : null, 'sources' => $byEv[(int) $e['id']] ?? null], static fn($v) => $v !== null && $v !== '' && $v !== []), $events);
    [$sp, $ch] = aia_spouses_children($pdo, $id);
    $bl = static fn(array $ids) => array_map(static fn($i) => aia_brief($pdo, $i), $ids);
    $par = $bl(aia_parents($pdo, $id)); $con = $bl($sp); $enf = $bl($ch);
    foreach ([$par, $con, $enf] as $l) { foreach ($l as $b) { if (isset($b['fiche'])) { $conv['seen']['p'][(string) $b['fiche']] = true; } } }
    $conv['seen']['p'][(string) $id] = true;
    $notes = [];
    $n = $pdo->prepare("SELECT title, body FROM notes WHERE entity_type='person' AND entity_id=? ORDER BY id LIMIT 8"); $n->execute([$id]);
    foreach ($n->fetchAll(PDO::FETCH_ASSOC) as $r) { $notes[] = ['titre' => aia_scrub($pdo, (string) $r['title']), 'texte' => aia_scrub($pdo, mb_substr(trim(strip_tags((string) $r['body'])), 0, 500))]; }
    if ($events) {
        $n = $pdo->prepare("SELECT title, body FROM notes WHERE entity_type='event' AND entity_id IN (" . implode(',', array_map(static fn($e) => (int) $e['id'], $events)) . ') ORDER BY id LIMIT 8'); $n->execute();
        foreach ($n->fetchAll(PDO::FETCH_ASSOC) as $r) { $notes[] = ['titre' => aia_scrub($pdo, (string) $r['title']), 'texte' => aia_scrub($pdo, mb_substr(trim(strip_tags((string) $r['body'])), 0, 500))]; }
    }
    $sosa = aia_sosa_map($pdo)[$id] ?? 0;
    return array_filter(['fiche' => $id, 'nom' => aia_name($pdo, $id), 'sexe' => ['male' => 'homme', 'female' => 'femme'][$p['gender'] ?? ''] ?? 'inconnu', 'sosa' => $sosa ?: null,
        'evenements' => array_values($evs), 'parents' => $par, 'conjoints' => $con, 'enfants' => $enf, 'notes' => $notes,
        'sources' => array_map(static fn($x) => ['source' => $x['id'], 'titre' => aia_scrub($pdo, $x['title'])], array_values(array_reduce($srcs, static function ($c, $x) { $c[$x['id']] ??= $x; return $c; }, [])))],
        static fn($v) => $v !== null) + ['evenements' => [], 'sources' => []];
}

/** les trous d'une fiche et où les chercher (« Que manque-t-il ? » pour une personne) */
function aia_gaps(PDO $pdo, int $id): array
{
    $events = array_values(array_filter(aia_events($pdo, $id), static fn($e) => true));
    $has = static fn(array $tags) => (bool) array_filter($events, static fn($e) => in_array($e['tag'], $tags, true) && ((int) $e['person_id'] === $id || $e['family_id']));
    $years = array_values(array_filter(array_map(static fn($e) => $e['year'] !== null ? (int) $e['year'] : null, $events)));
    $by = null; $bvers = false; $place = '';
    foreach ($events as $e) {
        if (in_array($e['tag'], ['BIRT', 'BAPM', 'CHR'], true) && (int) $e['person_id'] === $id) { $by ??= $e['year'] !== null ? (int) $e['year'] : null; $bvers = $bvers || preg_match('/\b(vers|env|abt|about|circa|ca)\b/i', (string) $e['date_text']); }
        if ($e['place'] !== '') { $place = (string) $e['place']; }
    }
    $last = $years ? max($years) : null; $first = $years ? min($years) : null;
    $placeRow = static function (string $name) use ($pdo): array { if ($name === '') { return ['name' => '']; } try { $s = $pdo->prepare('SELECT name, county, country, admin2_code FROM places WHERE name=? LIMIT 1'); $s->execute([$name]); return $s->fetch(PDO::FETCH_ASSOC) ?: ['name' => $name]; } catch (Throwable $_) { return ['name' => $name]; } };
    $arch = function_exists('gaps_archive_of') ? gaps_archive_of($placeRow($place)) : ['label' => '', 'code' => '', 'france' => true];
    $site = '';
    if (function_exists('ad_config') && ($arch['code'] ?? '') !== '') { $site = (string) (ad_config()['departements'][$arch['code']]['site'] ?? ''); }
    $out = [];
    $add = static function (string $kind, string $manque, string $why, ?int $from, ?int $to) use (&$out, $arch, $place, $site) {
        $out[] = ['kind' => $kind, 'manque' => $manque, 'why' => $why, 'from' => $from, 'to' => $to, 'place' => $place, 'archive' => (string) ($arch['label'] ?? ''), 'site' => $site,
            'where' => function_exists('gaps_where') ? gaps_where($kind, $from, $to, $arch + ['france' => true, 'code' => ''], $place) : [],
            'decennial' => ($to ?? 0) >= 1792 && function_exists('gaps_decennial') && in_array($kind, ['birth', 'marriage', 'death'], true) ? gaps_decennial((int) ($from ?? $to), (int) $to) : []];
    };
    if (!$has(['BIRT', 'BAPM', 'CHR'])) { $add('birth', i18n_t('naissance manquante'), i18n_t('aucune naissance ni baptême'), $first ? $first - 30 : null, $first ? $first - 15 : null); }
    elseif ($bvers) { $add('birth', i18n_t('naissance « vers »'), i18n_t('la date n’est qu’approchée'), $by ? $by - 3 : null, $by ? $by + 3 : null); }
    if (!$has(['DEAT', 'BURI', 'CREM'])) { $from = $last ?? ($by ? $by + 30 : null); $add('death', i18n_t('décès manquant'), $last ? i18n_t('dernière trace en {y}', ['y' => $last]) : i18n_t('aucune date'), $from, $from ? min((int) date('Y'), ($by ?? $from) + 95) : null); }
    if (!aia_parents($pdo, $id)) { $add('parents', i18n_t('parents inconnus'), i18n_t('aucun parent relié'), $by ? $by - 1 : null, $by ? $by + 1 : null); }
    [$sp] = aia_spouses_children($pdo, $id);
    if ($sp && !$has(['MARR'])) { $add('marriage', i18n_t('mariage sans date'), i18n_t('un conjoint, mais pas de mariage'), $by ? $by + 18 : null, $by ? $by + 40 : null); }
    return $out;
}

/** les bases installées sur l'ordinateur (Décès INSEE, Morts pour la France, Léonore, annuaires), par lib/pistes_auto.php ; les pistes y sont gardées */
function aia_local_bases(PDO $pdo, int $id, bool $save = false): array
{
    if (!function_exists('pst_facts')) { require_once __DIR__ . '/pistes_auto.php'; }
    pst_schema($pdo);
    $f = pst_facts($pdo, $id);
    $checked = []; $rows = [];
    if (!$f || pst_private_reason($f) !== '') { return ['checked' => [], 'rows' => [], 'facts' => $f]; }
    $insee = false; try { $insee = (bool) $pdo->query('SELECT 1 FROM insee_deces LIMIT 1')->fetchColumn(); } catch (Throwable $_) {}
    $names = ['insee' => i18n_t('Décès INSEE'), 'mpf' => i18n_t('Morts pour la France'), 'leonore' => i18n_t('Léonore'), 'annuaire' => i18n_t('Annuaires de Paris')];
    $found = [];
    if (!$insee) { $checked[] = ['base' => $names['insee'], 'etat' => i18n_t('pas installée')]; }
    elseif (($f['death'] !== null && $f['death'] < 1970) || ($f['birth'] !== null && $f['birth'] < 1860) || $f['birth'] === null) { $checked[] = ['base' => $names['insee'], 'etat' => i18n_t('commence en 1970 : pas concernée, sautée')]; }
    else { $x = pst_insee($pdo, $f); $found = array_merge($found, $x); $checked[] = ['base' => $names['insee'], 'etat' => i18n_t('{n} résultat(s)', ['n' => count($x)])]; }
    foreach (['mpf', 'leonore'] as $k) {
        $concerned = $k === 'mpf' ? ($f['gender'] !== 'female' && ($f['birth'] === null || ($f['birth'] >= 1860 && $f['birth'] <= 1905))) : ($f['birth'] === null || $f['birth'] >= 1750);
        if (!$concerned) { $checked[] = ['base' => $names[$k], 'etat' => i18n_t('pas concernée')]; continue; }
        $x = pst_bo($pdo, $f, $k); $found = array_merge($found, $x); $checked[] = ['base' => $names[$k], 'etat' => $x ? i18n_t('{n} résultat(s)', ['n' => count($x)]) : i18n_t('rien (ou pas installée)')];
    }
    $x = pst_annuaire($pdo, $f); $found = array_merge($found, $x);
    $decided = pst_decided($pdo, $id);
    foreach ($found as $x) {
        if ($x['score'] < PA_MIN_SCORE || isset($decided[$x['src'] . '|' . $x['key']])) { continue; }
        if ($save) { pst_save($pdo, $id, $x['src'], $x['key'], $x['score'], $x['title'], $x['url'], $x['data'] + ['why' => $x['why']]); }
        $rows[] = ['base' => $names[$x['src']] ?? $x['src'], 'src' => $x['src'], 'key' => $x['key'], 'title' => $x['title'], 'score' => (int) $x['score'], 'url' => $x['url'], 'why' => implode(' ; ', array_map(static fn($w) => $w[1], $x['why']))];
    }
    return ['checked' => $checked, 'rows' => $rows, 'facts' => $f];
}

/* ═════════════════════ les actions proposées : AJOUTER seulement ═════════════════════ */

const AIA_EVENT_TAGS = ['BIRT', 'BAPM', 'MARR', 'DEAT', 'BURI', 'OCCU', 'RESI', 'CENS'];

/** une proposition vérifiée : ce qui SERA écrit, ligne par ligne (rien n'est écrit ici) */
function aia_proposal_make(PDO $pdo, array $a): array
{
    $pid = is_numeric($a['fiche'] ?? null) ? (int) $a['fiche'] : (int) preg_replace('/\D/', '', (string) ($a['fiche'] ?? ''));
    if (!$pid || !person_exists($pdo, $pid)) { throw new LcndaBadInput('fiche introuvable'); }
    if (aia_is_hidden($pdo, $pid)) { throw new LcndaBadInput('fiche non transmise'); }
    $quoi = (string) ($a['quoi'] ?? '');
    if (!in_array($quoi, ['evenement', 'note', 'source', 'journal'], true)) { throw new LcndaBadInput('seulement ajouter : un événement, une note, une source ou une ligne du journal'); }
    $t = static fn($k, $n = 300) => mb_substr(trim(safe_text($a[$k] ?? '')), 0, $n);
    $p = ['person_id' => $pid, 'person' => aia_name($pdo, $pid), 'quoi' => $quoi, 'status' => 'proposed', 'raison' => $t('raison', 500),
        'fields' => ['evenement' => strtoupper($t('evenement', 8)), 'date' => $t('date', 80), 'lieu' => $t('lieu', 160), 'titre' => $t('titre', 200), 'texte' => $t('texte', 4000)]];
    if ($quoi === 'evenement') {
        if (!in_array($p['fields']['evenement'], AIA_EVENT_TAGS, true)) { throw new LcndaBadInput('type d’événement inconnu'); }
        if ($p['fields']['evenement'] === 'MARR') { throw new LcndaBadInput('un mariage se range dans une union : propose plutôt une note'); }
    }
    if (in_array($quoi, ['note', 'source', 'journal'], true) && $p['fields']['titre'] === '' && $p['fields']['texte'] === '') { throw new LcndaBadInput('titre ou texte manquant'); }
    $p['summary'] = aia_proposal_summary($pdo, $p);
    return $p;
}
function aia_event_label(PDO $pdo, string $tag): string
{
    $s = $pdo->prepare("SELECT label FROM event_types WHERE gedcom_tag=? AND scope='person' ORDER BY id LIMIT 1"); $s->execute([$tag]);
    return (string) ($s->fetchColumn() ?: $tag);
}
function aia_proposal_summary(PDO $pdo, array $p): string
{
    $f = $p['fields'];
    return match ($p['quoi']) {
        'evenement' => i18n_t('Ajouter à la fiche de {n} : {e} {d}{l} (à vérifier)', ['n' => $p['person'], 'e' => mb_strtolower(aia_event_label($pdo, $f['evenement'])), 'd' => $f['date'], 'l' => $f['lieu'] !== '' ? ', ' . $f['lieu'] : '']),
        'note' => i18n_t('Ajouter une note à la fiche de {n} : « {t} »', ['n' => $p['person'], 't' => $f['titre'] !== '' ? $f['titre'] : mb_substr($f['texte'], 0, 60)]),
        'source' => i18n_t('Ajouter une source à la fiche de {n} : « {t} »', ['n' => $p['person'], 't' => $f['titre'] !== '' ? $f['titre'] : mb_substr($f['texte'], 0, 60)]),
        default => i18n_t('Noter dans le journal des recherches de {n} : « {t} »', ['n' => $p['person'], 't' => $f['titre'] !== '' ? $f['titre'] : mb_substr($f['texte'], 0, 60)]),
    };
}
/** « voici exactement ce qui sera écrit » : les lignes montrées avant d'accepter */
function aia_proposal_lines(PDO $pdo, array $p): array
{
    $f = $p['fields']; $today = date('d/m/Y');
    $mark = i18n_t('Proposé par l’assistant IA le {d} : {r}', ['d' => $today, 'r' => $p['raison'] !== '' ? $p['raison'] : i18n_t('à vérifier')]);
    return match ($p['quoi']) {
        'evenement' => [['📅', aia_event_label($pdo, $f['evenement']) . ' : ' . trim($f['date'] . ($f['lieu'] !== '' ? ', ' . $f['lieu'] : '')) . ' — ' . i18n_t('à vérifier')], ['📝', i18n_t('Note de recherche : « {m} »', ['m' => $mark])]],
        'note' => [['📝', i18n_t('Note « {t} »', ['t' => $f['titre'] !== '' ? $f['titre'] : i18n_t('Proposée par l’assistant')])], ['', mb_substr($f['texte'], 0, 400) . (mb_strlen($f['texte']) > 400 ? '…' : '')], ['', $mark]],
        'source' => [['📚', i18n_t('Source : « {t} »', ['t' => $f['titre']])], ['', mb_substr($f['texte'], 0, 300)], ['', $mark]],
        default => [['🗓', i18n_t('Journal des recherches : « {t} » — à consulter', ['t' => $f['titre'] !== '' ? $f['titre'] : mb_substr($f['texte'], 0, 80)])], ['', $mark]],
    };
}

function aia_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS aia_adds (batch TEXT PRIMARY KEY, person_id INTEGER NOT NULL, ids TEXT NOT NULL DEFAULT '{}', summary TEXT NOT NULL DEFAULT '',
        conv_id TEXT NOT NULL DEFAULT '', proposal INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, undone_at TEXT NOT NULL DEFAULT '')");
}

/** POST aia_apply : écrit UNE proposition (avec les champs changés par l'utilisateur) ; tout est marqué « proposé par l'assistant » */
function aia_apply(PDO $pdo, array $d): array
{
    aia_schema($pdo);
    $conv = null; $p = null;
    if (($cid = (string) ($d['conv_id'] ?? '')) !== '') {
        $conv = aia_conv_get($cid);
        foreach ($conv['proposals'] ?? [] as $i => $x) { if ((int) $x['id'] === (int) ($d['proposal'] ?? 0)) { $p = $x; $pi = $i; } }
    }
    if (!$p) { throw new LcndaBadInput(i18n_t('Proposition introuvable.')); }
    if ($p['status'] === 'added') { throw new RuntimeException(i18n_t('Déjà ajouté.')); }
    // l'utilisateur a pu changer chaque ligne avant d'accepter : relue et revérifiée comme une nouvelle proposition
    $fields = is_array($d['fields'] ?? null) ? $d['fields'] : [];
    $p = array_merge($p, aia_proposal_make($pdo, ['fiche' => $p['person_id'], 'quoi' => $p['quoi'], 'raison' => $fields['raison'] ?? $p['raison']] + array_merge($p['fields'], array_intersect_key($fields, $p['fields']))), ['id' => $p['id']]);
    $pid = (int) $p['person_id'];
    assert_person_unlocked($pdo, $pid);
    $f = $p['fields']; $today = date('d/m/Y');
    $mark = i18n_t('Proposé par l’assistant IA le {d} : {r}', ['d' => $today, 'r' => $p['raison'] !== '' ? $p['raison'] : i18n_t('à vérifier')]);
    $ids = ['events' => [], 'notes' => [], 'sources' => [], 'source_links' => [], 'journal' => []];
    $own = !$pdo->inTransaction();
    if ($own) { $pdo->beginTransaction(); }
    try {
        switch ($p['quoi']) {
            case 'evenement':
                $tag = $f['evenement'];
                if (in_array($tag, ['BIRT', 'BAPM', 'DEAT', 'BURI'], true)) {
                    $has = $pdo->prepare('SELECT count(*) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=? AND t.gedcom_tag=?'); $has->execute([$pid, $tag]);
                    if ((int) $has->fetchColumn()) { throw new RuntimeException(i18n_t('Sa fiche a déjà cet événement : l’assistant ne corrige rien. Ouvre la fiche pour le faire toi-même.')); }
                }
                $type = $pdo->prepare("SELECT id FROM event_types WHERE gedcom_tag=? AND scope='person' ORDER BY id LIMIT 1"); $type->execute([$tag]); $typeId = (int) $type->fetchColumn();
                if (!$typeId) { throw new RuntimeException(i18n_t('Type d’événement introuvable.')); }
                $e = add_event($pdo, ['person_id' => $pid, 'event_type_id' => $typeId, 'date_text' => $f['date'], 'place_name' => $f['lieu'], 'country' => '',
                    'description' => i18n_t('Proposé par l’assistant IA — à vérifier'), 'fact_confidence' => 'doubt', 'confidence_origin' => i18n_t('Assistant IA'), 'research_note' => $mark]);
                $ids['events'][] = (int) ($e['id'] ?? 0);
                break;
            case 'note':
                $pdo->prepare("INSERT INTO notes(entity_type, entity_id, title, body, created_at, updated_at) VALUES('person',?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
                    ->execute([$pid, $f['titre'] !== '' ? $f['titre'] : i18n_t('Proposée par l’assistant IA'), trim($f['texte'] . "\n\n— " . $mark)]);
                $ids['notes'][] = (int) $pdo->lastInsertId();
                break;
            case 'source':
                $pdo->prepare('INSERT INTO sources(title, author, agency, publication, url, text) VALUES(?,?,?,?,?,?)')->execute([$f['titre'] !== '' ? $f['titre'] : i18n_t('Source proposée par l’assistant IA'), '', '', '', '', trim($f['texte'] . "\n\n— " . $mark)]);
                $sid = (int) $pdo->lastInsertId(); $ids['sources'][] = $sid;
                $pdo->prepare("INSERT INTO source_links(entity_type, entity_id, source_record_id, page, quality, note) VALUES('person',?,?,?,?,?)")->execute([$pid, $sid, '', '', i18n_t('À vérifier (assistant IA)')]);
                $ids['source_links'][] = (int) $pdo->lastInsertId();
                break;
            case 'journal':
                $pdo->prepare('INSERT INTO research_journal(person_id, title, body, result, next_step) VALUES(?,?,?,?,?)')->execute([$pid, $f['titre'] !== '' ? $f['titre'] : mb_substr($f['texte'], 0, 120), trim($f['texte'] . "\n\n— " . $mark), '', i18n_t('à consulter')]);
                $ids['journal'][] = (int) $pdo->lastInsertId();
                break;
        }
        $batch = 'aia-' . bin2hex(random_bytes(6));
        $pdo->prepare('INSERT INTO aia_adds(batch, person_id, ids, summary, conv_id, proposal) VALUES(?,?,?,?,?,?)')->execute([$batch, $pid, json_encode($ids), $p['summary'], (string) $conv['id'], (int) $p['id']]);
        if (function_exists('log_change')) { log_change($pdo, 'person', $pid, 'update', 'Assistant IA : ' . $p['summary']); }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    $p['status'] = 'added'; $p['batch'] = $batch;
    $conv['proposals'][$pi] = $p; aia_conv_save($conv);
    return ['ok' => true, 'batch' => $batch, 'person_id' => $pid, 'summary' => $p['summary'], 'proposal' => aia_proposal_out($pdo, $p)];
}
/** POST aia_undo : retire tout ce que l'ajout a écrit (s'il est encore là) */
function aia_undo(PDO $pdo, array $d): array
{
    aia_schema($pdo);
    $batch = mb_substr(safe_text($d['batch'] ?? ''), 0, 40);
    $s = $pdo->prepare("SELECT * FROM aia_adds WHERE batch=? AND undone_at=''"); $s->execute([$batch]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException(i18n_t('Cet ajout est déjà annulé, ou introuvable.')); }
    $pid = (int) $row['person_id']; $ids = json_decode((string) $row['ids'], true) ?: [];
    assert_person_unlocked($pdo, $pid);
    $own = !$pdo->inTransaction();
    if ($own) { $pdo->beginTransaction(); }
    try {
        foreach (array_map('intval', $ids['source_links'] ?? []) as $id) { $pdo->prepare('DELETE FROM source_links WHERE id=?')->execute([$id]); }
        foreach (array_map('intval', $ids['events'] ?? []) as $id) {
            foreach (['media_links', 'source_links', 'notes'] as $t) { try { $pdo->prepare("DELETE FROM $t WHERE entity_type='event' AND entity_id=?")->execute([$id]); } catch (Throwable $_) {} }
            $pdo->prepare('DELETE FROM events WHERE id=? AND person_id=?')->execute([$id, $pid]);
        }
        foreach (array_map('intval', $ids['notes'] ?? []) as $id) { $pdo->prepare("DELETE FROM notes WHERE id=? AND entity_type='person' AND entity_id=?")->execute([$id, $pid]); }
        foreach (array_map('intval', $ids['sources'] ?? []) as $id) { $n = $pdo->prepare('SELECT count(*) FROM source_links WHERE source_record_id=?'); $n->execute([$id]); if (!(int) $n->fetchColumn()) { $pdo->prepare('DELETE FROM sources WHERE id=?')->execute([$id]); } }
        foreach (array_map('intval', $ids['journal'] ?? []) as $id) { $pdo->prepare('DELETE FROM research_journal WHERE id=? AND person_id=?')->execute([$id, $pid]); }
        $pdo->prepare('UPDATE aia_adds SET undone_at=CURRENT_TIMESTAMP WHERE batch=?')->execute([$batch]);
        if (function_exists('log_change')) { log_change($pdo, 'person', $pid, 'update', 'Assistant IA : ajout annulé — ' . (string) $row['summary']); }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    if ((string) $row['conv_id'] !== '') {
        try { $conv = aia_conv_get((string) $row['conv_id']); foreach ($conv['proposals'] as &$x) { if ((int) $x['id'] === (int) $row['proposal']) { $x['status'] = 'proposed'; unset($x['batch']); } } unset($x); aia_conv_save($conv); } catch (Throwable $_) {}
    }
    return ['ok' => true, 'person_id' => $pid];
}
/** POST aia_proposal_mark : « Non » (laissé tel quel) ou le remettre (↶) */
function aia_proposal_mark(array $d): array
{
    $conv = aia_conv_get((string) ($d['conv_id'] ?? ''));
    $to = (string) ($d['status'] ?? '') === 'ignored' ? 'ignored' : 'proposed';
    foreach ($conv['proposals'] as &$x) { if ((int) $x['id'] === (int) ($d['proposal'] ?? 0) && $x['status'] !== 'added') { $x['status'] = $to; } } unset($x);
    aia_conv_save($conv);
    return ['ok' => true, 'status' => $to];
}
function aia_proposal_out(PDO $pdo, array $p): array
{
    return ['id' => (int) $p['id'], 'person_id' => (int) $p['person_id'], 'person' => (string) $p['person'], 'quoi' => (string) $p['quoi'], 'status' => (string) $p['status'], 'batch' => (string) ($p['batch'] ?? ''),
        'summary' => (string) $p['summary'], 'raison' => (string) $p['raison'], 'fields' => $p['fields'], 'lines' => aia_proposal_lines($pdo, $p), 'event_label' => $p['quoi'] === 'evenement' ? aia_event_label($pdo, (string) $p['fields']['evenement']) : ''];
}

/* ═════════════════════ vérifier la réponse : chaque renvoi pointe vers une vraie fiche, une vraie source ═════════════════════ */

/**
 * Le texte du modèle → des phrases : chaque [fiche N] / [source N] est contrôlé (existe, a été rendu par un outil dans cette
 * conversation, n'est pas une personne cachée) ; un renvoi inventé est retiré. Une phrase est « supposée » si elle le dit,
 * si un renvoi y était inventé, si elle donne une année sans aucun renvoi, ou une année que les fiches citées n'ont pas.
 */
function aia_verify(PDO $pdo, string $raw, array $conv, array $extraYears = []): array
{
    $raw = trim(str_replace("\r", '', $raw));
    $raw = (string) preg_replace('/^```[a-z]*\s*|\s*```$/', '', $raw);
    $persons = []; $sources = []; $srcOrder = []; $removed = [];
    $yearsOf = static function (int $pid) use ($pdo): array { static $m = []; return $m[$pid] ??= array_values(array_filter(array_map(static fn($e) => $e['year'] !== null ? (int) $e['year'] : null, aia_events($pdo, $pid)))); };
    $okP = static function (int $id) use ($pdo, $conv): bool { return $id > 0 && !empty($conv['seen']['p'][(string) $id]) && person_exists($pdo, $id) && !aia_is_hidden($pdo, $id); };
    $okS = static function (int $id) use ($pdo, $conv): bool { if ($id <= 0 || empty($conv['seen']['s'][(string) $id])) { return false; } $s = $pdo->prepare('SELECT 1 FROM sources WHERE id=?'); $s->execute([$id]); return (bool) $s->fetchColumn(); };
    $paras = preg_split('/\n{2,}|\n(?=\s*[-•*]\s)|\n/u', $raw) ?: [];
    $out = [];
    foreach ($paras as $para) {
        $para = trim($para);
        if ($para === '') { continue; }
        $bullet = (bool) preg_match('/^[-•*]\s+/u', $para);
        $para = (string) preg_replace('/^[-•*]\s+/u', '', $para);
        $sents = preg_split('/(?<=[.!?…])\s+(?=[\p{Lu}«“"(\[0-9])/u', $para) ?: [$para];
        $line = [];
        foreach ($sents as $sent) {
            $segs = []; $cP = []; $cS = 0; $invented = false; $pos = 0;
            if (preg_match_all('/\[\s*(fiche|personne|source|s)\s*(?:n°|no|#)?\s*(\d{1,9})\s*\]/iu', $sent, $mm, PREG_SET_ORDER | PREG_OFFSET_CAPTURE)) {
                foreach ($mm as $m) {
                    $txt = substr($sent, $pos, $m[0][1] - $pos); if ($txt !== '') { $segs[] = ['t' => 'txt', 's' => $txt]; }
                    $pos = $m[0][1] + strlen($m[0][0]);
                    $kind = strtolower(ascii_fold($m[1][0])); $id = (int) $m[2][0];
                    if (in_array($kind, ['fiche', 'personne'], true)) {
                        if ($okP($id)) { $persons[$id] ??= ['id' => $id, 'name' => aia_name($pdo, $id)]; $segs[] = ['t' => 'p', 'id' => $id]; $cP[] = $id; }
                        else { $invented = true; $removed[] = i18n_t('fiche {n}', ['n' => $id]); }
                    } else {
                        if ($okS($id)) {
                            if (!isset($sources[$id])) { $s = $pdo->prepare('SELECT title, url FROM sources WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC) ?: []; $srcOrder[] = $id; $sources[$id] = ['id' => $id, 'n' => count($srcOrder), 'title' => (string) ($r['title'] ?? ''), 'url' => (string) ($r['url'] ?? '')]; }
                            $segs[] = ['t' => 's', 'id' => $id, 'n' => $sources[$id]['n']]; $cS++;
                        } else { $invented = true; $removed[] = i18n_t('source {n}', ['n' => $id]); }
                    }
                }
            }
            $rest = substr($sent, $pos); if ($rest !== '') { $segs[] = ['t' => 'txt', 's' => $rest]; }
            // un renvoi retiré laisse deux bouts de texte côte à côte : un seul, sans double espace
            $m2 = [];
            foreach ($segs as $sg) { $li = count($m2) - 1; if ($sg['t'] === 'txt' && $li >= 0 && $m2[$li]['t'] === 'txt') { $m2[$li]['s'] .= $sg['s']; } else { $m2[] = $sg; } }
            $segs = array_map(static function ($sg) { if ($sg['t'] === 'txt') { $sg['s'] = (string) preg_replace('/\s+([.,;:!?])/u', '$1', (string) preg_replace('/[ \t]{2,}/u', ' ', $sg['s'])); } return $sg; }, $m2);
            $plain = trim(implode('', array_map(static fn($s) => $s['t'] === 'txt' ? $s['s'] : '', $segs)));
            preg_match_all('/(?<!\d)(1[0-9]{3}|20[0-9]{2})(?!\d)/', $plain, $ym);
            $years = array_map('intval', $ym[1]);
            $said = (bool) preg_match('/\(\s*supposée?s?\s*\)|(?<!\p{L})supposée?s?(?!\p{L})|\[\?\]|(?<!\p{L})(?:sans doute|peut-être|probablement|il est possible)(?!\p{L})/iu', $plain);
            $k = 'plain';
            if ($invented || $said) { $k = 'supposed'; }
            elseif ($cS) { $k = 'sourced'; }
            elseif ($cP) {
                $known = $extraYears; foreach ($cP as $id) { $known = array_merge($known, $yearsOf($id)); }
                $bad = array_filter($years, static fn($y) => !in_array($y, $known, true) && !in_array($y - 1, $known, true) && !in_array($y + 1, $known, true));
                $k = $bad ? 'supposed' : 'ok';
            } elseif ($years) { $k = array_diff($years, $extraYears) ? 'supposed' : 'plain'; }
            $segs = array_values(array_map(static function ($s) { if ($s['t'] === 'txt') { $s['s'] = (string) preg_replace('/\s*\(\s*supposée?s?\s*\)/iu', '', $s['s']); } return $s; }, $segs));
            $line[] = ['k' => $k, 'segs' => $segs, 'invented' => $invented];
        }
        $out[] = ['bullet' => $bullet, 'sents' => $line];
    }
    $count = static fn(string $k) => array_sum(array_map(static fn($p) => count(array_filter($p['sents'], static fn($s) => $s['k'] === $k)), $out));
    return ['paras' => $out, 'persons' => array_values($persons), 'sources' => array_values($sources), 'removed' => array_values(array_unique($removed)), 'supposed' => $count('supposed'), 'raw' => $raw];
}
/** le texte vérifié, en clair (pour une note) : les fiches par leur nom, les sources [S1] avec la liste à la fin */
function aia_plain(array $v): string
{
    $txt = [];
    foreach ($v['paras'] as $p) {
        $s = trim(implode(' ', array_map(static function ($x) use ($v) {
            $t = implode('', array_map(static function ($g) use ($v) { if ($g['t'] === 'txt') { return $g['s']; } if ($g['t'] === 's') { return '[S' . $g['n'] . ']'; } return ''; }, $x['segs']));
            $t = trim((string) preg_replace('/\s+([.,;:])/u', '$1', (string) preg_replace('/\s{2,}/u', ' ', $t)));
            return $x['k'] === 'supposed' ? $t . ' ' . i18n_t('(supposé)') : $t;
        }, $p['sents'])));
        $txt[] = ($p['bullet'] ? '- ' : '') . $s;
    }
    $out = implode("\n\n", $txt);
    if ($v['sources']) { $out .= "\n\n" . i18n_t('Sources :') . "\n" . implode("\n", array_map(static fn($s) => '[S' . $s['n'] . '] ' . $s['title'] . ($s['url'] !== '' ? ' — ' . $s['url'] : ''), $v['sources'])); }
    return $out;
}

/* ═════════════════════ parler à Ollama (sur cet ordinateur seulement) ═════════════════════ */

/** le modèle à utiliser : celui demandé s'il est installé, sinon celui de la lecture des actes (Qwen3-VL 8B), sinon le premier installé */
function aia_pick_model(string $want, ?array $st = null): array
{
    $st ??= tx_deep_status();
    if (!$st['local_only']) { throw new RuntimeException(i18n_t('L’adresse d’Ollama n’est pas sur cet ordinateur : l’assistant est éteint.')); }
    if (!$st['running'] && ia_srv_is_openai()) { throw new RuntimeException(i18n_t('{s} ne répond pas à l’adresse {u} : lance-le, puis « ↻ Tester la connexion » (Réglages → 🤖 IA).', ['s' => ia_srv_public()['label'], 'u' => ia_srv_url()])); }
    if (!$st['running']) { throw new RuntimeException($st['installed'] ? i18n_t('Ollama est installé mais ne tourne pas : lance-le, puis réessaie.') : i18n_t('L’IA n’est pas encore installée sur cet ordinateur : ouvre l’installation guidée (Réglages → 🤖 IA).')); }
    $present = array_values(array_filter(array_merge($st['models'], $st['others'] ?? []), static fn($m) => !empty($m['present'])));
    if (!$present && ia_srv_is_openai()) { throw new RuntimeException(i18n_t('{s} répond, mais aucun modèle n’y est chargé : choisis et lance un modèle dans {s}, puis réessaie.', ['s' => ia_srv_public()['label']])); }
    if (!$present) { throw new RuntimeException(i18n_t('Aucun modèle d’IA n’est installé dans Ollama : installe-en un avec l’installation guidée (Réglages → 🤖 IA).')); }
    foreach ($present as $m) { if ($want !== '' && $m['tag'] === $want) { return $m; } }
    foreach (['qwen3-vl:8b-instruct', 'qwen3-vl:4b-instruct', 'mistral-small3.2:24b'] as $t) { foreach ($present as $m) { if ($m['tag'] === $t) { return $m; } } }
    return $present[0];
}

/** un appel à /api/chat (sans flux) ; rend [message, erreur] */
function aia_ollama(string $model, array $messages, ?array $tools, bool $json = false): array
{
    $body = ['model' => $model, 'stream' => false, 'keep_alive' => '10m', 'messages' => $messages, 'options' => ['temperature' => 0.2, 'num_ctx' => 16384, 'num_predict' => 2048], 'think' => false];
    if ($tools) { $body['tools'] = $tools; }
    if ($json) { $body['format'] = 'json'; }
    $r = tx_deep_http('POST', '/api/chat', $body, AIA_TIMEOUT);
    $err = (string) ($r['json']['error'] ?? '');
    if (!$r['ok'] && $err !== '' && stripos($err, 'think') !== false) { unset($body['think']); $r = tx_deep_http('POST', '/api/chat', $body, AIA_TIMEOUT); $err = (string) ($r['json']['error'] ?? ''); }
    if (($r['error'] ?? '') === 'unreachable') { return [null, ia_srv_is_openai() ? i18n_t('{s} ne répond pas à l’adresse {u} : est-il lancé ?', ['s' => ia_srv_public()['label'], 'u' => ia_srv_url()]) : i18n_t('Ollama ne répond pas : est-il lancé ?')]; }
    if (!$r['ok']) { return [null, $err !== '' ? $err : i18n_t('Ollama a répondu {c}.', ['c' => (string) ($r['code'] ?? '?')])]; }
    $m = $r['json']['message'] ?? null;
    return [is_array($m) ? $m : null, is_array($m) ? '' : i18n_t('Réponse vide d’Ollama.')];
}

function aia_system_prompt(PDO $pdo, string $proto): string
{
    $root = (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn();
    $me = $root && !aia_is_hidden($pdo, $root) ? i18n_t('La personne de départ de l’arbre (Sosa 1) est la fiche {n}.', ['n' => $root]) : i18n_t('La personne de départ de l’arbre (Sosa 1) est une personne vivante : son nom n’est pas donné.');
    $p = "Tu es l’assistant généalogique de l’application LCNDA. Nous sommes le " . date('d/m/Y') . ". $me\n"
        . "Tu ne vois pas la base de données : pour savoir quelque chose, APPELLE LES OUTILS (chercher_personnes, lire_fiche, poser_question…), puis réponds.\n"
        . "Règles :\n"
        . "1. Réponds en français simple et court.\n"
        . "2. Chaque fois que tu parles d’une personne, cite sa fiche ainsi : [fiche N] (N = le numéro rendu par un outil). Quand un outil donne une source pour ce fait, cite-la : [source N].\n"
        . "3. N’invente JAMAIS un numéro de fiche ou de source ; ne cite que ce que les outils t’ont rendu.\n"
        . "4. Ce que tu déduis sans preuve : écris « (supposé) » à la fin de la phrase.\n"
        . "5. Les personnes vivantes ou confidentielles sont cachées (« personne vivante ») : n’en parle pas.\n"
        . "6. Tu ne modifies rien. Pour proposer d’AJOUTER un événement « à vérifier », une note, une source ou une ligne du journal des recherches, appelle proposer_ajout. Jamais corriger, jamais supprimer.\n";
    if ($proto === 'json') {
        $p .= "\nTu réponds TOUJOURS par un seul objet JSON, rien d’autre :\n"
            . "- pour appeler un outil : {\"outil\": \"nom\", \"arguments\": {…}}\n- pour répondre à l’utilisateur : {\"reponse\": \"ton texte avec les renvois [fiche N]\"}\n"
            . "Les outils :\n";
        foreach (aia_tools_def() as $t) { $p .= '- ' . $t['function']['name'] . ' : ' . $t['function']['description'] . ' Arguments : ' . implode(', ', array_keys((array) $t['function']['parameters']['properties'])) . "\n"; }
    }
    return $p;
}

/* ═════════════════════ 🤖 la conversation, pas à pas ═════════════════════ */

function aia_turn_out(PDO $pdo, array $t): array
{
    return ['q' => (string) $t['q'], 'at' => (string) $t['at'], 'state' => (string) $t['state'], 'steps' => $t['steps'] ?? [], 'answer' => $t['answer'] ?? null, 'error' => (string) ($t['error'] ?? ''),
        'proposals' => array_values(array_map('intval', $t['proposals'] ?? []))];
}
function aia_conv_out(PDO $pdo, array $c): array
{
    return ['id' => $c['id'], 'kind' => $c['kind'], 'title' => $c['title'], 'person_id' => (int) $c['person_id'], 'model' => (string) $c['model'], 'temp' => !empty($c['temp']),
        'turns' => array_map(static fn($t) => aia_turn_out($pdo, $t), $c['turns']), 'proposals' => array_map(static fn($p) => aia_proposal_out($pdo, $p), $c['proposals'] ?? []),
        'gen' => $c['gen'] ?? null, 'updated' => (string) ($c['updated'] ?? '')];
}

/** POST aia_chat_start : une question (nouvelle conversation, ou la suite d'une conversation) */
function aia_chat_start(PDO $pdo, array $d): array
{
    $q = trim(mb_substr(safe_text($d['question'] ?? ''), 0, 1500));
    if ($q === '') { throw new LcndaBadInput(i18n_t('Pose ta question.')); }
    $pid = safe_int($d['person_id'] ?? 0);
    if ($pid && aia_is_hidden($pdo, $pid)) { throw new LcndaBadInput(i18n_t('Cette fiche est celle d’une personne vivante ou confidentielle : l’assistant ne la lit pas.')); }
    $m = aia_pick_model(safe_text($d['model'] ?? ''));
    $cid = (string) ($d['conv_id'] ?? '');
    $conv = $cid !== '' ? aia_conv_get($cid) : aia_conv_new('chat', $q, $pid, $m['tag'], !isset($d['keep']) || !empty($d['keep']));
    if ($conv['kind'] !== 'chat') { throw new LcndaBadInput(i18n_t('Conversation inconnue.')); }
    $conv['model'] = $m['tag'];
    foreach ($conv['turns'] as $t) { if ($t['state'] === 'working') { throw new RuntimeException(i18n_t('L’assistant répond encore à la question d’avant.')); } }
    $sent = aia_scrub($pdo, $q);
    if ($pid) { $sent .= "\n" . i18n_t('(Cette question concerne la fiche {n}.)', ['n' => $pid]); $conv['seen']['p'][(string) $pid] = true; }
    $conv['turns'][] = ['q' => $q, 'q_sent' => $sent, 'at' => date('c'), 'state' => 'working', 'steps' => [], 'msgs' => [['role' => 'user', 'content' => $sent]], 'rounds' => 0, 'proposals' => []];
    aia_conv_save($conv);
    return ['conv' => aia_conv_out($pdo, $conv)];
}

/** les messages envoyés au modèle : le cadre, les questions et réponses d'avant, puis ce tour-ci */
function aia_messages(PDO $pdo, array $conv): array
{
    $msgs = [['role' => 'system', 'content' => aia_system_prompt($pdo, $conv['proto'])]];
    $n = count($conv['turns']);
    foreach ($conv['turns'] as $i => $t) {
        if ($i === $n - 1) { break; }
        if ($t['state'] !== 'done') { continue; }
        $msgs[] = ['role' => 'user', 'content' => $t['q_sent']];
        $msgs[] = ['role' => 'assistant', 'content' => $conv['proto'] === 'json' ? json_encode(['reponse' => (string) ($t['answer']['raw'] ?? '')], JSON_UNESCAPED_UNICODE) : (string) ($t['answer']['raw'] ?? '')];
    }
    return array_merge($msgs, $conv['turns'][$n - 1]['msgs']);
}

/** un pas de la conversation : un appel au modèle, et les outils qu'il demande */
function aia_chat_step(PDO $pdo, array &$conv): void
{
    $ti = count($conv['turns']) - 1; $turn = &$conv['turns'][$ti];
    if ($turn['state'] !== 'working') { return; }
    $last = $turn['rounds'] >= AIA_MAX_ROUNDS;
    if ($last) { $turn['msgs'][] = ['role' => 'user', 'content' => 'Tu as assez cherché : réponds maintenant avec ce que tu sais (avec les renvois [fiche N]).']; }
    $json = $conv['proto'] === 'json';
    [$msg, $err] = aia_ollama($conv['model'], aia_messages($pdo, $conv), $json || $last ? null : aia_tools_def(), $json);
    if ($msg === null && !$json && preg_match('/does not support tools|tools? (are )?not supported/i', $err)) {
        $conv['proto'] = 'json'; $turn['steps'][] = ['icon' => 'ℹ️', 'label' => i18n_t('Ce modèle ne sait pas appeler les outils directement : l’app lui parle en JSON.'), 'detail' => '', 'where' => 'local'];
        return; // le pas suivant repart en JSON
    }
    if ($msg === null) { $turn['state'] = 'error'; $turn['error'] = $err; return; }
    $turn['rounds']++;
    $calls = [];
    $content = trim((string) ($msg['content'] ?? ''));
    if (!$json && !empty($msg['tool_calls'])) {
        foreach ($msg['tool_calls'] as $tc) { $fn = $tc['function'] ?? []; $args = $fn['arguments'] ?? []; if (is_string($args)) { $args = json_decode($args, true) ?: []; } $calls[] = [(string) ($fn['name'] ?? ''), is_array($args) ? $args : []]; }
        $turn['msgs'][] = ['role' => 'assistant', 'content' => $content, 'tool_calls' => $msg['tool_calls']];
    } elseif ($json) {
        $j = json_decode((string) preg_replace('/^```[a-z]*\s*|\s*```$/', '', $content), true);
        $turn['msgs'][] = ['role' => 'assistant', 'content' => $content];
        if (is_array($j) && isset($j['outil'])) { $calls[] = [(string) $j['outil'], is_array($j['arguments'] ?? null) ? $j['arguments'] : []]; }
        elseif (is_array($j) && isset($j['reponse'])) { $content = (string) $j['reponse']; }
        elseif (!is_array($j)) { /* du texte brut : pris comme réponse */ }
        else { $content = (string) ($j['réponse'] ?? $j['answer'] ?? json_encode($j, JSON_UNESCAPED_UNICODE)); }
    }
    if ($calls && !$last) {
        foreach (array_slice($calls, 0, 4) as [$name, $args]) {
            $res = aia_tool($pdo, $name, $args, $conv, $step);
            $turn['steps'][] = $step;
            if (($name === 'proposer_ajout') && isset($res['proposition'])) { $turn['proposals'][] = (int) $res['proposition']; }
            $payload = json_encode($res, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $turn['msgs'][] = $json ? ['role' => 'user', 'content' => "Résultat de l’outil $name : $payload"] : ['role' => 'tool', 'content' => $payload, 'tool_name' => $name];
        }
        return;
    }
    if ($content === '') { $turn['state'] = 'error'; $turn['error'] = i18n_t('Le modèle n’a rien répondu.'); return; }
    preg_match_all('/(?<!\d)(1[0-9]{3}|20[0-9]{2})(?!\d)/', (string) $turn['q'], $qy); // les années de la question viennent de l'utilisateur
    $turn['answer'] = aia_verify($pdo, $content, $conv, array_map('intval', $qy[1]));
    $turn['state'] = 'done';
    unset($turn);
}

/* ═════════════════════ 🕵️ le généalogiste IA, depuis une fiche ═════════════════════ */

function aia_gen_start(PDO $pdo, array $d): array
{
    $pid = safe_int($d['person_id'] ?? 0);
    if (!$pid || !person_exists($pdo, $pid)) { throw new LcndaBadInput(i18n_t('Fiche introuvable.')); }
    if (aia_is_hidden($pdo, $pid)) { throw new LcndaBadInput(i18n_t('Cette fiche est celle d’une personne vivante ou confidentielle : l’assistant ne la lit pas.')); }
    $m = aia_pick_model(safe_text($d['model'] ?? ''));
    $conv = aia_conv_new('gen', i18n_t('🕵️ Généalogiste : {n}', ['n' => aia_name($pdo, $pid)]), $pid, $m['tag'], !isset($d['keep']) || !empty($d['keep']));
    $conv['gen'] = ['stage' => 'base', 'openarch' => !empty($d['openarch']), 'person' => aia_brief($pdo, $pid), 'gaps' => [], 'pistes' => [], 'leads' => [], 'where' => [], 'summary' => ''];
    $conv['turns'][] = ['q' => i18n_t('Cherche ce qui manque'), 'q_sent' => '', 'at' => date('c'), 'state' => 'working', 'steps' => [], 'msgs' => [], 'rounds' => 0, 'proposals' => []];
    aia_conv_save($conv);
    return ['conv' => aia_conv_out($pdo, $conv)];
}

function aia_gen_step(PDO $pdo, array &$conv): void
{
    $g = &$conv['gen']; $turn = &$conv['turns'][0]; $pid = (int) $conv['person_id'];
    if ($turn['state'] !== 'working') { return; }
    if (!function_exists('pst_facts')) { require_once __DIR__ . '/pistes_auto.php'; }
    pst_schema($pdo);
    switch ($g['stage']) {
        case 'base': {
            $card = aia_person_card($pdo, $pid, $conv);
            $g['card'] = $card;
            $g['gaps'] = aia_gaps($pdo, $pid);
            $hint = '';
            foreach ($card['notes'] ?? [] as $n) { if (preg_match('/\b(fils|fille)\s+(de|d’|d\')\s*[^.;\n]{3,80}/iu', $n['texte'], $mm)) { $hint = $mm[0]; break; } }
            $turn['steps'][] = ['icon' => '✓', 'label' => i18n_t('Ta base : fiche, famille, notes'), 'detail' => trim(i18n_t('{e} événement(s), {s} source(s), {n} note(s)', ['e' => count($card['evenements']), 's' => count($card['sources']), 'n' => count($card['notes'] ?? [])]) . ($hint !== '' ? ' · « ' . $hint . ' » ' . i18n_t('écrit dans une note') : '')), 'where' => 'local'];
            $g['stage'] = 'local'; return;
        }
        case 'local': {
            $r = aia_local_bases($pdo, $pid, true);
            foreach ($r['checked'] as $c) { $turn['steps'][] = ['icon' => '✓', 'label' => $c['base'], 'detail' => $c['etat'], 'where' => 'local']; }
            $s = $pdo->prepare("SELECT count(*) FROM pistes WHERE person_id=? AND status='new' AND src<>'oa'"); $s->execute([$pid]);
            $turn['steps'][] = ['icon' => '✓', 'label' => i18n_t('Pistes déjà trouvées pour elle'), 'detail' => i18n_t('{n} à vérifier', ['n' => (int) $s->fetchColumn()]), 'where' => 'local'];
            $g['stage'] = 'oa'; return;
        }
        case 'oa': {
            $g['stage'] = 'where';
            $label = i18n_t('🌐 Open Archives');
            if (empty($g['openarch'])) { $turn['steps'][] = ['icon' => '–', 'label' => $label, 'detail' => i18n_t('désactivé dans les réglages : rien n’est parti'), 'where' => 'net']; return; }
            $f = pst_facts($pdo, $pid);
            if (($why = pst_private_reason($f)) !== '') { $turn['steps'][] = ['icon' => '–', 'label' => $label, 'detail' => i18n_t('rien n’est envoyé pour cette fiche ({w})', ['w' => str_replace('_', ' ', $why)]), 'where' => 'net']; return; }
            $q = pst_oa_query($f);
            if (!$q) { $turn['steps'][] = ['icon' => '–', 'label' => $label, 'detail' => i18n_t('pas assez pour chercher (nom et années)'), 'where' => 'net']; return; }
            if (!function_exists('ouc_oa_cached')) { require_once __DIR__ . '/ou_chercher_openarch.php'; }
            try { [$j, $cached] = ouc_oa_cached($pdo, 'records/search.json', $q); }
            catch (Throwable $e) { $turn['steps'][] = ['icon' => '✗', 'label' => $label, 'detail' => $e->getMessage(), 'where' => 'net']; return; }
            if (!$cached) { aia_log_add('openarch.nl', $q['name'], $pid); }
            $decided = pst_decided($pdo, $pid); $n = 0; $total = (int) ($j['response']['number_found'] ?? 0);
            foreach ((array) ($j['response']['docs'] ?? []) as $doc) {
                if (!is_array($doc) || !($row = ouc_oa_row($doc)) || isset($decided['oa|' . $row['key']])) { continue; }
                $sc = pst_oa_score($f, $row);
                if (!$sc || $sc['score'] < PA_MIN_SCORE) { continue; }
                pst_save($pdo, $pid, 'oa', $row['key'], $sc['score'], pst_oa_title($row), $row['url'], ['archive_code' => $row['archive_code'], 'identifier' => $row['identifier'], 'pid' => $row['pid'],
                    'tag' => $sc['tag'], 'main' => $sc['main'], 'date' => (string) ($row['year'] ?: ''), 'year' => $row['year'], 'place' => $row['place'], 'archive' => $row['archive'], 'role' => $row['role'], 'type' => $row['type'],
                    'source' => $row['source'], 'licence' => i18n_t('celle de l’archive (le plus souvent CC0 1.0)'), 'source_url' => 'https://www.openarchieven.nl/', 'why' => $sc['why']]);
                $n++;
            }
            $turn['steps'][] = ['icon' => '✓', 'label' => $label . ' « ' . $q['name'] . ' »', 'detail' => i18n_t('{t} résultat(s), {n} qui lui ressemble(nt)', ['t' => $total, 'n' => $n]) . ($cached ? ' · ' . i18n_t('réponse déjà gardée : rien n’est reparti') : ''), 'where' => 'net'];
            return;
        }
        case 'where': {
            $f = pst_facts($pdo, $pid);
            $name = trim(($f['first'] ?? '') . ' ' . ($f['last'] ?? ''));
            $y = $f['birth'] ?? null;
            $links = [
                ['label' => 'Geneanet', 'url' => 'https://www.geneanet.org/fonds/individus/?go=1&nom=' . rawurlencode((string) $f['last']) . '&prenom=' . rawurlencode((string) $f['first']) . ($y ? '&periode_type=entre&from=' . ($y - 5) . '&to=' . ($y + 90) : '')],
                ['label' => 'FamilySearch', 'url' => 'https://www.familysearch.org/search/record/results?q.givenName=' . rawurlencode((string) $f['first']) . '&q.surname=' . rawurlencode((string) $f['last']) . ($y ? '&q.birthLikeDate.from=' . ($y - 2) . '&q.birthLikeDate.to=' . ($y + 2) : '')],
                ['label' => 'FranceArchives', 'url' => 'https://francearchives.gouv.fr/fr/search?q=' . rawurlencode($name)]];
            $g['where'] = [];
            foreach ($g['gaps'] as $gp) {
                $dec = array_slice($gp['decennial'] ?? [], 0, 4);
                $w = ['kind' => $gp['kind'], 'manque' => $gp['manque'], 'why' => $gp['why'], 'archive' => $gp['archive'], 'site' => $gp['site'], 'place' => $gp['place'],
                    'decennial' => $dec, 'steps' => array_slice($gp['where'], 0, 3), 'from' => $gp['from'], 'to' => $gp['to'], 'proposal' => 0];
                // « 🗓 Mettre dans le suivi des recherches » : une ligne du journal, ajoutée seulement après un clic
                try {
                    $p = aia_proposal_make($pdo, ['fiche' => $pid, 'quoi' => 'journal', 'titre' => i18n_t('Chercher : {m}', ['m' => $gp['manque']]) . ($gp['archive'] !== '' ? ' — ' . $gp['archive'] : ''),
                        'texte' => trim(($gp['place'] !== '' ? $gp['place'] . '. ' : '') . ($dec ? i18n_t('Tables décennales {t}.', ['t' => implode(', ', $dec)]) . ' ' : '') . implode(' ', array_map(static fn($s) => $s['series'] . ' : ' . $s['detail'], array_slice($gp['where'], 0, 2))) . ($gp['site'] !== '' ? ' ' . $gp['site'] : '')),
                        'raison' => $gp['why']]);
                    $p['id'] = count($conv['proposals']) + 1; $conv['proposals'][] = $p; $w['proposal'] = $p['id'];
                } catch (Throwable $_) {}
                $g['where'][] = $w;
            }
            $g['links'] = $links;
            $arch = $g['gaps'][0]['archive'] ?? '';
            $turn['steps'][] = ['icon' => '✓', 'label' => i18n_t('Où chercher'), 'detail' => trim(($arch !== '' ? $arch . ' · ' : '') . i18n_t('liens seulement : à ouvrir toi-même')), 'where' => 'links'];
            $g['stage'] = 'ai'; return;
        }
        case 'ai': {
            $s = $pdo->prepare("SELECT id, src, title, score, url, data FROM pistes WHERE person_id=? AND status='new' ORDER BY score DESC LIMIT 12"); $s->execute([$pid]);
            $pistes = [];
            foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $dd = json_decode((string) $r['data'], true) ?: []; $pistes[] = ['piste' => (int) $r['id'], 'titre' => (string) $r['title'], 'ressemblance' => (int) $r['score'] . ' %', 'pourquoi' => implode(' ; ', array_map(static fn($w) => ($w[0] === 'ok' ? '✓ ' : ($w[0] === 'no' ? '✗ ' : '? ')) . $w[1], $dd['why'] ?? []))]; $conv['seen']['piste'][(string) $r['id']] = true; }
            $g['pistes'] = array_map(static fn($p) => $p['piste'], $pistes);
            $ctx = ['fiche' => $g['card'], 'manques' => array_map(static fn($x) => ['manque' => $x['manque'], 'pourquoi' => $x['why']], $g['gaps']), 'pistes_trouvees' => $pistes];
            $prompt = "Tu es un généalogiste. Voici tout ce que l’app sait de la fiche {$pid} et les pistes trouvées dans les bases (JSON) :\n" . json_encode($ctx, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
                . "\n\nClasse les pistes les plus utiles, de la plus sûre à la moins sûre. Réponds par UN objet JSON : {\"pistes\": [{\"titre\": \"…\", \"preuve\": \"… avec les renvois [fiche N] et [source N]\", \"confiance\": \"forte\"|\"moyenne\"|\"faible\", \"pistes\": [numéros de piste_trouvee utilisés], \"ajout\": null ou {\"quoi\": \"evenement\"|\"note\", \"evenement\": \"DEAT\", \"date\": \"après 1858\", \"lieu\": \"…\", \"titre\": \"…\", \"texte\": \"…\", \"raison\": \"…\"}}], \"resume\": \"une phrase\"}. "
                . "Rien que des AJOUTS (jamais corriger ni supprimer). N’invente aucun numéro. Les personnes vivantes sont cachées.";
            $msgs = [['role' => 'system', 'content' => aia_system_prompt($pdo, 'tools')], ['role' => 'user', 'content' => $prompt]];
            [$msg, $err] = aia_ollama($conv['model'], $msgs, null, true);
            $turn['rounds']++;
            $j = $msg ? json_decode((string) preg_replace('/^```[a-z]*\s*|\s*```$/', '', trim((string) ($msg['content'] ?? ''))), true) : null;
            $leads = [];
            if (is_array($j) && is_array($j['pistes'] ?? null)) {
                foreach (array_slice($j['pistes'], 0, 6) as $x) {
                    if (!is_array($x)) { continue; }
                    $ids = array_values(array_filter(array_map('intval', (array) ($x['pistes'] ?? [])), static fn($i) => in_array($i, $g['pistes'], true)));
                    $bad = array_diff(array_map('intval', (array) ($x['pistes'] ?? [])), $ids);
                    $proof = aia_verify($pdo, (string) ($x['preuve'] ?? ''), $conv);
                    if ($bad) { $proof['removed'] = array_merge($proof['removed'], array_map(static fn($i) => i18n_t('piste {n}', ['n' => $i]), $bad)); }
                    $conf = in_array($x['confiance'] ?? '', ['forte', 'moyenne', 'faible'], true) ? (string) $x['confiance'] : 'faible';
                    if ($proof['supposed'] && $conf === 'forte') { $conf = 'moyenne'; } // une preuve non vérifiée ne fait jamais une piste « forte »
                    $lead = ['title' => mb_substr(aia_scrub($pdo, (string) ($x['titre'] ?? '')), 0, 200), 'confidence' => $conf, 'proof' => $proof, 'pistes' => $ids, 'proposal' => 0, 'by' => 'ai'];
                    if (is_array($x['ajout'] ?? null)) {
                        try { $p = aia_proposal_make($pdo, ['fiche' => $pid] + $x['ajout']); $p['id'] = count($conv['proposals']) + 1; $conv['proposals'][] = $p; $lead['proposal'] = $p['id']; } catch (Throwable $_) {}
                    }
                    if ($lead['title'] !== '') { $leads[] = $lead; }
                }
                $g['summary'] = mb_substr(aia_scrub($pdo, (string) ($j['resume'] ?? '')), 0, 400);
                $turn['steps'][] = ['icon' => '✓', 'label' => i18n_t('L’IA classe les pistes'), 'detail' => i18n_t('{n} piste(s)', ['n' => count($leads)]), 'where' => 'local'];
            } else {
                $turn['steps'][] = ['icon' => '✗', 'label' => i18n_t('L’IA classe les pistes'), 'detail' => $err !== '' ? $err : i18n_t('réponse illisible : voici les pistes de l’app, sans classement de l’IA'), 'where' => 'local'];
            }
            // les pistes de l'app que l'IA n'a pas reprises : gardées, avec leur note (rien n'est perdu)
            $used = []; foreach ($leads as $l) { $used = array_merge($used, $l['pistes']); }
            foreach ($pistes as $p) {
                if (in_array($p['piste'], $used, true)) { continue; }
                $sc = (int) $p['ressemblance'];
                $leads[] = ['title' => $p['titre'], 'confidence' => $sc >= 85 ? 'forte' : ($sc >= 70 ? 'moyenne' : 'faible'), 'proof' => null, 'why' => $p['pourquoi'], 'pistes' => [$p['piste']], 'proposal' => 0, 'by' => 'app'];
            }
            $g['leads'] = $leads;
            $g['stage'] = 'done'; $turn['state'] = 'done';
            return;
        }
    }
    unset($g, $turn);
}
/** les pistes (table pistes) citées par le généalogiste, pour l'écran */
function aia_gen_pistes(PDO $pdo, array $ids): array
{
    if (!$ids) { return []; }
    if (!function_exists('pst_row_out')) { require_once __DIR__ . '/pistes_auto.php'; }
    $s = $pdo->query('SELECT p.*, pe.first_name, pe.last_name, pe.gender FROM pistes p JOIN persons pe ON pe.id=p.person_id WHERE p.id IN (' . implode(',', array_map('intval', $ids)) . ')');
    $out = []; foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[(int) $r['id']] = pst_row_out($r); }
    return $out;
}

/* ═════════════════════ ✍️ le récit de vie par l'IA ═════════════════════ */

function aia_recit_start(PDO $pdo, array $d): array
{
    $pid = safe_int($d['person_id'] ?? 0);
    if (!$pid || !person_exists($pdo, $pid)) { throw new LcndaBadInput(i18n_t('Fiche introuvable.')); }
    if (aia_is_hidden($pdo, $pid)) { throw new LcndaBadInput(i18n_t('Cette fiche est celle d’une personne vivante ou confidentielle : l’assistant ne la lit pas.')); }
    $m = aia_pick_model(safe_text($d['model'] ?? ''));
    $conv = aia_conv_new('recit', i18n_t('✍️ Récit : {n}', ['n' => aia_name($pdo, $pid)]), $pid, $m['tag'], !isset($d['keep']) || !empty($d['keep']));
    $conv['turns'][] = ['q' => i18n_t('Raconte la vie de {n}', ['n' => aia_name($pdo, $pid)]), 'q_sent' => '', 'at' => date('c'), 'state' => 'working', 'steps' => [], 'msgs' => [], 'rounds' => 0, 'proposals' => []];
    aia_conv_save($conv);
    return ['conv' => aia_conv_out($pdo, $conv)];
}
function aia_recit_step(PDO $pdo, array &$conv): void
{
    $turn = &$conv['turns'][0]; $pid = (int) $conv['person_id'];
    if ($turn['state'] !== 'working') { return; }
    $card = aia_person_card($pdo, $pid, $conv);
    $bio = '';
    try {
        bio_hidden_persons(aia_hidden($pdo)); // la biographie de l'app ne nomme pas les vivants
        $bio = aia_scrub($pdo, bio_strip_private((string) (bio_generate($pdo, $pid, ['length' => 'long', 'sources' => 'none'])['text'] ?? '')));
    } catch (Throwable $_) {}
    $turn['steps'][] = ['icon' => '✓', 'label' => i18n_t('Lire la fiche de {n}', ['n' => $card['nom']]), 'detail' => i18n_t('{e} événement(s), {s} source(s)', ['e' => count($card['evenements']), 's' => count($card['sources'])]), 'where' => 'local'];
    $turn['steps'][] = ['icon' => '✓', 'label' => i18n_t('La biographie de l’app, comme base'), 'detail' => $bio !== '' ? i18n_t('{n} mots', ['n' => str_word_count($bio)]) : i18n_t('vide'), 'where' => 'local'];
    $prompt = "Écris le récit de vie de la fiche {$pid}, en français, chaleureux mais exact, 2 à 4 paragraphes. Base factuelle (n’invente rien qui la contredise) :\n"
        . "Biographie de l’app : " . ($bio !== '' ? $bio : '(vide)') . "\nFiche (JSON) : " . json_encode($card, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
        . "\n\nCite les fiches [fiche N] et les sources [source N]. Ce qui est imaginé ou déduit (le contexte, les sentiments) : ajoute « (supposé) » à la phrase. Réponds par le texte seul.";
    [$msg, $err] = aia_ollama($conv['model'], [['role' => 'system', 'content' => aia_system_prompt($pdo, 'tools')], ['role' => 'user', 'content' => $prompt]], null);
    $turn['rounds']++;
    if ($msg === null || trim((string) ($msg['content'] ?? '')) === '') { $turn['state'] = 'error'; $turn['error'] = $err !== '' ? $err : i18n_t('Le modèle n’a rien écrit.'); return; }
    $turn['answer'] = aia_verify($pdo, (string) $msg['content'], $conv);
    $turn['answer']['note'] = aia_plain($turn['answer']);
    $turn['state'] = 'done';
    // la proposition « 📖 Mettre dans une note « Biographie à relire » » (jamais à la place de la biographie de l'app)
    $p = aia_proposal_make($pdo, ['fiche' => $pid, 'quoi' => 'note', 'titre' => i18n_t('📖 Biographie à relire (écrite par l’IA)'),
        'texte' => $turn['answer']['note'] . "\n\n" . i18n_t('Écrite par l’assistant IA ({m}) : à relire, elle peut contenir des suppositions. La biographie de l’app n’a pas changé.', ['m' => $conv['model']]),
        'raison' => i18n_t('récit de vie à relire')]);
    $p['id'] = count($conv['proposals']) + 1; $conv['proposals'][] = $p; $turn['proposals'][] = $p['id'];
    unset($turn);
}

/* ═════════════════════ aiguillage ═════════════════════ */

/** POST aia_step : un pas (conversation, généalogiste, récit) */
function aia_step(PDO $pdo, array $d): array
{
    $conv = aia_conv_get((string) ($d['conv_id'] ?? ''));
    if (isset($d['openarch']) && isset($conv['gen'])) { $conv['gen']['openarch'] = $conv['gen']['openarch'] && !empty($d['openarch']); }
    try {
        match ($conv['kind']) { 'gen' => aia_gen_step($pdo, $conv), 'recit' => aia_recit_step($pdo, $conv), default => aia_chat_step($pdo, $conv) };
    } catch (Throwable $e) {
        $i = count($conv['turns']) - 1; if ($i >= 0) { $conv['turns'][$i]['state'] = 'error'; $conv['turns'][$i]['error'] = $e->getMessage(); }
    }
    aia_conv_save($conv);
    $out = aia_conv_out($pdo, $conv);
    if ($conv['kind'] === 'gen') { $ids = []; foreach ($conv['gen']['leads'] ?? [] as $l) { $ids = array_merge($ids, $l['pistes']); } $out['pistes'] = aia_gen_pistes($pdo, $ids); }
    return ['conv' => $out];
}

/** GET aia_status : Ollama, le modèle choisi, s'il sait appeler les outils */
function aia_status(array $q): array
{
    $st = tx_deep_status();
    $srv = ia_srv_public(); unset($srv['kinds'], $srv['probes']); // 🖥 le serveur choisi (Ollama, Unsloth, compatible OpenAI : lib/ia_serveur.php)
    $out = ['ollama' => $st, 'server' => $srv, 'ready' => false, 'model' => null, 'message' => '', 'tools' => null, 'setup_url' => $srv['api'] === 'ollama' ? ($st['download_url'] ?? 'https://ollama.com/download') : ($srv['site'] ?: '')];
    try {
        $m = aia_pick_model(safe_text($q['model'] ?? ''), $st);
        $out['model'] = $m; $out['ready'] = true;
        $sh = tx_deep_http('POST', '/api/show', ['model' => $m['tag']], 4);
        $caps = $sh['ok'] ? array_map('strval', (array) ($sh['json']['capabilities'] ?? [])) : [];
        $out['tools'] = $caps ? in_array('tools', $caps, true) : null;
    } catch (Throwable $e) { $out['message'] = $e->getMessage(); }
    return $out;
}

/** 🧭 Je veux… (assets/js/app-je-veux-ui.js) : réécrire une phrase avec les mots de l'app, quand rien ne correspond.
 *  Seulement l'IA de cet ordinateur (aia_pick_model refuse une adresse qui n'est pas locale) ; elle ne choisit rien : elle propose
 *  une autre phrase, que la personne voit, puis le moteur cherche à nouveau. Rien de la généalogie n'est envoyé : la phrase et les noms des intentions. */
function aia_rephrase(array $d): array
{
    $q = trim(mb_substr(safe_text($d['q'] ?? ''), 0, 300));
    if ($q === '') { throw new LcndaBadInput(i18n_t('Rien à reformuler.')); }
    $names = json_decode((string) ($d['names'] ?? '[]'), true);
    $names = array_slice(array_values(array_filter(array_map(static fn($n) => is_string($n) ? mb_substr(trim($n), 0, 80) : '', is_array($names) ? $names : []))), 0, 120);
    $m = aia_pick_model('');
    $sys = "Tu aides à utiliser un logiciel de généalogie. Réécris la demande en une phrase courte (moins de 12 mots), qui commence par un verbe à l'infinitif, avec les mots de cette liste de choses que le logiciel sait faire. Réponds seulement par la phrase, sans guillemets.\n- " . implode("\n- ", $names);
    [$msg, $err] = aia_ollama((string) $m['tag'], [['role' => 'system', 'content' => $sys], ['role' => 'user', 'content' => $q]], null);
    if ($err !== '') { throw new RuntimeException($err); }
    $text = trim((string) preg_replace('/\s+/u', ' ', strip_tags((string) ($msg['content'] ?? ''))), " \t\n\"«»");
    return ['text' => mb_substr($text, 0, 160)];
}

function aia_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'aia_status' => aia_status($q),
        'aia_convs' => aia_convs(),
        'aia_conv' => (static function () use ($pdo, $q) { $c = aia_conv_get((string) ($q['id'] ?? '')); $o = aia_conv_out($pdo, $c);
            if ($c['kind'] === 'gen') { $ids = []; foreach ($c['gen']['leads'] ?? [] as $l) { $ids = array_merge($ids, $l['pistes']); } $o['pistes'] = aia_gen_pistes($pdo, $ids); } return ['conv' => $o]; })(),
        'aia_source' => (static function () use ($pdo, $q) { $s = $pdo->prepare('SELECT id, title, author, agency, publication, url, text FROM sources WHERE id=?'); $s->execute([safe_int($q['id'] ?? 0)]); $r = $s->fetch(PDO::FETCH_ASSOC);
            if (!$r) { throw new LcndaBadInput(i18n_t('Source introuvable.')); }
            $l = $pdo->prepare("SELECT DISTINCT COALESCE(e.person_id, sl.entity_id) AS pid FROM source_links sl LEFT JOIN events e ON sl.entity_type='event' AND e.id=sl.entity_id WHERE sl.source_record_id=? AND sl.entity_type IN ('person','event') LIMIT 20"); $l->execute([(int) $r['id']]);
            $people = array_values(array_filter(array_map(static fn($id) => (int) $id, $l->fetchAll(PDO::FETCH_COLUMN))));
            return ['source' => ['id' => (int) $r['id'], 'title' => (string) $r['title'], 'author' => (string) $r['author'], 'agency' => (string) $r['agency'], 'url' => (string) $r['url'], 'text' => mb_substr((string) $r['text'], 0, 3000),
                'people' => array_map(static fn($i) => ['id' => $i, 'name' => aia_name($pdo, $i)], $people)]]; })(),
        'aia_log' => ['rows' => aia_log_read()],
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function aia_api_post(PDO $pdo, string $action, array $d): array
{
    return match ($action) {
        'aia_rephrase' => aia_rephrase($d), // 🧭 Je veux… : « Reformuler avec l’IA de l’ordinateur »
        'aia_chat_start' => aia_chat_start($pdo, $d),
        'aia_gen_start' => aia_gen_start($pdo, $d),
        'aia_recit_start' => aia_recit_start($pdo, $d),
        'aia_step' => aia_step($pdo, $d),
        'aia_apply' => aia_apply($pdo, $d),
        'aia_undo' => aia_undo($pdo, $d),
        'aia_proposal_mark' => aia_proposal_mark($d),
        'aia_conv_delete' => (static function () use ($d) { $f = aia_conv_path((string) ($d['id'] ?? '')); $old = is_file($f) ? (string) file_get_contents($f) : ''; @unlink($f); return ['ok' => true, 'restore' => $old !== '' ? base64_encode($old) : '']; })(),
        'aia_conv_restore' => (static function () use ($d) { $j = json_decode((string) base64_decode((string) ($d['data'] ?? ''), true), true); if (!is_array($j) || !isset($j['id'])) { throw new LcndaBadInput('Rien à remettre.'); } aia_conv_save($j); return ['ok' => true]; })(),
        'aia_convs_clear' => (static function () { $n = 0; foreach (glob(aia_dir() . '/conversations/*.json') ?: [] as $f) { if (@unlink($f)) { $n++; } } return ['ok' => true, 'removed' => $n]; })(),
        'aia_log_clear' => (static function () { $old = aia_log_read(); @unlink(aia_log_path()); return ['ok' => true, 'removed' => count($old), 'restore' => $old]; })(),
        'aia_log_restore' => (static function () use ($d) { $rows = array_values(array_filter(array_map(static fn($r) => is_array($r) ? ['at' => mb_substr(safe_text($r['at'] ?? ''), 0, 40), 'host' => mb_substr(safe_text($r['host'] ?? ''), 0, 80), 'what' => mb_substr(safe_text($r['what'] ?? ''), 0, 200), 'person_id' => safe_int($r['person_id'] ?? 0), 'living' => 0] : null, is_array($d['rows'] ?? null) ? array_slice($d['rows'], 0, 500) : []))); @file_put_contents(aia_log_path(), json_encode($rows, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); return ['ok' => true]; })(),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
