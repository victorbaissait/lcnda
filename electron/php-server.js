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

function isPortFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
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

/** Message compréhensible quand PHP ne démarre même pas (résultat de spawnSync). */
function explainPhpFailure(r) {
  // Windows : 0xC0000135 = une DLL manque (le plus souvent vcruntime140.dll, fourni par Microsoft).
  if (process.platform === 'win32' && (r.status === 3221225781 || r.status === -1073741515)) {
    return 'PHP ne démarre pas : un composant Microsoft manque (Visual C++ Redistributable 2015-2022, x64). '
      + 'Installe-le depuis https://aka.ms/vs/17/release/vc_redist.x64.exe puis relance.';
  }
  const details = [
    r.error ? r.error.message : '',
    r.status !== null && r.status !== undefined ? 'code de sortie ' + r.status : '',
    r.signal ? 'signal ' + r.signal : '',
    String(r.stderr || r.stdout || '').trim().slice(0, 300),
  ].filter(Boolean).join(' ; ');
  return 'PHP ne répond pas (' + (details || 'aucune réponse') + ')';
}

/** Vérifie que ce PHP possède tout ce dont l'application a besoin. */
function checkPhp(phpPath) {
  const code = [
    "$need=['pdo_sqlite','sqlite3','mbstring','fileinfo','zip','gd','session'];",
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

/**
 * Un seul `php -S` ne traite qu'une requête à la fois : pendant un long export, tout le reste attend.
 * Avec `pool` > 1, on lance plusieurs PHP (chacun sur son port interne) et un petit relais Node écoute sur le
 * port public : il envoie chaque requête au PHP le moins occupé. La base SQLite (mode WAL, busy_timeout) et les
 * sessions (relâchées tout de suite) supportent plusieurs processus. Sous Windows, c'est le seul moyen d'avoir
 * du parallélisme (pas de PHP_CLI_SERVER_WORKERS).
 */
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
   */
  constructor(o) {
    super();
    this.o = o;
    this.secret = crypto.randomBytes(24).toString('hex');
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
    for (const dir of [this.o.dataDir, this.o.mediaDir, this.o.sessionDir, path.dirname(this.o.logFile)]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this._openLog();
    const wanted = this.o.preferredPort;
    this.port = wanted && (await isPortFree(wanted)) ? wanted : await randomFreePort();
    if (this.poolSize === 1) {
      this.backends = [{ id: 1, port: this.port, child: null, active: 0, ready: false }];
    } else {
      for (let i = 1; i <= this.poolSize; i++) {
        this.backends.push({ id: i, port: await randomFreePort(), child: null, active: 0, ready: false });
      }
      await this._startProxy();
      this._logLine(`relais sur le port ${this.port} → ${this.poolSize} processus PHP`);
    }
    await Promise.all(this.backends.map(async (b) => { this._spawn(b); await this._waitReady(b, 20000); }));
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

  _spawn(b) {
    const o = this.o;
    const args = [
      ...phpRuntimeArgs(o.phpPath),
      '-d', 'upload_max_filesize=300M', '-d', 'post_max_size=1100M',
      '-d', 'memory_limit=1024M', '-d', 'max_execution_time=300', '-d', 'max_input_time=-1',
      '-d', 'display_errors=0', '-d', 'log_errors=1',
      '-S', `127.0.0.1:${b.port}`, '-t', o.appRoot, path.join(o.appRoot, 'router.php'),
    ];
    const env = {
      ...process.env,
      GENEALOGY_DATA_DIR: o.dataDir,
      GENEALOGY_MEDIA_DIR: o.mediaDir,
      GENEALOGY_SESSION_DIR: o.sessionDir,
      GENEALOGY_APP_SECRET: this.secret,
    };
    if (o.workers && process.platform !== 'win32') env.PHP_CLI_SERVER_WORKERS = String(o.workers);

    const tag = this.poolSize > 1 ? ` n°${b.id}` : '';
    this._logLine(`démarrage de PHP${tag} : ${o.phpPath} (port ${b.port})`);
    const child = spawn(o.phpPath, args, { cwd: o.appRoot, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    b.child = child;
    b.ready = false;
    b.active = 0;
    child.stdout.pipe(this._log, { end: false });
    child.stderr.pipe(this._log, { end: false });
    child.once('error', (err) => { this._logLine('erreur de lancement : ' + err.message); this.emit('error', err); });
    child.once('exit', (code, signal) => {
      b.ready = false;
      this._logLine(`PHP${tag} s'est arrêté (code ${code}, signal ${signal})`);
      if (this._stopping || b.child !== child) return;
      this.emit('crash', { id: b.id, code, signal });
      this._scheduleRestart(b);
    });
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
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error('PHP n’a pas répondu à temps (voir le journal).');
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
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
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
      res.writeHead(up.statusCode, up.statusMessage, up.rawHeaders);
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
  request(pathname, { withSecret = true, method = 'GET', timeout = 5000 } = {}) {
    return new Promise((resolve, reject) => {
      const headers = withSecret ? { [SECRET_HEADER]: this.secret } : {};
      const opts = { host: '127.0.0.1', port: this.port, path: pathname, method, headers, agent: false };
      if (timeout) opts.timeout = timeout;
      const req = http.request(opts, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      req.end();
    });
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
    return { ok: false, error };
  }

  async stop() {
    this._stopping = true;
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
    if (this._log) { this._log.end(); this._log = null; }
  }
}

module.exports = { PhpServer, findPhp, checkPhp, phpRuntimeArgs, runtimeKey, phpRuntimeKey, devBundledPhp, SECRET_HEADER };
