'use strict';
/**
 * 🪟 Widgets sur le bureau : ce qui ne dépend pas d'Electron (testable dans Node : tests/test-site-web.js).
 * Les fenêtres sont ouvertes par electron/main.js ; la page du widget vient de PHP (lib/desk_widgets.php,
 * GET api.php?action=desk_widget_page&kind=…), en lecture seule, sans pont vers l'application (pas de preload).
 */
const KINDS = {
    today: { title: 'Ce jour-là', w: 320, h: 330 },
    ancestor: { title: 'Un ancêtre', w: 320, h: 240 },
    photo: { title: 'Photo du jour', w: 340, h: 300 },
    countdown: { title: 'Compte à rebours', w: 300, h: 210 },
    calc: { title: 'Calculette', w: 320, h: 340 },
};

/** Ce que la page peut demander : seulement ces champs, nettoyés (la page ne choisit jamais d'adresse ni de fichier). */
function cleanOptions(kind, o) {
    o = o && typeof o === 'object' ? o : {};
    const label = typeof o.label === 'string' ? o.label.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 60) : '';
    let date = typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : '';
    if (date) { const [y, m, d] = date.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d)); if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) date = ''; }
    return { onTop: o.onTop === true, label: kind === 'countdown' ? label : '', date: kind === 'countdown' ? date : '' };
}

/** L'adresse (chemin) de la page du widget, sur le serveur de l'application. */
function widgetPath(kind, opts) {
    if (!KINDS[kind]) throw new Error('Widget inconnu.');
    const q = new URLSearchParams({ action: 'desk_widget_page', kind });
    if (opts && opts.label) q.set('label', opts.label);
    if (opts && opts.date) q.set('date', opts.date);
    return '/api.php?' + q.toString();
}

/** Une adresse est-elle la page d'un widget (et rien d'autre) ? */
function isWidgetUrl(url, origin) {
    try {
        const u = new URL(String(url));
        return u.origin === new URL(origin).origin && u.pathname === '/api.php' && u.searchParams.get('action') === 'desk_widget_page' && Object.prototype.hasOwnProperty.call(KINDS, u.searchParams.get('kind') || '');
    } catch { return false; }
}

/** La page « ↗ Aperçu » d'un site web (Mon site web), ou son aperçu en direct : isolée, sans pont vers l'application. */
function isSitePreviewUrl(url, origin) {
    try {
        const u = new URL(String(url));
        return u.origin === new URL(origin).origin && u.pathname === '/api.php' && ['website_preview', 'website_live'].includes(u.searchParams.get('action')); // l'aperçu en direct aussi
    } catch { return false; }
}

/** La place retenue, ramenée sur un écran qui existe encore ; sinon en haut à droite de l'écran principal. */
function fitBounds(saved, displays, def, index = 0) {
    const areas = (displays || []).map((d) => d.workArea).filter(Boolean);
    const main = areas[0] || { x: 0, y: 0, width: 1280, height: 800 };
    const w = Math.max(200, Math.min(900, Math.round(Number(saved && saved.width) || def.w)));
    const h = Math.max(140, Math.min(900, Math.round(Number(saved && saved.height) || def.h)));
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        const cx = saved.x + w / 2, cy = saved.y + 20;
        const on = areas.find((a) => cx >= a.x && cx <= a.x + a.width && cy >= a.y && cy <= a.y + a.height);
        if (on) return { x: Math.round(Math.min(Math.max(saved.x, on.x), on.x + on.width - w)), y: Math.round(Math.min(Math.max(saved.y, on.y), on.y + on.height - 40)), width: w, height: h };
    }
    return { x: main.x + main.width - w - 24, y: main.y + 24 + index * 40, width: w, height: h };
}

/** Les réglages de la fenêtre d'un widget : sans cadre, isolée (contextIsolation, sandbox), SANS preload ni Node. */
function windowOptions(kind, opts, bounds) {
    return {
        ...bounds, frame: false, resizable: true, minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true,
        alwaysOnTop: !!(opts && opts.onTop), show: false, title: 'LCNDA — ' + KINDS[kind].title, backgroundColor: '#fffdf8', hasShadow: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, webSecurity: true, devTools: true },
    };
}

/** Le fichier de démarrage automatique de Linux (~/.config/autostart/…desktop). */
function linuxAutostartEntry({ exec, args = [], name = 'LCNDA' }) {
    const q = (s) => /[\s"'\\$`]/.test(s) ? '"' + String(s).replace(/(["\\$`])/g, '\\$1') + '"' : String(s);
    return ['[Desktop Entry]', 'Type=Application', `Name=${name} — widgets`, `Exec=${[exec, ...args].map(q).join(' ')}`, 'X-GNOME-Autostart-enabled=true', 'NoDisplay=false', 'Comment=Les widgets de LCNDA sur le bureau', ''].join('\n');
}

module.exports = { KINDS, cleanOptions, widgetPath, isWidgetUrl, isSitePreviewUrl, fitBounds, windowOptions, linuxAutostartEntry };
