'use strict';
/**
 * 🖧 Plusieurs ordinateurs (maquette docs/design/plusieurs-ordinateurs.html, partie « simple » de l'encadré Complexité) :
 * la « porte du wifi ». Aucune dépendance à Electron : ce module se teste seul (tests/test-reseau-local.js).
 *
 * CE QUI EST OUVERT, ET QUAND
 *  - Rien tant que l'interrupteur est coupé (c'est l'état de départ) : ce serveur n'est même pas créé ; PHP et le relais
 *    restent sur 127.0.0.1 (electron/php-server.js n'est pas changé sur ce point).
 *  - Ouvert : un petit serveur HTTP qui écoute SEULEMENT sur l'adresse privée de cet ordinateur dans le réseau de la maison
 *    (10/8, 172.16/12, 192.168/16, fe80::/10, fd00::/8 ; jamais 0.0.0.0 ni une adresse publique). Toute connexion qui ne vient
 *    pas d'une adresse privée du même réseau est fermée tout de suite, avant de lire quoi que ce soit.
 *  - Il se ferme : à la main (⏻ Tout couper), en quittant l'app, à la mise en veille (main.js, powerMonitor), si l'adresse de
 *    cet ordinateur change (autre wifi) ; et au lancement suivant il reste coupé (réglage conseillé).
 *
 * QUI PASSE
 *  - Refus par défaut : un appareil inconnu ne voit que la page « Demander l'accès » (aucune donnée de la généalogie).
 *  - Demande d'accès : l'appareil donne un nom et le code d'invitation affiché sur cet ordinateur (6 caractères, valable
 *    10 min, une seule fois ; réglage « demandé » conseillé) ; 5 codes faux → plus aucune demande pendant 15 min. Il reçoit
 *    un code à 6 chiffres que cet ordinateur montre aussi : on compare les deux écrans, puis on accepte (ou on refuse) ICI
 *    seulement. Sans réponse en 2 min : refusée ; 5 refus d'affilée : pause de 15 min.
 *  - Accepté : l'appareil reçoit un jeton long et aléatoire (32 octets), une fois, dans un cookie HttpOnly SameSite=Strict ;
 *    seule son empreinte SHA-256 est gardée (dossier de données de l'ordinateur : reseau-local/appareils.json, pas dans la
 *    généalogie). Retirer l'appareil : son empreinte est effacée et ses connexions ouvertes sont coupées tout de suite.
 *  - Chaque demande d'un appareil accepté : jeton vérifié, nom d'hôte et origine vérifiés (contre le « DNS rebinding »),
 *    en-têtes x-carnet-* venus du réseau retirés ; ALORS SEULEMENT la porte ajoute le secret interne (x-carnet-secret, qui ne
 *    sort jamais sur le réseau), l'appareil (x-carnet-device, signé par x-carnet-gate) et présente à PHP le nom 127.0.0.1.
 *  - PHP (lib/reseau_local.php) : tous les appareils invités sont en lecture seule (mêmes règles que le mode consultation,
 *    kiosk_blocks), ne changent ni de généalogie ni de réglages, ne touchent ni au mot de passe ni aux sauvegardes ; le mot
 *    de passe de la généalogie est demandé à chaque appareil (séance par appareil, lib/verrou.php) et, réglage conseillé,
 *    une généalogie sans mot de passe ne s'ouvre pas au réseau ; 📜 le registre note l'appareil.
 *
 * 📱 TÉLÉPHONE DE TERRAIN (maquette docs/design/telephone-wifi.html ; lib/telephone_wifi.php) : une sorte d'appareil choisie sur
 *    l'ordinateur au moment d'accepter. Elle ne lit RIEN de la généalogie : une liste blanche ici (sa page, ses fichiers, et
 *    /terrain.php avec six actions, chacune avec sa méthode : TERRAIN_ACTIONS), une origine exacte exigée pour écrire (Origin,
 *    Referer), un corps borné (Content-Length obligatoire), un débit limité par appareil ; PHP refuse aussi tout le reste.
 *
 * LIMITE ÉCRITE : pas de HTTPS dans cette première version (seulement le jeton et les vérifications) : ce qui passe dans le
 * wifi n'est pas chiffré. Le wifi de la maison doit être protégé par sa clé (WPA2 / WPA3).
 */
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const SECRET_HEADER = 'x-carnet-secret';
const COOKIE = 'lcnda_appareil';
const INVITE_MS = 10 * 60 * 1000;      // code d'invitation : 10 min, une seule fois
const REQUEST_MS = 2 * 60 * 1000;      // une demande sans réponse : refusée après 2 min
const PAUSE_MS = 15 * 60 * 1000;       // après 5 refus d'affilée, ou 5 codes faux
const MAX_FAILS = 5;
const MAX_PENDING = 3;                 // demandes en attente en même temps (une par adresse)
const SEEN_MS = 2 * 60 * 1000;         // « connecté » = vu depuis moins de 2 min
const STALE_DAYS = 30;
const INVITE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679'; // sans 0/O, 1/I/L, 2/Z, 5/S, 8/B
const KINDS = ['lecture', 'terrain'];  // 👁 lecture seule | 📱 téléphone de terrain (déposer seulement)
/** 📱 Les seules actions qu'un téléphone de terrain peut demander à PHP (/terrain.php?action=…), avec leur méthode. Liste blanche. */
const TERRAIN_ACTIONS = { state: 'GET', list: 'GET', unlock: 'POST', lock: 'POST', deposit: 'POST', undo: 'POST' };
const TERRAIN_FILES = ['terrain.js', 'terrain.css', 'i18n.js'];
const TERRAIN_MAX_BODY = 101 * 1024 * 1024;   // une photo (100 Mo au plus, réglage) et ses champs ; PHP vérifie la taille réglée
const TERRAIN_SMALL_BODY = 16 * 1024;         // les autres écritures (mot de passe, ↶ Annuler)
const TERRAIN_RATE = { n: 60, ms: 10000 };    // 60 demandes en 10 s par téléphone, au plus (inondation : 429)
const PAIR_RATE = { n: 90, ms: 60000 };       // un appareil inconnu : 90 demandes d'accès ou questions « où en est ma demande ? » par minute et par adresse

/** Réglages (Réglages → Données → 🖧 Plusieurs ordinateurs) : la première valeur est la conseillée, réglée au départ. */
const SETTINGS = {
    relaunch: ['coupe', 'rouvre'],          // au prochain lancement de l'app : reste coupé | se rouvre tout seul
    wake: ['rouvre', 'coupe'],              // après une mise en veille : se rouvre si l'app est restée ouverte | reste coupé
    password: ['obligatoire', 'facultatif'],// mot de passe de la généalogie pour l'ouvrir au réseau
    preventSleep: ['non', 'oui'],           // empêcher la veille tant qu'un appareil est connecté
    invite: ['demande', 'sans'],            // code d'invitation en plus du code à 6 chiffres
    duration: ['toujours', '30j', 'fermeture'], // durée d'un accès : jusqu'au retrait | 30 jours | jusqu'à ce que la porte se ferme
    stale: ['proposer', 'rien'],            // appareil pas vu depuis 30 jours : proposer de le retirer | rien
    network: ['couper', 'demander'],        // l'ordinateur change de réseau : tout couper | couper et demander s'il faut rouvrir
};
const defaultSettings = () => Object.fromEntries(Object.entries(SETTINGS).map(([k, v]) => [k, v[0]]));

/* ═════════ Adresses ═════════ */

/** « ::ffff:192.168.1.5 » → « 192.168.1.5 » ; « fe80::1%en0 » → « fe80::1 » ; minuscules. */
function normalizeIp(ip) {
    let s = String(ip || '').trim().toLowerCase();
    if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
    const pct = s.indexOf('%'); if (pct >= 0) s = s.slice(0, pct);
    const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); if (m) s = m[1];
    return s;
}
function ipv4Parts(ip) {
    if (net.isIPv4(ip) !== true) return null;
    return ip.split('.').map(Number);
}
/** Les 8 groupes de 16 bits d'une adresse IPv6, ou null. */
function ipv6Groups(ip) {
    if (!net.isIPv6(ip)) return null;
    let s = ip;
    const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (v4) { const p = ipv4Parts(v4[1]); if (!p) return null; s = s.slice(0, -v4[1].length) + ((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16); }
    const [head, tail] = s.includes('::') ? s.split('::') : [s, null];
    const h = head ? head.split(':') : [];
    const t = tail !== null && tail !== undefined ? (tail ? tail.split(':') : []) : [];
    const fill = tail !== null && tail !== undefined ? 8 - h.length - t.length : 0;
    const all = [...h, ...Array(Math.max(0, fill)).fill('0'), ...t];
    if (all.length !== 8) return null;
    return all.map((g) => parseInt(g || '0', 16));
}
/** Adresse privée de la maison : 10/8, 172.16/12, 192.168/16 (IPv4) ; fe80::/10 (lien local), fd00::/8 (IPv6 privée). */
function isPrivateAddress(ip) {
    const s = normalizeIp(ip);
    const p = ipv4Parts(s);
    if (p) return p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
    const g = ipv6Groups(s);
    if (!g) return false;
    if ((g[0] & 0xffc0) === 0xfe80) return true;   // fe80::/10
    if ((g[0] & 0xff00) === 0xfd00) return true;   // fd00::/8
    return false;
}
/** Même réseau que l'adresse écoutée (IPv4 : masque de l'interface ; IPv6 : les 64 premiers bits). */
function sameNetwork(peer, local) {
    const a = normalizeIp(peer), b = normalizeIp(local && local.ip);
    if (!b) return false;
    const pa = ipv4Parts(a), pb = ipv4Parts(b);
    if (pa && pb) {
        const bits = Math.max(8, Math.min(32, Number(local.prefix) || 24));
        const n = (x) => ((x[0] << 24) >>> 0) + (x[1] << 16) + (x[2] << 8) + x[3];
        const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
        return ((n(pa) & mask) >>> 0) === ((n(pb) & mask) >>> 0);
    }
    const ga = ipv6Groups(a), gb = ipv6Groups(b);
    if (ga && gb) return ga.slice(0, 4).every((x, i) => x === gb[i]);
    return false;
}
/** L'adresse privée à écouter : la première IPv4 privée d'une interface active (sinon une IPv6 fd00::/8). null s'il n'y en a pas. */
function pickLanAddress(ifaces) {
    const list = [];
    for (const [name, arr] of Object.entries(ifaces || {})) {
        for (const a of arr || []) {
            if (!a || a.internal) continue;
            const ip = normalizeIp(a.address);
            if (!isPrivateAddress(ip)) continue;
            const family = net.isIPv4(ip) ? 4 : 6;
            const prefix = Number(String(a.cidr || '').split('/')[1]) || (family === 4 ? 24 : 64);
            list.push({ ip, family, prefix, iface: name, linkLocal: family === 6 && ip.startsWith('fe80') });
        }
    }
    return list.find((a) => a.family === 4) || list.find((a) => !a.linkLocal) || null; // fe80:: seul : non (il faudrait un nom d'interface dans l'adresse)
}

/* ═════════ Petits outils ═════════ */

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function readJson(file, fallback) { try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return v && typeof v === 'object' ? v : fallback; } catch { return fallback; } }
function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1), { mode: 0o600 });
    fs.renameSync(tmp, file);
    try { fs.chmodSync(file, 0o600); } catch { /* Windows */ }
}
/** Un nom d'appareil donné par l'appareil lui-même : il peut être faux (on compare le code), jamais de caractère de contrôle. */
function cleanName(s) {
    const v = String(s || '').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim();
    return [...v].slice(0, 40).join('');
}
function parseCookies(header) {
    const out = {};
    for (const part of String(header || '').split(';')) {
        const i = part.indexOf('='); if (i < 0) continue;
        const k = part.slice(0, i).trim(); if (k && !(k in out)) out[k] = part.slice(i + 1).trim();
    }
    return out;
}
function sixDigits() { return String(crypto.randomInt(0, 1000000)).padStart(6, '0'); }
function inviteCode() { let s = ''; for (let i = 0; i < 6; i++) s += INVITE_ALPHABET[crypto.randomInt(0, INVITE_ALPHABET.length)]; return s; }
const normInvite = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const now = () => Date.now();

/* ═════════ La porte ═════════ */

class LanGate extends EventEmitter {
    /**
     * @param {object} o
     * @param {import('./php-server').PhpServer} o.server   le serveur PHP de l'app (son port local, son secret)
     * @param {string} o.dataDir     dossier de données PARTAGÉ de l'ordinateur (pas celui d'une généalogie)
     * @param {string} o.appRoot     dossier de l'app (page « Demander l'accès » et ses fichiers)
     * @param {() => object} [o.interfaces]  os.networkInterfaces (remplaçable pour les essais)
     * @param {object} [o.test]      essais seulement (refusé dans l'app installée) : {bind: '127.0.0.1', address: {ip, prefix}, peer: () => ip}
     */
    constructor(o) {
        super();
        this.o = o;
        this.dir = path.join(o.dataDir, 'reseau-local');
        this.devicesFile = path.join(this.dir, 'appareils.json');
        this.settingsFile = path.join(this.dir, 'reglages.json');
        this.interfaces = o.interfaces || (() => os.networkInterfaces());
        this.test = o.test && !o.packaged ? o.test : null;
        this.httpd = null;
        this.address = null;      // {ip, prefix, family}
        this.port = 0;
        this.since = 0;
        this.invite = null;       // {code, expires}
        this.requests = new Map(); // id → demande en attente
        this.answered = new Map(); // id → {state, token?, at} : la réponse, gardée 2 min pour l'appareil qui la demande
        this.fails = { refused: 0, invite: 0, pauseUntil: 0, reason: '' };
        this.sockets = new Map(); // socket → id de l'appareil (pour couper tout de suite au retrait)
        this.seen = new Map();    // id → {at, ip} depuis l'ouverture
        this.removed = new Map(); // id → appareil retiré (↶ Annuler pendant 10 s)
        this.rate = new Map();    // id d'un téléphone de terrain → heures de ses dernières demandes (débit limité)
        this.pairRate = new Map(); // adresse d'un appareil inconnu → heures de ses demandes d'accès (débit limité)
        this.lastError = '';
        this.closedReason = '';
        this._timer = null;
        this._dirty = false;
        const st = readJson(this.settingsFile, {});
        this.state = { settings: { ...defaultSettings(), ...this._cleanSettings(st.settings || {}) }, port: Number(st.port) || 0, wasOpen: !!st.wasOpen, lastNet: String(st.lastNet || '') };
        const dv = readJson(this.devicesFile, { devices: [] });
        this.devices = (Array.isArray(dv.devices) ? dv.devices : []).filter((d) => d && /^[a-f0-9]{16}$/.test(d.id) && /^[a-f0-9]{64}$/.test(d.hash));
        this._dropTemporary(); // un accès « jusqu'à la fermeture » ne survit pas à un lancement
    }

    get isOn() { return !!this.httpd; }
    get settings() { return { ...this.state.settings }; }
    get url() { if (!this.address) return ''; return `http://${this.address.family === 6 ? `[${this.address.ip}]` : this.address.ip}:${this.port}`; }

    _cleanSettings(patch) {
        const out = {};
        for (const [k, v] of Object.entries(patch || {})) if (SETTINGS[k] && SETTINGS[k].includes(v)) out[k] = v;
        return out;
    }
    _saveState() { try { writeJson(this.settingsFile, this.state); } catch (e) { this.lastError = e.message; } }
    _saveDevices() { try { writeJson(this.devicesFile, { devices: this.devices }); this._dirty = false; } catch (e) { this.lastError = e.message; } }
    _dropTemporary() {
        const before = this.devices.length;
        this.devices = this.devices.filter((d) => d.duration !== 'fermeture' && !(d.expires && d.expires < now()));
        if (this.devices.length !== before) this._saveDevices();
    }

    setSettings(patch) {
        this.state.settings = { ...this.state.settings, ...this._cleanSettings(patch) };
        this._saveState();
        this.emit('change');
        return this.settings;
    }

    /** Tout ce que montre la page des réglages (jamais un jeton ni une empreinte). */
    status() {
        const t = now();
        this._expire();
        const stale = this.state.settings.stale === 'proposer';
        return {
            on: this.isOn, url: this.url, address: this.address ? this.address.ip : '', port: this.port || this.state.port || 0, since: this.since,
            invite: this.isOn && this.state.settings.invite === 'demande' && !(this.fails.pauseUntil > t) ? this._currentInvite() : null, // en pause : aucun code
            requests: [...this.requests.values()].map((r) => ({ id: r.id, name: r.name, ip: r.ip, code: r.code, at: r.at, expires: r.at + REQUEST_MS, wants: r.wants || 'lecture' })),
            devices: this.devices.map((d) => {
                const s = this.seen.get(d.id);
                const last = Math.max(Number(d.lastSeen) || 0, s ? s.at : 0);
                return { id: d.id, name: d.name, created: d.created, lastSeen: last, lastIp: (s && s.ip) || d.lastIp || '', connected: !!(this.isOn && s && t - s.at < SEEN_MS),
                    duration: d.duration || 'toujours', expires: d.expires || 0, rights: d.kind === 'terrain' ? 'depot' : 'lecture', kind: d.kind === 'terrain' ? 'terrain' : 'lecture', stale: stale && last > 0 ? t - last > STALE_DAYS * 86400e3 : stale && t - (Number(d.created) || t) > STALE_DAYS * 86400e3 };
            }),
            connected: this.connectedCount(),
            pauseUntil: this.fails.pauseUntil > t ? this.fails.pauseUntil : 0, pauseReason: this.fails.pauseUntil > t ? this.fails.reason : '',
            refusedInRow: this.fails.refused, settings: this.settings, closedReason: this.closedReason, lastError: this.lastError,
            canOpen: !!(this.test || pickLanAddress(this.interfaces())),
        };
    }
    connectedCount() { const t = now(); let n = 0; for (const d of this.devices) { const s = this.seen.get(d.id); if (this.isOn && s && t - s.at < SEEN_MS) n++; } return n; }

    _currentInvite() {
        if (!this.invite || this.invite.expires < now() || this.invite.used) this.invite = { code: inviteCode(), expires: now() + INVITE_MS, used: false };
        return { code: this.invite.code, expires: this.invite.expires };
    }
    newInvite() { this.invite = null; const v = this._currentInvite(); this.emit('change'); return v; }

    /* ─── ouvrir, fermer ─── */

    /** @param {{passwordOk?: boolean}} [o] passwordOk : la généalogie ouverte a un mot de passe (vérifié par main.js auprès de PHP) */
    async open(o = {}) {
        if (this.isOn) return { ok: true, url: this.url };
        this.lastError = ''; this.closedReason = '';
        if (this.state.settings.password === 'obligatoire' && o.passwordOk === false) return { ok: false, error: 'nopw' };
        let address, bind;
        if (this.test) { address = { ip: normalizeIp(this.test.address.ip), prefix: this.test.address.prefix || 24, family: net.isIPv4(normalizeIp(this.test.address.ip)) ? 4 : 6 }; bind = this.test.bind || '127.0.0.1'; }
        else { address = pickLanAddress(this.interfaces()); bind = address && address.ip; }
        if (!address || !isPrivateAddress(address.ip)) return { ok: false, error: 'noprivate' };
        const server = http.createServer((req, res) => this._handle(req, res));
        server.requestTimeout = 0; server.headersTimeout = 30000; server.keepAliveTimeout = 5000; server.maxConnections = 64;
        server.on('connection', (socket) => {
            // avant de lire quoi que ce soit : une adresse qui n'est pas de la maison est coupée
            if (!this._peerOk(this._peer(socket))) { socket.destroy(); return; }
            socket.on('close', () => this.sockets.delete(socket));
        });
        server.on('clientError', (_e, socket) => { try { socket.destroy(); } catch { /* ignore */ } });
        const listen = (port) => new Promise((resolve, reject) => {
            const onErr = (e) => { server.off('listening', onOk); reject(e); };
            const onOk = () => { server.off('error', onErr); resolve(server.address().port); };
            server.once('error', onErr); server.once('listening', onOk);
            server.listen({ port, host: bind, exclusive: true });
        });
        let port = this.state.port;
        try {
            try { port = await listen(port || 0); } catch (e) { if (!port) throw e; port = await listen(0); } // le port gardé est pris : un autre
        } catch (e) { this.lastError = e.code || e.message; return { ok: false, error: 'listen' }; }
        this.httpd = server; this.address = address; this.port = port; this.since = now();
        this.state.port = port; this.state.wasOpen = true; this.state.lastNet = this._netKey(address); this._saveState();
        this.seen.clear(); this.invite = null;
        this._timer = setInterval(() => this._tick(), 10000); this._timer.unref?.();
        this.emit('open', { url: this.url });
        this.emit('change');
        return { ok: true, url: this.url };
    }

    /** @param {string} reason 'main' (⏻ Tout couper) | 'quit' | 'veille' | 'reseau' | … ; keepWasOpen : la fermeture n'est pas un choix (veille, fermeture) */
    async close(reason = 'main', { keepWasOpen = false } = {}) {
        clearInterval(this._timer); this._timer = null;
        const server = this.httpd;
        this.httpd = null;
        if (this._dirty) this._saveDevices();
        this.requests.clear(); this.answered.clear(); this.invite = null; this.seen.clear();
        if (!keepWasOpen) { this.state.wasOpen = false; this._saveState(); }
        // un accès « jusqu'à ce que la porte se ferme » s'arrête ici
        const before = this.devices.length;
        this.devices = this.devices.filter((d) => d.duration !== 'fermeture');
        if (this.devices.length !== before) this._saveDevices();
        if (!server) return;
        this.closedReason = reason;
        for (const s of this.sockets.keys()) { try { s.destroy(); } catch { /* ignore */ } }
        this.sockets.clear();
        try { server.closeAllConnections(); } catch { /* ignore */ }
        await new Promise((r) => server.close(() => r()));
        this.emit('close', { reason });
        this.emit('change');
    }

    /**
     * Mise en veille de l'ordinateur (main.js, powerMonitor « suspend ») : la porte se coupe si elle est ouverte.
     * @returns {Promise<boolean>} vrai si elle était ouverte (à rouvrir peut-être au réveil), faux si elle était déjà coupée
     */
    async sleep() {
        if (!this.isOn) return false;
        await this.close('veille', { keepWasOpen: true });
        return true;
    }
    /** Réveil (powerMonitor « resume ») : la rouvrir ? Seulement si ELLE ÉTAIT OUVERTE avant la veille, si le réglage le dit et si le
     *  réseau n'a pas changé. Une porte coupée avant la veille reste coupée, quoi qu'il arrive. */
    shouldReopenAfterWake(wasOpenBeforeSleep) {
        return wasOpenBeforeSleep === true && !this.isOn && this.state.settings.wake === 'rouvre' && !this.networkChanged();
    }

    _netKey(a) { return a ? `${a.ip}/${a.prefix}` : ''; }
    /** Le réseau a-t-il changé depuis la dernière ouverture ? (une autre adresse, un autre masque) */
    networkChanged() {
        if (this.test) return false;
        const a = pickLanAddress(this.interfaces());
        return !a || (this.state.lastNet && this._netKey(a) !== this.state.lastNet);
    }

    _tick() {
        this._expire();
        if (this._dirty) this._saveDevices();
        if (this.test || !this.address) return;
        // l'adresse écoutée a disparu (autre wifi, câble débranché) : tout se coupe
        const still = Object.values(this.interfaces() || {}).flat().some((a) => a && normalizeIp(a.address) === this.address.ip);
        if (!still) { this.close('reseau').then(() => this.emit('network-changed', { policy: this.state.settings.network })); }
    }

    _expire() {
        const t = now();
        for (const r of [...this.requests.values()]) {
            if (t - r.at > REQUEST_MS) { this.requests.delete(r.id); this.answered.set(r.id, { state: 'expire', at: t, poll: r.poll }); this._countRefusal('expire'); this.emit('request-gone', { id: r.id, state: 'expire' }); }
        }
        for (const [id, a] of this.answered) if (t - a.at > REQUEST_MS) this.answered.delete(id);
        for (const [id, d] of this.removed) if (t - d.removedAt > 10000) this.removed.delete(id);
        const exp = this.devices.filter((d) => d.expires && d.expires < t);
        if (exp.length) { exp.forEach((d) => this._cut(d.id)); this.devices = this.devices.filter((d) => !exp.includes(d)); this._saveDevices(); }
    }
    _countRefusal(kind) {
        this.fails.refused++;
        if (this.fails.refused >= MAX_FAILS) { this.fails.pauseUntil = now() + PAUSE_MS; this.fails.reason = 'refus'; this.fails.refused = 0; this.emit('paused', { reason: 'refus', kind }); }
        this.emit('change');
    }

    /* ─── accepter, refuser, retirer (seulement depuis la fenêtre de l'ordinateur principal : main.js) ─── */

    /** @param {string} id  @param {string} [kind] la sorte choisie sur l'ordinateur : 'lecture' (👁) ou 'terrain' (📱) ; sans choix : celle que l'appareil a demandée */
    accept(id, kind) {
        this._expire();
        const r = this.requests.get(String(id || ''));
        if (!r) return { ok: false, error: 'gone' };
        if (kind !== undefined && kind !== '' && !KINDS.includes(kind)) return { ok: false, error: 'kind' };
        this.requests.delete(r.id);
        const token = crypto.randomBytes(32).toString('base64url');
        const dur = this.state.settings.duration;
        const dev = { id: crypto.randomBytes(8).toString('hex'), name: r.name, hash: sha256(token), created: now(), lastSeen: 0, lastIp: r.ip, duration: dur,
            expires: dur === '30j' ? now() + 30 * 86400e3 : 0, kind: kind || (r.wants === 'terrain' ? 'terrain' : 'lecture') };
        this.devices.push(dev); this._saveDevices();
        this.answered.set(r.id, { state: 'accepte', token, at: now(), poll: r.poll, deviceId: dev.id });
        this.fails.refused = 0;
        this.emit('device-added', { id: dev.id, name: dev.name, ip: r.ip, kind: dev.kind });
        this.emit('change');
        return { ok: true, device: { id: dev.id, name: dev.name, kind: dev.kind } };
    }
    refuse(id) {
        const r = this.requests.get(String(id || ''));
        if (!r) return { ok: false, error: 'gone' };
        this.requests.delete(r.id);
        this.answered.set(r.id, { state: 'refuse', at: now(), poll: r.poll });
        this._countRefusal('refus');
        this.emit('request-refused', { id: r.id, name: r.name, ip: r.ip });
        return { ok: true };
    }
    _cut(deviceId) {
        for (const [s, d] of this.sockets) if (d === deviceId) { try { s.destroy(); } catch { /* ignore */ } this.sockets.delete(s); }
        this.seen.delete(deviceId);
    }
    remove(id) {
        const d = this.devices.find((x) => x.id === String(id || ''));
        if (!d) return { ok: false, error: 'gone' };
        this.devices = this.devices.filter((x) => x !== d);
        this._saveDevices();     // tout de suite : le jeton est refusé dès la prochaine demande…
        this._cut(d.id);         // …et ses connexions déjà ouvertes sont fermées
        this.removed.set(d.id, { ...d, removedAt: now() });
        this.emit('device-removed', { id: d.id, name: d.name, kind: d.kind || 'lecture' });
        this.emit('change');
        return { ok: true, name: d.name };
    }
    /** ⏻ Retirer tous les téléphones de terrain (ou toute une sorte) d'un coup. */
    removeKind(kind = 'terrain') {
        const ids = this.devices.filter((d) => (d.kind || 'lecture') === kind).map((d) => d.id);
        ids.forEach((id) => this.remove(id));
        return { ok: true, n: ids.length };
    }
    /** ↶ Annuler un retrait, dans les 10 secondes (ensuite, il faut autoriser l'appareil de nouveau). */
    undoRemove(id) {
        const d = this.removed.get(String(id || ''));
        if (!d || now() - d.removedAt > 10000) return { ok: false, error: 'late' };
        this.removed.delete(d.id);
        const { removedAt, ...dev } = d; // eslint-disable-line no-unused-vars
        this.devices.push(dev); this._saveDevices();
        this.emit('change');
        return { ok: true, name: dev.name };
    }

    /* ─── une demande venue du réseau ─── */

    _peer(socket) {
        if (this.test && typeof this.test.peer === 'function') return normalizeIp(this.test.peer(socket));
        return normalizeIp(socket && socket.remoteAddress);
    }
    _peerOk(ip) { return isPrivateAddress(ip) && sameNetwork(ip, this.address); }
    _hostOk(req) {
        const want = (this.address.family === 6 ? `[${this.address.ip}]` : this.address.ip) + ':' + this.port;
        return String(req.headers.host || '').toLowerCase() === want;
    }
    _send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
        const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
        res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'no-referrer', ...extra });
        res.end(data);
    }
    _deviceFor(req) {
        const tok = parseCookies(req.headers.cookie)[COOKIE] || '';
        if (!/^[A-Za-z0-9_-]{43}$/.test(tok)) return null;
        const h = sha256(tok);
        const d = this.devices.find((x) => safeEqual(x.hash, h));
        if (!d || (d.expires && d.expires < now())) return null;
        return d;
    }

    _handle(req, res) {
        const peer = this._peer(req.socket);
        if (!this.isOn || !this._peerOk(peer)) { req.socket.destroy(); return; }
        if (!this._hostOk(req)) { this._send(res, 421, { error: 'host' }); return; }
        let u;
        const raw = String(req.url || '/');
        if (!raw.startsWith('/') || raw.startsWith('//')) { this._send(res, 400, { error: 'url' }); return; } // « //hôte/… » se lirait comme un autre hôte
        try { u = new URL(raw, 'http://gate.invalid'); } catch { this._send(res, 400, { error: 'url' }); return; }
        const method = String(req.method || 'GET').toUpperCase();
        // une écriture vient de cette même adresse (une page d'un autre site ne peut pas écrire ici)
        const origin = req.headers.origin;
        if (!['GET', 'HEAD'].includes(method) && origin !== undefined && origin !== this.url) { this._send(res, 403, { error: 'origin' }); return; }
        if (u.pathname.startsWith('/__lan/')) { this._pairing(req, res, u, method, peer); return; }
        const dev = this._deviceFor(req);
        if (!dev) {
            if (method === 'GET' && (u.pathname === '/' || u.pathname === '/index.php')) { this._pairingPage(req, res); return; }
            if (method === 'GET' && u.pathname === '/terrain') { this._pairingPage(req, res, true); return; } // 📱 le QR code du téléphone mène ici
            if (method === 'GET' && u.pathname === '/famille.php') { this._pairingPage(req, res, false, true); return; } // 👪 le lien d'invitation de la famille mène ici (puis à la page de la famille)
            // les mots de la page « Demander l'accès » (assets/js/app-i18n.js les lit à cette adresse) : un dictionnaire, rien de la généalogie
            const m = u.pathname.match(/^\/assets\/i18n\/([a-z]{2})\.json$/);
            if (method === 'GET' && m) { this._asset(res, `i18n-${m[1]}.json`); return; }
            this._send(res, 401, { error: 'Cet appareil n’est pas autorisé.', lan_unknown: true });
            return;
        }
        if (dev.kind === 'terrain') { this._terrain(req, res, dev, peer, u, method); return; }
        this._forward(req, res, dev, peer, u);
    }

    /**
     * 📱 Un téléphone de terrain : sa page, ses trois fichiers, les mots de la langue, et /terrain.php avec une action de la liste
     * blanche et sa méthode. Tout le reste : 403 (rien n'est transmis à PHP).
     */
    _terrain(req, res, dev, peer, u, method) {
        const t = now();
        const hits = (this.rate.get(dev.id) || []).filter((x) => t - x < TERRAIN_RATE.ms);
        hits.push(t); this.rate.set(dev.id, hits);
        if (hits.length > TERRAIN_RATE.n) { req.resume(); this._send(res, 429, { error: 'flood', lan_terrain: true }, undefined, { 'Retry-After': String(Math.ceil(TERRAIN_RATE.ms / 1000)) }); return; }
        const refuse = (status = 403, error = 'terrain') => { req.resume(); this._send(res, status, { error, lan_terrain: true }); };
        // jamais une page d'un autre site (origine, page d'où vient le lien), même pour lire
        const origin = req.headers.origin, referer = req.headers.referer;
        if (origin !== undefined && origin !== this.url) { refuse(403, 'origin'); return; }
        if (referer !== undefined && !String(referer).startsWith(this.url + '/')) { refuse(403, 'referer'); return; }
        const p = u.pathname;
        if (method === 'GET' && (p === '/' || p === '/terrain')) { this._seen(dev, peer); this._terrainPage(req, res); return; }
        if (method === 'GET' && p.startsWith('/__lan/f/') && TERRAIN_FILES.includes(p.slice('/__lan/f/'.length))) { this._asset(res, p.slice('/__lan/f/'.length)); return; }
        const m = p.match(/^\/assets\/i18n\/([a-z]{2})\.json$/);
        if (method === 'GET' && m) { this._asset(res, `i18n-${m[1]}.json`); return; }
        if (p !== '/terrain.php') { refuse(); return; }
        const action = String(u.searchParams.get('action') || '');
        if (!Object.prototype.hasOwnProperty.call(TERRAIN_ACTIONS, action)) { refuse(); return; }
        if (TERRAIN_ACTIONS[action] !== method) { refuse(405, 'method'); return; }
        if (method === 'POST') {
            if (origin !== this.url) { refuse(403, 'origin'); return; } // une écriture : l'origine exacte est exigée (fetch l'envoie toujours)
            if (req.headers['transfer-encoding'] !== undefined) { refuse(411, 'length'); return; }
            const len = Number(req.headers['content-length']);
            const max = action === 'deposit' ? TERRAIN_MAX_BODY : TERRAIN_SMALL_BODY;
            if (req.headers['content-length'] === undefined || !Number.isFinite(len) || len < 0) { refuse(411, 'length'); return; }
            if (len > max) { this._send(res, 413, { error: 'size', lan_terrain: true }, undefined, { Connection: 'close' }); req.socket.destroySoon?.(); return; }
        }
        // la demande transmise est refaite ici : seulement l'action et, pour la liste, le texte cherché (40 caractères au plus)
        const q = new URLSearchParams({ action });
        if (action === 'list') q.set('q', String(u.searchParams.get('q') || '').slice(0, 40));
        // un dépôt : un formulaire de 5 parties au plus (csrf, batch, note, for, photo) ; au-delà, l'envoi est coupé avant PHP
        let inspect = null;
        if (action === 'deposit') {
            const bm = String(req.headers['content-type'] || '').match(/^multipart\/form-data;\s*boundary=("?)([^";]{1,70})\1\s*$/i);
            if (!bm) { refuse(415, 'type'); return; }
            const mark = Buffer.from('\r\n--' + bm[2]);
            let tail = Buffer.from('\r\n'), parts = 0;
            inspect = (chunk) => {
                const buf = Buffer.concat([tail, chunk]);
                for (let i = buf.indexOf(mark); i >= 0; i = buf.indexOf(mark, i + mark.length)) if (i + mark.length > tail.length) parts++; // déjà comptée si elle tenait dans la fin d'avant
                tail = buf.subarray(Math.max(0, buf.length - mark.length + 1));
                return parts <= 6; // 5 parties et la marque de fin
            };
        }
        this._forward(req, res, dev, peer, u, `/terrain.php?${q.toString()}`, (status) => { if (action === 'deposit' && status === 200) this.emit('terrain-deposit', { id: dev.id, name: dev.name }); }, inspect);
    }
    _seen(dev, peer) {
        const t = now(), prev = this.seen.get(dev.id);
        this.seen.set(dev.id, { at: t, ip: peer });
        if (!prev || t - prev.at > 60000) { dev.lastSeen = t; dev.lastIp = peer; this._dirty = true; }
        if (!prev) this.emit('device-connect', { id: dev.id, name: dev.name, ip: peer, kind: dev.kind });
        if (!prev || t - prev.at > SEEN_MS) this.emit('change');
    }

    _forward(req, res, dev, peer, u, pathOverride, onDone, inspect) {
        this.sockets.set(req.socket, dev.id);
        const first = !this.seen.has(dev.id);
        const t = now();
        const prev = this.seen.get(dev.id);
        this.seen.set(dev.id, { at: t, ip: peer });
        if (!prev || t - prev.at > 60000) { dev.lastSeen = t; dev.lastIp = peer; this._dirty = true; }
        if (first) this.emit('device-connect', { id: dev.id, name: dev.name, ip: peer, kind: dev.kind || 'lecture' });
        if (!prev || t - prev.at > SEEN_MS) this.emit('change');
        const target = this.o.server;
        const headers = {};
        for (const [k, v] of Object.entries(req.headers)) {
            const key = k.toLowerCase();
            if (key.startsWith('x-carnet') || ['host', 'origin', 'referer', 'cookie', 'connection', 'proxy-connection', 'keep-alive', 'upgrade', 'forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'authorization'].includes(key)) continue;
            headers[key] = v;
        }
        const local = `127.0.0.1:${target.port}`;
        headers.host = local;
        if (req.headers.origin !== undefined) headers.origin = `http://${local}`;
        const cookies = parseCookies(req.headers.cookie); delete cookies[COOKIE];
        const cookieLine = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
        if (cookieLine) headers.cookie = cookieLine;
        headers[SECRET_HEADER] = target.secret;           // ajouté ici, jamais reçu ni renvoyé sur le réseau
        headers['x-carnet-gate'] = target.gateSecret;
        headers['x-carnet-device'] = dev.id;
        headers['x-carnet-device-name'] = encodeURIComponent(dev.name);
        headers['x-carnet-device-ip'] = peer;
        if (this.state.settings.password === 'obligatoire') headers['x-carnet-device-pw'] = '1';
        headers['x-carnet-device-kind'] = dev.kind === 'terrain' ? 'terrain' : 'lecture'; // signé comme le reste (x-carnet-gate)
        const upstream = http.request({ host: '127.0.0.1', port: target.port, method: req.method, path: pathOverride || (u.pathname + u.search), headers, agent: false }, (up) => {
            const out = {};
            for (const [k, v] of Object.entries(up.headers)) {
                const key = k.toLowerCase();
                if (key.startsWith('x-carnet') || key === 'connection' || key === 'keep-alive') continue;
                if (key === 'location') { out[k] = String(v).split(target.origin).join(this.url); continue; }
                out[k] = v;
            }
            out['x-frame-options'] = out['x-frame-options'] || 'SAMEORIGIN';
            res.writeHead(up.statusCode, out);
            up.pipe(res);
            if (onDone) up.on('end', () => onDone(up.statusCode));
            up.on('error', () => res.destroy());
        });
        upstream.on('error', () => { if (!res.headersSent) this._send(res, 502, { error: 'PHP injoignable' }); else res.destroy(); });
        res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
        if (inspect) { // lu au passage : à la première chose refusée, rien ne va plus loin (PHP voit un envoi coupé et n'enregistre rien)
            let cut = false;
            req.on('data', (c) => { if (!cut && !inspect(c)) { cut = true; req.unpipe(upstream); upstream.destroy(); if (!res.headersSent) this._send(res, 422, { error: 'parts', lan_terrain: true }, undefined, { Connection: 'close' }); req.resume(); } });
        }
        req.pipe(upstream);
    }

    /* ─── « Demander l'accès » ─── */

    _readBody(req, max = 2048) {
        return new Promise((resolve) => {
            let n = 0; const chunks = [];
            req.on('data', (c) => { n += c.length; if (n > max) { req.destroy(); resolve(null); } else chunks.push(c); });
            req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { resolve(null); } });
            req.on('error', () => resolve(null));
        });
    }

    async _pairing(req, res, u, method, peer) {
        const p = u.pathname;
        // les fichiers de la page (rien de la généalogie) : servis tels quels, liste fermée
        if (method === 'GET' && p.startsWith('/__lan/f/')) { this._asset(res, p.slice('/__lan/f/'.length)); return; }
        if (p === '/__lan/demande' || p === '/__lan/etat') { // freine qui essaierait des numéros de demande ou des clés au hasard
            const t = now(), hits = (this.pairRate.get(peer) || []).filter((x) => t - x < PAIR_RATE.ms);
            hits.push(t); this.pairRate.set(peer, hits);
            if (this.pairRate.size > 512) { for (const [k, v] of this.pairRate) if (!v.length || t - v[v.length - 1] > PAIR_RATE.ms) this.pairRate.delete(k); }
            if (hits.length > PAIR_RATE.n) { req.resume(); this._send(res, 429, { error: 'flood' }, undefined, { 'Retry-After': '60' }); return; }
        }
        if (method === 'POST' && p === '/__lan/demande') {
            const t = now();
            this._expire();
            if (this.fails.pauseUntil > t) { this._send(res, 429, { error: 'pause', wait: Math.ceil((this.fails.pauseUntil - t) / 1000) }, undefined, { 'Retry-After': String(Math.ceil((this.fails.pauseUntil - t) / 1000)) }); return; }
            const body = await this._readBody(req);
            if (!body || typeof body !== 'object') { this._send(res, 400, { error: 'body' }); return; }
            if (this.state.settings.invite === 'demande') {
                const inv = this.invite;
                const ok = inv && !inv.used && inv.expires > t && safeEqual(normInvite(body.invite), inv.code);
                if (!ok) {
                    this.fails.invite++;
                    if (this.fails.invite >= MAX_FAILS) { this.fails.pauseUntil = t + PAUSE_MS; this.fails.reason = 'code'; this.fails.invite = 0; this.invite = null; this.emit('paused', { reason: 'code' }); }
                    this.emit('change');
                    await new Promise((r) => setTimeout(r, 400)); // freine les essais au hasard
                    this._send(res, 403, { error: 'invite' });
                    return;
                }
            }
            if ([...this.requests.values()].some((r) => r.ip === peer)) { this._send(res, 409, { error: 'pending' }); return; }
            if (this.requests.size >= MAX_PENDING) { this._send(res, 429, { error: 'busy' }); return; }
            if (this.state.settings.invite === 'demande') { this.invite.used = true; this.fails.invite = 0; }
            const r = { id: crypto.randomBytes(12).toString('hex'), poll: crypto.randomBytes(24).toString('base64url'), name: cleanName(body.name) || 'Appareil', ip: peer, code: sixDigits(), at: t,
                wants: body.kind === 'terrain' ? 'terrain' : 'lecture' }; // seulement une proposition : la sorte se choisit sur l'ordinateur
            this.requests.set(r.id, r);
            this.emit('request', { id: r.id, name: r.name, ip: r.ip, code: r.code, at: r.at, wants: r.wants });
            this.emit('change');
            this._send(res, 200, { id: r.id, poll: r.poll, code: r.code, expires: r.at + REQUEST_MS });
            return;
        }
        if (method === 'GET' && p === '/__lan/etat') {
            this._expire();
            const id = String(u.searchParams.get('id') || ''), poll = String(u.searchParams.get('k') || '');
            const r = this.requests.get(id);
            if (r) { if (!safeEqual(poll, r.poll)) { this._send(res, 404, { state: 'inconnu' }); return; } this._send(res, 200, { state: 'attente', code: r.code }); return; }
            const a = this.answered.get(id);
            if (!a || !safeEqual(poll, a.poll)) { this._send(res, 404, { state: 'inconnu' }); return; }
            this.answered.delete(id); // une seule fois : le jeton ne se redonne pas
            if (a.state === 'accepte') {
                const dev = this.devices.find((d) => d.id === a.deviceId);
                if (!dev) { this._send(res, 200, { state: 'refuse' }); return; }
                const age = dev.duration === 'fermeture' ? '' : `; Max-Age=${dev.expires ? Math.max(60, Math.floor((dev.expires - now()) / 1000)) : 10 * 365 * 86400}`;
                this._send(res, 200, { state: 'accepte', name: dev.name }, undefined, { 'Set-Cookie': `${COOKIE}=${a.token}; Path=/; HttpOnly; SameSite=Strict${age}` });
                return;
            }
            this._send(res, 200, { state: a.state });
            return;
        }
        this._send(res, 404, { error: 'introuvable' });
    }

    /** Fichiers de la page « Demander l'accès » : liste fermée (aucun chemin choisi par l'appareil). */
    _asset(res, name) {
        const root = this.o.appRoot;
        const allowed = {
            'appairage.js': ['assets/js/app-reseau-appairage.js', 'text/javascript; charset=utf-8'],
            'appairage.css': ['assets/css/reseau-local.css', 'text/css; charset=utf-8'],
            'i18n.js': ['assets/js/app-i18n.js', 'text/javascript; charset=utf-8'],
            'terrain.js': ['assets/js/app-terrain.js', 'text/javascript; charset=utf-8'],     // 📱 la page du téléphone de terrain
            'terrain.css': ['assets/css/terrain.css', 'text/css; charset=utf-8'],
        };
        let file = allowed[name];
        const m = String(name).match(/^i18n-([a-z]{2})\.json$/);
        if (!file && m) file = [`assets/i18n/${m[1]}.json`, 'application/json; charset=utf-8'];
        if (!file || !root) { this._send(res, 404, { error: 'introuvable' }); return; }
        fs.readFile(path.join(root, file[0]), (err, data) => {
            if (err) { this._send(res, 404, { error: 'introuvable' }); return; }
            this._send(res, 200, data, file[1], { 'Cache-Control': 'no-cache' });
        });
    }

    /** @param {boolean} [terrain] le QR code « ＋ Ajouter un téléphone de terrain » : la demande propose cette sorte, puis la page du téléphone
     *  @param {boolean} [famille] 👪 le lien d'invitation d'un compte de la famille : une fois accepté, l'appareil va sur /famille.php */
    _pairingPage(req, res, terrain = false, famille = false) {
        const lang = this._lang(req.headers['accept-language']);
        const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>🖧 LCNDA</title><link rel="stylesheet" href="/__lan/f/appairage.css">
<script>window.LCNDA_I18N_FIRST=${JSON.stringify(lang)};window.LCNDA_LAN_PAIR={invite:${this.state.settings.invite === 'demande' ? 'true' : 'false'},terrain:${terrain ? 'true' : 'false'},famille:${famille ? 'true' : 'false'}};</script>
<script src="/__lan/f/i18n.js"></script></head><body class="lan-pair-body"><main id="lan-pair" class="lan-pair"></main>
<script src="/__lan/f/appairage.js"></script></body></html>`;
        this._send(res, 200, html, 'text/html; charset=utf-8', { 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'" });
    }
    /** 📱 La page du téléphone de terrain (rien de la généalogie dedans : elle lit son état par /terrain.php). */
    _terrainPage(req, res) {
        const lang = this._lang(req.headers['accept-language']);
        const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="referrer" content="no-referrer"><meta name="theme-color" content="#2f5d8a"><title>📱 LCNDA</title>
<link rel="stylesheet" href="/__lan/f/terrain.css"><script>window.LCNDA_I18N_FIRST=${JSON.stringify(lang)};</script>
<script src="/__lan/f/i18n.js"></script></head><body class="tw-body"><main id="tw" class="tw"></main><script src="/__lan/f/terrain.js"></script></body></html>`;
        this._send(res, 200, html, 'text/html; charset=utf-8', { 'Content-Security-Policy': "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'" });
    }
    _lang(accept) {
        const codes = ['fr', 'en', 'es', 'de', 'it', 'pt', 'pl', 'nl', 'cs', 'sv', 'da', 'sk', 'nb', 'ro', 'fi', 'hu', 'hr', 'sl', 'lt', 'lv', 'et', 'is', 'tr', 'lb', 'sq', 'mt', 'vi', 'id', 'ru', 'uk', 'el', 'bg'];
        for (const part of String(accept || '').toLowerCase().split(',')) {
            let c = part.trim().slice(0, 2); if (c === 'no' || c === 'nn') c = 'nb';
            if (codes.includes(c)) return c;
        }
        return 'fr';
    }
}

module.exports = { LanGate, TERRAIN_ACTIONS, TERRAIN_RATE, TERRAIN_MAX_BODY, SETTINGS, defaultSettings, isPrivateAddress, sameNetwork, pickLanAddress, normalizeIp, cleanName, COOKIE, REQUEST_MS, INVITE_MS, PAUSE_MS, MAX_FAILS };
