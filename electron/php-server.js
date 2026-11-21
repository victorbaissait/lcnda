'use strict';
/**
 * Pilote le serveur PHP intégré qui fait tourner l'application.
 * Aucune dépendance à Electron : ce module se teste seul (voir test-php-server.js).
 *
 *  - choisit un port local (en réutilisant le dernier port connu : l'origine http://127.0.0.1:PORT reste
 *    la même d'un lancement à l'autre, ce qui conserve le localStorage de l'interface) ;
 *  - génère un secret par lancement : router.php refuse toute requête qui ne le présente pas ;
 *  - redémarre PHP s'il s'arrête de lui-même (et abandonne s'il s'arrête en boucle) ;
 *  - peut lancer plusieurs PHP derrière un relais, pour traiter plusieurs requêtes à la fois (option pool) ;
 *  - écrit le journal de PHP dans un fichier.
 */
const { spawn, spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const SECRET_HEADER = 'x-carnet-secret';
const MAX_LOG_BYTES = 5 * 1024 * 1024;

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

/** Un port utilisable par l'app : un nombre entier entre 1024 et 65535 (un config.json abîmé peut contenir n'importe quoi). */
function validPort(port) { return Number.isInteger(port) && port >= 1024 && port <= 65535; }

function isPortFree(port) {
  if (!validPort(port)) return Promise.resolve(false); // « abc » serait pris pour un nom de fichier (socket), 99999 lève une erreur
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    try { s.listen(port, '127.0.0.1', () => s.close(() => resolve(true))); } catch { resolve(false); }
  });
}

function randomFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** Nom du PHP embarqué pour ce système, ex. « darwin-arm64 », « win32-x64 » (voir php-runtimes.json). */
function runtimeKey(platform = process.platform, arch = process.arch) {
  return `${platform}-${arch}`;
}

/**
 * Quel PHP embarqué utiliser sur ce système. Windows ARM (Surface, Mac M1 avec Parallels) : pas de PHP ARM
 * officiel, on prend le PHP x64, que Windows 11 fait tourner en émulation.
 */
function phpRuntimeKey(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'arm64') return 'win32-x64';
  return runtimeKey(platform, arch);
}

/** PHP embarqué pendant le développement : vendor/php/<système>-<processeur>/php (installé par npm run fetch:php). */
function devBundledPhp() {
  const exe = process.platform === 'win32' ? 'php.exe' : 'php';
  return path.resolve(__dirname, '..', 'vendor', 'php', phpRuntimeKey(), exe);
}

/** Cherche l'exécutable PHP : variable GENEALOGY_PHP, PHP embarqué, emplacements usuels, puis PATH. */
function findPhp(bundledCandidates = []) {
  const exe = process.platform === 'win32' ? 'php.exe' : 'php';
  const candidates = [
    process.env.GENEALOGY_PHP,
    ...bundledCandidates,
    '/opt/homebrew/bin/php',
    '/usr/local/bin/php',
    '/usr/bin/php',
  ].filter(Boolean);
  for (const c of candidates) if (isFile(c)) return c;
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (dir && isFile(path.join(dir, exe))) return path.join(dir, exe);
  }
  return null;
}

/**
 * Options de lancement propres au PHP embarqué (repéré par le runtime.json posé à côté par fetch-php.js) :
 *  -n : ignorer tout php.ini présent sur l'ordinateur, pour ne dépendre d'aucun réglage extérieur ;
 *  extensions séparées (Windows) chargées depuis le dossier ext/ voisin, par chemin absolu.
 * PHP du système (Homebrew…) : rien, il garde sa propre configuration.
 */
function phpRuntimeArgs(phpPath) {
  const dir = path.dirname(phpPath);
  let info;
  try { info = JSON.parse(fs.readFileSync(path.join(dir, 'runtime.json'), 'utf8')); } catch { return []; }
  const args = ['-n'];
  const exts = Array.isArray(info.extensions) ? info.extensions : [];
  if (exts.length) {
    args.push('-d', 'extension_dir=' + path.join(dir, 'ext'));
    for (const e of exts) args.push('-d', 'extension=' + e);
  }
  return args;
}

/** GET /api.php?action=website_live(_rev)&token=<32 hex> : l'aperçu en direct d'un site, ouvert dans un autre navigateur (sans le secret). */
function isLiveSiteRequest(req) {
  if (req.method !== 'GET') return false;
  let u;
  try { u = new URL(String(req.url || ''), 'http://127.0.0.1'); } catch { return false; }
  return u.pathname === '/api.php' && ['website_live', 'website_live_rev'].includes(u.searchParams.get('action')) && /^[a-f0-9]{32}$/.test(u.searchParams.get('token') || '');
}

/** Message compréhensible quand PHP ne démarre même pas (résultat de spawnSync). */
function explainPhpFailure(r) {
  // Windows : 0xC0000135 = une DLL manque (le plus souvent vcruntime140.dll, fourni par Microsoft).
  if (isVcRuntimeMissing(r)) {
    return 'PHP ne démarre pas : un composant Microsoft manque (Visual C++ Redistributable 2015-2022, x64). '
      + 'Installe-le depuis https://aka.ms/vs/17/release/vc_redist.x64.exe puis relance.';
  }
  // Délai dépassé (ETIMEDOUT, signal SIGTERM) : PHP n'a pas répondu à temps, le plus souvent au premier lancement, pendant que
  // l'antivirus (Windows Defender…) ou macOS (Gatekeeper) examine le PHP livré avec l'app. Ce n'est pas un PHP « qui ne convient pas ».
  if ((r.error && r.error.code === 'ETIMEDOUT') || r.signal === 'SIGTERM') {
    return 'PHP a mis trop de temps à répondre (plus de ' + Math.round((r.timeoutMs || 10000) / 1000) + ' s). '
      + 'Au premier lancement, l’antivirus (Windows Defender…) ou macOS vérifie souvent le PHP livré avec l’application : '
      + 'attends une minute et relance l’application. Si ça recommence, ajoute le dossier de l’application aux exclusions de '
      + 'l’antivirus, ou redémarre l’ordinateur.';
  }
  const code = r.error && r.error.code;
  if (code === 'ENOENT') {
    return 'Le programme PHP de l’application est introuvable (' + (r.phpPath || 'php') + ') : l’antivirus l’a peut-être mis en quarantaine. '
      + 'Rends-le depuis la quarantaine de l’antivirus, ou réinstalle l’application.';
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return 'L’ordinateur refuse de lancer le programme PHP de l’application (droits d’exécution, antivirus, ou dossier qui interdit '
      + 'les programmes). Réinstalle l’application dans le dossier proposé, ou autorise-la dans l’antivirus.';
  }
  // macOS : un programme arrêté net (SIGKILL) au lancement = signature refusée (Gatekeeper) ou fichier abîmé
  if ((r.platform || process.platform) === 'darwin' && r.signal === 'SIGKILL') {
    return 'macOS a bloqué le programme PHP livré avec l’application. Mets l’application dans le dossier Applications, '
      + 'ouvre-la par clic droit → Ouvrir (ou Réglages Système → Confidentialité et sécurité → « Ouvrir quand même »), puis relance. '
      + 'Si cela recommence, réinstalle l’application.';
  }
  const details = [
    r.error ? r.error.message : '',
    r.status !== null && r.status !== undefined ? 'code de sortie ' + r.status : '',
    r.signal ? 'signal ' + r.signal : '',
    String(r.stderr || r.stdout || '').trim().slice(0, 300),
  ].filter(Boolean).join(' ; ');
  return 'PHP ne répond pas (' + (details || 'aucune réponse') + ')';
}

/** Windows : PHP ne démarre pas parce que le composant Microsoft Visual C++ manque (code 0xC0000135). */
function isVcRuntimeMissing(r) {
  return (r.platform || process.platform) === 'win32' && (r.status === 3221225781 || r.status === -1073741515);
}

/** Vérifie que ce PHP possède tout ce dont l'application a besoin. */
function checkPhp(phpPath) {
  const code = [
    "$need=['pdo_sqlite','sqlite3','mbstring','fileinfo','zip','gd','session','curl'];",
    '$miss=array_values(array_filter($need,fn($e)=>!extension_loaded($e)));',
    "try{$p=new PDO('sqlite::memory:');$p->exec('CREATE VIRTUAL TABLE t USING fts5(a)');}catch(Throwable $e){$miss[]='fts5';}",
    "echo json_encode(['version'=>PHP_VERSION,'missing'=>$miss]);",
  ].join('');
  const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  let info = null;
  try { info = JSON.parse(r.stdout); } catch { /* ignore */ }
  if (!info) return { ok: false, error: explainPhpFailure(r), missing: [] };
  return { ok: info.missing.length === 0, version: info.version, missing: info.missing };
}

/** Comme checkPhp, sans bloquer l'application (la fenêtre reste vivante) ; délai long et un second essai : le premier
 * lancement peut être lent pendant que l'antivirus ou macOS examine le PHP livré (ETIMEDOUT / SIGTERM après 10 s sinon). */
function checkPhpAsync(phpPath, { timeouts = [60000, 120000] } = {}) {
  const code = [
    "$need=['pdo_sqlite','sqlite3','mbstring','fileinfo','zip','gd','session','curl'];",
    '$miss=array_values(array_filter($need,fn($e)=>!extension_loaded($e)));',
    "try{$p=new PDO('sqlite::memory:');$p->exec('CREATE VIRTUAL TABLE t USING fts5(a)');}catch(Throwable $e){$miss[]='fts5';}",
    "echo json_encode(['version'=>PHP_VERSION,'missing'=>$miss]);",
  ].join('');
  const once = (timeoutMs) => new Promise((resolve) => {
    let out = '', err = '', done = false, timedOut = false, child;
    const finish = (r) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
    try {
      child = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { windowsHide: true });
    } catch (e) { return finish({ error: e, status: null, signal: null, stdout: '', stderr: '', timeoutMs, phpPath }); }
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      // ne pas attendre la fermeture des tuyaux (un processus petit-enfant peut les garder ouverts) : on répond tout de suite
      setTimeout(() => finish({ error: Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }), status: null, signal: 'SIGTERM', stdout: out, stderr: err, timeoutMs }), 200);
    }, timeoutMs);
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', (e) => finish({ error: e, status: null, signal: null, stdout: out, stderr: err, timeoutMs, phpPath }));
    child.on('close', (status, signal) => finish({ error: timedOut ? Object.assign(new Error('spawnSync ETIMEDOUT'), { code: 'ETIMEDOUT' }) : null, status, signal, stdout: out, stderr: err, timeoutMs }));
  });
  return (async () => {
    let r = null;
    for (const t of timeouts) {
      r = await once(t);
      const timedOut = (r.error && r.error.code === 'ETIMEDOUT') || r.signal === 'SIGTERM';
      if (!timedOut) break; // un vrai échec (DLL manquante, extensions) ne se règle pas en réessayant
    }
    let info = null;
    try { info = JSON.parse(r.stdout); } catch { /* ignore */ }
    if (!info) return { ok: false, error: explainPhpFailure(r), missing: [], slow: (r.error && r.error.code === 'ETIMEDOUT') || r.signal === 'SIGTERM', vcRuntime: isVcRuntimeMissing(r) };
    return { ok: info.missing.length === 0, version: info.version, missing: info.missing };
  })();
}

/**
 * Le dossier existe (ou peut être créé) et on peut y écrire. Sinon une erreur en français qui dit lequel et quoi faire
 * (code LCNDA_DIR) : dossier en lecture seule, droits, disque plein, un fichier à la place du dossier…
 */
function ensureWritableDir(dir, label) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.lcnda-ecriture-${process.pid}-${crypto.randomBytes(3).toString('hex')}.tmp`);
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe, { force: true });
  } catch (e) {
    const why = {
      EACCES: 'L’application n’a pas le droit d’y écrire (droits du dossier, ou protection des dossiers de l’antivirus, par exemple « Accès contrôlé aux dossiers » de Windows).',
      EPERM: 'L’application n’a pas le droit d’y écrire (droits du dossier, ou protection des dossiers de l’antivirus, par exemple « Accès contrôlé aux dossiers » de Windows).',
      EROFS: 'Ce dossier est sur un disque en lecture seule.',
      ENOSPC: 'Le disque est plein : libère de la place, puis relance l’application.',
      EDQUOT: 'Le quota du disque est atteint : libère de la place, puis relance l’application.',
      ENOTDIR: 'Un fichier porte le nom de ce dossier (ou d’un dossier au-dessus).',
      EEXIST: 'Un fichier porte le nom de ce dossier.',
      ENOENT: 'Le disque ou le dossier au-dessus n’existe pas (disque externe débranché ?).',
      EBUSY: 'Le dossier est occupé par un autre programme (synchronisation, antivirus) : réessaie dans un moment.',
    }[e.code] || e.message;
    const err = new Error(`Le dossier ${label} ne peut pas être utilisé :
${dir}

${why}

(${e.code || 'erreur'} : impossible d’écrire dans ce dossier.)`);
    err.code = 'LCNDA_DIR';
    err.cause = e;
    throw err;
  }
}

/** La ligne de commande d'un processus (pour vérifier qu'un ancien numéro est bien un PHP de l'app avant de l'arrêter). */
function processCommand(pid) {
  try {
    if (process.platform === 'linux') return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' ');
    if (process.platform === 'darwin') return spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8', timeout: 3000 }).stdout || '';
    if (process.platform === 'win32') return spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', timeout: 5000, windowsHide: true }).stdout || '';
  } catch { /* processus disparu */ }
  return '';
}

/**
 * PHP restés d'un lancement interrompu (l'app plantée ou arrêtée net, coupure de courant) : sous Windows, ils gardent
 * php.exe et la base ouverts (mise à jour de l'app impossible) ; partout, ils occupent de la mémoire. Leur liste est gardée
 * dans pidFile ; au lancement suivant, chacun est arrêté s'il est encore là ET si c'est bien un PHP de l'app (même port).
 * @returns {number} nombre de PHP arrêtés
 */
function killStalePhp(pidFile, log = () => {}) {
  let list;
  try { list = JSON.parse(fs.readFileSync(pidFile, 'utf8')); } catch { return 0; }
  let killed = 0;
  for (const e of Array.isArray(list && list.php) ? list.php : []) {
    const pid = Number(e && e.pid), port = Number(e && e.port);
    if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid || !validPort(port)) continue;
    try { process.kill(pid, 0); } catch { continue; } // déjà fini
    const cmd = processCommand(pid);
    const ours = process.platform === 'win32'
      ? new RegExp(`^"php(\\.exe)?","${pid}"`, 'im').test(cmd)
      : cmd.includes('router.php') && cmd.includes(`127.0.0.1:${port}`);
    if (!ours) continue; // ce numéro a été repris par un autre programme : on n'y touche pas
    try { process.kill(pid, process.platform === 'win32' ? undefined : 'SIGKILL'); killed++; log(`PHP resté d'un lancement interrompu arrêté (n° ${pid}, port ${port})`); } catch { /* déjà fini */ }
  }
  try { fs.rmSync(pidFile, { force: true }); } catch { /* ignore */ }
  return killed;
}

/** Fichier versionné de l'app (« /assets/…?v=12 ») : il ne change jamais sous ce numéro, la fenêtre peut le garder. */
function isVersionedAsset(req) {
  return req.method === 'GET' && /^\/assets\/[^?#]+\?(?:[^#]*&)?v=[^&#]+/.test(String(req.url || ''));
}

/**
 * Un seul `php -S` ne traite qu'une requête à la fois : pendant un long export, tout le reste attend.
 * Avec `pool` > 1, on lance plusieurs PHP (chacun sur son port interne) et un petit relais Node écoute sur le
 * port public : il envoie chaque requête au PHP le moins occupé. La base SQLite (mode WAL, busy_timeout) et les
 * sessions (relâchées tout de suite) supportent plusieurs processus. Sous Windows, c'est le seul moyen d'avoir
 * du parallélisme (pas de PHP_CLI_SERVER_WORKERS).
 */
/** L'app installée (Electron empaqueté) : pas en essai. Hors d'Electron (tests sous Node) : false. */
function isPackagedApp() {
  if (!process.versions.electron) return false;
  try { return !!require('electron').app?.isPackaged; } catch { return false; }
}

class PhpServer extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.phpPath     chemin de l'exécutable PHP
   * @param {string} o.appRoot     dossier de l'application PHP (celui qui contient router.php)
   * @param {string} o.dataDir     bases SQLite, sauvegardes, réglages
   * @param {string} o.mediaDir    photos, documents, audio, vidéo
   * @param {string} o.sessionDir  sessions PHP
   * @param {string} o.logFile     journal de PHP
   * @param {number} [o.preferredPort]  dernier port utilisé (s'il est libre, on le reprend)
   * @param {number} [o.pool]      nombre de processus PHP derrière le relais (1 = pas de relais)
   * @param {number} [o.workers]   PHP_CLI_SERVER_WORKERS (Mac/Linux seulement ; expérimental)
   * @param {string} [o.pidFile]   liste des PHP lancés (arrêtés au lancement suivant s'ils sont restés après un plantage)
   * @param {boolean} [o.cacheAssets]  relais : les fichiers versionnés (/assets/…?v=) peuvent être gardés par la fenêtre
   * @param {number} [o.readyTimeoutMs]  délai pour qu'un PHP réponde au démarrage (60 s : antivirus, macOS au premier lancement)
   */
  constructor(o) {
    super();
    this.o = o;
    this.secret = crypto.randomBytes(24).toString('hex');
    // Second secret, connu seulement du processus principal : autorise l'import d'un fichier lu directement sur le
    // disque (choisi dans la fenêtre système). La page web ne le connaît pas et ne peut donc pas désigner un chemin.
    this.localSecret = crypto.randomBytes(24).toString('hex');
    // 🔐 un lancement de l'app : une généalogie protégée par un mot de passe et ouverte au lancement précédent est
    // reverrouillée (lib/verrou.php compare ce numéro à celui de la séance). Gardé si PHP redémarre après un plantage.
    this.bootId = crypto.randomBytes(16).toString('hex');
    // 🖧 Plusieurs ordinateurs (electron/lan-gate.js) : la porte du wifi signe avec ce secret l'appareil qu'elle a vérifié
    // (en-tête x-carnet-gate) ; PHP (lib/reseau_local.php) ne croit l'en-tête x-carnet-device qu'avec lui.
    this.gateSecret = crypto.randomBytes(24).toString('hex');
    this.port = 0;
    this.poolSize = Math.max(1, Math.min(16, Math.floor(o.pool || 1)));
    this.backends = []; // { id, port, child, active, ready }
    this.proxy = null;
    this._stopping = false;
    this._restarts = [];
    this._restartTimers = new Set();
    this._log = null;
  }

  get origin() { return `http://127.0.0.1:${this.port}`; }

  /** Premier processus PHP (utilisé par les tests pour simuler un plantage). */
  get child() { return this.backends[0] ? this.backends[0].child : null; }

  async start() {
    ensureWritableDir(path.dirname(this.o.logFile), 'du journal');
    this._openLog();
    try {
      ensureWritableDir(this.o.dataDir, 'des données');
      ensureWritableDir(this.o.mediaDir, 'des médias');
      ensureWritableDir(this.o.sessionDir, 'des séances');
    } catch (err) { this._logLine(err.message.replace(/\s*\n+\s*/g, ' ')); throw err; }
    if (this.o.pidFile) killStalePhp(this.o.pidFile, (t) => this._logLine(t));
    const wanted = Number(this.o.preferredPort);
    this.port = validPort(wanted) && (await isPortFree(wanted)) ? wanted : await randomFreePort();
    if (validPort(wanted) && this.port !== wanted) this._logLine(`le port habituel ${wanted} est pris par un autre programme : port ${this.port}`);
    if (this.poolSize === 1) {
      this.backends = [{ id: 1, port: this.port, child: null, active: 0, ready: false }];
    } else {
      for (let i = 1; i <= this.poolSize; i++) {
        this.backends.push({ id: i, port: await randomFreePort(), child: null, active: 0, ready: false });
      }
      try { await this._startProxy(); } catch (err) {
        // le port choisi a été pris entre-temps (autre programme) : un autre, une fois
        if (err.code !== 'EADDRINUSE') throw err;
        this.port = await randomFreePort();
        this._logLine(`port du relais pris entre-temps : port ${this.port}`);
        await this._startProxy();
      }
      this._logLine(`relais sur le port ${this.port} → ${this.poolSize} processus PHP`);
    }
    // Démarrage : un port choisi « libre » peut avoir été pris entre-temps (plusieurs PHP lancés en même temps, autre
    // logiciel) ; PHP s'arrête alors aussitôt. On réessaie sur un autre port (3 fois). Si cela échoue quand même, on arrête
    // tout ce qui a été lancé, pour ne rien laisser tourner derrière soi.
    this._starting = true;
    try {
      await Promise.all(this.backends.map(async (b) => {
        for (let attempt = 1; ; attempt++) {
          this._spawn(b);
          try { await this._waitReady(b, this.o.readyTimeoutMs || 60000); return; } catch (err) { // 60 s : au premier lancement, l'antivirus ou macOS peut examiner chaque PHP
            const exited = b.child && (b.child.exitCode !== null || b.child.signalCode);
            if (!exited || attempt >= 3) throw err;
            const single = this.poolSize === 1;
            b.port = await randomFreePort();
            if (single) this.port = b.port;
            this._logLine(`PHP${single ? '' : ' n°' + b.id} n'a pas pu démarrer : nouvel essai sur le port ${b.port}`);
          }
        }
      }));
    } catch (err) {
      this._starting = false;
      await this.stop().catch(() => {});
      throw err;
    }
    this._starting = false;
    return this.port;
  }

  _openLog() {
    try {
      if (fs.existsSync(this.o.logFile) && fs.statSync(this.o.logFile).size > MAX_LOG_BYTES) {
        fs.renameSync(this.o.logFile, this.o.logFile + '.1');
      }
    } catch { /* ignore */ }
    this._log = fs.createWriteStream(this.o.logFile, { flags: 'a' });
    this._log.on('error', () => {});
  }

  _logLine(text) {
    if (this._log) this._log.write(`[${new Date().toISOString()}] [app] ${text}\n`);
  }

  /** Variables données à PHP : dossiers, secrets ; jamais les portes de test dans l'app installée. */
  _env() {
    const o = this.o;
    const env = {
      ...process.env,
      GENEALOGY_DATA_DIR: o.dataDir,
      GENEALOGY_MEDIA_DIR: o.mediaDir,
      GENEALOGY_SESSION_DIR: o.sessionDir,
      GENEALOGY_APP_SECRET: this.secret,
      GENEALOGY_LOCAL_SECRET: this.localSecret,
      GENEALOGY_BOOT_ID: this.bootId,
      GENEALOGY_GATE_SECRET: this.gateSecret,
    };
    if (o.cacheAssets) env.GENEALOGY_ASSET_CACHE = '1'; // lib/i18n.php : le dictionnaire de la langue est lu à part (gardé par la fenêtre)
    else delete env.GENEALOGY_ASSET_CACHE;
    // 🔐 portes de test (horloge avancée, nom d'ordinateur imposé) : jamais transmises au PHP de l'app installée
    if (o.packaged || isPackagedApp()) { for (const k of ['LCNDA_TEST_CLOCK_FILE', 'GENEALOGY_TEST', 'GENEALOGY_MACHINE_NAME']) delete env[k]; }
    return env;
  }

  /**
   * 🌍 Villes du monde (data/reference/geo-world.sqlite.gz) : décompressées et indexées une fois sur cet ordinateur (~20 s,
   * davantage sur un vieil ordinateur), dans un PHP À PART, en priorité basse, une fois l'interface affichée. Avant, c'était fait
   * pendant « Démarrage en cours… » (schema_status) ; dans le relais, ce PHP occupé aurait fait attendre les requêtes de la page.
   * En attendant, la recherche de lieux répond sans elles (lib/reference.php, world_prepare_busy).
   */
  prepareWorldInBackground() {
    if (this._stopping || this._world) return null;
    const o = this.o;
    const code = "require 'lib/bootstrap.php'; $t = microtime(true); prepare_world_reference(); fwrite(STDERR, sprintf(\"[app] villes du monde prêtes en %.1f s\\n\", microtime(true) - $t));";
    let child;
    try {
      child = spawn(o.phpPath, [...phpRuntimeArgs(o.phpPath), '-d', 'memory_limit=1024M', '-d', 'display_errors=0', '-d', 'log_errors=1', '-r', code],
        { cwd: o.appRoot, env: this._env(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (err) { this._logLine('villes du monde : ' + err.message); return null; }
    this._world = child;
    try { require('node:os').setPriority(child.pid, 10); } catch { /* priorité inchangée */ }
    if (this._log) { child.stdout.pipe(this._log, { end: false }); child.stderr.pipe(this._log, { end: false }); }
    child.on('error', (err) => this._logLine('villes du monde : ' + err.message));
    child.on('exit', () => { this._world = null; });
    return child;
  }

  _spawn(b) {
    const o = this.o;
    const args = [
      ...phpRuntimeArgs(o.phpPath),
      '-d', 'upload_max_filesize=8G', '-d', 'post_max_size=8G',
      '-d', 'memory_limit=1024M', '-d', 'max_execution_time=300', '-d', 'max_input_time=-1',
      '-d', 'display_errors=0', '-d', 'log_errors=1',
      '-S', `127.0.0.1:${b.port}`, '-t', o.appRoot, path.join(o.appRoot, 'router.php'),
    ];
    const env = this._env();
    if (o.workers && process.platform !== 'win32') env.PHP_CLI_SERVER_WORKERS = String(o.workers);

    const tag = this.poolSize > 1 ? ` n°${b.id}` : '';
    this._logLine(`démarrage de PHP${tag} : ${o.phpPath} (port ${b.port})`);
    const child = spawn(o.phpPath, args, { cwd: o.appRoot, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    b.child = child;
    this._savePids();
    b.ready = false;
    b.active = 0;
    child.stdout.pipe(this._log, { end: false });
    child.stderr.pipe(this._log, { end: false });
    child.once('error', (err) => { this._logLine('erreur de lancement : ' + err.message); this.emit('error', err); });
    child.once('exit', (code, signal) => {
      b.ready = false;
      this._logLine(`PHP${tag} s'est arrêté (code ${code}, signal ${signal})`);
      if (this._stopping || b.child !== child || this._starting) return; // pendant le démarrage, start() réessaie lui-même
      this.emit('crash', { id: b.id, code, signal });
      this._scheduleRestart(b);
    });
  }

  /** La liste des PHP en marche (pour arrêter ceux qui resteraient après un plantage de l'app, voir killStalePhp). */
  _savePids() {
    if (!this.o.pidFile) return;
    const php = this.backends.filter((b) => b.child && b.child.pid && b.child.exitCode === null).map((b) => ({ pid: b.child.pid, port: b.port }));
    try { fs.writeFileSync(this.o.pidFile, JSON.stringify({ app: process.pid, php })); } catch { /* sans gravité */ }
  }

  _scheduleRestart(b) {
    const now = Date.now();
    this._restarts = this._restarts.filter((t) => now - t < 60000);
    if (this._restarts.length >= 5) {
      this.emit('fatal', new Error('PHP s’arrête en boucle (5 arrêts en moins d’une minute).'));
      return;
    }
    this._restarts.push(now);
    const timer = setTimeout(async () => {
      this._restartTimers.delete(timer);
      if (this._stopping) return;
      try {
        this._spawn(b);
        await this._waitReady(b, 20000);
        this.emit('restarted', { id: b.id });
      } catch (err) {
        if (!this._stopping) this.emit('fatal', err);
      }
    }, 400);
    this._restartTimers.add(timer);
  }

  _probe(port) {
    return new Promise((resolve) => {
      const req = http.get(
        { host: '127.0.0.1', port, path: '/__health', headers: { [SECRET_HEADER]: this.secret }, timeout: 1000, agent: false },
        (res) => { res.resume(); resolve(res.statusCode === 200); },
      );
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.on('error', () => resolve(false));
    });
  }

  async _waitReady(b, timeoutMs) {
    const child = b.child;
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (child.exitCode !== null || child.signalCode) throw new Error('PHP s’est arrêté pendant le démarrage (voir le journal).');
      if (await this._probe(b.port)) { if (b.child === child) b.ready = true; return; }
      await new Promise((r) => setTimeout(r, Date.now() - t0 < 2000 ? 40 : 150)); // PHP répond en ~50 ms d'habitude : on regarde souvent au début
    }
    throw Object.assign(new Error('PHP n’a pas répondu à temps (' + Math.round(timeoutMs / 1000) + ' s). Au premier lancement, l’antivirus (Windows Defender…) ou macOS examine souvent le PHP livré avec l’application : attends une minute et relance l’application. Si ça recommence, ajoute le dossier de l’application aux exclusions de l’antivirus.'), { code: 'ETIMEDOUT' });
  }

  // ---- Relais (seulement si pool > 1) ----

  _startProxy() {
    const server = http.createServer((req, res) => this._forward(req, res));
    // Envois et exports longs : pas de délai maximum côté relais (PHP a ses propres limites).
    server.requestTimeout = 0;
    server.headersTimeout = 60000;
    server.keepAliveTimeout = 5000;
    this.proxy = server;
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
    });
  }

  /** Le PHP prêt le moins occupé ; attend un peu si tous redémarrent. */
  async _pick() {
    const t0 = Date.now();
    for (;;) {
      let best = null;
      for (const b of this.backends) if (b.ready && (!best || b.active < best.active)) best = b;
      if (best || this._stopping || Date.now() - t0 > 15000) return best;
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  async _forward(req, res) {
    // Même règle que router.php, appliquée dès l'entrée : sans le secret, rien ne passe.
    const given = Buffer.from(String(req.headers[SECRET_HEADER] || ''));
    const expected = Buffer.from(this.secret);
    // seule exception, comme router.php (qui vérifie aussi que le jeton existe) : l'aperçu en direct d'un site, avec son jeton
    if ((given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) && !isLiveSiteRequest(req)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Accès refusé');
      return;
    }
    const b = await this._pick();
    if (!b) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '1' });
      res.end('PHP indisponible');
      return;
    }
    b.active++;
    let done = false;
    const finish = () => { if (!done) { done = true; b.active--; } };
    const upstream = http.request({
      host: '127.0.0.1', port: b.port, method: req.method, path: req.url, headers: req.headers, agent: false,
    }, (up) => {
      let headers = up.rawHeaders;
      // Fichier versionné (?v=) : la fenêtre le garde (et garde aussi le code JavaScript déjà compilé) au lieu de le redemander
      // à chaque lancement. Une nouvelle version de l'app vide ce cache (main.js) ; tout le reste (pages, API, médias) : inchangé.
      if (this.o.cacheAssets && up.statusCode === 200 && isVersionedAsset(req)) {
        headers = [];
        for (let i = 0; i < up.rawHeaders.length; i += 2) if (!/^(cache-control|expires|pragma)$/i.test(up.rawHeaders[i])) headers.push(up.rawHeaders[i], up.rawHeaders[i + 1]);
        headers.push('Cache-Control', 'private, max-age=31536000, immutable');
      }
      res.writeHead(up.statusCode, up.statusMessage, headers);
      up.pipe(res);
      up.on('end', finish);
      up.on('error', () => { finish(); res.destroy(); });
    });
    upstream.on('error', (err) => {
      finish();
      this._logLine(`relais : PHP n°${b.id} injoignable (${err.code || err.message})`);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('PHP injoignable');
      } else {
        res.destroy();
      }
    });
    // La fenêtre abandonne la requête (navigation, annulation) : on libère PHP.
    res.on('close', () => { if (!res.writableFinished) upstream.destroy(); finish(); });
    req.pipe(upstream);
  }

  /** Requête avec ou sans secret (tests, préparation de la base). timeout 0 = attendre sans limite. */
  request(pathname, { withSecret = true, method = 'GET', timeout = 5000, headers: extra = {}, body = null } = {}) {
    return new Promise((resolve, reject) => {
      const headers = { ...(withSecret ? { [SECRET_HEADER]: this.secret } : {}), ...extra };
      if (body !== null) headers['content-length'] = Buffer.byteLength(body);
      const opts = { host: '127.0.0.1', port: this.port, path: pathname, method, headers, agent: false };
      if (timeout) opts.timeout = timeout;
      const req = http.request(opts, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      req.end(body === null ? undefined : body);
    });
  }

  /**
   * Importe un fichier (ou un paquet .mftpkg, qui est un dossier) lu directement sur le disque, sans l'envoyer :
   * pas de limite de taille, et l'original n'est jamais modifié. Réservé au processus principal (second secret).
   * @returns {Promise<{status: number, data: object}>}
   */
  async importLocalFile(filePath, password = '') {
    const home = await this.request('/', { timeout: 15000 });
    const cookie = String((home.headers['set-cookie'] || [])[0] || '').split(';')[0];
    const csrf = JSON.parse((home.body.toString().match(/window\.INSTALL_CSRF = ("[^"]*")/) || [])[1] || '""');
    const body = JSON.stringify({ path: filePath, csrf, password });
    const r = await this.request('/api.php?action=import_local_path', {
      method: 'POST', timeout: 0, body,
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, 'x-carnet-local': this.localSecret, cookie },
    });
    let data;
    try { data = JSON.parse(r.body.toString()); } catch { data = { error: 'Réponse illisible du serveur (' + r.status + ')' }; }
    return { status: r.status, data };
  }

  /**
   * 🗓 Sauvegarde « à la fermeture » (Réglages → 🗓 Sauvegarde automatique) et verrou d'ouverture rendu : appelé en quittant,
   * avant d'arrêter PHP. Rien n'est fait si ce réglage est éteint ou si la base n'a pas changé. Jamais plus de 2 minutes.
   * @returns {Promise<object|null>}
   */
  async closeBackup() {
    try {
      const r = await this.request('/api.php?action=autobackup_close', { timeout: 120000, headers: { 'x-carnet-local': this.localSecret } });
      return JSON.parse(r.body.toString());
    } catch { return null; }
  }

  /**
   * Ouvre la base une première fois, avant d'afficher l'interface : si sa structure doit être mise à jour
   * (lib/migrations.php : copie de sécurité puis migrations), cela se fait ici, une seule fois.
   * @returns {Promise<{ok: boolean, noDatabase?: boolean, version?: number, error?: string}>}
   */
  async prepareDatabase() {
    const r = await this.request('/api.php?action=schema_status', { timeout: 0 });
    let body = {};
    try { body = JSON.parse(r.body.toString()); } catch { /* ignore */ }
    if (r.status === 200) return { ok: true, version: body.version };
    const error = String(body.error || ('réponse ' + r.status));
    // Première utilisation : pas encore de base, l'interface affiche l'écran d'installation.
    if (/pas encore été importée/.test(error)) return { ok: true, noDatabase: true };
    return { ok: false, error, detail: typeof body.detail === 'string' ? body.detail.slice(0, 500) : '' };
  }

  async stop() {
    this._stopping = true;
    if (this._world) { try { this._world.kill(); } catch { /* déjà fini */ } this._world = null; } // repris au lancement suivant
    for (const t of this._restartTimers) clearTimeout(t);
    this._restartTimers.clear();
    if (this.proxy) {
      const proxy = this.proxy;
      this.proxy = null;
      proxy.closeAllConnections();
      await new Promise((r) => proxy.close(() => r()));
    }
    await Promise.all(this.backends.map((b) => {
      const child = b.child;
      if (!child || child.exitCode !== null || child.signalCode) return null;
      return new Promise((resolve) => {
        const force = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, 3000);
        child.once('exit', () => { clearTimeout(force); resolve(); });
        try { child.kill('SIGTERM'); } catch { resolve(); }
      });
    }));
    if (this.o.pidFile) { try { fs.rmSync(this.o.pidFile, { force: true }); } catch { /* ignore */ } }
    if (this._log) { this._log.end(); this._log = null; }
  }
}

module.exports = { isPackagedApp, PhpServer, findPhp, checkPhp, checkPhpAsync, explainPhpFailure, isVcRuntimeMissing, ensureWritableDir, killStalePhp, isVersionedAsset, validPort, phpRuntimeArgs, runtimeKey, phpRuntimeKey, devBundledPhp, SECRET_HEADER, isLiveSiteRequest };
