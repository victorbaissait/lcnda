<?php
declare(strict_types=1);

/**
 * ↶ Annuler la suppression d'un projet d'outil (🎬 montage, 🎧 son, 🎚️ retouche, ✒️ dessin, 📐 livre, 🏠 maison, diaporama,
 * classeur, comparaison de photos) : au lieu de « Es-tu sûr ? », la ligne est gardée un jour dans la corbeille commune
 * (tresor_trash, lib/tresors.php), puis « restore_project {undo} » la remet avec le même numéro (docs/harmonisation.md,
 * Comportements, point 9).
 *   project_undo_keep($pdo, 'montage_projects', $id)  → le jeton à rendre au navigateur (« undo »), AVANT le DELETE
 *   POST api.php?action=restore_project {undo}        → {ok} (déjà remis ou trop tard : {ok, already})
 */
function project_undo_lib(): void { if (!function_exists('tresor_trash_keep')) { require_once __DIR__ . '/tresors.php'; } } // chargé seulement quand il sert

/** les tables qu'on accepte de garder (rien d'autre n'entre par ici) */
const PROJECT_UNDO_TABLES = ['montage_projects', 'audio_projects', 'retouch_projects', 'vector_docs', 'layout_documents', 'houses', 'slideshows', 'workbooks', 'photo_comparisons'];

function project_undo_keep(PDO $pdo, string $table, int $id): string
{
    if (!in_array($table, PROJECT_UNDO_TABLES, true) || $id <= 0) { return ''; }
    project_undo_lib();
    return tresor_trash_keep($pdo, 'projet:' . $table, [[$table, 'id', $id]]);
}

/** les fichiers de travail des projets son gardés plus d'un jour : partis avec leur ligne (appelé avant d'en garder un autre) */
function project_undo_purge_audio(PDO $pdo, callable $stillUsed): void
{
    project_undo_lib();
    tresor_trash_ensure($pdo);
    $s = $pdo->query("SELECT rows_json FROM tresor_trash WHERE what='projet:audio_projects' AND created_at < datetime('now', '-23 hours')");
    foreach ($s ? $s->fetchAll(PDO::FETCH_COLUMN) : [] as $json) {
        foreach ((json_decode((string) $json, true) ?: [])['audio_projects'] ?? [] as $r) {
            $f = basename((string) ($r['work_file'] ?? ''));
            if ($f !== '' && !$stillUsed($f)) { @unlink(MEDIA_DIR . '/' . $f); }
        }
    }
    $pdo->exec("DELETE FROM tresor_trash WHERE what='projet:audio_projects' AND created_at < datetime('now', '-23 hours')");
}

function restore_project(PDO $pdo, array $data): array
{
    $token = (string) ($data['undo'] ?? '');
    if (!preg_match('/^[0-9a-f]{24}$/', $token)) { throw new RuntimeException('Rien à remettre.'); }
    project_undo_lib();
    tresor_trash_ensure($pdo);
    $s = $pdo->prepare("SELECT what, rows_json FROM tresor_trash WHERE token=? AND what LIKE 'projet:%'"); $s->execute([$token]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { return ['ok' => true, 'already' => true]; } // déjà remis (deuxième « ↶ Annuler ») ou gardé trop longtemps
    // (déjà dans la transaction d'écriture d'api.php : pas de beginTransaction ici)
    foreach (json_decode((string) $row['rows_json'], true) ?: [] as $table => $list) {
        if (!in_array($table, PROJECT_UNDO_TABLES, true) || !is_array($list)) { continue; }
        foreach ($list as $r) {
            $cols = is_array($r) ? array_keys($r) : [];
            if (!$cols || array_filter($cols, static fn($c) => !preg_match('/^[a-z_0-9]+$/', (string) $c))) { continue; }
            $pdo->prepare("INSERT OR IGNORE INTO {$table}(" . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute(array_values($r));
        }
    }
    $pdo->prepare('DELETE FROM tresor_trash WHERE token=?')->execute([$token]);
    log_change($pdo, 'meta', 0, 'update', 'Projet remis (↶ Annuler)');
    return ['ok' => true];
}
