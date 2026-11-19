<?php
declare(strict_types=1);

/**
 * 🔍 Lecture approfondie : télécharger un modèle vision (Ollama /api/pull) ou lire une image (/api/chat), en arrière-plan.
 *   php scripts/tx_deep_job.php <dossier du travail> <dossier de l'application>
 * Le dossier (DATA_DIR/cache/tx-deep-jobs/<id>, créé par lib/transcription_actes.php) contient job.json (et image.b64) ;
 * on y écrit result.json. Le fichier « cancel » arrête le travail. Seul Ollama sur cet ordinateur (127.0.0.1) est appelé.
 */

[$self, $jobDir, $appRoot] = array_pad($argv, 3, '');
if ($jobDir === '' || !is_file($jobDir . '/job.json') || !is_dir($appRoot . '/lib')) { exit(2); }
@set_time_limit(0);
if (!class_exists('LcndaBadInput')) { class LcndaBadInput extends RuntimeException {} }
require_once $appRoot . '/lib/transcription_actes.php';
tx_deep_run($jobDir);
