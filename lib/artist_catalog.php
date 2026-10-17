<?php
declare(strict_types=1);

/**
 * 🎨 Le catalogue d'un artiste (interface : assets/js/heritage-artist.js) : bibliographie (livres de lui ou sur lui),
 * catalogue des œuvres avec inventaire (où elles sont, à qui, dans quel état), discographie (album par album, morceau par
 * morceau, paroles, notes, photos du disque, éditions et pressages comme sur Discogs) et filmographie.
 * Chaque élément est une ligne d'artist_items (personne, genre, titre, année, et le reste en JSON).
 * Les imports (Discogs, MusicBrainz, Open Library, Wikidata — qui donne aussi les identifiants IMDb —, TMDb) passent par
 * le serveur : les adresses sont construites ici à partir d'identifiants vérifiés, jamais reçues toutes faites.
 */

const ARTIST_KINDS = ['book', 'work', 'release', 'film'];
const ARTIST_UA = 'LCNDA/0.6 (logiciel de genealogie ; +https://github.com/victorbaissait/lcnda)';
/** les sites d'où l'on peut rapatrier une image (pochette, affiche, couverture, photo d'œuvre) */
const ARTIST_IMG_HOSTS = ['i.discogs.com', 'img.discogs.com', 'st.discogs.com', 'covers.openlibrary.org', 'archive.org', 'upload.wikimedia.org', 'commons.wikimedia.org', 'image.tmdb.org', 'coverartarchive.org', 'mzstatic.com'];

function artist_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS artist_items (id INTEGER PRIMARY KEY AUTOINCREMENT, person_id INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
        year INTEGER, data TEXT NOT NULL DEFAULT '{}', sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_artist_items_person ON artist_items(person_id, kind)');
    $done = true;
}

/** nettoie récursivement ce qu'envoie le navigateur : clés simples, textes bornés, listes bornées */
function artist_clean(mixed $v, int $depth = 0): mixed
{
    if ($depth > 6) { return null; }
    if (is_array($v)) {
        $out = []; $i = 0;
        foreach ($v as $k => $x) {
            if (++$i > 600) { break; }
            if (is_int($k)) { $out[] = artist_clean($x, $depth + 1); continue; }
            if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]{0,39}$/', (string) $k)) { continue; }
            $out[$k] = artist_clean($x, $depth + 1);
        }
        return $out;
    }
    if (is_string($v)) { return mb_substr(str_replace("\0", '', $v), 0, 40000); }
    if (is_int($v) || is_float($v)) { return is_finite((float) $v) ? $v : 0; }
    return is_bool($v) || $v === null ? $v : null;
}

function artist_year(array $d): ?int
{
    foreach (['year', 'date', 'released'] as $k) { if (preg_match('/\b(1[0-9]{3}|20[0-9]{2})\b/', (string) ($d[$k] ?? ''), $m)) { return (int) $m[1]; } }
    return null;
}

function artist_items_for(PDO $pdo, int $personId): array
{
    artist_ensure($pdo);
    $s = $pdo->prepare('SELECT id, kind, title, year, data, sort_order, updated_at FROM artist_items WHERE person_id=? ORDER BY kind, sort_order, COALESCE(year, 9999), id');
    $s->execute([$personId]);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'kind' => $r['kind'], 'title' => $r['title'], 'year' => $r['year'] !== null ? (int) $r['year'] : null,
        'data' => json_decode((string) $r['data'], true) ?: [], 'sort' => (int) $r['sort_order'], 'updated_at' => $r['updated_at']], $s->fetchAll());
}

function save_artist_item(PDO $pdo, array $d): array
{
    artist_ensure($pdo);
    $personId = safe_int($d['person_id'] ?? 0);
    $p = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $p->execute([$personId]); if (!$p->fetchColumn()) { throw new RuntimeException('Personne introuvable.'); }
    if (function_exists('assert_person_unlocked')) { assert_person_unlocked($pdo, $personId); }
    $kind = (string) ($d['kind'] ?? ''); if (!in_array($kind, ARTIST_KINDS, true)) { throw new RuntimeException('Genre d’élément inconnu.'); }
    $data = artist_clean(is_array($d['data'] ?? null) ? $d['data'] : []);
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (strlen((string) $json) > 3_000_000) { throw new RuntimeException('Élément trop volumineux.'); }
    $title = mb_substr(trim(safe_text($data['title'] ?? '')), 0, 500); if ($title === '') { $title = 'Sans titre'; }
    $year = artist_year($data);
    $id = safe_int($d['id'] ?? 0);
    if ($id) {
        $u = $pdo->prepare('UPDATE artist_items SET title=?, year=?, data=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND person_id=? AND kind=?');
        $u->execute([$title, $year, $json, $id, $personId, $kind]);
        if (!$u->rowCount()) { throw new RuntimeException('Élément introuvable.'); }
    } else {
        $n = $pdo->prepare('SELECT COALESCE(MAX(sort_order),0)+1 FROM artist_items WHERE person_id=? AND kind=?'); $n->execute([$personId, $kind]);
        $pdo->prepare('INSERT INTO artist_items(person_id, kind, title, year, data, sort_order) VALUES(?,?,?,?,?,?)')->execute([$personId, $kind, $title, $year, $json, (int) $n->fetchColumn()]);
        $id = (int) $pdo->lastInsertId();
    }
    return ['id' => $id];
}

/** plusieurs éléments d'un coup (import d'une discographie, d'une filmographie…) */
function save_artist_items(PDO $pdo, array $d): array
{
    $ids = [];
    $own = !$pdo->inTransaction(); if ($own) { $pdo->beginTransaction(); } // l'API en ouvre souvent déjà une
    try {
        foreach (array_slice(is_array($d['items'] ?? null) ? $d['items'] : [], 0, 500) as $it) {
            if (!is_array($it)) { continue; }
            $ids[] = save_artist_item($pdo, ['person_id' => $d['person_id'] ?? 0, 'kind' => $it['kind'] ?? '', 'data' => $it['data'] ?? [], 'id' => $it['id'] ?? 0])['id'];
        }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own) { $pdo->rollBack(); } throw $e; }
    return ['ids' => $ids];
}

function delete_artist_item(PDO $pdo, array $d): array
{
    artist_ensure($pdo);
    if (function_exists('assert_person_unlocked')) { assert_person_unlocked($pdo, safe_int($d['person_id'] ?? 0)); }
    $pdo->prepare('DELETE FROM artist_items WHERE id=? AND person_id=?')->execute([safe_int($d['id'] ?? 0), safe_int($d['person_id'] ?? 0)]);
    return ['ok' => true];
}

function reorder_artist_items(PDO $pdo, array $d): array
{
    artist_ensure($pdo);
    if (function_exists('assert_person_unlocked')) { assert_person_unlocked($pdo, safe_int($d['person_id'] ?? 0)); }
    $s = $pdo->prepare('UPDATE artist_items SET sort_order=? WHERE id=? AND person_id=?');
    foreach (array_slice(is_array($d['ids'] ?? null) ? $d['ids'] : [], 0, 2000) as $i => $id) { $s->execute([$i + 1, safe_int($id), safe_int($d['person_id'] ?? 0)]); }
    return ['ok' => true];
}

/* ═════════ Les imports ═════════ */

function artist_http(string $url, array $headers = [], int $max = 6_000_000): array
{
    if (!function_exists('curl_init')) { throw new RuntimeException('Import impossible : PHP n’a pas l’extension curl.'); }
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => 25,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => ARTIST_UA, CURLOPT_HTTPHEADER => $headers, CURLOPT_HEADER => false,
        CURLOPT_NOPROGRESS => false, CURLOPT_PROGRESSFUNCTION => static fn($c, $dlT, $dl) => $dl > $max ? 1 : 0] + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
    $body = curl_exec($ch); $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $loc = (string) (curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: ''); $err = curl_error($ch); $type = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    curl_close($ch);
    if ($body === false) { throw new RuntimeException('Le site ne répond pas' . ($err ? " ({$err})" : '') . ' : vérifie la connexion à internet.'); }
    return ['code' => $code, 'body' => (string) $body, 'location' => $loc, 'type' => $type];
}

function artist_json(string $url, array $headers = []): array
{
    $r = artist_http($url, array_merge(['Accept: application/json'], $headers));
    if ($r['code'] === 429) { throw new RuntimeException('Le site demande de patienter (trop de demandes) : réessaie dans une minute.'); }
    if ($r['code'] === 401 || $r['code'] === 403) { throw new RuntimeException('Le site refuse la demande : une clé ou un jeton est nécessaire (ou il n’est pas bon).'); }
    if ($r['code'] === 404) { throw new RuntimeException('Rien trouvé à cette adresse (identifiant inconnu).'); }
    if ($r['code'] >= 400) { throw new RuntimeException("Le site a répondu par une erreur ({$r['code']})."); }
    $j = json_decode($r['body'], true);
    if (!is_array($j)) { throw new RuntimeException('Réponse illisible du site.'); }
    return $j;
}

function artist_sparql(string $query): array
{
    $j = artist_json('https://query.wikidata.org/sparql?' . http_build_query(['format' => 'json', 'query' => $query]), ['Accept: application/sparql-results+json']);
    return array_map(static fn($b) => array_map(static fn($v) => (string) ($v['value'] ?? ''), $b), $j['results']['bindings'] ?? []);
}

/** une demande d'import : la source, ce qu'on veut, et des identifiants vérifiés un à un */
function artist_remote(array $q): array
{
    $src = (string) ($q['source'] ?? ''); $what = (string) ($q['what'] ?? '');
    $id = trim((string) ($q['id'] ?? '')); $text = mb_substr(trim((string) ($q['q'] ?? '')), 0, 200); $page = max(1, min(50, safe_int($q['page'] ?? 1)));
    $need = static function (string $re, string $v, string $msg) { if (!preg_match($re, $v)) { throw new RuntimeException($msg); } return $v; };
    switch ($src) {
        case 'discogs':
            $tok = trim((string) ($q['token'] ?? '')); $hdr = $tok !== '' ? ['Authorization: Discogs token=' . $need('/^[A-Za-z0-9]{10,80}$/', $tok, 'Jeton Discogs incorrect.')] : [];
            $base = 'https://api.discogs.com/';
            return match ($what) {
                'release' => artist_json($base . 'releases/' . $need('/^\d{1,12}$/', $id, 'Numéro de disque Discogs incorrect.'), $hdr),
                'master' => artist_json($base . 'masters/' . $need('/^\d{1,12}$/', $id, 'Numéro Discogs incorrect.'), $hdr),
                'versions' => artist_json($base . 'masters/' . $need('/^\d{1,12}$/', $id, 'Numéro Discogs incorrect.') . '/versions?' . http_build_query(['per_page' => 100, 'page' => $page]), $hdr),
                'artist' => artist_json($base . 'artists/' . $need('/^\d{1,12}$/', $id, 'Numéro d’artiste Discogs incorrect.') . '/releases?' . http_build_query(['per_page' => 100, 'page' => $page, 'sort' => 'year']), $hdr),
                'search' => $hdr ? artist_json($base . 'database/search?' . http_build_query(['q' => $text, 'type' => in_array($q['type'] ?? '', ['artist', 'master', 'release'], true) ? $q['type'] : 'artist', 'per_page' => 30]), $hdr)
                    : throw new RuntimeException('La recherche par nom sur Discogs demande un jeton personnel (gratuit : discogs.com → Paramètres → Développeurs). Sans jeton, colle l’adresse d’un artiste, d’un album ou d’un disque.'),
                default => throw new RuntimeException('Demande Discogs inconnue.'),
            };
        case 'musicbrainz':
            $mb = 'https://musicbrainz.org/ws/2/'; $mbid = fn() => $need('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', strtolower($id), 'Identifiant MusicBrainz incorrect.');
            return match ($what) {
                'search' => artist_json($mb . 'artist?' . http_build_query(['query' => $text, 'limit' => 15, 'fmt' => 'json'])),
                'groups' => artist_json($mb . 'release-group?' . http_build_query(['artist' => $mbid(), 'limit' => 100, 'offset' => ($page - 1) * 100, 'fmt' => 'json'])),
                'releases' => artist_json($mb . 'release?' . http_build_query(['release-group' => $mbid(), 'inc' => 'labels+media', 'limit' => 100, 'fmt' => 'json'])),
                'release' => artist_json($mb . 'release/' . $mbid() . '?' . http_build_query(['inc' => 'recordings+labels+artist-credits+release-groups', 'fmt' => 'json'])),
                default => throw new RuntimeException('Demande MusicBrainz inconnue.'),
            };
        case 'openlibrary':
            $fields = 'key,title,subtitle,first_publish_year,publish_year,publisher,publish_place,isbn,number_of_pages_median,cover_i,author_name,language';
            return match ($what) {
                'isbn' => artist_json('https://openlibrary.org/search.json?' . http_build_query(['isbn' => $need('/^(97[89])?\d{9}[\dX]$/', strtoupper(preg_replace('/[^0-9Xx]/', '', $id)), 'ISBN incorrect (10 ou 13 chiffres).'), 'fields' => $fields])),
                'author' => artist_json('https://openlibrary.org/search.json?' . http_build_query(['author' => $text, 'limit' => 100, 'page' => $page, 'fields' => $fields])),
                'subject' => artist_json('https://openlibrary.org/search.json?' . http_build_query(['q' => $text, 'limit' => 60, 'fields' => $fields])),
                default => throw new RuntimeException('Demande Open Library inconnue.'),
            };
        case 'wikidata':
            if ($what === 'find') {
                $j = artist_json('https://www.wikidata.org/w/api.php?' . http_build_query(['action' => 'wbsearchentities', 'search' => $text, 'language' => 'fr', 'uselang' => 'fr', 'type' => 'item', 'limit' => 12, 'format' => 'json']));
                return ['items' => array_map(static fn($r) => ['id' => $r['id'] ?? '', 'label' => $r['label'] ?? '', 'description' => $r['description'] ?? ''], $j['search'] ?? [])];
            }
            if ($what === 'imdb') { $nm = $need('/^nm\d{5,10}$/', $id, 'Identifiant IMDb de personne incorrect (nm suivi de chiffres).');
                return ['items' => artist_sparql("SELECT ?p ?pLabel ?pDescription WHERE { ?p wdt:P345 \"{$nm}\" . SERVICE wikibase:label { bd:serviceParam wikibase:language \"fr,en\". } } LIMIT 3")]; }
            $qid = $need('/^Q\d{1,12}$/', $id, 'Identifiant Wikidata incorrect (Q suivi de chiffres).');
            $lab = 'SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }';
            return ['items' => match ($what) {
                // les films : acteur, réalisateur, scénariste, compositeur, chef opérateur, monteur, producteur
                'films' => artist_sparql("SELECT ?f ?fLabel ?job ?date ?imdb ?dur ?dirLabel ?roleLabel ?typeLabel WHERE {
                    VALUES (?prop ?job) { (wdt:P161 \"acteur\") (wdt:P57 \"réalisation\") (wdt:P58 \"scénario\") (wdt:P86 \"musique\") (wdt:P344 \"image\") (wdt:P1040 \"montage\") (wdt:P162 \"production\") }
                    ?f ?prop wd:{$qid} . OPTIONAL { ?f wdt:P577 ?date } OPTIONAL { ?f wdt:P345 ?imdb } OPTIONAL { ?f wdt:P2047 ?dur } OPTIONAL { ?f wdt:P57 ?dir } OPTIONAL { ?f wdt:P31 ?type }
                    OPTIONAL { ?f p:P161 ?st . ?st ps:P161 wd:{$qid} . ?st pq:P453 ?role } {$lab} } LIMIT 1500"),
                'books' => artist_sparql("SELECT ?b ?bLabel ?date ?pubLabel ?isbn ?typeLabel WHERE { ?b wdt:P50 wd:{$qid} . OPTIONAL { ?b wdt:P577 ?date } OPTIONAL { ?b wdt:P123 ?pub } OPTIONAL { ?b wdt:P212 ?isbn } OPTIONAL { ?b wdt:P31 ?type } {$lab} } LIMIT 800"),
                'works' => artist_sparql("SELECT ?w ?wLabel ?date ?matLabel ?h ?wd ?colLabel ?inv ?img ?typeLabel WHERE { ?w wdt:P170 wd:{$qid} . OPTIONAL { ?w wdt:P571 ?date } OPTIONAL { ?w wdt:P186 ?mat } OPTIONAL { ?w wdt:P2048 ?h } OPTIONAL { ?w wdt:P2049 ?wd }
                    OPTIONAL { ?w wdt:P195 ?col } OPTIONAL { ?w wdt:P217 ?inv } OPTIONAL { ?w wdt:P18 ?img } OPTIONAL { ?w wdt:P31 ?type } {$lab} } LIMIT 1500"),
                'albums' => artist_sparql("SELECT ?a ?aLabel ?date ?labelLabel ?typeLabel ?discogs ?mb WHERE { ?a wdt:P175 wd:{$qid} ; wdt:P31 ?type . VALUES ?type { wd:Q482994 wd:Q134556 wd:Q169930 wd:Q209939 wd:Q222910 }
                    OPTIONAL { ?a wdt:P577 ?date } OPTIONAL { ?a wdt:P264 ?label } OPTIONAL { ?a wdt:P1954 ?discogs } OPTIONAL { ?a wdt:P436 ?mb } {$lab} } LIMIT 800"),
                'ids' => artist_sparql("SELECT ?imdb ?discogs ?mb ?ol ?tmdb WHERE { OPTIONAL { wd:{$qid} wdt:P345 ?imdb } OPTIONAL { wd:{$qid} wdt:P1953 ?discogs } OPTIONAL { wd:{$qid} wdt:P434 ?mb } OPTIONAL { wd:{$qid} wdt:P648 ?ol } OPTIONAL { wd:{$qid} wdt:P4985 ?tmdb } } LIMIT 5"),
                default => throw new RuntimeException('Demande Wikidata inconnue.'),
            }];
        case 'tmdb':
            $key = $need('/^[A-Za-z0-9]{32}$/', trim((string) ($q['key'] ?? '')), 'Clé TMDb manquante ou incorrecte (32 caractères, gratuite sur themoviedb.org → Paramètres → API).');
            $tb = 'https://api.themoviedb.org/3/';
            return match ($what) {
                'search' => artist_json($tb . 'search/person?' . http_build_query(['api_key' => $key, 'query' => $text, 'language' => 'fr-FR'])),
                'find' => artist_json($tb . 'find/' . $need('/^nm\d{5,10}$/', $id, 'Identifiant IMDb incorrect.') . '?' . http_build_query(['api_key' => $key, 'external_source' => 'imdb_id', 'language' => 'fr-FR'])),
                'credits' => artist_json($tb . 'person/' . $need('/^\d{1,10}$/', $id, 'Identifiant TMDb incorrect.') . '/combined_credits?' . http_build_query(['api_key' => $key, 'language' => 'fr-FR'])),
                'movie' => artist_json($tb . 'movie/' . $need('/^\d{1,10}$/', $id, 'Identifiant TMDb incorrect.') . '?' . http_build_query(['api_key' => $key, 'language' => 'fr-FR', 'append_to_response' => 'credits,external_ids'])),
                'tv' => artist_json($tb . 'tv/' . $need('/^\d{1,10}$/', $id, 'Identifiant TMDb incorrect.') . '?' . http_build_query(['api_key' => $key, 'language' => 'fr-FR', 'append_to_response' => 'credits,external_ids'])),
                default => throw new RuntimeException('Demande TMDb inconnue.'),
            };
        case 'itunes':
            return match ($what) {
                'search' => artist_json('https://itunes.apple.com/search?' . http_build_query(['term' => $text, 'entity' => 'album', 'limit' => 100, 'country' => 'FR'])),
                'album' => artist_json('https://itunes.apple.com/lookup?' . http_build_query(['id' => $need('/^\d{1,14}$/', $id, 'Identifiant d’album incorrect.'), 'entity' => 'song', 'country' => 'FR'])),
                default => throw new RuntimeException('Demande iTunes inconnue.'),
            };
    }
    throw new RuntimeException('Source d’import inconnue.');
}

function artist_img_host_ok(string $url): bool
{
    $h = strtolower((string) parse_url($url, PHP_URL_HOST));
    if ($h === '' || parse_url($url, PHP_URL_SCHEME) !== 'https') { return false; }
    foreach (ARTIST_IMG_HOSTS as $ok) { if ($h === $ok || str_ends_with($h, '.' . $ok)) { return true; } }
    return false;
}

/** range une image (octets déjà lus) dans les médias, rattachée à la personne */
function artist_store_image(PDO $pdo, int $personId, string $bin, string $title, string $note): array
{
    $info = @getimagesizefromstring($bin);
    $ext = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp', IMAGETYPE_GIF => 'gif'][$info[2] ?? 0] ?? null;
    if (!$ext) { throw new RuntimeException('Ce n’est pas une image (JPEG, PNG, WebP ou GIF).'); }
    if (!is_dir(MEDIA_DIR)) { @mkdir(MEDIA_DIR, 0775, true); }
    $file = bin2hex(random_bytes(16)) . '.' . $ext;
    if (@file_put_contents(MEDIA_DIR . '/' . $file, $bin) === false) { throw new RuntimeException('Impossible d’enregistrer l’image.'); }
    $pdo->prepare('INSERT INTO media(title, media_type, filename, thumbnail, description) VALUES(?,?,?,?,?)')->execute([mb_substr($title, 0, 300) ?: 'Image', 'image', $file, $file, mb_substr($note, 0, 500)]);
    $mid = (int) $pdo->lastInsertId();
    if ($personId) { $e = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $e->execute([$personId]); if (!$e->fetchColumn()) { $personId = 0; } }
    if ($personId) {
        $pos = $pdo->prepare("SELECT COALESCE(MAX(position),0)+1 FROM media_links WHERE entity_type='person' AND entity_id=?"); $pos->execute([$personId]);
        $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?,'person',?,?)")->execute([$mid, $personId, (int) $pos->fetchColumn()]);
    }
    return ['id' => $mid, 'filename' => $file];
}

/** rapatrie une image d'un des sites autorisés (en suivant au plus 3 redirections, chacune vérifiée) */
function artist_fetch_image(PDO $pdo, array $d): array
{
    $url = trim((string) ($d['url'] ?? '')); $personId = safe_int($d['person_id'] ?? 0);
    for ($i = 0; $i < 4; $i++) {
        if (!artist_img_host_ok($url)) { throw new RuntimeException('Image refusée : seules les images de Discogs, MusicBrainz/Cover Art Archive, Open Library, Wikimedia, TMDb et Apple sont rapatriées.'); }
        $r = artist_http($url, ['Accept: image/*'], 15_000_000);
        if ($r['code'] >= 300 && $r['code'] < 400 && $r['location'] !== '') { $url = $r['location']; continue; }
        if ($r['code'] >= 400) { throw new RuntimeException("Image introuvable ({$r['code']})."); }
        return artist_store_image($pdo, $personId, $r['body'], (string) ($d['title'] ?? ''), 'Rapatriée de ' . parse_url($url, PHP_URL_HOST) . ' le ' . date('d/m/Y'));
    }
    throw new RuntimeException('Trop de redirections.');
}

/** une image envoyée depuis l'ordinateur (data:image/…;base64,…) */
function artist_upload_image(PDO $pdo, array $d): array
{
    if (!preg_match('#^data:image/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=\s]+)$#', (string) ($d['data'] ?? ''), $m)) { throw new RuntimeException('Image illisible.'); }
    if (strlen($m[2]) > 21_000_000) { throw new RuntimeException('Image trop lourde (15 Mo au plus).'); }
    $bin = base64_decode($m[2], true); if ($bin === false) { throw new RuntimeException('Image illisible.'); }
    return artist_store_image($pdo, safe_int($d['person_id'] ?? 0), $bin, (string) ($d['title'] ?? ''), 'Ajoutée au catalogue de l’artiste le ' . date('d/m/Y'));
}
